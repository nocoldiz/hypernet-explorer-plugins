/*:
 * @target MZ
 * @plugindesc NPC System: the resident registry of the hand-made towns
 * @author Omni-Lex
 * @base NPCSystem
 * @orderAfter NPCSystem
 * @orderAfter NPCSystem_RoadTravellers
 * @help
 * ============================================================================
 * NPCSystem_Residents, part of the NPCSystem family
 * ============================================================================
 * Owns ResidentRegistry.
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCSystem._internal and publishes its own there. Load it right after
 * NPCSystem_RoadTravellers.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const {
    Config, GroupRegistry, NPCPoolStore, ORTHO_DIRS, ProceduralManager, SpawnManager, Utils,
  } = window.NPCSystem._internal;

  // ==========================================================================
  // RESIDENT REGISTRY
  // ==========================================================================
  // The people of the hand-made towns. There used to be a pool: the generic
  // NPC events authored on each group's maps were harvested into a manifest
  // and shuffled between towns, so every world was walked by the same eighty
  // faces. Now every map group is populated by the world seed instead, when the
  // world is made, and the same seed always makes the same people:
  //
  //   1. A household behind every front door, one per floor of a walk-up. The
  //      family system the procedural squares already use
  //      (ProceduralManager.planHousehold / _ensureInteriorRoster /
  //      ensureHousehold) is extended to the authored doors: a couple, their
  //      grown children, a grandparent, bound as a family on their life records
  //      and moved in on their profiles.
  //   2. Street-folk topped up per map to Config.RESIDENT_DENSITY, so the
  //      squares, stations and shops with no doors of their own have people.
  //   3. Extra hands on the main map until every job and counter shift of the
  //      group can be staffed out of the town's own adults.
  //
  // Every one of them is local: their home map is the map their door (or
  // their street) is on, and that is where they are found, until they are
  // killed or recruited (GoneRegistry keys on the name, and names are unique
  // world-wide). The one reason they leave it is work: whoever is dealt a job
  // or a shop counter shift (JobShiftManager / ShopShiftManager, NPCSimulation
  // Core.js) is on that map during the shift and back home as an ordinary
  // person after it (NPCSim.scheduledMapForNPC).
  //
  // What is kept per world: $gameSystem._npcResidents[group] =
  //   { v, homes: { name: mapId } }
  // plus the profiles themselves in the society. World-shared through the
  // world folder (residents via WorldManager), so every savegame of a world
  // meets the same town.
  const ResidentRegistry = {
    VERSION: 1,
    _reserved: null,

    _store() {
      if (!$gameSystem) return {};
      return $gameSystem._npcResidents || ($gameSystem._npcResidents = {});
    },

    entry(groupName) {
      const e = $gameSystem?._npcResidents?.[groupName];
      return e && e.v === ResidentRegistry.VERSION ? e : null;
    },

    // Changes whenever the group's roster does, so pools memoised against it
    // are rebuilt (SpawnManager.getNPCPool).
    stamp(groupName) {
      const e = ResidentRegistry.entry(groupName);
      return e ? `${e.v}:${Object.keys(e.homes || {}).length}` : "none"; // i18n-ignore: cache key
    },

    isResident(name) {
      return !!(name && $gameSystem?._npcSociety?.[name]?._resident);
    },

    homeMapOf(name) {
      return $gameSystem?._npcSociety?.[name]?._residentHomeMap ?? null;
    },

    namesOf(groupName) {
      const e = ResidentRegistry.entry(groupName);
      return e ? Object.keys(e.homes || {}) : [];
    },

    // Every resident of every group, as { name, group, mapId, characterName,
    // characterIndex }: what the quest board, the jury pool and the counter
    // rotas' out-of-towners are drawn from.
    worldResidents() {
      const out = [];
      const society = $gameSystem?._npcSociety || {};
      for (const group of Object.keys($gameSystem?._npcResidents || {}).sort()) {
        const e = ResidentRegistry.entry(group);
        if (!e) continue;
        for (const [name, mapId] of Object.entries(e.homes || {})) {
          const p = society[name];
          if (!p) continue;
          out.push({ name, group, mapId, characterName: p.spriteKey || "", characterIndex: p.bustIndex || 0 });
        }
      }
      return out;
    },

    // Names the authored cast already answers to: a resident is never dealt
    // one, or two people would share a society profile.
    isReservedName(name) {
      if (!ResidentRegistry._reserved) {
        const set = new Set();
        const manifest = NPCPoolStore.load() || {};
        for (const [key, pool] of Object.entries(manifest)) {
          if (key.startsWith("__") || !Array.isArray(pool)) continue;
          for (const tpl of pool) if (tpl?.eventData?.name) set.add(tpl.eventData.name);
        }
        ResidentRegistry._reserved = set;
      }
      return ResidentRegistry._reserved.has(name);
    },

    // A <Story> character of the authored cast: a written person the rest of
    // the simulation never drafts, moves or sends anywhere.
    isStoryName(name) {
      if (!ResidentRegistry._story) {
        const set = new Set();
        const manifest = NPCPoolStore.load() || {};
        for (const [key, pool] of Object.entries(manifest)) {
          if (key.startsWith("__") || !Array.isArray(pool)) continue;
          for (const tpl of pool) {
            const ev = tpl?.eventData;
            if (ev?.name && Utils.hasStoryTag(ev.note)) set.add(ev.name);
          }
        }
        ResidentRegistry._story = set;
      }
      return ResidentRegistry._story.has(name);
    },

    // How many people a map holds before its doors are counted, off its size.
    headCount(mapId) {
      if (Config.isNPCFreeMap(mapId)) return 0;
      const meta = NPCPoolStore.mapMeta(mapId);
      if (!meta || !meta.w || !meta.h) return 0;
      const D = Config.RESIDENT_DENSITY;
      const rule = D[meta.env] || D.None;
      let n = Math.floor((meta.w * meta.h) / rule.area);
      n = Math.max(rule.min, Math.min(rule.max, n));
      if (meta.main) n = Math.round(n * D.mainMultiplier);
      if (meta.abandoned) n = Math.round(n * D.abandonedMultiplier);
      return n;
    },

    // The authored door record a building the party walked into stands for:
    // the one on the same map closest to where it was entered from.
    doorFor(building, groupName) {
      if (!building) return null;
      const doors = (GroupRegistry.get(groupName)?.residentialBuildings || [])
        .filter(b => b && b.mapId === building.mapId && b.mapId !== 636);
      let best = null, bd = 3;
      for (const b of doors) {
        const d = Math.abs(b.x - building.x) + Math.abs(b.y - building.y);
        if (d < bd) { bd = d; best = b; }
      }
      return best;
    },

    // Is this door one whose households were dealt with the world?
    isResidentDoor(building, groupName) {
      return !!(ResidentRegistry.entry(groupName) && ResidentRegistry.doorFor(building, groupName));
    },

    // Nobody's door: no house, no bed, the night spent on the street. Kept off
    // every home the town hands out afterwards (NPCSim.ensureBuildingResidents,
    // assignHomesOnMap, registerProcCitizen).
    makeRoughSleeper(name) {
      const profile = $gameSystem?._npcSociety?.[name];
      if (!profile) return false;
      profile._sleepsRough = true;
      profile.isHomeless = true;
      profile.homeBuilding = null;
      return true;
    },

    _mark(name, groupName, mapId, entry) {
      const profile = $gameSystem._npcSociety?.[name];
      if (!profile) return false;
      profile._resident = true;
      profile._residentHomeMap = mapId;
      profile._homeGroupName = groupName;
      entry.homes[name] = mapId;
      return true;
    },

    // Somebody moving to another town for good (NPCLifeSim RELOCATION). They
    // leave the old group's register (or its list of newcomers) and join the
    // new one: a hand-made town's register with the map their new door is on,
    // a procedural square's newcomers ($gameSystem._npcImmigrants[group]),
    // since a square keeps no register of its own and is populated as it is
    // walked onto (ProceduralManager.placeArrivals). The door itself is found
    // by NPCSim.resettle; `opts.joinHome` is the household they move in with.
    rehome(name, fromGroup, toGroup, opts) {
      const profile = $gameSystem?._npcSociety?.[name];
      if (!profile || !toGroup) return false;
      const from = fromGroup || profile._homeGroupName || null;
      const store = ResidentRegistry._store();
      if (from && store[from]?.homes && Object.prototype.hasOwnProperty.call(store[from].homes, name)) {
        delete store[from].homes[name];
      }
      const imm = $gameSystem._npcImmigrants || {};
      for (const g of Object.keys(imm)) {
        const i = Array.isArray(imm[g]) ? imm[g].indexOf(name) : -1;
        if (i >= 0) imm[g].splice(i, 1);
      }
      if ($gameSystem._npcResidentSpots?.[name]) delete $gameSystem._npcResidentSpots[name];
      for (const list of Object.values($gameSystem._npcGroupAssignments || {})) {
        if (!Array.isArray(list)) continue;
        for (let i = list.length - 1; i >= 0; i--) if (list[i]?.name === name) list.splice(i, 1);
      }

      profile._homeGroupName = toGroup;
      profile._routineDay = -1;
      try { window.NPCSim?.resettle?.(name, toGroup, opts?.joinHome || null); } catch (e) {
        console.error(`[NPC System] Could not find "${name}" a home in "${toGroup}"`, e);
      }

      if (Config.isProceduralGroup(toGroup)) {
        profile._resident = false;
        profile._residentHomeMap = null;
        const list = imm[toGroup] || (imm[toGroup] = []);
        if (!list.includes(name)) list.push(name);
      } else {
        const entry = ResidentRegistry.entry(toGroup) || ResidentRegistry.ensureGroup(toGroup);
        const group = GroupRegistry.get(toGroup);
        const mapId = profile.homeBuilding?.mapId ?? (group?.mainMaps || [])[0] ?? (group?.maps || [])[0] ?? null;
        if (entry && mapId != null) {
          ResidentRegistry._mark(name, toGroup, mapId, entry);
        } else {
          profile._resident = false;
          profile._residentHomeMap = null;
        }
      }
      // Reassigned, not only mutated, so the world folder hears of both.
      $gameSystem._npcResidents = store;
      $gameSystem._npcImmigrants = imm;
      return true;
    },

    // The newcomers who made a procedural square their home.
    immigrantsOf(groupName) {
      const list = $gameSystem?._npcImmigrants?.[groupName];
      return Array.isArray(list) ? list.slice() : [];
    },

    // Deals one group's people. Idempotent: a group already dealt in this
    // world is left exactly as it is.
    ensureGroup(groupName) {
      if (!$gameSystem || !groupName || Config.isProceduralGroup(groupName)) return null;
      const have = ResidentRegistry.entry(groupName);
      if (have) return have;
      const group = GroupRegistry.get(groupName);
      if (!group) return null;
      const entry = { v: ResidentRegistry.VERSION, homes: {} };
      const store = ResidentRegistry._store();
      // Nobody is left in an empty world: the town stays empty, and dealing it
      // would only fill the society with people who can never be met.
      if (Config.isEmptyWorld()) {
        store[groupName] = entry;
        $gameSystem._npcResidents = store;
        return entry;
      }
      // Nobody can be minted before the society's personality and sprite
      // tables have loaded; the town is dealt on the next ask instead of being
      // stored empty for good.
      if (!window.NPCSocietyRegistry?.ensureProfile || window._NPCSocietyDataLoader?.isReady === false) return null;
      const ws = (window.NPCShared?.worldSeed?.() ?? 19002001) >>> 0;
      const maps = [...new Set(group.maps || [])].sort((a, b) => a - b).filter(m => !Config.isNPCFreeMap(m));
      const inGroup = new Set(maps);

      // 1. A household behind every door, one per floor.
      const PHS = window.ProceduralHouseSystem;
      const doors = (group.residentialBuildings || [])
        .filter(b => b && inGroup.has(b.mapId) && b.mapId !== 636)
        .slice().sort((a, b) => a.mapId - b.mapId || (a.eventId || 0) - (b.eventId || 0));
      for (const door of doors) {
        if (PHS?.isSkyscraperBuilding?.(door)) continue; // public floors, nobody lives there
        const floors = Math.max(1, door.totalFloors || 1);
        for (let f = 0; f < floors; f++) {
          const names = ProceduralManager.ensureGroupHousehold(Object.assign({}, door, { floorIndex: f }), groupName);
          for (const n of names) ResidentRegistry._mark(n, groupName, door.mapId, entry);
        }
      }

      // 2. Street-folk, to the density the map's size asks for.
      const onMap = (m) => Object.values(entry.homes).filter(v => v === m).length;
      const hasOwnDoor = (n) => {
        const b = $gameSystem._npcSociety?.[n]?.homeBuilding;
        return !!(b && !b._placeholder);
      };
      const streetFolk = (mapId, count, tag) => {
        for (let i = 0; i < count; i++) {
          const seed = (Utils.nameHash(`${groupName}:${mapId}:${tag}:${i}`) ^ ws) >>> 0; // i18n-ignore: seed key
          const rng = ProceduralManager._creatureRng(seed);
          const member = { role: "regular", age: rng.nextInt(18, 76), gender: null };
          const name = ProceduralManager._mintInteriorCitizen(member, seed, groupName, null, { homeMapId: mapId });
          if (name) ResidentRegistry._mark(name, groupName, mapId, entry);
        }
      };
      for (const mapId of maps) {
        const need = ResidentRegistry.headCount(mapId) - onMap(mapId);
        if (need > 0) streetFolk(mapId, need, "street"); // i18n-ignore: seed key
      }

      // 2b. A few of the street-folk have no door at all: they sleep rough on
      // the street they live on. Seeded, so the same people every time.
      const outdoor = Object.keys(entry.homes)
        .filter(n => NPCPoolStore.mapMeta(entry.homes[n])?.env === "Exterior" && !hasOwnDoor(n)) // i18n-ignore: map env tag
        .sort((a, b) => ((Utils.nameHash(`rough:${a}`) ^ ws) >>> 0) - ((Utils.nameHash(`rough:${b}`) ^ ws) >>> 0)); // i18n-ignore: seed key
      if (outdoor.length) {
        const rough = Math.max(1, Math.round(Object.keys(entry.homes).length * Config.RESIDENT_HOMELESS_SHARE));
        for (const n of outdoor.slice(0, rough)) ResidentRegistry.makeRoughSleeper(n);
      }

      // 3. Enough hands for every job and counter shift.
      // A job is staffed for the shifts it keeps (Jobs.json "shifts": a bank
      // is open by day, a hospital around the clock); a counter for all three.
      const SHIFTS = 3;
      const jobShifts = (id) => {
        const job = (window.WorkSystem?.Jobs || []).find(j => j && j.id === id);
        return Array.isArray(job?.shifts) && job.shifts.length ? job.shifts.length : SHIFTS;
      };
      let positions = 0;
      for (const jobIds of Object.values(group.jobs || {})) {
        for (const id of (jobIds || [])) positions += jobShifts(id);
      }
      for (const mId of maps) {
        const counters = (SpawnManager.getShopIndex(mId) || [])
          .filter(s => s.shopTagged && !s.hasGraphic && !s.story && !s.local);
        positions += counters.length * SHIFTS;
      }
      const hands = Math.floor(Object.keys(entry.homes).length * Config.RESIDENT_WORKFORCE_SHARE);
      if (positions > hands) {
        const hub = (group.mainMaps || []).find(m => inGroup.has(m)) || maps[0];
        if (hub) streetFolk(hub, Math.ceil((positions - hands) / Config.RESIDENT_WORKFORCE_SHARE), "hands"); // i18n-ignore: seed key
      }

      // A town that came out with nobody in it was dealt before the society
      // could mint anybody: not kept, so it is dealt again next time.
      if (!Object.keys(entry.homes).length && maps.some(m => ResidentRegistry.headCount(m) > 0)) return null;
      store[groupName] = entry;
      // Reassigned, not only mutated, so the world folder hears of it.
      $gameSystem._npcResidents = store;
      Utils.debug(`Residents of ${groupName}: ${Object.keys(entry.homes).length} people.`);
      return entry;
    },

    // Deals every hand-made group, in a fixed order, when the world is made.
    ensureWorld() {
      if (!$gameSystem) return 0;
      let total = 0;
      for (const groupName of Object.keys(GroupRegistry.build() || {}).sort()) {
        if (Config.isProceduralGroup(groupName)) continue;
        try {
          const e = ResidentRegistry.ensureGroup(groupName);
          if (e) total += Object.keys(e.homes).length;
        } catch (err) {
          console.error(`[NPC System] Could not deal the residents of "${groupName}"`, err);
        }
      }
      return total;
    },

    // A resident as a spawn template, cloned off the citizen event of Map574
    // and dressed in the face and class their profile was minted with.
    template(name) {
      const profile = $gameSystem?._npcSociety?.[name];
      if (!profile?.spriteKey) return null;
      const tpl = NPCPoolStore.template("citizen");
      if (!tpl) return null;
      const classId = profile.assignedClassId ?? null;
      tpl.name = name;
      tpl.note = classId ? `NPC-${classId} AI` : "NPC AI"; // i18n-ignore: event notetags
      tpl.characterName = profile.spriteKey;
      tpl.characterIndex = profile.bustIndex || 0;
      for (const page of tpl.pages || []) {
        if (!page?.image || (page.list?.length ?? 0) <= 1) continue;
        page.image.characterName = profile.spriteKey;
        page.image.characterIndex = profile.bustIndex || 0;
      }
      return tpl;
    },

    templatesFor(groupName) {
      const e = ResidentRegistry.entry(groupName);
      if (!e) return [];
      const out = [];
      for (const [name, mapId] of Object.entries(e.homes || {})) {
        const eventData = ResidentRegistry.template(name);
        if (eventData) out.push({ eventData, eventId: null, mapId, generated: true });
      }
      return out;
    },

    // Where a resident stands when they are dealt onto a map: the spot they
    // were last seen on, else the free tile nearest their front door, else the
    // next spread tile. Remembered per world.
    spotFor(name, mapId, spreadTiles) {
      const spots = $gameSystem._npcResidentSpots || ($gameSystem._npcResidentSpots = {});
      const free = (x, y) => $gameMap.isValid(x, y) && ORTHO_DIRS.some(d => $gameMap.isPassable(x, y, d)) &&
        !Utils.isBlockedTerrain(x, y) && $gameMap.eventsXy(x, y).length === 0 &&
        !($gamePlayer && $gamePlayer.pos(x, y));
      const known = spots[name];
      if (known && known.m === mapId && free(known.x, known.y)) return { x: known.x, y: known.y };
      let spot = null;
      const door = $gameSystem._npcSociety?.[name]?.homeBuilding;
      if (door && door.mapId === mapId) {
        for (let r = 1; r <= 4 && !spot; r++) {
          for (let dy = -r; dy <= r && !spot; dy++) {
            for (let dx = -r; dx <= r && !spot; dx++) {
              if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
              if (free(door.x + dx, door.y + dy)) spot = { x: door.x + dx, y: door.y + dy };
            }
          }
        }
      }
      while (!spot && spreadTiles.length) {
        const t = spreadTiles.shift();
        if (free(t.x, t.y)) spot = t;
      }
      if (spot) {
        spots[name] = { m: mapId, x: spot.x, y: spot.y };
        $gameSystem._npcResidentSpots = spots;
      }
      return spot;
    },
  };

  Object.assign(window.NPCSystem._internal, {
    ResidentRegistry,
  });
})();
