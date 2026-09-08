/*:
 * @target MZ
 * @plugindesc Keyboard, WASD and controller navigation for every control on the character creation spread
 * @author Omni-Lex
 * @orderAfter CharacterCreationShared
 * @orderBefore CharacterCreation
 *
 * @help
 * ============================================================================
 * CCNav - the focus ring of character creation
 * ============================================================================
 *
 * The creation spread is drawn as DOM, and for a long time only the boards it
 * puts cards on could be walked without a mouse: the card grid and the tab
 * rails are backed by RMMZ windows, so the arrow keys reached them. Everything
 * else on the page - the Randomize buttons, the bio chips, the +/- on the
 * talent board, the bust and sprite portraits, the chips that drop a picked
 * trait - could only be clicked. This plugin is the missing half.
 *
 * Two layers, one seam
 * --------------------
 * BOARD    the card grid, the preset dossiers, the tab rails and the settings
 *          rows. Backed by a Window_Selectable, walked the way they always
 *          were. CCNav never touches them.
 * CONTROLS every other interactive element inside the overlay. CCNav collects
 *          them off the live DOM, sorts them into reading order, and moves a
 *          focus ring between them.
 *
 * The seam is a direction: pressing right (or down) on the board when it has
 * nowhere left to go steps into the controls layer at the nearest control that
 * way; pressing left/up off the first control, or Cancel anywhere in the
 * layer, steps back onto the board. A page with no board at all (the scenario
 * dossier, the preset preview) hands the controls layer the whole page.
 *
 * What counts as a control
 * ------------------------
 * Anything the page made clickable: an element carrying onclick, a <button>,
 * an <input>/<select>, anything tagged .focusable (the project-wide mark for a
 * plain div a click listener was hung on), or anything explicitly marked
 * data-nav. It has to be on screen, not disabled, and not marked data-nav-skip.
 * Nothing has to be annotated for this to work - a control is reachable the
 * moment it is clickable, which is the property the reachability test enforces.
 *
 * Who else wears it
 * -----------------
 * The ring started here and is no longer creation's alone: any scene that
 * draws a DOM overlay with no card board of its own can attach it and get the
 * arrows, WASD and the stick for nothing. The vehicle maintenance bay
 * (Vehicle/VehicleSystemRepair.js), the trading terminal opened outside the
 * hyperdeck (Economy/StockMarketSystem.js) and the ideology chart
 * (UI/3DPoliticalGraph.js) do exactly that; test/test_ui_reachability.js is
 * what keeps them honest.
 *
 * Because the spread rebuilds its markup constantly, the focus is remembered
 * as a KEY (the element's data-nav-key, its click handler, or what it is for -
 * id, field name, placeholder, data attributes, label) rather than as an
 * element, plus which control of that name it was when a page draws several
 * alike. A rebuild that produces the same page puts the ring back exactly
 * where it was.
 *
 * Input
 * -----
 * Directions come from RMMZ's own Input, which already carries the arrow keys,
 * the d-pad and (through Core/AnalogStickInput) the left stick. WASD is mapped
 * onto the same four directions; if no other plugin has claimed those keys by
 * the time a creation scene opens, CCNav maps them itself.
 *
 * The rails above and beside the boards - the wizard's top rail, the tabs of
 * the sprite and bust grids, the trait categories, the looks of a dossier -
 * all turn on the same four inputs, and CCNav.railDir() is the one place that
 * reads them: L1/PageUp back, R1/PageDown forward, Tab forward, Shift+Tab
 * back. Scrolling long text is CCScroll's half of the same story (the wheel,
 * and L2/R2 on a pad); see CharacterCreationShared.js.
 *
 * Wiring a scene
 * --------------
 *   CCNav.attach(this, container)   once the overlay exists
 *   CCNav.update()                  first thing in the scene's input handler;
 *                                   returns true when it took the press
 *   CCNav.paint()                   after the markup is rebuilt, to put the
 *                                   ring back
 *   CCNav.detach(this)              on terminate
 *
 * DO NOT call this plugin directly from an event.
 */

(() => {
  "use strict";

  // Elements the page made clickable. The list is deliberately about behaviour
  // rather than about class names: a control earns a focus ring by being
  // clickable, so no page can add a button and forget to register it.
  const CONTROL_SELECTOR = [
    "[data-nav]",
    "[onclick]",
    // The project-wide tag for a click-driven element that is neither a button
    // nor a link: a plain div a listener was hung on. The desktop's own ring
    // (Hypernet/HypernetOS.js) collects it, the menu navigators collect it, and
    // so does this one, so a page marked for one is reachable in all of them.
    ".focusable",
    "button",
    "input",
    "select",
    "textarea",
    "a[href]",
    '[tabindex]:not([tabindex="-1"])',
  ].join(",");

  // Controls a Window_Selectable already owns. They stay clickable, and the
  // board still walks them; CCNav skips them so one press never moves two
  // cursors.
  const BOARD_SELECTOR = [
    ".cc-card-option",
    ".cc-wanted-card",
    ".cc-pet-card",
    ".cc-sprite-card",
    ".cc-bust-card",
    ".cc-settings-row",
    ".cc-folder-tab",
    ".ts-tab",
    ".cc-spec-tab",
    ".cc-sprite-tab-btn",
    ".category-card",
    ".skill-card",
    ".companion-tab",
    ".sg3-label",
  ].join(",");

  // Rows on the same line of the page are within this many pixels of each
  // other's centre. Chips and buttons on one strip differ in height by a few
  // pixels, so an exact match would split a strip into several rows.
  const ROW_TOLERANCE = 14;

  const CCNav = {
    CONTROL_SELECTOR,
    BOARD_SELECTOR,
    ROW_TOLERANCE,

    _scene: null,
    _root: null,
    _boards: true,    // does this screen have a card board the ring must leave alone
    _key: null,       // the focused control, remembered across DOM rebuilds
    _keyNth: 0,       // which control of that name, when a page draws several
    _active: false,   // is the ring showing and eating input
    _wasdMapped: false,

    // ---------------------------------------------------------------- setup --

    // W A S D onto the four directions, but only if nothing else has claimed
    // them. HistorySimulatorUI maps them globally at load; a build without it
    // (or one where a scene remapped them and did not put them back) would
    // otherwise leave a keyboard player with only the arrow keys.
    //
    // RMMZ's own default map is not a claim: it ships W as "pagedown" and Q as
    // "pageup" (rmmz_core.js), a leftover of the RPG Maker 2000 layout that no
    // screen in this game reads. Leaving that in place would cost a keyboard
    // player the up key of the WASD square, so the stock mapping is overridden
    // and only a mapping some other plugin wrote is respected.
    ensureWasd() {
      if (typeof Input === "undefined" || !Input.keyMapper) return;
      const wanted = { 87: "up", 83: "down", 65: "left", 68: "right" };
      // What rmmz_core ships on those four keys, and so what counts as unclaimed.
      const stock = { 87: "pagedown" };
      for (const code of Object.keys(wanted)) {
        const held = Input.keyMapper[code];
        if (!held || held === stock[code]) Input.keyMapper[code] = wanted[code];
      }
      this._wasdMapped = true;
    },

    // ------------------------------------------------------------ tab rails --

    // Which way the shoulder buttons and the Tab key are asking a rail to
    // turn: -1 back, +1 forward, 0 for nothing this frame.
    //
    // Every rail in creation - the top rail of the wizard, the tabs of the
    // sprite and bust grids, the trait categories, the looks of a dossier -
    // turns on the same four inputs, so they are answered in one place:
    //
    //   L1 / PageUp / Q          back
    //   R1 / PageDown            forward
    //   Tab                      forward
    //   Shift + Tab              back
    //
    // Shift is read as a modifier here (it is held, not tapped), which is what
    // makes Shift+Tab the reverse of Tab rather than a press of its own.
    railDir() {
      if (typeof Input === "undefined") return 0;
      if (Input.isTriggered("pageup")) return -1;
      if (Input.isTriggered("pagedown")) return 1;
      if (Input.isTriggered("tab")) return Input.isPressed("shift") ? -1 : 1;
      return 0;
    },

    // opts.boards: false on a screen that has no Window_Selectable board of its
    // own. The board list below is a list of CREATION's card classes, and a
    // screen outside creation that happens to reuse one of those classes for
    // its look (the ideology chart wears the sprite rail's tab plate) would
    // otherwise have that control skipped by a cursor that does not exist.
    attach(scene, root, opts) {
      this.ensureWasd();
      this._scene = scene || null;
      this._root = root || null;
      this._boards = !opts || opts.boards !== false;
      this._key = null;
      this._keyNth = 0;
      this._active = false;
    },

    detach(scene) {
      if (scene && this._scene && scene !== this._scene) return;
      this.clearRing();
      this._scene = null;
      this._root = null;
      this._key = null;
      this._keyNth = 0;
      this._active = false;
    },

    isAttached() {
      return !!(this._root && this._root.querySelectorAll);
    },

    active() {
      return this._active && this.isAttached();
    },

    // -------------------------------------------------------------- targets --

    // Is this element one a player can actually put a cursor on right now?
    isReachable(el) {
      if (!el || el.nodeType !== 1) return false;
      if (el.disabled) return false;
      if (el.closest && el.closest("[data-nav-skip]")) return false;
      if (this._boards !== false && el.matches && el.matches(BOARD_SELECTOR)) return false;
      if (el.getAttribute && el.getAttribute("aria-hidden") === "true") return false;
      // A control that has been laid out has to be big enough to aim at. A box
      // of four zeros carries no layout information at all - the page has not
      // been laid out yet, or nothing is measuring it - so the markup is taken
      // at its word and whether it is actually on screen is left to
      // offsetParent below, which is the check that answers display:none.
      const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
      const measured = !!rect && (rect.top || rect.left || rect.right || rect.bottom ||
                                  rect.width || rect.height);
      if (measured && (rect.width < 2 || rect.height < 2)) return false;
      if (typeof el.offsetParent !== "undefined" && el.offsetParent === null &&
          el.style && el.style.position !== "fixed") return false;
      return true;
    },

    // Every control on the page, in reading order: top to bottom, then left to
    // right within a row. That is the order the ring walks with a single axis,
    // and the order a wrapped grid reads in.
    targets() {
      if (!this.isAttached()) return [];
      const all = Array.prototype.slice.call(this._root.querySelectorAll(CONTROL_SELECTOR));
      const list = all.filter((el) => this.isReachable(el));
      // Drop a control that only wraps another control: the inner one is what
      // a click lands on, so focusing the wrapper would ring the same thing
      // twice. Found by walking UP from each control and marking the controls
      // above it, which is one pass over the page: comparing every control
      // against every other one is the same answer, but the talent board draws
      // eight hundred steppers when the party has points to spend, and this
      // list is rebuilt on every press.
      const inList = new Set(list);
      const wrappers = new Set();
      for (const el of list) {
        for (let up = el.parentElement; up; up = up.parentElement) {
          if (inList.has(up)) wrappers.add(up);
        }
      }
      const kept = wrappers.size ? list.filter((el) => !wrappers.has(el)) : list;
      return kept
        .map((el, i) => ({ el, i, rect: this.rectOf(el) }))
        .sort((a, b) => {
          const dy = a.rect.top - b.rect.top;
          if (Math.abs(dy) > ROW_TOLERANCE) return dy;
          const dx = a.rect.left - b.rect.left;
          if (dx) return dx;
          return a.i - b.i;
        })
        .map((entry) => entry.el);
    },

    rectOf(el) {
      const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
      if (r && (r.width || r.height)) return r;
      // No layout engine (node harness): fall back to document order, which
      // keeps the sort stable instead of collapsing every control onto 0,0.
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
    },

    // A name for a control that survives the page being rebuilt around it. The
    // spread regenerates its markup on almost every frame, so an element
    // reference is worthless a moment after it is taken. What identifies "the
    // Randomize button on the bio page" across those rebuilds is what it does,
    // not how it looks.
    keyOf(el) {
      if (!el || !el.getAttribute) return null;
      const explicit = el.getAttribute("data-nav-key");
      if (explicit) return explicit;
      // The handler is the control's real name: it says which button this is
      // and it does not change when the button does. A class list would - the
      // page inks state into it (selected, active, disabled, and the ring's own
      // mark), so a control would be renamed by the very act of using it.
      const click = el.getAttribute("onclick");
      if (click) return "@" + click;
      // No inline handler: identify it by what it is FOR - its id, the field
      // name it posts under, the placeholder it prompts with, its data
      // attributes and its label. All of those say what the control is rather
      // than how it looks, and between them they tell two bare fields on the
      // same page apart (the name box and the class search were both simply
      // "INPUT" once, so the ring could never reach the second of them).
      const names = typeof el.getAttributeNames === "function" ? el.getAttributeNames() : [];
      const data = names.filter((n) => n.indexOf("data-") === 0 && n !== "data-nav-key")
        .sort().map((n) => n + "=" + el.getAttribute(n)).join(";");
      const named = ["id", "name", "placeholder", "type"]
        .map((n) => el.getAttribute(n)).filter(Boolean).join("/");
      const text = (el.textContent || "").trim().slice(0, 40);
      return (el.tagName || "") + "|" + named + "|" + data + "|" + text;
    },

    // Two controls really can answer to the same name - a row of identical
    // steppers, a strip of unlabelled swatches - so the ring remembers which
    // of them it was on as well as what it was called. Counted rather than
    // indexed, so a rebuild that adds a card above still lands on the same one.
    focused() {
      const list = this.targets();
      const index = this.focusedIndex(list);
      return index < 0 ? null : list[index];
    },

    // Where in the list the ring is: the _keyNth'th control called _key.
    rememberFocus(list, index) {
      this._key = this.keyOf(list[index]);
      let nth = 0;
      for (let i = 0; i < index; i++) if (this.keyOf(list[i]) === this._key) nth++;
      this._keyNth = nth;
    },

    // Walking the page is the expensive part, so a caller that already has the
    // list hands it over rather than making this one build it again.
    focusedIndex(list) {
      if (!this._key) return -1;
      const all = list || this.targets();
      let nth = 0;
      let first = -1;
      for (let i = 0; i < all.length; i++) {
        if (this.keyOf(all[i]) !== this._key) continue;
        if (first < 0) first = i;
        if (nth === (this._keyNth || 0)) return i;
        nth++;
      }
      // The page came back with fewer copies of this control than it had: the
      // first one that still answers to the name is the nearest thing to it.
      return first;
    },

    // ----------------------------------------------------------- focus ring --

    clearRing() {
      if (!this.isAttached()) return;
      const lit = this._root.querySelectorAll(".cc-nav-focus");
      for (let i = 0; i < lit.length; i++) lit[i].classList.remove("cc-nav-focus");
      this._painted = false;
    },

    // A modal has taken the page over: it reads the keyboard itself (Escape,
    // Enter, its own cursor), and the ring must not answer the same press by
    // clicking whatever is still lit behind it.
    modalUp() {
      if (!this.isAttached()) return false;
      return !!this._root.querySelector(".cc-modal-veil, [data-nav-modal]");
    },

    // A text field owns the keyboard while the caret is in it: the arrows move
    // the caret, they do not move a cursor.
    typing() {
      const el = typeof document !== "undefined" ? document.activeElement : null;
      if (!el || !el.tagName) return false;
      const tag = el.tagName.toUpperCase();
      return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable === true;
    },

    // Puts the ring back after the page has been redrawn under it. Cheap
    // enough to call every frame: it is one querySelectorAll and one class
    // swap when nothing moved.
    paint() {
      if (!this.isAttached()) return;
      // Nothing lit and nothing to light: the common case, once a frame, and
      // it must not cost a walk of the whole page.
      if (!this._active) { if (this._painted) this.clearRing(); return; }
      this.clearRing();
      const el = this.focused();
      if (!el) { this._active = false; return; }
      el.classList.add("cc-nav-focus");
      this._painted = true;
      this.scrollIntoView(el);
    },

    // Nudge the pane holding the focused control so the ring is on screen.
    // Uses CCScroll's own idea of what a scrollable pane is, so the two agree
    // about which element the triggers would have scrolled.
    scrollIntoView(el) {
      const scroll = window.CCScroll;
      if (!scroll || !scroll.regionAt || !el.getBoundingClientRect) return;
      const pane = scroll.regionAt(el, this._root);
      if (!pane || !pane.getBoundingClientRect) return;
      const r = el.getBoundingClientRect();
      const p = pane.getBoundingClientRect();
      if (r.top < p.top) pane.scrollTop -= (p.top - r.top) + 8;
      else if (r.bottom > p.bottom) pane.scrollTop += (r.bottom - p.bottom) + 8;
    },

    // ------------------------------------------------------------ movement --

    enter(fromDir) {
      const list = this.targets();
      if (!list.length) return false;
      // Coming off the board from the right edge lands on the leftmost control
      // of the topmost row; coming off the bottom lands on the first control
      // below the board. Either way the first entry of reading order is the
      // one closest to where the cursor was.
      this.rememberFocus(list, fromDir === "up" ? list.length - 1 : 0);
      this._active = true;
      this.paint();
      return true;
    },

    leave(playSound) {
      if (!this._active) return false;
      this._active = false;
      this._key = null;
      this._keyNth = 0;
      this.clearRing();
      if (playSound && typeof SoundManager !== "undefined") SoundManager.playCancel();
      const scene = this._scene;
      if (scene && typeof scene.onNavLeave === "function") scene.onNavLeave();
      return true;
    },

    move(dir) {
      const list = this.targets();
      if (!list.length) return false;
      const index = this.focusedIndex(list);
      if (index < 0) return this.enter(dir);

      const next = this.neighbour(list, index, dir);
      if (next < 0) return false;
      if (next === index) return false;
      this.rememberFocus(list, next);
      if (typeof SoundManager !== "undefined") SoundManager.playCursor();
      this.paint();
      return true;
    },

    // Spatial neighbour when the page has a layout to consult, reading order
    // when it does not. Left/right stay on the row while the row has more on
    // it, so a strip of chips walks chip by chip; up/down cross to the nearest
    // control on the row above or below, keeping the column.
    neighbour(list, index, dir) {
      const rects = list.map((el) => this.rectOf(el));
      const laidOut = rects.some((r) => r.width > 0 || r.height > 0);
      if (!laidOut) {
        const step = (dir === "down" || dir === "right") ? 1 : -1;
        const next = index + step;
        return (next < 0 || next >= list.length) ? -1 : next;
      }

      const here = rects[index];
      const sameRow = (r) => Math.abs(r.top - here.top) <= ROW_TOLERANCE;

      if (dir === "left" || dir === "right") {
        const forward = dir === "right";
        let best = -1;
        for (let i = 0; i < list.length; i++) {
          if (i === index || !sameRow(rects[i])) continue;
          const ahead = forward ? rects[i].left > here.left : rects[i].left < here.left;
          if (!ahead) continue;
          if (best < 0) { best = i; continue; }
          const closer = forward
            ? rects[i].left < rects[best].left
            : rects[i].left > rects[best].left;
          if (closer) best = i;
        }
        // Nothing else on this row: carry on to the next row's near edge, so a
        // single axis still reaches every control on the page.
        if (best < 0) {
          const step = forward ? 1 : -1;
          const next = index + step;
          return (next < 0 || next >= list.length) ? -1 : next;
        }
        return best;
      }

      const down = dir === "down";
      let best = -1;
      let bestScore = Infinity;
      for (let i = 0; i < list.length; i++) {
        if (i === index || sameRow(rects[i])) continue;
        const beyond = down ? rects[i].top > here.top : rects[i].top < here.top;
        if (!beyond) continue;
        const rowGap = Math.abs(rects[i].top - here.top);
        const colGap = Math.abs(rects[i].left - here.left);
        const score = rowGap * 4 + colGap;
        if (score < bestScore) { bestScore = score; best = i; }
      }
      return best;
    },

    // The focused control, clicked. Everything on the spread is wired through
    // its own onclick, so a synthesised click is exactly what the mouse does.
    confirm() {
      const el = this.focused();
      if (!el) return false;
      if (typeof el.click === "function") el.click();
      else if (el.onclick) el.onclick({ stopPropagation() {}, preventDefault() {} });
      // Acting on a control usually redraws the page under the ring.
      this.paint();
      return true;
    },

    // -------------------------------------------------------------- update --

    // Read once a frame, before the page's own cursor. Returns true when the
    // press belonged to the controls layer.
    update() {
      if (!this.isAttached()) return false;
      if (!this._active) return false;
      if (typeof Input === "undefined") return false;
      // A modal or a caret owns the keyboard; the ring waits its turn rather
      // than answering the same press twice.
      if (this.modalUp() || this.typing()) return false;

      const pressed = (dir) => Input.isTriggered(dir) || Input.isRepeated(dir);

      if (Input.isTriggered("cancel") ||
          (typeof TouchInput !== "undefined" && TouchInput.isCancelled())) {
        this.leave(true);
        return true;
      }
      if (Input.isTriggered("ok")) {
        this.confirm();
        return true;
      }
      for (const dir of ["up", "down", "left", "right"]) {
        if (!pressed(dir)) continue;
        if (this.move(dir)) return true;
        // Off the top or the left of the layer: back to the board the page
        // was walking before, so the two layers are one loop and not a trap.
        if (dir === "up" || dir === "left") {
          this.leave(false);
          if (typeof SoundManager !== "undefined") SoundManager.playCursor();
          return true;
        }
        return true;
      }
      return false;
    },

    // Called by a scene's own cursor when it has run out of board to walk.
    // Returns true when the controls layer took over.
    tryEnterFromBoard(dir) {
      if (!this.isAttached() || this._active) return false;
      if (this.modalUp() || this.typing()) return false;
      if (!this.targets().length) return false;
      if (typeof SoundManager !== "undefined") SoundManager.playCursor();
      return this.enter(dir);
    },
  };

  window.CCNav = CCNav;
})();
