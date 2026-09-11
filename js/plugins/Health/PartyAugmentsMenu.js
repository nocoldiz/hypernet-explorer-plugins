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
 * Two lists, switched with Left/Right:
 *   Fitted    - every augment the party is actually wearing, whoever wears it,
 *               named with its patient and the socket it sits in.
 *   Catalogue - all of ProstheticTypes.json, so a player can read what an
 *               augment does before paying a clinic to graft it in.
 *
 * The right page is the dossier: what it costs, what it adds, the skill it
 * teaches (with that skill's own description), and every socket that takes it,
 * resolved through Health_Core's name matcher, so a creature's BODY or a
 * dragon's REAR_LEFT_LEG is listed alongside the humanoid sockets.
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

  // Which sockets accept this augment. The compatibility table is keyed by both
  // concrete part keys (LEFT_EYE) and general parts (WING), and the general ones
  // are what a creature's own anatomy resolves to, so both are listed.
  function socketsFor(key) {
    const table = getCompatibility();
    if (!table) return [];
    return Object.keys(table).filter((socket) => (table[socket] || []).includes(key));
  }

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

  function catalogueAugments() {
    const types = getProstheticTypes();
    if (!types) return [];
    return Object.keys(types)
      .map((key) => ({ key, prosthetic: types[key] }))
      .sort((a, b) => augmentName(a.key, a.prosthetic).localeCompare(augmentName(b.key, b.prosthetic)));
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
      this._tab = 0;              // 0 fitted, 1 catalogue
      this._selectedIndex = 0;
      this._activeArea = "tabs";  // 'tabs' | 'list'
      this._rows = [];

      // The shared search + filter strip (UI/MenuSearchBar.js), sitting under
      // the title as it does in every other list menu. An augment has a name
      // and a price and nothing else worth ordering on.
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
      s.fontFamily = "var(--font-ui)";
      s.boxSizing = "border-box";
      s.opacity = "0";
      s.transition = "opacity 0.22s ease-out";

      this._dndContainer.innerHTML = `
        <div class="book-spread">
          <div class="left-page augment-01">
            <div class="page-header-bar">
              <div class="back-button focusable">${T('Augments.ui.back')}</div>
              <h2 class="title">${T('Augments.ui.title')}</h2>
            </div>
            <div id="aug-search-slot"></div>
            <div class="augment-02" id="aug-tab-row"></div>
            <div class="augment-03" id="aug-list-content"></div>
          </div>
          <div class="right-page augment-01">
            <div class="augment-04" id="aug-detail-content"></div>
          </div>
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

    buildRows() {
      const rows = this._tab === 0 ? fittedAugments() : catalogueAugments();
      if (!this._augBar) return rows;
      return this._augBar.apply(rows, (row) => ({
        name: augmentName(row.key, row.prosthetic),
        price: (row.prosthetic && row.prosthetic.cost) || 0
      }));
    }

    refreshAugmentDOM() {
      if (!this._dndContainer) return;

      // Rebuilt in place with the page, then handed its caret back.
      const searchSlot = document.getElementById("aug-search-slot");
      if (searchSlot && this._augBar) {
        searchSlot.innerHTML = this._augBar.html();
        this._augBar.restoreFocus();
      }

      this._rows = this.buildRows();
      if (this._selectedIndex >= this._rows.length) {
        this._selectedIndex = Math.max(0, this._rows.length - 1);
      }

      const fittedCount = fittedAugments().length;
      const tabs = [
        T('Augments.ui.tab.fitted', { count: fittedCount }),
        T('Augments.ui.tab.catalogue', { count: catalogueAugments().length })
      ];
      const tabRow = document.getElementById("aug-tab-row");
      if (tabRow) {
        tabRow.innerHTML = tabs.map((label, idx) => {
          const isSel = idx === this._tab;
          const isFocused = isSel && this._activeArea === "tabs";
          return `<div class="aug-tab focusable augment-05" data-tab-idx="${idx}" style="background:${isSel ? 'var(--bg-tertiary-focus-translucent-45)' : 'var(--bg-card-translucent-5)'}; border:1.5px solid ${isFocused ? 'var(--text-secondary-active)' : 'var(--border-secondary-hover-translucent-15)'}; color:${isSel ? 'var(--text-secondary-active)' : 'var(--text-card-medium)'}">${escapeHtml(label)}</div>`;
        }).join("");
        tabRow.querySelectorAll(".aug-tab").forEach((tab) => {
          tab.addEventListener("click", () => {
            const idx = parseInt(tab.getAttribute("data-tab-idx"), 10);
            if (idx !== this._tab) {
              this._tab = idx;
              this._selectedIndex = 0;
            }
            this._activeArea = "tabs";
            SoundManager.playCursor();
            this.refreshAugmentDOM();
          });
        });
      }

      // The catalogue is the whole of ProstheticTypes.json, so the list is
      // windowed: only the rows the page can show are ever built
      // (UI/MenuVirtualList.js).
      const listBox = document.getElementById("aug-list-content");
      if (listBox) {
        // The catalogue is hundreds of entries, so it reads three across;
        // the fitted list stays one row per line.
        listBox.classList.toggle("aug-grid", this._tab === 1);
        const empty = this._tab === 0 ? T('Augments.ui.noneFitted') : T('Augments.ui.noCatalogue');
        window.MenuVirtualList.render(listBox, {
          key: `${this._tab}|${this._augBar ? this._augBar.query : ''}`,
          count: this._rows.length,
          renderItem: (idx) => this.buildRowHTML(this._rows[idx], idx),
          emptyHTML: `<div class="augment-06">${empty}</div>`,
          // Walking the register moves two marks. The rows on screen already
          // say the rest, so they are left as they are rather than rebuilt and
          // rebound a row at a time.
          focus: {
            index: this._selectedIndex,
            selector: '.aug-row',
            classes: {
              selected: this._selectedIndex,
              focused: this._activeArea === 'list' ? this._selectedIndex : -1
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

    buildRowHTML(row, idx) {
      if (!row) return "";
      const isSel = idx === this._selectedIndex;
      const isFocused = isSel && this._activeArea === "list";
      const name = augmentName(row.key, row.prosthetic);
      const sub = this._tab === 0
        ? T('Augments.ui.wornBy', { actor: row.actor.name(), part: row.partName })
        : T('Augments.ui.type.' + (row.prosthetic.type || "biological"));
      const flag = this._tab === 0 && row.damaged
        ? `<span class="augment-07">${T('Augments.ui.damagedHost')}</span>`
        : `<span class="augment-08">${escapeHtml(priceLabel(row.prosthetic.cost))}</span>`;
      return `
        <div class="aug-row focusable ${isSel ? 'selected ' : ''}${isFocused ? 'focused' : ''} augment-09" data-idx="${idx}">
          <span class="augment-10">
            <span class="augment-11">${escapeHtml(name)}</span>
            <span class="augment-08">${escapeHtml(sub)}</span>
          </span>
          ${flag}
        </div>`;
    }

    buildDetailHTML(row) {
      if (!row) {
        return `<div class="ui-empty"><div class="ui-empty-text">${T('Augments.ui.noneSelected')}</div></div>`;
      }
      const p = row.prosthetic;
      const name = augmentName(row.key, p);
      const typeLabel = T('Augments.ui.type.' + (p.type || "biological"));

      // Every effect the augment has is read in the one stat-block shape the
      // rest of the game's right columns use: label on the left, answer on the
      // right, the pair no wider than its own column.
      const effectRows = [];
      for (const [paramId, value] of Object.entries(p.effects || {})) {
        effectRows.push({
          label: paramName(parseInt(paramId, 10)),
          value: (value >= 0 ? "+" : "") + value
        });
      }

      // A `needs` block is a multiplier on how fast that need drains, so it is
      // read out as plain English: stopped, slowed by a share, or reversed.
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
        effectRows.push({ label, value });
      }

      const specRow = (r) => `
        <div class="inspect-spec-row">
          <span class="inspect-spec-label">${escapeHtml(r.label)}</span>
          <span class="inspect-spec-value">${escapeHtml(String(r.value))}</span>
        </div>`;

      // An endocrine implant's real effect is in the blood, not in the params,
      // so the biologic simulation supplies that sentence itself.
      const endocrine = window.EndocrineImplants && window.EndocrineImplants.describe
        ? window.EndocrineImplants.describe(row.key) : null;

      let effectsHTML = effectRows.length
        ? `<div class="inspect-spec-grid">${effectRows.map(specRow).join("")}</div>`
        : `<div class="ui-empty-note">${T('Augments.ui.noStatChange')}</div>`;
      if (endocrine) effectsHTML += `<div class="ui-prose">${escapeHtml(endocrine)}</div>`;

      let skillHTML = "";
      for (const sid of skillIds(p.skill)) {
        const skill = $dataSkills && $dataSkills[sid];
        if (!skill || !skill.name) continue;
        const desc = String(skill.description || "").split(/\s*[\r\n]+\s*/).join(" ").trim();
        skillHTML += `
          <div class="inspect-spec-grid">
            ${specRow({ label: skill.name, value: T('Augments.ui.alwaysCarried') })}
          </div>
          ${desc ? `<div class="ui-prose">${escapeHtml(desc)}</div>` : ""}`;
      }

      const sockets = socketsFor(row.key);
      const socketsHTML = sockets.length
        ? `<div class="ui-chip-row">` + sockets.map((s) =>
            `<span class="ui-chip">${escapeHtml(s)}</span>`
          ).join("") + `</div>`
        : `<div class="ui-empty-note">${T('Augments.ui.noSocket')}</div>`;

      const fittedHTML = row.actor
        ? `<div class="ui-section">
             <div class="inspect-section-title">${T('Augments.ui.fittedTo')}</div>
             <div class="inspect-spec-grid">
               ${specRow({ label: row.actor.name(), value: row.partName })}
             </div>
             ${row.damaged ? `<div class="aug-warning">${T('Augments.ui.damagedWarning')}</div>` : ""}
             <div class="ui-prose">${T('Augments.ui.severWarning')}</div>
           </div>`
        : "";

      return `
        <div class="ui-detail">
          <div class="ui-detail-head">
            <div class="ui-detail-titles">
              <h2>${escapeHtml(name)}</h2>
              <div class="ui-detail-sub">${escapeHtml(typeLabel)} &middot; ${escapeHtml(priceLabel(p.cost))}</div>
            </div>
          </div>
          <div class="ui-detail-scroll">
            <div class="ui-section">
              <div class="inspect-section-title">${T('Augments.ui.effects')}</div>
              ${effectsHTML}
            </div>
            ${skillHTML ? `<div class="ui-section">
              <div class="inspect-section-title">${T('Augments.ui.grantedSkill')}</div>
              ${skillHTML}
            </div>` : ""}
            <div class="ui-section">
              <div class="inspect-section-title">${T('Augments.ui.sockets')}</div>
              ${socketsHTML}
            </div>
            ${fittedHTML}
          </div>
        </div>
      `;
    }

    updateAugmentInput() {
      const isCancel = Input.isTriggered("cancel") || Input.isTriggered("escape") || TouchInput.isCancelled();

      if (this._activeArea === "tabs") {
        if (Input.isTriggered("right") || Input.isRepeated("right")) {
          if (this._tab < 1) {
            this._tab++;
            this._selectedIndex = 0;
            SoundManager.playCursor();
            this.refreshAugmentDOM();
          }
        } else if (Input.isTriggered("left") || Input.isRepeated("left")) {
          if (this._tab > 0) {
            this._tab--;
            this._selectedIndex = 0;
            SoundManager.playCursor();
            this.refreshAugmentDOM();
          }
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

      if (Input.isTriggered("down") || Input.isRepeated("down")) {
        if (this._selectedIndex < this._rows.length - 1) {
          this._selectedIndex++;
          SoundManager.playCursor();
          this.refreshAugmentDOM();
          this.scrollSelectedIntoView();
        }
      } else if (Input.isTriggered("up") || Input.isRepeated("up")) {
        if (this._selectedIndex > 0) {
          this._selectedIndex--;
          SoundManager.playCursor();
          this.refreshAugmentDOM();
          this.scrollSelectedIntoView();
        } else {
          this._activeArea = "tabs";
          SoundManager.playCursor();
          this.refreshAugmentDOM();
        }
      } else if (isCancel) {
        this._activeArea = "tabs";
        SoundManager.playCancel();
        this.refreshAugmentDOM();
      }
    }

    // The row moved onto may not be in the DOM at all, so the viewport is moved
    // by index rather than by element (UI/MenuVirtualList.js).
    scrollSelectedIntoView() {
      const listBox = document.getElementById("aug-list-content");
      if (listBox) window.MenuVirtualList.scrollToIndex(listBox, this._selectedIndex);
    }
  }

  window.Scene_PartyAugments = Scene_PartyAugments;

  const openAugments = () => {
    SceneManager.push(Scene_PartyAugments);
  };
  PluginManager.registerCommand("PartyAugmentsMenu", "OpenAugments", openAugments);
})();
