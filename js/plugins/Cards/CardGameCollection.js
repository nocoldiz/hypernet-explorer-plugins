/*:
 * @target MZ
 * @plugindesc The card collection, the deck builder and the booster pack opening.
 * @author Esoteric Heavy Industries
 *
 * @command OpenCardCollection
 * @text Open Card Collection
 * @desc Opens the party's card collection and deck builder.
 *
 * @command OpenBoosterPack
 * @text Open Booster Pack
 * @desc Rolls a booster pack and opens it with the full animation. The cards are added to the party collection.
 *
 * @arg size
 * @text Cards in the pack
 * @type number
 * @min 1
 * @max 12
 * @default 6
 *
 * @command CaptureEnemyAsCard
 * @text Capture Enemy As Card
 * @desc In battle: tries to bind the weakest enemy still standing into a card. It dies either way if it works.
 *
 * @arg bonus
 * @text Bonus chance
 * @desc Flat percentage points added to the odds, for a skill stronger than the bare attempt.
 * @type number
 * @min -100
 * @max 100
 * @default 0
 *
 * @help CardGameCollection.js
 *
 * The collection belongs to the party, not to a member: one shelf, whoever is
 * leading. Copies of a card stack on one tile however differently each of them
 * was drawn.
 *
 * A deck holds between 9 and 20 cards and may only hold copies the party
 * actually owns. Several decks can be kept; one of them is active and is what a
 * duel is played with. A player who never opens this menu is dealt the best
 * legal hand their collection can make (CardGame.autoDeck).
 *
 * A booster pack is six cards, monsters and equipment from one pool, weighted
 * so the last of the six is never common.
 *
 * CaptureEnemyAsCard is the other way a card is won. Used in battle it picks
 * the weakest creature still standing and tries to bind it: mostly a question
 * of how badly hurt it already is, helped by the acting character's PSI
 * measured against the creature's own, and hopeless against anything more than
 * ten levels above the party's median. Success adds the card AND kills the
 * creature outright, so the collapse, the corpse and the spoils are the
 * ordinary ones. Read the model through window.CardCapture.odds(enemy, caster).
 *
 * CADD TRADER is the same collection seen from the Hypernet: a program on the
 * desktop (window.CaddTrader, app id app-cadd-trader) listing a handful of lots
 * a day that sell out for good, and buying the party's spares back at the
 * site's own price. Every figure comes from CardGame's market.
 *
 * Requires Cards/CardGameCore.js.
 */

(() => {
  "use strict";

  const PLUGIN = "Cards/CardGameCollection";
  const CG = () => window.CardGame;

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
  }

  function playSe(name, volume, pitch) {
    try {
      AudioManager.playSe({ name, volume: volume == null ? 80 : volume, pitch: pitch == null ? 100 : pitch, pan: 0 });
    } catch (e) { /* a missing sound never stops the menu */ }
  }

  //===========================================================================
  // Style
  //===========================================================================

  //===========================================================================
  // Shared card art helper
  //===========================================================================
  // Draws a monster's walking sprite or an equipment glyph into a host element.

  function fillArt(host, key, px) {
    if (!host) return;
    const CGx = CG();
    host.innerHTML = "";
    if (CGx.isEquip(key) || CGx.isEffect(key)) {
      const glyph = document.createElement("span");
      glyph.setAttribute("style", CGx.Art.iconStyle(key, px || 64));
      host.appendChild(glyph);
      return;
    }
    const sprite = CGx.Art.spriteArt(key, px || 96);
    if (sprite) host.appendChild(sprite);
  }

  //===========================================================================
  // Scene_CardCollection
  //===========================================================================

  const FILTERS = ["all", "monsters", "weapons", "armor", "effects", "deck"];

  class Scene_CardCollection extends Scene_MenuBase {
    create() {
      super.create();
      if (this._helpWindow) { this._helpWindow.deactivate(); this._helpWindow.hide(); }

      const CGx = CG();
      this._filter = 0;
      this._index = 0;
      this._flourish = true;
      this._area = "grid";      // tabs | grid | actions
      this._actionIndex = 0;
      this._spriteFrame = 1;
      this._spriteTimer = 0;
      // A per-card art seed, stable while the menu is open and re-rollable, so
      // a stack shows ONE representative specimen rather than flickering.
      this._seeds = {};

      // The working deck: the active one when there is one, otherwise the best
      // hand the collection can make, so the builder never opens empty.
      this._deckIndex = CGx.decks().length ? CGx.activeDeckIndex() : -1;
      const active = CGx.decks()[this._deckIndex];
      this._working = active ? active.cards.slice() : CGx.autoDeck();

      this.buildDOM();
      this.render();
    }

    update() {
      super.update();
      this.updateSprites();
      this.updateInput();
    }

    terminate() {
      const container = document.getElementById("cardcol-container");
      if (container) container.remove();
      super.terminate();
    }

    //-------------------------------------------------------------------------
    // Data
    //-------------------------------------------------------------------------

    seedFor(key) {
      if (this._seeds[key] == null) this._seeds[key] = CG().hashString(key + ":look") >>> 0;
      return this._seeds[key];
    }

    rerollSeed(key) {
      this._seeds[key] = CG().rollSeed();
      return this._seeds[key];
    }

    // What the left page is showing: the collection under a filter, or the deck
    // being built.
    visibleKeys() {
      const CGx = CG();
      if (FILTERS[this._filter] === "deck") {
        const counts = {};
        this._working.forEach((key) => { counts[key] = (counts[key] || 0) + 1; });
        return Object.keys(counts);
      }
      const owned = CGx.ownedKeys().sort((a, b) => {
        const r = CGx.rarityOf(b) - CGx.rarityOf(a);
        return r || CGx.nameOf(a).localeCompare(CGx.nameOf(b));
      });
      const mode = FILTERS[this._filter];
      if (mode === "monsters") return owned.filter(CGx.isMonster);
      if (mode === "weapons") return owned.filter(CGx.isWeapon);
      if (mode === "armor") return owned.filter(CGx.isArmor);
      if (mode === "effects") return owned.filter(CGx.isEffect);
      return owned;
    }

    selectedKey() {
      const keys = this.visibleKeys();
      return keys[Math.min(this._index, keys.length - 1)] || null;
    }

    inDeck(key) {
      return this._working.filter((k) => k === key).length;
    }

    // How many copies of this key are still on the shelf, unspent by the deck.
    spare(key) {
      return CG().countOf(key) - this.inDeck(key);
    }

    addToDeck(key) {
      const CGx = CG();
      if (!key) return;
      if (this._working.length >= CGx.DECK_MAX) { SoundManager.playBuzzer(); return; }
      if (this.spare(key) <= 0) { SoundManager.playBuzzer(); return; }
      this._working.push(key);
      playSe("Casino/card_place_2", 65, 115);
      this.render();
    }

    removeFromDeck(key) {
      const at = this._working.lastIndexOf(key);
      if (at < 0) { SoundManager.playBuzzer(); return; }
      this._working.splice(at, 1);
      playSe("Casino/card_slide_3", 55, 100);
      this.render();
    }

    //-------------------------------------------------------------------------
    // Actions
    //-------------------------------------------------------------------------

    actions() {
      const CGx = CG();
      const legal = CGx.deckLegality(this._working);
      return [
        { id: "save", label: T("CardGame.col.saveDeck"), enabled: legal.ok },
        { id: "newDeck", label: T("CardGame.col.newDeck"), enabled: true },
        { id: "prevDeck", label: T("CardGame.col.prevDeck"), enabled: CGx.decks().length > 1 },
        { id: "nextDeck", label: T("CardGame.col.nextDeck"), enabled: CGx.decks().length > 1 },
        { id: "auto", label: T("CardGame.col.autoDeck"), enabled: true },
        { id: "shuffle", label: T("CardGame.col.shuffleDeck"), enabled: CGx.ownedKeys().length > 0 },
        { id: "reroll", label: T("CardGame.col.reroll"), enabled: !!this.selectedKey() },
        { id: "practice", label: T("CardGame.col.practice"), enabled: !!window.CardDuel && CGx.canDuel() }
      ];
    }

    runAction(id) {
      const CGx = CG();
      switch (id) {
        case "save": {
          const legal = CGx.deckLegality(this._working);
          if (!legal.ok) { SoundManager.playBuzzer(); return; }
          const name = T("CardGame.col.deckName", { n: (this._deckIndex >= 0 ? this._deckIndex : CGx.decks().length) + 1 });
          const deck = { name, cards: this._working.slice() };
          if (this._deckIndex >= 0) CGx.saveDeck(this._deckIndex, deck);
          else { CGx.saveDeck(null, deck); this._deckIndex = CGx.decks().length - 1; }
          CGx.setActiveDeck(this._deckIndex);
          SoundManager.playSave();
          break;
        }
        case "newDeck":
          this._deckIndex = -1;
          this._working = [];
          SoundManager.playOk();
          break;
        case "prevDeck":
        case "nextDeck": {
          const list = CGx.decks();
          if (!list.length) { SoundManager.playBuzzer(); return; }
          const step = id === "nextDeck" ? 1 : -1;
          this._deckIndex = ((this._deckIndex < 0 ? 0 : this._deckIndex) + step + list.length) % list.length;
          this._working = list[this._deckIndex].cards.slice();
          CGx.setActiveDeck(this._deckIndex);
          SoundManager.playCursor();
          break;
        }
        case "auto":
          this._working = CGx.autoDeck();
          playSe("Casino/card_shuffle", 70, 100);
          break;
        case "shuffle":
          // Dealt at random out of the whole collection and filled to the brim,
          // for a player who would rather be handed a deck than build one.
          this._working = CGx.shuffledDeck();
          this._filter = FILTERS.indexOf("deck");
          this._index = 0;
          playSe("Casino/card_fan_2", 80, 100);
          this.flourish();
          break;
        case "reroll": {
          const key = this.selectedKey();
          if (key) { this.rerollSeed(key); playSe("Casino/card_fan_1", 60, 110); }
          break;
        }
        case "practice":
          if (window.CardDuel) { SoundManager.playOk(); window.CardDuel.startPractice(); return; }
          break;
        case "close":
          SoundManager.playCancel();
          this.popScene();
          return;
      }
      this.render();
    }

    //-------------------------------------------------------------------------
    // Input
    //-------------------------------------------------------------------------

    updateInput() {
      if (Input.isTriggered("cancel")) {
        if (this._area !== "grid") { this._area = "grid"; SoundManager.playCancel(); this.render(); return; }
        SoundManager.playCancel();
        this.popScene();
        return;
      }
      if (Input.isTriggered("pageup") || Input.isTriggered("pagedown")) {
        const step = Input.isTriggered("pagedown") ? 1 : -1;
        this._filter = (this._filter + step + FILTERS.length) % FILTERS.length;
        this._index = 0;
        this.flourish();
        SoundManager.playCursor();
        this.render();
        return;
      }

      if (this._area === "actions") {
        const list = this.actions();
        if (Input.isRepeated("right")) { this._actionIndex = (this._actionIndex + 1) % list.length; SoundManager.playCursor(); this.render(); }
        else if (Input.isRepeated("left")) { this._actionIndex = (this._actionIndex - 1 + list.length) % list.length; SoundManager.playCursor(); this.render(); }
        else if (Input.isRepeated("up")) { this._area = "grid"; SoundManager.playCursor(); this.render(); }
        else if (Input.isTriggered("ok")) {
          const item = list[this._actionIndex];
          if (item && item.enabled) this.runAction(item.id); else SoundManager.playBuzzer();
        }
        return;
      }

      const keys = this.visibleKeys();
      const cols = this._cols || 5;
      if (Input.isRepeated("right")) { this.moveIndex(1, keys.length); }
      else if (Input.isRepeated("left")) { this.moveIndex(-1, keys.length); }
      else if (Input.isRepeated("down")) {
        if (this._index + cols >= keys.length) { this._area = "actions"; SoundManager.playCursor(); this.render(); }
        else this.moveIndex(cols, keys.length);
      } else if (Input.isRepeated("up")) { this.moveIndex(-cols, keys.length); }
      else if (Input.isTriggered("ok")) {
        const key = this.selectedKey();
        if (!key) { SoundManager.playBuzzer(); return; }
        if (FILTERS[this._filter] === "deck") this.removeFromDeck(key); else this.addToDeck(key);
      } else if (Input.isTriggered("shift")) {
        const key = this.selectedKey();
        if (key) this.removeFromDeck(key);
      }
    }

    // Riffle the shelf on the next render.
    flourish() {
      this._flourish = true;
    }

    moveIndex(delta, length) {
      if (!length) return;
      this._index = Math.max(0, Math.min(length - 1, this._index + delta));
      SoundManager.playCursor();
      this.render();
      const cell = document.querySelector("#cardcol-container .cgc-cell.selected");
      if (cell) cell.scrollIntoView({ block: "nearest" });
    }

    //-------------------------------------------------------------------------
    // Rendering
    //-------------------------------------------------------------------------

    buildDOM() {
      let container = document.getElementById("cardcol-container");
      if (!container) {
        container = document.createElement("div");
        container.id = "cardcol-container";
        document.body.appendChild(container);
      }
      container.innerHTML = `
        <div class="book-spread">
          <div class="left-page cgc-left">
            <div class="page-header-bar">
              <div class="back-button focusable" id="cgc-back">${escapeHtml(T("CardGame.col.close"))}</div>
              <div class="title">${escapeHtml(T("CardGame.col.title"))}</div>
              <span class="cgc-count" id="cgc-count"></span>
            </div>
            <div class="backpack-tabs" id="cgc-tabs"></div>
            <div class="cgc-grid" id="cgc-grid"></div>
          </div>
          <div class="right-page cgc-right">
            <div class="cgc-dossier" id="cgc-dossier"></div>
            <div class="cgc-deck" id="cgc-deck"></div>
            <div class="cgc-actions" id="cgc-actions"></div>
          </div>
        </div>`;
      // The way out stands where every other screen keeps it: first child of
      // the header bar. Cancel does the same thing from anywhere on the page.
      const back = container.querySelector("#cgc-back");
      if (back) back.addEventListener("click", () => this.runAction("close"));
    }

    render() {
      const container = document.getElementById("cardcol-container");
      if (!container) return;
      this.renderTabs(container);
      this.renderGrid(container);
      this.renderDossier(container);
      this.renderDeck(container);
      this.renderActions(container);
    }

    renderTabs(container) {
      const CGx = CG();
      const tabs = container.querySelector("#cgc-tabs");
      tabs.innerHTML = FILTERS.map((id, i) => {
        const label = id === "deck"
          ? T("CardGame.col.tabDeck", { n: this._working.length })
          : T("CardGame.col.tab." + id);
        return `<div class="backpack-tab focusable${i === this._filter ? " active" : ""}" data-i="${i}">${escapeHtml(label)}</div>`;
      }).join("");
      tabs.querySelectorAll(".backpack-tab").forEach((el) => {
        el.addEventListener("click", () => {
          this._filter = parseInt(el.dataset.i, 10);
          this._index = 0;
          this.flourish();
          SoundManager.playCursor();
          this.render();
        });
      });
      container.querySelector("#cgc-count").textContent = T("CardGame.col.owned", {
        cards: CGx.totalOwned(),
        distinct: CGx.ownedKeys().length,
        pct: CGx.completion().toFixed(1)
      });
    }

    renderGrid(container) {
      const CGx = CG();
      const grid = container.querySelector("#cgc-grid");
      const keys = this.visibleKeys();
      this._index = Math.max(0, Math.min(this._index, Math.max(0, keys.length - 1)));

      if (!keys.length) {
        grid.innerHTML = `<div class="cgc-empty">${escapeHtml(T("CardGame.col.empty"))}</div>`;
        return;
      }

      const isDeckTab = FILTERS[this._filter] === "deck";
      grid.innerHTML = keys.map((key, i) => {
        const qty = isDeckTab ? this.inDeck(key) : CGx.countOf(key);
        const rare = CGx.rarityKey(CGx.rarityOf(key));
        const spent = !isDeckTab && this.spare(key) <= 0 ? " cgc-cell--spent" : "";
        return `<div class="cgc-cell rarity--${rare}${i === this._index ? " selected" : ""}${spent}" data-i="${i}" style="--d:${Math.min(i, 40)}">
            <div class="cgc-artcell"></div>
            <div class="cgc-lbl">${escapeHtml(CGx.nameOf(key))}</div>
            <span class="cgc-qty">x${qty}</span>
          </div>`;
      }).join("");

      // The riffle only plays when the shelf actually changed, never on every
      // cursor move.
      grid.classList.toggle("cgc-dealing", !!this._flourish);
      if (this._flourish) {
        this._flourish = false;
        setTimeout(() => grid.classList.remove("cgc-dealing"), 900);
      }

      grid.querySelectorAll(".cgc-cell").forEach((el, i) => {
        const key = keys[i];
        const host = el.querySelector(".cgc-artcell");
        if (CGx.isEquip(key) || CGx.isEffect(key)) {
          const glyph = document.createElement("span");
          glyph.setAttribute("style", CGx.Art.iconStyle(key, 40));
          host.appendChild(glyph);
        } else {
          const canvas = document.createElement("canvas");
          canvas.width = 40; canvas.height = 40;
          canvas.className = "cgc-cell-canvas";
          // Keyed, not positional: gear and effect cells carry a glyph rather
          // than a canvas, so the nth canvas is not the nth card.
          canvas.dataset.k = key;
          host.appendChild(canvas);
          CGx.Art.drawTileSprite(canvas, key, this._spriteFrame);
        }
        el.addEventListener("click", () => {
          this._index = i;
          this._area = "grid";
          if (isDeckTab) this.removeFromDeck(key); else this.addToDeck(key);
        });
      });

      // The real column count, so up/down walks the grid the player sees.
      const first = grid.querySelector(".cgc-cell");
      if (first) {
        const width = grid.clientWidth || 1;
        this._cols = Math.max(1, Math.floor(width / (first.offsetWidth + 6)));
      }
    }

    renderDossier(container) {
      const CGx = CG();
      const host = container.querySelector("#cgc-dossier");
      const key = this.selectedKey();
      if (!key) { host.innerHTML = `<div class="ui-empty"><div class="ui-empty-text">${escapeHtml(T("CardGame.col.pickACard"))}</div></div>`; return; }
      const stats = CGx.statsFor(key);
      const seed = this.seedFor(key);
      const effect = CGx.isEffect(key);
      const type = effect ? T("CardGame.type.effect")
        : CGx.isMonster(key) ? T("CardGame.type.monster")
          : CGx.isWeapon(key) ? T("CardGame.type.weapon") : T("CardGame.type.armor");
      const rare = CGx.rarityKey(CGx.rarityOf(key));
      host.innerHTML = `
        <div class="ui-detail-head">
          <div class="ui-detail-titles">
            <h2>${escapeHtml(CGx.nameOf(key))}</h2>
            <div class="ui-detail-sub rarity--${rare}">${escapeHtml(type)} &middot; ${escapeHtml(CGx.rarityName(CGx.rarityOf(key)))}</div>
          </div>
        </div>
        <div class="ui-detail-scroll">
          <div class="cgc-art" id="cgc-art"></div>
          ${effect ? "" : `<div class="inspect-section-title">${escapeHtml(T("CardGame.col.statsHeading"))}</div>
          <div class="inspect-spec-grid">
            ${CGx.STATS.map((id) => `<div class="inspect-spec-row"><span class="inspect-spec-label">${escapeHtml(CGx.statLabel(id))}</span><span class="inspect-spec-value">${stats[id]}</span></div>`).join("")}
            <div class="inspect-spec-row"><span class="inspect-spec-label">${escapeHtml(T("CardGame.col.powerLabel"))}</span><span class="inspect-spec-value">${CGx.statTotal(stats)}</span></div>
          </div>`}
          <div class="ui-prose">${escapeHtml(CGx.cardText(key, seed))}</div>
        </div>`;
      fillArt(host.querySelector("#cgc-art"), key, 96);
    }

    renderDeck(container) {
      const CGx = CG();
      const host = container.querySelector("#cgc-deck");
      const legal = CGx.deckLegality(this._working);
      const name = this._deckIndex >= 0 && CGx.decks()[this._deckIndex]
        ? CGx.decks()[this._deckIndex].name
        : T("CardGame.col.unsavedDeck");
      const reason = legal.ok ? T("CardGame.col.deckLegal")
        : legal.reason === "tooFew" ? T("CardGame.col.deckTooFew", { min: CGx.DECK_MIN })
          : legal.reason === "tooMany" ? T("CardGame.col.deckTooMany", { max: CGx.DECK_MAX })
            : T("CardGame.col.deckNotOwned");

      const counts = {};
      this._working.forEach((key) => { counts[key] = (counts[key] || 0) + 1; });
      const rows = Object.keys(counts).sort((a, b) => CGx.nameOf(a).localeCompare(CGx.nameOf(b)))
        .map((key) => `<div class="cgc-deckrow inspect-spec-row" data-k="${escapeHtml(key)}">
            <span class="inspect-spec-label">${escapeHtml(CGx.nameOf(key))}</span><span class="inspect-spec-value">x${counts[key]}</span></div>`).join("");

      host.innerHTML = `
        <div class="inspect-section-title">${escapeHtml(T("CardGame.col.deckHeading"))}</div>
        <div class="inspect-spec-grid">
          <div class="inspect-spec-row"><span class="inspect-spec-label">${escapeHtml(name)}</span><span class="inspect-spec-value">${this._working.length} / ${CGx.DECK_MAX}</span></div>
          <div class="inspect-spec-row"><span class="inspect-spec-label">${escapeHtml(T("CardGame.col.legalLabel"))}</span><span class="inspect-spec-value ${legal.ok ? "cgc-legal--ok" : "cgc-legal--bad"}">${escapeHtml(reason)}</span></div>
        </div>
        <div class="cgc-decklist inspect-spec-grid">${rows || `<div class="ui-empty-note">${escapeHtml(T("CardGame.col.deckEmpty"))}</div>`}</div>`;

      host.querySelectorAll(".cgc-deckrow").forEach((el) => {
        el.addEventListener("click", () => this.removeFromDeck(el.dataset.k));
      });
    }

    renderActions(container) {
      const host = container.querySelector("#cgc-actions");
      const list = this.actions();
      host.innerHTML = list.map((item, i) => {
        const cls = "inspect-btn focusable"
          + (this._area === "actions" && i === this._actionIndex ? " selected" : "")
          + (item.enabled ? "" : " inspect-btn--disabled");
        return `<button class="${cls}" data-i="${i}">${escapeHtml(item.label)}</button>`;
      }).join("");
      host.querySelectorAll(".inspect-btn").forEach((el) => {
        el.addEventListener("click", () => {
          const item = list[parseInt(el.dataset.i, 10)];
          this._area = "actions";
          this._actionIndex = parseInt(el.dataset.i, 10);
          if (item && item.enabled) this.runAction(item.id); else SoundManager.playBuzzer();
        });
      });
    }

    updateSprites() {
      this._spriteTimer++;
      if (this._spriteTimer < 16) return;
      this._spriteTimer = 0;
      this._spriteFrame = (this._spriteFrame + 1) % 3;
      const container = document.getElementById("cardcol-container");
      if (!container) return;
      container.querySelectorAll("#cgc-grid .cgc-cell canvas").forEach((canvas) => {
        const key = canvas.dataset.k;
        if (key) CG().Art.drawTileSprite(canvas, key, this._spriteFrame);
      });
    }
  }

  window.Scene_CardCollection = Scene_CardCollection;

  //===========================================================================
  // Scene_CardBooster
  //===========================================================================
  // The pack sits there wobbling until it is torn open; the cards fly out in an
  // arc face down and turn over one at a time, brighter the rarer they are.

  class Scene_CardBooster extends Scene_MenuBase {
    prepare(keys) {
      this._keys = keys || [];
    }

    create() {
      super.create();
      if (this._helpWindow) { this._helpWindow.deactivate(); this._helpWindow.hide(); }
      const CGx = CG();
      if (!this._keys || !this._keys.length) this._keys = CGx.rollBooster(CGx.PACK_SIZE, { luck: CGx.streakLuck() });
      // Banked the moment the pack is opened, so closing the scene early never
      // costs the player the cards.
      this._rows = CGx.openBooster(this._keys);
      this._stage = "sealed";   // sealed | dealing | revealing | done
      this._revealed = 0;
      this.buildDOM();
      playSe("Casino/cards_pack_take_out_1", 85, 100);
    }

    update() {
      super.update();
      if (Input.isTriggered("ok") || TouchInput.isTriggered()) this.advance();
      else if (Input.isTriggered("cancel")) {
        if (this._stage === "sealed") this.advance(); else this.finish();
      }
    }

    terminate() {
      const container = document.getElementById("cardpack-container");
      if (container) container.remove();
      super.terminate();
    }

    finish() {
      if (this._leaving) return;
      this._leaving = true;
      SoundManager.playCancel();
      this.popScene();
    }

    advance() {
      if (this._stage === "sealed") { this.rip(); return; }
      if (this._stage === "revealing") { this.revealAll(); return; }
      if (this._stage === "done") this.finish();
    }

    buildDOM() {
      let container = document.getElementById("cardpack-container");
      if (!container) {
        container = document.createElement("div");
        container.id = "cardpack-container";
        document.body.appendChild(container);
      }
      container.innerHTML = `
        <div class="cp-title">${escapeHtml(T("CardGame.pack.title"))}</div>
        <div class="cp-flash" id="cp-flash"></div>
        <div class="cp-pack" id="cp-pack">${escapeHtml(T("CardGame.pack.sealed"))}</div>
        <div class="cp-row" id="cp-row" style="display:none"></div>
        <div class="cp-hint" id="cp-hint"></div>`;
      container.querySelector("#cp-pack").addEventListener("click", () => this.advance());
    }

    rip() {
      const container = document.getElementById("cardpack-container");
      if (!container) return;
      this._stage = "dealing";
      const pack = container.querySelector("#cp-pack");
      pack.classList.add("cp-rip");
      container.querySelector("#cp-flash").classList.add("on");
      playSe("Casino/cards_pack_open_1", 90, 100);
      container.querySelector("#cp-hint").textContent = "";

      setTimeout(() => {
        if (!container.isConnected) return;
        pack.style.display = "none";
        this.dealCards();
      }, 380);
    }

    dealCards() {
      const container = document.getElementById("cardpack-container");
      if (!container) return;
      const row = container.querySelector("#cp-row");
      row.style.display = "flex";
      row.innerHTML = "";

      this._rows.forEach((entry, i) => {
        const el = document.createElement("div");
        el.className = "cp-card cp-back rr" + entry.rarity;
        el.dataset.i = String(i);
        // Out of the middle of the pack and into its place in the row.
        const spread = i - (this._rows.length - 1) / 2;
        el.style.setProperty("--fx", (-spread * 150) + "px");
        el.style.setProperty("--fy", "40px");
        el.style.setProperty("--fr", (-spread * 12) + "deg");
        el.innerHTML = `<div class="cp-seal">&#9670;</div><div class="cp-front"></div>`;
        el.addEventListener("click", () => this.advance());
        row.appendChild(el);
        setTimeout(() => {
          if (!el.isConnected) return;
          el.classList.add("cp-fly");
          playSe("Casino/card_slide_" + (1 + (i % 8)), 55, 120 + i * 6);
        }, i * 70);
      });

      setTimeout(() => {
        if (!container.isConnected) return;
        this._stage = "revealing";
        this.revealNext();
      }, this._rows.length * 70 + 420);
    }

    revealNext() {
      if (this._stage !== "revealing") return;
      if (this._revealed >= this._rows.length) { this.done(); return; }
      this.reveal(this._revealed++);
      this._revealTimer = setTimeout(() => this.revealNext(), 340);
    }

    revealAll() {
      clearTimeout(this._revealTimer);
      while (this._revealed < this._rows.length) this.reveal(this._revealed++);
      this.done();
    }

    reveal(index) {
      const container = document.getElementById("cardpack-container");
      if (!container) return;
      const CGx = CG();
      const entry = this._rows[index];
      const el = container.querySelector(`.cp-card[data-i="${index}"]`);
      if (!el || !entry) return;

      const stats = CGx.statsFor(entry.key);
      const front = el.querySelector(".cp-front");
      front.innerHTML = `
        <div class="cp-name">${escapeHtml(CGx.nameOf(entry.key))}</div>
        <div class="cp-art"></div>
        <div class="cp-stats">
          ${CGx.STATS.map((id) => `<div>${escapeHtml(CGx.statLabel(id))}<b>${stats[id]}</b></div>`).join("")}
        </div>`;
      fillArt(front.querySelector(".cp-art"), entry.key, 56);
      el.classList.remove("cp-back");
      el.classList.add("cp-flip");
      if (entry.isNew) {
        const ribbon = document.createElement("div");
        ribbon.className = "cp-new";
        ribbon.textContent = T("CardGame.pack.newCard");
        el.appendChild(ribbon);
      }

      // Anything above common comes out of the pack with a burst; a legendary
      // brings the fanfare with it.
      if (entry.rarity >= CGx.RARITY.RARE) {
        for (let i = 0; i < 8 + entry.rarity * 4; i++) {
          const spark = document.createElement("div");
          spark.className = "cp-burst";
          const angle = Math.random() * Math.PI * 2;
          const dist = 40 + Math.random() * 70;
          spark.style.setProperty("--bx", Math.cos(angle) * dist + "px");
          spark.style.setProperty("--by", Math.sin(angle) * dist + "px");
          el.appendChild(spark);
          setTimeout(() => spark.remove(), 640);
        }
      }
      playSe(
        entry.rarity >= CGx.RARITY.LEGENDARY ? "Saint5"
          : entry.rarity >= CGx.RARITY.EPIC ? "Chime1"
            : entry.rarity >= CGx.RARITY.RARE ? "Bell1" : "Casino/card_place_1",
        entry.rarity >= CGx.RARITY.RARE ? 85 : 60,
        100 + index * 4
      );
    }

    done() {
      if (this._stage === "done") return;
      this._stage = "done";
      const container = document.getElementById("cardpack-container");
      if (!container) return;
      const best = this._rows.reduce((r, e) => Math.max(r, e.rarity), 0);
      const fresh = this._rows.filter((e) => e.isNew).length;
      container.querySelector("#cp-hint").textContent = T("CardGame.pack.summary", {
        best: CG().rarityName(best), fresh
      });
    }
  }

  window.Scene_CardBooster = Scene_CardBooster;

  //===========================================================================
  // Entry points
  //===========================================================================

  //===========================================================================
  // Binding a monster into a card, mid-battle
  //===========================================================================
  // The weakest thing still standing is the one that can be bound: a creature
  // at full strength shrugs it off, and one far above the party's weight class
  // cannot be held at all. The caster's PSI is what does the holding.
  //
  // A bound creature still DIES: full damage, the ordinary collapse, the
  // ordinary corpse and the ordinary spoils. The card is what is left of it.

  const CAPTURE_LEVEL_MARGIN = 10;  // levels above the party median before it is hopeless
  const CAPTURE_BASE = 12;          // floor, against a creature at full health
  const CAPTURE_FROM_WOUNDS = 62;   // how much a nearly-dead creature adds
  const CAPTURE_FROM_PSI = 30;      // how much the caster's PSI adds at best

  function partyMedianLevel() {
    const levels = $gameParty.members().map((m) => m.level || 1).sort((a, b) => a - b);
    if (!levels.length) return 1;
    const mid = levels.length >> 1;
    return levels.length % 2 ? levels[mid] : Math.round((levels[mid - 1] + levels[mid]) / 2);
  }

  function enemyLevelOf(enemy) {
    const data = enemy.enemy();
    const m = String(data && data.note || "").match(/<Level:\s*(\d+)>/i);
    return m ? parseInt(m[1], 10) : partyMedianLevel();
  }

  // Whoever is acting when the command fires, falling back to the leader for a
  // capture triggered outside anyone's turn (an event, a debug call).
  function captureCaster() {
    const subject = BattleManager._subject;
    if (subject && subject.isActor && subject.isActor()) return subject;
    return $gameParty.leader();
  }

  // The odds, and everything the caller needs to explain them.
  function captureOdds(enemy, caster, bonus) {
    const CGx = window.CardGame;
    const key = CGx.monsterKey(enemy.enemyId());
    const level = enemyLevelOf(enemy);
    const median = partyMedianLevel();
    const over = level - median;

    if (!CGx.catalogue().monsters.includes(key)) return { chance: 0, reason: "noCard", key, level, median };
    if (over > CAPTURE_LEVEL_MARGIN) return { chance: 0, reason: "tooStrong", key, level, median };

    // Wounds are most of it: a creature is bound when it can no longer resist.
    const wounded = Math.pow(1 - enemy.hpRate(), 1.5);
    // PSI is measured against the creature's own, so the figure means the same
    // thing at level 3 and at level 90.
    const psi = caster ? (caster.mat || 0) : 0;
    const resist = Math.max(1, enemy.mat || 1);
    const psiShare = psi / (psi + resist);

    let chance = CAPTURE_BASE + CAPTURE_FROM_WOUNDS * wounded + CAPTURE_FROM_PSI * psiShare;
    // Still costly inside the margin: every level over the party's median bites.
    if (over > 0) chance -= over * 3;
    chance += Number(bonus) || 0;
    return {
      chance: Math.max(1, Math.min(95, Math.round(chance))),
      reason: null, key, level, median,
      wounded: Math.round(wounded * 100), psiShare: Math.round(psiShare * 100)
    };
  }

  // The weakest creature left on the field, by remaining hit points and then
  // by how little it had to begin with.
  function weakestEnemy() {
    const alive = $gameTroop.aliveMembers().filter((e) => !e.isHidden || !e.isHidden());
    if (!alive.length) return null;
    return alive.reduce((best, e) => {
      if (!best) return e;
      if (e.hp !== best.hp) return e.hp < best.hp ? e : best;
      return e.mhp < best.mhp ? e : best;
    }, null);
  }

  function battleSay(text) {
    const log = BattleManager._logWindow;
    if (log && log.addText) { log.addText(text); log.wait && log.wait(); return; }
    try { window.ParchmentToast && window.ParchmentToast.show(text, { severity: "info", duration: 150 }); }
    catch (e) { /* a popup never breaks a battle */ }
  }

  window.CardCapture = {
    odds: captureOdds,
    target: weakestEnemy,

    // Returns { ok, chance, key, reason } and does everything a success means.
    attempt(bonus) {
      const CGx = window.CardGame;
      if (!CGx || typeof $gameTroop === "undefined" || !$gameParty.inBattle()) {
        return { ok: false, reason: "notInBattle" };
      }
      const enemy = weakestEnemy();
      if (!enemy) return { ok: false, reason: "noTarget" };

      const caster = captureCaster();
      const odds = captureOdds(enemy, caster, bonus);
      const name = enemy.name();

      if (odds.reason === "tooStrong") {
        battleSay(T("CardGame.capture.tooStrong", { name, level: odds.level, median: odds.median }));
        playSe("Buzzer1", 70, 100);
        return { ok: false, reason: odds.reason, chance: 0 };
      }
      if (odds.reason === "noCard") {
        battleSay(T("CardGame.capture.noCard", { name }));
        playSe("Buzzer1", 70, 100);
        return { ok: false, reason: odds.reason, chance: 0 };
      }

      if (Math.randomInt(100) >= odds.chance) {
        battleSay(T("CardGame.capture.failed", { name, chance: odds.chance }));
        playSe("Casino/card_shove_2", 70, 90);
        return { ok: false, reason: "roll", chance: odds.chance };
      }

      const isNew = CGx.countOf(odds.key) === 0;
      CGx.addCard(odds.key, 1);

      // Bound, and then killed the ordinary way: full damage, the engine's own
      // collapse, and every drop and corpse that death normally leaves.
      enemy.gainHp(-Math.max(enemy.hp, enemy.mhp));
      enemy.refresh();
      if (enemy.isDead()) enemy.performCollapse();

      battleSay(T(isNew ? "CardGame.capture.boundNew" : "CardGame.capture.bound", { name }));
      playSe("Casino/cards_pack_take_out_2", 90, 105);
      try {
        window.ParchmentToast && window.ParchmentToast.show(
          T(isNew ? "CardGame.capture.boundNew" : "CardGame.capture.bound", { name }),
          { severity: "good", duration: 170 }
        );
      } catch (e) { /* cosmetic */ }
      return { ok: true, chance: odds.chance, key: odds.key, isNew };
    }
  };

  window.CardBooster = {
    // Open a specific set of cards (a duel reward), or roll a fresh pack.
    open(keys) {
      SceneManager.push(Scene_CardBooster);
      SceneManager.prepareNextScene(keys || null);
    },
    roll(size, opts) {
      this.open(window.CardGame.rollBooster(size, opts));
    }
  };

  //===========================================================================
  // Cadd Trader: the card market, as a Hypernet OS program
  //===========================================================================
  // A 2001 auction site for cards. It lists a handful of lots a day, sells
  // them out for good, and buys the party's own spares at the shop's own
  // price. Everything it knows about worth it asks CardGameCore for
  // (CardGame.marketToday / sellableCards / buyLot / sellCard), so the site is
  // a window onto the market rather than a second set of prices.

  const TRADER_APP_ID = "app-cadd-trader";
  const TRADER_WINDOW_ID = "win-cadd-trader";
  const TRADER_ICON = 416;   // the card icon the main menu already uses

  // Money is euros everywhere in the game: the raw figure carries two implied
  // decimals, the same split MoneyFormatter draws.
  function traderEuros(gold) {
    const value = Math.round(Number(gold) || 0);
    const unit = ($dataSystem && $dataSystem.currencyUnit) || "";
    const str = String(Math.abs(value));
    let main = str.length <= 2 ? "0." + str.padStart(2, "0") : str.slice(0, -2) + "." + str.slice(-2);
    if (main.endsWith(".00")) main = main.slice(0, -3);
    return main + (unit ? " " + unit : "");
  }

  // One line of stats, printed the way a card prints them.
  function traderStatLine(key) {
    const CGx = CG();
    const stats = CGx.statsFor(key);
    return CGx.STATS.map((id) => CGx.statLabel(id) + " " + stats[id]).join("  ");
  }

  window.CaddTrader = {
    launch() {
      const OS = window.HypernetOS;
      const CGx = CG();
      if (!OS || !OS.Syscalls || !CGx) return;

      let tab = "buy";
      let status = T("CardGame.trader.hint");
      let error = false;

      const contentHTML = `
        <div id="ct-root" style="display:flex; flex-direction:column; height:100%; font-family:Tahoma,sans-serif; background:var(--xp-bg); overflow:hidden">
          <div style="background:linear-gradient(135deg, var(--xp-navy-8) 0%, var(--xp-navy-7) 55%, var(--xp-sky) 100%); padding:10px 16px; display:flex; align-items:center; gap:12px; border-bottom:2px solid var(--xp-navy-6); flex-shrink:0">
            <div>
              <div style="color:var(--xp-gold); font-weight:bold; font-size:17px; letter-spacing:2px">${escapeHtml(T("CardGame.trader.banner"))}</div>
              <div style="color:#cfe6ff; font-size:13px; margin-top:2px">${escapeHtml(T("CardGame.trader.tagline"))}</div>
            </div>
            <div style="margin-left:auto; text-align:right; color:#cfe6ff; font-size:13px; line-height:1.5">
              <div>${escapeHtml(T("CardGame.trader.wallet"))}</div>
              <div id="ct-wallet" style="color:var(--xp-gold); font-weight:bold; font-size:16px">&nbsp;</div>
            </div>
          </div>
          <div style="display:flex; gap:6px; padding:8px 12px 4px 12px; flex-shrink:0">
            <button id="ct-tab-buy" class="focusable" data-focus-key="ct-tab-buy" tabindex="0"
                    style="flex:1; padding:6px 0; font-size:15px; font-weight:bold; font-family:Tahoma,sans-serif; cursor:pointer; border:1px solid var(--xp-steel)">${escapeHtml(T("CardGame.trader.tabBuy"))}</button>
            <button id="ct-tab-sell" class="focusable" data-focus-key="ct-tab-sell" tabindex="0"
                    style="flex:1; padding:6px 0; font-size:15px; font-weight:bold; font-family:Tahoma,sans-serif; cursor:pointer; border:1px solid var(--xp-steel)">${escapeHtml(T("CardGame.trader.tabSell"))}</button>
          </div>
          <div id="ct-list" style="flex:1; overflow-y:auto; padding:6px 12px 12px 12px; display:flex; flex-direction:column; gap:5px"></div>
          <div id="ct-status" style="border-top:1px solid var(--xp-ink-pale-2); padding:3px 10px; background:var(--xp-bg); font-size:13px; color:var(--xp-text-muted); flex-shrink:0">&nbsp;</div>
        </div>`;

      const win = OS.Syscalls.createWindow({
        id: TRADER_WINDOW_ID,
        title: T("CardGame.trader.title"),
        contentHTML,
        width: 620,
        height: 480,
        icon: TRADER_ICON
      });

      const el = (id) => win.querySelector("#" + id);

      function row(inner, key) {
        return `<div class="focusable" data-focus-key="${key}" tabindex="0" data-row="${key}"
                     style="display:flex; align-items:center; gap:10px; background:var(--xp-white); border:1px solid var(--xp-silver-3); padding:6px 9px">${inner}</div>`;
      }

      function priceTag(text, colour) {
        return `<div style="text-align:right; min-width:96px; font-size:16px; font-weight:bold; color:${colour}">${escapeHtml(text)}</div>`;
      }

      function cardCell(cardKey, note) {
        const rare = CGx.rarityKey(CGx.rarityOf(cardKey));
        return `<div style="flex:1; min-width:0">
            <div style="font-size:15px; font-weight:bold; color:var(--xp-ink-3); overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${escapeHtml(CGx.nameOf(cardKey))}</div>
            <div class="rarity--${rare}" style="font-size:12px; color:var(--xp-ink-soft)">${escapeHtml(CGx.rarityName(CGx.rarityOf(cardKey)))} &middot; ${escapeHtml(traderStatLine(cardKey))}${note ? " &middot; " + escapeHtml(note) : ""}</div>
          </div>`;
      }

      function renderBuy() {
        const lots = CGx.marketToday();
        if (!lots.length) return `<div style="padding:14px; color:var(--xp-ink-soft)">${escapeHtml(T("CardGame.trader.emptyStock"))}</div>`;
        return lots.map((lot) => {
          const note = T("CardGame.trader.owned", { n: CGx.countOf(lot.key) });
          const left = lot.left > 0 ? T("CardGame.trader.left", { n: lot.left }) : T("CardGame.trader.soldOut");
          return row(
            cardCell(lot.key, note)
            + `<div style="min-width:78px; text-align:right; font-size:12px; color:${lot.left > 0 ? "var(--xp-ink-soft)" : "#8B1A00"}">${escapeHtml(left)}</div>`
            + priceTag(traderEuros(lot.price), "var(--xp-navy-7)")
            + `<button data-buy="${lot.index}" ${lot.left > 0 ? "" : "disabled"}
                       style="padding:5px 12px; font-family:Tahoma,sans-serif; font-size:14px; cursor:${lot.left > 0 ? "pointer" : "default"};
                              border:1px solid var(--xp-steel); background:var(--xp-bg); opacity:${lot.left > 0 ? 1 : 0.5}">${escapeHtml(T("CardGame.trader.buy"))}</button>`,
            "ct-lot-" + lot.index
          );
        }).join("");
      }

      function renderSell() {
        const mine = CGx.sellableCards();
        if (!mine.length) return `<div style="padding:14px; color:var(--xp-ink-soft)">${escapeHtml(T("CardGame.trader.emptyShelf"))}</div>`;
        return mine.map((entry) => row(
          cardCell(entry.key, T("CardGame.trader.owned", { n: entry.count }))
          + priceTag(traderEuros(entry.price), "#1d6b2f")
          + `<button data-sell="${entry.key}"
                     style="padding:5px 12px; font-family:Tahoma,sans-serif; font-size:14px; cursor:pointer;
                            border:1px solid var(--xp-steel); background:var(--xp-bg)">${escapeHtml(T("CardGame.trader.sell"))}</button>`,
          "ct-own-" + entry.key
        )).join("");
      }

      function render() {
        el("ct-wallet").textContent = traderEuros($gameParty.gold());
        const paint = (btn, on) => {
          btn.style.background = on ? "linear-gradient(180deg,var(--xp-sky-2),var(--xp-navy-7))" : "#ece9d8";
          btn.style.color = on ? "#ffffff" : "#333333";
        };
        paint(el("ct-tab-buy"), tab === "buy");
        paint(el("ct-tab-sell"), tab === "sell");
        el("ct-list").innerHTML = tab === "buy" ? renderBuy() : renderSell();
        const line = el("ct-status");
        line.textContent = status;
        line.style.color = error ? "#8B1A00" : "var(--xp-text-muted)";
        bind();
      }

      function say(text, bad) {
        status = text;
        error = !!bad;
      }

      function onBuy(index) {
        const result = CGx.buyLot(Number(index));
        if (!result.ok) {
          playSe("Buzzer1", 70, 100);
          say(result.reason === "poor"
            ? T("CardGame.trader.tooDear", { price: traderEuros(result.price) })
            : T("CardGame.trader.soldOut"), true);
        } else {
          playSe("Casino/cards_pack_take_out_2", 80, 105);
          say(T("CardGame.trader.bought", { name: CGx.nameOf(result.key), price: traderEuros(result.price) }), false);
        }
        render();
      }

      function onSell(key) {
        const result = CGx.sellCard(key);
        if (!result.ok) {
          playSe("Buzzer1", 70, 100);
          say(T("CardGame.trader.cannotSell"), true);
        } else {
          playSe("Shop2", 80, 100);
          say(T("CardGame.trader.sold", { name: CGx.nameOf(result.key), price: traderEuros(result.price) }), false);
        }
        render();
      }

      // Re-bound after every redraw: the rows are rebuilt from state, and the
      // OS focus ring re-acquires them by their stable data-focus-key.
      function bind() {
        win.querySelectorAll("[data-buy]").forEach((btn) => {
          btn.addEventListener("click", (ev) => { ev.stopPropagation(); onBuy(btn.dataset.buy); });
        });
        win.querySelectorAll("[data-sell]").forEach((btn) => {
          btn.addEventListener("click", (ev) => { ev.stopPropagation(); onSell(btn.dataset.sell); });
        });
        // A row is one focus stop: activating it does what its button does, so
        // the keyboard and the pad never have to reach the button itself.
        win.querySelectorAll("[data-row]").forEach((line) => {
          line.addEventListener("click", () => {
            const btn = line.querySelector("[data-buy],[data-sell]");
            if (!btn || btn.disabled) return;
            if (btn.dataset.buy != null) onBuy(btn.dataset.buy);
            else onSell(btn.dataset.sell);
          });
        });
      }

      function setTab(next) {
        if (tab === next) return;
        tab = next;
        say(next === "buy" ? T("CardGame.trader.hint") : T("CardGame.trader.hintSell"), false);
        playSe("Cursor1", 70, 100);
        render();
      }

      el("ct-tab-buy").addEventListener("click", () => setTab("buy"));
      el("ct-tab-sell").addEventListener("click", () => setTab("sell"));
      render();
    }
  };

  if (window.HypernetOS) {
    window.HypernetOS.registerApp({
      id: TRADER_APP_ID,
      name: T("CardGame.trader.title"),
      icon: TRADER_ICON,
      category: "economy",
      desktopShortcut: true,
      launchFn: () => window.CaddTrader.launch()
    });
  }

  const openCollection = () => { SceneManager.push(Scene_CardCollection); };
  const openPack = (args) => {
    const CGx = window.CardGame;
    if (!CGx) return;
    const size = CGx.clamp(Number(args && args.size) || CGx.PACK_SIZE, 1, 12);
    window.CardBooster.roll(size, { luck: CGx.streakLuck() });
  };

  const captureCard = (args) => { window.CardCapture.attempt(Number(args && args.bonus) || 0); };

  PluginManager.registerCommand(PLUGIN, "OpenCardCollection", openCollection);
  PluginManager.registerCommand("CardGameCollection", "OpenCardCollection", openCollection);
  PluginManager.registerCommand(PLUGIN, "OpenBoosterPack", openPack);
  PluginManager.registerCommand("CardGameCollection", "OpenBoosterPack", openPack);
  PluginManager.registerCommand(PLUGIN, "CaptureEnemyAsCard", captureCard);
  PluginManager.registerCommand("CardGameCollection", "CaptureEnemyAsCard", captureCard);
})();
