/*:
 * @target MZ
 * @plugindesc 3D Political Graph v1.1.0 - Interactive 3D Political Compass with Character Creation Gold UI Theme
 * @author Antigravity
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * ============================================================================
 * 3D Political Graph Plugin v1.1.0 (Character Creation Theme Update)
 * ============================================================================
 * Displays a 3D Political Cube featuring:
 *   - X-Axis (Economic): Left (-100) <---> Right (+100)
 *   - Y-Axis (Authoritarian): Libertarian (-100) <---> Authoritarian (+100)
 *   - Z-Axis (Esoteric): Mundane / Rational (-100) <---> Magic / Occult (+100)
 *
 * Plotting all 228 ideologies from js/db/WorldGen/Ideology.json in interactive
 * 3D space styled matching the Character Creation parchment & gold UI palette.
 */

(() => {
  'use strict';

  const PLUGIN_NAME = '3DPoliticalGraph';
  const CONTAINER_ID = 'political-graph-container';

  // ==========================================================================
  // Public Namespace & API
  // ==========================================================================
  window.PoliticalGraph3D = {
    open(options = {}) {
      if (SceneManager._scene instanceof Scene_3DPoliticalGraph) {
        SceneManager._scene.configure(options);
        return;
      }
      Scene_3DPoliticalGraph.initialOptions = options;
      SceneManager.push(Scene_3DPoliticalGraph);
    },
    openModal(options = {}) {
      this.open(Object.assign({ isModal: true }, options));
    },
    close() {
      if (SceneManager._scene instanceof Scene_3DPoliticalGraph) {
        SceneManager.pop();
      }
    },
    getScores(ideologyId) {
      const list = window.PoliticalGraph3D.getIdeologyData();
      return list.find(item => item.id === ideologyId) || null;
    },
    getAllScores() {
      return window.PoliticalGraph3D.getIdeologyData();
    },
    getIdeologyData() {
      if (window.WorldGen && Array.isArray(window.WorldGen.Ideology)) {
        return window.WorldGen.Ideology;
      }
      return [];
    }
  };

  window.Political3DGraph = window.PoliticalGraph3D;

  if (typeof PluginManager !== 'undefined' && PluginManager.registerCommand) {
    PluginManager.registerCommand(PLUGIN_NAME, 'Open3DPoliticalGraph', args => {
      const focusId = args ? args.focusId : '';
      window.PoliticalGraph3D.open({ focusId });
    });

    PluginManager.registerCommand(PLUGIN_NAME, 'FocusIdeology', args => {
      const ideologyId = args ? args.ideologyId : 'center_left_technocrat';
      window.PoliticalGraph3D.open({ focusId: ideologyId });
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'P' || e.key === 'p') {
      if (SceneManager._scene instanceof Scene_Map && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const activeElem = document.activeElement;
        if (activeElem && (activeElem.tagName === 'INPUT' || activeElem.tagName === 'TEXTAREA')) return;
        window.PoliticalGraph3D.open();
      }
    }
  });

  // ==========================================================================
  // Scene_3DPoliticalGraph Implementation
  // ==========================================================================
  class Scene_3DPoliticalGraph extends Scene_MenuBase {
    initialize() {
      super.initialize();
      this.configure(Scene_3DPoliticalGraph.initialOptions || {});
      Scene_3DPoliticalGraph.initialOptions = null;
      this._ideologies = [];
      this._filteredIdeologies = [];
      this._selectedIdeology = null;
      this._hoveredIdeology = null;

      // 3D Orbit Camera State
      this._rotX = 0.42;
      this._rotY = -0.75;
      this._zoom = 1.0;
      this._autoRotate = false;

      // Interaction State
      this._isDragging = false;
      this._lastMouseX = 0;
      this._lastMouseY = 0;

      // Filters
      this._searchQuery = '';
      this._filterQuadrant = 'ALL';
    }

    configure(options) {
      this._options = options || {};
      this._onSelectCallback = this._options.onSelect || null;
      this._isModal = !!this._options.isModal || !!this._onSelectCallback;
    }

    create() {
      super.create();
      this.createBackground();
      this.loadIdeologyData();
      this.createDOMOverlay();
      this.createCanvas3D();
      this.applyInitialFocus();
    }

    loadIdeologyData() {
      this._ideologies = window.PoliticalGraph3D.getIdeologyData();
      if (!this._ideologies || this._ideologies.length === 0) {
        try {
          const xhr = new XMLHttpRequest();
          xhr.open('GET', 'js/db/WorldGen/Ideology.json', false);
          xhr.send();
          if (xhr.status === 200) {
            this._ideologies = JSON.parse(xhr.responseText);
          }
        } catch (e) {
          console.warn('[3DPoliticalGraph] Could not load Ideology.json fallback:', e);
        }
      }
      this.applyFilters();
    }

    applyFilters() {
      const q = (this._bar ? this._bar.query : this._searchQuery).toLowerCase().trim();
      this._filteredIdeologies = this._ideologies.filter(item => {
        if (!item || !item.axes) return false;

        if (q.length > 0) {
          const idMatch = item.id.toLowerCase().includes(q);
          const nameMatch = item.name && item.name.toLowerCase().includes(q);
          const localizedName = this.getLocalizedName(item).toLowerCase();
          if (!idMatch && !nameMatch && !localizedName.includes(q)) return false;
        }

        const econ = item.axes.econ || 0;
        const auth = item.axes.auth || 0;
        const myst = item.axes.myst !== undefined ? item.axes.myst : (item.axes.esoteric || 0);

        switch (this._filterQuadrant) {
          case 'AUTH_LEFT': return econ <= 0 && auth >= 0;
          case 'AUTH_RIGHT': return econ >= 0 && auth >= 0;
          case 'LIB_LEFT': return econ <= 0 && auth <= 0;
          case 'LIB_RIGHT': return econ >= 0 && auth <= 0;
          case 'MAGIC': return myst >= 25;
          case 'MUNDANE': return myst <= -25;
          default: return true;
        }
      });
    }

    getLocalizedName(item) {
      if (!item) return '';
      if (typeof window.i18n === 'function') {
        const loc = window.i18n(item.name || `ideology.${item.id}`);
        if (loc && !loc.startsWith('ideology.')) return loc;
      }
      return item.id.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }

    applyInitialFocus() {
      if (this._options && this._options.focusId) {
        const found = this._ideologies.find(i => i.id === this._options.focusId);
        if (found) {
          this.selectIdeology(found);
        }
      }
      if (!this._selectedIdeology && this._filteredIdeologies.length > 0) {
        this.selectIdeology(this._filteredIdeologies[0]);
      }
    }

    selectIdeology(item) {
      this._selectedIdeology = item;
      this.updateDetailPanel();
    }

    confirmSelection() {
      if (this._selectedIdeology && typeof this._onSelectCallback === 'function') {
        this._onSelectCallback(this._selectedIdeology.id, this._selectedIdeology);
      }
      SceneManager.pop();
    }

    // ==========================================================================
    // DOM UI Overlay Construction
    // --------------------------------------------------------------------------
    // Shape A, the spread: the chart is the left page, the reading of one
    // ideology and the roll of them all are the right. Nothing here names a
    // colour, a font or a size; the classes are the shared kit's own
    // (.page-header-bar, .backpack-tabs, .item-slot, .inspect-spec-grid,
    // .inspect-actions) so this screen inherits every fix made to them.
    // ==========================================================================
    createDOMOverlay() {
      this._bar = window.MenuSearchBar ? window.MenuSearchBar.create({
        id: 'pgraph',
        placeholder: T('PoliticalGraph.search'),
        onChange: () => { this.applyFilters(); this.updateIdeologyList(); }
      }) : null;

      this._overlay = document.createElement('div');
      this._overlay.id = CONTAINER_ID;
      this._overlay.innerHTML = `
        <div class="book-spread">
          <div class="left-page pgraph-chart-page">
            <div class="page-header-bar">
              <div class="back-button focusable" id="pgraph-back" tabindex="0">${T('PoliticalGraph.back')}</div>
              <h2 class="title">${T('PoliticalGraph.title')}</h2>
              ${this._bar ? this._bar.html() : ''}
            </div>
            <div class="backpack-tabs pgraph-views" id="pgraph-views"></div>
            <div class="backpack-tabs pgraph-filters" id="pgraph-filters"></div>
            <div class="pgraph-frame" id="pgraph-frame"></div>
          </div>
          <div class="right-page">
            <div class="ui-detail" id="pgraph-detail"></div>
            <div class="ui-footer" id="pgraph-count"></div>
            <div class="ui-list ui-scroll" id="pgraph-list"></div>
            <div class="inspect-actions" id="pgraph-actions"></div>
          </div>
        </div>`;

      const back = this._overlay.querySelector('#pgraph-back');
      back.addEventListener('click', () => SceneManager.pop());

      // The camera presets and the quadrant filters are two runs of the one tab
      // rail every menu in the game wears, not a bar of this screen's own.
      const views = this._overlay.querySelector('#pgraph-views');
      const cameraPresets = [
        { key: 'isometric', action: () => { this._rotX = 0.42; this._rotY = -0.75; this._zoom = 1.0; } },
        { key: 'top', action: () => { this._rotX = 1.57; this._rotY = 0; this._zoom = 1.1; } },
        { key: 'front', action: () => { this._rotX = 0; this._rotY = 0; this._zoom = 1.0; } },
        { key: 'side', action: () => { this._rotX = 0; this._rotY = 1.57; this._zoom = 1.0; } },
        { key: 'orbit', action: (btn) => {
            this._autoRotate = !this._autoRotate;
            btn.classList.toggle('active', this._autoRotate);
          }
        }
      ];
      this._viewButtons = [];
      cameraPresets.forEach(preset => {
        const btn = document.createElement('div');
        btn.className = 'backpack-tab focusable';
        btn.tabIndex = 0;
        btn.innerText = T('PoliticalGraph.view.' + preset.key);
        btn.addEventListener('click', () => {
          if (preset.key !== 'orbit') {
            this._autoRotate = false;
            this._viewButtons.forEach(b => b.classList.toggle('active', b === btn));
          }
          preset.action(btn);
        });
        views.appendChild(btn);
        this._viewButtons.push(btn);
      });
      this._viewButtons[0].classList.add('active');

      const filters = this._overlay.querySelector('#pgraph-filters');
      const filterPills = [
        { id: 'ALL', label: T('PoliticalGraph.filter.all', { n: (this._ideologies || []).length }) },
        { id: 'AUTH_LEFT', label: T('PoliticalGraph.filter.authLeft') },
        { id: 'AUTH_RIGHT', label: T('PoliticalGraph.filter.authRight') },
        { id: 'LIB_LEFT', label: T('PoliticalGraph.filter.libLeft') },
        { id: 'LIB_RIGHT', label: T('PoliticalGraph.filter.libRight') },
        { id: 'MAGIC', label: T('PoliticalGraph.filter.magic') },
        { id: 'MUNDANE', label: T('PoliticalGraph.filter.mundane') }
      ];

      this._pillButtons = [];
      filterPills.forEach(pill => {
        const btn = document.createElement('div');
        btn.className = 'backpack-tab focusable';
        btn.tabIndex = 0;
        btn.classList.toggle('active', this._filterQuadrant === pill.id);
        btn.innerText = pill.label;
        btn.addEventListener('click', () => {
          this._filterQuadrant = pill.id;
          this._pillButtons.forEach(b => b.btn.classList.toggle('active', b.id === pill.id));
          this.applyFilters();
          this.updateIdeologyList();
        });
        filters.appendChild(btn);
        this._pillButtons.push({ id: pill.id, btn });
      });

      // Confirming a pick is an action on the reading, so it stands at the foot
      // of the right page with every other menu's action strip, and the Back
      // button keeps the one place it stands on every screen in the game.
      if (this._isModal) {
        const actions = this._overlay.querySelector('#pgraph-actions');
        const selectBtn = document.createElement('div');
        selectBtn.className = 'inspect-btn focusable';
        selectBtn.tabIndex = 0;
        selectBtn.innerText = T('PoliticalGraph.confirm');
        selectBtn.addEventListener('click', () => this.confirmSelection());
        actions.appendChild(selectBtn);
      }

      document.body.appendChild(this._overlay);
      if (window.MenuSearchBar) window.MenuSearchBar.dock();
      // Everything on this chart - the camera presets, the quadrant filters,
      // the ideology rows, the confirm and back buttons - was a click and
      // nothing else: the scene read Cancel and no other key. The shared DOM
      // focus ring walks them (window.CCNav, CharacterCreationNav.js), the same
      // ring the creation screens and the maintenance bay wear.
      if (window.CCNav) window.CCNav.attach(this, this._overlay, { boards: false });
      this.updateIdeologyList();
      this.updateDetailPanel();
    }

    // No card board behind the ring: the chart IS the page, so stepping off its
    // first control lands on the last rather than on nothing at all.
    onNavLeave() {
      if (window.CCNav) window.CCNav.enter("up");
    }

    // One row per ideology, mounted in a window rather than built whole: two
    // hundred and thirty eight rows cost the dozen the page can show.
    updateIdeologyList() {
      const listContainer = document.getElementById('pgraph-list');
      const countBox = document.getElementById('pgraph-count');
      if (!listContainer) return;

      const rows = this._filteredIdeologies;
      if (countBox) countBox.innerText = T('PoliticalGraph.listHead') + ' (' + rows.length + ')';

      const rowHTML = (idx) => {
        const item = rows[idx];
        const name = this.getLocalizedName(item);
        const isSelected = this._selectedIdeology && this._selectedIdeology.id === item.id;
        const myst = item.axes.myst !== undefined ? item.axes.myst : (item.axes.esoteric || 0);
        const esotericTag = myst > 25 ? T('PoliticalGraph.tag.magic')
          : myst < -25 ? T('PoliticalGraph.tag.mundane') : T('PoliticalGraph.tag.neutral');
        return `
          <div class="item-slot pgraph-row focusable${isSelected ? ' selected' : ''}" data-idx="${idx}" tabindex="0">
            <div class="pgraph-row-ident">
              <div class="item-slot-name">${name}</div>
              <div class="item-slot-meta">${T('PoliticalGraph.axisShort', {
                  econ: item.axes.econ, auth: item.axes.auth, myst: myst })}</div>
            </div>
            <span class="ui-chip">${esotericTag}</span>
          </div>`;
      };

      const wire = (scope) => {
        scope.querySelectorAll('.pgraph-row').forEach(row => {
          const item = rows[Number(row.dataset.idx)];
          if (!item) return;
          row.addEventListener('click', () => {
            this.selectIdeology(item);
            this.updateIdeologyList();
          });
          row.addEventListener('dblclick', () => {
            this.selectIdeology(item);
            if (this._isModal) this.confirmSelection();
          });
          row.addEventListener('mouseenter', () => { this._hoveredIdeology = item; });
          row.addEventListener('mouseleave', () => { this._hoveredIdeology = null; });
        });
      };

      if (window.MenuVirtualList) {
        window.MenuVirtualList.render(listContainer, {
          key: this._filterQuadrant + '|' + (this._bar ? this._bar.query : ''),
          count: rows.length,
          renderItem: rowHTML,
          onWindow: (win) => wire(win)
        });
      } else {
        listContainer.innerHTML = rows.map((_, i) => rowHTML(i)).join('');
        wire(listContainer);
      }
      if (this._bar) this._bar.restoreFocus();
    }

    // The right page, in the one shape every detail page in the game wears:
    // a head, a grid of label/value pairs, then a titled section.
    updateDetailPanel() {
      const details = document.getElementById('pgraph-detail');
      if (!details || !this._selectedIdeology) return;

      const item = this._selectedIdeology;
      const name = this.getLocalizedName(item);

      const econ = item.axes.econ || 0;
      const auth = item.axes.auth || 0;
      const myst = item.axes.myst !== undefined ? item.axes.myst : (item.axes.esoteric || 0);

      let quadrantStr = '';
      if (auth >= 0 && econ < 0) quadrantStr = T('PoliticalGraph.quadrant.authLeft');
      else if (auth >= 0 && econ >= 0) quadrantStr = T('PoliticalGraph.quadrant.authRight');
      else if (auth < 0 && econ < 0) quadrantStr = T('PoliticalGraph.quadrant.libLeft');
      else quadrantStr = T('PoliticalGraph.quadrant.libRight');

      const esotericStr = myst > 25 ? T('PoliticalGraph.esoteric.high')
        : myst < -25 ? T('PoliticalGraph.esoteric.low') : T('PoliticalGraph.esoteric.balanced');

      const adherents = [];
      if (window.NPCPolitics && typeof window.NPCPolitics.getPower === 'function') {
        try {
          const powers = window.NPCPolitics.listPowers ? window.NPCPolitics.listPowers() : [];
          powers.forEach(pName => {
            const pow = window.NPCPolitics.getPower(pName);
            if (pow && pow.parties) {
              pow.parties.forEach(party => {
                if (party.creedId === item.id || party.ideology === item.id) {
                  adherents.push(`${party.name || party.id} (${pName})`);
                }
              });
            }
          });
        } catch (e) {}
      }

      const adherentsHTML = adherents.length > 0
        ? adherents.slice(0, 4).map(a => `<div class="inspect-bullet-item">${a}</div>`).join('')
        : `<div class="ui-empty-note">${T('PoliticalGraph.noAdherents')}</div>`;

      // The value keeps a side of its own - a reading of an axis IS a side -
      // but it is named rather than painted, and the ink comes from a token.
      const axisRow = (label, value, side, word) => `
        <div class="inspect-spec-row">
          <span class="inspect-spec-label">${label}</span>
          <span class="inspect-spec-value pgraph-axis-value--${side}">${value} (${word})</span>
        </div>`;

      details.innerHTML = `
        <div class="ui-detail-head">
          <div class="ui-detail-titles">
            <h3>${name}</h3>
            <div class="ui-detail-sub">${quadrantStr} &bull; ${esotericStr}</div>
          </div>
        </div>
        <div class="ui-detail-scroll">
          <div class="inspect-spec-grid">
            ${axisRow(T('PoliticalGraph.axis.econ'), econ, econ < 0 ? 'left' : 'right',
                econ < 0 ? T('PoliticalGraph.side.left') : T('PoliticalGraph.side.right'))}
            ${axisRow(T('PoliticalGraph.axis.auth'), auth, auth >= 0 ? 'auth' : 'lib',
                auth >= 0 ? T('PoliticalGraph.side.auth') : T('PoliticalGraph.side.lib'))}
            ${axisRow(T('PoliticalGraph.axis.myst'), myst, myst > 0 ? 'magic' : 'mundane',
                myst > 0 ? T('PoliticalGraph.side.magic') : T('PoliticalGraph.side.mundane'))}
          </div>
          <div class="inspect-section-title">${T('PoliticalGraph.adherents')}</div>
          ${adherentsHTML}
        </div>`;
    }

    createCanvas3D() {
      this._canvas = document.createElement('canvas');
      this._canvas.id = 'political-graph-3d-canvas';
      this._canvas.className = 'pgraph-canvas';
      const frame = this._overlay.querySelector('#pgraph-frame');
      frame.appendChild(this._canvas);
      this._ctx = this._canvas.getContext('2d');

      this.resizeCanvas();
      this._onResize = () => this.resizeCanvas();
      window.addEventListener('resize', this._onResize);

      this._canvas.addEventListener('mousedown', (e) => {
        if (e.target !== this._canvas) return;
        this._isDragging = true;
        this._lastMouseX = e.clientX;
        this._lastMouseY = e.clientY;
      });

      // Kept as fields so destroy() can take them off the window again: these
      // are global handlers, and an anonymous one would outlive the scene and
      // go on reading the cursor for the rest of the session, once more for
      // every time the graph had ever been opened.
      this._onMouseMove = (e) => {
        if (!this._isDragging) {
          this.checkNodeHover(e.clientX, e.clientY);
          return;
        }
        const dx = e.clientX - this._lastMouseX;
        const dy = e.clientY - this._lastMouseY;
        this._rotY += dx * 0.008;
        this._rotX += dy * 0.008;
        this._rotX = Math.max(-1.5, Math.min(1.5, this._rotX));
        this._lastMouseX = e.clientX;
        this._lastMouseY = e.clientY;
      };
      window.addEventListener('mousemove', this._onMouseMove);

      this._onMouseUp = () => this._isDragging = false;
      window.addEventListener('mouseup', this._onMouseUp);

      this._canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (e.deltaY < 0) this._zoom = Math.min(2.8, this._zoom * 1.08);
        else this._zoom = Math.max(0.4, this._zoom / 1.08);
      }, { passive: false });

      this._canvas.addEventListener('click', (e) => {
        if (this._hoveredNode) {
          this.selectIdeology(this._hoveredNode);
          this.updateIdeologyList();
        }
      });
    }

    // The chart is the left page of a spread now, so it measures the page it
    // sits in rather than the window.
    resizeCanvas() {
      if (!this._canvas) return;
      const frame = this._overlay && this._overlay.querySelector('#pgraph-frame');
      const w = frame && frame.clientWidth ? frame.clientWidth : window.innerWidth;
      const h = frame && frame.clientHeight ? frame.clientHeight : window.innerHeight;
      this._canvas.width = w;
      this._canvas.height = h;
    }

    update() {
      super.update();
      // A focused search field owns the keyboard: neither Cancel nor the ring
      // may read a key while the player is typing into it.
      if (window.MenuSearchBar && window.MenuSearchBar.isTyping()) {
        this.render3D();
        return;
      }
      if (Input.isTriggered('escape') || Input.isTriggered('cancel')) {
        SceneManager.pop();
        return;
      }
      // The ring is read before the camera: a direction moves the cursor over
      // the panel, and Confirm presses whatever it rests on.
      if (window.CCNav && this._overlay) {
        if (window.CCNav._root !== this._overlay) window.CCNav.attach(this, this._overlay, { boards: false });
        if (!window.CCNav.active()) window.CCNav.enter("right");
        if (!window.CCNav.update()) window.CCNav.paint();
      }
      if (this._autoRotate) {
        this._rotY += 0.005;
      }
      this.render3D();
    }

    checkNodeHover(mx, my) {
      if (!this._nodeScreenPositions || !this._canvas) return;
      const rect = this._canvas.getBoundingClientRect();
      mx -= rect.left;
      my -= rect.top;
      let closest = null;
      let minDst = 20;

      this._nodeScreenPositions.forEach(node => {
        const dx = mx - node.sx;
        const dy = my - node.sy;
        const dst = Math.sqrt(dx * dx + dy * dy);
        if (dst < minDst) {
          minDst = dst;
          closest = node.item;
        }
      });

      if (this._hoveredIdeology !== closest) {
        this._hoveredIdeology = closest;
        this._hoveredNode = closest;
        this._canvas.classList.toggle('pgraph-canvas--over', !!closest);
      }
    }

    // 3D Isometric Projection Transformation (Scaled up to render BIGGER!)
    project3D(x, y, z, width, height) {
      const nx = x / 100.0;
      const ny = y / 100.0;
      const nz = z / 100.0;

      const cosY = Math.cos(this._rotY);
      const sinY = Math.sin(this._rotY);
      const x1 = nx * cosY - ny * sinY;
      const y1 = nx * sinY + ny * cosY;
      const z1 = nz;

      const cosX = Math.cos(this._rotX);
      const sinX = Math.sin(this._rotX);
      const y2 = y1 * cosX - z1 * sinX;
      const z2 = y1 * sinX + z1 * cosX;

      const cameraDistance = 3.5;
      // Increased scale factor from 0.28 to 0.46 to render the 3D graph much larger
      const scale = (Math.min(width, height * 1.35) * 0.42 * this._zoom) / (cameraDistance - z2 * 0.35);

      const centerX = width * 0.5;
      const centerY = height * 0.5;

      const sx = centerX + x1 * scale;
      const sy = centerY - y2 * scale;

      return { sx, sy, depth: z2, scale };
    }

    render3D() {
      if (!this._ctx || !this._canvas) return;
      const ctx = this._ctx;
      const w = this._canvas.width;
      const h = this._canvas.height;

      // Dark parchment radial gradient background
      const bgGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, w * 0.1, w * 0.5, h * 0.5, w * 0.85);
      bgGrad.addColorStop(0, '#16120e');
      bgGrad.addColorStop(1, '#0a0806');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      this.render3DCubeWireframe(ctx, w, h);

      this._nodeScreenPositions = [];
      const nodesToRender = [];

      this._filteredIdeologies.forEach(item => {
        const econ = item.axes.econ || 0;
        const auth = item.axes.auth || 0;
        const myst = item.axes.myst !== undefined ? item.axes.myst : (item.axes.esoteric || 0);

        const proj = this.project3D(econ, auth, myst, w, h);
        nodesToRender.push({ item, econ, auth, myst, ...proj });
        this._nodeScreenPositions.push({ item, sx: proj.sx, sy: proj.sy });
      });

      nodesToRender.sort((a, b) => a.depth - b.depth);

      if (this._selectedIdeology) {
        this.renderNodeLasers(ctx, this._selectedIdeology, w, h, true);
      }
      if (this._hoveredIdeology && this._hoveredIdeology !== this._selectedIdeology) {
        this.renderNodeLasers(ctx, this._hoveredIdeology, w, h, false);
      }

      nodesToRender.forEach(node => {
        const isSelected = this._selectedIdeology && this._selectedIdeology.id === node.item.id;
        const isHovered = this._hoveredIdeology && this._hoveredIdeology.id === node.item.id;

        let color = '#ffffff';
        if (node.auth >= 0 && node.econ < 0) color = '#ff5555';
        else if (node.auth >= 0 && node.econ >= 0) color = '#4488ff';
        else if (node.auth < 0 && node.econ < 0) color = '#44cc66';
        else color = '#e6b800';

        // Larger node sizes
        let radius = isSelected ? 12 * (node.scale / 160) : isHovered ? 9 * (node.scale / 160) : 6.5 * (node.scale / 160);
        radius = Math.max(3.5, Math.min(18, radius));

        ctx.beginPath();
        ctx.arc(node.sx, node.sy, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        if (node.myst > 30) {
          ctx.strokeStyle = 'rgba(200, 100, 255, 0.8)';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else if (node.myst < -30) {
          ctx.strokeStyle = 'rgba(0, 240, 255, 0.8)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        if (isSelected || isHovered) {
          ctx.beginPath();
          ctx.arc(node.sx, node.sy, radius + 5, 0, Math.PI * 2);
          ctx.strokeStyle = isSelected ? '#ffffff' : '#f5d061';
          ctx.lineWidth = isSelected ? 2.5 : 1.5;
          ctx.stroke();

          // Larger Node Label Text
          ctx.font = isSelected ? 'bold 15px Georgia, serif' : 'bold 13px sans-serif';
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
          ctx.shadowBlur = 4;
          ctx.fillText(this.getLocalizedName(node.item), node.sx + radius + 8, node.sy + 5);
          ctx.shadowBlur = 0;
        }
      });
    }

    render3DCubeWireframe(ctx, w, h) {
      const b = 100;

      const p1 = this.project3D(-b, -b, -b, w, h);
      const p2 = this.project3D(0, -b, -b, w, h);
      const p3 = this.project3D(b, -b, -b, w, h);
      const p4 = this.project3D(-b, 0, -b, w, h);
      const p5 = this.project3D(0, 0, -b, w, h);
      const p6 = this.project3D(b, 0, -b, w, h);
      const p7 = this.project3D(-b, b, -b, w, h);
      const p8 = this.project3D(0, b, -b, w, h);
      const p9 = this.project3D(b, b, -b, w, h);

      const fillQuad = (pts, color) => {
        ctx.beginPath();
        ctx.moveTo(pts[0].sx, pts[0].sy);
        ctx.lineTo(pts[1].sx, pts[1].sy);
        ctx.lineTo(pts[2].sx, pts[2].sy);
        ctx.lineTo(pts[3].sx, pts[3].sy);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      };

      fillQuad([p4, p5, p8, p7], 'rgba(235, 65, 65, 0.15)');
      fillQuad([p5, p6, p9, p8], 'rgba(65, 135, 235, 0.15)');
      fillQuad([p1, p2, p5, p4], 'rgba(65, 205, 95, 0.15)');
      fillQuad([p2, p3, p6, p5], 'rgba(235, 195, 45, 0.15)');

      const corners = [
        [-b,-b,-b], [b,-b,-b], [b,b,-b], [-b,b,-b],
        [-b,-b, b], [b,-b, b], [b,b, b], [-b,b, b]
      ];
      const projs = corners.map(c => this.project3D(c[0], c[1], c[2], w, h));

      ctx.strokeStyle = 'rgba(218, 165, 32, 0.35)';
      ctx.lineWidth = 1.5;

      const drawLoop = (indices) => {
        ctx.beginPath();
        ctx.moveTo(projs[indices[0]].sx, projs[indices[0]].sy);
        for (let i = 1; i < indices.length; i++) {
          ctx.lineTo(projs[indices[i]].sx, projs[indices[i]].sy);
        }
        ctx.closePath();
        ctx.stroke();
      };

      drawLoop([0,1,2,3]);
      drawLoop([4,5,6,7]);

      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(projs[i].sx, projs[i].sy);
        ctx.lineTo(projs[i+4].sx, projs[i+4].sy);
        ctx.stroke();
      }

      const origin = this.project3D(0, 0, 0, w, h);
      const xAxis = this.project3D(b + 20, 0, 0, w, h);
      const yAxis = this.project3D(0, b + 20, 0, w, h);
      const zAxis = this.project3D(0, 0, b + 20, w, h);

      // Axis Lines & Bigger Labels
      ctx.font = 'bold 15px Georgia, serif';

      ctx.beginPath();
      ctx.moveTo(origin.sx, origin.sy);
      ctx.lineTo(xAxis.sx, xAxis.sy);
      ctx.strokeStyle = '#70b5ff';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = '#70b5ff';
      ctx.fillText(T('PoliticalGraph.canvasAxis.econ'), xAxis.sx + 6, xAxis.sy + 4);

      ctx.beginPath();
      ctx.moveTo(origin.sx, origin.sy);
      ctx.lineTo(yAxis.sx, yAxis.sy);
      ctx.strokeStyle = '#ff9955';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = '#ff9955';
      ctx.fillText(T('PoliticalGraph.canvasAxis.auth'), yAxis.sx + 6, yAxis.sy + 4);

      ctx.beginPath();
      ctx.moveTo(origin.sx, origin.sy);
      ctx.lineTo(zAxis.sx, zAxis.sy);
      ctx.strokeStyle = '#d070ff';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#d070ff';
      ctx.fillText(T('PoliticalGraph.canvasAxis.myst'), zAxis.sx + 6, zAxis.sy + 4);
    }

    renderNodeLasers(ctx, item, w, h, isSelected) {
      const econ = item.axes.econ || 0;
      const auth = item.axes.auth || 0;
      const myst = item.axes.myst !== undefined ? item.axes.myst : (item.axes.esoteric || 0);

      const target = this.project3D(econ, auth, myst, w, h);
      const dropPlane = this.project3D(econ, auth, -100, w, h);
      const axisPoint = this.project3D(0, 0, myst, w, h);

      ctx.save();
      ctx.setLineDash([5, 5]);

      ctx.beginPath();
      ctx.moveTo(target.sx, target.sy);
      ctx.lineTo(dropPlane.sx, dropPlane.sy);
      ctx.strokeStyle = isSelected ? 'rgba(255, 255, 255, 0.85)' : 'rgba(245, 208, 97, 0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(target.sx, target.sy);
      ctx.lineTo(axisPoint.sx, axisPoint.sy);
      ctx.strokeStyle = isSelected ? 'rgba(220, 120, 255, 0.85)' : 'rgba(208, 112, 255, 0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.restore();
    }

    destroy() {
      if (window.CCNav) window.CCNav.detach(this);
      if (this._onResize) window.removeEventListener('resize', this._onResize);
      if (this._onMouseMove) window.removeEventListener('mousemove', this._onMouseMove);
      if (this._onMouseUp) window.removeEventListener('mouseup', this._onMouseUp);
      this._onResize = this._onMouseMove = this._onMouseUp = null;
      if (this._overlay && this._overlay.parentNode) {
        this._overlay.parentNode.removeChild(this._overlay);
      }
      this._canvas = null;
      super.destroy();
    }
  }

  window.Scene_3DPoliticalGraph = Scene_3DPoliticalGraph;

})();
