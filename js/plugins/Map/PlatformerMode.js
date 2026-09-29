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
 *   - Wall jump off either side while airborne; releasing OK early cuts a jump
 *   - Ladders: Up or Down grabs one, Shift climbs faster, OK hops off toward
 *     the direction held (Down+OK lets go). The top of a ladder is a floor you can stand on and walk over,
 *     and climbing past it steps you onto it instead of dropping you back.
 *   - Aerial recovery: a jump or a fall that ends on a ladder catches it, and
 *     holding Up or toward a ladder catches one within reach of the body
 *   - Water zones (region 99): swim with Up / OK, sink slowly otherwise
 *   - The body is an axis aligned box swept against the tiles, so it can never
 *     end up inside a solid tile or inside region 10, at any speed
 *   - Followers replay the leader's path a few frames behind
 *   - Every new tile counts as a step: footsteps, bush depth, damage floors,
 *     encounters, step counters and touch events all fire as on the grid
 *   - Movement routes forced on the player run on the grid as usual
 *   - Enemy events keep to the ground (flyers excepted), fall off ledges and
 *     obey regions 5 and 10
 *   - The tactical map battle mode stands down here: fights are turn based
 *   - Transfers freeze the body, resolve the landing spot out of any solid and
 *     snap the camera, so teleporting in and out never drops the party in a wall
 *   - Leaving the map: standing on a walkable border tile crosses as it always
 *     did, and holding a direction into the map edge, or into the fence painted
 *     along it, takes the grid step that <Worldmap>, the procedural edges, the
 *     stitched window and a dungeon exit all hang off
 *
 * Other systems:
 *   - window.PlatformerMode.isActive() is the one answer to "are we in the
 *     platformer". The autonomous NPC simulation (NPC/NPCSystem.js) asks it and
 *     stays out; AutoIdleExplorer asks it too.
 *   - Game_Player.isMoving() is false here. A platform body sits between tiles,
 *     so the engine's own test was true on nearly every frame, and everything
 *     that waits for the party to stand still waited forever: the menu, Escape
 *     and the parchment main menu among them.
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
  const CLIMB_SPEED    = P(6);
  const CLIMB_RUN      = P(9);
  const LADDER_HOP     = 0.85;     // a hop off a ladder, as a share of a jump
  const JUMP_CUT_SPEED = P(-7);    // rise left once OK is released mid jump
  const WALL_JUMP_LOCK = 8;        // frames a wall kick is not steered back

  // Water (region 99): heavy drag, a slow sink, and a stroke that beats it.
  const WATER_GRAVITY   = GRAVITY * 0.22;
  const WATER_MAX_FALL  = P(3);
  const WATER_MOVE      = P(2.6);
  const WATER_RUN       = P(3.8);
  const WATER_STROKE    = P(-4.5);
  const WATER_DRAG      = 0.86;
  const WATER_EXIT_JUMP = P(-11);

  // Aerial recovery: how far past the body's own edges a ladder is still in
  // reach when Up or the direction of the ladder is held, and how long a hop
  // off a ladder ignores the rungs it just left.
  const LADDER_REACH = 0.5;
  const LADDER_GROUND_REACH = 0.2;
  const LADDER_REGRAB_FRAMES = 10;

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

  // Leaving a map by pushing against its edge. The probe is the same hair the
  // wall tests use; the hold keeps a wall jump, which also means holding a
  // direction into a wall, from reading as a request to leave the map.
  const EDGE_PROBE = 0.06;
  const EDGE_PRESS_FRAMES = 12;

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

  function ladderTile(world, tx, ty) {
    return inBounds(world, tx, ty) && !!world.isLadder(tx, ty);
  }

  // The topmost rung of a ladder is a floor seen from above: it can be stood
  // on and walked across, and only Down (or climbing) goes through it.
  function isLadderTop(world, tx, ty) {
    return ladderTile(world, tx, ty) && !ladderTile(world, tx, ty - 1);
  }

  // The ladder column nearest the body whose rungs share its height, or null.
  // `reach` widens the body sideways, which is what lets a jump that lands a
  // little short of a ladder still catch it.
  function ladderColumnNear(world, x, y, reach) {
    const b = boxAt(x, y);
    const r = reach || 0;
    const ty1 = Math.floor(b.y1), ty2 = Math.floor(b.y2 - EPS);
    const tx1 = Math.floor(b.x1 - r), tx2 = Math.floor(b.x2 + r - EPS);
    let best = null;
    for (let tx = tx1; tx <= tx2; tx++) {
      for (let ty = ty1; ty <= ty2; ty++) {
        if (!ladderTile(world, tx, ty)) continue;
        if (best === null || Math.abs(tx - x) < Math.abs(best - x)) best = tx;
        break;
      }
    }
    return best;
  }

  // The ladder the feet are standing on the top of, or null.
  function ladderTopUnder(world, x, y) {
    const feet = y + 1;
    const ty = Math.round(feet);
    if (Math.abs(feet - ty) > 0.02) return null;
    const b = boxAt(x, y);
    let best = null;
    for (let tx = Math.floor(b.x1); tx <= Math.floor(b.x2 - EPS); tx++) {
      if (!isLadderTop(world, tx, ty)) continue;
      if (best === null || Math.abs(tx - x) < Math.abs(best - x)) best = tx;
    }
    return best;
  }

  function standingOnLadderTop(world, x, y) {
    return ladderTopUnder(world, x, y) !== null;
  }

  // Solid footing or a ladder top: what coyote time and jumping count as ground.
  function standing(world, x, y) {
    return onGround(world, x, y) || standingOnLadderTop(world, x, y);
  }

  // The first ladder top the feet crossed on the way down this frame, or null.
  function ladderTopCrossed(world, x, prevY, y) {
    const from = prevY + 1, to = y + 1;
    if (to <= from) return null;
    const b = boxAt(x, y);
    for (let ty = Math.ceil(from - 0.02); ty < to; ty++) {
      for (let tx = Math.floor(b.x1); tx <= Math.floor(b.x2 - EPS); tx++) {
        if (isLadderTop(world, tx, ty)) return ty;
      }
    }
    return null;
  }

  // Which way is a body pushing when it cannot go that way? On the grid a
  // refused step is a whole failed move and every map exit hangs off it; here
  // the body is simply flush against something and no step is ever taken, so
  // the intent has to be read off the buttons and the geometry instead.
  function pressedBlockedDirection(world, body, input) {
    const i = input || {};
    if (i.left && !i.right && collides(world, body.x - EDGE_PROBE, body.y)) return 4;
    if (i.right && !i.left && collides(world, body.x + EDGE_PROBE, body.y)) return 6;
    if (i.up && !i.down && collides(world, body.x, body.y - EDGE_PROBE)) return 8;
    if (i.down && !i.up && collides(world, body.x, body.y + EDGE_PROBE)) return 2;
    return 0;
  }

  function newBody(x, y) {
    return {
      x: x, y: y, vx: 0, vy: 0,
      onGround: false, inWater: false, onLadder: false, climbing: false,
      jumping: false, running: false,
      coyote: 0, buffer: 0, direction: 2, regrab: 0, wallLock: 0,
    };
  }

  // Take hold of the ladder in column `tx`: stop dead and line up on the rungs,
  // without ever sliding through a wall to get there.
  function grabLadder(world, body, tx) {
    body.climbing = true;
    body.jumping = false;
    body.vx = 0;
    body.vy = 0;
    body.coyote = 0;
    body.wallLock = 0;
    moveAxis(world, body, tx - body.x, "x");
    // The substeps leave float dust; settle exactly on the column when free.
    if (Math.abs(body.x - tx) < 1e-6 && !collides(world, tx, body.y)) body.x = tx;
  }

  // Which ladder, if any, this frame's input and position take hold of.
  function ladderToGrab(world, body, i, grounded) {
    if (body.climbing || body.regrab > 0) return null;
    const up = i.up && !i.down, down = i.down && !i.up;
    if (up) return ladderColumnNear(world, body.x, body.y, grounded ? LADDER_GROUND_REACH : LADDER_REACH);
    if (down) return grounded ? ladderTopUnder(world, body.x, body.y) : null;
    if (grounded || body.vy < 0) return null;
    // Aerial recovery: a jump or a fall that ends on a ladder catches it, and
    // one that ends just short of it does too while the ladder's way is held.
    // Holding away from it, or Down, lets the body drop past.
    const tx = ladderColumnNear(world, body.x, body.y, LADDER_REACH);
    if (tx === null) return null;
    const toward = tx > body.x ? i.right && !i.left : tx < body.x ? i.left && !i.right : false;
    const away = tx > body.x ? i.left && !i.right : tx < body.x ? i.right && !i.left : false;
    if (away) return null;
    if (toward) return tx;
    return ladderColumnNear(world, body.x, body.y, 0) === tx ? tx : null;
  }

  // One frame of simulation for any body: the player, Player 2, anything else
  // that wants the same feel. `input` is a plain record so the caller decides
  // where the buttons came from (keyboard, pad, split screen, replay).
  // `jumpHeld` is optional: left out, every jump runs its full height.
  function stepBody(world, body, input) {
    const i = input || {};
    if (body.regrab === undefined) body.regrab = 0;
    if (body.wallLock === undefined) body.wallLock = 0;
    body.inWater = isInWater(world, body.x, body.y);
    body.running = !!i.run;
    if (body.regrab > 0) body.regrab--;
    if (body.wallLock > 0) body.wallLock--;

    if (i.jump) body.buffer = JUMP_BUFFER;
    else if (body.buffer > 0) body.buffer--;

    const grounded = !body.climbing && standing(world, body.x, body.y);
    const up = i.up && !i.down, down = i.down && !i.up;
    const left = i.left && !i.right, right = i.right && !i.left;

    const grab = ladderToGrab(world, body, i, grounded);
    if (grab !== null) grabLadder(world, body, grab);

    if (body.climbing) {
      // --- on a ladder --------------------------------------------------------
      const climb = body.running ? CLIMB_RUN : CLIMB_SPEED;
      body.vy = up ? -climb : down ? climb : 0;
      // No sideways drift: the direction held to reach a ladder would carry
      // the body straight off its far side. Left or Right only turns, and
      // with OK picks the side to hop off to.
      body.vx = 0;
      if (up) body.direction = 8;
      else if (down) body.direction = 2;
      else if (left) body.direction = 4;
      else if (right) body.direction = 6;
      if (body.buffer > 0) {
        // OK hops off; Down with it just lets go.
        body.climbing = false;
        body.buffer = 0;
        body.regrab = LADDER_REGRAB_FRAMES;
        if (down) {
          body.vy = 0;
        } else {
          body.vy = JUMP_SPEED * LADDER_HOP;
          body.jumping = true;
        }
        const speed = body.running ? RUN_SPEED : MOVE_SPEED;
        body.vx = left ? -speed : right ? speed : 0;
      }
    } else {
      // --- horizontal intent -------------------------------------------------
      let speed;
      if (body.inWater) speed = body.running ? WATER_RUN : WATER_MOVE;
      else speed = body.running ? RUN_SPEED : MOVE_SPEED;

      if (body.wallLock > 0) { /* the wall kick carries the body for a moment */ }
      else if (left) { body.vx = -speed; body.direction = 4; }
      else if (right) { body.vx = speed; body.direction = 6; }
      else if (body.inWater) body.vx *= WATER_DRAG;
      else body.vx = 0;

      // --- vertical intent ---------------------------------------------------
      if (body.inWater) {
        const surfacing = !isHeadUnderwater(world, body.x, body.y);
        if (i.up || body.buffer > 0) {
          // Breaking the surface with a stroke launches out of the water rather
          // than bobbing against the ceiling of it.
          body.vy = (surfacing && body.buffer > 0) ? WATER_EXIT_JUMP : WATER_STROKE;
          body.buffer = 0;
        } else {
          body.vy = Math.min(body.vy * WATER_DRAG + WATER_GRAVITY, WATER_MAX_FALL);
        }
        // Water is not ground: leaving it must not hand out a second jump.
        body.jumping = false;
        body.coyote = 0;
      } else {
        if (grounded) body.coyote = COYOTE_FRAMES;
        else if (body.coyote > 0) body.coyote--;

        if (body.buffer > 0 && body.coyote > 0) {
          body.vy = JUMP_SPEED;
          body.jumping = true;
          body.buffer = 0;
          body.coyote = 0;
        } else if (body.buffer > 0 && !grounded) {
          const wallLeft = touchingLeftWall(world, body.x, body.y);
          const wallRight = touchingRightWall(world, body.x, body.y);
          if (wallLeft || wallRight) {
            const boost = body.running ? WALL_JUMP_X * 1.5 : WALL_JUMP_X;
            body.vy = WALL_JUMP_Y;
            body.vx = wallLeft ? boost : -boost;
            body.direction = wallLeft ? 6 : 4;
            body.jumping = true;
            body.buffer = 0;
            body.wallLock = WALL_JUMP_LOCK;
          }
        }
        // Letting go of OK on the way up cuts the jump short.
        if (i.jumpHeld === false && body.jumping && body.vy < JUMP_CUT_SPEED) body.vy = JUMP_CUT_SPEED;
        body.vy = Math.min(body.vy + GRAVITY, MAX_FALL_SPEED);
      }
    }

    // --- integrate -----------------------------------------------------------
    const prevY = body.y;
    const dy = body.vy;
    if (moveAxis(world, body, body.vx, "x")) { body.vx = 0; body.wallLock = 0; }
    const hitY = moveAxis(world, body, body.vy, "y");
    if (hitY) {
      if (body.vy > 0) body.jumping = false;
      body.vy = 0;
    }

    if (body.climbing) {
      if (hitY && dy > 0) {
        // Climbed down onto the floor: stand on it.
        body.climbing = false;
      } else if (ladderColumnNear(world, body.x, body.y, 0) === null) {
        body.climbing = false;
        if (dy < 0) {
          // Climbed past the top rung: step onto it rather than drop back.
          const ty = Math.ceil(body.y + 1 - EPS);
          const tx = Math.round(body.x);
          if (isLadderTop(world, tx, ty) && !collides(world, body.x, ty - 1)) body.y = ty - 1;
          body.vy = 0;
        }
      }
    } else if (dy > 0 && !down) {
      // One way ladder tops catch a falling body, unless Down drops through.
      const ty = ladderTopCrossed(world, body.x, prevY, body.y);
      if (ty !== null && !collides(world, body.x, ty - 1)) {
        body.y = ty - 1;
        body.vy = 0;
        body.jumping = false;
      }
    }

    // A body can only be inside geometry here if the map changed under it.
    if (collides(world, body.x, body.y)) {
      const free = unstick(world, body.x, body.y);
      body.x = free.x;
      body.y = free.y;
      body.vx = 0;
      body.vy = 0;
    }

    body.onLadder = body.climbing || isLadderAt(world, body.x, body.y);
    body.onGround = body.climbing || body.inWater || standing(world, body.x, body.y);
    if (body.onGround && body.vy >= 0) body.jumping = false;
    return body;
  }

  // ---------------------------------------------------------------------------
  // Map events on a platform map. They still walk the grid, but the grid has
  // to agree with the physics: region 10 walls them off, region 5 lets them
  // through, and anything that walks (every enemy that is not a flyer) keeps
  // its feet on something and falls when it walks off an edge.
  // ---------------------------------------------------------------------------
  function hasFooting(world, tx, ty) {
    return tileSolid(world, tx, ty + 1) || isLadderTop(world, tx, ty + 1) ||
           ladderTile(world, tx, ty) || tileWater(world, tx, ty);
  }

  function eventCanStep(world, x, y, d, walker) {
    const x2 = x + (d === 6 ? 1 : d === 4 ? -1 : 0);
    const y2 = y + (d === 2 ? 1 : d === 8 ? -1 : 0);
    if (tileSolid(world, x2, y2)) return false;
    if (!walker) return true;
    if (d === 8) return ladderTile(world, x, y) || ladderTile(world, x2, y2) || tileWater(world, x2, y2);
    if (d === 2) return ladderTile(world, x2, y2) || tileWater(world, x2, y2);
    return hasFooting(world, x2, y2);
  }

  function eventShouldFall(world, x, y) {
    return inBounds(world, x, y + 1) && !hasFooting(world, x, y);
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
    pressedBlockedDirection: pressedBlockedDirection,
    EDGE_PRESS_FRAMES: EDGE_PRESS_FRAMES,
    CLIMB_SPEED: CLIMB_SPEED, CLIMB_RUN: CLIMB_RUN,
    LADDER_REACH: LADDER_REACH, LADDER_REGRAB_FRAMES: LADDER_REGRAB_FRAMES,
    JUMP_CUT_SPEED: JUMP_CUT_SPEED, WALL_JUMP_LOCK: WALL_JUMP_LOCK,
    isLadderTop: isLadderTop, ladderColumnNear: ladderColumnNear,
    standingOnLadderTop: standingOnLadderTop, standing: standing,
    hasFooting: hasFooting, eventCanStep: eventCanStep, eventShouldFall: eventShouldFall,
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

  // Read the character back into the body. The facing comes too, so an event
  // that turns the player (a transfer, a move route, a Set Direction) is not
  // undone on the next frame by the body's own idea of where it faces.
  function syncBodyFrom(character, body) {
    body.x = character._realX;
    body.y = character._realY;
    if (character.direction) body.direction = character.direction();
  }

  // Put a character somewhere legal on this map. Used by every way into a
  // platform map. An arrival (transfer, locate) names a tile, so it is snapped
  // to it and stopped dead; a return from a menu or a battle is the same body
  // coming back, so it keeps its sub tile position and its momentum.
  function placeSafely(character, body, arrival) {
    const isArrival = arrival !== false;
    const spot = isArrival
      ? resolveSpawn(liveWorld, character._realX, character._realY)
      : unstick(liveWorld, character._realX, character._realY);
    character._realX = spot.x;
    character._realY = spot.y;
    character._x = Math.round(spot.x);
    character._y = Math.round(spot.y);
    if (body) {
      body.x = spot.x; body.y = spot.y;
      if (character.direction) body.direction = character.direction();
      if (isArrival) {
        body.vx = 0; body.vy = 0;
        body.jumping = false; body.climbing = false;
        body.coyote = 0; body.buffer = 0; body.regrab = 0; body.wallLock = 0;
      }
    }
    if (character === (typeof $gamePlayer !== "undefined" ? $gamePlayer : null)) {
      character._pfEdgeDir = 0;
      character._pfEdgeFrames = 0;
      if (isArrival) {
        // The landing tile is where the party already is, not somewhere it
        // just walked onto: a transfer event under the arrival spot must not
        // fire and bounce the party straight back, and no step is counted.
        character._lastTriggerTileX = character._lastStepTileX = character._x;
        character._lastTriggerTileY = character._lastStepTileY = character._y;
      }
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
    // Up climbs ladders, so the jump is the action button, as it is for P1.
    const jump = !!(manager && manager.isTriggered && manager.isTriggered("action"));
    const input = held ? {} : {
      left: !!p2.left,
      right: !!p2.right,
      up: !!p2.up,
      down: !!p2.down,
      run: !!p2.dash,
      jump: jump,
      jumpHeld: !!p2.action,
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
      // Scene_Map reloads the map file on every rebuild, the menu and a battle
      // included. Only a real transfer loses momentum and the followers' trail.
      const player = typeof $gamePlayer !== "undefined" ? $gamePlayer : null;
      if (player && !player.isTransferring()) return;
      _positionHistory = [];
      if (player && player._pfBody) {
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
      const arrival = !!this._transfer;
      placeSafely($gamePlayer, playerBody(), arrival);
      for (const follower of $gamePlayer._followers._data) {
        if (arrival || !_positionHistory.length) {
          follower._realX = $gamePlayer._realX;
          follower._realY = $gamePlayer._realY;
          follower._x = $gamePlayer._x;
          follower._y = $gamePlayer._y;
        }
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
      placeSafely($gamePlayer, playerBody(), !!this._transfer);
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
    this._pfEdgeDir = 0;
    this._pfEdgeFrames = 0;
  };

  // A grid step takes several frames, and every system that waits for the party
  // to stand still asks isMoving() about it: Scene_Map.updateCallMenu holds the
  // menu (and with it the whole parchment main menu, and Escape) until the step
  // finishes, and Game_Player.tryBorderReturn refuses to cross a map edge
  // mid step. The platformer has no step: the body lives between tiles, so
  // _realX almost never equals _x and the engine's test answered "moving" on
  // nearly every frame, which is why neither could ever fire. Nothing here is
  // ever in the middle of a move, so say so.
  // A forced move route (Set Movement Route on the player, a jump command) is
  // a grid walk, and runs as one: the engine's own answer holds for it.
  const _GP_isMoving = Game_Player.prototype.isMoving;
  Game_Player.prototype.isMoving = function () {
    if (isPlatformMap() && !this._pfGridDriven()) return false;
    return _GP_isMoving.call(this);
  };

  Game_Player.prototype._pfGridDriven = function () {
    return !!(this.isMoveRouteForcing() || this.isJumping());
  };

  const _GP_update = Game_Player.prototype.update;
  Game_Player.prototype.update = function (sceneActive) {
    if (isPlatformMap()) this._pfUpdate(sceneActive);
    else _GP_update.call(this, sceneActive);
  };

  Game_Player.prototype._pfUpdate = function (sceneActive) {
    const body = playerBody();

    // A move route owns the party: let the grid walk it, with its followers,
    // and pick the body up where the route leaves it. Skipping this left every
    // "wait for completion" route on the player waiting forever.
    if (!_frozen && this._pfGridDriven()) {
      _GP_update.call(this, sceneActive);
      syncBodyFrom(this, body);
      body.vx = 0; body.vy = 0; body.jumping = false; body.climbing = false;
      _positionHistory = [];
      return;
    }

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
      // The Always Dash option and a map's "disable dashing" both count here.
      run: this.isDashButtonPressed() && !$gameMap.isDashDisabled(),
      jump: Input.isTriggered("ok") && !this._pfActionTarget(),
      jumpHeld: Input.isPressed("ok"),
    };

    stepBody(liveWorld, body, input);
    applyBody(this, body);
    this._dashing = body.running && body.vx !== 0;

    this._pfUpdateAnimation(body);
    this._pfUpdateFollowers();
    this._pfUpdateCamera();
    if (!held) {
      this._pfCheckEventTrigger();
      this._pfCheckEdgeTransfer(body, input);
    } else {
      this._pfEdgeDir = 0;
      this._pfEdgeFrames = 0;
    }

    // Game_Player.update (bypassed here) normally runs the per step processing:
    // increaseSteps (step count, bush depth, and everything other plugins hang
    // off a step), $gameParty.onPlayerWalk() (damage floors, slip damage) and
    // encounter stepping. Keep all of it, fired once per new tile.
    if (!$gameMap.isEventRunning() &&
        (this._lastStepTileX !== this._x || this._lastStepTileY !== this._y)) {
      if (this._lastStepTileX !== undefined) {
        this.increaseSteps();
        $gameParty.onPlayerWalk();
        this.updateEncounterCount();
      } else {
        this.refreshBushDepth();
      }
      this._lastStepTileX = this._x;
      this._lastStepTileY = this._y;
    }

    this.setMovementSuccess(true);
  };

  // The event the action button would talk to, if any. Only an action button
  // event with something to say counts, so a map full of decoration, touch
  // triggers and parallel processes does not cost the party its jump.
  Game_Player.prototype._pfActionTarget = function () {
    for (const event of $gameMap.events()) {
      if (!event || !event.isTriggerIn([0]) || !event.page()) continue;
      if (event.isThrough && event.isThrough()) continue;
      const list = event.list();
      if (!list || list.length <= 1) continue;
      if (Math.abs(event.x - this.x) + Math.abs(event.y - this.y) <= 1) return event;
    }
    return null;
  };

  const _Character_updateAnimation = Game_Character.prototype.updateAnimation;
  Game_Player.prototype.updateAnimation = function () {
    if (!isPlatformMap() || this._pfGridDriven()) { _Character_updateAnimation.call(this); return; }
    this._pfUpdateAnimation(this._pfBody);
  };

  // Walking frames advance through the engine's own updatePattern, so the walk
  // cycle is the usual 0 1 2 1 and footstep sounds (Audio/ToshA_Footsteps.js,
  // which reads the terrain tag and region under the feet) fire on the frames
  // they are set to. _pfStepping tells them a step is happening, since
  // isMoving() is false here.
  Game_Player.prototype._pfUpdateAnimation = function (body) {
    if (_frozen || !body) { this._pattern = 1; this._animCounter = 0; return; }
    let stepping = false, speed = ANIM_SPEED, audible = false;
    if (body.climbing) {
      stepping = body.vy !== 0 || body.vx !== 0;
    } else if (body.vx !== 0 && (body.onGround || body.inWater)) {
      stepping = true;
      audible = !body.inWater;
      speed = body.running ? RUN_ANIM_SPEED : ANIM_SPEED;
    }
    if (!stepping) {
      this._pattern = 1;
      this._animCounter = 0;
      return;
    }
    if (++this._animCounter < speed) return;
    this._animCounter = 0;
    this._stopCount = 0;
    this._pfStepping = audible;
    try {
      this.updatePattern();
    } finally {
      this._pfStepping = false;
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
    if (isPlatformMap()) return !!(this._pfBody && this._pfBody.climbing);
    return _GP_isOnLadder.call(this);
  };

  // Touch events go through the engine's own entry points, so every plugin
  // hook on them (the battle initiation block, vehicle hits and the rest) sees
  // a platform touch exactly as it sees a grid one.
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
      // Below or above characters: the "here" check. Same as characters: the
      // body passes through them, so reaching their tile is the bump.
      this.checkEventTriggerHere([1, 2]);
      if (!$gameMap.isEventRunning() && !$gameMap.isAnyEventStarting()) {
        this.checkEventTriggerTouch(this.x, this.y);
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Leaving a platform map
  // ---------------------------------------------------------------------------
  // Every way out of a map that is not a Transfer event hangs off the grid step:
  // Game_Player.moveStraight is where Map/WorldMapReturn.js reads the map's
  // <Worldmap N S E W> tag, where a procedural map's edge schedules the next
  // biome, where the stitched window grows and where a dungeon session finds its
  // exit. The platformer never calls moveStraight, so on a <Platform> map all of
  // that was unreachable and the only way off the map was a Transfer event.
  //
  // Standing ON a walkable border tile is already handled: the tile changes, and
  // WorldMapReturn's own update hook (which wraps this one) runs
  // checkBorderTeleport. What is left is the intent that never becomes a tile,
  // which is pushing against an edge, or against the fence painted along it, and
  // that is what this reads: a direction held into something the body cannot
  // pass, long enough that a wall jump does not count as asking to leave.
  Game_Player.prototype._pfCheckEdgeTransfer = function (body, input) {
    const direction = (body.onGround || body.onLadder || body.inWater)
      ? pressedBlockedDirection(liveWorld, body, input) : 0;

    if (!direction || direction !== this._pfEdgeDir) {
      this._pfEdgeDir = direction;
      this._pfEdgeFrames = 0;
      if (!direction) return;
    }
    if (++this._pfEdgeFrames < EDGE_PRESS_FRAMES) return;
    this._pfEdgeFrames = 0;

    if (this.isTransferring() || $gameMap.isEventRunning() || $gameMessage.isBusy()) return;

    const step = { 2: [0, 1], 4: [-1, 0], 6: [1, 0], 8: [0, -1] }[direction];
    const facing = this.direction();

    if (!$gameMap.isValid(this.x + step[0], this.y + step[1])) {
      // The next tile is off the map, so the grid step cannot possibly move the
      // party anywhere: canPass refuses it and moveStraight only reports the
      // refusal. That makes it safe to take the whole grid path here, and the
      // grid path is what every kind of map transition is wired into.
      this.moveStraight(direction);
    } else if (this.tryBorderReturn) {
      // Still on the map, but nothing except fence between here and the edge.
      // tryBorderReturn asks the map whether that counts as a crossing.
      this.tryBorderReturn(direction);
    }

    // moveStraight and tryBorderReturn both turn the party to face the step.
    // Up and down are climb controls here, not a way to face, so hand the
    // sprite back the direction the body is actually in.
    if (!this.isTransferring() && (direction === 2 || direction === 8)) {
      this.setDirection(facing);
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
    // A Scroll Map command owns the camera until it finishes.
    if ($gameMap.isScrolling && $gameMap.isScrolling()) return;
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
    if (isPlatformMap()) this._pfUpdateFall();
  };

  // ---------------------------------------------------------------------------
  // Enemy events on a platform map
  // ---------------------------------------------------------------------------
  // The encounter spawner and the map author both place monsters on any
  // walkable tile, and on a side view map most walkable tiles are air. A
  // monster that walks (anything but a flyer) keeps to the floors, climbs only
  // ladders and water, and drops when it steps off an edge. Touching the party
  // still starts the fight through the usual event touch.
  function isMonsterEvent(event) {
    const data = event.event && event.event();
    return !!(event._fixedTroopId > 0 || (data && data.name === "Enemy")); // i18n-ignore: event name
  }

  function isFlyingMonster(event) {
    const bse = window.BattleSystemEnhanced;
    const helpers = bse && bse.Helpers;
    if (!helpers || !helpers.getFlyingArchetype || !helpers.getEnemyArchetype) return false;
    const troop = event._fixedTroopId > 0 && typeof $dataTroops !== "undefined" ? $dataTroops[event._fixedTroopId] : null;
    const member = troop && troop.members && troop.members[0];
    const enemy = member && typeof $dataEnemies !== "undefined" ? $dataEnemies[member.enemyId] : null;
    return !!(enemy && helpers.getFlyingArchetype(helpers.getEnemyArchetype(enemy)));
  }

  Game_Event.prototype._pfIsWalker = function () {
    if (this._pfWalker === undefined || this._pfWalkerTroop !== this._fixedTroopId) {
      this._pfWalkerTroop = this._fixedTroopId;
      this._pfWalker = isMonsterEvent(this) && !isFlyingMonster(this);
    }
    return this._pfWalker;
  };

  const _Game_Event_canPass = Game_Event.prototype.canPass;
  Game_Event.prototype.canPass = function (x, y, d) {
    if (!isPlatformMap() || this.isThrough() || this._pfRemote) return _Game_Event_canPass.call(this, x, y, d);
    const x2 = $gameMap.roundXWithDirection(x, d);
    const y2 = $gameMap.roundYWithDirection(y, d);
    if (!$gameMap.isValid(x2, y2)) return false;
    if (!eventCanStep(liveWorld, x, y, d, this._pfIsWalker())) return false;
    // Region 5 is open whatever the tile says, for events as for the party.
    if (liveWorld.regionId(x2, y2) === REGION_PASS) return !this.isCollidedWithCharacters(x2, y2);
    return _Game_Event_canPass.call(this, x, y, d);
  };

  Game_Event.prototype._pfUpdateFall = function () {
    if (this._erased || this.isThrough() || this.isMoving() || this.isJumping()) return;
    if (!this._pfIsWalker()) return;
    if (!eventShouldFall(liveWorld, this._x, this._y)) return;
    this._y += 1;   // updateMove eases the sprite down to it
  };

  const _Game_Event_locate = Game_Event.prototype.locate;
  Game_Event.prototype.locate = function (x, y) {
    this._pfRemote = null;
    _Game_Event_locate.call(this, x, y);
  };
})();
