/*:
 * @target MZ
 * @plugindesc The shared search + filter strip every long list menu puts on its left page.
 * @author Esoteric Heavy Industries
 *
 * @help MenuSearchBar.js
 *
 * One search field, one filter strip, one implementation. Any menu that shows a
 * long list (the Skills scene, the Bestiary, the workbench, the forge, the trait
 * picker, the main menu's search page) mounts this on its LEFT page instead of
 * growing a search box of its own.
 *
 * The strip is made of four optional pieces, and a menu asks only for the ones
 * that mean something in it:
 *
 *   the field       always shown
 *   sort keys       config.sorts, from name | level | weight | price | cost,
 *                   each named MenuSearch.sort.<key> unless config.sortLabels
 *                   gives that menu its own word for one
 *   kind chips      config.kinds, e.g. Earth / Petrodemons / Aliens
 *   category picker config.categories(), a list the HOST computes from what it
 *                   is actually showing, so it is always in that menu's own
 *                   vocabulary
 *   ranges          config.ranges, from weight | price
 *
 * In practice the individual menus take the field and plain name / weight /
 * price ordering, and nothing else: a per-menu page is for finding one row in a
 * long list, not for interrogating it. The advanced half - kind chips, the
 * category picker and the numeric ranges - belongs to the main menu's search
 * page (UI/CustomMainMenuSearch.js), which searches everything at once and is
 * the only place worth narrowing that hard.
 *
 * Usage from a host scene:
 *
 *     this._bar = window.MenuSearchBar.create({
 *         id: 'bestiary',
 *         placeholder: T('Bestiary.searchPlaceholder'),
 *         sorts: ['name', 'level'],
 *         categories: () => this.archetypesOnThisPage(),
 *         onChange: () => this.refreshList()
 *     });
 *
 *     // in the left page markup
 *     this._bar.html()
 *
 *     // when building the list
 *     const rows = this._bar.apply(everything, mon => ({
 *         name: mon.name, category: mon.archetype, level: mon.level
 *     }));
 *
 *     // after the host has rebuilt the DOM around the field
 *     this._bar.restoreFocus();
 *
 * The list under the strip is mounted in a window rather than built whole
 * (UI/MenuVirtualList.js): a query that matches eight hundred rows costs the
 * dozen the page can actually show. A menu wearing this strip should mount its
 * list through that plugin rather than assigning innerHTML itself.
 *
 * Wherever the host mounts it, the FIELD half is then docked onto that page's
 * own .page-header-bar: it rides the same row as the Back button and the page
 * title, pinned to the right edge, rather than taking a full width row of its
 * own under the header. A page with no header bar keeps the field where the
 * host put it.
 *
 * Every field starts COLLAPSED: all the page shows is the IconSet magnifier
 * (247) at its top right, and the field itself only exists once that handle is
 * opened (it autofocuses then, and empties itself again when collapsed). The
 * handle carries '.focusable' and a real tabindex, so every menu navigator that
 * collects the focus ring lands on it like any other control, and F opens and
 * closes it from anywhere a strip is mounted (see the shortcut below) so a
 * menu whose cursor walks only its own cards still has a way in. A host that
 * patches its page in place instead of redrawing the strip needs to do nothing,
 * toggleField() repaints its own markup.
 *
 * A focused field owns the keyboard: every key event is stopped at the element,
 * so neither Input.keyMapper nor a scene's own window-level WASD listener ever
 * sees the typing. Scenes that read Input directly should still bail out of
 * their own navigation while window.MenuSearchBar.isTyping() is true, so a
 * gamepad poll cannot move the cursor out from under the caret.
 *
 * Load this BEFORE any menu that uses it.
 */

(function () {
    'use strict';

    function escapeHtml(str) {
        return String(str ?? '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[c]);
    }

    // The IconSet magnifying glass (247), drawn as a background sprite so the
    // handle needs no font glyph.
    const SEARCH_GLASS_ICON = 247;
    function iconStyle(index, size) {
        const col = index % 16;
        const row = Math.floor(index / 16);
        return `display:block; width:${size}px; height:${size}px; ` +
            `background-image:url('img/system/IconSet.png'); background-size:${size * 16}px auto; ` +
            `background-position:-${col * size}px -${row * size}px; image-rendering:pixelated;`;
    }

    // The collapsed handle every search field in the game wears. Shared, so the
    // few menus that still keep a search field of their own (the backpack, the
    // build panel, the sandbox) wear exactly the same handle as the ones on
    // this strip.
    // A search field is a keyboard control. On a pad there is no way to type a
    // query into one, so the handle is not drawn: not shown, not focusable, and
    // in no menu's focus ring, rather than sitting there as a control that
    // cannot be used. window.PadUI answers which device is in hand.
    function padOnly() {
        return !!(window.PadUI && window.PadUI.active && window.PadUI.active());
    }

    function toggleHTML(onclick, expanded) {
        if (padOnly()) return '';
        const title = expanded ? T('MenuSearch.close') : T('MenuSearch.open');
        return `<div class="msb-toggle focusable${expanded ? ' open' : ''}" tabindex="0"
                    title="${escapeHtml(title)}"
                    onmousedown="event.preventDefault()"
                    onclick="event.stopPropagation(); ${onclick}"><span class="msb-glass" style="${iconStyle(SEARCH_GLASS_ICON, 20)}"></span></div>`;
    }

    // Every sort key the strip knows how to offer, and where each reads its
    // number from on a descriptor. A host names the ones that mean something in
    // its list and never sees the rest.
    const SORT_KEYS = ['name', 'level', 'weight', 'price', 'cost'];
    const RANGE_KEYS = ['weight', 'price'];

    // id -> controller, so the inline handlers in the markup can find their bar.
    const bars = new Map();

    // The one thing every host needs to ask before it moves a cursor.
    function isTyping() {
        const el = document.activeElement;
        if (!el) return false;
        if (el.tagName === 'TEXTAREA') return true;
        if (el.tagName === 'SELECT') return true;
        return el.tagName === 'INPUT';
    }

    const numOr = (text, fallback) => {
        const n = parseFloat(text);
        return Number.isFinite(n) ? n : fallback;
    };

    function create(config) {
        const cfg = config || {};
        const id = cfg.id || ('bar' + bars.size);

        // A bar is remade every time its scene is opened; the newest one wins
        // the id so the inline handlers always reach the live scene.
        const state = {
            expanded: !!cfg.startExpanded,   // the field is a handle until clicked
            query: '',
            kind: cfg.kinds && cfg.kinds.length ? cfg.kinds[0].key : '',
            sortKey: (cfg.sorts && cfg.sorts[0]) || 'name',
            sortDir: 'asc',
            category: '',
            weightMin: '', weightMax: '',
            priceMin: '', priceMax: '',
            caret: null,
            count: null            // filled by apply(), printed by the strip
        };

        const sorts = (cfg.sorts || []).filter(k => SORT_KEYS.includes(k));
        const ranges = (cfg.ranges || []).filter(k => RANGE_KEYS.includes(k));

        // A sort tag is named MenuSearch.sort.<key> unless the host has a
        // better word for it in its own list: "Name" says nothing useful on a
        // page whose rows are a tree, where the ordering is A-Z within it.
        const sortLabel = (key) => (cfg.sortLabels && cfg.sortLabels[key]) || T('MenuSearch.sort.' + key);

        const changed = () => { if (cfg.onChange) cfg.onChange(); };

        // Every field stops its own key events so the menu underneath never sees
        // the typing; without this, "I" opens the backpack mid-word.
        const STOP = `onkeydown="window.MenuSearchBar.onKey(event, '${id}')" onkeyup="event.stopPropagation()" onkeypress="event.stopPropagation()"`;
        const call = (method, arg) => `window.MenuSearchBar.get('${id}').${method}(${arg})`;

        const bar = {
            id,
            get query() { return state.query; },
            get kind() { return state.kind; },
            get category() { return state.category; },
            get sortKey() { return state.sortKey; },
            get sortDir() { return state.sortDir; },

            isEmpty() {
                return !state.query.trim() && !state.category && !state.weightMin && !state.weightMax
                    && !state.priceMin && !state.priceMax;
            },

            // ---- markup -----------------------------------------------------

            // The strip comes in two halves so a host can place them apart:
            // the main menu keeps the field on its right page, over the party
            // cards, and the filters on the left with the results. Everywhere
            // else html() puts the two together at the top of the left page.
            html() {
                return this.fieldHTML() + this.filtersHTML();
            },

            // Collapsed, the field is one handle sitting at the top right of the
            // page; open, the handle stays there and the field fills the row to
            // its left. A query keeps it open on its own, so a page redrawn
            // while something is typed in it never swallows the filter.
            isFieldOpen() {
                return state.expanded || !!state.query;
            },

            fieldHTML() {
                if (padOnly()) return '';
                const open = this.isFieldOpen();
                const handle = toggleHTML(call('toggleField', ''), open);
                const field = open ? `
                        <div class="msb-field">
                            <input type="text" id="msb-input-${id}" class="backpack-search-input"
                                placeholder="${escapeHtml(cfg.placeholder || T('MenuSearch.placeholder'))}"
                                autocomplete="off" spellcheck="false"
                                value="${escapeHtml(state.query)}"
                                oninput="${call('setQuery', 'this.value')}" ${STOP}>
                            ${state.query ? `<div class="msb-clear" title="${escapeHtml(T('MenuSearch.clear'))}" onclick="${call('reset', '')}">✕</div>` : ''}
                        </div>` : '';
                return `
                    <div class="msb msb-field-only${open ? '' : ' msb-collapsed'}" data-msb="${id}">${field}
                        ${handle}
                    </div>`;
            },

            filtersHTML() {
                const rows = [];

                if (cfg.kinds && cfg.kinds.length) {
                    rows.push(`<div class="backpack-tabs" style="margin-bottom:0">${cfg.kinds.map(k =>
                        `<div class="backpack-tab${state.kind === k.key ? ' active' : ''}" onclick="${call('setKind', `'${k.key}'`)}">${escapeHtml(k.label)}</div>`
                    ).join('')}</div>`);
                }

                const bits = [];
                if (sorts.length) {
                    const arrow = state.sortDir === 'asc' ? '▲' : '▼';
                    bits.push(`<div class="backpack-sort-tags">${sorts.map(key => {
                        const active = state.sortKey === key;
                        return `<div class="sort-tag${active ? ' active' : ''}" onclick="${call('setSort', `'${key}'`)}">${escapeHtml(sortLabel(key))}${active ? ' ' + arrow : ''}</div>`;
                    }).join('')}</div>`);
                }

                const cats = cfg.categories ? (cfg.categories() || []) : [];
                if (cats.length) {
                    // The active pick stays on offer even when the query has
                    // filtered every row carrying it away, so the select never
                    // jumps off its own value.
                    const values = cats.map(c => (typeof c === 'string' ? c : c.key));
                    const list = (!state.category || values.includes(state.category)) ? cats : cats.concat([state.category]);
                    const options = [`<option value="">${escapeHtml(cfg.categoryLabel || T('MenuSearch.anyCategory'))}</option>`]
                        .concat(list.map(c => {
                            const value = typeof c === 'string' ? c : c.key;
                            const label = typeof c === 'string' ? c : c.label;
                            return `<option value="${escapeHtml(value)}"${value === state.category ? ' selected' : ''}>${escapeHtml(label)}</option>`;
                        })).join('');
                    bits.push(`<select class="msb-select focusable" onchange="${call('setCategory', 'this.value')}" ${STOP}>${options}</select>`);
                }

                if (bits.length) rows.push(`<div class="msb-row">${bits.join('')}</div>`);

                if (ranges.length) {
                    const num = (field, placeholder) =>
                        `<input type="number" class="msb-num" step="any" min="0" placeholder="${escapeHtml(placeholder)}"
                                value="${escapeHtml(state[field])}" ${STOP}
                                oninput="${call('setRange', `'${field}', this.value`)}">`;
                    const parts = ranges.map(key =>
                        `<span class="msb-label">${escapeHtml(T('MenuSearch.range.' + key))}</span>
                         ${num(key + 'Min', T('MenuSearch.min'))}
                         <span class="msb-sep">–</span>
                         ${num(key + 'Max', T('MenuSearch.max'))}`);
                    rows.push(`<div class="msb-row">${parts.join('')}</div>`);
                }

                if (!rows.length) return '';
                return `<div class="msb" id="msb-${id}">${rows.join('')}</div>`;
            },

            // ---- filtering ---------------------------------------------------

            // `describe` turns one of the host's own entries into the handful of
            // fields the strip knows how to filter and sort on. Anything it does
            // not report simply cannot be filtered out by that control.
            matches(d) {
                const needle = state.query.trim().toLowerCase();
                if (needle) {
                    const haystack = [d.name, d.category, d.subtitle]
                        .filter(v => v != null).join(' ').toLowerCase();
                    if (!haystack.includes(needle)) return false;
                }
                if (state.category && d.category !== state.category) return false;
                for (const key of ranges) {
                    const min = state[key + 'Min'];
                    const max = state[key + 'Max'];
                    if (min === '' && max === '') continue;
                    const value = d[key];
                    // A range only speaks about entries carrying that number at
                    // all: a skill has no weight, and a weight filter must not
                    // silently delete every skill from the page.
                    if (!value) return false;
                    if (value < numOr(min, -Infinity)) return false;
                    if (value > numOr(max, Infinity)) return false;
                }
                return true;
            },

            // Filter and sort a host's list in one call, remembering how many
            // survived so the strip can print the count.
            apply(list, describe) {
                const kept = [];
                (list || []).forEach(entry => {
                    const d = describe ? describe(entry) : entry;
                    if (!d || !this.matches(d)) return;
                    kept.push({ entry, d });
                });

                const dir = state.sortDir === 'asc' ? 1 : -1;
                const key = state.sortKey;
                kept.sort((a, b) => {
                    if (key === 'name') return String(a.d.name || '').localeCompare(String(b.d.name || '')) * dir;
                    const av = a.d[key] || 0;
                    const bv = b.d[key] || 0;
                    if (av !== bv) return (av - bv) * dir;
                    return String(a.d.name || '').localeCompare(String(b.d.name || ''));
                });

                state.count = kept.length;
                return kept.map(k => k.entry);
            },

            // ---- handlers ----------------------------------------------------

            setQuery(value) {
                state.query = value;
                const input = document.getElementById('msb-input-' + id);
                state.caret = input ? input.selectionStart : null;
                changed();
                this.restoreFocus();
            },

            // The handle. Opening autofocuses the fresh field; closing drops
            // whatever was typed, so a filter can never keep narrowing a page
            // from behind a handle that shows no sign of it.
            toggleField() {
                state.expanded = !state.expanded;
                if (!state.expanded) { state.query = ''; state.caret = null; }
                if (window.SoundManager) SoundManager.playCursor();
                changed();
                this.syncField();
                if (state.expanded) this.restoreFocus();
            },

            // Shut it again without telling the host, for a caller that is
            // already redrawing: leaving the search behind puts the handle back.
            collapseField() {
                state.expanded = false;
                state.query = '';
                state.caret = null;
            },

            // Force it open without a toggle, for a host whose page IS the
            // search (the main menu's results page opens with the field hot).
            // The caret is the caller's business: the main menu's Search tile
            // wants the field open with the arrow keys still on the results.
            openField() {
                if (state.expanded) return;
                state.expanded = true;
                this.syncField();
            },

            // Repaint the field's own markup, for the hosts that patch their
            // page in place rather than rebuilding the strip out of html().
            syncField() {
                const nodes = document.querySelectorAll(`.msb-field-only[data-msb="${id}"]`);
                if (!nodes.length) return;
                const markup = this.fieldHTML();
                Array.from(nodes).forEach(node => { node.outerHTML = markup; });
                dockAll();
            },

            setKind(kind) {
                if (state.kind === kind) return;
                state.kind = kind;
                // A category from another kind's vocabulary would match nothing.
                state.category = '';
                if (window.SoundManager) SoundManager.playCursor();
                changed();
            },

            setSort(key) {
                if (state.sortKey === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
                else { state.sortKey = key; state.sortDir = 'asc'; }
                if (window.SoundManager) SoundManager.playCursor();
                changed();
            },

            setCategory(value) {
                state.category = value || '';
                changed();
            },

            setRange(field, value) {
                if (!Object.prototype.hasOwnProperty.call(state, field)) return;
                state[field] = String(value);
                changed();
                this.restoreFocusTo('.msb-num');
            },

            reset() {
                this.resetQuiet();
                if (window.SoundManager) SoundManager.playCancel();
                changed();
            },

            // Empty everything without telling the host: for a host that is
            // already redrawing (or is not on screen yet), calling back into it
            // mid-teardown is how a refresh ends up recursing into itself.
            resetQuiet() {
                state.query = '';
                state.category = '';
                state.weightMin = state.weightMax = state.priceMin = state.priceMax = '';
                state.caret = null;
            },

            // Put the caret back after the host rebuilt the DOM around the field.
            restoreFocus() {
                const input = document.getElementById('msb-input-' + id);
                if (!input) return;
                if (document.activeElement === input) return;
                input.focus();
                const at = state.caret === null ? input.value.length : state.caret;
                try { input.setSelectionRange(at, at); } catch (e) { /* not a text input */ }
            },

            // Same, for the numeric fields, which have no caret worth keeping but
            // do need to stay focused across a redraw.
            restoreFocusTo(selector) {
                const root = document.getElementById('msb-' + id);
                if (!root) return;
                const field = root.querySelector(selector);
                if (field && document.activeElement !== field) field.focus();
            },

            // The kind currently picked, for hosts that split their list by it.
            currentKind() { return state.kind; },

            // Set from the config, so the host's own key handling travels with
            // the bar rather than having to be found by name.
            onHostKey: cfg.onKey || null,

            dispose() {
                if (bars.get(id) === bar) bars.delete(id);
            }
        };

        bars.set(id, bar);
        lastId = id;
        installSearchKey();
        installDocking();
        return bar;
    }

    // ---- docking the field onto the page header ---------------------------
    // One search field, one place on the page: the strip's field rides the
    // SAME row as the Back button and the page title, pinned to the right edge
    // of the header, instead of taking a full width row of its own under it.
    // Hosts keep mounting it wherever they always did; this moves it up into
    // the nearest .page-header-bar of the page it was mounted in, so every
    // menu carrying a search gets the shape without a per menu layout.
    //
    // A page with no header bar (the main menu's results page, whose field IS
    // the page) is left exactly where the host put it.
    function headerFor(node) {
        let p = node.parentElement;
        while (p && p !== document.body) {
            if (p.classList && p.classList.contains('page-header-bar')) return p;
            const header = p.querySelector(':scope > .page-header-bar');
            if (header) return header;
            p = p.parentElement;
        }
        return null;
    }

    function dockOne(node) {
        if (!node || node.classList.contains('msb-docked')) return;
        const header = headerFor(node);
        if (!header || node.parentElement === header) {
            if (node.parentElement === header) node.classList.add('msb-docked');
            return;
        }
        const active = document.activeElement;
        const keep = active && node.contains(active) ? active : null;
        const caret = keep && typeof keep.selectionStart === 'number' ? keep.selectionStart : null;
        node.classList.add('msb-docked');
        header.appendChild(node);
        if (keep) {
            keep.focus();
            if (caret !== null) { try { keep.setSelectionRange(caret, caret); } catch (e) { /* not a text input */ } }
        }
    }

    function dockAll() {
        if (typeof document === 'undefined') return;
        const loose = document.querySelectorAll('.msb-field-only:not(.msb-docked)');
        Array.from(loose).forEach(dockOne);
    }

    let dockInstalled = false;
    function installDocking() {
        if (dockInstalled || typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
        dockInstalled = true;
        // A host redraws its page whenever the list changes, which puts a fresh
        // undocked field back under the header every time; the observer is how
        // the shape survives those redraws without every host calling in.
        const observer = new MutationObserver(() => dockAll());
        observer.observe(document.body, { childList: true, subtree: true });
        dockAll();
    }

    // ---- the keyboard route to the handle ----------------------------------
    // Every strip is mounted inside a menu that walks its own cards, and most
    // of those cursors collect nothing but cards: the handle would be the one
    // control on the page that needed a mouse. F opens and closes the newest
    // strip on screen from wherever the cursor is, which is also how a player
    // on a pad reaches it, since a pad cannot type into the field anyway and
    // the menu's own cursor keeps the list.
    //
    // Bound once, on the document, and it stands down while anything has the
    // caret so the letter goes into the field rather than closing it.
    const SEARCH_KEY = "f";
    let lastId = null;
    let keyInstalled = false;

    function installSearchKey() {
        if (keyInstalled || typeof document === "undefined") return;
        keyInstalled = true;
        document.addEventListener("keydown", (e) => {
            if (String(e.key).toLowerCase() !== SEARCH_KEY) return;
            if (e.altKey || e.metaKey) return;
            if (isTyping()) return;
            if (padOnly()) return;
            const bar = lastId ? bars.get(lastId) : null;
            // Only while a strip is actually on screen: the same key means
            // nothing on a map or in a battle.
            if (!bar || !document.querySelector(".msb-toggle")) return;
            e.preventDefault();
            e.stopPropagation();
            bar.toggleField();
        });
    }

    // A search field fires once per character typed, and a menu that answers it
    // by rebuilding its list pays that rebuild five times over for a five letter
    // word. Every such field routes its handler through this instead: the work
    // runs once, after the player stops typing. `flush` is there for a caller
    // that has to have the answer now (a test, or a field being emptied on
    // close), and `cancel` for a menu tearing itself down.
    function debounce(fn, wait) {
        const delay = wait == null ? 120 : wait;
        let timer = null;
        let lastArgs = null;
        let lastThis = null;
        const run = () => {
            timer = null;
            const args = lastArgs || [];
            const self = lastThis;
            lastArgs = null;
            lastThis = null;
            fn.apply(self, args);
        };
        const wrapped = function (...args) {
            lastArgs = args;
            lastThis = this;
            if (timer !== null) clearTimeout(timer);
            timer = setTimeout(run, delay);
        };
        wrapped.flush = () => {
            if (timer === null) return;
            clearTimeout(timer);
            run();
        };
        wrapped.cancel = () => {
            if (timer !== null) clearTimeout(timer);
            timer = null;
            lastArgs = null;
            lastThis = null;
        };
        return wrapped;
    }

    window.MenuSearchBar = {
        create,
        isTyping,
        debounce,
        toggleHTML,
        // Pull every loose field up onto its page header, for a host that builds
        // its page in one synchronous pass and wants the shape before paint.
        dock: dockAll,
        get(id) {
            // A dead id would take an inline handler down with it, and these
            // handlers are strings in markup that can outlive their scene.
            return bars.get(id) || {
                setQuery() {}, setKind() {}, setSort() {}, setCategory() {},
                setRange() {}, reset() {}, restoreFocus() {}, restoreFocusTo() {},
                toggleField() {}, syncField() {}, openField() {}, collapseField() {},
                isFieldOpen() { return false; }
            };
        },

        // Shared key handling for every field the strip owns: the menu below must
        // never see the typing, and Escape empties the field before it closes
        // anything.
        onKey(event, id) {
            event.stopPropagation();
            // The host sees the key first: the main menu walks its results with
            // Up/Down and runs the highlighted one with Enter, all without the
            // caret leaving the field.
            const owner = id ? bars.get(id) : null;
            if (owner && owner.onHostKey) {
                owner.onHostKey(event);
                if (event.defaultPrevented) return;
            }
            if (event.key !== 'Escape') return;
            const field = event.target;
            if (field && field.value) {
                event.preventDefault();
                field.value = '';
                if (field.oninput) field.oninput(event);
            } else if (field) {
                field.blur();
            }
        }
    };
})();
