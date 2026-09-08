/*:
 * @target MZ
 * @plugindesc Overrides mouse controls: wheel to zoom, click & drag to pan.
 * @author Gemini
 *

 *
 * @help
 * ============================================================================
 * Mouse Pan & Zoom Controls
 * ============================================================================
 * This plugin completely overrides the default mouse behavior on the map.
 * 
 * - Standard "Click to move" destination pathfinding is disabled.

 * - Click and Drag the mouse to Pan the camera around the map.
 * - Mouse wheel, the + and - keys, or L2/R2 on a controller zoom the camera,
 *   on the world map (315) only.
 * - Right stick pans the camera, the controller twin of click & drag.
 * - Hold ALT, or click the right stick (R3), to label every event on screen
 *   at once instead of only the one under the cursor.
 *
 * Note: If you move the player character using the keyboard or a gamepad
 * after panning away, the camera will naturally snap back to center on
 * the player.
 */

(() => {

    // The world map sheet. The camera zoom is confined to it, and the event
    // hover is suppressed on it (WorldMap.js / MapLabels draw their own place
    // names over the teleport markers).
    const WORLD_MAP_ID = 315;

    // Prevent default context menu to stop browser-like menus appearing on right click
    document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });

    // Handle mouse wheel zoom in ASCII mode
    document.addEventListener('wheel', (e) => {
        if (window.AsciiMode && window.AsciiMode.active && SceneManager._scene instanceof Scene_Map) {
            const delta = e.deltaY;
            const currentSize = window.AsciiMode.fontSize;
            let newSize = currentSize;

            if (delta < 0) {
                // Wheel up -> Zoom in (larger font)
                newSize += 2;
            } else {
                // Wheel down -> Zoom out (smaller font)
                newSize -= 2;
            }

            window.AsciiMode.fontSize = newSize;

            // Prevent default scrolling behavior
            e.preventDefault();
        } else if (isWheelOverMap(e) && cameraZoomAllowed()) {
            stepCameraZoom(e.deltaY < 0 ? ZOOM_WHEEL_STEP : -ZOOM_WHEEL_STEP, false);
            e.preventDefault();
        }
    }, { passive: false });

    // ------------------------------------------------------------------------
    // Camera Zoom (mouse wheel + controller L2/R2), world map only
    // ------------------------------------------------------------------------
    // The live game camera is zoomed through the engine's own Game_Screen zoom,
    // anchored on the top-left corner rather than the screen centre. With that
    // anchor a screen pixel is simply a map pixel times the zoom, so redefining
    // Game_Map.screenTileX/Y to the zoomed tile count is all the engine needs to
    // scroll, clamp and centre the player exactly as it does at 1x - and
    // everything derived from those (player centring, display-pos clamping,
    // light culling, off-screen character culling) stays honest for free.
    //
    // The map is never cut when zooming out: the tilemap and the screen-sized
    // layers riding on it are grown to the enlarged viewport so no band is left
    // unpainted, and the zoom floor keeps the viewport inside the map. Fog of
    // war needs nothing special - its canvas already covers the whole map and
    // rides the same scaled spriteset.
    //
    // Only the world map (315) zooms. Everywhere else the camera stays at the
    // map's native scale: interiors, procedural squares and dungeons are all
    // authored to be read at 1x, and pulling out there only showed the seams.
    // This is also not the fullscreen "M" map sheet (WorldMap.js), which zooms
    // its own independent zoomScale and is excluded here.
    // 0.3 shows a bit over 3x the world map's usual span in each direction
    // (about 57x43 tiles of the 256x256 sheet), which is still well inside its
    // edges, so the size-derived floor in minCameraZoom() never has to step in
    // there. It is also the last notch of the 0.1 ladder the wheel walks: the
    // step below it, 0.25, pulled out further than the sheet reads well at and
    // is gone.
    const ZOOM_MIN = 0.3;
    const ZOOM_MAX = 2.5;
    const ZOOM_WHEEL_STEP = 0.1;
    const ZOOM_TRIGGER_RATE = 0.03; // zoom change per frame at full trigger pull
    const ZOOM_TRIGGER_DEADZONE = 0.15;
    const ZOOM_NEUTRAL = 1;         // the map's native scale: the detent both directions stop on
    const ZOOM_EPSILON = 0.0005;

    let cameraZoom = 1;             // what the player asked for, kept across maps
    let cameraZoomActive = false;   // whether it is currently applied to the camera
    let zoomSnapLatched = false;    // parked on the detent until the trigger is released

    // + and - (row and numpad alike) are the keyboard twin of the wheel: one
    // wheel-sized step per press, repeating while held.
    //
    // Deliberately NOT registered as the 'zoomIn'/'zoomOut' actions:
    // CustomCommandMapper.js owns those two (rebindable, Q/E by default) and its
    // rebuildMapper() drops every key bound to an action it manages before
    // re-applying the configured one - which happens on every Input.clear(), so
    // a 'zoomIn' entry here would be deleted seconds after the plugin loads.
    // Under their own names the bindings survive, and the configured zoom keys
    // are read alongside them below so a rebind works too.
    const ZOOM_KEY_MAP = { 187: 'mapZoomIn', 107: 'mapZoomIn', 189: 'mapZoomOut', 109: 'mapZoomOut' };
    for (const code of Object.keys(ZOOM_KEY_MAP)) {
        if (!Input.keyMapper[code]) Input.keyMapper[code] = ZOOM_KEY_MAP[code];
    }

    // Input listens on the document, so it hears the keys typed into the HTML
    // panels other plugins overlay on the map (terminals, search fields, chat).
    // Typing a minus there must not zoom the map behind it.
    function typingInHtmlField() {
        const el = document.activeElement;
        if (!el || el === document.body) return false;
        return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
    }

    // The wheel listener is on the document, so it also hears scrolls inside the
    // HTML panels other plugins overlay on the map (menus, terminals, lists).
    // Only a scroll on the game canvas itself is a zoom.
    function isWheelOverMap(e) {
        const t = e.target;
        if (!t || t === document.body || t === document.documentElement) return true;
        return typeof t.id === 'string' && t.id === 'gameCanvas';
    }

    function cameraZoomAllowed() {
        if (!(SceneManager._scene instanceof Scene_Map)) return false;
        if (!$gameMap || !$gamePlayer) return false;
        // The wheel listener fires on its own clock, so it can land in the gap
        // where the next map's Scene_Map has already nulled $dataMap but the old
        // one is still the current scene: everything below reads the map's size.
        if (typeof $dataMap === 'undefined' || !$dataMap) return false;
        // The world map is the only map that zooms.
        if ($gameMap.mapId() !== WORLD_MAP_ID) return false;
        // ASCII mode has its own font-size zoom, handled by the wheel branch above.
        if (window.AsciiMode && window.AsciiMode.active) return false;
        if (window.isWorldMapFullscreen && window.isWorldMapFullscreen()) return false;
        if (window.$gameSplitScreen && window.$gameSplitScreen.active) return false;
        if ($gameSystem && $gameSystem._mousePanDisabled) return false;
        return true;
    }

    // The zoom currently baked into the camera (1 when off), i.e. the factor
    // between map pixels and screen pixels.
    function activeZoom() {
        return cameraZoomActive ? cameraZoom : 1;
    }

    // Lowest zoom that still keeps the viewport inside the map, so zooming out
    // can never show past its edge. Never above 1: a map smaller than the screen
    // is already letterboxed by the engine at 1x, and forcing a zoom-in there
    // would change how it has always looked.
    function minCameraZoom() {
        const tilesX = $gameMap.width();
        const tilesY = $gameMap.height();
        let lo = ZOOM_MIN;
        if (!$gameMap.isLoopHorizontal() && tilesX > 0) {
            lo = Math.max(lo, Graphics.width / (tilesX * $gameMap.tileWidth()));
        }
        if (!$gameMap.isLoopVertical() && tilesY > 0) {
            lo = Math.max(lo, Graphics.height / (tilesY * $gameMap.tileHeight()));
        }
        return Math.min(ZOOM_NEUTRAL, lo);
    }

    function clampCameraZoom(v) {
        return Math.max(minCameraZoom(), Math.min(ZOOM_MAX, v));
    }

    // Applies the zoom to Game_Screen (or lifts it again), keeping the state
    // flag and the engine's zoom in step. Called every frame so a scene change,
    // a transfer or an event's own clearZoom() cannot leave it half-applied.
    function applyCameraZoom() {
        const wanted = cameraZoomAllowed() && Math.abs(cameraZoom - ZOOM_NEUTRAL) > ZOOM_EPSILON;
        if (wanted) {
            cameraZoomActive = true;
            $gameScreen.setZoom(0, 0, cameraZoom);
        } else if (cameraZoomActive) {
            cameraZoomActive = false;
            $gameScreen.setZoom(0, 0, 1);
        }
    }

    // Sets a new zoom keeping whatever the camera was centred on centred: the
    // viewport grows and shrinks around the middle of the screen instead of
    // sliding the map out from under the player.
    function setCameraZoom(next) {
        next = Math.round(clampCameraZoom(next) * 1000) / 1000;
        if (Math.abs(next - cameraZoom) < ZOOM_EPSILON) return;

        const centerX = $gameMap.displayX() + $gameMap.screenTileX() / 2;
        const centerY = $gameMap.displayY() + $gameMap.screenTileY() / 2;
        cameraZoom = next;
        applyCameraZoom();
        $gameMap.setDisplayPos(
            centerX - $gameMap.screenTileX() / 2,
            centerY - $gameMap.screenTileY() / 2
        );
    }

    // One zoom step, with a detent on the map's native scale: a step that would
    // cross 1x stops exactly on it instead. A held trigger then stays parked
    // there until it is released (isHeld), so passing 1x is always a deliberate
    // second pull rather than something the player slides straight through.
    function stepCameraZoom(delta, isHeld) {
        if (!delta) return;
        const target = cameraZoom + delta;
        const away = Math.abs(cameraZoom - ZOOM_NEUTRAL) > ZOOM_EPSILON;
        // <= 0, so a step that lands exactly on the detent latches like one that
        // would have overshot it.
        if (away && (cameraZoom - ZOOM_NEUTRAL) * (target - ZOOM_NEUTRAL) <= 0) {
            setCameraZoom(ZOOM_NEUTRAL);
            if (isHeld) zoomSnapLatched = true;
            return;
        }
        setCameraZoom(target);
    }

    // Per-frame driver: reads the +/- keys and L2/R2 (right trigger zooms in,
    // left zooms out) through the shared AnalogStickInput helper (core
    // Input.gamepadMapper does not cover buttons 6/7), re-clamps a zoom carried
    // over from a bigger map, and keeps Game_Screen in sync.
    Scene_Map.prototype.updateCameraZoom = function () {
        if (!cameraZoomAllowed()) {
            applyCameraZoom();
            zoomSnapLatched = false;
            return;
        }

        // Keyboard: discrete steps like the wheel's notches, so the detent on 1x
        // stops one step without latching - the next repeat crosses it. The
        // player's own zoom binding is read too, but only when it owns its key
        // outright: its Q/E default is shared with pageup/pagedown, and folding
        // those in would zoom on the movement keys.
        if (!typingInHtmlField()) {
            let keyStep = 0;
            if (Input.isRepeated('mapZoomIn') || Input.isRepeated('zoomIn')) keyStep += ZOOM_WHEEL_STEP;
            if (Input.isRepeated('mapZoomOut') || Input.isRepeated('zoomOut')) keyStep -= ZOOM_WHEEL_STEP;
            if (keyStep) stepCameraZoom(keyStep, false);
        }

        // A short pull of L2/R2 hands the party to the next member
        // (Core/AutoIdleExplorer.js), so the zoom waits out that tap window and
        // takes the trigger only once it is clear the player is holding it.
        const lead = window.AutoIdleExplorer && window.AutoIdleExplorer.lead;
        const tapPending = !!(lead && lead.padClaimsTriggers && lead.padClaimsTriggers());
        let pull = 0;
        if (window.AnalogStickInput && !tapPending) {
            const rt = window.AnalogStickInput.rightTrigger ? window.AnalogStickInput.rightTrigger() : 0;
            const lt = window.AnalogStickInput.leftTrigger ? window.AnalogStickInput.leftTrigger() : 0;
            pull = (rt > ZOOM_TRIGGER_DEADZONE ? rt : 0) - (lt > ZOOM_TRIGGER_DEADZONE ? lt : 0);
        }
        if (!pull) {
            zoomSnapLatched = false;
        } else if (!zoomSnapLatched) {
            stepCameraZoom(pull * ZOOM_TRIGGER_RATE, true);
        }

        // A zoom the player set on a wide map may show past the edge of the one
        // they just walked into (or of the room they just entered).
        const clamped = clampCameraZoom(cameraZoom);
        if (Math.abs(clamped - cameraZoom) > ZOOM_EPSILON) setCameraZoom(clamped);

        applyCameraZoom();
    };

    // Screen size in tiles, in the zoomed camera's terms.
    const _Game_Map_screenTileX = Game_Map.prototype.screenTileX;
    Game_Map.prototype.screenTileX = function () {
        const z = activeZoom();
        if (z === 1) return _Game_Map_screenTileX.call(this);
        return Math.round((Graphics.width / (this.tileWidth() * z)) * 16) / 16;
    };

    const _Game_Map_screenTileY = Game_Map.prototype.screenTileY;
    Game_Map.prototype.screenTileY = function () {
        const z = activeZoom();
        if (z === 1) return _Game_Map_screenTileY.call(this);
        return Math.round((Graphics.height / (this.tileHeight() * z)) * 16) / 16;
    };

    // Canvas -> map with the zoom anchored on the top-left corner: a screen
    // pixel covers 1/zoom map pixels. Keeps hovering, click-to-move and every
    // other canvasToMap* caller (furniture placement, map interactions) landing
    // on the tile actually under the cursor while zoomed.
    const _Game_Map_canvasToMapX = Game_Map.prototype.canvasToMapX;
    Game_Map.prototype.canvasToMapX = function (x) {
        const z = activeZoom();
        if (z === 1) return _Game_Map_canvasToMapX.call(this, x);
        const tileWidth = this.tileWidth();
        return this.roundX(Math.floor((this._displayX * tileWidth + x / z) / tileWidth));
    };

    const _Game_Map_canvasToMapY = Game_Map.prototype.canvasToMapY;
    Game_Map.prototype.canvasToMapY = function (y) {
        const z = activeZoom();
        if (z === 1) return _Game_Map_canvasToMapY.call(this, y);
        const tileHeight = this.tileHeight();
        return this.roundY(Math.floor((this._displayY * tileHeight + y / z) / tileHeight));
    };

    // Grow the tilemap and the screen-sized layers scrolling with it to the
    // zoomed viewport (a tilemap left at Graphics size would paint only the
    // top-left corner of a zoomed-out screen), and cancel the zoom on the truly
    // screen-space children so pictures, the timer and weather keep their normal
    // size and position. Cheap and idempotent, so it runs every frame: layers
    // owned by other plugins (ParallaxOverlay's looping backgrounds) resize
    // themselves back to Graphics size on their own update.
    function applyCameraZoomToSpriteset(spriteset) {
        if (!spriteset) return;
        const z = activeZoom();
        const w = Math.ceil(Graphics.width / z);
        const h = Math.ceil(Graphics.height / z);

        const tilemap = spriteset._tilemap;
        if (tilemap && (tilemap.width !== w || tilemap.height !== h)) {
            tilemap.width = w;
            tilemap.height = h;
            tilemap.refresh();
        }
        if (spriteset._parallax) spriteset._parallax.move(0, 0, w, h);
        if (spriteset._backgrounds) {
            for (const bg of spriteset._backgrounds) {
                if (bg && bg.move && bg.data && bg.data.looping) bg.move(0, 0, w, h);
            }
        }

        const inv = 1 / z;
        const screenSpace = [
            spriteset._weather,
            spriteset._customWeatherLayer,
            spriteset._pictureContainer,
            spriteset._timerSprite
        ];
        for (const layer of screenSpace) {
            if (layer && layer.scale && layer.scale.x !== inv) layer.scale.set(inv, inv);
        }
    }

    // ------------------------------------------------------------------------
    // Interior Blackout (Region 30)
    // ------------------------------------------------------------------------
    // Region-30 dividers run wall to wall, cutting one map sheet into separate
    // interiors sitting side by side. Panning is already confined to the room
    // the player is in, but a zoomed-out camera - or a room smaller than the
    // screen - still reaches past its walls, so everything outside that room is
    // painted over in black. The zoom is then free to pull all the way out
    // without ever revealing the neighbours.
    function updateInteriorBlackout(spriteset) {
        if (!spriteset || typeof PIXI === 'undefined') return;
        // The same flag that hands the camera to another system also hands it
        // the right to look at another room (cutscenes framing a different one).
        const bounds = ($gameSystem && $gameSystem._mousePanDisabled) ? null : getInteriorBounds();
        let layer = spriteset._interiorBlackout;

        if (!bounds) {
            if (layer) layer.visible = false;
            return;
        }

        if (!layer) {
            layer = new PIXI.Graphics();
            spriteset._interiorBlackout = layer;
            // Over the map, its lighting and its weather; under the screen-space
            // layers (pictures, timer) and the fog, which sit above them all.
            const pictures = spriteset._pictureContainer;
            const at = pictures ? spriteset.getChildIndex(pictures) : -1;
            if (at >= 0) spriteset.addChildAt(layer, at);
            else spriteset.addChild(layer);
        }
        layer.visible = true;

        // Room and viewport alike in spriteset-local pixels: the zoom is
        // anchored on the top-left corner, so the visible window is simply the
        // screen divided by it.
        const tw = $gameMap.tileWidth();
        const th = $gameMap.tileHeight();
        const z = activeZoom();
        const vw = Graphics.width / z;
        const vh = Graphics.height / z;
        const x0 = (bounds.minX - $gameMap.displayX()) * tw;
        const x1 = (bounds.maxX + 1 - $gameMap.displayX()) * tw;
        const y0 = (bounds.minY - $gameMap.displayY()) * th;
        const y1 = (bounds.maxY + 1 - $gameMap.displayY()) * th;

        // Nothing of the neighbours on screen: leave last frame's shape alone.
        if (x0 <= 0 && y0 <= 0 && x1 >= vw && y1 >= vh) {
            if (layer._blackoutKey !== 'none') {
                layer._blackoutKey = 'none';
                layer.clear();
            }
            return;
        }

        const key = [x0, y0, x1, y1, vw, vh].map(v => Math.round(v)).join(',');
        if (layer._blackoutKey === key) return;
        layer._blackoutKey = key;

        const left = Math.max(0, Math.min(x0, vw));
        const right = Math.max(0, Math.min(x1, vw));
        layer.clear();
        layer.beginFill(0x000000, 1);
        if (left > 0) layer.drawRect(0, 0, left, vh);
        if (right < vw) layer.drawRect(right, 0, vw - right, vh);
        if (right > left) {
            const top = Math.max(0, Math.min(y0, vh));
            const bottom = Math.max(0, Math.min(y1, vh));
            if (top > 0) layer.drawRect(left, 0, right - left, top);
            if (bottom < vh) layer.drawRect(left, bottom, right - left, vh - bottom);
        }
        layer.endFill();
    }

    // A zoom asked for by an event command wins: drop the player's camera zoom
    // rather than have the two fight over Game_Screen every frame.
    const _Game_Screen_startZoom = Game_Screen.prototype.startZoom;
    Game_Screen.prototype.startZoom = function (x, y, scale, duration) {
        cameraZoom = ZOOM_NEUTRAL;
        cameraZoomActive = false;
        _Game_Screen_startZoom.call(this, x, y, scale, duration);
    };

    // Leaving the map scene lifts the zoom, so screenTileX/Y and Game_Screen are
    // back to their plain values for battles, menus and any other scene. Scene_Map
    // .start puts it back.
    const _Scene_Map_terminate = Scene_Map.prototype.terminate;
    Scene_Map.prototype.terminate = function () {
        if (cameraZoomActive) {
            cameraZoomActive = false;
            $gameScreen.setZoom(0, 0, 1);
        }
        _Scene_Map_terminate.call(this);
    };

    let isDragging = false;
    let isStickPanning = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let initialDisplayX = 0;
    let initialDisplayY = 0;

    let clickStartX = 0;
    let clickStartY = 0;
    let isClicking = false;

    // ------------------------------------------------------------------------
    // Interior Divider Clamping (Region 30)
    // ------------------------------------------------------------------------
    // Region 30 tiles separate different interiors placed on the same map.
    // While inside such an interior, the drag-pan camera is confined to the
    // room's bounding box so the player can never drag the view into a
    // neighbouring interior.
    const INTERIOR_DIVIDER_REGION = 30;

    let _dividerMapId = -1;
    let _mapHasDividers = false;
    let _interiorBounds = null;
    let _interiorTileX = -1;
    let _interiorTileY = -1;

    function mapHasDividers() {
        if (_dividerMapId === $gameMap.mapId()) return _mapHasDividers;
        _dividerMapId = $gameMap.mapId();
        _mapHasDividers = false;
        // The world map's region plane holds one country id per tile (see
        // Countries.json / getWorldRegionId), so its ~320 region-30 tiles are a
        // nation, not interior walls. Scanning it would fence the camera into
        // whatever slab of the globe a flood fill happened to reach and black
        // out the rest - and it is exactly the map the zoom lives on.
        if ($gameMap.mapId() === WORLD_MAP_ID) {
            _interiorBounds = null;
            _interiorTileX = -1;
            _interiorTileY = -1;
            return false;
        }
        const w = $gameMap.width();
        const h = $gameMap.height();
        for (let y = 0; y < h && !_mapHasDividers; y++) {
            for (let x = 0; x < w; x++) {
                if ($gameMap.regionId(x, y) === INTERIOR_DIVIDER_REGION) {
                    _mapHasDividers = true;
                    break;
                }
            }
        }
        // Invalidate any cached bounds from the previous map.
        _interiorBounds = null;
        _interiorTileX = -1;
        _interiorTileY = -1;
        return _mapHasDividers;
    }

    // Flood-fill from the player's tile, stopping at region-30 dividers (which
    // are included in the bounds so their walls remain visible). Returns null
    // when the player is on a divider or the area is not enclosed by dividers.
    function computeInteriorBounds(px, py) {
        const w = $gameMap.width();
        const h = $gameMap.height();
        if (px < 0 || py < 0 || px >= w || py >= h) return null;
        if ($gameMap.regionId(px, py) === INTERIOR_DIVIDER_REGION) return null;

        const visited = new Uint8Array(w * h);
        const start = py * w + px;
        const stack = [start];
        visited[start] = 1;

        let minX = px, maxX = px, minY = py, maxY = py;
        let hitDivider = false;

        while (stack.length) {
            const idx = stack.pop();
            const x = idx % w;
            const y = (idx / w) | 0;

            const neighbors = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
            for (let n = 0; n < neighbors.length; n++) {
                const nx = neighbors[n][0];
                const ny = neighbors[n][1];
                if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                const nidx = ny * w + nx;
                if (visited[nidx]) continue;
                visited[nidx] = 1;

                if ($gameMap.regionId(nx, ny) === INTERIOR_DIVIDER_REGION) {
                    // Include the divider wall in the bounds but don't cross it.
                    hitDivider = true;
                    if (nx < minX) minX = nx;
                    if (nx > maxX) maxX = nx;
                    if (ny < minY) minY = ny;
                    if (ny > maxY) maxY = ny;
                    continue;
                }

                if (nx < minX) minX = nx;
                if (nx > maxX) maxX = nx;
                if (ny < minY) minY = ny;
                if (ny > maxY) maxY = ny;
                stack.push(nidx);
            }
        }

        // Not enclosed by dividers => open area, no clamping.
        if (!hitDivider) return null;
        return { minX, maxX, minY, maxY };
    }

    function getInteriorBounds() {
        if (!$gameMap || !$gamePlayer) return null;
        if (!mapHasDividers()) return null;
        const px = Math.round($gamePlayer.x);
        const py = Math.round($gamePlayer.y);
        if (px !== _interiorTileX || py !== _interiorTileY) {
            _interiorTileX = px;
            _interiorTileY = py;
            _interiorBounds = computeInteriorBounds(px, py);
        }
        return _interiorBounds;
    }

    // Confine a display coordinate so the visible window [disp, disp+screenTiles]
    // stays within the inclusive bounds [lo, hi]. Centers when the interior is
    // smaller than the screen.
    function clampDisplayAxis(disp, lo, hi, screenTiles) {
        const span = (hi + 1) - lo; // inclusive tile range -> tile count
        if (span <= screenTiles) {
            return lo + (span - screenTiles) / 2;
        }
        return Math.max(lo, Math.min(disp, (hi + 1) - screenTiles));
    }

    // Shared by both panning routes (mouse drag, right stick): confines the
    // camera to the current interior when region-30 dividers are present, so
    // panning can't peek into neighbouring interiors. screenTileX/Y already
    // carry the camera zoom, so a zoomed-out view is confined just as tightly.
    function clampPanToInterior(dispX, dispY) {
        const bounds = getInteriorBounds();
        if (!bounds) return { x: dispX, y: dispY };
        const isAscii = window.AsciiMode && window.AsciiMode.active;
        const screenTilesX = isAscii ? window.innerWidth / window.AsciiMode.fontSize : $gameMap.screenTileX();
        const screenTilesY = isAscii ? window.innerHeight / window.AsciiMode.fontSize : $gameMap.screenTileY();
        return {
            x: clampDisplayAxis(dispX, bounds.minX, bounds.maxX, screenTilesX),
            y: clampDisplayAxis(dispY, bounds.minY, bounds.maxY, screenTilesY)
        };
    }

    // ------------------------------------------------------------------------
    // Delayed Click-to-Move (to allow dragging without moving)
    // ------------------------------------------------------------------------
    Scene_Map.prototype.processMapTouch = function () {
        if (window.isWorldMapFullscreen && window.isWorldMapFullscreen()) return;

        if (TouchInput.isTriggered()) {
            clickStartX = TouchInput.x;
            clickStartY = TouchInput.y;
            isClicking = true;
        }

        if (TouchInput.isReleased() || !TouchInput.isPressed()) {
            if (isClicking && TouchInput.isReleased()) {
                const dx = TouchInput.x - clickStartX;
                const dy = TouchInput.y - clickStartY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 10) { // Threshold for click
                    const x = $gameMap.canvasToMapX(TouchInput.x);
                    const y = $gameMap.canvasToMapY(TouchInput.y);
                    $gameTemp.setDestination(x, y);
                }
            }
            isClicking = false;
        }
    };

    // ------------------------------------------------------------------------
    // Map Update Injection
    // ------------------------------------------------------------------------
    const _Scene_Map_start = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function () {
        _Scene_Map_start.call(this);
        isDragging = false;
        isClicking = false;
        isStickPanning = false;

        // Put the camera zoom back before touching the display position: the
        // engine centred the player on an unzoomed viewport during its own start.
        if (!$gameSystem._mousePanDisabled) {
            cameraZoom = clampCameraZoom(cameraZoom);
            applyCameraZoom();
            applyCameraZoomToSpriteset(this._spriteset);
            updateInteriorBlackout(this._spriteset);
        }

        const data = $gameSystem._mousePan;
        const restored = data && data.displayX !== undefined && data.displayX !== null;
        if (restored && !$gameSystem._mousePanDisabled) {
            $gameMap.setDisplayPos(data.displayX, data.displayY);
        } else if (cameraZoomActive) {
            $gamePlayer.center($gamePlayer.x, $gamePlayer.y);
        }
    };



    const _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function () {
        // Zoom first: the engine's own update (scrolling, spriteset positions)
        // then runs against the viewport size the player is actually looking at.
        if ($gameMap && $gamePlayer) this.updateCameraZoom();

        _Scene_Map_update.call(this);
        if ($gameMap && $gamePlayer) {
            const isWorldMapFullscreen = window.isWorldMapFullscreen && window.isWorldMapFullscreen();
            if (!$gameSystem._mousePanDisabled && !isWorldMapFullscreen) {
                this.updateMousePan();
                this.updateStickPan();

                // Save current state (only write when it actually changed)
                if (!$gameSystem._mousePan) $gameSystem._mousePan = {};
                const pan = $gameSystem._mousePan;
                const dispX = $gameMap.displayX();
                const dispY = $gameMap.displayY();
                if (pan.displayX !== dispX) pan.displayX = dispX;
                if (pan.displayY !== dispY) pan.displayY = dispY;
            }
            applyCameraZoomToSpriteset(this._spriteset);
            updateInteriorBlackout(this._spriteset);
        }
        // Event hover (merged here from a second Scene_Map.update alias)
        this.updateEventHover();
    };

    // ------------------------------------------------------------------------
    // Panning Logic
    // ------------------------------------------------------------------------
    Scene_Map.prototype.updateMousePan = function () {
        // Start Drag
        if (TouchInput.isTriggered()) {
            isDragging = true;
            dragStartX = TouchInput.x;
            dragStartY = TouchInput.y;
            initialDisplayX = $gameMap._displayX;
            initialDisplayY = $gameMap._displayY;
        }

        // End Drag
        if (TouchInput.isReleased() || !TouchInput.isPressed()) {
            isDragging = false;
        }

        // Process Dragging
        if (isDragging && TouchInput.isPressed()) {
            const dx = TouchInput.x - dragStartX;
            const dy = TouchInput.y - dragStartY;

            const isAscii = window.AsciiMode && window.AsciiMode.active;
            // A screen pixel is 1/zoom map pixels, so the tile stays glued to the
            // cursor at any zoom.
            const zoom = isAscii ? 1 : activeZoom();
            const tileW = (isAscii ? window.AsciiMode.fontSize : $gameMap.tileWidth()) * zoom;
            const tileH = (isAscii ? window.AsciiMode.fontSize : $gameMap.tileHeight()) * zoom;

            const panned = clampPanToInterior(
                initialDisplayX - (dx / tileW),
                initialDisplayY - (dy / tileH)
            );

            // setDisplayPos automatically handles map boundaries and looping
            $gameMap.setDisplayPos(panned.x, panned.y);
        }
    };

    // ------------------------------------------------------------------------
    // Right Stick Panning (controller twin of click & drag)
    // ------------------------------------------------------------------------
    const STICK_PAN_DEADZONE = 0.2;
    const STICK_PAN_SPEED = 0.35; // tiles per frame at full tilt, before zoom

    Scene_Map.prototype.updateStickPan = function () {
        const pad = window.AnalogStickInput;
        if (!pad || !pad.rightX) {
            isStickPanning = false;
            return;
        }
        const rx = pad.rightX();
        const ry = pad.rightY();
        const dx = Math.abs(rx) > STICK_PAN_DEADZONE ? rx : 0;
        const dy = Math.abs(ry) > STICK_PAN_DEADZONE ? ry : 0;
        if (!dx && !dy) {
            isStickPanning = false;
            return;
        }

        isStickPanning = true;
        // Divided by the zoom so the view slides at the same speed on screen
        // however far out the camera is pulled.
        const speed = STICK_PAN_SPEED / activeZoom();
        const panned = clampPanToInterior(
            $gameMap.displayX() + dx * speed,
            $gameMap.displayY() + dy * speed
        );
        $gameMap.setDisplayPos(panned.x, panned.y);
    };



    // ------------------------------------------------------------------------
    // Prevent Camera Snap-back While Dragging
    // ------------------------------------------------------------------------
    const _Game_Player_updateScroll = Game_Player.prototype.updateScroll;
    Game_Player.prototype.updateScroll = function (lastScrolledX, lastScrolledY) {
        if (isDragging && !TouchInput.isPressed()) {
            isDragging = false;
        }
        // Hold the panned view while either pan input is held; releasing it lets
        // the camera glide back to the player below.
        if (isDragging || isStickPanning) {
            this._isPanningToCenter = false;
            return;
        }


        // Pan back to player when moving
        if (this.isMoving()) {
            const targetX = this.x - this.centerX();
            const targetY = this.y - this.centerY();

            const dx = $gameMap.deltaX(targetX, $gameMap.displayX());
            const dy = $gameMap.deltaY(targetY, $gameMap.displayY());

            if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
                const panSpeed = 0.15;
                // Never glide slower than the player actually moves this frame,
                // otherwise the camera lags behind and the character drifts off
                // centre while running/dashing. distancePerFrame() also reflects
                // the climb/swim speed multipliers, so it stays centred in those
                // modes too. When far from centre (e.g. after a drag-pan) the
                // proportional term still gives a smooth glide back.
                const minStep = this.distancePerFrame();
                const stepX = Math.sign(dx) * Math.min(Math.abs(dx), Math.max(Math.abs(dx) * panSpeed, minStep));
                const stepY = Math.sign(dy) * Math.min(Math.abs(dy), Math.max(Math.abs(dy) * panSpeed, minStep));
                $gameMap.setDisplayPos($gameMap.displayX() + stepX, $gameMap.displayY() + stepY);
                return;
            }
        }
        _Game_Player_updateScroll.call(this, lastScrolledX, lastScrolledY);
    };

    const _DataManager_extractSaveContents = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function (contents) {
        _DataManager_extractSaveContents.call(this, contents);
        if ($gameSystem) {
            delete $gameSystem._mousePan;
        }
    };

    const _Game_Player_performTransfer = Game_Player.prototype.performTransfer;
    Game_Player.prototype.performTransfer = function () {
        if ($gameSystem._mousePan) {
            delete $gameSystem._mousePan.displayX;
            delete $gameSystem._mousePan.displayY;

        }
        _Game_Player_performTransfer.call(this);
    };

    // ------------------------------------------------------------------------
    // Hover Window for Event Names (updated for ALT reveal)
    // ------------------------------------------------------------------------

    // Held down, the reveal modifier labels every event on screen at once
    // instead of only the one under the cursor: ALT on the keyboard, R3 (right
    // stick click) on a controller - the stick that pans the camera, so the
    // hand already looking around is the one that names what it finds.
    //
    // ALT is registered under its own action name rather than core's unmapped
    // 'alt' for the same reason the zoom keys are (see ZOOM_KEY_MAP above):
    // CustomCommandMapper.js drops the keys of every action it manages on each
    // Input.clear(), and a name it does not know survives that.
    const REVEAL_NAMES_KEY = 18; // ALT
    if (!Input.keyMapper[REVEAL_NAMES_KEY]) Input.keyMapper[REVEAL_NAMES_KEY] = 'mapRevealNames';

    function isRevealNamesHeld() {
        if (Input.isPressed('mapRevealNames')) return true;
        const pad = window.AnalogStickInput;
        return !!(pad && pad.isButtonPressed && pad.isButtonPressed(pad.BUTTON.R3));
    }

    let _classI18n = null;

    const loadClassI18n = async () => {
        const lang = ConfigManager.language || "en";
        const url = `js/i18n/${lang}/classes.json`;
        try {
            const response = await fetch(url);
            _classI18n = await response.json();
        } catch (e) {
            console.error('MousePan: Failed to load class i18n from ' + url, e);
        }
    };

    loadClassI18n();

    // i18n-ignore-start: fallback ids; the display copy comes from classes.json
    const classNames = {
        1: "Freelancer", 2: "Witch", 3: "Nun", 4: "Knight", 5: "Convoker",
        6: "CEO", 7: "Vampire", 8: "Cultist", 9: "Combat Medic", 10: "Elementalist",
        11: "Martial Artist", 12: "Enchanter", 13: "Berserker", 14: "Acrobat", 15: "Monk",
        16: "Brawler", 17: "Boxer", 18: "Pro Wrestler", 19: "Fire Mage", 20: "Ice Mage",
        21: "Rogue", 22: "Paladin", 23: "Warlock", 24: "Ranger", 25: "Cleric",
        26: "Samurai", 27: "Archmage", 28: "Scout", 29: "Oracle", 30: "Gladiator",
        31: "Necromancer", 32: "Commander", 33: "Guardian", 34: "Spellblade", 35: "Bard",
        36: "Illusionist", 37: "Battlemage", 38: "Mercenary", 39: "Sage", 40: "Barbarian",
        41: "Doctor", 42: "Scientist", 43: "Firefighter", 44: "Police Officer", 45: "Chef",
        46: "Journalist", 47: "Construction Worker", 48: "Academic", 49: "Psychologist", 50: "Archaeologist",
        51: "Nurse", 52: "Hunter-Gatherer", 53: "Physicist", 54: "Mechanic", 55: "Shopkeeper",
        56: "Farmer", 57: "Lumberjack", 58: "Meteorologist", 59: "Priest", 60: "Entertainer",
        61: "Demigod", 62: "Wretch", 63: "Beast", 64: "Mimic", 65: "Monster", 66: "Cyborg"
    };

    // Default horizontal offset. Can be overridden in event notes with <xOffset: number>
    const X_OFFSET = 0;

    // Canvas element + scale are cached: getElementById/getBoundingClientRect
    // every frame is expensive. Invalidated on window resize and when the
    // internal Graphics size changes.
    let _msgCanvasEl = null;
    let _msgScaleCache = null;
    window.addEventListener('resize', () => { _msgScaleCache = null; });

    function _msgGetScale() {
        if (_msgScaleCache &&
            _msgScaleCache.gw === Graphics.width &&
            _msgScaleCache.gh === Graphics.height) {
            return _msgScaleCache;
        }
        if (!_msgCanvasEl || !_msgCanvasEl.isConnected) {
            _msgCanvasEl = document.getElementById('gameCanvas');
        }
        if (!_msgCanvasEl) return { sx: 1, sy: 1, ox: 0, oy: 0, gw: 0, gh: 0 };
        const r = _msgCanvasEl.getBoundingClientRect();
        _msgScaleCache = {
            sx: r.width / Graphics.width,
            sy: r.height / Graphics.height,
            ox: r.left,
            oy: r.top,
            gw: Graphics.width,
            gh: Graphics.height
        };
        return _msgScaleCache;
    }

    function shouldHideEvent(name) {
        if (!name) return true;
        const trimmed = name.trim();
        if (trimmed.startsWith("EV") || trimmed.startsWith("Transfer") || trimmed.startsWith("Door")) return true;
        
        const lower = trimmed.toLowerCase();
        const hideList = ["audio", "puzzlesetup", "debug", "audioemitter"];
        if (hideList.includes(lower)) return true;
        
        if (/^player[1-9]$/i.test(trimmed)) return true;
        
        return false;
    }

    // "Shop" events with no graphic/identity of their own are covered by an NPC
    // persona (see ShopShiftManager in NPCSimulationCore.js). When covered,
    // returns that persona's name + their actual class, otherwise null, which
    // includes a Shop event whose shopkeeper the author drew: that one is
    // hovered under their own name like any other NPC.
    function shopPersonaDisplay(ev) {
        if (!window.NPCSim?.isShopShiftCovered?.(ev) || !window.NPCSim?.getShopShiftData) return null;
        const persona = window.NPCSim.getShopShiftData(ev.event().name, $gameMap.mapId(), ev.eventId());
        if (!persona) return null;
        const profile = $gameSystem?._npcSociety?.[persona.name];
        const classId = profile?.assignedClassId ?? null;
        const className = (_classI18n && _classI18n[classId] ? _classI18n[classId].name : null) || classNames[classId] || "";
        return { name: persona.name, classId, className };
    }

    // An "Enemy" event is hovered under the name of the enemy it is linked to,
    // never under the bare event name. The troop is normally on the event
    // itself; a procedurally placed one is remembered per event id instead.
    function enemyDisplayName(ev) {
        const data = ev.event ? ev.event() : null;
        if (!data || data.name !== "Enemy") return null; // i18n-ignore: event name
        let troopId = ev._fixedTroopId;
        if (!(troopId > 0) && $gameSystem && $gameSystem._procGenEnemyTroops) {
            troopId = $gameSystem._procGenEnemyTroops[ev.eventId()];
        }
        if (!(troopId > 0)) return null;
        const troop = $dataTroops[troopId];
        if (!troop || !troop.members.length) return null;
        const enemy = $dataEnemies[troop.members[0].enemyId];
        return enemy ? enemy.name.trim() : null;
    }

    function formatEventName(name) {
        if (!name) return "";
        let displayName = name.trim();
        
        if (displayName === "RandomArmourChest") {
            displayName = "Armour Chest";
        } else if (displayName === "RandomWeaponChest") {
            displayName = "Weapon Chest";
        } else if (displayName === "RandomItemChest") {
            displayName = "Chest";
        } else if (displayName === "Dungeon door") {
            displayName = "Door";
        } else if (displayName.startsWith("Treasure")) {
            displayName = "Chest";
        }
        
        return displayName;
    }

    function Window_EventHover() {
        this.initialize(...arguments);
    }

    Window_EventHover.prototype = Object.create(Window_Base.prototype);
    Window_EventHover.prototype.constructor = Window_EventHover;

    Window_EventHover.prototype.initialize = function (rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this.opacity = 0;
        this.contentsOpacity = 0;
        this._text = "";
        this._textChanged = false;
        this._neededWidth = 100;

        const old = this._htmlHoverRoot;
        if (old && old.parentNode) old.parentNode.removeChild(old);

        const root = document.createElement('div');
        root.style.cssText =
            'position:fixed;display:none;z-index:495;pointer-events:none;' +
            'box-sizing:border-box;overflow:hidden;white-space:nowrap;' +
            'background:var(--text-danger-hover);' +
            'border:3px solid var(--border-subtle);border-radius:6px;' +
            'outline:1px solid var(--border-subtle-translucent-40);outline-offset:-7px;' +
            'background-image:radial-gradient(ellipse at center,' +
            'transparent 40%,var(--bg-brown-vignette-10) 100%);' +
            'color:var(--text-primary-hover);font-family:var(--font-ui);font-weight:bold;' +
            'box-shadow:0 4px 10px rgba(0,0,0,0.25);' +
            'display:none;justify-content:center;align-items:center;text-align:center;';
        
        this._htmlHoverRoot = root;
        document.body.appendChild(root);

        this.hide();
    };

    Window_EventHover.prototype.destroy = function (options) {
        if (this._htmlHoverRoot && this._htmlHoverRoot.parentNode) {
            this._htmlHoverRoot.parentNode.removeChild(this._htmlHoverRoot);
        }
        this._htmlHoverRoot = null;
        Window_Base.prototype.destroy.call(this, options);
    };

    Window_EventHover.prototype.show = function() {
        Window_Base.prototype.show.call(this);
        if (this._htmlHoverRoot) this._htmlHoverRoot.style.display = 'flex';
    };

    Window_EventHover.prototype.hide = function() {
        Window_Base.prototype.hide.call(this);
        if (this._htmlHoverRoot) this._htmlHoverRoot.style.display = 'none';
    };

    Window_EventHover.prototype._refreshBack = function () {};
    Window_EventHover.prototype._refreshFrame = function () {};

    // Cache of measured widths keyed by text (measuring builds/destroys a
    // Bitmap, which is expensive to do every frame while hovering).
    const _hoverWidthCache = new Map();
    function _measureHoverWidth(text) {
        let w = _hoverWidthCache.get(text);
        if (w !== undefined) return w;
        const tempBitmap = new Bitmap(1, 1);
        tempBitmap.fontSize = 18;
        tempBitmap.fontFace = 'Bitter';
        const measuredWidth = Math.ceil(tempBitmap.measureTextWidth(text));
        tempBitmap.destroy();
        w = Math.max(32, measuredWidth + 32);
        if (_hoverWidthCache.size >= 200) _hoverWidthCache.clear();
        _hoverWidthCache.set(text, w);
        return w;
    }

    Window_EventHover.prototype.setText = function (text) {
        text = (text || "").trim();
        if (text === "") {
            this._text = "";
            this._neededWidth = 10;
            this.hide();
            return;
        }

        // Only measure when the text actually changed (measurement is the cost).
        if (this._text !== text) {
            this._text = text;
            this._neededWidth = _measureHoverWidth(text);
            this._textChanged = true;
            if (this._htmlHoverRoot) {
                this._htmlHoverRoot.textContent = text;
            }
        }
    };

    // Writes a style property only when its value changed, tracking last-applied
    // values on a per-element cache to avoid redundant DOM style writes.
    function _setStyleIfChanged(el, prop, value) {
        const cache = el._phhStyleCache || (el._phhStyleCache = {});
        if (cache[prop] === value) return;
        cache[prop] = value;
        el.style[prop] = value;
    }

    // Height is now 70 to avoid text cutoff
    Window_EventHover.prototype.updatePosition = function (x, y, width) {
        this.move(x, y, width, 70);

        if (this._htmlHoverRoot) {
            const sc = _msgGetScale();
            const el = this._htmlHoverRoot;

            // Scaled positioning matching target event bounds
            _setStyleIfChanged(el, 'left', (sc.ox + x * sc.sx) + 'px');
            _setStyleIfChanged(el, 'top', (sc.oy + y * sc.sy) + 'px');
            _setStyleIfChanged(el, 'width', (width * sc.sx) + 'px');
            _setStyleIfChanged(el, 'height', (70 * sc.sy) + 'px');

            // Scale padding and font size
            const padX = Math.round(16 * sc.sx);
            _setStyleIfChanged(el, 'padding', `0 ${padX}px`);

            const baseFontSize = 18;
            const scaledFont = Math.round(baseFontSize * sc.sy * 0.85);
            _setStyleIfChanged(el, 'fontSize', scaledFont + 'px');
        }
    };

    const _Scene_Map_createAllWindows = Scene_Map.prototype.createAllWindows;
    Scene_Map.prototype.createAllWindows = function () {
        _Scene_Map_createAllWindows.call(this);
        const rect = new Rectangle(10, 10, 300, 70);
        this._eventHoverWindow = new Window_EventHover(rect);
        this.addWindow(this._eventHoverWindow);
        // Pool for the ALT / R3 reveal windows
        this._eventHoverWindows = [];
    };

    Scene_Map.prototype.updateEventHover = function () {
        if (!this._eventHoverWindow) return;

        const getTileScreenPosition = (mapX, mapY) => {
            const isAscii = window.AsciiMode && window.AsciiMode.active;
            if (isAscii) {
                const activeFontSize = window.AsciiMode.fontSize;
                const vpW = window.innerWidth;
                const vpH = window.innerHeight;
                const viewWidth = vpW / activeFontSize;
                const viewHeight = vpH / activeFontSize;

                const mapCenterX = Math.round($gameMap.displayX()) + (vpW / $gameMap.tileWidth()) / 2;
                const mapCenterY = Math.round($gameMap.displayY()) + (vpH / $gameMap.tileHeight()) / 2;

                const startX = mapCenterX - viewWidth / 2;
                const startY = mapCenterY - viewHeight / 2;

                const mapWidth = $gameMap.width();
                const mapHeight = $gameMap.height();

                let mapOffsetX = 0;
                let mapOffsetY = 0;
                if (mapWidth < viewWidth) {
                    mapOffsetX = Math.floor((viewWidth - mapWidth) / 2) * activeFontSize;
                }
                if (mapHeight < viewHeight) {
                    mapOffsetY = Math.floor((viewHeight - mapHeight) / 2) * activeFontSize;
                }

                const totalOffsetX = mapOffsetX;
                const totalOffsetY = mapOffsetY;

                const screenX = Math.round(totalOffsetX + (mapX - startX) * activeFontSize + activeFontSize / 2);
                const screenY = Math.round(totalOffsetY + (mapY - startY) * activeFontSize);
                return { x: screenX, y: screenY };
            } else {
                // The camera zoom is anchored on the top-left corner, so a map
                // pixel lands on screen at exactly map pixel * zoom.
                const z = activeZoom();
                const tw = $gameMap.tileWidth();
                const th = $gameMap.tileHeight();
                const screenX = Math.round(($gameMap.adjustX(mapX) * tw + tw / 2) * z);
                const screenY = Math.round($gameMap.adjustY(mapY) * th * z);
                return { x: screenX, y: screenY };
            }
        };

        // Disable in split-screen, and on the world map entirely
        if (($gameMap && $gameMap.mapId() === WORLD_MAP_ID) ||
            (window.$gameSplitScreen && window.$gameSplitScreen.active)) {
            this._eventHoverWindow.hide();
            if (this._eventHoverWindows) {
                this._eventHoverWindows.forEach(win => win.hide());
            }
            return;
        }

        // ALT (or R3) reveals every event name on screen
        if (isRevealNamesHeld()) {
            const allEvents = $gameMap.events();
            let used = 0;
            for (const ev of allEvents) {
                // Filter same as singleâ€‘hover logic, but allow events with no graphic
                if (ev.isTransparent()) continue;
                const name = ev.event().name;
                if (shouldHideEvent(name)) continue;
                if ($gameMap.fogOfWarState && $gameMap.fogOfWarState(ev.x, ev.y) < 2) continue;

                // Only what is actually in view: an off-screen event would
                // otherwise have its label clamped onto the nearest screen edge,
                // stacking the whole map's names in a pile there.
                const tilePos = getTileScreenPosition(ev._realX, ev._realY);
                if (tilePos.x < 0 || tilePos.x > Graphics.boxWidth) continue;
                if (tilePos.y < 0 || tilePos.y > Graphics.boxHeight + 70) continue;

                // Ensure a window exists for this event
                let win = this._eventHoverWindows[used];
                if (!win) {
                    const dummyRect = new Rectangle(0, 0, 100, 70);
                    win = new Window_EventHover(dummyRect);
                    this.addWindow(win);
                    this._eventHoverWindows[used] = win;
                }

                // Build display text
                let displayName = formatEventName(name);
                const enemyName = enemyDisplayName(ev);
                if (enemyName) {
                    displayName = enemyName;
                } else {
                    const notes = ev.event().note;
                    const npcMatch = notes.match(/NPC-(\d+)/);
                    const shopPersona = npcMatch ? null : shopPersonaDisplay(ev);
                    if (npcMatch) {
                        const classId = parseInt(npcMatch[1]);
                        const className = (_classI18n && _classI18n[classId] ? _classI18n[classId].name : null) || classNames[classId] || "Unknown";
                        displayName = `${displayName}, ${className.trim()}`;
                    } else if (shopPersona) {
                        displayName = shopPersona.className ? `${shopPersona.name}, ${shopPersona.className.trim()}` : shopPersona.name;
                    }
                }
                win.setText(displayName);

                // Position window above the event sprite's map tile
                const winWidth = win._neededWidth;
                const winHeight = 70;
                const eventOffset = Number((ev.event().meta || {}).xOffset || X_OFFSET);

                let x = tilePos.x - winWidth / 2 + eventOffset;
                let y = tilePos.y - winHeight - 8;
                
                // Clamp to screen bounds
                x = Math.max(0, Math.min(x, Graphics.boxWidth - winWidth));
                y = Math.max(0, Math.min(y, Graphics.boxHeight - winHeight));
                win.updatePosition(x, y, winWidth);
                win.show();
                used++;
            }
            // Hide any surplus windows from previous frame
            for (let i = used; i < this._eventHoverWindows.length; i++) {
                this._eventHoverWindows[i].hide();
            }
            // Also hide the singleâ€‘hover window while ALT is active
            this._eventHoverWindow.hide();
            return;
        }

        // Normal singleâ€‘hover behavior (unchanged logic, but allow events without graphic)
        const mapX = $gameMap.canvasToMapX(TouchInput.x);
        const mapY = $gameMap.canvasToMapY(TouchInput.y);
        const events = $gameMap.eventsXy(mapX, mapY);

        const hoveredEvent = events.find(ev => {
            if (ev.isTransparent()) return false;
            // Allow events with no graphic (characterName empty and tileId 0)
            const name = ev.event().name;
            if (shouldHideEvent(name)) return false;
            if ($gameMap.fogOfWarState && $gameMap.fogOfWarState(mapX, mapY) < 2) return false;
            return true;
        });

        if (hoveredEvent) {
            const evName  = hoveredEvent.event().name;
            const evNotes = hoveredEvent.event().note || "";
            let name = formatEventName(evName);

            const hoveredEnemyName = enemyDisplayName(hoveredEvent);
            if (hoveredEnemyName) {
                name = hoveredEnemyName;
            } else {
                const npcMatch = evNotes.match(/NPC-(\d+)/);
                if (npcMatch) {
                    const classId = parseInt(npcMatch[1]);
                    const className = (_classI18n && _classI18n[classId] ? _classI18n[classId].name : null) || classNames[classId] || "Unknown";
                    name = `${name}, ${className.trim()}`;
                } else {
                    const shopPersona = shopPersonaDisplay(hoveredEvent);
                    if (shopPersona) {
                        name = shopPersona.className ? `${shopPersona.name}, ${shopPersona.className.trim()}` : shopPersona.name;
                    }
                }
            }

            // Name (and class, when known) only, no simulation details.
            this._eventHoverWindow.setText(name);
            const winWidth  = this._eventHoverWindow._neededWidth;
            const winHeight = 70;
            const eventOffset = Number((hoveredEvent.event().meta || {}).xOffset || X_OFFSET);
            const tilePos = getTileScreenPosition(hoveredEvent._realX, hoveredEvent._realY);
            let x = tilePos.x - winWidth / 2 + eventOffset;
            let y = tilePos.y - winHeight - 8;
            x = Math.max(0, Math.min(x, Graphics.boxWidth  - winWidth));
            y = Math.max(0, Math.min(y, Graphics.boxHeight - winHeight));
            this._eventHoverWindow.updatePosition(x, y, winWidth);
            this._eventHoverWindow.show();
        } else {
            this._eventHoverWindow.hide();
        }
    };

    // Scene_NPCProfile removed â€” social web is now in NPCEmpathize.js


})();
