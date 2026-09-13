/*:
 * @target MZ
 * @plugindesc GalaxySim Ship Background - Renders the live 3D galaxy view behind any map tagged <Biome: Space> and scrolls it during travel.
 * @author Nocoldiz + Omni-Lex
 * @url
 * @help
 * ============================================================================
 * GalaxySim Ship Background
 * ============================================================================
 * Draws a live 3D space backdrop behind the ship interior so that what you see
 * through the windows matches where the starship actually is in the galaxy.
 *
 *   - On any map tagged <Biome: Space> (e.g. the low-orbit spaceship, map 721)
 *     the background reflects the ship's current location:
 *       * If the ship is orbiting a planet, that planet is rendered in 3D.
 *       * Otherwise the current system's star is rendered in 3D.
 *   - When a travel is started from the galaxy map, the background starfield
 *     streaks and scrolls to follow the ship's motion until it arrives.
 *
 * LOAD ORDER: after GalaxySim_Core.js (it relies on the GalaxySim namespace,
 * the shared 3D renderer, the data manager and the infinite-fuel helper).
 * ============================================================================
 */

(() => {
  "use strict";

  // Maps that should show the live ship background declare it via the same
  // <Biome: Space> note tag WeatherSystem/WorldMapReturn/etc. already read.
  function isSpaceBiomeMap() {
    return !!($dataMap && $dataMap.note && /<Biome:\s*Space\s*>/i.test($dataMap.note));
  }

  // Planet the ship starts orbiting the very first time the player boards it.
  const HOME_SYSTEM = "Sol";  // i18n-ignore  system id
  const HOME_PLANET = "Earth";  // i18n-ignore  planet id

  // Infinite-fuel check lives in GalaxySim_Core; fall back to false if absent.
  function isInfiniteFuel() {
    return !!(window.GalaxySim && typeof window.GalaxySim.isInfiniteFuel === "function" &&
      window.GalaxySim.isInfiniteFuel());
  }

  // ==========================================================================
  // First-visit setup: park the ship in orbit around Earth.
  // New games get this from the data manager itself (parkAtHomeOrbit), so this
  // only ever fires for saves made before that default existed. Runs once ever
  // (guarded by a persistent flag) so that returning to Sol later without a
  // planet still shows the star rather than forcing Earth.
  // ==========================================================================
  function ensureInitialEarthOrbit() {
    try {
      if (!$gameSystem || $gameSystem._shipOrbitEarthInit) return;
      if (!window.GalaxySim || typeof window.GalaxySim.getDataManager !== "function") return;

      const dm = window.GalaxySim.getDataManager();
      const ship = dm && dm.playerShip;
      if (!ship) return;

      // Only seed the orbit when the ship is still in its untouched default
      // state (parked at Sol, orbiting nothing, never travelled). A deliberate
      // park at the Sun itself (parkedBody) counts as touched.
      if (ship.isMoving || ship.currentPlanet || ship.parkedBody ||
        ship.currentSystem !== HOME_SYSTEM) {
        $gameSystem._shipOrbitEarthInit = true;
        return;
      }

      const system = dm.getSystem(HOME_SYSTEM);
      const earth = system && (system.planets || []).find((p) => p.name === HOME_PLANET);
      if (earth) {
        ship.currentPlanet = HOME_PLANET;
        $gameSystem._shipOrbitEarthInit = true;
      }
    } catch (e) {
      /* state not ready */
    }
  }

  // ==========================================================================
  // Deterministic starfield
  // ==========================================================================
  const STAR_COUNT = 220;
  let _stars = null;

  function buildStars() {
    // Seeded LCG so the field is stable between frames/saves.
    let seed = 1337;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const stars = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x: rnd(),
        y: rnd(),
        // depth drives both size and parallax speed (closer = faster/bigger)
        depth: 0.25 + rnd() * 0.75,
        twinkle: rnd() * Math.PI * 2,
      });
    }
    return stars;
  }

  // renderer.renderPlanet/renderStar spin the body as `rotation.y = time *
  // rate (+ phase)`, so a random start angle is rolled once per arrival (see
  // the `stateChanged` block below, `_shipBgSpinAngle`) and mapped onto each
  // renderer's own rate to give a genuinely random initial facing instead of
  // always the same one. ORBIT_SPIN_RATE then turns an orbited planet's
  // rotation slowly over time on top of that, so it drifts the way the
  // ship's own orbit would carry it rather than spinning live at the
  // renderer's normal 0.12 rad/s, which would read as absurdly fast this
  // close.
  const PLANET_SPIN_RATE = 0.12;
  const STAR_SPIN_RATE = 0.05;

  // Full revolution roughly every 10-11 minutes: slow enough to read as an
  // orbit rather than the planet itself spinning.
  const ORBIT_SPIN_RATE = 0.01;

  function getStars() {
    if (!_stars) _stars = buildStars();
    return _stars;
  }

  // ==========================================================================
  // Which body the windows actually look out on
  // ==========================================================================
  // The ship can be parked at any star of an N-ary system, at a black hole or
  // at an exotic remnant, and each of those has its own 3D model. Resolve the
  // exact record so the backdrop shows THAT object rather than the system's
  // nominal primary.
  function shipStarRecord(dm, ship) {
    const parked = ship.parkedBody;
    if (parked && parked.name && dm.getStarInSystem) {
      const rec = dm.getStarInSystem(parked.system || ship.currentSystem, parked.name);
      if (rec) return rec;
    }
    return dm.getSystem(ship.currentSystem);
  }

  function isBlackHoleRecord(rec) {
    if (!rec) return false;
    return !!rec.blackHoleType || rec.type === "BLACK_HOLE" ||
      rec.type === "SUPERMASSIVE_BLACK_HOLE";
  }

  // On-screen radius of the BODY itself. An ordinary star is drawn at the
  // window's usual size; anything whose model reaches far past its own
  // surface (a hole's accretion disk runs out to four horizon radii, a
  // Gargantua's to nine) is sized down so the whole object fits the frame -
  // and so the offscreen render is not blown up past its own resolution.
  const BODY_R = 0.22;      // plain star, as a fraction of the screen height
  const BODY_FRAME = 0.82;  // how much of the screen the whole model may fill
  function bodyScreenRadius(rec, h) {
    const renderer = window.GalaxySim && window.GalaxySim.Renderer3D;
    const half = renderer && renderer.systemBodyHalf ? renderer.systemBodyHalf(rec) : null;
    if (!half) return h * (isBlackHoleRecord(rec) ? 0.09 : BODY_R);
    return Math.min(h * BODY_R, (h * BODY_FRAME) / (2 * half));
  }

  // ==========================================================================
  // Spriteset_Map integration
  // ==========================================================================
  // A spriteset is thrown away and rebuilt every time the map scene is
  // rebuilt, which the main menu does on the way in and back out. The
  // animation clock, the starfield scroll, the approach ease, the depicted
  // state key and the rolled spin angle all describe the SESSION's view out of
  // the window, not this particular spriteset, so they live on a module level
  // store: without it every menu round trip reset the clock to zero (stars
  // jumped back to their start) and rolled a brand new random facing (the
  // planet visibly span).
  const _bgState = {
    _shipBgTime: 0,
    _shipBgScroll: 0,
    _shipBgFrame: 0,
    _shipBgApproachRaw: 0,
    _shipBgApproach: 0,
    _shipBgStateKey: null,
    _shipBgSpinAngle: null,
  };
  Object.keys(_bgState).forEach(function (key) {
    Object.defineProperty(Spriteset_Map.prototype, key, {
      get: function () { return _bgState[key]; },
      set: function (v) { _bgState[key] = v; },
      configurable: true,
    });
  });

  const _createParallax = Spriteset_Map.prototype.createParallax;
  Spriteset_Map.prototype.createParallax = function () {
    _createParallax.call(this);
    if ($gameMap && isSpaceBiomeMap()) {
      ensureInitialEarthOrbit();
      this._shipBgSprite = new Sprite();
      this._shipBgSprite.bitmap = new Bitmap(Graphics.width, Graphics.height);
      // Added after the static parallax but before the tilemap, so it sits
      // behind the ship walls and shows through the windows.
      this._baseSprite.addChild(this._shipBgSprite);
    }
  };

  const _update = Spriteset_Map.prototype.update;
  Spriteset_Map.prototype.update = function () {
    _update.call(this);
    this.updateShipBackground();
  };

  Spriteset_Map.prototype.updateShipBackground = function () {
    const sprite = this._shipBgSprite;
    if (!sprite || !sprite.bitmap) return;
    if (!window.GalaxySim || typeof window.GalaxySim.getDataManager !== "function") return;

    const dm = window.GalaxySim.getDataManager();
    const ship = dm && dm.playerShip;
    if (!ship) return;

    // Advance travel/arrival while walking the ship when fuel is unlimited
    // (avoids the per-frame fuel over-drain for normal play; travel for those
    // players continues to be resolved from the galaxy map scene).
    if (isInfiniteFuel() && ship.isMoving && typeof dm.updateShipPosition === "function") {
      dm.updateShipPosition();
    }

    // Refuelling keeps running while the player walks the ship, so a refuel
    // engaged from inside (the Refuel plugin command) doesn't stall the moment
    // the star map is closed.
    if (ship.isRefueling && typeof dm.tickRefuel === "function") dm.tickRefuel(1 / 60);
    // The same goes for an open Schrodingerite flyby.
    if (ship.harvestRun && typeof dm.tickSchrodingeriteHarvest === "function") {
      dm.tickSchrodingeriteHarvest(1 / 60);
    }

    // How far the ship has drawn in toward the body it is drinking from: the
    // star map flies the hull closer, and from inside the ship that reads as
    // the body swelling in the window. Eased over the same 8 seconds.
    const drawing = !ship.isMoving && (ship.isRefueling || !!ship.harvestRun);
    const step = (1 / 60) / 8;
    this._shipBgApproachRaw = Math.max(0, Math.min(1,
      (this._shipBgApproachRaw || 0) + (drawing ? step : -step)));
    const ar = this._shipBgApproachRaw;
    this._shipBgApproach = ar * ar * (3 - 2 * ar);

    const dt = 1 / 60;
    this._shipBgTime += dt;
    const moving = !!ship.isMoving;
    const speedMul = moving ? Math.max(1, $gameVariables.value(94) || 1) : 0;
    // Scroll fast while travelling, gentle drift while parked/orbiting.
    this._shipBgScroll += dt * (moving ? 0.18 * speedMul : 0.01);

    // The window is repainted EVERY frame. It used to be throttled (every 2nd
    // or 3rd frame, with the celestial body itself re-rendered at 2 Hz into a
    // cached canvas), which is a hardcoded stutter in the one view the player
    // looks straight out of: the starfield stepped, the body's own animation
    // ticked in visible jumps and an approach swelled in stages. Nothing here
    // is throttled any more.
    const speed = Math.max(1, (typeof $gameVariables !== "undefined" && $gameVariables.value(94)) || 1);
    const isPsychedelic = moving && speed > 10;
    const stateKey = (moving ? "M" : "P") + "|" +
      (isPsychedelic ? ("PSY" + speed) : "NORM") + "|" +
      (ship.currentPlanet || "") + "|" + (ship.currentSystem || "") + "|" +
      // Parking at a companion star, a hole or a remnant changes which model
      // the window shows, so it belongs in the key that forces a repaint.
      ((ship.parkedBody && ship.parkedBody.name) || "");
    const stateChanged = stateKey !== this._shipBgStateKey;
    if (stateChanged) {
      this._shipBgStateKey = stateKey;
      // Fresh random starting facing every time the ship settles on a new
      // body (or first boards), instead of the same pose every time.
      this._shipBgSpinAngle = Math.random() * Math.PI * 2;
    }
    this._shipBgFrame = (this._shipBgFrame || 0) + 1;

    this.drawShipBackground(sprite.bitmap, dm, ship, moving);
    sprite.bitmap._baseTexture.update();
  };

  Spriteset_Map.prototype.drawShipBackground = function (bmp, dm, ship, moving) {
    const w = bmp.width;
    const h = bmp.height;
    const ctx = bmp.context;
    const time = this._shipBgTime;

    bmp.clear();

    const speed = Math.max(1, (typeof $gameVariables !== "undefined" && $gameVariables.value(94)) || 1);
    if (moving && speed > 10) {
      this.drawPsychedelicWarp(ctx, w, h, time, speed);
      return;
    }

    // --- Deep space gradient ---------------------------------------------
    // The gradient only depends on height, so build it once and reuse it
    // across frames instead of allocating a CanvasGradient every repaint.
    if (!this._shipBgGrad || this._shipBgGradH !== h) {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#04060f");
      grad.addColorStop(0.6, "#070512");
      grad.addColorStop(1, "#02030a");
      this._shipBgGrad = grad;
      this._shipBgGradH = h;
    }
    ctx.fillStyle = this._shipBgGrad;
    ctx.fillRect(0, 0, w, h);

    // --- Starfield (scrolls horizontally with the ship's motion) ---------
    const stars = getStars();
    const scroll = this._shipBgScroll;
    ctx.save();
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      // Closer stars stream faster -> parallax depth cue.
      const px = s.x * w;
      let sy = (s.y + scroll * s.depth) % 1;
      if (sy < 0) sy += 1;
      const py = sy * h;
      const size = s.depth * 1.8 + 0.4;
      const tw = 0.55 + 0.45 * Math.sin(time * 2 + s.twinkle);
      ctx.globalAlpha = Math.min(1, (0.35 + s.depth * 0.65) * tw);

      if (moving) {
        // Warp streaks: elongate stars vertically (opposite to travel motion).
        const streak = 6 + s.depth * 26 * Math.max(1, $gameVariables.value(94) || 1) * 0.15;
        ctx.strokeStyle = "#cfe0ff";
        ctx.lineWidth = size;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px, py - streak);
        ctx.stroke();
      } else {
        ctx.fillStyle = "#dfe8ff";
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    // --- Celestial body --------------------------------------------------
    // During travel we are in transit, so only the streaking starfield shows.
    if (moving) return;

    // Straight into the frame being drawn. The body used to be rendered into a
    // cached canvas a couple of times a second and blitted over the starfield
    // in between, which is what made a star's flares, a hole's disk and a
    // refuel approach all move in steps rather than turn.
    this.drawShipBody(ctx, w, h, dm, ship, time);
  };

  // ==========================================================================
  // Hyperspace, everything above 10x on the warp slider.
  //
  // Three readings of one corridor, crossfaded by the slider so the window
  // never cuts from one to the next:
  //
  //   11 to ~40   the stargate. A square shaft of hard edged colour slabs
  //               rushing the viewer down a slit scan perspective, the way
  //               2001 shoots it: two lit walls flanking the eye, roof and
  //               floor dimmer, every band a saturated slab of its own hue.
  //   ~40 to ~75  witchspace. The colour drains toward one cold blue, the
  //               shaft tears out of true and lightning whips out of the
  //               vanishing point. Something is in here with the ship.
  //   ~75 to 100  the white. The ground floods to pure white, everything drawn
  //               goes pure black, and four dimensional solids (a tesseract, a
  //               16-cell, a 5-cell, a 24-cell) turn in their own planes as
  //               they drift out of the vanishing point and pass the hull. At
  //               100 there is no colour left anywhere: white ground, black
  //               edges, and a black pupil in the middle of the screen.
  //
  // The animation clock never speeds up with the slider. Only what is drawn
  // changes, so the whole thing stays hypnotic instead of frantic.
  // ==========================================================================

  function smooth01(a, b, x) {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  // Where a warp slider reading sits in the three readings above. Pulled out
  // of the draw so it can be asserted without a canvas.
  function warpStages(speed) {
    const t = Math.max(0, Math.min(1, ((speed || 0) - 10) / 90));
    return {
      t: t,
      witch: smooth01(0.10, 0.55, t),
      mono: smooth01(0.70, 1.00, t)
    };
  }

  // hsl to rgb, 0..255. The bands are authored in hue space because the whole
  // palette rotates as one; the ink blend below needs the channels.
  function hslRgb(hue, s, l) {
    const h = (((hue % 360) + 360) % 360) / 360;
    if (s <= 0) { const v = l * 255; return [v, v, v]; }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const ch = (x) => {
      if (x < 0) x += 1; else if (x > 1) x -= 1;
      if (x < 1 / 6) return p + (q - p) * 6 * x;
      if (x < 1 / 2) return q;
      if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
      return p;
    };
    return [ch(h + 1 / 3) * 255, ch(h) * 255, ch(h - 1 / 3) * 255];
  }

  // One frame's palette. mono drags every drawn colour to the ink pole and the
  // ground to the opposite one, so at 100 the screen holds exactly two values.
  function makePalette(mono, negative) {
    const inkPole = negative ? 255 : 0;
    return {
      mono: mono,
      inkPole: inkPole,
      ground: negative ? 0 : 255,
      // A colour on its way to the ink pole, as a css rgba() string.
      ink(hue, s, l, a) {
        const c = hslRgb(hue, s, l);
        const r = Math.round(c[0] + (inkPole - c[0]) * mono);
        const g = Math.round(c[1] + (inkPole - c[1]) * mono);
        const b = Math.round(c[2] + (inkPole - c[2]) * mono);
        return "rgba(" + r + "," + g + "," + b + "," + Math.max(0, Math.min(1, a)).toFixed(3) + ")";
      }
    };
  }

  // --------------------------------------------------------------------------
  // The regular 4-polytopes. Vertices in 4-space and the edge list, built once
  // per kind and kept: they never change.
  // --------------------------------------------------------------------------
  const _POLY4 = {};
  function polytope4(kind) {
    if (_POLY4[kind]) return _POLY4[kind];
    const verts = [];
    const edges = [];
    if (kind === "cross") {
      // 16-cell: the two points on each axis, every pair joined but the
      // antipodal ones.
      for (let a = 0; a < 4; a++) {
        const p = [0, 0, 0, 0], m = [0, 0, 0, 0];
        p[a] = 1.35; m[a] = -1.35;
        verts.push(p, m);
      }
      for (let i = 0; i < 8; i++) {
        for (let j = i + 1; j < 8; j++) if ((i >> 1) !== (j >> 1)) edges.push([i, j]);
      }
    } else if (kind === "simplex") {
      // 5-cell: five mutually joined points, centred on the origin.
      const k = 4 / Math.sqrt(5), q = -1 / Math.sqrt(5);
      verts.push([1, 1, 1, q], [1, -1, -1, q], [-1, 1, -1, q], [-1, -1, 1, q], [0, 0, 0, k]);
      for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) edges.push([i, j]);
    } else if (kind === "cell24") {
      // 24-cell: every sign pattern on every pair of axes, joined at the
      // shortest distance.
      for (let a = 0; a < 4; a++) {
        for (let b = a + 1; b < 4; b++) {
          for (let sa = -1; sa <= 1; sa += 2) {
            for (let sb = -1; sb <= 1; sb += 2) {
              const v = [0, 0, 0, 0];
              v[a] = sa; v[b] = sb;
              verts.push(v);
            }
          }
        }
      }
      for (let i = 0; i < verts.length; i++) {
        for (let j = i + 1; j < verts.length; j++) {
          let d = 0;
          for (let c = 0; c < 4; c++) { const q2 = verts[i][c] - verts[j][c]; d += q2 * q2; }
          if (Math.abs(d - 2) < 1e-6) edges.push([i, j]);
        }
      }
    } else {
      // Tesseract: the 16 corners of the unit 4-cube, joined along one axis.
      for (let i = 0; i < 16; i++) {
        verts.push([(i & 1) ? 1 : -1, (i & 2) ? 1 : -1, (i & 4) ? 1 : -1, (i & 8) ? 1 : -1]);
      }
      for (let i = 0; i < 16; i++) {
        for (let b = 0; b < 4; b++) { const j = i ^ (1 << b); if (j > i) edges.push([i, j]); }
      }
    }
    _POLY4[kind] = { verts: verts, edges: edges };
    return _POLY4[kind];
  }

  // Turn a 4-vector in the xw, yz and xy planes, then drop it to 3-space by the
  // same perspective divide a 3D point takes to the screen: the near side of
  // the solid in the fourth direction swells, the far side shrinks, which is
  // the whole reason a tesseract looks like a box inside a box turning itself
  // inside out. out is written in place so a whole field costs no garbage.
  const HYPER_W_DIST = 3.1;
  function project4(v, ax, ay, az, out) {
    let x = v[0], y = v[1], z = v[2], w = v[3];
    let c = Math.cos(ax), s = Math.sin(ax);
    let t = x * c - w * s; w = x * s + w * c; x = t;
    c = Math.cos(ay); s = Math.sin(ay);
    t = y * c - z * s; z = y * s + z * c; y = t;
    c = Math.cos(az); s = Math.sin(az);
    t = x * c - y * s; y = x * s + y * c; x = t;
    const k = HYPER_W_DIST / Math.max(0.35, HYPER_W_DIST - w);
    out[0] = x * k; out[1] = y * k; out[2] = z * k;
    return out;
  }

  // The field of solids the white sends past the hull. Seeded once so every
  // trip through the white sees the same procession in the same order.
  const HYPER_KINDS = ["tesseract", "cross", "simplex"];
  let _hyperField = null;
  function hyperField() {
    if (_hyperField) return _hyperField;
    let seed = 90210;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    const list = [];
    for (let i = 0; i < 8; i++) {
      list.push({
        // One 24-cell only: it carries 96 edges against the tesseract's 32.
        kind: i === 3 ? "cell24" : HYPER_KINDS[i % HYPER_KINDS.length],
        phase: rnd(),
        rate: 0.055 + rnd() * 0.075,
        scale: 0.42 + rnd() * 0.55,
        ox: (rnd() - 0.5) * 2.6,
        oy: (rnd() - 0.5) * 1.9,
        spinA: 0.21 + rnd() * 0.34,
        spinB: 0.17 + rnd() * 0.3,
        spinC: 0.09 + rnd() * 0.22
      });
    }
    _hyperField = list;
    return list;
  }

  // Draw `count` of them, nearest last so the near ones overlay the far.
  function drawHyperSolids(ctx, cx, cy, focal, time, pal, count) {
    const field = hyperField();
    const p = [0, 0, 0];
    const sx = [], sy = [];
    for (let n = 0; n < Math.min(count, field.length); n++) {
      const e = field[n];
      const u = 1 - ((e.phase + time * e.rate) % 1);   // 1 far, 0 on the hull
      const z = 0.55 + u * 9.5;
      const fade = Math.min(1, (1 - u) * 3.4) * Math.min(1, u * 7);
      if (fade <= 0.01) continue;
      const poly = polytope4(e.kind);
      const ax = time * e.spinA + e.phase * 6.28;
      const ay = time * e.spinB + e.phase * 2.1;
      const az = time * e.spinC;
      const k = focal / z;
      sx.length = 0; sy.length = 0;
      for (let i = 0; i < poly.verts.length; i++) {
        project4(poly.verts[i], ax, ay, az, p);
        const zz = z + p[2] * e.scale * 0.55;
        const kk = zz > 0.2 ? focal / zz : k;
        sx.push(cx + (e.ox + p[0] * e.scale) * kk);
        sy.push(cy + (e.oy + p[1] * e.scale) * kk);
      }
      ctx.strokeStyle = pal.ink(0, 0, 0.02, 0.9 * fade * pal.mono);
      ctx.lineWidth = Math.max(0.7, Math.min(5, 2.6 / z + 0.5));
      ctx.beginPath();
      for (let i = 0; i < poly.edges.length; i++) {
        const a = poly.edges[i][0], b = poly.edges[i][1];
        ctx.moveTo(sx[a], sy[a]);
        ctx.lineTo(sx[b], sy[b]);
      }
      ctx.stroke();
    }
  }

  Spriteset_Map.prototype.drawPsychedelicWarp = function (ctx, w, h, time, speed) {
    const st = warpStages(speed);
    const witch = st.witch;
    const mono = st.mono;

    // A rare, brief polarity flip once the white has taken hold: the ground
    // goes black and the solids go white for a few frames. Driven off the
    // clock, so it is the same flicker every trip rather than random noise.
    const negative = mono > 0.55 && (time % 7.3) < 0.13;
    const pal = makePalette(mono, negative);

    // The vanishing point drifts off centre and never settles.
    const cx = w * (0.5 + Math.sin(time * 0.13) * 0.035);
    const cy = h * (0.5 + Math.sin(time * 0.097 + 1.7) * 0.03);
    const maxR = Math.sqrt(w * w + h * h) * 0.5;
    const focal = h * 0.62;
    const baseHue = (time * 22) % 360;
    const sat = 0.92 * (1 - witch * 0.72);
    // Witchspace drags every hue the short way round to one cold blue.
    const cold = (hue) => {
      let d = (222 - (((hue % 360) + 360) % 360)) % 360;
      if (d > 180) d -= 360; else if (d < -180) d += 360;
      return hue + d * witch * 0.8;
    };

    // --- the ground -------------------------------------------------------
    const bg = hslRgb(cold(baseHue + 200), sat * 0.8, 0.055);
    ctx.fillStyle = "rgb(" +
      Math.round(bg[0] + (pal.ground - bg[0]) * mono) + "," +
      Math.round(bg[1] + (pal.ground - bg[1]) * mono) + "," +
      Math.round(bg[2] + (pal.ground - bg[2]) * mono) + ")";
    ctx.fillRect(0, 0, w, h);
    if (mono < 1 && ctx.createRadialGradient) {
      const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, maxR);
      g.addColorStop(0, pal.ink(cold(baseHue + 40), sat, 0.34, 0.55 * (1 - mono)));
      g.addColorStop(0.55, pal.ink(cold(baseHue), sat, 0.14, 0.4 * (1 - mono)));
      g.addColorStop(1, pal.ink(cold(baseHue + 120), sat, 0.04, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    // --- the slit scan shaft ----------------------------------------------
    // A square corridor seen down its axis. Each band is the slab between two
    // depths, drawn as four trapezoids (the two lit walls, then roof and
    // floor), so the walls read as continuous ribbons of light streaming past
    // the eye. Bands are addressed by a monotonic id, not by screen slot, so a
    // band keeps its own hue the whole way in instead of the colours crawling.
    const BANDS = 24;
    const NEAR = 0.34;
    const STEP = 0.58;
    const flow = time * 1.05;           // constant, whatever the slider says
    const halfW = 1.3, halfH = 0.92;
    const first = Math.ceil(flow);
    const quad = (ax, ay, bx, by, cx2, cy2, dx, dy, style) => {
      ctx.beginPath();
      ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx2, cy2); ctx.lineTo(dx, dy);
      ctx.closePath();
      ctx.fillStyle = style;
      ctx.fill();
    };
    for (let j = 0; j < BANDS; j++) {
      const id = first + j;
      const f = id - flow;               // 0 = about to pass the hull
      const z0 = NEAR + f * STEP;
      const z1 = z0 + STEP * 0.72;       // the dark gap between slabs
      const tear = witch * (0.16 + 0.14 * Math.sin(id * 1.7 + time * 1.3));
      const rx0 = halfW * (1 + tear) * focal / z0, ry0 = halfH * focal / z0;
      const rx1 = halfW * (1 + tear) * focal / z1, ry1 = halfH * focal / z1;
      if (rx0 > maxR * 7) continue;      // already swallowed the whole screen
      const off = witch * Math.sin(id * 0.9 + time * 0.7) * 0.22 * focal;
      const x0 = cx + off / z0, x1 = cx + off / z1;
      const near = Math.max(0, 1 - f / BANDS);
      const hue = cold(baseHue + id * 29);
      const a = (0.18 + 0.55 * near) * (1 - mono * 0.3);

      quad(x0 - rx0, cy - ry0, x1 - rx1, cy - ry1, x1 - rx1, cy + ry1, x0 - rx0, cy + ry0,
        pal.ink(hue, sat, 0.54, a));
      quad(x0 + rx0, cy - ry0, x1 + rx1, cy - ry1, x1 + rx1, cy + ry1, x0 + rx0, cy + ry0,
        pal.ink(hue + 22, sat, 0.46, a));
      // Roof and floor stay the dim sides, and step back entirely in the white
      // so the ground there is left as white as it can be.
      const ab = a * 0.5 * (1 - mono);
      if (ab > 0.01) {
        quad(x0 - rx0, cy - ry0, x0 + rx0, cy - ry0, x1 + rx1, cy - ry1, x1 - rx1, cy - ry1,
          pal.ink(hue + 46, sat * 0.8, 0.24, ab));
        quad(x0 - rx0, cy + ry0, x0 + rx0, cy + ry0, x1 + rx1, cy + ry1, x1 - rx1, cy + ry1,
          pal.ink(hue + 46, sat * 0.8, 0.2, ab));
      }
    }

    // --- light rushing past the hull --------------------------------------
    // The same deterministic field the parked starfield uses, read in polar:
    // angle from x, position along the run from y, so every point accelerates
    // out of the vanishing point and off the edge of the screen.
    const stars = getStars();
    const rush = time * 0.45;
    ctx.save();
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const ang = s.x * Math.PI * 2 + witch * Math.sin(time * 0.6 + s.twinkle) * 0.4;
      let p = (s.y + rush * (0.4 + s.depth)) % 1;
      if (p < 0) p += 1;
      const r0 = Math.pow(p, 2.4) * maxR * 1.35;
      const r1 = r0 + (10 + s.depth * 70) * (0.35 + p);
      const ca = Math.cos(ang), sa = Math.sin(ang);
      ctx.strokeStyle = pal.ink(cold(baseHue + s.twinkle * 57 + i * 11), sat, 0.74,
        (0.2 + 0.6 * p) * (1 - mono * 0.55));
      ctx.lineWidth = 0.6 + s.depth * (1.6 + witch);
      ctx.beginPath();
      ctx.moveTo(cx + ca * r0, cy + sa * r0);
      ctx.lineTo(cx + ca * r1, cy + sa * r1);
      ctx.stroke();
    }
    ctx.restore();

    // --- witchspace lightning ---------------------------------------------
    const tendrils = Math.round(witch * 16);
    for (let n = 0; n < tendrils; n++) {
      const ang = n * 2.399963 + time * 0.08 * (n % 2 ? 1 : -1);
      const SEG = 12;
      ctx.beginPath();
      for (let s2 = 0; s2 <= SEG; s2++) {
        const p = s2 / SEG;
        const r = 8 + Math.pow(p, 1.7) * maxR * 1.2;
        const jitter = Math.sin(p * 9 + time * 2.3 + n * 1.3) * (6 + p * 46) +
          Math.sin(p * 21 - time * 1.4 + n) * (3 + p * 18);
        const a2 = ang + jitter / (r + 40);
        const px = cx + Math.cos(a2) * r, py = cy + Math.sin(a2) * r;
        if (s2 === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = pal.ink(cold(baseHue + 180), sat * 0.5, 0.86,
        (0.12 + 0.3 * witch) * (0.6 + 0.4 * Math.sin(time * 3 + n)));
      ctx.lineWidth = 0.8 + witch * 1.8;
      ctx.stroke();
    }

    // --- the solids out of the fourth direction ---------------------------
    const solids = Math.round(mono * 8);
    if (solids > 0) drawHyperSolids(ctx, cx, cy, focal, time, pal, solids);

    // --- the eye at the end of the shaft ----------------------------------
    // Below the white it is a blazing core; in the white the same draw call
    // hands back a black pupil, because every colour rides the ink blend.
    const eyeR = 14 + 26 * (1 - mono) + Math.sin(time * 1.9) * (3 + 4 * (1 - mono));
    if (ctx.createRadialGradient) {
      const g2 = ctx.createRadialGradient(cx, cy, 1, cx, cy, eyeR * 3.4);
      g2.addColorStop(0, pal.ink(0, 0, 1, 0.95));
      g2.addColorStop(0.3, pal.ink(cold(baseHue + 120), sat, 0.68, 0.75));
      g2.addColorStop(0.65, pal.ink(cold(baseHue + 280), sat, 0.5, 0.42));
      g2.addColorStop(1, pal.ink(cold(baseHue), sat, 0.5, 0));
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(cx, cy, eyeR * 3.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = pal.ink(0, 0, 1, 1);
    ctx.beginPath();
    ctx.arc(cx, cy, eyeR * (0.4 + mono * 0.45), 0, Math.PI * 2);
    ctx.fill();
  };

  // Handed to the tests, and to anything that wants the same maths.
  if (!window.GalaxySim) window.GalaxySim = {};
  window.GalaxySim.HyperWarp = {
    stages: warpStages, polytope4: polytope4, project4: project4,
    field: hyperField, palette: makePalette, solids: drawHyperSolids
  };

  // How many frames a cached body render stays good for (see above).
  // Renders the current celestial body (planet or star) into the given context
  // via the shared 3D renderer, falling back to a flat disc. Kept separate so
  // the result can be cached (see drawShipBackground).
  Spriteset_Map.prototype.drawShipBody = function (ctx, w, h, dm, ship, time) {
    const renderer = window.GalaxySim.Renderer3D;
    const has3D = renderer && renderer.available && renderer.available();

    const system = dm.getSystem(ship.currentSystem);
    if (!system) return;

    // Body anchored toward the right so it frames nicely behind ship windows.
    const bodyX = w * 0.72;
    const bodyY = h * 0.45;

    if (ship.currentPlanet) {
      const planet = (system.planets || []).find((p) => p.name === ship.currentPlanet);
      if (planet) {
        const radius = h * 0.34;
        if (has3D) {
          const seed = String(planet.name || "p")
            .split("")
            .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
          // The ship's own orbit slowly carries the view around the planet, on
          // top of a starting face rolled fresh each time this orbit began.
          const rotation = (this._shipBgSpinAngle || 0) / PLANET_SPIN_RATE + time * ORBIT_SPIN_RATE;
          const ok = renderer.renderPlanet(
            ctx, bodyX, bodyY, radius, planet, seed, rotation,
            { x: bodyX - radius, y: bodyY - radius }
          );
          if (!ok) this.drawFallbackBody(ctx, bodyX, bodyY, radius, planet.color || "#5b8fd6");
        } else {
          this.drawFallbackBody(ctx, bodyX, bodyY, radius, planet.color || "#5b8fd6");
        }
        return;
      }
    }

    // Not orbiting a planet -> show the body the ship is parked at (the
    // system's own primary when it is parked at nothing in particular). A
    // black hole, a neutron star or any other exotic object is drawn with its
    // own model, not as a generic glowing sphere.
    const rec = shipStarRecord(dm, ship) || system;
    // Drawing fuel flies the hull down through the corona itself (see the
    // system view's updateShip), so the body does not merely grow a little in
    // the window: it fills it, the way a star does from inside its own loops.
    const starR = bodyScreenRadius(rec, h) * (1 + 1.6 * (this._shipBgApproach || 0));
    if (has3D) {
      const starTime = time + (this._shipBgSpinAngle || 0) / STAR_SPIN_RATE;
      const ok = renderer.renderSystemBody
        ? renderer.renderSystemBody(ctx, bodyX, bodyY, starR, rec, starTime)
        : renderer.renderStar(ctx, bodyX, bodyY, starR, rec, starTime);
      if (!ok) this.drawFallbackBody(ctx, bodyX, bodyY, starR, rec.color || "#ffd27f", true);
    } else {
      this.drawFallbackBody(ctx, bodyX, bodyY, starR, rec.color || "#ffd27f", true);
    }
  };

  // ==========================================================================
  // Travel countdown, shown while the player sits on a <Biome: Space> map
  // and the ship is under way. Deliberately the same parchment overlay the
  // vehicle fast-travel timer uses (FastTravelSystem's Window_TravelTimer), so
  // travelling by starship reads exactly like travelling by road.
  // ==========================================================================
  const TIMER_ID = "gx-ship-travel-timer";
  // How long the "arrived" line stays up once the trip ends (frames).
  const ARRIVAL_HOLD = 180;

  let _timerHtml = null;      // last innerHTML written (skips redundant writes)
  let _timerTrip = null;      // trip identity; a change restarts the countdown
  let _arrivalUntil = 0;      // frameCount at which the arrival line is dropped
  let _arrivalName = "";

  function getShipTimerEl(create) {
    let el = document.getElementById(TIMER_ID);
    if (!el && create) {
      el = document.createElement("div");
      el.id = TIMER_ID;
      el.className = "html-parchment-overlay";
      document.body.appendChild(el);
      _timerHtml = null;
    }
    return el || null;
  }

  function removeShipTimer() {
    const el = document.getElementById(TIMER_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
    _timerHtml = null;
  }

  // Scale/position the overlay onto the game canvas. It sits in the BOTTOM
  // RIGHT corner: the top left is where the map name, the party HUD and the
  // ship's own health bar already are, and a countdown parked on top of them
  // buried the lot. Anchored by its own right/bottom edges so a label that
  // changes length grows away from the corner instead of moving the window.
  function syncShipTimerPos(el) {
    const canvas = document.getElementById("gameCanvas");
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const sx = r.width / Graphics.width;
    const sy = r.height / Graphics.height;
    const s = el.style;
    s.left = "auto";
    s.top = "auto";
    s.right = Math.max(0, window.innerWidth - r.right + 20 * sx) + "px";
    s.bottom = Math.max(0, window.innerHeight - r.bottom + 20 * sy) + "px";
    s.padding = `${Math.round(12 * sy)}px ${Math.round(20 * sx)}px`;
    s.minWidth = Math.round(200 * sx) + "px";
    s.fontSize = Math.round(16 * sy) + "px";
  }

  function setShipTimerHtml(html) {
    const el = getShipTimerEl(true);
    if (!el) return;
    if (html !== _timerHtml) {
      _timerHtml = html;
      el.innerHTML = html;
    }
    el.style.display = "block";
    syncShipTimerPos(el);
  }

  // Seconds left, derived from the same real-time maths DataManager.
  // updateShipPosition() uses, so the readout hits 0 exactly on arrival. The
  // warp-speed slider (var 94) rescales the whole trip, so a change is picked
  // up on the next tick.
  function travelEta(ship) {
    const speed = Math.max(1, $gameVariables.value(94) || 1);
    const isIntra = !!ship.targetSystem && ship.targetSystem === ship.currentSystem;
    const baseSpeed = isIntra ? 1 : 0.5;
    const mult = isIntra ? Math.min(speed, 2) : speed;
    // Arrival fires at 95% of the route (maxProgress in updateShipPosition).
    const total = ship.travelDistance > 0 ? (ship.travelDistance * 0.95) / (mult * baseSpeed) : 0;
    const elapsed = ship.departureTime ? (Date.now() - ship.departureTime) / 1000 : 0;
    return { total, remaining: Math.max(0, Math.ceil(total - elapsed)) };
  }

  function clockText(seconds) {
    const s = Math.max(0, Math.ceil(seconds || 0));
    return String(Math.floor(s / 60)).padStart(2, "0") + ":" +
      String(s % 60).padStart(2, "0");
  }

  // The refuel / harvest countdown, written into the very same window that
  // counts an arrival down. Returns null when nothing is being drawn.
  function pumpTimerHtml(dm, ship) {
    const source = (ship.parkedBody && ship.parkedBody.name) || ship.currentSystem || "";
    if (ship.harvestRun) {
      const left = dm.schrodingeriteHarvestRemaining ? dm.schrodingeriteHarvestRemaining() : 0;
      return `<div class="travel-timer-label">${T('Galaxy.travel.harvesting')}` +
        `${source ? " · " + source : ""}:</div>` +
        `<div class="travel-timer-time">${clockText(left)}</div>`;
    }
    if (!ship.isRefueling) return null;
    const left = dm.refuelEtaSeconds ? dm.refuelEtaSeconds() : 0;
    return `<div class="travel-timer-label">${T('Galaxy.travel.refuelling')}` +
      `${source ? " · " + source : ""}:</div>` +
      `<div class="travel-timer-time">${clockText(left)}</div>`;
  }

  function updateShipTravelTimer() {
    if (!$gameMap || !isSpaceBiomeMap()) {
      if (_timerHtml !== null) removeShipTimer();
      _arrivalUntil = 0;
      return;
    }
    if (!window.GalaxySim || typeof window.GalaxySim.getDataManager !== "function") return;
    const dm = window.GalaxySim.getDataManager();
    const ship = dm && dm.playerShip;
    if (!ship) return;

    // A new departure (or a retarget mid-flight) is a new trip: drop any
    // lingering arrival line and rebuild the countdown from the new route.
    const trip = ship.isMoving
      ? (ship.departureTime || 0) + "|" + (ship.targetSystem || "") + "|" + (ship.targetPlanet || "")
      : null;
    if (trip && trip !== _timerTrip) {
      _arrivalUntil = 0;
      _timerHtml = null;
    }
    if (trip) _timerTrip = trip;

    if (!ship.isMoving) {
      // Parked with the pumps running: the arrival window becomes the refuel
      // window, counting the fill down exactly the way it counts a trip down.
      const pump = pumpTimerHtml(dm, ship);
      if (pump) {
        _timerTrip = null;
        _arrivalUntil = 0;
        setShipTimerHtml(pump);
        return;
      }
      // Trip over (arrived, or stopped by the player / out of Hyperflux).
      if (_timerTrip && !_arrivalUntil && !ship.stoppedMidTravel) {
        _arrivalUntil = Graphics.frameCount + ARRIVAL_HOLD;
        _arrivalName = ship.currentPlanet || ship.currentSystem || T('Galaxy.travel.yourDestination');
      }
      _timerTrip = null;
      if (_arrivalUntil && Graphics.frameCount < _arrivalUntil) {
        setShipTimerHtml(
          `<div class="travel-timer-complete">${T('Galaxy.travel.arrivedAt', { place: _arrivalName })}</div>`);
      } else {
        _arrivalUntil = 0;
        if (_timerHtml !== null) removeShipTimer();
      }
      return;
    }

    const eta = travelEta(ship);
    if (eta.remaining <= 0) {
      // The clock has run out: settle the arrival now (travel is otherwise only
      // resolved from the star map) so the countdown reads 0 exactly once and
      // hands over to the arrival line on the next frame.
      if (typeof dm.updateShipPosition === "function") dm.updateShipPosition();
    }
    const mm = String(Math.floor(eta.remaining / 60)).padStart(2, "0");
    const ss = String(eta.remaining % 60).padStart(2, "0");
    let distHtml = "";
    if (ship.travelDistance > 0 && eta.total > 0) {
      const left = ship.travelDistance * Math.min(1, eta.remaining / eta.total);
      distHtml = `<div class="travel-timer-km">${T('Galaxy.travel.lyRemaining', {
        ly: left >= 10 ? Math.round(left) : left.toFixed(2) })}</div>`;
    }
    const dest = ship.targetPlanet || ship.targetSystem || "";
    setShipTimerHtml(
      `<div class="travel-timer-label">${T('Galaxy.travel.timeToArrival')}${dest ? " · " + dest : ""}:</div>` +
      `<div class="travel-timer-time">${mm}:${ss}</div>` + distHtml);
  }

  const _sceneMapUpdate = Scene_Map.prototype.update;
  Scene_Map.prototype.update = function () {
    _sceneMapUpdate.call(this);
    updateShipTravelTimer();
  };

  // Never leave the overlay behind when the map scene goes away (menu, battle,
  // star map, title...).
  const _sceneMapTerminate = Scene_Map.prototype.terminate;
  Scene_Map.prototype.terminate = function () {
    removeShipTimer();
    _sceneMapTerminate.call(this);
  };

  // Flat fallback when WebGL / THREE.js is unavailable.
  Spriteset_Map.prototype.drawFallbackBody = function (ctx, x, y, r, color, glow) {
    ctx.save();
    if (glow) {
      const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 1.8);
      g.addColorStop(0, color);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    const grad = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
    grad.addColorStop(0, color);
    grad.addColorStop(1, "#05060c");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
})();
