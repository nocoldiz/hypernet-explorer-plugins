/*:
 * @target MZ
 * @plugindesc NPC System: pathfinding, making way, beds and seats
 * @author Omni-Lex
 * @base NPCSystem
 * @orderAfter NPCSystem
 * @orderAfter NPCSystem_StreetCrime
 * @help
 * ============================================================================
 * NPCSystem_Movement, part of the NPCSystem family
 * ============================================================================
 * Owns _MinHeap, the pathfinder frame cache, NPCYield, NPCBeds, NPCSeats and
 * the Pathfinder class.
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCSystem._internal and publishes its own there. Load it right after
 * NPCSystem_StreetCrime.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const {
    Config, NEIGHBOR_DIR, NEIGHBOR_DX, NEIGHBOR_DY, ORTHO_DIRS, Utils,
  } = window.NPCSystem._internal;

  // ── MinHeap ────────────────────────────────────────────────────────────────
  // Binary min-heap for A* open set, O(log n) push/pop/update vs O(n) for the
  // old sorted-array approach, which had O(n) indexOf + splice on every node update.
  class _MinHeap {
    constructor(scoreMap) { this._d = []; this._s = scoreMap; this._i = new Map(); }
    get size() { return this._d.length; }
    has(k)     { return this._i.has(k); }
    push(k)    { const i = this._d.length; this._d.push(k); this._i.set(k, i); this._up(i); }
    pop()      {
      const top = this._d[0], last = this._d.pop();
      if (this._d.length) { this._d[0] = last; this._i.set(last, 0); this._down(0); }
      this._i.delete(top); return top;
    }
    update(k)  { const i = this._i.get(k); if (i == null) return; this._up(i); this._down(this._i.get(k) ?? i); }
    _sc(k)     { return this._s.get(k) ?? Infinity; }
    _sw(i, j)  { [this._d[i], this._d[j]] = [this._d[j], this._d[i]]; this._i.set(this._d[i], i); this._i.set(this._d[j], j); }
    _up(i)     { while (i > 0) { const p = (i - 1) >> 1; if (this._sc(this._d[p]) <= this._sc(this._d[i])) break; this._sw(i, p); i = p; } }
    _down(i)   { const n = this._d.length; for (;;) { const l = 2*i+1, r = l+1; let m = i; if (l < n && this._sc(this._d[l]) < this._sc(this._d[m])) m = l; if (r < n && this._sc(this._d[r]) < this._sc(this._d[m])) m = r; if (m === i) break; this._sw(i, m); i = m; } }
  }

  // Frame-level pathfinder cache, rebuilt at most once per Graphics.frameCount
  // so every NPC that pathfinds in the same frame shares one event-grid snapshot.
  let _pathfinderFrameCache = null;
  function _getPathfinderFrameCache(mapW) {
    const fc = Graphics.frameCount;
    if (_pathfinderFrameCache && _pathfinderFrameCache.frame === fc) return _pathfinderFrameCache;
    const getKey = (x, y) => x + y * mapW;
    const evts = $gameMap.events();
    const eventGrid = new Map();
    for (const ev of evts) {
      if (ev && !ev.isThrough() && !Utils.isWalkThroughDoor(ev.event()?.name || ""))
        eventGrid.set(getKey(ev.x, ev.y), ev);
    }
    const doorKeys = new Set();
    for (const ev of evts) {
      if (ev && Utils.isWalkThroughDoor(ev.event()?.name || "")) doorKeys.add(getKey(ev.x, ev.y));
    }
    const allNpcKeys = new Set();
    for (const c of $gameSystem.npcControllers ?? []) {
      if (c.event && !c.event._erased) allNpcKeys.add(getKey(c.event.x, c.event.y));
    }
    const enemyDangerKeys = new Set();
    for (const ev of evts) {
      if (ev && ev.event()?.name.startsWith("Enemy")) {
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++)
            if (Math.abs(dx) + Math.abs(dy) < 3) enemyDangerKeys.add(getKey(ev.x + dx, ev.y + dy));
      }
    }
    _pathfinderFrameCache = { frame: fc, eventGrid, doorKeys, allNpcKeys, enemyDangerKeys };
    return _pathfinderFrameCache;
  }

  // State → "updateXxx" handler name, memoized so the per-NPC tick doesn't
  // rebuild the template string every time.
  const _stateMethodNames = Object.create(null);
  function _stateMethodName(state) {
    return _stateMethodNames[state] ||
      (_stateMethodNames[state] = `update${state.charAt(0).toUpperCase()}${state.slice(1)}`);
  }

  // Lazy Map from trait id → trait object, avoids O(n) Array.find per trait lookup.
  let _traitsById = null;
  function _getTraitsById() {
    if (_traitsById) return _traitsById;
    const arr = window._NPCSocietyDataLoader?.traits;
    if (!arr || !arr.length) return new Map();
    _traitsById = new Map(arr.map(t => [t.id, t]));
    return _traitsById;
  }

  // ==========================================================================
  // MAKING WAY IN A ONE-TILE CORRIDOR
  // ==========================================================================
  // An NPC standing in a one-wide passage is a wall: the player walks into it,
  // the step fails, and with a second NPC behind it there is nowhere to go
  // round. Nothing in the roaming AI ever reads the player as an obstruction,
  // so the queue never dissolves on its own and the player is softlocked.
  //
  // So the bump itself is the signal. When the player's step is refused by the
  // tile an NPC occupies, and either of them is standing somewhere one tile
  // wide, that NPC (and every other one sharing the same narrow run) picks a
  // spot OUT of the passage, in an open part of the map away from the player,
  // and walks there. It walks it phased (_through), so the NPCs queued ahead of
  // it in the corridor are not obstacles either: the whole line drains out of
  // the passage instead of shuffling one tile at a time. Being phased also
  // clears the softlock immediately, since the player can pass straight through
  // whoever is still on the way out.
  const NPCYield = {
    MIN_STEPS: 2,        // never "make way" by standing still
    MIN_PLAYER_GAP: 2,   // and never by stepping into the player's lap
    MAX_SEARCH: 14,      // tiles of corridor an NPC will walk to get clear
    OPEN_DEPTH: 3,       // how far past the corridor mouth to prefer standing
    CORRIDOR_MAX: 12,    // longest narrow run cleared by a single bump
    DURATION: 12000,     // ms before a yield gives up and the NPC resumes life

    _lastCheck: -999,
    _reserved: new Map(),

    // Terrain-only passability: what the map allows, with events left out of
    // it entirely (the yielding NPC walks through those). Mirrors the water and
    // region rules Pathfinder.isPassable applies so nobody wades off a quay.
    canStepTerrain(x, y, d) {
      const nx = $gameMap.roundXWithDirection(x, d);
      const ny = $gameMap.roundYWithDirection(y, d);
      if (!$gameMap.isValid(nx, ny)) return false;
      const r = $gameMap.regionId(nx, ny);
      if (r === 10) return false;
      if (r === 99 || Utils.isBlockedTerrain(nx, ny)) return false;
      if (r === 5 || $gameMap.regionId(x, y) === 5) return true;
      return $gameMap.isPassable(x, y, d) && $gameMap.isPassable(nx, ny, 10 - d);
    },

    openNeighbourCount(x, y) {
      let n = 0;
      for (const dir of ORTHO_DIRS) if (this.canStepTerrain(x, y, dir)) n++;
      return n;
    },

    // One tile wide: a passage tile only leads on and back (2), or is a dead
    // end (1). A junction or any part of a room answers 3 or 4.
    isNarrow(x, y) {
      return this.openNeighbourCount(x, y) <= 2;
    },

    // The controller whose NPC occupies (x, y), matching the logical tile and
    // the drawn one: a walking NPC's _x/_y is already a step ahead of its
    // sprite, and the player bumps into whichever of the two is in the way.
    controllerAt(x, y) {
      for (const c of ($gameSystem?.getActiveNPCControllers?.() ?? [])) {
        const ev = c.event;
        if (!ev || ev._erased) continue;
        if ((ev._x === x && ev._y === y) ||
            (Math.round(ev._realX) === x && Math.round(ev._realY) === y)) return c;
      }
      return null;
    },

    isReserved(k) {
      const at = this._reserved.get(k);
      return at !== undefined && Graphics.frameCount - at < 600;
    },

    reserve(k) {
      if (this._reserved.size > 64) this._reserved.clear();
      this._reserved.set(k, Graphics.frameCount);
    },

    // Where an NPC should get to. Flood the map from where it stands (never
    // through the player, so the search only ever runs away from them) and take
    // the roomiest tile a few steps past the mouth of the passage: far enough
    // that the corridor is genuinely clear, near enough that the NPC does not
    // sprint across town. With nothing but corridor in reach, retreat as far
    // along it as the search got.
    findYieldSpot(ev, px, py) {
      const mapW = $gameMap.width();
      const key = (x, y) => x + y * mapW;
      const startK = key(ev.x, ev.y);
      const dist = new Map([[startK, 0]]);
      const queue = [startK];
      const candidates = [];
      let head = 0;

      while (head < queue.length && head < 600) {
        const cK = queue[head++];
        const d = dist.get(cK);
        if (d >= this.MAX_SEARCH) continue;
        const cx = cK % mapW, cy = Math.floor(cK / mapW);
        for (const dir of ORTHO_DIRS) {
          const nx = $gameMap.roundXWithDirection(cx, dir);
          const ny = $gameMap.roundYWithDirection(cy, dir);
          const nK = key(nx, ny);
          if (dist.has(nK) || (nx === px && ny === py)) continue;
          if (!this.canStepTerrain(cx, cy, dir)) continue;
          dist.set(nK, d + 1);
          queue.push(nK);

          const open = this.openNeighbourCount(nx, ny);
          if (d + 1 >= this.MIN_STEPS && open > 2 && !this.isReserved(nK) &&
              $gameMap.eventsXyNt(nx, ny).length === 0 &&
              Math.abs(nx - px) + Math.abs(ny - py) >= this.MIN_PLAYER_GAP) {
            candidates.push({ x: nx, y: ny, k: nK, d: d + 1, open });
          }
        }
      }

      if (candidates.length) {
        let nearest = Infinity;
        for (const c of candidates) if (c.d < nearest) nearest = c.d;
        candidates.sort((a, b) => (b.open - a.open) || (b.d - a.d));
        const pool = candidates.filter(c => c.d <= nearest + this.OPEN_DEPTH);
        return (pool.length ? pool : candidates)[0];
      }

      const ownGap = Math.abs(ev.x - px) + Math.abs(ev.y - py);
      let best = null, bestD = -1;
      for (const [k, d] of dist) {
        if (k === startK || d <= bestD || this.isReserved(k)) continue;
        const x = k % mapW, y = Math.floor(k / mapW);
        if (Math.abs(x - px) + Math.abs(y - py) <= ownGap) continue;
        bestD = d; best = { x, y, k };
      }
      return best;
    },

    // Every NPC sharing the blocked tile's narrow run, so one bump drains the
    // whole queue rather than the front of it. The walk stops at the first tile
    // that is no longer one wide, which is exactly the mouth of the passage.
    corridorControllers(bx, by, px, py) {
      const mapW = $gameMap.width();
      const key = (x, y) => x + y * mapW;
      const found = [], seenCtrl = new Set();
      const collect = (x, y) => {
        const c = this.controllerAt(x, y);
        if (c && !seenCtrl.has(c) && c.state !== 'talkingToPlayer') {
          seenCtrl.add(c); found.push(c);
        }
      };
      const seen = new Set([key(bx, by), key(px, py)]);
      const queue = [{ x: bx, y: by }];
      let head = 0;
      collect(bx, by);
      while (head < queue.length && queue.length < this.CORRIDOR_MAX) {
        const { x, y } = queue[head++];
        if (!this.isNarrow(x, y)) continue;
        for (const dir of ORTHO_DIRS) {
          const nx = $gameMap.roundXWithDirection(x, dir);
          const ny = $gameMap.roundYWithDirection(y, dir);
          const k = key(nx, ny);
          if (seen.has(k) || !this.canStepTerrain(x, y, dir)) continue;
          seen.add(k);
          queue.push({ x: nx, y: ny });
          if (this.isNarrow(nx, ny)) collect(nx, ny);
        }
      }
      return found;
    },

    // Whether the far side of the NPC at (bx, by), seen from the player at
    // (px, py), opens into somewhere: a tile that is not one wide within
    // MAX_SEARCH steps, or a passage that runs on past them. An NPC standing in a dead-end alcove (a priest behind
    // the altar) blocks no route at all, so the player bumping into them on
    // the way to talk must not phase them into somebody that can be walked on.
    leadsOut(bx, by, px, py) {
      const mapW = $gameMap.width();
      const key = (x, y) => x + y * mapW;
      const dist = new Map([[key(bx, by), 0]]);
      const queue = [{ x: bx, y: by }];
      let head = 0;
      while (head < queue.length) {
        const { x, y } = queue[head++];
        const d = dist.get(key(x, y));
        // A passage longer than the search is a way through, not an alcove.
        if (d >= this.MAX_SEARCH) return true;
        for (const dir of ORTHO_DIRS) {
          const nx = $gameMap.roundXWithDirection(x, dir);
          const ny = $gameMap.roundYWithDirection(y, dir);
          const k = key(nx, ny);
          if (dist.has(k) || (nx === px && ny === py)) continue;
          if (!this.canStepTerrain(x, y, dir)) continue;
          if (!this.isNarrow(nx, ny)) return true;
          dist.set(k, d + 1);
          queue.push({ x: nx, y: ny });
        }
      }
      return false;
    },

    // The player's step at (bx, by) was refused. Act only when an NPC is what
    // refused it and the geometry leaves no way round.
    onPlayerBlocked(bx, by) {
      if (!$gameMap || !$gamePlayer) return;
      if ($gameMap.isEventRunning() || $gameMap.isAnyEventStarting()) return;
      const fc = Graphics.frameCount;
      if (fc - this._lastCheck < 10) return;
      this._lastCheck = fc;
      if (!this.controllerAt(bx, by)) return;
      const px = $gamePlayer.x, py = $gamePlayer.y;
      if (!this.isNarrow(bx, by) && !this.isNarrow(px, py)) return;
      if (!this.leadsOut(bx, by, px, py)) return;
      for (const ctrl of this.corridorControllers(bx, by, px, py)) ctrl.yieldToPlayer();
    },
  };

  // ==========================================================================
  // SEATS, region 102
  // ==========================================================================
  // A region 102 tile is somewhere to sit: a bench, a chair, a bus seat. The
  // furniture under it is impassable, so nobody walks onto one. An NPC walks
  // to a free tile beside the seat, slides onto it the way the player does
  // (MovementInteractionSystem.enterSitMode), rests there, then gets up onto
  // the nearest tile they can stand on. Every second on the seat gives back
  // some sleep (NPCSim.satisfyNeedTick). Part of a map's crowd is dealt onto
  // the seats at spawn, already sitting (SpawnManager.injectBrain).
  // ── Beds ────────────────────────────────────────────────────────────────
  // A bed is an event: "Bed" in its name, or a page running the "Sleep in bed"
  // common event. It blocks its tile like any furniture, so a sleeper walks to
  // the tile beside it and slides onto it the way somebody sits on a seat
  // (NPCController.goToBed / lieDown), lies there sideways until morning, and
  // gets off onto the nearest free tile when they wake.
  const NPCBeds = {
    SEARCH_RADIUS: 40,
    NIGHT_FROM: 22,
    NIGHT_TO: 6,
    // Shortest real time anybody stays down, so a nap is not a flicker.
    MIN_SLEEP_MS: 45000,

    // With a profile the answer is that person's own sleep window
    // (NPCSim.isSleepHour, the one the schedule and the routine use); the
    // fixed 22-6 is only for nobody in particular.
    isNight(hour, profile) {
      if (profile && window.NPCSim?.isSleepHour) return !!window.NPCSim.isSleepHour(null, profile, hour);
      const h = hour ?? ($gameVariables?.value(23) ?? 12);
      return h >= this.NIGHT_FROM || h < this.NIGHT_TO;
    },

    isBedEvent(ev) {
      if (!ev || ev._erased || !ev.event) return false;
      const data = ev.event();
      if (!data) return false;
      const name = String(data.name || "");
      if (/\bbed\b/i.test(name) && !/flower|river|sea|garden|creek|stream|lake/i.test(name)) return true; // i18n-ignore: event names matched at runtime
      return (data.pages || []).some(p => (p?.list || []).some(c =>
        c && c.code === 117 && Number(c.parameters?.[0]) === Config.BED_COMMON_EVENT_ID));
    },

    // Every bed on the map, scanned once per map. Keyed on the map data
    // itself as well as the id: the procedural map, Bologna and a building's
    // floors all reuse one id for different rooms.
    beds() {
      if (!$gameMap) return [];
      const mapId = $gameMap.mapId();
      const cache = $gameMap._npcBedCache;
      if (cache && cache.mapId === mapId && cache.data === $dataMap) return cache.beds;
      const beds = $gameMap.events().filter(ev => this.isBedEvent(ev))
        .map(ev => ({ x: ev.x, y: ev.y, eventId: ev.eventId() }));
      $gameMap._npcBedCache = { mapId, data: $dataMap, beds };
      return beds;
    },

    // A tile somebody lying on would block: a door, a transfer, a stair, or
    // any event that does something when it is walked into.
    isDoorway(x, y) {
      if (!$gameMap) return false;
      return $gameMap.eventsXy(x, y).concat(
        ORTHO_DIRS.flatMap(d => $gameMap.eventsXy($gameMap.roundXWithDirection(x, d), $gameMap.roundYWithDirection(y, d)))
      ).some(ev => {
        if (!ev || ev._erased || ev._npcRosterSpawn || ev._npcMinted) return false;
        const data = ev.event ? ev.event() : null;
        if (!data) return false;
        if (/door|house|stair|exit|transfer|elevator/i.test(data.name || "")) return true; // i18n-ignore: event names matched at runtime
        return (data.pages || []).some(p => (p?.list || []).some(c => c && (c.code === 201 || c.code === 357 && /visitHouse|enterMultiBuilding/.test(String(c.parameters?.[1] || "")))));
      });
    },

    // The nearest tile to lie on that is out of everybody's way.
    roughSpot(x, y, self) {
      for (let r = 1; r <= NPCSeats.STAND_RADIUS; r++) {
        for (let dx = -r; dx <= r; dx++) {
          const rest = r - Math.abs(dx);
          for (const dy of rest ? [-rest, rest] : [0]) {
            const tx = x + dx, ty = y + dy;
            if (NPCSeats.canStand(tx, ty) && NPCSeats.isEmpty(tx, ty, self) && !this.isDoorway(tx, ty)) return { x: tx, y: ty };
          }
        }
      }
      return null;
    },

    // Nobody in it but the bed itself (and `self`): no other sleeper, no player.
    isFree(bed, self) {
      if ($gamePlayer && $gamePlayer.x === bed.x && $gamePlayer.y === bed.y) return false;
      return !$gameMap.eventsXy(bed.x, bed.y).some(ev =>
        ev && ev !== self && !ev._erased && !this.isBedEvent(ev));
    },

    // Free beds with a free tile beside them, nearest to (x, y) first.
    freeBeds(x, y, self, radius) {
      const out = [];
      for (const b of this.beds()) {
        const d = Utils.manhattan(b.x, b.y, x, y);
        if (radius && d > radius) continue;
        if (!this.isFree(b, self)) continue;
        if (!NPCSeats.approaches(b, x, y).length) continue;
        out.push({ x: b.x, y: b.y, d });
      }
      return out.sort((a, b) => a.d - b.d);
    },
  };

  const NPCSeats = {
    SPAWN_CHANCE: 0.2,
    // How long a sit lasts, in real milliseconds. Somebody tired stays longer.
    SIT_MS: [20000, 60000],
    TIRED_SIT_MS: [60000, 150000],
    TIRED_BELOW: 40,
    SEARCH_RADIUS: 15,
    STAND_RADIUS: 6,
    // A menu or a pause stops the map but not the clock: never pay out more
    // than this many seconds of rest for a single tick.
    MAX_TICK_SEC: 2,
    NO_STAND_REGIONS: [10, 103, 99],

    isSeat(x, y) {
      return !!$gameMap && $gameMap.regionId(x, y) === Config.Zones.SEAT;
    },

    // Every seat tile on the map, scanned once per map.
    tiles() {
      if (!$gameMap) return [];
      const mapId = $gameMap.mapId();
      const cache = $gameMap._npcSeatCache;
      if (cache && cache.mapId === mapId) return cache.tiles;
      const tiles = [];
      const w = $gameMap.width(), h = $gameMap.height();
      for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++) {
          if (this.isSeat(x, y)) tiles.push({ x, y });
        }
      }
      $gameMap._npcSeatCache = { mapId, tiles };
      return tiles;
    },

    // Nobody on the tile but `self`: no live solid event, not the player and
    // no party follower parked there by MovementInteractionSystem.
    isEmpty(x, y, self) {
      if ($gamePlayer && $gamePlayer.x === x && $gamePlayer.y === y) return false;
      const followers = $gamePlayer?.followers?.()?._data || [];
      if (followers.some(f => f && f._sittingDetached && f.x === x && f.y === y)) return false;
      return !$gameMap.eventsXy(x, y).some(ev =>
        ev && ev !== self && !ev._erased && !(typeof ev.isThrough === "function" && ev.isThrough()));
    },

    // A tile somebody can stand on: walkable, not a seat, not water or a
    // blocked region.
    canStand(x, y) {
      if (!$gameMap.isValid(x, y)) return false;
      if (this.isSeat(x, y)) return false;
      if (this.NO_STAND_REGIONS.includes($gameMap.regionId(x, y))) return false;
      if (Utils.isBlockedTerrain(x, y)) return false;
      return ORTHO_DIRS.some(d => $gameMap.isPassable(x, y, d));
    },

    // The tiles beside a seat to sit down from, nearest to (fromX, fromY)
    // first. `dir` is the way they face stepping onto the seat.
    approaches(seat, fromX, fromY) {
      const out = [];
      for (const d of ORTHO_DIRS) {
        const x = $gameMap.roundXWithDirection(seat.x, d);
        const y = $gameMap.roundYWithDirection(seat.y, d);
        if (this.canStand(x, y)) out.push({ x, y, dir: 10 - d });
      }
      return out.sort((a, b) => Utils.manhattan(a.x, a.y, fromX, fromY) - Utils.manhattan(b.x, b.y, fromX, fromY));
    },

    // Free seats that can be reached from somewhere, nearest to (x, y) first.
    // With no radius the whole map counts.
    freeSeats(x, y, self, radius) {
      const out = [];
      for (const t of this.tiles()) {
        const d = Utils.manhattan(t.x, t.y, x, y);
        if (radius && d > radius) continue;
        if (!this.isEmpty(t.x, t.y, self)) continue;
        if (!this.approaches(t, x, y).length) continue;
        out.push({ x: t.x, y: t.y, d });
      }
      return out.sort((a, b) => a.d - b.d);
    },

    // Where somebody seated at (x, y) gets up to: the nearest tile they can
    // stand on that nobody holds, the four beside the seat first. null when
    // there is none within STAND_RADIUS.
    standTile(x, y, self) {
      for (let r = 1; r <= this.STAND_RADIUS; r++) {
        for (let dx = -r; dx <= r; dx++) {
          const rest = r - Math.abs(dx);
          for (const dy of rest ? [-rest, rest] : [0]) {
            const tx = x + dx, ty = y + dy;
            if (this.canStand(tx, ty) && this.isEmpty(tx, ty, self)) return { x: tx, y: ty };
          }
        }
      }
      return null;
    },

    isTired(profile) {
      return !!profile && (profile.currentNeed === "sleep" || (profile.sleep ?? 100) < this.TIRED_BELOW);
    },

    sitDuration(profile) {
      const [lo, hi] = this.isTired(profile) ? this.TIRED_SIT_MS : this.SIT_MS;
      return Utils.randBetween(lo, hi);
    },

    // How much a controller wants to sit down, as a decideNextGoal weight.
    sitWeight(profile) {
      if (!this.tiles().length) return 0;
      let w = 12;
      if (this.isTired(profile)) w += 30;
      const traitsById = _getTraitsById();
      if ((profile?.traitIds || []).some(id => /lazy/i.test(traitsById.get(id)?.name || ""))) w += 15;
      return w;
    },
  };

  // ==========================================================================
  // CORE AI CLASSES
  // ==========================================================================
  class Pathfinder {
    constructor(character) { this.character = character; }

    isPassable(x, y, d, eventGrid) {
      const r = $gameMap.regionId(x, y);
      if (r === 5) return true;
      if (r === 10) return false;
      // Keep roaming NPCs off water so they do not appear to drown. Water is
      // region 99 or terrain tag 3 (matches MovementInteractionSystem) (#121);
      // terrain tag 7 is barred the same way (Utils.isBlockedTerrain).
      if (r === 99 || Utils.isBlockedTerrain(x, y)) return false;

      const mapW = $gameMap.width();
      const key = x + y * mapW;
      const ev = eventGrid.get(key);
      if (ev && ev !== this.character) return false;

      if (d) return this.character.canPass(x, y, d);
      return ORTHO_DIRS.some(dir => $gameMap.isPassable(x, y, dir));
    }

    findPath(startX, startY, goalX, goalY, avoidEnemies = true, avoidNPCs = true) {
      const mapW = $gameMap.width();
      const getKey = (x, y) => x + y * mapW;
      const { eventGrid, doorKeys, allNpcKeys, enemyDangerKeys } = _getPathfinderFrameCache(mapW);
      const selfKey = getKey(this.character.x, this.character.y);

      const closedSet = new Set(), cameFrom = new Map(), gScore = new Map(), fScore = new Map();
      const openHeap = new _MinHeap(fScore);
      const startK = getKey(startX, startY);
      const goalK  = getKey(goalX, goalY);

      gScore.set(startK, 0);
      fScore.set(startK, Utils.manhattan(startX, startY, goalX, goalY));
      openHeap.push(startK);

      let iterations = 0;
      while (openHeap.size > 0 && iterations++ < 500) {
        const currentK = openHeap.pop();
        if (currentK === goalK) return this.reconstructPath(cameFrom, currentK);
        closedSet.add(currentK);

        const cx = currentK % mapW, cy = Math.floor(currentK / mapW);

        // Walked off the tables above rather than built as an array of four
        // objects: this loop runs up to 500 times per pathfind, and every NPC
        // re-paths whenever its state changes.
        for (let n = 0; n < 4; n++) {
          const nx = cx + NEIGHBOR_DX[n];
          const ny = cy + NEIGHBOR_DY[n];
          const dir = NEIGHBOR_DIR[n];
          const nK = getKey(nx, ny);
          if (!$gameMap.isValid(nx, ny) || closedSet.has(nK)) continue;
          const hasDoor = doorKeys.has(nK);
          if (!hasDoor && (!this.character.canPass(cx, cy, dir) || !this.isPassable(nx, ny, undefined, eventGrid))) continue;
          if (avoidEnemies && enemyDangerKeys.has(nK)) continue;
          if (avoidNPCs && allNpcKeys.has(nK) && nK !== selfKey) continue;

          const tGScore = (gScore.get(currentK) ?? 0) + 1;
          if (openHeap.has(nK) && tGScore >= (gScore.get(nK) ?? Infinity)) continue;

          cameFrom.set(nK, { pos: currentK, dir });
          gScore.set(nK, tGScore);
          fScore.set(nK, tGScore + Utils.manhattan(nx, ny, goalX, goalY));

          if (!openHeap.has(nK)) openHeap.push(nK);
          else openHeap.update(nK);
        }
      }
      return null;
    }

    reconstructPath(cameFrom, current) {
      const path = [];
      while (cameFrom.has(current)) {
        const node = cameFrom.get(current);
        path.unshift(node.dir);
        current = node.pos;
      }
      return path;
    }

    // Terrain-only route used by the yield behaviour (see NPCYield below): the
    // NPC walks it with _through on, so other events are not obstacles and the
    // only thing that can block a step is the map itself. A plain BFS, since
    // every step costs the same and the goal is always a few tiles away.
    findNoclipPath(startX, startY, goalX, goalY) {
      const mapW = $gameMap.width();
      const getKey = (x, y) => x + y * mapW;
      const startK = getKey(startX, startY), goalK = getKey(goalX, goalY);
      if (startK === goalK) return [];

      const cameFrom = new Map();
      const seen = new Set([startK]);
      const queue = [startK];
      let head = 0;
      while (head < queue.length && head < 1200) {
        const currentK = queue[head++];
        const cx = currentK % mapW, cy = Math.floor(currentK / mapW);
        for (const dir of ORTHO_DIRS) {
          const nx = $gameMap.roundXWithDirection(cx, dir);
          const ny = $gameMap.roundYWithDirection(cy, dir);
          const nK = getKey(nx, ny);
          if (seen.has(nK) || !NPCYield.canStepTerrain(cx, cy, dir)) continue;
          seen.add(nK);
          cameFrom.set(nK, { pos: currentK, dir });
          if (nK === goalK) return this.reconstructPath(cameFrom, nK);
          queue.push(nK);
        }
      }
      return null;
    }
  }

  // ==========================================================================
  // SWIM SPOTS (Phase R): where on the shore a person gets into the water
  // ==========================================================================
  // The Pathfinder above keeps every walker off the water, and so it should:
  // an NPC is only ever IN the water on purpose (the controller's swimming and
  // fishing states, NPCSystem_Controller.js), by the same rules the party
  // swims by (MovementInteractionSystem): region 99, the procedural map's
  // terrain-tag-3 water, any other blocked liquid, and never region 10.
  //
  // findSpot walks the dry land outward from a person, breadth first, the
  // same way the Pathfinder would let them walk, and answers the first tile of
  // shore it reaches: { shore, water, dir, dist }. `shore` is where they stand
  // (to fish, or to step in), `water` the tile beside it they swim from, and
  // `dir` the facing from one to the other. Nothing within `maxDist` steps, or
  // nothing reachable at all, answers null.
  const SwimSpots = {
    MAX_DIST: 24,
    MAX_NODES: 2000,
    NO_SWIM_REGION: 10,
    WATER_REGION: 99,
    WATER_TERRAIN_TAG: 3,
    KEEP_OUT_REGIONS: [10, 103],

    isSwimWater(x, y) {
      if (!$gameMap || !$gameMap.isValid(x, y)) return false;
      const r = $gameMap.regionId(x, y);
      if (r === this.NO_SWIM_REGION) return false;
      if (r === this.WATER_REGION) return true;
      if ($gameMap.terrainTag(x, y) === this.WATER_TERRAIN_TAG) return true;
      const MS = window.MovementSystem;
      try { return !!(MS && MS.isLiquidTile && MS.isLiquidTile(x, y)); } catch (e) { return false; }
    },

    // Dry ground somebody may stand on.
    isDryStand(x, y) {
      if (!$gameMap || !$gameMap.isValid(x, y)) return false;
      if (this.isSwimWater(x, y)) return false;
      if (this.KEEP_OUT_REGIONS.includes($gameMap.regionId(x, y))) return false;
      if (Utils.isBlockedTerrain(x, y)) return false;
      return ORTHO_DIRS.some(d => $gameMap.isPassable(x, y, d));
    },

    // The water tiles beside (x, y), as facings.
    waterDirs(x, y) {
      return ORTHO_DIRS.filter(d =>
        this.isSwimWater($gameMap.roundXWithDirection(x, d), $gameMap.roundYWithDirection(y, d)));
    },

    // The answers findSpot has given on this map, and what it has read off
    // each tile. The search reads nothing but the tiles (regions, terrain
    // tags, passability), so the same question on the same map has the same
    // answer: a leisure hour asks it of every idler once a game minute, and a
    // person out of reach of any water paid a full MAX_NODES search, every
    // tile read several times over, every time. Both are dropped with the
    // map. A dig or a build may change a tile, so an answer and a tile read
    // are also forgotten after an hour or two of game time: each one keeps
    // for MEMO_TTL minutes plus a share of MEMO_TTL of its own, so they do not
    // all run out in the same frame. The answers are also dropped once
    // MEMO_CAP of them are held.
    MEMO_CAP: 512,
    MEMO_TTL: 60,
    _memo: null,
    _tileStamp: null,
    _tileRead: null,
    _tileBits: null,
    _tileGen: 0,
    _minuteNow() {
      return (typeof $gameVariables !== "undefined" && $gameVariables) ? ($gameVariables.value(114) || 0) : 0;
    },
    _memoNow() {
      const data = typeof $dataMap !== "undefined" ? $dataMap : null;
      const mapId = $gameMap.mapId ? $gameMap.mapId() : 0;
      const w = $gameMap.width();
      const h = $gameMap.height ? $gameMap.height() : w;
      let m = this._memo;
      if (m && m.answers.size >= this.MEMO_CAP) m.answers.clear();
      if (!m || m.map !== $gameMap || m.mapId !== mapId || m.data !== data || m.w !== w || m.h !== h) {
        m = this._memo = { map: $gameMap, mapId, data, w, h, answers: new Map() };
        if (!this._tileStamp || this._tileStamp.length !== w * h) {
          this._tileStamp = new Uint32Array(w * h);
          this._tileRead = new Float64Array(w * h);
          this._tileBits = new Uint8Array(w * h);
          this._tileGen = 0;
        }
        // A new stamp: every tile read before this reads as unknown again.
        this._tileGen = (this._tileGen + 1) >>> 0 || 1;
      }
      m.now = this._minuteNow();
      return m;
    },
    // Whether something read at `at` (game minutes) is still good now; `k`
    // spreads the lifetimes.
    _fresh(at, now, k) {
      const age = now - at;
      return age >= 0 && age < this.MEMO_TTL + (k % this.MEMO_TTL);
    },

    // What findSpot asks of a tile, as bits: dry ground to stand on, water to
    // swim in, and the four passabilities (isPassable 2, 4, 6, 8).
    _DRY: 1, _SWIM: 2, _PASS: { 2: 4, 4: 8, 6: 16, 8: 32 },
    _readTile(x, y) {
      let bits = 0;
      if (this.isDryStand(x, y)) bits |= this._DRY;
      if (this.isSwimWater(x, y)) bits |= this._SWIM;
      for (let i = 0; i < ORTHO_DIRS.length; i++) {
        const d = ORTHO_DIRS[i];
        if ($gameMap.isPassable(x, y, d)) bits |= this._PASS[d];
      }
      return bits;
    },
    _tile(x, y, w, h) {
      // Off the map nothing is dry ground; only the water test is asked there.
      if (x < 0 || y < 0 || x >= w || y >= h) return this.isSwimWater(x, y) ? this._SWIM : 0;
      const k = x + y * w;
      const now = this._memo ? this._memo.now : 0;
      if (this._tileStamp[k] === this._tileGen && this._fresh(this._tileRead[k], now, k)) return this._tileBits[k];
      const bits = this._readTile(x, y);
      this._tileStamp[k] = this._tileGen;
      this._tileRead[k] = now;
      this._tileBits[k] = bits;
      return bits;
    },

    findSpot(fromX, fromY, opts) {
      if (!$gameMap) return null;
      const maxDist = Math.max(0, (opts && opts.maxDist) != null ? opts.maxDist : this.MAX_DIST);
      const memo = this._memoNow();
      const key = (maxDist * memo.h + fromY) * memo.w + fromX;
      let answer;
      const held = memo.answers.get(key);
      if (held && this._fresh(held.at, memo.now, key)) answer = held.answer;
      else {
        answer = this._search(fromX, fromY, maxDist, memo.w, memo.h);
        memo.answers.set(key, { answer, at: memo.now });
      }
      // A copy: the caller may keep it.
      return answer && { shore: { x: answer.shore.x, y: answer.shore.y },
        water: { x: answer.water.x, y: answer.water.y }, dir: answer.dir, dist: answer.dist };
    },

    // Breadth first over the dry land, one queue in visiting order (the order
    // the level-by-level frontier lists gave), the seen tiles stamped rather
    // than kept in a set. Scratch arrays are the map's size, kept between calls.
    _seen: null,
    _seenGen: 0,
    _qx: null,
    _qy: null,
    _qd: null,
    _search(fromX, fromY, maxDist, w, h) {
      const DRY = this._DRY, SWIM = this._SWIM, PASS = this._PASS;
      const size = w * h;
      if (!this._seen || this._seen.length !== size) {
        this._seen = new Uint32Array(size);
        this._qx = new Int32Array(size + 1);
        this._qy = new Int32Array(size + 1);
        this._qd = new Int32Array(size + 1);
        this._seenGen = 0;
      }
      const gen = this._seenGen = (this._seenGen + 1) >>> 0 || 1;
      const seen = this._seen, qx = this._qx, qy = this._qy, qd = this._qd;
      const inMap = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
      if (inMap(fromX, fromY)) seen[fromX + fromY * w] = gen;
      let head = 0, tail = 0;
      qx[tail] = fromX; qy[tail] = fromY; qd[tail] = 0; tail++;
      let nodes = 0;
      while (head < tail) {
        const px = qx[head], py = qy[head], dist = qd[head];
        head++;
        if (dist > maxDist) return null;
        if (++nodes > this.MAX_NODES) return null;
        const here = this._tile(px, py, w, h);
        const pDry = (here & DRY) !== 0;
        if (pDry) {
          // The first of waterDirs, without the list.
          for (let i = 0; i < ORTHO_DIRS.length; i++) {
            const dir = ORTHO_DIRS[i];
            const wx = $gameMap.roundXWithDirection(px, dir), wy = $gameMap.roundYWithDirection(py, dir);
            if (this._tile(wx, wy, w, h) & SWIM) return { shore: { x: px, y: py }, water: { x: wx, y: wy }, dir, dist };
          }
        }
        for (let i = 0; i < ORTHO_DIRS.length; i++) {
          const d = ORTHO_DIRS[i];
          const nx = $gameMap.roundXWithDirection(px, d), ny = $gameMap.roundYWithDirection(py, d);
          // Off the map is never dry ground, so it is never queued.
          if (!inMap(nx, ny)) continue;
          const k = nx + ny * w;
          if (seen[k] === gen) continue;
          const there = this._tile(nx, ny, w, h);
          if (!(there & DRY)) continue;
          if (!(here & PASS[d]) && pDry) continue;
          if (!(there & PASS[10 - d])) continue;
          seen[k] = gen;
          qx[tail] = nx; qy[tail] = ny; qd[tail] = dist + 1; tail++;
        }
      }
      return null;
    },
  };

  Object.assign(window.NPCSystem._internal, {
    _getTraitsById, _stateMethodName, NPCBeds, NPCSeats, NPCYield, Pathfinder, SwimSpots,
  });
})();
