/*:
 * @target MZ
 * @plugindesc v1.0.0 File Explorer "My Computer" application for HypernetOS.
 * @author Omni-Lex
 * 
 * @help
 * HypernetMyComputer.js
 * 
 * Launches File Explorer:
 * window.HypernetOS.launchApp('my-computer')
 * 
 * Launches File Explorer pointing directly to My Documents:
 * window.HypernetOS.launchApp('my-documents')
 */

(() => {
    'use strict';

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // =========================================================================
    // The folder window
    // -------------------------------------------------------------------------
    // What was here was a Back button, an address bar and a grid of icons. A
    // folder of the period was rather more, and the virtual file system had
    // long been able to do all of it (copy, move, mkdir, rmdir, recycle) with
    // nothing on screen asking for any of it. So this is that front end:
    //
    //   the toolbar    Back, Forward, Up, and the Folders and Views switches
    //   the menu bar   File, Edit, View, Favorites, Tools, Help
    //   the left pane  the task list (File and Folder Tasks / Other Places /
    //                  Details) or the folder tree, whichever the player asked
    //                  for with the Folders button
    //   the view       Thumbnails, Tiles, Icons, List or Details, the last of
    //                  which is a sortable table
    //   the status bar what is in the folder, or what is picked out of it
    //   the verbs      cut, copy, paste, rename, delete, new folder, select all
    //
    // One state object per window, because two folders open at once are two
    // places, two selections and two histories.
    const VIEWS = ['thumbnails', 'tiles', 'icons', 'list', 'details'];   // i18n-ignore  view ids
    // My Computer is a place ABOVE the drives, the way it always was: opening
    // it shows what the machine has rather than the contents of one drive. It
    // is not a path in the virtual file system, so it is spelled with a
    // character no path can hold and every walk checks for it first.
    const MY_COMPUTER = '::';                  // i18n-ignore  synthetic path
    const ROOT_PATH = 'C:';                    // i18n-ignore  VFS path
    const DESKTOP_PATH = 'C:/Desktop';         // i18n-ignore  VFS path
    const DOCS_PATH = 'C:/Documents';          // i18n-ignore  VFS path

    // One clipboard for every folder window, the way the shell had one.
    const clipboard = { paths: [], cut: false };

    // Every folder window that is open, so Folder Options can redraw them all
    // when a switch is flipped rather than only the next one to be opened.
    const openFolders = new Set();

    // What Folder Options says a folder should do. Read on every draw rather
    // than captured when the window opened, so a switch reaches a folder that
    // is already on screen.
    const folderOpt = (key, def) => {
        const XP = window.HypernetOS && window.HypernetOS.XP;
        return XP ? XP.reg(key, def) : def;
    };

    // A hidden file is one named the way the period named them: a leading dot,
    // or a system extension nobody opens by hand.
    const isHidden = (name) => /^\./.test(String(name)) || /\.(sys|ini|bat|dll)$/i.test(String(name));

    // What a file is called on screen: its whole name, or its name without the
    // extension when Folder Options says to hide known ones.
    const displayName = (item) => {
        if (item.type === 'directory') return item.name;
        if (!folderOpt('folderHideExtensions', false)) return item.name;
        const dot = String(item.name).lastIndexOf('.');
        return dot > 0 ? String(item.name).slice(0, dot) : item.name;
    };

    const fsys = () => window.HypernetFileSystem;
    const OS = () => window.HypernetOS;
    const MC = key => T('MyComputer.' + key);

    const joinPath = (dir, leaf) => (dir === ROOT_PATH ? ROOT_PATH + '/' : dir + '/') + leaf;
    // Up from a folder is its parent; up from the root of a drive is My
    // Computer, which is what stands above every drive.
    const parentOf = (p) => {
        if (p === MY_COMPUTER) return null;
        const parts = String(p).split('/').filter(Boolean);
        return parts.length > 1 ? parts.slice(0, -1).join('/') : MY_COMPUTER;
    };
    const leafOf = (p) => String(p).split('/').filter(Boolean).pop() || p;

    // What a file is called in the Type column: the program that owns it when
    // one does, its extension when none does, and "File Folder" for a folder.
    function typeLabel(item) {
        if (item.drive) return MC('drive.' + item.drive.kind);
        if (item.shellPath) return MC('typeSystemFolder');
        if (item.type === 'directory') return MC('typeFolder');
        const app = item.app && OS()._apps[item.app];
        if (app) return app.name;
        const dot = String(item.name).lastIndexOf('.');
        return dot > 0 ? String(item.name).slice(dot + 1).toUpperCase() : MC('typeFile');
    }

    function sizeLabel(item) {
        if (item.type === 'directory') return '';
        const n = item.size || 0;
        return n >= 1024 ? T('MyComputer.kb', { n: Math.ceil(n / 1024) }) : T('MyComputer.bytes', { n: n });
    }

    function iconOf(item) {
        if (item.drive) return item.drive.icon;
        if (item.shellPath) return item.shellPath === 'Network' ? 188 : 234;   // i18n-ignore  VFS path
        if (item.type === 'directory') return 191;
        const app = item.app && OS()._apps[item.app];
        return app ? app.icon : 190;
    }

    window.HypernetMyComputer = {
        VIEWS: VIEWS,
        MY_COMPUTER: MY_COMPUTER,
        clipboard: clipboard,

        launch: function(initialPath = MY_COMPUTER) {
            if (!OS() || !OS().WindowManager) {
                console.error("HypernetOS core not loaded!");
                return;
            }

            const id = 'app-hypernet-my-computer';
            const XP = OS().XP;
            const st = {
                // My Computer is not a path the file system can resolve, so it
                // is allowed through on its own before anything is looked up.
                path: (initialPath === MY_COMPUTER || (fsys() && fsys().resolvePath(initialPath)))
                    ? initialPath : MY_COMPUTER,
                back: [],
                forward: [],
                selected: new Set(),
                anchor: null,
                view: (XP && XP.reg('explorerView', 'tiles')) || 'tiles',   // i18n-ignore  view id
                tree: !!(XP && XP.reg('explorerTree', false)),
                sort: 'name',   // i18n-ignore  column id
                desc: false
            };

            const win = OS().WindowManager.createWindow({
                id: id,
                title: MC('myComputer'),
                icon: 86,
                width: 720,
                height: 500,
                contentHTML: '<div class="explorer-container" id="explorer-root"></div>'
            });
            const root = win.querySelector('#explorer-root');
            if (!root) return win;

            //-----------------------------------------------------------------
            // Drawing
            //-----------------------------------------------------------------
            // What is in the place we are standing. At My Computer that is the
            // drives and the two shell folders beside them, read off the file
            // system's own answer rather than a second list kept here.
            const listPlace = () => {
                if (st.path !== MY_COMPUTER) return (fsys() && fsys().readDir(st.path)) || [];
                if (!fsys() || !fsys().drives) return [];
                return fsys().drives().map(d => ({
                    name: d.name, type: 'directory', drive: d, size: 0
                })).concat([
                    { name: MC('printers'), type: 'directory', shellPath: 'Printers', size: 0 },   // i18n-ignore  VFS path
                    { name: MC('networkPlaces'), type: 'directory', shellPath: 'Network', size: 0 }   // i18n-ignore  VFS path
                ]);
            };

            const items = () => {
                const list = folderOpt('folderShowHidden', false)
                    ? listPlace()
                    : listPlace().filter(it => !isHidden(it.name));
                const dir = (a, b) => (a.type === b.type) ? 0 : (a.type === 'directory' ? -1 : 1);
                const by = {
                    name: (a, b) => String(a.name).localeCompare(String(b.name)),
                    size: (a, b) => (a.size || 0) - (b.size || 0),
                    type: (a, b) => typeLabel(a).localeCompare(typeLabel(b)),
                    modified: (a, b) => String(a.name).localeCompare(String(b.name))
                };
                const cmp = by[st.sort] || by.name;
                return list.slice().sort((a, b) => dir(a, b) || (st.desc ? -cmp(a, b) : cmp(a, b)));
            };

            const chrome = () => `
                <div class="explorer-menubar">
                    ${['file', 'edit', 'viewMenu', 'favorites', 'tools', 'help'].map(m =>
                        `<div class="explorer-menu focusable" data-menu="${m}" tabindex="0">${escapeHtml(MC('menu.' + m))}</div>`).join('')}
                </div>
                <div class="explorer-toolbar">
                    <button class="explorer-tbtn focusable" id="explorer-btn-back" tabindex="0">${escapeHtml(MC('back'))}</button>
                    <button class="explorer-tbtn focusable" id="explorer-btn-fwd" tabindex="0">${escapeHtml(MC('forward'))}</button>
                    <button class="explorer-tbtn focusable" id="explorer-btn-up" tabindex="0">${escapeHtml(MC('up'))}</button>
                    <span class="explorer-tsep"></span>
                    <button class="explorer-tbtn focusable" id="explorer-btn-folders" tabindex="0">${escapeHtml(MC('folders'))}</button>
                    <button class="explorer-tbtn focusable" id="explorer-btn-views" tabindex="0">${escapeHtml(MC('views'))}</button>
                </div>
                <div class="explorer-addressbar">
                    <span class="explorer-address-label">${escapeHtml(MC('address'))}</span>
                    <input id="explorer-address-bar" type="text" value="${escapeHtml(st.path === MY_COMPUTER ? MC('myComputer') : (folderOpt('folderFullPath', true) ? st.path : leafOf(st.path)))}">
                    <button class="explorer-tbtn focusable" id="explorer-btn-go" tabindex="0">${escapeHtml(MC('go'))}</button>
                </div>
                <div class="explorer-body">
                    <div class="explorer-sidebar" id="explorer-sidebar"></div>
                    <div class="explorer-view" id="explorer-view" data-view="${st.view}"></div>
                </div>
                <div class="explorer-statusbar" id="explorer-status"></div>`;

            // The left pane. Two things it can be, and the Folders button is
            // what swaps them: the tasks that apply to what is picked out of
            // this folder, or the tree of every folder on the drive.
            const sidebarHTML = () => {
                if (!st.tree && !folderOpt('folderTasks', true)) return '';
                if (st.tree) {
                    const roots = (fsys() && fsys().drives ? fsys().drives() : []).filter(d => d.ready);
                    return `<div class="explorer-tree" id="explorer-tree">
                        <div class="explorer-tree-row focusable ${st.path === MY_COMPUTER ? 'selected' : ''}" data-goto="${MY_COMPUTER}" tabindex="0">
                            <span class="explorer-tree-icon">${OS().getIconHTML(86, 16)}</span>
                            <span>${escapeHtml(MC('myComputer'))}</span></div>
                        ${roots.map(d => treeHTML(d.path, 1)).join('')}</div>`;
                }
                const picked = [...st.selected];
                const one = picked.length === 1 ? (fsys() && fsys().resolvePath(joinPath(st.path, picked[0]))) : null;
                const isDir = one && one.type === 'directory';
                const tasks = [];
                if (one) {
                    tasks.push(['rename', isDir ? MC('tasks.renameFolder') : MC('tasks.renameItem')]);
                    tasks.push(['copy', MC('tasks.copyItem')]);
                    tasks.push(['cut', MC('tasks.moveItem')]);
                    tasks.push(['delete', MC('tasks.deleteItem')]);
                } else {
                    tasks.push(['newfolder', MC('tasks.newFolder')]);
                }
                const places = [[MY_COMPUTER, MC('myComputer')], [DOCS_PATH, MC('myDocuments')], [DESKTOP_PATH, MC('desktop')]]
                    .filter(([p]) => p === MY_COMPUTER || (fsys() && fsys().resolvePath(p)));
                const detail = one
                    ? `<div class="explorer-detail-name">${escapeHtml(picked[0])}</div>
                       <div class="explorer-detail-line">${escapeHtml(T('MyComputer.typeOf', { type: typeLabel({ type: one.type, name: picked[0], app: one.app }) }))}</div>
                       ${one.type === 'file' ? `<div class="explorer-detail-line">${escapeHtml(T('MyComputer.sizeOf', { size: sizeLabel({ type: 'file', size: String(one.content || '').length }) }))}</div>` : ''}`
                    : `<div class="explorer-detail-name">${escapeHtml(leafOf(st.path))}</div>
                       <div class="explorer-detail-line">${escapeHtml(MC('typeFolder'))}</div>`;
                return `
                    <div class="explorer-panel">
                        <div class="explorer-panel-head">${escapeHtml(one ? MC('tasks.fileAndFolder') : MC('tasks.folderTasks'))}</div>
                        <div class="explorer-panel-body">
                            ${tasks.map(([act, label]) =>
                                `<div class="explorer-task focusable" data-task="${act}" tabindex="0">${escapeHtml(label)}</div>`).join('')}
                        </div>
                    </div>
                    <div class="explorer-panel">
                        <div class="explorer-panel-head">${escapeHtml(MC('tasks.otherPlaces'))}</div>
                        <div class="explorer-panel-body">
                            ${places.map(([p, label]) =>
                                `<div class="explorer-side-link focusable" data-goto="${escapeHtml(p)}" tabindex="0">${escapeHtml(label)}</div>`).join('')}
                        </div>
                    </div>
                    <div class="explorer-panel">
                        <div class="explorer-panel-head">${escapeHtml(MC('tasks.details'))}</div>
                        <div class="explorer-panel-body">${detail}</div>
                    </div>`;
            };

            const treeHTML = (p, depth) => {
                const kids = ((fsys() && fsys().readDir(p)) || []).filter(c => c.type === 'directory');
                const open = String(st.path + '/').startsWith(p + '/');
                const row = `<div class="explorer-tree-row focusable ${p === st.path ? 'selected' : ''}" data-goto="${escapeHtml(p)}" data-depth="${depth}" tabindex="0">
                    <span class="explorer-tree-indent" data-indent="${depth}"></span>
                    <span class="explorer-tree-icon">${OS().getIconHTML(191, 16)}</span>
                    <span>${escapeHtml(leafOf(p))}</span></div>`;
                return row + (open ? kids.map(k => treeHTML(joinPath(p, k.name), depth + 1)).join('') : '');
            };

            const viewHTML = () => {
                const list = items();
                if (!fsys()) return `<div class="explorer-empty">${escapeHtml(MC('vfsError'))}</div>`;
                // My Computer is not a folder the file system holds, so it is
                // never asked whether it exists: listPlace() answered for it.
                if (st.path !== MY_COMPUTER && !fsys().readDir(st.path)) {
                    return `<div class="explorer-empty">${escapeHtml(T('MyComputer.dirInvalid', { path: st.path }))}</div>`;
                }
                if (!list.length) return `<div class="explorer-empty">${escapeHtml(MC('emptyFolder'))}</div>`;

                if (st.view === 'details') {
                    const cols = ['name', 'size', 'type', 'modified'];   // i18n-ignore  column ids
                    return `
                        <table class="explorer-table">
                            <thead><tr>${cols.map(c =>
                                `<th class="explorer-col focusable ${st.sort === c ? (st.desc ? 'desc' : 'asc') : ''}" data-col="${c}" tabindex="0">${escapeHtml(MC('col.' + c))}</th>`).join('')}</tr></thead>
                            <tbody>${list.map(it => `
                                <tr class="explorer-row ${st.selected.has(it.name) ? 'selected' : ''}" data-name="${escapeHtml(it.name)}" data-dir="${it.type === 'directory' ? '1' : ''}" tabindex="0">
                                    <td><span class="explorer-row-icon">${OS().getIconHTML(iconOf(it), 16)}</span>${escapeHtml(displayName(it))}</td>
                                    <td class="explorer-cell-num">${escapeHtml(sizeLabel(it))}</td>
                                    <td>${escapeHtml(typeLabel(it))}</td>
                                    <td>${escapeHtml(OS().staleDate ? (OS().staleDate() || '') : '')}</td>
                                </tr>`).join('')}</tbody>
                        </table>`;
                }
                const big = st.view === 'thumbnails' ? 48 : (st.view === 'list' ? 16 : 32);
                return list.map(it => `
                    <div class="explorer-item ${st.selected.has(it.name) ? 'selected' : ''}" data-name="${escapeHtml(it.name)}" data-dir="${it.type === 'directory' ? '1' : ''}" tabindex="0">
                        <div class="explorer-item-icon">${OS().getIconHTML(iconOf(it), big)}</div>
                        <div class="explorer-item-label">
                            <div class="explorer-item-name">${escapeHtml(displayName(it))}</div>
                            ${st.view === 'tiles' ? `<div class="explorer-item-sub">${escapeHtml(typeLabel(it))}</div>` : ''}
                        </div>
                    </div>`).join('');
            };

            const statusHTML = () => {
                const list = items();
                if (st.selected.size) return escapeHtml(T('MyComputer.statusSelected', { count: st.selected.size }));
                const bytes = list.reduce((n, it) => n + (it.size || 0), 0);
                return escapeHtml(bytes
                    ? T('MyComputer.statusSize', { count: list.length, size: bytes })
                    : T('MyComputer.status', { count: list.length }));
            };

            //-----------------------------------------------------------------
            // Navigating
            //-----------------------------------------------------------------
            const go = (target, remember = true) => {
                if (target !== MY_COMPUTER && (!fsys() || !fsys().resolvePath(target))) {
                    OS().Dialog.error(T('MyComputer.dirNotFound', { path: target }), MC('myComputer'));
                    return false;
                }
                if (remember && target !== st.path) { st.back.push(st.path); st.forward.length = 0; }
                st.path = target;
                st.selected.clear();
                st.anchor = null;
                render();
                if (window.SoundManager) SoundManager.playCursor();
                return true;
            };

            const openItem = (name, isDir) => {
                // At My Computer a row is a drive or a shell folder, and each
                // knows the path it stands for; anywhere else a row is a name
                // inside the folder we are already in.
                if (st.path === MY_COMPUTER) {
                    const row = listPlace().find(r => r.name === name);
                    if (!row) return;
                    if (row.drive && !row.drive.ready) {
                        OS().Dialog.error(T('MyComputer.driveNotReady', { drive: row.drive.name }), MC('myComputer'));
                        return;
                    }
                    go(row.drive ? row.drive.path : row.shellPath);
                    return;
                }
                if (isDir) { go(joinPath(st.path, name)); return; }
                OS().openFile(joinPath(st.path, name));
            };

            //-----------------------------------------------------------------
            // The verbs
            //-----------------------------------------------------------------
            const picked = () => [...st.selected];
            const pickedPaths = () => picked().map(n => joinPath(st.path, n));

            const verbs = {
                newfolder() {
                    let name = MC('newFolderName'), n = 2;
                    while (fsys().exists(joinPath(st.path, name))) name = MC('newFolderName') + ' (' + (n++) + ')';
                    if (fsys().mkdir(joinPath(st.path, name))) { st.selected = new Set([name]); render(); }
                },
                rename() {
                    const name = picked()[0];
                    if (!name) return;
                    OS().Dialog.prompt(T('MyComputer.renamePrompt', { name: name }), name, MC('rename')).then(typed => {
                        if (!typed || typed === name) return;
                        if (fsys().exists(joinPath(st.path, typed))) {
                            OS().Dialog.error(T('MyComputer.renameTaken', { name: typed }), MC('rename'));
                            return;
                        }
                        if (fsys().move(joinPath(st.path, name), joinPath(st.path, typed))) {
                            st.selected = new Set([typed]);
                            render();
                        }
                    });
                },
                copy() { clipboard.paths = pickedPaths(); clipboard.cut = false; render(); },
                cut() { clipboard.paths = pickedPaths(); clipboard.cut = true; render(); },
                paste() {
                    if (!clipboard.paths.length) return;
                    let any = false;
                    for (const src of clipboard.paths) {
                        let name = leafOf(src);
                        while (fsys().exists(joinPath(st.path, name))) name = MC('copy') + ' ' + name;
                        const dst = joinPath(st.path, name);
                        if (src === dst) continue;
                        const ok = clipboard.cut ? fsys().move(src, dst) : fsys().copy(src, dst);
                        any = any || ok;
                    }
                    if (clipboard.cut) { clipboard.paths = []; clipboard.cut = false; }
                    if (!any) OS().Dialog.error(MC('pasteFailed'), MC('myComputer'));
                    render();
                },
                delete() {
                    const names = picked();
                    if (!names.length) return;
                    const run = () => {
                        names.forEach(n => fsys().recycle(joinPath(st.path, n)));
                        st.selected.clear();
                        render();
                    };
                    if (fsys().getRegistry('recycleConfirm', true)) {
                        OS().Dialog.confirm(T('MyComputer.deleteConfirm', { file: names.join(', ') }), MC('deleteTitle'))
                            .then(ok => { if (ok) run(); });
                    } else run();
                },
                selectall() { st.selected = new Set(items().map(i => i.name)); render(); },
                refresh() { render(); },
                properties() {
                    const name = picked()[0] || leafOf(st.path);
                    const full = picked()[0] ? joinPath(st.path, name) : st.path;
                    const node = fsys().resolvePath(full);
                    const isDir = !node || node.type === 'directory';
                    const size = node && node.type === 'file' ? String(node.content || '').length : fsys().walk(full).length;
                    OS().Dialog.alert(T('MyComputer.propsBody', {
                        name: name,
                        type: isDir ? MC('typeFolder') : (node.mime || MC('typeFile')),
                        size: size,
                        location: st.path.replace(/\//g, '\\')
                    }), T('MyComputer.propsTitle', { name: name }));
                }
            };

            // What a right click offers, on an item or on the bare folder.
            const menuFor = (name, isDir) => {
                const C = k => T('HypernetOS.context.' + k);
                if (name) {
                    const out = [{ label: C('open'), bold: true, action: () => openItem(name, isDir) }, { separator: true },
                        { label: MC('cut'), action: verbs.cut },
                        { label: MC('copy'), action: verbs.copy }];
                    if (isDir) out.push({ label: MC('paste'), disabled: !clipboard.paths.length, action: () => { go(joinPath(st.path, name)); verbs.paste(); } });
                    out.push({ separator: true },
                        { label: MC('rename'), action: verbs.rename },
                        { label: MC('delete'), action: verbs.delete },
                        { separator: true },
                        { label: C('properties'), action: verbs.properties });
                    return out;
                }
                return [
                    { label: MC('view'), disabled: true },
                    ...VIEWS.map(v => ({ label: MC('view.' + v), checked: st.view === v, action: () => setView(v) })),
                    { separator: true },
                    { label: MC('refresh'), action: verbs.refresh },
                    { label: MC('paste'), disabled: !clipboard.paths.length, action: verbs.paste },
                    { separator: true },
                    { label: MC('newFolder'), action: verbs.newfolder },
                    { separator: true },
                    { label: C('properties'), action: verbs.properties }
                ];
            };

            const setView = (v) => {
                st.view = VIEWS.includes(v) ? v : 'tiles';   // i18n-ignore  view id
                if (XP) XP.setReg('explorerView', st.view);
                render();
            };

            //-----------------------------------------------------------------
            // Wiring, once per draw
            //-----------------------------------------------------------------
            const render = () => {
                root.innerHTML = chrome();
                const q = sel => root.querySelector(sel);
                const view = q('#explorer-view');
                q('#explorer-sidebar').innerHTML = sidebarHTML();
                view.innerHTML = viewHTML();
                view.dataset.view = st.view;
                q('#explorer-status').textContent = statusHTML();

                const backBtn = q('#explorer-btn-back'), fwdBtn = q('#explorer-btn-fwd'), upBtn = q('#explorer-btn-up');
                backBtn.disabled = !st.back.length;
                fwdBtn.disabled = !st.forward.length;
                upBtn.disabled = !parentOf(st.path);
                q('#explorer-btn-folders').classList.toggle('pressed', st.tree);

                const on = (el, ev, fn) => { if (el) el.addEventListener(ev, e => { e.stopPropagation(); fn(e); }); };
                on(backBtn, 'click', () => { if (st.back.length) { st.forward.push(st.path); go(st.back.pop(), false); } });
                on(fwdBtn, 'click', () => { if (st.forward.length) { st.back.push(st.path); go(st.forward.pop(), false); } });
                on(upBtn, 'click', () => { const p = parentOf(st.path); if (p) go(p); });
                on(q('#explorer-btn-folders'), 'click', () => {
                    st.tree = !st.tree;
                    if (XP) XP.setReg('explorerTree', st.tree);
                    render();
                });
                on(q('#explorer-btn-views'), 'click', (e) => {
                    const box = e.currentTarget.getBoundingClientRect();
                    OS().ContextMenu.show(box.left, box.bottom, VIEWS.map(v =>
                        ({ label: MC('view.' + v), checked: st.view === v, action: () => setView(v) })));
                });
                on(q('#explorer-btn-go'), 'click', () => go(q('#explorer-address-bar').value));
                const addr = q('#explorer-address-bar');
                if (addr) addr.addEventListener('keydown', e => {
                    if (e.key !== 'Enter') return;
                    e.stopPropagation();
                    go(addr.value.trim() === MC('myComputer') ? MY_COMPUTER : addr.value);
                });

                // The menu bar. Each heading drops the verbs that live under it,
                // which are the same verbs the right click and the task pane
                // reach: one table of what a folder can do, three ways in.
                const MENUS = {
                    // i18n-ignore-start  menu ids
                    file: [['newFolder', 'newfolder'], ['rename', 'rename'], ['delete', 'delete'], null, ['properties', 'properties']],
                    edit: [['cut', 'cut'], ['copy', 'copy'], ['paste', 'paste'], null, ['selectAll', 'selectall']],
                    viewMenu: null,
                    favorites: [],
                    tools: [['refresh', 'refresh']],
                    help: []
                    // i18n-ignore-end
                };
                root.querySelectorAll('.explorer-menu').forEach(head => on(head, 'click', () => {
                    const box = head.getBoundingClientRect();
                    const key = head.dataset.menu;
                    if (key === 'viewMenu') {
                        OS().ContextMenu.show(box.left, box.bottom, VIEWS.map(v =>
                            ({ label: MC('view.' + v), checked: st.view === v, action: () => setView(v) })));
                        return;
                    }
                    const rows = (MENUS[key] || []).map(entry => {
                        if (!entry) return { separator: true };
                        const [label, verb] = entry;
                        const needsOne = ['rename', 'delete', 'cut', 'copy'].includes(verb);
                        return {
                            label: label === 'properties' ? T('HypernetOS.context.properties') : MC(label),
                            disabled: (needsOne && !st.selected.size) || (verb === 'paste' && !clipboard.paths.length),
                            action: verbs[verb]
                        };
                    });
                    if (rows.length) OS().ContextMenu.show(box.left, box.bottom, rows);
                }));

                // Picking things out of the folder. Ctrl adds one, Shift takes
                // the run between the last one and this, and a bare click
                // starts again with one.
                const pick = (name, e) => {
                    const names = items().map(i => i.name);
                    if (e && e.shiftKey && st.anchor) {
                        const a = names.indexOf(st.anchor), b = names.indexOf(name);
                        if (a >= 0 && b >= 0) {
                            st.selected = new Set(names.slice(Math.min(a, b), Math.max(a, b) + 1));
                            return;
                        }
                    }
                    if (e && (e.ctrlKey || e.metaKey)) {
                        if (st.selected.has(name)) st.selected.delete(name); else st.selected.add(name);
                    } else {
                        st.selected = new Set([name]);
                    }
                    st.anchor = name;
                };

                view.querySelectorAll('[data-name]').forEach(el => {
                    const name = el.dataset.name, isDir = !!el.dataset.dir;
                    el.addEventListener('click', e => {
                        e.stopPropagation();
                        const wasOnlyThis = st.selected.size === 1 && st.selected.has(name);
                        // Single-click opening: the setting Folder Options
                        // calls "click items as follows", and the one thing on
                        // that page that changes what a click means.
                        if (folderOpt('folderSingleClick', false) && !e.ctrlKey && !e.shiftKey) {
                            openItem(name, isDir);
                            return;
                        }
                        pick(name, e);
                        const now = Date.now();
                        const quick = el.dataset.lastClick && (now - el.dataset.lastClick) < 300;
                        // A second click on the one already picked opens it, so
                        // a pad or the keyboard can browse without a double
                        // click's timing to hit.
                        if (quick || (wasOnlyThis && !e.ctrlKey && !e.shiftKey)) { openItem(name, isDir); return; }
                        el.dataset.lastClick = now;
                        render();
                    });
                    el.addEventListener('dblclick', e => { e.stopPropagation(); openItem(name, isDir); });
                    el.addEventListener('contextmenu', e => {
                        e.preventDefault(); e.stopPropagation();
                        if (!st.selected.has(name)) { st.selected = new Set([name]); render(); }
                        OS().ContextMenu.show(e.clientX, e.clientY, menuFor(name, isDir));
                    });
                });

                // Sorting, in the Details view.
                view.querySelectorAll('.explorer-col').forEach(col => on(col, 'click', () => {
                    if (st.sort === col.dataset.col) st.desc = !st.desc;
                    else { st.sort = col.dataset.col; st.desc = false; }
                    render();
                }));

                // The bare folder: a click clears the selection, a right click
                // offers what applies to the folder itself.
                view.addEventListener('click', e => {
                    if (e.target.closest('[data-name]') || e.target.closest('.explorer-col')) return;
                    if (!st.selected.size) return;
                    st.selected.clear();
                    render();
                });
                view.addEventListener('contextmenu', e => {
                    if (e.target.closest('[data-name]')) return;
                    e.preventDefault(); e.stopPropagation();
                    OS().ContextMenu.show(e.clientX, e.clientY, menuFor(null, false));
                });

                root.querySelectorAll('[data-goto]').forEach(el => on(el, 'click', () => go(el.dataset.goto)));
                root.querySelectorAll('[data-task]').forEach(el => on(el, 'click', () => {
                    const verb = verbs[el.dataset.task];
                    if (verb) verb();
                }));
            };

            // The keys a folder answered: F2 renames, Delete recycles, Ctrl+A
            // picks everything, Ctrl+X/C/V move things about, Backspace goes up.
            root.addEventListener('keydown', e => {
                if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
                const ctrl = e.ctrlKey || e.metaKey;
                const key = e.key;
                let handled = true;
                if (key === 'F2') verbs.rename();
                else if (key === 'Delete') verbs.delete();
                else if (key === 'Backspace') { const p = parentOf(st.path); if (p) go(p); }
                else if (ctrl && key.toLowerCase() === 'a') verbs.selectall();
                else if (ctrl && key.toLowerCase() === 'c') verbs.copy();
                else if (ctrl && key.toLowerCase() === 'x') verbs.cut();
                else if (ctrl && key.toLowerCase() === 'v') verbs.paste();
                else handled = false;
                if (handled) { e.preventDefault(); e.stopPropagation(); }
            });

            const entry = { render: render };
            openFolders.add(entry);
            win.addEventListener('hypernet-closed', () => openFolders.delete(entry));

            render();
            return win;
        },

        // Redraw every folder that is open. Folder Options calls this when one
        // of its switches is flipped, so the window the player was looking at
        // answers rather than the next one they open.
        redrawAll: function() {
            openFolders.forEach(entry => {
                try { entry.render(); } catch (e) { openFolders.delete(entry); }
            });
        }
    };

    // Register applications in HypernetOS for My Computer and My Documents
    if (window.HypernetOS) {
        // My Computer
        window.HypernetOS.registerApp({
            id: 'my-computer',
            name: T('MyComputer.myComputer'),
            icon: 86,
            launchFn: function() {
                window.HypernetMyComputer.launch(window.HypernetMyComputer.MY_COMPUTER);
            },
            desktopShortcut: true
        });

        // My Documents
        window.HypernetOS.registerApp({
            id: 'my-documents',
            name: T('MyComputer.myDocuments'),
            icon: 191,
            launchFn: function() {
                window.HypernetMyComputer.launch('C:/Documents');
            },
            desktopShortcut: true
        });
    }

})();
