/*:
 * @target MZ
 * @plugindesc The Augments register: every augment the party carries, and the whole catalogue of what can be fitted where.
 * @author Esoteric Heavy Industries
 *
 * @command OpenAugments
 * @text Open Augments
 * @desc Opens the party augments register.
 *
 * @help PartyAugmentsMenu.js
 *
 * The augment register used to be the last tab of the Biologics panel, where a
 * page about blood chemistry had to make room for hardware. It is its own menu
 * entry now, sitting directly after Biologics.
 *
 * It wears the backpack's page (ItemSystem/ItemSystemInventoryUI.js): a tab
 * rail, the search strip, a three-across grid of slots with a rarity stripe,
 * and the inspect card on the right page.
 *
 * The tabs, turned with Left/Right on the rail or L1/R1 anywhere:
 *   Fitted    - every augment the party is actually wearing, whoever wears it,
 *               named with its patient and the socket it sits in.
 *   All       - all of ProstheticTypes.json, so a player can read what an
 *               augment does before paying a clinic to graft it in.
 *   Head, Senses, Torso, Organs, Arms, Legs, Appendages
 *             - the catalogue cut by the part of the body it goes into, the
 *               way the equip screen cuts gear by slot. An augment that fits
 *               more than one region is listed under each.
 *
 * Rarity is read off the price, against augment thresholds of its own: an
 * augment costs far more than a pocket item, and the backpack's bands would
 * call nearly the whole catalogue Epic.
 *
 * Reads, never writes: fitting and removing is the prosthetic shop's business.
 *
 * Requires Health_Core (socket matching) and the Health DB (window.Health).
 */

(() => {
  "use strict";

  const getProstheticTypes = () => (window.Health && window.Health.ProstheticTypes) || null;
  const getCompatibility = () => (window.Health && window.Health.ProstheticCompatibility) || null;

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
  }

  function augmentName(key, prosthetic) {
    if (!prosthetic) return key;
    return ConfigManager.language === "it" ? prosthetic.name_it : prosthetic.name_en;
  }

  // Money is euros everywhere in the game: the raw figure carries two implied
  // decimals, the same split MoneyFormatter draws.
  function priceLabel(gold) {
    const value = Math.round(Number(gold) || 0);
    const unit = ($dataSystem && $dataSystem.currencyUnit) || "";
    const str = String(Math.abs(value));
    let main = str.length <= 2 ? "0." + str.padStart(2, "0") : str.slice(0, -2) + "." + str.slice(-2);
    if (main.endsWith(".00")) main = main.slice(0, -3);
    return `${main}${unit ? " " + unit : ""}`;
  }

  function paramName(paramId) {
    return T.list('Prosthetics.paramNames')[paramId] || T('Prosthetics.statFallback');
  }

  function skillIds(value) {
    if (window.HealthCore && window.HealthCore.normalizeSkillIds) {
      return window.HealthCore.normalizeSkillIds(value);
    }
    return typeof value === "number" && value > 0 ? [value] : [];
  }

  // =========================================================================
  // Rarity, read off the price
  // =========================================================================
  // Augment bands, in raw gold (100 gold = 1 euro). The catalogue runs from
  // 60 to 15000 euros with most of it between 2500 and 5500, so the bands are
  // cut there: a common augment is a cheap one, a mythic one costs a house.
  // The ids are the backpack's, so the stripe and the label wear the same
  // --rarity-* inks the pockets do.
  const AUGMENT_RARITY = [
    { key: "legendary", label: "mythic",   minCost: 1000000 },
    { key: "epic",      label: "epic",     minCost: 550000 },
    { key: "rare",      label: "rare",     minCost: 400000 },
    { key: "uncommon",  label: "uncommon", minCost: 250000 },
    { key: "common",    label: "common",   minCost: 0 }
  ];

  function augmentRarity(prosthetic) {
    const cost = Number(prosthetic && prosthetic.cost) || 0;
    const tier = AUGMENT_RARITY.find((t) => cost >= t.minCost) || AUGMENT_RARITY[AUGMENT_RARITY.length - 1];
    return {
      key: tier.key,
      name: T('Inventory.rarity.' + tier.label),
      color: `var(--rarity-${tier.key})`
    };
  }

  // =========================================================================
  // Body regions
  // =========================================================================
  // The compatibility table names concrete sockets (LEFT_EYE) and the general
  // parts a creature's anatomy resolves to (EYE, WING). Each one belongs to a
  // region of the body, and the regions are the tabs. A socket nobody has
  // placed yet lands in "other", which only shows when something is in it.
  const REGIONS = [
    { id: "head",       sockets: ["HEAD", "BRAIN", "NECK", "HAIR", "HORN"] },
    { id: "senses",     sockets: ["LEFT_EYE", "RIGHT_EYE", "EYE", "NOSE", "LEFT_EAR", "RIGHT_EAR", "EAR", "MOUTH", "TEETH", "SENSOR"] },
    { id: "torso",      sockets: ["TORSO", "BODY", "SHELL", "CORE", "GENITALS"] },
    { id: "organs",     sockets: ["HEART", "LEFT_LUNG", "RIGHT_LUNG", "LUNG", "LIVER", "STOMACH", "SPLEEN", "INTESTINES", "VISCERA", "GLAND"] },
    { id: "arms",       sockets: ["LEFT_ARM", "RIGHT_ARM", "ARM", "LEFT_HAND", "RIGHT_HAND", "HAND", "LEFT_FINGERS", "RIGHT_FINGERS", "WEAPON_MOUNT"] },
    { id: "legs",       sockets: ["LEFT_LEG", "RIGHT_LEG", "LEG", "LEFT_FOOT", "RIGHT_FOOT", "FOOT", "LEFT_TOES", "RIGHT_TOES", "WHEEL"] },
    { id: "appendages", sockets: ["WING", "TAIL", "TENTACLE", "FIN"] }
  ];
  const OTHER_REGION = "other";
  const REGION_OF = {};
  for (const region of REGIONS) for (const sock of region.sockets) REGION_OF[sock] = region.id;
  const regionOfSocket = (socket) => REGION_OF[socket] || OTHER_REGION;

  // One icon per kind of augment, drawn off the IconSet: a heart for flesh,
  // a cog for hardware, a spark for the enchanted.
  const TYPE_ICONS = { biological: 84, technological: 83, magical: 72 };

  function iconStyle(prosthetic) {
    const icon = TYPE_ICONS[(prosthetic && prosthetic.type) || "biological"] || TYPE_ICONS.biological;
    return `background:url('img/system/IconSet.png') -${(icon % 16) * 32}px -${Math.floor(icon / 16) * 32}px no-repeat;width:32px;height:32px;`;
  }

  // Which sockets accept each augment, and which regions those make up. Built
  // once per compatibility table: the tabs count every region on every redraw.
  let socketMemo = null;

  function socketIndex() {
    const table = getCompatibility();
    if (socketMemo && socketMemo.table === table) return socketMemo;
    const sockets = {};
    const regions = {};
    if (table) {
      for (const socket of Object.keys(table)) {
        for (const key of table[socket] || []) {
          (sockets[key] = sockets[key] || []).push(socket);
          (regions[key] = regions[key] || new Set()).add(regionOfSocket(socket));
        }
      }
    }
    socketMemo = { table, sockets, regions };
    return socketMemo;
  }

  const socketsFor = (key) => socketIndex().sockets[key] || [];
  const regionsFor = (key) => socketIndex().regions[key] || new Set();

  // Every augment the party is wearing, one row per fitted socket.
  function fittedAugments() {
    const types = getProstheticTypes();
    const rows = [];
    if (!types || typeof $gameParty === "undefined" || !$gameParty) return rows;
    for (const actor of $gameParty.members()) {
      const installed = actor._prosthetics || {};
      for (const partKey in installed) {
        const key = installed[partKey];
        const prosthetic = types[key];
        if (!prosthetic) continue;
        const part = actor._bodyParts ? actor._bodyParts[partKey] : null;
        rows.push({
          key,
          prosthetic,
          actor,
          partKey,
          partName: (part && part.name) || partKey,
          damaged: !!(part && part.damaged)
        });
      }
    }
    return rows;
  }

  // The whole catalogue in name order. Every step of the cursor redraws the
  // page, and sorting a few hundred localised names each time is the bulk of
  // it, so the order is kept until the table or the language changes.
  let catalogueMemo = null;

  function catalogueAugments() {
    const types = getProstheticTypes();
    if (!types) return [];
    const keys = Object.keys(types);
    const lang = ConfigManager.language;
    const memo = catalogueMemo;
    if (memo && memo.types === types && memo.lang === lang && memo.count === keys.length) {
      return memo.list.slice();
    }
    const list = keys
      .map((key) => ({ key, prosthetic: types[key] }))
      .sort((a, b) => augmentName(a.key, a.prosthetic).localeCompare(augmentName(b.key, b.prosthetic)));
    catalogueMemo = { types, lang, count: keys.length, list };
    return list.slice();
  }

  // The tab rail: Fitted, All, then every region something fits into, in body
  // order. A region with nothing in it has no tab.
  function augmentTabs(fitted, catalogue) {
    const tabs = [
      { id: "fitted", label: T('Augments.ui.tab.fitted', { count: fitted.length }), rows: fitted },
      { id: "all", label: T('Augments.ui.tab.all', { count: catalogue.length }), rows: catalogue }
    ];
    for (const id of REGIONS.map((r) => r.id).concat(OTHER_REGION)) {
      const rows = catalogue.filter((row) => regionsFor(row.key).has(id));
      if (!rows.length) continue;
      tabs.push({
        id,
        label: T('Augments.ui.tab.region', { name: T('Augments.ui.region.' + id), count: rows.length }),
        rows
      });
    }
    return tabs;
  }

  // One line of the inspect card, the backpack's pill: label, then answer.
  const pill = (label, value, cls) =>
    `<div class="inspect-meta-item inspect-pill${cls ? " " + cls : ""}">` +
      `<span class="inspect-pill-lbl">${escapeHtml(label)}:</span> ` +
      `<span class="inspect-meta-val inspect-pill-val">${escapeHtml(value)}</span>` +
    `</div>`;
  const pillText = (text) =>
    `<div class="inspect-meta-item inspect-pill"><span class="inspect-meta-val inspect-pill-val">${escapeHtml(text)}</span></div>`;
  const pillBlock = (rowsHTML) => `<div class="inspect-quick-pills inspect-pill-block">${rowsHTML}</div>`;
  const sectionTitle = (key) => `<div class="inspect-section-title">${T(key)}</div>`;

  // =========================================================================
  // The inspect card, shared
  // =========================================================================
  // The surgery screen (Health_ProstheticShopUI.js) wears the same card over
  // an augment it is about to fit, so both halves of it are built here once.

  // The head: icon and name with the rarity under it, the price as a pill.
  function augmentHeader(key, p, priceText) {
    const rarity = augmentRarity(p);
    const typeLabel = T('Augments.ui.type.' + (p.type || "biological"));
    return `
          <div class="inspect-topline-info inspect-topline-info--fullwidth">
            <div class="inspect-header">
              <div class="inspect-frame"><span class="aug-icon" style="${iconStyle(p)}"></span></div>
              <div class="inspect-title-box">
                <h3 class="inspect-name">${escapeHtml(augmentName(key, p))}</h3>
                <div class="inspect-rarity rarity--${rarity.key}">${escapeHtml(rarity.name)} ${escapeHtml(typeLabel)}</div>
              </div>
            </div>
            <div class="inspect-meta-grid inspect-meta-grid--stacked inspect-quick-pills inspect-meta-grid--single">
              ${pill(T('Augments.ui.price'), priceText)}
            </div>
          </div>`;
  }

  // The body: a section per thing the augment does. Stats are the backpack's
  // gain and loss pills; a `needs` block is a multiplier on how fast that need
  // drains, so it is read out as plain English: stopped, slowed by a share, or
  // reversed.
  function augmentSections(key, p) {
    const statPills = [];
    for (const [paramId, value] of Object.entries(p.effects || {})) {
      statPills.push(pill(paramName(parseInt(paramId, 10)), (value >= 0 ? "+" : "") + value,
        value >= 0 ? "inspect-pill--gain" : "inspect-pill--loss"));
    }
    for (const [needKey, rate] of Object.entries(p.needs || {})) {
      const label = (window.PartyNeeds && window.PartyNeeds.LABELS && window.PartyNeeds.LABELS[needKey]) || needKey;
      let value;
      if (rate < 0) {
        value = T('Augments.ui.need.restores', { pct: Math.round(Math.abs(rate) * 100) });
      } else if (rate === 0) {
        value = T('Augments.ui.need.halted');
      } else if (rate < 1) {
        value = T('Augments.ui.need.slowed', { pct: Math.round((1 - rate) * 100) });
      } else if (rate > 1) {
        value = T('Augments.ui.need.hastened', { pct: Math.round((rate - 1) * 100) });
      } else {
        continue;
      }
      statPills.push(pill(label, value));
    }

    // An endocrine implant's real effect is in the blood, not in the params,
    // so the biologic simulation supplies that sentence itself.
    const endocrine = window.EndocrineImplants && window.EndocrineImplants.describe
      ? window.EndocrineImplants.describe(key) : null;

    let body = endocrine ? `<div class="inspect-desc">${escapeHtml(endocrine)}</div>` : "";
    body += sectionTitle('Augments.ui.effects') + (statPills.length
      ? pillBlock(statPills.join(""))
      : `<div class="ui-empty-note">${T('Augments.ui.noStatChange')}</div>`);

    for (const sid of skillIds(p.skill)) {
      const skill = $dataSkills && $dataSkills[sid];
      if (!skill || !skill.name) continue;
      const desc = String(skill.description || "").split(/\s*[\r\n]+\s*/).join(" ").trim();
      body += sectionTitle('Augments.ui.grantedSkill')
        + pillBlock(pill(skill.name, T('Augments.ui.alwaysCarried'), "inspect-pill--special"))
        + (desc ? `<div class="inspect-desc">${escapeHtml(desc)}</div>` : "");
    }

    const sockets = socketsFor(key);
    body += sectionTitle('Augments.ui.sockets') + (sockets.length
      ? pillBlock(sockets.map(pillText).join(""))
      : `<div class="ui-empty-note">${T('Augments.ui.noSocket')}</div>`);
    return body;
  }

  // =========================================================================
  // Scene_PartyAugments
  // =========================================================================
  class Scene_PartyAugments extends Scene_MenuBase {
    create() {
      super.create();
      // A chaos world prices the catalogue itself, so the register quotes the
      // same money the clinic does rather than the database's own.
      if (window.ChaosAugmentPrices) window.ChaosAugmentPrices();
      this._tab = 0;              // index into this._tabs
      this._tabs = [];
      this._selectedIndex = 0;
      this._activeArea = "tabs";  // 'tabs' | 'list'
      this._rows = [];

      // The shared search + filter strip (UI/MenuSearchBar.js), in the slot
      // the backpack keeps for its own search and sort tags. An augment has a
      // name and a price and nothing else worth ordering on.
      this._augBar = window.MenuSearchBar ? window.MenuSearchBar.create({
        id: 'augments',
        placeholder: T('Augments.ui.searchPlaceholder'),
        sorts: ['name', 'price'],
        onChange: () => {
          this._selectedIndex = 0;
          this.refreshAugmentDOM();
          if (this._augBar) this._augBar.restoreFocus();
        }
      }) : null;

      this.initAugmentDOM();
    }

    update() {
      super.update();
      // A focused search field owns the keyboard (UI/MenuSearchBar.js).
      if (!(window.MenuSearchBar && window.MenuSearchBar.isTyping())) this.updateAugmentInput();
    }

    terminate() {
      if (this._augBar) { this._augBar.dispose(); this._augBar = null; }
      const container = document.getElementById("party-augments-container");
      if (container) container.remove();
      super.terminate();
    }

    initAugmentDOM() {
      this._dndContainer = document.createElement("div");
      this._dndContainer.id = "party-augments-container";
      const s = this._dndContainer.style;
      s.position = "absolute";
      s.top = "0";
      s.left = "0";
      s.width = "100%";
      s.height = "100%";
      s.zIndex = "1000";
      s.background = "radial-gradient(circle, var(--accent-bronze-translucent-78) 0%, var(--shadow-heavy) 100%)";
      s.display = "flex";
      s.justifyContent = "center";
      s.alignItems = "center";
      s.boxSizing = "border-box";
      s.opacity = "0";
      s.transition = "opacity 0.22s ease-out";

      // The backpack's spread, part for part: header, tab rail, search strip,
      // the grid of slots, and the inspect card on the right page.
      this._dndContainer.innerHTML = `
        <div class="book-spread inspect-pockets">
          <div class="left-page">
            <div class="page-header-bar">
              <div class="back-button focusable">${T('Augments.ui.back')}</div>
              <h2 class="title">${T('Augments.ui.title')}</h2>
            </div>
            <div class="backpack-tabs" id="aug-tab-row"></div>
            <div class="backpack-search" id="aug-search-slot"></div>
            <div class="backpack-grid" id="aug-list-content"></div>
          </div>
          <div class="right-page" id="aug-detail-content"></div>
        </div>
      `;
      document.body.appendChild(this._dndContainer);

      this._dndContainer.querySelector(".back-button").addEventListener("click", (e) => {
        e.stopPropagation();
        SoundManager.playCancel();
        this.popScene();
      });

      const listBox = document.getElementById("aug-list-content");
      if (listBox) listBox.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });

      this.refreshAugmentDOM();
      setTimeout(() => {
        if (this._dndContainer) this._dndContainer.style.opacity = "1";
      }, 16);
    }

    buildRows(base) {
      const rows = base || [];
      if (!this._augBar) return rows;
      return this._augBar.apply(rows, (row) => ({
        name: augmentName(row.key, row.prosthetic),
        price: (row.prosthetic && row.prosthetic.cost) || 0
      }));
    }

    currentTabId() {
      const tab = this._tabs[this._tab];
      return tab ? tab.id : "fitted";
    }

    selectTab(idx) {
      if (idx === this._tab) return;
      this._tab = idx;
      this._selectedIndex = 0;
      SoundManager.playCursor();
      this.refreshAugmentDOM();
    }

    refreshAugmentDOM() {
      if (!this._dndContainer) return;

      // Rebuilt in place with the page, then handed its caret back. A cursor
      // step leaves the strip's markup as it was, so it is only rebuilt when
      // the query, the sort or the field's state has changed it.
      const searchSlot = document.getElementById("aug-search-slot");
      if (searchSlot && this._augBar) {
        const stripHTML = this._augBar.html();
        if (stripHTML !== this._augStripHTML || searchSlot !== this._augStripSlot) {
          searchSlot.innerHTML = stripHTML;
          this._augStripHTML = stripHTML;
          this._augStripSlot = searchSlot;
        }
        this._augBar.restoreFocus();
      }

      // Both lists are read once per redraw: every tab is cut from the same
      // read, and the open one is filtered from its own copy.
      const tabId = this.currentTabId();
      this._tabs = augmentTabs(fittedAugments(), catalogueAugments());
      // A region can empty out from under its tab (a language change, a new
      // table); the rail keeps the same tab by id where it still stands.
      const keep = this._tabs.findIndex((t) => t.id === tabId);
      this._tab = keep >= 0 ? keep : Math.min(this._tab, this._tabs.length - 1);
      this._rows = this.buildRows(this._tabs[this._tab].rows);
      if (this._selectedIndex >= this._rows.length) {
        this._selectedIndex = Math.max(0, this._rows.length - 1);
      }

      const tabRow = document.getElementById("aug-tab-row");
      if (tabRow) {
        tabRow.innerHTML = `<div class="backpack-tabs-row">` + this._tabs.map((tab, idx) => {
          const active = idx === this._tab ? " active" : "";
          const focused = idx === this._tab && this._activeArea === "tabs" ? " selected" : "";
          return `<div class="backpack-tab aug-tab focusable${active}${focused}" data-tab-idx="${idx}">${escapeHtml(tab.label)}</div>`;
        }).join("") + `</div>`;
        tabRow.querySelectorAll(".aug-tab").forEach((tab) => {
          tab.addEventListener("click", () => {
            this._activeArea = "tabs";
            const idx = parseInt(tab.getAttribute("data-tab-idx"), 10);
            if (idx !== this._tab) this.selectTab(idx);
            else { SoundManager.playCursor(); this.refreshAugmentDOM(); }
          });
        });
      }

      // The catalogue is the whole of ProstheticTypes.json, so the grid is
      // windowed: only the slots the page can show are ever built
      // (UI/MenuVirtualList.js).
      const listBox = document.getElementById("aug-list-content");
      if (listBox) {
        const empty = this.currentTabId() === "fitted" ? T('Augments.ui.noneFitted') : T('Augments.ui.noCatalogue');
        window.MenuVirtualList.render(listBox, {
          key: `${this.currentTabId()}|${this._augBar ? this._augBar.query : ''}`,
          count: this._rows.length,
          renderItem: (idx) => this.buildRowHTML(this._rows[idx], idx),
          emptyHTML: `<div class="item-grid-empty">${empty}</div>`,
          // Walking the grid moves one mark. The slots on screen already say
          // the rest, so they are left as they are rather than rebuilt and
          // rebound a slot at a time.
          focus: {
            index: this._selectedIndex,
            selector: '.aug-row',
            classes: {
              selected: this._activeArea === 'list' ? this._selectedIndex : -1
            }
          },
          onWindow: (win) => {
            win.querySelectorAll(".aug-row").forEach((row) => {
              row.addEventListener("click", () => {
                this._selectedIndex = parseInt(row.getAttribute("data-idx"), 10);
                this._activeArea = "list";
                SoundManager.playCursor();
                this.refreshAugmentDOM();
              });
            });
          }
        });
      }

      const detail = document.getElementById("aug-detail-content");
      if (detail) detail.innerHTML = this.buildDetailHTML(this._rows[this._selectedIndex]);
    }

    // One slot, the backpack's: rarity stripe, icon, name, and a meta line
    // under it. The catalogue reads kind and price; the fitted list reads who
    // wears it and where, with the price or the host's damage on the right.
    buildRowHTML(row, idx) {
      if (!row) return "";
      const isSel = idx === this._selectedIndex && this._activeArea === "list";
      const name = augmentName(row.key, row.prosthetic);
      const rarity = augmentRarity(row.prosthetic);
      const sub = row.actor
        ? T('Augments.ui.wornBy', { actor: row.actor.name(), part: row.partName })
        : T('Augments.ui.type.' + (row.prosthetic.type || "biological"));
      const right = row.actor && row.damaged ? T('Augments.ui.damagedHost') : priceLabel(row.prosthetic.cost);
      return `
        <div class="item-slot aug-row focusable${isSel ? ' selected' : ''}" data-idx="${idx}">
          <div class="item-rarity-bar" style="background:${rarity.color};"></div>
          <div class="item-slot-icon"><span class="aug-icon" style="${iconStyle(row.prosthetic)}"></span></div>
          <div class="item-slot-info">
            <div class="item-slot-name">${escapeHtml(name)}</div>
            <div class="item-slot-meta">
              <span>${escapeHtml(sub)}</span>
              <span class="item-slot-count${row.actor && row.damaged ? ' aug-damaged' : ''}">${escapeHtml(right)}</span>
            </div>
          </div>
        </div>`;
    }

    // The right page is the backpack's inspect card: icon and name with the
    // rarity under it, the price as a pill, then a section per thing the
    // augment does.
    buildDetailHTML(row) {
      if (!row) {
        return `
          <div class="item-inspect item-inspect--empty">
            <div class="inspect-placeholder-icon"></div>
            <h3 class="title">${T('Augments.ui.noneSelected')}</h3>
          </div>`;
      }
      const p = row.prosthetic;
      let body = augmentSections(row.key, p);

      if (row.actor) {
        const capacity = window.ProstheticCapacity ? pill(T('Augments.ui.capacity'), T('Augments.ui.capacityValue', {
          fitted: window.ProstheticCapacity.fitted(row.actor),
          max: window.ProstheticCapacity.capacity(row.actor)
        })) : "";
        body += sectionTitle('Augments.ui.fittedTo')
          + pillBlock(`${pill(row.actor.name(), row.partName)}${capacity}`)
          + (row.damaged ? `<div class="aug-warning">${T('Augments.ui.damagedWarning')}</div>` : "")
          + `<div class="inspect-desc">${T('Augments.ui.severWarning')}</div>`;
      }

      return `
        <div class="item-inspect">
          ${augmentHeader(row.key, p, priceLabel(p.cost))}
          <div class="inspect-lore">${body}</div>
        </div>`;
    }

    updateAugmentInput() {
      const isCancel = Input.isTriggered("cancel") || Input.isTriggered("escape") || TouchInput.isCancelled();
      const lastTab = Math.max(0, this._tabs.length - 1);

      // L1 / R1 (Q / W, Tab) turn the tabs from wherever the cursor is.
      const tabDir = window.UINav ? window.UINav.tabDir() : 0;
      if (tabDir) {
        this.selectTab(Math.max(0, Math.min(lastTab, this._tab + tabDir)));
        return;
      }

      if (this._activeArea === "tabs") {
        if (Input.isTriggered("right") || Input.isRepeated("right")) {
          if (this._tab < lastTab) this.selectTab(this._tab + 1);
        } else if (Input.isTriggered("left") || Input.isRepeated("left")) {
          if (this._tab > 0) this.selectTab(this._tab - 1);
        } else if (Input.isTriggered("down") || Input.isRepeated("down")) {
          if (this._rows.length) {
            this._activeArea = "list";
            SoundManager.playCursor();
            this.refreshAugmentDOM();
          }
        } else if (isCancel) {
          SoundManager.playCancel();
          this.popScene();
        }
        return;
      }

      if (!this._rows.length) {
        if (isCancel) {
          this._activeArea = "tabs";
          SoundManager.playCancel();
          this.refreshAugmentDOM();
        }
        return;
      }

      // The grid reads several across, so down walks a whole line of slots
      // and left and right walk within one. How many across is read off the
      // live grid rather than restated here (UI/MenuVirtualList.js).
      // UINav.gridStep keeps left and right on the row and stops at its ends.
      // The layout is only read on a frame that moves: reading it forces a
      // style pass, and this runs every frame the list has the cursor.
      const dir = window.UINav ? window.UINav.navDir() : null;
      if (dir) {
        const cols = window.MenuVirtualList.columnsOf("#aug-list-content", 1);
        if (dir === "up" && this._selectedIndex < cols) {
          this._activeArea = "tabs";
          SoundManager.playCursor();
          this.refreshAugmentDOM();
          return;
        }
        const next = window.UINav.gridStep(this._selectedIndex, dir, this._rows.length, cols);
        if (next !== this._selectedIndex) {
          this._selectedIndex = next;
          SoundManager.playCursor();
          this.refreshAugmentDOM();
          this.scrollSelectedIntoView();
        }
      } else if (isCancel) {
        this._activeArea = "tabs";
        SoundManager.playCancel();
        this.refreshAugmentDOM();
      }
    }

    // The slot moved onto may not be in the DOM at all, so the viewport is
    // moved by index rather than by element (UI/MenuVirtualList.js).
    scrollSelectedIntoView() {
      const listBox = document.getElementById("aug-list-content");
      if (listBox) window.MenuVirtualList.scrollToIndex(listBox, this._selectedIndex);
    }
  }

  window.Scene_PartyAugments = Scene_PartyAugments;
  // The price bands, for anything else that prints an augment's rarity.
  window.AugmentRarity = augmentRarity;
  // The slot's mark and the inspect card, for the surgery screen.
  window.AugmentCard = {
    rarity: augmentRarity,
    iconStyle,
    header: augmentHeader,
    sections: augmentSections
  };

  const openAugments = () => {
    SceneManager.push(Scene_PartyAugments);
  };
  PluginManager.registerCommand("PartyAugmentsMenu", "OpenAugments", openAugments);
})();
