/*:
 * @target MZ
 * @plugindesc NPC Simulation: bikes, brooms and own cars
 * @author Omni-Lex
 * @base NPCSimulationCore
 * @orderAfter NPCSimulationCore
 * @orderAfter NPCSim_Addictions
 * @help
 * ============================================================================
 * NPCSim_Vehicles, part of the NPCSimulationCore family
 * ============================================================================
 * Owns Vehicles (SECTION 11b6).
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCSim._internal and publishes its own there. Load it right after
 * NPCSim_Addictions.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const NPCSim = window.NPCSim;
  const {
    Children, MiniRng, nameHash, Specs,
  } = NPCSim._internal;

  // ============================================================================
  // SECTION 11b6, BIKES AND BROOMS (NPCSim.Vehicles)
  // ============================================================================
  // Only a person who CARRIES a bike or a broom (the item in profile.itemIds)
  // can ride one. The first one is rolled once per profile (the `_vehRolled`
  // flag under the `_vehV` stamp) off their wealth tier and whether their
  // class is a caster's, and put straight into their hand:
  //
  //   who                                  tier 0   1    2    3    4
  //   magical class: a broom                .25   .40  .55  .65  .70
  //   magical class without one: a bike     .15   .22  .25  .20  .12
  //   mundane class: a bike                 .30   .45  .50  .40  .25
  //
  // The rich own fewer bikes because they are driven. Children and beasts own
  // nothing and never ride; a child is rolled on coming of age. After that the
  // hand is the whole truth: a looted or stolen bike is a lost ride, a bought
  // or stolen one a new ride (BuyManager.wants asks wantsVehicle), and the cap
  // on what a person carries never throws one away (NPCShared.capItemIds).
  // What they RIDE is asked of vehicleOf: of the kinds carried, a caster takes
  // the broom and anybody else the bike, and the world's magic sits on top of
  // the item itself: a severed world has no brooms, an unbound one no bikes
  // (window.MagicNature).
  //
  // A CAR is the same rule with the Utilitarian car keys (item 164,
  // NPCShared.isCarKeys) as the item. Owning one is rolled ONCE per profile
  // (the `_carRolled` stamp, seeded on the name and the world) off their
  // wealth tier, and halved for somebody out of work (currentJobId 0):
  //
  //   tier            0     1     2     3     4
  //   owns a car     .05   .15   .35   .60   .80
  //
  // An owner is stamped `_carOwner` and has the keys put in the hand.
  // Children and beasts own none (a child is rolled on coming of age). The
  // only other way to become an owner is RoadCarAI's capped top-up, when a
  // square has no free owner at all to put at a wheel. A sentient adult with
  // the keys in the hand has a car: vehicleOf answers "car" before a bike or a
  // broom, ridesOf answers every kind they could take on a trip, and losing
  // the keys (looted, pickpocketed, the car stolen) loses the car with them.
  const VEH_V = 2;
  // i18n-ignore-start: vehicle ids
  const VEHICLE_BIKE = "bike";
  const VEHICLE_BROOM = "broom";
  const VEHICLE_CAR = "car";
  // i18n-ignore-end
  const VEHICLE_ITEM = { bike: 131, broom: 168 };
  const BROOM_ODDS = [0.25, 0.40, 0.55, 0.65, 0.70];
  const CASTER_BIKE_ODDS = [0.15, 0.22, 0.25, 0.20, 0.12];
  const BIKE_ODDS = [0.30, 0.45, 0.50, 0.40, 0.25];
  const CAR_ODDS = [0.05, 0.15, 0.35, 0.60, 0.80];
  const CAR_JOBLESS_FACTOR = 0.5;

  const Vehicles = {
    VEH_V,
    BROOM_ODDS,
    CASTER_BIKE_ODDS,
    BIKE_ODDS,
    ITEM: VEHICLE_ITEM,
    CAR: VEHICLE_CAR,
    CAR_ODDS,

    // Is this class a caster's? The class entry's own `<Nature: Magical>`.
    isMagicalClass(classId) {
      const data = typeof $dataClasses !== "undefined" && $dataClasses ? $dataClasses[Number(classId)] : null;
      const MN = window.MagicNature;
      return !!(data && MN?.isMagicalData?.(data));
    },

    // "bike", "broom" or null for an item id (NPCShared.vehicleKindOf).
    kindOfItem(itemId) {
      const shared = window.NPCShared?.vehicleKindOf;
      if (shared) return shared(itemId);
      const id = Number(itemId);
      return id === VEHICLE_ITEM.bike ? VEHICLE_BIKE : id === VEHICLE_ITEM.broom ? VEHICLE_BROOM : null;
    },

    // Does the world's magic let this item be ridden?
    allowsItem(itemId) {
      const MN = window.MagicNature;
      return !(MN?.isFiltering?.() && MN.allowsItemId && !MN.allowsItemId(Number(itemId)));
    },

    // The first item id of each kind in the hand: { bike, broom }, null for a
    // kind not carried. `usable` keeps only what the world lets them ride.
    carried(profile, usable) {
      const out = { bike: null, broom: null };
      const ids = profile?.itemIds;
      if (!Array.isArray(ids)) return out;
      for (const id of ids) {
        const k = this.kindOfItem(id);
        if (!k || out[k] != null) continue;
        if (usable && !this.allowsItem(id)) continue;
        out[k] = Number(id);
      }
      return out;
    },

    // Puts a bike or a broom in the hand, unless one of that kind is there.
    grant(profile, kind) {
      const id = VEHICLE_ITEM[kind];
      if (!profile || !id || this.carried(profile)[kind] != null) return false;
      profile.itemIds = Array.isArray(profile.itemIds) ? profile.itemIds : [];
      profile.itemIds.push(id);
      window.NPCShared?.capItemIds?.(profile);
      return true;
    },

    // The roll itself, pure: one draw for the broom, one for the bike.
    roll(magical, tier, rng) {
      const t = Math.max(0, Math.min(4, Math.floor(Number(tier) || 0)));
      if (magical) {
        if (rng.next() < BROOM_ODDS[t]) return VEHICLE_BROOM;
        return rng.next() < CASTER_BIKE_ODDS[t] ? VEHICLE_BIKE : null;
      }
      return rng.next() < BIKE_ODDS[t] ? VEHICLE_BIKE : null;
    },

    ensure(profile, name, minor) {
      if (!profile) return;
      const child = minor ?? Children.isMinor(profile, name);
      if (!child && !profile._vehRolled && !Specs.isNonSentient(profile, name)) {
        const ws = window.NPCShared ? window.NPCShared.worldSeed() : 19002001;
        const rng = new MiniRng(nameHash(`${name || profile._eventName || "npc"}_vehicle`) ^ ws); // i18n-ignore: rng seed key
        const kind = this.roll(this.isMagicalClass(profile.assignedClassId), profile.wealthTierBase, rng);
        if (kind) this.grant(profile, kind);
        profile._vehRolled = true;
      }
      profile._vehChild = !!child;
      profile._vehV = VEH_V;
    },

    // Does this person have a car: a sentient adult with the car keys in the
    // hand (NPCShared.isCarKeys)?
    hasCar(profile, name) {
      if (profile && !profile._carRolled) this.ensureCar(profile, name);
      const ids = profile?.itemIds;
      if (!Array.isArray(ids)) return false;
      const isKeys = window.NPCShared?.isCarKeys;
      if (!ids.some(id => (isKeys ? isKeys(id) : Number(id) === 164))) return false;
      return !Children.isMinor(profile, name) && !Specs.isNonSentient(profile, name);
    },

    // The odds this person owns a car: their tier's, halved out of work.
    carOdds(profile) {
      const t = Math.max(0, Math.min(4, Math.floor(Number(profile?.wealthTierBase) || 0)));
      return CAR_ODDS[t] * (profile?.currentJobId === 0 ? CAR_JOBLESS_FACTOR : 1);
    },

    // The one roll for a car, stamped so it is never rolled again. A child is
    // not stamped: they are rolled on coming of age.
    ensureCar(profile, name) {
      if (!profile || profile._carRolled) return;
      if (Children.isMinor(profile, name)) return;
      profile._carRolled = true;
      if (Specs.isNonSentient(profile, name)) return;
      const ws = window.NPCShared ? window.NPCShared.worldSeed() : 19002001;
      const rng = new MiniRng(nameHash(`${name || profile._eventName || "npc"}_car`) ^ ws); // i18n-ignore: rng seed key
      if (rng.next() >= this.carOdds(profile)) return;
      profile._carOwner = true;
      const shared = window.NPCShared;
      if (shared?.grantCarKeys) shared.grantCarKeys(profile);
      else {
        profile.itemIds = Array.isArray(profile.itemIds) ? profile.itemIds : [];
        if (!profile.itemIds.includes(164)) profile.itemIds.push(164);
      }
    },

    // What they get about on day to day, or null for somebody on foot: the
    // bike or the broom they ride (rideOf), else their own car. A journey
    // weighs every kind they have (ridesOf).
    vehicleOf(profile, name) {
      if (!profile) return null;
      return this.rideOf(profile, name) || (this.hasCar(profile, name) ? VEHICLE_CAR : null);
    },

    // Every kind they could take on a journey: the car, and the bike or the
    // broom they ride. NPCLifeSim's travelOffer weighs all of them.
    ridesOf(profile, name) {
      const out = [];
      if (!profile) return out;
      if (this.hasCar(profile, name)) out.push(VEHICLE_CAR);
      const ride = this.rideOf(profile, name);
      if (ride) out.push(ride);
      return out;
    },

    // What they actually ride today, or null for somebody on foot: a kind
    // they carry and the world allows; a caster prefers the broom, anybody
    // else the bike, and with only one of them in the hand that one it is.
    rideOf(profile, name) {
      if (!profile) return null;
      const child = Children.isMinor(profile, name);
      if (profile._vehV !== VEH_V || !!profile._vehChild !== !!child) this.ensure(profile, name, child);
      if (child || Specs.isNonSentient(profile, name)) return null;
      const has = this.carried(profile, true);
      if (has.bike != null && has.broom != null) {
        return this.isMagicalClass(profile.assignedClassId) ? VEHICLE_BROOM : VEHICLE_BIKE;
      }
      return has.broom != null ? VEHICLE_BROOM : has.bike != null ? VEHICLE_BIKE : null;
    },

    // Would this person buy this bike or broom? Only somebody with nothing to
    // ride and none of that kind in the hand, never a child or a beast, and
    // only what the world allows. A caster buys a broom (a bike only where
    // brooms are refused); anybody else a bike.
    wantsVehicle(profile, name, itemId) {
      const kind = this.kindOfItem(itemId);
      if (!profile || !kind) return false;
      if (Children.isMinor(profile, name) || Specs.isNonSentient(profile, name)) return false;
      if (!this.allowsItem(itemId) || this.carried(profile)[kind] != null) return false;
      if (this.rideOf(profile, name)) return false;
      const magical = this.isMagicalClass(profile.assignedClassId);
      if (kind === VEHICLE_BROOM) return magical;
      return !magical || !this.allowsItem(VEHICLE_ITEM.broom);
    },
  };

  Object.assign(NPCSim._internal, {
    Vehicles,
  });
})();
