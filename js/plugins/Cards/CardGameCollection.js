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

  // The type filters, the same five on both pages. The deck is not one of
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

  // The action strip is a fixed grid this many buttons wide, so the six verbs
  // of the builder sit in two even rows instead of wrapping where they fall.
  const ACTION_COLS = 3;

  // Where the cursor is drawn in each zone that can scroll out of sight.
  // i18n-ignore-start: CSS selectors, not prose
  const CURSOR_OF = {
    grid: "#cgc-grid .cgc-cell--cursor",
    deckchips: "#cgc-deck .cgc-deckchip.selected",
    decklist: "#cgc-deck .cgc-deckrow.selected",
    pager: "#cgc-pager .cgc-pagebtn.selected",
    actions: "#cgc-actions .inspect-btn.selected"
  };
  // i18n-ignore-end

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
      this._cols = 5;
      this._flourish = true;
      this._leaving = false;
      // Where the cursor is: one of the zones in zones(), and the place it
      // holds inside each of them. The grid's place is _index, a position in
      // the WHOLE filtered list rather than on the page.
      this._area = "grid";
      this._focus = { modes: this._mode, tabs: 0, filters: 0, pager: 0, deckchips: 0, decklist: 0, actions: 0 };
      // Whether the pointer is the device in hand. A key or a pad press hands
      // the cursor to the keyboard; only a REAL move of the mouse hands it
      // back. Without it a mouse left resting over the shelf stole the cursor
      // the moment a key scrolled a different card under it (the browser
      // replays a hover over whatever the scroll brings under the pointer).
      this._pointerLive = true;
      this._mx = null;
      this._my = null;
      this._spriteFrame = 1;
      this._spriteTimer = 0;
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

      // The working deck: the active saved one, or an empty bench. It used to
      // open on the best hand the shelf could make, which spent every copy the
      // party owned before the player had touched a card, so every click on
      // the shelf was refused and the page read as dead.
      this._deckIndex = CGx.decks().length ? CGx.activeDeckIndex() : -1;
      const active = CGx.decks()[this._deckIndex];
      if (!active) this._deckIndex = -1;
      this._working = active ? active.cards.slice() : [];
      this._focus.deckchips = this._deckIndex >= 0 ? this._deckIndex : CGx.decks().length;

      this.buildDOM();
      this.installKeys();
      this.render();
    }

    update() {
      super.update();
      this.updateSprites();
      this.updateInput();
    }

    terminate() {
      this.removeKeys();
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
      if (this._index < 0) return null;
      return this.visibleKeys()[this._index] || null;
    }

    inDeck(key) {
      return this._working.filter((k) => k === key).length;
    }

    // How many copies of this key are still on the shelf, unspent by the deck.
    spare(key) {
      return CG().countOf(key) - this.inDeck(key);
    }

    // Both answer whether the deck actually moved, so a caller knows whether
    // the page has already been redrawn for it.
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

    // What pressing a card does. On the bench a card with a spare copy goes
    // in, and a card whose every copy is already in the deck comes back out,
    // so a click on the shelf always does something. The catalogue only reads.
    activate(key) {
      if (!key) { SoundManager.playBuzzer(); return false; }
      if (this.inCollection()) {
        SoundManager.playCursor();
        this.renderFocus();
        this.renderDossier();
        this.renderActions();
        return false;
      }
      if (this.spare(key) <= 0 && this.inDeck(key) > 0) return this.removeFromDeck(key);
      const moved = this.addToDeck(key);
      // A refusal still owes the player the card it was pointed at.
      if (!moved) this.render();
      return moved;
    }

    // The saved deck the bench is working on, or null for a fresh list.
    savedDeck() {
      return this._deckIndex >= 0 ? (CG().decks()[this._deckIndex] || null) : null;
    }

    // Whether the bench differs from what is saved under it. A fresh list is
    // edited the moment it holds a card.
    isDirty() {
      const saved = this.savedDeck();
      if (!saved) return this._working.length > 0;
      if (saved.cards.length !== this._working.length) return true;
      const a = saved.cards.slice().sort();
      const b = this._working.slice().sort();
      return a.some((key, i) => key !== b[i]);
    }

    // A name no other deck is wearing. Names used to be the deck's position,
    // so deleting Deck 1 out of two left Deck 2 behind, and the next deck made
    // was christened Deck 2 as well.
    freshDeckName() {
      const taken = new Set(CG().decks().map((deck) => deck && deck.name));
      for (let n = 1; n < 1000; n++) {
        const name = T("CardGame.col.deckName", { n });
        if (!taken.has(name)) return name;
      }
      return T("CardGame.col.deckName", { n: CG().decks().length + 1 });
    }

    // Writes the bench back before anything replaces it: leaving the screen,
    // picking another deck, starting a fresh one or sitting down to practise.
    // A list built and never saved used to vanish on the one press of B that
    // leaves the page. Only a legal list is kept, so the deck a duel reaches
    // for is never one it would have to refuse. Answers whether it wrote.
    commitWorking() {
      const CGx = CG();
      if (!this.isDirty() || !CGx.deckLegality(this._working).ok) return false;
      const saved = this.savedDeck();
      const deck = { name: saved ? saved.name : this.freshDeckName(), cards: this._working.slice() };
      if (saved) CGx.saveDeck(this._deckIndex, deck);
      else { CGx.saveDeck(null, deck); this._deckIndex = CGx.decks().length - 1; }
      return true;
    }

    deckRowKeys() {
      const CGx = CG();
      const counts = {};
      this._working.forEach((key) => { counts[key] = (counts[key] || 0) + 1; });
      return Object.keys(counts)
        .sort((a, b) => (CGx.rarityOf(b) - CGx.rarityOf(a)) || CGx.nameOf(a).localeCompare(CGx.nameOf(b)));
    }

    //-------------------------------------------------------------------------
    // Actions
    //-------------------------------------------------------------------------

    // The builder keeps the deck's own verbs; the collection page is a reader
    // and keeps only the ones that make sense over a single card.
    actions() {
      const CGx = CG();
      const key = this.selectedKey();
      if (this.inCollection()) {
        return [
          { id: "take", label: T("CardGame.col.addToDeck"), enabled: !!key && this.spare(key) > 0 && this._working.length < CGx.DECK_MAX },
          { id: "give", label: T("CardGame.col.removeFromDeck"), enabled: !!key && this.inDeck(key) > 0 },
          { id: "reroll", label: T("CardGame.col.reroll"), enabled: !!key }
        ];
      }
      const legal = CGx.deckLegality(this._working);
      return [
        { id: "save", label: T("CardGame.col.saveDeck"), enabled: legal.ok },
        { id: "auto", label: T("CardGame.col.autoDeck"), enabled: CGx.ownedKeys().length > 0 },
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
          const saved = this.savedDeck();
          const deck = { name: saved ? saved.name : this.freshDeckName(), cards: this._working.slice() };
          if (saved) CGx.saveDeck(this._deckIndex, deck);
          else { CGx.saveDeck(null, deck); this._deckIndex = CGx.decks().length - 1; }
          CGx.setActiveDeck(this._deckIndex);
          this._focus.deckchips = this._deckIndex;
          SoundManager.playSave();
          break;
        }
        case "newDeck":
          this.commitWorking();
          this._deckIndex = -1;
          this._working = [];
          this._focus.deckchips = CGx.decks().length;
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
          this._focus.deckchips = this._deckIndex >= 0 ? this._deckIndex : CGx.decks().length;
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
        case "give":
          this.removeFromDeck(this.selectedKey());
          return;
        case "reroll": {
          const key = this.selectedKey();
          if (key) { this.rerollSeed(key); playSe("Casino/card_fan_1", 60, 110); }
          break;
        }
        case "practice":
          // The table deals the deck on the bench, not whatever was saved
          // before the player started changing it.
          this.commitWorking();
          if (this._deckIndex >= 0) CGx.setActiveDeck(this._deckIndex);
          if (window.CardDuel) { SoundManager.playOk(); window.CardDuel.startPractice(); return; }
          break;
      }
      this.render();
    }

    // Switching pages always starts the new shelf at the top, with the filters
    // the player had set left alone: the narrowing is theirs, not the page's.
    setMode(mode) {
      const at = MODES.indexOf(mode);
      if (at < 0 || at === this._mode) return;
      this._mode = at;
      this._focus.modes = at;
      this._index = 0;
      this._page = 0;
      this._focus.actions = 0;
      this.flourish();
      SoundManager.playOk();
      this.render();
    }

    setFilter(i) {
      if (i < 0 || i >= FILTERS.length) return;
      this._filter = i;
      this._focus.tabs = i;
      this._index = 0;
      this._page = 0;
      this.flourish();
      SoundManager.playCursor();
      this.render();
    }

    // Loading a saved deck onto the bench, or starting a fresh one when the
    // chip picked is the new-deck chip.
    pickDeck(index) {
      const CGx = CG();
      const list = CGx.decks();
      if (index < 0 || index >= list.length) { this.runAction("newDeck"); return; }
      this.commitWorking();
      this._deckIndex = index;
      this._focus.deckchips = index;
      this._working = list[index].cards.slice();
      CGx.setActiveDeck(index);
      SoundManager.playCursor();
      this.render();
    }

    close() {
      if (this._leaving) return;
      this._leaving = true;
      if (this.commitWorking()) {
        const CGx = CG();
        CGx.setActiveDeck(this._deckIndex);
        const deck = this.savedDeck();
        try {
          if (window.ParchmentToast && deck) {
            window.ParchmentToast.show(T("CardGame.col.autoSaved", { name: deck.name }), { severity: "good", duration: 150 });
          }
        } catch (e) { /* a popup never keeps the player on the page */ }
      }
      SoundManager.playCancel();
      this.popScene();
    }

    //-------------------------------------------------------------------------
    // Leaving
    //-------------------------------------------------------------------------
    // Escape, the pad's B and the right mouse button all leave the screen in
    // one press, from either page and wherever the cursor stands. The one
    // exception is a search field with text in it, which the first Escape
    // clears (MenuSearchBar does that on its own).
    //
    // Escape is caught on the way DOWN to the page, before anything focused can
    // swallow it: the rarity picker is a <select>, and a focused select used to
    // stop the key at itself and, through MenuSearchBar.isTyping(), freeze the
    // scene's own input, so neither Escape nor the right button ever reached it.

    onCancelAction() {
      const active = document.activeElement;
      const container = document.getElementById("cardcol-container");
      if (active && container && container.contains(active) && active.blur) active.blur();
      this.close();
    }

    installKeys() {
      this._onKeyCapture = (event) => {
        if (event.key !== "Escape" || this._leaving) return;
        const field = document.activeElement;
        if (field && field.tagName === "INPUT" && field.value) return;
        event.preventDefault();
        event.stopPropagation();
        this.onCancelAction();
      };
      document.addEventListener("keydown", this._onKeyCapture, true);
    }

    removeKeys() {
      if (this._onKeyCapture) document.removeEventListener("keydown", this._onKeyCapture, true);
      this._onKeyCapture = null;
    }

    //-------------------------------------------------------------------------
    // Navigation
    //-------------------------------------------------------------------------
    // Every control on the page belongs to one zone. A zone says how many
    // places it has, how wide a row of them is, and which zone the cursor
    // lands in when it walks off each edge. One move() drives them all; the
    // grid is the only zone with rules of its own (pages and real columns).

    zones() {
      const CGx = CG();
      const bench = !this.inCollection();
      const rows = bench ? this.deckRowKeys().length : 0;
      const pages = this.pageCount();
      const rightTop = bench ? "deckchips" : "actions";
      const filters = this.filterControls().length;
      return {
        back: { count: 1, cols: 1, down: "modes", right: "modes" },
        modes: { count: MODES.length, cols: MODES.length, left: "back", up: "back", down: "tabs", right: rightTop },
        tabs: { count: FILTERS.length, cols: FILTERS.length, up: "modes", down: "filters", right: rightTop },
        // The ordering and the rarity picker of the shared strip: reachable by
        // the cursor like every other control, so a pad can sort the shelf.
        filters: { count: filters, cols: filters, up: "tabs", down: "grid", right: rightTop },
        grid: { up: "filters", down: pages > 1 ? "pager" : null, right: rightTop },
        pager: { count: pages > 1 ? 2 : 0, cols: 2, up: "grid", right: rightTop },
        deckchips: { count: bench ? CGx.decks().length + 1 : 0, cols: 99, left: "grid", up: "tabs", down: rows ? "decklist" : "actions" },
        decklist: { count: rows, cols: 1, left: "grid", up: "deckchips", down: "actions" },
        actions: { count: this.actions().length, cols: ACTION_COLS, left: "grid", up: bench ? (rows ? "decklist" : "deckchips") : (pages > 1 ? "pager" : "grid") }
      };
    }

    // Steps into a zone, skipping one that has nothing in it.
    enter(area, from) {
      const zones = this.zones();
      let guard = 0;
      while (area && area !== "grid" && area !== "back" && !zones[area].count && guard++ < 8) {
        area = zones[area][from] || null;
      }
      if (!area) return false;
      if (area === "grid") {
        const keys = this.visibleKeys();
        if (!keys.length) return false;
        if (this._index < 0 || this._index >= keys.length) this._index = this._page * PAGE_SIZE;
      } else if (area !== "back") {
        this._focus[area] = Math.max(0, Math.min(this._focus[area] || 0, zones[area].count - 1));
      }
      this._area = area;
      SoundManager.playCursor();
      this.renderFocus();
      if (area === "grid") this.renderDossier();
      return true;
    }

    move(dir) {
      if (this._area === "grid") { this.moveGrid(dir); return; }
      const zone = this.zones()[this._area];
      if (!zone) { this.enter("grid", dir); return; }
      const count = zone.count || 1;
      const cols = Math.max(1, Math.min(zone.cols || 1, count));
      const at = this._area === "back" ? 0 : (this._focus[this._area] || 0);
      const col = at % cols;
      let next = -1;
      if (dir === "left" && col > 0) next = at - 1;
      else if (dir === "right" && col < cols - 1 && at + 1 < count) next = at + 1;
      else if (dir === "up" && at - cols >= 0) next = at - cols;
      else if (dir === "down" && at + cols < count) next = at + cols;
      else if (dir === "down" && Math.floor(at / cols) < Math.floor((count - 1) / cols)) next = count - 1;
      if (next >= 0) {
        this._focus[this._area] = next;
        SoundManager.playCursor();
        this.renderFocus();
        return;
      }
      this.enter(zone[dir], dir);
    }

    moveGrid(dir) {
      const keys = this.visibleKeys();
      const zone = this.zones().grid;
      if (!keys.length) { this.enter(zone[dir], dir); return; }
      const cols = Math.max(1, this.measureCols() || this._cols || 5);
      const from = this._page * PAGE_SIZE;
      const shown = Math.min(PAGE_SIZE, keys.length - from);
      const p = Math.max(0, this._index - from);
      const col = p % cols;
      if (dir === "left") {
        if (col > 0) this.moveIndex(-1, keys.length); else this.enter(zone.left, dir);
      } else if (dir === "right") {
        if (col < cols - 1 && p + 1 < shown) this.moveIndex(1, keys.length); else this.enter(zone.right, dir);
      } else if (dir === "up") {
        if (p - cols >= 0) this.moveIndex(-cols, keys.length); else this.enter(zone.up, dir);
      } else if (dir === "down") {
        if (p + cols < shown) this.moveIndex(cols, keys.length);
        // Walking off the bottom of a page turns it, keeping the column.
        else if (from + PAGE_SIZE < keys.length) this.moveIndex(cols, keys.length);
        else if (Math.floor(p / cols) < Math.floor((shown - 1) / cols)) this.moveIndex(shown - 1 - p, keys.length);
        else this.enter(zone.down, dir);
      }
    }

    // The strip's own controls, in the order they are drawn: the sort tags,
    // then the rarity picker. They are inline-handler markup MenuSearchBar
    // owns, so the cursor presses them rather than re-deriving what they do.
    filterControls(container) {
      container = container || document.getElementById("cardcol-container");
      if (!container) return [];
      return Array.from(container.querySelectorAll("#cgc-search .sort-tag, #cgc-search .msb-select"));
    }

    pressFilter(at) {
      const el = this.filterControls()[at];
      if (!el) { SoundManager.playBuzzer(); return; }
      if (el.tagName === "SELECT") { this.cycleRarity(el, 1); return; }
      el.click();
    }

    // A <select> cannot be opened from a pad, so OK steps the rarity picker
    // to its next value instead, wrapping back round to any rarity.
    cycleRarity(select, step) {
      if (!this._bar || !select || !select.options) return;
      const values = Array.from(select.options).map((o) => o.value);
      if (!values.length) return;
      const at = Math.max(0, values.indexOf(select.value));
      const next = values[(at + step + values.length) % values.length];
      SoundManager.playCursor();
      this._bar.setCategory(next);
    }

    // The columns the shelf is actually drawn in, read again before a step so
    // a resized window never leaves up and down walking a stale grid.
    measureCols(container) {
      container = container || document.getElementById("cardcol-container");
      const grid = container && container.querySelector("#cgc-grid");
      const first = grid && grid.querySelector(".cgc-cell");
      if (!first || !first.offsetWidth) return this._cols;
      const width = grid.clientWidth || 1;
      const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
      this._cols = Math.max(1, Math.round((width + gap) / (first.offsetWidth + gap)));
      return this._cols;
    }

    // Scrolls the nearest scrolling box just enough to show `el`. Done by hand
    // rather than with scrollIntoView, which also scrolls the clipped page
    // boxes around the spread and can shove the whole book off centre.
    keepInView(el) {
      if (!el || typeof getComputedStyle !== "function") return;
      let box = el.parentElement;
      while (box && box.id !== "cardcol-container") {
        const oy = getComputedStyle(box).overflowY;
        if ((oy === "auto" || oy === "scroll") && box.scrollHeight > box.clientHeight) break;
        box = box.parentElement;
      }
      if (!box || box.id === "cardcol-container") return;
      const r = el.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      const pad = 10;
      if (r.top < b.top + pad) box.scrollTop -= (b.top + pad) - r.top;
      else if (r.bottom > b.bottom - pad) box.scrollTop += r.bottom - (b.bottom - pad);
    }

    // A hover only moves the cursor while the mouse is the device in hand.
    hover(fn) {
      if (this._pointerLive) fn();
    }

    // What OK does on the control under the cursor.
    confirm() {
      const at = this._focus[this._area] || 0;
      switch (this._area) {
        case "back": this.close(); return;
        case "modes": this.setMode(MODES[at]); return;
        case "tabs": this.setFilter(at); return;
        case "filters": this.pressFilter(at); return;
        case "pager": this.turnPage(at === 0 ? -1 : 1); return;
        case "deckchips": this.pickDeck(at < CG().decks().length ? at : -1); return;
        case "decklist": {
          const rows = this.deckRowKeys();
          if (!rows[at]) return;
          this.removeFromDeck(rows[at]);
          const left = this.deckRowKeys().length;
          if (!left) this.enter("actions", "down");
          else if (at >= left) { this._focus.decklist = left - 1; this.renderFocus(); }
          return;
        }
        case "actions": {
          const item = this.actions()[at];
          if (item && item.enabled) this.runAction(item.id); else SoundManager.playBuzzer();
          return;
        }
        default:
          this.activate(this.selectedKey());
      }
    }

    updateInput() {
      if (this._leaving) return;
      // Leaving is read FIRST, ahead of the typing guard: a focused field must
      // never be able to trap the player on the screen.
      if (Input.isTriggered("cancel") || TouchInput.isCancelled()) {
        this.onCancelAction();
        return;
      }
      // A hot search field owns the keyboard: a gamepad poll must not walk the
      // cursor out from under the caret.
      if (window.MenuSearchBar && window.MenuSearchBar.isTyping()) return;

      // L1 / R1 (Q / W, Tab) turn the filter tabs from anywhere.
      const tabDir = window.UINav ? window.UINav.tabDir() : 0;
      if (tabDir) {
        this.setFilter((this._filter + (tabDir > 0 ? 1 : -1) + FILTERS.length) % FILTERS.length);
        return;
      }
      for (const dir of ["up", "down", "left", "right"]) {
        if (Input.isRepeated(dir)) { this._pointerLive = false; this.move(dir); return; }
      }
      if (Input.isTriggered("ok")) { this._pointerLive = false; this.confirm(); return; }
      // Y, the remove verb: the card under the cursor goes back to the shelf.
      if (Input.isTriggered("menu") && this._area === "grid" && !this.inCollection()) {
        const key = this.selectedKey();
        if (key) this.removeFromDeck(key);
      }
    }

    // Riffle the shelf on the next render.
    flourish() {
      this._flourish = true;
    }

    // Move the cursor onto a card without redrawing the shelf: the frames and
    // the dossier are all that a selection changes, and the grid is the one
    // part of the page that is expensive to build.
    selectAt(i) {
      if (!this._pointerLive) return;
      if (this._area === "grid" && this._index === i) return;
      this._area = "grid";
      this._index = i;
      this.renderFocus();
      this.renderDossier();
      this.renderActions();
    }

    // Walking the shelf changes which card is framed and which one the dossier
    // reads, and nothing else. Walking past the end of a page turns it, which
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
      this.renderDossier();
      this.renderActions();
    }

    // Moves the card frames in place: the shelf itself is never rebuilt for a
    // step of the cursor, whichever device took it.
    markShelf(container) {
      container.querySelectorAll("#cgc-grid .cgc-cell").forEach((el) => {
        const at = parseInt(el.dataset.i, 10) === this._index;
        el.classList.toggle("selected", at);
        el.classList.toggle("cgc-cell--cursor", this._area === "grid" && at);
      });
    }

    turnPage(step) {
      const total = this.pageCount();
      const next = Math.max(0, Math.min(total - 1, this._page + step));
      if (next === this._page) { SoundManager.playBuzzer(); return; }
      this._page = next;
      this._index = next * PAGE_SIZE;
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
      const back = container.querySelector("#cgc-back");
      if (back) {
        back._cgcHover = () => { this._area = "back"; this.renderFocus(); };
        back.addEventListener("mouseenter", () => this.hover(back._cgcHover));
        back.addEventListener("click", () => this.close());
      }
      // Only a real move of the mouse hands the cursor back to it, and the
      // control under it is picked up at once rather than on the next one the
      // pointer happens to enter.
      container.addEventListener("mousemove", (e) => {
        if (e.clientX === this._mx && e.clientY === this._my) return;
        this._mx = e.clientX;
        this._my = e.clientY;
        if (this._pointerLive) return;
        this._pointerLive = true;
        for (let n = e.target; n && n !== container; n = n.parentElement) {
          if (n._cgcHover) { n._cgcHover(); break; }
        }
      });
      // The right button leaves the screen straight from the page, so nothing
      // focused on it can swallow the press. close() is guarded, so the same
      // press arriving again through TouchInput.isCancelled() is harmless.
      container.addEventListener("mousedown", (e) => {
        if (e.button === 2) { e.preventDefault(); this.onCancelAction(); }
      });
      container.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      // The rarity picker hands the keyboard and the pad straight back once a
      // rarity is picked: a select that keeps focus reads as typing to the
      // strip, which used to freeze the page under it.
      container.addEventListener("change", (e) => {
        const el = e.target;
        if (el && el.tagName === "SELECT" && el.blur) el.blur();
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
      this.renderFocus(container);
    }

    // Repaints the cursor frame and nothing else. Every control is framed
    // only while the cursor is in its zone; the chosen tab and page keep their
    // own .active mark whatever the cursor is doing.
    renderFocus(container) {
      container = container || document.getElementById("cardcol-container");
      if (!container) return;
      const on = (area, i) => this._area === area && (this._focus[area] || 0) === i;
      const back = container.querySelector("#cgc-back");
      if (back) back.classList.toggle("selected", this._area === "back");
      container.querySelectorAll("#cgc-modes .cgc-mode").forEach((el, i) => {
        el.classList.toggle("selected", on("modes", i));
        el.classList.toggle("active", i === this._mode);
      });
      container.querySelectorAll("#cgc-tabs .backpack-tab").forEach((el, i) => {
        el.classList.toggle("selected", on("tabs", i));
        el.classList.toggle("active", i === this._filter);
      });
      this.markShelf(container);
      container.querySelectorAll("#cgc-pager .cgc-pagebtn").forEach((el, i) => el.classList.toggle("selected", on("pager", i)));
      container.querySelectorAll("#cgc-deck .cgc-deckchip").forEach((el, i) => el.classList.toggle("selected", on("deckchips", i)));
      container.querySelectorAll("#cgc-deck .cgc-deckrow").forEach((el, i) => el.classList.toggle("selected", on("decklist", i)));
      container.querySelectorAll("#cgc-actions .inspect-btn").forEach((el, i) => el.classList.toggle("selected", on("actions", i)));
      this.filterControls(container).forEach((el, i) => el.classList.toggle("selected", on("filters", i)));
      // The control the keyboard or the pad is on is always on screen: the
      // shelf, the deck list and the right page all scroll, and a cursor
      // walked past the bottom of one used to carry on out of sight. The mouse
      // scrolls for itself; following a hover would scroll a half-shown card
      // out from under the pointer and hand the hover to the next one down.
      const where = this._pointerLive ? null : CURSOR_OF[this._area];
      const cursor = where ? container.querySelector(where) : null;
      if (cursor) this.keepInView(cursor);
    }

    // Wires the pointer onto one zone: hovering moves the cursor there, a
    // click moves it there and confirms.
    wire(els, area) {
      els.forEach((el, i) => {
        el._cgcHover = () => {
          if (this._area === area && this._focus[area] === i) return;
          this._area = area;
          this._focus[area] = i;
          this.renderFocus();
        };
        el.addEventListener("mouseenter", () => this.hover(el._cgcHover));
        el.addEventListener("click", () => {
          this._pointerLive = true;
          this._area = area;
          this._focus[area] = i;
          this.confirm();
        });
      });
    }

    // The two pages, as a tab rail above the type filters: the bench the party
    // builds on, and the catalogue of every card that exists at all. The page
    // that is open carries the .active frame.
    renderModes(container) {
      const host = container.querySelector("#cgc-modes");
      host.innerHTML = MODES.map((id, i) =>
        `<div class="backpack-tab cgc-mode focusable${i === this._mode ? " active" : ""}" data-m="${id}">${escapeHtml(T("CardGame.col.mode." + id))}</div>`
      ).join("");
      this.wire(host.querySelectorAll(".cgc-mode"), "modes");
    }

    renderTabs(container) {
      const CGx = CG();
      const tabs = container.querySelector("#cgc-tabs");
      tabs.innerHTML = FILTERS.map((id, i) =>
        `<div class="backpack-tab focusable${i === this._filter ? " active" : ""}" data-i="${i}">${escapeHtml(T("CardGame.col.tab." + id))}</div>`
      ).join("");
      this.wire(tabs.querySelectorAll(".backpack-tab"), "tabs");
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
    // docking APPENDS: mounting it again on every redraw stacks a second
    // magnifier onto the header. Leaving the field alone also means the caret
    // survives a redraw on its own.
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

    typeLabel(key) {
      const CGx = CG();
      return CGx.isEffect(key) ? T("CardGame.type.effect")
        : CGx.isMonster(key) ? T("CardGame.type.monster")
          : CGx.isWeapon(key) ? T("CardGame.type.weapon") : T("CardGame.type.armor");
    }

    renderGrid(container) {
      const CGx = CG();
      const grid = container.querySelector("#cgc-grid");
      const keys = this.visibleKeys();
      const pages = this.pageCount(keys.length);
      this._page = Math.max(0, Math.min(this._page, pages - 1));
      if (keys.length) this._index = Math.max(0, Math.min(this._index, keys.length - 1));
      else this._index = -1;
      if (this._index >= 0 && Math.floor(this._index / PAGE_SIZE) !== this._page) this._index = this._page * PAGE_SIZE;
      const from = this._page * PAGE_SIZE;
      const shown = keys.slice(from, from + PAGE_SIZE);
      // A redraw for a card taken keeps the shelf where the player left it; a
      // new page or a new filter starts at its top.
      const keepTop = this._flourish ? 0 : grid.scrollTop;

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
      // held is still printed, only unlit. On the bench a card the deck has
      // taken says how many of its copies went in, and is never dimmed: it can
      // always be clicked, to add one more or to give one back.
      grid.innerHTML = shown.map((key, n) => {
        const i = from + n;
        const owned = CGx.countOf(key);
        const rare = CGx.rarityKey(CGx.rarityOf(key));
        const taken = this.inDeck(key);
        const locked = this.inCollection() && owned <= 0 ? " cgc-cell--locked" : "";
        const used = !this.inCollection() && taken > 0 ? " cgc-cell--indeck" : "";
        const full = !this.inCollection() && taken > 0 && taken >= owned ? " cgc-indeck--full" : "";
        const stats = CGx.statsFor(key);
        const foot = CGx.isEffect(key)
          ? ""
          : `<div class="cgc-cstats">${CGx.STATS.map((id) =>
            `<div>${escapeHtml(CGx.statLabel(id))}<b>${stats[id]}</b></div>`).join("")}</div>`;
        const badge = taken > 0
          ? `<span class="cgc-indeck${full}">${escapeHtml(T("CardGame.col.inDeckOf", { n: taken, of: owned }))}</span>` : "";
        return `<div class="cgc-cell rarity--${rare}${i === this._index ? " selected" : ""}${used}${locked}" data-i="${i}" style="--d:${Math.min(n, 40)}">
            <div class="cgc-shine"></div>
            <div class="cgc-chead"><span class="cgc-qty">x${owned}</span><span class="cgc-ctype">${escapeHtml(this.typeLabel(key))}</span></div>
            <div class="cgc-lbl">${escapeHtml(CGx.nameOf(key))}</div>
            <div class="cgc-artcell"></div>
            ${foot}
            ${badge}
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
        // dossier and the frames are repainted for it.
        el._cgcHover = () => this.selectAt(i);
        el.addEventListener("mouseenter", () => this.selectAt(i));
        el.addEventListener("click", () => {
          this._pointerLive = true;
          this._area = "grid";
          this._index = i;
          this.activate(key);
        });
      });

      // The real column count, so up/down walks the grid the player sees. The
      // gutter is read off the stylesheet rather than guessed at.
      this.measureCols(container);
      grid.scrollTop = keepTop;
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
      this.wire(host.querySelectorAll(".cgc-pagebtn"), "pager");
    }

    // The card under the cursor. The art stands beside its facts (held, worth,
    // the five figures and the total), and the card's own text runs under
    // both, so on the bench the dossier is short enough to leave the deck its
    // room, and on the catalogue it simply has the page to itself.
    renderDossier(container) {
      container = container || document.getElementById("cardcol-container");
      if (!container) return;
      const CGx = CG();
      const host = container.querySelector("#cgc-dossier");
      const key = this.selectedKey();
      if (!key) { host.innerHTML = `<div class="ui-empty"><div class="ui-empty-text">${escapeHtml(T("CardGame.col.pickACard"))}</div></div>`; return; }
      const stats = CGx.statsFor(key);
      const effect = CGx.isEffect(key);
      const owned = CGx.countOf(key);
      const rare = CGx.rarityKey(CGx.rarityOf(key));
      const fact = (label, value, cls) =>
        `<div class="cgc-fact"><span class="cgc-fact-label">${escapeHtml(label)}</span><span class="cgc-fact-value${cls ? " " + cls : ""}">${escapeHtml(value)}</span></div>`;
      const facts = [
        fact(T("CardGame.col.ownedLabel"),
          owned > 0 ? T("CardGame.col.copies", { n: owned }) : T("CardGame.col.notOwned"),
          owned > 0 ? "cgc-legal--ok" : "cgc-legal--bad"),
        fact(T("CardGame.col.valueLabel"), this.money(CGx.cardValue(key)))
      ];
      if (!this.inCollection() || this.inDeck(key) > 0) {
        facts.push(fact(T("CardGame.col.deckHeading"), T("CardGame.col.inDeckOf", { n: this.inDeck(key), of: owned })));
      }
      const figures = effect ? "" : `<div class="cgc-figures">${CGx.STATS.map((id) =>
        `<div class="cgc-figure"><span>${escapeHtml(CGx.statLabel(id))}</span><b>${stats[id]}</b></div>`).join("")}
          <div class="cgc-figure cgc-figure--total"><span>${escapeHtml(T("CardGame.col.powerLabel"))}</span><b>${CGx.statTotal(stats)}</b></div></div>`;
      host.innerHTML = `
        <div class="ui-detail-head">
          <div class="ui-detail-titles">
            <h2>${escapeHtml(CGx.nameOf(key))}</h2>
            <div class="ui-detail-sub rarity--${rare}">${escapeHtml(this.typeLabel(key))} &middot; ${escapeHtml(CGx.rarityName(CGx.rarityOf(key)))}</div>
          </div>
        </div>
        <div class="ui-detail-scroll">
          <div class="cgc-dossier-top">
            <div class="cgc-art rarity--${rare}" id="cgc-art"></div>
            <div class="cgc-facts">${facts.join("")}</div>
          </div>
          ${figures}
          <div class="ui-prose">${escapeHtml(CGx.cardText(key, this.seedFor(key)))}</div>
        </div>`;
      fillArt(host.querySelector("#cgc-art"), key, 96);
    }

    // Every figure on this page that is money is printed the one way the game
    // prints money, with the currency after it.
    money(gold) {
      const figure = window.MoneyFormatter && window.MoneyFormatter.format
        ? window.MoneyFormatter.format(gold) : String(gold);
      const unit = (typeof $dataSystem !== "undefined" && $dataSystem && $dataSystem.currencyUnit) || "";
      return unit ? figure + " " + unit : figure;
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
      // that starts a fresh list.
      const chips = CGx.decks().map((deck, i) =>
        `<button class="cgc-deckchip focusable${i === this._deckIndex ? " active" : ""}" data-d="${i}">${escapeHtml(deck.name)}</button>`
      ).concat([
        `<button class="cgc-deckchip focusable${this._deckIndex < 0 ? " active" : ""}" data-d="-1">${escapeHtml(T("CardGame.col.newDeck"))}</button>`
      ]).join("");

      const counts = {};
      this._working.forEach((key) => { counts[key] = (counts[key] || 0) + 1; });
      // Ordered the way a deck list is read: the dearest cards at the top, ties
      // broken by name. Each row is a four-column grid, so the power and the
      // count keep their own columns however long the name is.
      const rows = this.deckRowKeys().map((key, idx) => {
        const rare = CGx.rarityKey(CGx.rarityOf(key));
        const power = CGx.isEffect(key) ? "" : CGx.statTotal(CGx.statsFor(key));
        return `<div class="cgc-deckrow rarity--${rare}" data-k="${escapeHtml(key)}" data-idx="${idx}">
            <span class="cgc-gem"></span>
            <span class="cgc-deckname">${escapeHtml(CGx.nameOf(key))}</span>
            <span class="cgc-deckpower">${power}</span>
            <span class="cgc-deckqty">x${counts[key]}</span>
          </div>`;
      }).join("");

      const filled = Math.min(100, (this._working.length / CGx.DECK_MAX) * 100);
      // The list keeps its scroll across a redraw: a copy given back from the
      // bottom of a long deck used to throw the list back to its top.
      const oldList = host.querySelector(".cgc-decklist");
      const listTop = oldList ? oldList.scrollTop : 0;
      // The heading names the deck on the bench, and says when the bench no
      // longer matches what is saved under that name.
      const saved = this.savedDeck();
      const title = saved ? saved.name : T("CardGame.col.unsavedDeck");
      const edited = saved && this.isDirty()
        ? ` <span class="cgc-deckedited">${escapeHtml(T("CardGame.col.edited"))}</span>` : "";
      host.innerHTML = `
        <div class="cgc-deckchips">${chips}</div>
        <div class="cgc-deckhead">
          <span class="cgc-deckheading">${escapeHtml(title)}${edited}</span>
          <span class="cgc-decktally ${legal.ok ? "cgc-legal--ok" : "cgc-legal--bad"}">${this._working.length} / ${CGx.DECK_MAX}</span>
        </div>
        <div class="cgc-deckmeter"><div class="cgc-deckmeter-fill" style="--w:${filled}%"></div></div>
        <div class="cgc-decklist">${rows || `<div class="ui-empty-note">${escapeHtml(T("CardGame.col.deckEmpty"))}</div>`}</div>
        <div class="cgc-deckstanding ${legal.ok ? "cgc-legal--ok" : "cgc-legal--bad"}">${escapeHtml(reason)}</div>`;

      const list = host.querySelector(".cgc-decklist");
      if (list) list.scrollTop = listTop;
      this.wire(host.querySelectorAll(".cgc-deckrow"), "decklist");
      this.wire(host.querySelectorAll(".cgc-deckchip"), "deckchips");
    }

    renderActions(container) {
      container = container || document.getElementById("cardcol-container");
      if (!container) return;
      const host = container.querySelector("#cgc-actions");
      const list = this.actions();
      host.innerHTML = list.map((item, i) =>
        `<button class="inspect-btn focusable${item.enabled ? "" : " inspect-btn--disabled"}" data-i="${i}">${escapeHtml(item.label)}</button>`
      ).join("");
      this.wire(host.querySelectorAll(".inspect-btn"), "actions");
      this.renderFocus(container);
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

  // How long after one step of the pack the next press is ignored.
  const ADVANCE_GUARD_MS = 280;

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

    // One press is one step. A click on a card reached here twice, once as
    // the DOM click and once through TouchInput, so a single click during the
    // reveal turned every card over AND closed the screen before any of them
    // could be read. A second step inside the guard window is dropped.
    advance() {
      const now = Date.now();
      if (this._lastStep != null && now - this._lastStep < ADVANCE_GUARD_MS) return;
      this._lastStep = now;
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
      // A click on the pack and a right click both already reach update()
      // through TouchInput; a DOM handler as well would act twice on one
      // press, so the overlay only keeps the browser's menu away.
      container.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
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

      // The Buy / Sell plate at the end of a row. It is drawn, not a <button>:
      // the row itself is the one focus stop and pressing it does what the
      // plate says. A real button was a second stop on every row for the pad
      // and the keyboard to walk through, and one with no stable key, so the
      // ring lost its place the moment a purchase redrew the list.
      function actionButton(attr, value, label, live) {
        return `<span ${attr}="${escapeHtml(String(value))}"${live ? "" : " data-off=\"1\""}
                      style="padding:5px 12px; font-family:Tahoma,sans-serif; font-size:14px; cursor:${live ? "pointer" : "default"};
                             border:1px solid var(--xp-steel); background:var(--xp-bg); color:var(--xp-ink-3); opacity:${live ? 1 : 0.5}">${escapeHtml(label)}</span>`;
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
            + `<div style="min-width:78px; text-align:right; font-size:12px; color:${lot.left > 0 ? "var(--xp-ink-soft)" : "var(--xp-red-4)"}">${escapeHtml(left)}</div>`
            + priceTag(traderEuros(lot.price), "var(--xp-navy-7)")
            + actionButton("data-buy", lot.index, T("CardGame.trader.buy"), lot.left > 0),
            "ct-lot-" + lot.index
          );
        }).join("");
      }

      function renderSell() {
        const mine = CGx.sellableCards();
        if (!mine.length) return `<div style="padding:14px; color:var(--xp-ink-soft)">${escapeHtml(T("CardGame.trader.emptyShelf"))}</div>`;
        return mine.map((entry) => row(
          cardCell(entry.key, T("CardGame.trader.owned", { n: entry.count }))
          + priceTag(traderEuros(entry.price), "var(--xp-ok-dark)")
          + actionButton("data-sell", entry.key, T("CardGame.trader.sell"), true),
          "ct-own-" + entry.key
        )).join("");
      }

      function render() {
        el("ct-wallet").textContent = traderEuros($gameParty.gold());
        const paint = (btn, on) => {
          btn.style.background = on ? "linear-gradient(180deg,var(--xp-sky-2),var(--xp-navy-7))" : "var(--xp-bg)";
          btn.style.color = on ? "var(--xp-white)" : "var(--xp-ink-4)";
        };
        paint(el("ct-tab-buy"), tab === "buy");
        paint(el("ct-tab-sell"), tab === "sell");
        el("ct-list").innerHTML = tab === "buy" ? renderBuy() : renderSell();
        const line = el("ct-status");
        line.textContent = status;
        line.style.color = error ? "var(--xp-red-4)" : "var(--xp-text-muted)";
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
          btn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            if (btn.dataset.off) { playSe("Buzzer1", 70, 100); return; }
            onBuy(btn.dataset.buy);
          });
        });
        win.querySelectorAll("[data-sell]").forEach((btn) => {
          btn.addEventListener("click", (ev) => { ev.stopPropagation(); onSell(btn.dataset.sell); });
        });
        // A row is one focus stop: activating it does what its button does, so
        // the keyboard and the pad never have to reach the button itself.
        win.querySelectorAll("[data-row]").forEach((line) => {
          line.addEventListener("click", () => {
            const btn = line.querySelector("[data-buy],[data-sell]");
            if (!btn) return;
            if (btn.dataset.off) { playSe("Buzzer1", 70, 100); return; }
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
