/*:
 * @target MZ
 * @plugindesc NPC Life: trips, travellers on the roads and moves to another town
 * @author Omni-Lex
 * @base NPCLifeSimulator
 * @orderAfter NPCLifeSimulator
 * @orderAfter NPCLife_Worldview
 * @help
 * ============================================================================
 * NPCLife_Travel, part of the NPCLifeSimulator family
 * ============================================================================
 * Owns TRAVELLING (trips that leave and arrive), ROAD TRAVELLERS (the
 * road-traveller index the 2D and 3D road views read) and RELOCATION
 * (somebody packs up and makes a life in another town).
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCLifeSim._internal and publishes its own there. Load it right after
 * NPCLife_Worldview.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const {
    ageAt, baselineStanding, destinationRecord, getProfile, getRecords, groupForPlace, HOMECOMING,
    LifeRng, MINUTES_PER_DAY, MOVE_REASONS, moveReasonLabel, nameHash, placeCoords, placeOfGroup,
    pushLifeEvent, worldSeed, yearOf,
  } = window.NPCLifeSim._internal;
  // Owned by modules that load after this one, bound once the family is in.
  let FLED_HORDE, isMinor, livesApart, minorChildrenOf;
  window.NPCLifeSim._internal._late.push(() => ({
    FLED_HORDE, isMinor, livesApart, minorChildrenOf,
  } = window.NPCLifeSim._internal));

  // ==========================================================================
  // TRAVELLING
  // ==========================================================================
  // An NPC's location history used to be pure backstory: rollLocationHistory
  // invented a past at record-mint time and currentPlace was never written
  // again. Nobody ever went anywhere while the world was running.
  //
  // Now an authored citizen takes a trip. They are away for a while, they turn
  // up somewhere else, they pay for the journey, they sleep in an inn while
  // they are there, and they come home. Because a destination may be a
  // procedural square that does not exist until the party walks onto it, a
  // trip is a RECORD first and a body only if somebody goes and looks.
  //
  // Who never travels:
  //   - anyone from a procedural settlement that is no named place. Their
  //     village is where they are from and where they stay; they may still
  //     receive visitors. A square that IS a destination (Milano) travels.
  //   - anyone non-sentient. A beast keeps no money and buys no ticket.
  //   - anyone in prison, or already away.
  //
  // Where they may go: any Destinations.json entry that is not locked,
  // procedural ones included, which is the whole point. A Ghent citizen turning
  // up in a procedural village is the thing worth seeing.

  const TRAVEL_DAY_CHANCE = 0.012;   // per eligible NPC per day, so a trip is an event
  const TRAVEL_AWAY_CAP = 3;         // at most this many from one town away at once
  const TRAVEL_STAY_MIN_DAYS = 1;
  const TRAVEL_STAY_MAX_DAYS = 6;
  const FARE_PER_TILE = 10;          // FastTravelSystem's own baseDistancePrice
  const TRIP_SETTLE_CHANCE = 0.03;   // a trip that ends with them staying there (RELOCATION)
  const ARRIVAL_FIRST_HOUR = 7;      // a visitor is out and about from 07:00...
  const ARRIVAL_LAST_HOUR = 22;      // ...until 22:00, then in their lodging

  // The ways an NPC may go, drawn from FastTravelSystem's fare and speed
  // tables and its own own/scheduled/hired taxonomy. Deliberately NOT the
  // whole list of 28: a mode is only here if a destination can actually carry
  // a block for it. hypermetro is absent on purpose, because no destination in
  // the game has a hypermetro station and offering one would be a fiction.
  //
  // The last three are the road: on foot, by bike and by broomstick. They cost
  // nothing but time, need nothing booked (arrangement "self", open to every
  // purse) and only go so far: nobody walks further than 6 tiles, cycles
  // further than 25 or flies further than 60. A bike or a broom is only on
  // offer to somebody who rides one (NPCSim.Vehicles).
  //
  // "car" is their OWN car, on offer only to somebody who carries the car keys
  // (NPCSim.Vehicles.hasCar): booked by nobody, faster than anything but the
  // train over a long way, good for 150 tiles, and paid for in fuel out of
  // their own money (its fare). On a road square it is met as a car with them
  // at the wheel (Vehicle/RoadCarAI.js driveTravellerCar).
  const TRAVEL_MODES = [
    { id: "train", arrangement: "scheduled", fare: 1.2, speed: 3.33, station: "train" },
    { id: "bus", arrangement: "scheduled", fare: 0.8, speed: 2.0, station: "bus" },
    { id: "carsharing", arrangement: "own", fare: 0.35, speed: 3.5, station: null },
    { id: "taxi", arrangement: "hired", fare: 2.5, speed: 3.33, station: null },
    { id: "walk", arrangement: "self", fare: 0, speed: 0.4, station: null, maxTiles: 6 },
    { id: "bike", arrangement: "self", fare: 0, speed: 1.3, station: null, maxTiles: 25, needs: "bike" },
    { id: "broom", arrangement: "self", fare: 0, speed: 3.0, station: null, maxTiles: 60, needs: "broom" },
    { id: "car", arrangement: "self", fare: 0.3, speed: 4.0, station: null, maxTiles: 150, needs: "car" },
  ];
  // i18n-ignore-start: travel arrangement and mode ids
  const SELF_ARRANGEMENT = "self";
  const ROAD_MODES = ["walk", "bike", "broom"];
  // Driven along the road rather than walked beside it: their own car.
  const DRIVE_MODES = ["car"];
  // i18n-ignore-end
  // What an hour on the road is worth to somebody of each wealth tier, in
  // gold. The way they go is the one with the lowest fare plus hours times
  // this, so the poor walk to the next town and the rich are driven there.
  const TRAVEL_TIME_VALUE = [4, 10, 30, 100, 400];

  // Which kinds of journey somebody of this means would consider. A destitute
  // NPC queues for a fare; a wealthy one is driven.
  function arrangementsForTier(tier) {
    if (tier >= 4) return ["hired", "own", "scheduled"];
    if (tier >= 2) return ["own", "scheduled"];
    return ["scheduled"];
  }

  function destinationTable() {
    const dest = window.WorkSystem?.Destinations;
    return (dest && typeof dest === "object") ? dest : null;
  }

  // Everywhere an NPC may actually go. Locked places are sealed off for the
  // party and are no more open to anybody else.
  function openDestinations() {
    const table = destinationTable();
    if (!table) return [];
    return Object.keys(table).filter((k) => table[k] && !table[k].locked);
  }

  // How far apart two named places are, in world-map tiles, off the same
  // "base" pin FastTravelSystem measures its own fares from. Worked out here
  // rather than by calling calculateTravelCost, which reads the PLAYER's
  // position out of the game variables and would price every NPC's journey as
  // though they set off from wherever the party is standing.
  function placeDistance(fromName, toName) {
    const table = destinationTable();
    const a = table?.[fromName]?.base;
    const b = table?.[toName]?.base;
    if (!a || !b) return null;
    return Math.round(Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2)));
  }

  // The best way this person could make this journey, or null if they cannot
  // make it at all: the lowest fare plus the time it takes, weighed at what
  // an hour is worth to them (TRAVEL_TIME_VALUE). A mode with a station type
  // is only on offer where the destination actually has that station; a road
  // mode only within its reach, and a bike, broom or car only to its owner.
  // `vehicle` is one kind or the list of every kind they have (ridesOf).
  function travelOffer(fromName, toName, tier, purse, vehicle) {
    const table = destinationTable();
    const to = table?.[toName];
    if (!to) return null;
    const tiles = placeDistance(fromName, toName);
    if (tiles === null || tiles <= 0) return null;
    const allowed = arrangementsForTier(tier);
    const t = Math.max(0, Math.min(TRAVEL_TIME_VALUE.length - 1, Math.floor(Number(tier) || 0)));
    const hourValue = TRAVEL_TIME_VALUE[t];
    const rides = Array.isArray(vehicle) ? vehicle : (vehicle ? [vehicle] : []);
    let best = null;
    for (const mode of TRAVEL_MODES) {
      if (mode.arrangement === SELF_ARRANGEMENT) {
        if (mode.maxTiles != null && tiles > mode.maxTiles) continue;
        if (mode.needs && !rides.includes(mode.needs)) continue;
      } else if (!allowed.includes(mode.arrangement)) continue;
      if (mode.station && !to[mode.station]) continue;
      const cost = Math.floor(tiles * FARE_PER_TILE * mode.fare);
      if (cost > purse) continue;
      const minutes = Math.max(60, Math.round((tiles / mode.speed) * 60));
      const score = cost + (minutes / 60) * hourValue;
      if (!best || score < best.score) {
        best = { mode: mode.id, arrangement: mode.arrangement, cost, tiles, minutes, score };
      }
    }
    return best;
  }

  // Who is allowed to go anywhere at all.
  function mayTravel(record, profile) {
    if (!record || record.nonSentient) return false;
    // Nobody sets out where the world holds no travel (WorldModes.hasTravel).
    if (window.NPCShared?.WorldModes?.hasTravel?.() === false) return false;
    // A child goes where the family goes (FAMILY).
    if (record.child) return false;
    if (record.inPrisonUntilMinute != null) return false;
    const group = record.homeGroup;
    if (!group) return false;
    // A procedural settlement's people belong to their square and stay,
    // unless the square is a named place (Milano's tiles): a town is a town.
    if (window.NPCSystem?.isProceduralGroup?.(group) && !placeOfGroup(group)) return false;
    if (window.NPCCreature?.isNonSentientProfile?.(profile)) return false;
    return true;
  }

  // Somewhere to sleep while they are away. RentSystem already keeps NPC
  // tenancies, keyed mapId_eventId, but it can only list the rooms of the map
  // that happens to be loaded, so a room is BOOKED here as an intention and
  // only matched to an actual door when somebody is standing in that town.
  function takeLodging(record, profile, place) {
    record.lodging = { place, roomKey: null };
    try {
      const RS = window.RentSystem;
      const free = RS?.freeRooms?.();
      if (!free || !free.length) return;
      // Only when the town they arrived in is the one under our feet.
      const room = free[0];
      const price = Number(room.price) || 0;
      if (profile && Number(profile.money) >= price) {
        profile.money -= price;
        record.lodging.roomKey = room.mapId + "_" + room.eventId;  // i18n-ignore: record key
        record.lodging.paid = price;
      }
    } catch (e) { /* no inn to be had; they are away all the same */ }
  }

  // What a trip is for: a working trip for somebody employed going to a place
  // of business, a holiday otherwise. Read by the road travellers.
  function tripKind(record, to) {
    const tag = destinationTable()?.[to]?.tag;
    return (tag === "business" && record?.employment === "employed") ? "business" : "leisure"; // i18n-ignore: trip kind ids
  }

  // The world-map squares the journey runs between, in order.
  function tripRoute(from, to) {
    return [placeCoords(from), placeCoords(to)].filter(Boolean);
  }

  // The hour of the day a simulation minute falls on (minute 0 is 10:00).
  function hourOfMinute(minute) {
    return (((Math.floor(minute / 60) + 10) % 24) + 24) % 24;
  }

  // Who has arrived in this group's place and not yet set off home, while they
  // would be out and about (07-22). A procedural square answers for the named
  // place it stands on, so any of Milano's tiles sees Milano's visitors.
  function arrivalsIn(group, nowMinute) {
    const records = getRecords();
    if (!records || !group) return [];
    const place = placeOfGroup(group);
    if (!place) return [];
    const now = Number(nowMinute ?? ($gameVariables ? $gameVariables.value(114) : 0)) || 0;
    const hour = hourOfMinute(now);
    if (hour < ARRIVAL_FIRST_HOUR || hour >= ARRIVAL_LAST_HOUR) return [];
    const out = [];
    for (const record of Object.values(records)) {
      const trip = record?.trip;
      if (!trip || trip.to !== place) continue;
      if (now >= trip.arrivesAtMinute && now < trip.returnLeavesAtMinute) out.push(record.name);
    }
    return out.sort();
  }

  // The group a place's people are kept under: a procedural square answers
  // with its named place's base square, anything else with itself.
  function canonicalGroup(group) {
    if (!group) return group;
    const place = placeOfGroup(group);
    return (place && groupForPlace(place)) || group;
  }

  // One day of being, or not being, a traveller.
  function resolveTravel(record, profile, rng, lastMinute, nowMinute, deltaDays, awayByGroup) {
    if (!record) return;

    // Already away: are they home yet?
    if (record.trip) {
      const trip = record.trip;
      if (nowMinute >= trip.homeByMinute) {
        record.trip = null;
        record.lodging = null;
        // Now and then a visit turns into a life: they stay where they went.
        const settleGroup = groupForPlace(trip.to);
        if (settleGroup && settleGroup !== record.homeGroup && rng.next() < TRIP_SETTLE_CHANCE &&
            relocate(record.name, settleGroup, nowMinute, "changeOfAir")) return;  // i18n-ignore: MOVE_REASONS id
        record.currentPlace = trip.from;
        beginStay(record, trip.from, nowMinute, HOMECOMING);
      }
      return;
    }

    if (!mayTravel(record, profile)) return;
    const home = placeOfGroup(record.homeGroup);
    if (!home) return;
    // A town only lets so many of its people be elsewhere at once, or a place
    // the party walks into could be standing empty.
    const away = awayByGroup[record.homeGroup] || 0;
    if (away >= TRAVEL_AWAY_CAP) return;
    // The chance is per day, so a long skip is more likely to have contained a
    // trip than a short one, without ever becoming a certainty.
    if (rng.next() > 1 - Math.pow(1 - TRAVEL_DAY_CHANCE, Math.min(deltaDays, 30))) return;

    const options = openDestinations().filter((d) => d !== home);
    if (!options.length) return;
    const to = rng.pick(options);
    const purse = Math.max(0, Number(profile?.money) || 0);
    const tier = Number(profile?.wealthTierBase) || 0;
    const Dev = window.NPCSim?.Dev;
    const vehicle = Dev?.ridesOf?.(profile, record.name) ?? Dev?.vehicleOf?.(profile, record.name) ?? null;
    const offer = travelOffer(home, to, tier, purse, vehicle);
    // Somebody who cannot afford the cheapest way there does not go. That
    // refusal is the point: a journey is a thing you have to be able to pay for.
    if (!offer) return;

    if (profile) profile.money = purse - offer.cost;
    const stayDays = rng.int(TRAVEL_STAY_MIN_DAYS, TRAVEL_STAY_MAX_DAYS);
    const homeBy = nowMinute + offer.minutes * 2 + stayDays * MINUTES_PER_DAY;
    record.trip = {
      from: home, to,
      kind: tripKind(record, to),
      route: tripRoute(home, to),
      mode: offer.mode, arrangement: offer.arrangement,
      fare: offer.cost, tiles: offer.tiles,
      leftAtMinute: nowMinute,
      arrivesAtMinute: nowMinute + offer.minutes,
      // The same journey back, so the stay is the time between the two legs.
      returnLeavesAtMinute: homeBy - offer.minutes,
      homeByMinute: homeBy,
    };
    record.currentPlace = to;
    beginStay(record, to, nowMinute, "changeOfAir");  // i18n-ignore: MOVE_REASONS id
    takeLodging(record, profile, to);
    awayByGroup[record.homeGroup] = away + 1;
  }

  // The location history is a list of stays: one open stay at the end, every
  // earlier one closed off with the year it ended. Going somewhere and coming
  // back are the same operation, so there is one of these and not two, and the
  // reason is drawn from the vocabulary the rest of the record already speaks.
  function beginStay(record, place, minute, reason) {
    // Every trip home writes a stay, so a long life of visits would grow the
    // list (and the save) without end: the birthplace and the latest
    // LOCATION_HISTORY_CAP - 1 stays are kept.
    const LOCATION_HISTORY_CAP = 32;
    if (!Array.isArray(record.locationHistory)) return;
    const year = yearOf(minute);
    const open = record.locationHistory[record.locationHistory.length - 1];
    if (open && open.toYear === null) open.toYear = year;
    record.locationHistory.push({
      place, wild: null, fromYear: year, toYear: null, reason,
    });
    const over = record.locationHistory.length - LOCATION_HISTORY_CAP;
    if (over > 0) record.locationHistory.splice(1, over);
  }

  function resolveStanding(record, deltaDays, profile) {
    // Standing slowly recovers toward the NPC's baseline once sentences are
    // served, paid debts fade from public memory.
    const base = baselineStanding(record, profile);
    const drift = 0.02 * deltaDays;
    if (record.socialStanding < base) record.socialStanding = Math.min(base, record.socialStanding + drift);
    else if (record.socialStanding > base) record.socialStanding = Math.max(base, record.socialStanding - drift);
    record.socialStanding = Math.round(record.socialStanding * 100) / 100;
  }

  // ==========================================================================
  // ROAD TRAVELLERS, who is out on the road near a square right now
  // ==========================================================================
  // The road views (Vehicle/RoadCarAI.js on the 2D map, VoxelWorldTraffic.js
  // in the 3D world) ask travellersNear who they should be showing. Three
  // kinds of people answer:
  //   - real travellers on a road leg of a trip (walk, bike or broom), placed
  //     by interpolating along the trip's route between the leg's two ends.
  //     The legs are indexed once per game hour, so a square asks a short
  //     list instead of every life record.
  //   - whoever an extra source hands in (addTravellerSource): refugees on the
  //     move are one.
  //   - ambient passers-by from the towns around: 3 an hour by day, 1 at dawn
  //     and at dusk and nobody at night, each riding what they own now and
  //     then (a bike nearly always, a broom about half the time: a caster
  //     mostly flies above the fields, not along the road) and walking
  //     otherwise.
  // Every entry is { name, mode, ambient, pos, heading, from, to, group }:
  // `heading` is the unit vector of travel in world-map tiles.

  const ROAD_NEAR_TILES = 1.5;       // how far from the square a real traveller still shows
  const AMBIENT_RADIUS = 12;         // the towns a passer-by comes from, in tiles
  const AMBIENT_DAY = 3;
  const AMBIENT_TWILIGHT = 1;
  const AMBIENT_RIDE = { bike: 1.0, broom: 0.55, car: 0.6 };
  const TRAVELLERS_MAX = 4;
  const _travellerSources = [];
  let _legIndex = null;              // { hour, legs }
  let _ambientPools = new Map();     // "x,y" -> { key, list }

  // 3 by day (08-19), 1 at dawn (06-08) and dusk (19-21), none at night.
  function ambientCountForHour(hour) {
    if (hour >= 8 && hour < 19) return AMBIENT_DAY;
    if ((hour >= 6 && hour < 8) || (hour >= 19 && hour < 21)) return AMBIENT_TWILIGHT;
    return 0;
  }

  // The world-map square a group lives on: a procedural square is its own
  // key, an authored town its destination's pin.
  function groupCoords(group) {
    if (!group) return null;
    const m = /^Proc:(-?\d+),(-?\d+)$/.exec(String(group));
    if (m) return { x: Number(m[1]), y: Number(m[2]) };
    return placeCoords(placeOfGroup(group));
  }

  function unitVector(dx, dy) {
    const len = Math.sqrt(dx * dx + dy * dy);
    return len > 0 ? { x: dx / len, y: dy / len } : { x: 1, y: 0 };
  }

  // Every road leg under way at some point of this game hour.
  function roadLegIndex(nowMinute) {
    const hour = Math.floor(nowMinute / 60);
    if (_legIndex && _legIndex.hour === hour) return _legIndex.legs;
    const legs = [];
    const from = hour * 60, until = from + 60;
    for (const record of Object.values(getRecords() || {})) {
      const trip = record?.trip;
      if (!trip || !(ROAD_MODES.includes(trip.mode) || DRIVE_MODES.includes(trip.mode))) continue;
      const route = trip.route;
      if (!Array.isArray(route) || route.length < 2) continue;
      const a = route[0], b = route[route.length - 1];
      const out = { start: Number(trip.leftAtMinute) || 0, end: Number(trip.arrivesAtMinute) || 0, from: a, to: b };
      const back = { start: Number(trip.returnLeavesAtMinute) || 0, end: Number(trip.homeByMinute) || 0, from: b, to: a };
      for (const leg of [out, back]) {
        if (leg.end <= leg.start || leg.end < from || leg.start >= until) continue;
        legs.push(Object.assign(leg, { name: record.name, mode: trip.mode, group: record.homeGroup }));
      }
    }
    _legIndex = { hour, legs };
    return legs;
  }

  // Where along its leg a traveller is at this minute.
  function legPosition(leg, nowMinute) {
    const f = Math.max(0, Math.min(1, (nowMinute - leg.start) / Math.max(1, leg.end - leg.start)));
    return { x: leg.from.x + (leg.to.x - leg.from.x) * f, y: leg.from.y + (leg.to.y - leg.from.y) * f };
  }

  // Who may be met out on the road near home at all.
  function mayBePasserBy(record) {
    if (!record || !record.name || record.trip) return false;
    if (record.nonSentient || record.child) return false;
    if (record.inPrisonUntilMinute != null) return false;
    const profile = getProfile(record.name);
    if (profile && window.NPCCreature?.isNonSentientProfile?.(profile)) return false;
    return true;
  }

  // The people of every town within AMBIENT_RADIUS of a square, cached per
  // square and game day until the population changes.
  function ambientPool(wx, wy, nowMinute) {
    const records = getRecords() || {};
    const names = Object.keys(records);
    const key = names.length + ":" + Math.floor((Number(nowMinute) || 0) / 1440);
    const cellKey = wx + "," + wy;
    const hit = _ambientPools.get(cellKey);
    if (hit && hit.key === key) return hit.list;
    const near = new Map();
    const list = [];
    for (const name of names.sort()) {
      const record = records[name];
      if (!mayBePasserBy(record)) continue;
      const g = record.homeGroup;
      if (!g) continue;
      let at = near.get(g);
      if (at === undefined) {
        at = groupCoords(g);
        if (at && Math.hypot(at.x - wx, at.y - wy) > AMBIENT_RADIUS) at = null;
        near.set(g, at);
      }
      if (at) list.push({ name, group: g, home: at });
    }
    if (_ambientPools.size > 32) _ambientPools = new Map();
    _ambientPools.set(cellKey, { key, list });
    return list;
  }

  // The people of the towns around a square who could be met at a wheel on
  // it (Vehicle/RoadCarAI.js WHO IS DRIVING): the same pool the passers-by
  // are drawn from, cached the same way, as names.
  function driversNear(wx, wy, nowMinute) {
    const now = Number(nowMinute ?? ($gameVariables ? $gameVariables.value(114) : 0)) || 0;
    return ambientPool(wx, wy, now).map(p => p.name);
  }

  // What a passer-by is on this time: what they own, most of the time.
  function ambientMode(name, rng) {
    const vehicle = window.NPCSim?.Dev?.vehicleOf?.(getProfile(name), name) ?? null;
    if (vehicle && rng.next() < (AMBIENT_RIDE[vehicle] ?? 0)) return vehicle;
    return ROAD_MODES[0];
  }

  function ambientPassersBy(wx, wy, nowMinute, count, seen) {
    if (count <= 0) return [];
    const pool = ambientPool(wx, wy, nowMinute).filter(p => !seen.has(p.name));
    if (!pool.length) return [];
    const hour = Math.floor(nowMinute / 60);
    const rng = new LifeRng((nameHash(`road:${wx},${wy}:${hour}`) ^ worldSeed()) >>> 0); // i18n-ignore: rng seed key
    const out = [];
    for (let i = 0; i < count && pool.length; i++) {
      const who = pool.splice(Math.floor(rng.next() * pool.length), 1)[0];
      // Heading out from home, or on the way back to it.
      let heading = unitVector(wx - who.home.x, wy - who.home.y);
      if (who.home.x === wx && who.home.y === wy) {
        const a = rng.next() * Math.PI * 2;
        heading = { x: Math.cos(a), y: Math.sin(a) };
      }
      if (rng.next() < 0.5) heading = { x: -heading.x, y: -heading.y };
      out.push({
        name: who.name, mode: ambientMode(who.name, rng), ambient: true,
        pos: { x: wx, y: wy }, heading, from: who.home, to: null, group: who.group,
      });
      seen.add(who.name);
    }
    return out;
  }

  // Another kind of traveller (refugees on the move): fn(wx, wy, nowMinute,
  // max) answers entries of the same shape. Registered once; a throwing
  // source is skipped.
  function addTravellerSource(fn) {
    if (typeof fn === "function" && !_travellerSources.includes(fn)) _travellerSources.push(fn);
  }

  function travellersNear(wx, wy, nowMinute, max) {
    const now = Number(nowMinute ?? ($gameVariables ? $gameVariables.value(114) : 0)) || 0;
    const cap = Math.max(0, max == null ? TRAVELLERS_MAX : Number(max) || 0);
    const out = [];
    const seen = new Set();
    for (const leg of roadLegIndex(now)) {
      if (out.length >= cap) break;
      if (now < leg.start || now > leg.end || seen.has(leg.name)) continue;
      const pos = legPosition(leg, now);
      if (Math.hypot(pos.x - wx, pos.y - wy) > ROAD_NEAR_TILES) continue;
      seen.add(leg.name);
      out.push({ name: leg.name, mode: leg.mode, ambient: false, pos,
        heading: unitVector(leg.to.x - leg.from.x, leg.to.y - leg.from.y),
        from: leg.from, to: leg.to, group: leg.group });
    }
    for (const source of _travellerSources) {
      if (out.length >= cap) break;
      let extra = null;
      try { extra = source(wx, wy, now, cap - out.length); } catch (e) { extra = null; }
      for (const entry of (Array.isArray(extra) ? extra : [])) {
        if (out.length >= cap) break;
        if (!entry || !entry.name || seen.has(entry.name) || !ROAD_MODES.includes(entry.mode)) continue;
        seen.add(entry.name);
        out.push(entry);
      }
    }
    const ambient = Math.min(cap - out.length, ambientCountForHour(hourOfMinute(now)));
    return out.concat(ambientPassersBy(wx, wy, now, ambient, seen));
  }

  // ==========================================================================
  // RELOCATION, somebody packs up and makes a life in another town
  // ==========================================================================
  // A trip comes home; a move does not. Now and then a person leaves the town
  // they live in for good: the young, the jobless, the newly separated and the
  // newly poor more often than anybody settled. Their partner and their minor
  // children go with them. The move is the whole of it: a home in the new
  // town (NPCSystem.rehomeResident), the old shift handed back and an open one
  // taken (JobShiftManager.releaseSlot / claimVacancy), the record's home
  // group and location history, and the vote (NPCPolitics.onRelocated). The
  // census reads record.homeGroup, so it follows by itself.
  //
  // A town is never emptied by it: at most RELOCATE_MAX_PER_WINDOW households
  // leave one group in RELOCATE_WINDOW_DAYS, and never below RELOCATE_FLOOR of
  // the most people it has been seen to hold. Kept in the world folder as
  // $gameSystem._npcRelocations = { baseline: { group: n }, departures: { group: [minute] } }.
  //
  // Who never moves: the authored cast (a written person lives where they were
  // written), the party, a character the player built, a <Local>, anybody in
  // office or on the force, a prisoner, a beast, a child on their own, anybody
  // away on a trip, and anybody standing on the map the party is looking at
  // (they are deferred to a later pass rather than vanishing mid-sentence).

  const RELOCATE_DAY_RATE = 1 / (365 * 50);
  const RELOCATE_WINDOW_DAYS = 30;
  const RELOCATE_MAX_PER_WINDOW = 2;
  const RELOCATE_FLOOR = 0.85;
  const RELOCATE_YOUNG_AGE = 30;

  function relocationState() {
    if (!$gameSystem) return { baseline: {}, departures: {} };
    const st = $gameSystem._npcRelocations || {};
    if (!st.baseline) st.baseline = {};
    if (!st.departures) st.departures = {};
    // Reassigned, not only mutated, so the world folder hears of it.
    $gameSystem._npcRelocations = st;
    return st;
  }

  // People per home group, counted once and kept up to date by relocate().
  let _relocCounts = null;
  function groupCounts() {
    if (_relocCounts) return _relocCounts;
    _relocCounts = {};
    for (const r of Object.values(getRecords() || {})) {
      if (!r || r.nonSentient || !r.homeGroup) continue;
      _relocCounts[r.homeGroup] = (_relocCounts[r.homeGroup] || 0) + 1;
    }
    return _relocCounts;
  }

  // Forget every cached head count, after anybody's home group has changed.
  function invalidatePopulation() {
    window.NPCLifeSim._internal._populationCache = null;
    window.NPCLifeSim._internal._populationCacheKey = "";
    _relocCounts = null;
  }

  function inPartyNamed(name) {
    try {
      return !!(typeof $gameParty !== "undefined" && $gameParty?.members?.()?.some(a => a && a.name && a.name() === name));
    } catch (_) { return false; }
  }

  // Standing on the map the party is looking at right now.
  function onLoadedMap(name) {
    try {
      if (typeof $gameMap === "undefined" || !$gameMap?.events) return false;
      return $gameMap.events().some(ev => ev && !ev._erased && ev.event?.()?.name === name);
    } catch (_) { return false; }
  }

  // May this person, on their own account, move away at all?
  function mayRelocate(record, profile) {
    if (!record || !profile || !record.homeGroup) return false;
    if (record.nonSentient || record.child || isMinor(record.name, profile)) return false;
    if (window.NPCCreature?.isNonSentientProfile?.(profile)) return false;
    if (record.trip || record.inPrisonUntilMinute != null) return false;
    if (profile.playerCreated || profile._localNpc || profile._officer || profile._erisLawyerJobLocked) return false;
    // Nor does anybody holding an office of a nation or a bloc: the office
    // sits in the capital (NPCPolitics REAL POLITICIANS).
    if (profile._politicsOffice) return false;
    if (window.NPCSystem?.isReservedName?.(record.name)) return false;
    if (window.NPCSystem?.isNameGone?.(record.name)) return false;
    if (inPartyNamed(record.name)) return false;
    if (window.NPCPolitics?.getIdentity?.(record.name)?.localOffice) return false;
    return true;
  }

  function recentlySplit(record, nowMinute) {
    const since = yearOf(nowMinute) - 1;
    return (record.exPartners || []).some(e => e && e.toYear >= since && e.outcome !== "widowed"); // i18n-ignore: outcome id
  }

  // Poorer than they have been: under half the most money they were seen with.
  function lostWealth(record, profile) {
    const money = Number(profile?.money);
    if (!Number.isFinite(money)) return false;
    record._peakMoney = Math.max(Number(record._peakMoney) || 0, money);
    return record._peakMoney > 0 && money < record._peakMoney * 0.5;
  }

  function relocationRate(record, profile, nowMinute) {
    let rate = RELOCATE_DAY_RATE;
    if (ageAt(record, nowMinute) < RELOCATE_YOUNG_AGE) rate *= 3;
    if (record.employment === "unemployed") rate *= 2.5;
    if (recentlySplit(record, nowMinute)) rate *= 3;
    if (lostWealth(record, profile)) rate *= 2;
    return rate;
  }

  // Why they would say they left, in the words the biography already speaks.
  // i18n-ignore-start: MOVE_REASONS ids
  function relocationMotive(record, profile, nowMinute) {
    if (recentlySplit(record, nowMinute)) return "fallingOut";
    if (record.employment === "unemployed") return "lookingForWork";
    if (lostWealth(record, profile)) return "cheapHousing";
    return "freshStart";
  }
  // i18n-ignore-end

  // Is there room for `leaving` more people to go from this group now?
  function relocationRoom(group, leaving, nowMinute) {
    if (!group) return false;
    const st = relocationState();
    const count = groupCounts()[group] || 0;
    const base = st.baseline[group] = Math.max(Number(st.baseline[group]) || 0, count);
    if (count - leaving < base * RELOCATE_FLOOR) return false;
    const since = nowMinute - RELOCATE_WINDOW_DAYS * MINUTES_PER_DAY;
    const recent = (st.departures[group] || []).filter(m => m > since && m <= nowMinute);
    st.departures[group] = recent;
    return recent.length < RELOCATE_MAX_PER_WINDOW;
  }

  function countryOfGroup(group) {
    const place = placeOfGroup(group);
    return destinationRecord(place)?.country || $gameSystem?._npcMapGroups?.[group]?.country || null;
  }

  // Every place a person could move to: the hand-made towns that are a real,
  // open destination, and every open procedural destination's square.
  function relocationDestinations() {
    const out = new Set();
    for (const g of Object.keys($gameSystem?._npcMapGroups || {})) {
      if (window.NPCSystem?.isProceduralGroup?.(g)) continue;
      if (window.TowerWorlds?.worldOfGroup?.(g)) continue;
      const entry = destinationRecord(placeOfGroup(g));
      if (entry && !entry.locked) out.add(g);
    }
    for (const name of openDestinations()) {
      if (!destinationRecord(name)?.procedural) continue;
      const g = groupForPlace(name);
      if (g) out.add(g);
    }
    return [...out].sort();
  }

  // Where they go: a town with work going, not too far, in their own country
  // for preference, and one they can afford to get to.
  function destinationWeight(record, profile, fromGroup, toGroup) {
    const from = placeOfGroup(fromGroup), to = placeOfGroup(toGroup);
    let w = 1;
    const open = Number(window.NPCSim?.JobShiftManager?.openSlots?.(toGroup)) || 0;
    w *= 1 + Math.min(10, open) * 0.3;
    const d = (from && to) ? placeDistance(from, to) : null;
    w *= d == null ? 0.5 : 1 / (1 + d / 25);
    const fc = countryOfGroup(fromGroup), tc = countryOfGroup(toGroup);
    if (fc && tc && fc === tc) w *= 3;
    const offer = (from && to) ? travelOffer(from, to, Number(profile?.wealthTierBase) || 0, Math.max(0, Number(profile?.money) || 0)) : null;
    if (!offer) w *= 0.2;
    return w;
  }

  function pickRelocationDestination(record, profile, fromGroup, rng) {
    const home = canonicalGroup(fromGroup);
    const options = relocationDestinations().filter(g => g !== fromGroup && g !== home);
    if (!options.length) return null;
    const weights = options.map(g => destinationWeight(record, profile, fromGroup, g));
    let total = weights.reduce((a, b) => a + b, 0);
    if (!(total > 0)) return null;
    let roll = rng.next() * total;
    for (let i = 0; i < options.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return options[i];
    }
    return options[options.length - 1];
  }

  // Who goes with them: a partner who lives with them and may move, and every
  // minor child of either. A child is never left behind by a parent's move.
  function householdOf(name) {
    const records = getRecords() || {};
    const record = records[name];
    const out = [];
    const partner = record?.partner && !record.partner.external ? records[record.partner.name] : null;
    if (partner && partner.homeGroup === record.homeGroup && !livesApart(name, partner.name) &&
        mayRelocate(partner, getProfile(partner.name))) {
      out.push(partner.name);
    }
    for (const c of minorChildrenOf([name, ...out])) {
      if (records[c] && !out.includes(c) && c !== name) out.push(c);
    }
    return out;
  }

  // The move itself. relocate(name, toGroup?, nowMinute?, reason?), or
  // relocate(name, { toGroup, now, reason, withNames, force }) as the family
  // code asks it after a split (withNames: exactly who goes along, and no
  // partner). A missing toGroup is chosen here. Answers
  // { name, from, toGroup, movers } or null when they do not go.
  function relocate(name, toGroup, nowMinute, reason) {
    let opts = {};
    if (toGroup && typeof toGroup === "object") {
      opts = toGroup;
      toGroup = opts.toGroup || null;
      if (opts.now != null) nowMinute = opts.now;
      if (opts.reason) reason = opts.reason;
    }
    const records = getRecords();
    const record = records?.[name];
    const profile = getProfile(name);
    if (!record || !profile) return null;
    const now = Number(nowMinute ?? ($gameVariables ? $gameVariables.value(114) : 0)) || 0;
    if (!opts.force && !mayRelocate(record, profile)) return null;
    const from = record.homeGroup;

    const followers = Array.isArray(opts.withNames)
      ? opts.withNames.filter(n => n && n !== name && records[n])
      : householdOf(name);
    const movers = [name, ...followers];
    // Somebody in view is not spirited away: the move waits for a later pass.
    if (!opts.force && movers.some(onLoadedMap)) return null;

    const rng = new LifeRng((nameHash(name + "_relocate_" + now) ^ worldSeed()) >>> 0);
    if (!toGroup) toGroup = pickRelocationDestination(record, profile, from, rng);
    if (!toGroup || canonicalGroup(toGroup) === canonicalGroup(from)) return null;
    if (!opts.force && !relocationRoom(from, movers.length, now)) return null;

    // A reason the biography can say. A split reads as the falling-out it was.
    // i18n-ignore-start: MOVE_REASONS ids
    let why = reason;
    if (why === "separation") why = "fallingOut";
    // The Horde's refugees leave and come home under their own two reasons
    // (REFUGEES), which no rolled backstory ever draws.
    if (!MOVE_REASONS.includes(why) && why !== FLED_HORDE && why !== HOMECOMING) why = "freshStart";
    // i18n-ignore-end

    // The journey is paid for when it can be; nobody is kept home by the fare.
    const fromPlace = placeOfGroup(from), place = placeOfGroup(toGroup) || toGroup;
    const offer = fromPlace ? travelOffer(fromPlace, place, Number(profile.wealthTierBase) || 0, Math.max(0, Number(profile.money) || 0)) : null;
    if (offer) profile.money = Math.max(0, (Number(profile.money) || 0) - offer.cost);

    const JSM = window.NPCSim?.JobShiftManager;
    const counts = groupCounts();
    let leaderHome = null;
    for (const n of movers) {
      const r = records[n];
      if (!r) continue;
      const p = getProfile(n);
      const oldGroup = r.homeGroup;
      const own = n === name ? why : "followingFamily"; // i18n-ignore: MOVE_REASONS id
      try { JSM?.releaseSlot?.(n); } catch (e) { console.error("[NPCLifeSim] releasing a shift failed", e); }
      try {
        const joinHome = n === name ? null : leaderHome;
        if (window.NPCSystem?.rehomeResident) window.NPCSystem.rehomeResident(n, oldGroup, toGroup, { joinHome });
        else window.NPCSim?.resettle?.(n, toGroup, joinHome);
      } catch (e) { console.error("[NPCLifeSim] rehoming \"" + n + "\" failed", e); }
      if (p) p._homeGroupName = toGroup;
      if (n === name) leaderHome = (p?.homeBuilding && !p.homeBuilding._placeholder) ? p.homeBuilding : null;
      r.homeGroup = toGroup;
      r.currentPlace = place;
      r.trip = null;
      r.lodging = null;
      // The day of the move, read by the schedule as "relocating".
      r.relocating = { sinceMin: now, untilMin: now + Math.max(240, Number(offer?.minutes) || 0) };
      beginStay(r, place, now, own);
      pushLifeEvent(r, now, "move", "NPCLife.event.moved", { place, wild: null, reason: moveReasonLabel(own) });
      if (!r.child && !isMinor(n, p)) {
        try { JSM?.claimVacancy?.(n, toGroup); } catch (e) { console.error("[NPCLifeSim] taking a shift failed", e); }
      }
      try { window.NPCPolitics?.onRelocated?.(n, toGroup); } catch (e) { console.error("[NPCLifeSim] re-registering a voter failed", e); }
      if (oldGroup) counts[oldGroup] = Math.max(0, (counts[oldGroup] || 0) - 1);
      counts[toGroup] = (counts[toGroup] || 0) + 1;
    }
    const st = relocationState();
    (st.departures[from] = st.departures[from] || []).push(now);
    window.NPCLifeSim._internal._populationCache = null;
    window.NPCLifeSim._internal._populationCacheKey = "";
    return { name, from, toGroup, movers };
  }

  // One interval of maybe packing up. Chance per day, capped at a year's worth.
  function resolveRelocation(record, profile, rng, nowMinute, deltaDays) {
    if (!mayRelocate(record, profile)) return null;
    const rate = relocationRate(record, profile, nowMinute);
    const p = 1 - Math.pow(1 - rate, Math.min(deltaDays, 365));
    if (rng.next() >= p) return null;
    return relocate(record.name, null, nowMinute, relocationMotive(record, profile, nowMinute));
  }

  Object.assign(window.NPCLifeSim._internal, {
    addTravellerSource, AMBIENT_RIDE, ambientCountForHour, ambientPool, arrivalsIn, canonicalGroup,
    countryOfGroup, destinationTable, groupCoords, groupCounts, householdOf, inPartyNamed,
    invalidatePopulation, legPosition, mayRelocate, mayTravel, onLoadedMap, relocate,
    RELOCATE_DAY_RATE, RELOCATE_FLOOR, RELOCATE_MAX_PER_WINDOW, relocationDestinations,
    relocationRate, relocationRoom, relocationState, resolveRelocation, resolveStanding,
    resolveTravel, ROAD_MODES, DRIVE_MODES, driversNear, ROAD_NEAR_TILES, roadLegIndex, TRAVEL_MODES, TRAVEL_TIME_VALUE,
    travellersNear, travelOffer, TRIP_SETTLE_CHANCE, unitVector,
  });
  // Live state other modules read or reset: always the binding itself, never a copy.
  Object.defineProperty(window.NPCLifeSim._internal, "_relocCounts", { get: () => _relocCounts, set: (v) => { _relocCounts = v; }, enumerable: true });
  Object.defineProperty(window.NPCLifeSim._internal, "_legIndex", { get: () => _legIndex, set: (v) => { _legIndex = v; }, enumerable: true });
  Object.defineProperty(window.NPCLifeSim._internal, "_ambientPools", { get: () => _ambientPools, set: (v) => { _ambientPools = v; }, enumerable: true });
})();
