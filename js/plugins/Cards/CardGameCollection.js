/*:
 * @target MZ
 * @plugindesc The card collection, the deck builder and the booster pack opening.
 * @author Esoteric Heavy Industries
 *
 * @command OpenCardCollection
 * @text Open Card Collection
 * @desc Opens the party's card collection and deck builder.
 *
 * @arg page
 * @text Page
 * @desc Which of the two pages it opens on: the deck builder, or the catalogue of every card that exists.
 * @type select
 * @option deck
 * @option collection
 * @default deck
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
 * The screen is two pages. The DECK BUILDER shows what the party owns beside
 * the deck being built: a card is clicked to put it in, its row in the list is
 * clicked to give it back, every deck the party keeps is a chip at the top of
 * the list, and the tally and the meter say how far the list is from legal. The
 * CARD COLLECTION shows every card that exists, held or not, with the ones
 * never held printed unlit; it is a reader, so the right page there is the card
 * itself rather than the deck. Both pages narrow through the one shared filter
 * strip (name, rarity and ordering) and are turned a page at a time.
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

  // The type filters, the same five on both pages. The deck is no longer one of
  // them: it stands on the right page at all times, the way a deck builder
  // keeps the list it is building in sight of the cards it is building it from.
  const FILTERS = ["all", "monsters", "weapons", "armor", "effects"];

  // The two pages the screen is: the builder, which shows what the party owns
  // and what the working deck is made of, and the collection, which shows the
  // whole catalogue, owned or not, and reads a card rather than deals it.
  const MODES = ["deck", "collection"];

  // The catalogue runs to thousands of records, so the shelf is paged rather
  // than laid out whole: one page is the faces that fit, with an honest count
  // under them.
  const PAGE_SIZE = 48;

  class Scene_CardCollection extends Scene_MenuBase {
    create() {
      super.create();
      if (this._helpWindow) { this._helpWindow.deactivate(); this._helpWindow.hide(); }

      const CGx = CG();
      // An event can send the player straight to the catalogue; anything else
      // opens on the bench, and the request is spent either way.
      this._mode = Scene_CardCollection._openOn === "collection" ? 1 : 0;
      Scene_CardCollection._openOn = null;
      this._filter = 0;
      this._index = 0;
      this._page = 0;
      this._flourish = true;
      this._area = "grid";      // grid | actions
      this._actionIndex = 0;
      this._spriteFrame = 1;
      this._spriteTimer = 0;
      this._leaving = false;
      // A per-card art seed, stable while the menu is open and re-rollable, so
      // a stack shows ONE representative specimen rather than flickering.
      this._seeds = {};

      // The one shared filter strip: the name field, the ordering and the
      // rarity picker all come from it, so this page narrows the way every
      // other long page in the game narrows.
      this._bar = window.MenuSearchBar ? window.MenuSearchBar.create({
        id: "cardcol",
        placeholder: T("CardGame.col.searchPlaceholder"),
        sorts: ["name", "level", "price"],
        sortLabels: {
          level: T("CardGame.col.sortPower"),
          price: T("CardGame.col.sortValue")
        },
        categories: () => CGx.RARITY_KEYS.map((key, i) => ({ key, label: CGx.rarityName(i) })),
        categoryLabel: T("CardGame.col.anyRarity"),
        onChange: () => { this._index = 0; this._page = 0; this.flourish(); this.render(); }
      }) : null;

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

    mode() {
      return MODES[this._mode];
    }

    inCollection() {
      return this.mode() === "collection";
    }

    seedFor(key) {
      if (this._seeds[key] == null) this._seeds[key] = CG().hashString(key + ":look") >>> 0;
      return this._seeds[key];
    }

    rerollSeed(key) {
      this._seeds[key] = CG().rollSeed();
      return this._seeds[key];
    }

    // Every card that exists, tricks included: the catalogue is the monsters
    // and the gear, the effects live in their own list, and the collection page
    // is the only place that prints a card the party has never held.
    everyKey() {
      if (!this._everyKey) {
        const CGx = CG();
        this._everyKey = (CGx.EFFECT_KEYS || []).concat(CGx.catalogue().all);
      }
      return this._everyKey;
    }

    // The pool the page draws from before any filter: the shelf on the builder,
    // the whole catalogue on the collection.
    poolKeys() {
      return this.inCollection() ? this.everyKey() : CG().ownedKeys();
    }

    // The filtered, ordered list the shelf shows, across every page.
    visibleKeys() {
      const CGx = CG();
      const mode = FILTERS[this._filter];
      let keys = this.poolKeys().filter((key) => {
        if (mode === "monsters") return CGx.isMonster(key);
        if (mode === "weapons") return CGx.isWeapon(key);
        if (mode === "armor") return CGx.isArmor(key);
        if (mode === "effects") return CGx.isEffect(key);
        return true;
      });
      if (this._bar) {
        keys = this._bar.apply(keys, (key) => ({
          name: CGx.nameOf(key),
          category: CGx.rarityKey(CGx.rarityOf(key)),
          level: CGx.statTotal(CGx.statsFor(key)),
          price: CGx.cardValue(key)
        }));
      } else {
        keys = keys.slice().sort((a, b) => {
          const r = CGx.rarityOf(b) - CGx.rarityOf(a);
          return r || CGx.nameOf(a).localeCompare(CGx.nameOf(b));
        });
      }
      return keys;
    }

    pageCount(total) {
      return Math.max(1, Math.ceil((total == null ? this.visibleKeys().length : total) / PAGE_SIZE));
    }

    selectedKey() {
      const keys = this.visibleKeys();
      if (this._index < 0) return null;
      return keys[this._index] || null;
    }

    inDeck(key) {
      return this._working.filter((k) => k === key).length;
    }

    // How many copies of this key are still on the shelf, unspent by the deck.
    spare(key) {
      return CG().countOf(key) - this.inDeck(key);
    }

    // Both answer whether the shelf actually moved, so a caller that has just
    // moved the cursor knows whether the page has already been redrawn for it
    // or whether it still owes the player a repaint. A click that lands on a
    // card it cannot take used to leave the screen exactly as it was, which
    // reads as a dead mouse rather than as a refusal.
    addToDeck(key) {
      const CGx = CG();
      if (!key) return false;
      if (this._working.length >= CGx.DECK_MAX) { SoundManager.playBuzzer(); return false; }
      if (this.spare(key) <= 0) { SoundManager.playBuzzer(); return false; }
      this._working.push(key);
      playSe("Casino/card_place_2", 65, 115);
      this.render();
      return true;
    }

    removeFromDeck(key) {
      const at = this._working.lastIndexOf(key);
      if (at < 0) { SoundManager.playBuzzer(); return false; }
      this._working.splice(at, 1);
      playSe("Casino/card_slide_3", 55, 100);
      this.render();
      return true;
    }

    //-------------------------------------------------------------------------
    // Actions
    //-------------------------------------------------------------------------

    // The builder keeps the deck's own verbs; the collection page is a reader
    // and keeps only the two that make sense over a card nobody is holding.
    actions() {
      const CGx = CG();
      const key = this.selectedKey();
      if (this.inCollection()) {
        return [
          { id: "take", label: T("CardGame.col.addToDeck"), enabled: !!key && this.spare(key) > 0 },
          { id: "reroll", label: T("CardGame.col.reroll"), enabled: !!key }
        ];
      }
      const legal = CGx.deckLegality(this._working);
      return [
        { id: "save", label: T("CardGame.col.saveDeck"), enabled: legal.ok },
        { id: "auto", label: T("CardGame.col.autoDeck"), enabled: true },
        { id: "shuffle", label: T("CardGame.col.shuffleDeck"), enabled: CGx.ownedKeys().length > 0 },
        { id: "clear", label: T("CardGame.col.clearDeck"), enabled: this._working.length > 0 },
        { id: "delete", label: T("CardGame.col.deleteDeck"), enabled: this._deckIndex >= 0 },
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
        case "clear":
          this._working = [];
          playSe("Casino/card_slide_3", 55, 95);
          break;
        case "delete": {
          if (this._deckIndex < 0) { SoundManager.playBuzzer(); return; }
          CGx.deleteDeck(this._deckIndex);
          this._deckIndex = CGx.decks().length ? Math.min(this._deckIndex, CGx.decks().length - 1) : -1;
          this._working = this._deckIndex >= 0 ? CGx.decks()[this._deckIndex].cards.slice() : [];
          if (this._deckIndex >= 0) CGx.setActiveDeck(this._deckIndex);
          SoundManager.playCancel();
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
          playSe("Casino/card_fan_2", 80, 100);
          break;
        case "take":
          this.addToDeck(this.selectedKey());
          return;
        case "reroll": {
          const key = this.selectedKey();
          if (key) { this.rerollSeed(key); playSe("Casino/card_fan_1", 60, 110); }
          break;
        }
        case "practice":
          if (window.CardDuel) { SoundManager.playOk(); window.CardDuel.startPractice(); return; }
          break;
        case "close":
          this.close();
          return;
      }
      this.render();
    }

    // Switching pages always starts the new shelf at the top, with the filters
    // the player had set left alone: the narrowing is theirs, not the page's.
    setMode(mode) {
      const at = MODES.indexOf(mode);
      if (at < 0 || at === this._mode) return;
      this._mode = at;
      this._index = 0;
      this._page = 0;
      this._area = "grid";
      this._actionIndex = 0;
      this.flourish();
      SoundManager.playOk();
      this.render();
    }

    // Loading a saved deck onto the bench, or starting a fresh one when the
    // chip clicked is the new-deck chip.
    pickDeck(index) {
      const CGx = CG();
      const list = CGx.decks();
      if (index < 0 || index >= list.length) { this.runAction("newDeck"); return; }
      this._deckIndex = index;
      this._working = list[index].cards.slice();
      CGx.setActiveDeck(index);
      SoundManager.playCursor();
      this.render();
    }

    close() {
      if (this._leaving) return;
      this._leaving = true;
      SoundManager.playCancel();
      this.popScene();
    }

    //-------------------------------------------------------------------------
    // Input
    deselect() {
      this._index = -1;
      this._area = null;
      SoundManager.playCancel();
      const container = document.getElementById("cardcol-container");
      if (!container) return;
      container.querySelectorAll("#cgc-grid .cgc-cell").forEach((el) => {
        el.classList.remove("selected");
      });
      container.querySelectorAll("#cgc-actions .inspect-btn").forEach((el) => {
        el.classList.remove("selected");
      });
      this.renderDossier(container);
    }

    onCancelAction() {
      if (this._area === "actions") {
        this._area = "grid";
        SoundManager.playCancel();
        this.render();
        return;
      }
      // The collection is a page the bench was left for, so the way back out of
      // it is the way back to the bench.
      if (this.inCollection()) { this.setMode("deck"); return; }
      if (this._index >= 0) {
        this.deselect();
        return;
      }
      this.close();
    }

    updateInput() {
      // A hot search field owns the keyboard: a gamepad poll must not walk the
      // cursor out from under the caret.
      if (window.MenuSearchBar && window.MenuSearchBar.isTyping()) return;

      if (Input.isTriggered("cancel") || TouchInput.isCancelled()) {
        this.onCancelAction();
        return;
      }
      if (Input.isTriggered("tab")) {
        this.setMode(this.inCollection() ? "deck" : "collection");
        return;
      }
      if (Input.isTriggered("pageup") || Input.isTriggered("pagedown")) {
        const step = Input.isTriggered("pagedown") ? 1 : -1;
        this._filter = (this._filter + step + FILTERS.length) % FILTERS.length;
        this._index = 0;
        this._page = 0;
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
        // Walking off the bottom of the last row lands on the buttons; on any
        // page but the last it turns the page instead.
        if (this._index + cols >= keys.length) { this._area = "actions"; SoundManager.playCursor(); this.render(); }
        else this.moveIndex(cols, keys.length);
      } else if (Input.isRepeated("up")) { this.moveIndex(-cols, keys.length); }
      else if (Input.isTriggered("ok")) {
        const key = this.selectedKey();
        if (!key) { SoundManager.playBuzzer(); return; }
        this.activate(key);
      } else if (Input.isTriggered("shift")) {
        const key = this.selectedKey();
        if (key) this.removeFromDeck(key);
      }
    }

    // What pressing a card does: the bench takes it, the catalogue only reads
    // it, since a card nobody owns cannot be dealt.
    activate(key) {
      if (this.inCollection()) { SoundManager.playCursor(); return; }
      this.addToDeck(key);
    }

    // Riffle the shelf on the next render.
    flourish() {
      this._flourish = true;
    }

    // Move the cursor onto a card without redrawing the shelf: the frames and
    // the dossier are all that a selection changes, and the grid is the one
    // part of the page that is expensive to build.
    selectAt(i) {
      if (this._area === "grid" && this._index === i) return;
      const container = document.getElementById("cardcol-container");
      if (!container) return;
      this._area = "grid";
      this._index = i;
      container.querySelectorAll("#cgc-grid .cgc-cell").forEach((el) => {
        el.classList.toggle("selected", parseInt(el.dataset.i, 10) === i);
      });
      container.querySelectorAll("#cgc-actions .inspect-btn").forEach((el) => {
        el.classList.remove("selected");
      });
      this.renderDossier(container);
    }

    // Walking the shelf changes which card is framed and which one the dossier
    // reads, and nothing else. Rebuilding the shelf for it would lay out a card
    // face per key and hand every one of them a fresh canvas with its sprite
    // drawn into it, so the keyboard takes the same in-place path the pointer
    // already takes (selectAt). Walking past the end of a page turns it, which
    // is the one case that does owe a full redraw.
    moveIndex(delta, length) {
      if (!length) return;
      const base = this._index < 0 ? (delta < 0 ? length : -1) : this._index;
      const next = Math.max(0, Math.min(length - 1, base + delta));
      SoundManager.playCursor();
      if (next === this._index && this._area === "grid") return;
      const page = Math.floor(next / PAGE_SIZE);
      this._index = next;
      this._area = "grid";
      if (page !== this._page) { this._page = page; this.flourish(); this.render(); return; }
      const container = document.getElementById("cardcol-container");
      if (!container) { this.render(); return; }
      container.querySelectorAll("#cgc-grid .cgc-cell").forEach((el) => {
        el.classList.toggle("selected", parseInt(el.dataset.i, 10) === next);
      });
      container.querySelectorAll("#cgc-actions .inspect-btn").forEach((el) => {
        el.classList.remove("selected");
      });
      this.renderDossier(container);
      const cell = container.querySelector(".cgc-cell.selected");
      if (cell) cell.scrollIntoView({ block: "nearest" });
    }

    turnPage(step) {
      const total = this.pageCount();
      const next = Math.max(0, Math.min(total - 1, this._page + step));
      if (next === this._page) { SoundManager.playBuzzer(); return; }
      this._page = next;
      this._index = next * PAGE_SIZE;
      this._area = "grid";
      this.flourish();
      playSe("Casino/card_slide_3", 50, 105);
      this.render();
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
              <div class="title" id="cgc-title">${escapeHtml(T("CardGame.col.title"))}</div>
              <span class="cgc-count" id="cgc-count"></span>
            </div>
            <div class="cgc-modes" id="cgc-modes"></div>
            <div class="backpack-tabs" id="cgc-tabs"></div>
            <div class="cgc-search" id="cgc-search"></div>
            <div class="cgc-grid" id="cgc-grid"></div>
            <div class="cgc-pager" id="cgc-pager"></div>
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
      if (back) back.addEventListener("click", () => this.close());
      container.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.onCancelAction();
      });
      this.mountSearch(container);
    }

    render() {
      const container = document.getElementById("cardcol-container");
      if (!container) return;
      container.classList.toggle("cgc--collection", this.inCollection());
      this.renderModes(container);
      this.renderTabs(container);
      this.renderSearch(container);
      this.renderGrid(container);
      this.renderDossier(container);
      this.renderDeck(container);
      this.renderActions(container);
    }

    // The two pages, side by side above the filters: the bench the party builds
    // on, and the catalogue of every card that exists at all.
    renderModes(container) {
      const host = container.querySelector("#cgc-modes");
      host.innerHTML = MODES.map((id) =>
        `<button class="cgc-mode inspect-btn focusable${this.mode() === id ? " selected" : ""}" data-m="${id}">${escapeHtml(T("CardGame.col.mode." + id))}</button>`
      ).join("");
      host.querySelectorAll(".cgc-mode").forEach((el) => {
        el.addEventListener("click", () => this.setMode(el.dataset.m));
      });
      const title = container.querySelector("#cgc-title");
      if (title) title.textContent = this.inCollection() ? T("CardGame.col.catalogueTitle") : T("CardGame.col.title");
    }

    renderTabs(container) {
      const CGx = CG();
      const tabs = container.querySelector("#cgc-tabs");
      tabs.innerHTML = FILTERS.map((id, i) =>
        `<div class="backpack-tab focusable${i === this._filter ? " active" : ""}" data-i="${i}">${escapeHtml(T("CardGame.col.tab." + id))}</div>`
      ).join("");
      tabs.querySelectorAll(".backpack-tab").forEach((el) => {
        el.addEventListener("click", () => {
          this._filter = parseInt(el.dataset.i, 10);
          this._index = 0;
          this._page = 0;
          this.flourish();
          SoundManager.playCursor();
          this.render();
        });
      });
      container.querySelector("#cgc-count").textContent = this.inCollection()
        ? T("CardGame.col.catalogue", {
          distinct: CGx.ownedKeys().length,
          total: this.everyKey().length,
          pct: CGx.completion().toFixed(1)
        })
        : T("CardGame.col.owned", {
          cards: CGx.totalOwned(),
          distinct: CGx.ownedKeys().length,
          pct: CGx.completion().toFixed(1)
        });
    }

    // The strip is mounted ONCE, and only its filters half is ever repainted.
    // The field half is docked onto the header bar by MenuSearchBar itself, and
    // docking APPENDS: mounting it again on every redraw leaves the docked one
    // where it is and stacks a second magnifier onto the header beside it. The
    // page redraws on every card taken and every tab pressed, so within a few
    // clicks the header bar was a row of magnifiers. Leaving the field alone
    // also means the caret survives a redraw on its own.
    mountSearch(container) {
      const host = container.querySelector("#cgc-search");
      if (!host || !this._bar) return;
      host.innerHTML = this._bar.html();
      if (window.MenuSearchBar.dock) window.MenuSearchBar.dock();
    }

    renderSearch(container) {
      const host = container.querySelector("#cgc-search");
      if (!host || !this._bar) return;
      const markup = this._bar.filtersHTML();
      const filters = host.querySelector(".msb:not(.msb-field-only)");
      if (filters) filters.outerHTML = markup;
      else host.insertAdjacentHTML("beforeend", markup);
    }

    renderGrid(container) {
      const CGx = CG();
      const grid = container.querySelector("#cgc-grid");
      const keys = this.visibleKeys();
      const pages = this.pageCount(keys.length);
      this._page = Math.max(0, Math.min(this._page, pages - 1));
      if (keys.length) this._index = Math.max(0, Math.min(this._index, keys.length - 1));
      const from = this._page * PAGE_SIZE;
      const shown = keys.slice(from, from + PAGE_SIZE);

      if (!keys.length) {
        const empty = this._bar && !this._bar.isEmpty() ? "CardGame.col.noResults"
          : this.inCollection() ? "CardGame.col.catalogueEmpty" : "CardGame.col.empty";
        grid.innerHTML = `<div class="cgc-empty">${escapeHtml(T(empty))}</div>`;
        this.renderPager(container, 0, pages);
        return;
      }

      // A shelf entry is the same card face the duel deals into the hand
      // (Cards/CardGameDuel.js renderHand): the rarity frame, the head with
      // how many are owned and what kind it is, the name, the art well and the
      // five figures under it. On the catalogue page a card the party has never
      // held is still printed, only unlit.
      grid.innerHTML = shown.map((key, n) => {
        const i = from + n;
        const owned = CGx.countOf(key);
        const rare = CGx.rarityKey(CGx.rarityOf(key));
        const locked = this.inCollection() && owned <= 0 ? " cgc-cell--locked" : "";
        const spent = !this.inCollection() && this.spare(key) <= 0 ? " cgc-cell--spent" : "";
        const effect = CGx.isEffect(key);
        const type = effect ? T("CardGame.type.effect")
          : CGx.isMonster(key) ? T("CardGame.type.monster")
            : CGx.isWeapon(key) ? T("CardGame.type.weapon") : T("CardGame.type.armor");
        const stats = CGx.statsFor(key);
        const foot = effect
          ? ""
          : `<div class="cgc-cstats">${CGx.STATS.map((id) =>
            `<div>${escapeHtml(CGx.statLabel(id))}<b>${stats[id]}</b></div>`).join("")}</div>`;
        // The bench marks how many copies the working deck has already taken,
        // which is the one number a deck builder is read for.
        const taken = this.inDeck(key);
        const badge = !this.inCollection() && taken > 0
          ? `<span class="cgc-indeck">${escapeHtml(T("CardGame.col.inDeck", { n: taken }))}</span>` : "";
        return `<div class="cgc-cell rarity--${rare}${i === this._index ? " selected" : ""}${spent}${locked}" data-i="${i}" style="--d:${Math.min(n, 40)}">
            <div class="cgc-shine"></div>
            ${badge}
            <div class="cgc-chead"><span class="cgc-qty">x${owned}</span><span class="cgc-ctype">${escapeHtml(type)}</span></div>
            <div class="cgc-lbl">${escapeHtml(CGx.nameOf(key))}</div>
            <div class="cgc-artcell"></div>
            ${foot}
          </div>`;
      }).join("");

      // The riffle only plays when the shelf actually changed, never on every
      // cursor move.
      grid.classList.toggle("cgc-dealing", !!this._flourish);
      if (this._flourish) {
        this._flourish = false;
        setTimeout(() => grid.classList.remove("cgc-dealing"), 900);
      }

      grid.querySelectorAll(".cgc-cell").forEach((el) => {
        const i = parseInt(el.dataset.i, 10);
        const key = keys[i];
        const host = el.querySelector(".cgc-artcell");
        if (CGx.isEquip(key) || CGx.isEffect(key)) {
          const glyph = document.createElement("span");
          glyph.setAttribute("style", CGx.Art.iconStyle(key, 56));
          host.appendChild(glyph);
        } else {
          const canvas = document.createElement("canvas");
          canvas.width = 56; canvas.height = 56;
          canvas.className = "cgc-cell-canvas";
          // Keyed, not positional: gear and effect cells carry a glyph rather
          // than a canvas, so the nth canvas is not the nth card.
          canvas.dataset.k = key;
          host.appendChild(canvas);
          CGx.Art.drawTileSprite(canvas, key, this._spriteFrame);
        }
        // Pointing at a card reads it, the way the cursor does. Only the
        // dossier and the frames are repainted for it: rebuilding the shelf on
        // every pixel the mouse crosses would fight the pointer.
        el.addEventListener("mouseenter", () => this.selectAt(i));
        el.addEventListener("click", () => {
          this._area = "grid";
          this._index = i;
          if (this.inCollection()) { this.selectAt(i); return; }
          const moved = this.addToDeck(key);
          // A refusal still owes the player the card it was pointed at.
          if (!moved) this.render();
        });
      });

      // The real column count, so up/down walks the grid the player sees. The
      // gutter is read off the stylesheet rather than guessed at: a wrong one
      // walks the cursor a column short on every row, and the track is not the
      // same width on the desk as it is on the handheld.
      const first = grid.querySelector(".cgc-cell");
      if (first) {
        const width = grid.clientWidth || 1;
        const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
        this._cols = Math.max(1, Math.round((width + gap) / (first.offsetWidth + gap)));
      }
      this.renderPager(container, keys.length, pages);
    }

    // A catalogue of thousands is turned a page at a time rather than scrolled
    // forever, and the strip says where in it the player stands.
    renderPager(container, total, pages) {
      const host = container.querySelector("#cgc-pager");
      if (!host) return;
      if (pages <= 1) {
        host.innerHTML = total ? `<span class="cgc-pagecount">${escapeHtml(T("CardGame.col.showing", { n: total }))}</span>` : "";
        return;
      }
      host.innerHTML = `
        <button class="inspect-btn focusable cgc-pagebtn${this._page <= 0 ? " inspect-btn--disabled" : ""}" data-s="-1">${escapeHtml(T("CardGame.col.prevPage"))}</button>
        <span class="cgc-pagecount">${escapeHtml(T("CardGame.col.page", { n: this._page + 1, of: pages, total }))}</span>
        <button class="inspect-btn focusable cgc-pagebtn${this._page + 1 >= pages ? " inspect-btn--disabled" : ""}" data-s="1">${escapeHtml(T("CardGame.col.nextPage"))}</button>`;
      host.querySelectorAll(".cgc-pagebtn").forEach((el) => {
        el.addEventListener("click", () => this.turnPage(parseInt(el.dataset.s, 10)));
      });
    }

    renderDossier(container) {
      const CGx = CG();
      const host = container.querySelector("#cgc-dossier");
      const key = this.selectedKey();
      if (!key) { host.innerHTML = `<div class="ui-empty"><div class="ui-empty-text">${escapeHtml(T("CardGame.col.pickACard"))}</div></div>`; return; }
      const stats = CGx.statsFor(key);
      const seed = this.seedFor(key);
      const effect = CGx.isEffect(key);
      const owned = CGx.countOf(key);
      const type = effect ? T("CardGame.type.effect")
        : CGx.isMonster(key) ? T("CardGame.type.monster")
          : CGx.isWeapon(key) ? T("CardGame.type.weapon") : T("CardGame.type.armor");
      const rare = CGx.rarityKey(CGx.rarityOf(key));
      // The one thing the catalogue page is read for: whether this card has
      // ever been held, and what the market thinks it is worth.
      const holding = `
        <div class="inspect-spec-row"><span class="inspect-spec-label">${escapeHtml(T("CardGame.col.ownedLabel"))}</span>
          <span class="inspect-spec-value ${owned > 0 ? "cgc-legal--ok" : "cgc-legal--bad"}">${escapeHtml(owned > 0 ? T("CardGame.col.copies", { n: owned }) : T("CardGame.col.notOwned"))}</span></div>
        <div class="inspect-spec-row"><span class="inspect-spec-label">${escapeHtml(T("CardGame.col.valueLabel"))}</span>
          <span class="inspect-spec-value">${escapeHtml(this.money(CGx.cardValue(key)))}</span></div>`;
      host.innerHTML = `
        <div class="ui-detail-head">
          <div class="ui-detail-titles">
            <h2>${escapeHtml(CGx.nameOf(key))}</h2>
            <div class="ui-detail-sub rarity--${rare}">${escapeHtml(type)} &middot; ${escapeHtml(CGx.rarityName(CGx.rarityOf(key)))}</div>
          </div>
        </div>
        <div class="ui-detail-scroll">
          <div class="cgc-art" id="cgc-art"></div>
          <div class="inspect-spec-grid">${holding}</div>
          ${effect ? "" : `<div class="inspect-section-title">${escapeHtml(T("CardGame.col.statsHeading"))}</div>
          <div class="inspect-spec-grid">
            ${CGx.STATS.map((id) => `<div class="inspect-spec-row"><span class="inspect-spec-label">${escapeHtml(CGx.statLabel(id))}</span><span class="inspect-spec-value">${stats[id]}</span></div>`).join("")}
            <div class="inspect-spec-row"><span class="inspect-spec-label">${escapeHtml(T("CardGame.col.powerLabel"))}</span><span class="inspect-spec-value">${CGx.statTotal(stats)}</span></div>
          </div>`}
          <div class="ui-prose">${escapeHtml(CGx.cardText(key, seed))}</div>
        </div>`;
      fillArt(host.querySelector("#cgc-art"), key, 96);
    }

    // Every figure on this page that is money is printed the one way the game
    // prints money.
    money(gold) {
      if (window.MoneyFormatter && window.MoneyFormatter.format) return window.MoneyFormatter.format(gold);
      return String(gold);
    }

    renderDeck(container) {
      const CGx = CG();
      const host = container.querySelector("#cgc-deck");
      // The catalogue page is a reader: the bench is put away while it is open,
      // so the card being read has the whole right page to itself.
      if (this.inCollection()) { host.innerHTML = ""; host.hidden = true; return; }
      host.hidden = false;
      const legal = CGx.deckLegality(this._working);
      const reason = legal.ok ? T("CardGame.col.deckLegal")
        : legal.reason === "tooFew" ? T("CardGame.col.deckTooFew", { min: CGx.DECK_MIN })
          : legal.reason === "tooMany" ? T("CardGame.col.deckTooMany", { max: CGx.DECK_MAX })
            : T("CardGame.col.deckNotOwned");

      // The decks the party keeps, as chips: one per saved deck plus the one
      // that starts a fresh list, so changing deck is a click rather than a
      // walk through two buttons that only said previous and next.
      const chips = CGx.decks().map((deck, i) =>
        `<button class="cgc-deckchip focusable${i === this._deckIndex ? " active" : ""}" data-d="${i}">${escapeHtml(deck.name)}</button>`
      ).concat([
        `<button class="cgc-deckchip focusable${this._deckIndex < 0 ? " active" : ""}" data-d="-1">${escapeHtml(T("CardGame.col.newDeck"))}</button>`
      ]).join("");

      const counts = {};
      this._working.forEach((key) => { counts[key] = (counts[key] || 0) + 1; });
      // Ordered the way a deck list is read: the dearest cards at the top, ties
      // broken by name.
      const rows = Object.keys(counts)
        .sort((a, b) => (CGx.rarityOf(b) - CGx.rarityOf(a)) || CGx.nameOf(a).localeCompare(CGx.nameOf(b)))
        .map((key) => {
          const rare = CGx.rarityKey(CGx.rarityOf(key));
          const power = CGx.isEffect(key) ? "" : CGx.statTotal(CGx.statsFor(key));
          return `<div class="cgc-deckrow rarity--${rare}" data-k="${escapeHtml(key)}">
              <span class="cgc-gem"></span>
              <span class="cgc-deckname">${escapeHtml(CGx.nameOf(key))}</span>
              <span class="cgc-deckpower">${power}</span>
              <span class="cgc-deckqty">${counts[key]}</span>
            </div>`;
        }).join("");

      const filled = Math.min(100, (this._working.length / CGx.DECK_MAX) * 100);
      host.innerHTML = `
        <div class="cgc-deckchips">${chips}</div>
        <div class="cgc-deckhead">
          <span class="cgc-deckheading">${escapeHtml(T("CardGame.col.deckHeading"))}</span>
          <span class="cgc-decktally ${legal.ok ? "cgc-legal--ok" : "cgc-legal--bad"}">${this._working.length} / ${CGx.DECK_MAX}</span>
        </div>
        <div class="cgc-deckmeter"><div class="cgc-deckmeter-fill" style="--w:${filled}%"></div></div>
        <div class="cgc-decklist">${rows || `<div class="ui-empty-note">${escapeHtml(T("CardGame.col.deckEmpty"))}</div>`}</div>
        <div class="cgc-deckstanding ${legal.ok ? "cgc-legal--ok" : "cgc-legal--bad"}">${escapeHtml(reason)}</div>`;

      host.querySelectorAll(".cgc-deckrow").forEach((el) => {
        el.addEventListener("click", () => this.removeFromDeck(el.dataset.k));
      });
      host.querySelectorAll(".cgc-deckchip").forEach((el) => {
        el.addEventListener("click", () => this.pickDeck(parseInt(el.dataset.d, 10)));
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
        el.addEventListener("mouseenter", () => {
          const at = parseInt(el.dataset.i, 10);
          if (this._area === "actions" && this._actionIndex === at) return;
          this._area = "actions";
          this._actionIndex = at;
          host.querySelectorAll(".inspect-btn").forEach((b, n) => b.classList.toggle("selected", n === at));
          const grid = document.querySelector("#cardcol-container #cgc-grid");
          if (grid) grid.querySelectorAll(".cgc-cell").forEach((c) => c.classList.remove("selected"));
        });
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
      else if (Input.isTriggered("cancel") || TouchInput.isCancelled()) {
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
      container.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.finish();
      });
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
              <div style="color:var(--xp-white); font-weight:bold; font-size:17px; letter-spacing:2px">${escapeHtml(T("CardGame.trader.banner"))}</div>
              <div style="color:var(--xp-sky-4); font-size:13px; margin-top:2px">${escapeHtml(T("CardGame.trader.tagline"))}</div>
            </div>
            <div style="margin-left:auto; text-align:right; color:var(--xp-sky-4); font-size:13px; line-height:1.5">
              <div>${escapeHtml(T("CardGame.trader.wallet"))}</div>
              <div id="ct-wallet" style="color:var(--xp-white); font-weight:bold; font-size:16px">&nbsp;</div>
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

  const openCollection = (args) => {
    Scene_CardCollection._openOn = args && args.page === "collection" ? "collection" : null;
    SceneManager.push(Scene_CardCollection);
  };
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
