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
                <div class="np-sheet"><div class="np-page"></div></div>`;
            document.body.appendChild(this._container);
            this._barEl = this._container.querySelector(".np-bar");
            this._sheetEl = this._container.querySelector(".np-sheet");
            this._pageEl = this._container.querySelector(".np-page");
            this._onClick = (e) => {
                if (!e.target || !e.target.closest) return;
                const key = e.target.closest(".np-link, .np-key");
                if (key) { e.preventDefault(); this._follow(key.dataset.term || key.textContent); return; }
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
            this._pageEl.innerHTML = this._renderPage();
            this._focus = -1;
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
            const P = window.NewsPress;
            const atStart = this._day <= FIRST_DAY;
            const atEnd = this._day >= this._today;
            const tabs = this._papers.map(id => {
                const name = id === "all" ? tr("allPapers") : P.outletName(id);
                const count = id === "all" ? this._articles.length : this._counts.get(id);
                const on = id === this._paper ? " np-tab--on" : "";
                return `<button class="np-tab${on}" data-np="paper" data-paper="${escapeHtml(id)}">${escapeHtml(name)} <span class="np-tab-count">${count}</span></button>`;
            }).join("");
            return `
                <div class="np-nav">
                    <button class="np-btn" data-np="prevMonth" ${atStart ? "disabled" : ""}>&laquo;</button>
                    <button class="np-btn" data-np="prev" ${atStart ? "disabled" : ""} title="${escapeHtml(tr("prevDay"))}">&lsaquo;</button>
                    <span class="np-nav-date">${escapeHtml(this._dateLine(this._day))}</span>
                    <button class="np-btn" data-np="next" ${atEnd ? "disabled" : ""} title="${escapeHtml(tr("nextDay"))}">&rsaquo;</button>
                    <button class="np-btn" data-np="nextMonth" ${atEnd ? "disabled" : ""}>&raquo;</button>
                    <button class="np-btn np-btn--wide" data-np="today" ${atEnd ? "disabled" : ""}>${escapeHtml(tr("today"))}</button>
                    <span class="np-nav-fill"></span>
                    <button class="np-btn np-btn--wide" data-np="close">${escapeHtml(tr("close"))}</button>
                </div>
                <div class="np-tabs">${tabs}</div>`;
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
                <article class="np-article${lead ? " np-article--lead" : ""}" style="--np-accent:${o.accent || "#1a1a1a"}">
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
            this._barEl = this._sheetEl = this._pageEl = null;
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
    width: 100vw; height: 100vh; z-index: 100;
    display: flex; flex-direction: column;
    background: #2b2620;
    color: #1b1813;
    font-family: 'NP Old Standard', Georgia, serif;
}
#newspaper-container button { font-family: 'NP Old Standard', Georgia, serif; cursor: pointer; }
#newspaper-container .np-bar {
    flex: 0 0 auto; background: #1d1a16; color: #e9e1cf;
    padding: 8px 16px 6px; border-bottom: 2px solid #0e0c0a;
}
#newspaper-container .np-nav { display: flex; align-items: center; gap: 6px; }
#newspaper-container .np-nav-date { font-size: 20px; padding: 0 10px; min-width: 300px; text-align: center; letter-spacing: 0.5px; }
#newspaper-container .np-nav-fill { flex: 1 1 auto; }
#newspaper-container .np-btn {
    background: #3a332a; color: #f1e9d6; border: 1px solid #6b5f4c; border-radius: 3px;
    min-width: 34px; height: 30px; font-size: 18px; line-height: 1;
}
#newspaper-container .np-btn--wide { padding: 0 12px; font-size: 15px; }
#newspaper-container .np-btn:disabled { opacity: 0.35; cursor: default; }
#newspaper-container .np-btn:not(:disabled):hover { background: #4d4436; }
#newspaper-container .np-tabs { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
#newspaper-container .np-tab {
    background: transparent; color: #d8cfba; border: 1px solid #4d4436; border-radius: 2px;
    padding: 2px 8px; font-size: 13px;
}
#newspaper-container .np-tab--on { background: #efe6d2; color: #1b1813; border-color: #efe6d2; }
#newspaper-container .np-tab-count { opacity: 0.6; font-size: 11px; }
#newspaper-container .np-sheet { flex: 1 1 auto; overflow-y: auto; padding: 18px 0 40px; }
#newspaper-container .np-page {
    width: 92%; max-width: 1180px; margin: 0 auto; padding: 22px 34px 40px;
    background: #f3ecdc;
    background-image: linear-gradient(90deg, rgba(0,0,0,0.035), rgba(0,0,0,0) 6%, rgba(0,0,0,0) 94%, rgba(0,0,0,0.04));
    box-shadow: 0 6px 24px rgba(0,0,0,0.55);
}
#newspaper-container .np-masthead { text-align: center; border-bottom: 4px double #1b1813; padding-bottom: 6px; margin-bottom: 16px; }
#newspaper-container .np-ears {
    display: flex; justify-content: space-between; font-size: 12px; text-transform: uppercase;
    letter-spacing: 1.5px; border-bottom: 1px solid #1b1813; padding-bottom: 4px;
}
#newspaper-container .np-title {
    margin: 6px 0 0; font-size: 68px; line-height: 1.05; font-weight: 400; color: var(--np-accent);
}
#newspaper-container .np-motto { font-style: italic; font-size: 15px; margin-top: 2px; }
#newspaper-container .np-dateline {
    display: flex; justify-content: space-between; gap: 12px; margin-top: 8px; padding: 4px 0;
    border-top: 1px solid #1b1813; border-bottom: 1px solid #1b1813;
    font-size: 13px; text-transform: uppercase; letter-spacing: 1px;
}
#newspaper-container .np-article { break-inside: avoid; margin: 0 0 18px; padding-bottom: 14px; border-bottom: 1px solid rgba(27,24,19,0.45); }
#newspaper-container .np-article--lead { border-bottom: 3px solid #1b1813; }
#newspaper-container .np-kicker {
    font-size: 11px; text-transform: uppercase; letter-spacing: 1.6px; color: var(--np-accent); font-weight: 700;
}
#newspaper-container .np-headline { margin: 2px 0 4px; font-size: 26px; line-height: 1.12; font-weight: 700; }
#newspaper-container .np-article--lead .np-headline { font-size: 48px; text-align: center; line-height: 1.06; }
#newspaper-container .np-deck { font-style: italic; font-size: 16px; line-height: 1.3; margin-bottom: 6px; }
#newspaper-container .np-article--lead .np-deck { font-size: 21px; text-align: center; }
#newspaper-container .np-byline { font-size: 12px; text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 8px; }
#newspaper-container .np-article--lead .np-byline { text-align: center; }
#newspaper-container .np-desk { opacity: 0.7; text-transform: none; letter-spacing: 0; font-style: italic; }
#newspaper-container .np-body { font-size: 16px; line-height: 1.45; text-align: justify; }
#newspaper-container .np-body p { margin: 0 0 8px; text-indent: 1.2em; }
#newspaper-container .np-body p:first-child { text-indent: 0; }
#newspaper-container .np-article--lead .np-body { column-count: 3; column-gap: 26px; column-rule: 1px solid rgba(27,24,19,0.3); font-size: 17px; }
#newspaper-container .np-article--lead .np-body p:first-child::first-letter {
    float: left; font-family: 'NP Playfair', serif; font-size: 58px; line-height: 0.85; padding: 4px 6px 0 0; font-weight: 900;
}
#newspaper-container .np-body--typed { font-family: 'NP Typewriter', 'Courier New', monospace; font-size: 15px; text-align: left; }
#newspaper-container .np-columns { column-count: 3; column-gap: 26px; column-rule: 1px solid rgba(27,24,19,0.3); }
#newspaper-container .np-key { background: linear-gradient(transparent 12%, #ffe14a 12%, #ffe14a 88%, transparent 88%); padding: 0 1px; }
#newspaper-container .np-link { cursor: pointer; border-bottom: 1px dotted #1b1813; }
#newspaper-container .np-link:hover { background: linear-gradient(transparent 12%, #ffd000 12%, #ffd000 88%, transparent 88%); }
#newspaper-container .np-link--closed { border-bottom-style: dashed; }
#newspaper-container .np-key--focus { outline: 2px solid #1b1813; outline-offset: 1px; }
#newspaper-container .np-empty { text-align: center; font-style: italic; font-size: 22px; padding: 80px 0; }
`;
    // i18n-ignore-end

})();
