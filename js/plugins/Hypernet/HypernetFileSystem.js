/*:
 * @target MZ
 * @plugindesc v1.0.0 Simulated Virtual File System (VFS) and Registry Manager for HypernetOS.
 * @author Omni-Lex
 * 
 * @help
 * HypernetFileSystem.js
 * 
 * Exposes:
 * - window.HypernetFileSystem.resolvePath(path)
 * - window.HypernetFileSystem.readDir(path)
 * - window.HypernetFileSystem.readFile(path)
 * - window.HypernetFileSystem.writeFile(path, content, mime)
 * - window.HypernetFileSystem.deleteFile(path)
 * - window.HypernetFileSystem.getRegistry(key, defaultValue)
 * - window.HypernetFileSystem.setRegistry(key, value)
 * 
 * Natively persists inside RPG Maker MZ save files via $gameSystem.
 */

(() => {
    'use strict';

    // Hook Game_System to auto-initialize OS data on new game
    const _Game_System_initialize = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function() {
        _Game_System_initialize.call(this);
        this.initHypernetOSData();
    };

    Game_System.prototype.initHypernetOSData = function() {
        if (!this._hypernetVFS) {
            this._hypernetVFS = {
                // i18n-ignore-start  VFS path keys, matched literally
                "C:": {
                    type: "directory",
                    name: "C:",
                    children: {
                        "Desktop": {
                            type: "directory",
                            name: "Desktop",
                            children: {}
                        },
                        "Documents": {
                            type: "directory",
                            name: "Documents",
                            children: {
                                "welcome.txt": {
                                    type: "file",
                                    name: "welcome.txt",
                                    mime: "txt",
                                    content: T('HypernetFS.welcomeTxt')
                                },
                                "pockets.txt": {
                                    type: "file",
                                    name: "pockets.txt",
                                    mime: "txt",
                                    content: T('HypernetFS.pocketsTxt')
                                },
                                "diary.txt": {
                                    type: "file",
                                    name: "diary.txt",
                                    mime: "txt",
                                    content: T('HypernetFS.diaryTxt')
                                }
                            }
                        },
                        "System": {
                            type: "directory",
                            name: "System",
                            children: {}
                        }
                        // i18n-ignore-end
                    }
                }
            };
        }
        if (!this._hypernetRegistry) {
            this._hypernetRegistry = {
                "wallpaper": "bliss",
                "theme": "luna-blue"
            };
        }
    };

    window.HypernetFileSystem = {
        getVFS: function() {
            if (typeof $gameSystem !== 'undefined') {
                if (!$gameSystem._hypernetVFS || !$gameSystem._hypernetRegistry) {
                    $gameSystem.initHypernetOSData();
                }
                return $gameSystem._hypernetVFS;
            }
            return null;
        },

        getRegistry: function(key, defaultValue) {
            if (typeof $gameSystem !== 'undefined') {
                if (!$gameSystem._hypernetRegistry) {
                    $gameSystem.initHypernetOSData();
                }
                return $gameSystem._hypernetRegistry[key] !== undefined ? $gameSystem._hypernetRegistry[key] : defaultValue;
            }
            return defaultValue;
        },

        setRegistry: function(key, value) {
            if (typeof $gameSystem !== 'undefined') {
                if (!$gameSystem._hypernetRegistry) {
                    $gameSystem.initHypernetOSData();
                }
                $gameSystem._hypernetRegistry[key] = value;
                
                // If desktop exists, apply visual wallpaper update in real-time
                const desktop = document.getElementById('hypernet-os-desktop');
                if (desktop && key === 'wallpaper') {
                    this.applyWallpaperStyle(desktop, value);
                    // The style reset above drops the position too.
                    if (window.HypernetOS && window.HypernetOS.XP) window.HypernetOS.XP.applyWallpaperPosition();
                }
                return true;
            }
            return false;
        },

        applyWallpaperStyle: function(element, wallpaper) {
            if (!element) return;
            element.style.background = ''; // reset inline
            element.className = ''; // reset classes
            
            if (wallpaper === 'bliss') {
                element.style.background = 'linear-gradient(to bottom, #1e5288 0%, var(--xp-blue-med) 40%, var(--xp-anchor-hover) 55%, #66b539 56%, #3a7c1b 100%)';
            } else if (wallpaper === 'teal') {
                element.style.background = '#008080';
            } else if (wallpaper === 'space') {
                element.style.background = 'radial-gradient(ellipse at bottom, #1b2735 0%, #090a0f 100%)';
            } else if (wallpaper === 'gold') {
                element.style.background = 'linear-gradient(135deg, #1f1a16 0%, #3d2f25 100%)';
                element.style.border = '1px solid #c5a059';
            } else {
                element.style.background = wallpaper; // Treat as direct color/url
            }
        },

        // Helper to normalize path, e.g. "C:\\Documents\\welcome.txt" -> ["C:", "Documents", "welcome.txt"]
        _parsePath: function(pathStr) {
            if (!pathStr) return [];
            return pathStr.replace(/\\/g, '/').split('/').filter(p => p.length > 0);
        },

        resolvePath: function(pathStr) {
            const parts = this._parsePath(pathStr);
            let current = this.getVFS();
            if (!current) return null;

            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                if (i === 0) {
                    // Match drive letters like "C:"
                    if (current[part]) {
                        current = current[part];
                    } else {
                        return null;
                    }
                } else {
                    if (current.type === 'directory' && current.children && current.children[part]) {
                        current = current.children[part];
                    } else {
                        return null; // Path breaks
                    }
                }
            }
            return current;
        },

        readDir: function(pathStr) {
            const dir = this.resolvePath(pathStr);
            if (dir && dir.type === 'directory') {
                return Object.values(dir.children).map(child => ({
                    name: child.name,
                    type: child.type,
                    mime: child.mime || null
                }));
            }
            return null;
        },

        readFile: function(pathStr) {
            const file = this.resolvePath(pathStr);
            if (file && file.type === 'file') {
                return file.content;
            }
            return null;
        },

        writeFile: function(pathStr, content, mime = 'txt') {
            const parts = this._parsePath(pathStr);
            if (parts.length < 2) return false;

            const fileName = parts.pop();
            const parentPath = parts.join('/');
            const parentDir = this.resolvePath(parentPath);

            if (parentDir && parentDir.type === 'directory') {
                parentDir.children[fileName] = {
                    type: "file",
                    name: fileName,
                    mime: mime,
                    content: content
                };
                return true;
            }
            return false;
        },

        deleteFile: function(pathStr) {
            const parts = this._parsePath(pathStr);
            if (parts.length < 2) return false;

            const fileName = parts.pop();
            const parentPath = parts.join('/');
            const parentDir = this.resolvePath(parentPath);

            if (parentDir && parentDir.type === 'directory' && parentDir.children[fileName]) {
                delete parentDir.children[fileName];
                return true;
            }
            return false;
        },

        // --- Directory primitives ------------------------------------------
        // The shell (and any app that moves files around) needs more than read
        // and write: whole directories are created, emptied, copied and renamed.
        // Every one of them goes through here so the VFS stays the single owner
        // of the tree's shape.

        exists: function(pathStr) {
            return !!this.resolvePath(pathStr);
        },

        // The node a path lives in, plus the leaf name, or null when the parent
        // itself is missing or is not a directory.
        _parentOf: function(pathStr) {
            const parts = this._parsePath(pathStr);
            if (parts.length < 2) return null;
            const name = parts.pop();
            const parent = this.resolvePath(parts.join('/'));
            if (!parent || parent.type !== 'directory') return null;
            return { parent: parent, name: name };
        },

        mkdir: function(pathStr) {
            const at = this._parentOf(pathStr);
            if (!at || at.parent.children[at.name]) return false;
            at.parent.children[at.name] = {
                type: 'directory',
                name: at.name,
                children: {}
            };
            return true;
        },

        // Refuses a directory that still holds anything unless told to recurse,
        // the way a real RD does.
        rmdir: function(pathStr, recursive) {
            const at = this._parentOf(pathStr);
            if (!at) return false;
            const node = at.parent.children[at.name];
            if (!node || node.type !== 'directory') return false;
            if (!recursive && Object.keys(node.children).length > 0) return false;
            delete at.parent.children[at.name];
            return true;
        },

        // A deep clone, so copying a directory never leaves the two trees
        // sharing the same child objects.
        _cloneNode: function(node) {
            return JSON.parse(JSON.stringify(node));
        },

        copy: function(srcPath, destPath) {
            const src = this.resolvePath(srcPath);
            if (!src) return false;
            const dest = this.resolvePath(destPath);
            // Copying onto an existing directory drops the node inside it,
            // keeping its own name, like COPY file dir.
            if (dest && dest.type === 'directory') {
                dest.children[src.name] = this._cloneNode(src);
                return true;
            }
            const at = this._parentOf(destPath);
            if (!at) return false;
            const clone = this._cloneNode(src);
            clone.name = at.name;
            at.parent.children[at.name] = clone;
            return true;
        },

        move: function(srcPath, destPath) {
            const at = this._parentOf(srcPath);
            if (!at || !at.parent.children[at.name]) return false;
            if (!this.copy(srcPath, destPath)) return false;
            delete at.parent.children[at.name];
            return true;
        },

        // --- The Recycle Bin --------------------------------------------------
        // A file deleted from the desktop is not gone: it moves to C:/RECYCLER
        // with a note of where it came from, until the bin is emptied or the
        // file restored. The shell's DEL stays a real delete, as it was.
        RECYCLER: 'C:/RECYCLER',   // i18n-ignore  folder

        recycle: function(pathStr) {
            const at = this._locate ? this._locate(pathStr) : null;
            const node = this.resolvePath(pathStr);
            if (!node || node.type !== 'file') return false;
            const parts = this._parsePath(pathStr);
            const name = parts.pop();
            const origin = parts.join('\\');
            if (!this.exists(this.RECYCLER)) this.mkdir(this.RECYCLER);
            const bin = this.resolvePath(this.RECYCLER);
            let stored = name;
            let n = 2;
            while (bin.children[stored]) { stored = name.replace(/(\.[^.]*)?$/, ' (' + n + ')$1'); n++; }
            const copy = Object.assign({}, node, { name: stored });
            copy.recycledFrom = origin;
            copy.recycledAt = (window.HypernetOS && window.HypernetOS.clockStamp) ? window.HypernetOS.clockStamp() : '';
            bin.children[stored] = copy;
            this.deleteFile(pathStr);
            this._recyclerChanged();
            return true;
        },

        recycled: function() {
            const bin = this.resolvePath(this.RECYCLER);
            if (!bin || bin.type !== 'directory') return [];
            return Object.values(bin.children).map(c => ({
                name: c.name, origin: c.recycledFrom || '', deletedAt: c.recycledAt || '',
                size: String(c.content || '').length
            }));
        },

        restoreRecycled: function(name) {
            const bin = this.resolvePath(this.RECYCLER);
            const node = bin && bin.children[name];
            if (!node) return false;
            const origin = (node.recycledFrom || 'C:').replace(/\\/g, '/');
            if (!this.exists(origin)) this.mkdir(origin);
            const home = this.resolvePath(origin);
            if (!home || home.type !== 'directory') return false;
            const original = name.replace(/ \(\d+\)(\.[^.]*)?$/, '$1');
            const restored = Object.assign({}, node, { name: original });
            delete restored.recycledFrom;
            delete restored.recycledAt;
            home.children[original] = restored;
            delete bin.children[name];
            this._recyclerChanged();
            return true;
        },

        emptyRecycler: function() {
            const bin = this.resolvePath(this.RECYCLER);
            if (!bin) return 0;
            const n = Object.keys(bin.children).length;
            bin.children = {};
            this._recyclerChanged();
            return n;
        },

        _recyclerChanged: function() {
            const win = document.getElementById('win-app-recycle');
            if (win) win.dispatchEvent(new Event('hypernet-recycler-changed'));
        },

        // Every path under a directory, depth first, as display strings. Used by
        // TREE and by anything reporting how much of the disk is in use.
        walk: function(pathStr) {
            const root = this.resolvePath(pathStr);
            const out = [];
            if (!root || root.type !== 'directory') return out;
            const visit = (node, prefix, depth) => {
                Object.values(node.children).forEach(child => {
                    out.push({ node: child, path: prefix + '/' + child.name, depth: depth });
                    if (child.type === 'directory') visit(child, prefix + '/' + child.name, depth + 1);
                });
            };
            const rootPath = pathStr.replace(/\\/g, '/').replace(/\/$/, '');
            visit(root, rootPath, 0);
            return out;
        }
    };

    // Override Scene_HypernetOS.prototype.createDesktop to apply wallpaper preference automatically
    if (typeof Scene_HypernetOS !== 'undefined') {
        const _Scene_HypernetOS_createDesktop = Scene_HypernetOS.prototype.createDesktop;
        Scene_HypernetOS.prototype.createDesktop = function() {
            _Scene_HypernetOS_createDesktop.call(this);
            const desktop = document.getElementById('hypernet-os-desktop');
            if (desktop) {
                const wallpaperVal = window.HypernetFileSystem.getRegistry("wallpaper", "bliss");
                window.HypernetFileSystem.applyWallpaperStyle(desktop, wallpaperVal);
            }
        };
    }


    // =========================================================================
    // The system tree
    // =========================================================================
    // What a fresh Archways install carries besides the player's own folders:
    // the system folder (system666, where the other machines kept a
    // system32), the fonts, the temp folder, Program Files with one folder
    // per program, and the boot files at the root of C:. Every executable and
    // library is a stand-in with a name of its own; a file that names an app
    // (`app`) opens that app from My Computer.
    //
    // ensureSystemTree() is idempotent and runs on every VFS read, so a save
    // from before the tree existed grows it the first time the OS is opened,
    // and a folder the player emptied is not refilled behind their back:
    // only a missing top-level folder is planted, never a missing file.
    // i18n-ignore-start  VFS paths and file names, matched literally
    const SYSTEM_ROOT = 'ARCHWAYS';
    const SYSTEM_DIR = 'system666';
    const SYSTEM_TREE = {
        'ARCHWAYS': {
            'system666': {
                files: [
                    'kernel666.dll', 'ntdull.dll', 'hal9000.dll', 'ntosgremlin.exe',
                    'loser32.dll', 'gdi666.dll', 'shellfish32.dll', 'badvapi32.dll',
                    'guacamole32.dll', 'oleaux32.dll', 'comcatl32.dll', 'comdlg666.dll',
                    'msvcrot.dll', 'msvbvm666.dll', 'rpgcrt4.dll', 'shlwappy.dll',
                    'versionish.dll', 'whinynet.dll', 'urlmoan.dll', 'crypt666.dll',
                    'wesock32.dll', 'whinmm.dll', 'dsoundoff.dll', 'dedraw.dll',
                    'd3d666.dll', 'opengoblin32.dll',
                    'winlogoff.exe', 'cursrss.exe', 'lsassy.exe', 'svcghost.exe',
                    'servixes.exe', 'exploder.exe', 'rundll666.exe', 'drwhatson.exe',
                    'mysconfig.exe', 'dxdiagnosis.exe', 'regretedit.exe',
                    'pong.exe', 'ipconfrig.exe', 'wineminer.exe', 'soul.exe',
                    'freehell.exe', 'pinbawl.exe',
                    { name: 'taskmangler.exe', app: 'sys-task-mgr' },
                    { name: 'cmnd.exe', app: 'sys-terminal' },
                    { name: 'notebad.exe', app: 'app-hypernet-notepad' },
                    { name: 'pain.exe', app: 'app-hypernet-paint' },
                    { name: 'calq.exe', app: 'app-token-exchange' },
                    { name: 'control.exe', app: 'control-panel' },
                    { name: 'bobnzi.exe', app: 'app-bobnzi' }
                ],
                dirs: { 'drivers': { files: ['ragefile.sys', 'hibernatefool.sys', 'goblin.sys', 'mouse666.sys', 'kbdhex.sys'] } }
            },
            'Fonts': {
                files: ['Tahombre.ttf', 'Verdammt.ttf', 'Comic Sins MS.ttf', 'Times New Gnoman.ttf',
                    'Ariel.ttf', 'Courier Newt.ttf', 'Wingdongs.ttf', 'Trebuchet MSG.ttf', 'Lucida Consoul.ttf']
            },
            'Temp': { files: [] },
            'Prefetch': { files: ['EXPLODER.EXE-0666DEAD.pf', 'HYPERAMP.EXE-0BADCAFE.pf'] },
            files: ['archways.ini', 'exploder.exe', 'notebad.exe', 'regretedit.exe', 'hexplorer.scr', 'win.ini']
        },
        'Program Files': {
            'HyperAmp': { files: [{ name: 'hyperamp.exe', app: 'app-hyperamp' }, 'hyperamp.ini', 'in_ogg.dll', 'out_wave.dll'] },
            'Omni Office 2003': { files: [
                { name: 'wyrd.exe', app: 'app-wyrd' },
                { name: 'hexcel.exe', app: 'app-hexcel' },
                'mso666.dll', 'bobnzi.acs'
            ] },
            'Hypernet Explorer': { files: [{ name: 'hexplorer.exe', app: 'app-hypernet-browser' }, 'mshtmhell.dll', 'shdocvwoo.dll'] },
            'Incanta 96': { files: [{ name: 'incanta.exe', app: 'app-bestiary-encarta' }, 'incanta.dat', 'bestiary.idx'] },
            'Whether Channel': { files: [{ name: 'whether.exe', app: 'app-weather' }, 'barometer.dll'] },
            'Pain': { files: [{ name: 'pain.exe', app: 'app-hypernet-paint' }, 'pain.hlp'] },
            'Common Files': { files: ['mscrvt.dll', 'olé.dll'] },
            files: []
        },
        'Pictures': { files: [] },
        files: ['loot.ini', 'ntlurker', 'ntdetect.com', 'autoexorc.bat', 'conjure.sys', 'ragefile.sys']
    };
    // i18n-ignore-end

    function stubContent(name, ext) {
        if (ext === 'exe' || ext === 'dll' || ext === 'sys' || ext === 'scr' || ext === 'com' || ext === 'pf' || ext === 'acs' || ext === 'dat' || ext === 'idx') {
            return T('HypernetFS.binaryStub', { name: name });
        }
        if (ext === 'ini') return T('HypernetFS.iniStub', { name: name });
        if (ext === 'ttf') return T('HypernetFS.fontStub', { name: name });
        if (ext === 'bat') return T('HypernetFS.batStub', { name: name });
        if (ext === 'hlp') return T('HypernetFS.helpStub', { name: name });
        return '';
    }

    function makeFileNode(spec) {
        const name = typeof spec === 'string' ? spec : spec.name;
        const dot = name.lastIndexOf('.');
        const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : 'bin';
        const node = { type: 'file', name: name, mime: ext, content: stubContent(name, ext) };
        if (spec && spec.app) node.app = spec.app;
        return node;
    }

    function buildDir(name, spec) {
        const dir = { type: 'directory', name: name, children: {} };
        Object.keys(spec).forEach(key => {
            if (key === 'files') {
                spec.files.forEach(f => { const n = makeFileNode(f); dir.children[n.name] = n; });
            } else if (key === 'dirs') {
                Object.keys(spec.dirs).forEach(d => { dir.children[d] = buildDir(d, spec.dirs[d]); });
            } else {
                dir.children[key] = buildDir(key, spec[key]);
            }
        });
        return dir;
    }

    // Plants every top-level system folder and root file that is missing.
    function ensureSystemTree(vfs) {
        const root = vfs && vfs['C:'];
        if (!root || !root.children) return false;
        let planted = false;
        Object.keys(SYSTEM_TREE).forEach(key => {
            if (key === 'files') {
                SYSTEM_TREE.files.forEach(f => {
                    const n = makeFileNode(f);
                    if (!root.children[n.name]) { root.children[n.name] = n; planted = true; }
                });
                return;
            }
            if (!root.children[key]) { root.children[key] = buildDir(key, SYSTEM_TREE[key]); planted = true; }
        });
        return planted;
    }

    window.HypernetFileSystem.SYSTEM_ROOT = SYSTEM_ROOT;
    window.HypernetFileSystem.SYSTEM_DIR = SYSTEM_DIR;
    window.HypernetFileSystem.systemTree = () => SYSTEM_TREE;
    window.HypernetFileSystem.ensureSystemTree = ensureSystemTree;
    window.HypernetFileSystem.buildSystemDir = buildDir;

    const _getVFS = window.HypernetFileSystem.getVFS;
    window.HypernetFileSystem.getVFS = function() {
        const vfs = _getVFS.call(this);
        if (vfs && !this._systemTreeChecked) {
            // Once per VFS object: a new game or a loaded save is a new object.
            ensureSystemTree(vfs);
            this._systemTreeChecked = vfs;
        } else if (vfs && this._systemTreeChecked !== vfs) {
            ensureSystemTree(vfs);
            this._systemTreeChecked = vfs;
        }
        return vfs;
    };

    // readDir carries the app a stand-in executable opens.
    const _readDir = window.HypernetFileSystem.readDir;
    window.HypernetFileSystem.readDir = function(pathStr) {
        const dir = this.resolvePath(pathStr);
        if (dir && dir.type === 'directory') {
            return Object.values(dir.children).map(child => ({
                name: child.name,
                type: child.type,
                mime: child.mime || null,
                app: child.app || null
            }));
        }
        return _readDir.call(this, pathStr);
    };

})();
