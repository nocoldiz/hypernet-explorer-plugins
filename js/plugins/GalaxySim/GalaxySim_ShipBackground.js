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

  // True for anything whose model animates in its own right (a spinning
  // accretion disk, a pulsar's beams, a flaring magnetar). Those refresh far
  // more often than the 2 Hz a plain star's slow drift is happy with.
  function isLiveModel(rec) {
    if (isBlackHoleRecord(rec)) return true;
    const Cosmos = window.GalaxySim && window.GalaxySim.Scene3DCosmos;
    return !!(Cosmos && Cosmos.isExoticStarType && rec && Cosmos.isExoticStarType(rec.type));
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
    _shipBgLiveModel: false,
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

    // Repaint at ~20Hz: stars drift slowly, so throttling the full-screen
    // repaint (gradient + starfield + celestial body composite) to every 3rd
    // frame is visually near-identical while cutting the per-frame canvas work
    // and the baseTexture GPU upload to a third. Always repaint immediately
    // when the depicted state changes so transitions never lag.
    const stateKey = (moving ? "M" : "P") + "|" +
      (ship.currentPlanet || "") + "|" + (ship.currentSystem || "") + "|" +
      // Parking at a companion star, a hole or a remnant changes which model
      // the window shows, so it belongs in the key that forces a repaint.
      ((ship.parkedBody && ship.parkedBody.name) || "");
    const stateChanged = stateKey !== this._shipBgStateKey;
    if (stateChanged) {
      this._shipBgStateKey = stateKey;
      this._shipBgBodyRenderedFrame = -1e9; // force the body cache to re-render
      // Fresh random starting facing every time the ship settles on a new
      // body (or first boards), instead of the same pose every time.
      this._shipBgSpinAngle = Math.random() * Math.PI * 2;
    }
    this._shipBgFrame = (this._shipBgFrame || 0) + 1;
    if (!stateChanged && this._shipBgFrame % 3 !== 0) return;

    this.drawShipBackground(sprite.bitmap, dm, ship, moving);
    sprite.bitmap._baseTexture.update();
  };

  Spriteset_Map.prototype.drawShipBackground = function (bmp, dm, ship, moving) {
    const w = bmp.width;
    const h = bmp.height;
    const ctx = bmp.context;
    const time = this._shipBgTime;

    bmp.clear();

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

    // The body is an offscreen WebGL render (planet/star) that is expensive to
    // regenerate. Both a star and an orbited planet drift slowly frame to
    // frame, so render it into a cached canvas only every ~30 frames and just
    // blit that cache over the starfield on every repaint.
    let cache = this._shipBgBodyCanvas;
    if (!cache || cache.width !== w || cache.height !== h) {
      cache = this._shipBgBodyCanvas = document.createElement("canvas");
      cache.width = w;
      cache.height = h;
      this._shipBgBodyRenderedFrame = -1e9;
    }
    const frame = this._shipBgFrame || 0;
    const last = this._shipBgBodyRenderedFrame == null ? -1e9 : this._shipBgBodyRenderedFrame;
    // A model that animates in its own right (an accretion disk, a pulsar's
    // beams) is re-rendered at 10 Hz; a slowly drifting star or planet keeps
    // the cheap 2 Hz refresh. So does an approach, where the body swells.
    if (frame - last >= this._shipBgBodyInterval()) {
      this._shipBgBodyRenderedFrame = frame;
      const cctx = cache.getContext("2d");
      cctx.clearRect(0, 0, w, h);
      this.drawShipBody(cctx, w, h, dm, ship, time);
    }
    ctx.drawImage(cache, 0, 0);
  };

  // How many frames a cached body render stays good for (see above).
  Spriteset_Map.prototype._shipBgBodyInterval = function () {
    if ((this._shipBgApproachRaw || 0) > 0 && (this._shipBgApproachRaw || 0) < 1) return 6;
    return this._shipBgLiveModel ? 6 : 30;
  };

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
    this._shipBgLiveModel = isLiveModel(rec);
    // Drawing fuel pulls the ship in, so the body swells in the window.
    const starR = bodyScreenRadius(rec, h) * (1 + 0.45 * (this._shipBgApproach || 0));
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

  // Scale/position the overlay onto the game canvas, matching the fast-travel
  // timer's placement.
  function syncShipTimerPos(el) {
    const canvas = document.getElementById("gameCanvas");
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const sx = r.width / Graphics.width;
    const sy = r.height / Graphics.height;
    const s = el.style;
    s.left = (r.left + 20 * sx) + "px";
    s.top = (r.top + 80 * sy) + "px";
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
    // Arrival fires at 95% of the route (maxProgress in updateShipPosition).
    const total = ship.travelDistance > 0 ? (ship.travelDistance * 0.95) / speed : 0;
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
