/*:
 * @target MZ
 * @plugindesc 2D platformer controls on maps tagged <Platform>: box collision, region rules, water zones, split screen and network play.
 * @author GPT-Starfleet
 *
 * @help PlatformerMode.js
 *
 * Map Note Tag:
 *   <Platform>
 *
 * Regions (the only three the mode reads):
 *   5   always passable, whatever the tile says
 *   10  always solid, whatever the tile says
 *   99  water: buoyancy, drag, swimming
 *
 * Mechanics:
 *   - Left/Right walk, Shift runs, OK jumps (coyote time + jump buffering)
 *   - Wall jump off either side while airborne
 *   - Ladder climbing with Up/Down
 *   - Water zones (region 99): swim with Up / OK, sink slowly otherwise
 *   - The body is an axis aligned box swept against the tiles, so it can never
 *     end up inside a solid tile or inside region 10, at any speed
 *   - Followers replay the leader's path a few frames behind
 *   - Transfers freeze the body, resolve the landing spot out of any solid and
 *     snap the camera, so teleporting in and out never drops the party in a wall
 *
 * Other systems:
 *   - window.PlatformerMode.isActive() is the one answer to "are we in the
 *     platformer". The autonomous NPC simulation (NPC/NPCSystem.js) asks it and
 *     stays out; AutoIdleExplorer asks it too.
 *   - Split screen (Multiplayer/SplitScreenMultiplayer.js) hands Player 2's
 *     avatar to updateSplitScreenP2 so it runs the same physics.
 *   - Network play (Multiplayer/MultiplayerSystem.js) sends sub tile
 *     coordinates on a platform map and places remote bodies with them, since
 *     the grid movement it normally uses cannot express a jump arc.
 */
(() => {
  "use strict";

  // ---------------------------------------------------------------------------
  // Tuning. Speeds are authored in pixels per frame (the units the mode was
  // written in) and converted to tiles once, because every physics test below
  // works in tile space.
  // ---------------------------------------------------------------------------
  const TILE_SIZE = 48;
  const P = px => px / TILE_SIZE;

  const GRAVITY        = P(1.2);
  const MOVE_SPEED     = P(4);
  const RUN_SPEED      = P(7);
  const JUMP_SPEED     = P(-20);
  const MAX_FALL_SPEED = P(12);
  const WALL_JUMP_X    = P(8);
  const WALL_JUMP_Y    = P(-18);
  const CLIMB_SPEED    = P(3.2);

  // Water (region 99): heavy drag, a slow sink, and a stroke that beats it.
  const WATER_GRAVITY   = GRAVITY * 0.22;
  const WATER_MAX_FALL  = P(3);
  const WATER_MOVE      = P(2.6);
  const WATER_RUN       = P(3.8);
  const WATER_STROKE    = P(-4.5);
  const WATER_DRAG      = 0.86;
  const WATER_EXIT_JUMP = P(-11);

  const COYOTE_FRAMES  = 6;   // grace after walking off a ledge
  const JUMP_BUFFER    = 6;   // grace for pressing jump just before landing
  const FOLLOWER_DELAY = 10;
  const ANIM_SPEED     = 12;
  const RUN_ANIM_SPEED = 6;
  const CAMERA_SPEED   = 0.1;
  const SPRITE_OFFSET_Y = 0;

  // The body is narrower than a tile so a one tile gap is actually enterable,
  // and a hair shorter so standing on the floor is not a permanent overlap.
  const BODY_W = 0.62;
  const BODY_H = 0.94;

  const REGION_PASS  = 5;
  const REGION_SOLID = 10;
  const REGION_WATER = 99;

  const MAX_SUBSTEP = 0.2;   // tiles per collision substep
  const EPS = 1e-6;

  // ---------------------------------------------------------------------------
  // Pure physics core. Everything here takes an explicit `world` (the four
  // questions the mode ever asks a map), so it runs headless in the tests.
  // ---------------------------------------------------------------------------

  function inBounds(world, tx, ty) {
    return tx >= 0 && ty >= 0 && tx < world.width() && ty < world.height();
  }

  // Region 5 beats the tile, region 10 beats the tile, water is never solid.
  // Anything else is solid only when the tile blocks every direction, which is
  // what an authored wall does and what a walkable floor never does.
  function tileSolid(world, tx, ty) {
    if (!inBounds(world, tx, ty)) return true;
    const region = world.regionId(tx, ty);
    if (region === REGION_PASS) return false;
    if (region === REGION_SOLID) return true;
    if (region === REGION_WATER) return false;
    return !(world.isPassable(tx, ty, 2) || world.isPassable(tx, ty, 4) ||
             world.isPassable(tx, ty, 6) || world.isPassable(tx, ty, 8));
  }

  function tileWater(world, tx, ty) {
    return inBounds(world, tx, ty) && world.regionId(tx, ty) === REGION_WATER;
  }

  function boxAt(x, y) {
    const halfGap = (1 - BODY_W) / 2;
    return { x1: x + halfGap, x2: x + 1 - halfGap, y1: y + 1 - BODY_H, y2: y + 1 };
  }

  function collides(world, x, y) {
    const b = boxAt(x, y);
    const tx1 = Math.floor(b.x1), tx2 = Math.floor(b.x2 - EPS);
    const ty1 = Math.floor(b.y1), ty2 = Math.floor(b.y2 - EPS);
    for (let ty = ty1; ty <= ty2; ty++) {
      for (let tx = tx1; tx <= tx2; tx++) {
        if (tileSolid(world, tx, ty)) return true;
      }
    }
    return false;
  }

  // Move one axis, stopping flush against whatever it meets. Never lands inside
  // a solid: the substep keeps the probe short and the bisection keeps the
  // resting position on the free side of the surface.
  function moveAxis(world, body, delta, axis) {
    if (!delta) return false;
    let remaining = delta;
    while (Math.abs(remaining) > EPS) {
      const s = Math.max(-MAX_SUBSTEP, Math.min(MAX_SUBSTEP, remaining));
      remaining -= s;
      const nx = axis === "x" ? body.x + s : body.x;
      const ny = axis === "y" ? body.y + s : body.y;
      if (!collides(world, nx, ny)) { body.x = nx; body.y = ny; continue; }
      let lo = 0, hi = s;
      for (let i = 0; i < 16; i++) {
        const mid = (lo + hi) / 2;
        const mx = axis === "x" ? body.x + mid : body.x;
        const my = axis === "y" ? body.y + mid : body.y;
        if (collides(world, mx, my)) hi = mid; else lo = mid;
      }
      if (axis === "x") body.x += lo; else body.y += lo;
      return true;
    }
    return false;
  }

  // Push a body that is somehow inside geometry back out: after a transfer onto
  // an authored wall, after an event moved it, after a map edit. Prefers up,
  // then sideways, then down, so it never buries the party deeper.
  function unstick(world, x, y, radius) {
    if (!collides(world, x, y)) return { x: x, y: y };
    const limit = radius === undefined ? 12 : radius;
    for (let r = 0.25; r <= limit; r += 0.25) {
      const probes = [
        [x, y - r], [x - r, y], [x + r, y], [x, y + r],
        [x - r, y - r], [x + r, y - r], [x - r, y + r], [x + r, y + r],
      ];
      for (const probe of probes) {
        if (!collides(world, probe[0], probe[1])) return { x: probe[0], y: probe[1] };
      }
    }
    return { x: x, y: y };
  }

  // Where a transfer actually puts the body. Snapped to the tile grid first,
  // because a teleport names a tile, not a sub tile position.
  function resolveSpawn(world, x, y) {
    const free = unstick(world, Math.round(x), Math.round(y));
    return { x: free.x, y: free.y };
  }

  function isInWater(world, x, y) {
    const b = boxAt(x, y);
    const cx = Math.floor((b.x1 + b.x2) / 2);
    return tileWater(world, cx, Math.floor((b.y1 + b.y2) / 2)) ||
           tileWater(world, cx, Math.floor(b.y2 - EPS));
  }

  function isHeadUnderwater(world, x, y) {
    const b = boxAt(x, y);
    return tileWater(world, Math.floor((b.x1 + b.x2) / 2), Math.floor(b.y1 + EPS));
  }

  function onGround(world, x, y) {
    return collides(world, x, y + 0.06);
  }
  function touchingLeftWall(world, x, y) {
    return collides(world, x - 0.06, y);
  }
  function touchingRightWall(world, x, y) {
    return collides(world, x + 0.06, y);
  }
  function isLadderAt(world, x, y) {
    const b = boxAt(x, y);
    const tx = Math.floor((b.x1 + b.x2) / 2);
    return !!world.isLadder(tx, Math.floor((b.y1 + b.y2) / 2));
  }

  function newBody(x, y) {
    return {
      x: x, y: y, vx: 0, vy: 0,
      onGround: false, inWater: false, onLadder: false,
      jumping: false, running: false,
      coyote: 0, buffer: 0, direction: 2,
    };
  }

  // One frame of simulation for any body: the player, Player 2, anything else
  // that wants the same feel. `input` is a plain record so the caller decides
  // where the buttons came from (keyboard, pad, split screen, replay).
  function stepBody(world, body, input) {
    const i = input || {};
    body.onLadder = isLadderAt(world, body.x, body.y);
    body.inWater = isInWater(world, body.x, body.y);
    body.running = !!i.run;

    if (i.jump) body.buffer = JUMP_BUFFER;
    else if (body.buffer > 0) body.buffer--;

    // --- horizontal intent ---------------------------------------------------
    let speed;
    if (body.inWater) speed = body.running ? WATER_RUN : WATER_MOVE;
    else speed = body.running ? RUN_SPEED : MOVE_SPEED;

    if (i.left && !i.right) { body.vx = -speed; body.direction = 4; }
    else if (i.right && !i.left) { body.vx = speed; body.direction = 6; }
    else if (body.inWater) body.vx *= WATER_DRAG;
    else body.vx = 0;

    // --- vertical intent -----------------------------------------------------
    if (body.onLadder) {
      body.vy = 0;
      if (i.up && !i.down) { body.vy = -CLIMB_SPEED; body.direction = 8; }
      else if (i.down && !i.up) { body.vy = CLIMB_SPEED; body.direction = 2; }
      // Jumping is the only way off the top of a ladder.
      if (body.buffer > 0) { body.vy = JUMP_SPEED; body.jumping = true; body.buffer = 0; }
    } else if (body.inWater) {
      const surfacing = !isHeadUnderwater(world, body.x, body.y);
      if (i.up || body.buffer > 0) {
        // Breaking the surface with a stroke launches out of the water rather
        // than bobbing against the ceiling of it.
        body.vy = (surfacing && body.buffer > 0) ? WATER_EXIT_JUMP : WATER_STROKE;
        body.buffer = 0;
      } else {
        body.vy = Math.min(body.vy * WATER_DRAG + WATER_GRAVITY, WATER_MAX_FALL);
      }
      body.jumping = false;
    } else {
      if (body.onGround) body.coyote = COYOTE_FRAMES;
      else if (body.coyote > 0) body.coyote--;

      if (body.buffer > 0 && body.coyote > 0) {
        body.vy = JUMP_SPEED;
        body.jumping = true;
        body.buffer = 0;
        body.coyote = 0;
      } else if (body.buffer > 0 && !body.onGround) {
        const left = touchingLeftWall(world, body.x, body.y);
        const right = touchingRightWall(world, body.x, body.y);
        if (left || right) {
          const boost = body.running ? WALL_JUMP_X * 1.5 : WALL_JUMP_X;
          body.vy = WALL_JUMP_Y;
          body.vx = left ? boost : -boost;
          body.direction = left ? 6 : 4;
          body.jumping = true;
          body.buffer = 0;
        }
      }
      body.vy = Math.min(body.vy + GRAVITY, MAX_FALL_SPEED);
    }

    // --- integrate -----------------------------------------------------------
    if (moveAxis(world, body, body.vx, "x")) body.vx = 0;
    if (moveAxis(world, body, body.vy, "y")) {
      if (body.vy > 0) body.jumping = false;
      body.vy = 0;
    }

    // A body can only be inside geometry here if the map changed under it.
    if (collides(world, body.x, body.y)) {
      const free = unstick(world, body.x, body.y);
      body.x = free.x;
      body.y = free.y;
      body.vx = 0;
      body.vy = 0;
    }

    body.onGround = body.onLadder || body.inWater || onGround(world, body.x, body.y);
    if (body.onGround && body.vy >= 0) body.jumping = false;
    return body;
  }

  const Physics = {
    TILE_SIZE: TILE_SIZE, BODY_W: BODY_W, BODY_H: BODY_H,
    REGION_PASS: REGION_PASS, REGION_SOLID: REGION_SOLID, REGION_WATER: REGION_WATER,
    GRAVITY: GRAVITY, MOVE_SPEED: MOVE_SPEED, RUN_SPEED: RUN_SPEED,
    JUMP_SPEED: JUMP_SPEED, MAX_FALL_SPEED: MAX_FALL_SPEED,
    WATER_MAX_FALL: WATER_MAX_FALL, WATER_STROKE: WATER_STROKE,
    COYOTE_FRAMES: COYOTE_FRAMES, JUMP_BUFFER: JUMP_BUFFER,
    tileSolid: tileSolid, tileWater: tileWater, boxAt: boxAt, collides: collides,
    moveAxis: moveAxis, unstick: unstick, resolveSpawn: resolveSpawn,
    isInWater: isInWater, isHeadUnderwater: isHeadUnderwater, onGround: onGround,
    touchingLeftWall: touchingLeftWall, touchingRightWall: touchingRightWall,
    isLadderAt: isLadderAt, newBody: newBody, stepBody: stepBody,
  };

  // Headless callers (the test harness) load the file for its physics alone and
  // have no RPG Maker classes to hook. Publish the core and stop there.
  const HAS_ENGINE = typeof Game_Player !== "undefined" && typeof Scene_Map !== "undefined";

  // ---------------------------------------------------------------------------
  // Live map adapter and mode state
  // ---------------------------------------------------------------------------
  const liveWorld = {
    width() { return (typeof $dataMap !== "undefined" && $dataMap) ? $dataMap.width : 0; },
    height() { return (typeof $dataMap !== "undefined" && $dataMap) ? $dataMap.height : 0; },
    regionId(x, y) { return $gameMap ? $gameMap.regionId(x, y) : 0; },
    isPassable(x, y, d) { return $gameMap ? $gameMap.isPassable(x, y, d) : false; },
    isLadder(x, y) { return $gameMap ? $gameMap.isLadder(x, y) : false; },
  };

  const isPlatformMap = () =>
    !!(typeof $dataMap !== "undefined" && $dataMap && $dataMap.meta && $dataMap.meta.Platform);

  let _positionHistory = [];
  let _frozen = false;      // true across a transfer, until the scene starts
  let _cameraSnap = true;   // snap instead of easing on the first frame in

  function playerBody() {
    const p = $gamePlayer;
    if (!p._pfBody) p._pfBody = newBody(p._realX, p._realY);
    return p._pfBody;
  }

  // Write a body back onto a Game_CharacterBase.
  function applyBody(character, body) {
    character._realX = body.x;
    character._realY = body.y;
    character._x = Math.round(body.x);
    character._y = Math.round(body.y);
    character.setDirection(body.direction);
  }

  function syncBodyFrom(character, body) {
    body.x = character._realX;
    body.y = character._realY;
  }

  // Put a character somewhere legal on this map and stop it dead. Used by every
  // way into a platform map: transfer, locate, load.
  function placeSafely(character, body) {
    const spot = resolveSpawn(liveWorld, character._realX, character._realY);
    character._realX = spot.x;
    character._realY = spot.y;
    character._x = Math.round(spot.x);
    character._y = Math.round(spot.y);
    if (body) {
      body.x = spot.x; body.y = spot.y;
      body.vx = 0; body.vy = 0;
      body.jumping = false; body.coyote = 0; body.buffer = 0;
    }
  }

  function snapCameraNow() {
    if (!$gameMap || !$dataMap) return;
    const targetX = $gamePlayer._realX - ($gameMap.screenTileX() - 1) / 2;
    const targetY = $gamePlayer._realY - ($gameMap.screenTileY() - 1) / 2;
    const maxX = Math.max(0, $dataMap.width - $gameMap.screenTileX());
    const maxY = Math.max(0, $dataMap.height - $gameMap.screenTileY());
    $gameMap.setDisplayPos(
      Math.max(0, Math.min(targetX, maxX)),
      Math.max(0, Math.min(targetY, maxY)));
    _cameraSnap = false;
  }

  function updateSplitScreenP2(event, manager) {
    if (!event || !isPlatformMap()) return false;
    if (!event._pfBody) {
      const spot = resolveSpawn(liveWorld, event._realX, event._realY);
      event._pfBody = newBody(spot.x, spot.y);
    }
    if (event.isThrough && !event.isThrough()) event.setThrough(true);

    const body = event._pfBody;
    const held = _frozen ||
      (typeof $gameMap !== "undefined" && $gameMap && $gameMap.isEventRunning()) ||
      (typeof $gameMessage !== "undefined" && $gameMessage && $gameMessage.isBusy());
    const p2 = (manager && manager.p2Input) ? manager.p2Input : {};
    const jump = !!(manager && manager.isTriggered && manager.isTriggered("up"));
    const input = held ? {} : {
      left: !!p2.left,
      right: !!p2.right,
      up: !!p2.up,
      down: !!p2.down,
      run: !!p2.dash,
      jump: jump,
    };

    stepBody(liveWorld, body, input);
    applyBody(event, body);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Network play: a jump arc cannot be spelled in whole tiles, so on a platform
  // map the packet carries sub tile coordinates and the remote body is placed
  // from them (eased, so a late packet does not snap anyone across the room).
  // ---------------------------------------------------------------------------
  const REMOTE_EASE = 0.35;

  function remoteState(player) {
    return { px: Math.round(player._realX * 64) / 64, py: Math.round(player._realY * 64) / 64 };
  }

  function remoteStateChanged(last, next) {
    return !last || last.px !== next.px || last.py !== next.py;
  }

  function applyRemoteBody(event, data) {
    if (!event || !data) return false;
    if (data.px === undefined || data.py === undefined) return false;
    if (event.isThrough && !event.isThrough()) event.setThrough(true);
    event._pfRemote = { x: data.px, y: data.py };
    // A jump across the map is a respawn, not a walk: place it outright.
    if (Math.abs(event._realX - data.px) > 4 || Math.abs(event._realY - data.py) > 4) {
      event._realX = data.px; event._x = Math.round(data.px);
      event._realY = data.py; event._y = Math.round(data.py);
    }
    if (data.direction) event.setDirection(data.direction);
    if (data.pattern !== undefined && event.setPattern) event.setPattern(data.pattern);
    return true;
  }

  function stepRemoteBody(event) {
    event._realX += (event._pfRemote.x - event._realX) * REMOTE_EASE;
    event._realY += (event._pfRemote.y - event._realY) * REMOTE_EASE;
    event._x = Math.round(event._realX);
    event._y = Math.round(event._realY);
  }

  // ---------------------------------------------------------------------------
  // Public face
  // ---------------------------------------------------------------------------
  window.PlatformerMode = {
    isActive: isPlatformMap,
    isPlatformNote(note) { return /<Platform>/i.test(String(note || "")); },
    isFrozen() { return _frozen; },
    Physics: Physics,
    world: liveWorld,
    playerBody: playerBody,
    resolveSpawn(x, y) { return resolveSpawn(liveWorld, x, y); },
    updateSplitScreenP2: updateSplitScreenP2,
    remoteState: remoteState,
    remoteStateChanged: remoteStateChanged,
    applyRemoteBody: applyRemoteBody,
    snapCamera: snapCameraNow,
  };

  if (!HAS_ENGINE) return;

  // ---------------------------------------------------------------------------
  // Map lifecycle: freezing, spawning, leaving
  // ---------------------------------------------------------------------------
  const _DataManager_onLoad = DataManager.onLoad;
  DataManager.onLoad = function (object) {
    _DataManager_onLoad.call(this, object);
    if (object === $dataMap) {
      _frozen = true;
      _cameraSnap = true;
      _positionHistory = [];
      if (typeof $gamePlayer !== "undefined" && $gamePlayer && $gamePlayer._pfBody) {
        const body = $gamePlayer._pfBody;
        body.vx = 0; body.vy = 0; body.jumping = false;
        body.coyote = 0; body.buffer = 0;
      }
    }
  };

  const _Scene_Map_onMapLoaded = Scene_Map.prototype.onMapLoaded;
  Scene_Map.prototype.onMapLoaded = function () {
    _Scene_Map_onMapLoaded.call(this);
    if (isPlatformMap()) {
      // Landing on a wall, on a region 10 block or off the map is the one thing
      // a teleport into a platformer can do that the grid mode cannot: fix it
      // here, before a single frame of gravity runs.
      placeSafely($gamePlayer, playerBody());
      for (const follower of $gamePlayer._followers._data) {
        follower._realX = $gamePlayer._realX;
        follower._realY = $gamePlayer._realY;
        follower._x = $gamePlayer._x;
        follower._y = $gamePlayer._y;
        follower.setThrough(true);
      }
      snapCameraNow();
    } else if ($gamePlayer._pfBody) {
      // Leaving: hand the engine back whole tile coordinates and its followers.
      $gamePlayer._realX = $gamePlayer._x = Math.round($gamePlayer._realX);
      $gamePlayer._realY = $gamePlayer._y = Math.round($gamePlayer._realY);
      $gamePlayer._pfBody = null;
      _positionHistory = [];
      for (const follower of $gamePlayer._followers._data) {
        follower.setThrough(false);
        follower._realX = follower._x = Math.round(follower._realX);
        follower._realY = follower._y = Math.round(follower._realY);
      }
      $gamePlayer._followers.synchronize($gamePlayer.x, $gamePlayer.y, $gamePlayer.direction());
    }
  };

  const _Scene_Map_start = Scene_Map.prototype.start;
  Scene_Map.prototype.start = function () {
    _Scene_Map_start.call(this);
    if (isPlatformMap()) {
      placeSafely($gamePlayer, playerBody());
      snapCameraNow();
    }
    _frozen = false;
  };

  const _Game_Player_performTransfer = Game_Player.prototype.performTransfer;
  Game_Player.prototype.performTransfer = function () {
    if (this.isTransferring()) _frozen = true;
    _Game_Player_performTransfer.call(this);
    if (isPlatformMap()) {
      placeSafely(this, playerBody());
      _cameraSnap = true;
    }
  };

  // Anything that teleports the player within a platform map (events, plugins,
  // the debug teleporter) gets the same landing check.
  const _Game_Player_locate = Game_Player.prototype.locate;
  Game_Player.prototype.locate = function (x, y) {
    _Game_Player_locate.call(this, x, y);
    if (isPlatformMap()) {
      placeSafely(this, playerBody());
      _positionHistory = [];
      _cameraSnap = true;
    }
  };

  // ---------------------------------------------------------------------------
  // Player update
  // ---------------------------------------------------------------------------
  const _GP_initMembers = Game_Player.prototype.initMembers;
  Game_Player.prototype.initMembers = function () {
    _GP_initMembers.call(this);
    this._pfBody = null;
    this._animCounter = 0;
  };

  const _GP_update = Game_Player.prototype.update;
  Game_Player.prototype.update = function (sceneActive) {
    if (isPlatformMap()) this._pfUpdate(sceneActive);
    else _GP_update.call(this, sceneActive);
  };

  Game_Player.prototype._pfUpdate = function (sceneActive) {
    const body = playerBody();
    syncBodyFrom(this, body);

    if (_frozen) {
      body.vx = 0; body.vy = 0; body.jumping = false;
      this.setMovementSuccess(true);
      return;
    }

    // An event or a message owns the screen: hold the buttons but keep falling,
    // so a cutscene cannot leave the party hovering in mid air.
    const held = !sceneActive || $gameMap.isEventRunning() || $gameMessage.isBusy() ||
                 !!(window.MapBattleMode && window.MapBattleMode.isActive());
    const input = held ? {} : {
      left: Input.isPressed("left"),
      right: Input.isPressed("right"),
      up: Input.isPressed("up"),
      down: Input.isPressed("down"),
      run: Input.isPressed("shift"),
      jump: Input.isTriggered("ok") && !this._pfActionTarget(),
    };

    stepBody(liveWorld, body, input);
    applyBody(this, body);

    this._pfUpdateAnimation(body);
    this._pfUpdateFollowers();
    this._pfUpdateCamera();
    if (!held) this._pfCheckEventTrigger();

    // Game_Player.update (bypassed here) normally runs the per step processing
    // in updateNonmoving: encounter stepping and $gameParty.onPlayerWalk()
    // (damage floors and slip processing). Keep them, fired once per new tile.
    if (!$gameMap.isEventRunning() &&
        (this._lastStepTileX !== this._x || this._lastStepTileY !== this._y)) {
      if (this._lastStepTileX !== undefined) {
        $gameParty.onPlayerWalk();
        this.updateEncounterCount();
      }
      this._lastStepTileX = this._x;
      this._lastStepTileY = this._y;
    }

    this.setMovementSuccess(true);
  };

  // The event the action button would talk to, if any. Only an action button
  // event counts, so a map full of touch triggers and parallel processes does
  // not cost the party its jump.
  Game_Player.prototype._pfActionTarget = function () {
    for (const event of $gameMap.events()) {
      if (!event || event._trigger !== 0) continue;
      if (event.isThrough && event.isThrough()) continue;
      if (Math.abs(event.x - this.x) + Math.abs(event.y - this.y) <= 1) return event;
    }
    return null;
  };

  const _Character_updateAnimation = Game_Character.prototype.updateAnimation;
  Game_Player.prototype.updateAnimation = function () {
    if (!isPlatformMap()) { _Character_updateAnimation.call(this); return; }
    this._pfUpdateAnimation(this._pfBody);
  };

  Game_Player.prototype._pfUpdateAnimation = function (body) {
    if (_frozen || !body) { this._pattern = 1; this._animCounter = 0; return; }
    if (body.onLadder) { this._pattern = 1; return; }
    if (body.vx !== 0 && (body.onGround || body.inWater)) {
      this._animCounter++;
      const animSpeed = body.running ? RUN_ANIM_SPEED : ANIM_SPEED;
      if (this._animCounter >= animSpeed) {
        this._pattern = (this._pattern + 1) % 3;
        this._animCounter = 0;
      }
    } else {
      this._pattern = 1;
      this._animCounter = 0;
    }
  };

  const _GP_screenX = Game_Player.prototype.screenX;
  Game_Player.prototype.screenX = function () {
    if (isPlatformMap()) return Math.round(this.scrolledX() * $gameMap.tileWidth());
    return _GP_screenX.call(this);
  };

  const _GP_screenY = Game_Player.prototype.screenY;
  Game_Player.prototype.screenY = function () {
    if (isPlatformMap()) return Math.round(this.scrolledY() * $gameMap.tileHeight()) + SPRITE_OFFSET_Y;
    return _GP_screenY.call(this);
  };

  const _GP_isOnLadder = Game_Player.prototype.isOnLadder;
  Game_Player.prototype.isOnLadder = function () {
    if (isPlatformMap()) return isLadderAt(liveWorld, this._realX, this._realY);
    return _GP_isOnLadder.call(this);
  };

  Game_Player.prototype._pfCheckEventTrigger = function () {
    if ($gameMap.isEventRunning()) return;

    if (Input.isTriggered("ok")) {
      const target = this._pfActionTarget();
      if (target && !target._starting) target.start();
    }

    // Touch triggers fire on arrival, not every frame the body rests there.
    if (this._lastTriggerTileX !== this.x || this._lastTriggerTileY !== this.y) {
      this._lastTriggerTileX = this.x;
      this._lastTriggerTileY = this.y;
      for (const event of $gameMap.eventsXy(this.x, this.y)) {
        if (!event._starting && event._trigger !== 0 && event._trigger !== 4) event.start();
      }
    }
  };

  Game_Player.prototype._pfUpdateFollowers = function () {
    const followerData = this._followers._data;
    const partyCount = $gameParty._actors.length;

    for (let index = 0; index < followerData.length; index++) {
      const follower = followerData[index];
      const actorId = $gameParty._actors[index + 1];
      if (actorId) {
        const actor = $gameActors.actor(actorId);
        if (actor) {
          if (follower._characterName !== actor._characterName) follower._characterName = actor._characterName;
          if (follower._characterIndex !== actor._characterIndex) follower._characterIndex = actor._characterIndex;
        }
      } else if (follower._characterName !== "") {
        follower._characterName = "";
      }
    }

    if (partyCount <= 1) { _positionHistory = []; return; }

    _positionHistory.push({ x: this._realX, y: this._realY, dir: this.direction(), pattern: this._pattern });
    const maxHistory = FOLLOWER_DELAY * (partyCount - 1) + 1;
    while (_positionHistory.length > maxHistory) _positionHistory.shift();

    for (let idx = 0; idx < followerData.length; idx++) {
      if (!$gameParty._actors[idx + 1]) continue;
      const i = _positionHistory.length - 1 - FOLLOWER_DELAY * (idx + 1);
      if (i < 0) continue;
      const rec = _positionHistory[i];
      const follower = followerData[idx];
      follower._realX = rec.x;
      follower._realY = rec.y;
      follower._x = Math.round(rec.x);
      follower._y = Math.round(rec.y);
      follower._pattern = rec.pattern;
      follower.setDirection(rec.dir);
    }
  };

  Game_Player.prototype._pfUpdateCamera = function () {
    const targetX = this._realX - ($gameMap.screenTileX() - 1) / 2;
    const targetY = this._realY - ($gameMap.screenTileY() - 1) / 2;
    const ease = _cameraSnap ? 1 : CAMERA_SPEED;
    _cameraSnap = false;

    const newX = $gameMap._displayX + (targetX - $gameMap._displayX) * ease;
    const newY = $gameMap._displayY + (targetY - $gameMap._displayY) * ease;
    const maxX = Math.max(0, $dataMap.width - $gameMap.screenTileX());
    const maxY = Math.max(0, $dataMap.height - $gameMap.screenTileY());
    $gameMap.setDisplayPos(
      Math.max(0, Math.min(newX, maxX)),
      Math.max(0, Math.min(newY, maxY)));
  };

  // A remote body is placed from its packets, not walked; nothing else about
  // the event changes, and off a platform map it goes back to being ordinary.
  const _Game_Event_update = Game_Event.prototype.update;
  Game_Event.prototype.update = function () {
    if (this._pfRemote && isPlatformMap()) {
      stepRemoteBody(this);
      this.updateAnimation();
      return;
    }
    _Game_Event_update.call(this);
  };

  const _Game_Event_locate = Game_Event.prototype.locate;
  Game_Event.prototype.locate = function (x, y) {
    this._pfRemote = null;
    _Game_Event_locate.call(this, x, y);
  };
})();
