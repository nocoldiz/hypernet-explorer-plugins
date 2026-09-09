//=============================================================================
// BookViewer.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Advanced Book Viewer v3.0 - Aged paper, a real page turn, and pages that can be torn out
 * @author Enhanced Edition
 * @url https://your-website.com
 *
 * @command openBook
 * @text Open Book
 * @desc Opens a book with custom flip animation
 *
 * @arg bookName
 * @text Book Name
 * @desc Name of the book file (without .json extension)
 * @type string
 * @default book1
 *
 * @command openBookFromItem
 * @text Open Book From Item
 * @desc Opens whichever book the item that ran this event names in its notes
 *
 * @help
 * ============================================================================
 * Advanced Book Viewer Plugin v3.0
 * ============================================================================
 *
 * Features:
 * - Every book is graded by age. An old book is yellowed, foxed, stained,
 *   soft at the edges and faint in the ink; a new one is clean and white.
 * - The page turn is a curling sheet of paper, not a squashed rectangle: it
 *   bows as it lifts, catches the light along the curl, droops under its own
 *   weight and throws a shadow onto the page it is uncovering.
 * - Pages can be torn out. Take hold of one with the mouse, drag it and fling
 *   it off the edge of the screen. What is left is the stub at the gutter.
 *   Torn pages come back the next time the book is opened.
 *
 * Controls:
 * - Left Arrow / Mouse Click Left Side: Previous page
 * - Right Arrow / Mouse Click Right Side: Next page
 * - Mouse drag: take hold of a page and turn it by hand
 * - Mouse fling off the screen: tear the page out
 * - Up Arrow / Down Arrow: Jump backward / forward 10 pages
 * - Page Up / Page Down (keyboard) or L1 / R1 (gamepad): Jump backward / forward 10 pages
 * - Shift (keyboard) or L2 (gamepad): Jump to the cover
 * - C (keyboard) or R2 (gamepad): Jump to the last page
 * - Enter / Space (or A on a gamepad): Leave a bookmark on the open page
 * - Click a bookmark tab: Fall open at that page
 * - Escape / Right Click: Close book
 * - Mouse Wheel: Scroll pages
 *
 * Every book opens on a generated cover page (title and author, guessed from
 * the source text) before its actual content.
 *
 * ----------------------------------------------------------------------------
 * One event, and the book written on the item
 * ----------------------------------------------------------------------------
 * A book is an item, and the item says which book it is and when it was
 * published:
 *
 *     <Book: crowleygoetia>
 *     <Published: 1904>
 *
 * `<Book:>` names the file under books/ without its extension. Every book item
 * in the game runs the same common event, which is one openBookFromItem
 * command: the file is read off the item that ran it, not off the event. There
 * is no per-book event to author, and adding a book to the shelf is adding an
 * item.
 *
 * ----------------------------------------------------------------------------
 * How old a book is
 * ----------------------------------------------------------------------------
 * window.BookAge is the one answer to "how worn is this book". It reads the
 * year off `<Published:>` on the item that carries the book, measures it
 * against the year the world is in, and grades the paper from that. A book
 * nothing claims (a map event opening a file directly, say) falls back to a
 * wear seeded off its own name, so it still looks like something rather than
 * like new paper.
 *
 * A game that wants to decide the year some other way installs a resolver and
 * this stops asking the items:
 *
 *     BookAge.setYearResolver(name => yearThisBookWasPrinted(name));
 *
 * ----------------------------------------------------------------------------
 * What reading it is worth, and where the ribbons go
 * ----------------------------------------------------------------------------
 * A book teaches the specialization written on its item as `<Teaches:>`: the
 * reader is paid on opening it and paid again, more, on reaching the last
 * page, once each per member per book. window.BookLearning owns that whole
 * question, and the ribbons below with it; this scene only reports what the
 * reader did.
 *
 * Up to five ribbons can be left in a book. The confirm key drops one on the
 * page on the right or lifts the one already there, and every ribbon in the
 * book shows as a tab out of the fore-edge: click one to fall open at it, or
 * press the menu key to walk through them in order.
 */

(() => {
    'use strict';

    const pluginName = "BookViewer";

    // Font configuration for better readability
    const FONT_CONFIG = {
        family: 'Georgia, "Times New Roman", serif',
        size: { text: 22, title: 28, pageNumber: 16 },
        lineHeight: 1.6,
        color: {
            text: '#2c2416',
            title: '#1a1410',
            pageNumber: '#8b7355'
        }
    };

    // Book layout configuration
    const BOOK_CONFIG = {
        margin: { top: 80, bottom: 80, outer: 120, inner: 60 },
        padding: 40,
        spineWidth: 6,
        charsPerPage: 850,
        // The board the pages are bound into stands proud of them all round.
        boardOverhang: 12,
        // How thick the two halves of the block read at the outer edges.
        blockDepth: 22
    };

    // The page turn, as a curling sheet rather than a squashed rectangle.
    const TURN_CONFIG = {
        cols: 26,      // strips across the width of the sheet
        rows: 5,       // strips down it, so the free edge can droop
        bow: 0.55,     // how far the middle of the sheet lags the leading edge
        persp: 0.18,   // how much nearer parts of the sheet are drawn larger
        droop: 0.055,  // gravity on the free corner, as a share of page height
        lift: 0.02     // how far the whole sheet rises off the block mid-turn
    };

    // The ribbons left in a book: how far they stick out of the fore-edge, how
    // tall each tab is, and the silks they are cut from, one per slot.
    const BOOKMARK_CONFIG = {
        stick: 26,      // how far past the page edge the tab shows
        height: 46,     // the height of one tab
        gap: 12,        // the space between two tabs
        top: 0.16,      // where the first tab sits, as a share of page height
        silks: ['#a8323c', '#2f6ea8', '#3f8a4f', '#c08a2a', '#6a4a8c']
    };

    // Tearing a page out: how fast, and how far out, the fling has to be.
    const TEAR_CONFIG = {
        flick: 1.6,    // pixels per millisecond, over the last moment of the drag
        window: 120,   // the length of that moment, in milliseconds
        grip: 0.12,    // how far the page must be lifted before it can tear
        margin: 40     // how close to the screen edge counts as "off the screen"
    };

    function openBook(bookName) {
        SceneManager.push(Scene_BookViewer);
        SceneManager.prepareNextScene(bookName);
    }

    PluginManager.registerCommand(pluginName, "openBook", args => {
        openBook(args.bookName);
    });

    // The one event every book item runs. Which book is on the item, not here.
    PluginManager.registerCommand(pluginName, "openBookFromItem", () => {
        const item = BookManager.lastReadItem();
        const file = BookManager.bookFileForItem(item);
        if (!file) {
            console.warn('BookViewer: nothing with a <Book:> tag opened this event');
            return;
        }
        openBook(file);
    });

    // What an item says about the book it is. `<Book:>` names the file under
    // books/, `<Published:>` the year it was produced, which is the whole of
    // the ageing input.
    const BOOK_TAG = /<Book:\s*([^>]+)>/i;            // i18n-ignore: note tag
    const PUBLISHED_TAG = /<Published:\s*(-?\d+)\s*>/i;  // i18n-ignore: note tag

    // Raw context drawing does not mark a Bitmap's texture stale on its own.
    const mark = (bitmap) => { if (bitmap && bitmap.baseTexture) bitmap.baseTexture.update(); };

    // A small deterministic generator, so a book looks the same every time it
    // is opened and two books never look alike.
    function seedFrom(text) {
        let h = 2166136261;
        for (let i = 0; i < String(text).length; i++) {
            h ^= String(text).charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }
    function rngFrom(seed) {
        let s = seed >>> 0 || 1;
        return () => {
            s ^= s << 13; s >>>= 0;
            s ^= s >> 17;
            s ^= s << 5; s >>>= 0;
            return s / 4294967296;
        };
    }
    const lerp = (a, b, t) => a + (b - a) * t;
    const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
    const mixHex = (a, b, t) => {
        const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
        const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
        const out = pa.map((v, i) => Math.round(lerp(v, pb[i], clamp01(t))));
        return `rgb(${out[0]}, ${out[1]}, ${out[2]})`;
    };

    //-----------------------------------------------------------------------------
    // BookAge - how old a book is, and what that does to it
    //-----------------------------------------------------------------------------
    // The year a book was produced is somebody else's business: this asks for it
    // through a resolver and turns whatever comes back into one number, the
    // wear, between 0 (printed this morning) and 1 (four centuries in a cellar).
    // Everything the reader sees, paper colour, foxing, stains, soft edges,
    // faded ink, is read off that one number, so grading a book is changing one
    // line rather than twenty.

    class BookAge {
        static _resolver = null;
        static _cache = {};

        /** Install the answer to "what year was this book produced". */
        static setYearResolver(fn) {
            this._resolver = (typeof fn === 'function') ? fn : null;
            this._cache = {};
        }

        static yearFor(bookName) {
            if (this._resolver) {
                try {
                    const year = Number(this._resolver(bookName));
                    if (isFinite(year)) return year;
                } catch (e) {
                    console.warn('BookAge: the year resolver threw for ' + bookName, e);
                }
                return null;
            }
            // Nobody has overridden it: the year is printed on the item, which
            // is where a book says everything else about itself too.
            try {
                const year = BookManager.publishedYear(bookName);
                return isFinite(year) ? year : null;
            } catch (e) {
                return null;
            }
        }

        /** The year the world is currently in, for measuring a book against. */
        static currentYear() {
            try {
                const now = window.TimeSystem && window.TimeSystem.getCurrentDate
                    ? window.TimeSystem.getCurrentDate() : null;
                if (now && isFinite(now.year)) return Number(now.year);
            } catch (e) { /* no clock yet */ }
            return 2001;
        }

        /**
         * 0 for a book fresh off the press, 1 for one that has been handled for
         * four hundred years. The curve is steep early, because the first
         * decades are what turn white paper cream, and flat late, because a
         * ruin cannot get much more ruined.
         */
        static wearFor(bookName) {
            if (this._cache[bookName] != null) return this._cache[bookName];
            const year = this.yearFor(bookName);
            let wear;
            if (year != null) {
                const age = Math.max(0, this.currentYear() - year);
                wear = clamp01(Math.pow(Math.min(age, 400) / 400, 0.55));
            } else {
                // Nothing has said how old this one is. Seeded off the name so
                // the shelf is not uniform and no book changes between readings.
                wear = clamp01(0.15 + rngFrom(seedFrom(bookName))() * 0.7);
            }
            this._cache[bookName] = wear;
            return wear;
        }

        /**
         * Everything the wear decides, in one place. Read once when a book is
         * opened and handed to the paper mill and to the ink.
         */
        static gradeFor(bookName) {
            const wear = this.wearFor(bookName);
            return {
                wear,
                seed: seedFrom(bookName),
                // Paper goes from bleached white through cream to a tea-stained tan.
                paper: mixHex('#fbf7ee', '#cbb185', wear),
                paperDeep: mixHex('#f0ead9', '#b39a70', wear),
                // The edges take the worst of it: handled, sunned and dirty.
                edge: mixHex('#e8dfc9', '#6b5432', Math.pow(wear, 0.8)),
                edgeDepth: lerp(0.10, 0.42, wear),
                // Rust-coloured spots of mould, the mark of a damp century.
                foxing: Math.round(lerp(0, 90, Math.pow(wear, 1.7))),
                foxingInk: mixHex('#b98a4e', '#7a4a1e', wear),
                // Bigger, softer marks: water, tea, a thumb.
                stains: Math.round(lerp(0, 7, Math.pow(wear, 1.4))),
                // Fibres and mottling in the sheet itself.
                grain: lerp(0.035, 0.11, wear),
                // Old ink is browner and thinner than new ink.
                ink: mixHex('#241d12', '#5b4a33', wear),
                inkAlpha: lerp(1, 0.72, wear),
                titleInk: mixHex('#140f08', '#4a3a26', wear),
                // How ragged the outer edge of a sheet is cut and worn.
                deckle: lerp(0.6, 5.5, wear),
                // The boards, from fresh cloth to cracked leather.
                board: mixHex('#5c3a22', '#2e1d12', wear),
                boardEdge: mixHex('#8a5c34', '#43291a', wear),
                // The desk under it all darkens with the mood of an old book.
                desk: mixHex('#3d2f23', '#241a12', wear * 0.6)
            };
        }
    }

    //-----------------------------------------------------------------------------
    // PaperMill - the sheets themselves
    //-----------------------------------------------------------------------------
    // A page is a real sheet with a real surface: a wash of colour, fibres in
    // the pulp, mottling where it was pressed, foxing where it was damp, stains
    // where it was used, and an outer edge that was never cut straight. Sheets
    // are milled once per book and reused, because a page turn cannot afford to
    // make one.

    class PaperMill {
        /**
         * One sheet of paper. `side` is which way the ragged edge faces, so the
         * left and right halves of a spread are not mirror images.
         */
        static sheet(w, h, grade, side, variant) {
            const bitmap = new Bitmap(w, h);
            const ctx = bitmap.context;
            const rand = rngFrom(grade.seed + variant * 7919 + (side === 'left' ? 13 : 29));
            const outer = side === 'left' ? 0 : w;      // the free edge
            const inner = side === 'left' ? w : 0;      // the gutter

            // The wash, faintly warmer towards the gutter where the light does
            // not reach.
            const wash = ctx.createLinearGradient(outer, 0, inner, 0);
            wash.addColorStop(0, grade.paper);
            wash.addColorStop(0.72, grade.paper);
            wash.addColorStop(1, grade.paperDeep);
            ctx.fillStyle = wash;
            ctx.fillRect(0, 0, w, h);

            // Mottling: broad, soft patches where the pulp lay unevenly.
            for (let i = 0; i < 26; i++) {
                const cx = rand() * w, cy = rand() * h;
                const r = 40 + rand() * 160;
                const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
                const dark = rand() < 0.5;
                g.addColorStop(0, `rgba(${dark ? '90, 70, 40' : '255, 250, 235'}, ${grade.grain * 0.9})`);
                g.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = g;
                ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
            }

            // Fibres. Short strokes at every angle, the length of a linen thread.
            ctx.lineWidth = 1;
            for (let i = 0; i < 900; i++) {
                const x = rand() * w, y = rand() * h;
                const a = rand() * Math.PI;
                const len = 2 + rand() * 7;
                ctx.strokeStyle = rand() < 0.5
                    ? `rgba(120, 96, 60, ${grade.grain * 0.55})`
                    : `rgba(255, 252, 240, ${grade.grain * 0.8})`;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
                ctx.stroke();
            }

            // Foxing: rust spots, denser near the edges where the damp got in.
            for (let i = 0; i < grade.foxing; i++) {
                const edgeBias = Math.pow(rand(), 0.45);
                const x = side === 'left' ? w - edgeBias * w : edgeBias * w;
                const y = rand() * h;
                const r = 1.5 + rand() * 6;
                const g = ctx.createRadialGradient(x, y, 0, x, y, r);
                g.addColorStop(0, grade.foxingInk.replace('rgb', 'rgba').replace(')', ', 0.5)'));
                g.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fill();
            }

            // Stains: something was spilled, and it dried with a rim.
            for (let i = 0; i < grade.stains; i++) {
                const x = rand() * w, y = rand() * h;
                const r = 20 + rand() * 70;
                const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
                g.addColorStop(0, 'rgba(122, 88, 40, 0.05)');
                g.addColorStop(0.82, 'rgba(122, 88, 40, 0.09)');
                g.addColorStop(0.95, 'rgba(104, 72, 30, 0.17)');
                g.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fill();
            }

            // The edges are darker: handled, sunned and dusty.
            const burn = (x0, x1) => {
                const g = ctx.createLinearGradient(x0, 0, x1, 0);
                g.addColorStop(0, `rgba(74, 52, 26, ${grade.edgeDepth})`);
                g.addColorStop(1, 'rgba(74, 52, 26, 0)');
                ctx.fillStyle = g;
                ctx.fillRect(Math.min(x0, x1), 0, Math.abs(x1 - x0), h);
            };
            burn(outer, outer + (side === 'left' ? 60 : -60));
            const vert = (y0, y1) => {
                const g = ctx.createLinearGradient(0, y0, 0, y1);
                g.addColorStop(0, `rgba(74, 52, 26, ${grade.edgeDepth * 0.7})`);
                g.addColorStop(1, 'rgba(74, 52, 26, 0)');
                ctx.fillStyle = g;
                ctx.fillRect(0, Math.min(y0, y1), w, Math.abs(y1 - y0));
            };
            vert(0, 40);
            vert(h, h - 40);

            // The gutter: the sheet curves away into the binding.
            const gut = ctx.createLinearGradient(inner, 0, inner + (side === 'left' ? -70 : 70), 0);
            gut.addColorStop(0, 'rgba(40, 26, 12, 0.30)');
            gut.addColorStop(0.5, 'rgba(40, 26, 12, 0.08)');
            gut.addColorStop(1, 'rgba(40, 26, 12, 0)');
            ctx.fillStyle = gut;
            ctx.fillRect(0, 0, w, h);

            // The outer edge was never cut straight, and time has not helped.
            this.deckle(ctx, w, h, grade, side, rand);

            mark(bitmap);
            return bitmap;
        }

        /** Bite a ragged line out of the free edge of a sheet. */
        static deckle(ctx, w, h, grade, side, rand) {
            const depth = grade.deckle;
            if (depth <= 0.2) return;
            ctx.globalCompositeOperation = 'destination-out';
            ctx.beginPath();
            const outer = side === 'left' ? 0 : w;
            const dir = side === 'left' ? 1 : -1;
            ctx.moveTo(outer, 0);
            let y = 0;
            while (y < h) {
                const step = 6 + rand() * 16;
                y = Math.min(h, y + step);
                ctx.lineTo(outer + dir * rand() * depth, y);
            }
            ctx.lineTo(outer - dir * 4, h);
            ctx.lineTo(outer - dir * 4, 0);
            ctx.closePath();
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
        }

        /**
         * What is left when a page has been torn out: a ragged stub still held
         * by the binding, and the shadowed well where the sheet used to be.
         */
        static stub(w, h, grade, side) {
            const bitmap = new Bitmap(w, h);
            const ctx = bitmap.context;
            const rand = rngFrom(grade.seed + (side === 'left' ? 977 : 1471));
            const inner = side === 'left' ? w : 0;
            const dir = side === 'left' ? -1 : 1;

            // The well: the inside of the book, in shadow.
            const well = ctx.createLinearGradient(inner, 0, inner + dir * w, 0);
            well.addColorStop(0, 'rgba(24, 15, 8, 0.92)');
            well.addColorStop(0.35, 'rgba(30, 20, 11, 0.80)');
            well.addColorStop(1, 'rgba(38, 26, 15, 0.62)');
            ctx.fillStyle = well;
            ctx.fillRect(0, 0, w, h);

            // The stub, torn along a line that wandered as it went.
            ctx.beginPath();
            ctx.moveTo(inner, 0);
            let y = 0;
            let x = inner + dir * (26 + rand() * 16);
            ctx.lineTo(x, 0);
            while (y < h) {
                y = Math.min(h, y + 4 + rand() * 12);
                x = inner + dir * (18 + rand() * 34);
                ctx.lineTo(x, y);
            }
            ctx.lineTo(inner, h);
            ctx.closePath();
            ctx.fillStyle = grade.paper;
            ctx.fill();

            // The tear itself is bruised and fibrous where it parted.
            ctx.strokeStyle = `rgba(90, 66, 34, ${0.35 + grade.wear * 0.4})`;
            ctx.lineWidth = 2;
            ctx.stroke();

            mark(bitmap);
            return bitmap;
        }

        /** The stack of leaves seen edge on, giving each half its thickness. */
        static block(w, h, grade, side) {
            const bitmap = new Bitmap(w, h);
            const ctx = bitmap.context;
            const rand = rngFrom(grade.seed + 5081 + (side === 'left' ? 3 : 11));
            for (let i = 0; i < w; i++) {
                const t = side === 'left' ? i / w : 1 - i / w;
                const shade = 0.35 + 0.65 * t;
                ctx.fillStyle = mixHex('#3a2a16', grade.edge, shade * (0.82 + rand() * 0.18));
                ctx.fillRect(i, 0, 1, h);
            }
            // Individual leaves, where the block has fanned.
            for (let i = 0; i < 90; i++) {
                const x = rand() * w;
                ctx.fillStyle = `rgba(30, 20, 10, ${0.05 + rand() * 0.14})`;
                ctx.fillRect(x, rand() * h * 0.1, 1, h - rand() * h * 0.2);
            }
            mark(bitmap);
            return bitmap;
        }

        /** The board the whole thing is bound into. */
        static boards(w, h, grade) {
            const bitmap = new Bitmap(w, h);
            const ctx = bitmap.context;
            const rand = rngFrom(grade.seed + 6551);
            ctx.fillStyle = grade.board;
            ctx.fillRect(0, 0, w, h);
            // Grain in the leather, and the wear along every edge.
            for (let i = 0; i < 2600; i++) {
                const x = rand() * w, y = rand() * h;
                const a = rand() * Math.PI;
                const len = 1 + rand() * 5;
                ctx.strokeStyle = rand() < 0.5
                    ? 'rgba(0, 0, 0, 0.10)' : 'rgba(255, 220, 180, 0.05)';
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
                ctx.stroke();
            }
            const rim = ctx.createLinearGradient(0, 0, 0, h);
            rim.addColorStop(0, 'rgba(255, 220, 180, 0.10)');
            rim.addColorStop(0.06, 'rgba(0, 0, 0, 0)');
            rim.addColorStop(0.94, 'rgba(0, 0, 0, 0)');
            rim.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
            ctx.fillStyle = rim;
            ctx.fillRect(0, 0, w, h);
            mark(bitmap);
            return bitmap;
        }
    }

    //-----------------------------------------------------------------------------
    // TurningPage - one sheet of paper, mid-turn
    //-----------------------------------------------------------------------------
    // A page turn is a developable surface, not a rectangle being squashed: the
    // sheet keeps its width and buys the foreshortening by bowing out of the
    // page. This holds a mesh of that surface, a second mesh over it carrying
    // the light along the curl, and the pose that puts them where they belong.

    class TurningPage {
        constructor(width, height) {
            this._w = width;
            this._h = height;
            const cols = TURN_CONFIG.cols;
            const rows = TURN_CONFIG.rows;
            const n = (cols + 1) * (rows + 1);

            this._verts = new Float32Array(n * 2);
            const uvs = new Float32Array(n * 2);
            const indices = [];
            for (let j = 0; j <= rows; j++) {
                for (let i = 0; i <= cols; i++) {
                    const k = (j * (cols + 1) + i) * 2;
                    uvs[k] = i / cols;
                    uvs[k + 1] = j / rows;
                }
            }
            for (let j = 0; j < rows; j++) {
                for (let i = 0; i < cols; i++) {
                    const a = j * (cols + 1) + i;
                    const b = a + 1;
                    const c = a + cols + 1;
                    const d = c + 1;
                    indices.push(a, b, c, b, d, c);
                }
            }
            this._uvs = uvs;
            this._uvsFlipped = new Float32Array(uvs);
            for (let i = 0; i < n; i++) this._uvsFlipped[i * 2] = 1 - uvs[i * 2];
            this._indices = new Uint16Array(indices);

            this._faceBmp = new Bitmap(width, height);
            this._backBmp = new Bitmap(width, height);
            this._face = new PIXI.SimpleMesh(
                new PIXI.Texture(this._faceBmp.baseTexture),
                this._verts, this._uvs, this._indices);

            // The light along the curl. Its own mesh over the same vertices,
            // multiplied down onto the sheet, so a page that is edge-on to the
            // lamp goes dark exactly where it is edge-on.
            this._shadeBmp = new Bitmap(TURN_CONFIG.cols + 1, 1);
            this._shadeBmp.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;
            this._shade = new PIXI.SimpleMesh(
                new PIXI.Texture(this._shadeBmp.baseTexture),
                this._verts, this._uvs, this._indices);
            this._shade.blendMode = PIXI.BLEND_MODES.MULTIPLY;

            this.container = new PIXI.Container();
            this.container.addChild(this._face);
            this.container.addChild(this._shade);
            this.container.visible = false;
        }

        get frontBitmap() { return this._faceBmp; }
        get backBitmap() { return this._backBmp; }

        show(on) { this.container.visible = !!on; }

        /**
         * Put the sheet where it is at `t` of a turn, 0 to 1, `dir` +1 turning
         * from the right half to the left. The sheet is hinged on the spine at
         * the container's origin.
         */
        pose(t, dir) {
            const cols = TURN_CONFIG.cols;
            const rows = TURN_CONFIG.rows;
            const W = this._w;
            const H = this._h;
            const theta = clamp01(t) * Math.PI;
            const verts = this._verts;
            const shadeCtx = this._shadeBmp.context;

            // Past halfway the reader is looking at the back of the sheet: the
            // other page's content, seen through the paper, so it is mirrored.
            const back = t > 0.5;
            const wanted = back ? this._backBmp : this._faceBmp;
            if (this._face.texture.baseTexture !== wanted.baseTexture) {
                this._face.texture = new PIXI.Texture(wanted.baseTexture);
            }
            const uvs = back ? this._uvsFlipped : this._uvs;
            if (this._lastUvs !== uvs) {
                const buffer = this._face.geometry.getBuffer('aTextureCoord');
                buffer.data.set(uvs);
                buffer.update();
                this._lastUvs = uvs;
            }

            const rise = TURN_CONFIG.lift * H * Math.sin(theta);
            for (let i = 0; i <= cols; i++) {
                const u = i / cols;
                // The middle of the sheet lags the leading edge, most of all
                // halfway through the turn: that lag is the whole curl.
                const bow = TURN_CONFIG.bow * Math.sin(theta) * Math.sin(Math.PI * u);
                const a = theta + bow;
                const r = u * W;
                const x = Math.cos(a) * r * dir;
                const z = Math.sin(a) * r;                 // towards the reader
                const s = 1 + TURN_CONFIG.persp * (z / W); // nearer reads larger
                const sag = TURN_CONFIG.droop * H * u * u * Math.sin(theta);

                // The lamp is up and to the left of the desk: how much of it a
                // strip catches is how square-on that strip is turned to it.
                const lit = clamp01(0.52 + 0.48 * Math.cos(a - 0.5));
                const v = Math.round(lerp(150, 255, lit * lit));
                shadeCtx.fillStyle = `rgb(${v}, ${Math.round(v * 0.99)}, ${Math.round(v * 0.96)})`;
                shadeCtx.fillRect(i, 0, 1, 1);

                for (let j = 0; j <= rows; j++) {
                    const k = (j * (cols + 1) + i) * 2;
                    const vy = j / rows;
                    verts[k] = x;
                    verts[k + 1] = (vy - 0.5) * H * s - rise + sag * vy;
                }
            }
            mark(this._shadeBmp);
            this._face.geometry.getBuffer('aVertexPosition').update();
            this._shade.geometry.getBuffer('aVertexPosition').update();
        }

        /** Carry the sheet off the desk after it has been torn out. */
        poseTorn(x, y, angle, scale) {
            this.container.position.set(x, y);
            this.container.rotation = angle;
            this.container.scale.set(scale, scale);
        }

        resetTransform() {
            this.container.position.set(0, 0);
            this.container.rotation = 0;
            this.container.scale.set(1, 1);
            this.container.alpha = 1;
        }

        destroy() {
            if (this.container && this.container.parent) {
                this.container.parent.removeChild(this.container);
            }
            if (this.container) this.container.destroy({ children: true });
            this.container = null;
            this._face = null;
            this._shade = null;
        }
    }

    //-----------------------------------------------------------------------------
    // BookManager - Enhanced with better text processing
    //-----------------------------------------------------------------------------

    class BookManager {
        static _bookProgress = {};
        static _bookCache = {};
        static _byFile = null;      // book file -> the item that carries it

        /** The book file an item is, or null for anything that is not a book. */
        static bookFileForItem(item) {
            const match = item && item.note && item.note.match(BOOK_TAG);
            return match ? match[1].trim() : null;
        }

        /** The year printed on an item, or null if it does not say. */
        static publishedYearOfItem(item) {
            const match = item && item.note && item.note.match(PUBLISHED_TAG);
            return match ? Number(match[1]) : null;
        }

        /**
         * Every book file the item database knows about, with the item that
         * carries it. Built once, and again if the database is reloaded, since
         * a mod may add books after the first read.
         */
        static itemsByFile() {
            const items = (typeof $dataItems !== 'undefined' && $dataItems) || [];
            if (this._byFile && this._byFileSize === items.length) return this._byFile;
            const map = {};
            for (const item of items) {
                const file = this.bookFileForItem(item);
                if (file && !map[file]) map[file] = item;
            }
            this._byFile = map;
            this._byFileSize = items.length;
            return map;
        }

        static itemForBook(bookName) {
            return this.itemsByFile()[bookName] || null;
        }

        /** The year a book was published, read off the item that carries it. */
        static publishedYear(bookName) {
            return this.publishedYearOfItem(this.itemForBook(bookName));
        }

        /**
         * The item whose use opened the book that is being read. The custom
         * inventory reserves an item's common event directly rather than going
         * through Game_Action, so the last item used is the one thing every
         * path agrees on; a Special verb names its item outright.
         */
        static lastReadItem() {
            const temp = typeof $gameTemp !== 'undefined' ? $gameTemp : null;
            const items = (typeof $dataItems !== 'undefined' && $dataItems) || [];
            const special = temp && temp._specialActionItemId;
            if (special && items[special] && this.bookFileForItem(items[special])) {
                return items[special];
            }
            try {
                const last = $gameParty && $gameParty.lastItem ? $gameParty.lastItem() : null;
                if (this.bookFileForItem(last)) return last;
            } catch (e) { /* no party yet */ }
            return null;
        }

        static loadBook(bookName) {
            if (this._bookCache[bookName]) {
                return this._bookCache[bookName];
            }

            const fs = require('fs');
            const path = require('path');
            const base = path.dirname(process.mainModule.filename);

            // Check for .md first, then .txt, then .json
            const extensions = ['.md', '.txt', '.json'];
            let bookPath = '';
            let ext = '';

            for (const e of extensions) {
                const p = path.join(base, 'books', `${bookName}${e}`);
                if (fs.existsSync(p)) {
                    bookPath = p;
                    ext = e;
                    break;
                }
            }

            if (!bookPath) {
                throw new Error(`Book file not found: ${bookName} (.md, .txt, or .json)`);
            }

            let data = fs.readFileSync(bookPath, 'utf8');
            // Remove BOM if present
            if (data.charCodeAt(0) === 0xFEFF) {
                data = data.slice(1);
            }

            let bookData;
            if (ext === '.json') {
                bookData = JSON.parse(data);
            } else {
                // For .md and .txt, wrap the text in an object with a 'text' property
                bookData = { text: data };
            }

            this._bookCache[bookName] = bookData;
            return bookData;
        }

        static getLastPage(bookName) {
            return this._bookProgress[bookName] || 0;
        }

        static setLastPage(bookName, page) {
            this._bookProgress[bookName] = page;
        }

        static splitIntoPages(text, charsPerPage) {
            const pages = [];
            const paragraphs = text.split(/\n\n+/);
            let currentPage = '';

            for (const paragraph of paragraphs) {
                const trimmedPara = paragraph.trim();
                if (!trimmedPara) continue;

                // Check if adding this paragraph would exceed page limit
                const testPage = currentPage + (currentPage ? '\n\n' : '') + trimmedPara;

                if (testPage.length > charsPerPage) {
                    // If current page has content, save it
                    if (currentPage) {
                        pages.push(currentPage);
                        currentPage = trimmedPara;
                    } else {
                        // Paragraph is too long for one page, split it
                        const words = trimmedPara.split(' ');
                        let tempPage = '';

                        for (const word of words) {
                            const testWord = tempPage + (tempPage ? ' ' : '') + word;
                            if (testWord.length > charsPerPage) {
                                if (tempPage) {
                                    pages.push(tempPage);
                                    tempPage = word;
                                } else {
                                    pages.push(word);
                                    tempPage = '';
                                }
                            } else {
                                tempPage = testWord;
                            }
                        }

                        currentPage = tempPage;
                    }
                } else {
                    currentPage = testPage;
                }
            }

            if (currentPage) {
                pages.push(currentPage);
            }

            // Ensure even number of pages
            if (pages.length % 2 === 1) {
                pages.push('');
            }

            return pages;
        }

        // Best-effort title/author guess so every book can show a cover,
        // even though the source text carries no metadata of its own.
        static parseCoverInfo(text, bookName) {
            const rawLines = text.split(/\r?\n/);
            let title = '';
            let titleIndex = -1;

            for (let i = 0; i < Math.min(rawLines.length, 60); i++) {
                const line = rawLines[i].trim();
                if (!line) continue;
                if (/^\*+/.test(line)) continue;
                if (/^(by|author)[:\s]/i.test(line)) continue;
                if (line.length < 3 || line.length > 60) continue;
                title = line;
                titleIndex = i;
                break;
            }

            let author = '';
            if (titleIndex >= 0) {
                const searchEnd = Math.min(rawLines.length, titleIndex + 20);
                for (let i = titleIndex + 1; i < searchEnd; i++) {
                    const line = rawLines[i].trim();
                    if (!line) continue;
                    const match = line.match(/^by\s+(.+)$/i);
                    if (match) {
                        author = match[1].trim();
                        break;
                    }
                    if (line.length > 60) break;
                }
            }

            if (!title) {
                title = bookName
                    .replace(/[_-]+/g, ' ')
                    .replace(/\b\w/g, c => c.toUpperCase())
                    .trim() || bookName;
            }

            return { title, author };
        }
    }

    //-----------------------------------------------------------------------------
    // Scene_BookViewer - Custom scene without RPG Maker windows
    //-----------------------------------------------------------------------------

    class Scene_BookViewer extends Scene_Base {
        prepare(bookName) {
            this._bookName = bookName;
            this._config = BOOK_CONFIG;
            this._fontConfig = FONT_CONFIG.size;
        }

        create() {
            super.create();
            // How worn this copy is, read once. Everything drawn below asks it.
            this._grade = BookAge.gradeFor(this._bookName);
            // Which pages have been torn out. Scene-local on purpose: the book
            // is whole again the next time it is opened.
            this._torn = new Set();
            this.createBackground();
            this.loadBookData();
            this.createBookDisplay();
            this.createBookmarkLayer();
            this.createPageFlipLayer();
            this.setupEventHandlers();
            this.startOpeningAnimation();
        }

        loadBookData() {
            try {
                const bookData = BookManager.loadBook(this._bookName);
                const contentPages = BookManager.splitIntoPages(
                    bookData.text,
                    this._config.charsPerPage
                );
                const cover = BookManager.parseCoverInfo(bookData.text, this._bookName);

                // The cover always takes the first page slot; pad back to an
                // even count so the left/right pairing stays intact.
                this._pages = [{ cover: true, title: cover.title, author: cover.author }, ...contentPages];
                if (this._pages.length % 2 !== 0) {
                    this._pages.push('');
                }

                this._currentPageIndex = BookManager.getLastPage(this._bookName);
                this._totalPages = this._pages.length;
                // Opening it is the first half of what a book is worth.
                this.rewardReading('open');
            } catch (e) {
                console.error(e);
                SceneManager.goto(Scene_Map);
            }
        }

        createBackground() {
            // The desk the book is lying on: old wood, and a lamp above left.
            this._backgroundSprite = new Sprite();
            this._backgroundSprite.bitmap = new Bitmap(Graphics.width, Graphics.height);

            const bitmap = this._backgroundSprite.bitmap;
            const ctx = bitmap.context;
            const rand = rngFrom(this._grade.seed + 104729);

            ctx.fillStyle = this._grade.desk;
            ctx.fillRect(0, 0, Graphics.width, Graphics.height);

            // Wood grain, running the length of the desk.
            for (let i = 0; i < 320; i++) {
                const y = rand() * Graphics.height;
                const h = 1 + rand() * 3;
                ctx.fillStyle = rand() < 0.5
                    ? `rgba(0, 0, 0, ${0.03 + rand() * 0.07})`
                    : `rgba(255, 210, 160, ${0.01 + rand() * 0.03})`;
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.bezierCurveTo(
                    Graphics.width * 0.33, y + (rand() - 0.5) * 26,
                    Graphics.width * 0.66, y + (rand() - 0.5) * 26,
                    Graphics.width, y + (rand() - 0.5) * 14);
                ctx.lineWidth = h;
                ctx.strokeStyle = ctx.fillStyle;
                ctx.stroke();
            }

            // The lamp, and the dark the desk falls away into at the corners.
            const lamp = ctx.createRadialGradient(
                Graphics.width * 0.34, Graphics.height * 0.18, 0,
                Graphics.width * 0.5, Graphics.height * 0.5, Graphics.width * 0.78);
            lamp.addColorStop(0, 'rgba(255, 226, 170, 0.16)');
            lamp.addColorStop(0.45, 'rgba(0, 0, 0, 0)');
            lamp.addColorStop(1, 'rgba(0, 0, 0, 0.62)');
            ctx.fillStyle = lamp;
            ctx.fillRect(0, 0, Graphics.width, Graphics.height);

            mark(bitmap);
            this.addChild(this._backgroundSprite);
        }

        createBookDisplay() {
            const grade = this._grade;
            const cfg = this._config;
            this._bookContainer = new Sprite();
            this._bookContainer.x = Graphics.width / 2;
            this._bookContainer.y = Graphics.height / 2;

            const bookWidth = Graphics.width - cfg.margin.outer * 2;
            const bookHeight = Graphics.height - cfg.margin.top - cfg.margin.bottom;
            const halfWidth = bookWidth / 2;
            this._bookWidth = bookWidth;
            this._bookHeight = bookHeight;

            const centred = (sprite) => {
                sprite.anchor.x = 0.5;
                sprite.anchor.y = 0.5;
                return sprite;
            };

            // The shadow the whole book casts on the desk, thrown down and to
            // the right, away from the lamp.
            this._bookShadow = centred(new Sprite());
            this._bookShadow.bitmap = new Bitmap(bookWidth + 60, bookHeight + 60);
            this._bookShadow.bitmap.fillRect(0, 0, bookWidth + 60, bookHeight + 60, 'rgba(0, 0, 0, 0.45)');
            this._bookShadow.x = 14;
            this._bookShadow.y = 18;
            this._bookShadow.filters = [new PIXI.filters.BlurFilter(18)];
            this._bookContainer.addChild(this._bookShadow);

            // The boards, standing proud of the block on every side.
            const over = cfg.boardOverhang;
            this._boards = centred(new Sprite());
            this._boards.bitmap = PaperMill.boards(bookWidth + over * 2, bookHeight + over * 2, grade);
            this._bookContainer.addChild(this._boards);

            // The block of leaves under each open half, seen edge on.
            const depth = cfg.blockDepth;
            this._blockLeft = centred(new Sprite());
            this._blockLeft.bitmap = PaperMill.block(depth, bookHeight + 6, grade, 'left');
            this._blockLeft.x = -halfWidth - depth / 2 + 2;
            this._bookContainer.addChild(this._blockLeft);

            this._blockRight = centred(new Sprite());
            this._blockRight.bitmap = PaperMill.block(depth, bookHeight + 6, grade, 'right');
            this._blockRight.x = halfWidth + depth / 2 - 2;
            this._bookContainer.addChild(this._blockRight);

            // The two sheets on show. Milled once and left alone: the words are
            // drawn on their own transparent layer above.
            this._paperLeft = centred(new Sprite());
            this._paperLeft.bitmap = PaperMill.sheet(halfWidth, bookHeight, grade, 'left', 0);
            this._paperLeft.x = -halfWidth / 2;
            this._bookContainer.addChild(this._paperLeft);

            this._paperRight = centred(new Sprite());
            this._paperRight.bitmap = PaperMill.sheet(halfWidth, bookHeight, grade, 'right', 1);
            this._paperRight.x = halfWidth / 2;
            this._bookContainer.addChild(this._paperRight);

            // What is left of a page that has been torn out.
            this._stubLeft = centred(new Sprite());
            this._stubLeft.bitmap = PaperMill.stub(halfWidth, bookHeight, grade, 'left');
            this._stubLeft.x = -halfWidth / 2;
            this._stubLeft.visible = false;
            this._bookContainer.addChild(this._stubLeft);

            this._stubRight = centred(new Sprite());
            this._stubRight.bitmap = PaperMill.stub(halfWidth, bookHeight, grade, 'right');
            this._stubRight.x = halfWidth / 2;
            this._stubRight.visible = false;
            this._bookContainer.addChild(this._stubRight);

            // The words.
            this._leftPageText = new Sprite();
            this._leftPageText.bitmap = new Bitmap(halfWidth - cfg.padding, bookHeight - cfg.padding * 2);
            this._leftPageText.anchor.x = 1;
            this._leftPageText.anchor.y = 0.5;
            this._leftPageText.x = -cfg.spineWidth / 2 - 10;
            this._bookContainer.addChild(this._leftPageText);

            this._rightPageText = new Sprite();
            this._rightPageText.bitmap = new Bitmap(halfWidth - cfg.padding, bookHeight - cfg.padding * 2);
            this._rightPageText.anchor.x = 0;
            this._rightPageText.anchor.y = 0.5;
            this._rightPageText.x = cfg.spineWidth / 2 + 10;
            this._bookContainer.addChild(this._rightPageText);

            // The spine, and the dark where the two halves fall away into it.
            this._gutter = centred(new Sprite());
            this._gutter.bitmap = new Bitmap(120, bookHeight);
            const gCtx = this._gutter.bitmap.context;
            const gGrad = gCtx.createLinearGradient(0, 0, 120, 0);
            gGrad.addColorStop(0, 'rgba(26, 16, 8, 0)');
            gGrad.addColorStop(0.34, 'rgba(26, 16, 8, 0.26)');
            gGrad.addColorStop(0.5, 'rgba(18, 11, 5, 0.62)');
            gGrad.addColorStop(0.66, 'rgba(26, 16, 8, 0.26)');
            gGrad.addColorStop(1, 'rgba(26, 16, 8, 0)');
            gCtx.fillStyle = gGrad;
            gCtx.fillRect(0, 0, 120, bookHeight);
            gCtx.fillStyle = mixHex('#3d2817', '#1d1109', grade.wear);
            gCtx.fillRect(60 - cfg.spineWidth / 2, 0, cfg.spineWidth, bookHeight);
            mark(this._gutter.bitmap);
            this._bookContainer.addChild(this._gutter);

            // The shadow a lifting page throws across the page beneath it.
            this._flipShadow = new Sprite();
            this._flipShadow.bitmap = new Bitmap(200, bookHeight);
            const sCtx = this._flipShadow.bitmap.context;
            const sGrad = sCtx.createLinearGradient(0, 0, 200, 0);
            sGrad.addColorStop(0, 'rgba(0, 0, 0, 0.42)');
            sGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.16)');
            sGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            sCtx.fillStyle = sGrad;
            sCtx.fillRect(0, 0, 200, bookHeight);
            mark(this._flipShadow.bitmap);
            this._flipShadow.anchor.x = 0;
            this._flipShadow.anchor.y = 0.5;
            this._flipShadow.visible = false;
            this._bookContainer.addChild(this._flipShadow);

            this.addChild(this._bookContainer);
            this._bookContainer.opacity = 0;
        }

        createPageFlipLayer() {
            this._flipContainer = new Sprite();
            this._flipContainer.x = Graphics.width / 2;
            this._flipContainer.y = Graphics.height / 2;

            const halfWidth = this._bookWidth / 2;
            this._turning = new TurningPage(halfWidth, this._bookHeight);
            this._flipContainer.addChild(this._turning.container);
            this.addChild(this._flipContainer);

            this._flipAnimation = {
                active: false,
                manual: false,      // the reader is holding the page, not the clock
                progress: 0,
                duration: 26,
                direction: 1,
                startPage: 0,
                endPage: 0,
                t: 0,
                from: 0,            // where a released page is springing from
                target: 0
            };
            this._tearAnimation = null;
        }

        //-------------------------------------------------------------------
        // What the reader gets out of it
        //-------------------------------------------------------------------

        /**
         * Pay the reader for this book. `stage` is 'open' or 'done'; who is
         * owed what, and whether they have been paid before, is entirely
         * window.BookLearning's business.
         */
        rewardReading(stage) {
            const B = window.BookLearning;
            if (!B || !B.award) return;
            try { B.award(this._bookName, stage); } catch (e) {
                console.warn('BookViewer: the reading award threw', e);
            }
        }

        /** The last page turned is the rest of what the book is worth. */
        checkFinished() {
            if (this._totalPages > 2 && this._currentPageIndex >= this._totalPages - 2) {
                this.rewardReading('done');
            }
        }

        //-------------------------------------------------------------------
        // Bookmarks
        //-------------------------------------------------------------------

        /** The ribbons left in this book, as page indexes. */
        bookmarks() {
            const B = window.BookLearning;
            return (B && B.bookmarks) ? B.bookmarks(this._bookName) : [];
        }

        /**
         * Where each ribbon sits, in the book's own coordinates: one tab out of
         * the fore-edge of the right-hand half, in the order they were left.
         */
        bookmarkRects() {
            const cfg = BOOKMARK_CONFIG;
            const half = this._bookWidth / 2;
            const top = -this._bookHeight / 2 + this._bookHeight * cfg.top;
            return this.bookmarks().map((page, i) => ({
                page,
                x: half + 8,
                y: top + i * (cfg.height + cfg.gap),
                w: cfg.stick,
                h: cfg.height,
                silk: cfg.silks[i % cfg.silks.length]
            }));
        }

        createBookmarkLayer() {
            const cfg = BOOKMARK_CONFIG;
            this._bookmarkLayer = new Sprite();
            this._bookmarkLayer.bitmap = new Bitmap(cfg.stick + 4, this._bookHeight);
            this._bookmarkLayer.anchor.x = 0;
            this._bookmarkLayer.anchor.y = 0.5;
            this._bookmarkLayer.x = this._bookWidth / 2 + 8;
            this._bookContainer.addChild(this._bookmarkLayer);
            this.refreshBookmarks();
        }

        /** Redraw every ribbon. The open one is the one lying wider and paler. */
        refreshBookmarks() {
            const layer = this._bookmarkLayer;
            if (!layer || !layer.bitmap) return;
            const bitmap = layer.bitmap;
            bitmap.clear();
            const ctx = bitmap.context;
            const originY = this._bookHeight / 2;
            this.bookmarkRects().forEach(rect => {
                const here = rect.page === this._currentPageIndex ||
                             rect.page === this._currentPageIndex + 1;
                const y = rect.y + originY;
                const w = here ? rect.w : rect.w - 6;
                ctx.fillStyle = rect.silk;
                ctx.fillRect(0, y, w, rect.h);
                // The notch cut in the free end, and the fold where the silk
                // goes back over the edge of the page.
                ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
                ctx.beginPath();
                ctx.moveTo(w, y);
                ctx.lineTo(w - 7, y + rect.h / 2);
                ctx.lineTo(w, y + rect.h);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
                ctx.fillRect(0, y, 4, rect.h);
                if (here) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                    ctx.fillRect(0, y, w, 3);
                }
            });
            mark(bitmap);
        }

        /** Drop a ribbon on the page on show, or lift the one already there. */
        toggleBookmark() {
            const B = window.BookLearning;
            if (!B || !B.toggleBookmark) return;
            const page = this._currentPageIndex;
            const result = B.toggleBookmark(this._bookName, page);
            if (!result) return;
            this.refreshBookmarks();
            AudioManager.playSe({
                name: 'Book1', volume: 45,
                pitch: result === 'set' ? 130 : 90, pan: 0
            });
        }

        /** Fall open at a page a ribbon is marking. */
        goToBookmark(page) {
            let target = Math.max(0, Math.min(page, this._totalPages - 2));
            if (target % 2 !== 0) target--;
            if (target === this._currentPageIndex) return;
            this.startFlipAnimation(target > this._currentPageIndex ? 1 : -1, target, 18);
        }

        /** The next ribbon after the page on show, wrapping round to the first. */
        nextBookmark() {
            const marks = this.bookmarks();
            if (!marks.length) return;
            const sorted = marks.slice().sort((a, b) => a - b);
            const next = sorted.find(p => p > this._currentPageIndex + 1);
            this.goToBookmark(next !== undefined ? next : sorted[0]);
        }

        /** The ribbon under the pointer, or null. */
        bookmarkAt(at) {
            return this.bookmarkRects().find(r =>
                at.x >= r.x && at.x <= r.x + r.w &&
                at.y >= r.y && at.y <= r.y + r.h) || null;
        }

        //-------------------------------------------------------------------
        // Input
        //-------------------------------------------------------------------

        setupEventHandlers() {
            this._mouseHandler = this.handleMouse.bind(this);
            this._wheelHandler = this.handleWheel.bind(this);
            this._downHandler = this.onMouseDown.bind(this);
            this._moveHandler = this.onMouseMove.bind(this);
            this._upHandler = this.onMouseUp.bind(this);
            document.addEventListener('click', this._mouseHandler);
            document.addEventListener('wheel', this._wheelHandler);
            document.addEventListener('mousedown', this._downHandler);
            document.addEventListener('mousemove', this._moveHandler);
            document.addEventListener('mouseup', this._upHandler);
        }

        /** Where the pointer is, in the book's own coordinates. */
        pointerAt(event) {
            return {
                x: Graphics.pageToCanvasX(event.pageX) - Graphics.width / 2,
                y: Graphics.pageToCanvasY(event.pageY) - Graphics.height / 2
            };
        }

        onMouseDown(event) {
            if (event.button !== 0) return;
            if (this._flipAnimation.active || this._isClosing || this._tearAnimation) return;
            if (this._openingAnimation && this._openingAnimation.active) return;
            const at = this.pointerAt(event);
            const halfW = this._bookWidth / 2;
            const halfH = this._bookHeight / 2;
            if (Math.abs(at.x) > halfW || Math.abs(at.y) > halfH) return;

            if (this.bookmarkAt(at)) return;

            const direction = at.x >= 0 ? 1 : -1;
            if (direction > 0 && this._currentPageIndex >= this._totalPages - 2) return;
            if (direction < 0 && this._currentPageIndex <= 0) return;

            // Taking hold of a page is the same lift as turning it, only the
            // reader supplies the progress instead of the clock.
            this.startFlipAnimation(direction, undefined, 26, true);
            this._drag = {
                direction,
                grabX: at.x,
                x: at.x, y: at.y,
                // The last moment of the gesture, as points in time and space:
                // a fling is how fast the hand was going when it let go.
                trail: [{ x: at.x, y: at.y, t: this.now(event) }],
                moved: false,
                page: direction > 0 ? this._currentPageIndex + 1 : this._currentPageIndex
            };
            // A new press is a new gesture, whatever the last one left behind.
            this._swallowClick = false;
            this._flipAnimation.t = 0;
            this._turning.pose(0, direction);
        }

        onMouseMove(event) {
            const drag = this._drag;
            if (!drag || !this._flipAnimation.manual) return;
            // The button was let go somewhere this scene never heard about.
            if (event.buttons === 0) { this.onMouseUp(event); return; }
            const at = this.pointerAt(event);
            drag.x = at.x;
            drag.y = at.y;
            this.recordDrag(drag, at, this.now(event));
            if (Math.abs(at.x - drag.grabX) > 6) drag.moved = true;

            // The sheet follows the hand across the width of the half it came
            // from, and no further.
            const travel = (drag.grabX - at.x) * drag.direction;
            this._flipAnimation.t = clamp01(travel / (this._bookWidth / 2));
            this._turning.pose(this._flipAnimation.t, drag.direction);
            this.updateFlipShadow(this._flipAnimation.t, drag.direction);

            if (this.isFlungOut(at, drag)) this.tearPage(drag, at);
        }

        onMouseUp(event) {
            const drag = this._drag;
            if (!drag || !this._flipAnimation.manual) return;
            const at = this.pointerAt(event);
            this.recordDrag(drag, at, this.now(event));
            if (this.isFlungOut(at, drag)) { this.tearPage(drag, at); return; }

            const anim = this._flipAnimation;
            this._drag = null;

            // A press that never moved is a click, not a grip: put the sheet
            // straight back and let the click handler turn the page the way it
            // always has.
            if (!drag.moved) {
                anim.active = false;
                anim.manual = false;
                this._turning.show(false);
                if (this._flipShadow) this._flipShadow.visible = false;
                return;
            }

            // Let go past halfway and the page falls the rest of the way over;
            // let go short of it and it drops back where it came from.
            anim.manual = false;
            anim.from = anim.t;
            anim.target = anim.t > 0.5 ? 1 : 0;
            anim.progress = 0;
            anim.duration = Math.max(6, Math.round(20 * Math.abs(anim.target - anim.from)));
            this._swallowClick = true;
        }

        /** The clock a gesture is measured against. */
        now(event) {
            if (event && isFinite(event.timeStamp)) return event.timeStamp;
            return (typeof performance !== 'undefined' ? performance.now() : Date.now());
        }

        /** Keep the last moment of the drag, and nothing older than it. */
        recordDrag(drag, at, t) {
            drag.trail.push({ x: at.x, y: at.y, t });
            while (drag.trail.length > 2 && t - drag.trail[0].t > TEAR_CONFIG.window) {
                drag.trail.shift();
            }
        }

        /** How fast the hand was moving over that last moment, in px per ms. */
        dragSpeed(drag) {
            const trail = drag && drag.trail;
            if (!trail || trail.length < 2) return 0;
            const a = trail[0];
            const b = trail[trail.length - 1];
            const dt = b.t - a.t;
            if (!(dt > 0)) return 0;
            return Math.hypot(b.x - a.x, b.y - a.y) / dt;
        }

        /**
         * A page comes out when it is dragged off the screen quickly. Both
         * halves of that matter: a slow walk to the edge is somebody reading
         * awkwardly, and a fast flick across the middle is somebody turning
         * the page in a hurry.
         */
        isFlungOut(at, drag) {
            if (this._flipAnimation.t < TEAR_CONFIG.grip) return false;
            if (this.dragSpeed(drag) < TEAR_CONFIG.flick) return false;
            if (drag.page <= 0) return false;   // the cover stays on
            const m = TEAR_CONFIG.margin;
            return Math.abs(at.x) > Graphics.width / 2 - m ||
                   Math.abs(at.y) > Graphics.height / 2 - m;
        }

        handleMouse(event) {
            if (this._flipAnimation.active || this._isClosing || this._tearAnimation) return;
            // A click that was the end of a drag has already been answered.
            if (this._swallowClick) { this._swallowClick = false; return; }

            // A ribbon is a target, not a page: clicking one falls open at it.
            const ribbon = this.bookmarkAt(this.pointerAt(event));
            if (ribbon) { this.goToBookmark(ribbon.page); return; }

            const x = Graphics.pageToCanvasX(event.pageX);
            const centerX = Graphics.width / 2;

            if (x < centerX) {
                this.previousPage();
            } else {
                this.nextPage();
            }
        }

        handleWheel(event) {
            if (this._flipAnimation.active || this._isClosing || this._tearAnimation) return;

            if (event.deltaY > 0) {
                this.nextPage();
            } else {
                this.previousPage();
            }
            event.preventDefault();
        }

        //-------------------------------------------------------------------
        // Tearing a page out
        //-------------------------------------------------------------------

        tearPage(drag, at) {
            this._torn.add(drag.page);
            this._drag = null;
            this._swallowClick = true;

            const anim = this._flipAnimation;
            anim.active = false;
            anim.manual = false;

            // The sheet keeps going the way it was thrown, turning over as it
            // goes, and is gone by the time it reaches the edge of the desk.
            const away = Math.atan2(at.y, at.x);
            this._tearAnimation = {
                progress: 0,
                duration: 26,
                x: at.x, y: at.y,
                vx: Math.cos(away) * 46,
                vy: Math.sin(away) * 46,
                spin: (at.x >= 0 ? 1 : -1) * 0.09
            };
            this._turning.pose(0.5, drag.direction);
            this._turning.show(true);
            if (this._flipShadow) this._flipShadow.visible = false;

            AudioManager.playSe({ name: 'Slash2', volume: 55, pitch: 70, pan: 0 });
            this.drawCurrentPages();
        }

        updateTearAnimation() {
            const anim = this._tearAnimation;
            anim.progress++;
            const t = anim.progress / anim.duration;
            anim.x += anim.vx;
            anim.y += anim.vy;
            anim.vy += 2.4;             // it falls as it flies
            this._turning.poseTorn(anim.x, anim.y, anim.progress * anim.spin, 1 - t * 0.25);
            this._turning.container.alpha = 1 - this.easeInCubic(t);

            if (anim.progress >= anim.duration) {
                this._tearAnimation = null;
                this._turning.show(false);
                this._turning.resetTransform();
            }
        }

        //-------------------------------------------------------------------
        // Frame
        //-------------------------------------------------------------------

        startOpeningAnimation() {
            this._openingAnimation = {
                active: true,
                progress: 0,
                duration: 30
            };
        }

        update() {
            super.update();

            if (this._openingAnimation && this._openingAnimation.active) {
                this.updateOpeningAnimation();
            } else if (this._closingAnimation && this._closingAnimation.active) {
                this.updateClosingAnimation();
            } else if (this._tearAnimation) {
                this.updateTearAnimation();
            } else if (this._flipAnimation.manual) {
                // The reader is holding the page: nothing moves until they do.
            } else if (this._flipAnimation.active) {
                this.updateFlipAnimation();
            } else {
                this.updateInput();
            }
        }

        updateOpeningAnimation() {
            const anim = this._openingAnimation;
            anim.progress++;

            const t = anim.progress / anim.duration;
            const eased = this.easeOutCubic(t);

            this._bookContainer.opacity = eased * 255;
            this._bookContainer.scale.x = 0.8 + eased * 0.2;
            this._bookContainer.scale.y = 0.8 + eased * 0.2;

            if (anim.progress >= anim.duration) {
                anim.active = false;
                this._bookContainer.scale.x = 1;
                this._bookContainer.scale.y = 1;
                this.drawCurrentPages();
            }
        }

        updateClosingAnimation() {
            const anim = this._closingAnimation;
            anim.progress++;

            const t = anim.progress / anim.duration;
            const eased = this.easeInCubic(t);

            this._bookContainer.opacity = 255 * (1 - eased);
            this._bookContainer.scale.x = 1 - eased * 0.2;
            this._bookContainer.scale.y = 1 - eased * 0.2;

            if (anim.progress >= anim.duration) {
                BookManager.setLastPage(this._bookName, this._currentPageIndex);
                SceneManager.pop();
            }
        }

        /** The shadow the lifted sheet throws onto the page it is uncovering. */
        updateFlipShadow(t, direction) {
            if (!this._flipShadow) return;
            const strength = Math.sin(clamp01(t) * Math.PI);
            this._flipShadow.visible = strength > 0.02;
            this._flipShadow.opacity = 235 * strength;
            // It falls on whichever half the sheet is currently leaning over,
            // and crosses the spine with it halfway through the turn.
            const side = clamp01(t) < 0.5 ? direction : -direction;
            this._flipShadow.scale.x = side * (0.35 + 0.65 * strength);
        }

        updateFlipAnimation() {
            if (!this._turning) {
                this._flipAnimation.active = false;
                return;
            }

            const anim = this._flipAnimation;
            anim.progress++;

            const rawT = Math.min(1, anim.progress / anim.duration);
            // One interpolation, whatever started the turn: a keypress runs the
            // whole arc from 0 to 1, a released page springs from wherever the
            // hand let go of it to whichever end it was nearer.
            anim.t = lerp(anim.from, anim.target, this.easeInOutQuad(rawT));

            this._turning.pose(anim.t, anim.direction);
            this.updateFlipShadow(anim.t, anim.direction);

            if (anim.progress >= anim.duration) {
                anim.active = false;
                this._turning.show(false);
                if (this._flipShadow) this._flipShadow.visible = false;
                if (anim.target > 0.5) {
                    this._currentPageIndex = anim.endPage;
                    AudioManager.playSe({ name: 'Book1', volume: 50, pitch: 100, pan: 0 });
                }
                this.drawCurrentPages();
            }
        }

        updateInput() {
            // 'run' and 'kick' are the L2/R2 (LT/RT) action slots in this
            // game's gamepad map, reused here as jump-to-cover / jump-to-end.
            if (Input.isTriggered('cancel') || TouchInput.isTriggered() && TouchInput.isLongPressed()) {
                this.onCancel();
            } else if (Input.isTriggered('ok')) {
                this.toggleBookmark();
            } else if (Input.isTriggered('menu')) {
                this.nextBookmark();
            } else if (Input.isTriggered('run')) {
                this.goToStart();
            } else if (Input.isTriggered('kick')) {
                this.goToEnd();
            } else if (Input.isRepeated('pagedown')) {
                // R1 on a gamepad, Page Down on keyboard
                this.jumpForward();
            } else if (Input.isRepeated('pageup')) {
                // L1 on a gamepad, Page Up on keyboard
                this.jumpBackward();
            } else if (Input.isRepeated('down')) {
                this.jumpForward();
            } else if (Input.isRepeated('up')) {
                this.jumpBackward();
            } else if (Input.isRepeated('right')) {
                this.nextPage();
            } else if (Input.isRepeated('left')) {
                this.previousPage();
            }
        }

        //-------------------------------------------------------------------
        // Drawing
        //-------------------------------------------------------------------

        isTorn(index) {
            return this._torn && this._torn.has(index);
        }

        drawCurrentPages() {
            if (!this._leftPageText || !this._rightPageText ||
                !this._leftPageText.bitmap || !this._rightPageText.bitmap) {
                console.warn('BookViewer: Page text sprites not initialized');
                return;
            }

            const leftTorn = this.isTorn(this._currentPageIndex);
            const rightTorn = this.isTorn(this._currentPageIndex + 1);

            // A torn-out page shows the well it left behind rather than paper.
            if (this._paperLeft) this._paperLeft.visible = !leftTorn;
            if (this._paperRight) this._paperRight.visible = !rightTorn;
            if (this._stubLeft) this._stubLeft.visible = leftTorn;
            if (this._stubRight) this._stubRight.visible = rightTorn;

            this.drawPage(this._leftPageText.bitmap,
                leftTorn ? '' : (this._pages[this._currentPageIndex] || ''), true);
            this.drawPage(this._rightPageText.bitmap,
                rightTorn ? '' : (this._pages[this._currentPageIndex + 1] || ''), false);

            this.drawPageNumbers();
            this.refreshBookmarks();
            this.checkFinished();
        }

        /** The words only. The paper they sit on is drawn once, underneath. */
        drawPage(bitmap, page, isLeft) {
            bitmap.clear();

            if (!page) return;

            if (typeof page === 'object' && page.cover) {
                this.drawCoverPage(bitmap, page.title, page.author);
                return;
            }

            const text = page;
            const grade = this._grade;

            bitmap.fontFace = FONT_CONFIG.family;
            bitmap.fontSize = this._fontConfig.text;
            bitmap.textColor = grade.ink;
            bitmap.paintOpacity = Math.round(255 * grade.inkAlpha);

            const lines = this.wrapText(text, bitmap.width - 20);
            const lineHeight = this._fontConfig.text * FONT_CONFIG.lineHeight;

            for (let i = 0; i < lines.length; i++) {
                const y = 10 + i * lineHeight;
                if (y + lineHeight > bitmap.height) break;

                bitmap.drawText(lines[i], 10, y, bitmap.width - 20, lineHeight, isLeft ? 'left' : 'left');
            }
            bitmap.paintOpacity = 255;
        }

        /** One sheet of the book as it appears mid-turn: paper, then words. */
        composeTurningFace(bitmap, page, isLeft) {
            bitmap.clear();
            const source = isLeft ? this._paperLeft : this._paperRight;
            if (source && source.bitmap) {
                bitmap.blt(source.bitmap, 0, 0, source.bitmap.width, source.bitmap.height, 0, 0);
            }
            const inkW = bitmap.width - this._config.padding;
            const inkH = bitmap.height - this._config.padding * 2;
            if (!this._inkScratch || this._inkScratch.width !== inkW) {
                this._inkScratch = new Bitmap(inkW, inkH);
            }
            this.drawPage(this._inkScratch, page, isLeft);
            const x = isLeft ? bitmap.width - inkW - this._config.spineWidth / 2 - 10
                             : this._config.spineWidth / 2 + 10;
            bitmap.blt(this._inkScratch, 0, 0, inkW, inkH, Math.max(0, x), this._config.padding);
            mark(bitmap);
        }

        drawCoverPage(bitmap, title, author) {
            const w = bitmap.width;
            const h = bitmap.height;
            const ctx = bitmap.context;
            const grade = this._grade;

            // Decorative double border, worn thin on an old book.
            const inset = 14;
            ctx.strokeStyle = `rgba(61, 40, 23, ${0.55 * grade.inkAlpha})`;
            ctx.lineWidth = 2;
            ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
            ctx.lineWidth = 1;
            ctx.strokeRect(inset + 6, inset + 6, w - (inset + 6) * 2, h - (inset + 6) * 2);
            mark(bitmap);

            bitmap.fontFace = FONT_CONFIG.family;
            bitmap.fontSize = this._fontConfig.title;
            bitmap.textColor = grade.titleInk;
            bitmap.paintOpacity = Math.round(255 * grade.inkAlpha);

            const titleLines = this.wrapText(title || '', w - 80);
            const lineHeight = this._fontConfig.title * FONT_CONFIG.lineHeight;
            const blockHeight = titleLines.length * lineHeight;
            let y = h / 2 - blockHeight / 2 - (author ? 30 : 0);

            for (const line of titleLines) {
                bitmap.drawText(line, 20, y, w - 40, lineHeight, 'center');
                y += lineHeight;
            }

            // Flourish beneath the title
            ctx.strokeStyle = `rgba(139, 115, 85, ${0.6 * grade.inkAlpha})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(w / 2 - 40, y + 8);
            ctx.lineTo(w / 2 + 40, y + 8);
            ctx.stroke();
            mark(bitmap);

            if (author) {
                bitmap.fontSize = this._fontConfig.pageNumber + 4;
                bitmap.textColor = FONT_CONFIG.color.pageNumber;
                bitmap.drawText(author, 20, y + 20, w - 40, 30, 'center');
            }
            bitmap.paintOpacity = 255;
        }

        drawPageNumbers() {
            const leftPage = this._pages[this._currentPageIndex];
            const rightPage = this._pages[this._currentPageIndex + 1];
            const leftNum = this._currentPageIndex + 1;
            const rightNum = this._currentPageIndex + 2;

            const numY = this._leftPageText.bitmap.height - 30;

            // A torn-out page takes its number with it.
            if (leftNum <= this._totalPages && !(leftPage && leftPage.cover) &&
                !this.isTorn(this._currentPageIndex)) {
                this._leftPageText.bitmap.fontSize = this._fontConfig.pageNumber;
                this._leftPageText.bitmap.textColor = FONT_CONFIG.color.pageNumber;
                this._leftPageText.bitmap.drawText(
                    leftNum.toString(),
                    10,
                    numY,
                    this._leftPageText.bitmap.width - 20,
                    30,
                    'center'
                );
            }

            if (rightNum <= this._totalPages && !(rightPage && rightPage.cover) &&
                !this.isTorn(this._currentPageIndex + 1)) {
                this._rightPageText.bitmap.fontSize = this._fontConfig.pageNumber;
                this._rightPageText.bitmap.textColor = FONT_CONFIG.color.pageNumber;
                this._rightPageText.bitmap.drawText(
                    rightNum.toString(),
                    10,
                    numY,
                    this._rightPageText.bitmap.width - 20,
                    30,
                    'center'
                );
            }
        }

        wrapText(text, maxWidth) {
            const words = text.split(' ');
            const lines = [];
            let currentLine = '';

            const testBitmap = new Bitmap(1, 1);
            testBitmap.fontFace = FONT_CONFIG.family;
            testBitmap.fontSize = this._fontConfig.text;

            for (const word of words) {
                // Handle line breaks in text
                if (word.includes('\n')) {
                    const parts = word.split('\n');
                    for (let i = 0; i < parts.length; i++) {
                        if (i === 0) {
                            const testLine = currentLine + (currentLine ? ' ' : '') + parts[i];
                            const testWidth = testBitmap.measureTextWidth(testLine);

                            if (testWidth > maxWidth && currentLine) {
                                lines.push(currentLine);
                                currentLine = parts[i];
                            } else {
                                currentLine = testLine;
                            }
                        } else {
                            if (currentLine) {
                                lines.push(currentLine);
                            }
                            currentLine = parts[i];
                        }
                    }
                } else {
                    const testLine = currentLine + (currentLine ? ' ' : '') + word;
                    const testWidth = testBitmap.measureTextWidth(testLine);

                    if (testWidth > maxWidth && currentLine) {
                        lines.push(currentLine);
                        currentLine = word;
                    } else {
                        currentLine = testLine;
                    }
                }
            }

            if (currentLine) {
                lines.push(currentLine);
            }

            return lines;
        }

        //-------------------------------------------------------------------
        // Paging
        //-------------------------------------------------------------------

        nextPage() {
            if (this._flipAnimation.active || this._currentPageIndex >= this._totalPages - 2) return;

            this.startFlipAnimation(1);
        }

        previousPage() {
            if (this._flipAnimation.active || this._currentPageIndex <= 0) return;

            this.startFlipAnimation(-1);
        }

        jumpForward() {
            if (this._flipAnimation.active) return;

            let targetPage = this._currentPageIndex + 10;
            if (targetPage % 2 !== 0) targetPage--;
            if (targetPage >= this._totalPages - 1) targetPage = this._totalPages - 2;
            if (targetPage <= this._currentPageIndex) return;

            this.startFlipAnimation(1, targetPage, 16);
        }

        jumpBackward() {
            if (this._flipAnimation.active) return;

            let targetPage = this._currentPageIndex - 10;
            if (targetPage % 2 !== 0) targetPage++;
            if (targetPage < 0) targetPage = 0;
            if (targetPage >= this._currentPageIndex) return;

            this.startFlipAnimation(-1, targetPage, 16);
        }

        goToStart() {
            if (this._flipAnimation.active || this._currentPageIndex <= 0) return;
            this.startFlipAnimation(-1, 0, 20);
        }

        goToEnd() {
            if (this._flipAnimation.active) return;
            const lastPage = this._totalPages - 2;
            if (this._currentPageIndex >= lastPage) return;
            this.startFlipAnimation(1, lastPage, 20);
        }

        startFlipAnimation(direction, endPage, duration = 26, manual = false) {
            if (!this._turning) {
                console.warn('BookViewer: no turning page, recreating the flip layer');
                this.createPageFlipLayer();
                if (!this._turning) {
                    this._currentPageIndex += (direction > 0 ? 2 : -2);
                    this.drawCurrentPages();
                    return;
                }
            }

            const anim = this._flipAnimation;
            anim.active = true;
            anim.manual = manual;
            anim.progress = 0;
            anim.duration = duration;
            anim.direction = direction;
            anim.startPage = this._currentPageIndex;
            anim.endPage = (endPage !== undefined && endPage !== null)
                ? endPage
                : this._currentPageIndex + (direction > 0 ? 2 : -2);
            anim.t = 0;
            anim.from = 0;
            anim.target = 1;

            // What is on each face of the sheet being turned. Torn pages carry
            // no words: the sheet that left is not the one in the reader's hand.
            const faceIndex = direction > 0 ? this._currentPageIndex + 1 : this._currentPageIndex;
            const backIndex = direction > 0 ? anim.endPage : anim.endPage + 1;
            const face = this.isTorn(faceIndex) ? '' : (this._pages[faceIndex] || '');
            const back = this.isTorn(backIndex) ? '' : (this._pages[backIndex] || '');
            this.composeTurningFace(this._turning.frontBitmap, face, direction < 0);
            this.composeTurningFace(this._turning.backBitmap, back, direction > 0);

            this._turning.resetTransform();
            this._turning.show(true);
            this._turning.pose(0, direction);
            this.updateFlipShadow(0, direction);
        }

        onCancel() {
            if (this._closingAnimation) return;

            this._closingAnimation = {
                active: true,
                progress: 0,
                duration: 20
            };

            AudioManager.playSe({ name: 'Cancel2', volume: 50, pitch: 100, pan: 0 });
        }

        // Easing functions
        easeOutCubic(t) {
            return 1 - Math.pow(1 - t, 3);
        }

        easeInCubic(t) {
            return t * t * t;
        }

        easeInOutQuad(t) {
            return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        }

        terminate() {
            super.terminate();
            if (this._mouseHandler) document.removeEventListener('click', this._mouseHandler);
            if (this._wheelHandler) document.removeEventListener('wheel', this._wheelHandler);
            if (this._downHandler) document.removeEventListener('mousedown', this._downHandler);
            if (this._moveHandler) document.removeEventListener('mousemove', this._moveHandler);
            if (this._upHandler) document.removeEventListener('mouseup', this._upHandler);

            if (this._turning) {
                this._turning.destroy();
                this._turning = null;
            }
            if (this._bookContainer) {
                this._bookContainer.destroy({ children: true });
                this._bookContainer = null;
                this._flipShadow = null;
                this._paperLeft = this._paperRight = null;
                this._bookmarkLayer = null;
                this._stubLeft = this._stubRight = null;
            }
            if (this._flipContainer) {
                this._flipContainer.destroy({ children: true });
                this._flipContainer = null;
            }
            if (this._backgroundSprite) {
                this._backgroundSprite.destroy();
                this._backgroundSprite = null;
            }
        }
    }

    // Export classes
    window.Scene_BookViewer = Scene_BookViewer;
    window.BookManager = BookManager;
    window.BookAge = BookAge;
    window.BookPaperMill = PaperMill;
})();
