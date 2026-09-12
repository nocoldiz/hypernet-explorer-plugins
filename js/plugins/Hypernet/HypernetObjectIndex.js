/*:
 * @target MZ
 * @plugindesc v2.1.0 Omni-Lex Object Index: browsable encyclopedia of every catalogued item, for HypernetOS.
 * @author Omni-Lex
 *
 * @help
 * HypernetObjectIndex.js
 *
 * Adds the "Omni-Lex Object Index" application to the HypernetOS desktop: the
 * total-transparency archive's catalogue of every object known to exist, one
 * dossier per item, with all of its declared metadata laid out in the open.
 *
 * Left page  - the catalogue, grouped by the category dividers that separate
 *              the ranges in the item database, with a search box.
 * Right page - the selected object's dossier: identification, the archive's
 *              lore paragraph, commerce, physical properties, provisioning
 *              values, composition and the raw declaration tags.
 *
 * RANDOMIZE DECLARATION
 * The archive's lore paragraph is combinatorial: the note carries a template
 * and the world seed decides which words come out. The "Randomize" button
 * re-rolls that decision with a throwaway nonce and shows the result in this
 * window only. It never writes to $dataItems and never moves the world seed,
 * so the item's canonical lore everywhere else in the game is unchanged, and
 * closing the app forgets the reroll.
 *
 * Category dividers (entries named "<-- Something -->") and the blank padding
 * slots between ranges are never listed; only the 1100 real items are.
 *
 * Reads (all optional, degrades gracefully):
 *   window.ItemSystemUtils  - weight, category, nutrition, needs, rarity, lore
 *   window.HypernetOS       - window manager and icon rendering
 *
 * Exposes:
 *   window.HypernetObjectIndex.launch()
 *
 * Load AFTER: Hypernet/HypernetOS, ItemSystem/ItemSystemUtils.
 */

(() => {
    'use strict';

    const APP_ID = 'app-object-index';
    const APP_ICON = 230; // Brown Book, per js/db/Sprites/Icons.json

    // A category divider is an item whose name is the marker itself. The
    // dividers delimit the id ranges of the database, so they double as the
    // grouping for the catalogue while never being listed as objects.
    const DIVIDER_RE = /^<--\s*(.*?)\s*-->$/;

    const escapeHtml = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const iconHTML = (index, size) => (window.HypernetOS ? window.HypernetOS.getIconHTML(index, size) : '');

    // Every price in the archive is quoted in euros; the database stores gold.
    const euros = (gold) => ((gold || 0) / 100).toFixed(2) + '€';

    const utils = () => window.ItemSystemUtils || null;

    // --- Catalogue ----------------------------------------------------------

    let _catalogue = null; // { groups: [{name, items:[]}], byId: {}, count }

    function nameOf(item) {
        return String((item && item.name) || '').trim();
    }

    function dividerLabel(item) {
        const m = DIVIDER_RE.exec(nameOf(item));
        return m ? m[1] : null;
    }

    function buildCatalogue() {
        const groups = [];
        const byId = {};
        let count = 0;
        let current = null;

        if (typeof $dataItems === 'undefined' || !$dataItems) return { groups, byId, count };

        for (let i = 0; i < $dataItems.length; i++) {
            const item = $dataItems[i];
            if (!item) continue;
            const name = nameOf(item);
            if (!name) continue; // blank padding slot between ranges

            const label = dividerLabel(item);
            if (label !== null) {
                current = { name: label, items: [] };
                groups.push(current);
                continue;
            }

            if (!current) {
                current = { name: T('ObjectIndex.uncatalogued'), items: [] };
                groups.push(current);
            }
            current.items.push(item);
            byId[item.id] = item;
            count++;
        }

        return { groups: groups.filter(g => g.items.length), byId, count };
    }

    function catalogue() {
        if (!_catalogue) _catalogue = buildCatalogue();
        return _catalogue;
    }

    // --- Metadata readers ---------------------------------------------------

    function metaOf(item) {
        return (item && item.meta) ? item.meta : {};
    }

    function categoryOf(item) {
        const u = utils();
        if (u && typeof u.getItemCategoryName === 'function') {
            try {
                const n = u.getItemCategoryName(item);
                if (n) return String(n);
            } catch (e) {}
        }
        const raw = metaOf(item).category;
        return raw ? String(raw) : '';
    }

    function weightText(item) {
        const u = utils();
        if (!u || typeof u.getItemWeight !== 'function') return '';
        try {
            const grams = u.getItemWeight(item);
            if (typeof u.formatWeight === 'function') return u.formatWeight(grams);
            return grams + ' g';
        } catch (e) { return ''; }
    }

    function rarityOf(item) {
        const u = utils();
        if (!u || typeof u.getItemRarity !== 'function') return null;
        try { return u.getItemRarity(item); } catch (e) { return null; }
    }

    function nutritionRows(item) {
        const u = utils();
        const rows = [];
        if (!u || typeof u.getNutritionValue !== 'function') return rows;
        [['calories', T('ObjectIndex.nutrition.calories'), ' kcal'],
         ['protein', T('ObjectIndex.nutrition.protein'), ' g'],
         ['fat', T('ObjectIndex.nutrition.fat'), ' g'],
         ['caffeine', T('ObjectIndex.nutrition.caffeine'), ' mg']].forEach(([key, label, unit]) => {
            let v = 0;
            try { v = u.getNutritionValue(item, key) || 0; } catch (e) { v = 0; }
            if (v) rows.push([label, v + unit]);
        });
        return rows;
    }

    // getNeedRestores returns [{ key, amount, label, color }], already localised.
    function needRows(item) {
        const u = utils();
        if (!u || typeof u.getNeedRestores !== 'function') return [];
        let restores = null;
        try { restores = u.getNeedRestores(item); } catch (e) { return []; }
        if (!restores || !restores.length) return [];
        return restores.map(r => [r.label || r.key, '+' + r.amount]);
    }

    // getAddictionRelief returns [{ key, amount, label }]: what this object
    // takes OFF a craving, which is why the figures read negative.
    function cravingRows(item) {
        const u = utils();
        if (!u || typeof u.getAddictionRelief !== 'function') return [];
        let relief = null;
        try { relief = u.getAddictionRelief(item); } catch (e) { return []; }
        if (!relief || !relief.length) return [];
        return relief.map(r => [r.label || r.key, '-' + r.amount]);
    }

    function recipeText(item) {
        const raw = metaOf(item).Recipe;
        if (!raw) return '';
        // "871x2, 869x1" -> "Isopropyl Alcohol x2, Distilled Water x1"
        return String(raw).split(',').map(part => {
            const m = /^\s*(\d+)\s*x\s*(\d+)\s*$/i.exec(part);
            if (!m) return part.trim();
            const ing = $dataItems[Number(m[1])];
            const label = ing && nameOf(ing) ? nameOf(ing)
                : T('ObjectIndex.itemNumbered', { id: m[1] });
            return label + ' x' + m[2];
        }).join(', ');
    }

    // Resolved on read: both are indexed by the RPG Maker occasion/scope number.
    const OCCASIONS = { get length() { return 4; } };
    for (let i = 0; i < 4; i++) {
        Object.defineProperty(OCCASIONS, i, {
            get: ((n) => () => T('ObjectIndex.occasion.' + n))(i), enumerable: true
        });
    }
    const SCOPES = {};
    for (let i = 0; i <= 13; i++) {
        Object.defineProperty(SCOPES, i, {
            get: ((n) => () => T('ObjectIndex.scope.' + n))(i), enumerable: true
        });
    }

    // Tags already surfaced in their own dossier sections; the raw block lists
    // whatever is left, so a newly added tag still shows up without a code change.
    // i18n-ignore-start  note-tag names, matched against the item's meta
    const HANDLED_TAGS = ['Lore', 'category', 'Weight', 'Recipe',
                          'calories', 'protein', 'fat', 'caffeine', 'NeedRestore', 'Addiction'];
    // i18n-ignore-end

    // --- Styling ------------------------------------------------------------
    // Archive terminal circa 2001: institutional grey-green, flat panels, the
    // Luna palette the rest of the desktop uses.
    const S = {
        app: 'display:flex; flex-direction:column; height:100%; background:var(--xp-bg); ' +
             "font-family:'Tahoma',sans-serif; font-size:15px; color:var(--xp-ink-2);",
        header: 'display:flex; align-items:center; gap:12px; padding:10px 14px; ' +
                'background:linear-gradient(to bottom,var(--xp-green-4),var(--xp-green-5)); color:var(--xp-white); ' +
                'border-bottom:2px solid #1d2f22;',
        body: 'display:flex; flex:1; min-height:0;',
        side: 'width:250px; flex-shrink:0; display:flex; flex-direction:column; ' +
              'background:var(--xp-face-6); border-right:1px solid var(--xp-face-shade);',
        searchWrap: 'padding:8px; border-bottom:1px solid var(--xp-face-shade);',
        search: 'width:100%; box-sizing:border-box; padding:4px 6px; border:1px solid var(--xp-border); ' +
                "background:var(--xp-input); font-family:'Tahoma',sans-serif; font-size:15px;",
        list: 'flex:1; overflow-y:auto; padding:4px 0;',
        groupHead: 'padding:5px 10px 3px; font-size:13px; font-weight:bold; letter-spacing:0.6px; ' +
                   'color:var(--xp-ok-dark); text-transform:uppercase;',
        row: 'display:flex; align-items:center; gap:6px; padding:4px 10px; cursor:pointer; ' +
             'border-left:4px solid transparent; user-select:none;',
        panel: 'flex:1; overflow-y:auto; padding:14px 16px; background:var(--xp-face-2); min-width:0;',
        status: 'display:flex; gap:16px; align-items:center; border-top:1px solid var(--xp-face-shade); ' +
                'padding:4px 10px; background:var(--xp-bg); font-size:14px; color:var(--xp-ink-4);',
        card: 'background:var(--xp-white); border:1px solid var(--xp-face-3); border-radius:3px; ' +
              'padding:10px 12px; margin-bottom:8px;',
        h: 'margin:0 0 8px; font-size:16px; font-weight:bold; color:var(--xp-green-5);',
        lore: 'background:#fffdf3; border:1px solid #d8d2be; border-left:3px solid var(--xp-green-4); ' +
              'border-radius:3px; padding:10px 12px; margin-bottom:8px; ' +
              'font-style: normal; line-height:1.6; color:#33301f;',
        btn: 'display:inline-block; padding:5px 12px; ' +
             'background:linear-gradient(to bottom,var(--xp-paper),#dcd8cc); border:1px solid var(--xp-face-4); ' +
             'border-radius:3px; cursor:pointer; font-size:15px; color:var(--xp-ink); user-select:none;',
        note: 'color:var(--xp-ink-soft-2); font-size:14px; line-height:1.5;',
        empty: 'padding:32px 16px; text-align:center; color:#6a6a6a; font-size:15px;'
    };

    function rowsTable(rows) {
        if (!rows.length) return '';
        return '<table style="width:100%; border-collapse:collapse">' +
            rows.map(([k, v]) =>
                '<tr>' +
                '<td style="padding:2px 8px 2px 0; color:var(--xp-ink-soft-2); white-space:nowrap; ' +
                'vertical-align:top; width:38%">' + escapeHtml(k) + '</td>' +  // i18n-ignore  css
                '<td style="padding:2px 0; vertical-align:top">' + escapeHtml(v) + '</td>' +
                '</tr>'
            ).join('') + '</table>';
    }

    function card(title, rows) {
        if (!rows.length) return '';
        return '<div style="' + S.card + '"><div style="' + S.h + '">' + escapeHtml(title) + '</div>' +
               rowsTable(rows) + '</div>';
    }

    // --- Application --------------------------------------------------------

    window.HypernetObjectIndex = {
        win: null,
        selectedId: null,
        filter: '',
        reseed: 0,      // 0 = the world's canonical reading
        rerolls: 0,

        launch: function() {
            if (!window.HypernetOS || !window.HypernetOS.WindowManager) {
                console.error('HypernetOS core not loaded!');
                return;
            }

            const cat = catalogue();
            this.filter = '';
            this.reseed = 0;
            this.rerolls = 0;
            if (this.selectedId == null || !cat.byId[this.selectedId]) {
                const first = cat.groups.length ? cat.groups[0].items[0] : null;
                this.selectedId = first ? first.id : null;
            }

            const contentHTML = `
                <div style="${S.app}">
                    <div style="${S.header}">
                        <div style="filter:drop-shadow(0 1px 1px rgba(0,0,0,0.5))">${iconHTML(APP_ICON, 34)}</div>
                        <div style="flex:1; min-width:0">
                            <div style="font-size:17px; font-weight:bold; letter-spacing:0.5px">${T('ObjectIndex.banner')}</div>
                            <div style="font-size:13px; opacity:0.85">${T('ObjectIndex.subtitle')}</div>
                        </div>
                        <div style="font-size:14px; text-align:right; opacity:0.9">
                            <div id="oi-count"></div>
                            <div style="opacity:0.75">${T('ObjectIndex.objectsCatalogued')}</div>
                        </div>
                    </div>
                    <div style="${S.body}">
                        <div style="${S.side}">
                            <div style="${S.searchWrap}">
                                <input id="oi-search" class="focusable" tabindex="0" type="text"
                                       placeholder="${T('ObjectIndex.searchIndex')}" style="${S.search}" />
                            </div>
                            <div id="oi-list" style="${S.list}"></div>
                        </div>
                        <div id="oi-panel" style="${S.panel}"></div>
                    </div>
                    <div style="${S.status}">
                        <span id="oi-status"></span>
                        <span id="oi-message" style="margin-left:auto; color:var(--xp-green-5)"></span>
                    </div>
                </div>
            `;

            const win = window.HypernetOS.WindowManager.createWindow({
                id: APP_ID,
                title: T('ObjectIndex.title'),
                icon: APP_ICON,
                width: 820,
                height: 560,
                contentHTML: contentHTML
            });
            this.win = win;

            const countEl = win.querySelector('#oi-count');
            if (countEl) countEl.textContent = String(cat.count);

            const search = win.querySelector('#oi-search');
            if (search) {
                search.value = '';
                // Keep keystrokes inside the field so the OS focus ring never
                // reads W/A/S/D as navigation while the player is typing.
                // Escape is allowed to bubble so it can still blur/close.
                search.addEventListener('keydown', (e) => {
                    if (e.key !== 'Escape') e.stopPropagation();
                });
                // Rebuilding the list is the expensive half of the app, so it
                // waits for the player to stop typing rather than running once
                // per character.
                const relist = window.MenuSearchBar && window.MenuSearchBar.debounce
                    ? window.MenuSearchBar.debounce(() => this.renderList(), 120)
                    : () => this.renderList();
                this._relist = relist;
                search.addEventListener('input', () => {
                    this.filter = String(search.value || '').toLowerCase();
                    relist();
                });
            }

            // The window survives close/reopen as a fresh node, so drop our
            // reference and any preview state when it goes away.
            win.addEventListener('hypernet-closed', () => {
                if (this._relist && this._relist.cancel) this._relist.cancel();
                this._relist = null;
                this.win = null;
                this.reseed = 0;
                this.rerolls = 0;
            });

            this.renderList();
            this.render();
        },

        alive: function() {
            return !!(this.win && this.win.isConnected);
        },

        say: function(text) {
            if (!this.alive()) return;
            const el = this.win.querySelector('#oi-message');
            if (el) el.textContent = text || '';
        },

        select: function(id) {
            this.selectedId = id;
            this.reseed = 0;      // a new object starts from its canonical text
            this.rerolls = 0;
            this.paintSelection();
            this.render();
        },

        // --- Catalogue list -------------------------------------------------

        // The highlight is two rows changing colour, not a reason to rebuild the
        // list: moving the selection used to re-create every row on file.
        paintSelection: function() {
            if (!this.alive()) return;
            const list = this.win.querySelector('#oi-list');
            if (!list) return;
            const prev = list.querySelector('.oi-row--on');
            if (prev) {
                prev.classList.remove('oi-row--on');
                prev.style.background = '';
                prev.style.color = '';
                prev.style.borderLeftColor = 'transparent';
            }
            const row = list.querySelector('#oi-item-' + this.selectedId);
            if (!row) return;
            row.classList.add('oi-row--on');
            row.style.background = 'var(--xp-blue-tab)';
            row.style.color = 'var(--xp-white)';
            row.style.borderLeftColor = '#1d3f7a';
        },

        renderList: function() {
            if (!this.alive()) return;
            const list = this.win.querySelector('#oi-list');
            if (!list) return;

            // One listener for the whole list rather than one per row: the
            // catalogue runs to the better part of two thousand objects, and
            // that many closures were built again on every keystroke.
            if (!list._oiDelegated) {
                list._oiDelegated = true;
                list.addEventListener('click', (e) => {
                    const row = e.target && e.target.closest
                        ? e.target.closest('[data-oi-id]') : null;
                    if (!row) return;
                    e.stopPropagation();
                    this.select(Number(row.dataset.oiId));
                });
            }

            const cat = catalogue();
            const filter = this.filter;
            let shown = 0;

            // One flat run of lines - group headings and rows alike - so the
            // windowed renderer can hand out whichever slice the scroller is
            // actually over. Nothing else in the app knows the list is not
            // whole: rows carry their object id, so a click, the focus ring and
            // the highlight all still address an object rather than a position.
            const lines = [];
            cat.groups.forEach(group => {
                const matches = group.items.filter(item =>
                    !filter ||
                    nameOf(item).toLowerCase().indexOf(filter) !== -1 ||
                    categoryOf(item).toLowerCase().indexOf(filter) !== -1
                );
                if (!matches.length) return;
                lines.push({ head: group.name + ' (' + matches.length + ')' });
                matches.forEach(item => {
                    shown++;
                    lines.push({ item });
                });
            });
            this._lines = lines;

            const rowHTML = (idx) => {
                const line = lines[idx];
                if (!line) return '';
                if (line.head) {
                    return '<div style="' + S.groupHead + '">'
                        + escapeHtml(line.head) + '</div>';
                }
                const item = line.item;
                const on = item.id === this.selectedId;
                // Stable id so the OS focus ring re-acquires the row after the
                // list is rebuilt by a search keystroke or a window swap.
                return '<div class="focusable' + (on ? ' oi-row--on' : '') + '"'
                    + ' tabindex="0" id="oi-item-' + item.id + '"'
                    + ' data-oi-id="' + item.id + '"'
                    + ' style="' + S.row + (on
                        ? 'background:var(--xp-blue-tab); color:var(--xp-white); border-left-color:#1d3f7a;' : '')
                    + '">'
                    + '<span style="flex-shrink:0">' + iconHTML(item.iconIndex, 16) + '</span>'
                    + '<span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap">'
                    + escapeHtml(nameOf(item)) + '</span>'
                    + '</div>';
            };

            if (window.MenuVirtualList) {
                window.MenuVirtualList.render(list, {
                    key: 'oi|' + filter,
                    count: lines.length,
                    renderItem: rowHTML,
                    emptyHTML: '<div style="' + S.empty + '">'
                        + escapeHtml(T('ObjectIndex.noMatch')) + '</div>'
                });
            } else {
                let html = '';
                for (let i = 0; i < lines.length; i++) html += rowHTML(i);
                list.innerHTML = html || '<div style="' + S.empty + '">'
                    + escapeHtml(T('ObjectIndex.noMatch')) + '</div>';
            }

            const status = this.win.querySelector('#oi-status');
            if (status) {
                status.textContent = filter
                    ? T('ObjectIndex.shownOf', { shown: shown, total: cat.count })
                    : T('ObjectIndex.onFile', { total: cat.count });
            }
        },

        // --- Dossier --------------------------------------------------------

        render: function() {
            if (!this.alive()) return;
            const panel = this.win.querySelector('#oi-panel');
            if (!panel) return;

            const item = catalogue().byId[this.selectedId];
            if (!item) {
                panel.innerHTML = '<div style="' + S.empty + '">'
                    + T('ObjectIndex.selectAnObject') + '</div>';
                return;
            }

            const meta = metaOf(item);
            const rarity = rarityOf(item);
            const html = [];

            // Identification
            html.push(
                '<div style="display:flex; align-items:center; gap:12px; margin-bottom:10px">' +
                '<div style="flex-shrink:0">' + iconHTML(item.iconIndex, 40) + '</div>' +
                '<div style="min-width:0">' +
                '<div style="font-size:20px; font-weight:bold; color:var(--xp-ink-2)">' +
                escapeHtml(nameOf(item)) + '</div>' +
                '<div style="' + S.note + '">' + T('ObjectIndex.indexNo', { id: item.id }) +
                (categoryOf(item) ? ' &middot; ' + escapeHtml(categoryOf(item)) : '') +
                (rarity && rarity.name ? ' &middot; <span class="xp-rarity xp-rarity--' +
                    escapeHtml(String(rarity.name).toLowerCase()) + '">' +
                    escapeHtml(rarity.name) + '</span>' : '') +
                '</div></div></div>'
            );

            if (item.description) {
                html.push('<div style="' + S.card + '">' + escapeHtml(item.description) + '</div>');
            }

            // Archive lore, with the reroll control
            const lore = this.currentLore(item);
            if (lore) {
                html.push(
                    '<div style="' + S.h + '">' + T('ObjectIndex.archiveDeclaration') + '</div>' +
                    '<div id="oi-lore" style="' + S.lore + '">' + escapeHtml(lore) + '</div>' +
                    '<div id="oi-lore-actions" style="margin-bottom:10px"></div>'
                );
            }

            // Commerce
            const commerce = [];
            if (item.price) commerce.push([T('ObjectIndex.declaredValue'), euros(item.price)]);
            commerce.push([T('ObjectIndex.consumable'), item.consumable
                ? T('ObjectIndex.yes') : T('ObjectIndex.no')]);
            if (meta.Key) commerce.push([T('ObjectIndex.keyReference'), String(meta.Key)]);
            html.push(card(T('ObjectIndex.commerce'), commerce));

            // Physical
            const physical = [];
            const w = weightText(item);
            if (w) physical.push([T('ObjectIndex.mass'), w]);
            if (meta.Formula) physical.push([T('ObjectIndex.formula'), String(meta.Formula)]);
            if (meta.Special) physical.push([T('ObjectIndex.handling'), String(meta.Special)]);
            html.push(card(T('ObjectIndex.physicalProperties'), physical));

            // Application
            const application = [];
            if (OCCASIONS[item.occasion]) application.push([T('ObjectIndex.usable'), OCCASIONS[item.occasion]]);
            if (SCOPES[item.scope]) application.push([T('ObjectIndex.affects'), SCOPES[item.scope]]);
            if (item.effects && item.effects.length) {
                application.push([T('ObjectIndex.declaredEffects'), String(item.effects.length)]);
            }
            html.push(card(T('ObjectIndex.application'), application));

            // Provisioning
            html.push(card(T('ObjectIndex.provisioningValue'), nutritionRows(item)));
            html.push(card(T('ObjectIndex.restores'), needRows(item)));
            html.push(card(T('ObjectIndex.sedates'), cravingRows(item)));

            // Composition
            const recipe = recipeText(item);
            if (recipe) {
                html.push('<div style="' + S.card + '"><div style="' + S.h + '">' + T('ObjectIndex.composition') + '</div>' +
                          '<div style="line-height:1.6">' + escapeHtml(recipe) + '</div></div>');
            }

            // Whatever tags remain, so nothing in the note is hidden
            const extra = Object.keys(meta)
                .filter(k => HANDLED_TAGS.indexOf(k) === -1 && k !== 'Key' &&
                             k !== 'Formula' && k !== 'Special')  // i18n-ignore  note-tag names
                .map(k => [k, meta[k] === true ? T('ObjectIndex.yesLower') : String(meta[k])]);
            html.push(card(T('ObjectIndex.otherDeclarations'), extra));

            panel.innerHTML = html.join('');

            // The reroll button is built in JS so it carries the focusable
            // class, a tabindex and a stable id the focus ring can re-acquire.
            const actions = panel.querySelector('#oi-lore-actions');
            if (actions) {
                const btn = document.createElement('div');
                btn.className = 'focusable';
                btn.tabIndex = 0;
                btn.id = 'oi-randomize';
                btn.style.cssText = S.btn;
                btn.textContent = T('ObjectIndex.randomize');
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.randomize();
                });
                actions.appendChild(btn);

                if (this.reseed) {
                    const reset = document.createElement('div');
                    reset.className = 'focusable';
                    reset.tabIndex = 0;
                    reset.id = 'oi-restore';
                    reset.style.cssText = S.btn + ' margin-left:6px;';
                    reset.textContent = T('ObjectIndex.restoreFiled');
                    reset.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        this.reseed = 0;
                        this.rerolls = 0;
                        this.render();
                        this.say(T('ObjectIndex.filedRestored'));
                    });
                    actions.appendChild(reset);

                    const tag = document.createElement('span');
                    tag.style.cssText = S.note + ' margin-left:8px;';
                    tag.textContent = T('ObjectIndex.previewOnly', { reading: this.rerolls });
                    actions.appendChild(tag);
                }
            }
        },

        // Resolve this item's lore at the current preview nonce. reseed 0 asks
        // for exactly what every other item UI in the game shows.
        currentLore: function(item) {
            const u = utils();
            if (!u || typeof u.loreFor !== 'function') return '';
            try {
                return u.loreFor(item, this.reseed) || '';
            } catch (e) {
                return '';
            }
        },

        // Re-roll the wording without touching $dataItems or the world seed.
        randomize: function() {
            const item = catalogue().byId[this.selectedId];
            if (!item) return;

            const before = this.currentLore(item);
            // A template with a single reading would otherwise spin forever.
            for (let attempt = 0; attempt < 12; attempt++) {
                this.reseed = (Math.floor(Math.random() * 0x7ffffffe) + 1) >>> 0;
                if (this.currentLore(item) !== before) break;
            }
            this.rerolls++;
            this.render();

            if (this.currentLore(item) === before) {
                this.say(T('ObjectIndex.onlyOneReading'));
            } else {
                this.say(T('ObjectIndex.alternativeGenerated'));
            }
            if (window.SoundManager) SoundManager.playCursor();
        }
    };

    // Register inside the HypernetOS app registry.
    if (window.HypernetOS) {
        window.HypernetOS.registerApp({
            id: APP_ID,
            name: T('ObjectIndex.appName'),
            icon: APP_ICON,
            launchFn: function() {
                window.HypernetObjectIndex.launch();
            },
            desktopShortcut: true
        });
    }
})();
