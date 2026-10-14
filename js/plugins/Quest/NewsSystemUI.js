//=============================================================================
// NewsSystemUI.js
//=============================================================================
/*:
 * @plugindesc v1.0.0 The newspaper: today's papers and every past edition, set as a broadsheet. (UI)
 * @author Omni-Lex
 * @target MZ
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * ==========================================================================
 * The Newspaper
 * ==========================================================================
 *
 * Requires Quest/NewsSystem.js, which must load first.
 *
 * Opened from the main menu. One sheet of newsprint per day: the morning's
 * papers as the newsstand lays them out, or one paper alone under its own
 * masthead, in its own type. Every article comes from window.NewsPress: the
 * dated archive of the year it was printed in, plus whatever the wire filed
 * that day (procedural items, crime dossiers, outbreaks, the chronicle).
 *
 * The words a writer put in [brackets] are printed highlighted. One that
 * names a codex page opens it; a world topic the party had not heard of is
 * learned on the way (HelpCodex.follow). The HypernetOS News app reads the
 * same articles in its own plain look and prints the brackets as words.
 *
 *   window.Scene_Newspaper            the paper
 *   Scene_Newspaper.prepare(date)     open on a given day instead of today
 *
 * Left and right turn the day (with Shift held, the month), the page keys
 * change the paper, up and down walk the highlighted words down the sheet,
 * OK follows the word in hand (or, with none, goes back to today) and cancel
 * folds the paper away. The mouse clicks the same controls and the wheel
 * (or L2/R2) scrolls.
 */

(() => {
    'use strict';

    const T = window.T || ((k) => k);
    const tr = (key, params) => T('News.reader.' + key, params);
    const FIRST_DAY = new Date(2001, 0, 1);

    function escapeHtml(str) {
        return String(str == null ? "" : str)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    // ---- type ---------------------------------------------------------------
    // The papers are set in real newspaper faces (fonts/newspaper, SIL OFL and
    // Apache 2.0, licences beside them). Registered on first open rather than
    // at boot: nobody else reads them.
    const FACES = [
        ["NP Blackletter", "UnifrakturMaguntia-Book.ttf", "400", "normal"],
        ["NP Old Standard", "OldStandard-Regular.ttf", "400", "normal"],
        ["NP Old Standard", "OldStandard-Italic.ttf", "400", "italic"],
        ["NP Old Standard", "OldStandard-Bold.ttf", "700", "normal"],
        ["NP Playfair", "PlayfairDisplay.ttf", "400 900", "normal"],
        ["NP Playfair", "PlayfairDisplay-Italic.ttf", "400 900", "italic"],
        ["NP Fatface", "AbrilFatface-Regular.ttf", "400", "normal"],
        ["NP Oswald", "Oswald.ttf", "200 700", "normal"],
        ["NP Fell", "IMFellEnglishSC.ttf", "400", "normal"],
        ["NP Typewriter", "SpecialElite-Regular.ttf", "400", "normal"],
    ];
    // i18n-ignore-start: CSS font stacks, never shown
    const FAMILY = {
        blackletter: "'NP Blackletter', 'NP Old Standard', serif",
        playfair: "'NP Playfair', 'NP Old Standard', serif",
        fatface: "'NP Fatface', 'NP Playfair', serif",
        oswald: "'NP Oswald', 'Arial Narrow', sans-serif",
        fell: "'NP Fell', 'NP Old Standard', serif",
        oldstandard: "'NP Old Standard', serif",
        typewriter: "'NP Typewriter', 'Courier New', monospace",
    };
    // i18n-ignore-end
    let _facesAsked = false;
    function loadFaces(onLoaded) {
        if (_facesAsked || typeof FontFace === "undefined" || !document.fonts) return;
        _facesAsked = true;
        const pending = FACES.map(([family, file, weight, style]) => {
            try {
                const face = new FontFace(family, `url(fonts/newspaper/${file})`, { weight, style });
                document.fonts.add(face);
                return face.load().catch(() => null);
            } catch (e) { return Promise.resolve(null); }
        });
        Promise.all(pending).then(() => { if (onLoaded) onLoaded(); });
    }

    // ---- the day's articles ---------------------------------------------------

    function startOfDay(date) {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    }

    function gameNow() {
        const TDS = window.TimeDateSystem;
        try {
            if (TDS && typeof TDS.getCurrentDateObj === "function") {
                const d = TDS.getCurrentDateObj();
                if (d) return d;
            }
        } catch (e) { /* the clock is not running yet */ }
        return new Date(2001, 0, 1, 8, 0);
    }

    function sameDay(a, b) {
        return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    }

    // Everything printed on one day, newest papers first: the archive of that
    // year and whatever the wire filed. Today's timed pieces wait for their
    // hour, the way the wire waits for them.
    function editionOf(day) {
        const P = window.NewsPress;
        if (!P) return [];
        const now = gameNow();
        const isToday = sameDay(day, now);
        const stamp = `${String(day.getDate()).padStart(2, "0")}/${String(day.getMonth() + 1).padStart(2, "0")}/${day.getFullYear()}`;
        const out = [];
        for (const row of P.archive(day.getFullYear())) {
            if (row.date !== stamp) continue;
            if (isToday && row.time) {
                const [h, m] = row.time.split(":").map(Number);
                if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) continue;
            }
            const words = P.articleText(row);
            out.push({
                key: row.id, outlet: row.outlet, section: row.section, soul: row.soul || 0,
                title: words.title, deck: words.deck, body: words.body,
                author: P.bylineOfRow(row), time: row.time || "", location: row.location || "", archive: true
            });
        }
        const mgr = window.$newsManager;
        const wire = mgr && Array.isArray(mgr.newsHistory) ? mgr.newsHistory : [];
        for (const news of wire) {
            if (!news || news.realId) continue;
            const when = new Date(news.timestamp);
            if (!sameDay(when, day)) continue;
            P.ensureByline(news);
            const words = P.textOf(news);
            out.push({
                key: "wire-" + when.getTime() + "-" + out.length, outlet: news.outlet, section: news.section || "",
                soul: news.soulTendencyModifier || 0, title: P.plain(words.title), deck: words.deck, body: words.body,
                author: news.author || "", time: "", location: news.location || "", archive: false
            });
        }
        // The archive's own stories lead, the weightiest first; the wire's
        // small items fill the columns after them.
        out.sort((a, b) => (b.archive - a.archive) || (Math.abs(b.soul) - Math.abs(a.soul)) || (b.body.length - a.body.length));
        return out;
    }

    // ---- prose -------------------------------------------------------------
    // A body is paragraphs split on blank lines; a [bracketed] word is a
    // highlight, and a highlight that names a codex page is also a link.
    const BRACKET = /\[([^\[\]|<>\n]{1,40})\]/g;

    function proseHtml(text) {
        const Codex = window.HelpCodex;
        return String(text || "").split(/\n\s*\n/).filter(p => p.trim()).map(par => {
            const html = escapeHtml(par.trim()).replace(BRACKET, (m, inner) => {
                const link = Codex && Codex.linkFor ? Codex.linkFor(inner) : null;
                const cls = "np-key" + (link ? " np-link" + (link.open ? "" : " np-link--closed") : "");
                return `<span class="${cls}" data-term="${inner}">${inner}</span>`;
            });
            return `<p>${html}</p>`;
        }).join("");
    }

    function plainHtml(text) {
        const P = window.NewsPress;
        return escapeHtml(P ? P.plain(text) : text);
    }

    //=========================================================================
    // Scene_Newspaper
    //=========================================================================

    class Scene_Newspaper extends Scene_MenuBase {

        static prepare(date) {
            this._openOn = date ? startOfDay(new Date(date)) : null;
        }

        create() {
            super.create();
            const wanted = Scene_Newspaper._openOn;
            Scene_Newspaper._openOn = null;
            this._today = startOfDay(gameNow());
            this._day = wanted && wanted <= this._today ? wanted : this._today;
            this._paper = "all";
            this._buildDOM();
            this._load();
            loadFaces(() => { if (this._container) this._render(); });
            // Which words are links depends on the codex titles, which are read
            // on their own schedule: the page is set again once they are in.
            if (window.HelpCodex && window.HelpCodex.whenReady) {
                window.HelpCodex.whenReady(() => { if (this._container) this._render(); });
            }
        }

        // ---- content ----------------------------------------------------------

        _load() {
            this._articles = editionOf(this._day);
            const counts = new Map();
            for (const a of this._articles) counts.set(a.outlet, (counts.get(a.outlet) || 0) + 1);
            const P = window.NewsPress;
            const order = P ? P.outlets().map(o => o.id) : [];
            this._papers = ["all"].concat(order.filter(id => counts.has(id)));
            this._counts = counts;
            if (!this._papers.includes(this._paper)) this._paper = "all";
            this._render();
            if (this._sheetEl) this._sheetEl.scrollTop = 0;
        }

        _shown() {
            return this._paper === "all" ? this._articles : this._articles.filter(a => a.outlet === this._paper);
        }

        // ---- DOM -----------------------------------------------------------

        _buildDOM() {
            this._container = document.createElement("div");
            this._container.id = "newspaper-container";
            this._container.innerHTML = `<style>${NEWSPAPER_CSS}</style>
                <div class="np-bar"></div>
                <div class="np-workspace">
                    <aside class="np-sidebar"></aside>
                    <main class="np-sheet"><div class="np-page"></div></main>
                </div>`;
            document.body.appendChild(this._container);
            this._barEl = this._container.querySelector(".np-bar");
            this._sidebarEl = this._container.querySelector(".np-sidebar");
            this._sheetEl = this._container.querySelector(".np-sheet");
            this._pageEl = this._container.querySelector(".np-page");
            this._onClick = (e) => {
                if (!e.target || !e.target.closest) return;
                const key = e.target.closest(".np-link, .np-key");
                if (key) { e.preventDefault(); this._follow(key.dataset.term || key.textContent); return; }
                const artItem = e.target.closest("[data-np-article]");
                if (artItem) {
                    e.preventDefault();
                    this._scrollToArticle(artItem.dataset.npArticle);
                    return;
                }
                const btn = e.target.closest("[data-np]");
                if (!btn) return;
                e.preventDefault();
                const act = btn.dataset.np;
                if (act === "prev") this._turnDay(-1);
                else if (act === "next") this._turnDay(1);
                else if (act === "prevMonth") this._turnMonth(-1);
                else if (act === "nextMonth") this._turnMonth(1);
                else if (act === "today") this._goToday();
                else if (act === "close") { SoundManager.playCancel(); this.popScene(); }
                else if (act === "paper") this._setPaper(btn.dataset.paper);
            };
            this._onContext = (e) => e.preventDefault();
            this._container.addEventListener("click", this._onClick);
            this._container.addEventListener("contextmenu", this._onContext);
        }

        _render() {
            if (!this._container) return;
            this._barEl.innerHTML = this._renderBar();
            if (this._sidebarEl) this._sidebarEl.innerHTML = this._renderSidebar();
            this._pageEl.innerHTML = this._renderPage();
            this._focus = -1;
        }

        _scrollToArticle(key) {
            if (!this._sheetEl || !key) return;
            const target = this._sheetEl.querySelector(`[data-np-article-key="${key}"]`);
            if (target) {
                target.scrollIntoView({ behavior: "smooth", block: "start" });
                target.classList.add("np-article--flash");
                setTimeout(() => { if (target) target.classList.remove("np-article--flash"); }, 1200);
                SoundManager.playCursor();
            }
        }

        // ---- the word in hand ----------------------------------------------
        // Without a mouse the highlighted words are walked in reading order:
        // the one in hand is outlined and scrolled to, and Confirm follows it.
        _keys() {
            return this._pageEl ? Array.from(this._pageEl.querySelectorAll(".np-key")) : [];
        }

        _moveFocus(direction) {
            const keys = this._keys();
            if (!keys.length) {
                this._sheetEl.scrollTop += direction * 120;
                return;
            }
            const prev = keys[this._focus];
            if (prev) prev.classList.remove("np-key--focus");
            this._focus = this._focus < 0
                ? (direction > 0 ? 0 : keys.length - 1)
                : (this._focus + direction + keys.length) % keys.length;
            const el = keys[this._focus];
            el.classList.add("np-key--focus");
            if (el.scrollIntoView) el.scrollIntoView({ block: "center" });
            SoundManager.playCursor();
        }

        _confirm() {
            const el = this._keys()[this._focus];
            if (el) this._follow(el.dataset.term || el.textContent);
            else this._goToday();
        }

        _dateLine(day) {
            const lang = (window.ConfigManager && ConfigManager.language) === "it" ? "it-IT" : "en-GB";
            try {
                return day.toLocaleDateString(lang, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
            } catch (e) {
                return day.toDateString();
            }
        }

        _renderBar() {
            const atStart = this._day <= FIRST_DAY;
            const atEnd = this._day >= this._today;
            return `
                <div class="np-nav">
                    <button class="np-btn" data-np="prevMonth" ${atStart ? "disabled" : ""}>&laquo;</button>
                    <button class="np-btn" data-np="prev" ${atStart ? "disabled" : ""} title="${escapeHtml(tr("prevDay"))}">&lsaquo;</button>
                    <span class="np-nav-date">${escapeHtml(this._dateLine(this._day))}</span>
                    <button class="np-btn" data-np="next" ${atEnd ? "disabled" : ""} title="${escapeHtml(tr("nextDay"))}">&rsaquo;</button>
                    <button class="np-btn" data-np="nextMonth" ${atEnd ? "disabled" : ""}>&raquo;</button>
                    <button class="np-btn np-btn--wide" data-np="today" ${atEnd ? "disabled" : ""}>${escapeHtml(tr("today"))}</button>
                    <span class="np-nav-fill"></span>
                    <button class="np-btn np-btn--wide np-btn--close" data-np="close">${escapeHtml(tr("close"))}</button>
                </div>`;
        }

        _renderSidebar() {
            const P = window.NewsPress;
            const papers = this._papers.map(id => {
                const name = id === "all" ? tr("allPapers") : P.outletName(id);
                const count = id === "all" ? this._articles.length : (this._counts.get(id) || 0);
                const on = id === this._paper ? " np-paper-btn--on" : "";
                const o = id === "all" ? null : (P.outlet(id) || {});
                const accent = o ? (o.accent || "#1a1a1a") : "#8a7559";
                let meta = "";
                if (id === "all") {
                    meta = tr("digestMotto");
                } else if (o) {
                    meta = o.city ? `${o.city} · ${P.outletPublisher(o.id)}` : (o.hyperpower && o.hyperpower !== "Neutral" ? o.hyperpower : "");
                }
                return `
                    <button class="np-paper-btn${on}" data-np="paper" data-paper="${escapeHtml(id)}" style="--paper-accent:${accent}">
                        <div class="np-paper-info">
                            <span class="np-paper-name">${escapeHtml(name)}</span>
                            ${meta ? `<span class="np-paper-meta">${escapeHtml(meta)}</span>` : ""}
                        </div>
                        <span class="np-paper-count">${count}</span>
                    </button>`;
            }).join("");

            const articles = this._shown();
            let articleItems = "";
            if (articles.length) {
                articleItems = articles.map(a => {
                    const sec = P.sectionLabel(a.section) || (a.archive ? tr("frontPage") : tr("wire"));
                    const outletName = this._paper === "all" ? ` &middot; ${escapeHtml(P.outletName(a.outlet))}` : "";
                    return `
                        <button class="np-article-btn" data-np-article="${escapeHtml(a.key)}">
                            <div class="np-article-btn-sec">${escapeHtml(sec)}${outletName}</div>
                            <div class="np-article-btn-title">${plainHtml(a.title)}</div>
                            ${a.author ? `<div class="np-article-btn-author">${escapeHtml(a.author)}</div>` : ""}
                        </button>`;
                }).join("");
            }

            return `
                <div class="np-sidebar-section">
                    <div class="np-sidebar-title">${escapeHtml(tr("papers"))}</div>
                    <div class="np-paper-list">${papers}</div>
                </div>
                ${articles.length ? `
                <div class="np-sidebar-section np-sidebar-articles">
                    <div class="np-sidebar-title">${escapeHtml(tr("articles"))} <span class="np-sidebar-count">(${articles.length})</span></div>
                    <div class="np-article-list">${articleItems}</div>
                </div>` : ""}`;
        }

        _renderMasthead() {
            const P = window.NewsPress;
            const year = this._day.getFullYear();
            const dayOfYear = Math.floor((this._day - new Date(year, 0, 1)) / 86400000) + 1;
            if (this._paper === "all") {
                return `
                    <header class="np-masthead" style="--np-accent:#1a1a1a">
                        <div class="np-ears"><span>${escapeHtml(tr("frontPage"))}</span><span>${escapeHtml(T("News.reader.volume", { vol: year - 2000, no: dayOfYear }))}</span></div>
                        <h1 class="np-title" style="font-family:${FAMILY.blackletter}">${escapeHtml(tr("digest"))}</h1>
                        <div class="np-dateline"><span>${escapeHtml(this._dateLine(this._day))}</span><span>${escapeHtml(tr("digestMotto"))}</span></div>
                    </header>`;
            }
            const o = P.outlet(this._paper) || {};
            const power = o.hyperpower && o.hyperpower !== "Neutral"
                ? T("News.reader.hyperpower", { power: o.hyperpower }) : tr("independent");
            const place = o.city ? T("News.reader.publishedBy", { publisher: P.outletPublisher(o.id), city: o.city })
                : P.outletPublisher(o.id);
            return `
                <header class="np-masthead" style="--np-accent:${o.accent || "#1a1a1a"}">
                    <div class="np-ears"><span>${escapeHtml(power)}</span><span>${escapeHtml(T("News.reader.volume", { vol: Math.max(1, year - (o.founded || year) + 1), no: dayOfYear }))}</span></div>
                    <h1 class="np-title" style="font-family:${FAMILY[o.masthead] || FAMILY.blackletter}">${escapeHtml(P.outletName(o.id))}</h1>
                    <div class="np-motto">${escapeHtml(P.outletMotto(o.id))}</div>
                    <div class="np-dateline"><span>${escapeHtml(this._dateLine(this._day))}</span><span>${escapeHtml(place)}</span><span>${escapeHtml(T("News.reader.founded", { year: o.founded || "" }))}</span></div>
                </header>`;
        }

        _renderArticle(a, lead) {
            const P = window.NewsPress;
            const o = P.outlet(a.outlet) || {};
            const head = FAMILY[o.headline] || FAMILY.playfair;
            const kicker = [P.sectionLabel(a.section), this._paper === "all" ? P.outletName(a.outlet) : ""]
                .filter(Boolean).map(escapeHtml).join(" &middot; ");
            const byline = a.author
                ? T("News.reader.byline", { name: a.author }) + (o.overseas ? ", " + tr("overseas") : "")
                : tr("staff");
            const desk = o.city ? T("News.reader.from", { city: o.city }) : "";
            return `
                <article class="np-article${lead ? " np-article--lead" : ""}" data-np-article-key="${escapeHtml(a.key)}" style="--np-accent:${o.accent || "#1a1a1a"}">
                    ${kicker ? `<div class="np-kicker">${kicker}</div>` : ""}
                    <h2 class="np-headline" style="font-family:${head}">${plainHtml(a.title)}</h2>
                    ${a.deck ? `<div class="np-deck">${plainHtml(a.deck)}</div>` : ""}
                    <div class="np-byline">${escapeHtml(byline)}${desk ? ` <span class="np-desk">${escapeHtml(desk)}</span>` : ""}</div>
                    <div class="np-body${o.headline === "typewriter" ? " np-body--typed" : ""}">${proseHtml(a.body)}</div>
                </article>`;
        }

        _renderPage() {
            const list = this._shown();
            const masthead = this._renderMasthead();
            if (!list.length) {
                return `${masthead}<div class="np-empty">${escapeHtml(this._articles.length ? tr("empty") : tr("noEdition"))}</div>`;
            }
            const [lead, ...rest] = list;
            return `${masthead}
                ${this._renderArticle(lead, true)}
                <div class="np-columns">${rest.map(a => this._renderArticle(a, false)).join("")}</div>`;
        }

        // ---- interaction ------------------------------------------------------

        _setDay(day) {
            const next = startOfDay(day);
            const clamped = next < FIRST_DAY ? FIRST_DAY : next > this._today ? this._today : next;
            if (clamped.getTime() === this._day.getTime()) { SoundManager.playBuzzer(); return; }
            SoundManager.playCursor();
            this._day = clamped;
            this._load();
        }

        _turnDay(direction) {
            const d = new Date(this._day);
            d.setDate(d.getDate() + direction);
            this._setDay(d);
        }

        _turnMonth(direction) {
            const d = new Date(this._day);
            d.setMonth(d.getMonth() + direction);
            this._setDay(d);
        }

        _goToday() { this._setDay(this._today); }

        _setPaper(id) {
            if (!id || id === this._paper || !this._papers.includes(id)) return;
            SoundManager.playCursor();
            this._paper = id;
            this._render();
            this._sheetEl.scrollTop = 0;
        }

        _cyclePaper(direction) {
            const at = this._papers.indexOf(this._paper);
            const next = (at + direction + this._papers.length) % this._papers.length;
            this._setPaper(this._papers[next]);
        }

        // A highlighted word: to its codex page, learning it on the way if
        // nobody in the party had heard of it. A word the codex has nothing on
        // stays a highlight and says so.
        _follow(term) {
            const Codex = window.HelpCodex;
            const result = Codex && Codex.follow ? Codex.follow(term) : null;
            if (!result) {
                SoundManager.playBuzzer();
                if (window.ParchmentToast) window.ParchmentToast.show(tr("noTopic"));
                return;
            }
            if (result === "learned" && window.ParchmentToast) {
                const link = Codex.linkFor(term);
                window.ParchmentToast.show(T("News.reader.topicLearned", { name: link ? link.title : term }));
            }
        }

        update() {
            super.update();
            if (!this._container) return;
            if (Input.isTriggered("cancel") || TouchInput.isCancelled()) {
                TouchInput.clear();
                SoundManager.playCancel();
                this.popScene();
                return;
            }
            const month = Input.isPressed("shift");
            if (Input.isTriggered("ok")) this._confirm();
            else if (Input.isRepeated("left")) { if (month) this._turnMonth(-1); else this._turnDay(-1); }
            else if (Input.isRepeated("right")) { if (month) this._turnMonth(1); else this._turnDay(1); }
            else if (Input.isTriggered("pageup")) this._cyclePaper(-1);
            else if (Input.isTriggered("pagedown")) this._cyclePaper(1);
            else if (Input.isRepeated("down")) this._moveFocus(1);
            else if (Input.isRepeated("up")) this._moveFocus(-1);
        }

        terminate() {
            if (this._container) {
                this._container.removeEventListener("click", this._onClick);
                this._container.removeEventListener("contextmenu", this._onContext);
                this._container.remove();
                this._container = null;
            }
            this._barEl = this._sidebarEl = this._sheetEl = this._pageEl = null;
            this._onClick = this._onContext = null;
            super.terminate();
        }
    }

    window.Scene_Newspaper = Scene_Newspaper;

    //=========================================================================
    // The sheet
    // -------------------------------------------------------------------------
    // Newsprint is newsprint whatever theme is installed, so the paper carries
    // its own look inline (see the theme-token note on overlays owning their
    // style). Offsets are written out longhand: the runtime's Chromium
    // predates the inset shorthand.
    //=========================================================================
    // i18n-ignore-start: stylesheet
    const NEWSPAPER_CSS = `
#newspaper-container {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    width: 100vw; height: 100vh; z-index: 1000;
    display: flex; flex-direction: column;
    background-color: #000000;
    background-image: var(--gradient-33);
    color: #1b1813;
    font-family: var(--font-ui, 'NP Old Standard', Georgia, serif);
    user-select: none;
    -webkit-user-select: none;
    box-sizing: border-box;
}
#newspaper-container button { font-family: var(--font-ui, 'NP Old Standard', Georgia, serif); cursor: pointer; }

#newspaper-container .np-bar {
    flex: 0 0 auto;
    background: rgba(14, 12, 10, 0.92);
    color: var(--text-primary-hover, #ffcc66);
    padding: 10px 22px;
    border-bottom: 2px solid var(--border-primary-hover-translucent-15, rgba(255, 204, 102, 0.2));
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.7);
    z-index: 20;
}
#newspaper-container .np-nav { display: flex; align-items: center; gap: 10px; }
#newspaper-container .np-nav-date {
    font-family: var(--font-ui, 'NP Old Standard', Georgia, serif);
    font-size: 22px; font-weight: bold; padding: 0 16px; min-width: 320px;
    text-align: center; letter-spacing: 0.5px;
    color: var(--text-primary-hover, #ffcc66);
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}
#newspaper-container .np-nav-fill { flex: 1 1 auto; }
#newspaper-container .np-btn {
    font-family: var(--font-ui, 'NP Old Standard', Georgia, serif);
    font-size: 19px; font-weight: bold; line-height: 1;
    background: var(--bg-secondary-hover, rgba(30, 25, 20, 0.75));
    border: 1.5px solid var(--text-primary-hover, #ffcc66);
    color: var(--text-primary-hover, #ffcc66);
    border-radius: 4px;
    min-width: 38px; height: 34px;
    display: inline-flex; align-items: center; justify-content: center;
    transition: 0.2s ease;
    transition-property: background-color, border-color, color, transform, box-shadow;
}
#newspaper-container .np-btn--wide { padding: 0 16px; font-size: 15px; }
#newspaper-container .np-btn:disabled { opacity: 0.35; cursor: default; border-color: rgba(255, 204, 102, 0.3); color: rgba(255, 204, 102, 0.4); }
#newspaper-container .np-btn:not(:disabled):hover {
    background: var(--chip-active-bg, #f5d580);
    color: var(--chip-active-fg, #14120e);
    border-color: var(--chip-active-fg, #14120e);
    box-shadow: 0 2px 8px var(--shadow-gold-amber-50, rgba(0, 0, 0, 0.4));
}
#newspaper-container .np-btn--close {
    border-color: var(--border-gold-amber, #d4a050);
}

#newspaper-container .np-workspace {
    flex: 1 1 auto; display: flex; flex-direction: row;
    overflow: hidden; height: calc(100vh - 56px);
}

#newspaper-container .np-sidebar {
    width: 340px; flex: 0 0 340px;
    background: var(--bg-primary-hover-translucent-35, rgba(18, 15, 12, 0.88));
    border-right: 2px solid var(--border-primary-hover-translucent-15, rgba(255, 204, 102, 0.2));
    display: flex; flex-direction: column; overflow-y: auto; overflow-x: hidden;
    padding: 20px 16px 36px; gap: 22px;
    box-shadow: 4px 0 22px rgba(0, 0, 0, 0.5);
    z-index: 10;
}
#newspaper-container .np-sidebar::-webkit-scrollbar { width: 6px; }
#newspaper-container .np-sidebar::-webkit-scrollbar-track { background: var(--shadow-primary-hover-translucent-5, rgba(0, 0, 0, 0.3)); }
#newspaper-container .np-sidebar::-webkit-scrollbar-thumb { background: var(--scroll-thumb-hover-translucent-60, #63523d); border-radius: 3px; }
#newspaper-container .np-sidebar::-webkit-scrollbar-thumb:hover { background: var(--text-primary-hover, #ffcc66); }

#newspaper-container .np-sidebar-section { display: flex; flex-direction: column; gap: 10px; }
#newspaper-container .np-sidebar-title {
    font-family: var(--font-ui, 'NP Old Standard', Georgia, serif);
    font-size: 13px; text-transform: uppercase; letter-spacing: 1.8px;
    color: var(--text-primary-hover, #ffcc66);
    font-weight: bold; padding: 0 4px 6px;
    border-bottom: 1px solid var(--border-primary-hover-translucent-15, rgba(255, 204, 102, 0.2));
    display: flex; align-items: center; justify-content: space-between;
}
#newspaper-container .np-sidebar-count { font-size: 12px; opacity: 0.75; font-weight: normal; }

#newspaper-container .np-paper-list { display: flex; flex-direction: column; gap: 8px; }
#newspaper-container .np-paper-btn {
    font-family: var(--font-ui, 'NP Old Standard', Georgia, serif);
    display: flex; align-items: center; justify-content: space-between; width: 100%;
    padding: 10px 14px;
    background: var(--bg-primary-hover-translucent-35, rgba(32, 27, 21, 0.7));
    color: var(--text-primary-hover, #ffcc66);
    border: 1px solid var(--border-primary-hover-translucent-15, rgba(255, 204, 102, 0.2));
    border-left: 5px solid var(--paper-accent, var(--text-primary-hover, #ffcc66));
    border-radius: 4px; text-align: left; gap: 10px;
    transition: 0.2s ease;
    transition-property: background-color, border-color, color, transform, box-shadow;
}
#newspaper-container .np-paper-btn:hover {
    background: rgba(255, 204, 102, 0.15);
    border-color: var(--text-primary-hover, #ffcc66);
    color: var(--text-primary-hover, #ffcc66);
    transform: translateX(3px);
}
#newspaper-container .np-paper-btn--on {
    background: var(--chip-active-bg, #f5d580);
    color: var(--chip-active-fg, #14120e);
    border-color: var(--chip-active-bg, #f5d580);
    border-left: 6px solid var(--paper-accent, #14120e);
    box-shadow: 0 3px 12px var(--shadow-gold-amber-50, rgba(0, 0, 0, 0.5));
}
#newspaper-container .np-paper-btn--on:hover {
    background: var(--chip-active-bg, #f5d580);
    color: var(--chip-active-fg, #14120e);
    transform: none;
}
#newspaper-container .np-paper-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 auto; }
#newspaper-container .np-paper-name { font-size: 17px; font-weight: bold; line-height: 1.22; word-break: break-word; }
#newspaper-container .np-paper-meta { font-size: 12px; opacity: 0.8; font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#newspaper-container .np-paper-count {
    flex: 0 0 auto; font-size: 13px; font-weight: bold; padding: 3px 9px;
    border-radius: 12px;
    background: rgba(0, 0, 0, 0.45);
    color: var(--text-primary-hover, #ffcc66);
    border: 1px solid var(--border-primary-hover-translucent-15, rgba(255, 204, 102, 0.2));
}
#newspaper-container .np-paper-btn--on .np-paper-count {
    background: rgba(0, 0, 0, 0.18);
    color: var(--chip-active-fg, #14120e);
    border-color: transparent;
}

#newspaper-container .np-article-list { display: flex; flex-direction: column; gap: 6px; }
#newspaper-container .np-article-btn {
    font-family: var(--font-ui, 'NP Old Standard', Georgia, serif);
    display: flex; flex-direction: column; gap: 3px; width: 100%;
    padding: 8px 12px;
    background: var(--bg-primary-hover-translucent-35, rgba(24, 20, 16, 0.65));
    color: #dfd5c4;
    border: 1px solid var(--border-primary-hover-translucent-15, rgba(255, 204, 102, 0.15));
    border-radius: 4px; text-align: left;
    transition: 0.2s ease;
    transition-property: background-color, border-color, color, transform;
}
#newspaper-container .np-article-btn:hover {
    background: rgba(255, 204, 102, 0.14);
    border-color: var(--text-primary-hover, #ffcc66);
    color: #ffffff;
    transform: translateX(3px);
}
#newspaper-container .np-article-btn-sec {
    font-size: 11px; text-transform: uppercase; letter-spacing: 1.4px;
    color: var(--text-primary-hover, #ffcc66); font-weight: bold;
}
#newspaper-container .np-article-btn-title {
    font-size: 15px; font-weight: 600; line-height: 1.25; color: #ede5d7;
}
#newspaper-container .np-article-btn:hover .np-article-btn-title { color: #ffffff; }
#newspaper-container .np-article-btn-author { font-size: 12px; opacity: 0.75; font-style: italic; }

#newspaper-container .np-sheet {
    flex: 1 1 auto; overflow-y: auto; padding: 28px 28px 64px;
    background: transparent;
}
#newspaper-container .np-sheet::-webkit-scrollbar { width: 8px; }
#newspaper-container .np-sheet::-webkit-scrollbar-track { background: var(--shadow-primary-hover-translucent-5, rgba(0, 0, 0, 0.3)); }
#newspaper-container .np-sheet::-webkit-scrollbar-thumb { background: var(--scroll-thumb-hover-translucent-60, #63523d); border-radius: 4px; }
#newspaper-container .np-sheet::-webkit-scrollbar-thumb:hover { background: var(--text-primary-hover, #ffcc66); }

#newspaper-container .np-page {
    width: 96%; max-width: 1080px; margin: 0 auto; padding: 32px 46px 56px;
    background-color: #f4ecd8;
    background-image:
        url("data:image/svg+xml,%3Csvg viewBox='0%200%20200%20200'%20xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter%20id='noiseFilter'%3E%3CfeTurbulence%20type='fractalNoise'%20baseFrequency='0.8'%20numOctaves='3'%20stitchTiles='stitch'/%3E%3C/filter%3E%3Crect%20width='100%25'%20height='100%25'%20filter='url(%23noiseFilter)'%20opacity='0.035'/%3E%3C/svg%3E"),
        var(--gradient-34),
        var(--gradient-26);
    background-size: 200px 200px, auto, auto;
    border: 6px double var(--text-text-alt-1-active, #4a3622);
    outline: 1px solid var(--border-primary-hover-translucent-15, rgba(255, 204, 102, 0.2));
    outline-offset: -10px;
    box-shadow:
        0 30px 75px var(--shadow-heavy, rgba(0, 0, 0, 0.75)),
        inset 0 0 100px var(--border-primary-hover-translucent-15, rgba(0, 0, 0, 0.08));
    user-select: text;
    -webkit-user-select: text;
}
#newspaper-container .np-masthead {
    text-align: center;
    border-bottom: 4px double var(--text-text-alt-1-active, #1b1813);
    padding-bottom: 8px; margin-bottom: 20px;
}
#newspaper-container .np-ears {
    display: flex; justify-content: space-between; font-size: 14px; text-transform: uppercase;
    letter-spacing: 1.8px;
    border-bottom: 1px solid var(--text-text-alt-1-active, #1b1813);
    padding-bottom: 5px;
}
#newspaper-container .np-title {
    margin: 8px 0 2px; font-size: 74px; line-height: 1.05; font-weight: 400; color: var(--np-accent, #1a1a1a);
}
#newspaper-container .np-motto { font-style: italic; font-size: 17px; margin-top: 4px; }
#newspaper-container .np-dateline {
    display: flex; justify-content: space-between; gap: 12px; margin-top: 10px; padding: 6px 0;
    border-top: 1px solid var(--text-text-alt-1-active, #1b1813);
    border-bottom: 1px solid var(--text-text-alt-1-active, #1b1813);
    font-size: 14px; text-transform: uppercase; letter-spacing: 1.2px;
}
#newspaper-container .np-article {
    break-inside: avoid; margin: 0 0 24px; padding-bottom: 18px;
    border-bottom: 1px solid rgba(27,24,19,0.45);
    transition: background 0.3s, outline 0.3s;
}
#newspaper-container .np-article--lead {
    border-bottom: 3px solid var(--text-text-alt-1-active, #1b1813);
    margin-bottom: 28px; padding-bottom: 24px;
}
#newspaper-container .np-article--flash {
    outline: 3px solid var(--text-primary-hover, #ffcc66); outline-offset: 6px;
    background: rgba(255, 204, 102, 0.15); border-radius: 2px;
}
#newspaper-container .np-kicker {
    font-size: 13px; text-transform: uppercase; letter-spacing: 2px; color: var(--np-accent, #1a1a1a); font-weight: 700;
}
#newspaper-container .np-headline { margin: 4px 0 6px; font-size: 32px; line-height: 1.15; font-weight: 700; }
#newspaper-container .np-article--lead .np-headline { font-size: 54px; text-align: center; line-height: 1.08; margin: 6px 0 10px; }
#newspaper-container .np-deck { font-style: italic; font-size: 20px; line-height: 1.35; margin-bottom: 8px; color: #2e2820; }
#newspaper-container .np-article--lead .np-deck { font-size: 24px; text-align: center; margin-bottom: 12px; }
#newspaper-container .np-byline { font-size: 13px; text-transform: uppercase; letter-spacing: 1.4px; margin-bottom: 12px; color: #3b3329; }
#newspaper-container .np-article--lead .np-byline { text-align: center; margin-bottom: 16px; font-size: 14px; }
#newspaper-container .np-desk { opacity: 0.75; text-transform: none; letter-spacing: 0; font-style: italic; }
#newspaper-container .np-body { font-size: 19px; line-height: 1.5; text-align: justify; }
#newspaper-container .np-body p { margin: 0 0 10px; text-indent: 1.4em; }
#newspaper-container .np-body p:first-child { text-indent: 0; }
#newspaper-container .np-article--lead .np-body {
    column-count: 2; column-gap: 36px; column-rule: 1px solid rgba(27,24,19,0.3); font-size: 20px; line-height: 1.55;
}
#newspaper-container .np-article--lead .np-body p:first-child::first-letter {
    float: left; font-family: 'NP Playfair', serif; font-size: 68px; line-height: 0.85; padding: 4px 8px 0 0; font-weight: 900;
}
#newspaper-container .np-body--typed { font-family: 'NP Typewriter', 'Courier New', monospace; font-size: 17px; text-align: left; }
#newspaper-container .np-columns { column-count: 2; column-gap: 32px; column-rule: 1px solid rgba(27,24,19,0.3); }
#newspaper-container .np-key { background: linear-gradient(transparent 12%, #ffe14a 12%, #ffe14a 88%, transparent 88%); padding: 0 2px; }
#newspaper-container .np-link { cursor: pointer; border-bottom: 1px dotted #1b1813; }
#newspaper-container .np-link:hover { background: linear-gradient(transparent 12%, #ffd000 12%, #ffd000 88%, transparent 88%); }
#newspaper-container .np-link--closed { border-bottom-style: dashed; }
#newspaper-container .np-key--focus { outline: 2px solid #1b1813; outline-offset: 1px; }
#newspaper-container .np-empty { text-align: center; font-style: italic; font-size: 24px; padding: 100px 0; color: var(--text-text-alt-1-active, #4a3622); }
`;
    // i18n-ignore-end

})();
