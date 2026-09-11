/*:
 * @target MZ
 * @plugindesc v2.1.0 Simulated Esoteric Operating System (Archways XP inspired) for RPG Maker MZ.
 * @author Omni-Lex
 *
 * @help
 * HypernetOS.js
 *
 * This plugin creates a highly complex, modular, and fully functional simulated
 * Archways XP Luna-themed Operating System inside RPG Maker MZ.
 *
 * Accessibility / Input:
 *   - WASD or Arrow keys: move the focus ring between interactive elements.
 *   - Tab / Shift+Tab: cycle through interactive elements.
 *   - Enter / Space: activate the focused element.
 *   - Escape: leave a text field, then close the active window, then exit the OS.
 *   - Controller D-pad: same as WASD/Arrows. Button A: activate focus.
 *   - Controller left stick: free virtual mouse cursor. Button A: click.
 *   - Controller B: close active window / exit the OS.
 *
 * Exposes a modular API for registering apps:
 * window.HypernetOS.registerApp({ id, name, icon, launchFn, desktopShortcut })
 * 
 * @command OpenHypernetOS
 * @desc Opens the Hypernet OS desktop environment.
 * 
 * @command OpenApp
 * @desc Opens the Hypernet OS and auto-launches a specific app.
 * @arg appId
 * @type select
 * @option Browser
 * @value browser
 * @option Shop
 * @value shop
 * @desc The ID of the app to launch.
 */

(() => {
    'use strict';

    const pluginName = "HypernetOS";

    // --- Plugin Commands ---
    PluginManager.registerCommand(pluginName, "OpenHypernetOS", args => {
        SceneManager.push(Scene_HypernetOS);
    });

    PluginManager.registerCommand(pluginName, "OpenApp", args => {
        SceneManager.push(Scene_HypernetOS);
        SceneManager.prepareNextScene({ autoLaunch: args.appId });
    });

    // --- Legacy MV-style string command support ---
    const _Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;
    Game_Interpreter.prototype.pluginCommand = function(command, args) {
        _Game_Interpreter_pluginCommand.call(this, command, args);
        if (command === "OpenHypernetOS") {
            SceneManager.push(Scene_HypernetOS);
        } else if (command === "OpenApp" && args[0]) {
            SceneManager.push(Scene_HypernetOS);
            SceneManager.prepareNextScene({ autoLaunch: args[0] });
        }
    };

    // --- Core HypernetOS API & Registry ---
    window.HypernetOS = {
        _apps: {},

        // The whole network went quiet on 1 January 2000 in an empty world:
        // nothing has been reported, filed, priced or measured since, so every
        // app that prints how fresh its data is prints that date. Apps ask
        // through staleDate(): it answers null in an ordinary world, which
        // means "use your own answer".
        EMPTY_WORLD_DATE: '01/01/2000',

        isEmptyWorld: function () {
            const WM = window.WorldManager;
            return !!(WM && typeof WM.isEmptyWorld === 'function' && WM.isEmptyWorld());
        },

        // The date an app should report as its last update, or null to use its
        // own. One reader, so a new app carrying a timestamp needs no rule of
        // its own to agree with the rest of the desktop.
        staleDate: function () {
            return this.isEmptyWorld() ? this.EMPTY_WORLD_DATE : null;
        },

        registerApp: function(options) {
            const { id, name, icon, launchFn, desktopShortcut = true } = options;
            const category = options.category || this.defaultCategory(id);
            this._apps[id] = { id, name, icon, launchFn, desktopShortcut, category };

            // Every plugin registers on load, so a straight refresh here rebuilt
            // the whole desktop and start menu once per program. One coalesced
            // rebuild on the next tick does the same work a single time.
            this.refreshShell();
        },

        // Desktop and start menu, rebuilt once however many times this is asked
        // for in the same tick.
        refreshShell: function() {
            if (this._shellRefreshPending) return;
            this._shellRefreshPending = true;
            setTimeout(() => {
                this._shellRefreshPending = false;
                this.refreshDesktopIcons();
                this.refreshStartMenu();
                this.refreshAllProgramsWindows();
            }, 0);
        },

        // --- Program categories -------------------------------------------------
        // The start menu files every program under a heading, the way the old
        // "All Programs" tree did. An app may name its own category when it
        // registers; the ones that never did are filed here so the menu never
        // shows a loose program.
        CATEGORY_ORDER: ['accessories', 'media', 'reference', 'internet', 'economy', 'office', 'games', 'civic', 'system'],
        // i18n-ignore-start  app ids and category ids, named by categoryLabel()
        DEFAULT_CATEGORIES: {
            'sys-task-mgr': 'system', 'sys-terminal': 'system', 'control-panel': 'system',
            'my-computer': 'system', 'my-documents': 'system', 'app-bios': 'system',
            'app-hypernet-browser': 'internet', 'app-hypernet-shop': 'internet', 'app-news-history': 'internet',
            'tv-guide': 'media', 'app-hyperamp': 'media',
            'app-hypernet-notepad': 'accessories', 'app-hypernet-paint': 'accessories',
            'app-weather': 'reference', 'app-bestiary-encarta': 'reference', 'app-object-index': 'reference',
            'app-eurodemics': 'reference', 'app-artifact-analyzer': 'reference',
            'app-bank-system': 'economy', 'app-stock-market': 'economy', 'app-real-estate': 'economy',
            'app-token-exchange': 'economy', 'app-job-offers': 'economy',
            'app-kanban-quest': 'office',
            'app-colosseum': 'games', 'app-bobnzi': 'games',
            'app-minesweeper': 'games', 'app-solitaire': 'games',
            'app-folderopt': 'system', 'app-mouse': 'system', 'app-keyboard': 'system',
            'app-useracc': 'system', 'app-printers': 'system', 'app-netconn': 'system',
            'app-access': 'system', 'app-fonts': 'system', 'app-joy': 'system',
            'app-taskbar': 'system',
            'app-neuropolice': 'civic',
            'app-recycle': 'system', 'app-search': 'accessories', 'app-help': 'accessories',
            'app-chiplab': 'accessories'
        },
        // i18n-ignore-end

        defaultCategory: function(id) {
            return this.DEFAULT_CATEGORIES[id] || 'accessories';
        },

        categoryLabel: function(category) {
            const key = 'HypernetOS.category.' + category;
            return T.has(key) ? T(key) : category;
        },

        // Registered apps grouped by category, in menu order. Categories with
        // no program are skipped; an unknown category goes last.
        appsByCategory: function() {
            const groups = new Map();
            this.CATEGORY_ORDER.forEach(c => groups.set(c, []));
            Object.values(this._apps).forEach(app => {
                if (!this.isInstalled(app)) return;
                const c = app.category || this.defaultCategory(app.id);
                if (!groups.has(c)) groups.set(c, []);
                groups.get(c).push(app);
            });
            const out = [];
            groups.forEach((apps, category) => {
                if (!apps.length) return;
                apps.sort((a, b) => String(a.name).localeCompare(String(b.name)));
                out.push({ category, label: this.categoryLabel(category), apps });
            });
            return out;
        },

        // --- Desktop shortcuts the player chose ----------------------------------
        // registerApp's desktopShortcut is only the default. The player pins and
        // unpins programs from the start menu (drag, or the context menu), and
        // that choice lives on $gameSystem so it travels with the save.
        desktopPins: function() {
            if (typeof $gameSystem === 'undefined' || !$gameSystem) return {};
            if (!$gameSystem._hypernetDesktopPins) $gameSystem._hypernetDesktopPins = {};
            return $gameSystem._hypernetDesktopPins;
        },

        // The machine boots with a short desktop: the shell's own doors and the
        // programs the game is actually played through. Everything else lives
        // in All Programs until the player drags it out.
        // i18n-ignore-start  app ids
        DESKTOP_DEFAULT: ['app-all-programs', 'app-hypernet-browser', 'app-hypernet-shop',
            'app-stock-market', 'app-neuropolice', 'app-card-arena', 'app-hexcel',
            'app-hypernet-paint'],
        // All Programs is the drawer every other shortcut comes out of, so it
        // is the one icon that cannot be taken off the desktop.
        DESKTOP_PERMANENT: ['app-all-programs'],
        // i18n-ignore-end

        isPermanentDesktopApp: function(id) {
            return this.DESKTOP_PERMANENT.indexOf(id) >= 0;
        },

        isOnDesktop: function(app) {
            if (!app) return false;
            if (this.isPermanentDesktopApp(app.id)) return true;
            const pins = this.desktopPins();
            if (Object.prototype.hasOwnProperty.call(pins, app.id)) return !!pins[app.id];
            return this.DESKTOP_DEFAULT.indexOf(app.id) >= 0;
        },

        // Every installed program that is not on the desktop: what the All
        // Programs window lists, filed under its category.
        offDesktopByCategory: function() {
            return this.appsByCategory().map(group => ({
                category: group.category,
                label: group.label,
                apps: group.apps.filter(app => !this.isOnDesktop(app))
            })).filter(group => group.apps.length);
        },

        // Pin (or unpin) a program on the desktop. An optional cell says where
        // a dragged shortcut was dropped; it is honoured when legal.
        setOnDesktop: function(id, on, cell) {
            const app = this._apps[id];
            if (!app) return false;
            if (!on && this.isPermanentDesktopApp(id)) return false;
            const pins = this.desktopPins();
            pins[id] = !!on;
            const layout = this.DesktopGrid.savedLayout();
            if (layout) {
                if (on && cell) layout[id] = { c: cell.c, r: cell.r };
                if (!on) delete layout[id];
            }
            this.refreshDesktopIcons();
            this.refreshAllProgramsWindows();
            return true;
        },
        
        launchApp: function(id) {
            const app = this._apps[id];
            if (app && !this.isInstalled(app)) {
                if (this.Dialog) this.Dialog.error(T('HypernetOS.xp.run.removed', { name: app.name }), app.name);
                return;
            }
            if (app && typeof app.launchFn === 'function') {
                let spawned = null;
                // Add or Remove Programs reads how often and when a program ran.
                if (window.HypernetFileSystem && !/^sys-|^app-run$/.test(id)) {
                    const usage = window.HypernetFileSystem.getRegistry('appUsage', {}) || {};
                    const rec = usage[id] || { count: 0, last: '' };
                    rec.count++;
                    rec.last = this.clockStamp ? this.clockStamp().slice(0, 10) : '';
                    usage[id] = rec;
                    window.HypernetFileSystem.setRegistry('appUsage', usage);
                }
                try {
                    // Close start menu on launch
                    const startMenu = document.getElementById('hypernet-start-menu');
                    const startBtn = document.getElementById('hypernet-start-btn');
                    if (startMenu) startMenu.classList.remove('open');
                    if (startBtn) startBtn.classList.remove('active');
                    
                    if (window.HypernetOS.Kernel) {
                        const proc = window.HypernetOS.Kernel.spawnProcess(app.name || id, app);
                        // Out of memory is a thing the machine says out loud.
                        // It used to be a buzz and nothing else, which read as
                        // an app that simply refused to open.
                        if (!proc) {
                            if (window.SoundManager) SoundManager.playBuzzer();
                            if (this.Dialog) {
                                this.Dialog.error(T('HypernetOS.oomMessage', { name: app.name || id }),
                                    T('HypernetOS.oomTitle'));
                            }
                            return;
                        }
                        spawned = proc;
                        window.HypernetOS.currentLaunchingPid = proc.pid;
                        window.HypernetOS.currentLaunchingPidAdopted = false;
                    }

                    // Which program is opening, so the window it creates can be
                    // grouped under it on the taskbar. Same handover as the pid.
                    window.HypernetOS.currentLaunchingApp = id;
                    app.launchFn();
                    // A launch that opened no window of its own (a program
                    // already on screen, or one that leaves the desktop for a
                    // scene) has nothing to hand its process back on close, so
                    // it is handed back here instead of leaking its memory.
                    const adopted = window.HypernetOS.currentLaunchingPidAdopted;
                    window.HypernetOS.currentLaunchingPid = null;
                    window.HypernetOS.currentLaunchingPidAdopted = false;
                    window.HypernetOS.currentLaunchingApp = null;
                    if (spawned && !adopted && window.HypernetOS.Kernel) {
                        window.HypernetOS.Kernel.killProcess(spawned.pid);
                        spawned = null;
                    }

                    if (window.SoundManager) SoundManager.playOk();
                } catch (err) {
                    // A launch that threw halfway leaves the process it was
                    // given and the pid stamp on the next window behind it:
                    // hand both back so the machine stays consistent.
                    console.error(`Error launching app ${id}:`, err);
                    window.HypernetOS.currentLaunchingPid = null;
                    window.HypernetOS.currentLaunchingApp = null;
                    if (spawned && window.HypernetOS.Kernel) {
                        window.HypernetOS.Kernel.killProcess(spawned.pid);
                    }
                    if (window.HypernetOS.XP && window.HypernetFileSystem
                        && !window.HypernetFileSystem.getRegistry('errorReportingOff', false)) {
                        window.HypernetOS.XP.errorReport(app.name || id, err);
                    }
                }
            } else {
                console.warn(`App "${id}" is not registered or missing launchFn.`);
            }
        },
        
        getIconHTML: function(icon, size = 32) {
            if (typeof icon === 'number') {
                const cols = 16;
                const col = icon % cols;
                const row = Math.floor(icon / cols);
                const posX = -(col * 32);
                const posY = -(row * 32);
                return `
                    <div style="width: ${size}px; height: ${size}px; overflow: hidden; display: inline-block; position: relative; flex-shrink: 0; border-radius: 4px; vertical-align: middle; background: transparent">
                        <div style="position: absolute; top: 0; left: 0; width: 512px; height: 2048px; background-image: url('img/system/IconSet.png'); background-position: ${posX}px ${posY}px; background-repeat: no-repeat; transform: scale(${size / 32}); transform-origin: 0 0; image-rendering: pixelated"></div>
                    </div>
                `;
            }
            if (typeof icon === 'string') {
                if (icon.trim().startsWith('<')) {
                    return icon;
                }
                if (icon.match(/\.(png|jpg|jpeg|webp|gif)/i)) {
                    return `<img src="${icon}" style="width: ${size}px; height: ${size}px; display: inline-block; object-fit: contain" />`;
                }
                return `<span class="hypernet-icon-text" style="font-size: ${size * 0.7}px; line-height: ${size}px; display: inline-block; vertical-align: middle">${icon}</span>`;
            }
            return '';
        },
        
        refreshDesktopIcons: function() {
            const iconsContainer = document.getElementById('hypernet-desktop-icons-container');
            if (!iconsContainer) return;

            const grid = this.DesktopGrid;
            iconsContainer.innerHTML = '';
            grid.icons = [];

            Object.values(this._apps).forEach(app => {
                if (!this.isOnDesktop(app) || !this.isInstalled(app)) return;

                const iconDiv = document.createElement('div');
                iconDiv.className = 'desktop-icon';
                iconDiv.title = app.name;
                iconDiv.dataset.appId = app.id;
                iconDiv.innerHTML = `
                    <div class="desktop-icon-img">${this.getIconHTML(app.icon, 72)}</div>
                    <div class="desktop-icon-text">${app.name}</div>
                `;

                // Classic double click, but single click for accessibility/RPG gameplay.
                // A drag that just ended swallows the click it would otherwise fire.
                iconDiv.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (iconDiv._hnDragged) { iconDiv._hnDragged = false; return; }
                    this.launchApp(app.id);
                });

                grid.attachDrag(iconDiv);
                iconsContainer.appendChild(iconDiv);
                grid.icons.push({ app, el: iconDiv, cell: null });
            });

            grid.assignCells();
            grid.layout();
        },

        // --- Desktop icon grid -------------------------------------------------
        // Shortcuts sit on a fixed cell grid the player can rearrange by dragging
        // them with the mouse; each drop is remembered in the save file. Every
        // cell is the same: no column is reserved for anything.
        DesktopGrid: {
            CELL_W: 190,
            CELL_H: 200,
            PAD: 15,
            icons: [],
            _ghost: null,

            // Cells keep their full size while everything fits; on a small desktop
            // they shrink (and the icons go compact) rather than letting shortcuts
            // pile up in the last column.
            metrics: function() {
                const desk = document.getElementById('hypernet-os-desktop');
                const w = desk ? desk.clientWidth : window.innerWidth;
                const h = desk ? desk.clientHeight : Math.max(1, window.innerHeight - 40);
                const SCALES = [1, 0.92, 0.84, 0.76, 0.68, 0.6, 0.52];
                let cellW = this.CELL_W, cellH = this.CELL_H, cols = 1, rows = 1;
                for (let s = 0; s < SCALES.length; s++) {
                    cellW = Math.round(this.CELL_W * SCALES[s]);
                    cellH = Math.round(this.CELL_H * SCALES[s]);
                    cols = Math.max(1, Math.floor((w - this.PAD * 2) / cellW));
                    rows = Math.max(1, Math.floor((h - this.PAD * 2) / cellH));
                    if (cols * rows >= this.icons.length) break;
                }

                return { w, h, cols, rows, cellW, cellH, compact: cellW < this.CELL_W - 10 };
            },

            // Saved positions live on $gameSystem so a rearranged desktop survives
            // saving and loading. Missing before the game objects exist (plugin
            // load time), which simply means "no saved layout yet".
            savedLayout: function() {
                if (typeof $gameSystem === 'undefined' || !$gameSystem) return null;
                if (!$gameSystem._hypernetIconLayout) $gameSystem._hypernetIconLayout = {};
                return $gameSystem._hypernetIconLayout;
            },

            isLegalCell: function(entry, cell, m) {
                if (!cell) return false;
                return cell.c >= 0 && cell.r >= 0 && cell.c < m.cols && cell.r < m.rows;
            },

            // Honour every valid saved position first, then fill the remaining
            // icons into the first free legal cell, column by column.
            assignCells: function() {
                const m = this.metrics();
                const saved = this.savedLayout() || {};
                const taken = new Set();
                const key = (c, r) => c + ',' + r;

                this.icons.forEach(entry => { entry.cell = null; });

                this.icons.forEach(entry => {
                    const s = saved[entry.app.id];
                    if (!s) return;
                    const cell = { c: s.c, r: s.r };
                    if (!this.isLegalCell(entry, cell, m) || taken.has(key(cell.c, cell.r))) return;
                    entry.cell = cell;
                    taken.add(key(cell.c, cell.r));
                });

                this.icons.forEach(entry => {
                    if (entry.cell) return;
                    const cols = Array.from({ length: m.cols }, (_, i) => i);
                    for (const c of cols) {
                        for (let r = 0; r < m.rows; r++) {
                            if (taken.has(key(c, r))) continue;
                            entry.cell = { c, r };
                            taken.add(key(c, r));
                            return;
                        }
                    }
                    // Grid full: stack the overflow in the last legal column.
                    entry.cell = { c: cols[cols.length - 1] || 0, r: m.rows - 1 };
                });
            },

            cellRect: function(cell, m) {
                return {
                    left: this.PAD + cell.c * m.cellW,
                    top: this.PAD + cell.r * m.cellH
                };
            },

            cellFromPoint: function(x, y, m) {
                const c = Math.floor((x - this.PAD) / m.cellW);
                const r = Math.floor((y - this.PAD) / m.cellH);
                return {
                    c: Math.max(0, Math.min(m.cols - 1, c)),
                    r: Math.max(0, Math.min(m.rows - 1, r))
                };
            },

            layout: function() {
                const container = document.getElementById('hypernet-desktop-icons-container');
                if (!container) return;
                const m = this.metrics();

                this.icons.forEach(entry => {
                    if (!entry.cell) return;
                    const pos = this.cellRect(entry.cell, m);
                    entry.el.style.left = pos.left + 'px';
                    entry.el.style.top = pos.top + 'px';
                    entry.el.style.width = (m.cellW - 14) + 'px';
                    entry.el.classList.toggle('compact', m.compact);
                });

                const divider = container.querySelector('.desktop-icon-divider');
                if (divider) divider.parentNode.removeChild(divider);
            },

            persist: function() {
                const saved = this.savedLayout();
                if (!saved) return;
                this.icons.forEach(entry => {
                    if (entry.cell) saved[entry.app.id] = { c: entry.cell.c, r: entry.cell.r };
                });
            },

            showGhost: function(cell, legal, m) {
                const container = document.getElementById('hypernet-desktop-icons-container');
                if (!container) return;
                if (!this._ghost || !this._ghost.isConnected) {
                    this._ghost = document.createElement('div');
                    this._ghost.className = 'desktop-icon-ghost';
                    container.appendChild(this._ghost);
                }
                const pos = this.cellRect(cell, m);
                this._ghost.style.display = 'block';
                this._ghost.style.left = pos.left + 'px';
                this._ghost.style.top = pos.top + 'px';
                this._ghost.style.width = (m.cellW - 14) + 'px';
                this._ghost.style.height = (m.cellH - 14) + 'px';
                this._ghost.classList.toggle('illegal', !legal);
            },

            hideGhost: function() {
                if (this._ghost) this._ghost.style.display = 'none';
            },

            attachDrag: function(el) {
                el.addEventListener('mousedown', (e) => {
                    if (e.button !== 0) return;
                    const entry = this.icons.find(i => i.el === el);
                    if (!entry || !entry.cell) return;

                    const container = document.getElementById('hypernet-desktop-icons-container');
                    if (!container) return;

                    const startX = e.clientX;
                    const startY = e.clientY;
                    const rect = el.getBoundingClientRect();
                    const offX = startX - rect.left;
                    const offY = startY - rect.top;
                    const origin = { c: entry.cell.c, r: entry.cell.r };
                    let dragging = false;
                    let target = origin;
                    let targetLegal = true;

                    const onMove = (ev) => {
                        if (!dragging) {
                            if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < 6) return;
                            dragging = true;
                            el.classList.add('dragging');
                        }
                        const cr = container.getBoundingClientRect();
                        const left = ev.clientX - offX - cr.left;
                        const top = ev.clientY - offY - cr.top;
                        el.style.left = left + 'px';
                        el.style.top = top + 'px';

                        const m = this.metrics();
                        target = this.cellFromPoint(left + el.offsetWidth / 2, top + el.offsetHeight / 2, m);
                        targetLegal = this.isLegalCell(entry, target, m);
                        this.showGhost(target, targetLegal, m);
                    };

                    const onUp = (ev) => {
                        document.removeEventListener('mousemove', onMove, true);
                        document.removeEventListener('mouseup', onUp, true);
                        if (!dragging) return;

                        // Dropped on the Recycle Bin, or back in the All
                        // Programs window: the shortcut goes, and the program
                        // is listed in All Programs again.
                        if (ev && window.HypernetOS.isUnpinDropTarget(ev, entry.app.id)) {
                            el.classList.remove('dragging');
                            this.hideGhost();
                            el._hnDragged = true;
                            setTimeout(() => { el._hnDragged = false; }, 0);
                            if (window.HypernetOS.setOnDesktop(entry.app.id, false)) {
                                if (window.HypernetOS.XP) window.HypernetOS.XP.playEvent('recycle');   // i18n-ignore  event id
                                return;
                            }
                            this.layout();
                            return;
                        }

                        el.classList.remove('dragging');
                        this.hideGhost();
                        // Suppress the click this mouseup is about to fire, so
                        // dropping an icon never also launches its app. Cleared on
                        // the next tick in case the drop landed outside the icon
                        // and no click follows at all.
                        el._hnDragged = true;
                        setTimeout(() => { el._hnDragged = false; }, 0);

                        if (targetLegal && (target.c !== origin.c || target.r !== origin.r)) {
                            const m = this.metrics();
                            const other = this.icons.find(i => i !== entry && i.cell &&
                                i.cell.c === target.c && i.cell.r === target.r);
                            // An occupied cell swaps the two icons, but only if the
                            // displaced one may legally live where this one came from.
                            if (!other) {
                                entry.cell = target;
                            } else if (this.isLegalCell(other, origin, m)) {
                                other.cell = origin;
                                entry.cell = target;
                            }
                            this.persist();
                            if (window.SoundManager) SoundManager.playCursor();
                        }
                        this.layout();
                    };

                    document.addEventListener('mousemove', onMove, true);
                    document.addEventListener('mouseup', onUp, true);
                });
            }
        },

        // --- The left column of the start menu -----------------------------------
        // What was here was every program the machine had, filed under its
        // category and all of it on screen at once. The menu of the period was
        // three things instead: a short pinned list at the top, the programs
        // actually used under it, and All Programs as a flyout holding the
        // rest. The categories are still what All Programs files them under,
        // so nothing is lost, and the flat list is still there for anyone who
        // preferred it (the Start Menu tab of the taskbar's Properties).
        //
        // Pinned is a registry list; most-used is read off the same appUsage
        // record Add or Remove Programs reads, so the menu learns from the
        // player rather than from a second tally kept for it.
        PINNED_DEFAULT: ['app-hypernet-browser', 'app-hypernet-notepad'],   // i18n-ignore  app ids
        MFU_MAX: 6,

        pinnedIds: function() {
            const list = this.XP ? this.XP.reg('startPinned', null) : null;
            return (Array.isArray(list) ? list : this.PINNED_DEFAULT).filter(id => this._apps[id] && this.isInstalled(this._apps[id]));
        },

        setPinned: function(ids) {
            if (this.XP) this.XP.setReg('startPinned', ids.slice());
            this.refreshStartMenu();
        },

        // The programs this machine reaches for, most first, minus the ones
        // already pinned above and the shell's own plumbing.
        mostUsedIds: function() {
            const fs = window.HypernetFileSystem;
            const usage = (fs && fs.getRegistry('appUsage', {})) || {};
            const pinned = new Set(this.pinnedIds());
            return Object.keys(usage)
                .filter(id => this._apps[id] && this.isInstalled(this._apps[id]) && !pinned.has(id))
                .sort((a, b) => (usage[b].count || 0) - (usage[a].count || 0))
                .slice(0, this.MFU_MAX);
        },

        // The documents opened lately, newest first. window.HypernetOS.openFile
        // is the one door every document goes through, so it is what records
        // them, and a file since deleted drops off the list rather than sitting
        // on it as an entry that cannot open.
        RECENT_MAX: 10,

        recentDocs: function() {
            const fs = window.HypernetFileSystem;
            if (!fs) return [];
            const list = fs.getRegistry('recentDocs', []) || [];
            return list.filter(path => fs.exists(path)).slice(0, this.RECENT_MAX);
        },

        noteRecentDoc: function(path) {
            const fs = window.HypernetFileSystem;
            if (!fs || !path) return;
            const list = (fs.getRegistry('recentDocs', []) || []).filter(p => p !== path);
            list.unshift(path);
            fs.setRegistry('recentDocs', list.slice(0, this.RECENT_MAX));
        },

        clearRecentDocs: function() {
            const fs = window.HypernetFileSystem;
            if (fs) fs.setRegistry('recentDocs', []);
            this.refreshStartMenu();
        },

        // One row of the menu, however it was reached.
        startMenuRow: function(app, className) {
            const item = document.createElement('div');
            // The base class is what the focus ring collects rows by
            // (_getFocusables), so a variant class is added ALONGSIDE it
            // rather than in place of it: a row given a look of its own was
            // otherwise reachable with the mouse and with nothing else.
            item.className = 'start-menu-app-item' + (className ? ' ' + className : '');
            item.dataset.appId = app.id;
            item.innerHTML = `
                <div class="start-menu-app-icon">${this.getIconHTML(app.icon, 24)}</div>
                <div class="start-menu-app-name">${app.name}</div>
            `;
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                if (item._hnDragged) { item._hnDragged = false; return; }
                this.launchApp(app.id);
            });
            item.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const pinned = this.pinnedIds();
                const on = pinned.includes(app.id);
                this.ContextMenu.show(e.clientX, e.clientY, [
                    { label: T('HypernetOS.context.open'), icon: app.icon, bold: true, action: () => this.launchApp(app.id) },
                    { separator: true },
                    { label: on ? T('HypernetOS.context.removeFromDesktop') : T('HypernetOS.context.addToDesktop'),
                      action: () => this.setPinned(on ? pinned.filter(x => x !== app.id) : pinned.concat([app.id])) }
                ]);
            });
            this.attachStartMenuDrag(item, app);
            return item;
        },

        refreshStartMenu: function() {
            const listContainer = document.getElementById('start-menu-apps-list');
            if (!listContainer) return;

            listContainer.innerHTML = '';
            const K = k => T('HypernetOS.xp.taskbar.' + k);

            // The flat list of every program, filed under its category, is what
            // this menu always showed. It is now what All Programs shows, and
            // the Start Menu tab of the bar's Properties can put it back here.
            const flat = !(this.XP && this.XP.reg('startCategories', true));
            if (!flat) {
                const pinned = this.pinnedIds();
                if (pinned.length) {
                    const box = document.createElement('div');
                    box.className = 'start-menu-pinned';
                    pinned.forEach(id => box.appendChild(this.startMenuRow(this._apps[id])));
                    listContainer.appendChild(box);
                }
                const used = this.mostUsedIds();
                if (used.length) {
                    const box = document.createElement('div');
                    box.className = 'start-menu-mfu';
                    used.forEach(id => box.appendChild(this.startMenuRow(this._apps[id])));
                    listContainer.appendChild(box);
                }
                const all = document.createElement('div');
                all.className = 'start-menu-allprograms focusable';
                all.id = 'start-menu-allprograms';
                all.tabIndex = 0;
                all.innerHTML = `<div class="start-menu-app-name">${K('allPrograms')}</div><span class="start-menu-flyout-arrow"></span>`;
                all.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const box = all.getBoundingClientRect();
                    // Each category is one entry; opening it lists its programs.
                    this.ContextMenu.show(box.right, box.bottom, this.appsByCategory().map(group => ({
                        label: group.label,
                        action: () => this.ContextMenu.show(box.right, box.bottom, group.apps.map(app => ({
                            label: app.name, icon: app.icon, action: () => this.launchApp(app.id)
                        })))
                    })));
                });
                listContainer.appendChild(all);
                return;
            }

            // Programs are filed under their category headings. A heading
            // folds its group away; the folded set is remembered on the save.
            const folded = this.foldedCategories();
            this.appsByCategory().forEach(group => {
                const head = document.createElement('div');
                head.className = 'start-menu-category focusable' + (folded[group.category] ? ' folded' : '');
                head.tabIndex = 0;
                head.dataset.category = group.category;
                head.innerHTML = `<span class="start-menu-category-arrow"></span><span>${group.label}</span>`;
                head.addEventListener('click', (e) => {
                    e.stopPropagation();
                    folded[group.category] = !folded[group.category];
                    this.refreshStartMenu();
                    if (window.SoundManager) SoundManager.playCursor();
                });
                listContainer.appendChild(head);
                if (folded[group.category]) return;

                group.apps.forEach(app => listContainer.appendChild(this.startMenuRow(app)));
            });
        },

        foldedCategories: function() {
            if (typeof $gameSystem === 'undefined' || !$gameSystem) return {};
            if (!$gameSystem._hypernetFoldedCategories) $gameSystem._hypernetFoldedCategories = {};
            return $gameSystem._hypernetFoldedCategories;
        },

        attachStartMenuDrag: function(item, app) {
            this.attachPinDrag(item, app, true);
        },

        // A program dragged out of a list (the start menu, the All Programs
        // window) and dropped on bare desktop becomes a shortcut in the cell it
        // landed on. The item itself stays put: a ghost copy travels with the
        // pointer.
        attachPinDrag: function(item, app, closeMenu) {
            item.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                const startX = e.clientX, startY = e.clientY;
                let ghost = null;
                let dragging = false;

                const onMove = (ev) => {
                    if (!dragging) {
                        if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < 8) return;
                        dragging = true;
                        ghost = document.createElement('div');
                        ghost.className = 'desktop-icon start-menu-drag-ghost';
                        ghost.innerHTML = `
                            <div class="desktop-icon-img">${this.getIconHTML(app.icon, 72)}</div>
                            <div class="desktop-icon-text">${app.name}</div>`;
                        const host = document.getElementById('hypernet-os-container') || document.body;
                        host.appendChild(ghost);
                    }
                    ghost.style.left = (ev.clientX - 40) + 'px';
                    ghost.style.top = (ev.clientY - 40) + 'px';
                    const over = this._desktopDropTarget(ev);
                    ghost.classList.toggle('illegal', !over);
                };

                const onUp = (ev) => {
                    document.removeEventListener('mousemove', onMove, true);
                    document.removeEventListener('mouseup', onUp, true);
                    if (!dragging) return;
                    if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
                    item._hnDragged = true;
                    setTimeout(() => { item._hnDragged = false; }, 0);

                    if (!this._desktopDropTarget(ev)) return;
                    const container = document.getElementById('hypernet-desktop-icons-container');
                    let cell = null;
                    if (container) {
                        const cr = container.getBoundingClientRect();
                        const m = this.DesktopGrid.metrics();
                        cell = this.DesktopGrid.cellFromPoint(ev.clientX - cr.left, ev.clientY - cr.top, m);
                        if (!this.DesktopGrid.isLegalCell({ app }, cell, m)) cell = null;
                    }
                    this.setOnDesktop(app.id, true, cell);
                    if (closeMenu) this.closeStartMenu();
                    if (window.SoundManager) SoundManager.playOk();
                };

                document.addEventListener('mousemove', onMove, true);
                document.addEventListener('mouseup', onUp, true);
            });
        },

        // True when a dragged shortcut was let go somewhere that means "take
        // this off the desktop": the Recycle Bin icon, or an All Programs
        // window. The permanent icon never answers yes.
        isUnpinDropTarget: function(ev, appId) {
            if (this.isPermanentDesktopApp(appId)) return false;
            const el = document.elementFromPoint(ev.clientX, ev.clientY);
            if (!el) return false;
            if (el.closest('#win-app-all-programs')) return true;
            const icon = el.closest('.desktop-icon');
            return !!(icon && icon.dataset.appId === 'app-recycle' && appId !== 'app-recycle');   // i18n-ignore  app id
        },

        // Every open All Programs window, rebuilt: what it lists changes every
        // time a shortcut is pinned or unpinned.
        refreshAllProgramsWindows: function() {
            document.querySelectorAll('.xp-allprograms').forEach(root => {
                if (typeof root._hnRender === 'function') root._hnRender();
            });
        },

        // True when the pointer is over bare desktop: not the start menu, not
        // the taskbar, not an open window.
        _desktopDropTarget: function(ev) {
            const el = document.elementFromPoint(ev.clientX, ev.clientY);
            if (!el) return false;
            if (el.closest('#hypernet-start-menu') || el.closest('#hypernet-taskbar') ||
                el.closest('.hypernet-os-window')) return false;
            return !!el.closest('#hypernet-os-desktop');
        },

        closeStartMenu: function() {
            const startMenu = document.getElementById('hypernet-start-menu');
            const startBtn = document.getElementById('hypernet-start-btn');
            if (startMenu) startMenu.classList.remove('open');
            if (startBtn) startBtn.classList.remove('active');
        },

        // The buttons along the bar. Two things the bar has always done and
        // this one did not: it groups the windows of one program under a single
        // button once there is no room left for them all, and every button
        // answers a right click with the window menu (Restore, Minimize,
        // Maximize, Close) rather than only a left click.
        //
        // Grouping is by the program that opened the window, which is the app
        // id stamped on it, so two documents of the same program group and two
        // programs never do. It only kicks in past GROUP_AT windows, the way
        // the bar only grouped when it ran out of room.
        GROUP_AT: 6,

        taskbarGroups: function() {
            const wins = this.WindowManager.windows;
            const grouping = this.XP ? this.XP.reg('taskbarGroup', true) : true;
            if (!grouping || wins.length <= this.GROUP_AT) return wins.map(w => ({ windows: [w] }));
            const byApp = new Map();
            for (const w of wins) {
                const key = w.dataset.appId || w.id || String(byApp.size);
                if (!byApp.has(key)) byApp.set(key, []);
                byApp.get(key).push(w);
            }
            return Array.from(byApp.values()).map(list => ({ windows: list }));
        },

        // Drop the window menu at a point. Alt+Space, the title bar's right
        // click and the icon at its left end are the three ways in, and this is
        // the one that draws it.
        showWindowMenu: function(win, x, y) {
            if (!win) return;
            this.ContextMenu.show(x, y, this.windowMenuItems(win));
        },

        // The window menu, on a taskbar button or on a title bar. Each verb is
        // greyed rather than hidden when it cannot apply, the way it was.
        windowMenuItems: function(win) {
            const WM = this.WindowManager;
            const K = k => T('HypernetOS.xp.taskbar.' + k);
            const maxed = win.classList.contains('maximized');
            const mini = win.classList.contains('minimized');
            return [
                { label: K('restore'), disabled: !maxed && !mini, action: () => {
                    if (mini) WM.toggleMinimize(win); else if (maxed) WM.toggleMaximize(win);
                } },
                { label: K('minimize'), disabled: mini, action: () => WM.toggleMinimize(win) },
                { label: K('maximize'), disabled: maxed, action: () => {
                    if (mini) WM.toggleMinimize(win);
                    if (!win.classList.contains('maximized')) WM.toggleMaximize(win);
                } },
                { separator: true },
                { label: K('close'), bold: true, action: () => WM.closeWindow(win) }
            ];
        },

        // Cascade / Tile, the three verbs the bar's menu offers. A minimized
        // window is left where it is: it is not on the desktop to be arranged.
        arrangeWindows: function(how) {
            const WM = this.WindowManager;
            const wins = WM.windows.filter(w => !w.classList.contains('minimized'));
            if (!wins.length) return;
            const host = document.getElementById('hypernet-os-desktop');
            const W = (host && host.clientWidth) || window.innerWidth || 1280;
            const H = ((host && host.clientHeight) || window.innerHeight || 800) - TASKBAR_H;
            const place = (win, x, y, w, h) => {
                if (win.classList.contains('maximized')) WM.toggleMaximize(win);
                win.style.left = Math.round(x) + 'px';
                win.style.top = Math.round(y) + 'px';
                win.style.width = Math.round(w) + 'px';
                win.style.height = Math.round(h) + 'px';
            };
            if (how === 'cascade') {
                const step = 26;
                wins.forEach((win, i) => {
                    const off = i * step;
                    place(win, 20 + off, 20 + off, Math.max(320, W * 0.62), Math.max(240, H * 0.62));
                    WM.bringToFront(win);
                });
                return;
            }
            const n = wins.length;
            if (how === 'tileV') {
                const w = W / n;
                wins.forEach((win, i) => place(win, i * w, 0, w, H));
            } else {
                const h = H / n;
                wins.forEach((win, i) => place(win, 0, i * h, W, h));
            }
        },

        refreshTaskbarTabs: function() {
            const bar = document.getElementById('hypernet-taskbar-tabs');
            if (!bar) return;
            bar.innerHTML = '';

            this.taskbarGroups().forEach(group => {
                const wins = group.windows;
                const lead = wins[0];
                const grouped = wins.length > 1;
                const title = grouped
                    ? T('HypernetOS.xp.taskbar.groupOf', {
                        name: (this._apps[lead.dataset.appId] && this._apps[lead.dataset.appId].name) || lead.dataset.title || T('HypernetOS.untitledWindow'),
                        count: wins.length })
                    : (lead.dataset.title || T('HypernetOS.untitledWindow'));
                const iconHTML = lead.dataset.iconHTML || '';
                const isActive = wins.some(w => w.classList.contains('active'));
                const isMinimized = wins.every(w => w.classList.contains('minimized'));

                const tab = document.createElement('div');
                tab.className = `taskbar-tab ${isActive ? 'active' : ''} ${isMinimized ? 'minimized' : ''} ${grouped ? 'grouped' : ''}`;
                tab.dataset.appId = lead.dataset.appId || '';
                tab.innerHTML = `
                    ${iconHTML ? `<span class="taskbar-tab-icon">${iconHTML}</span>` : ''}
                    <span class="taskbar-tab-text">${title}</span>
                `;

                // A grouped button opens the list of its windows; a lone one is
                // the window, and clicking it minimizes and restores as before.
                tab.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (grouped) {
                        const box = tab.getBoundingClientRect();
                        this.ContextMenu.show(box.left, box.top, wins.map(w => ({
                            label: w.dataset.title || T('HypernetOS.untitledWindow'),
                            icon: this._apps[w.dataset.appId] && this._apps[w.dataset.appId].icon,
                            action: () => {
                                if (w.classList.contains('minimized')) this.WindowManager.toggleMinimize(w);
                                else this.WindowManager.bringToFront(w);
                            }
                        })).concat([{ separator: true }, {
                            label: T('HypernetOS.xp.taskbar.closeGroup'),
                            action: () => wins.slice().forEach(w => this.WindowManager.closeWindow(w))
                        }]));
                        return;
                    }
                    if (isActive) this.WindowManager.toggleMinimize(lead);
                    else if (isMinimized) this.WindowManager.toggleMinimize(lead);
                    else this.WindowManager.bringToFront(lead);
                });

                tab.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const items = grouped
                        ? [{ label: T('HypernetOS.xp.taskbar.closeGroup'), bold: true,
                             action: () => wins.slice().forEach(w => this.WindowManager.closeWindow(w)) }]
                        : this.windowMenuItems(lead);
                    this.ContextMenu.show(e.clientX, e.clientY, items);
                });

                bar.appendChild(tab);
            });
        },

        // --- Quick Launch -------------------------------------------------------
        // The strip beside Start: Show Desktop first, then whatever the player
        // pinned there. It is a registry list so it survives a log off, and it
        // is drawn from the same app registry every other launcher reads.
        QUICK_DEFAULT: ['app-hypernet-browser', 'app-hypernet-notepad', 'my-computer'],   // i18n-ignore  app ids

        quickLaunchIds: function() {
            const list = this.XP ? this.XP.reg('quickLaunch', null) : null;
            return (Array.isArray(list) ? list : this.QUICK_DEFAULT).filter(id => this._apps[id]);
        },

        setQuickLaunch: function(ids) {
            if (this.XP) this.XP.setReg('quickLaunch', ids.slice());
            this.refreshQuickLaunch();
        },

        refreshQuickLaunch: function() {
            const strip = document.getElementById('hypernet-quick-launch');
            if (!strip) return;
            const on = this.XP ? this.XP.reg('quickLaunchShown', true) : true;
            strip.classList.toggle('hidden', !on);
            strip.innerHTML = '';
            if (!on) return;

            const K = k => T('HypernetOS.xp.taskbar.' + k);
            const button = (title, inner, run) => {
                const b = document.createElement('div');
                b.className = 'quick-launch-btn focusable';
                b.tabIndex = 0;
                b.title = title;
                b.innerHTML = inner;
                b.addEventListener('click', e => { e.stopPropagation(); run(); });
                strip.appendChild(b);
                return b;
            };
            const desk = button(K('showDesktop'), '<span class="quick-showdesk"></span>',
                () => this.XP && this.XP.showDesktop());
            desk.id = 'quick-show-desktop';
            for (const id of this.quickLaunchIds()) {
                const app = this._apps[id];
                const b = button(app.name, this.getIconHTML(app.icon, 16), () => this.launchApp(id));
                b.dataset.appId = id;
                b.addEventListener('contextmenu', e => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.ContextMenu.show(e.clientX, e.clientY, [
                        { label: T('HypernetOS.context.open'), bold: true, action: () => this.launchApp(id) },
                        { separator: true },
                        { label: T('HypernetOS.context.removeFromDesktop'),
                          action: () => this.setQuickLaunch(this.quickLaunchIds().filter(x => x !== id)) }
                    ]);
                });
            }
        }
    };

    // --- Kernel & Esoteric File System ---
    const fs = (typeof require !== 'undefined') ? require('fs') : null;
    const path = (typeof require !== 'undefined') ? require('path') : null;

    class Process {
        constructor(pid, name, executable, footprint) {
            this.pid = pid;
            this.name = name;
            this.executable = executable; // function or object
            this.status = 'READY'; // READY, RUNNING, SUSPENDED, KILLED
            this.cpuUsage = 0; // Simulated %
            this.memoryUsage = footprint;
            // When the desktop handed this process out. A program that never
            // opened a window is only reclaimed once its grace period is over,
            // so an app that builds its frame a tick late still keeps its pid.
            this.startedAt = Date.now();
        }
        tick() {
            if (this.status === 'RUNNING' && this.executable && typeof this.executable.update === 'function') {
                this.executable.update();
            }
        }
    }

    window.HypernetOS.Kernel = {
        processes: [],
        pidCounter: 1000,
        totalRAM: 512, // MB (2001 computer)
        totalCPU: 0,
        
        // How much a program weighs on this machine. The footprint is still the
        // 5 to 25MB of a 2001 desktop, but it is never allowed past a sixteenth
        // of the fitted memory: a 128MB deck could otherwise seat four windows
        // before the kernel started refusing to open anything at all.
        MIN_FOOTPRINT: 4,
        footprintFor: function() {
            const cap = Math.max(this.MIN_FOOTPRINT, Math.floor(this.totalRAM / 16));
            return Math.min(cap, Math.floor(Math.random() * 20) + 5);
        },

        // Processes whose window is gone are dead weight: the memory they hold
        // is never freed by anything else, so a desktop that had been opened a
        // few times reported itself full and buzzed at every launch. Anything
        // past the grace period with no frame of its own on screen is dropped.
        RECLAIM_GRACE_MS: 1500,
        reclaim: function() {
            const now = Date.now();
            const alive = new Set();
            if (typeof document !== 'undefined') {
                document.querySelectorAll('.hypernet-os-window[data-pid]').forEach(w => alive.add(String(w.dataset.pid)));
            }
            const kept = this.processes.filter(p =>
                alive.has(String(p.pid)) || (now - p.startedAt) < this.RECLAIM_GRACE_MS);
            const freed = this.processes.length - kept.length;
            this.processes = kept;
            return freed;
        },

        // A cold boot: the kernel is a singleton that outlives the scene, so
        // the desktop coming up has to start from an empty process table and a
        // fresh uptime rather than from whatever the last session left behind.
        reset: function() {
            this.processes = [];
            this.totalCPU = 0;
            this.bootTime = Date.now();
        },

        spawnProcess: function(name, executable) {
            this.reclaim();
            const footprint = this.footprintFor();
            if (this.getUsedRAM() + footprint > this.totalRAM) {
                console.error(`OOM: Cannot allocate ${footprint}MB for ${name}.`);
                return null;
            }
            const process = new Process(this.pidCounter++, name, executable, footprint);
            process.status = 'RUNNING';
            this.processes.push(process);
            return process;
        },
        
        killProcess: function(pid) {
            const idx = this.processes.findIndex(p => p.pid == pid);
            if (idx > -1) {
                this.processes[idx].status = 'KILLED';
                this.processes.splice(idx, 1);
                return true;
            }
            return false;
        },

        findProcess: function(pid) {
            return this.processes.find(p => p.pid == pid) || null;
        },

        // A suspended process keeps its memory but stops being ticked and stops
        // counting towards the load, which is what the machine does when a
        // window is minimised and what the shell's SUSPEND asks for.
        setStatus: function(pid, status) {
            const proc = this.findProcess(pid);
            if (!proc) return false;
            proc.status = status;
            if (status === 'SUSPENDED') proc.cpuUsage = 0;
            return true;
        },

        // Seconds the machine has been up. The kernel is created with the OS
        // scene, so this is honestly "since the desktop came up".
        bootTime: Date.now(),
        uptime: function() {
            return Math.max(0, Math.floor((Date.now() - this.bootTime) / 1000));
        },

        // One reader for every place that prints the machine's condition: the
        // task manager, the shell's MEM and SYSTEMINFO, the control panel.
        getStats: function() {
            const usedRAM = this.getUsedRAM();
            return {
                totalRAM: this.totalRAM,
                usedRAM: usedRAM,
                freeRAM: Math.max(0, this.totalRAM - usedRAM),
                cpu: this.totalCPU,
                processes: this.processes.length,
                uptime: this.uptime()
            };
        },
        
        getUsedRAM: function() {
            return this.processes.reduce((sum, p) => sum + p.memoryUsage, 0);
        },
        
        tick: function() {
            let baseCPU = 2;
            this.processes.forEach(p => {
                if (p.status === 'RUNNING') {
                    p.tick();
                    p.cpuUsage = Math.max(0, Math.floor(Math.random() * 5)); // Simulate active cpu load per app
                    baseCPU += p.cpuUsage;
                }
            });
            this.totalCPU = Math.min(100, baseCPU);
        }
    };

    window.HypernetOS.EFS = {
        getBasePath: function() {
            if (!fs || !path) return null;
            const base = path.dirname(process.mainModule.filename);
            const saveId = (typeof $gameSystem !== 'undefined' && $gameSystem) ? $gameSystem.savefileId() : 1;
            const dir = path.join(base, 'save', 'filesystem', `save${saveId}`);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            return dir;
        },
        
        readFile: function(relPath) {
            const base = this.getBasePath();
            if (!base) return null;
            const fullPath = path.join(base, relPath);
            if (fs.existsSync(fullPath)) {
                return fs.readFileSync(fullPath, 'utf8');
            }
            return null;
        },
        
        writeFile: function(relPath, content) {
            const base = this.getBasePath();
            if (!base) return false;
            const fullPath = path.join(base, relPath);
            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(fullPath, content, 'utf8');
            return true;
        },
        
        readDir: function(relPath) {
            const base = this.getBasePath();
            if (!base) return [];
            const fullPath = relPath ? path.join(base, relPath) : base;
            if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
                return fs.readdirSync(fullPath);
            }
            return [];
        },
        
        mkdir: function(relPath) {
            const base = this.getBasePath();
            if (!base) return false;
            const fullPath = path.join(base, relPath);
            if (!fs.existsSync(fullPath)) {
                fs.mkdirSync(fullPath, { recursive: true });
                return true;
            }
            return false;
        }
    };

    window.HypernetOS.Syscalls = {
        spawn: (name, executable) => window.HypernetOS.Kernel.spawnProcess(name, executable),
        kill: (pid) => window.HypernetOS.Kernel.killProcess(pid),
        readFile: (path) => window.HypernetOS.EFS.readFile(path),
        writeFile: (path, data) => window.HypernetOS.EFS.writeFile(path, data),
        readDir: (path) => window.HypernetOS.EFS.readDir(path),
        mkdir: (path) => window.HypernetOS.EFS.mkdir(path),
        createWindow: (options) => window.HypernetOS.WindowManager.createWindow(options),
        closeWindow: (win) => window.HypernetOS.WindowManager.closeWindow(win)
    };

    // --- Dynamic Window Manager ---
    // Cheap accessor for the currently-active window. bringToFront() keeps the
    // cache warm; this only re-queries the DOM when the cached node is gone or no
    // longer marked active (window closed / minimized / focus changed elsewhere).
    window.HypernetOS._getActiveWindow = function() {
        const cached = window.HypernetOS._activeWindowCache;
        if (cached && cached.isConnected && cached.classList.contains('active')) {
            return cached;
        }
        const found = document.querySelector('.hypernet-os-window.active');
        window.HypernetOS._activeWindowCache = found;
        return found;
    };

    // Height of #hypernet-taskbar (see hypernet.css); windows are kept clear of it.
    const TASKBAR_H = 40;

    window.HypernetOS.WindowManager = {
        windows: [],
        zIndexCounter: 100,

        createWindow: function(options) {
            let { id, title, contentHTML, width = 800, height = 600, icon = '' } = options;

            // Make every OS app window slightly bigger, clamped to the viewport
            // (leave room for margins and the taskbar) so large windows never overflow.
            const WINDOW_SCALE = 1.18;
            width = Math.min(Math.round(width * WINDOW_SCALE), window.innerWidth - 20);
            height = Math.min(Math.round(height * WINDOW_SCALE), window.innerHeight - 60);

            // Check if window already exists
            const existing = document.getElementById(id);
            if (existing) {
                if (existing.classList.contains('minimized')) {
                    this.toggleMinimize(existing);
                }
                this.bringToFront(existing);
                return existing;
            }

            const win = document.createElement('div');
            win.id = id;
            win.className = 'hypernet-os-window';
            win.dataset.title = title;
            if (window.HypernetOS.currentLaunchingApp) {
                win.dataset.appId = window.HypernetOS.currentLaunchingApp;
            }
            if (window.HypernetOS.currentLaunchingPid) {
                win.dataset.pid = window.HypernetOS.currentLaunchingPid;
                window.HypernetOS.currentLaunchingPidAdopted = true;
            }
            
            const iconHTML = window.HypernetOS.getIconHTML(icon, 16);
            win.dataset.iconHTML = iconHTML;
            
            // Initial positioning (center/cascade offset). The cascade is capped
            // at whatever room is left over the taskbar: on a short screen (a
            // 1280x800 handheld) a window clamped to the full viewport height has
            // no slack at all, and an uncapped cascade walked the fourth or fifth
            // window's titlebar off the bottom, taking the only way to drag it
            // back with it.
            const maxX = Math.max(10, window.innerWidth - width - 10);
            const maxY = Math.max(10, window.innerHeight - height - TASKBAR_H - 10);
            const startX = Math.min(maxX,
                Math.max(10, (window.innerWidth - width) / 2 + (this.windows.length * 25)));
            const startY = Math.min(maxY,
                Math.max(10, (window.innerHeight - height - 40) / 2 + (this.windows.length * 25)));
            
            win.style.width = width + 'px';
            win.style.height = height + 'px';
            win.style.left = startX + 'px';
            win.style.top = startY + 'px';
            win.style.zIndex = ++this.zIndexCounter;

            win.innerHTML = `
                <div class="hypernet-window-border">
                    <div class="hypernet-window-titlebar">
                        <div class="hypernet-window-title">
                            ${iconHTML ? `<span class="hypernet-window-icon">${iconHTML}</span>` : ''}
                            ${title}
                        </div>
                        <div class="hypernet-window-controls">
                            <button class="hypernet-btn hypernet-btn-min" title="${T('HypernetOS.minimize')}">0</button>
                            <button class="hypernet-btn hypernet-btn-max" title="${T('HypernetOS.maximize')}">1</button>
                            <button class="hypernet-btn hypernet-btn-close" title="${T('HypernetOS.close')}">r</button>
                        </div>
                    </div>
                    <div class="hypernet-window-content">
                        ${contentHTML}
                    </div>
                    <!-- Resizer Handles -->
                    <div class="resize-handle resize-n"></div>
                    <div class="resize-handle resize-e"></div>
                    <div class="resize-handle resize-s"></div>
                    <div class="resize-handle resize-w"></div>
                    <div class="resize-handle resize-ne"></div>
                    <div class="resize-handle resize-nw"></div>
                    <div class="resize-handle resize-se"></div>
                    <div class="resize-handle resize-sw"></div>
                </div>
            `;

            document.getElementById('hypernet-os-desktop').appendChild(win);
            this.windows.push(win);

            this.setupWindowEvents(win);
            this.bringToFront(win);
            
            // Refresh tabs
            window.HypernetOS.refreshTaskbarTabs();

            // Open Animation
            win.style.transform = 'scale(0.95)';
            win.style.opacity = '0';
            requestAnimationFrame(() => {
                win.style.transition = 'transform 0.15s cubic-bezier(0.1, 0.9, 0.2, 1), opacity 0.15s ease';
                win.style.transform = 'scale(1)';
                win.style.opacity = '1';
                setTimeout(() => { win.style.transition = ''; }, 150);
            });

            return win;
        },

        // An app whose client area is an iframe (the browser) swallows every
        // mousemove and mouseup the moment the pointer crosses into it, which
        // strands a titlebar drag or a border resize halfway through. Marking
        // the desktop while either is running lets the CSS switch iframes off
        // for the duration, so the OS titlebar and handles stay in charge.
        setDragState: function(active) {
            const desktop = document.getElementById('hypernet-os-desktop');
            if (desktop) desktop.classList.toggle('os-window-dragging', !!active);
        },

        setupWindowEvents: function(win) {
            const titlebar = win.querySelector('.hypernet-window-titlebar');
            const closeBtn = win.querySelector('.hypernet-btn-close');
            const maxBtn = win.querySelector('.hypernet-btn-max');
            const minBtn = win.querySelector('.hypernet-btn-min');
            
            // Focus on click
            win.addEventListener('mousedown', () => this.bringToFront(win));
            
            // Close Action
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeWindow(win);
            });

            // Maximize Action
            maxBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleMaximize(win);
            });

            // Minimize Action
            minBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleMinimize(win);
            });

            // The title bar's own three habits, none of which this window had:
            // a double click maximizes and restores, a right click drops the
            // window menu, and so does the icon at its left end (which is where
            // Alt+Space put it, and Alt+Space is wired in the scene's keys).
            titlebar.addEventListener('dblclick', (e) => {
                if (e.target.closest('.hypernet-btn')) return;
                e.stopPropagation();
                this.toggleMaximize(win);
            });
            titlebar.addEventListener('contextmenu', (e) => {
                if (e.target.closest('.hypernet-btn')) return;
                e.preventDefault();
                e.stopPropagation();
                window.HypernetOS.showWindowMenu(win, e.clientX, e.clientY);
            });
            const sysIcon = win.querySelector('.hypernet-window-icon');
            if (sysIcon) sysIcon.addEventListener('click', (e) => {
                e.stopPropagation();
                const box = win.getBoundingClientRect();
                window.HypernetOS.showWindowMenu(win, box.left + 2, box.top + 24);
            });

            // Window Dragging
            let isDragging = false;
            let dragOffsetX = 0;
            let dragOffsetY = 0;

            titlebar.addEventListener('mousedown', (e) => {
                if (win.classList.contains('maximized')) return;
                // Exclude window control buttons from drag triggers
                if (e.target.closest('.hypernet-btn')) return;
                
                isDragging = true;
                this.bringToFront(win);
                this.setDragState(true);

                const rect = win.getBoundingClientRect();
                dragOffsetX = e.clientX - rect.left;
                dragOffsetY = e.clientY - rect.top;
                
                const onMouseMove = (ev) => {
                    if (!isDragging) return;
                    
                    // Constrain within screen boundaries roughly
                    let x = ev.clientX - dragOffsetX;
                    let y = ev.clientY - dragOffsetY;
                    
                    // Taskbar heights restriction
                    const maxTop = window.innerHeight - 40 - 30;
                    y = Math.max(0, Math.min(y, maxTop));
                    
                    win.style.left = x + 'px';
                    win.style.top = y + 'px';
                };
                
                const onMouseUp = () => {
                    isDragging = false;
                    this.setDragState(false);
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                };
                
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });

            // Border Drag Resizing
            const handles = win.querySelectorAll('.resize-handle');
            handles.forEach(handle => {
                handle.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                    if (win.classList.contains('maximized')) return;
                    this.bringToFront(win);
                    this.setDragState(true);

                    const direction = handle.className.replace('resize-handle resize-', '');
                    const startX = e.clientX;
                    const startY = e.clientY;
                    const startRect = win.getBoundingClientRect();
                    const minWidth = 320;
                    const minHeight = 200;

                    const onMouseMove = (ev) => {
                        let newWidth = startRect.width;
                        let newHeight = startRect.height;
                        let newLeft = startRect.left;
                        let newTop = startRect.top;

                        if (direction.includes('e')) newWidth = startRect.width + (ev.clientX - startX);
                        if (direction.includes('w')) {
                            const diff = startX - ev.clientX;
                            if (startRect.width + diff >= minWidth) {
                                newWidth = startRect.width + diff;
                                newLeft = startRect.left - diff;
                            }
                        }
                        if (direction.includes('s')) newHeight = startRect.height + (ev.clientY - startY);
                        if (direction.includes('n')) {
                            const diff = startY - ev.clientY;
                            if (startRect.height + diff >= minHeight) {
                                newHeight = startRect.height + diff;
                                newTop = startRect.top - diff;
                            }
                        }

                        if (newWidth >= minWidth) {
                            win.style.width = newWidth + 'px';
                            win.style.left = newLeft + 'px';
                        }
                        if (newHeight >= minHeight) {
                            win.style.height = newHeight + 'px';
                            win.style.top = newTop + 'px';
                        }
                    };

                    const onMouseUp = () => {
                        this.setDragState(false);
                        document.removeEventListener('mousemove', onMouseMove);
                        document.removeEventListener('mouseup', onMouseUp);
                    };

                    document.addEventListener('mousemove', onMouseMove);
                    document.addEventListener('mouseup', onMouseUp);
                });
            });
        },

        bringToFront: function(win) {
            this.zIndexCounter++;
            win.style.zIndex = this.zIndexCounter;
            
            this.windows.forEach(w => w.classList.remove('active'));
            win.classList.add('active');
            // Cache the active window so per-frame nav code avoids a document query.
            window.HypernetOS._activeWindowCache = win;

            window.HypernetOS.refreshTaskbarTabs();
        },

        // Pull every open window back inside the desktop. Window geometry is
        // stored in absolute pixels, so a viewport that gets shorter or narrower
        // (a resolution switch, leaving fullscreen, a Steam Deck moving between
        // its own 1280x800 panel and a docked display) would otherwise leave
        // windows hanging off the edge with their titlebars out of reach.
        reflowWindows: function() {
            const vw = window.innerWidth, vh = window.innerHeight;
            for (const win of this.windows) {
                if (!win || !win.isConnected) continue;
                if (win.classList.contains('maximized')) continue;
                const w = Math.min(win.offsetWidth, vw - 20);
                const h = Math.min(win.offsetHeight, vh - TASKBAR_H - 20);
                if (w !== win.offsetWidth) win.style.width = w + 'px';
                if (h !== win.offsetHeight) win.style.height = h + 'px';
                const x = Math.min(Math.max(0, vw - w - 10), Math.max(10, parseInt(win.style.left, 10) || 10));
                const y = Math.min(Math.max(0, vh - h - TASKBAR_H - 10), Math.max(10, parseInt(win.style.top, 10) || 10));
                win.style.left = x + 'px';
                win.style.top = y + 'px';
            }
        },

        toggleMaximize: function(win) {
            if (win.classList.contains('maximized')) {
                win.classList.remove('maximized');
                win.style.left = win.dataset.prevLeft;
                win.style.top = win.dataset.prevTop;
                win.style.width = win.dataset.prevWidth;
                win.style.height = win.dataset.prevHeight;
                win.querySelector('.hypernet-btn-max').textContent = '1';
                win.querySelector('.hypernet-btn-max').title = 'Maximize';
            } else {
                win.dataset.prevLeft = win.style.left;
                win.dataset.prevTop = win.style.top;
                win.dataset.prevWidth = win.style.width;
                win.dataset.prevHeight = win.style.height;
                
                win.classList.add('maximized');
                win.style.left = '0';
                win.style.top = '0';
                win.style.width = '100vw';
                win.style.height = 'calc(100vh - 40px)';
                win.querySelector('.hypernet-btn-max').textContent = '2';
                win.querySelector('.hypernet-btn-max').title = 'Restore Down';
            }
            window.HypernetOS.refreshTaskbarTabs();
        },

        toggleMinimize: function(win) {
            if (window.HypernetOS.XP) {
                window.HypernetOS.XP.playEvent(
                    win.classList.contains('minimized') ? 'restoreUp' : 'minimize');   // i18n-ignore  event ids
            }
            if (win.classList.contains('minimized')) {
                win.classList.remove('minimized');
                win.style.display = 'block';
                void win.offsetWidth; // Force layout
                win.style.transform = 'scale(1)';
                win.style.opacity = '1';
                this.bringToFront(win);
            } else {
                win.style.transform = 'scale(0.8) translateY(150px)';
                win.style.opacity = '0';
                win.classList.remove('active');
                setTimeout(() => {
                    win.classList.add('minimized');
                    win.style.display = 'none';
                    // Focus another window if any
                    const remaining = this.windows.filter(w => !w.classList.contains('minimized'));
                    if (remaining.length > 0) {
                        this.bringToFront(remaining[remaining.length - 1]);
                    } else {
                        window.HypernetOS.refreshTaskbarTabs();
                    }
                }, 150);
            }
        },

        closeWindow: function(win) {
            if (win.dataset.pid && window.HypernetOS.Kernel) {
                window.HypernetOS.Kernel.killProcess(win.dataset.pid);
            }
            win.style.transition = 'transform 0.12s ease-in, opacity 0.12s ease-in';
            win.style.transform = 'scale(0.9)';
            win.style.opacity = '0';
            setTimeout(() => {
                if (win.parentNode) win.parentNode.removeChild(win);
                this.windows = this.windows.filter(w => w !== win);
                win.dispatchEvent(new Event('hypernet-closed'));
                window.HypernetOS.refreshTaskbarTabs();
            }, 120);
        },

        closeAll: function() {
            const closed = this.windows.slice();
            closed.forEach(win => {
                // Shutting the machine down still ends every process it was
                // running; skipping this left their memory allocated for the
                // next session, which found itself full before it began.
                if (win.dataset.pid && window.HypernetOS.Kernel) {
                    window.HypernetOS.Kernel.killProcess(win.dataset.pid);
                }
                if (win.parentNode) win.parentNode.removeChild(win);
            });
            this.windows = [];
            // Turning the machine off is still a close: every app hangs its
            // teardown (scene terminate, stray overlays, timers) on this event,
            // so skipping it here left whole apps running with nothing on
            // screen, and their stale handles were ticked by the next session.
            closed.forEach(win => win.dispatchEvent(new Event('hypernet-closed')));
            window.HypernetOS.refreshTaskbarTabs();
        }
    };

    // Alias for backwards compatibility
    window.HypernetWindowManager = window.HypernetOS.WindowManager;

    // --- Scene_HypernetOS (RMMZ Desktop View) ---
    function Scene_HypernetOS() {
        this.initialize(...arguments);
    }

    Scene_HypernetOS.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_HypernetOS.prototype.constructor = Scene_HypernetOS;
    window.Scene_HypernetOS = Scene_HypernetOS;

    // An app's own DOM handlers (the inline onclick attributes every window's
    // markup is built from) run outside every guard the OS puts around launch
    // and the per-frame tick. One of them throwing used to reach RMMZ's global
    // error handler, which answers by stopping the scene and all audio: the
    // desktop stayed on screen with nothing updating and no way to shut it
    // down, and the only way out was killing the game. While the machine is the
    // running scene such an error is logged and the desktop keeps going.
    const _SceneManager_onError_HypernetOS = SceneManager.onError;
    SceneManager.onError = function(event) {
        if (SceneManager._scene instanceof Scene_HypernetOS) {
            console.error('HypernetOS: an application faulted.', event.message,
                event.filename, event.lineno);
            return;
        }
        _SceneManager_onError_HypernetOS.call(this, event);
    };

    const _SceneManager_onReject_HypernetOS = SceneManager.onReject;
    SceneManager.onReject = function(event) {
        if (SceneManager._scene instanceof Scene_HypernetOS) {
            console.error('HypernetOS: an application faulted.', event.reason);
            return;
        }
        _SceneManager_onReject_HypernetOS.call(this, event);
    };

    Scene_HypernetOS.prototype.initialize = function() {
        Scene_MenuBase.prototype.initialize.call(this);
        this._autoLaunchApp = null;
        this._clockInterval = null;
    };

    Scene_HypernetOS.prototype.prepare = function(params) {
        if (params && params.autoLaunch) {
            this._autoLaunchApp = params.autoLaunch;
            this._autoLaunchParams = params.shopParams || null;
        }
    };

    Scene_HypernetOS.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        // A cold boot. The kernel outlives the scene, so without this the
        // desktop came up with the last session's processes still allocated.
        if (window.HypernetOS.Kernel) window.HypernetOS.Kernel.reset();
        this.createBackground();
        this.loadFontsAndStylesheets();
        this.createDesktop();
        this.setupKeyboardHooks();
        this.startClock();
    };

    Scene_HypernetOS.prototype.createBackground = function() {
        this._backgroundSprite = new Sprite();
        this._backgroundSprite.bitmap = SceneManager.backgroundBitmap();
        this.addChild(this._backgroundSprite);
        
        const dimmer = new Sprite();
        dimmer.bitmap = new Bitmap(Graphics.width, Graphics.height);
        dimmer.bitmap.fillAll('rgba(0, 0, 0, 0.4)');
        this.addChild(dimmer);
    };

    Scene_HypernetOS.prototype.loadFontsAndStylesheets = function() {
        // Load custom fonts for modern premium look (Outfit for UI, Tahoma for classic feel)
        if (!document.getElementById('hypernet-os-fonts')) {
            const fonts = document.createElement('link');
            fonts.id = 'hypernet-os-fonts';
            fonts.rel = 'stylesheet';
            fonts.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;700&family=Tahoma:wght@400;700&display=swap';
            document.head.appendChild(fonts);
        }

        // Complete Archways XP Luna styling
        if (!document.getElementById('hypernet-os-styles')) {
            const link = document.createElement('link');
            link.id = 'hypernet-os-styles';
            link.rel = 'stylesheet';
            link.href = 'css/hypernet.css';
            document.head.appendChild(link);
        }
    };

    Scene_HypernetOS.prototype.createDesktop = function() {
        const existing = document.getElementById('hypernet-os-container');
        if (existing) {
            existing.parentNode.removeChild(existing);
        }

        this._container = document.createElement('div');
        this._container.id = 'hypernet-os-container';
        
        // Grab Lead character name/face for Start Menu
        let userName = T('HypernetOS.defaultUser');
        let userAvatarHTML = '';
        if ($gameParty.leader()) {
            userName = $gameParty.leader().name();
            // Optional: Draw lead's RMMZ icon as avatar
            userAvatarHTML = window.HypernetOS.getIconHTML(245, 28) || '';
        }

        this._container.innerHTML = `
            <div id="hypernet-os-desktop">
                <div id="hypernet-desktop-icons-container"></div>
            </div>

            <!-- Archways XP Start Menu -->
            <div id="hypernet-start-menu">
                <div class="start-menu-header">
                    <div class="start-menu-avatar">${userAvatarHTML}</div>
                    <div class="start-menu-username">${userName}</div>
                </div>
                <div class="start-menu-body">
                    <div class="start-menu-left" id="start-menu-apps-list">
                        <!-- Dynamically filled with registered apps -->
                    </div>
                    <div class="start-menu-right">
                        <div class="start-menu-link" id="link-my-computer">
                            <div class="start-menu-link-icon">${window.HypernetOS.getIconHTML(86, 16)}</div>
                            <div>${T('HypernetOS.myComputer')}</div>
                        </div>
                        <div class="start-menu-link" id="link-my-documents">
                            <div class="start-menu-link-icon">${window.HypernetOS.getIconHTML(191, 16)}</div>
                            <div>${T('HypernetOS.myDocuments')}</div>
                        </div>
                        <div class="start-menu-link" id="link-recent-docs">
                            <div class="start-menu-link-icon">${window.HypernetOS.getIconHTML(190, 16)}</div>
                            <div>${T('HypernetOS.xp.taskbar.recentDocs')}</div>
                            <span class="start-menu-flyout-arrow"></span>
                        </div>
                        <div class="start-menu-divider"></div>
                        <div class="start-menu-link" id="link-control-panel">
                            <div class="start-menu-link-icon">${window.HypernetOS.getIconHTML(234, 16)}</div>
                            <div>${T('HypernetOS.controlPanel')}</div>
                        </div>
                        <div class="start-menu-link" id="link-web-browser">
                            <div class="start-menu-link-icon">${window.HypernetOS.getIconHTML(188, 16)}</div>
                            <div>${T('HypernetOS.hypernetExplorer')}</div>
                        </div>
                        <div class="start-menu-divider"></div>
                        <div class="start-menu-link" id="link-help">
                            <div class="start-menu-link-icon">${window.HypernetOS.getIconHTML(190, 16)}</div>
                            <div>${T('HypernetOS.xp.help.appName')}</div>
                        </div>
                        <div class="start-menu-link" id="link-search">
                            <div class="start-menu-link-icon">${window.HypernetOS.getIconHTML(190, 16)}</div>
                            <div>${T('HypernetOS.xp.search.appName')}</div>
                        </div>
                        <div class="start-menu-link" id="link-run">
                            <div class="start-menu-link-icon">${window.HypernetOS.getIconHTML(234, 16)}</div>
                            <div>${T('HypernetOS.xp.run.menu')}</div>
                        </div>
                    </div>
                </div>
                <div class="start-menu-footer">
                    <div class="start-menu-btn" id="start-btn-logoff">
                        <div class="start-menu-btn-icon" style="background: #e6b0aa; color: #78281f">↩</div>
                        <div>${T('HypernetOS.logOff')}</div>
                    </div>
                    <div class="start-menu-btn" id="start-btn-turnoff">
                        <div class="start-menu-btn-icon" style="background: #ec7063; color: #512e2e"></div>
                        <div>${T('HypernetOS.turnOff')}</div>
                    </div>
                </div>
            </div>

            <!-- Bottom Taskbar -->
            <div id="hypernet-taskbar">
                <button id="hypernet-start-btn">
                    <div class="start-btn-logo">
                        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                            <defs>
                                <linearGradient id="archLogoGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stop-color="#fff2cf"/>
                                    <stop offset="100%" stop-color="#d9a441"/>
                                </linearGradient>
                            </defs>
                            <path d="M3,21 L3,9 A9,9 0 0 1 21,9 L21,21 L17,21 L17,11 A5,5 0 0 0 7,11 L7,21 Z" fill="url(#archLogoGrad)"/>
                        </svg>
                    </div>
                    start
                </button>
                <div id="hypernet-quick-launch"></div>
                <div id="hypernet-taskbar-tabs"></div>
                <div id="hypernet-system-tray">
                    <div id="tray-chevron" class="focusable" tabindex="0" title="${T('HypernetOS.xp.taskbar.showHidden')}"></div>
                    <div class="tray-icon" title="${T('HypernetOS.networkEstablished')}"></div>
                    <div class="tray-icon" title="${T('HypernetOS.encryptionMax')}"></div>
                    <div id="tray-clock">
                        <span id="tray-clock-time">12:00 PM</span>
                        <span id="tray-clock-date"></span>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(this._container);

        // Virtual analog cursor: lets a controller drive the OS desktop with the
        // left stick (A = click). The OS is otherwise mouse-only. pointer-events:none
        // so it never blocks document.elementFromPoint hit-testing underneath it.
        const aCursor = document.createElement('div');
        aCursor.id = 'hypernet-os-analog-cursor';
        aCursor.style.cssText = 'position:fixed; left:0; top:0; width:20px; height:20px; ' +
            'pointer-events:none; z-index:2147483647; display:none;';
        aCursor.innerHTML = '<svg width="20" height="20" viewBox="0 0 20 20">' +
            '<path d="M2,2 L2,16 L6,12 L9,18 L11,17 L8,11 L14,11 Z" ' +  // i18n-ignore  svg path data
            'fill="#ffffff" stroke="#000000" stroke-width="1.2"/></svg>';  // i18n-ignore  svg attributes
        this._container.appendChild(aCursor);
        this._analogCursor = aCursor;
        this._cursorX = window.innerWidth / 2;
        this._cursorY = window.innerHeight / 2;
        this._cursorAHeld = false;
        this._lastHoverEl = null;

        // Spatial focus navigation highlight: a ring drawn around the currently
        // focused interactive element. Driven by WASD / arrow keys and the
        // controller D-pad so the whole OS is operable without a mouse.
        const navHl = document.createElement('div');
        navHl.id = 'hypernet-os-nav-highlight';
        navHl.style.cssText = 'position:fixed; left:0; top:0; width:0; height:0; ' +
            'pointer-events:none; z-index:2147483646; display:none; box-sizing:border-box; ' +
            'border:2px solid #ffd54a; border-radius:4px; ' +
            'box-shadow:0 0 0 2px rgba(0,0,0,0.55), 0 0 10px 2px rgba(255,213,74,0.85); ' +
            'transition:left 0.07s ease, top 0.07s ease, width 0.07s ease, height 0.07s ease;';
        this._container.appendChild(navHl);
        this._navHighlight = navHl;
        this._focusEl = null;
        this._navMode = null;      // 'focus' (keyboard/d-pad) | 'cursor' (analog stick)
        this._navLastDir = null;
        this._navRepeatAt = 0;

        // Bind Start Button events
        const startBtn = document.getElementById('hypernet-start-btn');
        const startMenu = document.getElementById('hypernet-start-menu');
        
        startBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = startMenu.classList.contains('open');
            if (isOpen) {
                startMenu.classList.remove('open');
                startBtn.classList.remove('active');
            } else {
                startMenu.classList.add('open');
                startBtn.classList.add('active');
                if (window.SoundManager) SoundManager.playCursor();
            }
        });

        // Close Start Menu if clicking anywhere else
        this._documentClickHandler = (e) => {
            if (startMenu && startBtn && !startMenu.contains(e.target) && !startBtn.contains(e.target)) {
                startMenu.classList.remove('open');
                startBtn.classList.remove('active');
            }
            const CM = window.HypernetOS.ContextMenu;
            if (CM && CM.isOpen() && !CM.contains(e.target)) CM.hide();
        };
        document.addEventListener('click', this._documentClickHandler);

        // Right click anywhere on the OS surface is the mouse equivalent of
        // Escape / controller B: it closes the frontmost window, and leaves the
        // OS when the desktop is bare. The native context menu never shows.
        this._contextMenuHandler = (e) => {
            if (!this.isActive()) return;
            e.preventDefault();

            // A right click inside a text field is left to the field itself, so
            // typing in Notepad or a terminal is never interrupted.
            const tag = e.target && e.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;

            // The desktop, its shortcuts, the start menu's programs and the
            // screen buddy each answer a right click with a menu of their own.
            const CM = window.HypernetOS.ContextMenu;
            if (CM && CM.isOpen()) { CM.hide(); return; }
            const target = e.target;
            const icon = target.closest && target.closest('.desktop-icon:not(.start-menu-drag-ghost)');
            const startItem = target.closest && target.closest('.start-menu-app-item');
            const buddy = target.closest && target.closest('#hypernet-buddy');
            if (CM && icon && icon.dataset.appId) {
                CM.show(e.clientX, e.clientY, CM.itemsForShortcut(icon.dataset.appId));
                return;
            }
            if (CM && startItem && startItem.dataset.appId) {
                CM.show(e.clientX, e.clientY, CM.itemsForProgram(startItem.dataset.appId));
                return;
            }
            if (CM && buddy && window.HypernetOS.Buddy) {
                CM.show(e.clientX, e.clientY, window.HypernetOS.Buddy.menuItems());
                return;
            }

            if (startMenu && startMenu.classList.contains('open')) {
                startMenu.classList.remove('open');
                startBtn.classList.remove('active');
                return;
            }

            const onDesktop = target.closest && target.closest('#hypernet-os-desktop')
                && !target.closest('.hypernet-os-window');
            if (CM && onDesktop) {
                CM.show(e.clientX, e.clientY, CM.itemsForDesktop());
                return;
            }

            this.closeTopWindowOrExit();
        };
        this._container.addEventListener('contextmenu', this._contextMenuHandler);

        // Start Menu Navigation Links
        document.getElementById('link-my-computer').addEventListener('click', () => {
            window.HypernetOS.launchApp('my-computer');
        });
        document.getElementById('link-my-documents').addEventListener('click', () => {
            window.HypernetOS.launchApp('my-documents');
        });
        // My Recent Documents opens as a flyout of what was opened lately, each
        // entry going back through window.HypernetOS.openFile, so a document
        // reopened off this list lands in whichever program claims it.
        const recentLink = document.getElementById('link-recent-docs');
        if (recentLink) recentLink.addEventListener('click', (e) => {
            e.stopPropagation();
            const OS = window.HypernetOS;
            const box = recentLink.getBoundingClientRect();
            const docs = OS.recentDocs();
            const K = k => T('HypernetOS.xp.taskbar.' + k);
            const items = docs.length
                ? docs.map(path => ({
                    label: path.split('/').pop(),
                    icon: 190,
                    action: () => OS.openFile(path)
                  })).concat([{ separator: true }, { label: K('clearRecent'), action: () => OS.clearRecentDocs() }])
                : [{ label: K('recentEmpty'), disabled: true }];
            OS.ContextMenu.show(box.right, box.top, items);
        });
        document.getElementById('link-control-panel').addEventListener('click', () => {
            window.HypernetOS.launchApp('control-panel');
        });
        document.getElementById('link-web-browser').addEventListener('click', () => {
            window.HypernetOS.launchApp('app-hypernet-browser');
        });

        // Logoff and Turnoff Computer Buttons
        document.getElementById('start-btn-logoff').addEventListener('click', () => {
            startMenu.classList.remove('open');
            startBtn.classList.remove('active');
            // Log Off leaves at once: no confirmation box, the deck is simply closed.
            if (window.HypernetOS.Balloon) window.HypernetOS.Balloon.hide();
            if (window.HypernetOS.XP) window.HypernetOS.XP.clearOverlay();
            this.onExitClick();
        });
        document.getElementById('start-btn-turnoff').addEventListener('click', () => {
            startMenu.classList.remove('open');
            startBtn.classList.remove('active');
            // Turn Off leaves at once, the deck with it: no power box, no
            // shutting-down screen, straight back to whatever opened the deck.
            if (window.HypernetOS.Balloon) window.HypernetOS.Balloon.hide();
            if (window.HypernetOS.XP) {
                window.HypernetOS.XP.clearOverlay();
                window.HypernetOS.XP.playEvent('exitArchways');   // i18n-ignore  event id
            }
            this.onTurnOffClick();
        });
        ['run', 'search', 'help'].forEach(k => {
            const link = document.getElementById('link-' + k);
            if (link) link.addEventListener('click', () => window.HypernetOS.launchApp(k === 'run' ? 'app-run' : k === 'search' ? 'app-search' : 'app-help'));
        });

        // Re-flow the icon grid and the open windows when the game window /
        // resolution changes.
        this._desktopResizeHandler = () => {
            window.HypernetOS.refreshDesktopIcons();
            window.HypernetOS.WindowManager.reflowWindows();
        };
        window.addEventListener('resize', this._desktopResizeHandler);

        // Initial populates of registered apps on desktop and start menu
        window.HypernetOS.refreshDesktopIcons();
        window.HypernetOS.refreshStartMenu();
        window.HypernetOS.refreshTaskbarTabs();
        // The screen buddy comes back on its own if it was on screen when the
        // machine was last shut down.
        if (window.HypernetOS.Buddy) window.HypernetOS.Buddy.restore();
        // The host profile, the tray, the balloons, the screensaver, the
        // scheduled tasks: everything the period's desktop did on its own.
        if (window.HypernetOS.XP) window.HypernetOS.XP.install(this);

        // Auto launch if requested from prepareNextScene
        if (this._autoLaunchApp) {
            setTimeout(() => {
                const appId = (this._autoLaunchApp === 'browser') ? 'app-hypernet-browser' : 
                              (this._autoLaunchApp === 'shop') ? 'app-hypernet-shop' : this._autoLaunchApp;
                
                const app = window.HypernetOS._apps[appId];
                if (app && typeof app.launchFn === 'function') {
                    app.launchFn(this._autoLaunchParams);
                } else {
                    window.HypernetOS.launchApp(appId);
                }
            }, 150);
        }
    };

    // The taskbar keeps the world's clock, not the player's: hour and day both come
    // from TimeDateSystem, so the OS agrees with the game running outside it.
    Scene_HypernetOS.prototype.gameClockParts = function() {
        const TDS = window.TimeDateSystem;
        const now = (TDS && typeof TDS.getCurrentDateObj === 'function')
            ? TDS.getCurrentDateObj()
            : new Date();
        let hours = now.getHours();
        let minutes = now.getMinutes();
        const ampm = hours >= 12 ? T('HypernetOS.clockPm') : T('HypernetOS.clockAm');
        hours = hours % 12;
        hours = hours ? hours : 12; // the hour '0' should be '12'
        minutes = minutes < 10 ? '0' + minutes : minutes;
        const dayNames = T.list('HypernetOS.dayAbbr');
        const monthNames = T.list('HypernetOS.monthAbbr');
        return {
            time: `${hours}:${minutes} ${ampm}`,
            date: T('HypernetOS.clockDate', {
                day: dayNames[now.getDay()] || '',
                date: now.getDate(),
                month: monthNames[now.getMonth()] || ''
            })
        };
    };

    Scene_HypernetOS.prototype.startClock = function() {
        const updateClock = () => {
            const timeEl = document.getElementById('tray-clock-time');
            const dateEl = document.getElementById('tray-clock-date');
            if (!timeEl && !dateEl) return;
            const parts = this.gameClockParts();
            if (timeEl) timeEl.textContent = parts.time;
            if (dateEl) dateEl.textContent = parts.date;
        };

        updateClock();
        this._clockInterval = setInterval(updateClock, 1000);
    };

    Scene_HypernetOS.prototype.setupKeyboardHooks = function() {
        this._handleKeyDown = (event) => {
            if (!this.isActive()) return;

            const isTyping = document.activeElement &&
                (document.activeElement.tagName === 'INPUT' ||
                 document.activeElement.tagName === 'TEXTAREA' ||
                 document.activeElement.tagName === 'IFRAME');

            // A message box, the screensaver, a power screen or a shortcut of
            // the period (Alt+Tab, Alt+F4, Win+R...) takes the key first.
            if (window.HypernetOS.XP && window.HypernetOS.XP.handleKey(event)) return;

            const key = event.key.toUpperCase();

            // Some apps run their own complete keyboard/controller navigation
            // (e.g. the Stockbusters shop grid) and mark their window
            // data-self-nav. The OS yields directional / OK / cancel keys to them
            // and lets their own handler drive selection and back/close, so the
            // two navigation systems never fight over the same press.
            const selfNav = this._activeWindowIsSelfNav();

            const NAV_DIRS = {
                ARROWUP: 'up', ARROWDOWN: 'down', ARROWLEFT: 'left', ARROWRIGHT: 'right',
                W: 'up', S: 'down', A: 'left', D: 'right'
            };

            if (key === 'ESCAPE') {
                event.preventDefault();

                // While editing a text field, Escape leaves the field rather
                // than closing the window underneath it.
                if (isTyping && document.activeElement.tagName !== 'IFRAME') {
                    document.activeElement.blur();
                    return;
                }

                // A self-nav app owns Escape too (it walks its own stack back and
                // closes its window at the top level).
                if (selfNav) return;

                this.closeTopWindowOrExit();
                return;
            }

            // Text fields keep their native key behavior (caret movement,
            // typing W/A/S/D, Enter to submit). Don't hijack navigation there.
            if (isTyping) return;

            // Yield navigation/activation keys to a self-nav app, but still
            // swallow the browser's default scroll on arrows/space.
            if (selfNav) {
                if (NAV_DIRS[key] || key === 'TAB' || key === ' ' ||
                    key === 'SPACEBAR' || event.key === ' ') {
                    event.preventDefault();
                }
                return;
            }

            // Spatial navigation: arrow keys + WASD move the focus ring.
            if (NAV_DIRS[key]) {
                event.preventDefault();
                this._moveFocus(NAV_DIRS[key]);
                return;
            }

            // Tab cycles through interactive elements (Shift+Tab reverses).
            if (key === 'TAB') {
                event.preventDefault();
                this._cycleFocus(event.shiftKey ? -1 : 1);
                return;
            }

            // Enter / Space activate the focused element.
            if (key === 'ENTER' || key === ' ' || event.key === ' ' || key === 'SPACEBAR') {
                if (this._focusEl) {
                    event.preventDefault();
                    this._activateFocus();
                }
            }
        };
        document.addEventListener('keydown', this._handleKeyDown);
    };

    // --- Spatial focus navigation -------------------------------------------

    // True when the focused window declares data-self-nav, meaning the app
    // inside it runs its own keyboard / controller navigation and the OS focus
    // ring should stand down for directional / activation / cancel input.
    Scene_HypernetOS.prototype._activeWindowIsSelfNav = function() {
        const activeWin = window.HypernetOS._getActiveWindow();
        return !!(activeWin && activeWin.dataset && activeWin.dataset.selfNav === '1');
    };

    // Collect every visible, interactive element currently on the OS surface.
    Scene_HypernetOS.prototype._getFocusables = function() {
        if (!this._container) return [];
        const selector = [
            '.desktop-icon', '#hypernet-start-btn', '.start-menu-app-item',
            '.start-menu-link', '.start-menu-btn', '.taskbar-tab', '.tray-icon',
            '.hypernet-btn', 'button', 'a[href]', 'select', 'textarea',
            'input:not([type=hidden])', '[onclick]',
            // Project-wide convention: apps tag any click-driven element (plain
            // <div>s with a click listener, not just <button>/<a>) as .focusable
            // so it can be reached by the WASD/arrow/D-pad focus ring. Also honor
            // explicit tabindex and let the focus ring land on embedded iframes.
            '.focusable', '[tabindex]:not([tabindex="-1"])', 'iframe'
        ].join(', ');
        const seen = new Set();
        const out = [];
        // A message box is modal: while one is up, only its own controls
        // can take the focus ring.
        const D = window.HypernetOS.Dialog;
        const scope = (D && D.isOpen()) ? D.top().shade : this._container;
        scope.querySelectorAll(selector).forEach(el => {
            if (seen.has(el)) return;
            seen.add(el);
            if (el.disabled) return;
            // The cheap rejects run first. A rect is the expensive read here -
            // it allocates and forces the browser to settle the geometry - and
            // an app showing a long list can put hundreds of candidates through
            // this on every press of an arrow key. offsetWidth/offsetHeight
            // answer "is this collapsed" without one, and offsetParent answers
            // "is this displayed" without one either.
            if (!el.offsetParent && el.style.position !== 'fixed') return;
            if (el.offsetWidth <= 0 && el.offsetHeight <= 0) return;
            const r = el.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) return;          // hidden / collapsed
            // Skip elements scrolled fully off-screen.
            if (r.bottom < 0 || r.top > window.innerHeight ||
                r.right < 0 || r.left > window.innerWidth) return;
            out.push(el);
        });
        return out;
    };

    Scene_HypernetOS.prototype._setFocus = function(el, silent) {
        if (!el) return;
        this._navMode = 'focus';
        this._focusEl = el;
        // Remember a stable key so the ring can re-acquire this control if the
        // app rebuilds its innerHTML (e.g. a live ticker refresh) and replaces
        // the focused node with a fresh one carrying the same id.
        this._focusKey = el.id || el.getAttribute('data-focus-key') || null;
        if (this._analogCursor) this._analogCursor.style.display = 'none';
        // Synthesize hover so :hover styling and mouseover handlers respond.
        if (this._lastHoverEl && this._lastHoverEl !== el) {
            this._dispatchMouse(this._lastHoverEl, 'mouseout');
        }
        this._dispatchMouse(el, 'mouseover');
        this._lastHoverEl = el;
        if (typeof el.scrollIntoView === 'function') {
            el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
        this._updateFocusHighlight();
        if (!silent && window.SoundManager) SoundManager.playCursor();
    };

    Scene_HypernetOS.prototype._moveFocus = function(dir) {
        const list = this._getFocusables();
        if (list.length === 0) return;

        // First nav input (or focus lost) just reveals the nearest element.
        if (!this._focusEl || !this._focusEl.isConnected || list.indexOf(this._focusEl) === -1) {
            this._setFocus(list[0]);
            return;
        }

        const cur = this._focusEl.getBoundingClientRect();
        const cx = cur.left + cur.width / 2;
        const cy = cur.top + cur.height / 2;

        let best = null;
        let bestScore = Infinity;
        for (const el of list) {
            if (el === this._focusEl) continue;
            const r = el.getBoundingClientRect();
            const dx = (r.left + r.width / 2) - cx;
            const dy = (r.top + r.height / 2) - cy;
            let primary, cross;
            if (dir === 'left')       { if (dx >= -1) continue; primary = -dx; cross = Math.abs(dy); }
            else if (dir === 'right') { if (dx <= 1)  continue; primary = dx;  cross = Math.abs(dy); }
            else if (dir === 'up')    { if (dy >= -1) continue; primary = -dy; cross = Math.abs(dx); }
            else                      { if (dy <= 1)  continue; primary = dy;  cross = Math.abs(dx); }
            // Prefer aligned elements: cross-axis drift is penalized heavily.
            const score = primary + cross * 2;
            if (score < bestScore) { bestScore = score; best = el; }
        }
        if (best) this._setFocus(best);
    };

    Scene_HypernetOS.prototype._cycleFocus = function(step) {
        const list = this._getFocusables();
        if (list.length === 0) return;
        let idx = this._focusEl ? list.indexOf(this._focusEl) : -1;
        idx = (idx + step + list.length) % list.length;
        this._setFocus(list[idx]);
    };

    Scene_HypernetOS.prototype._activateFocus = function() {
        const el = this._focusEl;
        if (!el || !el.isConnected) return;
        const tag = el.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
            // Drop into the field so the player can type / pick.
            el.focus();
            return;
        }
        if (typeof el.focus === 'function') el.focus();
        this._dispatchMouse(el, 'mousedown');
        this._dispatchMouse(el, 'mouseup');
        if (typeof el.click === 'function') el.click();
    };

    // Keep the highlight ring glued to the focused element each frame; clear it
    // if the element vanished (window closed, menu collapsed) or the player
    // switched to the analog cursor.
    Scene_HypernetOS.prototype._updateFocusHighlight = function() {
        const hl = this._navHighlight;
        if (!hl) return;
        // If an app re-rendered its content and detached the focused node, try to
        // re-bind to the replacement element by its stable key so the focus ring
        // and keyboard/controller selection survive the refresh seamlessly.
        if (this._navMode === 'focus' && this._focusKey && this._container &&
            (!this._focusEl || !this._focusEl.isConnected)) {
            let re = null;
            try {
                const sel = (window.CSS && CSS.escape) ? '#' + CSS.escape(this._focusKey) : '#' + this._focusKey;
                re = this._container.querySelector(sel);
            } catch (e) { /* invalid id selector */ }
            if (!re) re = this._container.querySelector('[data-focus-key="' + this._focusKey + '"]');
            if (re) this._focusEl = re;
        }
        if (this._navMode !== 'focus' || !this._focusEl || !this._focusEl.isConnected) {
            hl.style.display = 'none';
            this._focusHlSig = null;
            return;
        }
        // Skip the getBoundingClientRect + style writes when the focused element and
        // its layout inputs (cumulative offset up the offsetParent chain, scroll of
        // ancestors, size) are unchanged since last frame. Reconstructing the offset
        // this way is cheap and catches window drags/scrolls without a full rect read.
        // Note: CSS transforms (e.g. minimize animation) are not reflected in the
        // signature, so the ring may briefly lag a transform-animating window.
        const el = this._focusEl;
        let oTop = 0, oLeft = 0;
        for (let n = el; n; n = n.offsetParent) { oTop += n.offsetTop || 0; oLeft += n.offsetLeft || 0; }
        for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
            oTop -= n.scrollTop || 0; oLeft -= n.scrollLeft || 0;
        }
        const sig = el.tagName + '|' + oLeft + '|' + oTop + '|' + el.offsetWidth + '|' + el.offsetHeight;
        if (this._focusHlEl === el && this._focusHlSig === sig) return;
        this._focusHlEl = el;
        this._focusHlSig = sig;
        const r = this._focusEl.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) { hl.style.display = 'none'; return; }
        hl.style.display = 'block';
        hl.style.left = (r.left - 3) + 'px';
        hl.style.top = (r.top - 3) + 'px';
        hl.style.width = (r.width + 6) + 'px';
        hl.style.height = (r.height + 6) + 'px';
    };

    // Controller D-pad mirrors WASD/arrows; button 0 (A) activates focus when in
    // focus mode, otherwise clicks the analog cursor (handled in updateAnalogCursor).
    Scene_HypernetOS.prototype.updateGamepadNav = function() {
        // A self-nav app reads the D-pad / A button itself (via RPG Maker Input),
        // so the OS ring stays out of its way.
        if (this._activeWindowIsSelfNav()) { this._navLastDir = null; return; }
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        let up = false, down = false, left = false, right = false, aPressed = false;
        for (const pad of pads) {
            if (!pad || !pad.connected) continue;
            const b = pad.buttons;
            if (b[12] && b[12].pressed) up = true;
            if (b[13] && b[13].pressed) down = true;
            if (b[14] && b[14].pressed) left = true;
            if (b[15] && b[15].pressed) right = true;
            if (b[0] && b[0].pressed) aPressed = true;
        }

        const dir = up ? 'up' : down ? 'down' : left ? 'left' : right ? 'right' : null;
        const now = performance.now();
        if (dir) {
            if (dir !== this._navLastDir) {
                this._moveFocus(dir);
                this._navLastDir = dir;
                this._navRepeatAt = now + 380;   // initial hold delay
            } else if (now >= this._navRepeatAt) {
                this._moveFocus(dir);
                this._navRepeatAt = now + 150;   // repeat rate
            }
        } else {
            this._navLastDir = null;
        }

        // A button activates the focus ring when keyboard/D-pad nav is active.
        if (this._navMode === 'focus') {
            if (aPressed && !this._cursorAHeld) {
                this._cursorAHeld = true;
                this._activateFocus();
            } else if (!aPressed) {
                this._cursorAHeld = false;
            }
        }
    };

    // The single "go back" action shared by Escape, the controller's B button and
    // a right click on the desktop: close the frontmost window, or leave the OS
    // when nothing is open. The active window is preferred, falling back to the
    // highest window still on screen so a stale focus state never swallows the
    // press.
    Scene_HypernetOS.prototype.closeTopWindowOrExit = function() {
        // An open context menu is the topmost thing on screen: Escape, B and a
        // stray right click all dismiss it first.
        const CM = window.HypernetOS.ContextMenu;
        if (CM && CM.isOpen()) { CM.hide(); return; }
        const active = document.querySelector('.hypernet-os-window.active:not(.minimized)');
        const win = active || window.HypernetOS.WindowManager.windows
            .filter(w => w.isConnected && !w.classList.contains('minimized'))
            .sort((a, b) => (parseInt(a.style.zIndex, 10) || 0) - (parseInt(b.style.zIndex, 10) || 0))
            .pop();

        if (win) {
            if (window.SoundManager) SoundManager.playCancel();
            window.HypernetOS.WindowManager.closeWindow(win);
        } else {
            this.onExitClick();
        }
    };

    Scene_HypernetOS.prototype.onExitClick = function() {
        if (window.SoundManager) SoundManager.playCancel();
        this.popScene();
    };

    // "Turn Off" powers the machine down, so it leaves the deck as well: where
    // "Log Off" drops back to the Hyperdeck sitting open on the table, this one
    // drops all the way out to whatever opened the deck, the main menu included.
    Scene_HypernetOS.prototype.onTurnOffClick = function() {
        // Close the start menu so it isn't left open when the scene is rebuilt.
        const startMenu = document.getElementById('hypernet-start-menu');
        const startBtn = document.getElementById('hypernet-start-btn');
        if (startMenu) startMenu.classList.remove('open');
        if (startBtn) startBtn.classList.remove('active');

        // The deck below us is the machine itself: take it off the stack so the
        // single pop below lands on the scene that booted it.
        const stack = SceneManager._stack;
        if (window.Scene_HyperDeck && stack && stack.length &&
            stack[stack.length - 1] === window.Scene_HyperDeck) {
            stack.pop();
        }

        this.onExitClick();
    };

    // Controller support: B button mirrors Escape (close active window, then
    // exit the OS). Polled via the Gamepad API directly so the raw Escape
    // keydown handler above never double-fires.
    Scene_HypernetOS.prototype.updateGamepadClose = function() {
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        // A message box is answered before anything else, A on the default
        // button and B on the cancelling one: a box the pad cannot dismiss
        // would leave the whole desktop stuck behind it.
        const dialog = window.HypernetOS.Dialog;
        if (dialog && dialog.isOpen()) {
            let a = false, b = false;
            for (const pad of pads) {
                if (!pad || !pad.connected) continue;
                if (pad.buttons[0] && pad.buttons[0].pressed) a = true;
                if (pad.buttons[1] && pad.buttons[1].pressed) b = true;
            }
            if ((a || b) && !this._gamepadBHeld) {
                this._gamepadBHeld = true;
                const d = dialog.top();
                const pick = b ? (d.buttons.find(x => x.cancel) || d.buttons[d.buttons.length - 1])
                               : (d.buttons.find(x => x.default) || d.buttons[0]);
                d.finish(pick.id);
            } else if (!a && !b) {
                this._gamepadBHeld = false;
            }
            return;
        }
        // A self-nav app handles B (cancel) itself to walk its own stack back and
        // close at the top level, so the OS does not pre-empt it.
        if (this._activeWindowIsSelfNav()) { this._gamepadBHeld = false; return; }
        let bPressed = false;
        for (const pad of pads) {
            if (pad && pad.connected && pad.buttons[1] && pad.buttons[1].pressed) bPressed = true;
        }
        if (bPressed && !this._gamepadBHeld) {
            this._gamepadBHeld = true;
            this.closeTopWindowOrExit();
        } else if (!bPressed) {
            this._gamepadBHeld = false;
        }
    };

    Scene_HypernetOS.prototype._dispatchMouse = function(el, type) {
        if (!el) return;
        el.dispatchEvent(new MouseEvent(type, {
            bubbles: true, cancelable: true, view: window,
            clientX: this._cursorX, clientY: this._cursorY
        }));
    };

    // Left analog stick moves a virtual cursor; gamepad A (button 0) clicks
    // whatever element it is over. Hover events are synthesized so :hover styles
    // and mouseover handlers behave like a real pointer.
    Scene_HypernetOS.prototype.updateAnalogCursor = function() {
        if (!window.AnalogStickInput || !this._analogCursor) return;

        const ax = AnalogStickInput.leftX();
        const ay = AnalogStickInput.leftY();
        if (ax !== 0 || ay !== 0) {
            // Moving the stick switches out of focus-ring mode into free cursor.
            this._navMode = 'cursor';
            if (this._navHighlight) this._navHighlight.style.display = 'none';
            const speed = 11; // px/frame at full deflection
            this._cursorX = Math.max(0, Math.min(window.innerWidth - 1, this._cursorX + ax * speed));
            this._cursorY = Math.max(0, Math.min(window.innerHeight - 1, this._cursorY + ay * speed));
            this._analogCursor.style.display = 'block';
            this._analogCursor.style.left = this._cursorX + 'px';
            this._analogCursor.style.top = this._cursorY + 'px';

            const el = document.elementFromPoint(this._cursorX, this._cursorY);
            if (el !== this._lastHoverEl) {
                this._dispatchMouse(this._lastHoverEl, 'mouseout');
                this._dispatchMouse(el, 'mouseover');
                this._lastHoverEl = el;
            }
            this._dispatchMouse(el, 'mousemove');
        }

        // A button = click at the cursor (edge-triggered)
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        let aPressed = false;
        for (const pad of pads) {
            if (pad && pad.connected && pad.buttons[0] && pad.buttons[0].pressed) aPressed = true;
        }
        // A-click here only when the analog cursor is the active input mode;
        // in focus-ring mode updateGamepadNav() owns the A button instead.
        if (this._navMode !== 'focus') {
            if (aPressed && !this._cursorAHeld) {
                this._cursorAHeld = true;
                const el = document.elementFromPoint(this._cursorX, this._cursorY);
                if (el) {
                    this._dispatchMouse(el, 'mousedown');
                    this._dispatchMouse(el, 'mouseup');
                    if (typeof el.click === 'function') el.click();
                }
            } else if (!aPressed) {
                this._cursorAHeld = false;
            }
        }
    };

    Scene_HypernetOS.prototype.update = function() {
        Scene_MenuBase.prototype.update.call(this);
        this.updateGamepadClose();
        this.updateGamepadNav();
        this.updateAnalogCursor();
        this._updateFocusHighlight();
        if (window.HypernetOS.Kernel) window.HypernetOS.Kernel.tick();
        this.updateHostedApps();
    };

    // Apps drawn as windows keep their own per-frame work. One of them throwing
    // used to take the whole frame with it, and RMMZ answers an uncaught error
    // by stopping every sound and freezing the scene: the machine would still be
    // on screen with the music gone and no way to shut it down. An app that
    // fails is logged once and dropped from the tick instead.
    Scene_HypernetOS.prototype.updateHostedApps = function() {
        const apps = [
            'HypercapitalisEmporiumApp', 'HypernetStockApp', 'HypernetNewsApp',
            'HypernetJobsApp', 'HypernetBankApp', 'HypernetRealEstateApp'
        ];
        if (!this._brokenApps) this._brokenApps = {};
        for (const key of apps) {
            const app = window[key];
            if (!app || typeof app.update !== 'function' || this._brokenApps[key]) continue;
            try {
                app.update();
            } catch (e) {
                this._brokenApps[key] = true;
                console.error('HypernetOS: ' + key + ' stopped updating.', e);
            }
        }
    };

    Scene_HypernetOS.prototype.terminate = function() {
        Scene_MenuBase.prototype.terminate.call(this);

        if (this._clockInterval) {
            clearInterval(this._clockInterval);
            this._clockInterval = null;
        }

        // Remove keyboard hooks
        if (this._handleKeyDown) {
            document.removeEventListener('keydown', this._handleKeyDown);
        }

        // Remove the desktop grid re-flow hook
        if (this._desktopResizeHandler) {
            window.removeEventListener('resize', this._desktopResizeHandler);
            this._desktopResizeHandler = null;
        }

        // Remove document click hook (Start Menu close-on-outside-click)
        if (this._documentClickHandler) {
            document.removeEventListener('click', this._documentClickHandler);
            this._documentClickHandler = null;
        }

        // Remove the right-click (close frontmost window) hook
        if (this._contextMenuHandler) {
            if (this._container) {
                this._container.removeEventListener('contextmenu', this._contextMenuHandler);
            }
            this._contextMenuHandler = null;
        }

        if (window.HypernetOS.XP) window.HypernetOS.XP.teardown();

        // Close all windows
        window.HypernetOS.WindowManager.closeAll();
        if (window.HypernetOS.ContextMenu) window.HypernetOS.ContextMenu.hide();
        if (window.HypernetOS.Buddy) window.HypernetOS.Buddy.despawn(true);

        // Cleanup DOM element
        if (this._container) {
            if (this._container.parentNode) {
                this._container.parentNode.removeChild(this._container);
            }
            this._container = null;
        }
    };

    // --- Built-in OS Applications ---

    // 1. Task Manager
    window.HypernetOS.registerApp({
        id: 'sys-task-mgr',
        name: T('HypernetOS.taskManager'),
        icon: 111,
        desktopShortcut: false, // Maybe in start menu only? Wait, we can put it on desktop for easy access. Let's make it true.
        launchFn: function() {
            const content = `
                <div class="sys-task-mgr-container">
                    <div class="sys-task-mgr-header">
                        <strong>${T('HypernetOS.systemLoad')}</strong> <span id="task-mgr-cpu">0%</span> CPU | 
                        <strong>${T('HypernetOS.memory')}</strong> <span id="task-mgr-ram">0</span> / <span id="task-mgr-ram-total">0</span> MB
                    </div>
                    <table class="sys-task-mgr-table">
                        <thead>
                            <tr class="sys-task-mgr-thead-tr">
                                <th class="sys-task-mgr-td">${T('HypernetOS.colPid')}</th>
                                <th class="sys-task-mgr-td">${T('HypernetOS.colImageName')}</th>
                                <th class="sys-task-mgr-td">${T('HypernetOS.colMemUsage')}</th>
                                <th class="sys-task-mgr-td">${T('HypernetOS.colCpu')}</th>
                                <th class="sys-task-mgr-td">${T('HypernetOS.colStatus')}</th>
                            </tr>
                        </thead>
                        <tbody id="task-mgr-list"></tbody>
                    </table>
                </div>
            `;
            const win = window.HypernetOS.Syscalls.createWindow({
                id: 'win-task-mgr',
                title: T('HypernetOS.taskManagerTitle'),
                contentHTML: content,
                width: 450,
                height: 350,
                icon: 111
            });

            // Set up update loop on the process
            const kernel = window.HypernetOS.Kernel;
            const proc = kernel.processes.find(p => p.pid === window.HypernetOS.currentLaunchingPid);
            if (proc) {
                // Cached element refs (looked up once the window exists) and a frame
                // counter so the whole process table is only rebuilt ~once/second
                // instead of every kernel tick.
                const els = { win: null, cpu: null, ram: null, list: null };
                let frame = 0;
                proc.executable = {
                    update: function() {
                        if (!els.win || !els.win.isConnected) {
                            els.win = document.getElementById('win-task-mgr');
                            if (!els.win) return; // Window closed
                            els.cpu = document.getElementById('task-mgr-cpu');
                            els.ram = document.getElementById('task-mgr-ram');
                            els.ramTotal = document.getElementById('task-mgr-ram-total');
                            els.list = document.getElementById('task-mgr-list');
                            frame = 0; // force a rebuild on (re)acquire
                        }
                        if ((frame++ % 60) !== 0) return;

                        if (els.cpu) els.cpu.innerText = kernel.totalCPU + '%';
                        if (els.ram) els.ram.innerText = kernel.getUsedRAM();
                        if (els.ramTotal) els.ramTotal.innerText = kernel.totalRAM;

                        if (els.list) {
                            els.list.innerHTML = kernel.processes.map(p => `
                            <tr class="sys-task-mgr-tbody-tr">
                                <td class="sys-task-mgr-td">${p.pid}</td>
                                <td class="sys-task-mgr-td">${p.name}</td>
                                <td class="sys-task-mgr-td">${p.memoryUsage} MB</td>
                                <td class="sys-task-mgr-td">${p.cpuUsage}%</td>
                                <td class="sys-task-mgr-td" style="color: ${p.status === 'RUNNING' ? 'green' : 'gray'}">${p.status}</td>
                            </tr>
                        `).join('');
                        }
                    }
                };
            }
        }
    });

    // --- The shell -----------------------------------------------------------
    // A real command interpreter over the virtual file system and the process
    // kernel, kept apart from the terminal window that draws it: exec() takes a
    // line and a session and answers with lines of text, so the same shell can
    // be driven by a script, a test or another app without a DOM.
    const Shell = window.HypernetOS.Shell = {
        // The machine's name: the deck's when the deck booted us, the stock
        // box's otherwise, and whatever System Properties renamed it to.
        get HOSTNAME() { return window.HypernetOS.Host ? window.HypernetOS.Host.hostname() : 'HYPERDECK'; },   // i18n-ignore  machine name
        ROOT: 'C:',                 // i18n-ignore  drive letter

        vfs: function() { return window.HypernetFileSystem || null; },
        kernel: function() { return window.HypernetOS.Kernel; },

        newSession: function() {
            return {
                cwd: [this.ROOT],
                history: [],
                env: {
                    // i18n-ignore-start  environment variable names and values
                    PATH: 'C:\\System',
                    USER: (window.HypernetFileSystem
                        ? window.HypernetFileSystem.getRegistry('user', 'explorer')
                        : 'explorer'),
                    COMPUTERNAME: this.HOSTNAME,
                    OS: 'Hypernet_Esoteric'
                    // i18n-ignore-end
                }
            };
        },

        // 'C:\Documents' for the prompt, 'C:/Documents' for the VFS. Every path
        // the shell hands to the file system goes through pathOf().
        pathOf: function(parts) { return parts.join('/'); },
        displayOf: function(parts) { return parts.join('\\'); },

        // Resolves an argument against the session's directory: absolute when it
        // names the drive, relative otherwise, with . and .. collapsed. Returns
        // null when it walks off the top of the drive.
        resolveParts: function(cwd, arg) {
            const raw = String(arg || '').replace(/\\/g, '/');
            let parts;
            if (/^[a-z]:/i.test(raw)) {
                parts = raw.split('/').filter(p => p.length);
                parts[0] = parts[0].toUpperCase();
            } else if (raw.startsWith('/')) {
                parts = [cwd[0]].concat(raw.split('/').filter(p => p.length));
            } else {
                parts = cwd.concat(raw.split('/').filter(p => p.length));
            }
            const out = [];
            for (const part of parts) {
                if (part === '.') continue;
                if (part === '..') {
                    if (out.length <= 1) return null;
                    out.pop();
                    continue;
                }
                out.push(part);
            }
            return out.length ? out : null;
        },

        // A line is split on spaces, but quoted runs stay together so a path with
        // a space in it survives being typed.
        tokenize: function(line) {
            const out = [];
            const re = /"([^"]*)"|(\S+)/g;
            let m;
            while ((m = re.exec(line)) !== null) out.push(m[1] !== undefined ? m[1] : m[2]);
            return out;
        },

        // Trailing > file / >> file is stripped before the command runs and its
        // output is written to the VFS instead of the screen.
        _splitRedirect: function(tokens) {
            for (let i = tokens.length - 2; i >= 0; i--) {
                if (tokens[i] === '>' || tokens[i] === '>>') {
                    return {
                        args: tokens.slice(0, i),
                        target: tokens[i + 1],
                        append: tokens[i] === '>>'
                    };
                }
            }
            return { args: tokens, target: null, append: false };
        },

        pad: function(text, width) {
            const s = String(text);
            return s.length >= width ? s : s + ' '.repeat(width - s.length);
        },

        padLeft: function(text, width) {
            const s = String(text);
            return s.length >= width ? s : ' '.repeat(width - s.length) + s;
        },

        // Names under the session's directory that begin with a fragment: the
        // answer to a Tab press.
        complete: function(session, fragment) {
            const fs = this.vfs();
            if (!fs) return [];
            const slash = Math.max(fragment.lastIndexOf('/'), fragment.lastIndexOf('\\'));
            const dirPart = slash >= 0 ? fragment.slice(0, slash) : '';
            const namePart = (slash >= 0 ? fragment.slice(slash + 1) : fragment).toLowerCase();
            const parts = this.resolveParts(session.cwd, dirPart || '.');
            const listing = parts ? fs.readDir(this.pathOf(parts)) : null;
            if (!listing) return [];
            return listing
                .filter(e => e.name.toLowerCase().startsWith(namePart))
                .map(e => (slash >= 0 ? fragment.slice(0, slash + 1) : '') + e.name);
        },

        // Runs one line. Answers { lines, clear, exit, title }: the terminal draws
        // the lines and obeys the flags, and nothing here touches the DOM.
        exec: function(line, session) {
            const res = { lines: [], clear: false, exit: false, title: null };
            const print = t => res.lines.push(t);
            const trimmed = String(line || '').trim();
            if (!trimmed) return res;
            session.history.push(trimmed);

            const redirect = this._splitRedirect(this.tokenize(trimmed));
            const tokens = redirect.args;
            if (!tokens.length) return res;
            const cmd = tokens.shift().toLowerCase();
            const args = tokens;
            const fs = this.vfs();
            const joined = args.join(' ');

            const err = key => print(T(key));

            switch (cmd) {
                case 'help':
                case '?':
                    T.list('HypernetOS.terminalHelp').forEach(print);
                    break;

                case 'cls':
                case 'clear':
                    res.clear = true;
                    break;

                case 'echo':
                    print(joined);
                    break;

                case 'ver':
                    print(T('HypernetOS.termVer'));
                    break;

                case 'date':
                    print(T('HypernetOS.termDate', { date: this.systemDate() }));
                    break;

                case 'time':
                    print(T('HypernetOS.termTime', { time: this.systemTime() }));
                    break;

                case 'vol':
                    print(T('HypernetOS.termVolume', { drive: session.cwd[0] }));
                    break;

                case 'cd':
                case 'chdir': {
                    if (!args[0]) { print(this.displayOf(session.cwd)); break; }
                    const parts = this.resolveParts(session.cwd, args[0]);
                    const node = parts && fs ? fs.resolvePath(this.pathOf(parts)) : null;
                    if (!node) { err('HypernetOS.termBadPath'); break; }
                    if (node.type !== 'directory') { err('HypernetOS.termNotDir'); break; }
                    session.cwd = parts;
                    break;
                }

                case 'dir':
                case 'ls': {
                    const parts = this.resolveParts(session.cwd, args[0] || '.');
                    const listing = parts && fs ? fs.readDir(this.pathOf(parts)) : null;
                    if (!listing) { err('HypernetOS.termBadPath'); break; }
                    print(T('HypernetOS.termDirOf', { path: this.displayOf(parts) }));
                    print('');
                    let files = 0, dirs = 0;
                    listing.forEach(entry => {
                        if (entry.type === 'directory') {
                            dirs++;
                            print('  ' + this.pad('<DIR>', 10) + entry.name);
                        } else {
                            files++;
                            const node = fs.resolvePath(this.pathOf(parts.concat(entry.name)));
                            const size = node && node.content ? String(node.content).length : 0;
                            print('  ' + this.pad(this.padLeft(size, 8), 10) + entry.name);
                        }
                    });
                    if (!listing.length) print(T('HypernetOS.emptyDir'));
                    else print(T('HypernetOS.termDirSummary', { files: files, dirs: dirs }));
                    break;
                }

                case 'tree': {
                    const parts = this.resolveParts(session.cwd, args[0] || '.');
                    if (!parts || !fs || !fs.exists(this.pathOf(parts))) { err('HypernetOS.termBadPath'); break; }
                    print(this.displayOf(parts));
                    fs.walk(this.pathOf(parts)).forEach(entry => {
                        print('  '.repeat(entry.depth + 1) + (entry.node.type === 'directory' ? '+ ' : '- ') + entry.node.name);
                    });
                    break;
                }

                case 'type':
                case 'cat': {
                    const parts = args[0] ? this.resolveParts(session.cwd, args[0]) : null;
                    if (!parts) { err('HypernetOS.termSyntax'); break; }
                    const content = fs ? fs.readFile(this.pathOf(parts)) : null;
                    if (content === null || content === undefined) { err('HypernetOS.termNotFound'); break; }
                    String(content).split('\n').forEach(print);
                    break;
                }

                case 'find': {
                    // FIND "text" file: the lines of a file that carry a phrase.
                    if (args.length < 2) { err('HypernetOS.termSyntax'); break; }
                    const needle = args[0].toLowerCase();
                    const parts = this.resolveParts(session.cwd, args[1]);
                    const content = parts && fs ? fs.readFile(this.pathOf(parts)) : null;
                    if (content === null || content === undefined) { err('HypernetOS.termNotFound'); break; }
                    const hits = String(content).split('\n').filter(l => l.toLowerCase().includes(needle));
                    if (!hits.length) print(T('HypernetOS.termNoMatch'));
                    else hits.forEach(print);
                    break;
                }

                case 'md':
                case 'mkdir': {
                    const parts = args[0] ? this.resolveParts(session.cwd, args[0]) : null;
                    if (!parts || !fs) { err('HypernetOS.termSyntax'); break; }
                    if (fs.exists(this.pathOf(parts))) { err('HypernetOS.termExists'); break; }
                    if (!fs.mkdir(this.pathOf(parts))) { err('HypernetOS.termBadPath'); break; }
                    print(T('HypernetOS.termCreated', { path: this.displayOf(parts) }));
                    break;
                }

                case 'rd':
                case 'rmdir': {
                    const recursive = args.some(a => /^\/s$/i.test(a));
                    const target = args.filter(a => !a.startsWith('/'))[0];
                    const parts = target ? this.resolveParts(session.cwd, target) : null;
                    if (!parts || !fs) { err('HypernetOS.termSyntax'); break; }
                    const node = fs.resolvePath(this.pathOf(parts));
                    if (!node) { err('HypernetOS.termBadPath'); break; }
                    if (node.type !== 'directory') { err('HypernetOS.termNotDir'); break; }
                    if (!fs.rmdir(this.pathOf(parts), recursive)) { err('HypernetOS.termDirNotEmpty'); break; }
                    print(T('HypernetOS.termDeleted', { path: this.displayOf(parts) }));
                    break;
                }

                case 'del':
                case 'erase':
                case 'rm': {
                    const parts = args[0] ? this.resolveParts(session.cwd, args[0]) : null;
                    if (!parts || !fs) { err('HypernetOS.termSyntax'); break; }
                    const node = fs.resolvePath(this.pathOf(parts));
                    if (!node) { err('HypernetOS.termNotFound'); break; }
                    if (node.type === 'directory') { err('HypernetOS.termIsDir'); break; }
                    fs.deleteFile(this.pathOf(parts));
                    print(T('HypernetOS.termDeleted', { path: this.displayOf(parts) }));
                    break;
                }

                case 'copy': {
                    if (args.length < 2 || !fs) { err('HypernetOS.termSyntax'); break; }
                    const src = this.resolveParts(session.cwd, args[0]);
                    const dst = this.resolveParts(session.cwd, args[1]);
                    if (!src || !dst || !fs.exists(this.pathOf(src))) { err('HypernetOS.termNotFound'); break; }
                    if (!fs.copy(this.pathOf(src), this.pathOf(dst))) { err('HypernetOS.termBadPath'); break; }
                    print(T('HypernetOS.termCopied', { path: this.displayOf(src) }));
                    break;
                }

                case 'move':
                case 'ren':
                case 'rename': {
                    if (args.length < 2 || !fs) { err('HypernetOS.termSyntax'); break; }
                    const src = this.resolveParts(session.cwd, args[0]);
                    // REN takes a bare new name in the same directory.
                    const dst = (cmd === 'move')
                        ? this.resolveParts(session.cwd, args[1])
                        : (src ? src.slice(0, -1).concat(args[1]) : null);
                    if (!src || !dst || !fs.exists(this.pathOf(src))) { err('HypernetOS.termNotFound'); break; }
                    if (!fs.move(this.pathOf(src), this.pathOf(dst))) { err('HypernetOS.termBadPath'); break; }
                    print(T('HypernetOS.termMoved', { path: this.displayOf(dst) }));
                    break;
                }

                case 'edit':
                case 'notepad': {
                    const parts = args[0] ? this.resolveParts(session.cwd, args[0]) : null;
                    if (parts && window.HypernetNotepad && fs && fs.exists(this.pathOf(parts))) {
                        window.HypernetNotepad.openFile(this.pathOf(parts));
                        print(T('HypernetOS.launching', { app: args[0] }));
                    } else if (window.HypernetOS._apps['app-hypernet-notepad']) {
                        window.HypernetOS.launchApp('app-hypernet-notepad');
                    } else {
                        err('HypernetOS.termNotFound');
                    }
                    break;
                }

                case 'run':
                case 'start': {
                    if (!args[0]) { err('HypernetOS.runUsage'); break; }
                    if (window.HypernetOS._apps[args[0]]) {
                        print(T('HypernetOS.launching', { app: args[0] }));
                        window.HypernetOS.launchApp(args[0]);
                    } else {
                        print(T('HypernetOS.appNotFound', { app: args[0] }));
                    }
                    break;
                }

                case 'apps': {
                    const apps = Object.values(window.HypernetOS._apps);
                    if (!apps.length) { err('HypernetOS.termNoApps'); break; }
                    apps.forEach(app => print('  ' + this.pad(app.id, 24) + app.name));
                    break;
                }

                case 'ps':
                case 'tasklist': {
                    const kernel = this.kernel();
                    print('  ' + this.pad(T('HypernetOS.colPid'), 8)
                        + this.pad(T('HypernetOS.colImageName'), 26)
                        + this.pad(T('HypernetOS.colMemUsage'), 12)
                        + T('HypernetOS.colStatus'));
                    kernel.processes.forEach(p => {
                        print('  ' + this.pad(p.pid, 8) + this.pad(p.name, 26)
                            + this.pad(p.memoryUsage + ' MB', 12) + p.status);
                    });
                    break;
                }

                case 'kill':
                case 'taskkill': {
                    const pid = parseInt(args.filter(a => !a.startsWith('/'))[0], 10);
                    const kernel = this.kernel();
                    if (!pid || !kernel.findProcess(pid)) {
                        print(T('HypernetOS.termNoPid', { pid: args[0] }));
                        break;
                    }
                    // Killing a process closes the window it was spawned for, so
                    // the desktop never keeps an orphan frame around.
                    const win = document.querySelector(`.hypernet-os-window[data-pid="${pid}"]`);
                    kernel.killProcess(pid);
                    if (win) {
                        win.dataset.pid = '';
                        window.HypernetOS.WindowManager.closeWindow(win);
                    }
                    print(T('HypernetOS.termKilled', { pid: pid }));
                    break;
                }

                case 'suspend':
                case 'resume': {
                    const pid = parseInt(args[0], 10);
                    const status = cmd === 'suspend' ? 'SUSPENDED' : 'RUNNING';
                    if (!this.kernel().setStatus(pid, status)) {
                        print(T('HypernetOS.termNoPid', { pid: args[0] }));
                        break;
                    }
                    print(T(cmd === 'suspend' ? 'HypernetOS.termSuspended' : 'HypernetOS.termResumed', { pid: pid }));
                    break;
                }

                case 'mem': {
                    const st = this.kernel().getStats();
                    print(T('HypernetOS.termMemTotal', { mb: st.totalRAM }));
                    print(T('HypernetOS.termMemUsed', { mb: st.usedRAM }));
                    print(T('HypernetOS.termMemFree', { mb: st.freeRAM }));
                    break;
                }

                case 'uptime': {
                    const s = this.kernel().uptime();
                    print(T('HypernetOS.termUptime', {
                        h: Math.floor(s / 3600),
                        m: Math.floor((s % 3600) / 60),
                        s: s % 60
                    }));
                    break;
                }

                case 'systeminfo': {
                    const st = this.kernel().getStats();
                    print(T('HypernetOS.termVer'));
                    print(T('HypernetOS.termInfoHost', { host: this.HOSTNAME }));
                    print(T('HypernetOS.termInfoUser', { user: session.env.USER }));
                    if (window.HypernetOS.Host) {
                        const hp = window.HypernetOS.Host.profile();
                        print(T('HypernetOS.termInfoMaker', { vendor: hp.vendor, model: hp.model }));
                        print(T('HypernetOS.termInfoProcessor', { cpu: hp.cpu, mhz: window.HypernetOS.Host.fmtMhz(hp.mhz) }));
                        print(T('HypernetOS.termInfoDisk', { size: window.HypernetOS.Host.fmtMb(hp.disk) }));
                        print(T('HypernetOS.termInfoBoot', { source: T('HypernetOS.host.origin.' + hp.origin) }));
                    }
                    print(T('HypernetOS.termInfoCpu', { cpu: st.cpu }));
                    print(T('HypernetOS.termMemTotal', { mb: st.totalRAM }));
                    print(T('HypernetOS.termMemFree', { mb: st.freeRAM }));
                    print(T('HypernetOS.termInfoProcs', { count: st.processes }));
                    print(T('HypernetOS.termDate', { date: this.systemDate() }));
                    break;
                }

                case 'whoami':
                    print(this.HOSTNAME.toLowerCase() + '\\' + session.env.USER);
                    break;

                case 'hostname':
                    print(this.HOSTNAME);
                    break;

                case 'ipconfig':
                    print(T('HypernetOS.termIpAdapter'));
                    print(T('HypernetOS.termIpAddress', { ip: this.localAddress() }));
                    print(T('HypernetOS.termIpMask'));
                    print(T('HypernetOS.termIpGateway'));
                    break;

                case 'ping': {
                    if (!args[0]) { err('HypernetOS.termSyntax'); break; }
                    const host = args[0];
                    // The net is a simulation, so the reply is seeded off the
                    // host name: the same address always answers the same way.
                    let seed = 0;
                    for (let i = 0; i < host.length; i++) seed = (seed * 31 + host.charCodeAt(i)) >>> 0;
                    const reachable = (seed % 5) !== 0;
                    print(T('HypernetOS.termPingHeader', { host: host }));
                    if (!reachable) {
                        print(T('HypernetOS.termPingLost'));
                        break;
                    }
                    for (let i = 0; i < 4; i++) {
                        print(T('HypernetOS.termPingReply', {
                            host: host,
                            ms: 20 + ((seed >> (i * 3)) % 90)
                        }));
                    }
                    break;
                }

                case 'set': {
                    if (!args.length) {
                        Object.keys(session.env).sort().forEach(k => print(k + '=' + session.env[k]));
                        break;
                    }
                    const eq = joined.indexOf('=');
                    if (eq < 0) {
                        const key = args[0].toUpperCase();
                        if (session.env[key] === undefined) print(T('HypernetOS.termEnvUnset', { name: key }));
                        else print(key + '=' + session.env[key]);
                        break;
                    }
                    const key = joined.slice(0, eq).trim().toUpperCase();
                    const value = joined.slice(eq + 1).trim();
                    if (!value) delete session.env[key];
                    else session.env[key] = value;
                    break;
                }

                case 'reg': {
                    const sub = (args[0] || '').toLowerCase();
                    if (!fs) { err('HypernetOS.termSyntax'); break; }
                    if (sub === 'query') {
                        const value = fs.getRegistry(args[1], undefined);
                        if (value === undefined) print(T('HypernetOS.termRegMissing', { key: args[1] }));
                        else print(args[1] + ' = ' + value);
                    } else if (sub === 'set' || sub === 'add') {
                        if (args.length < 3) { err('HypernetOS.termSyntax'); break; }
                        fs.setRegistry(args[1], args.slice(2).join(' '));
                        print(T('HypernetOS.termRegSet', { key: args[1] }));
                    } else {
                        err('HypernetOS.termSyntax');
                    }
                    break;
                }

                case 'title':
                    res.title = joined;
                    break;

                case 'history': {
                    const past = session.history.slice(0, -1);
                    if (!past.length) { err('HypernetOS.termHistoryEmpty'); break; }
                    past.forEach((h, i) => print('  ' + this.padLeft(i + 1, 3) + '  ' + h));
                    break;
                }

                case 'exit':
                    res.exit = true;
                    break;

                // SHUTDOWN -s turns the machine off, -r restarts it, -l logs
                // off; bare SHUTDOWN just leaves the shell, as it always did.
                case 'shutdown': {
                    const XP = window.HypernetOS.XP;
                    const flag = (args[0] || '').toLowerCase();
                    if (XP && /^[-/](s|r|l)$/.test(flag)) {
                        res.exit = true;
                        setTimeout(() => XP.shutdown(flag.endsWith('s') ? 'off' : flag.endsWith('r') ? 'restart' : 'logoff'), 200);
                    } else {
                        res.exit = true;
                    }
                    break;
                }

                // START opens a program the way the Run box would.
                case 'start': {
                    const hit = window.HypernetOS.XP ? window.HypernetOS.XP.resolveRun(joined, window.HypernetOS._apps) : null;
                    if (!hit) { err('HypernetOS.termNotFound'); break; }
                    window.HypernetOS.launchApp(hit.appId);
                    break;
                }

                case 'chkdsk': {
                    const H = window.HypernetOS.Host;
                    const p = H.profile();
                    const entries = fs ? fs.walk(session.cwd[0]) : [];
                    const files = entries.filter(e => e.node.type === 'file');
                    const bytes = files.reduce((n, e) => n + String(e.node.content || '').length, 0);
                    T.list('HypernetOS.termChkdsk').forEach(line => print(line
                        .replace('{drive}', session.cwd[0])
                        .replace('{files}', files.length)
                        .replace('{dirs}', entries.length - files.length)
                        .replace('{kb}', Math.round(bytes / 1024))
                        .replace('{total}', p.disk * 1024)
                        .replace('{free}', Math.max(0, p.disk - H.diskUsedMb()) * 1024)));
                    break;
                }

                default: {
                    // A program's name typed at the prompt runs it, the way
                    // typing CALC or NOTEPAD always did.
                    const hit = window.HypernetOS.XP ? window.HypernetOS.XP.resolveRun(cmd, window.HypernetOS._apps) : null;
                    if (hit && window.HypernetOS.isInstalled(window.HypernetOS._apps[hit.appId])) {
                        window.HypernetOS.launchApp(hit.appId);
                        break;
                    }
                    print(T('HypernetOS.notRecognized', { cmd: cmd }));
                    break;
                }
            }

            if (redirect.target && fs) {
                const parts = this.resolveParts(session.cwd, redirect.target);
                const target = parts ? this.pathOf(parts) : null;
                const previous = (redirect.append && target) ? (fs.readFile(target) || '') : '';
                const body = res.lines.join('\n');
                const ok = target && fs.writeFile(target, redirect.append && previous ? previous + '\n' + body : body);
                res.lines = ok ? [] : [T('HypernetOS.termBadPath')];
            }

            return res;
        },

        // The machine's own clock, which is the game's clock when there is one.
        systemDate: function() {
            const stale = window.HypernetOS.staleDate();
            if (stale) return stale;
            if (window.TimeSystem && typeof window.TimeSystem.getDateString === 'function') {
                return window.TimeSystem.getDateString();
            }
            const d = new Date();
            return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        },

        systemTime: function() {
            const d = new Date();
            return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
        },

        // A stable address per world, so the same machine keeps its number.
        localAddress: function() {
            let seed = 0;
            const name = (window.WorldManager && typeof window.WorldManager.currentWorldName === 'function')
                ? String(window.WorldManager.currentWorldName()) : 'esoteric';
            for (let i = 0; i < name.length; i++) seed = (seed * 33 + name.charCodeAt(i)) >>> 0;
            return `10.${seed % 254}.${(seed >> 8) % 254}.${(seed >> 16) % 253 + 1}`;
        }
    };

    // 2. Esoteric Terminal
    window.HypernetOS.registerApp({
        id: 'sys-terminal',
        name: T('HypernetOS.commandPrompt'),
        icon: 84, // console icon
        desktopShortcut: true,
        launchFn: function() {
            const content = `
                <div class="sys-terminal-container" id="term-container">
                    <div id="term-output">
                        ${T('HypernetOS.termVer')}<br>
                        ${T('HypernetOS.termCopyright')}<br><br>
                    </div>
                    <div class="sys-terminal-input-wrapper">
                        <span id="term-prompt">C:\\></span>
                        <input type="text" id="term-input" class="sys-terminal-input" autocomplete="off" spellcheck="false" autofocus>
                    </div>
                </div>
            `;
            const win = window.HypernetOS.Syscalls.createWindow({
                id: 'win-terminal',
                title: 'C:\\system32\\cmd.exe',  // i18n-ignore  shell path
                contentHTML: content,
                width: 600,
                height: 400,
                icon: 84
            });

            const termContainer = document.getElementById('term-container');
            const termInput = document.getElementById('term-input');
            const termOutput = document.getElementById('term-output');
            const termPrompt = document.getElementById('term-prompt');

            termContainer.addEventListener('click', () => termInput.focus());

            // The `autofocus` attribute does not fire for innerHTML-injected
            // inputs, so focus the prompt explicitly. Without this the field is
            // not the active element and W/A/S/D drive the OS focus ring instead
            // of being typed into the command line.
            setTimeout(() => termInput.focus(), 50);

            const session = window.HypernetOS.Shell.newSession();
            let historyIndex = -1;   // where the up arrow is walking

            const escapeHTML = t => String(t)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

            const printLine = (text) => {
                termOutput.innerHTML += escapeHTML(text) + '<br>';
                termContainer.scrollTop = termContainer.scrollHeight;
            };

            const refreshPrompt = () => {
                termPrompt.innerText = window.HypernetOS.Shell.displayOf(session.cwd) + '>';
            };
            refreshPrompt();

            termInput.addEventListener('keydown', (e) => {
                // Keep keystrokes inside the field so the document-level OS
                // handler never treats W/A/S/D as focus navigation while typing.
                // Escape is allowed to bubble so it can still leave/close the app.
                if (e.key !== 'Escape') e.stopPropagation();

                // Up and down walk the command history, the way a real prompt does.
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    const hist = session.history;
                    if (!hist.length) return;
                    if (historyIndex === -1) historyIndex = hist.length;
                    historyIndex += (e.key === 'ArrowUp' ? -1 : 1);
                    historyIndex = Math.max(0, Math.min(hist.length, historyIndex));
                    termInput.value = historyIndex >= hist.length ? '' : hist[historyIndex];
                    return;
                }

                // Tab completes the word being typed against the current directory.
                if (e.key === 'Tab') {
                    e.preventDefault();
                    const value = termInput.value;
                    const cut = value.lastIndexOf(' ') + 1;
                    const matches = window.HypernetOS.Shell.complete(session, value.slice(cut));
                    if (matches.length === 1) {
                        termInput.value = value.slice(0, cut) + matches[0];
                    } else if (matches.length > 1) {
                        printLine(termPrompt.innerText + ' ' + value);
                        matches.forEach(m => printLine('  ' + m));
                    }
                    return;
                }

                // Ctrl+L clears the screen, Ctrl+C abandons the line being typed.
                if (e.ctrlKey && (e.key === 'l' || e.key === 'c')) {
                    e.preventDefault();
                    if (e.key === 'l') termOutput.innerHTML = '';
                    else printLine(termPrompt.innerText + ' ' + termInput.value + '^C');
                    termInput.value = '';
                    return;
                }

                if (e.key !== 'Enter') return;

                const val = termInput.value;
                printLine(termPrompt.innerText + ' ' + val);
                termInput.value = '';
                historyIndex = -1;
                if (!val.trim()) return;

                let result;
                try {
                    result = window.HypernetOS.Shell.exec(val, session);
                } catch (err) {
                    printLine('Error: ' + err.message);  // i18n-ignore  shell fault
                    return;
                }

                if (result.clear) termOutput.innerHTML = '';
                result.lines.forEach(printLine);
                if (result.title) {
                    // The titlebar holds the icon and then the caption as a bare
                    // text node, so only that node is rewritten and the icon stays.
                    const titleEl = win.querySelector('.hypernet-window-title');
                    if (titleEl && titleEl.lastChild && titleEl.lastChild.nodeType === 3) {
                        titleEl.lastChild.nodeValue = result.title;
                    }
                    win.dataset.title = result.title;
                    window.HypernetOS.refreshTaskbarTabs();
                }
                refreshPrompt();
                if (result.exit) window.HypernetOS.WindowManager.closeWindow(win);
                termContainer.scrollTop = termContainer.scrollHeight;
            });
        }
    });

    // --- Hyper Colosseum App ---
    window.HypernetOS.registerApp({
        id: 'app-colosseum',
        name: T('HypernetOS.colosseum'),
        icon: 132, // visored helmet, the closest thing to a gladiator
        desktopShortcut: true,
        launchFn: function () {
            const BRACKETS = [
                { idx: 1,  min: 1,   max: 10,   label: '1 – 10' },
                { idx: 2,  min: 11,  max: 20,   label: '11 – 20' },
                { idx: 3,  min: 21,  max: 30,   label: '21 – 30' },
                { idx: 4,  min: 31,  max: 40,   label: '31 – 40' },
                { idx: 5,  min: 41,  max: 50,   label: '41 – 50' },
                { idx: 6,  min: 51,  max: 60,   label: '51 – 60' },
                { idx: 7,  min: 61,  max: 70,   label: '61 – 70' },
                { idx: 8,  min: 71,  max: 80,   label: '71 – 80' },
                { idx: 9,  min: 81,  max: 90,   label: '81 – 90' },
                { idx: 10, min: 91,  max: 100,  label: '91 – 100' },
                { idx: 11, min: 101, max: 200,  label: '101 – 200' },
                { idx: 12, min: 201, max: 300,  label: '201 – 300' },
                { idx: 13, min: 301, max: 400,  label: '301 – 400' },
                { idx: 14, min: 401, max: 500,  label: '401 – 500' },
                { idx: 15, min: 501, max: 9999, label: '501+' }
            ];

            let selectedIdx = 0;

            const countEnemies = (min, max) => {
                if (typeof ArenaBattleHandler === 'undefined' || !$dataTroops) return 0;
                let n = 0;
                for (let i = 1; i < $dataTroops.length; i++) {
                    const t = $dataTroops[i];
                    if (!t || t.members.length !== 1) continue;
                    const enemy = $dataEnemies[t.members[0].enemyId];
                    if (!enemy) continue;
                    const { level } = ArenaBattleHandler.parseEnemyNotes(enemy);
                    const lv = Number(level) || 0;
                    if (lv >= min && lv <= max) n++;
                }
                return n;
            };

            const renderList = () => {
                const el = document.getElementById('colosseum-list');
                if (!el) return;
                el.innerHTML = BRACKETS.map((b, i) => {
                    const cnt = countEnemies(b.min, b.max);
                    const sel = i === selectedIdx;
                    // Stable id + .focusable + data-focus-key so the OS focus ring
                    // (keyboard / WASD / D-pad) re-acquires the row after re-render.
                    return `
                        <div id="hc-bracket-${i}" class="focusable" data-focus-key="hc-bracket-${i}" tabindex="0"
                             onclick="window._hcSelect(${i})"
                             style="display:flex; justify-content:space-between; align-items:center; padding:5px 10px; cursor:pointer; border-bottom:1px solid #e8e8e8; background:${sel ? '#316ac5' : 'transparent'}; color:${sel ? '#fff' : '#222'}; font-size:15px; user-select:none">
                            <span>Lv.&nbsp;${b.label}</span>
                            <span style="opacity:0.75; font-size:13px">${cnt}&nbsp;✦</span>
                        </div>`;
                }).join('');
            };

            const renderRight = () => {
                const el = document.getElementById('colosseum-right');
                if (!el) return;
                const b = BRACKETS[selectedIdx];
                const cnt = countEnemies(b.min, b.max);
                const midLv = Math.floor((b.min + Math.min(b.max, 99)) / 2);
                el.innerHTML = `
                    <div style="margin-bottom:8px">
                        <div style="font-size:21px; font-weight:bold; font-family:Georgia,serif; color:var(--xp-red-4); margin-bottom:2px">
                            ${T('HypernetOS.levelBracket', { range: b.label })}
                        </div>
                        <div style="font-size:14px; color:var(--xp-ink-soft)">${T.n('HypernetOS.eligibleVessels', cnt)}</div>
                    </div>
                    <div style="background:#f8f8f8; border:1px solid var(--xp-silver-5); padding:10px; font-size:14px; color:var(--xp-ink-5); line-height:1.75">
                        <strong style="display:block; color:var(--xp-ink-4); margin-bottom:5px">${T('HypernetOS.randomPartyProtocol')}</strong>
                        <ul style="margin:0; padding-left:16px">
                            <li>${T('HypernetOS.protoDraft')}</li>
                            <li>${T('HypernetOS.protoLevel', { level: midLv })}</li>
                            <li>${T('HypernetOS.protoGear')}</li>
                            <li>${T('HypernetOS.protoHealing')}</li>
                            <li>${T('HypernetOS.protoWin')}</li>
                            <li>${T('HypernetOS.protoRestore')}</li>
                        </ul>
                    </div>
                    <div style="flex:1"></div>
                    <button id="hc-enter-btn" data-focus-key="hc-enter-btn" onclick="window._hcEnter()"
                            style="width:100%; padding:11px; background:linear-gradient(135deg, var(--xp-red-5), var(--xp-red-2)); color:var(--xp-gold); border:1px solid #FF6B6B; font-size:16px; font-weight:bold; font-family:Georgia,serif; letter-spacing:1.5px; cursor:pointer; margin-top:10px; box-shadow:0 2px 5px rgba(0,0,0,0.35); text-shadow:0 1px 2px #000">
                        &nbsp;&nbsp;${T('HypernetOS.enterColosseum')}
                    </button>
                `;
            };

            const contentHTML = `
                <div style="display:flex; flex-direction:column; height:100%; font-family:Tahoma,sans-serif; overflow:hidden; background:var(--xp-bg)">
                    <div style="background:linear-gradient(135deg, #1a0300 0%, var(--xp-red-4) 55%, #B22222 100%); padding:11px 16px; display:flex; align-items:center; gap:12px; border-bottom:2px solid var(--xp-red-5); flex-shrink:0">
                        <div style="font-size:2.2rem; line-height:1"></div>
                        <div>
                            <div style="color:var(--xp-gold); font-weight:bold; font-size:17px; letter-spacing:2px; font-family:Georgia,serif; text-shadow:1px 1px 2px #000">${T('HypernetOS.colosseumBanner')}</div>
                            <div style="color:#ffccaa; font-size:13px; margin-top:2px">${T('HypernetOS.colosseumTagline')}</div>
                        </div>
                        <div style="margin-left:auto; font-size:13px; color:#ff9966; text-align:right; line-height:1.5">${T('HypernetOS.partyRestoredNote')}</div>
                    </div>
                    <div style="display:flex; flex:1; overflow:hidden">
                        <div style="width:200px; min-width:200px; display:flex; flex-direction:column; border-right:1px solid #aaa; overflow:hidden">
                            <div style="background:var(--xp-blue-tab); color:var(--xp-white); padding:3px 8px; font-size:14px; font-weight:bold; flex-shrink:0; letter-spacing:0.3px">${T('HypernetOS.levelBrackets')}</div>
                            <div id="colosseum-list" style="flex:1; overflow-y:auto; background:var(--xp-white)"></div>
                        </div>
                        <div id="colosseum-right" style="flex:1; display:flex; flex-direction:column; padding:14px; gap:8px; overflow-y:auto"></div>
                    </div>
                    <div style="border-top:1px solid var(--xp-ink-pale-2); padding:2px 8px; background:var(--xp-bg); font-size:13px; color:var(--xp-text-muted); flex-shrink:0">
                        ${T('HypernetOS.colosseumHint')}
                    </div>
                </div>`;

            const win = window.HypernetOS.Syscalls.createWindow({
                id: 'win-colosseum',
                title: T('HypernetOS.colosseum'),
                contentHTML,
                width: 680,
                height: 460,
                icon: 132
            });

            window._hcSelect = function (idx) {
                selectedIdx = idx;
                if (window.SoundManager) SoundManager.playCursor();
                renderList();
                renderRight();
            };

            window._hcEnter = function () {
                if (typeof ArenaBattleHandler === 'undefined' || !ArenaBattleHandler.startRandomGauntlet) {
                    console.error('HyperColosseum: ArenaBattleHandler not available.');
                    return;
                }
                const b = BRACKETS[selectedIdx];
                if (window.SoundManager) SoundManager.playOk();
                window.HypernetOS.WindowManager.closeWindow(win);
                SceneManager.pop();
                try {
                    ArenaBattleHandler.startRandomGauntlet(b.idx);
                } catch (e) {
                    // Never crash to the RPG Maker error screen ("It is now safe
                    // to turn off your computer"). Log and fall back to the map.
                    console.error('HyperColosseum: failed to start gauntlet.', e);
                    if (window.SoundManager) SoundManager.playBuzzer();
                }
            };

            win.addEventListener('hypernet-closed', () => {
                delete window._hcSelect;
                delete window._hcEnter;
            });

            renderList();
            renderRight();
        }
    });

    // --- BIOS Setup App ---
    // The firmware screen of whatever machine this desktop is running on. It
    // reads the Hyperdeck rather than keeping a second copy of its rules, and
    // it is an Archways XP window like everything else here, because the OS is
    // what owns window chrome in this game.
    window.HypernetOS.registerApp({
        id: 'app-bios',
        name: T('HypernetOS.bios'),
        icon: 234,
        desktopShortcut: false,
        launchFn: function () {
            const HD = window.HyperDeck;
            let tab = 'system';   // i18n-ignore  tab id

            const specRows = () => {
                if (!HD) return [];
                const s = HD.specs();
                const f = HD.format;
                const rig = HD.summary ? HD.summary() : null;
                return [
                    [T('HypernetOS.biosCase'), f.caseName(HD.caseDef())],
                    [T('HypernetOS.biosProcessor'), f.mhz(s.mhz)],
                    [T('HypernetOS.biosMemory'), f.ram(s.ram)],
                    // The adapter line reads the same way the desktop's does,
                    // so a deck running on the processor's own video says so
                    // here rather than reporting nothing at all.
                    [T('HypernetOS.biosGraphics'), rig ? rig.graphics : f.mb(s.vram)],
                    [T('HypernetOS.biosStorage'), f.store(s.mb)],
                    [T('HypernetOS.biosCell'), f.mah(s.mah)],
                    [T('HypernetOS.biosDraw'), f.watt(s.draw) + ' / ' + f.watt(s.supply)],
                    [T('HypernetOS.biosEndurance'), rig ? rig.endurance : ''],
                    [T('HypernetOS.biosBoard'), s.used + ' / ' + s.cells]
                ];
            };

            const contentHTML = `
                <div class="bios-shell">
                    <div class="bios-banner">${T('HypernetOS.biosBanner')}</div>
                    <div class="bios-tabs">
                        <div class="bios-tab focusable" id="bios-tab-system" tabindex="0">${T('HypernetOS.biosTabSystem')}</div>
                        <div class="bios-tab focusable" id="bios-tab-health" tabindex="0">${T('HypernetOS.biosTabHealth')}</div>
                    </div>
                    <div class="bios-body" id="bios-body"></div>
                    <div class="bios-foot">
                        <div class="bios-key focusable" id="bios-recheck" tabindex="0">${T('HypernetOS.biosRecheck')}</div>
                        <div class="bios-note" id="bios-verdict"></div>
                    </div>
                </div>`;

            const win = window.HypernetOS.WindowManager.createWindow({
                id: 'win-bios',
                title: T('HypernetOS.bios'),
                icon: 234,
                width: 620,
                height: 440,
                contentHTML: contentHTML
            });

            const body = win.querySelector('#bios-body');
            const verdict = win.querySelector('#bios-verdict');

            function render() {
                win.querySelector('#bios-tab-system').classList.toggle('active', tab === 'system');
                win.querySelector('#bios-tab-health').classList.toggle('active', tab === 'health');
                if (!HD) {
                    body.innerHTML = `<div class="bios-empty">${T('HypernetOS.biosNoDeck')}</div>`;
                    verdict.textContent = '';
                    return;
                }
                if (tab === 'system') {
                    body.innerHTML = specRows().map(([k, v]) =>
                        `<div class="bios-row"><span>${k}</span><span>${v}</span></div>`).join('');
                } else {
                    const faults = HD.faults();
                    body.innerHTML = faults.length
                        ? faults.map(f => `<div class="bios-fault"><span>!</span><span>${f.text}</span></div>`).join('')
                        : `<div class="bios-clean">${T('HypernetOS.biosNoFaults')}</div>`;
                }
                const ok = HD.canBoot();
                verdict.textContent = ok ? T('HypernetOS.biosWillBoot') : T('HypernetOS.biosWillNotBoot');
                verdict.className = 'bios-note ' + (ok ? 'good' : 'bad');
            }

            win.querySelector('#bios-tab-system').addEventListener('click', (e) => {
                e.stopPropagation();
                tab = 'system';   // i18n-ignore  tab id
                if (window.SoundManager) SoundManager.playCursor();
                render();
            });
            win.querySelector('#bios-tab-health').addEventListener('click', (e) => {
                e.stopPropagation();
                tab = 'health';   // i18n-ignore  tab id
                if (window.SoundManager) SoundManager.playCursor();
                render();
            });
            win.querySelector('#bios-recheck').addEventListener('click', (e) => {
                e.stopPropagation();
                if (window.SoundManager) SoundManager.playOk();
                render();
            });

            render();
        }
    });


    // =========================================================================
    // Context menus
    // =========================================================================
    // One popup shared by the desktop, its shortcuts, the start menu's
    // programs and the screen buddy. Items are `.focusable`, so the focus ring
    // walks them the same way it walks everything else on the desktop.
    window.HypernetOS.ContextMenu = {
        _el: null,

        isOpen: function() {
            return !!(this._el && this._el.isConnected && this._el.classList.contains('open'));
        },

        contains: function(node) {
            return !!(this._el && node && this._el.contains(node));
        },

        // items: [{ label, icon, action, disabled, bold, separator, checked }]
        // `checked` is the tick a shell menu puts beside a setting it toggles
        // (Lock the Taskbar, Show the Clock): the row keeps its icon column and
        // the tick stands in it, so a menu of settings and a menu of verbs line
        // up the same way.
        show: function(x, y, items) {
            this.hide();
            const host = document.getElementById('hypernet-os-container');
            if (!host || !items || !items.length) return;

            const el = document.createElement('div');
            el.id = 'hypernet-context-menu';
            el.className = 'hypernet-context-menu open';
            items.forEach(item => {
                if (item.separator) {
                    const sep = document.createElement('div');
                    sep.className = 'hypernet-context-sep';
                    el.appendChild(sep);
                    return;
                }
                const row = document.createElement('div');
                row.className = 'hypernet-context-item focusable' + (item.disabled ? ' disabled' : '') + (item.bold ? ' bold' : '');
                row.tabIndex = 0;
                if (item.checked) row.classList.add('checked');
                row.innerHTML = `<span class="hypernet-context-icon">${item.checked ? '<span class="hypernet-context-tick"></span>' : (item.icon != null ? window.HypernetOS.getIconHTML(item.icon, 16) : '')}</span><span>${item.label}</span>`;
                row.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (item.disabled) return;
                    this.hide();
                    if (window.HypernetOS.XP) window.HypernetOS.XP.playEvent('menuCommand');   // i18n-ignore  event id
                    try { item.action(); } catch (err) { console.error('Context menu action failed', err); }
                });
                el.appendChild(row);
            });
            host.appendChild(el);
            this._el = el;
            if (window.HypernetOS.XP) window.HypernetOS.XP.playEvent('menuPopup');   // i18n-ignore  event id

            // Keep the whole menu on screen.
            const hr = host.getBoundingClientRect();
            const w = el.offsetWidth, h = el.offsetHeight;
            const left = Math.max(0, Math.min(x - hr.left, hr.width - w - 2));
            const top = Math.max(0, Math.min(y - hr.top, hr.height - h - 2));
            el.style.left = left + 'px';
            el.style.top = top + 'px';
            if (window.SoundManager) SoundManager.playCursor();
        },

        hide: function() {
            if (this._el && this._el.parentNode) this._el.parentNode.removeChild(this._el);
            this._el = null;
        },

        // A shortcut on the desktop.
        itemsForShortcut: function(appId) {
            const OS = window.HypernetOS;
            const app = OS._apps[appId];
            if (!app) return [];
            return [
                { label: T('HypernetOS.context.open'), icon: app.icon, bold: true, action: () => OS.launchApp(appId) },
                { separator: true },
                { label: T('HypernetOS.context.removeFromDesktop'), action: () => OS.setOnDesktop(appId, false) }
            ];
        },

        // A program in the start menu.
        itemsForProgram: function(appId) {
            const OS = window.HypernetOS;
            const app = OS._apps[appId];
            if (!app) return [];
            const onDesk = OS.isOnDesktop(app);
            return [
                { label: T('HypernetOS.context.open'), icon: app.icon, bold: true, action: () => OS.launchApp(appId) },
                { separator: true },
                onDesk
                    ? { label: T('HypernetOS.context.removeFromDesktop'), action: () => OS.setOnDesktop(appId, false) }
                    : { label: T('HypernetOS.context.addToDesktop'), action: () => { OS.setOnDesktop(appId, true); OS.closeStartMenu(); } }
            ];
        },

        // The taskbar itself, right-clicked anywhere that is not a button. The
        // three arranging verbs, the desktop, the manager and the settings, in
        // the order the bar always listed them.
        itemsForTaskbar: function() {
            const OS = window.HypernetOS;
            const XP = OS.XP;
            const K = k => T('HypernetOS.xp.taskbar.' + k);
            const open = OS.WindowManager.windows.filter(w => !w.classList.contains('minimized'));
            return [
                { label: K('cascade'), disabled: !open.length, action: () => OS.arrangeWindows('cascade') },
                { label: K('tileH'), disabled: !open.length, action: () => OS.arrangeWindows('tileH') },
                { label: K('tileV'), disabled: !open.length, action: () => OS.arrangeWindows('tileV') },
                { separator: true },
                { label: K('minimizeAll'), action: () => XP && XP.showDesktop() },
                { separator: true },
                { label: K('taskManager'), action: () => OS.launchApp('sys-task-mgr') },
                { separator: true },
                { label: K('lock'), checked: !!(XP && XP.reg('taskbarLocked', false)),
                  action: () => { if (XP) { XP.setReg('taskbarLocked', !XP.reg('taskbarLocked', false)); XP.applyTaskbar(); } } },
                { label: K('properties'), action: () => OS.launchApp('app-taskbar') }
            ];
        },

        // Bare desktop.
        itemsForDesktop: function() {
            const OS = window.HypernetOS;
            const has = id => !!OS._apps[id];
            const items = [
                { label: T('HypernetOS.context.arrangeIcons'), action: () => {
                    const layout = OS.DesktopGrid.savedLayout();
                    if (layout) Object.keys(layout).forEach(k => delete layout[k]);
                    OS.refreshDesktopIcons();
                } },
                { label: T('HypernetOS.context.refresh'), action: () => { OS.refreshDesktopIcons(); OS.refreshStartMenu(); } },
                { separator: true }
            ];
            if (has('app-hypernet-notepad')) items.push({ label: T('HypernetOS.context.newTextDocument'), icon: 190, action: () => OS.launchApp('app-hypernet-notepad') });
            if (has('app-hypernet-paint')) items.push({ label: T('HypernetOS.context.newPicture'), icon: 224, action: () => OS.launchApp('app-hypernet-paint') });
            if (has('app-bobnzi') && OS.Buddy && !OS.Buddy.isOnScreen()) items.push({ label: T('HypernetOS.context.summonBuddy'), action: () => OS.launchApp('app-bobnzi') });
            items.push({ separator: true });
            if (has('control-panel')) items.push({ label: T('HypernetOS.context.properties'), icon: 234, action: () => OS.launchApp('control-panel') });
            return items;
        }
    };

    // =========================================================================
    // Bobnzi the Goblin, the screen buddy
    // =========================================================================
    // A living goblin off the NPC catalogue (NPCs.json entries flagged
    // goblin: true) walks the bottom of the desktop, chatters in goblin
    // Markov prose, and can be dragged about, talked to, and sent away. The
    // sprite it wears is rolled once and kept on the save, so the same goblin
    // comes back every time the machine is switched on.
    window.HypernetOS.Buddy = {
        _el: null, _canvas: null, _bubble: null, _bitmap: null, _raf: 0, _state: null, _frame: null, _anim: null,

        SIZE: 3,           // sprite scale
        SPEED: 38,         // px per second while walking

        state: function() {
            if (typeof $gameSystem === 'undefined' || !$gameSystem) return this._state || (this._state = { sprite: null, active: false, x: 0.5 });
            if (!$gameSystem._hypernetBuddy) $gameSystem._hypernetBuddy = { sprite: null, active: false, x: 0.5 };
            return $gameSystem._hypernetBuddy;
        },

        // Every goblin sprite in the catalogue that is alive.
        goblinSprites: function(catalogue) {
            const cat = catalogue || (window.WorldGen && window.WorldGen.NPCs) || {};
            return Object.keys(cat).filter(k => cat[k] && cat[k].goblin === true);
        },

        pickSprite: function(rng, catalogue) {
            const pool = this.goblinSprites(catalogue);
            if (!pool.length) return null;
            const r = typeof rng === 'function' ? rng() : Math.random();
            return pool[Math.floor(r * pool.length) % pool.length];
        },

        isOnScreen: function() {
            return !!(this._el && this._el.isConnected);
        },

        restore: function() {
            if (this.state().active) this.spawn(false);
        },

        // Put the goblin on the desktop. A fresh summon rolls a new goblin.
        spawn: function(reroll) {
            const desk = document.getElementById('hypernet-os-desktop');
            if (!desk) return;
            const st = this.state();
            if (reroll || !st.sprite) st.sprite = this.pickSprite();
            if (!st.sprite) return;
            st.active = true;
            this.despawn();

            const el = document.createElement('div');
            el.id = 'hypernet-buddy';
            // Clicking the buddy makes it talk, so it is a control like any other:
            // the desktop's ring collects it and Confirm greets it.
            el.className = 'hypernet-buddy focusable';
            el.tabIndex = 0;
            el.title = T('HypernetOS.buddy.name');
            const canvas = document.createElement('canvas');
            canvas.className = 'hypernet-buddy-sprite';
            const bubble = document.createElement('div');
            bubble.className = 'hypernet-buddy-bubble';
            bubble.hidden = true;
            el.appendChild(bubble);
            el.appendChild(canvas);
            desk.appendChild(el);
            this._el = el; this._canvas = canvas; this._bubble = bubble;

            this._anim = { dir: 0, frame: 1, t: 0, walking: false, target: null, idleFor: 1.5, talkIn: 4 + Math.random() * 6, last: performance.now(), dragging: false };
            this._frame = null;
            this._bitmap = ImageManager.loadCharacter(st.sprite);
            this._bitmap.addLoadListener(() => this._sized());
            if (this._bitmap.isReady()) this._sized();

            el.addEventListener('click', (e) => {
                e.stopPropagation();
                if (el._hnDragged) { el._hnDragged = false; return; }
                this.say(this.line('greet'));
            });
            this._attachDrag(el, desk);

            const loop = (now) => {
                if (!this._el || !this._el.isConnected) return;
                this._raf = requestAnimationFrame(loop);
                this._tick(Math.min(0.1, (now - this._anim.last) / 1000), desk);
                this._anim.last = now;
            };
            this._raf = requestAnimationFrame(loop);
            this.say(this.line(reroll ? 'hello' : 'back'));
        },

        // Takes the goblin off the screen. The save's flag is left alone, so
        // shutting the machine down brings it back next boot; dismiss() is
        // what clears it.
        despawn: function() {
            cancelAnimationFrame(this._raf);
            clearTimeout(this._bubbleTimer);
            if (this._el && this._el.parentNode) this._el.parentNode.removeChild(this._el);
            this._el = null; this._canvas = null; this._bubble = null;
        },

        dismiss: function() {
            this.say(this.line('bye'));
            this.state().active = false;
            setTimeout(() => this.despawn(), 900);
        },

        _sized: function() {
            const bmp = this._bitmap;
            if (!bmp || !this._canvas) return;
            const fw = Math.floor(bmp.width / 3), fh = Math.floor(bmp.height / 4);
            this._frame = { w: fw, h: fh };
            this._canvas.width = fw; this._canvas.height = fh;
            this._canvas.style.width = (fw * this.SIZE) + 'px';
            this._canvas.style.height = (fh * this.SIZE) + 'px';
            this._place();
            this._draw();
        },

        _place: function() {
            const desk = document.getElementById('hypernet-os-desktop');
            if (!desk || !this._el || !this._frame) return;
            const w = this._frame.w * this.SIZE;
            const x = Math.round(this.state().x * Math.max(1, desk.clientWidth - w));
            this._el.style.left = x + 'px';
            this._el.style.bottom = '2px';
        },

        _draw: function() {
            const bmp = this._bitmap, c = this._canvas, f = this._frame;
            if (!bmp || !c || !f || !bmp.isReady()) return;
            const ctx = c.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.clearRect(0, 0, f.w, f.h);
            // !$ single sheets: 3 columns of walk frames, 4 rows of facings
            // (down, left, right, up).
            const a = this._anim;
            const row = a.dir === 0 ? 0 : (a.dir < 0 ? 1 : 2);
            ctx.drawImage(bmp.canvas, a.frame * f.w, row * f.h, f.w, f.h, 0, 0, f.w, f.h);
        },

        _tick: function(dt, desk) {
            const a = this._anim, st = this.state();
            if (!a || !this._frame || a.dragging) return;
            const w = this._frame.w * this.SIZE;
            const span = Math.max(1, desk.clientWidth - w);

            if (a.walking) {
                const dx = a.target - st.x;
                const step = (this.SPEED / span) * dt;
                if (Math.abs(dx) <= step) { st.x = a.target; a.walking = false; a.dir = 0; a.frame = 1; a.idleFor = 1 + Math.random() * 4; }
                else { st.x += Math.sign(dx) * step; a.dir = Math.sign(dx); }
                a.t += dt;
                if (a.t > 0.16) { a.t = 0; a.frame = (a.frame + 1) % 3; }
                this._place();
            } else {
                a.idleFor -= dt;
                if (a.idleFor <= 0) { a.walking = true; a.target = Math.random(); }
            }
            this._draw();

            a.talkIn -= dt;
            if (a.talkIn <= 0) { a.talkIn = 12 + Math.random() * 20; this.say(this.line('chatter')); }
        },

        _attachDrag: function(el, desk) {
            el.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                const a = this._anim, st = this.state();
                const startX = e.clientX;
                const startPos = st.x;
                let moved = false;
                const onMove = (ev) => {
                    if (!moved && Math.abs(ev.clientX - startX) < 6) return;
                    moved = true; a.dragging = true; a.walking = false; a.dir = 0; a.frame = 1;
                    const w = this._frame ? this._frame.w * this.SIZE : 48;
                    const span = Math.max(1, desk.clientWidth - w);
                    st.x = Math.max(0, Math.min(1, startPos + (ev.clientX - startX) / span));
                    this._place(); this._draw();
                };
                const onUp = () => {
                    document.removeEventListener('mousemove', onMove, true);
                    document.removeEventListener('mouseup', onUp, true);
                    a.dragging = false;
                    if (moved) { el._hnDragged = true; setTimeout(() => { el._hnDragged = false; }, 0); }
                };
                document.addEventListener('mousemove', onMove, true);
                document.addEventListener('mouseup', onUp, true);
            });
        },

        // What the goblin says. Fixed lines are i18n; chatter is goblin Markov.
        line: function(kind) {
            if (kind === 'chatter' && typeof window.generateMarkovString === 'function') {
                try {
                    const txt = window.generateMarkovString('semiwild_goblin', { chainOrder: 2, minLength: 6, maxLength: 22 });  // i18n-ignore  markov db id
                    if (txt && !/^ERROR/.test(txt)) return txt;
                } catch (e) { /* fall through to the fixed lines */ }
            }
            const key = 'HypernetOS.buddy.' + (kind === 'chatter' ? 'greet' : kind);
            const list = T.list ? T.list(key) : null;
            if (Array.isArray(list) && list.length) return list[Math.floor(Math.random() * list.length)];
            return T(key);
        },

        say: function(text) {
            if (!this._bubble || !text) return;
            this._bubble.textContent = text;
            this._bubble.hidden = false;
            clearTimeout(this._bubbleTimer);
            this._bubbleTimer = setTimeout(() => { if (this._bubble) this._bubble.hidden = true; }, 4500);
        },

        menuItems: function() {
            return [
                { label: T('HypernetOS.buddy.talk'), bold: true, action: () => this.say(this.line('chatter')) },
                { label: T('HypernetOS.buddy.reroll'), action: () => this.spawn(true) },
                { separator: true },
                { label: T('HypernetOS.buddy.goAway'), action: () => this.dismiss() }
            ];
        }
    };

    window.HypernetOS.registerApp({
        id: 'app-bobnzi',
        name: T('HypernetOS.buddy.appName'),
        icon: 84,
        category: 'games',
        launchFn: function() {
            const B = window.HypernetOS.Buddy;
            if (B.isOnScreen()) B.say(B.line('greet'));
            else B.spawn(true);
        },
        desktopShortcut: false
    });


    // =========================================================================
    // The host machine
    // -------------------------------------------------------------------------
    // The desktop runs on whatever booted it. Booted off the Hyperdeck, the
    // fitted parts are the hardware: the kernel's memory, the shell's host
    // name, the Control Panel's spec sheet and the Device Manager's tree are
    // all read off the board, so swapping a part moves every one of them.
    // Reached any other way (the hotkey, an event, a shop counter, the main
    // menu) the OS runs on a stock desktop of 2001, rolled once per world off
    // the world seed so the same world always sits at the same beige box.
    // =========================================================================
    // XP-PURE-START
    function xpHash(str) {
        let h = 2166136261;
        const s = String(str || '');
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619) >>> 0;
        }
        return h >>> 0;
    }

    // The same weighting HyperDeck.performanceIndex uses, so a stock box and a
    // deck are ranked on one scale.
    function xpPerfIndex(mhz, ram, vram, mb) {
        return Math.round((mhz || 0) / 10 + Math.min(1024, ram || 0) / 4
            + Math.min(1024, vram || 0) * 1.5 + Math.min(1000000, mb || 0) / 2000);
    }

    // The stock catalogue: names live in i18n, the numbers behind them here,
    // index for index.
    const STOCK_CPU_MHZ = [866, 1000, 1500, 1700, 1200, 1333, 800, 900];
    const STOCK_RAM_MB = [128, 128, 256, 256, 384, 512];
    const STOCK_GPU_VRAM = [32, 64, 16, 32, 16, 4];
    const STOCK_DISK_GB = [20, 30, 40, 60];
    const STOCK_MODEM_KBPS = [56, 33.6, 10000, 56];

    function stockDesktop(seed) {
        const h = xpHash(seed);
        const idx = (salt, n) => n > 0 ? xpHash(h + ':' + salt) % n : 0;
        const cpus = T.list('HypernetOS.host.stock.cpus');
        const gpus = T.list('HypernetOS.host.stock.gpus');
        const sounds = T.list('HypernetOS.host.stock.sounds');
        const modems = T.list('HypernetOS.host.stock.modems');
        const vendors = T.list('HypernetOS.host.stock.vendors');
        const models = T.list('HypernetOS.host.stock.models');
        const ci = idx('cpu', STOCK_CPU_MHZ.length);
        const gi = idx('gpu', STOCK_GPU_VRAM.length);
        const mi = idx('modem', STOCK_MODEM_KBPS.length);
        const vi = idx('vendor', vendors.length);
        const ram = STOCK_RAM_MB[idx('ram', STOCK_RAM_MB.length)];
        const disk = STOCK_DISK_GB[idx('disk', STOCK_DISK_GB.length)] * 1024;
        const vram = STOCK_GPU_VRAM[gi];
        return {
            origin: 'desktop',                                        // i18n-ignore  profile id
            hostname: 'OEM-' + (h % 0xFFFFFF).toString(16).toUpperCase().padStart(6, '0'),  // i18n-ignore  machine name
            vendor: vendors[vi] || '',
            model: models[vi] || '',
            cpu: cpus[ci] || '',
            mhz: STOCK_CPU_MHZ[ci],
            ram: ram,
            vram: vram,
            gpu: gpus[gi] || '',
            integrated: gi === STOCK_GPU_VRAM.length - 1,
            disk: disk,
            sound: sounds[idx('sound', sounds.length)] || '',
            modem: modems[mi] || '',
            linkKbps: STOCK_MODEM_KBPS[mi],
            caseName: T('HypernetOS.host.stock.tower'),
            serial: (xpHash(h + ':serial') % 0xFFFFFFFF).toString(16).toUpperCase().padStart(8, '0'),
            index: xpPerfIndex(STOCK_CPU_MHZ[ci], ram, vram, disk)
        };
    }

    // The Run box: what a typed name opens. Program names of the period map to
    // the desktop's own programs; the resolver answers an app id or null.
    // i18n-ignore-start  executable names and app ids
    const RUN_ALIASES = {
        'notepad': 'app-hypernet-notepad', 'notebad': 'app-hypernet-notepad',
        'calc': 'app-calc', 'charmap': 'app-charmap', 'clipbrd': 'app-clipbrd',
        'cmd': 'sys-terminal', 'command': 'sys-terminal',
        'taskmgr': 'sys-task-mgr', 'control': 'control-panel',
        'msconfig': 'app-msconfig', 'regedit': 'app-regedit', 'regedt32': 'app-regedit',
        'explorer': 'my-computer', 'mspaint': 'app-hypernet-paint', 'pbrush': 'app-hypernet-paint',
        'winver': 'app-winver', 'cleanmgr': 'app-cleanmgr', 'dfrg.msc': 'app-defrag', 'defrag': 'app-defrag',
        'sysdm.cpl': 'app-sysdm', 'timedate.cpl': 'app-timedate', 'intl.cpl': 'app-intl',
        'mmsys.cpl': 'app-mmsys', 'appwiz.cpl': 'app-appwiz', 'desk.cpl': 'app-desk',
        'devmgmt.msc': 'app-devmgmt', 'eventvwr': 'app-eventvwr', 'eventvwr.msc': 'app-eventvwr',
        'osk': 'app-osk', 'wscui.cpl': 'app-wscui', 'mstsc': 'app-netstat', 'ncpa.cpl': 'app-netstat',
        'iexplore': 'app-hypernet-browser', 'exploder': 'app-hypernet-browser',
        'helpctr': 'app-help', 'hh': 'app-help', 'schtasks': 'app-schedtasks',
        'wmplayer': 'app-hyperamp', 'excel': 'app-hexcel', 'winword': 'app-wyrd',
        'services.msc': 'app-msconfig', 'sndvol32': 'app-mmsys', 'recycle': 'app-recycle',
        'search': 'app-search', 'run': 'app-run',
        'chiplab': 'app-chiplab', 'circuit': 'app-chiplab', 'etch': 'app-chiplab', 'eagle': 'app-chiplab'
    };
    // i18n-ignore-end

    function resolveRun(text, apps) {
        const raw = String(text || '').trim();
        if (!raw) return null;
        const lower = raw.toLowerCase();
        if (/^(https?:\/\/|www\.)/.test(lower)) return { appId: 'app-hypernet-browser', arg: raw };
        const first = lower.split(/\s+/)[0];
        const bare = first.replace(/\.(exe|com|bat|cpl|msc)$/, '');
        const alias = RUN_ALIASES[first] || RUN_ALIASES[bare];
        if (alias) return { appId: alias, arg: raw.slice(first.length).trim() };
        if (apps && apps[first]) return { appId: first, arg: '' };
        if (apps) {
            const hit = Object.values(apps).find(a => String(a.name || '').toLowerCase() === lower);
            if (hit) return { appId: hit.id, arg: '' };
        }
        return null;
    }

    // The Standard calculator, as a state machine the buttons feed. Every key
    // of the real one: the four operations, sqrt, %, 1/x, sign, backspace,
    // clear entry, clear and the memory column.
    const CalcEngine = {
        create() { return { display: '0', acc: null, op: null, fresh: true, memory: 0, error: false }; },
        value(st) { return parseFloat(st.display) || 0; },
        fmt(n) {
            if (!isFinite(n)) return null;
            let s = String(Math.round(n * 1e10) / 1e10);
            if (s.length > 24) s = n.toExponential(12);
            return s;
        },
        apply(st, a, b, op) {
            switch (op) {
                case '+': return a + b;
                case '-': return a - b;
                case '*': return a * b;
                case '/': return b === 0 ? NaN : a / b;
            }
            return b;
        },
        press(st, key) {
            if (st.error && key !== 'C') return st;
            if (/^[0-9]$/.test(key)) {
                st.display = (st.fresh || st.display === '0') ? key : st.display + key;
                st.fresh = false;
                return st;
            }
            switch (key) {
                case '.':
                    if (st.fresh) { st.display = '0.'; st.fresh = false; }
                    else if (!st.display.includes('.')) st.display += '.';
                    return st;
                case 'BS':
                    if (st.fresh) return st;
                    st.display = st.display.length > 1 ? st.display.slice(0, -1) : '0';
                    return st;
                case 'CE': st.display = '0'; st.fresh = true; return st;
                case 'C': Object.assign(st, { display: '0', acc: null, op: null, fresh: true, error: false }); return st;
                case '+/-': st.display = this.fmt(-this.value(st)); return st;
                case 'sqrt': return this.unary(st, Math.sqrt(this.value(st)));
                case '1/x': return this.unary(st, this.value(st) === 0 ? NaN : 1 / this.value(st));
                case '%': return this.unary(st, st.acc === null ? 0 : st.acc * this.value(st) / 100);
                case 'MC': st.memory = 0; return st;
                case 'MR': st.display = this.fmt(st.memory); st.fresh = true; return st;
                case 'MS': st.memory = this.value(st); st.fresh = true; return st;
                case 'M+': st.memory += this.value(st); st.fresh = true; return st;
                case '+': case '-': case '*': case '/': {
                    if (st.op && !st.fresh) {
                        const r = this.apply(st, st.acc, this.value(st), st.op);
                        if (!this.unary(st, r).error) st.acc = r;
                        else return st;
                    } else if (st.acc === null || !st.fresh) {
                        st.acc = this.value(st);
                    }
                    st.op = key;
                    st.fresh = true;
                    return st;
                }
                case '=': {
                    if (st.op === null) return st;
                    const r = this.apply(st, st.acc, this.value(st), st.op);
                    this.unary(st, r);
                    st.acc = null;
                    st.op = null;
                    return st;
                }
            }
            return st;
        },
        unary(st, r) {
            const s = this.fmt(r);
            if (s === null) { st.error = true; st.display = T('HypernetOS.xp.calc.error'); }
            else st.display = s;
            st.fresh = true;
            return st;
        }
    };

    // The character sets Character Map pages through, by code point range.
    // i18n-ignore-start  set ids and code points
    const CHARMAP_SETS = [
        { id: 'latin', from: 0x21, to: 0x7E },
        { id: 'latin1', from: 0xA1, to: 0xFF },
        { id: 'greek', from: 0x391, to: 0x3C9 },
        { id: 'cyrillic', from: 0x410, to: 0x44F },
        { id: 'runic', from: 0x16A0, to: 0x16F0 },
        { id: 'arrows', from: 0x2190, to: 0x21FF },
        { id: 'math', from: 0x2200, to: 0x22FF },
        { id: 'box', from: 0x2500, to: 0x257F },
        { id: 'astro', from: 0x263C, to: 0x2653 },
        { id: 'alchemy', from: 0x1F700, to: 0x1F773 }
    ];
    // i18n-ignore-end

    function charmapChars(setId) {
        const set = CHARMAP_SETS.find(s => s.id === setId) || CHARMAP_SETS[0];
        const out = [];
        for (let cp = set.from; cp <= set.to; cp++) out.push(String.fromCodePoint(cp));
        return out;
    }
    // XP-PURE-END

    window.HypernetOS.Host = {
        _source: null,
        _cache: null,

        // HyperDeck calls this right before it pushes the OS; nothing else
        // does, so any other entry lands on the stock desktop.
        bootFrom(source) { this._source = source; this._cache = null; },
        reset() { this._source = null; this._cache = null; },
        source() { return this._source || 'desktop'; },   // i18n-ignore  profile id

        seed() {
            const g = (typeof $gameSystem !== 'undefined' && $gameSystem) ? $gameSystem : null;
            const s = g && (g._historySeed || g._worldSeed);
            return String(s || 'esoteric');   // i18n-ignore  default seed
        },

        isHyperdeck() {
            const HD = window.HyperDeck;
            return this.source() === 'hyperdeck' && !!(HD && HD.summary && HD.summary());
        },

        // A player may rename the machine in System Properties; the name is
        // kept in the registry and beats whatever the profile rolled.
        hostname() {
            const fs = window.HypernetFileSystem;
            const named = fs ? fs.getRegistry('computerName', '') : '';
            return named || this.profile().hostname;
        },

        profile() {
            const key = this.source() + '|' + this.seed();
            if (this._cache && this._cache.key === key && this._cache.origin !== 'hyperdeck') return this._cache;
            let p;
            if (this.isHyperdeck()) {
                const HD = window.HyperDeck;
                const s = HD.specs();
                const rig = HD.summary();
                const model = HD.format.caseName(HD.caseDef());
                p = {
                    origin: 'hyperdeck',                              // i18n-ignore  profile id
                    hostname: 'HYPERDECK',                            // i18n-ignore  machine name
                    vendor: T('HypernetOS.host.deckVendor'),
                    model: model,
                    cpu: HD.partNameFor('cpu', 'mhz') || T('HypernetOS.host.unknownPart'),
                    mhz: s.mhz,
                    ram: s.ram === Infinity ? 4096 : s.ram,
                    vram: s.vram,
                    gpu: rig.graphics,
                    integrated: !!s.shared,
                    disk: s.mb,
                    sound: rig.audio,
                    modem: rig.uplink,
                    linkKbps: s.kinds.modem ? 56 : 0,
                    caseName: model,
                    serial: (xpHash(this.seed() + ':deck') % 0xFFFFFFFF).toString(16).toUpperCase().padStart(8, '0'),
                    index: rig.index,
                    endurance: rig.endurance,
                    power: rig.power,
                    board: rig.board
                };
            } else {
                p = stockDesktop(this.seed());
            }
            p.key = key;
            this._cache = p;
            return p;
        },

        // Printed spec lines, the way the Control Panel and the shell want them.
        fmtMhz(n) { return n >= 1000 ? T('HypernetOS.host.ghz', { n: Math.round(n / 10) / 100 }) : T('HypernetOS.host.mhz', { n: n }); },
        fmtMb(n) { return n >= 1024 ? T('HypernetOS.host.gb', { n: Math.round(n / 102.4) / 10 }) : T('HypernetOS.host.mb', { n: n }); },

        // The paging file the Advanced tab quotes: one and a half times the
        // memory, capped to what the disk can spare.
        pagingMb() {
            const p = this.profile();
            const initial = Math.min(Math.round(p.ram * 1.5), Math.round(p.disk / 4));
            return { initial: initial, max: Math.min(initial * 2, Math.round(p.disk / 2)) };
        },

        // Bytes the virtual drive holds, as the disk applets count them.
        diskUsedMb() {
            const fs = window.HypernetFileSystem;
            if (!fs || !fs.walk) return 0;
            let bytes = 0;
            fs.walk('C:').forEach(e => {                      // i18n-ignore  drive
                if (e.node.type === 'file') bytes += String(e.node.content || '').length;
            });
            // The system's own files never show in the tree at their real
            // weight, so a fixed footprint stands in for them.
            return Math.round(bytes / 1048576) + 1180;
        },

        // The kernel and the shell take the profile: memory and host name.
        apply() {
            const p = this.profile();
            window.HypernetOS.Kernel.totalRAM = p.ram;
            return p;
        },

        // The Device Manager tree. Every branch is a category of the period
        // with the machine's own parts under it.
        devices() {
            const p = this.profile();
            const X = 'HypernetOS.xp.devmgmt.';
            const line = k => T(X + k);
            return [
                { label: line('catComputer'), items: [p.origin === 'hyperdeck' ? line('devDeck') : line('devStandardPc')] },
                { label: line('catDisk'), items: [T(X + 'devDisk', { size: this.fmtMb(p.disk), vendor: p.vendor })] },
                { label: line('catDisplay'), items: [p.gpu] },
                { label: line('catOptical'), items: p.origin === 'hyperdeck' ? [] : [line('devCdrom')] },
                { label: line('catFloppy'), items: p.origin === 'hyperdeck' ? [] : [line('devFloppy')] },
                { label: line('catIde'), items: [line('devIdePrimary'), line('devIdeSecondary')] },
                { label: line('catKeyboard'), items: [p.origin === 'hyperdeck' ? line('devDeckKeys') : line('devKeyboard')] },
                { label: line('catMouse'), items: [line('devMouse')] },
                { label: line('catModem'), items: p.modem ? [p.modem] : [] },
                { label: line('catMonitor'), items: [p.origin === 'hyperdeck' ? line('devDeckPanel') : line('devMonitor')] },
                { label: line('catPorts'), items: [line('devCom1'), line('devCom2'), line('devLpt1')] },
                { label: line('catProcessor'), items: [T(X + 'devCpu', { name: p.cpu, mhz: this.fmtMhz(p.mhz) })] },
                { label: line('catSound'), items: [p.sound] },
                { label: line('catSystem'), items: [line('devPci'), line('devDma'), line('devPic'), line('devRtc'), line('devSpeaker')] },
                { label: line('catUsb'), items: [line('devUsbRoot'), line('devUsbHub')] }
            ].filter(c => c.items.length);
        }
    };

    // =========================================================================
    // Message boxes
    // -------------------------------------------------------------------------
    // The desktop never shows a browser dialog: every question an app asks is
    // one of these, a modal box in the OS's own chrome. They return promises,
    // so an app writes `await Dialog.confirm(...)` where it used to block.
    // =========================================================================
    window.HypernetOS.Dialog = {
        _open: [],

        isOpen() { return this._open.length > 0; },
        top() { return this._open.length ? this._open[this._open.length - 1] : null; },
        contains(node) { return this._open.some(d => d.shade.contains(node)); },

        // i18n-ignore  icon glyphs of the four classic boxes
        ICONS: { info: 'i', question: '?', warning: '!', error: 'x', none: '' },

        // options: title, message (text or HTML when html: true), icon,
        // buttons [{ id, label, default, cancel }], input { value, password },
        // select { options: [{ value, label }], value }, checkbox { label, checked }
        show(options) {
            const host = document.getElementById('hypernet-os-container');
            if (!host) return Promise.resolve({ button: 'cancel' });
            const opts = options || {};
            const buttons = (opts.buttons && opts.buttons.length) ? opts.buttons
                : [{ id: 'ok', label: T('HypernetOS.xp.dialog.ok'), default: true, cancel: true }];
            const iconKey = opts.icon || 'none';
            const escape = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
            const body = opts.html ? String(opts.message || '') : escape(opts.message).replace(/\n/g, '<br>');

            const shade = document.createElement('div');
            shade.className = 'hypernet-dialog-shade';
            shade.innerHTML = `
                <div class="hypernet-dialog ${opts.wide ? 'wide' : ''}" role="dialog">
                    <div class="hypernet-dialog-title">${escape(opts.title || T('HypernetOS.xp.dialog.defaultTitle'))}</div>
                    <div class="hypernet-dialog-body">
                        ${iconKey !== 'none' ? `<div class="hypernet-dialog-icon icon-${iconKey}">${this.ICONS[iconKey] || ''}</div>` : ''}
                        <div class="hypernet-dialog-text">
                            <div class="hypernet-dialog-message">${body}</div>
                            ${opts.input ? `<input class="hypernet-dialog-input" type="${opts.input.password ? 'password' : 'text'}" value="${escape(opts.input.value)}" ${opts.input.placeholder ? `placeholder="${escape(opts.input.placeholder)}"` : ''}>` : ''}
                            ${opts.select ? `<select class="hypernet-dialog-select">${opts.select.options.map(o => `<option value="${escape(o.value)}" ${o.value === opts.select.value ? 'selected' : ''}>${escape(o.label)}</option>`).join('')}</select>` : ''}
                            ${opts.checkbox ? `<label class="hypernet-dialog-check"><input type="checkbox" ${opts.checkbox.checked ? 'checked' : ''}> ${escape(opts.checkbox.label)}</label>` : ''}
                        </div>
                    </div>
                    <div class="hypernet-dialog-buttons">
                        ${buttons.map(b => `<button class="hypernet-dialog-btn focusable ${b.default ? 'default' : ''}" data-id="${escape(b.id)}" tabindex="0">${escape(b.label)}</button>`).join('')}
                    </div>
                </div>`;
            host.appendChild(shade);

            const XPsvc = window.HypernetOS.XP;
            if (iconKey !== 'none' && XPsvc) XPsvc.playEvent(XPsvc.DIALOG_EVENTS[iconKey] || 'defaultBeep');   // i18n-ignore  event id

            return new Promise(resolve => {
                const entry = { shade, buttons, resolve, opts };
                this._open.push(entry);
                const finish = (id) => {
                    const input = shade.querySelector('.hypernet-dialog-input');
                    const select = shade.querySelector('.hypernet-dialog-select');
                    const check = shade.querySelector('.hypernet-dialog-check input');
                    this._open = this._open.filter(d => d !== entry);
                    if (entry.onKey) document.removeEventListener('keydown', entry.onKey, true);
                    if (shade.parentNode) shade.parentNode.removeChild(shade);
                    resolve({
                        button: id,
                        value: input ? input.value : (select ? select.value : undefined),
                        select: select ? select.value : undefined,
                        checked: check ? check.checked : undefined
                    });
                };
                entry.finish = finish;
                shade.querySelectorAll('.hypernet-dialog-btn').forEach(btn => {
                    btn.addEventListener('click', e => { e.stopPropagation(); finish(btn.dataset.id); });
                });
                shade.addEventListener('mousedown', e => e.stopPropagation());
                // Clicking the shade outside the box answers it the way Escape
                // does, so a box is never left stuck on screen.
                shade.addEventListener('click', e => {
                    e.stopPropagation();
                    if (e.target !== shade) return;
                    const cancel = buttons.find(b => b.cancel);
                    if (cancel) finish(cancel.id);
                });
                // The scene hands keys here while a box is up, but a box can
                // also open with no scene hook listening (or over an app that
                // eats keys itself), so it listens for its own.
                entry.onKey = ev => {
                    if (this.top() !== entry) return;
                    if (this.handleKey(ev)) ev.stopPropagation();
                };
                document.addEventListener('keydown', entry.onKey, true);
                const input = shade.querySelector('.hypernet-dialog-input');
                const first = input || shade.querySelector('.hypernet-dialog-btn.default') || shade.querySelector('.hypernet-dialog-btn');
                if (first) setTimeout(() => { first.focus(); if (input) input.select(); }, 0);
            });
        },

        // Enter picks the default button, Escape the cancelling one. The scene's
        // key hook hands every key here first while a box is up.
        handleKey(event) {
            const d = this.top();
            if (!d) return false;
            const key = event.key;
            if (key === 'Escape') {
                const cancel = d.buttons.find(b => b.cancel) || d.buttons[d.buttons.length - 1];
                event.preventDefault();
                d.finish(cancel.id);
                return true;
            }
            if (key === 'Enter') {
                const focused = document.activeElement;
                if (focused && focused.classList && focused.classList.contains('hypernet-dialog-btn')) {
                    event.preventDefault();
                    d.finish(focused.dataset.id);
                    return true;
                }
                const def = d.buttons.find(b => b.default) || d.buttons[0];
                event.preventDefault();
                d.finish(def.id);
                return true;
            }
            // Every other key stays inside the box.
            return !['Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)
                && !(document.activeElement && ['INPUT', 'SELECT'].includes(document.activeElement.tagName));
        },

        alert(message, title, icon) {
            return this.show({ title, message, icon: icon || 'info' }).then(() => true);
        },
        error(message, title) {
            return this.show({ title: title || T('HypernetOS.xp.dialog.errorTitle'), message, icon: 'error' }).then(() => true);
        },
        confirm(message, title, icon) {
            return this.show({
                title, message, icon: icon || 'question',
                buttons: [
                    { id: 'yes', label: T('HypernetOS.xp.dialog.yes'), default: true },
                    { id: 'no', label: T('HypernetOS.xp.dialog.no'), cancel: true }
                ]
            }).then(r => r.button === 'yes');
        },
        prompt(message, defaultValue, title) {
            return this.show({
                title, message, input: { value: defaultValue == null ? '' : defaultValue },
                buttons: [
                    { id: 'ok', label: T('HypernetOS.xp.dialog.ok'), default: true },
                    { id: 'cancel', label: T('HypernetOS.xp.dialog.cancel'), cancel: true }
                ]
            }).then(r => r.button === 'ok' ? r.value : null);
        },

        // "Archways cannot open this file": the box the shell shows for a
        // document no program claims, with the installed programs to pick from.
        // Resolves with the app it launched, or null.
        cannotOpen(fileName) {
            const apps = Object.values(window.HypernetOS._apps)
                .filter(a => window.HypernetOS.isInstalled(a))
                .sort((a, b) => String(a.name).localeCompare(String(b.name)));
            return this.show({
                title: T('HypernetOS.xp.dialog.cannotOpenTitle'),
                message: T('HypernetOS.xp.dialog.cannotOpenBody', { file: fileName }),
                icon: 'question',
                wide: true,
                select: { options: apps.map(a => ({ value: a.id, label: a.name })), value: apps.length ? apps[0].id : '' },
                checkbox: { label: T('HypernetOS.xp.dialog.alwaysUse'), checked: false },
                buttons: [
                    { id: 'ok', label: T('HypernetOS.xp.dialog.ok'), default: true },
                    { id: 'cancel', label: T('HypernetOS.xp.dialog.cancel'), cancel: true }
                ]
            }).then(r => {
                if (r.button !== 'ok' || !r.value) return null;
                const ext = String(fileName).toLowerCase().split('.').pop();
                if (r.checked && window.HypernetFileSystem) {
                    const assoc = window.HypernetFileSystem.getRegistry('fileAssoc', {}) || {};
                    assoc[ext] = r.value;
                    window.HypernetFileSystem.setRegistry('fileAssoc', assoc);
                }
                window.HypernetOS.launchApp(r.value);
                return r.value;
            });
        },

        //---------------------------------------------------------------------
        // The Open / Save As box
        //---------------------------------------------------------------------
        // The second most-seen window of the period after the folder itself,
        // and the one every program that touches a document has to show. Before
        // this, a program asked for a file name with a one-line prompt, which
        // meant a player could neither see what was already saved nor put a
        // document anywhere but the folder the program had picked for them.
        //
        // It is a box rather than a window on purpose: it is modal to the
        // program that asked, it rides the same `_open` stack as every other
        // message box (so Escape and the scene's key hook already know about
        // it), and it is thrown away when it answers.
        //
        // opts: { mode: 'open' | 'save', path, fileName, filters, title }
        //   filters: [{ label, ext }], ext being 'txt' or '*' for everything.
        // Resolves with the full path picked, or null if the box was cancelled.
        // In save mode it has already asked about replacing an existing file.
        FILE_PLACES: [
            // i18n-ignore-start  VFS paths, matched literally
            { key: 'desktop', path: 'C:/Desktop', icon: 191 },
            { key: 'myDocuments', path: 'C:/Documents', icon: 191 },
            { key: 'myComputer', path: 'C:', icon: 86 }
            // i18n-ignore-end
        ],

        file(options) {
            const opts = options || {};
            const OS = window.HypernetOS;
            const fs = window.HypernetFileSystem;
            const host = document.getElementById('hypernet-os-container');
            if (!host || !fs) return Promise.resolve(null);
            const FB = (key, params) => T('HypernetOS.xp.filebox.' + key, params);
            const save = opts.mode === 'save';
            const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
            const join = (dir, leaf) => (dir === 'C:' ? 'C:/' : dir + '/') + leaf;   // i18n-ignore  VFS path

            const filters = (opts.filters && opts.filters.length) ? opts.filters
                : [{ label: FB('allFiles'), ext: '*' }];
            let filterIdx = 0;
            let cwd = (opts.path && fs.resolvePath(opts.path)) ? opts.path : 'C:/Documents';   // i18n-ignore  VFS path
            if (!fs.resolvePath(cwd)) cwd = 'C:';   // i18n-ignore  VFS path

            // The chain of folders from the drive down to where we stand: the
            // "Look in" list is that chain, deepest selected, the way it was.
            const chainOf = full => {
                const parts = String(full).split('/').filter(Boolean);
                return parts.map((name, i) => ({ path: parts.slice(0, i + 1).join('/'), name: name }));
            };
            const matches = name => {
                const ext = filters[filterIdx] && filters[filterIdx].ext;
                if (!ext || ext === '*') return true;
                return String(name).toLowerCase().endsWith('.' + String(ext).toLowerCase());
            };

            const shade = document.createElement('div');
            shade.className = 'hypernet-dialog-shade';
            shade.innerHTML = `
                <div class="hypernet-dialog xp-filebox" role="dialog">
                    <div class="hypernet-dialog-title">${esc(opts.title || (save ? FB('saveTitle') : FB('openTitle')))}</div>
                    <div class="xp-filebox-top">
                        <label>${esc(save ? FB('saveIn') : FB('lookIn'))}</label>
                        <select class="xp-select xp-fb-look"></select>
                        <button class="xp-btn xp-fb-up focusable" tabindex="0">${esc(FB('upOneLevel'))}</button>
                        ${save ? `<button class="xp-btn xp-fb-newdir focusable" tabindex="0">${esc(FB('newFolder'))}</button>` : ''}
                    </div>
                    <div class="xp-filebox-body">
                        <div class="xp-filebox-places">
                            ${this.FILE_PLACES.map(pl => `<div class="xp-fb-place focusable" data-path="${esc(pl.path)}" tabindex="0">
                                <div class="xp-fb-place-icon">${OS.getIconHTML(pl.icon, 24)}</div>
                                <div class="xp-fb-place-name">${esc(T('HypernetOS.xp.filebox.places.' + pl.key))}</div>
                            </div>`).join('')}
                        </div>
                        <div class="xp-filebox-list xp-list"></div>
                    </div>
                    <div class="xp-filebox-foot">
                        <div class="xp-row">
                            <label>${esc(FB('fileName'))}</label>
                            <input class="xp-input xp-fb-name" type="text" value="${esc(opts.fileName || '')}">
                            <button class="hypernet-dialog-btn default focusable xp-fb-accept" tabindex="0">${esc(save ? FB('save') : FB('open'))}</button>
                        </div>
                        <div class="xp-row">
                            <label>${esc(save ? FB('saveAsType') : FB('filesOfType'))}</label>
                            <select class="xp-select xp-fb-filter">${filters.map((f, i) => `<option value="${i}">${esc(f.label)}</option>`).join('')}</select>
                            <button class="hypernet-dialog-btn focusable xp-fb-cancel" tabindex="0">${esc(FB('cancel'))}</button>
                        </div>
                    </div>
                </div>`;
            host.appendChild(shade);

            const q = sel => shade.querySelector(sel);
            const look = q('.xp-fb-look'), list = q('.xp-filebox-list');
            const nameInput = q('.xp-fb-name'), filterSel = q('.xp-fb-filter');

            const draw = () => {
                look.innerHTML = chainOf(cwd).map((c, i) =>
                    `<option value="${esc(c.path)}" ${c.path === cwd ? 'selected' : ''}>${'&nbsp;&nbsp;'.repeat(i)}${esc(c.name)}</option>`).join('');
                const rows = (fs.readDir(cwd) || [])
                    .filter(it => it.type === 'directory' || matches(it.name))
                    .sort((a, b) => (a.type === b.type)
                        ? String(a.name).localeCompare(String(b.name))
                        : (a.type === 'directory' ? -1 : 1));
                list.innerHTML = rows.length ? rows.map(it =>
                    `<div class="xp-fb-item focusable" data-name="${esc(it.name)}" data-dir="${it.type === 'directory' ? '1' : ''}" tabindex="0">
                        <span class="xp-fb-item-icon">${OS.getIconHTML(it.type === 'directory' ? 191 : 190, 16)}</span>
                        <span class="xp-fb-item-name">${esc(it.name)}</span>
                    </div>`).join('') : `<div class="xp-fb-empty">${esc(FB('emptyFolder'))}</div>`;
                list.querySelectorAll('.xp-fb-item').forEach(row => {
                    row.addEventListener('click', e => {
                        e.stopPropagation();
                        list.querySelectorAll('.xp-fb-item').forEach(o => o.classList.toggle('selected', o === row));
                        if (!row.dataset.dir) nameInput.value = row.dataset.name;
                    });
                    row.addEventListener('dblclick', e => { e.stopPropagation(); enter(row); });
                });
            };

            const enter = row => {
                if (row.dataset.dir) {
                    cwd = join(cwd, row.dataset.name);
                    nameInput.value = '';
                    draw();
                    if (window.SoundManager) SoundManager.playCursor();
                } else {
                    nameInput.value = row.dataset.name;
                    accept();
                }
            };

            let finish = null;
            const accept = () => {
                const typed = String(nameInput.value || '').trim();
                const boxTitle = opts.title || (save ? FB('saveTitle') : FB('openTitle'));
                if (!typed) { this.error(FB('noName'), boxTitle); return; }
                // A folder name typed into the box walks into it, as it did.
                const asDir = fs.resolvePath(join(cwd, typed));
                if (asDir && asDir.type === 'directory') {
                    cwd = join(cwd, typed);
                    nameInput.value = '';
                    draw();
                    return;
                }
                const full = join(cwd, typed);
                if (!save) {
                    if (!fs.resolvePath(full)) { this.error(FB('notFound', { file: typed }), boxTitle); return; }
                    finish(full);
                    return;
                }
                if (fs.exists(full)) {
                    this.confirm(FB('overwriteBody', { file: typed }), FB('overwriteTitle'), 'warning')
                        .then(ok => { if (ok) finish(full); });
                    return;
                }
                finish(full);
            };

            return new Promise(resolve => {
                const entry = { shade, resolve, opts };
                // The stack's own key handler answers Enter and Escape through
                // these, so the box commits and cancels like every other one.
                entry.buttons = [
                    { id: 'accept', label: FB(save ? 'save' : 'open'), default: true },
                    { id: 'cancel', label: FB('cancel'), cancel: true }
                ];
                this._open.push(entry);
                finish = (value) => {
                    this._open = this._open.filter(d => d !== entry);
                    if (shade.parentNode) shade.parentNode.removeChild(shade);
                    resolve(value == null ? null : value);
                };
                entry.finish = (id) => { if (id === 'accept') accept(); else finish(null); };

                shade.addEventListener('mousedown', e => e.stopPropagation());
                shade.addEventListener('click', e => e.stopPropagation());
                q('.xp-fb-accept').addEventListener('click', e => { e.stopPropagation(); accept(); });
                q('.xp-fb-cancel').addEventListener('click', e => { e.stopPropagation(); finish(null); });
                q('.xp-fb-up').addEventListener('click', e => {
                    e.stopPropagation();
                    const parts = cwd.split('/').filter(Boolean);
                    if (parts.length > 1) { parts.pop(); cwd = parts.join('/'); nameInput.value = ''; draw(); }
                });
                const newdir = q('.xp-fb-newdir');
                if (newdir) newdir.addEventListener('click', e => {
                    e.stopPropagation();
                    this.prompt(FB('newFolderPrompt'), FB('newFolderName'), FB('newFolder')).then(name => {
                        if (name && fs.mkdir(join(cwd, name))) draw();
                    });
                });
                look.addEventListener('change', () => { cwd = look.value; nameInput.value = ''; draw(); });
                filterSel.addEventListener('change', () => { filterIdx = Number(filterSel.value) || 0; draw(); });
                shade.querySelectorAll('.xp-fb-place').forEach(pl => {
                    pl.addEventListener('click', e => {
                        e.stopPropagation();
                        if (fs.resolvePath(pl.dataset.path)) { cwd = pl.dataset.path; nameInput.value = ''; draw(); }
                    });
                });
                nameInput.addEventListener('keydown', e => {
                    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); accept(); }
                });
                draw();
                setTimeout(() => { nameInput.focus(); nameInput.select(); }, 0);
            });
        },

        // The two an app actually calls.
        openFileBox(opts) { return this.file(Object.assign({ mode: 'open' }, opts || {})); },
        saveFileBox(opts) { return this.file(Object.assign({ mode: 'save' }, opts || {})); }
    };

    // Opening a document from anywhere (My Computer, Search, the Run box): the
    // program that owns the extension, then the one the player associated, then
    // the "cannot open" box.
    window.HypernetOS.openFile = function(filePath) {
        // Whatever happens next, the shell remembers it was asked for: My
        // Recent Documents is that list, and this is the one door in.
        if (window.HypernetOS.XP && window.HypernetOS.XP.reg('startRecentDocs', true)) {
            window.HypernetOS.noteRecentDoc(filePath);
        }
        const name = String(filePath).slice(String(filePath).lastIndexOf('/') + 1);
        const ext = name.toLowerCase().slice(name.lastIndexOf('.') + 1);
        const fs = window.HypernetFileSystem;
        const node = fs ? fs.resolvePath(filePath) : null;
        if (node && node.app && this._apps[node.app]) { this.launchApp(node.app); return true; }
        // i18n-ignore-start  extensions
        const openers = {
            txt: () => window.HypernetNotepad && window.HypernetNotepad.openFile(filePath),
            png: () => window.HypernetPaint && window.HypernetPaint.openFile(filePath),
            csv: () => window.HypernetOffice && window.HypernetOffice.Hexcel.openFile(filePath),
            md: () => window.HypernetOffice && window.HypernetOffice.Wyrd.openFile(filePath)
        };
        // i18n-ignore-end
        if (openers[ext]) {
            if (openers[ext]()) return true;
            this.Dialog.error(T('MyComputer.cannotOpen', { file: name }));
            return false;
        }
        const assoc = fs ? (fs.getRegistry('fileAssoc', {}) || {}) : {};
        if (assoc[ext] && this._apps[assoc[ext]]) { this.launchApp(assoc[ext]); return true; }
        this.Dialog.cannotOpen(name);
        return false;
    };

    // Programs the player removed through Add or Remove Programs stay
    // registered (the code is loaded) but vanish from the desktop, the start
    // menu and the Run box until they are put back.
    window.HypernetOS.removedApps = function() {
        const fs = window.HypernetFileSystem;
        return fs ? (fs.getRegistry('removedApps', []) || []) : [];
    };
    window.HypernetOS.isInstalled = function(app) {
        if (!app) return false;
        return !this.removedApps().includes(app.id);
    };
    window.HypernetOS.setInstalled = function(id, on) {
        const fs = window.HypernetFileSystem;
        if (!fs) return;
        const list = this.removedApps().filter(x => x !== id);
        if (!on) list.push(id);
        fs.setRegistry('removedApps', list);
        this.refreshDesktopIcons();
        this.refreshStartMenu();
    };

    // =========================================================================
    // Clipboard, event log, balloon tips
    // =========================================================================
    window.HypernetOS.Clipboard = {
        _text: '',
        _kind: 'text',   // i18n-ignore  clip kind
        set(text, kind) { this._text = String(text == null ? '' : text); this._kind = kind || 'text'; },
        get() { return this._text; },
        kind() { return this._kind; },
        clear() { this._text = ''; this._kind = 'text'; }
    };

    // Everything the machine does is written down, the way the Event Viewer
    // of the period showed it: three logs, a ring of the last hundred each,
    // kept in the registry so a reboot still remembers.
    window.HypernetOS.EventLog = {
        LIMIT: 100,
        LOGS: ['application', 'security', 'system'],   // i18n-ignore  log ids
        _all() {
            const fs = window.HypernetFileSystem;
            const stored = fs ? fs.getRegistry('eventLog', null) : null;
            return stored || { application: [], security: [], system: [] };
        },
        write(log, level, source, text) {
            const all = this._all();
            if (!all[log]) all[log] = [];
            all[log].unshift({ t: Date.now(), level: level, source: source, text: text, game: window.HypernetOS.clockStamp() });
            if (all[log].length > this.LIMIT) all[log].length = this.LIMIT;
            const fs = window.HypernetFileSystem;
            if (fs) fs.setRegistry('eventLog', all);
        },
        read(log) { return (this._all()[log] || []).slice(); },
        clear(log) {
            const all = this._all();
            all[log] = [];
            const fs = window.HypernetFileSystem;
            if (fs) fs.setRegistry('eventLog', all);
        }
    };

    // The game's clock as a stamp, shared by the logs and the file properties.
    window.HypernetOS.clockStamp = function() {
        const TDS = window.TimeDateSystem;
        const now = (TDS && typeof TDS.getCurrentDateObj === 'function') ? TDS.getCurrentDateObj() : new Date();
        const two = n => String(n).padStart(2, '0');
        return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())} ${two(now.getHours())}:${two(now.getMinutes())}`;
    };

    // The yellow tip that rises out of the tray. One at a time; a new one
    // replaces the old. Click runs the action, the x dismisses it.
    window.HypernetOS.Balloon = {
        _el: null,
        _timer: null,
        show(opts) {
            this.hide();
            const host = document.getElementById('hypernet-os-container');
            if (!host) return;
            const el = document.createElement('div');
            el.className = 'hypernet-balloon';
            el.innerHTML = `
                <div class="hypernet-balloon-head">
                    <span class="hypernet-balloon-icon icon-${opts.icon || 'info'}">${window.HypernetOS.Dialog.ICONS[opts.icon || 'info'] || ''}</span>
                    <span class="hypernet-balloon-title"></span>
                    <span class="hypernet-balloon-x focusable" tabindex="0">r</span>
                </div>
                <div class="hypernet-balloon-text"></div>`;
            el.querySelector('.hypernet-balloon-title').textContent = opts.title || '';
            el.querySelector('.hypernet-balloon-text').textContent = opts.text || '';
            el.querySelector('.hypernet-balloon-x').addEventListener('click', e => { e.stopPropagation(); this.hide(); });
            el.addEventListener('click', e => {
                e.stopPropagation();
                this.hide();
                if (typeof opts.onClick === 'function') opts.onClick();
            });
            host.appendChild(el);
            this._el = el;
            // A balloon is a notification unless it is announcing a part the
            // machine has just found, which is its own event.
            if (window.HypernetOS.XP) {
                window.HypernetOS.XP.playEvent(opts.event || 'systemNotification');   // i18n-ignore  event id
            }
            requestAnimationFrame(() => el.classList.add('open'));
            this._timer = setTimeout(() => this.hide(), opts.timeout || 12000);
        },
        hide() {
            if (this._timer) { clearTimeout(this._timer); this._timer = null; }
            if (this._el && this._el.parentNode) this._el.parentNode.removeChild(this._el);
            this._el = null;
        }
    };

    // =========================================================================
    // The XP shell: Run, the keyboard, Alt+Tab, power, the screensaver
    // -------------------------------------------------------------------------
    // The desktop's own habits, the ones the period's OS had and nobody else
    // copied: the Run box, the balloon that says the machine might be at
    // risk, Stand By, the welcome screen, the screensaver kicking in over a
    // forgotten window. All of it hangs off the scene through install() and
    // teardown(), and nothing here draws its own window chrome: every box is
    // a WindowManager window or a Dialog.
    // =========================================================================
    const XP = window.HypernetOS.XP = {
        resolveRun: resolveRun,
        RUN_ALIASES: RUN_ALIASES,
        Calc: CalcEngine,
        charmapChars: charmapChars,
        CHARMAP_SETS: CHARMAP_SETS,
        stockDesktop: stockDesktop,
        hash: xpHash,

        _scene: null,
        _timers: [],
        _keyUp: null,
        _activity: null,
        _lastInput: 0,
        _altTab: null,
        _clockTick: null,
        _lastTaskMinute: null,

        reg(key, def) { const fs = window.HypernetFileSystem; return fs ? fs.getRegistry(key, def) : def; },
        setReg(key, value) { const fs = window.HypernetFileSystem; if (fs) fs.setRegistry(key, value); },

        later(fn, ms) { const t = setTimeout(fn, ms); this._timers.push(t); return t; },

        // Wired by Scene_HypernetOS.createDesktop once the desktop exists.
        install(scene) {
            this._scene = scene;
            this._lastInput = Date.now();
            window.HypernetOS.Host.apply();
            this.applyVisualEffects();
            this.applyColorScheme();
            this.applyWallpaperPosition();
            this.buildTray();
            this.applyTaskbar();
            window.HypernetOS.refreshQuickLaunch();
            this.log('security', 'info', 'Winlogon', T('HypernetOS.xp.events.logon', { user: this.userName() }));   // i18n-ignore  source

            // Any input keeps the screensaver away.
            this._activity = () => { this._lastInput = Date.now(); if (this.Saver.active) this.Saver.stop(); };
            ['mousemove', 'mousedown', 'keydown', 'wheel'].forEach(ev => document.addEventListener(ev, this._activity, true));
            this._keyUp = (e) => this.onKeyUp(e);
            document.addEventListener('keyup', this._keyUp);

            // The second hand: scheduled tasks, the screensaver, the tray.
            this._clockTick = setInterval(() => this.tick(), 1000);

            this.startup();
        },

        teardown() {
            this._timers.forEach(t => clearTimeout(t));
            this._timers = [];
            if (this._activity) ['mousemove', 'mousedown', 'keydown', 'wheel'].forEach(ev => document.removeEventListener(ev, this._activity, true));
            this._activity = null;
            if (this._keyUp) document.removeEventListener('keyup', this._keyUp);
            this._keyUp = null;
            if (this._clockTick) clearInterval(this._clockTick);
            this._clockTick = null;
            this.Saver.stop();
            this.hideAltTab();
            window.HypernetOS.Balloon.hide();
            window.HypernetOS.Dialog._open.forEach(d => { if (d.shade.parentNode) d.shade.parentNode.removeChild(d.shade); });
            window.HypernetOS.Dialog._open = [];
            const overlay = document.getElementById('hypernet-xp-overlay');
            if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
            this._scene = null;
            window.HypernetOS.Host.reset();
        },

        log(logName, level, source, text) { window.HypernetOS.EventLog.write(logName, level, source, text); },

        userName() {
            const named = this.reg('user', '');
            if (named) return named;
            const leader = (typeof $gameParty !== 'undefined' && $gameParty) ? $gameParty.leader() : null;
            return leader ? leader.name() : T('HypernetOS.defaultUser');
        },

        // --- Boot -------------------------------------------------------------
        startup() {
            const fs = window.HypernetFileSystem;
            this.playEvent('startArchways');   // i18n-ignore  event id
            // Programs listed in msconfig's Startup tab come up on their own.
            (this.reg('startupApps', []) || []).forEach((id, i) => {
                this.later(() => { if (window.HypernetOS._apps[id]) window.HypernetOS.launchApp(id); }, 700 + i * 400);
            });
            // Found New Hardware: a part the machine did not have last time.
            const p = window.HypernetOS.Host.profile();
            const sig = [p.cpu, p.gpu, p.sound, p.modem, p.ram, p.disk].join('|');
            const last = this.reg('hwSignature', null);
            if (last !== sig) {
                this.setReg('hwSignature', sig);
                if (last !== null) {
                    this.later(() => window.HypernetOS.Balloon.show({
                        title: T('HypernetOS.xp.balloon.newHardwareTitle'),
                        text: T('HypernetOS.xp.balloon.newHardwareText', { name: p.cpu }),
                        event: 'deviceConnect',   // i18n-ignore  event id
                        onClick: () => window.HypernetOS.launchApp('app-devmgmt')
                    }), 1800);
                    this.later(() => window.HypernetOS.Balloon.show({
                        title: T('HypernetOS.xp.balloon.newHardwareTitle'),
                        text: T('HypernetOS.xp.balloon.hardwareReady'),
                        event: 'deviceConnect'   // i18n-ignore  event id
                    }), 7000);
                    this.log('system', 'info', 'PlugPlay', T('HypernetOS.xp.events.newHardware', { name: p.cpu }));   // i18n-ignore  source
                }
            }
            // Security Center: three switches, all off on a fresh install.
            const sec = this.security();
            if (!sec.firewall || !sec.updates || !sec.antivirus) {
                this.later(() => window.HypernetOS.Balloon.show({
                    title: T('HypernetOS.xp.balloon.riskTitle'),
                    text: T('HypernetOS.xp.balloon.riskText'),
                    icon: 'warning',
                    onClick: () => window.HypernetOS.launchApp('app-wscui')
                }), last === sig ? 3500 : 12000);
            }
            // Unused icons, the nag every desktop of the period got.
            this.later(() => {
                const icons = document.querySelectorAll('#hypernet-desktop-icons-container .desktop-icon').length;
                if (icons >= 8) window.HypernetOS.Balloon.show({
                    title: T('HypernetOS.xp.balloon.unusedTitle'),
                    text: T('HypernetOS.xp.balloon.unusedText'),
                    onClick: () => window.HypernetOS.launchApp('app-desk')
                });
            }, 90000);
            // Low disk space, should the drive ever fill.
            const used = window.HypernetOS.Host.diskUsedMb();
            if (used > p.disk * 0.9) {
                this.later(() => window.HypernetOS.Balloon.show({
                    title: T('HypernetOS.xp.balloon.lowDiskTitle'),
                    text: T('HypernetOS.xp.balloon.lowDiskText'),
                    icon: 'warning',
                    onClick: () => window.HypernetOS.launchApp('app-cleanmgr')
                }), 6000);
            }
            if (fs && !this.reg('firstBootDone', false)) {
                this.setReg('firstBootDone', true);
                this.later(() => window.HypernetOS.Balloon.show({
                    title: T('HypernetOS.xp.balloon.tourTitle'),
                    text: T('HypernetOS.xp.balloon.tourText'),
                    onClick: () => window.HypernetOS.launchApp('app-help')
                }), 20000);
            }
        },

        security() {
            return Object.assign({ firewall: false, updates: false, antivirus: false }, this.reg('security', {}) || {});
        },

        // --- The second hand --------------------------------------------------
        tick() {
            if (!this._scene || !this._scene.isActive()) return;
            // Scheduled tasks fire on the game clock, once per minute.
            const stamp = window.HypernetOS.clockStamp();
            const hhmm = stamp.slice(11);
            if (hhmm !== this._lastTaskMinute) {
                this._lastTaskMinute = hhmm;
                (this.reg('scheduledTasks', []) || []).forEach(task => {
                    if (task.time === hhmm && window.HypernetOS._apps[task.app] && task.enabled !== false) {
                        window.HypernetOS.launchApp(task.app);
                        task.lastRun = stamp;
                        this.log('application', 'info', 'Schedule', T('HypernetOS.xp.events.taskRan', { name: window.HypernetOS._apps[task.app].name }));   // i18n-ignore  source
                    }
                });
            }
            // The screensaver, after the wait the Display applet set.
            const kind = this.reg('screenSaver', 'none');
            const waitMin = Number(this.reg('screenSaverWait', 10)) || 10;
            if (kind !== 'none' && !this.Saver.active && !window.HypernetOS.Dialog.isOpen()
                && Date.now() - this._lastInput > waitMin * 60000) {
                this.Saver.start(kind);
            }
        },

        // --- Keyboard ---------------------------------------------------------
        // Returns true when the key was the desktop's to take.
        handleKey(event) {
            const D = window.HypernetOS.Dialog;
            if (D.handleKey(event)) return true;
            if (this.Saver.active) { this.Saver.stop(); event.preventDefault(); return true; }
            const overlay = document.getElementById('hypernet-xp-overlay');
            if (overlay && overlay.dataset.kind === 'standby') { this.resume(); event.preventDefault(); return true; }
            if (overlay) { event.preventDefault(); return true; }

            const k = event.key;
            const meta = event.metaKey;
            const lower = String(k).toLowerCase();

            if (event.altKey && k === 'Tab') { event.preventDefault(); this.altTabStep(event.shiftKey ? -1 : 1); return true; }
            // Alt+Space: the window menu of whatever is in front, dropped where
            // the title bar's own icon would have dropped it.
            if (event.altKey && (k === ' ' || k === 'Spacebar')) {
                const front = window.HypernetOS.WindowManager.windows
                    .filter(w => w.classList.contains('active') && !w.classList.contains('minimized'))[0];
                if (front) {
                    const box = front.getBoundingClientRect();
                    window.HypernetOS.showWindowMenu(front, box.left + 2, box.top + 24);
                    event.preventDefault();
                    return true;
                }
            }
            if (event.altKey && k === 'F4') { event.preventDefault(); this.altF4(); return true; }
            if (event.ctrlKey && k === 'Escape') { event.preventDefault(); this.toggleStartMenu(); return true; }
            if ((event.ctrlKey && event.shiftKey && k === 'Escape') || (event.ctrlKey && event.altKey && k === 'Delete')) {
                event.preventDefault(); window.HypernetOS.launchApp('sys-task-mgr'); return true;
            }
            if (meta && lower === 'r') { event.preventDefault(); window.HypernetOS.launchApp('app-run'); return true; }
            if (meta && lower === 'e') { event.preventDefault(); window.HypernetOS.launchApp('my-computer'); return true; }
            if (meta && lower === 'd') { event.preventDefault(); this.showDesktop(); return true; }
            if (meta && lower === 'm') { event.preventDefault(); this.minimizeAll(); return true; }
            if (meta && lower === 'f') { event.preventDefault(); window.HypernetOS.launchApp('app-search'); return true; }
            if (meta && lower === 'l') { event.preventDefault(); this.lock(); return true; }
            if (meta && (k === 'Pause' || k === 'Break')) { event.preventDefault(); window.HypernetOS.launchApp('app-sysdm'); return true; }
            const typing = document.activeElement && ['INPUT', 'TEXTAREA', 'IFRAME'].includes(document.activeElement.tagName);
            if (k === 'F1' && !typing) { event.preventDefault(); window.HypernetOS.launchApp('app-help'); return true; }
            if (k === 'F3' && !typing) { event.preventDefault(); window.HypernetOS.launchApp('app-search'); return true; }
            if (k === 'PrintScreen') { this.printScreen(); return true; }
            return false;
        },

        onKeyUp(event) {
            if (event.key === 'Alt' && this._altTab) this.altTabCommit();
        },

        toggleStartMenu() {
            const btn = document.getElementById('hypernet-start-btn');
            if (btn) btn.click();
        },

        altF4() {
            const win = window.HypernetOS._getActiveWindow();
            if (win) window.HypernetOS.WindowManager.closeWindow(win);
            else this.turnOffDialog();
        },

        openWindows() {
            return window.HypernetOS.WindowManager.windows.filter(w => w.isConnected);
        },

        showDesktop() {
            const WM = window.HypernetOS.WindowManager;
            const wins = this.openWindows();
            const anyVisible = wins.some(w => !w.classList.contains('minimized'));
            wins.forEach(w => {
                const min = w.classList.contains('minimized');
                if (anyVisible ? !min : min) WM.toggleMinimize(w);
            });
        },

        minimizeAll() {
            const WM = window.HypernetOS.WindowManager;
            this.openWindows().forEach(w => { if (!w.classList.contains('minimized')) WM.toggleMinimize(w); });
        },

        // PrintScreen copies the game's own canvas to the clipboard, so Pain
        // can paste the screen the player was looking at.
        printScreen() {
            try {
                const canvas = document.querySelector('#gameCanvas') || document.querySelector('canvas');
                if (canvas) window.HypernetOS.Clipboard.set(canvas.toDataURL('image/png'), 'image');   // i18n-ignore  mime
            } catch (e) { /* a tainted canvas is no screenshot */ }
        },

        // --- Alt+Tab ------------------------------------------------------------
        altTabStep(dir) {
            const wins = this.openWindows().sort((a, b) => (parseInt(b.style.zIndex, 10) || 0) - (parseInt(a.style.zIndex, 10) || 0));
            if (!wins.length) return;
            if (!this._altTab) {
                const host = document.getElementById('hypernet-os-container');
                const el = document.createElement('div');
                el.className = 'hypernet-alttab';
                el.innerHTML = `<div class="hypernet-alttab-row"></div><div class="hypernet-alttab-name"></div>`;
                host.appendChild(el);
                this._altTab = { el, wins, index: 0 };
                const row = el.querySelector('.hypernet-alttab-row');
                wins.forEach(w => {
                    const cell = document.createElement('div');
                    cell.className = 'hypernet-alttab-cell';
                    cell.innerHTML = w.dataset.iconHTML || window.HypernetOS.getIconHTML(234, 16);
                    row.appendChild(cell);
                });
            }
            const st = this._altTab;
            st.index = (st.index + dir + st.wins.length) % st.wins.length;
            st.el.querySelectorAll('.hypernet-alttab-cell').forEach((c, i) => c.classList.toggle('selected', i === st.index));
            st.el.querySelector('.hypernet-alttab-name').textContent = st.wins[st.index].dataset.title || '';
        },

        altTabCommit() {
            const st = this._altTab;
            this.hideAltTab();
            if (!st) return;
            const win = st.wins[st.index];
            if (!win || !win.isConnected) return;
            const WM = window.HypernetOS.WindowManager;
            if (win.classList.contains('minimized')) WM.toggleMinimize(win);
            WM.bringToFront(win);
        },

        hideAltTab() {
            if (this._altTab && this._altTab.el.parentNode) this._altTab.el.parentNode.removeChild(this._altTab.el);
            this._altTab = null;
        },

        // --- Power ------------------------------------------------------------
        overlay(kind, html) {
            let el = document.getElementById('hypernet-xp-overlay');
            if (!el) {
                el = document.createElement('div');
                el.id = 'hypernet-xp-overlay';
                const host = document.getElementById('hypernet-os-container');
                if (host) host.appendChild(el);
            }
            el.dataset.kind = kind;
            el.className = 'hypernet-xp-overlay kind-' + kind;
            el.innerHTML = html;
            return el;
        },

        clearOverlay() {
            const el = document.getElementById('hypernet-xp-overlay');
            if (el && el.parentNode) el.parentNode.removeChild(el);
        },

        // The Turn Off box: Stand By, Turn Off, Restart. Its own overlay, not a
        // Dialog, because the period drew it as three big glyphs on a fade.
        turnOffDialog() {
            const X = 'HypernetOS.xp.power.';
            const el = this.overlay('turnoff', `
                <div class="hypernet-power-box">
                    <div class="hypernet-power-title">${T(X + 'turnOffTitle')}</div>
                    <div class="hypernet-power-row">
                        <div class="hypernet-power-btn focusable" data-act="standby" tabindex="0"><div class="glyph glyph-standby"></div><div>${T(X + 'standBy')}</div></div>
                        <div class="hypernet-power-btn focusable" data-act="off" tabindex="0"><div class="glyph glyph-off"></div><div>${T(X + 'turnOff')}</div></div>
                        <div class="hypernet-power-btn focusable" data-act="restart" tabindex="0"><div class="glyph glyph-restart"></div><div>${T(X + 'restart')}</div></div>
                    </div>
                    <div class="hypernet-power-foot"><button class="hypernet-dialog-btn focusable" data-act="cancel" tabindex="0">${T('HypernetOS.xp.dialog.cancel')}</button></div>
                </div>`);
            el.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', e => {
                e.stopPropagation();
                const act = b.dataset.act;
                this.clearOverlay();
                if (act === 'standby') this.standBy();
                else if (act === 'off') this.shutdown('off');
                else if (act === 'restart') this.shutdown('restart');
            }));
            const first = el.querySelector('[data-act="off"]');
            if (first) first.focus();
        },

        logOffDialog() {
            const X = 'HypernetOS.xp.power.';
            const el = this.overlay('logoff', `
                <div class="hypernet-power-box">
                    <div class="hypernet-power-title">${T(X + 'logOffTitle')}</div>
                    <div class="hypernet-power-row">
                        <div class="hypernet-power-btn focusable" data-act="switch" tabindex="0"><div class="glyph glyph-switch"></div><div>${T(X + 'switchUser')}</div></div>
                        <div class="hypernet-power-btn focusable" data-act="logoff" tabindex="0"><div class="glyph glyph-logoff"></div><div>${T(X + 'logOff')}</div></div>
                    </div>
                    <div class="hypernet-power-foot"><button class="hypernet-dialog-btn focusable" data-act="cancel" tabindex="0">${T('HypernetOS.xp.dialog.cancel')}</button></div>
                </div>`);
            el.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', e => {
                e.stopPropagation();
                const act = b.dataset.act;
                this.clearOverlay();
                if (act === 'switch') this.welcomeScreen(false);
                else if (act === 'logoff') this.shutdown('logoff');
            }));
        },

        // Stand By dims the panel; the first key or click wakes it.
        standBy() {
            this.log('system', 'info', 'Power', T('HypernetOS.xp.events.standby'));   // i18n-ignore  source
            window.HypernetOS.Balloon.hide();
            const el = this.overlay('standby', `<div class="hypernet-standby-led"></div>`);
            el.addEventListener('click', e => { e.stopPropagation(); this.resume(); });
        },

        resume() {
            this.clearOverlay();
            this._lastInput = Date.now();
            this.log('system', 'info', 'Power', T('HypernetOS.xp.events.resume'));   // i18n-ignore  source
        },

        // The lock screen and Switch User both land on the welcome screen: the
        // party members are the accounts on this machine.
        lock() { this.welcomeScreen(true); },

        // Who has an account here. The welcome screen has always believed the
        // party are the accounts; User Accounts believes it too, so the answer
        // is given once rather than worked out in each of them.
        accountNames() {
            const members = (typeof $gameParty !== 'undefined' && $gameParty) ? $gameParty.members() : [];
            return members.length ? members.map(m => m.name()) : [this.userName()];
        },

        welcomeScreen(locked) {
            const X = 'HypernetOS.xp.welcome.';
            const names = this.accountNames();
            const current = this.userName();
            const tiles = names.map((n, i) => `
                <div class="hypernet-welcome-user focusable" data-name="${n.replace(/"/g, '&quot;')}" tabindex="0">
                    <div class="hypernet-welcome-avatar" style="background: hsl(${(xpHash(n) % 360)}, 55%, 55%)">${window.HypernetOS.getIconHTML(245, 28)}</div>
                    <div class="hypernet-welcome-name">${n}</div>
                    <div class="hypernet-welcome-note">${n === current ? (locked ? T(X + 'locked') : T(X + 'loggedOn')) : ''}</div>
                </div>`).join('');
            const el = this.overlay('welcome', `
                <div class="hypernet-welcome">
                    <div class="hypernet-welcome-left">
                        <div class="hypernet-welcome-logo">${T(X + 'brand')}</div>
                        <div class="hypernet-welcome-hint">${T(X + 'hint')}</div>
                    </div>
                    <div class="hypernet-welcome-right">${tiles}</div>
                    <div class="hypernet-welcome-foot">
                        <button class="hypernet-dialog-btn focusable" data-act="off" tabindex="0">${T('HypernetOS.xp.power.turnOff')}</button>
                        <span>${T(X + 'foot')}</span>
                    </div>
                </div>`);
            el.querySelectorAll('.hypernet-welcome-user').forEach(u => u.addEventListener('click', e => {
                e.stopPropagation();
                const name = u.dataset.name;
                this.clearOverlay();
                if (name !== current) {
                    this.setReg('user', name);
                    const header = document.querySelector('.start-menu-username');
                    if (header) header.textContent = name;
                    this.log('security', 'info', 'Winlogon', T('HypernetOS.xp.events.switchUser', { user: name }));   // i18n-ignore  source
                    if (window.SoundManager) SoundManager.playOk();
                } else {
                    this.log('security', 'info', 'Winlogon', T('HypernetOS.xp.events.unlock', { user: name }));   // i18n-ignore  source
                }
            }));
            el.querySelector('[data-act="off"]').addEventListener('click', e => { e.stopPropagation(); this.clearOverlay(); this.shutdown('off'); });
        },

        // Turning off, restarting and logging off all walk through the same
        // black screen with the period's words on it, then part ways.
        shutdown(mode) {
            const X = 'HypernetOS.xp.power.';
            const scene = this._scene;
            window.HypernetOS.Balloon.hide();
            this.log('system', 'info', 'USER32', T(X + (mode === 'off' ? 'eventOff' : mode === 'restart' ? 'eventRestart' : 'eventLogoff')));   // i18n-ignore  source
            const step = (text, cls) => this.overlay('shutdown', `<div class="hypernet-shutdown ${cls || ''}">${text}</div>`);
            step(mode === 'logoff' ? T(X + 'savingSettings') : T(X + 'shuttingDown'));
            this.playEvent('exitArchways');   // i18n-ignore  event id
            const finishOff = () => {
                step(T(X + 'safeToTurnOff'), 'safe');
                this.later(() => { this.clearOverlay(); if (scene) scene.onTurnOffClick(); }, 1400);
            };
            const finishLogoff = () => { this.clearOverlay(); if (scene) scene.onExitClick(); };
            const finishRestart = () => {
                window.HypernetOS.WindowManager.closeAll();
                step(`<div class="hypernet-boot-logo">${T('HypernetOS.xp.welcome.brand')}</div><div class="hypernet-boot-bar"><i></i></div>`, 'boot');
                this.later(() => {
                    this.clearOverlay();
                    this._lastInput = Date.now();
                    this.setReg('hwSignature', null);
                    window.HypernetOS.Kernel.bootTime = Date.now();
                    if (window.SoundManager) SoundManager.playLoad();
                    this.startup();
                }, 2600);
            };
            this.later(mode === 'off' ? finishOff : mode === 'restart' ? finishRestart : finishLogoff, 1300);
        },

        // "X has encountered a problem and needs to close": the box a crashed
        // launch shows in place of a console line.
        errorReport(appName, err) {
            const X = 'HypernetOS.xp.errrep.';
            this.log('application', 'error', 'Application Error', T(X + 'event', { name: appName, error: String(err && err.message || err) }));   // i18n-ignore  source
            return window.HypernetOS.Dialog.show({
                title: appName,
                message: T(X + 'body', { name: appName }),
                icon: 'error',
                buttons: [
                    { id: 'send', label: T(X + 'send'), default: true },
                    { id: 'dont', label: T(X + 'dontSend'), cancel: true }
                ]
            }).then(r => {
                if (r.button === 'send') {
                    window.HypernetOS.Balloon.show({ title: T(X + 'sentTitle'), text: T(X + 'sentText') });
                }
            });
        },

        // --- Visual settings ------------------------------------------------------
        visualEffects() {
            return Object.assign({ animate: true, shadows: true, fade: true, dragContents: true, smoothFonts: true }, this.reg('visualEffects', {}) || {});
        },
        applyVisualEffects() {
            const host = document.getElementById('hypernet-os-container');
            if (!host) return;
            const fx = this.visualEffects();
            host.classList.toggle('xp-fx-noanim', !fx.animate);
            host.classList.toggle('xp-fx-noshadow', !fx.shadows);
            host.classList.toggle('xp-fx-nofade', !fx.fade);
            host.classList.toggle('xp-fx-nodrag', !fx.dragContents);
            host.classList.toggle('xp-fx-nosmooth', !fx.smoothFonts);
        },
        applyColorScheme() {
            const host = document.getElementById('hypernet-os-container');
            if (!host) return;
            const scheme = this.reg('colorScheme', 'blue');
            ['blue', 'olive', 'silver', 'classic'].forEach(s => host.classList.toggle('xp-scheme-' + s, s === scheme));   // i18n-ignore  scheme ids
        },
        applyWallpaperPosition() {
            const desktop = document.getElementById('hypernet-os-desktop');
            if (!desktop) return;
            const pos = this.reg('wallpaperPosition', 'stretch');
            ['stretch', 'tile', 'center'].forEach(p => desktop.classList.toggle('xp-wp-' + p, p === pos));   // i18n-ignore  position ids
        },

        // --- The tray -----------------------------------------------------------
        // --- The sound scheme ---------------------------------------------------
        // Sounds and Audio Devices has always listed the program events and let
        // one be auditioned, and nothing but that Test button ever played one:
        // the machine started, shut down, minimized a window and emptied the
        // bin in silence. Every one of those now says so through here.
        //
        // The table it reads is the applet's own (SOUND_EVENTS), so an event
        // added to the list is playable from the moment it is listed, and the
        // scheme and the mute switch are honoured in one place rather than at
        // seventeen call sites. Scheme 1 is No Sounds, which is the whole of
        // what that scheme means.
        SCHEME_SILENT: 1,

        playEvent(id) {
            if (!window.SoundManager) return false;
            if (this.reg('audioMuted', false)) return false;
            if (this.reg('soundScheme', 0) === this.SCHEME_SILENT) return false;
            const table = (window.HypernetOS.XP && window.HypernetOS.XP.SOUND_EVENTS) || [];
            const ev = table.find(e => e[0] === id);
            if (!ev || typeof SoundManager[ev[1]] !== 'function') return false;
            SoundManager[ev[1]]();
            return true;
        },

        // The four message-box faces are program events of their own, so a box
        // sounds like the box it is rather than like every other box.
        DIALOG_EVENTS: {
            // i18n-ignore-start  icon key -> program event id
            error: 'criticalStop', warning: 'exclamation',
            question: 'question', info: 'asterisk'
            // i18n-ignore-end
        },

        // --- The bar's own settings ---------------------------------------------
        // Four switches the bar has always had and this one did not: locked,
        // auto-hidden, the clock shown, and the inactive icons folded behind a
        // chevron. All four live in the registry, so they outlast a log off,
        // and all four are applied from here rather than by whoever flipped
        // them: the Properties page, the bar's own menu and a fresh log on all
        // end up calling this.
        applyTaskbar() {
            const bar = document.getElementById('hypernet-taskbar');
            if (!bar) return;
            const locked = this.reg('taskbarLocked', false);
            const auto = this.reg('taskbarAutoHide', false);
            bar.classList.toggle('locked', !!locked);
            bar.classList.toggle('autohide', !!auto);

            const clock = document.getElementById('tray-clock');
            if (clock) clock.classList.toggle('hidden', !this.reg('trayClock', true));

            this.applyTrayHiding();

            // The bar's right click, hooked once. Anywhere that is not one of
            // its buttons: a button answers with the window menu instead.
            if (!bar._xpMenuHooked) {
                bar._xpMenuHooked = true;
                bar.addEventListener('contextmenu', e => {
                    if (e.target.closest('.taskbar-tab') || e.target.closest('.quick-launch-btn')) return;
                    e.preventDefault();
                    e.stopPropagation();
                    window.HypernetOS.ContextMenu.show(e.clientX, e.clientY,
                        window.HypernetOS.ContextMenu.itemsForTaskbar());
                });
            }
            // Auto-hide: the bar comes up when the pointer reaches the foot of
            // the screen and drops away again when it leaves.
            if (!bar._xpHideHooked) {
                bar._xpHideHooked = true;
                bar.addEventListener('mouseenter', () => bar.classList.add('peek'));
                bar.addEventListener('mouseleave', () => bar.classList.remove('peek'));
            }
        },

        // The chevron folds every tray icon but the clock away, the way the
        // notification area folded the ones nothing had happened in.
        applyTrayHiding() {
            const tray = document.getElementById('hypernet-system-tray');
            const chevron = document.getElementById('tray-chevron');
            if (!tray || !chevron) return;
            const hiding = this.reg('trayHideInactive', false);
            const shown = !!this._trayExpanded;
            chevron.classList.toggle('hidden', !hiding);
            chevron.classList.toggle('expanded', shown);
            chevron.title = shown ? T('HypernetOS.xp.taskbar.hideInactive') : T('HypernetOS.xp.taskbar.showHidden');
            tray.querySelectorAll('.tray-icon').forEach(icon => {
                icon.classList.toggle('folded', !!hiding && !shown);
            });
            if (!chevron._xpHooked) {
                chevron._xpHooked = true;
                chevron.addEventListener('click', e => {
                    e.stopPropagation();
                    this._trayExpanded = !this._trayExpanded;
                    this.applyTrayHiding();
                });
            }
        },

        buildTray() {
            const tray = document.getElementById('hypernet-system-tray');
            if (!tray) return;
            const icons = tray.querySelectorAll('.tray-icon');
            if (icons[0]) { icons[0].id = 'tray-net'; icons[0].classList.add('focusable'); icons[0].tabIndex = 0; icons[0].addEventListener('click', e => { e.stopPropagation(); window.HypernetOS.launchApp('app-netstat'); }); }
            if (icons[1]) { icons[1].id = 'tray-shield'; icons[1].classList.add('focusable'); icons[1].tabIndex = 0; icons[1].addEventListener('click', e => { e.stopPropagation(); window.HypernetOS.launchApp('app-wscui'); }); }
            if (this.reg('trayVolume', true) && !document.getElementById('tray-volume')) {
                const vol = document.createElement('div');
                vol.className = 'tray-icon tray-volume focusable';
                vol.id = 'tray-volume';
                vol.tabIndex = 0;
                vol.title = T('HypernetOS.xp.mmsys.trayTitle');
                vol.addEventListener('click', e => { e.stopPropagation(); window.HypernetOS.launchApp('app-mmsys'); });
                tray.insertBefore(vol, tray.querySelector('#tray-clock'));
            }
            const clock = document.getElementById('tray-clock');
            if (clock) {
                clock.classList.add('focusable');
                clock.tabIndex = 0;
                clock.addEventListener('dblclick', e => { e.stopPropagation(); window.HypernetOS.launchApp('app-timedate'); });
            }
        },

        // --- The screensaver ----------------------------------------------------
        Saver: {
            active: false,
            _raf: null,
            _canvas: null,
            KINDS: ['none', 'blank', 'starfield', 'mystify', 'marquee', 'beziers', 'pipes'],   // i18n-ignore  saver ids

            start(kind, preview) {
                this.stop();
                const host = document.getElementById('hypernet-os-container');
                if (!host || kind === 'none') return;
                const canvas = document.createElement('canvas');
                canvas.className = 'hypernet-saver' + (preview ? ' preview' : '');
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
                host.appendChild(canvas);
                this._canvas = canvas;
                this.active = true;
                canvas.addEventListener('mousedown', e => { e.stopPropagation(); this.stop(); });
                const ctx = canvas.getContext('2d');
                const W = canvas.width, H = canvas.height;
                const state = this.seed(kind, W, H);
                const frame = () => {
                    if (!this.active) return;
                    this.draw(kind, ctx, W, H, state);
                    this._raf = requestAnimationFrame(frame);
                };
                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, W, H);
                frame();
                if (!preview) window.HypernetOS.XP.log('system', 'info', 'Screensaver', T('HypernetOS.xp.events.saver'));   // i18n-ignore  source
            },

            stop() {
                this.active = false;
                if (this._raf) cancelAnimationFrame(this._raf);
                this._raf = null;
                if (this._canvas && this._canvas.parentNode) this._canvas.parentNode.removeChild(this._canvas);
                this._canvas = null;
            },

            seed(kind, W, H) {
                const rnd = () => Math.random();
                if (kind === 'starfield') {
                    return { stars: Array.from({ length: 240 }, () => ({ x: (rnd() - 0.5) * W, y: (rnd() - 0.5) * H, z: rnd() * W })) };
                }
                if (kind === 'mystify') {
                    const poly = () => ({
                        pts: Array.from({ length: 4 }, () => ({ x: rnd() * W, y: rnd() * H, dx: (rnd() - 0.5) * 6, dy: (rnd() - 0.5) * 6 })),
                        hue: rnd() * 360, trail: []
                    });
                    return { polys: [poly(), poly()] };
                }
                if (kind === 'marquee') {
                    return { x: W, text: window.HypernetOS.XP.reg('marqueeText', T('HypernetOS.xp.saver.marqueeDefault')), y: H / 2, hue: 0 };
                }
                if (kind === 'beziers') {
                    return { t: 0, pts: Array.from({ length: 4 }, () => ({ x: rnd() * W, y: rnd() * H, dx: (rnd() - 0.5) * 4, dy: (rnd() - 0.5) * 4 })), hue: rnd() * 360 };
                }
                if (kind === 'pipes') {
                    return { pipes: [], ticks: 0 };
                }
                return {};
            },

            draw(kind, ctx, W, H, st) {
                if (kind === 'blank') { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); return; }
                if (kind === 'starfield') {
                    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
                    st.stars.forEach(s => {
                        s.z -= 6;
                        if (s.z <= 1) { s.x = (Math.random() - 0.5) * W; s.y = (Math.random() - 0.5) * H; s.z = W; }
                        const k = 256 / s.z;
                        const px = s.x * k + W / 2, py = s.y * k + H / 2;
                        const size = Math.max(0.5, (1 - s.z / W) * 3);
                        ctx.fillStyle = 'rgba(255,255,255,' + Math.min(1, 1.2 - s.z / W) + ')';
                        ctx.fillRect(px, py, size, size);
                    });
                    return;
                }
                if (kind === 'mystify') {
                    ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(0, 0, W, H);
                    st.polys.forEach(p => {
                        p.pts.forEach(q => {
                            q.x += q.dx; q.y += q.dy;
                            if (q.x < 0 || q.x > W) q.dx = -q.dx;
                            if (q.y < 0 || q.y > H) q.dy = -q.dy;
                        });
                        p.hue = (p.hue + 0.7) % 360;
                        ctx.strokeStyle = 'hsl(' + p.hue + ', 100%, 60%)';
                        ctx.beginPath();
                        p.pts.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y));
                        ctx.closePath();
                        ctx.stroke();
                    });
                    return;
                }
                if (kind === 'marquee') {
                    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
                    ctx.font = 'bold 72px Tahoma, sans-serif';
                    st.hue = (st.hue + 1) % 360;
                    ctx.fillStyle = 'hsl(' + st.hue + ', 90%, 60%)';
                    const w = ctx.measureText(st.text).width;
                    st.x -= 4;
                    if (st.x < -w) { st.x = W; st.y = 80 + Math.random() * (H - 160); }
                    ctx.fillText(st.text, st.x, st.y);
                    return;
                }
                if (kind === 'beziers') {
                    ctx.fillStyle = 'rgba(0,0,0,0.05)'; ctx.fillRect(0, 0, W, H);
                    st.pts.forEach(q => {
                        q.x += q.dx; q.y += q.dy;
                        if (q.x < 0 || q.x > W) q.dx = -q.dx;
                        if (q.y < 0 || q.y > H) q.dy = -q.dy;
                    });
                    st.hue = (st.hue + 0.5) % 360;
                    ctx.strokeStyle = 'hsl(' + st.hue + ', 100%, 65%)';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(st.pts[0].x, st.pts[0].y);
                    ctx.bezierCurveTo(st.pts[1].x, st.pts[1].y, st.pts[2].x, st.pts[2].y, st.pts[3].x, st.pts[3].y);
                    ctx.stroke();
                    return;
                }
                if (kind === 'pipes') {
                    // Flat pipes: a segment grows in one of four directions,
                    // turns at random, and a new colour starts when it dies.
                    st.ticks++;
                    if (!st.pipes.length || st.ticks % 900 === 0) {
                        if (st.ticks % 900 === 0) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); st.pipes = []; }
                        st.pipes.push({ x: Math.random() * W, y: Math.random() * H, dir: Math.floor(Math.random() * 4), hue: Math.random() * 360, life: 0 });
                    }
                    st.pipes.forEach(p => {
                        const step = 4;
                        const prev = { x: p.x, y: p.y };
                        if (p.dir === 0) p.x += step; else if (p.dir === 1) p.y += step; else if (p.dir === 2) p.x -= step; else p.y -= step;
                        if (p.x < 0 || p.x > W || p.y < 0 || p.y > H || Math.random() < 0.02) {
                            p.dir = (p.dir + (Math.random() < 0.5 ? 1 : 3)) % 4;
                            p.x = Math.max(0, Math.min(W, p.x)); p.y = Math.max(0, Math.min(H, p.y));
                            ctx.fillStyle = 'hsl(' + p.hue + ', 80%, 45%)';
                            ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI * 2); ctx.fill();
                        }
                        ctx.strokeStyle = 'hsl(' + p.hue + ', 80%, 55%)';
                        ctx.lineWidth = 12;
                        ctx.lineCap = 'round';
                        ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(p.x, p.y); ctx.stroke();
                        p.life++;
                        if (p.life > 600) { p.life = 0; p.hue = Math.random() * 360; p.x = Math.random() * W; p.y = Math.random() * H; }
                    });
                    if (st.pipes.length < 3 && st.ticks % 200 === 0) st.pipes.push({ x: Math.random() * W, y: Math.random() * H, dir: Math.floor(Math.random() * 4), hue: Math.random() * 360, life: 0 });
                }
            }
        }
    };

    // =========================================================================
    // The applets
    // -------------------------------------------------------------------------
    // Every small program of the period, each a registered app so the Run
    // box, the start menu, the shell's START and the Control Panel all reach
    // it the same way. None has a desktop shortcut of its own except the
    // Recycle Bin, which sits where it always sat.
    // =========================================================================
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const XK = key => 'HypernetOS.xp.' + key;

    // Registers one applet: `key` names its i18n branch (appName lives there),
    // build(win, T_) fills the window it was given.
    function xpApp(id, key, icon, size, build, extra) {
        const T_ = (sub, p) => T(XK(key + '.' + sub), p);
        window.HypernetOS.registerApp(Object.assign({
            id: id,
            name: T_('appName'),
            icon: icon,
            desktopShortcut: false,
            category: 'system',   // i18n-ignore  category id
            launchFn: function(params) {
                const win = window.HypernetOS.WindowManager.createWindow({
                    id: 'win-' + id,
                    title: T_('appName'),
                    icon: icon,
                    width: size[0],
                    height: size[1],
                    contentHTML: `<div class="xp-app xp-${key}"></div>`
                });
                const root = win.querySelector('.xp-app');
                if (root && !root.dataset.built) {
                    root.dataset.built = '1';
                    build(win, root, T_, params);
                }
                return win;
            }
        }, extra || {}));
    }

    const q = (root, sel) => root.querySelector(sel);
    const on = (el, ev, fn) => { if (el) el.addEventListener(ev, e => { e.stopPropagation(); fn(e); }); };
    const tabsOf = (root, onChange) => {
        root.querySelectorAll('.xp-tab').forEach(tab => on(tab, 'click', () => {
            root.querySelectorAll('.xp-tab').forEach(t => t.classList.toggle('active', t === tab));
            root.querySelectorAll('.xp-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === tab.dataset.tab));
            if (onChange) onChange(tab.dataset.tab);
        }));
    };
    const tabBar = (T_, ids) => `<div class="xp-tabs">${ids.map((id, i) => `<div class="xp-tab focusable ${i ? '' : 'active'}" data-tab="${id}" tabindex="0">${T_('tab.' + id)}</div>`).join('')}</div>`;
    const pane = (id, html, active) => `<div class="xp-pane ${active ? 'active' : ''}" data-pane="${id}">${html}</div>`;
    const btn = (id, label, extra) => `<button class="xp-btn focusable ${extra || ''}" id="${id}" tabindex="0">${label}</button>`;

    // --- Run ---------------------------------------------------------------------
    xpApp('app-run', 'run', 234, [420, 190], (win, root, T_) => {
        const history = XP.reg('runHistory', []) || [];
        root.innerHTML = `
            <div class="xp-run">
                <div class="xp-run-head">${window.HypernetOS.getIconHTML(234, 32)}<div>${T_('body')}</div></div>
                <div class="xp-run-row"><label>${T_('open')}</label>
                    <input class="xp-input" id="run-input" list="run-history" value="${esc(history[0] || '')}">
                    <datalist id="run-history">${history.map(h => `<option value="${esc(h)}">`).join('')}</datalist>
                </div>
                <div class="xp-row-right">${btn('run-ok', T('HypernetOS.xp.dialog.ok'), 'default')}${btn('run-cancel', T('HypernetOS.xp.dialog.cancel'))}${btn('run-browse', T_('browse'))}</div>
            </div>`;
        const input = q(root, '#run-input');
        const go = () => {
            const text = input.value.trim();
            if (!text) return;
            const hit = resolveRun(text, window.HypernetOS._apps);
            if (!hit || !window.HypernetOS.isInstalled(window.HypernetOS._apps[hit.appId])) {
                window.HypernetOS.Dialog.error(T_('notFound', { name: text }), T_('appName'));
                return;
            }
            const list = [text].concat(history.filter(h => h !== text)).slice(0, 12);
            XP.setReg('runHistory', list);
            window.HypernetOS.WindowManager.closeWindow(win);
            if (hit.arg && hit.appId === 'app-hypernet-browser') window.HypernetOS._apps[hit.appId].launchFn({ url: hit.arg });
            else window.HypernetOS.launchApp(hit.appId);
        };
        on(q(root, '#run-ok'), 'click', go);
        input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.stopPropagation(); go(); } });
        on(q(root, '#run-cancel'), 'click', () => window.HypernetOS.WindowManager.closeWindow(win));
        on(q(root, '#run-browse'), 'click', () => window.HypernetOS.launchApp('my-computer'));
        setTimeout(() => { input.focus(); input.select(); }, 50);
    });

    // --- About Archways ------------------------------------------------------------
    xpApp('app-winver', 'winver', 234, [440, 330], (win, root, T_) => {
        const p = window.HypernetOS.Host.profile();
        const st = window.HypernetOS.Kernel.getStats();
        root.innerHTML = `
            <div class="xp-winver">
                <div class="xp-winver-banner">${T('HypernetOS.xp.welcome.brand')}</div>
                <div class="xp-winver-body">
                    <div>${T_('version')}</div>
                    <div>${T_('copyright')}</div>
                    <div class="xp-winver-gap">${T_('licensed')}</div>
                    <div class="xp-winver-indent">${esc(XP.userName())}</div>
                    <div class="xp-winver-indent">${esc(p.vendor)}</div>
                    <div class="xp-winver-indent">${esc(p.serial)}</div>
                    <div class="xp-winver-gap">${T_('memory', { mb: st.totalRAM })}</div>
                </div>
                <div class="xp-row-right">${btn('winver-ok', T('HypernetOS.xp.dialog.ok'), 'default')}</div>
            </div>`;
        on(q(root, '#winver-ok'), 'click', () => window.HypernetOS.WindowManager.closeWindow(win));
    }, { category: 'accessories' });

    // --- Calculator ----------------------------------------------------------------
    xpApp('app-calc', 'calc', 84, [300, 330], (win, root, T_) => {
        const st = CalcEngine.create();
        // i18n-ignore-start  key layout
        const rows = [
            ['BS', 'CE', 'C'],
            ['MC', '7', '8', '9', '/', 'sqrt'],
            ['MR', '4', '5', '6', '*', '%'],
            ['MS', '1', '2', '3', '-', '1/x'],
            ['M+', '0', '+/-', '.', '+', '=']
        ];
        // i18n-ignore-end
        const labels = { BS: T_('backspace'), CE: T_('clearEntry'), C: T_('clear'), sqrt: T_('sqrt') };
        root.innerHTML = `
            <div class="xp-calc">
                <div class="xp-calc-display" id="calc-display">0</div>
                <div class="xp-calc-memflag" id="calc-mem"></div>
                ${rows.map((r, i) => `<div class="xp-calc-row ${i ? '' : 'top'}">${r.map(k => `<button class="xp-calc-key focusable ${/^[0-9.]$/.test(k) ? 'num' : ''} ${/^M/.test(k) ? 'mem' : ''}" data-key="${k}" tabindex="0">${labels[k] || k}</button>`).join('')}</div>`).join('')}
            </div>`;
        const display = q(root, '#calc-display');
        const mem = q(root, '#calc-mem');
        const press = k => {
            CalcEngine.press(st, k);
            display.textContent = st.display;
            mem.textContent = st.memory ? 'M' : '';   // i18n-ignore  memory flag
            if (st.error && window.SoundManager) SoundManager.playBuzzer();
        };
        root.querySelectorAll('.xp-calc-key').forEach(b => on(b, 'click', () => press(b.dataset.key)));
        win.addEventListener('keydown', e => {
            const map = { Enter: '=', Backspace: 'BS', Escape: 'C', Delete: 'CE' };
            const k = map[e.key] || e.key;
            if (/^[0-9.+\-*/=%]$/.test(k) || ['BS', 'C', 'CE'].includes(k)) { e.stopPropagation(); e.preventDefault(); press(k); }
        });
    }, { category: 'accessories' });

    // --- Character Map ---------------------------------------------------------------
    xpApp('app-charmap', 'charmap', 84, [560, 420], (win, root, T_) => {
        root.innerHTML = `
            <div class="xp-charmap">
                <div class="xp-row"><label>${T_('font')}</label>
                    <select class="xp-select" id="cm-set">${CHARMAP_SETS.map(s => `<option value="${s.id}">${T_('set.' + s.id)}</option>`).join('')}</select>
                </div>
                <div class="xp-charmap-grid" id="cm-grid"></div>
                <div class="xp-row"><label>${T_('toCopy')}</label><input class="xp-input" id="cm-out">${btn('cm-select', T_('select'))}${btn('cm-copy', T_('copy'))}</div>
                <div class="xp-charmap-status" id="cm-status"></div>
            </div>`;
        const grid = q(root, '#cm-grid');
        const out = q(root, '#cm-out');
        const status = q(root, '#cm-status');
        let current = '';
        const render = () => {
            grid.innerHTML = charmapChars(q(root, '#cm-set').value).map(ch =>
                `<div class="xp-charmap-cell focusable" data-ch="${esc(ch)}" tabindex="0">${esc(ch)}</div>`).join('');
            grid.querySelectorAll('.xp-charmap-cell').forEach(cell => {
                on(cell, 'click', () => {
                    grid.querySelectorAll('.xp-charmap-cell').forEach(c => c.classList.toggle('selected', c === cell));
                    current = cell.dataset.ch;
                    status.textContent = T_('status', { code: 'U+' + current.codePointAt(0).toString(16).toUpperCase().padStart(4, '0') });   // i18n-ignore  code point prefix
                });
                on(cell, 'dblclick', () => { out.value += cell.dataset.ch; });
            });
        };
        on(q(root, '#cm-set'), 'change', render);
        on(q(root, '#cm-select'), 'click', () => { if (current) out.value += current; });
        on(q(root, '#cm-copy'), 'click', () => {
            window.HypernetOS.Clipboard.set(out.value);
            status.textContent = T_('copied');
            if (window.SoundManager) SoundManager.playOk();
        });
        render();
    }, { category: 'accessories' });

    // --- ClipBook Viewer --------------------------------------------------------------
    xpApp('app-clipbrd', 'clipbrd', 191, [420, 300], (win, root, T_) => {
        const render = () => {
            const C = window.HypernetOS.Clipboard;
            const text = C.get();
            root.innerHTML = `
                <div class="xp-clipbrd">
                    <div class="xp-toolbar">${btn('cb-refresh', T_('refresh'))}${btn('cb-clear', T_('clear'))}${btn('cb-paste', T_('pasteNotepad'))}</div>
                    <div class="xp-clipbrd-body">${!text ? `<div class="xp-empty">${T_('empty')}</div>`
                        : C.kind() === 'image' ? `<img src="${text}" alt="">` : `<pre>${esc(text)}</pre>`}</div>
                    <div class="xp-status">${T_('format', { kind: T_('kind.' + C.kind()), size: text.length })}</div>
                </div>`;
            on(q(root, '#cb-refresh'), 'click', render);
            on(q(root, '#cb-clear'), 'click', () => { C.clear(); render(); });
            on(q(root, '#cb-paste'), 'click', () => {
                if (window.HypernetNotepad && window.HypernetNotepad.openText) window.HypernetNotepad.openText(text);
                else window.HypernetOS.launchApp('app-hypernet-notepad');
            });
        };
        render();
    }, { category: 'accessories' });

    // --- Registry Editor ---------------------------------------------------------------
    xpApp('app-regedit', 'regedit', 234, [640, 440], (win, root, T_) => {
        const fs = window.HypernetFileSystem;
        // i18n-ignore-start  hive names
        const HIVES = ['HKEY_CLASSES_ROOT', 'HKEY_CURRENT_USER', 'HKEY_LOCAL_MACHINE', 'HKEY_USERS', 'HKEY_CURRENT_CONFIG'];
        const PATH = 'HKEY_CURRENT_USER\\Software\\Archways\\CurrentVersion';
        // i18n-ignore-end
        const render = () => {
            const reg = ($gameSystem && $gameSystem._hypernetRegistry) || {};
            const keys = Object.keys(reg).sort();
            const typeOf = v => typeof v === 'number' ? 'REG_DWORD' : typeof v === 'string' ? 'REG_SZ' : 'REG_BINARY';   // i18n-ignore  value types
            const show = v => typeof v === 'string' ? v : typeof v === 'number' ? '0x' + v.toString(16).padStart(8, '0') + ' (' + v + ')' : JSON.stringify(v);   // i18n-ignore  hex prefix
            root.innerHTML = `
                <div class="xp-regedit">
                    <div class="xp-regedit-tree">${HIVES.map(h => `<div class="xp-tree-node ${h === 'HKEY_CURRENT_USER' ? 'open' : ''}">+ ${h}</div>`).join('')}
                        <div class="xp-tree-leaf selected">${T_('branch')}</div></div>
                    <div class="xp-regedit-list">
                        <div class="xp-regedit-row head"><span>${T_('name')}</span><span>${T_('type')}</span><span>${T_('data')}</span></div>
                        <div class="xp-regedit-row focusable" data-key="" tabindex="0"><span>${T_('default')}</span><span>REG_SZ</span><span>${T_('valueNotSet')}</span></div>
                        ${keys.map(k => `<div class="xp-regedit-row focusable" data-key="${esc(k)}" tabindex="0"><span>${esc(k)}</span><span>${typeOf(reg[k])}</span><span>${esc(show(reg[k]))}</span></div>`).join('')}
                    </div>
                    <div class="xp-toolbar">${btn('reg-new', T_('newValue'))}${btn('reg-edit', T_('modify'))}${btn('reg-del', T_('delete'))}</div>
                    <div class="xp-status">${PATH}</div>
                </div>`;
            let selected = null;
            root.querySelectorAll('.xp-regedit-row[data-key]').forEach(row => {
                on(row, 'click', () => { root.querySelectorAll('.xp-regedit-row').forEach(r => r.classList.toggle('selected', r === row)); selected = row.dataset.key; });
                on(row, 'dblclick', () => { selected = row.dataset.key; edit(); });
            });
            const edit = () => {
                if (!selected || !fs) return;
                const v = reg[selected];
                const text = typeof v === 'string' ? v : JSON.stringify(v);
                window.HypernetOS.Dialog.prompt(T_('editValue', { name: selected }), text, T_('editTitle')).then(r => {
                    if (r === null) return;
                    let parsed = r;
                    if (typeof v !== 'string') { try { parsed = JSON.parse(r); } catch (e) { parsed = r; } }
                    fs.setRegistry(selected, parsed);
                    render();
                });
            };
            on(q(root, '#reg-edit'), 'click', edit);
            on(q(root, '#reg-new'), 'click', () => {
                window.HypernetOS.Dialog.prompt(T_('newValueName'), '', T_('newValue')).then(name => {
                    if (!name || !fs) return;
                    fs.setRegistry(name.trim(), '');
                    render();
                });
            });
            on(q(root, '#reg-del'), 'click', () => {
                if (!selected) return;
                window.HypernetOS.Dialog.confirm(T_('confirmDelete', { name: selected }), T_('appName'), 'warning').then(ok => {
                    if (!ok) return;
                    delete $gameSystem._hypernetRegistry[selected];
                    render();
                });
            });
        };
        render();
    });

    // --- System Configuration Utility (msconfig) ------------------------------------------
    xpApp('app-msconfig', 'msconfig', 234, [600, 440], (win, root, T_) => {
        const services = T.list(XK('msconfig.services'));
        const disabled = XP.reg('servicesDisabled', []) || [];
        const startup = XP.reg('startupApps', []) || [];
        const mode = XP.reg('startupMode', 'normal');
        const apps = Object.values(window.HypernetOS._apps).filter(a => window.HypernetOS.isInstalled(a) && !/^sys-|^app-run$/.test(a.id))
            .sort((a, b) => String(a.name).localeCompare(String(b.name)));
        const p = window.HypernetOS.Host.profile();
        root.innerHTML = `
            <div class="xp-msconfig">
                ${tabBar(T_, ['general', 'systemini', 'bootini', 'services', 'startup'])}
                ${pane('general', `
                    <div class="xp-group"><div class="xp-group-title">${T_('startupSelection')}</div>
                        <label class="xp-radio"><input type="radio" name="ms-mode" value="normal" ${mode === 'normal' ? 'checked' : ''}> ${T_('modeNormal')}</label>
                        <label class="xp-radio"><input type="radio" name="ms-mode" value="diagnostic" ${mode === 'diagnostic' ? 'checked' : ''}> ${T_('modeDiagnostic')}</label>
                        <label class="xp-radio"><input type="radio" name="ms-mode" value="selective" ${mode === 'selective' ? 'checked' : ''}> ${T_('modeSelective')}</label>
                    </div>
                    <div class="xp-row-right">${btn('ms-restore', T_('launchRestore'))}${btn('ms-expand', T_('expandFile'))}</div>`, true)}
                ${pane('systemini', `<pre class="xp-ini">${esc(T.list(XK('msconfig.systemIni')).join('\n'))}</pre>`)}
                ${pane('bootini', `<pre class="xp-ini">${esc(T.list(XK('msconfig.bootIni')).map(l => l.replace('{host}', p.hostname)).join('\n'))}</pre>
                    <div class="xp-row"><label>${T_('timeout')}</label><input class="xp-input short" id="ms-timeout" value="${esc(XP.reg('bootTimeout', 30))}"> ${T_('seconds')}</div>`)}
                ${pane('services', `<div class="xp-list">${services.map((s, i) => `<label class="xp-check-row"><input type="checkbox" data-svc="${i}" ${disabled.includes(i) ? '' : 'checked'}> <span>${esc(s)}</span><span class="xp-dim">${disabled.includes(i) ? T_('stopped') : T_('running')}</span></label>`).join('')}</div>
                    <div class="xp-row-right">${btn('ms-svc-all', T_('enableAll'))}${btn('ms-svc-none', T_('disableAll'))}</div>`)}
                ${pane('startup', `<div class="xp-list">${apps.map(a => `<label class="xp-check-row"><input type="checkbox" data-app="${a.id}" ${startup.includes(a.id) ? 'checked' : ''}> ${window.HypernetOS.getIconHTML(a.icon, 16)} <span>${esc(a.name)}</span><span class="xp-dim">${T_('startupLocation')}</span></label>`).join('')}</div>`)}
                <div class="xp-row-right">${btn('ms-ok', T('HypernetOS.xp.dialog.ok'), 'default')}${btn('ms-cancel', T('HypernetOS.xp.dialog.cancel'))}${btn('ms-apply', T_('apply'))}</div>
            </div>`;
        tabsOf(root);
        const apply = () => {
            const m = root.querySelector('input[name="ms-mode"]:checked');
            XP.setReg('startupMode', m ? m.value : 'normal');
            XP.setReg('bootTimeout', parseInt(q(root, '#ms-timeout').value, 10) || 30);
            const dis = [];
            root.querySelectorAll('input[data-svc]').forEach(c => { if (!c.checked) dis.push(parseInt(c.dataset.svc, 10)); });
            XP.setReg('servicesDisabled', dis);
            const su = [];
            root.querySelectorAll('input[data-app]').forEach(c => { if (c.checked) su.push(c.dataset.app); });
            XP.setReg('startupApps', (m && m.value === 'diagnostic') ? [] : su);
            if (window.SoundManager) SoundManager.playOk();
        };
        on(q(root, '#ms-apply'), 'click', apply);
        on(q(root, '#ms-ok'), 'click', () => {
            apply();
            window.HypernetOS.WindowManager.closeWindow(win);
            window.HypernetOS.Dialog.show({
                title: T_('appName'), message: T_('restartPrompt'), icon: 'info',
                buttons: [{ id: 'restart', label: T_('restartNow'), default: true }, { id: 'later', label: T_('restartLater'), cancel: true }]
            }).then(r => { if (r.button === 'restart') XP.shutdown('restart'); });
        });
        on(q(root, '#ms-cancel'), 'click', () => window.HypernetOS.WindowManager.closeWindow(win));
        on(q(root, '#ms-svc-all'), 'click', () => root.querySelectorAll('input[data-svc]').forEach(c => { c.checked = true; }));
        on(q(root, '#ms-svc-none'), 'click', () => root.querySelectorAll('input[data-svc]').forEach(c => { c.checked = false; }));
        on(q(root, '#ms-restore'), 'click', () => window.HypernetOS.launchApp('app-sysdm'));
        on(q(root, '#ms-expand'), 'click', () => window.HypernetOS.Dialog.alert(T_('expandBody'), T_('expandFile')));
    });

    // --- Disk Cleanup ------------------------------------------------------------------
    // i18n-ignore-start  folders the cleanup empties
    const CLEANUP_DIRS = [
        { id: 'temp', path: 'C:/Temp' },
        { id: 'inet', path: 'C:/ARCHWAYS/Temporary Hypernet Files' },
        { id: 'recycle', path: 'C:/RECYCLER' },
        { id: 'downloaded', path: 'C:/ARCHWAYS/Downloaded Program Files' },
        { id: 'logs', path: 'C:/ARCHWAYS/Logs' }
    ];
    // i18n-ignore-end
    function dirBytes(fs, path) {
        if (!fs || !fs.exists || !fs.exists(path)) return 0;
        let n = 0;
        fs.walk(path).forEach(e => { if (e.node.type === 'file') n += String(e.node.content || '').length; });
        return n;
    }
    xpApp('app-cleanmgr', 'cleanmgr', 86, [480, 420], (win, root, T_) => {
        const fs = window.HypernetFileSystem;
        const p = window.HypernetOS.Host.profile();
        root.innerHTML = `<div class="xp-cleanmgr"><div class="xp-cleanmgr-scan">${window.HypernetOS.getIconHTML(86, 32)}<div>${T_('scanning', { drive: 'C:' })}</div><div class="xp-progress"><i></i></div></div></div>`;   // i18n-ignore  drive
        const bar = q(root, '.xp-progress i');
        let pct = 0;
        const timer = setInterval(() => {
            pct = Math.min(100, pct + 6 + Math.random() * 10);
            if (bar) bar.style.width = pct + '%';
            if (pct >= 100) { clearInterval(timer); show(); }
        }, 90);
        win.addEventListener('hypernet-closed', () => clearInterval(timer));
        const kb = n => T('HypernetOS.host.kb', { n: Math.max(0, Math.round(n / 1024)) });
        const show = () => {
            const rows = CLEANUP_DIRS.map(d => ({ id: d.id, path: d.path, bytes: dirBytes(fs, d.path) }));
            const total = rows.reduce((s, r) => s + r.bytes, 0);
            root.innerHTML = `
                <div class="xp-cleanmgr">
                    ${tabBar(T_, ['cleanup', 'more'])}
                    ${pane('cleanup', `
                        <div class="xp-note">${T_('intro', { size: kb(total), drive: 'C:' })}</div>
                        <div class="xp-list" id="cm-rows">${rows.map(r => `<label class="xp-check-row"><input type="checkbox" data-id="${r.id}" ${r.bytes ? 'checked' : ''}> <span>${T_('cat.' + r.id)}</span><span class="xp-dim">${kb(r.bytes)}</span></label>`).join('')}</div>
                        <div class="xp-row"><span>${T_('totalGain')}</span><b id="cm-total">${kb(total)}</b></div>
                        <div class="xp-desc" id="cm-desc">${T_('descDefault')}</div>`, true)}
                    ${pane('more', `
                        <div class="xp-group"><div class="xp-group-title">${T_('moreComponents')}</div><div class="xp-note">${T_('moreComponentsText')}</div><div class="xp-row-right">${btn('cm-appwiz', T_('cleanUp'))}</div></div>
                        <div class="xp-group"><div class="xp-group-title">${T_('moreRestore')}</div><div class="xp-note">${T_('moreRestoreText')}</div><div class="xp-row-right">${btn('cm-restore', T_('cleanUp'))}</div></div>`)}
                    <div class="xp-row-right">${btn('cm-ok', T('HypernetOS.xp.dialog.ok'), 'default')}${btn('cm-cancel', T('HypernetOS.xp.dialog.cancel'))}</div>
                </div>`;
            tabsOf(root);
            const recount = () => {
                let t = 0;
                root.querySelectorAll('#cm-rows input').forEach(c => { if (c.checked) t += rows.find(r => r.id === c.dataset.id).bytes; });
                q(root, '#cm-total').textContent = kb(t);
            };
            root.querySelectorAll('#cm-rows input').forEach(c => {
                c.addEventListener('change', recount);
                on(c.parentNode, 'click', () => { q(root, '#cm-desc').textContent = T_('desc.' + c.dataset.id); });
            });
            on(q(root, '#cm-cancel'), 'click', () => window.HypernetOS.WindowManager.closeWindow(win));
            on(q(root, '#cm-appwiz'), 'click', () => window.HypernetOS.launchApp('app-appwiz'));
            on(q(root, '#cm-restore'), 'click', () => window.HypernetOS.Dialog.confirm(T_('restoreConfirm'), T_('appName'), 'warning').then(ok => { if (ok) XP.setReg('restorePoints', []); }));
            on(q(root, '#cm-ok'), 'click', () => {
                window.HypernetOS.Dialog.confirm(T_('confirm'), T_('appName')).then(ok => {
                    if (!ok) return;
                    root.querySelectorAll('#cm-rows input').forEach(c => {
                        if (!c.checked || !fs) return;
                        const row = rows.find(r => r.id === c.dataset.id);
                        if (row.id === 'recycle' && fs.emptyRecycler) fs.emptyRecycler();
                        else if (fs.exists(row.path)) fs.readDir(row.path).forEach(e => {
                            const child = row.path + '/' + e.name;
                            if (e.type === 'directory') fs.rmdir(child, true); else fs.deleteFile(child);
                        });
                    });
                    XP.log('application', 'info', 'cleanmgr', T_('event'));   // i18n-ignore  source
                    if (window.SoundManager) SoundManager.playOk();
                    window.HypernetOS.WindowManager.closeWindow(win);
                });
            });
        };
    });

    // --- Disk Defragmenter --------------------------------------------------------------
    xpApp('app-defrag', 'defrag', 86, [640, 460], (win, root, T_) => {
        const fs = window.HypernetFileSystem;
        const p = window.HypernetOS.Host.profile();
        const used = window.HypernetOS.Host.diskUsedMb();
        const pctUsed = Math.min(100, Math.round(used / p.disk * 100));
        root.innerHTML = `
            <div class="xp-defrag">
                <div class="xp-defrag-vol">
                    <div class="xp-regedit-row head"><span>${T_('volume')}</span><span>${T_('status')}</span><span>${T_('fileSystem')}</span><span>${T_('capacity')}</span><span>${T_('freeSpace')}</span><span>${T_('pctFree')}</span></div>
                    <div class="xp-regedit-row selected"><span>(C:)</span><span id="df-status"></span><span>NTFS</span><span>${window.HypernetOS.Host.fmtMb(p.disk)}</span><span>${window.HypernetOS.Host.fmtMb(p.disk - used)}</span><span>${100 - pctUsed} %</span></div>
                </div>
                <div class="xp-defrag-label">${T_('before')}</div>
                <canvas class="xp-defrag-map" id="df-before" width="600" height="46"></canvas>
                <div class="xp-defrag-label">${T_('after')}</div>
                <canvas class="xp-defrag-map" id="df-after" width="600" height="46"></canvas>
                <div class="xp-toolbar">${btn('df-analyze', T_('analyze'))}${btn('df-defrag', T_('defragment'))}${btn('df-pause', T_('pause'))}${btn('df-stop', T_('stop'))}${btn('df-report', T_('viewReport'))}</div>
                <div class="xp-defrag-legend"><i class="frag"></i>${T_('legendFrag')} <i class="contig"></i>${T_('legendContig')} <i class="unmov"></i>${T_('legendUnmov')} <i class="free"></i>${T_('legendFree')}</div>
                <div class="xp-status" id="df-msg"></div>
            </div>`;
        const CELLS = 150;
        const seed = xpHash(window.HypernetOS.Host.seed() + ':' + used);
        let blocks = null;
        const roll = () => {
            const out = [];
            let h = seed;
            for (let i = 0; i < CELLS; i++) {
                h = (Math.imul(h, 1103515245) + 12345) >>> 0;
                const r = (h >>> 8) % 100;
                out.push(i < CELLS * pctUsed / 100 || i < 12 ? (r < 18 ? 'frag' : r < 26 ? 'unmov' : 'contig') : (r < 6 ? 'frag' : 'free'));   // i18n-ignore  cell states
            }
            return out;
        };
        const COLORS = { frag: '#e53935', contig: '#1e4fd8', unmov: '#2e8b3a', free: '#f4f4f4' };
        const paint = (id, cells) => {
            const c = q(root, '#' + id);
            const ctx = c.getContext('2d');
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
            if (!cells) return;
            const w = c.width / CELLS;
            cells.forEach((k, i) => { ctx.fillStyle = COLORS[k]; ctx.fillRect(i * w, 4, w - 1, c.height - 8); });
        };
        paint('df-before', null); paint('df-after', null);
        let timer = null;
        const fragCount = cells => cells.filter(k => k === 'frag').length;
        on(q(root, '#df-analyze'), 'click', () => {
            blocks = roll();
            q(root, '#df-status').textContent = T_('analyzing');
            let i = 0;
            clearInterval(timer);
            timer = setInterval(() => {
                i += 6;
                paint('df-before', blocks.slice(0, i).concat(new Array(Math.max(0, CELLS - i)).fill('free')));
                if (i >= CELLS) {
                    clearInterval(timer);
                    q(root, '#df-status').textContent = T_('analyzed');
                    const frag = Math.round(fragCount(blocks) / CELLS * 100);
                    window.HypernetOS.Dialog.show({
                        title: T_('appName'), message: frag > 10 ? T_('shouldDefrag') : T_('noNeed'), icon: 'info',
                        buttons: [{ id: 'report', label: T_('viewReport') }, { id: 'defrag', label: T_('defragment'), default: true }, { id: 'close', label: T_('close'), cancel: true }]
                    }).then(r => { if (r.button === 'defrag') q(root, '#df-defrag').click(); else if (r.button === 'report') q(root, '#df-report').click(); });
                }
            }, 40);
        });
        on(q(root, '#df-defrag'), 'click', () => {
            if (!blocks) blocks = roll();
            q(root, '#df-status').textContent = T_('defragmenting');
            const target = blocks.slice().sort((a, b) => ['unmov', 'contig', 'frag', 'free'].indexOf(a) - ['unmov', 'contig', 'frag', 'free'].indexOf(b)).map(k => k === 'frag' ? 'contig' : k);
            const work = blocks.slice();
            let i = 0;
            clearInterval(timer);
            timer = setInterval(() => {
                for (let n = 0; n < 3 && i < CELLS; n++, i++) work[i] = target[i];
                paint('df-after', work);
                q(root, '#df-msg').textContent = T_('progress', { pct: Math.round(i / CELLS * 100) });
                if (i >= CELLS) {
                    clearInterval(timer);
                    blocks = target;
                    q(root, '#df-status').textContent = T_('defragmented');
                    XP.setReg('lastDefrag', window.HypernetOS.clockStamp());
                    XP.log('application', 'info', 'Defrag', T_('event'));   // i18n-ignore  source
                    window.HypernetOS.Dialog.alert(T_('complete'), T_('appName'));
                }
            }, 30);
        });
        on(q(root, '#df-pause'), 'click', () => { clearInterval(timer); q(root, '#df-status').textContent = T_('paused'); });
        on(q(root, '#df-stop'), 'click', () => { clearInterval(timer); q(root, '#df-status').textContent = ''; paint('df-after', null); });
        on(q(root, '#df-report'), 'click', () => {
            const files = fs ? fs.walk('C:').filter(e => e.node.type === 'file').length : 0;   // i18n-ignore  drive
            const b = blocks || roll();
            window.HypernetOS.Dialog.alert(T_('report', {
                size: window.HypernetOS.Host.fmtMb(p.disk), used: window.HypernetOS.Host.fmtMb(used), files: files,
                frag: Math.round(fragCount(b) / CELLS * 100), last: XP.reg('lastDefrag', T_('never'))
            }), T_('reportTitle'));
        });
        win.addEventListener('hypernet-closed', () => clearInterval(timer));
    });

    // --- Date and Time Properties ---------------------------------------------------------
    xpApp('app-timedate', 'timedate', 84, [420, 400], (win, root, T_) => {
        const zones = T.list(XK('timedate.zones'));
        const zone = XP.reg('timeZone', 1);
        root.innerHTML = `
            <div class="xp-timedate">
                ${tabBar(T_, ['datetime', 'zone', 'inet'])}
                ${pane('datetime', `
                    <div class="xp-timedate-main">
                        <div class="xp-timedate-cal">
                            <div class="xp-row"><b id="td-month"></b><b id="td-year"></b></div>
                            <div class="xp-cal-grid" id="td-grid"></div>
                        </div>
                        <div class="xp-timedate-clock"><canvas id="td-clock" width="150" height="150"></canvas><div id="td-digital" class="xp-timedate-digital"></div></div>
                    </div>
                    <div class="xp-note">${T_('currentZone', { zone: esc(zones[zone] || '') })}</div>`, true)}
                ${pane('zone', `
                    <select class="xp-select" id="td-zone">${zones.map((z, i) => `<option value="${i}" ${i === zone ? 'selected' : ''}>${esc(z)}</option>`).join('')}</select>
                    <div class="xp-timedate-map"></div>
                    <label class="xp-check-row"><input type="checkbox" id="td-dst" ${XP.reg('dst', true) ? 'checked' : ''}> ${T_('dst')}</label>`)}
                ${pane('inet', `
                    <label class="xp-check-row"><input type="checkbox" id="td-sync" ${XP.reg('inetTime', true) ? 'checked' : ''}> ${T_('syncAuto')}</label>
                    <div class="xp-row"><label>${T_('server')}</label><input class="xp-input" id="td-server" value="${esc(XP.reg('timeServer', T_('defaultServer')))}">${btn('td-update', T_('updateNow'))}</div>
                    <div class="xp-note" id="td-inet-msg">${T_('inetNote')}</div>`)}
                <div class="xp-row-right">${btn('td-ok', T('HypernetOS.xp.dialog.ok'), 'default')}${btn('td-cancel', T('HypernetOS.xp.dialog.cancel'))}${btn('td-apply', T_('apply'))}</div>
            </div>`;
        tabsOf(root);
        const now = () => {
            const TDS = window.TimeDateSystem;
            return (TDS && typeof TDS.getCurrentDateObj === 'function') ? TDS.getCurrentDateObj() : new Date();
        };
        const months = T.list('HypernetOS.monthAbbr');
        const days = T.list('HypernetOS.dayAbbr');
        const drawCal = () => {
            const d = now();
            q(root, '#td-month').textContent = months[d.getMonth()] || '';
            q(root, '#td-year').textContent = d.getFullYear();
            const first = new Date(d.getFullYear(), d.getMonth(), 1).getDay();
            const count = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
            let html = days.map(n => `<div class="xp-cal-head">${n}</div>`).join('');
            for (let i = 0; i < first; i++) html += '<div></div>';
            for (let i = 1; i <= count; i++) html += `<div class="xp-cal-day ${i === d.getDate() ? 'today' : ''}">${i}</div>`;
            q(root, '#td-grid').innerHTML = html;
        };
        const drawClock = () => {
            const c = q(root, '#td-clock');
            if (!c) return;
            const ctx = c.getContext('2d');
            const d = now();
            const r = 70, cx = 75, cy = 75;
            ctx.clearRect(0, 0, 150, 150);
            ctx.fillStyle = '#fff'; ctx.strokeStyle = '#444'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            for (let i = 0; i < 12; i++) {
                const a = i / 12 * Math.PI * 2;
                ctx.beginPath(); ctx.moveTo(cx + Math.sin(a) * (r - 8), cy - Math.cos(a) * (r - 8)); ctx.lineTo(cx + Math.sin(a) * r, cy - Math.cos(a) * r); ctx.stroke();
            }
            const hand = (angle, len, w) => { ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(angle) * len, cy - Math.cos(angle) * len); ctx.stroke(); };
            ctx.strokeStyle = '#000';
            hand((d.getHours() % 12 + d.getMinutes() / 60) / 12 * Math.PI * 2, r * 0.5, 4);
            hand(d.getMinutes() / 60 * Math.PI * 2, r * 0.75, 3);
            ctx.strokeStyle = '#c00';
            hand(d.getSeconds() / 60 * Math.PI * 2, r * 0.85, 1);
            const two = n => String(n).padStart(2, '0');
            q(root, '#td-digital').textContent = `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
        };
        drawCal(); drawClock();
        const timer = setInterval(drawClock, 1000);
        win.addEventListener('hypernet-closed', () => clearInterval(timer));
        const apply = () => {
            XP.setReg('timeZone', parseInt(q(root, '#td-zone').value, 10) || 0);
            XP.setReg('dst', q(root, '#td-dst').checked);
            XP.setReg('inetTime', q(root, '#td-sync').checked);
            XP.setReg('timeServer', q(root, '#td-server').value);
            q(root, '.xp-note').textContent = T_('currentZone', { zone: zones[parseInt(q(root, '#td-zone').value, 10)] || '' });
        };
        on(q(root, '#td-apply'), 'click', apply);
        on(q(root, '#td-ok'), 'click', () => { apply(); window.HypernetOS.WindowManager.closeWindow(win); });
        on(q(root, '#td-cancel'), 'click', () => window.HypernetOS.WindowManager.closeWindow(win));
        on(q(root, '#td-update'), 'click', () => {
            const msg = q(root, '#td-inet-msg');
            msg.textContent = T_('syncing', { server: q(root, '#td-server').value });
            const p = window.HypernetOS.Host.profile();
            setTimeout(() => {
                msg.textContent = p.linkKbps ? T_('syncOk', { server: q(root, '#td-server').value, time: window.HypernetOS.clockStamp() }) : T_('syncFail', { server: q(root, '#td-server').value });
            }, 1800);
        });
    });

    // --- Regional and Language Options ------------------------------------------------------
    xpApp('app-intl', 'intl', 84, [460, 420], (win, root, T_) => {
        const lang = (T.language && T.language()) || 'en';   // i18n-ignore  fallback code
        const locales = T.list(XK('intl.locales'));
        const codes = ['en', 'it', 'fr', 'ko', 'ru'];   // i18n-ignore  locale codes
        const chosen = XP.reg('regionalFormat', lang);
        const d = new Date(2001, 8, 11, 14, 30, 0);
        const fmt = code => {
            const tag = { en: 'en-GB', it: 'it-IT', fr: 'fr-FR', ko: 'ko-KR', ru: 'ru-RU' }[code] || 'en-GB';   // i18n-ignore  BCP 47 tags
            let money = '';
            try { money = new Intl.NumberFormat(tag, { style: 'currency', currency: 'EUR' }).format(123456.78); } catch (e) { money = '123456.78'; }   // i18n-ignore  currency code
            return {
                number: (123456789.5).toLocaleString(tag),
                currency: money,
                time: d.toLocaleTimeString(tag),
                shortDate: d.toLocaleDateString(tag),
                longDate: d.toLocaleDateString(tag, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
            };
        };
        const render = () => {
            const code = q(root, '#intl-format') ? q(root, '#intl-format').value : chosen;
            const s = fmt(code);
            const samples = q(root, '#intl-samples');
            if (samples) samples.innerHTML = `
                <div class="xp-regedit-row"><span>${T_('number')}</span><span>${esc(s.number)}</span></div>
                <div class="xp-regedit-row"><span>${T_('currency')}</span><span>${esc(s.currency)}</span></div>
                <div class="xp-regedit-row"><span>${T_('time')}</span><span>${esc(s.time)}</span></div>
                <div class="xp-regedit-row"><span>${T_('shortDate')}</span><span>${esc(s.shortDate)}</span></div>
                <div class="xp-regedit-row"><span>${T_('longDate')}</span><span>${esc(s.longDate)}</span></div>`;
        };
        root.innerHTML = `
            <div class="xp-intl">
                ${tabBar(T_, ['regional', 'languages', 'advanced'])}
                ${pane('regional', `
                    <div class="xp-group"><div class="xp-group-title">${T_('standards')}</div>
                        <div class="xp-note">${T_('standardsText')}</div>
                        <select class="xp-select" id="intl-format">${codes.map((c, i) => `<option value="${c}" ${c === chosen ? 'selected' : ''}>${esc(locales[i] || c)}</option>`).join('')}</select>
                        <div class="xp-list" id="intl-samples"></div>
                    </div>
                    <div class="xp-group"><div class="xp-group-title">${T_('location')}</div>
                        <div class="xp-note">${T_('locationText')}</div>
                        <select class="xp-select" id="intl-location">${T.list(XK('intl.locations')).map((l, i) => `<option value="${i}" ${i === XP.reg('location', 0) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
                    </div>`, true)}
                ${pane('languages', `
                    <div class="xp-group"><div class="xp-group-title">${T_('inputLangs')}</div>
                        <div class="xp-note">${T_('inputLangsText')}</div>
                        <div class="xp-list">${T.list(XK('intl.inputLangsList')).map((l, i) => `<div class="xp-regedit-row"><span>${esc(l)}</span><span>${i === 0 ? T_('defaultInput') : ''}</span></div>`).join('')}</div>
                        <div class="xp-row-right">${btn('intl-details', T_('details'))}</div>
                    </div>
                    <div class="xp-group"><div class="xp-group-title">${T_('supplemental')}</div>
                        <label class="xp-check-row"><input type="checkbox" ${XP.reg('complexScripts', false) ? 'checked' : ''} id="intl-complex"> ${T_('complexScripts')}</label>
                        <label class="xp-check-row"><input type="checkbox" ${XP.reg('eastAsian', false) ? 'checked' : ''} id="intl-eastasian"> ${T_('eastAsian')}</label>
                    </div>`)}
                ${pane('advanced', `
                    <div class="xp-group"><div class="xp-group-title">${T_('nonUnicode')}</div>
                        <div class="xp-note">${T_('nonUnicodeText')}</div>
                        <select class="xp-select" id="intl-ansi">${codes.map((c, i) => `<option value="${c}" ${c === XP.reg('nonUnicodeLang', chosen) ? 'selected' : ''}>${esc(locales[i] || c)}</option>`).join('')}</select>
                    </div>
                    <div class="xp-group"><div class="xp-group-title">${T_('codePages')}</div>
                        <div class="xp-list">${T.list(XK('intl.codePagesList')).map(c => `<label class="xp-check-row"><input type="checkbox" checked disabled> ${esc(c)}</label>`).join('')}</div>
                    </div>`)}
                <div class="xp-row-right">${btn('intl-ok', T('HypernetOS.xp.dialog.ok'), 'default')}${btn('intl-cancel', T('HypernetOS.xp.dialog.cancel'))}${btn('intl-apply', T_('apply'))}</div>
            </div>`;
        tabsOf(root);
        render();
        on(q(root, '#intl-format'), 'change', render);
        const apply = () => {
            XP.setReg('regionalFormat', q(root, '#intl-format').value);
            XP.setReg('location', parseInt(q(root, '#intl-location').value, 10) || 0);
            XP.setReg('nonUnicodeLang', q(root, '#intl-ansi').value);
            XP.setReg('complexScripts', q(root, '#intl-complex').checked);
            XP.setReg('eastAsian', q(root, '#intl-eastasian').checked);
        };
        on(q(root, '#intl-apply'), 'click', apply);
        on(q(root, '#intl-ok'), 'click', () => { apply(); window.HypernetOS.WindowManager.closeWindow(win); });
        on(q(root, '#intl-cancel'), 'click', () => window.HypernetOS.WindowManager.closeWindow(win));
        on(q(root, '#intl-details'), 'click', () => window.HypernetOS.Dialog.alert(T_('detailsBody'), T_('inputLangs')));
    });

    // --- Sounds and Audio Devices -------------------------------------------------------------
    // i18n-ignore-start  program event ids and the SoundManager call each plays
    const SOUND_EVENTS = [
        ['startArchways', 'playLoad'], ['exitArchways', 'playCancel'], ['criticalStop', 'playBuzzer'],
        ['defaultBeep', 'playCursor'], ['exclamation', 'playBuzzer'], ['asterisk', 'playCursor'],
        ['question', 'playCursor'], ['newMail', 'playOk'], ['emptyRecycle', 'playUseItem'],
        ['menuCommand', 'playOk'], ['menuPopup', 'playCursor'], ['minimize', 'playCancel'],
        ['restoreUp', 'playOk'], ['deviceConnect', 'playEquip'], ['deviceDisconnect', 'playCancel'],
        ['lowBattery', 'playBuzzer'], ['systemNotification', 'playSave']
    ];
    // i18n-ignore-end
    // Hung off XP so window.HypernetOS.XP.playEvent can read the same table the
    // applet lists, rather than a second copy of it that would drift.
    XP.SOUND_EVENTS = SOUND_EVENTS;

    xpApp('app-mmsys', 'mmsys', 111, [460, 440], (win, root, T_) => {
        const p = window.HypernetOS.Host.profile();
        const CM = window.ConfigManager;
        const master = CM ? Math.round((CM.bgmVolume + CM.seVolume) / 2) : 100;
        const muted = XP.reg('audioMuted', false);
        const schemes = T.list(XK('mmsys.schemes'));
        root.innerHTML = `
            <div class="xp-mmsys">
                ${tabBar(T_, ['volume', 'sounds', 'audio', 'voice', 'hardware'])}
                ${pane('volume', `
                    <div class="xp-row">${window.HypernetOS.getIconHTML(111, 32)}<b>${esc(p.sound)}</b></div>
                    <div class="xp-group"><div class="xp-group-title">${T_('deviceVolume')}</div>
                        <div class="xp-row"><span>${T_('low')}</span><input type="range" min="0" max="100" value="${master}" id="mm-vol" class="xp-range"><span>${T_('high')}</span></div>
                        <label class="xp-check-row"><input type="checkbox" id="mm-mute" ${muted ? 'checked' : ''}> ${T_('mute')}</label>
                        <label class="xp-check-row"><input type="checkbox" id="mm-tray" ${XP.reg('trayVolume', true) ? 'checked' : ''}> ${T_('trayIcon')}</label>
                        <div class="xp-row-right">${btn('mm-advanced', T_('advanced'))}</div>
                    </div>
                    <div class="xp-group"><div class="xp-group-title">${T_('speakerSettings')}</div>
                        <select class="xp-select" id="mm-speakers">${T.list(XK('mmsys.speakers')).map((s, i) => `<option value="${i}" ${i === XP.reg('speakerSetup', 0) ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
                    </div>`, true)}
                ${pane('sounds', `
                    <div class="xp-row"><label>${T_('scheme')}</label><select class="xp-select" id="mm-scheme">${schemes.map((s, i) => `<option value="${i}" ${i === XP.reg('soundScheme', 0) ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div>
                    <div class="xp-note">${T_('programEvents')}</div>
                    <div class="xp-list" id="mm-events">${SOUND_EVENTS.map(([id]) => `<div class="xp-regedit-row focusable" data-ev="${id}" tabindex="0"><span>${T_('event.' + id)}</span></div>`).join('')}</div>
                    <div class="xp-row"><label>${T_('sounds')}</label><input class="xp-input" id="mm-evname" readonly>${btn('mm-test', T_('test'))}</div>`)}
                ${pane('audio', `
                    <div class="xp-group"><div class="xp-group-title">${T_('playback')}</div><select class="xp-select"><option>${esc(p.sound)}</option></select></div>
                    <div class="xp-group"><div class="xp-group-title">${T_('recording')}</div><select class="xp-select"><option>${esc(p.sound)}</option></select></div>
                    <div class="xp-group"><div class="xp-group-title">${T_('midi')}</div><select class="xp-select"><option>${T_('midiSynth')}</option></select></div>
                    <label class="xp-check-row"><input type="checkbox" checked> ${T_('defaultOnly')}</label>`)}
                ${pane('voice', `
                    <div class="xp-group"><div class="xp-group-title">${T_('voicePlayback')}</div><select class="xp-select"><option>${esc(p.sound)}</option></select></div>
                    <div class="xp-group"><div class="xp-group-title">${T_('voiceRecording')}</div><select class="xp-select"><option>${esc(p.sound)}</option></select></div>
                    <div class="xp-row-right">${btn('mm-testhw', T_('testHardware'))}</div>`)}
                ${pane('hardware', `<div class="xp-list">${window.HypernetOS.Host.devices().filter(c => /sound|audio|suono/i.test(c.label) || c.items.includes(p.sound)).concat([{ label: T_('codecs'), items: T.list(XK('mmsys.codecsList')) }]).map(c => c.items.map(i => `<div class="xp-regedit-row"><span>${esc(i)}</span><span>${T_('working')}</span></div>`).join('')).join('')}</div>`)}
                <div class="xp-row-right">${btn('mm-ok', T('HypernetOS.xp.dialog.ok'), 'default')}${btn('mm-cancel', T('HypernetOS.xp.dialog.cancel'))}${btn('mm-apply', T_('apply'))}</div>
            </div>`;
        tabsOf(root);
        let selectedEv = null;
        root.querySelectorAll('#mm-events .xp-regedit-row').forEach(row => on(row, 'click', () => {
            root.querySelectorAll('#mm-events .xp-regedit-row').forEach(r => r.classList.toggle('selected', r === row));
            selectedEv = row.dataset.ev;
            q(root, '#mm-evname').value = T_('event.' + selectedEv) + '.wav';   // i18n-ignore  extension
        }));
        // Test plays it the way the shell plays it, mute and scheme included:
        // an event that is silent in use has to be silent when auditioned.
        on(q(root, '#mm-test'), 'click', () => XP.playEvent(selectedEv));
        const apply = () => {
            const v = parseInt(q(root, '#mm-vol').value, 10);
            const mute = q(root, '#mm-mute').checked;
            if (CM) {
                if (mute && !XP.reg('audioMuted', false)) XP.setReg('audioUnmuted', { bgm: CM.bgmVolume, se: CM.seVolume, bgs: CM.bgsVolume, me: CM.meVolume });
                const level = mute ? 0 : v;
                CM.bgmVolume = level; CM.seVolume = level; CM.bgsVolume = level; CM.meVolume = level;
                if (typeof CM.save === 'function') CM.save();
            }
            XP.setReg('audioMuted', mute);
            XP.setReg('trayVolume', q(root, '#mm-tray').checked);
            XP.setReg('speakerSetup', parseInt(q(root, '#mm-speakers').value, 10) || 0);
            XP.setReg('soundScheme', parseInt(q(root, '#mm-scheme').value, 10) || 0);
            const tray = document.getElementById('tray-volume');
            if (tray && !q(root, '#mm-tray').checked) tray.parentNode.removeChild(tray);
            else if (!tray && q(root, '#mm-tray').checked) XP.buildTray();
        };
        on(q(root, '#mm-apply'), 'click', apply);
        on(q(root, '#mm-ok'), 'click', () => { apply(); window.HypernetOS.WindowManager.closeWindow(win); });
        on(q(root, '#mm-cancel'), 'click', () => window.HypernetOS.WindowManager.closeWindow(win));
        on(q(root, '#mm-advanced'), 'click', () => window.HypernetOS.Dialog.alert(T_('advancedBody'), T_('appName')));
        on(q(root, '#mm-testhw'), 'click', () => window.HypernetOS.Dialog.alert(T_('testHardwareBody'), T_('testHardware')));
    });

    // --- System Properties ----------------------------------------------------------------------
    xpApp('app-sysdm', 'sysdm', 234, [520, 480], (win, root, T_) => {
        const H = window.HypernetOS.Host;
        const p = H.profile();
        const fx = XP.visualEffects();
        const paging = H.pagingMb();
        const restoreOn = XP.reg('systemRestore', true);
        const updates = XP.reg('autoUpdates', 'notify');
        root.innerHTML = `
            <div class="xp-sysdm">
                ${tabBar(T_, ['general', 'name', 'hardware', 'advanced', 'restore', 'updates', 'remote'])}
                ${pane('general', `
                    <div class="xp-sysdm-general">
                        <div class="xp-sysdm-logo">${window.HypernetOS.getIconHTML(234, 64)}</div>
                        <div>
                            <div class="xp-group-title">${T_('system')}</div>
                            <div class="xp-indent">${T_('osName')}</div><div class="xp-indent">${T_('osVersion')}</div><div class="xp-indent">${T_('servicePack')}</div>
                            <div class="xp-group-title">${T_('registeredTo')}</div>
                            <div class="xp-indent">${esc(XP.userName())}</div><div class="xp-indent">${esc(p.vendor)}</div><div class="xp-indent">${esc(p.serial)}</div>
                            <div class="xp-group-title">${T_('computer')}</div>
                            <div class="xp-indent">${esc(p.vendor)} ${esc(p.model)}</div>
                            <div class="xp-indent">${esc(p.cpu)}</div>
                            <div class="xp-indent">${H.fmtMhz(p.mhz)}, ${T_('ramOf', { mb: p.ram })}</div>
                        </div>
                    </div>`, true)}
                ${pane('name', `
                    <div class="xp-note">${T_('nameIntro')}</div>
                    <div class="xp-row"><label>${T_('description')}</label><input class="xp-input" id="sd-desc" value="${esc(XP.reg('computerDescription', ''))}"></div>
                    <div class="xp-row"><label>${T_('fullName')}</label><b id="sd-name">${esc(H.hostname())}</b></div>
                    <div class="xp-row"><label>${T_('workgroup')}</label><b>${esc(XP.reg('workgroup', T_('defaultWorkgroup')))}</b></div>
                    <div class="xp-row-right">${btn('sd-netid', T_('networkId'))}${btn('sd-rename', T_('change'))}</div>`)}
                ${pane('hardware', `
                    <div class="xp-group"><div class="xp-group-title">${T_('devmgmt')}</div><div class="xp-note">${T_('devmgmtText')}</div><div class="xp-row-right">${btn('sd-devmgmt', T_('devmgmt'))}</div></div>
                    <div class="xp-group"><div class="xp-group-title">${T_('drivers')}</div><div class="xp-note">${T_('driversText')}</div><div class="xp-row-right">${btn('sd-signing', T_('driverSigning'))}${btn('sd-wupdate', T_('windowsUpdate'))}</div></div>
                    <div class="xp-group"><div class="xp-group-title">${T_('profiles')}</div><div class="xp-note">${T_('profilesText')}</div><div class="xp-row-right">${btn('sd-profiles', T_('profiles'))}</div></div>`)}
                ${pane('advanced', `
                    <div class="xp-group"><div class="xp-group-title">${T_('performance')}</div>
                        <label class="xp-check-row"><input type="checkbox" data-fx="animate" ${fx.animate ? 'checked' : ''}> ${T_('fxAnimate')}</label>
                        <label class="xp-check-row"><input type="checkbox" data-fx="shadows" ${fx.shadows ? 'checked' : ''}> ${T_('fxShadows')}</label>
                        <label class="xp-check-row"><input type="checkbox" data-fx="fade" ${fx.fade ? 'checked' : ''}> ${T_('fxFade')}</label>
                        <label class="xp-check-row"><input type="checkbox" data-fx="dragContents" ${fx.dragContents ? 'checked' : ''}> ${T_('fxDrag')}</label>
                        <label class="xp-check-row"><input type="checkbox" data-fx="smoothFonts" ${fx.smoothFonts ? 'checked' : ''}> ${T_('fxSmooth')}</label>
                    </div>
                    <div class="xp-group"><div class="xp-group-title">${T_('virtualMemory')}</div>
                        <div class="xp-note">${T_('pagingFile', { initial: paging.initial, max: paging.max, drive: 'C:' })}</div>
                    </div>
                    <div class="xp-group"><div class="xp-group-title">${T_('startupRecovery')}</div>
                        <div class="xp-note">${T_('defaultOs')}</div>
                        <label class="xp-check-row"><input type="checkbox" id="sd-autoreboot" ${XP.reg('autoReboot', true) ? 'checked' : ''}> ${T_('autoReboot')}</label>
                        <div class="xp-row-right">${btn('sd-env', T_('envVars'))}${btn('sd-errrep', T_('errorReporting'))}</div>
                    </div>`)}
                ${pane('restore', `
                    <label class="xp-check-row"><input type="checkbox" id="sd-restore-off" ${restoreOn ? '' : 'checked'}> ${T_('restoreOff')}</label>
                    <div class="xp-group"><div class="xp-group-title">${T_('restoreDrives')}</div>
                        <div class="xp-regedit-row"><span>(C:)</span><span>${restoreOn ? T_('monitoring') : T_('turnedOff')}</span></div>
                        <div class="xp-row"><span>${T_('diskUsage')}</span><input type="range" min="1" max="12" value="${XP.reg('restoreUsage', 12)}" id="sd-restore-usage" class="xp-range"><span id="sd-restore-pct">${XP.reg('restoreUsage', 12)}%</span></div>
                        <div class="xp-note" id="sd-restore-points">${T_('restorePoints', { n: (XP.reg('restorePoints', []) || []).length })}</div>
                        <div class="xp-row-right">${btn('sd-restore-create', T_('createPoint'))}</div>
                    </div>`)}
                ${pane('updates', `
                    <div class="xp-note">${T_('updatesIntro')}</div>
                    <label class="xp-radio"><input type="radio" name="sd-upd" value="auto" ${updates === 'auto' ? 'checked' : ''}> ${T_('updAuto')}</label>
                    <label class="xp-radio"><input type="radio" name="sd-upd" value="download" ${updates === 'download' ? 'checked' : ''}> ${T_('updDownload')}</label>
                    <label class="xp-radio"><input type="radio" name="sd-upd" value="notify" ${updates === 'notify' ? 'checked' : ''}> ${T_('updNotify')}</label>
                    <label class="xp-radio"><input type="radio" name="sd-upd" value="off" ${updates === 'off' ? 'checked' : ''}> ${T_('updOff')}</label>`)}
                ${pane('remote', `
                    <label class="xp-check-row"><input type="checkbox" id="sd-remote-assist" ${XP.reg('remoteAssistance', false) ? 'checked' : ''}> ${T_('remoteAssist')}</label>
                    <label class="xp-check-row"><input type="checkbox" id="sd-remote-desktop" ${XP.reg('remoteDesktop', false) ? 'checked' : ''}> ${T_('remoteDesktop')}</label>
                    <div class="xp-note">${T_('remoteNote', { host: esc(H.hostname()) })}</div>`)}
                <div class="xp-row-right">${btn('sd-ok', T('HypernetOS.xp.dialog.ok'), 'default')}${btn('sd-cancel', T('HypernetOS.xp.dialog.cancel'))}${btn('sd-apply', T_('apply'))}</div>
            </div>`;
        tabsOf(root);
        const usage = q(root, '#sd-restore-usage');
        usage.addEventListener('input', () => { q(root, '#sd-restore-pct').textContent = usage.value + '%'; });
        const apply = () => {
            const fxOut = {};
            root.querySelectorAll('input[data-fx]').forEach(c => { fxOut[c.dataset.fx] = c.checked; });
            XP.setReg('visualEffects', fxOut);
            XP.applyVisualEffects();
            XP.setReg('computerDescription', q(root, '#sd-desc').value);
            XP.setReg('autoReboot', q(root, '#sd-autoreboot').checked);
            XP.setReg('systemRestore', !q(root, '#sd-restore-off').checked);
            XP.setReg('restoreUsage', parseInt(usage.value, 10) || 12);
            const upd = root.querySelector('input[name="sd-upd"]:checked');
            XP.setReg('autoUpdates', upd ? upd.value : 'notify');
            XP.setReg('remoteAssistance', q(root, '#sd-remote-assist').checked);
            XP.setReg('remoteDesktop', q(root, '#sd-remote-desktop').checked);
            const sec = XP.security();
            sec.updates = upd ? upd.value === 'auto' : sec.updates;
            XP.setReg('security', sec);
        };
        on(q(root, '#sd-apply'), 'click', apply);
        on(q(root, '#sd-ok'), 'click', () => { apply(); window.HypernetOS.WindowManager.closeWindow(win); });
        on(q(root, '#sd-cancel'), 'click', () => window.HypernetOS.WindowManager.closeWindow(win));
        on(q(root, '#sd-devmgmt'), 'click', () => window.HypernetOS.launchApp('app-devmgmt'));
        on(q(root, '#sd-rename'), 'click', () => {
            window.HypernetOS.Dialog.prompt(T_('renameBody'), H.hostname(), T_('renameTitle')).then(name => {
                if (name === null) return;
                const clean = name.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 15);
                if (!clean) { window.HypernetOS.Dialog.error(T_('renameBad')); return; }
                XP.setReg('computerName', clean);
                q(root, '#sd-name').textContent = clean;
                window.HypernetOS.Dialog.alert(T_('renameRestart'), T_('renameTitle'));
            });
        });
        on(q(root, '#sd-netid'), 'click', () => window.HypernetOS.Dialog.alert(T_('networkIdBody'), T_('networkId')));
        on(q(root, '#sd-signing'), 'click', () => window.HypernetOS.Dialog.alert(T_('signingBody'), T_('driverSigning')));
        on(q(root, '#sd-wupdate'), 'click', () => window.HypernetOS.Dialog.alert(T_('wupdateBody'), T_('windowsUpdate')));
        on(q(root, '#sd-profiles'), 'click', () => window.HypernetOS.Dialog.alert(T_('profilesBody', { name: esc(H.hostname()) }), T_('profiles')));
        on(q(root, '#sd-env'), 'click', () => {
            const env = window.HypernetOS.Shell.newSession().env;
            window.HypernetOS.Dialog.alert(Object.keys(env).map(k => k + '=' + env[k]).join('\n'), T_('envVars'));
        });
        on(q(root, '#sd-errrep'), 'click', () => {
            window.HypernetOS.Dialog.show({
                title: T_('errorReporting'), message: T_('errrepBody'), icon: 'info',
                checkbox: { label: T_('errrepDisable'), checked: XP.reg('errorReportingOff', false) },
                buttons: [{ id: 'ok', label: T('HypernetOS.xp.dialog.ok'), default: true }, { id: 'cancel', label: T('HypernetOS.xp.dialog.cancel'), cancel: true }]
            }).then(r => { if (r.button === 'ok') XP.setReg('errorReportingOff', !!r.checked); });
        });
        on(q(root, '#sd-restore-create'), 'click', () => {
            window.HypernetOS.Dialog.prompt(T_('pointDescription'), '', T_('createPoint')).then(desc => {
                if (desc === null) return;
                const pts = XP.reg('restorePoints', []) || [];
                pts.push({ at: window.HypernetOS.clockStamp(), desc: desc });
                XP.setReg('restorePoints', pts);
                q(root, '#sd-restore-points').textContent = T_('restorePoints', { n: pts.length });
                window.HypernetOS.Dialog.alert(T_('pointCreated'), T_('createPoint'));
            });
        });
    });

    // --- Device Manager ----------------------------------------------------------------------
    xpApp('app-devmgmt', 'devmgmt', 234, [520, 460], (win, root, T_) => {
        const H = window.HypernetOS.Host;
        const cats = H.devices();
        const disabledDevs = XP.reg('disabledDevices', []) || [];
        root.innerHTML = `
            <div class="xp-devmgmt">
                <div class="xp-toolbar">${btn('dm-props', T_('properties'))}${btn('dm-disable', T_('disable'))}${btn('dm-scan', T_('scan'))}${btn('dm-update', T_('updateDriver'))}</div>
                <div class="xp-tree" id="dm-tree">
                    <div class="xp-tree-node open">${esc(H.hostname())}</div>
                    ${cats.map((c, ci) => `<div class="xp-tree-cat focusable" data-cat="${ci}" tabindex="0">+ ${esc(c.label)}</div>
                        <div class="xp-tree-children" data-children="${ci}">${c.items.map((it, ii) => `<div class="xp-tree-leaf focusable ${disabledDevs.includes(it) ? 'disabled' : ''}" data-dev="${esc(it)}" tabindex="0">${esc(it)}</div>`).join('')}</div>`).join('')}
                </div>
                <div class="xp-status" id="dm-status">${T_('count', { n: cats.reduce((s, c) => s + c.items.length, 0) })}</div>
            </div>`;
        let selected = null;
        root.querySelectorAll('.xp-tree-cat').forEach(cat => on(cat, 'click', () => {
            const kids = root.querySelector(`.xp-tree-children[data-children="${cat.dataset.cat}"]`);
            kids.classList.toggle('open');
            cat.textContent = (kids.classList.contains('open') ? '- ' : '+ ') + cat.textContent.slice(2);
        }));
        const props = () => {
            if (!selected) return;
            const off = (XP.reg('disabledDevices', []) || []).includes(selected);
            window.HypernetOS.Dialog.alert(T_('propsBody', { name: selected, status: off ? T_('statusDisabled') : T_('statusOk'), vendor: H.profile().vendor }), selected);
        };
        root.querySelectorAll('.xp-tree-leaf').forEach(leaf => {
            on(leaf, 'click', () => { root.querySelectorAll('.xp-tree-leaf').forEach(l => l.classList.toggle('selected', l === leaf)); selected = leaf.dataset.dev; });
            on(leaf, 'dblclick', () => { selected = leaf.dataset.dev; props(); });
        });
        on(q(root, '#dm-props'), 'click', props);
        on(q(root, '#dm-disable'), 'click', () => {
            if (!selected) return;
            const list = XP.reg('disabledDevices', []) || [];
            const off = list.includes(selected);
            const next = off ? list.filter(d => d !== selected) : list.concat([selected]);
            const go = () => {
                XP.setReg('disabledDevices', next);
                root.querySelectorAll('.xp-tree-leaf').forEach(l => { if (l.dataset.dev === selected) l.classList.toggle('disabled', !off); });
                XP.log('system', off ? 'info' : 'warning', 'PlugPlay', T_(off ? 'eventEnabled' : 'eventDisabled', { name: selected }));   // i18n-ignore  source
            };
            if (off) go(); else window.HypernetOS.Dialog.confirm(T_('disableConfirm', { name: selected }), T_('appName'), 'warning').then(ok => { if (ok) go(); });
        });
        on(q(root, '#dm-scan'), 'click', () => {
            q(root, '#dm-status').textContent = T_('scanning');
            setTimeout(() => { q(root, '#dm-status').textContent = T_('scanDone'); }, 1500);
        });
        on(q(root, '#dm-update'), 'click', () => {
            if (!selected) return;
            window.HypernetOS.Dialog.alert(T_('updateBody', { name: selected }), T_('updateDriver'));
        });
    });

    // --- Add or Remove Programs ---------------------------------------------------------------
    xpApp('app-appwiz', 'appwiz', 191, [620, 460], (win, root, T_) => {
        const usage = () => XP.reg('appUsage', {}) || {};
        const sizeOf = app => 1 + (xpHash(app.id) % 40);
        const freq = n => n >= 10 ? T_('freqOften') : n >= 3 ? T_('freqSometimes') : T_('freqRarely');
        const listable = () => Object.values(window.HypernetOS._apps).filter(a => !/^sys-|^my-|^control-panel$|^app-run$|^app-recycle$/.test(a.id))
            .sort((a, b) => String(a.name).localeCompare(String(b.name)));
        const components = T.list(XK('appwiz.componentsList'));
        const compOff = XP.reg('componentsOff', []) || [];
        const render = (tab) => {
            const u = usage();
            const installed = listable().filter(a => window.HypernetOS.isInstalled(a));
            const removed = listable().filter(a => !window.HypernetOS.isInstalled(a));
            root.innerHTML = `
                <div class="xp-appwiz">
                    <div class="xp-appwiz-side">
                        <div class="xp-appwiz-btn focusable ${tab === 'change' ? 'active' : ''}" data-tab="change" tabindex="0">${T_('changeRemove')}</div>
                        <div class="xp-appwiz-btn focusable ${tab === 'add' ? 'active' : ''}" data-tab="add" tabindex="0">${T_('addNew')}</div>
                        <div class="xp-appwiz-btn focusable ${tab === 'components' ? 'active' : ''}" data-tab="components" tabindex="0">${T_('components')}</div>
                        <div class="xp-appwiz-btn focusable ${tab === 'defaults' ? 'active' : ''}" data-tab="defaults" tabindex="0">${T_('defaults')}</div>
                    </div>
                    <div class="xp-appwiz-main">
                        ${tab === 'change' ? `<div class="xp-note">${T_('installedIntro')}</div><div class="xp-appwiz-list">${installed.map(a => `
                            <div class="xp-appwiz-row focusable" data-app="${a.id}" tabindex="0">
                                <div class="xp-appwiz-head">${window.HypernetOS.getIconHTML(a.icon, 24)}<b>${esc(a.name)}</b><span class="xp-dim">${T_('size', { mb: sizeOf(a) })}</span></div>
                                <div class="xp-appwiz-detail">
                                    <span>${T_('used')} ${freq((u[a.id] || {}).count || 0)}</span><span>${T_('lastUsed')} ${(u[a.id] || {}).last || T_('never')}</span>
                                    ${btn('aw-remove-' + a.id, T_('remove'))}
                                </div>
                            </div>`).join('')}</div>` : ''}
                        ${tab === 'add' ? `<div class="xp-note">${T_('addIntro')}</div><div class="xp-appwiz-list">${removed.length ? removed.map(a => `
                            <div class="xp-appwiz-row"><div class="xp-appwiz-head">${window.HypernetOS.getIconHTML(a.icon, 24)}<b>${esc(a.name)}</b>${btn('aw-add-' + a.id, T_('install'))}</div></div>`).join('') : `<div class="xp-empty">${T_('nothingToAdd')}</div>`}</div>
                            <div class="xp-row-right">${btn('aw-cd', T_('cdOrFloppy'))}</div>` : ''}
                        ${tab === 'components' ? `<div class="xp-note">${T_('componentsIntro')}</div><div class="xp-list">${components.map((c, i) => `<label class="xp-check-row"><input type="checkbox" data-comp="${i}" ${compOff.includes(i) ? '' : 'checked'}> ${esc(c)}<span class="xp-dim">${T_('size', { mb: 1 + (xpHash(c) % 12) })}</span></label>`).join('')}</div>
                            <div class="xp-row-right">${btn('aw-comp-ok', T_('next'))}</div>` : ''}
                        ${tab === 'defaults' ? `<div class="xp-note">${T_('defaultsIntro')}</div>
                            <label class="xp-radio"><input type="radio" name="aw-def" checked> ${T_('defaultsArchways')}</label>
                            <label class="xp-radio"><input type="radio" name="aw-def"> ${T_('defaultsNonArchways')}</label>
                            <label class="xp-radio"><input type="radio" name="aw-def"> ${T_('defaultsCustom')}</label>` : ''}
                    </div>
                </div>`;
            root.querySelectorAll('.xp-appwiz-btn').forEach(b => on(b, 'click', () => render(b.dataset.tab)));
            installed.forEach(a => on(q(root, '#aw-remove-' + a.id), 'click', () => {
                window.HypernetOS.Dialog.confirm(T_('removeConfirm', { name: a.name }), T_('appName'), 'warning').then(ok => {
                    if (!ok) return;
                    window.HypernetOS.setInstalled(a.id, false);
                    const start = XP.reg('startupApps', []) || [];
                    XP.setReg('startupApps', start.filter(id => id !== a.id));
                    XP.log('application', 'info', 'MsiInstaller', T_('eventRemoved', { name: a.name }));   // i18n-ignore  source
                    if (window.SoundManager) SoundManager.playUseItem();
                    render('change');
                });
            }));
            removed.forEach(a => on(q(root, '#aw-add-' + a.id), 'click', () => {
                window.HypernetOS.setInstalled(a.id, true);
                XP.log('application', 'info', 'MsiInstaller', T_('eventInstalled', { name: a.name }));   // i18n-ignore  source
                if (window.SoundManager) SoundManager.playOk();
                render('add');
            }));
            on(q(root, '#aw-cd'), 'click', () => window.HypernetOS.Dialog.alert(T_('cdBody'), T_('cdOrFloppy'), 'warning'));
            on(q(root, '#aw-comp-ok'), 'click', () => {
                const off = [];
                root.querySelectorAll('input[data-comp]').forEach(c => { if (!c.checked) off.push(parseInt(c.dataset.comp, 10)); });
                XP.setReg('componentsOff', off);
                window.HypernetOS.Dialog.alert(T_('componentsDone'), T_('components'));
            });
        };
        render('change');
    });

    // --- Recycle Bin ---------------------------------------------------------------------------
    xpApp('app-recycle', 'recycle', 190, [520, 380], (win, root, T_) => {
        const fs = window.HypernetFileSystem;
        const render = () => {
            const items = fs && fs.recycled ? fs.recycled() : [];
            root.innerHTML = `
                <div class="xp-recycle">
                    <div class="xp-toolbar">${btn('rb-restore', T_('restore'))}${btn('rb-delete', T_('delete'))}${btn('rb-empty', T_('empty'))}${btn('rb-props', T_('properties'))}</div>
                    <div class="xp-regedit-list">
                        <div class="xp-regedit-row head"><span>${T_('name')}</span><span>${T_('origin')}</span><span>${T_('deleted')}</span></div>
                        ${items.length ? items.map(it => `<div class="xp-regedit-row focusable" data-name="${esc(it.name)}" tabindex="0"><span>${esc(it.name)}</span><span>${esc(it.origin)}</span><span>${esc(it.deletedAt)}</span></div>`).join('') : `<div class="xp-empty">${T_('emptyList')}</div>`}
                    </div>
                    <div class="xp-status">${T_('count', { n: items.length })}</div>
                </div>`;
            let selected = null;
            root.querySelectorAll('.xp-regedit-row[data-name]').forEach(row => on(row, 'click', () => {
                root.querySelectorAll('.xp-regedit-row').forEach(r => r.classList.toggle('selected', r === row));
                selected = row.dataset.name;
            }));
            on(q(root, '#rb-restore'), 'click', () => { if (selected && fs.restoreRecycled(selected)) { if (window.SoundManager) SoundManager.playOk(); render(); } });
            on(q(root, '#rb-delete'), 'click', () => {
                if (!selected) return;
                window.HypernetOS.Dialog.confirm(T_('deleteConfirm', { name: selected }), T_('appName'), 'warning').then(ok => {
                    if (ok && fs.deleteFile('C:/RECYCLER/' + selected)) render();   // i18n-ignore  folder
                });
            });
            on(q(root, '#rb-empty'), 'click', () => {
                if (!items.length) return;
                window.HypernetOS.Dialog.confirm(T_('emptyConfirm', { n: items.length }), T_('appName'), 'warning').then(ok => {
                    if (!ok) return;
                    fs.emptyRecycler();
                    XP.playEvent('emptyRecycle');   // i18n-ignore  event id
                    XP.log('application', 'info', 'Explorer', T_('eventEmptied'));   // i18n-ignore  source
                    render();
                });
            });
            on(q(root, '#rb-props'), 'click', () => {
                const p = window.HypernetOS.Host.profile();
                window.HypernetOS.Dialog.show({
                    title: T_('propsTitle'), message: T_('propsBody', { size: Math.round(p.disk / 10) }), icon: 'info',
                    checkbox: { label: T_('propsConfirm'), checked: XP.reg('recycleConfirm', true) },
                    buttons: [{ id: 'ok', label: T('HypernetOS.xp.dialog.ok'), default: true }, { id: 'cancel', label: T('HypernetOS.xp.dialog.cancel'), cancel: true }]
                }).then(r => { if (r.button === 'ok') XP.setReg('recycleConfirm', !!r.checked); });
            });
        };
        render();
        win.addEventListener('hypernet-recycler-changed', render);
    }, { desktopShortcut: true });

    // --- All Programs -------------------------------------------------------------------------
    // The drawer the desktop is filled from. It lists every installed program
    // that has no shortcut on the desktop, filed under its category; dragging
    // one onto the desktop pins it, and dragging a desktop icon back in here
    // (or onto the Recycle Bin) puts it back on this list. The icon itself
    // cannot be taken off the desktop.
    xpApp('app-all-programs', 'allprograms', 230, [560, 420], (win, root, T_) => {
        const OS = window.HypernetOS;
        const render = () => {
            const groups = OS.offDesktopByCategory();
            root.innerHTML = `
                <div class="xp-allprograms-hint">${esc(T_('hint'))}</div>
                <div class="xp-allprograms-list">${groups.length ? '' : `<div class="xp-allprograms-empty">${esc(T_('empty'))}</div>`}</div>`;
            const list = q(root, '.xp-allprograms-list');
            groups.forEach(group => {
                const head = document.createElement('div');
                head.className = 'xp-allprograms-category';
                head.textContent = group.label;
                list.appendChild(head);
                group.apps.forEach(app => {
                    const item = document.createElement('div');
                    item.className = 'xp-allprograms-item focusable';
                    item.tabIndex = 0;
                    item.dataset.appId = app.id;
                    item.innerHTML = `<div class="xp-allprograms-icon">${OS.getIconHTML(app.icon, 32)}</div>`
                        + `<div class="xp-allprograms-name">${esc(app.name)}</div>`;
                    item.addEventListener('click', e => { e.stopPropagation(); if (!item._hnDragged) OS.launchApp(app.id); });
                    item.addEventListener('contextmenu', e => {
                        e.preventDefault(); e.stopPropagation();
                        OS.ContextMenu.show(e.clientX, e.clientY, [
                            { label: T_('open'), bold: true, action: () => OS.launchApp(app.id) },
                            { label: T_('addToDesktop'), action: () => OS.setOnDesktop(app.id, true) }
                        ]);
                    });
                    OS.attachPinDrag(item, app, false);
                    list.appendChild(item);
                });
            });
        };
        root._hnRender = render;
        render();
    }, { desktopShortcut: true, category: 'system' });   // i18n-ignore  category id

    // --- Search Companion ----------------------------------------------------------------------
    xpApp('app-search', 'search', 190, [600, 440], (win, root, T_) => {
        const fs = window.HypernetFileSystem;
        root.innerHTML = `
            <div class="xp-search">
                <div class="xp-search-side">
                    <div class="xp-search-dog">${window.HypernetOS.getIconHTML(190, 40)}</div>
                    <div class="xp-note">${T_('intro')}</div>
                    <div class="xp-row"><label>${T_('name')}</label><input class="xp-input" id="se-name"></div>
                    <div class="xp-row"><label>${T_('contains')}</label><input class="xp-input" id="se-text"></div>
                    <div class="xp-row"><label>${T_('lookIn')}</label><select class="xp-select" id="se-where"><option value="C:">${T_('wholeDrive')}</option><option value="C:/Documents">${T('HypernetOS.myDocuments')}</option><option value="C:/Desktop">${T('MyComputer.desktop')}</option></select></div>
                    <label class="xp-check-row"><input type="checkbox" id="se-hidden"> ${T_('hidden')}</label>
                    <div class="xp-row-right">${btn('se-go', T_('search'), 'default')}${btn('se-stop', T_('stop'))}</div>
                </div>
                <div class="xp-search-main">
                    <div class="xp-regedit-list" id="se-results"><div class="xp-empty">${T_('startHint')}</div></div>
                    <div class="xp-status" id="se-status"></div>
                </div>
            </div>`;
        let timer = null;
        const run = () => {
            if (!fs) return;
            const name = q(root, '#se-name').value.trim().toLowerCase();
            const text = q(root, '#se-text').value.trim().toLowerCase();
            const where = q(root, '#se-where').value;
            const hidden = q(root, '#se-hidden').checked;
            const results = q(root, '#se-results');
            const status = q(root, '#se-status');
            results.innerHTML = '';
            status.textContent = T_('searching');
            const all = fs.walk(where);
            let i = 0, hits = 0;
            clearInterval(timer);
            timer = setInterval(() => {
                for (let n = 0; n < 12 && i < all.length; n++, i++) {
                    const e = all[i];
                    if (e.node.type !== 'file') continue;
                    if (!hidden && /^ARCHWAYS$|^RECYCLER$/i.test(e.path.split('/')[1] || '')) continue;
                    const nameOk = !name || e.node.name.toLowerCase().includes(name);
                    const textOk = !text || String(e.node.content || '').toLowerCase().includes(text);
                    if (!nameOk || !textOk) continue;
                    hits++;
                    const row = document.createElement('div');
                    row.className = 'xp-regedit-row focusable';
                    row.tabIndex = 0;
                    row.innerHTML = `<span>${esc(e.node.name)}</span><span>${esc(e.path.slice(0, e.path.lastIndexOf('/')).replace(/\//g, '\\'))}</span><span>${String(e.node.content || '').length}</span>`;
                    on(row, 'dblclick', () => window.HypernetOS.openFile(e.path));
                    results.appendChild(row);
                }
                if (i >= all.length) { clearInterval(timer); status.textContent = T_('found', { n: hits }); }
            }, 30);
        };
        on(q(root, '#se-go'), 'click', run);
        on(q(root, '#se-stop'), 'click', () => { clearInterval(timer); q(root, '#se-status').textContent = T_('stopped'); });
        root.querySelectorAll('input.xp-input').forEach(inp => inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.stopPropagation(); run(); } }));
        win.addEventListener('hypernet-closed', () => clearInterval(timer));
    }, { category: 'accessories' });

    // --- Scheduled Tasks ----------------------------------------------------------------------
    xpApp('app-schedtasks', 'schedtasks', 84, [560, 380], (win, root, T_) => {
        const render = () => {
            const tasks = XP.reg('scheduledTasks', []) || [];
            root.innerHTML = `
                <div class="xp-schedtasks">
                    <div class="xp-toolbar">${btn('st-add', T_('add'))}${btn('st-run', T_('runNow'))}${btn('st-toggle', T_('toggle'))}${btn('st-del', T_('delete'))}</div>
                    <div class="xp-regedit-list">
                        <div class="xp-regedit-row head"><span>${T_('name')}</span><span>${T_('schedule')}</span><span>${T_('lastRun')}</span><span>${T_('status')}</span></div>
                        ${tasks.length ? tasks.map((t, i) => `<div class="xp-regedit-row focusable" data-i="${i}" tabindex="0"><span>${esc((window.HypernetOS._apps[t.app] || {}).name || t.app)}</span><span>${T_('daily', { time: t.time })}</span><span>${esc(t.lastRun || T_('never'))}</span><span>${t.enabled === false ? T_('disabled') : T_('ready')}</span></div>`).join('') : `<div class="xp-empty">${T_('empty')}</div>`}
                    </div>
                    <div class="xp-status">${T_('count', { n: tasks.length })}</div>
                </div>`;
            let sel = -1;
            root.querySelectorAll('.xp-regedit-row[data-i]').forEach(row => on(row, 'click', () => {
                root.querySelectorAll('.xp-regedit-row').forEach(r => r.classList.toggle('selected', r === row));
                sel = parseInt(row.dataset.i, 10);
            }));
            on(q(root, '#st-add'), 'click', () => {
                const apps = Object.values(window.HypernetOS._apps).filter(a => window.HypernetOS.isInstalled(a) && a.id !== 'app-run').sort((a, b) => String(a.name).localeCompare(String(b.name)));
                window.HypernetOS.Dialog.show({
                    title: T_('addTitle'), message: T_('addProgram'), icon: 'question',
                    select: { options: apps.map(a => ({ value: a.id, label: a.name })), value: apps[0] ? apps[0].id : '' },
                    input: { value: '09:00', placeholder: T_('timeHint') },   // i18n-ignore  default time
                    buttons: [{ id: 'ok', label: T('HypernetOS.xp.dialog.ok'), default: true }, { id: 'cancel', label: T('HypernetOS.xp.dialog.cancel'), cancel: true }]
                }).then(r => {
                    if (r.button !== 'ok') return;
                    const time = String(r.value || '').trim();
                    if (!/^\d{2}:\d{2}$/.test(time)) { window.HypernetOS.Dialog.error(T_('badTime')); return; }
                    const chosen = r.select || (apps[0] ? apps[0].id : '');
                    tasks.push({ app: chosen, time: time, enabled: true, lastRun: '' });
                    XP.setReg('scheduledTasks', tasks);
                    render();
                });
            });
            on(q(root, '#st-run'), 'click', () => { if (sel >= 0 && tasks[sel]) window.HypernetOS.launchApp(tasks[sel].app); });
            on(q(root, '#st-toggle'), 'click', () => { if (sel >= 0 && tasks[sel]) { tasks[sel].enabled = tasks[sel].enabled === false; XP.setReg('scheduledTasks', tasks); render(); } });
            on(q(root, '#st-del'), 'click', () => { if (sel >= 0) { tasks.splice(sel, 1); XP.setReg('scheduledTasks', tasks); render(); } });
        };
        render();
    });

    // --- Security Center ------------------------------------------------------------------------
    xpApp('app-wscui', 'wscui', 233, [560, 420], (win, root, T_) => {
        const render = () => {
            const sec = XP.security();
            const row = (id, on) => `
                <div class="xp-wsc-row ${on ? 'on' : 'off'}">
                    <div class="xp-wsc-head"><b>${T_('item.' + id)}</b><span class="xp-wsc-state">${on ? T_('on') : T_('off')}</span></div>
                    <div class="xp-note">${T_(on ? 'text.' + id + 'On' : 'text.' + id + 'Off')}</div>
                    <div class="xp-row-right">${btn('wsc-' + id, on ? T_('turnOff') : T_('turnOn'))}</div>
                </div>`;
            root.innerHTML = `
                <div class="xp-wscui">
                    <div class="xp-wsc-banner">${window.HypernetOS.getIconHTML(233, 32)}<div><b>${T_('appName')}</b><div>${T_('intro')}</div></div></div>
                    <div class="xp-wsc-list">${row('firewall', sec.firewall)}${row('updates', sec.updates)}${row('antivirus', sec.antivirus)}</div>
                    <div class="xp-row-right">${btn('wsc-alerts', T_('alertSettings'))}</div>
                </div>`;
            ['firewall', 'updates', 'antivirus'].forEach(id => on(q(root, '#wsc-' + id), 'click', () => {
                const s = XP.security();
                if (id === 'antivirus' && !s.antivirus) {
                    window.HypernetOS.Dialog.alert(T_('noAntivirus'), T_('appName'), 'warning').then(() => { s.antivirus = true; XP.setReg('security', s); render(); });
                    return;
                }
                s[id] = !s[id];
                XP.setReg('security', s);
                if (id === 'updates') XP.setReg('autoUpdates', s.updates ? 'auto' : 'notify');
                XP.log('security', 'info', 'SecurityCenter', T_('event', { item: T_('item.' + id), state: s[id] ? T_('on') : T_('off') }));   // i18n-ignore  source
                render();
            }));
            on(q(root, '#wsc-alerts'), 'click', () => {
                window.HypernetOS.Dialog.show({
                    title: T_('alertSettings'), message: T_('alertBody'), icon: 'info',
                    checkbox: { label: T_('alertBalloons'), checked: !XP.reg('securityAlertsOff', false) },
                    buttons: [{ id: 'ok', label: T('HypernetOS.xp.dialog.ok'), default: true }, { id: 'cancel', label: T('HypernetOS.xp.dialog.cancel'), cancel: true }]
                }).then(r => { if (r.button === 'ok') XP.setReg('securityAlertsOff', !r.checked); });
            });
        };
        render();
    });

    // --- Display Properties -----------------------------------------------------------------------
    xpApp('app-desk', 'desk', 234, [480, 500], (win, root, T_) => {
        const fs = window.HypernetFileSystem;
        const wp = fs ? fs.getRegistry('wallpaper', 'bliss') : 'bliss';
        const pos = XP.reg('wallpaperPosition', 'stretch');
        const saver = XP.reg('screenSaver', 'none');
        const scheme = XP.reg('colorScheme', 'blue');
        // i18n-ignore-start  wallpaper ids
        const WALLS = ['bliss', 'teal', 'space', 'gold'];
        // i18n-ignore-end
        root.innerHTML = `
            <div class="xp-desk">
                ${tabBar(T_, ['themes', 'desktop', 'saver', 'appearance', 'settings'])}
                ${pane('themes', `
                    <div class="xp-note">${T_('themesIntro')}</div>
                    <select class="xp-select" id="dk-theme">${['blue', 'olive', 'silver', 'classic'].map(s => `<option value="${s}" ${s === scheme ? 'selected' : ''}>${T_('scheme.' + s)}</option>`).join('')}</select>
                    <div class="xp-desk-preview xp-scheme-${scheme}" id="dk-preview"><div class="xp-desk-preview-title">${T_('previewTitle')}</div><div class="xp-desk-preview-body">${T_('previewBody')}</div></div>`, true)}
                ${pane('desktop', `
                    <div class="xp-desk-walls">${WALLS.map(w => `<div class="wp-card focusable xp-desk-wall ${w === wp ? 'selected' : ''}" data-wp="${w}" tabindex="0"><div class="xp-desk-swatch wp-${w}"></div><span>${T('ControlPanel.wp' + w.charAt(0).toUpperCase() + w.slice(1))}</span></div>`).join('')}</div>
                    <div class="xp-row"><label>${T_('position')}</label><select class="xp-select" id="dk-pos">${['stretch', 'tile', 'center'].map(p => `<option value="${p}" ${p === pos ? 'selected' : ''}>${T_('pos.' + p)}</option>`).join('')}</select></div>
                    <div class="xp-row-right">${btn('dk-customize', T_('customizeDesktop'))}</div>`)}
                ${pane('saver', `
                    <div class="xp-row"><label>${T_('screenSaver')}</label><select class="xp-select" id="dk-saver">${XP.Saver.KINDS.map(k => `<option value="${k}" ${k === saver ? 'selected' : ''}>${T_('saverKind.' + k)}</option>`).join('')}</select>${btn('dk-preview-saver', T_('preview'))}</div>
                    <div class="xp-row"><label>${T_('wait')}</label><input class="xp-input short" id="dk-wait" value="${esc(XP.reg('screenSaverWait', 10))}"> ${T_('minutes')}</div>
                    <div class="xp-row"><label>${T_('marqueeText')}</label><input class="xp-input" id="dk-marquee" value="${esc(XP.reg('marqueeText', T('HypernetOS.xp.saver.marqueeDefault')))}"></div>
                    <label class="xp-check-row"><input type="checkbox" id="dk-resume-lock" ${XP.reg('saverLock', false) ? 'checked' : ''}> ${T_('resumeLock')}</label>
                    <div class="xp-group"><div class="xp-group-title">${T_('power')}</div><div class="xp-note">${T_('powerText')}</div><div class="xp-row-right">${btn('dk-power', T_('powerBtn'))}</div></div>`)}
                ${pane('appearance', `
                    <div class="xp-row"><label>${T_('windowsAndButtons')}</label><select class="xp-select" id="dk-style"><option>${T_('styleXp')}</option><option>${T_('styleClassic')}</option></select></div>
                    <div class="xp-row"><label>${T_('fontSize')}</label><select class="xp-select" id="dk-font">${['normal', 'large', 'extra'].map(f => `<option value="${f}" ${f === XP.reg('fontSize', 'normal') ? 'selected' : ''}>${T_('font.' + f)}</option>`).join('')}</select></div>
                    <div class="xp-row-right">${btn('dk-effects', T_('effects'))}${btn('dk-advanced', T_('advanced'))}</div>`)}
                ${pane('settings', `
                    <div class="xp-note">${T_('display', { name: esc(window.HypernetOS.Host.profile().gpu) })}</div>
                    <div class="xp-row"><label>${T_('resolution')}</label><b>${T_('resolutionValue', { w: Graphics.width, h: Graphics.height })}</b></div>
                    <div class="xp-row"><label>${T_('colorQuality')}</label><select class="xp-select"><option>${T_('color32')}</option><option>${T_('color16')}</option><option>${T_('color256')}</option></select></div>
                    <div class="xp-row-right">${btn('dk-troubleshoot', T_('troubleshoot'))}</div>`)}
                <div class="xp-row-right">${btn('dk-ok', T('HypernetOS.xp.dialog.ok'), 'default')}${btn('dk-cancel', T('HypernetOS.xp.dialog.cancel'))}${btn('dk-apply', T_('apply'))}</div>
            </div>`;
        tabsOf(root);
        let chosenWp = wp;
        root.querySelectorAll('.xp-desk-wall').forEach(card => on(card, 'click', () => {
            root.querySelectorAll('.xp-desk-wall').forEach(c => c.classList.toggle('selected', c === card));
            chosenWp = card.dataset.wp;
        }));
        on(q(root, '#dk-theme'), 'change', () => { q(root, '#dk-preview').className = 'xp-desk-preview xp-scheme-' + q(root, '#dk-theme').value; });
        const apply = () => {
            if (fs) fs.setRegistry('wallpaper', chosenWp);
            XP.setReg('wallpaperPosition', q(root, '#dk-pos').value);
            XP.applyWallpaperPosition();
            XP.setReg('screenSaver', q(root, '#dk-saver').value);
            XP.setReg('screenSaverWait', Math.max(1, parseInt(q(root, '#dk-wait').value, 10) || 10));
            XP.setReg('marqueeText', q(root, '#dk-marquee').value);
            XP.setReg('saverLock', q(root, '#dk-resume-lock').checked);
            XP.setReg('colorScheme', q(root, '#dk-theme').value);
            XP.applyColorScheme();
            XP.setReg('fontSize', q(root, '#dk-font').value);
            const host = document.getElementById('hypernet-os-container');
            if (host) ['normal', 'large', 'extra'].forEach(f => host.classList.toggle('xp-font-' + f, f === q(root, '#dk-font').value));
            if (window.SoundManager) SoundManager.playOk();
        };
        on(q(root, '#dk-apply'), 'click', apply);
        on(q(root, '#dk-ok'), 'click', () => { apply(); window.HypernetOS.WindowManager.closeWindow(win); });
        on(q(root, '#dk-cancel'), 'click', () => window.HypernetOS.WindowManager.closeWindow(win));
        on(q(root, '#dk-preview-saver'), 'click', () => {
            XP.setReg('marqueeText', q(root, '#dk-marquee').value);
            XP.Saver.start(q(root, '#dk-saver').value, true);
        });
        on(q(root, '#dk-customize'), 'click', () => window.HypernetOS.Dialog.alert(T_('customizeBody'), T_('customizeDesktop')));
        on(q(root, '#dk-power'), 'click', () => {
            const p = window.HypernetOS.Host.profile();
            window.HypernetOS.Dialog.alert(p.origin === 'hyperdeck' ? T_('powerDeck', { hours: p.endurance }) : T_('powerDesktop'), T_('powerBtn'));
        });
        on(q(root, '#dk-effects'), 'click', () => window.HypernetOS.launchApp('app-sysdm'));
        on(q(root, '#dk-advanced'), 'click', () => window.HypernetOS.Dialog.alert(T_('advancedBody'), T_('advanced')));
        on(q(root, '#dk-troubleshoot'), 'click', () => window.HypernetOS.launchApp('app-help'));
    });

    // --- Help and Support Center --------------------------------------------------------------------
    xpApp('app-help', 'help', 190, [640, 460], (win, root, T_) => {
        const topics = T.obj(XK('help.topics'));
        const keys = Object.keys(topics);
        const tips = T.list(XK('help.tips'));
        const tip = tips[xpHash(window.HypernetOS.clockStamp().slice(0, 10)) % Math.max(1, tips.length)] || '';
        root.innerHTML = `
            <div class="xp-help">
                <div class="xp-help-head"><b>${T_('appName')}</b><input class="xp-input" id="hp-search" placeholder="${esc(T_('searchHint'))}"></div>
                <div class="xp-help-body">
                    <div class="xp-help-side" id="hp-topics">${keys.map(k => `<div class="xp-help-topic focusable" data-k="${esc(k)}" tabindex="0">${esc(topics[k].title)}</div>`).join('')}</div>
                    <div class="xp-help-main" id="hp-main">
                        <h3>${T_('welcome')}</h3>
                        <div class="xp-help-tip"><b>${T_('tipOfDay')}</b><div>${esc(tip)}</div></div>
                        <div class="xp-note">${T_('pickTopic')}</div>
                    </div>
                </div>
            </div>`;
        const show = k => {
            const t = topics[k];
            if (!t) return;
            q(root, '#hp-main').innerHTML = `<h3>${esc(t.title)}</h3>${(t.body || []).map(par => `<p>${esc(par)}</p>`).join('')}`;
            root.querySelectorAll('.xp-help-topic').forEach(el => el.classList.toggle('selected', el.dataset.k === k));
        };
        root.querySelectorAll('.xp-help-topic').forEach(el => on(el, 'click', () => show(el.dataset.k)));
        q(root, '#hp-search').addEventListener('input', () => {
            const needle = q(root, '#hp-search').value.trim().toLowerCase();
            root.querySelectorAll('.xp-help-topic').forEach(el => {
                const t = topics[el.dataset.k];
                const hay = (t.title + ' ' + (t.body || []).join(' ')).toLowerCase();
                el.style.display = !needle || hay.includes(needle) ? '' : 'none';
            });
        });
    }, { category: 'accessories' });

    // --- On-Screen Keyboard --------------------------------------------------------------------------
    xpApp('app-osk', 'osk', 84, [640, 250], (win, root, T_) => {
        // i18n-ignore-start  key rows
        const ROWS = [
            ['esc', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'bksp'],
            ['tab', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']', '\\'],
            ['caps', 'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'", 'ent'],
            ['shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/', 'shift'],
            ['ctrl', 'win', 'alt', 'space', 'alt', 'win', 'ctrl']
        ];
        // i18n-ignore-end
        let shift = false, caps = false;
        let target = null;
        const focusIn = e => {
            const el = e.target;
            if (el && ['INPUT', 'TEXTAREA'].includes(el.tagName) && !win.contains(el)) target = el;
        };
        document.addEventListener('focusin', focusIn);
        win.addEventListener('hypernet-closed', () => document.removeEventListener('focusin', focusIn));
        const render = () => {
            root.innerHTML = `<div class="xp-osk">${ROWS.map(r => `<div class="xp-osk-row">${r.map(k => {
                const wide = ['bksp', 'tab', 'caps', 'ent', 'shift', 'space', 'ctrl', 'alt', 'win', 'esc'].includes(k);
                const label = k.length === 1 ? ((shift || caps) ? k.toUpperCase() : k) : T_('key.' + k);
                return `<button class="xp-osk-key focusable ${wide ? 'wide' : ''} ${k === 'space' ? 'space' : ''} ${(k === 'shift' && shift) || (k === 'caps' && caps) ? 'lit' : ''}" data-k="${esc(k)}" tabindex="0">${esc(label)}</button>`;
            }).join('')}</div>`).join('')}<div class="xp-status">${target ? T_('typingInto', { name: target.id || target.tagName.toLowerCase() }) : T_('noTarget')}</div></div>`;
            root.querySelectorAll('.xp-osk-key').forEach(b => b.addEventListener('mousedown', e => {
                e.preventDefault(); e.stopPropagation();
                const k = b.dataset.k;
                if (k === 'shift') { shift = !shift; render(); return; }
                if (k === 'caps') { caps = !caps; render(); return; }
                if (!target || !target.isConnected) return;
                const insert = txt => {
                    const s = target.selectionStart == null ? target.value.length : target.selectionStart;
                    const e2 = target.selectionEnd == null ? s : target.selectionEnd;
                    target.value = target.value.slice(0, s) + txt + target.value.slice(e2);
                    target.selectionStart = target.selectionEnd = s + txt.length;
                    target.dispatchEvent(new Event('input', { bubbles: true }));
                };
                if (k === 'bksp') {
                    const s = target.selectionStart == null ? target.value.length : target.selectionStart;
                    if (s > 0) { target.value = target.value.slice(0, s - 1) + target.value.slice(s); target.selectionStart = target.selectionEnd = s - 1; }
                } else if (k === 'space') insert(' ');
                else if (k === 'tab') insert('\t');
                else if (k === 'ent') { if (target.tagName === 'TEXTAREA') insert('\n'); else target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }
                else if (k.length === 1) { insert((shift || caps) ? k.toUpperCase() : k); if (shift) { shift = false; render(); } }
            }));
        };
        render();
    }, { category: 'accessories' });

    // --- Event Viewer ---------------------------------------------------------------------------------
    xpApp('app-eventvwr', 'eventvwr', 191, [640, 440], (win, root, T_) => {
        let log = 'application';   // i18n-ignore  log id
        const render = () => {
            const rows = window.HypernetOS.EventLog.read(log);
            root.innerHTML = `
                <div class="xp-eventvwr">
                    <div class="xp-eventvwr-side">${window.HypernetOS.EventLog.LOGS.map(l => `<div class="xp-tree-leaf focusable ${l === log ? 'selected' : ''}" data-log="${l}" tabindex="0">${T_('log.' + l)}</div>`).join('')}</div>
                    <div class="xp-eventvwr-main">
                        <div class="xp-regedit-list">
                            <div class="xp-regedit-row head"><span>${T_('type')}</span><span>${T_('date')}</span><span>${T_('source')}</span><span>${T_('description')}</span></div>
                            ${rows.length ? rows.map((r, i) => `<div class="xp-regedit-row focusable lvl-${esc(r.level)}" data-i="${i}" tabindex="0"><span>${T_('level.' + r.level)}</span><span>${esc(r.game)}</span><span>${esc(r.source)}</span><span>${esc(r.text)}</span></div>`).join('') : `<div class="xp-empty">${T_('empty')}</div>`}
                        </div>
                        <div class="xp-toolbar">${btn('ev-clear', T_('clear'))}${btn('ev-save', T_('saveAs'))}</div>
                        <div class="xp-status">${T_('count', { n: rows.length })}</div>
                    </div>
                </div>`;
            root.querySelectorAll('[data-log]').forEach(el => on(el, 'click', () => { log = el.dataset.log; render(); }));
            root.querySelectorAll('.xp-regedit-row[data-i]').forEach(row => on(row, 'dblclick', () => {
                const r = rows[parseInt(row.dataset.i, 10)];
                window.HypernetOS.Dialog.alert(T_('detail', { level: T_('level.' + r.level), date: r.game, source: r.source, text: r.text }), T_('eventProps'));
            }));
            on(q(root, '#ev-clear'), 'click', () => window.HypernetOS.Dialog.confirm(T_('clearConfirm'), T_('appName'), 'warning').then(ok => { if (ok) { window.HypernetOS.EventLog.clear(log); render(); } }));
            on(q(root, '#ev-save'), 'click', () => {
                const fs = window.HypernetFileSystem;
                if (!fs) return;
                const path = 'C:/Documents/' + log + '.evt.txt';   // i18n-ignore  file name
                fs.writeFile(path, rows.map(r => [r.game, r.level, r.source, r.text].join('\t')).join('\n'));
                window.HypernetOS.Dialog.alert(T_('saved', { path: path.replace(/\//g, '\\') }), T_('appName'));
            });
        };
        render();
    });

    // --- Connection Status --------------------------------------------------------------------------
    xpApp('app-netstat', 'netstat', 188, [380, 330], (win, root, T_) => {
        const p = window.HypernetOS.Host.profile();
        const dialup = p.linkKbps && p.linkKbps < 1000;
        let sent = 1200 + (xpHash(p.hostname) % 5000), recv = 3400 + (xpHash(p.serial) % 9000);
        const speed = !p.linkKbps ? T_('noLink') : dialup ? T_('kbps', { n: p.linkKbps }) : T_('mbps', { n: p.linkKbps / 1000 });
        root.innerHTML = `
            <div class="xp-netstat">
                ${tabBar(T_, ['general', 'support'])}
                ${pane('general', `
                    <div class="xp-group"><div class="xp-group-title">${T_('connection')}</div>
                        <div class="xp-regedit-row"><span>${T_('status')}</span><span>${p.linkKbps ? T_('connected') : T_('disconnected')}</span></div>
                        <div class="xp-regedit-row"><span>${T_('duration')}</span><span id="ns-dur"></span></div>
                        <div class="xp-regedit-row"><span>${T_('speed')}</span><span>${speed}</span></div>
                    </div>
                    <div class="xp-group"><div class="xp-group-title">${T_('activity')}</div>
                        <div class="xp-netstat-activity"><span>${T_('sent')}</span><span class="xp-netstat-pc">${window.HypernetOS.getIconHTML(86, 24)}</span><span class="xp-netstat-wire"></span><span class="xp-netstat-pc">${window.HypernetOS.getIconHTML(188, 24)}</span><span>${T_('received')}</span></div>
                        <div class="xp-regedit-row"><span>${T_('packets')}</span><span id="ns-sent">${sent}</span><span id="ns-recv">${recv}</span></div>
                    </div>
                    <div class="xp-row-right">${btn('ns-props', T_('properties'))}${btn('ns-disable', dialup ? T_('disconnect') : T_('disable'))}</div>`, true)}
                ${pane('support', `
                    <div class="xp-regedit-row"><span>${T_('addressType')}</span><span>${dialup ? T_('assignedByServer') : T_('assignedByDhcp')}</span></div>
                    <div class="xp-regedit-row"><span>${T_('ipAddress')}</span><span>${dialup ? '62.94.' : '192.168.1.'}${(xpHash(p.hostname) % 200) + 10}</span></div>
                    <div class="xp-regedit-row"><span>${T_('subnet')}</span><span>${dialup ? '255.255.255.255' : '255.255.255.0'}</span></div>
                    <div class="xp-regedit-row"><span>${T_('gateway')}</span><span>${dialup ? '62.94.0.1' : '192.168.1.1'}</span></div>
                    <div class="xp-row-right">${btn('ns-repair', T_('repair'))}</div>`)}
            </div>`;
        tabsOf(root);
        const start = Date.now();
        const timer = setInterval(() => {
            const s = Math.floor((Date.now() - start) / 1000) + window.HypernetOS.Kernel.uptime();
            const two = n => String(n).padStart(2, '0');
            const dur = q(root, '#ns-dur');
            if (dur) dur.textContent = `${two(Math.floor(s / 3600))}:${two(Math.floor(s % 3600 / 60))}:${two(s % 60)}`;
            if (p.linkKbps) { sent += Math.floor(Math.random() * 3); recv += Math.floor(Math.random() * 7); }
            if (q(root, '#ns-sent')) { q(root, '#ns-sent').textContent = sent; q(root, '#ns-recv').textContent = recv; }
        }, 1000);
        win.addEventListener('hypernet-closed', () => clearInterval(timer));
        on(q(root, '#ns-props'), 'click', () => window.HypernetOS.Dialog.alert(T_('propsBody', { name: p.modem || T_('noLink') }), T_('properties')));
        on(q(root, '#ns-disable'), 'click', () => window.HypernetOS.Dialog.confirm(T_('disableConfirm'), T_('appName'), 'warning').then(ok => { if (ok) window.HypernetOS.WindowManager.closeWindow(win); }));
        on(q(root, '#ns-repair'), 'click', () => window.HypernetOS.Dialog.alert(T_('repairBody'), T_('repair')));
    });

    // The Control Panel's classic view lists every applet by these ids.
    // i18n-ignore-start  app ids
    // =========================================================================
    // The rest of the Control Panel
    // -------------------------------------------------------------------------
    // The panel had the settings pages above and a hole where the everyday ones
    // stood: Folder Options, Mouse, Keyboard, User Accounts, Printers and
    // Faxes, Network Connections, Accessibility, Fonts and Game Controllers.
    //
    // A settings page nobody's setting reaches is furniture, so every switch
    // here writes a registry key something reads: Folder Options is read by the
    // folder window, User Accounts by the welcome screen's roll of accounts,
    // Network Connections by the host profile's uplink, Game Controllers by
    // whether a pad is actually in hand.
    // =========================================================================

    // A row of switches, each named by its registry key, its label and what it
    // falls back to. Shared by the four pages that are nothing else.
    const switchRows = (list, K) => list.map(([key, label, def]) =>
        `<label class="xp-check-row"><input type="checkbox" data-reg="${key}" ${XP.reg(key, def) ? 'checked' : ''}> ${esc(K(label))}</label>`).join('');

    const wireSwitches = (root, after) => {
        root.querySelectorAll('input[data-reg]').forEach(box => on(box, 'change', () => {
            XP.setReg(box.dataset.reg, box.checked);
            if (after) after();
        }));
    };

    const wireRanges = (root) => {
        root.querySelectorAll('input[data-range]').forEach(sl => on(sl, 'change', () =>
            XP.setReg(sl.dataset.range, parseInt(sl.value, 10))));
    };

    // --- Folder Options ------------------------------------------------------
    // The only page here whose switches change a window that is already open,
    // so it redraws every folder on the desktop when one is flipped.
    xpApp('app-folderopt', 'folderopt', 191, [400, 380], (win, root, T_) => {
        const K = k => T_(k);
        root.innerHTML = `
            ${tabBar(T_, ['general', 'viewTab'])}
            ${pane('general', `
                <div class="xp-group"><div class="xp-group-title">${esc(K('tasks'))}</div>
                    ${switchRows([['folderTasks', 'showTasks', true]], K)}
                </div>
                <div class="xp-group"><div class="xp-group-title">${esc(K('clickItems'))}</div>
                    <label class="xp-radio"><input type="radio" name="fo-click" value="double" ${XP.reg('folderSingleClick', false) ? '' : 'checked'}> ${esc(K('doubleClick'))}</label>
                    <label class="xp-radio"><input type="radio" name="fo-click" value="single" ${XP.reg('folderSingleClick', false) ? 'checked' : ''}> ${esc(K('singleClick'))}</label>
                </div>`, true)}
            ${pane('viewTab', `
                <div class="xp-group"><div class="xp-group-title">${esc(K('advanced'))}</div>
                    ${switchRows([
                        ['folderShowHidden', 'showHidden', false],
                        ['folderHideExtensions', 'hideExtensions', false],
                        ['folderFullPath', 'fullPath', true]
                    ], K)}
                </div>
                <div class="xp-row-right">${btn('fo-restore', esc(K('restore')))}</div>`)}`;
        tabsOf(root);
        // Every folder on the desktop is redrawn, so a switch is answered by
        // the window the player was looking at rather than by the next one.
        const redrawFolders = () => {
            if (window.HypernetMyComputer && window.HypernetMyComputer.redrawAll) {
                window.HypernetMyComputer.redrawAll();
            }
        };
        wireSwitches(root, redrawFolders);
        root.querySelectorAll('input[name="fo-click"]').forEach(radio => on(radio, 'change', () => {
            XP.setReg('folderSingleClick', radio.value === 'single');   // i18n-ignore  radio value
            redrawFolders();
        }));
        on(q(root, '#fo-restore'), 'click', () => {
            ['folderTasks', 'folderFullPath'].forEach(k => XP.setReg(k, true));
            ['folderShowHidden', 'folderHideExtensions', 'folderSingleClick'].forEach(k => XP.setReg(k, false));
            redrawFolders();
            window.HypernetOS.launchApp('app-folderopt');
        });
    });

    // --- Mouse ---------------------------------------------------------------
    xpApp('app-mouse', 'mouse', 234, [400, 360], (win, root, T_) => {
        const K = k => T_(k);
        const range = (key, def, min, max) =>
            `<input type="range" class="xp-range" data-range="${key}" min="${min}" max="${max}" value="${XP.reg(key, def)}">`;
        root.innerHTML = `
            ${tabBar(T_, ['buttons', 'pointers'])}
            ${pane('buttons', `
                <div class="xp-group"><div class="xp-group-title">${esc(K('buttonConfig'))}</div>
                    ${switchRows([['mouseSwapButtons', 'swap', false]], K)}
                </div>
                <div class="xp-group"><div class="xp-group-title">${esc(K('doubleSpeed'))}</div>
                    <div class="xp-row"><span>${esc(K('slow'))}</span>${range('mouseDoubleSpeed', 5, 1, 10)}<span>${esc(K('fast'))}</span></div>
                </div>`, true)}
            ${pane('pointers', `
                <div class="xp-group"><div class="xp-group-title">${esc(K('motion'))}</div>
                    <div class="xp-row"><label>${esc(K('pointerSpeed'))}</label>${range('mousePointerSpeed', 5, 1, 10)}</div>
                    ${switchRows([['mouseTrails', 'trails', false], ['mouseSnapTo', 'snapTo', false]], K)}
                </div>`)}`;
        tabsOf(root);
        wireSwitches(root);
        wireRanges(root);
    });

    // --- Keyboard ------------------------------------------------------------
    xpApp('app-keyboard', 'keyboard', 234, [400, 330], (win, root, T_) => {
        const K = k => T_(k);
        const range = (key, def, min, max) =>
            `<input type="range" class="xp-range" data-range="${key}" min="${min}" max="${max}" value="${XP.reg(key, def)}">`;
        root.innerHTML = `
            ${tabBar(T_, ['speed'])}
            ${pane('speed', `
                <div class="xp-group"><div class="xp-group-title">${esc(K('repeat'))}</div>
                    <div class="xp-row"><label>${esc(K('repeatDelay'))}</label><span>${esc(K('long'))}</span>${range('kbRepeatDelay', 3, 1, 5)}<span>${esc(K('short'))}</span></div>
                    <div class="xp-row"><label>${esc(K('repeatRate'))}</label><span>${esc(K('slow'))}</span>${range('kbRepeatRate', 20, 1, 31)}<span>${esc(K('fast'))}</span></div>
                    <div class="xp-row"><input class="xp-input" id="kb-test" placeholder="${esc(K('test'))}"></div>
                </div>
                <div class="xp-group"><div class="xp-group-title">${esc(K('cursorBlink'))}</div>
                    <div class="xp-row"><span>${esc(K('none'))}</span>${range('kbBlinkRate', 5, 0, 10)}<span>${esc(K('fast'))}</span></div>
                </div>`, true)}`;
        tabsOf(root);
        wireRanges(root);
    });

    // --- User Accounts -------------------------------------------------------
    // The party are the accounts on this machine, which is what the welcome
    // screen already believed; this is the page that says so and lets the
    // player say which of them administers it.
    xpApp('app-useracc', 'useracc', 84, [440, 360], (win, root, T_) => {
        const K = k => T_(k);
        const names = XP.accountNames ? XP.accountNames() : [XP.userName()];
        const admins = XP.reg('accountAdmins', null);
        const isAdmin = n => Array.isArray(admins) ? admins.includes(n) : n === names[0];
        root.innerHTML = `
            <div class="xp-note">${esc(K('pick'))}</div>
            <div class="xp-list" id="ua-list">
                ${names.map(n => `
                    <div class="xp-regedit-row focusable" data-user="${esc(n)}" tabindex="0">
                        <span>${esc(n)}${n === XP.userName() ? ' (' + esc(K('current')) + ')' : ''}</span>
                        <span class="xp-dim">${esc(isAdmin(n) ? K('administrator') : K('limited'))}</span>
                    </div>`).join('')}
            </div>
            ${names.length < 2 ? `<div class="xp-note">${esc(K('noParty'))}</div>` : ''}`;
        root.querySelectorAll('[data-user]').forEach(row => on(row, 'click', () => {
            const name = row.dataset.user;
            const list = Array.isArray(admins) ? admins.slice() : [names[0]];
            const now = list.includes(name);
            const next = now ? list.filter(x => x !== name) : list.concat([name]);
            XP.setReg('accountAdmins', next);
            window.HypernetOS.Dialog.alert(
                T_('changed', { name: name, type: now ? K('limited') : K('administrator') }), K('changeType'));
            window.HypernetOS.launchApp('app-useracc');
        }));
    });

    // --- Printers and Faxes --------------------------------------------------
    // A folder rather than a page, so what it lists lives in the file system
    // under Printers and a printer added here is a file put there.
    xpApp('app-printers', 'printers', 234, [420, 300], (win, root, T_) => {
        const K = k => T_(k);
        const fs = window.HypernetFileSystem;
        const draw = () => {
            const list = (fs && fs.readDir('Printers')) || [];   // i18n-ignore  VFS path
            root.innerHTML = list.length
                ? `<div class="xp-list">${list.map(pr => `
                    <div class="xp-regedit-row"><span>${esc(pr.name)}</span><span class="xp-dim">${esc(K('status'))}</span></div>`).join('')}</div>`
                : `<div class="xp-note">${esc(K('none'))}</div>`;
            root.innerHTML += `<div class="xp-row-right">${btn('pr-add', esc(K('add')))}</div>`;
            on(q(root, '#pr-add'), 'click', () => {
                if (!fs) return;
                const name = K('added');
                fs.writeFile('Printers/' + name, K('status'), 'prn');   // i18n-ignore  VFS path and mime
                window.HypernetOS.Dialog.alert(T_('installed', { name: name }), K('appName'));
                draw();
            });
        };
        draw();
    });

    // --- Network Connections -------------------------------------------------
    // What this machine talks through, read off the host profile rather than
    // invented here, so a Hyperdeck's own modem is what the page reports.
    xpApp('app-netconn', 'netconn', 188, [440, 320], (win, root, T_) => {
        const K = k => T_(k);
        const p = window.HypernetOS.Host.profile();
        const up = !window.HypernetOS.isEmptyWorld();
        const rows = [
            { group: 'dialup', name: p.modem, on: up },
            { group: 'lan', name: p.board, on: up }
        ];
        root.innerHTML = ['dialup', 'lan'].map(group => `
            <div class="xp-group"><div class="xp-group-title">${esc(K(group))}</div>
                <div class="xp-list">${rows.filter(r => r.group === group).map(r => `
                    <div class="xp-regedit-row focusable" data-conn="${esc(r.name)}" data-on="${r.on ? '1' : ''}" tabindex="0">
                        <span>${esc(r.name)}</span>
                        <span class="xp-dim">${esc(r.on ? K('connected') : K('disconnected'))}</span>
                    </div>`).join('')}</div>
            </div>`).join('');
        root.querySelectorAll('[data-conn]').forEach(row => on(row, 'click', () => {
            const name = row.dataset.conn;
            const live = !!row.dataset.on;
            const secs = Math.floor((Date.now() - (XP._scene ? XP._lastInput : Date.now())) / 1000);
            window.HypernetOS.Dialog.alert(T_('detailsBody', {
                status: live ? K('connected') : K('disconnected'),
                duration: window.HypernetOS.Kernel.uptime ? window.HypernetOS.Kernel.uptime() : String(Math.max(0, secs)),
                speed: p.modem,
                sent: live ? XP.hash(name + 'sent') % 90000 : 0,       // i18n-ignore  hash salt
                received: live ? XP.hash(name + 'recv') % 90000 : 0    // i18n-ignore  hash salt
            }), T_('detailsTitle', { name: name }));
        }));
    });

    // --- Accessibility Options -----------------------------------------------
    xpApp('app-access', 'access', 84, [420, 340], (win, root, T_) => {
        const K = k => T_(k);
        const sw = (key, label, body, def) =>
            `<div class="xp-group"><div class="xp-group-title">${esc(K(label))}</div>
                <div class="xp-note">${esc(K(body))}</div>
                ${switchRows([[key, label, def]], K)}
            </div>`;
        root.innerHTML = `
            ${tabBar(T_, ['keyboardTab', 'displayTab'])}
            ${pane('keyboardTab', `
                ${sw('accStickyKeys', 'stickyKeys', 'stickyBody', false)}
                ${sw('accFilterKeys', 'filterKeys', 'filterBody', false)}
                ${sw('accToggleKeys', 'toggleKeys', 'toggleBody', false)}`, true)}
            ${pane('displayTab', `
                ${sw('accHighContrast', 'highContrast', 'highContrastBody', false)}
                <div class="xp-group"><div class="xp-group-title">${esc(K('cursorWidth'))}</div>
                    <div class="xp-row"><input type="range" class="xp-range" data-range="accCursorWidth" min="1" max="8" value="${XP.reg('accCursorWidth', 1)}"></div>
                </div>`)}`;
        tabsOf(root);
        // High contrast is the one switch here the desktop can answer, and it
        // answers it through the colour scheme it already has.
        wireSwitches(root, () => XP.applyColorScheme && XP.applyColorScheme());
        wireRanges(root);
    });

    // --- Fonts ---------------------------------------------------------------
    // A folder of the faces the shell is drawn in, each shown in itself the way
    // the folder showed them.
    const SHELL_FONTS = ['Tahoma', 'Verdana', 'Georgia', 'Times New Roman', 'Courier New',
        'Lucida Console', 'Trebuchet MS', 'Comic Sans MS', 'Impact', 'Arial'];   // i18n-ignore  font family names
    xpApp('app-fonts', 'fonts', 190, [440, 360], (win, root, T_) => {
        const K = k => T_(k);
        root.innerHTML = `
            <div class="xp-note">${esc(T_('installed', { n: SHELL_FONTS.length }))}</div>
            <div class="xp-list">${SHELL_FONTS.map(f => `
                <div class="xp-regedit-row focusable" data-font="${esc(f)}" tabindex="0">
                    <span>${esc(f)}</span>
                    <span class="xp-font-sample" data-family="${esc(f)}">${esc(K('preview'))}</span>
                </div>`).join('')}</div>`;
        // The sample is drawn in the face it names, which is the only thing on
        // the page a stylesheet cannot know in advance.
        root.querySelectorAll('.xp-font-sample').forEach(el => el.style.setProperty('--xp-font', el.dataset.family));
        root.querySelectorAll('[data-font]').forEach(row => on(row, 'click', () =>
            window.HypernetOS.Dialog.alert(K('preview'), row.dataset.font)));
    });

    // --- Game Controllers ----------------------------------------------------
    // The one page here that reports something the player can change by picking
    // a pad up: it asks the engine which device is in hand.
    xpApp('app-joy', 'joy', 234, [420, 300], (win, root, T_) => {
        const K = k => T_(k);
        const pads = (typeof navigator !== 'undefined' && navigator.getGamepads)
            ? Array.from(navigator.getGamepads() || []).filter(Boolean) : [];
        root.innerHTML = `
            <div class="xp-group"><div class="xp-group-title">${esc(K('installed'))}</div>
                ${pads.length ? `<div class="xp-list">
                    <div class="xp-regedit-row"><span>${esc(K('controller'))}</span><span class="xp-dim">${esc(K('status'))}</span></div>
                    ${pads.map(g => `<div class="xp-regedit-row"><span>${esc(g.id || K('controller'))}</span><span class="xp-dim">${esc(K('ok'))}</span></div>`).join('')}
                </div>` : `<div class="xp-note">${esc(K('none'))}</div>`}
            </div>`;
    });

    // =========================================================================
    // The two games that came in the box
    // -------------------------------------------------------------------------
    // Every machine of the period shipped with these, and half of what anyone
    // remembers doing on one was playing them. They are applets like the rest:
    // registered under the games category, reached from the start menu, the Run
    // box and the shell's START, and drawn in an ordinary window.
    //
    // Both keep their state on the window they were built into rather than in a
    // module variable, so two of them open at once are two games.
    // =========================================================================

    // --- Mineseeker ----------------------------------------------------------
    // The field is one flat array of cells, each holding whether it is mined,
    // whether it has been opened, and what the player marked it with. The count
    // on a cell is computed rather than stored: a field is small and the count
    // never outlives the layout it was read off.
    const MINE_LEVELS = {
        // i18n-ignore-start  level ids
        beginner: { w: 9, h: 9, mines: 10 },
        intermediate: { w: 16, h: 16, mines: 40 },
        expert: { w: 30, h: 16, mines: 99 }
        // i18n-ignore-end
    };

    const Mines = {
        LEVELS: MINE_LEVELS,

        // A fresh field, with the first cell opened guaranteed safe: the mines
        // are laid after that first click, the way the game always laid them.
        make(level) {
            const spec = MINE_LEVELS[level] || MINE_LEVELS.beginner;
            return {
                level: level,
                w: spec.w, h: spec.h, mines: spec.mines,
                cells: new Array(spec.w * spec.h).fill(0).map(() => ({ mine: false, open: false, mark: 0 })),
                laid: false, dead: false, won: false, started: 0, elapsed: 0
            };
        },

        at(g, x, y) { return (x < 0 || y < 0 || x >= g.w || y >= g.h) ? null : g.cells[y * g.w + x]; },

        neighbours(g, i) {
            const x = i % g.w, y = Math.floor(i / g.w), out = [];
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                if (!dx && !dy) continue;
                const c = this.at(g, x + dx, y + dy);
                if (c) out.push(c);
            }
            return out;
        },

        count(g, i) { return this.neighbours(g, i).filter(c => c.mine).length; },

        // Lay the mines, keeping the opened cell and everything touching it
        // clear so the first click always opens a space rather than a number.
        lay(g, safeIndex) {
            const safe = new Set([safeIndex]);
            const x = safeIndex % g.w, y = Math.floor(safeIndex / g.w);
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx, ny = y + dy;
                if (nx >= 0 && ny >= 0 && nx < g.w && ny < g.h) safe.add(ny * g.w + nx);
            }
            const spots = [];
            for (let i = 0; i < g.cells.length; i++) if (!safe.has(i)) spots.push(i);
            for (let n = 0; n < g.mines && spots.length; n++) {
                const pick = Math.floor(Math.random() * spots.length);
                g.cells[spots.splice(pick, 1)[0]].mine = true;
            }
            g.laid = true;
            g.started = Date.now();
        },

        // Opening a blank cell opens everything blank around it, the way it did.
        open(g, i) {
            if (g.dead || g.won) return;
            const cell = g.cells[i];
            if (!cell || cell.open || cell.mark === 1) return;
            if (!g.laid) this.lay(g, i);
            cell.open = true;
            if (cell.mine) { g.dead = true; g.cells.forEach(c => { if (c.mine) c.open = true; }); return; }
            if (this.count(g, i) === 0) {
                const x = i % g.w, y = Math.floor(i / g.w);
                for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                    const nx = x + dx, ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
                    const j = ny * g.w + nx;
                    if (!g.cells[j].open) this.open(g, j);
                }
            }
            this.checkWon(g);
        },

        // Right click walks flag, query, blank. Query is a setting, as it was.
        mark(g, i, marksOn) {
            const cell = g.cells[i];
            if (!cell || cell.open || g.dead || g.won) return;
            cell.mark = marksOn ? (cell.mark + 1) % 3 : (cell.mark === 1 ? 0 : 1);
        },

        flags(g) { return g.cells.filter(c => c.mark === 1).length; },

        checkWon(g) {
            if (g.dead) return false;
            const left = g.cells.filter(c => !c.open && !c.mine).length;
            if (left === 0) {
                g.won = true;
                g.cells.forEach(c => { if (c.mine) c.mark = 1; });
            }
            return g.won;
        },

        seconds(g) {
            if (!g.laid) return 0;
            return Math.min(999, Math.floor(((g.won || g.dead ? g.elapsed || Date.now() : Date.now()) - g.started) / 1000));
        }
    };
    XP.Mines = Mines;

    xpApp('app-minesweeper', 'minesweeper', 291, [340, 320], (win, root, T_) => {
        let g = Mines.make(XP.reg('mineLevel', 'beginner'));   // i18n-ignore  level id
        let tick = null;

        const bestKey = () => 'mineBest_' + g.level;   // i18n-ignore  registry key prefix
        const fmt = n => String(Math.max(0, Math.min(999, n))).padStart(3, '0');

        const draw = () => {
            const marksOn = XP.reg('mineMarks', true);
            root.innerHTML = `
                <div class="xp-mines">
                    <div class="xp-mines-bar">
                        <div class="xp-mines-count">${fmt(g.mines - Mines.flags(g))}</div>
                        <button class="xp-mines-face ${g.dead ? 'dead' : (g.won ? 'won' : '')}" id="mine-face"></button>
                        <div class="xp-mines-count">${fmt(Mines.seconds(g))}</div>
                    </div>
                    <div class="xp-mines-field" id="mine-field" data-w="${g.w}">
                        ${g.cells.map((c, i) => {
                            const n = c.open && !c.mine ? Mines.count(g, i) : 0;
                            const face = c.open
                                ? (c.mine ? '*' : (n ? String(n) : ''))   // i18n-ignore  mine glyph
                                : (c.mark === 1 ? 'F' : (c.mark === 2 ? '?' : ''));   // i18n-ignore  flag glyphs
                            return `<div class="xp-mine-cell ${c.open ? 'open' : ''} ${c.open && c.mine ? 'boom' : ''} n${n}" data-i="${i}">${face}</div>`;
                        }).join('')}
                    </div>
                </div>`;
            const field = q(root, '#mine-field');
            field.dataset.cols = String(g.w);
            field.style.setProperty('--mine-cols', String(g.w));
            field.querySelectorAll('.xp-mine-cell').forEach(el => {
                on(el, 'click', () => { Mines.open(g, Number(el.dataset.i)); after(); });
                el.addEventListener('contextmenu', e => {
                    e.preventDefault(); e.stopPropagation();
                    Mines.mark(g, Number(el.dataset.i), marksOn);
                    after();
                });
            });
            on(q(root, '#mine-face'), 'click', () => restart(g.level));
        };

        // A game ends once. Every later click on the field still redraws it, but
        // the clock, the sound and the message box belong to the move that
        // ended the game, not to the clicks that come after it.
        const after = () => {
            const ended = (g.won || g.dead) && !g.elapsed;
            if (ended) g.elapsed = Date.now();
            draw();
            if (!ended) return;
            if (g.won) {
                const secs = Mines.seconds(g);
                const best = XP.reg(bestKey(), 0);
                if (!best || secs < best) {
                    XP.setReg(bestKey(), secs);
                    XP.playEvent('newMail');   // i18n-ignore  event id
                }
                window.HypernetOS.Dialog.alert(T_('won', { n: secs }), T_('wonTitle'), 'info');
                stop();
            } else if (g.dead) {
                XP.playEvent('criticalStop');   // i18n-ignore  event id
                window.HypernetOS.Dialog.alert(T_('lost'), T_('lostTitle'), 'warning');
                stop();
            }
        };

        const stop = () => { if (tick) { clearInterval(tick); tick = null; } };
        const restart = (level) => {
            stop();
            g = Mines.make(level);
            XP.setReg('mineLevel', level);
            draw();
            tick = setInterval(() => { if (g.laid && !g.won && !g.dead) draw(); }, 1000);
        };

        // The Game menu, dropped from the window rather than drawn as chrome:
        // one menu bar service already exists and this is it.
        win.addEventListener('contextmenu', e => {
            if (e.target.closest('.xp-mine-cell')) return;
            e.preventDefault(); e.stopPropagation();
            const times = Object.keys(MINE_LEVELS).reduce((acc, lv) => {
                const t = XP.reg('mineBest_' + lv, 0);   // i18n-ignore  registry key prefix
                acc[lv] = t ? T_('seconds', { n: t }) : T_('noTime');
                return acc;
            }, {});
            window.HypernetOS.ContextMenu.show(e.clientX, e.clientY, [
                { label: T_('new'), bold: true, action: () => restart(g.level) },
                { separator: true },
                ...Object.keys(MINE_LEVELS).map(lv => ({
                    label: T_(lv), checked: g.level === lv, action: () => restart(lv)
                })),
                { separator: true },
                { label: T_('marks'), checked: !!XP.reg('mineMarks', true),
                  action: () => { XP.setReg('mineMarks', !XP.reg('mineMarks', true)); draw(); } },
                { separator: true },
                { label: T_('best'), action: () => window.HypernetOS.Dialog.alert(T_('bestBody', times), T_('best')) }
            ]);
        });
        win.addEventListener('hypernet-closed', stop);
        restart(g.level);
    }, { category: 'games', desktopShortcut: false });   // i18n-ignore  category id

    // --- Patience ------------------------------------------------------------
    // Klondike: the stock and its waste, four homes and seven piles. A card is
    // { r, s, up }, r running 1..13 and s indexing SUITS, so red and black is
    // (s & 1) and nothing has to look up a colour table.
    const SUITS = ['S', 'H', 'C', 'D'];   // i18n-ignore  card suit glyphs
    const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];   // i18n-ignore  card rank glyphs

    const Patience = {
        SUITS: SUITS,
        RANKS: RANKS,
        red(card) { return card.s === 1 || card.s === 3; },

        deal() {
            const deck = [];
            for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) deck.push({ r: r, s: s, up: false });
            for (let i = deck.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const t = deck[i]; deck[i] = deck[j]; deck[j] = t;
            }
            const g = { stock: [], waste: [], homes: [[], [], [], []], piles: [[], [], [], [], [], [], []], moves: 0, score: 0, started: Date.now(), draw: 1 };
            for (let p = 0; p < 7; p++) {
                for (let n = 0; n <= p; n++) {
                    const card = deck.pop();
                    card.up = (n === p);
                    g.piles[p].push(card);
                }
            }
            g.stock = deck;
            return g;
        },

        // Turn the stock over onto the waste, and back again when it runs out.
        drawFrom(g) {
            if (!g.stock.length) {
                g.stock = g.waste.reverse().map(c => (c.up = false, c));
                g.waste = [];
                return;
            }
            for (let n = 0; n < g.draw && g.stock.length; n++) {
                const card = g.stock.pop();
                card.up = true;
                g.waste.push(card);
            }
            g.moves++;
        },

        canHome(card, home) {
            if (!card) return false;
            if (!home.length) return card.r === 1;
            const top = home[home.length - 1];
            return top.s === card.s && card.r === top.r + 1;
        },

        canPile(card, pile) {
            if (!card) return false;
            if (!pile.length) return card.r === 13;
            const top = pile[pile.length - 1];
            return top.up && this.red(top) !== this.red(card) && card.r === top.r - 1;
        },

        won(g) { return g.homes.every(h => h.length === 13); }
    };
    XP.Patience = Patience;

    xpApp('app-solitaire', 'solitaire', 416, [620, 440], (win, root, T_) => {
        let g = Patience.deal();
        let held = null;   // { from: 'waste'|'pile'|'home', pile, index }

        const label = card => RANKS[card.r - 1] + SUITS[card.s];

        const cardHTML = (card, extra) => card.up
            ? `<div class="xp-card ${Patience.red(card) ? 'red' : ''} ${extra || ''}">${label(card)}</div>`
            : `<div class="xp-card back ${extra || ''}"></div>`;

        const draw = () => {
            const secs = Math.floor((Date.now() - g.started) / 1000);
            root.innerHTML = `
                <div class="xp-patience">
                    <div class="xp-pat-top">
                        <div class="xp-pat-slot" data-zone="stock">${g.stock.length ? '<div class="xp-card back"></div>' : '<div class="xp-card empty"></div>'}</div>
                        <div class="xp-pat-slot" data-zone="waste">${g.waste.length ? cardHTML(g.waste[g.waste.length - 1], 'pick') : '<div class="xp-card empty"></div>'}</div>
                        <div class="xp-pat-gap"></div>
                        ${g.homes.map((h, i) => `<div class="xp-pat-slot" data-zone="home" data-pile="${i}">${h.length ? cardHTML(h[h.length - 1], 'pick') : '<div class="xp-card empty"></div>'}</div>`).join('')}
                    </div>
                    <div class="xp-pat-piles">
                        ${g.piles.map((pile, i) => `
                            <div class="xp-pat-pile" data-zone="pile" data-pile="${i}">
                                ${pile.length ? pile.map((c, n) => cardHTML(c, 'pick stacked') .replace('<div class="xp-card', `<div data-index="${n}" class="xp-card`)).join('') : '<div class="xp-card empty"></div>'}
                            </div>`).join('')}
                    </div>
                    <div class="xp-pat-status">
                        <span>${T_('score', { n: g.score })}</span>
                        <span>${T_('time', { n: secs })}</span>
                        <span>${T_('moves', { n: g.moves })}</span>
                    </div>
                </div>`;
            wire();
        };

        // Two clicks rather than a drag: pick a card up, put it down. It is
        // what a pad and the keyboard can both do, and the shell is driven by
        // both (see the accessibility note at the head of this plugin).
        const wire = () => {
            root.querySelectorAll('[data-zone]').forEach(zone => {
                on(zone, 'click', (e) => {
                    const kind = zone.dataset.zone;
                    const pileNo = Number(zone.dataset.pile);
                    if (kind === 'stock') { Patience.drawFrom(g); held = null; draw(); return; }
                    const card = e.target.closest('.xp-card');
                    const index = card && card.dataset.index !== undefined ? Number(card.dataset.index) : null;
                    if (!held) { pickUp(kind, pileNo, index); draw(); return; }
                    putDown(kind, pileNo);
                    draw();
                });
            });
        };

        const source = () => {
            if (!held) return null;
            if (held.from === 'waste') return g.waste;
            if (held.from === 'home') return g.homes[held.pile];
            return g.piles[held.pile];
        };

        const pickUp = (kind, pileNo, index) => {
            if (kind === 'waste' && g.waste.length) { held = { from: 'waste', pile: 0, index: g.waste.length - 1 }; return; }
            if (kind === 'home' && g.homes[pileNo].length) { held = { from: 'home', pile: pileNo, index: g.homes[pileNo].length - 1 }; return; }
            if (kind === 'pile') {
                const pile = g.piles[pileNo];
                if (!pile.length) return;
                const at = index == null ? pile.length - 1 : index;
                if (!pile[at] || !pile[at].up) return;
                held = { from: 'pile', pile: pileNo, index: at };
            }
        };

        const putDown = (kind, pileNo) => {
            const from = source();
            if (!from) { held = null; return; }
            const run = from.slice(held.index);
            const card = run[0];
            let ok = false;
            if (kind === 'home' && run.length === 1 && Patience.canHome(card, g.homes[pileNo])) {
                g.homes[pileNo].push(card); from.length = held.index; ok = true; g.score += 10;
            } else if (kind === 'pile' && Patience.canPile(card, g.piles[pileNo])) {
                g.piles[pileNo].push(...run); from.length = held.index; ok = true;
            }
            if (ok) {
                g.moves++;
                if (held.from === 'pile') {
                    const pile = g.piles[held.pile];
                    if (pile.length && !pile[pile.length - 1].up) { pile[pile.length - 1].up = true; g.score += 5; }
                }
                if (Patience.won(g)) {
                    XP.playEvent('newMail');   // i18n-ignore  event id
                    window.HypernetOS.Dialog.alert(T_('won'), T_('wonTitle'), 'info');
                }
            }
            held = null;
        };

        win.addEventListener('contextmenu', e => {
            e.preventDefault(); e.stopPropagation();
            window.HypernetOS.ContextMenu.show(e.clientX, e.clientY, [
                { label: T_('deal'), bold: true, action: () => { g = Patience.deal(); held = null; draw(); } },
                { separator: true },
                { label: T_('draw1'), checked: g.draw === 1, action: () => { g.draw = 1; draw(); } },
                { label: T_('draw3'), checked: g.draw === 3, action: () => { g.draw = 3; draw(); } }
            ]);
        });
        draw();
    }, { category: 'games', desktopShortcut: false });   // i18n-ignore  category id

    // Taskbar and Start Menu Properties: the page behind the bar's own
    // Properties entry, and a Control Panel applet like every other settings
    // page. Every switch on it writes the registry key applyTaskbar() reads,
    // so the bar answers the moment the box is ticked.
    xpApp('app-taskbar', 'taskbar', 234, [420, 340], (win, root, T_) => {
        const K = k => T('HypernetOS.xp.taskbar.' + k);
        // Every switch: its registry key, its label, and what it defaults to.
        const SWITCHES = [
            // i18n-ignore-start  registry keys
            ['taskbar', 'taskbarLocked', 'optLock', false],
            ['taskbar', 'taskbarAutoHide', 'optAutoHide', false],
            ['taskbar', 'taskbarGroup', 'optGroup', true],
            ['taskbar', 'quickLaunchShown', 'optQuick', true],
            ['notify', 'trayClock', 'optClock', true],
            ['notify', 'trayHideInactive', 'optHide', false],
            ['start', 'startCategories', 'optCategories', true],
            ['start', 'startRecentDocs', 'optRecent', true]
            // i18n-ignore-end
        ];
        const rows = group => SWITCHES.filter(sw => sw[0] === group).map(sw =>
            `<label class="xp-check-row"><input type="checkbox" data-reg="${sw[1]}" ${XP.reg(sw[1], sw[3]) ? 'checked' : ''}> ${esc(K(sw[2]))}</label>`).join('');
        root.innerHTML = `
            ${tabBar(T_, ['taskbar', 'startMenu'])}
            ${pane('taskbar', `
                <div class="xp-group"><div class="xp-group-title">${esc(K('propsAppearance'))}</div>${rows('taskbar')}</div>
                <div class="xp-group"><div class="xp-group-title">${esc(K('propsNotify'))}</div>${rows('notify')}</div>`, true)}
            ${pane('startMenu', `
                <div class="xp-group"><div class="xp-group-title">${esc(K('propsStart'))}</div>${rows('start')}</div>`)}`;
        tabsOf(root);
        root.querySelectorAll('input[data-reg]').forEach(box => on(box, 'change', () => {
            XP.setReg(box.dataset.reg, box.checked);
            XP.applyTaskbar();
            window.HypernetOS.refreshQuickLaunch();
            window.HypernetOS.refreshTaskbarTabs();
            window.HypernetOS.refreshStartMenu();
        }));
    });

    // The settings programs, kept as a list because Add or Remove Programs and
    // the Run box still name them together. They are listed and launched from
    // All Programs like everything else.
    XP.APPLETS = ['app-folderopt', 'app-mouse', 'app-keyboard', 'app-useracc',
        'app-printers', 'app-netconn', 'app-access', 'app-fonts', 'app-joy',
        'app-taskbar', 'app-appwiz', 'app-timedate', 'app-desk', 'app-intl', 'app-mmsys', 'app-sysdm', 'app-devmgmt',
        'app-wscui', 'app-schedtasks', 'app-netstat', 'app-cleanmgr', 'app-defrag', 'app-msconfig', 'app-regedit',
        'app-eventvwr', 'app-osk', 'app-charmap', 'app-calc', 'app-clipbrd', 'app-winver', 'app-help', 'app-search', 'app-run'];
    // i18n-ignore-end

})();
