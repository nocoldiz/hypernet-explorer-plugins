/*:
 * @target MZ
 * @plugindesc NPC Life: the public window.NPCLifeSim API
 * @author Omni-Lex
 * @base NPCLifeSimulator
 * @orderAfter NPCLifeSimulator
 * @orderAfter NPCLife_Family
 * @help
 * ============================================================================
 * NPCLife_Api, part of the NPCLifeSimulator family
 * ============================================================================
 * Owns the PUBLIC API: fills window.NPCLifeSim (created by the entry) with
 * the functions and tables the rest of the game calls. Loads after the
 * modules its table names and before the ones that add to it.
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCLifeSim._internal and publishes its own there. Load it right after
 * NPCLife_Family.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const {
    addTravellerSource, ageAt, AMBIENT_RIDE, ambientCountForHour, ambientPool, applyChildProfile,
    arrivalsIn, bindFamily, birthChild, buildBiography, canonicalGroup, carrierOf, catchUp,
    childrenOf, childSprite, collectPopulation, conversationPush, conversionOf, coupleStyle,
    creedLabel, dateStrOf, destinationAtTile, dialoguePush, directedShift, driversNear, endPartnership, enforceAdultBirth,
    ensureLifeRecord, FAMILY, familyContext, getCrimes, getProfile, getRecords, groupCoords,
    groupForPlace, introduceCouple, invalidatePopulation, isMinor, kinOf, legPosition, lifeEventText, LifeRng,
    lifeStageOf, linkExtraPartner, livesApart, markDev, mayPair, mayRelocate, mayTravel,
    MIN_NPC_AGE, nameHash, pairKind, pairNewlyweds, parentsOf, partnersOf, placeCoords,
    placeOfGroup, playerPush, preAgeCreed, PULL_CAP, pushConversion, pushLifeEvent, RATES,
    recordCrime, relocate, RELOCATE_DAY_RATE, RELOCATE_FLOOR, RELOCATE_MAX_PER_WINDOW,
    relocationDestinations, relocationRate, relocationRoom, resolveConversion, resolveExtraPartners,
    resolveFamily, resolveGrowingUp, resolveRelationships, resolveRelocation, resolveWorldview,
    ROAD_MODES, roadLegIndex, roomForAnother, sampleCount, separateHousehold, SHIFTS_PER_PASS_MAX,
    stageForAge, stageMoveSpeed, STYLE_RULES, styleKeyOf, TRAVEL_MODES, TRAVEL_TIME_VALUE,
    travellersNear, travelOffer, TRIP_SETTLE_CHANCE, unlinkPartner, worldviewPull,
    yearOf,
  } = window.NPCLifeSim._internal;
  // Owned by modules that load after this one, bound once the family is in.
  let bandAwayFromTown;
  window.NPCLifeSim._internal._late.push(() => ({
    bandAwayFromTown,
  } = window.NPCLifeSim._internal));

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  // Is this person out of town, and what are they doing there? The one answer,
  // so nothing has to go digging in the record for it.
  function travelStatus(name) {
    const record = $gameSystem?._npcLifeRecords?.[name];
    const trip = record?.trip;
    if (!trip) return null;
    return {
      from: trip.from, to: trip.to, mode: trip.mode,
      arrangement: trip.arrangement, fare: trip.fare,
      kind: trip.kind, route: trip.route,
      arrivesAtMinute: trip.arrivesAtMinute,
      returnLeavesAtMinute: trip.returnLeavesAtMinute,
      lodging: record.lodging?.place || null,
      roomKey: record.lodging?.roomKey || null,
    };
  }

  // On a trip, or out with an adventuring band (ADVENTURING BANDS), which a
  // <Local> never counts as: they are still met on their own map.
  function isAwayFromTown(name) {
    if ($gameSystem?._npcLifeRecords?.[name]?.trip) return true;
    return bandAwayFromTown(name);
  }

  Object.assign(window.NPCLifeSim, {
    travelStatus,
    isAwayFromTown,
    // Who is visiting a group's place right now, the permanent moves, and the
    // cache every head count keeps (TRAVELLING, RELOCATION).
    arrivalsIn,
    // Who is out on the road near a square (ROAD TRAVELLERS), and the hook a
    // later kind of traveller (refugees on the move) registers with.
    travellersNear,
    addTravellerSource,
    ambientCountForHour,
    // The people of the towns around a square who could be at a wheel on it
    // (Vehicle/RoadCarAI.js WHO IS DRIVING).
    driversNear,
    TRAVEL_MODES,
    ROAD_MODES,
    relocate,
    invalidatePopulation,
    canonicalGroup,
    mayRelocate(name) { return mayRelocate(getRecords()?.[name], getProfile(name)); },
    catchUp,
    ensureLifeRecord,
    getRecord(name) { return getRecords()?.[name] ?? null; },
    // A life event written from outside the catch-up (a prosthetic fitted at
    // a clinic counter on the map, NPCDowned.treat).
    logEvent(name, minute, type, key, params) {
      const record = getRecords()?.[name];
      if (!record || !Array.isArray(record.lifeEvents)) return false;
      pushLifeEvent(record, minute, type, key, params || {});
      return true;
    },
    // Throw away the life this person was dealt and deal another one, against
    // whatever their profile says now (level, morality, home town). Used by the
    // Detailed character editor, where the player is still deciding who this
    // character is and asks for a different past.
    rerollLifeRecord(name, homeGroupHint) {
      const records = getRecords();
      if (!records || !name) return null;
      delete records[name];
      const salt = "_" + Math.floor(Math.random() * 0x7fffffff);
      return ensureLifeRecord(name, homeGroupHint, salt);
    },
    buildBiography,
    // Resolve a { key, params } pocket from a record's lifeEvents.
    lifeEventText,
    // Records a live-sim crime (e.g. a theft the player's world witnessed)
    // straight onto the NPC's permanent criminal record and personal bounty,
    // used by NPCSimulationCore's CrimeManager when an NPC gets caught.
    addLiveCrime(name, crimeKey, minute, opts = {}) {
      // A beast is answerable to nobody's law: it gets no criminal record and
      // no bounty, whatever it was seen taking (NPCCreature).
      if (window.NPCCreature?.isHeldToBeastRules?.(getProfile(name), name)) return null;
      const record = ensureLifeRecord(name);
      if (!record || record.nonSentient) return null;
      const crimes = getCrimes();
      const crime = crimes.find(c => c.key === crimeKey)
        || crimes.find(c => c.category === "Theft") // i18n-ignore: PresetCrimes category id
        || crimes[0];
      if (!crime) return null;
      const caught = opts.caught ?? true;
      const atMinute = Number(minute ?? ($gameVariables ? $gameVariables.value(114) : 0)) || 0;
      const entry = recordCrime(record, crime, atMinute, caught, false);
      // recordCrime only raises the bounty for *unwitnessed* crimes; a
      // caught-in-the-act NPC who fled the scene still becomes wanted.
      if (caught && (opts.addBounty ?? true)) record.wantedBounty += crime.bounty;
      // Nobody saw an unwitnessed one: it is on the record, not in the biography.
      if (caught) pushLifeEvent(record, atMinute, "arrest", "NPCLife.event.caughtCommitting", { crime: crime.name.toLowerCase() });
      return entry;
    },
    // Current personal bounty (gold) on this NPC's head.
    getBounty(name) { return getRecords()?.[name]?.wantedBounty ?? 0; },
    ageOf(name) {
      const r = getRecords()?.[name];
      if (!r) return null;
      enforceAdultBirth(r);
      return ageAt(r, $gameVariables ? ($gameVariables.value(114) || 0) : 0);
    },
    // The live in-game year, and the age floor every NPC birth date respects.
    currentYear() { return yearOf($gameVariables ? ($gameVariables.value(114) || 0) : 0); },
    MIN_NPC_AGE,
    // The family a procedural household is found with (HOUSEHOLDS section).
    bindFamily,
    kinOf,
    // Pairing, styles, children and life stages (FAMILY section).
    mayPair,
    // Two singles brought together by the party (the Empathize panel's Introduce).
    introduceCouple,
    pairKind,
    partnersOf,
    livesApart,
    birthChild,
    isMinor,
    lifeStageOf,
    stageMoveSpeed,
    childSprite,
    applyChildProfile,
    childrenOf,
    parentsOf,
    STYLE_RULES,
    FAMILY,
    // Map group <-> Destinations.json name (PLACES section).
    placeOfGroup,
    groupForPlace,
    placeCoords,
    destinationAtTile,
    // Worldview and conversion (DIRECTED DEVELOPMENT, CONVERSION sections).
    pushEvent(name, minute, type, key, params) {
      const record = getRecords()?.[name] || ensureLifeRecord(name);
      if (!record) return false;
      const at = minute ?? ($gameVariables ? ($gameVariables.value(114) || 0) : 0);
      pushLifeEvent(record, at, type, key, params);
      return true;
    },
    pushConversion,
    conversationPush,
    playerPush,
    dialoguePush,
    conversionOf,
    creedLabel,
    // test/inspection hooks
    _internals: {
      LifeRng, nameHash, sampleCount, yearOf, dateStrOf, collectPopulation, RATES,
      worldviewPull, directedShift, resolveWorldview, resolveConversion, preAgeCreed,
      markDev, PULL_CAP, SHIFTS_PER_PASS_MAX,
      resolveRelationships, resolveFamily, resolveGrowingUp, endPartnership, pairNewlyweds,
      separateHousehold, coupleStyle, stageForAge, roomForAnother, linkExtraPartner,
      unlinkPartner, resolveExtraPartners, carrierOf, familyContext, styleKeyOf, mayTravel,
      relocationRate, relocationDestinations, relocationRoom, resolveRelocation,
      RELOCATE_DAY_RATE, RELOCATE_MAX_PER_WINDOW, RELOCATE_FLOOR, TRIP_SETTLE_CHANCE,
      travelOffer, roadLegIndex, legPosition, ambientPool, groupCoords, AMBIENT_RIDE,
      TRAVEL_TIME_VALUE, resetRoadIndex() { window.NPCLifeSim._internal._legIndex = null; window.NPCLifeSim._internal._ambientPools = new Map(); },
    },
  });

})();
