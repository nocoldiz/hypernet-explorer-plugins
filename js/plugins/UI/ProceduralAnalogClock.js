/*:
 * @target MZ
 * @plugindesc Procedural Clock System v2.0.0
 * @author Omni-Lex
 * @help
 * ============================================================================
 * Procedural Clock Plugin ,  generates unique clocks seeded by map + position
 * ============================================================================
 *
 * Clock types generated procedurally:
 *   - Analog (round, square, hexagon, octagon)
 *   - Digital LED / LCD / blue neon
 *   - Pendulum (grandfather clock style / orologio a pendolo)
 *   - Left-handed (orologio per mancini) ,  numbers + hands mirrored
 *
 * Number styles: Arabic, Roman, dots, none, mixed
 * Hand styles: classic, baton, diamond, ornate, needle
 * Frame styles: simple, ornate, double, gear, none
 *
 * Time source: Variable 113 (millisecond timestamp). Falls back to Date.now().
 *
 * Press OK / Cancel / Touch to dismiss the clock.
 *
 * @command showClock
 * @text Show Clock
 * @desc Shows the procedural clock for the calling event
 *
 * @command hideClock
 * @text Hide Clock
 * @desc Hides the current clock
 *
 * @command updateClockPosition
 * @text Update Clock Position
 * @arg x
 * @type number
 * @default 408
 * @arg y
 * @type number
 * @default 312
 *
 * @param timeVariableId
 * @text Time Variable ID
 * @type variable
 * @default 113
 *
 * @param clockSize
 * @text Base Clock Size (px)
 * @type number
 * @min 80
 * @max 600
 * @default 220
 *
 * @param clockOpacity
 * @text Clock Opacity (0-255)
 * @type number
 * @min 0
 * @max 255
 * @default 240
 */

(() => {
    'use strict';

    const pluginName = 'ProceduralAnalogClock';
    const params    = PluginManager.parameters(pluginName);
    const TIME_VAR  = Number(params['timeVariableId'] || 113);
    const BASE_SIZE = Number(params['clockSize']       || 220);
    const OPACITY   = Number(params['clockOpacity']    || 240);

    // ── Seeded RNG ───────────────────────────────────────────────────────────
    class RNG {
        constructor(seed) {
            this.s = (Math.abs(seed) % 2147483646) + 1;
        }
        next() {
            this.s = (this.s * 16807) % 2147483647;
            return (this.s - 1) / 2147483646;
        }
        int(lo, hi)    { return Math.floor(this.next() * (hi - lo + 1)) + lo; }
        float(lo, hi)  { return this.next() * (hi - lo) + lo; }
        pick(arr)      { return arr[this.int(0, arr.length - 1)]; }
    }

    // ── Config generator ─────────────────────────────────────────────────────
    class ClockConfig {
        constructor(mapId, ex, ey) {
            const seed = ((mapId * 73856093) ^ (ex * 19349663) ^ (ey * 83492791)) >>> 0;
            const rng  = new RNG(seed);

            this.type = rng.pick([
                'round','round','round','round',
                'square','hexagon','octagon',
                'pendulum','pendulum',
                'digital_led','digital_lcd','digital_blue',
            ]);

            this.isLeftHanded = rng.next() < 0.08;

            this.numberStyle = rng.pick([
                'arabic','arabic','arabic',
                'roman','roman',
                'dots','none','mixed',
            ]);

            this.colors = rng.pick([
                { bg:0xFFFBE8, frame:0x7A3B10, hands:0x2C1A08, nums:0x3A2A0A, accent:0xDAA520 }, // parchment
                { bg:0x111111, frame:0x484848, hands:0xFFD700, nums:0xF5D060, accent:0xFFD700 }, // noir
                { bg:0xE6F4FF, frame:0x3A78B8, hands:0x0A205A, nums:0x0A205A, accent:0x1E90FF }, // ocean
                { bg:0xFFF0F8, frame:0xB0106A, hands:0x6A0055, nums:0xC060A0, accent:0xFF69B4 }, // rose
                { bg:0xF0FFF4, frame:0x1A7A20, hands:0x0A4A10, nums:0x1A6A28, accent:0x32CD32 }, // forest
                { bg:0xFFFAF0, frame:0xAA1818, hands:0x6A0000, nums:0xCC1020, accent:0xFF5533 }, // crimson
                { bg:0x2A3A3A, frame:0xC8C8C8, hands:0xFFFFFF, nums:0xE8E8E8, accent:0xBBBBBB }, // slate
                { bg:0xFFFFF0, frame:0x606878, hands:0x1A1A1A, nums:0x2A2A2A, accent:0x808080 }, // ivory
                { bg:0xF5DEB3, frame:0x5C2A15, hands:0x2C0E04, nums:0x3A1A0A, accent:0xB8860B }, // antique
            ]);

            this.frameStyle   = rng.pick(['simple','simple','ornate','double','gear','none']);
            this.hourStyle    = rng.pick(['classic','classic','baton','diamond','ornate','spade']);
            this.minuteStyle  = rng.pick(['classic','baton','needle','ornate','spade']);
            this.hasSecond    = rng.next() < 0.65;
            this.secondStyle  = rng.pick(['thin','needle']);
            this.hasMinMark   = rng.next() < 0.75;
            this.hasHrTick    = rng.next() < 0.85;
            this.hasCenterDot = rng.next() < 0.88;
            this.sizeMult     = rng.float(0.85, 1.3);
            this.woodColor    = rng.pick([0x7A3B10, 0x5C2A15, 0x3A1A08, 0x9B5B22, 0x6B4020]);
        }
    }

    // ── 7-segment digit helper ────────────────────────────────────────────────
    //  segs order: [top, top-right, bot-right, bottom, bot-left, top-left, middle]
    const SEG_MAP = {
        0:[1,1,1,1,1,1,0], 1:[0,1,1,0,0,0,0], 2:[1,1,0,1,1,0,1],
        3:[1,1,1,1,0,0,1], 4:[0,1,1,0,0,1,1], 5:[1,0,1,1,0,1,1],
        6:[1,0,1,1,1,1,1], 7:[1,1,1,0,0,0,0], 8:[1,1,1,1,1,1,1],
        9:[1,1,1,1,0,1,1],
    };

    function drawDigit(g, digit, x, y, w, h, color, alpha) {
        const segs = SEG_MAP[digit] || SEG_MAP[0];
        const t  = Math.max(2, w * 0.14);
        const gp = 1.5;
        g.beginFill(color, alpha != null ? alpha : 1);
        // a top
        if (segs[0]) g.drawRect(x+gp,       y,           w-gp*2, t);
        // b top-right
        if (segs[1]) g.drawRect(x+w-t,      y+gp,        t, h/2-gp*2);
        // c bot-right
        if (segs[2]) g.drawRect(x+w-t,      y+h/2+gp,    t, h/2-gp*2);
        // d bottom
        if (segs[3]) g.drawRect(x+gp,       y+h-t,       w-gp*2, t);
        // e bot-left
        if (segs[4]) g.drawRect(x,          y+h/2+gp,    t, h/2-gp*2);
        // f top-left
        if (segs[5]) g.drawRect(x,          y+gp,        t, h/2-gp*2);
        // g middle
        if (segs[6]) g.drawRect(x+gp,       y+h/2-t/2,   w-gp*2, t);
        g.endFill();
    }

    // ── Main clock sprite ─────────────────────────────────────────────────────
    class Sprite_ProceduralClock extends PIXI.Container {
        constructor(mapId, ex, ey) {
            super();
            this.cfg  = new ClockConfig(mapId, ex, ey);
            this.size = BASE_SIZE * this.cfg.sizeMult;
            this.alpha = OPACITY / 255;
            this._build();
        }

        _build() {
            // dim backdrop so clock is readable against any map
            const backdrop = new PIXI.Graphics();
            backdrop.beginFill(0x000000, 0.45);
            const pad = this.size * 0.55;
            const bh  = this.cfg.type === 'pendulum' ? this.size * 1.1 : pad;
            backdrop.drawRoundedRect(-pad, -bh, pad * 2, bh * 2, 12);
            backdrop.endFill();
            this.addChild(backdrop);

            if (this.cfg.type.startsWith('digital')) {
                this._buildDigital();
            } else if (this.cfg.type === 'pendulum') {
                this._buildPendulum();
            } else {
                this._buildAnalog();
            }
        }

        // ── ANALOG ──────────────────────────────────────────────────────────
        _buildAnalog() {
            this.face = new PIXI.Container();
            this.addChild(this.face);
            this._drawBg();
            if (this.cfg.frameStyle !== 'none') this._drawFrame();
            if (this.cfg.hasHrTick)  this._drawHourTicks();
            if (this.cfg.hasMinMark) this._drawMinuteTicks();
            this._drawNumbers();
            this._drawHands();
            if (this.cfg.hasCenterDot) this._drawCenter();
            if (this.cfg.isLeftHanded) {
                this.face.scale.x = -1;
                this._reflipTexts(this.face);
            }
        }

        _drawBg() {
            const g = new PIXI.Graphics();
            g.beginFill(this.cfg.colors.bg);
            this._shape(g, this.size / 2);
            g.endFill();
            this.face.addChild(g);
        }

        _drawFrame() {
            const g  = new PIXI.Graphics();
            const r  = this.size / 2;
            const fw = Math.max(3, this.size / 18);
            switch (this.cfg.frameStyle) {
                case 'simple':
                    g.lineStyle(fw, this.cfg.colors.frame, 1);
                    this._shape(g, r);
                    break;
                case 'ornate':
                    g.lineStyle(fw * 2, this.cfg.colors.frame, 1);
                    this._shape(g, r);
                    g.lineStyle(fw * 0.6, this.cfg.colors.accent, 1);
                    this._shape(g, r - fw);
                    break;
                case 'double':
                    g.lineStyle(fw, this.cfg.colors.frame, 1);
                    this._shape(g, r);
                    g.lineStyle(fw * 0.5, this.cfg.colors.frame, 0.6);
                    this._shape(g, r - fw * 2.5);
                    break;
                case 'gear':
                    this._drawGear(g, r);
                    break;
            }
            this.face.addChild(g);
        }

        _drawGear(g, r) {
            const teeth = 18;
            const outer = r * 1.13;
            const pts = [];
            for (let i = 0; i < teeth; i++) {
                const a1 = (i        / teeth) * Math.PI * 2;
                const a2 = ((i+0.38) / teeth) * Math.PI * 2;
                const a3 = ((i+0.62) / teeth) * Math.PI * 2;
                const a4 = ((i+1)    / teeth) * Math.PI * 2;
                pts.push(Math.cos(a1)*r,     Math.sin(a1)*r);
                pts.push(Math.cos(a2)*outer, Math.sin(a2)*outer);
                pts.push(Math.cos(a3)*outer, Math.sin(a3)*outer);
                pts.push(Math.cos(a4)*r,     Math.sin(a4)*r);
            }
            g.beginFill(this.cfg.colors.frame);
            g.drawPolygon(pts);
            g.endFill();
            g.beginFill(this.cfg.colors.bg);
            g.drawCircle(0, 0, r - 1);
            g.endFill();
        }

        _drawHourTicks() {
            const g = new PIXI.Graphics();
            const r = this.size / 2;
            const tw = Math.max(2, r / 22);
            for (let i = 0; i < 12; i++) {
                const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
                g.lineStyle(tw, this.cfg.colors.frame, 1);
                g.moveTo(Math.cos(a) * r * 0.76, Math.sin(a) * r * 0.76);
                g.lineTo(Math.cos(a) * r * 0.91, Math.sin(a) * r * 0.91);
            }
            this.face.addChild(g);
        }

        _drawMinuteTicks() {
            const g = new PIXI.Graphics();
            const r = this.size / 2;
            g.lineStyle(Math.max(1, r / 55), this.cfg.colors.nums, 0.55);
            for (let i = 0; i < 60; i++) {
                if (i % 5 === 0) continue;
                const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
                g.moveTo(Math.cos(a) * r * 0.87, Math.sin(a) * r * 0.87);
                g.lineTo(Math.cos(a) * r * 0.93, Math.sin(a) * r * 0.93);
            }
            this.face.addChild(g);
        }

        _drawNumbers() {
            const style = this.cfg.numberStyle;
            if (style === 'none') return;
            const r   = this.size / 2;
            const ctr = new PIXI.Container();
            for (let i = 1; i <= 12; i++) {
                const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
                const d = r * 0.71;
                const x = Math.cos(a) * d;
                const y = Math.sin(a) * d;
                if (style === 'dots') {
                    const dot = new PIXI.Graphics();
                    dot.beginFill(this.cfg.colors.nums);
                    dot.drawCircle(x, y, r / 16);
                    dot.endFill();
                    ctr.addChild(dot);
                } else {
                    const t = this._makeNumText(i);
                    t.x = x; t.y = y;
                    ctr.addChild(t);
                }
            }
            this.face.addChild(ctr);
        }

        _makeNumText(n) {
            const style = this.cfg.numberStyle;
            const ROMAN = ['','I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
            let label;
            if (style === 'roman') {
                label = ROMAN[n];
            } else if (style === 'mixed') {
                label = (n % 3 === 0) ? ROMAN[n] : String(n);
            } else {
                label = String(n);
            }
            const fs = Math.max(10, this.size / 8.5);
            const ts = new PIXI.TextStyle({
                fontFamily: style === 'roman' ? '"Times New Roman", serif' : '"Arial", sans-serif',
                fontSize:   fs,
                fill:       this.cfg.colors.nums,
                fontWeight: 'bold',
                stroke:     this.cfg.colors.bg,
                strokeThickness: Math.max(1, fs * 0.14),
            });
            const t = new PIXI.Text(label, ts);
            t.anchor.set(0.5);
            return t;
        }

        _drawHands() {
            const r = this.size / 2;
            this.hHand = new PIXI.Graphics();
            this.mHand = new PIXI.Graphics();
            this._renderHand(this.hHand, this.cfg.hourStyle,   r * 0.48, r / 16, this.cfg.colors.hands);
            this._renderHand(this.mHand, this.cfg.minuteStyle, r * 0.68, r / 22, this.cfg.colors.hands);
            this.face.addChild(this.hHand);
            this.face.addChild(this.mHand);
            if (this.cfg.hasSecond) {
                this.sHand = new PIXI.Graphics();
                this._renderHand(this.sHand, this.cfg.secondStyle, r * 0.76, r / 55, this.cfg.colors.accent);
                this.face.addChild(this.sHand);
            }
        }

        _renderHand(g, style, len, w, color) {
            g.clear();
            switch (style) {
                case 'classic':
                case 'spade':
                    g.beginFill(color);
                    g.drawPolygon([
                         0,       w * 0.9,
                        -w * 0.7, 0,
                        -w * 0.35,-len * 0.82,
                         0,       -len,
                         w * 0.35,-len * 0.82,
                         w * 0.7,  0,
                    ]);
                    g.endFill();
                    // tail
                    g.beginFill(color, 0.7);
                    g.drawRect(-w * 0.4, 0, w * 0.8, len * 0.18);
                    g.endFill();
                    break;
                case 'baton':
                    g.beginFill(color);
                    g.drawRect(-w / 2, -len, w, len + w * 0.4);
                    g.endFill();
                    break;
                case 'diamond':
                    g.beginFill(color);
                    g.drawPolygon([
                         0,       w,
                        -w * 0.9, -len * 0.28,
                         0,       -len,
                         w * 0.9, -len * 0.28,
                    ]);
                    g.endFill();
                    break;
                case 'ornate':
                    g.beginFill(color);
                    g.drawRect(-w * 0.45, -len * 0.72, w * 0.9, len * 0.72);
                    g.drawPolygon([0,-len, -w*0.6,-len*0.72, w*0.6,-len*0.72]);
                    g.endFill();
                    g.beginFill(color, 0.4);
                    g.drawCircle(0, -len * 0.32, w * 1.1);
                    g.endFill();
                    g.beginFill(color);
                    g.drawRect(-w * 0.4, 0, w * 0.8, len * 0.2);
                    g.endFill();
                    break;
                case 'needle':
                case 'thin':
                    g.lineStyle(Math.max(1, w * 0.55), color, 1);
                    g.moveTo(0, w * 0.5);
                    g.lineTo(0, -len);
                    break;
            }
        }

        _drawCenter() {
            const r  = this.size / 2;
            const g  = new PIXI.Graphics();
            g.beginFill(this.cfg.colors.accent);
            g.drawCircle(0, 0, r / 13);
            g.endFill();
            g.beginFill(this.cfg.colors.bg);
            g.drawCircle(0, 0, r / 24);
            g.endFill();
            this.face.addChild(g);
        }

        // ── DIGITAL ─────────────────────────────────────────────────────────
        _buildDigital() {
            const type = this.cfg.type;
            let bgCol, digitCol, dimCol, borderCol;
            if (type === 'digital_led') {
                bgCol = 0x080808; digitCol = 0xFF2800; dimCol = 0x200400; borderCol = 0x2A2A2A;
            } else if (type === 'digital_blue') {
                bgCol = 0x03030F; digitCol = 0x00AAFF; dimCol = 0x000A18; borderCol = 0x002244;
            } else { // lcd
                bgCol = 0xC5D890; digitCol = 0x1A2A0A; dimCol = 0xB2C678; borderCol = 0x607040;
            }

            const dw = this.size * 0.24;
            const dh = this.size * 0.52;
            const gap = this.size * 0.06;
            // layout: D D : D D  (HH:MM), optionally SS below
            const totalW = dw * 4 + gap * 5 + this.size * 0.08; // 4 digits + colon space
            const totalH = dh + gap * 2;

            // Panel
            const panel = new PIXI.Graphics();
            panel.beginFill(bgCol);
            panel.drawRoundedRect(-totalW/2 - gap, -totalH/2 - gap, totalW + gap*2, totalH + gap*2, 10);
            panel.endFill();
            panel.lineStyle(3, borderCol, 1);
            panel.drawRoundedRect(-totalW/2 - gap, -totalH/2 - gap, totalW + gap*2, totalH + gap*2, 10);
            this.addChild(panel);

            // Ghost segments
            const ghostG = new PIXI.Graphics();
            const cols = [-totalW/2, -totalW/2+dw+gap*1.5, -totalW/2+dw*2+gap*3.5+this.size*0.08, -totalW/2+dw*3+gap*4+this.size*0.08];
            cols.forEach(cx => drawDigit(ghostG, 8, cx, -dh/2, dw, dh, dimCol));
            this.addChild(ghostG);

            this._dg = new PIXI.Graphics();
            this._cg = new PIXI.Graphics();
            this._dColor = digitCol;
            this._dCols  = cols;
            this._dW = dw; this._dH = dh;
            this._totalW = totalW;
            this.addChild(this._dg);
            this.addChild(this._cg);
        }

        _updateDigital(h24, min, sec) {
            // Only redraw the four 7-segment digits when the displayed value (h:mm)
            // actually changes - at most once per minute - instead of every frame.
            const digitKey = h24 * 100 + min;
            if (digitKey !== this._lastDigitKey) {
                this._lastDigitKey = digitKey;
                const g = this._dg;
                g.clear();
                const digits = [Math.floor(h24/10), h24%10, Math.floor(min/10), min%10];
                digits.forEach((d, i) => drawDigit(g, d, this._dCols[i], -this._dH/2, this._dW, this._dH, this._dColor));
            }

            // The colon blinks on second parity; only redraw it when parity flips.
            const colonOn = (sec % 2 === 0);
            if (colonOn !== this._lastColonOn) {
                this._lastColonOn = colonOn;
                const cg = this._cg;
                cg.clear();
                if (colonOn) {
                    const dr = this._dH * 0.09;
                    const colonX = (this._dCols[1] + this._dW + this._dCols[2]) / 2;
                    cg.beginFill(this._dColor);
                    cg.drawCircle(colonX, -this._dH * 0.16, dr);
                    cg.drawCircle(colonX,  this._dH * 0.16, dr);
                    cg.endFill();
                }
            }
        }

        // ── PENDULUM ─────────────────────────────────────────────────────────
        _buildPendulum() {
            const s   = this.size;
            const wd  = this.cfg.woodColor;
            const cW  = s * 0.82;
            const cH  = s * 1.65;

            // Outer case
            const caseG = new PIXI.Graphics();
            caseG.beginFill(wd);
            caseG.drawRoundedRect(-cW/2, -cH/2, cW, cH, 10);
            caseG.endFill();
            caseG.beginFill(this._lighten(wd, 28));
            caseG.drawRoundedRect(-cW/2+7, -cH/2+7, cW-14, cH-14, 7);
            caseG.endFill();

            // Glass window for pendulum
            const winTop = s * 0.06;
            const winH   = cH * 0.36;
            caseG.beginFill(0x88CCEE, 0.22);
            caseG.drawRect(-cW*0.28, winTop, cW*0.56, winH);
            caseG.endFill();
            caseG.lineStyle(2, this._darken(wd, 20), 1);
            caseG.drawRect(-cW*0.28, winTop, cW*0.56, winH);
            // cross bar on window
            caseG.moveTo(0, winTop);
            caseG.lineTo(0, winTop + winH);
            caseG.moveTo(-cW*0.28, winTop + winH/2);
            caseG.lineTo( cW*0.28, winTop + winH/2);
            this.addChild(caseG);

            // Embedded clock face (upper portion)
            this.face = new PIXI.Container();
            this.face.y = -cH * 0.26;
            this.addChild(this.face);

            const faceR = s * 0.32;
            const faceG = new PIXI.Graphics();
            faceG.beginFill(this.cfg.colors.bg);
            faceG.drawCircle(0, 0, faceR);
            faceG.endFill();
            faceG.lineStyle(Math.max(3, faceR / 9), wd, 1);
            faceG.drawCircle(0, 0, faceR);
            this.face.addChild(faceG);

            // Build clock content scaled to face
            const savedSize = this.size;
            this.size = faceR * 2;
            if (this.cfg.hasHrTick)  this._drawHourTicks();
            if (this.cfg.hasMinMark) this._drawMinuteTicks();
            this._drawNumbers();
            this._drawHands();
            if (this.cfg.hasCenterDot) this._drawCenter();
            this.size = savedSize;

            if (this.cfg.isLeftHanded) {
                this.face.scale.x = -1;
                this._reflipTexts(this.face);
            }

            // Pendulum
            this.pendulum = new PIXI.Container();
            this.pendulum.y = winTop + 4;
            this.addChild(this.pendulum);

            const pendG = new PIXI.Graphics();
            const rodLen = winH * 0.82;
            pendG.lineStyle(3, this._lighten(wd, 15), 1);
            pendG.moveTo(0, 0);
            pendG.lineTo(0, rodLen);
            pendG.beginFill(0xDAA520);
            pendG.drawEllipse(0, rodLen, s * 0.11, s * 0.055);
            pendG.endFill();
            pendG.lineStyle(1.5, 0xB8860B, 1);
            pendG.drawEllipse(0, rodLen, s * 0.11, s * 0.055);
            this.pendulum.addChild(pendG);
        }

        _lighten(hex, amt) {
            const r = Math.min(255, ((hex>>16)&0xFF)+amt);
            const g = Math.min(255, ((hex>>8)&0xFF)+amt);
            const b = Math.min(255, (hex&0xFF)+amt);
            return (r<<16)|(g<<8)|b;
        }
        _darken(hex, amt) { return this._lighten(hex, -amt); }

        // ── SHARED UTILS ─────────────────────────────────────────────────────
        _shape(g, r) {
            switch (this.cfg.type) {
                case 'square':   g.drawRect(-r, -r, r*2, r*2); break;
                case 'hexagon':  this._polygon(g, 6, r); break;
                case 'octagon':  this._polygon(g, 8, r); break;
                default:         g.drawCircle(0, 0, r);
            }
        }

        _polygon(g, sides, r) {
            const pts = [];
            for (let i = 0; i < sides; i++) {
                const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
                pts.push(Math.cos(a) * r, Math.sin(a) * r);
            }
            g.drawPolygon(pts);
        }

        _reflipTexts(node) {
            if (node instanceof PIXI.Text) { node.scale.x *= -1; return; }
            if (node.children) node.children.forEach(c => this._reflipTexts(c));
        }

        // ── UPDATE ───────────────────────────────────────────────────────────
        update() {
            const ts   = $gameVariables.value(TIME_VAR) || Date.now();
            const d    = new Date(ts);
            const h24  = d.getHours();
            const h12  = h24 % 12;
            const min  = d.getMinutes();
            const sec  = d.getSeconds();
            const ms   = d.getMilliseconds();

            if (this.cfg.type.startsWith('digital')) {
                this._updateDigital(h24, min, sec);
                return;
            }

            // Smooth angles
            const hRad = ((h12 + min/60) / 12) * Math.PI * 2 - Math.PI / 2;
            const mRad = ((min + sec/60)  / 60) * Math.PI * 2 - Math.PI / 2;
            const sRad = ((sec + ms/1000) / 60) * Math.PI * 2 - Math.PI / 2;

            if (this.hHand) this.hHand.rotation = hRad + Math.PI / 2;
            if (this.mHand) this.mHand.rotation = mRad + Math.PI / 2;
            if (this.sHand) this.sHand.rotation = sRad + Math.PI / 2;

            // For left-handed clocks the face.scale.x = -1 already mirrors hand motion
            // visually counterclockwise ,  no extra flip needed.

            // Pendulum swing
            if (this.pendulum) {
                const swing = Math.sin(Date.now() / 1000 * Math.PI * 1.6) * 0.28;
                this.pendulum.rotation = swing;
            }
        }
    }

    // ── Scene integration ─────────────────────────────────────────────────────
    let currentClock = null;

    function hideClock() {
        if (currentClock) {
            const s = SceneManager._scene;
            if (s && s._clockLayer) s._clockLayer.removeChild(currentClock);
            currentClock = null;
        }
        $gameSystem._clockShowing = false;
    }

    const _canMove = Game_Player.prototype.canMove;
    Game_Player.prototype.canMove = function() {
        if ($gameSystem._clockShowing) return false;
        return _canMove.call(this);
    };

    const _createDisplayObjects = Scene_Map.prototype.createDisplayObjects;
    Scene_Map.prototype.createDisplayObjects = function() {
        _createDisplayObjects.call(this);
        this._clockLayer = new PIXI.Container();
        this.addChild(this._clockLayer);
        // Reconcile stale state on load / map transfer: any prior clock sprite lived on a
        // now-detached scene layer, so drop the module reference and never leave the
        // canMove-blocking flag set without a visible, dismissible clock present.
        currentClock = null;
        if ($gameSystem && $gameSystem._clockShowing) $gameSystem._clockShowing = false;
    };

    const _sceneUpdate = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        _sceneUpdate.call(this);
        if (currentClock) {
            currentClock.update();
            if (Input.isTriggered('ok') || Input.isTriggered('cancel') || TouchInput.isTriggered()) {
                hideClock();
            }
        }
    };

    // Shows the clock seeded from an arbitrary (mapId, x, y), no event required.
    // Shared by the showClock plugin command and any other caller (e.g. a
    // terrain-feature "Clock" tile with no backing event, see
    // ProceduralTerrainInteractions.js).
    function showClockAt(mapId, x, y) {
        const scene = SceneManager._scene;
        if (!scene || !scene._clockLayer) return;
        if (currentClock) scene._clockLayer.removeChild(currentClock);

        currentClock   = new Sprite_ProceduralClock(mapId, x, y);
        currentClock.x = Graphics.width  / 2;
        currentClock.y = Graphics.height / 2;
        scene._clockLayer.addChild(currentClock);
        $gameSystem._clockShowing = true;
    }

    PluginManager.registerCommand(pluginName, 'showClock', () => {
        const interp = $gameMap && $gameMap._interpreter;
        const event  = interp ? $gameMap.event(interp.eventId()) : null;
        if (!event) return;
        showClockAt($gameMap.mapId(), event.x, event.y);
    });

    PluginManager.registerCommand(pluginName, 'hideClock', () => hideClock());

    PluginManager.registerCommand(pluginName, 'updateClockPosition', args => {
        if (currentClock) {
            currentClock.x = Number(args.x);
            currentClock.y = Number(args.y);
        }
    });

    window.ProceduralAnalogClock = { showAt: showClockAt, hideClock };
})();
