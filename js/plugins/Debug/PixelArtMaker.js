/*:
 * @target MZ
 * @plugindesc A complex pixel art maker inspired by Aseprite.
 * @author Omni-Lex
 *
 * @command openMaker
 * @text Open Pixel Art Maker
 * @desc Opens the Pixel Art Maker scene.
 *
 * @help
 * PixelArtMaker.js
 *
 * Provides an in-game pixel art editor using PIXI and HTML5 Canvas.
 * Features: Pencil, Eraser, Fill, Eyedropper, customizable sizes (up to 128px),
 * and a predefined palette.
 *
 * Input does NOT go through PIXI's interaction manager: its pointer events
 * never reach a scene here, so the toolbar, the palette and the drawing
 * surface are plain screen rectangles hit tested in update() against
 * TouchInput, the same input path every other scene in the game uses.
 *
 * Use Middle-Click or Right-Click and drag to pan the canvas.
 * Use the Mouse Wheel to zoom in and out.
 */

(() => {
    const pluginName = "PixelArtMaker";

    PluginManager.registerCommand(pluginName, "openMaker", args => {
        SceneManager.push(Scene_PixelArtMaker);
    });

    const PALETTE = [
        '#000000', '#f4f4f9', '#ffffff', '#4a90e2', '#e67e22', '#27ae60', '#333333', '#e0e0e0',
        '#2c3e50', '#666666', '#bbbbbb', '#8e44ad', '#732d91', '#219653', '#e2e8f0',
        '#7f8c8d', '#475569', '#cbd5e1', '#f8f9fa', '#d35400', '#f39c12', '#3498db',
        '#2980b9', '#d68910', '#fdf2e9', '#888888', '#eeeeee', '#444444', '#f1f5f9',
        '#aaaaaa', '#e74c3c', '#f0fff4', '#dcfce7', '#166534', '#fee2e2', '#991b1b'
    ];

    const TOOLS = ['pencil', 'eraser', 'fill', 'picker'];
    const SIZES = [16, 32, 64, 128];

    function hexToInt(hex) {
        return parseInt(hex.replace('#', '0x'), 16);
    }

    class UIButton extends PIXI.Container {
        constructor(width, height, text, bgColor = 0x333333, textColor = '#ffffff') {
            super();
            this.boxWidth = width;
            this.boxHeight = height;
            this.baseBgColor = bgColor;
            this.bg = new PIXI.Graphics();
            this.bg.beginFill(0xFFFFFF);
            this.bg.drawRect(0, 0, width, height);
            this.bg.endFill();
            this.bg.tint = bgColor;
            this.addChild(this.bg);

            this.label = new PIXI.Text(text, { fontFamily: 'sans-serif', fontSize: 14, fill: textColor, fontWeight: 'bold' });
            this.label.anchor.set(0.5);
            this.label.x = width / 2;
            this.label.y = height / 2;
            this.addChild(this.label);
        }

        setHovered(on) {
            this.bg.alpha = on ? 0.7 : 1.0;
        }

        setSelected(on) {
            this.bg.tint = on ? 0x666666 : this.baseBgColor;
        }
    }

    class PixelCanvas extends PIXI.Container {
        constructor(scene) {
            super();
            this.scene = scene;
            this.canvasSize = 32;
            this.zoom = 15;

            this.htmlCanvas = document.createElement('canvas');
            this.htmlCanvas.width = this.canvasSize;
            this.htmlCanvas.height = this.canvasSize;
            this.ctx = this.htmlCanvas.getContext('2d', { willReadFrequently: true });

            this.baseTexture = new PIXI.BaseTexture(this.htmlCanvas);
            this.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
            this.texture = new PIXI.Texture(this.baseTexture);
            this.sprite = new PIXI.Sprite(this.texture);

            this.bgGraphics = new PIXI.Graphics();
            this.gridGraphics = new PIXI.Graphics();

            this.addChild(this.bgGraphics);
            this.addChild(this.sprite);
            this.addChild(this.gridGraphics);

            this.isDrawing = false;
            this.lastX = -1;
            this.lastY = -1;

            this.resizeCanvas(32);
        }

        resizeCanvas(size) {
            if (size > 128) size = 128;
            this.canvasSize = size;
            this.htmlCanvas.width = size;
            this.htmlCanvas.height = size;
            this.ctx.clearRect(0, 0, size, size);

            this.texture.destroy(true);
            this.baseTexture = new PIXI.BaseTexture(this.htmlCanvas);
            this.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
            this.texture = new PIXI.Texture(this.baseTexture);
            this.sprite.texture = this.texture;

            this.bgGraphics.clear();
            this.bgGraphics.beginFill(0x888888);
            this.bgGraphics.drawRect(0, 0, size, size);
            this.bgGraphics.beginFill(0xcccccc);
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    if ((x + y) % 2 === 0) {
                        this.bgGraphics.drawRect(x, y, 1, 1);
                    }
                }
            }
            this.bgGraphics.endFill();

            this.isDrawing = false;
            this.updateScale();
        }

        updateScale() {
            this.scale.set(this.zoom);
            this.drawGrid();
        }

        drawGrid() {
            this.gridGraphics.clear();
            if (this.zoom >= 4) {
                this.gridGraphics.lineStyle(1 / this.zoom, 0x000000, 0.3);
                for (let i = 0; i <= this.canvasSize; i++) {
                    this.gridGraphics.moveTo(i, 0);
                    this.gridGraphics.lineTo(i, this.canvasSize);
                    this.gridGraphics.moveTo(0, i);
                    this.gridGraphics.lineTo(this.canvasSize, i);
                }
            }
        }

        // Screen pixel -> art pixel. Derived from the container's own position
        // and zoom rather than worldTransform, which is only up to date after a
        // render and so lags a pan or a zoom made in the same frame.
        pixelAt(screenX, screenY) {
            return {
                x: Math.floor((screenX - this.x) / this.zoom),
                y: Math.floor((screenY - this.y) / this.zoom)
            };
        }

        contains(screenX, screenY) {
            const c = this.pixelAt(screenX, screenY);
            return c.x >= 0 && c.y >= 0 && c.x < this.canvasSize && c.y < this.canvasSize;
        }

        beginStroke(screenX, screenY) {
            const coords = this.pixelAt(screenX, screenY);
            this.isDrawing = true;
            this.applyTool(coords.x, coords.y);
            this.lastX = coords.x;
            this.lastY = coords.y;
        }

        continueStroke(screenX, screenY) {
            if (!this.isDrawing) return;
            const coords = this.pixelAt(screenX, screenY);
            if (coords.x !== this.lastX || coords.y !== this.lastY) {
                this.drawLine(this.lastX, this.lastY, coords.x, coords.y);
                this.lastX = coords.x;
                this.lastY = coords.y;
            }
        }

        endStroke() {
            this.isDrawing = false;
        }

        drawLine(x0, y0, x1, y1) {
            const dx = Math.abs(x1 - x0);
            const dy = Math.abs(y1 - y0);
            const sx = (x0 < x1) ? 1 : -1;
            const sy = (y0 < y1) ? 1 : -1;
            let err = dx - dy;

            while (true) {
                this.applyTool(x0, y0);
                if (x0 === x1 && y0 === y1) break;
                const e2 = 2 * err;
                if (e2 > -dy) { err -= dy; x0 += sx; }
                if (e2 < dx) { err += dx; y0 += sy; }
            }
        }

        applyTool(x, y) {
            if (x < 0 || x >= this.canvasSize || y < 0 || y >= this.canvasSize) return;

            const scene = this.scene;
            if (scene.currentTool === 'pencil') {
                this.ctx.fillStyle = scene.currentColor;
                this.ctx.fillRect(x, y, 1, 1);
                this.texture.update();
            } else if (scene.currentTool === 'eraser') {
                this.ctx.clearRect(x, y, 1, 1);
                this.texture.update();
            } else if (scene.currentTool === 'fill') {
                this.floodFill(x, y, scene.currentColor);
                this.texture.update();
                this.isDrawing = false;
            } else if (scene.currentTool === 'picker') {
                const pixelData = this.ctx.getImageData(x, y, 1, 1).data;
                if (pixelData[3] !== 0) {
                    const hex = "#" + (1 << 24 | pixelData[0] << 16 | pixelData[1] << 8 | pixelData[2]).toString(16).slice(1);
                    scene.setColor(hex);
                }
                this.isDrawing = false;
            }
        }

        floodFill(startX, startY, fillColorHex) {
            const imageData = this.ctx.getImageData(0, 0, this.canvasSize, this.canvasSize);
            const data = imageData.data;
            const width = this.canvasSize;
            const height = this.canvasSize;

            const startPos = (startY * width + startX) * 4;
            const startR = data[startPos];
            const startG = data[startPos + 1];
            const startB = data[startPos + 2];
            const startA = data[startPos + 3];

            const fillR = parseInt(fillColorHex.slice(1, 3), 16);
            const fillG = parseInt(fillColorHex.slice(3, 5), 16);
            const fillB = parseInt(fillColorHex.slice(5, 7), 16);
            const fillA = 255;

            if (startR === fillR && startG === fillG && startB === fillB && startA === fillA) return;

            const matchStartColor = (pos) => {
                return data[pos] === startR && data[pos + 1] === startG && data[pos + 2] === startB && data[pos + 3] === startA;
            };

            const colorPixel = (pos) => {
                data[pos] = fillR;
                data[pos + 1] = fillG;
                data[pos + 2] = fillB;
                data[pos + 3] = fillA;
            };

            const pixelStack = [[startX, startY]];

            while (pixelStack.length) {
                const newPos = pixelStack.pop();
                const x = newPos[0];
                let y = newPos[1];

                let pos = (y * width + x) * 4;
                while (y-- >= 0 && matchStartColor(pos)) {
                    pos -= width * 4;
                }
                pos += width * 4;
                ++y;

                let reachLeft = false;
                let reachRight = false;

                while (y++ < height - 1 && matchStartColor(pos)) {
                    colorPixel(pos);

                    if (x > 0) {
                        if (matchStartColor(pos - 4)) {
                            if (!reachLeft) {
                                pixelStack.push([x - 1, y]);
                                reachLeft = true;
                            }
                        } else if (reachLeft) {
                            reachLeft = false;
                        }
                    }

                    if (x < width - 1) {
                        if (matchStartColor(pos + 4)) {
                            if (!reachRight) {
                                pixelStack.push([x + 1, y]);
                                reachRight = true;
                            }
                        } else if (reachRight) {
                            reachRight = false;
                        }
                    }
                    pos += width * 4;
                }
            }
            this.ctx.putImageData(imageData, 0, 0);
        }
    }

    class Scene_PixelArtMaker extends Scene_Base {
        create() {
            super.create();
            this.currentTool = 'pencil';
            this.currentColor = '#ffffff';
            this.isPanning = false;
            this._zones = [];
            this._pointer = { x: 0, y: 0 };
            // A press inherited from the scene that opened this one must not
            // land on a button the moment the editor appears.
            this._armed = false;
            this._heldOnUI = false;

            this.createBackground();
            this.createCanvas();
            this.createUI();
            this.bindPointerEvents();
        }

        terminate() {
            super.terminate();
            this.unbindPointerEvents();
            TouchInput.clear();
        }

        createBackground() {
            this.bg = new PIXI.Graphics();
            this.bg.beginFill(0x1e1e1e);
            this.bg.drawRect(0, 0, Graphics.width, Graphics.height);
            this.bg.endFill();
            this.addChild(this.bg);
        }

        createCanvas() {
            this.canvasContainer = new PixelCanvas(this);
            this.centerCanvas();
            this.addChild(this.canvasContainer);
        }

        createUI() {
            // Toolbar
            this.toolbar = new PIXI.Container();
            this.toolbar.x = 20;
            this.toolbar.y = 80;
            this.addChild(this.toolbar);

            TOOLS.forEach((tool, index) => {
                const btn = new UIButton(90, 40, T('PixelArt.tools.' + tool));
                btn.y = index * 50;
                btn.toolName = tool;
                this.toolbar.addChild(btn);
                this.addZone(btn, () => this.setTool(tool));
            });
            this.updateToolbarHighlight();

            // Palette
            const swatchesPerRow = 2;
            const swatchSize = 35;
            const padding = 5;

            this.paletteUI = new PIXI.Container();
            this.paletteUI.x = Graphics.width - 20 - (swatchesPerRow * (swatchSize + padding));
            this.paletteUI.y = 80;
            this.addChild(this.paletteUI);

            PALETTE.forEach((hex, index) => {
                const swatch = new PIXI.Graphics();
                swatch.beginFill(0xFFFFFF); // white bg for border
                swatch.drawRect(-1, -1, swatchSize + 2, swatchSize + 2);
                swatch.beginFill(hexToInt(hex));
                swatch.drawRect(0, 0, swatchSize, swatchSize);
                swatch.endFill();
                swatch.x = (index % swatchesPerRow) * (swatchSize + padding);
                swatch.y = Math.floor(index / swatchesPerRow) * (swatchSize + padding);
                swatch.boxWidth = swatchSize;
                swatch.boxHeight = swatchSize;
                this.paletteUI.addChild(swatch);
                this.addZone(swatch, () => this.setColor(hex));
            });

            // Current color indicator
            this.currentColorIndicator = new PIXI.Graphics();
            this.updateColorIndicator();
            this.currentColorIndicator.x = this.paletteUI.x;
            this.currentColorIndicator.y = 20;
            this.addChild(this.currentColorIndicator);

            // Topbar
            this.topbar = new PIXI.Container();
            this.addChild(this.topbar);

            SIZES.forEach((sz, index) => {
                const btn = new UIButton(70, 30, T('PixelArt.size', { size: sz }));
                btn.x = 20 + index * 80;
                btn.y = 20;
                this.topbar.addChild(btn);
                this.addZone(btn, () => {
                    this.canvasContainer.resizeCanvas(sz);
                    this.centerCanvas();
                });
            });

            const clearBtn = new UIButton(80, 30, T('PixelArt.clear'), 0xc0392b);
            clearBtn.x = 20 + SIZES.length * 80 + 20;
            clearBtn.y = 20;
            this.topbar.addChild(clearBtn);
            this.addZone(clearBtn, () => {
                this.canvasContainer.ctx.clearRect(0, 0, this.canvasContainer.canvasSize, this.canvasContainer.canvasSize);
                this.canvasContainer.texture.update();
            });

            const saveBtn = new UIButton(80, 30, T('PixelArt.save'), 0x27ae60);
            saveBtn.x = clearBtn.x + 90;
            saveBtn.y = 20;
            this.topbar.addChild(saveBtn);
            this.addZone(saveBtn, () => this.saveImage());

            const exitBtn = new UIButton(80, 30, T('PixelArt.exit'), 0x7f8c8d);
            exitBtn.x = saveBtn.x + 90;
            exitBtn.y = 20;
            this.topbar.addChild(exitBtn);
            this.addZone(exitBtn, () => this.popScene());
        }

        // Registers a display object's screen rectangle as clickable. Its
        // absolute position is summed up the parent chain, so a node has to be
        // added to an already-positioned parent before it is registered.
        addZone(node, onClick) {
            let x = 0;
            let y = 0;
            for (let n = node; n && n !== this; n = n.parent) {
                x += n.x;
                y += n.y;
            }
            this._zones.push({ x, y, w: node.boxWidth, h: node.boxHeight, node, onClick });
        }

        zoneAt(x, y) {
            return this._zones.find(z => x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h) || null;
        }

        centerCanvas() {
            this.canvasContainer.x = Graphics.width / 2 - (this.canvasContainer.canvasSize * this.canvasContainer.zoom) / 2;
            this.canvasContainer.y = Graphics.height / 2 - (this.canvasContainer.canvasSize * this.canvasContainer.zoom) / 2;
        }

        // --- Pointer plumbing -------------------------------------------------
        // TouchInput reports the left button only, so the middle/right button
        // used for panning is read from the document directly. The listeners
        // live and die with the scene.
        bindPointerEvents() {
            this._onDocMouseMove = e => this.setPointerFromPage(e.pageX, e.pageY);
            this._onDocMouseDown = e => {
                this.setPointerFromPage(e.pageX, e.pageY);
                if (e.button === 1 || e.button === 2) {
                    if (e.button === 1) e.preventDefault(); // no autoscroll cursor
                    this.startPan();
                }
            };
            this._onDocMouseUp = e => {
                if (e.button === 1 || e.button === 2) this.isPanning = false;
            };
            this._onDocTouch = e => {
                const touch = e.changedTouches && e.changedTouches[0];
                if (touch) this.setPointerFromPage(touch.pageX, touch.pageY);
            };
            document.addEventListener('mousemove', this._onDocMouseMove);
            document.addEventListener('mousedown', this._onDocMouseDown);
            document.addEventListener('mouseup', this._onDocMouseUp);
            document.addEventListener('touchstart', this._onDocTouch);
            document.addEventListener('touchmove', this._onDocTouch);
        }

        unbindPointerEvents() {
            if (this._onDocMouseMove) document.removeEventListener('mousemove', this._onDocMouseMove);
            if (this._onDocMouseDown) document.removeEventListener('mousedown', this._onDocMouseDown);
            if (this._onDocMouseUp) document.removeEventListener('mouseup', this._onDocMouseUp);
            if (this._onDocTouch) {
                document.removeEventListener('touchstart', this._onDocTouch);
                document.removeEventListener('touchmove', this._onDocTouch);
            }
            this._onDocMouseMove = this._onDocMouseDown = this._onDocMouseUp = this._onDocTouch = null;
        }

        setPointerFromPage(pageX, pageY) {
            this._pointer.x = Graphics.pageToCanvasX(pageX);
            this._pointer.y = Graphics.pageToCanvasY(pageY);
        }

        startPan() {
            this.isPanning = true;
            this.canvasContainer.endStroke();
            this.panStart = { x: this._pointer.x, y: this._pointer.y };
            this.containerStart = { x: this.canvasContainer.x, y: this.canvasContainer.y };
        }

        updatePan() {
            if (!this.isPanning) return;
            this.canvasContainer.x = this.containerStart.x + (this._pointer.x - this.panStart.x);
            this.canvasContainer.y = this.containerStart.y + (this._pointer.y - this.panStart.y);
        }

        updatePointer() {
            if (!this._armed) {
                if (!TouchInput.isPressed()) this._armed = true;
                return;
            }
            if (this.isPanning) return;

            const p = this._pointer;
            if (TouchInput.isTriggered()) {
                const zone = this.zoneAt(p.x, p.y);
                if (zone) {
                    this._heldOnUI = true;
                    zone.onClick();
                } else if (this.canvasContainer.contains(p.x, p.y)) {
                    this.canvasContainer.beginStroke(p.x, p.y);
                }
            } else if (TouchInput.isPressed()) {
                if (!this._heldOnUI) this.canvasContainer.continueStroke(p.x, p.y);
            } else {
                this._heldOnUI = false;
                this.canvasContainer.endStroke();
            }
        }

        updateHover() {
            const p = this._pointer;
            for (const zone of this._zones) {
                if (zone.node.setHovered) {
                    zone.node.setHovered(p.x >= zone.x && p.x < zone.x + zone.w &&
                                         p.y >= zone.y && p.y < zone.y + zone.h);
                }
            }
        }

        setTool(tool) {
            this.currentTool = tool;
            this.updateToolbarHighlight();
        }

        setColor(hex) {
            this.currentColor = hex;
            if (this.currentTool === 'eraser' || this.currentTool === 'picker') {
                this.setTool('pencil');
            }
            this.updateColorIndicator();
        }

        updateToolbarHighlight() {
            this.toolbar.children.forEach(btn => btn.setSelected(btn.toolName === this.currentTool));
        }

        updateColorIndicator() {
            this.currentColorIndicator.clear();
            this.currentColorIndicator.beginFill(hexToInt(this.currentColor));
            this.currentColorIndicator.lineStyle(2, 0xFFFFFF);
            this.currentColorIndicator.drawRect(0, 0, 75, 40);
            this.currentColorIndicator.endFill();
        }

        saveImage() {
            const dataURL = this.canvasContainer.htmlCanvas.toDataURL("image/png");
            const link = document.createElement('a');
            link.download = 'pixel_art.png';
            link.href = dataURL;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

        update() {
            super.update();

            // Esc / controller B exits the editor (parity with the on-screen Exit button).
            if (Input.isTriggered('cancel')) { this.popScene(); return; }

            this.updatePan();
            this.updateHover();
            this.updatePointer();

            if (TouchInput.wheelY < 0) {
                this.canvasContainer.zoom = Math.min(this.canvasContainer.zoom + 1, 30);
                this.canvasContainer.updateScale();
            } else if (TouchInput.wheelY > 0) {
                this.canvasContainer.zoom = Math.max(this.canvasContainer.zoom - 1, 1);
                this.canvasContainer.updateScale();
            }

            // Controller: left analog stick pans the canvas, right stick Y zooms.
            if (window.AnalogStickInput) {
                const ax = AnalogStickInput.leftX();
                const ay = AnalogStickInput.leftY();
                if (ax !== 0 || ay !== 0) {
                    const panSpeed = 14; // px/frame at full deflection
                    this.canvasContainer.x -= ax * panSpeed;
                    this.canvasContainer.y -= ay * panSpeed;
                }
                this._analogZoomCooldown = (this._analogZoomCooldown || 0) - 1;
                const ry = AnalogStickInput.rightY();
                if (ry !== 0 && this._analogZoomCooldown <= 0) {
                    if (ry < 0) this.canvasContainer.zoom = Math.min(this.canvasContainer.zoom + 1, 30); // up = zoom in
                    else this.canvasContainer.zoom = Math.max(this.canvasContainer.zoom - 1, 1);
                    this.canvasContainer.updateScale();
                    this._analogZoomCooldown = 8; // frames between integer zoom steps
                }
            }
        }
    }

    // =========================================================================
    // Pain: the HypernetOS paint program
    // =========================================================================
    // The Aseprite-style maker above is the pixel tool the debug menu opens.
    // This is the other one: a plain bitmap editor in a desktop window, with
    // the old paint layout (tool box on the left, colour box along the
    // bottom, primary and secondary colours on left and right click). Pictures
    // save into the virtual file system under C:/Pictures as PNG data and can
    // be put on the desktop as wallpaper.
    const PAINT_APP_ID = 'app-hypernet-paint';
    const PAINT_DIR = 'C:/Pictures';  // i18n-ignore  VFS path
    const PAINT_COLORS = [
        '#000000', '#808080', '#800000', '#808000', '#008000', '#008080', '#000080', '#800080',
        '#808040', '#004040', '#0080ff', '#004080', '#8000ff', '#804000',
        '#ffffff', '#c0c0c0', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff',
        '#ffff80', '#00ff80', '#80ffff', '#8080ff', '#ff0080', '#ff8040'
    ];
    const PAINT_TOOLS = ['pencil', 'brush', 'eraser', 'line', 'rect', 'ellipse', 'fill', 'picker', 'text'];
    const PAINT_W = 480, PAINT_H = 320;

    function paintHexToRgba(hex) {
        const n = parseInt(hex.replace('#', ''), 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
    }

    // Scanline flood fill on raw RGBA data. Returns how many pixels changed.
    function paintFloodFill(data, w, h, sx, sy, rgba) {
        if (sx < 0 || sy < 0 || sx >= w || sy >= h) return 0;
        const at = (x, y) => (y * w + x) * 4;
        const o = at(sx, sy);
        const target = [data[o], data[o + 1], data[o + 2], data[o + 3]];
        if (target[0] === rgba[0] && target[1] === rgba[1] && target[2] === rgba[2] && target[3] === rgba[3]) return 0;
        const same = (x, y) => {
            const i = at(x, y);
            return data[i] === target[0] && data[i + 1] === target[1] && data[i + 2] === target[2] && data[i + 3] === target[3];
        };
        const set = (x, y) => { const i = at(x, y); data[i] = rgba[0]; data[i + 1] = rgba[1]; data[i + 2] = rgba[2]; data[i + 3] = rgba[3]; };
        const stack = [[sx, sy]];
        let count = 0;
        while (stack.length) {
            const [x0, y] = stack.pop();
            let x = x0;
            while (x >= 0 && same(x, y)) x--;
            x++;
            let up = false, down = false;
            while (x < w && same(x, y)) {
                set(x, y); count++;
                if (y > 0) { const s = same(x, y - 1); if (s && !up) { stack.push([x, y - 1]); up = true; } else if (!s) up = false; }
                if (y < h - 1) { const s = same(x, y + 1); if (s && !down) { stack.push([x, y + 1]); down = true; } else if (!s) down = false; }
                x++;
            }
        }
        return count;
    }

    window.HypernetPaint = {
        COLORS: PAINT_COLORS,
        TOOLS: PAINT_TOOLS,
        DIR: PAINT_DIR,
        floodFill: paintFloodFill,
        hexToRgba: paintHexToRgba,
        _pending: null,

        // Writes a PNG data URL into the game root folder on the real disk.
        // Returns the full path written, or null when there is no node layer
        // (a browser build) or the write failed.
        writeToGameRoot: function(fileName, dataURL) {
            let nodeFs = null, nodePath = null;
            if (typeof require !== 'function') return null;
            try { nodeFs = require('fs'); nodePath = require('path'); } catch (e) { return null; }
            if (!nodeFs || !nodePath) return null;
            let base = '';
            try {
                if (typeof process !== 'undefined' && process.mainModule) base = nodePath.dirname(process.mainModule.filename);
                else if (typeof process !== 'undefined' && process.cwd) base = process.cwd();
            } catch (e) { return null; }
            if (!base) return null;
            const safe = String(fileName || 'untitled.png').replace(/[\/:*?"<>|]/g, '_');  // i18n-ignore  default file name
            const full = nodePath.join(base, /\.png$/i.test(safe) ? safe : safe + '.png');
            try {
                nodeFs.writeFileSync(full, String(dataURL).replace(/^data:image\/png;base64,/, ''), 'base64');
                return full;
            } catch (e) {
                console.warn('Pain: could not write picture to the game root:', e);
                return null;
            }
        },

        openFile: function(path) {
            const fs = window.HypernetFileSystem;
            const content = fs ? fs.readFile(path) : null;
            if (!content) return false;
            this._pending = { path, content };
            if (window.HypernetOS) window.HypernetOS.launchApp(PAINT_APP_ID);
            return true;
        },

        pictures: function() {
            const fs = window.HypernetFileSystem;
            if (!fs) return [];
            if (!fs.exists(PAINT_DIR)) fs.mkdir(PAINT_DIR);
            return (fs.readDir(PAINT_DIR) || []).filter(f => f.type === 'file' && /\.png$/i.test(f.name)).map(f => f.name);
        },

        launch: function() {
            const OS = window.HypernetOS;
            if (!OS || !OS.WindowManager) return;
            const T_ = (k, p) => T('PixelArt.paint.' + k, p);
            const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

            const html = `
                <div class="pain">
                    <div class="pain-menu">
                        <span class="pain-menu-item focusable" tabindex="0" id="pain-new">${T_('new')}</span>
                        <span class="pain-menu-item focusable" tabindex="0" id="pain-open">${T_('open')}</span>
                        <span class="pain-menu-item focusable" tabindex="0" id="pain-save">${T_('save')}</span>
                        <span class="pain-menu-item focusable" tabindex="0" id="pain-export">${T_('export')}</span>
                        <span class="pain-menu-item focusable" tabindex="0" id="pain-wallpaper">${T_('setWallpaper')}</span>
                        <span class="pain-menu-item focusable" tabindex="0" id="pain-undo">${T_('undo')}</span>
                        <span class="pain-menu-item focusable" tabindex="0" id="pain-redo">${T_('redo')}</span>
                    </div>
                    <div class="pain-main">
                        <div class="pain-tools">
                            ${PAINT_TOOLS.map(t => `<div class="pain-tool focusable" tabindex="0" data-tool="${t}" title="${esc(T_('tool.' + t))}"><span class="pain-tool-glyph pain-tool--${t}"></span></div>`).join('')}
                            <div class="pain-sizes">
                                ${[1, 3, 6, 10].map(s => `<div class="pain-size focusable" tabindex="0" data-size="${s}"><i style="height:${s}px"></i></div>`).join('')}
                            </div>
                        </div>
                        <div class="pain-canvas-wrap">
                            <canvas id="pain-canvas" width="${PAINT_W}" height="${PAINT_H}"></canvas>
                            <canvas id="pain-overlay" width="${PAINT_W}" height="${PAINT_H}"></canvas>
                        </div>
                    </div>
                    <div class="pain-colors">
                        <div class="pain-current"><div class="pain-primary" id="pain-primary"></div><div class="pain-secondary" id="pain-secondary"></div></div>
                        <div class="pain-palette">${PAINT_COLORS.map(c => `<div class="pain-swatch focusable" tabindex="0" data-color="${c}" style="background:${c}"></div>`).join('')}</div>
                        <input type="color" id="pain-custom" class="focusable" value="#ff8000" title="${esc(T_('custom'))}">
                    </div>
                    <div class="pain-status" id="pain-status"></div>
                </div>`;

            const win = OS.WindowManager.createWindow({ id: PAINT_APP_ID, title: T_('untitledTitle'), icon: 224, width: 640, height: 520, contentHTML: html });
            const pending = this._pending; this._pending = null;
            if (win._painBound) { if (pending) win._painLoad(pending); return; }
            win._painBound = true;

            const q = s => win.querySelector(s);
            const canvas = q('#pain-canvas'), overlay = q('#pain-overlay');
            const ctx = canvas.getContext('2d'), octx = overlay.getContext('2d');
            const st = { tool: 'pencil', size: 3, primary: '#000000', secondary: '#ffffff', path: null, undo: [], redo: [], drawing: false, start: null, color: '#000000' };

            const setTitle = () => {
                const name = st.path ? st.path.slice(st.path.lastIndexOf('/') + 1) : null;
                const title = name ? T_('title', { file: name }) : T_('untitledTitle');
                win.dataset.title = title;
                const tt = win.querySelector('.hypernet-window-title');
                if (tt) tt.innerHTML = win.dataset.iconHTML + ' ' + esc(title);
                if (OS.refreshTaskbarTabs) OS.refreshTaskbarTabs();
            };
            const status = msg => { q('#pain-status').textContent = msg; };
            const clear = () => { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, PAINT_W, PAINT_H); };
            const snapshot = () => { st.undo.push(ctx.getImageData(0, 0, PAINT_W, PAINT_H)); if (st.undo.length > 30) st.undo.shift(); st.redo.length = 0; };
            const undo = () => { if (!st.undo.length) return; st.redo.push(ctx.getImageData(0, 0, PAINT_W, PAINT_H)); ctx.putImageData(st.undo.pop(), 0, 0); };
            const redo = () => { if (!st.redo.length) return; st.undo.push(ctx.getImageData(0, 0, PAINT_W, PAINT_H)); ctx.putImageData(st.redo.pop(), 0, 0); };
            const paintColors = () => { q('#pain-primary').style.background = st.primary; q('#pain-secondary').style.background = st.secondary; };
            const selectTool = t => { st.tool = t; win.querySelectorAll('.pain-tool').forEach(el => el.classList.toggle('active', el.dataset.tool === t)); status(T_('tool.' + t)); };
            const selectSize = s => { st.size = s; win.querySelectorAll('.pain-size').forEach(el => el.classList.toggle('active', parseInt(el.dataset.size, 10) === s)); };

            win._painLoad = (file) => {
                const img = new Image();
                img.onload = () => { snapshot(); clear(); ctx.drawImage(img, 0, 0); st.path = file.path; setTitle(); status(T_('opened', { file: file.path })); };
                img.src = file.content;
            };

            clear();
            paintColors();
            selectTool('pencil');
            selectSize(3);
            setTitle();
            if (pending) win._painLoad(pending);

            const pos = e => {
                const r = canvas.getBoundingClientRect();
                return { x: Math.floor((e.clientX - r.left) * PAINT_W / r.width), y: Math.floor((e.clientY - r.top) * PAINT_H / r.height) };
            };
            const strokeStyle = (c) => { c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = st.size; c.strokeStyle = st.color; c.fillStyle = st.color; };
            const shape = (c, a, b) => {
                strokeStyle(c);
                c.beginPath();
                if (st.tool === 'line') { c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); }
                else if (st.tool === 'rect') { c.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)); }
                else if (st.tool === 'ellipse') { c.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2); c.stroke(); }
            };

            overlay.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); });
            overlay.addEventListener('mousedown', e => {
                e.stopPropagation();
                const p = pos(e);
                st.color = e.button === 2 ? st.secondary : st.primary;
                if (st.tool === 'picker') {
                    const d = ctx.getImageData(p.x, p.y, 1, 1).data;
                    const hex = '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('');
                    if (e.button === 2) st.secondary = hex; else st.primary = hex;
                    paintColors(); return;
                }
                snapshot();
                if (st.tool === 'fill') {
                    const img = ctx.getImageData(0, 0, PAINT_W, PAINT_H);
                    paintFloodFill(img.data, PAINT_W, PAINT_H, p.x, p.y, paintHexToRgba(st.color));
                    ctx.putImageData(img, 0, 0); return;
                }
                if (st.tool === 'text') {
                    const txt = prompt(T_('textPrompt'), '');
                    if (txt) { ctx.fillStyle = st.color; ctx.font = (12 + st.size * 2) + 'px Tahoma, sans-serif'; ctx.fillText(txt, p.x, p.y); }
                    return;
                }
                st.drawing = true; st.start = p; st.last = p;
                if (st.tool === 'pencil' || st.tool === 'brush' || st.tool === 'eraser') {
                    const w = st.tool === 'pencil' ? 1 : (st.tool === 'eraser' ? st.size * 2 : st.size);
                    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = w;
                    ctx.strokeStyle = st.tool === 'eraser' ? '#ffffff' : st.color;
                    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 0.1, p.y); ctx.stroke();
                }
            });
            overlay.addEventListener('mousemove', e => {
                const p = pos(e);
                status(p.x + ', ' + p.y);
                if (!st.drawing) return;
                if (st.tool === 'pencil' || st.tool === 'brush' || st.tool === 'eraser') {
                    ctx.beginPath(); ctx.moveTo(st.last.x, st.last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); st.last = p;
                } else {
                    octx.clearRect(0, 0, PAINT_W, PAINT_H); shape(octx, st.start, p);
                }
            });
            const finish = e => {
                if (!st.drawing) return;
                st.drawing = false;
                if (st.tool === 'line' || st.tool === 'rect' || st.tool === 'ellipse') {
                    octx.clearRect(0, 0, PAINT_W, PAINT_H); shape(ctx, st.start, pos(e));
                }
            };
            overlay.addEventListener('mouseup', finish);
            overlay.addEventListener('mouseleave', finish);

            win.querySelectorAll('.pain-tool').forEach(el => el.addEventListener('click', e => { e.stopPropagation(); selectTool(el.dataset.tool); }));
            win.querySelectorAll('.pain-size').forEach(el => el.addEventListener('click', e => { e.stopPropagation(); selectSize(parseInt(el.dataset.size, 10)); }));
            win.querySelectorAll('.pain-swatch').forEach(el => {
                el.addEventListener('click', e => { e.stopPropagation(); st.primary = el.dataset.color; paintColors(); });
                el.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); st.secondary = el.dataset.color; paintColors(); });
            });
            q('#pain-custom').addEventListener('input', e => { st.primary = e.target.value; paintColors(); });

            q('#pain-new').addEventListener('click', e => { e.stopPropagation(); snapshot(); clear(); st.path = null; setTitle(); });
            q('#pain-undo').addEventListener('click', e => { e.stopPropagation(); undo(); });
            q('#pain-redo').addEventListener('click', e => { e.stopPropagation(); redo(); });
            // Both boxes are the shell's own (window.HypernetOS.Dialog): a
            // browser prompt() over the desktop is the one thing this OS never
            // shows, and it cannot see the virtual file system either.
            const D = () => window.HypernetOS && window.HypernetOS.Dialog;
            const pngFilters = () => [
                { label: T('HypernetOS.xp.filebox.imageFiles'), ext: 'png' },
                { label: T('HypernetOS.xp.filebox.allFiles'), ext: '*' }
            ];
            const writeTo = (path) => {
                const fs = window.HypernetFileSystem;
                if (!fs.exists(PAINT_DIR)) fs.mkdir(PAINT_DIR);
                if (fs.writeFile(path, canvas.toDataURL('image/png'), 'png')) {
                    st.path = path; setTitle(); status(T_('saved', { file: path }));
                    if (window.SoundManager) SoundManager.playOk();
                    exportToGameRoot(path.slice(path.lastIndexOf('/') + 1), true);
                } else if (D()) D().error(T_('saveError'), T_('appName'));
            };
            // The picture also lands on the real disk, in the game root, so it
            // can be looked at outside the game. Silent when the save came from
            // the menu (the VFS save already reported), loud when asked for.
            const exportToGameRoot = (fileName, quiet) => {
                const written = window.HypernetPaint.writeToGameRoot(fileName, canvas.toDataURL('image/png'));
                if (written) {
                    if (!quiet) {
                        status(T_('exported', { file: written }));
                        if (window.SoundManager) SoundManager.playOk();
                    }
                } else if (!quiet && D()) {
                    D().error(T_('exportError'), T_('appName'));
                }
                return written;
            };
            q('#pain-save').addEventListener('click', e => {
                e.stopPropagation();
                const fs = window.HypernetFileSystem;
                if (!fs || !D()) return;
                if (st.path) { writeTo(st.path); return; }
                D().saveFileBox({
                    title: T_('appName'), path: PAINT_DIR,
                    fileName: 'untitled.png',   // i18n-ignore  default file name
                    filters: pngFilters()
                }).then(picked => {
                    if (!picked) return;
                    writeTo(picked.toLowerCase().endsWith('.png') ? picked : picked + '.png');
                });
            });
            q('#pain-export').addEventListener('click', e => {
                e.stopPropagation();
                const name = st.path ? st.path.slice(st.path.lastIndexOf('/') + 1) : 'untitled.png';  // i18n-ignore  default file name
                exportToGameRoot(name, false);
            });
            q('#pain-open').addEventListener('click', e => {
                e.stopPropagation();
                if (!D()) return;
                D().openFileBox({ title: T_('appName'), path: PAINT_DIR, filters: pngFilters() }).then(path => {
                    if (!path) return;
                    const content = window.HypernetFileSystem.readFile(path);
                    if (!content) { D().error(T_('openError'), T_('appName')); return; }
                    win._painLoad({ path, content });
                });
            });
            q('#pain-wallpaper').addEventListener('click', e => {
                e.stopPropagation();
                const fs = window.HypernetFileSystem;
                if (!fs) return;
                fs.setRegistry('wallpaper', 'url("' + canvas.toDataURL('image/png') + '") center / cover no-repeat');
                status(T_('wallpaperSet'));
                if (window.SoundManager) SoundManager.playOk();
            });
        }
    };

    function registerPaint() {
        if (!window.HypernetOS || !window.HypernetOS.registerApp) return false;
        window.HypernetOS.registerApp({
            id: PAINT_APP_ID,
            name: T('PixelArt.paint.appName'),
            icon: 224,
            category: 'accessories',
            launchFn: () => window.HypernetPaint.launch(),
            desktopShortcut: true
        });
        return true;
    }
    if (!registerPaint()) {
        const _Scene_Boot_create_paint = Scene_Boot.prototype.create;
        Scene_Boot.prototype.create = function() {
            _Scene_Boot_create_paint.call(this);
            registerPaint();
        };
    }

})();
