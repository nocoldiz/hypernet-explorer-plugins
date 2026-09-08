/*:
 * @target MZ
 * @plugindesc UI for HistorySimulator: Scene_History DOM overlay with keyboard/controller navigation.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * HistorySimulatorUI.js
 * ============================================================================
 * DOM scene and window stubs for the Historical Archive viewer.
 * Must be listed AFTER HistorySimulator.js in the plugin manager.
 * Reads window.HistoryManager exposed by HistorySimulator.js.
 * ============================================================================
 */

(function () {
    'use strict';

    // Wire WASD → RMMZ directional inputs (global; maps to standard directions so harmless everywhere)
    Input.keyMapper[87] = 'up';    // W
    Input.keyMapper[83] = 'down';  // S
    Input.keyMapper[65] = 'left';  // A
    Input.keyMapper[68] = 'right'; // D

    //=============================================================================
    // Scene_History
    //=============================================================================

    class Scene_History extends Scene_MenuBase {
        create() {
            super.create();
            this.createWindowLayer();
            this.createTitleWindow();
            this.createSummaryWindow();
            this.createHistoryWindow();
            this.createDetailsWindow();

            this._lastIndex = -1;
            this._archiveMode = "timeline";   // i18n-ignore: shelf id
            this._diseaseIndex = 0;
            this._fixedOnly = false;

            this._historyWindow.activate();
            this._historyWindow.select(0);

            this.initUIHistoryDOM();
        }

        updateUIInput() {
            // The canon filter, which was a click and nothing else: the archive
            // walks its entries with the stick and leaves with Confirm, so the
            // one plate that narrows the list had no key of its own. SHIFT is
            // the second verb on a book spread everywhere else in this game.
            if (Input.isTriggered('shift')) {
                SoundManager.playCursor();
                this.toggleFixedOnly();
                return;
            }
            if (Input.isTriggered('ok')) {
                SoundManager.playOk();
                this.popScene();
                return;
            }
            if (Input.isTriggered('cancel')) {
                SoundManager.playCancel();
                if (window.Scene_CharacterCreation) {
                    // Resume creation just before character-type selection
                    // (interruptedStep + 1 lands on the next interactive step).
                    Scene_CharacterCreation._interruptedStep =
                        (window.CCSteps && window.CCSteps.WORLD_HISTORY) != null
                            ? window.CCSteps.WORLD_HISTORY
                            : 2;
                }
                this.popScene();
                return;
            }

            if (this._archiveMode === "diseases") {
                const rows = this.archiveDiseases();
                if (!rows.length) return;
                const step = (Input.isTriggered('down') || Input.isRepeated('down')) ? 1
                    : ((Input.isTriggered('up') || Input.isRepeated('up')) ? -1 : 0);
                if (!step) return;
                const next = Math.max(0, Math.min((this._diseaseIndex || 0) + step, rows.length - 1));
                if (next === this._diseaseIndex) return;
                this._diseaseIndex = next;
                SoundManager.playCursor();
                const box = this._uiContainer || document.getElementById("history-container");
                if (box) this.renderDiseaseLibrary(box);
                return;
            }

            const allEvents = this.getUIHistoryEvents();
            if (allEvents.length === 0) return;

            const currentIndex = this._historyWindow.index();
            if (Input.isTriggered('down') || Input.isRepeated('down')) {
                const next = Math.min(currentIndex + 1, allEvents.length - 1);
                if (next !== currentIndex) {
                    SoundManager.playCursor();
                    this._historyWindow.select(next);
                    this.syncUIHistoryState();
                }
            } else if (Input.isTriggered('up') || Input.isRepeated('up')) {
                const prev = Math.max(currentIndex - 1, 0);
                if (prev !== currentIndex) {
                    SoundManager.playCursor();
                    this._historyWindow.select(prev);
                    this.syncUIHistoryState();
                }
            }
        }

        update() {
            super.update();
            this.updateUIInput();
            this.syncUIHistoryState();
        }

        terminate() {
            super.terminate();
            const container = document.getElementById("history-container");
            if (container) {
                container.style.transition = "opacity 0.2s ease-out";
                container.style.opacity = "0";
                container.style.pointerEvents = "none";
                setTimeout(() => { container.remove(); }, 200);
            }
        }

        createTitleWindow() {
            const rect = this.titleWindowRect();
            this._titleWindow = new Window_Base(rect);
            this._titleWindow.visible = false;
            this._titleWindow.opacity = 0;
            this.addWindow(this._titleWindow);
        }

        titleWindowRect() {
            return new Rectangle(0, 0, Graphics.boxWidth, 80);
        }

        createSummaryWindow() {
            const rect = this.summaryWindowRect();
            this._summaryWindow = new Window_HistorySummary(rect);
            this._summaryWindow.setHandler('ok', this.onSummaryOk.bind(this));
            this._summaryWindow.setHandler('cancel', this.popScene.bind(this));
            this._summaryWindow.visible = false;
            this._summaryWindow.opacity = 0;
            this.addWindow(this._summaryWindow);
        }

        summaryWindowRect() {
            return new Rectangle(0, 80, Graphics.boxWidth, Graphics.boxHeight - 80);
        }

        createHistoryWindow() {
            const rect = this.historyWindowRect();
            this._historyWindow = new Window_HistoryLog(rect);
            this._historyWindow.setHandler('ok', this.onHistoryOk.bind(this));
            this._historyWindow.setHandler('cancel', this.popScene.bind(this));
            this._historyWindow.visible = false;
            this._historyWindow.opacity = 0;
            this.addWindow(this._historyWindow);
        }

        historyWindowRect() {
            const ww = Math.floor(Graphics.boxWidth * 0.65);
            return new Rectangle(0, 80, ww, Graphics.boxHeight - 80);
        }

        createDetailsWindow() {
            const rect = this.detailsWindowRect();
            this._detailsWindow = new Window_HistoryDetails(rect);
            this._detailsWindow.visible = false;
            this._detailsWindow.opacity = 0;
            this.addWindow(this._detailsWindow);
            this._historyWindow.setDetailsWindow(this._detailsWindow);
        }

        detailsWindowRect() {
            const listW = Math.floor(Graphics.boxWidth * 0.65);
            return new Rectangle(listW, 80, Graphics.boxWidth - listW, Graphics.boxHeight - 80);
        }

        onSummaryOk() { this.popScene(); }
        onHistoryOk() { /* retained for RMMZ event loop handler safety */ }

        // Canon events are the ones handleFixedEvents wrote (HistorySimulator.js),
        // tagged type:'fixed'; everything else is a procedural roll. Both the
        // input clamp and the renderer must read the SAME filtered array, or
        // the selected index desyncs from the visible cards (see setArchiveMode
        // for the same concern on the timeline/diseases shelf switch).
        getUIHistoryEvents() {
            const all = window.HistoryManager
                ? window.HistoryManager.getEvents()
                : ($gameSystem._historicalEvents || []);
            const rows = this._fixedOnly ? all.filter(e => e && e.type === 'fixed') : all;
            // An archive is read oldest first, and the live chronicle appends
            // to the same array the century wrote, so the order it arrives in
            // is only nearly chronological. Sorting here rather than at the
            // draw keeps the selected index and the visible card in step: both
            // sides of the screen read exactly this array.
            const key = rows.length + ':' + (this._fixedOnly ? 1 : 0);
            if (this._sortedFor !== key) {
                this._sortedFor = key;
                this._sorted = rows.slice().sort((a, b) =>
                    String(a && a.date || '').localeCompare(String(b && b.date || '')));
            }
            return this._sorted;
        }

        // The chronicle as an archive reads it: a shelf of years, each year a
        // run of months, each month the entries filed under it. The index on
        // every row is the index into getUIHistoryEvents(), so the keyboard,
        // the mouse and the dossier all still speak in one number.
        groupUIHistoryEvents(events) {
            const years = [];
            let year = null, month = null;
            events.forEach((evt, idx) => {
                const parts = String(evt && evt.date || '').split('-');
                const y = parts[0] || '?';
                const m = parts[1] || '?';
                if (!year || year.year !== y) {
                    year = { year: y, count: 0, months: [] };
                    years.push(year);
                    month = null;
                }
                if (!month || month.month !== m) {
                    month = { month: m, rows: [] };
                    year.months.push(month);
                }
                month.rows.push({ evt, idx, day: parts[2] || '' });
                year.count++;
            });
            return years;
        }

        // The decades the archive actually holds, for the rail that jumps to
        // one. A century of entries is not a list anybody scrolls.
        decadesOf(years) {
            const out = [];
            for (const y of years) {
                const n = Number(y.year);
                if (!Number.isFinite(n)) continue;
                const decade = Math.floor(n / 10) * 10;
                const at = out.find(d => d.decade === decade);
                if (at) at.count += y.count;
                else out.push({ decade, count: y.count, year: y.year });
            }
            return out;
        }

        // Jump the list to a decade and put the cursor on its first entry.
        selectDecade(decade) {
            const events = this.getUIHistoryEvents();
            const at = events.findIndex(e => Math.floor(Number(String(e && e.date || '').slice(0, 4)) / 10) * 10 === decade);
            if (at < 0) return;
            SoundManager.playCursor();
            this._historyWindow.select(at);
            this.syncUIHistoryState();
        }

        toggleFixedOnly() {
            this._fixedOnly = !this._fixedOnly;
            this._sortedFor = null;
            this._lastIndex = -1;
            this._uiSpread = null;
            const container = this._uiContainer || document.getElementById("history-container");
            if (container) container.innerHTML = "";
            this._historyWindow.select(0);
            SoundManager.playCursor();
            this.syncUIHistoryState();
        }

        initUIHistoryDOM() {
            if (!document.getElementById("history-container")) {
                const container = document.createElement("div");
                container.id = "history-container";
                document.body.appendChild(container);
            }
        }

        // The archive keeps two shelves. The timeline is the century that was
        // simulated; the library is every illness the world knows, dossier and
        // remedies included, which is the one place a player can look a disease
        // up before ever meeting it. Switching shelf rebuilds the spread, since
        // the two are laid out differently.
        setArchiveMode(mode) {
            if (this._archiveMode === mode) return;
            this._archiveMode = mode;
            this._diseaseIndex = 0;
            this._lastIndex = -1;
            this._uiSpread = null;
            const container = this._uiContainer || document.getElementById("history-container");
            if (container) container.innerHTML = "";
            SoundManager.playCursor();
            this.syncUIHistoryState();
        }

        archiveDiseases() {
            const api = window.DiseaseSystem;
            if (!api || !api.all) return [];
            if (!this._diseaseList || !this._diseaseList.length) {
                this._diseaseList = api.all().slice().sort((a, b) => a.name.localeCompare(b.name));
            }
            return this._diseaseList;
        }

        renderDiseaseLibrary(container) {
            const api = window.DiseaseSystem;
            const rows = this.archiveDiseases();
            const at = Math.max(0, Math.min(this._diseaseIndex || 0, rows.length - 1));
            const selected = rows[at];
            const listHTML = rows.length ? rows.map((d, idx) => `
                <div class="item-slot hist-row ${idx === at ? "selected" : ""}" data-disease-idx="${idx}">
                    <div class="item-slot-info">
                        <div class="item-slot-name">${d.name}</div>
                        <div class="item-slot-meta">${T('Diseases.category.' + d.category)}</div>
                    </div>
                </div>
            `).join("") : `<p class="hist-empty">${T('Diseases.ui.noLibrary')}</p>`;

            const dossierHTML = selected && api && api.diseaseDossierHTML ? `
                <div class="item-inspect">
                    <div class="inspect-section-title">${selected.name}</div>
                    ${api.diseaseDossierHTML(selected.id)}
                </div>` : "";

            container.innerHTML = `
                <div class="book-spread hist-spread">
                    <div class="left-page">
                        ${this.archiveHeaderHTML()}
                        ${this.archiveShelfTabsHTML()}
                        <div class="ui-list ui-scroll" id="history-timeline-list">${listHTML}</div>
                    </div>
                    <div class="right-page">
                        <div class="ui-scroll hist-detail">${dossierHTML}</div>
                        <div class="inspect-actions">
                            <div class="inspect-btn" role="button" tabindex="0"
                                 id="history-continue-btn">${T('History.ui.continue')}</div>
                        </div>
                    </div>
                </div>
            `;
            this._uiSpread = container.querySelector(".hist-spread");
            container.querySelectorAll("[data-disease-idx]").forEach(card => {
                card.addEventListener("click", () => {
                    this._diseaseIndex = parseInt(card.getAttribute("data-disease-idx"), 10);
                    SoundManager.playCursor();
                    this.renderDiseaseLibrary(container);
                });
            });
            this.bindArchiveChrome(container);
        }

        // The one header both shelves wear: the way out at the top left of the
        // left page, where every screen in this game keeps it, and the title.
        archiveHeaderHTML() {
            return `
                <div class="page-header-bar">
                    <div class="back-button" id="history-back-btn"
                         role="button" tabindex="0">${T('History.ui.back')}</div>
                    <h2 class="title">${T('History.ui.archiveTitle')}</h2>
                </div>`;
        }

        // The two shelves, as a tab strip rather than as a button at the foot
        // of the other page that said "show the other one".
        archiveShelfTabsHTML() {
            const tab = (id, label) => `
                <div class="backpack-tab ${this._archiveMode === id ? "active" : ""}"
                     data-shelf="${id}" role="button" tabindex="0">${label}</div>`;
            return `
                <div class="backpack-tabs hist-shelves">
                    ${tab("timeline", T('Diseases.ui.showTimeline'))}
                    ${tab("diseases", T('Diseases.ui.showLibrary'))}
                </div>`;
        }

        // The controls both shelves share: the shelf tabs, the way out and the
        // confirm. Bound once per build, from one place, so the two renderers
        // cannot drift apart on what a button does.
        bindArchiveChrome(container) {
            container.querySelectorAll("[data-shelf]").forEach(tab => {
                tab.addEventListener("click", () => this.setArchiveMode(tab.getAttribute("data-shelf")));
            });
            const backBtn = container.querySelector("#history-back-btn");
            if (backBtn) {
                backBtn.addEventListener("click", () => {
                    SoundManager.playCancel();
                    if (window.Scene_CharacterCreation) {
                        // Resume creation just before character-type selection
                        // (interruptedStep + 1 lands on the next interactive step).
                        Scene_CharacterCreation._interruptedStep =
                            (window.CCSteps && window.CCSteps.WORLD_HISTORY) != null
                                ? window.CCSteps.WORLD_HISTORY
                                : 2;
                    }
                    this.popScene();
                });
            }
            const contBtn = container.querySelector("#history-continue-btn");
            if (contBtn) {
                contBtn.addEventListener("click", () => { SoundManager.playOk(); this.popScene(); });
            }
        }

        syncUIHistoryState() {
            // Cache the container + spread element refs so the steady-state path
            // (index unchanged) does zero DOM queries. Re-resolve if either has
            // been detached (scene teardown / rebuild).
            let container = this._uiContainer;
            if (!container || !container.isConnected) {
                container = this._uiContainer = document.getElementById("history-container");
                this._uiSpread = null;
            }
            if (!container) return;

            if (this._archiveMode === "diseases") {
                if (!this._uiSpread || !this._uiSpread.isConnected) this.renderDiseaseLibrary(container);
                return;
            }

            const currentIndex = this._historyWindow.index();
            let existingSpread = this._uiSpread;
            if (!existingSpread || !existingSpread.isConnected) {
                existingSpread = this._uiSpread = container.querySelector(".hist-spread");
            }
            if (this._lastIndex === currentIndex && existingSpread) return;
            this._lastIndex = currentIndex;

            if (!existingSpread) {
                this.renderTimeline(container, currentIndex);
            } else {
                // Only the previously- and newly-focused rows change class, so
                // touch those two nodes instead of every row in the century.
                const prev = this._focusedCard;
                const next = container.querySelector(`.hist-row[data-global-idx="${currentIndex}"]`);
                if (prev && prev !== next) prev.classList.remove("selected");
                if (next) next.classList.add("selected");
                this._focusedCard = next;
                const detail = container.querySelector(".hist-detail");
                if (detail) detail.innerHTML = this.entryDetailHTML(currentIndex);
            }

            // Keep a single pending scroll: replace any still-queued one so rapid
            // selection changes don't stack dozens of scrollIntoView callbacks.
            if (this._scrollTimeout) clearTimeout(this._scrollTimeout);
            this._scrollTimeout = setTimeout(() => {
                this._scrollTimeout = null;
                const activeCard = this._focusedCard ||
                    (container.isConnected && container.querySelector(`.hist-row[data-global-idx="${currentIndex}"]`));
                if (activeCard) activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 50);
        }

        // An event's category is an id on the record, a word on the row and one
        // of six inks. The ladder is per theme and lives in the three token
        // files; nothing here names a colour.
        categoryLabel(id) {
            const key = 'History.category.' + String(id || '');
            return T.has(key) ? T(key) : String(id || '');
        }

        categoryClass(id) {
            const band = Scene_History.CATEGORY_BANDS[String(id || '')] || 'other';
            return 'hist-cat--' + band;
        }

        // The months, named the way the rest of the game names them.
        monthName(mm) {
            if (!this._monthNames) {
                this._monthNames = (window.T && window.T.list)
                    ? (window.T.list('TimeDate.months') || []) : [];
            }
            const at = Number(mm) - 1;
            return this._monthNames[at] || String(mm || '?');
        }

        // ── The left page: a century, filed ─────────────────────────────────
        //
        // The archive used to be one flat run of up to five thousand cards with
        // a reversed date stamped on each of them, which is a log file, not a
        // shelf. It reads as a book now: years, and inside a year the months
        // that had anything happen in them, with a rail of decades over the top
        // for the jump nobody could make by scrolling.
        renderTimeline(container, currentIndex) {
            const events = this.getUIHistoryEvents();
            const years = this.groupUIHistoryEvents(events);

            let listHTML = "";
            if (!events.length) {
                listHTML = `<p class="hist-empty">${T('History.ui.noRecords')}</p>`;
            } else {
                listHTML = years.map(year => `
                    <section class="hist-year" id="hist-year-${year.year}">
                        <header class="hist-year-hdr">
                            <span class="hist-year-num">${year.year}</span>
                            <span class="hist-year-count">${year.count}</span>
                        </header>
                        ${year.months.map(month => `
                            <div class="hist-month">
                                <div class="hist-month-hdr">${this.monthName(month.month)}</div>
                                ${month.rows.map(row => this.entryRowHTML(row, currentIndex)).join("")}
                            </div>
                        `).join("")}
                    </section>
                `).join("");
            }

            const decades = this.decadesOf(years);
            const railHTML = decades.length > 1 ? `
                <div class="hist-rail">
                    ${decades.map(d => `
                        <span class="hist-decade" role="button" tabindex="0"
                              data-decade="${d.decade}">${d.decade}</span>`).join("")}
                </div>` : "";

            container.innerHTML = `
                <div class="book-spread hist-spread">
                    <div class="left-page">
                        ${this.archiveHeaderHTML()}
                        ${this.archiveShelfTabsHTML()}
                        ${railHTML}
                        <div class="ui-list ui-scroll" id="history-timeline-list">${listHTML}</div>
                    </div>
                    <div class="right-page">
                        <div class="ui-scroll hist-detail">${this.entryDetailHTML(currentIndex)}</div>
                        <div class="inspect-actions">
                            <div class="inspect-btn ${this._fixedOnly ? "" : "inspect-btn--secondary"}"
                                 role="button" tabindex="0" id="history-canon-btn">${
                                this._fixedOnly ? T('History.ui.showAllEvents') : T('History.ui.showCanonOnly')}</div>
                            <div class="inspect-btn" role="button" tabindex="0"
                                 id="history-continue-btn">${T('History.ui.continue')}</div>
                        </div>
                    </div>
                </div>
            `;

            this._uiSpread = container.querySelector(".hist-spread");
            this._focusedCard = container.querySelector(`.hist-row[data-global-idx="${currentIndex}"]`) || null;

            container.querySelectorAll(".hist-row").forEach(row => {
                row.addEventListener("click", () => {
                    const idx = parseInt(row.getAttribute("data-global-idx"), 10);
                    if (this._historyWindow.index() !== idx) {
                        SoundManager.playCursor();
                        this._historyWindow.select(idx);
                        this.syncUIHistoryState();
                    }
                });
            });
            container.querySelectorAll(".hist-decade").forEach(chip => {
                chip.addEventListener("click", () =>
                    this.selectDecade(Number(chip.getAttribute("data-decade"))));
            });
            const canonBtn = container.querySelector("#history-canon-btn");
            if (canonBtn) canonBtn.addEventListener("click", () => this.toggleFixedOnly());
            this.bindArchiveChrome(container);

            if (!this._wheelBound) {
                this._wheelBound = true;
                container.addEventListener("wheel", (e) => {
                    const list = container.querySelector("#history-timeline-list");
                    if (!list) return;
                    e.preventDefault();
                    list.scrollTop += e.deltaY;
                }, { passive: false });
            }
        }

        // One entry, as a row of the list. The day is the key, the sentence is
        // the entry and the category is a word: the month and the year are the
        // headers it sits under, so neither is repeated here.
        entryRowHTML(row, currentIndex) {
            const evt = row.evt;
            const selected = row.idx === currentIndex ? "selected" : "";
            return `
                <div class="item-slot hist-row ${selected}" data-global-idx="${row.idx}">
                    <span class="hist-day">${row.day || "--"}</span>
                    <div class="item-slot-info">
                        <div class="item-slot-name hist-line">${evt.description || ""}</div>
                        <div class="item-slot-meta">
                            <span class="hist-cat ${this.categoryClass(evt.category)}">${this.categoryLabel(evt.category)}</span>
                            ${Scene_History.isArtifactEvent(evt)
                                ? `<span class="hist-cat hist-cat--arcane">${T('History.ui.artifactBadge')}</span>` : ""}
                        </div>
                    </div>
                </div>`;
        }

        // ── The right page: the entry, then the balance ─────────────────────
        entryDetailHTML(currentIndex) {
            const events = this.getUIHistoryEvents();
            const evt = events[currentIndex];
            if (!evt) return "";

            const parts = String(evt.date || '').split('-');
            const readable = parts.length === 3
                ? `${Number(parts[2])} ${this.monthName(parts[1])} ${parts[0]}`
                : (parts.length === 2 ? `${this.monthName(parts[1])} ${parts[0]}` : evt.date);

            let consequences = "";
            if (evt.results) {
                consequences = String(evt.results).split(",").map(r => r.trim()).filter(Boolean)
                    .map(r => {
                        const good = r.includes("+");
                        return `<div class="inspect-spec-row">
                            <span class="inspect-spec-label">${good ? T('History.ui.gain') : T('History.ui.loss')}</span>
                            <span class="inspect-spec-value ${good ? "hist-delta-up" : "hist-delta-down"}">${r}</span>
                        </div>`;
                    }).join("");
            }

            return `
                <div class="item-inspect">
                    <div class="inspect-section-title">${readable}</div>
                    <div class="inspect-spec-grid">
                        <div class="inspect-spec-row">
                            <span class="inspect-spec-label">${T('History.ui.typeLbl')}</span>
                            <span class="inspect-spec-value ${this.categoryClass(evt.category)}">${this.categoryLabel(evt.category)}</span>
                        </div>
                    </div>
                    <div class="inspect-desc">${evt.description || ""}</div>
                    ${consequences ? `
                        <div class="inspect-section-title">${T('History.ui.consequences')}</div>
                        <div class="inspect-spec-grid">${consequences}</div>` : ""}
                </div>
                ${this.balanceHTML()}`;
        }

        // Every hyperpower, ranked, in the figures a yearbook prints rather
        // than as gauges with no ceiling on them: how many people it holds, how
        // many of them are under arms and what the place makes in a year
        // (HistoryManager.realFigures owns that reading).
        balanceHTML() {
            const powers = window.HistoryManager
                ? window.HistoryManager.getHyperpowers()
                : ($gameSystem._historicalHyperpowers || {});
            const worldName = (name) => window.WorldNames ? window.WorldNames.any(name) : name;
            const ranked = Object.entries(powers || {})
                .sort((a, b) => (b[1].military + b[1].economy) - (a[1].military + a[1].economy));
            if (!ranked.length) return "";

            const rows = ranked.map(([name, data]) => {
                const fig = window.HistoryManager && window.HistoryManager.realFigures
                    ? window.HistoryManager.realFigures(data) : null;
                const value = fig
                    ? T('History.ui.balanceLine', {
                        soldiers: fig.soldiers.toLocaleString(),
                        product: Math.round(fig.gdp / 1e9),
                      })
                    : `${Math.floor(data.military)} / ${Math.floor(data.economy)}`;
                return `<div class="inspect-spec-row">
                    <span class="inspect-spec-label">${worldName(name)}</span>
                    <span class="inspect-spec-value">${value}</span>
                </div>`;
            }).join("");

            return `
                <div class="item-inspect">
                    <div class="inspect-section-title">${T('History.ui.hyperpowersBalance')}</div>
                    <div class="inspect-spec-grid">${rows}</div>
                </div>`;
        }
    }

    // The six bands every chronicle category is read in. The ink for each is a
    // token, defined in all three theme files; this table only says which band
    // a category belongs to.
    Scene_History.CATEGORY_BANDS = {
        military: 'war', disaster: 'war', criminal: 'war',
        political: 'state', internal: 'state', royal: 'state', diplomatic: 'state',
        economic: 'trade',
        social: 'people',
        paranormal: 'arcane', occult: 'arcane', artifact: 'arcane',
        scientific: 'science',
    };

    Scene_History.isArtifactEvent = function (evt) {
        return !!evt && (evt.category === 'artifact' || /artifact/i.test(evt.description || ''));
    };

    window.Scene_History = Scene_History;

    //=============================================================================
    // Window stubs, invisible; exist only for RMMZ handler wiring
    //=============================================================================

    class Window_HistorySummary extends Window_Selectable {
        constructor(rect) { super(rect); this.hide(); this.deactivate(); }
    }
    class Window_HistoryLog extends Window_Selectable {
        constructor(rect) { super(rect); this.hide(); this.deactivate(); }
        setDetailsWindow(win) { }
    }
    class Window_HistoryDetails extends Window_Base {
        constructor(rect) { super(rect); this.hide(); this.deactivate(); }
        setEvent(evt) { }
    }

    window.Window_HistorySummary = Window_HistorySummary;
    window.Window_HistoryLog     = Window_HistoryLog;
    window.Window_HistoryDetails = Window_HistoryDetails;

})();
