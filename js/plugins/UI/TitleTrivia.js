//=============================================================================
// TitleTrivia.js
//=============================================================================
/*:
 * @target MZ
 * @plugindesc Trivia on the title screen, the Did You Know? app on the Hypernet desktop and the Magic 8 Ball.
 * @author nocoldiz
 * @base Titlescreen
 * @orderAfter Titlescreen
 *
 * @command eightBall
 * @text Magic 8 Ball
 * @desc Shakes the Magic 8 Ball: one random trivia, shown in the dialogue box.
 *
 * @help
 * One bank of trivia, three ways to read it. Every trivia covers the lore of
 * the world, its basics, the mechanics that are easy to miss or a secret, and
 * carries a fixed number (#001, #002, ...): its place in the bank.
 *
 * Title screen: a plate in the bottom-right corner shows one trivia at a time.
 * The order is shuffled every time the title screen opens, and the chevrons
 * step to the previous or the next one. It never changes by itself.
 *
 * Hypernet desktop: the Did You Know? program browses the whole bank, with
 * search, a jump by number and a random pick. It needs no line.
 *
 * Magic 8 Ball: the item runs a common event that calls the eightBall command,
 * which shows one random trivia in the dialogue box. The item is never used up.
 *
 * Text lives in js/i18n/<lang>/plugins/Trivia.json (`entries`, plus the
 * labels of the panel, the app and the ball).
 *
 * Load after UI/Titlescreen: it hooks the title scene's create, layout, update
 * and terminate passes, and borrows window.TitleScreenKit.layout so the panel
 * scales with the canvas like every other plate on that screen.
 */

(() => {
    'use strict';

    const PLUGIN_NAME = 'UI/TitleTrivia';  // i18n-ignore: name registered in plugins.js
    const PANEL_ID = 'title-trivia';       // i18n-ignore: element id, listed in Titlescreen's SCALED_OVERLAY_IDS
    const APP_ID = 'app-trivia';           // i18n-ignore: HypernetOS program id
    const APP_ICON = 87;                   // Gold Star, per js/db/Sprites/Icons.json
    const KEY = 'Trivia';                  // i18n-ignore: i18n namespace
    const FADE_MS = 220;                   // text swap fade
    const INSET = { right: 22, bottom: 22 };

    const t = (key, params) => (typeof T === 'function' ? T(KEY + '.' + key, params) : '');

    const entries = () => {
        if (typeof T !== 'function' || typeof T.list !== 'function') return [];
        return T.list(KEY + '.entries').filter(s => typeof s === 'string' && s.trim());
    };

    // A trivia's number is its place in the bank, never its place in a shuffle,
    // so the same trivia reads #042 on the title, in the app and from the ball.
    const numberOf = index => t('number', { id: String(index + 1).padStart(3, '0') });

    // Fisher-Yates over the indices, so a fresh order every time the title opens.
    const shuffledIndices = (n) => {
        const out = [];
        for (let i = 0; i < n; i++) out.push(i);
        for (let i = n - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
        }
        return out;
    };

    // One random trivia, or null when the bank is empty.
    const randomTrivia = () => {
        const list = entries();
        if (!list.length) return null;
        const index = Math.floor(Math.random() * list.length);
        return { index: index, number: numberOf(index), text: list[index] };
    };

    const esc = v => String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    //=========================================================================
    // Title screen panel
    //=========================================================================
    class TitleTriviaPanel {
        constructor() {
            this._order = [];
            this._pos = 0;
            this._count = 0;
            this._swapTimer = null;
            this._build();
            this.render();
        }

        get element() { return this._root; }

        _build() {
            const stale = document.getElementById(PANEL_ID);
            if (stale && stale.parentNode) stale.parentNode.removeChild(stale);

            const root = document.createElement('div');
            root.id = PANEL_ID;
            root.className = 'title-plate title-trivia';

            const head = document.createElement('div');
            head.className = 'title-trivia-head';

            this._prevBtn = this._chevron('title-trivia-prev', -1);
            this._label = document.createElement('span');
            this._label.className = 'title-trivia-label';
            this._counter = document.createElement('span');
            this._counter.className = 'title-trivia-counter';
            this._nextBtn = this._chevron('title-trivia-next', 1);

            head.appendChild(this._prevBtn);
            head.appendChild(this._label);
            head.appendChild(this._counter);
            head.appendChild(this._nextBtn);

            this._text = document.createElement('div');
            this._text.className = 'title-trivia-text';

            root.appendChild(head);
            root.appendChild(this._text);

            // Presses on the panel stay on the panel: the title's background
            // drag and its menu never see them.
            root.addEventListener('mousedown', e => e.stopPropagation());
            root.addEventListener('pointerdown', e => e.stopPropagation());
            root.addEventListener('wheel', e => e.stopPropagation());

            document.body.appendChild(root);
            this._root = root;
        }

        _chevron(cls, dir) {
            const btn = document.createElement('div');
            btn.className = 'title-trivia-chevron ' + cls;
            btn.setAttribute('role', 'button');
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                this.step(dir);
            });
            return btn;
        }

        // The bank can change size under a language switch (T.list merges the
        // two layers index by index), so the order is rebuilt whenever the
        // count moves and kept otherwise.
        _syncOrder(list) {
            if (list.length === this._count && this._order.length === list.length) return;
            this._count = list.length;
            this._order = shuffledIndices(list.length);
            this._pos = 0;
        }

        render() {
            if (!this._root) return;
            const list = entries();
            this._syncOrder(list);
            this._label.textContent = t('label');
            this._prevBtn.title = t('prev');
            this._prevBtn.setAttribute('aria-label', t('prev'));
            this._nextBtn.title = t('next');
            this._nextBtn.setAttribute('aria-label', t('next'));
            if (!list.length) {
                this._root.style.display = 'none';
                return;
            }
            this._root.style.display = '';
            const index = this._order[this._pos];
            this._counter.textContent = numberOf(index);
            this._text.textContent = list[index] || '';
        }

        step(dir) {
            if (!this._count) return;
            this._pos = (this._pos + dir + this._count) % this._count;
            this._swap();
        }

        // Fades the text out, swaps it and fades it back in. A press during the
        // fade just moves the target on; the last one wins.
        _swap() {
            if (!this._text) return;
            this._text.classList.add('title-trivia-text--out');
            if (this._swapTimer) clearTimeout(this._swapTimer);
            this._swapTimer = setTimeout(() => {
                this._swapTimer = null;
                this.render();
                if (this._text) this._text.classList.remove('title-trivia-text--out');
            }, FADE_MS);
        }

        // The bottom-right corner. Over the Hyperverse it steps aside while
        // the catalog is open; over Auto Drive it stacks above the drive readout.
        // The answer only changes when the background does, so the per-frame
        // check compares a signature and places on a change.
        _slot(scene) {
            const hy = scene && scene._hyperverseBg;
            if (hy && hy._enabled) {
                return { inset: INSET, hidden: !!hy._catalogOpen };
            }
            const ad = scene && scene._autoDriveBg;
            const box = ad && ad._infoBox;
            if (box && box.offsetHeight) {
                const kit = window.TitleScreenKit;
                const s = kit && kit.layout ? kit.layout.scale() : 1;
                return { inset: { right: 22, bottom: 22 + Math.round(box.offsetHeight / s) + 10 }, hidden: false };
            }
            return { inset: INSET, hidden: false };
        }

        layout(scene) {
            const kit = window.TitleScreenKit;
            if (!this._root || !kit || !kit.layout) return;
            const slot = this._slot(scene);
            this._slotKey = JSON.stringify(slot);
            kit.layout.place(this._root, slot.inset);
            this._root.classList.toggle('title-trivia--aside', slot.hidden);
        }

        follow(scene) {
            if (!this._root) return;
            if (JSON.stringify(this._slot(scene)) !== this._slotKey) this.layout(scene);
        }

        dispose() {
            if (this._swapTimer) clearTimeout(this._swapTimer);
            this._swapTimer = null;
            if (this._root && this._root.parentNode) this._root.parentNode.removeChild(this._root);
            this._root = null;
            this._text = null;
        }
    }

    const _create = Scene_Title.prototype.create;
    Scene_Title.prototype.create = function () {
        _create.call(this);
        try {
            this._triviaPanel = new TitleTriviaPanel();
            // Held hidden with the other plates until the title has settled.
            if (!this._overlaysSettled) this._triviaPanel.element.classList.add('title-invisible');
            this._triviaPanel.layout(this);
        } catch (e) {
            console.warn('[TitleTrivia] panel not built', e); // i18n-ignore: diagnostic
            this._triviaPanel = null;
        }
    };

    // Run on every canvas move and on a language change: the panel is placed
    // again and its text re-read in the active language.
    const _layoutOverlays = Scene_Title.prototype.layoutOverlays;
    if (typeof _layoutOverlays === 'function') {
        Scene_Title.prototype.layoutOverlays = function () {
            _layoutOverlays.apply(this, arguments);
            if (this._triviaPanel) {
                this._triviaPanel.layout(this);
                this._triviaPanel.render();
            }
        };
    }

    // Placement only: the trivia itself changes on a chevron press and never
    // by itself.
    const _update = Scene_Title.prototype.update;
    Scene_Title.prototype.update = function () {
        _update.apply(this, arguments);
        if (this._triviaPanel) this._triviaPanel.follow(this);
    };

    const _terminate = Scene_Title.prototype.terminate;
    Scene_Title.prototype.terminate = function () {
        if (this._triviaPanel) {
            this._triviaPanel.dispose();
            this._triviaPanel = null;
        }
        _terminate.apply(this, arguments);
    };

    //=========================================================================
    // Magic 8 Ball
    //=========================================================================
    // The item is not consumable and runs a common event holding this command.
    // Two boxes: the ball being shaken, then the trivia that floats up, spoken
    // by the ball. The interpreter waits on them like on any Show Text.
    const shakeEightBall = function () {
        if (typeof $gameMessage === 'undefined' || !$gameMessage) return;
        const pick = randomTrivia();
        if (!pick) return;
        $gameMessage.setSpeakerName(t('eightBall.name'));
        $gameMessage.add(t('eightBall.shake'));
        $gameMessage.newPage();
        $gameMessage.add(t('eightBall.answer', { number: pick.number, text: pick.text }));
        if (this && typeof this.setWaitMode === 'function') this.setWaitMode('message');
    };

    if (typeof PluginManager !== 'undefined' && PluginManager.registerCommand) {
        PluginManager.registerCommand(PLUGIN_NAME, 'eightBall', shakeEightBall);
    }

    //=========================================================================
    // Hypernet desktop: Did You Know?
    //=========================================================================
    // Every control is .focusable with a stable id, so the OS focus ring
    // drives it on keyboard, WASD and controller as well as the mouse.
    const TriviaApp = {
        _win: null,
        _current: 0,
        _query: '',

        launch() {
            const OS = window.HypernetOS;
            if (!OS || !OS.WindowManager) return;
            const html = `
                <div class="hn-trivia">
                    <div class="hn-trivia-banner">
                        <div class="hn-trivia-logo">${esc(t('app.name'))}</div>
                        <div class="hn-trivia-tagline">${esc(t('app.tagline'))}</div>
                    </div>
                    <div class="hn-trivia-toolbar">
                        <button id="hn-trivia-prev" class="focusable">${esc(t('app.prev'))}</button>
                        <button id="hn-trivia-random" class="focusable">${esc(t('app.random'))}</button>
                        <button id="hn-trivia-next" class="focusable">${esc(t('app.next'))}</button>
                        <input id="hn-trivia-search" class="focusable" type="text" placeholder="${esc(t('app.search'))}">
                    </div>
                    <div class="hn-trivia-card">
                        <div class="hn-trivia-number" id="hn-trivia-number"></div>
                        <div class="hn-trivia-text" id="hn-trivia-text"></div>
                    </div>
                    <div class="hn-trivia-count" id="hn-trivia-count"></div>
                    <div class="hn-trivia-list" id="hn-trivia-list"></div>
                </div>`;
            const win = OS.WindowManager.createWindow({
                id: APP_ID, title: t('app.name'), icon: APP_ICON, width: 640, height: 520, contentHTML: html
            });
            if (!win || win._triviaBound) return;
            win._triviaBound = true;
            this._win = win;
            const list = entries();
            this._current = list.length ? Math.floor(Math.random() * list.length) : 0;
            this._query = '';

            const q = s => win.querySelector(s);
            q('#hn-trivia-prev').addEventListener('click', () => this.step(-1));
            q('#hn-trivia-next').addEventListener('click', () => this.step(1));
            q('#hn-trivia-random').addEventListener('click', () => this.pickRandom());
            q('#hn-trivia-search').addEventListener('input', (e) => {
                this._query = String(e.target.value || '');
                this.renderList();
            });
            q('#hn-trivia-list').addEventListener('click', (e) => {
                const row = e.target.closest ? e.target.closest('[data-trivia]') : null;
                if (!row) return;
                this._current = Number(row.dataset.trivia) || 0;
                this.render();
            });
            this.render();
        },

        // The indices the search matches. A bare number, with or without the
        // hash, jumps to that trivia; anything else matches the words.
        matches() {
            const list = entries();
            const raw = this._query.trim().toLowerCase();
            if (!raw) return list.map((_, i) => i);
            const num = raw.replace(/^#/, '');
            if (/^\d+$/.test(num)) {
                const i = Number(num) - 1;
                return i >= 0 && i < list.length ? [i] : [];
            }
            return list.map((s, i) => (s.toLowerCase().indexOf(raw) >= 0 ? i : -1)).filter(i => i >= 0);
        },

        step(dir) {
            const n = entries().length;
            if (!n) return;
            this._current = (this._current + dir + n) % n;
            this.render();
        },

        pickRandom() {
            const pick = randomTrivia();
            if (!pick) return;
            this._current = pick.index;
            this.render();
        },

        render() {
            const win = this._win;
            if (!win) return;
            const list = entries();
            const q = s => win.querySelector(s);
            if (this._current >= list.length) this._current = 0;
            q('#hn-trivia-number').textContent = list.length ? numberOf(this._current) : '';
            q('#hn-trivia-text').textContent = list[this._current] || t('app.empty');
            this.renderList();
        },

        renderList() {
            const win = this._win;
            if (!win) return;
            const list = entries();
            const hits = this.matches();
            win.querySelector('#hn-trivia-count').textContent = t('app.count', { count: hits.length, total: list.length });
            win.querySelector('#hn-trivia-list').innerHTML = hits.length
                ? hits.map(i => `
                    <div class="hn-trivia-row focusable${i === this._current ? ' is-current' : ''}" tabindex="0"
                         data-trivia="${i}" data-focus-key="trivia-${i}">
                        <span class="hn-trivia-row-num">${esc(numberOf(i))}</span>
                        <span class="hn-trivia-row-text">${esc(list[i])}</span>
                    </div>`).join('')
                : `<div class="hn-trivia-none">${esc(t('app.noMatch'))}</div>`;
        }
    };

    // HypernetOS loads after this plugin, so the program registers once boot
    // has every plugin in place.
    const registerApp = () => {
        if (!window.HypernetOS || !window.HypernetOS.registerApp) return false;
        window.HypernetOS.registerApp({
            id: APP_ID,
            name: () => t('app.name'),
            icon: APP_ICON,
            category: 'reference',
            launchFn: () => TriviaApp.launch(),
            desktopShortcut: true
        });
        return true;
    };
    if (!registerApp() && typeof Scene_Boot !== 'undefined') {
        const _Scene_Boot_create = Scene_Boot.prototype.create;
        Scene_Boot.prototype.create = function () {
            _Scene_Boot_create.call(this);
            registerApp();
        };
    }

    window.TitleTrivia = {
        Panel: TitleTriviaPanel,
        App: TriviaApp,
        shuffledIndices: shuffledIndices,
        random: randomTrivia,
        numberOf: numberOf,
        shakeEightBall: shakeEightBall
    };
})();
