/*:
 * @target MZ
 * @plugindesc GalaxySim Scene Module - Main scene with rendering orchestration
 * @author Omni-Lex + Nocoldiz
 * @url
 * @help
 * ============================================================================
 * GalaxySim Scene Module
 * ============================================================================
 * This module contains the Scene_AdvancedStarMap class which orchestrates
 * all rendering, input handling, and UI management for the galaxy simulator.
 *
 * LOAD ORDER: Must load AFTER all other GalaxySim modules
 *
 * DEPENDENCIES:
 * - DataManager.js
 * - GalaxySim_Math.js
 * - GalaxySim_DataManager.js
 * - GalaxySim_Renderer_Planets.js
 * - GalaxySim_Renderer_Stars.js
 * - GalaxySim_Renderer_Cosmology.js
 * - GalaxySim_Renderer_Effects.js
 */

(() => {
  "use strict";

  // ============================================================================
  // Check Dependencies
  // ============================================================================

  if (!window.GalaxySim || !window.GalaxySim.Math || !window.GalaxySim.DataManager) {
    throw new Error("GalaxySim_Scene requires all GalaxySim modules to be loaded first");
  }

  // ============================================================================
  // Import from Modules
  // ============================================================================

  const { Vector2, Camera, RandomGenerator, COLORS, STAR_COLORS, PLANET_COLORS,
    parseCssColor,
    ORBIT_ZOOM_THRESHOLD, ORBIT_FULL_ALPHA_ZOOM,
    PLANET_DETAIL_THRESHOLD, PLANET_FULL_DETAIL_ZOOM,
    PLANET_MIN_SIZE, PLANET_MAX_SIZE, ECCENTRIC_ORBIT_TYPES,
    SCALE_SYSTEM, SCALE_GALAXY, SCALE_LOCAL_GROUP, SCALE_SUPERCLUSTER,
    SCALE_FILAMENTS, SCALE_OBSERVABLE, SCALE_UNIVERSE_SPHERE,
    SCALE_THRESHOLDS, LY_TO_KLY, LY_TO_MLY, LY_TO_GLY,
    KLY_TO_LY, MLY_TO_LY, GLY_TO_LY, MAP_RADIUS, SYSTEM_DENSITY,
    GALAXY_TYPE_SPIRAL, GALAXY_TYPE_BARRED_SPIRAL, GALAXY_TYPE_ELLIPTICAL,
    GALAXY_TYPE_IRREGULAR, GALAXY_TYPE_DWARF, GALAXY_TYPE_DWARF_SPHEROIDAL } = window.GalaxySim.Math;

  const StarMapDataManager = window.GalaxySim.DataManager;
  const { PlanetRenderer } = window.GalaxySim.Renderers;
  const { Particle, generateStarfield, drawStarfield, drawGrid, drawScanLines, drawGlow, drawConnectionLine } = window.GalaxySim.Renderers.Effects;
  const { generateRealisticStarName, generateBlackHoleName, determineBlackHoleType } = window.GalaxySim.Renderers.Stars;
  const { LANIAKEA_SUPERCLUSTERS, GREAT_ATTRACTOR_COORDS, OBSERVABLE_UNIVERSE_RADIUS,
    UNIVERSE_SPHERE_RADIUS, isInGreatAttractor, getGalaxyMorphologyColor } = window.GalaxySim.Renderers.Cosmology;

  // Import name generators from DataManager
  const { generateProceduralGalaxyName, generateProceduralSuperclusterName,
    generateGalaxyGroupName, generateSuperclusterName, generateProceduralLocalGroup } = window.GalaxySim.NameGenerators;

  // Import data from GalaxyData (DataManager.js)
  const STAR_TYPES = window.GalaxySim?.StarTypes || {};
  const PLANET_TYPES = window.GalaxySim?.PlanetTypes || {};
  const SYSTEMS = window.GalaxySim?.Systems || {};
  const SUPERCLUSTERS = window.GalaxySim?.Superclusters || [];
  const LOCAL_GROUP_GALAXIES = window.GalaxySim?.LocalGroupGalaxies || {};

  // Return a CSS color with the given alpha (0-1). Handles both hex strings
  // (#rgb / #rrggbb) and rgb()/rgba() strings, since theme colors get rebuilt
  // into rgb() form at runtime and a naive hex-alpha concat ("#rrggbb"+"40")
  // would produce invalid colors like "rgb(255, 204, 102)40".
  const withAlpha = (color, alpha) => {
    const c = parseCssColor(color);
    if (!c) return color;
    return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${alpha})`;
  };

  // ============================================================================
  // Scene_AdvancedStarMap Class
  // ============================================================================

  class Scene_AdvancedStarMap extends Scene_Base {
    create() {
      super.create();
      this.createCanvas();
      this.initializeMap();
      // this.setupInput(); // REMOVED - We will use MZ's built-in input
    }
    updateSpeedControls(width, height) {
      // Get internal width/height
      width = width || this.canvas.width;
      height = height || this.canvas.height;

      const isMoving =
        $gameSystem.starMapData && $gameSystem.starMapData.isShipMoving();
      if (!isMoving) {
        this.stopEnginesButton = null;
        this.decreaseSpeedButton = null;
        this.increaseSpeedButton = null;
        this.landToPlanetButton = null;
        return;
      }

      // Button dimensions
      const buttonHeight = 50;
      const speedButtonWidth = 90;
      const speedButtonSpacing = 10;
      const stopButtonWidth = 280;

      // Position stop engines button
      const stopButtonR = {
        x: 20,
        y: height - 70, // <-- MOVED TO BOTTOM (was height - 230)
        width: stopButtonWidth,
        height: buttonHeight,
      };

      this.stopEnginesButton = {
        x: stopButtonR.x,
        y: stopButtonR.y,
        width: stopButtonR.width,
        height: stopButtonR.height,
      };

      // Position speed control buttons above stop button
      const speedButtonY = stopButtonR.y - buttonHeight - 10;

      // Decrease speed button
      const decreaseR = {
        x: stopButtonR.x,
        y: speedButtonY,
        width: speedButtonWidth,
        height: buttonHeight,
      };

      this.decreaseSpeedButton = {
        x: decreaseR.x,
        y: decreaseR.y,
        width: decreaseR.width,
        height: decreaseR.height,
      };

      // Increase speed button
      const increaseR = {
        x: stopButtonR.x + speedButtonWidth + speedButtonSpacing,
        y: speedButtonY,
        width: speedButtonWidth,
        height: buttonHeight,
      };

      this.increaseSpeedButton = {
        x: increaseR.x,
        y: increaseR.y,
        width: increaseR.width,
        height: increaseR.height,
      };
    }
    updateLandButton(width, height) {
      // Get internal width/height
      width = width || this.canvas.width;
      height = height || this.canvas.height;

      // Hide the land button while travelling: only show it when the ship is
      // actually parked in orbit around a planet.
      const isMoving =
        $gameSystem.starMapData && $gameSystem.starMapData.isShipMoving();
      const isOrbiting = $gameSystem.starMapData &&
        $gameSystem.starMapData.playerShip &&
        $gameSystem.starMapData.playerShip.currentPlanet;

      if (isMoving || !isOrbiting) {
        this.landToPlanetButton = null;
        return;
      }

      // Button dimensions
      const buttonHeight = 50;
      const buttonWidth = 280;

      // Position land button at bottom left
      const landButtonR = {
        x: 20,
        y: height - 140, // Above stop engines button
        width: buttonWidth,
        height: buttonHeight,
      };

      this.landToPlanetButton = {
        x: landButtonR.x,
        y: landButtonR.y,
        width: landButtonR.width,
        height: landButtonR.height,
      };
    }
    createCanvas() {
      // Re-derive the HUD chrome palette from the currently selected theme so
      // the viewer matches the rest of the UI (grid, panels, borders, labels).
      if (window.GalaxySim && window.GalaxySim.Math && window.GalaxySim.Math.refreshThemeColors) {
        try {
          window.GalaxySim.Math.refreshThemeColors();
        } catch (e) {
          console.warn("GalaxySim: theme color refresh failed", e);
        }
      }

      this.canvas = document.createElement("canvas");
      // Set internal resolution to match game's internal resolution
      this.canvas.width = Graphics.width;
      this.canvas.height = Graphics.height;
      this.canvas.style.position = "absolute";

      // Get the main game canvas
      const gameCanvas = Graphics._app.view;

      // Match the game canvas's style (size and position)
      // This handles scaling and letterboxing (centering)
      this.canvas.style.width = gameCanvas.style.width;
      this.canvas.style.height = gameCanvas.style.height;
      this.canvas.style.left = gameCanvas.style.left;
      this.canvas.style.top = gameCanvas.style.top;
      this.canvas.style.marginLeft = gameCanvas.style.marginLeft;
      this.canvas.style.marginTop = gameCanvas.style.marginTop;

      this.canvas.style.zIndex = "10";
      this.canvas.style.pointerEvents = "auto";
      this.canvas.style.margin = "0";
      this.canvas.style.padding = "0";
      this.canvas.style.display = "block";

      // Prevent scrollbars
      document.body.style.overflow = "hidden";

      // Append to the same parent as the game canvas
      Graphics._app.view.parentNode.appendChild(this.canvas);
      this.ctx = this.canvas.getContext("2d");

      this.ctx.imageSmoothingEnabled = true;
      this.ctx.imageSmoothingQuality = "high";

      // ----------------------------------------------------------------------
      // Pointer tracking straight off our own overlay canvas.
      // TouchInput.x/y rely on a page->canvas transform that RPG Maker caches
      // and only refreshes on a window resize, so after a layout change the
      // hit-testing would drift until the player minimized/maximized the game.
      // Reading clientX/Y against this canvas's live bounding rect every event
      // keeps selection accurate without needing that manual resize.
      // ----------------------------------------------------------------------
      this._pointer = { x: -1, y: -1 };
      this._onPointerMove = (e) => {
        const rect = this.canvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        this._pointer.x = (e.clientX - rect.left) * (this.canvas.width / rect.width);
        this._pointer.y = (e.clientY - rect.top) * (this.canvas.height / rect.height);
      };
      this.canvas.addEventListener("mousemove", this._onPointerMove);
      this.canvas.addEventListener("mousedown", this._onPointerMove);
      this.canvas.addEventListener("mouseup", this._onPointerMove);
    }

    initializeMap() {
      if (!$gameSystem.starMapData) {
        $gameSystem.starMapData = new StarMapDataManager();
      }
      this.dataManager = $gameSystem.starMapData;

      // Generate procedural systems on first map open
      if (!this.dataManager.proceduralGenerated) {
        this.dataManager.generateProceduralSystems();
      }

      this.camera = new Camera();
      this.planetRenderer = new PlanetRenderer();

      this.selectedStar = null;
      this.selectedPlanet = null;
      this.selectedPlanetSystem = null;
      this.hoveredStar = null;

      this.mousePressed = false;
      this.dragStarted = false;
      this.lastMousePos = new Vector2();

      this.time = 0;
      this.scanLineAngle = 0;
      this.selectionPulse = 0;
      this.connectionPulse = 0;

      this.infoPanelVisible = false;
      this.showSystemDetail = false;

      // Focus tracking for procedural generation
      this.focusedSupercluster = null;
      this.focusedGalaxy = null;
      this.proceduralLocalGroup = null;
      this.proceduralGalaxyData = null;
      this.showPlanetDetail = false;

      this.hoveredPlanet = null;
      this.selectedPlanet = null;
      this.selectedMoon = null;
      this.hoveredMoon = null;

      // Button references
      this.stopEnginesButton = null;
      this.decreaseSpeedButton = null;
      this.increaseSpeedButton = null;
      this.landToPlanetButton = null;

      // this.wheelDelta = 0; // REMOVED - Not needed

      // Multi-scale universe tracking
      this.currentScale = SCALE_GALAXY; // Start in galaxy view
      this.previousScale = SCALE_GALAXY;

      // Cosmic web caching for performance
      this.cosmicWebNodesCache = null;
      this.cosmicWebNodeConnectionsCache = new Map(); // Cache nearest neighbors
      this.lastCameraState = null;

      // Local Group filament caching for performance
      this.localGroupFilamentCache = new Map();
      this.lastLocalGroupCameraState = null;

      // Center on current system (or Sol if no current system)
      const currentSystemName = this.dataManager.playerShip?.currentSystem || "Sol";
      const currentSystem = this.dataManager.getSystem(currentSystemName);

      // Start centered on the current system but DESELECTED in a galaxy view.
      // The current system is no longer auto-focused/zoomed; double-click a
      // star to zoom into it.
      const GALAXY_START_ZOOM = 1.0;
      const focusSystem = currentSystem || this.dataManager.getSystem("Sol");
      if (focusSystem) {
        this.camera.setTarget(focusSystem.position.x, focusSystem.position.y);
        this.camera.position = new Vector2(focusSystem.position.x, focusSystem.position.y);
        this.camera.zoom = GALAXY_START_ZOOM;
        this.camera.targetZoom = GALAXY_START_ZOOM;
        this.currentScale = SCALE_GALAXY;
      }
    }

    /**
     * Determine current scale level based on camera zoom
     * @returns {number} Current scale level constant
     */
    getCurrentScale() {
      const zoom = this.camera.zoom;

      // Determine scale based on zoom thresholds
      if (zoom >= SCALE_THRESHOLDS[SCALE_SYSTEM]) {
        return SCALE_SYSTEM; // Zoomed into star system
      } else if (zoom >= SCALE_THRESHOLDS[SCALE_GALAXY]) {
        return SCALE_GALAXY; // Milky Way galaxy view
      } else if (zoom >= SCALE_THRESHOLDS[SCALE_LOCAL_GROUP]) {
        return SCALE_LOCAL_GROUP; // Local Group view
      } else if (zoom >= SCALE_THRESHOLDS[SCALE_SUPERCLUSTER]) {
        return SCALE_SUPERCLUSTER; // Virgo Supercluster view
      } else if (zoom >= SCALE_THRESHOLDS[SCALE_FILAMENTS]) {
        return SCALE_FILAMENTS; // Cosmic web filaments
      } else if (zoom >= SCALE_THRESHOLDS[SCALE_OBSERVABLE]) {
        return SCALE_OBSERVABLE; // Observable universe view
      } else {
        return SCALE_UNIVERSE_SPHERE; // Observable universe as sphere
      }
    }

    /**
     * Get human-readable scale name
     * @param {number} scale - Scale level constant
     * @returns {string} Scale name
     */
    getScaleName(scale) {
      switch (scale) {
        case SCALE_SYSTEM: return 'Star System';
        case SCALE_GALAXY: return 'Milky Way Galaxy';
        case SCALE_LOCAL_GROUP: return 'Local Group';
        case SCALE_SUPERCLUSTER: return 'Virgo Supercluster';
        case SCALE_FILAMENTS: return 'Cosmic Web';
        case SCALE_OBSERVABLE: return 'Observable Multivers';
        case SCALE_UNIVERSE_SPHERE: return 'Universe View';
        default: return 'Unknown';
      }
    }

    /**
     * Update focus tracking to determine which supercluster/galaxy is currently viewed
     */
    updateFocus() {
      const scale = this.getCurrentScale();
      const CENTER_THRESHOLD = 10000 * KLY_TO_LY; // ~10 Mly from center = we're at "home"

      // Check if we're near the center (0,0) - our Local Group
      const distFromCenter = Math.sqrt(
        this.camera.position.x ** 2 + this.camera.position.y ** 2
      );

      if (distFromCenter < CENTER_THRESHOLD) {
        // We're at the center - use hardcoded Local Group data.
        this.focusedSupercluster = null;
        this.proceduralLocalGroup = null;
        this.proceduralGalaxyData = null;

        // At galaxy scale, figure out WHICH hardcoded Local Group galaxy the
        // camera is sitting on. The Milky Way (0,0) keeps its special
        // playable interior (focusedGalaxy = null -> drawMilkyWay); any other
        // galaxy (Andromeda, Triangulum, ...) gets a procedural interior
        // rendered at its own position so it isn't drawn off-screen.
        if ((scale === SCALE_GALAXY || scale === SCALE_SYSTEM) && Array.isArray(LOCAL_GROUP_GALAXIES)) {
          let nearest = null;
          let nearestDist = Infinity;
          for (const galaxy of LOCAL_GROUP_GALAXIES) {
            const gx = galaxy.x * KLY_TO_LY;
            const gy = galaxy.y * KLY_TO_LY;
            const dx = gx - this.camera.position.x;
            const dy = gy - this.camera.position.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < nearestDist) {
              nearestDist = dist;
              nearest = galaxy;
            }
          }

          if (nearest && nearest.x === 0 && nearest.y === 0) {
            // Milky Way -> hardcoded interior with real star systems.
            this.focusedGalaxy = null;
          } else if (nearest) {
            // Convert kly -> ly so the procedural interior renders in place.
            this.focusedGalaxy = {
              ...nearest,
              x: nearest.x * KLY_TO_LY,
              y: nearest.y * KLY_TO_LY,
              radius: nearest.radius * KLY_TO_LY,
            };
          } else {
            this.focusedGalaxy = null;
          }
        } else {
          this.focusedGalaxy = null;
        }
        return;
      }

      // We're away from center - determine focus based on scale
      if (scale === SCALE_LOCAL_GROUP || scale === SCALE_SUPERCLUSTER) {
        // Find nearest supercluster
        let nearestSupercluster = null;
        let nearestDist = Infinity;

        // Check both real and procedural superclusters
        // First check SUPERCLUSTERS array
        for (const sc of SUPERCLUSTERS) {
          const scX = sc.x * MLY_TO_LY;
          const scY = sc.y * MLY_TO_LY;
          const dx = scX - this.camera.position.x;
          const dy = scY - this.camera.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < nearestDist) {
            nearestDist = dist;
            nearestSupercluster = { ...sc, x: scX, y: scY };
          }
        }

        // Update focused supercluster
        if (this.focusedSupercluster !== nearestSupercluster) {
          this.focusedSupercluster = nearestSupercluster;
          // Generate procedural local group for this supercluster
          if (this.focusedSupercluster) {
            this.proceduralLocalGroup = generateProceduralLocalGroup(this.focusedSupercluster);
          }
        }
      }

      if (scale === SCALE_GALAXY) {
        // Find nearest galaxy in the procedural local group
        if (this.proceduralLocalGroup) {
          let nearestGalaxy = null;
          let nearestDist = Infinity;

          for (const galaxy of this.proceduralLocalGroup) {
            const dx = galaxy.x - this.camera.position.x;
            const dy = galaxy.y - this.camera.position.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < nearestDist) {
              nearestDist = dist;
              nearestGalaxy = galaxy;
            }
          }

          this.focusedGalaxy = nearestGalaxy;
        }
      }
    }

    /* REMOVED - This entire function was incorrect
        setupInput() {
            // ...
        }
        */

    /* REMOVED - This entire function is no longer needed
        removeInput() {
            // ...
        }
        */

    processInput() {
      this.processMapInput();
    }

    processMapInput() {
      // Handle mouse wheel zoom
      const wheelDelta = TouchInput.wheelY; // USE MZ's built-in wheel input
      if (wheelDelta !== 0) {
        // Exponential in the raw delta, at a gentle rate: the min..max zoom
        // range is a long slider rather than a handful of 10% jumps, matching
        // the 3D map's wheel feel (GalaxySim_Camera3D).
        const notches = Math.max(-2.5, Math.min(2.5, wheelDelta / 100));
        this.camera.setZoom(this.camera.targetZoom * Math.exp(-notches * 0.055));
        // this.wheelDelta = 0; // REMOVED - TouchInput handles resetting
      }

      // Left analog stick pans the star map; right stick Y zooms.
      if (window.AnalogStickInput) {
        const ax = AnalogStickInput.leftX();
        const ay = AnalogStickInput.leftY();
        if (!this.selectedPlanet && (ax !== 0 || ay !== 0)) {
          const panSpeed = 16 / this.camera.zoom; // world distance per frame scales with zoom (matches drag)
          this.camera.targetPosition.x += ax * panSpeed;
          this.camera.targetPosition.y += ay * panSpeed;
        }
        const ry = AnalogStickInput.rightY();
        if (ry !== 0) {
          // Push up = zoom in, proportional to how far the stick is pushed.
          this.camera.setZoom(this.camera.targetZoom * Math.exp(-ry * 0.012));
        }
      }

      // Get mouse position from our overlay canvas's live bounding rect (see
      // createCanvas) so hit-testing stays correct across layout changes.
      const x = this._pointer ? this._pointer.x : TouchInput.x;
      const y = this._pointer ? this._pointer.y : TouchInput.y;

      // Check if mouse is within valid range
      if (x < 0 || y < 0 || x > Graphics.width || y > Graphics.height) {
        this.hoveredStar = null;
        return;
      }

      // Handle mouse press/drag
      if (TouchInput.isPressed()) {
        if (!this.mousePressed) {
          // Mouse just pressed
          this.mousePressed = true;
          this.dragStarted = false;
          this.lastTouchX = x;
          this.lastTouchY = y;
        } else {
          // Mouse is being dragged
          const dx = x - this.lastTouchX;
          const dy = y - this.lastTouchY;

          if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
            this.dragStarted = true;
            // Only allow dragging if not tracking a planet
            if (!this.selectedPlanet) {
              this.camera.targetPosition.x -= dx / this.camera.zoom;
              this.camera.targetPosition.y -= dy / this.camera.zoom;
            }
          }

          this.lastTouchX = x;
          this.lastTouchY = y;
        }
      } else {
        // Mouse released
        if (this.mousePressed && !this.dragStarted) {
          // Check if clicked on travel/stop button first
          let buttonClicked = false;

          if (
            !buttonClicked &&
            this.travelButton &&
            x >= this.travelButton.x &&
            x <= this.travelButton.x + this.travelButton.width &&
            y >= this.travelButton.y &&
            y <= this.travelButton.y + this.travelButton.height
          ) {
            // Travel button clicked
            if ($gameSystem.starMapData) {
              let success = false;
              if (this.travelButton.planetName) {
                // Travel to planet
                success = $gameSystem.starMapData.startTravelToPlanet(
                  this.travelButton.systemName,
                  this.travelButton.planetName
                );
              } else {
                // Travel to system
                success = $gameSystem.starMapData.startTravelToSystem(
                  this.travelButton.systemName
                );
              }
              if (success) {
                SoundManager.playOk();
              } else {
                SoundManager.playBuzzer();
              }
            }
            buttonClicked = true;
          }

          // Decrease speed button (check before stop engines)
          if (
            !buttonClicked &&
            this.decreaseSpeedButton &&
            x >= this.decreaseSpeedButton.x &&
            x <= this.decreaseSpeedButton.x + this.decreaseSpeedButton.width &&
            y >= this.decreaseSpeedButton.y &&
            y <= this.decreaseSpeedButton.y + this.decreaseSpeedButton.height
          ) {
            const currentSpeed = Math.floor($gameVariables.value(94)) || 1;
            if (currentSpeed > 1) {
              const newSpeed = Math.max(1, currentSpeed - 1);
              $gameVariables.setValue(94, newSpeed);
              // Recalculate departure position to prevent ship jumping
              if ($gameSystem.starMapData) {
                $gameSystem.starMapData.recalculateDepartureOnSpeedChange();
              }
              SoundManager.playCursor();
            } else {
              SoundManager.playBuzzer();
            }
            buttonClicked = true;
          }

          // Increase speed button (check before stop engines)
          if (
            !buttonClicked &&
            this.increaseSpeedButton &&
            x >= this.increaseSpeedButton.x &&
            x <= this.increaseSpeedButton.x + this.increaseSpeedButton.width &&
            y >= this.increaseSpeedButton.y &&
            y <= this.increaseSpeedButton.y + this.increaseSpeedButton.height
          ) {
            const currentSpeed = Math.floor($gameVariables.value(94)) || 1;
            if (currentSpeed < 99) {
              const newSpeed = Math.min(99, currentSpeed + 1);
              $gameVariables.setValue(94, newSpeed);
              // Recalculate departure position to prevent ship jumping
              if ($gameSystem.starMapData) {
                $gameSystem.starMapData.recalculateDepartureOnSpeedChange();
              }
              SoundManager.playCursor();
            } else {
              SoundManager.playBuzzer();
            }
            buttonClicked = true;
          }

          if (
            !buttonClicked &&
            this.stopEnginesButton &&
            x >= this.stopEnginesButton.x &&
            x <= this.stopEnginesButton.x + this.stopEnginesButton.width &&
            y >= this.stopEnginesButton.y &&
            y <= this.stopEnginesButton.y + this.stopEnginesButton.height
          ) {
            // Stop engines button clicked
            if ($gameSystem.starMapData) {
              $gameSystem.starMapData.stopTravel();
              SoundManager.playCancel();
            }
            buttonClicked = true;
          }

          // Land to Planet button
          if (
            !buttonClicked &&
            this.landToPlanetButton &&
            x >= this.landToPlanetButton.x &&
            x <= this.landToPlanetButton.x + this.landToPlanetButton.width &&
            y >= this.landToPlanetButton.y &&
            y <= this.landToPlanetButton.y + this.landToPlanetButton.height
          ) {
            // Land to planet button clicked
            this.landOnPlanet();
            buttonClicked = true;
          }

          if (!buttonClicked) {
            // This was a click. Select whatever body is under the cursor
            // directly -- moons first (smallest, drawn on top), then planets,
            // then stars -- without needing the parent to be selected first.
            const worldPos = this.camera.screenToWorld(
              x,
              y,
              Graphics.width,
              Graphics.height
            );

            // Any visible moon of the displayed system is clickable.
            const moonHit = this.findAnyMoonAtPosition(worldPos.x, worldPos.y);

            if (moonHit) {
              this.selectMoon(moonHit.moon, moonHit.planet, moonHit.system);
            } else {
              // Any visible planet of the displayed system is clickable.
              let clickedPlanet = null;
              let clickedPlanetSystem = null;
              if (this._displayedSystem && this._displayedSystem.planets) {
                const result = this.findPlanetAtPosition(
                  worldPos.x,
                  worldPos.y,
                  this._displayedSystem
                );
                if (result) {
                  clickedPlanet = result.planet;
                  clickedPlanetSystem = result.system;
                }
              }

              if (clickedPlanet) {
                this.selectPlanet(clickedPlanet, clickedPlanetSystem);
              } else {
                const clickedStar = this.findStarAtPosition(
                  worldPos.x,
                  worldPos.y
                );
                if (clickedStar) {
                  // Detect a double-click on the same star -> smoothly zoom in.
                  const now = performance.now();
                  const isDoubleClick =
                    this._lastClickStar === clickedStar &&
                    now - (this._lastClickTime || 0) < 350;
                  this._lastClickStar = clickedStar;
                  this._lastClickTime = now;

                  this.selectStar(clickedStar);
                  if (isDoubleClick) {
                    this.zoomIntoStar(clickedStar);
                  }
                } else if (
                  (this.selectedStar ||
                    this.selectedPlanet ||
                    this.selectedMoon) &&
                  !(this.camera.zoom >= PLANET_DETAIL_THRESHOLD - 300)
                ) {
                  // Clicked on empty space: deselect

                  this.deselectSystem();
                }
              }
            }
          }
        }
        this.mousePressed = false;
        this.dragStarted = false;

        // Update hover - any visible moon first (drawn on top), then any
        // visible planet of the displayed system, then stars.
        const worldPos = this.camera.screenToWorld(
          x,
          y,
          Graphics.width,
          Graphics.height
        );

        // Hover any visible moon of the displayed system
        this.hoveredMoon = null;
        const moonHover = this.findAnyMoonAtPosition(worldPos.x, worldPos.y);
        if (moonHover) {
          this.hoveredMoon = moonHover.moon;
        }

        // Hover any visible planet of the displayed system (if not on a moon)
        this.hoveredPlanet = null;
        if (
          !this.hoveredMoon &&
          this._displayedSystem &&
          this._displayedSystem.planets
        ) {
          const result = this.findPlanetAtPosition(
            worldPos.x,
            worldPos.y,
            this._displayedSystem
          );
          if (result) {
            this.hoveredPlanet = result.planet;
          }
        }

        // Only show star hover if not hovering over a planet or moon
        if (!this.hoveredPlanet && !this.hoveredMoon) {
          this.hoveredStar = this.findStarAtPosition(worldPos.x, worldPos.y);
        } else {
          this.hoveredStar = null;
        }
      }

      // Update cursor style
      if (this.hoveredMoon || this.hoveredPlanet || this.hoveredStar) {
        document.body.style.cursor = "pointer";
      } else {
        document.body.style.cursor = "default";
      }

      this.lastMousePos = new Vector2(x, y);
    }

    findStarAtPosition(worldX, worldY) {
      const threshold = 10 / this.camera.zoom;
      let closest = null;
      let closestDist = threshold;

      this.dataManager.getAllSystems().forEach((system) => {
        const dx = system.position.x - worldX;
        const dy = system.position.y - worldY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < closestDist) {
          closestDist = dist;
          closest = system;
        }
      });

      return closest;
    }

    findPlanetAtPosition(worldX, worldY, system) {
      let closestPlanet = null;
      let closestDist = Infinity;
      const clickThreshold = 15 / this.camera.zoom; // Generous threshold for clicking

      // Calculate star visual size to match drawing code
      const MIN_VISUAL_WORLD_RADIUS = 0.15;
      const RADIUS_SCALE_FACTOR = 0.01;
      const worldRadius =
        MIN_VISUAL_WORLD_RADIUS + system.radius * RADIUS_SCALE_FACTOR;
      const MIN_PIXEL_SIZE = 2;
      const starPixelRadius = Math.max(
        MIN_PIXEL_SIZE,
        worldRadius * this.camera.zoom
      );
      const scale = this.camera.zoom * 0.8;

      system.planets.forEach((planet) => {
        // Match the exact calculation from drawSystemOrbits
        const angle =
          planet.phase +
          this.time * 0.1 * (1 / Math.max(planet.orbitRadius, 0.5));

        // Check if this planet type has eccentric orbit
        const isEccentric = ECCENTRIC_ORBIT_TYPES.has(planet.type);

        let planetX, planetY;

        if (isEccentric) {
          const eccentricity = 0.6;
          const a_planet = planet.orbitRadius * scale;
          const b_planet =
            a_planet * Math.sqrt(1 - eccentricity * eccentricity);
          const c_focus_offset = a_planet * eccentricity;

          const a_visual = a_planet + starPixelRadius;
          const b_visual = b_planet + starPixelRadius;

          planetX =
            system.position.x +
            c_focus_offset / this.camera.zoom +
            Math.cos(angle) * (a_visual / this.camera.zoom);
          planetY =
            system.position.y + Math.sin(angle) * (b_visual / this.camera.zoom);
        } else {
          const planetPixelOrbit = planet.orbitRadius * scale;
          const orbitRadius = starPixelRadius + planetPixelOrbit;
          planetX =
            system.position.x +
            Math.cos(angle) * (orbitRadius / this.camera.zoom);
          planetY =
            system.position.y +
            Math.sin(angle) * (orbitRadius / this.camera.zoom);
        }

        const dx = planetX - worldX;
        const dy = planetY - worldY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < clickThreshold && dist < closestDist) {
          closestDist = dist;
          closestPlanet = { planet, system };
        }
      });

      return closestPlanet;
    }

    // Hit-test every visible moon of the currently displayed system, regardless
    // of which planet (if any) is selected. Lets the player click any moon they
    // can see without first selecting its parent planet. Relies on moon._screenPos
    // set during the last render pass.
    findAnyMoonAtPosition(worldX, worldY) {
      const system = this._displayedSystem;
      if (!system || !system.planets) return null;
      // Moons are only drawn (and their _screenPos refreshed) above this zoom;
      // below it, any stored _screenPos is stale, so don't hit-test moons.
      if (this.camera.zoom <= ORBIT_FULL_ALPHA_ZOOM) return null;

      let closest = null;
      let closestDist = Infinity;
      const clickThreshold = 10 / this.camera.zoom;

      system.planets.forEach((planet) => {
        if (!planet.moons || planet.moons.length === 0) return;
        planet.moons.forEach((moon) => {
          if (!moon._screenPos) return;
          const dx = moon._screenPos.worldX - worldX;
          const dy = moon._screenPos.worldY - worldY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < clickThreshold && dist < closestDist) {
            closestDist = dist;
            closest = { moon, planet, system };
          }
        });
      });

      return closest;
    }

    selectStar(system) {
      this.selectedStar = system;
      this.selectedPlanet = null; // Clear planet selection
      this.infoPanelVisible = true;
      this.showSystemDetail = true;
      this.showPlanetDetail = false;
      // Set variable 97 to selected system name
      $gameVariables.setValue(97, system.name);
      AudioManager.playSe({ name: "Cursor1", volume: 90, pitch: 100, pan: 0 });
    }

    // Smoothly fly the camera to a star and zoom into its system view.
    // The camera's built-in lerp (position + zoom smoothing) animates it.
    zoomIntoStar(system) {
      if (!system || !system.position) return;
      this.camera.setTarget(system.position.x, system.position.y);
      const SYSTEM_VIEW_ZOOM = 61; // close enough to see planets/orbits
      this.camera.setZoom(Math.max(this.camera.targetZoom, SYSTEM_VIEW_ZOOM));
      AudioManager.playSe({ name: "Cursor2", volume: 90, pitch: 100, pan: 0 });
    }

    selectPlanet(planet, system) {
      this.selectedPlanet = planet;
      this.selectedPlanetSystem = system;
      this.selectedStar = system; // Keep star selected to show orbits
      this.selectedMoon = null; // Clear moon selection when selecting planet
      this.infoPanelVisible = true;
      this.showPlanetDetail = true;
      this.showSystemDetail = false;
      AudioManager.playSe({ name: "Cursor1", volume: 90, pitch: 100, pan: 0 });

      // Zoom in enough to show planet detail
      if (this.camera.zoom < PLANET_DETAIL_THRESHOLD) {
        this.camera.setZoom(PLANET_DETAIL_THRESHOLD * 1.5);
      }
    }

    selectMoon(moon, planet, system) {
      this.selectedMoon = moon;
      this.selectedPlanet = planet;
      this.selectedPlanetSystem = system;
      this.selectedStar = system; // Keep star selected to show orbits
      this.infoPanelVisible = true;
      this.showPlanetDetail = true; // Could create a showMoonDetail if needed
      this.showSystemDetail = false;
      AudioManager.playSe({ name: "Cursor1", volume: 90, pitch: 100, pan: 0 });
    }

    deselectSystem(system) {
      if (this.selectedStar || this.selectedPlanet || this.selectedMoon) {
        this.selectedStar = null;
        this.selectedPlanet = null;
        this.selectedMoon = null;
        this.selectedPlanetSystem = null;
        this.infoPanelVisible = false;
        this.showSystemDetail = false;
        this.showPlanetDetail = false;
        this.hoveredStar = null; // Also clear the hover state
        this.hoveredMoon = null;
      }
    }

    updatePlanetTracking() {
      // Calculate planet's current position using the same logic as drawing
      const system = this.selectedPlanetSystem;
      const planet = this.selectedPlanet;

      // Calculate star visual size to match drawing code
      const MIN_VISUAL_WORLD_RADIUS = 0.15;
      const RADIUS_SCALE_FACTOR = 0.01;
      const worldRadius =
        MIN_VISUAL_WORLD_RADIUS + system.radius * RADIUS_SCALE_FACTOR;
      const MIN_PIXEL_SIZE = 2;
      const starPixelRadius = Math.max(
        MIN_PIXEL_SIZE,
        worldRadius * this.camera.zoom
      );
      const scale = this.camera.zoom * 0.8;

      // Calculate planet position
      const angle =
        planet.phase +
        this.time * 0.1 * (1 / Math.max(planet.orbitRadius, 0.5));
      const isEccentric = ECCENTRIC_ORBIT_TYPES.has(planet.type);

      let planetX, planetY;

      if (isEccentric) {
        const eccentricity = 0.6;
        const a_planet = planet.orbitRadius * scale;
        const b_planet = a_planet * Math.sqrt(1 - eccentricity * eccentricity);
        const c_focus_offset = a_planet * eccentricity;

        const a_visual = a_planet + starPixelRadius;
        const b_visual = b_planet + starPixelRadius;

        planetX =
          system.position.x +
          c_focus_offset / this.camera.zoom +
          Math.cos(angle) * (a_visual / this.camera.zoom);
        planetY =
          system.position.y + Math.sin(angle) * (b_visual / this.camera.zoom);
      } else {
        const planetPixelOrbit = planet.orbitRadius * scale;
        const orbitRadius = starPixelRadius + planetPixelOrbit;
        planetX =
          system.position.x +
          Math.cos(angle) * (orbitRadius / this.camera.zoom);
        planetY =
          system.position.y +
          Math.sin(angle) * (orbitRadius / this.camera.zoom);
      }

      // Smoothly move camera to follow planet
      this.camera.setTarget(planetX, planetY);
    }

    update() {
      super.update();

      // --- START MODIFICATION: Robust canvas syncing ---
      // Handle resolution and window resize changes
      const gameCanvas = Graphics._app.view;
      const newWidth = Graphics.width;
      const newHeight = Graphics.height;
      const newStyleWidth = gameCanvas.style.width;
      const newStyleHeight = gameCanvas.style.height;

      // Update internal bitmap resolution if game's internal res changes
      if (this.canvas.width !== newWidth || this.canvas.height !== newHeight) {
        this.canvas.width = newWidth;
        this.canvas.height = newHeight;
        // Re-apply smoothing settings if canvas is recreated
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = "high";
      }

      // Update CSS size and position to *always* match the main game canvas
      // This is the key fix for window resizing and aspect ratio changes
      if (this.canvas.style.width !== newStyleWidth) {
        this.canvas.style.width = newStyleWidth;
      }
      if (this.canvas.style.height !== newStyleHeight) {
        this.canvas.style.height = newStyleHeight;
      }
      if (this.canvas.style.left !== gameCanvas.style.left) {
        this.canvas.style.left = gameCanvas.style.left;
      }
      if (this.canvas.style.top !== gameCanvas.style.top) {
        this.canvas.style.top = gameCanvas.style.top;
      }
      if (this.canvas.style.marginLeft !== gameCanvas.style.marginLeft) {
        this.canvas.style.marginLeft = gameCanvas.style.marginLeft;
      }
      if (this.canvas.style.marginTop !== gameCanvas.style.marginTop) {
        this.canvas.style.marginTop = gameCanvas.style.marginTop;
      }
      // --- END MODIFICATION ---

      const dt = 1 / 60;
      this.time += dt;
      this.scanLineAngle += dt * 0.5;
      this.selectionPulse = Math.sin(this.time * 3) * 0.5 + 0.5;
      this.connectionPulse = Math.sin(this.time * 2) * 0.3 + 0.7;

      this.camera.update();

      // Track selected planet position to keep it centered
      if (this.selectedPlanet && this.selectedPlanetSystem) {
        this.updatePlanetTracking();
      }

      // Update player ship position
      if ($gameSystem.starMapData) {
        $gameSystem.starMapData.updateShipPosition();
        $gameSystem.starMapData.updateShipAtPlanet();
      }
      this.updateSpeedControls(this.canvas.width, this.canvas.height);
      this.updateLandButton(this.canvas.width, this.canvas.height);

      this.processInput();
      this.handleKeyboardInput();
      this.updateFocus(); // Update which supercluster/galaxy is focused
      this.render();
    }

    handleKeyboardInput() {
      if (Input.isTriggered("escape") || Input.isTriggered("cancel")) {
        if (this.selectedPlanet) {
          // If planet is selected, go back to showing system
          this.selectedPlanet = null;
          this.selectedPlanetSystem = null;
          this.showPlanetDetail = false;
          this.showSystemDetail = true;
        } else if (this.selectedStar) {
          // If only star is selected, deselect it
          this.selectedStar = null;
          this.infoPanelVisible = false;
        } else {
          // Otherwise exit the scene
          this.popScene();
        }
      }

      // Map view controls (disabled when tracking a planet)
      if (!this.selectedPlanet) {
        const moveSpeed = 5 / this.camera.zoom;
        if (Input.isPressed("up")) {
          this.camera.targetPosition.y -= moveSpeed;
        }
        if (Input.isPressed("down")) {
          this.camera.targetPosition.y += moveSpeed;
        }
        if (Input.isPressed("left")) {
          this.camera.targetPosition.x -= moveSpeed;
        }
        if (Input.isPressed("right")) {
          this.camera.targetPosition.x += moveSpeed;
        }
      }

      if (Input.isPressed("pageup")) {
        // Q
        this.camera.setZoom(this.camera.targetZoom * 1.01);
      }
      if (Input.isPressed("pagedown")) {
        // E
        this.camera.setZoom(this.camera.targetZoom * 0.99);
      }

      if (Input.isTriggered("shift") && this.selectedStar) {
        this.camera.setTarget(
          this.selectedStar.position.x,
          this.selectedStar.position.y
        );
      }
    }

    render() {
      const ctx = this.ctx;
      // Use the canvas's internal width/height, which match Graphics.width/height
      const width = this.canvas.width;
      const height = this.canvas.height;

      ctx.fillStyle = COLORS.background;
      ctx.fillRect(0, 0, width, height);

      // Draw starfield (dispatches to scale-appropriate renderer)
      this.drawStarfield(ctx, width, height);

      // Only draw Milky Way internal details at galaxy scale or smaller
      if (this.currentScale === SCALE_GALAXY || this.currentScale === SCALE_SYSTEM) {
        this.drawNebulas(ctx, width, height);
        this.drawBarnardsLoop(ctx, width, height);
        this.drawFamousNebulas(ctx, width, height);
        //this.drawGalacticCore(ctx, width, height);
        this.drawGrid(ctx, width, height);
        //this.drawScanLines(ctx, width, height);
        if (!this.selectedStar) {
          this.drawConnections(ctx, width, height);
        }
        this.drawStars(ctx, width, height);

        // Draw player ship
        this.drawPlayerShip(ctx, width, height);

        // Draw orbits in galaxy view when zoomed in
        this.drawSystemOrbits(ctx, width, height);

        //this.drawControls(ctx, width, height);
        this.drawSpeedControls(ctx, width, height);
        this.drawLandButton(ctx, width, height);

        // UI panels for star/planet details
        if (this.infoPanelVisible) {
          if (this.showSystemDetail && this.selectedStar) {
            this.drawInfoPanel(ctx, width, height);
          } else if (this.showPlanetDetail && this.selectedPlanet) {
            this.drawPlanetDetailPanel(ctx, width, height);
          }
        }
        if (this.hoveredStar && this.hoveredStar !== this.selectedStar) {
          this.drawTooltip(ctx, width, height);
        }
        if (
          this.hoveredPlanet &&
          (!this.selectedPlanet ||
            this.hoveredPlanet.name !== this.selectedPlanet.name)
        ) {
          this.drawPlanetTooltip(ctx, width, height);
        }
        if (
          this.hoveredMoon &&
          (!this.selectedMoon || this.hoveredMoon.name !== this.selectedMoon.name)
        ) {
          this.drawMoonTooltip(ctx, width, height);
        }
      }

      // Draw scale indicator (always visible)
      this.drawScaleIndicator(ctx, width, height);
    }

    /**
     * Draw current scale level indicator in top-left corner
     */
    drawScaleIndicator(ctx, width, height) {
      // Show focused galaxy name if zoomed into a galaxy, otherwise show scale name
      let displayName = this.getScaleName(this.currentScale);
      if (this.focusedGalaxy && this.currentScale === SCALE_GALAXY) {
        displayName = this.focusedGalaxy.name + ' Galaxy';
      }

      const zoom = this.camera.zoom;

      // Background panel
      const panelX = 10;
      const panelY = 10;
      const panelWidth = 250;
      const panelHeight = 65;

      ctx.fillStyle = COLORS.uiBackground;
      ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
      ctx.strokeStyle = COLORS.uiBorder;
      ctx.lineWidth = 1;
      ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);

      // Scale name (or galaxy name if focused)
      ctx.fillStyle = COLORS.textHighlight;
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(displayName, panelX + 10, panelY + 22);

      // Zoom level
      ctx.fillStyle = COLORS.text;
      ctx.font = '11px monospace';
      let zoomText = '';
      if (zoom >= 1) {
        zoomText = `Zoom: ${zoom.toFixed(2)}x`;
      } else if (zoom >= 0.001) {
        zoomText = `Zoom: ${zoom.toFixed(5)}x`;
      } else {
        zoomText = `Zoom: ${zoom.toExponential(2)}`;
      }
      ctx.fillText(zoomText, panelX + 10, panelY + 40);

      // Unit indicator based on scale
      let unitText = '';
      switch (this.currentScale) {
        case SCALE_SYSTEM:
        case SCALE_GALAXY:
          unitText = 'Units: light-years (ly)';
          break;
        case SCALE_LOCAL_GROUP:
          unitText = 'Units: kilolightyears (kly)';
          break;
        case SCALE_SUPERCLUSTER:
          unitText = 'Units: megalightyears (Mly)';
          break;
        case SCALE_OBSERVABLE:
          unitText = 'Units: gigalightyears (Gly)';
          break;
      }
      ctx.fillStyle = COLORS.textDim;
      ctx.font = '10px monospace';
      ctx.fillText(unitText, panelX + 10, panelY + 55);
    }

    /**
     * Main starfield dispatcher - calls appropriate renderer based on scale
     */
    drawStarfield(ctx, width, height) {
      // Update current scale based on zoom level
      this.currentScale = this.getCurrentScale();

      // Dispatch to appropriate scale renderer
      switch (this.currentScale) {
        case SCALE_SYSTEM:
        case SCALE_GALAXY:
          // At system and galaxy scale, draw the Milky Way
          this.drawMilkyWay(ctx, width, height);
          break;
        case SCALE_LOCAL_GROUP:
          this.drawLocalGroup(ctx, width, height);
          break;
        case SCALE_SUPERCLUSTER:
          this.drawVirgoSupercluster(ctx, width, height);
          break;
        case SCALE_FILAMENTS:
          this.drawCosmicWeb(ctx, width, height);
          break;
        case SCALE_OBSERVABLE:
          this.drawObservableUniverse(ctx, width, height);
          break;
        case SCALE_UNIVERSE_SPHERE:
          this.drawUniverseSphere(ctx, width, height);
          break;
      }
    }

    /**
     * Draw the Milky Way galaxy with spiral arms and background stars
     */
    drawMilkyWay(ctx, width, height) {
      // Check if we should draw a procedural galaxy interior instead
      if (this.focusedGalaxy) {
        this.drawProceduralGalaxyInterior(this.focusedGalaxy, ctx, width, height);
        return;
      }

      // Otherwise draw the hardcoded Milky Way
      const GALAXY_SCALE = 2.0; // <-- NEW: 2.0 = 200% size. Try 2.5 or 3.0!
      // Generate stars in world space that move with camera
      // const rng = new RandomGenerator('starfield'); // This seems unused, RandomGenerator is created per-cell

      // Define galaxy center offset from Sol (Sol is at 0,0)
      const GALAXY_CENTER_X = -3100 * GALAXY_SCALE;
      const GALAXY_CENTER_Y = -4000 * GALAXY_SCALE;
      // --- NEW: Visual Parameters ---
      const CORE_RADIUS = 2500;

      // A soft, warm glow for the central bulge
      const CORE_COLOR = "rgba(255, 220, 180, 0.2)";
      const CORE_GLOW_RADIUS = CORE_RADIUS * 2.5; // Make glow larger than the high-density core

      // Star color palette
      const COLOR_BLUE = "rgba(180, 210, 255, 0.9)";
      const COLOR_WHITE = "rgba(255, 255, 255, 0.9)";
      const COLOR_YELLOW = "rgba(255, 240, 190, 0.9)";
      const COLOR_RED = "rgba(255, 180, 150, 0.9)";
      // ------------------------------

      // Spiral galaxy parameters
      const NUM_ARMS = 4; // Number of spiral arms
      // MODIFIED: This is now the 'pitch angle' for a logarithmic spiral.
      // A value around 0.2-0.5 works well. 0.0003 was for the old spiral type.
      const ARM_TIGHTNESS = 0.8;
      const ARM_WIDTH = 1200 * GALAXY_SCALE;
      const GALAXY_RADIUS = 10750 * GALAXY_SCALE;
      // Calculate visible world bounds
      const topLeft = this.camera.screenToWorld(0, 0, width, height);
      const bottomRight = this.camera.screenToWorld(
        width,
        height,
        width,
        height
      );

      // Expand bounds
      const padding = 200 / this.camera.zoom;
      const minX = topLeft.x - padding;
      const maxX = bottomRight.x + padding;
      const minY = topLeft.y - padding;
      const maxY = bottomRight.y + padding;

      // PERFORMANCE: Adaptive grid size based on zoom level
      // Special handling for mid-zoom range (0.18-0.28): Use clustering instead of individual stars
      const useClusteringMode = this.camera.zoom >= 0.017238 && this.camera.zoom <= 0.05735;

      let gridSize = 100;
      if (this.camera.zoom < 0.1) {
        gridSize = 500;
      } else if (useClusteringMode) {
        // Use larger grid cells for clustering in this zoom range
        gridSize = 500;
      } else if (this.camera.zoom < 0.5) {
        gridSize = 250;
      } else if (this.camera.zoom < 2) {
        gridSize = 150;
      }

      const startGridX = Math.floor(minX / gridSize) * gridSize;
      const startGridY = Math.floor(minY / gridSize) * gridSize;
      const endGridX = Math.ceil(maxX / gridSize) * gridSize;
      const endGridY = Math.ceil(maxY / gridSize) * gridSize;

      // PERFORMANCE: Calculate grid cell count and bail if too many
      const gridCellsX = Math.ceil((endGridX - startGridX) / gridSize);
      const gridCellsY = Math.ceil((endGridY - startGridY) / gridSize);
      const totalCells = gridCellsX * gridCellsY;

      if (totalCells > 10000) {
        ctx.globalAlpha = 1;
        return;
      }

      // --- NEW: Draw Core Glow ---
      // Draw this *before* the stars, so they appear on top
      const coreScreen = this.camera.worldToScreen(
        GALAXY_CENTER_X,
        GALAXY_CENTER_Y,
        width,
        height
      );
      // Scale the glow radius by zoom
      const coreRadiusScreen = CORE_GLOW_RADIUS * this.camera.zoom;

      // Only draw the glow if it's reasonably large on screen
      if (coreRadiusScreen > 5) {
        const gradient = ctx.createRadialGradient(
          coreScreen.x,
          coreScreen.y,
          0,
          coreScreen.x,
          coreScreen.y,
          coreRadiusScreen
        );
        // Bright center, fading to transparent
        gradient.addColorStop(0, CORE_COLOR);
        gradient.addColorStop(0.3, CORE_COLOR.replace("0.2", "0.1")); // Fades out
        gradient.addColorStop(1, CORE_COLOR.replace("0.2", "0"));

        ctx.fillStyle = gradient;
        // Draw the gradient over the whole screen, centered on the core
        ctx.fillRect(0, 0, width, height);
      }
      // ---------------------------

      // Draw stars in world space
      for (let gx = startGridX; gx <= endGridX; gx += gridSize) {
        for (let gy = startGridY; gy <= endGridY; gy += gridSize) {
          // Use grid position as seed for deterministic random
          const seedRng = new RandomGenerator(`star_${gx}_${gy}`);

          // Calculate position relative to galaxy center
          const dx = gx - GALAXY_CENTER_X;
          const dy = gy - GALAXY_CENTER_Y;
          const distFromCenter = Math.sqrt(dx * dx + dy * dy);
          const angleFromCenter = Math.atan2(dy, dx);

          if (distFromCenter > GALAXY_RADIUS) {
            continue;
          }

          // Calculate density based on spiral arms
          let densityMultiplier = 0;
          let inArm = false; // NEW: Track if we're in an arm for coloring

          if (distFromCenter < CORE_RADIUS) {
            // Core
            const coreProgress = distFromCenter / CORE_RADIUS;
            densityMultiplier = 1.0 + 2.0 * (1.0 - coreProgress);
          } else {
            // Spiral Arms
            let minDistToArm = Infinity;
            let bestArmAngle = 0;

            for (let arm = 0; arm < NUM_ARMS; arm++) {
              const armStartAngle = ((Math.PI * 2) / NUM_ARMS) * arm;

              // --- MODIFIED: Logarithmic Spiral ---
              // Use log(r) instead of r. Avoid log(0) by starting outside the core.
              const distForLog = Math.max(1, distFromCenter - CORE_RADIUS);
              const spiralAngle =
                armStartAngle + ARM_TIGHTNESS * Math.log(distForLog);
              // ------------------------------------

              // Normalize angle difference to [-π, π]
              let angleDiff = angleFromCenter - spiralAngle;
              while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
              while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

              const perpDist = Math.abs(angleDiff * distFromCenter);

              if (perpDist < minDistToArm) {
                minDistToArm = perpDist;
                bestArmAngle = spiralAngle;
              }
            }

            if (minDistToArm < ARM_WIDTH) {
              // Inside spiral arm
              const armProgress = minDistToArm / ARM_WIDTH;
              densityMultiplier =
                1.5 * Math.exp(-3 * armProgress * armProgress);
              inArm = true; // NEW
            } else if (minDistToArm < ARM_WIDTH * 2) {
              // Near arm edge
              const nearArmProgress = (minDistToArm - ARM_WIDTH) / ARM_WIDTH;
              densityMultiplier = 0.3 * (1.0 - nearArmProgress);
            } else {
              // Between arms
              densityMultiplier = 0.05;
            }

            // Apply radial falloff
            const radialProgress =
              (distFromCenter - CORE_RADIUS) / (GALAXY_RADIUS - CORE_RADIUS);
            const radialFalloff = 1.0 - Math.pow(radialProgress, 2.0);
            densityMultiplier *= radialFalloff;
          }

          densityMultiplier = Math.max(0, Math.min(3.0, densityMultiplier));

          if (seedRng.random() > Math.min(1.0, densityMultiplier)) {
            continue;
          }

          // CLUSTERING MODE: Render entire grid cell as a single glow
          if (useClusteringMode) {
            const clusterCenterX = gx + gridSize / 2;
            const clusterCenterY = gy + gridSize / 2;

            // Determine cluster color based on location
            let clusterColor = COLOR_YELLOW;
            if (distFromCenter < CORE_RADIUS * 1.2) {
              // Core colors
              const colorRoll = seedRng.random();
              if (colorRoll < 0.6) clusterColor = COLOR_YELLOW;
              else if (colorRoll < 0.9) clusterColor = COLOR_RED;
              else clusterColor = COLOR_WHITE;
            } else if (inArm) {
              // Arm colors (favor blue)
              const colorRoll = seedRng.random();
              if (colorRoll < 0.4) clusterColor = COLOR_BLUE;
              else if (colorRoll < 0.8) clusterColor = COLOR_WHITE;
              else clusterColor = COLOR_YELLOW;
            } else {
              // Disk/Halo colors
              const colorRoll = seedRng.random();
              clusterColor = colorRoll < 0.6 ? COLOR_WHITE : COLOR_YELLOW;
            }

            // Cluster size proportional to density and grid size
            const clusterSize = (gridSize / 2) * Math.min(1.5, densityMultiplier);
            const intensity = Math.min(1.0, densityMultiplier);

            this.drawStarCluster(
              clusterCenterX, clusterCenterY,
              clusterSize, clusterColor, intensity,
              ctx, width, height
            );

            continue; // Skip individual star rendering for this cell
          }

          // NORMAL MODE: Render individual stars
          const baseStarsPerCell = Math.max(
            1,
            Math.floor((gridSize / 100) * 9)
          );
          const numStars = Math.max(
            1,
            Math.floor(baseStarsPerCell * Math.min(1.5, densityMultiplier))
          );

          for (let i = 0; i < numStars; i++) {
            const worldX = gx + seedRng.random() * gridSize;
            const worldY = gy + seedRng.random() * gridSize;

            const screen = this.camera.worldToScreen(
              worldX,
              worldY,
              width,
              height
            );

            if (
              screen.x < -10 ||
              screen.x > width + 10 ||
              screen.y < -10 ||
              screen.y > height + 10
            ) {
              continue;
            }

            // --- DYNAMIC STAR SYSTEM GENERATION ---
            // When zoomed in enough, convert background stars into full star systems
            const STAR_SYSTEM_ZOOM_THRESHOLD = 2.0; // Zoom level where stars become systems

            if (this.camera.zoom >= STAR_SYSTEM_ZOOM_THRESHOLD) {
              // Calculate distance from galactic center for density-based generation
              const dx_center = worldX - GALAXY_CENTER_X;
              const dy_center = worldY - GALAXY_CENTER_Y;
              const distFromGalacticCore = Math.sqrt(dx_center * dx_center + dy_center * dy_center);

              // Determine system generation probability based on distance from core
              // REDUCED: Lower overall density for fewer systems
              const SYSTEM_DENSITY_SCALE = 0.15; // Global density multiplier (15% of background stars become systems)

              let systemGenerationChance = 0;

              if (distFromGalacticCore < CORE_RADIUS) {
                // Core region: Higher density but not overwhelming
                // REDUCED: 1.0 + 2.0 -> 0.3 + 0.7 (30% to 100% instead of 100% to 300%)
                const coreMultiplier = 0.3 + (0.7 * (1.0 - distFromGalacticCore / CORE_RADIUS));
                systemGenerationChance = coreMultiplier * SYSTEM_DENSITY_SCALE;
              } else {
                // Outside core: use spiral arm density from earlier calculation
                // REDUCED: Apply density scale to match background stars less densely
                systemGenerationChance = densityMultiplier * SYSTEM_DENSITY_SCALE * 0.5; // 50% of scaled density
              }

              // Only generate if we pass the probability check
              if (seedRng.random() > systemGenerationChance) {
                continue; // Skip this grid cell
              }

              // Generate only 1 system per grid cell (removed multi-system generation)
              const numSystemsToGenerate = 1;

              for (let sysIdx = 0; sysIdx < numSystemsToGenerate; sysIdx++) {
                // Offset position slightly for multiple systems in same cell
                const offsetX = sysIdx > 0 ? (seedRng.random() - 0.5) * gridSize : 0;
                const offsetY = sysIdx > 0 ? (seedRng.random() - 0.5) * gridSize : 0;
                const sysWorldX = worldX + offsetX;
                const sysWorldY = worldY + offsetY;

                // Generate realistic star name
                const starName = this.generateRealisticStarName(sysWorldX, sysWorldY, seedRng);

                // Check if system already exists in dataManager
                let system = this.dataManager.systems.get(starName);

                if (!system) {
                  // Generate new system on-the-fly using the proper generation method
                  system = this.dataManager.generateSingleProceduralSystem(
                    sysWorldX,
                    sysWorldY,
                    0, // z coordinate
                    starName,
                    seedRng
                  );

                  if (system) {
                    // Determine black hole type for this system
                    const inGreatAttractor = this.isInGreatAttractor(sysWorldX, sysWorldY);
                    const bhType = this.determineBlackHoleType(sysWorldX, sysWorldY, seedRng, inGreatAttractor);

                    if (bhType) {
                      system.blackHoleType = bhType;
                      // Assign procedural name for black holes
                      system.name = this.generateBlackHoleName(sysWorldX, sysWorldY, seedRng, bhType === 'hypermassive');
                    }

                    // Add to dataManager
                    this.dataManager.systems.set(starName, system);
                  }
                }
              }

              // Skip drawing this as a background star - it will be rendered as a system in drawStars()
              continue;
            }

            // --- MODIFIED: Star Properties (Size, Alpha, Color) ---

            // 1. Size & Alpha (Non-linear distribution)
            const brightRoll = seedRng.random();
            let size, alpha, color;

            if (brightRoll > 0.995) {
              // 0.5% "Hero" stars
              size = seedRng.random() * 1.0 + 1.5; // 1.5px - 2.5px
              alpha = seedRng.random() * 0.2 + 0.8; // Bright
            } else if (brightRoll > 0.9) {
              // 9.5% "Bright" stars
              size = seedRng.random() * 0.5 + 1.0; // 1.0px - 1.5px
              alpha = seedRng.random() * 0.3 + 0.5; // Medium-bright
            } else {
              // 90% "Dim" stars
              size = seedRng.random() * 0.5 + 0.5; // 0.5px - 1.0px
              alpha = seedRng.random() * 0.3 + 0.2; // Dim
            }

            // 2. Color (Based on position)
            const colorRoll = seedRng.random();
            // Get distance from center for this *specific star*
            const starDx = worldX - GALAXY_CENTER_X;
            const starDy = worldY - GALAXY_CENTER_Y;
            const starDist = Math.sqrt(starDx * starDx + starDy * starDy);

            if (starDist < CORE_RADIUS * 1.2) {
              // In/near the core
              // Core: Mostly older, red/yellow stars
              if (colorRoll < 0.6) color = COLOR_YELLOW;
              else if (colorRoll < 0.9) color = COLOR_RED;
              else color = COLOR_WHITE;
            } else if (inArm) {
              // In a spiral arm
              // Arms: Mix of all, but emphasis on young, hot, blue stars
              if (colorRoll < 0.4) color = COLOR_BLUE; // 40% blue
              else if (colorRoll < 0.8) color = COLOR_WHITE;
              else color = COLOR_YELLOW;
            } else {
              // Disk/Halo (between arms): Mix of white/yellow
              if (colorRoll < 0.6) color = COLOR_WHITE;
              else color = COLOR_YELLOW;
            }

            // 3. Drawing
            ctx.globalAlpha = alpha;
            ctx.fillStyle = color;

            // PERFORMANCE: Use fillRect for tiny stars (much faster than arc)
            if (size < 1.2) {
              ctx.fillRect(Math.floor(screen.x), Math.floor(screen.y), 1, 1);
            } else {
              // Use arc for larger, prettier stars
              ctx.beginPath();
              ctx.arc(screen.x, screen.y, size / 2, 0, Math.PI * 2); // Use size as diameter
              ctx.fill();
            }
            // --- END MODIFIED SECTION ---
          }
        }
      }

      ctx.globalAlpha = 1;
    }

    /**
     * Render a star cluster as a single glow (for performance at mid-zoom levels)
     * @param {number} centerX - World X coordinate
     * @param {number} centerY - World Y coordinate
     * @param {number} clusterSize - Cluster glow size
     * @param {string} color - Glow color
     * @param {number} intensity - Brightness intensity (0-1)
     */
    drawStarCluster(centerX, centerY, clusterSize, color, intensity, ctx, width, height) {
      const screen = this.camera.worldToScreen(centerX, centerY, width, height);

      // Skip if off-screen
      if (screen.x < -clusterSize || screen.x > width + clusterSize ||
        screen.y < -clusterSize || screen.y > height + clusterSize) {
        return;
      }

      const screenRadius = clusterSize * this.camera.zoom;

      // Only render if visible size is meaningful
      if (screenRadius < 3) return;

      // Create radial gradient for glow effect
      const gradient = ctx.createRadialGradient(
        screen.x, screen.y, 0,
        screen.x, screen.y, screenRadius
      );

      // Extract RGB from color string (assumes "rgba(...)" format)
      const alpha = Math.min(1, intensity * 0.7);
      const colorWithAlpha = color.replace(/[\d.]+\)$/, `${alpha})`);

      gradient.addColorStop(0, colorWithAlpha);
      gradient.addColorStop(0.5, color.replace(/[\d.]+\)$/, `${alpha * 0.3})`));
      gradient.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));

      ctx.fillStyle = gradient;
      ctx.fillRect(
        screen.x - screenRadius, screen.y - screenRadius,
        screenRadius * 2, screenRadius * 2
      );

      // Draw small bright core
      ctx.globalAlpha = intensity;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, Math.max(2, screenRadius * 0.15), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    /**
     * Draw a single galaxy with morphological features
     * @param {object} galaxyData - Galaxy data object
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} width - Canvas width
     * @param {number} height - Canvas height
     * @param {boolean} showLabel - Whether to show galaxy label
     */
    drawGalaxy(galaxyData, ctx, width, height, showLabel = true) {
      const screenPos = this.camera.worldToScreen(galaxyData.x, galaxyData.y, width, height);
      const screenRadius = galaxyData.radius * this.camera.zoom;

      // Skip if off-screen
      if (screenPos.x < -screenRadius || screenPos.x > width + screenRadius ||
        screenPos.y < -screenRadius || screenPos.y > height + screenRadius) {
        return;
      }

      // Create color from RGB values
      const color = galaxyData.color;
      const colorStr = `rgb(${color.r}, ${color.g}, ${color.b})`;

      // LOD: Render as point when very small (far away)
      const LOD_POINT_THRESHOLD = 2; // pixels
      const LOD_SIMPLE_THRESHOLD = 8; // pixels

      if (screenRadius < LOD_POINT_THRESHOLD) {
        // Render as simple point
        const pointSize = Math.max(1, screenRadius * 2);
        const alpha = Math.min(0.8, screenRadius / LOD_POINT_THRESHOLD);
        ctx.fillStyle = colorStr.replace('rgb', 'rgba').replace(')', `, ${alpha})`);
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, pointSize, 0, Math.PI * 2);
        ctx.fill();
        return; // Skip detailed rendering and label
      }

      if (screenRadius < LOD_SIMPLE_THRESHOLD) {
        // Render as simple glow (no morphology details)
        const gradient = ctx.createRadialGradient(screenPos.x, screenPos.y, 0, screenPos.x, screenPos.y, screenRadius);
        gradient.addColorStop(0, colorStr.replace('rgb', 'rgba').replace(')', ', 0.8)'));
        gradient.addColorStop(0.5, colorStr.replace('rgb', 'rgba').replace(')', ', 0.4)'));
        gradient.addColorStop(1, colorStr.replace('rgb', 'rgba').replace(')', ', 0)'));
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, screenRadius, 0, Math.PI * 2);
        ctx.fill();
        return; // Skip detailed rendering and label
      }

      // Full detail rendering for larger galaxies
      ctx.save();

      // Translate and rotate for galaxy orientation
      ctx.translate(screenPos.x, screenPos.y);
      if (galaxyData.rotation) {
        ctx.rotate(galaxyData.rotation);
      }

      // Draw based on galaxy type
      switch (galaxyData.type) {
        case GALAXY_TYPE_SPIRAL:
        case GALAXY_TYPE_BARRED_SPIRAL:
          this.drawSpiralGalaxy(ctx, galaxyData, screenRadius, colorStr);
          break;
        case GALAXY_TYPE_ELLIPTICAL:
          this.drawEllipticalGalaxy(ctx, galaxyData, screenRadius, colorStr);
          break;
        case GALAXY_TYPE_IRREGULAR:
          this.drawIrregularGalaxy(ctx, galaxyData, screenRadius, colorStr);
          break;
        case GALAXY_TYPE_DWARF:
        case GALAXY_TYPE_DWARF_SPHEROIDAL:
          this.drawDwarfGalaxy(ctx, galaxyData, screenRadius, colorStr);
          break;
      }

      ctx.restore();

      // Draw label if requested and zoomed in enough
      if (showLabel && screenRadius > 10) {
        ctx.fillStyle = COLORS.text;
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.globalAlpha = Math.min(1, screenRadius / 20);
        ctx.fillText(galaxyData.name, screenPos.x, screenPos.y + screenRadius + 15);
        ctx.globalAlpha = 1;
      }
    }

    /**
     * Draw spiral galaxy with arms
     */
    drawSpiralGalaxy(ctx, data, radius, colorStr) {
      const arms = data.arms || 2;
      const armTightness = data.armTightness || 0.6;

      // Core glow
      const coreGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
      coreGradient.addColorStop(0, colorStr.replace('rgb', 'rgba').replace(')', ', 0.8)'));
      coreGradient.addColorStop(0.3, colorStr.replace('rgb', 'rgba').replace(')', ', 0.4)'));
      coreGradient.addColorStop(1, colorStr.replace('rgb', 'rgba').replace(')', ', 0)'));
      ctx.fillStyle = coreGradient;
      ctx.fillRect(-radius, -radius, radius * 2, radius * 2);

      // Draw spiral arms (simplified at this scale)
      if (radius > 5) {
        ctx.strokeStyle = colorStr.replace('rgb', 'rgba').replace(')', ', 0.3)');
        ctx.lineWidth = Math.max(1, radius / 20);
        ctx.globalCompositeOperation = 'screen';

        for (let arm = 0; arm < arms; arm++) {
          ctx.beginPath();
          const armStartAngle = (Math.PI * 2 / arms) * arm;
          for (let r = 0; r < radius; r += radius / 20) {
            const angle = armStartAngle + armTightness * Math.log(r + 1);
            const x = Math.cos(angle) * r;
            const y = Math.sin(angle) * r;
            if (r === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }

        ctx.globalCompositeOperation = 'source-over';
      }
    }

    /**
     * Draw elliptical galaxy
     */
    drawEllipticalGalaxy(ctx, data, radius, colorStr) {
      const eccentricity = data.eccentricity || 0.5;
      const radiusX = radius;
      const radiusY = radius * (1 - eccentricity * 0.5);

      // Smooth elliptical gradient
      ctx.save();
      ctx.scale(1, radiusY / radiusX);
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radiusX);
      gradient.addColorStop(0, colorStr.replace('rgb', 'rgba').replace(')', ', 0.9)'));
      gradient.addColorStop(0.5, colorStr.replace('rgb', 'rgba').replace(')', ', 0.5)'));
      gradient.addColorStop(1, colorStr.replace('rgb', 'rgba').replace(')', ', 0)'));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, radiusX, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    /**
     * Draw irregular galaxy
     */
    drawIrregularGalaxy(ctx, data, radius, colorStr) {
      // Create chaotic, patchy appearance
      const rng = new RandomGenerator(data.name);
      const numPatches = Math.floor(radius / 5) + 3;

      for (let i = 0; i < numPatches; i++) {
        const patchX = (rng.random() - 0.5) * radius * 1.5;
        const patchY = (rng.random() - 0.5) * radius * 1.5;
        const patchRadius = radius * (0.2 + rng.random() * 0.4);

        const gradient = ctx.createRadialGradient(patchX, patchY, 0, patchX, patchY, patchRadius);
        gradient.addColorStop(0, colorStr.replace('rgb', 'rgba').replace(')', ', 0.6)'));
        gradient.addColorStop(1, colorStr.replace('rgb', 'rgba').replace(')', ', 0)'));
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(patchX, patchY, patchRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    /**
     * Draw dwarf galaxy
     */
    drawDwarfGalaxy(ctx, data, radius, colorStr) {
      // Small, diffuse glow
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
      gradient.addColorStop(0, colorStr.replace('rgb', 'rgba').replace(')', ', 0.5)'));
      gradient.addColorStop(0.6, colorStr.replace('rgb', 'rgba').replace(')', ', 0.2)'));
      gradient.addColorStop(1, colorStr.replace('rgb', 'rgba').replace(')', ', 0)'));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    /**
     * Checks if a position is within the Great Attractor anomalous region
     */
    isInGreatAttractor(worldX, worldY) {
      // Find Great Attractor in SUPERCLUSTERS database
      let gaX = 1133 * MLY_TO_LY;
      let gaY = -176 * MLY_TO_LY;
      let gaRadius = 50 * MLY_TO_LY; // Anomalous region radius

      // Try to get from SUPERCLUSTERS if available
      for (const sc of SUPERCLUSTERS) {
        if (sc.name === "Great Attractor") {
          gaX = sc.x * MLY_TO_LY;
          gaY = sc.y * MLY_TO_LY;
          break;
        }
      }

      const dx = worldX - gaX;
      const dy = worldY - gaY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      return dist <= gaRadius;
    }

    /**
     * Draw procedural galaxy interior (stars, arms, core) for any galaxy
     * @param {object} galaxy - Galaxy data object
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} width - Canvas width
     * @param {number} height - Canvas height
     */
    drawProceduralGalaxyInterior(galaxy, ctx, width, height) {
      // Galaxy parameters based on type
      const GALAXY_CENTER_X = galaxy.x;
      const GALAXY_CENTER_Y = galaxy.y;
      const CORE_RADIUS = Math.min(2500, galaxy.radius * 0.2);
      const GALAXY_RADIUS = galaxy.radius;

      // OPTIMIZATION: Check if in Great Attractor for simpler rendering
      const inGreatAttractor = galaxy.isGreatAttractor || this.isInGreatAttractor(galaxy.x, galaxy.y);

      // Use galaxy-specific RNG for consistent generation
      const galaxyRng = new RandomGenerator(`galaxy_interior_${Math.floor(galaxy.x)}_${Math.floor(galaxy.y)}`);

      // Determine spiral parameters based on galaxy type
      let NUM_ARMS, ARM_TIGHTNESS, ARM_WIDTH;
      if (galaxy.type === GALAXY_TYPE_SPIRAL) {
        NUM_ARMS = galaxy.arms || 2 + Math.floor(galaxyRng.random() * 4);
        ARM_TIGHTNESS = galaxy.armTightness || 0.5 + galaxyRng.random() * 0.5;
        ARM_WIDTH = GALAXY_RADIUS * 0.12;
      } else {
        // Elliptical or irregular - less pronounced structure
        NUM_ARMS = 0;
        ARM_TIGHTNESS = 0;
        ARM_WIDTH = 0;
      }

      // Color palette based on galaxy color
      const baseColor = galaxy.color || { r: 200, g: 200, b: 220 };
      const CORE_COLOR = `rgba(${Math.min(255, baseColor.r + 50)}, ${Math.min(255, baseColor.g + 30)}, ${Math.min(255, baseColor.b)}, 0.2)`;

      // Calculate visible bounds
      const topLeft = this.camera.screenToWorld(0, 0, width, height);
      const bottomRight = this.camera.screenToWorld(width, height, width, height);
      const padding = 200 / this.camera.zoom;
      const minX = topLeft.x - padding;
      const maxX = bottomRight.x + padding;
      const minY = topLeft.y - padding;
      const maxY = bottomRight.y + padding;

      // PERFORMANCE: Dynamic clustering for procedural galaxies
      // Use clustering from local group zoom transition (0.02159) through mid-range detail
      // This provides smooth performance when zooming into galaxy view from local group
      const CLUSTERING_START = SCALE_THRESHOLDS[SCALE_GALAXY]; // 0.02159 - galaxy view threshold
      const CLUSTERING_END = 0.5; // Stop clustering at 0.5 zoom for individual star detail
      const useClusteringMode = this.camera.zoom >= CLUSTERING_START && this.camera.zoom < CLUSTERING_END;

      // Adaptive grid size based on zoom
      let gridSize = 100;
      if (this.camera.zoom < 0.1) {
        gridSize = 500;
      } else if (useClusteringMode) {
        // Use larger grid cells for clustering in this zoom range
        gridSize = 500;
      } else if (this.camera.zoom < 0.5) {
        gridSize = 250;
      } else if (this.camera.zoom < 2) {
        gridSize = 150;
      }

      const startGridX = Math.floor(minX / gridSize) * gridSize;
      const startGridY = Math.floor(minY / gridSize) * gridSize;
      const endGridX = Math.ceil(maxX / gridSize) * gridSize;
      const endGridY = Math.ceil(maxY / gridSize) * gridSize;

      // Performance check
      const gridCellsX = Math.ceil((endGridX - startGridX) / gridSize);
      const gridCellsY = Math.ceil((endGridY - startGridY) / gridSize);
      const totalCells = gridCellsX * gridCellsY;

      if (totalCells > 10000) {
        ctx.globalAlpha = 1;
        return;
      }

      // Draw core glow
      const coreScreen = this.camera.worldToScreen(GALAXY_CENTER_X, GALAXY_CENTER_Y, width, height);
      const coreRadiusScreen = (CORE_RADIUS * 2.5) * this.camera.zoom;

      if (coreRadiusScreen > 5) {
        const gradient = ctx.createRadialGradient(
          coreScreen.x, coreScreen.y, 0,
          coreScreen.x, coreScreen.y, coreRadiusScreen
        );
        gradient.addColorStop(0, CORE_COLOR);
        gradient.addColorStop(0.3, CORE_COLOR.replace('0.2', '0.1'));
        gradient.addColorStop(1, CORE_COLOR.replace('0.2', '0'));
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
      }

      // Use standard grid steps for consistent star generation
      const gridStep = gridSize;

      // Draw stars
      for (let gx = startGridX; gx <= endGridX; gx += gridStep) {
        for (let gy = startGridY; gy <= endGridY; gy += gridStep) {
          const seedRng = new RandomGenerator(`star_${galaxy.x}_${galaxy.y}_${gx}_${gy}`);

          const dx = gx - GALAXY_CENTER_X;
          const dy = gy - GALAXY_CENTER_Y;
          const distFromCenter = Math.sqrt(dx * dx + dy * dy);
          const angleFromCenter = Math.atan2(dy, dx);

          if (distFromCenter > GALAXY_RADIUS) continue;

          // Calculate density based on structure
          let densityMultiplier = 0;
          let inArm = false;

          if (distFromCenter < CORE_RADIUS) {
            // Core
            const coreProgress = distFromCenter / CORE_RADIUS;
            densityMultiplier = 1.0 + 2.0 * (1.0 - coreProgress);
          } else if (galaxy.type === GALAXY_TYPE_SPIRAL && NUM_ARMS > 0) {
            // Spiral arms
            let minDistToArm = Infinity;

            for (let arm = 0; arm < NUM_ARMS; arm++) {
              const armStartAngle = ((Math.PI * 2) / NUM_ARMS) * arm;
              const distForLog = Math.max(1, distFromCenter - CORE_RADIUS);
              const spiralAngle = armStartAngle + ARM_TIGHTNESS * Math.log(distForLog);

              let angleDiff = angleFromCenter - spiralAngle;
              while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
              while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

              const perpDist = Math.abs(angleDiff * distFromCenter);
              if (perpDist < minDistToArm) minDistToArm = perpDist;
            }

            if (minDistToArm < ARM_WIDTH) {
              const armProgress = minDistToArm / ARM_WIDTH;
              densityMultiplier = 1.5 * Math.exp(-3 * armProgress * armProgress);
              inArm = true;
            } else if (minDistToArm < ARM_WIDTH * 2) {
              const nearArmProgress = (minDistToArm - ARM_WIDTH) / ARM_WIDTH;
              densityMultiplier = 0.3 * (1.0 - nearArmProgress);
            } else {
              densityMultiplier = 0.05;
            }

            // Radial falloff
            const radialProgress = (distFromCenter - CORE_RADIUS) / (GALAXY_RADIUS - CORE_RADIUS);
            const radialFalloff = 1.0 - Math.pow(radialProgress, 2.0);
            densityMultiplier *= radialFalloff;
          } else {
            // Elliptical or irregular - smooth radial falloff
            const radialProgress = distFromCenter / GALAXY_RADIUS;
            densityMultiplier = Math.max(0.1, 1.0 - radialProgress);
          }

          densityMultiplier = Math.max(0, Math.min(3.0, densityMultiplier));
          if (seedRng.random() > Math.min(1.0, densityMultiplier)) continue;

          // CLUSTERING MODE: Render entire grid cell as a single glow for mid-zoom
          if (useClusteringMode) {
            const clusterCenterX = gx + gridSize / 2;
            const clusterCenterY = gy + gridSize / 2;

            // Determine cluster color based on location
            let clusterColor = "rgba(255, 240, 190, 0.9)"; // Default yellow
            const colorRoll = seedRng.random();
            if (colorRoll < 0.2) clusterColor = "rgba(180, 210, 255, 0.9)";
            else if (colorRoll < 0.6) clusterColor = "rgba(255, 255, 255, 0.9)";
            else if (colorRoll < 0.8) clusterColor = "rgba(255, 240, 190, 0.9)";
            else clusterColor = "rgba(255, 180, 150, 0.9)";

            const clusterSize = (gridSize / 2) * Math.min(1.5, densityMultiplier);
            const intensity = Math.min(1.0, densityMultiplier);

            this.drawStarCluster(
              clusterCenterX, clusterCenterY,
              clusterSize, clusterColor, intensity,
              ctx, width, height
            );

            continue;
          }

          // NORMAL MODE: Render individual stars and star systems
          const baseStarsPerCell = Math.max(1, Math.floor((gridSize / 100) * 9));
          const numStars = Math.max(1, Math.floor(baseStarsPerCell * Math.min(1.5, densityMultiplier)));

          for (let i = 0; i < numStars; i++) {
            const worldX = gx + seedRng.random() * gridSize;
            const worldY = gy + seedRng.random() * gridSize;

            const screen = this.camera.worldToScreen(worldX, worldY, width, height);

            if (screen.x < -10 || screen.x > width + 10 || screen.y < -10 || screen.y > height + 10) continue;

            // DYNAMIC STAR SYSTEM GENERATION (like Milky Way)
            const STAR_SYSTEM_ZOOM_THRESHOLD = 2.0;

            if (this.camera.zoom >= STAR_SYSTEM_ZOOM_THRESHOLD) {
              // Calculate distance from galactic center for density-based generation
              const dx_center = worldX - GALAXY_CENTER_X;
              const dy_center = worldY - GALAXY_CENTER_Y;
              const distFromGalacticCore = Math.sqrt(dx_center * dx_center + dy_center * dy_center);

              // Determine system generation probability based on distance from core
              const SYSTEM_DENSITY_SCALE = 0.15; // 15% of background stars become systems

              let systemGenerationChance = 0;

              if (distFromGalacticCore < CORE_RADIUS) {
                // Core region: Higher density
                const coreMultiplier = 0.3 + (0.7 * (1.0 - distFromGalacticCore / CORE_RADIUS));
                systemGenerationChance = coreMultiplier * SYSTEM_DENSITY_SCALE;
              } else {
                // Outside core: use spiral arm density
                systemGenerationChance = densityMultiplier * SYSTEM_DENSITY_SCALE * 0.5;
              }

              // Only generate if we pass the probability check
              if (seedRng.random() > systemGenerationChance) {
                // Render as background star
                const starSize = 0.5 + seedRng.random() * 1.5;
                const brightness = 0.5 + seedRng.random() * 0.5;

                const colorRoll = seedRng.random();
                let starColor;
                if (colorRoll < 0.1) {
                  starColor = `rgba(180, 210, 255, ${brightness})`;
                } else if (colorRoll < 0.6) {
                  starColor = `rgba(255, 255, 255, ${brightness})`;
                } else if (colorRoll < 0.9) {
                  starColor = `rgba(255, 240, 190, ${brightness})`;
                } else {
                  starColor = `rgba(255, 180, 150, ${brightness})`;
                }

                ctx.fillStyle = starColor;
                if (starSize < 1.2) {
                  ctx.fillRect(Math.floor(screen.x), Math.floor(screen.y), 1, 1);
                } else {
                  ctx.beginPath();
                  ctx.arc(screen.x, screen.y, starSize / 2, 0, Math.PI * 2);
                  ctx.fill();
                }
              } else {
                // Generate a star system
                const starName = this.generateRealisticStarName(worldX, worldY, seedRng);

                // Check if system already exists in dataManager
                let system = this.dataManager.systems.get(starName);

                if (!system) {
                  // Generate new system on-the-fly
                  system = this.dataManager.generateSingleProceduralSystem(
                    worldX,
                    worldY,
                    0, // z coordinate
                    starName,
                    seedRng
                  );

                  if (system) {
                    // Determine black hole type for this system
                    const inGreatAttractor = this.isInGreatAttractor(worldX, worldY);
                    const bhType = this.determineBlackHoleType(worldX, worldY, seedRng, inGreatAttractor);

                    if (bhType) {
                      system.blackHoleType = bhType;
                      // Assign procedural name for black holes
                      system.name = this.generateBlackHoleName(worldX, worldY, seedRng, bhType === 'hypermassive');
                    }

                    // Add to dataManager
                    this.dataManager.systems.set(starName, system);
                  }
                }

                // Skip drawing this as a background star - it will be rendered as a system in drawStars()
                continue;
              }
            } else {
              // Below star system threshold - draw as background star
              const starSize = 0.5 + seedRng.random() * 1.5;
              const brightness = 0.5 + seedRng.random() * 0.5;

              const colorRoll = seedRng.random();
              let starColor;
              if (colorRoll < 0.1) {
                starColor = `rgba(180, 210, 255, ${brightness})`;
              } else if (colorRoll < 0.6) {
                starColor = `rgba(255, 255, 255, ${brightness})`;
              } else if (colorRoll < 0.9) {
                starColor = `rgba(255, 240, 190, ${brightness})`;
              } else {
                starColor = `rgba(255, 180, 150, ${brightness})`;
              }

              ctx.fillStyle = starColor;
              if (starSize < 1.2) {
                ctx.fillRect(Math.floor(screen.x), Math.floor(screen.y), 1, 1);
              } else {
                ctx.beginPath();
                ctx.arc(screen.x, screen.y, starSize / 2, 0, Math.PI * 2);
                ctx.fill();
              }
            }
          }
        }
      }

      ctx.globalAlpha = 1;

      // Draw black hole at galaxy center (distribution: 89% supermassive, 1% hypermassive, 10% none)
      // Create a simple system object for black hole rendering
      if (this.camera.zoom >= 0.05) { // Only visible when sufficiently zoomed in
        // Determine if this galaxy has a central black hole
        const bhRng = new RandomGenerator(`bh_center_${Math.floor(galaxy.x)}_${Math.floor(galaxy.y)}`);
        const bhRoll = bhRng.random();

        let bhType = null;
        let smBHName = null;

        if (bhRoll < 0.89) {
          // 89% chance: Supermassive black hole
          bhType = 'supermassive';
          smBHName = (galaxy.x === 0 && galaxy.y === 0)
            ? "Sagittarius A*" // Default for Milky Way
            : this.generateBlackHoleName(galaxy.x, galaxy.y, bhRng, false);
        } else if (bhRoll < 0.90) {
          // 1% chance: Hypermassive black hole
          bhType = 'hypermassive';
          smBHName = this.generateBlackHoleName(galaxy.x, galaxy.y, bhRng, true);
        }
        // else: 10% chance: No black hole at center

        // Only draw if galaxy has a central black hole
        if (bhType) {
          const blackHoleSystem = {
            position: { x: GALAXY_CENTER_X, y: GALAXY_CENTER_Y, z: 0 },
            name: smBHName,
            blackHoleType: bhType
          };

          if (bhType === 'hypermassive') {
            this.drawHypermassiveBlackHole(ctx, width, height, blackHoleSystem);
          } else {
            this.drawSupermassiveBlackHole(ctx, width, height, blackHoleSystem, galaxy.x !== 0 || galaxy.y !== 0);
          }
        }
      }
      // Draw star systems (generated at higher zoom levels)
      this.drawStars(ctx, width, height);
    }

    /**
     * Draw Local Group galaxies
     */
    drawLocalGroup(ctx, width, height) {
      // Draw galaxy filaments first (so they appear behind the main galaxies)

      // Calculate visible bounds for culling
      const topLeft = this.camera.screenToWorld(0, 0, width, height);
      const bottomRight = this.camera.screenToWorld(width, height, width, height);
      const padding = 5000 * KLY_TO_LY / this.camera.zoom; // Generous padding

      // Check if we should use procedural or hardcoded data
      if (this.proceduralLocalGroup) {
        // Draw procedural local group (away from center)
        for (const galaxy of this.proceduralLocalGroup) {
          // Cull off-screen galaxies
          if (galaxy.x < topLeft.x - padding || galaxy.x > bottomRight.x + padding ||
            galaxy.y < topLeft.y - padding || galaxy.y > bottomRight.y + padding) {
            continue;
          }

          // Draw with labels enabled for procedural galaxies
          this.drawGalaxy(galaxy, ctx, width, height, true);
        }

        // Draw label for this local group's supercluster
        if (this.focusedSupercluster && this.camera.zoom < 0.00005) {
          ctx.fillStyle = COLORS.textHighlight;
          ctx.font = '18px monospace';
          ctx.textAlign = 'center';
          ctx.globalAlpha = 0.8;
          const scScreen = this.camera.worldToScreen(
            this.focusedSupercluster.x,
            this.focusedSupercluster.y,
            width, height
          );
          ctx.fillText(this.focusedSupercluster.name + ' Local Group', scScreen.x, scScreen.y - 50);
          ctx.globalAlpha = 1;
        }
      } else {
        // Draw hardcoded Local Group (at center)
        for (const galaxy of LOCAL_GROUP_GALAXIES) {
          // Convert kly to ly for rendering
          const x = galaxy.x * KLY_TO_LY;
          const y = galaxy.y * KLY_TO_LY;

          // Cull off-screen galaxies
          if (x < topLeft.x - padding || x > bottomRight.x + padding ||
            y < topLeft.y - padding || y > bottomRight.y + padding) {
            continue;
          }

          const galaxyData = {
            ...galaxy,
            x: x,
            y: y,
            radius: galaxy.radius * KLY_TO_LY
          };
          this.drawGalaxy(galaxyData, ctx, width, height, true);
        }

        // Generate procedural dwarf galaxies to fill the space
        const rng = new RandomGenerator('local_group_procedural');
        const numProceduralDwarfs = 30;

        for (let i = 0; i < numProceduralDwarfs; i++) {
          const angle = rng.random() * Math.PI * 2;
          const distance = (1000 + rng.random() * 4000) * KLY_TO_LY; // 1000-5000 kly
          const x = Math.cos(angle) * distance;
          const y = Math.sin(angle) * distance;

          // Cull off-screen galaxies
          if (x < topLeft.x - padding || x > bottomRight.x + padding ||
            y < topLeft.y - padding || y > bottomRight.y + padding) {
            continue;
          }

          const dwarf = {
            name: generateProceduralGalaxyName(x, y, rng),
            x: x,
            y: y,
            radius: (0.5 + rng.random() * 2) * KLY_TO_LY, // 0.5-2.5 kly
            type: rng.random() > 0.5 ? GALAXY_TYPE_DWARF_SPHEROIDAL : GALAXY_TYPE_IRREGULAR,
            mass: 1e7 + rng.random() * 5e7,
            rotation: rng.random() * Math.PI * 2,
            color: {
              r: 200 + Math.floor(rng.random() * 55),
              g: 200 + Math.floor(rng.random() * 55),
              b: 200 + Math.floor(rng.random() * 55)
            }
          };

          // Draw with labels enabled for procedural galaxies
          this.drawGalaxy(dwarf, ctx, width, height, true);
        }

        // Draw label for Local Group at center
        if (this.camera.zoom < 0.00005) {
          ctx.fillStyle = COLORS.textHighlight;
          ctx.font = '18px monospace';
          ctx.textAlign = 'center';
          ctx.globalAlpha = 0.8;
          const centerScreen = this.camera.worldToScreen(0, 0, width, height);
          ctx.fillText('LOCAL GROUP', centerScreen.x, centerScreen.y - 50);
          ctx.globalAlpha = 1;
        }
      }

    }

    /**
     * Draw Virgo Supercluster
     */
    drawVirgoSupercluster(ctx, width, height) {

      // Virgo cluster center is ~55 Mly from us
      const VIRGO_CENTER_X = 50 * MLY_TO_LY;
      const VIRGO_CENTER_Y = 20 * MLY_TO_LY;

      // Calculate visible bounds for culling
      const topLeft = this.camera.screenToWorld(0, 0, width, height);
      const bottomRight = this.camera.screenToWorld(width, height, width, height);
      const padding = 20 * MLY_TO_LY / this.camera.zoom;

      // Draw Local Group galaxies (including Milky Way) at this scale
      for (const galaxy of LOCAL_GROUP_GALAXIES) {
        const x = galaxy.x * KLY_TO_LY;
        const y = galaxy.y * KLY_TO_LY;

        // Cull off-screen
        if (x < topLeft.x - padding || x > bottomRight.x + padding ||
          y < topLeft.y - padding || y > bottomRight.y + padding) {
          continue;
        }

        const galaxyData = {
          ...galaxy,
          x: x,
          y: y,
          radius: galaxy.radius * KLY_TO_LY
        };
        this.drawGalaxy(galaxyData, ctx, width, height, false);
      }

      // Generate galaxy clusters procedurally
      const rng = new RandomGenerator('virgo_supercluster');
      const numClusters = 15;
      let totalGalaxiesDrawn = 0;
      const MAX_GALAXIES = 500; // Performance limit

      for (let cluster = 0; cluster < numClusters; cluster++) {
        const clusterAngle = rng.random() * Math.PI * 2;
        const clusterDist = rng.random() * 60 * MLY_TO_LY;
        const clusterX = VIRGO_CENTER_X + Math.cos(clusterAngle) * clusterDist;
        const clusterY = VIRGO_CENTER_Y + Math.sin(clusterAngle) * clusterDist;

        // Skip entire cluster if off-screen
        if (clusterX < topLeft.x - padding || clusterX > bottomRight.x + padding ||
          clusterY < topLeft.y - padding || clusterY > bottomRight.y + padding) {
          continue;
        }

        // Each cluster has many galaxies
        const galaxiesInCluster = 30 + Math.floor(rng.random() * 70);

        for (let i = 0; i < galaxiesInCluster; i++) {
          if (totalGalaxiesDrawn >= MAX_GALAXIES) break; // Performance limit

          const angle = rng.random() * Math.PI * 2;
          const dist = rng.random() * 5 * MLY_TO_LY; // Cluster radius
          const x = clusterX + Math.cos(angle) * dist;
          const y = clusterY + Math.sin(angle) * dist;

          // Cull individual galaxies
          if (x < topLeft.x - padding || x > bottomRight.x + padding ||
            y < topLeft.y - padding || y > bottomRight.y + padding) {
            continue;
          }

          // Determine galaxy type
          const typeRoll = rng.random();
          let type, arms, eccentricity;
          if (typeRoll < 0.6) {
            type = GALAXY_TYPE_SPIRAL;
            arms = 2 + Math.floor(rng.random() * 4);
          } else if (typeRoll < 0.9) {
            type = GALAXY_TYPE_ELLIPTICAL;
            eccentricity = rng.random() * 0.8;
          } else {
            type = GALAXY_TYPE_IRREGULAR;
          }

          const galaxy = {
            name: generateProceduralGalaxyName(x, y, rng),
            x: x,
            y: y,
            radius: (20 + rng.random() * 80) * KLY_TO_LY, // 20-100 kly
            type: type,
            arms: arms,
            armTightness: 0.5 + rng.random() * 0.5,
            eccentricity: eccentricity,
            rotation: rng.random() * Math.PI * 2,
            color: {
              r: 180 + Math.floor(rng.random() * 75),
              g: 190 + Math.floor(rng.random() * 65),
              b: 200 + Math.floor(rng.random() * 55)
            }
          };

          this.drawGalaxy(galaxy, ctx, width, height, false);
          totalGalaxiesDrawn++;
        }

        if (totalGalaxiesDrawn >= MAX_GALAXIES) break; // Exit outer loop too
      }

      // GREAT ATTRACTOR: Anomalous region of pure black holes
      // Located at Laniakea Supercluster coordinates
      // OPTIMIZATION: Cache GA center position to avoid repeated SUPERCLUSTERS search
      if (!this.gaAttractorCache) {
        this.gaAttractorCache = { x: 1133 * MLY_TO_LY, y: -176 * MLY_TO_LY };
        for (const sc of SUPERCLUSTERS) {
          if (sc.name === "Great Attractor") {
            this.gaAttractorCache.x = sc.x * MLY_TO_LY;
            this.gaAttractorCache.y = sc.y * MLY_TO_LY;
            break;
          }
        }
      }

      const GREAT_ATTRACTOR_X = this.gaAttractorCache.x;
      const GREAT_ATTRACTOR_Y = this.gaAttractorCache.y;
      const GREAT_ATTRACTOR_RADIUS = 50 * MLY_TO_LY;

      // Draw Great Attractor anomalous region
      if (GREAT_ATTRACTOR_X >= topLeft.x - padding && GREAT_ATTRACTOR_X <= bottomRight.x + padding &&
        GREAT_ATTRACTOR_Y >= topLeft.y - padding && GREAT_ATTRACTOR_Y <= bottomRight.y + padding) {

        // OPTIMIZATION: Adaptive galaxy count based on zoom level
        let galaxiesInAttractor = 40;
        if (this.camera.zoom < 0.000001) galaxiesInAttractor = 10;    // Very far: minimal
        else if (this.camera.zoom < 0.00001) galaxiesInAttractor = 20; // Far: reduced
        else if (this.camera.zoom < 0.0001) galaxiesInAttractor = 30;  // Medium: moderate

        // Render distorted, sinister black hole galaxies in Great Attractor
        const gaRng = new RandomGenerator('great_attractor');
        let renderedCount = 0;

        for (let i = 0; i < 40; i++) { // Always generate 40, but skip based on zoom
          // OPTIMIZATION: Skip random galaxies based on zoom to reduce rendering
          if (renderedCount >= galaxiesInAttractor) break;
          if (this.camera.zoom < 0.00001 && gaRng.random() > 0.5) continue; // Skip 50% when far

          const angle = gaRng.random() * Math.PI * 2;
          const dist = gaRng.random() * GREAT_ATTRACTOR_RADIUS;
          const x = GREAT_ATTRACTOR_X + Math.cos(angle) * dist;
          const y = GREAT_ATTRACTOR_Y + Math.sin(angle) * dist;

          // OPTIMIZATION: Aggressive culling before processing
          if (x < topLeft.x - padding || x > bottomRight.x + padding ||
            y < topLeft.y - padding || y > bottomRight.y + padding) {
            continue;
          }

          // OPTIMIZATION: Simpler rendering at distance
          let galaxyRadius = (30 + gaRng.random() * 60) * KLY_TO_LY;
          if (this.camera.zoom < 0.00001) {
            galaxyRadius *= 0.6; // Smaller appearance when far
          }

          // All galaxies in Great Attractor are anomalous black hole systems
          const galaxy = {
            name: `${generateProceduralGalaxyName(x, y, gaRng)} [VOID]`,
            x: x,
            y: y,
            radius: galaxyRadius,
            type: GALAXY_TYPE_IRREGULAR, // All distorted by gravity
            arms: 0,
            color: {
              r: 50 + Math.floor(gaRng.random() * 50),   // Dark reds/browns
              g: 20 + Math.floor(gaRng.random() * 30),
              b: 40 + Math.floor(gaRng.random() * 50)    // Purple/red tones
            },
            isGreatAttractor: true // Flag for special rendering
          };

          // OPTIMIZATION: Skip full rendering when very far, use simple circles instead
          if (this.camera.zoom < 0.000001) {
            // Ultra-distant: just draw a small circle
            const screen = this.camera.worldToScreen(x, y, width, height);
            if (screen.x >= -50 && screen.x <= width + 50 && screen.y >= -50 && screen.y <= height + 50) {
              const screenSize = Math.max(2, galaxyRadius * this.camera.zoom);
              ctx.fillStyle = `rgba(${galaxy.color.r}, ${galaxy.color.g}, ${galaxy.color.b}, 0.6)`;
              ctx.beginPath();
              ctx.arc(screen.x, screen.y, screenSize, 0, Math.PI * 2);
              ctx.fill();
            }
          } else {
            // Close enough: full galaxy rendering
            this.drawGalaxy(galaxy, ctx, width, height, false);
          }

          renderedCount++;
        }

        // OPTIMIZATION: Only draw glow and border when reasonably visible
        const screen = this.camera.worldToScreen(GREAT_ATTRACTOR_X, GREAT_ATTRACTOR_Y, width, height);
        const screenRadius = GREAT_ATTRACTOR_RADIUS * this.camera.zoom;

        if (screenRadius > 10) { // Only if significantly visible (was 5)
          const gradient = ctx.createRadialGradient(
            screen.x, screen.y, 0,
            screen.x, screen.y, screenRadius
          );
          gradient.addColorStop(0, 'rgba(100, 0, 0, 0.2)');  // Reduced alpha
          gradient.addColorStop(0.5, 'rgba(60, 0, 20, 0.1)');
          gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, width, height);

          // OPTIMIZATION: Simpler border at distance
          if (screenRadius > 50) { // Only full border when large enough
            ctx.strokeStyle = 'rgba(150, 30, 30, 0.4)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(screen.x, screen.y, screenRadius, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }

      // Draw labels
      if (this.camera.zoom < 0.000005) {
        ctx.fillStyle = COLORS.textHighlight;
        ctx.font = '20px monospace';
        ctx.textAlign = 'center';
        ctx.globalAlpha = 0.9;
        const centerScreen = this.camera.worldToScreen(VIRGO_CENTER_X, VIRGO_CENTER_Y, width, height);
        ctx.fillText('VIRGO SUPERCLUSTER', centerScreen.x, centerScreen.y);
        ctx.globalAlpha = 1;
      }

      // Great Attractor label (visible at appropriate zoom)
      if (this.camera.zoom < 0.00001) {
        ctx.fillStyle = 'rgba(200, 50, 50, 0.8)';
        ctx.font = 'bold 24px monospace';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 10;
        const attractorScreen = this.camera.worldToScreen(GREAT_ATTRACTOR_X, GREAT_ATTRACTOR_Y, width, height);
        ctx.fillText('GREAT ATTRACTOR', attractorScreen.x, attractorScreen.y);
        ctx.shadowColor = 'transparent';
      }
    }

    /**
     * Draw Observable Universe with galaxy filaments
     */
    drawObservableUniverse(ctx, width, height) {
      // Calculate visible bounds for culling
      const topLeft = this.camera.screenToWorld(0, 0, width, height);
      const bottomRight = this.camera.screenToWorld(width, height, width, height);
      const padding = 500 * MLY_TO_LY / this.camera.zoom;

      // Draw Local Group galaxies (including Milky Way) at this scale
      for (const galaxy of LOCAL_GROUP_GALAXIES) {
        const x = galaxy.x * KLY_TO_LY;
        const y = galaxy.y * KLY_TO_LY;

        // Cull off-screen
        if (x < topLeft.x - padding || x > bottomRight.x + padding ||
          y < topLeft.y - padding || y > bottomRight.y + padding) {
          continue;
        }

        const galaxyData = {
          ...galaxy,
          x: x,
          y: y,
          radius: galaxy.radius * KLY_TO_LY
        };
        this.drawGalaxy(galaxyData, ctx, width, height, false);
      }

      // Simplified radial cluster distribution
      const rng = new RandomGenerator('observable_universe');
      const numClusters = 100;
      const maxDist = 4000 * MLY_TO_LY; // ~8 Gly diameter
      let totalGalaxiesDrawn = 0;
      const MAX_GALAXIES = 300; // Performance limit

      for (let i = 0; i < numClusters; i++) {
        if (totalGalaxiesDrawn >= MAX_GALAXIES) break;

        const angle = rng.random() * Math.PI * 2;
        const dist = Math.pow(rng.random(), 0.7) * maxDist; // Bias towards edges
        const clusterX = Math.cos(angle) * dist;
        const clusterY = Math.sin(angle) * dist;

        // Skip cluster if off-screen
        if (clusterX < topLeft.x - padding || clusterX > bottomRight.x + padding ||
          clusterY < topLeft.y - padding || clusterY > bottomRight.y + padding) {
          continue;
        }

        // Each cluster has galaxies
        const numGalaxies = 10 + Math.floor(rng.random() * 30);

        for (let j = 0; j < numGalaxies; j++) {
          if (totalGalaxiesDrawn >= MAX_GALAXIES) break;

          const gAngle = rng.random() * Math.PI * 2;
          const gDist = rng.random() * 10 * MLY_TO_LY;
          const x = clusterX + Math.cos(gAngle) * gDist;
          const y = clusterY + Math.sin(gAngle) * gDist;

          // Cull off-screen galaxies
          if (x < topLeft.x - padding || x > bottomRight.x + padding ||
            y < topLeft.y - padding || y > bottomRight.y + padding) {
            continue;
          }

          const typeRoll = rng.random();
          let type;
          if (typeRoll < 0.6) type = GALAXY_TYPE_SPIRAL;
          else if (typeRoll < 0.9) type = GALAXY_TYPE_ELLIPTICAL;
          else type = GALAXY_TYPE_IRREGULAR;

          const galaxy = {
            name: generateProceduralGalaxyName(x, y, rng),
            x: x,
            y: y,
            radius: (40 + rng.random() * 60) * KLY_TO_LY,
            type: type,
            arms: 2 + Math.floor(rng.random() * 4),
            armTightness: 0.5 + rng.random() * 0.5,
            eccentricity: rng.random() * 0.8,
            rotation: rng.random() * Math.PI * 2,
            color: {
              r: 170 + Math.floor(rng.random() * 85),
              g: 175 + Math.floor(rng.random() * 80),
              b: 180 + Math.floor(rng.random() * 75)
            }
          };

          this.drawGalaxy(galaxy, ctx, width, height, false);
          totalGalaxiesDrawn++;
        }
      }

      // Draw "Observable Universe" label at center
      if (this.camera.zoom < 0.00000005) {
        ctx.fillStyle = COLORS.textHighlight;
        ctx.font = '28px monospace';
        ctx.textAlign = 'center';
        ctx.globalAlpha = 1;
        const centerScreen = this.camera.worldToScreen(0, 0, width, height);
        ctx.fillText('OBSERVABLE UNIVERSE', centerScreen.x, centerScreen.y);
        ctx.font = '14px monospace';
        ctx.fillText('~93 Gly diameter', centerScreen.x, centerScreen.y + 25);
        ctx.globalAlpha = 1;
      }
    }

    /**
     * Draw cosmic web filaments (galaxy filaments connecting superclusters)
     * This scale shows the large-scale structure of the universe
     */
    drawCosmicWeb(ctx, width, height) {
      // Calculate visible bounds
      const topLeft = this.camera.screenToWorld(0, 0, width, height);
      const bottomRight = this.camera.screenToWorld(width, height, width, height);
      const padding = 2000 * MLY_TO_LY / this.camera.zoom;

      // Use seeded RNG for consistent filament generation
      const rng = new RandomGenerator('cosmic_web');

      // Create nodes array - start with Laniakea superclusters
      const nodes = [];

      // Add Laniakea superclusters as major nodes
      for (const supercluster of SUPERCLUSTERS) {
        nodes.push({
          x: supercluster.x * MLY_TO_LY,
          y: supercluster.y * MLY_TO_LY,
          mass: 2.5, // Higher mass for real superclusters
          name: supercluster.name,
          color: supercluster.color,
          radius: supercluster.radius * MLY_TO_LY,
          isLaniakea: true
        });
      }

      // Add additional procedural nodes for extended cosmic web covering the observable universe
      // Reduced from 300 to 180 for better performance (combined with distance-based label culling)
      const numProceduralNodes = 180;
      const maxDist = 46500 * MLY_TO_LY; // ~93 Gly diameter (observable universe)

      for (let i = 0; i < numProceduralNodes; i++) {
        const angle = rng.random() * Math.PI * 2;
        const dist = Math.pow(rng.random(), 0.6) * maxDist;
        const x = Math.cos(angle) * dist;
        const y = Math.sin(angle) * dist;

        // Generate supercluster with proper name
        const proceduralRng = new RandomGenerator(`supercluster_${i}_${Math.floor(x)}_${Math.floor(y)}`);
        const mass = 0.5 + rng.random() * 1.5;
        const radius = (30 + rng.random() * 40) * MLY_TO_LY; // Variable radius for superclusters

        // Generate color variations
        const hue = rng.random() * 60 + 180; // Blue to cyan range
        const r = Math.floor(150 + rng.random() * 80);
        const g = Math.floor(160 + rng.random() * 80);
        const b = Math.floor(180 + rng.random() * 75);

        nodes.push({
          x: x,
          y: y,
          mass: mass,
          name: generateProceduralSuperclusterName(x, y, proceduralRng),
          color: { r: r, g: g, b: b },
          radius: radius,
          isLaniakea: false,
          isProcedural: true
        });
      }

      // Draw filaments connecting nearby nodes (optimized with spatial approximation)
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 2;

      // Use cached connections if available and camera hasn't moved significantly
      let nodeConnections = null;
      if (this.cosmicWebNodeConnectionsCache && this.lastCameraState) {
        const cameraMovement = Math.abs(this.camera.position.x - this.lastCameraState.x) +
          Math.abs(this.camera.position.y - this.lastCameraState.y);
        if (cameraMovement < 1000 * MLY_TO_LY) { // Only recalculate if camera moved significantly
          nodeConnections = this.cosmicWebNodeConnectionsCache;
        }
      }

      // Calculate connections if not cached
      if (!nodeConnections) {
        nodeConnections = new Map();

        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i];

          // Optimization: Use spatial approximation instead of checking all nodes
          // Only check nearby nodes within a reasonable distance
          const maxConnectionDist = node.isLaniakea ? 200000 * MLY_TO_LY : 150000 * MLY_TO_LY;
          const candidates = [];

          for (let j = 0; j < nodes.length; j++) {
            if (i === j) continue;
            const n = nodes[j];
            const dx = n.x - node.x;
            const dy = n.y - node.y;
            const distSq = dx * dx + dy * dy;

            if (distSq < maxConnectionDist * maxConnectionDist) {
              candidates.push({
                idx: j,
                distSq: distSq
              });
            }
          }

          // Sort only candidates, not all nodes (much faster)
          candidates.sort((a, b) => a.distSq - b.distSq);

          // Connect to nearest neighbors
          const numConnections = node.isLaniakea ?
            Math.min(3 + Math.floor(rng.random() * 3), candidates.length) :
            Math.min(2 + Math.floor(rng.random() * 3), candidates.length);

          nodeConnections.set(i, candidates.slice(0, numConnections));
        }

        this.cosmicWebNodeConnectionsCache = nodeConnections;
        this.lastCameraState = { x: this.camera.position.x, y: this.camera.position.y };
      }

      // Draw the cached connections with artistic layered glow effects
      for (const [nodeIdx, connections] of nodeConnections.entries()) {
        const node = nodes[nodeIdx];

        for (const conn of connections) {
          const targetNode = nodes[conn.idx];

          // Skip if both nodes are off-screen
          const startScreen = this.camera.worldToScreen(node.x, node.y, width, height);
          const endScreen = this.camera.worldToScreen(targetNode.x, targetNode.y, width, height);

          if ((startScreen.x < -100 && endScreen.x < -100) ||
            (startScreen.x > width + 100 && endScreen.x > width + 100) ||
            (startScreen.y < -100 && endScreen.y < -100) ||
            (startScreen.y > height + 100 && endScreen.y > height + 100)) {
            continue;
          }

          // Calculate line width based on node mass (important nodes have thicker lines)
          const lineWidth = 2 + (node.mass + targetNode.mass) * 0.3;

          // LAYER 1: Outer glow (soft, wide, diffuse)
          ctx.globalAlpha = 0.12;
          ctx.lineWidth = lineWidth * 10;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          const glowGradient1 = ctx.createLinearGradient(
            startScreen.x, startScreen.y,
            endScreen.x, endScreen.y
          );
          glowGradient1.addColorStop(0, 'rgba(60, 100, 180, 0.2)');
          glowGradient1.addColorStop(0.5, 'rgba(80, 130, 200, 0.3)');
          glowGradient1.addColorStop(1, 'rgba(60, 100, 180, 0.2)');
          ctx.strokeStyle = glowGradient1;
          ctx.beginPath();
          ctx.moveTo(startScreen.x, startScreen.y);
          ctx.lineTo(endScreen.x, endScreen.y);
          ctx.stroke();

          // LAYER 2: Mid glow (medium transparency)
          ctx.globalAlpha = 0.25;
          ctx.lineWidth = lineWidth * 5;
          const glowGradient2 = ctx.createLinearGradient(
            startScreen.x, startScreen.y,
            endScreen.x, endScreen.y
          );
          glowGradient2.addColorStop(0, 'rgba(100, 140, 220, 0.4)');
          glowGradient2.addColorStop(0.5, 'rgba(120, 160, 240, 0.5)');
          glowGradient2.addColorStop(1, 'rgba(100, 140, 220, 0.4)');
          ctx.strokeStyle = glowGradient2;
          ctx.beginPath();
          ctx.moveTo(startScreen.x, startScreen.y);
          ctx.lineTo(endScreen.x, endScreen.y);
          ctx.stroke();

          // LAYER 3: Core filament (bright, sharp)
          ctx.globalAlpha = 0.75;
          ctx.lineWidth = lineWidth;
          const coreGradient = ctx.createLinearGradient(
            startScreen.x, startScreen.y,
            endScreen.x, endScreen.y
          );

          // Use brighter colors for more vibrant appearance
          let startColor, endColor;
          if (node.isLaniakea && node.color) {
            startColor = `rgba(${Math.min(255, node.color.r + 60)}, ${Math.min(255, node.color.g + 40)}, ${Math.min(255, node.color.b + 30)}, 1)`;
          } else {
            startColor = 'rgba(160, 190, 255, 1)';
          }

          if (targetNode.isLaniakea && targetNode.color) {
            endColor = `rgba(${Math.min(255, targetNode.color.r + 60)}, ${Math.min(255, targetNode.color.g + 40)}, ${Math.min(255, targetNode.color.b + 30)}, 1)`;
          } else {
            endColor = 'rgba(160, 190, 255, 1)';
          }

          coreGradient.addColorStop(0, startColor);
          coreGradient.addColorStop(0.5, 'rgba(180, 210, 255, 1)');
          coreGradient.addColorStop(1, endColor);

          ctx.strokeStyle = coreGradient;
          ctx.beginPath();
          ctx.moveTo(startScreen.x, startScreen.y);
          ctx.lineTo(endScreen.x, endScreen.y);
          ctx.stroke();

          // LAYER 4: Bright core highlight (subtle sparkle)
          ctx.globalAlpha = 0.5;
          ctx.lineWidth = Math.max(1, lineWidth * 0.35);
          ctx.strokeStyle = 'rgba(230, 245, 255, 1)';
          ctx.beginPath();
          ctx.moveTo(startScreen.x, startScreen.y);
          ctx.lineTo(endScreen.x, endScreen.y);
          ctx.stroke();
        }
      }

      ctx.globalAlpha = 1;

      // Draw galaxy clusters at nodes
      let totalGalaxiesDrawn = 0;
      const MAX_GALAXIES = 250;

      for (const node of nodes) {
        if (totalGalaxiesDrawn >= MAX_GALAXIES) break;

        // Skip if off-screen
        if (node.x < topLeft.x - padding || node.x > bottomRight.x + padding ||
          node.y < topLeft.y - padding || node.y > bottomRight.y + padding) {
          continue;
        }

        // Draw galaxy cluster at node
        const numGalaxies = Math.floor(node.mass * (node.isLaniakea ? 15 : 20));
        const clusterRadius = node.isLaniakea ? node.radius * 0.5 : 30 * MLY_TO_LY * node.mass;

        for (let i = 0; i < numGalaxies; i++) {
          if (totalGalaxiesDrawn >= MAX_GALAXIES) break;

          const angle = rng.random() * Math.PI * 2;
          const dist = rng.random() * clusterRadius;
          const x = node.x + Math.cos(angle) * dist;
          const y = node.y + Math.sin(angle) * dist;

          // Cull off-screen
          if (x < topLeft.x - padding || x > bottomRight.x + padding ||
            y < topLeft.y - padding || y > bottomRight.y + padding) {
            continue;
          }

          const galaxy = {
            name: generateProceduralGalaxyName(x, y, rng),
            x: x,
            y: y,
            radius: (30 + rng.random() * 50) * KLY_TO_LY,
            type: rng.random() < 0.7 ? GALAXY_TYPE_SPIRAL : GALAXY_TYPE_ELLIPTICAL,
            arms: 2 + Math.floor(rng.random() * 4),
            armTightness: 0.5 + rng.random() * 0.5,
            eccentricity: rng.random() * 0.7,
            rotation: rng.random() * Math.PI * 2,
            color: node.isLaniakea && node.color ? node.color : {
              r: 150 + Math.floor(rng.random() * 80),
              g: 160 + Math.floor(rng.random() * 80),
              b: 180 + Math.floor(rng.random() * 75)
            }
          };

          this.drawGalaxy(galaxy, ctx, width, height, false);
          totalGalaxiesDrawn++;
        }
      }

      // Draw supercluster labels with distance-based culling (only show when close)
      let labelsDrawn = 0;
      const MAX_LABELS = 50; // Reduced label limit for performance
      const LABEL_SHOW_DISTANCE = 300000 * MLY_TO_LY; // Only show labels within this distance

      for (const node of nodes) {
        if (!node.name || labelsDrawn >= MAX_LABELS) continue;

        // Skip if off-screen
        if (node.x < topLeft.x - padding || node.x > bottomRight.x + padding ||
          node.y < topLeft.y - padding || node.y > bottomRight.y + padding) {
          continue;
        }

        const screenPos = this.camera.worldToScreen(node.x, node.y, width, height);

        // Draw supercluster name only when entering cosmic web view at appropriate zoom
        if (this.camera.zoom > 0.0000000005 && this.camera.zoom < 0.0000091) {
          // Distance-based culling: Only show labels when camera is close to superclusters
          const dx = node.x - this.camera.position.x;
          const dy = node.y - this.camera.position.y;
          const distToCamera = Math.sqrt(dx * dx + dy * dy);

          // Only render labels if within distance threshold
          if (distToCamera > LABEL_SHOW_DISTANCE) {
            continue;
          }

          // Different styles for Laniakea vs procedural superclusters
          if (node.isLaniakea) {
            ctx.fillStyle = COLORS.textHighlight;
            ctx.font = 'bold 14px monospace';
          } else {
            const color = node.color || { r: 150, g: 170, b: 190 };
            ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.9)`;
            ctx.font = '11px monospace';
          }

          ctx.textAlign = 'center';
          ctx.globalAlpha = node.isLaniakea ? 0.95 : 0.75;
          ctx.fillText(node.name, screenPos.x, screenPos.y - 10);
          ctx.globalAlpha = 1;
          labelsDrawn++;
        }
      }

      // Find nearest supercluster to camera position (check all nodes)
      let nearestSupercluster = null;
      let nearestDistance = Infinity;

      for (const node of nodes) {
        if (!node.name) continue;

        const dx = node.x - this.camera.position.x;
        const dy = node.y - this.camera.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < nearestDistance) {
          nearestDistance = dist;
          nearestSupercluster = node;
        }
      }

      // Draw "Cosmic Web" label with nearest supercluster name
      if (this.camera.zoom < 0.00000002) {
        ctx.fillStyle = COLORS.textHighlight;
        ctx.font = '32px monospace';
        ctx.textAlign = 'center';
        ctx.globalAlpha = 1;
        const centerScreen = this.camera.worldToScreen(0, 0, width, height);
        ctx.fillText('COSMIC WEB', centerScreen.x, centerScreen.y - 60);

        // Display nearest supercluster name
        if (nearestSupercluster) {
          ctx.font = '20px monospace';
          const color = nearestSupercluster.color || { r: 180, g: 200, b: 255 };
          ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 1)`;
          ctx.fillText(nearestSupercluster.name, centerScreen.x, centerScreen.y - 20);
        }

        ctx.font = '16px monospace';
        ctx.globalAlpha = 1;
      }
    }

    /**
     * Project a 4D point to 2D screen space using perspective projection
     */
    project4DPoint(x, y, z, w, distance, angle) {
      const scale = distance / (distance + w);
      const rotX = Math.cos(angle) * x - Math.sin(angle) * w;
      const rotW = Math.sin(angle) * x + Math.cos(angle) * w;
      const perspectiveScale = 1 / (1 + rotW * 0.1);
      return {
        x: rotX * perspectiveScale * scale,
        y: y * perspectiveScale * scale,
        z: z,
        depth: rotW
      };
    }

    /**
     * Draw a 4D Hypercube (Tesseract) with rotation - LOD optimized
     */
    drawHypercube(ctx, centerX, centerY, size, rotation, time, zoomFactor, color) {
      // Generate 16 vertices of a 4D hypercube
      const vertices4d = [];
      for (let i = 0; i < 16; i++) {
        vertices4d.push({
          x: (i & 1) ? size : -size,
          y: (i & 2) ? size : -size,
          z: (i & 4) ? size : -size,
          w: (i & 8) ? size : -size
        });
      }

      // Rotate in 4D and project to 2D - ULTRA-SLOW, ETHEREAL rotation
      const slowTime = time * 0.00008; // 3.75x slower - takes 2+ minutes for full rotation
      const angle = slowTime + rotation;
      const projectedVertices = vertices4d.map(v => {
        const p = this.project4DPoint(v.x, v.y, v.z, v.w, 200, angle);
        const scale = zoomFactor * 0.5 + 0.5;
        return {
          x: centerX + p.x * scale,
          y: centerY + p.y * scale,
          depth: p.depth
        };
      });

      // Draw edges - elegant breathing pulse
      ctx.strokeStyle = color;
      const breathingPulse = (Math.sin(time * 0.0002) + 1) * 0.5; // Smooth, gentle breathing
      ctx.lineWidth = Math.max(0.5, 0.7 + breathingPulse * 0.6);
      ctx.globalAlpha = 0.5 + breathingPulse * 0.15;

      // Connect cube edges in 4D topology - ALL EDGES (32 total)
      const edges = [
        [0, 1], [1, 3], [3, 2], [2, 0],
        [4, 5], [5, 7], [7, 6], [6, 4],
        [0, 4], [1, 5], [2, 6], [3, 7],
        [8, 9], [9, 11], [11, 10], [10, 8],
        [12, 13], [13, 15], [15, 14], [14, 12],
        [8, 12], [9, 13], [10, 14], [11, 15],
        [0, 8], [1, 9], [2, 10], [3, 11],
        [4, 12], [5, 13], [6, 14], [7, 15]
      ];

      edges.forEach(([i, j]) => {
        ctx.beginPath();
        ctx.moveTo(projectedVertices[i].x, projectedVertices[i].y);
        ctx.lineTo(projectedVertices[j].x, projectedVertices[j].y);
        ctx.stroke();
      });

      ctx.globalAlpha = 1;
    }

    /**
     * Draw a rotating Hypersphere with beautiful rippling - SLOW & ETHEREAL
     */
    drawHypersphere(ctx, centerX, centerY, baseRadius, dimension, time, zoomFactor, color) {
      // LOD: Reduce detail at lower zoom factors
      const lodFactor = Math.max(0.3, zoomFactor);
      const numRings = Math.floor(2 + lodFactor * 6);
      const numPoints = Math.floor(8 + lodFactor * 24);

      // More zoom-responsive sizing
      const scaledRadius = baseRadius * Math.pow(lodFactor, 0.5);

      // Beautiful, pulsing alpha with compound waves
      const alphaPulse1 = Math.sin(time * 0.0001 + dimension * 0.3) * 0.15;
      const alphaPulse2 = Math.sin(time * 0.00008 + dimension * 0.2) * 0.1;
      ctx.globalAlpha = 0.35 + lodFactor * 0.2 + alphaPulse1 + alphaPulse2;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(0.5, 0.5 + lodFactor * 0.4);

      // Draw distorted rings - SLOW, BREATHING
      for (let ring = 0; ring < numRings; ring++) {
        const ringProgress = ring / numRings;
        const ringRadius = scaledRadius * ringProgress;

        // Ultra-slow ripple with breathing effect
        const ripple = Math.sin(time * 0.00018 + dimension * 0.5 + ring * 0.3) * ringRadius * 0.15;
        const breatheEffect = Math.sin(time * 0.00015 + ring * Math.PI) * ringRadius * 0.08;
        const actualRadius = ringRadius + ripple + breatheEffect;

        ctx.beginPath();
        const angleStep = (Math.PI * 2) / numPoints;
        for (let i = 0; i <= numPoints; i++) {
          const angle = i * angleStep;
          const waveAmplitude = Math.sin(time * 0.00027 + angle * 0.5 + dimension) * ringRadius * 0.1;
          const x = centerX + Math.cos(angle) * (actualRadius + waveAmplitude);
          const y = centerY + Math.sin(angle) * (actualRadius + waveAmplitude);

          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Draw radial spokes - SLOW ROTATION
      ctx.globalAlpha = 0.1 + lodFactor * 0.15;
      ctx.lineWidth = Math.max(0.4, 0.5 * lodFactor);
      const numSpokes = 2 + Math.floor((dimension * 0.15 + lodFactor * 4));
      for (let i = 0; i < numSpokes; i++) {
        const spokeRotation = time * 0.00004 * dimension; // Ultra-slow rotation
        const angle = (i / numSpokes) * Math.PI * 2 + spokeRotation;
        const x = centerX + Math.cos(angle) * scaledRadius;
        const y = centerY + Math.sin(angle) * scaledRadius;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(x, y);
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
    }

    /**
     * Draw a bizarre Klein bottle - SLOW ROTATION & BREATHING
     */
    drawKleinBottle(ctx, centerX, centerY, scale, time, dimension, color) {
      // LOD: Reduce segments based on scale
      const u_segments = Math.max(4, Math.floor(12 * Math.min(scale, 1)));
      const v_segments = Math.max(4, Math.floor(8 * Math.min(scale, 1)));

      // Beautiful, multi-layered pulsing
      const pulse1 = Math.sin(time * 0.00012 + dimension * 0.4) * 0.12;
      const pulse2 = Math.sin(time * 0.00008 + dimension * 0.3) * 0.08;
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.3 + pulse1 + pulse2;
      ctx.lineWidth = 0.7;

      for (let u = 0; u < u_segments; u++) {
        ctx.beginPath();
        let isFirst = true;
        const u_norm = (u / u_segments) * Math.PI * 2;
        const r = 4 + 3 * Math.cos(u_norm);

        for (let v = 0; v <= v_segments; v++) {
          const v_norm = (v / v_segments) * Math.PI * 2;

          // Ultra-slow rotation with breathing
          const rotation = time * 0.00002 * dimension;
          const breathing = Math.sin(time * 0.0001 + u_norm) * 0.8;
          const x = (r * (1 + Math.sin(v_norm)) + 8) * Math.cos(u_norm + rotation + breathing);
          const y = (r * (1 + Math.sin(v_norm)) + 8) * Math.sin(u_norm + rotation + breathing);
          const z = -2 * (2 + Math.cos(u_norm)) * Math.sin(v_norm);

          const screenX = centerX + x * scale * 0.3 + z * 0.2;
          const screenY = centerY + y * scale * 0.3;

          if (isFirst) {
            ctx.moveTo(screenX, screenY);
            isFirst = false;
          } else {
            ctx.lineTo(screenX, screenY);
          }
        }
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
    }

    /**
     * Draw a Mobius strip - SLOW, UNDULATING & BREATHING
     */
    drawMobiusStrip(ctx, centerX, centerY, scale, time, dimension, color) {
      // LOD: Reduce segments based on scale
      const segments = Math.max(6, Math.floor(16 * Math.min(scale, 1)));
      const width = 20 * scale;
      const widthSteps = 3;

      // Gentle, layered pulsing
      const alphaPulse = Math.sin(time * 0.0001 + dimension * 0.4) * 0.1;
      const breathingAlpha = Math.sin(time * 0.00008 + dimension * 0.3) * 0.12;
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.35 + alphaPulse + breathingAlpha;
      ctx.lineWidth = 0.8;

      for (let t = 0; t < segments; t++) {
        const t_norm = (t / segments) * Math.PI * 2;
        // Ultra-slow twist with breathing
        const baseAngle = t_norm * 0.5 + time * 0.00003 * dimension;
        const breathing = Math.sin(time * 0.0001 + t_norm) * 0.5;
        const angle = baseAngle + breathing;

        ctx.beginPath();
        for (let s = 0; s < widthSteps; s++) {
          const sNorm = (s / (widthSteps - 1)) * 2 - 1; // -1 to 1
          const radius = 60 * scale * (1 + Math.sin(time * 0.00009 + sNorm) * 0.08);
          const x = radius * Math.cos(angle);
          const y = radius * Math.sin(angle);
          const z = sNorm * width * Math.cos(angle * 0.5);

          const screenX = centerX + x + z * 0.25;
          const screenY = centerY + y + sNorm * width * 0.15;

          if (s === 0) ctx.moveTo(screenX, screenY);
          else ctx.lineTo(screenX, screenY);
        }
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
    }

    /**
     * Draw a fractal-like dimensional anomaly (zoom-responsive)
     */
    drawFractalAnomaly(ctx, centerX, centerY, scale, time, dimension, color, depth = 3) {
      const drawFractal = (x, y, size, rot, d, maxDepth, zoomFactor) => {
        if (d === 0 || size < Math.max(1, 2 - zoomFactor)) return;

        const points = [];
        const sides = 5 + Math.floor(zoomFactor * 3); // More sides at higher zoom
        for (let i = 0; i < sides; i++) {
          const angle = (i / sides) * Math.PI * 2 + rot + time * 0.000015 * (d + dimension);
          const breathing = Math.sin(time * 0.00015 + i + dimension) * 0.2;
          const r = size * (0.5 + 0.3 * Math.sin(time * 0.00027 + i + dimension + zoomFactor * 0.5) + breathing);
          points.push({
            x: x + Math.cos(angle) * r,
            y: y + Math.sin(angle) * r
          });
        }

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        points.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.stroke();

        // Recursive call with more iterations at higher zoom
        const recursionFactor = 1 + Math.floor(zoomFactor * 0.5);
        if (d > 0) {
          points.forEach((p, i) => {
            drawFractal(p.x, p.y, size * 0.5, rot + i * 0.5, d - 1, maxDepth, zoomFactor);
          });
        }
      };

      const lineWidth = 1.5 - depth * 0.3 + Math.max(0, (this.camera?.zoom || 0.001) / 0.0005) * 0.2;
      // `/` binds tighter than `||`, so without the parentheses the fallback was the whole
      // `0.001 / 0.001` and a real camera zoom was never divided by the reference scale.
      const zoomFactor = Math.min(Math.max((this.camera?.zoom || 0.001) / 0.001, 0.1), 2);

      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(0.5, lineWidth);
      ctx.globalAlpha = 0.6 - depth * 0.1 + zoomFactor * 0.15;
      drawFractal(centerX, centerY, scale * 30, time * 0.0001, depth, depth, zoomFactor);
      ctx.globalAlpha = 1;
    }

    /**
     * Draw a Penrose Triangle-like impossible shape
     */
    drawImpossibleShape(ctx, centerX, centerY, size, time, dimension, color) {
      // Ultra-slow rotation
      const angle = time * 0.00003 * dimension;
      const rotation = Math.sin(time * 0.00015) * 0.4; // Slow rotation

      const createCorner = (a, scale) => {
        const x = Math.cos(a + angle) * size * scale;
        const y = Math.sin(a + angle) * size * scale;
        return {
          x: centerX + Math.cos(rotation) * x - Math.sin(rotation) * y,
          y: centerY + Math.sin(rotation) * x + Math.cos(rotation) * y
        };
      };

      const corners = [
        createCorner(0, 1.2),
        createCorner(Math.PI * 2 / 3, 1.2),
        createCorner(Math.PI * 4 / 3, 1.2)
      ];

      ctx.strokeStyle = color;
      ctx.fillStyle = color.replace(')', ', 0.08)').replace('rgb', 'rgba');
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = 0.7;

      // Draw impossible triangle
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      ctx.lineTo(corners[1].x, corners[1].y);
      ctx.lineTo(corners[2].x, corners[2].y);
      ctx.closePath();
      ctx.stroke();

      // Draw 3D-like effect lines
      const innerScale = 0.5;
      const innerCorners = corners.map((c, i) => {
        const inner = createCorner((i * Math.PI * 2 / 3), innerScale);
        return inner;
      });

      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.4;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(corners[i].x, corners[i].y);
        ctx.lineTo(innerCorners[i].x, innerCorners[i].y);
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
    }

    /**
     * Draw the observable universe as a sphere in white space with bizarre multidimensional shapes
     * Meta view showing the entire cosmos as a single object
     */
    drawUniverseSphere(ctx, width, height) {
      // Fill background with white
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);

      // Calculate sphere position and size
      const sphereRadius = 46500 * MLY_TO_LY; // ~93 Gly diameter observable universe
      const centerScreen = this.camera.worldToScreen(0, 0, width, height);
      const screenRadius = sphereRadius * this.camera.zoom;

      // Draw cosmic microwave background glow
      const outerGlow = ctx.createRadialGradient(
        centerScreen.x, centerScreen.y, screenRadius * 0.7,
        centerScreen.x, centerScreen.y, screenRadius * 1.3
      );
      outerGlow.addColorStop(0, 'rgba(255, 200, 150, 0)');
      outerGlow.addColorStop(0.5, 'rgba(255, 180, 100, 0.15)');
      outerGlow.addColorStop(1, 'rgba(255, 150, 50, 0)');

      ctx.fillStyle = outerGlow;
      ctx.beginPath();
      ctx.arc(centerScreen.x, centerScreen.y, screenRadius * 1.3, 0, Math.PI * 2);
      ctx.fill();

      // Draw main universe sphere with gradient
      const gradient = ctx.createRadialGradient(
        centerScreen.x - screenRadius * 0.2,
        centerScreen.y - screenRadius * 0.2,
        screenRadius * 0.1,
        centerScreen.x,
        centerScreen.y,
        screenRadius
      );
      gradient.addColorStop(0, 'rgba(255, 240, 220, 1)');
      gradient.addColorStop(0.3, 'rgba(200, 180, 220, 1)');
      gradient.addColorStop(0.6, 'rgba(120, 140, 200, 1)');
      gradient.addColorStop(0.85, 'rgba(60, 80, 140, 1)');
      gradient.addColorStop(1, 'rgba(20, 30, 60, 1)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(centerScreen.x, centerScreen.y, screenRadius, 0, Math.PI * 2);
      ctx.fill();

      // Add subtle texture/noise to sphere surface
      const rng = new RandomGenerator('universe_sphere');
      ctx.globalAlpha = 0.15;
      for (let i = 0; i < 500; i++) {
        const angle = rng.random() * Math.PI * 2;
        const dist = rng.random() * screenRadius;
        const x = centerScreen.x + Math.cos(angle) * dist;
        const y = centerScreen.y + Math.sin(angle) * dist;
        const size = 0.5 + rng.random() * 2;

        ctx.fillStyle = rng.random() > 0.5 ?
          'rgba(255, 255, 255, 0.3)' :
          'rgba(0, 0, 0, 0.2)';
        ctx.fillRect(x, y, size, size);
      }
      ctx.globalAlpha = 1;

      // Draw edge highlight for observable universe (Dimension 3)
      ctx.strokeStyle = 'rgba(100, 120, 180, 0.6)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(centerScreen.x, centerScreen.y, screenRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Draw "Dimension 3#" label on the observable universe sphere
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.font = 'bold 20px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Dimension 3#', centerScreen.x, centerScreen.y);

      // Draw 89 bizarre multidimensional shapes representing higher dimensions (Dimension 4 to Dimension 92)
      // PERFORMANCE OPTIMIZED: Culling, LOD, and selective rendering
      const numDimensions = 89; // Dimensions 4 through 92
      const maxOuterRadius = screenRadius * 400; // MASSIVELY HUGE
      const time = Date.now();
      const frameCounter = Math.floor(time / 16.67); // ~60fps counter for LOD decisions
      const zoomFactor = Math.min(Math.max(this.camera.zoom / 0.001, 0.1), 2);

      // Precompute shape types for consistency
      const shapeTypes = [
        'hypercube', 'hypersphere', 'kleinbottle', 'mobiusstrip',
        'fractal', 'impossible', 'hypercube', 'hypersphere'
      ];

      // Viewport culling bounds (with padding for shapes extending beyond edges)
      const viewportPadding = width + height;
      const cullMinX = -viewportPadding;
      const cullMaxX = width + viewportPadding;
      const cullMinY = -viewportPadding;
      const cullMaxY = height + viewportPadding;

      for (let i = 0; i < numDimensions; i++) {
        const dimensionNumber = 4 + i; // Start from Dimension 4
        const progress = (i + 1) / numDimensions;

        // Distribute shapes radially with varying distances - EXTENDED RANGE
        const baseDistance = screenRadius + (maxOuterRadius - screenRadius) * progress;
        const angleOffset = (dimensionNumber * 0.5) % (Math.PI * 2);

        // Position shapes in a spiral around the central sphere - ULTRA-SLOW PULSING
        const spiralAngle = angleOffset + (i * Math.PI / numDimensions);
        // Slow breathing oscillation takes ~40+ seconds for full cycle
        const slowPulse = Math.sin(time * 0.0000015 + i * 0.5) * screenRadius * 0.4;
        const distance = baseDistance + slowPulse;

        const shapeX = centerScreen.x + Math.cos(spiralAngle) * distance;
        const shapeY = centerScreen.y + Math.sin(spiralAngle) * distance;

        // VIEWPORT CULLING: Skip shapes completely off-screen
        const estimatedSize = Math.max(200, (progress * 0.5 + 0.2) * 100);
        if (shapeX < cullMinX || shapeX > cullMaxX ||
          shapeY < cullMinY || shapeY > cullMaxY) {
          continue; // Skip this shape entirely if off-screen
        }

        // Select shape type based on dimension
        const shapeType = shapeTypes[i % shapeTypes.length];

        // LOD SYSTEM: Reduce complexity based on distance from camera center
        const distanceFromCenter = Math.sqrt((shapeX - centerScreen.x) ** 2 + (shapeY - centerScreen.y) ** 2);
        const maxScreenDist = Math.sqrt(width * width + height * height);
        const lodFactor = Math.min(1, Math.max(0.3, 1 - (distanceFromCenter / maxScreenDist) * 0.8));

        // PERFORMANCE: Skip rendering every other far-away shape per frame
        const isDistant = progress > 0.6;
        if (isDistant && frameCounter % 2 === 0 && progress > 0.75) {
          continue; // Skip every other very distant shape on even frames
        }

        // MASSIVELY INCREASED SCALE with LOD factor
        const baseShapeScale = (progress * 0.5 + 0.2) * (250 + zoomFactor * 300);
        const shapeScale = baseShapeScale * lodFactor;

        // Generate color with beautiful, smooth multi-wave transitions
        const hue = (dimensionNumber * 37) % 360;
        // Slow color pulsing with multiple waves for ethereal effect
        const sat1 = 20 * Math.sin(time * 0.00008 + dimensionNumber * 0.5);
        const sat2 = 15 * Math.sin(time * 0.00006 + dimensionNumber * 0.3);
        const saturation = Math.max(30, Math.min(100, 70 + sat1 + sat2));

        const light1 = 15 * Math.cos(time * 0.00007 + dimensionNumber * 0.4);
        const light2 = 12 * Math.cos(time * 0.00005 + dimensionNumber * 0.2);
        const lightness = Math.max(30, Math.min(70, 45 + light1 + light2));

        const colorStr = `hsl(${hue}, ${Math.round(saturation)}%, ${Math.round(lightness)}%)`;

        // SIMPLIFIED SHAPES FOR DISTANT OBJECTS: Use simpler rendering at high LOD reduction
        if (lodFactor < 0.4 && shapeType !== 'impossible') {
          // Ultra-distant: just draw a simple circle
          ctx.strokeStyle = colorStr;
          ctx.lineWidth = 1;
          ctx.globalAlpha = 0.3 * lodFactor;
          ctx.beginPath();
          ctx.arc(shapeX, shapeY, estimatedSize * 0.5 * lodFactor, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        } else {
          // Normal or close distance: draw full detail
          switch (shapeType) {
            case 'hypercube':
              this.drawHypercube(ctx, shapeX, shapeY, shapeScale * 0.8, angleOffset, time, zoomFactor, colorStr);
              break;
            case 'hypersphere':
              this.drawHypersphere(ctx, shapeX, shapeY, shapeScale * 2.5, dimensionNumber, time, zoomFactor * lodFactor, colorStr);
              break;
            case 'kleinbottle':
              this.drawKleinBottle(ctx, shapeX, shapeY, shapeScale * 0.08, time, dimensionNumber, colorStr);
              break;
            case 'mobiusstrip':
              this.drawMobiusStrip(ctx, shapeX, shapeY, shapeScale * 0.06, time, dimensionNumber, colorStr);
              break;
            case 'fractal':
              this.drawFractalAnomaly(ctx, shapeX, shapeY, shapeScale * 0.04, time, dimensionNumber, colorStr, Math.max(1, 2 + Math.floor(progress * 2 * lodFactor)));
              break;
            case 'impossible':
              this.drawImpossibleShape(ctx, shapeX, shapeY, shapeScale * 1.8, time, dimensionNumber, colorStr);
              break;
          }
        }

        // Draw dimension label - only for closer/visible shapes
        if ((dimensionNumber % 3 === 0 || dimensionNumber === 92) && progress < 0.8) {
          ctx.fillStyle = `hsl(${hue}, 90%, 30%)`;
          const fontSize = Math.max(8, 14 - Math.floor(progress * 10));
          ctx.font = `bold ${fontSize}px monospace`;
          ctx.textAlign = 'center';
          ctx.globalAlpha = 0.8 * lodFactor;
          ctx.fillText(`D${dimensionNumber}`, shapeX, shapeY);
          ctx.globalAlpha = 1;
        }
      }

      // Draw main labels in black (since background is white)
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 42px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('OBSERVABLE MULTIVERSE', width / 2, 60);

      ctx.font = '20px monospace';
      ctx.fillText('3884 trillion gigalight-centuries in diameter', width / 2, 95);

      ctx.font = '16px monospace';
      ctx.fillStyle = '#333333';
      ctx.fillText('Age: ~13.8 billion years', width / 2, height - 80);
      ctx.fillText('Contains: ~92 trillion galaxies', width / 2, height - 55);
      ctx.fillText('Beyond this sphere lies the white desert...', width / 2, height - 30);
    }

    generateRealisticStarName(worldX, worldY, seedRng) {
      // Generate realistic astronomical catalog names based on position
      // Uses various real-world naming conventions

      // Star catalog prefixes used in astronomy
      const catalogPrefixes = [
        // Real astronomical catalogs
        'HD',        // Henry Draper Catalogue
        'HIP',       // Hipparcos Catalogue
        'Gliese',    // Gliese Catalogue of Nearby Stars
        'TYC',       // Tycho Catalogue
        '2MASS J',   // Two Micron All-Sky Survey
        'WISE J',    // Wide-field Infrared Survey Explorer
        'SDSS J',    // Sloan Digital Sky Survey
        'UGPS J',    // UKIRT Galactic Plane Survey
        'PSR J',     // Pulsar (J2000 coordinates)
        'NGC',       // New General Catalogue
        'IC',        // Index Catalogue
        'Messier',   // Messier objects
        // Elite Dangerous-style procedural names
        'Synuefe',
        'Bleia',
        'Byeia',
        'Dryio',
        'Eol',
        'Flyiedgiae',
        'Hypiae',
        'Kyloall',
        'Mynoaw',
        'Nyeajeau',
        'Oevasy',
        'Phroea',
        'Plaa',
        'Praea',
        'Pru',
        'Swoilz',
        'Thaile',
        'Truechiae',
        'Wepiae',
        'Bleae',
        'Graea',
        'Phroi',
        'Boewnst',
        'Lyaisae',
        'Outotz',
      ];

      // Letter suffixes for sectors
      const sectorLetters = ['AA', 'AB', 'AC', 'AD', 'AE', 'AF', 'BA', 'BB', 'BC', 'BD', 'CA', 'CB', 'CC', 'CD', 'EA', 'EB', 'EC', 'ED'];

      const catalogType = seedRng.int(0, 2);

      if (catalogType === 0) {
        // Simple numeric catalogs (HD, HIP, Gliese, etc.)
        const prefix = catalogPrefixes[seedRng.int(0, 6)]; // First 7 are numeric catalogs
        const number = Math.abs(Math.floor(worldX * 1000 + worldY * 1000)) % 999999;
        return `${prefix} ${number}`;
      } else if (catalogType === 1) {
        // Coordinate-based catalogs (2MASS, WISE, SDSS, etc.)
        const prefix = catalogPrefixes[seedRng.int(6, 12)]; // Coordinate-based catalogs

        // Generate pseudo-coordinates from position
        const ra_h = Math.abs(Math.floor(worldX * 10)) % 24;
        const ra_m = Math.abs(Math.floor(worldY * 10)) % 60;
        const ra_s = Math.abs(Math.floor((worldX + worldY) * 100)) % 60;

        const dec_sign = worldY >= 0 ? '+' : '-';
        const dec_d = Math.abs(Math.floor(worldY * 5)) % 90;
        const dec_m = Math.abs(Math.floor(worldX * 10)) % 60;
        const dec_s = Math.abs(Math.floor((worldX - worldY) * 100)) % 60;

        return `${prefix}${String(ra_h).padStart(2, '0')}${String(ra_m).padStart(2, '0')}${String(ra_s).padStart(2, '0')}.${String(Math.floor(seedRng.random() * 99)).padStart(2, '0')}${dec_sign}${String(dec_d).padStart(2, '0')}${String(dec_m).padStart(2, '0')}${String(dec_s).padStart(2, '0')}.${String(Math.floor(seedRng.random() * 9))}`;
      } else {
        // Elite Dangerous-style procedural names
        const prefix = catalogPrefixes[seedRng.int(13, catalogPrefixes.length - 1)];
        const sector = sectorLetters[seedRng.int(0, sectorLetters.length - 1)];
        const letter = String.fromCharCode(65 + seedRng.int(0, 25)); // A-Z
        const number = Math.abs(Math.floor(worldX * 100 + worldY * 100)) % 9999;

        return `${prefix} ${sector}-${letter} ${letter}${number}`;
      }
    }

    /**
     * Generate procedural name for supermassive black holes
     */
    generateBlackHoleName(worldX, worldY, seedRng, isHypermassive = false) {
      const blackHoleNamePrefixes = [
        'Abaddon',      // Destroyer of life
        'Cataclysm',    // Cosmic disaster
        'Devourer',     // Consuming force
        'Extinction',   // End times
        'Oblivion',     // Non-existence
        'Ravager',      // Destroying force
        'Vortex',       // Swirling abyss
        'Void',         // Nothingness
        'Abyss',        // Bottomless pit
        'Maelstrom',    // Violent whirlpool
        'Singularity',  // Point of infinite density
        'Nightmare',    // Dreaded place
        'Perdition',    // Ruin and destruction
        'Terminus',     // End point
        'Aeon',         // Age/epoch
        'Chaos',        // Disorder
        'Hunger',       // Consuming need
        'Madness',      // Insanity
        'Wraith',       // Ghost/specter
        'Requiem',      // Funeral mass
      ];

      const descriptors = [
        'Prime',
        'Major',
        'Lesser',
        'Dark',
        'Shadow',
        'Phantom',
        'Silent',
        'Ancient',
        'Hungry',
        'Eternal',
        'Cursed',
        'Lost',
        'Forgotten',
        'Forbidden',
        'Accursed',
      ];

      const prefix = blackHoleNamePrefixes[seedRng.int(0, blackHoleNamePrefixes.length - 1)];
      const descriptor = descriptors[seedRng.int(0, descriptors.length - 1)];

      if (isHypermassive) {
        return `${prefix} the ${descriptor} (TON-class)`;
      } else {
        // Supermassive black hole - generate procedural name with catalog designation
        const superMassiveClasses = ['Sagittarius', 'Andromeda', 'Cygnus', 'Virgo', 'Centaurus'];
        const designation = superMassiveClasses[seedRng.int(0, superMassiveClasses.length - 1)];
        const catalogNumber = Math.abs(Math.floor(worldX * 7919 + worldY * 6143)) % 9999;
        const suffix = String.fromCharCode(65 + seedRng.int(0, 25)); // Random A-Z letter
        return `${prefix} ${descriptor} (${designation} A${catalogNumber}${suffix})`;
      }
    }

    /**
     * Check if a black hole should be generated as a star (rare occurrence)
     * Returns the black hole type: null, 'normal', 'supermassive', or 'hypermassive'
     */
    determineBlackHoleType(worldX, worldY, seedRng, inGreatAttractor = false) {
      if (inGreatAttractor) {
        // Great Attractor: dense anomalous black hole population (~3% of stars),
        // skewed toward the giant classes that make the region feel sinister.
        if (seedRng.random() < 0.03) {
          const typeRoll = seedRng.random();
          if (typeRoll < 0.08) return 'hypermassive';
          if (typeRoll < 0.30) return 'supermassive';
          return 'normal';
        }
        return null;
      } else {
        // Realistic field population. Stellar-mass (normal) black holes are on
        // the order of ~0.1-0.2% of stars; supermassive holes only ever turn up
        // as rare wandering rogues, and hypermassive ones essentially never
        // occur outside the Great Attractor.
        if (seedRng.random() < 0.0015) {
          return seedRng.random() < 0.012 ? 'supermassive' : 'normal';
        }
      }
      return null;
    }

    /**
     * Shared Gargantua-style black hole renderer (Interstellar-inspired).
     *
     * Draws, in order: gravitational lensing of the background starfield, a soft
     * outer haze, the edge-on accretion disk that wraps OVER and UNDER the event
     * horizon, swirling hot spots, a bright Doppler-beamed photon halo, the
     * pure-black shadow, a razor-thin photon sphere, and finally the near edge of
     * the disk passing IN FRONT of the shadow. Every black hole class routes
     * through here so they all share the same cinematic distortion.
     *
     * @param {object} opts per-class tuning (disk size, chaos, colors, lensing)
     */
    _renderBlackHoleCore(ctx, width, height, screen, eventHorizonRadius, opts) {
      const o = Object.assign({
        tilt: 0.30,        // vertical squash of the disk -> near edge-on view
        diskInner: 1.45,
        diskOuter: 4.0,
        layers: 8,
        segments: 48,
        chaos: 0.15,
        hueInner: 48,      // white-hot orange at the inner edge
        hueOuter: 8,       // deep red at the outer edge
        lightInner: 82,
        lightOuter: 26,
        intensity: 1.0,
        diskSpeed: 0.5,
        lensing: false,    // magnify the real background around the hole
        hotspots: 3,
        beamAxis: 0,       // angle of the Doppler "approaching" (brighter) side
      }, opts || {});

      const time = this.time;
      const cx = screen.x, cy = screen.y;
      const TAU = Math.PI * 2;
      const eh = eventHorizonRadius;
      const diskInnerR = eh * o.diskInner;
      const diskOuterR = eh * o.diskOuter;
      const cosB = Math.cos(o.beamAxis), sinB = Math.sin(o.beamAxis);

      // 0. GRAVITATIONAL LENSING -- sample the already-drawn frame around the
      //    hole and re-draw it magnified, so background stars appear to bend and
      //    smear around the event horizon. One drawImage; guarded + cached off
      //    if the canvas is unreadable.
      if (o.lensing && this._bhLensingOK !== false) {
        const R = Math.min(diskOuterR * 1.3, 280);
        if (R > 14) {
          try {
            const canvas = ctx.canvas;
            const k = 1.55; // magnification factor toward the photon ring
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, R, 0, TAU);
            ctx.clip();
            ctx.drawImage(canvas, cx - R, cy - R, R * 2, R * 2,
              cx - R * k, cy - R * k, R * 2 * k, R * 2 * k);
            ctx.restore();
          } catch (e) {
            this._bhLensingOK = false;
          }
        }
      }

      // Edge-on accretion disk, drawn in vertically-squashed space so the rings
      // read as an ellipse seen nearly side-on. frontOnly redraws just the near
      // half (lower part of the ellipse) so it can pass in front of the shadow.
      const drawDisk = (frontOnly) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(1, o.tilt);
        for (let layer = 0; layer < o.layers; layer++) {
          const lp = layer / o.layers;
          const rA = diskInnerR + (diskOuterR - diskInnerR) * lp;
          const rB = diskInnerR + (diskOuterR - diskInnerR) * ((layer + 1) / o.layers);
          // Keplerian rotation: inner rings spin faster.
          const rot = time * (o.diskSpeed / Math.max(0.3, lp)) * 0.5;
          for (let i = 0; i < o.segments; i++) {
            const a1 = (i / o.segments) * TAU + rot;
            const a2 = ((i + 1) / o.segments) * TAU + rot;
            const mid = (a1 + a2) * 0.5;
            // Near side of the disk is the lower half of the ellipse (sin > 0).
            if (frontOnly && Math.sin(mid) <= 0) continue;
            const turb = Math.sin(a1 * 6 + time * 2) * o.chaos
              + Math.cos(a1 * 11 - time * 1.3) * o.chaos * 0.5;
            // Doppler beaming: the side rotating toward the viewer is brighter
            // and shifts bluer (lower hue toward white).
            const beam = Math.max(0, Math.cos(mid) * cosB + Math.sin(mid) * sinB);
            const bright = 0.55 + 0.65 * beam;
            const alpha = (0.72 - lp * 0.45) * (0.78 + turb) * o.intensity * (0.45 + bright * 0.6);
            const hue = o.hueInner + (o.hueOuter - o.hueInner) * lp
              + Math.sin(a1 * 4 + time) * 5 - beam * 10;
            const light = Math.min(96,
              (o.lightInner + (o.lightOuter - o.lightInner) * lp) * (0.65 + bright * 0.5));
            ctx.fillStyle = `hsla(${hue}, 100%, ${light}%, ${Math.max(0, alpha)})`;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, rA * (1 + turb * 0.12), a1, a2);
            ctx.arc(0, 0, rB * (1 + turb * 0.12), a2, a1, true);
            ctx.closePath();
            ctx.fill();
          }
        }
        ctx.restore();
      };

      // 1. Soft outer haze around the disk plane.
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, o.tilt);
      const haze = ctx.createRadialGradient(0, 0, diskInnerR, 0, 0, diskOuterR * 1.35);
      haze.addColorStop(0, `hsla(${o.hueInner}, 100%, 55%, 0)`);
      haze.addColorStop(0.45, `hsla(${(o.hueInner + o.hueOuter) / 2}, 100%, 45%, ${0.22 * o.intensity})`);
      haze.addColorStop(1, `hsla(${o.hueOuter}, 100%, 28%, 0)`);
      ctx.fillStyle = haze;
      ctx.beginPath();
      ctx.arc(0, 0, diskOuterR * 1.35, 0, TAU);
      ctx.fill();
      ctx.restore();

      // 2. Far side of the disk (behind the shadow).
      drawDisk(false);

      // 3. Hot spots swirling in the disk.
      for (let i = 0; i < o.hotspots; i++) {
        const a = time * (0.8 + i * 0.35) + (i * TAU / Math.max(1, o.hotspots));
        const r = diskInnerR + (diskOuterR - diskInnerR) * (0.25 + (i / Math.max(1, o.hotspots)) * 0.6);
        const hx = cx + Math.cos(a) * r;
        const hy = cy + Math.sin(a) * r * o.tilt;
        const hs = (eh * 0.9) * (0.8 + 0.4 * Math.sin(time * 3 + i));
        const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, hs);
        g.addColorStop(0, `rgba(255, 250, 235, ${0.85 * o.intensity})`);
        g.addColorStop(0.45, `rgba(255, 190, 110, ${0.4 * o.intensity})`);
        g.addColorStop(1, 'rgba(255, 120, 60, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(hx, hy, hs, 0, TAU);
        ctx.fill();
      }

      // 4. PHOTON HALO -- the disk light bent up over the poles forms a bright
      //    circular ring fully encircling the shadow (the iconic Gargantua look).
      //    Doppler-asymmetric via a linear gradient across the beam axis.
      const haloR = eh * 1.14;
      const haloGrad = ctx.createLinearGradient(
        cx + cosB * haloR, cy + sinB * haloR,
        cx - cosB * haloR, cy - sinB * haloR
      );
      haloGrad.addColorStop(0, `rgba(255, 248, 235, ${0.95 * o.intensity})`);
      haloGrad.addColorStop(0.5, `rgba(255, 200, 130, ${0.6 * o.intensity})`);
      haloGrad.addColorStop(1, `rgba(255, 140, 70, ${0.35 * o.intensity})`);
      ctx.strokeStyle = haloGrad;
      ctx.lineWidth = Math.max(1.5, eh * 0.16);
      ctx.shadowBlur = 18;
      ctx.shadowColor = `rgba(255, 180, 90, ${0.8 * o.intensity})`;
      ctx.beginPath();
      ctx.arc(cx, cy, haloR, 0, TAU);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 5. EVENT HORIZON -- the pure black shadow.
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(cx, cy, eh, 0, TAU);
      ctx.fill();

      // 6. Razor-thin photon sphere right at the shadow edge.
      const pulse = 0.85 + 0.15 * Math.sin(time * 4);
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.5 * pulse * o.intensity})`;
      ctx.lineWidth = Math.max(1, eh * 0.06);
      ctx.shadowBlur = 10;
      ctx.shadowColor = 'rgba(255, 230, 200, 0.7)';
      ctx.beginPath();
      ctx.arc(cx, cy, eh * 1.02, 0, TAU);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 7. Near edge of the disk passes IN FRONT of the shadow (the wrap).
      drawDisk(true);
    }

    /**
     * Draw a hypermassive black hole (TON 618-style) that covers entire solar system
     * These are rare universe-spanning anomalies
     */
    drawHypermassiveBlackHole(ctx, width, height, system) {
      const screen = this.camera.worldToScreen(
        system.position.x,
        system.position.y,
        width,
        height
      );

      // Scale based on zoom - hypermassive BH are HUGE
      const baseRadius = 50; // Much larger than normal SMBH
      const eventHorizonRadius = baseRadius * this.camera.zoom;

      // Don't render if too small or off-screen (wide margin: disk is ~7x EH)
      if (eventHorizonRadius < 3) return;
      const margin = eventHorizonRadius * 9;
      if (screen.x < -margin || screen.x > width + margin ||
        screen.y < -margin || screen.y > height + margin) {
        return;
      }

      this._renderBlackHoleCore(ctx, width, height, screen, eventHorizonRadius, {
        tilt: 0.34, diskInner: 1.3, diskOuter: 7.0, layers: 12, segments: 64,
        chaos: 0.3, hueInner: 45, hueOuter: 4, lightInner: 86, lightOuter: 22,
        intensity: 1.15, diskSpeed: 0.7, lensing: true, hotspots: 6,
        beamAxis: this.time * 0.4,
      });

      // System name
      ctx.font = 'bold 16px monospace';
      ctx.fillStyle = 'rgba(255, 180, 120, 0.95)';
      ctx.textAlign = 'center';
      ctx.shadowBlur = 12;
      ctx.shadowColor = 'rgba(255, 120, 40, 0.9)';
      ctx.fillText('Hypermassive Black Hole', screen.x, screen.y - eventHorizonRadius * 7.4);
      ctx.shadowBlur = 0;
    }

    drawNebulas(ctx, width, height) {
      // Generate procedural nebulas across the galaxy
      const GALAXY_SCALE = 2.0;
      const GALAXY_CENTER_X = -3100 * GALAXY_SCALE;
      const GALAXY_CENTER_Y = -4000 * GALAXY_SCALE;
      const GALAXY_RADIUS = 10750;

      // Calculate visible bounds
      const topLeft = this.camera.screenToWorld(0, 0, width, height);
      const bottomRight = this.camera.screenToWorld(width, height, width, height);

      const minX = topLeft.x - 500;
      const maxX = bottomRight.x + 500;
      const minY = topLeft.y - 500;
      const maxY = bottomRight.y + 500;

      // Nebula grid size (larger than star grid)
      const nebulaGridSize = 800;

      const startGridX = Math.floor(minX / nebulaGridSize) * nebulaGridSize;
      const startGridY = Math.floor(minY / nebulaGridSize) * nebulaGridSize;
      const endGridX = Math.ceil(maxX / nebulaGridSize) * nebulaGridSize;
      const endGridY = Math.ceil(maxY / nebulaGridSize) * nebulaGridSize;

      // Nebula types and colors
      const nebulaTypes = [
        { name: 'emission', hue: 340 },     // Pink/red (H-alpha emission)
        { name: 'reflection', hue: 220 },   // Blue (reflected starlight)
        { name: 'planetary', hue: 160 },    // Cyan/green (ionized oxygen)
        { name: 'dark', hue: 270 },         // Purple/dark (dust clouds)
      ];

      ctx.globalCompositeOperation = 'screen'; // Additive blending for nebulas

      for (let gx = startGridX; gx <= endGridX; gx += nebulaGridSize) {
        for (let gy = startGridY; gy <= endGridY; gy += nebulaGridSize) {
          const seedRng = new RandomGenerator(`nebula_${gx}_${gy}`);

          // Calculate position relative to galaxy center
          const dx = gx - GALAXY_CENTER_X;
          const dy = gy - GALAXY_CENTER_Y;
          const distFromCenter = Math.sqrt(dx * dx + dy * dy);

          // Skip if outside galaxy
          if (distFromCenter > GALAXY_RADIUS) continue;

          // Only 5% chance of nebula per grid cell
          if (seedRng.random() > 0.05) continue;

          // Nebula position (offset within grid)
          const nebulaX = gx + seedRng.random() * nebulaGridSize;
          const nebulaY = gy + seedRng.random() * nebulaGridSize;

          const screen = this.camera.worldToScreen(nebulaX, nebulaY, width, height);

          // Skip if way off screen
          if (screen.x < -500 || screen.x > width + 500 || screen.y < -500 || screen.y > height + 500) {
            continue;
          }

          // Random nebula type
          const nebulaType = nebulaTypes[seedRng.int(0, nebulaTypes.length - 1)];

          // Nebula size (in world units)
          const worldSize = seedRng.range(200, 600);
          const screenSize = worldSize * this.camera.zoom;

          // Skip if too small to see
          if (screenSize < 10) continue;

          // Multiple cloud layers for depth
          const numLayers = seedRng.int(3, 6);

          for (let layer = 0; layer < numLayers; layer++) {
            const layerOffset = seedRng.range(-50, 50) * this.camera.zoom;
            const layerX = screen.x + layerOffset;
            const layerY = screen.y + layerOffset;
            const layerSize = screenSize * seedRng.range(0.4, 1.0);

            // Animated swirling motion
            const swirl = Math.sin(this.time * 0.2 + layer + seedRng.random() * Math.PI * 2) * 20;
            const swirlX = layerX + swirl;
            const swirlY = layerY + swirl * 0.5;

            // Create gradient for nebula cloud
            const gradient = ctx.createRadialGradient(
              swirlX, swirlY, 0,
              swirlX, swirlY, layerSize
            );

            const baseAlpha = 0.15 / (this.camera.zoom + 0.5); // Fade at high zoom
            const layerAlpha = baseAlpha * (1 - layer / numLayers) * seedRng.range(0.6, 1.0);

            // Animated color variation
            const colorShift = Math.sin(this.time * 0.3 + layer) * 10;
            const hue = nebulaType.hue + colorShift;

            gradient.addColorStop(0, `hsla(${hue}, 80%, 60%, ${layerAlpha})`);
            gradient.addColorStop(0.3, `hsla(${hue - 10}, 70%, 50%, ${layerAlpha * 0.7})`);
            gradient.addColorStop(0.6, `hsla(${hue - 20}, 60%, 40%, ${layerAlpha * 0.4})`);
            gradient.addColorStop(1, `hsla(${hue - 30}, 50%, 30%, 0)`);

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(swirlX, swirlY, layerSize, 0, Math.PI * 2);
            ctx.fill();
          }

          // Add bright cores/stars within nebula (star-forming regions)
          if (nebulaType.name === 'emission' || nebulaType.name === 'planetary') {
            const numCores = seedRng.int(2, 5);
            for (let c = 0; c < numCores; c++) {
              const coreAngle = seedRng.random() * Math.PI * 2;
              const coreRadius = seedRng.random() * screenSize * 0.5;
              const coreX = screen.x + Math.cos(coreAngle) * coreRadius;
              const coreY = screen.y + Math.sin(coreAngle) * coreRadius;
              const coreSize = seedRng.range(5, 15);

              const coreGradient = ctx.createRadialGradient(
                coreX, coreY, 0,
                coreX, coreY, coreSize
              );

              const corePulse = Math.sin(this.time * 2 + c) * 0.2 + 0.8;
              coreGradient.addColorStop(0, `rgba(255, 255, 200, ${0.6 * corePulse})`);
              coreGradient.addColorStop(0.5, `rgba(255, 200, 150, ${0.3 * corePulse})`);
              coreGradient.addColorStop(1, 'rgba(255, 100, 100, 0)');

              ctx.fillStyle = coreGradient;
              ctx.beginPath();
              ctx.arc(coreX, coreY, coreSize, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }

      ctx.globalCompositeOperation = 'source-over'; // Reset blend mode
    }

    /**
     * Draws Barnard's Loop - a large arc-shaped emission nebula near Orion
     * Located approximately 1,600 light-years from Sol
     * Real coordinates: roughly 160 units from Sol in this simulation
     */
    drawBarnardsLoop(ctx, width, height) {
      // Barnard's Loop position relative to Sol (0, 0)
      const LOOP_CENTER_X = 120;
      const LOOP_CENTER_Y = -80;
      const LOOP_RADIUS = 80; // Large arc radius
      const LOOP_THICKNESS = 30; // Arc thickness

      // Convert world position to screen position
      const screenCenter = new Vector2(width / 2, height / 2);
      const loopWorldPos = new Vector2(LOOP_CENTER_X, LOOP_CENTER_Y);
      const cameraOffset = loopWorldPos.sub(this.camera.position);
      const loopScreenPos = screenCenter.add(cameraOffset.mul(this.camera.zoom));

      // Don't render if too far off screen
      const screenRadius = LOOP_RADIUS * this.camera.zoom;
      if (loopScreenPos.x < -screenRadius * 2 || loopScreenPos.x > width + screenRadius * 2 ||
        loopScreenPos.y < -screenRadius * 2 || loopScreenPos.y > height + screenRadius * 2) {
        return;
      }

      // Only visible at medium to close zoom levels
      if (this.camera.zoom < 0.5) {
        return; // Too zoomed out
      }

      ctx.save();
      ctx.globalCompositeOperation = 'screen'; // Additive blending for glow

      const time = this.time || 0;

      // Draw the arc shape (approximately 200 degrees)
      // Barnard's Loop forms a large arc, not a complete circle
      const startAngle = Math.PI * 0.2; // Start at roughly 36 degrees
      const endAngle = Math.PI * 1.3;   // End at roughly 234 degrees (198 degree arc)

      // Draw multiple layers for depth and glow
      const numLayers = 12;

      for (let layer = 0; layer < numLayers; layer++) {
        const layerProgress = layer / numLayers;
        const radiusOffset = (layerProgress - 0.5) * LOOP_THICKNESS * this.camera.zoom;
        const currentRadius = LOOP_RADIUS * this.camera.zoom + radiusOffset;

        // Opacity decreases toward outer edges
        const edgeFade = 1.0 - Math.abs(layerProgress - 0.5) * 2;
        const baseOpacity = 0.15 * edgeFade;

        // Animated color shift (emission nebula - red/pink)
        const colorShift = Math.sin(time * 0.3 + layer * 0.5) * 10;
        const hue = 350 + colorShift; // Red-pink range

        // Animated swirling/turbulence
        const turbulenceScale = 0.02;
        const numSegments = 60;

        ctx.beginPath();

        for (let i = 0; i <= numSegments; i++) {
          const t = i / numSegments;
          const angle = startAngle + (endAngle - startAngle) * t;

          // Add turbulence to create wispy, irregular edges
          const turbulence = Math.sin(angle * 8 + time * 0.5 + layer * 0.3) * 8 * this.camera.zoom;
          const turbulence2 = Math.sin(angle * 12 - time * 0.3 + layer * 0.7) * 5 * this.camera.zoom;

          const radius = currentRadius + turbulence + turbulence2;
          const x = loopScreenPos.x + Math.cos(angle) * radius;
          const y = loopScreenPos.y + Math.sin(angle) * radius;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }

        // Create gradient along the arc for color variation
        const gradientStartX = loopScreenPos.x + Math.cos(startAngle) * currentRadius;
        const gradientStartY = loopScreenPos.y + Math.sin(startAngle) * currentRadius;
        const gradientEndX = loopScreenPos.x + Math.cos(endAngle) * currentRadius;
        const gradientEndY = loopScreenPos.y + Math.sin(endAngle) * currentRadius;

        const gradient = ctx.createLinearGradient(
          gradientStartX, gradientStartY,
          gradientEndX, gradientEndY
        );

        // Emission nebula colors with brightness variation
        const brightness1 = 50 + Math.sin(time * 0.4) * 5;
        const brightness2 = 45 + Math.sin(time * 0.4 + Math.PI) * 5;

        gradient.addColorStop(0, `hsla(${hue}, 90%, ${brightness1}%, ${baseOpacity * 0.8})`);
        gradient.addColorStop(0.5, `hsla(${hue + 10}, 95%, ${brightness1 + 5}%, ${baseOpacity})`);
        gradient.addColorStop(1, `hsla(${hue - 5}, 85%, ${brightness2}%, ${baseOpacity * 0.7})`);

        ctx.strokeStyle = gradient;
        ctx.lineWidth = (3 + layer * 0.5) * Math.min(this.camera.zoom, 2.0);
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      // Add bright star-forming knots along the arc
      const numKnots = 8;
      const knotRng = new RandomGenerator(12345); // Fixed seed for consistent positions

      for (let k = 0; k < numKnots; k++) {
        const t = knotRng.random();
        const angle = startAngle + (endAngle - startAngle) * t;
        const knotRadius = LOOP_RADIUS * this.camera.zoom;

        const knotX = loopScreenPos.x + Math.cos(angle) * knotRadius;
        const knotY = loopScreenPos.y + Math.sin(angle) * knotRadius;

        // Pulsing animation
        const knotPulse = Math.sin(time * 2 + k * 0.8) * 0.2 + 0.8;
        const knotSize = (4 + knotRng.random() * 4) * this.camera.zoom * knotPulse;

        // Bright emission knot
        const knotGradient = ctx.createRadialGradient(knotX, knotY, 0, knotX, knotY, knotSize);
        knotGradient.addColorStop(0, 'rgba(255, 180, 200, 0.6)');
        knotGradient.addColorStop(0.5, 'rgba(255, 100, 150, 0.3)');
        knotGradient.addColorStop(1, 'rgba(255, 50, 100, 0)');

        ctx.fillStyle = knotGradient;
        ctx.beginPath();
        ctx.arc(knotX, knotY, knotSize, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw label
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';

      const labelY = loopScreenPos.y - 5;

      // Background box for readability
      ctx.font = 'bold 14px monospace';
      const nameWidth = ctx.measureText("Barnard's Loop").width;
      ctx.font = '11px monospace';
      const catalogWidth = ctx.measureText('Sh 2-276').width;
      const boxWidth = Math.max(nameWidth, catalogWidth) + 12;
      const boxHeight = 36;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(loopScreenPos.x - boxWidth / 2, labelY - boxHeight, boxWidth, boxHeight);

      // Border
      ctx.strokeStyle = 'rgba(255, 120, 150, 1)';
      ctx.lineWidth = 1;
      ctx.strokeRect(loopScreenPos.x - boxWidth / 2, labelY - boxHeight, boxWidth, boxHeight);

      // Name text
      ctx.fillStyle = 'rgba(255, 120, 150, 1)';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText("Barnard's Loop", loopScreenPos.x, labelY - boxHeight + 5);

      // Catalog number text
      ctx.font = '11px monospace';
      ctx.fillStyle = 'rgba(200, 200, 200, 0.9)';
      ctx.fillText('Sh 2-276', loopScreenPos.x, labelY - boxHeight + 21);

      ctx.restore();

      ctx.globalCompositeOperation = 'source-over'; // Reset blend mode
      ctx.restore();
    }

    /**
     * Draws famous hardcoded nebulas at their approximate locations
     * All positioned relative to Sol at (0, 0)
     */
    drawFamousNebulas(ctx, width, height) {
      const time = this.time || 0;
      const screenCenter = new Vector2(width / 2, height / 2);

      // Helper function to check if nebula is visible
      const isVisible = (worldPos, nebulaSize) => {
        const cameraOffset = worldPos.sub(this.camera.position);
        const screenPos = screenCenter.add(cameraOffset.mul(this.camera.zoom));
        const screenRadius = nebulaSize * this.camera.zoom;

        return !(screenPos.x < -screenRadius * 2 || screenPos.x > width + screenRadius * 2 ||
          screenPos.y < -screenRadius * 2 || screenPos.y > height + screenRadius * 2);
      };

      // Helper function to draw nebula label
      const drawLabel = (screenPos, name, catalog, color) => {
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';

        const labelY = screenPos.y - 5;

        // Background box for readability
        ctx.font = 'bold 14px monospace';
        const nameWidth = ctx.measureText(name).width;
        ctx.font = '11px monospace';
        const catalogWidth = ctx.measureText(catalog).width;
        const boxWidth = Math.max(nameWidth, catalogWidth) + 12;
        const boxHeight = 36;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(screenPos.x - boxWidth / 2, labelY - boxHeight, boxWidth, boxHeight);

        // Border
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(screenPos.x - boxWidth / 2, labelY - boxHeight, boxWidth, boxHeight);

        // Name text
        ctx.fillStyle = color;
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(name, screenPos.x, labelY - boxHeight + 5);

        // Catalog number text
        ctx.font = '11px monospace';
        ctx.fillStyle = 'rgba(200, 200, 200, 0.9)';
        ctx.fillText(catalog, screenPos.x, labelY - boxHeight + 21);

        ctx.restore();
      };

      ctx.save();
      ctx.globalCompositeOperation = 'screen';

      // ============== ORION NEBULA (M42) ==============
      // Distance: ~1,344 light-years, Location: Orion constellation
      // Type: Emission/reflection nebula (pink/red with blue highlights)
      const orionPos = new Vector2(130, -70);
      const orionSize = 35;

      if (this.camera.zoom >= 0.5 && isVisible(orionPos, orionSize)) {
        const orionScreenPos = screenCenter.add(orionPos.sub(this.camera.position).mul(this.camera.zoom));

        // Multiple layers for depth
        for (let layer = 0; layer < 15; layer++) {
          const layerProgress = layer / 15;
          const radius = orionSize * this.camera.zoom * (0.3 + layerProgress * 0.7);
          const opacity = 0.12 * (1.0 - layerProgress * 0.6);

          // Irregular cloud shape
          const numPoints = 8;
          ctx.beginPath();

          for (let i = 0; i <= numPoints; i++) {
            const angle = (i / numPoints) * Math.PI * 2;
            const turbulence = Math.sin(angle * 3 + time * 0.5 + layer * 0.4) * 0.3 +
              Math.sin(angle * 5 - time * 0.3 + layer * 0.2) * 0.2;
            const r = radius * (1.0 + turbulence);
            const x = orionScreenPos.x + Math.cos(angle) * r;
            const y = orionScreenPos.y + Math.sin(angle) * r;

            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }

          // Pink/red emission with some blue reflection
          const hueShift = Math.sin(time * 0.4 + layer) * 15;
          const hue = layerProgress < 0.3 ? 220 + hueShift : 340 + hueShift; // Blue inner, red outer
          const brightness = 55 + Math.sin(time * 0.5 + layer) * 5;

          ctx.fillStyle = `hsla(${hue}, 90%, ${brightness}%, ${opacity})`;
          ctx.fill();
        }

        // Trapezium star cluster in center
        const trapeziumRng = new RandomGenerator(42001);
        for (let s = 0; s < 12; s++) {
          const starAngle = trapeziumRng.random() * Math.PI * 2;
          const starDist = trapeziumRng.random() * 8 * this.camera.zoom;
          const starX = orionScreenPos.x + Math.cos(starAngle) * starDist;
          const starY = orionScreenPos.y + Math.sin(starAngle) * starDist;
          const starSize = (2 + trapeziumRng.random() * 3) * this.camera.zoom;

          const pulse = Math.sin(time * 3 + s) * 0.3 + 0.7;
          const starGradient = ctx.createRadialGradient(starX, starY, 0, starX, starY, starSize * pulse);
          starGradient.addColorStop(0, 'rgba(200, 220, 255, 0.9)');
          starGradient.addColorStop(1, 'rgba(200, 220, 255, 0)');

          ctx.fillStyle = starGradient;
          ctx.beginPath();
          ctx.arc(starX, starY, starSize * pulse, 0, Math.PI * 2);
          ctx.fill();
        }

        // Draw label
        drawLabel(orionScreenPos, 'Orion Nebula', 'M42 / NGC 1976', 'rgba(255, 150, 180, 1)');
      }

      // ============== HELIX NEBULA (NGC 7293) ==============
      // Distance: ~650 light-years, "Eye of God"
      // Type: Planetary nebula (cyan/green with red outer shell)
      const helixPos = new Vector2(-85, 95);
      const helixSize = 25;

      if (this.camera.zoom >= 0.5 && isVisible(helixPos, helixSize)) {
        const helixScreenPos = screenCenter.add(helixPos.sub(this.camera.position).mul(this.camera.zoom));

        // Outer red shell
        for (let layer = 0; layer < 8; layer++) {
          const layerProgress = layer / 8;
          const radius = helixSize * this.camera.zoom * (0.7 + layerProgress * 0.3);
          const opacity = 0.08 * (1.0 - layerProgress);

          const gradient = ctx.createRadialGradient(
            helixScreenPos.x, helixScreenPos.y, radius * 0.5,
            helixScreenPos.x, helixScreenPos.y, radius
          );

          const hue = 350 + Math.sin(time * 0.3 + layer) * 10;
          gradient.addColorStop(0, `hsla(${hue}, 80%, 50%, 0)`);
          gradient.addColorStop(0.7, `hsla(${hue}, 85%, 45%, ${opacity})`);
          gradient.addColorStop(1, `hsla(${hue}, 80%, 40%, 0)`);

          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(helixScreenPos.x, helixScreenPos.y, radius, 0, Math.PI * 2);
          ctx.fill();
        }

        // Inner cyan/green eye
        for (let layer = 0; layer < 10; layer++) {
          const layerProgress = layer / 10;
          const radius = helixSize * this.camera.zoom * 0.7 * (0.2 + layerProgress * 0.6);
          const opacity = 0.15 * (1.0 - layerProgress * 0.5);

          const gradient = ctx.createRadialGradient(
            helixScreenPos.x, helixScreenPos.y, 0,
            helixScreenPos.x, helixScreenPos.y, radius
          );

          const hue = 160 + Math.sin(time * 0.4 + layer) * 20;
          const brightness = 55 + Math.sin(time * 0.6) * 5;
          gradient.addColorStop(0, `hsla(${hue}, 90%, ${brightness + 10}%, ${opacity * 1.5})`);
          gradient.addColorStop(1, `hsla(${hue}, 85%, ${brightness}%, 0)`);

          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(helixScreenPos.x, helixScreenPos.y, radius, 0, Math.PI * 2);
          ctx.fill();
        }

        // Central white dwarf
        const starSize = 3 * this.camera.zoom;
        const starPulse = Math.sin(time * 4) * 0.2 + 0.8;
        const starGradient = ctx.createRadialGradient(
          helixScreenPos.x, helixScreenPos.y, 0,
          helixScreenPos.x, helixScreenPos.y, starSize * starPulse
        );
        starGradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        starGradient.addColorStop(1, 'rgba(200, 230, 255, 0)');

        ctx.fillStyle = starGradient;
        ctx.beginPath();
        ctx.arc(helixScreenPos.x, helixScreenPos.y, starSize * starPulse, 0, Math.PI * 2);
        ctx.fill();

        // Draw label
        drawLabel(helixScreenPos, 'Helix Nebula', 'NGC 7293', 'rgba(120, 255, 200, 1)');
      }

      // ============== COALSACK NEBULA ==============
      // Distance: ~600 light-years
      // Type: Dark nebula (blocks background light)
      const coalsackPos = new Vector2(-60, -110);
      const coalsackSize = 40;

      if (this.camera.zoom >= 0.3 && isVisible(coalsackPos, coalsackSize)) {
        const coalsackScreenPos = screenCenter.add(coalsackPos.sub(this.camera.position).mul(this.camera.zoom));

        ctx.globalCompositeOperation = 'source-over'; // Use normal blending for dark nebula

        // Dark irregular cloud
        for (let layer = 0; layer < 10; layer++) {
          const layerProgress = layer / 10;
          const radius = coalsackSize * this.camera.zoom * (0.4 + layerProgress * 0.6);
          const opacity = 0.4 * (1.0 - layerProgress * 0.7);

          const numPoints = 12;
          ctx.beginPath();

          for (let i = 0; i <= numPoints; i++) {
            const angle = (i / numPoints) * Math.PI * 2;
            const turbulence = Math.sin(angle * 4 + time * 0.2 + layer * 0.3) * 0.4 +
              Math.sin(angle * 7 - time * 0.15 + layer * 0.5) * 0.3;
            const r = radius * (1.0 + turbulence);
            const x = coalsackScreenPos.x + Math.cos(angle) * r;
            const y = coalsackScreenPos.y + Math.sin(angle) * r;

            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }

          // Dark purple/black
          const hue = 270 + Math.sin(time * 0.2 + layer) * 15;
          ctx.fillStyle = `hsla(${hue}, 20%, 5%, ${opacity})`;
          ctx.fill();
        }

        // Draw label
        drawLabel(coalsackScreenPos, 'Coalsack Nebula', 'Dark Nebula', 'rgba(180, 150, 200, 1)');

        ctx.globalCompositeOperation = 'screen'; // Back to additive
      }

      // ============== LAGOON NEBULA (M8) ==============
      // Distance: ~4,100 light-years
      // Type: Emission nebula (pink/red with dark lanes)
      const lagoonPos = new Vector2(150, 50);
      const lagoonSize = 45;

      if (this.camera.zoom >= 0.4 && isVisible(lagoonPos, lagoonSize)) {
        const lagoonScreenPos = screenCenter.add(lagoonPos.sub(this.camera.position).mul(this.camera.zoom));

        // Main emission cloud
        for (let layer = 0; layer < 12; layer++) {
          const layerProgress = layer / 12;
          const radius = lagoonSize * this.camera.zoom * (0.4 + layerProgress * 0.6);
          const opacity = 0.1 * (1.0 - layerProgress * 0.6);

          // Elongated shape
          const scaleX = 1.3;
          const scaleY = 0.8;

          const numPoints = 10;
          ctx.beginPath();

          for (let i = 0; i <= numPoints; i++) {
            const angle = (i / numPoints) * Math.PI * 2;
            const turbulence = Math.sin(angle * 5 + time * 0.4 + layer * 0.3) * 0.35;
            const r = radius * (1.0 + turbulence);
            const x = lagoonScreenPos.x + Math.cos(angle) * r * scaleX;
            const y = lagoonScreenPos.y + Math.sin(angle) * r * scaleY;

            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }

          const hue = 340 + Math.sin(time * 0.3 + layer) * 15;
          const brightness = 50 + Math.sin(time * 0.5 + layer) * 5;
          ctx.fillStyle = `hsla(${hue}, 88%, ${brightness}%, ${opacity})`;
          ctx.fill();
        }

        // Dark "lagoon" lane across middle
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = 'rgba(10, 5, 15, 0.6)';
        ctx.lineWidth = 12 * this.camera.zoom;
        ctx.lineCap = 'round';
        ctx.beginPath();

        const laneLength = lagoonSize * this.camera.zoom * 1.8;
        const laneAngle = Math.PI * 0.15;
        const laneStartX = lagoonScreenPos.x - Math.cos(laneAngle) * laneLength * 0.6;
        const laneStartY = lagoonScreenPos.y - Math.sin(laneAngle) * laneLength * 0.6;
        const laneEndX = lagoonScreenPos.x + Math.cos(laneAngle) * laneLength * 0.6;
        const laneEndY = lagoonScreenPos.y + Math.sin(laneAngle) * laneLength * 0.6;

        ctx.moveTo(laneStartX, laneStartY);
        ctx.lineTo(laneEndX, laneEndY);
        ctx.stroke();

        ctx.globalCompositeOperation = 'screen';

        // Bright star-forming regions
        const lagoonRng = new RandomGenerator(8001);
        for (let s = 0; s < 8; s++) {
          const knotAngle = lagoonRng.random() * Math.PI * 2;
          const knotDist = lagoonRng.random() * lagoonSize * 0.6 * this.camera.zoom;
          const knotX = lagoonScreenPos.x + Math.cos(knotAngle) * knotDist * 1.3;
          const knotY = lagoonScreenPos.y + Math.sin(knotAngle) * knotDist * 0.8;

          const knotPulse = Math.sin(time * 2.5 + s) * 0.3 + 0.7;
          const knotSize = (3 + lagoonRng.random() * 4) * this.camera.zoom * knotPulse;

          const knotGradient = ctx.createRadialGradient(knotX, knotY, 0, knotX, knotY, knotSize);
          knotGradient.addColorStop(0, 'rgba(255, 180, 200, 0.7)');
          knotGradient.addColorStop(1, 'rgba(255, 120, 160, 0)');

          ctx.fillStyle = knotGradient;
          ctx.beginPath();
          ctx.arc(knotX, knotY, knotSize, 0, Math.PI * 2);
          ctx.fill();
        }

        // Draw label
        drawLabel(lagoonScreenPos, 'Lagoon Nebula', 'M8 / NGC 6523', 'rgba(255, 140, 170, 1)');
      }

      // ============== EAGLE NEBULA (M16) - "Pillars of Creation" ==============
      // Distance: ~7,000 light-years
      // Type: Emission nebula with famous pillars
      const eaglePos = new Vector2(180, -30);
      const eagleSize = 50;

      if (this.camera.zoom >= 0.4 && isVisible(eaglePos, eagleSize)) {
        const eagleScreenPos = screenCenter.add(eaglePos.sub(this.camera.position).mul(this.camera.zoom));

        // Background emission cloud
        for (let layer = 0; layer < 10; layer++) {
          const layerProgress = layer / 10;
          const radius = eagleSize * this.camera.zoom * (0.5 + layerProgress * 0.5);
          const opacity = 0.08 * (1.0 - layerProgress * 0.5);

          const gradient = ctx.createRadialGradient(
            eagleScreenPos.x, eagleScreenPos.y, 0,
            eagleScreenPos.x, eagleScreenPos.y, radius
          );

          const hue = 345 + Math.sin(time * 0.35 + layer) * 12;
          const brightness = 48 + Math.sin(time * 0.45 + layer) * 5;
          gradient.addColorStop(0, `hsla(${hue}, 85%, ${brightness + 5}%, ${opacity * 1.2})`);
          gradient.addColorStop(1, `hsla(${hue}, 80%, ${brightness}%, 0)`);

          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(eagleScreenPos.x, eagleScreenPos.y, radius, 0, Math.PI * 2);
          ctx.fill();
        }

        // The famous "Pillars of Creation" - three tall pillar structures
        ctx.globalCompositeOperation = 'source-over';

        const pillarPositions = [
          { offsetX: -15, height: 35, width: 8 },
          { offsetX: 0, height: 42, width: 10 },
          { offsetX: 18, height: 30, width: 7 }
        ];

        pillarPositions.forEach((pillar, idx) => {
          const pillarX = eagleScreenPos.x + pillar.offsetX * this.camera.zoom;
          const pillarBaseY = eagleScreenPos.y + 10 * this.camera.zoom;
          const pillarHeight = pillar.height * this.camera.zoom;
          const pillarWidth = pillar.width * this.camera.zoom;

          // Draw pillar as tapered column
          for (let segment = 0; segment < 8; segment++) {
            const segmentProgress = segment / 8;
            const y = pillarBaseY - pillarHeight * segmentProgress;
            const nextY = pillarBaseY - pillarHeight * (segment + 1) / 8;
            const widthScale = 1.0 - segmentProgress * 0.4; // Taper toward top

            const turbulence = Math.sin(segmentProgress * Math.PI * 4 + time * 0.3 + idx) * 3 * this.camera.zoom;

            const gradient = ctx.createLinearGradient(
              pillarX - pillarWidth * widthScale, y,
              pillarX + pillarWidth * widthScale, y
            );

            gradient.addColorStop(0, 'rgba(40, 20, 30, 0.7)');
            gradient.addColorStop(0.5, 'rgba(60, 30, 40, 0.85)');
            gradient.addColorStop(1, 'rgba(40, 20, 30, 0.7)');

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.moveTo(pillarX - pillarWidth * widthScale + turbulence, y);
            ctx.lineTo(pillarX + pillarWidth * widthScale + turbulence, y);
            ctx.lineTo(pillarX + pillarWidth * widthScale * 0.9 + turbulence, nextY);
            ctx.lineTo(pillarX - pillarWidth * widthScale * 0.9 + turbulence, nextY);
            ctx.closePath();
            ctx.fill();
          }

          // Bright edge highlights
          ctx.strokeStyle = `rgba(180, 100, 120, ${0.3 + Math.sin(time + idx) * 0.1})`;
          ctx.lineWidth = 2 * this.camera.zoom;
          ctx.beginPath();
          ctx.moveTo(pillarX - pillarWidth, pillarBaseY);
          ctx.lineTo(pillarX - pillarWidth * 0.6, pillarBaseY - pillarHeight);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(pillarX + pillarWidth, pillarBaseY);
          ctx.lineTo(pillarX + pillarWidth * 0.6, pillarBaseY - pillarHeight);
          ctx.stroke();
        });

        ctx.globalCompositeOperation = 'screen';

        // Star-forming regions at pillar tips
        pillarPositions.forEach((pillar, idx) => {
          const tipX = eagleScreenPos.x + pillar.offsetX * this.camera.zoom * 0.6;
          const tipY = eagleScreenPos.y - (pillar.height - 12) * this.camera.zoom;

          const tipPulse = Math.sin(time * 2 + idx * 2) * 0.3 + 0.7;
          const tipSize = 5 * this.camera.zoom * tipPulse;

          const tipGradient = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, tipSize);
          tipGradient.addColorStop(0, 'rgba(255, 200, 220, 0.8)');
          tipGradient.addColorStop(1, 'rgba(255, 150, 180, 0)');

          ctx.fillStyle = tipGradient;
          ctx.beginPath();
          ctx.arc(tipX, tipY, tipSize, 0, Math.PI * 2);
          ctx.fill();
        });

        // Draw label
        drawLabel(eagleScreenPos, 'Eagle Nebula', 'M16 / NGC 6611', 'rgba(255, 160, 180, 1)');
      }

      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
    }

    drawGrid(ctx, width, height) {
      const gridSize = 50;
      const scaledGrid = gridSize * this.camera.zoom;

      if (scaledGrid < 10) return;

      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 1;

      // Calculate offset based on camera position relative to internal resolution
      const screenCenter = new Vector2(width / 2, height / 2);
      // --- FIX ---
      // Was: this.position.mul (typo)
      // Should be: this.camera.position.mul
      const cameraScreenPos = screenCenter.sub(
        this.camera.position.mul(this.camera.zoom)
      );

      const offsetX = cameraScreenPos.x % scaledGrid;
      const offsetY = cameraScreenPos.y % scaledGrid;

      for (
        let x = offsetX - scaledGrid;
        x < width + scaledGrid;
        x += scaledGrid
      ) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      for (
        let y = offsetY - scaledGrid;
        y < height + scaledGrid;
        y += scaledGrid
      ) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    }

    drawScanLines(ctx, width, height) {
      const centerScreen = this.camera.worldToScreen(0, 0, width, height);
      const maxRadius = Math.max(width, height) * 1.5;

      ctx.save();
      ctx.translate(centerScreen.x, centerScreen.y);
      ctx.rotate(this.scanLineAngle);

      const gradient = ctx.createLinearGradient(0, 0, maxRadius, 0);
      gradient.addColorStop(0, "rgba(0, 200, 255, 0.4)");
      gradient.addColorStop(0.3, "rgba(0, 200, 255, 0.15)");
      gradient.addColorStop(1, "rgba(0, 200, 255, 0)");

      ctx.fillStyle = gradient;
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, maxRadius, 0, Math.PI / 12);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
      ctx.globalAlpha = 1;
    }

    drawConnections(ctx, width, height) {
      if (this.camera.zoom < 0.3) return;

      const systems = this.dataManager.getAllSystems();
      const threshold = 15;

      ctx.strokeStyle = COLORS.connection;
      ctx.lineWidth = 1;
      ctx.globalAlpha = this.connectionPulse * 0.5;

      // Get screen boundaries in world coordinates for culling
      const topLeft = this.camera.screenToWorld(0, 0, width, height);
      const bottomRight = this.camera.screenToWorld(
        width,
        height,
        width,
        height
      );
      const cullMargin = 20; // 20 ly margin

      const visibleSystems = systems.filter((system) => {
        return (
          system.position.x >= topLeft.x - cullMargin &&
          system.position.x <= bottomRight.x + cullMargin &&
          system.position.y >= topLeft.y - cullMargin &&
          system.position.y <= bottomRight.y + cullMargin
        );
      });

      visibleSystems.forEach((system1) => {
        // Only check against other visible systems
        visibleSystems.forEach((system2) => {
          if (system1.name >= system2.name) return;

          const dx = system1.position.x - system2.position.x;
          const dy = system1.position.y - system2.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < threshold) {
            const screen1 = this.camera.worldToScreen(
              system1.position.x,
              system1.position.y,
              width,
              height
            );
            const screen2 = this.camera.worldToScreen(
              system2.position.x,
              system2.position.y,
              width,
              height
            );

            // Screen-space culling is still useful
            if (screen1.x < -100 && screen2.x < -100) return;
            if (screen1.x > width + 100 && screen2.x > width + 100) return;
            if (screen1.y < -100 && screen2.y < -100) return;
            if (screen1.y > height + 100 && screen2.y > height + 100) return;

            ctx.beginPath();
            ctx.moveTo(screen1.x, screen1.y);
            ctx.lineTo(screen2.x, screen2.y);
            ctx.stroke();
          }
        });
      });

      ctx.globalAlpha = 1;
    }

    drawStars(ctx, width, height) {
      // Only draw star systems at galaxy scale or smaller
      // At larger scales, galaxies are rendered instead
      if (this.currentScale !== SCALE_GALAXY && this.currentScale !== SCALE_SYSTEM) {
        return;
      }

      const systems = this.dataManager.getAllSystems();

      // Get screen boundaries in world coordinates for culling
      const topLeft = this.camera.screenToWorld(0, 0, width, height);
      const bottomRight = this.camera.screenToWorld(
        width,
        height,
        width,
        height
      );
      const cullMargin = 50; // 50 ly margin, larger to account for glows

      // --- START MODIFICATION: Dynamic Fade Thresholds ---
      let dynamicOrbitThreshold = ORBIT_ZOOM_THRESHOLD; // Default: 4
      let dynamicFullAlphaZoom = ORBIT_FULL_ALPHA_ZOOM; // Default: 10

      if (
        this.selectedStar &&
        this.selectedStar.planets &&
        this.selectedStar.planets.length > 0
      ) {
        let maxOrbitAU = 0;
        this.selectedStar.planets.forEach((p) => {
          if (p.orbitRadius > maxOrbitAU) {
            maxOrbitAU = p.orbitRadius;
          }
        });

        if (maxOrbitAU > 0) {
          // Calculate zoom level where the max orbit hits a certain pixel size
          const orbitScaleFactor = 0.8; // Must match drawSystemOrbits

          // Start fading out when the orbit is 100px
          const startFadePixelSize = 100;
          dynamicOrbitThreshold =
            startFadePixelSize / (maxOrbitAU * orbitScaleFactor);

          // Be fully faded out when the orbit is 400px
          const fullFadePixelSize = 400;
          dynamicFullAlphaZoom =
            fullFadePixelSize / (maxOrbitAU * orbitScaleFactor);

          // Clamp values to be sane
          dynamicOrbitThreshold = Math.max(
            0.5,
            Math.min(dynamicOrbitThreshold, 500)
          );
          dynamicFullAlphaZoom = Math.max(
            1.0,
            Math.min(dynamicFullAlphaZoom, 1000)
          );

          // Ensure full zoom is always greater than start zoom
          if (dynamicFullAlphaZoom <= dynamicOrbitThreshold) {
            dynamicFullAlphaZoom = dynamicOrbitThreshold * 2.5; // 2.5x is the default ratio (10 / 4)
          }
        }
      }
      // --- END MODIFICATION ---

      systems.forEach((system) => {
        ctx.save(); // MODIFICATION: Save context for alpha fade

        // World-space culling
        if (
          system.position.x < topLeft.x - cullMargin ||
          system.position.x > bottomRight.x + cullMargin ||
          system.position.y < topLeft.y - cullMargin ||
          system.position.y > bottomRight.y + cullMargin
        ) {
          ctx.restore(); // MODIFICATION: Restore context before returning
          return;
        }

        const screen = this.camera.worldToScreen(
          system.position.x,
          system.position.y,
          width,
          height
        );

        // Screen-space culling (redundant but fast)
        if (
          screen.x < -50 ||
          screen.x > width + 50 ||
          screen.y < -50 ||
          screen.y > height + 50
        ) {
          ctx.restore(); // MODIFICATION: Restore context before returning
          return;
        }

        const isSelected = this.selectedStar === system; // MODIFICATION: Moved up

        // MODIFICATION: Fade out other stars when zoomed in on a selection
        // Use dynamic thresholds calculated above
        // Only fade if selected system HAS planets
        if (
          this.selectedStar &&
          !isSelected &&
          this.selectedStar.planets &&
          this.selectedStar.planets.length > 0 &&
          this.camera.zoom > dynamicOrbitThreshold
        ) {
          const fadeProgress = Math.max(
            0,
            Math.min(
              1,
              (this.camera.zoom - dynamicOrbitThreshold) /
              (dynamicFullAlphaZoom - dynamicOrbitThreshold)
            )
          );
          ctx.globalAlpha = 1.0 - fadeProgress;
          if (ctx.globalAlpha < 0.01) {
            ctx.restore(); // Skip drawing if fully faded
            return;
          }
        }

        // --- MODIFICATION: Reworked star size for realistic radius ---
        // We define a base visual size in world units, and add the scaled radius
        // This prevents tiny stars (like Sol) from being invisible,
        // while allowing giant stars (like UY Scuti) to be visibly larger.
        const MIN_VISUAL_WORLD_RADIUS = 0.15; // Base world-unit radius for visibility
        const RADIUS_SCALE_FACTOR = 0.01; // How much solar radius affects world size

        // Calculate the star's visual radius in world units
        const worldRadius =
          MIN_VISUAL_WORLD_RADIUS + system.radius * RADIUS_SCALE_FACTOR;

        // Calculate the screen pixel size
        const MIN_PIXEL_SIZE = 2;
        const size = Math.max(MIN_PIXEL_SIZE, worldRadius * this.camera.zoom);
        // --- END MODIFICATION ---

        const isCurrent = system.name === this.dataManager.currentSystem; // const isSelected = this.selectedStar === system; // MODIFICATION: Moved up
        const isHovered = this.hoveredStar === system;

        // Draw selection glow
        if (isSelected || isHovered || isCurrent) {
          const glowSize = size * (3 + this.selectionPulse * 0.5);
          const gradient = ctx.createRadialGradient(
            screen.x,
            screen.y,
            0,
            screen.x,
            screen.y,
            glowSize
          );

          let glowColor = COLORS.selectionGlow;
          if (isCurrent) glowColor = "rgba(255, 170, 0, 0.1)";

          gradient.addColorStop(0, glowColor);
          gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(screen.x, screen.y, glowSize, 0, Math.PI * 2);
          ctx.fill();
        }

        // Draw star glow
        const starGlowSize = size * 2.5;
        const starGradient = ctx.createRadialGradient(
          screen.x,
          screen.y,
          0,
          screen.x,
          screen.y,
          starGlowSize
        );

        const color = this.hexToRgb(system.color);
        starGradient.addColorStop(
          0,
          `rgba(${color.r}, ${color.g}, ${color.b}, 0.8)`
        );
        starGradient.addColorStop(
          0.5,
          `rgba(${color.r}, ${color.g}, ${color.b}, 0.3)`
        );
        starGradient.addColorStop(1, "rgba(0, 0, 0, 0)");

        ctx.fillStyle = starGradient;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, starGlowSize, 0, Math.PI * 2);
        ctx.fill();

        // Check if this is a black hole system and render accordingly
        if (system.blackHoleType) {
          // OPTIMIZATION: Check if in Great Attractor for simpler rendering
          const inGA = this.isInGreatAttractor(system.position.x, system.position.y);

          if (system.blackHoleType === 'hypermassive') {
            // Render hypermassive black hole
            if (inGA && this.camera.zoom < 0.1) {
              // Ultra-simplified version for Great Attractor at distance
              ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
              ctx.beginPath();
              ctx.arc(screen.x, screen.y, size * 1.5, 0, Math.PI * 2);
              ctx.fill();
              // Simple orange ring
              ctx.strokeStyle = 'rgba(255, 100, 50, 0.5)';
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(screen.x, screen.y, size * 2, 0, Math.PI * 2);
              ctx.stroke();
            } else {
              this.drawHypermassiveBlackHole(ctx, width, height, system);
            }
          } else if (system.blackHoleType === 'supermassive') {
            // Render supermassive black hole
            if (inGA && this.camera.zoom < 0.1) {
              // Simplified version for Great Attractor
              ctx.fillStyle = 'rgba(50, 10, 10, 0.7)';
              ctx.beginPath();
              ctx.arc(screen.x, screen.y, size * 1.2, 0, Math.PI * 2);
              ctx.fill();
              // Red glow
              ctx.strokeStyle = 'rgba(200, 50, 50, 0.4)';
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.arc(screen.x, screen.y, size * 1.6, 0, Math.PI * 2);
              ctx.stroke();
            } else {
              // Draw accretion disk everywhere except in Great Attractor
              this.drawSupermassiveBlackHole(ctx, width, height, system, !inGA);
            }
          } else if (system.blackHoleType === 'normal') {
            // Stellar-mass black hole: a miniature Gargantua. Lensing of the
            // background is skipped (too small on screen, and several may share
            // the view) but it keeps the edge-on disk, photon halo and shadow.
            const eh = Math.max(2, size * 0.6);
            this._renderBlackHoleCore(ctx, width, height, screen, eh, {
              tilt: 0.34, diskInner: 1.4, diskOuter: 2.6, layers: 5, segments: 32,
              chaos: 0.18, hueInner: 42, hueOuter: 6, lightInner: 80, lightOuter: 24,
              intensity: 0.85, diskSpeed: 0.6, lensing: false, hotspots: 1,
              beamAxis: this.time * 0.5,
            });
          }
        } else {
          // Draw normal star core. Use a true 3D turbulent sphere when the star
          // is large enough on screen (zoomed into a system); fall back to a
          // flat disc for the many tiny dots at galaxy scale (perf).
          let drew3D = false;
          if (
            size >= 7 &&
            window.GalaxySim &&
            window.GalaxySim.Renderer3D &&
            window.GalaxySim.Renderer3D.available()
          ) {
            drew3D = window.GalaxySim.Renderer3D.renderStar(
              ctx, screen.x, screen.y, size, system, this.time
            );
          }
          if (!drew3D) {
            ctx.fillStyle = system.color;
            ctx.beginPath();
            ctx.arc(screen.x, screen.y, size, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Draw selection ring
        /*
                if (isSelected) {
                    ctx.strokeStyle = COLORS.selection;
                    ctx.lineWidth = 2;
                    ctx.globalAlpha = this.selectionPulse;
                    ctx.beginPath();
                    ctx.arc(screen.x, screen.y, size * 4, 0, Math.PI * 2);
                    ctx.stroke();
                    
                    ctx.globalAlpha = 0.5;
                    ctx.beginPath();
                    ctx.arc(screen.x, screen.y, size * 5, 0, Math.PI * 2);
                    ctx.stroke();
                    
                    ctx.globalAlpha = 1;
                }*/

        // Draw current system marker - REMOVED crosshair
        /*
                if (isCurrent) {
                    ctx.strokeStyle = COLORS.current;
                    ctx.lineWidth = 2;
                    const markerSize = size * 5;
                    ctx.beginPath();
                    ctx.moveTo(screen.x - markerSize, screen.y);
                    ctx.lineTo(screen.x + markerSize, screen.y);
                    ctx.moveTo(screen.x, screen.y - markerSize);
                    ctx.lineTo(screen.x, screen.y + markerSize);
                    ctx.stroke();
                }
                */

        // Draw label
        const showLabel =
          this.camera.zoom > 0.3 || isSelected || isHovered || isCurrent;
        if (showLabel) {
          const fontSize = Math.max(10, Math.min(14, 12 * this.camera.zoom));
          ctx.font = `${fontSize}px monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";

          const labelY = screen.y + size * 3 + 2;
          const metrics = ctx.measureText(system.name);
          const labelWidth = metrics.width + 8;
          const labelHeight = fontSize + 4;

          ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
          ctx.fillRect(
            screen.x - labelWidth / 2,
            labelY,
            labelWidth,
            labelHeight
          );

          // Gold color for hardcoded systems, white/highlight for others
          if (system.hardcoded) {
            ctx.fillStyle = "#FFD700"; // Gold
          } else if (isSelected) {
            ctx.fillStyle = COLORS.textHighlight;
          } else {
            ctx.fillStyle = COLORS.text;
          }
          ctx.fillText(system.name, screen.x, labelY + 2);
        }

        ctx.restore(); // MODIFICATION: Restore context
      });
    }

    drawPlayerShip(ctx, width, height) {
      if (!$gameSystem.starMapData || !$gameSystem.starMapData.playerShip)
        return;

      const shipData = $gameSystem.starMapData.playerShip;
      if (!shipData.position) return;

      // Safety check for valid position values
      if (!isFinite(shipData.position.x) || !isFinite(shipData.position.y)) {
        console.warn(
          "Ship position contains invalid values:",
          shipData.position
        );
        return;
      }

      const screen = this.camera.worldToScreen(
        shipData.position.x,
        shipData.position.y,
        width,
        height
      );

      // Safety check for valid screen coordinates
      if (!isFinite(screen.x) || !isFinite(screen.y)) {
        console.warn("Screen position contains invalid values:", screen);
        return;
      }

      // Ship is always visible - draw triangular indicator
      const shipSize = 12; // Fixed size, visible at all zoom levels
      const pulseSize = shipSize + Math.sin(this.time * 4) * 2;

      // Draw glow
      const glowGradient = ctx.createRadialGradient(
        screen.x,
        screen.y,
        0,
        screen.x,
        screen.y,
        pulseSize * 2
      );
      glowGradient.addColorStop(0, "rgba(0, 255, 100, 0.6)");
      glowGradient.addColorStop(1, "rgba(0, 255, 100, 0)");
      ctx.fillStyle = glowGradient;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, pulseSize * 2, 0, Math.PI * 2);
      ctx.fill();

      // Draw triangle ship
      ctx.save();
      ctx.translate(screen.x, screen.y);

      // Rotate towards target if moving or orbiting
      let rotationAngle = 0;
      if (
        shipData.isMoving &&
        shipData.targetPosition &&
        shipData.departurePosition
      ) {
        const dx = shipData.targetPosition.x - shipData.departurePosition.x;
        const dy = shipData.targetPosition.y - shipData.departurePosition.y;
        rotationAngle = Math.atan2(dy, dx) + Math.PI / 2; // Point arrow tip toward travel direction
      } else if (
        (shipData.currentPlanet || shipData.currentSystem) &&
        !shipData.stoppedMidTravel
      ) {
        // When orbiting, point in direction of orbit movement (only if not stopped mid-travel)
        const time = Date.now() * 0.0002;
        rotationAngle = time * 4 + Math.PI / 2; // Rotate as ship orbits
      }
      // If stoppedMidTravel is true, rotationAngle stays 0 (ship points up, stationary)

      ctx.rotate(rotationAngle);

      ctx.fillStyle = "rgba(0, 255, 100, 0.9)";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.moveTo(0, -shipSize); // Arrow tip points up (negative Y)
      ctx.lineTo(shipSize * 0.6, shipSize * 0.5);
      ctx.lineTo(0, shipSize * 0.2);
      ctx.lineTo(-shipSize * 0.6, shipSize * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.restore();

      // Draw player name label (never fades)
      const playerName = $gameParty.leader()
        ? $gameParty.leader().name()
        : "Player 1";
      ctx.font = "bold 12px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";

      const labelY = screen.y + shipSize + 4;
      const metrics = ctx.measureText(playerName);
      const labelWidth = metrics.width + 8;
      const labelHeight = 16;

      ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
      ctx.fillRect(screen.x - labelWidth / 2, labelY, labelWidth, labelHeight);

      ctx.fillStyle = "rgba(0, 255, 100, 1)";
      ctx.fillText(playerName, screen.x, labelY + 2);

      // Draw travel info if moving
      if (shipData.isMoving && shipData.targetSystem) {
        const speedMultiplier = $gameVariables.value(94) || 1;
        const dmFuel = window.GalaxySim.getDataManager && window.GalaxySim.getDataManager();
        const fuel = Math.floor(dmFuel && dmFuel.getMapFuel ? dmFuel.getMapFuel() : 0);

        const infoY = labelY + labelHeight + 4;
        const infoText = `→ ${shipData.targetSystem} | ${speedMultiplier}x | Fuel: ${fuel}`;
        const infoMetrics = ctx.measureText(infoText);
        const infoWidth = infoMetrics.width + 8;

        ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
        ctx.fillRect(screen.x - infoWidth / 2, infoY, infoWidth, labelHeight);

        ctx.fillStyle = "rgba(255, 200, 0, 1)";
        ctx.font = "11px monospace";
        ctx.fillText(infoText, screen.x, infoY + 2);
      }
    }

    drawSupermassiveBlackHole(ctx, width, height, system, skipAccretionDisk = false) {
      // Render Sagittarius A* as a supermassive black hole with Gargantua-style visuals
      const screen = this.camera.worldToScreen(
        system.position.x,
        system.position.y,
        width,
        height
      );

      // Scale based on zoom
      const baseRadius = 10; // Event horizon radius in pixels at zoom 1.0
      const eventHorizonRadius = baseRadius * this.camera.zoom;

      // Don't render if too small or off-screen (wide margin: disk is ~4.5x EH)
      if (eventHorizonRadius < 5) return;
      const margin = eventHorizonRadius * 6;
      if (screen.x < -margin || screen.x > width + margin ||
        screen.y < -margin || screen.y > height + margin) {
        return;
      }

      const time = this.time;
      const diskOuterRadius = eventHorizonRadius * 4.5;

      if (skipAccretionDisk) {
        // Great Attractor performance path: cheap shadow + a single hot ring.
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, eventHorizonRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 150, 70, 0.55)';
        ctx.lineWidth = Math.max(1.5, eventHorizonRadius * 0.18);
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, eventHorizonRadius * 1.15, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        // Full Interstellar/Gargantua-style render.
        this._renderBlackHoleCore(ctx, width, height, screen, eventHorizonRadius, {
          tilt: 0.30, diskInner: 1.5, diskOuter: 4.5, layers: 9, segments: 56,
          chaos: 0.16, hueInner: 48, hueOuter: 8, lightInner: 84, lightOuter: 26,
          intensity: 1.0, diskSpeed: 0.55, lensing: true, hotspots: 3,
          beamAxis: this.time * 0.3,
        });
      }

      // 6. ORBITING STARS (planets become orbiting stars) - ANIMATED
      if (system.planets && system.planets.length > 0) {
        system.planets.forEach((star, index) => {
          const orbitSpeed = 0.1 * (1 / Math.max(star.orbitRadius, 0.5));
          const angle = star.phase + time * orbitSpeed;
          const orbitRadius = diskOuterRadius + (index * 30 * this.camera.zoom);

          const starX = screen.x + Math.cos(angle) * orbitRadius;
          const starY = screen.y + Math.sin(angle) * orbitRadius;

          // Draw motion trail behind star
          const trailLength = 8;
          for (let t = 0; t < trailLength; t++) {
            const trailAngle = angle - (t * 0.15);
            const trailX = screen.x + Math.cos(trailAngle) * orbitRadius;
            const trailY = screen.y + Math.sin(trailAngle) * orbitRadius;
            const trailAlpha = (1 - t / trailLength) * 0.3;

            ctx.fillStyle = `rgba(200, 220, 255, ${trailAlpha})`;
            ctx.beginPath();
            ctx.arc(trailX, trailY, 2, 0, Math.PI * 2);
            ctx.fill();
          }

          // Draw orbiting star as bright point
          const starSize = Math.max(2, 3 * this.camera.zoom);
          const starFlare = Math.sin(time * 3 + index) * 0.3 + 0.7; // Twinkling effect

          // Star glow (animated)
          const starGradient = ctx.createRadialGradient(
            starX, starY, 0,
            starX, starY, starSize * (3 + starFlare)
          );
          starGradient.addColorStop(0, `rgba(255, 255, 255, ${starFlare})`);
          starGradient.addColorStop(0.3, `rgba(200, 220, 255, ${0.8 * starFlare})`);
          starGradient.addColorStop(1, 'rgba(150, 180, 255, 0)');

          ctx.fillStyle = starGradient;
          ctx.beginPath();
          ctx.arc(starX, starY, starSize * (3 + starFlare), 0, Math.PI * 2);
          ctx.fill();

          // Star core with flare
          ctx.fillStyle = '#ffffff';
          ctx.shadowBlur = 10 * starFlare;
          ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
          ctx.beginPath();
          ctx.arc(starX, starY, starSize, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;

          // Cross flare effect
          if (starFlare > 0.8) {
            ctx.strokeStyle = `rgba(255, 255, 255, ${(starFlare - 0.8) * 2})`;
            ctx.lineWidth = 1;
            const flareSize = starSize * 4;
            ctx.beginPath();
            ctx.moveTo(starX - flareSize, starY);
            ctx.lineTo(starX + flareSize, starY);
            ctx.moveTo(starX, starY - flareSize);
            ctx.lineTo(starX, starY + flareSize);
            ctx.stroke();
          }

          // Draw orbit path (faint, animated dashes)
          ctx.strokeStyle = 'rgba(100, 150, 200, 0.2)';
          ctx.lineWidth = 1;
          ctx.setLineDash([5, 5]);
          ctx.lineDashOffset = -time * 10;
          ctx.beginPath();
          ctx.arc(screen.x, screen.y, orbitRadius, 0, Math.PI * 2);
          ctx.stroke();

          // Star name
          if (this.camera.zoom > ORBIT_FULL_ALPHA_ZOOM * 0.5) {
            ctx.font = '10px monospace';
            ctx.fillStyle = 'rgba(200, 220, 255, 0.8)';
            ctx.textAlign = 'center';
            const starName = star.name.split(' ').pop();
            ctx.fillText(`S${index + 1}`, starX, starY - starSize * 4);
          }
        });

        // Reset line dash
        ctx.setLineDash([]);
      }

      // 7. SYSTEM NAME
      ctx.font = 'bold 16px monospace';
      ctx.fillStyle = 'rgba(255, 200, 100, 0.9)';
      ctx.textAlign = 'center';
      ctx.shadowBlur = 10;
      ctx.shadowColor = 'rgba(255, 150, 50, 0.8)';
      ctx.fillText('Supermassive Black Hole', screen.x, screen.y - eventHorizonRadius - 15);
      ctx.shadowBlur = 0;
    }

    drawSystemOrbits(ctx, width, height) {
      // Reset each frame; set below once we know which system's bodies are on
      // screen. The input handler reads this to hit-test any visible planet/moon
      // (set/cleared here, consumed next frame in processMapInput).
      this._displayedSystem = null;

      // Show orbits for selected system or destination system when traveling
      const shipData = $gameSystem.starMapData;
      const isMoving = shipData && shipData.isShipMoving();
      const destinationSystemName = isMoving
        ? shipData.getTargetSystem()
        : null;

      // Determine which system to show orbits for
      let system = this.selectedStar;
      if (!system && destinationSystemName) {
        // If no system is selected but we're traveling, show destination orbits
        system = this.dataManager.getSystem(destinationSystemName);
      }

      // If still no system, fall back to the docked system's orbits -- but
      // only once the player has actually zoomed in toward it. This keeps the
      // current system DESELECTED (no orbits) in the zoomed-out start view.
      if (
        !system &&
        this.camera.zoom >= ORBIT_ZOOM_THRESHOLD &&
        this.dataManager.playerShip &&
        this.dataManager.playerShip.currentSystem
      ) {
        system = this.dataManager.getSystem(
          this.dataManager.playerShip.currentSystem
        );
      }

      if (!system) return;

      // Special rendering for Sagittarius A* supermassive black hole
      if (system.name === "Sagittarius A*") {
        this.drawSupermassiveBlackHole(ctx, width, height, system);
        return;
      }

      // Calculate fade alpha based on zoom level, but keep visible when selected
      const fadeProgress =
        this.camera.zoom < ORBIT_ZOOM_THRESHOLD
          ? 0.3 // Minimum alpha when zoomed out but selected
          : Math.min(
            1,
            0.3 +
            ((this.camera.zoom - ORBIT_ZOOM_THRESHOLD) /
              (ORBIT_FULL_ALPHA_ZOOM - ORBIT_ZOOM_THRESHOLD)) *
            0.7
          );

      const screen = this.camera.worldToScreen(
        system.position.x,
        system.position.y,
        width,
        height
      );

      // Skip systems without planets (Moved this check up)
      if (!system.planets || system.planets.length === 0) return;

      // --- FIX ---
      // Find max orbit radius for scaling *before* culling
      let maxOrbitRadius = 0;
      system.planets.forEach((planet) => {
        if (planet.orbitRadius > maxOrbitRadius) {
          maxOrbitRadius = planet.orbitRadius;
        }
      });

      if (maxOrbitRadius === 0) return;
      const MIN_VISUAL_WORLD_RADIUS = 0.15;
      const RADIUS_SCALE_FACTOR = 0.01;
      const worldRadius =
        MIN_VISUAL_WORLD_RADIUS + system.radius * RADIUS_SCALE_FACTOR;
      const MIN_PIXEL_SIZE = 2;
      const starPixelRadius = Math.max(
        MIN_PIXEL_SIZE,
        worldRadius * this.camera.zoom
      );
      const scale = this.camera.zoom * 0.8;

      // Calculate max screen radius and add to culling margin
      const maxScreenOrbitRadius = maxOrbitRadius * scale;
      const cullMargin = 500 + maxScreenOrbitRadius;

      // Skip if *entire* system (star + orbits) is not visible on screen
      if (
        screen.x < -cullMargin ||
        screen.x > width + cullMargin ||
        screen.y < -cullMargin ||
        screen.y > height + cullMargin
      ) {
        return; // This check is now correct
      }
      // --- END FIX ---

      // This system's planets/moons are about to be drawn -> they are the
      // bodies the player can click this frame (consumed next frame in
      // processMapInput via findPlanetAtPosition / findAnyMoonAtPosition).
      this._displayedSystem = system;

      // Draw each planet's orbit
      system.planets.forEach((planet, i) => {
        // --- MODIFICATION: Reworked orbit radius calculation ---
        // Get the scaled orbit radius (semi-major axis)
        const planetPixelOrbit = planet.orbitRadius * scale;
        // Add the star's visual pixel radius to the planet's
        // scaled orbit radius. This "pushes" all orbits
        // outside the visual star disk.
        const orbitRadius = starPixelRadius + planetPixelOrbit;
        // --- END MODIFICATION ---

        // Show orbits even when small if system is selected
        if (orbitRadius < 1) return; // Use the new total radius

        // Check if this planet type has eccentric orbit
        const isEccentric = ECCENTRIC_ORBIT_TYPES.has(planet.type);
        // Base alpha on fade progress
        const baseAlpha = 0.4 * fadeProgress;
        ctx.globalAlpha = baseAlpha;

        ctx.strokeStyle = COLORS.orbit;
        ctx.lineWidth = 1;
        ctx.setLineDash([]);

        if (isEccentric) {
          // Draw eccentric ellipse
          const eccentricity = 0.6; // High eccentricity for comets/rogues

          // --- MODIFICATION ---
          // 'a_planet' is the *planet's* semi-major axis
          const a_planet = planetPixelOrbit;
          // 'b_planet' is the *planet's* semi-minor axis
          const b_planet =
            a_planet * Math.sqrt(1 - eccentricity * eccentricity);
          // 'c_focus_offset' is based on the *planet's* orbit
          const c_focus_offset = a_planet * eccentricity;

          // The *visual* axes are "inflated" by the star's radius
          const a_visual = a_planet + starPixelRadius;
          const b_visual = b_planet + starPixelRadius;

          ctx.beginPath();
          ctx.ellipse(
            screen.x + c_focus_offset, // Center is still based on planet's orbit
            screen.y,
            a_visual, // But we draw with the *inflated* axes
            b_visual,
            0,
            0,
            Math.PI * 2
          );
          ctx.stroke();

          // Use dashed line for eccentric orbits
          ctx.setLineDash([5, 5]);
          ctx.globalAlpha = baseAlpha * 0.5;
          ctx.stroke();
        } else {
          // Draw circular orbit
          ctx.beginPath();
          ctx.arc(screen.x, screen.y, orbitRadius, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Draw planet at current position if zoom is high enough
        if (this.camera.zoom > ORBIT_FULL_ALPHA_ZOOM * 0.7) {
          const angle =
            planet.phase +
            this.time * 0.1 * (1 / Math.max(planet.orbitRadius, 0.5));
          let planetX, planetY;

          if (isEccentric) {
            // --- MODIFICATION ---
            // Re-use calculations from orbit drawing to place dot
            const eccentricity = 0.6;
            const a_planet = planetPixelOrbit;
            const b_planet =
              a_planet * Math.sqrt(1 - eccentricity * eccentricity);
            const c_focus_offset = a_planet * eccentricity;

            const a_visual = a_planet + starPixelRadius;
            const b_visual = b_planet + starPixelRadius;
            // --- END MODIFICATION ---

            planetX = screen.x + c_focus_offset + Math.cos(angle) * a_visual;
            planetY = screen.y + Math.sin(angle) * b_visual;
          } else {
            // Use the combined orbitRadius for circular orbits
            planetX = screen.x + Math.cos(angle) * orbitRadius;
            planetY = screen.y + Math.sin(angle) * orbitRadius;
          }

          // Planet visual size. Planets are drawn far larger than true scale
          // (a real planet is <1% of its star) but must still read as clearly
          // smaller than the star, so the size is both reduced and capped to a
          // fraction of the star's on-screen radius.
          const baseSize = (planet.radius || 1) * 1.0; // planet.radius is in Earth radii
          const zoomFactor = Math.min(1.0, this.camera.zoom / 500); // More gradual scaling
          let planetSize = baseSize * this.camera.zoom * 0.025 * zoomFactor;
          // Gas giants read a bit larger than rocky worlds, but nothing is
          // allowed to rival the star: cap to a fraction of its radius. The
          // 2px floor afterwards keeps distant planets visible as dots.
          const isGas = !!(this.planetRenderer && this.planetRenderer.isGasGiant && this.planetRenderer.isGasGiant(planet.type));
          planetSize = Math.min(planetSize, starPixelRadius * (isGas ? 0.55 : 0.38));
          planetSize = Math.max(2, planetSize);

          // Validate planetX and planetY to prevent NaN crashes
          if (isFinite(planetX) && isFinite(planetY) && isFinite(planetSize)) {
            // Check if this planet is hovered or selected
            const isPlanetSelected =
              this.selectedPlanet && this.selectedPlanet.name === planet.name;
            const isPlanetHovered =
              this.hoveredPlanet && this.hoveredPlanet.name === planet.name;

            ctx.globalAlpha = fadeProgress;

            // Draw selection/hover highlight
            if (isPlanetSelected || isPlanetHovered) {
              const highlightSize = planetSize + 8 + Math.sin(this.time * 3) * 2;
              const highlightColor = isPlanetSelected
                ? COLORS.selection
                : COLORS.textHighlight;

              // Outer glow ring
              ctx.strokeStyle = highlightColor;
              ctx.lineWidth = 2;
              ctx.globalAlpha = 0.8;
              ctx.beginPath();
              ctx.arc(planetX, planetY, highlightSize, 0, Math.PI * 2);
              ctx.stroke();

              // Inner glow
              const glowGradient = ctx.createRadialGradient(
                planetX,
                planetY,
                planetSize,
                planetX,
                planetY,
                highlightSize
              );
              glowGradient.addColorStop(0, withAlpha(highlightColor, 0));
              glowGradient.addColorStop(1, withAlpha(highlightColor, 0.25));
              ctx.fillStyle = glowGradient;
              ctx.beginPath();
              ctx.arc(planetX, planetY, highlightSize, 0, Math.PI * 2);
              ctx.fill();

              ctx.globalAlpha = fadeProgress;
            }

            // Check if this is a comet for trail rendering
            const isComet =
              planet.type === "comet" ||
              planet.type === "short_period_comet" ||
              planet.type === "long_period_comet";

            // Draw comet trail BEFORE the comet body (so body renders on top)
            if (isComet && planetSize >= PLANET_MIN_SIZE && this.camera.zoom > PLANET_DETAIL_THRESHOLD) {
              ctx.save();
              this.planetRenderer.drawCometTrail(
                ctx,
                planetX,
                planetY,
                planetSize,
                screen.x,
                screen.y,
                planet.type,
                planet,
                this.time
              );
              ctx.restore();
            }

            // Use procedural planet rendering only when really close and large enough
            if (
              planetSize >= PLANET_MIN_SIZE &&
              this.camera.zoom > PLANET_DETAIL_THRESHOLD
            ) {
              const seed = planet.name
                .split("")
                .reduce((acc, char) => acc + char.charCodeAt(0), 0);
              this.planetRenderer.drawPlanet(
                ctx,
                planetX,
                planetY,
                planetSize,
                planet,
                seed,
                this.time,
                { x: screen.x, y: screen.y }
              );
            } else {
              // Simple dot rendering for distant planets with subtle glow
              const dotSize = Math.max(1.5, planetSize);
              const glowGradient = ctx.createRadialGradient(
                planetX,
                planetY,
                0,
                planetX,
                planetY,
                dotSize * 2
              );
              // Convert numeric color to hex string if needed
              const colorStr = typeof planet.color === 'number'
                ? '#' + planet.color.toString(16).padStart(6, '0')
                : planet.color;
              const baseColor = this.planetRenderer.hexToRgb(planet.color);
              glowGradient.addColorStop(0, colorStr);
              glowGradient.addColorStop(0.5, colorStr);
              glowGradient.addColorStop(
                1,
                `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, 0)`
              );

              ctx.fillStyle = glowGradient;
              ctx.beginPath();
              ctx.arc(planetX, planetY, dotSize * 2, 0, Math.PI * 2);
              ctx.fill();
            }

            // MODIFICATION: Always show label with type
            ctx.font = "10px monospace";
            ctx.fillStyle = COLORS.orbitLabel;
            ctx.textAlign = "center";
            // Use the same fadeProgress as the planet dot, but slightly dimmer
            ctx.globalAlpha = fadeProgress * 0.8;

            const planetName = planet.name.split(" ").pop();
            const planetType = planet.type.replace(/_/g, " ");
            // Capitalize first letter
            const simpleType =
              planetType.charAt(0).toUpperCase() + planetType.slice(1);
            const labelText = `${planetName} (${simpleType})`;

            ctx.fillText(labelText, planetX, planetY - planetSize - 8);

            // --- START NEW: Draw moons in Galaxy View ---
            // Show moons for EVERY planet once zoomed in enough so any visible
            // moon can be clicked directly. Orbit rings stay gated to the
            // selected/hovered planet (below) to keep the view readable.
            const showMoons = this.camera.zoom > ORBIT_FULL_ALPHA_ZOOM; // Start at 10x zoom

            if (
              showMoons &&
              planet.moons &&
              planet.moons.length > 0
            ) {
              const numMoons = planet.moons.length;

              planet.moons.forEach((moon, moonIndex) => {
                // Space moons evenly around the planet to avoid overlap
                // Base orbit radius increases for each moon
                const baseOrbitSpacing = planetSize * 1.5; // Start 1.5x planet radius away
                const orbitSpacing = planetSize * 0.8; // Add 0.8x planet radius for each moon
                const finalMoonOrbitRadius =
                  baseOrbitSpacing + moonIndex * orbitSpacing;

                // 1. Draw moon orbit ring only for the selected/hovered planet,
                // so other planets' moons stay readable as plain dots.
                if (isPlanetSelected || isPlanetHovered) {
                  ctx.strokeStyle = COLORS.orbit;
                  ctx.lineWidth = 1;
                  ctx.globalAlpha = baseAlpha * 0.5;
                  ctx.setLineDash([2, 2]);
                  ctx.beginPath();
                  ctx.arc(planetX, planetY, finalMoonOrbitRadius, 0, Math.PI * 2);
                  ctx.stroke();
                  ctx.setLineDash([]);
                }

                // 2. Draw moon dot
                // Distribute moons evenly around the orbit based on their index
                const angleOffset = (moonIndex / numMoons) * (Math.PI * 2);
                const moonAngle = moon.phase + angleOffset + this.time * 0.2;
                const moonX =
                  planetX + Math.cos(moonAngle) * finalMoonOrbitRadius;
                const moonY =
                  planetY + Math.sin(moonAngle) * finalMoonOrbitRadius;

                const moonSize = Math.max(1.5, planetSize * 0.2); // Moons are ~1/5 size of planet

                // Check if this moon is selected
                const isMoonSelected =
                  this.selectedMoon && this.selectedMoon.name === moon.name;

                // Store clickable area for moon interaction
                moon._screenPos = {
                  x: moonX,
                  y: moonY,
                  radius: Math.max(moonSize * 2, 8), // Make clickable area a bit larger
                  worldX:
                    (moonX - width / 2) / this.camera.zoom +
                    this.camera.position.x,
                  worldY:
                    (moonY - height / 2) / this.camera.zoom +
                    this.camera.position.y,
                };

                // Draw selection ring for selected moon
                if (isMoonSelected) {
                  ctx.globalAlpha = fadeProgress;
                  ctx.strokeStyle = COLORS.selection;
                  ctx.lineWidth = 2;
                  ctx.beginPath();
                  ctx.arc(moonX, moonY, moonSize + 3, 0, Math.PI * 2);
                  ctx.stroke();
                }

                // Render the moon as a true 3D sphere (lit by its star) when
                // it's large enough; fall back to a flat dot otherwise.
                let moonDrew3D = false;
                if (
                  moonSize >= 3 &&
                  window.GalaxySim &&
                  window.GalaxySim.Renderer3D &&
                  window.GalaxySim.Renderer3D.available()
                ) {
                  ctx.globalAlpha = fadeProgress * 0.95;
                  const moonSeed = moon.name
                    .split("")
                    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
                  moonDrew3D = window.GalaxySim.Renderer3D.renderPlanet(
                    ctx, moonX, moonY, moonSize, moon, moonSeed, this.time,
                    { x: screen.x, y: screen.y }
                  );
                }
                if (!moonDrew3D) {
                  ctx.globalAlpha = fadeProgress * 0.9;
                  ctx.fillStyle = moon.color || "#cccccc";
                  ctx.beginPath();
                  ctx.arc(moonX, moonY, moonSize, 0, Math.PI * 2);
                  ctx.fill();
                }

                // Draw moon name if zoomed in very close or if selected
                if (
                  this.camera.zoom > PLANET_DETAIL_THRESHOLD * 0.5 ||
                  isMoonSelected
                ) {
                  ctx.font = "8px monospace";
                  ctx.fillStyle = isMoonSelected
                    ? COLORS.textHighlight
                    : COLORS.orbitLabel;
                  ctx.textAlign = "center";
                  ctx.globalAlpha = fadeProgress * 0.7;
                  const moonName = moon.name.split(" ").pop();
                  ctx.fillText(moonName, moonX, moonY - moonSize - 4);
                }
              });
            }
          } // End validation check for finite planetX, planetY, planetSize
        }
      });

      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
    }

    drawInfoPanel(ctx, width, height) {
      // Anchor to top-right of the internal resolution
      const r = {
        x: width - 320,
        y: height - 290,
        width: 300,
        height: 270,
      };
      const system = this.selectedStar;

      ctx.fillStyle = COLORS.uiBackground;
      ctx.fillRect(r.x, r.y, r.width, r.height);

      ctx.strokeStyle = COLORS.uiBorder;
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x, r.y, r.width, r.height);

      ctx.fillStyle = COLORS.uiBorder;
      ctx.fillRect(r.x, r.y, r.width, 3);

      let y = r.y + 20;

      ctx.font = "bold 20px monospace";
      // Gold for hardcoded systems
      ctx.fillStyle = system.hardcoded ? "#FFD700" : COLORS.textHighlight;
      ctx.textAlign = "left";
      ctx.fillText(system.name, r.x + 15, y);
      y += 35;

      ctx.strokeStyle = COLORS.uiBorder;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(r.x + 15, y);
      ctx.lineTo(r.x + r.width - 15, y);
      ctx.stroke();
      y += 15;

      ctx.font = "14px monospace";
      ctx.fillStyle = COLORS.text;

      const drawInfo = (label, value) => {
        ctx.fillStyle = COLORS.textDim;
        ctx.fillText(label, r.x + 15, y);
        ctx.fillStyle = COLORS.text;
        ctx.fillText(value, r.x + 180, y);
        y += 22;
      };

      drawInfo("Star Type:", `${system.type} Class`);
      drawInfo("Mass:", `${system.mass.toFixed(2)} M☉`);
      drawInfo("Radius:", `${system.radius.toFixed(2)} R☉`);
      drawInfo("Temperature:", `${Math.floor(system.temperature)} K`);

      const distance = Math.sqrt(
        system.position.x ** 2 + system.position.y ** 2 + system.position.z ** 2
      );
      drawInfo("Distance:", `${distance.toFixed(2)} ly`);

      y += 10;

      ctx.font = "bold 16px monospace";
      ctx.fillStyle = COLORS.textHighlight;
      //ctx.fillText('Planetary Bodies', r.x + 15, y);
      //y += 25;

      ctx.font = "13px monospace";
      if (system.planets && system.planets.length > 0) {
        ctx.fillText(system.planets.length + " planets detected", r.x + 30, y);

        /*
                system.planets.forEach((planet, i) => {
                    if (y > r.y + r.height - 60) return;
                    
                    ctx.fillStyle = planet.color;
                    ctx.beginPath();
                    ctx.arc(r.x + 20, y + 7, 4, 0, Math.PI * 2);
                    ctx.fill();
                    
                    ctx.fillStyle = COLORS.text;
                    const planetName = planet.name.length > 18 ? 
                        planet.name.substring(0, 15) + '...' : planet.name;
                    
                    // --- START MODIFICATION: Add moon count ---
                    const moonText = (planet.moons && planet.moons.length > 0) ? ` (${planet.moons.length}M)` : '';
                    ctx.fillText(planetName + moonText, r.x + 30, y);
                    // --- END MODIFICATION ---
                    
                    ctx.fillStyle = COLORS.textDim;
                    const typeText = planet.type.replace(/_/g, ' ');
                    ctx.fillText(typeText, r.x + 180, y);
                    
                    y += 20;
                });*/
      } else {
        ctx.fillStyle = COLORS.textDim;
        ctx.fillText("No planets detected", r.x + 30, y);
        y += 20;
      }

      // Add travel button
      const isMoving =
        $gameSystem.starMapData && $gameSystem.starMapData.isShipMoving();
      const currentSystem = $gameSystem.starMapData
        ? $gameSystem.starMapData.playerShip.currentSystem
        : "Sol";

      y = r.y + r.height - 100;

      // Only show Travel button if not at current system and not moving
      if (!isMoving && system.name !== currentSystem) {
        const travelButtonY = y + 40;
        this.travelButton = {
          x: r.x + 15,
          y: travelButtonY,
          width: r.width - 30,
          height: 35,
          systemName: system.name,
        };

        // Check if mouse is hovering over button (use the tracked pointer)
        const mx = this._pointer ? this._pointer.x : TouchInput.x;
        const my = this._pointer ? this._pointer.y : TouchInput.y;
        const isHovering =
          mx >= this.travelButton.x &&
          mx <= this.travelButton.x + this.travelButton.width &&
          my >= this.travelButton.y &&
          my <= this.travelButton.y + this.travelButton.height;

        // Draw button background
        ctx.fillStyle = isHovering
          ? "rgba(0, 200, 255, 0.3)"
          : "rgba(0, 150, 200, 0.2)";
        ctx.fillRect(
          this.travelButton.x,
          this.travelButton.y,
          this.travelButton.width,
          this.travelButton.height
        );

        ctx.strokeStyle = COLORS.uiBorder;
        ctx.lineWidth = 2;
        ctx.strokeRect(
          this.travelButton.x,
          this.travelButton.y,
          this.travelButton.width,
          this.travelButton.height
        );

        ctx.font = "bold 14px monospace";
        ctx.fillStyle = isHovering ? "#00ffff" : COLORS.textHighlight;
        ctx.textAlign = "center";
        ctx.fillText(
          "⯈ TRAVEL TO SYSTEM ⯈",
          this.travelButton.x + this.travelButton.width / 2,
          this.travelButton.y + 22
        );

        y += 45;
      } else {
        this.travelButton = null;
      }
    }

    drawPlanetDetailPanel(ctx, width, height) {
      // Anchor to top-right of the internal resolution
      const r = {
        x: width - 320,
        y: height - 290,
        width: 300,
        height: 270,
      };
      const planet = this.selectedPlanet;
      const system = this.selectedPlanetSystem;

      ctx.fillStyle = COLORS.uiBackground;
      ctx.fillRect(r.x, r.y, r.width, r.height);

      ctx.strokeStyle = COLORS.uiBorder;
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x, r.y, r.width, r.height);

      ctx.fillStyle = COLORS.uiBorder;
      ctx.fillRect(r.x, r.y, r.width, 3);

      let y = r.y + 20;

      ctx.font = "bold 20px monospace";
      ctx.fillStyle = COLORS.textHighlight;
      ctx.textAlign = "left";
      ctx.fillText(planet.name, r.x + 15, y);
      y += 35;

      // Rotating 3D preview of the planet in the panel's upper-right corner.
      if (
        window.GalaxySim &&
        window.GalaxySim.Renderer3D &&
        window.GalaxySim.Renderer3D.available()
      ) {
        const pvR = 34;
        const pvX = r.x + r.width - pvR - 14;
        const pvY = r.y + 30 + pvR;
        const seed = planet.name
          .split("")
          .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
        window.GalaxySim.Renderer3D.renderPlanet(
          ctx, pvX, pvY, pvR, planet, seed, this.time,
          { x: pvX - pvR * 2, y: pvY - pvR }
        );
        if (this.planetRenderer.hasAtmosphere(planet.type)) {
          this.planetRenderer.drawAtmosphereGlow(ctx, pvX, pvY, pvR, planet);
        }
      }

      ctx.strokeStyle = COLORS.uiBorder;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(r.x + 15, y);
      ctx.lineTo(r.x + r.width - 15, y);
      ctx.stroke();
      y += 15;

      ctx.font = "14px monospace";
      ctx.fillStyle = COLORS.text;

      const drawInfo = (label, value) => {
        ctx.fillStyle = COLORS.textDim;
        ctx.fillText(label, r.x + 15, y);
        ctx.fillStyle = COLORS.text;
        ctx.fillText(value, r.x + 160, y);
        y += 22;
      };

      // Display all keys present in planet data
      if (planet.type) {
        drawInfo("Type:", planet.type.replace(/_/g, " "));
      }
      if (planet.mass !== undefined) {
        drawInfo("Mass:", `${planet.mass.toFixed(3)} M⊕`);
      }
      if (planet.radius !== undefined) {
        drawInfo("Radius:", `${planet.radius.toFixed(3)} R⊕`);
      }
      if (planet.distance !== undefined) {
        drawInfo("Orbit:", `${planet.distance.toFixed(2)} AU`);
      }
      if (planet.orbitalPeriod !== undefined) {
        drawInfo("Period:", `${planet.orbitalPeriod.toFixed(2)} yr`);
      }
      if (planet.temperature !== undefined) {
        drawInfo("Temp:", `${Math.floor(planet.temperature)} K`);
      }
      if (planet.atmosphere) {
        drawInfo("Atmosphere:", planet.atmosphere);
      }
      if (planet.habitability !== undefined) {
        drawInfo("Habitability:", `${(planet.habitability * 100).toFixed(0)}%`);
      }

      // Show moons count if present
      if (planet.moons && planet.moons.length > 0) {
        y += 5;
        ctx.font = "13px monospace";
        ctx.fillStyle = COLORS.textHighlight;
        ctx.fillText(`${planet.moons.length} moon(s) orbiting`, r.x + 15, y);
        y += 20;
      }

      // Add travel button to planet
      const isMoving =
        $gameSystem.starMapData && $gameSystem.starMapData.isShipMoving();
      const currentPlanet = $gameSystem.starMapData
        ? $gameSystem.starMapData.playerShip.currentPlanet
        : null;

      y = r.y + r.height - 100;

      // Show Travel button if not at current planet and not moving
      if (!isMoving && planet.name !== currentPlanet) {
        const travelButtonY = y + 40;
        this.travelButton = {
          x: r.x + 15,
          y: travelButtonY,
          width: r.width - 30,
          height: 35,
          planetName: planet.name,
          systemName: system.name,
        };

        // Check if mouse is hovering over button (use the tracked pointer)
        const mx = this._pointer ? this._pointer.x : TouchInput.x;
        const my = this._pointer ? this._pointer.y : TouchInput.y;
        const isHovering =
          mx >= this.travelButton.x &&
          mx <= this.travelButton.x + this.travelButton.width &&
          my >= this.travelButton.y &&
          my <= this.travelButton.y + this.travelButton.height;

        // Draw button background
        ctx.fillStyle = isHovering
          ? "rgba(0, 200, 255, 0.3)"
          : "rgba(0, 150, 200, 0.2)";
        ctx.fillRect(
          this.travelButton.x,
          this.travelButton.y,
          this.travelButton.width,
          this.travelButton.height
        );

        ctx.strokeStyle = COLORS.uiBorder;
        ctx.lineWidth = 2;
        ctx.strokeRect(
          this.travelButton.x,
          this.travelButton.y,
          this.travelButton.width,
          this.travelButton.height
        );

        ctx.font = "bold 14px monospace";
        ctx.fillStyle = isHovering ? "#00ffff" : COLORS.textHighlight;
        ctx.textAlign = "center";
        ctx.fillText(
          "⯈ TRAVEL TO PLANET ⯈",
          this.travelButton.x + this.travelButton.width / 2,
          this.travelButton.y + 22
        );

        y += 45;
      } else {
        this.travelButton = null;
      }
    }

    drawControls(ctx, width, height) {
      // Anchor to bottom-left of the internal resolution
      const r = {
        x: 20,
        y: height - 200,
        width: 280,
        height: 180,
      };

      ctx.fillStyle = COLORS.uiBackground;
      ctx.fillRect(r.x, r.y, r.width, r.height);

      ctx.strokeStyle = COLORS.uiBorder;
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x, r.y, r.width, r.height);

      ctx.font = "bold 16px monospace";
      ctx.fillStyle = COLORS.textHighlight;
      ctx.textAlign = "left";
      ctx.fillText("Controls", r.x + 15, r.y + 20);

      ctx.font = "12px monospace";
      ctx.fillStyle = COLORS.text;
      let y = r.y + 45;

      // Updated controls text
      const keyQ = Input.keyMapper[81] || "Q";
      const keyE = Input.keyMapper[69] || "E";
      const keyZ = Input.keyMapper[90] || "Z";

      const controls = [
        "Click: Select star/planet/moon",
        "Drag: Pan camera",
        `Wheel/${keyQ}/${keyE}: Zoom`,
        "Arrows: Move camera",
        "Shift: Focus selected",
        "ESC: Back/Deselect",
      ];

      controls.forEach((text) => {
        ctx.fillText(text, r.x + 15, y);
        y += 18;
      });

      y = r.y + r.height - 25;
      ctx.fillStyle = COLORS.textDim;
      ctx.fillText(`Zoom: ${this.camera.zoom.toFixed(2)}x`, r.x + 15, y);
      ctx.fillText(`Systems: ${this.dataManager.systems.size}`, r.x + 160, y);
    }

    drawSpeedControls(ctx, width, height) {
      // Only show if ship is moving (and coords have been calculated)
      if (!this.stopEnginesButton) {
        return;
      }

      // Get data that was previously calculated
      const targetSystem = $gameSystem.starMapData
        ? $gameSystem.starMapData.getTargetSystem()
        : null;
      const currentSpeed = Math.floor($gameVariables.value(94)) || 1;
      const mx = this._pointer ? this._pointer.x : TouchInput.x;
      const my = this._pointer ? this._pointer.y : TouchInput.y;

      // Get pre-calculated coordinates
      const decreaseR = this.decreaseSpeedButton;
      const increaseR = this.increaseSpeedButton;
      const stopButtonR = this.stopEnginesButton;

      // Calculate speed info R based on the others (this is for drawing only)
      const speedInfoR = {
        x: increaseR.x + increaseR.width + 10,
        y: increaseR.y,
        width: stopButtonR.width - (decreaseR.width + increaseR.width + 10 * 2),
        height: decreaseR.height,
      };

      // Draw DECREASE SPEED button
      const isHoveringDecrease =
        mx >= decreaseR.x &&
        mx <= decreaseR.x + decreaseR.width &&
        my >= decreaseR.y &&
        my <= decreaseR.y + decreaseR.height;
      const canDecrease = Math.floor(currentSpeed) > 1;

      const decPal = canDecrease ? COLORS.info : COLORS.disabled;
      ctx.fillStyle = isHoveringDecrease ? decPal.bgHover : decPal.bgIdle;
      ctx.fillRect(decreaseR.x, decreaseR.y, decreaseR.width, decreaseR.height);

      ctx.strokeStyle = decPal.border;
      ctx.lineWidth = 2;
      ctx.strokeRect(
        decreaseR.x,
        decreaseR.y,
        decreaseR.width,
        decreaseR.height
      );

      ctx.font = "bold 20px monospace";
      ctx.fillStyle = isHoveringDecrease && canDecrease ? decPal.textHover : decPal.text;
      ctx.textAlign = "center";
      ctx.fillText("−", decreaseR.x + decreaseR.width / 2, decreaseR.y + 22);
      ctx.font = "10px monospace";
      ctx.fillText(
        "SLOWER",
        decreaseR.x + decreaseR.width / 2,
        decreaseR.y + 38
      );

      // Draw INCREASE SPEED button
      const isHoveringIncrease =
        mx >= increaseR.x &&
        mx <= increaseR.x + increaseR.width &&
        my >= increaseR.y &&
        my <= increaseR.y + increaseR.height;
      const canIncrease = Math.floor(currentSpeed) < 99;

      const incPal = canIncrease ? COLORS.warning : COLORS.disabled;
      ctx.fillStyle = isHoveringIncrease ? incPal.bgHover : incPal.bgIdle;
      ctx.fillRect(increaseR.x, increaseR.y, increaseR.width, increaseR.height);

      ctx.strokeStyle = incPal.border;
      ctx.lineWidth = 2;
      ctx.strokeRect(
        increaseR.x,
        increaseR.y,
        increaseR.width,
        increaseR.height
      );

      ctx.font = "bold 20px monospace";
      ctx.fillStyle = isHoveringIncrease && canIncrease ? incPal.textHover : incPal.text;
      ctx.textAlign = "center";
      ctx.fillText("+", increaseR.x + increaseR.width / 2, increaseR.y + 22);
      ctx.font = "10px monospace";
      ctx.fillText(
        "FASTER",
        increaseR.x + increaseR.width / 2,
        increaseR.y + 38
      );

      // Draw speed info display
      ctx.fillStyle = COLORS.uiBackground;
      ctx.fillRect(
        speedInfoR.x,
        speedInfoR.y,
        speedInfoR.width,
        speedInfoR.height
      );

      ctx.strokeStyle = COLORS.uiBorder;
      ctx.lineWidth = 2;
      ctx.strokeRect(
        speedInfoR.x,
        speedInfoR.y,
        speedInfoR.width,
        speedInfoR.height
      );

      ctx.font = "bold 16px monospace";
      ctx.fillStyle = COLORS.textHighlight;
      ctx.textAlign = "center";
      ctx.fillText(
        `${Math.floor(currentSpeed)}x`,
        speedInfoR.x + speedInfoR.width / 2,
        speedInfoR.y + 18
      );

      // Calculate and show fuel consumption rate (quadratic increase)
      const fuelRate = (currentSpeed * currentSpeed * 0.01).toFixed(3);
      ctx.font = "9px monospace";
      ctx.fillStyle = COLORS.textDim;
      ctx.fillText(
        `${fuelRate} fuel/s`,
        speedInfoR.x + speedInfoR.width / 2,
        speedInfoR.y + 36
      );

      // Draw STOP ENGINES button
      const isHoveringStop =
        mx >= stopButtonR.x &&
        mx <= stopButtonR.x + stopButtonR.width &&
        my >= stopButtonR.y &&
        my <= stopButtonR.y + stopButtonR.height;

      ctx.fillStyle = isHoveringStop ? COLORS.danger.bgHover : COLORS.danger.bgIdle;
      ctx.fillRect(
        stopButtonR.x,
        stopButtonR.y,
        stopButtonR.width,
        stopButtonR.height
      );

      ctx.strokeStyle = COLORS.danger.border;
      ctx.lineWidth = 2;
      ctx.strokeRect(
        stopButtonR.x,
        stopButtonR.y,
        stopButtonR.width,
        stopButtonR.height
      );

      ctx.font = "bold 16px monospace";
      ctx.fillStyle = isHoveringStop ? COLORS.danger.textHover : COLORS.danger.text;
      ctx.textAlign = "center";
      ctx.fillText(
        "STOP ENGINES ",
        stopButtonR.x + stopButtonR.width / 2,
        stopButtonR.y + 20
      );

      // Show current travel info
      if (targetSystem) {
        ctx.font = "11px monospace";
        ctx.fillStyle = COLORS.textDim;
        ctx.fillText(
          `→ ${targetSystem}`,
          stopButtonR.x + stopButtonR.width / 2,
          stopButtonR.y + 38
        );
      }
    }

    drawLandButton(ctx, width, height) {
      // Only show if button is active (ship is orbiting a planet)
      if (!this.landToPlanetButton) {
        return;
      }

      const mx = this._pointer ? this._pointer.x : TouchInput.x;
      const my = this._pointer ? this._pointer.y : TouchInput.y;
      const landButtonR = this.landToPlanetButton;

      // Check if hovering
      const isHovering =
        mx >= landButtonR.x &&
        mx <= landButtonR.x + landButtonR.width &&
        my >= landButtonR.y &&
        my <= landButtonR.y + landButtonR.height;

      // Draw button background
      ctx.fillStyle = isHovering ? COLORS.success.bgHover : COLORS.success.bgIdle;
      ctx.fillRect(
        landButtonR.x,
        landButtonR.y,
        landButtonR.width,
        landButtonR.height
      );

      // Draw button border
      ctx.strokeStyle = COLORS.success.border;
      ctx.lineWidth = 2;
      ctx.strokeRect(
        landButtonR.x,
        landButtonR.y,
        landButtonR.width,
        landButtonR.height
      );

      // Draw button text
      ctx.font = "bold 16px monospace";
      ctx.fillStyle = isHovering ? COLORS.success.textHover : COLORS.success.text;
      ctx.textAlign = "center";
      ctx.fillText(
        "LAND TO PLANET ",
        landButtonR.x + landButtonR.width / 2,
        landButtonR.y + 20
      );

      // Show planet name
      const planetName = $gameSystem.starMapData?.playerShip?.currentPlanet || "";
      if (planetName) {
        ctx.font = "11px monospace";
        ctx.fillStyle = COLORS.textDim;
        ctx.fillText(
          `Landing on ${planetName}`,
          landButtonR.x + landButtonR.width / 2,
          landButtonR.y + 38
        );
      }
    }

    landOnPlanet() {
      console.log("[LandOnPlanet] Button clicked!");

      // Get current planet information
      const planetName = $gameSystem.starMapData?.playerShip?.currentPlanet;
      console.log("[LandOnPlanet] Planet name:", planetName);
      if (!planetName) {
        console.warn("[LandOnPlanet] No planet name found");
        SoundManager.playBuzzer();
        return;
      }

      // Find the planet object to get its type
      const currentSystemName = $gameSystem.starMapData?.playerShip?.currentSystem;
      console.log("[LandOnPlanet] Current system:", currentSystemName);
      if (!currentSystemName) {
        console.warn("[LandOnPlanet] No current system found");
        SoundManager.playBuzzer();
        return;
      }

      // Get system from dataManager, not from SYSTEMS constant
      const system = $gameSystem.starMapData.getSystem(currentSystemName);
      console.log("[LandOnPlanet] System object:", system);
      if (!system || !system.planets || system.planets.length === 0) {
        console.warn("[LandOnPlanet] System not found or has no planets");
        SoundManager.playBuzzer();
        return;
      }

      const planet = system.planets.find(p => p.name === planetName);
      console.log("[LandOnPlanet] Planet object:", planet);
      if (!planet || !planet.type) {
        console.warn("[LandOnPlanet] Planet not found or has no type");
        SoundManager.playBuzzer();
        return;
      }

      // Get the biome name from PLANET_TYPES
      const planetType = PLANET_TYPES[planet.type];
      console.log("[LandOnPlanet] Planet type data:", planetType);
      if (!planetType || !planetType.biome) {
        console.warn(`[LandOnPlanet] Planet type ${planet.type} has no biome defined, using Ice`);
        if (planetType) {
          planetType.biome = "Ice";
        }
      }

      const biomeName = planetType?.biome || "Ice";
      console.log("[LandOnPlanet] Biome name:", biomeName);

      // Save current map ID and coordinates to variables 141, 142, 143
      // For galaxy sim, we save a special marker to indicate we came from galaxy sim
      $gameVariables.setValue(141, -1); // Special marker for galaxy sim
      $gameVariables.setValue(142, 0);
      $gameVariables.setValue(143, 0);

      // Use a special set of world coordinates for planet landings (100000, 100000)
      // This ensures it doesn't conflict with normal world map coordinates
      const planetWorldX = 100000;
      const planetWorldY = 100000;

      // Set these coordinates for the procedural generation
      $gameVariables.setValue(43, planetWorldX);
      $gameVariables.setValue(44, planetWorldY);

      // Set up hardcoded override for this specific planet landing location
      if (!window.WorldGen) {
        window.WorldGen = {};
      }
      if (!window.WorldGen.HardcodedBiomeOverrides) {
        window.WorldGen.HardcodedBiomeOverrides = {};
      }

      // Add override for the planet landing coordinates
      const coordKey = `${planetWorldX},${planetWorldY}`;
      window.WorldGen.HardcodedBiomeOverrides[coordKey] = {
        biome: biomeName
      };

      console.log("[LandOnPlanet] Generating procedural map with biome:", biomeName);

      // Generate the procedural map with the planet's biome
      const mapGenerated = $gameSystem.generateProceduralMap();
      console.log("[LandOnPlanet] Map generation result:", mapGenerated);

      if (mapGenerated) {
        const PROC_MAP_ID = 636;
        const PROC_MAP_WIDTH = 64;
        const PROC_MAP_HEIGHT = 64;

        const startX = Math.floor(PROC_MAP_WIDTH / 2);
        const startY = Math.floor(PROC_MAP_HEIGHT / 2);

        console.log("[LandOnPlanet] Transferring to map", PROC_MAP_ID, "at", startX, startY);

        // Play confirmation sound
        SoundManager.playOk();

        // Close the galaxy sim scene and transfer to the procedural map
        SceneManager.pop(); // Exit galaxy sim scene

        // Transfer to the generated planet surface
        $gamePlayer.reserveTransfer(
          PROC_MAP_ID,
          startX,
          startY,
          2, // Face down
          0  // No fade
        );

        console.log("[LandOnPlanet] Transfer completed!");
      } else {
        console.error("[LandOnPlanet] Map generation failed!");
        SoundManager.playBuzzer();
      }
    }

    drawTooltip(ctx, width, height) {
      const system = this.hoveredStar;
      // Use lastMousePos which is from processInput (TouchInput.x/y)
      const mousePos = this.lastMousePos;

      ctx.font = "13px monospace";
      const text = `${system.name} (${system.type})`;
      const metrics = ctx.measureText(text);
      const padding = 8;
      const panelWidth = metrics.width + padding * 2;
      const panelHeight = 24;

      // Position relative to the internal resolution mouse cursor
      let x = mousePos.x + 15;
      let y = mousePos.y - panelHeight - 10;

      if (x + panelWidth > width) x = mousePos.x - panelWidth - 15;
      if (y < 0) y = mousePos.y + 15;

      ctx.fillStyle = COLORS.uiBackground;
      ctx.fillRect(x, y, panelWidth, panelHeight);

      ctx.strokeStyle = COLORS.uiBorder;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, panelWidth, panelHeight);

      ctx.fillStyle = COLORS.text;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(text, x + padding, y + panelHeight / 2);
    }

    drawPlanetTooltip(ctx, width, height) {
      const planet = this.hoveredPlanet;
      // Use lastMousePos which is from processInput (TouchInput.x/y)
      const mousePos = this.lastMousePos;

      ctx.font = "13px monospace";
      const planetType = planet.type.replace(/_/g, " ");
      const text = `${planet.name} (${planetType})`;
      const metrics = ctx.measureText(text);
      const padding = 8;
      const panelWidth = metrics.width + padding * 2;
      const panelHeight = 24;

      // Position relative to the internal resolution mouse cursor
      let x = mousePos.x + 15;
      let y = mousePos.y - panelHeight - 10;

      if (x + panelWidth > width) x = mousePos.x - panelWidth - 15;
      if (y < 0) y = mousePos.y + 15;

      ctx.fillStyle = COLORS.uiBackground;
      ctx.fillRect(x, y, panelWidth, panelHeight);

      ctx.strokeStyle = COLORS.uiBorder;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, panelWidth, panelHeight);

      ctx.fillStyle = COLORS.text;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(text, x + padding, y + panelHeight / 2);
    }

    drawMoonTooltip(ctx, width, height) {
      const moon = this.hoveredMoon;
      // Use lastMousePos which is from processInput (TouchInput.x/y)
      const mousePos = this.lastMousePos;

      ctx.font = "13px monospace";
      const text = `${moon.name} (moon)`;
      const metrics = ctx.measureText(text);
      const padding = 8;
      const panelWidth = metrics.width + padding * 2;
      const panelHeight = 24;

      // Position relative to the internal resolution mouse cursor
      let x = mousePos.x + 15;
      let y = mousePos.y - panelHeight - 10;

      if (x + panelWidth > width) x = mousePos.x - panelWidth - 15;
      if (y < 0) y = mousePos.y + 15;

      ctx.fillStyle = COLORS.uiBackground;
      ctx.fillRect(x, y, panelWidth, panelHeight);

      ctx.strokeStyle = COLORS.uiBorder;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, panelWidth, panelHeight);

      ctx.fillStyle = COLORS.text;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(text, x + padding, y + panelHeight / 2);
    }

    hexToRgb(hex) {
      if (!hex) return { r: 255, g: 255, b: 255 };
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result
        ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
        : { r: 255, g: 255, b: 255 };
    }

    terminate() {
      super.terminate();
      // this.removeInput(); // REMOVED - No longer needed

      // Restore overflow
      document.body.style.overflow = "";

      if (this.canvas && this._onPointerMove) {
        this.canvas.removeEventListener("mousemove", this._onPointerMove);
        this.canvas.removeEventListener("mousedown", this._onPointerMove);
        this.canvas.removeEventListener("mouseup", this._onPointerMove);
      }

      if (this.canvas && this.canvas.parentNode) {
        this.canvas.parentNode.removeChild(this.canvas);
      }
    }
  }

  // ============================================================================
  // Export to global scope
  // ============================================================================

  window.Scene_AdvancedStarMap = Scene_AdvancedStarMap;

})();
