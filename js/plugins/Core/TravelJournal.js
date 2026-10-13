/*:
* @plugindesc v2.0 Travel Journal - multi-page notebook saved as TXT files per save slot. (Logic)
* @author Omni-Lex
* @target MZ
* @url https://nocoldiz.itch.io/hypernet-explorer
*
* @command openTravelJournal
* @text Open Travel Journal
* @desc Opens the travel journal (multi-page text editor).
*
* @command openTextInput
* @text Open Text Input (legacy)
* @desc Backward-compatible alias that opens the travel journal.
*
* @help
* ==========================================================================
* Travel Journal Plugin (Logic)
* ==========================================================================
*
* A parchment-pockets notebook the player carries across the world. The right
* page lists every journal page, the left page is a textbox you type into to
* edit the selected page.
*
* Pages live in the savegame and are copied to disk as plain TXT files, one
* file per page, with the current save-slot number baked into the filename
* (the copy is written, never read back):
*
*     save/journal/journal_slot<N>_page<index>.txt
*
* This file contains ONLY business logic and data management. The DOM/scene UI
* lives in TravelJournalUI.js, which must load AFTER this file.
*
* Script Calls:
* -------------
* TravelJournalManager.open();   // open the journal
* TextInputManager.open();       // legacy alias, same thing
*
*/

(() => {
'use strict';

const pluginName = "TravelJournal";

//=============================================================================
// Node fs/path (NW.js). Falls back to $gameSystem storage in the browser.
//=============================================================================

const fs   = (typeof require !== 'undefined') ? require('fs')   : null;
const path = (typeof require !== 'undefined') ? require('path') : null;

//=============================================================================
// Localization
//=============================================================================



//=============================================================================
// TravelJournalManager - data + persistence
//=============================================================================

const TravelJournalManager = {
    _pages: null,   // array of content strings for the active slot
    _slot:  null,   // slot the cached pages belong to

    // ---- Save-slot helpers -------------------------------------------------

    getSlot() {
        if (typeof $gameSystem !== 'undefined' && $gameSystem && $gameSystem.savefileId) {
            return $gameSystem.savefileId() || 1;
        }
        return 1;
    },

    _dir() {
        if (!fs || !path) return null;
        const base = path.dirname(process.mainModule.filename);
        const dir = path.join(base, 'save', 'journal');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        return dir;
    },

    _fileName(slot, index) {
        return `journal_slot${slot}_page${index}.txt`;
    },

    _prefix(slot) {
        return `journal_slot${slot}_page`;  // i18n-ignore  save key
    },

    // ---- Load / persist ----------------------------------------------------

    // The pages are read out of the savegame, never off the TXT files. A slot
    // number is reused: a new playthrough bound to the slot of a deleted or
    // overwritten save would otherwise open that old run's notebook, and a
    // session not bound to a slot yet (getSlot falls back to 1) would read and
    // then overwrite slot 1's. Everything in $gameSystem belongs to this run,
    // so its mirror is the only source; the TXT files are its readable copy.
    load() {
        const slot = this.getSlot();
        this._slot  = slot;
        this._pages = [];

        const store = (typeof $gameSystem !== 'undefined' && $gameSystem && $gameSystem._travelJournal) || {};
        let arr = store[slot];
        // Pages written before this run was bound to its slot sit under the
        // slot number it had then: still this run's notebook.
        if (!Array.isArray(arr)) {
            const other = Object.keys(store).map(k => store[k]).filter(Array.isArray);
            arr = other.length ? other[other.length - 1] : null;
        }
        if (Array.isArray(arr)) this._pages = arr.map(p => String(p == null ? '' : p));

        if (this._pages.length === 0) this._pages.push('');
        return this._pages;
    },

    persist() {
        const slot  = this._slot != null ? this._slot : this.getSlot();
        const pages = this._pages || [''];

        const dir = this._dir();
        if (dir) {
            // Clear stale page files for this slot, then rewrite from memory so
            // deletions and reorders stay consistent on disk.
            const prefix = this._prefix(slot);
            for (const f of fs.readdirSync(dir)) {
                if (f.startsWith(prefix) && f.endsWith('.txt')) {
                    try { fs.unlinkSync(path.join(dir, f)); } catch (e) { /* ignore */ }
                }
            }
            pages.forEach((content, i) => {
                try {
                    fs.writeFileSync(path.join(dir, this._fileName(slot, i)), content, 'utf8');
                } catch (e) { /* ignore */ }
            });
        }

        // Always mirror into the save state so journals travel with the slot
        // even when disk access is unavailable (web build).
        if (typeof $gameSystem !== 'undefined' && $gameSystem) {
            if (!$gameSystem._travelJournal) $gameSystem._travelJournal = {};
            $gameSystem._travelJournal[slot] = pages.slice();
        }
    },

    // ---- Page access -------------------------------------------------------

    pages() {
        if (this._pages === null || this._slot !== this.getSlot()) this.load();
        return this._pages;
    },

    getContent(index) {
        const p = this.pages();
        return (index >= 0 && index < p.length) ? p[index] : '';
    },

    setContent(index, text) {
        const p = this.pages();
        if (index >= 0 && index < p.length) p[index] = String(text);
    },

    addPage() {
        const p = this.pages();
        p.push('');
        this.persist();
        return p.length - 1;
    },

    deletePage(index) {
        const p = this.pages();
        if (index >= 0 && index < p.length) {
            p.splice(index, 1);
            if (p.length === 0) p.push('');
            this.persist();
        }
    },

    // Derive a short page title from its first non-empty line.
    titleFor(index) {
        const content = this.getContent(index) || '';
        const firstLine = content.split(/\r?\n/).map(s => s.trim()).find(s => s.length > 0);
        if (!firstLine) return `${T('TravelJournal.emptyPage')} ${index + 1}`;
        return firstLine.length > 26 ? firstLine.slice(0, 26) + '…' : firstLine;
    },

    // ---- Open the journal --------------------------------------------------

    open() {
        if (!window.Scene_TravelJournal) {
            console.error('TravelJournal: Scene_TravelJournal missing. Is TravelJournalUI.js loaded?');
            return;
        }
        this.load();
        SceneManager.push(window.Scene_TravelJournal);
    }
};

//=============================================================================
// Exports
//=============================================================================

window.TravelJournalManager = TravelJournalManager;
Object.defineProperty(window, 'TravelJournalI18n', {
    get() { return T.obj('TravelJournal'); },
    configurable: true,
});

// Backward-compatible alias for existing scripts / events that used the old
// TextInputWindow plugin (e.g. the "Notebook" common event).
window.TextInputManager = window.TextInputManager || {
    open() { TravelJournalManager.open(); }
};

//=============================================================================
// Plugin Commands
//=============================================================================

PluginManager.registerCommand(pluginName, "openTravelJournal", () => {
    TravelJournalManager.open();
});

PluginManager.registerCommand(pluginName, "openTextInput", () => {
    TravelJournalManager.open();
});

// Legacy command name: events still reference "Core/TextInputWindow" which
// resolves to the file name "TextInputWindow".
PluginManager.registerCommand("TextInputWindow", "openTextInput", () => {
    TravelJournalManager.open();
});

})();
