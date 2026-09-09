/*:
 * @target MZ
 * @plugindesc Two-panel picker: one shared widget for moving rows between two
 * lists, by drag and drop or by the button on the row.
 * @author OmniLex
 *
 * @help
 * TwoPanelPicker.js
 *
 * The same act keeps coming up in this game: two lists side by side and a row
 * that has to go from one of them to the other. Who is travelling and who is
 * benched (UI/CustomMainMenuLayout.js, the Party Dynamics board), who takes a
 * shift at a shop the party owns (Economy/ShopManagement.js), who goes out to
 * work (Work/WorkSystem.js on the hyperdeck desktop), what comes out of the
 * backpack and onto the shelves (Economy/ShopManagementUI.js).
 *
 * Every one of those used to be written again from scratch, so a row could be
 * dragged in one place and only clicked in another. This is that widget, once:
 *
 *   - two panels, each holding rows, either of them able to take a drop
 *   - a row is DRAGGED across, or moved with the button on the row itself, so
 *     a pad and a keyboard are never left out (every row and button is
 *     .focusable, the convention the rest of the DOM menus follow)
 *   - a stack (five potions) offers one and all
 *   - the widget owns none of the data: the caller hands it two lists and one
 *     move() function, and is asked again for the lists after every move
 *
 * It renders markup, so it works wherever the host draws DOM: a parchment
 * book-spread, a HypernetOS window, or its own overlay.
 *
 *   const id = TwoPanelPicker.register({
 *       id: 'shop-stock',
 *       left:  { key: 'bag',   title: '...', items: () => [...] },
 *       right: { key: 'shelf', title: '...', items: () => [...], max: 7 },
 *       move(itemId, from, to, amount) { ...; return true; },
 *   });
 *   host.innerHTML = TwoPanelPicker.html(id);
 *   TwoPanelPicker.mounted(host, id);   // paints the icons, wires the rows
 *
 * A row is { id, name, sub, note, count, iconIndex, movable, disabled }.
 * move() answers true, or { ok: false, reason: 'why' } to be told no with a
 * buzzer and a toast.
 */

(() => {
  'use strict';

  const PLUGIN_NAME = 'TwoPanelPicker';

  // Every live picker, by id. A spec is registered by the page that draws it
  // and released when that page closes; the inline handlers in the markup look
  // themselves up here, since a DOM string cannot close over anything.
  const _specs = new Map();

  function esc(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function spec(id) { return _specs.get(String(id)) || null; }

  function sideOf(sp, key) {
    if (!sp) return null;
    if (sp.left && sp.left.key === key)  return sp.left;
    if (sp.right && sp.right.key === key) return sp.right;
    return null;
  }

  function otherSide(sp, key) {
    if (!sp) return null;
    return (sp.left && sp.left.key === key) ? sp.right : sp.left;
  }

  function rowsOf(side) {
    if (!side) return [];
    const list = typeof side.items === 'function' ? side.items() : side.items;
    return Array.isArray(list) ? list.filter(Boolean) : [];
  }

  // A panel is full when it says how many rows it holds and holds that many.
  function isFull(side) {
    const max = Number(side && side.max);
    if (!Number.isFinite(max) || max <= 0) return false;
    return rowsOf(side).length >= max;
  }

  function toast(message, severity) {
    if (!message) return;
    if (window.ParchmentToast && window.ParchmentToast.show) {
      window.ParchmentToast.show(message, { severity: severity || 'warning', duration: 200 });
    }
  }

  function playOk()     { try { SoundManager.playOk(); }     catch (e) { /* no audio */ } }
  function playBuzzer() { try { SoundManager.playBuzzer(); } catch (e) { /* no audio */ } }

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------
  function register(sp) {
    if (!sp || !sp.id) return null;
    const id = String(sp.id);
    _specs.set(id, sp);
    return id;
  }

  function release(id) { _specs.delete(String(id)); }

  // -------------------------------------------------------------------------
  // Markup
  // -------------------------------------------------------------------------
  // The label on a row's own button: which way this row would go.
  function moveLabel(sp, fromKey) {
    const labels = sp.moveLabel || {};
    const toLeft = sp.right && sp.right.key === fromKey;
    const written = toLeft ? labels.toLeft : labels.toRight;
    if (written) return written;
    return T(toLeft ? 'TwoPanelPicker.moveLeft' : 'TwoPanelPicker.moveRight');
  }

  function rowHtml(sp, side, row) {
    const dest    = otherSide(sp, side.key);
    const count   = Number(row.count) || 0;
    const movable = row.movable !== false && !row.disabled && dest && !isFull(dest);
    const drag    = movable
      ? ` draggable="true"` +
        ` ondragstart="window.TwoPanelPicker.onDragStart(event, '${esc(sp.id)}', '${esc(side.key)}', '${esc(row.id)}')"` +
        ` ondragend="window.TwoPanelPicker.onDragEnd('${esc(sp.id)}')"`
      : '';
    const button = (label, all) => (movable
      ? `<div class="command-item focusable tpp-move" tabindex="0"` +
        ` onclick="window.TwoPanelPicker.move('${esc(sp.id)}', '${esc(side.key)}', '${esc(row.id)}', ${all ? 'true' : 'false'})">${esc(label)}</div>`
      : `<div class="command-item tpp-move is-disabled">${esc(label)}</div>`);
    const icon = Number.isFinite(Number(row.iconIndex)) && Number(row.iconIndex) > 0
      ? `<canvas class="tpp-icon" width="32" height="32" data-tpp-icon="${Number(row.iconIndex)}"></canvas>`
      : '';
    const stack = count > 1 ? `<span class="tpp-count">&times;${count}</span>` : '';
    const sub   = row.sub  ? `<span class="tpp-sub">${esc(row.sub)}</span>`   : '';
    const note  = row.note ? `<div class="tpp-note">${esc(row.note)}</div>`   : '';

    return `
      <div class="tpp-row focusable${row.disabled ? ' is-disabled' : ''}" tabindex="0"
           data-tpp-row="${esc(row.id)}" data-tpp-side="${esc(side.key)}"${drag}>
        ${icon}
        <div class="tpp-body">
          <div class="tpp-name">${esc(row.name)}${stack}${sub}</div>
          ${note}
        </div>
        <div class="tpp-actions">
          ${button(moveLabel(sp, side.key), false)}
          ${count > 1 ? button(T('TwoPanelPicker.moveAll'), true) : ''}
        </div>
      </div>`;
  }

  function panelHtml(sp, side) {
    if (!side) return '';
    const rows = rowsOf(side);
    const max  = Number(side.max);
    const head = Number.isFinite(max) && max > 0
      ? T('TwoPanelPicker.ofMax', { count: rows.length, max: max })
      : String(rows.length);
    const body = rows.length
      ? rows.map(row => rowHtml(sp, side, row)).join('')
      : `<div class="tpp-empty">${esc(side.empty || T('TwoPanelPicker.empty'))}</div>`;

    return `
      <div class="tpp-panel" data-tpp-panel="${esc(side.key)}">
        <div class="tpp-panel-head">
          <span class="tpp-panel-title">${esc(side.title || '')}</span>
          <span class="tpp-panel-count">${esc(head)}</span>
        </div>
        <div class="tpp-zone" data-tpp-zone="${esc(side.key)}"
             ondragover="window.TwoPanelPicker.onDragOver(event)"
             ondragleave="window.TwoPanelPicker.onDragLeave(event)"
             ondrop="window.TwoPanelPicker.onDrop(event, '${esc(sp.id)}', '${esc(side.key)}')">
          ${body}
        </div>
      </div>`;
  }

  function html(id) {
    const sp = spec(id);
    if (!sp) return '';
    const hint = sp.hint ? `<div class="tpp-hint">${esc(sp.hint)}</div>` : '';
    return `
      <div class="tpp-board" id="tpp-${esc(sp.id)}">
        ${sp.title ? `<h3 class="tpp-title">${esc(sp.title)}</h3>` : ''}
        <div class="tpp-panels">
          ${panelHtml(sp, sp.left)}
          ${panelHtml(sp, sp.right)}
        </div>
        ${hint}
      </div>`;
  }

  // The icons are drawn after the markup lands, the way every other DOM list
  // in the game draws them: one canvas per row, cut out of the IconSet sheet.
  function paintIcons(root) {
    const host = root || document;
    const canvases = host.querySelectorAll ? host.querySelectorAll('canvas[data-tpp-icon]') : [];
    if (!canvases.length) return;
    let sheet = null;
    try { sheet = ImageManager.loadSystem('IconSet'); } catch (e) { return; }
    if (!sheet) return;
    const paint = () => {
      canvases.forEach(canvas => {
        const index = Number(canvas.dataset.tppIcon) || 0;
        if (!index) return;
        const pw = ImageManager.iconWidth  || 32;
        const ph = ImageManager.iconHeight || 32;
        const sx = (index % 16) * pw;
        const sy = Math.floor(index / 16) * ph;
        const ctx = canvas.getContext('2d');
        if (!ctx || !sheet._canvas) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        try { ctx.drawImage(sheet._canvas, sx, sy, pw, ph, 0, 0, canvas.width, canvas.height); }
        catch (e) { /* sheet not ready */ }
      });
    };
    if (sheet.isReady && sheet.isReady()) paint();
    else if (sheet.addLoadListener) sheet.addLoadListener(paint);
  }

  // Called by the host once the markup is in the document.
  function mounted(host, id) {
    paintIcons(host || document);
    const sp = spec(id);
    if (sp && typeof sp.onMounted === 'function') sp.onMounted(host);
  }

  // -------------------------------------------------------------------------
  // Moving a row
  // -------------------------------------------------------------------------
  // One path for both routes: the button on the row and the drop into the other
  // panel end up here, so the two can never come to mean different things.
  function move(id, fromKey, rowId, all) {
    const sp   = spec(id);
    if (!sp) return false;
    const from = sideOf(sp, fromKey);
    const to   = otherSide(sp, fromKey);
    if (!from || !to) return false;

    const row = rowsOf(from).find(r => String(r.id) === String(rowId));
    if (!row || row.movable === false || row.disabled) { playBuzzer(); return false; }
    if (isFull(to)) {
      playBuzzer();
      toast(sp.fullMessage || T('TwoPanelPicker.full', { panel: to.title || '' }));
      return false;
    }

    const amount = all ? Math.max(1, Number(row.count) || 1) : 1;
    let result;
    try { result = sp.move(row.id, from.key, to.key, amount, row); }
    catch (err) { console.error(`[${PLUGIN_NAME}] move`, err); result = false; }

    const ok = result === true || (result && result.ok === true);
    if (!ok) {
      playBuzzer();
      const message = (result && (result.message || result.reason)) || sp.refusedMessage;
      if (message && result && result.message) toast(message);
      else if (message) toast(T('TwoPanelPicker.refused'));
      return false;
    }

    playOk();
    if (typeof sp.onChange === 'function') sp.onChange(row.id, from.key, to.key, amount);
    return true;
  }

  // -------------------------------------------------------------------------
  // Drag and drop
  // -------------------------------------------------------------------------
  let _drag = null;

  function onDragStart(event, id, sideKey, rowId) {
    _drag = { id: String(id), side: String(sideKey), row: String(rowId) };
    try { event.dataTransfer.setData('text/plain', `${sideKey}:${rowId}`); } catch (e) { /* not allowed */ }
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  function clearZones() {
    if (!document.querySelectorAll) return;
    document.querySelectorAll('.tpp-zone--over').forEach(el => el.classList.remove('tpp-zone--over'));
  }

  function onDragEnd() { _drag = null; clearZones(); }

  function onDragOver(event) {
    if (!_drag) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    const zone = event.currentTarget;
    if (zone && zone.classList) zone.classList.add('tpp-zone--over');
  }

  function onDragLeave(event) {
    const zone = event.currentTarget;
    if (zone && zone.classList) zone.classList.remove('tpp-zone--over');
  }

  function onDrop(event, id, sideKey) {
    if (event && event.preventDefault) event.preventDefault();
    const drag = _drag;
    onDragEnd();
    if (!drag || drag.id !== String(id)) return false;
    // Dropped back where it came from: nothing happened, and no buzzer for it.
    if (drag.side === String(sideKey)) return false;
    return move(id, drag.side, drag.row, false);
  }

  window.TwoPanelPicker = {
    register,
    release,
    spec,
    html,
    panelHtml: (id, key) => { const sp = spec(id); return sp ? panelHtml(sp, sideOf(sp, key)) : ''; },
    rows:      (id, key) => { const sp = spec(id); return rowsOf(sideOf(sp, key)); },
    isFull:    (id, key) => { const sp = spec(id); return isFull(sideOf(sp, key)); },
    mounted,
    paintIcons,
    move,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDragLeave,
    onDrop,
    // The drag in flight, for a host that wants to draw its own affordance.
    dragging: () => (_drag ? Object.assign({}, _drag) : null),
  };
})();
