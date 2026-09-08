//=============================================================================
// VectorGunSystemUI.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc The vector gun's screen: the modes as a list of buttons, the gun in 3D
 * @author Assistant
 * @requires VectorGunSystem.js
 *
 * @help
 * Scene_VectorGun, the screen the main menu opens in story mode.
 *
 * Shape A of docs/task/ui_fixing.md on the shared kit, printing the backpack's
 * own vocabulary and nothing of its own: one .book-spread, a .page-header-bar
 * carrying the one .back-button, a .backpack-tabs strip of three pages, an
 * .item-slot list on the left page and a .ui-detail on the right. The gun
 * itself stands at the top of the right page on the shared 3D weapon viewer
 * (window.Weapon3DPreview), and gives up its height to the facts under it.
 *
 * The list is the control: every row is a button. Confirming a mode LOADS it
 * into the first free bay of the three the gun runs, and with all three taken
 * it pushes out the oldest (VectorGun.fitMode) rather than refusing. Confirming
 * a mode that is already running unloads it.
 *
 * Up / Down walk the rows, Left / Right and L1 / R1 turn the three pages,
 * Confirm works the row under the cursor and Cancel leaves by the back button.
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
  const hasMode = VG.hasMode;
  const boundSpellId = VG.boundSpellId;
  const setBoundSpell = VG.setBoundSpell;
  const spellChoices = VG.spellChoices;
  const wielder = VG.wielder;
  const emActor = VG.emActor;
  const elementId = VG.elementId;
  const setElement = VG.setElement;
  const ELEMENT_IDS = VG.ELEMENT_IDS;

  const TABS = ['modes', 'form', 'spell', 'element'];
  // How far back the stand's camera rests before the piece has been measured.
  // The viewer's own default is framed for a narrow card in a list; this stand
  // is half the page, so the piece is held closer. Once the model exists the
  // distance is measured off its own bounds (_fitZoom) so every shape fills
  // the stand instead of every shape sharing one guessed distance.
  const STAND_ZOOM = 2.05;
  // How much of the stand is left empty around the piece once it is fitted.
  const STAND_MARGIN = 1.06;
  const FORM_CHOICES = VG.FORM_CHOICES;
  const GUN_FORM = VG.GUN_FORM;

  /** The bank a row's words come from: the shapes have one of their own. */
  const shapeText = (key, part) => T('VectorGun.shape.' + key + '.' + part);

  // The IconSet face each row wears. Skills carry their own iconIndex; the
  // modes and the elements do not exist in the database at all, so the two
  // tables below are the only place their faces are named. The element table is
  // the game's own (UI/CustomSceneStatus.js, CharacterCreationPickers.js),
  // indexed by element id.
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

  // The shapes wear the face of the weapon type they are, so the rack reads as
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
  };

  /** One IconSet cell, drawn the way every other menu draws one. */
  function iconHTML(index) {
    const i = Number(index) || 0;
    if (i <= 0) return '';
    return `<span class="item-icon vg-icon" style="background:url('img/system/IconSet.png') ` +
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
      // The overlay is the shared one every screen the main menu opens uses
      // (#menu-container, UI/CustomMainMenuLayout.js createUIMenuDOM): it is
      // visible by default and only the first open fades up, said with
      // .menu-entering.
      this._el = document.createElement('div');
      this._el.id = 'menu-container';
      this._el.classList.add('menu-entering');
      document.body.appendChild(this._el);

      // A right click anywhere on the overlay is a cancel: the DOM layer sits
      // over the game canvas, so TouchInput never hears the button and the
      // screen could only be left with the pad or the Back stamp. The 3D
      // viewer keeps its own right drag, so the weapon is excluded.
      this._el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (e.target.closest('.vg-canvas')) return;
        this._closeRequested = true;
      });

      // RPG Maker preventDefaults wheel on the document, which kills native
      // scrolling inside a DOM overlay: scroll the region under the pointer
      // ourselves, as the faction register does. The viewer's own canvas keeps
      // the wheel for its zoom.
      this._el.addEventListener('wheel', (e) => {
        if (e.target && e.target.tagName === 'CANVAS') return;
        const box = e.target.closest('.ui-list, .ui-scroll, .ui-detail-scroll, .right-page');
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
      this._disposePreview();
      if (this._el && this._el.parentNode) this._el.parentNode.removeChild(this._el);
      this._el = null;
      super.terminate();
    }

    /**
     * The rows of the open page, ALWAYS in the order their names read in: the
     * list is one column and a reader looks a name up alphabetically, not by
     * whatever order the table happens to declare. The spell page keeps its
     * "none" row first, since that one is a clearing and not a choice.
     */
    rows() {
      const byName = (list, name) => list.slice().sort(
        (a, b) => String(name(a)).localeCompare(String(name(b))));
      if (this._tab === 'modes') {
        return byName(MODE_KEYS, (key) => T('VectorGun.mode.' + key + '.name'));
      }
      if (this._tab === 'form') return byName(FORM_CHOICES, (key) => shapeText(key, 'name'));
      if (this._tab === 'element') return byName(ELEMENT_IDS, elementName);
      return [0].concat(byName(spellChoices().map((skill) => skill.id),
        (id) => ($dataSkills[id] ? $dataSkills[id].name : '')));
    }

    /**
     * The shape drawn beside the pistol: whatever the cursor is on while the
     * form page is open, and the fitted one everywhere else, so the two models
     * on the right page always answer the row being read.
     */
    shownShape() {
      if (this._tab === 'form') {
        const row = this.rows()[this._index];
        if (row !== undefined) return row === GUN_FORM ? VG.SNIPER_FORM : row;
      }
      const fitted = VG.fittedForm();
      return fitted === GUN_FORM ? VG.SNIPER_FORM : fitted;
    }

    /** The shape actually on the stand right now. */
    standShape() {
      return this._stand === GUN_FORM ? GUN_FORM : this.shownShape();
    }

    /**
     * SWITCH, on the bench: the piece comes apart, is rebuilt as the other
     * shape and rises again, exactly as it does in a battler's hand
     * (VectorGun.playSwitchOn). Nothing is fitted by it; it is the screen
     * looking at the other half of the same weapon.
     */
    switchStand() {
      if (this._switching || !this._el) return;
      this._switching = true;
      const entry = this._previews[0];
      const fold = VG.playSwitchOn(entry ? entry.model : null, 'fold') || 0;
      // The camera comes in while the piece is coming apart and pulls back once
      // the new shape has risen: the reconstruction is the thing worth looking
      // at, so the screen looks at it.
      this._zoomStand(1.55, fold);
      setTimeout(() => {
        if (!this._el) return;
        this._stand = this._stand === GUN_FORM ? this.shownShape() : GUN_FORM;
        this._mountPreview();
        const rise = VG.playSwitchOn(
          this._previews[0] ? this._previews[0].model : null, 'rise') || 0;
        this._zoomStand(1.7, 0);
        this._fitStand(rise + 260);
        this._switching = false;
      }, fold);
    }

    //------------------------------------------------------------------------
    // The cursor, the one thing the screen owns
    //------------------------------------------------------------------------

    update() {
      super.update();
      // The right mouse button closes the screen the way the pad's cancel does.
      // TouchInput only sees it when nothing swallowed the event first, so the
      // overlay's own listener below is what actually reports it; this is the
      // canvas half of the same gesture.
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
      // Shift changes the hand the gun is held in: the same switch the
      // strip under the bays offers to the mouse.
      if (Input.isTriggered('shift')) {
        this.switchStand();
        return;
      }
      const last = this.rows().length - 1;
      if (last < 0) return;
      if (Input.isRepeated('down') && this._index < last) {
        this._index++; SoundManager.playCursor(); this._paintSelection();
      } else if (Input.isRepeated('up') && this._index > 0) {
        this._index--; SoundManager.playCursor(); this._paintSelection();
      } else if (Input.isRepeated('right') || Input.isRepeated('left')) {
        // Left walks the pages backwards, right forwards: turning both ways on
        // the same key left the third page unreachable in one direction.
        this.turnTab(Input.isRepeated('left') ? -1 : 1);
      } else if (Input.isTriggered('ok')) {
        this.confirmRow(this._index);
      }
    }

    /**
     * Works the row under the cursor: a mode is loaded into a bay (pushing the
     * oldest out when all three are taken) or unloaded, a spell is bound, an
     * element is set.
     */
    confirmRow(index) {
      this._index = index;
      const row = this.rows()[index];
      if (row === undefined) return;
      if (this._tab === 'modes') this._fit(row);
      else if (this._tab === 'form') {
        VG.setForm(row);
        SoundManager.playOk();
        this._toast(T('VectorGun.toast.form', { form: shapeText(row, 'name') }), 'vgform');
      } else if (this._tab === 'element') {
        setElement(row);
        SoundManager.playOk();
        this._toast(T('VectorGun.toast.element', { element: elementName(row) }), 'vgelement');
      } else {
        setBoundSpell(row);
        SoundManager.playOk();
        const skill = $dataSkills[row];
        this._toast(skill ? T('VectorGun.toast.bound', { spell: skill.name }) : T('VectorGun.toast.cleared'), 'vgspell');
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
    }

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
      // The piece turns on the stand, so the depth counts as width too: the
      // radius of what it sweeps is what has to fit, not the pose it is in.
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

    /**
     * Walks the stand's camera to `z` over `ms`. The viewer owns the camera and
     * publishes it on its record (window.Weapon3DPreview), so nothing here has
     * to know how the viewport is built.
     */
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
    // only the list, the footer and the detail card are repainted.

    _buildShell() {
      // The gun is turned on the ground the party is standing on, the same
      // battleground the equip screen's bench stands on
      // (ItemSystem/ItemSystemEquipmentUI.js, BattleSystem/
      // AnimatedBattleBackgrounds.js), not in a grey box.
      const groundImg = (typeof window.getMapBattlebackImage === 'function')
        ? window.getMapBattlebackImage() : null;
      const groundStyle = groundImg
        ? ` style="background-image:url('${String(groundImg).replace(/['"]/g, '')}');"` : '';

      const tabsHTML = TABS.map((tab) => `
        <div class="backpack-tab focusable" data-tab="${tab}"
             onclick="SceneManager._scene.turnTab('${tab}')">${T('VectorGun.tab.' + tab)}</div>`).join('');

      this._el.innerHTML = `
        <div class="book-spread vg-book">
          <div class="left-page">
            <div class="page-header-bar">
              <div class="back-button focusable" onclick="SceneManager._scene.popScene()">${T('VectorGun.back')}</div>
              <h2 class="title">${T('VectorGun.title')}</h2>
            </div>
            <div class="backpack-tabs">${tabsHTML}</div>
            <div class="ui-list ui-scroll"></div>
            <div class="ui-footer"></div>
          </div>
          <div class="right-page vg-spread">
            <div class="vg-middle">
              <div class="vg-active"></div>
              <div class="ui-detail"></div>
            </div>
            <div class="vg-stage weapon-previews-container">
              <div class="weapon-preview-card"${groundStyle}>
                <canvas class="vg-canvas"></canvas>
                <span class="vg-preview-label"></span>
              </div>
              <div class="vg-switch focusable" onclick="SceneManager._scene.switchStand()">${T('VectorGun.switch')}</div>
            </div>
          </div>
        </div>`;
    }

    _paint() {
      if (!this._el) return;
      const rows = this.rows();
      if (this._index >= rows.length) this._index = Math.max(0, rows.length - 1);

      this._el.querySelectorAll('.backpack-tab').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.tab === this._tab);
      });
      this._el.querySelector('.ui-list').innerHTML = this._listHTML();
      // The frame keeps up with the hand holding it, so what it has grown into
      // is stated on the sheet next to what it is running (VectorGunSystem.js
      // is the one place the growth is worked out).
      const grown = VG.growthParams();
      this._el.querySelector('.ui-footer').innerHTML = `
        <span class="inspect-spec-value">${T('VectorGun.slots', { used: modes().length, max: MAX_MODES })}</span>
        <span class="inspect-spec-value">${T('VectorGun.growth.footer', {
          level: VG.gunLevel(),
          damage: Math.round((VG.growthRate() - 1) * 100),
          atk: grown.atk, rounds: VG.growthRounds(),
        })}</span>
        <span class="inspect-spec-label">${shapeText(VG.fittedForm(), 'name')}</span>`;
      this._el.querySelector('.vg-active').innerHTML = this._activeHTML();
      this._el.querySelector('.ui-detail').innerHTML = this._detailHTML();
      this._scrollToSelection();
      this._mountPreview();
    }

    /**
     * Walking the list moves a class and rewrites the detail card. Rebuilding
     * the spread for a cursor step is what made the screen flicker.
     */
    _paintSelection() {
      if (!this._el) return;
      this._el.querySelectorAll('.ui-list .item-slot')
        .forEach((slot, i) => slot.classList.toggle('selected', i === this._index));
      this._el.querySelector('.ui-detail').innerHTML = this._detailHTML();
      this._scrollToSelection();
      // Walking the form page turns the shape on the right hand stand with the
      // cursor; on every other page the pair is already what it should be.
      if (this._tab === 'form' && this._stand !== GUN_FORM) this._mountPreview();
    }

    _scrollToSelection() {
      const selected = this._el ? this._el.querySelector('.item-slot.selected') : null;
      if (selected && selected.scrollIntoView) selected.scrollIntoView({ block: 'nearest' });
    }

    //------------------------------------------------------------------------
    // The left page: one row per choice, and every row is a button
    //------------------------------------------------------------------------

    _listHTML() {
      const rows = this.rows();
      if (this._tab === 'spell' && !spellChoices().length && rows.length <= 1) {
        return `<div class="ui-empty-note">${T('VectorGun.spell.empty')}</div>`;
      }
      // ONE choice per row, read down: the left page is a narrow column of
      // names beside the picture, and a name cut in half is worth nothing.
      const cells = rows.map((row, i) => {
        const cell = this._tab === 'modes' ? this._modeCell(row)
          : this._tab === 'form' ? this._formCell(row)
          : this._tab === 'element' ? this._elementCell(row)
          : this._spellCell(row);
        return `
          <div class="item-slot focusable${i === this._index ? ' selected' : ''}"
               onclick="SceneManager._scene.confirmRow(${i})">
            ${iconHTML(cell.icon)}
            <div class="item-slot-info">
              <span class="item-slot-name">${cell.name}</span>
              <span class="item-slot-meta">
                ${cell.chips.map((chip) => `<span class="item-slot-count">${chip}</span>`).join('')}
              </span>
            </div>
          </div>`;
      }).join('');
      return `<div class="vg-grid">${cells}</div>`;
    }

    _modeCell(key) {
      const bay = modes().indexOf(key);
      return {
        name: T('VectorGun.mode.' + key + '.name'),
        icon: MODE_ICONS[key] || 0,
        chips: bay >= 0
          ? [T('VectorGun.bay.loaded', { n: bay + 1 }), T('VectorGun.state.on')]
          : [T('VectorGun.state.off')],
      };
    }

    _formCell(key) {
      const fitted = VG.fittedForm() === key;
      return {
        name: shapeText(key, 'name'),
        icon: SHAPE_ICONS[key] || 0,
        chips: fitted ? [T('VectorGun.form.fitted')] : [],
      };
    }

    _elementCell(id) {
      return {
        name: elementName(id),
        icon: ELEMENT_ICONS[id] || 0,
        chips: elementId() === id ? [T('VectorGun.state.on')] : [],
      };
    }

    _spellCell(skillId) {
      const skill = $dataSkills[skillId];
      const actor = wielder() || emActor();
      const cost = skill && actor ? VG.spellCost(actor, skill) : 0;
      const chips = [];
      if (skill) chips.push(T('VectorGun.spell.fired', { cost: cost }));
      if (boundSpellId() === skillId) chips.push(T('VectorGun.state.on'));
      return {
        name: skill ? skill.name : T('VectorGun.spell.none'),
        icon: skill ? skill.iconIndex : 0,
        chips: chips,
      };
    }

    //------------------------------------------------------------------------
    // The right page: the gun above, the card for the row under the cursor
    //------------------------------------------------------------------------

    _detailHTML() {
      const row = this.rows()[this._index];
      if (row === undefined) return '';
      const card = this._tab === 'modes' ? this._modeDetail(row)
        : this._tab === 'form' ? this._formDetail(row)
        : this._tab === 'element' ? this._elementDetail(row)
        : this._spellDetail(row);
      return `
        <div class="ui-detail-head">
          <div class="ui-detail-titles">
            <h3 class="inspect-name">${card.name}</h3>
            <div class="inspect-rarity">${card.kind}</div>
          </div>
        </div>
        <div class="ui-detail-scroll">
          ${card.prose ? `<div class="ui-prose">${card.prose}</div>` : ''}
          <div class="inspect-spec-grid">
            ${card.specs.map(([label, value]) => `
              <div class="inspect-spec-row">
                <span class="inspect-spec-label">${label}</span>
                <span class="inspect-spec-value">${value}</span>
              </div>`).join('')}
          </div>
        </div>`;
    }

    /**
     * The middle column: everything the gun is actually doing, bay by bay, with
     * the effect each loaded mode is having spelled out. The detail card under
     * it answers the cursor; this answers the gun.
     */
    _activeHTML() {
      const fitted = modes();
      const head = `<h4 class="inspect-section-title">${T('VectorGun.detail.fitted')}</h4>`;
      if (!fitted.length) {
        return `${head}<div class="ui-empty-note">${T('VectorGun.state.off')}</div>`;
      }
      const rows = fitted.map((key, i) => `
        <div class="vg-active-row">
          ${iconHTML(MODE_ICONS[key] || 0)}
          <div class="item-slot-info">
            <span class="item-slot-name">${T('VectorGun.mode.' + key + '.name')}</span>
            <span class="item-slot-count">${T('VectorGun.bay.loaded', { n: i + 1 })}</span>
            <div class="ui-prose">${line('VectorGun.mode.' + key + '.effect')}</div>
          </div>
        </div>`).join('');
      return `${head}<div class="vg-active-list">${rows}</div>`;
    }

    _modeDetail(key) {
      return {
        name: T('VectorGun.mode.' + key + '.name'),
        kind: T('VectorGun.detail.modesTitle'),
        prose: line('VectorGun.mode.' + key + '.desc'),
        // What state it is in is already on the row itself, so the card says
        // only what the row cannot: what the thing does.
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
      // The two numbers a shape is actually chosen on. Every shape has a reach,
      // which is what the battle map is given (MapBattleMode.weaponRange); only
      // the ones that shoot have a magazine to print.
      VG.withForm(folded, () => {
        specs.push([T('VectorGun.detail.range'), String(VG.weaponReach(Number(baseRange)))]);
        if (!VG.inMeleeForm()) {
          specs.push([T('VectorGun.detail.magazine'),
            String(VG.magazineSize(Number(baseBullets)))]);
        }
      });
      return {
        name: shapeText(key, 'name'),
        kind: T('VectorGun.detail.formTitle'),
        prose: line('VectorGun.shape.' + key + '.desc') + '<br><br>' +
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
        // The element is a choice, not a thing to read about: the name is all
        // the card has to say.
        prose: '',
        specs: [],
      };
    }

    _spellDetail(skillId) {
      const skill = $dataSkills[skillId];
      const actor = wielder() || emActor();
      const cost = skill && actor ? VG.spellCost(actor, skill) : 0;
      return {
        name: skill ? skill.name : T('VectorGun.spell.none'),
        kind: T('VectorGun.detail.spellTitle'),
        prose: skill ? (skill.description || line('VectorGun.spell.hint')) : line('VectorGun.spell.noneDesc'),
        specs: [
          [T('VectorGun.detail.cost'), skill ? T('VectorGun.spell.mp', { cost: cost }) : T('VectorGun.detail.unbound')],
        ],
      };
    }

    //------------------------------------------------------------------------
    // The gun in 3D
    //------------------------------------------------------------------------
    // The viewer is the shared one (ItemSystem/ItemSystemEquipmentUI.js), so the
    // piece turns, zooms and ticks its own moving parts exactly as it does on a
    // shop counter. It is rebuilt only when the gun itself changes shape: the
    // Blade of Thelema and the element are both in the model's key.

    /**
     * ONE shape on the stand, as big as the right page allows, and SWITCH under
     * it for the other. A weapon that is one object in two shapes reads best
     * when the change between them is played rather than laid side by side.
     */
    _mountPreview() {
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
