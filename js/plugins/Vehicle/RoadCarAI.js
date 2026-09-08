//=============================================================================
// RoadCarAI.js
// Version: 4.0.0 - Fully plugin-driven traffic (no event code, sprite-sized cars)
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Road Car AI - Cars are driven entirely by this plugin: sprite-sized collision, roadkill, theft
 * @author Omni-Lex
 * @version 4.0.0
 *
 * @command StealParkedCar
 * @text Steal parked car
 * @desc Offers to break into the parked Car event the player is standing at.
 *
 * @help
 * Road Car AI System v4.0.0
 * =========================
 *
 * A CAR EVENT CARRIES NO LOGIC.
 * -----------------------------
 * An event named "Car" is a sprite and a starting tile, nothing else. Its pages
 * are never run: Game_Event#start is refused for a road car, so whatever
 * triggers, common event calls or plugin commands the event still holds are
 * dead. Everything a car does is decided here:
 *
 *   - which cars drive, which park and which are not there at all
 *   - where a car may go (roads, walls, other cars, pedestrians)
 *   - what happens when a car reaches somebody
 *   - the theft prompt on a parked car (the action button is read by this
 *     plugin, not by an event page)
 *
 * Self switch A is forced OFF for every car on every load, so a car event that
 * still carries the old two-page layout always shows its first page.
 *
 * A CAR IS AS BIG AS ITS SPRITE.
 * ------------------------------
 * A car event stands on one tile but is drawn several tiles long, so every
 * question about where a car is asks window.VehicleFootprint (VehicleSystem.js)
 * for the tiles its CURRENT frame actually covers. The measurement is per sheet,
 * per character index and per DIRECTION, so a car that turns is re-measured and
 * a longer or shorter sprite needs no code change here.
 *
 * The footprint is what drives:
 *   - map collision: no tile of the bodywork may land on region 10 or on
 *     terrain tag 4 (walls / cliffs), so a car never clips a wall it drives past
 *   - car-to-car collision: bodywork against bodywork, not tile against tile
 *   - who is run over: anybody standing under the bodywork
 *
 * WHO GETS HIT.
 * -------------
 * Only a car that is MOVING and in its driving mode hits anything. A parked car
 * is solid and completely harmless; a hidden car is not there at all.
 *
 *   - the player   -> knocked clear + accident common event
 *                     (on foot CE 163, riding the Car CE 167, the Camper CE 168)
 *   - an NPC event -> knocked clear and really injured: injury conditions from
 *                     Diseases.json are written onto their society profile, so
 *                     the wounds show up in the Empathize panel's Health tab
 *   - an Enemy event -> knocked clear and wounded on both its HP tracks, and
 *                     enough of it kills the creature outright, leaving the same
 *                     harvestable corpse a map kill always leaves
 *
 * Town traffic brakes for people; highway traffic does not.
 *
 * THE PLAYER AT THE WHEEL.
 * ------------------------
 * Driving the Car or the Camper (VehicleSystem) over somebody runs them down the
 * same way, on any map.
 *
 *   - an NPC   -> the injuries, plus the victim's opinion of every party member
 *                 and a Hit and Run filed with CrimeSystem
 *   - a creature -> the first two rams it is simply flung off the bonnet; from
 *                 the third the odds it turns and fights climb every time (40%,
 *                 then 65%), and about five rams kill it outright, so roughly
 *                 four times in five a persistent rammer gets a fight instead of
 *                 a corpse. A car the world is driving never starts a fight - an
 *                 NPC running a monster down is an accident the party is not
 *                 part of - though it kills just as readily.
 *                 Under MapBattleMode the party is put out of the vehicle first,
 *                 since that fight is fought where everybody is standing.
 *
 * And the car itself is felt: something soft under the bumper marks the FRONT
 * parts only, another vehicle at road speed is a real crash and is felt all
 * through it. Both go through VehicleSystemRepair (so the Reinforced Chassis
 * upgrade and the critical-part check apply) and name the parts in a toast.
 *
 * SOMEBODY IS DRIVING THESE CARS.
 * -------------------------------
 * Now and then a car pulls over and its driver gets out, walks around, talks to
 * people, and eventually gets back in and carries on in the direction and on the
 * lane it was going.
 *
 *   - on the open ROAD it stops at a lay-by, within a few tiles of a SignPark
 *     the biome generator puts on the verge, and it stops fairly readily there
 *   - in a VILLAGE / CITY / BURG it can stop anywhere there is room to open a
 *     door, but far more rarely: a town car is usually going somewhere
 *
 * A car is never LEFT standing in the carriageway. Before it stops it steers off
 * the road onto the nearest verge or bay whose ground its whole bodywork fits
 * on, and when the driver comes back it drives out to the very tile it pulled
 * off from. A car with no verge within reach simply carries on driving.
 *
 * The driver is a real person, minted through NPCSystem.spawnRoadsideNPC on one
 * of the map's own spare NPC slots: a citizen of this square, or (more often out
 * on the road) an authored face from the world-wide pool, passing through. They
 * get the ordinary wandering brain, so they behave like anybody else in town.
 *
 * The car sits there as an ordinary PARKED car the whole time: solid, harmless,
 * and stealable, which is rather the point of the driver being away from it. A
 * driver who never comes back (recruited, killed, or simply lost) is waited on
 * for a while and then left behind.
 *
 * CAR THEFT:
 * - Pressing the action button while facing a PARKED car offers "Steal car" /
 *   "Cancel". Stealing runs the UnlockingBlocks minigame (a lockpick, item 374,
 *   is required; a skeleton key, item 740, opens it outright).
 * - Success: the party gains the "Utilitarian car" keys (item 164) and the car
 *   is removed from the world (that world cell keeps one parked car fewer).
 * - Failure: a Vehicle Theft crime is logged (the minigame eats the lockpick).
 */

(() => {
  "use strict";

  const PLUGIN_NAME = "RoadCarAI";
  const PROC_MAP_ID = 636;
  const GAME_TIME_VARIABLE = 114;
  const PARKED_SELF_SWITCH = "A"; // page 2 of every Car event = the parked car
  const VAR_WORLD_X = 43;             // player world-map X (FastTravelSystem)
  const VAR_WORLD_Y = 44;             // player world-map Y
  const CAR_KEYS_ITEM_ID = 164;       // "Utilitarian car" summoning keys
  const LOCKPICK_ITEM_ID = 374;
  const SKELETON_KEY_ITEM_ID = 740;
  // Road/highway cars are fast and lane-disciplined; town cars are slower and
  // yield to actors. MZ move speeds: 4 = normal, higher = faster.
  const CAR_SPEED_ROAD = 5;       // highways: fast, follow lane end-to-end
  const CAR_SPEED_CITY = 4;       // cities/villages: cautious but not sluggish
  const STUCK_LIMIT = 100;        // frames a driving car waits before respawning
  const TOTAL_CAR_CAP = 10;       // hard cap on active cars regardless of plan
  const HIT_GRACE_FRAMES = 90;    // frames of immunity after being run over
  // City/village streets are wide (multi-lane) bands, so the tile beside a car
  // is very often still "road" without the car having reached a real side
  // street - a free-roaming car re-rolling turnChanceForBiome() on every tile
  // of a wide junction would flip heading back and forth inside the same
  // intersection for ever, which reads as driving in circles. A car that has
  // just turned (or just entered a new lane after a forced bend) holds that
  // heading for a random run of tiles before it is allowed to volunteer for
  // another turn; a straight blocked by traffic can still force one sooner.
  const TURN_COOLDOWN_MIN = 5;
  const TURN_COOLDOWN_MAX = 12;

  // Walking into a procedural square from a world-map road drops the player ON
  // the border tile they came in from - which is exactly where traffic enters
  // and leaves. A car dropped there on the first frame, pointed inward at road
  // speed, runs the player over before they can take a step, so no car is ever
  // placed inside a box around the player, and the initial fill keeps off the
  // border band entirely (cars still ENTER from the border later, they are just
  // not standing there the moment the map opens).
  const SPAWN_PLAYER_CLEARANCE = 14; // tiles kept clear around the player
  const SPAWN_BORDER_MARGIN = 10;    // border band with no first-frame spawns

  // Tiles no bodywork may ever cover, whatever the road data says. Region 10 is
  // the game's "keep out" marker and terrain tag 4 is a wall / climbable face.
  const BLOCK_REGION_ID = 10;
  const BLOCK_TERRAIN_TAG = 4;

  // Injuries a car hands out, all `category: "injury"` entries of
  // js/db/Health/Diseases.json. What lands is rolled per victim.
  const CRASH_INJURIES = [
    'broken-leg', 'broken-arm', 'broken-rib', 'concussion', 'whiplash',
    'sprained-ankle', 'dislocated-shoulder', 'deep-laceration',
  ];
  const CRASH_INJURIES_SEVERE = ['spinal-injury', 'broken-rib', 'concussion'];
  // What a victim thinks of the party after being knocked down by them.
  const OPINION_PER_HIT = 28;

  // What one ram takes off a creature's HP bar. A car is a car whoever is at the
  // wheel, so this is the same for the party and for the world's traffic: about
  // FIVE rams and the creature is dead under the wheels.
  const ENEMY_RAM_SHARE = 0.22;

  // A creature the PARTY rams eventually stops taking it. The first two rams it
  // is simply flung off the bonnet; from the third the odds it turns and fights
  // climb every time. The curve is deliberately steep enough to resolve inside
  // the four rams the creature survives: 40% on the third and 65% on the fourth,
  // so about four times in five it is a fight rather than a roadkill. A car the
  // world is driving never starts a fight - an NPC running a monster down is an
  // accident the party is not part of - though it kills just as readily.
  const RAM_FREE_HITS = 2;
  const RAM_BATTLE_BASE = 0.4;   // the third ram
  const RAM_BATTLE_STEP = 0.25;  // and every ram after it
  const RAM_BATTLE_MAX = 0.95;

  // What the party's own vehicle takes out of a collision. Something soft goes
  // under the bumper and marks the front of the car; another vehicle at road
  // speed is a real crash and is felt all through it.
  // The front of a car, out of VehicleSystemRepair's part table.
  const FRONT_PARTS = ["Body", "Radiator", "Engine", "Battery", "Air Filter", "Alternator"];  // i18n-ignore  part ids
  const RAM_VEHICLE_DAMAGE = 4;    // per cent, over one or two front parts
  // Most of what goes under the bumper leaves nothing behind but a mark on the
  // paint: a creature is soft, and a car that lost a radiator to every animal
  // it hit would be in the workshop after one drive. Only now and then does one
  // land badly enough to cost anything, so a ram damages the vehicle this often.
  const RAM_VEHICLE_DAMAGE_CHANCE = 0.12;
  const CRASH_VEHICLE_DAMAGE = 24; // per cent, over the 3-7 parts a crash reaches

  // ── Pulling over ────────────────────────────────────────────────────────
  // Somebody is driving these cars, and now and then they stop and get out. On
  // the open road that happens at a lay-by (a SignPark on the verge, placed by
  // the biome generator); in a town it can happen anywhere there is room, but
  // far more rarely, because a town car is usually going somewhere.
  //
  // A town has somewhere to put a car: the city generator paints real bays in
  // its car parks and stands a SignPark over them, so a driver in a settlement
  // heads for one of those rather than abandoning the car in the middle of a
  // street. Anywhere there is a bay is a place a driver will stop far more
  // readily than the open kerb. The two sheets name their bays differently -
  // the City tileset paints ParkingDrawing, the Road tileset Parking - and a
  // lay-by on the open road is a SignPark, so all three are read.
  const PARKING_FEATURES = ["SignPark", "ParkingDrawing", "Parking"];  // i18n-ignore  tileset feature ids
  const PARK_SIGN_RANGE = 4;      // tiles from the sign a car will pull over in
  const PARK_CHANCE_ROAD = 0.22;  // per step taken within reach of a lay-by
  const PARK_CHANCE_BAY = 0.30;   // per step taken within reach of a real bay
  const PARK_CHANCE_TOWN = 0.004; // per step taken anywhere else in a settlement
  const PARK_MINUTES_MIN = 25;    // how long the driver stays out, in game time
  const PARK_MINUTES_MAX = 180;
  // Whoever gets out. On the open road they are usually from somewhere else
  // (that is what a road is for); in a town they are usually a local.
  const PARK_VISITOR_CHANCE_ROAD = 0.7;
  const PARK_VISITOR_CHANCE_TOWN = 0.35;
  const PARK_BOARD_RANGE = 2;     // how close the driver has to be to get back in
  const PARK_PATIENCE = 40;       // game minutes a car waits for a lost driver
  // How far off the lane a driver will look for somewhere to leave the car, and
  // how long they lean on a blocked way onto it before giving up and driving on.
  const PULL_OVER_RANGE = 5;
  const PULL_OVER_LIMIT = 12;

  let lastHitFrame = -HIT_GRACE_FRAMES - 1;

  // Debug logging: silent by default. Flip $gameSystem._roadCarAIDebug (or the
  // global window.ROADCARAI_DEBUG) to true to surface traffic diagnostics.
  const isDebug = () =>
    (typeof window !== "undefined" && window.ROADCARAI_DEBUG) ||
    (typeof $gameSystem !== "undefined" && $gameSystem && $gameSystem._roadCarAIDebug);
  const dlog = (...args) => { if (isDebug()) console.log(...args); };
  const dwarn = (...args) => { if (isDebug()) console.warn(...args); };

  // Directions (MZ): 2=Down, 4=Left, 6=Right, 8=Up
  const dxOf = (d) => (d === 4 ? -1 : d === 6 ? 1 : 0);
  const dyOf = (d) => (d === 8 ? -1 : d === 2 ? 1 : 0);
  const perpDirs = (d) => (d === 2 || d === 8 ? [4, 6] : [2, 8]);

  // Per-map runtime road data (rebuilt on every proc map load)
  let roadGrid = null;            // Uint8Array, 1 = road tile
  let gridW = 0;
  let gridH = 0;
  let roadTiles = [];            // [{x,y}] every road tile
  let roadEdgeTiles = [];        // road tiles near the map border (spawn points)
  let roadInnerTiles = [];       // road tiles away from the border (first fill)
  let biomeCategory = "none";    // 'road' | 'city' | 'village' | 'none'
  let laneDefs = [];             // road biome: fixed lane paths (see LANE GEOMETRY)
  let laneCursor = 0;            // round-robin lane assignment counter

  // Traffic handedness. true = drive on the right (a car keeps the dashed centre
  // line on its LEFT). Flip to false for left-hand traffic; every lane in the
  // table below is derived from this, so nothing else needs changing.
  const DRIVE_ON_RIGHT = true;

  // ==========================================================================
  //  TIME / DENSITY
  // ==========================================================================

  function getGameTimeMinutes() {
    return $gameVariables.value(GAME_TIME_VARIABLE) || 0;
  }

  function getHourFromMinutes(minutes) {
    const date = new Date(2001, 0, 1, 12, 0, 0);
    date.setMinutes(date.getMinutes() + minutes);
    return date.getHours();
  }

  function getTrafficDensityMultiplier() {
    const hour = getHourFromMinutes(getGameTimeMinutes());
    if ((hour >= 7 && hour < 9) || (hour >= 17 && hour < 19)) return 1.0; // rush hour
    if (hour >= 22 || hour < 6) return 0.25;                              // night
    return 0.6;                                                            // day
  }

  function classifyBiome(name) {
    if (!name) return "none";
    const l = name.toLowerCase();
    if (l.includes("village")) return "village";
    if (l.includes("city") || l.includes("burg")) return "city";
    if (l.includes("road") || l.includes("highway") || l.includes("bridge") || l.includes("tunnel")) return "road";
    return "none";
  }

  // Nobody is left to be driving anywhere (WorldManager.populationMode
  // "empty"): there is no traffic at all, only the cars people left where they
  // stood. Half of those were locked on the way out and half were not, decided
  // per car and never re-decided (see isEmptyWorldCarUnlocked).
  function isEmptyWorld() {
    const WM = window.WorldManager;
    return !!(WM && typeof WM.isEmptyWorld === "function" && WM.isEmptyWorld());
  }

  // Was this one left unlocked? A pure function of (map, tile, world seed), so
  // one car gives the same answer for ever and in every savegame of the world.
  const EMPTY_WORLD_UNLOCKED_SHARE = 0.5;
  function isEmptyWorldCarUnlocked(car) {
    if (!car) return false;
    const seed = (window.HistoryManager && window.HistoryManager.getSeed)
      ? window.HistoryManager.getSeed() : 19002001;
    let h = (($gameMap ? $gameMap.mapId() : 0) * 73856093) ^
            (car.x * 19349663) ^ (car.y * 83492791) ^ seed;
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
    return (h % 1000) / 1000 < EMPTY_WORLD_UNLOCKED_SHARE;
  }

  // In a zombie apocalypse nobody is left driving around a settlement: town and
  // village traffic is parked where it stood, same as an empty world. The open
  // road is different - every road cell is somebody's escape route out of a
  // city - so a small, fixed share of road cells still carry a car somebody is
  // driving. Which cells those are is decided once, from the world seed and the
  // cell's own world-map coordinates, so it is settled at world creation and
  // never reshuffles on a later visit.
  function isZombieWorld() {
    const WM = window.WorldManager;
    return !!(WM && typeof WM.isZombieWorld === "function" && WM.isZombieWorld());
  }

  const ZOMBIE_ROAD_CAR_CHANCE = 0.12; // share of road cells still driven in zombie mode
  function isZombieRoadCellActive() {
    const seed = (window.HistoryManager && window.HistoryManager.getSeed)
      ? window.HistoryManager.getSeed() : 19002001;
    const wx = $gameVariables.value(VAR_WORLD_X) || 0;
    const wy = $gameVariables.value(VAR_WORLD_Y) || 0;
    let h = (wx * 73856093) ^ (wy * 19349663) ^ seed;
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
    return (h % 1000) / 1000 < ZOMBIE_ROAD_CAR_CHANCE;
  }

  // Returns how many driving / parked cars this biome should have right now
  function getCarPlan() {
    const mult = getTrafficDensityMultiplier();
    let driving = 0;
    let parked = 0;
    if (biomeCategory === "village") {
      driving = Math.max(0, Math.round(1 * mult)); // 0-1 moving cars
      parked = 3;                                  // mostly parked
    } else if (biomeCategory === "city") {
      driving = Math.max(1, Math.round(7 * mult));
      parked = 2;
    } else if (biomeCategory === "road") {
      driving = Math.max(1, Math.round(6 * mult));
      parked = 0;
    }
    // An empty world has no traffic: every car this cell would have had is
    // standing still instead, and none of them is being driven anywhere.
    if (isEmptyWorld()) {
      parked = Math.max(parked, driving + parked);
      driving = 0;
    }
    // A zombie world still has people, just none of them left in a settlement:
    // town and village traffic sits abandoned like an empty world's does, but
    // the open road keeps a rare car somebody is still driving on it.
    if (isZombieWorld()) {
      if (biomeCategory === "road") {
        driving = isZombieRoadCellActive() ? 1 : 0;
      } else {
        parked = Math.max(parked, driving + parked);
        driving = 0;
      }
    }
    // Cars stolen here are gone for good: this world cell parks that many fewer.
    parked = Math.max(0, parked - stolenCarCount());
    // Respect the global cap
    if (driving + parked > TOTAL_CAR_CAP) {
      parked = Math.min(parked, TOTAL_CAR_CAP);
      driving = Math.max(0, TOTAL_CAR_CAP - parked);
    }
    return { driving, parked };
  }

  // ==========================================================================
  //  ROAD DETECTION (runtime)
  // ==========================================================================

  // Every tile id the tileset's features declare, for the feature names the
  // test accepts. One reader for the carriageway and for the parking signs.
  function featureTileIdSet(tilesetId, matches) {
    const set = new Set();
    try {
      const Cache = window.ProcGenUtils && window.ProcGenUtils.Cache;
      if (!Cache) return set;
      const features = Cache.getTilesetFeatures(tilesetId);
      if (!features) return set;
      for (const [name, list] of Object.entries(features)) {
        if (!matches(name) || !Array.isArray(list)) continue;
        list.forEach((v) => {
          if (v.type === "single") {
            set.add(v.tileId);
          } else if (v.type === "multi" && v.tiles) {
            v.tiles.forEach((row) => row.forEach((id) => set.add(id)));
          } else if (v.type === "grid" && v.grid) {
            v.grid.forEach((row) => row.forEach((id) => { if (id) set.add(id); }));
          }
        });
      }
    } catch (e) {
      /* a tileset we cannot read simply declares nothing */
    }
    return set;
  }

  function getRoadTileIdSet(tilesetId) {
    return featureTileIdSet(tilesetId, (name) => {
      const ln = name.toLowerCase();
      return ln.includes("road") || ln.includes("dashed");
    });
  }

  // Within `margin` tiles of any map edge.
  const nearBorder = (x, y, margin) =>
    x < margin || y < margin || x >= gridW - margin || y >= gridH - margin;

  // Inside the box of `radius` tiles around the player. Nothing is dropped in
  // here: on a highway a car this close is already touching them next frame.
  const nearPlayer = (x, y, radius) =>
    Math.abs(x - $gamePlayer.x) <= radius && Math.abs(y - $gamePlayer.y) <= radius;

  function buildRoadGrid() {
    roadGrid = null;
    roadTiles = [];
    roadEdgeTiles = [];
    roadInnerTiles = [];
    gridW = $dataMap.width;
    gridH = $dataMap.height;

    const roadIds = getRoadTileIdSet($gameMap.tilesetId());
    if (!roadIds || roadIds.size === 0) return; // no road data -> isRoad() falls back

    const data = $dataMap.data;
    const layerSize = gridW * gridH;
    const grid = new Uint8Array(layerSize);

    for (let i = 0; i < layerSize; i++) {
      if (
        roadIds.has(data[i]) ||
        roadIds.has(data[i + layerSize]) ||
        roadIds.has(data[i + layerSize * 2]) ||
        roadIds.has(data[i + layerSize * 3])
      ) {
        grid[i] = 1;
        const x = i % gridW;
        const y = Math.floor(i / gridW);
        roadTiles.push({ x, y });
        // True map-border road tiles = where cars enter/leave the map.
        if (x === 0 || y === 0 || x === gridW - 1 || y === gridH - 1) {
          roadEdgeTiles.push({ x, y });
        }
        // Deep enough inside the map that a car put here on load cannot be on
        // top of somebody who just walked in over the border.
        if (!nearBorder(x, y, SPAWN_BORDER_MARGIN)) roadInnerTiles.push({ x, y });
      }
    }
    // Fallback: if the road never touches the exact edge, widen the margin
    // so respawns still happen near a border rather than mid-map.
    if (roadEdgeTiles.length === 0) {
      for (const t of roadTiles) {
        if (t.x < 3 || t.y < 3 || t.x > gridW - 4 || t.y > gridH - 4) {
          roadEdgeTiles.push(t);
        }
      }
    }
    roadGrid = grid;
  }

  function isRoad(x, y) {
    if (x < 0 || y < 0 || x >= gridW || y >= gridH) return false;
    if (!roadGrid) return true; // no road data: treat everything as drivable
    return roadGrid[y * gridW + x] === 1;
  }

  // ==========================================================================
  //  LANE GEOMETRY (road biomes only)
  //
  //  ProceduralMapRoadGenerator draws every road biome as a DUAL highway with
  //  fixed constants: roadWidth = 7, separation = 3. That gives two carriageways
  //  per axis, each 7 tiles wide with a dashed centre line down its middle:
  //
  //      carriageway base b -> tiles b..b+6, dashed centre line at b+3
  //      lane A = b+1  (the three tiles b..b+2, left/above the centre line)
  //      lane B = b+5  (the three tiles b+4..b+6, right/below the centre line)
  //
  //  Under right-hand traffic a car keeps the centre line on its left, so:
  //      horizontal carriageway: westbound = b+1, eastbound = b+5
  //      vertical   carriageway: southbound = b+1, northbound = b+5
  //
  //  A "lane" here is a hardcoded polyline from one map border to another,
  //  including the turns a corner / T junction forces. Cars in road biomes are
  //  pinned to one of these lanes and never deviate.
  // ==========================================================================

  // Geometry of the dual highway, mirroring the generator's own arithmetic.
  function roadGeometry() {
    const roadWidth = 7;
    const separation = 3;
    const halfRoad = 3;
    const cx = Math.floor(gridW / 2);
    const cy = Math.floor(gridH / 2);
    return {
      TY: cy - halfRoad - roadWidth - separation, // top carriageway base
      BY: cy + halfRoad + separation,             // bottom carriageway base
      LX: cx - halfRoad - roadWidth - separation, // left carriageway base
      RX: cx + halfRoad + separation,             // right carriageway base
      MX: gridW - 1,
      MY: gridH - 1,
    };
  }

  // Normalize the generated shape name to the set used by the lane table.
  function currentRoadShape() {
    const raw = ($gameSystem._procGenData && $gameSystem._procGenData.roadIntersectionType) || "";
    let s = String(raw).toLowerCase();
    if (!s) return "horizontal";
    s = s.replace("north", "up").replace("south", "down");
    s = s.replace("east", "right").replace("west", "left");
    // t-junctions keep compass-free names: t-up / t-down / t-left / t-right
    return s;
  }

  // Build the fixed lane paths for the current road shape.
  function buildRoadLanes() {
    laneDefs = [];
    laneCursor = 0;

    const g = roadGeometry();
    const { TY, BY, LX, RX, MX, MY } = g;

    // Lane offsets inside a carriageway, flipped for left-hand traffic.
    const near = DRIVE_ON_RIGHT ? 1 : 5; // westbound / southbound
    const far = DRIVE_ON_RIGHT ? 5 : 1;  // eastbound / northbound

    const TOP_W = TY + near, TOP_E = TY + far;   // top carriageway lanes
    const BOT_W = BY + near, BOT_E = BY + far;   // bottom carriageway lanes
    const LEFT_S = LX + near, LEFT_N = LX + far; // left carriageway lanes
    const RIGHT_S = RX + near, RIGHT_N = RX + far; // right carriageway lanes

    const p = (...pts) => pts.map(([x, y]) => ({ x, y }));

    // Straight-through lanes, border to border
    const H_THROUGH = [
      p([MX, TOP_W], [0, TOP_W]),
      p([0, TOP_E], [MX, TOP_E]),
      p([MX, BOT_W], [0, BOT_W]),
      p([0, BOT_E], [MX, BOT_E]),
    ];
    const V_THROUGH = [
      p([LEFT_S, 0], [LEFT_S, MY]),
      p([LEFT_N, MY], [LEFT_N, 0]),
      p([RIGHT_S, 0], [RIGHT_S, MY]),
      p([RIGHT_N, MY], [RIGHT_N, 0]),
    ];

    const shape = currentRoadShape();
    let lanes;

    if (shape.includes("vertical")) {
      lanes = V_THROUGH;
    } else if (shape.includes("cross")) {
      lanes = [...H_THROUGH, ...V_THROUGH];
    } else if (shape === "t-up") {
      // Horizontals run full width; vertical stems reach the NORTH border only.
      lanes = [
        ...H_THROUGH,
        p([LEFT_S, 0], [LEFT_S, TOP_W], [0, TOP_W]),
        p([RIGHT_S, 0], [RIGHT_S, TOP_E], [MX, TOP_E]),
        p([0, TOP_E], [LEFT_N, TOP_E], [LEFT_N, 0]),
        p([MX, TOP_W], [RIGHT_N, TOP_W], [RIGHT_N, 0]),
      ];
    } else if (shape === "t-down") {
      // Horizontals run full width; vertical stems reach the SOUTH border only.
      lanes = [
        ...H_THROUGH,
        p([MX, BOT_W], [LEFT_S, BOT_W], [LEFT_S, MY]),
        p([0, BOT_E], [RIGHT_S, BOT_E], [RIGHT_S, MY]),
        p([LEFT_N, MY], [LEFT_N, BOT_E], [MX, BOT_E]),
        p([RIGHT_N, MY], [RIGHT_N, BOT_W], [0, BOT_W]),
      ];
    } else if (shape === "t-right") {
      // Verticals run full height; horizontal stems reach the EAST border only.
      lanes = [
        ...V_THROUGH,
        p([RIGHT_S, 0], [RIGHT_S, TOP_E], [MX, TOP_E]),
        p([RIGHT_N, MY], [RIGHT_N, BOT_E], [MX, BOT_E]),
        p([MX, TOP_W], [RIGHT_N, TOP_W], [RIGHT_N, 0]),
        p([MX, BOT_W], [RIGHT_S, BOT_W], [RIGHT_S, MY]),
      ];
    } else if (shape === "t-left") {
      // Verticals run full height; horizontal stems reach the WEST border only.
      lanes = [
        ...V_THROUGH,
        p([LEFT_S, 0], [LEFT_S, TOP_W], [0, TOP_W]),
        p([LEFT_N, MY], [LEFT_N, BOT_W], [0, BOT_W]),
        p([0, TOP_E], [LEFT_N, TOP_E], [LEFT_N, 0]),
        p([0, BOT_E], [LEFT_S, BOT_E], [LEFT_S, MY]),
      ];
    } else if (shape.includes("corner-up-right") || shape.includes("corner-right-up")) {
      // Connects NORTH and EAST. Outer = left vertical + bottom horizontal.
      lanes = [
        p([LEFT_S, 0], [LEFT_S, BOT_E], [MX, BOT_E]),
        p([MX, BOT_W], [LEFT_N, BOT_W], [LEFT_N, 0]),
        p([RIGHT_S, 0], [RIGHT_S, TOP_E], [MX, TOP_E]),
        p([MX, TOP_W], [RIGHT_N, TOP_W], [RIGHT_N, 0]),
      ];
    } else if (shape.includes("corner-up-left") || shape.includes("corner-left-up")) {
      // Connects NORTH and WEST. Outer = right vertical + bottom horizontal.
      lanes = [
        p([LEFT_S, 0], [LEFT_S, TOP_W], [0, TOP_W]),
        p([0, TOP_E], [LEFT_N, TOP_E], [LEFT_N, 0]),
        p([RIGHT_S, 0], [RIGHT_S, BOT_W], [0, BOT_W]),
        p([0, BOT_E], [RIGHT_N, BOT_E], [RIGHT_N, 0]),
      ];
    } else if (shape.includes("corner-down-right") || shape.includes("corner-right-down")) {
      // Connects SOUTH and EAST. Outer = left vertical + top horizontal.
      lanes = [
        p([LEFT_N, MY], [LEFT_N, TOP_E], [MX, TOP_E]),
        p([MX, TOP_W], [LEFT_S, TOP_W], [LEFT_S, MY]),
        p([RIGHT_N, MY], [RIGHT_N, BOT_E], [MX, BOT_E]),
        p([MX, BOT_W], [RIGHT_S, BOT_W], [RIGHT_S, MY]),
      ];
    } else if (shape.includes("corner-down-left") || shape.includes("corner-left-down")) {
      // Connects SOUTH and WEST. Outer = right vertical + top horizontal.
      lanes = [
        p([LEFT_N, MY], [LEFT_N, BOT_W], [0, BOT_W]),
        p([0, BOT_E], [LEFT_S, BOT_E], [LEFT_S, MY]),
        p([RIGHT_N, MY], [RIGHT_N, TOP_W], [0, TOP_W]),
        p([0, TOP_E], [RIGHT_S, TOP_E], [RIGHT_S, MY]),
      ];
    } else {
      lanes = H_THROUGH; // "horizontal" and any unknown shape
    }

    // Drop any lane the actual generated map doesn't back with road tiles
    // (blended biome borders, unexpected shapes, water cutouts...).
    laneDefs = lanes.filter(laneIsOnRoad);
    dlog(`[RoadCarAI] shape "${shape}": ${laneDefs.length}/${lanes.length} lanes valid.`);
  }

  // ---- path helpers --------------------------------------------------------

  function pathLength(path) {
    let len = 0;
    for (let i = 1; i < path.length; i++) {
      len += Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y);
    }
    return len;
  }

  // A lane is usable if nearly every tile it runs over is actually road.
  function laneIsOnRoad(path) {
    let total = 0;
    let onRoad = 0;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      const sx = Math.sign(b.x - a.x);
      const sy = Math.sign(b.y - a.y);
      const steps = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      for (let s = 0; s <= steps; s++) {
        total++;
        if (isRoad(a.x + sx * s, a.y + sy * s)) onRoad++;
      }
    }
    return total > 0 && onRoad / total >= 0.85;
  }

  // Point `dist` tiles along the lane, plus the waypoint index it is heading to.
  function pointAlongPath(path, dist) {
    let remaining = Math.max(0, dist);
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      const seg = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      if (remaining <= seg) {
        return {
          x: a.x + Math.sign(b.x - a.x) * remaining,
          y: a.y + Math.sign(b.y - a.y) * remaining,
          wp: i,
        };
      }
      remaining -= seg;
    }
    const last = path[path.length - 1];
    return { x: last.x, y: last.y, wp: path.length - 1 };
  }

  const dirToward = (fx, fy, tx, ty) =>
    tx > fx ? 6 : tx < fx ? 4 : ty > fy ? 2 : 8;

  // Place a car on lane `li`, `dist` tiles in from that lane's entry border.
  function placeOnLane(ev, li, dist) {
    const path = laneDefs[li];
    const pt = pointAlongPath(path, dist);
    const tgt = path[pt.wp];
    ev._carLane = li;
    ev._carWaypoint = pt.wp;
    ev._carStuck = 0;
    ev._carPullTo = null;
    ev.setPosition(pt.x, pt.y);
    ev._carDir = dirToward(pt.x, pt.y, tgt.x, tgt.y);
    ev.setDirection(ev._carDir);
  }

  // Car reached its exit border (or got wedged): re-enter on a random lane.
  function respawnLaneCar(ev) {
    if (laneDefs.length === 0) return;
    for (let tries = 0; tries < 20; tries++) {
      const li = Math.floor(Math.random() * laneDefs.length);
      const start = laneDefs[li][0];
      const dir = dirToward(start.x, start.y, laneDefs[li][1].x, laneDefs[li][1].y);
      // Not into the player's lap: a lane entry is a border tile, and the
      // player standing on one is how they walked into this square.
      if (nearPlayer(start.x, start.y, SPAWN_PLAYER_CLEARANCE)) continue;
      if (!carCanBePlaced(ev, start.x, start.y, dir)) continue;
      placeOnLane(ev, li, 0);
      return;
    }
  }

  // Drive one step along the assigned lane. Cars never leave their lane; if the
  // tile ahead is occupied they queue behind it.
  function updateLaneCar(ev) {
    const path = laneDefs[ev._carLane];
    if (!path) {
      ev._carLane = null;
      return;
    }

    // Consume any waypoints we are already standing on (i.e. finished a turn).
    let wi = ev._carWaypoint || 0;
    while (wi < path.length && path[wi].x === ev.x && path[wi].y === ev.y) wi++;
    ev._carWaypoint = wi;

    // Past the final waypoint = drove off the map border -> re-enter elsewhere.
    if (wi >= path.length) {
      respawnLaneCar(ev);
      return;
    }

    const tgt = path[wi];
    const dir = dirToward(ev.x, ev.y, tgt.x, tgt.y);
    ev._carDir = dir;
    ev.setDirection(dir);

    const nx = ev.x + dxOf(dir);
    const ny = ev.y + dyOf(dir);
    // The whole bodywork has to fit: a lane laid over a wall, a car queueing in
    // front and (in town) somebody in the road all hold this one where it is.
    if (!carCanEnter(ev, nx, ny, dir)) {
      ev._carStuck = (ev._carStuck || 0) + 1;
      if (ev._carStuck > STUCK_LIMIT) respawnLaneCar(ev);
      return;
    }

    ev._carStuck = 0;
    ev.moveStraight(dir);
  }

  // Open ground for parking: not a road, walkable from every side
  function isOpenGround(x, y) {
    if (x < 0 || y < 0 || x >= gridW || y >= gridH) return false;
    if (isRoad(x, y)) return false;
    return (
      $gameMap.isPassable(x, y, 2) &&
      $gameMap.isPassable(x, y, 8) &&
      $gameMap.isPassable(x, y, 4) &&
      $gameMap.isPassable(x, y, 6)
    );
  }

  // ==========================================================================
  //  SPRITE-SIZED COLLISION
  // ==========================================================================
  //
  // A car sprite is several tiles long but the event stands on one tile. Every
  // question this plugin asks about where a car IS goes through VehicleSystem's
  // window.VehicleFootprint, which measures the opaque pixels of the frame the
  // car is showing right now and answers with the tiles it covers. The
  // measurement is per sheet, per character index and per direction, so a car
  // that turns is re-measured and a bigger sprite needs no change here.
  //
  // The whole bodywork is what steers: a car only enters a tile when none of the
  // tiles its body would then stand on is a wall, another car, or (in town) a
  // person. The one thing still read on the single anchor tile is the ROAD, so a
  // car is allowed to overhang the verge while its wheels keep to the lane.

  let carEvents = []; // the Car events of the map currently loaded
  const SINGLE_TILE = { minDx: 0, maxDx: 0, minDy: 0, maxDy: 0 };

  // Rebuilt on every load of the procedural map; the fallback covers a collision
  // check that lands before initializeRoadCars has run.
  function roadCarEvents() {
    if (carEvents.length === 0) {
      carEvents = $gameMap.events().filter((e) => e && e._isRoadCar);
    }
    return carEvents;
  }

  function collectCarFootprints(list) {
    if ($gameMap.mapId() !== PROC_MAP_ID) return;
    for (const ev of roadCarEvents()) {
      if (!ev || ev._erased) continue;
      if (ev._carMode !== "driving" && !isStandingCar(ev)) continue;
      list.push(ev);
    }
  }

  function registerCarFootprints() {
    if (window.VehicleFootprint) window.VehicleFootprint.addSource(collectCarFootprints);
  }

  // True when the car's bodywork lies over that tile (the single tile it stands
  // on, if the sprite has not been measured yet).
  function carCovers(ev, x, y) {
    if (window.VehicleFootprint) return window.VehicleFootprint.covers(ev, x, y);
    return ev.x === x && ev.y === y;
  }

  // The tile offsets the car's bodywork reaches, for the direction it is facing
  // or for one it is only considering. A turn changes the sprite and therefore
  // the box, so the box has to be asked for the direction being tested.
  function carRect(ev, dir) {
    const FP = window.VehicleFootprint;
    if (!FP || !FP.rect) return SINGLE_TILE;
    if (dir == null || dir === ev.direction()) return FP.rect(ev) || SINGLE_TILE;
    const previous = ev._direction;
    ev._direction = dir;
    try {
      return FP.rect(ev) || SINGLE_TILE;
    } finally {
      ev._direction = previous;
    }
  }

  // True when any tile the bodywork would cover, standing at (x, y) facing dir,
  // satisfies the test.
  function anyBodyTile(ev, x, y, dir, test) {
    const r = carRect(ev, dir);
    for (let dx = r.minDx; dx <= r.maxDx; dx++) {
      for (let dy = r.minDy; dy <= r.maxDy; dy++) {
        if (test(x + dx, y + dy)) return true;
      }
    }
    return false;
  }

  // A wall the bodywork must never touch. Off-map tiles are not walls: a car
  // that reaches the border is leaving, which is handled where it is decided.
  function tileBlocksCar(x, y) {
    if (!inBounds(x, y)) return false;
    return (
      $gameMap.regionId(x, y) === BLOCK_REGION_ID ||
      $gameMap.terrainTag(x, y) === BLOCK_TERRAIN_TAG
    );
  }

  function carBodyAt(x, y, self) {
    for (const other of roadCarEvents()) {
      if (!other || other === self || other._erased) continue;
      if (other._carActive === false) continue; // hidden cars are not there
      if (carCovers(other, x, y)) return true;
    }
    return false;
  }

  // Everybody a car can run over on the map currently loaded, cached for the
  // frame: this is read by every car, several times, every frame.
  let pedestrianCache = [];
  let pedestrianFrame = -1;
  let pedestrianMapId = -1;

  function pedestrianEvents() {
    if (pedestrianFrame === Graphics.frameCount && pedestrianMapId === $gameMap.mapId()) {
      return pedestrianCache;
    }
    pedestrianFrame = Graphics.frameCount;
    pedestrianMapId = $gameMap.mapId();
    pedestrianCache = $gameMap.events().filter((e) => {
      if (!e || e._erased) return false;
      const name = e.event() && e.event().name;
      return name === "NPC" || name === "Enemy";  // i18n-ignore  event names
    });
    return pedestrianCache;
  }

  function pedestrianAt(x, y) {
    if ($gamePlayer.x === x && $gamePlayer.y === y) return true;
    return pedestrianEvents().some((e) => e.x === x && e.y === y);
  }

  // Where a car may put its body down: no wall under any part of it, and no
  // other car's bodywork. `yieldToPeople` adds the pedestrians a town car brakes
  // for; somebody already under this car's own body is not one of them, or a car
  // that has just run someone over could never drive off again.
  function carBodyFits(ev, x, y, dir, yieldToPeople) {
    if (anyBodyTile(ev, x, y, dir, tileBlocksCar)) return false;
    if (anyBodyTile(ev, x, y, dir, (tx, ty) => carBodyAt(tx, ty, ev))) return false;
    if (yieldToPeople) {
      const blocked = anyBodyTile(
        ev, x, y, dir,
        (tx, ty) => pedestrianAt(tx, ty) && !carCovers(ev, tx, ty)
      );
      if (blocked) return false;
    }
    return true;
  }

  // Can this car drive into (x, y) facing dir? Highway traffic never yields.
  function carCanEnter(ev, x, y, dir) {
    return carBodyFits(ev, x, y, dir, carsAvoidActors());
  }

  // Can this car be dropped here at all (spawn, respawn, parking)? A placement
  // always yields: a car is never materialised on top of somebody.
  function carCanBePlaced(ev, x, y, dir) {
    if (!inBounds(x, y)) return false;
    return carBodyFits(ev, x, y, dir, true);
  }

  // Somewhere a car may be LEFT: every tile of the bodywork off the carriageway,
  // on ground open from every side, and nothing already standing there. A lane
  // is for driving on, so nothing this plugin parks ever ends up on one.
  function isParkableSpot(ev, x, y, dir) {
    if (!inBounds(x, y)) return false;
    if (anyBodyTile(ev, x, y, dir, (tx, ty) => !isOpenGround(tx, ty))) return false;
    return carCanBePlaced(ev, x, y, dir);
  }

  // The parked car whose bodywork the player is facing, so a car is stolen by
  // walking up to its flank instead of hunting for the one tile it is pinned to.
  function parkedCarFacing() {
    if ($gameMap.mapId() !== PROC_MAP_ID) return null;
    const d = $gamePlayer.direction();
    const x = $gameMap.roundXWithDirection($gamePlayer.x, d);
    const y = $gameMap.roundYWithDirection($gamePlayer.y, d);
    for (const ev of roadCarEvents()) {
      if (!ev || ev._erased || !isStandingCar(ev)) continue;
      if (carCovers(ev, x, y)) return ev;
    }
    return null;
  }

  // The action button on a parked car. The event runs no page of its own, so the
  // press is read here and the theft prompt is opened directly.
  const _Game_Player_checkEventTriggerThere = Game_Player.prototype.checkEventTriggerThere;
  Game_Player.prototype.checkEventTriggerThere = function (triggers) {
    _Game_Player_checkEventTriggerThere.call(this, triggers);
    if ($gameMap.mapId() !== PROC_MAP_ID) return;
    if (!this.canStartLocalEvents()) return;
    if ($gameMap.isEventRunning() || $gameMap.isAnyEventStarting()) return;
    if (!triggers.includes(0)) return; // action button only
    const car = parkedCarFacing();
    if (car) openCarTheftPrompt(car);
  };

  // ==========================================================================
  //  DRIVING LOGIC
  // ==========================================================================

  // Chance a driving car takes an available turn at an intersection instead of
  // going straight. Roads: almost never (drive across). Cities: wander more.
  function turnChanceForBiome() {
    if (biomeCategory === "city") return 0.35;
    if (biomeCategory === "village") return 0.4;
    return 0.05; // road/highway: basically go straight end-to-end
  }

  // Road/highway cars follow their lane and never swerve for actors (they plow
  // straight and cause accidents). Town cars yield: they swerve to avoid the
  // player and other events.
  function carsAvoidActors() {
    return biomeCategory !== "road";
  }

  // Driving move speed by biome: fast highways, slower town traffic, super speed during waiting.
  function drivingSpeedForBiome() {
    if (typeof $gameTemp !== "undefined" && $gameTemp && $gameTemp._isWaitingFastForward) {
      return 5.5;
    }
    return biomeCategory === "road" ? CAR_SPEED_ROAD : CAR_SPEED_CITY;
  }

  // Special sentinel: the car has reached a dead end / no valid road ahead and
  // should be recycled to a fresh border spawn instead of reversing (reversing
  // is what made cars drive in circles).
  const RESPAWN = "RESPAWN";

  const inBounds = (x, y) => x >= 0 && y >= 0 && x < gridW && y < gridH;

  // Decide the next direction for a driving car.
  // Returns a direction (2/4/6/8), null (wait this frame), or RESPAWN.
  function chooseCarDirection(ev) {
    const cur = ev._carDir || ev.direction();

    const nx = (d) => ev.x + dxOf(d);
    const ny = (d) => ev.y + dyOf(d);
    // A road tile ahead, OR stepping off the map edge (= driving out -> exit).
    const roadDir = (d) => !inBounds(nx(d), ny(d)) || isRoad(nx(d), ny(d));
    // Room for the whole bodywork: walls (region 10 / terrain tag 4) and other
    // cars stop everyone, people stop town traffic only.
    const free = (d) => carCanEnter(ev, nx(d), ny(d), d);

    const straightRoad = roadDir(cur);
    // Turn options never include reversing - cars only ever go forward or bend.
    const turns = perpDirs(cur).filter(roadDir);
    const freeTurns = turns.filter(free);

    // Commit to a heading after taking it: only a car past its cooldown may
    // volunteer for another turn on a plain straightaway (see TURN_COOLDOWN_*).
    const takeTurn = () => {
      const dir = freeTurns[Math.floor(Math.random() * freeTurns.length)];
      ev._carTurnCooldown =
        TURN_COOLDOWN_MIN + Math.floor(Math.random() * (TURN_COOLDOWN_MAX - TURN_COOLDOWN_MIN));
      return dir;
    };

    if (straightRoad) {
      const cooldown = ev._carTurnCooldown || 0;
      // At an intersection, occasionally pick a turn (cities wander, roads don't)
      if (cooldown <= 0 && freeTurns.length && Math.random() < turnChanceForBiome()) {
        return takeTurn();
      }
      if (free(cur)) {
        if (cooldown > 0) ev._carTurnCooldown = cooldown - 1;
        return cur;                               // keep going straight
      }
      // Straight blocked by another actor: slip onto a free turn if one exists,
      // otherwise just wait for the tile ahead to clear (no reversing).
      if (freeTurns.length) return takeTurn();
      return null;
    }

    // Straight is no longer road: the road bends (corner) or forks here.
    if (freeTurns.length) return takeTurn();
    if (turns.length) return null;               // a turn exists but is blocked -> wait

    // Nothing ahead and no turn - genuine dead end. Recycle to a border spawn
    // rather than reversing back the way we came.
    return RESPAWN;
  }

  // Face a spawned car inward from whichever border it landed on, preferring a
  // direction that actually has road ahead.
  function pickStartDirection(x, y) {
    const inward = [];
    if (x <= 1) inward.push(6);
    if (x >= gridW - 2) inward.push(4);
    if (y <= 1) inward.push(2);
    if (y >= gridH - 2) inward.push(8);

    const roadInward = inward.filter((d) => isRoad(x + dxOf(d), y + dyOf(d)));
    if (roadInward.length) return roadInward[Math.floor(Math.random() * roadInward.length)];
    if (inward.length) return inward[0];

    // Interior spawn: head down any adjacent road.
    const roadNeighbours = [2, 4, 6, 8].filter((d) => isRoad(x + dxOf(d), y + dyOf(d)));
    if (roadNeighbours.length) return roadNeighbours[Math.floor(Math.random() * roadNeighbours.length)];
    return 2;
  }

  function respawnDrivingCar(ev) {
    const pool = roadEdgeTiles.length > 0 ? roadEdgeTiles : roadTiles;
    if (pool.length === 0) return;
    for (let tries = 0; tries < 30; tries++) {
      const t = pool[Math.floor(Math.random() * pool.length)];
      const dir = pickStartDirection(t.x, t.y);
      if (nearPlayer(t.x, t.y, SPAWN_PLAYER_CLEARANCE)) continue;
      if (!carCanBePlaced(ev, t.x, t.y, dir)) continue;
      ev.setPosition(t.x, t.y);
      ev._carDir = dir;
      ev.setDirection(dir);
      ev._carStuck = 0;
      ev._carTurnCooldown = 0;
      ev._carPullTo = null;
      return;
    }
  }

  // ==========================================================================
  //  PULLING OVER
  // ==========================================================================
  //
  // A car is not only traffic: somebody is driving it, and now and then they
  // stop, get out and do whatever they were going that way for. The car sits
  // there as an ordinary parked car the whole time - solid, interactable, and
  // stealable, which is the point of the driver being away from it - and when
  // their business is done they get back in and carry on in the direction they
  // were going, on the lane they were on.
  //
  // Where a car may stop:
  //   road biome  -> beside a lay-by, i.e. within a few tiles of a SignPark
  //                  the biome generator put on the verge
  //   settlement  -> anywhere there is room, but far more rarely
  //
  // Wherever it stops, it stops OFF the carriageway. The lay-by and the bay say
  // roughly where a driver wants to be; the verge beside them is where the car
  // actually ends up, because a car left in a lane blocks the road for everyone
  // behind it and reads as a crash rather than as a parked car.

  // [{x,y}] SignPark / ParkingDrawing tiles on the map currently loaded. The
  // bays are on the marking layer and the signs on the prop layer, so both come
  // out of the same scan of layers 1-3.
  let parkingSpots = [];

  function buildParkingSpots() {
    parkingSpots = [];
    const ids = featureTileIdSet($gameMap.tilesetId(), (n) => PARKING_FEATURES.indexOf(n) >= 0);
    if (!ids.size) return;
    const data = $dataMap.data;
    const layerSize = gridW * gridH;
    for (let i = 0; i < layerSize; i++) {
      for (let layer = 1; layer <= 3; layer++) {
        if (!ids.has(data[i + layerSize * layer])) continue;
        parkingSpots.push({ x: i % gridW, y: Math.floor(i / gridW) });
        break;
      }
    }
  }

  function nearParkingSign(x, y) {
    return parkingSpots.some(
      (s) => Math.abs(s.x - x) + Math.abs(s.y - y) <= PARK_SIGN_RANGE
    );
  }

  const parkedModes = new Set(["parked", "stopped"]);  // i18n-ignore  mode ids
  const isStandingCar = (ev) => parkedModes.has(ev._carMode);

  // Where the driver gets out: a walkable tile beside the car that its own
  // bodywork is not sitting on.
  function doorstepTile(ev) {
    for (const d of [2, 4, 6, 8]) {
      for (let step = 1; step <= 3; step++) {
        const x = ev.x + dxOf(d) * step;
        const y = ev.y + dyOf(d) * step;
        if (!inBounds(x, y)) break;
        if (carCovers(ev, x, y)) continue;
        if (!isOpenGround(x, y) && !$gameMap.checkPassage(x, y, 0x0f)) continue;
        if (pedestrianAt(x, y)) continue;
        return { x, y };
      }
    }
    return null;
  }

  // The odds this car pulls over on the step it is about to take.
  function stopChanceFor(ev) {
    if (biomeCategory === "road") {
      return nearParkingSign(ev.x, ev.y) ? PARK_CHANCE_ROAD : 0;
    }
    if (biomeCategory === "city" || biomeCategory === "village") {
      // A marked bay is where a driver actually wants to leave the car, so a
      // town car pulls over there far more readily than at a random kerb.
      return nearParkingSign(ev.x, ev.y) ? PARK_CHANCE_BAY : PARK_CHANCE_TOWN;
    }
    return 0;
  }

  // The verge this car would pull onto: the nearest tile off the carriageway,
  // across the road and a little way on, that the whole bodywork fits on. Both
  // sides of the road are looked at, nearest first, so a car crosses no more of
  // it than it has to.
  function pullOverSpot(ev) {
    const dir = ev._carDir || ev.direction();
    const fx = dxOf(dir);
    const fy = dyOf(dir);
    const px = fy;  // one step across the carriageway
    const py = fx;
    const sides = Math.random() < 0.5 ? [1, -1] : [-1, 1];
    for (let across = 1; across <= PULL_OVER_RANGE; across++) {
      for (const side of sides) {
        for (let ahead = 0; ahead <= PULL_OVER_RANGE; ahead++) {
          const x = ev.x + px * across * side + fx * ahead;
          const y = ev.y + py * across * side + fy * ahead;
          if (!isParkableSpot(ev, x, y, dir)) continue;
          return { x, y };
        }
      }
    }
    return null;
  }

  // One step of the short trip off the lane and back onto it. Greedy, longer
  // axis first, and it takes the other axis when the first one is blocked.
  function stepTowardSpot(ev, tx, ty) {
    const dirs = [];
    if (tx !== ev.x) dirs.push(tx > ev.x ? 6 : 4);
    if (ty !== ev.y) dirs.push(ty > ev.y ? 2 : 8);
    if (dirs.length === 2 && Math.abs(ty - ev.y) > Math.abs(tx - ev.x)) dirs.reverse();
    for (const d of dirs) {
      if (!carCanEnter(ev, ev.x + dxOf(d), ev.y + dyOf(d), d)) continue;
      ev._carDir = d;
      ev.setDirection(d);
      ev.moveStraight(d);
      return true;
    }
    return false;
  }

  // A car on its way to the verge, or back out of it. Arriving either parks it
  // or, coming back, simply hands it over to the ordinary road following again.
  // One that cannot get through gives up and drives on rather than grinding
  // against whatever is in the way.
  function updatePullingOverCar(ev) {
    const plan = ev._carPullTo;
    if (ev.x === plan.x && ev.y === plan.y) {
      ev._carPullTo = null;
      ev._carStuck = 0;
      if (plan.park) beginStop(ev, plan);
      return;
    }
    if (stepTowardSpot(ev, plan.x, plan.y)) {
      ev._carPullStuck = 0;
      return;
    }
    ev._carPullStuck = (ev._carPullStuck || 0) + 1;
    if (ev._carPullStuck > PULL_OVER_LIMIT) {
      ev._carPullTo = null;
      ev._carPullStuck = 0;
    }
  }

  function maybeStopCar(ev) {
    if (Math.random() >= stopChanceFor(ev)) return false;
    // Nowhere off the road to leave it means no stop at all: the journey carries
    // on rather than the car being abandoned in a live lane.
    const spot = pullOverSpot(ev);
    if (!spot) return false;

    ev._carPullTo = {
      x: spot.x,
      y: spot.y,
      park: true,
      // Everything needed to pick the journey up again exactly where it left off.
      dir: ev._carDir || ev.direction(),
      lane: ev._carLane,
      waypoint: ev._carWaypoint,
      rejoin: { x: ev.x, y: ev.y },
    };
    ev._carPullStuck = 0;
    return true;
  }

  // On the verge at last: the car is put back on its travelling heading (the
  // bodywork was measured that way when the spot was picked) and the driver
  // steps out. No room for a door on any side and the errand is off - the car
  // pulls back out and drives on.
  function beginStop(ev, plan) {
    if (plan.dir && isParkableSpot(ev, ev.x, ev.y, plan.dir)) {
      ev._carDir = plan.dir;
      ev.setDirection(plan.dir);
    }
    const doorstep = doorstepTile(ev);
    if (!doorstep) {
      ev._carPullTo = { x: plan.rejoin.x, y: plan.rejoin.y, park: false };
      return;
    }

    ev._carStop = {
      dir: plan.dir,
      lane: plan.lane,
      waypoint: plan.waypoint,
      rejoin: plan.rejoin,
      untilMin: nowMinutes() + PARK_MINUTES_MIN
        + Math.floor(Math.random() * (PARK_MINUTES_MAX - PARK_MINUTES_MIN)),
      driverId: null,
      waitedFrom: null,
    };
    ev._carMode = "stopped";
    ev._carLane = null;
    applyCarModeSettings(ev);

    const visitor = Math.random() < (biomeCategory === "road"
      ? PARK_VISITOR_CHANCE_ROAD
      : PARK_VISITOR_CHANCE_TOWN);
    const driver = window.NPCSystem?.spawnRoadsideNPC?.(doorstep.x, doorstep.y, { visitor });
    if (driver) {
      ev._carStop.driverId = driver.eventId();
      driver._carDriverOf = ev.eventId();
    }
  }

  // A car standing at the kerb with its driver away. Nothing to steer; it only
  // has to notice when its driver is due back.
  function updateStoppedCar(ev) {
    const stop = ev._carStop;
    if (!stop) { resumeStoppedCar(ev); return; }
    if (nowMinutes() < stop.untilMin) return;

    const driver = stop.driverId ? $gameMap.event(stop.driverId) : null;
    const gone = !driver || driver._erased || driver._carDriverOf !== ev.eventId();

    // The driver's time is up: they walk back and get in. A driver who has been
    // recruited, killed or otherwise taken out of the world is simply not coming,
    // and one who cannot find their way back is waited on only so long.
    if (!gone) {
      const distance = Math.abs(driver.x - ev.x) + Math.abs(driver.y - ev.y);
      if (distance > PARK_BOARD_RANGE) {
        if (stop.waitedFrom == null) stop.waitedFrom = nowMinutes();
        if (nowMinutes() - stop.waitedFrom < PARK_PATIENCE) {
          // Point them at the car; their own wandering brain does the walking.
          driver.setDirection(dirToward(driver.x, driver.y, ev.x, ev.y));
          if (!driver.isMoving()) driver.moveStraight(driver.direction());
          return;
        }
      }
      // Aboard: the slot goes back to the map's own population.
      driver._carDriverOf = null;
      driver._roadsideNPC = false;
      $gameMap.eraseEvent(driver.eventId());
    }
    resumeStoppedCar(ev);
  }

  function resumeStoppedCar(ev) {
    const stop = ev._carStop || {};
    ev._carStop = null;
    ev._carMode = "driving";
    ev._carStuck = 0;
    ev._carTurnCooldown = 0;
    ev._carLane = stop.lane != null ? stop.lane : null;
    ev._carWaypoint = stop.waypoint;
    if (stop.dir) {
      ev._carDir = stop.dir;
      ev.setDirection(stop.dir);
    }
    // Back out to the carriageway the way it came in: the tile it pulled off
    // from is on its lane, so the journey picks up exactly where it stopped.
    ev._carPullStuck = 0;
    ev._carPullTo =
      stop.rejoin && (stop.rejoin.x !== ev.x || stop.rejoin.y !== ev.y)
        ? { x: stop.rejoin.x, y: stop.rejoin.y, park: false }
        : null;
    applyCarModeSettings(ev);
  }

  // ==========================================================================
  //  CAR SETUP
  // ==========================================================================

  // A car event holds no logic and no second page any more: what it does is
  // decided here and self switch A is only ever cleared, so a car that still
  // carries the old parked page always shows its first one. Map 636 is reused
  // for every world cell and self switches persist across those visits, which is
  // why this runs on every load rather than once.
  function clearParkedSelfSwitch(ev) {
    const key = [$gameMap.mapId(), ev.eventId(), PARKED_SELF_SWITCH];
    if (!$gameSelfSwitches.value(key)) return;
    $gameSelfSwitches.setValue(key, false);
  }

  // A page refresh resets through / speed / animation from the page data, so
  // re-apply whatever the car's mode needs.
  function applyCarModeSettings(ev) {
    if (ev._carMode === "driving") {
      // Through, because every collision question a car asks is answered by this
      // plugin against its bodywork, not by the engine against its one tile.
      ev.setThrough(true);
      ev.setPriorityType(1);
      ev.setMoveSpeed(drivingSpeedForBiome());
      ev.setMoveFrequency(5);
      ev.setStepAnime(true);
      ev.setOpacity(255);
    } else if (ev._carMode === "parked" || ev._carMode === "stopped") {
      // A car whose driver has stepped out is a parked car in every way that
      // matters: solid, harmless, interactable and stealable.
      ev.setThrough(false);
      ev.setPriorityType(1);
      ev.setStepAnime(false);
      ev.setOpacity(255);
    } else if (ev._carMode === "hidden") {
      ev.setThrough(true);
      ev.setStepAnime(false);
      ev.setOpacity(0);
    }
  }

  function makeDrivingCar(ev, occupied) {
    ev._carActive = true;
    ev._carMode = "driving";
    ev._carStuck = 0;
    ev._carTurnCooldown = 0;
    ev._carPullTo = null;
    clearParkedSelfSwitch(ev);
    applyCarModeSettings(ev);
    ev._carLane = null;

    // ROAD BIOME: pin the car to a fixed lane and drop it somewhere along it,
    // so traffic is spread out instead of all entering at the same border.
    if (laneDefs.length > 0) {
      for (let tries = 0; tries < 40; tries++) {
        const li = laneCursor++ % laneDefs.length;
        const len = pathLength(laneDefs[li]);
        // Never at the very start of the lane (= on the border the player may
        // have just walked in over): start the spread a margin in and stop it a
        // margin short of the far edge.
        const span = Math.max(1, len * 0.9 - SPAWN_BORDER_MARGIN * 2);
        const dist = Math.floor(SPAWN_BORDER_MARGIN + Math.random() * span);
        const pt = pointAlongPath(laneDefs[li], dist);
        const key = pt.x + "," + pt.y;
        const target = laneDefs[li][pt.wp];
        const dir = dirToward(pt.x, pt.y, target.x, target.y);
        if (nearPlayer(pt.x, pt.y, SPAWN_PLAYER_CLEARANCE)) continue;
        if (occupied.has(key) || !carCanBePlaced(ev, pt.x, pt.y, dir)) continue;
        occupied.add(key);
        placeOnLane(ev, li, dist);
        return true;
      }
      return false;
    }

    // Free-roaming (city/village) traffic is laid down inside the map, not on
    // the border tiles it would normally enter from.
    const pool =
      roadInnerTiles.length > 0 ? roadInnerTiles :
      roadEdgeTiles.length > 0 ? roadEdgeTiles : roadTiles;
    for (let tries = 0; tries < 60; tries++) {
      const t = pool[Math.floor(Math.random() * pool.length)];
      const key = t.x + "," + t.y;
      const dir = pickStartDirection(t.x, t.y);
      if (nearPlayer(t.x, t.y, SPAWN_PLAYER_CLEARANCE)) continue;
      if (occupied.has(key) || !carCanBePlaced(ev, t.x, t.y, dir)) continue;
      occupied.add(key);
      ev.setPosition(t.x, t.y);
      ev._carDir = dir;
      ev.setDirection(dir);
      return true;
    }
    return false;
  }

  function makeParkedCar(ev, occupied) {
    // Park on open ground (never on a road tile), with the WHOLE bodywork clear
    // of walls and other cars: a parked car is solid, and one left half inside a
    // cliff face would wall off the tiles around it.
    for (let tries = 0; tries < 200; tries++) {
      const x = Math.floor(Math.random() * gridW);
      const y = Math.floor(Math.random() * gridH);
      const key = x + "," + y;
      const dir = [2, 4, 6, 8][Math.floor(Math.random() * 4)];
      if (occupied.has(key)) continue;
      if (!isParkableSpot(ev, x, y, dir)) continue;
      occupied.add(key);
      ev._carActive = true;
      ev._carMode = "parked";
      ev._carLane = null;
      ev._carPullTo = null;
      clearParkedSelfSwitch(ev);
      applyCarModeSettings(ev);
      ev.setPosition(x, y);
      ev.setDirection(dir);
      return true;
    }
    return false;
  }

  function hideCar(ev) {
    ev._carActive = false;
    ev._carMode = "hidden";
    ev._carLane = null;
    ev._carPullTo = null;
    clearParkedSelfSwitch(ev);
    applyCarModeSettings(ev);
  }

  // Keep the mode's settings after any page refresh.
  const _Game_Event_refresh = Game_Event.prototype.refresh;
  Game_Event.prototype.refresh = function () {
    _Game_Event_refresh.call(this);
    if (this._isRoadCar && this._carMode && $gameMap.mapId() === PROC_MAP_ID) {
      applyCarModeSettings(this);
    }
  };

  // ==========================================================================
  //  PLAYER COLLISION (moving cars only)
  // ==========================================================================

  // A car event carries no logic: its pages are never run, whatever the editor
  // still holds on them. Every trigger a car has (the player walking into it,
  // the action button on a parked one) is read by this plugin instead.
  const _Game_Event_start = Game_Event.prototype.start;
  Game_Event.prototype.start = function () {
    if (this._isRoadCar) return;
    _Game_Event_start.call(this);
  };

  // Game_CharacterBase#jump checks nothing, so a long throw drops the victim
  // inside whatever it happens to land on. This shortens the throw until it ends
  // somewhere they could stand, and gives up rather than burying them.
  function safeThrow(character, dx, dy) {
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    for (let s = steps; s > 0; s--) {
      const ox = Math.round((dx * s) / steps);
      const oy = Math.round((dy * s) / steps);
      const tx = character.x + ox;
      const ty = character.y + oy;
      if (!$gameMap.isValid(tx, ty)) continue;
      if (!$gameMap.checkPassage(tx, ty, 0x0f)) continue;
      character.jump(ox, oy);
      return;
    }
    character.jump(0, 0); // shaken where they stand
  }

  // Knock somebody clear of the vehicle that just hit them, along its heading
  // and a little to one side.
  function knockClear(source, victim, power) {
    const sway = Math.random() < 0.5 ? 1 : -1;
    let jx = 0;
    let jy = 0;
    switch (source.direction()) {
      case 2: jy = power;  jx = sway; break; // car going down -> flung on ahead
      case 4: jx = -power; jy = sway; break;
      case 6: jx = power;  jy = sway; break;
      case 8: jy = -power; jx = sway; break;
    }
    safeThrow(victim, jx, jy);
  }

  Game_Event.prototype.performPlayerHit = function () {
    // The player is thrown back off the bonnet, against the car's heading.
    const carDir = this.direction();
    const jumpPower = 3;
    const sway = Math.random() < 0.5 ? 1 : -1;
    let jx = 0;
    let jy = 0;
    switch (carDir) {
      case 2: jy = -jumpPower; jx = sway; break; // car going down -> bounce up
      case 4: jx = jumpPower; jy = sway; break;  // car going left -> bounce right
      case 6: jx = -jumpPower; jy = sway; break; // car going right -> bounce left
      case 8: jy = jumpPower; jx = sway; break;  // car going up -> bounce down
    }
    safeThrow($gamePlayer, jx, jy);

    if ($gamePlayer.isInShip()) {
      $gameTemp.reserveCommonEvent(168);
    } else if ($gamePlayer.isInBoat()) {
      $gameTemp.reserveCommonEvent(167);
    } else {
      $gameTemp.reserveCommonEvent(163);
    }
  };

  // ==========================================================================
  //  RUNNING SOMEBODY OVER
  // ==========================================================================
  //
  // One model for all of it: an AI car reaching a pedestrian, and the player
  // driving the Car or the Camper over one. The wound is written where the rest
  // of the game already reads it from, so it is not a popup and nothing more:
  //
  //   an NPC   -> injury conditions on their society profile, which is what the
  //               Empathize panel's Health tab lists under lasting conditions
  //   an enemy -> its persistent HP record, so the encounter is met already hurt

  function nowMinutes() {
    return $gameVariables.value(GAME_TIME_VARIABLE) || 0;
  }

  function isEnemyEvent(ev) {
    return !!ev && !!ev.event() && ev.event().name === "Enemy";  // i18n-ignore  event name
  }

  function npcNameForEvent(ev) {
    const helpers = window.NPCEmpathize && window.NPCEmpathize._helpers;
    if (helpers && helpers._getNPCName) {
      const name = helpers._getNPCName(ev.eventId());
      if (name) return name;
    }
    return (window.NPCSim && window.NPCSim.npcNameForEvent && window.NPCSim.npcNameForEvent(ev)) || "";
  }

  function societyProfile(name) {
    return (name && window.NPCSocietyRegistry && window.NPCSocietyRegistry.getProfile(name)) || null;
  }

  // Injuries written onto the profile Empathize reads. The medical history is
  // built first because _buildBaseHistory REPLACES profile.conditions the first
  // time it runs, which would wipe a wound written before it.
  function injureNpcProfile(name, profile, severe) {
    const DS = window.DiseaseSystem;
    if (!DS || !profile) return [];
    try {
      DS.ensureNpcMedicalHistory(name, profile);
    } catch (e) {
      /* an unbuilt history must never stop the wound being recorded */
    }
    const held = profile.conditions || (profile.conditions = []);
    const pool = severe ? CRASH_INJURIES_SEVERE.concat(CRASH_INJURIES) : CRASH_INJURIES;
    const wanted = severe ? 2 : 1 + (Math.random() < 0.3 ? 1 : 0);
    const added = [];
    for (let i = 0; i < wanted; i++) {
      const candidates = pool.filter(
        (id) => DS.getCondition(id) && !held.some((c) => (c.id != null ? c.id : c) === id)
      );
      if (!candidates.length) break;
      const id = candidates[Math.floor(Math.random() * candidates.length)];
      held.push({ id, sinceMin: nowMinutes(), cause: "vehicle" });  // i18n-ignore  record field
      added.push(DS.getCondition(id));
    }
    return added;
  }

  // What every party member now thinks of the person they just knocked down.
  function loseNpcRegard(profile, amount) {
    const helpers = window.NPCEmpathize && window.NPCEmpathize._helpers;
    if (!profile || !helpers || !helpers._setNpcBaseOpinion) return;
    for (const member of $gameParty.members()) {
      const id = member.actorId();
      const current = helpers._npcBaseOpinion(profile, id);
      helpers._setNpcBaseOpinion(profile, id, current - amount);
    }
    if (profile.playerOpinion != null) {
      profile.playerOpinion = Math.max(-100, Math.min(100, profile.playerOpinion - amount));
    }
  }

  // A creature standing on the map keeps TWO HP tracks and a ram has to move
  // both: `ev.enemyHp` is what it is worth out here (the ecology's own fights
  // read it, and it is what kills it), and the persistent record is what its
  // next battle restores from, so a survivor is met carrying the dent.
  // Returns "dead", "hurt" or "" (nothing to hit).
  function ramMapEnemy(ev, share) {
    const troopId = ev._fixedTroopId;
    if (!troopId || !$dataTroops[troopId]) return "";
    const max = (ev.getMaxHpForEvent && ev.getMaxHpForEvent()) || 100;
    if (ev.enemyHp === undefined) ev.enemyHp = max;
    const damage = Math.max(1, Math.round(max * share));
    ev.enemyHp -= damage;

    const pData = window.BSE && window.BSE.State && window.BSE.State.persistentEnemyData;
    const key = `${$gameMap.mapId()}_${ev.eventId()}`;
    if (pData) {
      const record = pData[key] || (pData[key] = { troopId, enemyHp: {} });
      if (!record.enemyHp) record.enemyHp = {};
      $dataTroops[troopId].members.forEach((member, index) => {
        const data = $dataEnemies[member.enemyId];
        if (!data) return;
        const memberMax = data.params[0] || 1;
        const current = record.enemyHp[index] != null ? record.enemyHp[index] : memberMax;
        record.enemyHp[index] = Math.max(1, Math.round(current - memberMax * share));
      });
    }

    if (ev.enemyHp > 0) return "hurt";

    // Killed under the wheels: the body is left where the game already leaves
    // one when a map creature is killed out here, harvestable like any other.
    const F = window.BSE && window.BSE.Functions;
    if (!F || !F.killEnemyEventLeaveCorpse) {
      ev.enemyHp = 1; // no corpse system to hand it to: leave it standing, hurt
      return "hurt";
    }
    F.killEnemyEventLeaveCorpse(ev, rammingLevel());
    if (pData) delete pData[key]; // nothing left for a battle to restore
    return "dead";
  }

  // How brutally a ram tears a creature apart (killEnemyEventLeaveCorpse reads
  // it against the victim's own level to decide what is left of the body). A car
  // is a car whoever is driving it, so this is the party's standing, not a stat.
  function rammingLevel() {
    const members = $gameParty.members();
    if (!members.length) return 1;
    return Math.round(members.reduce((sum, m) => sum + m.level, 0) / members.length);
  }

  // The odds a creature the party has just rammed turns round and fights.
  function ramBattleChance(rams) {
    if (rams <= RAM_FREE_HITS) return 0;
    const steps = rams - RAM_FREE_HITS - 1;
    return Math.min(RAM_BATTLE_MAX, RAM_BATTLE_BASE + steps * RAM_BATTLE_STEP);
  }

  // How many times the party has rammed this particular creature. Kept on its
  // persistent record rather than on the event, because every scene rebuild
  // reloads $dataMap and hands out fresh Game_Event objects.
  function ramCount(ev, bump) {
    const pData = window.BSE && window.BSE.State && window.BSE.State.persistentEnemyData;
    const key = `${$gameMap.mapId()}_${ev.eventId()}`;
    const record = pData && pData[key];
    if (!record) {
      ev._carRams = (ev._carRams || 0) + (bump ? 1 : 0);
      return ev._carRams;
    }
    if (bump) record.carRams = (record.carRams || 0) + 1;
    return record.carRams || 0;
  }

  function startRamBattle(ev) {
    const F = window.BSE && window.BSE.Functions;
    if (!F || !F.startPersistentBattle || !ev._fixedTroopId) return false;
    if ($gameSystem.getBattleCooldown && $gameSystem.getBattleCooldown() > 0) return false;
    if ($gameMap.isEventRunning() || $gameMessage.isBusy()) return false;
    // A tactical fight (MapBattleMode) is fought where everybody is standing, so
    // the party gets out of the car first: MapBattleMode lays the field out
    // around $gamePlayer and the followers, and a party still in the driving
    // seat has nobody on the battlefield to fight with. A front-view battle
    // needs none of this and the party keeps their seats.
    if (window.isMapBattleMode?.() && window.MapBattleMode) {
      window.MergedVehicleSystem?.disembark?.();
    }
    F.startPersistentBattle(
      ev._fixedTroopId,
      `${$gameMap.mapId()}_${ev.eventId()}`,
      ev.eventId(),
      $gameMap.mapId()
    );
    return true;
  }

  function enemyDisplayName(ev) {
    const troop = ev._fixedTroopId ? $dataTroops[ev._fixedTroopId] : null;
    const data = troop && troop.members.length ? $dataEnemies[troop.members[0].enemyId] : null;
    return (data && data.name) || "";
  }

  function toast(text) {
    try {
      window.ParchmentToast?.show(text, { severity: "danger" });
    } catch (e) {
      /* a popup never breaks a drive */
    }
  }

  // ── What the party's own vehicle takes out of it ─────────────────────────
  // Damage is applied through VehicleSystemRepair so the Reinforced Chassis
  // upgrade, the critical-part check and the maintenance panel all see it, and
  // the parts that actually took it are named in the popup.

  function ridingRepairType() {
    const type = window.VehicleUpgrades?.currentRiddenType?.() ?? null;
    return type === "camper" || type === "car" ? type : null;  // i18n-ignore  vehicle ids
  }

  function damageOwnVehicle(percent, options, messageKey) {
    const type = ridingRepairType();
    const repair = window.VehicleSystemRepair;
    if (!type || !repair || !repair.applyDamage) return;
    const parts = repair.applyDamage(type, percent, options) || [];
    if (!parts.length) return;
    const label = (id) => (window.VehicleParts ? window.VehicleParts.label(id) : id);
    toast(T(messageKey, { parts: parts.map(label).join(", ") }));
  }

  // Ramming a creature. Whoever is driving can kill it; only the party can make
  // it angry enough to fight. Returns true when a battle was started, so nothing
  // else is run over in the same breath.
  function ramEnemy(ev, byPlayer) {
    const outcome = ramMapEnemy(ev, ENEMY_RAM_SHARE);
    if (!outcome) return false;
    const name = enemyDisplayName(ev);

    // Something soft under the bumper only ever marks the front of the car, and
    // only rarely marks it at all (RAM_VEHICLE_DAMAGE_CHANCE).
    if (byPlayer && Math.random() < RAM_VEHICLE_DAMAGE_CHANCE) {
      damageOwnVehicle(
        RAM_VEHICLE_DAMAGE,
        { parts: FRONT_PARTS, count: 1 + (Math.random() < 0.4 ? 1 : 0) },
        "RoadCar.vehicleScuffed"
      );
    }

    if (outcome === "dead") {
      if (byPlayer && name) toast(T("RoadCar.ramKilled", { name }));
      return false;
    }
    if (!byPlayer) return false;

    // The first rams it is simply flung off the bonnet; after that it stops
    // taking it, with worse odds every time.
    if (Math.random() >= ramBattleChance(ramCount(ev, true))) return false;
    if (!startRamBattle(ev)) return false;
    if (name) toast(T("RoadCar.ramAngered", { name }));
    return true;
  }

  // The one impact handler. `byPlayer` is the party at the wheel rather than a
  // car the world is driving, which is the only case that costs regard, files a
  // charge, starts a fight or says anything. Returns true when a battle was
  // started and nothing else should happen this frame.
  function runOverPedestrian(source, victim, byPlayer) {
    const now = Graphics.frameCount;
    if (now - (victim._carHitFrame || -Infinity) <= HIT_GRACE_FRAMES) return false;
    victim._carHitFrame = now;

    AudioManager.playSe({ name: "Blow2", volume: 80, pitch: 90, pan: 0 });  // i18n-ignore  SE file

    if (isEnemyEvent(victim)) {
      // Thrown clear first: a creature that dies under the wheels leaves its
      // body where it lands, not where it was standing.
      knockClear(source, victim, byPlayer ? 3 : 2);
      return ramEnemy(victim, byPlayer);
    }

    knockClear(source, victim, byPlayer ? 3 : 2);
    const name = npcNameForEvent(victim);
    const profile = societyProfile(name);
    if (!profile) return false;
    const severe = byPlayer && Math.random() < 0.4;
    const injuries = injureNpcProfile(name, profile, severe);
    if (!byPlayer) return false;

    loseNpcRegard(profile, OPINION_PER_HIT);
    try {
      if (window.CrimeSystem) window.CrimeSystem.addPresetCrime("hitAndRun");
    } catch (e) {
      /* no charge filed is never worth breaking the drive over */
    }
    try {
      const wound = injuries.length ? injuries[0].name : "";
      window.ParchmentToast?.show(
        wound
          ? T("RoadCar.ranOverInjured", { name, injury: wound })
          : T("RoadCar.ranOver", { name }),
        { severity: "danger" }
      );
    } catch (e) {
      /* a popup never breaks a drive */
    }
  }

  // Whether (x, y) is under the bodywork, against a box read once. This runs for
  // every vehicle against every pedestrian on every frame, so the box is not
  // looked up again per person.
  function boxContains(character, box, x, y) {
    const dx = x - character.x;
    const dy = y - character.y;
    return dx >= box.minDx && dx <= box.maxDx && dy >= box.minDy && dy <= box.maxDy;
  }

  // Everybody a moving vehicle has under its bodywork right now.
  function runDownEverybodyUnder(source, byPlayer) {
    const box = carRect(source, null);
    for (const victim of pedestrianEvents()) {
      if (victim.isJumping()) continue;
      if (boxContains(source, box, victim.x, victim.y)) runOverPedestrian(source, victim, byPlayer);
    }
  }

  function updateCarImpacts(car) {
    if (car._carMode !== "driving" || !car.isMoving()) return;

    if (
      !$gamePlayer.isJumping() &&
      Graphics.frameCount - lastHitFrame > HIT_GRACE_FRAMES &&
      carCovers(car, $gamePlayer.x, $gamePlayer.y)
    ) {
      lastHitFrame = Graphics.frameCount;
      car.performPlayerHit();
      return;
    }

    runDownEverybodyUnder(car, false);
  }

  // ==========================================================================
  //  THE PARTY AT THE WHEEL
  // ==========================================================================
  //
  // The same impact, on any map, when the vehicle doing the driving is the
  // party's own Car or Camper. A bike, a broom and a boat are not lethal to
  // anybody and are left out.

  function playerRoadVehicle() {
    const vehicle = $gamePlayer.vehicle && $gamePlayer.vehicle();
    if (!vehicle || !$gamePlayer.isInVehicle()) return null;
    if (vehicle.isShip && vehicle.isShip()) return vehicle._isAquatic ? null : vehicle;
    if (vehicle.isBoat && vehicle.isBoat()) {
      return $gameSystem._boatType === "car" ? vehicle : null;  // i18n-ignore  vehicle sub-type
    }
    return null;
  }

  // Two vehicles in the same space is a crash, not a knock: it is felt through
  // the whole car and it is the one impact that does not care who was at fault.
  // The bodywork is what touches, so this is body against body rather than the
  // single tiles the two are pinned to.
  function updatePlayerVehicleCrash(vehicle) {
    if ($gameMap.mapId() !== PROC_MAP_ID) return;
    const now = Graphics.frameCount;
    const box = carRect(vehicle, null);
    for (const car of roadCarEvents()) {
      if (!car || car._erased || car._carActive === false) continue;
      if (now - (car._carCrashFrame || -Infinity) <= HIT_GRACE_FRAMES) continue;
      const hit = anyBodyTile(car, car.x, car.y, null, (tx, ty) =>
        boxContains(vehicle, box, tx, ty)
      );
      if (!hit) continue;
      car._carCrashFrame = now;

      // Silent DEX roll for driver reflex save
      const driver = (typeof $gameParty !== 'undefined' && $gameParty.leader) ? $gameParty.leader() : null;
      const dexMod = driver ? Math.floor(((driver.agi || 10) - 10) / 2) : 0;
      const d20 = Math.floor(Math.random() * 20) + 1;
      const reflexSave = (d20 === 20) || (d20 !== 1 && (d20 + dexMod >= 14));

      if (reflexSave) {
        // Driver swerves/glances off in the nick of time!
        AudioManager.playSe({ name: "Evasion1", volume: 80, pitch: 110, pan: 0 });
        if (window.ParchmentToast && typeof window.ParchmentToast.show === 'function') {
          const modStr = dexMod >= 0 ? `+${dexMod}` : `${dexMod}`;
          window.ParchmentToast.show(T('RoadCar.driverSave.nearMiss', {
            roll: d20, mod: modStr, total: d20 + dexMod,
          }), { severity: 'good', duration: 200 });
        }
        if (car._carMode === "driving") car._carStuck = STUCK_LIMIT + 1;
        return;
      }

      if (window.ParchmentToast && typeof window.ParchmentToast.show === 'function') {
        const modStr = dexMod >= 0 ? `+${dexMod}` : `${dexMod}`;
        window.ParchmentToast.show(T('RoadCar.driverSave.failed', {
          roll: d20, mod: modStr, total: d20 + dexMod, dc: 14,
        }), { severity: 'danger', duration: 200 });
      }

      AudioManager.playSe({ name: "Crash", volume: 90, pitch: 80, pan: 0 });  // i18n-ignore  SE file
      damageOwnVehicle(CRASH_VEHICLE_DAMAGE, null, "RoadCar.vehicleCrashed");
      // Nobody sleeps through a wreck: the passengers VehicleCrew.js has under
      // are thrown awake, and stay awake for a while after.
      window.VehicleCrew?.wake?.("crash");  // i18n-ignore  reason id
      // A driving car that has been hit stops steering into the wreck and takes
      // itself off to another entry road.
      if (car._carMode === "driving") car._carStuck = STUCK_LIMIT + 1;
      return; // one crash a frame, however many cars are in the pile
    }
  }

  function updatePlayerVehicleImpacts() {
    const vehicle = playerRoadVehicle();
    if (!vehicle || !$gamePlayer.isMoving()) return;
    updatePlayerVehicleCrash(vehicle);
    runDownEverybodyUnder(vehicle, true);
  }

  // ==========================================================================
  //  CAR THEFT (parked cars only)
  // ==========================================================================

  // Stolen cars are tracked per world-map cell so a car boosted here does not
  // come back the next time the player walks into the same procedural map.
  function worldCellKey() {
    return $gameVariables.value(VAR_WORLD_X) + "," + $gameVariables.value(VAR_WORLD_Y);
  }

  function stolenCarCount() {
    const record = $gameSystem._roadCarStolen;
    return (record && record[worldCellKey()]) || 0;
  }

  function recordStolenCar() {
    if (!$gameSystem._roadCarStolen) $gameSystem._roadCarStolen = {};
    const key = worldCellKey();
    $gameSystem._roadCarStolen[key] = ($gameSystem._roadCarStolen[key] || 0) + 1;
  }

  function say(text) {
    window.skipLocalization = true;
    $gameMessage.add(text);
    window.skipLocalization = false;
  }

  // Pending theft while the lockpick minigame runs.
  let _pendingCarTheft = null;
  // Car chosen from the "Steal car" prompt, run one frame later (see below).
  let _pendingTheftTarget = null;

  // The prompt, opened by the plugin's own reading of the action button rather
  // than by an event page. Refused while a theft is already under way and while
  // anything else is talking.
  function openCarTheftPrompt(car) {
    if (!car || !isStandingCar(car)) return;
    if (_pendingTheftTarget || _pendingCarTheft) return;
    if ($gameMessage.isBusy()) return;
    showCarTheftChoices(car);
  }

  function showCarTheftChoices(car) {
    window.skipLocalization = true;
    $gameMessage.add(T('RoadCar.unattendedCar'));
    $gameMessage.setChoices([T('RoadCar.stealCar'), T('RoadCar.cancel')], 0, 1);
    $gameMessage.setChoiceBackground(0);
    $gameMessage.setChoicePositionType(2);
    window.skipLocalization = false;
    // The choice callback runs immediately before terminateMessage() clears
    // $gameMessage, so anything the theft wants to say would be swallowed.
    // Remember the car instead and act once the prompt has closed.
    $gameMessage.setChoiceCallback((index) => {
      if (index === 0) _pendingTheftTarget = car;
    });
  }

  const _Scene_Map_update_roadCars = Scene_Map.prototype.update;
  Scene_Map.prototype.update = function () {
    _Scene_Map_update_roadCars.call(this);
    // The party's own Car / Camper runs people down on every map, so this is
    // deliberately outside the map-636 gate the AI cars live behind.
    updatePlayerVehicleImpacts();
    if (_pendingTheftTarget && !$gameMessage.isBusy()) {
      const car = _pendingTheftTarget;
      _pendingTheftTarget = null;
      attemptCarTheft(car);
    }
  };

  function attemptCarTheft(car) {
    // Half the cars in an empty world were left open, and there is nobody to
    // take one from: it opens on the spot, with no lockpick, no minigame and
    // no crime. The other half were locked and are picked as usual (though
    // CrimeSystem files nothing in an empty world either).
    if (isEmptyWorld() && isEmptyWorldCarUnlocked(car)) {
      say(T('RoadCar.emptyWorldUnlocked'));
      completeCarTheft({ mapId: $gameMap.mapId(), eventId: car.eventId() });
      return;
    }

    // A skeleton key opens any lock without the minigame (same rule as doors).
    const skeleton = $dataItems[SKELETON_KEY_ITEM_ID];
    if (skeleton && $gameParty.hasItem(skeleton)) {
      $gameParty.loseItem(skeleton, 1);
      say(T('RoadCar.usedSkeletonKey'));
      completeCarTheft({ mapId: $gameMap.mapId(), eventId: car.eventId() });
      return;
    }

    const lockpick = $dataItems[LOCKPICK_ITEM_ID];
    if (!lockpick || !$gameParty.hasItem(lockpick)) {
      say(T('RoadCar.needLockpick'));
      return;
    }

    if (typeof UnlockingBlocks === "undefined" || typeof Scene_UnlockingBlocks === "undefined") {
      say(T('RoadCar.lockStuck'));
      return;
    }

    _pendingCarTheft = { mapId: $gameMap.mapId(), eventId: car.eventId() };
    hookLockpickForCarTheft();
    // Car locks are a touch harder than house doors.
    const difficulty = 4 + Math.floor(Math.random() * 5); // 4..8
    UnlockingBlocks.start(difficulty, 0, 0, "", "", "none");
  }

  // Mirrors ProceduralHouseSystem: wrap popScene once to resolve the pending
  // theft when the minigame ends. The minigame already eats the lockpick on a
  // failure; the crime is deferred to Scene_Map.start (UnlockingBlocks consumes
  // pendingCrimeKey there) so the notification lands on the map, not the scene
  // being popped.
  function hookLockpickForCarTheft() {
    if (Scene_UnlockingBlocks._carTheftHooked) return;
    Scene_UnlockingBlocks._carTheftHooked = true;
    const _popScene = Scene_UnlockingBlocks.prototype.popScene;
    Scene_UnlockingBlocks.prototype.popScene = function () {
      if (_pendingCarTheft) {
        const pending = _pendingCarTheft;
        _pendingCarTheft = null;
        if (this.success) {
          completeCarTheft(pending);
        } else if (typeof UnlockingBlocks !== "undefined") {
          UnlockingBlocks.pendingCrimeKey = "vehicleTheft";
        }
      }
      _popScene.call(this);
    };
  }

  // Success: the keys go to the party and the car leaves the world for good.
  function completeCarTheft(pending) {
    const car = $gameMap.mapId() === pending.mapId ? $gameMap.event(pending.eventId) : null;
    if (car) {
      car._carActive = false;
      car._carMode = "hidden";
      clearParkedSelfSwitch(car);
      car.setThrough(true);
      car.erase();
    }
    recordStolenCar();

    const keys = $dataItems[CAR_KEYS_ITEM_ID];
    if (keys) {
      $gameParty.gainItem(keys, 1);
      AudioManager.playSe({ name: "lock_01", volume: 100, pitch: 100, pan: 0 });
      say(T('RoadCar.hotwired', { icon: keys.iconIndex, item: keys.name }));
    }
  }

  // Kept registered so an existing event or an outside caller still reaches the
  // prompt, but no car event needs it any more: the action button is read by
  // this plugin and opens the prompt itself.
  const stealParkedCar = function () {
    const self = this && this.character ? this.character(0) : null;
    const car =
      self && self._isRoadCar && isStandingCar(self) ? self : parkedCarFacing();
    if (car) openCarTheftPrompt(car);
  };
  PluginManager.registerCommand(PLUGIN_NAME, "StealParkedCar", stealParkedCar);
  PluginManager.registerCommand("Vehicle/" + PLUGIN_NAME, "StealParkedCar", stealParkedCar);

  // ==========================================================================
  //  CORE UPDATE OVERRIDE
  // ==========================================================================

  const _Game_Event_initialize = Game_Event.prototype.initialize;
  Game_Event.prototype.initialize = function (mapId, eventId) {
    _Game_Event_initialize.call(this, mapId, eventId);
    this._isRoadCar = this.event() && this.event().name === "Car";  // i18n-ignore  event name
  };

  const _Game_Event_update = Game_Event.prototype.update;
  Game_Event.prototype.update = function () {
    _Game_Event_update.call(this);

    if (!this._isRoadCar || $gameMap.mapId() !== PROC_MAP_ID) return;
    if (this._carActive === false) return;

    // Standing at the kerb with the driver away: nothing to steer, it only has
    // to notice when they are due back.
    if (this._carMode === "stopped") {
      updateStoppedCar(this);
      return;
    }
    if (this._carMode !== "driving") return; // a parked car is inert and harmless

    // Whoever the bodywork is over while the car is in motion is run over: the
    // player, an NPC or a roaming enemy. A stopped car (traffic, a red light of
    // its own making) hurts nobody, and every victim keeps a short grace period
    // afterwards, because the car is several tiles long and the bounce can land
    // them back inside it.
    updateCarImpacts(this);

    if (this.isMoving()) return; // wait for the current tile step to finish

    // On its way to the verge, or back out of it: that short trip answers for
    // the car until it gets there.
    if (this._carPullTo) {
      updatePullingOverCar(this);
      return;
    }

    // Between one tile and the next is where a driver decides they have arrived.
    if (maybeStopCar(this)) return;

    // ROAD BIOME: strictly follow the assigned hardcoded lane.
    if (this._carLane != null) {
      updateLaneCar(this);
      return;
    }

    // CITY / VILLAGE: free-roaming road-follower.
    const dir = chooseCarDirection(this);

    // Dead end -> recycle to a fresh border spawn instead of reversing/circling
    if (dir === RESPAWN) {
      respawnDrivingCar(this);
      return;
    }

    if (dir === null) {
      // Boxed in by actors / obstacles -> wait, and respawn if stuck too long
      this._carStuck = (this._carStuck || 0) + 1;
      if (this._carStuck > STUCK_LIMIT) respawnDrivingCar(this);
      return;
    }

    // Reached the map border and driving out of it -> the car has left the map,
    // respawn it at another border road tile (it "arrived" at its destination).
    const tx = this.x + dxOf(dir);
    const ty = this.y + dyOf(dir);
    if (!inBounds(tx, ty)) {
      respawnDrivingCar(this);
      return;
    }

    this._carStuck = 0;
    this._carDir = dir;
    this.setDirection(dir);
    this.moveStraight(dir);
  };

  // ==========================================================================
  //  INITIALIZATION
  // ==========================================================================

  const _Scene_Map_onMapLoaded = Scene_Map.prototype.onMapLoaded;
  Scene_Map.prototype.onMapLoaded = function () {
    _Scene_Map_onMapLoaded.call(this);
    // Every cache below holds objects or tiles of the map that is being left.
    carEvents = [];
    pedestrianCache = [];
    pedestrianFrame = -1;
    parkingSpots = [];
    if ($gameMap.mapId() === PROC_MAP_ID) {
      this.initializeRoadCars();
      registerProcStitchHook();
    }
  };

  // ==========================================================================
  // THE STITCHED PROCEDURAL WINDOW
  // --------------------------------------------------------------------------
  // Map 636 can now hold several neighbouring world squares at once
  // (WorldMapReturn's ProcStitch), and the party walks between them without a
  // transfer. Nothing here needs a coordinate shim for that: buildRoadGrid reads
  // $dataMap directly and every car is placed and driven in map coordinates, so
  // a stitched strip of road squares is simply a longer road, which is what it
  // ought to be. Traffic runs the whole length of it instead of stopping dead at
  // a seam.
  //
  // What DOES have to be redone on a crossing is the decision about whether this
  // place has traffic at all. biomeCategory is read off the square the party is
  // standing in, and a window may hold more than one kind: a village square can
  // sit beside a field, both on the same tileset. Walking from one to the other
  // used to be a map load, which is where that decision was made; now it is an
  // ordinary step, and the square-changed hook is the only notice of it.
  //
  // Registered on the first procedural map load, not at plugin load time:
  // WorldMapReturn loads after this file, so window.ProcStitch does not exist yet
  // when it does.
  let procStitchHooked = false;

  function registerProcStitchHook() {
    if (procStitchHooked) return;
    const S = window.ProcStitch;
    if (!S || typeof S.onSquareChanged !== "function") return;
    procStitchHooked = true;
    S.onSquareChanged(() => {
      const scene = SceneManager._scene;
      if (!scene || !scene.initializeRoadCars) return;
      if ($gameMap.mapId() !== PROC_MAP_ID) return;
      carEvents = [];
      pedestrianCache = [];
      pedestrianFrame = -1;
      parkingSpots = [];
      scene.initializeRoadCars();
    });
  }

  Scene_Map.prototype.initializeRoadCars = function () {
    const biomeName = $gameSystem._procGenData?.currentBiome || "";
    // Nothing that belongs on a street is placed inside a procedural interior
    // (every cave, dungeon, crypt, sewer, cellar, vault, and any layer below
    // the surface): they share map id 636 with the open-air square they were
    // entered from, so the biome name alone cannot always tell them apart and
    // window.ProceduralInteriors has to be asked. Falling through to "none"
    // erases the template's cars the same way a traffic-free biome does.
    const underground = !!window.ProceduralInteriors?.isCurrent?.();
    biomeCategory = underground ? "none" : classifyBiome(biomeName);

    const cars = $gameMap.events().filter((e) => e && e.event() && e.event().name === "Car");  // i18n-ignore  event name
    carEvents = cars;
    registerCarFootprints();
    if (cars.length === 0) return;

    // Biomes without traffic: remove all cars
    if (biomeCategory === "none") {
      cars.forEach((e) => {
        e._carActive = false;
        e._carMode = "hidden";
        clearParkedSelfSwitch(e);
        e.erase();
      });
      dlog("[RoadCarAI] No traffic for biome:", biomeName);
      return;
    }

    buildRoadGrid();
    buildParkingSpots();

    // If a road biome somehow produced no road tiles, bail out gracefully
    if (biomeCategory !== "village" && roadTiles.length === 0) {
      cars.forEach((e) => hideCar(e));
      dwarn("[RoadCarAI] No road tiles detected for:", biomeName);
      return;
    }

    // Road biomes drive on hardcoded lanes; cities/villages roam freely.
    laneDefs = [];
    laneCursor = 0;
    if (biomeCategory === "road") {
      buildRoadLanes();
      if (laneDefs.length === 0) {
        dwarn("[RoadCarAI] No valid lanes; falling back to free road-following.");
      }
    }

    const plan = getCarPlan();
    const occupied = new Set();
    let parkedDone = 0;
    let drivingDone = 0;

    cars.forEach((ev) => {
      // A car erased on a previous visit to this cell has no page: bring it back
      // before deciding what it does here.
      if (ev._erased) {
        ev._erased = false;
        ev.refresh();
      }
      if (parkedDone < plan.parked && makeParkedCar(ev, occupied)) {
        parkedDone++;
      } else if (drivingDone < plan.driving && roadTiles.length > 0 && makeDrivingCar(ev, occupied)) {
        drivingDone++;
      } else {
        hideCar(ev);
      }
    });

    dlog(
      `[RoadCarAI] ${biomeCategory}: ${drivingDone} driving, ${parkedDone} parked (${roadTiles.length} road tiles).`
    );
  };
})();
