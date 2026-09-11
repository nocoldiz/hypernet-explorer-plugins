//=============================================================================
// VectorGunSystemUI.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc The vector gun's screen: the modes as a grid of cards, the gun in 3D
 * @author Assistant
 * @requires VectorGunSystem.js
 *
 * @help
 * Scene_VectorGun, the screen the main menu opens in story mode.
 *
 * The shared kit and nothing of its own: one .book-spread, a .page-header-bar
 * carrying the one .back-button, a .backpack-tabs strip of TWO pages, and a
 * .backpack-grid of .item-slot cards on the left page, written exactly as the
 * skills menu writes a skill (a stripe, an icon, a name, a cost or a state).
 * The right page is the gun on the shared 3D viewer (window.Weapon3DPreview)
 * with the card for the row under the cursor beneath it, and the three bays the
 * gun is running along the bottom.
 *
 * The two pages:
 *   modes  - the twenty odd operating modes, three across
 *   form   - the shapes the gun folds into AND the element it carries, one
 *            page because both are "what the weapon is" rather than what it
 *            is running
 *
 * The grid is the control: every card is a button. Confirming a mode LOADS it
 * into the first free bay of the three the gun runs, and with all three taken
 * it pushes out the oldest (VectorGun.fitMode) rather than refusing. Confirming
 * a mode that is already running unloads it.
 *
 * Up / Down walk the grid a row at a time, Left / Right a card at a time, L1 /
 * R1 turn the pages, Confirm works the card under the cursor and Cancel leaves.
 *
 * Must be placed AFTER VectorGunSystem.js in the plugin list.
 */

(() => {
  'use strict';

  if (!window.VectorGun) throw new Error('VectorGunSystemUI.js requires VectorGunSystem.js!');

  const VG = window.VectorGun;
  const MODE_KEYS = VG.MODE_KEYS;
  const MAX_MODES = VG.MAX_MODES;
  const modes = VG.modes;
  const elementId = VG.elementId;
  const setElement = VG.setElement;
  const ELEMENT_IDS = VG.ELEMENT_IDS;
  const FORM_CHOICES = VG.FORM_CHOICES;
  const GUN_FORM = VG.GUN_FORM;

  // How long the cursor must rest before the stand is rebuilt. Every step on
  // the form page tears a WebGL model down and builds another, and a pad's key
  // repeat asks for that several times a second: holding a direction used to
  // walk the page one stuttering card at a time.
  const STAND_SETTLE = 140;

  // The shapes and the element are one page: both answer "what is this weapon",
  // where the modes answer "what is it doing".
  const TABS = ['modes', 'form'];
  // How many cards a line of the grid holds. Must match .vg-grid's
  // grid-template-columns in css/theme.css, the way every other grid scene
  // keeps its own COLS in step with the sheet.
  const COLS = 3;

  // How far back the stand's camera rests before the piece has been measured.
  // Once the model exists the distance is measured off its own bounds
  // (_fitZoom) so every shape fills the stand.
  const STAND_ZOOM = 2.05;
  // How much of the stand is left empty around the piece once it is fitted.
  const STAND_MARGIN = 0.94;
  // How close the stand comes while the piece is folding itself into the other
  // shape: the morph is the thing being watched, so it is watched from near.
  const MORPH_ZOOM = 1.35;
  // The stand holds one of two things: the pistol, or "the other shape",
  // whichever one the cursor is on.
  const ALT_STAND = 'alt';

  /** The bank a row's words come from: the shapes have one of their own. */
  const shapeText = (key, part) => T('VectorGun.shape.' + key + '.' + part);

  // The IconSet face each card wears. Skills carry their own iconIndex; the
  // modes and the elements do not exist in the database at all, so the two
  // tables below are the only place their faces are named. The element table is
  // the game's own (UI/CustomSceneStatus.js), indexed by element id.
  const ELEMENT_ICONS = [0, 96, 64, 65, 66, 67, 68, 69, 70, 71];
  const MODE_ICONS = {
    mana: 245,          // Blue Orb: the round that is thought
    psi: 244,           // Green Orb: the round that is aimed by the mind
    recoil: 425,        // Skill Card: Impact
    spellblaster: 420,  // Skill Card: Magic
    card: 129,          // Divine Shield: the ward it prints
    wide: 427,          // Skill Card: Shot
    burst: 417,         // Skill Card: Strike
    pierce: 422,        // Skill Card: Pierce
    drain: 421,         // Skill Card: Dark
    siphon: 242,        // Red Orb
    deadeye: 423,       // Skill Card: Bolt
    tracker: 14,        // Locked on
    overload: 419,      // Skill Card: Flame
    hex: 418,           // Skill Card: Smoke
    longshot: 416,      // Skill Card: Slash
    // The loaded rounds wear the face of what they leave behind.
    venom: 177,         // Poison
    concussion: 444,    // Skill Card: Earth I
    thermalOverload: 64,   // Fire
    thermalUnderload: 65,  // Ice
    executioner: 126,   // Skull Shield
    ambush: 459,        // Skill Card: Dark I
    resonance: 456,     // Skill Card: Radiance I
    overpressure: 218,  // Bomb
    hollowPoint: 76,    // Fire Slash: what a critical opens
    deepMagazine: 445,  // Skill Card: Earth II
  };

  // The shapes wear the face of the weapon type they are, so the page reads as
  // a rack of weapons rather than a list of words.
  const SHAPE_ICONS = {
    gun: 115,           // SMG: the pistol's own face, off the weapon row
    sniper: 116,        // Gatling Gun: the long shape it racks out into
    abrasax: 326,       // Dagger
    thelema: 119,       // Flaming Sword
    choronzon: 109,     // Flaming Mace
    babalon: 351,       // Dragon Axe
    nuit: 353,          // Frost Whip
    hadit: 356,         // Staff
    aiwass: 370,        // Bow
    zos: 252,           // Rope Dart
    baphomet: 292,      // Claw
    kia: 143,           // Gauntlets of Might
    longinus: 381,      // Fire Lance
    solomon: 187,       // Book: the grimoire that is read instead of swung
  };

  // The stripe down the left edge of a card, the one thing that says at a
  // glance whether the card is doing anything. Gold when it is fitted, the
  // element's own colour on the element cards, nothing at all otherwise.
  const STRIPE_ON = 'var(--text-primary, #f0c674)';
  const STRIPE_OFF = 'transparent';
  const ELEMENT_COLORS = [
    '', '#c9c2b4', '#e2703a', '#7ec8e3', '#e8d04a', '#4a90d9',
    '#a9814f', '#8fd18c', '#f2e6b0', '#8c6bb1',
  ];

  const esc = (text) => String(text == null ? '' : text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  /** One IconSet cell, drawn the way every other menu draws one. */
  function iconHTML(index) {
    const i = Number(index) || 0;
    if (i <= 0) return '<span class="item-slot-icon vg-icon"></span>';
    return `<span class="item-slot-icon vg-icon" style="background:url('img/system/IconSet.png') ` +
      `-${(i % 16) * 32}px -${Math.floor(i / 16) * 32}px no-repeat;"></span>`;
  }

  /** A bank line, or nothing at all when a language has not been given one. */
  function line(key) {
    const text = T(key);
    return (!text || text === key) ? '' : text;
  }

  // The element roll the whole game reads (the bestiary's bank first, the
  // database's own list when a language has not been given one).
  function elementName(id) {
    const bank = (window.T && window.T.list) ? window.T.list('Bestiary.elements') : [];
    const source = bank.length > 1 ? bank : (($dataSystem && $dataSystem.elements) || []);
    return source[id] || '';
  }

  //--------------------------------------------------------------------------
  // Scene_VectorGun
  //--------------------------------------------------------------------------

  class Scene_VectorGun extends Scene_MenuBase {
    create() {
      super.create();
      this._tab = 'modes';
      this._index = 0;
      this._previews = [];
      this._previewKey = '';
      // Which of the gun's two shapes is standing on the bench. The screen
      // shows ONE piece: the other is reached with SWITCH, the same fold the
      // battle command plays.
      this._stand = GUN_FORM;
      this._switching = false;
      this._standTimer = 0;
      // The overlay is the shared one every screen the main menu opens uses
      // (#menu-container, UI/CustomMainMenuLayout.js createUIMenuDOM).
      this._el = document.createElement('div');
      this._el.id = 'menu-container';
      this._el.classList.add('menu-entering');
      document.body.appendChild(this._el);

      // A right click anywhere on the overlay is a cancel: the DOM layer sits
      // over the game canvas, so TouchInput never hears the button. The 3D
      // viewer keeps its own right drag, so the weapon is excluded.
      this._el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (e.target.closest('.vg-canvas')) return;
        this._closeRequested = true;
      });

      // RPG Maker preventDefaults wheel on the document, which kills native
      // scrolling inside a DOM overlay: scroll the region under the pointer
      // ourselves. The viewer's own canvas keeps the wheel for its zoom.
      this._el.addEventListener('wheel', (e) => {
        if (e.target && e.target.tagName === 'CANVAS') return;
        const box = e.target.closest('.vg-grid, .vg-detail, .ui-detail-scroll');
        if (box) box.scrollTop += e.deltaY;
        e.stopPropagation();
        e.preventDefault();
      }, { passive: false });

      this._buildShell();
      this._paint();
      setTimeout(() => {
        if (!this._el) return;
        this._el.classList.remove('menu-entering');
        this._el.classList.add('menu-shown');
      }, 16);
    }

    terminate() {
      if (this._zoomTimer) clearInterval(this._zoomTimer);
      this._zoomTimer = 0;
      if (this._standTimer) clearTimeout(this._standTimer);
      this._standTimer = 0;
      this._disposePreview();
      if (this._el && this._el.parentNode) this._el.parentNode.removeChild(this._el);
      this._el = null;
      super.terminate();
    }

    //------------------------------------------------------------------------
    // What the open page holds
    //------------------------------------------------------------------------

    /**
     * The cards of the open page, ALWAYS in the order their names read in: a
     * reader looks a name up alphabetically, not by whatever order the table
     * happens to declare. Every entry is one of four kinds, so the form page
     * can hold both the shapes and the element without either half guessing
     * what the other is.
     *
     * A `head` entry is a heading spanning the whole grid line and is never
     * landed on by the cursor.
     */
    rows() {
      const byName = (list, name) => list.slice().sort(
        (a, b) => String(name(a)).localeCompare(String(name(b))));
      if (this._tab === 'modes') {
        return byName(MODE_KEYS, (key) => T('VectorGun.mode.' + key + '.name'))
          .map((key) => ({ kind: 'mode', key: key }));
      }
      return [{ kind: 'head', text: T('VectorGun.section.forms') }]
        .concat(byName(FORM_CHOICES, (key) => shapeText(key, 'name'))
          .map((key) => ({ kind: 'form', key: key })))
        .concat([{ kind: 'head', text: T('VectorGun.section.elements') }])
        .concat(byName(ELEMENT_IDS, elementName)
          .map((id) => ({ kind: 'element', id: id })));
    }

    /** The cards a cursor can actually land on, in grid order. */
    pickable() {
      return this.rows().filter((row) => row.kind !== 'head');
    }

    current() {
      return this.pickable()[this._index];
    }

    //------------------------------------------------------------------------
    // The stand
    //------------------------------------------------------------------------

    /**
     * The shape drawn on the stand beside the pistol: whatever shape the cursor
     * is on while the form page is open, and the fitted one everywhere else.
     */
    shownShape() {
      const row = this._tab === 'form' ? this.current() : null;
      if (row && row.kind === 'form') {
        return row.key === GUN_FORM ? VG.SNIPER_FORM : row.key;
      }
      const fitted = VG.fittedForm();
      return fitted === GUN_FORM ? VG.SNIPER_FORM : fitted;
    }

    /** The shape actually on the stand right now. */
    standShape() {
      return this._stand === GUN_FORM ? GUN_FORM : this.shownShape();
    }

    /**
     * The shape the stand should be holding for the page that is open: a shape
     * card is the one place the other shape is being chosen, so that is the one
     * place the gun stands as it.
     */
    standTarget() {
      const row = this._tab === 'form' ? this.current() : null;
      return (row && row.kind === 'form') ? ALT_STAND : GUN_FORM;
    }

    /** Brings the stand to whatever the cursor asks for. */
    _syncStand() {
      // A fold already running owns the stand: cutting a new model in halfway
      // through leaves the piece standing as the shape the cursor has left.
      // morphStand asks again once it has finished.
      if (this._switching) return;
      const want = this.standTarget();
      if (want !== this._stand) this.morphStand(want);
      else this._mountPreview();
    }

    /**
     * The stand follows the cursor only once the cursor has come to rest. A
     * held direction repeats every few frames and each step would otherwise
     * dispose a WebGL model and build the next one.
     */
    _queueStand() {
      if (this._standTimer) clearTimeout(this._standTimer);
      this._standTimer = setTimeout(() => {
        this._standTimer = 0;
        if (this._el) this._syncStand();
      }, STAND_SETTLE);
    }

    /**
     * Folds the piece on the bench into `form` and raises it again, exactly as
     * it does in a battler's hand (VectorGun.playSwitchOn). Nothing is fitted
     * by it: it is the screen looking at the other half of the same weapon.
     */
    morphStand(form) {
      if (this._switching || !this._el || this._stand === form) return;
      this._switching = true;
      const entry = this._previews[0];
      const fold = VG.playSwitchOn(entry ? entry.model : null, 'fold') || 0;
      this._zoomStand(MORPH_ZOOM, fold);
      setTimeout(() => {
        if (!this._el) { this._switching = false; return; }
        this._stand = form;
        this._mountPreview(true);
        const rise = VG.playSwitchOn(
          this._previews[0] ? this._previews[0].model : null, 'rise') || 0;
        this._switching = false;
        // The cursor may have walked off this shape while it was folding: the
        // request that was refused mid-morph is served now.
        if (this.standTarget() !== this._stand) { this._syncStand(); return; }
        // The new shape is measured only once it has finished rising: while its
        // parts are still flying in the bounds are the whole flight.
        setTimeout(() => { if (this._el) this._fitStand(280); }, rise + 60);
      }, fold);
    }

    //------------------------------------------------------------------------
    // The cursor
    //------------------------------------------------------------------------

    update() {
      super.update();
      if (Input.isTriggered('cancel') || Input.isTriggered('escape') ||
          TouchInput.isCancelled() || this._closeRequested) {
        SoundManager.playCancel();
        this.popScene();
        return;
      }
      if (Input.isTriggered('pageup') || Input.isTriggered('pagedown')) {
        this.turnTab(Input.isTriggered('pageup') ? -1 : 1);
        return;
      }
      const last = this.pickable().length - 1;
      if (last < 0) return;
      // Confirm is read BEFORE the directions and not as the tail of their
      // chain: a stick held off centre repeats a direction every few frames,
      // and the chain swallowed every press of OK made while it was held.
      if (Input.isTriggered('ok')) { this.confirmRow(this._index); return; }
      // The page is a grid: up and down step a whole line, left and right one
      // card. The pages are turned with L1 / R1 and the tab strip only.
      if (Input.isRepeated('down')) this.moveLine(1);
      else if (Input.isRepeated('up')) this.moveLine(-1);
      else if (Input.isRepeated('right')) this.moveCursor(1);
      else if (Input.isRepeated('left')) this.moveCursor(-1);
    }

    /**
     * The page as the eye sees it: one entry per line of the grid, holding the
     * cursor indices of the cards standing on that line. A heading spans the
     * whole line (.vg-grid-head is grid-column 1 / -1), so it BREAKS the run:
     * the cards after it start a fresh line, and a section that does not fill
     * its last line leaves it short. Stepping `_index` by COLS knew about
     * neither, which sent Down diagonally down the form page.
     */
    lines() {
      const out = [];
      let line = null;
      let pick = -1;
      this.rows().forEach((row) => {
        if (row.kind === 'head') { line = null; return; }
        pick++;
        if (!line || line.length >= COLS) { line = []; out.push(line); }
        line.push(pick);
      });
      return out;
    }

    /** Walks one line of the real grid, keeping the column it was standing in. */
    moveLine(dir) {
      const lines = this.lines();
      let at = -1;
      let col = 0;
      for (let i = 0; i < lines.length; i++) {
        const found = lines[i].indexOf(this._index);
        if (found >= 0) { at = i; col = found; break; }
      }
      if (at < 0) return;
      const next = lines[at + dir];
      if (next) {
        // A short line is still landed on, at its last card.
        this.setIndex(next[Math.min(col, next.length - 1)]);
        return;
      }
      // Off the top or the bottom the cursor goes to the nearest end rather
      // than sitting still, so a last line of one card is always reachable.
      const edge = dir > 0 ? lines[lines.length - 1] : lines[0];
      this.setIndex(dir > 0 ? edge[edge.length - 1] : edge[0]);
    }

    moveCursor(step) {
      const last = this.pickable().length - 1;
      this.setIndex(Math.max(0, Math.min(last, this._index + step)));
    }

    /** Puts the cursor on a card, once, with the one sound and the one repaint. */
    setIndex(next) {
      if (typeof next !== 'number' || next === this._index) return;
      this._index = next;
      SoundManager.playCursor();
      this._paintSelection();
    }

    /**
     * Works the card under the cursor: a mode is loaded into a bay (pushing the
     * oldest out when all three are taken) or unloaded, a shape or an element is
     * fitted.
     */
    confirmRow(index) {
      this._index = index;
      const row = this.current();
      if (!row) return;
      if (row.kind === 'mode') this._fit(row.key);
      else if (row.kind === 'form') {
        VG.setForm(row.key);
        SoundManager.playOk();
        this._toast(T('VectorGun.toast.form', { form: shapeText(row.key, 'name') }), 'vgform');
      } else if (row.kind === 'element') {
        setElement(row.id);
        SoundManager.playOk();
        this._toast(T('VectorGun.toast.element', { element: elementName(row.id) }), 'vgelement');
      }
      this._paint();
    }

    _fit(key) {
      const result = VG.fitMode(key);
      SoundManager.playOk();
      const name = T('VectorGun.mode.' + key + '.name');
      if (result.state === 'off') {
        this._toast(T('VectorGun.toast.removed', { mode: name }), 'vgmode');
      } else if (result.replaced) {
        this._toast(T('VectorGun.toast.swapped', {
          mode: name, old: T('VectorGun.mode.' + result.replaced + '.name'),
        }), 'vgmode');
      } else {
        this._toast(T('VectorGun.toast.fitted', { mode: name }), 'vgmode');
      }
    }

    turnTab(step) {
      const tab = typeof step === 'string'
        ? step
        : TABS[(TABS.indexOf(this._tab) + step + TABS.length) % TABS.length];
      if (TABS.indexOf(tab) < 0 || this._tab === tab) return;
      this._tab = tab;
      this._index = 0;
      SoundManager.playCursor();
      this._paint();
      this._syncStand();
    }

    //------------------------------------------------------------------------
    // The stand's camera
    //------------------------------------------------------------------------

    /**
     * The distance at which the piece on the stand exactly fills the viewport,
     * measured off the model's own bounds against the camera's frustum in both
     * axes. Falls back to STAND_ZOOM while the model is still being built.
     */
    _fitZoom() {
      const entry = this._previews[0];
      const model = entry && entry.model;
      const camera = entry && entry.camera;
      if (!model || !camera || !window.THREE) return STAND_ZOOM;
      const box = new THREE.Box3().setFromObject(model);
      if (box.isEmpty()) return STAND_ZOOM;
      const size = box.getSize(new THREE.Vector3());
      // The piece turns on the stand, so the depth counts as width too.
      const half = Math.max(size.x, size.z) / 2;
      const tan = Math.tan((camera.fov * Math.PI / 180) / 2);
      const need = Math.max(half / (tan * (camera.aspect || 1)), (size.y / 2) / tan);
      return Math.max(0.6, Math.min(5, need * STAND_MARGIN));
    }

    /**
     * Settles the stand at its fitted distance. The model is built inside the
     * viewer's own animation loop, so the first frames after a mount have
     * nothing to measure: the fit is retried for a few frames.
     */
    _fitStand(ms, tries) {
      const left = tries === undefined ? 20 : tries;
      const entry = this._previews[0];
      if ((!entry || !entry.model) && left > 0) {
        requestAnimationFrame(() => {
          if (this._el) this._fitStand(ms, left - 1);
        });
        return;
      }
      this._zoomStand(this._fitZoom(), ms);
    }

    /** Walks the stand's camera to `z` over `ms`. */
    _zoomStand(z, ms) {
      const entry = this._previews[0];
      const camera = entry && entry.camera;
      if (!camera) return;
      if (this._zoomTimer) clearInterval(this._zoomTimer);
      if (ms <= 0) { camera.position.z = z; return; }
      const from = camera.position.z;
      const started = performance.now();
      this._zoomTimer = setInterval(() => {
        const cam = this._previews[0] && this._previews[0].camera;
        if (!this._el || !cam) { clearInterval(this._zoomTimer); this._zoomTimer = 0; return; }
        const t = Math.min(1, (performance.now() - started) / ms);
        cam.position.z = from + (z - from) * (t * (2 - t));
        if (t >= 1) { clearInterval(this._zoomTimer); this._zoomTimer = 0; }
      }, 16);
    }

    _toast(text, key) {
      if (window.ParchmentToast) window.ParchmentToast.show(text, { key: key });
    }

    //------------------------------------------------------------------------
    // The page
    //------------------------------------------------------------------------
    // The shell is drawn ONCE. The 3D viewer holds a WebGL context of its own
    // and an animation loop with it, so rewriting the whole spread on a cursor
    // step would tear the gun down and build it again several times a second:
    // only the grid, the status strip and the detail card are repainted.

    _buildShell() {
      // The gun is turned on the ground the party is standing on, the same
      // battleground the equip screen's bench stands on.
      const groundImg = (typeof window.getMapBattlebackImage === 'function')
        ? window.getMapBattlebackImage() : null;
      const groundStyle = groundImg
        ? ` style="background-image:url('${String(groundImg).replace(/['"]/g, '')}');"` : '';

      const tabsHTML = TABS.map((tab) => `
        <div class="backpack-tab focusable" data-tab="${tab}"
             onclick="SceneManager._scene.turnTab('${tab}')">${esc(T('VectorGun.tab.' + tab))}</div>`).join('');

      this._el.innerHTML = `
        <div class="book-spread vg-book">
          <div class="left-page">
            <div class="page-header-bar">
              <div class="back-button focusable" onclick="SceneManager._scene.popScene()">${esc(T('VectorGun.back'))}</div>
              <h2 class="title">${esc(T('VectorGun.title'))}</h2>
            </div>
            <div class="backpack-tabs vg-tabs">${tabsHTML}</div>
            <div class="vg-status"></div>
            <div class="backpack-grid vg-grid"></div>
          </div>
          <div class="right-page vg-page">
            <div class="vg-stage weapon-previews-container">
              <div class="weapon-preview-card"${groundStyle}>
                <canvas class="vg-canvas"></canvas>
                <span class="vg-preview-label"></span>
              </div>
            </div>
            <div class="vg-detail ui-detail"></div>
            <div class="vg-bays"></div>
          </div>
        </div>`;
    }

    _paint() {
      if (!this._el) return;
      const last = this.pickable().length - 1;
      if (this._index > last) this._index = Math.max(0, last);

      this._el.querySelectorAll('.backpack-tab').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.tab === this._tab);
      });
      this._el.querySelector('.vg-grid').innerHTML = this._gridHTML();
      this._el.querySelector('.vg-status').innerHTML = this._statusHTML();
      this._el.querySelector('.vg-bays').innerHTML = this._baysHTML();
      this._el.querySelector('.vg-detail').innerHTML = this._detailHTML();
      this._scrollToSelection();
      this._mountPreview();
    }

    /**
     * Walking the grid moves a class and rewrites the detail card. Rebuilding
     * the spread for a cursor step is what made the screen flicker.
     */
    _paintSelection() {
      if (!this._el) return;
      this._el.querySelectorAll('.vg-grid .item-slot')
        .forEach((slot, i) => slot.classList.toggle('selected', i === this._index));
      this._el.querySelector('.vg-detail').innerHTML = this._detailHTML();
      this._scrollToSelection();
      if (this._tab === 'form') this._queueStand();
    }

    _scrollToSelection() {
      const box = this._el ? this._el.querySelector('.vg-grid') : null;
      const selected = box ? box.querySelector('.item-slot.selected') : null;
      if (!box || !selected || !selected.getBoundingClientRect) return;
      // Scrolled by hand rather than with scrollIntoView: the overlay is a page
      // of its own, and asking the browser to reveal a card scrolled every
      // scrollable ancestor around it too, which on a pad read as the whole
      // spread jumping on each step.
      const outer = box.getBoundingClientRect();
      const card = selected.getBoundingClientRect();
      if (card.top < outer.top) box.scrollTop -= (outer.top - card.top);
      else if (card.bottom > outer.bottom) box.scrollTop += (card.bottom - outer.bottom);
    }

    /**
     * The one line over the grid: how many bays are taken, what shape the frame
     * is fitted as and what it is carrying. It sat in a footer under the list
     * before, where it fought the list for the last inch of the page. The frame
     * does not grow with Em, so there is nothing here about a level: what the
     * gun is worth is what is fitted to it.
     */
    _statusHTML() {
      const chips = [
        T('VectorGun.slots', { used: modes().length, max: MAX_MODES }),
        shapeText(VG.fittedForm(), 'name'),
        elementName(elementId()),
      ];
      return chips.map((chip) => `<span class="vg-status-chip">${esc(chip)}</span>`).join('');
    }

    //------------------------------------------------------------------------
    // The left page: a grid of cards, written the way a skill card is written
    //------------------------------------------------------------------------

    _gridHTML() {
      const rows = this.rows();
      let pick = -1;
      return rows.map((row) => {
        if (row.kind === 'head') {
          return `<div class="vg-grid-head">${esc(row.text)}</div>`;
        }
        pick++;
        const card = row.kind === 'mode' ? this._modeCard(row.key)
          : row.kind === 'form' ? this._formCard(row.key)
          : this._elementCard(row.id);
        const index = pick;
        return `
          <div class="item-slot focusable${index === this._index ? ' selected' : ''}${card.on ? ' vg-on' : ''}"
               onclick="SceneManager._scene.confirmRow(${index})">
            <div class="item-rarity-bar" style="background:${card.stripe};"></div>
            ${iconHTML(card.icon)}
            <div class="item-slot-info">
              <div class="item-slot-name">${esc(card.name)}</div>
              <div class="item-slot-meta">
                <span>${esc(card.meta || '')}</span>
                ${card.chip ? `<span class="item-slot-count">${esc(card.chip)}</span>` : ''}
              </div>
            </div>
          </div>`;
      }).join('');
    }

    _modeCard(key) {
      const bay = modes().indexOf(key);
      return {
        name: T('VectorGun.mode.' + key + '.name'),
        icon: MODE_ICONS[key] || 0,
        // The one line under the name is what the mode DOES: a page of cards
        // all saying "Idle" says nothing at all.
        meta: line('VectorGun.mode.' + key + '.desc'),
        chip: bay >= 0 ? T('VectorGun.bay.loaded', { n: bay + 1 }) : '',
        stripe: bay >= 0 ? STRIPE_ON : STRIPE_OFF,
        on: bay >= 0,
      };
    }

    _formCard(key) {
      const fitted = VG.fittedForm() === key;
      return {
        name: shapeText(key, 'name'),
        icon: SHAPE_ICONS[key] || 0,
        meta: line('VectorGun.shape.' + key + '.desc'),
        chip: fitted ? T('VectorGun.form.fitted') : '',
        stripe: fitted ? STRIPE_ON : STRIPE_OFF,
        on: fitted,
      };
    }

    _elementCard(id) {
      const on = elementId() === id;
      return {
        name: elementName(id),
        icon: ELEMENT_ICONS[id] || 0,
        meta: line('VectorGun.element.desc.' + id),
        chip: on ? T('VectorGun.state.on') : '',
        stripe: on ? STRIPE_ON : (ELEMENT_COLORS[id] || STRIPE_OFF),
        on: on,
      };
    }

    //------------------------------------------------------------------------
    // The right page: the gun, the card under the cursor, the three bays
    //------------------------------------------------------------------------

    _detailHTML() {
      const row = this.current();
      if (!row) return '';
      const card = row.kind === 'mode' ? this._modeDetail(row.key)
        : row.kind === 'form' ? this._formDetail(row.key)
        : this._elementDetail(row.id);
      return `
        <div class="ui-detail-head">
          <div class="ui-detail-titles">
            <h3 class="inspect-name">${esc(card.name)}</h3>
            <div class="inspect-rarity">${esc(card.kind)}</div>
          </div>
        </div>
        <div class="ui-detail-scroll">
          ${card.prose ? `<div class="ui-prose">${card.prose}</div>` : ''}
          ${card.specs.length ? `<div class="inspect-spec-grid">
            ${card.specs.map(([label, value]) => `
              <div class="inspect-spec-row">
                <span class="inspect-spec-label">${esc(label)}</span>
                <span class="inspect-spec-value">${esc(value)}</span>
              </div>`).join('')}
          </div>` : ''}
        </div>`;
    }

    /**
     * The three bays along the bottom of the right page: what the gun is
     * actually running, in order, with the empty ones drawn as empty. The
     * detail card answers the cursor; this answers the gun.
     */
    _baysHTML() {
      const fitted = modes();
      const bays = [];
      for (let i = 0; i < MAX_MODES; i++) {
        const key = fitted[i];
        bays.push(`
          <div class="vg-bay${key ? ' vg-bay-on' : ''}">
            ${key ? iconHTML(MODE_ICONS[key] || 0) : '<span class="item-slot-icon vg-icon"></span>'}
            <div class="item-slot-info">
              <div class="item-slot-name">${esc(key ? T('VectorGun.mode.' + key + '.name')
                : T('VectorGun.bay.empty'))}</div>
              <div class="item-slot-meta">${esc(T('VectorGun.bay.slot', { n: i + 1 }))}</div>
            </div>
          </div>`);
      }
      return bays.join('');
    }

    _modeDetail(key) {
      return {
        name: T('VectorGun.mode.' + key + '.name'),
        kind: T('VectorGun.detail.modesTitle'),
        // The card is the long form: the grid already carries the short one.
        prose: line('VectorGun.mode.' + key + '.effect'),
        specs: [],
      };
    }

    /**
     * A shape's card. The two numbers that actually change between the shapes
     * are on it: how far the weapon reaches and how many rounds it holds, both
     * asked of the system rather than restated here.
     */
    _formDetail(key) {
      const folded = key === GUN_FORM ? VG.SNIPER_FORM : key;
      const gun = VG.gunData();
      const baseRange = gun ? (/<Range:\s*(\d+)>/i.exec(gun.note || '') || [0, 1])[1] : 1;
      const baseBullets = gun ? (/<Bullets:\s*(\d+)>/i.exec(gun.note || '') || [0, 1])[1] : 1;
      const bonus = Math.round((VG.FORM_DAMAGE_BONUS || 0) * 100);
      const specs = [];
      VG.withForm(folded, () => {
        specs.push([T('VectorGun.detail.range'), String(VG.weaponReach(Number(baseRange)))]);
        // The frame condenses its own rounds, so no shape carries ammunition:
        // the only count left is the coilgun's rack, and it is the only card
        // that has a number to show.
        if (folded === VG.SNIPER_FORM) {
          specs.push([T('VectorGun.detail.magazine'),
            String(VG.magazineSize(Number(baseBullets)))]);
        }
      });
      return {
        name: shapeText(key, 'name'),
        kind: T('VectorGun.detail.formTitle'),
        prose: line('VectorGun.shape.' + key + '.effect') + '<br><br>' +
          T(key === GUN_FORM ? 'VectorGun.form.gunGain' : 'VectorGun.form.gain', {
            bonus: bonus, element: elementName(VG.elementId()),
          }),
        specs: specs,
      };
    }

    _elementDetail(id) {
      return {
        name: elementName(id),
        kind: T('VectorGun.detail.elementTitle'),
        prose: line('VectorGun.element.desc.' + id) + '<br><br>' + line('VectorGun.element.hint'),
        specs: [],
      };
    }


    //------------------------------------------------------------------------
    // The gun in 3D
    //------------------------------------------------------------------------

    _mountPreview(force) {
      // A page turn repaints before it morphs, so the shape the new page wants
      // must not be cut straight in.
      if (!force && this.standTarget() !== this._stand) return;
      const form = this.standShape();
      const key = VG.withForm(form, () => VG.modelKey());
      if (key === this._previewKey) return;
      const item = VG.gunData();
      if (!this._el || !item || !window.Weapon3DPreview) return;
      this._disposePreview();
      // disposeAll swaps in a clean canvas node, so the live one is looked up
      // again rather than reused.
      const canvas = this._el.querySelector('.vg-canvas');
      const label = this._el.querySelector('.vg-preview-label');
      if (!canvas) return;
      const entry = VG.withForm(form, () => window.Weapon3DPreview.mount(canvas, item));
      if (entry) this._previews.push(entry);
      if (label) label.textContent = shapeText(form, 'name');
      this._zoomStand(STAND_ZOOM, 0);
      this._fitStand(0);
      this._previewKey = key;
    }

    _disposePreview() {
      if (this._previews && this._previews.length && window.Weapon3DPreview) {
        window.Weapon3DPreview.disposeAll(this._previews);
      }
      this._previews = [];
      this._previewKey = '';
    }
  }

  window.Scene_VectorGun = Scene_VectorGun;
})
();
