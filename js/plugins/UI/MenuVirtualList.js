/*:
 * @target MZ
 * @plugindesc Windowed rendering for the long lists sitting under a menu's search bar.
 * @author Esoteric Heavy Industries
 *
 * @help MenuVirtualList.js
 *
 * Every menu that wears the shared search strip (UI/MenuSearchBar.js) redraws
 * its whole list on every keystroke, every cursor move and every filter tap:
 * the specialization page builds eight hundred rows to show twelve of them, the
 * skills page rebuilds a card and a canvas per skill, the bestiary lays out one
 * card per creature ever met. This mounts those lists in a window instead: only
 * the rows the scroller can actually show are in the DOM, and scrolling swaps
 * them.
 *
 * A host hands over the two things it already had - how many rows there are,
 * and the markup for row N - and gets its own scroll box back:
 *
 *     window.MenuVirtualList.render(listBox, {
 *         key: this._tab + '|' + bar.query,   // resets measurements
 *         count: rows.length,
 *         renderItem: idx => this.rowHTML(rows[idx], idx),
 *         emptyHTML: `<div class="empty">nothing here</div>`,
 *         onWindow: (win, from, to) => { ...wire clicks, draw canvases... }
 *     });
 *
 * `onWindow` runs after every window swap and is where the per-row work that
 * used to follow a full innerHTML goes: querySelectorAll listeners, icon
 * canvases, 3D previews. Rows whose handlers are inline onclick attributes need
 * nothing at all. Rows are addressed by their index in the host's own array, so
 * `data-idx` attributes and inline handlers keep meaning exactly what they did.
 *
 * Keyboard navigation must move the viewport itself, since the row it is moving
 * onto may not exist yet:
 *
 *     window.MenuVirtualList.scrollToIndex(listBox, this._selectedIndex);
 *
 * A host that redraws its whole page on every cursor step - which is most of
 * them - would otherwise repaint the window, rebind its handlers and redraw
 * every canvas in it for a mark that moved one row. Such a host says where the
 * cursor is instead, and promises that nothing ELSE about a row can change
 * without `key` changing with it:
 *
 *     window.MenuVirtualList.render(listBox, {
 *         key: this._tab + '|' + bar.query,
 *         count: rows.length,
 *         renderItem: idx => this.rowHTML(rows[idx], idx),   // still marks row `idx`
 *         focus: { index: this._selectedIndex, selector: '.my-row', className: 'selected' },
 *         onWindow: ...
 *     });
 *
 * A row that wears more than one mark - picked out AND holding the cursor -
 * names them together instead, each with the row it belongs on (-1 for none):
 *
 *         focus: { index: this._selectedIndex, selector: '.my-row', classes: {
 *             selected: this._selectedIndex,
 *             focused:  this._area === 'list' ? this._selectedIndex : -1 } }
 *
 * The rows it matches must carry `data-idx="<their index>"` - or whatever
 * attribute `focus.attr` names - since a window is a subrange and a list may
 * hold headings that are not rows. When only the focus has moved, the mark is
 * toggled on the rows already on screen and nothing is repainted; when anything
 * in `key` moves, the window is drawn again as before, and `renderItem` marks
 * the focused row itself.
 *
 * Row heights are measured, never assumed, so a list may mix section headers,
 * one-line rows and two-line rows freely. Grid scrollers (.backpack-grid and
 * friends) keep their columns: the window inherits the container's track count
 * and gaps, and windowing happens a grid-row at a time. A row that spans the
 * whole width in such a grid - a group heading between the pockets - says so
 * with `fullWidth: idx => ...`, so it is given a line of its own and the cards
 * after it stay in the column they were laid out in.
 *
 * The cheapest way to use it is to keep the host's row markup in closures, one
 * per line, and hand over `renderItem: idx => lines[idx]()`: the work a row
 * costs (reading a recipe, counting a stack, resolving a standing) is then only
 * paid for the rows on screen.
 *
 * Load this BEFORE any menu that uses it.
 */

(function () {
    'use strict';

    // What a row is assumed to be worth before anything has been measured. Only
    // affects the scrollbar's first guess and how far a blind jump lands.
    const DEFAULT_ESTIMATE = 40;

    // Lines kept rendered above and below the viewport, so a fast wheel does not
    // show a blank strip before the next frame lands.
    const OVERSCAN = 4;

    // Below this many lines the whole list is drawn in one go: the machinery is
    // the same, it simply never has anything to leave out.
    const MIN_WINDOWED = 24;

    // A grid scroller keeps its columns; everything else is one row per line.
    function readLayout(container) {
        const cs = getComputedStyle(container);
        const isGrid = cs.display === 'grid' || cs.display === 'inline-grid';
        if (!isGrid) return { columns: 1, grid: null };
        const tracks = String(cs.gridTemplateColumns || '')
            .split(' ').filter(t => t && t !== 'none');
        return {
            columns: Math.max(1, tracks.length),
            grid: { columnGap: cs.columnGap, rowGap: cs.rowGap }
        };
    }

    // Deal the rows into lines the way the browser will lay them out: `columns`
    // of them to a line, except where the host says a row takes the full width.
    // Everything downstream - measuring, scrolling, windowing - works in lines.
    function relayout(st) {
        const lines = [];
        const lineOf = [];
        const full = (st.cfg && st.cfg.fullWidth) || null;
        let i = 0;
        while (i < st.count) {
            if (st.columns === 1 || (full && full(i))) {
                lineOf[i] = lines.length;
                lines.push(i + 1);      // one line, ending after this row
                i++;
                continue;
            }
            let taken = 0;
            while (i < st.count && taken < st.columns && !(full && full(i))) {
                lineOf[i] = lines.length;
                i++;
                taken++;
            }
            lines.push(i);
        }
        st.lines = lines;               // lines[n] = index one past that line's last row
        st.lineOf = lineOf;
        if (st.heights.length > lines.length) st.heights.length = lines.length;
    }

    const lineStart = (st, line) => (line > 0 ? st.lines[line - 1] : 0);

    // Prefix sums over the per-line heights, so a scroll position can be turned
    // into a first visible line with a binary search.
    function reflow(st) {
        const n = st.lines.length;
        const offsets = st.offsets;
        offsets.length = n + 1;
        offsets[0] = 0;
        for (let i = 0; i < n; i++) {
            const h = st.heights[i];
            offsets[i + 1] = offsets[i] + (h > 0 ? h : st.estimate);
        }
        return offsets;
    }

    function lineAt(st, y) {
        const offsets = st.offsets;
        let lo = 0;
        let hi = offsets.length - 2;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (offsets[mid] <= y) lo = mid; else hi = mid - 1;
        }
        return Math.max(0, lo);
    }

    function ensure(container) {
        let st = container.__mvl;
        if (st && st.sizer.parentNode === container) return st;

        const layout = readLayout(container);

        const sizer = document.createElement('div');
        sizer.className = 'mvl-sizer';
        sizer.style.position = 'relative';
        sizer.style.width = '100%';
        // Several of these scrollers are flex columns, where a sized child would
        // otherwise be squeezed back to fit.
        sizer.style.flex = '0 0 auto';

        const win = document.createElement('div');
        win.className = 'mvl-window';
        win.style.position = 'absolute';
        win.style.top = '0';
        win.style.left = '0';
        win.style.right = '0';

        if (layout.grid) {
            // The sizer is the container's only child now, so it has to span
            // every track; the window it carries becomes the actual grid.
            sizer.style.gridColumn = '1 / -1';
            win.style.display = 'grid';
            win.style.gridTemplateColumns = `repeat(${layout.columns}, minmax(0, 1fr))`;
            win.style.columnGap = layout.grid.columnGap;
            win.style.rowGap = layout.grid.rowGap;
            win.style.alignContent = 'start';
        }

        sizer.appendChild(win);
        container.innerHTML = '';
        container.appendChild(sizer);

        st = {
            container, sizer, win,
            columns: layout.columns,
            lines: [],            // index one past each line's last row
            lineOf: [],           // row index -> line
            heights: [],          // per line, 0 until measured
            offsets: [0],
            estimate: DEFAULT_ESTIMATE,
            count: 0,
            first: -1, last: -1,  // the line range currently in the DOM
            key: null,
            cfg: null,
            focus: null          // signature of the marks, when the host tracks them
        };
        container.__mvl = st;

        // The scroller drives the window; a menu that redraws on its own only
        // ever repaints what is already on screen.
        //
        // Painted straight from the event rather than out of a frame callback:
        // the browser already coalesces scroll events to one per frame, and a
        // deferred paint that never arrives (a hidden window, a scene torn down
        // mid-scroll) would leave the window stranded behind the scrollbar.
        // paint() returns immediately when the visible range has not moved, so
        // the common case costs two binary searches.
        container.addEventListener('scroll', () => {
            if (st.cfg) paint(st, false);
        }, { passive: true });

        return st;
    }

    // Read back what the browser actually laid out. Line heights come from the
    // gap between one line's top and the next, so margins, row gaps and
    // collapsing all land in the number without being reasoned about.
    function measure(st) {
        const children = st.win.children;
        if (!children.length) return false;
        const windowStart = lineStart(st, st.first);
        let changed = false;
        let previousTop = null;
        let previousLine = -1;

        for (let line = st.first; line <= st.last; line++) {
            let top;
            if (line === st.last) {
                top = st.win.offsetHeight;
            } else {
                const child = children[lineStart(st, line) - windowStart];
                if (!child) continue;
                top = child.offsetTop;
            }
            if (previousLine >= 0) {
                const h = top - previousTop;
                if (h > 0 && Math.abs((st.heights[previousLine] || 0) - h) > 0.5) {
                    st.heights[previousLine] = h;
                    changed = true;
                }
            }
            previousTop = top;
            previousLine = line;
        }

        if (changed) {
            // Unmeasured lines are guessed at the average of what has been seen,
            // which keeps the scrollbar honest on a list of mixed row heights.
            let sum = 0;
            let seen = 0;
            for (let i = 0; i < st.heights.length; i++) {
                if (st.heights[i] > 0) { sum += st.heights[i]; seen++; }
            }
            if (seen) st.estimate = sum / seen;
        }
        return changed;
    }

    // Every mark the host wants moved, as className -> the row it belongs on.
    const focusMarks = (focus) =>
        focus.classes || { [focus.className || 'selected']: focus.index };

    // Everything about the focus that can change what the rows look like, as
    // one string: a mark that moved without the cursor moving (the cursor
    // leaving the list for the page beside it) has to count as a change too.
    function focusSignature(focus) {
        if (!focus || !focus.selector) return null;
        const marks = focusMarks(focus);
        let sig = focus.selector + '#' + (focus.attr || 'data-idx');
        for (const className in marks) sig += '|' + className + ':' + marks[className];
        return sig;
    }

    // Move those marks over the rows already on screen. The window is a
    // subrange of the list and may hold headings that are not rows at all, so a
    // row is found by the index it carries rather than by its position.
    function applyFocus(st) {
        const focus = st.cfg && st.cfg.focus;
        if (!focus || !focus.selector) return;
        const marks = focusMarks(focus);
        const attr  = focus.attr || 'data-idx';
        st.win.querySelectorAll(focus.selector).forEach((row) => {
            const idx = parseInt(row.getAttribute(attr), 10);
            for (const className in marks) row.classList.toggle(className, idx === marks[className]);
        });
    }

    function paint(st, force) {
        const cfg = st.cfg;
        if (!cfg) return;

        if (!st.count) {
            if (force || st.first !== -1) {
                st.win.innerHTML = cfg.emptyHTML || '';
                st.win.style.transform = 'translateY(0)';
                st.sizer.style.height = 'auto';
                st.first = -1;
                st.last = -1;
                if (cfg.onWindow) cfg.onWindow(st.win, 0, 0);
            }
            return;
        }

        const n = st.lines.length;
        const viewport = st.container.clientHeight || 0;

        let first;
        let last;
        if (n <= MIN_WINDOWED || !viewport) {
            first = 0;
            last = n;
        } else {
            const top = st.container.scrollTop;
            first = Math.max(0, lineAt(st, top) - OVERSCAN);
            last = Math.min(n, lineAt(st, top + viewport) + 1 + OVERSCAN);
        }

        if (!force && first === st.first && last === st.last) {
            st.sizer.style.height = st.offsets[n] + 'px';
            return;
        }

        // Two passes at most: draw the window where the current estimates say it
        // belongs, then correct the estimates from what was actually laid out.
        for (let pass = 0; pass < 2; pass++) {
            let html = '';
            const from = lineStart(st, first);
            const to = st.lines[last - 1];
            for (let i = from; i < to; i++) html += cfg.renderItem(i);

            st.win.innerHTML = html;
            st.first = first;
            st.last = last;
            st.win.style.transform = `translateY(${st.offsets[first]}px)`;
            st.sizer.style.height = st.offsets[n] + 'px';

            const before = st.offsets[first];
            if (!measure(st)) break;

            reflow(st);
            // Correcting a line above the fold moves everything under it; the
            // scroller is nudged by the same amount so the row the player was
            // looking at stays where they left it.
            const delta = st.offsets[first] - before;
            if (delta && st.container.scrollTop > 0) st.container.scrollTop += delta;
            st.win.style.transform = `translateY(${st.offsets[first]}px)`;
            st.sizer.style.height = st.offsets[n] + 'px';

            if (pass === 1 || n <= MIN_WINDOWED || !viewport) break;

            // The corrected heights can pull a different range into view.
            const top = st.container.scrollTop;
            const nextFirst = Math.max(0, lineAt(st, top) - OVERSCAN);
            const nextLast = Math.min(n, lineAt(st, top + viewport) + 1 + OVERSCAN);
            if (nextFirst === first && nextLast === last) break;
            first = nextFirst;
            last = nextLast;
        }

        applyFocus(st);
        if (cfg.onWindow) cfg.onWindow(st.win, lineStart(st, st.first), st.lines[st.last - 1]);
    }

    window.MenuVirtualList = {
        // How many across a grid is drawing right now, read off the live
        // stylesheet rather than restated in the scene. A cursor that steps by
        // a hardcoded 3 walks diagonally the moment a media query narrows the
        // grid to 2, so every scene that walks a grid with a cursor asks here
        // instead. `el` may be an element or a selector; `fallback` is what to
        // answer before the grid is on screen.
        columnsOf(el, fallback) {
            const node = typeof el === 'string'
                ? (typeof document !== 'undefined' && document.querySelector(el))
                : el;
            const guess = fallback > 0 ? fallback : 1;
            if (!node || typeof getComputedStyle !== 'function') return guess;
            try {
                return readLayout(node).columns || guess;
            } catch (e) {
                return guess;
            }
        },

        // Mount (or re-draw) `container` as a windowed list. Safe to call on
        // every refresh: the DOM around the rows survives, so the scroll
        // position does too.
        render(container, config) {
            if (!container || !config) return null;
            const st = ensure(container);
            const key = config.key === undefined ? String(config.count) : String(config.key);
            const sameList = key === st.key && config.count === st.count;

            // A host that tracks its cursor has promised that nothing but the
            // cursor can move while `key` stands still. Take it at its word: the
            // rows on screen already say everything else, so the mark is moved
            // over them and the window is left exactly as it is - no markup
            // rebuilt, no handlers rebound, no canvas redrawn, no layout
            // measured. Only a window that is actually painted qualifies.
            const wasFocus = st.focus;
            st.focus = focusSignature(config.focus);
            if (sameList && st.focus && st.first >= 0 && st.cfg && st.cfg.focus) {
                const moved = wasFocus !== st.focus;
                st.cfg = config;
                applyFocus(st);
                if (moved && typeof config.focus.index === 'number' && config.focus.index >= 0) {
                    this.scrollToIndex(container, config.focus.index);
                }
                return st;
            }

            st.cfg = config;
            st.count = config.count || 0;
            if (!sameList) {
                // A different list entirely: measurements from the old one would
                // describe rows that are no longer there.
                st.heights.length = 0;
                st.estimate = config.estimate > 0 ? config.estimate : DEFAULT_ESTIMATE;
                st.key = key;
            }
            relayout(st);
            reflow(st);
            paint(st, true);
            if (typeof config.keepVisible === 'number') {
                this.scrollToIndex(container, config.keepVisible);
            }
            return st;
        },

        // Bring a row into view by its index in the host's own array. This is
        // what replaces element.scrollIntoView(), which cannot reach a row that
        // is not currently rendered.
        scrollToIndex(container, index) {
            const st = container && container.__mvl;
            if (!st || !st.cfg || !st.count) return;
            const line = st.lineOf[Math.max(0, Math.min(st.count - 1, index))];
            if (line === undefined) return;
            const top = st.offsets[line];
            const height = st.heights[line] > 0 ? st.heights[line] : st.estimate;
            const viewport = st.container.clientHeight || 0;
            const scroll = st.container.scrollTop;
            let next = scroll;
            if (top < scroll) next = top;
            else if (top + height > scroll + viewport) next = top + height - viewport;
            if (next !== scroll) {
                st.container.scrollTop = next;
                paint(st, false);
            } else if (line < st.first || line >= st.last) {
                paint(st, false);
            }
        },

        // The index range currently in the DOM, for a host that wants to skip
        // work on rows nobody can see.
        visibleRange(container) {
            const st = container && container.__mvl;
            if (!st || st.first < 0) return null;
            return { from: lineStart(st, st.first), to: st.lines[st.last - 1] };
        },

        // Hand the container back as an ordinary box. Menus that drop their whole
        // overlay on the way out never need this.
        destroy(container) {
            const st = container && container.__mvl;
            if (!st) return;
            st.cfg = null;
            container.__mvl = null;
            container.innerHTML = '';
        }
    };
})();
