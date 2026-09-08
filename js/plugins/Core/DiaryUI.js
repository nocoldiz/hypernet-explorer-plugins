//=============================================================================
// DiaryUI.js
//=============================================================================
/*:
 * @plugindesc v1.0.0 The party diary as a real diary: a ruled, hand-written book you page through. (UI)
 * @author Omni-Lex
 * @target MZ
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * ==========================================================================
 * The Diary, as a book
 * ==========================================================================
 *
 * Requires Core/Diary.js, which must load first.
 *
 * The book is a two-page spread of ruled diary paper. Each page is headed with
 * the date the way somebody would write it at the top of a page, and the day's
 * lines are written under it in ink, each with the hour it happened at, the
 * icon of the kind of thing it was and, in the margin, where it happened. A
 * page is never scrolled: a day with more lines than the paper holds runs on
 * to the next sheet, headed by the same date marked as continuing.
 *
 *   window.Scene_Diary                the book
 *   Scene_Diary.prepare(world, id)    open somebody else's diary instead of
 *                                     the party's own (the world manager
 *                                     passes a world name and a diary id)
 *
 * Reading is by page, not by line: left and right turn the leaf, up and down
 * move between categories, and the ribbon down the right edge is the filter,
 * one bookmark per category. The mouse reads it too: a bookmark takes the
 * filter, either half of the spread turns that way and the wheel pages
 * through. Everything is rendered through Diary.describe, so a diary written
 * in one language reads in whichever one it is opened in.
 */

(() => {
    'use strict';

    const T = window.T || ((k) => k);

    function tr(key, params) { return T('Diary.' + key, params); }

    function escapeHtml(str) {
        return String(str == null ? "" : str)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    // A day of the world calendar, as a number, so lines group by the page they
    // belong on. The clock starts at 10:00 on 1 Jan 2001, so the day boundary
    // is offset by those ten hours rather than falling on a round 1440.
    const DAY = 1440;
    const EPOCH_OFFSET = 10 * 60;
    function dayIndex(minutes) {
        return Math.floor((Number(minutes) + EPOCH_OFFSET) / DAY);
    }

    // The ruling of the paper, in pixels, and the room the date at the head of
    // a page takes out of it. Both are stated in css/theme.css as well: a
    // written line always stands a whole number of rules tall, so what is
    // measured here and what is drawn there cannot drift apart.
    const RULE = 34;
    const HEAD = 68;

    function dateHeading(minutes) {
        const D = window.Diary;
        const dt = D && D.stampAt ? D.stampAt(minutes) : null;
        if (!dt) return "";
        return tr('date.heading', {
            day: dt.day,
            month: T('Diary.month.' + String(dt.month).toLowerCase()),
            year: dt.year
        });
    }

    // The same date, on the sheet a day runs on to.
    function dateContinued(minutes) {
        const D = window.Diary;
        const dt = D && D.stampAt ? D.stampAt(minutes) : null;
        if (!dt) return "";
        return tr('date.continued', {
            day: dt.day,
            month: T('Diary.month.' + String(dt.month).toLowerCase()),
            year: dt.year
        });
    }

    function clockOf(minutes) {
        const D = window.Diary;
        return (D && D.clockAt) ? D.clockAt(minutes) : "";
    }

    //=========================================================================
    // Scene_Diary
    //=========================================================================

    class Scene_Diary extends Scene_MenuBase {

        // Opening somebody else's book: the world it belongs to and its id.
        static prepare(world, diaryId) {
            this._world = world || null;
            this._diaryId = diaryId || null;
        }

        create() {
            super.create();
            this._filter = 'all';
            this._spread = 0;
            this._writeOpen = false;
            this._writeDraft = "";         // which pair of days is open
            this._loadDiary();
            this._buildDOM();
        }

        // ---- the book's contents -------------------------------------------

        _loadDiary() {
            const D = window.Diary;
            const world = Scene_Diary._world;
            const id = Scene_Diary._diaryId;
            Scene_Diary._world = Scene_Diary._diaryId = null;   // consumed

            this._foreign = !!(world && id);
            if (this._foreign) {
                this._book = (D && D.readDiary) ? D.readDiary(world, id) : null;
            } else {
                this._book = (D && D.currentDiary) ? D.currentDiary() : null;
            }
            if (!this._book) this._book = { party: [], entries: [] };
            this._entries = Array.isArray(this._book.entries) ? this._book.entries : [];
            this._rebuildDays();
        }

        // The lines that pass the filter, cut into days. A day with nothing on
        // it is not a page: the book skips straight to the next day the party
        // wrote anything on, the way a real diary does.
        _rebuildDays() {
            const D = window.Diary;
            const kept = this._entries.filter(e => {
                if (this._filter === 'all') return true;
                return D && D.categoryOf(e) === this._filter;
            });

            // Lines written in the same breath are read as one: several items
            // out of the same chest are one sentence, not one line each.
            const merged = (D && D.compact) ? D.compact(kept) : kept;

            const byDay = new Map();
            for (const entry of merged) {
                const key = dayIndex(entry.t);
                if (!byDay.has(key)) byDay.set(key, []);
                byDay.get(key).push(entry);
            }
            this._days = [...byDay.entries()]
                .sort((a, b) => a[0] - b[0])
                .map(([key, lines]) => ({
                    key,
                    minutes: lines[0].t,
                    lines: lines.slice().sort((a, b) => a.t - b.t)
                }));
        }

        // A page holds as much as a page holds. A day with more lines than fit
        // between the head of the sheet and its foot runs on to the next one,
        // headed by the same date marked as continuing, so the book is paged
        // through rather than scrolled the way the paper never could be.
        _rebuildSheets() {
            const measure = this._openMeasure();
            const room = this._pageRoom();
            const sheets = [];
            for (const day of this._days) {
                let sheet = null;
                let used = 0;
                let written = 0;
                for (const line of day.lines) {
                    const height = this._lineRoom(measure, line);
                    if (sheet && used + height > room) sheet = null;
                    if (!sheet) {
                        sheet = { key: day.key, minutes: day.minutes, lines: [], cont: written > 0 };
                        written++;
                        sheets.push(sheet);
                        used = 0;
                    }
                    sheet.lines.push(line);
                    used += height;
                }
            }
            this._closeMeasure();
            this._sheets = sheets;
            this._spread = Math.max(0, Math.min(this._spread, this._maxSpread()));
        }

        _maxSpread() {
            const sheets = this._sheets || [];
            return Math.max(0, Math.ceil(sheets.length / 2) - 1);
        }

        // ---- how much a page holds -------------------------------------------
        // Measured on the real leaf rather than guessed at: the same line reads
        // as one rule in one language and as three in another, and the book is
        // opened at whatever size the window happens to be.

        _openMeasure() {
            const page = this._pageLeftEl;
            if (!page) return null;
            const cs = window.getComputedStyle(page);
            const width = page.clientWidth
                - (parseFloat(cs.paddingLeft) || 0)
                - (parseFloat(cs.paddingRight) || 0);
            if (!(width > 0)) return null;
            const el = document.createElement("div");
            el.className = "diary-lines diary-measure";
            el.style.width = width + "px";
            page.appendChild(el);
            this._measureEl = el;
            return el;
        }

        _closeMeasure() {
            if (this._measureEl) {
                this._measureEl.remove();
                this._measureEl = null;
            }
        }

        _pageRoom() {
            const page = this._pageLeftEl;
            const fallback = RULE * 14;
            if (!page) return fallback;
            const cs = window.getComputedStyle(page);
            const room = page.clientHeight
                - (parseFloat(cs.paddingTop) || 0)
                - (parseFloat(cs.paddingBottom) || 0)
                - HEAD;
            if (!(room >= RULE)) return fallback;
            return Math.floor(room / RULE) * RULE;
        }

        _lineRoom(measure, entry) {
            if (!measure) return RULE;
            measure.innerHTML = this._renderLine(entry);
            const el = measure.firstElementChild;
            const height = el ? el.offsetHeight : 0;
            return Math.max(RULE, Math.ceil(height / RULE) * RULE);
        }

        // ---- DOM ------------------------------------------------------------

        _buildDOM() {
            this._container = document.createElement("div");
            this._container.id = "diary-container";
            // The one thing css/theme.css cannot state for itself: the paper
            // grain is a noise PNG baked at runtime (see grainTexture below),
            // so the sheet reads it back off this custom property.
            const grain = grainTexture();
            if (grain) this._container.style.setProperty("--diary-grain", window.UIPanel.assetUrl(grain));
            // The book's shell is built ONCE. `.diary-book` carries the
            // one-shot entrance animation, and its children (the diary-glyph
            // icons) carry a live CSS filter; rebuilding this wrapper on
            // every page turn used to restart that animation on every turn,
            // which is what re-triggered the filter-repaint strobe the CSS
            // comment above already warns about. `_render()` now only ever
            // replaces the contents of the page/ribbon/foot slots below, so
            // the book itself is never torn down after it first opens.
            this._container.innerHTML = `
                <div class="diary-book">
                    <div class="diary-cover-edge"></div>
                    <div class="diary-ribbon"></div>
                    <div class="diary-page diary-page-left"></div>
                    <div class="diary-binding"><span class="diary-stitch"></span></div>
                    <div class="diary-page diary-page-right"></div>
                    <div class="diary-foot"></div>
                </div>
            `;
            document.body.appendChild(this._container);
            this._ribbonEl = this._container.querySelector(".diary-ribbon");
            this._pageLeftEl = this._container.querySelector(".diary-page-left");
            this._pageRightEl = this._container.querySelector(".diary-page-right");
            this._footEl = this._container.querySelector(".diary-foot");
            this._bindMouse();
            this._bindKeyGuard();
            this._rebuildSheets();
            this._render();
            // The paper is measured with whatever font is installed at that
            // moment. If the UI serif is still on its way in, every line is measured
            // against the fallback serif and the sheets come out a line short
            // or a line long, so the book is paged again once the real face
            // has landed.
            try {
                if (document.fonts && document.fonts.ready) {
                    document.fonts.ready.then(() => {
                        if (!this._container) return;
                        this._rebuildSheets();
                        this._render();
                    });
                }
            } catch (e) { /* the book is already readable */ }
        }

        // Everything the mouse can do to the book, bound as real listeners on
        // the one element that outlives every re-render: the marks used to
        // carry an inline onclick each, and a press on one of them counted
        // only if the pointer had not drifted by the time it came back up.
        // Delegating from the container also means the ribbon can be rebuilt
        // as often as it likes without ever losing its handlers.
        _bindMouse() {
            this._onContext = (e) => e.preventDefault();
            this._onMouseDown = (e) => {
                if (e.button !== 0 || !e.target || !e.target.closest) return;
                // The writing sheet takes every click it is given: its own
                // buttons act, the dimmed backdrop around it puts it away, and
                // nothing underneath ever turns a page while it is up.
                if (this._writeOpen) {
                    const act = e.target.closest("[data-write]");
                    if (act) {
                        e.preventDefault();
                        e.stopPropagation();
                        if (act.dataset.write === "save") this._submitWrite();
                        else this._closeWrite();
                        return;
                    }
                    if (e.target.classList && e.target.classList.contains("diary-write-backdrop")) {
                        e.preventDefault();
                        this._closeWrite();
                    }
                    e.stopPropagation();
                    return;
                }
                if (e.target.closest(".diary-pen")) {
                    e.preventDefault();
                    e.stopPropagation();
                    this._openWrite();
                    return;
                }
                const mark = e.target.closest(".diary-mark");
                if (mark) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.setDiaryFilter(mark.dataset.cat);
                    return;
                }
                if (e.target.closest(".diary-page-right")) {
                    e.preventDefault();
                    this._turnPage(1);
                } else if (e.target.closest(".diary-page-left")) {
                    e.preventDefault();
                    this._turnPage(-1);
                }
            };
            this._onWheel = (e) => {
                e.preventDefault();
                if (this._writeOpen) return;
                this._turnPage(e.deltaY > 0 ? 1 : -1);
            };
            this._container.addEventListener("contextmenu", this._onContext);
            this._container.addEventListener("mousedown", this._onMouseDown);
            this._container.addEventListener("wheel", this._onWheel, { passive: false });
        }

        _render() {
            if (!this._container) return;
            this._ribbonEl.innerHTML = this._renderRibbonMarks();
            this._pageLeftEl.innerHTML = this._renderPage(this._spread * 2);
            this._pageRightEl.innerHTML = this._renderPage(this._spread * 2 + 1);
            this._footEl.innerHTML = this._renderFootContent();
        }

        _renderRibbonMarks() {
            const D = window.Diary;
            const cats = ['all'].concat(D ? D.categories() : []);
            return cats.map((cat) => {
                const active = this._filter === cat;
                return `<div class="diary-mark ${active ? 'active' : ''}"
                             data-cat="${escapeHtml(cat)}"
                             title="${escapeHtml(tr('cat.' + cat))}">
                            <span>${escapeHtml(tr('cat.' + cat))}</span>
                        </div>`;
            }).join("");
        }

        // One page: one sheet of a day, headed by its date, ruled, written in ink.
        _renderPage(index) {
            const day = (this._sheets || [])[index];
            if (!day) {
                // A page nobody has written on yet says nothing at all: it is
                // simply the rest of the book, ruled and waiting. Only a diary
                // with not one line anywhere in it is worth a word, and it is
                // written once, on the leaf the reader looks at first.
                const empty = ((this._sheets || []).length === 0 && index === 0)
                    ? `<div class="diary-blank">${escapeHtml(tr('empty'))}</div>` : "";
                return `<div class="diary-rules"></div>${empty}`;
            }

            const heading = day.cont ? dateContinued(day.minutes) : dateHeading(day.minutes);
            const lines = day.lines.map(entry => this._renderLine(entry)).join("");

            return `
                <div class="diary-rules"></div>
                <div class="diary-inner">
                    <div class="diary-date">
                        <span class="diary-date-text">${escapeHtml(heading)}</span>
                        <span class="diary-date-rule"></span>
                    </div>
                    <div class="diary-lines">${lines}</div>
                </div>
            `;
        }

        _renderLine(entry) {
            const D = window.Diary;
            const text = D ? D.describe(entry) : "";
            const icon = D ? D.iconOf(entry) : 225;
            const x = (icon % 16) * 32;
            const y = Math.floor(icon / 16) * 32;
            // Ink is never perfectly level on a ruled page: the tilt and the
            // shade are a function of the line itself, so one line always looks
            // the same and no two neighbours look alike.
            const wobble = ((Math.abs(entry.t) % 7) - 3) * 0.12;
            const shade = ["a", "b", "c"][Math.abs(entry.t) % 3];
            const where = entry.w ? `<span class="diary-margin">${escapeHtml(entry.w)}</span>` : "";
            return `
                <div class="diary-line ink-${shade}"
                     style="transform: rotate(${wobble.toFixed(2)}deg)">
                    <span class="diary-hour">${escapeHtml(clockOf(entry.t))}</span>
                    <span class="diary-glyph" style="background-position: -${x}px -${y}px"></span>
                    <span class="diary-text">${escapeHtml(text)}</span>
                    ${where}
                </div>
            `;
        }

        _renderFootContent() {
            const names = (this._book.party || []).map(m => m.name).filter(Boolean).join(", ");
            const owner = names
                ? (this._foreign ? tr('foot.theirs', { names }) : tr('foot.ours', { names }))
                : tr('foot.unknown');
            const total = (this._sheets || []).length;
            const page = tr('foot.page', {
                shown: Math.min(total, this._spread * 2 + 2),
                total
            });
            // Somebody else's book is read, never written in.
            const pen = this._foreign ? "" :
                `<button type="button" class="diary-pen">${escapeHtml(tr('write.button'))}</button>`;
            return `
                <span class="diary-foot-owner">${escapeHtml(owner)}</span>
                ${pen}
                <span class="diary-foot-page">${escapeHtml(page)}</span>
            `;
        }

        // ---- writing a line of one's own -------------------------------------
        // The same arrangement the Empathize panel types in: the field lives in
        // its own overlay rather than inside anything the book re-renders, and a
        // capture phase key guard runs ahead of every always-on map plugin so
        // none of them can swallow a letter before the field sees it. The guard
        // never calls preventDefault itself, so the browser still inserts the
        // character; only Enter and Escape are acted on here.
        _openWrite() {
            if (!this._container || this._writeOpen || this._foreign) return;
            SoundManager.playOk();
            const sheet = document.createElement("div");
            sheet.className = "diary-write-backdrop";
            sheet.innerHTML = `
                <div class="diary-write">
                    <div class="diary-write-title">${escapeHtml(tr('write.title'))}</div>
                    <textarea id="diary-write-input" class="diary-write-input" rows="4"
                        maxlength="400" autocomplete="off" spellcheck="false"
                        placeholder="${escapeHtml(tr('write.placeholder'))}"></textarea>
                    <div class="diary-write-btns">
                        <button type="button" class="diary-write-cancel" data-write="cancel">${escapeHtml(tr('write.cancel'))}</button>
                        <button type="button" class="diary-write-save" data-write="save">${escapeHtml(tr('write.save'))}</button>
                    </div>
                </div>
            `;
            this._container.appendChild(sheet);
            this._writeEl = sheet;
            this._writeOpen = true;

            const field = sheet.querySelector("#diary-write-input");
            if (field) {
                field.value = this._writeDraft || "";
                field.addEventListener("input", () => { this._writeDraft = field.value; });
                requestAnimationFrame(() => {
                    field.focus();
                    const end = field.value.length;
                    try { field.setSelectionRange(end, end); } catch (e) { /* focus is enough */ }
                });
            }
        }

        _closeWrite() {
            if (!this._writeOpen) return;
            this._writeOpen = false;
            if (this._writeEl && this._writeEl.parentNode) this._writeEl.remove();
            this._writeEl = null;
        }

        _submitWrite() {
            const field = this._writeEl && this._writeEl.querySelector("#diary-write-input");
            const text = field ? field.value : "";
            const D = window.Diary;
            const written = (D && D.write) ? D.write(text) : null;
            this._writeDraft = "";
            this._closeWrite();
            if (!written) { SoundManager.playBuzzer(); return; }
            SoundManager.playSave();
            // The book is re-read so the new line takes its place on the page,
            // and the reader is put on the sheet it landed on.
            const book = (D && D.currentDiary) ? D.currentDiary() : null;
            if (book && Array.isArray(book.entries)) {
                this._book = book;
                this._entries = book.entries;
            }
            this._rebuildDays();
            this._rebuildSheets();
            this._spread = this._maxSpread();
            this._render();
        }

        // Everything typed into the sheet is shielded from every other plugin's
        // global key handler while the field has focus.
        _bindKeyGuard() {
            this._onKeyGuard = (e) => {
                const active = document.activeElement;
                if (!active || (active.tagName !== "INPUT" && active.tagName !== "TEXTAREA")) return;
                e.stopImmediatePropagation();
                if (e.type !== "keydown" || active.id !== "diary-write-input") return;
                if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    this._submitWrite();
                } else if (e.key === "Escape") {
                    e.preventDefault();
                    this._closeWrite();
                }
            };
            window.addEventListener("keydown", this._onKeyGuard, true);
            window.addEventListener("keyup", this._onKeyGuard, true);
            window.addEventListener("keypress", this._onKeyGuard, true);
        }

        // ---- interaction -----------------------------------------------------

        setDiaryFilter(cat) {
            if (!cat || this._filter === cat) return;
            SoundManager.playCursor();
            this._filter = cat;
            this._spread = 0;
            this._rebuildDays();
            this._rebuildSheets();
            this._render();
        }

        _turnPage(direction) {
            const next = this._spread + direction;
            if (next < 0 || next > this._maxSpread()) { SoundManager.playBuzzer(); return; }
            SoundManager.playCursor();
            this._spread = next;
            this._render();
            this._playTurn(direction);
        }

        // The leaf being turned: both halves of the spread swing in from the
        // side the reader is coming from. The class has to come off and go back
        // on around a reflow, or a second turn in the same direction plays
        // nothing at all.
        _playTurn(direction) {
            const turning = direction > 0 ? "turn-forward" : "turn-back";
            for (const el of [this._pageLeftEl, this._pageRightEl]) {
                if (!el) continue;
                el.classList.remove("turn-forward", "turn-back");
                void el.offsetWidth;
                el.classList.add(turning);
            }
        }

        _moveRibbon(direction) {
            const cats = ['all'].concat(window.Diary ? window.Diary.categories() : []);
            const at = cats.indexOf(this._filter);
            const next = Math.max(0, Math.min(cats.length - 1, (at < 0 ? 0 : at) + direction));
            if (cats[next] === this._filter) return;
            this.setDiaryFilter(cats[next]);
        }

        update() {
            super.update();
            // While the sheet is up the keyboard belongs to the field alone: no
            // page turns, no cancel, nothing that could steal its focus.
            if (this._writeOpen) return;
            if (Input.isTriggered("ok") && !this._foreign) { this._openWrite(); return; }
            if (Input.isTriggered("cancel") || TouchInput.isCancelled()) {
                TouchInput.clear();
                SoundManager.playCancel();
                this.popScene();
                return;
            }
            if (Input.isRepeated("right")) this._turnPage(1);
            else if (Input.isRepeated("left")) this._turnPage(-1);
            else if (Input.isRepeated("down")) this._moveRibbon(1);
            else if (Input.isRepeated("up")) this._moveRibbon(-1);
            else if (Input.isTriggered("pagedown")) this._turnPage(1);
            else if (Input.isTriggered("pageup")) this._turnPage(-1);
        }

        terminate() {
            this._closeWrite();
            if (this._onKeyGuard) {
                window.removeEventListener("keydown", this._onKeyGuard, true);
                window.removeEventListener("keyup", this._onKeyGuard, true);
                window.removeEventListener("keypress", this._onKeyGuard, true);
                this._onKeyGuard = null;
            }
            if (this._container) {
                this._container.removeEventListener("contextmenu", this._onContext);
                this._container.removeEventListener("mousedown", this._onMouseDown);
                this._container.removeEventListener("wheel", this._onWheel);
                this._container.remove();
                this._container = null;
            }
            this._onContext = this._onMouseDown = this._onWheel = null;
            this._measureEl = null;
            this._ribbonEl = this._pageLeftEl = this._pageRightEl = this._footEl = null;
            super.terminate();
        }
    }

    window.Scene_Diary = Scene_Diary;

    //=========================================================================
    // The paper
    // -------------------------------------------------------------------------
    // Everything here is drawn rather than loaded: the ruling is a repeating
    // gradient, the paper's grain an inline SVG turbulence, the ink a text
    // shadow. Colours are theme tokens, so the book follows whichever theme is
    // installed instead of pinning its own.
    //=========================================================================

    // The paper grain used to be a live inline SVG <feTurbulence> filter. Some
    // Chromium builds re-rasterize a filter-backed background-image on every
    // repaint of an animated ancestor (the book's own entrance animation, or a
    // page turn re-rendering the spread), which reads as the whole book
    // strobing rather than opening. A grain baked once to a plain PNG paints
    // like any other static texture and never re-renders.
    let _grainDataUrl = null;
    function grainTexture() {
        if (_grainDataUrl) return _grainDataUrl;
        try {
            const size = 128;
            const canvas = document.createElement("canvas");
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext("2d");
            const img = ctx.createImageData(size, size);
            for (let i = 0; i < img.data.length; i += 4) {
                const v = Math.floor(Math.random() * 255);
                img.data[i] = v;
                img.data[i + 1] = v;
                img.data[i + 2] = v;
                img.data[i + 3] = Math.floor(Math.random() * 22);
            }
            ctx.putImageData(img, 0, 0);
            _grainDataUrl = canvas.toDataURL("image/png");
        } catch (e) {
            _grainDataUrl = "";
        }
        return _grainDataUrl;
    }

})();
