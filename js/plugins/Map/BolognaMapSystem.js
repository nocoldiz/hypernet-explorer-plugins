/*:
 * @target MZ
 * @plugindesc Seamless map transfer system for Bologna OSM grid (data/bologna/r{row}_c{col}.json)
 * @author Omni-Lex
 *
 * @help
 * BolognaMapSystem
 * ================
 * Loads Bologna OSM tile maps from data/bologna/ and enables seamless
 * border transitions between adjacent cells.
 *
 * Map grid: rows 3-16, cols 2-10 (256x256 tiles each, tilesetId 102).
 * Map slot: 353 (placeholder shell - tile data is replaced at runtime).
 *
 * Plugin Commands
 * ---------------
 * goBologna row col  -- Teleport the player to the centre of that cell.
 *
 * Doors
 * -----
 * The OSM importer stamps a door tile on the south face of every building it
 * rasterises. Each of them is a way in: most are homes, a share of them are
 * shops and inns drawn from the ProceduralHouseSystem pools, seeded per cell
 * and per tile so a given door is always the same business. A shop or inn door
 * wears its name over it, drawn with the world map's own place-name sprite.
 *
 * A living city
 * -------------
 * The cells carry no events at all, so the slots every other map is authored
 * with are injected here: eight multiplayer avatars, a crowd of NPC slots the
 * NPC system fills with a mix of the world's own faces and Bolognesi born in
 * the city, and the roaming-creature slots the fauna pass below places. The
 * fauna is placed by habitat: street animals on the pavement, park animals on
 * green land, waterfowl and fish in the canals, birds on the rooftops.
 *
 * @param shopDoorPercent
 * @text Shop doors (%)
 * @type number
 * @min 0
 * @max 100
 * @default 14
 * @desc Share of Bologna's doors that open into a shop.
 *
 * @param innDoorPercent
 * @text Inn doors (%)
 * @type number
 * @min 0
 * @max 100
 * @default 4
 * @desc Share of Bologna's doors that open into an inn.
 *
 * @param npcSlots
 * @text NPC slots per cell
 * @type number
 * @min 0
 * @max 200
 * @default 48
 * @desc How many spawn slots the NPC system is given in each Bologna cell.
 *
 * @param faunaSlots
 * @text Creature slots per cell
 * @type number
 * @min 0
 * @max 120
 * @default 26
 * @desc How many roaming-creature slots each Bologna cell carries.
 *
 * @param waterTiles
 * @text Extra water tile ids
 * @type string
 * @default
 * @desc Ground tile ids to read as canal/river on top of terrain tag 3. Comma separated, e.g. "2864".
 *
 * @command goBologna
 * @text Go to Bologna Cell
 * @desc Teleport the player to a specific Bologna grid cell.
 *
 * @arg row
 * @type number
 * @min 3
 * @max 16
 * @default 9
 * @text Row
 * @desc Bologna grid row (3-16)
 *
 * @arg col
 * @type number
 * @min 2
 * @max 10
 * @default 6
 * @text Column
 * @desc Bologna grid column (2-10)
 */

(() => {
  "use strict";

  const pluginName    = "BolognaMapSystem";
  const params        = PluginManager.parameters(pluginName);
  const BOLOGNA_MAP_ID = 353;
  const ROW_MIN = 3, ROW_MAX = 16;
  const COL_MIN = 2, COL_MAX = 10;
  const MAP_W = 256, MAP_H = 256;
  const TILESET_ID = 102;

  const num = (key, fallback) => {
    const v = Number(params[key]);
    return Number.isFinite(v) ? v : fallback;
  };
  const SHOP_DOOR_SHARE = Math.max(0, Math.min(100, num("shopDoorPercent", 14))) / 100;
  const INN_DOOR_SHARE  = Math.max(0, Math.min(100, num("innDoorPercent", 4))) / 100;
  const NPC_SLOTS       = Math.max(0, Math.min(200, num("npcSlots", 48)));
  const FAUNA_SLOTS     = Math.max(0, Math.min(120, num("faunaSlots", 26)));

  // The door overlay the OSM importer stamps on layer 3 (tools/modules/
  // osm-importer.js, DEFAULT_TILES.door), one per building face. Every cell in
  // data/bologna uses this exact tile and no other, which is why the doors can
  // be found without a feature table.
  const DOOR_TILE_ID = 63;
  const DOOR_LAYER   = 3;

  // Terrain tags, as tileset 102's own note declares them: 1 ground, 3 water,
  // 4 wall, 5 green, 6 swamp, 7 roof.
  const TAG_WATER = 3;
  const TAG_WALL  = 4;
  const TAG_GREEN = 5;
  const TAG_SWAMP = 6;
  const TAG_ROOF  = 7;

  // The importer paints parks, grass, woodland and farmland with their own A2
  // ground tiles, and the shipped tileset leaves all of them tagged as plain
  // ground. Reading them as green land is what puts frogs in the Giardini
  // rather than only on whatever the tileset happens to tag 5.
  // (grass, park, path, woodland, farmland)
  const OSM_GREEN_TILES = new Set([2816, 2864, 2960, 3248, 1617]);

  // Canals and the river. The tileset declares terrain tag 3 for water, but no
  // tile in the shipped cells carries it: the importer painted the city's water
  // with an ordinary A2 ground tile, and which one that is depends on the
  // settings the grid was rasterised with. Name it here (or tag the tileset)
  // and the aquatic residents below move in; until then the water roster has
  // nowhere to stand and its slots go to the streets instead.
  const EXTRA_WATER_TILES = new Set(
    String(params["waterTiles"] || "")
      .split(",")
      .map(s => parseInt(s, 10))
      .filter(n => Number.isFinite(n))
  );

  // ===== CELL INDEX =====
  // Maps "rN_cM" -> full filename (e.g. "r7_c6_piazza_delle_medaglie_d_oro.json")
  // Built once at startup from the filesystem via Node/NW.js.

  const _cellIndex = (() => {
    try {
      const path = require("path");
      const fs   = require("fs");
      const dir  = path.join(process.cwd(), "data", "bologna");
      const idx  = {};
      fs.readdirSync(dir).forEach(f => {
        const m = f.match(/^(r\d+_c\d+)/);
        if (m && f.endsWith(".json")) idx[m[1]] = f;
      });
      return idx;
    } catch (e) {
      console.warn("[Bologna] Could not build cell index:", e.message);
      return {};
    }
  })();

  // Derive a human-readable location name from a JSON displayName field.
  // JSON files store e.g. "OSM r7 c6 Piazza delle Medaglie d'Oro".
  // Strip the "OSM rN cM " prefix to get just the street/square name.
  function cellDisplayName(rawDisplayName) {
    if (!rawDisplayName) return "";
    return rawDisplayName.replace(/^OSM\s+r\d+\s+c\d+\s*/i, "").trim();
  }

  // ===== STATE =====
  // Only the current cell's (row, col) is persisted in $gameSystem. The cell's
  // tile JSON (hundreds of KB) and the transient border-transfer intent are held
  // in module-level runtime state so they never bloat the serialized save.
  // On load the cell is re-read from disk from the persisted row/col.

  let _runtimeMapData  = null; // full cell JSON for the map currently in slot 353
  let _pendingTransfer = null; // { row, col, spawnX, spawnY, dir } during a fade

  function getState() {
    if (!$gameSystem._bologna) {
      $gameSystem._bologna = { row: null, col: null };
    }
    const s = $gameSystem._bologna;
    // Migrate legacy saves that stored the heavy fields inline: hoist any saved
    // cell data into the runtime cache and strip both from $gameSystem so the
    // next save is lean.
    if (s.mapData) {
      if (!_runtimeMapData) _runtimeMapData = s.mapData;
      delete s.mapData;
    }
    if (s._pendingTransfer) {
      if (!_pendingTransfer) _pendingTransfer = s._pendingTransfer;
      delete s._pendingTransfer;
    }
    return s;
  }

  function getMapData() { return _runtimeMapData; }
  function setMapData(mapObj) { _runtimeMapData = mapObj; }

  // Synchronous cell read from disk (NW.js/fs), used on the load path to rebuild
  // the runtime cache from the persisted row/col without re-serializing tile data.
  function readCellSync(row, col) {
    const key      = `r${row}_c${col}`;
    const filename = _cellIndex[key];
    if (!filename) return null;
    try {
      const path = require("path");
      const fs   = require("fs");
      const file = path.join(process.cwd(), "data", "bologna", filename);
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) {
      console.warn(`[Bologna] readCellSync ${key} failed: ${e.message}`);
      return null;
    }
  }

  function isBolognaMap() {
    return $gameMap && $gameMap.mapId() === BOLOGNA_MAP_ID;
  }

  // ===== CELL IDENTITY =====
  // Every cell of the grid is served out of map slot 353, so the map id alone
  // says nothing about WHERE the party is. Anything that has to be stable per
  // place (which business is behind a door, which animals stand where) is
  // seeded from the world seed crossed with the cell's own row and column.

  function worldSeed() {
    if (window.HistoryManager && typeof window.HistoryManager.getSeed === "function") {
      return window.HistoryManager.getSeed() >>> 0;
    }
    return ($gameSystem && $gameSystem._historySeed) ? ($gameSystem._historySeed >>> 0) : 19002001;
  }

  function cellKey() {
    const s = getState();
    return (s.row == null || s.col == null) ? "" : `r${s.row}_c${s.col}`;
  }

  function cellSeed() {
    const s = getState();
    const row = s.row || 0, col = s.col || 0;
    return ((row * 73856093) ^ (col * 19349663) ^ worldSeed()) >>> 0;
  }

  // One float in [0,1) from an integer seed. Same shape ProceduralHouseSystem
  // and the NPC system use, so a Bologna roll reads like every other roll.
  function seededRandom(seed) {
    const x = Math.sin(seed >>> 0) * 10000;
    return x - Math.floor(x);
  }

  function tileRoll(x, y, salt) {
    return seededRandom((cellSeed() ^ (x * 3266489917) ^ (y * 668265263) ^ (salt >>> 0)) >>> 0);
  }

  // ===== EVENT SLOTS =====
  // A Bologna cell is pure tile data: no multiplayer avatars, no NPC slots, no
  // roaming-creature slots, none of the furniture every hand-made map is
  // authored with. They are injected here, deterministically and identically on
  // every load of the same cell, because $dataMap is rebuilt from the cell file
  // on every scene rebuild (a menu, a battle) and the live Game_Events read
  // their pages straight back out of it.

  const NPC_SLOT_NAME    = "NPC";    // i18n-ignore: NPCSystem placeholder prefix
  const ENEMY_SLOT_NAME  = "Enemy";  // i18n-ignore: BattleSystemEnhanced slot name
  const PLAYER_SLOT_NAME = "Player"; // i18n-ignore: MultiplayerSystem avatar prefix
  const PLAYER_SLOTS     = 8;

  const BLANK_PAGE_CONDITIONS = {
    actorId: 1, actorValid: false, itemId: 1, itemValid: false,
    selfSwitchCh: "A", selfSwitchValid: false,
    switch1Id: 1, switch1Valid: false, switch2Id: 1, switch2Valid: false,
    variableId: 1, variableValid: false, variableValue: 0,
  };

  function blankImage() {
    return { tileId: 0, characterName: "", direction: 2, pattern: 0, characterIndex: 0 };
  }

  function makePage(list, overrides) {
    return Object.assign({
      conditions: JSON.parse(JSON.stringify(BLANK_PAGE_CONDITIONS)),
      directionFix: false,
      image: blankImage(),
      list: list,
      moveFrequency: 3,
      moveRoute: { list: [{ code: 0, parameters: [] }], repeat: true, skippable: false, wait: false },
      moveSpeed: 3,
      moveType: 0,
      priorityType: 1,
      stepAnime: false,
      through: false,
      trigger: 0,
      walkAnime: true,
    }, overrides || {});
  }

  // The NPC slot's own pages barely matter: NPCSystem clones the pages of
  // whichever template it transplants onto the slot. What matters is the name
  // ("NPC...", so getPlaceholders finds it) and the "AI" note (so the wandering
  // controller is attached). The Talk / Empathize menu below is the same one
  // the procedural map's own slots carry, and is what a slot falls back to.
  function npcSlotPages() {
    return [makePage([
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
    ], { trigger: 0, priorityType: 1 })];
  }

  // A roaming creature: walked into, and the fight starts. Identical to the
  // procedural map's own Enemy slots, so every rule BattleSystemEnhanced
  // applies to one of those applies here too.
  function enemySlotPages() {
    return [makePage([
      { code: 357, indent: 0, parameters: ["BattleSystem/BattleSystemEnhanced", "startBattle", "Start Event Battle", { eventId: "0" }] },
      { code: 0, indent: 0, parameters: [] },
    ], {
      directionFix: true, moveFrequency: 5, moveSpeed: 1, moveType: 2,
      priorityType: 1, stepAnime: true, trigger: 2, walkAnime: false,
    })];
  }

  function playerSlotPages() {
    return [makePage([{ code: 0, indent: 0, parameters: [] }], { priorityType: 0, trigger: 0 })];
  }

  function makeSlot(id, name, note, pages) {
    // Every slot starts parked on the map's top-left corner, which is border
    // rock in every cell. The spawn passes move the ones they use and erase the
    // ones they do not, so nothing is ever left standing there.
    return { id, name, note, x: 0, y: 0, pages, characterName: "", characterIndex: 0 };
  }

  // The full event array for a cell. Order matters: the NPC slots come first so
  // the crowd is dealt into them and only overflows into the multiplayer avatar
  // slots on a map that has run out, exactly as Omega City does.
  function buildCellEvents() {
    const events = [null];
    let id = 1;
    for (let i = 0; i < NPC_SLOTS; i++, id++) {
      events.push(makeSlot(id, `${NPC_SLOT_NAME}${i + 1}`, "AI", npcSlotPages()));  // i18n-ignore: NPCSystem note tag
    }
    for (let i = 0; i < FAUNA_SLOTS; i++, id++) {
      events.push(makeSlot(id, ENEMY_SLOT_NAME, "", enemySlotPages()));
    }
    for (let i = 0; i < PLAYER_SLOTS; i++, id++) {
      events.push(makeSlot(id, `${PLAYER_SLOT_NAME}${i + 1}`, "", playerSlotPages()));
    }
    return events;
  }

  // ===== DOORS =====
  // The importer stamps one door tile per building face; each is an entrance,
  // and which kind of building is behind it is rolled once per (cell, tile) and
  // never again. ProceduralHouseSystem owns everything past the threshold: the
  // interior pools, the lock and the lockpick prompt, the door swing and the
  // return point.

  const POOL_HOUSE = "houses"; // i18n-ignore: ProceduralHouseSystem pool ids
  const POOL_SHOP  = "shops";
  const POOL_INN   = "inns";

  let _doorCache = { key: "", doors: null };

  function doorTiles() {
    const key = cellKey();
    if (_doorCache.key === key && _doorCache.doors) return _doorCache.doors;
    const doors = [];
    const data = $dataMap && $dataMap.data;
    if (data) {
      const w = $dataMap.width, h = $dataMap.height;
      const base = DOOR_LAYER * w * h;
      for (let y = 0; y < h; y++) {
        const row = base + y * w;
        for (let x = 0; x < w; x++) {
          if (data[row + x] === DOOR_TILE_ID) doors.push({ x, y });
        }
      }
    }
    _doorCache = { key, doors };
    return doors;
  }

  // Which pool a door opens into. Rolled per tile, so the bakery on the corner
  // is the bakery on the corner on every visit and in every savegame of the
  // world.
  function doorPool(x, y) {
    const r = tileRoll(x, y, 0x42444F52);
    if (r < SHOP_DOOR_SHARE) return POOL_SHOP;
    if (r < SHOP_DOOR_SHARE + INN_DOOR_SHARE) return POOL_INN;
    return POOL_HOUSE;
  }

  function isDoorTile(x, y) {
    const data = $dataMap && $dataMap.data;
    if (!data || x < 0 || y < 0 || x >= $dataMap.width || y >= $dataMap.height) return false;
    return data[DOOR_LAYER * $dataMap.width * $dataMap.height + y * $dataMap.width + x] === DOOR_TILE_ID;
  }

  // The map keeps taking input while a transfer fades, and the party comes back
  // out of a building standing ON the door they went in by, so an entrance is
  // held shut for a moment after every arrival.
  let _doorLockUntil = 0;

  function tryEnterDoor(x, y) {
    if (Graphics.frameCount < _doorLockUntil) return false;
    if (!isBolognaMap() || $gamePlayer.isInVehicle()) return false;
    if (!isDoorTile(x, y)) return false;
    const PHS = window.ProceduralHouseSystem;
    if (!PHS || typeof PHS.enterTileDoorAt !== "function") return false;
    const entered = PHS.enterTileDoorAt(doorPool(x, y), x, y) === true;
    if (entered) _doorLockUntil = Graphics.frameCount + 30;
    return entered;
  }

  // ===== SHOP SIGNS =====
  // A door that opens into a business wears its name, drawn with the very
  // sprite the world map writes city names with (WorldMap.js, window.MapLabels).

  function interiorName(mapId) {
    const info = $dataMapInfos && $dataMapInfos[mapId];
    if (!info || !info.name) return "";
    // Map names are authored "1726 - Bakery"; the sign wants the name only.
    const name = String(info.name).replace(/^\s*\d+\s*-\s*/, "").trim();
    return (typeof window.translateText === "function") ? window.translateText(name) : name;
  }

  function refreshShopSigns() {
    if (!window.MapLabels) return;
    if (!isBolognaMap()) { window.MapLabels.clear(); return; }
    const PHS = window.ProceduralHouseSystem;
    if (!PHS || typeof PHS.interiorMapIdFor !== "function") return;

    const labels = [];
    for (const door of doorTiles()) {
      const pool = doorPool(door.x, door.y);
      if (pool !== POOL_SHOP && pool !== POOL_INN) continue;
      const interiorId = PHS.interiorMapIdFor(pool, door.x, door.y, BOLOGNA_MAP_ID);
      const text = interiorId ? interiorName(interiorId) : "";
      if (text) labels.push({ x: door.x, y: door.y, text });
    }
    window.MapLabels.set(BOLOGNA_MAP_ID, labels);
  }

  // ===== FAUNA =====
  // A city is not empty of animals, and which animal stands where is decided by
  // the ground it is standing on rather than by one flat roster: rats and cats
  // on the pavement, frogs and insects on green land, fish and waterfowl in the
  // canals, birds on the porticoes and the rooftops. Enemy ids, because a name
  // is translated at runtime and a slot number never moves (data/Enemies.json).
  const FAUNA = {
    // Pavement, porticoes, the streets themselves.
    street: [45, 79, 111, 48, 53, 245, 286, 318, 324, 132, 350, 455, 122, 35, 392],
    // Parks, gardens, the green of the hills.
    green:  [59, 119, 22, 21, 37, 38, 115, 296, 328, 14, 378, 102],
    // The canals and the river.
    water:  [23, 34, 94, 476, 63, 181, 131, 593, 102, 694],
    // On the wing over the city.
    air:    [135, 642, 881, 394, 502, 717, 380, 226, 10],
    // Perched out of reach on the tiles. The pigeon of Bologna is a warning
    // rather than an encounter: it sits on a roof nothing walks on, and the
    // level weighting below keeps it rare for anyone who could reach it.
    roost:  [1073, 135, 642, 881],
  };

  // enemy id -> a troop holding that one creature. "Troop N holds enemy N" for
  // most of the table but not all of it, so the table is read rather than
  // assumed, once per session.
  let _troopByEnemy = null;

  function buildTroopIndex() {
    const index = {};
    for (let i = 1; i < $dataTroops.length; i++) {
      const troop = $dataTroops[i];
      if (!troop || !troop.members || troop.members.length !== 1) continue;
      if (troop._bseReinforced || troop._bsePetrodemon) continue;
      const id = troop.members[0].enemyId;
      // Prefer the troop that shares the creature's own slot number.
      if (index[id] === undefined || i === id) index[id] = i;
    }
    _troopByEnemy = index;
  }

  function holdsEnemy(troopId, enemyId) {
    const troop = troopId ? $dataTroops[troopId] : null;
    return !!(troop && troop.members && troop.members[0] &&
      troop.members[0].enemyId === enemyId);
  }

  function troopForEnemy(enemyId) {
    if (!_troopByEnemy) buildTroopIndex();
    let troopId = _troopByEnemy[enemyId] || 0;
    // A scratch slot (a reinforced troop, a petrodemon) is written over an
    // existing one at runtime, so a cached answer is checked against the live
    // table and the index rebuilt rather than trusted for the whole session.
    if (!holdsEnemy(troopId, enemyId)) {
      buildTroopIndex();
      troopId = _troopByEnemy[enemyId] || 0;
      if (!holdsEnemy(troopId, enemyId)) return 0;
    }
    return troopId;
  }

  // How near the party this creature stands. The encounter system already
  // answers this for every other map; where it is unavailable every resident is
  // equally likely, which is the honest fallback for a hand-written roster.
  function faunaWeight(troopId) {
    const H = window.BattleSystemEnhanced && window.BattleSystemEnhanced.Helpers;
    if (!H || !H.levelAffinityWeight || !H.getTroopMaxLevel || !H.getPartyReferenceLevel) return 1;
    try {
      return Math.max(0.02, H.levelAffinityWeight(H.getTroopMaxLevel(troopId), H.getPartyReferenceLevel()));
    } catch (e) {
      return 1;
    }
  }

  function pickFauna(habitat, rng) {
    const ids = FAUNA[habitat] || [];
    const weighted = [];
    let total = 0;
    for (const enemyId of ids) {
      const troopId = troopForEnemy(enemyId);
      if (!troopId) continue;
      const weight = faunaWeight(troopId);
      total += weight;
      weighted.push({ troopId, weight });
    }
    if (!weighted.length) return 0;
    let r = rng() * total;
    for (const entry of weighted) {
      r -= entry.weight;
      if (r <= 0) return entry.troopId;
    }
    return weighted[weighted.length - 1].troopId;
  }

  // Sort the cell's tiles into the four habitats, once per cell. Only tiles a
  // creature could stand on (or, for water and roofs, be seen on) are kept, and
  // only a sample of them: a cell holds some forty thousand street tiles and
  // two dozen animals are dealt onto them, so each habitat keeps a reservoir
  // sample rather than the whole city (a uniform draw, already in random
  // order, at a fixed cost instead of sixty thousand allocations a crossing).
  const HABITAT_SAMPLE = 256;

  function habitatTiles(rng) {
    const out = { street: [], green: [], water: [], roof: [] };
    const seen = { street: 0, green: 0, water: 0, roof: 0 };
    const keep = (habitat, tile) => {
      const list = out[habitat];
      const n = seen[habitat]++;
      if (list.length < HABITAT_SAMPLE) { list.push(tile); return; }
      const j = Math.floor(rng() * (n + 1));
      if (j < HABITAT_SAMPLE) list[j] = tile;
    };
    const w = $gameMap.width(), h = $gameMap.height();
    const data = $dataMap && $dataMap.data;
    if (!data) return out;
    const groundBase = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const tag = $gameMap.terrainTag(x, y);
        const region = $gameMap.regionId(x, y);
        if (region === 10 || region === 103) continue;
        const ground = data[groundBase + y * w + x];
        // Water first: it is the one habitat that is deliberately NOT walkable,
        // a creature in the canal is fought by walking into it from the bank
        // (a step into an impassable tile still touches what stands on it).
        if (tag === TAG_WATER || tag === TAG_SWAMP || region === 99 || EXTRA_WATER_TILES.has(ground)) {
          keep("water", { x, y });
          continue;
        }
        const passable = $gameMap.isPassable(x, y, 2) || $gameMap.isPassable(x, y, 8);
        if (!passable) {
          if (tag === TAG_ROOF || tag === TAG_WALL) keep("roof", { x, y });
          continue;
        }
        if (tag === TAG_GREEN || OSM_GREEN_TILES.has(ground)) keep("green", { x, y });
        else keep("street", { x, y });
      }
    }
    return out;
  }

  // Which habitat each creature slot is dealt. Roughly: half the city's animals
  // are on the street, a fifth in the green, a fifth on the wing, the rest in
  // the water, and whatever a cell has none of is handed back to the street.
  function habitatForSlot(i) {
    const order = ["street", "green", "air", "water"];
    const share = [0.46, 0.20, 0.20, 0.14];
    let acc = 0;
    const r = ((i * 2654435761) % 1000) / 1000;
    for (let k = 0; k < order.length; k++) {
      acc += share[k];
      if (r < acc) return order[k];
    }
    return "street";
  }

  // The animals of one cell: which creature, standing where. Held per cell and
  // per day, so a street keeps its animals while the party walks it and back
  // across the city, and is re-dealt when the clock rolls over.
  function faunaRecord() {
    const key = cellKey();
    if (!key) return null;
    const day = Math.floor(($gameVariables.value(114) || 0) / 1440);
    const store = $gameSystem._bolognaFauna || ($gameSystem._bolognaFauna = {});
    const held = store[key];
    if (held && held.day === day && held.placed) return held.placed;

    let seed = (cellSeed() ^ (day * 2654435761)) >>> 0;
    const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const tiles = habitatTiles(rng);

    const cursor = { street: 0, green: 0, water: 0, roof: 0 };
    const take = (habitat) => {
      const list = tiles[habitat];
      if (!list || cursor[habitat] >= list.length) return null;
      return list[cursor[habitat]++];
    };

    const placed = [];
    for (let i = 0; i < FAUNA_SLOTS; i++) {
      const habitat = habitatForSlot(i);
      // A bird is on the wing over the streets and the parks; one in four is
      // perched on a roof instead, where nothing can reach it.
      let roster = habitat, tile = null;
      if (habitat === "air") {
        if (rng() < 0.25) { tile = take("roof"); roster = "roost"; }
        if (!tile) { tile = take("street") || take("green"); roster = "air"; }
      } else {
        tile = take(habitat);
        if (!tile) { tile = take("street") || take("green"); roster = "street"; }
      }
      if (!tile) break;
      const troopId = pickFauna(roster, rng);
      if (!troopId) continue;
      placed.push({ x: tile.x, y: tile.y, troopId, still: roster === "roost" || roster === "water" });
    }

    store[key] = { day, placed };
    $gameSystem._bolognaFauna = store;
    return placed;
  }

  // Stand the cell's animals on the map. Replaces the encounter system's own
  // spawn pass for map 353 (see the override below): the generic pass reads a
  // biome roster and a level band off a world square, and Bologna is neither.
  function populateFauna() {
    if (!isBolognaMap() || !$gameSystem) return;
    const slots = $gameMap.events().filter(ev => {
      const data = ev && ev.event();
      return data && data.name === ENEMY_SLOT_NAME;
    });
    if (!slots.length) return;

    // A "death" world (WorldManager.populationMode) has no fauna left in it
    // either, on a real city map exactly as it does everywhere else the
    // encounter system places an "Enemy" event (BattleSystemEnhancedEncounters).
    const WM = window.WorldManager;
    if (WM && typeof WM.isDeathWorld === "function" && WM.isDeathWorld()) {
      slots.forEach(ev => ev.erase());
      return;
    }

    const placed = faunaRecord() || [];
    const H = window.BattleSystemEnhanced && window.BattleSystemEnhanced.Helpers;

    // The crowd is placed first (NPCSystem runs inside the scene load this pass
    // trails), and a creature standing underneath somebody cannot be walked
    // into. Step it off the occupied tile rather than move it across the city.
    const freeSpot = (spot, self) => {
      const taken = (x, y) => $gameMap.eventsXy(x, y).some(e => e && e !== self && !e._erased);
      if (!taken(spot.x, spot.y)) return spot;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const nx = spot.x + dx, ny = spot.y + dy;
        if (!$gameMap.isValid(nx, ny) || taken(nx, ny)) continue;
        // A fish in a canal and a pigeon on a roof both stand where nothing
        // walks; a street animal stands where everything does. Neither is
        // nudged into the other's ground.
        const passable = $gameMap.isPassable(nx, ny, 2) || $gameMap.isPassable(nx, ny, 8);
        const wantsImpassable = !!spot.still;
        if (passable === wantsImpassable) continue;
        return { x: nx, y: ny };
      }
      return spot;
    };

    slots.forEach((ev, i) => {
      const spot = placed[i];
      if (!spot) { ev.erase(); return; }
      ev._fixedTroopId = spot.troopId;
      ev._isAquaticEnemy = undefined;
      ev._isAmphibiousEnemy = undefined;
      const at = freeSpot(spot, ev);
      ev.locate(at.x, at.y);
      // A fish in a canal and a pigeon on a roof both stand on a tile nothing
      // can walk off, so they are left where they are rather than handed a
      // movement personality that would spend every frame failing to move.
      if (!spot.still && H && H.applyEnemyMovement) H.applyEnemyMovement(ev);
      else ev._moveType = 0;
      if (ev.updateCharacterSprite) ev.updateCharacterSprite();
      ev.setOpacity(255);
      ev.setThrough(false);
    });
  }

  // ===== CELL LOADER =====

  function fetchCell(row, col) {
    const key      = `r${row}_c${col}`;
    const filename = _cellIndex[key];
    if (!filename) {
      return Promise.reject(new Error(`Bologna ${key} not found in cell index`));  // i18n-ignore  developer diagnostic
    }
    return fetch(`data/bologna/${filename}`)
      .then(r => {
        if (!r.ok) throw new Error(`Bologna ${filename} not found (${r.status})`);
        return r.json();
      });
  }

  // ===== DATA MANAGER OVERRIDE =====
  // Synchronously replaces $dataMap with the stored Bologna cell data so the
  // scene load chain never waits for a Map353.json fetch.

  const _DataManager_loadMapData = DataManager.loadMapData;
  DataManager.loadMapData = function (mapId) {
    if (mapId !== BOLOGNA_MAP_ID) {
      _DataManager_loadMapData.call(this, mapId);
      return;
    }
    const state = getState();
    let mapData = getMapData();
    // After a save/load the runtime cache is empty; rebuild it from disk using
    // the persisted row/col so the tile data never had to live in the save.
    if (!mapData && state && state.row != null && state.col != null) {
      mapData = readCellSync(state.row, state.col);
      if (mapData) setMapData(mapData);
    }
    if (!mapData) {
      // No cell data ready - fall back to the placeholder file
      _DataManager_loadMapData.call(this, mapId);
      return;
    }
    // Set $dataMap synchronously so DataManager.isMapLoaded() returns true immediately.
    // Shallow-copy so RPG Maker can mutate meta etc. without corrupting the cache.
    $dataMap = Object.assign({}, mapData);
    // A fresh slot array every load, never the cached cell's own: the engine
    // and half a dozen plugins write onto event data in place, and the cell
    // object is reused for the whole session.
    $dataMap.events = buildCellEvents();
    $dataMap._bolognaSlots = true;
    DataManager.onLoad($dataMap);
  };

  // ===== TILESET OVERRIDE =====

  const _Game_Map_tileset = Game_Map.prototype.tileset;
  Game_Map.prototype.tileset = function () {
    if (isBolognaMap() && $dataTilesets[TILESET_ID]) {
      return $dataTilesets[TILESET_ID];
    }
    return _Game_Map_tileset.call(this);
  };

  // ===== BORDER DETECTION =====

  // Compute spawn position on the opposite edge of the destination cell.
  function oppositeEdgePos(exitDir, playerX, playerY) {
    let x = playerX;
    let y = playerY;
    switch (exitDir) {
      case 2: y = 1;          break; // exited south -> near north
      case 4: x = MAP_W - 2;  break; // exited west  -> near east
      case 6: x = 1;          break; // exited east  -> near west
      case 8: y = MAP_H - 2;  break; // exited north -> near south
    }
    return {
      x: Math.max(1, Math.min(x, MAP_W - 2)),
      y: Math.max(1, Math.min(y, MAP_H - 2)),
    };
  }

  const _Game_Player_moveStraight = Game_Player.prototype.moveStraight;
  Game_Player.prototype.moveStraight = function (d) {
    if (!isBolognaMap()) {
      _Game_Player_moveStraight.call(this, d);
      return;
    }

    const x = this.x;
    const y = this.y;
    let exitDir = 0;

    if (d === 2 && y + 1 >= MAP_H) exitDir = 2;
    else if (d === 4 && x - 1 < 0)  exitDir = 4;
    else if (d === 6 && x + 1 >= MAP_W) exitDir = 6;
    else if (d === 8 && y - 1 < 0)  exitDir = 8;

    if (!exitDir) {
      _Game_Player_moveStraight.call(this, d);
      // Doors are movement-driven, like every other entrance in the game. The
      // importer's door tile is passable, so a successful step lands the party
      // ON it; a step that failed means they walked INTO the tile ahead and
      // were stopped by it, which is how a door set into a blocked wall opens.
      if (this.isMovementSucceeded()) {
        tryEnterDoor(this.x, this.y);
      } else {
        tryEnterDoor($gameMap.roundXWithDirection(this.x, d),
          $gameMap.roundYWithDirection(this.y, d));
      }
      return;
    }

    const state = getState();
    let nextRow = state.row;
    let nextCol = state.col;

    if (exitDir === 2) nextRow += 1;
    else if (exitDir === 4) nextCol -= 1;
    else if (exitDir === 6) nextCol += 1;
    else if (exitDir === 8) nextRow -= 1;

    // Hard boundary - block movement at grid edge
    if (nextRow < ROW_MIN || nextRow > ROW_MAX || nextCol < COL_MIN || nextCol > COL_MAX) {
      return;
    }

    const spawn = oppositeEdgePos(exitDir, x, y);

    $gameScreen.startFadeOut(12);

    // Store for the fade-complete trigger (runtime-only, not persisted)
    _pendingTransfer = { row: nextRow, col: nextCol, spawnX: spawn.x, spawnY: spawn.y, dir: exitDir };
  };

  // ===== SCREEN UPDATE HOOK =====
  // Fires the deferred transfer once the screen is fully black.

  const _Game_Screen_update = Game_Screen.prototype.update;
  Game_Screen.prototype.update = function () {
    _Game_Screen_update.call(this);

    if (!_pendingTransfer) return;
    if (this._brightness > 0) return;

    const pending = _pendingTransfer;
    _pendingTransfer = null;

    setTimeout(() => {
      fetchCell(pending.row, pending.col)
        .then(mapObj => {
          const state = getState();
          state.row     = pending.row;
          state.col     = pending.col;
          setMapData(mapObj);
          $gamePlayer.reserveTransfer(BOLOGNA_MAP_ID, pending.spawnX, pending.spawnY, pending.dir, 0);
        })
        .catch(err => {
          console.warn(`[Bologna] border transfer failed: ${err.message}`);
          $gameScreen.startFadeIn(15);
        });
    }, 13);
  };

  // ===== SCENE MAP HOOK =====
  // Re-injects map data and refreshes the tilemap after the scene loads.

  const _Scene_Map_onMapLoaded = Scene_Map.prototype.onMapLoaded;
  Scene_Map.prototype.onMapLoaded = function () {
    // Resolve the map we are ABOUT to be on, not the one we are leaving. During a
    // transfer, $gameMap.mapId() still returns the departure map until
    // performTransfer() runs (inside _Scene_Map_onMapLoaded below). Testing the
    // departure id here made a transfer OUT of Bologna (353 -> e.g. 315) clobber
    // the destination's freshly-loaded $dataMap with the cached Bologna cell
    // (tilesetId 102, 256x256), so the world map rendered with the Bologna
    // tileset. Match the post-transfer guard further down by using the target id.
    const targetMapId = this._transfer ? $gamePlayer.newMapId() : $gameMap.mapId();
    if (targetMapId === BOLOGNA_MAP_ID) {
      getState();
      const mapData = getMapData();
      if (mapData && $dataMap) {
        $dataMap.data        = mapData.data;
        $dataMap.width       = MAP_W;
        $dataMap.height      = MAP_H;
        $dataMap.tilesetId   = TILESET_ID;
        // Set clean location name so MapLevelDisplay picks it up
        $dataMap.displayName = cellDisplayName(mapData.displayName);
      }
      // The fallback path (no cell ready, Map353.json loaded instead) leaves
      // the shell's own events standing. Give it the cell's slots too, before
      // Game_Map.setup below reads them, and before NPCSystem's own hook (which
      // _Scene_Map_onMapLoaded chains into) restores the crowd onto them.
      if ($dataMap && !$dataMap._bolognaSlots) {
        $dataMap.events = buildCellEvents();
        $dataMap._bolognaSlots = true;
      }
    }

    _Scene_Map_onMapLoaded.call(this);

    if ($gameMap.mapId() !== BOLOGNA_MAP_ID) {
      if (window.MapLabels) window.MapLabels.clear();
      return;
    }

    // Refresh tileset bitmap
    if (this._tilemap) {
      const ts = $dataTilesets[TILESET_ID];
      if (ts) {
        this._tilemap.setTileBitmap(0, ImageManager.loadTileset(ts.name));
        this._tilemap.refresh();
      }
    }

    // The party lands on the tile they left by when they come out of a
    // building, so the doors are held shut for a moment on every arrival.
    _doorLockUntil = Graphics.frameCount + 45;
    refreshShopSigns();
    populateFauna();

    setTimeout(() => $gameScreen.startFadeIn(12), 80);
  };

  // ===== SAME-MAP CELL TRANSFERS =====
  // Walking off the edge of a cell reserves a transfer from map 353 back to map
  // 353. RMMZ only calls Game_Map.setup() when the destination map id differs,
  // so without this the next cell would keep the previous one's events: the
  // crowd, the animals and the doors of the street the party just left. Same
  // rule the procedural map runs on (WorldMapReturn).

  const _Game_Player_performTransfer = Game_Player.prototype.performTransfer;
  Game_Player.prototype.performTransfer = function () {
    if (this.isTransferring() &&
        $gameMap.mapId() === BOLOGNA_MAP_ID &&
        this.newMapId() === BOLOGNA_MAP_ID) {
      this.requestMapReload();
    }
    _Game_Player_performTransfer.call(this);
  };

  // ===== FAUNA SPAWN OVERRIDE =====
  // The encounter system's own spawn pass reads a biome roster and a level band
  // off a world square. Bologna is a real city on a map of its own, so its
  // animals are placed by habitat here instead; everything past the placement
  // (the movement personalities, the troop, the fight itself) is still the
  // encounter system's.

  const _Scene_Map_spawnEnemiesFromEncounters = Scene_Map.prototype.spawnEnemiesFromEncounters;
  Scene_Map.prototype.spawnEnemiesFromEncounters = function () {
    if (isBolognaMap()) { populateFauna(); return; }
    if (_Scene_Map_spawnEnemiesFromEncounters) {
      _Scene_Map_spawnEnemiesFromEncounters.call(this);
    }
  };

  // ===== TELEPORT =====
  // Load the requested cell and warp the player into it. spawnX/spawnY are in
  // tile coordinates within the 256x256 cell; when omitted the player lands in
  // the centre. Returns true if the (row,col) is in range and the warp started.

  function teleportToCell(row, col, spawnX, spawnY) {
    row = Number(row);
    col = Number(col);

    if (isNaN(row) || isNaN(col) ||
        row < ROW_MIN || row > ROW_MAX ||
        col < COL_MIN || col > COL_MAX) {
      console.warn(`[Bologna] teleportToCell: (${row},${col}) out of range [${ROW_MIN}-${ROW_MAX}][${COL_MIN}-${COL_MAX}]`);
      return false;
    }

    const sx = (spawnX == null || isNaN(spawnX))
      ? Math.floor(MAP_W / 2)
      : Math.max(1, Math.min(MAP_W - 2, Math.round(spawnX)));
    const sy = (spawnY == null || isNaN(spawnY))
      ? Math.floor(MAP_H / 2)
      : Math.max(1, Math.min(MAP_H - 2, Math.round(spawnY)));

    $gameScreen.startFadeOut(12);

    fetchCell(row, col)
      .then(mapObj => {
        const state = getState();
        state.row     = row;
        state.col     = col;
        setMapData(mapObj);
        $gamePlayer.reserveTransfer(BOLOGNA_MAP_ID, sx, sy, $gamePlayer.direction(), 0);
      })
      .catch(err => {
        console.warn(`[Bologna] teleportToCell failed: ${err.message}`);
        $gameScreen.startFadeIn(15);
      });

    return true;
  }

  // ===== PLUGIN COMMAND =====

  PluginManager.registerCommand(pluginName, "goBologna", (args) => {
    teleportToCell(Number(args.row), Number(args.col));
  });

  // ===== PUBLIC API =====

  window.BolognaMapSystem = {
    BOLOGNA_MAP_ID,
    ROW_MIN, ROW_MAX, COL_MIN, COL_MAX,
    MAP_W, MAP_H,
    getState,
    teleportToCell,
    // The cell the party is standing in, as a seed. ProceduralHouseSystem mixes
    // it into every door seed so two cells' doors at the same coordinates open
    // into different buildings; anything else that has to be stable per cell
    // can read it too.
    cellSeed,
    cellKey,
    // Every door of the current cell, and what it opens into.
    doorTiles,
    doorPool,
  };

  // Bologna is one map id serving fourteen by nine different places, so its
  // door seeds have to carry which place they are on. Registered here rather
  // than read there, so ProceduralHouseSystem keeps knowing nothing about
  // Bologna and a world with no Bologna in it seeds exactly as it always has.
  if (window.ProceduralHouseSystem &&
      typeof window.ProceduralHouseSystem.setSeedSaltProvider === "function") {
    window.ProceduralHouseSystem.setSeedSaltProvider(
      () => (isBolognaMap() ? cellSeed() : 0));
  }
})();
