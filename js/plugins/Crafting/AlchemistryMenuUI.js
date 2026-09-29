/*:
 * @target MZ
 * @plugindesc Alchemistry Menu UI v3.0, DOM overlay (book-spread) for AlchemistryMenu
 * @author Omni-Lex
 * @help AlchemistryMenuUI.js
 *
 * DOM layer for Scene_Alchemistry. Must be listed AFTER AlchemistryMenu.js
 * in the Plugin Manager.
 *
 * NOTHING IS EVER REDRAWN
 * -----------------------
 * The spread is built ONCE on mount and from then on it is only ever patched:
 * every update writes textContent, toggles a class or shows/hides an element,
 * and every list reuses the rows it already has (`syncRows` trims or extends
 * the pool and fills the survivors in place). No element that stays on screen
 * is ever destroyed and rebuilt, so the page never flickers, never loses its
 * scroll position and never drops the focus ring, which is what the old
 * innerHTML-per-keypress rendering did on every cursor move.
 *
 * Layout:
 *  - Left page  : Ready / Missing / Benches tabs over one list
 *  - Right page : the party switcher, then the dossier for whatever is picked
 *  - Modals     : action picker, reagent picker, bench picker
 */

(function () {
    'use strict';

    if (!window.Scene_Alchemistry) {
        throw new Error('AlchemistryMenuUI.js requires AlchemistryMenu.js to be loaded first!');
    }

    const ACTIONS = window.AlchemistryActions;
    const A = window.Alchemistry;
    // Named so it does not shadow the global i18n resolver.
    const alch = () => window.AlchemistryI18n();
    const tn = (str) => (window.translateText ? window.translateText(str) : str);

    const TAB_READY = 0, TAB_MISSING = 1, TAB_BENCH = 2;
    const COLS = 2;

    // =========================================================================
    // DOM pooling helpers, the whole reason nothing here redraws
    // =========================================================================

    // Bring `host` to exactly `count` children, reusing what is already there.
    // `make()` builds one row; it is called only for rows that do not exist yet.
    function syncRows(host, count, make) {
        while (host.children.length > count) host.removeChild(host.lastElementChild);
        while (host.children.length < count) host.appendChild(make());
        return host.children;
    }

    function el(tag, className, parent) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (parent) parent.appendChild(node);
        return node;
    }

    // Write only when it changed: an unchanged assignment still dirties the
    // node in some engines, and this keeps the per-frame clock update free.
    function setText(node, text) {
        const value = text == null ? '' : String(text);
        if (node.textContent !== value) node.textContent = value;
    }

    function setShown(node, shown) {
        const value = shown ? '' : 'none';
        if (node.style.display !== value) node.style.display = value;
    }

    // =========================================================================
    // create / terminate
    // =========================================================================

    const _Scene_Alchemistry_create = Scene_Alchemistry.prototype.create;
    Scene_Alchemistry.prototype.create = function () {
        _Scene_Alchemistry_create.call(this);

        // WASD state
        this._wasdInput      = { up: false, down: false, left: false, right: false };
        this._wasdHeld       = { up: false, down: false, left: false, right: false };
        this._wasdHoldFrames = { up: 0,     down: 0,     left: 0,     right: 0     };

        this._wasdListener = (event) => {
            if (event.repeat) return;
            const key = event.key.toLowerCase();
            if (key === 'w') { this._wasdInput.up    = true; this._wasdHeld.up    = true; event.preventDefault(); }
            if (key === 's') { this._wasdInput.down  = true; this._wasdHeld.down  = true; event.preventDefault(); }
            if (key === 'a') { this._wasdInput.left  = true; this._wasdHeld.left  = true; event.preventDefault(); }
            if (key === 'd') { this._wasdInput.right = true; this._wasdHeld.right = true; event.preventDefault(); }
        };
        this._wasdUpListener = (event) => {
            const key = event.key.toLowerCase();
            if (key === 'w') { this._wasdHeld.up    = false; this._wasdHoldFrames.up    = 0; }
            if (key === 's') { this._wasdHeld.down  = false; this._wasdHoldFrames.down  = 0; }
            if (key === 'a') { this._wasdHeld.left  = false; this._wasdHoldFrames.left  = 0; }
            if (key === 'd') { this._wasdHeld.right = false; this._wasdHoldFrames.right = 0; }
        };
        window.addEventListener('keydown', this._wasdListener);
        window.addEventListener('keyup',   this._wasdUpListener);

        // Navigation state
        this._tab            = TAB_READY;
        this._area           = 'list';   // 'tabs' | 'list' | 'actions'
        this._listIndex      = 0;
        this._actionIndex    = 0;
        this._alchemistIndex = 0;
        this._statusMessage  = '';

        // Modal state ('action' | 'item' | 'slot' | null)
        this._modalMode          = null;
        this._modalSelectedIndex = 0;
        this._modalItems         = [];
        this._pendingAction      = null;
        this._pendingRecipeId    = null;

        // What the last patch was drawn against, so the per-frame sweep can
        // tell a real change (a bench finished, a reagent was spent) from
        // nothing having happened at all.
        this._signature = '';

        this.buildAlchemistryDOM();
        this.syncAll();

        if (window.CharSwitcher) {
            window.CharSwitcher.installTabKey(this, (dir) => this.cycleAlchemist(dir));
        }
        UIAlchemistryInputManager.activate(this);

        setTimeout(() => {
            if (this._alcContainer) this._alcContainer.style.opacity = '1';
        }, 16);
    };

    Scene_Alchemistry.prototype.update = function () {
        Scene_MenuBase.prototype.update.call(this);
        UIAlchemistryInputManager.update();
        this.updateLiveReadouts();
    };

    Scene_Alchemistry.prototype.terminate = function () {
        if (this._wasdListener) {
            window.removeEventListener('keydown', this._wasdListener);
            window.removeEventListener('keyup',   this._wasdUpListener);
            this._wasdListener   = null;
            this._wasdUpListener = null;
        }
        if (window.CharSwitcher) window.CharSwitcher.removeTabKey(this);
        if (window.SpecBadge) window.SpecBadge.hide();

        UIAlchemistryInputManager.deactivate();

        if (this._alcContainer) {
            const container = this._alcContainer;
            container.style.transition    = 'opacity 0.2s ease-out';
            container.style.opacity       = '0';
            container.style.pointerEvents = 'none';
            setTimeout(() => {
                if (container && container.parentNode) container.parentNode.removeChild(container);
            }, 200);
            this._alcContainer = null;
            this._el = null;
        }

        Scene_MenuBase.prototype.terminate.call(this);
    };

    // =========================================================================
    // Build once
    // =========================================================================

    Scene_Alchemistry.prototype.buildAlchemistryDOM = function () {
        const t = alch();

        const container = document.createElement('div');
        container.id = 'menu-container';
        container.style.opacity    = '0';
        container.style.transition = 'opacity 0.22s ease-out';
        document.body.appendChild(container);
        this._alcContainer = container;

        const spread = el('div', 'book-spread', container);

        // ---- left page ------------------------------------------------------
        const left = el('div', 'left-page', spread);
        const header = el('div', 'page-header-bar', left);
        const back = el('div', 'back-button', header);
        setText(back, t.back);
        back.addEventListener('click', () => this.onAlchemistryCancel());
        const title = el('h2', 'title', header);
        setText(title, t.title);

        const tabsRow = el('div', 'backpack-tabs', left);
        tabsRow.id = 'alc-tabs';
        const tabNodes = [t.tabReady, t.tabMissing, t.tabBenches].map((label, idx) => {
            const node = el('div', 'backpack-tab', tabsRow);
            setText(node, label);
            node.addEventListener('click', () => this.selectTab(idx));
            return node;
        });

        const grid = el('div', 'backpack-grid', left);
        grid.id = 'alchemistry-grid';

        // ---- right page -----------------------------------------------------
        const right = el('div', 'right-page', spread);
        const companionRow = el('div', 'companion-switcher companion-switcher--header', right);
        companionRow.id = 'alc-companion-row';

        const inspect = el('div', 'item-inspect', right);

        const inspectHeader = el('div', 'inspect-header', inspect);
        const frame = el('div', 'inspect-frame', inspectHeader);
        const canvas = document.createElement('canvas');
        canvas.id = 'alc-inspect-canvas';
        canvas.width = 32; canvas.height = 32;
        canvas.className = 'inspect-canvas';
        frame.appendChild(canvas);
        const titleBox = el('div', 'inspect-title-box', inspectHeader);
        const nameNode = el('h3', 'inspect-name', titleBox);
        const formulaNode = el('div', 'inspect-rarity', titleBox);
        formulaNode.style.color = 'var(--border-focus-hover)';

        const lore = el('div', 'inspect-lore', inspect);

        const reagentTitle = el('div', 'inspect-section-title', lore);
        setText(reagentTitle, t.requiredReagents);
        const reagentList = el('div', '', lore);

        const skillTitle = el('div', 'inspect-section-title', lore);
        setText(skillTitle, t.requiredSkills);
        const skillList = el('div', '', lore);

        const oddsList = el('div', '', lore);

        const stepTitle = el('div', 'inspect-section-title', lore);
        setText(stepTitle, t.steps);
        const stepList = el('div', '', lore);

        const actions = el('div', 'inspect-actions', inspect);
        const status = el('div', 'inspect-placeholder-text', inspect);
        status.style.margin = '6px 0 0';
        status.style.color = 'var(--text-primary-hover)';

        // ---- modal layer ----------------------------------------------------
        const modalLayer = el('div', 'army-dialog-overlay', container);
        modalLayer.id = 'alc-modal';
        const modalBox = el('div', 'target-overlay', modalLayer);
        modalBox.style.minWidth = '320px';
        modalBox.style.maxHeight = '70%';
        modalBox.style.overflowY = 'auto';
        const modalTitle = el('h3', 'target-title', modalBox);
        const modalOptions = el('div', 'inspect-actions', modalBox);
        const modalCancel = el('div', 'target-option', modalBox);
        modalCancel.style.marginTop = '10px';
        setText(modalCancel, t.cancel);
        modalCancel.addEventListener('click', () => { SoundManager.playCancel(); this.closeModal(); });
        setShown(modalLayer, false);

        this._el = {
            spread, tabsRow, tabNodes, grid,
            companionRow, canvas, nameNode, formulaNode,
            reagentTitle, reagentList, skillTitle, skillList, oddsList,
            stepTitle, stepList, actions, status,
            modalLayer, modalTitle, modalOptions
        };
        this._actionsList = [];

        // Right-click / wheel behave as they did.
        this._rightClickStartedHere = false;
        container.addEventListener('mousedown', (event) => {
            if (event.button === 2) { this._rightClickStartedHere = true; event.stopPropagation(); }
        });
        container.addEventListener('mouseup', (event) => {
            if (event.button === 2) event.stopPropagation();
        });
        container.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!this._rightClickStartedHere) return;
            this._rightClickStartedHere = false;
            const scene = SceneManager._scene;
            if (scene && scene.isActive()) UIAlchemistryInputManager.handleCancel();
        });
        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            const under = e.target && e.target.closest ? e.target.closest('.backpack-grid, .inspect-lore') : null;
            (under || grid).scrollTop += e.deltaY;
        }, { passive: false });
    };

    // =========================================================================
    // What is on screen
    // =========================================================================

    Scene_Alchemistry.prototype.alchemistMembers = function () {
        return ($gameParty && $gameParty.members) ? $gameParty.members() : [];
    };

    Scene_Alchemistry.prototype.alchemist = function () {
        const members = this.alchemistMembers();
        if (!members.length) return null;
        return members[Math.max(0, Math.min(members.length - 1, this._alchemistIndex || 0))];
    };

    Scene_Alchemistry.prototype.selectAlchemist = function (index) {
        const members = this.alchemistMembers();
        if (!members.length) return;
        const next = ((index % members.length) + members.length) % members.length;
        if (next === this._alchemistIndex) return;
        this._alchemistIndex = next;
        SoundManager.playCursor();
        // Another pair of hands changes every odds line on the page, and the
        // bench they are standing at answers to them from now on.
        const entry = this.currentEntry();
        if (entry && entry.kind === 'project' && !A.isRunning(entry.project)) {
            const actor = this.alchemist();
            entry.project.actorId = actor ? actor.actorId() : null;
        }
        this.syncAll();
    };

    Scene_Alchemistry.prototype.cycleAlchemist = function (dir) {
        this.selectAlchemist((this._alchemistIndex || 0) + dir);
    };

    // The list the open tab shows. Recipes are alphabetical, and the ones the
    // pack can actually pay for are a tab of their own so the readable list is
    // the one you can act on.
    Scene_Alchemistry.prototype.entries = function () {
        if (this._tab === TAB_BENCH) {
            return A.projects().map((project, slot) => ({ kind: 'project', project, slot }));
        }
        const wantReady = this._tab === TAB_READY;
        const list = A.recipes().filter(r => A.hasReagents(r) === wantReady);
        return A.sorted(list).map(recipe => ({ kind: 'recipe', recipe }));
    };

    Scene_Alchemistry.prototype.currentEntry = function () {
        const list = this.entries();
        if (!list.length) return null;
        return list[Math.max(0, Math.min(list.length - 1, this._listIndex))] || null;
    };

    // The recipe behind whatever is selected: a bench reports the recipe it was
    // copied from, so its skill check and its odds read the same as the book's.
    Scene_Alchemistry.prototype.currentRecipe = function () {
        const entry = this.currentEntry();
        if (!entry) return null;
        if (entry.kind === 'recipe') return entry.recipe;
        return entry.project.recipeId ? A.recipeById(entry.project.recipeId) : null;
    };

    // =========================================================================
    // Patch in place
    // =========================================================================

    Scene_Alchemistry.prototype.syncAll = function () {
        if (!this._el) return;
        const list = this.entries();
        if (this._listIndex >= list.length) this._listIndex = Math.max(0, list.length - 1);
        this.syncTabs();
        this.syncSwitcher();
        this.syncList(list);
        this.syncInspect();
        this._signature = this.stateSignature();

        if (window.SpecBadge) {
            const recipe = this.currentRecipe();
            const first = recipe && A.requirementsOf(recipe)[0];
            window.SpecBadge.show(first ? first.spec : 'Alchemy', { actor: this.alchemist() }); // i18n-ignore: Specialization.json id
        }
    };

    Scene_Alchemistry.prototype.syncTabs = function () {
        const counts = [0, 0, A.PROJECT_SLOTS];
        A.recipes().forEach(r => { if (A.hasReagents(r)) counts[TAB_READY]++; else counts[TAB_MISSING]++; });
        const labels = [alch().tabReady, alch().tabMissing, alch().tabBenches];
        this._el.tabNodes.forEach((node, idx) => {
            setText(node, `${labels[idx]} (${counts[idx]})`);
            node.classList.toggle('active', this._tab === idx);
            node.classList.toggle('selected', this._area === 'tabs' && this._tab === idx);
        });
    };

    Scene_Alchemistry.prototype.syncSwitcher = function () {
        const row = this._el.companionRow;
        const members = this.alchemistMembers();
        if (!window.CharSwitcher) { setShown(row, false); return; }
        const parts = window.CharSwitcher.parts(members.length);

        // Built once into three stable slots (hint, tabs, hint) and patched
        // after that, so switching member never rebuilds the row it lives in.
        if (!row._built) {
            row._left  = el('span', '', row);
            row._tabs  = el('div', 'companion-tabs-row', row);
            row._right = el('span', '', row);
            row._built = true;
        }
        // The two hint chips are static markup from CharSwitcher; written only
        // when they actually change (a pad being plugged in swaps TAB for L/R).
        if (row._leftHTML !== parts.left)  { row._left.innerHTML  = parts.left;  row._leftHTML  = parts.left; }
        if (row._rightHTML !== parts.right) { row._right.innerHTML = parts.right; row._rightHTML = parts.right; }

        const nodes = syncRows(row._tabs, members.length, () => {
            const tab = document.createElement('div');
            tab.className = 'companion-tab';
            tab.addEventListener('click', () => {
                this.selectAlchemist(Array.prototype.indexOf.call(tab.parentNode.children, tab));
            });
            return tab;
        });
        members.forEach((m, idx) => {
            setText(nodes[idx], m.name());
            nodes[idx].classList.toggle('selected', idx === this._alchemistIndex);
        });
    };

    Scene_Alchemistry.prototype.syncList = function (list) {
        const t = alch();
        const host = this._el.grid;

        const nodes = syncRows(host, list.length, () => {
            const slot = document.createElement('div');
            slot.className = 'item-slot';
            const icon = el('div', 'item-slot-icon', slot);
            const canvas = document.createElement('canvas');
            canvas.width = 32; canvas.height = 32;
            canvas.style.width = '32px'; canvas.style.height = '32px';
            icon.appendChild(canvas);
            const info = el('div', 'item-slot-info', slot);
            slot._name = el('div', 'item-slot-name', info);
            slot._meta = el('div', 'item-slot-meta', info);
            slot._canvas = canvas;
            slot.addEventListener('click', () => {
                this.selectListRow(Array.prototype.indexOf.call(host.children, slot));
            });
            return slot;
        });

        list.forEach((entry, idx) => {
            const node = nodes[idx];
            let name, meta, iconIndex = 0;
            if (entry.kind === 'recipe') {
                const item = $dataItems[entry.recipe.target_item_id];
                name = A.recipeName(entry.recipe);
                iconIndex = A.isRealItem(item) ? item.iconIndex : 0;
                const odds = A.assess(this.alchemist(), entry.recipe);
                meta = odds.ok
                    ? t.guaranteed
                    : T('Alchemistry.failChance', { pct: A.percent(odds.failChance) });
            } else {
                const project = entry.project;
                const item = $dataItems[project.target_item_id];
                iconIndex = A.isRealItem(item) ? item.iconIndex : 0;
                name = A.isEmpty(project) ? T('Alchemistry.projectName', { n: entry.slot + 1 }) : tn(project.name);
                if (A.isRunning(project)) {
                    meta = `${t.processing} · ${A.formatMinutes(A.minutesLeft(project))}`;
                } else if (A.isEmpty(project)) {
                    meta = t.benchEmpty;
                } else {
                    meta = `${project.steps.length} ${String(t.steps).toLowerCase()}` +
                        (project.repeat ? ` · ${t.repeatOn}` : '');
                }
            }
            setText(node._name, name);
            setText(node._meta, meta);
            node.classList.toggle('selected', this._area !== 'tabs' && this._listIndex === idx);
            if (node._iconIndex !== iconIndex) {
                node._iconIndex = iconIndex;
                this.drawAlcIconOn(node._canvas, iconIndex);
            }
        });

        if (this._area === 'list') {
            const focused = nodes[this._listIndex];
            if (focused) focused.scrollIntoView({ block: 'nearest' });
        }
    };

    Scene_Alchemistry.prototype.syncInspect = function () {
        const t = alch();
        const e = this._el;
        const entry = this.currentEntry();

        if (!entry) {
            setText(e.nameNode, t.title);
            setText(e.formulaNode, '');
            setShown(e.reagentTitle, false); setShown(e.reagentList, false);
            setShown(e.skillTitle, false);   setShown(e.skillList, false);
            setShown(e.oddsList, false);
            setShown(e.stepTitle, false);    setShown(e.stepList, false);
            syncRows(e.actions, 0, () => document.createElement('div'));
            this._actionsList = [];
            setText(e.status, t.empty);
            setShown(e.canvas, false);
            return;
        }

        const isProject = entry.kind === 'project';
        const project = isProject ? entry.project : null;
        const recipe  = this.currentRecipe();
        const targetId = isProject ? project.target_item_id : entry.recipe.target_item_id;
        const targetItem = $dataItems[targetId];

        // ---- header ----
        const displayName = isProject
            ? (A.isEmpty(project) ? T('Alchemistry.projectName', { n: entry.slot + 1 }) : tn(project.name))
            : A.recipeName(entry.recipe);
        setText(e.nameNode, displayName);
        setText(e.formulaNode, this.getItemFormula(targetItem));
        const iconIndex = A.isRealItem(targetItem) ? targetItem.iconIndex : 0;
        setShown(e.canvas, !!iconIndex);
        if (e.canvas._iconIndex !== iconIndex) {
            e.canvas._iconIndex = iconIndex;
            this.drawAlcIconOn(e.canvas, iconIndex);
        }

        // ---- reagents, with what the pack can cover ----
        const bill = isProject ? { required_ingredients: project.required_ingredients } : entry.recipe;
        const reagents = A.reagentRows(bill);
        setShown(e.reagentTitle, reagents.length > 0);
        setShown(e.reagentList, reagents.length > 0);
        const rNodes = syncRows(e.reagentList, reagents.length, () => this.makeSpecRow());
        reagents.forEach((row, i) => {
            setText(rNodes[i]._label, tn(row.item.name));
            setText(rNodes[i]._value, `${row.have} / ${row.need}`);
            rNodes[i]._value.style.color = row.ok ? '' : 'var(--border-danger-active)';
        });

        // ---- the skill check against the member on the switcher ----
        const odds = recipe ? A.assess(this.alchemist(), recipe) : null;
        const skills = odds ? odds.rows : [];
        setShown(e.skillTitle, skills.length > 0);
        setShown(e.skillList, skills.length > 0);
        const sNodes = syncRows(e.skillList, skills.length, () => this.makeSpecRow());
        const levelName = (lvl) => (window.Specializations && window.Specializations.levelName)
            ? window.Specializations.levelName(lvl) : String(lvl);
        skills.forEach((row, i) => {
            setText(sNodes[i]._label, row.label);
            setText(sNodes[i]._value, `${levelName(row.have)} / ${levelName(row.need)}`);
            sNodes[i]._value.style.color = row.ok ? 'var(--text-gold-dark)' : 'var(--border-danger-active)';
        });

        // ---- the two numbers the whole bench turns on ----
        const oddsLines = [];
        if (odds) {
            oddsLines.push([t.successChance, odds.failChance > 0
                ? `${100 - A.percent(odds.failChance)}%`
                : t.guaranteed]);
            oddsLines.push([t.yieldLabel, T('Alchemistry.yieldCount', { qty: odds.yield })]);
        }
        if (isProject && project.steps.length) {
            oddsLines.push([t.duration, A.formatMinutes(A.durationOf(project))]);
        } else if (!isProject) {
            oddsLines.push([t.duration, A.formatMinutes(
                (entry.recipe.steps || []).reduce((s, x) => s + (x.duration || 0), 0) * A.MINUTES_PER_DURATION)]);
        }
        setShown(e.oddsList, oddsLines.length > 0);
        const oNodes = syncRows(e.oddsList, oddsLines.length, () => this.makeSpecRow());
        oddsLines.forEach((line, i) => {
            setText(oNodes[i]._label, line[0]);
            setText(oNodes[i]._value, line[1]);
        });

        // ---- procedure ----
        const steps = isProject ? project.steps : (entry.recipe.steps || []);
        setShown(e.stepTitle, true);
        setShown(e.stepList, true);
        const stepLines = [];
        steps.forEach((step, i) => {
            stepLines.push({
                bullet: `${i + 1}. ${step.action} ${t.stepAt} ${step.temperature != null ? step.temperature : 25}° ${t.stepFor} ${step.duration}`
            });
            (step.ingredients || []).forEach(ing => {
                const item = $dataItems[ing.item_id];
                if (!A.isRealItem(item)) return;
                stepLines.push({ label: tn(item.name), value: `x${ing.quantity}` });
            });
        });
        if (!stepLines.length) stepLines.push({ bullet: t.noSteps });
        const stNodes = syncRows(e.stepList, stepLines.length, () => {
            const node = document.createElement('div');
            node._bullet = el('div', 'inspect-bullet-item', node);
            node._row = el('div', 'inspect-spec-row', node);
            node._row.style.paddingLeft = '18px';
            node._label = el('span', 'inspect-spec-label', node._row);
            node._value = el('span', 'inspect-spec-value', node._row);
            return node;
        });
        stepLines.forEach((line, i) => {
            const node = stNodes[i];
            setShown(node._bullet, line.bullet != null);
            setShown(node._row, line.bullet == null);
            setText(node._bullet, line.bullet || '');
            setText(node._label, line.label || '');
            setText(node._value, line.value || '');
        });

        // ---- actions ----
        this.syncActions(entry);
        setText(e.status, this._statusMessage);
    };

    Scene_Alchemistry.prototype.makeSpecRow = function () {
        const node = document.createElement('div');
        node.className = 'inspect-spec-row';
        node._label = el('span', 'inspect-spec-label', node);
        node._value = el('span', 'inspect-spec-value', node);
        return node;
    };

    // Which buttons the picked thing offers. The keys are the contract with
    // both the click handler and the keyboard, so the list is built once here.
    Scene_Alchemistry.prototype.actionsFor = function (entry) {
        const t = alch();
        if (!entry) return [];
        if (entry.kind === 'recipe') {
            return [{ key: 'copy', label: t.copyToBench }];
        }
        const project = entry.project;
        if (A.isRunning(project)) {
            return [{ key: 'busy', label: `${t.processing} · ${A.formatMinutes(A.minutesLeft(project))}`, disabled: true, live: true }];
        }
        const out = [];
        if (project.steps.length) {
            out.push({ key: 'start', label: t.execute, danger: false });
            out.push({ key: 'repeat', label: project.repeat ? t.repeatOn : t.repeatOff });
        }
        out.push({ key: 'addStep', label: t.addStep });
        if (project.steps.length) out.push({ key: 'clearSteps', label: t.clearSteps, danger: true });
        return out;
    };

    Scene_Alchemistry.prototype.syncActions = function (entry) {
        const defs = this.actionsFor(entry);
        this._actionsList = defs.map(d => d.key);
        const nodes = syncRows(this._el.actions, defs.length, () => {
            const node = document.createElement('div');
            node.className = 'inspect-btn';
            node.addEventListener('click', () => {
                const idx = Array.prototype.indexOf.call(node.parentNode.children, node);
                const key = this._actionsList[idx];
                if (key) this.onActionButton(key);
            });
            return node;
        });
        defs.forEach((def, i) => {
            const node = nodes[i];
            setText(node, def.label);
            node.classList.toggle('inspect-btn--danger', !!def.danger);
            node.classList.toggle('inspect-btn--disabled', !!def.disabled);
            node.classList.toggle('selected', this._area === 'actions' && this._actionIndex === i);
            node._live = !!def.live;
        });
    };

    // The only thing that moves on its own: a running bench counting down on
    // the world clock. Patched per frame as text, never as a rebuild.
    Scene_Alchemistry.prototype.updateLiveReadouts = function () {
        if (!this._el) return;
        const signature = this.stateSignature();
        if (signature !== this._signature) { this.syncAll(); return; }

        const entry = this.currentEntry();
        if (entry && entry.kind === 'project' && A.isRunning(entry.project)) {
            const label = `${alch().processing} · ${A.formatMinutes(A.minutesLeft(entry.project))}`;
            const node = this._el.actions.firstElementChild;
            if (node && node._live) setText(node, label);
        }
    };

    // Everything a patch depends on, folded into one string. A bench finishing
    // in the background, a reagent being spent or a repeat kicking in all move
    // it, and nothing else does.
    Scene_Alchemistry.prototype.stateSignature = function () {
        const parts = [this._tab, this._area, this._listIndex, this._actionIndex, this._alchemistIndex, this._modalMode];
        A.projects().forEach(p => {
            parts.push(p.recipeId || '-', p.steps.length, p.repeat ? 1 : 0, p.endsAt == null ? '-' : 'run');
        });
        return parts.join('|');
    };

    // =========================================================================
    // Icons
    // =========================================================================

    Scene_Alchemistry.prototype.drawAlcIconOn = function (canvas, iconIndex) {
        if (!canvas) return;
        const bitmap = ImageManager.loadSystem('IconSet');
        const draw = () => {
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (!iconIndex) return;
            ctx.imageSmoothingEnabled = false;
            const pw = 32, ph = 32;
            const sx = (iconIndex % 16) * pw;
            const sy = Math.floor(iconIndex / 16) * ph;
            ctx.drawImage(bitmap.canvas, sx, sy, pw, ph, 0, 0, canvas.width, canvas.height);
        };
        if (bitmap.isReady()) draw();
        else bitmap.addLoadListener(draw);
    };

    // =========================================================================
    // Interaction
    // =========================================================================

    Scene_Alchemistry.prototype.selectTab = function (idx) {
        if (this._tab === idx) { this._area = 'list'; this.syncAll(); return; }
        SoundManager.playCursor();
        this._tab = idx;
        this._listIndex = 0;
        this._actionIndex = 0;
        this._area = 'list';
        this._statusMessage = '';
        this.syncAll();
    };

    Scene_Alchemistry.prototype.selectListRow = function (idx) {
        if (this._listIndex === idx && this._area === 'list') {
            this.confirmListRow();
            return;
        }
        SoundManager.playCursor();
        this._area = 'list';
        this._listIndex = idx;
        this._actionIndex = 0;
        this._statusMessage = '';
        this.syncAll();
    };

    // OK on a list row: a recipe asks which bench to copy it onto, a bench
    // hands the cursor to its own buttons.
    Scene_Alchemistry.prototype.confirmListRow = function () {
        const entry = this.currentEntry();
        if (!entry) return;
        if (entry.kind === 'recipe') {
            SoundManager.playOk();
            this.openSlotModal(entry.recipe.id);
        } else if (this._actionsList.length) {
            SoundManager.playOk();
            this._area = 'actions';
            this._actionIndex = 0;
            this.syncAll();
        }
    };

    Scene_Alchemistry.prototype.onActionButton = function (key) {
        const entry = this.currentEntry();
        if (!entry) return;

        if (key === 'copy') {
            SoundManager.playOk();
            this.openSlotModal(entry.recipe.id);
            return;
        }
        if (entry.kind !== 'project') return;
        const slot = entry.slot;
        const project = entry.project;
        if (A.isRunning(project)) { SoundManager.playBuzzer(); return; }

        if (key === 'addStep') {
            SoundManager.playOk();
            this.openActionModal();
        } else if (key === 'start') {
            const actor = this.alchemist();
            project.actorId = actor ? actor.actorId() : null;
            if (A.start(slot)) {
                SoundManager.playOk();
                this._statusMessage = '';
            } else {
                SoundManager.playBuzzer();
                this._statusMessage = alch().notEnough;
            }
            this.syncAll();
        } else if (key === 'repeat') {
            SoundManager.playCursor();
            project.repeat = !project.repeat;
            this.syncAll();
        } else if (key === 'clearSteps') {
            SoundManager.playCancel();
            this.clearProjectSteps(slot);
            this._statusMessage = '';
            this.syncAll();
        }
    };

    // ---- modals -------------------------------------------------------------

    Scene_Alchemistry.prototype.openActionModal = function () {
        this._modalMode = 'action';
        this._modalSelectedIndex = 0;
        this.syncModal();
    };

    Scene_Alchemistry.prototype.openItemModal = function () {
        const isSandbox = A.isSandbox();
        // Everything the bench can reach for: the Alchemistry shelf, plus
        // anything the book itself calls for (wood, bone, ore, herb extract,
        // arcane essence...), or a hand-cleared bench could never be rebuilt.
        const fromBook = A.bookReagentIds();
        this._modalItems = $dataItems.filter(item =>
            item && A.isRealItem(item) &&
            ((item.note && /<category:\s*Alchemistry\s*>/i.test(item.note)) || fromBook.has(item.id)) &&
            (isSandbox || $gameParty.numItems(item) > 0));
        this._modalMode = 'item';
        this._modalSelectedIndex = 0;
        this.syncModal();
    };

    Scene_Alchemistry.prototype.openSlotModal = function (recipeId) {
        this._pendingRecipeId = recipeId;
        this._modalMode = 'slot';
        this._modalSelectedIndex = 0;
        this.syncModal();
    };

    Scene_Alchemistry.prototype.modalOptionCount = function () {
        if (this._modalMode === 'action') return ACTIONS.length;
        if (this._modalMode === 'item')   return this._modalItems.length;
        if (this._modalMode === 'slot')   return A.PROJECT_SLOTS;
        return 0;
    };

    Scene_Alchemistry.prototype.modalOptionLabel = function (idx) {
        const t = alch();
        if (this._modalMode === 'action') return t.actions[ACTIONS[idx].key];
        if (this._modalMode === 'item') {
            const item = this._modalItems[idx];
            const count = A.isSandbox() ? 99 : $gameParty.numItems(item);
            return `${tn(item.name)}  x${count}`;
        }
        const project = A.project(idx);
        const label = T('Alchemistry.projectName', { n: idx + 1 });
        if (A.isRunning(project)) return `${label} - ${t.processing}`;
        if (A.isEmpty(project))   return `${label} - ${t.benchEmpty}`;
        return `${label} - ${tn(project.name)}`;
    };

    Scene_Alchemistry.prototype.syncModal = function () {
        const e = this._el;
        const t = alch();
        setShown(e.modalLayer, !!this._modalMode);
        if (!this._modalMode) { this._signature = this.stateSignature(); return; }

        setText(e.modalTitle,
            this._modalMode === 'action' ? t.selectAction :
            this._modalMode === 'item'   ? t.selectReagent : t.selectBench);

        const count = this.modalOptionCount();
        const nodes = syncRows(e.modalOptions, Math.max(count, 1), () => {
            const node = document.createElement('div');
            node.className = 'target-option';
            node.addEventListener('click', () => {
                const idx = Array.prototype.indexOf.call(node.parentNode.children, node);
                this.onModalPick(idx);
            });
            return node;
        });
        if (!count) {
            setText(nodes[0], '-');
            nodes[0].style.opacity = '0.6';
            nodes[0].classList.remove('selected');
        } else {
            for (let i = 0; i < count; i++) {
                setText(nodes[i], this.modalOptionLabel(i));
                nodes[i].style.opacity = '';
                nodes[i].classList.toggle('selected', i === this._modalSelectedIndex);
            }
        }
        this._signature = this.stateSignature();
    };

    Scene_Alchemistry.prototype.onModalPick = function (idx) {
        if (this._modalMode === 'action') {
            const act = ACTIONS[idx];
            if (!act) return;
            SoundManager.playOk();
            this._pendingAction = act.key;
            if (act.needsItem) {
                this.openItemModal();
            } else {
                const entry = this.currentEntry();
                if (entry && entry.kind === 'project') this.addStepToProject(entry.slot, act.key, null);
                this.closeModal();
            }
        } else if (this._modalMode === 'item') {
            const item = this._modalItems[idx];
            if (!item) return;
            SoundManager.playOk();
            // Nothing is spent here: a step only declares what the run will
            // need, and the whole bill is paid when the bench is started.
            const entry = this.currentEntry();
            if (entry && entry.kind === 'project') this.addStepToProject(entry.slot, this._pendingAction, item.id);
            this.closeModal();
        } else if (this._modalMode === 'slot') {
            const project = A.project(idx);
            if (!project) return;
            if (A.isRunning(project)) {
                SoundManager.playBuzzer();
                this._statusMessage = alch().benchBusy;
                this.closeModal();
                return;
            }
            SoundManager.playOk();
            const actor = this.alchemist();
            A.assignRecipe(idx, this._pendingRecipeId, actor ? actor.actorId() : null);
            this._pendingRecipeId = null;
            this._modalMode = null;
            // Follow the copy onto the bench it landed on, which is where every
            // next action (start, repeat, edit) is taken.
            this._tab = TAB_BENCH;
            this._listIndex = idx;
            this._area = 'list';
            this._actionIndex = 0;
            this._statusMessage = '';
            this.syncModal();
            this.syncAll();
        }
    };

    Scene_Alchemistry.prototype.closeModal = function () {
        this._modalMode = null;
        this._pendingAction = null;
        this._pendingRecipeId = null;
        this._modalItems = [];
        this.syncModal();
        this.syncAll();
    };

    Scene_Alchemistry.prototype.onAlchemistryCancel = function () {
        SoundManager.playCancel();
        this.popScene();
    };

    // =========================================================================
    // Input manager
    // =========================================================================

    const UIAlchemistryInputManager = {
        _scene:  null,
        _active: false,

        activate(scene) { this._scene = scene; this._active = true; },
        deactivate()    { this._active = false; this._scene = null; },

        update() {
            if (!this._active || !this._scene) return;
            const scene = this._scene;

            // WASD hold-repeat simulation
            for (const dir of ['up', 'down', 'left', 'right']) {
                if (scene._wasdHeld && scene._wasdHeld[dir]) {
                    scene._wasdHoldFrames[dir]++;
                    const tt = scene._wasdHoldFrames[dir];
                    if (tt > Input.keyRepeatWait && (tt - Input.keyRepeatWait) % Input.keyRepeatInterval === 0) {
                        scene._wasdInput[dir] = true;
                    }
                } else if (scene._wasdHoldFrames) {
                    scene._wasdHoldFrames[dir] = 0;
                }
            }

            const isDown  = Input.isRepeated('down')  || (scene._wasdInput && scene._wasdInput.down);
            const isUp    = Input.isRepeated('up')    || (scene._wasdInput && scene._wasdInput.up);
            const isLeft  = Input.isRepeated('left')  || (scene._wasdInput && scene._wasdInput.left);
            const isRight = Input.isRepeated('right') || (scene._wasdInput && scene._wasdInput.right);

            if (scene._wasdInput) {
                scene._wasdInput.up = scene._wasdInput.down = scene._wasdInput.left = scene._wasdInput.right = false;
            }

            // Modal takes full input priority
            if (scene._modalMode) {
                const count = scene.modalOptionCount();
                if (isDown && scene._modalSelectedIndex < count - 1) {
                    SoundManager.playCursor(); scene._modalSelectedIndex++; scene.syncModal();
                } else if (isUp && scene._modalSelectedIndex > 0) {
                    SoundManager.playCursor(); scene._modalSelectedIndex--; scene.syncModal();
                } else if (Input.isTriggered('ok')) {
                    if (count > 0) scene.onModalPick(scene._modalSelectedIndex);
                } else if (Input.isTriggered('escape') || Input.isTriggered('cancel') || TouchInput.isCancelled()) {
                    SoundManager.playCancel(); scene.closeModal();
                }
                return;
            }

            // L1 / R1 step the tabs; L2 / R2 change who is at the bench
            // (CharSwitcher, installed with the scene).
            const tabStep = window.UINav ? window.UINav.tabDir() : 0;
            if (tabStep) {
                const last = scene._el.tabNodes.length - 1;
                const next = Math.max(0, Math.min(last, scene._tab + tabStep));
                if (next !== scene._tab) { SoundManager.playCursor(); scene.selectTab(next); }
                return;
            }

            if      (isDown)  this.handleMove('down');
            else if (isUp)    this.handleMove('up');
            else if (isLeft)  this.handleMove('left');
            else if (isRight) this.handleMove('right');
            else if (Input.isTriggered('ok')) this.handleOk();
            else if (Input.isTriggered('escape') || Input.isTriggered('cancel') || TouchInput.isCancelled()) this.handleCancel();
        },

        handleMove(dir) {
            const scene = this._scene;

            if (scene._area === 'tabs') {
                if (dir === 'left' && scene._tab > 0) scene.selectTab(scene._tab - 1);
                else if (dir === 'right' && scene._tab < scene._el.tabNodes.length - 1) scene.selectTab(scene._tab + 1);
                else if (dir === 'down') { SoundManager.playCursor(); scene._area = 'list'; scene.syncAll(); }
                return;
            }

            if (scene._area === 'list') {
                const total = scene.entries().length;
                const idx = scene._listIndex;
                const go = (next) => { SoundManager.playCursor(); scene._listIndex = next; scene._actionIndex = 0; scene._statusMessage = ''; scene.syncAll(); };
                if (dir === 'up') {
                    if (idx - COLS >= 0) go(idx - COLS);
                    else { SoundManager.playCursor(); scene._area = 'tabs'; scene.syncAll(); }
                } else if (dir === 'down') {
                    if (idx + COLS < total) go(idx + COLS);
                } else if (dir === 'left') {
                    if (idx % COLS !== 0) go(idx - 1);
                } else if (dir === 'right') {
                    if (idx % COLS !== COLS - 1 && idx + 1 < total) go(idx + 1);
                    else if (scene._actionsList.length) {
                        SoundManager.playCursor();
                        scene._area = 'actions';
                        scene._actionIndex = 0;
                        scene.syncAll();
                    }
                }
                return;
            }

            // actions
            const count = scene._actionsList.length;
            if (dir === 'up' && scene._actionIndex > 0) {
                SoundManager.playCursor(); scene._actionIndex--; scene.syncAll();
            } else if (dir === 'down' && scene._actionIndex < count - 1) {
                SoundManager.playCursor(); scene._actionIndex++; scene.syncAll();
            } else if (dir === 'left') {
                SoundManager.playCursor(); scene._area = 'list'; scene.syncAll();
            }
        },

        handleOk() {
            const scene = this._scene;
            if (scene._area === 'tabs') { scene.selectTab(scene._tab); return; }
            if (scene._area === 'list') { scene.confirmListRow(); return; }
            const key = scene._actionsList[scene._actionIndex];
            if (key) scene.onActionButton(key);
        },

        handleCancel() {
            const scene = this._scene;
            if (scene._modalMode) { SoundManager.playCancel(); scene.closeModal(); }
            else if (scene._area === 'actions') { SoundManager.playCancel(); scene._area = 'list'; scene.syncAll(); }
            else if (scene._area === 'list')    { SoundManager.playCancel(); scene._area = 'tabs'; scene.syncAll(); }
            else { SoundManager.playCancel(); scene.popScene(); }
        }
    };

})();
