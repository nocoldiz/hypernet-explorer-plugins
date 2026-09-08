/*:
 * @target MZ
 * @plugindesc Kanban Quest Log v1.1.0
 * @author Omni-Lex
 * @help
 * ============================================================================
 * Kanban Quest Log Plugin for RPG Maker MZ
 * ============================================================================
 * 
 * This plugin creates a Kanban board-style quest log with draggable sticky
 * notes in three columns: To Do, In Progress, and Done.
 * 
 * Features:
 * - Draggable sticky notes with mouse (long press 0.6s to drag)
 * - Click to open quest details immediately
 * - Different colors for different quests
 * - Quest details with update history
 * - Menu integration
 * - Notifications for new quests and updates
 * - Plugin commands for quest management
 * 
 * Plugin Commands:
 * - Add Quest: Creates a new quest in the To Do column
 * - Update Quest: Adds an update to an existing quest
 * - Complete Quest: Moves a quest to the Done column
 * - Open Quest Log: Opens the Kanban quest board
 * 
 * @param menuCommand
 * @text Menu Command Name
 * @desc Name of the quest log command in the menu
 * @default Quest Log
 * 
 * @param showInMenu
 * @text Show in Menu
 * @desc Show the Quest Log command in the pause menu
 * @type boolean
 * @default true
 * 
 * @param notificationDuration
 * @text Notification Duration
 * @desc How long notifications stay on screen (in frames)
 * @type number
 * @default 180
 * 
 * @command addQuest
 * @text Add Quest
 * @desc Adds a new quest to the To Do column
 * 
 * @arg questId
 * @text Quest ID
 * @desc Unique identifier for the quest
 * @type string
 * 
 * @arg questTitle
 * @text Quest Title
 * @desc Title of the quest
 * @type string
 * 
 * @arg questDescription
 * @text Initial Description
 * @desc Initial description or objective
 * @type multiline_string
 * 
 * @command updateQuest
 * @text Update Quest
 * @desc Adds an update to an existing quest
 * 
 * @arg questId
 * @text Quest ID
 * @desc ID of the quest to update
 * @type string
 * 
 * @arg updateText
 * @text Update Text
 * @desc New update information
 * @type multiline_string
 * 
 * @command completeQuest
 * @text Complete Quest
 * @desc Moves a quest to the Done column
 * 
 * @arg questId
 * @text Quest ID
 * @desc ID of the quest to complete
 * @type string
 * 
 * @command openQuestLog
 * @text Open Quest Log
 * @desc Opens the Kanban quest board
 * 
 * @command clearAllQuests
 * @text Clear All Quests
 * @desc Removes all quests from the Kanban board
 */

(() => {
    'use strict';

    const pluginName = 'KanbanQuestLog';
    const parameters = PluginManager.parameters(pluginName);
    const menuCommand = parameters['menuCommand'] || 'Quest Log';
    const notificationDuration = Number(300);

    // Long press duration in milliseconds
    const LONG_PRESS_DURATION = 100;

    // Color palette for sticky notes
    const NOTE_COLORS = [
        '#faf2d3', // Cream Parchment
        '#e6ebd7', // Muted Herb Sage
        '#ebd7d7', // Muted Blush Vellum
        '#d7ebeb', // Aged Slate Mist
        '#e9e0f0', // Soft Lavender Vellum
        '#f0e0e9', // Muted Heather Paper
        '#ebdcd0', // Muted Tea Stain
        '#d2e0db'  // Soft Mint Moss
    ];


    // The wax seal and the pin went with the cork board: a card is flat now, and
    // its only ornament is the marker colour on its left edge.

    function hashStr(s) {
        let h = 0x811c9dc5;
        s = String(s);
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
        return h >>> 0;
    }

    // Marker identity: every quest that can be pinned on a map (the compass
    // arrows in WorldMapReturn.js, the diamonds in WorldMap.js, this board's own
    // card) is coloured and iconed from its id alone, so the same quest always
    // reads the same everywhere and two different quests never collide. Neither
    // is stored on the quest record: deriving it from a hash means an old save,
    // one loaded before this existed, still gets a stable answer.
    //
    // A separate, saturated palette from NOTE_COLORS (the pastel post-it paper):
    // a pale cream or sage note colour would all but vanish painted on a map.
    const MARKER_COLORS = [
        '#e0483e', '#3e7fe0', '#3ea85a', '#e0a13e', '#8a4ee0', '#3ec2c2',
        '#d43e93', '#c2c23e', '#3ecfa0', '#e0673e', '#5a5ae0', '#a0873e'
    ];

    // IconSet.png indices, 65-215 in steps of 5: the item/equipment bank of the
    // sheet (the first 64 icons are HUD stat glyphs and party emblems, no use as
    // a quest token), spread wide enough that neighbouring quests rarely land on
    // near-identical icons.
    const QUEST_ICONS = [
        65, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130, 135,
        140, 145, 150, 155, 160, 165, 170, 175, 180, 185, 190, 195, 200, 205, 210, 215
    ];

    function markerColorFor(id) {
        return MARKER_COLORS[hashStr(String(id) + ':mk') % MARKER_COLORS.length];
    }

    function markerIconFor(id) {
        return QUEST_ICONS[hashStr(String(id) + ':ic') % QUEST_ICONS.length];
    }

    // Inline background-position/-size for a single IconSet cell drawn at
    // `size`px (native icons are 32px, so this also handles the downscale).
    function iconBadgeStyle(icon, size) {
        const cols = 16;
        const col = icon % cols;
        const row = Math.floor(icon / cols);
        return `width:${size}px;height:${size}px;background-position:-${col * size}px -${row * size}px;background-size:${cols * size}px auto;`;
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[c]);
    }

    // The face of a post-it, shared by the board and by anything else that wants
    // to show the same note (the world map hover preview asks for this, so the two
    // can never drift apart).
    function buildNoteHTML(q, useIt, opts) {
        const o = opts || {};
        const meta = q.meta || {};
        const done = o.colId === 'done' || (q.column === 'done' && !o.colId);
        const failed = o.colId === 'failed' || (q.column === 'failed' && !o.colId);
        const latest = q.updates && q.updates.length ? q.updates[0].text : '';
        const stamp = done ? (T('Kanban.resolved'))
            : failed ? (T('Kanban.failed')) : '';
        const stars = meta.diff > 0
            ? '<span class="kb-star"></span>'.repeat(Math.min(5, meta.diff)) : '';
        const urgent = (!done && !failed && meta.deadlineHours > 0)
            ? `<div class="kb-urgent">${T('Kanban.urgent')} ${meta.deadlineHours}h</div>` : '';
        const markerColor = markerColorFor(q.id);
        const markerIconCss = iconBadgeStyle(markerIconFor(q.id), 30);

        return `<div class="kb-card${o.focused ? ' focused' : ''}${o.grabbed ? ' kb-grabbed' : ''}${done || failed ? ' kb-done' : ''}"
                     ${o.attrs || ''}
                     style="--marker:${markerColor}">
          <div class="kb-quest-icon" style="${markerIconCss}" title="${T('Kanban.mapMarker') || ''}"></div>
          ${urgent}
          <span class="kb-card-title">${esc(q.title)}</span>
          ${meta.giver ? `<span class="kb-card-giver">${esc(meta.giver)}</span>` : ''}
          ${meta.reward ? `<span class="kb-card-reward">${T('Kanban.reward')}${esc(meta.reward)}</span>` : ''}
          ${latest ? `<span class="kb-card-meta">${esc(latest)}</span>` : ''}
          ${o.progressHTML || ''}
          ${stars ? `<div class="kb-diff">${stars}</div>` : ''}
          ${stamp ? `<span class="kb-resolved-stamp${failed ? ' failed' : ''}">${stamp}</span>` : ''}
        </div>`;
    }

    // Helper function to get date string with year 2001
    function getFixedDateString() {
        const now = new Date();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');

        return `${month}/${day}/2001, ${hours}:${minutes}:${seconds}`;
    }

    // Notification Manager
    class NotificationManager {
        static initialize() {
            this._notifications = [];
            this._sprite = null;
        }

        static addNotification(text, type = 'info') {
            // Unified top-left notification system: route through ParchmentToast
            // whenever it is available (the legacy sprite stack is the fallback).
            if (window.ParchmentToast) {
                window.ParchmentToast.show(text, {
                    severity: type === 'update' ? 'warning' : 'info',
                    duration: 180
                });
                return;
            }
            this._notifications.push({
                text: text,
                type: type,
                duration: notificationDuration,
                opacity: 0,
                targetOpacity: 255,
                y: 0
            });
        }

        static update() {
            if (!this._sprite) return;

            let yOffset = 10;
            for (let i = this._notifications.length - 1; i >= 0; i--) {
                const notif = this._notifications[i];

                // Update opacity
                if (notif.opacity < notif.targetOpacity) {
                    notif.opacity = Math.min(notif.opacity + 15, notif.targetOpacity);
                }

                // Update duration and fade out
                notif.duration--;
                if (notif.duration < 30) {
                    notif.targetOpacity = 0;
                    notif.opacity = Math.max(notif.opacity - 10, 0);
                }

                // Remove if fully faded
                if (notif.duration <= 0 && notif.opacity <= 0) {
                    this._notifications.splice(i, 1);
                    continue;
                }

                // Update position
                notif.y = yOffset;
                yOffset += 50;
            }

            this.drawNotifications();
        }

        static drawNotifications() {
            if (!this._sprite || !this._sprite.bitmap) return;

            const bitmap = this._sprite.bitmap;
            if (this._notifications.length === 0) {
                // Nothing to show: clear once, then skip redundant full-screen clears
                if (this._blank) return;
                bitmap.clear();
                this._blank = true;
                return;
            }
            this._blank = false;
            bitmap.clear();

            for (const notif of this._notifications) {
                bitmap.paintOpacity = notif.opacity;
                bitmap.fontSize = 20;
                bitmap.fontBold = true;

                // Measure text
                const textWidth = bitmap.measureTextWidth(notif.text) + 40;
                const textHeight = 36;

                // Draw notification box with black background
                const x = 10;
                const y = notif.y;

                // Black background
                bitmap.fillRect(x, y, textWidth, textHeight, 'rgba(0, 0, 0, 0.85)');

                // Colored border based on type
                const borderColor = notif.type === 'quest' ? '#4CAF50' : '#2196F3';
                bitmap.strokeRect(x, y, textWidth, textHeight, borderColor, 2);

                // Draw text
                bitmap.textColor = '#ffffff';
                bitmap.drawText(notif.text, x + 20, y + 6, textWidth - 40, textHeight, 'left');
            }

            bitmap.paintOpacity = 255;
        }

        static createSprite(parent) {
            this._sprite = new Sprite();
            this._blank = true;
            this._sprite.bitmap = new Bitmap(Graphics.width, Graphics.height);
            this._sprite.z = 1000;
            parent.addChild(this._sprite);
        }

        static destroySprite() {
            if (this._sprite) {
                if (this._sprite.parent) {
                    this._sprite.parent.removeChild(this._sprite);
                }
                this._sprite.destroy();
                this._sprite = null;
            }
        }
    }

    // Data Manager
    class QuestManager {
        static initialize() {
            this._quests = {};
            this._questOrder = {
                todo: [],
                inProgress: [],
                done: [],
                failed: []
            };
            this._colorIndex = 0;
        }

        // `meta` is optional contract detail (giver, reward, terms, deadline,
        // difficulty, lore body) supplied by ProceduralQuestSystem. Hand-authored
        // quests pass nothing and simply render without those lines.
        static addQuest(id, title, description, meta) {
            if (this._quests[id]) return false;

            this._quests[id] = {
                id: id,
                title: title,
                column: 'todo',
                color: NOTE_COLORS[this._colorIndex % NOTE_COLORS.length],
                meta: meta || null,
                updates: [{
                    text: description,
                    date: getFixedDateString()
                }]
            };

            this._colorIndex++;
            this._questOrder.todo.push(id);

            // Add notification
            NotificationManager.addNotification(T('Kanban.notify.newQuest', { title: title }), 'quest');

            return true;
        }

        static updateQuest(id, updateText) {
            let quest = this._quests[id];

            // If quest doesn't exist, create it with ??? title
            if (!quest) {
                this._quests[id] = {
                    id: id,
                    title: '???',
                    column: 'todo',
                    color: NOTE_COLORS[this._colorIndex % NOTE_COLORS.length],
                    updates: []
                };
                this._colorIndex++;
                this._questOrder.todo.push(id);
                quest = this._quests[id];

                // Add notification for new mysterious quest
                NotificationManager.addNotification(T('Kanban.notify.newQuestUnknown'), 'quest');
            }

            quest.updates.unshift({
                text: updateText,
                date: getFixedDateString()
            });

            // Automatically move from todo to inProgress when updated
            if (quest.column === 'todo') {
                this.moveQuest(id, 'inProgress');
            }

            // Add notification
            NotificationManager.addNotification(T('Kanban.notify.questUpdated', { title: quest.title }), 'update');

            return true;
        }

        static completeQuest(id) {
            if (!this._quests[id]) return false;

            this.moveQuest(id, 'done');
            this._quests[id].updates.unshift({
                text: T('Kanban.questCompleted'),
                date: getFixedDateString()
            });

            // Add notification
            NotificationManager.addNotification(T('Kanban.notify.questComplete', { title: this._quests[id].title }), 'quest');

            return true;
        }

        static failQuest(id, reasonText) {
            const quest = this._quests[id];
            if (!quest) return false;
            quest.updates.unshift({
                text: reasonText || T('Kanban.questFailed'),
                date: getFixedDateString()
            });
            this.moveQuest(id, 'failed');
            NotificationManager.addNotification(T('Kanban.notify.questFailed', { title: quest.title }), 'update');
            return true;
        }

        // Live objective state for a note: { done, total, mode, status, steps:
        // [{ text, done, current, detail }] }. Written by ProceduralQuestSystem
        // every time an objective moves, so the board can show partial progress
        // rather than only the newest log line.
        static setProgress(id, progress) {
            const quest = this._quests[id];
            if (!quest) return false;
            quest.progress = progress || null;
            return true;
        }

        // Merge contract detail into an existing note (used when a quest was
        // created by an update before its board metadata was known).
        static setMeta(id, meta) {
            const quest = this._quests[id];
            if (!quest) return false;
            quest.meta = Object.assign({}, quest.meta || {}, meta || {});
            return true;
        }

        static moveQuest(id, targetColumn) {
            const quest = this._quests[id];
            if (!quest) return false;

            // Remove from current column
            const currentCol = this._questOrder[quest.column];
            const index = currentCol.indexOf(id);
            if (index > -1) currentCol.splice(index, 1);

            // Add to target column
            this._questOrder[targetColumn].push(id);
            quest.column = targetColumn;
            return true;
        }

        static getQuest(id) {
            return this._quests[id];
        }

        static getQuestsInColumn(column) {
            return this._questOrder[column].map(id => this._quests[id]);
        }

        // Is this quest one the player is actively working on? The In Progress
        // column is the player's own tracker (cards start in To Do and are moved
        // by hand or by the first progress update), so other systems, the world
        // map markers above all, use it to decide what to advertise.
        static isInProgress(id) {
            const quest = this._quests[id];
            return !!quest && quest.column === 'inProgress';
        }

        static save() {
            const saveData = {
                quests: this._quests,
                questOrder: this._questOrder,
                colorIndex: this._colorIndex
            };
            return saveData;
        }

        static load(saveData) {
            if (saveData) {
                this._quests = saveData.quests || {};
                this._questOrder = saveData.questOrder || { todo: [], inProgress: [], done: [], failed: [] };
                // Migration: saves from before the Failed column existed.
                if (!this._questOrder.failed) this._questOrder.failed = [];
                this._colorIndex = saveData.colorIndex || 0;
            }
        }
    }



    if (window.HypernetOS) {
        window.HypernetOS.registerApp({
            id: 'app-kanban-quest',
            name: T('Kanban.appName'),
            icon: 186,
            launchFn: function() {
                if (window.HypernetKanbanApp) {
                    window.HypernetKanbanApp.launch();
                } else {
                    SceneManager.push(Scene_KanbanQuest);
                }
            },
            desktopShortcut: true
        });
    }

    // --- HypernetKanbanApp ---
    window.HypernetKanbanApp = {
        appInstance: null,
        win: null,
        launch: function(params) {
            if (!window.HypernetWindowManager) return;
            
            if (!this.win || !document.getElementById('app-kanban-quest')) {
                this.win = window.HypernetWindowManager.createWindow({
                    id: 'app-kanban-quest',
                    title: T('Kanban.appName'),
                    icon: 186,
                    width: 950,
                    height: 600,
                    contentHTML: '<div id="kanban-quest-content" style="width: 100%; height: 100%; display: flex; flex-direction: column; background: var(--xp-bg)"></div>'
                });

                this.appInstance = new Scene_KanbanQuest();
                this.appInstance._isAppMode = true;
                this.appInstance.create();
                
                this.win.addEventListener('hypernet-closed', () => {
                    if (this.appInstance) {
                        this.appInstance.terminate();
                        this.appInstance = null;
                    }
                    this.win = null;
                });
            } else {
                window.HypernetWindowManager.bringToFront(this.win);
            }
        },
        update: function() {
            if (this.appInstance && this.win) {
                if (this.win.classList.contains('active')) {
                    this.appInstance.update();
                }
            }
        }
    };

    // Monkeypatch Scene_HypernetOS to update Task Master
    const _Scene_HypernetOS_update = window.Scene_HypernetOS ? window.Scene_HypernetOS.prototype.update : null;
    if (_Scene_HypernetOS_update) {
        window.Scene_HypernetOS.prototype.update = function() {
            _Scene_HypernetOS_update.call(this);
            if (window.HypernetKanbanApp) window.HypernetKanbanApp.update();
        };
    }

    // Scene for Kanban Quest Log, D&D parchment board (HTML overlay)
    class Scene_KanbanQuest extends Scene_MenuBase {
        // Opened from a world-map marker: land on that quest's sheet directly.
        prepare(questId) {
            this._focusQuestId = questId || null;
        }

        create() {
            super.create();
            this._selectedQuest = null;
            this._focusCol      = 0;
            this._focusRow      = 0;
            this._el            = null;
            this._drag          = null;   // the note the mouse is carrying
            this._okHeld        = false;  // the note the pad is holding on to
            this._grabCarried   = false;
            this._swallowClick  = false;
            if (this._focusQuestId) {
                const COLS = ['todo', 'inProgress', 'done', 'failed'];
                for (let ci = 0; ci < COLS.length; ci++) {
                    const list = QuestManager.getQuestsInColumn(COLS[ci]);
                    const ri = list.findIndex(q => q && q.id === this._focusQuestId);
                    if (ri >= 0) {
                        this._focusCol = ci;
                        this._focusRow = ri;
                        this._selectedQuest = list[ri];
                        break;
                    }
                }
            }
            this._buildDOM();
        }

        popScene() {
            if (this._isAppMode) {
                if (window.HypernetKanbanApp && window.HypernetKanbanApp.win) {
                    window.HypernetWindowManager.closeWindow(window.HypernetKanbanApp.win);
                }
                return;
            }
            super.popScene();
        }

        terminate() {
            if (this._onDragMove) {
                window.removeEventListener('pointermove', this._onDragMove);
                window.removeEventListener('pointerup', this._onDragEnd);
                window.removeEventListener('pointercancel', this._onDragEnd);
                this._onDragMove = this._onDragEnd = null;
            }
            if (this._drag && this._drag.ghost) this._drag.ghost.remove();
            this._drag = null;
            if (this._el) { this._el.remove(); this._el = null; }
            if (!this._isAppMode) super.terminate();
        }

        _buildDOM() {
            const parent = this._isAppMode
                ? document.getElementById('kanban-quest-content')
                : document.body;
            if (!parent) return;

            const el = document.createElement('div');
            el.id = 'kb-board-overlay';
            if (this._isAppMode) el.classList.add('kb-app-mode');
            parent.appendChild(el);
            this._el = el;
            this._refresh();

            // Right click acts as cancel (handled in update() through
            // TouchInput.isCancelled, like every other menu); all this has to do
            // is make sure the browser menu never comes up.
            el.addEventListener('contextmenu', ev => ev.preventDefault());
            el.addEventListener('mouseover', ev => {
                const card = ev.target.closest('.kb-card');
                if (!card || this._selectedQuest || this._drag) return;
                const col = parseInt(card.dataset.col);
                const row = parseInt(card.dataset.row);
                if (!isNaN(col) && !isNaN(row)) {
                    this._focusCol = col;
                    this._focusRow = row;
                    this._updateHighlight();
                }
            });
            el.addEventListener('click', ev => {
                // The click browsers fire after a drag would re-open the note
                // that was just carried across; the drag already answered it.
                if (this._swallowClick) { this._swallowClick = false; return; }
                if (ev.target.closest('.kb-board-back')) {
                    // Mirrors the Esc key: an open sheet closes first, then the log.
                    if (this._selectedQuest) this._closeDetail();
                    else { SoundManager.playCancel(); this.popScene(); }
                    return;
                }
                const moveBtn = ev.target.closest('.kb-detail-move');
                if (moveBtn) { this._moveSelectedTo(moveBtn.dataset.target); return; }
                if (ev.target.closest('.kb-detail-map')) { this._showOnMap(); return; }
                if (ev.target.closest('.kb-detail-close')) { this._closeDetail(); return; }
                // Click on the dimmed backdrop (but not the panel itself) closes the detail
                if (ev.target.id === 'kb-detail-backdrop') { this._closeDetail(); return; }
                const card = ev.target.closest('.kb-card');
                if (card) this._openDetail(QuestManager.getQuest(card.dataset.id));
            });

            // Dragging a note. The pointer has to be followed on the window and
            // not on the overlay: a note dropped past the edge of the board (or
            // released while the cursor sits over the floating copy) still has
            // to end the drag cleanly.
            el.addEventListener('pointerdown', ev => this._onDragStart(ev));
            this._onDragMove = ev => this._onDragOver(ev);
            this._onDragEnd = ev => this._onDragDrop(ev);
            window.addEventListener('pointermove', this._onDragMove);
            window.addEventListener('pointerup', this._onDragEnd);
            window.addEventListener('pointercancel', this._onDragEnd);
        }

        _onDragStart(ev) {
            if (ev.button !== 0 || this._selectedQuest || this._drag) return;
            const card = ev.target.closest('.kb-card');
            if (!card) return;
            const ci = parseInt(card.dataset.col);
            // Only the two hand-kept columns can be dragged from; a resolved or
            // failed note is a record, not a task.
            if (ci !== 0 && ci !== 1) return;
            const rect = card.getBoundingClientRect();
            this._drag = {
                id: card.dataset.id, fromCol: ci, card,
                startX: ev.clientX, startY: ev.clientY,
                offX: ev.clientX - rect.left, offY: ev.clientY - rect.top,
                width: rect.width, live: false, ghost: null, overCol: -1,
            };
            // No preventDefault here: cancelling pointerdown can swallow the
            // click that opens a note. Text selection is held off by CSS.
        }

        _onDragOver(ev) {
            const d = this._drag;
            if (!d) return;
            if (!d.live) {
                if (Math.abs(ev.clientX - d.startX) + Math.abs(ev.clientY - d.startY) < 8) return;
                d.live = true;
                const ghost = d.card.cloneNode(true);
                ghost.classList.add('kb-ghost');
                ghost.classList.remove('focused', 'kb-grabbed');
                ghost.style.width = d.width + 'px';
                document.body.appendChild(ghost);
                d.ghost = ghost;
                d.card.classList.add('kb-dragging');
                d.cols = Array.from(this._el.querySelectorAll('.kb-column'));
            }
            d.ghost.style.left = (ev.clientX - d.offX) + 'px';
            d.ghost.style.top = (ev.clientY - d.offY) + 'px';
            const over = this._columnAt(ev.clientX, ev.clientY, d);
            if (over !== d.overCol) {
                d.overCol = over;
                d.cols.forEach((c, i) => c.classList.toggle('kb-drop', i === over && (i === 0 || i === 1)));
            }
        }

        // Which column the pointer is over, by the column strips themselves, so
        // the whole height of a column takes a drop and not only its notes.
        _columnAt(x, y, d) {
            if (!d || !d.cols) return -1;
            for (let i = 0; i < d.cols.length; i++) {
                const r = d.cols[i].getBoundingClientRect();
                if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return i;
            }
            return -1;
        }

        _onDragDrop(ev) {
            const d = this._drag;
            if (!d) return;
            this._drag = null;
            if (!d.live) return;
            // Cleared on the next tick as well: a note released past the edge
            // of the board fires no click at all, and a stale flag would eat
            // the following one.
            this._swallowClick = true;
            setTimeout(() => { this._swallowClick = false; }, 0);
            if (d.ghost) d.ghost.remove();
            d.card.classList.remove('kb-dragging');
            d.cols.forEach(c => c.classList.remove('kb-drop'));
            const target = this._columnAt(ev.clientX, ev.clientY, d);
            const COLS = ['todo', 'inProgress', 'done', 'failed'];
            if (target === d.fromCol || target < 0) { SoundManager.playCancel(); return; }
            if (target > 1) { SoundManager.playBuzzer(); return; }
            QuestManager.moveQuest(d.id, COLS[target]);
            this._focusOn(d.id);
            SoundManager.playOk();
            this._refresh();
        }

        // One post-it, pinned. Colour, tilt, pin and wax seal are all derived
        // from the quest id so a note always looks like itself, exactly the way
        // QuestBoardUI derives them for the offers on the cork board.
        _cardHTML(q, ci, ri, colId, useIt) {
            const focused = !this._selectedQuest && this._focusCol === ci && this._focusRow === ri;
            return buildNoteHTML(q, useIt, {
                colId,
                focused,
                grabbed: focused && !!this._okHeld,
                attrs: `data-id="${esc(q.id)}" data-col="${ci}" data-row="${ri}"`, // i18n-ignore: DOM data attributes
                progressHTML: this._progressBarHTML(q, useIt),
            });
        }

        // Partial progress on the note itself: objectives cleared out of total,
        // plus the live counter of whichever objective is being worked on
        // ("2/5 statues"). Absent for quests that carry no objective data.
        _progressBarHTML(q, useIt) {
            const p = q.progress;
            if (!p || !p.total) return '';
            const done = Math.max(0, Math.min(p.total, p.done || 0));
            const pct = Math.round((done / p.total) * 100);
            const current = Array.isArray(p.steps) ? p.steps.find(s => s.current) : null;
            const counter = (current && current.detail) ? ' · ' + esc(current.detail) : '';
            const label = p.status === 'claimable'
                ? (T('Kanban.readyToCollect'))
                : `${done}/${p.total} ${T('Kanban.objectives')}${counter}`;
            return `<div class="kb-progress">
              <div class="kb-progress-track"><div class="kb-progress-fill" style="width:${pct}%"></div></div>
              <span class="kb-progress-label">${label}</span>
            </div>`;
        }

        // The objective checklist, with a mark per objective and its live counter.
        _checklistHTML(q, useIt) {
            const p = q.progress;
            if (!p || !Array.isArray(p.steps) || !p.steps.length) return '';
            const rows = p.steps.map(s => {
                const mark = s.done ? '&#10004;' : (s.current ? '&#10148;' : '&#8226;');
                const cls = s.done ? ' done' : (s.current ? ' current' : '');
                const detail = s.detail ? ` <span class="kb-check-count">${esc(s.detail)}</span>` : '';
                return `<div class="kb-check-row${cls}"><span class="kb-check-mark">${mark}</span>${esc(s.text)}${detail}</div>`;
            }).join('');
            const order = p.total > 1
                ? `<div class="kb-check-order">${p.mode === 'par'
                    ? (T('Kanban.anyOrder'))
                    : (T('Kanban.inOrder'))}</div>`
                : '';
            return `<div class="kb-detail-sec">${T('Kanban.progress')}</div>
              <div class="kb-checklist">${rows}${order}</div>`;
        }

        // The full contract sheet: the same parchment the quest board opens, with
        // the update log appended underneath.
        _detailHTML(useIt) {
            const q = this._selectedQuest;
            if (!q) return '';
            const meta = q.meta || {};
            const terms = Array.isArray(meta.terms) ? meta.terms : [];
            const updates = q.updates.map(u => `
              <div class="kb-upd-row">
                <span class="kb-upd-date">${esc(u.date)}</span>
                <p class="kb-upd-text">${esc(u.text)}</p>
              </div>`).join('');
            const termsHTML = terms.map(line => {
                const warn = /Penalty|Penale|prosecuted|perseguito|cost|Costo/i.test(line);
                return `<div class="kb-detail-line${warn ? ' warn' : ''}">${esc(line)}</div>`;
            }).join('');

            return `<div id="kb-detail-backdrop"><div id="kb-detail-panel"><div class="kb-detail-page">
              <div class="kb-detail-header">${esc(q.title)}</div>
              ${meta.giver ? `<div class="kb-detail-giver">${T('Kanban.postedBy')}${esc(meta.giver)}</div>` : ''}
              ${meta.body ? `<div class="kb-detail-body">${esc(meta.body)}</div>` : ''}
              ${this._checklistHTML(q, useIt)}
              ${(!q.progress && meta.objectives) ? `
                <div class="kb-detail-sec">${T('Kanban.objectives2')}</div>
                <div class="kb-detail-steps">${esc(meta.objectives)}</div>` : ''}
              ${termsHTML ? `
                <div class="kb-detail-sec">${T('Kanban.terms')}</div>
                ${termsHTML}` : ''}
              <div class="kb-detail-sec">${T('Kanban.log')}</div>
              <div class="kb-detail-log">${updates}</div>
              <div class="kb-detail-btns">
                ${this._moveButtonHTML(q)}
                ${this._mapButtonHTML(useIt)}
                <button class="kb-detail-close">${T('Kanban.close')}</button>
              </div>
            </div></div></div>`;
        }

        // The world tile the open quest points at. A still-active procedural
        // contract is asked for its live next objective; anything else falls back
        // to the location snapshotted when the note was pinned.
        _detailLocation() {
            const q = this._selectedQuest;
            if (!q) return null;
            const api = window.ProceduralQuests;
            if (api && typeof api.questLocation === 'function' && typeof api.state === 'function') {
                try {
                    const live = api.state().active[q.id];
                    if (live) {
                        const loc = api.questLocation(live);
                        if (loc) return loc;
                    }
                } catch (e) { }
            }
            const snap = q.meta && q.meta.location;
            return (snap && snap.wx != null) ? snap : null;
        }

        // The one button that carries an open note between To Do and In
        // Progress. Resolved and failed sheets carry none: those columns are
        // written by the quest itself, never by hand.
        _moveButtonHTML(q) {
            if (!q || (q.column !== 'todo' && q.column !== 'inProgress')) return '';
            const toProgress = q.column === 'todo';
            const target = toProgress ? 'inProgress' : 'todo'; // i18n-ignore: column id
            const label = toProgress ? T('Kanban.moveToInProgress') : T('Kanban.moveToToDo');
            return `<button class="kb-detail-close kb-detail-move" data-target="${target}">${label}</button>`;
        }

        // Carry the open note to another column and keep the board's cursor on
        // it, so closing the sheet leaves the focus where the note now lies.
        _moveSelectedTo(targetCol) {
            const q = this._selectedQuest;
            if (!q || (targetCol !== 'todo' && targetCol !== 'inProgress')) return;
            if (q.column === targetCol) { SoundManager.playBuzzer(); return; }
            QuestManager.moveQuest(q.id, targetCol);
            this._focusOn(q.id);
            SoundManager.playOk();
            this._refresh();
        }

        // Put the cursor on a quest wherever it now sits.
        _focusOn(id) {
            const COLS = ['todo', 'inProgress', 'done', 'failed'];
            for (let ci = 0; ci < COLS.length; ci++) {
                const ri = QuestManager.getQuestsInColumn(COLS[ci]).findIndex(q => q && q.id === id);
                if (ri >= 0) { this._focusCol = ci; this._focusRow = ri; return; }
            }
        }

        _mapButtonHTML(useIt) {
            const loc = this._detailLocation();
            if (!loc) return '';
            return `<button class="kb-detail-close kb-detail-map">${T('Kanban.showOnMapAt', { x: loc.wx, y: loc.wy })}</button>`;
        }

        // Leave the log and open the world map (the M map) centred on the site.
        _showOnMap() {
            const loc = this._detailLocation();
            if (!loc) return;
            if (!window.WorldMapView) { SoundManager.playBuzzer(); return; }
            window.WorldMapView.requestFocusAt(loc.wx, loc.wy);
            SoundManager.playOk();
            this._selectedQuest = null;
            if (this._isAppMode) {
                // Inside HypernetOS: just close the window, the map opens when the
                // player leaves the OS.
                this.popScene();
                return;
            }
            // Straight to the map rather than popScene: only Scene_Map can carry
            // the request out, and the log is usually opened from the pause menu.
            SceneManager.goto(Scene_Map);
        }

        _refresh() {
            if (!this._el) return;
            const useIt = ConfigManager.language === 'it';
            const COLS  = ['todo', 'inProgress', 'done', 'failed'];
            const TITLES = [
                T('Kanban.toDo'),
                T('Kanban.inProgress'),
                T('Kanban.done'),
                T('Kanban.failed'),
            ];

            const colsHTML = COLS.map((colId, ci) => {
                const quests = QuestManager.getQuestsInColumn(colId);
                const cards  = quests.map((q, ri) => this._cardHTML(q, ci, ri, colId, useIt)).join('');
                const body = cards || `<div class="kb-empty-col">${T('Kanban.noQuests')}</div>`;
                return `<div class="kb-column">
                  <div class="kb-col-header">
                    <span class="kb-col-title">${TITLES[ci]}</span>
                    <span class="kb-col-count">${quests.length}</span>
                  </div>
                  <div class="kb-cards-wrap">${body}</div>
                </div>`;
            });

            // Replace only the rendered layers: the injected <style> child has to
            // survive every refresh.
            this._el.querySelectorAll('#kb-board-header, #kb-columns, #kb-detail-backdrop')
                .forEach(n => n.remove());
            this._el.insertAdjacentHTML('beforeend', `
              <div id="kb-board-header" class="page-header-bar">
                <div class="back-button focusable kb-board-back">${T('Kanban.back')}</div>
                <span class="kb-board-title title">${T('Kanban.questLog')}</span>
              </div>
              <div id="kb-columns">
                ${colsHTML.join('<div class="kb-col-divider"></div>')}
              </div>
              ${this._detailHTML(useIt)}`);
        }

        _openDetail(quest) {
            if (!quest) return;
            this._selectedQuest = quest;
            SoundManager.playOk();
            this._refresh();
        }

        _closeDetail() {
            this._selectedQuest = null;
            SoundManager.playCancel();
            this._refresh();
        }

        _updateHighlight() {
            if (!this._el) return;
            this._el.querySelectorAll('.kb-card').forEach(el => {
                const isFocused = parseInt(el.dataset.col) === this._focusCol
                    && parseInt(el.dataset.row) === this._focusRow
                    && !this._selectedQuest;
                el.classList.toggle('focused', isFocused);
                el.classList.toggle('kb-grabbed', isFocused && !!this._okHeld);
            });
            const sel = this._el.querySelector('.kb-card.focused');
            if (sel) sel.scrollIntoView({ block: 'nearest' });
        }

        update() {
            super.update();
            if (!this._el) return;

            // Esc, the controller's B button and a right click all read as cancel.
            const cancelled = Input.isTriggered('cancel') || TouchInput.isCancelled();

            if (this._selectedQuest) {
                if (cancelled) this._closeDetail();
                else if (Input.isTriggered('shift')) this._showOnMap();
                else if (Input.isTriggered('right')) this._moveSelectedTo('inProgress');
                else if (Input.isTriggered('left')) this._moveSelectedTo('todo');
                return;
            }

            const COLS = ['todo', 'inProgress', 'done', 'failed'];

            // Holding OK (the controller's A) picks the focused note up: left
            // and right then carry it between To Do and In Progress. Letting go
            // without having carried it anywhere is a plain tap and opens the
            // sheet, the way it always did.
            if (Input.isTriggered('ok')) {
                this._okHeld = true;
                this._grabCarried = false;
                this._updateHighlight();
            }
            if (this._okHeld) {
                if (Input.isPressed('ok')) {
                    if (Input.isRepeated('right')) {
                        if (this._moveCard(1, COLS)) this._grabCarried = true;
                    } else if (Input.isRepeated('left')) {
                        if (this._moveCard(-1, COLS)) this._grabCarried = true;
                    }
                    return;
                }
                this._okHeld = false;
                const carried = this._grabCarried;
                this._grabCarried = false;
                this._updateHighlight();
                if (!carried) {
                    const held = QuestManager.getQuestsInColumn(COLS[this._focusCol])[this._focusRow];
                    if (held) this._openDetail(held);
                }
                return;
            }

            let moved = false;

            if (Input.isRepeated('down')) {
                const len = QuestManager.getQuestsInColumn(COLS[this._focusCol]).length;
                if (this._focusRow < len - 1) { this._focusRow++; moved = true; }
            } else if (Input.isRepeated('up')) {
                if (this._focusRow > 0) { this._focusRow--; moved = true; }
            } else if (Input.isRepeated('left')) {
                if (Input.isPressed('shift')) {
                    this._moveCard(-1, COLS);
                } else if (this._focusCol > 0) {
                    this._focusCol--;
                    moved = true;
                }
            } else if (Input.isRepeated('right')) {
                if (Input.isPressed('shift')) {
                    this._moveCard(1, COLS);
                } else if (this._focusCol < COLS.length - 1) {
                    this._focusCol++;
                    moved = true;
                }
            } else if (cancelled) {
                SoundManager.playCancel();
                this.popScene();
            }

            if (moved) {
                const len = QuestManager.getQuestsInColumn(COLS[this._focusCol]).length;
                this._focusRow = Math.max(0, Math.min(this._focusRow, len - 1));
                SoundManager.playCursor();
                this._updateHighlight();
            }
        }

        _moveCard(dir, COLS) {
            const colId     = COLS[this._focusCol];
            const quests    = QuestManager.getQuestsInColumn(colId);
            const quest     = quests[this._focusRow];
            const targetIdx = this._focusCol + dir;
            // Cards can only be shuffled between To Do and In Progress by hand.
            if (!quest || colId === 'done' || colId === 'failed' || targetIdx < 0 || targetIdx > 1) return false;
            const targetCol = COLS[targetIdx];
            QuestManager.moveQuest(quest.id, targetCol);
            this._focusCol = targetIdx;
            this._focusRow = QuestManager.getQuestsInColumn(targetCol).length - 1;
            SoundManager.playOk();
            this._refresh();
            return true;
        }
    }

    // Export Scene for external use
    window.Scene_KanbanQuest = Scene_KanbanQuest;

    // Programmatic quest API for other plugins (ProceduralQuestSystem etc.):
    // window.KanbanQuest.addQuest(id, title, desc) / updateQuest(id, text) /
    // completeQuest(id) / moveQuest(id, column) / getQuest(id).
    window.KanbanQuest = QuestManager;

    // The exact post-it the board would show for this quest, plus the stylesheet
    // it needs, so other scenes (the world map hover preview) render the same note
    // rather than an imitation of it.
    QuestManager.notePreview = function (questId) {
        const quest = this.getQuest(questId);
        if (!quest) return null;
        const useIt = ConfigManager.language === 'it';
        const scene = new Scene_KanbanQuest();
        let progressHTML = '';
        try { progressHTML = scene._progressBarHTML(quest, useIt); } catch (e) { }
        return {
            html: buildNoteHTML(quest, useIt, { flat: true, progressHTML }),
        };
    };

    // Open the log with one quest already showing its full sheet.
    QuestManager.openAt = function (questId) {
        if (!this.getQuest(questId)) return false;
        SceneManager.push(Scene_KanbanQuest);
        SceneManager.prepareNextScene(questId);
        return true;
    };

    // The stable colour/icon a quest is pinned with everywhere it is pointed
    // to on a map: the board card, the world-map diamonds (WorldMap.js) and the
    // in-world compass arrows (WorldMapReturn.js). Same id, same answer, always.
    QuestManager.colorFor = markerColorFor;
    QuestManager.iconFor = markerIconFor;

    // Every quest the player is actively chasing, reduced to a world-map tile
    // (map 315 / vars 43-44 space) plus the colour/icon that identify it. This
    // is the single feed every map/compass marker draws from:
    //  - ProceduralQuestSystem's own questMarkers() supplies its (possibly
    //    multi-step) procedural contracts, already limited to the In Progress
    //    column by its own isTrackedOnBoard() gate;
    //  - any OTHER quest sitting In Progress on this board that carries its own
    //    meta.location (a hand-authored quest can set one via setMeta) is
    //    picked up too, so the compass isn't procedural-quest-only.
    QuestManager.activeMarkers = function () {
        const out = [];
        const seen = new Set();
        const api = window.ProceduralQuests;
        if (api && typeof api.questMarkers === 'function') {
            try {
                for (const m of api.questMarkers()) {
                    if (m.wx == null || m.wy == null) continue;
                    out.push({
                        qid: m.qid, wx: m.wx, wy: m.wy,
                        title: m.title, label: m.label, objective: m.objective,
                        step: m.step, stepCount: m.stepCount, multi: m.multi,
                        color: this.colorFor(m.qid), icon: this.iconFor(m.qid),
                    });
                    seen.add(m.qid);
                }
            } catch (e) { }
        }
        for (const id of this._questOrder.inProgress) {
            if (seen.has(id)) continue;
            const q = this._quests[id];
            const loc = q && q.meta && q.meta.location;
            if (!loc || loc.wx == null || loc.wy == null) continue;
            out.push({
                qid: id, wx: loc.wx, wy: loc.wy,
                title: q.title, label: loc.label || q.title, objective: loc.label || q.title,
                step: 1, stepCount: 1, multi: false,
                color: this.colorFor(id), icon: this.iconFor(id),
            });
        }
        return out;
    };

    // Menu Integration
    const _Window_MenuCommand_addOriginalCommands = Window_MenuCommand.prototype.addOriginalCommands;
    Window_MenuCommand.prototype.addOriginalCommands = function () {
        _Window_MenuCommand_addOriginalCommands.call(this);
        this.addCommand(menuCommand, 'questLog', true, 186);
    };

    const _Scene_Menu_createCommandWindow = Scene_Menu.prototype.createCommandWindow;
    Scene_Menu.prototype.createCommandWindow = function () {
        _Scene_Menu_createCommandWindow.call(this);
        this._commandWindow.setHandler('questLog', this.commandQuestLog.bind(this));
    };

    Scene_Menu.prototype.commandQuestLog = function () {
        SceneManager.push(Scene_KanbanQuest);
    };


    // WASD are the directional keys everywhere in the game (movement, every
    // parchment menu, the battle command window). They used to be remapped
    // here to the bare symbols 'w'/'a'/'s'/'d', and because Input.initialize
    // runs after every plugin has loaded, that assignment won every other
    // plugin's WASD mapping and silently killed WASD navigation in the main
    // menu and elsewhere. Map them to the directions instead: the board below
    // already reads the direction symbols.
    const _Input_initialize = Input.initialize;
    Input.initialize = function () {
        _Input_initialize.call(this);
        this.keyMapper[87] = 'up';    // W
        this.keyMapper[65] = 'left';  // A
        this.keyMapper[83] = 'down';  // S
        this.keyMapper[68] = 'right'; // D
    };

    // NOTE: do NOT preventDefault W/A/S/D here. Input._onKeyDown is a
    // document-level listener that runs on every keystroke in the game,
    // including ones aimed at DOM text fields layered over the canvas (the
    // Hypernet OS browser address bar, Notepad, search boxes). Blocking the
    // default on those letters made them impossible to type. The board below
    // reads W/A/S/D through Input's own state, which _onKeyDown records
    // whether or not the default is prevented, so nothing here needs it.

    // Plugin Commands
    PluginManager.registerCommand(pluginName, 'addQuest', args => {
        QuestManager.addQuest(args.questId, args.questTitle, args.questDescription);
    });

    PluginManager.registerCommand(pluginName, 'updateQuest', args => {
        QuestManager.updateQuest(args.questId, args.updateText);
    });

    PluginManager.registerCommand(pluginName, 'completeQuest', args => {
        QuestManager.completeQuest(args.questId);
    });

    PluginManager.registerCommand(pluginName, 'openQuestLog', args => {
        if (window.HypernetOS && SceneManager._scene instanceof Scene_HypernetOS) {
            if (window.HypernetKanbanApp) {
                window.HypernetKanbanApp.launch();
            } else {
                SceneManager.push(Scene_KanbanQuest);
            }
        } else {
            SceneManager.push(Scene_KanbanQuest);
        }
    });

    // Notification System Integration
    const _Scene_Map_createDisplayObjects = Scene_Map.prototype.createDisplayObjects;
    Scene_Map.prototype.createDisplayObjects = function () {
        _Scene_Map_createDisplayObjects.call(this);
        NotificationManager.createSprite(this);
    };

    const _Scene_Map_terminate = Scene_Map.prototype.terminate;
    Scene_Map.prototype.terminate = function () {
        NotificationManager.destroySprite();
        _Scene_Map_terminate.call(this);
    };

    const _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function () {
        _Scene_Map_update.call(this);
        NotificationManager.update();
    };

    // Save/Load Integration
    const _DataManager_createGameObjects = DataManager.createGameObjects;
    DataManager.createGameObjects = function () {
        _DataManager_createGameObjects.call(this);
        QuestManager.initialize();
        NotificationManager.initialize();
    };

    const _DataManager_makeSaveContents = DataManager.makeSaveContents;
    DataManager.makeSaveContents = function () {
        const contents = _DataManager_makeSaveContents.call(this);
        contents.kanbanQuests = QuestManager.save();
        return contents;
    };

    const _DataManager_extractSaveContents = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function (contents) {
        _DataManager_extractSaveContents.call(this, contents);
        QuestManager.load(contents.kanbanQuests);
    };

    // Initialize on new game
    const _DataManager_setupNewGame = DataManager.setupNewGame;
    DataManager.setupNewGame = function () {
        _DataManager_setupNewGame.call(this);
        QuestManager.initialize();
        NotificationManager.initialize();
    };

    // Add this with the other Plugin Commands (around line 1074)
    PluginManager.registerCommand(pluginName, 'clearAllQuests', args => {
        QuestManager.initialize();
    });

})();