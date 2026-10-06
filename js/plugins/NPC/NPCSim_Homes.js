/*:
 * @target MZ
 * @plugindesc NPC Simulation: the home building registry
 * @author Omni-Lex
 * @base NPCSimulationCore
 * @orderAfter NPCSimulationCore
 * @orderAfter NPCSim_Thoughts
 * @help
 * ============================================================================
 * NPCSim_Homes, part of the NPCSimulationCore family
 * ============================================================================
 * Owns the home building registry (SECTION 11a-i): who lives behind which
 * door, households moving in and out, resettling in another town.
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCSim._internal and publishes its own there. Load it right after
 * NPCSim_Thoughts.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const NPCSim = window.NPCSim;
  const {
    MiniRng, nameHash,
  } = NPCSim._internal;

  // ============================================================================
  // SECTION 11a-i, HOME BUILDING REGISTRY
  // ============================================================================
  // Assigns each NPC a specific procedural building entrance from their map
  // group's residentialBuildings cache (written to MapGroups.json at world gen).
  // The building's seed (mapId * 1e6 + x * 1e3 + y) matches the seed
  // ProceduralHouseSystem uses to deterministically generate that house's
  // contents, so the player will see the correct occupants when they enter.

  // Skyscrapers are PUBLIC buildings: nobody is assigned to live in one, the
  // whole town visits them instead (see NPCSystem's house-map branch). This
  // holds for procedurally placed towers and for the hardcoded map pools alike,
  // because ProceduralHouseSystem classifies by the interior's parent map as
  // well as by the entrance's pool name.
  function _isPublicBuilding(b) {
    return !!window.ProceduralHouseSystem?.isBuildingPublic?.(b);
  }

  // Only houses/abandoned shells, residential walk-ups, and skyscrapers (for wealthy NPCs)
  // are addresses. Inns and shops are commercial, so neither is ever handed out as somebody's home.
  function _isResidentialBuilding(b) {
    const PHS = window.ProceduralHouseSystem;
    if (PHS?.isResidentialBuilding) return PHS.isResidentialBuilding(b);
    return !!b && !_isPublicBuilding(b);
  }

  function _isSentientForHomeOwnership(profile, name) {
    const NC = window.NPCCreature;
    if (!NC) return true;
    if (NC.isNonSentientProfile?.(profile) || NC.isNonSentientNPC?.(name)) {
      if (NC.isPlayerCharacterName?.(name) || (typeof $gameParty !== 'undefined' && $gameParty?.members?.()?.some(a => a.name() === name))) {
        return true;
      }
      return false;
    }
    return true;
  }

  function _findPartnerName(name, profile) {
    if (!name) return null;
    const lifePartner = window.NPCLifeSim?.getRecord?.(name)?.partner;
    if (lifePartner && !lifePartner.external && lifePartner.name) {
      return lifePartner.name;
    }
    if (profile?.relationships) {
      // A fond parent, child or sibling is family, never a partner.
      const kin = window.NPCLifeSim?.kinOf?.(name) || {};
      for (const [otherName, rel] of Object.entries(profile.relationships)) {
        if (kin[otherName]) continue;
        if (rel && (rel.partner || rel.married || (rel.opinion != null && rel.opinion >= 75))) {
          return otherName;
        }
      }
    }
    return null;
  }

  function _isWealthyForSkyscraper(profile) {
    if (!profile) return false;
    const tier = profile.wealthTierBase ?? 0;
    const money = profile.money ?? 0;
    return tier >= 2 || money >= 60000 || profile.homePoolType === 'skyscrapers';
  }

  function _isSkyscraperBuilding(b) {
    if (!b) return false;
    const PHS = window.ProceduralHouseSystem;
    if (PHS?.isSkyscraperBuilding) return PHS.isSkyscraperBuilding(b);
    const pool = b.baseFloorPool || b.poolName || '';
    return /skyscraper/i.test(pool) || /skyfloor/i.test(pool);
  }

  // Buildings are keyed by town + entrance tile rather than by event id: doors
  // on the procedural map (636) are terrain tiles with no event behind them,
  // and map 636 is reused for every world tile.
  function _makeBuildingKey(b, groupName) {
    return window.ProceduralHouseSystem?.buildingKey?.(b, groupName)
      || `${groupName || ''}|${b.mapId}_${b.x}_${b.y}`;
  }

  function _getBuildingKey(b) {
    if (!b) return '';
    if (b.key) return b.key;
    return _makeBuildingKey(b, b.groupName || '');
  }

  function _getBuildingOccupants(b) {
    if (!$gameSystem) return [];
    $gameSystem._npcBuildingOccupants = $gameSystem._npcBuildingOccupants || {};
    return $gameSystem._npcBuildingOccupants[_getBuildingKey(b)] || [];
  }

  function _registerBuildingOccupant(b, npcName) {
    if (!$gameSystem) return;
    $gameSystem._npcBuildingOccupants = $gameSystem._npcBuildingOccupants || {};
    const key = _getBuildingKey(b);
    const arr = $gameSystem._npcBuildingOccupants[key] || [];
    if (!arr.includes(npcName)) arr.push(npcName);
    $gameSystem._npcBuildingOccupants[key] = arr;
  }

  function _unregisterBuildingOccupant(b, npcName) {
    if (!$gameSystem || !b) return;
    const table = $gameSystem._npcBuildingOccupants;
    const arr = table?.[_getBuildingKey(b)];
    if (!arr) return;
    const i = arr.indexOf(npcName);
    if (i >= 0) arr.splice(i, 1);
  }

  // How many separate households a building holds. A multi-floor residential
  // block is one household per floor; a single house holds one (with room for a
  // partner/family member, hence capacity 2 from the map scanner).
  function _buildingFloorCount(b) {
    if (b.type !== 'enterMultiBuilding') return 1;
    return Math.max(1, b.totalFloors || b.capacity || b.numFloors || 1);
  }

  // Which floor a new resident moves into: the lowest vacant one, so the floors
  // of a block fill from the ground up and each floor has someone to find.
  function _pickFloorIndex(b) {
    const floors = _buildingFloorCount(b);
    if (floors <= 1) return 0;
    const occupants = _getBuildingOccupants(b);
    const taken = new Set();
    for (const name of occupants) {
      const f = $gameSystem._npcSociety?.[name]?.homeBuilding?.floorIndex;
      if (typeof f === 'number') taken.add(f);
    }
    for (let f = 0; f < floors; f++) if (!taken.has(f)) return f;
    return occupants.length % floors;
  }

  function _getBuildingMapName(building, groupName) {
    if (!building) return '';
    const mapId = building.mapId;
    if (mapId === 636) {
      const gName = groupName || building.groupName;
      const grp = gName ? $gameSystem?._npcMapGroups?.[gName] : null;
      if (grp?.displayName) return grp.displayName;
      if (grp?.biome) {
        const isPlace = !['Normal', 'Road'].includes(grp.biome);
        return isPlace ? (window.BiomeNames?.display?.(grp.biome) || grp.biome) : 'Frontier Settlement';
      }
      return window.MapManager?.getMapName?.(636) || 'Frontier Settlement';
    }
    if (mapId) {
      return window.MapManager?.getMapName?.(mapId) || ($dataMapInfos?.[mapId]?.name) || `Map ${mapId}`;
    }
    return '';
  }

  function _getHomeDescription(profile) {
    if (!profile) return '';
    if (profile.isHomeless) return 'Homeless';
    const b = profile.homeBuilding;
    if (!b) return '';
    const mapName = b.mapName || _getBuildingMapName(b, profile._homeGroupName || b.groupName);
    const coords = (b.x != null && b.y != null) ? `Door (${b.x}, ${b.y})` : '';
    const floorNum = (b.floorIndex != null ? b.floorIndex : 0) + 1;
    const floorStr = `Floor ${floorNum}`;
    return [mapName, coords, floorStr].filter(Boolean).join(' · ');
  }

  // Resolves the homeBuilding's procedural house template map via
  // ProceduralHouseSystem and caches it in profile.homeMapId.
  function _resolveHomeBuildingMap(profile) {
    const b = profile.homeBuilding;
    const PHS = window.ProceduralHouseSystem;
    if (!b) return;
    b.mapName = _getBuildingMapName(b, profile._homeGroupName || b.groupName);
    if (!PHS?._selectHouse) return;
    // In a multi-floor block each floor is a different interior template, so
    // resolve the NPC's own floor rather than the ground floor.
    let mapId = PHS.floorInteriorMapId
      ? PHS.floorInteriorMapId(b, b.floorIndex || 0)
      : null;
    if (!mapId) {
      const pool = b.type === 'enterMultiBuilding'
        ? (b.baseFloorPool || 'skyscrapers')
        : (b.poolName || profile.homePoolType || 'houses');
      mapId = PHS._selectHouse(b.seed, pool);
    }
    if (mapId) profile.homeMapId = mapId;
  }

  // Deterministically assigns a building from the group's residentialBuildings
  // cache to the NPC.
  function _assignHomeBuilding(profile, name, moveOpts = null) {
    if (!$gameSystem) return;
    // A rough sleeper (NPCSystem ResidentRegistry.makeRoughSleeper) has no door.
    if (profile?._sleepsRough) { profile.homeBuilding = null; profile.isHomeless = true; return; }
    if (!_isSentientForHomeOwnership(profile, name)) {
      profile.homeBuilding = null;
      return;
    }

    // If the NPC already has a stored home group (Local/Shop NPCs keep theirs
    // after wandering to other groups), use that; otherwise resolve from the
    // current map.
    let groupName = profile._homeGroupName;
    if (!groupName) {
      const mapId = $gameMap?.mapId();
      groupName   = mapId ? window.NPCSystem?.findMapGroupByMap?.(mapId) : null;
    }
    if (!groupName) return;

    const groups = $gameSystem._npcMapGroups;
    const all    = groups?.[groupName]?.residentialBuildings;
    if (!all?.length) {
      profile.isHomeless = true;
      return;
    }

    const buildings = all.filter(_isResidentialBuilding);
    if (!buildings.length) {
      profile.isHomeless = true;
      return;
    }

    // Housing tier check: only wealthy NPCs can be assigned to skyscrapers
    const isWealthy = _isWealthyForSkyscraper(profile);
    const eligibleBuildings = buildings.filter(b => isWealthy ? true : !_isSkyscraperBuilding(b));
    const targetPool = eligibleBuildings.length ? eligibleBuildings : buildings;

    const ws   = window.NPCShared ? window.NPCShared.worldSeed() : 19002001;
    const seed = nameHash(name + '_home') ^ ws;
    const rng  = new MiniRng(seed);
    for (let attempt = 0; attempt < targetPool.length; attempt++) {
      const idx       = Math.floor(rng.next() * targetPool.length);
      const candidate = targetPool[idx];
      if (!candidate.key) candidate.key = _makeBuildingKey(candidate, groupName);
      if (_getBuildingOccupants(candidate).length < candidate.capacity) {
        _moveInResident(profile, name, candidate, groupName, null, moveOpts);
        return;
      }
    }
    // If all buildings in pool are at capacity, check if any vacant building remains
    const vacant = targetPool.filter(b => _getBuildingOccupants(b).length < (b.capacity || 1));
    if (vacant.length > 0) {
      const pick = vacant[0];
      if (!pick.key) pick.key = _makeBuildingKey(pick, groupName);
      _moveInResident(profile, name, pick, groupName, null, moveOpts);
    } else {
      // Truly at capacity: NPC is homeless
      profile.isHomeless = true;
      profile.homeBuilding = null;
    }
  }

  // Moves an NPC into a specific building/floor, vacating whatever placeholder
  // residence they held before. If the NPC has a partner, cohabitates them on the same floor.
  // `moveOpts.alone` moves only this person: a relocation (resettle) moves
  // the partner on their own call, and one who stays behind must stay put.
  function _moveInResident(profile, name, building, groupName, forcedFloorIndex = null, moveOpts = null) {
    if (!profile) return;
    if (profile.homeBuilding?._placeholder) {
      _unregisterBuildingOccupant(profile.homeBuilding, name);
    }
    const floorIndex = (forcedFloorIndex !== null) ? forcedFloorIndex : _pickFloorIndex(building);
    const home = { ...building, groupName, floorIndex };
    delete home._placeholder;
    profile.homeBuilding   = home;
    profile.homeSeed       = home.seed;
    profile._homeGroupName = groupName;
    profile.isHomeless     = false;
    _registerBuildingOccupant(home, name);
    _resolveHomeBuildingMap(profile);

    // Cohabitate partner if exists in society
    const partnerName = _findPartnerName(name, profile);
    // A long-distance couple (NPCLifeSim FAMILY) keeps a home in each town.
    if (partnerName && !moveOpts?.alone && !window.NPCLifeSim?.livesApart?.(name, partnerName) &&
        $gameSystem?._npcSociety?.[partnerName]) {
      const pProf = $gameSystem._npcSociety[partnerName];
      const pHome = pProf.homeBuilding;
      if (!pHome || pHome._placeholder || pHome.seed !== home.seed || pHome.floorIndex !== floorIndex) {
        if (pHome) _unregisterBuildingOccupant(pHome, partnerName);
        const partnerHome = { ...home };
        pProf.homeBuilding   = partnerHome;
        pProf.homeSeed       = partnerHome.seed;
        pProf._homeGroupName = groupName;
        pProf.isHomeless     = false;
        _registerBuildingOccupant(partnerHome, partnerName);
        _resolveHomeBuildingMap(pProf);
      }
    }
  }

  // Everyone who counts as living in this town (sentient only)
  function _townResidentCandidates(groupName) {
    const names = new Set(window.NPCSystem?.getNPCNamesByGroup?.(groupName) || []);
    for (const [name, p] of Object.entries($gameSystem?._npcSociety || {})) {
      if (p && p._homeGroupName === groupName) names.add(name);
    }
    return [...names].filter(n => {
      const p = $gameSystem?._npcSociety?.[n];
      return _isSentientForHomeOwnership(p, n);
    }).sort();
  }

  // Makes sure the building the player just walked into is somebody's home.
  function ensureBuildingResidents(building, groupName) {
    if (!building || !groupName || !$gameSystem) return [];
    if (!_isResidentialBuilding(building)) return [];

    const registered = _registerGroupBuilding(building, groupName);
    const existing   = _getBuildingOccupants(registered).slice();
    const capacity   = Math.max(1, registered.capacity || 1);
    if (existing.length >= capacity) return existing;

    const isSky = _isSkyscraperBuilding(registered);
    const society = $gameSystem._npcSociety || {};
    const pool = _townResidentCandidates(groupName).filter(n => {
      if (existing.includes(n)) return false;
      const p = society[n];
      if (!p || !_isSentientForHomeOwnership(p, n)) return false;
      if (isSky && !_isWealthyForSkyscraper(p)) return false;
      if (p._sleepsRough) return false; // sleeps on the street by design
      return !p.homeBuilding || p.homeBuilding._placeholder === true || p.isHomeless;
    });
    if (!pool.length) return existing;

    const ws  = window.NPCShared ? window.NPCShared.worldSeed() : 19002001;
    const rng = new MiniRng(((registered.seed >>> 0) ^ ws ^ nameHash(groupName)) >>> 0);
    const target = 1 + Math.floor(rng.next() * capacity);
    const want   = Math.min(target, capacity, pool.length + existing.length) - existing.length;

    for (let i = 0; i < want && pool.length; i++) {
      const name = pool.splice(Math.floor(rng.next() * pool.length), 1)[0];
      _moveInResident(society[name], name, registered, groupName);
    }
    return _getBuildingOccupants(registered).slice();
  }

  // Houses a whole household on one floor of a building at once (NPCSystem's
  // procedural households). The cached entry's capacity is raised to hold
  // them, so the town's homeless are never squeezed in on top of a family.
  function moveInHousehold(building, groupName, names, floorIndex = 0) {
    if (!building || !groupName || !$gameSystem || !names?.length) return 0;
    const registered = _registerGroupBuilding(building, groupName);
    const society = $gameSystem._npcSociety || {};
    let moved = 0;
    for (const name of names) {
      const profile = society[name];
      if (!profile || !_isSentientForHomeOwnership(profile, name)) continue;
      const home = profile.homeBuilding;
      if (home && !home._placeholder && _getBuildingKey(home) === registered.key &&
          (home.floorIndex || 0) === floorIndex) continue;
      if (home) _unregisterBuildingOccupant(home, name);
      _moveInResident(profile, name, registered, groupName, floorIndex);
      moved++;
    }
    registered.capacity = Math.max(registered.capacity || 1, _getBuildingOccupants(registered).length);
    return moved;
  }

  // Do these two live behind the same door, on the same floor?
  function sharesHome(nameA, nameB) {
    const society = $gameSystem?._npcSociety || {};
    const a = society[nameA]?.homeBuilding, b = society[nameB]?.homeBuilding;
    if (!a || !b || a._placeholder || b._placeholder) return false;
    return _getBuildingKey(a) === _getBuildingKey(b) && (a.floorIndex || 0) === (b.floorIndex || 0);
  }

  // Of two people sharing a home, the one on the lease: whoever moved in
  // first. null when the register does not say.
  function leaseHolderOf(nameA, nameB) {
    const home = $gameSystem?._npcSociety?.[nameA]?.homeBuilding;
    if (!home) return null;
    const occupants = _getBuildingOccupants(home);
    const ia = occupants.indexOf(nameA), ib = occupants.indexOf(nameB);
    if (ia < 0 || ib < 0) return null;
    return ia < ib ? nameA : nameB;
  }

  // Somebody leaves the home they shared (NPCLifeSim FAMILY, after a split),
  // with `opts.withNames` (the children) when they go too. First another home
  // in town with room for all of them; else out of town, when the life
  // simulation offers a relocation; else the street, alone, and the children
  // stay where they were. Answers { name, building?, relocated?, rough }.
  function moveOut(name, opts = {}) {
    const society = $gameSystem?._npcSociety || {};
    const profile = society[name];
    if (!profile) return null;
    const old = profile.homeBuilding;
    const groupName = profile._homeGroupName || old?.groupName || null;
    const withNames = (opts.withNames || []).filter(n => n !== name && society[n]);
    const leaving = [name, ...withNames];
    const oldKey = old && !old._placeholder ? _getBuildingKey(old) : null;

    const all = (groupName && $gameSystem._npcMapGroups?.[groupName]?.residentialBuildings) || [];
    const pool = all.filter(b => b && _isResidentialBuilding(b) &&
      (!_isSkyscraperBuilding(b) || _isWealthyForSkyscraper(profile)));
    const ws = window.NPCShared ? window.NPCShared.worldSeed() : 19002001;
    const rng = new MiniRng((nameHash(name + '_moveout_' + ($gameVariables?.value(114) ?? 0)) ^ ws) >>> 0);
    const start = pool.length ? Math.floor(rng.next() * pool.length) : 0;
    let chosen = null;
    for (let i = 0; i < pool.length && !chosen; i++) {
      const b = pool[(start + i) % pool.length];
      if (!b.key) b.key = _makeBuildingKey(b, groupName);
      if (b.key === oldKey) continue;
      if (_getBuildingOccupants(b).length + leaving.length <= Math.max(1, b.capacity || 1)) chosen = b;
    }
    if (chosen) {
      for (const n of leaving) {
        const p = society[n];
        if (p.homeBuilding) _unregisterBuildingOccupant(p.homeBuilding, n);
      }
      const floor = _pickFloorIndex(chosen);
      for (const n of leaving) _moveInResident(society[n], n, chosen, groupName, floor);
      return { name, building: chosen, rough: false };
    }

    const relocate = window.NPCLifeSim?.relocate;
    if (typeof relocate === 'function') {
      try {
        if (relocate(name, { reason: opts.reason || 'separation', withNames })) return { name, relocated: true, rough: false }; // i18n-ignore: reason id
      } catch (e) { console.error(`[NPCSim] relocating "${name}" failed:`, e); }
    }

    if (old) _unregisterBuildingOccupant(old, name);
    profile.homeBuilding = null;
    profile.isHomeless = true;
    return { name, rough: true };
  }

  // Somebody moving to another town (NPCLifeSim RELOCATION, through NPCSystem's
  // rehomeResident): the old door is given up and a home found in the new
  // town, either behind `joinHome` (the household they move with) or the one
  // the town's register deals them. A town whose doors are not known yet (a
  // procedural square nobody has walked onto) houses them the first time a
  // building there is entered (ensureBuildingResidents). Answers the home.
  function resettle(name, groupName, joinHome = null) {
    const profile = $gameSystem?._npcSociety?.[name];
    if (!profile || !groupName) return null;
    if (profile.homeBuilding) _unregisterBuildingOccupant(profile.homeBuilding, name);
    profile.homeBuilding = null;
    delete profile.homeMapId;
    delete profile._sleepsRough;
    profile.isHomeless = false;
    profile._homeGroupName = groupName;
    if (!_isSentientForHomeOwnership(profile, name)) return null;
    if (joinHome && !joinHome._placeholder) {
      const registered = _registerGroupBuilding(joinHome, groupName);
      _moveInResident(profile, name, registered, groupName, joinHome.floorIndex || 0, { alone: true });
      registered.capacity = Math.max(registered.capacity || 1, _getBuildingOccupants(registered).length);
      return profile.homeBuilding || null;
    }
    if ($gameSystem._npcMapGroups?.[groupName]?.residentialBuildings?.length) {
      _assignHomeBuilding(profile, name, { alone: true });
    }
    return profile.homeBuilding || null;
  }

  // Hands out the front doors of ONE map to a named set of NPCs
  function assignHomesOnMap(mapId, groupName, names) {
    if (!$gameSystem || !mapId || !groupName || !names?.length) return 0;
    const all = $gameSystem._npcMapGroups?.[groupName]?.residentialBuildings;
    if (!all?.length) return 0;

    const buildings = all.filter(b => b && b.mapId === mapId && _isResidentialBuilding(b));
    if (!buildings.length) return 0;
    for (const b of buildings) {
      if (!b.key) b.key = _makeBuildingKey(b, groupName);
      b.groupName = groupName;
    }

    const society = $gameSystem._npcSociety || {};
    const ws = window.NPCShared ? window.NPCShared.worldSeed() : 19002001;
    let housed = 0;

    for (const name of names) {
      const profile = society[name];
      if (!profile || !_isSentientForHomeOwnership(profile, name)) continue;
      if (profile._sleepsRough) continue;
      const home = profile.homeBuilding;
      const settled = home && !home._placeholder;
      if (settled && home.mapId === mapId) continue;
      if (settled && profile._homeGroupName && profile._homeGroupName !== groupName) continue;

      const isSky = _isSkyscraperBuilding(home);
      const eligible = buildings.filter(b => _isWealthyForSkyscraper(profile) ? true : !_isSkyscraperBuilding(b));
      const pool = eligible.length ? eligible : buildings;

      const rng = new MiniRng((nameHash(name + '_cityhome') ^ ws) >>> 0);
      let chosen = null;
      for (let attempt = 0; attempt < pool.length; attempt++) {
        const candidate = pool[Math.floor(rng.next() * pool.length)];
        if (_getBuildingOccupants(candidate).length < Math.max(1, candidate.capacity || 1)) {
          chosen = candidate;
          break;
        }
      }
      if (!chosen) chosen = pool.find(b => _getBuildingOccupants(b).length < Math.max(1, b.capacity || 1));

      if (chosen) {
        if (settled) _unregisterBuildingOccupant(home, name);
        _moveInResident(profile, name, chosen, groupName);
        housed++;
      } else {
        profile.isHomeless = true;
        profile.homeBuilding = null;
      }
    }
    return housed;
  }

  // Adds the building to its town's residentialBuildings cache if it is not
  // already there, and returns the cached instance so callers always mutate the
  // one shared descriptor (keys, capacity) rather than a private copy.
  function _registerGroupBuilding(building, groupName) {
    const groups = $gameSystem._npcMapGroups || ($gameSystem._npcMapGroups = {});
    const group  = groups[groupName] || (groups[groupName] = { maps: [], mainMaps: [], residentialBuildings: [] });
    if (!Array.isArray(group.residentialBuildings)) group.residentialBuildings = [];

    const key = _makeBuildingKey(building, groupName);
    let entry = group.residentialBuildings.find(b => _makeBuildingKey(b, groupName) === key);
    if (!entry) {
      // floorIndex/interiorMapId describe the floor the player happens to be
      // standing on, not the building, so they never belong in the cache entry.
      entry = { ...building, groupName };
      delete entry.floorIndex;
      delete entry.interiorMapId;
      group.residentialBuildings.push(entry);
    }
    entry.key = key;
    entry.groupName = groupName;
    building.key = key;
    building.groupName = groupName;
    if (building.type === 'enterMultiBuilding') {
      entry.totalFloors = _buildingFloorCount(building);
      entry.capacity = Math.max(entry.capacity || 0, entry.totalFloors);
    }
    delete entry._placeholder;
    return entry;
  }

  // Is this NPC at home on `mapId` (the map loaded now when omitted)? A home
  // with a door is one building and floor: inside a building it is home only
  // when it is THAT building and floor, so a house drawn from the same
  // template as somebody else's is not theirs. The street outside it (the
  // building's own map) counts too. A home that was only ever an abstract
  // template is matched on the template, which is all it has.
  function isHomeHere(profile, mapId = null) {
    if (!profile) return false;
    const here = mapId != null ? mapId : ($gameMap ? $gameMap.mapId() : null);
    if (here == null) return false;
    const home = profile.homeBuilding;
    const PHS = window.ProceduralHouseSystem;
    const inside = !!(PHS?.houseInstanceKey && $gameMap && $gameMap.mapId() === here && PHS.houseInstanceKey(here));
    if (home) {
      if (home.mapId === here) return true;
      if (!inside) return false;
      return PHS.isCurrentHome?.(home, profile._homeGroupName || home.groupName) === true;
    }
    return profile.homeMapId === here;
  }

  // Residents of a building, optionally narrowed to one floor. Used by the
  // spawner to decide who should be inside when the player walks in at night or day.
  function getBuildingResidents(building, floorIndex = null, groupName = null) {
    if (!building) return [];
    if (!building.key && groupName) building.key = _makeBuildingKey(building, groupName);
    const names = _getBuildingOccupants(building);
    const society = $gameSystem?._npcSociety || {};
    if (floorIndex === null || _buildingFloorCount(building) <= 1) {
      return names.filter(n => _isSentientForHomeOwnership(society[n], n));
    }
    return names.filter(n => {
      if (!_isSentientForHomeOwnership(society[n], n)) return false;
      return (society[n]?.homeBuilding?.floorIndex ?? 0) === floorIndex;
    });
  }

  Object.assign(NPCSim._internal, {
    _assignHomeBuilding, _getBuildingMapName, _getHomeDescription, _registerBuildingOccupant, isHomeHere,
    assignHomesOnMap, ensureBuildingResidents, getBuildingResidents, leaseHolderOf, moveInHousehold,
    moveOut, resettle, sharesHome,
  });
})();
