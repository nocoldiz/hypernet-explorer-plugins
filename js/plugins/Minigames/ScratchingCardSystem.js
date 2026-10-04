/*:
 * @target MZ
 * @plugindesc Scratching Card System v3.1.0 - a PSX-styled 3D rack of tickets you pick from, and a real 3D scratch card you turn in your hands.
 * @author Omni-Lex
 * @help
 * ============================================================================
 * Scratching Card System
 * ============================================================================
 *
 * A printed lottery card rendered in three.js. The ten prize panels are foil
 * that is rubbed away rather than flipped: every panel is independent, so the
 * player scratches them in whatever order they like, and the card itself can
 * be turned over in the light while they do it.
 *
 * The counter it is bought at is 3D as well: the four printed products stand
 * on a carousel and the one under the cursor turns on the spot, front to back,
 * so the player sees the ticket before paying for it. Both screens render
 * through the shared PSXShader (vertex snapping, banded colour, ordered dither
 * and a low-res upscale) with a PSXHud art deco overlay on the rack; the rack
 * takes the harsher dose, the ticket a lighter one because its face carries
 * type that has to stay legible.
 *
 * Controls
 *   Mouse       drag the card body or the background to turn it, rub across a
 *               panel to scratch it, click a panel to scratch it in one go,
 *               wheel to zoom.
 *   Keyboard    arrows choose a panel, OK scratches it, ESC scratches whatever
 *               is left, SHIFT recentres the card.
 *   Gamepad     d-pad / left stick choose, OK scratches, right stick turns the
 *               card, L1-R1 (or the analog triggers) zoom.
 *
 * On the rack: left/right (or the mouse) turn the carousel, OK buys the ticket
 * in front, ESC leaves the counter.
 *
 * Three matching symbols pay out. Gold conversion is 1 euro = 100 gold.
 *
 * Requires three.js (js/libs/three.min.js, loaded by index.html).
 *
 * @param cardCost
 * @text Card Cost (Gold)
 * @type number
 * @min 0
 * @desc Gold charged to play one card. Keep it above the ~500-575g average
 *       prize so the game keeps a house edge. 0 = free (exploitable).
 * @default 1000
 *
 * @param winVariableId
 * @text Win Amount Variable
 * @type variable
 * @desc Game variable that receives the last won amount. Set to 0 to disable.
 * @default 100
 *
 * @command openScratchCard
 * @text Open Scratch Card
 * @desc Opens the scratching card interface
 *
 * @arg style
 * @text Card Style
 * @type select
 * @option Esoteric
 * @value esoteric
 * @option Corporate
 * @value corporate
 * @option Vacation
 * @value vacation
 * @option Hypercapitalist
 * @value hypercapitalist
 * @default esoteric
 * @desc Select the style of scratch card
 *
 * @command openEsotericCard
 * @text Open Esoteric Card
 * @desc Opens an esoteric style scratch card
 *
 * @command openCorporateCard
 * @text Open Corporate Card
 * @desc Opens a corporate style scratch card
 *
 * @command openVacationCard
 * @text Open Vacation Card
 * @desc Opens a vacation style scratch card
 *
 * @command openHypercapitalistCard
 * @text Open Hypercapitalist Card
 * @desc Opens a hypercapitalist style scratch card
 */

(() => {
    'use strict';

    const pluginName = 'ScratchingCardSystem';
    const scParams = PluginManager.parameters(pluginName);
    // Stake charged per card. The average prize is ~500-575 gold, so a positive
    // cost is what keeps this from being an infinite-gold exploit on a repeatable
    // trigger event. Default 1000g gives a realistic ~55% RTP.
    const CARD_COST_GOLD = Number(scParams['cardCost'] != null ? scParams['cardCost'] : 1000);
    // Game variable that stores the last won amount (0 disables the write).
    const WIN_VARIABLE_ID = Number(scParams['winVariableId'] != null ? scParams['winVariableId'] : 100);

    const GOLD_PER_EURO = 100;

    // Bankroll dealt when the card is opened from the title screen's minigame
    // menu: 100 euros, enough for ten cards, re-dealt on every entry so a free
    // -play session always starts from the same stake.
    const FREEPLAY_GOLD = 100 * GOLD_PER_EURO;

    //=========================================================================
    // Small shared helpers
    //=========================================================================

    const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));
    const lerp = (a, b, t) => a + (b - a) * t;

    // Play an SE without ever letting a missing/bad file bubble an exception.
    function safePlaySe(se) {
        try {
            AudioManager.playSe(se);
        } catch (e) {
            /* missing audio must not break the game */
        }
    }

    // Money is printed on the card and in the banner, never spoken, so it is
    // grouped here rather than through a localized number formatter.
    function euroText(amount) {
        const fixed = Math.abs(Number(amount) || 0).toFixed(2);
        const dot = fixed.indexOf('.');
        const whole = fixed.slice(0, dot).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return whole + fixed.slice(dot);
    }

    function fontFace() {
        try {
            return $gameSystem.mainFontFace();
        } catch (e) {
            return 'sans-serif';
        }
    }

    // Symbol glyphs are dingbats the pixel fonts do not carry; the browser
    // falls back per glyph as long as a symbol face is in the stack.
    const SYMBOL_FONT = '"Segoe UI Symbol", "Arial Unicode MS", "DejaVu Sans", sans-serif';

    //=========================================================================
    // The retro dose. Both screens are 32-bit console styled, but not equally: the
    // rack is scenery and can take the full wobble, while the ticket in the
    // player's hands carries printed type and symbols that have to survive it.
    // Wrap BOTH the model building (the tunables are baked into the material at
    // patch time) and the render call (downscale is read live) in these.
    //=========================================================================
    function rackPSX(fn) {
        if (!window.PSXShader || !window.PSXShader.withScale) return fn();
        return window.PSXShader.withScale(
            { vertexSnap: 0.5, colorLevels: 0.5, dither: 2.0, downscale: 0.68 },
            fn
        );
    }

    function cardPSX(fn) {
        if (!window.PSXShader || !window.PSXShader.withScale) return fn();
        return window.PSXShader.withScale(
            { vertexSnap: 0.8, colorLevels: 0.75, dither: 1.5, downscale: 0.85 },
            fn
        );
    }

    // --- Theme helpers: pull live colours from the active CSS theme so the
    //     HUD matches whatever vars.css / themes preset is currently injected.
    function readThemeVar(name) {
        try {
            const v = getComputedStyle(document.documentElement).getPropertyValue(name);
            return v ? v.trim() : '';
        } catch (e) {
            return '';
        }
    }

    // Return the first theme var that resolves to something, else the fallback.
    function themeColor(names, fallback) {
        const list = Array.isArray(names) ? names : [names];
        for (let i = 0; i < list.length; i++) {
            const v = readThemeVar(list[i]);
            if (v) return v;
        }
        return fallback;
    }

    function buildTheme() {
        return {
            panel:      themeColor('--bg-panel', '#e2dac6'),
            frame:      themeColor('--border-subtle', '#4a2711'),
            title:      themeColor(['--text-primary-hover', '--accent-red'], '#58180D'),
            text:       themeColor(['--text-brown-medium', '--text-info'], '#6b5242'),
            textStrong: themeColor('--text-brown-dark', '#3a1f0f'),
            accent:     themeColor(['--border-focus-hover', '--accent-gold-pure'], '#8b5a2b'),
            winBox:     themeColor('--border-forest-green', '#2a6e4a'),
            winText:    themeColor('--accent-cream-lightest', '#fff4d2'),
            loseBox:    themeColor('--accent-red-warm-dark', '#7a241b'),
            loseText:   themeColor('--accent-cream-lightest', '#fff4d2'),
            shadow:     themeColor('--shadow-black-translucent-30', 'rgba(0, 0, 0, 0.30)')
        };
    }

    //=========================================================================
    // Card styles. Each one is a whole printed product: its own symbol set,
    // paper stock, ink, foil and the counter it is played on.
    //=========================================================================
    const cardStyles = {
        esoteric: {
            titleKey: 'esoteric',
            symbols: ["★", "☆", "♦", "♣", "♠", "♥", "♚", "♛", "✦", "✚"],
            paper: '#e9dcc0', paperEdge: '#cbbb96', ink: '#2b1a3d',
            accent: '#7b3fbf', accentDark: '#3d1f66',
            foil: 0x7a68a0, foilTex: 'iridescent_oil.jpg',
            deskTex: 'dark_brown_marble.jpg', deskTint: 0x4a3d58,
            fog: 0x100a1c, key: 0xffeedd, fill: 0x7f5cd0,
            maxWin: 10000
        },
        corporate: {
            titleKey: 'corporate',
            symbols: ["▲", "▼", "◆", "■", "□", "●", "○", "★", "☆", "◇"],
            paper: '#eef2f5', paperEdge: '#c3ccd6', ink: '#11283f',
            accent: '#0d6f9e', accentDark: '#083a54',
            foil: 0x8fa4b4, foilTex: 'grey_concrete.jpg',
            deskTex: 'grey_marble.jpg', deskTint: 0x53616e,
            fog: 0x081018, key: 0xf2f8ff, fill: 0x2f7fb8,
            maxWin: 500000
        },
        vacation: {
            titleKey: 'vacation',
            symbols: ["♠", "♣", "♥", "♦", "★", "☆", "●", "○", "◆", "■"],
            paper: '#fff3d6', paperEdge: '#e2c99a', ink: '#1d4f52',
            accent: '#e07a2b', accentDark: '#9c4a10',
            foil: 0xd9b489, foilTex: 'sandstone.jpg',
            deskTex: 'teal_marble.jpg', deskTint: 0x2f7d84,
            fog: 0x06212a, key: 0xfff0cf, fill: 0x21b0c0,
            maxWin: 500000
        },
        hypercapitalist: {
            titleKey: 'hypercapitalist',
            symbols: ["♔", "♕", "♖", "♗", "♘", "♙", "★", "◆", "●", "▲"],
            paper: '#1c1410', paperEdge: '#0d0806', ink: '#f2d489',
            accent: '#e8b825', accentDark: '#7a5c08',
            foil: 0xc9a227, foilTex: 'dark_gold_foil.jpg',
            deskTex: 'red_marble.jpg', deskTint: 0x5c2020,
            fog: 0x150404, key: 0xffe6a8, fill: 0xd03a2a,
            maxWin: 500000
        }
    };

    // Prize tiers
    const prizeTiers = {
        standard: [
            { euros: 0, odds: 0.65 },
            { euros: 3, odds: 0.15 },
            { euros: 5, odds: 0.10 },
            { euros: 10, odds: 0.05 },
            { euros: 20, odds: 0.025 },
            { euros: 50, odds: 0.015 },
            { euros: 100, odds: 0.008 },
            { euros: 500, odds: 0.0015 },
            { euros: 1000, odds: 0.0004 },
            { euros: 5000, odds: 0.00008 },
            { euros: 10000, odds: 0.000015 },
            { euros: 50000, odds: 0.0000045 },
            { euros: 100000, odds: 0.0000005 },
            { euros: 500000, odds: 0.0000001 }
        ],
        esoteric: [
            { euros: 0, odds: 0.65 },
            { euros: 3, odds: 0.15 },
            { euros: 5, odds: 0.10 },
            { euros: 10, odds: 0.05 },
            { euros: 20, odds: 0.025 },
            { euros: 50, odds: 0.015 },
            { euros: 100, odds: 0.008 },
            { euros: 500, odds: 0.0015 },
            { euros: 1000, odds: 0.0004 },
            { euros: 5000, odds: 0.00008 },
            { euros: 10000, odds: 0.000002 }
        ]
    };

    //=========================================================================
    // Card layout, in card-local units. The printed face texture and the 3D
    // foil panels are laid out from these same numbers, so a printed symbol
    // always sits exactly under the panel that hides it.
    //=========================================================================
    const CARD = {
        w: 2.6, h: 1.62, t: 0.035,
        cols: 5, rows: 2,
        panelW: 0.38, panelH: 0.38,
        gapX: 0.085, gapY: 0.09,
        gridY: -0.22,
        faceW: 1024, faceH: 638,
        foilSize: 256
    };
    CARD.gridW = CARD.cols * CARD.panelW + (CARD.cols - 1) * CARD.gapX;
    CARD.gridH = CARD.rows * CARD.panelH + (CARD.rows - 1) * CARD.gapY;
    CARD.count = CARD.cols * CARD.rows;

    // Centre of a cell, in card-local coordinates (origin at the card centre,
    // +x right, +y up).
    function cellCenter(index) {
        const row = Math.floor(index / CARD.cols);
        const col = index % CARD.cols;
        return {
            x: -CARD.gridW / 2 + CARD.panelW / 2 + col * (CARD.panelW + CARD.gapX),
            y: CARD.gridY + CARD.gridH / 2 - CARD.panelH / 2 - row * (CARD.panelH + CARD.gapY)
        };
    }

    // Card-local units to face-texture pixels.
    const faceX = (x) => (x + CARD.w / 2) / CARD.w * CARD.faceW;
    const faceY = (y) => (CARD.h / 2 - y) / CARD.h * CARD.faceH;
    const faceLen = (len) => len / CARD.w * CARD.faceW;

    //=========================================================================
    // The print job. These draw in FACE SPACE (CARD.faceW x CARD.faceH), so the
    // ticket in the player's hands and the sealed products standing on the rack
    // are the same printing, pulled at two different sizes: a caller working at
    // another resolution scales the context and draws in these units.
    //=========================================================================

    // Paper stock, the guilloche rosette, the tooth of the stock and the two
    // frames every printed ticket wears.
    function drawTicketPaper(ctx, style) {
        const w = CARD.faceW;
        const h = CARD.faceH;
        ctx.fillStyle = style.paper;
        ctx.fillRect(0, 0, w, h);

        ctx.save();
        ctx.globalAlpha = 0.16;
        ctx.strokeStyle = style.accent;
        ctx.lineWidth = 1;
        for (let ring = 0; ring < 26; ring++) {
            ctx.beginPath();
            const rr = 40 + ring * 13;
            for (let a = 0; a <= 96; a++) {
                const t = (a / 96) * Math.PI * 2;
                const wob = 1 + 0.09 * Math.sin(t * 7 + ring * 0.6);
                const x = w / 2 + Math.cos(t) * rr * wob;
                const y = h / 2 + Math.sin(t) * rr * wob * 0.62;
                if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = 0.06;
        for (let i = 0; i < 2600; i++) {
            ctx.fillStyle = i % 2 ? '#000000' : '#ffffff';
            ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
        }
        ctx.restore();

        ctx.strokeStyle = style.accentDark;
        ctx.lineWidth = 8;
        ctx.strokeRect(10, 10, w - 20, h - 20);
        ctx.strokeStyle = style.accent;
        ctx.lineWidth = 3;
        ctx.strokeRect(24, 24, w - 48, h - 48);
    }

    // Marquee, the rule of the game, the stake and the top prize.
    function drawTicketHeader(ctx, style) {
        const w = CARD.faceW;
        const face = fontFace();
        const title = T('ScratchingCard.title.' + style.titleKey);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = style.accentDark;
        ctx.font = 'bold 62px ' + face;
        ctx.fillText(title, w / 2 + 3, 78 + 3);
        ctx.fillStyle = style.accent;
        ctx.fillText(title, w / 2, 78);

        ctx.font = '26px ' + face;
        ctx.fillStyle = style.ink;
        ctx.globalAlpha = 0.85;
        ctx.fillText(T('ScratchingCard.matchThree'), w / 2, 128);
        ctx.globalAlpha = 1;

        ctx.font = 'bold 24px ' + face;
        ctx.textAlign = 'left';
        ctx.fillStyle = style.ink;
        ctx.fillText(T('ScratchingCard.stake', { cost: euroText(CARD_COST_GOLD / GOLD_PER_EURO) }), 48, 78);
        ctx.textAlign = 'right';
        ctx.fillText(T('ScratchingCard.topPrize', { amount: euroText(style.maxWin) }), w - 48, 78);
    }

    // Serial on the left, a printed barcode on the right.
    function drawTicketFooter(ctx, style, serial) {
        const w = CARD.faceW;
        const h = CARD.faceH;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.font = '20px ' + fontFace();
        ctx.fillStyle = style.ink;
        ctx.globalAlpha = 0.8;
        ctx.fillText(T('ScratchingCard.serial', { serial: serial }), 48, h - 34);
        ctx.globalAlpha = 1;

        let bx = w - 300;
        for (let i = 0; i < 46; i++) {
            const bw = 1 + (i * 7919 % 3);
            ctx.fillStyle = style.ink;
            ctx.globalAlpha = 0.75;
            ctx.fillRect(bx, h - 56, bw, 30);
            bx += bw + 2 + (i * 104729 % 3);
        }
        ctx.globalAlpha = 1;
    }

    // A prize window and the symbol printed in it, in face space.
    function drawPrizeWindow(ctx, style, index, symbol) {
        const c = cellCenter(index);
        const x = faceX(c.x - CARD.panelW / 2);
        const y = faceY(c.y + CARD.panelH / 2);
        const wpx = faceLen(CARD.panelW);
        const hpx = faceLen(CARD.panelH);

        // A recessed well, so a scratched panel still reads as a window.
        ctx.fillStyle = 'rgba(0,0,0,0.16)';
        ctx.fillRect(x - 4, y - 4, wpx + 8, hpx + 8);
        ctx.fillStyle = style.paper;
        ctx.fillRect(x, y, wpx, hpx);
        ctx.strokeStyle = style.accentDark;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, wpx - 2, hpx - 2);

        ctx.save();
        ctx.globalAlpha = 0.1;
        ctx.strokeStyle = style.accent;
        ctx.lineWidth = 1;
        for (let i = -Math.round(hpx); i < wpx; i += 7) {
            ctx.beginPath();
            ctx.moveTo(x + i, y + hpx);
            ctx.lineTo(x + i + hpx, y);
            ctx.stroke();
        }
        ctx.restore();

        if (symbol) {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold ' + Math.round(hpx * 0.62) + 'px ' + SYMBOL_FONT;
            ctx.fillStyle = style.ink;
            ctx.fillText(symbol, x + wpx / 2, y + hpx / 2 + 2);
        }
    }

    // Unrubbed foil: brushed metal, a bevel, the house mark and the panel
    // number. Drawn over the whole of the context's (w, h), so a caller can put
    // it on its own 256px canvas (the scratchable panel) or straight onto a
    // printed face under a transform (a sealed product on the rack).
    function drawFoilFace(ctx, w, h, style, index, opts) {
        const o = opts || {};
        if (o.clear !== false) ctx.clearRect(0, 0, w, h);

        ctx.fillStyle = '#b9b9c4';
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 420; i++) {
            const y = Math.random() * h;
            ctx.globalAlpha = 0.05 + Math.random() * 0.12;
            ctx.fillStyle = Math.random() < 0.5 ? '#ffffff' : '#5c5c68';
            ctx.fillRect(0, y, w, 1 + Math.random() * 2);
        }
        ctx.globalAlpha = 1;

        // A darker bevel so a whole panel reads as a raised patch.
        const grad = ctx.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, 'rgba(255,255,255,0.35)');
        grad.addColorStop(0.5, 'rgba(255,255,255,0.0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.30)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = 'rgba(40,40,50,0.55)';
        ctx.lineWidth = 8;
        ctx.strokeRect(4, 4, w - 8, h - 8);

        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = '#3a3a46';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold ' + Math.round(h * 0.46) + 'px ' + SYMBOL_FONT;
        ctx.fillText(style.symbols[index % style.symbols.length], w / 2, h / 2);
        ctx.globalAlpha = 0.55;
        ctx.font = 'bold 34px ' + fontFace();
        ctx.fillText(String(index + 1), w / 2, h - 40);
        ctx.restore();
    }

    // The back of the ticket: the house mark tiled so the face cannot be read
    // through it, and the small print as illegible rules.
    function drawTicketBack(ctx, w, h, style) {
        ctx.fillStyle = style.accentDark;
        ctx.fillRect(0, 0, w, h);

        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = style.accent;
        ctx.font = '26px ' + SYMBOL_FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const mark = style.symbols[0];
        for (let y = 20; y < h; y += 42) {
            for (let x = 20 + ((y / 42) % 2) * 21; x < w; x += 42) {
                ctx.fillText(mark, x, y);
            }
        }
        ctx.restore();

        ctx.strokeStyle = style.accent;
        ctx.lineWidth = 6;
        ctx.strokeRect(12, 12, w - 24, h - 24);

        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = style.paper;
        for (let i = 0; i < 9; i++) {
            ctx.fillRect(40, h - 96 + i * 9, (w - 80) * (0.55 + ((i * 37) % 40) / 100), 3);
        }
        ctx.restore();
    }

    // A whole sealed product: the print job with every panel still under foil.
    // Drawn to fit whatever canvas it is given.
    function drawSealedTicket(ctx, w, h, style, serial) {
        ctx.save();
        ctx.scale(w / CARD.faceW, h / CARD.faceH);
        drawTicketPaper(ctx, style);
        drawTicketHeader(ctx, style);
        for (let i = 0; i < CARD.count; i++) {
            drawPrizeWindow(ctx, style, i, null);
            const c = cellCenter(i);
            const px = faceX(c.x - CARD.panelW / 2);
            const py = faceY(c.y + CARD.panelH / 2);
            const size = faceLen(CARD.panelW);
            ctx.save();
            ctx.translate(px, py);
            ctx.scale(size / CARD.foilSize, size / CARD.foilSize);
            drawFoilFace(ctx, CARD.foilSize, CARD.foilSize, style, i, { clear: false });
            ctx.restore();
        }
        drawTicketFooter(ctx, style, serial);
        ctx.restore();
    }

    // The serial printed on a product standing on the rack. Derived from the
    // style key so a given ticket always wears the same number on the shelf.
    function displaySerial(styleKey) {
        let n = 0;
        for (let i = 0; i < styleKey.length; i++) n = (n * 131 + styleKey.charCodeAt(i)) >>> 0;
        return String(10000000 + (n % 90000000));
    }

    //=========================================================================
    // ScratchCardModel - the ticket itself: what is printed on it and what it
    // pays. Kept apart from the renderer so the economy stays readable.
    //=========================================================================
    class ScratchCardModel {
        constructor(styleKey) {
            this.styleKey = cardStyles[styleKey] ? styleKey : 'esoteric';
            this.style = cardStyles[this.styleKey];
            this.cells = [];
            this.revealed = [];
            this.winIndices = [];
            this.wonAmount = this.generatePrize();
            this.serial = String(Math.floor(Math.random() * 90000000) + 10000000);
            this.build();
        }

        build() {
            const symbols = this.style.symbols;
            for (let i = 0; i < CARD.count; i++) {
                this.cells.push(symbols[Math.floor(Math.random() * symbols.length)]);
                this.revealed.push(false);
            }

            if (this.wonAmount > 0) {
                // A paying card must show its trio.
                const winSymbol = symbols[Math.floor(Math.random() * symbols.length)];
                while (this.winIndices.length < 3) {
                    const pos = Math.floor(Math.random() * CARD.count);
                    if (!this.winIndices.includes(pos)) {
                        this.winIndices.push(pos);
                        this.cells[pos] = winSymbol;
                    }
                }
            } else {
                // Losing card: make sure no symbol accidentally appears 3+ times,
                // which would display a winning pattern while paying nothing.
                this.suppressAccidentalWins();
            }
        }

        // Reduce any symbol that occurs 3+ times down to at most 2 occurrences by
        // reassigning extras to a symbol that keeps every count below 3.
        suppressAccidentalWins() {
            const symbols = this.style.symbols;
            const countOf = (sym) => this.cells.filter(c => c === sym).length;
            // Bounded passes: on each pass, reassign one extra occurrence of any
            // symbol appearing 3+ times to whichever other symbol currently has
            // the lowest count. Repeat until no symbol reaches 3 (or we run out
            // of room to rearrange).
            let guard = this.cells.length * symbols.length + 1;
            while (guard-- > 0) {
                const offenderIndex = this.cells.findIndex(c => countOf(c) >= 3);
                if (offenderIndex === -1) break;
                const offender = this.cells[offenderIndex];
                // Pick the least-frequent alternative symbol that keeps counts low.
                let replacement = null;
                let bestCount = Infinity;
                for (const s of symbols) {
                    if (s === offender) continue;
                    const c = countOf(s);
                    if (c < bestCount) { bestCount = c; replacement = s; }
                }
                // No alternative can stay under 3 -> can't fix further; bail out.
                if (!replacement || bestCount >= 2) break;
                this.cells[offenderIndex] = replacement;
            }
        }

        generatePrize() {
            const tiers = this.styleKey === 'esoteric' ? prizeTiers.esoteric : prizeTiers.standard;
            const roll = Math.random();
            let cumulative = 0;

            for (const tier of tiers) {
                cumulative += tier.odds;
                if (roll <= cumulative) {
                    return tier.euros;
                }
            }

            return 0;
        }

        remaining() {
            return this.revealed.filter(r => !r).length;
        }

        isComplete() {
            return this.remaining() === 0;
        }
    }

    //=========================================================================
    // ThreeStage - the bookkeeping both three.js views share: tracked
    // disposables, the material and texture factories, and a teardown that
    // gives the GPU everything back (the retro pass hangs a render target off
    // the renderer, so that goes too).
    //=========================================================================
    class ThreeStage {
        constructor() {
            this._disposables = [];
        }

        _track(obj) { this._disposables.push(obj); return obj; }

        // kind: 'phong' for anything that has to catch the light, 'basic' for
        // the unlit overlays, Lambert otherwise.
        _mat(opts, kind) {
            let m;
            if (kind === 'phong') m = new THREE.MeshPhongMaterial(opts);
            else if (kind === 'basic') m = new THREE.MeshBasicMaterial(opts);
            else m = new THREE.MeshLambertMaterial(opts);
            this._disposables.push(m);
            return m;
        }

        _canvas(w, h, draw) {
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            if (draw) draw(canvas.getContext('2d'), w, h);
            return canvas;
        }

        _canvasTexture(w, h, draw, smooth) {
            const tex = new THREE.CanvasTexture(this._canvas(w, h, draw));
            if (!smooth) {
                tex.magFilter = THREE.NearestFilter;
                tex.minFilter = THREE.NearestFilter;
                tex.generateMipmaps = false;
            } else {
                tex.anisotropy = 4;
            }
            this._disposables.push(tex);
            return tex;
        }

        _fileTexture(name, repeat) {
            if (!THREE.TextureLoader) return null;
            const tex = new THREE.TextureLoader().load('img/textures/' + name);
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            if (repeat) tex.repeat.set(repeat, repeat);
            this._disposables.push(tex);
            return tex;
        }

        dispose() {
            for (const item of this._disposables) {
                if (item && item.dispose) {
                    try { item.dispose(); } catch (e) { /* already gone */ }
                }
            }
            this._disposables.length = 0;
            try {
                if (window.PSXShader && window.PSXShader.disposeContext) {
                    window.PSXShader.disposeContext(this.renderer);
                }
                this.renderer.dispose();
                this.renderer.forceContextLoss();
            } catch (e) { /* context already gone */ }
        }
    }

    //=========================================================================
    // ScratchCard3D - the counter, the card and the foil. Renders to its own
    // canvas, which the scene composites as a PIXI sprite (the same approach
    // the tarot table and the bowling lane use).
    //=========================================================================
    class ScratchCard3D extends ThreeStage {
        constructor(width, height, model) {
            super();
            this._w = width;
            this._h = height;
            this.model = model;
            this.style = model.style;
            this.panels = [];
            this._time = 0;
            this._flakes = null;
            this._winRings = [];
            this._celebrate = 0;

            // Hand pose. yaw/pitch are the card's own rotation, not the camera's:
            // the player turns the ticket, the counter stays put.
            this.yaw = 0;
            this.pitch = 0;
            this.targetYaw = 0;
            this.targetPitch = 0;
            this.dist = 3.35;
            this.targetDist = 3.35;

            this._initThree();
            // The whole counter is a 32-bit console picture, ticket included: the
            // printed face loses its filtering to the retro pass, which is the
            // point. The dose is the lighter one so the symbols stay readable.
            cardPSX(() => {
                this._buildCounter();
                this._buildCard();
                this._buildPanels();
                this._buildCursor();
                this._buildFlakes();
                if (window.PSXShader) window.PSXShader.applyToObject(this.scene);
            });

            this._raycaster = new THREE.Raycaster();
            this.updateCamera(1);
        }

        get domElement() { return this.renderer.domElement; }

        //--- setup ----------------------------------------------------------

        _initThree() {
            const fog = this.style.fog;
            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color(fog);
            this.scene.fog = new THREE.Fog(fog, 4.5, 13);

            this.camera = new THREE.PerspectiveCamera(42, this._w / this._h, 0.05, 40);
            this.camera.position.set(0, 0.42, this.dist);

            // No antialiasing: the picture is quantised, downsampled and blown
            // back up again, so smoothing the edges first only costs fill rate.
            this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
            this.renderer.setPixelRatio(1);
            this.renderer.setSize(this._w, this._h);
            this.renderer.setClearColor(fog, 1);

            this.scene.add(new THREE.AmbientLight(0x555566, 0.75));

            const key = new THREE.DirectionalLight(this.style.key, 0.95);
            key.position.set(2.4, 3.2, 3.4);
            this.scene.add(key);

            const fill = new THREE.DirectionalLight(this.style.fill, 0.4);
            fill.position.set(-3.2, 1.0, 1.8);
            this.scene.add(fill);

            // The glint. It orbits the card so the foil never sits dead: this is
            // the whole reason the panels are lit by a specular material.
            this._glint = new THREE.PointLight(0xffffff, 1.15, 9, 2);
            this._glint.position.set(1.6, 1.4, 2.2);
            this.scene.add(this._glint);
        }

        //--- the counter the card is played on -------------------------------

        _buildCounter() {
            this._room = new THREE.Group();
            this.scene.add(this._room);

            const deskGeo = this._track(new THREE.PlaneGeometry(16, 12));
            const desk = new THREE.Mesh(deskGeo, this._mat({
                map: this._fileTexture(this.style.deskTex, 5),
                color: this.style.deskTint
            }));
            desk.rotation.x = -Math.PI / 2;
            desk.position.set(0, -1.05, 0.5);
            this._room.add(desk);

            // A back wall, far enough out that the fog eats its edges. It stops
            // the card reading as a sprite floating in a void when it is turned.
            const wallGeo = this._track(new THREE.PlaneGeometry(18, 9));
            const wall = new THREE.Mesh(wallGeo, this._mat({
                map: this._fileTexture(this.style.deskTex, 4),
                color: 0x2a2a30
            }));
            wall.position.set(0, 2.2, -5.2);
            this._room.add(wall);

            // The coin the ticket was scratched with in every bar in Europe.
            const coinGeo = this._track(new THREE.CylinderGeometry(0.16, 0.16, 0.022, 20));
            const coin = new THREE.Mesh(coinGeo, this._mat({
                color: 0xb8a05a, specular: 0xfff3cf, shininess: 90
            }, 'phong'));
            coin.position.set(1.55, -1.03, 0.95);
            coin.rotation.set(-Math.PI / 2, 0, 0.4);
            this._room.add(coin);
        }

        //--- the card --------------------------------------------------------

        _buildCard() {
            this.card = new THREE.Group();
            this.scene.add(this.card);

            const faceTex = this._canvasTexture(CARD.faceW, CARD.faceH, (c) => this._drawFace(c), true);
            const backTex = this._canvasTexture(512, 320, (c, w, h) => this._drawBack(c, w, h), true);
            const edge = this._mat({ color: new THREE.Color(this.style.paperEdge) });

            const geo = this._track(new THREE.BoxGeometry(CARD.w, CARD.h, CARD.t));
            // BoxGeometry material order: +x, -x, +y, -y, +z (face), -z (back).
            const mesh = new THREE.Mesh(geo, [
                edge, edge, edge, edge,
                this._mat({ map: faceTex, specular: 0x1a1a1a, shininess: 14 }, 'phong'),
                this._mat({ map: backTex, specular: 0x101010, shininess: 8 }, 'phong')
            ]);
            this.cardBody = mesh;
            this.card.add(mesh);
        }

        // The printed side. Everything under the foil is drawn here once: the
        // panels only ever hide it. The print job itself is shared with the
        // sealed products on the rack.
        _drawFace(ctx) {
            drawTicketPaper(ctx, this.style);
            drawTicketHeader(ctx, this.style);
            for (let i = 0; i < CARD.count; i++) {
                drawPrizeWindow(ctx, this.style, i, this.model.cells[i]);
            }
            drawTicketFooter(ctx, this.style, this.model.serial);
        }

        _drawBack(ctx, w, h) {
            drawTicketBack(ctx, w, h, this.style);
        }

        //--- the foil --------------------------------------------------------

        _buildPanels() {
            this._panelGeo = this._track(new THREE.PlaneGeometry(CARD.panelW, CARD.panelH));
            const foilMap = this._fileTexture(this.style.foilTex, 1);

            for (let i = 0; i < CARD.count; i++) {
                const canvas = this._canvas(CARD.foilSize, CARD.foilSize, (c, w, h) => this._drawFoil(c, w, h, i));
                const tex = new THREE.CanvasTexture(canvas);
                tex.anisotropy = 4;
                this._disposables.push(tex);

                const mat = this._mat({
                    map: tex,
                    color: this.style.foil,
                    specular: 0xffffff,
                    shininess: 130,
                    transparent: true,
                    depthWrite: false
                }, 'phong');
                if (foilMap) mat.specularMap = foilMap;

                const mesh = new THREE.Mesh(this._panelGeo, mat);
                const c = cellCenter(i);
                mesh.position.set(c.x, c.y, CARD.t / 2 + 0.006);
                this.card.add(mesh);

                this.panels.push({
                    index: i,
                    mesh,
                    canvas,
                    ctx: canvas.getContext('2d'),
                    tex,
                    revealed: false,
                    autoT: -1,       // >= 0 while the scripted stroke is running
                    autoSeed: Math.random() * 6.28,
                    delay: 0,        // stagger used by "scratch the rest"
                    cover: new Uint8Array(64),
                    covered: 0
                });
            }
        }

        _drawFoil(ctx, w, h, index) {
            drawFoilFace(ctx, w, h, this.style, index);
        }

        //--- the selection ring and the flakes -------------------------------

        _buildCursor() {
            this.cursor = 0;
            const g = new THREE.Group();
            const pad = 0.045;
            const bar = 0.018;
            const wArm = CARD.panelW + pad * 2;
            const hArm = CARD.panelH + pad * 2;
            const mat = this._mat({
                color: new THREE.Color(this.style.accent),
                transparent: true,
                opacity: 0.9,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            }, 'basic');
            this._cursorMat = mat;

            const hGeo = this._track(new THREE.PlaneGeometry(wArm, bar));
            const vGeo = this._track(new THREE.PlaneGeometry(bar, hArm));
            const top = new THREE.Mesh(hGeo, mat); top.position.y = hArm / 2;
            const bot = new THREE.Mesh(hGeo, mat); bot.position.y = -hArm / 2;
            const left = new THREE.Mesh(vGeo, mat); left.position.x = -wArm / 2;
            const right = new THREE.Mesh(vGeo, mat); right.position.x = wArm / 2;
            g.add(top, bot, left, right);

            const c = cellCenter(0);
            g.position.set(c.x, c.y, CARD.t / 2 + 0.02);
            this._cursorGroup = g;
            this.card.add(g);
        }

        _buildFlakes() {
            const N = 360;
            const geo = this._track(new THREE.BufferGeometry());
            const pos = new Float32Array(N * 3);
            const col = new Float32Array(N * 3);
            for (let i = 0; i < N; i++) pos[i * 3 + 1] = -999;
            geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

            const tex = this._canvasTexture(16, 16, (c, w, h) => {
                c.fillStyle = '#ffffff';
                c.beginPath();
                c.moveTo(8, 1); c.lineTo(14, 7); c.lineTo(10, 15); c.lineTo(2, 11);
                c.closePath();
                c.fill();
            });

            const pmat = new THREE.PointsMaterial({
                size: 0.045,
                map: tex,
                vertexColors: true,
                transparent: true,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            });
            this._disposables.push(pmat);

            const points = new THREE.Points(geo, pmat);
            points.frustumCulled = false;
            this.scene.add(points);

            this._flakes = {
                points, geo, count: N, next: 0,
                life: new Float32Array(N),
                maxLife: new Float32Array(N),
                vel: new Float32Array(N * 3),
                base: new Float32Array(N * 3)
            };
        }

        spawnFlakes(worldPos, amount, bright) {
            const f = this._flakes;
            if (!f) return;
            const pos = f.geo.attributes.position.array;
            const col = f.geo.attributes.color.array;
            const base = new THREE.Color(this.style.foil);
            for (let n = 0; n < amount; n++) {
                const i = f.next;
                f.next = (f.next + 1) % f.count;
                pos[i * 3] = worldPos.x + (Math.random() - 0.5) * 0.08;
                pos[i * 3 + 1] = worldPos.y + (Math.random() - 0.5) * 0.08;
                pos[i * 3 + 2] = worldPos.z + 0.02 + Math.random() * 0.04;
                f.vel[i * 3] = (Math.random() - 0.5) * 0.9;
                f.vel[i * 3 + 1] = 0.25 + Math.random() * 0.9;
                f.vel[i * 3 + 2] = 0.15 + Math.random() * 0.5;
                f.maxLife[i] = 0.7 + Math.random() * 0.8;
                f.life[i] = f.maxLife[i];
                const tint = bright ? 1.0 : 0.75 + Math.random() * 0.25;
                f.base[i * 3] = base.r * tint + (bright ? 0.45 : 0.08);
                f.base[i * 3 + 1] = base.g * tint + (bright ? 0.38 : 0.08);
                f.base[i * 3 + 2] = base.b * tint + (bright ? 0.12 : 0.08);
                col[i * 3] = f.base[i * 3];
                col[i * 3 + 1] = f.base[i * 3 + 1];
                col[i * 3 + 2] = f.base[i * 3 + 2];
            }
            f.geo.attributes.position.needsUpdate = true;
            f.geo.attributes.color.needsUpdate = true;
        }

        _updateFlakes(dt) {
            const f = this._flakes;
            if (!f) return;
            const pos = f.geo.attributes.position.array;
            const col = f.geo.attributes.color.array;
            let touched = false;
            for (let i = 0; i < f.count; i++) {
                if (f.life[i] <= 0) continue;
                touched = true;
                f.life[i] -= dt;
                if (f.life[i] <= 0) {
                    pos[i * 3 + 1] = -999;
                    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0;
                    continue;
                }
                f.vel[i * 3 + 1] -= 2.4 * dt;
                pos[i * 3] += f.vel[i * 3] * dt;
                pos[i * 3 + 1] += f.vel[i * 3 + 1] * dt;
                pos[i * 3 + 2] += f.vel[i * 3 + 2] * dt;
                // Additive points cannot fade on alpha, so they fade to black.
                const fade = f.life[i] / f.maxLife[i];
                col[i * 3] = f.base[i * 3] * fade;
                col[i * 3 + 1] = f.base[i * 3 + 1] * fade;
                col[i * 3 + 2] = f.base[i * 3 + 2] * fade;
            }
            if (touched) {
                f.geo.attributes.position.needsUpdate = true;
                f.geo.attributes.color.needsUpdate = true;
            }
        }

        //--- scratching ------------------------------------------------------

        // Rub the foil away at (u, v) in panel space, v measured from the top.
        // Coverage is tracked on an 8x8 occupancy grid rather than by reading
        // pixels back, which would stall the GPU pipeline every frame.
        erodeAt(panel, u, v, radius) {
            if (panel.revealed) return;
            const S = CARD.foilSize;
            const ctx = panel.ctx;
            const px = u * S;
            const py = v * S;
            const r = radius * S;

            ctx.save();
            ctx.globalCompositeOperation = 'destination-out';
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.fill();
            // Torn edges: a few satellite bites so the boundary is never a
            // clean circle.
            for (let i = 0; i < 3; i++) {
                const a = Math.random() * Math.PI * 2;
                const d = r * (0.6 + Math.random() * 0.6);
                ctx.beginPath();
                ctx.arc(px + Math.cos(a) * d, py + Math.sin(a) * d, r * (0.3 + Math.random() * 0.4), 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
            panel.tex.needsUpdate = true;

            // Occupancy.
            const cell = S / 8;
            const rc = r + cell * 0.25;
            for (let gy = 0; gy < 8; gy++) {
                for (let gx = 0; gx < 8; gx++) {
                    const k = gy * 8 + gx;
                    if (panel.cover[k]) continue;
                    const cx = (gx + 0.5) * cell;
                    const cy = (gy + 0.5) * cell;
                    if ((cx - px) * (cx - px) + (cy - py) * (cy - py) <= rc * rc) {
                        panel.cover[k] = 1;
                        panel.covered++;
                    }
                }
            }

            if (panel.autoT < 0 && panel.covered >= 34) {
                // Enough of it is gone that the symbol is legible; the rest comes
                // away on its own, the way a half-rubbed panel always does.
                this.startAutoScratch(panel.index, 0.42);
            }
        }

        // Local coordinates of a point on a panel, in world space, for flakes.
        panelWorldPoint(panel, u, v) {
            const c = cellCenter(panel.index);
            const p = new THREE.Vector3(
                c.x + (u - 0.5) * CARD.panelW,
                c.y + (0.5 - v) * CARD.panelH,
                CARD.t / 2 + 0.01
            );
            return this.card.localToWorld(p);
        }

        startAutoScratch(index, startAt) {
            const panel = this.panels[index];
            if (!panel || panel.revealed || panel.autoT >= 0) return false;
            panel.autoT = startAt || 0;
            return true;
        }

        // Stagger the whole card, for the "scratch the rest" shortcut.
        scratchAllRemaining() {
            let n = 0;
            for (const panel of this.panels) {
                if (panel.revealed || panel.autoT >= 0) continue;
                // (n + 1): a zero delay would read as "no delay queued" and the
                // first panel would never start.
                panel.delay = (n + 1) * 0.09;
                n++;
            }
            return n;
        }

        _updateAuto(panel, dt) {
            if (panel.delay > 0) {
                panel.delay -= dt;
                if (panel.delay <= 0 && !panel.revealed && panel.autoT < 0) panel.autoT = 0;
                return;
            }
            if (panel.autoT < 0 || panel.revealed) return;

            const prev = panel.autoT;
            panel.autoT = Math.min(1, panel.autoT + dt / 0.5);

            // A coin dragged across the panel in a wave, in a few substeps so a
            // long frame still leaves a continuous stroke.
            const steps = 4;
            for (let i = 1; i <= steps; i++) {
                const t = lerp(prev, panel.autoT, i / steps);
                const u = 0.1 + 0.8 * t;
                const v = 0.5 + 0.28 * Math.sin(t * Math.PI * 3.1 + panel.autoSeed);
                this.erodeAt(panel, u, v, 0.17);
                if (i === steps) {
                    this.spawnFlakes(this.panelWorldPoint(panel, u, v), 2, false);
                }
            }

            if (panel.autoT >= 1) this._finishPanel(panel);
        }

        _finishPanel(panel) {
            // The mesh stays in the scene with a fully erased texture rather
            // than being hidden: it is still the pick target, so hovering a
            // scratched panel keeps moving the selection.
            panel.ctx.clearRect(0, 0, CARD.foilSize, CARD.foilSize);
            panel.tex.needsUpdate = true;
            panel.revealed = true;
            panel.autoT = -1;
            this.model.revealed[panel.index] = true;
            this.spawnFlakes(this.panelWorldPoint(panel, 0.5, 0.5), 26, false);
        }

        //--- picking ---------------------------------------------------------

        // Returns { panel, u, v } for a panel under the normalized device point,
        // or null. A scratched panel still answers, so hovering one keeps the
        // selection tracking, and anything else is the card body or the room:
        // both of those turn the ticket instead.
        pick(ndcX, ndcY) {
            if (!this._raycaster) return null;
            this._raycaster.setFromCamera({ x: ndcX, y: ndcY }, this.camera);
            const meshes = this.panels.map(p => p.mesh);
            const hits = this._raycaster.intersectObjects(meshes, false);
            if (!hits.length) return null;
            const hit = hits[0];
            const panel = this.panels.find(p => p.mesh === hit.object);
            if (!panel || !hit.uv) return null;
            // Panel uv runs from the bottom; the foil canvas runs from the top.
            return { panel, u: hit.uv.x, v: 1 - hit.uv.y };
        }

        //--- camera and pose -------------------------------------------------

        applyRotation(dYaw, dPitch) {
            this.targetYaw = clamp(this.targetYaw + dYaw, -1.25, 1.25);
            this.targetPitch = clamp(this.targetPitch + dPitch, -0.95, 0.95);
        }

        // Positive brings the card closer.
        applyZoom(delta) {
            this.targetDist = clamp(this.targetDist - delta, 2.3, 5.2);
        }

        recentre() {
            this.targetYaw = 0;
            this.targetPitch = 0;
            this.targetDist = 3.35;
        }

        setCursor(index) {
            if (index < 0 || index >= CARD.count || index === this.cursor) return false;
            this.cursor = index;
            return true;
        }

        moveCursor(dCol, dRow) {
            let row = Math.floor(this.cursor / CARD.cols);
            let col = this.cursor % CARD.cols;
            col = (col + dCol + CARD.cols) % CARD.cols;
            row = (row + dRow + CARD.rows) % CARD.rows;
            return this.setCursor(row * CARD.cols + col);
        }

        updateCamera(t) {
            this.dist = lerp(this.dist, this.targetDist, t);
            this.camera.position.set(0, 0.42, this.dist);
            this.camera.lookAt(0, -0.04, 0);
        }

        celebrate(winIndices) {
            this._celebrate = 1;
            for (const index of winIndices) {
                const c = cellCenter(index);
                const geo = this._track(new THREE.RingGeometry(CARD.panelW * 0.58, CARD.panelW * 0.68, 28));
                const mat = this._mat({
                    color: 0xffd66b,
                    transparent: true,
                    opacity: 0.9,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false
                }, 'basic');
                const ring = new THREE.Mesh(geo, mat);
                ring.position.set(c.x, c.y, CARD.t / 2 + 0.03);
                // Built after the scene was patched, so it opts in by hand or it
                // is the one unbanded thing on the screen.
                if (window.PSXShader) cardPSX(() => window.PSXShader.applyToMaterial(mat));
                this.card.add(ring);
                this._winRings.push({ ring, mat, phase: Math.random() * 6.28 });
                this.spawnFlakes(this.panelWorldPoint(this.panels[index], 0.5, 0.5), 40, true);
            }
        }

        //--- frame -----------------------------------------------------------

        update(dt, scratching) {
            this._time += dt;

            for (const panel of this.panels) this._updateAuto(panel, dt);
            this._updateFlakes(dt);

            // Pose: spring toward the player's target, with a slow drift on top
            // so a card left alone still breathes.
            const drift = this._celebrate > 0 ? 0 : 1;
            this.yaw = lerp(this.yaw, this.targetYaw + drift * Math.sin(this._time * 0.55) * 0.045, 0.16);
            this.pitch = lerp(this.pitch, this.targetPitch + drift * Math.sin(this._time * 0.8 + 1.2) * 0.03, 0.16);
            this.card.rotation.y = this.yaw;
            this.card.rotation.x = -this.pitch;
            this.card.position.y = Math.sin(this._time * 0.9) * 0.012;

            if (this._celebrate > 0) {
                // The card lifts and turns once when it pays, and settles back.
                this._celebrate = Math.max(0, this._celebrate - dt * 0.5);
                this.card.position.y += Math.sin((1 - this._celebrate) * Math.PI) * 0.07;
                this.card.rotation.z = Math.sin(this._time * 2.4) * 0.04 * this._celebrate;
            }

            // The glint orbits; scratching drags it towards the panel so the
            // rubbed metal flares while it is being worked.
            const gt = this._time * (scratching ? 1.9 : 0.7);
            this._glint.position.set(Math.cos(gt) * 2.1, 1.2 + Math.sin(gt * 0.7) * 0.5, 2.0 + Math.sin(gt) * 0.5);
            this._glint.intensity = scratching ? 1.6 : 1.15;

            // Selection ring.
            const c = cellCenter(this.cursor);
            const g = this._cursorGroup;
            g.position.x = lerp(g.position.x, c.x, 0.3);
            g.position.y = lerp(g.position.y, c.y, 0.3);
            const pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(this._time * 5));
            this._cursorMat.opacity = this.model.isComplete() ? 0 : pulse;
            const s = 1 + 0.03 * Math.sin(this._time * 5);
            g.scale.set(s, s, 1);

            for (const wr of this._winRings) {
                const p = 0.5 + 0.5 * Math.sin(this._time * 3.4 + wr.phase);
                wr.mat.opacity = 0.45 + 0.5 * p;
                const rs = 1 + 0.12 * p;
                wr.ring.scale.set(rs, rs, 1);
            }

            this.updateCamera(0.18);
        }

        render() {
            if (window.PSXShader) {
                cardPSX(() => window.PSXShader.render(this.renderer, this.scene, this.camera));
            } else {
                this.renderer.render(this.scene, this.camera);
            }
        }

        resize(w, h) {
            this._w = w;
            this._h = h;
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(w, h);
        }
    }

    //=========================================================================
    // Scene_ScratchCard
    //=========================================================================
    class Scene_ScratchCard extends Scene_Base {
        initialize() {
            super.initialize();
            this._style = 'esoteric';
            this._threeReady = typeof THREE !== 'undefined';
            this._drag = null;
            this._dragDist = 0;
            this._hoverX = -1;
            this._hoverY = -1;
            this._scratchSeCooldown = 0;
            this._hudDirty = true;
            this._complete = false;
            this._lastRemaining = -1;
            this._padSeen = false;
        }

        prepare(style) {
            this._style = cardStyles[style] ? style : 'esoteric';
        }

        create() {
            super.create();
            this.createBackground();
            this.createHud();

            if (!this._threeReady) {
                this._fatal = T('ScratchingCard.noRenderer');
                this._hudDirty = true;
                return;
            }

            // Charge the stake up front. Without a cost, a repeatable trigger event
            // is an infinite-gold exploit (average prize ~500-575 gold, free to open).
            if (CARD_COST_GOLD > 0 && $gameParty.gold() < CARD_COST_GOLD) {
                this._cannotAfford = true;
                safePlaySe({ name: 'Buzzer1', volume: 90, pitch: 100, pan: 0 });
                this._hudDirty = true;
                return;
            }
            if (CARD_COST_GOLD > 0) {
                $gameParty.loseGold(CARD_COST_GOLD);
            }

            this._model = new ScratchCardModel(this._style);
            this.createCard();
            safePlaySe({ name: 'Casino/cards_pack_take_out_1', volume: 90, pitch: 100, pan: 0 });
            if (window.MinigameFun) window.MinigameFun.played({ spec: 'Card Counting' });
        }

        start() {
            super.start();
            this.startFadeIn(this.fadeSpeed(), false);
        }

        createBackground() {
            this._backgroundSprite = new Sprite(new Bitmap(8, 8));
            this._backgroundSprite.bitmap.fillAll('#05040a');
            this._backgroundSprite.scale.set(Graphics.width / 8, Graphics.height / 8);
            this.addChild(this._backgroundSprite);
        }

        createCard() {
            // A touch under native, scaled back up with nearest filtering on
            // top of the shader's own downsample: the two together are what
            // makes the counter read as a 32-bit console rather than a smooth
            // modern render.
            const scale = 0.92;
            const w = Math.round(Graphics.width * scale);
            const h = Math.round(Graphics.height * scale);
            this._card = new ScratchCard3D(w, h, this._model);

            const texture = PIXI.Texture.from(this._card.domElement);
            if (texture.baseTexture) texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
            this._cardSprite = new PIXI.Sprite(texture);
            this._cardSprite.scale.set(Graphics.width / w, Graphics.height / h);
            this.addChildAt(this._cardSprite, this.getChildIndex(this._hudSprite));
        }

        createHud() {
            this._theme = buildTheme();
            this._hudSprite = new Sprite(new Bitmap(Graphics.width, Graphics.height));
            this.addChild(this._hudSprite);
        }

        //--- frame -----------------------------------------------------------

        update() {
            super.update();
            const dt = 1 / 60;

            if (this._fatal || this._cannotAfford) {
                if (this._hudDirty) this.drawHud();
                if (Input.isTriggered('ok') || Input.isTriggered('cancel') || TouchInput.isTriggered()) {
                    this.popScene();
                }
                return;
            }
            if (!this._card) return;

            if (this._scratchSeCooldown > 0) this._scratchSeCooldown -= dt;
            const scratching = this.updateInput(dt);
            this._card.update(dt, scratching);
            this.checkCompletion();

            this._card.render();
            if (this._cardSprite && this._cardSprite.texture) this._cardSprite.texture.update();
            if (this._hudDirty) this.drawHud();
        }

        // Returns true while foil is actually being worked, which the renderer
        // uses to drive the glint.
        updateInput(dt) {
            let scratching = false;
            const card = this._card;
            const done = this._complete;

            scratching = this.updatePointer() || scratching;
            this.updatePad(dt);

            if (Input.isTriggered('ok')) {
                if (done) {
                    this.popScene();
                } else {
                    this.scratchCursorPanel();
                    scratching = true;
                }
            } else if (Input.isTriggered('cancel')) {
                if (done) {
                    this.popScene();
                } else {
                    this.scratchTheRest();
                }
            }

            if (!done) {
                const step = (dir, dCol, dRow) => {
                    const pad = window.AnalogStickInput;
                    if (Input.isRepeated(dir) || (pad && pad.isRepeated(dir))) {
                        if (card.moveCursor(dCol, dRow)) {
                            SoundManager.playCursor();
                            this._hudDirty = true;
                        }
                        return true;
                    }
                    return false;
                };
                step('left', -1, 0) || step('right', 1, 0) || step('up', 0, -1) || step('down', 0, 1);
            }

            // Any panel still working counts as scratching for the lighting.
            if (!scratching) {
                scratching = card.panels.some(p => p.autoT >= 0);
            }
            return scratching;
        }

        // Mouse and touch. Grabbing the card body or the background turns the
        // ticket; rubbing across a panel scratches it; a press that never
        // travels is a click, which scratches the whole panel at once.
        updatePointer() {
            const card = this._card;
            let scratching = false;

            // Hover. Only raycast when the pointer has actually moved, so an
            // idle mouse costs nothing.
            if (!this._drag && (TouchInput.x !== this._hoverX || TouchInput.y !== this._hoverY)) {
                this._hoverX = TouchInput.x;
                this._hoverY = TouchInput.y;
                if (!this._complete) {
                    const ndc = this.pointerNdc(TouchInput.x, TouchInput.y);
                    const hover = card.pick(ndc.x, ndc.y);
                    if (hover && hover.panel && card.setCursor(hover.panel.index)) this._hudDirty = true;
                }
            }

            if (TouchInput.isPressed()) {
                const ndc = this.pointerNdc(TouchInput.x, TouchInput.y);
                if (!this._drag) {
                    const hit = card.pick(ndc.x, ndc.y);
                    this._drag = {
                        mode: (hit && hit.panel && !hit.panel.revealed && !this._complete) ? 'scratch' : 'rotate',
                        panel: hit && hit.panel ? hit.panel : null,
                        x: TouchInput.x,
                        y: TouchInput.y
                    };
                    this._dragDist = 0;
                    if (hit && hit.panel && card.setCursor(hit.panel.index)) this._hudDirty = true;
                }

                const dx = TouchInput.x - this._drag.x;
                const dy = TouchInput.y - this._drag.y;
                this._dragDist += Math.abs(dx) + Math.abs(dy);
                this._drag.x = TouchInput.x;
                this._drag.y = TouchInput.y;

                if (this._drag.mode === 'rotate') {
                    card.applyRotation(dx * 0.006, -dy * 0.006);
                } else {
                    const hit = card.pick(ndc.x, ndc.y);
                    if (hit && hit.panel && !hit.panel.revealed && hit.panel.autoT < 0) {
                        card.erodeAt(hit.panel, hit.u, hit.v, 0.13);
                        card.spawnFlakes(card.panelWorldPoint(hit.panel, hit.u, hit.v), 2, false);
                        this.playScratchSe();
                        if (card.setCursor(hit.panel.index)) this._hudDirty = true;
                        scratching = true;
                    }
                }
            } else if (this._drag) {
                // Released. A press that stayed put on a panel is a click.
                if (this._drag.mode === 'scratch' && this._dragDist < 8 && this._drag.panel) {
                    this.scratchPanel(this._drag.panel.index);
                } else if (this._drag.mode === 'rotate' && this._dragDist < 8 && this._complete) {
                    this.popScene();
                }
                this._drag = null;
            }

            const wheel = TouchInput.wheelY || 0;
            if (wheel) card.applyZoom(-clamp(wheel / 120, -1, 1) * 0.35);

            return scratching;
        }

        // Gamepad and the keyboard modifiers that mirror it.
        updatePad(dt) {
            const card = this._card;
            const pad = window.AnalogStickInput;
            if (pad) {
                const rx = pad.rightX();
                const ry = pad.rightY();
                if (Math.abs(rx) + Math.abs(ry) > 0.02) {
                    card.applyRotation(rx * 2.2 * dt, -ry * 2.2 * dt);
                    this._padSeen = true;
                    this._hudDirty = true;
                }
                const zoom = pad.rightTrigger() - pad.leftTrigger();
                if (Math.abs(zoom) > 0.02) card.applyZoom(-zoom * 1.6 * dt);
            }
            if (Input.isPressed('pageup')) card.applyZoom(1.4 * dt);
            if (Input.isPressed('pagedown')) card.applyZoom(-1.4 * dt);

            // SHIFT (X / square on a pad) squares the card up again.
            if (Input.isTriggered('shift')) {
                card.recentre();
                SoundManager.playCursor();
            }
        }

        pointerNdc(x, y) {
            return {
                x: (x / Graphics.width) * 2 - 1,
                y: -((y / Graphics.height) * 2 - 1)
            };
        }

        playScratchSe() {
            if (this._scratchSeCooldown > 0) return;
            this._scratchSeCooldown = 0.11;
            const n = 1 + Math.floor(Math.random() * 8);
            safePlaySe({ name: 'Casino/card_slide_' + n, volume: 55, pitch: 130 + Math.floor(Math.random() * 40), pan: 0 });
        }

        scratchCursorPanel() {
            const card = this._card;
            let index = card.cursor;
            if (card.panels[index].revealed) {
                // Already gone: step to the next one still covered.
                for (let step = 1; step <= CARD.count; step++) {
                    const i = (index + step) % CARD.count;
                    if (!card.panels[i].revealed) { index = i; break; }
                }
                if (card.panels[index].revealed) return;
                card.setCursor(index);
            }
            this.scratchPanel(index);
        }

        scratchPanel(index) {
            if (this._card.startAutoScratch(index)) {
                this.playScratchSe();
                this._hudDirty = true;
            }
        }

        scratchTheRest() {
            const n = this._card.scratchAllRemaining();
            if (n > 0) {
                this.playScratchSe();
                this._hudDirty = true;
            }
        }

        checkCompletion() {
            // Keep the counter honest while panels come away one by one.
            const left = this._model.remaining();
            if (left !== this._lastRemaining) {
                // The first pass only seeds the counter; there is nothing to ping.
                if (this._lastRemaining >= 0) {
                    safePlaySe({ name: 'Casino/card_place_2', volume: 60, pitch: 120, pan: 0 });
                }
                this._lastRemaining = left;
                this._hudDirty = true;
            }
            if (this._complete || left > 0) return;

            this._complete = true;
            this._hudDirty = true;
            this.payOut();
        }

        payOut() {
            const won = this._model.wonAmount;
            if (won > 0) {
                const goldAmount = Math.floor(won * GOLD_PER_EURO);
                $gameParty.gainGold(goldAmount);
                this._card.celebrate(this._model.winIndices);

                // Fanfare1 is not in audio/se; Applause1 is stock.
                if (won >= 100) {
                    safePlaySe({ name: 'Applause1', volume: 100, pitch: 100, pan: 0 });
                } else {
                    safePlaySe({ name: 'Item1', volume: 90, pitch: 100, pan: 0 });
                }

                if ($gameVariables && WIN_VARIABLE_ID > 0) {
                    $gameVariables.setValue(WIN_VARIABLE_ID, won);
                }
                if (window.MinigameFun) window.MinigameFun.won({ spec: 'Card Counting', gambling: true });
            } else {
                safePlaySe({ name: 'Buzzer1', volume: 90, pitch: 100, pan: 0 });
                if (window.MinigameFun) window.MinigameFun.lost({ spec: 'Card Counting', gambling: true });
            }
        }

        //--- HUD -------------------------------------------------------------

        drawHud() {
            this._hudDirty = false;
            const bmp = this._hudSprite.bitmap;
            const t = this._theme;
            bmp.clear();
            bmp.outlineColor = 'rgba(0,0,0,0.75)';

            if (this._fatal) {
                this.drawPlate(bmp, Graphics.width / 2 - 260, Graphics.height / 2 - 40, 520, 80, t.loseBox);
                bmp.fontSize = 24;
                bmp.textColor = t.loseText;
                bmp.outlineWidth = 4;
                bmp.drawText(this._fatal, Graphics.width / 2 - 260, Graphics.height / 2 - 20, 520, 40, 'center');
                return;
            }

            if (this._cannotAfford) {
                const msg = T('ScratchingCard.needMoney', { cost: euroText(CARD_COST_GOLD / GOLD_PER_EURO) });
                this.drawPlate(bmp, Graphics.width / 2 - 300, Graphics.height / 2 - 40, 600, 80, t.loseBox);
                bmp.fontSize = 22;
                bmp.textColor = t.loseText;
                bmp.outlineWidth = 4;
                bmp.drawText(msg, Graphics.width / 2 - 300, Graphics.height / 2 - 20, 600, 40, 'center');
                return;
            }

            // Panels left, top left.
            bmp.fontSize = 20;
            bmp.outlineWidth = 4;
            bmp.textColor = t.winText;
            bmp.drawText(
                T('ScratchingCard.cellsRemaining', { remaining: this._model.remaining() }),
                24, 18, 400, 28, 'left'
            );

            if (this._complete) this.drawResult(bmp);
        }

        drawPlate(bmp, x, y, w, h, fill) {
            const t = this._theme;
            bmp.fillRect(x - 3, y - 3, w + 6, h + 6, t.frame);
            bmp.fillRect(x, y, w, h, fill);
            bmp.fillRect(x, y, w, 2, t.accent);
            bmp.fillRect(x, y + h - 2, w, 2, t.accent);
        }

        drawResult(bmp) {
            const t = this._theme;
            const won = this._model.wonAmount;
            const w = 620;
            const h = 84;
            const x = Math.round((Graphics.width - w) / 2);
            const y = Graphics.height - 172;

            this.drawPlate(bmp, x, y, w, h, won > 0 ? t.winBox : t.loseBox);

            const text = won > 0
                ? T('ScratchingCard.youWon', { amount: euroText(won) })
                : T('ScratchingCard.noWinTryAgain');
            bmp.fontSize = 30;
            bmp.textColor = won > 0 ? t.winText : t.loseText;
            bmp.outlineWidth = 5;
            bmp.drawText(text, x, y + 24, w, 38, 'center');
        }

        //--- teardown ---------------------------------------------------------

        terminate() {
            super.terminate();
            if (this._cardSprite) {
                if (this._cardSprite.parent) this._cardSprite.parent.removeChild(this._cardSprite);
                this._cardSprite.destroy();
                this._cardSprite = null;
            }
            if (this._card) {
                this._card.dispose();
                this._card = null;
            }
            if (this._hudSprite && this._hudSprite.bitmap) this._hudSprite.bitmap.destroy();
            if (this._backgroundSprite && this._backgroundSprite.bitmap) this._backgroundSprite.bitmap.destroy();
        }
    }

    //=========================================================================
    // ScratchCardRack3D - the display stand at the counter. The four printed
    // products stand on a carousel, sealed, every panel still under foil; the
    // one in front turns on the spot so the player sees both sides of the
    // ticket before paying for it.
    //=========================================================================
    const RACK = {
        radius: 3.6,        // carousel radius; the front seat sits at z = 0
        step: 0.62,         // radians between two neighbouring seats
        scale: 0.78,        // card size on the stand
        thickness: 0.05,    // thicker than the real ticket so the edge reads
        shiftX: 0.62,       // the stand sits right of centre, clear of the list
        spinRate: 1.05,     // radians a second, front card only
        deskY: -0.92,       // the counter top everything stands on
        plinthH: 0.12,
        restY: -0.18,       // card centre while it is sitting in its stand
        faceW: 640,
        backW: 512
    };

    class ScratchCardRack3D extends ThreeStage {
        constructor(width, height, keys) {
            super();
            this._w = width;
            this._h = height;
            this._keys = keys;
            this.cards = [];
            this._time = 0;
            this.index = 0;         // which product is in front
            this.focused = true;    // false while the cursor is on Back
            this._display = 0;      // eased carousel position

            this._initThree();
            rackPSX(() => {
                this._buildCounter();
                this._buildCards();
                if (window.PSXShader) window.PSXShader.applyToObject(this.scene);
            });

            this._raycaster = new THREE.Raycaster();
            this.update(0);
        }

        get domElement() { return this.renderer.domElement; }

        //--- setup ----------------------------------------------------------

        _initThree() {
            const fog = 0x090711;
            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color(fog);
            this.scene.fog = new THREE.Fog(fog, 4.2, 12);

            // The camera stays on the centre line while the stand sits right of
            // it: that offset is what keeps the front ticket clear of the HUD's
            // list down the left, and it holds at 4:3 as well as 16:9.
            this.camera = new THREE.PerspectiveCamera(44, this._w / this._h, 0.05, 40);
            this.camera.position.set(0, 0.42, 3.35);
            this.camera.lookAt(0.15, -0.12, -0.2);

            this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
            this.renderer.setPixelRatio(1);
            this.renderer.setSize(this._w, this._h);
            this.renderer.setClearColor(fog, 1);

            this.scene.add(new THREE.AmbientLight(0x4c4c60, 0.85));

            const key = new THREE.DirectionalLight(0xfff0dc, 0.9);
            key.position.set(2.2, 3.2, 3.6);
            this.scene.add(key);

            const fill = new THREE.DirectionalLight(0x5f6ad0, 0.35);
            fill.position.set(-3.0, 1.2, 1.8);
            this.scene.add(fill);

            // Follows whichever ticket is in front, wearing that product's own
            // accent: the stand changes colour as the carousel turns.
            this._focusLight = new THREE.PointLight(0xffffff, 1.3, 7, 2);
            this._focusLight.position.set(RACK.shiftX, 0.3, 1.4);
            this.scene.add(this._focusLight);
        }

        _buildCounter() {
            const counter = new THREE.Group();
            this.scene.add(counter);

            const deskGeo = this._track(new THREE.PlaneGeometry(18, 12));
            const desk = new THREE.Mesh(deskGeo, this._mat({
                map: this._fileTexture('dark_brown_marble.jpg', 6),
                color: 0x4a3f52
            }));
            desk.rotation.x = -Math.PI / 2;
            desk.position.set(0, RACK.deskY, 0.5);
            counter.add(desk);

            const wallGeo = this._track(new THREE.PlaneGeometry(20, 10));
            const wall = new THREE.Mesh(wallGeo, this._mat({
                map: this._fileTexture('grey_concrete.jpg', 5),
                color: 0x24242c
            }));
            wall.position.set(0, 2.4, -5.6);
            counter.add(wall);

            // The coin every ticket in Europe is scratched with, left on the
            // counter next to the stand.
            const coinGeo = this._track(new THREE.CylinderGeometry(0.16, 0.16, 0.022, 16));
            const coin = new THREE.Mesh(coinGeo, this._mat({
                color: 0xb8a05a, specular: 0xfff3cf, shininess: 90
            }, 'phong'));
            coin.position.set(-1.35, RACK.deskY + 0.02, 1.15);
            coin.rotation.set(-Math.PI / 2, 0, 0.4);
            counter.add(coin);
        }

        _buildCards() {
            const cw = CARD.w * RACK.scale;
            const ch = CARD.h * RACK.scale;
            const faceH = Math.round(RACK.faceW * CARD.faceH / CARD.faceW);
            const backH = Math.round(RACK.backW * CARD.h / CARD.w);

            this._cardGeo = this._track(new THREE.BoxGeometry(cw, ch, RACK.thickness));
            this._shadowGeo = this._track(new THREE.PlaneGeometry(cw * 0.9, cw * 0.32));
            this._plinthGeo = this._track(new THREE.BoxGeometry(cw * 0.82, RACK.plinthH, 0.34));

            this._rack = new THREE.Group();
            this._rack.position.x = RACK.shiftX;
            this.scene.add(this._rack);

            for (let i = 0; i < this._keys.length; i++) {
                const key = this._keys[i];
                const style = cardStyles[key];
                const serial = displaySerial(key);

                const faceTex = this._canvasTexture(RACK.faceW, faceH, (c, w, h) => {
                    drawSealedTicket(c, w, h, style, serial);
                });
                const backTex = this._canvasTexture(RACK.backW, backH, (c, w, h) => {
                    drawTicketBack(c, w, h, style);
                });
                const edge = this._mat({ color: new THREE.Color(style.paperEdge) });

                // BoxGeometry material order: +x, -x, +y, -y, +z (face), -z (back).
                const mesh = new THREE.Mesh(this._cardGeo, [
                    edge, edge, edge, edge,
                    this._mat({ map: faceTex, specular: 0x272727, shininess: 20 }, 'phong'),
                    this._mat({ map: backTex, specular: 0x181818, shininess: 10 }, 'phong')
                ]);

                const root = new THREE.Group();
                root.add(mesh);
                this._rack.add(root);

                // A flat quad on the counter under each ticket: the shadow a
                // a 32-bit console could afford, and enough to sit them down.
                const shadow = new THREE.Mesh(this._shadowGeo, this._mat({
                    color: 0x000000, transparent: true, opacity: 0.42, depthWrite: false
                }, 'basic'));
                shadow.rotation.x = -Math.PI / 2;
                this._rack.add(shadow);

                // The stand each product is slotted into, painted in that
                // product's own dark ink so the rack reads as four displays
                // rather than four loose tickets.
                const plinth = new THREE.Mesh(this._plinthGeo, this._mat({
                    color: new THREE.Color(style.accentDark),
                    specular: 0x555560,
                    shininess: 30
                }, 'phong'));
                this._rack.add(plinth);

                this.cards.push({
                    key, style, mesh, root, shadow, plinth,
                    spin: 0,
                    scale: 1
                });
            }
        }

        //--- state -----------------------------------------------------------

        setIndex(index) {
            const i = clamp(index, 0, this.cards.length - 1);
            if (i === this.index) return false;
            this.index = i;
            return true;
        }

        setFocused(on) {
            this.focused = !!on;
        }

        // Index of the product under the pointer, or -1.
        pick(ndcX, ndcY) {
            if (!this._raycaster) return -1;
            this._raycaster.setFromCamera({ x: ndcX, y: ndcY }, this.camera);
            const hits = this._raycaster.intersectObjects(this.cards.map(c => c.mesh), false);
            if (!hits.length) return -1;
            return this.cards.findIndex(c => c.mesh === hits[0].object);
        }

        //--- frame -----------------------------------------------------------

        update(dt) {
            this._time += dt;
            this._display = lerp(this._display, this.index, dt > 0 ? 0.18 : 1);

            for (let i = 0; i < this.cards.length; i++) {
                const card = this.cards[i];
                const selected = i === this.index && this.focused;
                const theta = (i - this._display) * RACK.step;

                const tx = Math.sin(theta) * RACK.radius;
                const tz = Math.cos(theta) * RACK.radius - RACK.radius;
                // At rest a ticket sits in its stand; the one the player is
                // looking at lifts out of it and turns.
                const ty = RACK.restY + (selected ? 0.13 : 0) + Math.sin(this._time * 0.8 + i) * 0.012;

                const p = card.root.position;
                p.x = lerp(p.x, tx, 0.2);
                p.y = lerp(p.y, ty, 0.2);
                p.z = lerp(p.z, tz, 0.2);

                // The front ticket turns; the others ease back to face the
                // player, by the shortest way round from wherever they stopped.
                if (selected) {
                    card.spin += dt * RACK.spinRate;
                } else {
                    const home = Math.round(card.spin / (Math.PI * 2)) * Math.PI * 2;
                    card.spin = lerp(card.spin, home, 0.12);
                }
                card.root.rotation.y = -theta * 0.5 + card.spin;
                card.root.rotation.x = selected ? -0.04 : -0.12;

                const ts = selected ? 1 : 0.86;
                card.scale = lerp(card.scale, ts, 0.2);
                card.root.scale.setScalar(card.scale);

                card.shadow.position.set(p.x, RACK.deskY + 0.02, p.z + 0.12);
                card.shadow.material.opacity = clamp(0.42 - Math.abs(theta) * 0.22, 0.06, 0.42);
                card.plinth.position.set(tx, RACK.deskY + RACK.plinthH / 2, tz);
                card.plinth.rotation.y = -theta * 0.5;
            }

            // The stand takes the colour of whatever is in front of it.
            const front = this.cards[this.index];
            if (front) {
                this._focusLight.color.set(this.focused ? front.style.accent : '#5a5a68');
                this._focusLight.intensity = this.focused ? 1.3 : 0.6;
                const fp = front.root.position;
                this._focusLight.position.set(RACK.shiftX + fp.x * 0.6, fp.y + 0.6, fp.z + 1.5);
            }
        }

        render() {
            if (window.PSXShader) {
                rackPSX(() => window.PSXShader.render(this.renderer, this.scene, this.camera));
            } else {
                this.renderer.render(this.scene, this.camera);
            }
        }

        resize(w, h) {
            this._w = w;
            this._h = h;
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(w, h);
        }
    }

    //=========================================================================
    // Free-play arcade: the counter in the title screen's minigame menu, where
    // the four printed products are on sale and the house pays the stake.
    //=========================================================================

    // True while the arcade is running on the title screen's throwaway context.
    // A real save is never touched by the bankroll below.
    function isFreePlay() {
        const arcade = window.MinigameArcade;
        try {
            return !!(arcade && arcade.isFreePlay && arcade.isFreePlay());
        } catch (e) {
            return false;
        }
    }

    // Deal the free-play bankroll: exactly FREEPLAY_GOLD, whatever the wallet
    // held before, so winnings from an earlier visit never carry over.
    function dealFreePlayBankroll() {
        if (!isFreePlay()) return;
        const gold = $gameParty.gold();
        if (gold < FREEPLAY_GOLD) $gameParty.gainGold(FREEPLAY_GOLD - gold);
        else if (gold > FREEPLAY_GOLD) $gameParty.loseGold(gold - FREEPLAY_GOLD);
    }

    // The counter: what each product costs and what it can pay.
    class Window_ScratchCardTerms extends Window_Base {
        initialize(rect) {
            super.initialize(rect);
            this._styleKey = null;
            this.refresh();
        }

        setStyleKey(key) {
            if (this._styleKey === key) return;
            this._styleKey = key;
            this.refresh();
        }

        refresh() {
            this.contents.clear();
            const style = cardStyles[this._styleKey];
            if (!style) return;
            const lh = this.lineHeight();
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(
                T('ScratchingCard.select.terms', {
                    cost: euroText(CARD_COST_GOLD / GOLD_PER_EURO),
                    amount: euroText(style.maxWin)
                }),
                0, 0, this.innerWidth, 'center'
            );
            this.resetTextColor();
            this.drawText(
                T('ScratchingCard.select.desc.' + style.titleKey),
                0, lh, this.innerWidth, 'center'
            );
        }
    }

    // The rack of products, one command per printed card.
    class Window_ScratchCardStyles extends Window_Command {
        makeCommandList() {
            for (const key of Object.keys(cardStyles)) {
                this.addCommand(T('ScratchingCard.title.' + cardStyles[key].titleKey), key);
            }
            this.addCommand(T('ScratchingCard.select.back'), 'cancel');
        }

        setTermsWindow(win) {
            this._termsWindow = win;
            this.callUpdateHelp();
        }

        callUpdateHelp() {
            super.callUpdateHelp();
            if (this._termsWindow) {
                this._termsWindow.setStyleKey(this.currentSymbol());
            }
        }
    }

    //=========================================================================
    // Scene_ScratchCardSelect - the counter. The rack is 3D and the lettering
    // over it is the shared PSXHud art deco layer: a black field, gold
    // keylines and 8px type, the way a 32-bit console drew a shop screen.
    //
    // Where three.js or PSXHud is missing, the old stack of command windows is
    // still here and takes over: the counter degrades, it does not vanish.
    //=========================================================================
    const RACK_HUD = {
        rowH: 13,
        listX: 4,
        listY: 24,
        // Wide enough for the longest product name, narrow enough that the
        // front ticket still clears it on a 4:3 window.
        listW: 124,
        infoH: 50,
        stripH: 13
    };

    class Scene_ScratchCardSelect extends Scene_MenuBase {
        initialize() {
            super.initialize();
            this._keys = Object.keys(cardStyles);
            this._index = 0;
            // The product the stand is showing. The cursor can be on Back,
            // which is not a product: the carousel stays where it was rather
            // than swinging to the end of the rack.
            this._lastProduct = 0;
            this._banner = '';
            this._bannerT = 0;
            this._hoverX = -1;
            this._hoverY = -1;
            this._solid = typeof THREE !== 'undefined' && !!window.PSXHud;
        }

        // Index of the Back row, one past the last product.
        backRow() { return this._keys.length; }

        create() {
            super.create();
            if (!this._solid) {
                this.createHeaderWindow();
                this.createStyleWindow();
                this.createTermsWindow();
                this._styleWindow.setTermsWindow(this._termsWindow);
                return;
            }
            if (this._windowLayer) this._windowLayer.visible = false;
            if (this._cancelButton) this._cancelButton.visible = false;
            this.createRack();
            this.createHudLayer();
        }

        // A blurred map snapshot would only be a wasted upload behind an opaque
        // 3D view; the window fallback keeps the usual one.
        createBackground() {
            if (!this._solid) return super.createBackground();
            this._backgroundSprite = new Sprite(new Bitmap(8, 8));
            this._backgroundSprite.bitmap.fillAll('#05040a');
            this._backgroundSprite.scale.set(Graphics.width / 8, Graphics.height / 8);
            this.addChild(this._backgroundSprite);
        }

        createRack() {
            // Rendered below native and scaled back up with nearest filtering,
            // on top of the shader's own downsample: the stand is scenery and
            // nothing on it has to be read off the model.
            const scale = 0.9;
            const w = Math.round(Graphics.width * scale);
            const h = Math.round(Graphics.height * scale);
            this._rack = new ScratchCardRack3D(w, h, this._keys);

            const texture = PIXI.Texture.from(this._rack.domElement);
            if (texture.baseTexture) texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
            this._rackSprite = new PIXI.Sprite(texture);
            this._rackSprite.scale.set(Graphics.width / w, Graphics.height / h);
            const idx = this._windowLayer ? this.getChildIndex(this._windowLayer) : this.children.length;
            this.addChildAt(this._rackSprite, idx);
        }

        createHudLayer() {
            this._hud = window.PSXHud.layer(window.PSXHud.baseWidth());
            this.addChild(this._hud.sprite);
            this._hudDom = window.PSXHud.domPanel(this._hud);
        }

        //--- frame -----------------------------------------------------------

        update() {
            super.update();
            if (!this._solid) return;

            const dt = 1 / 60;
            if (this._bannerT > 0) this._bannerT -= dt;

            this.updateInput();
            if (this._index < this.backRow()) this._lastProduct = this._index;
            this._rack.setIndex(this._lastProduct);
            this._rack.setFocused(this._index < this.backRow());
            this._rack.update(dt);
            this._rack.render();
            if (this._rackSprite && this._rackSprite.texture) this._rackSprite.texture.update();
            this.drawHud();
        }

        updateInput() {
            const pad = window.AnalogStickInput;
            const repeated = (dir) => Input.isRepeated(dir) || (pad && pad.isRepeated(dir));

            if (repeated('right') || repeated('down')) {
                this.moveIndex(1);
            } else if (repeated('left') || repeated('up')) {
                this.moveIndex(-1);
            }

            if (Input.isTriggered('ok')) {
                this.activate();
                return;
            }
            if (Input.isTriggered('cancel')) {
                SoundManager.playCancel();
                this.popScene();
                return;
            }

            this.updatePointer();
        }

        // The rack and the list are one cursor: the last row is Back, so a
        // player on the keyboard can leave without knowing about ESC.
        moveIndex(delta) {
            const n = this.backRow() + 1;
            const next = (this._index + delta + n) % n;
            if (next === this._index) return;
            this._index = next;
            SoundManager.playCursor();
        }

        updatePointer() {
            const moved = TouchInput.x !== this._hoverX || TouchInput.y !== this._hoverY;
            if (moved) {
                this._hoverX = TouchInput.x;
                this._hoverY = TouchInput.y;
                const hit = this.hitTest(TouchInput.x, TouchInput.y);
                if (hit >= 0 && hit !== this._index) {
                    this._index = hit;
                    SoundManager.playCursor();
                }
            }

            if (TouchInput.isTriggered()) {
                const hit = this.hitTest(TouchInput.x, TouchInput.y);
                if (hit >= 0) {
                    this._index = hit;
                    this.activate();
                }
            } else if (TouchInput.isCancelled()) {
                SoundManager.playCancel();
                this.popScene();
            }

            const wheel = TouchInput.wheelY || 0;
            if (wheel) this.moveIndex(wheel > 0 ? 1 : -1);
        }

        // Screen pixels to an entry: the HUD list first, then the products on
        // the stand behind it.
        hitTest(x, y) {
            const row = this.rowAt(x, y);
            if (row >= 0) return row;
            const ndcX = (x / Graphics.width) * 2 - 1;
            const ndcY = -((y / Graphics.height) * 2 - 1);
            return this._rack ? this._rack.pick(ndcX, ndcY) : -1;
        }

        // The list is drawn in virtual pixels, so the pointer is converted into
        // them rather than the rows being converted back out.
        rowAt(x, y) {
            if (!this._hud) return -1;
            const vx = x * this._hud.w / Graphics.width;
            const vy = y * this._hud.h / Graphics.height;
            const L = RACK_HUD;
            if (vx < L.listX || vx > L.listX + L.listW) return -1;
            const rel = vy - (L.listY + 4);
            if (rel < 0) return -1;
            const row = Math.floor(rel / L.rowH);
            return row >= 0 && row <= this.backRow() ? row : -1;
        }

        activate() {
            if (this._index >= this.backRow()) {
                SoundManager.playCancel();
                this.popScene();
                return;
            }
            const key = this._keys[this._index];
            if (CARD_COST_GOLD > 0 && $gameParty.gold() < CARD_COST_GOLD) {
                safePlaySe({ name: 'Buzzer1', volume: 90, pitch: 100, pan: 0 });
                this._banner = T('ScratchingCard.select.needMoney');
                this._bannerT = 2.2;
                return;
            }
            SoundManager.playOk();
            openCard(key);
        }

        //--- HUD -------------------------------------------------------------

        text(str, x, y, w, align, color, size, opts) {
            if (this._hudDom) this._hudDom.text(str, x, y, w, align, color, size, opts);
            else window.PSXHud.text(this._hud.bitmap, str, x, y, w, align, color, size, opts);
        }

        // Word wrap against the pixel font's own metrics.
        wrapLines(bmp, text, maxW, size) {
            const H = window.PSXHud;
            bmp.fontFace = H.FONT;
            bmp.fontSize = size;
            const words = String(text).toUpperCase().split(/\s+/).filter(Boolean);
            const lines = [];
            let line = '';
            for (const word of words) {
                const test = line ? line + ' ' + word : word;
                if (line && bmp.measureTextWidth(test) > maxW) {
                    lines.push(line);
                    line = word;
                } else {
                    line = test;
                }
            }
            if (line) lines.push(line);
            return lines.length ? lines : [''];
        }

        drawHud() {
            if (!this._hud) return;
            const bmp = this._hud.bitmap;
            bmp.clear();
            if (this._hudDom) this._hudDom.begin();
            this.drawMarquee(bmp);
            this.drawList(bmp);
            this.drawInfo(bmp);
            this.drawControls(bmp);
            this.drawBanner(bmp);
            if (this._hudDom) this._hudDom.end();
        }

        drawMarquee(bmp) {
            const H = window.PSXHud;
            const D = H.DECO;
            const w = this._hud.w;
            H.decoPanel(bmp, 3, 3, w - 6, 15, {
                title: T('ScratchingCard.select.title'),
                titleRight: T('ScratchingCard.select.wallet', {
                    amount: euroText($gameParty.gold() / GOLD_PER_EURO)
                }),
                headerH: 11,
                hairline: false,
                step: 1,
                dom: this._hudDom
            });
            H.decoSunburst(bmp, 4, 19, 10, D.goldLo, { from: 0, span: Math.PI / 2, rays: 4, dashed: false });
            H.decoSunburst(bmp, w - 5, 19, 10, D.goldLo, { from: Math.PI / 2, span: Math.PI / 2, rays: 4, dashed: false });
        }

        drawList(bmp) {
            const H = window.PSXHud;
            const D = H.DECO;
            const L = RACK_HUD;
            const rows = this.backRow() + 1;
            const h = rows * L.rowH + 8;
            H.decoPanel(bmp, L.listX, L.listY, L.listW, h, { hairline: false, step: 1 });

            for (let i = 0; i < rows; i++) {
                const y = L.listY + 4 + i * L.rowH;
                const back = i === this.backRow();
                const label = back
                    ? T('ScratchingCard.select.back')
                    : T('ScratchingCard.title.' + cardStyles[this._keys[i]].titleKey);
                if (i === this._index) {
                    H.decoSelect(bmp, L.listX + 3, y - 1, L.listW - 6, L.rowH - 1, D.gold);
                }
                const color = i === this._index ? D.ink : (back ? D.faint : D.dim);
                this.text(label, L.listX + 8, y + 1, L.listW - 14, 'left', color, 8);
            }
        }

        drawInfo(bmp) {
            const H = window.PSXHud;
            const D = H.DECO;
            const L = RACK_HUD;
            const w = this._hud.w - 8;
            const y = this._hud.h - L.stripH - 3 - L.infoH;
            const back = this._index >= this.backRow();
            const style = back ? null : cardStyles[this._keys[this._index]];

            H.decoPanel(bmp, 4, y, w, L.infoH, {
                title: back
                    ? T('ScratchingCard.select.back')
                    : T('ScratchingCard.title.' + style.titleKey),
                titleRight: back ? '' : T('ScratchingCard.select.terms', {
                    cost: euroText(CARD_COST_GOLD / GOLD_PER_EURO),
                    amount: euroText(style.maxWin)
                }),
                headerH: 11,
                step: 2,
                dom: this._hudDom
            });

            const body = back
                ? T('ScratchingCard.select.backDesc')
                : T('ScratchingCard.select.desc.' + style.titleKey);
            const lines = this.wrapLines(bmp, body, w - 20, 8);
            for (let i = 0; i < Math.min(2, lines.length); i++) {
                this.text(lines[i], 10, y + 18 + i * 11, w - 20, 'left', D.dim, 8, { raw: true });
            }

            H.decoRule(bmp, 10, y + L.infoH - 7, w - 20, D.goldLo);
        }

        // The footer strip is the rack's bottom rule; it carries no text.
        drawControls(bmp) {
            const H = window.PSXHud;
            const D = H.DECO;
            const w = this._hud.w;
            const y = this._hud.h - RACK_HUD.stripH;
            bmp.fillRect(0, y, w, RACK_HUD.stripH, D.black);
            bmp.fillRect(0, y, w, 1, D.goldLo);
        }

        drawBanner(bmp) {
            if (!(this._bannerT > 0) || !this._banner) return;
            const H = window.PSXHud;
            const D = H.DECO;
            const w = this._hud.w;
            const bw = Math.min(w - 40, 232);
            const bx = Math.floor((w - bw) / 2);
            const by = 26;
            H.decoPanel(bmp, bx, by, bw, 19, { accent: D.red, accentLo: '#7a2c20', step: 2 });
            this.text(this._banner, bx, by + 5, bw, 'center', D.red, 8);
        }

        //--- teardown ---------------------------------------------------------

        terminate() {
            super.terminate();
            if (this._hudDom) {
                this._hudDom.destroy();
                this._hudDom = null;
            }
            if (this._rackSprite) {
                if (this._rackSprite.parent) this._rackSprite.parent.removeChild(this._rackSprite);
                this._rackSprite.destroy();
                this._rackSprite = null;
            }
            if (this._rack) {
                this._rack.dispose();
                this._rack = null;
            }
            if (this._hud && this._hud.bitmap) this._hud.bitmap.destroy();
            if (this._backgroundSprite && this._solid && this._backgroundSprite.bitmap) {
                this._backgroundSprite.bitmap.destroy();
            }
        }

        // Windows are stacked as one block in the middle of the screen: the
        // header names the counter and shows the wallet, the rack sits under
        // it, the terms of the highlighted product under that.
        layout() {
            if (this._layout) return this._layout;
            const w = Math.min(560, Graphics.boxWidth - 80);
            const headerH = this.calcWindowHeight(2, false);
            const rackH = this.calcWindowHeight(Object.keys(cardStyles).length + 1, true);
            const termsH = this.calcWindowHeight(2, false);
            const x = Math.floor((Graphics.boxWidth - w) / 2);
            const y = Math.max(0, Math.floor((Graphics.boxHeight - (headerH + rackH + termsH)) / 2));
            this._layout = { w, x, y, headerH, rackH, termsH };
            return this._layout;
        }

        createHeaderWindow() {
            const l = this.layout();
            this._headerWindow = new Window_Base(new Rectangle(l.x, l.y, l.w, l.headerH));
            const lh = this._headerWindow.lineHeight();
            const inner = this._headerWindow.innerWidth;
            this._headerWindow.changeTextColor(ColorManager.systemColor());
            this._headerWindow.drawText(T('ScratchingCard.select.title'), 0, 0, inner, 'center');
            this._headerWindow.resetTextColor();
            this._headerWindow.drawText(
                T('ScratchingCard.select.wallet', { amount: euroText($gameParty.gold() / GOLD_PER_EURO) }),
                0, lh, inner, 'center'
            );
            this.addWindow(this._headerWindow);
        }

        createStyleWindow() {
            const l = this.layout();
            this._styleWindow = new Window_ScratchCardStyles(new Rectangle(l.x, l.y + l.headerH, l.w, l.rackH));
            for (const key of Object.keys(cardStyles)) {
                this._styleWindow.setHandler(key, this.onStylePicked.bind(this, key));
            }
            this._styleWindow.setHandler('cancel', this.popScene.bind(this));
            this.addWindow(this._styleWindow);
        }

        createTermsWindow() {
            const l = this.layout();
            this._termsWindow = new Window_ScratchCardTerms(
                new Rectangle(l.x, l.y + l.headerH + l.rackH, l.w, l.termsH)
            );
            this.addWindow(this._termsWindow);
        }

        onStylePicked(styleKey) {
            openCard(styleKey);
        }
    }

    //=========================================================================
    // Plugin commands
    //=========================================================================

    function openCard(style) {
        SceneManager.push(Scene_ScratchCard);
        SceneManager.prepareNextScene(style);
    }

    PluginManager.registerCommand(pluginName, 'openScratchCard', function(args) {
        openCard(args.style || 'esoteric');
    });

    PluginManager.registerCommand(pluginName, 'openEsotericCard', function() {
        openCard('esoteric');
    });

    PluginManager.registerCommand(pluginName, 'openCorporateCard', function() {
        openCard('corporate');
    });

    PluginManager.registerCommand(pluginName, 'openVacationCard', function() {
        openCard('vacation');
    });

    PluginManager.registerCommand(pluginName, 'openHypercapitalistCard', function() {
        openCard('hypercapitalist');
    });

    // Make classes globally available
    window.Scene_ScratchCard = Scene_ScratchCard;
    window.Scene_ScratchCardSelect = Scene_ScratchCardSelect;
    window.ScratchCard3D = ScratchCard3D;
    window.ScratchCardModel = ScratchCardModel;

    // Script call method for easier access
    window.openScratchCard = function(style = 'esoteric') {
        openCard(style);
    };

    // Entry point for the title screen's minigame menu: deal the free-play
    // bankroll again, then let the player pick which card to buy. Returning
    // from a card comes back to the rack with the wallet as the cards left it;
    // only a fresh entry from the menu re-deals.
    window.openScratchCardArcade = function() {
        dealFreePlayBankroll();
        SceneManager.push(Scene_ScratchCardSelect);
    };
})();
