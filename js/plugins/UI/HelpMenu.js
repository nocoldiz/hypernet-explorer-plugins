//=============================================================================
// HelpMenu.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Adds a gorgeous D&D parchment Help/Codex system with dynamic tabs.
 * @author Omni-Lex
 * @url https://yourwebsite.com
 *
 * @help HelpMenu.js
 *
 * This plugin adds a premium HTML5 Help/Codex option to the main menu.
 * Displays General Help, Lore, States, Elements, and Map Hints.
 *
 * Navigation:
 * - Select Help from the main menu.
 * - Use Arrow keys or Mouse to switch categories and scroll through topics.
 * - Press OK to focus on entry descriptions and scroll them.
 * - Press Cancel to return or exit.
 *
 * Terms of Use:
 * Free for commercial and non-commercial use.
 */

(() => {
    "use strict";

    //=============================================================================
    // i18n
    //=============================================================================
    let _helpI18n = null;

    // Two banks, because they are two jobs: HelpTopics.json is how the game
    // WORKS (the states included, since those are rules) and DialogueTopics.json
    // is what the world IS, one page per thing the party can be told about.
    // Both are read into one map, so a key resolves the same way whichever bank
    // it was written in. What lives in neither is the macrocategory a page
    // belongs to: that is a key in js/db/Messages/, the same in every language,
    // and only the label it prints is translated.
    const HELP_I18N_FILES = ['HelpTopics.json', 'DialogueTopics.json'];
    const HELP_I18N_FALLBACK = 'en';

    // English is always read first and the played language is laid over it, one
    // entry at a time, so a page nobody has translated yet reads as English
    // rather than as its own key. That matters here more than anywhere: the
    // manual is written and rewritten in English and a translation is always
    // behind it by some number of pages.
    const _mergeBank = (into, from) => {
        Object.keys(from || {}).forEach((ns) => {
            const rows = from[ns];
            if (!rows || typeof rows !== 'object') { into[ns] = rows; return; }
            if (!into[ns]) into[ns] = {};
            Object.keys(rows).forEach((key) => {
                const row = rows[key];
                if (row && typeof row === 'object' && into[ns][key] && typeof into[ns][key] === 'object') {
                    Object.keys(row).forEach((field) => {
                        // A blank translation is not a translation.
                        if (row[field] !== '' && row[field] != null) into[ns][key][field] = row[field];
                    });
                } else if (row !== '' && row != null) {
                    into[ns][key] = row;
                }
            });
        });
        return into;
    };

    const _readHelpBank = async (lang) => {
        const bank = {};
        for (const file of HELP_I18N_FILES) {
            const url = `js/i18n/${lang}/${file}`;
            try {
                const response = await fetch(url);
                _mergeBank(bank, await response.json());
            } catch (e) {
                // A language that has not been given this bank yet is not an
                // error; it simply keeps the English underneath.
                if (lang === HELP_I18N_FALLBACK) console.error('HelpMenu: Failed to load ' + url, e);
            }
        }
        return bank;
    };

    let _helpI18nLang = null;

    const _loadHelpI18n = async () => {
        const lang = ConfigManager.language || HELP_I18N_FALLBACK;
        const merged = await _readHelpBank(HELP_I18N_FALLBACK);
        if (lang !== HELP_I18N_FALLBACK) _mergeBank(merged, await _readHelpBank(lang));
        _helpI18n = merged;
        _helpI18nLang = lang;
    };

    // The banks are read once at boot, but the language can be changed from the
    // options at any point afterwards, so the book checks on the way in and
    // reads them again when it is holding the wrong language.
    const _ensureHelpI18n = (onReady) => {
        const lang = ConfigManager.language || HELP_I18N_FALLBACK;
        if (_helpI18n && _helpI18nLang === lang) return;
        _loadHelpI18n().then(() => { if (onReady) onReady(); });
    };

    // Resolve a key (e.g. 'HelpTopics.Squishing.title')
    function _read(path) {
        const parts = path.split('.');
        let val = _helpI18n;
        for (const p of parts) {
            if (val) val = val[p];
        }
        return typeof val === 'string' ? val : null;
    }

    function _hi18n(path) {
        if (!_helpI18n) return path;
        const direct = _read(path);
        if (direct !== null) return direct;
        // The world pages have been filed under two other namespaces before
        // this one: they began in the help bank and spent a while in a HelpLore
        // bank of their own. A language translated under either still has them
        // there, so a key that does not answer is looked for under its old
        // names before it is given up on.
        if (path.startsWith('DialogueTopics.')) {
            const tail = path.slice('DialogueTopics.'.length);
            const lore = _read('HelpLore.' + tail);
            if (lore !== null) return lore;
            const legacy = _read('HelpTopics.' + tail);
            if (legacy !== null) return legacy;
        }
        return path;
    }

    _loadHelpI18n();

    const getLocalizedTitle = (topic) => {
        if (!topic) return "";
        // A chronicle entry is already written in the reader's language (the
        // Archive rebuilds every record on read), and its title is a date, so
        // it must never be run through the codex key resolver.
        if (topic.raw) return topic.title || "";
        const key = topic.title || "";
        if (key && key.includes('.')) {
            const val = _hi18n(key);
            if (val !== key) return val;
        }
        return key;
    };

    const getLocalizedDescription = (topic) => {
        if (!topic) return "";
        if (topic.raw) return topic.description || "";
        const key = topic.description || "";
        if (key && key.includes('.')) {
            const val = _hi18n(key);
            if (val !== key) return val;
        }
        return key;
    };

    // Read the pages dynamically from Messages: the manual out of HelpTopics,
    // the world out of DialogueTopics, one list.
    const _bankRows = (bank) => {
        if (!bank) return [];
        return Array.isArray(bank) ? bank : Object.values(bank);
    };

    const getHelpTopics = () => {
        const messages = window.Messages;
        if (!messages) return [];
        return _bankRows(messages.HelpTopics).concat(_bankRows(messages.DialogueTopics));
    };

    // What the rest of the game needs to know about the codex. A topic is filed
    // under one keyword forever, because that is what a savegame stores, but it
    // is PRINTED under the title of its page in the language being played:
    // NPC/DialogueSystem.js reads this so a topic picked up from a synonym is
    // announced by the page's own name and not by the words that taught it.
    window.HelpCodex = {
        pageFor(keyword) {
            if (!keyword) return null;
            const wanted = String(keyword).toLowerCase();
            return getHelpTopics().find(t => t && t.type === 'topic' && t.keyword &&
                String(t.keyword).toLowerCase() === wanted) || null;
        },
        // Before the banks have finished loading a title still reads as its own
        // key, which is not a name anybody should be shown: the keyword stands
        // in until the book can answer.
        titleOf(keyword) {
            const page = this.pageFor(keyword);
            if (!page) return String(keyword || '');
            const title = getLocalizedTitle(page);
            if (!title || title === page.title) return String(keyword || '');
            return title;
        },
    };

    // Parse and display control tags based on input method
    const ControlTagParser = {
        getCurrentInputMethod: function () {
            const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
            for (let i = 0; i < gamepads.length; i++) {
                const gamepad = gamepads[i];
                if (gamepad) {
                    for (let j = 0; j < gamepad.buttons.length; j++) {
                        if (gamepad.buttons[j].pressed) return 'gamepad';
                    }
                    for (let j = 0; j < gamepad.axes.length; j++) {
                        if (Math.abs(gamepad.axes[j]) > 0.5) return 'gamepad';
                    }
                }
            }
            return 'keyboard';
        },

        parseControlText: function (text) {
            const inputMethod = this.getCurrentInputMethod();
            const pattern = /<keyboard:\s*(.+?)>\s*<controller:\s*(.+?)>/g;
            return text.replace(pattern, (match, keyboardText, controllerText) => {
                return (inputMethod === 'gamepad') ? controllerText.trim() : keyboardText.trim();
            });
        }
    };

    // A macrocategory label ("Getting Started", "Needs and the Body", ...).
    // The groups themselves live in the same HelpTopics file the entries do,
    // under HelpGroups, so a group is named once and read in whatever language
    // the game is running in.
    const getGroupLabel = (key) => {
        if (!key) return "";
        const val = _hi18n('HelpGroups.' + key);
        return val === ('HelpGroups.' + key) ? key : val;
    };

    // The macrocategories are a reading order, not an index: Controls first,
    // the minigames last, everything else in the order a player meets it. The
    // pages INSIDE a macrocategory are an index, so they are listed
    // alphabetically, which is how a reader looks a page up once they know
    // which part of the manual it lives in. A section's place is taken from
    // the lowest order any of its pages carries, so the reading order of the
    // sections themselves is untouched.
    function sortTopics(topics) {
        if (!topics) return [];
        const list = topics.filter(t => t && t.title);
        const rank = new Map();
        const seen = new Map();
        list.forEach((t, i) => {
            const key = t.group || '';
            const order = Number.isFinite(t.order) ? t.order : Infinity;
            if (!rank.has(key) || order < rank.get(key)) rank.set(key, order);
            if (!seen.has(key)) seen.set(key, i);
        });
        return list.sort((a, b) => {
            const keyA = a.group || '';
            const keyB = b.group || '';
            if (keyA !== keyB) {
                const rankA = rank.get(keyA);
                const rankB = rank.get(keyB);
                if (rankA !== rankB) return rankA - rankB;
                return seen.get(keyA) - seen.get(keyB);
            }
            const titleA = getLocalizedTitle(a).toLowerCase();
            const titleB = getLocalizedTitle(b).toLowerCase();
            return titleA.localeCompare(titleB);
        });
    }

    // A page is written as prose, not as a shape: paragraphs are separated by a
    // blank line and NOTHING else is a line break. A single newline inside a
    // paragraph is just where the author's editor happened to wrap, so it is
    // read as a space and the column wraps the text itself. A line opening with
    // "- " is a bullet and keeps its own line, which is the one exception.
    function paragraphsToHtml(text) {
        const blocks = String(text).split(/\n\s*\n/);
        return blocks.map(block => {
            const lines = block.split("\n").map(l => l.trim()).filter(l => l.length);
            if (!lines.length) return "";
            // A block may open with a lead-in and then list under it. A line
            // that does not open a bullet CONTINUES the one above it, because a
            // long bullet is wrapped in the source like any other prose; only a
            // blank line ends a list.
            const head = [];
            const items = [];
            lines.forEach(line => {
                if (line.startsWith("- ")) {
                    items.push(line.slice(2).trim());
                } else if (items.length) {
                    items[items.length - 1] += " " + line;
                } else {
                    head.push(line);
                }
            });
            let html = head.length ? `<p>${head.join(' ')}</p>` : '';
            if (items.length) {
                html += '<ul class="help-list">' +
                    items.map(item => `<li>${item}</li>`).join('') + '</ul>';
            }
            return html;
        }).join('');
    }

    function parseDescriptionToHtml(text) {
        if (!text) return "";
        let parsed = ControlTagParser.parseControlText(text);
        parsed = paragraphsToHtml(parsed);

        // The codex is written with the engine's \C[n] colour codes. They used
        // to resolve to fixed inks picked for the cream page, which left the
        // default one (a dark mahogany) all but unreadable on a dark theme;
        // each code now names the theme token that carries the same meaning.
        const colorMap = {
            0: "var(--text-success-active)",  // Body ink
            1: "var(--text-navy)",            // Blue
            2: "var(--text-cost-bad)",        // Red
            3: "var(--text-cost-ok)",         // Green
            4: "var(--text-info-blue)",       // Light blue
            5: "var(--text-text-alt-19)",     // Purple
            6: "var(--text-amber-hint)",      // Orange
            17: "var(--text-cost-bad)",       // Accent red
            18: "var(--text-gold-dark)"       // Gold
        };

        let html = "";
        let lastIndex = 0;
        const regex = /\\[cC]\[(\d+)\]/g;
        let match;
        let openSpan = false;

        while ((match = regex.exec(parsed)) !== null) {
            html += parsed.substring(lastIndex, match.index);
            if (openSpan) {
                html += "</span>";
                openSpan = false;
            }
            const colorId = parseInt(match[1]);
            const hexColor = colorMap[colorId] || "var(--text-success-active)";
            html += `<span style="color: ${hexColor}; font-weight: ${colorId === 0 ? 'normal' : 'bold'}">`;
            openSpan = true;
            lastIndex = regex.lastIndex;
        }

        html += parsed.substring(lastIndex);
        if (openSpan) html += "</span>";
        return html;
    }

    // =============================================================================
    // Add Help Command to Main Menu
    // =============================================================================
    const _Window_MenuCommand_addOriginalCommands = Window_MenuCommand.prototype.addOriginalCommands;
    Window_MenuCommand.prototype.addOriginalCommands = function () {
        _Window_MenuCommand_addOriginalCommands.call(this);
        this.addCommand(T('HelpMenu.command'), "help", true, 281);
    };

    const _Scene_Menu_createCommandWindow = Scene_Menu.prototype.createCommandWindow;
    Scene_Menu.prototype.createCommandWindow = function () {
        _Scene_Menu_createCommandWindow.call(this);
        this._commandWindow.setHandler("help", this.commandHelp.bind(this));
    };

    Scene_Menu.prototype.commandHelp = function () {
        SceneManager.push(Scene_Help);
    };

    // =============================================================================
    // Add Help to the title menu, above Credits
    // =============================================================================
    // The book is worth reading before a world exists, so the title screen
    // carries it too. The entry is spliced in above Credits (or above Exit when
    // the credits plugin has not patched the list yet), which puts it in the
    // same place whichever of the two loads first.
    const _insertTitleHelp = (list, entry, symbolOf) => {
        let at = list.findIndex(c => symbolOf(c) === "credits");
        if (at < 0) at = list.findIndex(c => symbolOf(c) === "exitGame");
        if (at < 0) list.push(entry);
        else list.splice(at, 0, entry);
        return list;
    };

    const _Window_TitleCommand_makeCommandList_help = Window_TitleCommand.prototype.makeCommandList;
    Window_TitleCommand.prototype.makeCommandList = function () {
        _Window_TitleCommand_makeCommandList_help.call(this);
        _insertTitleHelp(this._list,
            { name: T('HelpMenu.command'), symbol: "help", enabled: true, ext: null },
            c => c.symbol);
    };

    // Titlescreen.js draws its own overlay from this list and maps the clicked
    // index straight onto the command window, so the two must agree exactly.
    if (Scene_Title.prototype.getTitleCommandText) {
        const _Scene_Title_getTitleCommandText_help = Scene_Title.prototype.getTitleCommandText;
        Scene_Title.prototype.getTitleCommandText = function () {
            return _insertTitleHelp(_Scene_Title_getTitleCommandText_help.call(this),
                { text: T('HelpMenu.command'), symbol: "help" },
                c => c.symbol);
        };
    }

    const _Scene_Title_createCommandWindow_help = Scene_Title.prototype.createCommandWindow;
    Scene_Title.prototype.createCommandWindow = function () {
        _Scene_Title_createCommandWindow_help.call(this);
        this._commandWindow.setHandler("help", () => {
            SceneManager.push(Scene_Help);
            SceneManager.prepareNextScene({ hideTopics: true });
        });
    };

    // =============================================================================
    // Scene_Help - Premium D&D HTML Overlay
    // =============================================================================
    function Scene_Help() {
        this.initialize(...arguments);
    }

    Scene_Help.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_Help.prototype.constructor = Scene_Help;

    // Published so the parchment main menu can open it. Without this the scene stayed inside
    // this file's IIFE and the menu's Help tile pushed a name that did not exist.
    window.Scene_Help = Scene_Help;

    Scene_Help.prototype.initialize = function () {
        Scene_MenuBase.prototype.initialize.call(this);
        this._hideTopics = false;
    };

    // Opened from the title screen there is no party yet, so the shelf of what
    // the party has been told has nothing to be about: the tab is left out
    // rather than shown empty.
    Scene_Help.prototype.prepare = function (options) {
        this._hideTopics = !!(options && options.hideTopics);
    };

    Scene_Help.prototype.categories = function () {
        // The illnesses are a shelf of their own, not a corner of the topics
        // page: a player looking one up should not have to walk past every
        // faction and rumour the party has heard first.
        return this._hideTopics
            ? ["general", "history", "diseases"]
            : ["topics", "rumors", "general", "history", "diseases"];
    };

    Scene_Help.prototype.create = function () {
        Scene_MenuBase.prototype.create.call(this);

        // Deactivate standard windows
        if (this._helpWindow) { this._helpWindow.deactivate(); this._helpWindow.hide(); }
        if (this._itemListWindow) { this._itemListWindow.deactivate(); this._itemListWindow.hide(); }
        if (this._confirmWindow) { this._confirmWindow.deactivate(); this._confirmWindow.hide(); }

        this._activeArea = "tabs"; // "tabs", "list", "content"
        this._tabIndex = 0;
        this._listIndex = 0;
        this._selectedTopic = null;

        // The shared search + filter strip (UI/MenuSearchBar.js), asked for
        // nothing but the field: a codex page is found by a word, and the
        // reading order of the pages is the whole point of the list, so a sort
        // control would only take it apart. The query is matched against the
        // body of every page as well as its title, so "hygiene" finds the page
        // that explains what washing does to what people think of you.
        this._helpBar = window.MenuSearchBar ? window.MenuSearchBar.create({
            id: 'helpcodex',
            placeholder: T('HelpMenu.searchPlaceholder'),
            onChange: () => {
                this._listIndex = 0;
                this.refreshUIHelp();
            }
        }) : null;

        this.initUIHelp();
        this.refreshUIHelp();
        // Repaint once the banks land, in case they were not read yet or the
        // language was changed since they were.
        _ensureHelpI18n(() => {
            this._topicCache = null;
            this._searchCache = null;
            this._lastCategory = null;
            if (SceneManager._scene === this) this.refreshUIHelp();
        });
    };

    Scene_Help.prototype.update = function () {
        this.updateUIHelpInput();
        Scene_MenuBase.prototype.update.call(this);
    };

    Scene_Help.prototype.terminate = function () {
        if (this._helpBar) { this._helpBar.dispose(); this._helpBar = null; }
        const container = document.getElementById("help-container");
        if (container) container.remove();
        const style = document.getElementById("help-style");
        if (style) style.remove();
        Scene_MenuBase.prototype.terminate.call(this);
    };

    // The world's own timeline, one chapter per year: the century that was
    // generated before the world was played AND everything that has happened
    // in it since. It lives in the world folder (history.json), so every
    // savegame of the world reads the same story, whichever of them wrote a
    // given day. The left page lists every year from 1900 to whichever one
    // the game is currently living in; the right page opens that year's
    // chronicle, month by month.
    const HISTORY_START_YEAR = 1900;

    // How newsworthy each event category reads as, for the days that rolled
    // more than one entry: a canon date (handleFixedEvents, HistorySimulator.js)
    // always leads regardless of category, since that is the spine the setting
    // is written against; everything else falls back to this table so the
    // headline picked for a busy day is the one a reader would expect to see
    // above the fold rather than whichever the generator happened to roll last.
    const HISTORY_CATEGORY_WEIGHT = {
        military: 10, conquest: 10, epidemic: 9, disaster: 8, royal: 7,
        political: 6, occult: 6, internal: 5, criminal: 5, paranormal: 5,
        scientific: 4, social: 4, economic: 3
    };

    // The year the game is currently living in: the century was simulated up
    // to 2001 before the world was ever played, and the live chronicle keeps
    // writing from there as the clock advances, so this is not always 2001.
    function historyCurrentYear() {
        try {
            if (window.TimeDateSystem && typeof window.TimeDateSystem.getCurrentDateObj === "function") {
                const d = window.TimeDateSystem.getCurrentDateObj();
                if (d) return d.getFullYear();
            }
        } catch (e) { /* no clock yet: read as the canon end year */ }
        return 2001;
    }

    // "1998-07-17" -> "17 07 1998", day before month before year.
    function historyFormatDate(dateStr) {
        const parts = String(dateStr || "").split("-");
        if (parts.length < 3) return String(dateStr || "");
        const [y, m, d] = parts;
        return `${d.padStart(2, '0')} ${m.padStart(2, '0')} ${y}`;
    }

    // The one entry a day is remembered by. A canon date wins outright; among
    // procedural rolls, whichever category weighs the most carries the day.
    function historyPickHeadline(dayEvents) {
        const canon = dayEvents.find(e => e && e.type === 'fixed');
        if (canon) return canon;
        let best = dayEvents[0];
        let bestWeight = HISTORY_CATEGORY_WEIGHT[best && best.category] || 3;
        for (let i = 1; i < dayEvents.length; i++) {
            const w = HISTORY_CATEGORY_WEIGHT[dayEvents[i].category] || 3;
            if (w > bestWeight) { best = dayEvents[i]; bestWeight = w; }
        }
        return best;
    }

    // One line of the chronicle. A canon record is written "NAME: sentence"
    // in the source text (History.fixed.<yyyy-mm>), so its name is pulled out
    // and stamped between !!! marks; a record with no such prefix (the rare
    // fixed entry with none) has its whole sentence marked instead. dateKey is
    // passed in rather than read off the record because a canon record is
    // stamped with its month only (handleFixedEvents, HistorySimulator.js
    // keys it History.fixed.<yyyy-mm>) and the day grouping below fills the
    // day back in as the 1st.
    function historyEventLine(rec, hm, dateKey) {
        const text = String(typeof hm.describeRecord === "function"
            ? hm.describeRecord(rec)
            : (rec.description || "")).trim();
        const dateLabel = historyFormatDate(dateKey);
        if (rec.type === 'fixed') {
            const sep = text.indexOf(':');
            const named = sep > 0 && sep < 60 && text.slice(0, sep) === text.slice(0, sep).toUpperCase();
            const name = named ? text.slice(0, sep).trim() : text;
            const rest = named ? text.slice(sep + 1).trim() : '';
            return `- ${dateLabel}: !!! ${name} !!!` + (rest ? ` ${rest}` : '');
        }
        return `- ${dateLabel}: ${text}`;
    }

    function historyTopics() {
        const hm = window.HistoryManager;
        if (!hm || typeof hm.getEvents !== "function") return [];
        let events = [];
        try { events = hm.getEvents() || []; } catch (e) { return []; }

        // Almost every record is stamped with a full day; a canon record
        // (handleFixedEvents) is stamped with its month only, since it is
        // keyed History.fixed.<yyyy-mm> rather than to a specific day, and is
        // always generated on the 1st. That gets filled back in here so it
        // groups into the same calendar as everything else instead of being
        // silently dropped.
        const byDay = new Map();
        events.forEach((rec) => {
            if (!rec || (!rec.description && !rec.descKey)) return;
            const raw = String(rec.date || "");
            const parts = raw.split("-");
            if (parts.length < 2) return;
            const key = parts.length >= 3 ? raw : `${parts[0]}-${parts[1]}-01`;
            if (!byDay.has(key)) byDay.set(key, []);
            byDay.get(key).push(rec);
        });

        const dayKeysSorted = Array.from(byDay.keys()).sort();

        const monthNames = T.list('TimeDate.months');
        const noEvents = T('HelpMenu.noHistoryThisYear');
        const endYear = Math.max(historyCurrentYear(), HISTORY_START_YEAR);

        const years = [];
        for (let year = endYear; year >= HISTORY_START_YEAR; year--) {
            const prefix = year + '-';
            const dayKeys = dayKeysSorted.filter(k => k.indexOf(prefix) === 0);

            let body;
            if (!dayKeys.length) {
                body = noEvents;
            } else {
                const blocks = [];
                let curMonth = -1;
                let lines = [];
                dayKeys.forEach((key) => {
                    const month = Number(key.split('-')[1]) || 0;
                    if (month !== curMonth) {
                        if (lines.length) { blocks.push(lines.join('\n')); lines = []; }
                        curMonth = month;
                        blocks.push('\\c[18]' + (monthNames[month - 1] || key) + '\\c[0]');
                    }
                    lines.push(historyEventLine(historyPickHeadline(byDay.get(key)), hm, key));
                });
                if (lines.length) blocks.push(lines.join('\n'));
                body = blocks.join('\n\n');
            }

            years.push({
                raw: true,
                type: "history",
                title: String(year),
                description: body,
                category: "history",
            });
        }
        return years;
    }

    // Every disease the world knows how to generate, the same library the
    // character-creation Archive keeps on its Diseases shelf
    // (window.DiseaseSystem.all(), Health_DiseaseSystem.js), reachable here
    // too since this Codex is the only Archive the main menu opens.
    function diseaseTopics() {
        const api = window.DiseaseSystem;
        if (!api || typeof api.all !== "function") return [];
        let rows = [];
        try { rows = api.all() || []; } catch (e) { return []; }
        return rows
            .filter((d) => d && d.name)
            .slice()
            .sort((a, b) => String(a.name).localeCompare(String(b.name)))
            .map((d) => ({
                raw: true,
                type: "disease",
                title: d.name,
                description: (typeof api.diseaseDossierHTML === "function"
                    ? api.diseaseDossierHTML(d.id)
                    : ""),
                category: d.category || "",
            }));
    }

    // What the party has been TOLD. A topic reaches them two ways: a line
    // written with it in square brackets, [Hardware], and a line that simply
    // NAMES it, since every page carries the words it answers to
    // (NPC/DialogueSystem.js does both, and keeps what was learned on the
    // actor, _keywords). A conversation option that needs a topic stays out of
    // sight until somebody knows it.
    //
    // Nothing on this shelf is written in advance: a page is here because it
    // was said to them.
    const authoredPages = () => {
        const pages = new Map();
        getHelpTopics().forEach((t) => {
            if (t && t.type === 'topic' && t.keyword) pages.set(String(t.keyword).toLowerCase(), t);
        });
        return pages;
    };

    const keywordOwners = () => {
        const owners = new Map();
        if (typeof $gameParty === "undefined" || !$gameParty) return owners;
        $gameParty.members().forEach((actor) => {
            (actor._keywords || []).forEach((word) => {
                if (!owners.has(word)) owners.set(word, []);
                owners.get(word).push(actor.name());
            });
        });
        return owners;
    };

    // A name the world knows can be an article in the Empathize wiki: a nation,
    // a hyperpower, a faction, a party, a leader. The button that opens it is
    // offered on any page whose subject resolves to one, written or not.
    const wikiEntity = (name) => {
        const wiki = window.NPCEmpathize && window.NPCEmpathize.Wiki;
        if (!wiki || typeof wiki.resolve !== 'function' || !name) return null;
        try { return wiki.resolve(String(name)) || null; } catch (e) { return null; }
    };

    // The pages the party has been told about and that somebody has written.
    function conversationTopics() {
        const owners = keywordOwners();
        if (!owners.size) return [];
        const authored = authoredPages();
        const out = [];
        owners.forEach((names, word) => {
            const page = authored.get(String(word).toLowerCase());
            if (!page) return;
            out.push(Object.assign({}, page, {
                group: 'topics',
                known: T('HelpMenu.topicKnownBy', { names: names.join(", ") }),
                wiki: wikiEntity(page.keyword) || wikiEntity(getLocalizedTitle(page)),
            }));
        });
        return sortTopics(out);
    }

    // The other half: what the party has heard named and nobody has written a
    // page for. Topics picked up from a line that has no article behind them,
    // and every name the world knows that was said where they could hear it
    // (NPC/DialogueSystem.js remembers those as it marks them). A rumour that
    // turns out to be a nation, a power, a faction, a party or a leader carries
    // the button through to its article.
    function rumorTopics() {
        const authored = authoredPages();
        const owners = keywordOwners();
        const rows = new Map();
        owners.forEach((names, word) => {
            if (authored.has(String(word).toLowerCase())) return;
            rows.set(word, T('HelpMenu.topicKnownBy', { names: names.join(", ") }));
        });
        let heard = [];
        try { heard = (window.DialogueTopics && window.DialogueTopics.rumors()) || []; } catch (e) { heard = []; }
        heard.forEach((name) => {
            if (authored.has(String(name).toLowerCase())) return;
            if (!rows.has(name)) rows.set(name, "");
        });
        return Array.from(rows.keys())
            .sort((a, b) => String(a).localeCompare(String(b)))
            .map((word) => {
                const known = rows.get(word);
                const body = known ? known + "\n\n" + T('HelpMenu.topicExplainer')
                                   : T('HelpMenu.rumorExplainer');
                return {
                    raw: true,
                    type: "rumor",
                    group: "rumors",
                    title: word,
                    description: body,
                    wiki: wikiEntity(word),
                };
            });
    }

    Scene_Help.prototype.getFilteredTopics = function (category) {
        if (category === "topics") {
            // What the party has been TOLD, and nothing else. The world's
            // chronicle and the illnesses used to be appended here too; each
            // has its own tab now (see "history" and "diseases" below), so a
            // player looking for a single event or a single fever does not
            // have to wade through every spell and faction first.
            return conversationTopics();
        }
        if (category === "rumors") return rumorTopics();
        if (category === "history") return historyTopics();
        if (category === "diseases") return diseaseTopics();
        const all = getHelpTopics();
        let filtered = [];
        if (category === "general") {
            // The manual: every page that explains how something WORKS, the
            // states and the elements included. They used to be tabs of their
            // own; they are macrocategories of the one reading order now, so a
            // player looking for Bleeding finds it filed under the combat
            // pages that inflict it rather than in a separate drawer.
            filtered = all.filter(t => t && t.title && t.type !== 'lore' && t.type !== 'topic');
        }
        return sortTopics(filtered);
    };

    // What the list actually shows: the category, narrowed by whatever is
    // typed in the search field. Everything that walks the list reads this, so
    // the cursor can never point at a page the page is not showing.
    //
    // Both halves are cached for the life of the scene, because this is read
    // once per FRAME by the input handler: the lore shelf builds a record per
    // disease and per day of the world's chronicle, which is several hundred
    // objects, and rebuilding them sixty times a second to answer "which page
    // is the cursor on" is how a book becomes a slideshow. Nothing behind them
    // can change while the book is open.
    Scene_Help.prototype.visibleTopics = function (category) {
        if (!this._topicCache) this._topicCache = {};
        if (!this._topicCache[category]) this._topicCache[category] = this.getFilteredTopics(category);
        const topics = this._topicCache[category];
        if (!this._helpBar || this._helpBar.isEmpty()) return topics;

        const query = this._helpBar.query;
        const key = category + '|' + query;
        if (!this._searchCache || this._searchCache.key !== key) {
            this._searchCache = {
                key,
                rows: topics.filter(t => this._helpBar.matches({
                    name: getLocalizedTitle(t),
                    subtitle: getLocalizedDescription(t)
                }))
            };
        }
        return this._searchCache.rows;
    };

    Scene_Help.prototype.initUIHelp = function () {
        if (!document.getElementById("help-container")) {
            const container = document.createElement("div");
            container.id = "help-container";
            document.body.appendChild(container);
        }
    };

    Scene_Help.prototype.refreshUIHelp = function () {
        const container = document.getElementById("help-container");
        if (!container) return;

        const lang = ConfigManager.language || 'en';
        const useTranslation = lang === 'it';

        const categories = this.categories();
        const activeCategory = categories[this._tabIndex];
        const topics = this.visibleTopics(activeCategory);

        // Clamping indexes safely
        if (topics.length > 0) {
            this._listIndex = Math.max(0, Math.min(topics.length - 1, this._listIndex));
            this._selectedTopic = topics[this._listIndex];
        } else {
            this._selectedTopic = null;
        }

        // Translation strings
        const tCodex =T('HelpMenu.archiveEntry');
        const tGeneral =T('HelpMenu.general');
        const tTopics =T('HelpMenu.topics');
        const tRumors =T('HelpMenu.rumors');
        const tHistory =T('HelpMenu.history');
        const tDiseases =T('HelpMenu.diseases');
        const tSelectTopic =T('HelpMenu.selectATopicToStart');
        // One tab, one label, looked up by name: a shelf added to categories()
        // is named here and nowhere else.
        const TAB_LABELS = {
            general: tGeneral,
            topics: tTopics,
            rumors: tRumors,
            history: tHistory,
            diseases: tDiseases,
        };
        const backBtnText =T('HelpMenu.back');

        // Ensure the book spread exists. Shape A, dealt the way every other
        // spread in the game is dealt: the contents on the left page (58%,
        // where the header bar and its one Back button stand) and the entry
        // being read on the right page (42%).
        let spread = container.querySelector(".book-spread");
        if (!spread) {
            container.innerHTML = `
                <div class="book-spread">
                    <div class="left-page"></div>
                    <div class="right-page"></div>
                </div>
            `;
            spread = container.querySelector(".book-spread");

            // Wheel scroll targets whichever scrollable pane is under the cursor
            container.addEventListener("wheel", (e) => {
                const target = e.target.closest("#help-content-scroll, .topic-list-container");
                if (target) {
                    e.preventDefault();
                    target.scrollTop += e.deltaY;
                }
            }, { passive: false });
        }

        // The contents page carries the header, the tabs, the rail and the
        // list; the entry page carries the detail card.
        const listPage = spread.querySelector(".left-page");
        const detailPage = spread.querySelector(".right-page");

        // 1. RIGHT PAGE: the entry being read, on the shared detail card.
        let detailHTML = "";
        if (!this._selectedTopic) {
            detailHTML = `<div class="ui-empty"><div class="ui-empty-text">${tSelectTopic}</div></div>`;
        } else {
            const topic = this._selectedTopic;
            const displayTitle = getLocalizedTitle(topic);
            const bodyHtml = parseDescriptionToHtml(getLocalizedDescription(topic));
            const imageHtml = topic.image ? `<img class="help-image" src="img/pictures/${topic.image}.png" onerror="this.classList.add('help-image--missing');">` : "";

            const isFocused = this._activeArea === "content";
            const focusClass = isFocused ? "help-content focused" : "help-content";

            // A page whose subject the world itself knows carries a way
            // through to its article: the Empathize wiki already writes nations,
            // hyperpowers, factions, parties and leaders, and there is no sense
            // in the codex writing them a second time. The button is offered on
            // a written page and on a bare rumour alike.
            const wikiHTML = topic.wiki
                ? `<div class="back-button focusable" id="help-wiki-btn">${T('HelpMenu.openWiki')}</div>`
                : "";
            const knownHTML = topic.known
                ? `<div class="help-body ui-prose help-known">${paragraphsToHtml(topic.known)}</div>`
                : "";

            detailHTML = `
                <div class="ui-detail">
                    <div class="ui-detail-head">
                        <div class="ui-detail-titles">
                            <h3 class="help-title">${displayTitle}</h3>
                        </div>
                        ${wikiHTML}
                    </div>
                    <div class="ui-detail-scroll ui-scroll ${focusClass}" id="help-content-scroll">
                        <div class="help-body ui-prose">${bodyHtml}</div>
                        ${knownHTML}
                        ${imageHtml}
                    </div>
                </div>
            `;
        }

        // The map-tooltip setting is not the book's: it is a setting, and it is
        // read and turned with every other one on the Gameplay page of the
        // Options menu (Core/GameOptions.js, symbol mapTooltips).

        detailPage.innerHTML = detailHTML;

        const wikiButton = detailPage.querySelector("#help-wiki-btn");
        if (wikiButton) {
            wikiButton.addEventListener("click", () => {
                const entity = this._selectedTopic && this._selectedTopic.wiki;
                if (!entity || !window.NPCEmpathize || !window.NPCEmpathize.openEntity) return;
                SoundManager.playOk();
                window.NPCEmpathize.openEntity(entity.type, entity.id);
            });
        }

        // 2. LEFT PAGE: the contents, its tabs and its rail (rebuilt only when
        // the category or the query changes, so nothing flickers).
        const query = this._helpBar ? this._helpBar.query : '';
        const needsRightPageRedraw = !listPage.innerHTML
            || this._lastCategory !== activeCategory || this._lastQuery !== query;
        this._lastCategory = activeCategory;
        this._lastQuery = query;

        // The macrotopics of whatever the tab is showing, in reading order. They
        // are printed as the same chips the backpack files its pockets with
        // (.backpack-tab), and they are a rail rather than a filter: picking one
        // scrolls the list down to that part of the manual.
        this._groups = [];
        topics.forEach(t => {
            if (t.group && !this._groups.includes(t.group)) this._groups.push(t.group);
        });

        if (needsRightPageRedraw) {
            let tabsHTML = "";
            categories.forEach((cat, idx) => {
                const label = TAB_LABELS[cat] || cat;
                tabsHTML += `<div class="backpack-tab help-category-tab focusable" data-idx="${idx}">${label}</div>`;
            });

            let listHTML = "";
            if (topics.length === 0) {
                const empty = (activeCategory === "topics" || activeCategory === "rumors")
                    ? T('HelpMenu.noTopicsLearnedYet')
                    : T('HelpMenu.noCodexEntriesFoundIn');
                listHTML = `<div class="ui-empty"><div class="ui-empty-text">${empty}</div></div>`;
            } else {
                // The pages are read in macrocategories, so the list is
                // headed the way a manual's contents page is. A header is not
                // a row: the cursor never lands on one, it only tells the
                // reader which part of the manual they have scrolled into.
                listHTML = `<div class="ui-list ui-scroll topic-list-container">`;
                let lastGroup = null;
                topics.forEach((topic, idx) => {
                    const titleText = getLocalizedTitle(topic);
                    if (topic.group && topic.group !== lastGroup) {
                        lastGroup = topic.group;
                        listHTML += `<div class="topic-group-header" data-group="${topic.group}">${getGroupLabel(topic.group)}</div>`;
                    }
                    listHTML += `
                        <div class="topic-item focusable" data-idx="${idx}">
                            <span class="topic-title-text">${titleText}</span>
                        </div>
                    `;
                });
                listHTML += `</div>`;
            }

            let chipsHTML = "";
            if (this._groups.length > 1) {
                chipsHTML = `<div class="backpack-tabs help-group-chips">` +
                    this._groups.map(g => `<div class="backpack-tab" data-group="${g}">${getGroupLabel(g)}</div>`).join('') +
                    `</div>`;
            }

            listPage.innerHTML = `
                <div class="page-header-bar">
                  <div class="back-button focusable" onclick="SceneManager._scene.popScene()">
                    ${backBtnText}
                  </div>
                  <h2 class="title">${tCodex}</h2>
                </div>
                <div class="backpack-tabs help-category-tabs">
                    ${tabsHTML}
                </div>
                <div id="help-search-slot"></div>
                ${chipsHTML}
                ${listHTML}
            `;

            // The strip is rebuilt with the page, then handed its caret back.
            const searchSlot = listPage.querySelector("#help-search-slot");
            if (searchSlot && this._helpBar) {
                searchSlot.innerHTML = this._helpBar.fieldHTML();
                this._helpBar.restoreFocus();
            }

            // Bind click events on recreated tabs
            const tabElements = listPage.querySelectorAll(".help-category-tab");
            tabElements.forEach(elem => {
                elem.addEventListener("click", () => {
                    const idx = parseInt(elem.getAttribute("data-idx"));
                    this._activeArea = "tabs";
                    this._tabIndex = idx;
                    this._listIndex = 0;
                    SoundManager.playOk();
                    this.refreshUIHelp();
                });
            });

            // Bind click events on the macrotopic chips
            listPage.querySelectorAll(".help-group-chips .backpack-tab").forEach(elem => {
                elem.addEventListener("click", () => {
                    this.goToGroup(elem.getAttribute("data-group"));
                });
            });

            // Bind click events on recreated topics
            {
                const itemElements = listPage.querySelectorAll(".topic-item");
                itemElements.forEach(elem => {
                    elem.addEventListener("click", () => {
                        const idx = parseInt(elem.getAttribute("data-idx"));
                        this._activeArea = "list";
                        this._listIndex = idx;
                        this._selectedTopic = topics[idx];
                        SoundManager.playOk();
                        this.refreshUIHelp();
                    });
                });
            }
        }

        // 3. Fast state synchronization (toggles classes, completely eliminating flickering)
        const tabElements = listPage.querySelectorAll(".help-category-tab");
        tabElements.forEach((elem, idx) => {
            const isActive = idx === this._tabIndex;
            const isFocused = this._activeArea === "tabs" && idx === this._tabIndex;

            if (isActive) elem.classList.add("active");
            else elem.classList.remove("active");

            if (isFocused) elem.classList.add("focused");
            else elem.classList.remove("focused");
        });

        {
            const itemElements = listPage.querySelectorAll(".topic-item");
            itemElements.forEach((elem, idx) => {
                const isActive = this._selectedTopic === topics[idx];
                const isFocused = this._activeArea === "list" && idx === this._listIndex;

                if (isActive) elem.classList.add("active");
                else elem.classList.remove("active");

                if (isFocused) elem.classList.add("focused");
                else elem.classList.remove("focused");
            });
        }

        {
            const current = this._selectedTopic && this._selectedTopic.group;
            const rail = listPage.querySelector(".help-group-chips");
            listPage.querySelectorAll(".help-group-chips .backpack-tab").forEach(elem => {
                const on = elem.getAttribute("data-group") === current;
                elem.classList.toggle("active", on);
                // The rail is short and scrolls; the chip that is lit has to be
                // on it, or a reader stepping past the fold sees nothing move.
                if (on && rail && rail.scrollHeight > rail.clientHeight) {
                    const top = elem.offsetTop - rail.offsetTop;
                    if (top < rail.scrollTop) rail.scrollTop = top;
                    else if (top + elem.offsetHeight > rail.scrollTop + rail.clientHeight) {
                        rail.scrollTop = top + elem.offsetHeight - rail.clientHeight;
                    }
                }
            });
        }
    };

    // Put the reader at the head of a macrotopic: the cursor lands on its first
    // page and the list is scrolled so its header sits at the top of the column,
    // which is what makes the rail read as a table of contents rather than as a
    // filter. Nothing is hidden, the book is only wound to that place.
    Scene_Help.prototype.goToGroup = function (group) {
        if (!group) return;
        const topics = this.visibleTopics(this.categories()[this._tabIndex]);
        const at = topics.findIndex(t => t.group === group);
        if (at < 0) return;
        this._listIndex = at;
        this._activeArea = "list";
        SoundManager.playCursor();
        this.refreshUIHelp();
        this.scrollListToGroup(group);
    };

    Scene_Help.prototype.scrollListToGroup = function (group) {
        const container = document.querySelector("#help-container .topic-list-container");
        if (!container) return;
        const header = container.querySelector(`.topic-group-header[data-group="${group}"]`);
        if (!header) return;
        container.scrollTop += header.getBoundingClientRect().top - container.getBoundingClientRect().top;
    };

    // L1/R1 and Tab step the rail. Which macrotopic is current is read off the
    // page the cursor is on, not kept beside it, so walking the list with the
    // arrows and stepping the rail can never disagree.
    Scene_Help.prototype.stepGroup = function (dir) {
        const groups = this._groups || [];
        if (!groups.length) return;
        const current = this._selectedTopic && this._selectedTopic.group;
        const at = groups.indexOf(current);
        const next = at < 0 ? (dir > 0 ? 0 : groups.length - 1)
            : (at + dir + groups.length) % groups.length;
        this.goToGroup(groups[next]);
    };

    Scene_Help.prototype.updateUIHelpInput = function () {
        // A focused search field owns the keyboard (UI/MenuSearchBar.js).
        if (window.MenuSearchBar && window.MenuSearchBar.isTyping()) return;
        const categories = this.categories();
        const activeCategory = categories[this._tabIndex];
        const topics = this.visibleTopics(activeCategory);

        // L1/R1, and Tab with Shift for the other direction, walk the
        // macrotopic rail from anywhere in the scene.
        const groups = this._groups || [];
        if (groups.length > 1) {
            const backwards = Input.isTriggered('pageup')
                || (Input.isTriggered('tab') && Input.isPressed('shift'));
            const forwards = Input.isTriggered('pagedown') || Input.isTriggered('tab');
            if (backwards || forwards) {
                this.stepGroup(backwards ? -1 : 1);
                return;
            }
        }

        // A shelf with no macrotopics of its own leaves the shoulder buttons to
        // the category tabs, which is what they did before the rail existed.
        if (Input.isTriggered('pageup') || Input.isTriggered('pagedown')) {
            const dir = Input.isTriggered('pageup') ? -1 : 1;
            this._tabIndex = (this._tabIndex + dir + categories.length) % categories.length;
            this._listIndex = 0;
            this._activeArea = "tabs";
            SoundManager.playCursor();
            this.refreshUIHelp();
            return;
        }

        if (this._activeArea === "tabs") {
            if (Input.isRepeated('right')) {
                this._tabIndex = (this._tabIndex + 1) % categories.length;
                this._listIndex = 0;
                SoundManager.playCursor();
                this.refreshUIHelp();
            } else if (Input.isRepeated('left')) {
                this._tabIndex = (this._tabIndex - 1 + categories.length) % categories.length;
                this._listIndex = 0;
                SoundManager.playCursor();
                this.refreshUIHelp();
            } else if (Input.isRepeated('down')) {
                if (topics.length > 0) {
                    this._activeArea = "list";
                    this._listIndex = 0;
                    SoundManager.playCursor();
                    this.refreshUIHelp();
                }
            } else if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
                this.popScene();
                SoundManager.playCancel();
            }
        } else if (this._activeArea === "list") {
            // A query that matches nothing leaves the list empty; the cursor
            // goes back to the tabs rather than walking a list of none.
            if (topics.length === 0) {
                this._activeArea = "tabs";
                this.refreshUIHelp();
                return;
            }
            if (Input.isRepeated('down')) {
                // The list is the last thing on the page now, so its last row is
                // where Down stops.
                if (this._listIndex >= topics.length - 1) return;
                this._listIndex = this._listIndex + 1;
                SoundManager.playCursor();
                this.refreshUIHelp();

                const container = document.getElementById("help-container");
                if (container) {
                    const row = container.querySelector(".topic-item.focused");
                    if (row) row.scrollIntoView({ block: "nearest" });
                }
            } else if (Input.isRepeated('up')) {
                if (this._listIndex === 0) {
                    this._activeArea = "tabs";
                    SoundManager.playCursor();
                    this.refreshUIHelp();
                } else {
                    this._listIndex = (this._listIndex - 1) % topics.length;
                    SoundManager.playCursor();
                    this.refreshUIHelp();

                    const container = document.getElementById("help-container");
                    if (container) {
                        const row = container.querySelector(".topic-item.focused");
                        if (row) row.scrollIntoView({ block: "nearest" });
                    }
                }
            } else if (Input.isTriggered('right') || Input.isTriggered('ok')) {
                if (this._selectedTopic) {
                    this._activeArea = "content";
                    SoundManager.playOk();
                    this.refreshUIHelp();
                } else {
                    SoundManager.playBuzzer();
                }
            } else if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
                this._activeArea = "tabs";
                SoundManager.playCancel();
                this.refreshUIHelp();
            }
        } else if (this._activeArea === "content") {
            // Scroll page content smoothly using arrows
            const contentDiv = document.getElementById("help-content-scroll");
            if (contentDiv) {
                if (Input.isPressed('down')) {
                    contentDiv.scrollTop += 8;
                } else if (Input.isPressed('up')) {
                    contentDiv.scrollTop -= 8;
                }
            }

            if (Input.isTriggered('cancel') || TouchInput.isCancelled() || Input.isTriggered('left')) {
                this._activeArea = "list";
                SoundManager.playCancel();
                this.refreshUIHelp();
            }
        }
    };
})();