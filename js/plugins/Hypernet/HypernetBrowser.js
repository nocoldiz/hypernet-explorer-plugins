/*:
 * @target MZ
 * @plugindesc v3.0.0 Hypernet Explorer: the browser app of HypernetOS, chrome and all.
 * @author Omni-Lex
 *
 * @help
 * HypernetBrowser.js
 *
 * THE CHROME BELONGS TO THE PLUGIN
 * The browser used to be an iframe onto hypernet-explorer.html, which drew its
 * own menu bar, toolbar, favorites bar and status bar inside the OS window.
 * Every one of those is drawn here now, in the same Luna style the rest of
 * HypernetOS is drawn in, and the iframe is only the document viewport. That
 * is what lets the menus reach the OS (windows, the virtual file system, the
 * registry) and what lets a page be read, searched, saved, printed and
 * inspected rather than only displayed.
 *
 * WHERE A PAGE COMES FROM
 * Every document lives under hypernet/ as a flat file. The archive addresses
 * pages logically (www.emwitch.org/spells) while the files on disk are flat
 * (hypernet/emwitch.org-spells.html), a folder per site where a site is big
 * enough to want one (hypernet/hexapedia/beagle.html), and a handful of files
 * carry their extension twice. window.HypernetSites is the one answer to
 * "which file is this address", and it answers off a real index rather than by
 * string surgery:
 *
 *   1. NW.js: a live recursive listing of hypernet/, always current.
 *   2. Any other runtime: hypernet/manifest.json, written by
 *      tools/hypernet/gen_site_manifest.js. Re-run it after adding a page.
 *   3. Neither: the links in the site database, so the archive is still
 *      reachable even with no listing at all.
 *
 * The index is keyed by lowercase path, so an address resolves the same way on
 * a case-insensitive file system (Windows) and a case-sensitive one (Linux,
 * macOS). Addresses are normalised before lookup: backslashes become slashes,
 * a scheme is stripped, so are "www.", a trailing slash, a query and a
 * fragment. Nothing anywhere assumes a path separator or a drive.
 *
 * WHAT IS FUNCTIONAL
 * Tabs (own history each), back/forward/stop/refresh/home, address bar with
 * autocomplete, Links bar, Explorer bar (Search / Favorites / History), find
 * on page, view source, save page into the OS file system, downloads, print
 * preview, page setup, zoom, text size, encoding, pop-up blocker (with real
 * pop-ups when it is off), mail and news, synchronize, connection status,
 * options, help, tip of the day, about, and a gateway 404 that suggests the
 * addresses it could have meant.
 *
 * Preferences, favorites, history and downloads live in the HypernetOS
 * registry, so they persist inside the savegame.
 *
 * Exposes:
 *   window.HypernetBrowserApp.launch()
 *   window.HypernetSites  (index + resolver, usable by any other app)
 *
 * Load AFTER: Hypernet/HypernetOS, Hypernet/HypernetFileSystem.
 */

(() => {
    'use strict';

    const APP_ID = 'app-hypernet-browser';
    const APP_ICON = 188;              // Globe, per js/db/Sprites/Icons.json
    const SITE_DIR = 'hypernet';
    const SITE_DB_SCRIPT = 'hypernet-explorer.js';
    const DEFAULT_HOME = 'about:home';
    const MAX_HISTORY = 200;

    const t = (k, p) => T('HypernetBrowser.' + k, p);
    const tl = (k) => (T.list ? T.list('HypernetBrowser.' + k) : []);
    const to = (k) => (T.obj ? T.obj('HypernetBrowser.' + k) : {});

    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const isNw = () => {
        try { return typeof Utils !== 'undefined' && Utils.isNwjs(); } catch (e) { return false; }
    };

    // A stable number out of a string, so a page always draws the same pop-up
    // and the same search timing rather than a new one every visit.
    function hash(str) {
        let h = 2166136261;
        const s = String(str);
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return (h >>> 0);
    }

    // ── Site index ──────────────────────────────────────────────────────────
    // The gateway's catalogue of documents. Built once, from whichever source
    // the runtime can offer, and consulted for every address.

    const Sites = {
        _files: null,       // Map: lowercase relative path -> real relative path
        _bases: null,       // page paths without their extension, real case
        _baseSet: null,     // the same, lowercase, as a Set
        _source: 'none',

        ready() {
            if (!this._files) this._build();
            return this._files.size > 0;
        },

        // Built once and kept, unless a later source turns up (the site
        // database arrives asynchronously and is the last resort).
        invalidate() {
            this._files = null;
            this._bases = null;
            this._baseSet = null;
            this._domains = null;
            this._source = 'none';
        },

        source() { this.ready(); return this._source; },
        count() { this.ready(); return this._files.size; },

        _build() {
            this._files = new Map();
            let list = this._listFromFs();
            if (list && list.length) {
                this._source = 'fs';
            } else {
                list = this._listFromManifest();
                if (list && list.length) {
                    this._source = 'manifest';
                } else {
                    list = this._listFromDatabase();
                    this._source = list.length ? 'database' : 'none';
                }
            }
            list.forEach((rel) => {
                const clean = String(rel).replace(/\\/g, '/').replace(/^\/+/, '');
                if (clean) this._files.set(clean.toLowerCase(), clean);
            });
            this._bases = [];
            this._baseSet = new Set();
            this._files.forEach((real) => {
                if (!/\.html?$/i.test(real)) return;
                const base = real.replace(/\.html?$/i, '');
                this._bases.push(base);
                this._baseSet.add(base.toLowerCase());
            });
            this._bases.sort();
        },

        _listFromFs() {
            if (!isNw()) return null;
            try {
                const fs = require('fs');
                const path = require('path');
                const root = path.join(process.cwd(), SITE_DIR);
                if (!fs.existsSync(root)) return null;
                const out = [];
                const walk = (dir, prefix) => {
                    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
                        const rel = prefix ? prefix + '/' + entry.name : entry.name;
                        if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
                        else if (entry.isFile() && rel !== 'manifest.json') out.push(rel);
                    });
                };
                walk(root, '');
                return out;
            } catch (e) {
                return null;
            }
        },

        _listFromManifest() {
            try {
                const xhr = new XMLHttpRequest();
                xhr.open('GET', SITE_DIR + '/manifest.json', false);
                xhr.send();
                if (xhr.status !== 200 && xhr.status !== 0) return null;
                let text = xhr.responseText || '';
                if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
                const data = JSON.parse(text);
                return Array.isArray(data) ? data : (data.files || null);
            } catch (e) {
                return null;
            }
        },

        _listFromDatabase() {
            // The catalogue may already be on the page (another app loaded it),
            // in which case the archive is knowable without any listing at all.
            const db = SiteDb.rows().length ? SiteDb.rows() : SiteDb.peek();
            const out = [];
            db.forEach((row) => {
                const link = String(row.link || '');
                if (!link) return;
                const parts = link.split('/');
                const name = parts.length > 1 ? parts[0] + '-' + parts.slice(1).join('-') : parts[0];
                out.push(/\.html?$/i.test(name) ? name : name + '.html');
            });
            return out;
        },

        has(rel) { this.ready(); return this._files.has(String(rel).toLowerCase()); },
        real(rel) { this.ready(); return this._files.get(String(rel).toLowerCase()) || null; },
        bases() { this.ready(); return this._bases; },

        // The domain half of a flat page file. Domains carry dashes of their own
        // (craniumtech-forums.eu), so the split is data-driven: the domain is the
        // longest leading run that is itself a page in the archive.
        split(base) {
            this.ready();
            const lower = String(base).toLowerCase();
            for (let i = lower.length - 1; i > 0; i--) {
                if (lower[i] !== '-') continue;
                if (this._baseSet.has(lower.slice(0, i))) {
                    return { domain: base.slice(0, i), page: base.slice(i + 1) };
                }
            }
            const m = /^([a-z0-9_-]+(?:\.[a-z0-9_-]+)+)-(.+)$/i.exec(base);
            if (m) return { domain: m[1], page: m[2] };
            return { domain: base, page: '' };
        },

        // Every domain the archive holds, sorted, each with the pages under it.
        domains() {
            if (this._domains) return this._domains;
            this.ready();
            const map = new Map();
            this._bases.forEach((base) => {
                let domain, page;
                if (base.indexOf('/') !== -1) {
                    const parts = base.split('/');
                    domain = parts[0];
                    page = parts.slice(1).join('/');
                    if (/^index$/i.test(page)) page = '';
                } else {
                    const s = this.split(base);
                    domain = s.domain;
                    page = s.page;
                }
                if (!map.has(domain)) map.set(domain, []);
                if (page) map.get(domain).push(page);
            });
            this._domains = [...map.entries()]
                .map(([domain, pages]) => ({ domain, pages: pages.sort() }))
                .sort((a, b) => a.domain.localeCompare(b.domain));
            return this._domains;
        }
    };

    // ── Addresses ───────────────────────────────────────────────────────────

    const Addr = {
        // Strip everything that is decoration rather than address.
        normalize(input) {
            let s = String(input == null ? '' : input).trim().replace(/\\/g, '/');
            s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
            s = s.replace(/[?#].*$/, '');
            s = s.replace(/^\/+/, '').replace(/\/+$/, '');
            s = s.replace(/^www\./i, '');
            s = s.replace(new RegExp('^' + SITE_DIR + '/', 'i'), '');
            return s;
        },

        isInternal(input) {
            return /^(about|hnb):/i.test(String(input || '').trim());
        },

        isExternal(input) {
            const s = String(input || '').trim();
            if (/^mailto:/i.test(s)) return true;
            if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return false;
            return !/^(file|hypernet):\/\//i.test(s);
        },

        // Every file the address could name, best guess first.
        candidates(addr) {
            const out = [];
            const push = (p) => { if (p && out.indexOf(p) === -1) out.push(p); };
            const hadExt = /\.html?$/i.test(addr);
            const bare = hadExt ? addr.replace(/\.html?$/i, '') : addr;

            if (hadExt) {
                push(addr);
                // a few documents carry the extension twice
                push(addr + '.html');
            }
            push(bare + '.html');

            const parts = bare.split('/');
            if (parts.length > 1) {
                const domain = parts[0];
                const page = parts.slice(1).join('/');
                push(domain.replace(/\.[a-z.]+$/i, '') + '/' + page + '.html');
                push(domain + '/' + page + '.html');
                push(domain + '-' + parts.slice(1).join('-') + '.html');
                if (/^index$/i.test(page)) push(domain + '.html');
            } else {
                push(bare + '/index.html');
                push(bare.replace(/\.[a-z.]+$/i, '') + '/index.html');
            }
            return out;
        },

        // The file this address names, or null.
        toPath(input) {
            const addr = this.normalize(input);
            if (!addr) return null;
            const found = this.candidates(addr).find((c) => Sites.has(c));
            if (found) return SITE_DIR + '/' + Sites.real(found);

            // A bare name with no suffix: take the shortest domain it opens.
            const lower = addr.toLowerCase();
            const hit = Sites.bases()
                .filter((b) => b.toLowerCase().indexOf(lower + '.') === 0 && b.indexOf('-') === -1)
                .sort((a, b) => a.length - b.length)[0];
            return hit ? SITE_DIR + '/' + Sites.real(hit + '.html') : null;
        },

        // The address a file is known by, which is what the address bar shows.
        fromPath(path) {
            let rel = String(path || '').replace(/\\/g, '/');
            const cut = rel.toLowerCase().lastIndexOf(SITE_DIR + '/');
            if (cut >= 0) rel = rel.slice(cut + SITE_DIR.length + 1);
            const base = rel.replace(/\.html?$/i, '');
            if (base.indexOf('/') !== -1) {
                const parts = base.split('/');
                const page = parts.slice(1).join('/');
                const domain = parts[0].indexOf('.') === -1 ? parts[0] + '.com' : parts[0];
                return /^index$/i.test(page) ? 'www.' + domain : 'www.' + domain + '/' + page;
            }
            const s = Sites.split(base);
            return s.page ? 'www.' + s.domain + '/' + s.page : 'www.' + s.domain;
        },

        // An href inside a page, resolved against the page it was found on.
        resolveHref(fromPath, href) {
            const raw = String(href || '').trim();
            if (!raw || raw === '#' || /^javascript:/i.test(raw)) return null;
            if (this.isExternal(raw)) return { external: true, address: raw };
            if (this.isInternal(raw)) return { internal: true, address: raw };

            let target = raw.replace(/\\/g, '/').replace(/[?#].*$/, '');
            if (!target) return null;

            let dir = String(fromPath || '').replace(/\\/g, '/');
            dir = dir.slice(0, dir.lastIndexOf('/') + 1);
            let joined = /^\//.test(target) ? target.replace(/^\/+/, '') : dir + target;

            // Collapse . and .. without touching the host file system.
            const stack = [];
            joined.split('/').forEach((seg) => {
                if (!seg || seg === '.') return;
                if (seg === '..') stack.pop();
                else stack.push(seg);
            });
            joined = stack.join('/');

            if (Sites.has(joined.replace(new RegExp('^' + SITE_DIR + '/', 'i'), ''))) {
                return { path: SITE_DIR + '/' + Sites.real(joined.replace(new RegExp('^' + SITE_DIR + '/', 'i'), '')) };
            }
            const path = this.toPath(joined);
            if (path) return { path };
            return { missing: true, address: joined };
        },

        // The addresses nearest to one that did not resolve.
        suggest(input, limit) {
            const addr = this.normalize(input).toLowerCase();
            if (!addr) return [];
            const head = addr.split('/')[0];
            const scored = [];
            Sites.domains().forEach((entry) => {
                const d = entry.domain.toLowerCase();
                let score = 0;
                if (d.indexOf(head) === 0) score = 100 - Math.abs(d.length - head.length);
                else if (d.indexOf(head) !== -1) score = 60;
                else {
                    const stem = head.replace(/\.[a-z.]+$/, '');
                    if (stem.length > 2 && d.indexOf(stem) !== -1) score = 40;
                }
                if (score > 0) scored.push({ domain: entry.domain, score });
            });
            return scored.sort((a, b) => b.score - a.score).slice(0, limit || 6).map((s) => s.domain);
        }
    };

    // ── The site database (titles and abstracts for the search index) ───────
    // hypernet-explorer.js declares the catalogue as a top-level `const`, which
    // is a global lexical binding rather than a property of window. It is read
    // back through an indirect eval, which runs in global scope and can see it.

    const SiteDb = {
        _rows: null,
        _loading: false,
        _waiters: [],

        rows() { return this._rows || []; },
        loaded() { return this._rows !== null; },

        // The catalogue if some other script has already put it on the page.
        // hypernet-explorer.js declares it as a top-level `const`, a global
        // lexical binding rather than a property of window, and an indirect
        // eval is what can see one.
        peek() {
            try {
                // eslint-disable-next-line no-eval
                const found = (0, eval)(
                    'typeof hypernetDatabase !== "undefined" ? hypernetDatabase : ' +
                    '(typeof window !== "undefined" && window.hypernetDatabase) || null');
                return Array.isArray(found) ? found : [];
            } catch (e) {
                return [];
            }
        },

        load(cb) {
            if (this._rows) { if (cb) cb(this._rows); return; }
            if (cb) this._waiters.push(cb);
            if (this._loading) return;
            this._loading = true;

            const settle = (rows) => {
                this._rows = rows || [];
                this._loading = false;
                // With no directory listing and no manifest, the catalogue is
                // the only account of what the archive holds; the index waits
                // for it rather than staying empty.
                if (this._rows.length && !Sites.count()) Sites.invalidate();
                const waiters = this._waiters.splice(0);
                waiters.forEach((fn) => { try { fn(this._rows); } catch (e) { /* a waiter is not the loader's problem */ } });
            };

            const pick = () => {
                try {
                    // eslint-disable-next-line no-eval
                    const found = (0, eval)('typeof hypernetDatabase !== "undefined" ? hypernetDatabase : null');
                    return Array.isArray(found) ? found : null;
                } catch (e) {
                    return null;
                }
            };

            const already = pick();
            if (already) { settle(already); return; }

            const script = document.createElement('script');
            script.src = SITE_DB_SCRIPT;
            script.async = true;
            script.onload = () => settle(pick());
            script.onerror = () => settle(null);
            document.head.appendChild(script);
        },

        italian() {
            try {
                return String(ConfigManager.language || '').toLowerCase().indexOf('it') === 0;
            } catch (e) {
                return false;
            }
        },

        title(row) {
            const it = this.italian();
            return (it && row.title_it) ? row.title_it : (row.title || row.link || '');
        },

        abstract(row) {
            const it = this.italian();
            return (it && row.abstract_it) ? row.abstract_it : (row.abstract || '');
        },

        search(query) {
            const terms = String(query || '').toLowerCase().split(/\s+/).filter((s) => s.length);
            if (!terms.length) return [];
            const scored = [];
            this.rows().forEach((row) => {
                const hay = [this.title(row), row.title, row.keywords, this.abstract(row), row.abstract, row.link]
                    .filter(Boolean).join(' ').toLowerCase();
                let score = 0;
                terms.forEach((term) => {
                    let from = 0;
                    for (;;) {
                        const at = hay.indexOf(term, from);
                        if (at === -1) break;
                        score++;
                        from = at + term.length;
                    }
                    if (String(this.title(row)).toLowerCase().indexOf(term) !== -1) score += 3;
                    if (String(row.link || '').toLowerCase().indexOf(term) !== -1) score += 4;
                });
                if (score > 0) scored.push({ row, score });
            });
            return scored.sort((a, b) => b.score - a.score).map((s) => s.row);
        },

        byAddress(address) {
            const norm = Addr.normalize(address).toLowerCase();
            return this.rows().find((row) => {
                const link = String(row.link || '').toLowerCase();
                return link === norm || link.replace(/\//g, '-') === norm;
            }) || null;
        }
    };

    // ── Stored preferences ──────────────────────────────────────────────────
    // Kept in the HypernetOS registry so they ride inside the savegame; a
    // fallback object keeps the browser usable on the title screen, where there
    // is no $gameSystem yet.

    const FALLBACK = {};
    const Store = {
        get(key, dflt) {
            const fs = window.HypernetFileSystem;
            if (fs && typeof $gameSystem !== 'undefined' && $gameSystem) {
                const v = fs.getRegistry('browser.' + key, undefined);
                return v === undefined ? dflt : v;
            }
            return FALLBACK[key] === undefined ? dflt : FALLBACK[key];
        },
        set(key, value) {
            const fs = window.HypernetFileSystem;
            if (fs && typeof $gameSystem !== 'undefined' && $gameSystem) {
                fs.setRegistry('browser.' + key, value);
            }
            FALLBACK[key] = value;
        },
        favorites() { return this.get('favorites', null) || defaultFavorites(); },
        setFavorites(list) { this.set('favorites', list); },
        history() { return this.get('history', []) || []; },
        setHistory(list) { this.set('history', list.slice(0, MAX_HISTORY)); },
        downloads() { return this.get('downloads', []) || []; },
        setDownloads(list) { this.set('downloads', list.slice(0, 60)); },
        options() {
            const o = this.get('options', null) || {};
            return Object.assign({
                home: DEFAULT_HOME,
                textSize: 2,
                zoom: 100,
                encoding: 'unicode',
                blocker: true,
                zone: 1,
                historyDays: 20,
                showImages: true,
                playSounds: true,
                smoothScroll: true,
                friendlyErrors: true,
                underlineLinks: true,
                openInNewTab: false,
                bars: { standard: true, address: true, links: true, tabs: true, status: true }
            }, o);
        },
        setOptions(o) { this.set('options', o); }
    };

    function defaultFavorites() {
        // The gateway ships with the sites a terminal is expected to hold.
        const seeds = ['noodle.com', 'hexapedia.com', 'metaforum.hypernet.eu', 'omegatower.eu'];
        return seeds
            .filter((d) => Addr.toPath(d))
            .map((d) => ({ name: d.replace(/\.[a-z.]+$/, ''), url: 'www.' + d, folder: 'links' }));
    }

    // ── Glyphs ──────────────────────────────────────────────────────────────
    // Drawn rather than typed: no icon font to miss and no emoji, per the
    // project's icon convention.

    const GLYPH = {
        back: 'M10.5 2.5 5 8l5.5 5.5V2.5z',
        forward: 'M5.5 2.5 11 8l-5.5 5.5V2.5z',
        stop: 'M8 1.4a6.6 6.6 0 1 0 0 13.2A6.6 6.6 0 0 0 8 1.4zm-3 5.6h6v2H5V7z',
        refresh: 'M8 2.6a5.4 5.4 0 1 0 5.2 6.8h-1.8A3.7 3.7 0 1 1 8 4.3c1 0 1.9.4 2.6 1L8.7 7.2H14V2l-1.9 1.9A5.4 5.4 0 0 0 8 2.6z',
        home: 'M8 2 1.5 7.6h1.8V14h3.2v-3.6h3V14h3.2V7.6h1.8L8 2z',
        search: 'M6.8 1.6a5.2 5.2 0 1 0 3.1 9.4l3.3 3.3 1.2-1.2-3.3-3.3A5.2 5.2 0 0 0 6.8 1.6zm0 1.8a3.4 3.4 0 1 1 0 6.8 3.4 3.4 0 0 1 0-6.8z',
        star: 'M8 1.7l1.9 4 4.4.6-3.2 3 .8 4.3L8 11.6l-3.9 2 .8-4.3-3.2-3 4.4-.6L8 1.7z',
        history: 'M8 1.8A6.2 6.2 0 0 0 1.9 7H0l2.5 2.8L5 7H3.5a4.6 4.6 0 1 1 1.4 4.1l-1.1 1.2A6.2 6.2 0 1 0 8 1.8zm-.8 2.8v4l3.3 2 .6-1-2.7-1.6v-3.4h-1.2z',
        print: 'M4 1.6h8v3H4v-3zm-2.4 4h12.8v5.2H12v3.6H4v-3.6H1.6V5.6zm4 3.6v3.6h4.8V9.2H5.6z',
        dice: 'M2.4 2.4h11.2v11.2H2.4V2.4zm2.2 2.2v2h2v-2h-2zm4.8 0v2h2v-2h-2zm-2.4 2.4v2h2v-2h-2zm-2.4 2.4v2h2v-2h-2zm4.8 0v2h2v-2h-2z',
        mail: 'M1.4 3.4h13.2v9.2H1.4V3.4zm1.4 1.4L8 8.6l5.2-3.8H2.8z',
        folder: 'M1.5 3h4.6l1.3 1.6h7.1V13H1.5V3z',
        page: 'M3.4 1.6h6.2L12.6 5v9.4H3.4V1.6zm5.6 1.2V5h2.4L9 2.8z',
        down: 'M8 11.4 3.4 6.8h2.9V2h3.4v4.8h2.9L8 11.4zM3 12.6h10V14H3v-1.4z',
        globe: 'M8 1.4a6.6 6.6 0 1 0 0 13.2A6.6 6.6 0 0 0 8 1.4zm0 1.4c1 0 2 1.7 2.3 4.1H5.7C6 4.5 7 2.8 8 2.8zM4.3 6.9c.2-1.4.6-2.5 1.2-3.3A5.2 5.2 0 0 0 3 6.9h1.3zm-1.3 2.2h1.3c.2 1.4.6 2.5 1.2 3.3a5.2 5.2 0 0 1-2.5-3.3zm2.7 0h4.6C10 11.5 9 13.2 8 13.2s-2-1.7-2.3-4.1zm6 0H13a5.2 5.2 0 0 1-2.5 3.3c.6-.8 1-1.9 1.2-3.3zm0-2.2c-.2-1.4-.6-2.5-1.2-3.3A5.2 5.2 0 0 1 13 6.9h-1.3z',
        lock: 'M4.6 6.6V5a3.4 3.4 0 0 1 6.8 0v1.6h1V14H3.6V6.6h1zm1.6 0h3.6V5a1.8 1.8 0 0 0-3.6 0v1.6z',
        plus: 'M7 2h2v5h5v2H9v5H7V9H2V7h5V2z',
        close: 'M3.5 2.3 8 6.8l4.5-4.5 1.2 1.2L9.2 8l4.5 4.5-1.2 1.2L8 9.2l-4.5 4.5-1.2-1.2L6.8 8 2.3 3.5l1.2-1.2z'
    };

    function svg(name, size) {
        const d = GLYPH[name] || GLYPH.page;
        const s = size || 16;
        return '<svg class="hnb-glyph" width="' + s + '" height="' + s + '" viewBox="0 0 16 16" ' +
               'aria-hidden="true" focusable="false"><path d="' + d + '" fill="currentColor"/></svg>';
    }

    // ── Menu definitions ────────────────────────────────────────────────────
    // One table describing the whole menu bar. Every entry names a command the
    // browser knows how to run, so the bar, the keyboard and the context menu
    // all reach the same code.

    function menuModel(b) {
        const o = b.opts;
        const check = (on) => (on ? 'check' : 'uncheck');
        const favItems = b.favoritesMenuItems();
        return [
            {
                id: 'file', label: t('menu.file'), items: [
                    { cmd: 'newTab', label: t('file.newTab'), key: 'Ctrl+T' },
                    { cmd: 'duplicateTab', label: t('file.duplicateTab') },
                    { sep: true },
                    { cmd: 'open', label: t('file.open'), key: 'Ctrl+O' },
                    { cmd: 'save', label: t('file.save'), key: 'Ctrl+S' },
                    { cmd: 'saveAs', label: t('file.saveAs') },
                    { sep: true },
                    { cmd: 'pageSetup', label: t('file.pageSetup') },
                    { cmd: 'print', label: t('file.print'), key: 'Ctrl+P' },
                    { sep: true },
                    { cmd: 'closeTab', label: t('file.closeTab'), key: 'Ctrl+W' },
                    { cmd: 'exit', label: t('file.exit') }
                ]
            },
            {
                id: 'edit', label: t('menu.edit'), items: [
                    { cmd: 'cut', label: t('edit.cut'), key: 'Ctrl+X' },
                    { cmd: 'copy', label: t('edit.copy'), key: 'Ctrl+C' },
                    { cmd: 'paste', label: t('edit.paste'), key: 'Ctrl+V' },
                    { sep: true },
                    { cmd: 'selectAll', label: t('edit.selectAll'), key: 'Ctrl+A' },
                    { cmd: 'find', label: t('edit.find'), key: 'Ctrl+F' }
                ]
            },
            {
                id: 'view', label: t('menu.view'), items: [
                    {
                        label: t('view.toolbars'), sub: [
                            { cmd: 'bar:standard', label: t('view.standardButtons'), mark: check(o.bars.standard) },
                            { cmd: 'bar:address', label: t('view.addressBar'), mark: check(o.bars.address) },
                            { cmd: 'bar:links', label: t('view.linksBar'), mark: check(o.bars.links) },
                            { cmd: 'bar:tabs', label: t('view.tabBar'), mark: check(o.bars.tabs) }
                        ]
                    },
                    { cmd: 'bar:status', label: t('view.statusBar'), mark: check(o.bars.status) },
                    {
                        label: t('view.explorerBar'), sub: [
                            { cmd: 'sidebar:search', label: t('view.search'), mark: check(b.sidebar === 'search') },
                            { cmd: 'sidebar:favorites', label: t('view.favorites'), mark: check(b.sidebar === 'favorites') },
                            { cmd: 'sidebar:history', label: t('view.history'), mark: check(b.sidebar === 'history') }
                        ]
                    },
                    { sep: true },
                    {
                        label: t('view.goTo'), sub: [
                            { cmd: 'back', label: t('view.back'), key: 'Alt+Left' },
                            { cmd: 'forward', label: t('view.forward'), key: 'Alt+Right' },
                            { cmd: 'home', label: t('view.home') }
                        ]
                    },
                    { cmd: 'stop', label: t('view.stop'), key: 'Esc' },
                    { cmd: 'refresh', label: t('view.refresh'), key: 'F5' },
                    { sep: true },
                    {
                        label: t('view.textSize'), sub: [
                            { cmd: 'text:4', label: t('textSize.largest'), mark: check(o.textSize === 4) },
                            { cmd: 'text:3', label: t('textSize.larger'), mark: check(o.textSize === 3) },
                            { cmd: 'text:2', label: t('textSize.medium'), mark: check(o.textSize === 2) },
                            { cmd: 'text:1', label: t('textSize.smaller'), mark: check(o.textSize === 1) },
                            { cmd: 'text:0', label: t('textSize.smallest'), mark: check(o.textSize === 0) }
                        ]
                    },
                    {
                        label: t('view.zoom'), sub: [50, 75, 100, 125, 150, 200].map((z) => (
                            { cmd: 'zoom:' + z, label: z + '%', mark: check(o.zoom === z) }
                        ))
                    },
                    {
                        label: t('view.encoding'), sub: ['western', 'unicode', 'cyrillic', 'hexagram'].map((e) => (
                            { cmd: 'encoding:' + e, label: t('encoding.' + e), mark: check(o.encoding === e) }
                        ))
                    },
                    { sep: true },
                    { cmd: 'source', label: t('view.source'), key: 'Ctrl+U' },
                    { cmd: 'fullScreen', label: t('view.fullScreen'), key: 'F11' }
                ]
            },
            {
                id: 'favorites', label: t('menu.favorites'), items: [
                    { cmd: 'addFavorite', label: t('fav.add'), key: 'Ctrl+D' },
                    { cmd: 'organizeFavorites', label: t('fav.organize') },
                    { sep: true }
                ].concat(favItems.length ? favItems : [{ label: t('fav.empty'), disabled: true }])
                    .concat([
                        { sep: true },
                        { label: t('fav.imported'), sub: b.importedMenuItems() }
                    ])
            },
            {
                id: 'tools', label: t('menu.tools'), items: [
                    {
                        label: t('tools.mail'), sub: [
                            { cmd: 'mail', label: t('tools.readMail') },
                            { cmd: 'compose', label: t('tools.newMessage') },
                            { cmd: 'news', label: t('tools.readNews') }
                        ]
                    },
                    { cmd: 'synchronize', label: t('tools.synchronize') },
                    { sep: true },
                    {
                        label: t('tools.popupBlocker'), sub: [
                            { cmd: 'blocker:on', label: t('tools.blockerOn'), mark: check(o.blocker) },
                            { cmd: 'blocker:off', label: t('tools.blockerOff'), mark: check(!o.blocker) }
                        ]
                    },
                    { cmd: 'downloads', label: t('tools.downloads'), key: 'Ctrl+J' },
                    { cmd: 'connection', label: t('tools.connection') },
                    { sep: true },
                    { cmd: 'options', label: t('tools.options') }
                ]
            },
            {
                id: 'help', label: t('menu.help'), items: [
                    { cmd: 'help', label: t('help.topics'), key: 'F1' },
                    { cmd: 'support', label: t('help.support') },
                    { cmd: 'tip', label: t('help.tip') },
                    { sep: true },
                    { cmd: 'about', label: t('help.about') }
                ]
            }
        ];
    }

    // ── The browser ─────────────────────────────────────────────────────────

    function Browser(win) {
        this.win = win;
        this.root = win.querySelector('.hnb-root');
        this.opts = Store.options();
        this.tabs = [];
        this.active = 0;
        this.sidebar = null;
        this.menuOpen = null;
        this.loadTimer = null;
        this.progress = 0;
        this.tabSeq = 0;
        this.searchQuery = '';
        this.searchResults = null;
        this.pendingPopup = null;
    }

    Browser.prototype.el = function (sel) { return this.root.querySelector(sel); };
    Browser.prototype.all = function (sel) { return Array.prototype.slice.call(this.root.querySelectorAll(sel)); };
    Browser.prototype.tab = function () { return this.tabs[this.active] || null; };

    // --- chrome -------------------------------------------------------------

    Browser.chromeHTML = function () {
        const btn = (cmd, glyph, label, extra) =>
            '<button class="hnb-tbtn focusable" data-cmd="' + cmd + '" data-focus-key="hnb-' + cmd + '" ' +
            'tabindex="0" title="' + esc(label) + '"' + (extra || '') + '>' + svg(glyph) +
            '<span class="hnb-tbtn-label">' + esc(label) + '</span></button>';

        return '' +
        '<div class="hnb-root">' +
            '<div class="hnb-menubar" id="hnb-menubar"></div>' +
            '<div class="hnb-toolbar" id="hnb-toolbar">' +
                btn('back', 'back', t('toolbar.back')) +
                btn('forward', 'forward', t('toolbar.forward')) +
                btn('stop', 'stop', t('toolbar.stop')) +
                btn('refresh', 'refresh', t('toolbar.refresh')) +
                btn('home', 'home', t('toolbar.home')) +
                '<div class="hnb-tsep"></div>' +
                btn('sidebar:search', 'search', t('toolbar.search')) +
                btn('sidebar:favorites', 'star', t('toolbar.favorites')) +
                btn('sidebar:history', 'history', t('toolbar.history')) +
                '<div class="hnb-tsep"></div>' +
                btn('mail', 'mail', t('toolbar.mail')) +
                btn('print', 'print', t('toolbar.print')) +
                btn('lucky', 'dice', t('toolbar.random')) +
            '</div>' +
            '<div class="hnb-addressbar" id="hnb-addressbar">' +
                '<span class="hnb-addr-label">' + esc(t('toolbar.address')) + '</span>' +
                '<div class="hnb-addr-wrap">' +
                    '<span class="hnb-addr-icon">' + svg('page', 14) + '</span>' +
                    '<input type="text" id="hnb-url" class="hnb-url focusable" tabindex="0" ' +
                        'data-focus-key="hnb-url" autocomplete="off" spellcheck="false" ' +
                        'placeholder="' + esc(t('address.placeholder')) + '" />' +
                    '<div class="hnb-suggest" id="hnb-suggest"></div>' +
                '</div>' +
                '<button class="hnb-gobtn focusable" data-cmd="go" data-focus-key="hnb-go" tabindex="0">' +
                    svg('forward', 12) + esc(t('toolbar.go')) + '</button>' +
                '<button class="hnb-tbtn hnb-tbtn-icon focusable" data-cmd="addFavorite" ' +
                    'data-focus-key="hnb-addfav" tabindex="0" title="' + esc(t('fav.add')) + '">' + svg('star') + '</button>' +
            '</div>' +
            '<div class="hnb-linksbar" id="hnb-linksbar"></div>' +
            '<div class="hnb-tabstrip" id="hnb-tabstrip"></div>' +
            '<div class="hnb-infobar hnb-hidden" id="hnb-infobar"></div>' +
            '<div class="hnb-findbar hnb-hidden" id="hnb-findbar">' +
                '<span class="hnb-find-label">' + esc(t('find.label')) + '</span>' +
                '<input type="text" id="hnb-find-input" class="hnb-find-input focusable" tabindex="0" ' +
                    'data-focus-key="hnb-find-input" autocomplete="off" />' +
                '<button class="hnb-btn focusable" data-cmd="findNext" data-focus-key="hnb-findnext" tabindex="0">' +
                    esc(t('find.next')) + '</button>' +
                '<button class="hnb-btn focusable" data-cmd="findPrev" data-focus-key="hnb-findprev" tabindex="0">' +
                    esc(t('find.previous')) + '</button>' +
                '<label class="hnb-check"><input type="checkbox" id="hnb-find-case" /> ' + esc(t('find.matchCase')) + '</label>' +
                '<span class="hnb-find-count" id="hnb-find-count"></span>' +
                '<button class="hnb-btn hnb-btn-quiet focusable" data-cmd="findClose" ' +
                    'data-focus-key="hnb-findclose" tabindex="0">' + esc(t('find.close')) + '</button>' +
            '</div>' +
            '<div class="hnb-viewport" id="hnb-viewport">' +
                '<div class="hnb-sidebar hnb-hidden" id="hnb-sidebar"></div>' +
                '<div class="hnb-content" id="hnb-content">' +
                    '<iframe class="hnb-frame" id="hnb-frame" src="about:blank" title="' + esc(t('appName')) + '"></iframe>' +
                    '<div class="hnb-page hnb-hidden" id="hnb-page"></div>' +
                    '<div class="hnb-popup hnb-hidden" id="hnb-popup"></div>' +
                '</div>' +
            '</div>' +
            '<div class="hnb-statusbar" id="hnb-statusbar">' +
                '<div class="hnb-status-text" id="hnb-status">' + esc(t('status.ready')) + '</div>' +
                '<div class="hnb-progress" id="hnb-progress"><div class="hnb-progress-fill"></div></div>' +
                '<div class="hnb-status-panel" id="hnb-status-zone">' + svg('lock', 12) +
                    '<span>' + esc(t('status.zone')) + '</span></div>' +
                '<div class="hnb-status-panel hnb-status-zoom focusable" id="hnb-status-zoom" ' +
                    'data-cmd="cycleZoom" data-focus-key="hnb-zoom" tabindex="0">100%</div>' +
            '</div>' +
            '<div class="hnb-menupop hnb-hidden" id="hnb-menupop"></div>' +
            '<div class="hnb-modal-layer hnb-hidden" id="hnb-modal"></div>' +
        '</div>';
    };

    // --- lifecycle ----------------------------------------------------------

    Browser.prototype.start = function () {
        this.renderMenuBar();
        this.renderLinksBar();
        this.wire();
        this.applyBars();
        this.updateZoneLabel();
        const zoomLabel = this.el('#hnb-status-zoom');
        if (zoomLabel) zoomLabel.textContent = this.opts.zoom + '%';
        this.newTab(this.opts.home, true);
        this.status(t('status.ready'));
    };

    Browser.prototype.wire = function () {
        const self = this;

        // One delegated click for every command-bearing control in the chrome.
        this.root.addEventListener('click', (e) => {
            const hit = e.target.closest('[data-cmd]');
            if (hit && this.root.contains(hit)) {
                e.preventDefault();
                e.stopPropagation();
                this.exec(hit.dataset.cmd, hit.dataset.arg);
                return;
            }
            const menu = e.target.closest('.hnb-menu-title');
            if (menu) {
                e.preventDefault();
                e.stopPropagation();
                this.toggleMenu(menu.dataset.menu);
                return;
            }
            if (!e.target.closest('.hnb-menupop')) this.closeMenu();
        });

        this.root.addEventListener('mouseover', (e) => {
            const menu = e.target.closest('.hnb-menu-title');
            if (menu && this.menuOpen && this.menuOpen !== menu.dataset.menu) {
                this.openMenu(menu.dataset.menu);
            }
        });

        const url = this.el('#hnb-url');
        url.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); this.exec('go'); this.hideSuggest(); }
            else if (e.key === 'Escape') { this.hideSuggest(); url.blur(); }
            else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                this.moveSuggest(e.key === 'ArrowDown' ? 1 : -1);
            }
        });
        url.addEventListener('input', () => this.showSuggest(url.value));
        url.addEventListener('blur', () => setTimeout(() => this.hideSuggest(), 150));

        const find = this.el('#hnb-find-input');
        find.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); this.exec(e.shiftKey ? 'findPrev' : 'findNext'); }
            else if (e.key === 'Escape') { e.preventDefault(); this.exec('findClose'); }
        });

        const frame = this.el('#hnb-frame');
        frame.addEventListener('load', () => this.onFrameLoad());

        // Internal pages and the Explorer bar are plain markup; their links and
        // search boxes are delegated to their host, which is never rebuilt.
        [this.el('#hnb-page'), this.el('#hnb-sidebar')].forEach((host) => {
            host.addEventListener('click', (e) => {
                const link = e.target.closest('[data-go]');
                if (!link) return;
                e.preventDefault();
                this.navigate(link.dataset.go);
            });
            host.addEventListener('submit', (e) => {
                const form = e.target.closest('[data-search-form]');
                if (!form) return;
                e.preventDefault();
                const box = form.querySelector('input');
                this.runSearch(box ? box.value : '');
            });
        });

        this._onKey = (e) => this.onKey(e);
        document.addEventListener('keydown', this._onKey, true);

        this.win.addEventListener('hypernet-closed', () => this.dispose());

        // The desktop can take a window down without that event (closeAll on
        // leaving the OS scene), so the listener also checks it is still there.
        this._alive = setInterval(() => {
            if (!self.win.isConnected) self.dispose();
        }, 2000);
    };

    Browser.prototype.dispose = function () {
        if (this._disposed) return;
        this._disposed = true;
        document.removeEventListener('keydown', this._onKey, true);
        if (this._alive) clearInterval(this._alive);
        if (this.loadTimer) clearInterval(this.loadTimer);
        if (instance === this) instance = null;
    };

    // --- keyboard -----------------------------------------------------------

    Browser.prototype.onKey = function (e) {
        if (!this.win.isConnected) return;
        // Only while this window is the active one, and never over another app.
        const active = window.HypernetOS && window.HypernetOS._getActiveWindow
            ? window.HypernetOS._getActiveWindow() : null;
        if (active && active !== this.win) return;

        const key = String(e.key || '').toLowerCase();
        const inField = document.activeElement && /^(input|textarea|select)$/i.test(document.activeElement.tagName);

        if (e.ctrlKey && !e.altKey) {
            const map = {
                t: 'newTab', w: 'closeTab', l: 'focusAddress', d: 'addFavorite', f: 'find',
                h: 'history', j: 'downloads', u: 'source', p: 'print', o: 'open', s: 'save'
            };
            if (map[key]) { e.preventDefault(); e.stopPropagation(); this.exec(map[key]); return; }
            if (key === '+' || key === '=') { e.preventDefault(); this.zoomStep(1); return; }
            if (key === '-') { e.preventDefault(); this.zoomStep(-1); return; }
            if (key === '0') { e.preventDefault(); this.exec('zoom:100'); return; }
            return;
        }
        if (e.altKey && key === 'arrowleft') { e.preventDefault(); this.exec('back'); return; }
        if (e.altKey && key === 'arrowright') { e.preventDefault(); this.exec('forward'); return; }
        if (key === 'f5') { e.preventDefault(); this.exec('refresh'); return; }
        if (key === 'f1') { e.preventDefault(); this.exec('help'); return; }
        if (key === 'f11') { e.preventDefault(); this.exec('fullScreen'); return; }
        if (key === 'escape') {
            if (this.el('#hnb-modal').classList.contains('hnb-hidden') === false) {
                e.preventDefault(); e.stopPropagation(); this.closeModal(); return;
            }
            if (this.menuOpen) { e.preventDefault(); e.stopPropagation(); this.closeMenu(); return; }
            if (this.loading) { e.preventDefault(); e.stopPropagation(); this.exec('stop'); return; }
            if (inField) return;
        }
    };

    // --- menus --------------------------------------------------------------

    Browser.prototype.renderMenuBar = function () {
        const bar = this.el('#hnb-menubar');
        bar.innerHTML = menuModel(this).map((m) =>
            '<div class="hnb-menu-title focusable" data-menu="' + m.id + '" data-focus-key="hnb-menu-' + m.id + '" ' +
            'tabindex="0">' + esc(m.label) + '</div>'
        ).join('');
    };

    Browser.prototype.toggleMenu = function (id) {
        if (this.menuOpen === id) this.closeMenu();
        else this.openMenu(id);
    };

    Browser.prototype.openMenu = function (id) {
        const model = menuModel(this).find((m) => m.id === id);
        if (!model) return;
        const title = this.el('.hnb-menu-title[data-menu="' + id + '"]');
        const pop = this.el('#hnb-menupop');
        pop.innerHTML = this.menuHTML(model.items, 0);
        pop.classList.remove('hnb-hidden');
        pop.style.left = (title ? title.offsetLeft : 4) + 'px';
        pop.style.top = (this.el('#hnb-menubar').offsetHeight) + 'px';
        this.all('.hnb-menu-title').forEach((el) => el.classList.toggle('active', el.dataset.menu === id));
        this.menuOpen = id;

        pop.querySelectorAll('.hnb-menu-item.has-sub').forEach((item) => {
            item.addEventListener('mouseenter', () => {
                item.parentNode.querySelectorAll('.hnb-submenu').forEach((s) => s.classList.add('hnb-hidden'));
                const sub = item.querySelector('.hnb-submenu');
                if (sub) sub.classList.remove('hnb-hidden');
            });
        });
    };

    Browser.prototype.menuHTML = function (items, depth) {
        return '<div class="hnb-menu' + (depth ? ' hnb-submenu hnb-hidden' : '') + '">' +
            items.map((it) => {
                if (it.sep) return '<div class="hnb-menu-sep"></div>';
                const mark = it.mark === 'check' ? '<span class="hnb-menu-mark">&#10003;</span>'
                    : '<span class="hnb-menu-mark"></span>';
                if (it.sub) {
                    return '<div class="hnb-menu-item has-sub">' + mark +
                        '<span class="hnb-menu-label">' + esc(it.label) + '</span>' +
                        '<span class="hnb-menu-arrow">' + svg('forward', 10) + '</span>' +
                        this.menuHTML(it.sub, depth + 1) + '</div>';
                }
                const cls = 'hnb-menu-item' + (it.disabled ? ' disabled' : ' focusable');
                const attrs = it.disabled ? '' :
                    ' data-cmd="' + esc(it.cmd) + '"' + (it.arg ? ' data-arg="' + esc(it.arg) + '"' : '') +
                    ' tabindex="0" data-focus-key="hnb-mi-' + esc(it.cmd) + (it.arg ? '-' + esc(it.arg) : '') + '"';
                return '<div class="' + cls + '"' + attrs + '>' + mark +
                    '<span class="hnb-menu-label">' + esc(it.label) + '</span>' +
                    (it.key ? '<span class="hnb-menu-key">' + esc(it.key) + '</span>' : '') + '</div>';
            }).join('') + '</div>';
    };

    Browser.prototype.closeMenu = function () {
        const pop = this.el('#hnb-menupop');
        pop.classList.add('hnb-hidden');
        pop.innerHTML = '';
        this.all('.hnb-menu-title').forEach((el) => el.classList.remove('active'));
        this.menuOpen = null;
    };

    Browser.prototype.favoritesMenuItems = function () {
        return Store.favorites().slice(0, 20).map((f) => (
            { cmd: 'goFavorite', arg: f.url, label: f.name || f.url }
        ));
    };

    Browser.prototype.importedMenuItems = function () {
        const domains = Sites.domains().slice(0, 24);
        if (!domains.length) return [{ label: t('fav.empty'), disabled: true }];
        return domains.map((d) => ({ cmd: 'goFavorite', arg: 'www.' + d.domain, label: d.domain }));
    };

    // --- bars ---------------------------------------------------------------

    Browser.prototype.applyBars = function () {
        const b = this.opts.bars;
        this.el('#hnb-toolbar').classList.toggle('hnb-hidden', !b.standard);
        this.el('#hnb-addressbar').classList.toggle('hnb-hidden', !b.address);
        this.el('#hnb-linksbar').classList.toggle('hnb-hidden', !b.links);
        this.el('#hnb-tabstrip').classList.toggle('hnb-hidden', !b.tabs);
        this.el('#hnb-statusbar').classList.toggle('hnb-hidden', !b.status);
    };

    Browser.prototype.renderLinksBar = function () {
        const favs = Store.favorites().filter((f) => f.folder !== 'other');
        const bar = this.el('#hnb-linksbar');
        const items = favs.length
            ? favs.map((f) =>
                '<span class="hnb-link-item focusable" data-cmd="goFavorite" data-arg="' + esc(f.url) + '" ' +
                'tabindex="0" data-focus-key="hnb-link-' + esc(f.url) + '" title="' + esc(f.url) + '">' +
                svg('page', 12) + esc(f.name || f.url) + '</span>').join('')
            : '<span class="hnb-link-hint">' + esc(t('fav.hint')) + '</span>';
        bar.innerHTML = '<span class="hnb-links-label">' + esc(t('fav.barLabel')) + '</span>' + items;
    };

    Browser.prototype.renderTabs = function () {
        const strip = this.el('#hnb-tabstrip');
        strip.innerHTML = this.tabs.map((tab, i) =>
            '<div class="hnb-tab' + (i === this.active ? ' active' : '') + ' focusable" ' +
            'data-cmd="selectTab" data-arg="' + i + '" tabindex="0" data-focus-key="hnb-tab-' + tab.id + '" ' +
            'title="' + esc(tab.title || tab.address) + '">' +
            svg(tab.loading ? 'refresh' : 'page', 12) +
            '<span class="hnb-tab-title">' + esc(tab.title || t('tab.untitled')) + '</span>' +
            '<span class="hnb-tab-close" data-cmd="closeTabAt" data-arg="' + i + '">' + svg('close', 9) + '</span>' +
            '</div>'
        ).join('') +
        '<div class="hnb-tab-new focusable" data-cmd="newTab" tabindex="0" data-focus-key="hnb-newtab" ' +
        'title="' + esc(t('toolbar.newTab')) + '">' + svg('plus', 12) + '</div>';
    };

    // --- tabs ---------------------------------------------------------------

    Browser.prototype.newTab = function (address, silent) {
        this.tabs.push({
            id: ++this.tabSeq,
            address: '',
            title: t('tab.untitled'),
            path: null,
            history: [],
            hIndex: -1,
            loading: false
        });
        this.active = this.tabs.length - 1;
        this.renderTabs();
        this.navigate(address || this.opts.home);
        if (!silent) this.status(t('status.ready'));
    };

    Browser.prototype.selectTab = function (i) {
        const idx = Number(i);
        if (!this.tabs[idx]) return;
        this.active = idx;
        this.renderTabs();
        this.showTab();
    };

    Browser.prototype.closeTabAt = function (i) {
        const idx = i === undefined ? this.active : Number(i);
        if (!this.tabs[idx]) return;
        if (this.tabs.length === 1) {
            // The last tab never leaves; it goes home instead, the way the
            // browser opened.
            this.navigate(this.opts.home);
            return;
        }
        this.tabs.splice(idx, 1);
        if (this.active >= this.tabs.length) this.active = this.tabs.length - 1;
        this.renderTabs();
        this.showTab();
    };

    // Draw whatever the active tab is standing on, without reloading it where
    // the frame already holds the right document.
    Browser.prototype.showTab = function () {
        const tab = this.tab();
        if (!tab) return;
        this.el('#hnb-url').value = tab.address;
        this.setTitle(tab.title);
        if (tab.internal) {
            this.renderInternal(tab.internal, tab.internalArg);
        } else if (tab.path) {
            const frame = this.el('#hnb-frame');
            this.el('#hnb-page').classList.add('hnb-hidden');
            frame.classList.remove('hnb-hidden');
            if (frame.getAttribute('data-path') !== tab.path) {
                frame.setAttribute('data-path', tab.path);
                frame.src = tab.path;
            }
        }
        this.updateNavButtons();
    };

    // --- navigation ---------------------------------------------------------

    Browser.prototype.navigate = function (input, opts) {
        const tab = this.tab();
        if (!tab) return;
        const options = opts || {};
        const raw = String(input == null ? '' : input).trim();
        if (!raw) return;

        if (/^search:/i.test(raw)) { this.runSearch(raw.slice(7)); return; }

        if (Addr.isExternal(raw)) {
            this.status(t('status.external', { address: raw }));
            this.showError(raw, true);
            return;
        }

        if (Addr.isInternal(raw)) {
            const parts = raw.replace(/^(about|hnb):/i, '').split(':');
            const page = parts[0] || 'home';
            const arg = parts.slice(1).join(':');
            tab.internal = page;
            tab.internalArg = arg;
            tab.path = null;
            tab.address = raw.toLowerCase();
            if (!options.noHistory) this.pushHistory(tab, tab.address);
            this.el('#hnb-url').value = tab.address;
            this.renderInternal(page, arg);
            this.recordVisit(tab.address, this.internalTitle(page));
            this.updateNavButtons();
            this.renderTabs();
            return;
        }

        const path = Addr.toPath(raw);
        if (!path) {
            // No document by that name. A phrase, or something with no dot in
            // it, is a search; anything else is a gateway 404.
            const looksLikeQuery = /\s/.test(raw) || raw.indexOf('.') === -1;
            if (looksLikeQuery) { this.runSearch(raw); return; }
            tab.internal = null;
            tab.path = null;
            tab.address = raw;
            if (!options.noHistory) this.pushHistory(tab, raw);
            this.el('#hnb-url').value = raw;
            this.showError(raw, false);
            this.status(t('status.notFound'));
            this.updateNavButtons();
            this.renderTabs();
            return;
        }

        tab.internal = null;
        tab.path = path;
        tab.address = Addr.fromPath(path);
        tab.title = t('tab.loading');
        tab.loading = true;
        if (!options.noHistory) this.pushHistory(tab, tab.address);

        this.el('#hnb-url').value = tab.address;
        this.el('#hnb-page').classList.add('hnb-hidden');
        const frame = this.el('#hnb-frame');
        frame.classList.remove('hnb-hidden');
        frame.setAttribute('data-path', path);
        frame.src = path;

        this.beginLoading(tab.address);
        this.renderTabs();
        this.updateNavButtons();
    };

    Browser.prototype.pushHistory = function (tab, address) {
        tab.history = tab.history.slice(0, tab.hIndex + 1);
        if (tab.history[tab.history.length - 1] !== address) tab.history.push(address);
        tab.hIndex = tab.history.length - 1;
    };

    Browser.prototype.back = function () {
        const tab = this.tab();
        if (!tab || tab.hIndex <= 0) return;
        tab.hIndex--;
        this.navigate(tab.history[tab.hIndex], { noHistory: true });
    };

    Browser.prototype.forward = function () {
        const tab = this.tab();
        if (!tab || tab.hIndex >= tab.history.length - 1) return;
        tab.hIndex++;
        this.navigate(tab.history[tab.hIndex], { noHistory: true });
    };

    Browser.prototype.updateNavButtons = function () {
        const tab = this.tab();
        const back = this.el('[data-cmd="back"]');
        const fwd = this.el('[data-cmd="forward"]');
        if (back) back.classList.toggle('disabled', !tab || tab.hIndex <= 0);
        if (fwd) fwd.classList.toggle('disabled', !tab || tab.hIndex >= tab.history.length - 1);
    };

    Browser.prototype.beginLoading = function (address) {
        this.loading = true;
        this.progress = 0;
        this.status(t('status.opening', { address }));
        const fill = this.el('.hnb-progress-fill');
        if (this.loadTimer) clearInterval(this.loadTimer);
        this.loadTimer = setInterval(() => {
            this.progress = Math.min(95, this.progress + 7 + Math.random() * 12);
            if (fill) fill.style.width = this.progress + '%';
        }, 60);
    };

    Browser.prototype.endLoading = function () {
        this.loading = false;
        if (this.loadTimer) { clearInterval(this.loadTimer); this.loadTimer = null; }
        const fill = this.el('.hnb-progress-fill');
        if (fill) {
            fill.style.width = '100%';
            setTimeout(() => { if (fill) fill.style.width = '0%'; }, 220);
        }
    };

    // Everything that can only be done once the document is in the frame.
    Browser.prototype.onFrameLoad = function () {
        const tab = this.tab();
        const frame = this.el('#hnb-frame');
        if (!tab) return;
        tab.loading = false;
        this.endLoading();

        let doc = null;
        try { doc = frame.contentDocument; } catch (e) { doc = null; }

        if (doc && doc.location && doc.location.href !== 'about:blank') {
            // A link followed inside the document moves the address bar with it.
            const here = this.frameRelativePath(doc.location.href);
            if (here && tab.path && here.toLowerCase() !== tab.path.toLowerCase()) {
                tab.path = here;
                tab.address = Addr.fromPath(here);
                this.el('#hnb-url').value = tab.address;
                this.pushHistory(tab, tab.address);
            }
            tab.title = (doc.title || '').trim() || Addr.fromPath(tab.path || tab.address);
            this.interceptLinks(doc);
            this.applyRendering(doc);
        } else {
            tab.title = Addr.fromPath(tab.path || tab.address);
        }

        this.setTitle(tab.title);
        this.renderTabs();
        this.recordVisit(tab.address, tab.title);
        this.status(t('status.done'));
        this.maybePopup(tab.address);
    };

    // The frame's own URL, turned back into a path under the site folder.
    Browser.prototype.frameRelativePath = function (href) {
        try {
            const decoded = decodeURI(String(href)).replace(/\\/g, '/');
            const at = decoded.toLowerCase().lastIndexOf('/' + SITE_DIR + '/');
            if (at === -1) return null;
            const rel = decoded.slice(at + 1).replace(/[?#].*$/, '');
            const inner = rel.replace(new RegExp('^' + SITE_DIR + '/', 'i'), '');
            return Sites.has(inner) ? SITE_DIR + '/' + Sites.real(inner) : rel;
        } catch (e) {
            return null;
        }
    };

    // A click inside the document is answered by the browser, so a link to a
    // page the gateway does not hold shows the gateway's 404 rather than the
    // runtime's, and a link out of the Hypernet is refused politely.
    Browser.prototype.interceptLinks = function (doc) {
        if (doc._hnbWired) return;
        doc._hnbWired = true;
        const tab = this.tab();
        const base = tab && tab.path ? tab.path : SITE_DIR + '/';

        doc.addEventListener('click', (e) => {
            const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
            if (!a) return;
            const href = a.getAttribute('href') || '';
            if (!href || href.charAt(0) === '#') return;
            const from = (this.tab() && this.tab().path) || base;
            const res = Addr.resolveHref(from, href);
            if (!res) return;
            e.preventDefault();

            if (res.external) {
                if (/^mailto:/i.test(res.address)) {
                    this.status(t('status.external', { address: res.address }));
                    this.exec('compose');
                } else {
                    this.showError(res.address, true);
                }
                return;
            }
            if (res.internal) { this.navigate(res.address); return; }
            if (res.missing) {
                // Not a page: an asset the page offers for download.
                if (!/\.html?$/i.test(res.address)) { this.download(res.address); return; }
                this.navigate(res.address);
                return;
            }
            if (!/\.html?$/i.test(res.path)) { this.download(res.path); return; }
            if (this.opts.openInNewTab || e.ctrlKey) this.newTab(Addr.fromPath(res.path));
            else this.navigate(Addr.fromPath(res.path));
        }, true);

        doc.addEventListener('mouseover', (e) => {
            const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
            if (a) this.status(a.getAttribute('href') || '');
        }, true);
        doc.addEventListener('mouseout', (e) => {
            const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
            if (a) this.status(t('status.done'));
        }, true);
    };

    // Zoom, text size and the advanced switches, applied to the live document.
    Browser.prototype.applyRendering = function (docArg) {
        const o = this.opts;
        let doc = docArg;
        if (!doc) {
            try { doc = this.el('#hnb-frame').contentDocument; } catch (e) { doc = null; }
        }
        const sizes = [70, 85, 100, 120, 145];
        const page = this.el('#hnb-page');
        page.style.fontSize = sizes[o.textSize] + '%';
        page.style.zoom = (o.zoom / 100);

        if (!doc || !doc.documentElement) return;
        try {
            doc.documentElement.style.fontSize = sizes[o.textSize] + '%';
            doc.documentElement.style.zoom = (o.zoom / 100);
            let style = doc.getElementById('hnb-injected-style');
            if (!style) {
                style = doc.createElement('style');
                style.id = 'hnb-injected-style';
                (doc.head || doc.documentElement).appendChild(style);
            }
            style.textContent = [
                o.showImages ? '' : 'img, picture, video { display: none !important; }',
                o.underlineLinks ? 'a[href] { text-decoration: underline; }' : 'a[href] { text-decoration: none; }',
                o.smoothScroll ? 'html { scroll-behavior: smooth; }' : 'html { scroll-behavior: auto; }'
            ].join('\n');
            if (!o.playSounds) {
                doc.querySelectorAll('audio, video').forEach((m) => { try { m.pause(); m.muted = true; } catch (err) { /* not every element obeys */ } });
            }
        } catch (e) {
            // A document that will not be touched is still perfectly readable.
        }
    };

    Browser.prototype.setTitle = function (title) {
        const bar = this.win.querySelector('.hypernet-window-title');
        const text = title ? t('windowTitlePage', { title }) : t('windowTitle');
        if (bar) {
            const icon = bar.querySelector('.hypernet-window-icon');
            bar.innerHTML = (icon ? icon.outerHTML : '') + ' ' + esc(text);
        }
        this.win.dataset.title = text;
        if (window.HypernetOS && window.HypernetOS.refreshTaskbarTabs) {
            window.HypernetOS.refreshTaskbarTabs();
        }
    };

    Browser.prototype.status = function (text) {
        const el = this.el('#hnb-status');
        if (el) el.textContent = text;
    };

    Browser.prototype.recordVisit = function (address, title) {
        if (!address || address === 'about:blank') return;
        const list = Store.history();
        const now = Date.now();
        const found = list.findIndex((h) => h.address === address);
        if (found !== -1) {
            list[found].visits = (list[found].visits || 1) + 1;
            list[found].at = now;
            list[found].title = title || list[found].title;
            list.unshift(list.splice(found, 1)[0]);
        } else {
            list.unshift({ address, title: title || address, at: now, visits: 1 });
        }
        Store.setHistory(list);
    };

    // --- address suggestions ------------------------------------------------

    Browser.prototype.showSuggest = function (value) {
        const box = this.el('#hnb-suggest');
        const q = String(value || '').trim().toLowerCase();
        if (!q) { this.hideSuggest(); return; }

        const rows = [];
        Store.history().forEach((h) => {
            if (rows.length >= 4) return;
            if (String(h.address).toLowerCase().indexOf(q) !== -1) {
                rows.push({ kind: t('address.suggestHistory'), address: h.address, label: h.title || h.address });
            }
        });
        Sites.domains().forEach((d) => {
            if (rows.length >= 8) return;
            if (d.domain.toLowerCase().indexOf(q) === -1) return;
            if (rows.some((r) => r.address === 'www.' + d.domain)) return;
            rows.push({ kind: t('address.suggestSite'), address: 'www.' + d.domain, label: d.domain });
        });
        if (!Addr.toPath(q)) {
            rows.push({ kind: '', address: 'search:' + q, label: t('address.suggestSearch', { query: value }) });
        }
        if (!rows.length) { this.hideSuggest(); return; }

        box.innerHTML = rows.map((r, i) =>
            '<div class="hnb-suggest-row' + (i === 0 ? ' active' : '') + '" data-cmd="goSuggest" data-arg="' + esc(r.address) + '">' +
            '<span class="hnb-suggest-label">' + esc(r.label) + '</span>' +
            (r.kind ? '<span class="hnb-suggest-kind">' + esc(r.kind) + '</span>' : '') + '</div>'
        ).join('');
        box.classList.add('open');
    };

    Browser.prototype.hideSuggest = function () {
        const box = this.el('#hnb-suggest');
        box.classList.remove('open');
        box.innerHTML = '';
    };

    Browser.prototype.moveSuggest = function (dir) {
        const box = this.el('#hnb-suggest');
        const rows = Array.prototype.slice.call(box.querySelectorAll('.hnb-suggest-row'));
        if (!rows.length) return;
        let i = rows.findIndex((r) => r.classList.contains('active'));
        i = Math.max(0, Math.min(rows.length - 1, (i === -1 ? 0 : i) + dir));
        rows.forEach((r, n) => r.classList.toggle('active', n === i));
        this.el('#hnb-url').value = rows[i].dataset.arg.replace(/^search:/, '');
    };

    // --- search -------------------------------------------------------------

    Browser.prototype.runSearch = function (query) {
        this.searchQuery = String(query || '');
        SiteDb.load(() => {
            this.searchResults = SiteDb.search(this.searchQuery);
            this.navigate('about:home');
            if (this.sidebar === 'search') this.refreshSidebar();
        });
    };

    Browser.prototype.lucky = function () {
        SiteDb.load(() => {
            const pool = this.searchQuery ? SiteDb.search(this.searchQuery) : SiteDb.rows();
            let target = null;
            if (pool.length) {
                target = this.searchQuery ? pool[0] : pool[Math.floor(Math.random() * pool.length)];
            }
            if (target) { this.navigate('www.' + target.link); return; }
            const domains = Sites.domains();
            if (domains.length) {
                this.navigate('www.' + domains[Math.floor(Math.random() * domains.length)].domain);
            }
        });
    };

    // --- internal pages -----------------------------------------------------

    Browser.prototype.internalTitle = function (page) {
        switch (page) {
            case 'home': return t('appName');
            case 'history': return t('history.title');
            case 'downloads': return t('downloads.title');
            case 'mail': return t('mail.title');
            case 'help': return t('helpPage.title');
            case 'source': return t('source.heading');
            default: return t('appName');
        }
    };

    Browser.prototype.renderInternal = function (page, arg) {
        const host = this.el('#hnb-page');
        const frame = this.el('#hnb-frame');
        frame.classList.add('hnb-hidden');
        frame.removeAttribute('data-path');
        host.classList.remove('hnb-hidden');
        host.scrollTop = 0;

        let html = '';
        switch (page) {
            case 'home': html = this.homeHTML(); break;
            case 'history': html = this.historyHTML(); break;
            case 'downloads': html = this.downloadsHTML(); break;
            case 'mail': html = this.mailHTML(arg); break;
            case 'help': html = this.helpHTML(); break;
            case 'source': html = this.sourceHTML(arg); break;
            case 'error': html = this.errorHTML(arg, false); break;
            case 'blank': html = '<div class="hnb-doc"></div>'; break;
            default: html = this.homeHTML();
        }
        host.innerHTML = html;
        this.applyRendering(null);
        const tab = this.tab();
        if (tab) { tab.title = this.internalTitle(page); this.setTitle(tab.title); }
        this.renderTabs();

        if (page === 'home' && !SiteDb.loaded()) {
            SiteDb.load(() => {
                const cur = this.tab();
                if (cur && cur.internal === 'home') this.renderInternal('home');
            });
        }
    };

    Browser.prototype.homeHTML = function () {
        const results = this.searchResults;
        const q = this.searchQuery;
        let resultsHTML = '';
        if (results) {
            if (!results.length) {
                resultsHTML = '<div class="hnb-noodle-stats">' + esc(t('home.noResults', { query: q })) + '</div>' +
                    '<div class="hnb-noodle-hint">' + esc(t('home.suggestion')) + '</div>';
            } else {
                const seconds = ((hash(q) % 400) / 1000 + 0.08).toFixed(2);
                resultsHTML = '<div class="hnb-noodle-stats">' +
                    esc(t('home.stats', { count: results.length, seconds })) + '</div>' +
                    results.slice(0, 40).map((row) =>
                        '<div class="hnb-result">' +
                        '<a class="hnb-result-title" data-go="www.' + esc(row.link) + '">' + esc(SiteDb.title(row)) + '</a>' +
                        '<div class="hnb-result-url">www.' + esc(row.link) + '</div>' +
                        '<div class="hnb-result-abstract">' + esc(SiteDb.abstract(row)) + '</div>' +
                        '</div>').join('');
            }
        }

        const domains = Sites.domains();
        const letters = {};
        domains.forEach((d) => {
            const k = d.domain.charAt(0).toUpperCase();
            if (!letters[k]) letters[k] = [];
            letters[k].push(d);
        });
        const directory = Object.keys(letters).sort().map((k) =>
            '<div class="hnb-dir-group"><div class="hnb-dir-letter">' + esc(k) + '</div>' +
            '<div class="hnb-dir-items">' + letters[k].map((d) =>
                '<a class="hnb-dir-item" data-go="www.' + esc(d.domain) + '">' + esc(d.domain) +
                (d.pages.length ? '<span class="hnb-dir-count">' + d.pages.length + '</span>' : '') + '</a>'
            ).join('') + '</div></div>'
        ).join('');

        return '<div class="hnb-doc hnb-noodle">' +
            '<div class="hnb-noodle-logo">' +
                '<span class="n">N</span><span class="o1">o</span><span class="o2">o</span>' +
                '<span class="d">d</span><span class="l">l</span><span class="e">e</span>' +
                '<span class="hnb-noodle-beta">' + esc(t('home.beta')) + '</span>' +
            '</div>' +
            '<form class="hnb-noodle-form" data-search-form="1">' +
                '<input type="text" class="hnb-noodle-box focusable" tabindex="0" data-focus-key="hnb-noodle-box" ' +
                    'value="' + esc(q) + '" autocomplete="off" />' +
                '<div class="hnb-noodle-buttons">' +
                    '<button type="submit" class="hnb-btn focusable" tabindex="0" data-focus-key="hnb-noodle-go">' +
                        esc(t('home.searchButton')) + '</button>' +
                    '<button type="button" class="hnb-btn focusable" data-cmd="lucky" tabindex="0" ' +
                        'data-focus-key="hnb-noodle-lucky">' + esc(t('home.luckyButton')) + '</button>' +
                '</div>' +
            '</form>' +
            (SiteDb.loaded() ? '' : '<div class="hnb-noodle-hint">' + esc(t('home.connecting')) + '</div>') +
            (SiteDb.loaded() && !SiteDb.rows().length
                ? '<div class="hnb-noodle-hint">' + esc(t('home.indexOffline')) + '</div>' : '') +
            '<div class="hnb-noodle-results">' + resultsHTML + '</div>' +
            '<div class="hnb-dir">' +
                '<h2>' + esc(t('home.directory')) + '</h2>' +
                '<div class="hnb-dir-hint">' + esc(t('home.directoryHint', { count: domains.length })) + '</div>' +
                directory +
            '</div>' +
            '<div class="hnb-noodle-footer">' + esc(t('home.footer')) + '</div>' +
        '</div>';
    };

    Browser.prototype.showError = function (address, external) {
        const tab = this.tab();
        const host = this.el('#hnb-page');
        this.el('#hnb-frame').classList.add('hnb-hidden');
        host.classList.remove('hnb-hidden');
        host.innerHTML = this.errorHTML(address, external);
        host.scrollTop = 0;
        if (tab) { tab.title = t('error.title'); tab.internal = 'error'; tab.internalArg = address; }
        this.setTitle(t('error.title'));
        this.renderTabs();
        this.endLoading();
    };

    Browser.prototype.errorHTML = function (address, external) {
        if (!this.opts.friendlyErrors) {
            return '<div class="hnb-doc hnb-error hnb-error-terse">' +
                '<pre>' + esc(t('error.friendlyOff')) + '\n' + esc(t('error.address', { address })) + '</pre></div>';
        }
        const suggestions = external ? [] : Addr.suggest(address, 6);
        return '<div class="hnb-doc hnb-error">' +
            '<h1>' + esc(t('error.heading')) + '</h1>' +
            '<p>' + esc(external ? t('error.external') : t('error.body')) + '</p>' +
            '<p class="hnb-error-address">' + esc(t('error.address', { address })) + '</p>' +
            '<hr />' +
            '<p><b>' + esc(t('error.tryTitle')) + '</b></p>' +
            '<ul><li>' + esc(t('error.try1')) + '</li><li>' + esc(t('error.try2')) + '</li>' +
            '<li>' + esc(t('error.try3')) + '</li></ul>' +
            (suggestions.length
                ? '<p><b>' + esc(t('error.didYouMean')) + '</b></p><ul class="hnb-error-suggest">' +
                  suggestions.map((d) => '<li><a data-go="www.' + esc(d) + '">www.' + esc(d) + '</a></li>').join('') +
                  '</ul>'
                : '') +
            '<p><a data-go="search:' + esc(Addr.normalize(address)) + '">' +
                esc(t('error.searchFor', { query: Addr.normalize(address) })) + '</a></p>' +
            '<p class="hnb-error-code">' + esc(t('error.code')) + '</p>' +
        '</div>';
    };

    Browser.prototype.historyHTML = function () {
        const list = Store.history();
        if (!list.length) {
            return '<div class="hnb-doc"><h1>' + esc(t('history.heading')) + '</h1><p>' +
                esc(t('history.empty')) + '</p></div>';
        }
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const rows = (items) => items.map((h) =>
            '<tr><td><a data-go="' + esc(h.address) + '">' + esc(h.title || h.address) + '</a></td>' +
            '<td class="hnb-dim">' + esc(h.address) + '</td>' +
            '<td class="hnb-dim">' + esc(t('history.visits', { count: h.visits || 1 })) + '</td></tr>').join('');
        const recent = list.filter((h) => (h.at || 0) >= today.getTime());
        const older = list.filter((h) => (h.at || 0) < today.getTime());
        return '<div class="hnb-doc">' +
            '<h1>' + esc(t('history.heading')) + '</h1>' +
            '<p class="hnb-dim">' + esc(t('history.hint')) + '</p>' +
            '<p><button class="hnb-btn focusable" data-cmd="clearHistory" tabindex="0" ' +
                'data-focus-key="hnb-clearhist">' + esc(t('history.clear')) + '</button></p>' +
            (recent.length ? '<h2>' + esc(t('history.today')) + '</h2><table class="hnb-table">' + rows(recent) + '</table>' : '') +
            (older.length ? '<h2>' + esc(t('history.earlier')) + '</h2><table class="hnb-table">' + rows(older) + '</table>' : '') +
        '</div>';
    };

    Browser.prototype.downloadsHTML = function () {
        const list = Store.downloads();
        return '<div class="hnb-doc">' +
            '<h1>' + esc(t('downloads.heading')) + '</h1>' +
            '<p class="hnb-dim">' + esc(t('downloads.hint')) + '</p>' +
            (list.length
                ? '<p><button class="hnb-btn focusable" data-cmd="clearDownloads" tabindex="0" ' +
                  'data-focus-key="hnb-cleardl">' + esc(t('downloads.clear')) + '</button></p>' +
                  '<table class="hnb-table"><tr><th>' + esc(t('downloads.file')) + '</th><th>' +
                  esc(t('downloads.from')) + '</th><th>' + esc(t('downloads.state')) + '</th></tr>' +
                  list.map((d) =>
                      '<tr><td>' + svg('down', 12) + ' ' + esc(d.name) + '</td>' +
                      '<td class="hnb-dim">' + esc(d.from) + '</td>' +
                      '<td>' + esc(t('downloads.' + (d.state || 'complete'))) + '</td></tr>').join('') +
                  '</table>'
                : '<p>' + esc(t('downloads.empty')) + '</p>') +
        '</div>';
    };

    Browser.prototype.mailHTML = function (arg) {
        const messages = to('mail.messages') || [];
        let read = Store.get('mailRead', []) || [];
        if (arg !== undefined && arg !== '' && messages[Number(arg)]) {
            const m = messages[Number(arg)];
            if (read.indexOf(Number(arg)) === -1) {
                read = read.concat([Number(arg)]);
                Store.set('mailRead', read);
            }
            return '<div class="hnb-doc hnb-mail">' +
                '<h1>' + esc(m.subject) + '</h1>' +
                '<p class="hnb-dim">' + esc(t('mail.from')) + ' ' + esc(m.from) + '</p>' +
                '<hr /><p class="hnb-mail-body">' + esc(m.body) + '</p>' +
                '<p><a data-go="about:mail">' + esc(t('mail.heading')) + '</a></p>' +
            '</div>';
        }
        return '<div class="hnb-doc hnb-mail">' +
            '<h1>' + esc(t('mail.heading')) + '</h1>' +
            '<p class="hnb-dim">' + esc(t('mail.hint')) + '</p>' +
            '<p><button class="hnb-btn focusable" data-cmd="compose" tabindex="0" data-focus-key="hnb-compose">' +
                esc(t('mail.compose')) + '</button></p>' +
            '<table class="hnb-table"><tr><th>' + esc(t('mail.from')) + '</th><th>' +
                esc(t('mail.subject')) + '</th><th>' + esc(t('downloads.state')) + '</th></tr>' +
            messages.map((m, i) =>
                '<tr class="' + (read.indexOf(i) === -1 ? 'hnb-unread' : '') + '">' +
                '<td class="hnb-dim">' + esc(m.from) + '</td>' +
                '<td><a data-go="about:mail:' + i + '">' + esc(m.subject) + '</a></td>' +
                '<td class="hnb-dim">' + esc(read.indexOf(i) === -1 ? t('mail.unread') : t('mail.read')) + '</td></tr>'
            ).join('') + '</table>' +
        '</div>';
    };

    Browser.prototype.helpHTML = function () {
        const keys = tl('helpPage.keys');
        return '<div class="hnb-doc">' +
            '<h1>' + esc(t('helpPage.heading')) + '</h1>' +
            '<p>' + esc(t('helpPage.intro')) + '</p>' +
            '<h2>' + esc(t('helpPage.navHeading')) + '</h2><p>' + esc(t('helpPage.navBody')) + '</p>' +
            '<h2>' + esc(t('helpPage.keysHeading')) + '</h2>' +
            '<ul class="hnb-keys">' + keys.map((k) => '<li>' + esc(k) + '</li>').join('') + '</ul>' +
            '<h2>' + esc(t('helpPage.favHeading')) + '</h2><p>' + esc(t('helpPage.favBody')) + '</p>' +
            '<h2>' + esc(t('helpPage.offlineHeading')) + '</h2><p>' + esc(t('helpPage.offlineBody')) + '</p>' +
        '</div>';
    };

    Browser.prototype.sourceHTML = function (address) {
        const text = this._sourceText || '';
        if (!text) {
            return '<div class="hnb-doc"><h1>' + esc(t('source.heading')) + '</h1><p>' +
                esc(t('source.unavailable')) + '</p></div>';
        }
        return '<div class="hnb-doc hnb-source">' +
            '<h1>' + esc(t('source.title', { address: address || '' })) + '</h1>' +
            '<p class="hnb-dim">' + esc(t('source.bytes', { count: text.length })) + '</p>' +
            '<pre class="hnb-source-body">' + esc(text) + '</pre>' +
        '</div>';
    };

    // --- explorer bar -------------------------------------------------------

    Browser.prototype.toggleSidebar = function (which) {
        this.sidebar = (this.sidebar === which) ? null : which;
        this.refreshSidebar();
    };

    Browser.prototype.refreshSidebar = function () {
        const bar = this.el('#hnb-sidebar');
        if (!bar) return;
        if (!this.sidebar) { bar.classList.add('hnb-hidden'); bar.innerHTML = ''; return; }
        bar.classList.remove('hnb-hidden');
        bar.innerHTML = this.sidebarHTML(this.sidebar);
    };

    Browser.prototype.sidebarHTML = function (which) {
        const head = (label) =>
            '<div class="hnb-side-head"><span>' + esc(label) + '</span>' +
            '<span class="hnb-side-close focusable" data-cmd="sidebar:' + which + '" tabindex="0" ' +
            'data-focus-key="hnb-side-close">' + svg('close', 10) + '</span></div>';

        if (which === 'favorites') {
            const favs = Store.favorites();
            return head(t('view.favorites')) +
                '<div class="hnb-side-body">' +
                '<div class="hnb-side-group">' + esc(t('fav.bar')) + '</div>' +
                (favs.filter((f) => f.folder !== 'other').map((f) =>
                    '<a class="hnb-side-item" data-go="' + esc(f.url) + '">' + svg('page', 12) + esc(f.name) + '</a>'
                ).join('') || '<div class="hnb-side-empty">' + esc(t('fav.empty')) + '</div>') +
                '<div class="hnb-side-group">' + esc(t('fav.other')) + '</div>' +
                (favs.filter((f) => f.folder === 'other').map((f) =>
                    '<a class="hnb-side-item" data-go="' + esc(f.url) + '">' + svg('page', 12) + esc(f.name) + '</a>'
                ).join('') || '<div class="hnb-side-empty">' + esc(t('fav.empty')) + '</div>') +
                '<div class="hnb-side-actions">' +
                '<button class="hnb-btn focusable" data-cmd="organizeFavorites" tabindex="0" ' +
                'data-focus-key="hnb-side-org">' + esc(t('fav.organize')) + '</button></div>' +
                '</div>';
        }
        if (which === 'history') {
            const list = Store.history();
            return head(t('view.history')) +
                '<div class="hnb-side-body">' +
                (list.length ? list.slice(0, 40).map((h) =>
                    '<a class="hnb-side-item" data-go="' + esc(h.address) + '" title="' + esc(h.address) + '">' +
                    svg('history', 12) + esc(h.title || h.address) + '</a>').join('')
                    : '<div class="hnb-side-empty">' + esc(t('history.empty')) + '</div>') +
                '</div>';
        }
        // search
        return head(t('view.search')) +
            '<div class="hnb-side-body">' +
            '<form class="hnb-side-form" data-search-form="1">' +
            '<input type="text" class="hnb-side-input focusable" tabindex="0" data-focus-key="hnb-side-search" ' +
            'value="' + esc(this.searchQuery) + '" />' +
            '<button type="submit" class="hnb-btn focusable" tabindex="0" data-focus-key="hnb-side-searchgo">' +
            esc(t('home.searchButton')) + '</button></form>' +
            (this.searchResults ? this.searchResults.slice(0, 25).map((row) =>
                '<a class="hnb-side-item" data-go="www.' + esc(row.link) + '">' + svg('page', 12) +
                esc(SiteDb.title(row)) + '</a>').join('') : '') +
            '</div>';
    };

    // --- find ---------------------------------------------------------------

    Browser.prototype.openFind = function () {
        this.el('#hnb-findbar').classList.remove('hnb-hidden');
        const input = this.el('#hnb-find-input');
        input.focus();
        input.select();
    };

    Browser.prototype.closeFind = function () {
        this.el('#hnb-findbar').classList.add('hnb-hidden');
        this.el('#hnb-find-count').textContent = '';
    };

    Browser.prototype.findIn = function (backwards) {
        const term = this.el('#hnb-find-input').value;
        const count = this.el('#hnb-find-count');
        if (!term) { count.textContent = ''; return; }
        const matchCase = this.el('#hnb-find-case').checked;

        // Internal pages are ours, so the host window's own finder is used.
        const onInternal = !this.el('#hnb-page').classList.contains('hnb-hidden');
        let target = null;
        try {
            target = onInternal ? window : this.el('#hnb-frame').contentWindow;
        } catch (e) {
            target = null;
        }
        if (!target || typeof target.find !== 'function') {
            count.textContent = t('find.unreadable');
            return;
        }
        let found = false;
        try {
            found = target.find(term, matchCase, !!backwards, true, false, false, false);
        } catch (e) {
            found = false;
        }
        const text = this.pageText();
        const hits = text
            ? (matchCase ? text : text.toLowerCase()).split(matchCase ? term : term.toLowerCase()).length - 1
            : 0;
        count.textContent = found || hits ? t('find.count', { count: hits }) : t('find.none');
    };

    Browser.prototype.pageText = function () {
        const onInternal = !this.el('#hnb-page').classList.contains('hnb-hidden');
        if (onInternal) return this.el('#hnb-page').innerText || '';
        try {
            const doc = this.el('#hnb-frame').contentDocument;
            return doc && doc.body ? (doc.body.innerText || '') : '';
        } catch (e) {
            return '';
        }
    };

    // --- documents (source, save, print, download) ---------------------------

    Browser.prototype.readDocument = function (path, cb) {
        // Straight off disk where the runtime allows it, over the wire where it
        // does not, and out of the live document as the last resort.
        if (isNw()) {
            try {
                const fs = require('fs');
                const nodePath = require('path');
                const abs = nodePath.join(process.cwd(), path.replace(/\//g, nodePath.sep));
                if (fs.existsSync(abs)) { cb(fs.readFileSync(abs, 'utf8')); return; }
            } catch (e) { /* fall through to the wire */ }
        }
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', path, true);
            xhr.onload = () => cb(xhr.responseText || this.liveDocumentText());
            xhr.onerror = () => cb(this.liveDocumentText());
            xhr.send();
            return;
        } catch (e) { /* fall through to the live document */ }
        cb(this.liveDocumentText());
    };

    Browser.prototype.liveDocumentText = function () {
        try {
            const doc = this.el('#hnb-frame').contentDocument;
            if (doc && doc.documentElement) return doc.documentElement.outerHTML;
        } catch (e) { /* not readable */ }
        const page = this.el('#hnb-page');
        return page && !page.classList.contains('hnb-hidden') ? page.innerHTML : '';
    };

    Browser.prototype.viewSource = function () {
        const tab = this.tab();
        if (!tab) return;
        const address = tab.address;
        const done = (text) => {
            this._sourceText = text || '';
            this.navigate('about:source:' + address);
        };
        if (tab.path) this.readDocument(tab.path, done);
        else done(this.liveDocumentText());
    };

    Browser.prototype.savePage = function (askName) {
        const tab = this.tab();
        if (!tab) return;
        const suggested = (Addr.normalize(tab.address) || 'document').replace(/[\\/:*?"<>|]/g, '-') + '.html';
        const write = (name) => {
            const finish = (text) => {
                const fs = window.HypernetFileSystem;
                const path = 'C:/Documents/' + name;
                const ok = fs ? fs.writeFile(path, text, /\.txt$/i.test(name) ? 'txt' : 'html') : false;
                if (ok) {
                    this.addDownload(name, tab.address, 'complete');
                    this.status(t('status.saved', { path: path.replace(/\//g, '\\') }));
                } else {
                    this.status(t('status.saveFailed'));
                }
            };
            if (tab.path) this.readDocument(tab.path, (text) => finish(/\.txt$/i.test(name) ? stripTags(text) : text));
            else finish(this.liveDocumentText());
        };
        if (!askName) { write(suggested); return; }
        this.saveDialog(suggested, write);
    };

    Browser.prototype.addDownload = function (name, from, state) {
        const list = Store.downloads();
        list.unshift({ name, from, state: state || 'complete', at: Date.now() });
        Store.setDownloads(list);
    };

    // A link to something that is not a page: copied into the OS file system.
    Browser.prototype.download = function (path) {
        const name = String(path).split('/').pop();
        this.status(t('status.downloadStarted', { name }));
        this.addDownload(name, this.tab() ? this.tab().address : '', 'inProgress');
        this.readDocument(path, (text) => {
            const fs = window.HypernetFileSystem;
            const ext = (name.split('.').pop() || 'txt').toLowerCase();
            if (fs) fs.writeFile('C:/Documents/' + name, text || '', ext);
            const list = Store.downloads();
            if (list[0]) list[0].state = 'complete';
            Store.setDownloads(list);
            this.status(t('status.downloadDone', { name }));
            const tab = this.tab();
            if (tab && tab.internal === 'downloads') this.renderInternal('downloads');
        });
    };

    function stripTags(html) {
        return String(html || '')
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    // --- pop-ups ------------------------------------------------------------

    Browser.prototype.maybePopup = function (address) {
        const ads = to('popup.ads') || [];
        if (!ads.length) return;
        const roll = hash(address) % 100;
        if (roll >= 22) return;                    // most pages carry none
        const ad = ads[hash(address + 'ad') % ads.length];
        if (this.opts.blocker) {
            this.pendingPopup = ad;
            this.showInfoBar(t('popup.blockedBar'), [
                { cmd: 'showPopup', label: t('popup.showIt') },
                { cmd: 'blocker:off', label: t('popup.always') }
            ]);
            this.status(t('status.popupBlocked'));
            return;
        }
        this.showPopup(ad);
    };

    Browser.prototype.showPopup = function (adArg) {
        const ad = adArg || this.pendingPopup;
        if (!ad) return;
        this.pendingPopup = null;
        this.hideInfoBar();
        const pop = this.el('#hnb-popup');
        pop.classList.remove('hnb-hidden');
        pop.innerHTML =
            '<div class="hnb-popup-win">' +
                '<div class="hnb-popup-title"><span>' + esc(ad.title) + '</span>' +
                '<span class="hnb-popup-x focusable" data-cmd="closePopup" tabindex="0" ' +
                'data-focus-key="hnb-popup-x">' + svg('close', 10) + '</span></div>' +
                '<div class="hnb-popup-body"><p>' + esc(ad.body) + '</p>' +
                '<button class="hnb-btn focusable" data-cmd="closePopup" tabindex="0" ' +
                'data-focus-key="hnb-popup-btn">' + esc(ad.button) + '</button></div>' +
            '</div>';
    };

    Browser.prototype.closePopup = function () {
        const pop = this.el('#hnb-popup');
        pop.classList.add('hnb-hidden');
        pop.innerHTML = '';
    };

    Browser.prototype.showInfoBar = function (text, actions) {
        const bar = this.el('#hnb-infobar');
        bar.classList.remove('hnb-hidden');
        bar.innerHTML = '<span class="hnb-infobar-icon">' + svg('lock', 12) + '</span>' +
            '<span class="hnb-infobar-text">' + esc(text) + '</span>' +
            (actions || []).map((a) =>
                '<button class="hnb-btn hnb-btn-small focusable" data-cmd="' + esc(a.cmd) + '" tabindex="0" ' +
                'data-focus-key="hnb-info-' + esc(a.cmd) + '">' + esc(a.label) + '</button>').join('') +
            '<span class="hnb-infobar-x focusable" data-cmd="hideInfoBar" tabindex="0" ' +
            'data-focus-key="hnb-info-x">' + svg('close', 10) + '</span>';
    };

    Browser.prototype.hideInfoBar = function () {
        const bar = this.el('#hnb-infobar');
        bar.classList.add('hnb-hidden');
        bar.innerHTML = '';
    };

    // --- dialogs ------------------------------------------------------------

    Browser.prototype.modal = function (title, bodyHTML, buttons, onOpen) {
        const layer = this.el('#hnb-modal');
        layer.classList.remove('hnb-hidden');
        layer.innerHTML =
            '<div class="hnb-dialog">' +
                '<div class="hnb-dialog-title"><span>' + esc(title) + '</span>' +
                '<span class="hnb-dialog-x focusable" data-cmd="closeModal" tabindex="0" ' +
                'data-focus-key="hnb-dlg-x">' + svg('close', 10) + '</span></div>' +
                '<div class="hnb-dialog-body">' + bodyHTML + '</div>' +
                '<div class="hnb-dialog-actions">' +
                    (buttons || []).map((b, i) =>
                        '<button class="hnb-btn' + (b.primary ? ' hnb-btn-primary' : '') + ' focusable" ' +
                        'data-dlg="' + i + '" tabindex="0" data-focus-key="hnb-dlg-' + i + '">' +
                        esc(b.label) + '</button>').join('') +
                '</div>' +
            '</div>';
        layer.querySelectorAll('[data-dlg]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const b = (buttons || [])[Number(btn.dataset.dlg)];
                const keep = b && b.action ? b.action(layer) : false;
                if (!keep) this.closeModal();
            });
        });
        if (onOpen) onOpen(layer);
    };

    Browser.prototype.closeModal = function () {
        const layer = this.el('#hnb-modal');
        layer.classList.add('hnb-hidden');
        layer.innerHTML = '';
    };

    Browser.prototype.addFavoriteDialog = function () {
        const tab = this.tab();
        if (!tab) return;
        const address = tab.address;
        const name = SiteDb.byAddress(address)
            ? SiteDb.title(SiteDb.byAddress(address))
            : (tab.title || address);
        this.modal(t('fav.dialogTitle'),
            '<div class="hnb-form">' +
                '<label>' + esc(t('fav.name')) + '<input type="text" id="hnb-fav-name" value="' + esc(name) + '" /></label>' +
                '<label>' + esc(t('fav.address')) + '<input type="text" id="hnb-fav-url" value="' + esc(address) + '" readonly /></label>' +
                '<label>' + esc(t('fav.createIn')) +
                    '<select id="hnb-fav-folder">' +
                        '<option value="links">' + esc(t('fav.bar')) + '</option>' +
                        '<option value="other">' + esc(t('fav.other')) + '</option>' +
                    '</select></label>' +
            '</div>',
            [
                { label: t('open.cancel') },
                {
                    label: t('fav.dialogTitle'), primary: true, action: (layer) => {
                        const favs = Store.favorites();
                        const url = layer.querySelector('#hnb-fav-url').value;
                        const nm = layer.querySelector('#hnb-fav-name').value.trim() || url;
                        if (favs.some((f) => f.url === url)) { this.status(t('fav.exists')); return false; }
                        favs.push({ name: nm, url, folder: layer.querySelector('#hnb-fav-folder').value });
                        Store.setFavorites(favs);
                        this.renderLinksBar();
                        this.refreshSidebar();
                        this.status(t('fav.added', { name: nm }));
                        return false;
                    }
                }
            ],
            (layer) => { const f = layer.querySelector('#hnb-fav-name'); if (f) { f.focus(); f.select(); } });
    };

    Browser.prototype.organizeDialog = function () {
        const render = () => {
            const favs = Store.favorites();
            return '<div class="hnb-organize">' +
                (favs.length ? favs.map((f, i) =>
                    '<div class="hnb-org-row">' +
                        '<span class="hnb-org-name">' + svg('page', 12) + esc(f.name) + '</span>' +
                        '<span class="hnb-org-url">' + esc(f.url) + '</span>' +
                        '<span class="hnb-org-folder">' + esc(f.folder === 'other' ? t('fav.other') : t('fav.bar')) + '</span>' +
                        '<button class="hnb-btn hnb-btn-small focusable" data-org="up" data-i="' + i + '" tabindex="0" ' +
                        'data-focus-key="hnb-org-up-' + i + '">' + esc(t('fav.moveUp')) + '</button>' +
                        '<button class="hnb-btn hnb-btn-small focusable" data-org="down" data-i="' + i + '" tabindex="0" ' +
                        'data-focus-key="hnb-org-down-' + i + '">' + esc(t('fav.moveDown')) + '</button>' +
                        '<button class="hnb-btn hnb-btn-small focusable" data-org="rename" data-i="' + i + '" tabindex="0" ' +
                        'data-focus-key="hnb-org-ren-' + i + '">' + esc(t('fav.rename')) + '</button>' +
                        '<button class="hnb-btn hnb-btn-small focusable" data-org="delete" data-i="' + i + '" tabindex="0" ' +
                        'data-focus-key="hnb-org-del-' + i + '">' + esc(t('fav.delete')) + '</button>' +
                    '</div>').join('')
                    : '<div class="hnb-side-empty">' + esc(t('fav.empty')) + '</div>') +
            '</div>';
        };

        const wire = (layer) => {
            layer.querySelectorAll('[data-org]').forEach((btn) => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const favs = Store.favorites();
                    const i = Number(btn.dataset.i);
                    const action = btn.dataset.org;
                    if (action === 'up' && i > 0) { favs.splice(i - 1, 0, favs.splice(i, 1)[0]); }
                    else if (action === 'down' && i < favs.length - 1) { favs.splice(i + 1, 0, favs.splice(i, 1)[0]); }
                    else if (action === 'delete') { favs.splice(i, 1); }
                    else if (action === 'rename') {
                        const row = btn.closest('.hnb-org-row');
                        const nameEl = row.querySelector('.hnb-org-name');
                        const input = document.createElement('input');
                        input.type = 'text';
                        input.value = favs[i].name;
                        input.className = 'hnb-org-input';
                        nameEl.innerHTML = '';
                        nameEl.appendChild(input);
                        input.focus();
                        input.select();
                        const commit = () => {
                            const list = Store.favorites();
                            list[i].name = input.value.trim() || list[i].name;
                            Store.setFavorites(list);
                            this.renderLinksBar();
                            const body = layer.querySelector('.hnb-dialog-body');
                            body.innerHTML = render();
                            wire(layer);
                        };
                        input.addEventListener('blur', commit);
                        input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') commit(); });
                        return;
                    }
                    Store.setFavorites(favs);
                    this.renderLinksBar();
                    const body = layer.querySelector('.hnb-dialog-body');
                    body.innerHTML = render();
                    wire(layer);
                });
            });
        };

        this.modal(t('fav.organizeTitle'), render(), [{ label: t('helpPage.close'), primary: true }], wire);
    };

    Browser.prototype.openDialog = function () {
        const domains = Sites.domains();
        const list = (filter) => domains
            .filter((d) => !filter || d.domain.toLowerCase().indexOf(filter.toLowerCase()) !== -1)
            .slice(0, 400)
            .map((d) => '<div class="hnb-open-row focusable" data-open="www.' + esc(d.domain) + '" tabindex="0" ' +
                'data-focus-key="hnb-open-' + esc(d.domain) + '">' + svg('globe', 12) + esc(d.domain) + '</div>').join('');

        this.modal(t('open.title'),
            '<div class="hnb-form">' +
                '<p class="hnb-dim">' + esc(t('open.hint')) + '</p>' +
                '<label>' + esc(t('open.label')) + '<input type="text" id="hnb-open-input" /></label>' +
                '<label>' + esc(t('open.filter')) + '<input type="text" id="hnb-open-filter" /></label>' +
                '<div class="hnb-dim">' + esc(t('open.count', { count: domains.length })) + '</div>' +
                '<div class="hnb-open-list" id="hnb-open-list">' + list('') + '</div>' +
            '</div>',
            [
                { label: t('open.cancel') },
                {
                    label: t('open.ok'), primary: true, action: (layer) => {
                        const value = layer.querySelector('#hnb-open-input').value.trim();
                        if (value) this.navigate(value);
                        return false;
                    }
                }
            ],
            (layer) => {
                const filter = layer.querySelector('#hnb-open-filter');
                const listEl = layer.querySelector('#hnb-open-list');
                filter.addEventListener('input', () => { listEl.innerHTML = list(filter.value); });
                listEl.addEventListener('click', (e) => {
                    const row = e.target.closest('[data-open]');
                    if (!row) return;
                    e.stopPropagation();
                    layer.querySelector('#hnb-open-input').value = row.dataset.open;
                });
                listEl.addEventListener('dblclick', (e) => {
                    const row = e.target.closest('[data-open]');
                    if (!row) return;
                    this.closeModal();
                    this.navigate(row.dataset.open);
                });
                layer.querySelector('#hnb-open-input').focus();
            });
    };

    Browser.prototype.saveDialog = function (suggested, cb) {
        this.modal(t('save.title'),
            '<div class="hnb-form">' +
                '<label>' + esc(t('save.folder')) + '<input type="text" value="C:\\Documents" readonly /></label>' +
                '<label>' + esc(t('save.label')) + '<input type="text" id="hnb-save-name" value="' + esc(suggested) + '" /></label>' +
                '<label>' + esc(t('save.type')) +
                    '<select id="hnb-save-type">' +
                        '<option value="html">' + esc(t('save.typeHtml')) + '</option>' +
                        '<option value="txt">' + esc(t('save.typeText')) + '</option>' +
                    '</select></label>' +
            '</div>',
            [
                { label: t('save.cancel') },
                {
                    label: t('save.ok'), primary: true, action: (layer) => {
                        let name = layer.querySelector('#hnb-save-name').value.trim() || suggested;
                        const type = layer.querySelector('#hnb-save-type').value;
                        name = name.replace(/\.(html?|txt)$/i, '') + (type === 'txt' ? '.txt' : '.html');
                        cb(name);
                        return false;
                    }
                }
            ],
            (layer) => { const f = layer.querySelector('#hnb-save-name'); if (f) { f.focus(); f.select(); } });
    };

    Browser.prototype.pageSetupDialog = function () {
        const setup = Store.get('pageSetup', { paper: 'A4', orientation: 'portrait', margin: 20, header: '', footer: '' });
        this.modal(t('pageSetup.title'),
            '<div class="hnb-form">' +
                '<label>' + esc(t('pageSetup.paper')) +
                    '<select id="hnb-ps-paper">' +
                    ['A4', 'A5', 'Letter', 'Legal'].map((p) =>
                        '<option' + (setup.paper === p ? ' selected' : '') + '>' + p + '</option>').join('') +
                    '</select></label>' +
                '<label>' + esc(t('pageSetup.orientation')) +
                    '<select id="hnb-ps-orient">' +
                        '<option value="portrait"' + (setup.orientation === 'portrait' ? ' selected' : '') + '>' +
                            esc(t('pageSetup.portrait')) + '</option>' +
                        '<option value="landscape"' + (setup.orientation === 'landscape' ? ' selected' : '') + '>' +
                            esc(t('pageSetup.landscape')) + '</option>' +
                    '</select></label>' +
                '<label>' + esc(t('pageSetup.margins')) +
                    '<input type="number" id="hnb-ps-margin" min="0" max="60" value="' + Number(setup.margin) + '" /></label>' +
                '<label>' + esc(t('pageSetup.header')) + '<input type="text" id="hnb-ps-header" value="' + esc(setup.header) + '" /></label>' +
                '<label>' + esc(t('pageSetup.footer')) + '<input type="text" id="hnb-ps-footer" value="' + esc(setup.footer) + '" /></label>' +
            '</div>',
            [
                { label: t('pageSetup.cancel') },
                {
                    label: t('pageSetup.ok'), primary: true, action: (layer) => {
                        Store.set('pageSetup', {
                            paper: layer.querySelector('#hnb-ps-paper').value,
                            orientation: layer.querySelector('#hnb-ps-orient').value,
                            margin: Number(layer.querySelector('#hnb-ps-margin').value) || 0,
                            header: layer.querySelector('#hnb-ps-header').value,
                            footer: layer.querySelector('#hnb-ps-footer').value
                        });
                        this.status(t('pageSetup.saved'));
                        return false;
                    }
                }
            ]);
    };

    Browser.prototype.printDialog = function () {
        const tab = this.tab();
        if (!tab) return;
        const setup = Store.get('pageSetup', { paper: 'A4', orientation: 'portrait', margin: 20, header: '', footer: '' });
        const text = this.pageText() || stripTags(this.liveDocumentText());
        const perPage = 2400;
        const pages = Math.max(1, Math.ceil(text.length / perPage));
        const sheets = [];
        for (let i = 0; i < Math.min(pages, 8); i++) {
            sheets.push(
                '<div class="hnb-sheet hnb-sheet-' + esc(setup.orientation) + '">' +
                    (setup.header ? '<div class="hnb-sheet-head">' + esc(setup.header) + '</div>' : '') +
                    '<div class="hnb-sheet-body">' + esc(text.slice(i * perPage, (i + 1) * perPage)) + '</div>' +
                    '<div class="hnb-sheet-foot">' +
                        (setup.footer ? esc(setup.footer) + ' - ' : '') +
                        esc(t('print.pageOf', { page: i + 1, total: pages })) +
                    '</div>' +
                '</div>');
        }
        this.modal(t('print.title'),
            '<div class="hnb-print">' +
                '<div class="hnb-form hnb-form-row">' +
                    '<label>' + esc(t('print.printer')) + '<input type="text" value="' + esc(t('print.printerName')) + '" readonly /></label>' +
                    '<label>' + esc(t('print.copies')) + '<input type="number" id="hnb-print-copies" min="1" max="99" value="1" /></label>' +
                    '<label>' + esc(t('print.range')) + '<input type="text" value="' + esc(t('print.all')) + '" readonly /></label>' +
                '</div>' +
                '<div class="hnb-print-preview">' + sheets.join('') + '</div>' +
            '</div>',
            [
                { label: t('print.cancel') },
                {
                    label: t('print.ok'), primary: true, action: () => {
                        this.status(t('status.printing', { title: tab.title || tab.address }));
                        setTimeout(() => this.status(t('status.printed', { title: tab.title || tab.address })), 900);
                        return false;
                    }
                }
            ]);
    };

    Browser.prototype.optionsDialog = function () {
        const o = this.opts;
        const tabBtn = (id, label) =>
            '<div class="hnb-opt-tab focusable" data-opt-tab="' + id + '" tabindex="0" ' +
            'data-focus-key="hnb-opt-tab-' + id + '">' + esc(label) + '</div>';

        const body =
            '<div class="hnb-opt">' +
                '<div class="hnb-opt-tabs">' +
                    tabBtn('general', t('options.tabGeneral')) +
                    tabBtn('security', t('options.tabSecurity')) +
                    tabBtn('advanced', t('options.tabAdvanced')) +
                '</div>' +
                '<div class="hnb-opt-panel" data-opt-panel="general">' +
                    '<fieldset><legend>' + esc(t('options.homePage')) + '</legend>' +
                        '<label>' + esc(t('options.homeAddress')) + '<input type="text" id="hnb-opt-home" value="' + esc(o.home) + '" /></label>' +
                        '<div class="hnb-opt-buttons">' +
                            '<button class="hnb-btn hnb-btn-small focusable" data-opt="useCurrent" tabindex="0" ' +
                            'data-focus-key="hnb-opt-cur">' + esc(t('options.useCurrent')) + '</button>' +
                            '<button class="hnb-btn hnb-btn-small focusable" data-opt="useDefault" tabindex="0" ' +
                            'data-focus-key="hnb-opt-def">' + esc(t('options.useDefault')) + '</button>' +
                            '<button class="hnb-btn hnb-btn-small focusable" data-opt="useBlank" tabindex="0" ' +
                            'data-focus-key="hnb-opt-blank">' + esc(t('options.useBlank')) + '</button>' +
                        '</div>' +
                    '</fieldset>' +
                    '<fieldset><legend>' + esc(t('options.historyGroup')) + '</legend>' +
                        '<label>' + esc(t('options.historyDays')) +
                            '<input type="number" id="hnb-opt-days" min="0" max="99" value="' + Number(o.historyDays) + '" /></label>' +
                        '<div class="hnb-opt-buttons">' +
                            '<button class="hnb-btn hnb-btn-small focusable" data-opt="clearHistory" tabindex="0" ' +
                            'data-focus-key="hnb-opt-ch">' + esc(t('options.clearHistory')) + '</button>' +
                            '<button class="hnb-btn hnb-btn-small focusable" data-opt="clearCookies" tabindex="0" ' +
                            'data-focus-key="hnb-opt-cc">' + esc(t('options.clearCookies')) + '</button>' +
                        '</div>' +
                    '</fieldset>' +
                    '<fieldset><legend>' + esc(t('options.appearance')) + '</legend>' +
                        '<label>' + esc(t('options.textSize')) +
                            '<select id="hnb-opt-text">' +
                            ['smallest', 'smaller', 'medium', 'larger', 'largest'].map((k, i) =>
                                '<option value="' + i + '"' + (o.textSize === i ? ' selected' : '') + '>' +
                                esc(t('textSize.' + k)) + '</option>').join('') +
                            '</select></label>' +
                        '<label>' + esc(t('options.encoding')) +
                            '<select id="hnb-opt-enc">' +
                            ['western', 'unicode', 'cyrillic', 'hexagram'].map((k) =>
                                '<option value="' + k + '"' + (o.encoding === k ? ' selected' : '') + '>' +
                                esc(t('encoding.' + k)) + '</option>').join('') +
                            '</select></label>' +
                    '</fieldset>' +
                '</div>' +
                '<div class="hnb-opt-panel hnb-hidden" data-opt-panel="security">' +
                    '<fieldset><legend>' + esc(t('options.zone')) + '</legend>' +
                        ['zoneLow', 'zoneMedium', 'zoneHigh'].map((k, i) =>
                            '<label class="hnb-radio"><input type="radio" name="hnb-zone" value="' + i + '"' +
                            (o.zone === i ? ' checked' : '') + ' /> ' + esc(t('options.' + k)) + '</label>').join('') +
                    '</fieldset>' +
                    '<fieldset><legend>' + esc(t('tools.popupBlocker')) + '</legend>' +
                        '<label class="hnb-check"><input type="checkbox" id="hnb-opt-blocker"' +
                        (o.blocker ? ' checked' : '') + ' /> ' + esc(t('options.blocker')) + '</label>' +
                    '</fieldset>' +
                '</div>' +
                '<div class="hnb-opt-panel hnb-hidden" data-opt-panel="advanced">' +
                    '<fieldset><legend>' + esc(t('options.advanced')) + '</legend>' +
                    [
                        ['showImages', 'showImages'], ['playSounds', 'playSounds'], ['smoothScroll', 'smoothScroll'],
                        ['friendlyErrors', 'friendlyErrors'], ['underlineLinks', 'underlineLinks'],
                        ['openInNewTab', 'openInNewTab']
                    ].map(([key, label]) =>
                        '<label class="hnb-check"><input type="checkbox" data-adv="' + key + '"' +
                        (o[key] ? ' checked' : '') + ' /> ' + esc(t('options.' + label)) + '</label>').join('') +
                    '</fieldset>' +
                '</div>' +
            '</div>';

        this.modal(t('options.title'), body, [
            { label: t('options.cancel') },
            { label: t('options.ok'), primary: true, action: (layer) => { this.applyOptions(layer); return false; } }
        ], (layer) => {
            const tabs = layer.querySelectorAll('[data-opt-tab]');
            tabs[0].classList.add('active');
            tabs.forEach((tabEl) => {
                tabEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    tabs.forEach((x) => x.classList.remove('active'));
                    tabEl.classList.add('active');
                    layer.querySelectorAll('[data-opt-panel]').forEach((p) =>
                        p.classList.toggle('hnb-hidden', p.dataset.optPanel !== tabEl.dataset.optTab));
                });
            });
            layer.querySelectorAll('[data-opt]').forEach((btn) => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const which = btn.dataset.opt;
                    const home = layer.querySelector('#hnb-opt-home');
                    if (which === 'useCurrent') home.value = (this.tab() && this.tab().address) || DEFAULT_HOME;
                    else if (which === 'useDefault') home.value = DEFAULT_HOME;
                    else if (which === 'useBlank') home.value = 'about:blank';
                    else if (which === 'clearHistory') { Store.setHistory([]); this.status(t('status.historyCleared')); }
                    else if (which === 'clearCookies') this.status(t('options.cookiesCleared'));
                });
            });
        });
    };

    Browser.prototype.applyOptions = function (layer) {
        const o = this.opts;
        o.home = layer.querySelector('#hnb-opt-home').value.trim() || DEFAULT_HOME;
        o.historyDays = Number(layer.querySelector('#hnb-opt-days').value) || 0;
        o.textSize = Number(layer.querySelector('#hnb-opt-text').value);
        o.encoding = layer.querySelector('#hnb-opt-enc').value;
        const zone = layer.querySelector('input[name="hnb-zone"]:checked');
        o.zone = zone ? Number(zone.value) : o.zone;
        o.blocker = layer.querySelector('#hnb-opt-blocker').checked;
        layer.querySelectorAll('[data-adv]').forEach((cb) => { o[cb.dataset.adv] = cb.checked; });
        Store.setOptions(o);
        this.applyRendering(null);
        this.updateZoneLabel();
        this.status(t('options.saved'));
        this.closeModal();
    };

    Browser.prototype.updateZoneLabel = function () {
        const zone = this.el('#hnb-status-zone');
        if (!zone) return;
        const label = this.opts.zone >= 2 ? t('status.zoneProtected') : t('status.zone');
        zone.innerHTML = svg('lock', 12) + '<span>' + esc(label) + '</span>';
    };

    Browser.prototype.syncDialog = function () {
        const domains = Sites.domains();
        this.modal(t('sync.title'),
            '<div class="hnb-form"><p class="hnb-dim">' + esc(t('sync.hint')) + '</p>' +
            '<div class="hnb-sync-line" id="hnb-sync-line">' + esc(t('status.syncing')) + '</div>' +
            '<div class="hnb-progress hnb-progress-wide"><div class="hnb-progress-fill" id="hnb-sync-fill"></div></div></div>',
            [{ label: t('sync.close'), primary: true }],
            (layer) => {
                let i = 0;
                const line = layer.querySelector('#hnb-sync-line');
                const fill = layer.querySelector('#hnb-sync-fill');
                const total = Math.min(domains.length, 40);
                const timer = setInterval(() => {
                    if (!layer.isConnected || i >= total) {
                        clearInterval(timer);
                        if (layer.isConnected) {
                            line.textContent = t('sync.done');
                            this.status(t('status.synced', { count: total }));
                        }
                        return;
                    }
                    line.textContent = t('sync.working', { name: domains[i].domain });
                    fill.style.width = Math.round(((i + 1) / total) * 100) + '%';
                    i++;
                }, 90);
            });
    };

    Browser.prototype.connectionDialog = function () {
        const rows = [
            [t('connection.gateway'), t('connection.gatewayValue')],
            [t('connection.protocol'), t('connection.protocolValue')],
            [t('connection.speed'), t('connection.speedValue')],
            [t('connection.latency'), (40 + (hash(String(Date.now() / 60000 | 0)) % 180)) + ' ms'],
            [t('connection.packets'), String(Sites.count())],
            [t('connection.cipher'), t('connection.cipherValue')]
        ];
        this.modal(t('connection.title'),
            '<table class="hnb-table">' + rows.map((r) =>
                '<tr><td>' + esc(r[0]) + '</td><td class="hnb-dim">' + esc(r[1]) + '</td></tr>').join('') + '</table>',
            [{ label: t('connection.close'), primary: true }]);
    };

    Browser.prototype.aboutDialog = function () {
        this.modal(t('about.title'),
            '<div class="hnb-about">' +
                '<div class="hnb-about-logo">' + svg('globe', 48) + '</div>' +
                '<div class="hnb-about-text">' +
                    '<h2>' + esc(t('about.product')) + '</h2>' +
                    '<table class="hnb-table">' +
                        '<tr><td>' + esc(t('about.versionLabel')) + '</td><td>' + esc(t('version')) + '</td></tr>' +
                        '<tr><td>' + esc(t('about.cipherLabel')) + '</td><td>' + esc(t('about.cipher')) + '</td></tr>' +
                        '<tr><td>' + esc(t('about.gatewayLabel')) + '</td><td>' + esc(t('connection.gatewayValue')) + '</td></tr>' +
                        '<tr><td>' + esc(t('about.documentsLabel')) + '</td><td>' + Sites.count() + '</td></tr>' +
                    '</table>' +
                    '<p class="hnb-dim">' + esc(t('about.notice')) + '</p>' +
                '</div>' +
            '</div>',
            [{ label: t('about.close'), primary: true }]);
    };

    Browser.prototype.tipDialog = function () {
        const tips = tl('tip.tips');
        if (!tips.length) return;
        let i = (Store.get('tipIndex', 0) || 0) % tips.length;
        this.modal(t('tip.title'),
            '<div class="hnb-tip"><div class="hnb-tip-icon">' + svg('star', 32) + '</div>' +
            '<div class="hnb-tip-text" id="hnb-tip-text">' + esc(tips[i]) + '</div></div>',
            [
                {
                    label: t('tip.next'), action: (layer) => {
                        i = (i + 1) % tips.length;
                        Store.set('tipIndex', i);
                        layer.querySelector('#hnb-tip-text').textContent = tips[i];
                        return true;
                    }
                },
                { label: t('tip.close'), primary: true }
            ]);
        Store.set('tipIndex', (i + 1) % tips.length);
    };

    Browser.prototype.composeDialog = function () {
        this.modal(t('mail.composeTitle'),
            '<div class="hnb-form">' +
                '<label>' + esc(t('mail.composeTo')) + '<input type="text" id="hnb-mail-to" /></label>' +
                '<label>' + esc(t('mail.composeSubject')) + '<input type="text" id="hnb-mail-subject" /></label>' +
                '<label>' + esc(t('mail.composeBody')) + '<textarea id="hnb-mail-body" rows="6"></textarea></label>' +
            '</div>',
            [
                { label: t('open.cancel') },
                { label: t('mail.send'), primary: true, action: () => { this.status(t('mail.sent')); return false; } }
            ],
            (layer) => { const f = layer.querySelector('#hnb-mail-to'); if (f) f.focus(); });
    };

    // --- zoom ---------------------------------------------------------------

    Browser.prototype.setZoom = function (percent) {
        this.opts.zoom = Math.max(25, Math.min(400, Number(percent) || 100));
        Store.setOptions(this.opts);
        this.applyRendering(null);
        const label = this.el('#hnb-status-zoom');
        if (label) label.textContent = this.opts.zoom + '%';
        this.status(t('status.zoomSet', { percent: this.opts.zoom }));
    };

    Browser.prototype.zoomStep = function (dir) {
        const steps = [50, 75, 100, 125, 150, 200];
        let i = steps.indexOf(this.opts.zoom);
        if (i === -1) i = 2;
        this.setZoom(steps[Math.max(0, Math.min(steps.length - 1, i + dir))]);
    };

    // --- command dispatch ---------------------------------------------------

    Browser.prototype.exec = function (cmd, arg) {
        if (!cmd) return;
        const parts = String(cmd).split(':');
        const head = parts[0];
        const rest = parts.slice(1).join(':');
        if (head !== 'selectTab' && head !== 'closeTabAt') this.closeMenu();

        switch (head) {
            case 'go': {
                const value = this.el('#hnb-url').value.trim();
                if (value) this.navigate(value);
                break;
            }
            case 'goSuggest':
                this.hideSuggest();
                if (String(arg).indexOf('search:') === 0) this.runSearch(String(arg).slice(7));
                else this.navigate(arg);
                break;
            case 'goFavorite': this.navigate(arg); break;
            case 'focusAddress': {
                const url = this.el('#hnb-url');
                url.focus();
                url.select();
                break;
            }
            case 'back': this.back(); break;
            case 'forward': this.forward(); break;
            case 'stop':
                this.endLoading();
                try { this.el('#hnb-frame').contentWindow.stop(); } catch (e) { /* nothing to stop */ }
                this.status(t('status.stopped'));
                break;
            case 'refresh': {
                const tab = this.tab();
                if (!tab) break;
                if (tab.internal) this.renderInternal(tab.internal, tab.internalArg);
                else if (tab.path) {
                    const frame = this.el('#hnb-frame');
                    this.beginLoading(tab.address);
                    frame.src = tab.path + (tab.path.indexOf('?') === -1 ? '?r=' : '&r=') + Date.now();
                }
                break;
            }
            case 'home': this.navigate(this.opts.home); break;
            case 'lucky': this.lucky(); break;
            case 'newTab': this.newTab(arg || this.opts.home); break;
            case 'duplicateTab': {
                const tab = this.tab();
                if (tab) this.newTab(tab.address);
                break;
            }
            case 'selectTab': this.selectTab(arg); break;
            case 'closeTab': this.closeTabAt(); break;
            case 'closeTabAt': this.closeTabAt(arg); break;
            case 'exit':
                if (window.HypernetOS && window.HypernetOS.WindowManager) {
                    window.HypernetOS.WindowManager.closeWindow(this.win);
                }
                break;
            case 'open': this.openDialog(); break;
            case 'save': this.savePage(false); break;
            case 'saveAs': this.savePage(true); break;
            case 'pageSetup': this.pageSetupDialog(); break;
            case 'print': this.printDialog(); break;
            case 'cut': case 'copy': case 'paste': this.clipboard(head); break;
            case 'selectAll': this.selectAll(); break;
            case 'find': this.openFind(); break;
            case 'findNext': this.findIn(false); break;
            case 'findPrev': this.findIn(true); break;
            case 'findClose': this.closeFind(); break;
            case 'bar': {
                this.opts.bars[rest] = !this.opts.bars[rest];
                Store.setOptions(this.opts);
                this.applyBars();
                const name = { standard: 'view.standardButtons', address: 'view.addressBar', links: 'view.linksBar', tabs: 'view.tabBar', status: 'view.statusBar' }[rest];
                this.status(t(this.opts.bars[rest] ? 'status.barShown' : 'status.barHidden', { name: t(name) }));
                break;
            }
            case 'sidebar': this.toggleSidebar(rest); break;
            case 'text':
                this.opts.textSize = Number(rest);
                Store.setOptions(this.opts);
                this.applyRendering(null);
                this.status(t('status.textSizeSet', {
                    name: t('textSize.' + ['smallest', 'smaller', 'medium', 'larger', 'largest'][this.opts.textSize])
                }));
                break;
            case 'zoom': this.setZoom(rest); break;
            case 'cycleZoom': this.zoomStep(1); break;
            case 'encoding':
                this.opts.encoding = rest;
                Store.setOptions(this.opts);
                this.status(t('status.encodingSet', { name: t('encoding.' + rest) }));
                break;
            case 'source': this.viewSource(); break;
            case 'fullScreen':
                if (window.HypernetOS && window.HypernetOS.WindowManager) {
                    window.HypernetOS.WindowManager.toggleMaximize(this.win);
                }
                break;
            case 'addFavorite': this.addFavoriteDialog(); break;
            case 'organizeFavorites': this.organizeDialog(); break;
            case 'mail': this.navigate('about:mail'); break;
            case 'compose': this.composeDialog(); break;
            case 'news': this.status(t('mail.newsHint')); break;
            case 'synchronize': this.syncDialog(); break;
            case 'blocker':
                this.opts.blocker = (rest === 'on');
                Store.setOptions(this.opts);
                this.status(t(this.opts.blocker ? 'status.blockerOn' : 'status.blockerOff'));
                if (!this.opts.blocker && this.pendingPopup) this.showPopup();
                break;
            case 'showPopup': this.showPopup(); break;
            case 'closePopup': this.closePopup(); break;
            case 'hideInfoBar': this.hideInfoBar(); break;
            case 'downloads': this.navigate('about:downloads'); break;
            case 'clearDownloads': Store.setDownloads([]); this.renderInternal('downloads'); break;
            case 'history': this.navigate('about:history'); break;
            case 'clearHistory':
                Store.setHistory([]);
                this.status(t('status.historyCleared'));
                this.renderInternal('history');
                break;
            case 'connection': this.connectionDialog(); break;
            case 'options': this.optionsDialog(); break;
            case 'help': this.navigate('about:help'); break;
            case 'support': this.navigate('www.hypernetportal.com'); break;
            case 'tip': this.tipDialog(); break;
            case 'about': this.aboutDialog(); break;
            case 'closeModal': this.closeModal(); break;
            default: break;
        }
    };

    Browser.prototype.clipboard = function (which) {
        const el = document.activeElement;
        const inField = el && /^(input|textarea)$/i.test(el.tagName) && this.root.contains(el);
        if (inField) {
            try {
                document.execCommand(which);
                this.status(t('status.' + (which === 'selectAll' ? 'selectedAll' : which === 'paste' ? 'pasted' : which === 'cut' ? 'cut' : 'copied')));
                return;
            } catch (e) { /* fall through to the document */ }
        }
        if (which === 'paste') {
            const url = this.el('#hnb-url');
            url.focus();
            try { document.execCommand('paste'); this.status(t('status.pasted')); } catch (e) { /* clipboard refused */ }
            return;
        }
        const text = this.selectionText();
        if (!text) { this.status(t('status.nothingToCopy')); return; }
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text);
            else {
                const helper = document.createElement('textarea');
                helper.value = text;
                document.body.appendChild(helper);
                helper.select();
                document.execCommand('copy');
                document.body.removeChild(helper);
            }
            this.status(t('status.' + (which === 'cut' ? 'cut' : 'copied')));
        } catch (e) {
            this.status(t('status.nothingToCopy'));
        }
    };

    Browser.prototype.selectionText = function () {
        try {
            const doc = this.el('#hnb-frame').contentDocument;
            if (doc && doc.getSelection && String(doc.getSelection())) return String(doc.getSelection());
        } catch (e) { /* not readable */ }
        return String(window.getSelection ? window.getSelection() : '');
    };

    Browser.prototype.selectAll = function () {
        const onInternal = !this.el('#hnb-page').classList.contains('hnb-hidden');
        try {
            if (onInternal) {
                const range = document.createRange();
                range.selectNodeContents(this.el('#hnb-page'));
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            } else {
                const doc = this.el('#hnb-frame').contentDocument;
                const range = doc.createRange();
                range.selectNodeContents(doc.body);
                const sel = doc.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            }
            this.status(t('status.selectedAll'));
        } catch (e) {
            this.status(t('find.unreadable'));
        }
    };

    // ── App registration ────────────────────────────────────────────────────

    let instance = null;

    window.HypernetBrowserApp = {
        launch: function () {
            if (!window.HypernetOS || !window.HypernetOS.WindowManager) {
                console.error('HypernetBrowser: HypernetOS window manager is not loaded.');
                return;
            }
            const existing = document.getElementById(APP_ID);
            const win = window.HypernetOS.WindowManager.createWindow({
                id: APP_ID,
                title: t('windowTitle'),
                icon: APP_ICON,
                width: 980,
                height: 660,
                contentHTML: Browser.chromeHTML()
            });
            if (existing && instance) return;    // already open: createWindow only raised it

            instance = new Browser(win);
            try {
                instance.start();
            } catch (e) {
                console.error('HypernetBrowser: ' + e.message);
            }
        },

        // Open the browser straight onto an address, for events and other apps.
        open: function (address) {
            this.launch();
            if (instance && address) instance.navigate(address);
        },

        current: function () { return instance; }
    };

    // The site gateway is useful outside the browser (an app that wants to know
    // whether a domain exists, or what its file is).
    window.HypernetSites = {
        ready: () => Sites.ready(),
        source: () => Sites.source(),
        count: () => Sites.count(),
        domains: () => Sites.domains(),
        pathFor: (address) => Addr.toPath(address),
        addressFor: (path) => Addr.fromPath(path),
        exists: (address) => !!Addr.toPath(address),
        suggest: (address, limit) => Addr.suggest(address, limit),
        database: (cb) => SiteDb.load(cb)
    };

    if (window.HypernetOS) {
        window.HypernetOS.registerApp({
            id: APP_ID,
            name: t('appName'),
            icon: APP_ICON,
            launchFn: function () { window.HypernetBrowserApp.launch(); },
            desktopShortcut: true
        });
    }

    const pluginName = 'HypernetBrowser';
    PluginManager.registerCommand(pluginName, 'OpenBrowser', (args) => {
        SceneManager.push(Scene_HypernetOS);
        SceneManager.prepareNextScene({ autoLaunch: APP_ID });
        if (args && args.address) {
            const address = String(args.address);
            setTimeout(() => {
                if (window.HypernetBrowserApp.current()) window.HypernetBrowserApp.current().navigate(address);
            }, 400);
        }
    });

})();
