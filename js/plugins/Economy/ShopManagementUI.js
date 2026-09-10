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
  const _TABS = ['overview', 'staff', 'shelves', 'stock', 'warehouse', 'catalog'];

  // The roster page is the shared two-panel picker (UI/TwoPanelPicker.js): the
  // people who could take a shift on one side, the ones who have on the other,
  // dragged across or moved with the button on the row.
  const _STAFF_PICKER = 'shop-staff';
  // The shelves page is the same widget again: what can go out for sale on one
  // side, what is out for sale on the other.
  const _SHELF_PICKER = 'shop-shelves';

  // The name an item is listed under. Window text is localized on its way to
  // the bitmap, but this book-spread is DOM, which that hook never sees, so
  // every name headed for markup passes through here first.
  const _itemName = (item) =>
    item && item.name && window.translateText ? window.translateText(item.name) : (item && item.name) || '';

  // ── Localisation ──────────────────────────────────────────────────────────
  function _lang() { return (typeof ConfigManager !== 'undefined' && ConfigManager.language === 'it') ? 'it' : 'en'; }

  // Copy lives in js/i18n/<lang>/plugins/ShopManagement.json. Kept behind the
  // original `_T[_lang()]` shape because the call sites bind the result to a
  // local `T`, which would otherwise shadow the global resolver. Those call
  // sites came out of the rewrite in two shapes: `T.back` for a bare key under
  // ShopManagement, and `T('ShopManagement.back')` straight at the resolver, so
  // this stands in for both. The target is a function: a plain object would
  // throw "T is not a function" on the second shape.
  const _shopText = new Proxy(function (key, params) { return T(key, params); }, {
    get: (_, key) => {
      if (typeof key !== 'string') return undefined;
      if (key === 'tabs') {
        return new Proxy({}, { get: (__, tab) => T('ShopManagement.tabs.' + String(tab)) });
      }
      return T('ShopManagement.' + key);
    }
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

      if (s._activeTab === 'overview') {
        s._takeTakings();
        return;
      }

      // The roster and the shelves are the picker's own boards: their rows
      // carry their own buttons, so OK has nothing to confirm there.
      if (s._activeTab === 'staff' || s._activeTab === 'shelves') return;

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

      // Back from the workbench: whatever it made has been shelved, and the
      // bench goes back to filling the party's own bags.
      if (SM.endConsignment) SM.endConsignment();

      this._activeTab    = window._shopMgmtInitTab || 'overview';
      window._shopMgmtInitTab = null;
      this._selectedIndex = 0;
      this._changingSlot  = null;
      // The shelves page fills from the bags first; the wholesaler is a click away.
      this._shelfSource   = 'bag';

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

      // Whatever the shop traded while the party was elsewhere is settled
      // before the book is drawn, so the balance on the page is current.
      if (SM.refreshEconomy) SM.refreshEconomy();

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

      const shopName = shop ? (SM.shopDisplayName ? SM.shopDisplayName(shop) : shop.id) : T.title;
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

      this._el.querySelector('.shop-take-btn')
        ?.addEventListener('mousedown', () => this._takeTakings());

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
      if (window.TwoPanelPicker) {
        if (this._activeTab === 'staff')   window.TwoPanelPicker.mounted(this._el, _STAFF_PICKER);
        if (this._activeTab === 'shelves') window.TwoPanelPicker.mounted(this._el, _SHELF_PICKER);
      }
    }

    _buildLeft(shop, T) {
      if (this._activeTab === 'overview') {
        return `<div class="shop-status-rows">${this._buildStatusRows(shop, T)}</div>`;
      }
      if (this._activeTab === 'staff')   return this._buildStaff(shop, T);
      if (this._activeTab === 'shelves') return this._buildShelves(shop, T);

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

    // Who stands behind the counter, and for which eight hours. A shop the
    // party does not own has a keeper of its own, so there is nothing to roster.
    _buildStaff(shop, T) {
      if (!shop.owned) return `<p class="item-grid-empty">${T('ShopManagement.staff.notOurs')}</p>`;
      if (!window.TwoPanelPicker) return `<p class="item-grid-empty">${T('ShopManagement.staff.title')}</p>`;

      const shopId = shop.id;
      const hours = (entry) => T('ShopManagement.staff.shift', {
        start: entry.shift.start, end: entry.shift.end,
      });
      window.TwoPanelPicker.register({
        id: _STAFF_PICKER,
        title: T('ShopManagement.staff.title'),
        hint:  T('ShopManagement.staff.hint'),
        left: {
          key:   'available',
          title: T('ShopManagement.staff.candidatesTitle'),
          items: () => SM.staffCandidates(SM.getShop(shopId)).map(c => ({
            id:   `${c.kind}:${c.id}`,
            name: c.name,
            sub:  T('ShopManagement.ui.levelAbbr', { level: c.level }),
          })),
        },
        right: {
          key:   'roster',
          title: T('ShopManagement.staff.rosterTitle'),
          max:   SM.MAX_STAFF,
          empty: T('ShopManagement.staff.closed'),
          items: () => SM.staffRoster(shopId).map(entry => ({
            id:   `${entry.kind}:${entry.id}`,
            name: entry.name,
            sub:  hours(entry),
          })),
        },
        move: (rowId, from, to) => {
          const [kind, id] = String(rowId).split(':');
          const result = to === 'roster'
            ? SM.assignStaff(shopId, kind, id)
            : SM.dismissStaff(shopId, kind, id);
          if (!result.ok) {
            return { ok: false, message: result.reason === 'rosterFull'
              ? T('ShopManagement.staff.full') : T('ShopManagement.staff.notOurs') };
          }
          return true;
        },
        onChange: () => this._refreshDOM(),
      });
      return window.TwoPanelPicker.html(_STAFF_PICKER);
    }

    // Filling the shelves by hand. Nobody restocks a shop the party owns, so
    // this is where its stock comes from: the bags they are carrying, or a
    // wholesaler who sells the trade's own goods under the counter price.
    // Anything stocked can always come back off the shelf again.
    _buildShelves(shop, T) {
      if (!shop.owned) return `<p class="item-grid-empty">${T('ShopManagement.shelves.notOurs')}</p>`;
      if (!window.TwoPanelPicker) return `<p class="item-grid-empty">${T('ShopManagement.shelves.title')}</p>`;

      const shopId = shop.id;
      const fromMarket = this._shelfSource === 'market';
      const source = fromMarket
        ? {
            key:   'market',
            title: T('ShopManagement.shelves.marketTitle', { trade: SM.shopTrade(shop) }),
            empty: T('ShopManagement.shelves.marketEmpty'),
            items: () => SM.wholesaleOffers(SM.getShop(shopId)).map(offer => ({
              id:        String(offer.item.id),
              name:      _itemName(offer.item),
              sub:       SM.formatEuroPrice(offer.price),
              iconIndex: offer.item.iconIndex,
            })),
          }
        : {
            key:   'bag',
            title: T('ShopManagement.shelves.bagTitle'),
            empty: T('ShopManagement.shelves.bagEmpty'),
            items: () => SM.stockableItems().map(entry => ({
              id:        String(entry.item.id),
              name:      _itemName(entry.item),
              count:     entry.amount,
              iconIndex: entry.item.iconIndex,
            })),
          };

      window.TwoPanelPicker.register({
        id: _SHELF_PICKER,
        title: T('ShopManagement.shelves.title'),
        hint:  fromMarket
          ? T('ShopManagement.shelves.marketHint')
          : T('ShopManagement.shelves.bagHint'),
        moveLabel: {
          toRight: fromMarket ? T('ShopManagement.shelves.buy') : T('ShopManagement.shelves.shelve'),
          toLeft:  T('ShopManagement.shelves.takeBack'),
        },
        left: source,
        right: {
          key:   'shelf',
          title: T('ShopManagement.shelves.shelfTitle'),
          empty: T('ShopManagement.shelves.shelfEmpty'),
          items: () => {
            const live = SM.getShop(shopId);
            const rows = [];
            for (let slot = 1; slot <= 7; slot++) {
              const row = live.stockInventory[slot];
              if (!row || !row.amount) continue;
              const item = $dataItems[row.itemId];
              if (!item) continue;
              const price = live.menuPrices[row.itemId];
              rows.push({
                id:        String(row.itemId),
                name:      _itemName(item),
                count:     row.amount,
                sub:       price ? SM.formatEuroPrice(price) : '',
                iconIndex: item.iconIndex,
              });
            }
            return rows;
          },
        },
        move: (rowId, from, to, amount) => {
          const itemId = Number(rowId);
          let result;
          if (to === 'shelf') {
            result = from === 'market'
              ? SM.buyStock(shopId, itemId, amount)
              : SM.stockFromBag(shopId, itemId, amount);
          } else if (from === 'shelf' && to === 'market') {
            // The wholesaler does not buy back: the shelf empties into the bags.
            result = SM.pullFromStock(shopId, itemId, amount);
          } else {
            result = SM.pullFromStock(shopId, itemId, amount);
          }
          if (!result.ok) {
            const reason = result.reason === 'shelvesFull' ? 'shelvesFull'
              : result.reason === 'tooDear' ? 'tooDear' : 'refused';
            return { ok: false, message: T('ShopManagement.shelves.' + reason) };
          }
          return true;
        },
        onChange: () => this._refreshDOM(),
      });

      const tab = (key, label) => {
        const on = (this._shelfSource || 'bag') === key ? ' active' : '';
        return `<div class="backpack-tab focusable${on}" tabindex="0"` +
               ` onclick="SceneManager._scene?.setShelfSource?.('${key}')">${label}</div>`;
      };
      return `
        <div class="backpack-tabs shop-shelf-sources">
          ${tab('bag',    T('ShopManagement.shelves.bagTitle'))}
          ${tab('market', T('ShopManagement.shelves.wholesaler'))}
        </div>
        ${window.TwoPanelPicker.html(_SHELF_PICKER)}`;
    }

    // The Thinker's bench, opened for this shop: whatever is fabricated while
    // the consignment is open goes onto the shelves rather than into the bags
    // (ShopManagement.beginConsignment). Coming back out of the bench rebuilds
    // this scene, and that is where the consignment is closed again.
    openShopWorkshop() {
      const shop = SM.getCurrentShop();
      if (!shop || !shop.owned || !window.Scene_Thinker) {
        SoundManager.playBuzzer();
        return;
      }
      SM.beginConsignment(shop.id);
      SoundManager.playOk();
      window._shopMgmtInitTab = 'shelves';
      SceneManager.push(window.Scene_Thinker);
    }

    // Which side the shelves are filled from: the party's bags, or the
    // wholesaler's list.
    setShelfSource(key) {
      if (this._shelfSource === key) return;
      this._shelfSource = key;
      SoundManager.playCursor();
      this._refreshDOM();
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
        html += `<div class="inspect-section-title">${T('ShopManagement.ui.delivery')}</div>
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
      if (this._activeTab === 'shelves') {
        const name  = SM.shopDisplayName ? SM.shopDisplayName(shop) : shop.id;
        const trade = SM.shopTrade(shop);
        const onSale = [];
        for (let slot = 1; slot <= 7; slot++) {
          const row = shop.stockInventory[slot];
          if (!row || !row.amount) continue;
          const item = $dataItems[row.itemId];
          if (item) onSale.push({ item, row });
        }
        const worth = onSale.reduce(
          (sum, e) => sum + (shop.menuPrices[e.row.itemId] || 0) * e.row.amount, 0);
        const rows = onSale.length
          ? onSale.map(e => `
              <div class="inspect-spec-row">
                <span class="inspect-spec-label">${_itemName(e.item)}</span>
                <span class="inspect-spec-value">&times;${e.row.amount}</span>
              </div>`).join('')
          : `<div class="inspect-spec-row">
                <span class="inspect-spec-value">${T('ShopManagement.shelves.shelfEmpty')}</span>
              </div>`;
        return `
          <div class="inspect-header">
            <div class="inspect-title-box">
              <div class="inspect-name">${name}</div>
              <div class="inspect-rarity">${SM.formatEuroPrice(worth)}</div>
            </div>
          </div>
          <div class="inspect-lore">
            <div class="inspect-section-title">${T('ShopManagement.shelves.shelfTitle')}</div>
            ${rows}
            <div class="inspect-spec-row">
              <span class="inspect-spec-label">${T('ShopManagement.category')}</span>
              <span class="inspect-spec-value">${trade}</span>
            </div>
            ${window.ThinkerMenu ? `<div class="command-item focusable" tabindex="0"
                onclick="SceneManager._scene?.openShopWorkshop?.()">${T('ShopManagement.shelves.fabricate')}</div>` : ''}
          </div>`;
      }
      if (this._activeTab === 'staff') {
        const name  = SM.shopDisplayName ? SM.shopDisplayName(shop) : shop.id;
        const staff = shop.owned ? SM.staffRoster(shop.id) : [];
        const hours = staff.length * SM.SHIFT_HOURS;
        const rows  = staff.length
          ? staff.map(entry => `
              <div class="inspect-spec-row">
                <span class="inspect-spec-label">${entry.name}</span>
                <span class="inspect-spec-value">${T('ShopManagement.staff.shift', {
                  start: entry.shift.start, end: entry.shift.end })}</span>
              </div>`).join('')
          : `<div class="inspect-spec-row">
                <span class="inspect-spec-value">${T('ShopManagement.staff.closed')}</span>
              </div>`;
        return `
          <div class="inspect-header">
            <div class="inspect-title-box">
              <div class="inspect-name">${name}</div>
              <div class="inspect-rarity">${T('ShopManagement.staff.coverage', {
                hours: Math.min(24, hours) })}</div>
            </div>
          </div>
          <div class="inspect-lore">
            <div class="inspect-section-title">${T('ShopManagement.staff.rosterTitle')}</div>
            ${rows}
          </div>`;
      }
      if (this._activeTab === 'overview') {
        // Overview's right page is where the shop pays out: the balance the
        // simulation has been building up is drawn into the party's purse.
        const name = SM.shopDisplayName ? SM.shopDisplayName(shop) : shop.id;
        const canTake = (shop.balance || 0) > 0;
        return `
          <div class="inspect-header">
            <div class="inspect-title-box">
              <div class="inspect-name">${name}</div>
              <div class="inspect-rarity">${SM.formatEuroPrice(shop.balance || 0)}</div>
            </div>
          </div>
          <div class="inspect-lore">
            <div class="inspect-section-title">${T('ShopManagement.ui.takings')}</div>
            <p class="inspect-bullet-item">${T('ShopManagement.ui.takingsHint')}</p>
            <div class="inspect-btn${canTake ? '' : ' inspect-btn--secondary'} shop-take-btn">
              ${T('ShopManagement.ui.takeTakings')}
            </div>
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

    // The shop banks its own earnings; this is the counter where the party
    // collects them. The balance is in gold, the same units as the purse.
    _takeTakings() {
      const shop = SM.getCurrentShop();
      if (!shop || (shop.balance || 0) <= 0) { SoundManager.playBuzzer(); return; }
      const amount = Math.floor(shop.balance);
      shop.balance -= amount;
      $gameParty.gainGold(amount);
      SoundManager.playShop();
      window.ParchmentToast?.show?.(
        T('ShopManagement.ui.tookTakings', { amount: SM.formatEuroPrice(amount) }),
        { title: T('ShopManagement.title') }
      );
      this._refreshDOM();
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
