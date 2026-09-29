/*:
 * @target MZ
 * @plugindesc NPC Simulation: purchases, steal stands, capabilities and wealth
 * @author Omni-Lex
 * @base NPCSimulationCore
 * @orderAfter NPCSimulationCore
 * @orderAfter NPCSim_Minigames
 * @help
 * ============================================================================
 * NPCSim_Economy, part of the NPCSimulationCore family
 * ============================================================================
 * Owns BuyManager and the steal stands (SECTION 9b), the capability
 * simulations (SECTION 9a), WealthManager (SECTION 11a) and the NPC
 * shareholders of the stock market (SECTION 11a2, NPCSim.Stocks).
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCSim._internal and publishes its own there. Load it right after
 * NPCSim_Minigames.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const NPCSim = window.NPCSim;
  const {
    _emitItemThought, _isRoomEvent, CrimeManager, economyRng, EventBus, fmtMoney,
    InteractionScanner, MONEY_CAP, NeedManager, ShopShiftManager,
  } = NPCSim._internal;
  // Owned by modules that load after this one, bound once the family is in.
  let Addictions, Children, Gear, StoryLogger, Vehicles;
  NPCSim._internal._late.push(() => ({
    Addictions, Children, Gear, StoryLogger, Vehicles,
  } = NPCSim._internal));

  // ============================================================================
  // SECTION 9b, BUYING & STEAL EVENTS (general shop purchases, theft spots)
  // ============================================================================
  // NPCs with money buy from *any* shop-like event the per-map shop index
  // knows about, <Shop>-tagged persona counters, standard Shop Processing
  // events, and RandomDailyShop events alike. Goods come from the same
  // extraction path the player stealing system uses (ShopScanner), priced
  // from the database; stock is never decreased (it's command data, not
  // inventory). Buying from a staffed <Shop> counter warms the relationship
  // between the buyer and whichever persona is on shift right now.

  // Symmetric opinion adjustment between two named NPCs, mirrors the
  // relationships shape used across NPCSociety/NPCConversation
  // ({ opinion, meetCount }), creating missing profiles on demand.
  function bumpMutualOpinion(nameA, nameB, delta) {
    if (!nameA || !nameB || nameA === nameB) return;
    for (const [self, other] of [[nameA, nameB], [nameB, nameA]]) {
      const profile = window.NPCSocietyRegistry?.ensureProfile?.(self)
        ?? $gameSystem?._npcSociety?.[self];
      if (!profile) continue;
      profile.relationships = profile.relationships || {};
      const rel = profile.relationships[other] || { meetCount: 0, opinion: 0 };
      rel.opinion   = Math.max(-100, Math.min(100, (rel.opinion ?? 0) + delta));
      rel.meetCount = Math.min((rel.meetCount ?? 0) + 1, 999);
      profile.relationships[other] = rel;
    }
  }

  const BuyManager = {
    BUY_COOLDOWN_MIN: 60, // game minutes between purchases per NPC

    isShopIndexed(targetEvent) {
      const idx = window.NPCSystem?.getShopIndex?.($gameMap?.mapId()) || [];
      const evId = targetEvent.eventId();
      return idx.some(e => e.eventId === evId);
    },

    tryBuy(name, profile, targetEvent) {
      if (!window.ShopScanner) return;
      // A beast buys nothing: it holds no euros (NPCCreature.mayHoldMoney).
      if (window.NPCCreature?.mayHoldMoney?.(profile, name) === false) return;

      // The event's own coordinates always satisfy the daily-shop proximity
      // gate, so goods resolve no matter where the player is standing.
      let goods = [];
      try { goods = window.ShopScanner.extractShopItems(targetEvent, targetEvent.x, targetEvent.y) || []; } catch (_) {}
      goods = goods.filter(i => i?.data && i.data.price > 0);
      if (!goods.length) return;

      const minute = $gameVariables?.value(114) ?? 0;
      const money  = profile.money ?? 0;
      const onCooldown = minute - (profile._lastBuyMinute ?? -Infinity) < this.BUY_COOLDOWN_MIN;
      const affordable = goods.filter(i => i.data.price <= money * 0.5 && this.wants(profile, i, name));
      const _buyRng = economyRng(name, "buy", minute);

      if (!onCooldown && money > 0 && affordable.length) {
        // A craving that bites buys what feeds it (SECTION 11b5b).
        const pick = Addictions.pickFix(profile, name, affordable) ||
          affordable[Math.floor(_buyRng.next() * affordable.length)];
        profile._lastBuyMinute = minute;
        profile.money = Math.max(0, money - pick.data.price);
        this.take(profile, pick);
        StoryLogger.record(name, "shopping", 'NPCSim.log.bought', { item: pick.data.name, price: fmtMoney(pick.data.price) });
        // Personality-flavored reaction to the new purchase (shown as a bubble),
        // or the addict's own words when it was a fix.
        const fixKey = Addictions.fixKey(profile, pick.data);
        if (!fixKey || !Addictions.say(profile, "buy", fixKey, { item: pick.data.name })) _emitItemThought(profile, pick.data, "buy");

        // A sale warms the buyer ↔ shopkeeper relationship. Whoever is behind
        // the counter: the covering persona on a rota till, otherwise the
        // event's own keeper (a Shop event with a face of its own is one
        // named person, always on duty), provided they are a real citizen.
        const persona = ShopShiftManager.getActivePersona($gameMap.mapId(), targetEvent.eventId());
        const keeper  = persona?.name || (targetEvent.event()?.name || "").trim();
        if (keeper && keeper !== name && $gameSystem?._npcSociety?.[keeper]) {
          bumpMutualOpinion(name, keeper, 2);
        }
        EventBus.emit("npc:capability_end", {
          name, capabilityId: "shop_counter",
          outcome: { itemGain: pick.id, cost: pick.data.price },
        });
        return;
      }

      // Didn't buy (broke, everything too dear, or bought recently), window
      // shop instead: form an opinion about a displayed item.
      const item = goods[Math.floor(_buyRng.next() * goods.length)];
      _emitItemThought(profile, item.data, "browse");
    },

    // Whether this person would take a shop entry ({type, id, data}, the
    // ShopScanner shape): an item their diet allows, or a weapon or armour
    // that betters what they wear in that slot (SECTION 11b5). A bike or a
    // broom only for somebody with nothing to ride (SECTION 11b6).
    wants(profile, entry, name) {
      if (!entry?.data) return false;
      const type = entry.type || "item"; // i18n-ignore: item kind
      if (type === "item") {             // i18n-ignore: item kind
        // Never the Liminal cuffs (the camper), never somebody's car keys:
        // the keys come with a parked car, not off a shelf (NPCShared).
        const shared = window.NPCShared;
        const itemId = entry.id ?? entry.data.id;
        if (shared?.isForbiddenItem?.(itemId) || shared?.isCarKeys?.(itemId)) return false;
        if (Vehicles.kindOfItem(entry.id ?? entry.data.id)) return Vehicles.wantsVehicle(profile, name, entry.id ?? entry.data.id);
        const Diet = window.NPCShared?.Diet;
        return (!Diet || Diet.allows(profile, entry.data)) && Addictions.allows(profile, entry.data, name);
      }
      return Gear.wouldUpgrade(profile, type, entry.data);
    },

    // Puts a bought or stolen entry where it belongs: an item in the hand
    // (itemIds, capped), a weapon or armour on the body. A weapon id is never
    // an item id, so it never lands in itemIds.
    take(profile, entry) {
      if (!profile || !entry?.data) return false;
      const type = entry.type || "item"; // i18n-ignore: item kind
      if (type !== "item") return Gear.wear(profile, type, entry.data); // i18n-ignore: item kind
      if (window.NPCShared?.isForbiddenItem?.(entry.id ?? entry.data.id)) return false;
      profile.itemIds = Array.isArray(profile.itemIds) ? profile.itemIds : [];
      profile.itemIds.push(entry.id);
      window.NPCShared?.capItemIds?.(profile);
      return true;
    },
  };

  EventBus.on("npc:interact", ({ name, targetEvent }) => {
    if (!targetEvent) return;
    const evName = (targetEvent.event()?.name || "").trim().toLowerCase();
    if (evName === "steal") return; // theft spots resolve below, never as purchases
    const profile = $gameSystem?._npcSociety?.[name];
    if (!profile) return;
    if (!BuyManager.isShopIndexed(targetEvent)) return;
    BuyManager.tryBuy(name, profile, targetEvent);
  });

  // "Steal"-named events (displayed goods): when an NPC walks up to one, what
  // happens depends on their morality. A willing thief (morality < -30) makes
  // a theft attempt, failure lands on their own criminal record / bounty via
  // CrimeManager. A law-abiding customer doesn't take anything; they just look
  // the item over and form a personality-flavored opinion about it (bubble).
  EventBus.on("npc:interact", ({ name, targetEvent }) => {
    if (!targetEvent) return;
    if ((targetEvent.event()?.name || "").trim().toLowerCase() !== "steal") return;
    const profile = $gameSystem?._npcSociety?.[name];
    if (!profile) return;
    if ((profile.moralityScore ?? 0) < -30) {
      CrimeManager.attemptTheftFromEvent(name, profile, targetEvent);
    } else {
      const item = CrimeManager.peekStealItem(targetEvent);
      if (item?.data) _emitItemThought(profile, item.data, "browse");
    }
  });

  // ============================================================================
  // SECTION 9a, CAPABILITY SIMULATIONS (cooking, containers, rentals)
  // ============================================================================
  // "Safe execution" per docs/npc_event_interaction_design_en.md §5.1: rather
  // than calling the player-facing plugin commands (which open scenes and
  // mutate $gameParty), each listener replicates that command's documented
  // effect directly on the NPC's own profile, exactly like JobManager /
  // CrimeManager / the SECTION 9 shopping handler already do off-screen.

  function _foodNote(item, key, fallback) {
    return parseInt((item?.note || "").match(new RegExp(`<${key}:\\s*(\\d+)>`, "i"))?.[1] || fallback);
  }

  // Cooking station: combine two carried food items using CookingSystem's
  // documented formula (first item's calories ×2, plus the second's), see
  // CookingSystem.js:222-241, then feed the NPC and discard the ingredients.
  EventBus.on("npc:interact", ({ name, targetEvent }) => {
    const evName = (targetEvent?.event()?.name || "").toLowerCase();
    if (!evName.includes("stove") && !evName.includes("kitchen") && !evName.includes("cooking")) return;
    const profile = $gameSystem?._npcSociety?.[name];
    if (!profile) return;

    const foodIds = (profile.itemIds || []).filter(id => {
      const it = $dataItems[id];
      return it && /<Category:\s*Food>/i.test(it.note || "");
    });
    if (foodIds.length < 2) return;

    const [id1, id2] = foodIds;
    const item1 = $dataItems[id1], item2 = $dataItems[id2];
    const totalCalories = _foodNote(item1, "calories", "20") * 2 + _foodNote(item2, "calories", "20");

    const removeOnce = id => { const i = profile.itemIds.indexOf(id); if (i >= 0) profile.itemIds.splice(i, 1); };
    removeOnce(id1);
    removeOnce(id2);

    NeedManager.feed(profile, totalCalories);
    StoryLogger.record(name, "cooking", 'NPCSim.log.cooked', { a: item1.name, b: item2.name });
    EventBus.emit("npc:capability_end", { name, capabilityId: "cooking_station", outcome: { hungerGain: totalCalories * 0.10 } });
  });

  // Container: NPC searches it for spare valuables. Outcome is bounded and
  // morality-gated so this can't become a free, repeatable money faucet,
  // it mirrors CrimeManager.attemptTheft's bookkeeping (item gain + morality
  // delta + story log) rather than ContainerSystem's player loot-roll UI.
  EventBus.on("npc:interact", ({ name, targetEvent }) => {
    const evName = (targetEvent?.event()?.name || "").toLowerCase();
    if (!evName.includes("container") && !evName.includes("chest") && !evName.includes("storage")) return;
    const profile = $gameSystem?._npcSociety?.[name];
    if (!profile || (profile.moralityScore ?? 0) >= -20) return; // only NPCs willing to rummage through others' property
    if (window.NPCCreature?.mayHoldMoney?.(profile, name) === false) return;

    const _rummageRng = economyRng(name, "container");
    if (_rummageRng.next() < 0.4) {
      const found = 50 + Math.floor(_rummageRng.next() * 200);
      profile.money = Math.min(MONEY_CAP, (profile.money || 0) + found);
      StoryLogger.record(name, "shopping", 'NPCSim.log.foundInContainer', { amount: fmtMoney(found) });
      EventBus.emit("npc:capability_end", { name, capabilityId: "container", outcome: { moneyGain: found } });
    }
  });

  // Rentable room: a paid night, taken through RentSystem itself rather than
  // simulated beside it. The room has to actually be FREE (the party may be in
  // it, or another NPC may have taken it an hour ago) and the NPC pays the
  // price that room asks, out of their own purse. Taking it puts it off the
  // market for the night, so a town with three beds cannot put a hundred
  // people up in them.
  EventBus.on("npc:interact", ({ name, targetEvent }) => {
    if (!_isRoomEvent(targetEvent)) return;
    const profile = $gameSystem?._npcSociety?.[name];
    if (!profile || !window.RentSystem) return;
    if (window.NPCCreature?.mayHoldMoney?.(profile, name) === false) return;

    const mapId = $gameMap?.mapId();
    const eventId = targetEvent.eventId();
    const price = window.RentSystem.priceOf(mapId, eventId);
    if (!window.RentSystem.isFree(mapId, eventId)) return;
    if ((profile.money ?? 0) < price) return;
    if (!window.RentSystem.rentForNPC(name, mapId, eventId, profile.money)) return;

    profile.money -= price;
    profile.sleep = 100;
    StoryLogger.record(name, "renting", 'NPCSim.log.rentedRoom', { price: fmtMoney(price) });
    EventBus.emit("npc:capability_end", { name, capabilityId: "rentable_room", outcome: { sleepGain: 100, cost: price } });
  });

  // Hives are minded through NPCSim.Tending, which works the colony through
  // ApiarySystem itself; nothing here pays for a visit to one.

  // Bank: broke NPCs take out a small loan, flush NPCs make a deposit and
  // collect interest later, mirrors BankLoanSystem's two-sided pockets
  // without opening the player-facing menu.
  EventBus.on("npc:interact", ({ name, targetEvent }) => {
    const evName = (targetEvent?.event()?.name || "").toLowerCase();
    if (!evName.includes("bank")) return;
    const profile = $gameSystem?._npcSociety?.[name];
    if (!profile) return;
    // No loan and no deposit for a beast (NPCCreature.mayHoldMoney).
    if (window.NPCCreature?.mayHoldMoney?.(profile, name) === false) return;

    const money = profile.money ?? 0;
    if (money < 100) {
      const loan = 150 + Math.floor((profile.wealthTierBase ?? 0) * 50);
      profile.money = Math.min(MONEY_CAP, money + loan);
      StoryLogger.record(name, "banking", 'NPCSim.log.tookLoan', { amount: fmtMoney(loan) });
      EventBus.emit("npc:capability_end", { name, capabilityId: "bank", outcome: { moneyGain: loan, loan: true } });
    } else if (money > 5000) {
      const deposit = Math.floor(money * 0.2);
      profile.money -= deposit;
      StoryLogger.record(name, "banking", 'NPCSim.log.deposited', { amount: fmtMoney(deposit) });
      EventBus.emit("npc:capability_end", { name, capabilityId: "bank", outcome: { moneyLoss: deposit, deposit: true } });
    }
  });

  // Real estate office: wealthy NPCs collect passive rental income,
  // mirrors RealEstateMarket.checkDailyIncome's payout without the menu UI.
  EventBus.on("npc:interact", ({ name, targetEvent }) => {
    const evName = (targetEvent?.event()?.name || "").toLowerCase();
    if (!evName.includes("realestate") && !evName.includes("property")) return;
    const profile = $gameSystem?._npcSociety?.[name];
    if (!profile || (profile.wealthTierBase ?? 0) < 3) return;
    if (window.NPCCreature?.mayHoldMoney?.(profile, name) === false) return;

    const income = 100 + Math.floor((profile.wealthTierBase ?? 0) * 80 * economyRng(name, "realty").next());
    profile.money = Math.min(MONEY_CAP, (profile.money || 0) + income);
    StoryLogger.record(name, "realty", 'NPCSim.log.rentalIncome', { amount: fmtMoney(income) });
    EventBus.emit("npc:capability_end", { name, capabilityId: "real_estate_office", outcome: { moneyGain: income } });
  });

  // Stock exchange: a real trade at the terminal's price, in shares that come
  // out of (and go back to) the company's float (SECTION 11a2). Gated to NPCs
  // with the means or aptitude (wealth tier, or arcane/substance stats), or
  // to anybody who already holds something to sell.
  EventBus.on("npc:interact", ({ name, targetEvent }) => {
    const evName = (targetEvent?.event()?.name || "").toLowerCase();
    if (!evName.includes("stockmarket") && !evName.includes("exchange")) return;
    const profile = $gameSystem?._npcSociety?.[name];
    if (!profile) return;
    if (window.NPCCreature?.mayHoldMoney?.(profile, name) === false) return;
    const arcaneOrSubstance = (profile.arcane ?? 0) + (profile.substance ?? 0);
    const holds = !!profile.shareholdings && Object.keys(profile.shareholdings).length > 0;
    if (!holds && (profile.wealthTierBase ?? 0) < 2 && arcaneOrSubstance < 10) return;
    Stocks.trade(name, profile);
  });

  // What the society spends and saves is what the market prices: every
  // purchase (a shop, a room) feeds the consumer houses, every deposit the bank.
  EventBus.on("npc:capability_end", ({ outcome }) => {
    const M = window.StockSociety;
    if (!M || !outcome) return;
    if (outcome.cost > 0) M.note("spend", outcome.cost);
    if (outcome.deposit && outcome.moneyLoss > 0) M.note("savings", outcome.moneyLoss);
  });

  // ============================================================================
  // SECTION 11a, WEALTH MANAGER
  // ============================================================================
  // Upgrades (or downgrades) the NPC's home pool tier as their money changes.

  // The villas pool belongs to the patron vaults now, so it is no longer a
  // wealth tier: money moves an NPC from a house straight into a high-rise.
  const WEALTH_THRESHOLDS = [
    { pool: "houses",      max: 60000  },
    { pool: "skyscrapers", max: Infinity },
  ];

  const WealthManager = {
    maybeUpgrade(profile) {
      const money = profile.money || 0;
      let targetPool = "houses";
      for (const tier of WEALTH_THRESHOLDS) {
        if (money <= tier.max) { targetPool = tier.pool; break; }
      }
      if (profile.homePoolType !== targetPool) {
        profile.homePoolType = targetPool;
        // Home building is permanent, wealth only changes the pool label,
        // not which physical door the NPC sleeps behind.
        StoryLogger.record(profile._eventName, "wealth", 'NPCSim.log.movedHome', { home: T('NPCSim.homePool.' + targetPool), saved: fmtMoney(money) });
      }
    },
  };

  // ============================================================================
  // SECTION 11a2, SHAREHOLDERS (the society's stake in the stock market)
  // ============================================================================
  // Company shares held by NPCs, at the stock terminal's own prices
  // (window.StockSociety, StockMarketSystem.js). OIL and SOUL are commodities
  // and are never held here.
  //
  //   profile.shareholdings = { <companyKey>: { shares, basis } }  basis in gold
  //
  // Who holds is rolled once per profile (Dev.ensure, the _stocksV stamp): a
  // CEO-class NPC most of the time, with the largest positions and a lean to
  // the sector of their job; the wealthy now and then; the poor almost never;
  // a child or a beast never (NPCCreature is the sentience answer). A child
  // is rolled when they come of age.
  //
  // The float is conserved: a seeded or bought position only ever takes
  // from what nobody holds (party, scenario stakes such as the CEO origin's
  // LimeCorp grant, and the other NPCs), and a stake granted to the party
  // afterwards dilutes the NPCs (trimTo). Dividends are paid on the party's
  // formula into profile.money (capped at MONEY_CAP); the shares pass to kin
  // on death, or back to the float. Shares are never loot.
  const STOCKS_V = 1;
  const Stocks = {
    STOCKS_V,
    // The share of each kind of person who holds stock at all.
    RATES: { ceo: 0.75, 4: 0.30, 3: 0.27, 2: 0.06, 1: 0.05, 0: 0 },
    // What a seeded portfolio is worth, in gold (10000 gold = 100 euros).
    VALUE: {
      ceo: [2000000, 20000000],
      4: [500000, 4000000],
      3: [100000, 1000000],
      2: [10000, 150000],
      1: [10000, 100000],
    },
    // How many companies a seeded portfolio spreads over.
    POSITIONS: { ceo: 3, rich: 2, other: 1 },
    // A CEO's first position is in their own trade's sector this often.
    OWN_SECTOR: 0.7,
    // The job category a trade belongs to, as a market sector.
    JOB_SECTOR: {
      Labor: "industrial", Social: "consumertech", Technical: "telecom",
      Magical: "occult", Combat: "energy", Criminal: "occult",
      General: "transport", Faction: "finance",
    },
    TRADES_PER_DAY: 2,     // trades one NPC may make in a game day
    PANIC_BELOW: 200,      // gold on hand under which a holder sells
    DIP_BELOW: 0.95,       // price under this share of fair value is a dip
    RICH_ABOVE: 1.10,      // and over this share, dear enough to take profit
    DIP_TRAITS: ["brave", "bold", "greedy", "ambitious", "reckless", "confident", "optimis", "gambl", "risk"],
    NERVOUS_TRAITS: ["anxious", "coward", "nervous", "paranoid", "pessimis", "timid", "fear"],

    _ceoId: undefined,
    _tally: null,

    // The market, when it trades in this world; null otherwise.
    market() {
      const M = window.StockSociety;
      return M && typeof M.isOpen === "function" && M.isOpen() ? M : null;
    },

    // The CEO class id, found by name in $dataClasses (6 in the shipped data).
    ceoClassId() {
      if (this._ceoId !== undefined) return this._ceoId;
      const list = (typeof $dataClasses !== "undefined" && Array.isArray($dataClasses)) ? $dataClasses : null;
      if (!list) return 6;
      const hit = list.find(c => c && String(c.name || "").trim().toUpperCase() === "CEO"); // i18n-ignore: class name
      this._ceoId = hit ? hit.id : 6;
      return this._ceoId;
    },

    isCeo(profile) { return !!profile && Number(profile.assignedClassId) === this.ceoClassId(); },

    tierOf(profile) { return Math.max(0, Math.min(4, Math.floor(Number(profile?.wealthTierBase) || 0))); },

    // Whether this person may hold shares at all.
    mayHold(profile, name, minor) {
      if (!profile || profile._killed) return false;
      if (window.NPCCreature?.isNonSentientProfile?.(profile)) return false;
      if (window.NPCCreature?.mayHoldMoney?.(profile, name) === false) return false;
      const isMinor = minor !== undefined ? !!minor : !!Children?.isMinor?.(profile, name);
      if (isMinor) return false;
      const WM = window.NPCShared?.WorldModes;
      if (WM && typeof WM.hasEconomy === "function" && !WM.hasEconomy()) return false;
      return true;
    },

    _traitNames(profile) {
      const tn = NPCSim._internal.traitNameLower;
      if (typeof tn !== "function") return [];
      return (profile.traitIds || []).map(id => { try { return String(tn(id) || ""); } catch (e) { return ""; } });
    },
    _hasTrait(profile, words) {
      const names = this._traitNames(profile);
      return names.some(n => words.some(w => n.includes(w)));
    },

    // The sector of this person's trade, or null.
    sectorOf(profile) {
      const JM = NPCSim._internal.JobManager;
      let job = null;
      try { job = JM?.getJob?.(profile) || null; } catch (e) { job = null; }
      return (job && this.JOB_SECTOR[job.category]) || null;
    },

    // Rolls the portfolio, once. Answers false (nothing stamped) while there
    // is no market to price it, so the next look tries again.
    ensure(profile, name, minor) {
      if (!profile) return false;
      const M = this.market();
      if (!M) return false;
      const listings = M.listings() || [];
      if (!listings.length) return false;
      profile._stocksV = STOCKS_V;
      profile._stocksChild = !!minor;
      if (profile._stocksRolled || !this.mayHold(profile, name, minor)) return true;
      profile._stocksRolled = true;
      const rng = economyRng(name, "stocks", 0);
      const ceo = this.isCeo(profile);
      const tier = this.tierOf(profile);
      const rate = ceo ? this.RATES.ceo : (this.RATES[tier] || 0);
      if (!(rng.next() < rate)) return true;
      const band = ceo ? this.VALUE.ceo : this.VALUE[tier];
      if (!band) return true;
      const worth = band[0] + (band[1] - band[0]) * rng.next();
      const count = Math.min(listings.length, ceo ? this.POSITIONS.ceo : tier >= 3 ? this.POSITIONS.rich : this.POSITIONS.other);
      const pool = listings.slice();
      const picks = [];
      const own = this.sectorOf(profile);
      if (own && (!ceo || rng.next() < this.OWN_SECTOR)) {
        const mine = pool.filter(l => l.sector === own);
        if (mine.length) picks.push(mine[Math.floor(rng.next() * mine.length)]);
      }
      while (picks.length < count && pool.length) {
        const i = Math.floor(rng.next() * pool.length);
        const l = pool.splice(i, 1)[0];
        if (!picks.includes(l)) picks.push(l);
      }
      // The first pick carries the most: half the money, the rest shared out.
      picks.forEach((l, i) => {
        const share = picks.length === 1 ? 1 : i === 0 ? 0.5 : 0.5 / (picks.length - 1);
        const price = M.priceOf(l.key);
        if (!(price > 0)) return;
        const want = Math.floor((worth * share) / price);
        const take = Math.min(want, Math.max(0, Math.floor(M.freeFloat(l.key))));
        if (take > 0) this._add(profile, name, l.key, take, take * price);
      });
      return true;
    },

    // The shares every NPC holds, per company, counted once a game day (and
    // after a load or a new game) and kept up to date in between.
    _ensureTally() {
      const sys = (typeof $gameSystem !== "undefined") ? $gameSystem : null;
      const day = Math.floor((($gameVariables?.value?.(114)) || 0) / 1440);
      const t = this._tally;
      if (t && t.sys === sys && t.day === day) return t;
      const fresh = { sys, day, byKey: Object.create(null), holders: new Set() };
      const society = sys?._npcSociety || {};
      for (const n of Object.keys(society)) {
        const h = society[n]?.shareholdings;
        if (!h || society[n]._killed) continue;
        let any = false;
        for (const key of Object.keys(h)) {
          const sh = Math.max(0, Math.floor(Number(h[key]?.shares) || 0));
          if (sh <= 0) continue;
          fresh.byKey[key] = (fresh.byKey[key] || 0) + sh;
          any = true;
        }
        if (any) fresh.holders.add(n);
      }
      this._tally = fresh;
      return fresh;
    },

    // Forget the count (a test, a load); it is rebuilt on the next read.
    invalidate() { this._tally = null; },

    // Shares of a company held by NPCs.
    heldBy(key) { return this._ensureTally().byKey[key] || 0; },

    // Names of everybody holding anything.
    holders() { return Array.from(this._ensureTally().holders); },

    // A person's positions: [{ key, shares, basis }].
    holdingsOf(profile) {
      const h = profile?.shareholdings;
      if (!h) return [];
      return Object.keys(h).map(key => ({ key, shares: h[key].shares || 0, basis: h[key].basis || 0 }))
        .filter(p => p.shares > 0);
    },

    // What a person's shares are worth today, in gold.
    worthOf(profile) {
      const M = window.StockSociety;
      if (!M) return 0;
      let v = 0;
      for (const p of this.holdingsOf(profile)) v += p.shares * (M.priceOf(p.key) || 0);
      return v;
    },

    // Moves `delta` shares of `key` in or out of a person's hands, with the
    // count kept in step.
    _add(profile, name, key, delta, basisDelta) {
      if (!profile || !key || !delta) return 0;
      const tally = this._ensureTally();
      const h = profile.shareholdings || (profile.shareholdings = {});
      const cur = h[key] || { shares: 0, basis: 0 };
      const before = cur.shares;
      cur.shares = Math.max(0, Math.floor(before + delta));
      const moved = cur.shares - before;
      if (moved < 0 && before > 0) cur.basis = Math.round(cur.basis * (cur.shares / before));
      else cur.basis = Math.max(0, Math.round(cur.basis + (basisDelta || 0)));
      if (cur.shares > 0) h[key] = cur;
      else delete h[key];
      if (!Object.keys(h).length) delete profile.shareholdings;
      tally.byKey[key] = Math.max(0, (tally.byKey[key] || 0) + moved);
      const n = name || profile._eventName;
      if (n) {
        if (profile.shareholdings) tally.holders.add(n);
        else tally.holders.delete(n);
      }
      return moved;
    },

    // Dilutes the NPC holders of `key` down to `room` shares in all, the
    // largest positions first in proportion. Used when the party is granted
    // a stake the float no longer has room for.
    trimTo(key, room) {
      const tally = this._ensureTally();
      const held = tally.byKey[key] || 0;
      if (held <= room) return 0;
      const society = $gameSystem?._npcSociety || {};
      const factor = Math.max(0, room) / held;
      let cut = 0;
      for (const n of Array.from(tally.holders)) {
        const p = society[n];
        const sh = p?.shareholdings?.[key]?.shares || 0;
        if (sh <= 0) continue;
        const keep = Math.floor(sh * factor);
        cut += sh - keep;
        this._add(p, n, key, keep - sh, 0);
      }
      return cut;
    },

    // Every holder's dividend for `days`: perShareFn(key, shares) answers what
    // that stake pays a day, in gold. Answers the total paid.
    payDividends(days, perShareFn) {
      if (!(days > 0) || typeof perShareFn !== "function") return 0;
      const society = $gameSystem?._npcSociety || {};
      let total = 0;
      for (const n of this.holders()) {
        const p = society[n];
        if (!p || p._killed) continue;
        // No dividend is ever paid to a beast (NPCCreature.mayHoldMoney).
        if (window.NPCCreature?.mayHoldMoney?.(p, n) === false) continue;
        let gold = 0;
        for (const pos of this.holdingsOf(p)) gold += Math.max(0, Number(perShareFn(pos.key, pos.shares)) || 0) * days;
        gold = Math.floor(gold);
        if (gold <= 0) continue;
        const room = Math.max(0, MONEY_CAP - (p.money || 0));
        const paid = Math.min(room, gold);
        if (paid > 0) { p.money = (p.money || 0) + paid; total += paid; }
      }
      return total;
    },

    // Who inherits: a partner, then a grown child, then a parent, then any
    // other kin. Alive, grown, sentient and with a profile to hold them.
    heirOf(name, record) {
      const Life = window.NPCLifeSim;
      const society = $gameSystem?._npcSociety || {};
      const kin = record?.kin || {};
      const partners = (Array.isArray(record?.partners) && record.partners.length ? record.partners : (record?.partner ? [record.partner] : []))
        .map(p => (typeof p === "string" ? p : p?.name)).filter(Boolean);
      const byRole = (role) => Object.keys(kin).filter(n => kin[n] === role);
      const order = partners.concat(byRole("parent"), byRole("child"), Object.keys(kin));
      const seen = new Set();
      for (const n of order) {
        if (!n || n === name || seen.has(n)) continue;
        seen.add(n);
        if (Life?.isDead?.(n)) continue;
        const p = society[n] || window.NPCSocietyRegistry?.ensureProfile?.(n) || null;
        if (!p) continue;
        if (!this.mayHold(p, n)) continue;
        return { name: n, profile: p };
      }
      return null;
    },

    // A death: the shares pass to the heir, or back to the float.
    onDeath(name, record) {
      const profile = $gameSystem?._npcSociety?.[name];
      const positions = this.holdingsOf(profile);
      if (!positions.length) return null;
      const heir = this.heirOf(name, record);
      for (const pos of positions) {
        this._add(profile, name, pos.key, -pos.shares, 0);
        if (heir) this._add(heir.profile, heir.name, pos.key, pos.shares, pos.basis);
      }
      if (heir) StoryLogger?.record?.(heir.name, "investing", 'NPCSim.log.stocksInherited', { name });
      return heir ? heir.name : null;
    },

    // One visit to the exchange: a panic sale when the purse is low, a dip
    // bought by a bold hand, profit taken on a dear holding, or a plain buy
    // into the trade they know. Bounded per person per game day.
    trade(name, profile) {
      const M = this.market();
      if (!M || !this.mayHold(profile, name)) return null;
      const minute = $gameVariables?.value(114) ?? 0;
      const day = Math.floor(minute / 1440);
      if (profile._stockDay !== day) { profile._stockDay = day; profile._stockTrades = 0; }
      if ((profile._stockTrades || 0) >= this.TRADES_PER_DAY) return null;
      const rng = economyRng(name, "stock", minute);
      const money = Math.max(0, profile.money || 0);
      const held = this.holdingsOf(profile);
      const nervous = this._hasTrait(profile, this.NERVOUS_TRAITS);
      const bold = this._hasTrait(profile, this.DIP_TRAITS);
      const stake = 5000 + this.tierOf(profile) * 10000 + (this.isCeo(profile) ? 50000 : 0);
      let out = null;

      const sell = (pos, share) => {
        const price = M.priceOf(pos.key);
        if (!(price > 0)) return null;
        const room = Math.max(0, MONEY_CAP - money);
        const count = Math.min(Math.max(1, Math.ceil(pos.shares * share)), pos.shares, Math.floor(room / price));
        if (count <= 0) return null;
        const basis = pos.shares > 0 ? pos.basis * (count / pos.shares) : 0;
        this._add(profile, name, pos.key, -count, 0);
        profile.money = Math.min(MONEY_CAP, money + count * price);
        return { side: "sell", key: pos.key, shares: count, price, pnl: Math.round(count * price - basis) };
      };
      const buy = (key) => {
        const price = M.priceOf(key);
        if (!(price > 0)) return null;
        const count = Math.min(Math.floor(Math.min(stake, money) / price), Math.floor(M.freeFloat(key)));
        if (count <= 0) return null;
        this._add(profile, name, key, count, count * price);
        profile.money = Math.max(0, money - count * price);
        return { side: "buy", key, shares: count, price, pnl: 0 };
      };

      const panicAt = this.PANIC_BELOW * (nervous ? 2 : 1);
      if (money < panicAt && held.length) {
        const biggest = held.slice().sort((a, b) => b.shares * M.priceOf(b.key) - a.shares * M.priceOf(a.key))[0];
        out = sell(biggest, 0.25 + rng.next() * 0.25);
      } else {
        const listings = M.listings() || [];
        const dips = listings.filter(l => l.centre > 0 && l.price < l.centre * this.DIP_BELOW);
        const dear = held.filter(p => { const c = M.centreOf(p.key); return c > 0 && M.priceOf(p.key) > c * this.RICH_ABOVE; });
        const dipOdds = bold ? 0.8 : nervous ? 0.1 : 0.35;
        if (dips.length && money >= stake * 0.5 && rng.next() < dipOdds) {
          out = buy(dips[Math.floor(rng.next() * dips.length)].key);
        } else if (dear.length && rng.next() < (nervous ? 0.8 : 0.5)) {
          out = sell(dear[Math.floor(rng.next() * dear.length)], 0.3 + rng.next() * 0.3);
        } else if (money >= stake * 2 && rng.next() < 0.3) {
          const own = this.sectorOf(profile);
          const mine = listings.filter(l => l.sector === own);
          const from = mine.length ? mine : listings;
          if (from.length) out = buy(from[Math.floor(rng.next() * from.length)].key);
        }
      }
      if (!out) return null;
      profile._stockTrades = (profile._stockTrades || 0) + 1;
      const company = M.listings().find(l => l.key === out.key)?.name || out.key;
      if (out.side === "buy") {
        StoryLogger.record(name, "investing", 'NPCSim.log.stocksBought', { shares: out.shares, company, amount: fmtMoney(out.shares * out.price) });
        EventBus.emit("npc:capability_end", { name, capabilityId: "stock_exchange", outcome: { moneyLoss: out.shares * out.price, shares: out.shares, company: out.key } });
      } else {
        const gain = out.pnl >= 0;
        StoryLogger.record(name, "investing", gain ? 'NPCSim.log.stocksGain' : 'NPCSim.log.stocksLoss', { amount: fmtMoney(Math.abs(out.pnl)) });
        EventBus.emit("npc:capability_end", { name, capabilityId: "stock_exchange", outcome: { moneyGain: out.shares * out.price, shares: -out.shares, company: out.key } });
      }
      return out;
    },

    // "LimeCorp (€1,240.00), HyperNet Systems (€310.00)": the holdings as the
    // Empathize dossier prints them, largest first. Empty when none.
    describe(profile) {
      const M = window.StockSociety;
      const rows = this.holdingsOf(profile).map(p => {
        const l = M?.listings?.().find(x => x.key === p.key);
        const value = p.shares * (M?.priceOf?.(p.key) || 0);
        return { name: l?.name || p.key, value };
      }).sort((a, b) => b.value - a.value);
      return rows;
    },
  };

  Object.assign(NPCSim._internal, {
    _foodNote, bumpMutualOpinion, BuyManager, Stocks, WEALTH_THRESHOLDS, WealthManager,
  });
})();
