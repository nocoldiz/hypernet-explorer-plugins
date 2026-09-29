/*:
 * @target MZ
 * @plugindesc NPC System: somebody on their way along the road
 * @author Omni-Lex
 * @base NPCSystem
 * @orderAfter NPCSystem
 * @orderAfter NPCSystem_Procedural
 * @help
 * ============================================================================
 * NPCSystem_RoadTravellers, part of the NPCSystem family
 * ============================================================================
 * Owns the ROAD TRAVELLERS methods of ProceduralManager (spawning, dressing
 * and releasing a traveller), added onto the object NPCSystem_Procedural.js
 * builds, and walks them along the 2D road square: the ROAD TRAVELLERS
 * section moved here from Vehicle/RoadCarAI.js, called through the hooks
 * RoadCarAI keeps (window.RoadCarAI.travellers).
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCSystem._internal and publishes its own there. Load it right after
 * NPCSystem_Procedural.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const {
    GoneRegistry, ProceduralManager,
  } = window.NPCSystem._internal;

  Object.assign(ProceduralManager, {
    // ------------------------------------------------------------------------
    // ROAD TRAVELLERS: somebody on their way along the road
    // ------------------------------------------------------------------------
    // One person out on a road square at (x, y), on foot, on a bike or on a
    // broomstick (NPCLifeSim.travellersNear says who and how). They are the
    // same named person the rest of the simulation knows, put down through
    // placeNamedNPC, so the spawn is snapshotted, the brain is injected and
    // the Empathize panel opens on them. Then they are dressed for the road:
    // a rider wears the riding sheet (VehicleSystem.npcRidingSheet) and a
    // broom flies over everything. RoadCarAI drives them along the verge, the
    // shoulder or the sky and hands the slot back at the far edge
    // (releaseTravellerNPC); their controller stands down while they travel.
    // `opts.mode` is 'walk' | 'bike' | 'broom', `opts.dir` the facing (2, 4,
    // 6, 8), `opts.ambient` marks a passer-by rather than a real traveller.
    // Answers the event, or null when there is no slot, no face or no person.
    TRAVELLER_SPEED: { walk: 3, bike: 4, broom: 5 },
    spawnTravellerNPC: (name, x, y, opts) => {
      const o = opts || {};
      if (!name || !$gameMap || $gameMap.mapId() !== 636) return null;
      if (GoneRegistry.isNameGone(name)) return null;
      if (($gameParty?.members?.() || []).some(a => a?.name?.() === name)) return null;
      if ($gameMap.events().some(e => e && !e._erased && e.event()?.name === name)) return null;
      // i18n-ignore-start: travel mode ids
      const mode = (o.mode === "bike" || o.mode === "broom") ? o.mode : "walk";
      // i18n-ignore-end
      const slot = ProceduralManager.freeProcNPCSlot();
      if (!slot) return null;
      const slotName = slot.event()?.name;
      const ev = ProceduralManager.placeNamedNPC(name, x, y, { roadside: true, slot });
      if (!ev) {
        // A refused placement leaves the slot as it found it.
        if (slot.event() && slotName) slot.event().name = slotName;
        slot._roadsideNPC = false;
        return null;
      }
      const sheet = mode === "walk" ? null : (window.VehicleSystem?.npcRidingSheet?.(mode) || null);
      ev._roadTraveller = {
        mode, ambient: !!o.ambient, dir: o.dir || ev.direction(), slotName,
        sheet: sheet && sheet.name ? { name: sheet.name, index: sheet.index || 0 } : null,
      };
      ProceduralManager.dressTraveller(ev);
      ev._moveType = 0;
      ev.setMoveSpeed(ProceduralManager.TRAVELLER_SPEED[mode]);
      ev.setMoveFrequency(5);
      if (o.dir) ev.setDirection(o.dir);
      if (mode === "broom") {
        ev.setThrough(true);
        ev.setPriorityType(2);
      }
      return ev;
    },

    // Puts the riding sheet back on a traveller whose page was refreshed
    // under them (a page refresh re-reads the image off the event data).
    dressTraveller: (ev) => {
      const sheet = ev?._roadTraveller?.sheet;
      if (!sheet) return;
      if (ev.characterName() !== sheet.name || ev.characterIndex() !== sheet.index) {
        ev.setImage(sheet.name, sheet.index);
      }
    },

    // The traveller has left the square: their slot goes back to the pool,
    // under the placeholder name freeProcNPCSlot looks for, and the snapshot
    // that would have brought them back on a scene rebuild is dropped.
    releaseTravellerNPC: (ev) => {
      if (!ev || !ev._roadTraveller) return;
      const slotName = ev._roadTraveller.slotName;
      ev._roadTraveller = null;
      ev._roadsideNPC = false;
      ev._npcSpawnData = null;
      ev.setThrough(false);
      ev.setPriorityType(1);
      ev.erase();
      if (slotName && ev.event()) ev.event().name = slotName;
      if (Array.isArray($gameSystem?.npcControllers)) {
        $gameSystem.npcControllers = $gameSystem.npcControllers.filter(c => c?.event !== ev);
      }
    },

  });

  // ==========================================================================
  //  ROAD TRAVELLERS (road biomes only)
  //
  //  People on the road between towns: on foot, on a bike or on a broomstick,
  //  as NPCLifeSim.travellersNear says (real travellers on a road leg of a
  //  trip, refugees on the move, passers-by from the towns around). They are
  //  put down by NPCSystem.spawnTravellerNPC, so they are the same named
  //  people the rest of the simulation knows and the Empathize panel opens on
  //  them; this section only walks them.
  //
  //  Nobody takes a car lane. Around each carriageway of the dual highway:
  //      verge     one tile outside the carriageway (b-1 and b+7): walkers
  //      shoulder  the carriageway's outer edge tile (b and b+6): bikes
  //      sky       the median's middle row / column, edge to edge: brooms,
  //                which fly over everything and are never run over
  //  A path runs from one map border to another, turning round the
  //  intersection the way the verge does (clockwise from one arm to the next
  //  one the road has), and is walked both ways. At the far edge the
  //  traveller is gone and the slot is handed back; the next one turns up
  //  20-40 game minutes later.
  //
  //  Somebody on a trip in their OWN car (mode "car", a key holder, see
  //  NPCSim.Vehicles.hasCar) is not walked here at all: the entry is handed
  //  to RoadCarAI.driveTravellerCar, which puts one of the square's cars on
  //  the lane that runs their way with them at the wheel.
  // ==========================================================================

  // The lanes, the clock and the collision box this walks them by belong to
  // Vehicle/RoadCarAI.js, which loads first and publishes them on
  // window.RoadCarAI; the map's size and its biome are read live off it.
  const RC = window.RoadCarAI || {};
  const {
    PROC_MAP_ID, VAR_WORLD_X, VAR_WORLD_Y, MODE_BROOM, isRoad, currentRoadShape, roadGeometry,
    worldCellKey, nearPlayer, dirToward, dxOf, dyOf, carBodyAt, getGameTimeMinutes,
  } = RC;
  const MODE_CAR = RC.MODE_CAR || "car";  // i18n-ignore  travel mode id

  const TRAVELLERS_2D_MAX = 4;
  const TRAVELLER_RESPAWN_MIN = 20;   // game minutes between arrivals
  const TRAVELLER_RESPAWN_MAX = 40;
  const TRAVELLER_STUCK_LIMIT = 240;  // frames a traveller waits before leaving
  const TRAVELLER_OPEN_SHARE = 0.75;  // a verge path must be this walkable
  // i18n-ignore-start  path kinds and travel mode ids
  const PATH_VERGE = "verge";
  const PATH_SHOULDER = "shoulder";
  const PATH_SKY = "sky";
  const MODE_BIKE = "bike";
  // i18n-ignore-end
  let travellerPaths = [];
  let travellerNextAt = null;         // game minute of the next arrival
  let travellerCell = "";             // the world square the timer belongs to
  let travellerSeen = { hour: -1, names: new Set() };

  // Which map borders the road reaches, off the shape's name.
  function roadArms(shape) {
    const s = String(shape || "");
    if (s.includes("vertical")) return ["N", "S"];
    if (s.includes("cross")) return ["N", "E", "S", "W"];
    if (s === "t-up") return ["N", "E", "W"];
    if (s === "t-down") return ["S", "E", "W"];
    if (s === "t-right") return ["N", "S", "E"];
    if (s === "t-left") return ["N", "S", "W"];
    if (s.includes("corner-up-right") || s.includes("corner-right-up")) return ["N", "E"];
    if (s.includes("corner-up-left") || s.includes("corner-left-up")) return ["N", "W"];
    if (s.includes("corner-down-right") || s.includes("corner-right-down")) return ["S", "E"];
    if (s.includes("corner-down-left") || s.includes("corner-left-down")) return ["S", "W"];
    return ["E", "W"];
  }

  // The border-to-border paths round one ring (the verge or the shoulder)
  // of the intersection. `box` holds the ring's two columns (L, R) and two
  // rows (T, B); a path leaves an arm on its clockwise side, turns every
  // corner up to the next arm the road has, and arrives on that arm's
  // anticlockwise side.
  function ringPaths(box, arms, MX, MY) {
    const ORDER = ["N", "E", "S", "W"];
    const has = (a) => arms.includes(a);
    const cwEnd = { N: [box.R, 0], E: [MX, box.B], S: [box.L, MY], W: [0, box.T] };
    const ccwEnd = { N: [box.L, 0], E: [MX, box.T], S: [box.R, MY], W: [0, box.B] };
    const cornerAfter = { N: [box.R, box.T], E: [box.R, box.B], S: [box.L, box.B], W: [box.L, box.T] };
    const out = [];
    for (let i = 0; i < 4; i++) {
      if (!has(ORDER[i])) continue;
      const pts = [cwEnd[ORDER[i]]];
      let j = i;
      do {
        pts.push(cornerAfter[ORDER[j]]);
        j = (j + 1) % 4;
      } while (!has(ORDER[j]));
      pts.push(ccwEnd[ORDER[j]]);
      const path = [];
      for (const [x, y] of pts) {
        const last = path[path.length - 1];
        if (!last || last.x !== x || last.y !== y) path.push({ x, y });
      }
      out.push(path);
    }
    return out;
  }

  // Every path a traveller may take on this road shape, both ways round.
  // Pure: the geometry is handed in (roadGeometry()).
  function buildTravellerPaths(shape, g) {
    const arms = roadArms(shape);
    const verge = { L: g.LX - 1, R: g.RX + 7, T: g.TY - 1, B: g.BY + 7 };
    const shoulder = { L: g.LX, R: g.RX + 6, T: g.TY, B: g.BY + 6 };
    const out = [];
    const both = (kind, path) => {
      out.push({ kind, path });
      out.push({ kind, path: path.slice().reverse() });
    };
    for (const path of ringPaths(verge, arms, g.MX, g.MY)) both(PATH_VERGE, path);
    for (const path of ringPaths(shoulder, arms, g.MX, g.MY)) both(PATH_SHOULDER, path);
    // The sky: straight down the middle of the median, border to border.
    const midY = Math.floor((g.TY + g.BY + 6) / 2);
    const midX = Math.floor((g.LX + g.RX + 6) / 2);
    if (arms.includes("E") || arms.includes("W")) both(PATH_SKY, [{ x: 0, y: midY }, { x: g.MX, y: midY }]);
    if (arms.includes("N") || arms.includes("S")) both(PATH_SKY, [{ x: midX, y: 0 }, { x: midX, y: g.MY }]);
    return out;
  }

  // Walkable enough to walk: most of its tiles are on the map and passable
  // one way or another (a bush or a fence post is stepped past).
  function pathMostlyOpen(path) {
    let total = 0;
    let open = 0;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      const sx = Math.sign(b.x - a.x);
      const sy = Math.sign(b.y - a.y);
      const steps = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      for (let s = 0; s <= steps; s++) {
        const x = a.x + sx * s, y = a.y + sy * s;
        total++;
        if (x < 0 || y < 0 || x >= RC.gridW || y >= RC.gridH) continue;
        if (isRoad(x, y) || $gameMap.isPassable(x, y, 2) || $gameMap.isPassable(x, y, 6)) open++;
      }
    }
    return total > 0 && open / total >= TRAVELLER_OPEN_SHARE;
  }

  function roadTravellerEvents() {
    return $gameMap.events().filter((e) => e && !e._erased && e._roadTraveller);
  }

  // Called from initializeRoadCars once the lanes are known. A menu closed
  // over the square rebuilds the scene and calls this again: whoever is
  // already on the road keeps going and the timer keeps its place.
  function initRoadTravellers() {
    travellerPaths = [];
    if (RC.biomeCategory !== "road") return;
    if (!window.NPCSystem?.spawnTravellerNPC || !window.NPCLifeSim?.travellersNear) return;
    const all = buildTravellerPaths(currentRoadShape(), roadGeometry());
    travellerPaths = all.filter((p) => p.kind === PATH_SKY || pathMostlyOpen(p.path));
    const cell = worldCellKey();
    if (cell !== travellerCell) {
      travellerCell = cell;
      travellerNextAt = null; // a new square: whoever is about is met at once
    }
  }

  function pathKindFor(mode) {
    return mode === MODE_BROOM ? PATH_SKY : mode === MODE_BIKE ? PATH_SHOULDER : PATH_VERGE;
  }

  // The path whose run best agrees with the way the traveller is heading
  // (world-map y grows southward, as map y does), among those free to start.
  function pickTravellerPath(entry) {
    const kind = pathKindFor(entry.mode);
    const h = entry.heading || { x: 0, y: 0 };
    let best = null;
    let bestScore = -Infinity;
    for (const p of travellerPaths) {
      if (p.kind !== kind) continue;
      const a = p.path[0];
      const b = p.path[p.path.length - 1];
      if (nearPlayer(a.x, a.y, 3)) continue;
      if (kind !== PATH_SKY && $gameMap.eventsXy(a.x, a.y).some((e) => !e._erased)) continue;
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const score = ((b.x - a.x) * h.x + (b.y - a.y) * h.y) / len + Math.random() * 0.5;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return best;
  }

  function spawnRoadTraveller(entry) {
    const p = pickTravellerPath(entry);
    if (!p || p.path.length < 2) return null;
    const a = p.path[0];
    const b = p.path[1];
    const ev = window.NPCSystem.spawnTravellerNPC(entry.name, a.x, a.y, {
      mode: entry.mode, dir: dirToward(a.x, a.y, b.x, b.y), ambient: !!entry.ambient,
    });
    if (!ev || !ev._roadTraveller) return null;
    ev._roadTraveller.path = p.path;
    ev._roadTraveller.wp = 1;
    ev._roadTraveller.stuck = 0;
    return ev;
  }

  // Every half second: is somebody due on the road?
  function updateRoadTravellerSpawns() {
    if (!travellerPaths.length || $gameMap.mapId() !== PROC_MAP_ID) return;
    // Nobody left to walk the roads (WorldModes.simulatesPeople).
    const WMo = window.NPCShared?.WorldModes;
    if (WMo && !WMo.simulatesPeople()) return;
    if ($gameMap.isEventRunning()) return;
    const now = getGameTimeMinutes();
    if (travellerNextAt != null && now < travellerNextAt) return;
    travellerNextAt = now + TRAVELLER_RESPAWN_MIN +
      Math.floor(Math.random() * (TRAVELLER_RESPAWN_MAX - TRAVELLER_RESPAWN_MIN + 1));
    const onRoad = roadTravellerEvents();
    const room = TRAVELLERS_2D_MAX - onRoad.length;
    if (room <= 0) return;
    const hour = Math.floor(now / 60);
    if (travellerSeen.hour !== hour) travellerSeen = { hour, names: new Set() };
    const wx = $gameVariables.value(VAR_WORLD_X) || 1;
    const wy = $gameVariables.value(VAR_WORLD_Y) || 1;
    let list = [];
    try {
      list = window.NPCLifeSim.travellersNear(wx, wy, now, room + travellerSeen.names.size) || [];
    } catch (e) {
      list = [];
    }
    let placed = 0;
    for (const entry of list) {
      if (placed >= room) break;
      if (!entry || travellerSeen.names.has(entry.name)) continue;
      travellerSeen.names.add(entry.name);
      // Their own car: one of the square's cars, with them at the wheel.
      if (entry.mode === MODE_CAR) {
        if (RC.driveTravellerCar?.(entry)) placed++;
        continue;
      }
      if (spawnRoadTraveller(entry)) placed++;
    }
  }

  // One step along the path. Walkers and riders wait for whoever stands in
  // the way (the party, somebody else, a car across the shoulder); a broom
  // flies over all of it.
  function updateRoadTraveller(ev) {
    const rt = ev._roadTraveller;
    if (!rt || !rt.path) return;
    window.NPCSystem?.dressTraveller?.(ev);
    if (ev.isMoving()) return;
    // Stopped for a word: they stand and answer.
    if ($gameMap.isEventRunning() && $gameMap._interpreter.eventId() === ev.eventId()) return;
    let wp = rt.wp || 1;
    while (wp < rt.path.length && rt.path[wp].x === ev.x && rt.path[wp].y === ev.y) wp++;
    rt.wp = wp;
    if (wp >= rt.path.length) {
      window.NPCSystem?.releaseTravellerNPC?.(ev);
      return;
    }
    const tgt = rt.path[wp];
    const dir = dirToward(ev.x, ev.y, tgt.x, tgt.y);
    ev.setDirection(dir);
    const nx = ev.x + dxOf(dir);
    const ny = ev.y + dyOf(dir);
    if (rt.mode !== MODE_BROOM) {
      const blocked = ($gamePlayer.x === nx && $gamePlayer.y === ny) ||
        $gameMap.eventsXy(nx, ny).some((e) => e !== ev && !e._erased && !e.isThrough() && e.isNormalPriority()) ||
        carBodyAt(nx, ny, null);
      if (blocked) {
        rt.stuck = (rt.stuck || 0) + 1;
        if (rt.stuck > TRAVELLER_STUCK_LIMIT) window.NPCSystem?.releaseTravellerNPC?.(ev);
        return;
      }
    }
    rt.stuck = 0;
    // The verge is not always kept clear: a bush or a fence post is stepped
    // past rather than stood in front of for ever.
    const wasThrough = ev.isThrough();
    ev.setThrough(true);
    ev.moveStraight(dir);
    ev.setThrough(wasThrough);
  }

  // RoadCarAI calls in here from its own hooks (initializeRoadCars, the
  // Scene_Map and Game_Event updates), so their order on the engine is
  // unchanged by the move.
  if (window.RoadCarAI) {
    window.RoadCarAI.travellers = {
      init: initRoadTravellers,
      reset() { travellerPaths = []; },
      update: updateRoadTraveller,
      updateSpawns: updateRoadTravellerSpawns,
    };
  }

})();
