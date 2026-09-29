/*:
* @plugindesc v2.0 Travel Journal - parchment-pockets DOM scene. (UI)
* @author Omni-Lex
* @target MZ
* @url https://nocoldiz.itch.io/hypernet-explorer
*
* @help
* ==========================================================================
* Travel Journal Plugin (UI)
* ==========================================================================
*
* Scene lifecycle, DOM rendering and input handling for the Travel Journal.
* Requires TravelJournal.js, which must load BEFORE this file.
*
* Layout (parchment book-spread):
*   Left page  - textbox; type here to edit the currently open page.
*   Right page - list of pages + New / Tear Out actions.
*
*/

(() => {
'use strict';

if (!window.TravelJournalManager) {
    throw new Error('TravelJournalUI.js requires TravelJournal.js to be loaded first!');
}

const Manager = window.TravelJournalManager;


// Resolved on every call, so a language switch reaches an open journal.
function labels() {
    return window.T.obj('TravelJournal');
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

//=============================================================================
// Scene_TravelJournal
//=============================================================================

function Scene_TravelJournal() {
    this.initialize(...arguments);
}

Scene_TravelJournal.prototype = Object.create(Scene_MenuBase.prototype);
Scene_TravelJournal.prototype.constructor = Scene_TravelJournal;

Scene_TravelJournal.prototype.initialize = function () {
    Scene_MenuBase.prototype.initialize.call(this);
};

Scene_TravelJournal.prototype.create = function () {
    Scene_MenuBase.prototype.create.call(this);

    // WASD needs no listener of its own: Input.keyMapper already reads the
    // four keys as the four directions. The one thing still listened for is
    // WHEN a key was last struck, so a gamepad "cancel" can be told apart from
    // a keyboard key that RMMZ maps to cancel (typing the letter "x").
    this._lastKeyTime = 0;
    this._keyTimeListener = () => { this._lastKeyTime = performance.now(); };
    window.addEventListener('keydown', this._keyTimeListener);

    // --- DOM state ---
    this._pageIndex     = 0;             // page currently open in the editor
    this._section       = 'editor';      // 'editor' | 'list' | 'actions'
    this._listIndex     = 0;             // focus within the page list
    this._actionIndex   = 0;             // 0 = New, 1 = Delete
    this._editor        = null;

    // --- Container ---
    this._container = document.createElement('div');
    this._container.id = 'travel-journal-container';
    this._container.style.opacity    = '0';
    this._container.style.transition = 'opacity 0.22s ease-out';
    document.body.appendChild(this._container);
    this._container.addEventListener('contextmenu', e => e.preventDefault());

    this._refreshDOM();
    TravelJournalInput.activate(this);

    setTimeout(() => { if (this._container) this._container.style.opacity = '1'; }, 16);
};

Scene_TravelJournal.prototype.update = function () {
    Scene_MenuBase.prototype.update.call(this);
    TravelJournalInput.update();
};

Scene_TravelJournal.prototype.terminate = function () {
    if (this._keyTimeListener) {
        window.removeEventListener('keydown', this._keyTimeListener);
        this._keyTimeListener = null;
    }
    if (window.Controller && Controller.textEntryOpen && Controller.textEntryOpen()) {
        Controller.closeTextEntry();
    }
    // Make sure whatever is in the editor is committed to disk.
    this._commitEditor();
    Manager.persist();
    TravelJournalInput.deactivate();

    if (this._container) {
        const c = this._container;
        c.style.transition    = 'opacity 0.2s ease-out';
        c.style.opacity       = '0';
        c.style.pointerEvents = 'none';
        setTimeout(() => { if (c.parentNode) c.parentNode.removeChild(c); }, 200);
        this._container = null;
        this._editor    = null;
    }
    Scene_MenuBase.prototype.terminate.call(this);
};

// ---- Editor helpers --------------------------------------------------------

Scene_TravelJournal.prototype._commitEditor = function () {
    if (this._editor) {
        Manager.setContent(this._pageIndex, this._editor.value);
    }
};

// True when the pad is the device in hand and the letter sheet exists.
Scene_TravelJournal.prototype.padTypes = function () {
    return !!(window.Controller && typeof Controller.textEntry === 'function' &&
        typeof Input !== 'undefined' && typeof Input.lastInputDevice === 'function' &&
        Input.lastInputDevice() === 'pad');
};

Scene_TravelJournal.prototype.focusEditor = function () {
    this._section = 'editor';
    if (!this._editor) return;
    // A pad does not take the caret: the page is only marked, and Confirm
    // opens the letter sheet over it (writeWithPad).
    if (this.padTypes()) {
        this._editor.classList.add('focused');
        return;
    }
    this._editor.focus();
    const len = this._editor.value.length;
    this._editor.setSelectionRange(len, len);
};

// The pad's way of writing the open page: the letter sheet, handed the page as
// it stands, writes it back the way typing into the field would have.
Scene_TravelJournal.prototype.writeWithPad = function () {
    if (!this._editor) return;
    const editor = this._editor;
    Controller.textEntry({
        title: Manager.titleFor(this._pageIndex),
        value: editor.value,
        max: 4000,
        multiline: true,
        onCommit: (value) => {
            if (!this._editor) return;
            this._editor.value = String(value || '');
            Manager.setContent(this._pageIndex, this._editor.value);
            Manager.persist();
            this._updateOpenPagePreview();
        }
    });
};

Scene_TravelJournal.prototype.blurEditorToList = function () {
    this._commitEditor();
    Manager.persist();
    if (this._editor) this._editor.blur();
    this._section   = 'list';
    this._listIndex = this._pageIndex;
    this._refreshDOM();
    SoundManager.playCursor();
};

Scene_TravelJournal.prototype.openPage = function (index) {
    this._commitEditor();
    this._pageIndex = index;
    this._refreshDOM();
    this.focusEditor();
    SoundManager.playOk();
};

Scene_TravelJournal.prototype.createPage = function () {
    this._commitEditor();
    const idx = Manager.addPage();
    this._pageIndex = idx;
    this._refreshDOM();
    this.focusEditor();
    SoundManager.playOk();
};

Scene_TravelJournal.prototype.deleteCurrentPage = function () {
    Manager.deletePage(this._pageIndex);
    if (this._pageIndex >= Manager.pages().length) {
        this._pageIndex = Manager.pages().length - 1;
    }
    this._listIndex   = Math.min(this._listIndex, Manager.pages().length - 1);
    this._section     = 'list';
    this._actionIndex = 0;
    this._refreshDOM();
    SoundManager.playCancel();
};

//=============================================================================
// Rendering
//=============================================================================

Scene_TravelJournal.prototype._refreshDOM = function () {
    if (!this._container) return;
    const L = labels();
    const pages = Manager.pages();

    const titleText = Manager.titleFor(this._pageIndex);
    const content   = Manager.getContent(this._pageIndex);

    // ----- Right page: page list -----
    let listHTML = '';
    if (pages.length === 0) {
        listHTML = `<div class="item-grid-empty">${L.emptyList}</div>`;
    } else {
        listHTML = pages.map((c, i) => {
            const sel  = (this._section === 'list' && i === this._listIndex) ||
                         (this._section === 'editor' && i === this._pageIndex);
            const open = (i === this._pageIndex);
            const preview = (c || '').split(/\r?\n/).map(s => s.trim()).find(s => s.length > 0) || L.emptyPreview;
            return `
                <div class="journal-page-item${sel ? ' selected' : ''}${open ? ' journal-page-item--open' : ''}" data-index="${i}">
                    <div class="journal-page-num">${i + 1}</div>
                    <div class="journal-page-info">
                        <div class="journal-page-title">${escapeHtml(Manager.titleFor(i))}</div>
                        <div class="journal-page-preview">${escapeHtml(preview)}</div>
                    </div>
                </div>`;
        }).join('');
    }

    const newSel = (this._section === 'actions' && this._actionIndex === 0);
    const delSel = (this._section === 'actions' && this._actionIndex === 1);

    this._container.innerHTML = `
        <div class="book-spread travel-journal-spread">
            <div class="left-page">
                <div class="page-header-bar">
                    <button class="back-button" id="tj-back">${L.back}</button>
                    <h2 class="title">${escapeHtml(titleText)}</h2>
                </div>
                <textarea id="tj-editor" class="journal-editor" spellcheck="false">${escapeHtml(content)}</textarea>
                <div class="journal-hint">${this._section === 'editor' ? L.editorHint : L.listHint}</div>
            </div>
            <div class="right-page">
                <div class="page-header-bar">
                    <h2 class="title">${L.pages}</h2>
                </div>
                <div class="journal-page-list" id="tj-list">
                    ${listHTML}
                </div>
                <div class="inspect-actions">
                    <button class="inspect-btn${newSel ? ' selected' : ''}" id="tj-new">${L.newPage}</button>
                    <button class="inspect-btn inspect-btn--danger${delSel ? ' selected' : ''}" id="tj-del">${L.deletePage}</button>
                </div>
            </div>
        </div>`;

    this._wireDOM();

    if (this._section === 'editor') {
        // Defer focus so the freshly-built node is in the document.
        setTimeout(() => this.focusEditor(), 0);
    }
};

Scene_TravelJournal.prototype._wireDOM = function () {
    this._editor = this._container.querySelector('#tj-editor');

    const back = this._container.querySelector('#tj-back');
    if (back) back.addEventListener('click', () => this.popScene());

    if (this._editor) {
        this._editor.addEventListener('input', () => {
            Manager.setContent(this._pageIndex, this._editor.value);
            this._updateOpenPagePreview();
        });
        this._editor.addEventListener('focus', () => { this._section = 'editor'; });
        this._editor.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                this.blurEditorToList();
            }
        });
    }

    this._container.querySelectorAll('.journal-page-item').forEach(el => {
        el.addEventListener('click', () => {
            this.openPage(parseInt(el.dataset.index, 10));
        });
    });

    const newBtn = this._container.querySelector('#tj-new');
    if (newBtn) newBtn.addEventListener('click', () => this.createPage());
    const delBtn = this._container.querySelector('#tj-del');
    if (delBtn) delBtn.addEventListener('click', () => this.deleteCurrentPage());
};

// Live-update the right-page title/preview for the open page without a full
// rebuild while the player is typing.
Scene_TravelJournal.prototype._updateOpenPagePreview = function () {
    if (!this._container) return;
    const L = labels();
    const item = this._container.querySelector(`.journal-page-item[data-index="${this._pageIndex}"]`);
    if (!item) return;
    const titleEl   = item.querySelector('.journal-page-title');
    const previewEl = item.querySelector('.journal-page-preview');
    const c = Manager.getContent(this._pageIndex) || '';
    const preview = c.split(/\r?\n/).map(s => s.trim()).find(s => s.length > 0) || L.emptyPreview;
    if (titleEl)   titleEl.textContent   = Manager.titleFor(this._pageIndex);
    if (previewEl) previewEl.textContent = preview;

    const headTitle = this._container.querySelector('.left-page .title');
    if (headTitle) headTitle.textContent = Manager.titleFor(this._pageIndex);
};

Scene_TravelJournal.prototype._updateListHighlight = function () {
    if (!this._container) return;
    this._container.querySelectorAll('.journal-page-item').forEach((el, idx) => {
        el.classList.toggle('selected', this._section === 'list' && idx === this._listIndex);
    });
    const sel = this._container.querySelector('.journal-page-item.selected');
    if (sel) sel.scrollIntoView({ block: 'nearest' });

    const hint = this._container.querySelector('.journal-hint');
    if (hint) hint.textContent = (this._section === 'editor') ? labels().editorHint : labels().listHint;
};

Scene_TravelJournal.prototype._updateActionHighlight = function () {
    if (!this._container) return;
    const newBtn = this._container.querySelector('#tj-new');
    const delBtn = this._container.querySelector('#tj-del');
    if (newBtn) newBtn.classList.toggle('selected', this._section === 'actions' && this._actionIndex === 0);
    if (delBtn) delBtn.classList.toggle('selected', this._section === 'actions' && this._actionIndex === 1);
    this._container.querySelectorAll('.journal-page-item').forEach(el => el.classList.remove('selected'));
};

//=============================================================================
// Input manager
//=============================================================================

const TravelJournalInput = {
    _scene:  null,
    _active: false,

    activate(scene)  { this._scene = scene; this._active = true; },
    deactivate()     { this._active = false; this._scene = null; },

    update() {
        if (!this._active || !this._scene) return;
        const scene = this._scene;

        // 1. While the editor textbox is focused, let it own the keyboard
        //    (keyboard Escape is handled by the textarea's own listener).
        //    A controller B (cancel) still pulls focus back to the list - we
        //    only accept it when it did NOT originate from a keystroke this
        //    frame, so typing letters that RMMZ maps to "cancel" is ignored.
        // The pad's letter sheet owns every press while it is up.
        if (window.Controller && Controller.textEntryOpen && Controller.textEntryOpen()) return;
        if (scene._section === 'editor') {
            // The field has the caret: the keyboard is typing into it.
            if (document.activeElement === scene._editor) {
                if (Input.isTriggered('cancel') &&
                    (performance.now() - (scene._lastKeyTime || 0) > 60)) {
                    scene.blurEditorToList();
                }
                return;
            }
            // The page is only marked (a pad is in hand): Confirm writes on
            // it, Cancel or Right step out to the list of pages.
            if (Input.isTriggered('ok')) {
                if (scene.padTypes()) scene.writeWithPad();
                else scene.focusEditor();
                return;
            }
            if (Input.isTriggered('cancel') || Input.isTriggered('escape') ||
                TouchInput.isCancelled() || Input.isRepeated('right')) {
                scene.blurEditorToList();
            }
            return;
        }
        if (document.activeElement === scene._editor) return;

        const isDown  = Input.isRepeated('down');
        const isUp    = Input.isRepeated('up');
        const isRight = Input.isRepeated('right');
        const isLeft  = Input.isRepeated('left');

        if (isUp || isDown || isLeft || isRight) this.handleMove(scene, { isUp, isDown, isLeft, isRight });
        if (Input.isTriggered('ok')) this.handleOk(scene);
        if (Input.isTriggered('escape') || Input.isTriggered('cancel') || TouchInput.isCancelled()) {
            this.handleCancel(scene);
        }
    },

    handleMove(scene, m) {
        if (scene._section === 'list') {
            const total = Manager.pages().length;
            if (m.isUp && scene._listIndex > 0) {
                scene._listIndex--;
                SoundManager.playCursor();
                scene._updateListHighlight();
            } else if (m.isDown) {
                if (scene._listIndex < total - 1) {
                    scene._listIndex++;
                    SoundManager.playCursor();
                    scene._updateListHighlight();
                } else {
                    // Past the last page -> drop into the action buttons.
                    scene._section     = 'actions';
                    scene._actionIndex = 0;
                    SoundManager.playCursor();
                    scene._updateActionHighlight();
                }
            } else if (m.isLeft) {
                // Jump straight into the editor for the open page.
                scene.focusEditor();
                scene._updateListHighlight();
            }
        } else if (scene._section === 'actions') {
            if (m.isLeft && scene._actionIndex === 1) {
                scene._actionIndex = 0;
                SoundManager.playCursor();
                scene._updateActionHighlight();
            } else if (m.isRight && scene._actionIndex === 0) {
                scene._actionIndex = 1;
                SoundManager.playCursor();
                scene._updateActionHighlight();
            } else if (m.isUp) {
                scene._section = 'list';
                SoundManager.playCursor();
                scene._updateActionHighlight();
                scene._updateListHighlight();
            }
        }
    },

    handleOk(scene) {
        if (scene._section === 'list') {
            scene.openPage(scene._listIndex);
        } else if (scene._section === 'actions') {
            if (scene._actionIndex === 0) scene.createPage();
            else scene.deleteCurrentPage();
        }
    },

    handleCancel(scene) {
        // From the list/actions, cancel closes the journal.
        scene.popScene();
        SoundManager.playCancel();
    }
};

//=============================================================================
// Exports
//=============================================================================

window.Scene_TravelJournal = Scene_TravelJournal;

})();
