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
    const FIRST_DAY = new Date(1900, 0, 1);

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
        if (typeof $gameVariables !== "undefined" && $gameVariables) {
            const v = $gameVariables.value(113);
            if (v && typeof v === "string") {
                const parts = v.trim().split(/\s+/);
                if (parts.length >= 3) {
                    const day = parseInt(parts[0], 10) || 1;
                    const mStr = (parts[1] || "").toUpperCase();
                    const year = parseInt(parts[2], 10) || 2001;
                    const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
                    let month = months.indexOf(mStr);
                    if (month === -1) {
                        const itMonths = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SET", "OTT", "NOV", "DIC"];
                        month = itMonths.indexOf(mStr);
                    }
                    if (month !== -1) {
                        const timeStr = (parts[3] || "08:00").split(":");
                        const h = parseInt(timeStr[0], 10) || 8;
                        const m = parseInt(timeStr[1], 10) || 0;
                        return new Date(year, month, day, h, m);
                    }
                }
            }
        }
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
        if (typeof P.historyArticlesForDay === "function") {
            for (const a of P.historyArticlesForDay(day)) {
                out.push(a);
            }
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
                else if (act === "day") {
                    if (btn.dataset.date) {
                        const [y, m, d] = btn.dataset.date.split("-").map(Number);
                        this._setDay(new Date(y, m - 1, d));
                    }
                }
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
            const atStartDay = this._day <= FIRST_DAY;
            const atEndDay = this._day >= this._today;
            const atStartMonth = (this._day.getFullYear() < FIRST_DAY.getFullYear()) ||
                (this._day.getFullYear() === FIRST_DAY.getFullYear() && this._day.getMonth() <= FIRST_DAY.getMonth());
            const atEndMonth = (this._day.getFullYear() > this._today.getFullYear()) ||
                (this._day.getFullYear() === this._today.getFullYear() && this._day.getMonth() >= this._today.getMonth());
            return `
                <div class="np-nav">
                    <button class="np-btn" data-np="prevMonth" ${atStartMonth ? "disabled" : ""}>&laquo;</button>
                    <button class="np-btn" data-np="prev" ${atStartDay ? "disabled" : ""} title="${escapeHtml(tr("prevDay"))}">&lsaquo;</button>
                    <span class="np-nav-date">${escapeHtml(this._dateLine(this._day))}</span>
                    <button class="np-btn" data-np="next" ${atEndDay ? "disabled" : ""} title="${escapeHtml(tr("nextDay"))}">&rsaquo;</button>
                    <button class="np-btn" data-np="nextMonth" ${atEndMonth ? "disabled" : ""}>&raquo;</button>
                    <button class="np-btn np-btn--wide" data-np="today" ${atEndDay ? "disabled" : ""}>${escapeHtml(tr("today"))}</button>
                    <span class="np-nav-fill"></span>
                    <button class="np-btn np-btn--wide np-btn--close" data-np="close">${escapeHtml(tr("close"))}</button>
                </div>`;
        }

        _formatEditionDate(day) {
            const lang = (window.ConfigManager && ConfigManager.language) === "it" ? "it-IT" : "en-GB";
            try {
                return day.toLocaleDateString(lang, { day: "numeric", month: "short", year: "numeric" });
            } catch (e) {
                return `${day.getDate()}/${day.getMonth() + 1}/${day.getFullYear()}`;
            }
        }

        _formatWeekday(day) {
            const lang = (window.ConfigManager && ConfigManager.language) === "it" ? "it-IT" : "en-GB";
            try {
                return day.toLocaleDateString(lang, { weekday: "short" });
            } catch (e) {
                return "";
            }
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

            const days = this._availableDays();
            let editionItems = "";
            if (days.length > 1 || (days.length === 1 && !sameDay(days[0], this._day))) {
                const list = days.slice(0, 30);
                editionItems = list.map(d => {
                    const on = sameDay(d, this._day) ? " np-edition-btn--on" : "";
                    const isToday = sameDay(d, this._today);
                    const label = isToday ? tr("today") : this._formatEditionDate(d);
                    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                    return `
                        <button class="np-edition-btn${on}" data-np="day" data-date="${iso}">
                            <span class="np-edition-date">${escapeHtml(label)}</span>
                            <span class="np-edition-weekday">${escapeHtml(this._formatWeekday(d))}</span>
                        </button>`;
                }).join("");
            }

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
                ${editionItems ? `
                <div class="np-sidebar-section np-sidebar-editions">
                    <div class="np-sidebar-title">${escapeHtml(tr("archive"))} <span class="np-sidebar-count">(${days.length})</span></div>
                    <div class="np-edition-list">${editionItems}</div>
                </div>` : ""}
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
                        <div class="np-ears"><span>${escapeHtml(tr("frontPage"))}</span><span>${escapeHtml(T("News.reader.volume", { vol: Math.max(1, year - 1900 + 1), no: dayOfYear }))}</span></div>
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

        _availableDays() {
            const P = window.NewsPress;
            if (!P) return [];
            const datesSet = new Set();
            const startYear = FIRST_DAY.getFullYear();
            const endYear = this._today.getFullYear();
            const now = gameNow();

            for (let y = startYear; y <= endYear; y++) {
                for (const row of P.archive(y)) {
                    if (!row || !row.date) continue;
                    const parts = row.date.split("/");
                    if (parts.length < 3) continue;
                    const dNum = parseInt(parts[0], 10);
                    const mNum = parseInt(parts[1], 10) - 1;
                    const yNum = parseInt(parts[2], 10);
                    const dateObj = new Date(yNum, mNum, dNum);
                    if (dateObj < FIRST_DAY || dateObj > this._today) continue;
                    if (sameDay(dateObj, now) && row.time) {
                        const [h, m] = row.time.split(":").map(Number);
                        if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) continue;
                    }
                    datesSet.add(dateObj.getTime());
                }
            }

            const mgr = window.$newsManager;
            const wire = mgr && Array.isArray(mgr.newsHistory) ? mgr.newsHistory : [];
            for (const news of wire) {
                if (!news || news.realId || !news.timestamp) continue;
                const when = startOfDay(new Date(news.timestamp));
                if (when >= FIRST_DAY && when <= this._today) {
                    datesSet.add(when.getTime());
                }
            }

            if (typeof P.worldHistoryEvents === "function") {
                for (const ev of P.worldHistoryEvents()) {
                    if (!ev || !ev.date) continue;
                    const parts = String(ev.date).trim().split("-");
                    if (parts.length < 2) continue;
                    const yNum = parseInt(parts[0], 10);
                    const mNum = parseInt(parts[1], 10) - 1;
                    const dNum = parts[2] ? parseInt(parts[2], 10) : 1;
                    if (isNaN(yNum) || isNaN(mNum) || isNaN(dNum)) continue;
                    const dateObj = new Date(yNum, mNum, dNum);
                    if (dateObj >= FIRST_DAY && dateObj <= this._today) {
                        datesSet.add(dateObj.getTime());
                    }
                }
            }

            const arr = Array.from(datesSet).map(t => new Date(t));
            arr.sort((a, b) => b.getTime() - a.getTime());
            return arr;
        }

        _turnDay(direction) {
            const days = this._availableDays();
            const curTime = this._day.getTime();
            if (days.length > 0) {
                if (direction < 0) {
                    const prev = days.find(d => d.getTime() < curTime);
                    if (prev) {
                        this._setDay(prev);
                        return;
                    }
                } else if (direction > 0) {
                    for (let i = days.length - 1; i >= 0; i--) {
                        if (days[i].getTime() > curTime) {
                            this._setDay(days[i]);
                            return;
                        }
                    }
                }
            }
            const d = new Date(this._day);
            d.setDate(d.getDate() + direction);
            this._setDay(d);
        }

        _turnMonth(direction) {
            const d = new Date(this._day);
            const curDay = d.getDate();
            d.setDate(1);
            d.setMonth(d.getMonth() + direction);
            const maxDays = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
            d.setDate(Math.min(curDay, maxDays));
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
    background-color: #12100e;
    color: #1b1813;
    font-family: var(--font-ui, 'NP Old Standard', Georgia, serif);
    user-select: none;
    -webkit-user-select: none;
    box-sizing: border-box;
}
#newspaper-container button { font-family: var(--font-ui, 'NP Old Standard', Georgia, serif); cursor: pointer; }

#newspaper-container .np-bar {
    flex: 0 0 auto;
    background: #191613;
    color: #dfd5c4;
    padding: 8px 18px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    z-index: 20;
}
#newspaper-container .np-nav { display: flex; align-items: center; gap: 8px; }
#newspaper-container .np-nav-date {
    font-family: var(--font-ui, 'NP Old Standard', Georgia, serif);
    font-size: 20px; font-weight: bold; padding: 0 14px; min-width: 280px;
    text-align: center; letter-spacing: 0.5px;
    color: #f0ebe1;
}
#newspaper-container .np-nav-fill { flex: 1 1 auto; }
#newspaper-container .np-btn {
    font-family: var(--font-ui, 'NP Old Standard', Georgia, serif);
    font-size: 19px; font-weight: bold; line-height: 1;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.18);
    color: #dfd5c4;
    border-radius: 3px;
    min-width: 36px; height: 32px;
    display: inline-flex; align-items: center; justify-content: center;
    transition: background-color 0.15s, border-color 0.15s, color 0.15s;
}
#newspaper-container .np-btn--wide { padding: 0 14px; font-size: 14px; }
#newspaper-container .np-btn:disabled { opacity: 0.28; cursor: default; }
#newspaper-container .np-btn:not(:disabled):hover {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.35);
    color: #ffffff;
}
#newspaper-container .np-btn--close {
    border-color: rgba(212, 160, 80, 0.4);
    color: #d4a050;
}
#newspaper-container .np-btn--close:hover {
    background: rgba(212, 160, 80, 0.15);
    border-color: #d4a050;
    color: #ffe6aa;
}

#newspaper-container .np-workspace {
    flex: 1 1 auto; display: flex; flex-direction: row;
    overflow: hidden; height: calc(100vh - 49px);
}

#newspaper-container .np-sidebar {
    width: 310px; flex: 0 0 310px;
    background: #161411;
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    display: flex; flex-direction: column; overflow-y: auto; overflow-x: hidden;
    padding: 16px 14px 32px; gap: 18px;
    z-index: 10;
}
#newspaper-container .np-sidebar::-webkit-scrollbar { width: 5px; }
#newspaper-container .np-sidebar::-webkit-scrollbar-track { background: rgba(0, 0, 0, 0.2); }
#newspaper-container .np-sidebar::-webkit-scrollbar-thumb { background: #3d352b; border-radius: 2px; }
#newspaper-container .np-sidebar::-webkit-scrollbar-thumb:hover { background: #5c4f3f; }

#newspaper-container .np-sidebar-section { display: flex; flex-direction: column; gap: 8px; }
#newspaper-container .np-sidebar-title {
    font-family: var(--font-ui, 'NP Old Standard', Georgia, serif);
    font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px;
    color: #9c9182;
    font-weight: bold; padding: 0 2px 5px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    display: flex; align-items: center; justify-content: space-between;
}
#newspaper-container .np-sidebar-count { font-size: 11px; opacity: 0.7; font-weight: normal; }

#newspaper-container .np-paper-list { display: flex; flex-direction: column; gap: 5px; }
#newspaper-container .np-paper-btn {
    font-family: var(--font-ui, 'NP Old Standard', Georgia, serif);
    display: flex; align-items: center; justify-content: space-between; width: 100%;
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.03);
    color: #cfc6b8;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-left: 3px solid var(--paper-accent, #666);
    border-radius: 2px; text-align: left; gap: 8px;
    transition: background-color 0.15s, border-color 0.15s, color 0.15s;
}
#newspaper-container .np-paper-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.18);
    color: #ffffff;
}
#newspaper-container .np-paper-btn--on {
    background: rgba(255, 255, 255, 0.12);
    color: #ffffff;
    border-color: rgba(255, 255, 255, 0.22);
    border-left: 4px solid var(--paper-accent, #fff);
}
#newspaper-container .np-paper-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1 1 auto; }
#newspaper-container .np-paper-name { font-size: 15px; font-weight: bold; line-height: 1.2; word-break: break-word; }
#newspaper-container .np-paper-meta { font-size: 11px; opacity: 0.7; font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#newspaper-container .np-paper-count {
    flex: 0 0 auto; font-size: 11px; font-weight: bold; padding: 2px 7px;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.35);
    color: #b0a595;
}
#newspaper-container .np-paper-btn--on .np-paper-count {
    background: rgba(0, 0, 0, 0.5);
    color: #ffffff;
}

#newspaper-container .np-edition-list { display: flex; flex-direction: column; gap: 4px; max-height: 180px; overflow-y: auto; padding-right: 2px; }
#newspaper-container .np-edition-list::-webkit-scrollbar { width: 4px; }
#newspaper-container .np-edition-list::-webkit-scrollbar-thumb { background: #3d352b; border-radius: 2px; }
#newspaper-container .np-edition-btn {
    font-family: var(--font-ui, 'NP Old Standard', Georgia, serif);
    display: flex; align-items: center; justify-content: space-between; width: 100%;
    padding: 6px 10px;
    background: rgba(255, 255, 255, 0.03);
    color: #cfc6b8;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 2px; text-align: left;
    transition: background-color 0.15s, border-color 0.15s, color 0.15s;
}
#newspaper-container .np-edition-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.18);
    color: #ffffff;
}
#newspaper-container .np-edition-btn--on {
    background: rgba(255, 255, 255, 0.12);
    color: #ffffff;
    border-color: rgba(255, 255, 255, 0.22);
    font-weight: bold;
}
#newspaper-container .np-edition-date { font-size: 13px; }
#newspaper-container .np-edition-weekday { font-size: 11px; opacity: 0.65; text-transform: uppercase; }

#newspaper-container .np-article-list { display: flex; flex-direction: column; gap: 5px; }
#newspaper-container .np-article-btn {
    font-family: var(--font-ui, 'NP Old Standard', Georgia, serif);
    display: flex; flex-direction: column; gap: 2px; width: 100%;
    padding: 7px 10px;
    background: rgba(255, 255, 255, 0.02);
    color: #cfc6b8;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 2px; text-align: left;
    transition: background-color 0.15s, border-color 0.15s, color 0.15s;
}
#newspaper-container .np-article-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.18);
    color: #ffffff;
}
#newspaper-container .np-article-btn-sec {
    font-size: 10px; text-transform: uppercase; letter-spacing: 1.2px;
    color: #9c9182; font-weight: bold;
}
#newspaper-container .np-article-btn-title {
    font-size: 14px; font-weight: 600; line-height: 1.25; color: #ede5d7;
}
#newspaper-container .np-article-btn:hover .np-article-btn-title { color: #ffffff; }
#newspaper-container .np-article-btn-author { font-size: 11px; opacity: 0.7; font-style: italic; }

#newspaper-container .np-sheet {
    flex: 1 1 auto; overflow-y: auto; padding: 24px 20px 48px;
    background: #0e0d0b;
}
#newspaper-container .np-sheet::-webkit-scrollbar { width: 6px; }
#newspaper-container .np-sheet::-webkit-scrollbar-track { background: rgba(0, 0, 0, 0.2); }
#newspaper-container .np-sheet::-webkit-scrollbar-thumb { background: #3d352b; border-radius: 3px; }
#newspaper-container .np-sheet::-webkit-scrollbar-thumb:hover { background: #5c4f3f; }

#newspaper-container .np-page {
    --np-paper: #fbf9f4;
    --np-ink: #1b1813;
    --np-ink-soft: #4a3622;
    width: 96%; max-width: 1040px; margin: 0 auto; padding: 32px 42px 48px;
    background-color: var(--np-paper);
    color: var(--np-ink);
    border: 1px solid #d4cdbe;
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.25);
    user-select: text;
    -webkit-user-select: text;
}
#newspaper-container .np-masthead {
    text-align: center;
    border-bottom: 2px solid var(--np-ink);
    padding-bottom: 6px; margin-bottom: 18px;
}
#newspaper-container .np-ears {
    display: flex; justify-content: space-between; font-size: 13px; text-transform: uppercase;
    letter-spacing: 1.5px;
    border-bottom: 1px solid var(--np-ink);
    padding-bottom: 4px;
}
#newspaper-container .np-title {
    margin: 6px 0 2px; font-size: 68px; line-height: 1.05; font-weight: 400; color: var(--np-accent, #1a1a1a);
}
#newspaper-container .np-motto { font-style: italic; font-size: 15px; margin-top: 3px; }
#newspaper-container .np-dateline {
    display: flex; justify-content: space-between; gap: 10px; margin-top: 8px; padding: 5px 0;
    border-top: 1px solid var(--np-ink);
    border-bottom: 1px solid var(--np-ink);
    font-size: 13px; text-transform: uppercase; letter-spacing: 1px;
}
#newspaper-container .np-article {
    break-inside: avoid; margin: 0 0 22px; padding-bottom: 16px;
    border-bottom: 1px solid rgba(27,24,19,0.3);
    transition: background-color 0.2s;
}
#newspaper-container .np-article--lead {
    border-bottom: 2px solid var(--np-ink);
    margin-bottom: 24px; padding-bottom: 20px;
}
#newspaper-container .np-article--flash {
    outline: 2px solid #b38600; outline-offset: 4px;
    background: rgba(255, 230, 100, 0.3);
}
#newspaper-container .np-kicker {
    font-size: 12px; text-transform: uppercase; letter-spacing: 1.8px; color: var(--np-accent, #1a1a1a); font-weight: 700;
}
#newspaper-container .np-headline { margin: 4px 0 6px; font-size: 32px; line-height: 1.15; font-weight: 700; }
#newspaper-container .np-article--lead .np-headline { font-size: 50px; text-align: center; line-height: 1.08; margin: 6px 0 8px; }
#newspaper-container .np-deck { font-style: italic; font-size: 18px; line-height: 1.35; margin-bottom: 8px; color: #2e2820; }
#newspaper-container .np-article--lead .np-deck { font-size: 22px; text-align: center; margin-bottom: 10px; }
#newspaper-container .np-byline { font-size: 12px; text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 10px; color: #3b3329; }
#newspaper-container .np-article--lead .np-byline { text-align: center; margin-bottom: 14px; font-size: 13px; }
#newspaper-container .np-desk { opacity: 0.75; text-transform: none; letter-spacing: 0; font-style: italic; }
#newspaper-container .np-body { font-size: 19px; line-height: 1.5; text-align: justify; }
#newspaper-container .np-body p { margin: 0 0 10px; text-indent: 1.4em; }
#newspaper-container .np-body p:first-child { text-indent: 0; }
#newspaper-container .np-article--lead .np-body {
    column-count: 2; column-gap: 32px; column-rule: 1px solid rgba(27,24,19,0.25); font-size: 20px; line-height: 1.55;
}
#newspaper-container .np-article--lead .np-body p:first-child::first-letter {
    float: left; font-family: 'NP Playfair', serif; font-size: 64px; line-height: 0.85; padding: 4px 6px 0 0; font-weight: 900;
}
#newspaper-container .np-body--typed { font-family: 'NP Typewriter', 'Courier New', monospace; font-size: 16px; text-align: left; }
#newspaper-container .np-columns { column-count: 2; column-gap: 28px; column-rule: 1px solid rgba(27,24,19,0.25); }
#newspaper-container .np-key { background: #fff1a8; padding: 0 2px; }
#newspaper-container .np-link { cursor: pointer; border-bottom: 1px dotted #1b1813; }
#newspaper-container .np-link:hover { background: #ffe46b; }
#newspaper-container .np-link--closed { border-bottom-style: dashed; }
#newspaper-container .np-key--focus { outline: 2px solid #1b1813; outline-offset: 1px; }
#newspaper-container .np-empty { text-align: center; font-style: italic; font-size: 22px; padding: 80px 0; color: var(--np-ink-soft); }
`;
    // i18n-ignore-end

})();
