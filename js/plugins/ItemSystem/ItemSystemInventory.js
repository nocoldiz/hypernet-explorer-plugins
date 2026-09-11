/*:
 * @target MZ
 * @plugindesc v1.0.0 Inventory System - Enhanced item management and usage
 * @author Omni-Lex
 * @help ItemSystemInventory.js
 *
 * This plugin provides the enhanced inventory scene with categories, weight tracking, and item usage.
 * Requires ItemSystemUtils.js to be loaded first.
 *
 * Features:
 * - Tabbed inventory with categories (Food, Medical, Tools, Weapons, Armor, Materials)
 * - Weight tracking system with carry capacity limits
 * - Item consumption with effects and common events
 * - Equipment assignment to actors
 * - Bust image support for inventory interactions
 *
 * Terms of Use:
 * Free for use in both commercial and non-commercial projects.
 */

(function () {
  "use strict";

  //=============================================================================
  // Validation - Ensure ItemSystemUtils is loaded
  //=============================================================================

  if (!window.ItemSystemUtils) {
    throw new Error("ItemSystemInventory.js requires ItemSystemUtils.js to be loaded first!");
  }

  // A severed-magic world has no magic in it, so there is nothing to spend a
  // magic meter on: the MP row is not drawn at all. See window.MagicNature.
  function hideMpBar() {
    const MN = window.MagicNature;
    return !!(MN && typeof MN.level === "function" && MN.level() === "severed");
  }

  // Import utilities from ItemSystemUtils
  const utils = window.ItemSystemUtils;

  //=============================================================================
  // Special Commands Configuration
  //=============================================================================

  // Curated direct-action verbs. Each maps to a common event (286-294) that
  // performs the action. The triggering item id is stashed in
  // $gameTemp._specialActionItemId so consuming actions can remove it.
  // i18n-ignore-start  verb ids: exported as window._InventorySpecialCommands
  // and matched by name below; the label is Inventory.special.<id>
  const SPECIAL_COMMANDS = {
    "Pour":    { commonEventId: 286 },
    "Fill":    { commonEventId: 287 },
    "Read":    { commonEventId: 288 },
    "Inspect": { commonEventId: 289 },
    "Light":   { commonEventId: 290 },
    "Plant":   { commonEventId: 291 },
    "Bury":    { commonEventId: 292 },
    "Wear":    { commonEventId: 293 },
    "Glow":    { commonEventId: 294 },
    // Studying has no common event behind it: the backpack answers it itself,
    // the way Read answers a book with a passage rather than with the reader.
    "Study":   { commonEventId: 0 }
  };
  // i18n-ignore-end
  window._InventorySpecialCommands = SPECIAL_COMMANDS;

  //=============================================================================
  // Book Excerpts (the "Read" verb)
  //=============================================================================

  // A book item says which book it is on itself, with <Book: file> (see
  // Quest/BookViewer.js). Reading from the inventory reads that tag and quotes
  // a random passage straight into the message window instead of opening the
  // reader.
  const EXCERPT_MAX_CHARS = 320;
  const EXCERPT_MIN_PARAGRAPH = 60;
  const VERSE_LINE_CHARS = 50;
  const _bookPassageCache = {};

  // The book file an item is, or null for non-book readables (maps, scrolls).
  // BookViewer owns the tag, so this asks it rather than parsing notes twice.
  function bookFileForItem(item) {
    if (!item || !item.note) return null;
    if (window.BookManager && window.BookManager.bookFileForItem) {
      return window.BookManager.bookFileForItem(item);
    }
    const match = item.note.match(/<Book:\s*([^>]+)>/i);  // i18n-ignore: note tag
    return match ? match[1].trim() : null;
  }

  // The source files are Gutenberg transcriptions, so the legal front and back
  // matter is cut away before anything is quoted from them.
  function stripBookBoilerplate(text) {
    let body = String(text);

    const start = body.search(/\*\*\*\s*START OF TH(E|IS) PROJECT GUTENBERG/i);
    if (start >= 0) {
      const lineEnd = body.indexOf("\n", start);
      body = lineEnd >= 0 ? body.substring(lineEnd + 1) : "";
    }

    const end = body.search(/\*\*\*\s*END OF TH(E|IS) PROJECT GUTENBERG/i);
    if (end >= 0) body = body.substring(0, end);

    return body;
  }

  // Readable paragraphs of a book, cached per file. Prose is reflowed so it can
  // be re-wrapped for the message window, while verse (short lines) keeps its
  // line breaks. Headings, tables of contents and other short scaffolding fall
  // below the minimum length and drop out.
  function bookPassages(bookName) {
    if (_bookPassageCache[bookName]) return _bookPassageCache[bookName];

    let text = "";
    try {
      const data = window.BookManager ? window.BookManager.loadBook(bookName) : null;
      if (data) text = data.text || (Array.isArray(data.pages) ? data.pages.join("\n\n") : "");
    } catch (e) {
      text = "";
    }

    const passages = stripBookBoilerplate(text)
      .split(/\r?\n\s*\r?\n+/)
      .map(paragraph => {
        const lines = paragraph.replace(/^[#>*\s]+/, "").trim().split(/\r?\n/).map(l => l.trim());
        if (lines.length === 0) return "";
        const isVerse = paragraph.trim().length / lines.length < VERSE_LINE_CHARS;
        return lines.join(isVerse ? "\n" : " ");
      })
      .filter(p => p.length >= EXCERPT_MIN_PARAGRAPH && !/PROJECT GUTENBERG/i.test(p));

    _bookPassageCache[bookName] = passages;
    return passages;
  }

  // Cut a quotable stretch out of the book, starting somewhere random so
  // re-reading the same book gives different lines. Verse grows by whole stanzas,
  // prose by whole sentences from a random point inside its paragraph.
  function excerptFrom(passages, index) {
    const passage = passages[index];

    if (passage.includes("\n")) {
      let excerpt = passage;
      for (let i = index + 1; i < passages.length; i++) {
        const next = passages[i];
        if (!next.includes("\n")) break;
        if (excerpt.length + next.length + 1 > EXCERPT_MAX_CHARS) break;
        excerpt += "\n" + next;
      }
      return excerpt;
    }

    const sentences = passage.match(/[^.!?]+[.!?]*/g) || [passage];
    const start = Math.floor(Math.random() * sentences.length);
    let excerpt = sentences[start].trim();

    for (let i = start + 1; i < sentences.length; i++) {
      const next = sentences[i].trim();
      if (excerpt.length + next.length + 1 > EXCERPT_MAX_CHARS) break;
      excerpt += " " + next;
    }

    if (excerpt.length > EXCERPT_MAX_CHARS) {
      excerpt = excerpt.substring(0, EXCERPT_MAX_CHARS).replace(/\s+\S*$/, "") + "...";
    }
    if (start > 0) excerpt = "..." + excerpt;

    return excerpt;
  }

  // Queue "<Book title>" plus a random passage in the message window. Returns
  // false when the item has no book text behind it, so the caller can fall back
  // to the generic Read common event.
  function queueBookExcerpt(item) {
    const bookName = bookFileForItem(item);
    if (!bookName) return false;

    const passages = bookPassages(bookName);
    if (passages.length === 0) return false;

    const pager = window.RandomBookGenerator;
    if (!pager || !pager.showPaged) return false;

    const excerpt = excerptFrom(passages, Math.floor(Math.random() * passages.length));
    const title   = "\\C[4]\"" + item.name + "\"\\C[0]";
    pager.showPaged(title + "\n" + pager.wrapText(excerpt, 40), "");
    return true;
  }

  window._InventoryQueueBookExcerpt = queueBookExcerpt;

  //=============================================================================
  // Studying a book (the "Study" verb)
  //=============================================================================

  // Reading a three hundred page book one page turn at a time is a thing the
  // player may not want to do twice. Studying is the other way in: the hours
  // the book is long go by and the reader comes out of it knowing what the
  // book had to teach. window.BookLearning owns the whole rule; this only
  // reports what happened.
  function studyDurationText(minutes) {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    if (!h) return T('Inventory.study.minutes', { minutes: m });
    if (!m) return T('Inventory.study.hours', { hours: h });
    return T('Inventory.study.hoursMinutes', { hours: h, minutes: m });
  }

  function studyToast(text, severity) {
    if (window.ParchmentToast && window.ParchmentToast.show) {
      window.ParchmentToast.show(text, { severity: severity || 'info', title: T('Inventory.study.title') });
    } else if (typeof $gameMessage !== 'undefined' && $gameMessage && !$gameMessage.isBusy()) {
      $gameMessage.add(text);
    }
  }

  // Returns true when hours were actually spent, so the caller knows to get out
  // of the menu and let the map show the new time of day.
  function studyBook(item, actor) {
    const B = window.BookLearning;
    if (!B || !B.study) return false;
    const result = B.study(item, actor);
    const name = result.actor ? result.actor.name() : '';
    if (!result.ok) {
      const key = result.reason === 'known' ? 'Inventory.study.known' : 'Inventory.study.nothing';
      studyToast(T(key, { name, item: item.name }), 'warning');
      return false;
    }
    studyToast(T('Inventory.study.done', {
      name,
      item: item.name,
      subject: result.label,
      points: result.points,
      duration: studyDurationText(result.minutes),
    }), 'good');
    return true;
  }

  window._InventoryStudyBook = studyBook;

  // The verbs the backpack answers by itself, with no common event behind them.
  // Each is given the item and says whether it dealt with it.
  // i18n-ignore-start  verb ids, matched against SPECIAL_COMMANDS
  const INLINE_VERBS = {
    "Read":  (item) => queueBookExcerpt(item),
    "Study": (item) => studyBook(item),
  };
  // i18n-ignore-end

  // Every verb offered on an item: the ones written on it, plus the ones it
  // qualifies for by what it is. A book that teaches something can always be
  // studied, so the tag does not have to be repeated across the whole shelf.
  function specialCommandsFor(item) {
    if (!item || !item.note) return [];
    const commands = [];
    const regex = /<Special:\s*(.+?)>/gi;   // i18n-ignore: note tag
    let match;
    while ((match = regex.exec(item.note)) !== null) {
      commands.push(match[1].trim());
    }
    const B = window.BookLearning;
    const studiable = !!(B && B.isBook(item) && B.specName(item) && B.fileOf(item));
    if (studiable && commands.indexOf("Study") < 0) commands.push("Study");  // i18n-ignore: verb id
    return commands;
  }

  window._InventorySpecialCommandsFor = specialCommandsFor;

  // Map number keys 1-9
  Input.keyMapper[49] = "1";
  Input.keyMapper[50] = "2";
  Input.keyMapper[51] = "3";
  Input.keyMapper[52] = "4";
  Input.keyMapper[53] = "5";
  Input.keyMapper[54] = "6";
  Input.keyMapper[55] = "7";
  Input.keyMapper[56] = "8";
  Input.keyMapper[57] = "9";

  //=============================================================================
  // Enhanced Item Scene
  //=============================================================================

  function Scene_EnhancedItem() {
    this.initialize(...arguments);
  }

  Scene_EnhancedItem.prototype = Object.create(Scene_MenuBase.prototype);
  Scene_EnhancedItem.prototype.constructor = Scene_EnhancedItem;
  window.Scene_EnhancedItem = Scene_EnhancedItem;

  Scene_EnhancedItem.prototype.initialize = function () {
    Scene_MenuBase.prototype.initialize.call(this);
    this._mode = "item";
    this._openCategory = null;
  };

  Scene_EnhancedItem.prototype.prepare = function (item) {
    this._itemToUseFromMap = item;
  };

  Scene_EnhancedItem.prototype.create = function () {
    Scene_MenuBase.prototype.create.call(this);
    this.createWeightWindow();
    this.createItemWindow();
    this.createDetailWindow();
    this.createActorWindow();
    this.createTargetWindow();
    this.createEquipSelectionWindow();
    this.createContextMenu();

    // Hide standard canvas windows from screen, drawing them in the background
    if (this._weightWindow) this._weightWindow.visible = false;
    if (this._itemWindow) this._itemWindow.visible = false;
    if (this._detailWindow) this._detailWindow.visible = false;
    if (this._actorWindow) this._actorWindow.visible = false;
    if (this._targetWindow) this._targetWindow.visible = false;
    if (this._equipSelectionWindow) this._equipSelectionWindow.visible = false;
    if (this._contextMenu) this._contextMenu.visible = false;
  };

  Scene_EnhancedItem.prototype.createWeightWindow = function () {
    const rect = this.weightWindowRect();
    this._weightWindow = new Window_Weight(rect);
    this.addWindow(this._weightWindow);
  };

  Scene_EnhancedItem.prototype.weightWindowRect = function () {
    const wx = 0;
    const wy = 0;
    const ww = Graphics.boxWidth;
    const wh = this.calcWindowHeight(1, true);
    return new Rectangle(wx, wy, ww, wh);
  };

  Scene_EnhancedItem.prototype.createItemWindow = function () {
    const rect = this.itemWindowRect();
    this._itemWindow = new Window_EnhancedItemList(rect);
    this._itemWindow.setHandler("ok", this.onItemOk.bind(this));
    this._itemWindow.setHandler("cancel", this.onItemCancel.bind(this));
    this.addWindow(this._itemWindow);
  };

  Scene_EnhancedItem.prototype.itemWindowRect = function () {
    const wx = 0;
    const wy = this._weightWindow ? this._weightWindow.height : 0;
    const ww = Math.floor(Graphics.boxWidth * 0.7);
    const wh = Graphics.boxHeight - wy;
    return new Rectangle(wx, wy, ww, wh);
  };

  Scene_EnhancedItem.prototype.createDetailWindow = function () {
    const ww = Math.floor(Graphics.boxWidth * 0.3);
    const wx = Graphics.boxWidth - ww;
    const wy = this._weightWindow ? this._weightWindow.height : 0;
    const wh = Graphics.boxHeight - wy;
    this._detailWindow = new Window_ItemDetail(new Rectangle(wx, wy, ww, wh));
    this.addWindow(this._detailWindow);
  };

  Scene_EnhancedItem.prototype.createTargetWindow = function () {
    const rect = this.targetWindowRect();
    this._targetWindow = new Window_ItemTarget(rect);
    this._targetWindow.hide();
    this.addWindow(this._targetWindow);
  };

  Scene_EnhancedItem.prototype.targetWindowRect = function () {
    const wx = 0;
    const wy = this._weightWindow ? this._weightWindow.height : 0;
    const ww = Graphics.boxWidth;
    const wh = Graphics.boxHeight - wy;
    return new Rectangle(wx, wy, ww, wh);
  };

  Scene_EnhancedItem.prototype.createActorWindow = function () {
    const rect = this.actorWindowRect();
    this._actorWindow = new Window_MenuActor(rect);
    this._actorWindow.hide();
    this.addWindow(this._actorWindow);
  };

  Scene_EnhancedItem.prototype.actorWindowRect = function () {
    const wx = 0;
    const wy = this._weightWindow ? this._weightWindow.height : 0;
    const ww = Graphics.boxWidth;
    const wh = Graphics.boxHeight - wy;
    return new Rectangle(wx, wy, ww, wh);
  };

  Scene_EnhancedItem.prototype.createEquipSelectionWindow = function () {
    const rect = this.equipSelectionWindowRect();
    this._equipSelectionWindow = new Window_EquipSelection(rect);
    this._equipSelectionWindow.hide();
    this.addWindow(this._equipSelectionWindow);
  };

  Scene_EnhancedItem.prototype.equipSelectionWindowRect = function () {
    const wx = Math.floor(Graphics.boxWidth / 4);
    const wy = Math.floor(Graphics.boxHeight / 3);
    const ww = Math.floor(Graphics.boxWidth / 2);
    const wh = this.calcWindowHeight(Math.min($gameParty.size(), 2) + 1, true);
    return new Rectangle(wx, wy, ww, wh);
  };

  Scene_EnhancedItem.prototype.createContextMenu = function () {
    const rect = this.contextMenuRect();
    this._contextMenu = new Window_ItemContextMenu(rect);
    this._contextMenu.hide();
    this.addWindow(this._contextMenu);
  };

  Scene_EnhancedItem.prototype.contextMenuRect = function () {
    const ww = 300;
    const wh = this.calcWindowHeight(6, true);
    const wx = (Graphics.boxWidth - ww) / 2;
    const wy = (Graphics.boxHeight - wh) / 2;
    return new Rectangle(wx, wy, ww, wh);
  };

  Scene_EnhancedItem.prototype.onItemOk = function () {
    // Dummy handler
  };

  Scene_EnhancedItem.prototype.onItemCancel = function () {
    this.popScene();
  };

  // The tabs are a fixed row of shelves, not one tab per <category:> tag the
  // loot happens to carry. The tags are a stock-keeping vocabulary, not a way
  // to find something in a hurry: a row of twenty of them wrapped over three
  // lines and still buried the potions. What a player opens the pockets for is
  // what a thing DOES, so that is what the row asks.
  const ALL_CATEGORY = "All";              // i18n-ignore  item-category id
  const FAVORITES_CATEGORY = "Favorites";  // i18n-ignore  item-category id
  const MISC_CATEGORY = "Misc";            // i18n-ignore  item-category id

  // i18n-ignore-start  item-category ids; the caption is Inventory.category.<id>
  const MEDICAL_CATEGORY = "Medical";
  const FOOD_CATEGORY = "Food";
  const USABLE_CATEGORY = "Usable";
  const COMBAT_CATEGORY = "Combat";
  const BOOKS_CATEGORY = "Books";
  const LEISURE_CATEGORY = "Leisure";
  const WEAPONS_CATEGORY = "Weapons";
  const ARMOR_CATEGORY = "Armor";
  // i18n-ignore-end

  // The shelves, in the order the row reads them.
  const UI_CATEGORIES = [
    ALL_CATEGORY, FAVORITES_CATEGORY, MEDICAL_CATEGORY, FOOD_CATEGORY,
    USABLE_CATEGORY, COMBAT_CATEGORY, BOOKS_CATEGORY, LEISURE_CATEGORY,
    MISC_CATEGORY, WEAPONS_CATEGORY, ARMOR_CATEGORY
  ];

  const rawCategoryOf = (item) => {
    const utils = window.ItemSystemUtils;
    const raw = utils && typeof utils.getRawCategoryFromNote === "function"
      ? utils.getRawCategoryFromNote(item)
      : null;
    return String(raw || "").trim().toLowerCase();
  };

  // A book is anything the party reads rather than drinks or swings: the Books
  // tag, a title that names itself one, or a page that teaches a skill. The
  // grimoires and skill books are filed under Tools in the database, so the tag
  // alone would leave the whole library out of its own shelf.
  // i18n-ignore-next-line  item-name heuristic, matched against the raw English name
  const BOOK_NAME_RE = /grimoire|spellbook|skill book|\bbook\b|\btome\b|\bcodex\b/i;

  // Effect 43 is LEARN_SKILL: a skill book by what it does, whatever it is called.
  const LEARN_SKILL_EFFECT = 43;

  const isBookItem = (item) => {
    if (rawCategoryOf(item) === "books") return true;  // i18n-ignore  category tag
    if (BOOK_NAME_RE.test(String(item.name || ""))) return true;
    return (item.effects || []).some((e) => e && e.code === LEARN_SKILL_EFFECT);
  };

  // Potions and medicines alike. The tag catches the apothecary's own stock;
  // the effects catch everything else that puts HP or MP back or lifts a state
  // off, which is what a potion is whatever shelf it was filed under.
  const HEAL_EFFECT_CODES = [11, 12, 22];  // recover HP, recover MP, remove state

  const isMedicalItem = (item) => {
    const raw = rawCategoryOf(item);
    if (raw === "medical" || raw === "homeopathy") return true;  // i18n-ignore  category tags
    return (item.effects || []).some((e) => e && HEAL_EFFECT_CODES.includes(e.code));
  };

  // The one shelf an item stands on. Gear first, because a sword that heals is
  // still a sword; then the library; then what it is made of; and only then
  // when it can be used, so an item nothing can be done with falls to Misc.
  // occasion: 0 always, 1 battle only, 2 menu only, 3 never.
  const classifyUICategory = (item) => {
    if (!item) return MISC_CATEGORY;
    if (DataManager.isWeapon(item)) return WEAPONS_CATEGORY;
    if (DataManager.isArmor(item)) return ARMOR_CATEGORY;
    if (isBookItem(item)) return BOOKS_CATEGORY;
    const utils = window.ItemSystemUtils;
    if (utils && typeof utils.isFoodItem === "function" && utils.isFoodItem(item)) {
      return FOOD_CATEGORY;
    }
    if (isMedicalItem(item)) return MEDICAL_CATEGORY;
    // A pastime is what it is for: an mp3 player is not a tool and a saxophone
    // is not a curiosity (window.ItemLeisure owns the <Leisure:> tag).
    if (window.ItemLeisure && window.ItemLeisure.isLeisure(item)) return LEISURE_CATEGORY;
    if (item.occasion === 1) return COMBAT_CATEGORY;
    if (item.occasion === 0 || item.occasion === 2) return USABLE_CATEGORY;
    return MISC_CATEGORY;
  };

  // Filing one item reads its notes, its name and every one of its effects, and
  // the pockets ask the same question of the same item over and over: once per
  // item for the tab row, once per item for the filter, and twice per
  // comparison for the grouped sort. The answer is remembered against the
  // database entry it was read off, and thrown away the moment that entry is
  // rewritten, since procedural artifacts reuse database ids.
  const _categoryMemo = new WeakMap();

  const uiCategoryOf = (item) => {
    if (!item) return MISC_CATEGORY;
    const memo = _categoryMemo.get(item);
    if (memo && memo.note === item.note && memo.occasion === item.occasion) return memo.category;
    const category = classifyUICategory(item);
    _categoryMemo.set(item, { note: item.note, occasion: item.occasion, category });
    return category;
  };

  // The pockets as one short string: every stack carried and the nine quick
  // slots, since a star on a row is part of what the grid shows. Read off
  // $gameParty's own containers rather than allItems(), so asking whether
  // anything has changed never builds an array of everything the party owns.
  const pocketStamp = () => {
    let stamp = '';
    const push = (prefix, bag) => {
      if (!bag) return;
      for (const id in bag) {
        const n = bag[id];
        if (n > 0) stamp += prefix + id + ':' + n + ',';
      }
    };
    push('i', $gameParty._items);
    push('w', $gameParty._weapons);
    push('a', $gameParty._armors);
    stamp += '|';
    const slots = window.ItemHotbar ? window.ItemHotbar.SLOTS : 0;
    for (let i = 0; i < slots; i++) stamp += ($gameSystem.getFavoriteItem(String(i + 1)) || 0) + ',';
    return stamp;
  };

  // What the page's caches are keyed on, so the scene can ask the same question
  // the memos below ask without restating how the pockets are read.
  Scene_EnhancedItem.prototype.uiPocketStamp = function () {
    return pocketStamp();
  };

  const categoryRank = (label) => {
    const idx = UI_CATEGORIES.indexOf(label);
    return idx >= 0 ? idx : UI_CATEGORIES.length;
  };

  const compareCategories = (a, b) =>
    (categoryRank(a) - categoryRank(b)) || String(a).localeCompare(String(b));

  function matchesUICategory(item, category) {
    if (!item) return false;
    if (category === ALL_CATEGORY) return true;
    if (category === FAVORITES_CATEGORY) {
      return !!window.ItemHotbar && window.ItemHotbar.isFavorited(item);
    }
    return uiCategoryOf(item) === category;
  }

  // The row itself: the two standing tabs, then whichever shelves are not
  // empty, in the fixed order above. Favourites earns its place whatever is
  // carried, it is a shelf the player builds rather than one the loot decides.
  Scene_EnhancedItem.prototype.uiCategories = function () {
    const stamp = pocketStamp();
    if (this._uiCategoriesMemo && this._uiCategoriesMemo.stamp === stamp) {
      return this._uiCategoriesMemo.value;
    }
    const present = new Set();
    for (const item of $gameParty.allItems()) present.add(uiCategoryOf(item));
    const value = UI_CATEGORIES.filter((cat) =>
      cat === ALL_CATEGORY || cat === FAVORITES_CATEGORY || present.has(cat));
    this._uiCategoriesMemo = { stamp, value };
    return value;
  };

  // The caption a tab or a heading is printed under. Inventory.category is the
  // one table the whole game names item categories out of, and a shelf nobody
  // has written a caption for reads as itself.
  Scene_EnhancedItem.prototype.uiCategoryLabel = function (category) {
    const key = 'Inventory.category.' + category;
    return T.has(key) ? T(key) : String(category);
  };

  // The heading one item files under.
  Scene_EnhancedItem.prototype.uiGroupOf = function (item) {
    return uiCategoryOf(item);
  };

  // The All tab is a categorized list rather than one long roll: the sort
  // orders each heading's own contents, the headings run in shelf order.
  Scene_EnhancedItem.prototype.isUIGroupedView = function () {
    return this._activeUICategory === ALL_CATEGORY;
  };

  // The roll is rebuilt only when what goes on it changes. A cursor step, a
  // button walked, a card redrawn: none of those touch the pockets, and the
  // list they are read against is the one already sorted. Callers read the
  // array, they never write to it.
  Scene_EnhancedItem.prototype.getFilteredUIItems = function () {
    const memoKey = [this._activeUICategory, this._searchText || '', this._dndSortKey || '',
      this._dndSortDirection || '', pocketStamp()].join('|');
    if (this._uiItemsMemo && this._uiItemsMemo.key === memoKey) return this._uiItemsMemo.value;

    const allItems = $gameParty.allItems();
    const category = this._activeUICategory;

    let items = category === ALL_CATEGORY
      ? allItems.slice()
      : allItems.filter((item) => matchesUICategory(item, category));

    const query = (this._searchText || "").trim().toLowerCase();
    if (query) {
      items = items.filter(item => item.name.toLowerCase().includes(query));
    }

    const sortKey = this._dndSortKey || "name";
    const isAsc = (this._dndSortDirection || "asc") === "asc";
    items.sort((a, b) => {
      let valA, valB;
      if (sortKey === "weight") {
        valA = window.ItemSystemUtils && window.ItemSystemUtils.getItemWeight ? window.ItemSystemUtils.getItemWeight(a) : 0;
        valB = window.ItemSystemUtils && window.ItemSystemUtils.getItemWeight ? window.ItemSystemUtils.getItemWeight(b) : 0;
      } else if (sortKey === "price") {
        valA = a.price || 0;
        valB = b.price || 0;
      } else if (sortKey === "count") {
        valA = $gameParty.numItems(a);
        valB = $gameParty.numItems(b);
      } else {
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
      }

      if (valA < valB) return isAsc ? -1 : 1;
      if (valA > valB) return isAsc ? 1 : -1;
      return 0;
    });

    // Under All, one more pass files each item under its heading. Sorting is
    // stable, so the pass above still decides the order INSIDE a heading; the
    // headings themselves run in the order their tabs are in.
    if (this.isUIGroupedView()) {
      items.sort((a, b) => compareCategories(this.uiGroupOf(a), this.uiGroupOf(b)));
    }

    this._uiItemsMemo = { key: memoKey, value: items };
    return items;
  };

  Scene_EnhancedItem.prototype.handleEquipmentSelection = function (item) {
    const compatibleActors = this.findCompatibleActors(item);

    if (compatibleActors.length === 0) {
      SoundManager.playBuzzer();
      this._itemWindow.activate();
    } else if (compatibleActors.length === 1) {
      this.equipItemToActor(item, compatibleActors[0]);
    } else {
      this.showEquipSelectionWindow(item, compatibleActors);
    }
  };

  Scene_EnhancedItem.prototype.findCompatibleActors = function (item) {
    return $gameParty.members().filter((actor) => actor.canEquip(item));
  };

  Scene_EnhancedItem.prototype.showEquipSelectionWindow = function (
    item,
    compatibleActors
  ) {
    this._equipSelectionWindow.setItem(item);
    this._equipSelectionWindow.setActors(compatibleActors);
    this._equipSelectionWindow.refresh();
    this._equipSelectionWindow.show();
    this._equipSelectionWindow.activate();
    this._equipSelectionWindow.select(0);
  };

  Scene_EnhancedItem.prototype.onEquipSelectionOk = function () {
    const item = this._equipSelectionWindow.item();
    const actor = this._equipSelectionWindow.selectedActor();

    if (item && actor) {
      this.equipItemToActor(item, actor);
    } else {
      this._equipSelectionWindow.hide();
      this._itemWindow.activate();
    }
  };

  Scene_EnhancedItem.prototype.onEquipSelectionCancel = function () {
    this._equipSelectionWindow.hide();
    this._itemWindow.activate();
  };

  Scene_EnhancedItem.prototype.onContextMenuOk = function () {
    const command = this._contextMenu.currentSymbol();
    const item = this._contextMenu.item();

    this._contextMenu.hide();

    switch (command) {
      case "use":
        this.handleItemSelection(item);
        break;
      case "throw":
        this.throwItemToPlugin(item);
        break;
      case "favorite":
        // The slot picker is gone: the hotbar itself (ItemSystemHotbar.js) is
        // where slots are chosen now, so this only flips the item onto it.
        if (window.ItemHotbar && window.ItemHotbar.toggle(item)) SoundManager.playOk();
        else SoundManager.playBuzzer();
        this._itemWindow.activate();
        break;
      case "disassemble":
        this.disassembleItem(item);
        break;
      case "equip1":
        this.equipItemToActorByIndex(item, 0);
        break;
      case "equip2":
        this.equipItemToActorByIndex(item, 1);
        break;
      case "equip3":
        this.equipItemToActorByIndex(item, 2);
        break;
      default:
        // Handle special commands (special1, special2, special3)
        if (command.startsWith("special")) {
          this.executeSpecialCommand(item, command);
        } else {
          this._itemWindow.activate();
        }
        break;
    }
  };

  Scene_EnhancedItem.prototype.onContextMenuCancel = function () {
    this._contextMenu.hide();
    this._itemWindow.activate();
  };

  Scene_EnhancedItem.prototype.throwItemToPlugin = function (item) {
    if (!item) {
      this._itemWindow.activate();
      return;
    }

    // Determine item type and ID
    let itemType = 'item';
    let itemId = 0;

    if (DataManager.isWeapon(item)) {
      itemType = 'weapon';
      itemId = item.id;
    } else if (DataManager.isArmor(item)) {
      itemType = 'armor';
      itemId = item.id;
    } else if (DataManager.isItem(item)) {
      itemType = 'item';
      itemId = item.id;
    }

    // Check if party has the item
    if ($gameParty.numItems(item) <= 0) {
      SoundManager.playBuzzer();
      this._itemWindow.activate();
      return;
    }

    // Save item data for throwing on the map
    $gameSystem._pendingThrowItem = {
      itemType: itemType,
      itemId: itemId,
      iconIndex: item.iconIndex
    };

    // Close all menus and return to map
    SoundManager.playOk();
    SceneManager.goto(Scene_Map);
  };

  Scene_EnhancedItem.prototype.equipItemToActorByIndex = function (item, actorIndex) {
    if (!item) {
      this._itemWindow.activate();
      return;
    }

    const actor = $gameParty.members()[actorIndex];
    if (!actor) {
      SoundManager.playBuzzer();
      this._itemWindow.activate();
      return;
    }

    if (!actor.canEquip(item)) {
      SoundManager.playBuzzer();
      this._itemWindow.activate();
      return;
    }

    this.equipItemToActor(item, actor);
  };

  Scene_EnhancedItem.prototype.disassembleItem = function (item) {
    if (!item) {
      this._itemWindow.activate();
      return;
    }

    // Placeholder for disassemble functionality
    SoundManager.playBuzzer();
    this._itemWindow.activate();
  };

  Scene_EnhancedItem.prototype.executeSpecialCommand = function (item, commandSymbol) {
    if (!item || !item.note) {
      this._itemWindow.activate();
      return;
    }

    // Parse special commands from item notes
    const specialCommands = this.parseSpecialCommands(item);
    const index = parseInt(commandSymbol.replace("special", "")) - 1;

    if (index >= 0 && index < specialCommands.length) {
      const specialName = specialCommands[index];
      const specialConfig = SPECIAL_COMMANDS[specialName];

      if (specialConfig) {
        $gameTemp._specialActionItemId = item.id;
        // A verb the backpack answers itself (a book quotes a passage, or is
        // studied) never reaches a common event; everything else runs one.
        const inline = INLINE_VERBS[specialName];
        const handled = !!(inline && inline(item));
        if (!handled && specialConfig.commonEventId > 0) {
          SoundManager.playOk();
          $gameTemp.reserveCommonEvent(specialConfig.commonEventId);
        } else if (!handled) {
          // The verb declined the item and there is nothing else to run.
          SoundManager.playBuzzer();
          this._itemWindow.activate();
          return;
        } else {
          SoundManager.playOk();
        }
        this.popScene();
        SceneManager.goto(Scene_Map);
        return;
      }
    }

    SoundManager.playBuzzer();
    this._itemWindow.activate();
  };

  Scene_EnhancedItem.prototype.parseSpecialCommands = function (item) {
    return specialCommandsFor(item);
  };

  Scene_EnhancedItem.prototype.equipItemToActor = function (item, actor) {
    if (!item || !actor) return;

    // A hand takes a weapon or a shield, so the slot is chosen by what would
    // accept the piece rather than by matching equip types. A free hand wins;
    // failing that the first hand whose contents can be swapped out.
    let slotId = window.HandSlots ? window.HandSlots.emptySlotFor(actor, item) : -1;
    if (slotId < 0) {
      const equipSlots = actor.equipSlots();
      for (let i = 0; i < equipSlots.length; i++) {
        if (window.HandSlots && !window.HandSlots.slotFits(actor, i, item)) continue;
        if (!window.HandSlots && equipSlots[i] !== item.etypeId) continue;
        if (!actor.isEquipChangeOk(i)) continue;
        slotId = i; break;
      }
    }

    if (slotId >= 0) {
      SoundManager.playEquip();
      actor.changeEquip(slotId, item);
      this._itemWindow.refresh();
      this._weightWindow.refresh();
      if (this._equipSelectionWindow.visible) {
        this._equipSelectionWindow.hide();
      }
      this._itemWindow.activate();
    } else {
      SoundManager.playBuzzer();
      if (this._equipSelectionWindow.visible) {
        this._equipSelectionWindow.hide();
      }
      this._itemWindow.activate();
    }
  };

  Scene_EnhancedItem.prototype.isItemTargetRequired = function (item) {
    if (!item) return false;
    const scope = item.scope;
    return [7, 8, 9, 10].includes(scope); // Allies
  };

  Scene_EnhancedItem.prototype.showItemTargetWindow = function (item) {
    this._targetWindow.setItem(item);
    this._targetWindow.refresh();
    this._targetWindow.show();
    this._targetWindow.activate();
    this._targetWindow.select(0);
    this._itemWindow.hide();
    this._detailWindow.hide();
  };

  // Dispatch a chosen item to the correct use path: ally-targeted items open
  // the target picker, everything else is used immediately. Referenced by the
  // context-menu "use" command.
  Scene_EnhancedItem.prototype.handleItemSelection = function (item) {
    if (!item) {
      if (this._itemWindow && !this._itemWindow.destroyed) this._itemWindow.activate();
      return;
    }
    if (this.isItemTargetRequired(item)) {
      this.showItemTargetWindow(item);
    } else {
      this.useItemWithoutTarget(item);
      if (this._itemWindow && !this._itemWindow.destroyed) {
        this._itemWindow.refresh();
        this._itemWindow.activate();
      }
      if (this._weightWindow && !this._weightWindow.destroyed) {
        this._weightWindow.refresh();
      }
    }
  };

  Scene_EnhancedItem.prototype.onTargetOk = function () {
    const item = this._targetWindow.item();
    const targetIndex = this._targetWindow.index();

    if (item) {
      const partySize = $gameParty.members().length;
      if (partySize > 1 && targetIndex === partySize) {
        this.useItemOnAllParty(item);
      } else {
        const actor = $gameParty.members()[targetIndex];
        if (actor) {
          this.useItemOnActor(actor, item);
        }
      }
      this.hideTargetWindowAndRefresh();
    }
  };

  Scene_EnhancedItem.prototype.onTargetCancel = function () {
    this.hideTargetWindowAndRefresh();
  };

  Scene_EnhancedItem.prototype.hideTargetWindowAndRefresh = function () {
    if (this._targetWindow && !this._targetWindow.destroyed) {
      this._targetWindow.hide();
    }
    if (this._itemWindow && !this._itemWindow.destroyed) {
      this._itemWindow.show();
      this._itemWindow.refresh();
      this._itemWindow.activate();
    }
    if (this._detailWindow && !this._detailWindow.destroyed) {
      this._detailWindow.show();
    }
    if (this._weightWindow && !this._weightWindow.destroyed) {
      this._weightWindow.refresh();
    }
  };

  //=============================================================================
  // ItemUse , using an item, with no menu around it
  //=============================================================================
  // The backpack is not the only place an item is used: the map's quick bar
  // reaches for the same food and the same bandages with no scene to pop back
  // out of. So the application itself lives here, scene-free, and each caller
  // adds only its own navigation: the backpack pops back to the map when a
  // common event has been reserved, the quick bar is standing there already.
  //
  // Every entry point answers { used, commonEvent }: whether the item was
  // spent at all, and the id of the common event it reserved (0 for none).

  const NO_USE = { used: false, commonEvent: 0 };

  function animationSoundOf(item) {
    if (!item || !item.animationId || item.animationId <= 0) return null;
    const animation = $dataAnimations[item.animationId];
    if (!animation || !animation.soundTimings || animation.soundTimings.length === 0) return null;
    const sorted = animation.soundTimings.slice().sort((a, b) => a.frame - b.frame);
    return sorted[0] ? sorted[0].se : null;
  }

  function playItemSound(item) {
    const se = animationSoundOf(item);
    if (se && se.name) AudioManager.playSe(se);
    else SoundManager.playUseItem();  // Fallback
  }

  function commonEventEffectOf(item) {
    if (!item || !item.effects) return 0;
    const effect = item.effects.find((e) => e.code === Game_Action.EFFECT_COMMON_EVENT);
    return effect ? effect.dataId : 0;
  }

  // A meal is eaten where it is picked up. It used to be handed to one of the
  // EatFood common events (23/24/25), which meant the backpack had to close and
  // drop the player back onto the map for the food to do anything at all: a
  // menu could not feed anybody. window.PartyMeal applies the same three tags
  // by the same formula the command does, so eating happens in the menu, and
  // the serving card draws what it did to every meter it touched.
  //
  // Only the party's own mouths are served: a summon holds the fourth slot
  // while it is out, and it is not fed (window.PartyMeal.eaters).
  function eatFoodItem(actor, item, isParty) {
    const meal = window.PartyMeal;
    if (!meal) return null;

    const nutrition = meal.nutritionOf(item);
    const recovery = meal.recoveryOf(nutrition);
    // A party-scope item is passed round the table; a single-target one is
    // eaten by the character it was given to. Either way the food meter it
    // moves is the party's one meter, so the list only says whose bars the card
    // draws, and a summon holding the fourth slot is on neither.
    const actors = (isParty || !actor) ? meal.eaters()
      : (meal.eaters().includes(actor) ? [actor] : []);
    if (!actors.length) return null;

    return meal.eat(recovery, {
      actors,
      caffeine: nutrition.caffeine,
      title: window.translateText ? window.translateText(item.name) : item.name,
    });
  }

  // The item's own common event, if it carries one. Reserving it is what tells
  // the caller the use has to be played out on the map.
  //
  // Nothing else is staged here: an item taken on the map used to answer with a
  // white flash over the whole screen, which is a great deal of screen for a
  // bandage. The sound the use already plays is the confirmation.
  function reserveItemCommonEvent(item) {
    const commonEventId = commonEventEffectOf(item);
    // The event that runs next has to be able to ask what was used to run it:
    // one common event now serves every book, and it reads the book off the
    // item. Scene_ItemBase does this for the default menu; this menu is the
    // one the game actually uses.
    if (commonEventId > 0) {
      $gameParty.setLastItem(item);
      // A Special verb leaves the id of its own item behind for the event to
      // read. An ordinary use is the newer claim and clears it: left standing,
      // it would open the same book again however many others were used after.
      $gameTemp._specialActionItemId = 0;
      $gameTemp.reserveCommonEvent(commonEventId);
    }
    return commonEventId;
  }

  // One dose of a medicine against an illness the character is carrying.
  // Returns true when the disease system took the dose (and the item with it).
  function medicineDose(actor, item) {
    const sys = window.DiseaseSystem;
    if (!sys || !sys.doseWithItem || !actor || !item) return false;
    if (!$gameParty.numItems(item)) return false;
    try {
      const result = sys.doseWithItem(actor, item);
      return !!(result && result.used);
    } catch (e) {
      console.error("[ItemSystemInventory] medicine dose failed", e);
      return false;
    }
  }

  const ItemUse = {
    /** One ally: the target picker's answer, wherever it was asked. */
    onActor(actor, item) {
      if (!actor || !item) return NO_USE;

      const isFood = utils.hasItemCategory(item, "Food");  // i18n-ignore  item-category id

      if (isFood) {
        playItemSound(item);

        if (actor.hp < actor.mhp && item.damage && item.damage.type === 3) {
          const action = new Game_Action(actor);
          action.setItemObject(item);
          action.apply(actor);
          actor.refresh();
        }

        // Eating always consumes one of the item, regardless of the database
        // "Consume" flag (issue #144).
        $gameParty.loseItem(item, 1);
        utils.applyNeedRestores(actor, item);
        eatFoodItem(actor, item, false);

        return { used: true, commonEvent: reserveItemCommonEvent(item) };
      }

      // Medicine taken against an illness this character actually carries: the
      // disease system swallows the dose itself (it consumes the bottle and
      // hands back the HP and MP the medicine gives), so a full-health patient
      // can still take their course instead of being refused.
      const dose = medicineDose(actor, item);
      if (dose) {
        playItemSound(item);
        utils.applyNeedRestores(actor, item);
        const doseEvent = reserveItemCommonEvent(item);
        actor.refresh();
        return { used: true, commonEvent: doseEvent };
      }

      const action = new Game_Action(actor);
      action.setItemObject(item);
      action.apply(actor);

      // Items whose only purpose is replenishing a need or feeding a craving (no
      // HP/MP/state effect) won't register a "hit", so honor those tags as a
      // valid use on their own.
      const hasNeedRestore = utils.satisfiesNeed(item);

      if (!(actor.result().isHit() || hasNeedRestore)) {
        SoundManager.playBuzzer();
        return NO_USE;
      }

      playItemSound(item);
      $gameParty.consumeItem(item);
      utils.applyNeedRestores(actor, item);
      const commonEvent = reserveItemCommonEvent(item);
      actor.refresh();
      return { used: true, commonEvent };
    },

    /** The whole party, from a scope-8/10 item. */
    onAllParty(item) {
      if (!item) return NO_USE;

      const isFood = utils.hasItemCategory(item, "Food");  // i18n-ignore  item-category id

      if (isFood) {
        const targets = $gameParty.members().filter((member) => member.isAlive());
        if (targets.length === 0) return NO_USE;

        playItemSound(item);
        // Eating always consumes one, regardless of the database flag (issue #144).
        $gameParty.loseItem(item, 1);

        for (const actor of targets) {
          if (item.damage && item.damage.type === 3 && actor.hp < actor.mhp) {
            const action = new Game_Action(actor);
            action.setItemObject(item);
            action.apply(actor);
            actor.refresh();
          }
          utils.applyNeedRestores(actor, item);
        }

        eatFoodItem(null, item, true);
        return { used: true, commonEvent: reserveItemCommonEvent(item) };
      }

      const targets = $gameParty.members().filter((member) => {
        if (item.scope === 9 || item.scope === 10) return member.isDead();
        return member.isAlive();
      });
      if (targets.length === 0) return NO_USE;

      playItemSound(item);
      $gameParty.consumeItem(item);
      for (const actor of targets) {
        const action = new Game_Action(actor);
        action.setItemObject(item);
        action.apply(actor);
        utils.applyNeedRestores(actor, item);
        actor.refresh();
      }

      return { used: true, commonEvent: reserveItemCommonEvent(item) };
    },

    /**
     * An item that asks nobody who it is for: the whole party (scope 0), the
     * user (scope 11), or anything at all whose point is the common event it
     * carries.
     */
    withoutTarget(item) {
      if (!item) return NO_USE;

      const scope = item.scope;
      const commonEventId = commonEventEffectOf(item);
      if (scope !== 0 && scope !== 11 && commonEventId <= 0) {
        SoundManager.playBuzzer();
        return NO_USE;
      }

      playItemSound(item);
      $gameParty.consumeItem(item);

      if (commonEventId > 0) {
        // Through reserveItemCommonEvent, not straight to $gameTemp: the event
        // that runs next asks what was used to run it (one common event serves
        // every book in the game), and a scope-0 item comes through here.
        return { used: true, commonEvent: reserveItemCommonEvent(item) };
      }

      if (scope === 0) {
        $gameParty.members().forEach((actor) => {
          actor.useItem(item);
          utils.applyNeedRestores(actor, item);
        });
      } else if (scope === 11) {
        const actor = $gameParty.leader();
        if (actor && actor.canUse(item)) {
          actor.useItem(item);
          utils.applyNeedRestores(actor, item);
        }
      }

      return { used: true, commonEvent: 0 };
    },

    /** Whether an item wants to be told which ally it is for. */
    needsTarget(item) {
      return !!item && [7, 8, 9, 10].includes(item.scope);
    }
  };

  window.ItemUse = ItemUse;

  // The scene's own use paths: the shared application, plus the one thing only
  // a menu has to do , get out of the way so the map can run what was reserved.
  Scene_EnhancedItem.prototype.useItemWithoutTarget = function (item) {
    const result = ItemUse.withoutTarget(item);
    if (result.commonEvent > 0) {
      this.popScene();
      SceneManager.goto(Scene_Map);
    }
  };

  Scene_EnhancedItem.prototype.useItemOnAllParty = function (item) {
    const result = ItemUse.onAllParty(item);
    if (result.commonEvent > 0) {
      this.popScene();
      SceneManager.goto(Scene_Map);
    }
    this.hideTargetWindowAndRefresh();
  };

  Scene_EnhancedItem.prototype.useItemOnActor = function (actor, item) {
    const result = ItemUse.onActor(actor, item);
    if (result.commonEvent > 0) {
      this.popScene();
      SceneManager.goto(Scene_Map);
    }
    this.hideTargetWindowAndRefresh();
  };

  Scene_EnhancedItem.prototype.triggerCommonEvent = function (item) {
    const commonEventId = commonEventEffectOf(item);
    if (commonEventId > 0) {
      $gameTemp.reserveCommonEvent(commonEventId);
      return true;
    }
    return false;
  };

  Scene_EnhancedItem.prototype.calculateHealingAmount = function (
    action,
    target,
    item
  ) {
    if (!action || !target || !item || !item.damage) return 0;
    let value = action.evalDamageFormula(target);
    value = action.applyVariance(value, item.damage.variance);
    if (item.damage.critical) {
      value = action.applyCritical(value);
    }
    return value;
  };

  Scene_EnhancedItem.prototype.applyItemDamageEffects = function (actor, item) {
    if (!actor || !item || !item.damage || item.damage.type === 0) return false;
    const action = new Game_Action(actor);
    action.setItemObject(item);
    let value = this.calculateHealingAmount(action, actor, item);

    switch (item.damage.type) {
      case 1: actor.gainHp(-value); break;
      case 2: actor.gainMp(-value); break;
      case 3: actor.gainHp(value); SoundManager.playRecovery(); break;
      case 4: actor.gainMp(value); SoundManager.playRecovery(); break;
      case 5: actor.gainHp(value); break;
      case 6: actor.gainMp(value); break;
      default: return false;
    }
    return true;
  };

  Scene_EnhancedItem.prototype.applyItemEffects = function (actor, item) {
    if (!actor || !item || !item.effects) return;
    for (const effect of item.effects) {
      this.applyItemEffect(actor, effect);
    }
  };

  Scene_EnhancedItem.prototype.applyItemEffect = function (actor, effect) {
    if (!actor || !effect) return;
    switch (effect.code) {
      case Game_Action.EFFECT_REMOVE_DEBUFF:
        actor.removeBuff(effect.dataId);
        break;
      case Game_Action.EFFECT_GROW:
        actor.addParam(effect.dataId, Math.floor(effect.value1));
        break;
      case Game_Action.EFFECT_LEARN_SKILL:
        actor.learnSkill(effect.dataId);
        break;
    }
  };

  Scene_EnhancedItem.prototype.hasItemCategory = function (item, category) {
    if (!item || !item.note) return false;
    const regex = new RegExp(`<category:${category}>`, "i");
    return regex.test(item.note);
  };

  // Kept as the scene's own names for these; the work itself is ItemUse's, so
  // there is one reading of a food tag and one item sound in the plugin.
  Scene_EnhancedItem.prototype.handleFoodItem = function (actor, item, isParty = false) {
    eatFoodItem(actor, item, isParty);
  };

  Scene_EnhancedItem.prototype.getCommonEventEffect = function (item) {
    return commonEventEffectOf(item);
  };

  Scene_EnhancedItem.prototype.getAnimationSound = function (item) {
    return animationSoundOf(item);
  };

  Scene_EnhancedItem.prototype.playItemSound = function (item) {
    playItemSound(item);
  };

  //=============================================================================
  // Auto-Eat System
  //=============================================================================

  // Function to automatically eat a food item when hunger reaches 0%
  function autoEatFood(actor) {
    if (!actor) return false;

    // Find a food item in inventory
    const foodItems = $gameParty.allItems().filter(item =>
      DataManager.isItem(item) && utils.hasItemCategory(item, "Food")  // i18n-ignore  item-category id
    );

    if (foodItems.length === 0) {
      return false;
    }

    // Get the first food item
    const foodItem = foodItems[0];

    // Check if we actually have this item
    if ($gameParty.numItems(foodItem) <= 0) {
      return false;
    }

    // Play eat sound
    const animationSound = foodItem.animationId && $dataAnimations[foodItem.animationId]
      ? ($dataAnimations[foodItem.animationId].soundTimings || []).find(st => st.se && st.se.name)
      : null;

    if (animationSound && animationSound.se && animationSound.se.name) {
      AudioManager.playSe(animationSound.se);
    } else {
      SoundManager.playUseItem();
    }

    // Consume the item
    $gameParty.consumeItem(foodItem);

    // The meal is applied right here, through window.PartyMeal, and the EatFood
    // common event is NOT reserved as well: it would read the same nutrition
    // and add the meal a second time. Worse, a reserved common event only runs
    // once the map interpreter gets a turn, so a starving party walking through
    // a scene that never runs one used to queue one EatFood per member per step
    // and then apply the whole stack at once, slamming hunger up to the
    // overeating ceiling where it looked frozen for a thousand steps.
    eatFoodItem(actor, foodItem, false);

    // Add notification
    const itemName = window.translateText ? window.translateText(foodItem.name) : foodItem.name;
    const message = T('Inventory.autoAte', { actor: actor.name(), item: itemName });

    if (window.ParchmentToast) {
      window.ParchmentToast.show(message, { severity: "info", duration: 120 });
    }

    return true;
  }

  // Hook into Game_Party hunger update to trigger auto-eat
  const _Game_Party_updateHungerAndSleep = Game_Party.prototype.updateHungerAndSleep;
  Game_Party.prototype.updateHungerAndSleep = function () {
    // Call original function first
    _Game_Party_updateHungerAndSleep.call(this);

    // Hunger is one meter shared by the whole party, so an empty one is fed
    // once, through the leader, and only until it is off empty again. Feeding
    // every member on the same step used to spend three tins on one stomach.
    const leader = this.leader();
    if (leader && leader.hunger() <= 0) {
      autoEatFood(leader);
    }
  };

  //=============================================================================
  // Weight Window Class
  //=============================================================================

  function Window_Weight() {
    this.initialize(...arguments);
  }

  Window_Weight.prototype = Object.create(Window_Base.prototype);
  Window_Weight.prototype.constructor = Window_Weight;

  Window_Weight.prototype.initialize = function (rect) {
    Window_Base.prototype.initialize.call(this, rect);
    this.refresh();
  };

  Window_Weight.prototype.refresh = function () {
    this.contents.clear();
    const currentWeight = utils.calculateTotalWeight();
    const maxWeight = utils.calculateMaxCarryWeight();
    const useTranslation = ConfigManager.language === "it";

    const tabName =T('Inventory.items');

    const x = 0;
    const y = 0;
    const width = this.innerWidth;

    this.changeTextColor(ColorManager.systemColor());
    this.drawText(tabName, x, y, width, "left");

    if (utils.isOverencumbered()) {
      this.changeTextColor(ColorManager.deathColor());
    } else if (currentWeight > maxWeight * 0.8) {
      this.changeTextColor(ColorManager.crisisColor());
    } else {
      this.changeTextColor(ColorManager.normalColor());
    }

    const weightText =T('Inventory.weight');
    this.drawText(
      weightText + ": " + utils.formatWeight(currentWeight) + " / " + utils.formatWeight(maxWeight),
      x, y, width, "right"
    );

    if (utils.isOverencumbered()) {
      this.changeTextColor(ColorManager.deathColor());
      const warningText =T('Inventory.overencumberedMovementSlowed');
      this.drawText(warningText, x, y + this.lineHeight() / 2, width, "center");
    }
    this.resetTextColor();
  };

  //=============================================================================
  // Enhanced Item List Window
  //=============================================================================

  function Window_EnhancedItemList() {
    this.initialize(...arguments);
  }

  Window_EnhancedItemList.prototype = Object.create(Window_ItemList.prototype);
  Window_EnhancedItemList.prototype.constructor = Window_EnhancedItemList;

  Window_EnhancedItemList.prototype.initialize = function (rect) {
    Window_ItemList.prototype.initialize.call(this, rect);
    this._category = "item";
    this._detailWindow = null;
    this._weightWindow = null;
    this._scene = null;
    this._openCategory = null; // Track which category drawer is open
  };

  Window_EnhancedItemList.prototype.maxCols = function () {
    return 2;
  };

  // Base engine sizes this column for 3 digits (max 99); stacks now go up to
  // 9999, so widen it to 4 to avoid clipping against the name column.
  Window_EnhancedItemList.prototype.numberWidth = function () {
    return this.textWidth("0000");
  };

  Window_EnhancedItemList.prototype.itemRect = function (index) {
    if (!this._data || index < 0 || index >= this._data.length) {
      const rect = new Rectangle();
      rect.width = this.innerWidth / 2;
      rect.height = this.itemHeight();
      return rect;
    }
    let row = 0;
    let col = 0;
    for (let i = 0; i < index; i++) {
      const item = this._data[i];
      if (item && item.isCommand) {
        row++;
        col = 0;
      } else {
        col++;
        if (col >= 2) {
          row++;
          col = 0;
        }
      }
    }

    const item = this._data[index];
    if (item && item.isCommand && col > 0) {
      row++;
      col = 0;
    }

    const rect = new Rectangle();
    rect.width = this.innerWidth / 2;
    rect.height = this.itemHeight();

    if (item && item.isCommand) {
      rect.width = this.innerWidth;
      rect.x = 0;
    } else {
      rect.x = col * rect.width;
    }
    rect.y = row * rect.height;

    return rect;
  };

  Window_EnhancedItemList.prototype.maxRows = function () {
    if (!this._data) return 0;
    let rows = 0;
    let col = 0;
    for (let i = 0; i < this.maxItems(); i++) {
      const item = this._data[i];
      if (item && item.isCommand) {
        if (col > 0) {
          rows++;
          col = 0;
        }
        rows++;
        col = 0;
      } else {
        col++;
        if (col >= 2) {
          rows++;
          col = 0;
        }
      }
    }
    if (col > 0) rows++;
    return rows;
  };

  Window_EnhancedItemList.prototype.row = function (index) {
    if (index === undefined) {
      index = this.index();
    }
    if (index < 0) return -1;
    if (!this._data || index >= this._data.length) {
      return Math.floor(index / this.maxCols());
    }
    let row = 0;
    let col = 0;
    for (let i = 0; i < index; i++) {
      const item = this._data[i];
      if (item && item.isCommand) {
        row++;
        col = 0;
      } else {
        col++;
        if (col >= 2) {
          row++;
          col = 0;
        }
      }
    }
    const item = this._data[index];
    if (item && item.isCommand && col > 0) {
      row++;
    }
    return row;
  };

  Window_EnhancedItemList.prototype.topIndex = function () {
    if (!this._data) return 0;
    const topRow = this.topRow();
    for (let i = 0; i < this.maxItems(); i++) {
      if (this.row(i) >= topRow) {
        return i;
      }
    }
    return 0;
  };

  Window_EnhancedItemList.prototype.cursorDown = function (wrap) {
    if (!this._data) {
      Window_Selectable.prototype.cursorDown.call(this, wrap);
      return;
    }
    const index = this.index();
    const maxItems = this.maxItems();
    if (index >= 0) {
      const currentRect = this.itemRect(index);
      let nextIndex = index + 1;
      while (nextIndex < maxItems) {
        const nextRect = this.itemRect(nextIndex);
        if (nextRect.y > currentRect.y) {
          this.select(nextIndex);
          return;
        }
        nextIndex++;
      }
    }
    Window_Selectable.prototype.cursorDown.call(this, wrap);
  };

  Window_EnhancedItemList.prototype.cursorUp = function (wrap) {
    if (!this._data) {
      Window_Selectable.prototype.cursorUp.call(this, wrap);
      return;
    }
    const index = this.index();
    if (index >= 0) {
      const currentRect = this.itemRect(index);
      let prevIndex = index - 1;
      while (prevIndex >= 0) {
        const prevRect = this.itemRect(prevIndex);
        if (prevRect.y < currentRect.y) {
          this.select(prevIndex);
          return;
        }
        prevIndex--;
      }
    }
    Window_Selectable.prototype.cursorUp.call(this, wrap);
  };

  Window_EnhancedItemList.prototype.drawItemName = function (item, x, y, width) {
    if (item) {
      const iconY = y + (this.lineHeight() - ImageManager.iconHeight) / 2;
      const textMargin = ImageManager.iconWidth + 4;
      const itemWidth = width || this.innerWidth - textMargin;

      const rarity = window.ItemSystemUtils.getItemRarity(item);

      this.resetTextColor();
      this.drawIcon(item.iconIndex, x, iconY);

      this.changeTextColor(rarity.colorCode);
      this.drawText(item.name, x + textMargin, y, itemWidth);
      this.resetTextColor();
    }
  };

  Window_EnhancedItemList.prototype.drawItem = function (index) {
    const item = this.itemAt(index);
    if (item) {
      const rect = this.itemLineRect(index);

      if (item.isCommand) {
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(item.name, rect.x, rect.y, rect.width, "left");
        this.resetTextColor();
        return;
      }

      const numberWidth = this.numberWidth();
      const weightWidth = 80;
      const originalName = item.name;

      let displayName = item.name;
      if (window.translateText && typeof window.translateText === "function") {
        displayName = window.translateText(item.name) || item.name;
      }

      const slot = this._favoriteSlotsMap ? this._favoriteSlotsMap.get(item) : null;
      if (slot) {
        displayName = `${slot}: ${displayName}`;
      }

      item.name = displayName;
      this.drawItemName(item, rect.x, rect.y, rect.width - numberWidth - weightWidth);
      item.name = originalName;

      this.resetTextColor();
      this.drawItemNumber(item, rect.x, rect.y, rect.width);
    }
  };

  Window_EnhancedItemList.prototype.setDetailWindow = function (detailWindow) {
    this._detailWindow = detailWindow;
    this.updateDetail();
  };

  Window_EnhancedItemList.prototype.setWeightWindow = function (weightWindow) {
    this._weightWindow = weightWindow;
  };

  Window_EnhancedItemList.prototype.setCategory = function (category) {
    if (this._category !== category) {
      this._category = category;
      this._data = [];
      this.makeItemList();
      this.refresh();
      this.scrollTo(0, 0);
    }
  };

  Window_EnhancedItemList.prototype.setOpenCategory = function (category) {
    this._openCategory = category;
    this.makeItemList();
  };

  Window_EnhancedItemList.prototype.includes = function (item) {
    switch (this._category) {
      case "item":
        return DataManager.isItem(item) && item.itypeId === 1 && !utils.isFoodItem(item) && !utils.isToolsItem(item) && !utils.isMedicalItem(item);
      case "medical":
        return DataManager.isItem(item) && utils.isMedicalItem(item);
      case "tools":
        return DataManager.isItem(item) && utils.isToolsItem(item);
      case "food":
        return DataManager.isItem(item) && utils.isFoodItem(item);
      case "weapon":
        return DataManager.isWeapon(item);
      case "armor":
        return DataManager.isArmor(item);
      case "keyItem":
        return DataManager.isItem(item) && item.itypeId === 2;
      default:
        return false;
    }
  };

  Window_EnhancedItemList.prototype.makeItemList = function () {
    this._data = [];
    this._favoriteSlotsMap = new WeakMap(); // Reset map
    const useTranslation = ConfigManager.language === "it";

    // Count favorites
    let favCount = 0;
    const allItems = $gameParty.allItems();
    for (let i = 1; i <= 9; i++) {
      const itemId = $gameSystem.getFavoriteItem(String(i));
      if (itemId) {
        const item = $dataItems[itemId];
        if (item && $gameParty.numItems(item) > 0) {
          favCount++;
        }
      }
    }

    // Define categories in order
    const categories = [
      { key: "favorites", label:T('Inventory.favorites'), count: favCount },
      { key: "medical", label:T('Inventory.medical'), count: utils.countMedicalItems() },
      { key: "tools", label:T('Inventory.tools'), count: utils.countToolsItems() },
      { key: "food", label:T('Inventory.food'), count: utils.countFoodItems() },
      { key: "weapon", label:T('Inventory.weapons'), count: utils.countWeapons() },
      { key: "armor", label:T('Inventory.armors'), count: utils.countArmors() },
      { key: "keyItem", label:T('Inventory.materials'), count: utils.countMaterials() }
    ];

    // Add dynamic categories from owned items
    const dynamicCategories = [];
    for (const item of allItems) {
      if (DataManager.isItem(item)) {
        const rawCat = utils.getRawCategoryFromNote(item);
        if (rawCat) {
          const lowerCat = rawCat.toLowerCase();
          const isHardcoded = ["medical", "food", "tools"].includes(lowerCat);
          if (!isHardcoded && !dynamicCategories.some(c => c.toLowerCase() === lowerCat)) {
            dynamicCategories.push(rawCat);
          }
        }
      }
    }

    for (const catName of dynamicCategories) {
      const count = allItems.filter(item => {
        if (!DataManager.isItem(item)) return false;
        const c = utils.getRawCategoryFromNote(item);
        return c && c.toLowerCase() === catName.toLowerCase();
      }).length;

      categories.push({
        key: catName.toLowerCase(),
        label: `${catName}`,
        count: count
      });
    }

    // The drawers are ranked by the same table as the tab row - Medical and
    // Tools first, Materials then Body Parts last - so a category sits in the
    // same place whichever view the player is in. The sort is stable, so
    // everything in the middle keeps the order it was built in. Favourites
    // stays above the lot: it is a shelf the player builds, not one the loot
    // decides.
    const drawerRank = (cat) => (cat.key === "favorites"
      ? -1
      : categoryRank(cat.key === "keyItem" ? "materials" : cat.key));  // i18n-ignore  item-category id
    categories.sort((a, b) => drawerRank(a) - drawerRank(b));

    // Build list with accordion behavior
    for (const cat of categories) {
      // Only show categories that have items
      if (cat.count > 0) {
        // Add category header
        this._data.push({
          name: `${cat.label} (${cat.count})`,
          isCommand: true,
          category: cat.key
        });

        // If this category is open, add its items
        if (this._openCategory === cat.key) {
          let categoryItems = [];
          if (cat.key === "favorites") {
            for (let i = 1; i <= 9; i++) {
              const itemId = $gameSystem.getFavoriteItem(String(i));
              if (itemId) {
                const item = $dataItems[itemId];
                if (item && $gameParty.numItems(item) > 0) {
                  this._favoriteSlotsMap.set(item, i);
                  categoryItems.push(item);
                }
              }
            }
          } else if (cat.key === "medical") {
            categoryItems = $gameParty.allItems().filter((item) => DataManager.isItem(item) && utils.isMedicalItem(item));
          } else if (cat.key === "tools") {
            categoryItems = $gameParty.allItems().filter((item) => DataManager.isItem(item) && utils.isToolsItem(item));
          } else if (cat.key === "food") {
            categoryItems = $gameParty.allItems().filter((item) => DataManager.isItem(item) && utils.isFoodItem(item));
          } else if (cat.key === "weapon") {
            categoryItems = $gameParty.weapons();
          } else if (cat.key === "armor") {
            categoryItems = $gameParty.armors();
          } else if (cat.key === "keyItem") {
            categoryItems = $gameParty.allItems().filter((item) => DataManager.isItem(item) && item.itypeId === 2);
          } else {
            // Dynamic category items
            categoryItems = $gameParty.allItems().filter((item) => {
              if (!DataManager.isItem(item)) return false;
              const c = utils.getRawCategoryFromNote(item);
              return c && c.toLowerCase() === cat.key;
            });
          }
          this._data = this._data.concat(categoryItems);
        }
      }
    }

    // Add regular items at the end (items that don't belong to any category)
    const regularItems = $gameParty.allItems().filter((item) =>
      DataManager.isItem(item) &&
      item.itypeId === 1 &&
      !utils.isFoodItem(item) &&
      !utils.isToolsItem(item) &&
      !utils.isMedicalItem(item) &&
      !utils.getRawCategoryFromNote(item)
    );
    this._data = this._data.concat(regularItems);
  };

  Window_EnhancedItemList.prototype.select = function (index) {
    Window_ItemList.prototype.select.call(this, index);
    this.updateDetail();
  };

  Window_EnhancedItemList.prototype.updateDetail = function () {
    if (this._detailWindow) {
      const item = this.item();
      this._detailWindow.setItem(item);
    }
  };

  Window_EnhancedItemList.prototype.setHandlers = function (scene) {
    this._scene = scene;
    this.setHandler("ok", this.onItemOk.bind(this));
    this.setHandler("cancel", this.onItemCancel.bind(this));
  };

  Window_EnhancedItemList.prototype.onItemOk = function () {
    this._scene.onItemOk();
  };

  Window_EnhancedItemList.prototype.processHandling = function () {
    if (this.isOpenAndActive()) {
      if (Input.isTriggered("ok")) {
        this.processOk();
        return;
      }
      if (Input.isTriggered("cancel") || Input.isRepeated("cancel")) {
        this.processCancel();
        return;
      }
      if (Input.isRepeated("pagedown")) {
        this.cursorPagedown();
      }
      if (Input.isRepeated("pageup")) {
        this.cursorPageup();
      }
    }
  };

  Window_EnhancedItemList.prototype.processOk = function () {
    if (this.isCurrentItemEnabled()) {
      this.playOkSound();
      this.updateInputData();
      this.deactivate();
      this.callOkHandler();
    } else {
      this.playBuzzerSound();
    }
  };

  Window_EnhancedItemList.prototype.isCurrentItemEnabled = function () {
    const item = this.item();
    if (!item) return false;
    if (item.isCommand) return true;
    // Allow all items, weapons, and armor to be selected
    // The context menu will handle what actions are available
    return true;
  };

  Window_EnhancedItemList.prototype.isEnabled = function (item) {
    if (!item) return false;
    if (item.isCommand) return true;
    // Allow all items, weapons, and armor to be selected
    // The context menu will handle what actions are available
    return true;
  };

  // Override base Window_ItemList.prototype.isEnabled
  Window_ItemList.prototype.isEnabled = function (item) {
    if (!item) return false;
    // Allow all items to be selected
    // The context menu will handle what actions are available
    return true;
  };

  Window_EnhancedItemList.prototype.callOkHandler = function () {
    if (this.isHandled("ok")) {
      this.callHandler("ok");
    }
  };

  //=============================================================================
  // Item Context Menu Window
  //=============================================================================

  function Window_ItemContextMenu() {
    this.initialize(...arguments);
  }

  Window_ItemContextMenu.prototype = Object.create(Window_Command.prototype);
  Window_ItemContextMenu.prototype.constructor = Window_ItemContextMenu;

  Window_ItemContextMenu.prototype.initialize = function (rect) {
    this._item = null;
    Window_Command.prototype.initialize.call(this, rect);
    this.hide();
    this.deactivate();
  };

  Window_ItemContextMenu.prototype.setItem = function (item) {
    if (this._item !== item) {
      this._item = item;
      this.refresh();
      this.updateWindowHeight();
    }
  };

  Window_ItemContextMenu.prototype.updateWindowHeight = function () {
    const numCommands = this.maxItems();
    const newHeight = this.fittingHeight(numCommands);
    const newY = (Graphics.boxHeight - newHeight) / 2;

    this.move(this.x, newY, this.width, newHeight);
    this.createContents();
    this.refresh();
  };

  Window_ItemContextMenu.prototype.item = function () {
    return this._item;
  };

  Window_ItemContextMenu.prototype.makeCommandList = function () {
    if (!this._item) return;

    const useTranslation = ConfigManager.language === "it";
    const isEquipment = DataManager.isWeapon(this._item) || DataManager.isArmor(this._item);

    if (isEquipment) {
      // Equipment context menu: Equip options + Throw + Cancel
      const equipText =T('Inventory.equip');

      // Add equip command for each party member who can equip this item
      $gameParty.members().forEach((actor, index) => {
        if (actor && actor.canEquip(this._item)) {
          const actorName = window.translateText ? window.translateText(actor.name()) : actor.name();
          this.addCommand(`${equipText} ${actorName}`, `equip${index + 1}`);
        }
      });

      if (!window.ThrowItem || window.ThrowItem.isThrowable(this._item)) {
        this.addCommand(T('Inventory.throw'), "throw");
      }
    } else {
      // Regular item context menu: Use (if consumable), Throw, Disassemble, Special

      // Check if item is consumable (default: yes, unless <Consumable: no>)
      const isConsumable = this.isItemConsumable(this._item);
      // Check if item can be used in menu (occasion: 0 = Always, 2 = Menu Screen)
      const canUseInMenu = this._item.occasion === 0 || this._item.occasion === 2;

      if (isConsumable && canUseInMenu) {
        this.addCommand(T('Inventory.use'), "use");
      }

      // Only usable items reach the hotbar (ItemSystemHotbar.js).
      if (window.ItemHotbar && window.ItemHotbar.isFavoritable(this._item)) {
        this.addCommand(T('Inventory.favorites2'), "favorite");
      }
      if (!window.ThrowItem || window.ThrowItem.isThrowable(this._item)) {
        this.addCommand(T('Inventory.throw'), "throw");
      }
      this.addCommand(T('Inventory.disassemble'), "disassemble");

      // Add special commands from item notes
      const specialCommands = this.parseSpecialCommands(this._item);
      for (let i = 0; i < Math.min(specialCommands.length, 3); i++) {
        const specialName = specialCommands[i];
        const translatedName = useTranslation && this.translateSpecialCommand(specialName)
          ? this.translateSpecialCommand(specialName)
          : specialName;
        this.addCommand(translatedName, `special${i + 1}`);
      }
    }
  };

  Window_ItemContextMenu.prototype.isItemConsumable = function (item) {
    if (!item || !item.note) return true; // Default: consumable

    // Check for <Consumable: no> tag
    const match = item.note.match(/<Consumable:\s*(no|false)>/i);
    return !match; // Return false if tag exists, true otherwise
  };

  Window_ItemContextMenu.prototype.parseSpecialCommands = function (item) {
    return specialCommandsFor(item);
  };

  Window_ItemContextMenu.prototype.translateSpecialCommand = function (commandName) {
    // Copy lives in js/i18n/<lang>/plugins/Inventory.json under `special`.
    const key = 'Inventory.special.' + String(commandName || '');
    return T.has(key) ? T(key) : null;
  };

  Window_ItemContextMenu.prototype.setHandlers = function (scene) {
    this._scene = scene;
    this.setHandler("ok", this.onMenuOk.bind(this));
    this.setHandler("cancel", this.onMenuCancel.bind(this));
  };

  Window_ItemContextMenu.prototype.onMenuOk = function () {
    if (this._scene && this._scene.onContextMenuOk) {
      this._scene.onContextMenuOk();
    }
  };

  Window_ItemContextMenu.prototype.onMenuCancel = function () {
    if (this._scene && this._scene.onContextMenuCancel) {
      this._scene.onContextMenuCancel();
    }
  };

  //=============================================================================
  // Game_System Extensions for Favorites
  //=============================================================================

  Game_System.prototype.getFavoriteItem = function (slot) {
    if (!this._favoriteItems) this._favoriteItems = {};
    return this._favoriteItems[slot];
  };

  Game_System.prototype.setFavoriteItem = function (slot, itemId) {
    if (!this._favoriteItems) this._favoriteItems = {};
    this._favoriteItems[slot] = itemId;
  };

  //=============================================================================
  // Override Scene_Menu to use our enhanced scene
  //=============================================================================

  const _Scene_Menu_commandItem = Scene_Menu.prototype.commandItem;
  Scene_Menu.prototype.commandItem = function () {
    SceneManager.push(Scene_EnhancedItem);
  };

  //=============================================================================
  // Actor Window Extensions
  //=============================================================================

  Window_MenuActor.prototype.setHandlers = function (scene) {
    this._scene = scene;
    this.setHandler("ok", this.onActorOk.bind(this));
    this.setHandler("cancel", this.onActorCancel.bind(this));
  };

  Window_MenuActor.prototype.onActorOk = function () {
    if (this._scene && this._scene.onActorOk) {
      this._scene.onActorOk(this.actor());
    }
  };

  Window_MenuActor.prototype.onActorCancel = function () {
    if (this._scene && this._scene.onActorCancel) {
      this._scene.onActorCancel();
    }
  };

  //=============================================================================
  // Target Selection Window
  //=============================================================================

  function Window_ItemTarget() {
    this.initialize(...arguments);
  }

  Window_ItemTarget.prototype = Object.create(Window_Selectable.prototype);
  Window_ItemTarget.prototype.constructor = Window_ItemTarget;

  Window_ItemTarget.prototype.initialize = function (rect) {
    Window_Selectable.prototype.initialize.call(this, rect);
    this._item = null;
    this._scene = null;
    this.refresh();
    this.select(0);
    this.hide();
  };

  Window_ItemTarget.prototype.setItem = function (item) {
    if (this._item !== item) {
      this._item = item;
      this.refresh();
    }
  };

  Window_ItemTarget.prototype.maxItems = function () {
    return $gameParty.members().length;
  };

  Window_ItemTarget.prototype.maxCols = function () {
    return Math.min($gameParty.members().length, 3);
  };

  Window_ItemTarget.prototype.itemWidth = function () {
    return Math.floor((this.innerWidth - this.colSpacing()) / this.maxCols());
  };

  Window_ItemTarget.prototype.itemHeight = function () {
    return Math.floor(this.innerHeight / Math.min(2, this.maxItems()));
  };

  Window_ItemTarget.prototype.item = function () {
    return this._item;
  };

  Window_ItemTarget.prototype.isCurrentItemEnabled = function () {
    return this.isItemEnabled(this.index());
  };

  Window_ItemTarget.prototype.isItemEnabled = function (index) {
    if (index >= 0 && index < $gameParty.members().length) {
      const actor = $gameParty.members()[index];
      return this.canUse(actor, this._item);
    }
    return false;
  };

  Window_ItemTarget.prototype.canUse = function (actor, item) {
    if (!actor || !item) return false;
    if (DataManager.isItem(item) && (item.scope === 9 || item.scope === 10)) {
      // A revival item that is also medicine may be prescribed to a living
      // patient: the illness it treats is reason enough to hand it over.
      const sys = window.DiseaseSystem;
      const treats = sys && sys.treatableWith ? sys.treatableWith(actor, item) : [];
      return actor.isDead() || (treats && treats.length > 0);
    }
    // HP/MP recovery items stay usable at full HP/MP: a lot of them (like
    // disease medicine) carry a secondary effect worth taking regardless.
    return actor.canUse(item);
  };

  Window_ItemTarget.prototype.hasItemCategory = function (item, category) {
    if (!item || !item.note) return false;
    const regex = new RegExp(`<category:${category}>`, "i");
    return regex.test(item.note);
  };

  Window_ItemTarget.prototype.drawItem = function (index) {
    const actor = $gameParty.members()[index];
    if (!actor) return;
    const useTranslation = ConfigManager.language === "it";
    const rect = this.itemRect(index);
    const padding = 3;
    this.resetTextColor();
    this.changePaintOpacity(this.isItemEnabled(index));

    const faceWidth = 160;
    const faceHeight = 200;
    const faceX = rect.x + padding;
    const faceY = rect.y + padding;

    try {
      // Get bust image path (checks variables 106-109 based on actor ID, uses SpritesAssociation)
      const bustImagePath = utils.getActorBustImagePath(actor);

      // Load fallback image with error handling
      let fallbackImage = null;
      try {
        fallbackImage = ImageManager.loadBitmap("img/busts/", "7");
      } catch (err) {
        console.error("Failed to load fallback bust image:", err);
      }

      let bustBitmap = null;
      try {
        bustBitmap = ImageManager.loadBitmap("", bustImagePath);
      } catch (err) {
        console.error("Failed to load bust image:", bustImagePath, err);
      }

      if (!bustBitmap || !fallbackImage) {
        console.warn("Cannot display bust: bust or fallback image failed to load");
        return;
      }

      bustBitmap.addLoadListener(() => {
        // Check if the image loaded successfully
        if (bustBitmap.width > 0 && bustBitmap.height > 0) {
          this.contents.blt(bustBitmap, 0, 180, bustBitmap.width, bustBitmap.height - 180, faceX, faceY, faceWidth, faceHeight);
        } else {
          // Use fallback if primary image failed
          this.contents.blt(fallbackImage, 0, 180, fallbackImage.width, fallbackImage.height - 180, faceX, faceY, faceWidth, faceHeight);
        }
      });

      bustBitmap.addErrorListener(() => {
        // Use fallback on error
        this.contents.blt(fallbackImage, 0, 180, fallbackImage.width, fallbackImage.height - 180, faceX, faceY, faceWidth, faceHeight);
      });

      // Try immediate draw if already loaded
      if (bustBitmap.isReady() && bustBitmap.width > 0) {
        this.contents.blt(bustBitmap, 0, 180, bustBitmap.width, bustBitmap.height - 180, faceX, faceY, faceWidth, faceHeight);
      }
    } catch (error) {
      // Fallback on exception
      const fallbackImage = ImageManager.loadBitmap("img/busts/", "7");
      if (fallbackImage.isReady()) {
        this.contents.blt(fallbackImage, 0, 180, fallbackImage.width, fallbackImage.height - 180, faceX, faceY, faceWidth, faceHeight);
      } else {
        fallbackImage.addLoadListener(() => {
          this.contents.blt(fallbackImage, 0, 180, fallbackImage.width, fallbackImage.height - 180, faceX, faceY, faceWidth, faceHeight);
        });
      }
    }

    // Position name and stats below the large sprite instead of to the right
    const nameX = faceX;
    const nameY = faceY + faceHeight + padding;
    const translatedName = window.translateText ? window.translateText(actor.name()) : actor.name();
    this.drawText(translatedName, nameX, nameY, faceWidth, "left");

    const gaugeWidth = faceWidth;
    const gaugeHeight = 16;
    const gaugeX = nameX;
    let gaugeY = nameY + this.lineHeight();

    this.changeTextColor(ColorManager.systemColor());
    this.drawText("HP ", gaugeX, gaugeY, 30);
    this.drawGauge(gaugeX + 35, gaugeY, gaugeWidth - 35, actor.hpRate(), ColorManager.hpGaugeColor1(), ColorManager.hpGaugeColor2());
    this.changeTextColor(ColorManager.hpColor(actor));
    this.drawText(actor.hp + " / " + actor.mhp + "", gaugeX + 35, gaugeY, gaugeWidth - 35, "left");

    if (!hideMpBar()) {
      gaugeY += gaugeHeight + 8;
      this.changeTextColor(ColorManager.systemColor());
      this.drawText("MP ", gaugeX, gaugeY, 30);
      this.drawGauge(gaugeX + 35, gaugeY, gaugeWidth - 35, actor.mpRate(), ColorManager.mpGaugeColor1(), ColorManager.mpGaugeColor2());
      this.changeTextColor(ColorManager.mpColor(actor));
      this.drawText(actor.mp + " / " + actor.mmp + "", gaugeX + 35, gaugeY, gaugeWidth - 35, "left");
    }

    if ($dataSystem.optDisplayTp) {
      gaugeY += gaugeHeight + 8;
      this.changeTextColor(ColorManager.systemColor());
      this.drawText("AP ", gaugeX, gaugeY, 30);
      this.drawGauge(gaugeX + 35, gaugeY, gaugeWidth - 35, actor.tpRate(), ColorManager.tpGaugeColor1(), ColorManager.tpGaugeColor2());
      this.changeTextColor(ColorManager.tpColor(actor));
      this.drawText(actor.tp + " / 100", gaugeX + 35, gaugeY, gaugeWidth - 35, "left");
    }

    gaugeY += gaugeHeight + 16;
    const statX = gaugeX;
    const statWidth = 80;
    const valueWidth = 60;

    this.changePaintOpacity(true);
  };

  Window_ItemTarget.prototype.drawAllPartyOption = function (rect) {
    const padding = 20;
    const nameWidth = 140;
    const useTranslation = ConfigManager.language === "it";
    this.changePaintOpacity(this.isItemEnabled($gameParty.members().length));
    this.changeTextColor(ColorManager.systemColor());
    this.drawText(T('Inventory.allParty'), rect.x + padding, rect.y, nameWidth);
    this.resetTextColor();
    this.drawText(T('Inventory.distributeEffectsAmongMembers'),
      rect.x + padding + nameWidth, rect.y, rect.width - padding - nameWidth
    );
    this.changePaintOpacity(true);
  };

  Window_ItemTarget.prototype.drawActorInfo = function (actor, rect) {
    if (!actor) return;
    const padding = 20;
    const nameWidth = 140;
    const gaugeWidth = 90;
    const valueWidth = 70;
    const spacing = 20;
    this.changePaintOpacity(this.isItemEnabled($gameParty.members().indexOf(actor)));
    this.changeTextColor(ColorManager.systemColor());
    const translatedName = window.translateText ? window.translateText(actor.name()) : actor.name();
    this.drawText(translatedName, rect.x + padding, rect.y, nameWidth);
    let x = rect.x + padding + nameWidth + spacing;
    this.drawActorHp(actor, x, rect.y, gaugeWidth);
    x += gaugeWidth + valueWidth + spacing;
    this.drawActorMp(actor, x, rect.y, gaugeWidth);
    x += gaugeWidth + valueWidth + spacing;
    if ($dataSystem.optDisplayTp) {
      this.drawActorTp(actor, x, rect.y, gaugeWidth);
    }
    this.changePaintOpacity(true);
  };

  Window_ItemTarget.prototype.drawActorHp = function (actor, x, y, width) {
    const color1 = ColorManager.hpGaugeColor1();
    const color2 = ColorManager.hpGaugeColor2();
    this.drawGauge(x, y, width, actor.hpRate(), color1, color2);
    this.changeTextColor(ColorManager.systemColor());
    this.drawText("HP", x, y, 30);
    this.changeTextColor(ColorManager.hpColor(actor));
    this.drawText(actor.hp + " / " + actor.mhp + " HP", x + 35, y, width - 35, "left");
  };

  Window_ItemTarget.prototype.drawActorMp = function (actor, x, y, width) {
    const color1 = ColorManager.mpGaugeColor1();
    const color2 = ColorManager.mpGaugeColor2();
    this.drawGauge(x, y, width, actor.mpRate(), color1, color2);
    this.changeTextColor(ColorManager.systemColor());
    this.drawText("MP", x, y, 30);
    this.changeTextColor(ColorManager.mpColor(actor));
    this.drawText(actor.mp + " / " + actor.mmp + "", x + 35, y, width - 35, "left");
  };

  Window_ItemTarget.prototype.drawActorTp = function (actor, x, y, width) {
    const color1 = ColorManager.tpGaugeColor1();
    const color2 = ColorManager.tpGaugeColor2();
    this.drawGauge(x, y, width, actor.tpRate(), color1, color2);
    this.changeTextColor(ColorManager.systemColor());
    this.drawText("AP", x, y, 30);
    this.changeTextColor(ColorManager.tpColor(actor));
    this.drawText(T('Inventory.apOutOf', { ap: actor.tp }), x + 35, y, width - 35, "left");
  };

  Window_ItemTarget.prototype.refresh = function () {
    this.contents.clear();
    this.drawAllItems();
  };

  Window_ItemTarget.prototype.setHandlers = function (scene) {
    this._scene = scene;
    this.setHandler("ok", this.onTargetOk.bind(this));
    this.setHandler("cancel", this.onTargetCancel.bind(this));
  };

  Window_ItemTarget.prototype.onTargetOk = function () {
    this._scene.onTargetOk();
  };

  Window_ItemTarget.prototype.onTargetCancel = function () {
    this._scene.onTargetCancel();
  };

  //=============================================================================
  // Equipment Selection Window
  //=============================================================================

  function Window_EquipSelection() {
    this.initialize(...arguments);
  }

  Window_EquipSelection.prototype = Object.create(Window_Selectable.prototype);
  Window_EquipSelection.prototype.constructor = Window_EquipSelection;

  Window_EquipSelection.prototype.initialize = function (rect) {
    Window_Selectable.prototype.initialize.call(this, rect);
    this._item = null;
    this._actors = [];
    this._scene = null;
    this.refresh();
    this.hide();
  };

  Window_EquipSelection.prototype.setItem = function (item) {
    if (this._item !== item) {
      this._item = item;
      this.refresh();
    }
  };

  Window_EquipSelection.prototype.setActors = function (actors) {
    this._actors = actors || [];
    this.refresh();
  };

  Window_EquipSelection.prototype.maxItems = function () {
    return this._actors.length;
  };

  Window_EquipSelection.prototype.item = function () {
    return this._item;
  };

  Window_EquipSelection.prototype.selectedActor = function () {
    return this._actors[this.index()];
  };

  Window_EquipSelection.prototype.drawItem = function (index) {
    const rect = this.itemLineRect(index);
    const actor = this._actors[index];
    const useTranslation = ConfigManager.language === "it";
    const padding = 3;

    if (actor) {
      const faceWidth = 64;
      const faceHeight = 64;
      const faceX = rect.x + padding;
      const faceY = rect.y + padding;

      try {
        // Get bust image path (checks variables 106-109 based on actor ID, uses SpritesAssociation)
        const bustImagePath = utils.getActorBustImagePath(actor);

        // Load fallback image with error handling
        let fallbackImage = null;
        try {
          fallbackImage = ImageManager.loadBitmap("img/busts/", "7");
        } catch (err) {
          console.error("Failed to load fallback bust image:", err);
        }

        let bustBitmap = null;
        try {
          bustBitmap = ImageManager.loadBitmap("", bustImagePath);
        } catch (err) {
          console.error("Failed to load bust image:", bustImagePath, err);
        }

        if (!bustBitmap || !fallbackImage) {
          console.warn("Cannot display bust: bust or fallback image failed to load");
          return;
        }

        bustBitmap.addLoadListener(() => {
          // Check if the image loaded successfully
          if (bustBitmap.width > 0 && bustBitmap.height > 0) {
            this.contents.blt(bustBitmap, 0, 180, bustBitmap.width, bustBitmap.height - 180, faceX, faceY, faceWidth, faceHeight);
          } else {
            // Use fallback if primary image failed
            this.contents.blt(fallbackImage, 0, 180, fallbackImage.width, fallbackImage.height - 180, faceX, faceY, faceWidth, faceHeight);
          }
        });

        bustBitmap.addErrorListener(() => {
          // Use fallback on error
          this.contents.blt(fallbackImage, 0, 180, fallbackImage.width, fallbackImage.height - 180, faceX, faceY, faceWidth, faceHeight);
        });

        // Try immediate draw if already loaded
        if (bustBitmap.isReady() && bustBitmap.width > 0) {
          this.contents.blt(bustBitmap, 0, 180, bustBitmap.width, bustBitmap.height - 180, faceX, faceY, faceWidth, faceHeight);
        }
      } catch (error) {
        const fallbackImage = ImageManager.loadBitmap("img/busts/", "7");
        if (fallbackImage.isReady()) {
          this.contents.blt(fallbackImage, 0, 180, fallbackImage.width, fallbackImage.height - 180, faceX, faceY, faceWidth, faceHeight);
        } else {
          fallbackImage.addLoadListener(() => {
            this.contents.blt(fallbackImage, 0, 180, fallbackImage.width, fallbackImage.height - 180, faceX, faceY, faceWidth, faceHeight);
          });
        }
      }

      const translatedName = window.translateText ? window.translateText(actor.name()) : actor.name();
      this.drawText(translatedName, rect.x + padding, rect.y + 210, 160);

      if (this._item) {
        let equipType = "";
        let currentEquip = null;
        if (DataManager.isWeapon(this._item)) {
          equipType =T('Inventory.weapon');
          currentEquip = actor.weapons()[0];
        } else if (DataManager.isArmor(this._item)) {
          switch (this._item.etypeId) {
            case 2: equipType =T('Inventory.shield'); currentEquip = actor.armors().find((a) => a.etypeId === 2); break;
            case 3: equipType =T('Inventory.head'); currentEquip = actor.armors().find((a) => a.etypeId === 3); break;
            case 4: equipType =T('Inventory.body'); currentEquip = actor.armors().find((a) => a.etypeId === 4); break;
            case 5: equipType =T('Inventory.accessory'); currentEquip = actor.armors().find((a) => a.etypeId === 5); break;
            default: equipType =T('Inventory.armor'); break;
          }
        }
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(equipType + ":", rect.x + padding, rect.y + 230, 100);
        this.resetTextColor();
        if (currentEquip) {
          const originalName = currentEquip.name;
          if (window.translateText && typeof window.translateText === "function") {
            currentEquip.name = window.translateText(currentEquip.name);
          }
          this.drawItemName(currentEquip, rect.x + 180, rect.y + 32, 200);
          currentEquip.name = originalName;
        } else {
          this.drawText(T('Inventory.none'), rect.x + 180, rect.y + 32, 200);
        }
      }
    }
  };

  Window_EquipSelection.prototype.drawActorMenuImage = function (actor, x, y) {
    const faceIndex = actor.faceIndex();
    const faceName = actor.faceName();
    const width = ImageManager.faceWidth;
    const height = ImageManager.faceHeight;
    const faceWidth = 160;
    const faceHeight = 200;
    const faceX = x;
    const faceY = y;

    // Get bust image path (checks variables 106-109 based on actor ID, uses SpritesAssociation)
    const bustImagePath = utils.getActorBustImagePath(actor);

    // Load fallback image with error handling
    let fallbackImage = null;
    try {
      fallbackImage = ImageManager.loadBitmap("img/busts/", "7");
    } catch (err) {
      console.error("Failed to load fallback bust image:", err);
    }

    let bustBitmap = null;
    try {
      bustBitmap = ImageManager.loadBitmap("", bustImagePath);
    } catch (err) {
      console.error("Failed to load bust image:", bustImagePath, err);
    }

    if (!bustBitmap || !fallbackImage) {
      console.warn("Cannot display bust: bust or fallback image failed to load");
      return;
    }

    bustBitmap.addLoadListener(() => {
      // Check if the image loaded successfully
      if (bustBitmap.width > 0 && bustBitmap.height > 0) {
        this.contents.blt(bustBitmap, 0, 180, bustBitmap.width, bustBitmap.height - 180, faceX, faceY, faceWidth, faceHeight);
      } else {
        // Use fallback if primary image failed
        this.contents.blt(fallbackImage, 0, 180, fallbackImage.width, fallbackImage.height - 180, faceX, faceY, faceWidth, faceHeight);
      }
    });

    bustBitmap.addErrorListener(() => {
      // Use fallback on error
      this.contents.blt(fallbackImage, 0, 180, fallbackImage.width, fallbackImage.height - 180, faceX, faceY, faceWidth, faceHeight);
    });

    // Try immediate draw if already loaded
    if (bustBitmap.isReady() && bustBitmap.width > 0) {
      this.contents.blt(bustBitmap, 0, 180, bustBitmap.width, bustBitmap.height - 180, faceX, faceY, faceWidth, faceHeight);
    }
  };

  Window_EquipSelection.prototype.refresh = function () {
    this.contents.clear();
    this.drawAllItems();
    const useTranslation = ConfigManager.language === "it";
    this.changeTextColor(ColorManager.systemColor());
    const titleText =T('Inventory.equipToWhichCharacter');
    this.drawText(titleText, 0, 0, this.width - this.padding * 2, "center");
  };

  Window_EquipSelection.prototype.setHandlers = function (scene) {
    this._scene = scene;
    this.setHandler("ok", this.onSelectionOk.bind(this));
    this.setHandler("cancel", this.onSelectionCancel.bind(this));
  };

  Window_EquipSelection.prototype.onSelectionOk = function () {
    this._scene.onEquipSelectionOk();
  };

  Window_EquipSelection.prototype.onSelectionCancel = function () {
    this._scene.onEquipSelectionCancel();
  };

})();
