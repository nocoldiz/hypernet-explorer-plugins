/*:
 * @target MZ
 * @plugindesc NPC System: the procedural squares, creatures loose and the gone registry
 * @author Omni-Lex
 * @base NPCSystem
 * @orderAfter NPCSystem
 * @orderAfter NPCSystem_Spawn
 * @help
 * ============================================================================
 * NPCSystem_Procedural, part of the NPCSystem family
 * ============================================================================
 * Owns the stitched procedural window, ProceduralManager (its road-traveller
 * methods are added by NPCSystem_RoadTravellers.js), the creatures loose on a
 * square and GoneRegistry (window.NPCGone).
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCSystem._internal and publishes its own there. Load it right after
 * NPCSystem_Spawn.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const {
    _populateGroupJobs, _scanMapForResidentialBuildings, buildNPCCharacterPool, Config,
    GroupRegistry, MapManager, ORTHO_DIRS, pickNPCCharacter, SETTLEMENT_DOOR_FEATURES, SpawnManager,
    Utils,
  } = window.NPCSystem._internal;
  // Owned by modules that load after this one, bound once the family is in.
  let goblinizeMapNPCs, mintEvent, NPCController, pitchCamp, ResidentRegistry;
  window.NPCSystem._internal._late.push(() => ({
    goblinizeMapNPCs, mintEvent, NPCController, pitchCamp, ResidentRegistry,
  } = window.NPCSystem._internal));

  // Scans the current map's feature layers (2-3, matching
  // ProceduralHouseSystem.facedInteractFeatureName) for any tile belonging to
  // SETTLEMENT_DOOR_FEATURES and returns their {x,y} coordinates.
  // ==========================================================================
  // THE STITCHED PROCEDURAL WINDOW
  // --------------------------------------------------------------------------
  // Map 636 no longer holds one world square: WorldMapReturn's ProcStitch lays
  // up to 3x3 neighbouring squares side by side on it, and the party walks from
  // one into the next without a transfer. Two things follow for the people.
  //
  // First, a citizen belongs to ONE square. The settlement they are registered
  // in (ensureProcSettlement) is per world coordinate, so the whole population
  // has to go in the party's own square and nowhere else. Everything in
  // setupProceduralMapNPCs is written in square coordinates already, having been
  // written when the map WAS the square, so it is run inside the square-local
  // view ProcStitch provides: $gameMap answers for the party's cell, and the
  // positions the pass hands to locate() come back out in map space.
  //
  // Second, a crossing no longer reloads the map, so the square-changed hook is
  // the only notice that the people have to be replaced. Registered on the first
  // procedural map load rather than at plugin load time, because WorldMapReturn
  // loads after this file and window.ProcStitch does not exist yet when it does.
  let procStitchHooked = false;

  function populateProceduralSquare() {
    // Walking from one square into the next is not a map load, so the Horde's
    // ground has to be re-read here: the party may have just crossed into it.
    if (Config.isGoblinHordeGround()) goblinizeMapNPCs();
    const S = window.ProcStitch;
    // The square's own people first, then its visitors and newcomers on the
    // slots left over (NPCLifeSim TRAVELLING / RELOCATION).
    const populate = () => {
      const out = ProceduralManager.setupProceduralMapNPCs();
      try { ProceduralManager.placeArrivals(); } catch (e) {
        console.error("[NPC System] Could not place the square's visitors", e);
      }
      return out;
    };
    return (S && S.active()) ? S.inPartySquare(populate) : populate();
  }

  function registerProcStitchHook() {
    if (procStitchHooked) return;
    const S = window.ProcStitch;
    if (!S || typeof S.onSquareChanged !== "function") return;
    procStitchHooked = true;
    S.onSquareChanged(() => populateProceduralSquare());
  }

  function getSettlementDoorTiles() {
    const U = window.ProcGenUtils;
    if (!U || !U.Cache || !U.createTileToFeatureMap || !U.getFeatureNameFromTileId) return [];
    if (!$gameMap || !$dataMap) return [];
    const tileset = $gameMap.tileset();
    const tilesetId = tileset ? tileset.id : 0;
    if (!tilesetId) return [];
    const lookup = U.createTileToFeatureMap(U.Cache.getTilesetFeatures(tilesetId));
    if (!lookup) return [];

    const w = $gameMap.width();
    const h = $gameMap.height();
    const found = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        for (const z of [2, 3]) {
          const tileId = $gameMap.tileId(x, y, z);
          if (tileId === 0) continue;
          const name = U.getFeatureNameFromTileId(tileId, lookup);
          if (SETTLEMENT_DOOR_FEATURES.has(name)) {
            found.push({ x, y, feature: name });
            break;
          }
        }
      }
    }
    return found;
  }

  // A door/tent tile is the building's entrance: the player has to stand on a
  // tile touching it and face it to go in (see
  // ProceduralHouseSystem.facedInteractFeatureName), so the ring around it must
  // stay walkable. Citizens belonging to that building are scattered in the
  // band beyond the doorstep instead of parked on it.
  const DOOR_CLEARANCE = 1;        // Chebyshev ring kept free around every door
  const DOOR_CLUSTER_RADIUS = 5;   // still counts as "outside this building"

  // A lone farmstead or tent standing on an open-country tile is one
  // household, not a hamlet: at most ONE citizen is ever found outside it, and
  // only for some of them, so a tile carrying a handful of doors reads as
  // scattered country people rather than a crowd. The cap holds however many
  // buildings the prefab pass dropped.
  const DOOR_NPC_CHANCE = 0.6;     // odds a given building has someone outside
  const DOOR_NPC_CAP = 4;          // most citizens a doorside cluster may total

  // Keys of every tile within DOOR_CLEARANCE of one of the given door tiles.
  function getDoorwayClearance(doorTiles) {
    const blocked = new Set();
    for (const d of doorTiles) {
      for (let dy = -DOOR_CLEARANCE; dy <= DOOR_CLEARANCE; dy++) {
        for (let dx = -DOOR_CLEARANCE; dx <= DOOR_CLEARANCE; dx++) {
          blocked.add(`${d.x + dx},${d.y + dy}`);
        }
      }
    }
    return blocked;
  }

  // One tile per NPC, scattered around the doors round-robin (so several lone
  // buildings each get their own citizens instead of everyone piling onto the
  // first). Picking at random out of the whole free band beats picking the
  // nearest tile, which always resolved to the doorstep the player needs.
  function pickDoorClusterTiles(doorTiles, validTiles, count, baseSeed) {
    const blocked = getDoorwayClearance(doorTiles);
    const free = validTiles.filter(t => !blocked.has(`${t.x},${t.y}`));
    const used = new Set();
    const tiles = [];

    for (let i = 0; i < count; i++) {
      const door = doorTiles[i % doorTiles.length];
      const band = [];
      for (const t of free) {
        if (used.has(`${t.x},${t.y}`)) continue;
        const dist = Math.max(Math.abs(t.x - door.x), Math.abs(t.y - door.y));
        if (dist <= DOOR_CLUSTER_RADIUS) band.push(t);
      }

      let pick = null;
      if (band.length) {
        const roll = Utils.seededRandom(baseSeed ^ ((i + 1) * 0x9e3779b1));
        pick = band[Math.min(band.length - 1, Math.floor(roll * band.length))];
      } else {
        // Nothing free around this building (walled in, water, other NPCs):
        // fall back to the closest tile that is still outside the doorway.
        let bestDist = Infinity;
        for (const t of free) {
          if (used.has(`${t.x},${t.y}`)) continue;
          const dist = Math.abs(t.x - door.x) + Math.abs(t.y - door.y);
          if (dist < bestDist) { bestDist = dist; pick = t; }
        }
      }
      if (!pick) continue;

      used.add(`${pick.x},${pick.y}`);
      tiles.push(pick);
    }
    return tiles;
  }

  const ProceduralManager = {
    // Erases every procedural NPC slot standing on the live map. Map 636 is
    // rebuilt from its template on each visit, so this only has to hold for the
    // square currently loaded.
    clearProceduralNPCs: () => {
      for (const ev of $gameMap.events()) {
        const name = ev?.event()?.name;
        if (!name) continue;
        if (name.startsWith("NPC") || name.startsWith("Placeholder")) { // i18n-ignore: event-name prefixes
          $gameMap.eraseEvent(ev.eventId());
        }
      }
      $gameSystem._currentProcGroup = null;
    },

    setupProceduralMapNPCs: () => {
      if (!$gameMap || !$dataMap) return;
      if ($gameMap.mapId() !== 636) return;

      // A procedural interior (cave, dungeon, crypt, sewer, loot cellar, temple
      // inside, cave den, patron vault, and any layer below the surface) has no
      // population: nobody is staffed there and the slots the template carries
      // are erased outright, so a dungeon never inherits the citizens of the
      // open-air square it was entered from. This has to be asked of
      // ProceduralInteriors rather than read off the map: every one of them
      // shares map id 636 with that square. The usual "an event with no
      // graphic is never an NPC" rule cannot do this job here, procedural slots
      // are authored graphic-less and only get a face when they are staffed.
      // ...unless it is a floor of the Omega Tower. A floor is generated as a
      // structure and so reads as an interior, but it is not a cellar under
      // anywhere: it is a world of its own, and it has people on it
      // (DungeonFloorSystem.js, window.TowerWorlds).
      const towerFloor = window.TowerWorlds?.currentFloor?.() || 0;
      const towerWorld = towerFloor ? window.TowerWorlds.get(towerFloor) : null;
      // A world with nobody left on it stays empty, and so does every other
      // procedural interior.
      if (!towerWorld || towerWorld.empty) {
        if (window.ProceduralInteriors?.isCurrent?.()) {
          ProceduralManager.clearProceduralNPCs();
          return;
        }
      }

      const worldX = $gameVariables.value(43) || 1;
      const worldY = $gameVariables.value(44) || 1;
      // Mix the world (history) seed into NPC placement/identity so each world
      // seed populates the same tile with different NPCs, deterministically.
      const procWorldSeed = window.ProcGenUtils?.getWorldSeed?.() ?? 19002001;
      let baseSeed = window.ProcGenUtils?.hashCoords?.(procWorldSeed, worldX, worldY)
        ?? ((worldX * 73856093) ^ (worldY * 19349663));
      // Every floor of the lower tower is generated from the one world square
      // the tower stands on, so the square alone would hand all ninety of them
      // the same crowd. The floor is what tells them apart.
      if (towerFloor) baseSeed = (baseSeed ^ (towerFloor * 2654435761)) >>> 0;

      const p2Active = window.$gameSplitScreen && window.$gameSplitScreen.active;
      const p2Name = p2Active ? window.$gameSplitScreen.p2EventName : null;

      // Citizens recruited into the party on a prior visit to this exact world
      // tile must not respawn: erase their event slots up front so they are gone
      // for good (map 636 is rebuilt fresh each visit, clearing the erase flag,
      // so this has to run every time from the persisted world-folder record).
      const recruitedIds = ProceduralManager.getRecruitedEventIds(worldX, worldY);

      const npcEvents = $gameMap.events().filter(e => {
        const name = e?.event()?.name;
        if (!name) return false;
        if (p2Active && name === p2Name) return false;
        if (Utils.isPlayerSlotName(name)) return false; // Ignore players!
        if (recruitedIds && recruitedIds.has(e.eventId())) {
          $gameMap.eraseEvent(e.eventId());
          return false;
        }
        return name.startsWith("NPC") || name.startsWith("Placeholder"); // i18n-ignore: event-name prefixes
      });
      if (!npcEvents.length) return;

      const biomeName = $gameSystem?._procGenData?.currentBiome || "Fields";
      const isSettlementBiome = Config.isSettlementBiome(biomeName);

      // Lone building doors/tents scattered outside a proper settlement (see
      // SETTLEMENT_DOOR_FEATURES) get their own small NPC cluster below,
      // regardless of the biome's own hasNPC/cull rules.
      // Every door/tent on the map, whatever the biome: their doorsteps are kept
      // clear in both placement paths below. Only the ones outside a proper
      // settlement additionally get their own NPC cluster.
      const doorTiles = getSettlementDoorTiles();
      const settlementDoorTiles = isSettlementBiome ? [] : doorTiles;

      let hasNPC = true;
      if (window.WorldGen && window.WorldGen.Biomes) {
        const biomeObj = window.WorldGen.Biomes.find(b => b.name === biomeName);
        if (biomeObj && biomeObj.hasNPC !== undefined) {
          hasNPC = biomeObj.hasNPC;
        }
      }

      if (!hasNPC && settlementDoorTiles.length === 0) {
        npcEvents.forEach(ev => $gameMap.eraseEvent(ev.eventId()));
        $gameSystem._currentProcGroup = null;
        return;
      }

      // Register the synthetic per-tile settlement so every NPC placed below is
      // a first-class citizen of the simulation (society, life record, world-web
      // pulse, politics, jobs all key off this group name).
      const settlementGroup = towerWorld
        ? ProceduralManager.ensureTowerSettlement(towerFloor)
        : ProceduralManager.ensureProcSettlement(worldX, worldY, biomeName);

      let activeEvents = npcEvents;

      if (settlementDoorTiles.length > 0) {
        // 1-2 NPCs per door/tent found outside a settlement, instead of the
        // biome's usual random cull.
        let wantCount = 0;
        settlementDoorTiles.forEach((_, i) => {
          const doorRng = Utils.seededRandom(baseSeed ^ (0x0d00d ^ (i * 7919)));
          if (doorRng < DOOR_NPC_CHANCE) wantCount++;
        });
        wantCount = Math.min(wantCount, DOOR_NPC_CAP);
        const keepCount = Math.max(1, Math.min(npcEvents.length, wantCount));
        const indices = Array.from({ length: npcEvents.length }, (_, i) => i);

        for (let i = indices.length - 1; i > 0; i--) {
          const j = Math.floor(Utils.seededRandom(baseSeed ^ (i * 12345)) * (i + 1));
          [indices[i], indices[j]] = [indices[j], indices[i]];
        }

        const toCull = indices.slice(keepCount);
        toCull.forEach(idx => $gameMap.eraseEvent(npcEvents[idx].eventId()));
        activeEvents = npcEvents.filter((_, i) => !toCull.includes(i));
      } else {
        const cullRng = Utils.seededRandom(baseSeed ^ 0xdeadbeef);
        // A public gathering (window.NPCGatherings) empties the houses: nearly
        // the whole village is out on the street for its hours.
        const gathering = isSettlementBiome && window.NPCGatherings?.activeGathering?.(settlementGroup);
        // A city and a village are culled alike (Config.settlementCrowdCount),
        // open country keeps its own unhalved share.
        const keepCount = isSettlementBiome
          ? Config.settlementCrowdCount(npcEvents.length, cullRng, gathering)
          : Math.max(1, Math.ceil(npcEvents.length * (0.3 + cullRng * 0.4)));
        const indices = Array.from({ length: npcEvents.length }, (_, i) => i);

        for (let i = indices.length - 1; i > 0; i--) {
          const j = Math.floor(Utils.seededRandom(baseSeed ^ (i * 12345)) * (i + 1));
          [indices[i], indices[j]] = [indices[j], indices[i]];
        }

        const toCull = indices.slice(keepCount);
        toCull.forEach(idx => $gameMap.eraseEvent(npcEvents[idx].eventId()));
        activeEvents = npcEvents.filter((_, i) => !toCull.includes(i));
      }

      const validTiles = MapManager.findPassableTerrainTiles();

      let placementTiles;
      if (settlementDoorTiles.length > 0) {
        placementTiles = pickDoorClusterTiles(settlementDoorTiles, validTiles, activeEvents.length, baseSeed);
      } else {
        for (let i = validTiles.length - 1; i > 0; i--) {
          const j = Math.floor(Utils.seededRandom(baseSeed ^ (i * 54321)) * (i + 1));
          [validTiles[i], validTiles[j]] = [validTiles[j], validTiles[i]];
        }
        // Doorsteps go to the back of the queue rather than being dropped, so a
        // crowded city keeps its full spawn capacity but only blocks an
        // entrance when the map has literally nowhere else left to stand.
        if (doorTiles.length > 0) {
          const blocked = getDoorwayClearance(doorTiles);
          const open = [], doorstep = [];
          for (const t of validTiles) {
            (blocked.has(`${t.x},${t.y}`) ? doorstep : open).push(t);
          }
          placementTiles = open.concat(doorstep);
        } else {
          placementTiles = validTiles;
        }
      }

      activeEvents.forEach((ev, i) => {
        if (i < placementTiles.length) {
          ev.locate(placementTiles[i].x, placementTiles[i].y);
        } else {
          $gameMap.eraseEvent(ev.eventId());
          return;
        }
        ProceduralManager.dressProcCitizen(ev, baseSeed, settlementGroup, worldX, worldY, procWorldSeed);
      });

      // And the ones that are not standing in an authored slot at all: the
      // creatures out in the country, scattered over the square the way a
      // farm's livestock is (see scatterWildCreatures).
      ProceduralManager.scatterWildCreatures(baseSeed, settlementGroup, worldX, worldY, biomeName);

      console.log(`[NPC System] ${activeEvents.length} NPCs set up on procedural map ${$gameMap.mapId()} (${MapManager.getMapName($gameMap.mapId())}), settlement "${settlementGroup}"`);
    },

    // -- Creatures loose on the square -------------------------------------
    // The population pass above can only ever dress the NPC slots the map
    // template carries, and those stand where a person would stand. A creature
    // does not: it is out in the field, at the treeline, on the shore. So a
    // procedural square also gets a handful of creatures placed the way
    // AnimalGrowthSystem places a farm's livestock, straight onto walkable
    // tiles, as events minted for them rather than slots borrowed from
    // somebody else.
    //
    // Both kinds are scattered, exactly as they are dealt anywhere else: a
    // creature crossed with a Humanoid holds a trade and a conversation, and
    // one that is not is the thing it looks like (NPCCreature.rollIdentity).
    //
    // Seeded on the world tile, so the same square carries the same creatures
    // on every visit and in every savegame of the world. Nothing is persisted:
    // map 636 is rebuilt from the template each time it is entered, and these
    // are re-dealt with it, the same volatility every procedural citizen has.
    WILD_CREATURE_MAX: 3,            // head of creature a square can carry
    WILD_CREATURE_SETTLEMENT_MAX: 1, // a town is for people; one stray, at most
    WILD_CREATURE_ZOMBIE_MAX: 8,     // and a dead world belongs to the wildlife
    // On top of the cap, a share of squares carry nothing loose at all. Four
    // head on every square out of town, dealt on top of the creatures the
    // population pass already puts in the NPC slots, made the country busier
    // with beasts than with people: a quiet square is the point of a wild one.
    WILD_CREATURE_QUIET_CHANCE: 0.25,

    scatterWildCreatures: (baseSeed, settlementGroup, worldX, worldY, biomeName) => {
      const NC = window.NPCCreature;
      if (!NC || !$gameMap || !$dataMap) return 0;
      if ($gameMap.mapId() !== 636) return 0;
      if (window.ProceduralInteriors?.isCurrent?.()) return 0;

      const seed = (baseSeed ^ 0x3f1c9a5b) >>> 0;
      const rng = ProceduralManager._creatureRng(seed);
      // A town carries at most one stray; open country carries up to four. The
      // count is rolled off the same stream the identities are, so a square is
      // as populous on every visit as it was on the first.
      // A dead world belongs to the animals, and its emptied towns as much as
      // its fields: the town rule is for a town with people still in it.
      const inTown = NC.isSettlementHere ? NC.isSettlementHere() : false;
      const cap = Config.isZombieWorld()
        ? ProceduralManager.WILD_CREATURE_ZOMBIE_MAX
        : inTown
          ? ProceduralManager.WILD_CREATURE_SETTLEMENT_MAX
          : ProceduralManager.WILD_CREATURE_MAX;
      // A quarter of squares are quiet, whatever the cap allows (the zombie
      // world's overrun fields excepted).
      if (!Config.isZombieWorld() &&
        rng.next() < ProceduralManager.WILD_CREATURE_QUIET_CHANCE) return 0;
      const count = Math.floor(rng.next() * (cap + 1));
      if (count === 0) return 0;

      const tiles = ProceduralManager._creatureTiles(rng);
      if (!tiles.length) return 0;

      let placed = 0;
      for (let i = 0; i < count && tiles.length; i++) {
        const spot = tiles.splice(Math.floor(rng.next() * tiles.length), 1)[0];
        // An earlier creature in this same pass, or an animal placed before it,
        // may have taken the tile.
        if (!ProceduralManager._creatureTileFree(spot.x, spot.y)) continue;
        // Exterior: these stand on the open square, so the Animals/ half of the
        // wardrobe is on the table along with the Creatures/ one.
        const identity = NC.rollIdentity(rng, true);
        if (!identity) break;
        if (ProceduralManager._spawnWildCreature(identity, spot, (seed ^ (i * 2654435761)) >>> 0,
              settlementGroup, worldX, worldY)) placed++;
      }
      if (placed) {
        console.log(`[NPC System] ${placed} creature(s) loose on ${biomeName} (${worldX},${worldY})`);
      }
      return placed;
    },

    // The xorshift stream NPCCreature.rollIdentity expects (next/nextInt).
    _creatureRng: (seed) => {
      let s = (seed >>> 0) || 1;
      const next = () => {
        s ^= s << 13; s >>>= 0;
        s ^= s >>> 17;
        s ^= s << 5;  s >>>= 0;
        return s / 4294967296;
      };
      return { next, nextInt: (min, max) => min + Math.floor(next() * (max - min)) };
    },

    // Somewhere a creature can stand: on the map, walkable, off the blocked
    // terrain, and not on top of anybody. Sampled rather than swept, since a
    // procedural square is large and only a handful of tiles are ever needed.
    // Sampled off the SAME seeded stream the identities are dealt from, never
    // Math.random: the square is rebuilt from the template every time it is
    // entered (a menu is enough, see Scene_Map.create), and an unseeded sample
    // re-deals every creature onto a fresh tile, which reads as the animal the
    // player was just talking to teleporting across the field.
    // The sampling filter deliberately ignores where the party happens to be
    // standing (_creatureTileStable): a tile refused because the player is on
    // it would shift every later pick down the list, and the whole deal with
    // it. Whether the tile is really free is asked again at placement.
    _creatureTiles: (rng) => {
      const roll = rng ? () => rng.next() : Math.random;
      const out = [];
      const w = $gameMap.width();
      const h = $gameMap.height();
      const wanted = 60;
      for (let tries = 0; tries < 400 && out.length < wanted; tries++) {
        const x = 1 + Math.floor(roll() * Math.max(1, w - 2));
        const y = 1 + Math.floor(roll() * Math.max(1, h - 2));
        if (!ProceduralManager._creatureTileStable(x, y)) continue;
        out.push({ x, y });
      }
      return out;
    },

    // The half of the tile test that does not move: the map itself. Everything
    // transient (the party, the events already minted) is left to
    // _creatureTileFree at placement time.
    _creatureTileStable: (x, y) => {
      if (!$gameMap.isValid(x, y)) return false;
      if (!$gameMap.isPassable(x, y, 2)) return false;
      if (Utils.isBlockedTerrain && Utils.isBlockedTerrain(x, y)) return false;
      return true;
    },

    _creatureTileFree: (x, y) => {
      if (!$gameMap.isValid(x, y)) return false;
      if (!$gameMap.isPassable(x, y, 2)) return false;
      if ($gameMap.eventIdXy(x, y) > 0) return false;
      if (Utils.isBlockedTerrain && Utils.isBlockedTerrain(x, y)) return false;
      if ($gamePlayer && $gamePlayer.pos(x, y)) return false;
      if ($gamePlayer?.followers?.().isSomeoneCollided?.(x, y)) return false;
      return true;
    },

    // One creature, as a fresh map event with the same Talk / Empathize page a
    // procedural NPC slot carries. A non-sentient one still gets it: the panel
    // is what answers for a beast (noises, feeding, petting), and the talk
    // command growls for it (NPCEmpathize.growlFor).
    _spawnWildCreature: (identity, spot, seed, settlementGroup, worldX, worldY) => {
      if (!$dataMap.events) $dataMap.events = [null];
      const eventId = $dataMap.events.length;

      let name = "";
      if (window.generateSeededMarkovName) {
        const dbId = Config.NAME_DATABASES[seed % Config.NAME_DATABASES.length];
        try {
          name = window.generateSeededMarkovName(
            worldX ^ (seed & 0xffff), worldY ^ ((seed >>> 16) & 0xffff),
            eventId, dbId, 2, 4, 12);
        } catch (e) { /* refused below */ }
      }
      if (!name || name === "Unknown") return false; // i18n-ignore: Markov generator sentinel
      // Two creatures on one square must not share a name: the society keys
      // every profile by it, and the second would inherit the first's identity.
      if ($gameSystem?._npcSociety?.[name]) return false;

      $dataMap.events[eventId] = {
        id: eventId, name, note: "",
        x: spot.x, y: spot.y,
        pages: [{
          conditions: {
            actorId: 1, actorValid: false, itemId: 1, itemValid: false,
            selfSwitchCh: "A", selfSwitchValid: false,
            switch1Id: 1, switch1Valid: false, switch2Id: 1, switch2Valid: false,
            variableId: 1, variableValid: false
          },
          directionFix: false,
          image: {
            tileId: 0, characterName: identity.spriteKey,
            characterIndex: 0, direction: 2, pattern: 1
          },
          list: ProceduralManager._creaturePageList(),
          moveFrequency: 3,
          moveRoute: { list: [{ code: 0 }], repeat: true, skippable: false, wait: false },
          moveSpeed: 3, moveType: 1, priorityType: 1, stepAnime: true,
          through: false, trigger: 0, walkAnime: true
        }, {
          // Recruited, or otherwise gone: the same self-switch A page every
          // other NPC vanishes behind, which is also what Join needs to exist.
          conditions: {
            actorId: 1, actorValid: false, itemId: 1, itemValid: false,
            selfSwitchCh: "A", selfSwitchValid: true,
            switch1Id: 1, switch1Valid: false, switch2Id: 1, switch2Valid: false,
            variableId: 1, variableValid: false
          },
          directionFix: false,
          image: { tileId: 0, characterName: "", characterIndex: 0, direction: 2, pattern: 1 },
          list: [{ code: 0, indent: 0, parameters: [] }],
          moveFrequency: 3,
          moveRoute: { list: [{ code: 0 }], repeat: true, skippable: false, wait: false },
          moveSpeed: 3, moveType: 0, priorityType: 0, stepAnime: false,
          through: true, trigger: 0, walkAnime: false
        }]
      };

      if (!$gameMap._events) $gameMap._events = [];
      const ev = new Game_Event($gameMap.mapId(), eventId);
      ev.setImage(identity.spriteKey, 0);
      $gameMap._events[eventId] = ev;

      // A citizen like any other, with the sheet PINNED so the society
      // generator reads what it IS off the body it is wearing rather than
      // rolling a second identity on top of the one just dealt.
      const profile = ProceduralManager.registerProcCitizen(
        name, ev, settlementGroup, identity.classId,
        { spriteKey: identity.spriteKey, bustIndex: identity.bustIndex || 0 });
      if (profile) {
        profile.spriteKey = identity.spriteKey;
        profile.bustIndex = identity.bustIndex || 0;
        profile.archetype = identity.archetype;
        profile.isCreature = true;
        profile.assignedClassId = identity.classId;
        window.NPCSocietyRegistry?.reconcileToSprite?.(name, profile);
      }

      // It wanders like anybody else; the controller is what walks it about.
      const controller = new NPCController(name);
      $gameSystem.npcControllers.push(controller);
      controller.decideNextGoal();

      // The spriteset only builds its character sprites once per map, so an
      // event minted after that has to be handed one explicitly.
      const spriteset = SceneManager._scene && SceneManager._scene._spriteset;
      if (spriteset && typeof spriteset.addAnimalCharacterSprite === "function") {
        spriteset.addAnimalCharacterSprite(ev);
      }
      return true;
    },

    // ── the crowd of an offworld spaceport ──────────────────────────────────
    //
    // A landing pad on another world is a authored map with no population pass
    // of its own: maps 173, 353, 893 and 970 carry player slots, transfers and
    // a missile silo, and not one NPC slot between them, so the busiest place
    // on the planet stood empty.
    //
    // Whose pads these are is not decided here. GalaxySim.spaceportSurfaceSite
    // answers it off js/db/GalaxySim/Systems.json: a landing location with a
    // grid cell on a world that is not Earth. Earth's own pads (Apulia,
    // Greenwitch) name no cell, are not offworld, and are populated by the
    // ordinary map-group machinery like any other Earth map.
    //
    // Who is standing there is not decided here either. SpriteCatalog.pickNpcKey
    // already deals nine faces in ten off the alien half of the wardrobe at an
    // offworld site (ALIEN_SHARE_OFFWORLD), so the share is read from the one
    // place that owns it rather than written down a second time.
    //
    // The tenth face is a human, and a human on another world got there
    // somehow: where somebody authored is away on a trip (NPCLifeSimulator's
    // resolveTravel) that traveller is who it is, by name and by their own
    // sheet. Otherwise it is a procedural spacer like everybody else.
    SPACEPORT_MIN: 4,
    SPACEPORT_MAX: 11,

    // The Talk / Empathize / Cancel page every AI slot on a procedural map
    // carries, so somebody put down on a pad answers the button exactly the
    // way somebody put down in a village does.
    _spacerPageList: () => ([
      { code: 102, indent: 0, parameters: [["Talk", "Empathize", "Cancel"], 3, 0, 2, 0] },  // i18n-ignore: choice labels are localized by the engine's own pass
      { code: 402, indent: 0, parameters: [0, "Talk"] },
      { code: 357, indent: 1, parameters: ["NPC/DialogueSystem", "Rumors", "Rumors", {}] },
      { code: 0, indent: 1, parameters: [] },
      { code: 402, indent: 0, parameters: [1, "Empathize"] },
      { code: 357, indent: 1, parameters: ["NPC/NPCEmpathize", "Open", "Open", { eventName: "" }] },
      { code: 0, indent: 1, parameters: [] },
      { code: 402, indent: 0, parameters: [2, "Cancel"] },
      { code: 0, indent: 1, parameters: [] },
      { code: 404, indent: 0, parameters: [] },
      { code: 0, indent: 0, parameters: [] },
    ]),

    // One person on the pad. A fresh $dataMap event, because these maps carry
    // no slots to dress: the same way a wild creature is put down
    // (_spawnWildCreature), and just as volatile, since $dataMap is re-read
    // from disk on every Scene_Map rebuild.
    _spawnSpacer: (spot, spriteKey, visitor, seed, site) => {
      if (!$dataMap.events) $dataMap.events = [null];
      const eventId = $dataMap.events.length;
      // A traveller is a particular person who got here: they wear their own
      // face, not whichever human sheet the draw happened to turn up.
      const sheet = visitor ? visitor.spriteKey : spriteKey;
      const sheetIndex = visitor ? (visitor.bustIndex || 0) : 0;

      let name = visitor ? visitor.name : "";
      if (!name && window.generateSeededMarkovName) {
        const dbId = Config.NAME_DATABASES[Math.abs(seed) % Config.NAME_DATABASES.length];
        try {
          name = window.generateSeededMarkovName(
            seed & 0xffff, (seed >>> 16) & 0xffff, eventId, dbId, 2, 4, 12);
        } catch (e) { /* refused below */ }
      }
      if (!name || name === "Unknown") return false;  // i18n-ignore: Markov generator sentinel
      // A traveller is already in the society register under this name, and is
      // meant to be. Anybody else must not collide with somebody who is.
      if (!visitor && $gameSystem?._npcSociety?.[name]) return false;

      const blankPage = {
        conditions: {
          actorId: 1, actorValid: false, itemId: 1, itemValid: false,
          selfSwitchCh: "A", selfSwitchValid: true,
          switch1Id: 1, switch1Valid: false, switch2Id: 1, switch2Valid: false,
          variableId: 1, variableValid: false,
        },
        directionFix: false,
        image: { tileId: 0, characterName: "", characterIndex: 0, direction: 2, pattern: 1 },
        list: [{ code: 0, indent: 0, parameters: [] }],
        moveFrequency: 3, moveRoute: { list: [{ code: 0 }], repeat: true, skippable: false, wait: false },
        moveSpeed: 3, moveType: 0, priorityType: 0, stepAnime: false, through: true,
        trigger: 0, walkAnime: false,
      };

      $dataMap.events[eventId] = {
        id: eventId, name, note: "AI",  // i18n-ignore: event notetag
        x: spot.x, y: spot.y,
        pages: [{
          conditions: {
            actorId: 1, actorValid: false, itemId: 1, itemValid: false,
            selfSwitchCh: "A", selfSwitchValid: false,
            switch1Id: 1, switch1Valid: false, switch2Id: 1, switch2Valid: false,
            variableId: 1, variableValid: false,
          },
          directionFix: false,
          image: {
            tileId: 0, characterName: sheet,
            characterIndex: sheetIndex, direction: 2, pattern: 1,
          },
          list: ProceduralManager._spacerPageList(),
          moveFrequency: 3,
          moveRoute: { list: [{ code: 0 }], repeat: true, skippable: false, wait: false },
          moveSpeed: 3, moveType: 1, priorityType: 1, stepAnime: true,
          through: false, trigger: 0, walkAnime: true,
        }, blankPage],
      };

      if (!$gameMap._events) $gameMap._events = [];
      const ev = new Game_Event($gameMap.mapId(), eventId);
      ev.setImage(sheet, sheetIndex);
      ev._spaceportSpawn = true;
      $gameMap._events[eventId] = ev;
      SpawnManager.snapshotSpawn(ev);

      // A traveller keeps the life they already have. Only a spacer minted
      // here needs one, and theirs belongs to the pad rather than to any town
      // on Earth.
      if (!visitor) {
        const group = ProceduralManager.ensureSpaceportSettlement(site);
        const profile = ProceduralManager.registerProcCitizen(
          name, ev, group, ProceduralManager.seededClassId(seed ^ 0x51ed270b),
          { spriteKey: sheet, bustIndex: sheetIndex });
        if (profile) {
          profile.spriteKey = sheet;
          profile.bustIndex = 0;
          window.NPCSocietyRegistry?.reconcileToSprite?.(name, profile);
        }
      }
      SpawnManager.injectBrain(ev, ev.event());
      return true;
    },

    // The pad as a settlement of its own, so the people minted on it are
    // citizens of somewhere rather than of a town they have never seen. Named
    // after the site, so two pads on two worlds are two different places.
    ensureSpaceportSettlement: (site) => {
      if (!$gameSystem) return null;
      const groupName = "Port:" + (site?.planet || "?") + ":" + (site?.name || "?");  // i18n-ignore: settlement key
      const groups = $gameSystem._npcMapGroups || ($gameSystem._npcMapGroups = {});
      if (!groups[groupName]) {
        groups[groupName] = {
          maps: [$gameMap ? $gameMap.mapId() : 0],
          mainMaps: [], residentialBuildings: [], jobs: {}, _spaceport: true,
        };
      }
      return groupName;
    },

    spaceportSiteNow: () => {
      const GS = window.GalaxySim;
      if (!GS || typeof GS.spaceportSurfaceSite !== "function") return null;
      try { return GS.spaceportSurfaceSite(); } catch (e) { return null; }
    },

    // The authored people who are off on a journey right now, so one of them
    // can be the human at the far end of it.
    travellersAbroad: () => {
      const records = $gameSystem?._npcLifeRecords;
      if (!records) return [];
      const out = [];
      for (const name of Object.keys(records)) {
        if (!records[name]?.trip) continue;
        const profile = $gameSystem?._npcSociety?.[name];
        if (profile?.spriteKey) out.push({ name, spriteKey: profile.spriteKey, bustIndex: profile.bustIndex || 0 });
      }
      return out;
    },

    populateSpaceport: () => {
      const site = ProceduralManager.spaceportSiteNow();
      if (!site || !$gameMap || !$dataMap) return 0;
      // Once per visit. A pad already peopled is left exactly as it stands.
      if ($gameMap._spaceportCrowd) return 0;
      $gameMap._spaceportCrowd = true;

      const mapId = $gameMap.mapId();
      // Seeded on the pad and the world, so the same landing meets the same
      // faces and a different world meets different ones.
      const seed = ((Utils.nameHash(String(site.planet || "") + ":" + String(site.name || "")) >>> 0) ^
        ((window.NPCShared?.worldSeed?.() ?? 0) >>> 0) ^ (mapId * 2654435761)) >>> 0;

      const tiles = MapManager.findPassableTerrainTiles();
      if (!tiles.length) return 0;
      for (let i = tiles.length - 1; i > 0; i--) {
        const j = Math.floor(Utils.seededRandom(seed ^ (i * 54321)) * (i + 1));
        const tmp = tiles[i]; tiles[i] = tiles[j]; tiles[j] = tmp;
      }

      const span = ProceduralManager.SPACEPORT_MAX - ProceduralManager.SPACEPORT_MIN + 1;
      const want = Math.min(tiles.length,
        ProceduralManager.SPACEPORT_MIN + Math.floor(Utils.seededRandom(seed) * span));
      const travellers = ProceduralManager.travellersAbroad();
      let used = 0, made = 0;

      for (let i = 0; i < want; i++) {
        const spot = tiles[i];
        if (!spot) break;
        const roll = Utils.seededRandom((seed + i * 2654435761) >>> 0);
        // The mapId is handed over so the share is the PAD's share, not
        // whatever map happens to be loaded when this is asked.
        let spriteKey = null;
        try {
          spriteKey = window.SpriteCatalog?.pickNpcKey?.(roll, { mapId });
        } catch (e) { spriteKey = null; }
        if (!spriteKey) continue;

        // A human here is somebody who travelled, where anybody has.
        let visitor = null;
        if (!window.AlienOrigins?.isAlienSprite?.(spriteKey) && used < travellers.length) {
          visitor = travellers[used++];
        }
        if (ProceduralManager._spawnSpacer(spot, spriteKey, visitor, seed ^ (i * 83492791), site)) made++;
      }
      Utils.debug(`spaceport ${site.name || mapId}: ${made} on the pad, ${used} of them travellers`);
      return made;
    },

    // Pet / Empathize / Cancel. A beast is not talked to: the rumour mill is a
    // thing people pass to each other, and running one through the growl bank
    // only ever produced a townsman's sentence with the words knocked out of
    // it. What a hand can do to an animal on the street is lay itself on the
    // animal, so that is the first entry, and it answers where it stands
    // (NPCEmpathize's Pet command, a line and a noise, no second window).
    _creaturePageList: () => ([
      { code: 102, indent: 0, parameters: [["Pet", "Empathize", "Cancel"], 3, 0, 2, 0] },  // i18n-ignore: choice labels are localized by the engine's own pass
      { code: 402, indent: 0, parameters: [0, "Pet"] },
      { code: 357, indent: 1, parameters: ["NPC/NPCEmpathize", "Pet", "Pet", { eventName: "" }] },
      { code: 0, indent: 1, parameters: [] },
      { code: 402, indent: 0, parameters: [1, "Empathize"] },
      { code: 357, indent: 1, parameters: ["NPC/NPCEmpathize", "Open", "Open", { eventName: "" }] },
      { code: 0, indent: 1, parameters: [] },
      { code: 402, indent: 0, parameters: [2, "Cancel"] },
      { code: 0, indent: 1, parameters: [] },
      { code: 404, indent: 0, parameters: [] },
      { code: 0, indent: 0, parameters: [] },
    ]),

    // ── the people behind a procedural door ─────────────────────────────────
    //
    // A house entered off the procedural map was dressed from whatever slots
    // its template carried, and no house template carries any: only the
    // graphic-less Player slots multiplayer keeps for avatars. So most doors
    // opened on an empty room. Now every floor of a home is lived in by a
    // household of its own, dealt the first time anybody looks and kept in the
    // world folder: a couple, their grown children, a grandparent, a pair of
    // siblings, somebody on their own. They are citizens of the square outside
    // (Proc:x,y) like everybody else on it, so the census, the careers and the
    // elections count them, and they are a family on their life records
    // (NPCLifeSim.bindFamily).
    //
    // A skyscraper floor is public: nobody lives there, so it is given a crowd
    // of regulars instead, dealt and kept the same way.
    //
    // Only doors on the procedural map. The authored towns keep their own
    // residents (SpawnManager.replacePlayerEventsWithNPCs).
    HOUSEHOLD_SHAPES: [
      { shape: "single",       weight: 10 },
      { shape: "couple",       weight: 18 },
      { shape: "family",       weight: 40 },
      { shape: "extended",     weight: 16 },
      { shape: "singleParent", weight: 8 },
      { shape: "siblings",     weight: 8 },
    ],
    PUBLIC_CROWD_MIN: 5,
    PUBLIC_CROWD_MAX: 10,
    // However the hour falls, at least this share of a household is found in.
    HOME_PRESENCE_FLOOR: 0.5,
    // Callers from elsewhere in town, in the daytime, on top of the household.
    HOUSE_VISITORS_MAX: 2,

    // "home", "public", or null when this interior is not one of ours.
    procInteriorKind: (building, groupName, mapId) => {
      if (!building || !groupName) return null;
      // The dead and the beasts have their own ways of filling a room.
      if (Config.isZombieWorld() || window.WorldManager?.isMonsterWorld?.()) return null;
      // A procedural square's doors, or a hand-made town's doors whose
      // households were dealt with the world (ResidentRegistry).
      const procedural = building.mapId === 636 && !!$gameSystem?._npcMapGroups?.[groupName]?._procedural;
      if (!procedural && !ResidentRegistry.isResidentDoor(building, groupName)) return null;
      const PHS = window.ProceduralHouseSystem;
      if (!PHS) return null;
      if (PHS.isPublicInteriorMap?.(mapId) || PHS.isSkyscraperBuilding?.(building)) return "public";
      if (PHS.isHomeInteriorMap?.(mapId) && PHS.isResidentialBuilding?.(building)) return "home";
      return null;
    },

    // Where this floor is, in terms that hold still. A door's map coordinate
    // moves with the shape of the stitched window (see saveHouseReturnPoint),
    // the square-local return point does not.
    procInteriorKey: (building, groupName, kind) => {
      if (building && building.mapId !== 636) return ProceduralManager.groupInteriorKey(building, groupName, kind);
      const rp = window.ProceduralHouseSystem?.houseReturnPoint?.() || null;
      const x = rp ? rp.x : building.x;
      const y = rp ? rp.y : building.y;
      return `${groupName}|${x},${y}#${building.floorIndex || 0}${kind === "public" ? "/crowd" : ""}`;
    },

    // The same for a hand-made town: its doors are events, so the door's own
    // event id holds still (ResidentRegistry.doorFor finds it from wherever the
    // party entered). Floors count from 0 exactly as on the procedural map.
    groupInteriorKey: (building, groupName, kind) => {
      const door = ResidentRegistry.doorFor(building, groupName) || building;
      const id = door.eventId != null ? door.eventId : `${door.x},${door.y}`;
      return `${groupName}|${door.mapId}#${id}@${building.floorIndex || 0}${kind === "public" ? "/crowd" : ""}`;
    },

    procInteriorSeed: (key) => {
      const ws = window.ProcGenUtils?.getWorldSeed?.() ?? 19002001;
      return ((Utils.nameHash(key) >>> 0) ^ (ws >>> 0)) >>> 0;
    },

    // Who lives here, by role and age, off one seed. Parents are older than
    // their children by twenty years at least, a grandparent is older than
    // the parent they had by twenty more. The children of a family can be any
    // age from a newborn up (NPCLifeSim FAMILY: a minor is dealt as a child);
    // every other member is an adult.
    planHousehold: (seed) => {
      const rng = ProceduralManager._creatureRng(seed);
      const between = (lo, hi) => rng.nextInt(lo, hi + 1);
      const coin = () => (rng.next() < 0.5 ? 0 : 1);
      const shapes = ProceduralManager.HOUSEHOLD_SHAPES;
      let roll = rng.next() * shapes.reduce((t, s) => t + s.weight, 0);
      let shape = shapes[shapes.length - 1].shape;
      for (const s of shapes) {
        if ((roll -= s.weight) < 0) { shape = s.shape; break; }
      }

      const members = [];
      const couple = (lo, hi) => {
        const a = between(lo, hi);
        const b = Math.max(20, a + between(-5, 5));
        const g = coin();
        // Mostly a man and a woman, now and then two of either.
        members.push({ role: "parent", age: a, gender: g });
        members.push({ role: "parent", age: b, gender: rng.next() < 0.85 ? 1 - g : g });
      };
      const children = (count) => {
        const youngest = Math.min(...members.filter(m => m.role === "parent").map(m => m.age));
        const top = Math.max(0, youngest - 20);
        for (let i = 0; i < count; i++) members.push({ role: "child", age: between(0, top), gender: coin() });
      };

      switch (shape) {
        case "single":
          members.push({ role: "parent", age: between(20, 85), gender: null });
          break;
        case "couple":
          couple(22, 80);
          break;
        case "family":
          couple(26, 58);
          children(between(1, 3));
          break;
        case "extended": {
          couple(43, 55);
          const eldest = Math.min(99, members[0].age + between(20, 30));
          if (rng.next() < 0.5) {
            members.push({ role: "grandparent", age: eldest, gender: 0 });
            members.push({ role: "grandparent", age: Math.min(99, eldest + between(-4, 4)), gender: 1 });
          } else {
            members.push({ role: "grandparent", age: eldest, gender: null });
          }
          children(between(1, 2));
          break;
        }
        case "singleParent":
          members.push({ role: "parent", age: between(24, 58), gender: null });
          children(between(1, 2));
          break;
        default: {
          // Grown siblings sharing the family house.
          const base = between(20, 38);
          const count = between(2, 3);
          for (let i = 0; i < count; i++) {
            members.push({ role: "child", age: Math.max(18, base + between(-4, 4)), gender: coin() });
          }
        }
      }
      return { shape, members };
    },

    // The regulars of a public floor: unrelated adults, as many as the seed says.
    planCrowd: (seed) => {
      const rng = ProceduralManager._creatureRng(seed);
      const span = ProceduralManager.PUBLIC_CROWD_MAX - ProceduralManager.PUBLIC_CROWD_MIN + 1;
      const count = ProceduralManager.PUBLIC_CROWD_MIN + Math.floor(rng.next() * span);
      const members = [];
      for (let i = 0; i < count; i++) {
        members.push({ role: "regular", age: rng.nextInt(18, 76), gender: null });
      }
      return { shape: "crowd", members };
    },

    // A person for one of those places: a face off the people half of the
    // wardrobe, a name, a society profile of the right age and a life record
    // to match. `name` is somebody already dealt here, whose profile only has
    // to be put back if the society has since let it go (the same seed deals
    // the same face, so they come back as themselves). Answers the name, or
    // null when there is nobody to make.
    _mintInteriorCitizen: (member, seed, groupName, name, opts) => {
      if (!$gameSystem) return null;
      const society = $gameSystem._npcSociety || ($gameSystem._npcSociety = {});
      if (name && society[name]) return name;

      const NC = window.NPCCreature;
      const pool = buildNPCCharacterPool();
      // A monster world is made of nothing but the creatures and beasts the
      // people's wardrobe leaves out, so there they are the townsfolk.
      const monsterWorld = !!window.WorldManager?.isMonsterWorld?.();
      // A face chosen by the caller (the Horde's re-dealing, HORDE HOMES).
      let spriteKey = opts?.spriteKey || null;
      for (let t = 0; t < 12 && !spriteKey; t++) {
        const pick = pickNPCCharacter(Utils.seededRandom((seed ^ Math.imul(t + 1, 0x27d4eb2f)) >>> 0), pool);
        if (!pick) continue;
        const entry = window.WorldGen?.NPCs?.[pick];
        if (!monsterWorld && (entry?.animal === true || entry?.creature === true)) continue;
        if (!monsterWorld && (NC?.isCreatureSheet?.(pick) || NC?.isAnimalSheet?.(pick))) continue;
        // A mother is dealt a woman's face while any is on offer.
        if (member.gender != null && t < 8 && entry && entry.Gender != null && entry.Gender !== member.gender) continue;
        spriteKey = pick;
      }
      if (!spriteKey) return null;
      const bustIndex = spriteKey.includes("!$") ? 0 : Math.floor(Utils.seededRandom((seed * 2) >>> 0) * 8); // i18n-ignore: sprite-sheet prefix

      for (let t = 0; t < 10 && !name; t++) {
        const s = (seed ^ Math.imul(t + 1, 0x165667b1)) >>> 0;
        // The names corpus first (it carries every name the retired authored
        // crowd answered to), the role banks once it keeps colliding.
        const dbId = t < 6 ? "names" : Config.NAME_DATABASES[s % Config.NAME_DATABASES.length]; // i18n-ignore: Markov bank id
        let made = "";
        try {
          made = window.generateSeededMarkovName
            ? window.generateSeededMarkovName(s & 0xffff, (s >>> 16) & 0xffff, (s % 997) + 1, dbId, 2, 4, 12)
            : "";
        } catch (e) { made = ""; }
        // Two people must never share a name: the society keys everybody by it.
        if (made && made !== "Unknown" && made !== "NPC" && !society[made] && !ResidentRegistry.isReservedName(made)) name = made; // i18n-ignore: Markov generator sentinels
      }
      if (!name) return null;

      // A minor is a child of the world (NPCLifeSim FAMILY). The life record
      // comes first, so the profile is minted already knowing it.
      const minor = Number(member.age) < (window.NPCLifeSim?.MIN_NPC_AGE ?? 18);
      if (minor) {
        try {
          window.NPCLifeSim?.ensureLifeRecord?.(name, groupName, undefined, { age: member.age, child: true, nativeChance: 1 });
        } catch (e) { /* the profile still marks them a child */ }
      }

      const profile = window.NPCSocietyRegistry?.ensureProfile?.(
        name, ProceduralManager.seededClassId(seed ^ 0x51ed270b), groupName, opts?.homeMapId ?? $gameMap?.mapId?.(),
        { spriteKey, bustIndex, initSpec: { age: String(member.age) } });
      if (!profile) return null;
      profile.spriteKey = spriteKey;
      profile.bustIndex = bustIndex;
      profile._homeGroupName = groupName;
      const entry = window.WorldGen?.NPCs?.[spriteKey] || null;
      const bust = entry?.busts?.[bustIndex] ?? entry?.busts?.[0] ?? null;
      if (bust && bust !== "7") profile._bustName = bust;
      if (entry?.markovDB && profile.markovDb == null) profile.markovDb = entry.markovDB;
      if (entry && entry.Gender != null) profile.gender = entry.Gender;
      window.NPCSocietyRegistry?.reconcileToSprite?.(name, profile);
      window.NPCSocietyRegistry?.applyHometownOpinionIfMatch?.(profile, groupName);
      if (minor) window.NPCLifeSim?.applyChildProfile?.(name, profile, { age: member.age });
      try {
        window.NPCLifeSim?.ensureLifeRecord?.(name, groupName, undefined, { age: member.age, nativeChance: 0.8 });
      } catch (e) { /* the census still counts them off the profile */ }
      return name;
    },

    // The roster of one floor, dealt once and kept. Every member is (re)made
    // on the way through, so a profile the society pruned comes back.
    _ensureInteriorRoster: (key, kind, groupName) => {
      const store = $gameSystem._npcProcHouseholds || {};
      const seed = ProceduralManager.procInteriorSeed(key);
      let entry = store[key];
      if (!entry || !Array.isArray(entry.members)) {
        const plan = kind === "public" ? ProceduralManager.planCrowd(seed) : ProceduralManager.planHousehold(seed);
        entry = { kind, shape: plan.shape, members: plan.members.map(m => Object.assign({ name: null }, m)) };
      }
      entry.members.forEach((m, i) => {
        m.name = ProceduralManager._mintInteriorCitizen(m, (seed ^ Math.imul(i + 1, 0x85ebca6b)) >>> 0, groupName, m.name)
          || m.name || null;
      });
      store[key] = entry;
      // Reassigned, not only mutated, so the world folder hears of it.
      $gameSystem._npcProcHouseholds = store;
      return entry;
    },

    // The family behind this door, on this floor: minted, bound into a family
    // and moved in. Answers their names.
    ensureHousehold: (building, groupName) => {
      if (!building || !groupName || !$gameSystem) return [];
      const key = ProceduralManager.procInteriorKey(building, groupName, "home");
      const entry = ProceduralManager._ensureInteriorRoster(key, "home", groupName);
      const named = entry.members.filter(m => m.name);
      const byRole = (role) => named.filter(m => m.role === role).map(m => m.name);
      window.NPCLifeSim?.bindFamily?.({
        parents: byRole("parent"), children: byRole("child"), grandparents: byRole("grandparent"),
      });
      const names = named.map(m => m.name);
      window.NPCSim?.moveInHousehold?.(building, groupName, names, building.floorIndex || 0);
      return names;
    },

    // The family behind one floor of a hand-made town's door, dealt when the
    // world is made (ResidentRegistry.ensureGroup): the same roster, family
    // binding and move-in as a procedural door, keyed on the door's event.
    ensureGroupHousehold: (building, groupName) => {
      if (!building || !groupName || !$gameSystem) return [];
      const key = ProceduralManager.groupInteriorKey(building, groupName, "home");
      const store = $gameSystem._npcProcHouseholds || {};
      const seed = ProceduralManager.procInteriorSeed(key);
      let entry = store[key];
      if (!entry || !Array.isArray(entry.members)) {
        const plan = ProceduralManager.planHousehold(seed);
        entry = { kind: "home", shape: plan.shape, members: plan.members.map(m => Object.assign({ name: null }, m)) };
      }
      entry.members.forEach((m, i) => {
        m.name = ProceduralManager._mintInteriorCitizen(m, (seed ^ Math.imul(i + 1, 0x85ebca6b)) >>> 0, groupName, m.name,
          { homeMapId: building.mapId }) || m.name || null;
      });
      store[key] = entry;
      $gameSystem._npcProcHouseholds = store;
      const named = entry.members.filter(m => m.name);
      const byRole = (role) => named.filter(m => m.role === role).map(m => m.name);
      window.NPCLifeSim?.bindFamily?.({
        parents: byRole("parent"), children: byRole("child"), grandparents: byRole("grandparent"),
      });
      const names = named.map(m => m.name);
      window.NPCSim?.moveInHousehold?.(building, groupName, names, building.floorIndex || 0);
      return names;
    },

    ensurePublicCrowd: (building, groupName) => {
      if (!building || !groupName || !$gameSystem) return [];
      const key = ProceduralManager.procInteriorKey(building, groupName, "public");
      return ProceduralManager._ensureInteriorRoster(key, "public", groupName)
        .members.map(m => m.name).filter(Boolean);
    },

    // Deals the people of a procedural interior onto the floor the party has
    // just walked onto. Answers how many are standing there.
    populateProcInterior: (kind, building, groupName) => {
      if (!$gameMap || !$dataMap || !building) return 0;
      const hour = $gameVariables?.value(23) ?? 12;
      const society = $gameSystem._npcSociety || {};
      const inParty = new Set(($gameParty?.members?.() || []).map(a => a?.name?.()));
      const onMap = new Set($gameMap.events().filter(e => e && !e._erased).map(e => e.event()?.name));
      const usable = (n) => !!n && !!society[n] && !inParty.has(n) && !onMap.has(n) && !GoneRegistry.isNameGone(n);
      const key = ProceduralManager.procInteriorKey(building, groupName, kind);
      const rng = ProceduralManager._creatureRng((ProceduralManager.procInteriorSeed(key) ^ Math.imul(hour + 1, 0x9e3779b1)) >>> 0);
      const shuffled = (list) => {
        const out = list.slice();
        for (let i = out.length - 1; i > 0; i--) {
          const j = Math.floor(rng.next() * (i + 1));
          [out[i], out[j]] = [out[j], out[i]];
        }
        return out;
      };

      let present = [];
      if (kind === "home") {
        const household = ProceduralManager.ensureHousehold(building, groupName);
        const others = window.NPCSim?.getBuildingResidents?.(building, building.floorIndex || 0, groupName) || [];
        const residents = [...new Set([...household, ...others])].filter(usable);
        const isHome = (n) => (window.NPCSim?.isNPCAtHome ? window.NPCSim.isNPCAtHome(n, null, hour) : true);
        present = residents.filter(isHome);
        // A house is never found empty for want of a schedule: somebody has the
        // day off, somebody is ill, somebody never left.
        const floor = Math.ceil(residents.length * ProceduralManager.HOME_PRESENCE_FLOOR);
        for (const n of shuffled(residents.filter(r => !present.includes(r)))) {
          if (present.length >= floor) break;
          present.push(n);
        }
        if (hour >= 9 && hour < 21) {
          const callers = Object.keys(society).filter(n =>
            society[n]._homeGroupName === groupName && society[n].spriteKey &&
            !residents.includes(n) && usable(n) && !window.NPCCreature?.isNonSentientProfile?.(society[n]));
          const count = Math.floor(rng.next() * (ProceduralManager.HOUSE_VISITORS_MAX + 1));
          present.push(...shuffled(callers).slice(0, count));
        }
      } else {
        const crowd = ProceduralManager.ensurePublicCrowd(building, groupName).filter(usable);
        const late = hour >= 22 || hour < 6;
        present = shuffled(crowd).slice(0, late ? Math.ceil(crowd.length / 2) : crowd.length);
      }

      const tiles = ProceduralManager._interiorTiles();
      let made = 0;
      for (const name of present) {
        const tile = tiles.shift();
        if (!tile) break;
        if (ProceduralManager._spawnInteriorResident(name, tile)) made++;
      }
      Utils.debug(`procedural ${kind} interior ${key}: ${made} of ${present.length} standing`);
      return made;
    },

    // Free floor to stand people on, spread out, never on the party or the
    // tiles around it (that is the doorway they just came in by).
    _interiorTiles: () => {
      const px = $gamePlayer ? $gamePlayer.x : -99;
      const py = $gamePlayer ? $gamePlayer.y : -99;
      const clear = (t) => Math.max(Math.abs(t.x - px), Math.abs(t.y - py)) > 1 && !$gameMap.eventIdXy(t.x, t.y);
      let tiles = MapManager.getSpreadSpawnTiles().filter(clear);
      if (tiles.length >= 8) return tiles;
      // A cramped room has few tiles with a 2x2 margin around them: take any
      // floor that can be walked on at all.
      const seen = new Set(tiles.map(t => `${t.x},${t.y}`));
      const loose = [];
      for (let y = 0; y < $gameMap.height(); y++) {
        for (let x = 0; x < $gameMap.width(); x++) {
          if (seen.has(`${x},${y}`)) continue;
          if (!ORTHO_DIRS.some(d => $gameMap.isPassable(x, y, d))) continue;
          const region = $gameMap.regionId(x, y);
          if (region === 10 || region === 103 || region === 99) continue;
          if (Utils.isBlockedTerrain(x, y)) continue;
          if (clear({ x, y })) loose.push({ x, y });
        }
      }
      for (let i = loose.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [loose[i], loose[j]] = [loose[j], loose[i]];
      }
      return tiles.concat(loose);
    },

    // One person, as a fresh event on this floor: the same Talk / Empathize
    // page and the same blank "gone" page every procedural citizen carries,
    // and a controller to walk them about the rooms.
    _spawnInteriorResident: (name, tile) => {
      const profile = $gameSystem._npcSociety?.[name];
      if (!profile?.spriteKey) return null;
      if (!$dataMap.events) $dataMap.events = [null];
      if (!$gameMap._events) $gameMap._events = [];
      const eventId = Math.max($dataMap.events.length, $gameMap._events.length);
      const bustIndex = profile.bustIndex || 0;
      const blank = (switchOn) => ({
        actorId: 1, actorValid: false, itemId: 1, itemValid: false,
        selfSwitchCh: "A", selfSwitchValid: switchOn,
        switch1Id: 1, switch1Valid: false, switch2Id: 1, switch2Valid: false,
        variableId: 1, variableValid: false,
      });
      const idleRoute = { list: [{ code: 0 }], repeat: true, skippable: false, wait: false };
      $dataMap.events[eventId] = {
        id: eventId, name, note: "AI",  // i18n-ignore: event notetag
        x: tile.x, y: tile.y,
        pages: [{
          conditions: blank(false),
          directionFix: false,
          image: { tileId: 0, characterName: profile.spriteKey, characterIndex: bustIndex, direction: 2, pattern: 1 },
          list: ProceduralManager._spacerPageList(),
          moveFrequency: 3, moveRoute: idleRoute,
          moveSpeed: 3, moveType: 1, priorityType: 1, stepAnime: true,
          through: false, trigger: 0, walkAnime: true,
        }, {
          conditions: blank(true),
          directionFix: false,
          image: { tileId: 0, characterName: "", characterIndex: 0, direction: 2, pattern: 1 },
          list: [{ code: 0, indent: 0, parameters: [] }],
          moveFrequency: 3, moveRoute: idleRoute,
          moveSpeed: 3, moveType: 0, priorityType: 0, stepAnime: false,
          through: true, trigger: 0, walkAnime: false,
        }],
      };
      const ev = new Game_Event($gameMap.mapId(), eventId);
      ev.setImage(profile.spriteKey, bustIndex);
      ev._procInteriorSpawn = true;
      $gameMap._events[eventId] = ev;
      SpawnManager.snapshotSpawn(ev, { minted: true });
      SpawnManager.injectBrain(ev, ev.event());
      // The spriteset is already built by the time the people are dealt.
      const spriteset = SceneManager._scene && SceneManager._scene._spriteset;
      if (spriteset?._characterSprites && !spriteset._characterSprites.some(s => s._character === ev) &&
          typeof spriteset.addVisitorCharacterSprite === "function") {
        spriteset.addVisitorCharacterSprite(ev);
      }
      return ev;
    },

    // Turns one bare procedural NPC slot into a citizen: sprite, name, society
    // profile and a wandering controller, all seeded off the world tile and the
    // event id so the same slot is always the same person. Split out of
    // setupProceduralMapNPCs so a citizen can also be born one at a time, long
    // after the map was populated (RoadCarAI's drivers pulling into a lay-by).
    dressProcCitizen: (ev, baseSeed, settlementGroup, worldX, worldY, procWorldSeed) => {
      {
        const graphicSeed = baseSeed ^ (ev.eventId() * 83492791);
        // Who this person is depends first on WHERE they are. On a floor of
        // the Omega Tower that is a world of its own, with its own people:
        // the sprite comes out of that world's wardrobe rather than out of
        // Earth's, which is also what decides their class, because the sheet
        // is the authority on that everywhere (NPCSociety reconcileToSprite).
        const towerWorld  = window.TowerWorlds?.worldOfGroup?.(settlementGroup) || null;
        const charPool    = buildNPCCharacterPool();
        // A slot that was AUTHORED with a face keeps it. The procedural slots on
        // map 636 are drawn graphic-less on purpose and only get a face when
        // they are staffed, so they take the world's; an event somebody sat down
        // and gave a sprite to is a decision, and a decision outranks a roll.
        // Either way the person is a citizen of this floor's world: the face is
        // the only thing the author is deciding, not where they are from.
        const authored = (() => {
          const data = ev.event();
          const page = data?.pages?.[0];
          const named = data?.characterName || page?.image?.characterName || "";
          if (!named) return null;
          return { name: named, index: (page?.image?.characterIndex ?? data?.characterIndex ?? 0) };
        })();
        const towerSprite = (towerWorld && !authored)
          ? ProceduralManager.towerCitizenSprite(towerWorld, graphicSeed) : null;
        let charName      = (authored && towerWorld ? authored.name : null)
          || towerSprite
          || pickNPCCharacter(Utils.seededRandom(graphicSeed), charPool);
        // A wardrobe with nothing in it at all (no NPCs.json, a magic level that
        // filtered everything out) leaves the event in whatever face it was
        // authored with rather than throwing on the way past.
        if (!charName) return;
        // Big-character sprites (!$) have one slot; normal multi-character sheets use 0-7
        const isBigSprite = charName.includes('!$');
        let charIdx       = (authored && towerWorld) ? (isBigSprite ? 0 : authored.index)
          : isBigSprite ? 0 : Math.floor(Utils.seededRandom(graphicSeed * 2) * 8);

        const evData = ev.event();
        evData.pages?.forEach(p => { if (p) { p.image = p.image || {}; p.image.characterName = charName; p.image.characterIndex = charIdx; } });
        evData.characterName = charName;
        evData.characterIndex = charIdx;

        ev.setImage(charName, charIdx);
        ev.refresh();
        ev.setupPage();

        // The chosen world sprite is the single source of truth for this NPC's
        // portrait and dialogue voice: pull the matching bust and Markov DB
        // straight from its NPCs.json entry so the chat portrait matches the
        // sprite the player sees, and so the conversation uses a sprite-
        // appropriate voice instead of a random name database.
        const npcEntry    = window.WorldGen?.NPCs?.[charName] || null;
        let spriteBust    = npcEntry?.busts?.[charIdx] ?? npcEntry?.busts?.[0] ?? null;
        let spriteDb      = npcEntry?.markovDB || null;
        let spriteGender  = npcEntry && npcEntry.Gender != null ? npcEntry.Gender : null;

        let genName = "NPC";
        // A fungoid world does not name its people Marco. Every world is
        // written in one register and its people are named in it
        // (window.TowerWorlds.nameIn).
        if (towerWorld && window.TowerWorlds?.nameIn) {
          let ns = (graphicSeed >>> 0) || 1;
          const nrng = () => { ns = (ns * 9301 + 49297) % 233280; return ns / 233280; };
          try {
            const made = window.TowerWorlds.nameIn(towerWorld.register, nrng);
            if (made && made.length >= 2) genName = made;
          } catch (e) { /* fall through to the ordinary banks */ }
        }
        if (genName === "NPC" && window.generateSeededMarkovName) {   // i18n-ignore: event-name prefix
          const dbId = Config.NAME_DATABASES[Math.floor(Utils.seededRandom(graphicSeed) * Config.NAME_DATABASES.length)];
          try { genName = window.generateSeededMarkovName(worldX ^ (procWorldSeed & 0xffff), worldY ^ ((procWorldSeed >>> 16) & 0xffff), ev.eventId(), dbId, 2, 4, 12); } catch (e) { }
        }
        // Safety net: if generation was unavailable/failed and the name is
        // still the bare placeholder "NPC" (or "Unknown" from a missing DB),
        // fall back to one seeded off the fixed name-generation seed instead,
        // see transplantData for the same rule.
        if ((genName === "NPC" || genName === "Unknown" || !genName) && window.generateSeededMarkovName) { // i18n-ignore: Markov generator sentinels
          const worldSeed = Config.NPC_NAME_SEED;
          const dbId = Config.NAME_DATABASES[Math.floor(Utils.seededRandom(worldSeed ^ (ev.eventId() * 83492791)) * Config.NAME_DATABASES.length)];
          try {
            const fallbackName = window.generateSeededMarkovName(worldSeed & 0xffff, (worldSeed >>> 16) & 0xffff, ev.eventId(), dbId, 2, 4, 12);
            if (fallbackName && fallbackName !== "Unknown") genName = fallbackName; // i18n-ignore: Markov generator sentinel
          } catch (e) {}
        }
        if (!genName || genName === "Unknown") genName = "NPC"; // i18n-ignore: Markov generator sentinel / event-name prefix
        evData.name = genName;
        // Same volatility as a roster spawn: this name and sprite only exist in
        // $dataMap, which is re-read from disk on every Scene_Map rebuild. See
        // SpawnManager.snapshotSpawn.
        SpawnManager.snapshotSpawn(ev);

        // Give every procedural citizen a full identity rooted in the same
        // world-seed+coords+eventId seed as its name/sprite, so class, gender
        // and stats are random yet reproducible per (worldSeed, worldX, worldY).
        // A class is passed explicitly so it lands even on the canon default
        // seed (19002001), where the society generator's npcData-driven class
        // assignment is otherwise skipped.
        const procClassId = ProceduralManager.seededClassId(graphicSeed ^ 0x51ed270b);
        // The sprite is pinned into the profile as it is minted, so the
        // creature roll can never deal a beast inside this citizen's clothes.
        const profile = ProceduralManager.registerProcCitizen(
          genName, ev, settlementGroup, procClassId,
          { spriteKey: charName, bustIndex: charIdx,
            roughSleeper: Utils.seededRandom((graphicSeed ^ 0x2545f491) >>> 0) < Config.PROC_HOMELESS_CHANCE });
        // A name already on the society's books is somebody already met, and a
        // creature or an animal stays one: it walks out in a `creature: true`
        // or `animal: true` sheet (its own, or one dealt to fit its class)
        // rather than being repainted as whoever this slot would have been.
        const beastSheet = profile
          ? window.NPCCreature?.creatureSheetFor?.(profile, genName, !window.ProceduralInteriors?.isCurrent?.())
          : null;
        if (beastSheet && beastSheet !== charName && window.WorldGen?.NPCs?.[beastSheet]) {
          const beastEntry = window.WorldGen.NPCs[beastSheet];
          charName = beastSheet;
          charIdx = profile.spriteKey === beastSheet ? (profile.bustIndex || 0) : 0;
          evData.pages?.forEach(p => { if (p?.image) { p.image.characterName = charName; p.image.characterIndex = charIdx; } });
          evData.characterName = charName;
          evData.characterIndex = charIdx;
          ev.setImage(charName, charIdx);
          ev.refresh();
          ev.setupPage();
          SpawnManager.snapshotSpawn(ev);
          spriteBust = beastEntry.busts?.[charIdx] ?? beastEntry.busts?.[0] ?? null;
          spriteDb = beastEntry.markovDB || null;
          spriteGender = beastEntry.Gender != null ? beastEntry.Gender : null;
        }
        if (profile) {
          // Bind the chosen world sprite to the society profile so:
          //  - getBustForNPC (NPCEmpathize portrait) resolves the bust that
          //    belongs to this exact sprite from NPCs.json, instead of the
          //    generic 7.png fallback;
          //  - _applySocietySprite (NPCSociety, runs after this on non-canon
          //    seeds) re-applies the SAME sprite rather than overriding the
          //    world sprite with a random one and caching a mismatched bust;
          //  - conversations use the sprite's own Markov voice (markovDB).
          profile.spriteKey = charName;
          profile.bustIndex = charIdx;
          // And an already-minted profile is repaired to agree with it.
          window.NPCSocietyRegistry?.reconcileToSprite?.(genName, profile);
          if (spriteBust && spriteBust !== "7") profile._bustName = spriteBust;
          if (spriteDb && profile.markovDb == null) profile.markovDb = spriteDb;

          // Gender comes from the sprite's NPCs.json entry (0=Male, 1=Female,
          // 2=Non-binary, see ClassSelector gender map), so the identity matches
          // the world sprite the player sees rather than a random roll.
          if (spriteGender != null) profile.gender = spriteGender;

          // How heavy they are is decided by the floor, not by the party:
          // most of a floor's people stand at its own level and a rare one
          // stands well above or below it. Pinned, because the local-NPC
          // peg would otherwise drag every one of them back to whatever the
          // party has reached at home (NPCSociety _syncLocalLevel).
          if (towerWorld && window.TowerWorlds?.levelRoll) {
            let ls = ((graphicSeed >>> 0) ^ 0x9e3779b9) || 1;
            const lrng = () => { ls = (ls * 9301 + 49297) % 233280; return ls / 233280; };
            const level = window.TowerWorlds.levelRoll(towerWorld.floor, lrng);
            if (level > 0) {
              profile.level = level;
              profile._levelPinned = true;
            }
          }
        }

        const controller = new NPCController(genName);
        $gameSystem.npcControllers.push(controller);
        controller.decideNextGoal();
        return genName;
      }
    },

    // A free NPC slot on the procedural map: one the population pass culled, or
    // one it never needed. Map 636 carries a fixed number of them and they are
    // re-read from the template on every visit, so a slot taken here is given
    // back the next time the square is entered.
    freeProcNPCSlot: () => {
      for (const ev of $gameMap.events()) {
        const name = ev?.event()?.name;
        if (!name) continue;
        if (!name.startsWith("NPC") && !name.startsWith("Placeholder")) continue; // i18n-ignore: event-name prefixes
        if (!ev._erased) continue;
        if (ev._roadsideNPC) continue;
        return ev;
      }
      return null;
    },

    /**
     * Puts one person on the map at (x, y), outside the population pass: the
     * driver who has just parked, and whoever else turns up beside them.
     *
     * `visitor` draws an authored face from the world-wide pool (somebody
     * passing through from another town) instead of minting a citizen of this
     * square. Answers the event, or null when there is no slot left.
     */
    spawnRoadsideNPC: (x, y, options) => {
      if (!$gameMap || $gameMap.mapId() !== 636) return null;
      // The tile comes from the caller (RoadCarAI picks a kerbside doorstep),
      // so it still has to clear the terrain rule every other spawn obeys.
      if (Utils.isBlockedTerrain(x, y)) return null;
      const ev = ProceduralManager.freeProcNPCSlot();
      if (!ev) return null;

      const worldX = $gameVariables.value(43) || 1;
      const worldY = $gameVariables.value(44) || 1;
      const procWorldSeed = window.ProcGenUtils?.getWorldSeed?.() ?? 19002001;
      const baseSeed = (window.ProcGenUtils?.hashCoords?.(procWorldSeed, worldX, worldY)
        ?? ((worldX * 73856093) ^ (worldY * 19349663))) ^ (Math.floor(Math.random() * 0x7fffffff));
      const biomeName = $gameSystem?._procGenData?.currentBiome || "Fields";  // i18n-ignore  biome id
      const settlementGroup = ProceduralManager.ensureProcSettlement(worldX, worldY, biomeName);

      // Somebody passing through: a resident of one of the hand-made towns,
      // out on the road in their own face.
      if (options && options.visitor) {
        const pool = ResidentRegistry.worldResidents().filter(r => !GoneRegistry.isNameGone(r.name));
        const who = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
        const placed = who ? ProceduralManager.placeNamedNPC(who.name, x, y, { roadside: true, slot: ev }) : null;
        if (placed) return placed;
        // No pool to draw a visitor from: fall through and mint a local.
      }

      ev._erased = false;
      ev.refresh();
      ev.locate(x, y);
      ev._roadsideNPC = true;

      ProceduralManager.dressProcCitizen(ev, baseSeed, settlementGroup, worldX, worldY, procWorldSeed);
      return ev;
    },

    /**
     * Puts one named, already-existing person on the procedural map at (x, y):
     * a visitor on a trip, a newcomer who moved here, a driver passing through.
     * Their spawn data is snapshotted every time, since it lives only in the
     * volatile $dataMap (SpawnManager.snapshotSpawn). `opts.slot` is a free
     * slot the caller already holds, `opts.template` spawn data of its own,
     * `opts.visiting` marks a visitor, `opts.roadside` a roadside spawn.
     * Answers the event, or null when there is no slot or no face for them.
     */
    placeNamedNPC: (name, x, y, opts) => {
      const o = opts || {};
      if (!name || !$gameMap || $gameMap.mapId() !== 636) return null;
      if (Utils.isBlockedTerrain(x, y)) return null;
      const data = o.template || SpawnManager.arrivalTemplate(name);
      if (!data) return null;
      const ev = o.slot || ProceduralManager.freeProcNPCSlot();
      if (!ev) return null;
      ev._erased = false;
      ev.refresh();
      if (!SpawnManager.transplantData(ev, data, ev.eventId())) { ev.erase(); return null; }
      ev.locate(x, y);
      if (o.roadside) ev._roadsideNPC = true;
      if (o.visiting) ev._npcLocalVisitor = true;
      SpawnManager.snapshotSpawn(ev);
      SpawnManager.injectBrain(ev, ev.event());
      return ev;
    },

    // Up to this many visitors on a trip are met on a procedural square.
    ARRIVALS_MAX: 4,

    // After the square's own people: whoever is visiting its place on a trip
    // (NPCLifeSim.arrivalsIn) and whoever moved here for good
    // ($gameSystem._npcImmigrants), each on a free tile of the square.
    placeArrivals: () => {
      if (!$gameMap || $gameMap.mapId() !== 636 || !$gameSystem) return 0;
      if (window.ProceduralInteriors?.isCurrent?.()) return 0;
      if (Config.isEmptyWorld()) return 0;
      const group = $gameSystem._currentProcGroup;
      if (!group || !Config.isProceduralGroup(group)) return 0;
      // Only the square the party is standing on, never one left behind.
      const wx = $gameVariables?.value(43) || 1, wy = $gameVariables?.value(44) || 1;
      if (group !== ProceduralManager.procGroupName(wx, wy)) return 0;
      const Life = window.NPCLifeSim;
      const home = Life?.canonicalGroup?.(group) || group;
      const now = $gameVariables?.value(114) ?? 0;
      const visitors = (Life?.arrivalsIn?.(group, now) || []).slice(0, ProceduralManager.ARRIVALS_MAX);
      const settlers = ResidentRegistry.immigrantsOf(home);
      if (!visitors.length && !settlers.length) return 0;
      const inParty = new Set(($gameParty?.members?.() || []).map(a => a?.name?.()));
      const onMap = new Set($gameMap.events().filter(e => e && !e._erased).map(e => e.event()?.name).filter(Boolean));
      const tiles = MapManager.findPassableTerrainTiles() || [];
      const seed = (Utils.nameHash(`arrivals:${group}:${Math.floor(now / 60)}`) ^ (window.NPCShared?.worldSeed?.() ?? 0)) >>> 0; // i18n-ignore: seed key
      for (let i = tiles.length - 1; i > 0; i--) {
        const j = Math.floor(Utils.seededRandom((seed + i * 2654435761) >>> 0) * (i + 1));
        [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
      }
      let placed = 0, t = 0;
      const entries = visitors.map(n => ({ name: n, visiting: true }))
        .concat(settlers.map(n => ({ name: n, visiting: false })));
      for (const entry of entries) {
        if (onMap.has(entry.name) || inParty.has(entry.name) || GoneRegistry.isNameGone(entry.name)) continue;
        const template = SpawnManager.arrivalTemplate(entry.name);
        if (!template) continue;
        if (!ProceduralManager.freeProcNPCSlot()) break;
        let tile = null;
        while (!tile && t < tiles.length) {
          const c = tiles[t++];
          if ($gameMap.eventsXy(c.x, c.y).length) continue;
          if ($gamePlayer && $gamePlayer.pos(c.x, c.y)) continue;
          if (Utils.isBlockedTerrain(c.x, c.y)) continue;
          tile = c;
        }
        if (!tile) break;
        const ev = ProceduralManager.placeNamedNPC(entry.name, tile.x, tile.y, { visiting: entry.visiting, template });
        if (!ev) continue;
        onMap.add(entry.name);
        placed++;
      }
      return placed;
    },

    // Registers (once) Bologna as a settlement of its own. It is a real city
    // with a Destinations.json entry, so unlike a "Proc:x,y" tile it is named
    // outright and everyone born in it is a Bolognese; the nation is pinned to
    // Italy by name rather than read off Variable 86, because the party can
    // reach Bologna without ever having crossed the world-map square that sets
    // it. NPCPolitics turns that nationId into the power the city answers to,
    // which for Italy is the Holy Vatican Empire.
    ensureBolognaSettlement: () => {
      if (!$gameSystem) return null;
      const groupName = Config.BOLOGNA_GROUP_NAME;
      const groups = $gameSystem._npcMapGroups || ($gameSystem._npcMapGroups = {});

      if (!groups[groupName]) {
        const group = {
          maps: [Config.BOLOGNA_MAP_ID],
          mainMaps: [Config.BOLOGNA_MAP_ID],
          // Bologna's doors are tiles, not events, so nothing is scanned here;
          // registerProcCitizen-style placeholder addresses come from the
          // housing pass instead.
          residentialBuildings: [],
          _bologna: true,
        };
        _populateGroupJobs({ [groupName]: group });
        groups[groupName] = group;
        if (GroupRegistry._cache && GroupRegistry._cache !== groups) {
          GroupRegistry._cache[groupName] = group;
        }
        // The map index is built once and cached; a group registered after it
        // was built would never be found for map 353.
        GroupRegistry._mapIndex = null;
      }

      // Refreshed on every visit, which also backfills a group saved before
      // these fields existed.
      const country = (window.WorldGen?.Countries || [])
        .find(c => c.country === Config.BOLOGNA_NATION) || null;
      const grp = groups[groupName];
      grp.nationId = country?.id ?? 0;
      grp.country = country?.country || null;
      grp.displayName = country
        ? T('NPCSystem.placeOfCountry', { place: groupName, country: country.country })
        : T('NPCSystem.placeSettlement', { place: groupName });

      MapManager.setCurrentMapGroup(groupName);
      return groupName;
    },

    PROC_GROUP_PREFIX: "Proc", // i18n-ignore: settlement key prefix, "Proc:x,y"

    procGroupName: (worldX, worldY) => `${ProceduralManager.PROC_GROUP_PREFIX}:${worldX},${worldY}`,

    // Registers (once) a deterministic synthetic settlement for the current
    // procedural world tile and marks it as the live settlement so
    // findGroupByMap(636) and the world-web pulse resolve to it. Returns the
    // group name.
    // The settlement a floor of the Omega Tower holds. Deliberately NOT a
    // Proc:x,y group: a floor is not a square of the world map, and the
    // group carries no coordinate and no nation id, so nothing downstream
    // can mistake its people for Earth's. NPCPolitics answers it from the
    // world instead (resolveGroupPolity).
    // `mapId` is the authored map of an upper floor (populateTowerFloor); a
    // lower floor is map 636 and passes nothing.
    ensureTowerSettlement: (floor, mapId) => {
      const TW = window.TowerWorlds;
      if (!$gameSystem || !TW || !floor) return null;
      const world = TW.get(floor);
      if (!world) return null;
      const groupName = TW.groupName(floor);
      const groups = $gameSystem._npcMapGroups || ($gameSystem._npcMapGroups = {});
      const authoredMap = mapId && mapId !== 636 ? mapId : null;
      const onMap = authoredMap || 636;

      if (!groups[groupName]) {
        const group = {
          maps: [onMap],
          mainMaps: [onMap],
          residentialBuildings: _scanMapForResidentialBuildings(onMap, $dataMap) || [],
          _tower: true,
          offworld: true,
          floor: floor,
          towerWorld: world.id,
          biome: null,
        };
        if (authoredMap) group.towerMapId = authoredMap;
        _populateGroupJobs({ [groupName]: group });
        groups[groupName] = group;
        if (GroupRegistry._cache && GroupRegistry._cache !== groups) {
          GroupRegistry._cache[groupName] = group;
        }
        // A new authored map in a group: the map index is built once and cached.
        if (authoredMap) GroupRegistry._mapIndex = null;
      }

      // Refreshed each visit, which also backfills a group saved before the
      // world it belongs to had a name.
      const grp = groups[groupName];
      grp.towerWorld = world.id;
      grp.floor = floor;
      // The floor's map is decided per world: a group made on another map is
      // moved to this one, and its posts with it.
      if (authoredMap && grp.towerMapId !== authoredMap) {
        grp.towerMapId = authoredMap;
        grp.maps = [authoredMap];
        grp.mainMaps = [authoredMap];
        grp.jobs = null;
        GroupRegistry._mapIndex = null;
      }
      // A floor registered before it was given trades (MapJobs "tower:<kind>")
      // gets them now, so its citizens are not jobless for good.
      if (!grp.jobs || !Object.keys(grp.jobs).length) _populateGroupJobs({ [groupName]: grp });
      grp.displayName = T('NPCSystem.towerWorldOfFloor', { world: world.name, floor: floor });

      // The live procedural settlement is map 636's; an authored floor is only
      // the current map group.
      if (!authoredMap) $gameSystem._currentProcGroup = groupName;
      MapManager.setCurrentMapGroup(groupName);
      return groupName;
    },

    // ── People for the upper floors ──────────────────────────────────────────
    // Most floors of the upper tower (L2 to L33) are worlds with nobody drawn
    // on them: their maps carry no NPC event at all, so the posts MapJobs lists
    // there were never worked. Those floors are peopled at runtime through the
    // same tower settlement a lower floor is (ensureTowerSettlement, keyed on
    // the authored map): a handful of the floor's own citizens, dressed and
    // named in its world's voice, weighed on its band, minted as events of
    // their own and given the ordinary NPC brain. The same people come back on
    // every visit (their names are kept on the settlement). A floor its author
    // put anybody on is left exactly as authored.
    TOWER_RESIDENT_FLOORS: [2, 33],
    TOWER_RESIDENTS_MIN: 3,
    TOWER_RESIDENTS_MAX: 8,
    TOWER_RESIDENTS_PER_POST: 2,

    // The upper floor the party stands on, when it is one to be peopled, else 0.
    towerFloorToPeople: () => {
      if (!$gameMap || !$dataMap || !$gameSystem) return 0;
      const WM = window.NPCShared?.WorldModes;
      if (Config.isEmptyWorld() || (WM && !WM.simulatesPeople())) return 0;
      if ($gameMap.mapId() === 636) return 0;
      const TW = window.TowerWorlds;
      const floor = window.DungeonFloors?.currentAuthoredFloor?.() || 0;
      const [lo, hi] = ProceduralManager.TOWER_RESIDENT_FLOORS;
      if (floor < lo || floor > hi || !TW?.isWorldFloor?.(floor)) return 0;
      const world = TW.get?.(floor);
      if (!world || world.empty) return 0;
      const authored = ($dataMap.events || []).some(e => e && !e._npcMinted &&
        (String(e.name || "").startsWith("NPC") || Utils.isNPCEvent(e.note || ""))); // i18n-ignore: event-name prefix
      return authored ? 0 : floor;
    },

    // How many people a floor holds: two for each post it offers, bounded.
    towerResidentCount: (posts) => Math.max(ProceduralManager.TOWER_RESIDENTS_MIN,
      Math.min(ProceduralManager.TOWER_RESIDENTS_MAX, (Number(posts) || 0) * ProceduralManager.TOWER_RESIDENTS_PER_POST)),

    // One of the floor's people, by their place in its roster: the same name
    // every visit, re-made if the society has since let them go.
    _towerResident: (world, floor, groupName, mapId, index) => {
      const group = $gameSystem._npcMapGroups?.[groupName];
      if (!group) return null;
      const roster = group.towerResidents || (group.towerResidents = []);
      const society = $gameSystem._npcSociety || ($gameSystem._npcSociety = {});
      const kept = roster[index] || null;
      if (kept && society[kept]) return kept;
      const seed = (Utils.nameHash(`towerResident:${floor}:${index}`) ^ ((window.NPCShared?.worldSeed?.() ?? 19002001) >>> 0)) >>> 0; // i18n-ignore: seed key
      let name = kept;
      if (!name && window.TowerWorlds?.nameIn) {
        let ns = seed || 1;
        const nrng = () => { ns = (ns * 9301 + 49297) % 233280; return ns / 233280; };
        for (let t = 0; t < 4 && !name; t++) {
          let made = "";
          try { made = window.TowerWorlds.nameIn(world.register, nrng) || ""; } catch (e) { made = ""; }
          if (made.length >= 2 && !society[made] && !ResidentRegistry.isReservedName(made)) name = made;
        }
      }
      const rng = ProceduralManager._creatureRng(seed);
      const member = { role: "regular", age: rng.nextInt(18, 76), gender: null };
      const spriteKey = ProceduralManager.towerCitizenSprite(world, seed) || undefined;
      const made = ProceduralManager._mintInteriorCitizen(member, seed, groupName, name, { homeMapId: mapId, spriteKey });
      if (!made) return null;
      roster[index] = made;
      const profile = society[made];
      if (profile && window.TowerWorlds?.levelRoll) {
        let ls = (seed ^ 0x9e3779b9) >>> 0 || 1;
        const lrng = () => { ls = (ls * 9301 + 49297) % 233280; return ls / 233280; };
        const level = window.TowerWorlds.levelRoll(floor, lrng);
        if (level > 0) { profile.level = level; profile._levelPinned = true; }
      }
      return made;
    },

    // Peoples the upper floor the party is standing on. Answers how many were
    // put on it.
    populateTowerFloor: () => {
      const floor = ProceduralManager.towerFloorToPeople();
      if (!floor) return 0;
      const mapId = $gameMap.mapId();
      const world = window.TowerWorlds.get(floor);
      const groupName = ProceduralManager.ensureTowerSettlement(floor, mapId);
      const group = groupName ? $gameSystem._npcMapGroups?.[groupName] : null;
      if (!group) return 0;
      const want = ProceduralManager.towerResidentCount((group.jobs?.[mapId] || []).length);
      const onMap = new Set($gameMap.events().filter(e => e && !e._erased).map(e => e.event()?.name).filter(Boolean));
      const inParty = new Set(($gameParty?.members?.() || []).map(a => a?.name?.()));
      const tiles = (MapManager.getSpreadSpawnTiles?.() || []).slice();
      let placed = 0;
      for (let i = 0; i < want; i++) {
        const name = ProceduralManager._towerResident(world, floor, groupName, mapId, i);
        if (!name || onMap.has(name) || inParty.has(name) || GoneRegistry.isNameGone(name)) continue;
        const tpl = ResidentRegistry.template(name);
        if (!tpl) continue;
        tpl._npcMinted = true; // not an authored person on the next look
        let tile = tiles.shift();
        while (tile && ($gameMap.eventsXy(tile.x, tile.y).length || ($gamePlayer && $gamePlayer.pos(tile.x, tile.y)))) tile = tiles.shift();
        if (!tile) break;
        const ev = mintEvent(tpl, tile);
        if (!ev) continue;
        SpawnManager.injectBrain(ev, ev.event());
        onMap.add(name);
        placed++;
      }
      // Their posts on this floor are dealt out to them (MapJobs, JobShiftManager).
      try { window.NPCSim?.JobShiftManager?.ensureGroupAssignments?.(groupName); } catch (e) { /* dealt on the next pass */ }
      return placed;
    },

    // The sheets a world's people wear. A world with a dominant race draws it
    // at that world's own share and something else the rest of the time: that
    // is what makes it a world OF goblins rather than a world with some in
    // it. Built once per world and kept, because the wardrobe scan is not
    // cheap and every citizen on the floor asks for it.
    _towerWardrobes: {},
    towerCitizenSprite: (world, seed) => {
      if (!world || !world.dominant) return null;
      const cache = ProceduralManager._towerWardrobes;
      if (!cache[world.id]) {
        const wardrobe = window.NPCCreature?.creatureWardrobe?.(true) || [];
        const data = window.WorldGen?.NPCs || {};
        const wanted = world.dominant.classId;
        const sprite = world.dominant.sprite;
        cache[world.id] = wardrobe.filter((entry) => {
          if (!entry || !entry.spriteKey) return false;
          // A world named after a people rather than after a class (the
          // goblin worlds) matches on the sheet itself.
          if (sprite) return entry.spriteKey.toLowerCase().includes(sprite);
          if (!wanted) return false;
          const classes = data[entry.spriteKey]?.classes;
          return Array.isArray(classes) && classes.includes(wanted);
        }).map((entry) => entry.spriteKey);
      }
      const pool = cache[world.id];
      if (!pool.length) return null;
      // The share is the world's own, jittered by nothing: a citizen either
      // belongs to the dominant people or does not.
      if (Utils.seededRandom((seed ^ 0x5bf03635) >>> 0) >= (world.dominant.share || 0.8)) return null;
      return pool[Math.floor(Utils.seededRandom((seed ^ 0x27d4eb2f) >>> 0) * pool.length)] || null;
    },

    ensureProcSettlement: (worldX, worldY, biomeName) => {
      if (!$gameSystem) return null;
      const groupName = ProceduralManager.procGroupName(worldX, worldY);
      const groups = $gameSystem._npcMapGroups || ($gameSystem._npcMapGroups = {});

      if (!groups[groupName]) {
        let buildings = _scanMapForResidentialBuildings(636, $dataMap) || [];
        const doorTiles = getSettlementDoorTiles();
        const procWorldSeed = window.ProcGenUtils?.getWorldSeed?.() ?? 19002001;
        doorTiles.forEach(d => {
          const seed = ((636 * 1000000 + d.x * 1000 + d.y) ^ procWorldSeed) >>> 0;
          const isSky = d.name === "DoorSkyscraper";
          const totalFloors = isSky ? (4 + (seed % 7)) : (1 + (seed % 2));
          const type = (totalFloors > 1 || isSky) ? 'enterMultiBuilding' : 'visitHouse';
          const b = {
            mapId: 636, x: d.x, y: d.y, seed: seed,
            type: type,
            baseFloorPool: isSky ? 'skyscrapers' : 'houses',
            upperFloorsPool: isSky ? 'skyfloors' : 'floors',
            numFloors: totalFloors - 1,
            totalFloors: totalFloors,
            capacity: totalFloors,
            groupName: groupName,
          };
          if (!buildings.some(existing => existing.x === d.x && existing.y === d.y)) {
            buildings.push(b);
          }
        });

        const group = {
          maps: [636],
          mainMaps: [636],
          residentialBuildings: buildings,
          _procedural: true,
          worldX, worldY,
          biome: biomeName || null,
          // The kinds of building drawn here (DoorClinic, DoorInn...): what
          // the settlement employs besides its biome's trades (MapJobs).
          doorKinds: [...new Set(doorTiles.map(d => d.feature).filter(Boolean))].sort(),
        };
        _populateGroupJobs({ [groupName]: group });
        groups[groupName] = group;

        // Keep the registry cache coherent if it is a different object than
        // $gameSystem._npcMapGroups (e.g. loaded from the worldgen manifest).
        if (GroupRegistry._cache && GroupRegistry._cache !== groups) {
          GroupRegistry._cache[groupName] = group;
        }
      } else if (!groups[groupName].jobs || !Object.keys(groups[groupName].jobs).length) {
        // A settlement registered before its trades came off MapJobs.
        _populateGroupJobs({ [groupName]: groups[groupName] });
      }

      // Anchor the settlement (and everyone born in it) to the nation of the
      // world tile it sits on: Variable 86 holds the current country id, set by
      // WeatherSystem from the world-map region before the player transferred
      // in. This is what makes a procedural citizen a "citizen of" the current
      // nation rather than a randomly seeded one (see NPCPolitics
      // resolveGroupPolity). A tile's nation never changes, so refresh it each
      // visit, which also backfills groups saved before this field existed.
      {
        const nationId = ($gameVariables?.value(86)) || 0;
        const country  = (window.WorldGen?.Countries || []).find(c => c.id === nationId) || null;
        const grp = groups[groupName];
        grp.nationId = nationId;
        grp.country  = country?.country || null;
        // Readable home-town label for menus (the raw key is "Proc:x,y").
        const isPlace = biomeName && !['Normal', 'Road'].includes(biomeName); // i18n-ignore: Biomes.json ids
        const place   = isPlace ? window.BiomeNames.display(biomeName) : T('NPCSystem.frontier');
        grp.displayName = country
          ? T('NPCSystem.placeOfCountry', { place: place, country: country.country })
          : T('NPCSystem.placeSettlement', { place: place });
      }

      // A square the party founded a town on is no longer open country: it
      // carries the name they signed for, and everyone born there is from
      // there. The buildings standing on it are what the town fills up from,
      // so the tally is refreshed while the party is here
      // (Crafting/FurnitureSystem.js owns the register).
      {
        const TF = window.TownFounding;
        const town = TF && TF.syncHere ? TF.syncHere() : null;
        if (town) {
          const grp = groups[groupName];
          grp.foundedTown = town.name;
          grp.townPopulation = TF.residents(town);
          grp.displayName = grp.country
            ? T('NPCSystem.placeOfCountry', { place: town.name, country: grp.country })
            : T('NPCSystem.placeSettlement', { place: town.name });
        }
      }

      // A refugee camp (NPCLifeSim REFUGEES): its tents are its doors, and
      // they go up the first time the party stands on the square.
      if (groups[groupName]._camp) {
        try {
          pitchCamp(groupName);
          groups[groupName].displayName = window.NPCLifeSim?.campLabel?.(groups[groupName]) || groups[groupName].displayName;
        } catch (e) { console.error("[NPC System] Could not pitch the camp", e); }
      }

      $gameSystem._currentProcGroup = groupName;
      MapManager.setCurrentMapGroup(groupName);
      return groupName;
    },

    // Promotes a freshly placed procedural NPC into the full simulation: a
    // society identity anchored to the settlement, a residence at its tile, and
    // a life record (birth, career, relationships, crime) that the background
    // simulators evolve over time.
    registerProcCitizen: (name, ev, groupName, classId = null, options = null) => {
      if (!name || !groupName) return null;
      // `options` carries the sprite this citizen is already known to wear, so
      // the profile is minted around that face instead of rolling one of its
      // own (NPCSocietyRegistry.ensureProfile).
      const profile = window.NPCSocietyRegistry?.ensureProfile?.(
        name, classId, undefined, $gameMap?.mapId?.(), options)
        || $gameSystem._npcSociety?.[name];
      if (profile) {
        profile._homeGroupName = groupName;
        window.NPCSocietyRegistry?.applyHometownOpinionIfMatch?.(profile, groupName);

        // A rough sleeper, dealt one the first time they are met, has no door.
        if (options?.roughSleeper && !profile.homeBuilding && profile._sleepsRough === undefined) {
          ResidentRegistry.makeRoughSleeper(name);
        }
        // Assign a real door building if available, or seed a placeholder
        if (!profile.homeBuilding && !profile._sleepsRough) {
          const group = $gameSystem._npcMapGroups?.[groupName];
          const buildings = group?.residentialBuildings || [];
          const vacant = buildings.filter(b => {
            const occ = $gameSystem._npcBuildingOccupants?.[b.key || `${groupName}|${b.mapId}_${b.x}_${b.y}`] || [];
            return occ.length < (b.capacity || 1);
          });
          if (vacant.length > 0 && window.NPCSim?._moveInResident) {
            window.NPCSim._moveInResident(profile, name, vacant[0], groupName);
          } else if (ev) {
            const building = {
              mapId: 636, eventId: ev.eventId(), x: ev.x, y: ev.y,
              seed: (groupName.length * 1000000) + ev.x * 1000 + ev.y,
              type: 'visitHouse', poolName: '', capacity: 2,
              groupName, _placeholder: true,
            };
            profile.homeBuilding = building;
            profile.homeSeed = building.seed;
            if (group && Array.isArray(group.residentialBuildings) &&
              !group.residentialBuildings.some(b => b.x === building.x && b.y === building.y)) {
              group.residentialBuildings.push(building);
            }
          }
        }
      }
      // Life record works even before the society DataLoader is ready, so the
      // settlement census/pulse counts this NPC regardless.
      try { window.NPCLifeSim?.ensureLifeRecord?.(name, groupName); } catch (_) {}
      return profile || null;
    },

    // Deterministically pick a real, playable class id from $dataClasses for a
    // procedural citizen. Returns null when class data is unavailable (the
    // society generator then falls back to its own class handling).
    seededClassId: (seed) => {
      const classes = $dataClasses;
      if (!Array.isArray(classes)) return null;
      const valid = [];
      for (let i = 1; i < classes.length; i++) { if (classes[i]) valid.push(classes[i].id); }
      if (!valid.length) return null;
      return valid[Math.floor(Utils.seededRandom(seed) * valid.length)];
    },

    // Key for the recruited-citizen store: procedural NPCs are placed
    // deterministically per (worldX, worldY, eventId), so a recruit is uniquely
    // identified by those three coordinates. Map 636 is reused for every world
    // tile, so the world coords MUST be part of the key (a bare eventId would
    // wrongly erase the same event slot on every other tile too).
    procRecruitKey: (worldX, worldY, eventId) => `${worldX},${worldY},${eventId}`,

    // Records a procedural citizen (map 636) that has just joined the party, so
    // it never respawns on this world tile again. The record lives in the world
    // folder (npcs.json → recruitedProcCitizens) via the WorldManager accessor,
    // so it is shared by every savegame of the world. A snapshot of the society
    // profile is cached alongside it so the recruit survives independently of
    // whatever party actor slot it currently occupies. Also erases the live
    // event immediately so it vanishes the moment the player closes the panel.
    recordProceduralRecruit: (eventId, eventName) => {
      if (!$gameSystem || !$gameMap || $gameMap.mapId() !== 636) return;
      eventId = Number(eventId) || 0;
      if (!eventId) return;
      // Default coords must match setupProceduralMapNPCs (|| 1) so the recorded
      // key lines up with the key getRecruitedEventIds looks up at spawn time.
      const worldX = $gameVariables.value(43) || 1;
      const worldY = $gameVariables.value(44) || 1;
      const store = $gameSystem._npcRecruitedProcCitizens
        || ($gameSystem._npcRecruitedProcCitizens = {});
      const key = ProceduralManager.procRecruitKey(worldX, worldY, eventId);
      let profileSnapshot = null;
      try {
        const profile = window.NPCSocietyRegistry?.getProfile?.(eventName)
          || $gameSystem._npcSociety?.[eventName] || null;
        if (profile) profileSnapshot = JsonEx.makeDeepCopy(profile);
      } catch (_) { profileSnapshot = null; }
      store[key] = {
        name: eventName || null,
        worldX, worldY, eventId,
        recruitedAtMin: $gameVariables.value(114) || 0,
        profile: profileSnapshot,
      };
      // Reassigning the accessor-backed field re-persists it through WorldManager.
      $gameSystem._npcRecruitedProcCitizens = store;
      $gameMap.eraseEvent(eventId);
    },

    // The record written for a named recruit, wherever on the world it was
    // made. A dismissal (window.PartyReturn, NPCSystemParty.js) has only a
    // name to go on: the party actor slot says nothing about the tile the
    // person was taken off. Answers { key, ...record } or null.
    findProceduralRecruit: (name) => {
      const store = $gameSystem?._npcRecruitedProcCitizens;
      if (!store || !name) return null;
      for (const key of Object.keys(store)) {
        const rec = store[key];
        if (rec && rec.name === name) return Object.assign({ key }, rec);
      }
      return null;
    },

    // Undo a recruitment: the tile forgets that this citizen ever left it, so
    // the next regeneration of the square puts them back where they stood.
    forgetProceduralRecruit: (key) => {
      const store = $gameSystem?._npcRecruitedProcCitizens;
      if (!store || !key || !(key in store)) return false;
      delete store[key];
      // Reassigning the accessor-backed field re-persists it through WorldManager.
      $gameSystem._npcRecruitedProcCitizens = store;
      return true;
    },

    // Event ids of citizens recruited on the given world tile, so the spawn pass
    // can skip (and erase) them when the procedural map is regenerated.
    getRecruitedEventIds: (worldX, worldY) => {
      const store = $gameSystem?._npcRecruitedProcCitizens;
      if (!store) return null;
      const prefix = `${worldX},${worldY},`;
      let ids = null;
      for (const key of Object.keys(store)) {
        if (!key.startsWith(prefix)) continue;
        const id = parseInt(key.slice(prefix.length), 10);
        if (Number.isFinite(id)) (ids || (ids = new Set())).add(id);
      }
      return ids;
    }
  };

  // ── Citizens the world has lost ───────────────────────────────────────────
  // Somebody recruited into a party, or killed where they stood, is taken off
  // the map by flipping their event's self switch A. Self switches live in the
  // binary savegame, so the same person could be recruited a second time in
  // the next savegame of the world, and a new game started in that world found
  // everybody standing where they always had. The record therefore lives in
  // the world folder (npcs.json -> goneCitizens) and is re-applied on map load.
  //
  // The key is the event slot, but the NAME is what decides. Authored NPC
  // slots are placeholders the spawner transplants a different person onto, so
  // silencing a slot outright would bury whoever moved in afterwards: a record
  // only holds while the event still carries the person it was written for.
  // The procedural map is not covered here, its citizens have no stable event
  // slot and are recorded per world tile by recordProceduralRecruit above.
  const GoneRegistry = {
    PROC_MAP_ID: 636,

    key: (mapId, eventId) => `${mapId}_${eventId}`,
    procKey: (name) => `proc:${name}`,

    store(create) {
      if (typeof $gameSystem === "undefined" || !$gameSystem) return null;
      const held = $gameSystem._npcGoneCitizens;
      if (held) return held;
      if (!create) return null;
      return ($gameSystem._npcGoneCitizens = {});
    },

    // Names are asked for on every spawn transplant, so the set is derived once
    // and rebuilt only when the record actually changes.
    _names: null,
    _nameSet() {
      if (this._names) return this._names;
      const store = this.store(false);
      const set = new Set();
      if (store) {
        for (const rec of Object.values(store)) {
          if (rec && rec.name) set.add(rec.name);
        }
      }
      return (this._names = set);
    },

    // reason: "joined" (walked off with a party) or "killed".
    record(mapId, eventId, name, reason) {
      mapId = Number(mapId) || 0;
      eventId = Number(eventId) || 0;
      if (!mapId || !eventId) return;
      // A procedural citizen has no stable event slot: somebody killed there
      // is kept by name (Phase K), so the square never deals them again. A
      // recruit is recordProceduralRecruit's business, per world tile.
      const proc = mapId === this.PROC_MAP_ID;
      if (proc && (!name || reason !== "killed")) return; // i18n-ignore: stored record key
      const store = this.store(true);
      if (!store) return;
      store[proc ? this.procKey(name) : this.key(mapId, eventId)] = {
        name: name || null,
        mapId, eventId,
        reason: reason || "joined", // i18n-ignore: stored record key
        at: ($gameVariables && $gameVariables.value(114)) || 0,
        by: ($gameParty && $gameParty.leader() && $gameParty.leader().name()) || null
      };
      // Reassigning the accessor-backed field re-persists it through WorldManager.
      $gameSystem._npcGoneCitizens = store;
      this._names = null;
    },

    // The record written for a named citizen, so a dismissal can find the
    // event slot they were taken off with nothing but their name.
    findByName(name) {
      const store = this.store(false);
      if (!store || !name) return null;
      for (const rec of Object.values(store)) {
        if (rec && rec.name === name) return Object.assign({}, rec);
      }
      return null;
    },

    // Strike a record: this person is not lost to the world any more, so the
    // map load stops putting them back behind their blank page.
    forget(mapId, eventId) {
      const store = this.store(false);
      if (!store) return false;
      const key = this.key(Number(mapId) || 0, Number(eventId) || 0);
      if (!(key in store)) return false;
      delete store[key];
      // Reassigning the accessor-backed field re-persists it through WorldManager.
      $gameSystem._npcGoneCitizens = store;
      this._names = null;
      return true;
    },

    isGone(mapId, eventId, name) {
      const store = this.store(false);
      if (!store) return false;
      const rec = store[this.key(mapId, eventId)];
      if (!rec) return false;
      // A slot re-let to somebody else is not the person who left it.
      return !(rec.name && name && rec.name !== name);
    },

    isNameGone(name) {
      return !!name && this._nameSet().has(name);
    },

    // Puts every lost citizen of this map back behind their blank page. Called
    // after the spawn pass, which clears the self switches of the slots it
    // deals, so the order matters.
    applyToMap() {
      const store = this.store(false);
      if (!store || typeof $gameMap === "undefined" || !$gameMap) return;
      const mapId = $gameMap.mapId();
      if (!mapId || mapId === this.PROC_MAP_ID) return;
      for (const ev of $gameMap.events()) {
        if (!ev || ev._erased) continue;
        const eventId = ev.eventId();
        const rec = store[this.key(mapId, eventId)];
        if (!rec) continue;
        const name = ev.event() ? ev.event().name : null;
        if (rec.name && name && rec.name !== name) continue;
        const key = [mapId, eventId, "A"];
        if (!$gameSelfSwitches.value(key)) {
          $gameSelfSwitches.setValue(key, true);
          ev.refresh();
        }
        // An authored event with no blank page to fall through to keeps
        // standing there however the self switch is set, so the citizen who
        // left with a party has to be erased outright instead. Repeated on
        // every map load because erasure is a runtime state, not a saved one.
        const pages = ev.event() ? ev.event().pages : null;
        const hasBlankPage = Array.isArray(pages) && pages.some(
          pg => pg && pg.conditions && pg.conditions.selfSwitchValid && pg.conditions.selfSwitchCh === "A"
        );
        if (!hasBlankPage) ev.erase();
      }
    }
  };
  window.NPCGone = GoneRegistry;

  Object.assign(window.NPCSystem._internal, {
    GoneRegistry, populateProceduralSquare, ProceduralManager, registerProcStitchHook,
  });
})();
