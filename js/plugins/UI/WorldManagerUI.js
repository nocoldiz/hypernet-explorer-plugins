//=============================================================================
// WorldManagerUI.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc World creation/management screen for the title menu (the "Worlds" command). Requires Core/WorldManager.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * WorldManagerUI.js
 * ============================================================================
 * DOM-based scene for creating, selecting and deleting world folders
 * (see Core/WorldManager.js). Opened from the title screen "Worlds" command,
 * which hosts both creating and managing worlds on one parchment spread.
 *
 * Layout is the shared kit (css/theme.css), Shape A: a .book-spread whose
 * .left-page is the .page-header-bar, the .ui-list of worlds and the create
 * entry, and whose .right-page is the dossier behind .backpack-tab tabs.
 *   - Dossier , creation date, world date, savegame count, seed, the two
 *               permanent world settings, then Set Active / Delete.
 *   - History , opens Scene_History, the full archive, for this world.
 *   - Balance , every hyperpower's military and economy, strongest first.
 *   - Diaries , every diary the world holds, whichever savegame kept it.
 * The create form and the delete confirmation are Shape B: .ui-overlay over
 * .ui-panel. Nothing here sets a style; the classes above are inked in
 * css/theme.css under WORLD MANAGER.
 *
 * World history is always simulated canonically from 1900 to 2000, there
 * is no per-world history length selection. Creating a world only lets the
 * player pick the world's STARTING DATE and seed. The starting date is two
 * separate spinners, month and year, jointly clamped to the January 2001 -
 * January 2012 window; both are reachable with keyboard/controller (Up/Down
 * moves between form rows, Left/Right or OK tunes the focused spinner).
 * NPC backstories and the world clock are advanced to that date the first
 * time a new game is started in the world.
 * ============================================================================
 */

(() => {
    "use strict";

    function tr(en, it) {
        return ConfigManager.language === "it" ? it : en;
    }

    function escapeHtml(str) {
        return String(str ?? "").replace(/[&<>"']/g, c => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        })[c]);
    }

    //=========================================================================
    // World starting date (January 2001 - January 2012)
    //=========================================================================
    // The month and the year are picked separately, but the pair is always
    // clamped to the window above, so December 2012 is not reachable: the
    // window closes on January 2012.

    const START_YEAR_MIN = 2001;
    const START_YEAR_MAX = 2013;
    const START_MONTH_MAX = 1; // last selectable month of START_YEAR_MAX
    // The first year that begins AFTER 21 December 2012, so a world started in
    // it opens with Earth already gone and the Omega Tower standing in its
    // orbit (see GalaxySim.Nibiru and WorldMapTransfer.earthLost).
    const EARTH_LOST_YEAR = 2013;

    // What level the party is created at. A world can be begun by people who
    // are already somebody, which is the only way the later years are playable:
    // 2013 opens on monsters no level 1 party can stand in front of.
    // The spinner walks a fixed ladder rather than adding a step, so it is
    // symmetric (every press has an exact opposite), it always lands on a round
    // number, and twenty presses cover the whole range: single levels while they
    // still mean something, then fives, then tens, then the ceiling.
    const START_LEVEL_STOPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30,
                               40, 50, 60, 70, 80, 90, 99];
    const START_LEVEL_DEFAULT = START_LEVEL_STOPS[0];
    // The rung a stored level sits on (or the nearest one below it).
    function levelStopIndex(level) {
        let at = 0;
        for (let i = 0; i < START_LEVEL_STOPS.length; i++) {
            if (START_LEVEL_STOPS[i] <= level) at = i;
        }
        return at;
    }

    // Who the world is populated with. The list is WorldManager's (it owns the
    // stored value and the clamp); this is only the order the spinner walks
    // them in, which is deliberately "normal" first so an untouched form makes
    // the world every existing world already is. The choice is permanent: the
    // world is populated, historied and priced from it, so there is no setter
    // and the manage page prints it as a fact rather than a control.
    const POPULATION_MODES =
        (window.WorldManager && window.WorldManager.POPULATION_MODES) ||
        ["normal", "goblin", "monster", "empty"];
    const POPULATION_DEFAULT = POPULATION_MODES[0];

    function populationLabel(mode) {
        return T(`WorldManagerUI.populationModes.${mode}`);
    }

    // The one-line warning under the spinner saying what the mode costs you.
    // "normal" has nothing to say, so it draws nothing.
    function populationNoteFor(mode) {
        const note = T(`WorldManagerUI.populationNotes.${mode}`);
        return note && note.trim() ? note : "";
    }

    // How much magic the world has. A SEPARATE axis from the timeline above:
    // both are asked, both are permanent, and every combination of the two is
    // legal, so a severed-magic zombie apocalypse is a world you can make.
    // WorldManager owns the list and the clamp; this is only the order the
    // spinner walks them in.
    const MAGICAL_LEVELS =
        (window.WorldManager && window.WorldManager.MAGICAL_LEVELS) ||
        ["normal", "severed", "unbound"];
    const MAGICAL_DEFAULT = MAGICAL_LEVELS[0];

    function magicalLabel(level) {
        return T(`WorldManagerUI.magicalLevels.${level}`);
    }

    function magicalNoteFor(level) {
        const note = T(`WorldManagerUI.magicalNotes.${level}`);
        return note && note.trim() ? note : "";
    }

    // Month names live in js/i18n/<lang>/plugins/WorldManagerUI.json.

    // Default world seed. Owned by Core/WorldManager so the creation form and
    // the world it auto-creates on an empty world folder never disagree.
    const DEFAULT_WORLD_SEED = (window.WorldManager && window.WorldManager.DEFAULT_SEED) || "esoteric";

    // Every new world starts on a seed of its own. The form still opens on a
    // readable word the player may overwrite, but never on the same one twice,
    // so two worlds made in a row are two different worlds unless the player
    // deliberately types the same seed back in.
    function randomSeedWord() {
        // Short pronounceable syllables so the seed stays readable and
        // editable, while still hashing to a distinct uint32 RNG root.
        const syllables = ["ka", "zo", "mi", "ru", "ne", "va", "th", "lo", "qu", "en",
                           "sha", "dri", "mor", "lux", "vex", "nim", "tor", "ael", "ix", "um"];
        let seed = "";
        const parts = 2 + Math.floor(Math.random() * 2); // 2 or 3 syllables
        for (let i = 0; i < parts; i++) {
            seed += syllables[Math.floor(Math.random() * syllables.length)];
        }
        return seed;
    }

    function monthName(month) {
        return T.list("WorldManagerUI.months")[month - 1] || "";
    }

    // What starting later costs you. The year is not a cosmetic choice: every
    // spawn mode's level band climbs with the calendar (see the "Squishing"
    // block in BattleSystemEnhancedEncounters, section 4b), so a world begun in
    // 2005 opens with monsters a fresh party cannot fight. Say so on the form
    // rather than let the player find out on the first tile.
    const ENEMY_YEAR_STEP     = 10;   // levels a year adds, to 2010
    const ENEMY_OPEN_YEAR     = 2010; // the whole table comes loose
    const ENEMY_OPEN_CEILING  = 110;
    const ENEMY_COLLAPSE_YEAR = 2012;
    const ENEMY_COLLAPSE_FLOOR = 80;

    // The line shown under the date, or "" for 2001 (nothing to warn about).
    function enemyLevelNoticeFor(year) {
        if (year >= ENEMY_COLLAPSE_YEAR) {
            return T("WorldManagerUI.enemyFloorCollapse", { level: ENEMY_COLLAPSE_FLOOR });
        }
        if (year >= ENEMY_OPEN_YEAR) {
            return T("WorldManagerUI.enemyFloorOpen", { level: ENEMY_OPEN_CEILING });
        }
        const floor = Math.max(0, year - START_YEAR_MIN) * ENEMY_YEAR_STEP;
        if (floor <= 0) return "";
        return T("WorldManagerUI.enemyFloor", { level: floor });
    }

    // The other thing a 2013 start costs, and it is not a difficulty setting:
    // the world begins after the impact, so there is no Earth to walk on. Said
    // plainly on the form, because nothing about "2013" says it on its own.
    function earthLostNoticeFor(year) {
        return year >= EARTH_LOST_YEAR ? T("WorldManagerUI.earthLost") : "";
    }

    // Story mode used to be refused outside the canon world (2001, an ordinary
    // population, ordinary magic) and the form warned about it here. It runs in
    // every world now: the year only decides where the run begins
    // (window.StoryModeStart), so there is nothing left to warn about.
    function storyDisabledNoticeFor() {
        return "";
    }

    // Months since January 2001, the single ordering the two spinners clamp on.
    function dateToIndex(year, month) {
        return (year - START_YEAR_MIN) * 12 + (month - 1);
    }

    const START_INDEX_MIN = 0;
    const START_INDEX_MAX = dateToIndex(START_YEAR_MAX, START_MONTH_MAX);

    function indexToDate(index) {
        const clamped = Math.min(Math.max(index, START_INDEX_MIN), START_INDEX_MAX);
        return { year: START_YEAR_MIN + Math.floor(clamped / 12), month: (clamped % 12) + 1 };
    }

    // Clamps a (year, month) pair into the selectable window.
    function clampStartDate(year, month) {
        const y = Math.min(Math.max(year, START_YEAR_MIN), START_YEAR_MAX);
        const m = Math.min(Math.max(month, 1), 12);
        return indexToDate(dateToIndex(y, m));
    }

    // World clock minutes for the 1st of the given month at 10:00, the epoch
    // TimeDateSystem decodes from (1 January 2001, 10:00 = minute 0). The day
    // count is computed in UTC on purpose: subtracting two local timestamps
    // loses/gains an hour across a DST boundary, which would land summer start
    // dates on 09:00 instead of 10:00.
    function minutesForStartDate(year, month) {
        const minutes = (Date.UTC(year, month - 1, 1) - Date.UTC(2001, 0, 1)) / 60000;
        return Math.max(0, Math.round(minutes));
    }

    //=========================================================================
    // Historical Archive card rendering (mirrors History/HistorySimulatorUI.js)
    //=========================================================================

    // Resolved lazily: the global may be populated after this plugin loads.
    function getCountries() { return window.HistorySimulator_COUNTRIES || {}; }

    // A nation or hyperpower is stored under its English name because that name
    // is the id; the label reads through WorldNames (see Core/DataService.js).
    function worldName(name) { return window.WorldNames ? window.WorldNames.any(name) : name; }

    function renderHyperpowers(hyperpowers) {
        const powersList = Object.entries(hyperpowers || {})
            .sort((a, b) => (b[1].military + b[1].economy) - (a[1].military + a[1].economy));
        if (powersList.length === 0) return "";

        let html = `<div class="item-inspect wm-balance">
            <div class="inspect-section-title">${T('WorldManagerUI.hyperpowersBalance')}</div>`;
        powersList.forEach(([name, data]) => {
            const controlled = [];
            for (const [cName, cData] of Object.entries(getCountries())) {
                if (cData.controller === name) controlled.push(worldName(cName));
            }
            const territories = controlled.slice(0, 3).join(", ") + (controlled.length > 3 ? "..." : "");
            html += `
                <div class="wm-power">
                    <div class="wm-power-head">
                        <span class="wm-power-name">${escapeHtml(worldName(name))}</span>
                        <span class="wm-power-territories">${escapeHtml(territories)}</span>
                    </div>
                    <div class="inspect-spec-grid">
                        <div class="inspect-spec-row">
                            <span class="inspect-spec-label">${T('WorldManager.ui.military')}</span>
                            <span class="inspect-spec-value">${Math.floor(data.military)}</span>
                        </div>
                        <div class="inspect-spec-row">
                            <span class="inspect-spec-label">${T('WorldManager.ui.economy')}</span>
                            <span class="inspect-spec-value">${Math.floor(data.economy)}</span>
                        </div>
                    </div>
                </div>
            `;
        });
        html += `</div>`;
        return html;
    }

    //=========================================================================
    // Input manager, keyboard + controller navigation
    //=========================================================================

    // "history" does not switch tab content: pressing OK on it pushes
    // Scene_History, the full archive, so it never becomes _rightTab.
    const RIGHT_TABS = ["info", "history", "balance", "diaries"];

    const WorldManageInputManager = {
        _scene: null,
        _active: false,

        activate(scene) { this._scene = scene; this._active = true; },
        deactivate()    { this._active = false; this._scene = null; },

        _consumeWasd(scene) {
            const w = scene._wasdInput;
            if (!w) return null;
            let dir = null;
            if (w.up) dir = "up";
            else if (w.down) dir = "down";
            else if (w.left) dir = "left";
            else if (w.right) dir = "right";
            w.up = w.down = w.left = w.right = false;
            return dir;
        },

        update() {
            if (!this._active || !this._scene) return;
            const scene = this._scene;
            if (scene._busy || !scene._container) { this._consumeWasd(scene); return; }

            // While the confirmation window is open, swallow background navigation;
            // only let cancel/escape dismiss it.
            if (scene._confirmOverlay) {
                this._consumeWasd(scene);
                if (Input.isTriggered("cancel") || Input.isTriggered("escape") || TouchInput.isCancelled()) {
                    TouchInput.clear();
                    SoundManager.playCancel();
                    scene._closeConfirm();
                } else if (Input.isTriggered("ok")) {
                    scene._confirmConfirm();
                }
                return;
            }

            const ae = document.activeElement;
            const typing = !!(ae && scene._container.contains(ae) &&
                (ae.tagName === "INPUT" || ae.tagName === "SELECT"));

            if (Input.isTriggered("cancel") || Input.isTriggered("escape") || TouchInput.isCancelled()) {
                TouchInput.clear();
                this._consumeWasd(scene);
                SoundManager.playCancel();
                if (typing) {
                    ae.blur();
                    scene._applyFocusHighlight();
                } else if (scene._creatingWorld) {
                    // Only closable when there is a world to fall back to;
                    // otherwise Escape leaves the whole screen, as before.
                    if (scene._focusables("list").length > 0) scene.closeCreateModal();
                    else scene.popScene();
                } else if (scene._focusSection === "tabs" || scene._focusSection === "actions") {
                    scene._setFocus(scene._focusables("list").length > 0 ? "list" : "newworld", 0);
                } else {
                    scene.popScene();
                }
                return;
            }

            if (typing) { this._consumeWasd(scene); return; }

            const wasdDir = this._consumeWasd(scene);
            if (wasdDir) { this.handleMove(wasdDir); return; }

            if (!scene._creatingWorld && (Input.isTriggered("pageup") || Input.isTriggered("pagedown"))) {
                if (scene._selectedWorld) {
                    const dir  = Input.isTriggered("pageup") ? -1 : 1;
                    const next = (RIGHT_TABS.indexOf(scene._rightTab) + dir + RIGHT_TABS.length) % RIGHT_TABS.length;
                    scene._focusSection = "tabs";
                    scene._focusIndex   = next;
                    scene.onSelectTab(RIGHT_TABS[next]);
                }
                return;
            }

            if (Input.isRepeated("up"))         this.handleMove("up");
            else if (Input.isRepeated("down"))  this.handleMove("down");
            else if (Input.isRepeated("left"))  this.handleMove("left");
            else if (Input.isRepeated("right")) this.handleMove("right");
            else if (Input.isTriggered("ok"))   this.handleOk();
        },

        handleMove(dir) {
            const scene = this._scene;
            const sec   = scene._focusSection;
            const idx   = scene._focusIndex;
            const els   = scene._focusables(sec);
            const hasWorlds      = scene._focusables("list").length > 0;
            const rightAvailable = !!scene._selectedWorld;
            const canCloseModal  = scene._creatingWorld && hasWorlds;

            // The create form is a modal: while it is open, navigation is
            // trapped inside it (plus its own close button, when closable)
            // rather than reaching the list or the right page behind it.
            if (scene._creatingWorld) {
                if (sec === "create") {
                    const focusedId = els[idx] ? els[idx].id : "";
                    if (dir === "up") {
                        if (idx > 0)                        scene._setFocus("create", idx - 1);
                        else if (canCloseModal)             scene._setFocus("modalclose", 0);
                    } else if (dir === "down") {
                        if (idx < els.length - 1)           scene._setFocus("create", idx + 1);
                    } else if ((dir === "left" || dir === "right") && focusedId === "wm-start-month") {
                        // Left/Right tunes the focused spinner; Up/Down still moves
                        // between the form rows, so a controller reaches everything.
                        scene._changeStartMonth(dir === "left" ? -1 : 1);
                    } else if ((dir === "left" || dir === "right") && focusedId === "wm-start-year") {
                        scene._changeStartYear(dir === "left" ? -1 : 1);
                    } else if ((dir === "left" || dir === "right") && focusedId === "wm-start-level") {
                        scene._changeStartLevel(dir === "left" ? -1 : 1);
                    } else if ((dir === "left" || dir === "right") && focusedId === "wm-population") {
                        scene._changePopulationMode(dir === "left" ? -1 : 1);
                    } else if ((dir === "left" || dir === "right") && focusedId === "wm-magic") {
                        scene._changeMagicalLevel(dir === "left" ? -1 : 1);
                    }
                } else if (sec === "modalclose") {
                    if (dir === "down")                     scene._setFocus("create", 0);
                }
                return;
            }

            if (sec === "list") {
                if (dir === "up"   && idx > 0)              scene._setFocus("list", idx - 1);
                else if (dir === "down") {
                    if (idx < els.length - 1)               scene._setFocus("list", idx + 1);
                    else                                    scene._setFocus("newworld", 0);
                }
                else if (dir === "right" && rightAvailable) scene._setFocus("tabs", RIGHT_TABS.indexOf(scene._rightTab));
            } else if (sec === "newworld") {
                if (dir === "up" && hasWorlds)              scene._setFocus("list", scene._focusables("list").length - 1);
                else if (dir === "down")                    scene._setFocus("back", 0);
                else if (dir === "right" && rightAvailable) scene._setFocus("tabs", RIGHT_TABS.indexOf(scene._rightTab));
            } else if (sec === "back") {
                if (dir === "up")                           scene._setFocus("newworld", 0);
                else if (dir === "right" && rightAvailable) scene._setFocus("tabs", RIGHT_TABS.indexOf(scene._rightTab));
            } else if (sec === "tabs") {
                if (dir === "left") {
                    if (idx > 0)                            scene._setFocus("tabs", idx - 1);
                    else                                    scene._setFocus(hasWorlds ? "list" : "newworld", 0);
                } else if (dir === "right" && idx < els.length - 1) {
                    scene._setFocus("tabs", idx + 1);
                } else if (dir === "down") {
                    // Any tab whose body ends in a button panel is walkable:
                    // the dossier's Set Active / Delete, and the diaries a
                    // world holds.
                    if (scene._focusables("actions").length > 0) {
                        scene._setFocus("actions", 0);
                    } else {
                        scene._scrollTabBody(60);
                    }
                } else if (dir === "up") {
                    scene._scrollTabBody(-60);
                }
            } else if (sec === "actions") {
                if (dir === "up") {
                    if (idx > 0)                            scene._setFocus("actions", idx - 1);
                    else                                    scene._setFocus("tabs", RIGHT_TABS.indexOf(scene._rightTab));
                } else if (dir === "down" && idx < els.length - 1) {
                    scene._setFocus("actions", idx + 1);
                } else if (dir === "left") {
                    scene._setFocus(hasWorlds ? "list" : "newworld", 0);
                }
            }
        },

        handleOk() {
            const scene = this._scene;
            const els   = scene._focusables(scene._focusSection);
            const el    = els[scene._focusIndex];
            if (!el) return;

            if (scene._focusSection === "tabs") {
                scene.onSelectTab(RIGHT_TABS[scene._focusIndex] || "info");
                return;
            }
            // A button the page has greyed out says so either way it is
            // drawn: as the attribute on a real <button>, or as the shared
            // .disabled class on an .inspect-btn.
            if (el.disabled || el.classList.contains("disabled")) {
                SoundManager.playBuzzer();
                return;
            }
            if (el.tagName === "INPUT" || el.tagName === "SELECT") {
                el.focus();
                return;
            }
            // OK on a spinner advances it, matching Right.
            if (el.id === "wm-start-month") {
                scene._changeStartMonth(1);
                return;
            }
            if (el.id === "wm-start-year") {
                scene._changeStartYear(1);
                return;
            }
            if (el.id === "wm-start-level") {
                scene._changeStartLevel(1);
                return;
            }
            if (el.id === "wm-population") {
                scene._changePopulationMode(1);
                return;
            }
            if (el.id === "wm-magic") {
                scene._changeMagicalLevel(1);
                return;
            }
            el.click();
        },
    };

    //=========================================================================
    // Scene_WorldManage
    //=========================================================================

    class Scene_WorldManage extends Scene_MenuBase {
        static _mode = "manage"; // "manage" | "create"

        static prepare(mode) {
            this._mode = mode || "manage";
        }

        create() {
            super.create();
            const WM = window.WorldManager;
            const worlds = WM ? WM.listWorlds() : [];
            const active = WM && WM.activeWorldName;
            // Open on whichever world is already active, so the dossier the
            // player last cared about is what greets them.
            this._selectedWorld = (active && worlds.some(w => w.name === active)) ? active : null;
            this._rightTab = "info"; // "info" | "history" | "balance"  (never "wiki", that pushes a scene)
            // The create form is a modal: it opens by itself when there is no
            // world to fall back to (mirrors the old "create" mode), otherwise
            // it stays closed until the player asks for it.
            this._creatingWorld = Scene_WorldManage._mode === "create" || worlds.length === 0;
            this._focusSection = this._creatingWorld ? "create"
                : (worlds.length > 0 ? "list" : "newworld");
            this._focusIndex = 0;
            this._suggestedName = window.WorldManager.randomWorldName();
            this._seedValue = randomSeedWord();
            // Coming in with nothing, the player is here to make their first
            // world, not to browse: once it exists the screen has done its job
            // and hands them straight back to the title menu.
            this._startedWithNoWorlds = worlds.length === 0;
            this._startYear = START_YEAR_MIN;
            this._startMonth = 1;
            this._startLevel = START_LEVEL_DEFAULT;
            this._populationMode = POPULATION_DEFAULT;
            this._magicalLevel = MAGICAL_DEFAULT;
            this._wasdInput = { up: false, down: false, left: false, right: false };
            this.createUIDOM();
            WorldManageInputManager.activate(this);
        }

        terminate() {
            WorldManageInputManager.deactivate();
            super.terminate();
            this.removeUIDOM();
        }

        update() {
            super.update();
            WorldManageInputManager.update();
        }

        _focusables(section) {
            const c = this._container;
            if (!c) return [];
            switch (section) {
                case "list":       return [...c.querySelectorAll(".wm-world-row")];
                case "newworld":   return [document.getElementById("wm-create-open-btn")].filter(Boolean);
                case "create":     return ["wm-name-input", "wm-start-month", "wm-start-year",
                                        "wm-start-level", "wm-population", "wm-magic", "wm-seed-input",
                                        "wm-seed-random-btn", "wm-create-btn"]
                                    .map(id => document.getElementById(id)).filter(Boolean);
                case "modalclose": return [document.getElementById("wm-create-close-btn")].filter(Boolean);
                case "back":    return [document.getElementById("wm-back-btn")].filter(Boolean);
                case "tabs":    return [...c.querySelectorAll(".wm-tabs .backpack-tab")];
                case "actions": return [...c.querySelectorAll(".right-page .inspect-actions .inspect-btn")];
                default:        return [];
            }
        }

        _setFocus(section, index) {
            this._focusSection = section;
            this._focusIndex = Math.max(0, index);
            SoundManager.playCursor();
            this._applyFocusHighlight();
        }

        _applyFocusHighlight() {
            if (!this._container) return;
            this._container.querySelectorAll(".kb-focus").forEach(el => el.classList.remove("kb-focus"));
            let els = this._focusables(this._focusSection);
            if (els.length === 0) {
                this._focusSection = this._creatingWorld ? "create"
                    : (this._focusables("list").length > 0 ? "list" : "newworld");
                this._focusIndex = 0;
                els = this._focusables(this._focusSection);
            }
            if (this._focusIndex >= els.length) this._focusIndex = Math.max(0, els.length - 1);
            const el = els[this._focusIndex];
            if (el) {
                el.classList.add("kb-focus");
                el.scrollIntoView({ block: "nearest" });
            }
        }

        // Months cycle inside the year (December -> January); the year spinner
        // is what moves between years. The pair is clamped afterwards, so a
        // month that would overshoot January 2012 simply does not move.
        _changeStartMonth(delta) {
            let month = this._startMonth + delta;
            if (month > 12) month = 1;
            else if (month < 1) month = 12;
            this._setStartDate(this._startYear, month);
        }

        _changeStartYear(delta) {
            this._setStartDate(this._startYear + delta, this._startMonth);
        }

        _setStartDate(year, month) {
            const next = clampStartDate(year, month);
            if (next.year === this._startYear && next.month === this._startMonth) return;
            this._startYear = next.year;
            this._startMonth = next.month;
            this._refreshStartDate();
            SoundManager.playCursor();
        }

        // Writes the current start date into the two spinners without rebuilding
        // the form (which would drop typing focus and the keyboard highlight).
        _refreshStartDate() {
            const monthEl = document.getElementById("wm-start-month");
            if (monthEl) {
                monthEl.dataset.month = this._startMonth;
                const label = monthEl.querySelector(".wm-date-label");
                if (label) label.textContent = monthName(this._startMonth);
            }
            const yearEl = document.getElementById("wm-start-year");
            if (yearEl) {
                yearEl.dataset.year = this._startYear;
                const label = yearEl.querySelector(".wm-date-label");
                if (label) label.textContent = String(this._startYear);
            }
            const floorEl = document.getElementById("wm-enemy-floor");
            if (floorEl) {
                const notice = enemyLevelNoticeFor(this._startYear);
                floorEl.textContent = notice;
                floorEl.classList.toggle("wm-hidden", !notice);
            }
            const lostEl = document.getElementById("wm-earth-lost");
            if (lostEl) {
                const notice = earthLostNoticeFor(this._startYear);
                lostEl.textContent = notice;
                lostEl.classList.toggle("wm-hidden", !notice);
            }
            this._refreshStoryNotice();
        }

        // Repaints the "story mode will be disabled" line. Called by every
        // spinner that feeds it rather than rebuilding the form, which would
        // drop the name being typed.
        _refreshStoryNotice() {
            const el = document.getElementById("wm-story-disabled");
            if (!el) return;
            const notice = storyDisabledNoticeFor(
                this._startYear, this._populationMode, this._magicalLevel);
            el.textContent = notice;
            el.classList.toggle("wm-hidden", !notice);
        }

        _changeStartLevel(delta) {
            const from = this._startLevel || START_LEVEL_DEFAULT;
            const at = levelStopIndex(from) + Math.sign(delta);
            const next = START_LEVEL_STOPS[
                Math.max(0, Math.min(START_LEVEL_STOPS.length - 1, at))];
            if (next === from) return;
            this._startLevel = next;
            const el = document.getElementById("wm-start-level");
            if (el) {
                el.dataset.level = next;
                const label = el.querySelector(".wm-date-label");
                if (label) label.textContent = String(next);
            }
            SoundManager.playCursor();
        }

        // Who lives in this world. The spinner wraps (there is no "end" of the
        // list to walk off), and it repaints its own label and note rather than
        // rebuilding the form, which would drop the name being typed.
        _changePopulationMode(delta) {
            const at = POPULATION_MODES.indexOf(this._populationMode);
            const from = at < 0 ? 0 : at;
            const count = POPULATION_MODES.length;
            const next = POPULATION_MODES[(from + delta % count + count) % count];
            if (next === this._populationMode) return;
            this._populationMode = next;
            const el = document.getElementById("wm-population");
            if (el) {
                el.dataset.mode = next;
                const label = el.querySelector(".wm-date-label");
                if (label) label.textContent = populationLabel(next);
            }
            const noteEl = document.getElementById("wm-population-note");
            if (noteEl) {
                const note = populationNoteFor(next);
                noteEl.textContent = note;
                noteEl.classList.toggle("wm-hidden", !note);
            }
            this._refreshStoryNotice();
            SoundManager.playCursor();
        }

        // How much magic there is. Wraps like the timeline spinner and repaints
        // its own label and note rather than rebuilding the form.
        _changeMagicalLevel(delta) {
            const at = MAGICAL_LEVELS.indexOf(this._magicalLevel);
            const from = at < 0 ? 0 : at;
            const count = MAGICAL_LEVELS.length;
            const next = MAGICAL_LEVELS[(from + delta % count + count) % count];
            if (next === this._magicalLevel) return;
            this._magicalLevel = next;
            const el = document.getElementById("wm-magic");
            if (el) {
                el.dataset.level = next;
                const label = el.querySelector(".wm-date-label");
                if (label) label.textContent = magicalLabel(next);
            }
            const noteEl = document.getElementById("wm-magic-note");
            if (noteEl) {
                const note = magicalNoteFor(next);
                noteEl.textContent = note;
                noteEl.classList.toggle("wm-hidden", !note);
            }
            this._refreshStoryNotice();
            SoundManager.playCursor();
        }

        _randomizeSeed() {
            const seed = randomSeedWord();
            this._seedValue = seed;
            const input = document.getElementById("wm-seed-input");
            if (input) input.value = seed;
            SoundManager.playCursor();
        }

        _scrollTabBody(amount) {
            const body = this._container && this._container.querySelector(".wm-tab-body");
            if (body) body.scrollBy({ top: amount, behavior: "smooth" });
        }

        createUIDOM() {
            let container = document.getElementById("world-manage-container");
            if (!container) {
                container = document.createElement("div");
                container.id = "world-manage-container";
                document.body.appendChild(container);
            }
            this._container = container;
            container.classList.remove("wm-closing");
            container.classList.add("wm-open");

            // The container element is persistent and reused across scene openings, so
            // bind the container-scoped listeners only once. These closures resolve the
            // active scene through SceneManager._scene dynamically, so a single binding
            // stays correct and avoids the per-open listener accumulation leak.
            if (!container.dataset.wmListenersBound) {
                container.addEventListener("keydown", e => {
                    const tag = e.target && e.target.tagName;
                    if (tag === "INPUT" || tag === "SELECT") {
                        e.stopPropagation();
                        if (e.key === "Enter" && tag === "INPUT") { // i18n-ignore: DOM key name
                            e.preventDefault();
                            SceneManager._scene.onCreateWorld && SceneManager._scene.onCreateWorld();
                        }
                        if (e.key === "Escape") { // i18n-ignore: DOM key name
                            e.preventDefault();
                            e.target.blur();
                        }
                    }
                });
                ["mousedown", "mouseup", "click", "touchstart", "touchend", "pointerdown",
                    "pointerup", "wheel"].forEach(evt => {
                    container.addEventListener(evt, e => e.stopPropagation(), { passive: true });
                });

                // Right-click anywhere on the overlay backs out one level: closes
                // the create modal if it is open and closable, otherwise returns
                // to the title screen.
                container.addEventListener("contextmenu", e => {
                    e.stopPropagation();
                    e.preventDefault();
                    const scene = SceneManager._scene;
                    if (scene && scene._creatingWorld) {
                        scene.closeCreateModal();
                        return;
                    }
                    SoundManager.playCancel();
                    if (scene && scene.popScene) {
                        scene.popScene();
                    }
                });

                container.dataset.wmListenersBound = "1";
            }

            this._wasdListener = (e) => {
                if (this._busy) return;
                const ae = document.activeElement;
                if (ae && this._container && this._container.contains(ae) &&
                    (ae.tagName === "INPUT" || ae.tagName === "SELECT")) return;
                let hit = true;
                switch (e.key.toLowerCase()) {
                    case "w": this._wasdInput.up = true; break;
                    case "s": this._wasdInput.down = true; break;
                    case "a": this._wasdInput.left = true; break;
                    case "d": this._wasdInput.right = true; break;
                    default: hit = false;
                }
                if (hit) e.preventDefault();
            };
            window.addEventListener("keydown", this._wasdListener);

            this.refreshUIDOM();
        }

        removeUIDOM() {
            this._closeConfirm();
            if (this._wasdListener) {
                window.removeEventListener("keydown", this._wasdListener);
                this._wasdListener = null;
            }
            if (this._container) {
                const container = this._container;
                container.classList.add("wm-closing");
                setTimeout(() => {
                    container.innerHTML = "";
                    container.classList.remove("wm-open", "wm-closing");
                }, 200);
                this._container = null;
            }
        }

        // Full rebuild only when force=true or first render.
        // Targeted partial updates otherwise, prevents form/focus flicker.
        refreshUIDOM(force = false) {
            if (!this._container) return;
            const WM = window.WorldManager;
            const worlds = WM.listWorlds();
            const active = WM.activeWorldName;

            if (force || !this._container.querySelector(".book-spread")) {
                this._buildLayout(worlds, active);
            } else {
                this._patchWorldList(worlds, active);
                this._patchRightPage(worlds, active);
            }

            this._applyFocusHighlight();
        }

        // ---- layout builders -----------------------------------------------

        _buildWorldRowsHTML(worlds, active) {
            if (worlds.length === 0) {
                return `<div class="wm-empty">${T('WorldManagerUI.noWorldsYetCreateOne')}</div>`;
            }
            return worlds.map(world => {
                const isActive   = world.name === active;
                const isSelected = world.name === this._selectedWorld;
                return `
                    <div class="item-slot wm-world-row ${isSelected ? "selected" : ""}"
                         data-world-name="${escapeHtml(world.name)}"
                         onclick="SceneManager._scene.onSelectWorld('${world.name.replace(/'/g, "\\'")}')">
                        <div class="item-slot-info">
                            <div class="item-slot-name wm-world-name">${escapeHtml(world.name)}</div>
                            ${isActive ? `<div class="item-slot-meta wm-active-badge">${T('WorldManagerUI.active')}</div>` : ""}
                        </div>
                    </div>
                `;
            }).join("");
        }

        _buildLayout(worlds, active) {
            const hasWorlds = worlds.length > 0;
            // The create form is a modal. It cannot be dismissed while there is
            // no world to fall back to, so it is forced open in that case even
            // if something earlier had closed it (e.g. deleting the last world).
            if (!hasWorlds) this._creatingWorld = true;
            const creating = !!this._creatingWorld;

            const prevInput = document.getElementById("wm-name-input");
            const nameValue = (prevInput && prevInput.value.trim())
                ? prevInput.value
                : (this._suggestedName || "");

            const prevSeed = document.getElementById("wm-seed-input");
            const seedValue = (prevSeed && prevSeed.value.trim())
                ? prevSeed.value
                : (this._seedValue || DEFAULT_WORLD_SEED);

            const start = clampStartDate(this._startYear || START_YEAR_MIN, this._startMonth || 1);
            this._startYear = start.year;
            this._startMonth = start.month;
            const startLevel = this._startLevel || START_LEVEL_DEFAULT;
            const populationMode = POPULATION_MODES.includes(this._populationMode)
                ? this._populationMode : POPULATION_DEFAULT;
            const magicalLevel = MAGICAL_LEVELS.includes(this._magicalLevel)
                ? this._magicalLevel : MAGICAL_DEFAULT;

            this._container.innerHTML = `
                <div class="book-spread">
                    <div class="left-page">
                        <div class="page-header-bar">
                            <div class="back-button" id="wm-back-btn"
                                 onclick="SoundManager.playCancel(); SceneManager._scene.popScene();">${T('WorldManagerUI.back')}</div>
                            <h2 class="title">${T('WorldManagerUI.worlds')}</h2>
                        </div>
                        <div class="ui-list ui-scroll wm-list" id="wm-world-list">
                            ${this._buildWorldRowsHTML(worlds, active)}
                        </div>
                        <div class="ui-footer wm-list-actions">
                            <div class="inspect-btn" id="wm-create-open-btn" role="button" tabindex="0"
                                 onclick="SceneManager._scene.openCreateModal()">
                                ${T('WorldManagerUI.createWorld')}
                            </div>
                        </div>
                    </div>
                    <div class="right-page" id="wm-right-page">
                        ${this.renderRightPage(worlds, active)}
                    </div>
                </div>
                <div id="wm-create-overlay" class="ui-overlay wm-modal-overlay wm-create-overlay${creating ? "" : " wm-hidden"}"
                     onclick="if (event.target === this) SceneManager._scene.closeCreateModal();">
                    <div class="ui-panel wm-modal wm-create-modal" role="dialog" aria-modal="true">
                        <div class="page-header-bar wm-create-modal-header">
                            <h3 class="title">${T('WorldManagerUI.createWorld')}</h3>
                            ${hasWorlds ? `
                            <button type="button" id="wm-create-close-btn" class="wm-modal-x"
                                    onclick="SceneManager._scene.closeCreateModal()"
                                    aria-label="${T('WorldManagerUI.cancel')}">&times;</button>
                            ` : ""}
                        </div>
                        <div class="ui-panel-body ui-scroll wm-create wm-create-modal-body">
                            <label>${T('WorldManagerUI.worldName')}</label>
                            <input id="wm-name-input" type="text" maxlength="40"
                                   value="${escapeHtml(nameValue)}"
                                   placeholder="${T('WorldManagerUI.newWorld')}" autocomplete="off">
                            <label>${T('WorldManagerUI.startingDate')}</label>
                            <div class="wm-date-row">
                                <div id="wm-start-month" class="wm-year-selector" data-month="${start.month}"
                                     role="spinbutton" tabindex="0" aria-label="${T('WorldManagerUI.month')}">
                                    <button type="button" class="wm-year-arrow" onclick="SceneManager._scene._changeStartMonth(-1)" aria-label="${T('WorldManagerUI.previousMonth')}">&#9664;</button>
                                    <span class="wm-date-label">${monthName(start.month)}</span>
                                    <button type="button" class="wm-year-arrow" onclick="SceneManager._scene._changeStartMonth(1)" aria-label="${T('WorldManagerUI.nextMonth')}">&#9654;</button>
                                </div>
                                <div id="wm-start-year" class="wm-year-selector" data-year="${start.year}"
                                     role="spinbutton" tabindex="0" aria-label="${T('WorldManagerUI.year')}">
                                    <button type="button" class="wm-year-arrow" onclick="SceneManager._scene._changeStartYear(-1)" aria-label="${T('WorldManagerUI.previousYear')}">&#9664;</button>
                                    <span class="wm-date-label">${start.year}</span>
                                    <button type="button" class="wm-year-arrow" onclick="SceneManager._scene._changeStartYear(1)" aria-label="${T('WorldManagerUI.nextYear')}">&#9654;</button>
                                </div>
                            </div>
                            <div id="wm-enemy-floor" role="status"
                                 class="wm-enemy-floor${enemyLevelNoticeFor(start.year) ? "" : " wm-hidden"}"
                            >${escapeHtml(enemyLevelNoticeFor(start.year))}</div>
                            <div id="wm-earth-lost" role="status"
                                 class="wm-enemy-floor wm-earth-lost${earthLostNoticeFor(start.year) ? "" : " wm-hidden"}"
                            >${escapeHtml(earthLostNoticeFor(start.year))}</div>
                            <label>${T('WorldManagerUI.startingLevel')}</label>
                            <div class="wm-date-row">
                                <div id="wm-start-level" class="wm-year-selector" data-level="${startLevel}"
                                     role="spinbutton" tabindex="0" aria-label="${T('WorldManagerUI.startingLevel')}">
                                    <button type="button" class="wm-year-arrow" onclick="SceneManager._scene._changeStartLevel(-1)" aria-label="${T('WorldManagerUI.lowerLevel')}">&#9664;</button>
                                    <span class="wm-date-label">${startLevel}</span>
                                    <button type="button" class="wm-year-arrow" onclick="SceneManager._scene._changeStartLevel(1)" aria-label="${T('WorldManagerUI.raiseLevel')}">&#9654;</button>
                                </div>
                            </div>
                            <label>${T('WorldManagerUI.populationMode')}</label>
                            <div class="wm-date-row">
                                <div id="wm-population" class="wm-year-selector" data-mode="${escapeHtml(populationMode)}"
                                     role="spinbutton" tabindex="0" aria-label="${T('WorldManagerUI.populationMode')}">
                                    <button type="button" class="wm-year-arrow" onclick="SceneManager._scene._changePopulationMode(-1)" aria-label="${T('WorldManagerUI.previousPopulation')}">&#9664;</button>
                                    <span class="wm-date-label">${escapeHtml(populationLabel(populationMode))}</span>
                                    <button type="button" class="wm-year-arrow" onclick="SceneManager._scene._changePopulationMode(1)" aria-label="${T('WorldManagerUI.nextPopulation')}">&#9654;</button>
                                </div>
                            </div>
                            <div id="wm-population-note" role="status"
                                 class="wm-enemy-floor${populationNoteFor(populationMode) ? "" : " wm-hidden"}"
                            >${escapeHtml(populationNoteFor(populationMode))}</div>
                            <label>${T('WorldManagerUI.magicalLevel')}</label>
                            <div class="wm-date-row">
                                <div id="wm-magic" class="wm-year-selector" data-level="${escapeHtml(magicalLevel)}"
                                     role="spinbutton" tabindex="0" aria-label="${T('WorldManagerUI.magicalLevel')}">
                                    <button type="button" class="wm-year-arrow" onclick="SceneManager._scene._changeMagicalLevel(-1)" aria-label="${T('WorldManagerUI.previousMagic')}">&#9664;</button>
                                    <span class="wm-date-label">${escapeHtml(magicalLabel(magicalLevel))}</span>
                                    <button type="button" class="wm-year-arrow" onclick="SceneManager._scene._changeMagicalLevel(1)" aria-label="${T('WorldManagerUI.nextMagic')}">&#9654;</button>
                                </div>
                            </div>
                            <div id="wm-magic-note" role="status"
                                 class="wm-enemy-floor${magicalNoteFor(magicalLevel) ? "" : " wm-hidden"}"
                            >${escapeHtml(magicalNoteFor(magicalLevel))}</div>
                            <div id="wm-story-disabled" role="status"
                                 class="wm-enemy-floor wm-story-disabled${storyDisabledNoticeFor(start.year, populationMode, magicalLevel) ? "" : " wm-hidden"}"
                            >${escapeHtml(storyDisabledNoticeFor(start.year, populationMode, magicalLevel))}</div>
                            <label>${T('WorldManagerUI.seed')}</label>
                            <div class="wm-seed-row">
                                <input id="wm-seed-input" type="text" maxlength="40"
                                       value="${escapeHtml(seedValue)}"
                                       placeholder="${escapeHtml(DEFAULT_WORLD_SEED)}" autocomplete="off">
                                <button id="wm-seed-random-btn" type="button" class="wm-year-arrow"
                                        onclick="SceneManager._scene._randomizeSeed()"
                                        title="${T('WorldManagerUI.randomizeSeed')}"
                                        aria-label="${T('WorldManagerUI.randomizeSeed')}">&#9851;</button>
                            </div>
                            <button id="wm-create-btn" type="button" class="inspect-btn" onclick="SceneManager._scene.onCreateWorld()">
                                ${T('WorldManagerUI.createActivate')}
                            </button>
                            <div id="wm-status" class="wm-status"></div>
                        </div>
                    </div>
                </div>
            `;

            // The name field is deliberately NOT auto-focused. It is focus index
            // 0 of the "create" section, so a controller/WASD player lands on it
            // either way; giving it real DOM focus on open would swallow WASD as
            // typed characters instead of navigation. Press OK on it to type
            // (see handleOk, which focuses INPUT/SELECT elements).
            if (creating) {
                const active = document.activeElement;
                if (active && typeof active.blur === "function" &&
                    (active.tagName === "INPUT" || active.tagName === "SELECT")) {
                    active.blur();
                }
            }
        }

        openCreateModal() {
            if (this._busy || this._creatingWorld) return;
            SoundManager.playOk();
            this._creatingWorld = true;
            this._suggestedName = this._suggestedName || (window.WorldManager && window.WorldManager.randomWorldName());
            this.refreshUIDOM(true);
            this._setFocus("create", 0);
        }

        closeCreateModal() {
            if (!this._creatingWorld) return;
            const worlds = window.WorldManager ? window.WorldManager.listWorlds() : [];
            if (worlds.length === 0) return; // nothing to fall back to
            SoundManager.playCancel();
            this._creatingWorld = false;
            this.setStatus("");
            this.refreshUIDOM(true);
            this._setFocus(this._focusables("list").length > 0 ? "list" : "newworld", 0);
        }

        // Patch only the world row list (preserves the create form).
        _patchWorldList(worlds, active) {
            const list = this._container.querySelector("#wm-world-list");
            if (list) list.innerHTML = this._buildWorldRowsHTML(worlds, active);
        }

        // Patch only the right page.
        _patchRightPage(worlds, active) {
            const page = this._container.querySelector("#wm-right-page");
            if (page) page.innerHTML = this.renderRightPage(worlds, active);
        }

        // ---- right page rendering ------------------------------------------

        renderRightPage(worlds, active) {
            const world = worlds.find(w => w.name === this._selectedWorld);
            if (!world) {
                return `
                    <div class="item-inspect item-inspect--empty">
                        <h2 class="title">${T('WorldManagerUI.dossier')}</h2>
                        <p class="inspect-placeholder-text">${T('WorldManagerUI.selectAWorldToView')}</p>
                    </div>
                `;
            }

            const tab = (label, key) => `
                <div class="backpack-tab ${this._rightTab === key ? "selected" : ""}"
                     onclick="SceneManager._scene.onSelectTab('${key}')">${label}</div>`;
            // "history" is not a page of its own: it opens the full archive
            // (Scene_History) loaded with this world, which is the same reading
            // the wiki entry used to be a second door onto.
            const tabsHTML = `
                <div class="backpack-tabs wm-tabs">
                    ${tab(T('WorldManagerUI.dossier2'), "info")}
                    ${tab(T('WorldManagerUI.history'), "history")}
                    ${tab(T('WorldManagerUI.balance'), "balance")}
                    ${tab(T('Diary.worlds.tab'), "diaries")}
                </div>
            `;

            let body = "";
            switch (this._rightTab) {
                case "balance": body = this.renderBalanceTab(world); break;
                case "diaries": body = this.renderDiariesTab(world); break;
                default:        body = this.renderInfoTab(world, active); break;
            }

            return `
                <div class="page-header-bar">
                    <h2 class="title">${escapeHtml(world.name)}</h2>
                </div>
                ${tabsHTML}
                <div class="ui-scroll wm-tab-body">${body}</div>
            `;
        }

        renderInfoTab(world, active) {
            const isActive = world.name === active;
            const created = world.createdAt
                ? new Date(world.createdAt).toLocaleString(T('WorldManagerUI.enUs'))
                : "?";
            const dateTime = window.TimeDateSystem
                ? window.TimeDateSystem.getDateTimeFromMinutes(world.worldTimeMinutes || 0)
                : null;
            const worldDate = dateTime ? dateTime.fullDate : "?";
            const savesCount = window.WorldManager.countSaves(world.name);

            return `
                <div class="item-inspect">
                    <div class="inspect-section-title">${T('WorldManagerUI.dossier2')}</div>
                    <div class="inspect-spec-grid">
                        <div class="inspect-spec-row">
                            <span class="inspect-spec-label">${T('WorldManagerUI.created')}</span>
                            <span class="inspect-spec-value">${escapeHtml(created)}</span>
                        </div>
                        <div class="inspect-spec-row">
                            <span class="inspect-spec-label">${T('WorldManagerUI.worldDate')}</span>
                            <span class="inspect-spec-value">${escapeHtml(worldDate)}</span>
                        </div>
                        <div class="inspect-spec-row">
                            <span class="inspect-spec-label">${T('WorldManagerUI.savegames')}</span>
                            <span class="inspect-spec-value">${savesCount === null ? "?" : savesCount}</span>
                        </div>
                        <div class="inspect-spec-row">
                            <span class="inspect-spec-label">${T('WorldManagerUI.seed')}</span>
                            <span class="inspect-spec-value">${world.seed !== undefined ? escapeHtml(world.seed) : "?"}</span>
                        </div>
                        <div class="inspect-spec-row" title="${T('WorldManagerUI.populationLocked')}">
                            <span class="inspect-spec-label">${T('WorldManagerUI.magicalLevel')}</span>
                            <span class="inspect-spec-value">${escapeHtml(magicalLabel(
                                MAGICAL_LEVELS.includes(world.magicalLevel)
                                    ? world.magicalLevel : MAGICAL_DEFAULT))}</span>
                        </div>
                        <div class="inspect-spec-row" title="${T('WorldManagerUI.populationLocked')}">
                            <span class="inspect-spec-label">${T('WorldManagerUI.populationMode')}</span>
                            <span class="inspect-spec-value">${escapeHtml(populationLabel(
                                POPULATION_MODES.includes(world.populationMode)
                                    ? world.populationMode : POPULATION_DEFAULT))}</span>
                        </div>
                    </div>
                </div>
                <div class="inspect-actions">
                    <div class="inspect-btn ${isActive ? "disabled" : ""}" role="button" tabindex="0"
                        onclick="SceneManager._scene.onActivateWorld('${world.name.replace(/'/g, "\\'")}')">
                        ${T('WorldManagerUI.setActive')}
                    </div>
                    <div class="inspect-btn inspect-btn--secondary" role="button" tabindex="0"
                        onclick="SceneManager._scene.onDeleteWorld('${world.name.replace(/'/g, "\\'")}')">
                        ${T('WorldManagerUI.delete')}
                    </div>
                </div>
            `;
        }

        // Every diary a world holds, whichever savegame kept it. A permadeath
        // run whose savegame is long gone still has its diary here, which is
        // the point of keeping them in the world folder rather than in a save.
        renderDiariesTab(world) {
            const D = window.Diary;
            const diaries = (D && D.listForWorld) ? D.listForWorld(world.name) : [];
            if (!diaries.length) {
                return `<div class="wm-empty">${escapeHtml(T('Diary.worlds.none'))}</div>`;
            }
            const rows = diaries.map(book => {
                const names = (book.party || []).map(m => m.name).filter(Boolean).join(", ")
                    || T('Diary.worlds.unknownParty');
                const meta = T('Diary.worlds.meta', {
                    count: book.count,
                    place: book.lastPlace || T('WorldManagerUI.noData')
                });
                const call = `SceneManager._scene.onReadDiary('${world.name.replace(/'/g, "\\'")}','${String(book.id).replace(/'/g, "\\'")}')`;
                // A button rather than a card, so the pockets' own keyboard and
                // controller walk ("actions") reaches every diary for free.
                return `
                    <button type="button" class="inspect-btn wm-diary-row" onclick="${call}">
                        <span class="wm-diary-names">${escapeHtml(names)}</span>
                        <span class="wm-diary-meta">${escapeHtml(meta)}</span>
                    </button>`;
            }).join("");
            return `<div class="inspect-actions wm-diary-list">${rows}</div>`;
        }

        // Reading one needs the game objects the book scene expects, exactly as
        // the wiki tab needs them for the archive.
        onReadDiary(worldName, diaryId) {
            if (!window.Scene_Diary) return;
            if (!$gameSystem) DataManager.setupNewGame();
            SoundManager.playOk();
            window.Scene_Diary.prepare(worldName, diaryId);
            SceneManager.push(window.Scene_Diary);
        }

        renderBalanceTab(world) {
            const history = window.WorldManager.readWorldFile(world.name, "history") || {};
            return renderHyperpowers(history.hyperpowers)
                || `<div class="wm-empty">${T('WorldManagerUI.noData')}</div>`;
        }

        // ---- status helper -------------------------------------------------

        setStatus(text) {
            const status = document.getElementById("wm-status");
            if (status) status.textContent = text;
        }

        // ---- event handlers ------------------------------------------------

        onSelectWorld(name) {
            SoundManager.playCursor();
            this._selectedWorld = this._selectedWorld === name ? null : name;
            this._rightTab = "info";

            // Toggle selected class on rows without rebuilding the left page.
            this._container.querySelectorAll(".wm-world-row").forEach(row => {
                row.classList.toggle("selected", row.dataset.worldName === this._selectedWorld);
            });

            const WM = window.WorldManager;
            this._patchRightPage(WM.listWorlds(), WM.activeWorldName);
            this._applyFocusHighlight();
        }

        onSelectTab(tab) {
            // History opens the full archive, Scene_History, loaded with this
            // world's data rather than a second, smaller copy of the timeline.
            if (tab === "history") {
                if (!this._selectedWorld || !window.Scene_History) return;
                const history = window.WorldManager.readWorldFile(this._selectedWorld, "history") || {};
                if (!$gameSystem) DataManager.setupNewGame();
                $gameSystem._historicalEvents     = history.events     || [];
                $gameSystem._historicalHyperpowers = history.hyperpowers || {};
                SoundManager.playOk();
                SceneManager.push(Scene_History);
                return;
            }

            if (this._rightTab === tab) return;
            SoundManager.playCursor();
            this._rightTab = tab;

            const WM = window.WorldManager;
            this._patchRightPage(WM.listWorlds(), WM.activeWorldName);
            this._applyFocusHighlight();
        }

        onActivateWorld(name) {
            if (this._busy) return;
            const WM = window.WorldManager;
            // The strip is drawn from divs, so the greyed-out entry has to be
            // refused here as well as painted there.
            if (WM.activeWorldName === name) {
                SoundManager.playBuzzer();
                return;
            }
            SoundManager.playOk();
            WM.setActiveWorld(name);
            if (window.HistoryManager) {
                const generated = WM.getField("artifacts", "generated");
                if (generated) window.HistoryManager.injectArtifacts(generated);
            }
            Promise.resolve(DataManager.loadGlobalInfo()).then(() => this.refreshUIDOM(true));
            this.refreshUIDOM(true);
        }

        onDeleteWorld(name) {
            if (this._busy || this._confirmOverlay) return;
            const message = T('WorldManagerUI.confirmDelete', { name });
            this._showConfirm({
                title: T('WorldManagerUI.deleteWorld'),
                message,
                confirmLabel: T('WorldManagerUI.delete'),
                cancelLabel: T('WorldManagerUI.cancel'),
                onConfirm: () => {
                    SoundManager.playOk();
                    window.WorldManager.deleteWorld(name);
                    this._selectedWorld = null;
                    Promise.resolve(DataManager.loadGlobalInfo()).then(() => this.refreshUIDOM(true));
                    this.refreshUIDOM(true);
                }
            });
        }

        // In-DOM confirmation window (replaces the native confirm() dialog so it
        // matches the parchment / Omega Tower theme and never breaks the canvas).
        _showConfirm({ title, message, confirmLabel, cancelLabel, onConfirm }) {
            if (!this._container) return;
            this._closeConfirm();
            this._confirmCallback = onConfirm || null;

            const overlay = document.createElement("div");
            overlay.className = "ui-overlay wm-modal-overlay";
            overlay.innerHTML = `
                <div class="ui-panel wm-modal" role="dialog" aria-modal="true">
                    <h3 class="title wm-modal-title">${escapeHtml(title)}</h3>
                    <div class="wm-modal-message">${escapeHtml(message)}</div>
                    <div class="inspect-actions wm-modal-buttons">
                        <button type="button" class="inspect-btn inspect-btn--secondary wm-modal-cancel">${escapeHtml(cancelLabel)}</button>
                        <button type="button" class="inspect-btn wm-modal-confirm">${escapeHtml(confirmLabel)}</button>
                    </div>
                </div>
            `;

            overlay.querySelector(".wm-modal-cancel").addEventListener("click", () => {
                SoundManager.playCancel();
                this._closeConfirm();
            });
            overlay.querySelector(".wm-modal-confirm").addEventListener("click", () => {
                this._confirmConfirm();
            });
            // Clicking the dimmed backdrop (outside the window) cancels.
            overlay.addEventListener("click", e => {
                if (e.target === overlay) {
                    SoundManager.playCancel();
                    this._closeConfirm();
                }
            });
            overlay.addEventListener("contextmenu", e => {
                e.preventDefault();
                e.stopPropagation();
                SoundManager.playCancel();
                this._closeConfirm();
            });

            this._container.appendChild(overlay);
            this._confirmOverlay = overlay;
            const confirmBtn = overlay.querySelector(".wm-modal-confirm");
            if (confirmBtn) setTimeout(() => confirmBtn.focus(), 30);
        }

        _confirmConfirm() {
            const cb = this._confirmCallback;
            this._closeConfirm();
            if (cb) cb();
        }

        _closeConfirm() {
            if (this._confirmOverlay) {
                this._confirmOverlay.remove();
                this._confirmOverlay = null;
            }
            this._confirmCallback = null;
        }

        onCreateWorld() {
            if (this._busy) return;
            const WM = window.WorldManager;
            if (!WM) {
                SoundManager.playBuzzer();
                this.setStatus(T('WorldManagerUI.worldManagerUnavailable'));
                return;
            }
            const input = document.getElementById("wm-name-input");
            const name = (input ? input.value : "").trim();

            if (!WM.isValidName(name)) {
                SoundManager.playBuzzer();
                this.setStatus(T('WorldManagerUI.invalidNameUseLettersNumbers'));
                return;
            }
            if (WM.worldExists(name)) {
                SoundManager.playBuzzer();
                this.setStatus(T('WorldManagerUI.aWorldWithThisName'));
                return;
            }

            const start = clampStartDate(this._startYear || START_YEAR_MIN, this._startMonth || 1);
            const startYear = start.year;
            const startMonth = start.month;
            const worldTimeMinutes = minutesForStartDate(startYear, startMonth);

            const seedInput = document.getElementById("wm-seed-input");
            const seed = (seedInput && seedInput.value.trim()) ? seedInput.value.trim() : DEFAULT_WORLD_SEED;
            this._seedValue = seed;

            this._busy = true;
            this.setStatus(T('WorldManagerUI.generatingWorldHistory'));

            setTimeout(async () => {
                try {
                    WM.createWorld(name, {
                        worldTimeMinutes, seed, startYear, startMonth,
                        startLevel: this._startLevel || START_LEVEL_DEFAULT,
                        // Written before initializeWorld() below, so the pool
                        // the world is populated from already knows who is in
                        // it (and an empty world is never populated at all).
                        populationMode: this._populationMode || POPULATION_DEFAULT,
                        magicalLevel: this._magicalLevel || MAGICAL_DEFAULT
                    });
                    WM.setActiveWorld(name);
                    if (typeof FactionDataManager !== "undefined" &&
                        FactionDataManager.instance && FactionDataManager.instance._readyPromise) {
                        await FactionDataManager.instance._readyPromise;
                    }
                    if (window.HistoryManager) {
                        window.HistoryManager.initializeWorldHistory({ years: null, seed });
                    }
                    // Everything else the world owns: its people and where they
                    // live and work, the shop rotas, the dungeon, the politics,
                    // the epidemics. Generated here so the world is whole the
                    // moment it exists rather than filling in as it is walked.
                    this.setStatus(T('WorldManagerUI.populatingWorld'));
                    // Let the status paint before the generators block the thread.
                    await new Promise(resolve => setTimeout(resolve, 30));
                    WM.initializeWorld();
                    await DataManager.loadGlobalInfo();
                    SoundManager.playSave();
                    this._busy = false;
                    this._selectedWorld = name;
                    this._rightTab = "info";
                    this._creatingWorld = false;
                    Scene_WorldManage._mode = "manage";
                    this._suggestedName = WM.randomWorldName();
                    if (this._startedWithNoWorlds) {
                        this.popScene();
                        return;
                    }
                    this.refreshUIDOM(true);
                    this._setFocus("tabs", RIGHT_TABS.indexOf(this._rightTab));
                } catch (e) {
                    console.error("[WorldManagerUI] World creation failed", e);
                    SoundManager.playBuzzer();
                    this._busy = false;
                    this.setStatus(T('WorldManagerUI.worldCreationFailed') + e.message);
                }
            }, 50);
        }
    }

    window.Scene_WorldManage = Scene_WorldManage;

    //=========================================================================
    // Title screen: starting a game requires an active world
    //=========================================================================

    // The title screen already greys these out with no world (Titlescreen.js),
    // so this is the backstop for any other route into them: it sends the
    // player to the create form rather than starting a game with nowhere to
    // keep its history, its people or its savegame.
    function requireActiveWorld() {
        if (window.WorldManager && window.WorldManager.activeWorldName) return true;
        SoundManager.playBuzzer();
        Scene_WorldManage.prepare("create");
        SceneManager.push(Scene_WorldManage);
        return false;
    }

    const _Scene_Title_commandNewGame = Scene_Title.prototype.commandNewGame;
    Scene_Title.prototype.commandNewGame = function () {
        if (!requireActiveWorld()) return;
        _Scene_Title_commandNewGame.call(this);
    };

    const _Scene_Title_commandStoryMode = Scene_Title.prototype.commandStoryMode;
    Scene_Title.prototype.commandStoryMode = function () {
        if (!requireActiveWorld()) return;
        _Scene_Title_commandStoryMode.call(this);
    };

    const _Scene_Title_commandSandboxGame = Scene_Title.prototype.commandSandboxGame;
    Scene_Title.prototype.commandSandboxGame = function () {
        if (!requireActiveWorld()) return;
        _Scene_Title_commandSandboxGame.call(this);
    };

    const _Scene_Title_onStoryModeContinue = Scene_Title.prototype.onStoryModeContinue;
    Scene_Title.prototype.onStoryModeContinue = function () {
        if (!requireActiveWorld()) {
            if (this._storyModeWindow) this._storyModeWindow.close();
            return;
        }
        _Scene_Title_onStoryModeContinue.call(this);
    };

})();
