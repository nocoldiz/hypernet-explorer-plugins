/*:
 * @target MZ
 * @plugindesc (v2.0) HTML/SVG night sky star chart with constellations, a decorative RA/Dec grid and a field of background stars.
 * @author Omni-Lex
 * @help
 * GalaxySimSkyViewer.js
 * (Version 2.0)
 *
 * A draggable, zoomable star chart overlay drawn entirely in HTML/SVG (no
 * PIXI). Stars are sized by magnitude and glow softly; zodiac constellations
 * are traced in gold with a faint zodiac marker beside their name; a
 * decorative ring-and-spoke grid and a soft Milky Way band give it the look
 * of a real planisphere.
 *
 * Controls:
 * - Mouse Drag / WASD / Arrow Keys: Pan the chart
 * - Mouse Wheel / Q / E: Zoom in/out (wheel zooms on the cursor, keys zoom on
 *   the screen center)
 * - OK / Confirm: Recenter and fit the whole sky on screen
 * - TAB: Switch between constellation sets
 * - European / Chinese / Center tabs: same actions, by mouse
 * - Cancel/Back/ESC: Exit star map
 *
 * @command openStarMap
 * @text Open Star Map
 * @desc Opens the draggable night sky display.
 *
 * @arg telescopeView
 * @text Telescope View
 * @desc Show a circular "telescope" overlay.
 * @type boolean
 * @default false
 *
 *
 * @param skyScrollSpeed
 * @text WASD Scroll Speed
 * @desc The speed the sky moves when using WASD keys (screen pixels/frame).
 * @type number
 * @default 5
 *
 * @param starSize
 * @text Star Size
 * @desc The base radius of the dimmest constellation stars, in world units.
 * @type number
 * @default 2
 *
 * @param starColor
 * @text Star Color
 * @desc The hex color for non-zodiac stars (e.g., 0xFFFFFF for white).
 * @type string
 * @default 0xFFFFFF
 *
 * @param lineThickness
 * @text Line Thickness
 * @desc The thickness of the constellation lines, in world units.
 * @type number
 * @default 1
 *
 * @param lineColor
 * @text Line Color
 * @desc The hex color for constellation lines (e.g., 0x8888FF).
 * @type string
 * @default 0x8888FF
 *
 * @param hoverRadius
 * @text Hover Radius
 * @desc The on-screen pixel radius around a constellation's center to detect for hover.
 * @type number
 * @default 25
 *
 * @param starNameZoomThreshold
 * @text Star Name Zoom Threshold
 * @desc The zoom level (e.g., 2.0) required to show individual star names.
 * @type number
 * @default 2.0
 */

(() => {
    const pluginName = "GalaxySimSkyViewer";
    const params = PluginManager.parameters(pluginName);

    const SKY_SCROLL_SPEED = Number(params.skyScrollSpeed) || 5;
    const STAR_SIZE = Number(params.starSize) || 2;
    const STAR_COLOR = parseInt(params.starColor) || 0xFFFFFF;
    const LINE_THICKNESS = Number(params.lineThickness) || 1;
    const LINE_COLOR = parseInt(params.lineColor) || 0x8888FF;
    const ZODIAC_LINE_COLOR = 0xFFD700; // Gold, for zodiac constellations
    const HOVER_RADIUS = Number(params.hoverRadius) || 25;
    const STAR_NAME_ZOOM_THRESHOLD = Number(params.starNameZoomThreshold) || 2.0;
    const MIN_ZOOM = 0.3;
    const MAX_ZOOM = 5.0;
    const DEFAULT_ZOOM = 1;
    const FIELD_STAR_COUNT = 220;
    const GRID_RINGS = 6;
    const GRID_SPOKES = 24;
    const GRID_MARGIN = 160;
    const FIT_MARGIN = 180;
    // Screen-space (not world-space) sizes: label groups are counter-scaled
    // against the camera zoom (see _updateLabelScale), so these are the
    // actual on-screen pixel sizes at every zoom level, not just at zoom 1.
    const CONST_LABEL_UNITS = 15; // constellation name font size
    const STAR_LABEL_UNITS = 11; // proper star name font size
    const STAR_LABEL_OFFSET = 13; // fixed screen-pixel gap above a named star
    const WESTERN_CONSTELLATIONS = window.GalaxySim?.WesternConstellations || {};
    const CHINESE_CONSTELLATIONS = window.GalaxySim?.ChineseConstellations || {};

    const hexColor = (n) => "#" + (n & 0xFFFFFF).toString(16).padStart(6, "0");
    const STAR_COLOR_CSS = hexColor(STAR_COLOR);
    const LINE_COLOR_CSS = hexColor(LINE_COLOR);
    const ZODIAC_COLOR_CSS = hexColor(ZODIAC_LINE_COLOR);

    const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    const labelFor = (c) => (c.name_int ? T(c.name_int) : c.name);

    // Brighter (lower magnitude) stars draw larger and with a wider glow halo.
    // The dataset runs roughly -1.5 (Sirius-bright) to 6.1 (naked-eye limit).
    function starRadius(mag) {
        const m = typeof mag === "number" ? mag : 4;
        const t = clamp((6.3 - m) / 7.8, 0, 1);
        return STAR_SIZE * (0.55 + t * 1.9);
    }

    // --- Static SVG fragment builders -----------------------------------

    function buildFieldStars(count) {
        let s = "";
        for (let i = 0; i < count; i++) {
            const x = Math.random() * 100;
            const y = Math.random() * 100;
            const r = 0.6 + Math.random() * 1.4;
            const op = (0.25 + Math.random() * 0.6).toFixed(2);
            const dur = (2.6 + Math.random() * 3.4).toFixed(2);
            const delay = (Math.random() * 4).toFixed(2);
            s += `<circle class="gsv-field-star" cx="${x.toFixed(2)}%" cy="${y.toFixed(2)}%" r="${r.toFixed(2)}" ` +
                `style="--gsv-op:${op}; animation-duration:${dur}s; animation-delay:${delay}s"/>`;
        }
        return s;
    }

    // A decorative ring-and-spoke chart grid, centered on the current
    // constellation set's own bounding box. Purely cosmetic (the data has no
    // real celestial coordinates), so it carries no numeric labels.
    function buildGrid(bounds) {
        const cx = bounds.cx, cy = bounds.cy;
        const maxR = Math.hypot(bounds.w, bounds.h) / 2 + GRID_MARGIN;
        let s = "";
        for (let i = 1; i <= GRID_RINGS; i++) {
            const r = (maxR * i) / GRID_RINGS;
            s += `<circle class="gsv-grid-ring" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}"/>`;
        }
        for (let i = 0; i < GRID_SPOKES; i++) {
            const a = (i / GRID_SPOKES) * Math.PI * 2;
            const major = i % (GRID_SPOKES / 4) === 0;
            const x2 = cx + Math.cos(a) * maxR;
            const y2 = cy + Math.sin(a) * maxR;
            s += `<line class="gsv-grid-spoke${major ? " gsv-grid-spoke-major" : ""}" ` +
                `x1="${cx.toFixed(1)}" y1="${cy.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
        }
        return s;
    }

    function buildConstEntry(id, c) {
        const zodiac = !!c.zodiac;
        let lines = "";
        for (const pair of c.lines) {
            const a = c.stars[pair[0]], b = c.stars[pair[1]];
            if (!a || !b) continue;
            lines += `<line class="gsv-line${zodiac ? " gsv-line-zodiac" : ""}" ` +
                `x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
        }
        let stars = "";
        for (const star of c.stars) {
            const r = starRadius(star.magnitude);
            const halo = r * 2.4;
            const zc = zodiac ? " gsv-star-zodiac" : "";
            stars += `<circle class="gsv-star-halo${zc}" cx="${star.x}" cy="${star.y}" r="${halo.toFixed(2)}"/>` +
                `<circle class="gsv-star-core${zc}" cx="${star.x}" cy="${star.y}" r="${r.toFixed(2)}"/>`;
        }
        return `<g class="gsv-const" data-id="${esc(id)}">` +
            `<g class="gsv-const-lines">${lines}</g>` +
            `<g class="gsv-const-stars">${stars}</g>` +
            `</g>`;
    }

    // Position via data-cx/data-cy rather than a static transform: the group's
    // actual transform (translate + a counter-scale against zoom) is written
    // by _updateLabelScale, which is what keeps this text a constant on-screen
    // size instead of ballooning as the chart is zoomed in.
    function buildConstLabel(c) {
        const zodiac = !!c.zodiac;
        const mark = zodiac ? `<rect class="gsv-zodiac-mark" x="-3" y="-3" width="6" height="6"></rect>` : "";
        return `<g class="gsv-const-label${zodiac ? " gsv-const-label-zodiac" : ""}" ` +
            `data-cx="${c.center.x}" data-cy="${c.center.y}">${mark}` +
            `<text x="0" y="20">${esc(labelFor(c))}</text></g>`;
    }

    function buildStarLabels(c) {
        let s = "";
        for (const star of c.stars) {
            if (!star.name) continue;
            s += `<g class="gsv-star-label-anchor" data-cx="${star.x}" data-cy="${star.y}">` +
                `<text class="gsv-star-label" x="0" y="${-STAR_LABEL_OFFSET}">${esc(star.name)}</text></g>`;
        }
        return s;
    }

    // --- Overlay class ------------------------------------------------------

    class StarMapOverlay {
        constructor(isTelescope = false) {
            this._isTelescope = isTelescope;
            this._view = "western";
            this._currentSet = WESTERN_CONSTELLATIONS;
            this._zoom = DEFAULT_ZOOM;
            this._effectiveMinZoom = MIN_ZOOM;
            this._camX = 0;
            this._camY = 0;
            this._dragging = false;
            this._hoveredId = null;
            this._boundsCache = new WeakMap();
            this._constEls = new Map();
            this._mouseX = window.innerWidth / 2;
            this._mouseY = window.innerHeight / 2;
            // Where the constellation readout is aimed. "pointer" follows the
            // mouse; "crosshair" reads whatever the middle of the screen is
            // pointed at, which is the only thing a pad or the arrow keys can
            // aim -- they pan the sky under a fixed point rather than moving a
            // cursor over it. Starts on the crosshair so the readout works
            // before the mouse has ever been touched.
            this._aimMode = "crosshair";
            this._pointerDirty = true;
            this._cameraDirty = true;
            this._labelZoom = null;

            this._buildDom();
            this._switchTo("western");
        }

        _buildDom() {
            const stray = document.getElementById("gsv-root");
            if (stray) stray.remove();

            const root = document.createElement("div");
            root.id = "gsv-root";
            // Star, line and zodiac colours are plugin parameters and the two
            // label sizes are screen-space constants the layout also reads, so
            // css/theme.css (#gsv-root) takes them from here rather than
            // restating them. Everything else about the sky is in that sheet.
            root.style.setProperty("--gsv-star-color", STAR_COLOR_CSS);
            root.style.setProperty("--gsv-line-color", LINE_COLOR_CSS);
            root.style.setProperty("--gsv-zodiac-color", ZODIAC_COLOR_CSS);
            root.style.setProperty("--gsv-line-thickness", String(LINE_THICKNESS));
            root.style.setProperty("--gsv-const-label-size", CONST_LABEL_UNITS + "px");
            root.style.setProperty("--gsv-const-label-stroke", Math.max(2, CONST_LABEL_UNITS * 0.14) + "px");
            root.style.setProperty("--gsv-star-label-size", STAR_LABEL_UNITS + "px");
            root.style.setProperty("--gsv-star-label-stroke", Math.max(2, STAR_LABEL_UNITS * 0.16) + "px");
            root.innerHTML = `
<svg class="gsv-svg">
  <defs>
    <radialGradient id="gsv-bg" cx="50%" cy="42%" r="75%">
      <stop offset="0%" stop-color="#0b1020"/>
      <stop offset="55%" stop-color="#060810"/>
      <stop offset="100%" stop-color="#020204"/>
    </radialGradient>
    <radialGradient id="gsv-milkyway" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#cdd8ff" stop-opacity="0.16"/>
      <stop offset="55%" stop-color="#9fb3e8" stop-opacity="0.07"/>
      <stop offset="100%" stop-color="#9fb3e8" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="gsv-star-halo" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.95"/>
      <stop offset="35%" stop-color="#dce8ff" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#dce8ff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="gsv-star-halo-gold" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fff3c4" stop-opacity="0.95"/>
      <stop offset="35%" stop-color="#ffd257" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#ffd257" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="gsv-vignette" cx="50%" cy="50%" r="72%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="78%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.85"/>
    </radialGradient>
  </defs>
  <rect class="gsv-bgrect" width="100%" height="100%"></rect>
  <ellipse class="gsv-milkyway" cx="55%" cy="42%" rx="72%" ry="24%" transform="rotate(-24 55 42)"></ellipse>
  <g class="gsv-field-stars">${buildFieldStars(FIELD_STAR_COUNT)}</g>
  <g class="gsv-camera"></g>
  <rect class="gsv-vignette-rect" width="100%" height="100%"></rect>
</svg>
<div class="gsv-topbar">
  <div class="gsv-tabs">
    <div class="gsv-tab" id="gsv-btn-western">${T('Galaxy.sky.european')}</div>
    <div class="gsv-tab" id="gsv-btn-chinese">${T('Galaxy.sky.chinese')}</div>
    <div class="gsv-tab" id="gsv-btn-center">${T('Galaxy.sky.center')}</div>
  </div>
  <div class="gsv-legend" id="gsv-legend"><span class="gsv-legend-swatch"></span>${T('Galaxy.sky.zodiac')}</div>
</div>
<div class="gsv-crosshair" id="gsv-crosshair"></div>
<div class="gsv-bottombar">
  <div class="gsv-hover-name" id="gsv-hover-name"></div>
</div>
${this._isTelescope ? '<div class="gsv-scope"></div>' : ""}
`;
            document.body.appendChild(root);

            this._root = root;
            this._svgEl = root.querySelector(".gsv-svg");
            this._cameraEl = root.querySelector(".gsv-camera");
            this._hoverNameEl = root.querySelector("#gsv-hover-name");
            this._crosshairEl = root.querySelector("#gsv-crosshair");
            this._legendEl = root.querySelector("#gsv-legend");
            this._btnWestern = root.querySelector("#gsv-btn-western");
            this._btnChinese = root.querySelector("#gsv-btn-chinese");
            this._btnCenter = root.querySelector("#gsv-btn-center");

            this._btnWestern.addEventListener("click", () => this._switchTo("western"));
            this._btnChinese.addEventListener("click", () => this._switchTo("chinese"));
            this._btnCenter.addEventListener("click", () => this._fitToScreen());

            this._onMouseDown = (e) => {
                if (e.button !== 0) return;
                this._dragging = true;
                this._dragStartX = e.clientX;
                this._dragStartY = e.clientY;
                this._dragCamX = this._camX;
                this._dragCamY = this._camY;
            };
            this._svgEl.addEventListener("mousedown", this._onMouseDown);

            this._onWindowMouseMove = (e) => {
                this._mouseX = e.clientX;
                this._mouseY = e.clientY;
                this._aimMode = "pointer";
                this._pointerDirty = true;
                if (this._dragging) {
                    this._camX = this._dragCamX + (e.clientX - this._dragStartX);
                    this._camY = this._dragCamY + (e.clientY - this._dragStartY);
                    this._cameraDirty = true;
                }
            };
            window.addEventListener("mousemove", this._onWindowMouseMove);

            this._onWindowMouseUp = () => { this._dragging = false; };
            window.addEventListener("mouseup", this._onWindowMouseUp);

            this._onWheel = (e) => {
                e.preventDefault();
                const factor = e.deltaY < 0 ? 1.12 : 0.89;
                this._zoomAt(factor, e.clientX, e.clientY);
            };
            this._svgEl.addEventListener("wheel", this._onWheel, { passive: false });

            // The overlay sits above the game canvas, so TouchInput never sees
            // the right button here and the browser would answer with its own
            // context menu instead. Right click is the one way out a mouse
            // player reaches for, so the overlay closes on it itself.
            this._onContextMenu = (e) => {
                e.preventDefault();
                this.close();
            };
            root.addEventListener("contextmenu", this._onContextMenu);
        }

        // --- Data / layout ---------------------------------------------

        _boundsFor(set) {
            if (this._boundsCache.has(set)) return this._boundsCache.get(set);
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const id in set) {
                for (const star of set[id].stars) {
                    if (star.x < minX) minX = star.x;
                    if (star.x > maxX) maxX = star.x;
                    if (star.y < minY) minY = star.y;
                    if (star.y > maxY) maxY = star.y;
                }
            }
            if (!isFinite(minX)) { minX = minY = 0; maxX = maxY = 1; }
            const bounds = {
                minX, minY, maxX, maxY,
                w: maxX - minX, h: maxY - minY,
                cx: (minX + maxX) / 2, cy: (minY + maxY) / 2
            };
            this._boundsCache.set(set, bounds);
            return bounds;
        }

        _switchTo(view) {
            this._view = view;
            this._currentSet = view === "western" ? WESTERN_CONSTELLATIONS : CHINESE_CONSTELLATIONS;
            this._hoveredId = null;
            this._renderSky();
            this._fitToScreen();
            this._btnWestern.classList.toggle("gsv-active", view === "western");
            this._btnChinese.classList.toggle("gsv-active", view === "chinese");
            const hasZodiac = Object.keys(this._currentSet).some((id) => this._currentSet[id].zodiac);
            this._legendEl.style.display = hasZodiac ? "" : "none";
        }

        _renderSky() {
            const set = this._currentSet;
            const bounds = this._boundsFor(set);
            let consts = "", constLabels = "", starLabels = "";
            for (const id in set) {
                const c = set[id];
                consts += buildConstEntry(id, c);
                constLabels += buildConstLabel(c);
                starLabels += buildStarLabels(c);
            }
            this._cameraEl.innerHTML =
                `<g class="gsv-grid">${buildGrid(bounds)}</g>` +
                `<g class="gsv-consts">${consts}</g>` +
                `<g class="gsv-const-labels">${constLabels}</g>` +
                `<g class="gsv-star-labels">${starLabels}</g>`;

            this._constsGroup = this._cameraEl.querySelector(".gsv-consts");
            this._starLabelsGroup = this._cameraEl.querySelector(".gsv-star-labels");
            this._constEls = new Map();
            for (const g of this._constsGroup.children) {
                this._constEls.set(g.getAttribute("data-id"), g);
            }
            this._scaledLabelEls = [
                ...this._cameraEl.querySelectorAll(".gsv-const-label"),
                ...this._cameraEl.querySelectorAll(".gsv-star-label-anchor")
            ];
            this._labelZoom = null; // force a rescale against the new elements
            this._updateLabelVisibility();
        }

        // Constellation and star name labels are counter-scaled against the
        // camera zoom so their on-screen size stays constant instead of
        // growing with it; only their position rides the camera transform.
        _updateLabelScale() {
            const inv = (1 / this._zoom).toFixed(4);
            for (const el of this._scaledLabelEls) {
                el.setAttribute("transform", `translate(${el.dataset.cx} ${el.dataset.cy}) scale(${inv})`);
            }
        }

        _updateLabelVisibility() {
            if (this._starLabelsGroup) {
                this._starLabelsGroup.classList.toggle("gsv-hidden", this._zoom <= STAR_NAME_ZOOM_THRESHOLD);
            }
        }

        // --- Camera -------------------------------------------------------

        _fitToScreen() {
            const bounds = this._boundsFor(this._currentSet);
            const vw = window.innerWidth, vh = window.innerHeight;
            const fitZoom = Math.min(
                vw / (bounds.w + FIT_MARGIN * 2),
                vh / (bounds.h + FIT_MARGIN * 2)
            );
            const zoom = clamp(fitZoom, 0.05, MAX_ZOOM);
            this._effectiveMinZoom = Math.min(MIN_ZOOM, zoom * 0.82);
            this._zoom = zoom;
            this._camX = vw / 2 - bounds.cx * zoom;
            this._camY = vh / 2 - bounds.cy * zoom;
            this._cameraDirty = true;
            this._updateLabelVisibility();
        }

        _zoomAt(factor, screenX, screenY) {
            const oldZoom = this._zoom;
            const newZoom = clamp(oldZoom * factor, this._effectiveMinZoom, MAX_ZOOM);
            if (newZoom === oldZoom) return;
            const worldX = (screenX - this._camX) / oldZoom;
            const worldY = (screenY - this._camY) / oldZoom;
            this._zoom = newZoom;
            this._camX = screenX - worldX * newZoom;
            this._camY = screenY - worldY * newZoom;
            this._cameraDirty = true;
            this._updateLabelVisibility();
        }

        _applyTransform() {
            this._cameraEl.setAttribute(
                "transform",
                `translate(${this._camX.toFixed(2)} ${this._camY.toFixed(2)}) scale(${this._zoom.toFixed(4)})`
            );
            if (this._labelZoom !== this._zoom) {
                this._labelZoom = this._zoom;
                this._updateLabelScale();
            }
        }

        // --- Hover ----------------------------------------------------------

        _updateHover(screenX, screenY) {
            const zoom = this._zoom;
            const worldX = (screenX - this._camX) / zoom;
            const worldY = (screenY - this._camY) / zoom;
            // Kept in on-screen pixels (divided back into world space here) so the
            // hover tolerance feels the same at any zoom level.
            let bestDistSq = (HOVER_RADIUS / zoom) ** 2;
            let bestId = null, bestC = null;
            const set = this._currentSet;
            for (const id in set) {
                const c = set[id];
                const dx = c.center.x - worldX, dy = c.center.y - worldY;
                const d2 = dx * dx + dy * dy;
                if (d2 < bestDistSq) { bestDistSq = d2; bestId = id; bestC = c; }
            }
            if (bestId === this._hoveredId) return;
            if (this._hoveredId) {
                const prev = this._constEls.get(this._hoveredId);
                if (prev) prev.classList.remove("gsv-hover");
            }
            this._hoveredId = bestId;
            if (bestId) {
                const el = this._constEls.get(bestId);
                if (el) el.classList.add("gsv-hover");
            }
            this._hoverNameEl.textContent = bestC ? labelFor(bestC) : "";
            this._hoverNameEl.classList.toggle("gsv-visible", !!bestId);
        }

        // --- Frame update -----------------------------------------------------

        // Called manually every frame by Scene_Map while the map is open (see
        // the Scene_Map.update hook below), since the normal scene update loop
        // is frozen for as long as this overlay is active.
        update() {
            if (this._updateInput()) return;
            this._updateKeyboardShortcuts();
            this._updateWASD();
            this._updateZoomKeys();
            if (Input.isTriggered("ok")) this._fitToScreen();
            if (this._cameraDirty) {
                this._applyTransform();
                this._cameraDirty = false;
                this._pointerDirty = true;
            }
            if (this._pointerDirty) {
                // On the crosshair the readout names whatever the middle of the
                // screen is over. Aiming at the last known mouse position
                // instead (which is what this did) left a pad player naming a
                // constellation under a cursor they cannot see and did not put
                // there, and panning never changed the answer in the way they
                // expected -- the readout is the whole point of the viewer.
                const aim = this._aimPoint();
                this._updateHover(aim.x, aim.y);
                this._pointerDirty = false;
            }
            this._updateCrosshair();
            // Standing under the sky picking out constellations is how anyone
            // ever learned astronomy (see SpecializationXP.tick).
            if (window.SpecializationXP) {
                window.SpecializationXP.tick("Astronomy", 1, 30, { key: "skyviewer" });
            }
        }

        _updateInput() {
            if (Input.isTriggered("cancel") || Input.isTriggered("escape") || TouchInput.isCancelled()) {
                this.close();
                return true;
            }
            return false;
        }

        _updateKeyboardShortcuts() {
            // TAB flips between the Western and Chinese sky. TAB has no entry in
            // Input.gamepadMapper, so on a pad the toggle had no button at all
            // and the only way to switch was clicking the on-screen chips; X
            // ("shift") is the free face button here -- A recentres, B closes,
            // the bumpers zoom -- so it doubles as the pad's flip.
            if (Input.isTriggered("tab") || Input.isTriggered("shift")) {
                this._switchTo(this._view === "western" ? "chinese" : "western");
            }
        }

        // The screen point the constellation readout is aimed at.
        _aimPoint() {
            if (this._aimMode === "pointer") return { x: this._mouseX, y: this._mouseY };
            return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        }

        // The reticle is only drawn while the crosshair is what is being aimed,
        // so a mouse player never gets a mark in the middle of their sky.
        _updateCrosshair() {
            if (!this._crosshairEl) return;
            const on = this._aimMode === "crosshair";
            if (on === this._crosshairOn) return;
            this._crosshairOn = on;
            this._crosshairEl.classList.toggle("gsv-visible", on);
        }

        // Panning by key, d-pad or stick moves the sky under a fixed aim point
        // rather than moving an aim point over the sky, so any of them hands the
        // readout back to the crosshair.
        _aimAtCrosshair() {
            if (this._aimMode === "crosshair") return;
            this._aimMode = "crosshair";
            this._pointerDirty = true;
        }

        _updateWASD() {
            let dx = 0, dy = 0;
            if (Input.isPressed("a") || Input.isPressed("left")) dx += SKY_SCROLL_SPEED;
            if (Input.isPressed("d") || Input.isPressed("right")) dx -= SKY_SCROLL_SPEED;
            if (Input.isPressed("w") || Input.isPressed("up")) dy += SKY_SCROLL_SPEED;
            if (Input.isPressed("s") || Input.isPressed("down")) dy -= SKY_SCROLL_SPEED;

            // Both sticks pan, read raw so the sky drifts as far as the stick is
            // pushed instead of stepping at the one speed the d-pad fold gives.
            // The left stick is already folded into the directions above, so its
            // analog reading replaces that step rather than adding to it.
            const pads = window.AnalogStickInput;
            if (pads && typeof pads.leftX === "function") {
                const ax = pads.leftX() + pads.rightX();
                const ay = pads.leftY() + pads.rightY();
                if (ax || ay) {
                    dx = -ax * SKY_SCROLL_SPEED;
                    dy = -ay * SKY_SCROLL_SPEED;
                }
            }

            if (dx !== 0 || dy !== 0) {
                this._camX += dx;
                this._camY += dy;
                this._cameraDirty = true;
                this._aimAtCrosshair();
            }
        }

        _updateZoomKeys() {
            const aim = this._aimPoint();
            if (Input.isPressed("pageup")) this._zoomAt(1.02, aim.x, aim.y);
            if (Input.isPressed("pagedown") || Input.isPressed("zoomOut")) this._zoomAt(0.98, aim.x, aim.y);
        }

        close() {
            if (this._onWindowMouseMove) window.removeEventListener("mousemove", this._onWindowMouseMove);
            if (this._onWindowMouseUp) window.removeEventListener("mouseup", this._onWindowMouseUp);
            if (this._root && this._onContextMenu) this._root.removeEventListener("contextmenu", this._onContextMenu);
            if (this._root) {
                this._root.remove();
                this._root = null;
            }
            const scene = SceneManager._scene;
            if (scene instanceof Scene_Map) {
                scene._starMapActive = false;
                scene._starMap = null;
            }
        }
    }

    // --- Plugin Command -------------------------------------------------

    PluginManager.registerCommand(pluginName, "openStarMap", (args) => {
        const scene = SceneManager._scene;
        if (scene instanceof Scene_Map && !scene._starMapActive) {
            const isTelescope = args.telescopeView === "true";
            scene._starMapActive = true;
            scene._starMap = new StarMapOverlay(isTelescope);
        }
    });

    // --- Scene_Map Hooks -------------------------------------------------

    const _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function () {
        if (this._starMapActive && this._starMap) {
            this._starMap.update();
            TouchInput.update();
            Input.update();
            return;
        }
        _Scene_Map_update.call(this);
    };

    const _Scene_Map_terminate = Scene_Map.prototype.terminate;
    Scene_Map.prototype.terminate = function () {
        if (this._starMap) {
            this._starMap.close();
        }
        _Scene_Map_terminate.call(this);
    };

})();
