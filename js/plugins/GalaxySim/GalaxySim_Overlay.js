/*:
 * @target MZ
 * @plugindesc GalaxySim 3D Overlay - Themed DOM/HTML UI layered over the 3D star map
 * @author Omni-Lex + Nocoldiz
 * @url
 * @help
 * ============================================================================
 * GalaxySim 3D Overlay Module
 * ============================================================================
 * Builds and owns the HTML UI drawn over the WebGL canvas: scale indicator,
 * mode hint, the selection info panel (star / planet / moon + Travel & Land
 * actions), and the hover tooltip. Styling is driven by the active theme's CSS
 * custom properties (css/vars.css) so the HUD matches the rest of the game, and
 * interactive elements follow the HypernetOS .focusable nav convention so the
 * panel works with mouse, keyboard, and controller.
 *
 * Selection / hover is fed from Scene3D's raycaster. Action buttons invoke the
 * callbacks registered via setCallbacks() (Scene3D routes them to the
 * DataManager travel / land logic).
 *
 * LOAD ORDER: after GalaxySim_Math.js, before GalaxySim_Scene3D.js.
 */

(() => {
  "use strict";

  if (!window.GalaxySim) window.GalaxySim = {};

  // Every selection panel offers "Zoom To" so flying to the target never
  // depends on the Space shortcut being routed to the scene.
  const ZOOM_BTN =
    `<span class="gx-btn focusable" tabindex="0" data-action="zoom-target">${T('Galaxy.hud.zoomTo')}</span>`;

  // Bookmark toggle, offered on any body a panel can meaningfully bookmark.
  const bookmarkBtn = (on) =>
    `<span class="gx-btn gx-bookmark${on ? " gx-on" : ""} focusable" tabindex="0" ` +
    `data-action="bookmark-toggle" title="${on ? T('Galaxy.hud.bookmarkRemove') : T('Galaxy.hud.bookmarkAdd')}">` +
    `${on ? "★ " + T('Galaxy.hud.bookmarked') : "☆ " + T('Galaxy.hud.bookmark')}</span>`;

  const num = (v, d) => (typeof v === "number" && isFinite(v) ? v.toFixed(d) : null);
  // Formats a Schrödingerite harvest cooldown (in-game minutes remaining) as
  // "Xd Yh" / "Yh Zm" / "Zm" - whichever units are actually left.
  const formatCooldown = (min) => {
    const total = Math.max(0, Math.ceil(min || 0));
    const d = Math.floor(total / 1440);
    const h = Math.floor((total % 1440) / 60);
    const m = total % 60;
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

  // Controller hints are written with bracketed button ids - "[A] zoom to
  // target", "[LT]/[RT] zoom" - and expanded into chips here, so the strings
  // stay translatable text and the Xbox layout lives in exactly one place.
  // Anything unrecognised is left alone rather than swallowed.
  // i18n-ignore-start: physical controller button ids
  const PAD_FACE = { A: "gx-pad-a", B: "gx-pad-b", X: "gx-pad-x", Y: "gx-pad-y" };
  const PAD_WIDE = ["LB", "RB", "LT", "RT", "LS", "RS", "L3", "R3", "D-PAD", "START", "BACK"];
  const padGlyphs = (text) => String(text).replace(/\[([A-Z0-9-]{1,5})\]/g, (m, id) => {
    if (PAD_FACE[id]) return `<span class="gx-pad ${PAD_FACE[id]}">${id}</span>`;
    if (PAD_WIDE.includes(id)) return `<span class="gx-pad gx-pad-wide">${id}</span>`;
    return m;
  });
  // i18n-ignore-end

  // How long Earth has left, for the one body that is bringing the end with it.
  // Answers null for everything else, so the row simply is not drawn.
  const impactCountdown = (body) => {
    const N = window.GalaxySim && window.GalaxySim.Nibiru;
    return (N && N.countdownFor) ? N.countdownFor(body) : null;
  };

  // A body's `type` is written in English on the catalogue record in
  // Scene3D_Cosmos, where it doubles as data; this is the one place it is shown,
  // so the label is resolved here. An unlisted type reads as itself.
  const bodyTypeLabel = (type) => {
    if (!type) return "?";
    const key = 'Galaxy.bodyType.' + String(type);
    return T.has(key) ? T(key) : String(type);
  };

  // The word a biosignature tier is read out as (Weak / Strong / Hyper), asked
  // of the core so the info box, the catalogue and the ground all say the same.
  const bioTierLabel = (tier) => {
    const GS = window.GalaxySim;
    return (GS && GS.bioTierLabel) ? GS.bioTierLabel(tier) : "";
  };

  // How the sky moves over a world: how long one day lasts there, and whether
  // the world turns at all. A body close enough in to its star is held with one
  // face toward it for good, so half of it lies in permanent daylight and half
  // in permanent night; a moon is held facing its own planet instead, which
  // leaves it a day, just a very slow one.
  const worldSpin = (body, system, opts) => {
    const GS = window.GalaxySim;
    if (!GS || !GS.worldRotation) return null;
    // Probes, telescopes and the teapot are things in orbit, not worlds: how
    // long a day lasts on one is not a question with an answer. They give
    // themselves away by weighing nothing - a millionth of a millionth of the
    // lightest real rock in the catalogue.
    if (!body || !(body.mass > 1e-16)) return null;
    return GS.worldRotation(body, system, {
      isMoon: opts && opts.kind === "moon",
      parentPlanet: opts && opts.parentPlanet,
    });
  };

  // What a body weighs you at, in Earth gravities: its mass over the square of
  // its radius, which the catalogue carries both of. It is what walking on the
  // place will actually feel like, so it is worth saying before setting down.
  const gravityLabel = (body) => {
    const GS = window.GalaxySim;
    if (!GS || !GS.surfaceGravity || !body || !(body.mass > 1e-16)) return null;
    const g = GS.surfaceGravity(body);
    if (!(g > 0) || !isFinite(g)) return null;
    return T('Galaxy.row.gValue', { g: g < 10 ? g.toFixed(2) : g.toFixed(0) });
  };

  // Hours while a day is anything like a day, Earth days once it runs into the
  // hundreds of hours. A world locked to its star has no day at all to give.
  const dayLengthLabel = (spin) => {
    if (!spin) return null;
    if (spin.frozen) return T('Galaxy.row.noDayNight');
    const h = spin.dayHours;
    if (!(h > 0)) return null;
    return h < 72
      ? T('Galaxy.row.hoursValue', { hours: h.toFixed(1) })
      : T('Galaxy.row.daysValue', { days: (h / 24).toFixed(1) });
  };

  // What the world is held facing, when it is held at all. Locked to its star
  // means the sun never moves in its sky.
  const tidalLockLabel = (spin) => {
    if (!spin || !spin.locked) return null;
    return spin.lockedTo === "star"
      ? T('Galaxy.row.lockedToStar')
      : T('Galaxy.row.lockedToPlanet');
  };

  class GalaxyOverlay {
    constructor(parentEl) {
      this.parent = parentEl;
      this.root = null;
      this.els = {};
      this.callbacks = {};
      this._selection = null; // { kind, data, system, planet }
      this._focusEl = null;
      this._ttName = null; // last tooltip (name,type) to skip redundant innerHTML
      this._ttType = null;
      this._speedShown = false; // last speed panel state to skip redundant DOM writes
      this._speedText = null;
      this._focusables = null; // memoized focusable list (see _getFocusables)
      this._landingGrid = null; // { planet, w, h, cursor:{gx,gy}, textureCanvas }
      this._landingGridCallbacks = null; // { onPick, onCancel }
      this._service = null; // { title, subtitle, parts, footer } while the bay is open
      this._mineLog = null; // last few ore lines shown on the mining console
      this._catTabs = [];
      this._catTab = null;
      // The catalog opens on what the camera is pointed at rather than on the
      // whole sky: see _catVisibleGroups.
      this._catInView = true;
    }

    _invalidateFocusables() { this._focusables = null; }

    setCallbacks(cb) { this.callbacks = cb || {}; }

    create() {
      const root = document.createElement("div");
      root.id = "gx-ui";

      const scale = document.createElement("div");
      scale.id = "gx-scale";
      scale.className = "gx-panel";
      scale.innerHTML =
        `<div class="gx-title" data-role="scale-name">${T('Galaxy.hud.starSystem')}</div>
         <div class="gx-muted" data-role="scale-sub"></div>`;

      // The catalog button lives apart from the left rail: it opens the catalog
      // panel, and both sit in the top-right corner.
      const catBtn = document.createElement("div");
      catBtn.id = "gx-catalog-btn";
      catBtn.innerHTML =
        `<span class="gx-btn focusable" tabindex="0" data-action="catalog">${T('Galaxy.hud.catalog')}</span>`;

      const catToggle = document.createElement("div");
      catToggle.id = "gx-catalog-toggle";
      catToggle.innerHTML =
        `<span class="gx-btn gx-ship focusable" tabindex="0" data-action="ship" ` +
        `data-role="ship-btn" title="${T('Galaxy.hud.centreTheViewOnYour')}">` +
        `${T('Galaxy.hud.ship')}</span>` +
        `<span class="gx-btn gx-bio focusable" tabindex="0" data-action="bioscan" ` +
        `data-role="bioscan-btn" title="${T('Galaxy.hud.sweepEverySystemWithin500')}">` +
        `${T('Galaxy.hud.scanForBiosignatures')}</span>` +
        `<span class="gx-btn gx-tour focusable" tabindex="0" data-action="grand-tour" ` +
        `data-role="tour-btn" title="${T('Galaxy.hud.grandTourTooltip')}">` +
        `${T('Galaxy.hud.grandTour')}</span>` +
        `<span class="gx-btn gx-land focusable" tabindex="0" data-action="home" ` +
        `data-role="home-btn">${T('Galaxy.hud.home')}</span>` +
        // The way onto the ship's own bridge, and into flying it by hand. Shown
        // only while the ship is in orbit of a world, which is the only place
        // there is a sky to fly it in (see Scene3D._takeTheHelm).
        `<span class="gx-btn gx-ship focusable ui-closed" tabindex="0" data-action="bridge" ` +
        `data-role="bridge-btn" title="${T('Galaxy.hud.bridgeTooltip')}">` +
        `${T('Galaxy.hud.bridge')}</span>` +
        `<span class="gx-btn gx-sb gx-disabled focusable" tabindex="0" data-action="sb-bridge" ` +
        `data-role="sb-btn" title="${T('Galaxy.hud.quantumBridgeToTheSelected')}">` +
        `${T('Galaxy.hud.sbBridge')}</span>` +
        `<span class="gx-btn focusable" tabindex="0" data-action="return-earth-toggle" ` +
        `data-role="return-earth-btn">${T('Galaxy.hud.returnToEarth')}</span>` +
        // Folded away until Return to Earth is opened. The `ui-closed` used to
        // sit in a SECOND class attribute, which HTML drops on the floor - the
        // button was permanently on screen, one of a rail full of controls that
        // were never meant to all be showing at once.
        `<span class="gx-btn gx-land focusable ui-closed" tabindex="0" data-action="return-earth-course" ` +
        `data-role="return-earth-course-btn" ` +
        `title="${T('Galaxy.hud.plotACourseHomeMilky')}">` +
        `${T('Galaxy.hud.setCourse')}</span>` +
        // Refuelling is an action like any other on this rail, so it stands
        // with them rather than buried in the corner of the fuel readout.
        `<span class="gx-btn gx-refuel focusable" tabindex="0" data-action="refuel-auto" ` +
        `data-role="refuel-btn" title="${T('Galaxy.hud.refuelTooltip')}">` +
        `${T('Galaxy.hud.refuel')}</span>` +
        `<span class="gx-btn focusable" tabindex="0" data-action="close-map" ` +
        `data-role="close-map-btn" title="${T('Galaxy.hud.closeMapTooltip')}">${T('Galaxy.hud.closeMap')}</span>`;

      const catalog = document.createElement("div");
      catalog.id = "gx-catalog";
      catalog.className = "gx-panel";
      catalog.style.display = "none";

      const info = document.createElement("div");
      info.id = "gx-info";
      info.className = "gx-panel";

      const speed = document.createElement("div");
      speed.id = "gx-speed";
      speed.className = "gx-panel";
      speed.innerHTML =
        `<div class="gx-title">${T('Galaxy.hud.engines')}</div><div class="gx-divider"></div>` +
        `<div class="gx-row"><span class="gx-k">${T('Galaxy.hud.warpSpeed')}</span>` +
        `<span class="gx-v" data-role="speed-val">×1</span></div>` +
        `<div class="gx-slider-row">` +
        `<input type="range" class="gx-slider" data-role="speed-slider" ` +
        `min="1" max="100" step="1" value="1" aria-label="${T('Galaxy.hud.warpSpeed')}">` +
        `</div>` +
        `<div class="gx-row"><span class="gx-k gx-muted">${T('Galaxy.hud.hyperfluxBurn')}</span>` +
        `<span class="gx-v gx-muted" data-role="burn-val">0.01/s</span></div>` +
        `<div class="gx-row"><span class="gx-k gx-muted">${T('Galaxy.hud.eta')}</span>` +
        `<span class="gx-v gx-muted" data-role="eta-val">-</span></div>` +
        `<div class="gx-actions">` +
        `<span class="gx-btn gx-step focusable" tabindex="0" data-action="speed-down">−</span>` +
        `<span class="gx-btn gx-step focusable" tabindex="0" data-action="speed-up">+</span>` +
        `<span class="gx-btn gx-stop focusable" tabindex="0" data-action="stop">${T('Galaxy.hud.stop')}</span>` +
        `</div>`;

      // Always-on fuel gauges.
      const fuel = document.createElement("div");
      fuel.id = "gx-fuel";
      fuel.className = "gx-panel";
      fuel.innerHTML =
        `<div class="gx-fuel-head"><span class="gx-title">${T('Galaxy.hud.fuel')}</span>` +
        `<span class="gx-muted" data-role="fuel-sub">${T('Galaxy.hud.hyperfluxReserve')}</span>` +
        `<span class="gx-fuel-pct" data-role="hf-pct">-</span></div>` +
        `<div class="gx-fuel-row"><span class="gx-fuel-name">${T('Galaxy.hud.hyperflux')}</span>` +
        `<span class="gx-fuel-bar"><span class="gx-fuel-fill hyperflux" data-role="hf-fill"></span></span>` +
        `<span class="gx-fuel-val" data-role="hf-val">-</span></div>` +
        // Schrödingerite was a strip of up to 46 little pellets, rebuilt as
        // innerHTML every time a single charge moved. It is a count, so it
        // reads as one: the same bar and number the other two rows use.
        `<div class="gx-fuel-row"><span class="gx-fuel-name">${T('Galaxy.hud.schrD')}</span>` +
        `<span class="gx-fuel-bar"><span class="gx-fuel-fill schrod" data-role="sb-fill"></span></span>` +
        `<span class="gx-fuel-val" data-role="sb-val">-</span></div>` +
        `<div class="gx-fuel-row"><span class="gx-fuel-name">${T('Galaxy.hud.mapFuel')}</span>` +
        `<span class="gx-fuel-bar"><span class="gx-fuel-fill mapfuel" data-role="mf-fill"></span></span>` +
        `<span class="gx-fuel-val" data-role="mf-val">-</span></div>` +
        // The Refuel button itself now stands on the left rail with the other
        // actions; what stays here is the line saying where the fuel is coming
        // from, which belongs beside the gauges it explains.
        `<div class="gx-refuel-row">` +
        `<span class="gx-refuel-hint" data-role="refuel-hint"></span></div>`;

      const mode = document.createElement("div");
      mode.id = "gx-mode";
      // The line names where the view is, and nothing else: the game prints no
      // key legends (docs/task/ui_fixing.md).
      mode.innerHTML = `<b>${T('Galaxy.hud.orbit')}</b>`;

      // Grand Tour: the one line left on screen while the slideshow runs -
      // every other panel, orbit guide and name is hidden (see .gx-tour-active).
      const tourHint = document.createElement("div");
      tourHint.id = "gx-tour-hint";

      // Zoom position within the current scale's distance range: the "slider"
      // the wheel travels along, so the player can see how much range is left
      // before the view steps to the next scale.
      const zoom = document.createElement("div");
      zoom.id = "gx-zoom";
      zoom.innerHTML =
        `<div class="gx-zoom-fill" data-role="zoom-fill"></div>` +
        `<div class="gx-zoom-knob" data-role="zoom-knob"></div>`;

      const tooltip = document.createElement("div");
      tooltip.id = "gx-tooltip";

      // SB-Bridge warp animation plate (hidden until a jump fires).
      const warp = document.createElement("div");
      warp.id = "gx-warp";
      warp.innerHTML =
        `<div class="gx-warp-flash" data-role="warp-flash"></div>` +
        `<div class="gx-warp-box" data-role="warp-box"></div>` +
        `<div class="gx-warp-core" data-role="warp-core"></div>`;

      // Landing-site picker: unwrapped planet texture as a clickable grid.
      const landingGrid = document.createElement("div");
      landingGrid.id = "gx-landing-grid";
      landingGrid.innerHTML =
        `<div class="gx-lg-card">` +
        `<div class="gx-title" data-role="lg-title">${T('Galaxy.hud.chooseLandingSite')}</div>` +
        `<canvas class="gx-lg-canvas" data-role="lg-canvas" width="640" height="360"></canvas>` +
        `<div class="gx-actions">` +
        // Two ways down onto a world: set the ship on it, or walk it. The
        // choice is made before a square is picked, and the square then does
        // whichever is selected.
        `<span class="gx-btn focusable gx-lg-mode is-on" tabindex="0" data-action="landing-mode" data-mode="land">${T('Galaxy.hud.landHere')}</span>` +
        `<span class="gx-btn focusable gx-lg-mode" tabindex="0" data-action="landing-mode" data-mode="walk">${T('Galaxy.hud.liminalWalk')}</span>` +
        // The third way down, and the only one that never touches the ground:
        // the ship itself is flown over the world (see startLiminalFlyby).
        `<span class="gx-btn focusable gx-lg-mode" tabindex="0" data-action="landing-mode" data-mode="flyby">${T('Galaxy.hud.flyby')}</span>` +
        `<span class="gx-btn focusable" tabindex="0" data-action="landing-grid-cancel">${T('Galaxy.hud.cancel')}</span>` +
        `</div></div>`;

      // Servicing bay (Hubble): part-by-part repair against crafting materials.
      const service = document.createElement("div");
      service.id = "gx-service";
      service.innerHTML =
        `<div class="gx-svc-card">` +
        `<div class="gx-title" data-role="svc-title">${T('Galaxy.hud.servicingBay')}</div>` +
        `<div class="gx-muted" data-role="svc-sub"></div>` +
        `<div class="gx-divider"></div>` +
        `<div class="gx-svc-list" data-role="svc-list"></div>` +
        `<div class="gx-actions" data-role="svc-actions"></div>` +
        `</div>`;

      // Anomaly log: the branching encounter on the world that was signalling.
      const anomaly = document.createElement("div");
      anomaly.id = "gx-anomaly";
      anomaly.innerHTML =
        `<div class="gx-anom-card">` +
        `<div class="gx-anom-where" data-role="anom-where"></div>` +
        `<div class="gx-title" data-role="anom-title"></div>` +
        `<div class="gx-divider"></div>` +
        `<div class="gx-anom-body" data-role="anom-body"></div>` +
        `<div class="gx-anom-choices" data-role="anom-choices"></div>` +
        `</div>`;

      // Strip-mining console: progress, clock and the ore as it comes aboard.
      const mining = document.createElement("div");
      mining.id = "gx-mining";
      mining.innerHTML =
        `<div class="gx-mine-head"><span class="gx-title" data-role="mine-title">${T('Galaxy.hud.stripMining')}</span>` +
        `<span class="gx-mine-clock" data-role="mine-clock">0:00</span></div>` +
        `<div class="gx-mine-bar"><div class="gx-mine-fill" data-role="mine-fill"></div></div>` +
        `<div class="gx-row"><span class="gx-k gx-muted" data-role="mine-stat">-</span>` +
        `<span class="gx-v gx-muted" data-role="mine-fuel">-</span></div>` +
        `<div class="gx-mine-log" data-role="mine-log"></div>` +
        `<div class="gx-actions">` +
        `<span class="gx-btn gx-stop focusable" tabindex="0" data-action="mine-stop">${T('Galaxy.hud.cutLasers')}</span>` +
        `</div>`;

      // Left column, top to bottom: scale, button rail, selection, engine.
      const left = document.createElement("div");
      left.id = "gx-left";
      left.appendChild(scale);
      left.appendChild(catToggle);
      left.appendChild(info);
      left.appendChild(speed);

      root.appendChild(left);
      root.appendChild(catBtn);
      root.appendChild(catalog);
      root.appendChild(fuel);
      root.appendChild(mode);
      root.appendChild(tourHint);
      root.appendChild(zoom);
      root.appendChild(tooltip);
      root.appendChild(warp);
      root.appendChild(landingGrid);
      root.appendChild(service);
      root.appendChild(anomaly);
      root.appendChild(mining);
      this.parent.appendChild(root);

      this.root = root;
      this.els.scaleName = scale.querySelector('[data-role="scale-name"]');
      this.els.scaleSub = scale.querySelector('[data-role="scale-sub"]');
      this.els.info = info;
      this.els.speed = speed;
      this.els.speedVal = speed.querySelector('[data-role="speed-val"]');
      this.els.burnVal = speed.querySelector('[data-role="burn-val"]');
      this.els.etaVal = speed.querySelector('[data-role="eta-val"]');
      this.els.speedSlider = speed.querySelector('[data-role="speed-slider"]');
      this.els.fuel = fuel;
      this.els.hfFill = fuel.querySelector('[data-role="hf-fill"]');
      this.els.hfVal = fuel.querySelector('[data-role="hf-val"]');
      this.els.hfPct = fuel.querySelector('[data-role="hf-pct"]');
      this.els.fuelSub = fuel.querySelector('[data-role="fuel-sub"]');
      this.els.refuelHint = fuel.querySelector('[data-role="refuel-hint"]');
      this.els.sbFill = fuel.querySelector('[data-role="sb-fill"]');
      this.els.sbVal = fuel.querySelector('[data-role="sb-val"]');
      this.els.mfFill = fuel.querySelector('[data-role="mf-fill"]');
      this.els.mfVal = fuel.querySelector('[data-role="mf-val"]');
      this.els.mode = mode;
      this.els.tourHint = tourHint;
      this.els.zoom = zoom;
      this.els.zoomKnob = zoom.querySelector('[data-role="zoom-knob"]');
      this.els.zoomFill = zoom.querySelector('[data-role="zoom-fill"]');
      this.els.tooltip = tooltip;
      this.els.catalog = catalog;
      this.els.catToggle = catToggle;
      this.els.homeBtn = catToggle.querySelector('[data-role="home-btn"]');
      this.els.bridgeBtn = catToggle.querySelector('[data-role="bridge-btn"]');
      this.els.sbBtn = catToggle.querySelector('[data-role="sb-btn"]');
      this.els.returnEarthBtn = catToggle.querySelector('[data-role="return-earth-btn"]');
      this.els.returnEarthCourseBtn = catToggle.querySelector('[data-role="return-earth-course-btn"]');
      this.els.refuelBtn = catToggle.querySelector('[data-role="refuel-btn"]');
      this.els.warp = warp;
      this.els.warpFlash = warp.querySelector('[data-role="warp-flash"]');
      this.els.warpBox = warp.querySelector('[data-role="warp-box"]');
      this.els.warpCore = warp.querySelector('[data-role="warp-core"]');
      this.els.service = service;
      this.els.svcTitle = service.querySelector('[data-role="svc-title"]');
      this.els.svcSub = service.querySelector('[data-role="svc-sub"]');
      this.els.svcList = service.querySelector('[data-role="svc-list"]');
      this.els.svcActions = service.querySelector('[data-role="svc-actions"]');
      this.els.anomaly = anomaly;
      this.els.anomWhere = anomaly.querySelector('[data-role="anom-where"]');
      this.els.anomTitle = anomaly.querySelector('[data-role="anom-title"]');
      this.els.anomBody = anomaly.querySelector('[data-role="anom-body"]');
      this.els.anomChoices = anomaly.querySelector('[data-role="anom-choices"]');
      this.els.mining = mining;
      this.els.mineTitle = mining.querySelector('[data-role="mine-title"]');
      this.els.mineClock = mining.querySelector('[data-role="mine-clock"]');
      this.els.mineFill = mining.querySelector('[data-role="mine-fill"]');
      this.els.mineStat = mining.querySelector('[data-role="mine-stat"]');
      this.els.mineFuel = mining.querySelector('[data-role="mine-fuel"]');
      this.els.mineLog = mining.querySelector('[data-role="mine-log"]');
      this._wire(mining);
      // The parts list owns the wheel while the pointer is over it.
      this.els.svcList.addEventListener("wheel", (e) => {
        e.stopPropagation();
        const max = this.els.svcList.scrollHeight - this.els.svcList.clientHeight;
        if (max <= 0) return;
        e.preventDefault();
        this.els.svcList.scrollTop = Math.max(0, Math.min(max, this.els.svcList.scrollTop + e.deltaY));
      }, { passive: false });
      // The encounter's prose owns the wheel while the pointer is over it.
      this.els.anomBody.addEventListener("wheel", (e) => {
        e.stopPropagation();
        const max = this.els.anomBody.scrollHeight - this.els.anomBody.clientHeight;
        if (max <= 0) return;
        e.preventDefault();
        this.els.anomBody.scrollTop = Math.max(0, Math.min(max, this.els.anomBody.scrollTop + e.deltaY));
      }, { passive: false });
      this.els.landingGrid = landingGrid;
      this.els.landingGridTitle = landingGrid.querySelector('[data-role="lg-title"]');
      this.els.landingGridCanvas = landingGrid.querySelector('[data-role="lg-canvas"]');
      this.els.landingGridCanvas.addEventListener("click", (e) => {
        const lg = this._landingGrid;
        if (!lg) return;
        const canvas = this.els.landingGridCanvas;
        const rect = canvas.getBoundingClientRect();
        const px = (e.clientX - rect.left) * (canvas.width / rect.width);
        const py = (e.clientY - rect.top) * (canvas.height / rect.height);
        const gx = Math.max(0, Math.min(lg.w - 1, Math.floor(px / (canvas.width / lg.w))));
        const gy = Math.max(0, Math.min(lg.h - 1, Math.floor(py / (canvas.height / lg.h))));
        lg.cursor.gx = gx;
        lg.cursor.gy = gy;
        this._confirmLandingGrid();
      });
      this._wire(landingGrid);
      // The warp-speed slider drives var 94 live as it is dragged.
      if (this.els.speedSlider) {
        this.els.speedSlider.addEventListener("input", (e) => {
          const v = parseInt(e.target.value, 10) || 1;
          if (this.callbacks && this.callbacks.onSpeedSet) this.callbacks.onSpeedSet(v);
        });
      }
      // The scrim behind the modal is the panel's own ::before, so a click on
      // it lands on the panel element itself rather than on any of its rows:
      // outside the box is a click on the sky, and it closes the catalog the
      // way clicking away from a modal is expected to.
      catalog.addEventListener("mousedown", (e) => {
        const box = catalog.getBoundingClientRect();
        const out = e.clientX < box.left || e.clientX > box.right ||
                    e.clientY < box.top || e.clientY > box.bottom;
        if (!out) return;
        e.preventDefault();
        e.stopPropagation();
        if (this.callbacks.onCatalogToggle) this.callbacks.onCatalogToggle();
        else this.setCatalogOpen(false);
      });

      // The catalog owns the wheel while the pointer is over it: scroll the
      // list instead of letting the gesture fall through to the camera zoom.
      catalog.addEventListener("wheel", (e) => {
        const body = catalog.querySelector(".gx-cat-scroll");
        if (body) {
          e.preventDefault();
          e.stopPropagation();
          const room = body.scrollHeight - body.clientHeight;
          body.scrollTop = Math.max(0, Math.min(room, body.scrollTop + e.deltaY));
          return;
        }
        e.stopPropagation();
        const max = catalog.scrollHeight - catalog.clientHeight;
        if (max <= 0) return;
        e.preventDefault();
        catalog.scrollTop = Math.max(0, Math.min(max, catalog.scrollTop + e.deltaY));
      }, { passive: false });

      this._wire(speed);
      this._wire(catBtn);
      this._wire(catToggle);
      this._wire(fuel);
      this._invalidateFocusables();
      // Park the knob mid-rail so the slider reads as present before the first
      // frame writes a real fraction.
      this.setZoomFraction(0.5);
    }

    /** Label the home button with the system the ship is actually in. */
    setHomeSystem(name) {
      if (!this.els.homeBtn || name === this._homeName) return;
      this._homeName = name;
      this.els.homeBtn.textContent = name || "Home";
      window.UIPanel.toggle(this.els.homeBtn, !!name);
      this._invalidateFocusables();
    }

    /** Offer the bridge, or take it away: there is only a ship to fly by hand
     *  while it is sitting in orbit of a world. */
    setBridgeOffered(on) {
      if (!this.els.bridgeBtn || !!on === this._bridgeOffered) return;
      this._bridgeOffered = !!on;
      window.UIPanel.toggle(this.els.bridgeBtn, !!on);
      this._invalidateFocusables();
    }

    // ---- Catalog ----------------------------------------------------------
    /**
     * @param {{id:string,title:string,empty:string,
     *          groups:{title:string,life:boolean,
     *            items:{id:string,name:string,sub:string,course:boolean,depth:number}[]}[]
     *         }[]} tabs  `depth` (0/1/2) indents a row under its parent - the
     *          Current System tab's star/planet/moon hierarchy.
     * @param {string} [activeId] tab to show (defaults to the current one)
     * @param {boolean} [expandFirst] open the active tab's first drawer
     */
    setCatalog(tabs, activeId, expandFirst) {
      if (!this.els.catalog) return;
      this._catTabs = (tabs || []).map((t) => ({
        id: t.id,
        title: t.title,
        empty: t.empty,
        groups: (t.groups || []).filter((g) => g.items && g.items.length),
      }));
      if (activeId && this._catTabs.some((t) => t.id === activeId)) this._catTab = activeId;
      if (!this._catTabs.some((t) => t.id === this._catTab)) {
        this._catTab = this._catTabs.length ? this._catTabs[0].id : null;
      }
      // `expandFirst` is vestigial: groups no longer collapse.
      void expandFirst;
      this._renderCatalog();
    }

    // What the catalog is showing right now: with the In View filter on (the
    // state it opens in), only the bodies the camera is actually pointed at,
    // which is what makes the list worth reading at all - the full catalog is
    // thousands of stars long. A row the scene could not place carries no
    // `inView` at all and is treated as out of view.
    _catVisibleGroups(tab) {
      const groups = (tab && tab.groups) || [];
      if (!this._catInView) return groups;
      return groups
        .map((g) => ({ ...g, items: g.items.filter((it) => it.inView) }))
        .filter((g) => g.items.length);
    }

    _catCount(tab) {
      return this._catVisibleGroups(tab).reduce((n, g) => n + g.items.length, 0);
    }

    _renderCatalog() {
      const cat = this.els.catalog;
      if (!cat) return;
      const tabs = this._catTabs || [];
      const active = tabs.find((t) => t.id === this._catTab);
      // A tab's count is what the filter has left in it, so the strip says
      // where there is anything to look at before a tab is opened.
      const tabsHtml = tabs.length > 1
        ? `<div class="gx-cat-tabs">` + tabs.map((t) => {
          const n = this._catCount(t);
          return `<span class="gx-btn gx-cat-tab focusable${t.id === this._catTab ? " gx-on" : ""}` +
            `${n ? "" : " gx-cat-tab-empty"}" ` +
            `tabindex="0" data-action="cat-tab" data-target="${esc(t.id)}">${esc(t.title)}` +
            `<span class="gx-cat-count">${n}</span></span>`;
        }).join("") + `</div>`
        : "";
      // Groups are headings, not drawers: every list is always open. Collapsing
      // them hid the contents behind an extra click for no gain - the panel
      // scrolls, and a heading you have to open is a heading you can miss.
      const groups = this._catVisibleGroups(active);
      const body = groups.map((g) => {
        const rows = g.items.map((it) =>
          `<div class="gx-cat-row${g.life ? " gx-cat-life" : ""}` +
          `${it.depth ? " gx-cat-depth-" + it.depth : ""}"><span class="gx-cat-label">` +
          `<span class="gx-cat-name">${esc(it.name)}</span>` +
          (it.sub ? `<span class="gx-cat-type">${esc(it.sub)}</span>` : "") +
          `</span>` +
          `<span class="gx-btn focusable" tabindex="0" data-action="cat-zoom" ` +
          `data-target="${esc(it.id)}">${T('Galaxy.hud.zoom')}</span>` +
          (it.course
            ? `<span class="gx-btn gx-land focusable" tabindex="0" data-action="cat-course" ` +
              `data-target="${esc(it.id)}" title="${T('Galaxy.hud.plotACourseToThis')}">` +
              `${T('Galaxy.hud.setCourse')}</span>`
            : "") +
          `</div>`).join("");
        return `<div class="gx-cat-group">` +
          `<span>${esc(g.title)}</span>` +
          `<span class="gx-cat-count">${g.items.length}</span></div>` +
          `<div class="gx-cat-body">${rows}</div>`;
      }).join("");
      // An empty list under the filter is not an empty catalog: it means the
      // camera is pointed somewhere else, and the way out is the filter, not
      // more scrolling.
      const emptyText = this._catInView
        ? T('Galaxy.hud.nothingInView')
        : ((active && active.empty) || T('Galaxy.hud.nothingCatalogued'));
      const prev = cat.querySelector(".gx-cat-scroll");
      const scrollTop = prev ? prev.scrollTop : 0;
      cat.innerHTML =
        `<div class="gx-cat-head">` +
          `<div class="gx-title">${T('Galaxy.hud.catalog')}</div>` +
          `<span class="gx-btn gx-cat-filter focusable${this._catInView ? " gx-on" : ""}" ` +
            `tabindex="0" data-action="cat-view" ` +
            `title="${T('Galaxy.hud.catalogViewTooltip')}">` +
            `${this._catInView ? T('Galaxy.hud.catalogInView') : T('Galaxy.hud.catalogAll')}</span>` +
          `<span class="gx-btn focusable" tabindex="0" data-action="catalog">` +
            `${T('Galaxy.hud.close')}</span>` +
        `</div>` + tabsHtml +
        `<div class="gx-cat-scroll">` +
        (body || `<div class="gx-cat-empty">${esc(emptyText)}</div>`) +
        `</div>`;
      const scroller = cat.querySelector(".gx-cat-scroll");
      if (scroller) scroller.scrollTop = scrollTop;
      this._wire(cat);
      this._invalidateFocusables();
    }

    // In View / All. The list is rebuilt where it stands; the scroll goes back
    // to the top, since the rows under the cursor are not the same rows.
    _setCatalogViewFilter(on) {
      const wanted = on == null ? !this._catInView : !!on;
      if (wanted === this._catInView) return;
      this._catInView = wanted;
      this._focusEl = null;
      // The scene answers this by re-marking the rows and handing them back
      // through setCatalog, which renders; the render below is what happens
      // when nobody is listening.
      if (this.callbacks.onCatalogFilter) this.callbacks.onCatalogFilter(wanted);
      this._renderCatalog();
      this._refocusCatalog('[data-action="cat-view"]');
    }

    _setCatalogTab(id) {
      if (!id || id === this._catTab) return;
      this._catTab = id;
      this._focusEl = null;
      const scroller = this.els.catalog && this.els.catalog.querySelector(".gx-cat-scroll");
      if (scroller) scroller.scrollTop = 0;
      this._renderCatalog();
      this._refocusCatalog(`[data-action="cat-tab"][data-target="${id}"]`);
    }

    // Keep the focus ring on the row the player just acted on, so keyboard and
    // controller navigation survives the re-render.
    _refocusCatalog(selector) {
      const el = this.els.catalog && this.els.catalog.querySelector(selector);
      if (!el) return;
      this._focusEl = el;
      this._applyFocusClass();
    }

    isCatalogOpen() {
      if (window.GalaxySim && typeof window.GalaxySim.isShipControlsOpen === "function") {
        return window.GalaxySim.isShipControlsOpen();
      }
      return window.UIPanel.isOpen(this.els.catalog);
    }

    /** Whether the open catalog is showing only what the camera has in frame. */
    isCatalogInView() {
      return this.isCatalogOpen() && !!this._catInView;
    }

    setCatalogOpen(open) {
      if (window.GalaxySim && typeof window.GalaxySim.openShipControls === "function") {
        if (open) window.GalaxySim.openShipControls();
        else if (typeof window.GalaxySim.closeShipControls === "function") window.GalaxySim.closeShipControls();
      }
      if (!this.els.catalog) return;
      window.UIPanel.toggle(this.els.catalog, open);
      if (open) {
        // Every opening starts on what the camera is looking at: the filter is
        // a way of reading the list, not a setting to remember.
        this._catInView = true;
        this._renderCatalog();
        const scroller = this.els.catalog.querySelector(".gx-cat-scroll");
        if (scroller) scroller.scrollTop = 0;
      }
      this._focusEl = null;
      this._applyFocusClass();
      this._invalidateFocusables();
    }

    // ---- Speed / engine panel (shown while travelling) --------------------
    // etaSeconds is the time left on the current leg (see Scene3D's
    // _travelEta, mirroring ShipBackground.travelEta's real-time maths), or
    // null/undefined while there is nothing to count down.
    showSpeed(speed, etaSeconds) {
      const s = speed || 1;
      const text = "×" + s;
      if (this.els.speedVal && text !== this._speedText) {
        this._speedText = text;
        this.els.speedVal.textContent = text;
        // Quadratic Hyperflux burn, mirrored from DataManager.updateShipPosition.
        if (this.els.burnVal) {
          this.els.burnVal.textContent = (s * s * 0.01).toFixed(2) + "/s";
        }
      }
      if (this.els.etaVal) {
        const secs = (typeof etaSeconds === "number" && isFinite(etaSeconds) && etaSeconds >= 0)
          ? Math.ceil(etaSeconds) : null;
        const text = secs != null
          ? String(Math.floor(secs / 60)).padStart(2, "0") + ":" + String(secs % 60).padStart(2, "0")
          : "-";
        if (text !== this._etaText) {
          this._etaText = text;
          this.els.etaVal.textContent = text;
        }
      }
      // Keep the slider in step unless the player is actively dragging it.
      if (this.els.speedSlider && document.activeElement !== this.els.speedSlider &&
          String(s) !== this.els.speedSlider.value) {
        this.els.speedSlider.value = String(s);
      }
      if (this.els.speed && !this._speedShown) {
        this._speedShown = true;
        window.UIPanel.open(this.els.speed);
        this._invalidateFocusables();
      }
    }
    hideSpeed() {
      if (this.els.speed && this._speedShown) {
        this._speedShown = false;
        window.UIPanel.close(this.els.speed);
        this._invalidateFocusables();
      }
    }
    isSpeedShown() { return window.UIPanel.isOpen(this.els.speed); }

    // ---- Fuel gauges ------------------------------------------------------
    /**
     * @param {object} f { hyperflux, hyperfluxMax, schrodingerite,
     *   schrodingeriteMax, mapFuel, mapFuelMax }
     */
    setFuels(f) {
      f = f || {};
      const key = [f.hyperflux, f.schrodingerite, f.mapFuel].map((v) =>
        Math.round(Number(v) || 0)).join("|");
      if (key === this._fuelKey) return; // skip redundant DOM writes
      this._fuelKey = key;

      // Hyperflux is the fuel that matters for travel, so it gets the headline
      // percentage as well as the litres-of-capacity readout, and both go red
      // once the reserve is low enough that the next hop is in question.
      const hfMax = f.hyperfluxMax || 92000;
      const hf = Math.max(0, Math.min(hfMax, f.hyperflux || 0));
      const hfFrac = hfMax > 0 ? hf / hfMax : 0;
      const low = hfFrac < 0.2;
      if (this.els.hfFill) {
        window.UIPanel.setBar(this.els.hfFill, (hfFrac * 100).toFixed(1));
        this.els.hfFill.classList.toggle("gx-low", low);
      }
      if (this.els.hfVal) {
        this.els.hfVal.textContent = Math.round(hf).toLocaleString() + " / " +
          Math.round(hfMax).toLocaleString() + " L";
      }
      if (this.els.hfPct) {
        this.els.hfPct.textContent = (hfFrac * 100).toFixed(hfFrac < 0.1 ? 1 : 0) + "%";
        this.els.hfPct.classList.toggle("gx-low", low);
      }

      const sbMax = f.schrodingeriteMax || 92;
      const sb = Math.max(0, Math.min(sbMax, Math.floor(f.schrodingerite || 0)));
      if (this.els.sbVal) this.els.sbVal.textContent = sb + " / " + sbMax;
      if (this.els.sbFill) {
        window.UIPanel.setBar(this.els.sbFill,
          (sbMax > 0 ? (sb / sbMax) * 100 : 0).toFixed(1));
      }

      const mfMax = f.mapFuelMax || 10000;
      const mf = Math.max(0, f.mapFuel || 0);
      if (this.els.mfFill) {
        window.UIPanel.setBar(this.els.mfFill, (Math.min(1, mf / mfMax) * 100).toFixed(1));
      }
      if (this.els.mfVal) {
        this.els.mfVal.textContent = Math.round(mf).toLocaleString() + " / " +
          Math.round(mfMax).toLocaleString() + " L";
      }
    }

    // ---- Refuel button / status ------------------------------------------
    /**
     * @param {object} s { label, hint, sub, enabled, active }
     *   label   button caption ("Refuel" / "Stop Refuel")
     *   hint    where the Hyperflux is coming from, shown beside the button
     *   sub     one-line status under the panel title
     *   enabled false greys the button out
     *   active  true while the pumps are running (highlighted button)
     */
    setRefuel(s) {
      s = s || {};
      const key = [s.label, s.hint, s.sub, s.enabled ? 1 : 0, s.active ? 1 : 0].join("|");
      if (key === this._refuelKey) return; // skip redundant DOM writes
      this._refuelKey = key;
      const btn = this.els.refuelBtn;
      if (btn) {
        const label = s.label || T('Galaxy.hud.refuel');
        if (btn.textContent !== label) btn.textContent = label;
        btn.classList.toggle("gx-disabled", !s.enabled);
        btn.classList.toggle("gx-on", !!s.active);
      }
      if (this.els.refuelHint) this.els.refuelHint.textContent = s.hint || "";
      if (this.els.fuelSub) this.els.fuelSub.textContent = s.sub || T('Galaxy.hud.hyperfluxReserve');
    }

    // ---- SB-Bridge button state ------------------------------------------
    /** @param {boolean} enabled  @param {string} [label] destination name */
    setSbBridge(enabled, label) {
      const btn = this.els.sbBtn;
      if (!btn) return;
      const on = !!enabled;
      if (on !== this._sbEnabled) {
        this._sbEnabled = on;
        btn.classList.toggle("gx-disabled", !on);
      }
      const text = T('Galaxy.hud.sbBridge') + (label ? " → " + label : "");
      if (text !== this._sbLabel) { this._sbLabel = text; btn.textContent = text; }
    }

    // ---- Return to Earth: toggling the button reveals the course it plots ---
    // There used to be a second sub-action here, EB Bridge, which was the
    // Schrödinger-Bohr bridge pointed at Earth - the same jump the SB-Bridge
    // button already makes, under a second name. Going home is one button now.
    isReturnEarthOpen() { return !!this._returnEarthOpen; }

    setReturnEarthOpen(open) {
      this._returnEarthOpen = !!open;
      const show = this._returnEarthOpen ? "" : "none";
      window.UIPanel.toggle(this.els.returnEarthCourseBtn, show);
      this._invalidateFocusables();
    }

    /** @param {boolean} canCourse */
    setReturnEarthOptions(canCourse) {
      if (this.els.returnEarthCourseBtn) {
        this.els.returnEarthCourseBtn.classList.toggle("gx-disabled", !canCourse);
      }
    }

    // ---- SB-Bridge warp animation ----------------------------------------
    // A box-shaped wormhole door opens between the two locations; `mid` fires
    // once it's fully open (do the teleport there so the scene swap is hidden
    // behind the door), `done` once it has folded shut again.
    playWarp(mid, done) {
      const w = this.els.warp;
      if (!w) { if (mid) mid(); if (done) done(); return; }
      const flash = this.els.warpFlash;
      const core = this.els.warpCore;
      const box = this.els.warpBox;
      window.UIPanel.open(w);
      // Restart the CSS animations by clearing and reassigning on the next frame.
      flash.classList.remove("gx-warping");
      core.classList.remove("gx-warping");
      if (box) box.classList.remove("gx-warping");
      // eslint-disable-next-line no-unused-expressions
      void w.offsetWidth;
      const DUR = 1200;
      flash.classList.add("gx-warping");
      core.classList.add("gx-warping");
      if (box) box.classList.add("gx-warping");
      if (this._warpMidTimer) clearTimeout(this._warpMidTimer);
      if (this._warpEndTimer) clearTimeout(this._warpEndTimer);
      // Fires once the door is fully open (the kf plateau starts at 42%).
      this._warpMidTimer = setTimeout(() => { if (mid) mid(); }, DUR * 0.42);
      this._warpEndTimer = setTimeout(() => {
        window.UIPanel.close(w);
        flash.classList.remove("gx-warping");
        core.classList.remove("gx-warping");
        if (box) box.classList.remove("gx-warping");
        if (done) done();
      }, DUR);
    }

    /** @param {number} f 0 = fully zoomed out, 1 = fully zoomed in. */
    setZoomFraction(f) {
      if (!this.els.zoomKnob) return;
      const pct = Math.round((1 - Math.max(0, Math.min(1, f || 0))) * 1000) / 10;
      if (pct === this._zoomPct) return; // skip redundant style writes
      this._zoomPct = pct;
      this.els.zoomKnob.style.setProperty("--ui-at-y", pct + "%");
      window.UIPanel.setBar(this.els.zoomFill, 100 - pct, "h");
    }

    setScale(name, sub) {
      if (this.els.scaleName) this.els.scaleName.textContent = name || "";
      if (this.els.scaleSub) this.els.scaleSub.textContent = sub || "";
    }
    // Minimal viewer mode (see GalaxySim.openStarMapMinigame): hides the ship,
    // engines, fuel and every bridge/return-home control via CSS (.gx-minigame
    // in theme.css), leaving the catalog, info panels and Grand Tour untouched.
    setMinigameMode(on) {
      if (this.root) this.root.classList.toggle("gx-minigame", !!on);
      this._invalidateFocusables();
    }
    setModeHint(html) {
      if (this.els.mode) {
        this.els.mode.innerHTML = padGlyphs(html);
        this._invalidateFocusables();
      }
    }

    // ---- Grand Tour: every panel, orbit guide and name hidden, one line left --
    isTourActive() { return !!this._tourActive; }
    /** @param {boolean} active @param {string} [hintHtml] shown while active */
    setTourMode(active, hintHtml) {
      if (!this.root) return;
      const on = !!active;
      if (on === this._tourActive) return;
      this._tourActive = on;
      this.root.classList.toggle("gx-tour-active", on);
      if (this.els.tourHint) {
        if (on) this.els.tourHint.innerHTML = padGlyphs(hintHtml || "");
        window.UIPanel.toggle(this.els.tourHint, on);
      }
      this._invalidateFocusables();
    }

    // ---- Tooltip ----------------------------------------------------------
    showTooltip(name, type, x, y) {
      const t = this.els.tooltip;
      if (!t) return;
      if (name !== this._ttName || type !== this._ttType) {
        this._ttName = name;
        this._ttType = type;
        t.innerHTML = `${esc(name)}` +
          (type ? `<div class="gx-tt-type">${esc(String(type).replace(/_/g, " "))}</div>` : "");
      }
      window.UIPanel.placeAt(t, x, y);
      window.UIPanel.open(t);
    }
    hideTooltip() { window.UIPanel.close(this.els.tooltip); }

    // ---- Selection panel --------------------------------------------------
    hasSelection() { return !!this._selection; }
    hasFocusables() { return this._getFocusables().length > 0; }

    _rows(pairs) {
      return pairs
        .filter((p) => p[1] != null)
        .map((p) => `<div class="gx-row"><span class="gx-k">${esc(p[0])}</span>` +
          `<span class="gx-v">${esc(p[1])}</span></div>`)
        .join("");
    }

    showSystem(system, opts) {
      opts = opts || {};
      this._selection = { kind: "star", data: system, system };
      // Companion/donor stars of an N-ary system carry no position of their
      // own (they ride an orbit inside the system that owns them).
      const p = system.position;
      const dist = p
        ? Math.sqrt((p.x || 0) ** 2 + (p.y || 0) ** 2 + (p.z || 0) ** 2)
        : null;
      const rows = this._rows([
        [T('Galaxy.row.starType'), T('Galaxy.row.starClass',
          { type: String(system.type || "?").replace(/_/g, " ") })],
        [T('Galaxy.row.mass'), num(system.mass, 2) != null ? num(system.mass, 2) + " M☉" : null],
        [T('Galaxy.row.radius'), num(system.radius, 2) != null ? num(system.radius, 2) + " R☉" : null],
        [T('Galaxy.row.temperature'), num(system.temperature, 0) != null ? Math.floor(system.temperature) + " K" : null],
        [T('Galaxy.row.distance'), dist != null ? num(dist, 2) + " ly" : null],
        [T('Galaxy.row.planets'), system.planets ? system.planets.length : null],
        [T('Galaxy.row.memberOf'), system._companionOf || null],
        [T('Galaxy.row.companions'), (system.companions && system.companions.length) || null],
        [T('Galaxy.row.feedingOn'), (system.feeding && system.feeding.donor && system.feeding.donor.name) || null],
        // Patron systems (PatreonRewards) name the person the world is for.
        [T('Galaxy.row.chartedFor'), (system.patron && system.patron.name) || null],
        [T('Galaxy.row.megastructure'), system.dyson
          ? (system.dyson === "abandoned" ? T('Galaxy.row.dysonAbandoned')
                                          : T('Galaxy.row.dyson')) : null],
        // What is left of Earth's clock, on the body carrying it in (Nibiru
        // reads as a system of its own until 2010; see GalaxySim.Nibiru).
        [T('Galaxy.nibiru.impactRow'), impactCountdown(system)],
      ]);
      let actions = ZOOM_BTN + bookmarkBtn(!!opts.isBookmarked);
      if (opts.canEnter) {
        actions += `<span class="gx-btn gx-land focusable" tabindex="0" data-action="enter-system" ` +
          `data-target="${esc(system.name)}">${T('Galaxy.hud.enterSystem')}</span>`;
      }
      if (opts.canTravel) {
        actions += `<span class="gx-btn focusable" tabindex="0" data-action="travel-system" ` +
          `data-target="${esc(system.name)}">${T('Galaxy.hud.travelHere')}</span>`;
      } else if (opts.isCurrent && !opts.canEnter) {
        actions += `<span class="gx-muted">${T('Galaxy.hud.currentLocation')}</span>`;
      }
      // Park in orbit of the star/black hole itself - free while already in
      // this system (the star-scale equivalent of "Land Here").
      if (opts.canPark) {
        actions += `<span class="gx-btn gx-land focusable" tabindex="0" data-action="park-orbit">` +
          `${T('Galaxy.hud.parkInOrbit')}</span>`;
      } else if (opts.isParked) {
        actions += `<span class="gx-muted">${T('Galaxy.hud.parkedInOrbit')}</span>`;
      }
      // Refuel: only offered while parked in orbit of a main-sequence star
      // (see DataManager.isMainSequenceStar / canRefuel) - black holes and
      // exotic remnants (white dwarfs, neutron stars) can't refuel the ship.
      if (opts.canRefuel && !opts.isRefueling) {
        actions += `<span class="gx-btn gx-land focusable" tabindex="0" data-action="refuel-start">` +
          `${T('Galaxy.hud.refuel')}</span>`;
      } else if (opts.isRefueling) {
        actions += `<span class="gx-btn focusable" tabindex="0" data-action="refuel-stop">` +
          `${T('Galaxy.hud.stopRefuel')}</span>`;
      }
      // Harvest Schrödingerite: only at a black hole's orbit, gated by a
      // once-per-game-week-per-hole cooldown (see DataManager.canHarvestSchrodingerite).
      if (opts.harvestRunSec > 0) {
        // A flyby is under way: the hull is skimming the disk, and the panel
        // counts the run down instead of offering it again.
        // The live countdown belongs to the fuel panel, which redraws every
        // frame; this line only says the run is on.
        actions += `<span class="gx-muted">${T('Galaxy.hud.harvestRunning')}</span>`;
      } else if (opts.canHarvest) {
        actions += `<span class="gx-btn gx-land focusable" tabindex="0" data-action="harvest-schrodingerite">` +
          `${T('Galaxy.hud.harvestSchrDingerite')}</span>`;
      } else if (opts.harvestCooldownMin > 0) {
        actions += `<span class="gx-muted">${T('Galaxy.hud.rechargesIn')} ${esc(formatCooldown(opts.harvestCooldownMin))}</span>`;
      }
      // Schrödinger-Bohr bridge to a star: instant park in its orbit for 1
      // Schrödingerite, from anywhere.
      if (opts.canBohrBridge) {
        actions += `<span class="gx-btn gx-sb focusable" tabindex="0" data-action="sb-bohr" ` +
          `title="${T('Galaxy.hud.quantumBridgeStraightIntoOrbit')}">${T('Galaxy.hud.openSchrDingerBohrBridge')}</span>`;
      }
      const titleCls = (system.hardcoded || system.patron) ? "gx-title gx-hard" : "gx-title";
      // `label` is the readable name of a system whose key is a catalog id
      // (patron systems live under a "GX.<seed>.*" key like every other body of
      // a procedural galaxy, but are shown by name).
      // Actions ride directly under the title, above the stat rows: on a long
      // panel the buttons would otherwise sit below the fold and read as if
      // the body could not be acted on at all.
      this.els.info.innerHTML =
        `<div class="${titleCls}">${esc(system.label || system.name)}</div>` +
        (actions ? `<div class="gx-actions gx-actions-top">${actions}</div>` : "") +
        `<div class="gx-divider"></div>${rows}`;
      this._openInfo();
    }

    showBody(body, system, opts) {
      opts = opts || {};
      const locs = (body.landingLocations && body.landingLocations.length)
        ? body.landingLocations : null;
      this._selection = {
        kind: opts.kind || "planet", data: body, system,
        planet: opts.parentPlanet, landingLocations: locs,
      };
      const periodYr = typeof body.period === "number" ? body.period / 365 : null;
      const spin = worldSpin(body, system, opts);
      const rows = this._rows([
        [T('Galaxy.row.type'), bodyTypeLabel(String(body.type || "?").replace(/_/g, " "))],
        [T('Galaxy.row.radius'), num(body.radius, 2) != null ? num(body.radius, 2) + " R⊕" : null],
        [T('Galaxy.row.mass'), num(body.mass, 3) != null ? num(body.mass, 3) + " M⊕" : null],
        [T('Galaxy.row.orbit'), num(body.orbitRadius, 3) != null ? num(body.orbitRadius, 3) + " AU" : null],
        [T('Galaxy.row.period'), num(periodYr, 2) != null ? num(periodYr, 2) + " yr" : null],
        [T('Galaxy.row.gravity'), gravityLabel(body)],
        [T('Galaxy.row.dayLength'), dayLengthLabel(spin)],
        [T('Galaxy.row.tidallyLocked'), tidalLockLabel(spin)],
        [T('Galaxy.row.atmosphere'), body.atmosphere ? T('Galaxy.row.yes') : T('Galaxy.row.no')],
        // Breathable atmosphere comes from the planet type definition (passed in
        // via opts); "Has Life" is only shown when the planet actually has life.
        [T('Galaxy.row.breathableAir'), opts.breathable != null
          ? (opts.breathable ? T('Galaxy.row.yes') : T('Galaxy.row.no')) : null],
        // "Life" reads the biosignature the scan came back with. A real
        // biosphere reads as its strength against the party - Weak, Strong or
        // Hyper, which is how the world's own level stands against theirs
        // (GalaxySim.planetBioTier) - and a world that only grows the tentacle
        // things reads as trace signs; a dead world simply omits the row.
        [T('Galaxy.row.life'), opts.hasLife
          ? (opts.bioTier
            ? T('Galaxy.row.bioReading', { tier: bioTierLabel(opts.bioTier) })
            : T('Galaxy.row.detected'))
          : (opts.weakLife ? T('Galaxy.row.traceSigns') : null)],
        [T('Anomaly.ui.signalRow'), opts.canInvestigate ? T('Anomaly.ui.signalUnread') : null],
        [T('Galaxy.row.moons'), body.moons ? body.moons.length : null],
        // Anything the ship's lasers have already taken off this body.
        [T('Galaxy.row.oreBody'), opts.mining
          ? T('Galaxy.row.units', { remaining: opts.mining.remaining,
                                    capacity: opts.mining.capacity }) : null],
        [T('Galaxy.row.condition'), opts.hubbleCondition != null ? opts.hubbleCondition + "%" : null],
        [T('Galaxy.nibiru.impactRow'), impactCountdown(body)],
      ]);
      let actions = ZOOM_BTN + bookmarkBtn(!!opts.isBookmarked);
      if (opts.canTravelTo) {
        actions += `<span class="gx-btn focusable" tabindex="0" data-action="travel-planet">${T('Galaxy.hud.flyHere')}</span>`;
      }
      if (opts.canLand) {
        actions += `<span class="gx-btn gx-land focusable" tabindex="0" data-action="land">${T('Galaxy.hud.landHere')}</span>`;
      }
      // The world that was signalling: offered in its orbit, once per world.
      if (opts.canInvestigate) {
        actions += `<span class="gx-btn gx-bio focusable" tabindex="0" data-action="investigate" ` +
          `title="${T('Anomaly.ui.investigateHint')}">` +
          `${opts.investigateResume ? T('Anomaly.ui.resume') : T('Anomaly.ui.investigate')}</span>`;
      }
      // Schrödinger-Bohr bridge: instant jump into this planet's orbit for 1
      // Schrödingerite. Offered on any planet view while charges remain.
      if (opts.canBohrBridge) {
        actions += `<span class="gx-btn gx-sb focusable" tabindex="0" data-action="sb-bohr" ` +
          `title="${T('Galaxy.hud.quantumBridgeStraightIntoOrbit')}">${T('Galaxy.hud.openSchrDingerBohrBridge')}</span>`;
      }
      // Hand-authored landing sites: shown alongside Land while the ship is in
      // orbit. Each teleports the party (not the ship) to its map/coords.
      if (locs && opts.canUseLocations) {
        actions += locs.map((loc, i) =>
          `<span class="gx-btn gx-land focusable" tabindex="0" data-action="teleport-location" ` +
          `data-loc="${i}">${esc(loc.name)}</span>`).join("");
      }
      // Strip mining: offered while in orbit of a rock that still holds ore.
      if (opts.canStripMine) {
        actions += `<span class="gx-btn focusable" tabindex="0" data-action="strip-mine" ` +
          `title="${T('Galaxy.hud.cutTheBodyApartWith')}">${T('Galaxy.hud.stripMine')}</span>`;
      }
      // Servicing: the Hubble, and anything else carrying its own repair state.
      if (opts.canService) {
        actions += `<span class="gx-btn gx-land focusable" tabindex="0" data-action="service" ` +
          `title="${T('Galaxy.hud.openTheServicingBay')}">${T('Galaxy.hud.serviceTelescope')}</span>`;
      }
      // A star marks any body that has hand-authored landing sites.
      const star = locs ? ` <span class="gx-loc-star">★</span>` : "";
      // A hand-authored note on a body in Systems.json. The body name is the id
      // it is keyed under, so the copy follows the language and the data field
      // stays the fallback for a system a mod adds.
      const noteKey = "Galaxy.bodyNote." + String(body.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
      const noteText = T.has(noteKey) ? T(noteKey) : body.note;
      const note = noteText ? `<div class="gx-note">${esc(noteText)}</div>` : "";
      this.els.info.innerHTML =
        `<div class="gx-title">${esc(body.name)}${star}</div>` +
        `<div class="gx-sub">${esc(system ? (system.label || system.name) : "")}</div>` +
        (actions ? `<div class="gx-actions gx-actions-top">${actions}</div>` : "") +
        `<div class="gx-divider"></div>${rows}${note}`;
      this._openInfo();
    }

    // A far-scale object (galaxy, cluster, anomaly): descriptive only, since no
    // ship action reaches across intergalactic distances.
    showObject(obj, opts) {
      opts = opts || {};
      this._selection = { kind: obj.kind || "galaxy", data: obj };
      const rows = this._rows([
        [T('Galaxy.row.type'), bodyTypeLabel(obj.type)],
        [T('Galaxy.row.diameter'), obj.diameter],
        [obj.members ? T('Galaxy.row.members') : T('Galaxy.row.stars'),
         obj.members || obj.stars],
        [T('Galaxy.row.distance'), obj.distance],
      ]);
      const actions = ZOOM_BTN + (opts.canBookmark ? bookmarkBtn(!!opts.isBookmarked) : "");
      this.els.info.innerHTML =
        `<div class="gx-title${obj.home ? " gx-hard" : ""}">${esc(obj.name)}</div>` +
        (obj.home ? `<div class="gx-sub">${T('Galaxy.row.currentLocation')}</div>` : "") +
        `<div class="gx-actions gx-actions-top">${actions}</div>` +
        `<div class="gx-divider"></div>${rows}`;
      this._openInfo();
    }

    _openInfo() {
      window.UIPanel.open(this.els.info);
      this._wire(this.els.info);
      this._focusEl = null;
      this._invalidateFocusables();
    }

    deselect() {
      this._selection = null;
      this._focusEl = null;
      this._applyFocusClass();
      window.UIPanel.close(this.els.info);
      this._invalidateFocusables();
    }

    // ---- Landing-site picker (unwrapped planet texture, clickable grid) ---
    // Shows the planet's equirectangular surface texture (see
    // Renderer3D.getPlanetTextureCanvas) sliced into a planetGridSize() grid.
    // Callbacks: onPick(gx, gy) when a square is confirmed, onCancel() when
    // the panel is dismissed without picking.
    showLandingGrid(planet, opts) {
      opts = opts || {};
      const R3D = window.GalaxySim.Renderer3D;
      const GS = window.GalaxySim;
      if (!this.els.landingGrid || !R3D || !GS || !GS.planetGridSize) {
        if (opts.onCancel) opts.onCancel();
        return;
      }
      const { w, h } = GS.planetGridSize(planet);
      const seed = R3D._seedFor(planet);
      const textureCanvas = R3D.getPlanetTextureCanvas(planet, seed);
      this._landingGrid = {
        planet, w, h,
        cursor: { gx: Math.floor(w / 2), gy: Math.floor(h / 2) },
        textureCanvas,
        mode: 'land',      // 'land' | 'walk'
      };
      this._syncLandingMode();
      this._landingGridCallbacks = { onPick: opts.onPick, onCancel: opts.onCancel };
      this.els.landingGridTitle.textContent = `${T('Galaxy.hud.chooseLandingSite')} · ${planet.name || "Planet"}`;
      window.UIPanel.open(this.els.landingGrid);
      this._focusEl = null;
      this._invalidateFocusables();
      this._redrawLandingGrid();
    }

    // Which of the three ways down is armed, shown on the buttons themselves.
    setLandingMode(mode) {
      const lg = this._landingGrid;
      if (!lg || (mode !== 'land' && mode !== 'walk' && mode !== 'flyby')) return;
      lg.mode = mode;
      this._syncLandingMode();
      if (window.SoundManager) SoundManager.playCursor();
    }

    _syncLandingMode() {
      const lg = this._landingGrid;
      if (!lg || !this.els.landingGrid) return;
      const btns = this.els.landingGrid.querySelectorAll('[data-action="landing-mode"]');
      btns.forEach((b) => {
        b.classList.toggle('is-on', b.getAttribute('data-mode') === lg.mode);
      });
    }

    isLandingGridOpen() {
      return !!(this.els.landingGrid && this.els.landingGrid.style.display !== "none");
    }

    // Dismiss without picking (Esc / Cancel button).
    hideLandingGrid() {
      if (!this.isLandingGridOpen()) return;
      const cb = this._landingGridCallbacks;
      window.UIPanel.close(this.els.landingGrid);
      this._landingGrid = null;
      this._landingGridCallbacks = null;
      this._invalidateFocusables();
      if (cb && cb.onCancel) cb.onCancel();
    }

    moveLandingGridCursor(dx, dy) {
      const lg = this._landingGrid;
      if (!lg) return;
      lg.cursor.gx = ((lg.cursor.gx + dx) % lg.w + lg.w) % lg.w;
      lg.cursor.gy = ((lg.cursor.gy + dy) % lg.h + lg.h) % lg.h;
      this._redrawLandingGrid();
    }

    confirmLandingGridCursor() {
      this._confirmLandingGrid();
    }

    _confirmLandingGrid() {
      const lg = this._landingGrid;
      const cb = this._landingGridCallbacks;
      if (!lg || !cb) return;
      const { gx, gy } = lg.cursor;
      const mode = lg.mode || 'land';
      window.UIPanel.close(this.els.landingGrid);
      this._landingGrid = null;
      this._landingGridCallbacks = null;
      this._invalidateFocusables();
      if (cb.onPick) cb.onPick(gx, gy, mode);
    }

    _redrawLandingGrid() {
      const lg = this._landingGrid;
      const canvas = this.els.landingGridCanvas;
      if (!lg || !canvas) return;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const R3D = window.GalaxySim.Renderer3D;
      if (lg.textureCanvas && R3D && R3D.drawPlanetGrid) {
        R3D.drawPlanetGrid(ctx, {
          textureCanvas: lg.textureCanvas,
          destW: canvas.width, destH: canvas.height,
          gridW: lg.w, gridH: lg.h,
          highlightCell: lg.cursor,
        });
      }
    }

    // ---- Servicing bay (Hubble) -------------------------------------------
    // Every assembly with its condition, what it would take to put right, and
    // a button that spends the materials. Rebuilt in place after each repair so
    // the costs and affordability stay honest.
    showService(opts) {
      opts = opts || {};
      if (!this.els.service) return;
      this._service = {
        title: opts.title || "${T('Galaxy.hud.servicingBay')}",
        subtitle: opts.subtitle || "",
        parts: opts.parts || [],
        footer: opts.footer || "",
      };
      window.UIPanel.open(this.els.service);
      this._focusEl = null;
      this.renderService(opts.parts, opts.subtitle, opts.footer);
    }

    isServiceOpen() {
      return !!(this.els.service && this.els.service.style.display !== "none");
    }

    hideService() {
      if (!this.isServiceOpen()) return;
      window.UIPanel.close(this.els.service);
      this._service = null;
      this._invalidateFocusables();
    }

    renderService(parts, subtitle, footer) {
      if (!this.els.service || !this._service) return;
      if (parts) this._service.parts = parts;
      if (subtitle != null) this._service.subtitle = subtitle;
      if (footer != null) this._service.footer = footer;
      const S = this._service;
      const focusKey = this._focusEl ? this._focusEl.getAttribute("data-part") : null;
      this.els.svcTitle.textContent = S.title;
      this.els.svcSub.innerHTML = S.subtitle;
      this.els.svcList.innerHTML = S.parts.map((p) => {
        const pct = Math.max(0, Math.min(100, Math.round(p.health)));
        const cls = pct >= 70 ? "" : (pct >= 35 ? " gx-warn" : " gx-bad");
        const costTxt = Object.keys(p.cost || {}).length
          ? Object.keys(p.cost).map((id) => {
            const need = p.cost[id];
            const have = (window.GalaxySim.matOwned && window.GalaxySim.matOwned(Number(id))) || 0;
            const short = have < need ? " gx-short" : "";
            return `<span class="${short}">${esc(window.GalaxySim.matName(Number(id)))} ` +
              `${have}/${need}</span>`;
          }).join(" · ")
          : "${T('Galaxy.hud.nominal')}";
        const done = pct >= 100;
        const btn = done
          ? `<span class="gx-btn gx-disabled">${T('Galaxy.hud.serviced')}</span>`
          : `<span class="gx-btn${p.canAfford ? " gx-land" : " gx-disabled"} focusable" ` +
            `tabindex="0" data-action="service-part" data-part="${esc(p.name)}">${T('Galaxy.hud.repair')}</span>`;
        return `<div class="gx-svc-part${p.critical ? " gx-crit" : ""}${done ? " gx-ok" : ""}">` +
          `<div class="gx-svc-main"><div class="gx-svc-name">${esc(p.label || p.name)}` +
          `${p.critical ? ` <span class="gx-short gx-crit-ink">${T('Galaxy.hud.critical')}</span>` : ""}</div>` +
          `<div class="gx-svc-note">${esc(p.note || "")}</div>` +
          `<div class="gx-svc-cost">${costTxt}</div></div>` +
          `<div class="gx-svc-bar"><div class="gx-svc-fill${cls}" style="--ui-bar-w:${pct}%"></div></div>` +
          `<div class="gx-svc-pct">${pct}%</div>${btn}</div>`;
      }).join("");
      this.els.svcActions.innerHTML =
        (S.footer ? `<div class="gx-muted gx-svc-footer">${S.footer}</div>` : "") +
        `<span class="gx-btn gx-land focusable" tabindex="0" data-action="service-all">` +
        `${T('Galaxy.hud.serviceEverythingAffordable')}</span>` +
        `<span class="gx-btn focusable" tabindex="0" data-action="service-close">${T('Galaxy.hud.close')}</span>`;
      this._wire(this.els.service);
      this._invalidateFocusables();
      // Keep the ring on the same part's button across a re-render.
      if (focusKey) {
        const again = this.els.service.querySelector(`[data-part="${focusKey}"]`);
        if (again) { this._focusEl = again; this._applyFocusClass(); }
      }
    }

    // ---- Strip-mining console ---------------------------------------------
    showMining(state) {
      if (!this.els.mining) return;
      window.UIPanel.open(this.els.mining);
      this._mineLog = [];
      this.updateMining(state);
      this._invalidateFocusables();
    }

    isMiningOpen() {
      return !!(this.els.mining && this.els.mining.style.display !== "none");
    }

    hideMining() {
      if (!this.isMiningOpen()) return;
      window.UIPanel.close(this.els.mining);
      this._mineLog = null;
      this._invalidateFocusables();
    }

    // state = { name, mined, capacity, elapsed, eta, fuel, fuelPerSec }
    updateMining(state) {
      if (!this.isMiningOpen() || !state) return;
      const cap = Math.max(1, state.capacity || 1);
      const pct = Math.max(0, Math.min(100, (state.mined / cap) * 100));
      this.els.mineTitle.textContent = `${T('Galaxy.hud.stripMining')} · ${state.name || "Body"}`;
      const secs = Math.max(0, Math.round(state.elapsed || 0));
      this.els.mineClock.textContent =
        `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
      window.UIPanel.setBar(this.els.mineFill, pct.toFixed(1));
      this.els.mineStat.textContent =
        T('Galaxy.hud.mineProgress', { mined: Math.round(state.mined), capacity: cap, eta: state.eta || 0 });
      this.els.mineFuel.textContent =
        `${T('Galaxy.hud.hyperflux')} ${Math.round(state.fuel || 0).toLocaleString()} (−${state.fuelPerSec}/s)`;
    }

    // One line of ore per tick, newest last, capped to what the box shows.
    pushMiningLog(html) {
      if (!this.isMiningOpen()) return;
      this._mineLog = this._mineLog || [];
      this._mineLog.push(html);
      if (this._mineLog.length > 3) this._mineLog.shift();
      this.els.mineLog.innerHTML = this._mineLog.join("<br>");
    }

    // ---- Anomaly log (the branching encounter) ----------------------------
    // The scene owns the encounter (GalaxySim.Anomaly); this only draws the view
    // it is handed and reports which choice was clicked.
    showAnomaly(view, opts) {
      if (!this.els.anomaly) return;
      this._anomaly = Object.assign({ where: "" }, opts || {});
      window.UIPanel.open(this.els.anomaly);
      this.renderAnomaly(view);
    }

    isAnomalyOpen() {
      return !!(this.els.anomaly && this.els.anomaly.style.display !== "none");
    }

    hideAnomaly() {
      if (!this.isAnomalyOpen()) return;
      window.UIPanel.close(this.els.anomaly);
      this._anomaly = null;
      this._focusEl = null;
      this._invalidateFocusables();
    }

    renderAnomaly(view) {
      if (!this.els.anomaly || !view) return;
      const where = (this._anomaly && this._anomaly.where) || "";
      this.els.anomWhere.textContent = where;
      this.els.anomTitle.textContent = view.title || "";
      const paras = String(view.text || "").split(/\n+/).filter((p) => p.trim());
      // A payout line carries the IconSet cell it is drawn with (see
      // ProceduralAdventureSystem.js): the star map prints the icon inline the
      // way the toasts do, and falls back to the words alone for a bare line.
      const PA = window.ProceduralAdventure;
      const lineText = (r) => (PA && PA.lineText) ? PA.lineText(r) : String(r || "");
      const lineIcon = (r) => (PA && PA.lineIcon) ? PA.lineIcon(r) : 0;
      const cell = (n) => (n > 0 && window.ParchmentToast && window.ParchmentToast.icon)
        ? window.ParchmentToast.icon(n) : "";
      const rewards = (view.rewards || [])
        .filter((r) => lineText(r))
        .map((r) => `<div>${cell(lineIcon(r))}${esc(lineText(r))}</div>`).join("");
      this.els.anomBody.innerHTML =
        paras.map((p) => `<p>${esc(p)}</p>`).join("") +
        (rewards ? `<div class="gx-anom-rewards">${rewards}</div>` : "");
      this.els.anomBody.scrollTop = 0;
      if (view.done) {
        this.els.anomChoices.innerHTML =
          `<span class="gx-btn gx-land focusable" tabindex="0" data-action="anom-close">` +
          `${T('Anomaly.ui.close')}</span>`;
      } else {
        // A row wears what taking it involves: the die (stat and DC, or flat
        // odds) or the price of the hand-over. A row the party cannot cover is
        // greyed, price still showing (ProceduralAdventure.Stage owns the text).
        const chipOf = (c) => {
          const PA = window.ProceduralAdventure;
          const t = (PA && PA.Stage && PA.Stage.chipText) ? PA.Stage.chipText(c) : "";
          return t ? ` <span class="gx-anom-tag">${esc(t)}</span>` : "";
        };
        this.els.anomChoices.innerHTML = (view.choices || []).map((c, i) =>
          `<span class="gx-anom-choice focusable" tabindex="0" data-action="anom-choice" ` +
          `data-index="${i}"${c.locked ? ' data-locked="1"' : ""}>` +
          `<span class="gx-anom-num">${i + 1}</span>${esc(c.text)}${chipOf(c)}</span>`
        ).join("");
      }
      // The scene the encounter is happening in: biome battleback, the away
      // team's busts, and whoever is on the other side of it. The companion
      // tabs above it hand the die to another member; a switch re-renders so
      // every check chip shows the new hands' odds.
      if (PA && PA.Stage && PA.Stage.attachTo) {
        PA.Stage.attachTo(this.els.anomBody, () => {
          const A = window.GalaxySim && window.GalaxySim.Anomaly;
          if (A) this.renderAnomaly(A.view());
        });
      }
      this._wire(this.els.anomaly);
      this._focusEl = null;
      this._invalidateFocusables();
    }

    _wire(container) {
      if (!container) return;
      container.querySelectorAll("[data-action]").forEach((b) => {
        b.onclick = () => this._invoke(b);
      });
    }

    _invoke(btn) {
      const action = btn.getAttribute("data-action");
      const cb = this.callbacks;
      // Catalog tabs and drawers are panel-local: they never reach the scene.
      if (action === "cat-tab") { this._setCatalogTab(btn.getAttribute("data-target")); return; }
      if (action === "cat-view") { this._setCatalogViewFilter(); return; }
      if (action === "enter-system" && cb.onEnterSystem) {
        cb.onEnterSystem(btn.getAttribute("data-target"));
      } else if (action === "travel-system" && cb.onTravelSystem) {
        cb.onTravelSystem(btn.getAttribute("data-target"));
      } else if (action === "travel-planet" && cb.onTravelPlanet) {
        cb.onTravelPlanet(this._selection);
      } else if (action === "bridge" && cb.onBridge) {
        cb.onBridge();
      } else if (action === "land" && cb.onLand) {
        cb.onLand(this._selection);
      } else if (action === "landing-mode") {
        this.setLandingMode(btn.getAttribute("data-mode"));
      } else if (action === "landing-grid-cancel") {
        this.hideLandingGrid();
      } else if (action === "strip-mine" && cb.onStripMine) {
        cb.onStripMine(this._selection);
      } else if (action === "mine-stop" && cb.onStripMineStop) {
        cb.onStripMineStop();
      } else if (action === "service" && cb.onService) {
        cb.onService(this._selection);
      } else if (action === "service-part" && cb.onServicePart) {
        cb.onServicePart(btn.getAttribute("data-part"));
      } else if (action === "service-all" && cb.onServiceAll) {
        cb.onServiceAll();
      } else if (action === "service-close") {
        this.hideService();
      } else if (action === "investigate" && cb.onInvestigate) {
        cb.onInvestigate(this._selection);
      } else if (action === "anom-choice" && cb.onAnomalyChoice) {
        cb.onAnomalyChoice(parseInt(btn.getAttribute("data-index"), 10) || 0);
      } else if (action === "anom-close" && cb.onAnomalyClose) {
        cb.onAnomalyClose();
      } else if (action === "teleport-location" && cb.onTeleportLocation) {
        const i = parseInt(btn.getAttribute("data-loc"), 10);
        const locs = this._selection && this._selection.landingLocations;
        if (locs && locs[i]) cb.onTeleportLocation(locs[i]);
      } else if (action === "close-map" && cb.onCloseMap) {
        cb.onCloseMap();
      } else if (action === "sb-bohr" && cb.onBohrBridge) {
        cb.onBohrBridge(this._selection);
      } else if (action === "park-orbit" && cb.onParkOrbit) {
        cb.onParkOrbit(this._selection);
      } else if (action === "refuel-start" && cb.onRefuelStart) {
        cb.onRefuelStart(this._selection);
      } else if (action === "refuel-stop" && cb.onRefuelStop) {
        cb.onRefuelStop(this._selection);
      } else if (action === "refuel-auto" && cb.onRefuelAuto) {
        cb.onRefuelAuto();
      } else if (action === "harvest-schrodingerite" && cb.onHarvestSchrodingerite) {
        cb.onHarvestSchrodingerite(this._selection);
      } else if (action === "bookmark-toggle" && cb.onBookmarkToggle) {
        cb.onBookmarkToggle(this._selection);
      } else if (action === "speed-up" && cb.onSpeedUp) {
        cb.onSpeedUp();
      } else if (action === "speed-down" && cb.onSpeedDown) {
        cb.onSpeedDown();
      } else if (action === "stop" && cb.onStop) {
        cb.onStop();
      } else if (action === "zoom-target" && cb.onZoomTarget) {
        cb.onZoomTarget();
      } else if (action === "home" && cb.onGoHome) {
        cb.onGoHome();
      } else if (action === "ship" && cb.onGoToShip) {
        cb.onGoToShip();
      } else if (action === "bioscan" && cb.onBioScan) {
        cb.onBioScan();
      } else if (action === "grand-tour" && cb.onGrandTour) {
        cb.onGrandTour();
      } else if (action === "sb-bridge" && cb.onSbBridge) {
        cb.onSbBridge();
      } else if (action === "return-earth-toggle" && cb.onReturnEarthToggle) {
        cb.onReturnEarthToggle();
      } else if (action === "return-earth-course" && cb.onReturnEarthCourse) {
        cb.onReturnEarthCourse();
      } else if (action === "catalog" && cb.onCatalogToggle) {
        cb.onCatalogToggle();
      } else if (action === "cat-zoom" && cb.onCatalogZoom) {
        cb.onCatalogZoom(btn.getAttribute("data-target"));
      } else if (action === "cat-course" && cb.onCatalogCourse) {
        cb.onCatalogCourse(btn.getAttribute("data-target"));
      }
    }

    // ---- Focusable nav (HypernetOS convention; spans all visible panels) --
    _getFocusables() {
      if (!this.root) return [];
      if (this._focusables) return this._focusables;
      this._focusables = Array.prototype.filter.call(
        this.root.querySelectorAll(".focusable,[tabindex]:not([tabindex='-1'])"),
        (el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        }
      );
      return this._focusables;
    }

    _applyFocusClass() {
      this.root.querySelectorAll(".focused").forEach((e) => e.classList.remove("focused"));
      if (this._focusEl) this._focusEl.classList.add("focused");
    }

    moveFocus(dir) {
      const list = this._getFocusables();
      if (!list.length) return false;
      if (!this._focusEl || list.indexOf(this._focusEl) === -1) {
        this._focusEl = list[0];
        this._applyFocusClass();
        return true;
      }
      const cur = this._focusEl.getBoundingClientRect();
      const cx = cur.left + cur.width / 2;
      const cy = cur.top + cur.height / 2;
      let best = null, bestScore = Infinity;
      for (const el of list) {
        if (el === this._focusEl) continue;
        const r = el.getBoundingClientRect();
        const dx = r.left + r.width / 2 - cx;
        const dy = r.top + r.height / 2 - cy;
        let primary, cross;
        if (dir === "left") { if (dx >= -1) continue; primary = -dx; cross = Math.abs(dy); }
        else if (dir === "right") { if (dx <= 1) continue; primary = dx; cross = Math.abs(dy); }
        else if (dir === "up") { if (dy >= -1) continue; primary = -dy; cross = Math.abs(dx); }
        else { if (dy <= 1) continue; primary = dy; cross = Math.abs(dx); }
        const score = primary + cross * 2;
        if (score < bestScore) { bestScore = score; best = el; }
      }
      if (best) { this._focusEl = best; this._applyFocusClass(); }
      return true;
    }

    cycleFocus(step) {
      const list = this._getFocusables();
      if (!list.length) return false;
      let idx = this._focusEl ? list.indexOf(this._focusEl) : -1;
      idx = (idx + step + list.length) % list.length;
      this._focusEl = list[idx];
      this._applyFocusClass();
      return true;
    }

    activateFocus() {
      if (this._focusEl) { this._invoke(this._focusEl); return true; }
      // No explicit focus yet: activate the first available button.
      const list = this._getFocusables();
      if (list.length) { this._invoke(list[0]); return true; }
      return false;
    }

    update() {
      // Keep the focus ring valid if the panel rebuilt.
      if (this._focusEl && !this._focusEl.isConnected) {
        this._focusEl = null;
        this._applyFocusClass();
      }
    }

    dispose() {
      if (this._warpMidTimer) clearTimeout(this._warpMidTimer);
      if (this._warpEndTimer) clearTimeout(this._warpEndTimer);
      if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
      this.root = null;
      this.els = {};
      this._selection = null;
      this._focusEl = null;
      this._focusables = null;
    }
  }

  window.GalaxySim.Overlay = { GalaxyOverlay, padGlyphs };
})();
