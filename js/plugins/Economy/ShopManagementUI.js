/*:
 * @target MZ
 * @plugindesc Shop Management UI, book-spread HTML overlay
 * @author OmniLex
 * @requires ShopManagement.js
 *
 * @help
 * Provides the HTML book-spread scene for ShopManagement.js.
 * Must be placed AFTER ShopManagement.js in the plugin list.
 *
 * Tabs: Overview | Stock | Warehouse | Catalog
 * Navigation: ↑↓ / WASD move selection; L1/R1 cycle tabs; OK confirm; Esc cancel.
 * Stock tab: press OK on a slot to switch to Catalog and pick a new production item.
 */

(() => {
  'use strict';

  if (!window.ShopManagement) throw new Error('ShopManagementUI.js requires ShopManagement.js!');

  const SM = window.ShopManagement;
  const _TABS = ['overview', 'stock', 'warehouse', 'catalog'];

  // The name an item is listed under. Window text is localized on its way to
  // the bitmap, but this book-spread is DOM, which that hook never sees, so
  // every name headed for markup passes through here first.
  const _itemName = (item) =>
    item && item.name && window.translateText ? window.translateText(item.name) : (item && item.name) || '';

  // ── Localisation ──────────────────────────────────────────────────────────
  function _lang() { return (typeof ConfigManager !== 'undefined' && ConfigManager.language === 'it') ? 'it' : 'en'; }

  // Copy lives in js/i18n/<lang>/plugins/ShopManagement.json. Kept behind the
  // original `_T[_lang()]` shape because the call sites bind the result to a
  // local `T`, which would otherwise shadow the global resolver.
  const _shopText = new Proxy({}, {
    get: (_, key) => (key === 'tabs'
      ? new Proxy({}, { get: (__, tab) => T('ShopManagement.tabs.' + String(tab)) })
      : T('ShopManagement.' + String(key)))
  });
  const _T = new Proxy({}, { get: () => _shopText });

  // ── Input Manager ─────────────────────────────────────────────────────────
  const UIShopInputManager = {
    _scene: null,

    activate(scene) { this._scene = scene; },
    deactivate()    { this._scene = null; },

    update() {
      const s = this._scene;
      if (!s) return;

      // WASD hold-repeat
      for (const dir of ['up', 'down']) {
        if (s._wasdHeld[dir]) {
          s._wasdHoldFrames[dir]++;
          const t = s._wasdHoldFrames[dir];
          if (t > Input.keyRepeatWait && (t - Input.keyRepeatWait) % Input.keyRepeatInterval === 0) {
            s._wasdPending[dir] = true;
          }
        } else {
          s._wasdHoldFrames[dir] = 0;
        }
      }

      const goUp   = Input.isRepeated('up')   || s._wasdPending.up;
      const goDown = Input.isRepeated('down') || s._wasdPending.down;
      s._wasdPending.up = s._wasdPending.down = false;

      // L1 / R1 tab cycling (suppressed during slot-assignment mode)
      if (s._changingSlot === null) {
        if (Input.isTriggered('pageup') || Input.isTriggered('pagedown')) {
          const dir = Input.isTriggered('pageup') ? -1 : 1;
          const cur = _TABS.indexOf(s._activeTab);
          s._activeTab     = _TABS[(cur + dir + _TABS.length) % _TABS.length];
          s._selectedIndex = 0;
          SoundManager.playCursor();
          s._refreshDOM();
          return;
        }
      }

      const total = s._getListItems().length;

      if (goUp && s._selectedIndex > 0) {
        s._selectedIndex--;
        SoundManager.playCursor();
        s._updateHighlight();
      } else if (goDown && s._selectedIndex < total - 1) {
        s._selectedIndex++;
        SoundManager.playCursor();
        s._updateHighlight();
      }

      if (Input.isTriggered('ok'))                              this._handleOk();
      if (Input.isTriggered('escape') || Input.isTriggered('cancel')) this._handleCancel();
    },

    _handleOk() {
      const s = this._scene;
      if (!s) return;
      const shop = SM.getCurrentShop();
      if (!shop) return;

      if (s._changingSlot !== null) {
        // Confirm item assignment to the locked slot
        const items = s._getListItems();
        const item  = items[s._selectedIndex];
        if (item) {
          const slot = s._changingSlot;
          shop.stockInventory[slot] = { itemId: item.id, amount: 0 };
          if (!shop.menuPrices[item.id]) {
            shop.menuPrices[item.id] = Math.floor(item.price * SM.defaultPriceMultiplier);
          }
          SoundManager.playOk();
          s._changingSlot  = null;
          s._activeTab     = 'stock';
          s._selectedIndex = slot - 1;
          s._refreshDOM();
        }
        return;
      }

      if (s._activeTab === 'stock') {
        const items = s._getListItems();
        const slot  = items[s._selectedIndex];
        if (slot) {
          SoundManager.playOk();
          s._changingSlot  = slot.slotIndex;
          s._activeTab     = 'catalog';
          s._selectedIndex = 0;
          s._refreshDOM();
        }
      }
    },

    _handleCancel() {
      const s = this._scene;
      if (!s) return;
      if (s._changingSlot !== null) {
        SoundManager.playCancel();
        s._changingSlot  = null;
        s._activeTab     = 'stock';
        s._selectedIndex = 0;
        s._refreshDOM();
      } else {
        SoundManager.playCancel();
        SceneManager.pop();
      }
    },
  };

  // ── Scene ─────────────────────────────────────────────────────────────────
  class Scene_ShopManagement extends Scene_MenuBase {

    create() {
      super.create();

      this._activeTab    = window._shopMgmtInitTab || 'overview';
      window._shopMgmtInitTab = null;
      this._selectedIndex = 0;
      this._changingSlot  = null;

      this._wasdPending    = { up: false, down: false };
      this._wasdHeld       = { up: false, down: false };
      this._wasdHoldFrames = { up: 0, down: 0 };

      this._onKeyDown = (e) => {
        if (e.repeat) return;
        const k = e.key.toLowerCase();
        if (k === 'w') { this._wasdPending.up   = true; this._wasdHeld.up   = true; e.preventDefault(); }
        if (k === 's') { this._wasdPending.down  = true; this._wasdHeld.down  = true; e.preventDefault(); }
      };
      this._onKeyUp = (e) => {
        const k = e.key.toLowerCase();
        if (k === 'w') { this._wasdHeld.up   = false; this._wasdHoldFrames.up   = 0; }
        if (k === 's') { this._wasdHeld.down  = false; this._wasdHoldFrames.down  = 0; }
      };
      window.addEventListener('keydown', this._onKeyDown);
      window.addEventListener('keyup',   this._onKeyUp);

      this._el = document.createElement('div');
      this._el.id = 'shop-mgmt-container';
      this._el.style.cssText = 'opacity:0;transition:opacity 0.2s ease-out;';
      document.body.appendChild(this._el);

      this._refreshDOM();
      UIShopInputManager.activate(this);
      requestAnimationFrame(() => { if (this._el) this._el.style.opacity = '1'; });
    }

    update() {
      Scene_MenuBase.prototype.update.call(this);
      UIShopInputManager.update();

      // Live-update timer in overview every second; skip the DOM write when the
      // built markup is identical to what is already shown.
      if (this._activeTab === 'overview' && this._el && Graphics.frameCount % 60 === 0) {
        const shop = SM.getCurrentShop();
        const rows = this._el.querySelector('.shop-status-rows');
        if (rows && shop) {
          const html = this._buildStatusRows(shop, _T[_lang()]);
          if (html !== this._lastStatusRowsHTML) {
            this._lastStatusRowsHTML = html;
            rows.innerHTML = html;
          }
        }
      }
    }

    terminate() {
      window.removeEventListener('keydown', this._onKeyDown);
      window.removeEventListener('keyup',   this._onKeyUp);
      UIShopInputManager.deactivate();
      if (this._el) {
        const el = this._el;
        el.style.transition = 'opacity 0.18s ease-out';
        el.style.opacity    = '0';
        el.style.pointerEvents = 'none';
        setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 200);
        this._el = null;
      }
      Scene_MenuBase.prototype.terminate.call(this);
    }

    // ── Data helpers ───────────────────────────────────────────────────────

    _getListItems() {
      const shop = SM.getCurrentShop();
      if (!shop) return [];

      switch (this._activeTab) {
        case 'stock': {
          const out = [];
          for (let i = 1; i <= 7; i++) {
            const s = shop.stockInventory[i];
            out.push(s
              ? { slotIndex: i, id: s.itemId, amount: s.amount, item: $dataItems[s.itemId], isEmpty: false }
              : { slotIndex: i, id: null, amount: 0, item: null, isEmpty: true }
            );
          }
          return out;
        }
        case 'warehouse':
          return Object.entries(shop.warehouseInventory)
            .map(([id, amount]) => ({ id: Number(id), amount, item: $dataItems[Number(id)] }))
            .filter(e => e.item);
        case 'catalog':
          return $dataItems.filter(item => item && SM.isItemInCategory(item, shop.category));
        default:
          return [];
      }
    }

    // ── DOM rendering ──────────────────────────────────────────────────────

    _refreshDOM() {
      if (!this._el) return;
      // Full rebuild replaces .shop-status-rows; drop the per-second dedupe cache.
      this._lastStatusRowsHTML = null;
      const T    = _T[_lang()];
      const shop = SM.getCurrentShop();

      const tabs = _TABS.map(id => {
        const active = this._activeTab === id ? ' active' : '';
        return `<div class="backpack-tab${active}" data-tab="${id}">${T.tabs[id]}</div>`;
      }).join('');

      const banner = this._changingSlot !== null
        ? `<div class="shop-assign-banner">${T.selectProd} ${this._changingSlot}, ${T.escCancel}</div>`
        : '';

      const shopName = shop ? shop.id : T.title;
      const roleBadge = shop ? `<span class="shop-role-badge shop-role-${shop.currentRole.toLowerCase()}">${shop.currentRole}</span>` : '';

      this._el.innerHTML = `
        <div class="book-spread">
          <div class="left-page">
            <div class="page-header-bar">
              <button class="back-button">${T.back}</button>
              <h2 class="title">${shopName}</h2>
              ${roleBadge}
            </div>
            <div class="backpack-tabs">${tabs}</div>
            ${banner}
            <div class="shop-mgmt-list">
              ${shop ? this._buildLeft(shop, T) : `<p class="item-grid-empty">${T.noShop}</p>`}
            </div>
          </div>
          <div class="right-page">
            <div class="item-inspect">
              ${shop ? this._buildRight(shop, T) : ''}
            </div>
          </div>
        </div>`;

      this._el.querySelector('.back-button')
        ?.addEventListener('mousedown', () => { SoundManager.playCancel(); SceneManager.pop(); });

      this._el.querySelectorAll('.backpack-tab').forEach(el => {
        el.addEventListener('mousedown', () => {
          if (this._changingSlot !== null) return;
          const tab = el.dataset.tab;
          if (tab !== this._activeTab) {
            this._activeTab = tab;
            this._selectedIndex = 0;
            SoundManager.playCursor();
            this._refreshDOM();
          }
        });
      });

      this._el.querySelectorAll('.item-slot').forEach((el, i) => {
        el.addEventListener('mouseenter', () => {
          // Hover steers only while the mouse is what is moving: the list
          // scrolls its selection into view, so a pad press slides a different
          // slot under a resting pointer and fires this -- which also meant a
          // cursor SE on every press (PointerSteering, Core/AnalogStickInput.js).
          if (window.PointerSteering && !window.PointerSteering.isSteering()) return;
          if (this._selectedIndex !== i) {
            this._selectedIndex = i;
            SoundManager.playCursor();
            this._updateHighlight();
          }
        });
        el.addEventListener('mousedown', () => UIShopInputManager._handleOk());
      });

      this._drawIcons();
    }

    _buildLeft(shop, T) {
      if (this._activeTab === 'overview') {
        return `<div class="shop-status-rows">${this._buildStatusRows(shop, T)}</div>`;
      }

      const items = this._getListItems();
      if (items.length === 0) return `<p class="item-grid-empty">${T.noShop}</p>`;

      if (this._activeTab === 'stock') {
        return items.map((s, i) => {
          const sel = i === this._selectedIndex ? ' selected' : '';
          if (s.isEmpty) {
            return `<div class="item-slot shop-slot-empty${sel}" data-idx="${i}">
              <div class="item-slot-info">
                <span class="item-slot-name">${s.slotIndex}. ${T.emptySlot}</span>
                <span class="item-slot-meta"><span class="shop-slot-hint">${T('ShopManagement.ui.okAssign')}</span></span>
              </div>
            </div>`;
          }
          const price = shop.menuPrices[s.id];
          return `<div class="item-slot${sel}" data-idx="${i}">
            <div class="item-slot-icon"><canvas data-icon="${s.item.iconIndex}" width="32" height="32"></canvas></div>
            <div class="item-slot-info">
              <span class="item-slot-name">${s.slotIndex}. ${_itemName(s.item)}</span>
              <span class="item-slot-meta">
                <span class="item-slot-count">${s.amount}/${shop.maxItemsPerSlot}</span>
                ${price ? `<span class="item-slot-rarity">${SM.formatEuroPrice(price)}</span>` : ''}
              </span>
            </div>
          </div>`;
        }).join('');
      }

      if (this._activeTab === 'warehouse') {
        return items.map((e, i) => {
          const sel = i === this._selectedIndex ? ' selected' : '';
          return `<div class="item-slot${sel}" data-idx="${i}">
            <div class="item-slot-icon"><canvas data-icon="${e.item.iconIndex}" width="32" height="32"></canvas></div>
            <div class="item-slot-info">
              <span class="item-slot-name">${_itemName(e.item)}</span>
              <span class="item-slot-count">×${e.amount}</span>
            </div>
          </div>`;
        }).join('');
      }

      if (this._activeTab === 'catalog') {
        return items.map((item, i) => {
          const sel = i === this._selectedIndex ? ' selected' : '';
          const price = shop.menuPrices[item.id] || Math.floor(item.price * SM.defaultPriceMultiplier);
          return `<div class="item-slot${sel}" data-idx="${i}">
            <div class="item-slot-icon"><canvas data-icon="${item.iconIndex}" width="32" height="32"></canvas></div>
            <div class="item-slot-info">
              <span class="item-slot-name">${_itemName(item)}</span>
              <span class="item-slot-count">${SM.formatEuroPrice(price)}</span>
            </div>
          </div>`;
        }).join('');
      }

      return '';
    }

    _buildStatusRows(shop, T) {
      const bal        = SM.formatEuroPrice(shop.balance || 0);
      const statusText = shop.isWorking ? T.working : T.offDuty;
      const statusCls  = shop.isWorking ? 'shop-status-on' : 'shop-status-off';

      let html = `
        <div class="inspect-spec-row">
          <span class="inspect-spec-label">${T.role}</span>
          <span class="inspect-spec-value">${shop.currentRole}</span>
        </div>
        <div class="inspect-spec-row">
          <span class="inspect-spec-label">${T.status}</span>
          <span class="inspect-spec-value ${statusCls}">${statusText}</span>
        </div>
        <div class="inspect-spec-row">
          <span class="inspect-spec-label">${T.balance}</span>
          <span class="inspect-spec-value">${bal}</span>
        </div>
        <div class="inspect-spec-row">
          <span class="inspect-spec-label">${T.category}</span>
          <span class="inspect-spec-value">${shop.category}</span>
        </div>`;

      const del = SM.getData().globalData?.currentDelivery;
      if (del) {
        // Same naming as the delivery announcement: the place, not the map file.
        const destName = SM.getMapDisplayName
          ? SM.getMapDisplayName(del.mapId)
          : (($dataMapInfos && $dataMapInfos[del.mapId])
            ? $dataMapInfos[del.mapId].name : T('ShopManagement.mapN', { id: del.mapId }));
        html += `<div class="inspect-section-title">${T.delivery}</div>
          <div class="inspect-spec-row">
            <span class="inspect-spec-label">${T('ShopManagement.ui.destination')}</span>
            <span class="inspect-spec-value">${destName}</span>
          </div>`;
        if ($gameTimer && $gameTimer.isWorking()) {
          const secs = Math.floor($gameTimer.seconds());
          const mm   = String(Math.floor(secs / 60)).padStart(2, '0');
          const ss   = String(secs % 60).padStart(2, '0');
          html += `<div class="inspect-spec-row">
            <span class="inspect-spec-label">${T.timeLeft}</span>
            <span class="inspect-spec-value shop-delivery-timer">${mm}:${ss}</span>
          </div>`;
        }
      }
      return html;
    }

    _buildRight(shop, T) {
      if (this._activeTab === 'overview') {
        return `<div class="item-inspect--empty">
          <div class="inspect-placeholder-icon"></div>
          <p class="inspect-placeholder-text">${shop.id}</p>
        </div>`;
      }

      const items    = this._getListItems();
      const selected = items[this._selectedIndex];

      if (!selected) {
        return `<div class="item-inspect--empty">
          <div class="inspect-placeholder-icon"></div>
          <p class="inspect-placeholder-text">-</p>
        </div>`;
      }

      const item = selected.item || (this._activeTab === 'catalog' ? selected : null);

      if (!item) {
        return `<div class="item-inspect--empty">
          <div class="inspect-placeholder-icon"></div>
          <p class="inspect-placeholder-text">${T.emptySlot}<br><small>${T('ShopManagement.ui.okAssignItem')}</small></p>
        </div>`;
      }

      const recipe  = SM.getRecipe(item);
      const price   = shop.menuPrices[item.id] || Math.floor(item.price * SM.defaultPriceMultiplier);

      let recipeHtml = '';
      if (!recipe) {
        recipeHtml = `<p class="inspect-bullet-item">${T.noRecipe}</p>`;
      } else {
        const canMake  = SM.hasIngredients(recipe, shop);
        const lines    = Object.entries(recipe).map(([matId, need]) => {
          const mat  = $dataItems[Number(matId)];
          const have = shop.warehouseInventory[matId] || 0;
          const ok   = have >= need;
          const cls  = ok ? 'shop-ing-ok' : 'shop-ing-no';
          return `<div class="inspect-spec-row">
            <span class="inspect-spec-label">${mat ? mat.name : T('ShopManagement.itemN', { id: matId })}</span>
            <span class="inspect-spec-value ${cls}">${have}/${need}</span>
          </div>`;
        }).join('');
        const statusCls  = canMake ? 'shop-can-produce' : 'shop-no-mats';
        recipeHtml = lines + `<div class="inspect-spec-row ${statusCls}">${canMake ? T.canProduce : T.noMats}</div>`;
      }

      return `
        <div class="inspect-header">
          <div class="inspect-frame">
            <canvas data-icon="${item.iconIndex}" class="inspect-frame-canvas" width="36" height="36"></canvas>
          </div>
          <div class="inspect-title-box">
            <div class="inspect-name">${_itemName(item)}</div>
            <div class="inspect-rarity">${SM.formatEuroPrice(price)}</div>
          </div>
        </div>
        <div class="inspect-lore">
          <div class="inspect-section-title">${T.recipe}</div>
          ${recipeHtml}
        </div>`;
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    _updateHighlight() {
      if (!this._el) return;
      this._el.querySelectorAll('.item-slot').forEach((el, i) =>
        el.classList.toggle('selected', i === this._selectedIndex));

      const shop = SM.getCurrentShop();
      const T    = _T[_lang()];
      const pane = this._el.querySelector('.item-inspect');
      if (pane && shop) pane.innerHTML = this._buildRight(shop, T);
      this._drawIcons();

      const focused = this._el.querySelector('.item-slot.selected');
      if (focused) focused.scrollIntoView({ block: 'nearest' });
    }

    _drawIcons() {
      if (!this._el) return;
      const bitmap = ImageManager.loadSystem('IconSet');
      const pw = ImageManager.iconWidth;
      const ph = ImageManager.iconHeight;
      this._el.querySelectorAll('canvas[data-icon]').forEach(cv => {
        const idx = Number(cv.dataset.icon);
        if (!idx) return;
        const sx  = (idx % 16) * pw;
        const sy  = Math.floor(idx / 16) * ph;
        const ctx = cv.getContext('2d');
        ctx.clearRect(0, 0, cv.width, cv.height);
        const draw = () => {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(bitmap._canvas || bitmap._image, sx, sy, pw, ph, 0, 0, cv.width, cv.height);
        };
        bitmap.isReady() ? draw() : bitmap.addLoadListener(draw);
      });
    }
  }

  window.Scene_ShopManagement = Scene_ShopManagement;

})();
