/*:
 * @target MZ
 * @plugindesc Tech Tree (UI) v2.1.0 - full-screen book-spread, vertical discipline rail, vertical DAG with SVG connectors
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 * @help Requires ProceduralTechTree.js loaded before this file.
 */

(() => {
    'use strict';

    if (!window.ProceduralTechTree) {
        console.warn('ProceduralTechTreeUI.js requires ProceduralTechTree.js loaded first.');
        return;
    }
    const PTT = window.ProceduralTechTree;

    // Matches the game-wide stat relabeling (js/i18n/<lang>/stats.json):
    // atk->STR, def->CON, mat->INT, mdf->WIS, agi->DEX, luk->PSI in English,
    // and FRZ/COS/INT/SAG/DES/PSI in Italian, same as the equipment sheet.
    const STAT_NAMES = {
        mhp: 'HP', mmp: 'MP', atk: 'STR', def: 'CON',
        mat: 'INT', mdf: 'WIS', agi: 'DEX', luk: 'PSI'
    };
    const STAT_NAMES_IT = {
        mhp: 'HP', mmp: 'MP', atk: 'FRZ', def: 'COS',
        mat: 'INT', mdf: 'SAG', agi: 'DES', luk: 'PSI'
    };

    function isIt() { return ConfigManager.language === 'it'; }
    function dbName(entry) {
        if (!entry) return '';
        return (typeof window.translateText === 'function') ? window.translateText(entry.name) : entry.name;
    }
    // Tree and node copy lives in the TechTree<TreeId> namespaces, keyed by id;
    // the data layer owns the lookup (see ProceduralTechTree.js).
    const nodeName = PTT.nodeName;
    const nodeDesc = PTT.nodeDesc;
    function statName(s) { return (isIt() ? STAT_NAMES_IT[s] : STAT_NAMES[s]) || s.toUpperCase(); }

    function iconCss(iconIndex, size) {
        // IconSet is 16 columns of native 32px cells. To render at cell size
        // `sz`, both the offset and the background-size scale together.
        const sz = size || 32;
        const cols = 16;
        const sx = (iconIndex % cols) * sz;
        const sy = Math.floor(iconIndex / cols) * sz;
        return `background:url('img/system/IconSet.png') -${sx}px -${sy}px no-repeat;` +
            `width:${sz}px;height:${sz}px;background-size:${cols * sz}px auto;display:inline-block;`;
    }

    // ==================================================================
    //  Input manager
    // ==================================================================
    const UITTInput = {
        _scene: null, _active: false,
        activate(scene) { this._scene = scene; this._active = true; },
        deactivate() { this._active = false; this._scene = null; },
        update() {
            const s = this._scene;
            if (!this._active || !s || !s._built) return;

            // WASD hold-repeat simulation
            for (const dir of ['up', 'down', 'left', 'right']) {
                if (s._wasdHeld[dir]) {
                    s._wasdHoldFrames[dir]++;
                    const t = s._wasdHoldFrames[dir];
                    if (t > Input.keyRepeatWait && (t - Input.keyRepeatWait) % Input.keyRepeatInterval === 0) {
                        s._wasdInput[dir] = true;
                    }
                } else s._wasdHoldFrames[dir] = 0;
            }
            const isDown = Input.isRepeated('down') || s._wasdInput.down;
            const isUp = Input.isRepeated('up') || s._wasdInput.up;
            const isRight = Input.isRepeated('right') || s._wasdInput.right;
            const isLeft = Input.isRepeated('left') || s._wasdInput.left;
            s._wasdInput.up = s._wasdInput.down = s._wasdInput.left = s._wasdInput.right = false;

            // L1/R1 tab cycling from anywhere
            if (Input.isTriggered('pageup') || Input.isTriggered('pagedown')) {
                s.cycleTree(Input.isTriggered('pageup') ? -1 : 1);
                return;
            }

            const cancel = Input.isTriggered('escape') || Input.isTriggered('cancel') || TouchInput.isCancelled();
            if (cancel) { s.handleCancel(); return; }

            if (Input.isTriggered('ok')) { s.handleOk(); return; }

            // The disciplines are a vertical rail down the left edge, so the
            // axes swap: up/down walks the list, right steps into the tree.
            if (s._section === 'tabs') {
                if (isUp) s.cycleTree(-1);
                else if (isDown) s.cycleTree(1);
                else if (isRight) { s._section = 'tree'; s._syncSelectionDom(); s._updateRight(); SoundManager.playCursor(); }
            } else {
                if (isUp) s.moveTree(-1, 0);
                else if (isDown) s.moveTree(1, 0);
                else if (isLeft) s.moveTree(0, -1);
                else if (isRight) s.moveTree(0, 1);
            }
        }
    };

    // ==================================================================
    //  Scene_TechTree
    // ==================================================================
    class Scene_TechTree extends Scene_MenuBase {
        create() {
            super.create();
            if (this._helpWindow) { this._helpWindow.hide(); }

            // Ensure era-appropriate discoveries are unlocked for this world.
            try { PTT.preUnlockByYear(); } catch (e) { /* ignore */ }
            this._trees = PTT.trees();
            this._treeIndex = 0;
            this._section = 'tabs';
            this._selRow = 0;
            this._selLane = 0;
            this._built = false;

            // WASD tracking
            this._wasdInput = { up: false, down: false, left: false, right: false };
            this._wasdHeld = { up: false, down: false, left: false, right: false };
            this._wasdHoldFrames = { up: 0, down: 0, left: 0, right: 0 };
            this._wasdListener = (e) => {
                if (e.repeat) return;
                const k = e.key.toLowerCase();
                if (k === 'w') { this._wasdInput.up = true; this._wasdHeld.up = true; e.preventDefault(); }
                if (k === 's') { this._wasdInput.down = true; this._wasdHeld.down = true; e.preventDefault(); }
                if (k === 'a') { this._wasdInput.left = true; this._wasdHeld.left = true; e.preventDefault(); }
                if (k === 'd') { this._wasdInput.right = true; this._wasdHeld.right = true; e.preventDefault(); }
                // E pages through a detail page that overflows, wrapping back to
                // the top at the end. The arrows navigate the tree, PageUp/
                // PageDown (and Q, mapped to pageup) cycle the tabs, so this is
                // the one spare key.
                if (k === 'e') { this._scrollRight(1); e.preventDefault(); }
            };
            this._wasdUp = (e) => {
                const k = e.key.toLowerCase();
                if (k === 'w') { this._wasdHeld.up = false; this._wasdHoldFrames.up = 0; }
                if (k === 's') { this._wasdHeld.down = false; this._wasdHoldFrames.down = 0; }
                if (k === 'a') { this._wasdHeld.left = false; this._wasdHoldFrames.left = 0; }
                if (k === 'd') { this._wasdHeld.right = false; this._wasdHoldFrames.right = 0; }
            };
            // Every size in the layout is a percentage or a viewport clamp, but
            // the SVG connectors are measured in pixels once and would be left
            // pointing at where the nodes used to be. Redraw them whenever the
            // window changes shape (resolution switch, docking, going
            // fullscreen), coalesced into one frame.
            this._resizeListener = () => {
                if (this._resizeRaf) cancelAnimationFrame(this._resizeRaf);
                this._resizeRaf = requestAnimationFrame(() => {
                    this._resizeRaf = 0;
                    if (this._container) { this._drawLinks(); this._scrollToSelected(); }
                });
            };
            window.addEventListener('keydown', this._wasdListener);
            window.addEventListener('keyup', this._wasdUp);
            window.addEventListener('resize', this._resizeListener);

            if (!this._trees || !this._trees.length) { this.popScene(); return; }

            this._buildGrid();
            this._container = document.createElement('div');
            this._container.id = 'tt-container';
            this._container.style.opacity = '0';
            this._container.style.transition = 'opacity 0.22s ease-out';
            document.body.appendChild(this._container);
            this._wireEvents();
            this._refreshDOM();
            this._built = true;
            UITTInput.activate(this);
            setTimeout(() => { if (this._container) this._container.style.opacity = '1'; }, 16);
        }

        get activeTree() { return this._trees[this._treeIndex]; }

        _buildGrid() {
            // Group nodes by depth (row). Within a row, sort: main-line nodes
            // first (original order), then fringe, then procedural.
            const tree = this.activeTree;
            const orderIndex = {};
            tree.nodes.forEach((n, i) => { orderIndex[n.id] = i; });
            let maxDepth = 0;
            tree.nodes.forEach(n => { maxDepth = Math.max(maxDepth, n._depth || 0); });
            const rows = [];
            for (let d = 0; d <= maxDepth; d++) rows.push([]);
            tree.nodes.forEach(n => { rows[n._depth || 0].push(n); });
            rows.forEach(row => row.sort((a, b) => {
                const ra = (a.procedural ? 2 : a.fringe ? 1 : 0);
                const rb = (b.procedural ? 2 : b.fringe ? 1 : 0);
                if (ra !== rb) return ra - rb;
                return orderIndex[a.id] - orderIndex[b.id];
            }));
            this._grid = rows.filter(r => r.length);
            if (this._selRow >= this._grid.length) this._selRow = 0;
            if (this._selLane >= (this._grid[this._selRow] || []).length) this._selLane = 0;
        }

        selectedNode() {
            const row = this._grid[this._selRow];
            return row ? row[this._selLane] : null;
        }

        // --- node state --------------------------------------------------
        _nodeState(node) {
            const tree = this.activeTree;
            if (PTT.isCompleted(tree.id, node.id)) return 'done';
            if (!PTT.prereqsMet(tree, node)) return 'locked';
            return PTT.materialsSatisfied(node) ? 'ready' : 'open';
        }

        // ==============================================================
        //  Rendering
        // ==============================================================
        _refreshDOM() {
            if (!this._container) return;
            // The shell is built once and then only its contents are swapped.
            // Re-setting the container's innerHTML would recreate the
            // .book-spread, restarting its paperRustle animation: the spread
            // fades in from opacity 0 and the game map shows through it for
            // the length of the animation on every discipline change.
            if (!this._container.querySelector('.tt-spread')) {
                this._container.innerHTML =
                    `<div class="tt-rail">` +
                    `<div class="page-header-bar page-header-bar--compact">` +
                    `<div class="back-button focusable tt-back">${T('TechTree.back')}</div>` +
                    `</div>` +
                    `<div class="tt-rail-list"></div></div>` +
                    `<div class="book-spread tt-spread">` +
                    `<div class="left-page tt-left"><div class="tt-tree"></div></div>` +
                    `<div class="right-page tt-right"></div>` +
                    `</div>`;
            }
            const railList = this._container.querySelector('.tt-rail-list');
            if (railList) railList.innerHTML = this._buildTabs();
            this._updateRight();
            this._renderTree();
            // Each tab is a discipline with its own specialization; name the one
            // the open tree trains, and the party's tier in it.
            if (window.SpecBadge && this.activeTree) {
                const spec = PTT.treeSpec ? PTT.treeSpec(this.activeTree.id) : null;
                if (spec) window.SpecBadge.show(spec, { anchor: '.tt-detail-head' });
            }
        }

        _buildTabs() {
            return this._trees.map((t, i) => {
                const c = PTT.treeCounts(t);
                const active = i === this._treeIndex;
                const focused = active && this._section === 'tabs';
                const cls = 'tt-tab' + (active ? ' active' : '') + (focused ? ' selected' : '');
                const label = PTT.treeName(t);
                const glyph = `<span class="tt-tab-icon" style="${iconCss(t.icon, 22)}"></span>`;
                return `<div class="${cls}" data-tab="${i}" style="--tt-accent:${t.accent}">` +
                    `${glyph}<span class="tt-tab-name">${label}</span>` +
                    `<span class="tt-tab-count">${c.done}/${c.total}</span></div>`;
            }).join('');
        }

        _renderTree() {
            const treeEl = this._container.querySelector('.tt-tree');
            if (!treeEl) return;
            let html = `<svg class="tt-links" xmlns="http://www.w3.org/2000/svg"></svg>`;
            this._grid.forEach((row, r) => {
                html += `<div class="tt-depth-row" data-row="${r}">`;
                row.forEach((node, l) => { html += this._nodeHTML(node, r, l); });
                html += `</div>`;
            });
            treeEl.innerHTML = html;
            // Draw connectors after layout settles.
            requestAnimationFrame(() => this._drawLinks());
            this._scrollToSelected();
        }

        _nodeHTML(node, r, l) {
            const state = this._nodeState(node);
            const sel = (this._section === 'tree' && r === this._selRow && l === this._selLane);
            let cls = 'tt-node tt-node--' + state;
            if (node.fringe) cls += ' tt-node--fringe';
            if (node.procedural) cls += ' tt-node--proc';
            if (node.nobelWorthy) cls += ' tt-node--nobel';
            const activeProject = PTT.getActiveProject ? PTT.getActiveProject() : null;
            if (activeProject && activeProject.treeId === this.activeTree.id && activeProject.nodeId === node.id) cls += ' tt-node--project';
            if (sel) cls += ' selected';
            let glyph = '○';
            if (state === 'done') glyph = '✔';
            else if (state === 'locked') glyph = '\u{1F512}';
            else if (state === 'ready') glyph = '✦';
            if (node.fringe) glyph = '?';
            const nobel = node.nobelWorthy ? `<span class="tt-nobel-mark" title="Nobel-worthy">\u{1F3C5}</span>` : '';
            // No year on the node: the tree is read as a dependency graph, not a
            // timeline, and dropping it keeps the label short enough to fit.
            // Phases come from js/db/TechTree as ids; the display copy is
            // TechTree.phase.<id>, falling back to the id for a new one.
            const phaseKey = 'TechTree.phase.' + (node.phase || '');
            const badge = node.phase ? (T.has(phaseKey) ? T(phaseKey) : node.phase) : '';
            // The cost is read off the node itself: a target is picked by what
            // it asks for as much as by what it is, so the materials are shown
            // on the tile and not only on the detail page.
            let mats = '';
            if (state !== 'done' && (node.materials || []).length) {
                const chips = node.materials.map(m => {
                    const item = $dataItems[m.id];
                    if (!item) return '';
                    const ok = $gameParty.numItems(item) >= m.qty || ($gameSystem && $gameSystem._isSandboxMode);
                    return `<span class="tt-node-mat ${ok ? 'tt-req-ok' : 'tt-req-miss'}" title="${dbName(item)}">` +
                        `<span class="tt-node-mat-icon" style="${iconCss(item.iconIndex, 16)}"></span>${m.qty}</span>`;
                }).join('');
                if (chips) mats = `<span class="tt-node-mats">${chips}</span>`;
            }
            return `<div class="${cls}" data-node="${node.id}" data-row="${r}" data-lane="${l}" style="--tt-accent:${this.activeTree.accent}">` +
                `<span class="tt-node-glyph">${glyph}</span>` +
                `<span class="tt-node-body"><span class="tt-node-name">${nobel}${nodeName(node)}</span>` +
                (badge ? `<span class="tt-node-badge">${badge}</span>` : '') + mats + `</span></div>`;
        }

        _drawLinks() {
            const treeEl = this._container && this._container.querySelector('.tt-tree');
            const svg = treeEl && treeEl.querySelector('.tt-links');
            if (!treeEl || !svg) return;
            const w = treeEl.scrollWidth, h = treeEl.scrollHeight;
            svg.setAttribute('width', w);
            svg.setAttribute('height', h);
            svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
            const tree = this.activeTree;
            const nodeEls = {};
            treeEl.querySelectorAll('.tt-node').forEach(el => { nodeEls[el.dataset.node] = el; });
            const treeRect = treeEl.getBoundingClientRect();
            const pos = (el) => {
                const r = el.getBoundingClientRect();
                return {
                    cx: r.left - treeRect.left + treeEl.scrollLeft + r.width / 2,
                    top: r.top - treeRect.top + treeEl.scrollTop,
                    bottom: r.top - treeRect.top + treeEl.scrollTop + r.height
                };
            };
            let paths = '';
            tree.nodes.forEach(node => {
                const childEl = nodeEls[node.id];
                if (!childEl) return;
                (node.requires || []).forEach(reqId => {
                    const parentEl = nodeEls[reqId];
                    if (!parentEl) return;
                    const p = pos(parentEl), c = pos(childEl);
                    const x1 = p.cx, y1 = p.bottom, x2 = c.cx, y2 = c.top;
                    const my = (y1 + y2) / 2;
                    const done = PTT.isCompleted(tree.id, reqId);
                    const cls = 'tt-link' + (done ? ' tt-link--on' : '');
                    paths += `<path class="${cls}" d="M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}"/>`;
                });
            });
            svg.innerHTML = paths;
        }

        _buildRight() {
            const node = this.selectedNode();
            const tree = this.activeTree;
            if (!node) {
                return `<div class="tt-detail tt-detail--empty">` +
                    `<h2 class="title">${PTT.treeName(tree)}</h2>` +
                    `<p class="tt-blurb">${PTT.treeBlurb(tree)}</p>` +
                    `<p class="tt-hint">${T('TechTree.selectNodeHint')}</p></div>`;
            }
            const state = this._nodeState(node);
            // The phase is already carried by the tags below, and the year is
            // deliberately not shown anywhere in the tree.
            const sub = '';
            let tag = '';
            if (node.nobelWorthy) tag += `<span class="tt-tag tt-tag--nobel">\u{1F3C5} ${T('TechTree.nobelWorthy')}</span>`;
            if (node.fringe) tag += `<span class="tt-tag tt-tag--fringe">${T('TechTree.fringe')}</span>`;
            else if (node.procedural) tag += `<span class="tt-tag tt-tag--proc">${T('TechTree.speculative')}</span>`;

            let badge = '';
            if (state === 'done') {
                badge = `<div class="tt-badge tt-badge-done">${T('TechTree.researched')}</div>`;
                const d = PTT.discovererOf(tree.id, node.id);
                if (d && d.preexisting) {
                    badge += `<div class="tt-discoverer">${T('TechTree.knownAtFounding')}</div>`;
                } else if (d && d.leader) {
                    badge += `<div class="tt-discoverer">${T('TechTree.discoveredBy')}<b>${d.leader}</b></div>`;
                }
            } else if (state === 'locked') {
                badge = `<div class="tt-badge">${T('TechTree.prereqIncomplete')}</div>`;
            }

            const activeProject = PTT.getActiveProject ? PTT.getActiveProject() : null;
            const isActiveProject = !!(activeProject && activeProject.treeId === tree.id && activeProject.nodeId === node.id);
            if (isActiveProject) {
                badge += `<div class="tt-badge tt-badge-done">★ ${T('TechTree.activeProject')}</div>`;
            }

            // Materials. Each line also previews how much the Army's
            // "scientist" workforce troops (Army/ArmyManager.js) would
            // deliver toward it per day, scaled off the stat their material
            // pool favours (organic/metals -> STR, tech/arcane -> INT,
            // synthetic -> DEX, alchemical -> WIS; see materialStat).
            let matHTML = '';
            if ((node.materials || []).length && state !== 'done') {
                const dailyOutput = PTT.workforceDailyOutput ? PTT.workforceDailyOutput(node) : [];
                const chips = node.materials.map(m => {
                    const item = $dataItems[m.id];
                    if (!item) return '';
                    const have = $gameParty.numItems(item);
                    const ok = have >= m.qty || ($gameSystem && $gameSystem._isSandboxMode);
                    const perDay = dailyOutput.find(d => d.id === m.id);
                    const workforce = (perDay && perDay.qty > 0)
                        ? ` +${perDay.qty}/${T('TechTree.day')}`
                        : '';
                    return `<span class="tt-inline-chip ${ok ? 'tt-req-ok' : 'tt-req-miss'}" title="${dbName(item)}">` +
                        `<span class="tt-mat-icon" style="${iconCss(item.iconIndex, 20)}"></span>` +
                        `<span class="tt-mat-count">${have}/${m.qty}</span>${workforce}</span>`;
                }).join('');
                matHTML = `<div class="tt-section">${T('TechTree.materialsRequired')}</div><div class="tt-inline-line">${chips}</div>`;
            }

            // Prerequisites (if any, only useful when locked)
            let preHTML = '';
            const reqs = (node.requires || []).filter(r => tree.byId[r]);
            if (reqs.length && state === 'locked') {
                const rows = reqs.map(r => {
                    const pn = tree.byId[r];
                    const done = PTT.isCompleted(tree.id, r);
                    return `<div class="tt-req-line ${done ? 'tt-req-ok' : 'tt-req-miss'}">${done ? '✔' : '•'} ${nodeName(pn)}</div>`;
                }).join('');
                preHTML = `<div class="tt-section">${T('TechTree.requires')}</div>${rows}`;
            }

            // Buffs
            let buffHTML = '';
            const buffs = Object.entries(node.buffs || {});
            if (buffs.length) {
                const rows = buffs.map(([s, v]) => `<span class="tt-buff-chip">+${v} ${statName(s)}</span>`).join('');
                buffHTML = `<div class="tt-section">${T('TechTree.permanentBuffs')}</div><div class="tt-buff-row">${rows}</div>`;
            }

            // Reward + payout
            // The yield is read at a glance, so it is two lines and no more:
            // one for the currencies, one for everything the node hands over.
            const rw = PTT.nodeRewards(node);
            let rewardHTML = `<div class="tt-section">${T('TechTree.yieldLabel')}</div>` +
                `<div class="tt-inline-line">` +
                `<span class="tt-inline-chip"><span class="tt-mat-name">${T('TechTree.exp')}</span>` +
                `<span class="tt-mat-count">${rw.exp}</span></span>` +
                `<span class="tt-inline-chip"><span class="tt-mat-name">${T('TechTree.gold')}</span>` +
                `<span class="tt-mat-count">€${(rw.gold / 100).toFixed(2)}</span></span></div>`;
            let goods = '';
            if (state !== 'done') {
                goods += PTT.materialPayout(node, tree.id).map(m => {
                    const item = $dataItems[m.id];
                    if (!item) return '';
                    return `<span class="tt-inline-chip" title="${dbName(item)}">` +
                        `<span class="tt-mat-icon" style="${iconCss(item.iconIndex, 20)}"></span>` +
                        `<span class="tt-mat-count">x${m.qty}</span></span>`;
                }).join('');
            }
            if (node.reward) {
                const entry = PTT.rewardDbEntry(node.reward);
                if (entry) {
                    goods += `<span class="tt-inline-chip tt-reward-row" title="${dbName(entry)}">` +
                        `<span class="tt-mat-icon" style="${iconCss(entry.iconIndex, 20)}"></span>` +
                        `<span class="tt-mat-count">x${node.reward.qty || 1}</span></span>`;
                }
            }
            if (goods) rewardHTML += `<div class="tt-inline-line">${goods}</div>`;

            // Action button
            let btn = '';
            if (state === 'done') {
                btn = `<div class="tt-research-btn tt-research-btn--disabled">${T('TechTree.complete')}</div>`;
            } else if (state === 'locked') {
                btn = `<div class="tt-research-btn tt-research-btn--disabled">${T('TechTree.locked')}</div>`;
            } else {
                const can = state === 'ready';
                btn = `<div id="tt-research-btn" class="tt-research-btn ${can ? '' : 'tt-research-btn--disabled'} ${this._section === 'tree' ? 'selected' : ''}">` +
                    `${T('TechTree.research')}</div>`;
            }

            // Assign/clear the workforce's active project. Available on any
            // node whose prerequisites are met, whether or not its materials
            // are already satisfied, since the whole point is having the
            // workforce gather what's still missing.
            let projectBtn = '';
            if (state === 'open' || state === 'ready') {
                projectBtn = `<div class="tt-project-btn ${isActiveProject ? 'tt-project-btn--active' : ''}">` +
                    (isActiveProject
                        ? T('TechTree.clearProject')
                        : T('TechTree.setProject')) +
                    `</div>`;
            }

            return `<div class="tt-detail">` +
                `<div class="tt-detail-head"><h2 class="tt-detail-name">${nodeName(node)}</h2>` +
                (sub ? `<div class="tt-detail-sub">${sub}</div>` : '') +
                ((tag || badge) ? `<div class="tt-detail-flags">${tag}${badge}</div>` : '') + `</div>` +
                `<p class="tt-detail-desc">${nodeDesc(node)}</p>` +
                preHTML + matHTML + buffHTML + rewardHTML + btn + projectBtn + `</div>`;
        }

        _updateRight() {
            const rp = this._container && this._container.querySelector('.tt-right');
            if (!rp) return;
            rp.innerHTML = this._buildRight();
            rp.scrollTop = 0;
        }

        // Pages the detail panel by most of its height, wrapping to the top
        // once the bottom is reached. No-op when nothing overflows.
        _scrollRight(dir) {
            const rp = this._container && this._container.querySelector('.tt-right');
            if (!rp) return;
            const max = rp.scrollHeight - rp.clientHeight;
            if (max <= 1) return;
            if (dir > 0 && rp.scrollTop >= max - 1) { rp.scrollTop = 0; return; }
            rp.scrollTop += dir * Math.max(80, rp.clientHeight * 0.8);
        }

        // `scroll` is false for pointer-driven selection. Scrolling the tree to
        // the node the mouse is already on would slide its neighbour under the
        // stationary cursor, firing mouseover again and scrolling back: two
        // adjacent nodes trade the selection forever and the page judders.
        _syncSelectionDom(scroll = true) {
            if (!this._container) return;
            this._container.querySelectorAll('.tt-node').forEach(el => {
                const on = this._section === 'tree' &&
                    parseInt(el.dataset.row) === this._selRow && parseInt(el.dataset.lane) === this._selLane;
                el.classList.toggle('selected', on);
            });
            this._container.querySelectorAll('.tt-tab').forEach(el => {
                el.classList.toggle('selected', this._section === 'tabs' && parseInt(el.dataset.tab) === this._treeIndex);
            });
            if (scroll) this._scrollToSelected();
        }

        _scrollToSelected() {
            if (!this._container) return;
            // The rail scrolls too: on a short screen (a Steam Deck's 800px)
            // the eight disciplines can run past the bottom of the list.
            const sel = this._section === 'tree'
                ? this._container.querySelector('.tt-node.selected')
                : this._container.querySelector('.tt-tab.selected');
            if (sel) sel.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }

        // ==============================================================
        //  Navigation
        // ==============================================================
        cycleTree(dir) {
            const n = this._trees.length;
            this._treeIndex = (this._treeIndex + dir + n) % n;
            this._section = 'tabs';
            this._selRow = 0; this._selLane = 0;
            SoundManager.playCursor();
            this._buildGrid();
            this._refreshDOM();
        }

        moveTree(dr, dl) {
            // Left off the first lane steps back out onto the discipline rail,
            // which is where it physically sits. Up out of the first row does
            // NOT: up/down inside the rail changes discipline, so a player
            // walking up the tree would flip the whole tab by accident.
            if (dl < 0 && this._selLane === 0) {
                this._section = 'tabs';
                SoundManager.playCursor();
                this._syncSelectionDom();
                this._updateRight();
                return;
            }
            if (dr !== 0) {
                const nr = this._selRow + dr;
                if (nr < 0 || nr >= this._grid.length) return;
                this._selRow = nr;
                const len = this._grid[nr].length;
                if (this._selLane >= len) this._selLane = len - 1;
            } else if (dl !== 0) {
                const len = this._grid[this._selRow].length;
                const nl = this._selLane + dl;
                if (nl < 0 || nl >= len) return;
                this._selLane = nl;
            }
            SoundManager.playCursor();
            this._syncSelectionDom();
            this._updateRight();
        }

        handleOk() {
            if (this._section === 'tabs') {
                this._section = 'tree';
                SoundManager.playOk();
                this._syncSelectionDom();
                this._updateRight();
                return;
            }
            this._tryResearch();
        }

        // Back always leaves the tech tree, from either section. Bouncing the
        // focus up to the tab bar first meant a player who had just opened the
        // screen and moved into the tree needed two presses to get out.
        handleCancel() {
            SoundManager.playCancel();
            this.popScene();
        }

        // Assigns/clears the workforce's active project (Army "scientist"
        // troops gather this node's materials once per game day, see
        // ProceduralTechTree.js workforceDailyOutput / ArmyManager.js
        // produceDailyMaterials).
        _toggleActiveProject() {
            const node = this.selectedNode();
            const tree = this.activeTree;
            if (!node || !PTT.getActiveProject) return;
            const active = PTT.getActiveProject();
            const isActive = active && active.treeId === tree.id && active.nodeId === node.id;
            if (isActive) {
                PTT.clearActiveProject();
                SoundManager.playCancel();
            } else {
                if (!PTT.setActiveProject(tree.id, node.id)) { SoundManager.playBuzzer(); return; }
                SoundManager.playOk();
            }
            this._buildGrid();
            this._refreshDOM();
        }

        _tryResearch() {
            const node = this.selectedNode();
            const tree = this.activeTree;
            if (!node) return;
            if (!PTT.canResearch(tree, node)) { SoundManager.playBuzzer(); return; }
            const res = PTT.research(tree.id, node.id);
            if (!res.ok) { SoundManager.playBuzzer(); return; }
            SoundManager.playUseItem();
            this._notifyResearch(node, res);
            this._buildGrid();
            this._refreshDOM();
        }

        // A discovery can pay out in three ways at once, so all three are
        // reported: the finding itself, what it handed over, and what the
        // research recovered. They queue in the shared popup stack.
        _notifyResearch(node, res) {
            const PT = window.ParchmentToast;
            if (!PT || typeof PT.show !== 'function') return;
            PT.group([
                () => PT.show(T('TechTree.discovered') + nodeName(node), {
                    severity: 'good', duration: 150
                }),
                ...(res.rewardEntry ? [() => PT.reward({
                    entries: [{ obj: res.rewardEntry, qty: res.rewardQty }],
                    duration: 150
                })] : []),
                ...((res.materialsGranted && res.materialsGranted.length) ? [() => PT.reward({
                    title: T('TechTree.recoveredMaterials'),
                    entries: res.materialsGranted.map(m => ({ id: m.id, qty: m.qty })),
                    duration: 150
                })] : [])
            ]);
        }

        // ==============================================================
        //  Mouse wiring
        // ==============================================================
        _wireEvents() {
            // RPG Maker attaches a document-level wheel listener that
            // preventDefaults, which kills native scrolling inside DOM
            // overlays. Scroll the region under the pointer ourselves (the
            // detail page, or the tree if it is taller than the left page) and
            // stop the event before it reaches the game.
            this._container.addEventListener('wheel', (e) => {
                const box = e.target.closest('.tt-right, .tt-tree, .tt-rail-list');
                if (box) box.scrollTop += e.deltaY;
                e.stopPropagation();
                e.preventDefault();
            }, { passive: false });

            this._container.addEventListener('mouseover', (e) => {
                const nodeEl = e.target.closest('.tt-node');
                if (!nodeEl) return;
                // A scroll (keyboard navigation) that slides a node under a
                // resting cursor also raises mouseover: only a real pointer
                // movement may take the selection away from the keys.
                if (this._ptrX === e.clientX && this._ptrY === e.clientY) return;
                this._ptrX = e.clientX; this._ptrY = e.clientY;
                const r = parseInt(nodeEl.dataset.row), l = parseInt(nodeEl.dataset.lane);
                if (r === this._selRow && l === this._selLane && this._section === 'tree') return;
                this._section = 'tree';
                this._selRow = r; this._selLane = l;
                this._syncSelectionDom(false);
                this._updateRight();
            });
            // Right-click is a Back press here (and never raises the browser menu).
            this._container.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.handleCancel();
            });

            this._container.addEventListener('click', (e) => {
                if (e.target.closest('.tt-back')) { this.handleCancel(); return; }
                const tabEl = e.target.closest('.tt-tab');
                if (tabEl) {
                    const i = parseInt(tabEl.dataset.tab);
                    if (i !== this._treeIndex) { this._treeIndex = i; this._section = 'tabs'; this._selRow = 0; this._selLane = 0; SoundManager.playCursor(); this._buildGrid(); this._refreshDOM(); }
                    else { this._section = 'tabs'; this._syncSelectionDom(); }
                    return;
                }
                if (e.target.closest('#tt-research-btn')) { this._section = 'tree'; this._tryResearch(); return; }
                if (e.target.closest('.tt-project-btn')) { this._section = 'tree'; this._toggleActiveProject(); return; }
                const nodeEl = e.target.closest('.tt-node');
                if (nodeEl) {
                    // Click selects and inspects; research is confirmed with the
                    // Research button (or the OK key) to avoid misclick research.
                    this._section = 'tree';
                    this._selRow = parseInt(nodeEl.dataset.row);
                    this._selLane = parseInt(nodeEl.dataset.lane);
                    this._syncSelectionDom(false);
                    this._updateRight();
                }
            });
        }

        update() {
            Scene_MenuBase.prototype.update.call(this);
            UITTInput.update();
        }

        terminate() {
            if (this._wasdListener) {
                window.removeEventListener('keydown', this._wasdListener);
                window.removeEventListener('keyup', this._wasdUp);
                this._wasdListener = this._wasdUp = null;
            }
            if (this._resizeListener) {
                window.removeEventListener('resize', this._resizeListener);
                this._resizeListener = null;
            }
            if (this._resizeRaf) { cancelAnimationFrame(this._resizeRaf); this._resizeRaf = 0; }
            UITTInput.deactivate();
            if (window.SpecBadge) window.SpecBadge.hide();
            if (this._container) {
                const c = this._container;
                c.style.transition = 'opacity 0.2s ease-out';
                c.style.opacity = '0';
                c.style.pointerEvents = 'none';
                setTimeout(() => { if (c.parentNode) c.parentNode.removeChild(c); }, 200);
                this._container = null;
            }
            Scene_MenuBase.prototype.terminate.call(this);
        }
    }

    window.Scene_TechTree = Scene_TechTree;
})();
