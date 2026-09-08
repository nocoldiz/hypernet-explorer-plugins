/*:
 * @target MZ
 * @plugindesc GalaxySim 3D Bodies - System-scale builders (star, planets, moons, orbits, ship)
 * @author Omni-Lex + Nocoldiz
 * @url
 * @help
 * ============================================================================
 * GalaxySim 3D Bodies Module
 * ============================================================================
 * Builds the SYSTEM-scale content as real lit three.js meshes, reusing the
 * procedural mesh/texture builders in GalaxySim_Renderer3D.js
 * (buildPlanetGroup / buildStarGroup) instead of the offscreen 2D compositor.
 *
 * SYSTEM scale uses 1 world unit = 1 AU. Body visual sizes are exaggerated /
 * clamped for readability (true astronomical scale would make planets invisible
 * at AU orbits), the same compromise the legacy 2D view made.
 *
 * window.GalaxySim.Scene3DBodies.buildSystem(systemData) returns:
 *   { group, pickables, animate(t), dispose(), outerRadius }
 *
 * LOAD ORDER: after GalaxySim_Renderer3D.js / GalaxySim_World3D.js,
 * before GalaxySim_Scene3D.js. Requires THREE.js.
 */

(() => {
  "use strict";

  if (!window.GalaxySim) window.GalaxySim = {};
  const GS = window.GalaxySim;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // --- Visual sizing (world units = AU) -----------------------------------
  // Stars, planets and moons all run through ONE compressor over their true
  // radius expressed in Earth radii, so the relative order is always physically
  // right (star > gas giant > rocky planet > moon) instead of three independent
  // clamps that could invert it. True radii span 5 orders of magnitude at AU
  // orbits, so the compressor is a power law: it keeps the ranking and a
  // recognisable size spread while staying visible on screen.
  //   Sun (109 R⊕) -> 1.00   Jupiter (11.2) -> 0.28   Earth (1) -> 0.075
  //   Mercury (0.38) -> 0.043   Luna (0.27) -> 0.036
  const SIZE_K = 0.075;   // world units for a 1 R⊕ body
  const SIZE_EXP = 0.55;  // compression exponent
  const R_SUN_IN_EARTH = 109.2;

  function compressRadius(earthRadii) {
    const r = earthRadii > 0 ? earthRadii : 0.05;
    return clamp(SIZE_K * Math.pow(r, SIZE_EXP), 0.02, 2.4);
  }
  function starVisualRadius(system) {
    const rSun = system && system.radius ? system.radius : 1; // solar radii
    return clamp(compressRadius(rSun * R_SUN_IN_EARTH), 0.35, 2.4);
  }
  function planetVisualRadius(planet) {
    return compressRadius(planet && planet.radius ? planet.radius : 1);
  }
  // The shared power-law compressor flattens the 5-order-of-magnitude range
  // it has to cover, which inflates a moon's radius relative to its planet's
  // far past the real ratio (Luna/Earth is 0.27; the bare compressor put it
  // near 0.48). MOON_SHRINK pulls the compressed radius back down, and the
  // result is additionally capped to a fraction of the parent planet's own
  // visual radius so a moon can never read as large as - or larger than -
  // the world it orbits, however big it truly is.
  const MOON_SHRINK = 0.55;
  const MOON_MAX_VS_PLANET = 0.5;
  function moonVisualRadius(moon, planetVisR) {
    let r = clamp(compressRadius(moon && moon.radius ? moon.radius : 0.27) * MOON_SHRINK, 0.012, 0.09);
    if (planetVisR) r = Math.min(r, planetVisR * MOON_MAX_VS_PLANET);
    return r;
  }
  // Orbits stay near-linear in AU (the physically honest layout) with only a
  // mild inner-system stretch so Mercury/Venus/Earth don't collapse onto the
  // star's disc.
  function planetOrbitWorld(orbitRadiusAu, starR) {
    const au = orbitRadiusAu || 0;
    return starR * 1.8 + Math.pow(au, 0.85) * 1.6;
  }
  // Kepler's third law: T(years) = sqrt(a(AU)^3 / M(solar masses)). A planet's
  // position on its orbit is a pure function of the shared game clock
  // (TimeDateSystem's Variable 114, in game-minutes - see the `t` argument
  // to animate() no longer meaning "real seconds since this view was built"
  // for orbital position), not of how long the view has happened to be open:
  // leaving a system for a while and coming back moves every orbit exactly
  // as far as the game clock actually advanced, and a system left running at
  // the far side of a scale change is genuinely frozen, not still turning
  // off-screen. Floored so a 0-AU/0-mass record never divides out to
  // infinity or zero.
  const MINUTES_PER_YEAR = 365.25 * 24 * 60;
  function orbitPeriodMinutes(orbitRadiusAu, starMassSuns) {
    const au = Math.max(0.02, orbitRadiusAu || 0.1);
    const mass = Math.max(0.05, starMassSuns || 1);
    const years = Math.sqrt(Math.pow(au, 3) / mass);
    return Math.max(1, years * MINUTES_PER_YEAR);
  }
  // A moon's own Kepler period about its planet, already computed in days by
  // GalaxySim_DataManager (moon.period, from moon.orbitRadius and the
  // planet's mass) and carried straight through onto the same game clock
  // every other orbit reads, instead of the flat per-index animation speed
  // this used to run on.
  const MINUTES_PER_DAY = 24 * 60;
  function moonPeriodMinutes(periodDays) {
    const days = Math.max(0.02, Math.abs(periodDays) || 0.5);
    return Math.max(1, days * MINUTES_PER_DAY);
  }
  // The live game clock (world-shared, TimeDateSystem.js), read fresh each
  // frame rather than cached: it can jump by days or years in one step (fast
  // travel, sleep, cryo), and every orbit must land exactly where that jump
  // puts it on the very next frame.
  function gameClockMinutes() {
    return (typeof $gameVariables !== "undefined" && $gameVariables.value(114)) || 0;
  }
  // Deterministic per-body jitter in [0,1) from its name; used for orbital
  // inclination and axial tilt so systems look like real systems (slightly
  // out of plane, tilted spin axes) yet stay stable across rebuilds.
  function hash01(name, salt) {
    let h = 2166136261 ^ (salt || 0);
    const s = String(name || "");
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 100000) / 100000;
  }

  // Shared soft glow sprite (engine trail / beacon). Disposed by the caller.
  function makeGlowSprite(hex, size) {
    const s = 64;
    const cv = document.createElement("canvas");
    cv.width = cv.height = s;
    const ctx = cv.getContext("2d");
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, hex);
    g.addColorStop(0.3, hex);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    const tex = new THREE.CanvasTexture(cv);
    const mat = new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(size, size, 1);
    return { sprite: sp, tex, mat };
  }

  // A small canvas label sprite ("YOUR SHIP" beacon tag). Additive so it reads
  // as a glowing HUD marker over the star field. Disposed by the caller.
  function makeLabelSprite(text, colorCss) {
    const cv = document.createElement("canvas");
    cv.width = 256; cv.height = 64;
    const ctx = cv.getContext("2d");
    ctx.font = "bold 34px 'Segoe UI',Arial,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.9)";
    ctx.shadowBlur = 8;
    ctx.fillStyle = colorCss || "#bfe6ff";
    ctx.fillText(text, 128, 34);
    const tex = new THREE.CanvasTexture(cv);
    const mat = new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false, depthTest: false,
    });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(1.6, 0.4, 1);
    return { sprite: sp, tex, mat };
  }

  // The anomaly marker: a "?" hanging over the one world in the system that is
  // signalling (see GalaxySim.Anomaly). Drawn on top of everything so it reads
  // as a HUD tag rather than an object in the scene.
  function makeQuestionSprite() {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const ctx = cv.getContext("2d");
    ctx.font = "bold 92px 'Segoe UI',Arial,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 8;
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.strokeText("?", 64, 68);
    ctx.shadowColor = "rgba(120,225,255,0.9)";
    ctx.shadowBlur = 16;
    ctx.fillStyle = "#eaf6ff";
    ctx.fillText("?", 64, 68);
    const tex = new THREE.CanvasTexture(cv);
    const mat = new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false, depthTest: false,
    });
    const sp = new THREE.Sprite(mat);
    sp.renderOrder = 1001;
    return { sprite: sp, tex, mat };
  }

  // Overall length of the player ship in system/galaxy world units. The old
  // placeholder-hull footprint (0.3, a sizeable fraction of Earth's own 0.15
  // visual diameter - see compressRadius) made the ship read as comparable to
  // a planet rather than the ~1 km craft it is. Shrunk again here (0.03 still
  // read as a sizeable fraction of a gas giant, ~11% of Jupiter's 0.28 visual
  // radius) so even a giant planet truly looms over it. The ship-cam framing
  // distance floors at 0.02 regardless of this value (see _updateShipCamFollow),
  // safely clear of the system-scale camera near plane (0.01, see
  // GalaxySim_World3D's clip table), so shrinking further here never risks
  // clipping the hull out of view when framed close up.
  const SHIP_WORLD_LENGTH = 0.008;

  /**
   * Fallback craft used when GalaxySim_ShipModel failed to load: the original
   * low-poly hull (swept fuselage + nose + swept-back wings + twin engine
   * pods) with a tinted cockpit and an additive engine plume. Forward is +Z.
   * Returns { group, update(t), dispose() } - the same shape ShipModel builds.
   */
  function buildPlaceholderHull() {
    const hull = new THREE.Group();
    hull.name = "gx-ship-hull";
    // The starship reads as a small speck against a whole planet/star, so the
    // craft itself is scaled well down (the galaxy-scale beacon still marks it).
    hull.scale.setScalar(0.4);

    const disposables = [];               // { geometry?, material?, dispose? }
    const track = (o) => { disposables.push(o); return o; };

    const bodyMat = track(new THREE.MeshPhongMaterial({
      color: 0xd4dcea, specular: 0x9fc0e0, shininess: 70, emissive: 0x0e1420,
    }));
    const trimMat = track(new THREE.MeshPhongMaterial({
      color: 0x5b6b86, specular: 0x88aacc, shininess: 40, emissive: 0x080c14,
    }));
    const glassMat = track(new THREE.MeshPhongMaterial({
      color: 0x8fdcff, specular: 0xffffff, shininess: 120,
      emissive: 0x123044, transparent: true, opacity: 0.85,
    }));

    // Fuselage: a stretched octahedral cylinder, nose cone at +Z, tapered tail.
    const fuseGeo = track(new THREE.CylinderGeometry(0.05, 0.07, 0.26, 8));
    const fuse = new THREE.Mesh(fuseGeo, bodyMat);
    fuse.rotation.x = Math.PI / 2;
    hull.add(fuse);

    const noseGeo = track(new THREE.ConeGeometry(0.05, 0.16, 8));
    const nose = new THREE.Mesh(noseGeo, bodyMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 0.20;
    hull.add(nose);

    // Cockpit blister on top of the fuselage.
    const cockpitGeo = track(new THREE.SphereGeometry(0.045, 10, 8));
    const cockpit = new THREE.Mesh(cockpitGeo, glassMat);
    cockpit.position.set(0, 0.035, 0.06);
    cockpit.scale.set(1, 0.7, 1.4);
    hull.add(cockpit);

    // Swept-back delta wings (one thin box, angled) + a tail fin.
    const wingGeo = track(new THREE.BoxGeometry(0.34, 0.012, 0.12));
    const wing = new THREE.Mesh(wingGeo, trimMat);
    wing.position.z = -0.05;
    wing.rotation.x = 0.12;
    hull.add(wing);
    const finGeo = track(new THREE.BoxGeometry(0.012, 0.1, 0.1));
    const fin = new THREE.Mesh(finGeo, trimMat);
    fin.position.set(0, 0.05, -0.1);
    hull.add(fin);

    // Twin engine pods either side of the tail.
    const podGeo = track(new THREE.CylinderGeometry(0.022, 0.03, 0.1, 8));
    [-0.09, 0.09].forEach((x) => {
      const pod = new THREE.Mesh(podGeo, trimMat);
      pod.rotation.x = Math.PI / 2;
      pod.position.set(x, -0.005, -0.11);
      hull.add(pod);
    });

    // Engine plume (additive glow) behind the tail.
    const glow = makeGlowSprite("rgba(130,205,255,0.95)", 0.34);
    glow.sprite.position.set(0, 0, -0.2);
    hull.add(glow.sprite);

    function disposeHull() {
      disposables.forEach((o) => { if (o && o.dispose) o.dispose(); });
      glow.tex.dispose(); glow.mat.dispose();
      if (hull.parent) hull.parent.remove(hull);
    }
    return { group: hull, update() { }, dispose: disposeHull };
  }

  /**
   * The player ship: the procedural GalaxySim_ShipModel hull (derived from the
   * world seed until the player edits it in the vehicle menu, and hot-reloaded
   * whenever that changes), falling back to the low-poly placeholder when that
   * module is missing. Forward is +Z so orient()/lookAt aims the nose down the
   * travel vector. Returns { group, hull, update(t), orient(v),
   * setBeaconScale(s), dispose() }.
   *
   * @param {object} [opts] { beacon } - beacon adds an always-on-top pulsing
   *   marker + label so the ship is easy to find at galaxy zoom.
   */
  function buildShip(opts) {
    opts = opts || {};
    const group = new THREE.Group();
    group.name = "gx-ship";
    const hull = new THREE.Group();       // the physical craft (bobs/banks)
    group.add(hull);

    const body = (GS.ShipModel && GS.ShipModel.buildLive)
      ? GS.ShipModel.buildLive(SHIP_WORLD_LENGTH)
      : buildPlaceholderHull();
    hull.add(body.group);

    // --- Optional galaxy-scale beacon --------------------------------------
    // The beacon lives in its own group so Scene3D can scale it up with camera
    // distance (keeping a roughly constant apparent size) without touching the
    // physical ship. Drawn on top of everything so it is never lost behind a star.
    let beaconGroup = null, beaconGlow = null, label = null,
      beaconRing = null, ringGeo = null, ringMat = null;
    if (opts.beacon) {
      beaconGroup = new THREE.Group();
      group.add(beaconGroup);

      beaconGlow = makeGlowSprite("rgba(120,225,255,0.9)", 1.1);
      beaconGlow.mat.depthTest = false;
      beaconGlow.sprite.renderOrder = 999;
      beaconGlow.sprite.position.set(0, 0, 0);
      beaconGroup.add(beaconGlow.sprite);

      ringGeo = new THREE.RingGeometry(0.55, 0.68, 32);
      ringMat = new THREE.MeshBasicMaterial({
        color: 0x8fe6ff, transparent: true, opacity: 0.85,
        side: THREE.DoubleSide, depthTest: false, depthWrite: false,
      });
      beaconRing = new THREE.Mesh(ringGeo, ringMat);
      beaconRing.renderOrder = 999;
      beaconGroup.add(beaconRing);

      label = makeLabelSprite("YOUR SHIP", "#cdefff");
      label.mat.depthTest = false;
      label.sprite.renderOrder = 1000;
      label.sprite.position.set(0, 1.15, 0);
      label.sprite.scale.set(2.4, 0.6, 1);
      beaconGroup.add(label.sprite);
    }

    function update(t, moving) {
      // The body animates itself (drive plumes, blinkers, appearance reloads).
      if (body.update) body.update(t);
      // Gentle vertical bob only while actually under way (translation, so it
      // never fights an orient() lookAt); parked/idle the hull sits still.
      // The beacon sprites face the camera on their own and just pulse either way.
      hull.position.y = moving ? Math.sin(t * 1.1) * 0.015 : 0;
      if (beaconGlow) {
        const pulse = 1 + Math.sin(t * 3.0) * 0.18;
        beaconGlow.sprite.scale.set(1.1 * pulse, 1.1 * pulse, 1);
        if (ringMat) ringMat.opacity = 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(t * 3.0));
        // Keep the ring face-on to the camera without per-frame lookAt cost by
        // spinning it slowly; it reads as a rotating targeting reticle.
        if (beaconRing) beaconRing.rotation.z = t * 0.8;
      }
    }
    // Aim the craft down a world-space vector without tilting the beacon/label
    // (which must stay upright). +Z is the nose, so hull.lookAt aims the nose.
    function orient(worldTarget) {
      if (worldTarget) hull.lookAt(worldTarget);
    }
    // Scale the beacon (halo/ring/label) so it keeps a roughly constant apparent
    // size as the camera pulls out to the whole galaxy. No-op without a beacon.
    // `s <= 0` hides it outright - used at system scale, where the marker
    // should disappear entirely once the camera is close enough to read the
    // (now tiny) hull instead of just shrinking below its clamped floor.
    function setBeaconScale(s) {
      if (!beaconGroup) return;
      if (!s || s <= 0) { beaconGroup.visible = false; return; }
      beaconGroup.visible = true;
      beaconGroup.scale.setScalar(Math.max(0.001, s));
    }
    function dispose() {
      if (body.dispose) body.dispose();
      if (beaconGlow) { beaconGlow.tex.dispose(); beaconGlow.mat.dispose(); }
      if (label) { label.tex.dispose(); label.mat.dispose(); }
      if (ringGeo) ringGeo.dispose();
      if (ringMat) ringMat.dispose();
      if (group.parent) group.parent.remove(group);
    }
    return { group, hull, update, orient, setBeaconScale, dispose };
  }

  /** A faint circular orbit guide on the XZ plane, radius in world units. */
  function buildOrbitLine(radius, colorCss, segments) {
    segments = segments || 96;
    const pts = [];
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({
      color: new THREE.Color(colorCss || "#5078c8"),
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });
    const line = new THREE.LineLoop(geo, mat);
    line.name = "gx-orbit";
    return line;
  }

  // How many moons a planet shows in the wide system view. Planets with more
  // (e.g. Jupiter, 83) reveal the rest only when the planet is clicked/focused.
  const SYSTEM_MOON_CAP = 4;
  // Compact visual size for the cheap "extra" moonlets revealed on focus.
  const extraMoonRadius = (moon, planetVisR) => clamp(moonVisualRadius(moon, planetVisR) * 0.8, 0.008, 0.07);

  // True-scale bodies are sub-pixel at system framing distances, so each body
  // is allowed to grow (never shrink) until it covers at least this many pixels
  // of screen height, capped so the boost can't swallow its neighbours. Close
  // up the boost is 1 and the physical sizing above is what you see.
  const MIN_APPARENT_PX = { star: 5, planet: 3.2, moon: 2 };
  const MAX_APPARENT_BOOST = { star: 1.6, planet: 7, moon: 9 };

  /**
   * Build the full SYSTEM-scale view for a star system data object.
   * @param {object} systemData  DataManager system record
   * @param {object} [opts]      { orbitColor }
   */
  function buildSystem(systemData, opts) {
    opts = opts || {};
    const R3D = GS.Renderer3D;
    const root = new THREE.Group();
    root.name = "gx-system:" + (systemData.name || "?");  // i18n-ignore  three.js object name

    // Pickable bodies. Each carries the Object3D whose WORLD position is the
    // body centre plus its world visual radius, so Scene3D can pick by
    // screen-space proximity (reliable even for tiny far bodies).
    const pickables = [];   // { object, radius, kind, data, system, planet }
    const bodyGroups = [];  // groups built via R3D (release with disposeBodyGroup)
    const extras = [];      // orbit lines / helpers we own outright
    const orbiters = [];    // per-planet animation state
    const planetHolders = {}; // planet name -> orbit holder (so the ship can dock)
    const scalables = [];   // { group, pick, baseR, minPx, maxBoost } apparent-size entries
    const anomalyMarkers = []; // { mark, pick, planet } "?" tags over signalling worlds
    const ignitedGlows = []; // halos over worlds burning like stars (see planet.ignited)
    let focusMoonGeo = null;  // shared geometry for cheap focus moonlets (lazy)
    const focusMats = [];     // cheap moonlet materials, disposed at teardown
    let basePickCount = 0;    // pickables length before any planet focus

    // --- Central body: a star, a black hole, an exotic stellar object or a
    // lone starless rogue planet ---------------------------------------------
    const starR = starVisualRadius(systemData);
    const Cosmos = GS.Scene3DCosmos;
    let starGroup = null;
    let blackHole = null;
    let lensInfo = null;   // set below when this system's centre is a black hole
    let exoticStar = null;  // custom-built central body (Cosmos.buildExoticStar)
    let rogueGroup = null;  // ROGUE_PLANET systems: the dark world itself
    // The central light adopts the star's character (a magnetar glows violet,
    // a dead iron star barely at all, a rogue planet not at all).
    let lightColor = 0xfff3e0;
    let lightIntensity = 1.8;
    // Either a legacy-authored hardcoded hole (blackHoleType) or a
    // procedurally generated one (STAR_TYPES "BLACK_HOLE"/"SUPERMASSIVE_BLACK_HOLE" -
    // without this check those fell through to a plain black sphere).
    const isSupermassive = systemData.blackHoleType === "hypermassive" ||
      systemData.type === "SUPERMASSIVE_BLACK_HOLE";
    const isBlackHoleSystem = !!systemData.blackHoleType ||
      systemData.type === "BLACK_HOLE" || systemData.type === "SUPERMASSIVE_BLACK_HOLE";
    // Which holes are drawn as Gargantua: both giant classes the star field
    // rolls (Renderer_Stars' determineBlackHoleType) plus the procedural
    // SUPERMASSIVE type. Wider than isSupermassive, which also sets jet odds
    // and stays as it was.
    const isGrandHole = isBlackHoleSystem && (isSupermassive ||
      systemData.blackHoleType === "supermassive");
    const isRogue = systemData.type === "ROGUE_PLANET";
    const isExotic = !isBlackHoleSystem && !isRogue && Cosmos &&
      Cosmos.isExoticStarType && Cosmos.isExoticStarType(systemData.type);
    if (isBlackHoleSystem && Cosmos && Cosmos.buildBlackHole) {
      blackHole = Cosmos.buildBlackHole({
        radius: starR * 0.9,
        seed: Math.floor(hash01(systemData.name, 991) * 1e9),
        // A quiet "regular" hole never beams; the bigger ones usually do, but
        // the seeded roll keeps some of them dark so jets stay a spectacle.
        // A hole caught feeding on a donor star is accreting hard by
        // definition, so it always launches its beams.
        jets: systemData.feeding ? true
          : (systemData.blackHoleType === "regular" ? false : undefined),
        jetChance: isSupermassive ? 0.8 : 0.45,
        // The giants are drawn as Gargantua: a wide, near-uniform sheet of a
        // disk with its far side lensed over and under the shadow. Stellar-mass
        // holes keep the plain ring.
        style: isGrandHole ? "interstellar" : undefined,
      });
      root.add(blackHole.group);
      pickables.push({ object: blackHole.group, radius: starR * 0.9, kind: "star", data: systemData, system: systemData });
      lightColor = 0xffd9b0;
      lightIntensity = 1.1;
      // Real gravitational lensing (see Cosmos.LENS_FRAG): Scene3D only ever
      // engages it while the camera is looking straight at this hole (the
      // shader assumes the lensed body sits dead centre in frame, exactly the
      // way the title screen's own Hyperverse background does), so this is
      // just the physical inputs - the framing check happens in Scene3D.
      lensInfo = {
        object: blackHole.group,
        horizonR: starR * 0.9,
        massK: Cosmos.lensMassK ? Cosmos.lensMassK(systemData.mass) : 1,
        spin: hash01(systemData.name, 1123),
      };
    } else if (isRogue && R3D && R3D.buildPlanetGroup) {
      // A planet with no star: rendered as a real textured world, but with the
      // central light killed it shows only as a silhouette faintly touched by
      // the scene's dim ambient - completely dark, exactly as it should be.
      rogueGroup = R3D.buildPlanetGroup({
        name: systemData.name,
        type: systemData.planetType || "rocky",
        color: "#3a3f4a",
        radius: 1,
      });
      if (rogueGroup) {
        rogueGroup.scale.setScalar(starR);
        root.add(rogueGroup);
        bodyGroups.push(rogueGroup);
        // The faintest cold limb so the silhouette's edge can be found at all.
        const rimGeo = new THREE.SphereGeometry(1.04, 24, 18);
        const rimMat = new THREE.MeshBasicMaterial({
          color: 0x3a4a66, transparent: true, opacity: 0.06,
          side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
        });
        rogueGroup.add(new THREE.Mesh(rimGeo, rimMat));
        if (rogueGroup._geos) rogueGroup._geos.push(rimGeo);
        if (rogueGroup._mats) rogueGroup._mats.push(rimMat);
        const pick = { object: rogueGroup, radius: starR, kind: "star", data: systemData, system: systemData };
        pickables.push(pick);
        scalables.push({
          group: rogueGroup, pick, baseR: starR,
          minPx: MIN_APPARENT_PX.star, maxBoost: MAX_APPARENT_BOOST.star,
        });
      }
      lightIntensity = 0;
    } else if (isExotic && Cosmos.buildExoticStar) {
      // Built at unit radius and scaled like every other central body, so the
      // apparent-size floor can drive the same group scale.
      exoticStar = Cosmos.buildExoticStar(systemData, {
        radius: 1, seed: Math.floor(hash01(systemData.name, 557) * 1e9),
      });
      if (exoticStar) {
        exoticStar.group.scale.setScalar(starR);
        root.add(exoticStar.group);
        const pick = { object: exoticStar.group, radius: starR, kind: "star", data: systemData, system: systemData };
        pickables.push(pick);
        scalables.push({
          group: exoticStar.group, pick, baseR: starR,
          minPx: MIN_APPARENT_PX.star, maxBoost: MAX_APPARENT_BOOST.star,
        });
        lightColor = exoticStar.lightColor;
        lightIntensity = exoticStar.lightIntensity;
      }
    } else {
      starGroup = R3D && R3D.buildStarGroup ? R3D.buildStarGroup(systemData) : null;
      if (starGroup) {
        starGroup.scale.setScalar(starR);
        root.add(starGroup);
        bodyGroups.push(starGroup);
        const pick = { object: starGroup, radius: starR, kind: "star", data: systemData, system: systemData };
        pickables.push(pick);
        scalables.push({
          group: starGroup, pick, baseR: starR,
          minPx: MIN_APPARENT_PX.star, maxBoost: MAX_APPARENT_BOOST.star,
        });
      }
    }
    // Light from the star at the orbit centre. distance=0 / decay=0 disables
    // inverse-square falloff so outer planets aren't dark, while the central
    // position still produces the correct day/night terminator as they orbit.
    const starLight = new THREE.PointLight(lightColor, lightIntensity, 0, 0);
    starLight.position.set(0, 0, 0);
    root.add(starLight);

    // --- Dyson sphere shell (Zeta Reticuli's intact pair, or the very rare
    // abandoned derelicts found around procedural stars) ----------------------
    let dyson = null;
    if (systemData.dyson && !isRogue && Cosmos && Cosmos.buildDysonSphere) {
      dyson = Cosmos.buildDysonSphere({
        radius: starR * 2.4,
        mode: systemData.dyson === "abandoned" ? "abandoned" : "active",
        seed: Math.floor(hash01(systemData.name, 733) * 1e9),
      });
      root.add(dyson.group);
    }

    // --- Planets + moons ----------------------------------------------------
    let outerRadius = starR + 2;
    const planets = systemData.planets || [];
    planets.forEach((planet) => {
      const orbitWorld = planetOrbitWorld(planet.orbitRadius, starR);
      outerRadius = Math.max(outerRadius, orbitWorld + 1);

      // Real systems are not perfectly coplanar: give each planet a small,
      // deterministic inclination (up to ~7 degrees, like the solar system) and
      // tilt its orbit guide to match. A world out in the far cosmic web may
      // carry its OWN inclination instead - a strange system's orbits stand at
      // any angle it likes, and are the whole point of going out there (see
      // GalaxySim_DataManager._applyStrangeOrbits).
      const inc = planet.inclination != null
        ? planet.inclination
        : (hash01(planet.name, 11) - 0.5) * 0.24;
      const node = hash01(planet.name, 29) * Math.PI * 2;

      const line = buildOrbitLine(orbitWorld, opts.orbitColor);
      line.rotation.set(inc, node, 0);
      root.add(line);
      extras.push(line);

      // Unscaled holder positioned on the orbit; the planet/moons are scaled
      // individually inside it so moon orbits aren't squashed by planet scale.
      const holder = new THREE.Group();
      root.add(holder);
      if (planet.name) planetHolders[planet.name] = holder;

      const pVisR = planetVisualRadius(planet);
      const pg = R3D && R3D.buildPlanetGroup ? R3D.buildPlanetGroup(planet) : null;
      const moonStates = [];
      const allMoons = planet.moons || [];
      if (pg) {
        pg.scale.setScalar(pVisR);
        // Out here a comet flies its whole tail (the portrait path keeps the
        // cut-down default); animate() aims it away from the star each frame.
        if (pg._fullTail) pg._fullTail();
        // Axial tilt (0..~35 deg) so spin axes aren't all dead vertical.
        pg.rotation.z = (hash01(planet.name, 71) - 0.5) * 1.2;
        holder.add(pg);
        bodyGroups.push(pg);
        const pick = { object: holder, radius: pVisR, kind: "planet", data: planet, system: systemData };
        pickables.push(pick);
        scalables.push({
          group: pg, pick, baseR: pVisR,
          minPx: MIN_APPARENT_PX.planet, maxBoost: MAX_APPARENT_BOOST.planet,
        });

        // A world that has been set alight is nearly a star: it carries its own
        // halo and lights its own moons, instead of only catching the Sun.
        if (planet.ignited) {
          const base = pVisR * 7;
          const flare = makeGlowSprite("rgba(255,150,60,0.85)", base);
          holder.add(flare.sprite);
          ignitedGlows.push({ glow: flare, base });
          holder.add(new THREE.PointLight(0xff8a3c, 1.1, 0, 0));
        }

        // The world that is signalling wears a "?" until it has been answered.
        const A = GS.Anomaly;
        if (A && A.isAnomalous(systemData, planet)) {
          const q = makeQuestionSprite();
          q.sprite.visible = A.isPending(systemData, planet);
          holder.add(q.sprite);
          anomalyMarkers.push({ mark: q, pick, planet });
        }

        // Only the first few moons are shown in the wide system view; the rest
        // are revealed (as cheap moonlets) when the planet is focused.
        allMoons.slice(0, SYSTEM_MOON_CAP).forEach((moon, mi) => {
          const mg = R3D.buildPlanetGroup(moon);
          if (!mg) return;
          const mVisR = moonVisualRadius(moon, pVisR);
          mg.scale.setScalar(mVisR);
          const moonHolder = new THREE.Group();
          holder.add(moonHolder);
          moonHolder.add(mg);
          bodyGroups.push(mg);
          const mPick = { object: moonHolder, radius: mVisR, kind: "moon", data: moon, system: systemData, planet: planet };
          pickables.push(mPick);
          scalables.push({
            group: mg, pick: mPick, baseR: mVisR,
            minPx: MIN_APPARENT_PX.moon, maxBoost: MAX_APPARENT_BOOST.moon,
          });
          // Moon orbits are measured in planet radii (as they are in reality)
          // instead of a fixed world offset, so a gas giant keeps its moons at
          // a proportionate distance rather than glued to its surface.
          const moonOrbit = pVisR * (2.6 + mi * 1.5) + 0.02;
          moonStates.push({
            holder: moonHolder, group: mg, orbit: moonOrbit,
            // Kepler again, this time about the planet (moon.period, in days).
            periodMin: moonPeriodMinutes(moon.period),
            phase: moon.phase || 0,
            inc: (hash01(moon.name, 5 + mi) - 0.5) * 0.35,
            node: hash01(moon.name, 91 + mi) * Math.PI * 2,
          });
        });
      }

      orbiters.push({
        holder,
        group: pg,
        planetData: planet,
        planetVisR: pVisR,
        allMoons,
        baseMoonCount: moonStates.length,
        orbit: orbitWorld,
        inc,
        node,
        // A retrograde world runs its orbit backwards: same period, opposite
        // sign, which is all the animator needs.
        periodMin: orbitPeriodMinutes(planet.orbitRadius, systemData.mass) *
          (planet.retrograde ? -1 : 1),
        phase: planet.phase || 0,
        moons: moonStates,
        _focused: false,
        _extra: [], // { holder, mesh } moonlets added while focused
      });
    });

    // --- Debris belts (asteroid belt, Kuiper belt) --------------------------
    // A belt is drawn, not simulated: one mesh of a few thousand fragment specks
    // laid on an annulus between two orbital radii, with the resonance gaps left
    // empty. Declared per system as `belts: [{ innerAu, outerAu, ... }]`.
    const beltMeshes = [];
    (systemData.belts || []).forEach((belt, bi) => {
      if (!R3D || !R3D.makeDebrisMesh) return;
      const inner = planetOrbitWorld(belt.innerAu, starR);
      const outer = planetOrbitWorld(belt.outerAu, starR);
      const built = R3D.makeDebrisMesh({
        count: belt.count || 1200,
        rMin: inner,
        rMax: outer,
        thickness: belt.thickness != null ? belt.thickness : 0.3,
        gaps: (belt.gapsAu || []).map((g) => [
          planetOrbitWorld(g[0], starR), planetOrbitWorld(g[1], starR),
        ]),
        sizeMin: belt.sizeMin != null ? belt.sizeMin : 0.008,
        sizeMax: belt.sizeMax != null ? belt.sizeMax : 0.026,
        color: belt.color || "#9c9384",
        opacity: belt.opacity != null ? belt.opacity : 0.85,
        seed: Math.floor(hash01(belt.name || ("belt" + bi), 337) * 1e9) || 1,
      });
      if (!built) return;
      root.add(built.mesh);
      extras.push(built.mesh);
      // Slow prograde drift, slower the wider the belt sits (a belt has no
      // single body to phase-lock, so it just carries a period like any
      // other orbit and starts at phase 0).
      beltMeshes.push({ mesh: built.mesh, periodMin: orbitPeriodMinutes(belt.innerAu, systemData.mass) });
      outerRadius = Math.max(outerRadius, outer + 1);
    });

    // --- Companion stars (binary .. N-ary) + feeding donor ------------------
    // Every companion is a real, pickable star riding its own wide orbit; a
    // feeding donor sits close in with a mass-transfer stream pouring onto the
    // compact primary. starHolders lets the ship park at any of them by name.
    const starHolders = {};
    const companionUnits = [];
    const companionRecords = [];
    (systemData.companions || []).forEach((c) => companionRecords.push({ rec: c, feeding: false }));
    if (systemData.feeding && systemData.feeding.donor) {
      companionRecords.push({ rec: systemData.feeding.donor, feeding: true });
    }
    companionRecords.forEach((entry, ci) => {
      const c = entry.rec;
      // Tag the record so selection/travel code knows which system owns it.
      if (!c._companionOf) c._companionOf = systemData.name;
      const cR = clamp(starVisualRadius(c) * 0.85, 0.28, 1.8);
      const holder = new THREE.Group();
      root.add(holder);
      // The parking (and refuelling) orbit has to clear this star's own
      // visual radius, so the holder carries it (see updateShip).
      holder.userData.visR = cR;
      if (c.name) starHolders[c.name] = holder;

      let cObj = null;
      let cGroup = null;
      if (Cosmos && Cosmos.isExoticStarType && Cosmos.isExoticStarType(c.type) && Cosmos.buildExoticStar) {
        cObj = Cosmos.buildExoticStar(c, {
          radius: 1, seed: Math.floor(hash01(c.name, 613) * 1e9),
        });
        cGroup = cObj && cObj.group;
      }
      if (!cGroup && R3D && R3D.buildStarGroup) {
        cGroup = R3D.buildStarGroup(c);
        if (cGroup) bodyGroups.push(cGroup);
      }
      if (!cGroup) return;
      cGroup.scale.setScalar(cR);
      holder.add(cGroup);
      const pick = { object: holder, radius: cR, kind: "star", data: c, system: systemData };
      pickables.push(pick);
      scalables.push({
        group: cGroup, pick, baseR: cR,
        minPx: MIN_APPARENT_PX.star, maxBoost: MAX_APPARENT_BOOST.star,
      });

      // The rim the stripped matter finally settles onto: the outer edge of an
      // ordinary hole's disk sits at ~3.4 starR and a Gargantua-style one at
      // ~8.5, while a feeding neutron star or pulsar has only the tight disk
      // the stream builds for itself.
      const rimR = starR * (isBlackHoleSystem ? (isGrandHole ? 8.5 : 3.4) : 1.8);
      // Donors huddle close to the thing stripping them - but still well clear
      // of that rim, or the stream has nowhere to wrap on its way in. True
      // companions ride wide orbits (their orbitRadius is in AU, like planets).
      const donorOrbit = (rimR / starR) * 2.35 + ci * 0.5;
      const orbitWorld = entry.feeding
        ? starR * donorOrbit
        : planetOrbitWorld(c.orbitRadius || 20, starR) * 1.15;
      outerRadius = Math.max(outerRadius, orbitWorld + 2);
      const line = buildOrbitLine(orbitWorld, opts.orbitColor);
      line.material.opacity = 0.2;
      root.add(line);
      extras.push(line);

      // The companion lights its own neighbourhood (dimmer than the primary).
      const cLight = new THREE.PointLight(
        cObj ? cObj.lightColor : 0xfff3e0,
        cObj ? Math.min(0.9, (cObj.lightIntensity || 1) * 0.4) : 0.6,
        0, 0);
      holder.add(cLight);

      let stream = null;
      if (entry.feeding && Cosmos && Cosmos.buildAccretionStream) {
        stream = Cosmos.buildAccretionStream({
          fromRadius: cR * 0.9,
          toRadius: rimR,
          length: orbitWorld,
          seed: Math.floor(hash01(c.name, 811) * 1e9),
        });
        root.add(stream.group);
      }

      companionUnits.push({
        holder, group: cGroup, obj: cObj, stream,
        orbit: orbitWorld,
        // Real Kepler period even for a feeding donor: a mass-transfer binary
        // is tight in reality, so its own short orbitRadius already gives it
        // a fast, physically honest period rather than the fixed "slow
        // enough to watch" rate this used to be pinned to.
        periodMin: orbitPeriodMinutes(c.orbitRadius || 20, systemData.mass),
        phase: hash01(c.name, 17) * Math.PI * 2,
      });
    });

    basePickCount = pickables.length;
    const baseScalableCount = scalables.length;

    // --- Player ship (positioned each frame by updateShip) -----------------
    // Carries its own beacon (see buildShip): the hull is now tiny (1 km-scale,
    // SHIP_WORLD_LENGTH), so once the camera pulls back to frame a whole
    // system it is otherwise imperceptible - Scene3D fades the beacon in with
    // distance the same way the galaxy-scale ship already does.
    const ship = buildShip({ beacon: true });
    ship.group.position.set(0, 0.4, starR + 1.2);
    root.add(ship.group);
    const shipTmp = new THREE.Vector3();
    const shipTmpTo = new THREE.Vector3();   // reused travel destination (no per-frame alloc)
    // The parking orbit's angle is INTEGRATED rather than read off the clock:
    // a refuel run speeds the drift up, and angle = t * rate would have made
    // every rate change teleport the hull around the star (see updateShip).
    let parkPhase = 0;
    let parkPhaseT = null;

    // Reveal every moon of a focused planet, spreading the extras as a 3D
    // swarm of cheap colored moonlets beyond the major moons. Returns framing
    // info for the camera. Idempotent per planet.
    function focusPlanet(planetData) {
      const o = orbiters.find((x) => x.planetData === planetData ||
        (planetData && x.planetData && x.planetData.name === planetData.name));
      if (!o) return null;
      if (!o._focused) {
        o._focused = true;
        const extra = o.allMoons.slice(SYSTEM_MOON_CAP);
        if (extra.length) {
          if (!focusMoonGeo) focusMoonGeo = new THREE.SphereGeometry(1, 12, 8);
          // Planet-radius-relative, picking up just beyond the major moons
          // (which sit out to ~7 planet radii).
          const startR = o.planetVisR * 8;
          const span = o.planetVisR * 14;
          extra.forEach((moon, j) => {
            const mVisR = extraMoonRadius(moon, o.planetVisR);
            const mat = new THREE.MeshPhongMaterial({
              color: new THREE.Color(moon.color || "#9aa0aa"),
              shininess: 6, emissive: 0x05070b,
            });
            focusMats.push(mat);
            const mesh = new THREE.Mesh(focusMoonGeo, mat);
            mesh.scale.setScalar(mVisR);
            const moonHolder = new THREE.Group();
            o.holder.add(moonHolder);
            moonHolder.add(mesh);
            const frac = (j + 1) / extra.length;
            o.moons.push({
              holder: moonHolder, group: mesh,
              orbit: startR + Math.sqrt(frac) * span,
              periodMin: moonPeriodMinutes(moon.period),
              phase: moon.phase || (j * 2.399),
              inc: (((j * 47) % 100) / 100 - 0.5) * 0.9,
              node: (j * 2.399) % (Math.PI * 2),
            });
            o._extra.push({ holder: moonHolder, mesh: mesh });
            const mPick = { object: moonHolder, radius: mVisR, kind: "moon", data: moon, system: systemData, planet: planetData };
            pickables.push(mPick);
            scalables.push({
              group: mesh, pick: mPick, baseR: mVisR,
              minPx: MIN_APPARENT_PX.moon, maxBoost: MAX_APPARENT_BOOST.moon,
            });
          });
        }
      }
      const moonOuter = o.moons.length
        ? o.moons[o.moons.length - 1].orbit + o.planetVisR
        : o.planetVisR * 1.5;
      return { object: o.holder, radius: o.planetVisR, moonOuter };
    }

    // Tear down whatever planet focus added (cheap moonlets + their pickables).
    function clearPlanetFocus() {
      orbiters.forEach((o) => {
        if (!o._focused) return;
        o._focused = false;
        o._extra.forEach((e) => {
          if (e.mesh.material && e.mesh.material.dispose) e.mesh.material.dispose();
          e.holder.remove(e.mesh);
          o.holder.remove(e.holder);
        });
        o._extra.length = 0;
        o.moons.length = o.baseMoonCount;
      });
      focusMats.length = 0;
      pickables.length = basePickCount;
      scalables.length = baseScalableCount;
    }

    // --- Apparent-size floor -----------------------------------------------
    // Bodies are sized physically (see compressRadius), which makes them
    // sub-pixel when the whole system is framed. Each frame, grow - never
    // shrink - anything below its minimum apparent size, capped per kind. Close
    // up every boost falls back to 1 and the true relative sizes are what you
    // see. `fovK` is (viewportHeight / 2) / tan(fov / 2): screen radius in
    // pixels = worldRadius * fovK / distance.
    // The boost used to aim `px * boost` exactly AT minPx (boost = minPx/px),
    // which makes every undersized body land on the SAME apparent size once
    // boosted - at a whole-system framing distance, most of a system's moons
    // are undersized at once, so they all read as identical grey dots with no
    // trace of their real size difference. BOOST_SOFTNESS raises that ratio
    // to a fractional power instead, so a body further below the floor still
    // grows more than one just under it (staying readable), but the two never
    // land on the same pixel size - real smallness still reads as smaller.
    const BOOST_SOFTNESS = 0.6;
    const _apparentTmp = new THREE.Vector3();
    // Reused by animate() when aiming comet tails away from the star.
    const _tailFrom = new THREE.Vector3();
    const _tailTo = new THREE.Vector3();
    function updateApparentSizes(cameraPos, fovK) {
      if (!cameraPos || !fovK) return;
      for (const s of scalables) {
        if (!s.group) continue;
        s.group.getWorldPosition(_apparentTmp);
        const dist = cameraPos.distanceTo(_apparentTmp);
        if (dist <= 0) continue;
        const px = (s.baseR * fovK) / dist;
        const boost = px >= s.minPx ? 1
          : clamp(Math.pow(s.minPx / px, BOOST_SOFTNESS), 1, s.maxBoost);
        const r = s.baseR * boost;
        if (s.group.scale.x !== r) s.group.scale.setScalar(r);
        if (s.pick) s.pick.radius = r; // keep click targets in sync with what's drawn
      }
      // The "?" rides on top of whatever the world is currently drawn at, so it
      // stays legible whether the system is framed whole or the planet fills the
      // screen.
      for (const m of anomalyMarkers) {
        const r = (m.pick && m.pick.radius) || 0.1;
        m.mark.sprite.position.set(0, r * 2.1, 0);
        const s = Math.max(r * 1.5, 0.05);
        m.mark.sprite.scale.set(s, s, 1);
      }
    }

    // --- Per-frame animation ------------------------------------------------
    // `t` (elapsed real seconds since this view was built) still drives pure
    // flavour animation - axial spin, pulses, jets, tails - none of which
    // carries information the player could act on. Orbital POSITION is
    // different: it is read fresh off the shared game clock every frame (see
    // orbitPeriodMinutes/gameClockMinutes above), so it is wherever that
    // clock says it should be, never "wherever it drifted to while this view
    // happened to be open" - leaving for the galaxy view and coming back (or
    // sleeping, fast-travelling, cryo-jumping) moves every orbit by exactly
    // as much game time as actually passed, no more and no less.
    function animate(t) {
      const gameMin = gameClockMinutes();
      if (starGroup && starGroup._body) starGroup._body.rotation.y = t * 0.05;
      // Magnetic prominence loops flicker independently of each other so the
      // corona reads as active plasma, not a static decal. Each loop also
      // sways sideways and, every few seconds, snaps: a quick collapse
      // toward the photosphere and a bright springy release, like a real
      // reconnection event. Both are pure functions of elapsed time, so nothing
      // needs to be tracked frame to frame beyond the arc's own fixed timing.
      if (starGroup && starGroup._arcs) {
        const updateArc = GS.Renderer3D.updateProminenceArc;
        for (const a of starGroup._arcs) {
          const cyclePos = (((t + a.snapPhase) % a.snapPeriod) / a.snapPeriod + 1) % 1;
          let heightMul = 1, flash = 0;
          if (cyclePos < a.snapWidth) {
            const u = cyclePos / a.snapWidth;
            // Quick collapse (u: 0 -> 0.4), springy overshoot back out (0.4 -> 1).
            const collapse = u < 0.4 ? (u / 0.4) : (1 - (u - 0.4) / 0.6);
            heightMul = 1 - collapse * 0.85;
            flash = Math.sin(Math.min(u, 1) * Math.PI);
          }
          const sway = Math.sin(t * a.swayRate + a.swayPhase) * a.swayAmp;
          const height = 1 + (a.archHeight - 1) * heightMul;
          if (updateArc) updateArc(a, height, sway * heightMul);
          // Every strand of the rope brightens together, so the whole loop
          // flares as one on a reconnection snap.
          const flicker = 0.62 + 0.38 * Math.sin(t * a.rate + a.phase);
          for (const st of a.strands) {
            st.mat.opacity = Math.min(1, st.baseOpacity * flicker * (1 + flash * 1.8));
          }
        }
      }
      if (blackHole) blackHole.animate(t);
      if (exoticStar) exoticStar.animate(t);
      if (dyson) dyson.animate(t);
      if (rogueGroup && rogueGroup._body) rogueGroup._body.rotation.y = t * 0.02;
      for (const cu of companionUnits) {
        const a = cu.phase + (gameMin / cu.periodMin) * Math.PI * 2;
        cu.holder.position.set(Math.cos(a) * cu.orbit, 0, Math.sin(a) * cu.orbit);
        if (cu.obj) cu.obj.animate(t);
        else if (cu.group && cu.group._body) cu.group._body.rotation.y = t * 0.07;
        if (cu.stream) {
          // The stream runs from the live donor position onto the primary, and
          // wraps around it, so it is cut to the full separation.
          cu.stream.group.position.copy(cu.holder.position);
          cu.stream.group.lookAt(0, 0, 0);
          cu.stream.setLength(cu.orbit);
          cu.stream.animate(t);
        }
      }
      for (const b of beltMeshes) b.mesh.rotation.y = (gameMin / b.periodMin) * Math.PI * 2;
      // A burning world does not shine steadily: the halo breathes on two
      // beats that never quite line up.
      for (const g of ignitedGlows) {
        const k = g.base * (1 + 0.06 * Math.sin(t * 1.7) + 0.04 * Math.sin(t * 2.9));
        g.glow.mat.opacity = 0.78 + 0.18 * Math.sin(t * 2.3);
        g.glow.sprite.scale.set(k, k, 1);
      }
      // A slow breath on the marker, and it goes out the moment the encounter
      // it stands for has been answered.
      if (anomalyMarkers.length) {
        const A = GS.Anomaly;
        const pulse = 0.72 + 0.28 * Math.sin(t * 2.2);
        for (const m of anomalyMarkers) {
          m.mark.sprite.visible = !A || A.isPending(systemData, m.planet);
          m.mark.mat.opacity = pulse;
        }
      }
      for (const o of orbiters) {
        const a = o.phase + (gameMin / o.periodMin) * Math.PI * 2;
        const px = Math.cos(a) * o.orbit, pz = Math.sin(a) * o.orbit;
        if (o.inc) {
          // Rx(inc) then Ry(node) - matching the guide line's XYZ Euler exactly,
          // so the planet always rides its drawn orbit.
          const py = -pz * Math.sin(o.inc), pz2 = pz * Math.cos(o.inc);
          const cn = Math.cos(o.node), sn = Math.sin(o.node);
          o.holder.position.set(px * cn + pz2 * sn, py, -px * sn + pz2 * cn);
        } else {
          o.holder.position.set(px, 0, pz);
        }
        if (o.group && o.group._body) {
          o.group._body.rotation.y = t * 0.12 + (o.group._phase || 0);
          if (o.group._clouds) o.group._clouds.rotation.y = t * 0.17 + (o.group._phase || 0);
          // Debris shells, rings of dust: anything the body carries that keeps
          // its own rate instead of the planet's day (see buildOrbitalDebris).
          if (o.group._animateExtras) o.group._animateExtras(t);
          // A comet's tail is blown by the star, so it points straight down the
          // line from the star through the comet, whatever the comet is doing.
          if (o.group._orientTail) {
            o.holder.getWorldPosition(_tailFrom);
            root.getWorldPosition(_tailTo);
            _tailFrom.sub(_tailTo);
            if (_tailFrom.lengthSq() > 1e-8) o.group._orientTail(_tailFrom.normalize());
          }
        }
        for (const m of o.moons) {
          const ma = m.phase + (gameMin / m.periodMin) * Math.PI * 2;
          const ox = Math.cos(ma) * m.orbit, oz = Math.sin(ma) * m.orbit;
          if (m.inc) {
            // Tilt the orbit plane (inclination about X, node about Y) so the
            // revealed swarm reads as a 3D cloud rather than a flat disc.
            const y = oz * Math.sin(m.inc), z2 = oz * Math.cos(m.inc);
            const cy = Math.cos(m.node), sy = Math.sin(m.node);
            m.holder.position.set(ox * cy - z2 * sy, y, ox * sy + z2 * cy);
          } else {
            m.holder.position.set(ox, 0, oz);
          }
          if (m.group && m.group._body) m.group._body.rotation.y = t * 0.2;
        }
      }
    }

    // Position the ship in this view's local frame. Called by Scene3D each
    // frame AFTER animate() (so planet holders are at their current spot).
    //   state = { mode:'parkedStar'|'parkedPlanet'|'traveling',
    //             planetName, fromName, toName, progress,
    //             approach, approachSpin }
    // `approach` (0..1) is how far the ship has drawn in toward the star it
    // is drawing fuel from; `approachSpin` speeds the pass up into a flyby
    // (a Schrodingerite harvest skimming a black hole's disk).
    function updateShip(state, t) {
      state = state || { mode: "parkedStar" };
      const g = ship.group;
      // The ship only exists in the system it is really in; every other system
      // view keeps it hidden (fixes the ghost ship at unvisited systems).
      if (state.mode === "hidden") {
        if (g.visible) g.visible = false;
        return;
      }
      if (!g.visible) g.visible = true;
      if (state.mode === "traveling") {
        // Reuse persistent temp vectors instead of clone()/new every frame.
        // lerpVectors reads (does not mutate) its two args, so the live holder
        // positions can be passed directly and the fallbacks reuse shipTmp*.
        const from = state.fromName && planetHolders[state.fromName]
          ? planetHolders[state.fromName].position
          : shipTmp.set(0, 0.4, starR + 1.2);
        const to = state.toName && planetHolders[state.toName]
          ? planetHolders[state.toName].position
          : shipTmpTo.set(0, 0, 0);
        g.position.lerpVectors(from, to, Math.max(0, Math.min(1, state.progress || 0)));
        g.position.y += 0.25;
        g.lookAt(to);
      } else if (state.mode === "parkedPlanet" && planetHolders[state.planetName]) {
        const h = planetHolders[state.planetName].position;
        // The parking orbit has to clear the ACTUAL planet's own visual
        // radius, not a hardcoded Earth-sized stand-in - that stand-in put
        // the ship a fixed distance out regardless of what it was orbiting,
        // so any planet bigger than Earth (a gas giant especially) buried the
        // ship inside its own surface instead of parking near it.
        const po = orbiters.find((o) => o.planetData && o.planetData.name === state.planetName);
        const planetR = po ? po.planetVisR : planetVisualRadius({ radius: 1 });
        const r = planetR + Math.max(0.06, planetR * 0.4);
        // Very slow parking orbit around the planet.
        const a = t * 0.03;
        g.position.set(h.x + Math.cos(a) * r, h.y + 0.22, h.z + Math.sin(a) * r);
        // Nose along the orbit, so the detailed hull reads bow-forward.
        g.lookAt(h.x + Math.cos(a + 0.1) * r, h.y + 0.22, h.z + Math.sin(a + 0.1) * r);
      } else {
        // Parked at the primary by default; state.starName redirects the park
        // orbit onto a named companion/donor star of an N-ary system.
        let cx = 0, cz = 0, bodyR = starR, r = starR + 1.1;
        const h = state.starName && starHolders[state.starName];
        if (h) {
          cx = h.position.x;
          cz = h.position.z;
          bodyR = h.userData && h.userData.visR ? h.userData.visR : 0.5;
          r = bodyR + 1.1;
        }
        // Refuelling flies the hull in: the gap to the surface closes to a
        // quarter of the parking distance while the pumps run, and opens back
        // out when they stop. It never crosses the body's own radius.
        const approach = Math.max(0, Math.min(1, state.approach || 0));
        const gap = (r - bodyR) * (1 - 0.78 * approach);
        r = bodyR + Math.max(0.12, gap);
        // Very slow drift around the star when parked at the system centre; a
        // harvest flyby whips around several times faster.
        const spin = 0.02 * (1 + 5 * approach * (state.approachSpin ? 1 : 0.35));
        const stepT = parkPhaseT === null ? 0 : Math.max(0, Math.min(0.5, t - parkPhaseT));
        parkPhaseT = t;
        parkPhase += stepT * spin;
        const a = parkPhase;
        const y = 0.4 * (1 - 0.6 * approach);
        g.position.set(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r);
        g.lookAt(cx + Math.cos(a + 0.1) * r, y, cz + Math.sin(a + 0.1) * r);
      }
      ship.update(t, state.mode === "traveling");
    }

    function dispose() {
      if (R3D && R3D.disposeBodyGroup) {
        bodyGroups.forEach((g) => R3D.disposeBodyGroup(g));
      }
      extras.forEach((o) => {
        if (o.geometry && o.geometry.dispose) o.geometry.dispose();
        if (o.material && o.material.dispose) o.material.dispose();
      });
      orbiters.forEach((o) => o._extra.forEach((e) => {
        if (e.mesh.material && e.mesh.material.dispose) e.mesh.material.dispose();
      }));
      if (focusMoonGeo) focusMoonGeo.dispose();
      anomalyMarkers.forEach((m) => { m.mark.tex.dispose(); m.mark.mat.dispose(); });
      ignitedGlows.forEach((g) => { g.glow.tex.dispose(); g.glow.mat.dispose(); });
      ship.dispose();
      if (blackHole) blackHole.dispose();
      if (exoticStar) exoticStar.dispose();
      if (dyson) dyson.dispose();
      for (const cu of companionUnits) {
        if (cu.obj) cu.obj.dispose();
        if (cu.stream) cu.stream.dispose();
      }
      if (root.parent) root.parent.remove(root);
    }

    return {
      group: root, pickables, animate, updateShip, dispose, updateApparentSizes,
      outerRadius, planetHolders, starHolders, focusPlanet, clearPlanetFocus,
      // The live ship node, so the camera can centre on it wherever it is.
      shipGroup: ship.group,
      // Distance-driven wayfinding marker (see setBeaconScale) - the tiny hull
      // alone is imperceptible once the whole system is framed.
      setShipBeaconScale: ship.setBeaconScale,
      // Non-null only when the system's centre is a black hole (see
      // Cosmos.LENS_FRAG / Scene3D._renderLensed).
      lensInfo,
    };
  }

  function disposeObject3D(root) {
    const c = GS.Scene3DCosmos;
    if (c && c.disposeObject3D) c.disposeObject3D(root);
  }

  GS.Scene3DBodies = {
    buildSystem,
    buildOrbitLine,
    buildShip,
    makeGlowSprite,
    disposeObject3D,
    starVisualRadius,
    planetVisualRadius,
    SHIP_WORLD_LENGTH,
  };
})();
