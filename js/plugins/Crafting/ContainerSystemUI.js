/*:
 * @target MZ
 * @plugindesc Container System UI v2.1.0
 * @author Omni-Lex
 * @help
 * UI layer for ContainerSystem.js.
 * Requires ContainerSystem.js to be listed and loaded before this plugin.
 */

(() => {
    'use strict';

    // Data references provided by ContainerSystem.js
    const ContainerManager      = window.ContainerManager;
    const ItemUtils             = window.ItemUtils;
    const RARITY_DISPLAY_COLORS = window.RARITY_DISPLAY_COLORS;
    const getText               = window.getContainerText;

    //=============================================================================
    // Scene_Container, compact centered DOM window
    //=============================================================================

    class Scene_Container extends Scene_MenuBase {
        constructor() {
            super();
            this._containerId = null;
            this._isExtradimensional = false;
            this._weightLimit = 0; // grams, 0 = unlimited
        }

        prepare(containerId, isExtradimensional = false, weightLimit = 0) {
            this._containerId = containerId;
            this._isExtradimensional = isExtradimensional;
            this._weightLimit = weightLimit || 0;
        }

        createBackground() {
            this._backgroundSprite = new Sprite(SceneManager.backgroundBitmap());
            this.addChild(this._backgroundSprite);
            this.setBackgroundOpacity(192);
        }

        create() {
            super.create();

            const dummy = new Window_Base(new Rectangle(0, 0, 1, 1));
            dummy.visible = false;
            this.addWindow(dummy);

            this._activeTab          = "container";
            this._activeSection      = "items";
            this._selectedIndex      = 0;
            this._selectedActionIndex = 0;
            this._quantityModalOpen  = false;
            this._quantityValue      = 1;
            this._quantityMax        = 1;
            this._quantityMode       = "store";
            this._quantityItem       = null;
            this._lastGridKey        = "";
            // The shelves are searched and sorted the way the pockets are
            // (ItemSystemInventoryUI.js): a collapsed handle in the corner and
            // the same row of sort tags. Rarity is where the container list has
            // always started, so that is the tag the page opens on.
            this._searchText         = "";
            this._searchOpen         = false;
            this._sortKey            = "rarity";
            this._sortDirection      = "asc";

            this._createDOMOverlay();
        }

        _createDOMOverlay() {
            // Intentionally NOT id="menu-container": that id is styled fullscreen
            // by the parchment theme. This container is a small centered window.
            this._domContainer = document.createElement("div");
            this._domContainer.id = "cs-mini";
            this._domContainer.style.opacity = "0";
            document.body.appendChild(this._domContainer);

            this._refreshDOM();
            UIContainerInputManager.activate(this);

            setTimeout(() => { if (this._domContainer) this._domContainer.style.opacity = "1"; }, 16);
        }

        // --- Data helpers ---

        _getContainerTitle() {
            return this._isExtradimensional ? getText('extradimensionalTitle') : getText('containerTitle');
        }

        _getBackpackItems() {
            return $gameParty.allItems().filter(item =>
                $gameParty.numItems(item) > 0 && ItemUtils.isSelectableItem(item) &&
                !(window.VectorGun && window.VectorGun.isBound(item)));
        }

        _getContainerItems() {
            const container = this._isExtradimensional
                ? ContainerManager.getExtradimensionalContainer()
                : ContainerManager.getContainer(this._containerId);
            const items = [];
            for (const key in container) {
                const item = ItemUtils.decodeKey(key);
                if (item && container[key] > 0 && ItemUtils.isSelectableItem(item)) items.push(item);
            }
            return items;
        }

        // Both shelves are read through the same search and the same sort, so
        // a thing looked up in the backpack is looked up the same way once it
        // is sitting in the chest.
        _getCurrentItems() {
            const items = this._activeTab === "backpack" ? this._getBackpackItems() : this._getContainerItems();
            return this._applyFilterSort(items);
        }

        // The order the container list has always been kept in, richest first.
        _rarityRank(item) {
            const order = ['Legendary', 'Epic', 'Rare', 'Uncommon', 'Common']; // i18n-ignore: rarity tier ids
            const idx   = order.indexOf(ItemUtils.getItemRarity(item).name);
            return idx < 0 ? order.length : idx;
        }

        _applyFilterSort(list) {
            let items = list.slice();
            const query = (this._searchText || "").trim().toLowerCase();
            if (query) items = items.filter(item => String(item.name).toLowerCase().includes(query));

            const key = this._sortKey || "rarity";
            const asc = (this._sortDirection || "asc") === "asc";
            const valueOf = item => {
                if (key === "weight") return this._getItemWeight(item) * this._getItemCount(item);
                if (key === "count")  return this._getItemCount(item);
                if (key === "rarity") return this._rarityRank(item);
                return String(item.name).toLowerCase();
            };
            items.sort((a, b) => {
                const va = valueOf(a), vb = valueOf(b);
                if (va < vb) return asc ? -1 : 1;
                if (va > vb) return asc ? 1 : -1;
                // Everything falls back to the name, so a shelf sorted by
                // weight or by rarity is never in two different orders.
                return String(a.name).localeCompare(String(b.name));
            });
            return items;
        }

        // --- Search and sort ---

        _sortKeys() { return ['rarity', 'name', 'weight', 'count']; }

        _sortTagsHTML() {
            return this._sortKeys().map(key => {
                const active = this._sortKey === key;
                const arrow  = this._sortDirection === 'asc' ? '\u25B2' : '\u25BC';
                const label  = T('Inventory.sort.' + key);
                return `<div class="sort-tag ${active ? 'active' : ''}" onclick="SceneManager._scene.toggleSort('${key}')">${label}${active ? ' ' + arrow : ''}</div>`;
            }).join('');
        }

        // The same collapsed field every other menu wears (UI/MenuSearchBar.js):
        // a handle in the corner of the header, the field itself only once it
        // has been asked for.
        _searchFieldHTML() {
            const open   = !!this._searchOpen || !!this._searchText;
            const handle = window.MenuSearchBar
                ? window.MenuSearchBar.toggleHTML('SceneManager._scene.toggleSearch()', open)
                : '';
            const field = open ? `
                <div class="msb-field">
                  <input type="text" id="cs-search-input" class="backpack-search-input"
                    placeholder="${T('Inventory.searchPlaceholder')}" autocomplete="off"
                    value="${String(this._searchText || '').replace(/"/g, '&quot;')}"
                    oninput="SceneManager._scene.onSearchInput(this.value)"
                    onkeydown="event.stopPropagation(); if(event.key==='Escape'){this.blur();SceneManager._scene.toggleSearch();}"
                    onkeyup="event.stopPropagation();"
                    onkeypress="event.stopPropagation();"/>
                </div>` : '';
            return `<div class="msb msb-field-only${open ? '' : ' msb-collapsed'}" id="cs-search-field">${field}${handle}</div>`;
        }

        toggleSearch() {
            this._searchOpen = !this._searchOpen;
            SoundManager.playCursor();
            // A search put away behind the handle would go on hiding half the
            // shelf with nothing on the page saying so.
            const hadText = !!this._searchText;
            if (!this._searchOpen) this._searchText = "";
            const slot = this._domContainer && this._domContainer.querySelector('#cs-search-field');
            if (slot) slot.outerHTML = this._searchFieldHTML();
            if (this._searchOpen) {
                const input = document.getElementById('cs-search-input');
                if (input) input.focus();
            } else if (hadText) {
                this._selectedIndex = 0;
                this._refreshList();
            }
        }

        // Typing must never tear out the field being typed into, so only the
        // list under it is redrawn.
        onSearchInput(text) {
            this._searchText    = text;
            this._selectedIndex = 0;
            this._refreshList();
        }

        clearSearch() {
            this._searchText    = "";
            this._searchOpen    = false;
            const slot = this._domContainer && this._domContainer.querySelector('#cs-search-field');
            if (slot) slot.outerHTML = this._searchFieldHTML();
            this._selectedIndex = 0;
            this._refreshList();
        }

        toggleSort(key) {
            SoundManager.playOk();
            if (this._sortKey === key) {
                this._sortDirection = this._sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                this._sortKey       = key;
                this._sortDirection = 'asc';
            }
            this._selectedIndex = 0;
            const tags = this._domContainer && this._domContainer.querySelector('.backpack-sort-tags');
            if (tags) tags.innerHTML = this._sortTagsHTML();
            this._refreshList();
        }

        _getItemCount(item) {
            return this._activeTab === "backpack"
                ? $gameParty.numItems(item)
                : ContainerManager.getItemAmount(this._containerId, ItemUtils.encodeKey(item), this._isExtradimensional);
        }

        // --- Weight capacity helpers (grams) ---

        _getItemWeight(item) {
            return (window.ItemSystemUtils && window.ItemSystemUtils.getItemWeight)
                ? window.ItemSystemUtils.getItemWeight(item) : 0;
        }

        _getContainerWeight() {
            const container = this._isExtradimensional
                ? ContainerManager.getExtradimensionalContainer()
                : ContainerManager.getContainer(this._containerId);
            let total = 0;
            for (const key in container) {
                const amount = container[key];
                if (amount > 0) {
                    const item = ItemUtils.decodeKey(key);
                    if (item) total += this._getItemWeight(item) * amount;
                }
            }
            return total;
        }

        _getRemainingCapacity() {
            if (!this._weightLimit) return Infinity;
            return Math.max(0, this._weightLimit - this._getContainerWeight());
        }

        // How many of an item can still fit by weight (Infinity when uncapped).
        _maxStorableByWeight(item) {
            if (!this._weightLimit) return Infinity;
            const w = this._getItemWeight(item);
            if (w <= 0) return Infinity;
            return Math.floor(this._getRemainingCapacity() / w);
        }

        _buildCapacityHTML() {
            if (!this._weightLimit) return "";
            const used    = this._getContainerWeight();
            const usedKg  = (used / 1000).toFixed(1);
            const limitKg = (this._weightLimit / 1000).toFixed(0);
            const pct     = Math.min(100, Math.round(used / this._weightLimit * 100));
            const barColor = pct >= 100 ? "var(--text-text-alt-10)" : pct >= 85 ? "var(--text-text-alt-15)" : "var(--text-cost-ok)";
            return `
                <div class="container-capacity">
                    <div class="container-capacity-row">
                        <span>${getText('capacity')}</span>
                        <span class="container-capacity-text">${usedKg} / ${limitKg} kg</span>
                    </div>
                    <div class="container-capacity-track">
                        <div class="container-capacity-fill" style="height:100%; width:${pct}%; background:${barColor}; transition:width 0.18s ease"></div>
                    </div>
                </div>
            `;
        }

        _updateCapacityDisplay() {
            if (!this._weightLimit || !this._domContainer) return;
            const textEl = this._domContainer.querySelector(".container-capacity-text");
            const fillEl = this._domContainer.querySelector(".container-capacity-fill");
            if (!textEl || !fillEl) return;
            const used    = this._getContainerWeight();
            const usedKg  = (used / 1000).toFixed(1);
            const limitKg = (this._weightLimit / 1000).toFixed(0);
            const pct     = Math.min(100, Math.round(used / this._weightLimit * 100));
            textEl.textContent  = T('Container.weight', { used: usedKg, limit: limitKg });
            fillEl.style.width  = `${pct}%`;
            fillEl.style.background = pct >= 100 ? "var(--text-text-alt-10)" : pct >= 85 ? "var(--text-text-alt-15)" : "var(--text-cost-ok)";
        }

        // Brief red pulse on the capacity bar when a store is rejected for weight.
        _flashCapacity() {
            const barEl = this._domContainer && this._domContainer.querySelector(".container-capacity");
            if (!barEl) return;
            barEl.style.transition = "none";
            barEl.style.filter     = "brightness(1.8) drop-shadow(0 0 4px var(--text-text-alt-10))";
            setTimeout(() => {
                if (barEl) { barEl.style.transition = "filter 0.4s ease"; barEl.style.filter = "none"; }
            }, 40);
        }

        // --- DOM rendering ---

        // The rows of the shelf that is showing, as markup. Pulled out of
        // _refreshDOM so a search keystroke or a sort tag can repaint the list
        // on its own and leave the header, and the field being typed into,
        // standing.
        _buildListHTML() {
            const items = this._getCurrentItems();
            if (this._selectedIndex >= items.length) {
                this._selectedIndex = Math.max(0, items.length - 1);
            }
            if (items.length === 0) {
                // A shelf emptied by the search says so, rather than claiming
                // the chest itself is empty.
                if (String(this._searchText || '').trim()) {
                    return `<div class="cs-empty">${T('Container.empty_search')}</div>`;
                }
                const emptyMsg = this._activeTab === "backpack" ? getText('empty_backpack') : getText('empty_container');
                return `<div class="cs-empty">${emptyMsg}</div>`;
            }
            // A shelf inside a chest is a shelf inside a pocket: the row is
            // the backpack's own (.item-slot), mark, icon, name and a meta
            // line under it, so the two menus read as one. The .cs-row
            // class is kept because every selector in this file, and the
            // hyperdeck's little view, still navigate by it.
            let listHTML = "";
            items.forEach((item, idx) => {
                const count       = this._getItemCount(item);
                const rarityName  = ItemUtils.getItemRarity(item).name;
                const rarityCls   = window.ItemSystemUtils ? window.ItemSystemUtils.rarityClass(rarityName) : "rarity--common";
                const canvasId    = `cs-ic-${idx}`;
                const weightG     = (window.ItemSystemUtils && window.ItemSystemUtils.getItemWeight
                    ? window.ItemSystemUtils.getItemWeight(item) : 0) * count;
                const weightKg    = weightG / 1000;
                const weightText  = weightKg >= 0.01 ? `${weightKg.toFixed(2)} kg` : `${weightG} g` /* i18n-ignore: unit */;
                listHTML += `
                    <div class="item-slot cs-row ${idx === this._selectedIndex ? "selected" : ""}" data-icon-index="${item.iconIndex}" data-canvas-id="${canvasId}" onclick="SceneManager._scene.selectItem(${idx})">
                        <div class="item-rarity-bar cs-rarity-bar ${rarityCls}" title="${rarityName}"></div>
                        <div class="item-slot-icon">
                            <canvas id="${canvasId}" width="32" height="32" class="cs-ic item-slot-icon-canvas--sm"></canvas>
                        </div>
                        <div class="item-slot-info">
                            <div class="item-slot-name cs-name">${item.name}</div>
                            <div class="item-slot-meta">
                                <span>${weightText}</span>
                                <span class="item-slot-count cs-count">x${count}</span>
                            </div>
                        </div>
                    </div>`;
            });
            return listHTML;
        }

        // Only the shelf, keeping the header and the search field in place.
        _refreshList() {
            if (!this._domContainer) return;
            const listEl = this._domContainer.querySelector("#cs-list");
            if (!listEl) { this._refreshDOM(); return; }
            listEl.innerHTML = this._buildListHTML();
            this._setupLazyLoading();
            const sel = this._domContainer.querySelector(".cs-row.selected");
            if (sel) sel.scrollIntoView({ block: "nearest" });
        }

        _refreshDOM() {
            if (!this._domContainer) return;

            const title = this._getContainerTitle();
            const tabs = [
                { key: "container", label: getText('container') },
                { key: "backpack",  label: getText('backpack')  }
            ];
            const tabsHTML = tabs.map(tab =>
                `<div class="cs-tab ${this._activeTab === tab.key ? "active" : ""}" onclick="SceneManager._scene.setActiveTab('${tab.key}')">${tab.label}</div>`
            ).join("");

            const listHTML = this._buildListHTML();

            this._domContainer.innerHTML = `
                <div class="cs-head page-header-bar">
                    <div class="back-button focusable" onclick="SceneManager._scene.handleBack()">${T('Container.backBtn')}</div>
                    <span class="cs-title title">${title}</span>
                    ${this._searchFieldHTML()}
                </div>
                <div class="cs-tabs">${tabsHTML}</div>
                <div class="backpack-search cs-search">
                    <div class="backpack-sort-tags">${this._sortTagsHTML()}</div>
                </div>
                ${this._buildCapacityHTML()}
                <div class="cs-list" id="cs-list">${listHTML}</div>
            `;

            this._setupLazyLoading();
            this._updateCapacityDisplay();

            const sel = this._domContainer.querySelector(".cs-row.selected");
            if (sel) sel.scrollIntoView({ block: "nearest" });
        }

        _updateSelectionHighlight() {
            if (!this._domContainer) return;
            this._domContainer.querySelectorAll("#cs-list .cs-row").forEach((row, idx) => {
                row.classList.toggle("selected", idx === this._selectedIndex);
            });
            const sel = this._domContainer.querySelector(".cs-row.selected");
            if (sel) sel.scrollIntoView({ block: "nearest" });
        }

        _setupLazyLoading() {
            const listEl = this._domContainer && this._domContainer.querySelector("#cs-list");
            if (!listEl) return;
            const rows = listEl.querySelectorAll(".cs-row");

            if (typeof IntersectionObserver === "undefined") {
                rows.forEach(row => {
                    this._drawIcon(parseInt(row.getAttribute("data-icon-index"), 10), row.getAttribute("data-canvas-id"));
                });
                return;
            }

            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const row = entry.target;
                        this._drawIcon(parseInt(row.getAttribute("data-icon-index"), 10), row.getAttribute("data-canvas-id"));
                        observer.unobserve(row);
                    }
                });
            }, { root: listEl, rootMargin: "60px" });

            rows.forEach(row => observer.observe(row));
        }

        _drawIcon(iconIndex, canvasId) {
            const canvas = document.getElementById(canvasId);
            if (!canvas) return;
            const bitmap = ImageManager.loadSystem("IconSet");
            const draw = () => {
                const ctx = canvas.getContext('2d');
                if (!ctx) return;
                ctx.clearRect(0, 0, 32, 32);
                ctx.imageSmoothingEnabled = false;
                const pw = 32, ph = 32;
                ctx.drawImage(bitmap.canvas, (iconIndex % 16) * pw, Math.floor(iconIndex / 16) * ph, pw, ph, 0, 0, 32, 32);
            };
            if (bitmap.isReady()) draw();
            else bitmap.addLoadListener(draw);
        }

        // --- Public interaction methods ---

        setActiveTab(tab) {
            SoundManager.playCursor();
            this._activeTab     = tab;
            this._selectedIndex = 0;
            this._activeSection = "items";
            this._refreshDOM();
        }

        selectItem(idx) {
            SoundManager.playCursor();
            this._selectedIndex = idx;
            this._activeSection = "items";
            this._refreshDOM();
            const action = this._activeTab === "backpack" ? "store" : "retrieve";
            this.triggerAction(action);
        }

        triggerAction(action) {
            if (action === "exit") {
                SoundManager.playCancel();
                this.popScene();
                return;
            }

            const items = this._getCurrentItems();
            const item  = items[this._selectedIndex];
            if (!item) return;

            if (action === "store") {
                // Em's vector gun is never left in a chest (VectorGunSystem.js).
                if (window.VectorGun && window.VectorGun.isBound(item)) { SoundManager.playBuzzer(); return; }
                const have = $gameParty.numItems(item);
                if (have <= 0) { SoundManager.playBuzzer(); return; }
                const fit = this._maxStorableByWeight(item);
                if (fit < 1) { SoundManager.playBuzzer(); this._flashCapacity(); return; }
                const max = Math.min(have, fit);
                if (max === 1) {
                    SoundManager.playOk();
                    $gameParty.loseItem(item, 1);
                    ContainerManager.addItem(this._containerId, ItemUtils.encodeKey(item), 1, this._isExtradimensional);
                    this._selectedIndex = 0;
                    this._activeSection = "items";
                    this._refreshDOM();
                } else {
                    this._openQuantityModal(item, max, "store");
                }
            } else if (action === "retrieve") {
                // Retrieve is always a single-click grab of 1: no quantity prompt.
                const max = ContainerManager.getItemAmount(this._containerId, ItemUtils.encodeKey(item), this._isExtradimensional);
                if (max <= 0) { SoundManager.playBuzzer(); return; }
                SoundManager.playOk();
                $gameParty.gainItem(item, 1);
                ContainerManager.removeItem(this._containerId, ItemUtils.encodeKey(item), 1, this._isExtradimensional);
                // Inside a building the player does not own this is a theft.
                ContainerManager.reportTheft(this._containerId, item, 1, this._isExtradimensional);
                this._activeSection = "items";
                this._refreshDOM();
            }
        }

        _openQuantityModal(item, max, mode) {
            this._quantityModalOpen = true;
            this._quantityItem      = item;
            this._quantityMax       = max;
            this._quantityValue     = 1;
            this._quantityMode      = mode;

            const modeLabel = mode === "store" ? getText('store') : getText('retrieve');

            const el = document.createElement("div");
            el.id        = "cs-qty";
            el.className = "cs-qty-overlay";
            el.innerHTML = `
                <div class="cs-qty-box">
                    <div class="cs-qty-title">${modeLabel}: ${item.name}</div>
                    <div class="cs-qty-val"><strong id="cs-qty-value">${this._quantityValue}</strong> / ${max}</div>
                    <div class="cs-qty-hint">${getText('quantity_hint')}</div>
                    <div class="cs-qty-btns">
                        <div class="cs-qty-btn selected" onclick="SceneManager._scene.confirmQuantity()">${modeLabel}</div>
                        <div class="cs-qty-btn" onclick="SceneManager._scene.cancelQuantity()">${getText('cancel')}</div>
                    </div>
                </div>
            `;
            this._domContainer.appendChild(el);
        }

        confirmQuantity() {
            const item = this._quantityItem;
            const qty  = this._quantityValue;
            SoundManager.playOk();
            if (this._quantityMode === "store") {
                $gameParty.loseItem(item, qty);
                ContainerManager.addItem(this._containerId, ItemUtils.encodeKey(item), qty, this._isExtradimensional);
            } else {
                $gameParty.gainItem(item, qty);
                ContainerManager.removeItem(this._containerId, ItemUtils.encodeKey(item), qty, this._isExtradimensional);
                ContainerManager.reportTheft(this._containerId, item, qty, this._isExtradimensional);
            }
            this._selectedIndex = 0;
            this._activeSection = "items";
            this._closeQuantityModal();
        }

        cancelQuantity() {
            SoundManager.playCancel();
            this._closeQuantityModal();
        }

        _closeQuantityModal() {
            this._quantityModalOpen = false;
            this._quantityItem      = null;
            const modal = document.getElementById("cs-qty");
            if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
            this._refreshDOM();
        }

        handleBack() {
            SoundManager.playCancel();
            this.popScene();
        }

        update() {
            super.update();
            UIContainerInputManager.update();
        }

        terminate() {
            if (this._backgroundSprite) this._backgroundSprite.filters = [];
            super.terminate();
            UIContainerInputManager.deactivate();

            if (this._domContainer) {
                const container = this._domContainer;
                container.style.transition    = "opacity 0.2s ease-out";
                container.style.opacity       = "0";
                container.style.pointerEvents = "none";
                setTimeout(() => { if (container && container.parentNode) container.parentNode.removeChild(container); }, 200);
                this._domContainer = null;
            }
        }
    }

    window.Scene_Container = Scene_Container;

    //=============================================================================
    // UIContainerInputManager
    //=============================================================================

    const UIContainerInputManager = {
        _scene:  null,
        _active: false,

        activate(scene) { this._scene = scene; this._active = true; },
        deactivate()    { this._active = false; this._scene = null; },

        update() {
            if (!this._active || !this._scene) return;
            const scene = this._scene;

            // A search being typed into owns the keyboard: the cursor must not
            // walk the shelf on every letter of a word.
            if (window.MenuSearchBar && window.MenuSearchBar.isTyping()) return;

            if (scene._quantityModalOpen) {
                if      (Input.isRepeated('right')) this._qtyAdjust(scene, +1);
                else if (Input.isRepeated('left'))  this._qtyAdjust(scene, -1);
                else if (Input.isRepeated('up'))    this._qtyAdjust(scene, +10);
                else if (Input.isRepeated('down'))  this._qtyAdjust(scene, -10);
                else if (Input.isTriggered('ok'))   scene.confirmQuantity();
                else if (Input.isTriggered('escape') || Input.isTriggered('cancel')) scene.cancelQuantity();
                return;
            }

            // Left/Right (and L1/R1) switch tabs; Up/Down move within the list.
            if (Input.isTriggered('pageup') || Input.isTriggered('left')) {
                this._switchTab(scene, -1);
            } else if (Input.isTriggered('pagedown') || Input.isTriggered('right')) {
                this._switchTab(scene, +1);
            } else if (Input.isRepeated('up')) {
                this._move(scene, -1);
            } else if (Input.isRepeated('down')) {
                this._move(scene, +1);
            } else if (Input.isTriggered('ok')) {
                this._ok(scene);
            } else if (Input.isTriggered('shift')) {
                this._cycleSort(scene);
            } else if (Input.isTriggered('tab')) {
                // Keyboard only, and deliberately: a pad cannot type a query in
                // anyway, and the sort tags above are the reordering a pad has.
                scene.toggleSearch();
            } else if (Input.isTriggered('escape') || Input.isTriggered('cancel') || TouchInput.isCancelled()) {
                // Backing out of a search puts the field away and gives the
                // whole shelf back before it closes the chest.
                if (scene._searchText || scene._searchOpen) {
                    SoundManager.playCancel();
                    scene.clearSearch();
                    return;
                }
                scene.handleBack();
            }
        },

        _qtyAdjust(scene, delta) {
            const next = Math.max(1, Math.min(scene._quantityMax, scene._quantityValue + delta));
            if (next !== scene._quantityValue) {
                SoundManager.playCursor();
                scene._quantityValue = next;
                const el = document.getElementById("cs-qty-value");
                if (el) el.textContent = next;
            }
        },

        // The sort tags, walked rather than clicked. One press does exactly what
        // one click on the strip does: it turns the tag the shelf is sorted by
        // over, and once it is turned over it moves on to the next tag. So
        // every tag and both of its directions are reachable without a mouse.
        _cycleSort(scene) {
            const keys = scene._sortKeys();
            const idx  = Math.max(0, keys.indexOf(scene._sortKey));
            const next = scene._sortDirection === 'asc'
                ? scene._sortKey                       // turn this one over
                : keys[(idx + 1) % keys.length];       // and then move along
            scene.toggleSort(next);
        },

        _switchTab(scene, dir) {
            const tabs = ['container', 'backpack'];
            const cur  = tabs.indexOf(scene._activeTab);
            scene.setActiveTab(tabs[(cur + dir + tabs.length) % tabs.length]);
        },

        _move(scene, dir) {
            const total = scene._getCurrentItems().length;
            if (total === 0) return;
            const idx = Math.max(0, Math.min(total - 1, scene._selectedIndex + dir));
            if (idx !== scene._selectedIndex) {
                SoundManager.playCursor();
                scene._selectedIndex = idx;
                scene._updateSelectionHighlight();
            }
        },

        _ok(scene) {
            const items = scene._getCurrentItems();
            if (items[scene._selectedIndex]) {
                const action = scene._activeTab === "backpack" ? "store" : "retrieve";
                scene.triggerAction(action);
            }
        }
    };

    //=============================================================================
    // Body Part Harvest helpers
    //=============================================================================

    function _harvestMedianStat(prop) {
        const vals = $gameParty.members().map(a => a[prop]).sort((a, b) => a - b);
        const m    = Math.floor(vals.length / 2);
        return vals.length % 2 ? vals[m] : Math.round((vals[m - 1] + vals[m]) / 2);
    }

    function _hasSurgicalTools() {
        return $dataItems[244] && $gameParty.numItems($dataItems[244]) > 0;
    }

    function _cutSuccessRate(enemyDef) {
        if (_hasSurgicalTools()) return 100;
        const atk = _harvestMedianStat('atk');
        return Math.min(95, Math.max(5, Math.round(atk / (atk + enemyDef) * 200)));
    }

    function _surgerySuccessRate(enemyDef, part) {
        const healthRatio = part.maxHp > 0 ? part.currentHp / part.maxHp : 0;
        const mat = _harvestMedianStat('mat');
        const agi = _harvestMedianStat('agi');
        return Math.min(90, Math.max(5,
            Math.round((mat + agi) / Math.max(1, enemyDef * 2) * 100 * healthRatio)
        ));
    }

    // `state` is the id the panel branches on; label and actionLabel are read
    // from Container.harvest.* so they follow the language.
    function _classifyPart(partDef, savedPart, enemyDef, harvestedParts, partKey) {
        const L = (k) => T('Container.harvest.' + k);
        if (harvestedParts && harvestedParts[partKey]) {
            return { state: 'done',    label: L('collected'), color: 'var(--text-disabled)', rate: null, actionLabel: null,          canAct: false };
        }
        const destroyed  = savedPart ? savedPart.destroyed : false;
        const canCutoff  = !!partDef.canCutoff;
        if (canCutoff && destroyed) {
            return { state: 'pickup',  label: L('ready'),     color: 'var(--text-cost-ok)', rate: 100,  actionLabel: L('pickUp'),   canAct: true };
        }
        if (canCutoff && !destroyed) {
            const rate = _cutSuccessRate(enemyDef);
            return { state: 'cut',     label: L('cut'),       color: 'var(--text-text-alt-15)', rate,       actionLabel: L('cutOff'),   canAct: true };
        }
        if (!canCutoff && !destroyed) {
            const rate = _surgerySuccessRate(enemyDef, savedPart || { currentHp: 1, maxHp: 1 });
            return { state: 'surgery', label: L('surgery'),   color: 'var(--text-text-alt-16)', rate,       actionLabel: L('extract'),  canAct: true };
        }
        return { state: 'ruined',  label: L('ruined'),    color: 'var(--text-text-alt-10)', rate: null, actionLabel: null,          canAct: false };
    }

    //=============================================================================
    // Scene_BodyPartHarvest
    //=============================================================================

    class Scene_BodyPartHarvest extends Scene_MenuBase {
        constructor() {
            super();
            this._corpse = null;
        }

        prepare(corpse) {
            this._corpse = corpse || null;
        }

        // The scene can be reached without a prepared corpse when a battle
        // starts while the harvest scene is being pushed: the encounter takes
        // over the pending scene and the arguments are lost. Recover the corpse
        // the player is standing on or facing, and bail out cleanly if there is
        // none left to search.
        _recoverCorpse() {
            const corpses = (window.BSE && window.BSE.mapCorpses) || [];
            if (!$gameMap || !$gamePlayer) return null;
            const mapId = $gameMap.mapId();
            const here = corpses.filter(c => c && c.mapId === mapId);
            const x2 = $gameMap.roundXWithDirection($gamePlayer.x, $gamePlayer.direction());
            const y2 = $gameMap.roundYWithDirection($gamePlayer.y, $gamePlayer.direction());
            return here.find(c => c.x === $gamePlayer.x && c.y === $gamePlayer.y)
                || here.find(c => c.x === x2 && c.y === y2)
                || null;
        }

        createBackground() {
            this._backgroundSprite = new Sprite(SceneManager.backgroundBitmap());
            this.addChild(this._backgroundSprite);
            this.setBackgroundOpacity(192);
        }

        create() {
            super.create();
            if (!this._corpse) this._corpse = this._recoverCorpse();
            if (!this._corpse) {
                this._corpse = { _harvestedParts: {} };
                this._partKeys = [];
                this._aborted  = true;
                SceneManager.pop();
                return;
            }
            const dummy = new Window_Base(new Rectangle(0, 0, 1, 1));
            dummy.visible = false;
            this.addWindow(dummy);

            this._selectedIndex  = 0;
            this._activeSection  = 'items';
            this._partKeys       = [];
            this._domContainer   = null;

            this._buildPartKeys();
            this._createDOMOverlay();
        }

        _buildPartKeys() {
            const bse    = window.BSE;
            const corpse = this._corpse;
            if (!corpse || !corpse.enemyId) { this._partKeys = []; return; }
            const pd = bse && bse.enemyPartDamage[corpse.enemyId];
            let archetypeName = pd && pd.archetypeName;
            if (!archetypeName) {
                const enemyData = $dataEnemies[corpse.enemyId];
                const m = enemyData && enemyData.note && enemyData.note.match(/<Archetype:\s*(.+?)>/i);
                archetypeName = m ? m[1].trim() : null;
            }
            const archetype = archetypeName && window.Health && window.Health.Archetypes
                ? window.Health.Archetypes[archetypeName] : null;
            if (!archetype) { this._partKeys = []; return; }
            this._archetypeName = archetypeName;
            this._archetype     = archetype;
            this._savedParts    = pd ? pd.parts : {};
            const enemyData     = $dataEnemies[corpse.enemyId];
            this._enemyDef      = (pd && pd.def != null) ? pd.def : (enemyData ? enemyData.params[3] : 0);
            this._partKeys      = Object.keys(archetype.parts);
        }

        _getEnemyName() {
            const corpse = this._corpse;
            if (!corpse || !corpse.enemyId) return T('Container.harvest.unknownEnemy');
            const e = $dataEnemies[corpse.enemyId];
            return e ? e.name : T('Container.harvest.unknownEnemy');
        }

        _createDOMOverlay() {
            this._actionIndex = 0;
            this._actions     = [];
            this._domContainer = document.createElement('div');
            this._domContainer.id = 'hv-mini';
            this._domContainer.style.opacity = '0';
            document.body.appendChild(this._domContainer);
            this._refreshDOM();
            UIHarvestInputManager.activate(this);
            setTimeout(() => { if (this._domContainer) this._domContainer.style.opacity = '1'; }, 16);
        }

        _refreshDOM() {
            if (!this._domContainer) return;
            if (this._actionIndex == null) this._actionIndex = 0;
            const harvestedParts = (this._corpse && this._corpse._harvestedParts) || {};
            const enemyName      = this._getEnemyName();

            if (this._selectedIndex >= this._partKeys.length) {
                this._selectedIndex = Math.max(0, this._partKeys.length - 1);
            }

            let rowsHTML = '';
            if (!this._partKeys.length) {
                rowsHTML = `<div class="cs-empty">${T('Container.harvest.noParts')}</div>`;
            } else {
                this._partKeys.forEach((key, idx) => {
                    const partDef   = this._archetype.parts[key];
                    const savedPart = this._savedParts[key];
                    const cl        = _classifyPart(partDef, savedPart, this._enemyDef, harvestedParts, key);
                    const item      = $dataItems[partDef.itemId];
                    const itemName  = item ? item.name : key;
                    const rateText  = cl.rate !== null ? `${cl.rate}%` : '-';
                    const inactive  = (cl.state === 'ruined' || cl.state === 'done') ? 'inactive' : '';

                    rowsHTML += `
                        <div class="cs-row ${idx === this._selectedIndex ? 'selected' : ''} ${inactive}"
                             onclick="SceneManager._scene && SceneManager._scene.onPartClick(${idx})">
                            <canvas id="hv-ic-${idx}" width="36" height="36" class="cs-ic"></canvas>
                            <span class="cs-name">${itemName}</span>
                            <span class="cs-status" style="color:${cl.color}">${cl.label}</span>
                            <span class="cs-rate">${rateText}</span>
                        </div>`;
                });
            }

            const selectedKey = this._partKeys[this._selectedIndex];
            this._actions = this._buildActions(selectedKey);
            if (this._actionIndex >= this._actions.length) this._actionIndex = Math.max(0, this._actions.length - 1);

            this._domContainer.innerHTML = `
                <div class="cs-head page-header-bar">
                    <div class="back-button focusable" onclick="SceneManager._scene && SceneManager._scene.handleBack()">${T('Container.backBtn')}</div>
                    <span class="cs-title title">${T('Container.harvest.examineTitle', { name: enemyName })}</span>
                </div>
                <div class="cs-list" id="hv-list">${rowsHTML}</div>
                <div class="cs-actbar" id="hv-actbar">${this._buildActionButtons(selectedKey)}</div>`;

            this._setupIcons();
            const sel = this._domContainer.querySelector('.cs-row.selected');
            if (sel) sel.scrollIntoView({ block: 'nearest' });
        }

        _updateSelectionHighlight() {
            if (!this._domContainer) return;
            this._domContainer.querySelectorAll('#hv-list .cs-row').forEach((row, idx) => {
                row.classList.toggle('selected', idx === this._selectedIndex);
            });
            const key = this._partKeys[this._selectedIndex];
            this._actions = this._buildActions(key);
            if (this._actionIndex >= this._actions.length) this._actionIndex = Math.max(0, this._actions.length - 1);
            this._updateActionBar();
            const sel = this._domContainer.querySelector('.cs-row.selected');
            if (sel) sel.scrollIntoView({ block: 'nearest' });
        }

        // Parts that can still be butchered right now, in list order.
        _butcherableKeys() {
            const harvestedParts = (this._corpse && this._corpse._harvestedParts) || {};
            return this._partKeys.filter(key => {
                const partDef = this._archetype.parts[key];
                const cl = _classifyPart(partDef, this._savedParts[key], this._enemyDef, harvestedParts, key);
                if (!cl.canAct) return false;
                if (cl.state === 'surgery' && !_hasSurgicalTools()) return false;
                return !!$dataItems[partDef.itemId];
            });
        }

        // Focusable actions for the selected part (Butcher All and Leave are
        // corpse-wide, so they stay available whatever the selection is).
        _buildActions(selectedKey) {
            const actions = [];
            if (!selectedKey) {
                actions.push({ type: 'bury', label: T('Container.harvest.bury'), danger: false });
                actions.push({ type: 'leave', label: T('Container.harvest.leave'), danger: true });
                return actions;
            }
            const partDef   = this._archetype.parts[selectedKey];
            const savedPart = this._savedParts[selectedKey];
            const cl        = _classifyPart(partDef, savedPart, this._enemyDef, (this._corpse && this._corpse._harvestedParts) || {}, selectedKey);
            const actionable = cl.canAct && !(cl.state === 'surgery' && !_hasSurgicalTools());
            if (actionable) {
                actions.push({ type: 'harvest', label: `${cl.actionLabel} (${cl.rate}%)`, danger: false });
                const ratio      = savedPart && savedPart.maxHp > 0 ? savedPart.currentHp / savedPart.maxHp : 1;
                const butcherAmt = Math.max(1, Math.ceil(ratio * (partDef.hpPercent / 10)));
                actions.push({ type: 'butcher', label: T('Container.harvest.butcher', { n: butcherAmt }), danger: false });
            }
            const remaining = this._butcherableKeys().length;
            if (remaining > 1) {
                actions.push({ type: 'butcherAll', label: T('Container.harvest.butcherAll', { n: remaining }), danger: false });
            }
            // Burying is corpse-wide and always offered: whatever is left of the
            // body goes into the ground and off the map with it.
            actions.push({ type: 'bury', label: T('Container.harvest.bury'), danger: false });
            actions.push({ type: 'leave', label: T('Container.harvest.leave'), danger: true });
            return actions;
        }

        _buildActionButtons(selectedKey) {
            if (!selectedKey) {
                return this._actions.map((a, i) => {
                    const focused = this._activeSection === 'actions' && this._actionIndex === i;
                    const handler = a.type === 'bury' ? 'executeBury()' : 'handleBack()'; // i18n-ignore: inline handler body
                    return `<div class="cs-actbtn ${a.danger ? 'danger' : ''} ${focused ? 'selected' : ''}"
                        onclick="SceneManager._scene && SceneManager._scene.${handler}">${a.label}</div>`;
                }).join('');
            }
            const partDef   = this._archetype.parts[selectedKey];
            const savedPart = this._savedParts[selectedKey];
            const cl        = _classifyPart(partDef, savedPart, this._enemyDef, (this._corpse && this._corpse._harvestedParts) || {}, selectedKey);

            let html = '';
            if (!cl.canAct) {
                const note = cl.state === 'done' ? T('Container.harvest.alreadyCollected')
                    : cl.state === 'ruined' ? T('Container.harvest.partDestroyed') : cl.label;
                html += `<div class="cs-actbtn disabled">${note}</div>`;
            } else if (cl.state === 'surgery' && !_hasSurgicalTools()) {
                html += `<div class="cs-actbtn disabled danger">${T('Container.harvest.needTools')}</div>`;
            }

            this._actions.forEach((a, i) => {
                const focused = this._activeSection === 'actions' && this._actionIndex === i;
                const handler = a.type === 'harvest' ? `executeHarvest('${selectedKey}')` // i18n-ignore: inline handler body
                              : a.type === 'butcher' ? `executeButcher('${selectedKey}')` // i18n-ignore: inline handler body
                              : a.type === 'butcherAll' ? 'executeButcherAll()' // i18n-ignore: inline handler body
                              : a.type === 'bury' ? 'executeBury()' // i18n-ignore: inline handler body
                              : 'handleBack()';
                html += `<div class="cs-actbtn ${a.danger ? 'danger' : ''} ${focused ? 'selected' : ''}"
                    onclick="SceneManager._scene && SceneManager._scene.${handler}">${a.label}</div>`;
            });
            return html;
        }

        _updateActionBar() {
            const bar = this._domContainer && this._domContainer.querySelector('#hv-actbar');
            if (!bar) return;
            const selectedKey = this._partKeys[this._selectedIndex];
            const actionsKey = (selectedKey || '') + ':' + (this._actions || []).map(a => a.type).join(',');
            if (bar._actionsKey === actionsKey) {
                const actButtons = bar.querySelectorAll('.cs-actbtn:not(.disabled)');
                actButtons.forEach((btn, i) => {
                    const focused = this._activeSection === 'actions' && this._actionIndex === i;
                    btn.classList.toggle('selected', focused);
                });
                return;
            }
            bar._actionsKey = actionsKey;
            bar.innerHTML = this._buildActionButtons(selectedKey);
        }

        _enterActions() {
            const key = this._partKeys[this._selectedIndex];
            this._actions = this._buildActions(key);
            if (!this._actions.length) return;
            SoundManager.playOk();
            this._activeSection = 'actions';
            this._actionIndex   = 0;
            this._updateActionBar();
        }

        _execAction() {
            const key = this._partKeys[this._selectedIndex];
            const a   = (this._actions || [])[this._actionIndex];
            if (!a) return;
            // Bury and Leave are about the whole body, so neither needs a part
            // under the cursor: a corpse with nothing left to take still buries.
            if (a.type === 'bury')  { this.executeBury(); return; }
            if (a.type === 'leave') { this.handleBack(); return; }
            if (!key) return;
            if (a.type === 'harvest')         this.executeHarvest(key);
            else if (a.type === 'butcher')    this.executeButcher(key);
            else if (a.type === 'butcherAll') this.executeButcherAll();
            else if (a.type === 'bury')       this.executeBury();
            else                              this.handleBack();
        }

        _setupIcons() {
            const draw = (iconIndex, canvasId) => {
                const canvas = document.getElementById(canvasId);
                if (!canvas) return;
                const bitmap = ImageManager.loadSystem('IconSet');
                const doDraw = () => {
                    const ctx = canvas.getContext('2d');
                    if (!ctx) return;
                    ctx.clearRect(0, 0, 36, 36);
                    ctx.imageSmoothingEnabled = false;
                    ctx.drawImage(bitmap.canvas, (iconIndex % 16) * 32, Math.floor(iconIndex / 16) * 32, 32, 32, 0, 0, 36, 36);
                };
                if (bitmap.isReady()) doDraw(); else bitmap.addLoadListener(doDraw);
            };

            this._partKeys.forEach((key, idx) => {
                const partDef = this._archetype && this._archetype.parts[key];
                const item    = partDef && $dataItems[partDef.itemId];
                if (item) draw(item.iconIndex, `hv-ic-${idx}`);
            });
        }

        // --- interaction ---

        onPartClick(idx) {
            if (this._selectedIndex === idx && this._activeSection === 'items') {
                this._enterActions();
                return;
            }
            SoundManager.playCursor();
            this._selectedIndex = idx;
            this._activeSection = 'items';
            this._actionIndex   = 0;
            this._refreshDOM();
        }

        executeHarvest(partKey) {
            const partDef  = this._archetype.parts[partKey];
            const savedPart = this._savedParts[partKey];
            const cl       = _classifyPart(partDef, savedPart, this._enemyDef, (this._corpse && this._corpse._harvestedParts) || {}, partKey);
            if (!cl.canAct) { SoundManager.playBuzzer(); return; }
            if (cl.state === 'surgery' && !_hasSurgicalTools()) { SoundManager.playBuzzer(); return; }

            const item = $dataItems[partDef.itemId];
            if (!item) { SoundManager.playBuzzer(); return; }

            const roll    = Math.random() * 100;
            const success = roll < cl.rate;

            if (success) {
                SoundManager.playOk();
                $gameParty.gainItem(item, 1);
                if (cl.state === 'surgery') $gameParty.loseItem($dataItems[244], 1);
                if (!this._corpse) this._corpse = {};
                if (!this._corpse._harvestedParts) this._corpse._harvestedParts = {};
                this._corpse._harvestedParts[partKey] = true;
                const pd = window.BSE && window.BSE.enemyPartDamage[this._corpse.enemyId];
                if (pd && pd.parts[partKey]) pd.parts[partKey].destroyed = true;
            } else {
                // Failed roll: the attempt ruins the part. Grant nothing and mark
                // it consumed so it can't be re-farmed on repeated failures.
                SoundManager.playBuzzer();
                if (cl.state === 'surgery') $gameParty.loseItem($dataItems[244], 1);
                if (!this._corpse) this._corpse = {};
                if (!this._corpse._harvestedParts) this._corpse._harvestedParts = {};
                this._corpse._harvestedParts[partKey] = true;
                const pd = window.BSE && window.BSE.enemyPartDamage[this._corpse.enemyId];
                if (pd && pd.parts[partKey]) pd.parts[partKey].destroyed = true;
            }

            this._activeSection = 'items';
            this._refreshDOM();
        }

        // Butchers one part and returns how many items it yielded (0 when it
        // could not be butchered at all).
        _butcherPart(partKey) {
            const partDef        = this._archetype.parts[partKey];
            const savedPart      = this._savedParts[partKey];
            const harvestedParts = (this._corpse && this._corpse._harvestedParts) || {};
            if (!partDef || harvestedParts[partKey]) return 0;
            const item = $dataItems[partDef.itemId];
            if (!item) return 0;
            const ratio  = savedPart && savedPart.maxHp > 0 ? savedPart.currentHp / savedPart.maxHp : 1;
            const amount = Math.max(1, Math.ceil(ratio * (partDef.hpPercent / 10)));
            $gameParty.gainItem(item, amount);
            if (!this._corpse) this._corpse = {};
            if (!this._corpse._harvestedParts) this._corpse._harvestedParts = {};
            this._corpse._harvestedParts[partKey] = true;
            const pd = window.BSE && window.BSE.enemyPartDamage[this._corpse.enemyId];
            if (pd && pd.parts[partKey]) pd.parts[partKey].destroyed = true;
            return amount;
        }

        executeButcher(partKey) {
            if (!this._butcherPart(partKey)) { SoundManager.playBuzzer(); return; }
            SoundManager.playOk();
            this._activeSection = 'items';
            this._refreshDOM();
        }

        // One press for the whole carcass: every part still worth butchering,
        // skipping collected, ruined and (without tools) surgical ones.
        executeButcherAll() {
            const keys = this._butcherableKeys();
            if (!keys.length) { SoundManager.playBuzzer(); return; }
            let items = 0;
            let parts = 0;
            keys.forEach(key => {
                const amount = this._butcherPart(key);
                if (amount) { items += amount; parts++; }
            });
            if (!parts) { SoundManager.playBuzzer(); return; }
            SoundManager.playOk();
            if (window.ParchmentToast && typeof window.ParchmentToast.show === 'function') {
                window.ParchmentToast.show(
                    T('Container.harvest.butcherAllResult', { parts, items }),
                    { severity: 'info', duration: 150, key: 'harvest-butcher-all' }
                );
            }
            this._activeSection = 'items';
            this._refreshDOM();
        }

        // Burying what is left: the body leaves the ledger and the map together,
        // so the tile it was lying on is simply ground again.
        executeBury() {
            const corpse = this._corpse;
            const BSE = window.BattleSystemEnhanced;
            if (!corpse || !BSE || !BSE.Functions.removeMapCorpse) {
                SoundManager.playBuzzer();
                return;
            }
            BSE.Functions.removeMapCorpse(corpse);
            SoundManager.playOk();
            if (window.ParchmentToast && typeof window.ParchmentToast.show === 'function') {
                window.ParchmentToast.show(
                    T('Container.harvest.buried', { name: this._getEnemyName() }),
                    { severity: 'info', duration: 150, key: 'harvest-bury' }
                );
            }
            this.popScene();
        }

        handleBack() {
            SoundManager.playCancel();
            this.popScene();
        }

        update() {
            super.update();
            UIHarvestInputManager.update();
        }

        terminate() {
            if (this._backgroundSprite) this._backgroundSprite.filters = [];
            super.terminate();
            UIHarvestInputManager.deactivate();
            if (this._domContainer) {
                const el = this._domContainer;
                el.style.transition    = 'opacity 0.2s ease-out';
                el.style.opacity       = '0';
                el.style.pointerEvents = 'none';
                setTimeout(() => { if (el && el.parentNode) el.parentNode.removeChild(el); }, 200);
                this._domContainer = null;
            }
        }
    }

    window.Scene_BodyPartHarvest = Scene_BodyPartHarvest;

    //=============================================================================
    // UIHarvestInputManager
    //=============================================================================

    const UIHarvestInputManager = {
        _scene:  null,
        _active: false,

        activate(scene) { this._scene = scene; this._active = true; },
        deactivate()    { this._active = false; this._scene = null; },

        update() {
            if (!this._active || !this._scene) return;
            const scene = this._scene;

            // Action bar: Left/Right pick an action, OK runs it, Cancel goes back.
            if (scene._activeSection === 'actions') {
                const acts = scene._actions || [];
                if (Input.isRepeated('left')) {
                    if (scene._actionIndex > 0) {
                        SoundManager.playCursor();
                        scene._actionIndex--;
                        scene._updateActionBar();
                    }
                } else if (Input.isRepeated('right')) {
                    if (scene._actionIndex < acts.length - 1) {
                        SoundManager.playCursor();
                        scene._actionIndex++;
                        scene._updateActionBar();
                    }
                } else if (Input.isTriggered('ok')) {
                    scene._execAction();
                } else if (Input.isTriggered('escape') || Input.isTriggered('cancel') || TouchInput.isCancelled()) {
                    SoundManager.playCancel();
                    scene._activeSection = 'items';
                    scene._updateActionBar();
                }
                return;
            }

            // Part list: Up/Down move, OK opens the action bar, Cancel leaves.
            const total = scene._partKeys.length;
            const idx   = scene._selectedIndex;
            if (Input.isRepeated('up')) {
                if (idx > 0) {
                    SoundManager.playCursor();
                    scene._selectedIndex = idx - 1;
                    scene._updateSelectionHighlight();
                }
            } else if (Input.isRepeated('down')) {
                if (idx < total - 1) {
                    SoundManager.playCursor();
                    scene._selectedIndex = idx + 1;
                    scene._updateSelectionHighlight();
                }
            } else if (Input.isTriggered('ok')) {
                scene._enterActions();
            } else if (Input.isTriggered('escape') || Input.isTriggered('cancel') || TouchInput.isCancelled()) {
                scene.handleBack();
            }
        }
    };

})();
