/*:
 * @target MZ
 * @plugindesc v1.0.0 Simulated Notepad text editor application for HypernetOS.
 * @author Omni-Lex
 * 
 * @help
 * HypernetNotepad.js
 * 
 * Launches Notepad editor:
 * window.HypernetOS.launchApp('app-hypernet-notepad')
 * 
 * Launches Notepad and loads a specific file:
 * window.HypernetNotepad.openFile('C:/Documents/welcome.txt')
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

    window.HypernetNotepad = {
        openFile: function(path) {
            const content = window.HypernetFileSystem ? window.HypernetFileSystem.readFile(path) : '';
            this.launch(path, content);
        },

        // An unsaved note with this text in it (the ClipBook's paste).
        openText: function(text) {
            this.launch('', text || '');
        },

        launch: function(path = '', content = '') {
            if (!window.HypernetOS || !window.HypernetOS.WindowManager) {
                console.error("HypernetOS core not loaded!");
                return;
            }

            if (content == null) content = '';

            const id = 'app-hypernet-notepad';
            const fileName = path ? path.substring(path.lastIndexOf('/') + 1)
                : T('HypernetNotepad.untitled');
            const title = T('HypernetNotepad.windowTitle', { file: fileName });
            
            const contentHTML = `
                <div class="notepad-container hn-style-0098" >
                    <!-- Menu Bar -->
                    <div class="notepad-menu-bar hn-style-0099" >
                        <div class="notepad-menu-item focusable hn-style-0100"  id="notepad-menu-file" tabindex="0">
                            <u>F</u>${T('HypernetNotepad.menuFileTail')}
                            <div class="notepad-dropdown hn-style-0101" id="notepad-file-dropdown" >
                                <div class="notepad-dropdown-action focusable hn-style-0102" id="action-save" tabindex="0" >${T('HypernetNotepad.save')}</div>
                                <div class="notepad-dropdown-action focusable hn-style-0103" id="action-exit" tabindex="0" >${T('HypernetNotepad.exit')}</div>
                            </div>
                        </div>
                        <div class="notepad-menu-item hn-style-0104" >${T('HypernetNotepad.menuEdit')}</div>
                        <div class="notepad-menu-item hn-style-0104" >${T('HypernetNotepad.menuFormat')}</div>
                        <div class="notepad-menu-item hn-style-0104" >${T('HypernetNotepad.menuHelp')}</div>
                    </div>
                    
                    <!-- TextArea Editor -->
                    <textarea class="notepad-textarea hn-style-0105" id="notepad-text-content"  spellcheck="false"></textarea>
                    
                    <!-- Footer Status Bar -->
                    <div class="notepad-status-bar hn-style-0106" >
                        Ln 1, Col ${content.length + 1}
                    </div>
                </div>

                
            `;

            const win = window.HypernetOS.WindowManager.createWindow({
                id: id,
                title: title,
                icon: 190, // Scroll/Text document icon
                width: 620,
                height: 460,
                contentHTML: contentHTML
            });

            // Handle Menu Dropdowns
            const fileMenu = win.querySelector('#notepad-menu-file');
            const fileDropdown = win.querySelector('#notepad-file-dropdown');
            const saveBtn = win.querySelector('#action-save');
            const exitBtn = win.querySelector('#action-exit');
            const textarea = win.querySelector('#notepad-text-content');
            // Set content via value (not innerHTML) so a file containing </textarea> or
            // other markup cannot break out of the element.
            if (textarea) textarea.value = content;

            fileMenu.addEventListener('click', (e) => {
                e.stopPropagation();
                const show = fileDropdown.style.display === 'flex';
                fileDropdown.style.display = show ? 'none' : 'flex';
            });

            // Close dropdown when clicking outside
            const closeDropdown = () => {
                fileDropdown.style.display = 'none';
            };
            document.addEventListener('click', closeDropdown);
            win.addEventListener('hypernet-closed', () => {
                document.removeEventListener('click', closeDropdown);
            });

            // Save Function
            saveBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                fileDropdown.style.display = 'none';
                
                // The name is asked for in the shell's Save As box, so the
                // save finishes when the box does. A document that already has
                // a name is written straight back over itself.
                const ask = path ? Promise.resolve(path)
                    : window.HypernetOS.Dialog.saveFileBox({
                        title: T('HypernetNotepad.saveTitle'),
                        path: NOTEPAD_DIR,
                        fileName: 'note.txt',   // i18n-ignore  default file name
                        filters: [
                            { label: T('HypernetOS.xp.filebox.textFiles'), ext: 'txt' },
                            { label: T('HypernetOS.xp.filebox.allFiles'), ext: '*' }
                        ]
                    }).then(picked => picked && (picked.toLowerCase().endsWith('.txt') ? picked : picked + '.txt'));
                ask.then(targetPath => {
                if (!targetPath) return; // Cancelled

                if (window.HypernetFileSystem && window.HypernetFileSystem.writeFile(targetPath, textarea.value)) {
                    path = targetPath;
                    const finalFileName = path.substring(path.lastIndexOf('/') + 1);
                    win.dataset.title = T('HypernetNotepad.windowTitle', { file: finalFileName });
                    
                    const titleText = win.querySelector('.hypernet-window-title');
                    if (titleText) {
                        titleText.innerHTML = win.dataset.iconHTML + ' '
                            + T('HypernetNotepad.windowTitle', { file: escapeHtml(finalFileName) });
                    }
                    if (window.SoundManager) SoundManager.playOk();
                } else {
                    window.HypernetOS.Dialog.error(T('HypernetNotepad.writeError'));
                }
                });
            });

            // Exit Function
            exitBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.HypernetOS.WindowManager.closeWindow(win);
            });

            // Auto-focus textarea
            setTimeout(() => {
                textarea.focus();
                // Move cursor to end of text
                textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
            }, 250);
        }
    };

    // Where a plain text document lives unless the player says otherwise. The
    // Save As box opens here and walks anywhere from there.
    const NOTEPAD_DIR = 'C:/Documents';  // i18n-ignore  VFS path

    // Register Notepad application inside HypernetOS App registry
    if (window.HypernetOS) {
        window.HypernetOS.registerApp({
            id: 'app-hypernet-notepad',
            name: T('HypernetNotepad.appName'),
            icon: 190,
            launchFn: function() {
                window.HypernetNotepad.launch();
            },
            desktopShortcut: true
        });
    }


    // =========================================================================
    // Omni Office 2003: Wyrd (the word processor) and Hexcel (the spreadsheet)
    // =========================================================================
    // The two office programs share Notepad's file habits: a document lives in
    // the virtual file system under C:/Documents, Wyrd writes Markdown and
    // Hexcel writes CSV, and My Computer opens either by extension. Wyrd edits
    // Markdown source with a formatting toolbar and a print preview, and can
    // drop any picture from img/pictures in as clip art. Hexcel is a 26 x 50
    // grid with a formula bar: =A1+B2*2, =SUM(A1:A9), AVG, MIN, MAX, COUNT.
    const OFFICE_DIR = 'C:/Documents';  // i18n-ignore  VFS path
    const WYRD_APP_ID = 'app-wyrd';
    const HEXCEL_APP_ID = 'app-hexcel';
    const HEXCEL_COLS = 26, HEXCEL_ROWS = 50;
    const PICTURES_DIR = 'img/pictures';  // i18n-ignore  asset path

    // ---- Markdown, the small subset Wyrd writes -----------------------------
    function wyrdInline(s) {
        return escapeHtml(s)
            .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, src) => `<img class="wyrd-clip" alt="${alt}" src="${src}">`)
            .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
            .replace(/\*([^*]+)\*/g, '<i>$1</i>')
            .replace(/__([^_]+)__/g, '<u>$1</u>')
            .replace(/~~([^~]+)~~/g, '<s>$1</s>')
            .replace(/`([^`]+)`/g, '<code>$1</code>');
    }

    function wyrdRender(md) {
        const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
        const out = [];
        let list = null;
        const closeList = () => { if (list) { out.push(list === 'ul' ? '</ul>' : '</ol>'); list = null; } };
        lines.forEach(line => {
            const h = /^(#{1,3})\s+(.*)$/.exec(line);
            const ul = /^[-*]\s+(.*)$/.exec(line);
            const ol = /^\d+[.)]\s+(.*)$/.exec(line);
            const center = /^->\s*(.*?)\s*<-$/.exec(line);
            if (h) { closeList(); out.push(`<h${h[1].length}>${wyrdInline(h[2])}</h${h[1].length}>`); }
            else if (ul) { if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${wyrdInline(ul[1])}</li>`); }
            else if (ol) { if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${wyrdInline(ol[1])}</li>`); }
            else if (center) { closeList(); out.push(`<p class="wyrd-center">${wyrdInline(center[1])}</p>`); }
            else if (/^---+$/.test(line.trim())) { closeList(); out.push('<hr>'); }
            else if (!line.trim()) { closeList(); }
            else { closeList(); out.push(`<p>${wyrdInline(line)}</p>`); }
        });
        closeList();
        return out.join('\n');
    }

    function wyrdWordCount(md) {
        const words = String(md || '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').match(/[^\s#*_~`>-]+/g);
        return words ? words.length : 0;
    }

    // Every picture that can be dropped in as clip art (desktop only).
    function wyrdClipArt() {
        if (typeof require !== 'function') return [];
        try {
            const fs = require('fs'), path = require('path');
            const dir = path.join(process.cwd(), PICTURES_DIR);
            return fs.readdirSync(dir)
                .filter(f => /\.(png|png_|jpg|jpeg|gif|webp)$/i.test(f))
                .map(f => f.replace(/_$/, ''))
                .filter((f, i, arr) => arr.indexOf(f) === i)
                .sort((a, b) => a.localeCompare(b));
        } catch (e) { return []; }
    }

    // ---- CSV ------------------------------------------------------------------
    function csvParse(text) {
        const rows = [];
        let row = [], cell = '', quoted = false;
        const src = String(text || '').replace(/\r\n/g, '\n');
        for (let i = 0; i < src.length; i++) {
            const ch = src[i];
            if (quoted) {
                if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
                else cell += ch;
            } else if (ch === '"') quoted = true;
            else if (ch === ',') { row.push(cell); cell = ''; }
            else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
            else cell += ch;
        }
        if (cell.length || row.length) { row.push(cell); rows.push(row); }
        return rows;
    }

    function csvStringify(rows) {
        return rows.map(r => r.map(v => {
            const s = String(v == null ? '' : v);
            return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        }).join(',')).join('\n');
    }

    // ---- Formulas -------------------------------------------------------------
    function colName(c) { return String.fromCharCode(65 + c); }
    function cellName(c, r) { return colName(c) + (r + 1); }
    function parseRef(ref) {
        const m = /^([A-Z])(\d+)$/.exec(ref.toUpperCase());
        if (!m) return null;
        return { c: m[1].charCodeAt(0) - 65, r: parseInt(m[2], 10) - 1 };
    }

    // Evaluates one cell of a sheet ({ 'A1': '=SUM(B1:B3)', ... }). Returns a
    // number, a string, or an error tag. `depth` guards circular references.
    function hexcelEval(sheet, key, depth) {
        depth = depth || 0;
        const raw = sheet[key];
        if (raw == null || raw === '') return '';
        const s = String(raw);
        if (s[0] !== '=') { const n = Number(s); return s.trim() !== '' && Number.isFinite(n) ? n : s; }
        if (depth > 40) return '#CIRC';  // i18n-ignore  spreadsheet error tag
        const valueOf = ref => {
            const v = hexcelEval(sheet, ref.toUpperCase(), depth + 1);
            if (typeof v === 'string' && v[0] === '#') throw new Error(v);
            return typeof v === 'number' ? v : (v === '' ? 0 : Number(v) || 0);
        };
        const rangeValues = (a, b) => {
            const p = parseRef(a), q = parseRef(b);
            if (!p || !q) throw new Error('#REF');  // i18n-ignore  spreadsheet error tag
            const vals = [];
            for (let r = Math.min(p.r, q.r); r <= Math.max(p.r, q.r); r++)
                for (let c = Math.min(p.c, q.c); c <= Math.max(p.c, q.c); c++) {
                    const k = cellName(c, r);
                    if (sheet[k] != null && sheet[k] !== '') vals.push(valueOf(k));
                }
            return vals;
        };
        const fns = {
            SUM: v => v.reduce((a, b) => a + b, 0),
            AVG: v => v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0,
            AVERAGE: v => v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0,
            MIN: v => v.length ? Math.min.apply(null, v) : 0,
            MAX: v => v.length ? Math.max.apply(null, v) : 0,
            COUNT: v => v.length,
            ABS: v => Math.abs(v[0] || 0),
            ROUND: v => Math.round(v[0] || 0),
            SQRT: v => Math.sqrt(v[0] || 0)
        };
        try {
            let expr = s.slice(1).toUpperCase();
            // Functions over ranges and argument lists.
            expr = expr.replace(/([A-Z]+)\(([^()]*)\)/g, (m, fn, args) => {
                if (!fns[fn]) throw new Error('#NAME');  // i18n-ignore  spreadsheet error tag
                const vals = [];
                args.split(',').map(a => a.trim()).filter(Boolean).forEach(a => {
                    const range = /^([A-Z]\d+):([A-Z]\d+)$/.exec(a);
                    if (range) vals.push.apply(vals, rangeValues(range[1], range[2]));
                    else if (parseRef(a)) vals.push(valueOf(a));
                    else { const n = Number(a); if (!Number.isFinite(n)) throw new Error('#VALUE'); vals.push(n); }  // i18n-ignore  spreadsheet error tag
                });
                return String(fns[fn](vals));
            });
            expr = expr.replace(/[A-Z]\d+/g, ref => '(' + valueOf(ref) + ')');
            if (!/^[\d\s+\-*/().eE%^]*$/.test(expr)) throw new Error('#VALUE');  // i18n-ignore  spreadsheet error tag
            expr = expr.replace(/\^/g, '**');
            const result = Function('"use strict"; return (' + expr + ');')();
            if (!Number.isFinite(result)) return '#DIV0';  // i18n-ignore  spreadsheet error tag
            return Math.round(result * 1e6) / 1e6;
        } catch (e) {
            const msg = String(e && e.message || '');
            return msg[0] === '#' ? msg : '#VALUE';  // i18n-ignore  spreadsheet error tag
        }
    }

    function sheetFromRows(rows) {
        const sheet = {};
        rows.forEach((row, r) => row.forEach((v, c) => { if (v !== '' && c < HEXCEL_COLS && r < HEXCEL_ROWS) sheet[cellName(c, r)] = v; }));
        return sheet;
    }

    function rowsFromSheet(sheet) {
        let maxR = -1, maxC = -1;
        Object.keys(sheet).forEach(k => { const p = parseRef(k); if (p && sheet[k] !== '') { maxR = Math.max(maxR, p.r); maxC = Math.max(maxC, p.c); } });
        const rows = [];
        for (let r = 0; r <= maxR; r++) { const row = []; for (let c = 0; c <= maxC; c++) row.push(sheet[cellName(c, r)] || ''); rows.push(row); }
        return rows;
    }

    // ---- The two windows --------------------------------------------------------
    function retitle(win, title) {
        win.dataset.title = title;
        const tt = win.querySelector('.hypernet-window-title');
        if (tt) tt.innerHTML = win.dataset.iconHTML + ' ' + escapeHtml(title);
        if (window.HypernetOS.refreshTaskbarTabs) window.HypernetOS.refreshTaskbarTabs();
    }

    // Both resolve through the OS's own boxes: officeSave with true once the
    // file is written (false when cancelled or failed), officeOpen with the
    // { path, content } picked, or null.
    function officeSave(win, st, ext, content, mime, T_) {
        const fs = window.HypernetFileSystem;
        if (!fs) return Promise.resolve(false);
        const D = window.HypernetOS.Dialog;
        const ask = st.path ? Promise.resolve(st.path)
            : D.saveFileBox({
                title: T_('appName'),
                path: OFFICE_DIR,
                fileName: T_('untitledFile') + '.' + ext,
                filters: officeFilters(ext)
            }).then(picked => picked && (picked.toLowerCase().endsWith('.' + ext) ? picked : picked + '.' + ext));
        return ask.then(path => {
            if (!path) return false;
            if (!fs.writeFile(path, content, mime)) { D.error(T('HypernetNotepad.writeError')); return false; }
            st.path = path;
            retitle(win, T_('title', { file: path.slice(path.lastIndexOf('/') + 1) }));
            if (window.SoundManager) SoundManager.playOk();
            return true;
        });
    }

    // The type row of the Open and Save As boxes: this program's own documents
    // first, everything else under it, the way a program of the period listed
    // what it could read.
    function officeFilters(ext) {
        const own = { txt: 'textFiles', md: 'docFiles', csv: 'sheetFiles', png: 'imageFiles' }[ext];
        const out = [];
        if (own) out.push({ label: T('HypernetOS.xp.filebox.' + own), ext: ext });
        out.push({ label: T('HypernetOS.xp.filebox.allFiles'), ext: '*' });
        return out;
    }

    function officeOpen(ext, T_) {
        const D = window.HypernetOS.Dialog;
        return D.openFileBox({
            title: T_('appName'),
            path: OFFICE_DIR,
            filters: officeFilters(ext)
        }).then(path => {
            if (!path) return null;
            const content = window.HypernetFileSystem.readFile(path);
            if (content == null) { D.error(T_('openError')); return null; }
            return { path, content };
        });
    }

    const Wyrd = {
        render: wyrdRender,
        wordCount: wyrdWordCount,
        clipArt: wyrdClipArt,
        _pending: null,

        openFile: function(path) {
            const content = window.HypernetFileSystem ? window.HypernetFileSystem.readFile(path) : null;
            if (content == null) return false;
            this._pending = { path, content };
            window.HypernetOS.launchApp(WYRD_APP_ID);
            return true;
        },

        launch: function() {
            const OS = window.HypernetOS;
            if (!OS || !OS.WindowManager) return;
            const T_ = (k, p) => T('HypernetNotepad.wyrd.' + k, p);
            const tb = (id, label, title) => `<button class="office-tb focusable" id="wyrd-${id}" title="${escapeHtml(title || label)}">${label}</button>`;
            const html = `
                <div class="office wyrd">
                    <div class="office-menu">
                        <span class="office-menu-item focusable" tabindex="0" id="wyrd-new">${T_('new')}</span>
                        <span class="office-menu-item focusable" tabindex="0" id="wyrd-open">${T_('open')}</span>
                        <span class="office-menu-item focusable" tabindex="0" id="wyrd-save">${T_('save')}</span>
                        <span class="office-menu-item focusable" tabindex="0" id="wyrd-saveas">${T_('saveAs')}</span>
                        <span class="office-menu-item focusable" tabindex="0" id="wyrd-preview">${T_('preview')}</span>
                    </div>
                    <div class="office-toolbar">
                        ${tb('bold', '<b>B</b>', T_('bold'))}${tb('italic', '<i>I</i>', T_('italic'))}${tb('underline', '<u>U</u>', T_('underline'))}${tb('strike', '<s>S</s>', T_('strike'))}
                        <span class="office-tb-sep"></span>
                        ${tb('h1', 'H1', T_('heading1'))}${tb('h2', 'H2', T_('heading2'))}${tb('h3', 'H3', T_('heading3'))}
                        <span class="office-tb-sep"></span>
                        ${tb('ul', '&bull;', T_('bullets'))}${tb('ol', '1.', T_('numbering'))}${tb('center', '&#8596;', T_('center'))}${tb('rule', '&#8213;', T_('rule'))}
                        <span class="office-tb-sep"></span>
                        <select id="wyrd-clip" class="focusable" title="${escapeHtml(T_('clipArt'))}"><option value="">${T_('clipArt')}</option></select>
                    </div>
                    <div class="office-body">
                        <textarea id="wyrd-source" class="wyrd-source" spellcheck="false"></textarea>
                        <div id="wyrd-page" class="wyrd-page" hidden></div>
                    </div>
                    <div class="office-status"><span id="wyrd-status"></span><span id="wyrd-words"></span></div>
                </div>`;
            const win = OS.WindowManager.createWindow({ id: WYRD_APP_ID, title: T_('untitledTitle'), icon: 189, width: 720, height: 560, contentHTML: html });
            const pending = this._pending; this._pending = null;
            if (win._wyrdBound) { if (pending) win._wyrdLoad(pending); return; }
            win._wyrdBound = true;

            const q = s => win.querySelector(s);
            const src = q('#wyrd-source'), page = q('#wyrd-page');
            const st = { path: null, preview: false };
            const words = () => { q('#wyrd-words').textContent = T_('words', { n: wyrdWordCount(src.value) }); };
            win._wyrdLoad = (file) => { src.value = file.content; st.path = file.path; retitle(win, T_('title', { file: file.path.slice(file.path.lastIndexOf('/') + 1) })); words(); if (st.preview) page.innerHTML = wyrdRender(src.value); };

            const wrap = (before, after) => {
                const a = src.selectionStart, b = src.selectionEnd;
                const sel = src.value.slice(a, b) || T_('placeholder');
                src.value = src.value.slice(0, a) + before + sel + (after == null ? before : after) + src.value.slice(b);
                src.focus(); src.selectionStart = a + before.length; src.selectionEnd = a + before.length + sel.length; words();
            };
            const linePrefix = (prefix) => {
                const a = src.selectionStart;
                const start = src.value.lastIndexOf('\n', a - 1) + 1;
                src.value = src.value.slice(0, start) + prefix + src.value.slice(start);
                src.focus(); src.selectionStart = src.selectionEnd = a + prefix.length; words();
            };
            q('#wyrd-bold').addEventListener('click', e => { e.stopPropagation(); wrap('**'); });
            q('#wyrd-italic').addEventListener('click', e => { e.stopPropagation(); wrap('*'); });
            q('#wyrd-underline').addEventListener('click', e => { e.stopPropagation(); wrap('__'); });
            q('#wyrd-strike').addEventListener('click', e => { e.stopPropagation(); wrap('~~'); });
            q('#wyrd-h1').addEventListener('click', e => { e.stopPropagation(); linePrefix('# '); });
            q('#wyrd-h2').addEventListener('click', e => { e.stopPropagation(); linePrefix('## '); });
            q('#wyrd-h3').addEventListener('click', e => { e.stopPropagation(); linePrefix('### '); });
            q('#wyrd-ul').addEventListener('click', e => { e.stopPropagation(); linePrefix('- '); });
            q('#wyrd-ol').addEventListener('click', e => { e.stopPropagation(); linePrefix('1. '); });
            q('#wyrd-center').addEventListener('click', e => { e.stopPropagation(); wrap('-> ', ' <-'); });
            q('#wyrd-rule').addEventListener('click', e => { e.stopPropagation(); const a = src.selectionStart; src.value = src.value.slice(0, a) + '\n---\n' + src.value.slice(a); src.focus(); });

            const clip = q('#wyrd-clip');
            wyrdClipArt().forEach(f => { const o = document.createElement('option'); o.value = f; o.textContent = f.replace(/\.[^.]+$/, ''); clip.appendChild(o); });
            clip.addEventListener('change', () => {
                if (!clip.value) return;
                const a = src.selectionStart;
                const tag = '\n![' + clip.value.replace(/\.[^.]+$/, '') + '](' + PICTURES_DIR + '/' + clip.value + ')\n';
                src.value = src.value.slice(0, a) + tag + src.value.slice(a);
                clip.value = ''; src.focus(); words();
            });

            src.addEventListener('input', words);
            src.addEventListener('keydown', e => e.stopPropagation());
            q('#wyrd-preview').addEventListener('click', e => {
                e.stopPropagation();
                st.preview = !st.preview;
                page.hidden = !st.preview; src.hidden = st.preview;
                if (st.preview) page.innerHTML = wyrdRender(src.value);
                q('#wyrd-preview').textContent = st.preview ? T_('edit') : T_('preview');
            });
            q('#wyrd-new').addEventListener('click', e => { e.stopPropagation(); src.value = ''; st.path = null; retitle(win, T_('untitledTitle')); words(); });
            q('#wyrd-save').addEventListener('click', e => { e.stopPropagation(); officeSave(win, st, 'md', src.value, 'md', T_).then(ok => { if (ok) q('#wyrd-status').textContent = T_('saved', { file: st.path }); }); });
            q('#wyrd-saveas').addEventListener('click', e => { e.stopPropagation(); st.path = null; officeSave(win, st, 'md', src.value, 'md', T_).then(ok => { if (ok) q('#wyrd-status').textContent = T_('saved', { file: st.path }); }); });
            q('#wyrd-open').addEventListener('click', e => { e.stopPropagation(); officeOpen('md', T_).then(f => { if (f) win._wyrdLoad(f); }); });

            words();
            if (pending) win._wyrdLoad(pending);
            setTimeout(() => src.focus(), 250);
        }
    };

    const Hexcel = {
        COLS: HEXCEL_COLS, ROWS: HEXCEL_ROWS,
        eval: hexcelEval,
        csvParse, csvStringify, sheetFromRows, rowsFromSheet, cellName, parseRef,
        _pending: null,

        openFile: function(path) {
            const content = window.HypernetFileSystem ? window.HypernetFileSystem.readFile(path) : null;
            if (content == null) return false;
            this._pending = { path, content };
            window.HypernetOS.launchApp(HEXCEL_APP_ID);
            return true;
        },

        launch: function() {
            const OS = window.HypernetOS;
            if (!OS || !OS.WindowManager) return;
            const T_ = (k, p) => T('HypernetNotepad.hexcel.' + k, p);
            let grid = '<table class="hexcel-grid"><thead><tr><th class="hexcel-corner"></th>';
            for (let c = 0; c < HEXCEL_COLS; c++) grid += `<th>${colName(c)}</th>`;
            grid += '</tr></thead><tbody>';
            for (let r = 0; r < HEXCEL_ROWS; r++) {
                grid += `<tr><th>${r + 1}</th>`;
                for (let c = 0; c < HEXCEL_COLS; c++) grid += `<td class="hexcel-cell focusable" tabindex="0" data-cell="${cellName(c, r)}"></td>`;
                grid += '</tr>';
            }
            grid += '</tbody></table>';
            const html = `
                <div class="office hexcel">
                    <div class="office-menu">
                        <span class="office-menu-item focusable" tabindex="0" id="hexcel-new">${T_('new')}</span>
                        <span class="office-menu-item focusable" tabindex="0" id="hexcel-open">${T_('open')}</span>
                        <span class="office-menu-item focusable" tabindex="0" id="hexcel-save">${T_('save')}</span>
                        <span class="office-menu-item focusable" tabindex="0" id="hexcel-saveas">${T_('saveAs')}</span>
                        <span class="office-menu-item focusable" tabindex="0" id="hexcel-sum">${T_('autoSum')}</span>
                    </div>
                    <div class="hexcel-formula-bar">
                        <span class="hexcel-name" id="hexcel-name">A1</span>
                        <span class="hexcel-fx">fx</span>
                        <input id="hexcel-formula" class="focusable" type="text" spellcheck="false">
                    </div>
                    <div class="hexcel-scroll">${grid}</div>
                    <div class="office-status"><span id="hexcel-status"></span><span id="hexcel-hint">${T_('hint')}</span></div>
                </div>`;
            const win = OS.WindowManager.createWindow({ id: HEXCEL_APP_ID, title: T_('untitledTitle'), icon: 233, width: 760, height: 560, contentHTML: html });
            const pending = this._pending; this._pending = null;
            if (win._hexcelBound) { if (pending) win._hexcelLoad(pending); return; }
            win._hexcelBound = true;

            const q = s => win.querySelector(s);
            const formula = q('#hexcel-formula');
            const st = { path: null, sheet: {}, active: 'A1' };
            const cellEl = key => win.querySelector(`.hexcel-cell[data-cell="${key}"]`);

            const recalc = () => {
                win.querySelectorAll('.hexcel-cell').forEach(td => {
                    const key = td.dataset.cell;
                    const v = hexcelEval(st.sheet, key);
                    td.textContent = v === '' ? '' : String(v);
                    td.classList.toggle('num', typeof v === 'number');
                    td.classList.toggle('err', typeof v === 'string' && v[0] === '#');
                });
            };
            const select = key => {
                const prev = cellEl(st.active); if (prev) prev.classList.remove('active');
                st.active = key;
                const el = cellEl(key); if (el) { el.classList.add('active'); if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
                q('#hexcel-name').textContent = key;
                formula.value = st.sheet[key] || '';
            };
            const commit = () => {
                const v = formula.value;
                if (v === '') delete st.sheet[st.active]; else st.sheet[st.active] = v;
                recalc();
            };
            const move = (dc, dr) => {
                const p = parseRef(st.active);
                const c = Math.max(0, Math.min(HEXCEL_COLS - 1, p.c + dc)), r = Math.max(0, Math.min(HEXCEL_ROWS - 1, p.r + dr));
                select(cellName(c, r));
            };
            win._hexcelLoad = (file) => { st.sheet = sheetFromRows(csvParse(file.content)); st.path = file.path; retitle(win, T_('title', { file: file.path.slice(file.path.lastIndexOf('/') + 1) })); recalc(); select('A1'); };

            win.querySelectorAll('.hexcel-cell').forEach(td => {
                td.addEventListener('click', e => { e.stopPropagation(); select(td.dataset.cell); formula.focus(); });
                td.addEventListener('dblclick', e => { e.stopPropagation(); select(td.dataset.cell); formula.focus(); formula.select(); });
            });
            formula.addEventListener('keydown', e => {
                e.stopPropagation();
                if (e.key === 'Enter') { e.preventDefault(); commit(); move(0, e.shiftKey ? -1 : 1); }
                else if (e.key === 'Tab') { e.preventDefault(); commit(); move(e.shiftKey ? -1 : 1, 0); }
                else if (e.key === 'Escape') { formula.value = st.sheet[st.active] || ''; formula.blur(); }
                else if (e.key === 'ArrowDown' && !formula.value.startsWith('=')) { e.preventDefault(); commit(); move(0, 1); }
                else if (e.key === 'ArrowUp' && !formula.value.startsWith('=')) { e.preventDefault(); commit(); move(0, -1); }
            });
            formula.addEventListener('blur', commit);

            q('#hexcel-sum').addEventListener('click', e => {
                e.stopPropagation();
                const p = parseRef(st.active);
                let top = p.r - 1;
                while (top >= 0 && typeof hexcelEval(st.sheet, cellName(p.c, top)) === 'number') top--;
                if (top === p.r - 1) return;
                formula.value = '=SUM(' + cellName(p.c, top + 1) + ':' + cellName(p.c, p.r - 1) + ')';  // i18n-ignore  formula
                commit();
            });
            q('#hexcel-new').addEventListener('click', e => { e.stopPropagation(); st.sheet = {}; st.path = null; retitle(win, T_('untitledTitle')); recalc(); select('A1'); });
            const save = () => { officeSave(win, st, 'csv', csvStringify(rowsFromSheet(st.sheet)), 'csv', T_).then(ok => { if (ok) q('#hexcel-status').textContent = T_('saved', { file: st.path }); }); };
            q('#hexcel-save').addEventListener('click', e => { e.stopPropagation(); commit(); save(); });
            q('#hexcel-saveas').addEventListener('click', e => { e.stopPropagation(); commit(); st.path = null; save(); });
            q('#hexcel-open').addEventListener('click', e => { e.stopPropagation(); officeOpen('csv', T_).then(f => { if (f) win._hexcelLoad(f); }); });

            recalc();
            select('A1');
            if (pending) win._hexcelLoad(pending);
        }
    };

    window.HypernetOffice = { Wyrd, Hexcel, DIR: OFFICE_DIR };

    if (window.HypernetOS) {
        window.HypernetOS.registerApp({
            id: WYRD_APP_ID,
            name: T('HypernetNotepad.wyrd.appName'),
            icon: 189,
            category: 'office',
            launchFn: () => Wyrd.launch(),
            desktopShortcut: true
        });
        window.HypernetOS.registerApp({
            id: HEXCEL_APP_ID,
            name: T('HypernetNotepad.hexcel.appName'),
            icon: 233,
            category: 'office',
            launchFn: () => Hexcel.launch(),
            desktopShortcut: true
        });
    }

})();
