/*:
 * @target MZ
 * @plugindesc Main-menu search: one field over the party cards that finds items, gear, skills, recipes and creatures.
 * @author Esoteric Heavy Industries
 *
 * @help CustomMainMenuSearch.js
 *
 * Adds a search field above the party cards on the right page of the main menu
 * (UI/CustomMainMenuLayout.js). Typing in it - or clicking the pockets' Search
 * tile, which opens the same page on everything unfiltered - takes over both
 * pages:
 *
 *   Left page   the results, under a bar of kind chips, sort keys and range
 *               filters (weight, price, category).
 *   Right page  the selected result's own detail card, under the field.
 *
 * What it searches, and what each row is:
 *
 *   Items       every stack the party carries, weapons and armor included.
 *   Equipment   every piece a member is actually wearing, named with the
 *               member and the slot it sits in.
 *   Skills      one row per (member, skill) pair, so a spell three companions
 *               know is three rows, each saying who knows it. Engine basics
 *               (<Category:Basic>) are never listed.
 *   Craftable   recipes the party can make RIGHT NOW: known blueprint, trained
 *               far enough, and every reagent already in the sack. Recipes
 *               nobody can read are never shown.
 *   Bestiary    the codex's three pages at once, Earth creatures, petrodemons
 *               and discovered alien species.
 *
 * Nothing here draws its own detail panel. The item, equipment and craft cards
 * are window.ItemInspect (ItemSystem/ItemSystemInventoryUI.js, the backpack's
 * own right page), the skill card is window.SkillDetails
 * (BattleSystem/CategorizedBattleSkills.js, the Skills scene's own), the 3D
 * weapon viewport is window.Weapon3DPreview (ItemSystem/ItemSystemEquipmentUI.js,
 * the equip screen's own) and the creature pages come from window.BestiaryData
 * (Quest/Bestiary.js). Craftability is answered by the benches themselves,
 * window.CraftRecipes (Quest/ThinkerMenu.js) and window.ForgeRecipes
 * (Quest/ThinkerMenu.js).
 *
 * Keyboard: type to search, Up/Down to walk the results, Enter to run the
 * highlighted result's first action, Escape to clear (again to leave the
 * field). Every key event is stopped at the field, so the menu's own hotkeys
 * never see the typing. With the page open and nothing focused - the tile's
 * way in - the same Up/Down/OK are read from Input instead, so a pad walks the
 * list without ever touching the field.
 *
 * Must be listed AFTER UI/CustomMainMenuLayout.js.
 */

(function () {
    'use strict';

    // Names of party members and of procedural creatures are world data, not
    // markup, so they are escaped before they reach innerHTML.
    function escapeHtml(str) {
        return String(str ?? '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[c]);
    }

    // There is no cap on how many rows a query may return: the list is windowed
    // (UI/MenuVirtualList.js), so a match on everything in the game costs the
    // same dozen cards on screen as a match on one thing.

    // =========================================================================
    // State
    // =========================================================================
    // The query, the kind chips, the sort keys, the category picker and the
    // range fields all belong to the shared strip (UI/MenuSearchBar.js) - the
    // same one the Skills scene, the Bestiary, the workbench, the forge and the
    // trait picker wear. This page only splits it in two, keeping the field on
    // the right page over the party cards and the filters on the left with the
    // results. Everything below is what is left once the strip has its half.
    let bar = null;

    const state = {
        selected: 0,
        // The pockets' "Search" tile opens the page outright, with everything
        // the party has on it and nothing typed yet, so browsing is a way in of
        // its own rather than something only a query can reach.
        opened: false,
        justOpened: false,   // swallow the keypress that opened the page
        wasActive: false,
        results: [],
        resultsKey: '',      // signature the cached results were built from
        pending: null,       // { action: 'use' | 'equip', row } while picking a target
        pendingIndex: 0,     // which party member the picker's cursor is on
        focusInput: false
    };

    const KIND_CHIPS = () => [
        { key: 'all',   label: T('MainMenu.search.kindAll') },
        { key: 'item',  label: T('MainMenu.search.kindItems') },
        { key: 'equip', label: T('MainMenu.search.kindEquipment') },
        { key: 'skill', label: T('MainMenu.search.kindSkills') },
        { key: 'craft', label: T('MainMenu.search.kindCraftable') },
        { key: 'enemy', label: T('MainMenu.search.kindBestiary') }
    ];

    // Built the first time the menu asks for it, and kept for the session: the
    // strip holds the filters the player set, and reopening the menu on a fresh
    // page should not silently keep a weight range they cannot see.
    function ensureBar() {
        if (bar || !window.MenuSearchBar) return bar;
        bar = window.MenuSearchBar.create({
            id: 'mainmenu',
            placeholder: T('MainMenu.search.placeholder'),
            kinds: KIND_CHIPS(),
            sorts: ['name', 'weight', 'price', 'level'],
            ranges: ['weight', 'price'],
            categories: () => availableCategories(state.results),
            onChange: () => window.MenuSearch.onBarChanged(),
            onKey: (event) => window.MenuSearch.onKey(event)
        });
        return bar;
    }

    // Live 3D weapon viewports, handed back to the shared service on teardown.
    let previews = [];
    // How long the cursor must stand still on a weapon before its model is
    // built. See mountVisuals().
    const PREVIEW_SETTLE_MS = 90;
    let previewTimer = 0;

    function disposePreviews() {
        if (previewTimer) { clearTimeout(previewTimer); previewTimer = 0; }
        if (!previews.length) return;
        if (window.Weapon3DPreview) window.Weapon3DPreview.disposeAll(previews);
        previews = [];
    }

    // =========================================================================
    // Gathering
    // =========================================================================

    const weightOf = (item) => (window.ItemSystemUtils && window.ItemSystemUtils.getItemWeight
        ? window.ItemSystemUtils.getItemWeight(item) : 0) / 1000;

    const priceOf = (item) => (item && item.price ? item.price : 0) / 100;

    const itemCategoryOf = (item) => {
        if (window.ItemSystemUtils && window.ItemSystemUtils.getRawCategoryFromNote) {
            const raw = window.ItemSystemUtils.getRawCategoryFromNote(item);
            if (raw) return raw;
        }
        if (DataManager.isWeapon(item)) return T('Inventory.itemType.weapon');
        if (DataManager.isArmor(item)) return T('Inventory.itemType.armor');
        return '';
    };

    const skillCategoryOf = (skill) => {
        const cat = window.SkillDetails ? window.SkillDetails.categoryOf(skill) : null;
        return cat || '';
    };

    // The engine basics belong to no discipline and to no character in
    // particular; they would be the same handful of rows on every search.
    const isBasicSkill = (skill) => !!(window.SkillDetails && window.SkillDetails.isBasic(skill));

    function collectItems() {
        const rows = [];
        $gameParty.allItems().forEach(item => {
            if (!item || !item.name) return;
            const count = $gameParty.numItems(item);
            if (count <= 0) return;
            rows.push({
                kind: 'item',
                key: `i${DataManager.isWeapon(item) ? 'w' : DataManager.isArmor(item) ? 'a' : 'i'}${item.id}`,
                item: item,
                count: count,
                name: item.name,
                sub: T('MainMenu.search.carried', { n: count }),
                iconIndex: item.iconIndex || 0,
                category: itemCategoryOf(item),
                weight: weightOf(item),
                price: priceOf(item),
                level: 0
            });
        });
        return rows;
    }

    function collectEquipment() {
        const rows = [];
        const slotNames = $dataSystem.equipTypes || [];
        $gameParty.members().forEach(actor => {
            const slots = actor.equipSlots();
            actor.equips().forEach((item, slotIdx) => {
                if (!item || !item.name) return;
                rows.push({
                    kind: 'equip',
                    key: `e${actor.actorId()}s${slotIdx}`,
                    item: item,
                    actor: actor,
                    slotIndex: slotIdx,
                    name: item.name,
                    sub: T('MainMenu.search.wornBy', {
                        name: actor.name(),
                        slot: (actor.equipSlotName ? actor.equipSlotName(slotIdx) : '') ||
                              slotNames[slots[slotIdx]] || T('Inventory.spec.label.slotFallback')
                    }),
                    iconIndex: item.iconIndex || 0,
                    category: itemCategoryOf(item),
                    weight: weightOf(item),
                    price: priceOf(item),
                    level: 0
                });
            });
        });
        return rows;
    }

    function collectSkills() {
        const rows = [];
        $gameParty.members().forEach(actor => {
            actor.skills().forEach(skill => {
                if (!skill || !skill.name || isBasicSkill(skill)) return;
                const cost = window.SkillDetails ? window.SkillDetails.costTextOf(skill) : '';
                rows.push({
                    kind: 'skill',
                    key: `k${actor.actorId()}_${skill.id}`,
                    skill: skill,
                    actor: actor,
                    name: skill.name,
                    // Who knows it is the point of listing it once per member.
                    sub: cost ? `${actor.name()} · ${cost}` : actor.name(),
                    iconIndex: skill.iconIndex || 0,
                    category: skillCategoryOf(skill),
                    weight: 0,
                    price: 0,
                    level: actor.level || 0
                });
            });
        });
        return rows;
    }

    // Recipes the party could put together this minute. A blueprint nobody can
    // read is not listed at all, and neither is one whose reagents are short.
    // Answering "could we make this" walks a whole bill of materials, so the
    // name is matched against the query FIRST: the alternative is pricing every
    // recipe in the game on every keystroke.
    function collectCraftables(needle) {
        const rows = [];
        const seen = new Set();
        const named = (item) => !needle || item.name.toLowerCase().includes(needle);

        const push = (item, tradeName) => {
            const key = `c${DataManager.isWeapon(item) ? 'w' : DataManager.isArmor(item) ? 'a' : 'i'}${item.id}`;
            if (seen.has(key)) return;
            seen.add(key);
            rows.push({
                kind: 'craft',
                key: key,
                item: item,
                trade: tradeName || '',
                name: item.name,
                sub: tradeName ? T('MainMenu.search.craftableAt', { trade: tradeName })
                               : T('MainMenu.search.craftable'),
                iconIndex: item.iconIndex || 0,
                category: itemCategoryOf(item),
                weight: weightOf(item),
                price: priceOf(item),
                level: 0
            });
        };

        // The workbench: items and weapons.
        const bench = window.CraftRecipes;
        if (bench) {
            bench.entries().forEach(item => {
                if (!item || !item.name || !named(item)) return;
                if (!bench.canMakeNow(item)) return;
                push(item, bench.tradeName(item));
            });
        }

        // The anvil: weapons and armor, which the workbench cannot answer for.
        const forge = window.ForgeRecipes;
        if (forge) {
            const smith = $gameParty.leader();
            forge.entries().forEach(item => {
                if (!item || !item.name || !named(item)) return;
                if (!forge.canMakeNow(smith, item)) return;
                push(item, forge.tradeName(item));
            });
        }

        return rows;
    }

    function collectEnemies() {
        const rows = [];
        const data = window.BestiaryData;
        if (!data) return rows;

        const add = (list, page, pageLabel) => {
            list.forEach((mon, idx) => {
                if (!mon || !mon.name) return;
                const level = mon.noteData && mon.noteData.level ? parseInt(mon.noteData.level, 10) : 0;
                rows.push({
                    kind: 'enemy',
                    key: `b${page}_${mon.speciesKey || mon.id}_${idx}`,
                    mon: mon,
                    page: page,
                    name: mon.name,
                    sub: level ? `${pageLabel} · ${T('MainMenu.roster.levelAbbr')} ${level}` : pageLabel,
                    iconIndex: 0,
                    category: pageLabel,
                    weight: 0,
                    price: 0,
                    level: level || 0
                });
            });
        };

        add(data.earth(), 'earth', T('Bestiary.earth'));
        add(data.petrodemons(), 'petro', T('Bestiary.petrodemons'));
        add(data.aliens(), 'alien', T('Bestiary.aliens'));
        return rows;
    }

    // =========================================================================
    // Filtering & sorting
    // =========================================================================

    // Signature of everything the result list is built from, so the rows are
    // gathered once per change rather than once per redraw.
    function buildKey() {
        const b = ensureBar();
        return [
            b ? b.query : '', b ? b.kind : '', b ? b.sortKey : '', b ? b.sortDir : '', b ? b.category : '',
            $gameParty.allItems().length,
            $gameParty.members().map(m => `${m.actorId()}.${m.level}.${m.equips().map(e => e ? e.id : 0).join('-')}`).join('|')
        ].join('\u0001');
    }

    function gather() {
        const b = ensureBar();
        const key = buildKey();
        if (key === state.resultsKey) return state.results;

        const needle = (b ? b.query : '').trim().toLowerCase();
        const kind = b ? b.kind : 'all';
        let rows = [];
        const want = (k) => kind === 'all' || kind === k;

        if (want('item'))  rows = rows.concat(collectItems());
        if (want('equip')) rows = rows.concat(collectEquipment());
        if (want('skill')) rows = rows.concat(collectSkills());
        if (want('craft')) rows = rows.concat(collectCraftables(needle));
        if (want('enemy')) rows = rows.concat(collectEnemies());

        // The strip does the matching, the ranges and the ordering, exactly as
        // it does for every other menu that wears it.
        state.results = b ? b.apply(rows, row => row) : rows;
        state.resultsKey = key;
        if (state.selected >= state.results.length) state.selected = Math.max(0, state.results.length - 1);
        return state.results;
    }

    function availableCategories(rows) {
        const set = new Set();
        (rows || []).forEach(r => { if (r.category) set.add(r.category); });
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }

    // =========================================================================
    // Rendering, left page
    // =========================================================================

    function rowHTML(i) {
        const row = state.results[i];
        if (!row) return '';
        const selected = i === state.selected ? ' selected' : '';
        const meta = row.kind === 'item'
            ? `<span>${row.weight > 0 ? (row.weight * row.count).toFixed(2) + ' kg' : ''}</span><span class="item-slot-count">x${row.count}</span>`
            : `<span>${escapeHtml(row.sub)}</span><span class="item-slot-count">${T('MainMenu.search.kind.' + row.kind)}</span>`;
        // Rows are NOT `focusable`: while a search is live the field keeps
        // the keyboard (Up/Down/Enter are answered in onKey), so handing the
        // menu's own navigator a second, competing highlight would only
        // fight the row the player is actually on.
        return `
            <div class="item-slot${selected}" data-idx="${i}" onclick="window.MenuSearch.select(${i})">
                <div class="item-slot-icon"><canvas id="menu-search-canvas-${i}" width="32" height="32" style="width:32px;height:32px;"></canvas></div>
                <div class="item-slot-info">
                    <div class="item-slot-name">${escapeHtml(row.name)}</div>
                    <div class="item-slot-meta">${meta}</div>
                </div>
            </div>`;
    }

    // The results grid, windowed: a query matching thousands of things builds
    // only the cards the page can show, and paints only their icons
    // (UI/MenuVirtualList.js). This is why the list needs no cap.
    function mountResults() {
        const list = document.getElementById('menu-search-results');
        if (!list) return;
        const b = ensureBar();
        window.MenuVirtualList.render(list, {
            key: `${b ? b.query : ''}|${b ? b.kind : ''}|${b ? b.category : ''}|${b ? b.sortKey + b.sortDir : ''}`,
            count: state.results.length,
            renderItem: rowHTML,
            emptyHTML: `<div class="item-grid-empty" style="grid-column:1/-1;">${T('MainMenu.search.noResults', { query: escapeHtml(b ? b.query : '') })}</div>`,
            // Walking the results moves one mark. Nothing else about a row can
            // change without the query, the kind, the category or the sort
            // changing with it, and those are all in the key above, so the
            // window is left alone rather than repainted and every icon and
            // creature sprite in it drawn again.
            focus: { index: state.selected, selector: '.item-slot', className: 'selected' },
            onWindow: (win, from, to) => {
                for (let i = from; i < to; i++) {
                    const row = state.results[i];
                    if (!row) continue;
                    if (row.kind === 'enemy') drawCreatureSprite(row.mon.character, `menu-search-canvas-${i}`);
                    else if (window.ItemInspect) window.ItemInspect.drawIcon(row.iconIndex, `menu-search-canvas-${i}`);
                }
            }
        });
    }

    // =========================================================================
    // Rendering, right page
    // =========================================================================

    function currentRow() {
        return state.results[state.selected] || null;
    }

    // The party members a thing can be used on or worn by.
    function targetPickerHTML(title) {
        const rows = $gameParty.members().map((actor, idx) => `
            <div class="target-option focusable${idx === state.pendingIndex ? ' selected' : ''}"
                 onclick="window.MenuSearch.applyTarget(${idx})">
                ${escapeHtml(actor.name())} (HP: ${actor.hp}/${actor.mhp})
            </div>`).join('');
        return `
            <div id="menu-search-detail" class="search-detail">
                <div class="target-overlay">
                    <h3 class="target-title">${title}</h3>
                    <div class="inspect-actions">
                        ${rows}
                        <div class="inspect-btn focusable target-cancel" onclick="window.MenuSearch.cancelPending()">${T('Inventory.ui.cancel')}</div>
                    </div>
                </div>
            </div>`;
    }

    function actionBtn(action, label, danger) {
        return `<div class="inspect-btn${danger ? ' inspect-btn--danger' : ''}" onclick="window.MenuSearch.act('${action}')">${label}</div>`;
    }

    // A weapon is a model, not a picture, so the card carries the same viewport
    // the equip screen does (window.Weapon3DPreview mounts into it).
    function weaponViewportHTML(item) {
        if (!item || !DataManager.isWeapon(item) || typeof THREE === 'undefined') return '';
        return `<div class="search-weapon-viewport"><canvas id="menu-search-weapon-canvas"></canvas></div>`;
    }

    // ---- item / equipment / craftable ---------------------------------------
    function itemDetailHTML(row) {
        const item = row.item;
        let actions = '';

        if (row.kind === 'item') {
            const useable = item.occasion === 0 || item.occasion === 2;
            if (useable) actions += actionBtn('use', T('Inventory.ui.useItem'));
            if (DataManager.isWeapon(item) || DataManager.isArmor(item)) {
                actions += actionBtn('equip', T('Inventory.ui.equip'));
            }
        } else if (row.kind === 'equip') {
            actions += actionBtn('unequip', T('MainMenu.search.action.unequip'));
        } else if (row.kind === 'craft') {
            // Making the thing is the bench's business: it decides the botch
            // roll and what a teardown gives back, and none of that is worth a
            // second, quietly different copy here.
            actions += actionBtn('openBench', T('MainMenu.search.action.openBench'));
        }

        return window.ItemInspect.build(item, {
            canvasId:    'menu-search-inspect-canvas',
            extraHTML:   weaponViewportHTML(item),
            actionsHTML: actions
        });
    }

    // ---- skill ---------------------------------------------------------------
    // The whole card comes from the Skills scene's own builder; only the
    // subtitle and the button differ, because here the row already knows WHICH
    // companion the skill was found on.
    function skillDetailHTML(row) {
        const skill = row.skill;
        const actor = row.actor;
        const canUse = actor.isOccasionOk(skill);
        const actions = canUse
            ? `<div class="inspect-btn${actor.canUse(skill) ? '' : ' unusable'}" onclick="window.MenuSearch.act('use')">${T('SkillsMenu.action.useSkill')}</div>`
            : '';

        return window.SkillDetails.card(skill, actor, {
            canvasId:    'menu-search-inspect-canvas',
            subtitle:    `${window.SkillDetails.typeLabelOf(skill)} · ${actor.name()}`,
            actionsHTML: actions
        });
    }

    // ---- creature ------------------------------------------------------------
    function enemyDetailHTML(row) {
        const mon = row.mon;
        const enemy = mon.enemy || {};
        const note = mon.noteData || {};
        const params = enemy.params || [];
        const paramLabels = ['HP', 'MP', 'STR', 'CON', 'INT', 'WIS', 'DEX', 'PSI'];

        const specRow = (label, value) => value === null || value === undefined || value === '' ? '' : `
            <div class="inspect-spec-row">
                <span class="inspect-spec-label">${escapeHtml(label)}:</span>
                <span class="inspect-spec-value inspect-spec-value--wrap">${escapeHtml(String(value))}</span>
            </div>`;

        const statRows = paramLabels.map((label, i) => specRow(label, params[i])).join('');
        const ecology =
            specRow(T('MainMenu.search.enemy.archetype'), note.archetype) +
            specRow(T('MainMenu.search.enemy.biome'), note.biome) +
            specRow(T('MainMenu.search.enemy.behavior'), note.behavior) +
            specRow(T('MainMenu.search.enemy.activity'), note.timeOfDay) +
            specRow(T('MainMenu.search.enemy.weight'), note.weight) +
            specRow(T('MainMenu.search.enemy.speed'), note.speed);

        const sprite = mon.character
            ? `<canvas id="menu-search-enemy-canvas" class="inspect-creature-canvas" width="48" height="48"></canvas>`
            : '';

        // Two columns of label/value pairs under each heading, the character
        // sheet's fact grid: the answer sits beside its question instead of a
        // page away from it. The grid is the card's own, not the backpack's
        // ".inspect-pockets" one, so the creature reads the same wherever the
        // panel is shown.
        return `
            <div class="item-inspect">
                <div class="inspect-header">
                    <div class="inspect-frame">${sprite}</div>
                    <div class="inspect-title-box">
                        <h3 class="inspect-name">${escapeHtml(mon.name)}</h3>
                        <div class="inspect-rarity inspect-rarity--category">${escapeHtml(row.category)}${note.level ? ` · ${T('MainMenu.roster.levelAbbr')} ${escapeHtml(note.level)}` : ''}</div>
                    </div>
                </div>
                <div class="inspect-lore">
                    ${note.description ? `<div class="inspect-flavour">${escapeHtml(note.description)}</div>` : ''}
                    <div class="inspect-section-title">${T('MainMenu.search.enemy.stats')}</div>
                    <div class="inspect-spec-grid">${statRows}</div>
                    ${ecology ? `<div class="inspect-section-title">${T('MainMenu.search.enemy.ecology')}</div><div class="inspect-spec-grid">${ecology}</div>` : ''}
                </div>
            </div>`;
    }

    function unavailableHTML(what) {
        return `
            <div class="item-inspect item-inspect--empty">
                <p class="inspect-placeholder-text">${T('MainMenu.search.noPanel', { what: escapeHtml(what) })}</p>
            </div>`;
    }

    function detailHTML() {
        const row = currentRow();
        if (!row) {
            return `
                <div class="item-inspect item-inspect--empty">
                    <h3 class="title">${T('MainMenu.search.detailTitle')}</h3>
                    <p class="inspect-placeholder-text">${T('MainMenu.search.detailHint')}</p>
                </div>`;
        }
        if (row.kind === 'skill') {
            return window.SkillDetails ? skillDetailHTML(row) : unavailableHTML('SkillDetails');
        }
        if (row.kind === 'enemy') return enemyDetailHTML(row);
        return window.ItemInspect ? itemDetailHTML(row) : unavailableHTML('ItemInspect');
    }

    // =========================================================================
    // Canvas painting (icons, creature sprites, 3D weapon)
    // =========================================================================

    function drawCreatureSprite(charName, canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas || !charName) return;
        const bitmap = ImageManager.loadCharacter('Monsters/' + charName);
        bitmap.addLoadListener(() => {
            if (!canvas.isConnected) return;
            const ctx = canvas.getContext('2d');
            if (!ctx || !bitmap.width) return;
            const single = charName.startsWith('$');
            const pw = single ? bitmap.width / 3 : bitmap.width / 12;
            const ph = single ? bitmap.height / 4 : bitmap.height / 8;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.imageSmoothingEnabled = false;
            const scale = Math.min(canvas.width / pw, canvas.height / ph);
            const dw = pw * scale;
            const dh = ph * scale;
            ctx.drawImage(bitmap.canvas, pw, 0, pw, ph,
                (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
        });
    }

    // Paint every canvas the two pages just asked for, and raise the 3D weapon
    // if the selected row is one. Called after every render and every patch.
    function mountVisuals() {
        disposePreviews();
        mountResults();

        const row = currentRow();
        if (!row) return;

        if (row.kind === 'enemy') {
            drawCreatureSprite(row.mon.character, 'menu-search-enemy-canvas');
            return;
        }
        if (window.ItemInspect) window.ItemInspect.drawIcon(row.iconIndex, 'menu-search-inspect-canvas');

        // A viewport is a fresh WebGL context and a weapon built from scratch by
        // the procedural pipeline. Walking the results with a held key would ask
        // for one per row passed over, and the browser force-loses the game's
        // own context once the cap of live ones is passed, so the piece is only
        // put on the stand once the cursor comes to rest.
        if (row.item && DataManager.isWeapon(row.item) && window.Weapon3DPreview) {
            previewTimer = setTimeout(() => {
                previewTimer = 0;
                const canvas = document.getElementById('menu-search-weapon-canvas');
                if (!canvas) return;
                const entry = window.Weapon3DPreview.mount(canvas, row.item);
                if (entry) previews.push(entry);
            }, PREVIEW_SETTLE_MS);
        }
    }

    // =========================================================================
    // Refresh
    // =========================================================================

    // Empty the field and everything derived from it. The query lives on the
    // shared strip, so it is reset there and not in two places.
    function resetSearch() {
        const b = ensureBar();
        // Quietly: the callers below are already about to redraw, and a reset
        // that called back into them would refresh the page twice over.
        // Leaving the search behind puts its field away too: the pockets get
        // the handle back, exactly as they wore it before anything was typed.
        if (b) { b.resetQuiet(); b.collapseField(); }
        state.pending = null;
        state.selected = 0;
        state.resultsKey = '';
        state.wasActive = false;
        state.opened = false;
        state.justOpened = false;
    }

    // The search field, when it is the thing holding the keyboard.
    function fieldHasFocus() {
        const b = ensureBar();
        const el = document.activeElement;
        return !!b && !!el && el.id === 'msb-input-' + b.id;
    }

    function scene() {
        const s = SceneManager._scene;
        return (s && s.refreshUIMenuDOM) ? s : null;
    }

    // Rebuild both pages through the menu itself. Used whenever the page's shape
    // changes (search opened or closed, a different result picked, a filter
    // moved), so the menu's focus navigator is re-bound with the new tiles.
    // `keepFocus` puts the caret back in the field afterwards, which is what
    // every change made FROM the search page wants: the field stays hot, so
    // arrows keep walking the results without a second click.
    function fullRefresh(keepFocus) {
        if (keepFocus) state.focusInput = true;
        const s = scene();
        if (s) s.refreshUIMenuDOM(false);
    }

    // Rebuild only the parts a keystroke changed, leaving whichever field is
    // being typed into (and so its caret) exactly where it is. The filter strip
    // is only redrawn when the change can have altered it: rebuilding it while
    // a range field is being typed into would tear that field out mid-digit.
    function patchRefresh(rebuildFilters) {
        const results = document.getElementById('menu-search-results');
        const detail = document.getElementById('menu-search-detail');
        const filters = document.getElementById('menu-search-filters');
        if (!results || !detail || !filters) { fullRefresh(); return; }

        gather();
        disposePreviews();
        if (rebuildFilters) filters.innerHTML = ensureBar() ? ensureBar().filtersHTML() : '';
        detail.innerHTML = detailHTML();
        // The results list is repainted inside mountVisuals: it is a window onto
        // the rows now, not a wall of markup (UI/MenuVirtualList.js).
        mountVisuals();
    }

    // Put the caret back in the search field after a patch that replaced part
    // of the page around it (the field itself survives, but a click elsewhere or
    // a re-render can take the focus with it).
    function restoreCaret() {
        const b = ensureBar();
        if (b) b.restoreFocus();
    }

    // By index: the selected row exists in the DOM only while the window is
    // over it (UI/MenuVirtualList.js).
    function scrollSelectedIntoView() {
        const list = document.getElementById('menu-search-results');
        if (list) window.MenuVirtualList.scrollToIndex(list, state.selected);
    }

    // =========================================================================
    // Actions
    // =========================================================================

    // Engine scopes: 7 and 9 name one ally (living / fallen), 8 and 10 name the
    // whole party, 11 names the user. Only the first pair has a choice to make,
    // so only the first pair opens the picker.
    const asksForOneAlly = (obj) => obj.scope === 7 || obj.scope === 9;
    const hitsWholeParty = (obj) => obj.scope === 8 || obj.scope === 10;

    // Who a use with no picker actually lands on.
    function defaultTargets(obj, user) {
        if (hitsWholeParty(obj)) return $gameParty.members();
        if (obj.scope === 11) return [user];
        return [];   // no scope, or an enemy it cannot reach outside a fight
    }

    // A common-event effect reserves an event only the map interpreter runs, so
    // the menu has to get out of the way for it to play out at all.
    const callsCommonEvent = (obj) => !!(obj.effects && obj.effects.some(e => e.code === 44));

    function finishUse(obj) {
        if (callsCommonEvent(obj)) {
            const s = scene();
            if (s) s.popScene();
            return;
        }
        state.resultsKey = '';
        fullRefresh(true);
    }

    function useItemOn(item, targets) {
        const user = $gameParty.leader();
        const action = new Game_Action(user);
        action.setItemObject(item);
        SoundManager.playUseItem();
        (targets && targets.length ? targets : defaultTargets(item, user))
            .forEach(target => action.apply(target));
        action.applyGlobal();
        $gameParty.consumeItem(item);
        finishUse(item);
    }

    function useSkillOn(skill, caster, targets) {
        if (!caster.canUse(skill)) { SoundManager.playBuzzer(); return; }
        SoundManager.playOk();
        const action = new Game_Action(caster);
        action.setItemObject(skill);
        (targets && targets.length ? targets : defaultTargets(skill, caster))
            .forEach(target => action.apply(target));
        action.applyGlobal();
        caster.useItem(skill);
        finishUse(skill);
    }

    // Put a carried piece on somebody. A member who cannot wear it says so
    // rather than quietly doing nothing.
    function equipOn(item, actor) {
        if (!actor.canEquip(item)) {
            SoundManager.playBuzzer();
            if (window.ParchmentToast) {
                window.ParchmentToast.show(T('MainMenu.search.cannotEquip', { name: actor.name() }),
                    { severity: 'warning', duration: 200 });
            }
            return;
        }
        // Hands take weapons and shields alike, so an equip type no longer
        // names one slot (window.HandSlots).
        let slot = window.HandSlots ? window.HandSlots.emptySlotFor(actor, item) : -1;
        if (slot < 0) {
            const slots = actor.equipSlots();
            slot = window.HandSlots
                ? slots.findIndex((e, i) => window.HandSlots.slotFits(actor, i, item) && actor.isEquipChangeOk(i))
                : slots.indexOf(DataManager.isWeapon(item) ? 1 : item.etypeId);
        }
        if (slot < 0) { SoundManager.playBuzzer(); return; }
        SoundManager.playEquip();
        actor.changeEquip(slot, item);
        state.resultsKey = '';
        fullRefresh(true);
    }

    // =========================================================================
    // Public interface (also the target of every inline handler above)
    // =========================================================================

    window.MenuSearch = {

        isActive() {
            const b = ensureBar();
            return !!b && (state.opened || b.query.trim().length > 0);
        },

        // True while the page is open with the caret somewhere else, which is
        // when the results answer to the arrow keys rather than to the field.
        isBrowsing() {
            if (!this.isActive()) return false;
            return !(window.MenuSearchBar && window.MenuSearchBar.isTyping());
        },

        // Part of the menu's left-page cache key, so any change here redraws.
        stateKey() {
            if (!this.isActive()) return '';
            const b = ensureBar();
            return [
                b.query, b.kind, b.sortKey, b.sortDir, b.category,
                state.selected, state.pending ? state.pending.action : ''
            ].join('|');
        },

        // ---- markup ---------------------------------------------------------

        // The field at the head of the pockets, before anything has been typed.
        // Only the field: sort keys and range boxes have nothing to narrow while
        // the page below them is a list of commands, so they arrive with the
        // results (see leftPageHTML).
        barHTML() {
            const b = ensureBar();
            return b ? b.fieldHTML() : '';
        },

        // The results page: header, then the whole strip (field and filters
        // together, exactly as every other list menu mounts it), then the rows.
        leftPageHTML() {
            const rows = gather();
            const b = ensureBar();
            return `
                <div class="tools-pockets menu-search-page">
                    <div class="page-header-bar">
                        <div class="back-button" onclick="window.MenuSearch.clear()">${T('MainMenu.dynamics.back')}</div>
                        <h2 class="tools-title">${T('MainMenu.search.title', { count: rows.length })}</h2>
                    </div>
                    ${b ? b.fieldHTML() : ''}
                    <div id="menu-search-filters">${b ? b.filtersHTML() : ''}</div>
                    <div class="backpack-grid" id="menu-search-results"></div>
                </div>`;
        },

        rightPageHTML() {
            gather();
            if (state.pending) {
                const pendingRow = state.pending.row || {};
                const pendingObj = pendingRow.kind === 'skill' ? pendingRow.skill : pendingRow.item;
                const title = state.pending.action === 'equip'
                    ? T('MainMenu.search.pickWearer')
                    : T('Inventory.ui.useItemOn', { item: pendingObj ? pendingObj.name : '' });
                return targetPickerHTML(title);
            }
            return `<div id="menu-search-detail" class="search-detail">${detailHTML()}</div>`;
        },

        // ---- lifecycle ------------------------------------------------------

        afterRender() {
            // While a search is live the spread wears the backpack's own class,
            // so the results list and the inspect card are laid out and inked by
            // exactly the same rules the backpack uses (css/theme.css,
            // ".inspect-pockets"). Same page, drawn twice, never two pages.
            const spread = document.querySelector('#menu-container .book-spread');
            if (spread) spread.classList.toggle('inspect-pockets', this.isActive());

            if (this.isActive()) mountVisuals();

            if (state.focusInput) {
                state.focusInput = false;
                restoreCaret();
            }
        },

        // Dropping the query hands both pages back to the ordinary menu.
        clear() {
            SoundManager.playCancel();
            resetSearch();
            disposePreviews();
            const spread = document.querySelector('#menu-container .book-spread');
            if (spread) spread.classList.remove('inspect-pockets');
            fullRefresh();
        },

        // The pockets' "Search" tile (UI/CustomMainMenuLayout.js). It opens the
        // results page on everything the party has, unfiltered, and leaves the
        // caret alone: the page itself is the answer to "what have we got", and
        // the arrow keys walk it (see updateBrowseInput). Handing the tile's
        // click straight to the field instead only ever moved a caret the player
        // could not see, and looked like the tile did nothing at all.
        open() {
            const b = ensureBar();
            if (!b) return;
            SoundManager.playOk();
            // The tile IS the handle here: the page it opens arrives with the
            // field already unfolded, whatever the handle was showing.
            b.openField();
            state.opened = true;
            state.selected = 0;
            state.pending = null;
            state.wasActive = true;
            state.resultsKey = '';
            // The keypress that clicked the tile is still triggered this frame,
            // and the menu's navigator ran before this call: without the skip it
            // would arrive at the fresh list as "run the first row".
            state.justOpened = true;
            fullRefresh(false);
        },

        // Kept for anything that really does want the caret (and for saves of
        // this menu wired to the old name).
        focus() {
            const b = ensureBar();
            if (!b) return;
            b.openField();
            state.opened = true;
            state.focusInput = true;
            fullRefresh(true);
        },

        // Called from Scene_Menu#terminate: the viewport's WebGL context has to
        // go with the page, or the browser force-loses the game's own canvas.
        dispose() {
            disposePreviews();
            state.pending = null;
        },

        // ---- input ----------------------------------------------------------

        // Called by the shared strip whenever anything on it moves: the query,
        // a kind chip, a sort key, the category picker or a range field.
        onBarChanged() {
            const wasActive = state.wasActive;
            state.selected = 0;
            state.pending = null;
            state.wasActive = this.isActive();

            // Opening or closing the search swaps whole pages, so it has to go
            // through the menu; anything else only patches the results.
            if (wasActive !== state.wasActive) fullRefresh(true);
            else if (state.wasActive) patchRefresh(true);
        },

        // Up / Down walk the results and Enter runs the highlighted row's first
        // action, all while the caret stays in the field. The strip stops every
        // other key itself, so the menu's hotkeys never see the typing.
        onKey(event) {
            const rows = state.results;
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                if (!rows.length) return;
                event.preventDefault();
                event.stopPropagation();
                const step = event.key === 'ArrowDown' ? 1 : -1;
                const max = rows.length;
                state.selected = (state.selected + step + max) % max;
                SoundManager.playCursor();
                patchRefresh(false);
                scrollSelectedIntoView();
                restoreCaret();
            } else if (event.key === 'Enter') {
                event.preventDefault();
                event.stopPropagation();
                this.runRow();
            }
        },

        // Whatever the selected row's card offers first, which is the thing the
        // player came to the row for: use it, or wear it. Enter in the field and
        // the OK button while browsing both land here.
        runRow() {
            const row = currentRow();
            if (!row) return;
            if (row.kind === 'skill') this.act('use');
            else if (row.kind === 'item') this.act(row.item.occasion === 0 || row.item.occasion === 2 ? 'use' : 'equip');
            else if (row.kind === 'equip') this.act('unequip');
            else if (row.kind === 'craft') this.act('openBench');
        },

        // The page opened from the tile has no focused field to answer the
        // keyboard, and its rows are deliberately not menu tiles (the field owns
        // them the moment anything is typed), so the arrows are read here. The
        // menu's own navigator finds nothing focusable on this page, so the two
        // never fight over a keypress; cancel stays its business, and closes the
        // search through backOutOneLevel.
        // Choosing WHO a thing lands on. The picker used to be the one part of
        // this page with no keyboard at all: browsing bailed out the moment a
        // pick was pending, so the party chips could only be clicked.
        updatePendingInput() {
            if (!state.opened || !state.pending) return;
            const members = $gameParty.members();
            if (!members.length) return;
            if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
                this.cancelPending();
                return;
            }
            let step = 0;
            if (Input.isTriggered('down') || Input.isRepeated('down')) step = 1;
            else if (Input.isTriggered('up') || Input.isRepeated('up')) step = -1;
            if (step) {
                state.pendingIndex = (state.pendingIndex + step + members.length) % members.length;
                SoundManager.playCursor();
                fullRefresh();
                return;
            }
            if (Input.isTriggered('ok')) this.applyTarget(state.pendingIndex);
        },

        updateBrowseInput() {
            if (state.pending) { this.updatePendingInput(); return; }
            if (!state.opened || !this.isBrowsing()) return;
            if (state.justOpened) { state.justOpened = false; return; }
            const rows = state.results;
            if (!rows.length) return;
            const max = rows.length;
            let step = 0;
            if (Input.isTriggered('down') || Input.isRepeated('down')) step = 1;
            else if (Input.isTriggered('up') || Input.isRepeated('up')) step = -1;
            if (step) {
                state.selected = (state.selected + step + max) % max;
                SoundManager.playCursor();
                patchRefresh(false);
                scrollSelectedIntoView();
                return;
            }
            if (Input.isTriggered('ok')) this.runRow();
        },

        // ---- results --------------------------------------------------------

        select(index) {
            if (index === state.selected) return;
            SoundManager.playCursor();
            state.selected = index;
            // The caret goes back only where it already was: a player browsing
            // the open page with the mouse or a pad never asked to type.
            fullRefresh(fieldHasFocus());
        },

        act(action) {
            const row = currentRow();
            if (!row) return;

            if (action === 'use') {
                const obj = row.kind === 'skill' ? row.skill : row.item;
                if (!obj) return;
                // Only a thing aimed at ONE ally has a choice to make; the
                // party-wide and self-cast scopes simply land where they land.
                if (asksForOneAlly(obj)) {
                    SoundManager.playOk();
                    state.pending = { action: 'use', row: row };
                    state.pendingIndex = 0;
                    fullRefresh();
                    return;
                }
                if (row.kind === 'skill') useSkillOn(row.skill, row.actor, null);
                else useItemOn(row.item, null);
                return;
            }

            if (action === 'equip') {
                SoundManager.playOk();
                state.pending = { action: 'equip', row: row };
                    state.pendingIndex = 0;
                fullRefresh();
                return;
            }

            if (action === 'unequip') {
                SoundManager.playEquip();
                row.actor.changeEquip(row.slotIndex, null);
                state.resultsKey = '';
                fullRefresh(true);
                return;
            }

            if (action === 'openBench') {
                // Armor is the forge's alone; everything else is the workbench's.
                const forgeOnly = DataManager.isArmor(row.item);
                const target = forgeOnly ? window.Scene_Blacksmithing : window.Scene_Thinker;
                if (!target) { SoundManager.playBuzzer(); return; }
                SoundManager.playOk();
                SceneManager.push(target);
            }
        },

        applyTarget(index) {
            const pending = state.pending;
            if (!pending) return;
            const actor = $gameParty.members()[index];
            if (!actor) return;
            state.pending = null;

            if (pending.action === 'equip') equipOn(pending.row.item, actor);
            else if (pending.row.kind === 'skill') useSkillOn(pending.row.skill, pending.row.actor, [actor]);
            else useItemOn(pending.row.item, [actor]);
        },

        cancelPending() {
            SoundManager.playCancel();
            state.pending = null;
            fullRefresh();
        }
    };

    // =========================================================================
    // Scene wiring
    // =========================================================================

    // The query is a question about the moment, not a setting: every fresh visit
    // to the menu opens on the party cards.
    const _Scene_Menu_create = Scene_Menu.prototype.create;
    Scene_Menu.prototype.create = function () {
        resetSearch();
        state.focusInput = false;
        _Scene_Menu_create.call(this);
    };

    const _Scene_Menu_terminate = Scene_Menu.prototype.terminate;
    Scene_Menu.prototype.terminate = function () {
        window.MenuSearch.dispose();
        _Scene_Menu_terminate.call(this);
    };

    // Runs after the menu's own navigator (this plugin loads after the layout),
    // which on the results page has no tiles to move and so leaves the keys to
    // the list.
    const _Scene_Menu_update = Scene_Menu.prototype.update;
    Scene_Menu.prototype.update = function () {
        _Scene_Menu_update.call(this);
        window.MenuSearch.updateBrowseInput();
    };

    // =========================================================================
    // Styles
    // =========================================================================
    // Only what the shared classes do not already cover: the results page frame
    // and the 3D weapon viewport on the detail card. The field, the clear button and every filter
    // control are the shared strip's own (UI/MenuSearchBar.js). Colours come
    // from the theme tokens so every theme inks these the way it inks the pages
    // around them.
})();
