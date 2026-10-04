/*:
 * @target MZ
 * @plugindesc Colony sim style Mod Manager. Loads mods from a "mods" folder, overrides files, and manages load order.
 * @author Gemini
 *
 * @help
 * ModManager.js
 * 
 * ============================================================================
 * Overview
 * ============================================================================
 * This plugin allows you to have a "mods" folder in your project root.
 * Inside "mods", each folder is treated as a separate mod.
 * Mods replicate the game's folder structure to override default files
 * or add entirely new ones. ANY file of the game can be replaced this way:
 * data/, js/db/, js/i18n/, img/, audio/, fonts/, css/ and the plugin scripts
 * under js/plugins/ alike. The mod lower in the list wins a file two mods
 * carry. Changes to the list apply at the next start.
 *
 * Example Structure:
 * MyGame/
 *   data/
 *   img/
 *   mods/
 *     MyFirstMod/
 *       data/
 *         Actors.json (Overrides default Actors.json)
 *         CustomData.json (Loaded dynamically into $dataCustom.CustomData)
 *       js/
 *         db/
 *           NPC/
 *             Orientations.json (Overrides js/db/NPC/Orientations.json)
 *       img/
 *         pictures/
 *           new_pic.png (Can be used in game like a normal picture)
 *     AnotherMod/
 *       ...
 *
 * js/main.js loads this plugin before every other one, so its hooks are in
 * place before the first plugin script is requested. Not overridable: this
 * file itself, js/main.js, js/plugins.js and the engine scripts, which have
 * all run by then.
 * 
 * ============================================================================
 * Controls in Mod Manager Menu
 * ============================================================================
 * - Enter/OK: Toggle Mod ON/OFF
 * - Left/Right (or Q/W): Move Mod Up/Down in priority.
 *   (Mods at the BOTTOM of the list load LAST, overwriting mods above them).
 * 
 * NOTE: This plugin requires NW.js (PC/Mac Deployment or Playtest).
 */

var Imported = Imported || {};
Imported.ModManager = true;

var ModManager = ModManager || {};
ModManager.mods = [];
ModManager.fs = null;
ModManager.path = null;
ModManager.basePath = "";

// Global object to store custom added JSONs
window.$dataCustom = {};

//-----------------------------------------------------------------------------
// Core System
//-----------------------------------------------------------------------------

(() => {
    if (!Utils.isNwjs()) {
        console.warn("ModManager: NW.js is required. Mod Manager disabled.");
        return;
    }

    ModManager.fs = require('fs');
    ModManager.path = require('path');

    // Get root directory of the game
    const path = require('path');
    const base = path.dirname(process.mainModule.filename);
    ModManager.basePath = base;
    ModManager.modsDir = path.join(base, 'mods');
    ModManager.configFile = path.join(base, 'mod_config.json');
    ModManager.STEAM_APP_ID = 4193010;

    // Steam Workshop EItemState bit flags (ISteamUGC#EItemState).
    const WS_STATE = { Subscribed: 1, Installed: 4, NeedsUpdate: 8, Downloading: 16, DownloadPending: 32 };

    ModManager.initialize = function () {
        this.ensureModsFolder();
        this.loadModConfig();
        this.scanForNewMods();

        // Initialize Steam and pull in subscribed Workshop mods.
        this.initSteamWorkshop();

        this.saveModConfig(); // Clean up config
    };

    ModManager.initSteamWorkshop = function () {
        try {
            // Reuse a client another plugin already initialised, otherwise create one.
            // steamworks.js caches the native module + a single runCallbacks interval, so
            // a second init() here is safe and does not double-pump callbacks.
            if (window.__hypernetSteamClient) {
                this.steamClient = window.__hypernetSteamClient;
            } else {
                const steamworks = require('../libs/steamworks');
                this.steamClient = steamworks.init(this.STEAM_APP_ID);
                window.__hypernetSteamClient = this.steamClient;
            }

            if (!this.steamClient || !this.steamClient.workshop) {
                console.warn("ModManager: Steam is up but the workshop module is missing. " +
                    "Update js/libs/steamworks to a full steamworks.js build to enable Workshop mods.");  // i18n-ignore  console diagnostic
                this.steamClient = null;
                return;
            }
            this.scanSteamWorkshop();
        } catch (e) {
            console.log("ModManager: Steam not available; Workshop mods disabled.", e && e.message);
            this.steamClient = null;
        }
    };

    ModManager.ensureModsFolder = function () {
        if (!this.fs.existsSync(this.modsDir)) {
            this.fs.mkdirSync(this.modsDir);
        }
    };

    ModManager.loadModConfig = function () {
        if (this.fs.existsSync(this.configFile)) {
            try {
                const data = this.fs.readFileSync(this.configFile, 'utf8');
                this.mods = JSON.parse(data);
            } catch (e) {
                console.error("Failed to load mod config.", e);
                this.mods = [];
            }
        } else {
            this.mods = [];
        }
    };

    ModManager.saveModConfig = function () {
        try {
            this.fs.writeFileSync(this.configFile, JSON.stringify(this.mods, null, 2));
        } catch (e) {
            console.error("Failed to save mod config.", e);
        }
    };

    ModManager.scanForNewMods = function () {
        const folders = this.fs.readdirSync(this.modsDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        // Remove deleted mods from config (only for local mods)
        this.mods = this.mods.filter(mod => mod.path || folders.includes(mod.name));

        // Add new mods to config (default to active: false)
        const existingModNames = this.mods.map(m => m.name);
        for (const folder of folders) {
            if (!existingModNames.includes(folder)) {
                this.mods.push({ name: folder, active: false });
            }
        }
    };

    // Pulls every subscribed Workshop item into the mod list. Installed items are wired
    // up by their absolute content folder; not-yet-downloaded items are queued for
    // download and picked up on a later scan (relaunch or ModManager.refreshWorkshop()).
    ModManager.scanSteamWorkshop = function () {
        if (!this.steamClient) return;
        const workshop = this.steamClient.workshop;
        if (!workshop || typeof workshop.getSubscribedItems !== 'function') {
            console.warn("ModManager: Steam workshop API unavailable.");
            return;
        }

        let itemIds;
        try {
            itemIds = workshop.getSubscribedItems() || [];
        } catch (e) {
            console.error("ModManager: getSubscribedItems failed:", e);
            return;
        }

        const seenNames = [];
        for (const itemId of itemIds) {
            const modName = `Workshop_${itemId.toString()}`;
            seenNames.push(modName);

            let info = null;
            try { info = workshop.installInfo(itemId); } catch (e) { info = null; }

            let state = 0;
            try { if (typeof workshop.state === 'function') state = workshop.state(itemId); } catch (e) { state = 0; }
            const needsUpdate = (state & WS_STATE.NeedsUpdate) !== 0;

            if (info && info.folder && this.fs.existsSync(info.folder)) {
                const existing = this.mods.find(m => m.name === modName);
                if (existing) {
                    existing.path = info.folder;
                    existing.workshop = true;
                    if (typeof existing.active !== 'boolean') existing.active = true;
                } else {
                    // New subscription defaults to active so it loads immediately.
                    this.mods.push({ name: modName, active: true, path: info.folder, workshop: true });
                }
                if (needsUpdate) this.requestWorkshopDownload(itemId, modName, "update available");  // i18n-ignore  console diagnostic
            } else {
                // Subscribed but not on disk yet: request a high-priority download.
                this.requestWorkshopDownload(itemId, modName, "not installed yet");  // i18n-ignore  console diagnostic
            }
        }

        // Drop Workshop mods the player has unsubscribed from (leave local mods alone).
        this.mods = this.mods.filter(m => !m.workshop || seenNames.includes(m.name));
    };

    ModManager.requestWorkshopDownload = function (itemId, modName, reason) {
        const workshop = this.steamClient && this.steamClient.workshop;
        if (!workshop || typeof workshop.download !== 'function') return;
        try {
            workshop.download(itemId, true);
            console.log(`ModManager: Workshop item ${modName} ${reason}; download requested (will load after it finishes).`);
        } catch (e) {
            console.warn(`ModManager: failed to request download for ${modName}:`, e && e.message);
        }
    };

    // Re-scan subscribed Workshop items at runtime (e.g. after a download completes).
    // Returns true if a Steam client is available. Callers should reload data/images
    // afterwards or prompt the player to restart for a clean apply.
    ModManager.refreshWorkshop = function () {
        if (!this.steamClient) return false;
        this.scanSteamWorkshop();
        this.saveModConfig();
        return true;
    };

    // --- Optional: publish a local mod folder to the Steam Workshop -----------------
    // Usage (from console or a plugin command):
    //   await ModManager.publishMod('MyFirstMod', { title: 'My Mod', description: '...', previewPath: 'C:/abs/preview.png', tags: ['Gameplay'] })
    // Returns the new Workshop item id (bigint). Update later with updatePublishedMod().
    ModManager.publishMod = async function (localModName, details) {
        const workshop = this.steamClient && this.steamClient.workshop;
        if (!workshop || typeof workshop.createItem !== 'function') throw new Error("Steam Workshop unavailable");
        const modDir = this.path.join(this.modsDir, localModName);
        if (!this.fs.existsSync(modDir)) throw new Error("Mod folder not found: " + localModName);

        const created = await workshop.createItem(this.STEAM_APP_ID);
        const update = Object.assign({
            title: localModName,
            description: "",
            contentPath: modDir,
            tags: []
        }, details || {});
        await workshop.updateItem(created.itemId, update, this.STEAM_APP_ID);
        console.log("ModManager: published Workshop item", created.itemId.toString(),
            created.needsToAcceptAgreement ? "(user must accept the Workshop legal agreement in the browser popup)" : "");
        return created.itemId;
    };

    ModManager.updatePublishedMod = async function (itemId, localModName, details) {
        const workshop = this.steamClient && this.steamClient.workshop;
        if (!workshop || typeof workshop.updateItem !== 'function') throw new Error("Steam Workshop unavailable");
        const modDir = this.path.join(this.modsDir, localModName);
        if (!this.fs.existsSync(modDir)) throw new Error("Mod folder not found: " + localModName);
        const id = (typeof itemId === 'bigint') ? itemId : BigInt(itemId);
        const update = Object.assign({ contentPath: modDir }, details || {});
        return workshop.updateItem(id, update, this.STEAM_APP_ID);
    };

    //-----------------------------------------------------------------------------
    // The mod file index
    //-----------------------------------------------------------------------------
    //
    // A mod is a copy of the game's own folder tree holding only the files it
    // changes or adds: mods/<Mod>/js/db/NPC/Orientations.json stands in for
    // js/db/NPC/Orientations.json, mods/<Mod>/img/faces/New.png is a face the
    // game never shipped. Any file can be replaced that way, data, js/db, img,
    // audio, fonts, css and the plugins themselves.
    //
    // The index is built once, at boot, from the active mods in load order, so
    // the mod lower in the list wins a file two of them carry. Toggling or
    // reordering takes effect at the next start: a plugin that has already run
    // and a JSON that has already been parsed cannot be swapped under the game.
    //
    // Every way the game reads a file asks the index, one hook each: XHR and
    // fetch, the fs calls, Bitmap and WebAudio (through AssetCaseResolver, which
    // owns those two and knows about encrypted builds), the src and href of
    // elements, and asset urls written into markup and styles. Plugin scripts
    // are covered because js/main.js runs this file before any plugin is asked
    // for. With no active mod nothing is hooked at all.

    // Top level folders a mod cannot stand in for: its own siblings and the
    // player's saves.
    const SKIP_ROOTS = { mods: true, save: true };  // i18n-ignore  folder names
    // The engine's encrypted twin of an asset, "<name>.png_".
    const ENCRYPTED_EXT = /\.(png|jpe?g|ogg|m4a)_$/i;
    // Roots whose files never appear inside markup or a style, so the text
    // rewrite need not look for them.
    const NON_DOC_ROOTS = { data: true, js: true };  // i18n-ignore  folder names
    const MIME = {
        json: 'application/json', txt: 'text/plain', csv: 'text/csv', js: 'text/javascript',  // i18n-ignore  mime types
        css: 'text/css', html: 'text/html', png: 'image/png', jpg: 'image/jpeg',  // i18n-ignore  mime types
        jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',  // i18n-ignore  mime types
        ogg: 'audio/ogg', m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav',  // i18n-ignore  mime types
        woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf'  // i18n-ignore  mime types
    };

    ModManager.files = Object.create(null);      // "img/faces/A.png" -> entry
    ModManager.filesLower = Object.create(null); // lower-cased key -> key
    ModManager.dirs = Object.create(null);       // "img/faces" -> { file: abs, names: {} }

    function encodePath(rel) {
        return rel.split('/').map(encodeURIComponent).join('/');
    }

    function fileUrl(abs) {
        const slashed = abs.replace(/\\/g, '/').replace(/^\/+/, '');
        return 'file:///' + encodeURI(slashed).replace(/#/g, '%23').replace(/\?/g, '%3F');  // i18n-ignore  url scheme
    }

    ModManager.modRoot = function (mod) {
        return mod.path || this.path.join(this.modsDir, mod.name);
    };

    ModManager.buildFileIndex = function () {
        const fs = this.fs, path = this.path;
        const files = Object.create(null);
        const lower = Object.create(null);
        const dirs = Object.create(null);
        const addName = (relDir, name, abs) => {
            const d = dirs[relDir] || (dirs[relDir] = { file: abs, names: Object.create(null) });
            d.names[name] = true;
        };
        const put = (key, entry) => {
            files[key] = entry;
            lower[key.toLowerCase()] = key;
        };

        for (const mod of this.mods) {
            if (!mod.active) continue;
            const root = this.modRoot(mod);
            const walk = (absDir, relDir) => {
                let names;
                try { names = fs.readdirSync(absDir); } catch (e) { return; }
                for (const listed of names) {
                    if (listed.charAt(0) === '.') continue;
                    if (!relDir && SKIP_ROOTS[listed.toLowerCase()]) continue;
                    // lstat is the one call an encrypted build's decrypt shim
                    // leaves alone, and that shim lists "x.png_" as "x.png", so
                    // the real name on disk is asked for here rather than trusted.
                    let raw = listed, abs = path.join(absDir, listed), st = null;
                    try { st = fs.lstatSync(abs); } catch (e) {
                        try { st = fs.lstatSync(abs + '_'); raw += '_'; abs += '_'; } catch (e2) { continue; }
                    }
                    if (st.isDirectory()) {
                        const sub = relDir ? relDir + '/' + raw : raw;
                        addName(relDir, raw, absDir);
                        if (!dirs[sub]) dirs[sub] = { file: abs, names: Object.create(null) };
                        walk(abs, sub);
                        continue;
                    }
                    const key = relDir ? relDir + '/' + raw : raw;
                    const local = mod.path ? null : 'mods/' + encodePath(mod.name) + '/' + encodePath(key);  // i18n-ignore  asset path
                    put(key, { mod: mod.name, file: abs, url: local || fileUrl(abs), encrypted: false });
                    addName(relDir, raw, absDir);
                    if (ENCRYPTED_EXT.test(raw)) {
                        // The plain name is what the engine asks for; it adds
                        // the "_" itself once told the bytes are encrypted.
                        const plain = key.slice(0, -1);
                        if (!files[plain] || files[plain].mod !== mod.name) {
                            put(plain, {
                                mod: mod.name, file: abs, encrypted: true,
                                url: local ? local.slice(0, -1) : fileUrl(abs).slice(0, -1)
                            });
                        }
                    }
                }
            };
            walk(root, '');
        }

        this.files = files;
        this.filesLower = lower;
        this.dirs = dirs;
        this._docRegex = undefined;
        const count = Object.keys(files).length;
        if (count) console.log(`ModManager: ${count} game files overridden or added by mods.`);
        return count;
    };

    ModManager.hasFiles = function () {
        return Object.keys(this.files).length > 0;
    };

    // A game-relative path ("js/db/NPC/Orientations.json") as the index keys it:
    // decoded, "." and ".." folded, forward slashes. null for anything that
    // cannot be a game file a mod may replace.
    ModManager.normalizeRel = function (rel) {
        if (typeof rel !== 'string') return null;
        const out = [];
        for (const part of rel.replace(/\\/g, '/').split('/')) {
            if (!part || part === '.') continue;
            if (part === '..') {
                if (!out.length) return null;
                out.pop();
                continue;
            }
            let decoded = part;
            try { decoded = decodeURIComponent(part); } catch (e) { /* malformed escape: keep it raw */ }
            out.push(decoded);
        }
        if (!out.length || SKIP_ROOTS[out[0].toLowerCase()]) return null;
        return out.join('/');
    };

    // The index entry standing in for a game-relative path, or null. A url
    // differing only in case still finds it, the way AssetCaseResolver lets the
    // game's own assets be found.
    ModManager.entryFor = function (rel) {
        const key = this.normalizeRel(rel);
        if (key === null) return null;
        if (this.files[key]) return this.files[key];
        const real = this.filesLower[key.toLowerCase()];
        return real ? this.files[real] : null;
    };

    // The folder this page lives in, which a relative url is resolved against.
    let pageBase = null;
    function pageBaseUrl() {
        if (pageBase === null) {
            try {
                const here = (typeof document !== 'undefined' && document.baseURI) || location.href;
                pageBase = here.slice(0, here.lastIndexOf('/') + 1);
            } catch (e) {
                pageBase = '';
            }
        }
        return pageBase;
    }

    // Splits a url into the game-relative path it names, the prefix it was
    // written with (the page folder, for an absolute one) and its ?query#hash.
    // null when it names nothing in the game folder.
    ModManager.parseUrl = function (url) {
        if (typeof url !== 'string' || !url) return null;
        let s = url, tail = '', prefix = '';
        const cut = s.search(/[?#]/);
        if (cut >= 0) { tail = s.slice(cut); s = s.slice(0, cut); }
        const base = pageBaseUrl();
        if (base && s.indexOf(base) === 0) {
            prefix = base;
            s = s.slice(base.length);
        } else if (/^file:/i.test(s)) {
            let abs;
            try { abs = decodeURIComponent(s.replace(/^file:\/*/i, process.platform === 'win32' ? '' : '/')); } catch (e) { return null; }  // i18n-ignore  platform id
            const rel = this.relFromFs(abs);
            if (rel === null) return null;
            return { rel: rel, prefix: null, tail: tail };
        } else if (/^[a-z][a-z0-9+.-]*:/i.test(s) || s.indexOf('//') === 0) {
            return null;
        }
        return { rel: s, prefix: prefix, tail: tail };
    };

    function urlOf(entry, parsed) {
        if (/^file:/i.test(entry.url)) return entry.url + parsed.tail;
        if (parsed.prefix === null) return fileUrl(entry.file) + parsed.tail;
        return parsed.prefix + entry.url + parsed.tail;
    }

    // The url a request for `url` should go to instead, or null to leave it be.
    // An encrypted-only mod file is left to the engine's own loaders, which are
    // the ones that know to decrypt it (see assetFor).
    ModManager.redirectUrl = function (url) {
        const parsed = this.parseUrl(url);
        if (!parsed) return null;
        const entry = this.entryFor(parsed.rel);
        if (!entry || entry.encrypted) return null;
        return urlOf(entry, parsed);
    };

    // The url an element or a style should show for `url`: redirectUrl, plus
    // an encrypted mod file, which no element can decrypt for itself. In an
    // encrypted build js/asset_decrypt.js decrypts it into a blob url; left
    // alone, the bridge would have handed over the BASE game's copy of the
    // same name instead of the mod's.
    ModManager.docUrl = function (url) {
        const parsed = this.parseUrl(url);
        if (!parsed) return null;
        const entry = this.entryFor(parsed.rel);
        if (!entry) return null;
        if (!entry.encrypted) return urlOf(entry, parsed);
        const bridge = typeof window !== 'undefined' && window.AssetDecrypt;
        return bridge && typeof bridge.fileUrl === 'function' ? bridge.fileUrl(entry.file) : null;
    };

    // For Bitmap and WebAudio (AssetCaseResolver): the mod url to load and
    // whether its bytes are encrypted. Asked per file because a mod ships plain
    // files whatever the build it is dropped into says about its own.
    ModManager.assetFor = function (url) {
        const parsed = this.parseUrl(url);
        if (!parsed) return null;
        const entry = this.entryFor(parsed.rel);
        return entry ? { url: urlOf(entry, parsed), encrypted: entry.encrypted } : null;
    };

    // A file system path as a game-relative one, or null when it lies outside
    // the game folder.
    ModManager.relFromFs = function (target) {
        if (typeof target !== 'string' || !target) return null;
        const rel = this.path.relative(this.basePath, this.path.resolve(target));
        if (rel === '' || rel.indexOf('..') === 0 || this.path.isAbsolute(rel)) return null;
        return this.normalizeRel(rel.split(this.path.sep).join('/'));
    };

    // The real path a file system call on `target` should touch: the mod's
    // file, a folder only a mod has, or `target` itself.
    ModManager.fsTarget = function (target) {
        const rel = this.relFromFs(target);
        if (rel === null) return target;
        const entry = this.files[rel];
        if (entry) {
            // An encrypted mod file read by its plain name is handed to
            // js/asset_decrypt.js under that plain name next to the twin, so
            // the read comes back decrypted the way the base game's does.
            // Without the bridge (a plain build) there is nobody to decrypt
            // it, and the raw file is all there is.
            const bridge = typeof window !== 'undefined' && window.AssetDecrypt;
            if (entry.encrypted && bridge) return entry.file.slice(0, -1);
            return entry.file;
        }
        const dir = this.dirs[rel];
        if (dir && !(origFs.existsSync || this.fs.existsSync)(target)) return dir.file;
        return target;
    };

    //-----------------------------------------------------------------------------
    // The hooks
    //-----------------------------------------------------------------------------

    // The unhooked fs calls, so the hooks can ask the disk itself.
    const origFs = {};

    ModManager.installFsHooks = function () {
        const fs = this.fs;
        const self = this;
        for (const name of Object.keys(fs)) {
            if (typeof fs[name] === 'function') origFs[name] = fs[name];
        }

        // Calls whose first argument is the path read.
        const PATH_FIRST = [
            'readFileSync', 'readFile', 'existsSync', 'exists', 'statSync', 'stat',  // i18n-ignore  fs api
            'lstatSync', 'lstat', 'accessSync', 'access', 'openSync', 'open',  // i18n-ignore  fs api
            'createReadStream'  // i18n-ignore  fs api
        ];
        for (const name of PATH_FIRST) {
            const orig = fs[name];
            if (typeof orig !== 'function') continue;
            fs[name] = function (target) {
                const args = Array.prototype.slice.call(arguments);
                // Only a read may be redirected: a write lands where it was
                // aimed.
                if (name.indexOf('open') === 0 && !isReadFlag(args[1])) return orig.apply(this, args);
                args[0] = self.fsTarget(target);
                return orig.apply(this, args);
            };
        }

        const mergeNames = (target, entries, options) => {
            const rel = target === self.basePath ? '' : self.relFromFs(target);
            const dir = rel === null ? null : self.dirs[rel];
            if (!dir || !Array.isArray(entries)) return entries;
            const dirents = !!(options && typeof options === 'object' && options.withFileTypes);  // i18n-ignore  fs option
            const have = new Set(entries.map(e => (dirents ? e.name : String(e))));
            for (const name of Object.keys(dir.names)) {
                // Listed by the plain name, the way the decrypt bridge lists
                // the game's own encrypted twins and the way every loader asks
                // for it ("x.png", never "x.png_").
                const shown = ENCRYPTED_EXT.test(name) ? name.slice(0, -1) : name;
                if (have.has(shown)) continue;
                have.add(shown);
                if (!dirents) { entries.push(shown); continue; }
                const isDir = !!self.dirs[rel ? rel + '/' + shown : shown];
                entries.push({
                    name: shown,
                    isFile: () => !isDir, isDirectory: () => isDir, isSymbolicLink: () => false,
                    isBlockDevice: () => false, isCharacterDevice: () => false,
                    isFIFO: () => false, isSocket: () => false
                });
            }
            return entries;
        };

        const readdirSync = fs.readdirSync;
        fs.readdirSync = function (target, options) {
            let entries;
            try {
                entries = readdirSync.apply(this, arguments);
            } catch (e) {
                const rel = self.relFromFs(target);
                if (rel === null || !self.dirs[rel]) throw e;
                entries = [];
            }
            return mergeNames(target, entries, options);
        };

        const readdir = fs.readdir;
        fs.readdir = function (target) {
            const args = Array.prototype.slice.call(arguments);
            const callback = args[args.length - 1];
            const options = args.length > 2 ? args[1] : null;
            if (typeof callback === 'function') {
                args[args.length - 1] = function (err, entries) {
                    if (err) {
                        const rel = self.relFromFs(target);
                        if (rel === null || !self.dirs[rel]) return callback(err, entries);
                        entries = [];
                    }
                    callback(null, mergeNames(target, entries, options));
                };
            }
            return readdir.apply(this, args);
        };

        if (fs.promises) {
            const promises = fs.promises;
            for (const name of ['readFile', 'stat', 'lstat', 'access']) {  // i18n-ignore  fs api
                const orig = promises[name];
                if (typeof orig !== 'function') continue;
                promises[name] = function (target) {
                    const args = Array.prototype.slice.call(arguments);
                    args[0] = self.fsTarget(target);
                    return orig.apply(this, args);
                };
            }
            const pReaddir = promises.readdir;
            if (typeof pReaddir === 'function') {
                promises.readdir = function (target, options) {
                    return pReaddir.apply(this, arguments).catch(err => {
                        const rel = self.relFromFs(target);
                        if (rel === null || !self.dirs[rel]) throw err;
                        return [];
                    }).then(entries => mergeNames(target, entries, options));
                };
            }
        }
    };

    function isReadFlag(flags) {
        return flags === undefined || flags === null || flags === 'r' || flags === 'rs' ||  // i18n-ignore  fs flags
            flags === 0 || (typeof flags === 'object' && isReadFlag(flags.flags));
    }

    ModManager.installRequestHooks = function () {
        const self = this;

        if (typeof XMLHttpRequest !== 'undefined') {
            const open = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function (method, url) {
                const to = self.redirectUrl(url);
                if (!to) return open.apply(this, arguments);
                const args = Array.prototype.slice.call(arguments);
                args[1] = to;
                return open.apply(this, args);
            };
        }

        // fetch cannot read file: urls, which is where a Workshop mod lives, so
        // a modded file is answered straight off the disk instead.
        if (typeof fetch === 'function' && typeof Response === 'function') {
            const fetchOrig = window.fetch;
            window.fetch = function (input, init) {
                const url = typeof input === 'string' ? input : (input && typeof input.url === 'string' ? input.url : null);
                const parsed = url ? self.parseUrl(url) : null;
                const entry = parsed ? self.entryFor(parsed.rel) : null;
                if (!entry || entry.encrypted) return fetchOrig.apply(this, arguments);
                const ext = entry.file.slice(entry.file.lastIndexOf('.') + 1).toLowerCase();
                return self.fs.promises.readFile(entry.file).then(buf => new Response(new Uint8Array(buf), {
                    status: 200,
                    headers: { 'Content-Type': MIME[ext] || 'application/octet-stream' }  // i18n-ignore  http header
                }));
            };
        }
    };

    // Asset urls inside markup and styles: url(img/x.png), src="img/x.png",
    // written relative to the page or absolute under its folder.
    ModManager.docRegex = function () {
        if (this._docRegex !== undefined) return this._docRegex;
        const roots = Object.keys((this.dirs[''] && this.dirs[''].names) || {})
            .filter(r => this.dirs[r] && !NON_DOC_ROOTS[r.toLowerCase()])
            .map(r => r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        if (!roots.length) return (this._docRegex = null);
        const base = pageBaseUrl().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        this._docRegex = new RegExp(
            '(?<![A-Za-z0-9_.\\-/:])(' + (base ? base : '(?!)') + ')?' +
            '((?:' + roots.join('|') + ')/[^"\'()<>\\\\?#\\s]+?\\.[A-Za-z0-9]+)(?![A-Za-z0-9_])', 'gi');
        return this._docRegex;
    };

    ModManager.rewriteDoc = function (text) {
        if (typeof text !== 'string' || text.indexOf('/') < 0) return text;
        const re = this.docRegex();
        if (!re) return text;
        re.lastIndex = 0;
        return text.replace(re, (all, base, rel) => this.docUrl((base || '') + rel) || all);
    };

    ModManager.installDomHooks = function () {
        if (typeof Element === 'undefined') return;
        const self = this;
        const asUrl = value => (typeof value === 'string' ? (self.docUrl(value) || value) : value);
        const asDoc = value => self.rewriteDoc(value);

        const patchSetter = (proto, prop, transform) => {
            const desc = proto && Object.getOwnPropertyDescriptor(proto, prop);
            if (!desc || !desc.set) return false;
            const setter = desc.set;
            Object.defineProperty(proto, prop, {
                get: desc.get,
                set: function (value) { setter.call(this, transform.call(this, value)); },
                configurable: true,
                enumerable: desc.enumerable
            });
            return true;
        };

        // Plugin scripts first: PluginManager.loadScript sets script.src.
        patchSetter(window.HTMLScriptElement && HTMLScriptElement.prototype, 'src', asUrl);
        patchSetter(window.HTMLImageElement && HTMLImageElement.prototype, 'src', asUrl);
        patchSetter(window.HTMLMediaElement && HTMLMediaElement.prototype, 'src', asUrl);
        patchSetter(window.HTMLSourceElement && HTMLSourceElement.prototype, 'src', asUrl);
        patchSetter(window.HTMLLinkElement && HTMLLinkElement.prototype, 'href', asUrl);

        if (!this.docRegex()) return;
        patchSetter(Element.prototype, 'innerHTML', asDoc);
        patchSetter(Element.prototype, 'outerHTML', asDoc);
        const insertAdjacentHTML = Element.prototype.insertAdjacentHTML;
        Element.prototype.insertAdjacentHTML = function (position, html) {
            return insertAdjacentHTML.call(this, position, asDoc(html));
        };

        const setAttribute = Element.prototype.setAttribute;
        Element.prototype.setAttribute = function (name, value) {
            const attr = String(name).toLowerCase();
            if (attr === 'src' || attr === 'href') value = asUrl(value);  // i18n-ignore  attribute names
            else if (attr === 'style') value = asDoc(value);  // i18n-ignore  attribute name
            return setAttribute.call(this, name, value);
        };

        if (typeof CSSStyleDeclaration === 'undefined') return;
        const style = CSSStyleDeclaration.prototype;
        const setProperty = style.setProperty;
        style.setProperty = function (name, value, priority) {
            return setProperty.call(this, name, asDoc(value), priority);
        };
        // Camel-cased style properties are served by an interceptor with no
        // descriptor to wrap (see tools/build/asset_decrypt.js, which defines
        // the same accessors in an encrypted build: then they are wrapped).
        const STYLE_PROPS = [
            'cssText', 'background', 'backgroundImage', 'borderImage', 'borderImageSource',  // i18n-ignore  css props
            'listStyleImage', 'maskImage', 'webkitMaskImage', 'content', 'cursor'  // i18n-ignore  css props
        ];
        for (const prop of STYLE_PROPS) {
            if (patchSetter(style, prop, asDoc) || prop === 'cssText') continue;  // i18n-ignore  css prop
            const css = prop.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^webkit-/, '-webkit-');  // i18n-ignore  css prefix
            Object.defineProperty(style, prop, {
                configurable: true,
                enumerable: false,
                get: function () { return this.getPropertyValue(css); },
                set: function (value) {
                    let text = value === null || value === undefined ? '' : String(value);
                    let priority = '';
                    const important = /^([\s\S]*?)\s*!\s*important\s*$/i.exec(text);
                    if (important) { text = important[1]; priority = 'important'; }  // i18n-ignore  css priority
                    this.setProperty(css, text, priority);
                }
            });
        }
    };

    ModManager.installHooks = function () {
        if (!this.hasFiles()) return false;
        this.installFsHooks();
        this.installRequestHooks();
        this.installDomHooks();
        return true;
    };

    // Kept for callers of the old API: the url a game path loads from.
    ModManager.resolvePath = function (localPath) {
        return this.redirectUrl(localPath) || localPath;
    };

    // Load custom JSONs dynamically
    ModManager.loadCustomData = function () {
        for (const mod of this.mods) {
            if (!mod.active) continue;

            const modDataDir = mod.path ? this.path.join(mod.path, 'data') : this.path.join(this.modsDir, mod.name, 'data');
            if (this.fs.existsSync(modDataDir)) {
                const files = this.fs.readdirSync(modDataDir).filter(f => f.endsWith('.json'));

                for (const file of files) {
                    const baseName = file.replace('.json', '');
                    // i18n-ignore-start  RPG Maker data file names, matched literally
                    const standardMZFiles = [
                        "Actors", "Classes", "Skills", "Items", "Weapons", "Armors",
                        "Enemies", "Troops", "States", "Animations", "Tilesets",
                        "CommonEvents", "System", "MapInfos"
                    ];
                    // i18n-ignore-end

                    // If it's NOT a standard RM file, load it custom
                    if (!standardMZFiles.includes(baseName) && !baseName.startsWith("Map")) {  // i18n-ignore  data file prefix
                        const url = mod.path ? "file:///" + this.path.join(modDataDir, file).replace(/\\/g, "/") : `mods/${mod.name}/data/${file}`;  // i18n-ignore  asset path
                        this.loadCustomDataFile(baseName, url);
                    }
                }
            }
        }
    };

    ModManager.loadCustomDataFile = function (name, src) {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", src);
        xhr.overrideMimeType("application/json");
        xhr.onload = () => {
            if (xhr.status < 400) {
                try {
                    $dataCustom[name] = JSON.parse(xhr.responseText);
                    console.log(`Loaded custom mod data: ${name}`);
                } catch (e) {
                    console.warn(`ModManager: failed to parse custom mod data '${name}', skipping.`, e);
                }
            }
        };
        xhr.send();
    };

    // Initialize the manager immediately, then point every file read at the
    // mods. js/main.js loads this file ahead of every other plugin, so the
    // hooks are in place before the first plugin script is even requested.
    ModManager.initialize();
    ModManager.buildFileIndex();
    ModManager.installHooks();

    // Non-standard JSONs in a mod's data/ folder land in $dataCustom once the
    // main database has loaded.
    const _DataManager_loadDatabase = DataManager.loadDatabase;
    DataManager.loadDatabase = function () {
        _DataManager_loadDatabase.call(this);
        ModManager.loadCustomData();
    };

    //-----------------------------------------------------------------------------
    // Title Menu Integration & UI
    //-----------------------------------------------------------------------------

    const _Window_TitleCommand_makeCommandList = Window_TitleCommand.prototype.makeCommandList;
    Window_TitleCommand.prototype.makeCommandList = function () {
        _Window_TitleCommand_makeCommandList.call(this);
        this.addCommand(T('ModManager.menu'), 'mods');
    };

    const _Scene_Title_createCommandWindow = Scene_Title.prototype.createCommandWindow;
    Scene_Title.prototype.createCommandWindow = function () {
        _Scene_Title_createCommandWindow.call(this);
        this._commandWindow.setHandler('mods', this.commandMods.bind(this));
    };

    Scene_Title.prototype.commandMods = function () {
        this._commandWindow.close();
        SceneManager.push(window.Scene_ModManager);
    };

})();