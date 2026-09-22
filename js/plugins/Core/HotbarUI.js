/*:
 * @target MZ
 * @plugindesc Shared quick-bar widget v1.0.0 - the Daggerfall-style row of numbered slots used by the battle skill bar and the item favourites bar.
 * @author Omni-Lex
 * @help HotbarUI.js
 *
 * Exposes window.HotbarUI, the DOM widget behind every quick bar in the game:
 *
 *   - BattleSystemEnhancedHUD.js  , the acting member's carried skills
 *   - ItemSystemHotbar.js         , the party's favourite items (map + backpack)
 *
 * The widget owns the slot markup, the icon blitting, the tooltip, the name
 * line and the canvas-synced placement; each caller owns what a slot means and
 * what a click does. Styling lives in css/theme.css under `.hotbar-slot`.
 *
 * Bars built with `showLabel` carry a name line under the row: whatever slot
 * is armed or hovered says what it is, and goes quiet again the moment it is
 * used or left alone. The line's height is always reserved (see
 * HotbarUI.LABEL_BLOCK_PX), so the row never jumps as names come and go.
 *
 * Placement modes:
 *   fixed  (default) , bottom-centre of the game canvas, scaled with it.
 *   inline           , the root is handed to the caller to mount inside its
 *                      own DOM layout (used by the backpack overlay).
 *
 * Must load before any plugin that constructs a HotbarUI.
 */

(function () {
  'use strict';

  // The canvas rect only moves on a resize, so it is worth caching: every bar
  // re-reads it once per frame while visible.
  let _cachedScale = null;
  window.addEventListener('resize', () => { _cachedScale = null; });

  function canvasScale() {
    if (_cachedScale) return _cachedScale;
    const el = document.getElementById('gameCanvas');
    if (!el) return { sx: 1, sy: 1, ox: 0, oy: 0 };
    const r = el.getBoundingClientRect();
    _cachedScale = {
      sx: r.width / Graphics.width,
      sy: r.height / Graphics.height,
      ox: r.left,
      oy: r.top
    };
    return _cachedScale;
  }

  // One tooltip element is shared by every bar: only one can be hovered at a
  // time, and keeping a single node avoids leaking one per widget.
  const TOOLTIP_ID = 'html-hotbar-tooltip';

  function tooltipEl() {
    let el = document.getElementById(TOOLTIP_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = TOOLTIP_ID;
      el.className = 'hotbar-tooltip';
      document.body.appendChild(el);
    }
    return el;
  }

  function hideTooltip() {
    const el = document.getElementById(TOOLTIP_ID);
    if (el) el.style.display = 'none';
  }

  // Height the name line costs the bar: the text box plus its gap above.
  // Reserved whether or not a name is showing, so an appearing name never
  // shoves the row it belongs to upwards. Mirrors `.hotbar-label` in theme.css.
  const LABEL_BLOCK_PX = 24;

  // Height the description line costs the bar. It sits above the row and is
  // reserved whether or not a slot is speaking, so an appearing description
  // never shoves the row. Mirrors `.hotbar-desc` in theme.css. A description
  // centred over the bar is what says what the armed thing does, rather than a
  // card anchored off the side of one slot.
  const DESC_BLOCK_PX = 38;

  /**
   * A row of numbered slots.
   *
   * Entries passed to render() are either null (empty slot) or:
   *   { iconIndex, enabled, count, tooltip, label, description, swatch, detail }
   *
   * `label` is what the name line under the row says for that slot; it falls
   * back to `tooltip` when a caller has only the one string.
   *
   * `description` is what the line centred above the row says for that slot:
   * the database description of the skill or item behind it. A bar carrying
   * descriptions puts up no hover card.
   *
   * `detail` is the reading card the slot puts up while the pointer is on it
   * or while the keys have it armed: `{ title, cost, body }`, all optional
   * strings, drawn as text and never as markup. A bar carrying details shows
   * them even when it also carries a name line: the line has room for the name
   * only, and the card is what says what the thing does.
   *
   * `swatch` is a CSS colour drawn in place of the icon, for a bar whose
   * contents are not things out of the icon sheet: the 3D world's block bar
   * holds cubes of turf, sand and rock, which have a colour and no icon.
   *
   * Options:
   *   id            DOM id of the root element (required, unique per bar)
   *   slots         slot count (default 9)
   *   slotPx/gapPx/iconPx/marginBottom   geometry, in canvas pixels
   *   zIndex        stacking order of the root
   *   inline        true to let the caller mount the root itself
   *   emptyClickable  true when empty slots are meaningful targets too
   *   showDescription true to carry the description line centred over the row
   *   showLabel     true to carry the name line under the row (and to let it
   *                 take the hover tooltip's job, rather than say the same
   *                 thing twice in two places)
   *   onSlotClick   (index, entry, event) on left click / tap
   *   onSlotContext (index, entry, event) on right click
   *   onSlotDrop    (index, entry, event) when something dragged from
   *                 elsewhere in the page (an inventory slot, say) is
   *                 dropped on this slot. Only bars that pass this become
   *                 drop targets at all; the battle skill bar leaves it
   *                 unset and stays inert to drags.
   *   onSlotDragStart (index, entry, event) when a filled slot is picked up.
   *                 Only bars that pass this let their slots be dragged at
   *                 all; return false to refuse the drag.
   */
  class HotbarUI {
    constructor(options) {
      const o = options || {};
      this.id = o.id;
      this.slots = o.slots || 9;
      this.slotPx = o.slotPx || 52;
      this.gapPx = o.gapPx || 6;
      this.iconPx = o.iconPx || 32;
      // Fixed bars default to a small lift off the bottom edge so they never
      // touch the canvas border; callers can still override per bar.
      this.marginBottom = o.marginBottom !== undefined ? o.marginBottom : (o.inline ? 0 : 10);
      this.zIndex = o.zIndex || 352;
      this.inline = !!o.inline;
      // Bars that only fire filled slots (the battle and map ones) leave empty
      // slots looking inert; an assignment bar wants every slot to invite a click.
      this.emptyClickable = !!o.emptyClickable;
      this.showLabel = !!o.showLabel;
      // Only a bar that asks for it carries the description line: the line
      // costs height whether or not a slot is speaking, and a bar that never
      // fills it would just stand that much further off the canvas edge.
      this.showDescription = !!o.showDescription;
      this.onSlotClick = o.onSlotClick || null;
      this.onSlotContext = o.onSlotContext || null;
      this.onSlotDrop = o.onSlotDrop || null;
      this.onSlotDragStart = o.onSlotDragStart || null;
      // A bar holding more entries than it has slots turns a page at a time:
      // the chevrons flanking the row are what says so, and clicking one is
      // the same as the Left / Right the keyboard turns pages with.
      this.onPagePrev = o.onPagePrev || null;
      this.onPageNext = o.onPageNext || null;
      this._root = null;
      this._labelEl = null;
      this._descEl = null;
      this._slotEls = [];
      this._entries = [];
      this._state = {};
      this._hoverIndex = -1;
    }

    /** Total width of the row, in canvas pixels. */
    width() {
      return this.slots * this.slotPx + (this.slots - 1) * this.gapPx;
    }

    /** Total height of the widget, name line included, in canvas pixels. */
    height() {
      return this.slotPx + (this.showLabel ? LABEL_BLOCK_PX : 0) +
        (this.showDescription ? DESC_BLOCK_PX : 0);
    }

    root() {
      // An inline root is legitimately detached until the caller mounts it.
      if (this._root && (this.inline || this._root.isConnected)) return this._root;
      let root = document.getElementById(this.id);
      if (!root) {
        root = document.createElement('div');
        root.id = this.id;
        root.className = 'hotbar-row';
        // A column: the row of slots, then the name line under it.
        root.style.cssText = this.inline
          ? 'position:relative;display:none;flex-direction:column;align-items:center;'
          : 'position:fixed;display:none;flex-direction:column;align-items:center;transform-origin:top left;';
        root.style.zIndex = String(this.zIndex);
        root.style.pointerEvents = 'auto';
        if (!this.inline) document.body.appendChild(root);

        // RPG Maker's TouchInput listens on `document` and only looks at page
        // coordinates, never at the event target, so a click on a slot would
        // otherwise *also* register as a click on the canvas underneath and
        // fire whatever the active window has highlighted. Stopping the raw
        // pointer events here, before they bubble past the bar, is what keeps
        // a slot press from double-firing.
        const swallow = (e) => e.stopPropagation();
        for (const type of ['mousedown', 'mouseup', 'touchstart', 'touchend']) {
          root.addEventListener(type, swallow);
        }
        root.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
        });
      }
      this._root = root;
      return root;
    }

    /** Inline mode: hand the root to a parent the caller lays out itself. */
    mount(parent) {
      if (!parent) return;
      const root = this.root();
      if (root.parentNode !== parent) parent.appendChild(root);
    }

    /**
     * Put a reading card over a slot: the same shared tooltip node, laid out
     * as title / cost / body instead of one line. Everything is written as
     * text, so a database description can say what it likes.
     */
    showDetail(detail, slotEl) {
      if (!detail || !slotEl) return;
      const tip = tooltipEl();
      // Rebuilt only when the card has something else to say: a bar armed on
      // one slot re-renders every frame, and re-writing three text nodes sixty
      // times a second for the same three strings is work nobody asked for.
      const key = [detail.title, detail.cost, detail.body].join('');
      if (tip.dataset.cardKey === key && tip.style.display === 'block') {
        this._placeTooltip(tip, slotEl);
        return;
      }
      tip.dataset.cardKey = key;
      tip.className = 'hotbar-tooltip hotbar-tooltip-card';
      tip.innerHTML = '';
      const line = (cls, text) => {
        if (!text) return;
        const el = document.createElement('div');
        el.className = cls;
        el.textContent = String(text);
        tip.appendChild(el);
      };
      line('hotbar-tip-title', detail.title);
      line('hotbar-tip-cost', detail.cost);
      line('hotbar-tip-body', detail.body);
      if (!tip.childNodes.length) { hideTooltip(); return; }
      this._placeTooltip(tip, slotEl);
    }

    _placeTooltip(tip, slotEl) {
      tip.style.zIndex = String(this.zIndex + 1);
      const r = slotEl.getBoundingClientRect();
      tip.style.left = (r.left + r.width / 2) + 'px';
      tip.style.top = r.top + 'px';
      tip.style.display = 'block';
    }

    /**
     * What the shared tooltip should be showing right now: the slot under the
     * pointer first, else the slot the keys have armed. A card (`detail`) goes
     * up either way, so a player who arms a slot from the keyboard reads the
     * same thing a player who hovers it does. A plain one-line tooltip stays
     * hover-only, and stays out of the way of bars that already print the name
     * under the row.
     */
    _syncDetail() {
      const st = this._state || {};
      const entries = this._entries || [];
      const hovered = this._hoverIndex >= 0;
      const index = hovered ? this._hoverIndex
        : (st.active && st.selected != null ? st.selected : -1);
      const entry = index >= 0 ? entries[index] : null;
      const slot = index >= 0 && this._slotEls ? this._slotEls[index] : null;
      if (!entry || !slot || st.inert) { hideTooltip(); return; }
      // A bar that prints a description over the row has already said what the
      // slot does, centred, and stacks no anchored card on top of it.
      if (entry.detail && !this._descEl) { this.showDetail(entry.detail, slot); return; }
      if (hovered && !this.showLabel && entry.tooltip) {
        this.showTooltip(entry.tooltip, slot);
        return;
      }
      hideTooltip();
    }

    showTooltip(text, slotEl) {
      if (!text || !slotEl) return;
      const tip = tooltipEl();
      tip.dataset.cardKey = '';
      tip.className = 'hotbar-tooltip';
      tip.textContent = text;
      this._placeTooltip(tip, slotEl);
    }

    _key(entries, state) {
      const parts = [];
      for (let i = 0; i < this.slots; i++) {
        const e = entries[i];
        parts.push(e ? `${e.swatch || e.iconIndex}${e.enabled ? 'u' : 'd'}${e.count != null ? 'x' + e.count : ''}` : '-');
      }
      return parts.join(',') + '|' + (state.selected != null ? state.selected : -1) + '|' + (state.active ? 1 : 0) +
        '|' + (state.pages > 1 ? (state.page || 0) + '/' + state.pages : '');
    }

    /** The name the line under the row should be showing, '' for none. */
    _labelText(entries, state) {
      const st = state || {};
      // What the pointer is on wins over what the keys have armed: the hand is
      // asking about that slot right now.
      const index = this._hoverIndex >= 0 ? this._hoverIndex
        : (st.active && st.selected != null ? st.selected : -1);
      const entry = index >= 0 ? entries[index] : null;
      return entry ? (entry.label || entry.tooltip || '') : '';
    }

    /**
     * Which slot is speaking right now: the one under the pointer first, else
     * the one the keys have armed, else -1. A bar whose reading is printed
     * somewhere else of its own (the battle description box) asks here rather
     * than reaching into the widget's own fields.
     */
    spokenIndex() {
      const st = this._state || {};
      if (st.inert) return -1;
      if (this._hoverIndex >= 0) return this._hoverIndex;
      return (st.active && st.selected != null) ? st.selected : -1;
    }

    /** The description the line over the row should be showing, '' for none. */
    _descText(entries, state) {
      const st = state || {};
      // A bar standing down says nothing, the same way its card goes.
      if (st.inert) return '';
      const index = this._hoverIndex >= 0 ? this._hoverIndex
        : (st.active && st.selected != null ? st.selected : -1);
      const entry = index >= 0 ? entries[index] : null;
      return entry ? (entry.description || '') : '';
    }

    _syncDesc() {
      const el = this._descEl;
      if (!el) return;
      const text = this._descText(this._entries, this._state);
      if (el.dataset.text === text) return;
      el.dataset.text = text;
      el.textContent = text;
      el.style.visibility = text ? 'visible' : 'hidden';
    }

    _syncLabel() {
      const el = this._labelEl;
      if (!el) return;
      const text = this._labelText(this._entries, this._state);
      if (el.dataset.text === text) return;
      el.dataset.text = text;
      el.textContent = text;
      // Hidden rather than removed: the row must not shuffle when a name goes.
      el.style.visibility = text ? 'visible' : 'hidden';
    }

    _build(entries, state) {
      const root = this.root();
      root.innerHTML = '';
      this._labelEl = null;
      this._descEl = null;
      // The slots the pointer was over are about to be thrown away, and a
      // discarded element never sends its mouseleave: forget the hover rather
      // than leave a name up for a slot that no longer exists. The next mouse
      // move puts it back.
      this._hoverIndex = -1;
      // The card a hovered or armed slot puts up is anchored on the slot
      // itself, so the row keeps its elements to hand.
      this._slotEls = [];
      // Not `row`: the icon blitting below already uses that name for the
      // icon sheet's row.
      if (this.showDescription) {
        const desc = document.createElement('div');
        desc.className = 'hotbar-desc';
        // Pinned to the row's own width so a long description wraps inside the
        // bar rather than widening the column and dragging the slots off-centre.
        desc.style.width = this.width() + 'px';
        desc.style.visibility = 'hidden';
        root.appendChild(desc);
        this._descEl = desc;
      }

      const rowEl = document.createElement('div');
      rowEl.className = 'hotbar-slots';
      rowEl.style.gap = this.gapPx + 'px';
      for (let i = 0; i < this.slots; i++) {
        const entry = entries[i] || null;
        const slot = document.createElement('div');
        slot.className = 'hotbar-slot' +
          (!entry ? ' empty' : (entry.enabled ? '' : ' disabled')) +
          (state.active && i === state.selected ? ' selected' : '');
        slot.style.width = this.slotPx + 'px';
        slot.style.height = this.slotPx + 'px';

        const num = document.createElement('div');
        num.className = 'hotbar-num';
        num.textContent = String(i + 1);
        slot.appendChild(num);

        if (entry) {
          // Most bars carry things out of the icon sheet. A slot can carry a
          // flat colour instead (`swatch`): the 3D world's quick bar holds
          // cubes of dug ground, which have a colour and no icon.
          let icon;
          if (entry.swatch) {
            icon = document.createElement('div');
            icon.className = 'hotbar-swatch';
            icon.style.width = this.iconPx + 'px';
            icon.style.height = this.iconPx + 'px';
            icon.style.background = entry.swatch;
          } else {
            icon = document.createElement('div');
            icon.className = 'hotbar-icon';
            icon.style.width = this.iconPx + 'px';
            icon.style.height = this.iconPx + 'px';
            const col = entry.iconIndex % 16;
            const row = Math.floor(entry.iconIndex / 16);
            icon.style.backgroundPosition = `${-col * this.iconPx}px ${-row * this.iconPx}px`;
          }
          slot.appendChild(icon);

          if (entry.count != null) {
            const count = document.createElement('div');
            count.className = 'hotbar-count';
            count.textContent = String(entry.count);
            slot.appendChild(count);
          }
        }

        // Listeners read this._entries at event time rather than closing over
        // `entry`, so a rebuild between press and release can never act on a
        // stale slot.
        if (entry || (this.emptyClickable && this.onSlotClick)) slot.style.cursor = 'pointer';
        slot.addEventListener('mouseenter', () => {
          this._hoverIndex = i;
          this._syncLabel();
          this._syncDesc();
          this._syncDetail();
        });
        slot.addEventListener('mouseleave', () => {
          if (this._hoverIndex === i) this._hoverIndex = -1;
          this._syncLabel();
          this._syncDesc();
          this._syncDetail();
        });
        slot.addEventListener('pointerup', (e) => {
          if (e.button !== undefined && e.button !== 0) return;
          // Whatever the click did, it answered the question the name was
          // asking; it comes back if the pointer leaves and returns.
          this._hoverIndex = -1;
          this._syncLabel();
          this._syncDesc();
          this._syncDetail();
          if (this.onSlotClick) this.onSlotClick(i, this._entries[i] || null, e);
        });
        slot.addEventListener('pointerdown', (e) => {
          if (e.button === 2 && this.onSlotContext) {
            this.onSlotContext(i, this._entries[i] || null, e);
          }
        });

        // Only a bar the caller wired a drop handler onto (the backpack's
        // assignment strip) becomes a drop target; the battle skill bar and
        // the map bar leave onSlotDrop unset and stay inert to drags.
        if (this.onSlotDrop) {
          slot.addEventListener('dragover', (e) => {
            e.preventDefault();
            slot.classList.add('drag-over');
          });
          slot.addEventListener('dragleave', () => {
            slot.classList.remove('drag-over');
          });
          slot.addEventListener('drop', (e) => {
            e.preventDefault();
            slot.classList.remove('drag-over');
            this.onSlotDrop(i, this._entries[i] || null, e);
          });
        }

        // A bar the caller wired a pick-up handler onto lets a filled slot be
        // dragged out of the row, so a skill can be put down by dropping it
        // back on the page it came from.
        if (this.onSlotDragStart && entry) {
          slot.setAttribute('draggable', 'true');
          slot.addEventListener('dragstart', (e) => {
            if (this.onSlotDragStart(i, this._entries[i] || null, e) === false) {
              e.preventDefault();
              return;
            }
            slot.classList.add('dragging');
          });
          slot.addEventListener('dragend', () => {
            slot.classList.remove('dragging');
          });
        }

        rowEl.appendChild(slot);
        this._slotEls[i] = slot;
      }
      // Chevrons only appear once there is a second page to turn to, and they
      // sit on the row's own middle line, one at either end of the slots.
      if (state.pages > 1) {
        const chevron = (dir, handler) => {
          const el = document.createElement('div');
          el.className = 'hotbar-chev hotbar-chev-' + dir;
          el.style.height = this.slotPx + 'px';
          el.textContent = dir === 'prev' ? '‹' : '›';
          el.style.cursor = 'pointer';
          el.addEventListener('pointerup', (e) => {
            if (e.button !== undefined && e.button !== 0) return;
            if (handler) handler(e);
          });
          return el;
        };
        rowEl.insertBefore(chevron('prev', this.onPagePrev), rowEl.firstChild);
        rowEl.appendChild(chevron('next', this.onPageNext));
      }
      root.appendChild(rowEl);

      if (this.showLabel) {
        const label = document.createElement('div');
        label.className = 'hotbar-label';
        // Pinned to the row's own width so a long name is clipped rather than
        // widening the column and dragging the slots off-centre.
        label.style.width = this.width() + 'px';
        label.style.visibility = 'hidden';
        root.appendChild(label);
        this._labelEl = label;
        this._syncLabel();
        this._syncDesc();
      }
    }

    _position() {
      const root = this.root();
      const sc = canvasScale();
      const x = (Graphics.width - this.width()) / 2;
      // Anchored to the canvas's own bottom edge (Graphics.height), the same
      // frame `x` uses (Graphics.width). Graphics.boxHeight is the UI-safe
      // area RPG Maker centres inside the canvas for letterboxed aspect
      // ratios; ResolutionSwitcher.js resizes Graphics.height without ever
      // touching boxHeight, so keying off boxHeight here left the bar riding
      // a stale, much smaller frame and made marginBottom mostly a no-op.
      // The name line sits between the slots and that edge, so the block that
      // has to fit above the bottom is the row plus the line.
      const y = Graphics.height - this.height() - this.marginBottom;
      const left = (sc.ox + x * sc.sx) + 'px';
      const top = (sc.oy + y * sc.sy) + 'px';
      const transform = `scale(${sc.sx}, ${sc.sy})`;
      if (this._lastPosLeft !== left) {
        root.style.left = left;
        this._lastPosLeft = left;
      }
      if (this._lastPosTop !== top) {
        root.style.top = top;
        this._lastPosTop = top;
      }
      if (this._lastPosTransform !== transform) {
        root.style.transformOrigin = '0 0';
        root.style.transform = transform;
        this._lastPosTransform = transform;
      }
    }

    /**
     * Draw the bar. `state` is { selected, active, inert }.
     *
     * `inert` keeps the bar on screen while something else owns the input , a
     * message, a choice, a running event , so the row never blinks away
     * mid-conversation. It is greyed and takes no clicks until the map has
     * the keys back.
     */
    render(entries, state) {
      const st = state || {};
      const list = entries || [];
      const root = this.root();
      const key = this._key(list, st);
      this._entries = list;
      this._state = st;
      if (root.dataset.key !== key) {
        root.dataset.key = key;
        this._build(list, st);
      }
      this._syncLabel();
      this._syncDesc();
      // Set outside the cached rebuild: the same row of slots is shown live
      // one frame and inert the next, and nothing about it needs redrawing.
      const inert = !!st.inert;
      root.classList.toggle('hotbar-inert', inert);
      root.style.pointerEvents = inert ? 'none' : 'auto';
      if (inert) this._hoverIndex = -1;
      this._syncDetail();
      if (root.style.display !== 'flex') root.style.display = 'flex';
      if (!this.inline) this._position();
    }

    hide() {
      const root = document.getElementById(this.id);
      if (root) root.style.display = 'none';
      // A bar that vanishes under the pointer never gets its mouseleave, and a
      // hidden bar has nothing armed either: the line starts blank when the bar
      // comes back, rather than flashing the name it went away on.
      this._hoverIndex = -1;
      this._state = {};
      this._syncLabel();
      this._syncDesc();
      hideTooltip();
    }

    /** Drop the element entirely; used when a scene tears its overlay down. */
    destroy() {
      const root = document.getElementById(this.id);
      if (root && root.parentNode) root.parentNode.removeChild(root);
      this._root = null;
      this._labelEl = null;
      this._descEl = null;
      this._entries = [];
      this._state = {};
      this._hoverIndex = -1;
      hideTooltip();
    }
  }

  HotbarUI.LABEL_BLOCK_PX = LABEL_BLOCK_PX;
  HotbarUI.canvasScale = canvasScale;
  HotbarUI.hideTooltip = hideTooltip;

  window.HotbarUI = HotbarUI;
})();
