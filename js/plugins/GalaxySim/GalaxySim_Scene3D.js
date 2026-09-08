/*:
 * @target MZ
 * @plugindesc GalaxySim 3D Scene - Real-time three.js star map (orchestrator)
 * @author Omni-Lex + Nocoldiz
 * @url
 * @help
 * ============================================================================
 * GalaxySim 3D Scene Module
 * ============================================================================
 * Scene_AdvancedStarMap3D: the real-time 3D replacement for the 2D-canvas
 * Scene_AdvancedStarMap. Owns the WebGL renderer, the three.js scene, the
 * camera rig + controllers (GalaxySim_Camera3D), the DOM overlay UI
 * (GalaxySim_Overlay), and the per-frame render loop / disposal lifecycle,
 * modelled on Vehicle/CamperDrivingSystem.js.
 *
 * The 2D Scene_AdvancedStarMap is kept as a fallback for machines without
 * WebGL; GalaxySim_Core decides which to push.
 *
 * Milestone status: M0 boots the overlay, renderer, camera, a background
 * starfield, the loop and a clean teardown. System/galaxy/cosmos content and
 * the full overlay arrive in later milestones.
 *
 * LOAD ORDER: after World3D / Camera3D / Scene3D_Bodies / Scene3D_Cosmos /
 * Overlay, before GalaxySim_Core.js. Requires THREE.js.
 */

(() => {
  "use strict";

  const GS = window.GalaxySim || (window.GalaxySim = {});
  const M = GS.Math || {};
  const SCALE_SYSTEM = M.SCALE_SYSTEM != null ? M.SCALE_SYSTEM : 0;
  const SCALE_GALAXY = M.SCALE_GALAXY != null ? M.SCALE_GALAXY : 1;
  const SCALE_LOCAL_GROUP = M.SCALE_LOCAL_GROUP != null ? M.SCALE_LOCAL_GROUP : 2;
  const SCALE_SUPERCLUSTER = M.SCALE_SUPERCLUSTER != null ? M.SCALE_SUPERCLUSTER : 3;
  const SCALE_FILAMENTS = M.SCALE_FILAMENTS != null ? M.SCALE_FILAMENTS : 4;
  const SCALE_OBSERVABLE = M.SCALE_OBSERVABLE != null ? M.SCALE_OBSERVABLE : 5;
  const SCALE_UNIVERSE_SPHERE = M.SCALE_UNIVERSE_SPHERE != null ? M.SCALE_UNIVERSE_SPHERE : 6;
  const MAX_SCALE = SCALE_UNIVERSE_SPHERE;

  // Scale-ladder hysteresis (seconds): how long the camera must sit past a band
  // edge before stepping, and how long after a step the ladder stays locked.
  // Kept short so a continuous wheel/L2-R2 zoom reads as one fluid motion
  // across a band edge rather than a deliberate, separate action.
  const LADDER_DWELL = 0.3;
  const LADDER_COOLDOWN = 0.6;

  // Reach of the biosignature scanner, in light years.
  const BIOSCAN_RADIUS = 500;

  // Grand Tour: seconds lingering on each body, and the cinematic auto-orbit
  // rate (radians/second) while it holds. Matches the SYSTEM_MOON_CAP cap in
  // Scene3D_Bodies (only the moons actually rendered/pickable get a stop).
  const TOUR_HOLD = 6.5;
  const TOUR_SPIN = 0.09;

  // How many of a point cloud's nearest members controller selection offers:
  // stepping around a ring of thousands of identical stars helps nobody.
  const CYCLE_LIMIT = 48;

  // The Starship's own interior: the map it is walked around on and the tile at
  // its helm, facing up. The ship cannot leave orbit with the party wandering a
  // planet, so plotting a course boards them first (see _boardStarship).
  const SHIP_INTERIOR = { mapId: 721, x: 28, y: 10, dir: 8 };

  /** Straight-line distance in light years between two {x,y,z} points. */
  function distanceBetween(a, b) {
    if (!a || !b) return Infinity;
    const dx = (a.x || 0) - (b.x || 0);
    const dy = (a.y || 0) - (b.y || 0);
    const dz = (a.z || 0) - (b.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // A yellow ring texture for bookmark markers - a hollow highlight (not a
  // filled glow), so it reads as a marker sitting ON a body rather than a
  // light source coming from it.
  let _bookmarkTex = null;
  function bookmarkMarkerTexture() {
    if (_bookmarkTex) return _bookmarkTex;
    const s = 64;
    const cv = document.createElement("canvas");
    cv.width = cv.height = s;
    const ctx = cv.getContext("2d");
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(255,224,102,0)");
    g.addColorStop(0.58, "rgba(255,224,102,0)");
    g.addColorStop(0.72, "rgba(255,224,102,0.95)");
    g.addColorStop(0.86, "rgba(255,224,102,0.95)");
    g.addColorStop(1, "rgba(255,224,102,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    _bookmarkTex = new THREE.CanvasTexture(cv);
    return _bookmarkTex;
  }

  // Cosmos builder + label for each far scale.
  const COSMIC_BUILDERS = {
    [SCALE_LOCAL_GROUP]: "buildLocalGroup",
    [SCALE_SUPERCLUSTER]: "buildSupercluster",
    [SCALE_FILAMENTS]: "buildCosmicWeb",
    [SCALE_OBSERVABLE]: "buildObservable",
    [SCALE_UNIVERSE_SPHERE]: "buildUniverseSphere",
  };

  class Scene_AdvancedStarMap3D extends Scene_Base {
    create() {
      super.create();

      // Consumed once here so it never leaks into a later normal OpenStarMap
      // call (see GalaxySim.openStarMapMinigame).
      this._minigameMode = !!(window.GalaxySim && window.GalaxySim.minigameMode);
      if (window.GalaxySim) window.GalaxySim.minigameMode = false;

      // Defensive: Core only pushes us when WebGL is available, but guard so a
      // misconfiguration falls back cleanly instead of throwing.
      if (typeof THREE === "undefined" ||
          !(GS.Renderer3D && GS.Renderer3D.available && GS.Renderer3D.available())) {
        console.error("[GalaxySim3D] THREE/WebGL unavailable; returning to previous scene.");
        this._failed = true;
        return;
      }

      if (M.refreshThemeColors) {
        try { M.refreshThemeColors(); } catch (e) { /* theme optional */ }
      }

      this._initData();
      this._createOverlay();
      this._initThree();
      this._initCamera();

      this._overlayUI = new GS.Overlay.GalaxyOverlay(this._overlayEl);
      this._overlayUI.create();
      if (this._minigameMode) this._overlayUI.setMinigameMode(true);
      this._wireOverlayCallbacks();

      this._initContent();
      this._initPicking();

      this._target = null;
      this._camBoost = 0;
      this._suppressOk = 0;
      this._followShipCam = false;
      // Set by L3 (see _updatePadButtons): lets a pad reach the persistent
      // toolbar (Ship/Bioscan/Grand Tour/Home/SB-Bridge/Return-to-Earth) with
      // the focus ring even with nothing selected and no panel open, which
      // navActive otherwise reserves for camera panning.
      this._padFocusActive = false;

      // Cockpit toggle (F) and zoom-to-target (Space). Raw keydown so they are
      // independent of the RPG keymap; Space additionally suppresses the "ok"
      // trigger it would otherwise fire on the overlay's focused button.
      this._onModeKey = (e) => {
        if (e.repeat) return;
        if (e.code === "KeyF") this._toggleMode();
        else if (e.code === "Space") {
          e.preventDefault();
          this._suppressOk = 3;
          if (this._mode !== "fly") this._zoomToTarget();
        } else if (e.code === "Tab") {
          // Keyboard twin of the pad's LB/RB: step through what is selectable.
          e.preventDefault();
          this._cycleSelection(e.shiftKey ? -1 : 1);
        }
      };
      document.addEventListener("keydown", this._onModeKey);
      this._updateModeHint();

      this._lastTime = null;
      this._active = true;
      this._suspended = false;
      this._onResize = this._onResize.bind(this);
      window.addEventListener("resize", this._onResize);
      this._loop = this._loop.bind(this);
      this._animId = requestAnimationFrame(this._loop);
    }

    // ----------------------------------------------------------------------
    // Setup
    // ----------------------------------------------------------------------
    _initData() {
      if (!$gameSystem.starMapData) {
        $gameSystem.starMapData = new GS.DataManager();
      }
      this.dataManager = $gameSystem.starMapData;
      if (!this.dataManager.proceduralGenerated) {
        this.dataManager.generateProceduralSystems();
      }
      this._world = new GS.World3D.WorldScale();
      this._scale = SCALE_SYSTEM; // M1 opens inside the current star system

      // Resolve the player's current system (fall back to Sol / first system).
      const ship = this.dataManager.playerShip;
      const wantName = (ship && ship.currentSystem) ||
        (window.$gameVariables && $gameVariables.value(96)) || "Sol";   // i18n-ignore: system / body id
      this._system = this.dataManager.getSystem(wantName) ||
        this.dataManager.getSystem("Sol") ||   // i18n-ignore: system / body id
        this.dataManager.getAllSystems()[0] || null;
      this._focusSystem = this._system; // galaxy-scale origin / home

      // If the ship was left parked somewhere inside a procedural (non-Milky-
      // Way) galaxy - its systems are named "GX.<seed>.<i>" / "GX.<seed>.BH" -
      // remember which galaxy that is so zooming out of this cold-started
      // system view returns there instead of dumping the player into the
      // hardcoded Milky Way (see _checkScaleTransition / _returnGalaxyFocus).
      this._returnGalaxyFocus = this._galaxyFocusFromSystemName(
        this._system && this._system.name);
    }

    /** Derive a { seed, parentScale, parentCluster, name } stub from a
     * "GX.<seed>.<i|BH>" system name, or null for a Milky Way system. Used to
     * recall which procedural galaxy a system belongs to when nothing richer
     * (a live `_galaxyFocus`) is available - e.g. right after a save load. */
    _galaxyFocusFromSystemName(name) {
      if (typeof name !== "string" || !name.startsWith("GX.")) return null;
      const seed = parseInt(name.split(".")[1], 10);
      if (!Number.isFinite(seed)) return null;
      const S = GS.Math && GS.Math.Strangeness;
      return {
        name: null, seed, parentScale: SCALE_GALAXY, parentCluster: null,
        tier: S ? S.tierOfSeed(seed) : 0,
      };
    }

    _createOverlay() {
      const el = document.createElement("div");
      el.id = "galaxysim-overlay";
      el.style.cssText =
        "position:fixed;top:0;left:0;width:100%;height:100%;" +
        "z-index:9999;overflow:hidden;background:#000510;";
      document.body.appendChild(el);
      document.body.style.overflow = "hidden";
      this._overlayEl = el;
    }

    _initThree() {
      const w = window.innerWidth;
      const h = window.innerHeight;

      this._scene = new THREE.Scene();

      const clip = this._world.clip(this._scale);
      this._camera = new THREE.PerspectiveCamera(60, w / h, clip.near, clip.far);

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: "high-performance",
        // The scales run from a 0.01 unit near plane out to a 200000 unit far
        // one, a 2e6 ratio a 24-bit depth buffer cannot hold without z-fighting
        // at the far end. A logarithmic buffer carries it.
        logarithmicDepthBuffer: true,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
      renderer.setSize(w, h);
      renderer.setClearColor(0x000510, 1);
      // Dual colour-API support (legacy r12x sRGBEncoding + modern SRGBColorSpace).
      if ("outputColorSpace" in renderer && THREE.SRGBColorSpace !== undefined) {
        renderer.outputColorSpace = THREE.SRGBColorSpace;
      } else if ("outputEncoding" in renderer && THREE.sRGBEncoding !== undefined) {
        renderer.outputEncoding = THREE.sRGBEncoding;
      }
      renderer.domElement.style.cssText = "position:absolute;top:0;left:0;display:block;";
      this._overlayEl.appendChild(renderer.domElement);
      this._renderer = renderer;

      // Guard the rAF loop against a lost WebGL context: rendering on a lost
      // context throws every frame with no recovery. Skip rendering while lost
      // and resume on restore (three.js reinitialises GL resources on restore).
      this._contextLost = false;
      this._onContextLost = (e) => { e.preventDefault(); this._contextLost = true; };
      this._onContextRestored = () => { this._contextLost = false; this._lastTime = null; };
      renderer.domElement.addEventListener("webglcontextlost", this._onContextLost, false);
      renderer.domElement.addEventListener("webglcontextrestored", this._onContextRestored, false);

      // Fade plate used to mask the pop when swapping scales (DOM order keeps it
      // above the canvas but below the UI overlay, which is appended later).
      const fade = document.createElement("div");
      fade.style.cssText =
        "position:absolute;top:0;right:0;bottom:0;left:0;background:#000510;opacity:0;" +
        "pointer-events:none;transition:none;";
      this._overlayEl.appendChild(fade);
      this._fadeEl = fade;
      this._fadeAlpha = 0;

      // A faint ambient so future lit meshes are never pure black; the system
      // star adds a directional light at SYSTEM scale (M1).
      this._ambient = new THREE.AmbientLight(0x223044, 0.6);
      this._scene.add(this._ambient);
    }

    _initCamera() {
      const Cam = GS.Camera3D;
      this._rig = new Cam.CameraRig(this._camera);
      this._rig.snapTo(new THREE.Vector3(0, 0, 0), 60);
      this._orbit = new Cam.OrbitController(this._rig, this._renderer.domElement);
      this._fly = new Cam.FlyController(this._rig, this._renderer.domElement);
      this._mode = "orbit";
      this._orbit.enable();
    }

    _initContent() {
      this._elapsed = 0;
      this._ladderHold = 0;
      this._ladderCooldown = LADDER_COOLDOWN;

      // Deep-space background dome (backdrop at every scale).
      this._background = GS.Scene3DCosmos.buildBackgroundStarfield({
        radius: 8000,
        count: 2400,
        seed: 19002001,
      });
      this._scene.add(this._background);

      // Opens inside the current star system; zooming out steps up to galaxy.
      this._buildSystemView();
    }

    // ----------------------------------------------------------------------
    // Scale management (SYSTEM <-> GALAXY; further scales added in M6)
    // ----------------------------------------------------------------------
    _enterScale(scale, focusSystem) {
      // Captured before teardown/reassignment below overwrite it - lets
      // _buildCosmicScale tell a genuine zoom-OUT (e.g. leaving the galaxy we
      // were just in) apart from a fresh/unrelated entry into the scale.
      const priorScale = this._scale;
      // Remember which procedural galaxy (if any) this system belongs to
      // BEFORE teardown clears _galaxyFocus, so zooming back out of it steps
      // back into that galaxy's own cosmic view instead of the scale ladder's
      // generic "SYSTEM -> Milky Way" default (see _checkScaleTransition).
      if (scale === SCALE_SYSTEM) {
        const name = focusSystem && focusSystem.name;
        if (this._galaxyFocus) {
          this._returnGalaxyFocus = this._galaxyFocus;
        } else {
          const derived = this._galaxyFocusFromSystemName(name);
          if (derived) {
            // Keep the richer remembered focus (real parentScale/parentCluster/
            // name) when it's still the same galaxy; only replace it outright
            // when hopping to a system in a DIFFERENT procedural galaxy.
            if (!this._returnGalaxyFocus || this._returnGalaxyFocus.seed !== derived.seed) {
              this._returnGalaxyFocus = derived;
            }
          } else {
            this._returnGalaxyFocus = null; // a Milky Way system - nothing to return to
          }
        }
      }
      this._teardownScaleContent();
      this._flashTransition();
      this._scale = scale;
      this._ladderHold = 0;
      this._ladderCooldown = LADDER_COOLDOWN;
      if (focusSystem) this._focusSystem = focusSystem;
      this._selectedPick = null;
      this._lastShipStatus = null;
      if (this._overlayUI) this._overlayUI.deselect();

      const clip = this._world.clip(scale);
      this._camera.near = clip.near;
      this._camera.far = clip.far;
      this._camera.updateProjectionMatrix();

      if (scale === SCALE_SYSTEM) {
        this._system = this._focusSystem;
        this._buildSystemView();
      } else if (scale === SCALE_GALAXY) {
        this._buildGalaxyView();
      } else {
        this._buildCosmicScale(scale, priorScale);
      }
      this._updateModeHint();
      // The target outlives the scale swap: re-acquire it in the content we
      // just built so the reticle keeps marking whatever the player picked.
      this._restoreTarget();
    }

    _teardownScaleContent() {
      this._followShipCam = false;
      this._planetFocus = null;
      this._webCluster = null;
      this._galaxyFocus = null;
      if (this._systemView) { this._systemView.dispose(); this._systemView = null; }
      if (this._galaxyShip) { this._galaxyShip.dispose(); this._galaxyShip = null; }
      if (this._lazyField) { this._lazyField.dispose(); this._lazyField = null; }
      if (this._galaxyView) { this._galaxyView.dispose(); this._galaxyView = null; }
      if (this._cosmicView) { this._cosmicView.dispose(); this._cosmicView = null; }
      this._pickTargets = [];
      this._galaxyPoints = null;
      this._galaxyByIndex = null;
      this._webPickCache = null;
    }

    _buildCosmicScale(scale, priorScale) {
      const fn = COSMIC_BUILDERS[scale];
      const builder = fn && GS.Scene3DCosmos[fn];
      if (!builder) return;
      this._cosmicView = builder({ seed: 19002001 + scale });
      this._scene.add(this._cosmicView.group);
      // Named galaxies / clusters / anomalies at this scale are selectable via
      // the same screen-space test the system scale uses.
      this._pickTargets = this._cosmicView.pickables || [];
      this._refreshBookmarkMarkers();

      const r = this._cosmicView.radius || 1500;
      this._rig.minDistance = r * 0.12;
      // Every scale but the last has another one above it, so its outer band
      // is a doorway and the camera may run past it. The last one has nothing
      // above it: pulling out there used to leave the whole universe as a
      // speck in the middle of a black screen, with no way to tell the zoom
      // was still working. It stops at the edge of what it is drawing.
      this._rig.maxDistance = scale === MAX_SCALE ? r * 2.4 : r * 6;
      // Panning may drift a view's width off centre and no further: past that
      // the scale is empty space with nothing to look at or click (see
      // CameraRig.clampPan).
      this._rig.panLimit = r * 1.5;
      // Zooming OUT of the galaxy scale into the Local Group used to snap
      // straight to a framing of the WHOLE group (r*1.4, ~1400 units), which
      // yanked the camera far away from the Milky Way marker the player was
      // just looking at. Landing here that way instead parks close to the
      // home galaxy's own marker (flagged `home` in Scene3DCosmos' catalogue,
      // always the Milky Way at this scale) and leaves pulling back further
      // to the player.
      // Zoom bands for the ladder (see _checkScaleTransition).
      this._inDist = r * 0.42;
      this._outDist = scale === MAX_SCALE ? Infinity : r * 3.4;

      let focus = new THREE.Vector3(0, 0, 0), dist = r * 1.4;
      if (scale === SCALE_LOCAL_GROUP && priorScale === SCALE_GALAXY) {
        const home = (this._pickTargets || []).find((p) => p.data && p.data.home);
        if (home && home.object) {
          home.object.getWorldPosition(focus);
          // Clear of _inDist with real margin, or the ladder's own zoom-in
          // step (a fresh arrival sits still at exactly this distance, so an
          // unmargined value fires the moment the cooldown below lapses)
          // would immediately snap straight back into the galaxy we just left.
          dist = Math.max((home.radius || 40) * 3.2, this._inDist * 1.4);
        }
      }
      this._rig.snapTo(focus, dist);

      if (this._overlayUI) {
        this._overlayUI.setScale(this._world.name(scale), "");
      }
    }

    // ----------------------------------------------------------------------
    // Cosmic-web node -> procedural galaxy cluster. Each dot in the web view is
    // a doorway: entering it swaps the web out for a deterministic cluster of
    // galaxies (wired with its own filaments) generated from the node's seed.
    // Zooming back out past the framing band restores the web.
    // ----------------------------------------------------------------------
    _enterWebCluster(index) {
      if (this._scale !== SCALE_FILAMENTS) return;
      const seed = GS.Scene3DCosmos.clusterSeed(index);
      // The node's own tier, read off the web before it is torn down: it is
      // what makes everything inside this cluster ordinary or impossible.
      const cv = this._cosmicView;
      const tier = (cv && cv.nodeTier) ? cv.nodeTier(index) : 0;
      this._teardownScaleContent();
      this._flashTransition();
      this._webCluster = { index, seed, tier };
      this._cosmicView = GS.Scene3DCosmos.buildProceduralCluster({ seed, tier });
      this._scene.add(this._cosmicView.group);
      this._pickTargets = this._cosmicView.pickables || [];
      this._refreshBookmarkMarkers();

      const r = this._cosmicView.radius || 1100;
      this._rig.minDistance = r * 0.06;
      this._rig.maxDistance = r * 5;
      this._rig.panLimit = r * 1.5;
      this._rig.snapTo(new THREE.Vector3(0, 0, 0), r * 1.5);
      this._inDist = 0;          // nothing deeper than a cluster member
      this._outDist = r * 3.0;   // zoom out -> back to the cosmic web
      this._ladderHold = 0;
      this._ladderCooldown = LADDER_COOLDOWN;

      if (this._overlayUI) {
        this._overlayUI.setScale(this._cosmicView.name || T('Galaxy.scale.cluster'), T('Galaxy.scale.webNode'));
      }
      this._updateModeHint();
      // Arriving consumes a node target - the doorway is behind us now, so the
      // player is free to pick a member galaxy as the next target.
      if (this._target && this._target.nodeIndex === index) this._setTarget(null);
      this._restoreTarget();
      if (window.SoundManager) SoundManager.playOk();
    }

    // ----------------------------------------------------------------------
    // Named galaxy -> procedural galaxy. Zooming to a galaxy at any far scale
    // generates its stars, arms and nebulae from a name-derived seed, so the
    // same galaxy always looks the same. The Milky Way is the exception: it has
    // a real interior, so it hands off to the galaxy scale instead.
    // ----------------------------------------------------------------------
    // `forced` optionally re-supplies { seed, parentScale, parentCluster } so
    // the zoom-out-from-SYSTEM ladder step (_checkScaleTransition) can dive
    // back into a remembered procedural galaxy instead of deriving a fresh
    // seed from `name` (which, for that path, may not even be known - see
    // _returnGalaxyFocus).
    _enterGalaxyFocus(name, forced, tierHint) {
      // The re-entry path (see _returnGalaxyFocus) may not know the galaxy's
      // display name (e.g. right after a save load) - fall back to the same
      // default buildProceduralGalaxy itself uses rather than a blank label.
      name = name || T('Galaxy.scale.unnamedGalaxy');
      const parentScale = forced ? forced.parentScale : this._scale;
      const parentCluster = forced ? forced.parentCluster
        : (this._webCluster ? this._webCluster.index : null);
      // A galaxy out in the far web is a strange place, and the tier that
      // says how strange is stamped into its seed here, once, at the moment
      // it is first named (see GalaxySim.Math.Strangeness).
      const tier = forced && forced.tier != null ? forced.tier
        : (tierHint != null ? tierHint
          : (this._webCluster ? (this._webCluster.tier || 0) : 0));
      const seed = forced ? forced.seed
        : GS.Scene3DCosmos.galaxySeedFromName(name, tier);
      this._teardownScaleContent();
      this._flashTransition();
      this._galaxyFocus = { name, seed, parentScale, parentCluster, tier };
      // Freshly looking at the galaxy's own cosmic view again; the return path
      // is only meaningful once we dive into one of its systems (re-derived by
      // _enterScale(SCALE_SYSTEM, ...) at that point).
      this._returnGalaxyFocus = null;
      this._cosmicView = GS.Scene3DCosmos.buildProceduralGalaxy({ seed, name, dataManager: this.dataManager });
      this._scene.add(this._cosmicView.group);
      this._pickTargets = this._cosmicView.pickables || [];
      this._refreshBookmarkMarkers();

      const r = this._cosmicView.radius || 2000;
      this._rig.minDistance = r * 0.05;
      this._rig.maxDistance = r * 4;
      this._rig.panLimit = r * 1.5;
      this._rig.snapTo(new THREE.Vector3(0, 0, 0), r * 1.4);
      this._inDist = 0;
      this._outDist = r * 2.6; // zoom out -> back where we came from
      this._ladderHold = 0;
      this._ladderCooldown = LADDER_COOLDOWN;

      if (this._overlayUI) this._overlayUI.setScale(name, T('Galaxy.scale.proceduralGalaxy'));
      // The galaxy we just flew into is no longer a destination.
      if (this._target && this._target.name === name) this._setTarget(null);
      this._updateModeHint();
      if (window.SoundManager) SoundManager.playOk();
    }

    // Re-enter a remembered procedural galaxy from INSIDE its own SYSTEM view
    // (zooming out of one of its systems), where `this._scale` is still
    // SCALE_SYSTEM and the camera clip planes are still the tight system-scale
    // ones. _enterGalaxyFocus alone doesn't touch either (it assumes the
    // caller is already sitting at the correct far scale), so bring both up to
    // the remembered parent scale first, exactly like _enterScale would.
    _reenterGalaxyFocus(rgf) {
      this._scale = rgf.parentScale != null ? rgf.parentScale : SCALE_GALAXY;
      const clip = this._world.clip(this._scale);
      this._camera.near = clip.near;
      this._camera.far = clip.far;
      this._camera.updateProjectionMatrix();
      this._selectedPick = null;
      this._lastShipStatus = null;
      if (this._overlayUI) this._overlayUI.deselect();
      this._enterGalaxyFocus(rgf.name, rgf);
    }

    _exitGalaxyFocus() {
      if (!this._galaxyFocus) return;
      const { parentScale, parentCluster } = this._galaxyFocus;
      this._teardownScaleContent(); // also clears _galaxyFocus
      this._flashTransition();
      this._scale = parentScale;
      if (parentCluster != null) {
        this._enterWebCluster(parentCluster);
        return;
      }
      this._buildCosmicScale(parentScale);
      this._ladderHold = 0;
      this._ladderCooldown = LADDER_COOLDOWN;
      this._updateModeHint();
      this._restoreTarget();
    }

    _exitWebCluster() {
      if (!this._webCluster) return;
      this._teardownScaleContent(); // also clears _webCluster
      this._flashTransition();
      this._buildCosmicScale(SCALE_FILAMENTS);
      this._ladderHold = 0;
      this._ladderCooldown = LADDER_COOLDOWN;
      this._updateModeHint();
      this._restoreTarget();
    }

    _buildSystemView() {
      if (!this._system) return;
      const orbitColor =
        (M.COLORS && M.COLORS.orbit) || "rgba(80,120,200,0.5)";
      this._systemView = GS.Scene3DBodies.buildSystem(this._system, { orbitColor });
      this._scene.add(this._systemView.group);
      // Minimal viewer mode: no ship to show or fly.
      if (this._minigameMode && this._systemView.shipGroup) {
        this._systemView.shipGroup.visible = false;
      }
      this._rebuildPickList();

      // Frame the whole system: pull the orbit camera back to fit the outer
      // orbit within the 60-deg vertical FOV, with headroom.
      const outer = this._systemView.outerRadius || 12;
      this._systemOuter = outer;
      const dist = Math.max(8, outer * 1.9 + 3);
      this._rig.maxDistance = outer * 5;
      this._rig.minDistance = 0.3;
      this._rig.panLimit = outer * 2.5;
      this._rig.snapTo(new THREE.Vector3(0, 0, 0), dist);
      this._inDist = 0;                 // bottom of the ladder
      this._outDist = outer * 3.2;      // zoom out -> galaxy

      if (this._overlayUI) {
        this._overlayUI.setScale(T('Galaxy.scale.starSystem'), this._system.name || "");
      }
    }

    _buildGalaxyView() {
      const systems = this.dataManager.getAllSystems();
      this._galaxyView = GS.Scene3DCosmos.buildGalaxyScale(systems, this._focusSystem, { starSize: 3.2 });
      this._scene.add(this._galaxyView.group);
      this._galaxyPoints = this._galaxyView.points;
      this._galaxyByIndex = this._galaxyView.systemsByIndex;

      // Lazy star field: streams deterministic procedural systems into the disk
      // around the camera focus as the player zooms in (see _loop / picking).
      this._lazyField = GS.Scene3DCosmos.createLazyStarField(this.dataManager);
      this._galaxyView.group.add(this._lazyField.group);

      // A ship marker that rides the galaxy cloud, carrying an always-on-top
      // beacon + "YOUR SHIP" tag so its position is easy to find among the stars.
      this._galaxyShip = GS.Scene3DBodies.buildShip({ beacon: true });
      this._galaxyShip.group.scale.setScalar(1.6);
      this._galaxyView.group.add(this._galaxyShip.group);
      // Minimal viewer mode: no ship to show or fly.
      if (this._minigameMode) this._galaxyShip.group.visible = false;
      // Re-arm camera-follow for any flight in progress when the scale is (re)built.
      this._wasTravellingGalaxy = false;
      this._followShip = false;

      // Frame the home neighbourhood out in the spiral arm; the galaxy core
      // sits ~1300 units away so the Sun is clearly NOT at the centre. Zoom out
      // (up to maxDistance) to take in the whole Milky Way.
      const focus = this._galaxyView.focusWorld || new THREE.Vector3();
      this._rig.minDistance = 4;
      this._rig.maxDistance = 9000;
      // The disk is ~2600 units across from the core, so this keeps a pan
      // inside the Milky Way with room to spare around its edge.
      this._rig.panLimit = 5000;
      this._rig.snapTo(focus.clone(), 70);
      // Zooming in past this band enters the *selected* system (see
      // _systemToEnter); with nothing selected the zoom simply clamps here.
      this._inDist = 9;
      this._outDist = 7000;    // zoom way out -> local group

      if (this._overlayUI) {
        this._overlayUI.setScale(T('Galaxy.scale.milkyWay'),
          this._focusSystem ? T('Galaxy.scale.near', { name: this._focusSystem.name || "" }) : "");
      }
      this._refreshBookmarkMarkers();
    }

    _flashTransition() {
      this._fadeAlpha = 1;
      if (this._fadeEl) this._fadeEl.style.opacity = "1";
    }

    _updateModeHint() {
      if (!this._overlayUI) return;
      // The mode line says WHERE the view is and stops there. It used to carry
      // a legend of keys and pad buttons for every scale; the game prints no
      // control hints (docs/task/ui_fixing.md), so the scale name is the line.
      if (this._mode === "fly") {
        this._overlayUI.setModeHint(`<b>${T('Galaxy.scale.cockpit')}</b>`);
        return;
      }
      let scaleName;
      if (this._scale === SCALE_SYSTEM && this._planetFocus) {
        scaleName = T('Galaxy.scale.planet');
      } else if (this._scale === SCALE_SYSTEM) {
        scaleName = T('Galaxy.scale.system');
      } else if (this._scale === SCALE_GALAXY) {
        scaleName = T('Galaxy.scale.galaxy');
      } else if (this._galaxyFocus) {
        scaleName = this._galaxyFocus.name;
      } else if (this._webCluster) {
        scaleName = T('Galaxy.scale.cluster');
      } else if (this._scale === SCALE_FILAMENTS) {
        scaleName = T('Galaxy.scale.web');
      } else {
        scaleName = this._world.name(this._scale);
      }
      this._overlayUI.setModeHint(`<b>${scaleName}</b>`);
    }

    // Toggle orbit <-> free-fly cockpit, sharing the camera transform so the
    // view never jumps (the rig derives its orbit params from the camera).
    _toggleMode() {
      if (this._mode === "orbit") {
        this._mode = "fly";
        this._orbit.disable();
        if (this._overlayUI) { this._overlayUI.deselect(); this._overlayUI.hideTooltip(); }
        this._fly.enable();
        if (window.SoundManager) SoundManager.playCursor();
      } else {
        this._mode = "orbit";
        this._fly.disable();
        this._rig.syncFromCamera(); // adopt the cockpit's position as orbit state
        this._orbit.enable();
        if (window.SoundManager) SoundManager.playCursor();
      }
      this._updateModeHint();
    }

    // Pixels of screen radius a 1-unit sphere covers at 1 unit distance:
    // screenRadius = worldRadius * fovK / distance.
    _fovK() {
      const h = (this._renderer && this._renderer.domElement.clientHeight) || window.innerHeight;
      return (h / 2) / Math.tan((this._camera.fov * Math.PI) / 360);
    }

    _rebuildPickList() {
      // Screen-space picking reads the live pickables array straight from the
      // system view (focus mutates it in place, so just hold the reference).
      this._pickTargets = (this._systemView && this._systemView.pickables) || [];
      this._refreshBookmarkMarkers();
    }

    // ----------------------------------------------------------------------
    // Picking (hover tooltip + click selection)
    // ----------------------------------------------------------------------
    _initPicking() {
      this._raycaster = new THREE.Raycaster();
      this._ndc = new THREE.Vector2();
      this._pickScratch = new THREE.Vector3();
      this._pickScratch2 = new THREE.Vector3();
      this._pointer = { cx: 0, cy: 0, inside: false };
      this._downPos = null;
      this._hovered = null;

      const dom = this._renderer.domElement;
      this._onPickMove = (e) => {
        const rect = dom.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        this._pointer.cx = e.clientX;
        this._pointer.cy = e.clientY;
        this._ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this._ndc.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
        this._pointer.inside = true;
      };
      this._onPickDown = (e) => {
        if (e.button === 0) this._downPos = { x: e.clientX, y: e.clientY };
      };
      this._onPickUp = (e) => {
        if (e.button !== 0 || !this._downPos) return;
        const moved = Math.abs(e.clientX - this._downPos.x) + Math.abs(e.clientY - this._downPos.y);
        this._downPos = null;
        if (moved <= 5) this._handleClick();
      };
      this._onPickLeave = () => { this._pointer.inside = false; this._setHover(null); };

      dom.addEventListener("mousemove", this._onPickMove);
      dom.addEventListener("mousedown", this._onPickDown);
      dom.addEventListener("mouseup", this._onPickUp);
      dom.addEventListener("mouseleave", this._onPickLeave);
    }

    _updatePicking() {
      if (this._mode === "fly" || !this._raycaster || !this._pointer.inside) {
        if (this._hovered) this._setHover(null);
        return;
      }
      let pick = null;
      if (this._scale !== SCALE_GALAXY) {
        if (this._pickTargets && this._pickTargets.length) pick = this._screenPick();
        // Cosmic web: every node dot is selectable (and enterable), so fall
        // through to a points raycast when no named hero object was hit.
        if (!pick) pick = this._webNodePick();
      } else if (this._scale === SCALE_GALAXY && this._galaxyPoints) {
        // Generous threshold so every system point is easy to click. Pick the
        // static catalog and the lazy field together; the nearest hit wins.
        // Raycasting up to 4000 points is costly, so reuse the last result
        // while neither the pointer nor the camera (nor the point clouds)
        // have changed since the previous frame.
        const lazyPts = this._lazyField && this._lazyField.points;
        const c = this._galaxyPickCache || (this._galaxyPickCache = {
          ndcX: NaN, ndcY: NaN,
          camPos: new THREE.Vector3(NaN, NaN, NaN),
          camQuat: new THREE.Quaternion(NaN, NaN, NaN, NaN),
          galaxyPoints: null, lazyPts: null, pick: null,
        });
        if (c.ndcX === this._ndc.x && c.ndcY === this._ndc.y &&
            c.galaxyPoints === this._galaxyPoints && c.lazyPts === lazyPts &&
            c.camPos.equals(this._camera.position) &&
            c.camQuat.equals(this._camera.quaternion)) {
          pick = c.pick;
        } else {
          this._raycaster.setFromCamera(this._ndc, this._camera);
          // A generous cone: the threshold is an absolute world radius around
          // the ray, so it has to grow with distance or far stars become
          // unclickable. Floor keeps nearby stars easy to grab too.
          this._raycaster.params.Points.threshold = Math.max(3.0, this._rig.distance * 0.05);
          const objs = lazyPts ? [this._galaxyPoints, lazyPts] : [this._galaxyPoints];
          const hits = this._raycaster.intersectObjects(objs, false);
          // three sorts hits by depth, so hits[0] is whatever is *nearest the
          // camera* inside the cone - not what the cursor is actually on. Score
          // by angular offset (offset from the ray / distance along it) so the
          // star under the crosshair wins, with a mild bias toward the closer
          // one when two are equally on-axis.
          let best = null, bestScore = Infinity;
          for (const h of hits) {
            const along = h.distance || 1e-6;
            const score = (h.distanceToRay != null ? h.distanceToRay : 0) / along +
              along * 1e-7;
            if (score < bestScore) { bestScore = score; best = h; }
          }
          if (best) {
            const sys = (lazyPts && best.object === lazyPts)
              ? this._lazyField.systemAt(best.index)
              : this._galaxyByIndex[best.index];
            if (sys) pick = { kind: "star", data: sys, system: sys };
          }
          // Named nebulae are decorative sprites, not points, so the raycast
          // above never sees them - screen-pick the small hero list too and
          // let a star under the cursor win over a much larger nebula behind it.
          if (!pick && this._galaxyView && this._galaxyView.nebulaPickables) {
            pick = this._screenPick(this._galaxyView.nebulaPickables);
          }
          c.ndcX = this._ndc.x;
          c.ndcY = this._ndc.y;
          c.camPos.copy(this._camera.position);
          c.camQuat.copy(this._camera.quaternion);
          c.galaxyPoints = this._galaxyPoints;
          c.lazyPts = lazyPts;
          c.pick = pick;
        }
      }
      this._setHover(pick || null);
    }

    // Raycast the cosmic-web node cloud. Same cursor-angle scoring and
    // camera/pointer memoisation as the galaxy-scale star pick.
    _webNodePick() {
      const cv = this._cosmicView;
      if (!cv || !cv.nodePoints || !cv.nodeAt) return null;
      const c = this._webPickCache || (this._webPickCache = {
        ndcX: NaN, ndcY: NaN,
        camPos: new THREE.Vector3(NaN, NaN, NaN),
        camQuat: new THREE.Quaternion(NaN, NaN, NaN, NaN),
        points: null, pick: null,
      });
      if (c.ndcX === this._ndc.x && c.ndcY === this._ndc.y &&
          c.points === cv.nodePoints &&
          c.camPos.equals(this._camera.position) &&
          c.camQuat.equals(this._camera.quaternion)) {
        return c.pick;
      }
      this._raycaster.setFromCamera(this._ndc, this._camera);
      this._raycaster.params.Points.threshold = Math.max(10, this._rig.distance * 0.04);
      const hits = this._raycaster.intersectObject(cv.nodePoints, false);
      let best = null, bestScore = Infinity;
      for (const h of hits) {
        const along = h.distance || 1e-6;
        const score = (h.distanceToRay != null ? h.distanceToRay : 0) / along + along * 1e-7;
        if (score < bestScore) { bestScore = score; best = h; }
      }
      let pick = null;
      if (best) {
        const node = cv.nodeAt(best.index);
        if (node) {
          pick = {
            kind: "cluster", data: node.data,
            position: node.position, nodeIndex: node.index,
          };
        }
      }
      c.ndcX = this._ndc.x;
      c.ndcY = this._ndc.y;
      c.camPos.copy(this._camera.position);
      c.camQuat.copy(this._camera.quaternion);
      c.points = cv.nodePoints;
      c.pick = pick;
      return pick;
    }

    // Pick the system-scale body whose projected centre is nearest the cursor,
    // within a per-body screen radius (so tiny far planets and moons stay
    // easy to click). Returns the pickable record or null.
    _screenPick(list) {
      const dom = this._renderer.domElement;
      const rect = dom.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const px = this._pointer.cx - rect.left;
      const py = this._pointer.cy - rect.top;
      const halfH = rect.height / 2;
      const fovK = halfH / Math.tan((this._camera.fov * Math.PI) / 360);
      const camPos = this._camera.position;
      const v = this._pickScratch;
      const cs = this._pickScratch2;
      let best = null, bestScore = Infinity;
      for (const t of (list || this._pickTargets)) {
        if (!t.object) continue;
        t.object.getWorldPosition(v);
        const dist = camPos.distanceTo(v);
        if (dist <= 0) continue;
        // Reject anything at or behind the camera (camera looks down -z).
        cs.copy(v).applyMatrix4(this._camera.matrixWorldInverse);
        if (cs.z >= -this._camera.near) continue;
        v.project(this._camera);
        if (v.z > 1) continue; // past the far plane
        const sx = (v.x * 0.5 + 0.5) * rect.width;
        const sy = (-v.y * 0.5 + 0.5) * rect.height;
        const screenR = (t.radius || 0.1) * (fovK / dist);
        const reach = Math.max(22, screenR + 14);
        const d = Math.hypot(sx - px, sy - py);
        if (d > reach) continue;
        // Prefer the on-screen-closest body; break ties toward the nearer one.
        const score = d - screenR * 0.5;
        if (score < bestScore) { bestScore = score; best = t; }
      }
      return best;
    }

    // ----------------------------------------------------------------------
    // Persistent target: what the player last picked, remembered ACROSS scale
    // changes so Space can always fly back to it. Cleared only by clicking
    // empty space (or Esc). Object references are kept rather than names so a
    // lazily generated star still resolves after its point cloud is rebuilt.
    // ----------------------------------------------------------------------
    _setTarget(pick) {
      if (!pick) { this._target = null; return; }
      this._target = {
        scale: this._scale,
        kind: pick.kind,
        name: (pick.data && pick.data.name) || "",
        data: pick.data,
        system: pick.system || null,
        nodeIndex: pick.nodeIndex != null ? pick.nodeIndex : null,
        clusterIndex: this._webCluster ? this._webCluster.index : null,
      };
    }

    /** Re-acquire the target inside the currently built content, or null. */
    _resolveTarget() {
      const t = this._target;
      if (!t) return null;
      if (t.nodeIndex != null) {
        const cv = this._cosmicView;
        if (this._webCluster || !cv || !cv.nodeAt) return null;
        const node = cv.nodeAt(t.nodeIndex);
        return node
          ? { kind: "cluster", data: node.data, position: node.position, nodeIndex: node.index }
          : null;
      }
      if (this._scale === SCALE_GALAXY) {
        if (t.kind === "nebula" && t.data && this._galaxyView && this._galaxyView.nebulaWorldOf) {
          const p = this._galaxyView.nebulaWorldOf(t.name);
          return p ? { kind: "nebula", data: t.data, position: p } : null;
        }
        if (t.kind !== "star" || !t.data) return null;
        const sys = this.dataManager.getSystem(t.name) || t.data;
        return { kind: "star", data: sys, system: sys };
      }
      const list = this._pickTargets || [];
      for (const p of list) {
        if (p.data && p.data.name === t.name) return p;
      }
      return null;
    }

    /** After a scale swap, re-open the target's panel if it lives here. */
    _restoreTarget() {
      const t = this._target;
      if (!t || t.scale !== this._scale) return;
      const inCluster = this._webCluster ? this._webCluster.index : null;
      if (t.clusterIndex !== inCluster) return;
      const pick = this._resolveTarget();
      if (pick) this._showInfoFor(pick, true);
    }

    _targetWorldPosition(pick, out) {
      if (this._scale === SCALE_GALAXY && pick.system && this._galaxyView) {
        return this._galaxyView.worldOf(pick.system, out);
      }
      if (pick.position) return out.copy(pick.position);
      if (pick.object) { pick.object.getWorldPosition(out); return out; }
      return null;
    }

    // How close the camera should sit to read the target as "framed", before
    // the per-scale band clamp below keeps it from tripping the ladder.
    _targetFramingDistance(pick) {
      if (this._scale === SCALE_GALAXY) {
        // A named nebula sprite can be much larger on-screen than a star
        // point, so scale the framing distance with its size instead of
        // parking the camera inside it.
        if (pick.kind === "nebula" && pick.data && pick.data.size) {
          return Math.max(12, pick.data.size * 1.4);
        }
        return 12;
      }
      if (pick.nodeIndex != null) return 60;
      return Math.max(this._rig.minDistance * 1.3, (pick.radius || 1) * 3.2);
    }

    // Clamp a wanted camera distance inside the current scale's band, so
    // arriving at a framing never immediately trips the scale ladder in either
    // direction.
    _clampFramingDistance(want) {
      const lo = Math.max(this._rig.minDistance * 1.05, (this._inDist || 0) * 1.25);
      const hi = Math.min(this._rig.maxDistance,
        this._outDist ? this._outDist * 0.7 : Infinity);
      return Math.min(Math.max(want, lo), Math.max(lo, hi));
    }

    // Temporarily stiffen the camera easing so a Space jump reads as a fast
    // slide along the zoom slider instead of the usual long glide.
    _boostCamera() {
      this._rig.zoomEase = 16;
      this._rig.ease = 22;
      this._camBoost = 1.1;
    }

    /**
     * Space: fly to the current target. Crosses scales in whichever direction
     * the target lives (in for a planet, out for a galaxy), dives into a
     * cosmic-web node's cluster, and finally frames the object itself.
     */
    _zoomToTarget() {
      const t = this._target;
      const buzz = () => { if (window.SoundManager) SoundManager.playBuzzer(); };
      if (!t) return buzz();
      this._followShipCam = false; // an explicit target wins over ship-follow
      this._restoreSystemMinDistance();

      // 1. Get to the scale (and, inside the web, the cluster) that owns it.
      const wantCluster = t.clusterIndex;
      if (this._webCluster && this._webCluster.index !== wantCluster) this._exitWebCluster();
      if (wantCluster != null) {
        if (!this._webCluster) {
          if (this._scale !== SCALE_FILAMENTS) this._enterScale(SCALE_FILAMENTS);
          this._enterWebCluster(wantCluster);
        }
      } else if (t.scale !== this._scale) {
        this._enterScale(t.scale, t.scale === SCALE_SYSTEM ? (t.system || this._focusSystem) : null);
      } else if (t.scale === SCALE_SYSTEM && t.system && this._system &&
                 t.system.name !== this._system.name) {
        // Same scale, different system (a catalogued world elsewhere): rebuild
        // the view around the system that actually owns the target.
        this._enterScale(SCALE_SYSTEM, t.system);
      }

      // 2. A web node is a doorway rather than a destination: dive into it.
      if (t.nodeIndex != null && this._scale === SCALE_FILAMENTS && !this._webCluster) {
        this._enterWebCluster(t.nodeIndex);
        return;
      }

      const pick = this._resolveTarget();
      if (!pick) return buzz();

      // 3. A named galaxy is a doorway too: zooming to it generates its
      //    interior. The Milky Way has a real one, so it hands off to the
      //    galaxy scale instead of a procedural stand-in.
      if (pick.kind === "galaxy" && !this._galaxyFocus) {
        if (t.name === "Milky Way") this._enterScale(SCALE_GALAXY, this._focusSystem);   // i18n-ignore: galaxy id
        else this._enterGalaxyFocus(t.name, null, pick.data && pick.data.tier);
        return;
      }

      // 3b. A star at the scale that already owns it (the Milky Way galaxy
      //     view, or a procedural galaxy's own cosmic view before diving into
      //     one of its systems) is a doorway too: Zoom is meant to reach the
      //     system, not just re-frame the star's point among the others,
      //     which used to leave a second Zoom/click to actually enter it.
      if (pick.kind === "star" && (this._scale === SCALE_GALAXY || this._galaxyFocus)) {
        const sys = pick.system || pick.data;
        if (sys) { this._enterScale(SCALE_SYSTEM, sys); return; }
      }

      this._showInfoFor(pick, true);

      // 4. Frame it. A planet gets the dedicated focus path (moons and all);
      //    a moon reuses its parent's band but keeps the camera on the moon
      //    itself (see _focusMoon) - it must never clear the planet focus
      //    below, or zooming back out would snap onto the parent planet.
      if (this._scale === SCALE_SYSTEM && pick.kind === "planet") {
        this._focusPlanet(pick);
        this._boostCamera();
        return;
      }
      if (this._scale === SCALE_SYSTEM && pick.kind === "moon") {
        if (this._focusMoon(pick, true)) { this._boostCamera(); return; }
      }
      if (this._scale === SCALE_SYSTEM && this._planetFocus) this._clearPlanetFocus(false);

      const p = this._targetWorldPosition(pick, new THREE.Vector3());
      if (!p) return buzz();
      this._rig.setTargetFocus(p);
      // Already framed on it (a repeat click / a second Space): creep closer
      // instead of doing nothing, down to the floor of the current scale band.
      const want = this._clampFramingDistance(this._targetFramingDistance(pick));
      this._rig.setTargetDistance(this._rig.targetDistance <= want * 1.05
        ? this._clampFramingDistance(this._rig.targetDistance * 0.6)
        : want);
      this._ladderHold = 0;
      this._ladderCooldown = Math.max(this._ladderCooldown, 0.6);
      this._boostCamera();
      if (window.SoundManager) SoundManager.playCursor();
    }

    _setHover(pick) {
      const ov = this._overlayUI;
      // Mark bodies that carry hand-authored landing sites with a star.
      const nameOf = (p) => p.data.name +
        ((p.data.landingLocations && p.data.landingLocations.length) ? " ★" : "");
      if (pick === this._hovered) {
        if (pick && ov) ov.showTooltip(nameOf(pick), pick.data.type, this._pointer.cx, this._pointer.cy);
        return;
      }
      this._hovered = pick;
      if (this._renderer) this._renderer.domElement.style.cursor = pick ? "pointer" : "default";
      if (!ov) return;
      if (pick) ov.showTooltip(nameOf(pick), pick.data.type, this._pointer.cx, this._pointer.cy);
      else ov.hideTooltip();
    }

    /** Is this pick the one already selected here (same scale, same cluster)? */
    _isTargeted(pick) {
      const t = this._target;
      if (!t || !pick) return false;
      if (t.scale !== this._scale) return false;
      if (t.clusterIndex !== (this._webCluster ? this._webCluster.index : null)) return false;
      const node = pick.nodeIndex != null ? pick.nodeIndex : null;
      if (node != null || t.nodeIndex != null) return t.nodeIndex === node;
      const name = (pick.data && pick.data.name) || "";
      return t.kind === pick.kind && !!name && t.name === name;
    }

    _handleClick() {
      if (this._tour) return; // Grand Tour is hands-off; only cancel breaks it
      if (this._mode === "fly") return; // clicks (re)acquire pointer lock instead
      const ov = this._overlayUI;
      if (this._hovered) {
        // Clicking whatever is already selected zooms to it, the same thing
        // Space does: a body gets framed (and framed tighter on every further
        // click), while a cosmic-web node or a named galaxy is a doorway and
        // opens into its interior instead.
        if (this._isTargeted(this._hovered)) {
          this._zoomToTarget();
          return;
        }
        this._showInfoFor(this._hovered);
        if (this._scale === SCALE_SYSTEM) {
          // A first click on a planet only selects and gently re-centres the
          // camera toward it (_focusSelection): the tight, moon-revealing
          // lock-in (_focusPlanet) now fires either from a second click on
          // the already-targeted planet (handled above by _isTargeted, the
          // same "click again to fly in" gesture a star/galaxy/web-node
          // already uses - effectively a double-click once the player is
          // quick about it) or, gradually, from the zoom ladder once the
          // camera actually gets in close (_checkScaleTransition /
          // _selectionEntry). A single click used to jump straight into
          // that close framing instead of easing toward it.
          if (this._hovered.kind === "planet") {
            // Re-selecting the planet always gives it the camera back, even if
            // one of its moons was the one being followed.
            if (this._planetFocus) this._planetFocus.followObject = null;
            this._focusSelection(this._hovered);
          } else if (this._hovered.kind === "star") this._clearPlanetFocus();
          else if (this._hovered.kind === "moon") this._focusMoon(this._hovered, false);
        } else {
          // Galaxy / cosmic scales: selecting also makes the object the camera
          // pivot, so the player orbits and zooms around their target instead
          // of around whatever the camera happened to be looking at.
          this._focusSelection(this._hovered);
        }
        return;
      }
      // Clicked empty space: this is the one gesture that drops the persistent
      // target (it survives everything else, including scale changes).
      this._setTarget(null);
      this._selectedPick = null;
      if (this._planetFocus) { this._clearPlanetFocus(); if (ov) ov.deselect(); }
      else if (ov && ov.hasSelection()) ov.deselect();
    }

    // ----------------------------------------------------------------------
    // Controller selection: a pad has no cursor, so LB/RB (and Tab / Shift+Tab
    // on a keyboard) step through everything the mouse could click in the
    // current view, in a stable order.
    // ----------------------------------------------------------------------
    _cycleCandidates() {
      const out = [];
      for (const p of (this._pickTargets || [])) {
        if (p && p.object) out.push(p);
      }
      const cam = this._camera.position;
      const v = this._pickScratch;
      if (this._scale === SCALE_GALAXY && this._galaxyView) {
        // Galaxy-scale stars are a point cloud, not meshes: their selectables
        // are the systems themselves. Thousands of them would make a useless
        // ring to step around, so offer the ones nearest the camera.
        const near = [];
        for (const sys of (this._galaxyByIndex || [])) {
          if (!sys || !sys.position) continue;
          this._galaxyView.worldOf(sys, v);
          near.push({ d: v.distanceTo(cam), sys });
        }
        near.sort((a, b) => a.d - b.d);
        for (const n of near.slice(0, CYCLE_LIMIT)) {
          out.push({ kind: "star", data: n.sys, system: n.sys });
        }
        for (const p of (this._galaxyView.nebulaPickables || [])) out.push(p);
      }
      const cv = this._cosmicView;
      if (cv && cv.nodeAt && cv.nodeCount && !this._webCluster) {
        // Same for the cosmic web's node cloud - every dot is a doorway. The
        // sweep runs over POSITIONS only (cv.nodePos): the web holds thousands
        // of nodes now, and building each one's record just to sort it and
        // throw all but the nearest few dozen away was the cycle key's whole
        // cost.
        const near = [];
        for (let i = 0; i < cv.nodeCount; i++) {
          const at = cv.nodePos ? cv.nodePos(i) : null;
          if (at) near.push({ d: at.distanceTo(cam), i });
          else {
            const node = cv.nodeAt(i);
            if (node) near.push({ d: node.position.distanceTo(cam), i });
          }
        }
        near.sort((a, b) => a.d - b.d);
        for (const n of near.slice(0, CYCLE_LIMIT)) {
          const node = cv.nodeAt(n.i);
          if (!node) continue;
          out.push({
            kind: "cluster", data: node.data,
            position: node.position, nodeIndex: node.index,
          });
        }
      }
      return out;
    }

    _cycleSelection(dir) {
      if (this._mode === "fly") return;
      const list = this._cycleCandidates();
      if (!list.length) {
        if (window.SoundManager) SoundManager.playBuzzer();
        return;
      }
      const at = this._target ? list.findIndex((p) => this._isTargeted(p)) : -1;
      const i = (((at + dir) % list.length) + list.length) % list.length;
      const pick = list[i];
      this._showInfoFor(pick);
      // Stepping past a body must not drag the camera inside it, so only the
      // far scales re-pivot (exactly as clicking one does); at system scale the
      // selection is framed on demand instead, with Zoom To / A.
      if (this._scale !== SCALE_SYSTEM) this._focusSelection(pick);
      if (window.SoundManager) SoundManager.playCursor();
    }

    // Re-pivot the orbit camera onto a selected far-scale object, easing in
    // only if it is currently way off-centre (so a click never yanks the view).
    _focusSelection(pick) {
      const p = new THREE.Vector3();
      if (this._scale === SCALE_GALAXY) {
        if (!this._galaxyView) return;
        if (pick.system) this._galaxyView.worldOf(pick.system, p);
        else if (pick.object) pick.object.getWorldPosition(p);
        else return;
      } else if (pick.object) {
        pick.object.getWorldPosition(p);
      } else if (pick.position) {
        p.copy(pick.position);
      } else {
        return;
      }
      this._followShipCam = false;
      this._restoreSystemMinDistance();
      this._rig.setTargetFocus(p);
      // Pull in a little if the target is barely visible, but never past the
      // band that would trip the scale ladder.
      const want = Math.min(this._rig.targetDistance, this._outDist ? this._outDist * 0.8 : Infinity);
      this._rig.setTargetDistance(Math.max(this._rig.minDistance, want));
    }

    // ----------------------------------------------------------------------
    // Planet focus: zoom the camera onto a clicked planet so it fills most of
    // the screen, following it along its orbit, and reveal its full moon set.
    // ----------------------------------------------------------------------
    _focusPlanet(pick) {
      if (this._scale !== SCALE_SYSTEM || !this._systemView || !this._systemView.focusPlanet) return;
      const info = this._systemView.focusPlanet(pick.data);
      if (!info) return;
      this._followShipCam = false;
      // Re-focusing the planet already framed (clicking it again) closes in on
      // it instead of parking the camera back at the same framing distance.
      const again = !!this._planetFocus && this._planetFocus.object === info.object;
      this._planetFocus = {
        object: info.object,
        planetName: pick.data && pick.data.name,
        radius: info.radius,
        framingDist: Math.max(info.radius * 2.4, info.radius * 1.3 + 0.05),
        // Physical planet radii are small, so the exit band is generous (and
        // floored) - otherwise a nudge of the wheel drops you straight out.
        outDist: Math.max(info.moonOuter * 2.2, info.radius * 16, 1.2),
        // Set by _focusMoon while one of this planet's moons is selected, so
        // the camera keeps following the moon instead of snapping back to
        // the planet (see _updatePlanetFocus).
        followObject: null,
      };
      this._rebuildPickList(); // pick the newly-revealed moonlets too
      this._rig.minDistance = Math.max(0.05, info.radius * 1.15);
      this._rig.maxDistance = this._planetFocus.outDist * 1.4; // reachable exit band
      this._rig.setTargetDistance(again
        ? Math.max(this._rig.minDistance, this._rig.targetDistance * 0.6)
        : this._planetFocus.framingDist);
      this._updateModeHint();
      if (window.SoundManager) SoundManager.playOk();
    }

    _clearPlanetFocus(restoreFraming) {
      if (!this._planetFocus) return;
      this._planetFocus = null;
      if (this._systemView && this._systemView.clearPlanetFocus) this._systemView.clearPlanetFocus();
      this._rebuildPickList();
      const outer = this._systemOuter ||
        (this._systemView && this._systemView.outerRadius) || 12;
      this._rig.minDistance = 0.3;
      this._rig.maxDistance = outer * 5;
      if (restoreFraming !== false) {
        this._rig.setTargetFocus(new THREE.Vector3(0, 0, 0));
        this._rig.setTargetDistance(Math.max(8, outer * 1.9 + 3));
      }
      this._updateModeHint();
    }

    // Each frame keep the camera centred on the orbiting focused planet, or
    // on one of its moons while that moon is the one selected (followObject).
    _updatePlanetFocus() {
      if (!this._planetFocus || this._scale !== SCALE_SYSTEM) return;
      const obj = this._planetFocus.followObject || this._planetFocus.object;
      if (obj) {
        obj.getWorldPosition(this._pickScratch);
        this._rig.setTargetFocus(this._pickScratch);
      }
    }

    // Selecting a moon must never fall back to the parent planet's framing:
    // it reuses the planet's already-revealed moon band (entering it first if
    // the planet isn't already focused) but points the continuous per-frame
    // follow (_updatePlanetFocus) at the moon itself, so zooming in and out
    // stays on the satellite instead of snapping back to the planet.
    // `tight` mirrors the "click the already-targeted body again" zoom-in
    // _focusPlanet gives a planet (see _zoomToTarget); a bare first click
    // just re-centres gently, like a planet's first click does.
    _focusMoon(pick, tight) {
      if (this._scale !== SCALE_SYSTEM || !pick.planet || !pick.object) return false;
      const parentName = pick.planet.name;
      if (!this._planetFocus || this._planetFocus.planetName !== parentName) {
        this._focusPlanet({ kind: "planet", data: pick.planet });
        if (!this._planetFocus) return false;
        tight = false; // _focusPlanet already framed the whole planet band
      }
      this._followShipCam = false;
      this._planetFocus.followObject = pick.object;
      pick.object.getWorldPosition(this._pickScratch);
      this._rig.setTargetFocus(this._pickScratch);
      if (tight) {
        this._rig.setTargetDistance(Math.max(this._rig.minDistance, this._rig.targetDistance * 0.6));
      }
      return true;
    }

    // Minimal viewer mode: every ship action (travel, land, bridges, park,
    // refuel, harvest, strip mine, service, investigate) is stripped from the
    // panel options built by _showInfoFor, leaving only the descriptive
    // fields (breathable, hasLife, bioTier, mining capacity, bookmark...) so
    // the body is still fully described, just not actionable.
    _disableGalaxyActions(opts) {
      opts.canEnter = false;
      opts.canTravel = false;
      opts.canPark = false;
      opts.canBohrBridge = false;
      opts.canRefuel = false;
      opts.canHarvest = false;
      opts.canTravelTo = false;
      opts.canLand = false;
      opts.canStripMine = false;
      opts.canService = false;
      opts.canInvestigate = false;
      opts.canUseLocations = false;
      return opts;
    }

    // `keepTarget` is set when the caller is re-showing the panel for the
    // already-remembered target (scale restore / Space jump), so the stored
    // scale and cluster of the target are not rewritten by the act of
    // re-displaying it.
    _showInfoFor(pick, keepTarget) {
      const ov = this._overlayUI;
      if (!ov) return;
      this._selectedPick = pick;
      if (!keepTarget) this._setTarget(pick);
      // Far-scale objects (galaxies, clusters, anomalies) have no ship actions;
      // they get the plain description panel.
      if (pick.kind === "galaxy" || pick.kind === "cluster" || pick.kind === "anomaly" ||
          pick.kind === "nebula") {
        // Procedural cluster-member galaxies aren't stably resolvable once
        // their view is torn down (see _resolveBookmark), so only offer the
        // bookmark toggle on the hardcoded hero objects the catalog knows.
        const far = (GS.Scene3DCosmos.catalogEntries && GS.Scene3DCosmos.catalogEntries()) || [];
        const bookmarkable = far.some((e) => e.data.name === pick.data.name);
        ov.showObject(pick.data, {
          isBookmarked: bookmarkable && this._isBookmarked(pick),
          canBookmark: bookmarkable,
        });
        return;
      }
      const ship = this.dataManager.playerShip;
      const isMoving = !!(ship && ship.isMoving);
      const hasCharge = (( GS.isInfiniteFuel && GS.isInfiniteFuel()) ||
        (this.dataManager.getSchrodingerite && this.dataManager.getSchrodingerite() >= 1));
      if (pick.kind === "star") {
        // A companion/donor star of an N-ary system carries _companionOf: the
        // system that owns it. It is a real arrival target of its own (travel,
        // SB-bridge and parking all aim at that exact star).
        const isCompanion = !!(pick.data && pick.data._companionOf);
        const ownerName = (pick.data && pick.data._companionOf) || pick.data.name;
        const isCurrent = !!(ship && ownerName === ship.currentSystem);
        // Enter/Travel used to require the home SCALE_GALAXY view; a star
        // picked from inside a procedural (non-Milky-Way) galaxy's own
        // interior is just as real a destination, so allow both there too.
        const starBrowsable = this._scale === SCALE_GALAXY || !!this._galaxyFocus;
        const isParkedHere = isCurrent && !isMoving &&
          !!(ship && ship.parkedBody && ship.parkedBody.name === pick.data.name);
        const dm = this.dataManager;
        // A lazy system carries no planets until it is materialized, so the
        // info panel used to report every one of them as planetless (only its
        // companions showed). Materializing on selection is cheap and
        // deterministic, so the count the panel prints is the real one.
        if (pick.data && pick.data.lazy && !pick.data._materialized &&
            typeof dm.materializeLazySystem === "function") {
          dm.materializeLazySystem(pick.data);
        }
        const sysOpts = {
          isCurrent,
          canEnter: starBrowsable && !isMoving && !isCompanion,
          canTravel: (starBrowsable || isCompanion) && !isCurrent && !isMoving,
          // Park in orbit of the star/black hole itself: free while already in
          // this system (mirrors "Land Here" for a planet already in orbit).
          canPark: isCurrent && !isMoving && !isParkedHere,
          isParked: isParkedHere,
          // Schrödinger-Bohr bridge to a star: instant park in its orbit from
          // anywhere, for 1 Schrödingerite charge.
          canBohrBridge: !isCurrent && !isMoving && hasCharge,
          isBookmarked: this._isBookmarked(pick),
          // Refuel: parked at a main-sequence star only (see isMainSequenceStar).
          canRefuel: isParkedHere && !!(dm.canRefuel && dm.canRefuel()),
          isRefueling: !!(ship && ship.isRefueling),
          // Harvest Schrödingerite: parked at a black hole, off cooldown.
          canHarvest: isParkedHere && !!(dm.canHarvestSchrodingerite && dm.canHarvestSchrodingerite()),
          // Seconds left of an open harvest flyby (see beginSchrodingeriteHarvest).
          harvestRunSec: (isParkedHere && dm.isHarvestingSchrodingerite &&
            dm.isHarvestingSchrodingerite() && dm.schrodingeriteHarvestRemaining)
            ? dm.schrodingeriteHarvestRemaining() : 0,
          harvestCooldownMin: (isParkedHere && ship && ship.parkedBody &&
            ship.parkedBody.kind === "blackhole" && dm.schrodingeriteCooldownRemaining)
            ? dm.schrodingeriteCooldownRemaining(ship.parkedBody.name) : 0,
        };
        if (this._minigameMode) this._disableGalaxyActions(sysOpts);
        ov.showSystem(pick.data, sysOpts);
      } else {
        const sameSystem = !!(this._system && pick.system && pick.system.name === this._system.name);
        const orbitingThis = !isMoving && sameSystem &&
          ship && ship.currentPlanet === pick.data.name;
        // A moon can't be orbited directly, so its landing sites unlock while the
        // ship orbits the moon's parent planet.
        const orbitingParent = pick.kind === "moon" && !isMoving && sameSystem &&
          ship && pick.planet && ship.currentPlanet === pick.planet.name;
        // Strip mining and servicing are both "in orbit of this exact body"
        // actions (see _startStripMining / _openServiceBay).
        const Mining = GS.Mining;
        const mineable = !!(Mining && Mining.isMineable(pick.data));
        const mineInfo = mineable ? {
          capacity: Mining.capacity(pick.system, pick.data),
          remaining: Mining.remaining(pick.system, pick.data),
        } : null;
        const isHubble = !!(pick.data && pick.data.hubble && GS.Hubble);
        // The world that was signalling: investigated from its own orbit, and
        // only ever once (a half-finished encounter is offered as Resume).
        const A = GS.Anomaly;
        const anomalyOpen = !!(A && pick.kind === "planet" && A.isPending(pick.system, pick.data));
        const bodyOpts = {
          kind: pick.kind,
          parentPlanet: pick.planet,
          // Always offered for any body of the CURRENT system (planet or
          // moon) - including a moon (which used to have no travel option at
          // all), while already en route elsewhere (redirects the course:
          // startTravelToPlanet just re-plots from wherever the ship is
          // now), and even already parked at the exact body (a same-spot
          // "trip" resolves as an instant arrival, see updateShipPosition).
          canTravelTo: (pick.kind === "planet" || pick.kind === "moon") && sameSystem,
          // Artificial objects (probes, the teapot, the monolith) have no
          // surface to put a landing party on. A moon has no orbit of its
          // own (see orbitingParent above), so its landing unlocks while the
          // ship orbits the moon's parent planet instead.
          canLand: !!(pick.kind === "moon" ? orbitingParent : orbitingThis) && !pick.data.noLanding,
          canStripMine: !!orbitingThis && mineable && mineInfo.remaining > 0 && !this._mining,
          mining: mineInfo,
          canService: !!orbitingThis && isHubble,
          hubbleCondition: isHubble ? GS.Hubble.condition() : null,
          canInvestigate: !!orbitingThis && anomalyOpen,
          investigateResume: anomalyOpen && !!(A && A.hasSessionOn(pick.system, pick.data)),
          // Hand-authored landing-site list is offered when in orbit (of the body,
          // or its parent for a moon).
          canUseLocations: !!(orbitingThis || orbitingParent),
          // Schrödinger-Bohr bridge: instant orbit of any planet (or a moon's
          // parent planet) for 1 charge, shown while not already orbiting it
          // and charges remain.
          canBohrBridge: (pick.kind === "planet" || pick.kind === "moon") &&
            !isMoving && !orbitingThis && !orbitingParent && hasCharge,
          // Planet-definition atmosphere/life. Only planets carry a type in
          // PlanetTypes; moons pass null so those rows are simply omitted.
          breathable: (pick.kind === "planet" && GS.planetBreathable)
            ? GS.planetBreathable(pick.data) : null,
          hasLife: (pick.kind === "planet" && GS.planetHasLife)
            ? GS.planetHasLife(pick.data) : false,
          weakLife: (pick.kind === "planet" && GS.planetLifeSigns)
            ? GS.planetLifeSigns(pick.data) === (GS.LifeSigns || {}).WEAK : false,
          // How the world's own level stands against the party's: the strength
          // the biosignature is read out at (Weak / Strong / Hyper). Null on
          // anything without a biosphere, which has no creatures to weigh.
          bioTier: (pick.kind === "planet" && GS.planetBioTier)
            ? GS.planetBioTier(pick.data) : null,
          isBookmarked: this._isBookmarked(pick),
        };
        if (this._minigameMode) this._disableGalaxyActions(bodyOpts);
        ov.showBody(pick.data, pick.system, bodyOpts);
      }
    }

    _refreshSelection() {
      if (this._selectedPick && this._overlayUI && this._overlayUI.hasSelection()) {
        this._showInfoFor(this._selectedPick, true);
      }
    }

    _wireOverlayCallbacks() {
      this._overlayUI.setCallbacks({
        onEnterSystem: (name) => this._enterSystemByName(name),
        onTravelSystem: (name) => this._travelToSystem(name),
        onTravelPlanet: (sel) => this._travelToPlanet(sel),
        onLand: (sel) => this._landOnCurrentPlanet(sel),
        onBridge: () => this._takeTheHelm(),
        onTeleportLocation: (loc) => this._teleportToLocation(loc),
        onBohrBridge: (sel) => this._bohrBridge(sel),
        onParkOrbit: (sel) => this._parkAtStar(sel),
        onRefuelStart: () => this._startRefuel(),
        onRefuelStop: () => this._stopRefuel(),
        onRefuelAuto: () => this._autoRefuel(),
        onHarvestSchrodingerite: () => this._harvestSchrodingerite(),
        onSpeedUp: () => this._changeSpeed(1),
        onSpeedDown: () => this._changeSpeed(-1),
        onSpeedSet: (v) => this._setSpeed(v),
        onStop: () => this._stopEngines(),
        onZoomTarget: () => this._zoomToTarget(),
        onGoHome: () => this._goToCurrentSystem(),
        onGoToShip: () => this._goToShip(),
        onBioScan: () => this._scanBiosignatures(),
        onGrandTour: () => this._toggleGrandTour(),
        onSbBridge: () => this._sbBridge(),
        onReturnEarthToggle: () => this._toggleReturnEarth(),
        onReturnEarthCourse: () => this._setCourseEarth(),
        onReturnEarthEb: () => this._ebBridge(),
        onCloseMap: () => this.popScene(),
        onCatalogToggle: () => this._toggleCatalog(),
        // Turning the In View filter back on re-reads the sky rather than
        // showing whatever was in frame when the panel was opened.
        onCatalogFilter: (on) => { if (on) this._refreshCatalogView(true); },
        onCatalogZoom: (id) => this._catalogAction(id, "zoom"),
        onCatalogCourse: (id) => this._catalogAction(id, "course"),
        onBookmarkToggle: (sel) => this._toggleBookmark(sel),
        onStripMine: (sel) => this._startStripMining(sel),
        onStripMineStop: () => this._stopStripMining(T('Galaxy.mining.lasersCut')),
        onService: (sel) => this._openServiceBay(sel),
        onServicePart: (name) => this._servicePart(name),
        onServiceAll: () => this._serviceAll(),
        onInvestigate: (sel) => this._openAnomaly(sel),
        onAnomalyChoice: (i) => this._anomalyChoose(i),
        onAnomalyClose: () => this._closeAnomaly(),
      });
    }

    // ----------------------------------------------------------------------
    // Servicing bay: the Hubble, opened while the ship is in its orbit. The
    // panel is rebuilt after every repair so costs and affordability track the
    // party's actual inventory (see GalaxySim.Hubble).
    // ----------------------------------------------------------------------
    _openServiceBay(sel) {
      const ov = this._overlayUI;
      const H = GS.Hubble;
      if (!ov || !H) return;
      const pick = sel || this._selectedPick;
      const name = (pick && pick.data && pick.data.name) || T('Galaxy.service.hubbleName');
      ov.showService({
        title: T('Galaxy.service.bayTitle', { name: name }),
        subtitle: this._serviceSubtitle(),
        parts: H.parts(),
        footer: T('Galaxy.service.footer'),
      });
      if (window.SoundManager) SoundManager.playOk();
    }

    _serviceSubtitle() {
      const H = GS.Hubble;
      if (!H) return "";
      const broken = H.brokenCount();
      const state = H.isOperational()
        ? `<span style="color:#60b345">${T('Galaxy.service.operational')}</span>`
        : T.n('Galaxy.service.belowLimit', broken);
      return T('Galaxy.service.condition', { pct: H.condition(), state: state });
    }

    _refreshServiceBay() {
      const ov = this._overlayUI;
      const H = GS.Hubble;
      if (!ov || !H || !ov.isServiceOpen()) return;
      ov.renderService(H.parts(), this._serviceSubtitle());
      this._refreshSelection();
    }

    _servicePart(name) {
      const H = GS.Hubble;
      if (!H) return;
      if (H.repair(name)) {
        if (window.SoundManager) SoundManager.playUseItem();
        // Hands on a real telescope, in a vacuum, in gloves.
        this._awardSpec("Telescope Making", 2);   // i18n-ignore: specialization id
        this._toast(T('Galaxy.service.partRestored', { name: name }));
      } else {
        if (window.SoundManager) SoundManager.playBuzzer();
        this._toast(T('Galaxy.service.notEnoughMaterials'));
      }
      this._refreshServiceBay();
    }

    _serviceAll() {
      const H = GS.Hubble;
      if (!H) return;
      const done = H.repairAll();
      if (done.length) {
        if (window.SoundManager) SoundManager.playUseItem();
        this._awardSpec("Telescope Making", done.length);   // i18n-ignore: specialization id
        this._toast(T.n('Galaxy.service.serviced', done.length));
      } else {
        if (window.SoundManager) SoundManager.playBuzzer();
        this._toast(T('Galaxy.service.nothingSpared'));
      }
      this._refreshServiceBay();
    }

    // ----------------------------------------------------------------------
    // Anomalies: the world in this system that was signalling. Opened from its
    // orbit, once per world; the encounter itself (branches, prose, payout) is
    // GalaxySim.Anomaly's, and this only drives the panel and hands over to a
    // battle when that is where the branch led.
    // ----------------------------------------------------------------------
    _openAnomaly(sel) {
      const ov = this._overlayUI;
      const A = GS.Anomaly;
      const pick = sel || this._selectedPick;
      if (!ov || !A || !pick || !pick.data) return;
      const session = A.begin(pick.system, pick.data);
      if (!session) {
        if (window.SoundManager) SoundManager.playBuzzer();
        this._toast(T('Anomaly.ui.signalLost'));
        return;
      }
      if (window.SoundManager) SoundManager.playOk();
      this._awardSpec("Radio Astronomy", 2);   // i18n-ignore: specialization id
      ov.showAnomaly(A.view(), {
        where: T('Anomaly.ui.where', {
          planet: pick.data.name,
          system: (pick.system && (pick.system.label || pick.system.name)) || "",
        }),
      });
    }

    _anomalyChoose(index) {
      const ov = this._overlayUI;
      const A = GS.Anomaly;
      if (!ov || !A) return;
      const current = A.view();
      const row = current && current.choices && current.choices[index];
      // A greyed hand-over: the party cannot cover what is being asked.
      if (row && row.locked) {
        if (window.SoundManager) SoundManager.playBuzzer();
        return;
      }
      // choose() is async: a choice that carries a check throws the 3D die
      // before the branch resolves.
      Promise.resolve(A.choose(index)).then((view) => {
        if (!view) return;
        if (window.SoundManager) SoundManager.playOk();
        ov.renderAnomaly(view);
      });
    }

    // Closing the log ends the encounter. A branch that ended in a fight leaves
    // the star map first: a battle cannot start on top of this scene.
    _closeAnomaly() {
      const ov = this._overlayUI;
      const A = GS.Anomaly;
      if (ov) ov.hideAnomaly();
      if (!A) return;
      if (A.hasPendingBattle()) {
        // Leaving the star map is enough: the map scene starts the queued fight
        // as soon as it is back on its feet (see GalaxySim_Core).
        if (window.SoundManager) SoundManager.playOk();
        SceneManager.pop();
        return;
      }
      A.end();
      if (window.SoundManager) SoundManager.playCancel();
      this._refreshSelection();
    }

    // ----------------------------------------------------------------------
    // Strip mining: hold station over an asteroid and take it apart with the
    // ship's lasers. A tick a second burns Hyperflux and returns ore until the
    // body is stripped; leaving orbit, running dry or cutting the lasers stops
    // it (see GalaxySim.Mining).
    // ----------------------------------------------------------------------
    _startStripMining(sel) {
      const ov = this._overlayUI;
      const Mining = GS.Mining;
      const pick = sel || this._selectedPick;
      if (!ov || !Mining || !pick || !pick.data) return;
      const body = pick.data;
      const system = pick.system || this._system;
      if (!Mining.isMineable(body) || Mining.isDepleted(system, body)) {
        this._toast(T('Galaxy.mining.nothingLeft'));
        return;
      }
      this._mining = {
        body, system, elapsed: 0, acc: 0, gained: 0,
        name: body.name,
      };
      this._buildMiningBeam(body);
      ov.showMining(this._miningState());
      ov.pushMiningLog(T('Galaxy.mining.lasersHot'));
      if (window.SoundManager) SoundManager.playOk();
      this._refreshSelection();
    }

    _miningState() {
      const m = this._mining;
      const Mining = GS.Mining;
      if (!m || !Mining) return null;
      return {
        name: m.name,
        mined: Mining.mined(m.system, m.body),
        capacity: Mining.capacity(m.system, m.body),
        elapsed: m.elapsed,
        eta: Mining.etaSeconds(m.system, m.body),
        fuel: this.dataManager.getHyperflux(),
        fuelPerSec: Mining.FUEL_PER_SEC,
      };
    }

    _stopStripMining(reason) {
      if (!this._mining) return;
      const gained = this._mining.gained;
      this._clearMiningBeam();
      this._mining = null;
      if (this._overlayUI) this._overlayUI.hideMining();
      if (reason) this._toast(`${reason}${gained ? ` ${gained} units aboard.` : ""}`);
      this._refreshSelection();
    }

    _updateStripMining(delta) {
      const m = this._mining;
      const Mining = GS.Mining;
      if (!m || !Mining) return;
      const ship = this.dataManager.playerShip;
      // Station-keeping is the whole requirement: drift off and the cut stops.
      const stillThere = ship && !ship.isMoving && ship.currentPlanet === m.body.name &&
        this._system && m.system && this._system.name === m.system.name;
      if (!stillThere) { this._stopStripMining(T('Galaxy.mining.leftBody')); return; }

      m.elapsed += delta;
      m.acc += delta;
      this._updateMiningBeam(this._elapsed);
      while (m.acc >= 1) {
        m.acc -= 1;
        const res = Mining.tick(m.system, m.body, this.dataManager);
        if (!res.ok) {
          if (res.reason === "fuel") this._stopStripMining(T('Galaxy.mining.fuelOut'));
          else this._stopStripMining(T('Galaxy.mining.bodyStripped'));
          return;
        }
        m.gained += res.amount;
        const parts = Object.keys(res.gained).map((id) => {
          const nm = GS.matName(Number(id));
          const rare = Number(id) === GS.MAT.varlenia || Number(id) === GS.MAT.quantum;
          return rare
            ? `<span class="gx-rare">${nm} ×${res.gained[id]}</span>`
            : `<b>${nm}</b> ×${res.gained[id]}`;
        });
        if (this._overlayUI) this._overlayUI.pushMiningLog(parts.join(" · "));
        if (res.gained[GS.MAT.varlenia] && window.SoundManager) SoundManager.playRecovery();
        // Every rock taken apart teaches the crew something about rocks.
        if (window.SpecializationXP) {
          window.SpecializationXP.award("Mining", 1);
        }
        if (res.depleted) {
          this._stopStripMining(T('Galaxy.mining.strippedToBedrock', { name: m.name }));
          return;
        }
      }
      if (this._overlayUI) this._overlayUI.updateMining(this._miningState());
    }

    // Two crossed beams from the ship to the body plus a glow at the impact
    // point, living in the system view's local frame so both ends stay put.
    _buildMiningBeam(body) {
      this._clearMiningBeam();
      const view = this._systemView;
      if (!view || !view.group || !view.shipGroup) return;
      const holder = view.planetHolders && view.planetHolders[body.name];
      if (!holder) return;
      const group = new THREE.Group();
      const geo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
      const beams = [];
      for (let i = 0; i < 2; i++) {
        const mat = new THREE.MeshBasicMaterial({
          color: i ? 0xff9a4d : 0x9ad8ff,
          transparent: true, opacity: 0.55, depthWrite: false,
          blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geo, mat);
        group.add(mesh);
        beams.push({ mesh, mat, offset: i * 0.5 });
      }
      const glow = GS.Scene3DBodies.makeGlowSprite("rgba(255,190,120,0.95)", 0.12);
      group.add(glow.sprite);
      view.group.add(group);
      this._miningBeam = { group, geo, beams, glow, holder, view };
      this._updateMiningBeam(this._elapsed);
    }

    _updateMiningBeam(t) {
      const b = this._miningBeam;
      if (!b) return;
      const from = b.view.shipGroup.position;
      const to = b.holder.position;
      const dir = new THREE.Vector3().subVectors(to, from);
      const len = dir.length();
      if (len < 1e-6) return;
      const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
      const quat = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0), dir.clone().normalize()
      );
      b.beams.forEach((beam, i) => {
        beam.mesh.position.copy(mid);
        beam.mesh.quaternion.copy(quat);
        const flicker = 0.6 + 0.4 * Math.sin(t * (7 + i * 3) + beam.offset);
        beam.mesh.scale.set(0.006 * flicker, len, 0.006 * flicker);
        beam.mat.opacity = 0.35 + 0.35 * flicker;
      });
      b.glow.sprite.position.copy(to);
      const pulse = 0.09 + 0.05 * Math.sin(t * 9);
      b.glow.sprite.scale.set(pulse, pulse, 1);
    }

    _clearMiningBeam() {
      const b = this._miningBeam;
      if (!b) return;
      if (b.group.parent) b.group.parent.remove(b.group);
      b.geo.dispose();
      b.beams.forEach((beam) => beam.mat.dispose());
      b.glow.tex.dispose();
      b.glow.mat.dispose();
      this._miningBeam = null;
    }

    // Short status line in the mode hint strip (the overlay has no log of its
    // own, and a full RPG-Maker toast would tear the DOM overlay).
    _toast(text) {
      if (window.ParchmentToast && window.ParchmentToast.show) {
        window.ParchmentToast.show(text);
      } else if (this._overlayUI && this._overlayUI.setModeHint) {
        this._overlayUI.setModeHint(text);
      }
    }

    // ----------------------------------------------------------------------
    // Bookmarks: any celestial body the player has flagged, persisted on
    // $gameSystem (small target-shaped records, not live object refs, so they
    // survive save/load) and shown as a yellow marker wherever they currently
    // exist on screen (see _refreshBookmarkMarkers), plus a Catalog tab.
    // ----------------------------------------------------------------------
    _bookmarks() {
      if (!$gameSystem._gxBookmarks) $gameSystem._gxBookmarks = [];
      return $gameSystem._gxBookmarks;
    }

    _isBookmarked(pick) {
      if (!pick || !pick.data) return false;
      const name = pick.data.name;
      return this._bookmarks().some((b) => b.name === name);
    }

    _toggleBookmark(sel) {
      const pick = sel || this._selectedPick;
      if (!pick || !pick.data) return;
      const name = pick.data.name;
      const list = this._bookmarks();
      const idx = list.findIndex((b) => b.name === name);
      if (idx >= 0) {
        list.splice(idx, 1);
      } else {
        list.push({
          kind: pick.kind,
          name,
          systemName: (pick.system && pick.system.name) || null,
        });
      }
      if (window.SoundManager) SoundManager.playCursor();
      this._refreshBookmarkMarkers();
      this._refreshSelection();
    }

    /** Turn a saved bookmark record back into a live, zoomable target record. */
    _resolveBookmark(rec) {
      if (!rec) return null;
      if (rec.kind === "star") {
        // A star inside a procedurally generated (non-Milky-Way) galaxy has no
        // stable "scale" to resolve back to from the catalog - entering that
        // galaxy's focus takes a name, not a scale, and which far scale it was
        // even reached from isn't recorded. It still bookmarks fine (the toggle
        // and the in-view yellow marker both work whenever that galaxy's view
        // happens to be open), it just isn't offered here as a "jump to it from
        // anywhere" catalog entry.
        if (String(rec.name).startsWith("GX.")) return null;
        const sys = this.dataManager.getSystem(rec.name);
        return sys ? { scale: SCALE_GALAXY, kind: "star", name: rec.name, data: sys, system: sys } : null;
      }
      if (rec.kind === "planet" || rec.kind === "moon") {
        const sys = rec.systemName && this.dataManager.getSystem(rec.systemName);
        if (!sys) return null;
        for (const p of sys.planets || []) {
          if (p.name === rec.name) {
            return { scale: SCALE_SYSTEM, kind: "planet", name: rec.name, data: p, system: sys };
          }
          for (const m of p.moons || []) {
            if (m.name === rec.name) {
              return { scale: SCALE_SYSTEM, kind: "moon", name: rec.name, data: m, system: sys };
            }
          }
        }
        return null;
      }
      // Far-scale hero object (galaxy / cluster / anomaly): resolved from the
      // hardcoded catalog. Procedural cluster-member galaxies and cosmic-web
      // nodes aren't stably nameable outside their own built view, so they are
      // never offered the bookmark button in the first place (see showObject
      // wiring) and won't be found here.
      const far = (GS.Scene3DCosmos.catalogEntries && GS.Scene3DCosmos.catalogEntries()) || [];
      const hit = far.find((e) => e.data.name === rec.name);
      return hit ? { scale: hit.scale, kind: hit.kind, name: rec.name, data: hit.data, system: null } : null;
    }

    _clearBookmarkMarkers() {
      (this._bookmarkMarkerSprites || []).forEach((s) => {
        if (s.parent) s.parent.remove(s);
        if (s.material) s.material.dispose();
      });
      this._bookmarkMarkerSprites = [];
    }

    // Adds a yellow ring sprite as a child of every currently-rendered pickable
    // whose body is bookmarked, sized to a constant WORLD size regardless of
    // whatever local scale convention that particular builder used (some
    // pre-scale their group to the body radius, some bake the radius into the
    // geometry directly - see the black-hole/star split in Scene3D_Bodies).
    _addBookmarkMarker(object, worldRadius) {
      const tex = bookmarkMarkerTexture();
      const mat = new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const spr = new THREE.Sprite(mat);
      const ws = new THREE.Vector3();
      object.getWorldScale(ws);
      const denom = Math.max(1e-6, ws.x);
      spr.scale.setScalar(Math.max(1.5, (worldRadius || 1) * 2.6) / denom);
      spr.renderOrder = 5;
      object.add(spr);
      this._bookmarkMarkerSprites.push(spr);
    }

    _refreshBookmarkMarkers() {
      this._clearBookmarkMarkers();
      const bms = this._bookmarks();
      if (!bms.length) return;
      const names = new Set(bms.map((b) => b.name));
      // The home galaxy's travelable stars are a raw shared Points cloud (no
      // per-star Object3D to attach a marker to), so bookmarks there get their
      // own small sprite placed directly at the system's galactic position -
      // this is also what keeps bookmarks "always visible from the galaxy map".
      if (this._scale === SCALE_GALAXY && this._galaxyView && !this._galaxyFocus) {
        const tmp = new THREE.Vector3();
        bms.forEach((b) => {
          if (b.kind !== "star") return;
          const sys = this.dataManager.getSystem(b.name);
          if (!sys) return;
          this._galaxyView.worldOf(sys, tmp);
          const mat = new THREE.SpriteMaterial({
            map: bookmarkMarkerTexture(), transparent: true, depthWrite: false,
            blending: THREE.AdditiveBlending,
          });
          const spr = new THREE.Sprite(mat);
          spr.position.copy(tmp);
          spr.scale.set(9, 9, 1);
          spr.renderOrder = 5;
          this._galaxyView.group.add(spr);
          this._bookmarkMarkerSprites.push(spr);
        });
        return;
      }
      (this._pickTargets || []).forEach((p) => {
        if (!p.object || !p.data || !names.has(p.data.name)) return;
        this._addBookmarkMarker(p.object, p.radius);
      });
    }

    // ----------------------------------------------------------------------
    // Catalog: every hardcoded object in the sim - the authored star systems
    // plus the named far-scale bodies - grouped by type, alongside a second tab
    // holding every world whose biosignature scan came back positive. Picking
    // one makes it the persistent target, so Zoom reuses the exact same flight
    // path as Space, and Course reuses the normal travel logic.
    // ----------------------------------------------------------------------
    _buildCatalog() {
      const entries = [];
      const stars = [];
      const byKind = { galaxy: [], cluster: [], anomaly: [], nebula: [] };

      this.dataManager.getAllSystems()
        .filter((s) => s && s.hardcoded)
        .sort((a, b) => String(a.name).localeCompare(String(b.name)))
        .forEach((s) => {
          const id = "s" + entries.length;
          // SCALE_SYSTEM (not SCALE_GALAXY) so Zoom drops straight into the
          // system the way it already does for the Far Systems / Patrons /
          // Bookmarks / Biosignatures groups below, instead of only flying to
          // the star's galaxy-scale point and leaving a second Zoom to
          // actually enter it.
          entries.push({ id, scale: SCALE_SYSTEM, kind: "star", name: s.name, data: s, system: s });
          stars.push({
            id, name: s.name,
            sub: T('Galaxy.catalog.starSub', {
              type: s.type || "?", planets: s.planets ? s.planets.length : 0,
            }),
            course: true,
          });
        });

      const far = (GS.Scene3DCosmos.catalogEntries && GS.Scene3DCosmos.catalogEntries()) || [];
      far.forEach((e) => {
        const id = "o" + entries.length;
        entries.push({ id, scale: e.scale, kind: e.kind, name: e.data.name, data: e.data, system: null });
        (byKind[e.kind] || byKind.galaxy).push({
          id, name: e.data.name, sub: e.data.type || "", course: false,
        });
      });

      // Logged biosignatures: every life-bearing world a scan has turned up,
      // and under it every world that only read as trace signs. A life-bearing
      // row carries the strength of its reading (Weak / Strong / Hyper), which
      // is what says whether a landing there is a walk or a way to die; it
      // moves with the party's own level, so the list re-reads itself as they
      // grow rather than freezing at what the scan first said.
      const life = [];
      const weakLife = [];
      const addLifeRow = (list, prefix) => (w) => {
        const id = prefix + entries.length;
        entries.push({
          id, scale: SCALE_SYSTEM, kind: "planet", name: w.planet.name,
          data: w.planet, system: w.system,
        });
        const tier = GS.planetBioTier ? GS.planetBioTier(w.planet) : null;
        list.push({
          id, name: w.planet.name,
          sub: w.system.name + " · " + String(w.planet.type || "?").replace(/_/g, " ") +
            (isFinite(w.dist) ? " · " + w.dist.toFixed(1) + " ly" : "") +
            (tier ? " · " + GS.bioTierLabel(tier) : ""),
          course: true,
        });
      };
      this._lifeWorlds().forEach(addLifeRow(life, "l"));
      this._weakLifeWorlds().forEach(addLifeRow(weakLife, "w"));

      // Every hand-authored landing site, planet- or moon-level, across every
      // hardcoded system. Zoom flies to the PLANET the site sits on/around (a
      // moon's own site zooms to its parent planet, since that is the only one
      // of the two ever rendered as its own object outside of planet focus),
      // and Course sets sail for the system that holds it - the last hop down
      // to the surface is flown from there.
      const spaceports = [];
      this.dataManager.getAllSystems()
        .filter((s) => s && (s.hardcoded || s.farHardcoded))
        .forEach((sys) => {
          (sys.planets || []).forEach((planet) => {
            (planet.landingLocations || []).forEach((loc) => {
              const id = "p" + entries.length;
              entries.push({
                id, scale: SCALE_SYSTEM, kind: "planet", name: planet.name,
                data: planet, system: sys,
              });
              spaceports.push({
                id, name: loc.name,
                sub: planet.name + " · " + (sys.label || sys.name),
                course: !sys.farHardcoded,
              });
            });
            (planet.moons || []).forEach((moon) => {
              (moon.landingLocations || []).forEach((loc) => {
                const id = "p" + entries.length;
                entries.push({
                  id, scale: SCALE_SYSTEM, kind: "planet", name: planet.name,
                  data: planet, system: sys,
                });
                spaceports.push({
                  id, name: loc.name,
                  sub: moon.name + " (" + planet.name + ") · " + (sys.label || sys.name),
                  course: !sys.farHardcoded,
                });
              });
            });
          });
        });

      // Bookmarks: resolved from the saved records so a stale/unresolvable one
      // (e.g. a procedural cluster galaxy whose view was torn down) is simply
      // dropped from the list rather than shown as a dead entry.
      const bookmarks = [];
      this._bookmarks().forEach((rec) => {
        const resolved = this._resolveBookmark(rec);
        if (!resolved) return;
        const id = "bk" + entries.length;
        entries.push({
          id, scale: resolved.scale, kind: resolved.kind, name: resolved.name,
          data: resolved.data, system: resolved.system,
        });
        bookmarks.push({
          id, name: resolved.name,
          sub: resolved.system ? resolved.system.name
            : String(resolved.data.type || "").replace(/_/g, " "),
          // A course needs a star system to aim at: the star itself, or the
          // system a bookmarked planet/moon belongs to. Far-scale bodies
          // (galaxies, nebulae) have none, so they stay Zoom-only.
          course: resolved.kind === "star" || !!resolved.system,
        });
      });

      // The system the ship is actually in, body by body: its star (plus any
      // companion or donor riding with it), every planet, every moon. Only
      // built while the ship is IN a system - out in interstellar space, or
      // anywhere the current system cannot be resolved, the tab is dropped
      // rather than shown empty.
      const local = [];
      const localSys = this._catalogLocalSystem();
      if (localSys) {
        const addLocal = (name, sub, kind, data, depth) => {
          const id = "cs" + entries.length;
          entries.push({ id, scale: SCALE_SYSTEM, kind, name: data.name, data, system: localSys });
          local.push({ id, name, sub, course: false, depth: depth || 0 });
        };
        const starLabel = localSys.label || localSys.name;
        const classSub = (type, role) => T('Galaxy.catalog.' + role, {
          type: String(type || "?").replace(/_/g, " "),
        });
        // Hierarchical and distance-ordered: the star(s) first, then each
        // planet nearest-orbit-first with its own moons nested under it.
        addLocal(starLabel, classSub(localSys.type, 'star'), "star", localSys, 0);
        (localSys.companions || []).forEach((c) =>
          addLocal(c.name, classSub(c.type, 'companion'), "star", localSys, 0));
        if (localSys.feeding && localSys.feeding.donor) {
          addLocal(localSys.feeding.donor.name,
            classSub(localSys.feeding.donor.type, 'donor'), "star", localSys, 0);
        }
        const orderedPlanets = (localSys.planets || [])
          .slice()
          .sort((a, b) => (a.orbitRadius || 0) - (b.orbitRadius || 0));
        orderedPlanets.forEach((planet) => {
          // A living world is listed by the strength of its biosignature, which
          // is the one thing worth knowing before setting down on it; a world
          // with only tentacles to its name reads as trace signs.
          const signs = GS.planetLifeSigns ? GS.planetLifeSigns(planet) : null;
          const tier = GS.planetBioTier ? GS.planetBioTier(planet) : null;
          const life = signs === (GS.LifeSigns || {}).STRONG
            ? (tier ? " · " + GS.bioTierLabel(tier) : T('Galaxy.catalog.life'))
            : (signs === (GS.LifeSigns || {}).WEAK ? T('Galaxy.catalog.traceLife') : "");
          addLocal(planet.name,
            String(planet.type || "?").replace(/_/g, " ") +
            (planet.orbitRadius != null ? " · " + planet.orbitRadius.toFixed(2) + " AU" : "") + life,
            "planet", planet, 1);
          // A moon is never drawn as its own object outside planet focus, so
          // its row targets the planet it orbits (same rule as Spaceports).
          // Past 4 (Scene3D_Bodies' own SYSTEM_MOON_CAP - the wide view only
          // ever renders/picks that many anyway) a long flat list reads worse
          // than one summary row, so the family collapses into a count.
          const moons = planet.moons || [];
          if (moons.length > 4) {
            addLocal(T.n('Galaxy.catalog.moons', moons.length), "", "planet", planet, 2);
          } else {
            moons.forEach((moon) =>
              addLocal(moon.name,
                T('Galaxy.catalog.moonOf', {
                  type: String(moon.type || "?").replace(/_/g, " "), planet: planet.name,
                }),
                "planet", planet, 2));
          }
        });
      }

      // Patron worlds: the habitable, life-bearing planet each patron owns, out
      // in whichever galaxy holds their star (PatreonRewards). Registering the
      // systems here is cheap - it builds the eight systems themselves, not the
      // 220-system galaxies they sit in - so Zoom can drop straight into one.
      // Hand-authored systems that sit inside another galaxy (Titania, out in
      // Andromeda). Same treatment as a patron world: the entry is registered
      // at system scale so Zoom drops straight into it, and no course is
      // offered, since a course is a Milky Way flight plan.
      const farSystems = [];
      (this.dataManager.farSystems ? this.dataManager.farSystems() : []).forEach((sys) => {
        const id = "fs" + entries.length;
        entries.push({
          id, scale: SCALE_SYSTEM, kind: "star", name: sys.name, data: sys, system: sys,
        });
        farSystems.push({
          id, name: sys.label || sys.name,
          sub: T('Galaxy.catalog.starSub', {
            type: String(sys.type || "?").replace(/_/g, " "),
            planets: sys.planets ? sys.planets.length : 0,
          }) + " · " + sys.galaxy,
          course: false,
        });
      });

      const patrons = [];
      if (window.PatreonRewards && typeof window.PatreonRewards.catalogEntries === "function") {
        window.PatreonRewards.catalogEntries(this.dataManager).forEach((rec) => {
          const id = "pt" + entries.length;
          entries.push({
            id, scale: SCALE_SYSTEM, kind: "star", name: rec.system.name,
            data: rec.system, system: rec.system,
          });
          // A patron's world is out in the Milky Way now, not a galaxy away,
          // so a course to it is an ordinary flight plan like any other.
          patrons.push({ id, name: rec.name, sub: rec.sub, course: true });
        });
      }

      this._catalogEntries = entries;
      // Largest scale first, drilling down to individual stars: the star list is
      // by far the longest, so it sits last and takes the scroll. Where the ship
      // actually is comes first of all.
      const tabs = [];
      if (local.length) {
        tabs.push({
          id: "current", title: T('Galaxy.tab.current'),
          empty: T('Galaxy.tab.currentEmpty'),
          groups: [{
            title: T('Galaxy.tab.systemBodies', { name: localSys.label || localSys.name }), items: local,
          }],
        });
      }
      tabs.push(
        {
          id: "objects", title: T('Galaxy.tab.objects'), empty: T('Galaxy.tab.objectsEmpty'),
          groups: [
            { title: T('Galaxy.tab.galaxies'), items: byKind.galaxy },
            { title: T('Galaxy.tab.clusters'), items: byKind.cluster },
            { title: T('Galaxy.tab.anomalies'), items: byKind.anomaly },
            { title: T('Galaxy.tab.nebulae'), items: byKind.nebula },
            { title: T('Galaxy.tab.farSystems'), items: farSystems },
            { title: T('Galaxy.tab.starSystems'), items: stars },
          ],
        },
        {
          id: "bookmarks", title: T('Galaxy.tab.bookmarks'),
          empty: T('Galaxy.tab.bookmarksEmpty'),
          groups: [{ title: T('Galaxy.tab.bookmarkedBodies'), items: bookmarks }],
        },
        {
          id: "life", title: T('Galaxy.tab.biosignatures'),
          empty: T('Galaxy.tab.biosignaturesEmpty'),
          groups: [
            { title: T('Galaxy.tab.lifeBearing'), items: life, life: true },
            { title: T('Galaxy.tab.traceSignatures'), items: weakLife, life: true },
          ],
        },
        {
          id: "spaceports", title: T('Galaxy.tab.spaceports'),
          empty: T('Galaxy.tab.spaceportsEmpty'),
          groups: [{ title: T('Galaxy.tab.landingSites'), items: spaceports }],
        },
        {
          id: "patrons", title: T('Galaxy.tab.patrons'),
          empty: T('Galaxy.tab.patronsEmpty'),
          groups: [{ title: T('Galaxy.tab.patronWorlds'), items: patrons, life: true }],
        });
      this._markCatalogInView(tabs);
      // Held on to so the view filter can be re-run against a moved camera
      // without walking every system in the galaxy again (_refreshCatalogView).
      this._catalogTabs = tabs;
      return tabs;
    }

    /**
     * Every body the camera has in frame right now, as a Set of the same data
     * records the catalog files its rows under. The catalog opens filtered to
     * these: the full list is thousands of stars long, and what is on screen is
     * what a player asking "what is that" wants named.
     *
     * The test is the one picking already uses - in front of the near plane,
     * inside the frustum - run over everything the current view can be asked
     * about: the pickables of the built view, and, at galaxy scale, the star
     * cloud, whose points are not objects of their own.
     */
    _inViewData() {
      const set = new Set();
      const cam = this._camera;
      if (!cam) return set;
      cam.updateMatrixWorld();
      const v = this._catViewScratch || (this._catViewScratch = new THREE.Vector3());
      const cs = this._catViewScratch2 || (this._catViewScratch2 = new THREE.Vector3());
      const mark = (pick) => {
        if (!pick || !pick.data || set.has(pick.data)) return;
        if (!this._targetWorldPosition(pick, v)) return;
        // Behind the camera (it looks down -z), past the far plane, or off the
        // sides of the frame: not something the player can see.
        cs.copy(v).applyMatrix4(cam.matrixWorldInverse);
        if (cs.z >= -cam.near) return;
        v.project(cam);
        if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) return;
        set.add(pick.data);
      };
      for (const t of (this._pickTargets || [])) mark(t);
      if (this._scale === SCALE_GALAXY && this._galaxyView) {
        for (const sys of (this._galaxyByIndex || [])) {
          if (sys && sys.position) mark({ kind: "star", data: sys, system: sys });
        }
        for (const n of (this._galaxyView.nebulaPickables || [])) mark(n);
      }
      return set;
    }

    /**
     * Stamp `inView` on every catalog row, so the panel can filter itself
     * without knowing anything about cameras. A row whose body the current
     * view does not draw at all (a landing site out in another system, say)
     * is simply not in view.
     */
    _markCatalogInView(tabs) {
      let vis;
      try {
        vis = this._inViewData();
      } catch (err) {
        // A catalog that cannot work out what is on screen still has to open:
        // everything reads as in view rather than nothing.
        console.warn("GalaxySim: in-view catalog filter failed", err);
        vis = null;
      }
      const byId = new Map((this._catalogEntries || []).map((e) => [e.id, e]));
      (tabs || []).forEach((tab) => (tab.groups || []).forEach((g) => (g.items || []).forEach((it) => {
        const entry = byId.get(it.id);
        it.inView = !vis || !!(entry && entry.data && vis.has(entry.data));
      })));
    }

    /**
     * The star system the Current System tab describes: the one the ship is
     * sitting in. Null while it crosses interstellar space (there is no system
     * to list) or if the name cannot be resolved to a record.
     */
    _catalogLocalSystem() {
      const ship = this.dataManager.playerShip;
      if (ship && ship.isMoving && ship.targetSystem &&
          ship.targetSystem !== ship.currentSystem) {
        return null;
      }
      const sys = this._currentSystem();
      return (sys && sys.position) ? sys : null;
    }

    /**
     * Worlds a biosignature scan has logged, resolved back to live system /
     * planet records and sorted by distance from the ship. The log itself is
     * just "System|Planet" keys on $gameSystem, so it survives saving.
     */
    _lifeWorlds() {
      return this._loggedWorlds(($gameSystem && $gameSystem._gxLifeLog) || []);
    }

    /**
     * The same, for worlds whose scan came back WEAK: no biosphere, but the
     * spectra carry something the instruments cannot call geology either (see
     * GalaxySim.planetLifeSigns). Kept in its own log so the Biosignatures tab
     * can say which reading is which.
     */
    _weakLifeWorlds() {
      return this._loggedWorlds(($gameSystem && $gameSystem._gxWeakLifeLog) || []);
    }

    _loggedWorlds(log) {
      const origin = this._shipOrigin();
      const out = [];
      log.forEach((key) => {
        const cut = String(key).indexOf("|");
        if (cut < 0) return;
        const sys = this.dataManager.getSystem(key.slice(0, cut));
        if (!sys) return;
        const planet = (sys.planets || []).find((p) => p.name === key.slice(cut + 1));
        if (!planet) return;
        out.push({ system: sys, planet, dist: distanceBetween(sys.position, origin) });
      });
      out.sort((a, b) => a.dist - b.dist);
      return out;
    }

    /** Where a scan is taken from: the ship itself, or its system. */
    _shipOrigin() {
      const ship = this.dataManager.playerShip;
      if (ship && ship.position) return ship.position;
      const sys = this._currentSystem();
      return (sys && sys.position) || { x: 0, y: 0, z: 0 };
    }

    /**
     * Scan button: sweep every known system within BIOSCAN_RADIUS light years
     * for life-bearing planets, log what it finds (so the catalog keeps them)
     * and open the catalog on the Biosignatures tab with the results expanded.
     */
    _scanBiosignatures() {
      const origin = this._shipOrigin();
      const log = ($gameSystem._gxLifeLog = $gameSystem._gxLifeLog || []);
      const weakLog = ($gameSystem._gxWeakLifeLog = $gameSystem._gxWeakLifeLog || []);
      let fresh = 0;
      let found = 0;
      let weak = 0;
      const radius = this._bioscanRadius();
      const SIGNS = (GS.LifeSigns || { WEAK: "weak", STRONG: "strong" });
      this.dataManager.getAllSystems().forEach((sys) => {
        if (!sys || !sys.position) return;
        if (distanceBetween(sys.position, origin) > radius) return;
        (sys.planets || []).forEach((p) => {
          const signs = GS.planetLifeSigns ? GS.planetLifeSigns(p)
            : ((GS.planetHasLife && GS.planetHasLife(p)) ? SIGNS.STRONG : "none");
          if (signs !== SIGNS.STRONG && signs !== SIGNS.WEAK) return;
          const key = sys.name + "|" + p.name;
          // A world that reads strong is never also filed as weak, and a world
          // whose reading firms up moves out of the weak log rather than
          // sitting in both.
          if (signs === SIGNS.STRONG) {
            found++;
            const stale = weakLog.indexOf(key);
            if (stale !== -1) weakLog.splice(stale, 1);
            if (log.indexOf(key) === -1) { log.push(key); fresh++; }
          } else {
            weak++;
            if (log.indexOf(key) === -1 && weakLog.indexOf(key) === -1) {
              weakLog.push(key);
              fresh++;
            }
          }
        });
      });

      const ov = this._overlayUI;
      if (ov) {
        ov.setCatalog(this._buildCatalog(), "life", true);
        const local = this._catalogLocalSystem();
        this._catalogSystemName = local ? local.name : null;
        ov.setCatalogOpen(true);
      }
      this._setScanHint(found, fresh, weak);
      // Reading a sky full of spectra, and knowing a biosignature when one turns up.
      this._awardSpec("Radio Astronomy", 1);   // i18n-ignore: specialization id
      if (fresh) this._awardSpec("Astrobiology", 1);   // i18n-ignore: specialization id
      if (window.SoundManager) {
        if (found || weak) SoundManager.playOk(); else SoundManager.playBuzzer();
      }
    }

    // How far a sweep reaches. A fully serviced Hubble doubles it: that is what
    // the servicing bay is for (see GalaxySim.Hubble.isOperational).
    _bioscanRadius() {
      const boosted = !!(GS.Hubble && GS.Hubble.isOperational());
      return BIOSCAN_RADIUS * (boosted ? 2 : 1);
    }

    // Report the sweep in the mode hint line, until the next hint refresh.
    _setScanHint(found, fresh, weak) {
      if (!this._overlayUI) return;
      const radius = this._bioscanRadius();
      this._overlayUI.setModeHint(
        T.n('Galaxy.scan.worldsFound', found, { radius: radius }) +
        (weak ? T.n('Galaxy.scan.traceCount', weak, { count: weak }) : "") +
        (radius > BIOSCAN_RADIUS ? T('Galaxy.scan.hubbleOnline') : "") +
        (fresh ? T('Galaxy.scan.newCount', { count: fresh }) : "") +
        T('Galaxy.scan.loggedInCatalog'));
    }

    _toggleCatalog() {
      const ov = this._overlayUI;
      if (!ov) return;
      const open = !ov.isCatalogOpen();
      if (open) {
        ov.setCatalog(this._buildCatalog());
        const local = this._catalogLocalSystem();
        this._catalogSystemName = local ? local.name : null;
      }
      ov.setCatalogOpen(open);
      if (window.SoundManager) SoundManager.playCursor();
    }

    /**
     * The catalog now stays open while the player flies around, so its contents
     * can go stale under it - most visibly the Current System tab once the ship
     * arrives somewhere else. Rebuild it when, and only when, the system it was
     * built for stops being the system the ship is in.
     */
    _refreshCatalogIfStale() {
      const ov = this._overlayUI;
      if (!ov || !ov.isCatalogOpen()) return;
      const local = this._catalogLocalSystem();
      const name = local ? local.name : null;
      if (name !== this._catalogSystemName) {
        this._catalogSystemName = name;
        ov.setCatalog(this._buildCatalog());
        return;
      }
      this._refreshCatalogView();
    }

    /**
     * The camera moves under the open catalog, so a list filtered to what is in
     * frame has to follow it. Only the `inView` marks are re-read - the rows
     * themselves are the ones already built - and only a few times a second,
     * since the sweep still projects every star at galaxy scale.
     */
    _refreshCatalogView(force) {
      const ov = this._overlayUI;
      if (!ov || !this._catalogTabs) return;
      if (!force && !ov.isCatalogInView()) return;
      const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
      if (!force && this._catalogViewAt && now - this._catalogViewAt < 400) return;
      this._catalogViewAt = now;
      this._markCatalogInView(this._catalogTabs);
      ov.setCatalog(this._catalogTabs);
    }

    _catalogAction(id, what) {
      const e = (this._catalogEntries || []).find((x) => x.id === id);
      if (!e) { if (window.SoundManager) SoundManager.playBuzzer(); return; }
      // The catalog stays open through both actions: it is a list to work
      // down - zoom to one body, look, zoom to the next - and closing it after
      // every pick meant reopening and re-finding your place each time. Only
      // the player closes the catalog (its button, or Esc).
      if (what === "course") {
        // A logged world sets course for its star system; the last hop to the
        // planet itself is flown from inside the system.
        const sysName = e.kind === "star" ? e.name : (e.system && e.system.name);
        if (!sysName) { if (window.SoundManager) SoundManager.playBuzzer(); return; }
        this._travelToSystem(sysName);
        return;
      }
      // Adopt the catalogue record as the persistent target, then fly the same
      // route Space would: the object's own scale need not be loaded yet.
      this._target = {
        scale: e.scale, kind: e.kind, name: e.name, data: e.data,
        system: e.system, nodeIndex: null, clusterIndex: null,
      };
      this._zoomToTarget();
    }

    // ----------------------------------------------------------------------
    // Grand Tour: a hands-off cinematic flythrough of every body in the
    // current system, hierarchy-ordered star-first then planet-by-planet in
    // ascending distance from the star, moons trailing their planet - the
    // system-scale sibling of the title screen's Hyperverse slideshow. Only
    // Esc/[B] breaks it; nothing else drives the camera while it runs.
    // ----------------------------------------------------------------------
    _toggleGrandTour() {
      if (this._tour) this._endGrandTour();
      else this._startGrandTour();
    }

    _startGrandTour() {
      if (this._scale !== SCALE_SYSTEM || !this._systemView) {
        if (window.SoundManager) SoundManager.playBuzzer();
        return;
      }
      const stops = this._grandTourStops();
      if (!stops.length) {
        if (window.SoundManager) SoundManager.playBuzzer();
        return;
      }
      const ov = this._overlayUI;
      if (ov) { ov.setCatalogOpen(false); ov.deselect(); ov.hideTooltip(); }
      this._clearPlanetFocus(false);
      this._followShipCam = false;
      // Orbit stays enabled: mouse drag, wheel, right stick and L2/R2 zoom all
      // keep working so the player can look around and zoom while the tour
      // drifts between stops. Only the keyboard/left-stick PAN is suspended -
      // left/right there instead step to the previous/next stop (see update()).
      if (this._orbit) this._orbit.suspendKeys = true;
      this._setOrbitLinesVisible(false);
      // Wide open so every stop - a moon barely bigger than the ship, or a
      // companion star out past the belts - is reachable without the
      // planet-focus min/max band left over from whatever the player was
      // last looking at.
      this._rig.minDistance = 0.02;
      this._rig.maxDistance = ((this._systemOuter || this._systemView.outerRadius || 12)) * 6;
      this._tour = { stops, index: -1, timer: 0 };
      this._advanceGrandTour();
      if (ov) ov.setTourMode(true, this._tourHintText());
      if (window.SoundManager) SoundManager.playOk();
    }

    _endGrandTour() {
      if (!this._tour) return;
      this._tour = null;
      this._setOrbitLinesVisible(true);
      if (this._orbit) {
        this._orbit.suspendKeys = false;
        if (this._mode === "orbit") this._orbit.enable(); // no-op if already enabled
      }
      this._restoreSystemMinDistance();
      const outer = this._systemOuter || (this._systemView && this._systemView.outerRadius) || 12;
      this._rig.maxDistance = outer * 5;
      const ov = this._overlayUI;
      if (ov) ov.setTourMode(false);
      if (window.SoundManager) SoundManager.playCancel();
    }

    /** The one line the overlay leaves on screen while the tour runs: the name
     * of what is playing, not how to stop it. */
    _tourHintText() {
      return `<b>${T('Galaxy.hud.grandTour')}</b>`;
    }

    /** Step to the next (or, with dir -1, previous) stop and set the rig's new
     * target distance for it. `dir` also drives a manual skip (left/right,
     * A/D, pad d-pad/stick - see update()), not just the automatic hold timer. */
    _advanceGrandTour(dir) {
      const tour = this._tour;
      const n = tour.stops.length;
      tour.index = ((tour.index + (dir || 1)) % n + n) % n;
      tour.timer = 0;
      const stop = tour.stops[tour.index];
      const r = Math.max(stop.radius || 0.05, 0.02);
      const mult = stop.kind === "star" ? 3.4 : (stop.kind === "moon" ? 3.8 : 2.8);
      this._rig.setTargetDistance(Math.max(r * mult, r * 1.4 + 0.08));
    }

    /** Per-frame: follow the current stop (bodies keep orbiting), drift the
     * camera in a slow cinematic spin around it, and advance once its hold
     * time is up. */
    _updateGrandTour(delta) {
      const tour = this._tour;
      if (!tour) return;
      const stop = tour.stops[tour.index];
      if (stop && stop.object) {
        stop.object.getWorldPosition(this._pickScratch);
        this._rig.setTargetFocus(this._pickScratch);
      }
      this._rig.rotate(delta * TOUR_SPIN, 0);
      tour.timer += delta;
      if (tour.timer >= TOUR_HOLD) this._advanceGrandTour();
    }

    /**
     * Every body of the current system, star(s) first then planet-by-planet
     * in ascending orbitRadius, each planet's moons trailing it. Reuses the
     * live pickables the wide system view already built (Scene3D_Bodies'
     * SYSTEM_MOON_CAP caps a planet at its 4 nearest moons there too, so a
     * bigger family naturally gets the same "collapse" the catalog gives it).
     */
    _grandTourStops() {
      const view = this._systemView;
      if (!view || !view.pickables) return [];
      const primary = this._system;
      const stars = [];
      const planetOrder = [];
      const byPlanet = new Map();
      view.pickables.forEach((p) => {
        if (p.kind === "star") stars.push(p);
        else if (p.kind === "planet") {
          byPlanet.set(p.data, { planet: p, moons: [] });
          planetOrder.push(p.data);
        } else if (p.kind === "moon" && p.planet) {
          const entry = byPlanet.get(p.planet);
          if (entry) entry.moons.push(p);
        }
      });
      // The primary star leads; companions/donor follow in their build order.
      stars.sort((a, b) => (a.data === primary ? -1 : b.data === primary ? 1 : 0));
      planetOrder.sort((a, b) => (a.orbitRadius || 0) - (b.orbitRadius || 0));
      const stops = stars.slice();
      planetOrder.forEach((data) => {
        const entry = byPlanet.get(data);
        stops.push(entry.planet);
        stops.push(...entry.moons);
      });
      return stops;
    }

    /** Toggle every orbit guide line in the current system view. */
    _setOrbitLinesVisible(visible) {
      const root = this._systemView && this._systemView.group;
      if (!root) return;
      root.traverse((obj) => { if (obj.name === "gx-orbit") obj.visible = visible; });
    }

    // ----------------------------------------------------------------------
    // Travel / land / engine actions (drive the shared DataManager logic)
    // ----------------------------------------------------------------------
    /** The system the ship is actually in right now (labels the Home button). */
    _currentSystem() {
      const ship = this.dataManager.playerShip;
      const name = (ship && ship.currentSystem) || (this._focusSystem && this._focusSystem.name);
      return (name && this.dataManager.getSystem(name)) || this._focusSystem || null;
    }

    /** Home button: drop straight back into the ship's own star system. */
    _goToCurrentSystem() {
      const sys = this._currentSystem();
      if (!sys) { if (window.SoundManager) SoundManager.playBuzzer(); return; }
      this._followShipCam = false;
      this._restoreSystemMinDistance();
      if (this._scale === SCALE_SYSTEM && this._system && this._system.name === sys.name) {
        // Already here: pull back out to the whole system rather than rebuild.
        if (this._planetFocus) {
          this._clearPlanetFocus();
        } else {
          const outer = this._systemOuter ||
            (this._systemView && this._systemView.outerRadius) || 12;
          this._rig.setTargetFocus(new THREE.Vector3(0, 0, 0));
          this._rig.setTargetDistance(Math.max(8, outer * 1.9 + 3));
        }
        this._boostCamera();
        if (window.SoundManager) SoundManager.playCursor();
        return;
      }
      this._setTarget(null);
      this._selectedPick = null;
      this._enterScale(SCALE_SYSTEM, sys);
      if (window.SoundManager) SoundManager.playOk();
    }

    /**
     * Ship button: go to wherever the ship actually is - the system it sits in,
     * or the galaxy scale while it crosses interstellar space - and keep the
     * camera centred on it until the player grabs the view. Unlike Home (which
     * frames the whole system) this always ends up on the craft itself.
     */
    _goToShip() {
      const ship = this.dataManager.playerShip;
      const buzz = () => { if (window.SoundManager) SoundManager.playBuzzer(); };
      if (!ship) return buzz();
      // Following only means anything for the orbit rig; the cockpit drives the
      // camera itself, so drop back to orbit first.
      if (this._mode === "fly") this._toggleMode();
      // Always drop whatever was selected: leaving it as the persistent target
      // let the zoom ladder re-enter it (or _restoreTarget re-open its panel)
      // once the camera drifted back inside its entry band while following the
      // ship - reading as the view snapping back to the old selection.
      this._setTarget(null);
      this._selectedPick = null;
      if (this._overlayUI) this._overlayUI.deselect();

      // An inter-system flight is only drawn at galaxy scale; everything else
      // (parked, in orbit, or hopping between planets) lives inside a system.
      const interstellar = !!(ship.isMoving && ship.targetSystem &&
        ship.targetSystem !== ship.currentSystem);
      if (interstellar) {
        if (this._scale !== SCALE_GALAXY || !this._galaxyView ||
            this._webCluster || this._galaxyFocus) {
          this._setTarget(null);
          this._selectedPick = null;
          this._enterScale(SCALE_GALAXY, this._currentSystem() || this._focusSystem);
        }
      } else {
        const sys = this._currentSystem();
        if (!sys) return buzz();
        if (this._scale !== SCALE_SYSTEM || !this._systemView ||
            !this._system || this._system.name !== sys.name) {
          this._setTarget(null);
          this._selectedPick = null;
          this._enterScale(SCALE_SYSTEM, sys);
        } else if (this._planetFocus) {
          // Leave planet focus without yanking the framing back to the star:
          // the follow below takes the camera to the ship instead.
          this._clearPlanetFocus(false);
        }
      }
      // The ship is placed by _updateShipAndTravel, which also drives the
      // follow, so the actual camera move happens on the next frame.
      this._followShipCam = true;
      this._frameShipCam = true;
      this._ladderHold = 0;
      this._ladderCooldown = Math.max(this._ladderCooldown, 0.6);
      if (window.SoundManager) SoundManager.playOk();
    }

    /** World position of the ship in whatever view currently draws it. */
    _shipWorldPosition(out) {
      if (this._scale === SCALE_GALAXY && this._galaxyShip) {
        return this._galaxyShip.group.getWorldPosition(out);
      }
      if (this._scale === SCALE_SYSTEM && this._systemView && this._systemView.shipGroup) {
        const g = this._systemView.shipGroup;
        if (!g.visible) return null; // ship is not in the system on screen
        return g.getWorldPosition(out);
      }
      return null;
    }

    // Keep the camera on the ship once the Ship button has been pressed, until
    // the player drags the view away.
    _updateShipCamFollow() {
      if (!this._followShipCam) return;
      // Any manual camera move (drag or keyboard/stick pan) drops the follow, so
      // it never fights the player for the view.
      const panning = typeof Input !== "undefined" && this._orbit &&
        !this._orbit.suspendKeys &&
        (Input.isPressed("left") || Input.isPressed("right") ||
         Input.isPressed("up") || Input.isPressed("down"));
      if (this._mode !== "orbit" || panning || (this._orbit && this._orbit.dragging)) {
        this._followShipCam = false;
        this._restoreSystemMinDistance();
        return;
      }
      if (!this._shipCamScratch) this._shipCamScratch = new THREE.Vector3();
      const p = this._shipWorldPosition(this._shipCamScratch);
      if (!p) return;
      this._rig.setTargetFocus(p);
      if (this._frameShipCam) {
        this._frameShipCam = false;
        // Close enough to read the hull, but never past the band edges that
        // would trip the scale ladder on arrival. The system-scale hull is
        // now 1 km-tiny (SHIP_WORLD_LENGTH), so the old fixed "at least 1
        // world unit" floor left it an invisible speck; frame proportional to
        // its own size instead, and let the orbit's minDistance follow it in
        // (restored to the system-wide floor wherever ship-cam ends).
        let want;
        if (this._scale === SCALE_GALAXY) {
          want = 12;
        } else {
          const shipLen = (GS.Scene3DBodies && GS.Scene3DBodies.SHIP_WORLD_LENGTH) || 0.3;
          this._rig.minDistance = Math.max(0.02, shipLen * 0.6);
          want = shipLen * 3.2;
        }
        this._rig.setTargetDistance(this._clampFramingDistance(want));
        this._boostCamera();
      }
    }

    // Ship-cam framing at system scale temporarily shrinks the orbit's
    // minDistance so the camera can approach the (now tiny) hull; restore the
    // system-wide floor wherever that framing ends, unless a planet focus has
    // meanwhile claimed its own override (which manages minDistance itself).
    _restoreSystemMinDistance() {
      if (this._scale === SCALE_SYSTEM && !this._planetFocus) this._rig.minDistance = 0.3;
    }

    /** The star system currently selected/targeted, if any (for SB-Bridge).
     * A selected companion star resolves to the system that owns it (the
     * bridge still lands at that exact star - see _selectedBridgeStar). */
    _selectedSystemForBridge() {
      const t = this._target;
      if (t && t.kind === "star") {
        if (t.data && t.data._companionOf) {
          return this.dataManager.getSystem(t.data._companionOf) || t.system || null;
        }
        return this.dataManager.getSystem(t.name) || t.data || t.system || null;
      }
      const p = this._selectedPick;
      if (p && p.kind === "star") {
        if (p.data && p.data._companionOf) {
          return this.dataManager.getSystem(p.data._companionOf) || p.system || null;
        }
        return p.system || p.data || null;
      }
      return null;
    }

    /** The specific star of an N-ary system the bridge/travel should arrive
     * at, when the selection is a companion/donor rather than the primary. */
    _selectedBridgeStar() {
      const t = this._target;
      if (t && t.kind === "star" && t.data && t.data._companionOf) return t.data.name;
      const p = this._selectedPick;
      if (p && p.kind === "star" && p.data && p.data._companionOf) return p.data.name;
      return null;
    }

    // After a bridge jump rebuilds the destination system, pull the camera
    // straight onto whatever the ship actually arrived at - a planet gets the
    // full focus treatment (moons and all), anything else (the star, a black
    // hole) just gets framed - instead of leaving the player looking at the
    // default whole-system view they'd get from a normal arrival.
    _frameArrival(pick) {
      if (!pick) return;
      if (this._scale === SCALE_SYSTEM && pick.kind === "planet") {
        this._focusPlanet(pick);
        this._boostCamera();
        return;
      }
      const p = this._targetWorldPosition(pick, new THREE.Vector3());
      if (!p) return;
      this._rig.setTargetFocus(p);
      this._rig.setTargetDistance(this._clampFramingDistance(this._targetFramingDistance(pick)));
      this._boostCamera();
    }

    /**
     * SB-Bridge: spend one Schrödingerite to quantum-jump the ship to the
     * currently selected system, however far (even across galaxies), with a
     * warp flash. The teleport + scale swap happen at the white-out peak so the
     * transition is hidden.
     */
    _sbBridge() {
      if (this._warping) return;
      const dm = this.dataManager;
      const buzz = () => { if (window.SoundManager) SoundManager.playBuzzer(); };
      const sys = this._selectedSystemForBridge();
      if (!sys) return buzz();
      const ship = dm.playerShip;
      if (ship && ship.currentSystem === sys.name) return buzz(); // already there
      const infinite = !!(GS.isInfiniteFuel && GS.isInfiniteFuel());
      if (!infinite && dm.getSchrodingerite() < 1) return buzz();

      if (!infinite && dm.setSchrodingerite) {
        dm.setSchrodingerite(dm.getSchrodingerite() - 1);
      }
      if (this._overlayUI) this._overlayUI.deselect();
      if (window.SoundManager) SoundManager.playOk();

      this._warping = true;
      const target = sys.name;
      // A companion-star selection means the jump ends parked at THAT star.
      const starName = this._selectedBridgeStar();
      const doJump = () => {
        if (dm.teleportToSystem) dm.teleportToSystem(target);
        if (starName && dm.parkAtStar) dm.parkAtStar(target, starName);
        this._setTarget(null);
        this._selectedPick = null;
        this._lastShipStatus = null;
        const entered = dm.getSystem(target) || sys;
        this._enterScale(SCALE_SYSTEM, entered);
        const picks = this._pickTargets || [];
        this._frameArrival(
          (starName && picks.find((p) => p.kind === "star" && p.data && p.data.name === starName)) ||
          picks.find((p) => p.kind === "star"));
      };
      if (this._overlayUI && this._overlayUI.playWarp) {
        this._overlayUI.playWarp(doJump, () => { this._warping = false; });
      } else {
        doJump();
        this._warping = false;
      }
    }

    /**
     * SB-Bohr bridge: spend one Schrödingerite to jump straight into orbit of
     * the selected planet, moon (bridges into its parent planet's orbit) or
     * star/black hole (bridges into a park orbiting it), in any system, with
     * the same warp flash as SB-Bridge.
     */
    _bohrBridge(sel) {
      if (this._warping) return;
      const dm = this.dataManager;
      const buzz = () => { if (window.SoundManager) SoundManager.playBuzzer(); };
      const pick = sel || this._selectedPick;
      if (!pick || !pick.data) return buzz();
      const isStar = pick.kind === "star";
      const isMoon = pick.kind === "moon";
      if (!isStar && pick.kind !== "planet" && !isMoon) return buzz();
      const sysName = isStar
        ? (pick.data._companionOf || pick.data.name)
        : (pick.system && pick.system.name) || (this._system && this._system.name);
      if (!sysName) return buzz();
      // Bridging to a companion star of an N-ary system parks at that star.
      const starName = (isStar && pick.data._companionOf) ? pick.data.name : null;
      // A moon bridges into orbit of its parent planet - moons have no
      // independent ship-orbit state (see the `orbitingParent` convention).
      const targetName = isStar ? null : (isMoon ? (pick.planet && pick.planet.name) : pick.data.name);
      if (!isStar && !targetName) return buzz();
      const ship = dm.playerShip;
      if (ship && ship.currentSystem === sysName) {
        if (isStar && ship.parkedBody && ship.parkedBody.name === pick.data.name) return buzz(); // already parked
        if (!isStar && ship.currentPlanet === targetName) return buzz(); // already in this orbit
      }
      const infinite = !!(GS.isInfiniteFuel && GS.isInfiniteFuel());
      if (!infinite && dm.getSchrodingerite && dm.getSchrodingerite() < 1) return buzz();
      if (!infinite && dm.setSchrodingerite) dm.setSchrodingerite(dm.getSchrodingerite() - 1);

      if (this._overlayUI) this._overlayUI.deselect();
      if (window.SoundManager) SoundManager.playOk();
      this._warping = true;
      const doJump = () => {
        if (isStar) {
          if (dm.parkAtStar) dm.parkAtStar(sysName, starName);
        } else if (dm.teleportToPlanetOrbit) {
          dm.teleportToPlanetOrbit(sysName, targetName);
        }
        this._setTarget(null);
        this._selectedPick = null;
        this._lastShipStatus = null;
        this._enterScale(SCALE_SYSTEM, dm.getSystem(sysName) || this._system);
        const wantName = isStar ? (starName || sysName) : targetName;
        this._frameArrival((this._pickTargets || []).find((p) =>
          p.data && p.data.name === wantName && (isStar ? p.kind === "star" : p.kind === "planet")));
      };
      if (this._overlayUI && this._overlayUI.playWarp) {
        this._overlayUI.playWarp(doJump, () => { this._warping = false; });
      } else {
        doJump();
        this._warping = false;
      }
    }

    /**
     * Park in orbit of the selected star/black hole while already in this
     * system - free (no Schrödingerite), the star-scale equivalent of Land.
     */
    _parkAtStar(sel) {
      const dm = this.dataManager;
      const buzz = () => { if (window.SoundManager) SoundManager.playBuzzer(); };
      const pick = sel || this._selectedPick;
      if (!pick || pick.kind !== "star" || !pick.data) return buzz();
      // Companion/donor stars park inside the system that owns them.
      const sysName = pick.data._companionOf || pick.data.name;
      const ship = dm.playerShip;
      if (!ship || ship.isMoving || ship.currentSystem !== sysName) return buzz();
      if (ship.parkedBody && ship.parkedBody.name === pick.data.name) return buzz(); // already parked
      if (!dm.parkAtStar(sysName, pick.data._companionOf ? pick.data.name : null)) return buzz();
      this._lastShipStatus = null;
      this._refreshSelection();
      if (window.SoundManager) SoundManager.playOk();
    }

    /** Begin slowly topping up Hyperflux while parked at a main-sequence star. */
    _startRefuel() {
      const dm = this.dataManager;
      const buzz = () => { if (window.SoundManager) SoundManager.playBuzzer(); };
      if (!dm.startRefuel || !dm.startRefuel()) return buzz();
      this._refreshSelection();
      if (window.SoundManager) SoundManager.playOk();
    }

    _stopRefuel() {
      const dm = this.dataManager;
      if (dm.stopRefuel) dm.stopRefuel();
      this._refuelPlanKey = null;
      this._refreshSelection();
      if (window.SoundManager) SoundManager.playCursor();
    }

    /**
     * HUD Refuel button: engage the pumps where the ship already is, or
     * auto-plot the course to the nearest star that can refuel it (the local
     * star when this system has one). While refuelling it stops the pumps
     * instead, so the one button is the whole control.
     */
    _autoRefuel() {
      const dm = this.dataManager;
      const ship = dm.playerShip;
      if (ship && ship.isRefueling) { this._stopRefuel(); return; }
      const buzz = () => { if (window.SoundManager) SoundManager.playBuzzer(); };
      if (!dm.beginAutoRefuel) return buzz();
      const plan = dm.beginAutoRefuel();
      if (!plan || !(plan.started || plan.plotted)) return buzz();
      this._refuelPlanKey = null;
      this._lastShipStatus = null;
      this._refreshSelection();
      if (window.SoundManager) SoundManager.playOk();
    }

    // The live refuel plan, recomputed only when the state it depends on
    // changes: the nearest-star search sweeps the lazy field, far too heavy to
    // run every frame (see DataManager.findNearestRefuelStar).
    _refuelPlan() {
      const dm = this.dataManager;
      const ship = dm.playerShip;
      if (!ship || !dm.planRefuel) return null;
      const D = GS.DataManager;
      const full = dm.getHyperflux
        ? dm.getHyperflux() >= ((D && D.HYPERFLUX_MAX) || 92000) : false;
      const key = [
        ship.currentSystem || "", (ship.parkedBody && ship.parkedBody.name) || "",
        ship.currentPlanet || "", ship.isMoving ? 1 : 0, ship.isRefueling ? 1 : 0,
        full ? 1 : 0, $gameVariables.value(94) || 1,
      ].join("|");
      if (key !== this._refuelPlanKey) {
        this._refuelPlanKey = key;
        this._refuelPlanCache = dm.planRefuel();
      }
      return this._refuelPlanCache;
    }

    // mm:ss for the refuel / harvest countdowns, matching the travel clock.
    _clockText(seconds) {
      const s = Math.max(0, Math.ceil(seconds || 0));
      return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
    }

    // Button caption / status line for the fuel panel's Refuel control.
    _refuelHudState(plan) {
      const dm = this.dataManager;
      // A harvest flyby owns the panel while it runs: it is the same pumps
      // drawing on the same hole, just on its own half-minute clock.
      if (dm.isHarvestingSchrodingerite && dm.isHarvestingSchrodingerite()) {
        return {
          label: T('Galaxy.refuel.refuel'), enabled: false, active: true,
          sub: T('Galaxy.refuel.harvesting'),
          hint: T('Galaxy.refuel.eta', { time: this._clockText(dm.schrodingeriteHarvestRemaining()) }),
        };
      }
      if (!plan) return { label: T('Galaxy.refuel.refuel'), hint: "", enabled: false, active: false };
      // In transit on an auto-refuel course: say so rather than re-advertising
      // the search (pressing the button again simply re-plots).
      const ship = this.dataManager.playerShip;
      if (ship && ship.isMoving && ship.autoRefuelOnArrival) {
        return {
          label: T('Galaxy.refuel.refuel'), enabled: true, active: false,
          sub: T('Galaxy.refuel.onArrival'),
          hint: T('Galaxy.refuel.courseSet', { target: ship.targetStar || ship.targetSystem || "" }),
        };
      }
      const star = plan.starName || plan.systemName || "";
      const ly = plan.distance ? plan.distance.toFixed(1) + " ly" : "";
      switch (plan.status) {
        case "refuelling": {
          // The pumps run on a fixed real-time curve, so the fill has a true
          // ETA - quoted here exactly as an arrival is (see refuelEtaSeconds).
          const left = dm.refuelEtaSeconds ? dm.refuelEtaSeconds() : 0;
          return {
            label: T('Galaxy.refuel.stop'), enabled: true, active: true,
            sub: T('Galaxy.refuel.refuelling') + " · " + this._clockText(left),
            hint: T('Galaxy.refuel.drawingFrom', { star: star }),
          };
        }
        case "full":
          return { label: T('Galaxy.refuel.refuel'), enabled: false, active: false, sub: T('Galaxy.refuel.tankFull'), hint: "" };
        case "here":
          return {
            label: T('Galaxy.refuel.refuel'), enabled: true, active: false,
            sub: T('Galaxy.refuel.docked'), hint: star,
          };
        case "local":
          return {
            label: T('Galaxy.refuel.refuel'), enabled: true, active: false,
            sub: T('Galaxy.refuel.inSystem'), hint: star,
          };
        case "travel":
          return {
            label: T('Galaxy.refuel.refuel'), enabled: true, active: false,
            sub: plan.shortFuel ? T('Galaxy.refuel.mayBeOutOfRange') : T('Galaxy.refuel.nearest'),
            hint: star + (ly ? " · " + ly : "") +
              (plan.estFuel ? " · ~" + Math.round(plan.estFuel).toLocaleString() + " L" : ""),
          };
        default:
          return {
            label: T('Galaxy.refuel.refuel'), enabled: false, active: false,
            sub: T('Galaxy.refuel.noneInRange'), hint: "",
          };
      }
    }

    /**
     * Open the Schrodingerite flyby: half a minute of skimming the hole's
     * disk, flown in the system view (see _updateRefuelApproach), after which
     * the charges are banked by tickSchrodingeriteHarvest.
     */
    _harvestSchrodingerite() {
      const dm = this.dataManager;
      const buzz = () => { if (window.SoundManager) SoundManager.playBuzzer(); };
      if (!dm.beginSchrodingeriteHarvest || !dm.beginSchrodingeriteHarvest()) return buzz();
      this._lastShipStatus = null;
      this._refreshSelection();
      if (window.SoundManager) SoundManager.playOk();
    }

    // Seconds the hull takes to close on the body it is drawing from, and the
    // same again to fall back out to its parking orbit once the pumps stop.
    // Eased with a smoothstep so neither end of the move is abrupt.
    _updateRefuelApproach(delta) {
      const dm = this.dataManager;
      const ship = dm && dm.playerShip;
      const drawing = !!(ship && !ship.isMoving && (ship.isRefueling ||
        (dm.isHarvestingSchrodingerite && dm.isHarvestingSchrodingerite())));
      const APPROACH_SECONDS = 8;
      const step = Math.max(0, delta || 0) / APPROACH_SECONDS;
      let raw = this._refuelApproachRaw || 0;
      raw = drawing ? Math.min(1, raw + step) : Math.max(0, raw - step);
      this._refuelApproachRaw = raw;
      this._refuelApproach = raw * raw * (3 - 2 * raw);
    }

    /** The star the galaxy-scale zoom-in should drop into, if any. */
    _systemToEnter() {
      // Star targets live at the galaxy scale and inside a procedural galaxy;
      // both drop into the system the same way.
      if (this._scale !== SCALE_GALAXY && !this._galaxyFocus) return null;
      const t = this._target;
      if (t && t.kind === "star") {
        return this.dataManager.getSystem(t.name) || t.data || null;
      }
      const p = this._selectedPick;
      if (p && p.kind === "star") return p.system || p.data || null;
      // Nothing explicitly targeted or selected: zooming in used to just
      // clamp here, even when the camera had drawn in right on top of the
      // ship's own current system - the natural "go home" outcome of
      // zooming toward your own position, not a wall. Only fires when the
      // orbit focus itself is actually near that system (not wherever the
      // camera happens to be pointed), so panning off to empty space and
      // zooming in there still just clamps as before.
      const cur = this._currentSystem();
      if (!cur || !cur.position) return null;
      if (!this._scratchSysEnter) this._scratchSysEnter = new THREE.Vector3();
      const wp = this._galaxyFocus
        ? this._scratchSysEnter.copy(cur.position)
        : (this._galaxyView && this._galaxyView.worldOf
          ? this._galaxyView.worldOf(cur, this._scratchSysEnter) : null);
      if (wp && this._rig.focus.distanceTo(wp) < this._inDist) return cur;
      return null;
    }

    _enterSystemByName(name) {
      const sys = this.dataManager.getSystem(name);
      if (!sys) { if (window.SoundManager) SoundManager.playBuzzer(); return; }
      if (window.SoundManager) SoundManager.playOk();
      this._enterScale(SCALE_SYSTEM, sys);
    }

    _travelToSystem(name) {
      const dm = this.dataManager;
      if (dm.getSystem && dm.getSystem(name)) {
        if (dm.startTravelToSystem) dm.startTravelToSystem(name);
      } else {
        // Not a system name: a companion/donor star of an N-ary system. Find
        // its owner from the live selection and set course for that exact star
        // (arrival parks the ship in its orbit - see startTravelToStar).
        const sel = [this._selectedPick, this._target].find((p) =>
          p && p.data && p.data.name === name && p.data._companionOf);
        const owner = sel && sel.data._companionOf;
        if (!(owner && dm.startTravelToStar && dm.startTravelToStar(owner, name))) {
          if (window.SoundManager) SoundManager.playBuzzer();
          return;
        }
      }
      if (window.SoundManager) SoundManager.playOk();
      // Plotting an interstellar course is the navigator's work.
      // i18n-ignore-start: specialization ids
      this._awardSpec("Celestial Navigation", 1);
      this._awardSpec("Spacecraft Piloting", 1);
      // i18n-ignore-end
      if (this._overlayUI) this._overlayUI.deselect();
    }

    _travelToPlanet(sel) {
      if (!sel || !sel.data) return;
      const sysName = (sel.system && sel.system.name) || this._system.name;
      // A moon has no orbit of its own outside planet focus (the same rule
      // the catalog's Spaceports list follows), so "Fly Here" on one really
      // means orbiting the planet it belongs to - startTravelToPlanet only
      // knows planet names.
      const targetName = (sel.kind === "moon" && sel.planet) ? sel.planet.name : sel.data.name;
      let departed = false;
      if (this.dataManager.startTravelToPlanet) {
        departed = this.dataManager.startTravelToPlanet(sysName, targetName) !== false;
      }
      if (departed) this._boardStarship();
      if (window.SoundManager) SoundManager.playOk();
      this._awardSpec("Spacecraft Piloting", 1);   // i18n-ignore: specialization id
      if (this._overlayUI) this._overlayUI.deselect();
    }

    /** Put the party back aboard before the ship departs. The star map is
     * reachable planetside as well as from the bridge, so "Fly Here" given from
     * anywhere but the Starship interior reserves a transfer to its helm - the
     * transfer runs the moment the map scene comes back. MergedVehicleSystem
     * does the disembarking (a ridden or parked vehicle), then the destination
     * is reserved again so the party always lands on the helm tile facing up. */
    _boardStarship() {
      if (typeof $gameMap === "undefined" || !$gameMap || !$gamePlayer) return;
      if ($gameMap.mapId() === SHIP_INTERIOR.mapId) return;
      const vehicles = window.MergedVehicleSystem;
      if (vehicles && typeof vehicles.enterAirshipInterior === "function") {
        vehicles.enterAirshipInterior({ silent: true });
      }
      $gamePlayer.reserveTransfer(SHIP_INTERIOR.mapId, SHIP_INTERIOR.x,
        SHIP_INTERIOR.y, SHIP_INTERIOR.dir, 0);
    }

    // Hand an activity to the specialization listener (SpecializationMenu.js).
    // Guarded: the star map must still work with that plugin disabled.
    _awardSpec(name, points, opts) {
      if (window.SpecializationXP) window.SpecializationXP.award(name, points, opts);
    }

    // "In the Milky Way" means browsing/travelling within it - not inside a
    // different named galaxy's interior (_galaxyFocus, see _enterGalaxyFocus)
    // and not out at the local-group/filaments/etc. far scales.
    _isInMilkyWay() {
      return (this._scale === SCALE_SYSTEM || this._scale === SCALE_GALAXY) && !this._galaxyFocus;
    }

    _earthPlanet() {
      const sol = this.dataManager.getSystem("Sol");   // i18n-ignore: system / body id
      const earth = sol && sol.planets && sol.planets.find((p) => p.name === "Earth");   // i18n-ignore: system / body id
      return (sol && earth) ? { sol, earth } : null;
    }

    _toggleReturnEarth() {
      const ov = this._overlayUI;
      if (!ov) return;
      ov.setReturnEarthOpen(!ov.isReturnEarthOpen());
      if (window.SoundManager) SoundManager.playCursor();
    }

    /** Return to Earth (slow route): plots a normal course home, only while
     * browsing the Milky Way and not already orbiting Earth. */
    _setCourseEarth() {
      const dm = this.dataManager;
      const ship = dm.playerShip;
      const buzz = () => { if (window.SoundManager) SoundManager.playBuzzer(); };
      if (!ship || ship.isMoving) return buzz();
      if (!this._isInMilkyWay()) return buzz();
      if (ship.currentSystem === "Sol" && ship.currentPlanet === "Earth") return buzz();   // i18n-ignore: system / body id
      const home = this._earthPlanet();
      if (!home) return buzz();
      if (ship.currentSystem !== "Sol") {   // i18n-ignore: system / body id
        this._travelToSystem("Sol");   // i18n-ignore: system / body id
      } else {
        this._travelToPlanet({ kind: "planet", data: home.earth, system: home.sol });
      }
    }

    /** Return to Earth (instant route): reuses the Schrödinger-Bohr bridge with
     * Earth as a fixed target, from anywhere. */
    _ebBridge() {
      const home = this._earthPlanet();
      if (!home) { if (window.SoundManager) SoundManager.playBuzzer(); return; }
      this._bohrBridge({ kind: "planet", data: home.earth, system: home.sol });
    }

    _changeSpeed(delta) {
      this._setSpeed(($gameVariables.value(94) || 1) + delta, true);
    }

    // Warp-speed slider / +- buttons. Higher speed shortens the trip but the
    // Hyperflux burn rises quadratically (see DataManager.updateShipPosition).
    _setSpeed(value, playSound) {
      const v = Math.max(1, Math.min(100, Math.round(value) || 1));
      const ship = this.dataManager.playerShip;
      if (v === ($gameVariables.value(94) || 1)) {
        if (this._overlayUI) this._overlayUI.showSpeed(v, this._travelEta(ship));
        return;
      }
      $gameVariables.setValue(94, v);
      if (this.dataManager.recalculateDepartureOnSpeedChange) {
        this.dataManager.recalculateDepartureOnSpeedChange();
      }
      if (this._overlayUI) this._overlayUI.showSpeed(v, this._travelEta(ship));
      if (playSound && window.SoundManager) SoundManager.playCursor();
    }

    _stopEngines() {
      if (this.dataManager.stopTravel) this.dataManager.stopTravel(true);
      if (window.SoundManager) SoundManager.playCancel();
    }

    // Ported from the legacy Scene_AdvancedStarMap.landOnPlanet, now routed
    // through the landing-grid picker (unwrapped planet texture, clickable
    // squares) instead of touching down at a fixed coordinate.
    // sel is the overlay's live selection ({ kind, data, planet, ... }, see
    // Overlay#showBody). A moon lands on itself even though the ship's own
    // orbit is around its parent planet (canLand allows it via orbitingParent
    // in _showInfoFor); anything else lands on wherever the ship is actually
    // parked, ignoring sel so a stale selection can never redirect it.
    _landOnCurrentPlanet(sel) {
      const dm = this.dataManager;
      const ship = dm.playerShip;
      const buzz = () => { if (window.SoundManager) SoundManager.playBuzzer(); };
      let planet = null;
      // A moon turns to face its own planet, not the star, so its day is its
      // orbit: this has to travel with it or the sky over it is worked out as
      // though it were a planet skimming its star.
      let moonOf = null;
      if (sel && sel.kind === "moon" && sel.data && sel.planet &&
          ship && !ship.isMoving && ship.currentPlanet === sel.planet.name) {
        planet = sel.data;
        moonOf = sel.planet;
      } else {
        const planetName = ship && ship.currentPlanet;
        if (!planetName) return buzz();
        const system = dm.getSystem(ship.currentSystem);
        if (!system || !system.planets || !system.planets.length) return buzz();
        planet = system.planets.find((p) => p.name === planetName);
      }
      if (!planet || !planet.type) return buzz();
      if (!this._overlayUI || !this._overlayUI.showLandingGrid) return buzz();

      this._overlayUI.showLandingGrid(planet, {
        onPick: (gx, gy, mode) => {
          // Two ways down. A LIMINAL WALK opens the 3D world on the planet
          // itself - one biome from pole to pole, in its own colours, with
          // whatever lives there roaming it - instead of generating a surface
          // map to walk about on.
          if (mode === 'walk') {
            if (!this._liminalWalkOn(planet, gx, gy, moonOf)) return buzz();
            this._awardSpec("Spacecraft Piloting", 2);   // i18n-ignore: specialization id
            if (window.SoundManager) SoundManager.playOk();
            SceneManager.pop();
            return;
          }
          // A FLYBY never lands at all: the same world opens, and the party
          // stays aboard the ship and flies it over the place. Flying it into
          // the side of a mountain takes the mountain down and the hull with
          // it, so this is a way of seeing a world, not a safer one.
          if (mode === 'flyby') {
            if (!this._liminalFlybyOn(planet, gx, gy, moonOf)) return buzz();
            this._awardSpec("Spacecraft Piloting", 3);   // i18n-ignore: specialization id
            if (window.SoundManager) SoundManager.playOk();
            SceneManager.pop();
            return;
          }
          // Shared surface entry: builds the landed-planet descriptor
          // (atmosphere, life, satellites, palette), applies the EVA suit
          // when needed, generates the surface at the chosen grid square and
          // reserves the transfer to map 636.
          if (!(GS.enterPlanetSurface && GS.enterPlanetSurface(planet,
                { gridCell: { gx, gy }, isMoon: !!moonOf, parentPlanet: moonOf }))) {
            return buzz();
          }
          // Setting down is piloting; setting down somewhere alive is fieldwork.
          this._awardSpec("Spacecraft Piloting", 2);   // i18n-ignore: specialization id
          const signs = GS.planetLifeSigns ? GS.planetLifeSigns(planet) : null;
          if (signs === (GS.LifeSigns || {}).STRONG) {
            this._awardSpec("Astrobiology", 2);   // i18n-ignore: specialization id
          } else if (signs === (GS.LifeSigns || {}).WEAK) {
            // Whatever grows down there is not a biosphere, but walking it is
            // still fieldwork.
            this._awardSpec("Astrobiology", 1);   // i18n-ignore: specialization id
          }
          if (window.SoundManager) SoundManager.playOk();
          SceneManager.pop(); // leave the star map
        },
        onCancel: () => { if (window.SoundManager) SoundManager.playCancel(); },
      });
    }

    // Open the 3D world on a planet. Everything it needs is already written
    // down elsewhere: the Alien<Type> biome carries the world's colours and its
    // furniture list, and the galaxy simulation's own species roster says what
    // lives there. A world with no life has an empty roster and nothing roams
    // it, which is the honest answer for a comet.
    // The shared entry, so the star map and the on-foot landing-site picker
    // (Scene_AlienLandingGrid) open the same walk.
    // ----------------------------------------------------------------------
    // Taking the helm
    // ----------------------------------------------------------------------
    // The bridge, reached from the map rather than from a landing grid: the
    // party walks onto their own bridge and flies the ship by hand over
    // whatever world it is in orbit of. Nothing is landed and nothing is
    // chosen - the ship is already there, and this is the pilot getting up and
    // taking it (VoxelWorldSystem.startShipBridge).
    _takeTheHelm() {
      const VW = window.VoxelWorldSystem;
      if (!VW || !VW.startShipBridge || !this._canTakeHelm()) {
        if (window.SoundManager) SoundManager.playBuzzer();
        return;
      }
      if (!VW.startShipBridge()) {
        if (window.SoundManager) SoundManager.playBuzzer();
        return;
      }
      this._awardSpec("Spacecraft Piloting", 2);   // i18n-ignore: specialization id
      if (window.SoundManager) SoundManager.playOk();
      SceneManager.pop();
    }

    /** Keep the rail's Bridge button in step with where the ship is. */
    _refreshBridgeButton() {
      if (this._overlayUI && this._overlayUI.setBridgeOffered) {
        this._overlayUI.setBridgeOffered(this._canTakeHelm());
      }
    }

    /** Whether there is a sky to fly the ship in: it has to be in orbit of a
     *  world, parked, and not halfway across a system. */
    _canTakeHelm() {
      const ship = this.dataManager && this.dataManager.playerShip;
      return !!(ship && !ship.isMoving && ship.currentPlanet);
    }

    _liminalWalkOn(planet, gx, gy, moonOf) {
      if (!GS.startLiminalWalk) return false;
      return GS.startLiminalWalk(planet, gx, gy,
        { isMoon: !!moonOf, parentPlanet: moonOf || null });
    }

    /** The same world as the liminal walk, flown over rather than walked. */
    _liminalFlybyOn(planet, gx, gy, moonOf) {
      if (!GS.startLiminalWalk) return false;
      return GS.startLiminalWalk(planet, gx, gy,
        { isMoon: !!moonOf, parentPlanet: moonOf || null, flyby: true });
    }

    // Teleport the PARTY (not the ship) to a hand-authored landing site
    // ({ name, mapId, x, y }). No procedural surface, and deliberately no EVA
    // suit swap (hardcoded locations are their own authored maps). The player is
    // marked "away from ship" so the menu's Return to Ship stays available.
    // World-map (315) sites also park the Starship near the arrival tile - see
    // GS.teleportToLandingSite.
    _teleportToLocation(loc) {
      const buzz = () => { if (window.SoundManager) SoundManager.playBuzzer(); };
      if (!(GS.teleportToLandingSite && GS.teleportToLandingSite(loc))) return buzz();
      if (window.SoundManager) SoundManager.playOk();
      SceneManager.pop(); // leave the star map
    }

    // Advance in-flight travel, place the 3D ship, drive the engine panel, and
    // refresh the selection panel's actions when arrival status changes.
    _updateShipAndTravel(delta) {
      const dm = this.dataManager;
      const ship = dm.playerShip;
      if (!ship) return;

      // Advances travel, consumes fuel and finalises arrival. The 3D ship is
      // placed from our own planet holders (below), so we deliberately skip
      // updateShipAtPlanet/updateShipOrbit (which mutate planet.phase).
      if (dm.updateShipPosition) dm.updateShipPosition();
      // Slowly tops up Hyperflux while parked at a main-sequence star with
      // Refuel engaged; a no-op the rest of the time (see canRefuel).
      if (dm.tickRefuel) dm.tickRefuel(delta);
      // An open Schrodingerite flyby runs on the same clock; completing it
      // (or breaking it off) changes what the panel may offer.
      if (dm.tickSchrodingeriteHarvest && dm.tickSchrodingeriteHarvest(delta)) {
        this._lastShipStatus = null;
        const D = GS.DataManager;
        this._toast(T('Galaxy.refuel.harvested', {
          amount: (D && D.SCHRODINGERITE_HARVEST_AMOUNT) || 3 }));
        if (window.SoundManager) SoundManager.playOk();
      }
      // How far the hull has drawn in toward the body it is drinking from:
      // eased 0..1, so the approach and the drift back out both read as a
      // manoeuvre rather than a snap (see the system view's updateShip).
      this._updateRefuelApproach(delta);

      if (this._systemView) {
        // The system-scale ship is only ever drawn in the star system the ship
        // is actually in. Previously the fall-through drew a "parkedStar" ship in
        // EVERY system the player opened, so a ghost ship appeared at systems it
        // had never travelled to. Anything else (a different system on screen, or
        // an inter-system flight -- which the galaxy scale renders) hides it.
        const here = this._system && this._system.name;
        const inThisSystem = !!here && ship.currentSystem === here;
        const intraSystemTravel = ship.isMoving && inThisSystem &&
          ship.targetSystem === here;
        let state;
        if (intraSystemTravel) {
          state = {
            mode: "traveling",
            fromName: ship.currentPlanet,
            toName: ship.targetPlanet,
            progress: this._travelProgress(ship),
          };
        } else if (!ship.isMoving && inThisSystem && ship.currentPlanet) {
          state = { mode: "parkedPlanet", planetName: ship.currentPlanet };
        } else if (!ship.isMoving && inThisSystem) {
          // Parked at a named companion/donor star of an N-ary system orbits
          // that star; otherwise the ship drifts around the primary.
          state = {
            mode: "parkedStar",
            starName: (ship.parkedBody && ship.parkedBody.name !== here)
              ? ship.parkedBody.name : null,
            // Drawing fuel (or skimming a hole for Schrodingerite) flies the
            // hull in close and back out again when the run ends.
            approach: this._refuelApproach || 0,
            // A harvest is a fast low pass, not the lazy parking drift.
            approachSpin: (dm.isHarvestingSchrodingerite &&
              dm.isHarvestingSchrodingerite()) ? 1 : 0,
          };
        } else {
          state = { mode: "hidden" };
        }
        this._systemView.updateShip(state, this._elapsed);
        // The hull is 1 km-tiny (SHIP_WORLD_LENGTH), so framing the whole
        // system (or a planet) leaves it a sub-pixel speck; fade in the same
        // distance-scaled beacon the galaxy-scale ship already uses once the
        // camera (wherever it is actually looking) is far from the SHIP
        // itself, hidden again once it's close enough to read the hull.
        // NOTE: no lower clamp on `s` - beaconGroup.scale.setScalar(s) makes
        // the marker's WORLD size proportional to d, so its apparent SCREEN
        // size (worldSize/d) stays constant at any distance past beaconNear.
        // The previous Math.max(1, ...) floor pinned the world size instead,
        // which made the apparent size blow up as 1/d on approach - the ring
        // ballooning to dwarf whatever the camera was actually looking at
        // once it drifted within a beaconRef or so of the ship.
        if (this._systemView.setShipBeaconScale && state.mode !== "hidden") {
          if (!this._shipBeaconScratch) this._shipBeaconScratch = new THREE.Vector3();
          this._systemView.shipGroup.getWorldPosition(this._shipBeaconScratch);
          const d = this._camera.position.distanceTo(this._shipBeaconScratch);
          const shipLen = (GS.Scene3DBodies && GS.Scene3DBodies.SHIP_WORLD_LENGTH) || 0.3;
          const beaconNear = shipLen * 8, beaconRef = 70;
          const s = d <= beaconNear ? 0 : Math.min(160, d / beaconRef);
          this._systemView.setShipBeaconScale(s);
        }
      }

      if (this._scale === SCALE_GALAXY && this._galaxyView && this._galaxyShip) {
        if (!this._scratchA) {
          this._scratchA = new THREE.Vector3();
          this._scratchB = new THREE.Vector3();
          this._scratchC = new THREE.Vector3();
        }
        let pos = null;
        let travellingHere = false;
        if (ship.isMoving && ship.targetSystem) {
          const from = dm.getSystem(ship.currentSystem);
          const to = dm.getSystem(ship.targetSystem);
          if (from && to) {
            // Straight line in 3D between the two star positions: the ship
            // interpolates linearly from departure star to destination star and
            // its hull is aimed straight down that vector.
            const a = this._galaxyView.worldOf(from, this._scratchA);
            const b = this._galaxyView.worldOf(to, this._scratchB);
            this._scratchC.copy(b); // keep an untouched copy of the destination
            pos = a.lerp(b, this._travelProgress(ship));
            this._galaxyShip.orient(this._scratchC);
            travellingHere = true;
          }
        }
        if (!pos) {
          const cur = dm.getSystem(ship.currentSystem);
          if (cur) pos = this._galaxyView.worldOf(cur, this._scratchA);
        }
        if (pos) this._galaxyShip.group.position.copy(pos);
        this._galaxyShip.update(this._elapsed, travellingHere);
        // Grow the beacon with camera distance so the ship stays findable from
        // a whole-galaxy zoom-out down to a close pass: scaling its WORLD size
        // by distance/beaconRef (no lower clamp) keeps its apparent SCREEN
        // size constant at any distance past beaconNear, rather than the
        // previous floor of "at least base size", which blew the apparent
        // size up as 1/distance and could balloon to swallow whatever the
        // camera was actually looking at once it drifted near the ship.
        // Measured off the real camera-to-ship distance (not the orbit rig's
        // distance to whatever else might be focused/selected), so a star
        // targeted elsewhere in the galaxy never leaves the marker oversized.
        if (this._galaxyShip.setBeaconScale) {
          if (!this._galaxyBeaconScratch) this._galaxyBeaconScratch = new THREE.Vector3();
          this._galaxyShip.group.getWorldPosition(this._galaxyBeaconScratch);
          const d = this._camera.position.distanceTo(this._galaxyBeaconScratch);
          const beaconRef = 70, beaconNear = 4;
          const s = d <= beaconNear ? 0 : Math.min(160, d / beaconRef);
          this._galaxyShip.setBeaconScale(s);
        }

        // While the ship crosses the galaxy, glide the camera focus along with
        // it so the straight-line flight is actually visible instead of
        // happening off-screen. Following starts when a trip begins and is
        // cancelled the moment the player grabs the view, so it never fights a
        // manual drag.
        if (travellingHere) {
          if (!this._wasTravellingGalaxy) this._followShip = true;
          if (this._orbit && this._orbit.dragging) this._followShip = false;
          if (this._followShip && pos && this._mode === "orbit") {
            this._rig.setTargetFocus(pos);
          }
        } else {
          this._followShip = false;
        }
        this._wasTravellingGalaxy = travellingHere;
      }

      // The ship is now placed for this frame, so the Ship-button follow can
      // read its live position.
      this._updateShipCamFollow();

      if (ship.isMoving) {
        this._overlayUI.showSpeed($gameVariables.value(94) || 1, this._travelEta(ship));
      } else this._overlayUI.hideSpeed();

      const statusKey = (ship.isMoving ? 1 : 0) + "|" + (ship.currentPlanet || "") + "|" +
        (ship.currentSystem || "") + "|" + ((ship.parkedBody && ship.parkedBody.name) || "") +
        // Engaging the pumps or opening a harvest flyby changes which actions
        // the panel may offer, so both belong in the key that refreshes it.
        "|" + (ship.isRefueling ? 1 : 0) + "|" + (ship.harvestRun ? 1 : 0);
      if (statusKey !== this._lastShipStatus) {
        this._lastShipStatus = statusKey;
        this._refreshSelection();
      }
      const cur = this._currentSystem();
      this._overlayUI.setHomeSystem(cur ? cur.name : null);
      this._refreshBridgeButton();

      // Fuel gauges + SB-Bridge availability.
      const D = GS.DataManager;
      if (this._overlayUI.setFuels) {
        this._overlayUI.setFuels({
          hyperflux: dm.getHyperflux ? dm.getHyperflux() : null,
          hyperfluxMax: (D && D.HYPERFLUX_MAX) || 92000,
          schrodingerite: dm.getSchrodingerite ? dm.getSchrodingerite() : null,
          schrodingeriteMax: (D && D.SCHRODINGERITE_MAX) || 92,
          mapFuel: $gameVariables.value(95) || 0,
          mapFuelMax: 10000,
        });
      }
      if (this._overlayUI.setRefuel) {
        this._overlayUI.setRefuel(this._refuelHudState(this._refuelPlan()));
      }
      if (this._overlayUI.setSbBridge) {
        const bridgeSys = this._selectedSystemForBridge();
        const infinite = !!(GS.isInfiniteFuel && GS.isInfiniteFuel());
        const canBridge = !!bridgeSys && !this._warping &&
          !(ship && ship.currentSystem === bridgeSys.name) &&
          (infinite || (dm.getSchrodingerite ? dm.getSchrodingerite() >= 1 : false));
        this._overlayUI.setSbBridge(canBridge, bridgeSys ? bridgeSys.name : null);
      }
      if (this._overlayUI.setReturnEarthOptions) {
        const infinite = !!(GS.isInfiniteFuel && GS.isInfiniteFuel());
        const atEarth = ship.currentSystem === "Sol" && ship.currentPlanet === "Earth";   // i18n-ignore: system / body id
        const canCourse = !ship.isMoving && this._isInMilkyWay() && !atEarth;
        const canEb = !this._warping && !atEarth &&
          (infinite || (dm.getSchrodingerite ? dm.getSchrodingerite() >= 1 : false));
        this._overlayUI.setReturnEarthOptions(canCourse, canEb);
      }
    }

    // Seconds left on the current leg, mirroring ShipBackground.travelEta's
    // real-time maths (same warp-speed variable, same 95%-of-route arrival
    // rule in DataManager.updateShipPosition) so the Engines panel's ETA
    // agrees with the walk-around ship's own travel countdown.
    _travelEta(ship) {
      if (!ship || !ship.isMoving) return null;
      const speed = Math.max(1, $gameVariables.value(94) || 1);
      const total = ship.travelDistance > 0 ? (ship.travelDistance * 0.95) / speed : 0;
      const elapsed = ship.departureTime ? (Date.now() - ship.departureTime) / 1000 : 0;
      return Math.max(0, total - elapsed);
    }

    // Where along the plotted route the craft is drawn, 0..1. Measured from the
    // trip's origin, NOT from departurePosition: the warp slider rebases the
    // latter to wherever the ship is at the moment it moves (see
    // DataManager.recalculateDepartureOnSpeedChange), which would read as a
    // fresh departure and snap the ship back to the system it left.
    _travelProgress(ship) {
      if (!ship) return 0;
      const dm = this.dataManager;
      if (dm && typeof dm.travelProgress === "function") return dm.travelProgress(ship);
      const origin = ship.originPosition || ship.departurePosition;
      const span = ship.originDistance || ship.travelDistance;
      if (!origin || !span) return 0;
      const dx = ship.position.x - origin.x;
      const dy = ship.position.y - origin.y;
      const dz = ship.position.z - origin.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      return Math.max(0, Math.min(1, d / span));
    }

    /** Radius of whatever the current view is drawing, in world units. */
    _viewRadius() {
      if (this._scale === SCALE_SYSTEM) {
        return this._systemOuter || (this._systemView && this._systemView.outerRadius) || 0;
      }
      return (this._cosmicView && this._cosmicView.radius) || 0;
    }

    // How close counts as zooming *into* the current selection. Views with a
    // scale below them use their own band edge, so nothing changes there; the
    // views that bottom out (a system, a procedural galaxy, a web cluster) get
    // one only while something enterable is selected, leaving free zooming
    // everywhere else untouched.
    _selectionEnterDist() {
      if (this._inDist) return this._inDist;
      if (this._planetFocus) return 0; // already as deep as a system goes
      const r = this._viewRadius();
      return r ? Math.max(this._rig.minDistance * 1.8, r * 0.2) : 0;
    }

    /**
     * What zooming right in on the current selection should do, as a closure,
     * or null when the selection is not something to go inside of: a cosmic-web
     * node opens its cluster, a named galaxy its interior, a star its system, a
     * planet (or a moon's parent planet) its own close-up view. This is the
     * zoom ladder's counterpart to the doorway steps in _zoomToTarget, which
     * Space takes; here the gesture is the wheel (or L2/R2) instead.
     */
    _selectionEntry() {
      const t = this._target;
      if (t && t.nodeIndex != null && this._scale === SCALE_FILAMENTS && !this._webCluster) {
        const index = t.nodeIndex;
        return () => this._enterWebCluster(index);
      }
      const pick = this._resolveTarget();
      if (!pick) return null;
      if (pick.kind === "galaxy" && !this._galaxyFocus) {
        const name = (pick.data && pick.data.name) || (t && t.name);
        if (!name) return null;
        if (name === "Milky Way") return () => this._enterScale(SCALE_GALAXY, this._focusSystem);   // i18n-ignore: galaxy id
        const tier = pick.data && pick.data.tier;
        return () => this._enterGalaxyFocus(name, null, tier);
      }
      if (pick.kind === "star") {
        const sys = this._systemToEnter();
        return sys ? () => this._enterScale(SCALE_SYSTEM, sys) : null;
      }
      if (this._scale === SCALE_SYSTEM && !this._planetFocus) {
        // A moon's doorway is its parent planet: focusing that is what reveals
        // the whole moon system the moon belongs to.
        const data = pick.kind === "planet" ? pick.data
          : (pick.kind === "moon" ? pick.planet : null);
        if (data) {
          return () => { this._focusPlanet({ kind: "planet", data }); this._boostCamera(); };
        }
      }
      return null;
    }

    // Continuous zoom ladder: zooming out past _outDist steps up a scale,
    // zooming in past _inDist steps down (toward the home system). The player
    // has to *hold* the camera past the threshold for LADDER_DWELL seconds, and
    // no further step can fire for LADDER_COOLDOWN after one does, so brushing
    // the edge of a band while zooming never rips through several scales.
    _checkScaleTransition(dt) {
      // The tour drives the rig's distance itself, close in on tiny moons and
      // wide out on companion stars; none of that is a real zoom gesture, so
      // it must never trip the scale ladder.
      if (this._tour) return;
      const td = this._rig.targetDistance;
      // Zooming right in while something is selected goes INTO it, at every
      // scale and inside the views that have no band below them, so the wheel
      // (or L2/R2) reaches the next level on its own instead of only Space.
      if (this._ladderCooldown <= 0) {
        const enterD = this._selectionEnterDist();
        if (enterD && td < enterD) {
          const enter = this._selectionEntry();
          if (enter) {
            this._ladderHold += dt;
            if (this._ladderHold >= LADDER_DWELL) {
              this._ladderHold = 0;
              this._ladderCooldown = LADDER_COOLDOWN;
              enter();
            }
            return;
          }
        }
      }
      // While focused on a planet, zooming out far enough exits focus back to
      // the whole-system view instead of stepping up to the galaxy scale. The
      // player is already gliding the camera outward when this fires, so drop
      // the tracking state only (restoreFraming: false) rather than snapping
      // the target distance to the standard whole-system framing - that jump
      // used to cut the gradual zoom-out short with a sudden re-frame.
      if (this._planetFocus) {
        if (td > this._planetFocus.outDist) {
          this._clearPlanetFocus(false);
          // The cooldown alone isn't enough: the just-cleared distance (barely
          // past the planet's own small outDist) is still well inside the
          // system-wide entry band _selectionEnterDist() computes next frame,
          // so as long as the planet stayed the persistent target, the
          // enter-ladder above would fire again once the cooldown lapsed and
          // snap straight back into focus - a slow zoom-out could never
          // actually get past a mid zoom level. Dropping the target too means
          // there is nothing left for _selectionEntry() to re-enter.
          this._setTarget(null);
          this._selectedPick = null;
          if (this._overlayUI) this._overlayUI.deselect();
          this._ladderHold = 0;
          this._ladderCooldown = LADDER_COOLDOWN;
        }
        return;
      }
      // Inside a procedural galaxy, zooming out returns to whatever view we
      // dived in from rather than stepping the scale ladder.
      if (this._galaxyFocus) {
        if (this._ladderCooldown > 0) { this._ladderCooldown -= dt; this._ladderHold = 0; return; }
        this._ladderHold = (this._outDist && td > this._outDist) ? this._ladderHold + dt : 0;
        if (this._ladderHold >= LADDER_DWELL) this._exitGalaxyFocus();
        return;
      }
      // Inside a cosmic-web cluster, zooming out returns to the web instead of
      // stepping the scale ladder (the cluster IS the filament scale).
      if (this._webCluster) {
        if (this._ladderCooldown > 0) { this._ladderCooldown -= dt; this._ladderHold = 0; return; }
        this._ladderHold = (this._outDist && td > this._outDist) ? this._ladderHold + dt : 0;
        if (this._ladderHold >= LADDER_DWELL) this._exitWebCluster();
        return;
      }
      if (this._ladderCooldown > 0) {
        this._ladderCooldown -= dt;
        this._ladderHold = 0;
        return;
      }
      const outPast = !!(this._scale < MAX_SCALE && this._outDist && td > this._outDist);
      const inPast = !!(this._scale > SCALE_SYSTEM && this._inDist && td < this._inDist);
      // Zooming in where this level has nowhere to go: hold the camera at the
      // band edge from the moment it crosses, rather than letting the zoom run
      // on and snapping it back out once the dwell lapsed - that late snap was
      // the camera being shoved backwards in the middle of the gesture.
      const descend = inPast ? this._ladderDescent() : null;
      if (inPast && !descend) {
        this._rig.setTargetDistance(this._inDist);
        this._ladderHold = 0;
        return;
      }
      this._ladderHold = (outPast || inPast) ? this._ladderHold + dt : 0;
      if (this._ladderHold < LADDER_DWELL) return;
      this._ladderHold = 0;
      this._ladderCooldown = LADDER_COOLDOWN;

      if (outPast) {
        // Zooming out of a system that belongs to a procedural (non-Milky-Way)
        // galaxy returns to THAT galaxy's own cosmic view, not the hardcoded
        // Milky Way the generic SYSTEM -> scale+1 step would otherwise build
        // (see _returnGalaxyFocus / _enterGalaxyFocus's `forced` param).
        const rgf = this._returnGalaxyFocus;
        const curName = this._system && this._system.name;
        const stillThere = rgf && typeof curName === "string" &&
          curName.startsWith("GX.") && parseInt(curName.split(".")[1], 10) === rgf.seed;
        if (this._scale === SCALE_SYSTEM && stillThere) {
          this._reenterGalaxyFocus(rgf);
        } else {
          this._enterScale(this._scale + 1, this._focusSystem);
        }
      } else if (descend) {
        descend();
      }
    }

    /**
     * What zooming right in past `_inDist` should do at the current scale, as
     * a closure, or null when this level has no way down at all (then the band
     * edge is simply a wall the camera stops at).
     *
     * The galaxy scale drops into the star the camera has drawn in on. The far
     * cosmic scales are nested views of the same cosmos, so zooming in steps
     * down one of them - which is how the player gets back after zooming all
     * the way out; they used to be dead ends that only ever pushed the camera
     * back out. The local group is the exception: its only interior is the
     * hardcoded Milky Way (issue #154), so there the focus has to actually be
     * drawn in on a galaxy for anything to happen.
     */
    _ladderDescent() {
      if (this._scale <= SCALE_SYSTEM) return null;
      if (this._scale === SCALE_GALAXY) {
        const sys = this._systemToEnter();
        return sys ? () => this._enterScale(SCALE_SYSTEM, sys) : null;
      }
      if (this._scale === SCALE_LOCAL_GROUP) return this._nearestCosmicEntry();
      const next = this._scale - 1;
      return () => this._enterScale(next, this._focusSystem);
    }

    /**
     * The galaxy the orbit focus has been drawn in on at the local-group scale,
     * as an entry closure: the cosmic counterpart of _systemToEnter, where
     * zooming in on where the camera already sits goes there. The home marker
     * hands off to the real Milky Way interior, any other named galaxy to its
     * own procedural one. Nothing near the focus returns null, so zooming into
     * empty space still just clamps.
     */
    _nearestCosmicEntry() {
      if (!this._cosmicView || this._galaxyFocus || this._webCluster) return null;
      const reach = this._inDist || 0;
      if (!reach) return null;
      if (!this._scratchCosmicEntry) this._scratchCosmicEntry = new THREE.Vector3();
      const wp = this._scratchCosmicEntry;
      let best = null, bestD = reach;
      for (const p of (this._pickTargets || [])) {
        if (!p || !p.object || !p.data || !p.data.name) continue;
        if (p.kind !== "galaxy" && !p.data.home) continue;
        p.object.getWorldPosition(wp);
        const d = this._rig.focus.distanceTo(wp);
        if (d < bestD) { bestD = d; best = p; }
      }
      if (!best) return null;
      const name = best.data.name;
      if (best.data.home || name === "Milky Way") {   // i18n-ignore: galaxy id
        return () => this._enterScale(SCALE_GALAXY, this._focusSystem);
      }
      return () => this._enterGalaxyFocus(name, null, best.data && best.data.tier);
    }

    // ----------------------------------------------------------------------
    // Loop
    // ----------------------------------------------------------------------
    _loop(now) {
      if (!this._active) return;
      this._animId = requestAnimationFrame(this._loop);

      // Freeze + hide while another scene is on top; restore on return.
      if (SceneManager._scene !== this) {
        if (!this._suspended) {
          this._suspended = true;
          if (this._overlayEl) this._overlayEl.style.display = "none";
        }
        return;
      } else if (this._suspended) {
        this._suspended = false;
        if (this._overlayEl) this._overlayEl.style.display = "";
        this._lastTime = null;
      }

      if (this._lastTime === null) { this._lastTime = now; return; }
      const delta = Math.min((now - this._lastTime) / 1000, 0.1);
      this._lastTime = now;

      this._elapsed += delta;

      // A throw anywhere in the per-frame update used to take the renderer with
      // it: the loop kept spinning but nothing after the throw ever ran, so the
      // map froze with a dead HUD. Contain it, log it once, and keep drawing.
      try {
        this._updateFrame(delta);
      } catch (err) {
        if (!this._frameErrorLogged) {
          this._frameErrorLogged = true;
          console.error("[GalaxySim3D] frame update failed:", err);
        }
      }

      // Never render on a lost GL context; the loop keeps running so it resumes
      // automatically once the context is restored.
      if (this._contextLost) return;
      // A black hole system, looked at straight on, takes the gravitational
      // lensing path instead of the plain render (see _activeLens).
      const lens = this._activeLens();
      if (lens) {
        try { this._renderLensed(lens); return; }
        catch (e) {
          // One failure retires the pass for the rest of the session rather
          // than throwing (and rebuilding the render targets) every frame.
          console.warn("[GalaxySim3D] lensing pass disabled:", e);
          this._lensFailed = true;
          this._disposeLens();
        }
      }
      // The galaxy scene renders clean (no PSX post-processing) so the star map
      // and planets stay crisp.
      this._renderer.render(this._scene, this._camera);
    }

    // ----------------------------------------------------------------------
    // Gravitational lensing (ported from Titlescreen.js's Hyperverse
    // background - see GalaxySim_Scene3D_Cosmos.LENS_VERT/LENS_FRAG for the
    // shader itself and the reasoning behind it).
    // ----------------------------------------------------------------------

    // Only while a black-hole system's own hole sits (as good as) dead centre
    // in frame: the shader has no notion of where the hole is on screen, it
    // always bends the exact middle, so this is the one framing the whole
    // technique depends on - not "which mode is the camera in" (orbit, ship
    // follow, planet focus...), which is why it is checked directly off the
    // hole's own projected screen position rather than off any of those.
    _activeLens() {
      if (this._lensFailed) return null;
      if (this._scale !== SCALE_SYSTEM || !this._systemView) return null;
      const info = this._systemView.lensInfo;
      if (!info || !info.object) return null;
      if (!this._lensScratch) this._lensScratch = new THREE.Vector3();
      const p = this._lensScratch;
      info.object.getWorldPosition(p);
      const dist = this._camera.position.distanceTo(p);
      if (dist <= 0) return null;
      p.project(this._camera);
      // Behind the camera, or off-centre by more than ~3% of the frame:
      // fall back to the plain render rather than bending the wrong patch
      // of sky.
      if (p.z > 1 || Math.abs(p.x) > 0.03 || Math.abs(p.y) > 0.03) return null;
      const vFovHalf = (this._camera.fov * Math.PI) / 360;
      const screenR = info.horizonR / (2 * dist * Math.tan(vFovHalf));
      if (!(screenR > 0)) return null;
      return { screenR, massK: info.massK, spin: info.spin || 0 };
    }

    // Lazily build (and resize) the two render targets and the fullscreen
    // quad the lensing pass needs. One quad and one scene are shared: the
    // material is swapped between the lens shader and the final blit.
    _lensCtx(w, h) {
      const Cosmos = GS.Scene3DCosmos;
      let L = this._lens;
      if (!L) {
        const lensMat = new THREE.ShaderMaterial({
          uniforms: {
            tDiffuse: { value: null },
            uAspect: { value: 1 },
            uHorizon: { value: 0.1 },
            uEinstein: { value: 0.1 },
            uSpin: { value: 0 },
          },
          vertexShader: Cosmos.LENS_VERT,
          fragmentShader: Cosmos.LENS_FRAG,
          depthTest: false, depthWrite: false, transparent: false,
        });
        lensMat.blending = THREE.NoBlending;
        const blitMat = new THREE.MeshBasicMaterial({
          map: null, depthTest: false, depthWrite: false, transparent: false,
        });
        blitMat.blending = THREE.NoBlending;
        const geo = new THREE.PlaneGeometry(2, 2);
        const quad = new THREE.Mesh(geo, lensMat);
        quad.frustumCulled = false;
        const scene = new THREE.Scene();
        scene.add(quad);
        const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
        cam.position.z = 1;
        L = this._lens = { geo, quad, scene, cam, lensMat, blitMat, sky: null, comp: null, w: 0, h: 0 };
      }
      if (L.w !== w || L.h !== h) {
        if (L.sky) L.sky.dispose();
        if (L.comp) L.comp.dispose();
        L.sky = new THREE.WebGLRenderTarget(w, h, {
          minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
          format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false,
        });
        L.comp = new THREE.WebGLRenderTarget(w, h, {
          minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
          format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false,
        });
        L.lensMat.uniforms.tDiffuse.value = L.sky.texture;
        L.blitMat.map = L.comp.texture;
        L.blitMat.needsUpdate = true;
        L.w = w; L.h = h;
      }
      return L;
    }

    // Three passes: sky alone -> bent sky -> hole (and everything else) on
    // top -> present. Every model in the scene except the lensed hole itself
    // is drawn into the "sky" pass, so a planet or another ship crossing
    // behind the hole is bent along with the starfield, not left floating
    // over it.
    _renderLensed(lens) {
      const r = this._renderer;
      const info = this._systemView.lensInfo;
      const holeGroup = info && info.object;
      const cw = r.domElement.width, ch = r.domElement.height;
      const L = this._lensCtx(Math.max(1, cw), Math.max(1, ch));

      const u = L.lensMat.uniforms;
      u.uAspect.value = ch ? cw / ch : 1;
      u.uHorizon.value = lens.screenR;
      u.uEinstein.value = lens.screenR * Math.sqrt(lens.massK);
      u.uSpin.value = lens.spin || 0;

      // Sibling state step 3 hides and step 3 restores - hoisted so the
      // `finally` below can put everything back even if a render call
      // throws partway through, rather than leaving bodies stuck invisible
      // for the rest of the session.
      const rootGroup = this._systemView.group;
      const hidden = [];
      const bgVisible = !!(this._background && this._background.visible);
      try {
        // 1. Everything except the hole itself, on its own.
        if (holeGroup) holeGroup.visible = false;
        r.setRenderTarget(L.sky);
        r.clear();
        r.render(this._scene, this._camera);
        if (holeGroup) holeGroup.visible = true;

        // 2. Bend it into the composite target.
        L.quad.material = L.lensMat;
        r.setRenderTarget(L.comp);
        r.clear();
        r.render(L.scene, L.cam);

        // 3. The hole alone, unwarped, over the bent sky - every sibling
        //    inside the system (planets, orbit lines, the ship...) and the
        //    background starfield are already in there, lensed, from step 2,
        //    so hide them for this pass rather than draw them twice. The
        //    hole itself sits one level down (root.add(blackHole.group)),
        //    which is why this walks the system root's children rather than
        //    the scene's own (those would hide the whole system, hole
        //    included, since it is nested inside that one child).
        if (rootGroup) {
          rootGroup.children.forEach((c) => {
            if (c !== holeGroup && c.visible) { hidden.push(c); c.visible = false; }
          });
        }
        if (this._background) this._background.visible = false;
        r.autoClearColor = false;
        r.render(this._scene, this._camera);
        r.autoClearColor = true;
        hidden.forEach((c) => { c.visible = true; });
        hidden.length = 0;
        if (this._background) this._background.visible = bgVisible;

        // 4. Present.
        r.setRenderTarget(null);
        L.quad.material = L.blitMat;
        r.render(L.scene, L.cam);
      } finally {
        if (holeGroup) holeGroup.visible = true;
        hidden.forEach((c) => { c.visible = true; });
        if (this._background) this._background.visible = bgVisible;
        r.autoClearColor = true;
        r.setRenderTarget(null);
        L.quad.material = L.blitMat;
      }
    }

    _disposeLens() {
      const L = this._lens;
      if (!L) return;
      this._lens = null;
      try {
        if (L.sky) L.sky.dispose();
        if (L.comp) L.comp.dispose();
        if (L.geo) L.geo.dispose();
        if (L.lensMat) L.lensMat.dispose();
        if (L.blitMat) L.blitMat.dispose();
      } catch (e) { /* ignore */ }
    }

    _updateFrame(delta) {
      // Decay the Space-jump easing boost back to the normal gliding zoom.
      if (this._camBoost > 0) {
        this._camBoost -= delta;
        if (this._camBoost <= 0) { this._rig.zoomEase = 5; this._rig.ease = 9; }
      }

      if (this._mode === "orbit") {
        this._orbit.update(delta);
        if (this._tour) this._updateGrandTour(delta);
        this._rig.update(delta); // applies orbit positioning to the camera
      } else {
        this._fly.update(delta); // drives the camera directly; rig not applied
      }

      if (this._systemView) {
        this._systemView.animate(this._elapsed);
        // Bodies are sized to physical scale, so give them an apparent-size
        // floor in pixels once the camera is far enough for them to vanish.
        if (this._systemView.updateApparentSizes) {
          this._systemView.updateApparentSizes(this._camera.position, this._fovK());
        }
      }
      if (this._galaxyView) {
        this._galaxyView.animate(this._elapsed);
        // Star halos fade in only as the camera pulls back, so up close each
        // system stays a single distinguishable point.
        if (this._galaxyView.setZoomDistance) {
          this._galaxyView.setZoomDistance(this._rig.distance);
        }
      }
      if (this._lazyField) this._lazyField.update(this._rig.focus, this._rig.distance);
      if (this._cosmicView) {
        this._cosmicView.animate(this._elapsed);
        // Procedural galaxies fade their nucleus bloom on approach, same as
        // the home galaxy's own bloom (see buildProceduralGalaxy).
        if (this._cosmicView.setZoomDistance) {
          this._cosmicView.setZoomDistance(this._rig.distance);
        }
      }
      this._updatePlanetFocus();
      this._updateShipAndTravel(delta);
      this._updateStripMining(delta);
      this._checkScaleTransition(delta);

      // Keep the star dome centred on the camera (an infinite sky at any zoom)
      // with a gentle parallax drift.
      if (this._background) {
        this._background.position.copy(this._camera.position);
        this._background.rotation.y += delta * 0.002;
      }

      // No hover/click picking during the Grand Tour: it is a hands-off
      // slideshow, not another way to select a body mid-flight.
      if (!this._tour) this._updatePicking();
      // Time at the eyepiece counts: a slow drip of Astronomy for whoever is
      // actually reading the sky (see SpecializationXP.tick).
      if (window.SpecializationXP) {
        window.SpecializationXP.tick("Astronomy", 1, 45, { key: "starmap" });
      }
      if (this._overlayUI) {
        this._overlayUI.setZoomFraction(this._rig.zoomFraction());
        this._overlayUI.update();
      }

      // Decay the scale-transition fade plate. Quick on purpose: a short blink
      // reads as a continuation of the zoom rather than a deliberate pause.
      if (this._fadeAlpha > 0) {
        this._fadeAlpha = Math.max(0, this._fadeAlpha - delta * 4.0);
        if (this._fadeEl) this._fadeEl.style.opacity = this._fadeAlpha;
      }
    }

    // RPG-Maker-driven update: keeps Input/SceneManager ticking and handles
    // exit. Rendering itself runs on the rAF loop above.
    update() {
      super.update();
      if (this._failed) { this.popScene(); return; }
      if (typeof Input === "undefined") return;

      // Grand Tour lets the camera be looked around/zoomed freely (see
      // _startGrandTour), but the only DIRECTIONAL input it recognises is
      // left/right (keyboard, A/D, and a pad's d-pad/left-stick/LB-RB all
      // resolve to the same "left"/"right" - see input-currentstate-and-wasd)
      // to manually skip to the previous/next stop, plus the cancel that ends it.
      if (this._tour) {
        if (Input.isTriggered("cancel")) { this._endGrandTour(); return; }
        if (Input.isTriggered("left")) {
          this._advanceGrandTour(-1);
          if (window.SoundManager) SoundManager.playCursor();
        } else if (Input.isTriggered("right")) {
          this._advanceGrandTour(1);
          if (window.SoundManager) SoundManager.playCursor();
        }
        return;
      }

      const ov = this._overlayUI;
      // Landing-grid picker is a full modal: take over input completely while
      // it's open (arrow keys move the cursor cell instead of the camera/focus
      // ring) and skip the rest of update() so orbit controls stay frozen.
      if (ov && ov.isLandingGridOpen && ov.isLandingGridOpen()) {
        if (Input.isTriggered("cancel")) { ov.hideLandingGrid(); return; }
        if (Input.isTriggered("ok")) { ov.confirmLandingGridCursor(); return; }
        if (Input.isTriggered("up")) ov.moveLandingGridCursor(0, -1);
        else if (Input.isTriggered("down")) ov.moveLandingGridCursor(0, 1);
        else if (Input.isTriggered("left")) ov.moveLandingGridCursor(-1, 0);
        else if (Input.isTriggered("right")) ov.moveLandingGridCursor(1, 0);
        return;
      }
      // The servicing bay is a modal panel: Esc closes it, and its buttons take
      // the focus ring (which already spans every visible panel).
      if (ov && ov.isServiceOpen && ov.isServiceOpen()) {
        if (Input.isTriggered("cancel")) { ov.hideService(); return; }
      }
      // The anomaly log takes input outright: a branch has to be chosen, and Esc
      // only closes it once the encounter has actually ended.
      if (ov && ov.isAnomalyOpen && ov.isAnomalyOpen()) {
        const view = GS.Anomaly ? GS.Anomaly.view() : null;
        // The die changes hands on the shoulder buttons (or Tab), the same
        // companion-cycling gesture the map presenter honours.
        if (Input.isTriggered("pageup") || Input.isTriggered("pagedown") || Input.isTriggered("tab")) {
          if (GS.Anomaly && GS.Anomaly.cycleQuester && view && !view.done) {
            GS.Anomaly.cycleQuester(Input.isTriggered("pageup") ? -1 : 1);
            if (window.SoundManager) SoundManager.playCursor();
            ov.renderAnomaly(GS.Anomaly.view());
          }
          return;
        }
        if (Input.isTriggered("cancel")) {
          if (!view || view.done) this._closeAnomaly();
          return;
        }
        if (Input.isTriggered("ok")) { ov.activateFocus(); return; }
        if (Input.isTriggered("up")) ov.moveFocus("up");
        else if (Input.isTriggered("down")) ov.moveFocus("down");
        else if (Input.isTriggered("left")) ov.moveFocus("left");
        else if (Input.isTriggered("right")) ov.moveFocus("right");
        return;
      }
      this._refreshCatalogIfStale();
      const hasSel = !!(ov && ov.hasSelection());
      // Arrow keys / WASD drive a panel's focus ring ONLY while a panel that
      // needs them is open (selection info, catalog, or the engine panel), or
      // while a pad has explicitly asked for the toolbar (L3, see
      // _updatePadButtons). The persistent toolbar (Ship / Bioscan / Grand
      // Tour / Home / SB-Bridge / Return-to-Earth) is otherwise unreachable
      // with nothing selected, since with nothing open the same keys instead
      // pan the camera around the space view - WASD works even out of
      // cockpit mode.
      const navActive = !!(ov && (hasSel || ov.isCatalogOpen() ||
        (ov.isServiceOpen && ov.isServiceOpen()) ||
        (ov.isMiningOpen && ov.isMiningOpen()) ||
        (ov.isSpeedShown && ov.isSpeedShown()) ||
        this._padFocusActive));
      if (this._orbit) this._orbit.suspendKeys = navActive;

      // Right-click mirrors Esc/cancel: drop whatever is selected (a body or
      // the ship marker) first, and only close the map on a second right-click
      // once nothing is left selected.
      if (Input.isTriggered("cancel") || TouchInput.isCancelled()) {
        this._padFocusActive = false;
        // Esc off the lasers first: the cut is the loudest thing on screen.
        if (this._mining) { this._stopStripMining(T('Galaxy.mining.lasersCut')); return; }
        if (this._mode === "fly") { this._toggleMode(); return; }
        if (ov && ov.isCatalogOpen()) { ov.setCatalogOpen(false); return; }
        if (this._planetFocus) { this._clearPlanetFocus(); if (ov) ov.deselect(); return; }
        if (hasSel) {
          // Esc drops the target too, so panel/reticle/Space stay consistent.
          this._setTarget(null);
          this._selectedPick = null;
          ov.deselect();
        } else this.popScene();
        return;
      }
      if (this._suppressOk > 0) this._suppressOk--;
      this._updatePadButtons(navActive);
      if (navActive) {
        // Space is the zoom-to-target key, so it must not double as "activate
        // the focused panel button" for the frames around the keydown.
        if (Input.isTriggered("ok")) {
          if (this._suppressOk <= 0) ov.activateFocus();
          // The toolbar browse-mode L3 opened is done once its target fires;
          // whatever it opened (a real panel, hasSel, etc.) takes over navActive.
          this._padFocusActive = false;
          return;
        }
        if (Input.isTriggered("up")) ov.moveFocus("up");
        else if (Input.isTriggered("down")) ov.moveFocus("down");
        else if (Input.isTriggered("left")) ov.moveFocus("left");
        else if (Input.isTriggered("right")) ov.moveFocus("right");
        return;
      }
      // Nothing open: A is Zoom To, the pad's Space. (With a panel open the
      // same button activates the focused button, handled above.) Only with
      // something selected, so the A that opened the star map cannot arrive
      // here on the first frame and buzz at an empty target.
      if (this._target && Input.isTriggered("ok") && this._suppressOk <= 0 &&
          this._mode !== "fly") {
        this._zoomToTarget();
      }
    }

    /**
     * Controller buttons the keyboard path cannot carry. Y ('menu') and LB/RB
     * ('pageup'/'pagedown') are bound to keys this scene already uses for
     * something else - Escape, and the Q/W of WASD panning - so they are read
     * raw off the pad instead of through Input.
     */
    _updatePadButtons(navActive) {
      const pad = window.AnalogStickInput;
      if (!pad || !pad.hasPad || !pad.hasPad()) return;
      const B = pad.BUTTON;
      // L3: with nothing selected and no panel open (navActive false), the
      // persistent toolbar (Ship/Bioscan/Grand Tour/Home/SB-Bridge/Return-to-
      // Earth) has no other pad entry point - the arrow keys/d-pad are busy
      // panning the camera in that state. L3 hands them to the focus ring
      // instead (see the navActive/_padFocusActive fold in update()); B/cancel
      // or actually activating a button (A/ok) hands panning back.
      if (!navActive && pad.isButtonTriggered(B.L3)) {
        this._padFocusActive = true;
        if (this._overlayUI) this._overlayUI.cycleFocus(1);
        return;
      }
      // X toggles the cockpit while orbiting, unless a panel is up (there B
      // closes it first); inside the cockpit X is the thrust boost and B is the
      // way out, so it must not double as the toggle there either.
      if (!navActive && this._mode !== "fly" && pad.isButtonTriggered(B.X)) {
        this._toggleMode();
        return;
      }
      if (pad.isButtonTriggered(B.Y)) { this._toggleCatalog(); return; }
      if (navActive && this._overlayUI && this._overlayUI.isCatalogOpen()) return;
      if (pad.isButtonTriggered(B.LB)) this._cycleSelection(-1);
      else if (pad.isButtonTriggered(B.RB)) this._cycleSelection(1);
    }

    _onResize() {
      if (!this._renderer || !this._camera) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      this._camera.aspect = w / h;
      this._camera.updateProjectionMatrix();
      this._renderer.setSize(w, h);
    }

    // ----------------------------------------------------------------------
    // Teardown
    // ----------------------------------------------------------------------
    terminate() {
      super.terminate();
      this._dispose();
    }

    _dispose() {
      this._active = false;
      // A cut in progress owns GPU resources of its own (see _buildMiningBeam).
      this._clearMiningBeam();
      this._mining = null;
      if (this._animId) cancelAnimationFrame(this._animId);
      this._animId = null;

      window.removeEventListener("resize", this._onResize);
      if (this._onModeKey) document.removeEventListener("keydown", this._onModeKey);
      const dom = this._renderer && this._renderer.domElement;
      if (dom) {
        dom.removeEventListener("mousemove", this._onPickMove);
        dom.removeEventListener("mousedown", this._onPickDown);
        dom.removeEventListener("mouseup", this._onPickUp);
        dom.removeEventListener("mouseleave", this._onPickLeave);
        if (this._onContextLost) dom.removeEventListener("webglcontextlost", this._onContextLost);
        if (this._onContextRestored) dom.removeEventListener("webglcontextrestored", this._onContextRestored);
      }
      if (this._orbit) this._orbit.disable();
      if (this._fly) this._fly.dispose();
      if (this._overlayUI) this._overlayUI.dispose();

      // Dispose every GPU resource we created, by content owner. We do NOT do
      // a blanket scene.traverse: body groups reuse the shared sphere/cloud
      // geometry owned by the offscreen Renderer3D singleton (ShipBackground
      // depends on it), so they must be released via their own dispose().
      this._teardownScaleContent();
      this._disposeLens();
      if (this._background && GS.Scene3DCosmos) {
        GS.Scene3DCosmos.disposeObject3D(this._background);
      }
      if (this._renderer) {
        // dispose() leaves the WebGL context itself alive. The browser caps how
        // many contexts may live at once and force-loses the OLDEST past the
        // cap, which is the game's own canvas: PIXI then silently stops
        // rendering and the picture freezes until the game is restarted.
        this._renderer.dispose();
        try {
          if (this._renderer.forceContextLoss) this._renderer.forceContextLoss();
        } catch (e) { /* context already gone */ }
        if (this._renderer.domElement && this._renderer.domElement.parentNode) {
          this._renderer.domElement.parentNode.removeChild(this._renderer.domElement);
        }
      }
      if (this._overlayEl && this._overlayEl.parentNode) {
        this._overlayEl.parentNode.removeChild(this._overlayEl);
      }
      document.body.style.overflow = "";

      this._scene = null;
      this._renderer = null;
      this._camera = null;
      this._rig = null;
      this._orbit = null;
      this._fly = null;
      this._background = null;
      this._overlayEl = null;
      this._fadeEl = null;
      this._overlayUI = null;
      this._systemView = null;
      this._galaxyView = null;
      this._cosmicView = null;
      this._galaxyShip = null;
      this._galaxyPoints = null;
      this._galaxyByIndex = null;
      this._system = null;
      this._focusSystem = null;
      this._target = null;
      this._webCluster = null;
      this._galaxyFocus = null;
      this._webPickCache = null;
      this._catalogEntries = null;
    }
  }

  window.Scene_AdvancedStarMap3D = Scene_AdvancedStarMap3D;
})();
