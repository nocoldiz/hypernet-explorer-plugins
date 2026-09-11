/*:
 * @target MZ
 * @plugindesc v1.0.0 Shop System - Unified item details and shop enhancements with alchemical layouts
 * @author Omni-Lex
 * @help ItemSystemShop.js
 *
 * Unified item detail display showing stats, effects, and compatibility
 * with high-fidelity HTML overlays for merchant transaction tables.
 * Requires ItemSystemUtils.js to be loaded first.
 */

(function () {
  "use strict";

  if (!window.ItemSystemUtils) {
    throw new Error("ItemSystemShop requires ItemSystemUtils.js to be loaded first!");
  }

  const utils = window.ItemSystemUtils;

  let _statsI18n = null;

  const _loadStatsI18n = async () => {
    const lang = ConfigManager.language || 'en';
    const url = `js/i18n/${lang}/stats.json`;
    try {
      const response = await fetch(url);
      _statsI18n = await response.json();
    } catch (e) {
      console.warn('ItemSystemShop: Stats i18n file missing, utilizing localized dictionary fallbacks.');
    }
  };

  const _si18n = (key) => {
    if (_statsI18n && _statsI18n[key]) {
      return _statsI18n[key];
    }
    const fallbacks = {
      'ATT': 'STR', 'DEF': 'CON', 'M.ATT': 'INT', 'M.DEF': 'WIS', 'AGILITY': 'DEX', 'LUCK': 'PSI'
    };
    return fallbacks[key] || key;
  };

  _loadStatsI18n();

  //=============================================================================
  // Safety layer
  //=============================================================================
  // The shop paints itself as a DOM overlay driven from the scene's update
  // loop. One bad item, one missing element or one container left behind by a
  // previous shop used to throw on every frame and take the game down with it,
  // so everything that touches foreign data or the document goes through these.

  const _warnedOnce = new Set();
  const warnOnce = (label, e) => {
    if (_warnedOnce.has(label)) return;
    _warnedOnce.add(label);
    console.error("[ItemSystemShop] " + label, e);
  };

  // Run fn; never let it escape. Returns fallback when it throws.
  const safe = (label, fn, fallback) => {
    try {
      return fn();
    } catch (e) {
      warnOnce(label, e);
      return fallback;
    }
  };

  // Item names, categories and procedural lore all end up inside innerHTML.
  // An unescaped angle bracket does not just look wrong: it can truncate the
  // markup, after which every querySelector below returns null.
  const esc = (text) =>
    String(text === undefined || text === null ? "" : text).replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  const rarityColor = (item) => {
    const tier = safe("getItemRarity", () => utils.getItemRarity(item), null);
    return (tier && tier.colorCode) || "#FFFFFF";
  };

  const categoryOf = (item) =>
    safe("getItemCategoryName", () => utils.getItemCategoryName(item), null) || "";

  const weightOf = (item) => safe("getItemWeight", () => utils.getItemWeight(item), 1);

  // Which button flips between Acquire and Liquidate, named on a chip in front
  // of the tab row: the shoulder buttons when a pad is plugged in, TAB
  // otherwise. The same chip the empathize panel wears, for the same reason:
  // the directions stay inside the open tab, so without it the control is
  // invisible. A pad can be plugged in (or its battery die) while the shop is
  // open, so the chip is kept in step every frame rather than only on a
  // redraw.
  const padPluggedIn = () => {
    const pad = window.AnalogStickInput;
    return !!(pad && typeof pad.hasPad === "function" && pad.hasPad());
  };

  // i18n-ignore-start: physical controller / keyboard button ids
  const tabHintLabel = () => (padPluggedIn() ? "L1 R1" : "TAB");
  // i18n-ignore-end

  const formatWeight = (grams) =>
    safe("formatWeight", () => utils.formatWeight(grams), String(grams));

  const needRestoresOf = (item) =>
    safe("getNeedRestores", () => (utils.getNeedRestores ? utils.getNeedRestores(item) : []), []) || [];

  // What the item takes off an addiction craving, so a buyer can tell a bottle
  // that only feeds a habit from one that feeds a body.
  const addictionReliefOf = (item) =>
    safe("getAddictionRelief", () => (utils.getAddictionRelief ? utils.getAddictionRelief(item) : []), []) || [];

  // Whether the thing works by magic or by ordinary means (<Nature:> in the
  // notebox, written by tools/nature/gen_nature_tags.js). Printed on every
  // item, weapon and armour card, in every world: it is a property of the
  // object, not of the world's magic level, and a player who has been told a
  // severed world sells no charms needs to be able to see which is which.
  // Blank for an untagged entry rather than guessed at.
  const natureLabelOf = (item) => {
    const MN = window.MagicNature;
    if (!MN || !MN.natureOf) return "";
    const nature = MN.natureOf(item);
    if (!nature) return "";
    return nature === "magical" ? T('Shop.natureMagical') : T('Shop.natureMundane');
  };

  const loreOf = (item) =>
    safe("loreFor", () => (utils.loreFor ? utils.loreFor(item) : ""), "") || "";

  // What an item is medicine for. Null for everything that is not: a healing
  // potion restores HP and cures nothing.
  const medicineOf = (item) =>
    safe("getMedicineInfo", () => (utils.getMedicineInfo ? utils.getMedicineInfo(item) : null), null);

  // The illnesses one drug answers, capped so a panacea does not print a
  // hundred and fifty lines into a shop card.
  const medicineLines = (info, limit) => {
    const rows = [];
    if (!info) return rows;
    const cures = info.cures.slice(0, limit);
    if (cures.length) {
      rows.push({
        label: T('Shop.medicineCures'),
        value: cures.map((c) => T('Shop.medicineCureLine', { disease: c.name, days: c.days })).join(", ") +
          (info.cures.length > cures.length
            ? " " + T('Shop.medicineMore', { count: info.cures.length - cures.length }) : ""),
      });
    }
    const treats = info.treats.slice(0, limit);
    if (treats.length) {
      rows.push({
        label: T('Shop.medicineTreats'),
        value: treats.map((t) => t.name).join(", ") +
          (info.treats.length > treats.length
            ? " " + T('Shop.medicineMore', { count: info.treats.length - treats.length }) : ""),
      });
    }
    return rows;
  };

  const translate = (text) =>
    safe("translateText", () => {
      if (text && typeof window.translateText === "function") return window.translateText(text);
      return text;
    }, text);

  // The name an item is shown under. The engine's own windows get their text
  // localized on the way to the bitmap, but this shop paints most of itself as
  // DOM, which that hook never sees, so every name that reaches the overlay --
  // and every name compared for sort order -- goes through here first.
  const itemName = (item) => (item && item.name ? translate(item.name) : "");

  // A data param slot that a malformed or third-party item may simply not have.
  const paramOf = (item, paramId) => {
    const raw = item && Array.isArray(item.params) ? item.params[paramId] : 0;
    return Number.isFinite(raw) ? raw : 0;
  };

  const modifiedParamOf = (item, paramId) => {
    const mods = window.ItemSystemModifiers;
    if (mods && typeof mods.getModifiedParam === "function") {
      const value = safe("getModifiedParam", () => mods.getModifiedParam(item, paramId), null);
      if (Number.isFinite(value)) return value;
    }
    return paramOf(item, paramId);
  };

  const money = (value) => (Number.isFinite(value) ? value / 100 : 0).toFixed(2);

  // The database name of an equip slot, or its number when the slot is one this
  // game's System.json does not declare.
  const equipTypeName = (etypeId) => {
    const names = $dataSystem && $dataSystem.equipTypes;
    const name = names && names[etypeId];
    return name || (T('Shop.equipType') + etypeId);
  };

  const partyMembers = () =>
    safe("partyMembers", () => ($gameParty ? $gameParty.members() : []), []) || [];

  const actorLabel = (actor) =>
    safe("actorName", () => translate(actor.name()), "") || "";

  // The stock/price record of the shop currently open, or null when this shop
  // keeps no record (an event with no id, a shop opened straight from a plugin).
  const currentShopData = (scene) => {
    const s = scene || SceneManager._scene;
    if (!(s instanceof Scene_Shop)) return null;
    if (!s._shopMapId || !s._shopEventId) return null;
    const stocks = $gameSystem && $gameSystem._shopStocks;
    if (!stocks) return null;
    const forMap = stocks[s._shopMapId];
    return (forMap && forMap[s._shopEventId]) || null;
  };

  // Which index a thing is quoted against is what the thing IS, not what shelf
  // it sits on: anything carrying `<Nature: Magical>` is priced off the SOUL
  // index and anything `<Nature: Mundane>` off the price of oil, because in
  // this world the ordinary economy genuinely runs on crude. Every real entry
  // of Items, Weapons and Armors carries the tag (tools/nature/gen_nature_tags.js)
  // and window.MagicNature is the one reader of it.
  //
  // The category list survives only as the fallback for an entry with no tag
  // (a plugin-made item, a third-party database), so nothing is left unpriced.
  const SOUL_CATEGORIES = ["jungle", "magic", "plants", "monsters",
                           "bodypart", "collectibles", "alchemistry",
                           "homeopathy", "books"];  // i18n-ignore  <category:> tag values

  // How far the two indices are allowed to move a price: half off at worst,
  // three times at best.
  const MARKET_FLOOR = 0.5;
  const MARKET_CEIL = 3.0;

  // True when the item is quoted against souls, false when against oil.
  const isSoulPriced = (item) => {
    const MN = window.MagicNature;
    const nature = MN && typeof MN.natureOf === "function"
      ? safe("natureOf", () => MN.natureOf(item), null)
      : null;
    if (nature) return nature === "magical";
    return SOUL_CATEGORIES.includes(categoryOf(item).toLowerCase());
  };

  // The fixed price of a collectible, or null for everything the indices are
  // allowed to move. window.ItemCollectibles is the only place that boundary
  // is drawn.
  // The year written on a keepsake, ready to print. Empty for anything the
  // catalogue does not date.
  const collectibleYear = (item) => safe("collectibleYear", () => {
    const C = window.ItemCollectibles;
    return C ? C.yearText(item) : "";
  }, "") || "";

  // What a book teaches, ready to print. Empty for anything that is not a
  // book (window.BookLearning owns the <Teaches:> tag).
  const teachesLabel = (item) => safe("teachesLabel", () => {
    const B = window.BookLearning;
    return B ? B.label(item) : "";
  }, "") || "";

  // What a sitting with a pastime is worth, for the row under the counter's
  // type line. window.ItemLeisure owns the <Leisure:> tag everywhere.
  const leisureGain = (item) => safe("leisureGain", () => {
    const L = window.ItemLeisure;
    return L && L.isLeisure(item) ? L.gainText(item) : "";
  }, "") || "";

  const fixedPrice = (item) => safe("fixedPrice", () => {
    const C = window.ItemCollectibles;
    return C ? C.fixed(item) : null;
  }, null);

  const marketFactor = (shopData, item) => {
    if (!shopData) return 1.0;
    const raw = isSoulPriced(item) ? shopData.soulFactor : shopData.oilFactor;
    const factor = Number(raw);
    return Number.isFinite(factor) && factor > 0 ? factor : 1.0;
  };

  // The one place a buy price is worked out: the sticker moved by today's
  // index and then by the party's Haggling. Window_ShopBuy#price is the only
  // caller and the native buyingPrice() reads that, so the card, the quantity
  // modal and the till are the same number by construction. Applying either
  // factor anywhere else charges it twice.
  const buyUnitPrice = (item, listed, shopData) => {
    // A collectible is never moved by an index, by Haggling, by standing or by
    // a record: it costs what it is worth, here and everywhere else.
    const flat = fixedPrice(item);
    if (flat !== null) return flat;
    const base = Number.isFinite(listed)
      ? listed
      : (item && Number.isFinite(item.price) ? item.price : 0);
    if (!(base > 0)) return 0;
    return Math.max(1, Math.floor(base * marketFactor(shopData, item) * haggleFactor()
      * standingFactor() * notorietyFactor()));
  };

  // What the counter thinks of the party, as two more multipliers on the same
  // sticker. Both are read through the plugin that owns them so the rule lives
  // in one place and a missing plugin is simply a factor of 1.
  //
  // Standing is the local faction's opinion, and it is the promise
  // getReputationPerks has always printed (10/25/40 per cent off at 40/60/80)
  // finally charged at the till. Notoriety is the party's criminal record: a
  // face that is trouble to be seen serving costs more to serve.
  const standingFactor = () =>
    sanePositive(safe("standingFactor", () => {
      const f = window.$gameFactions;
      return (f && typeof f.standingPriceMultiplier === "function")
        ? f.standingPriceMultiplier() : 1;
    }, 1), 1);

  const notorietyFactor = () =>
    sanePositive(safe("notorietyFactor", () => {
      const c = window.CrimeSystem;
      return (c && typeof c.priceMultiplier === "function") ? c.priceMultiplier() : 1;
    }, 1), 1);

  // Whether this counter will serve the party at all, and why not. Null when it
  // will. The record is asked first: being hunted closes a door that being
  // merely disliked does not.
  const serviceRefusal = () => safe("serviceRefusal", () => {
    const c = window.CrimeSystem;
    if (c && typeof c.refusesService === "function" && c.refusesService()) return "notorious";
    const f = window.$gameFactions;
    if (f && typeof f.standingRefusesService === "function" && f.standingRefusesService()) return "standing";
    return null;
  }, null);

  // Who the item suits: any class can equip any weapon now, so a member with no
  // proficiency in it does not count as compatible (see WeaponProficiency).
  const isProficientWith = (actor, item) =>
    safe("isProficientWith", () => {
      if (!actor || !item || typeof actor.canEquip !== "function") return false;
      if (!actor.canEquip(item)) return false;
      const prof = window.WeaponProficiency;
      if (prof && typeof prof.isUntrained === "function" && prof.isUntrained(actor, item)) return false;
      return true;
    }, false);

  //=============================================================================
  // MASTER Item Detail Window - SHARED by both Shop and Inventory
  //=============================================================================

  function Window_ItemDetail() {
    this.initialize(...arguments);
  }

  Window_ItemDetail.prototype = Object.create(Window_Base.prototype);
  Window_ItemDetail.prototype.constructor = Window_ItemDetail;

  Window_ItemDetail.prototype.initialize = function (rect) {
    Window_Base.prototype.initialize.call(this, rect);
    this._item = null;
    this.refresh();
  };

  Window_ItemDetail.prototype.setItem = function (item) {
    if (this._item !== item) {
      this._item = item;
      this.refresh();
    }
  };

  Window_ItemDetail.prototype.refresh = function () {
    if (!this.contents) return;
    this.contents.clear();
    if (this._item) {
      safe("drawItemDetails", () => this.drawItemDetails(), null);
    }
  };

  Window_ItemDetail.prototype.getWeaponScalingType = function (weapon) {
    if (!weapon || !DataManager.isWeapon(weapon)) {
      return null;
    }
    const note = (weapon.note || '');
    const scales = [];
    const regex = /<Scale:\s*([^>]+)>/gi;
    let match;
    while ((match = regex.exec(note)) !== null) {
      const parts = match[1].split(',').map(s => s.trim().toUpperCase());
      scales.push(...parts);
    }
    if (scales.length === 0 && weapon.meta && weapon.meta.Scale) {
      scales.push(...String(weapon.meta.Scale).split(',').map(s => s.trim().toUpperCase()));
    }
    if (scales.includes('STR') && scales.includes('DEX')) return 'MIX';
    if (scales.includes('STR') && scales.includes('INT')) return 'ARC';
    if (scales.includes('MIX')) return 'MIX';
    if (scales.includes('ARC')) return 'ARC';
    if (scales.includes('DEX')) return 'DEX';
    if (scales.includes('INT')) return 'INT';
    if (scales.includes('WIS')) return 'WIS';
    if (scales.includes('CON')) return 'CON';
    if (scales.includes('PSI')) return 'PSI';
    if (scales.includes('STR')) return 'STR';
    return 'STR';
  };

  Window_ItemDetail.prototype.drawItemDetails = function () {
    const item = this._item;
    if (!item) return;
    const lineHeight = this.lineHeight();
    const contentWidth = this.width - this.padding * 2;
    let y = 0;

    const isInShop = SceneManager._scene instanceof Scene_Shop;
    if (!isInShop && item.description) {
      const translatedDescription = translate(item.description);
      const descLines = this.wrapText(translatedDescription, contentWidth - 4);
      for (const line of descLines) {
        this.drawTextEx("\\c[6]" + line, 0, y, contentWidth);
        y += lineHeight;
      }
      y += 16;
    }

    // Procedural lore (resolves {nation}/{leader}/... tokens) in grey flavor.
    if (!isInShop) {
      const loreText = loreOf(item);
      if (loreText) {
        for (const line of this.wrapText(loreText, contentWidth - 4)) {
          this.drawTextEx("\\c[8]" + line, 0, y, contentWidth);
          y += lineHeight;
        }
        y += 16;
      }
    }

    if (DataManager.isItem(item)) {
      this.drawItemStats(item, y);
    } else if (DataManager.isWeapon(item)) {
      this.drawWeaponStats(item, y);
    } else if (DataManager.isArmor(item)) {
      this.drawArmorStats(item, y);
    }
  };

  Window_ItemDetail.prototype.drawItemName = function (item, x, y, width) {
    if (item) {
      const iconY = y + (this.lineHeight() - ImageManager.iconHeight) / 2;
      const textMargin = ImageManager.iconWidth + 4;
      const itemWidth = width || this.innerWidth - textMargin;
      this.resetTextColor();
      this.drawIcon(item.iconIndex || 0, x, iconY);
      this.changeTextColor(rarityColor(item));
      this.drawText(item.name || "", x + textMargin, y, itemWidth);
      this.resetTextColor();
    }
  };

  Window_ItemDetail.prototype.drawItemStats = function (item, y) {
    const lineHeight = this.lineHeight();
    let currentY = y;
    const categoryName = categoryOf(item);
    if (categoryName) {
      this.drawKeyValue(T('Shop.type'), categoryName, 0, currentY);
      currentY += lineHeight;
    }
    currentY = this.drawMarketPriceInfo(item, currentY);
    const weight = weightOf(item);
    this.drawKeyValue(T('Shop.weight'), formatWeight(weight), 0, currentY);
    currentY += lineHeight;
    // A keepsake is dated, the way a book is: what it is worth is mostly when
    // it is from.
    const yearText = collectibleYear(item);
    if (yearText) {
      this.drawKeyValue(T('Shop.year'), yearText, 0, currentY);
      currentY += lineHeight;
    }
    // And a book is sold on its subject as much as on its age.
    const teaches = teachesLabel(item);
    if (teaches) {
      this.drawKeyValue(T('Shop.teaches'), teaches, 0, currentY);
      currentY += lineHeight;
    }
    // A pastime is sold on what it does for the party's mood.
    const leisure = leisureGain(item);
    if (leisure) {
      this.drawKeyValue(window.ItemLeisure.label(), leisure, 0, currentY);
      currentY += lineHeight;
    }
    const nature = natureLabelOf(item);
    if (nature) {
      this.drawKeyValue(T('Shop.nature'), nature, 0, currentY);
      currentY += lineHeight;
    }

    const isFood = safe("isFoodItem", () => utils.isFoodItem(item), false);
    if (isFood) {
      const calories = safe("nutrition", () => utils.getNutritionValue(item, "calories"), 0);
      const protein = safe("nutrition", () => utils.getNutritionValue(item, "protein"), 0);
      const fat = safe("nutrition", () => utils.getNutritionValue(item, "fat"), 0);

      if (calories > 0) {
        this.drawKeyValue(T('Shop.calories'), calories.toString(), 0, currentY);
        currentY += lineHeight;
      }
      if (protein > 0) {
        this.drawKeyValue(T('Shop.protein'), protein + "g", 0, currentY);
        currentY += lineHeight;
      }
      if (fat > 0) {
        this.drawKeyValue(T('Shop.fat'), fat + "g", 0, currentY);
        currentY += lineHeight;
      }
    } else {
      if (item.consumable !== undefined && item.occasion !== 3) {
        this.drawKeyValue(T('Shop.use'),
          item.consumable ? (T('Shop.single')) : (T('Shop.unlimited')),
          0, currentY
        );
        currentY += lineHeight;
      }
      if (item.scope > 0) {
        this.drawKeyValue(T('Shop.target'), this.getScopeName(item.scope), 0, currentY);
        currentY += lineHeight;
      }

      const hasCombatStats =
        (item.speed !== undefined && item.speed !== 0) ||
        (item.successRate !== undefined && item.successRate < 100) ||
        (item.repeats && item.repeats > 1) ||
        (item.tpGain !== undefined && item.tpGain !== 0) ||
        (item.damage && item.damage.type > 0);

      if (hasCombatStats) {
        if (item.repeats && item.repeats > 1) {
          this.drawKeyValue(T('Shop.hits'), item.repeats + (T('Shop.times')), 0, currentY);
          currentY += lineHeight;
        }
        if (item.tpGain !== undefined && item.tpGain !== 0) {
          this.drawKeyValue(T('Shop.ap'), item.tpGain.toString(), 0, currentY);
          currentY += lineHeight;
        }
        if (item.damage && item.damage.type > 0) {
          if (item.damage.elementId > 1) {
            const elementName = this.getElementName(item.damage.elementId);
            if (elementName) {
              this.drawKeyValue(T('Shop.element'), elementName, 0, currentY);
              currentY += lineHeight;
            }
          }
          if (item.damage.critical !== undefined) {
            this.drawKeyValue(T('Shop.crit'), item.damage.critical ? (T('Shop.yes')) : "No", 0, currentY);
            currentY += lineHeight;
          }
        }
      }

      if (Array.isArray(item.effects) && item.effects.length > 0) {
        for (const effect of item.effects) {
          const effectText = safe("getEffectDescription", () => this.getEffectDescription(effect), null);
          if (effectText) {
            const parts = effectText.split(": ");
            if (parts.length > 1) {
              this.drawKeyValue(parts[0], parts[1], 0, currentY);
            } else {
              this.drawTextEx("\\c[6]" + effectText, 0, currentY, this.width - this.padding * 2);
            }
            currentY += lineHeight;
          }
        }
      }
    }

    const needRestores = needRestoresOf(item);
    for (const r of needRestores) {
      this.drawKeyValue(r.label, "+" + r.amount + "%", 0, currentY);
      currentY += lineHeight;
    }

    // Cravings read the other way round: this is what comes OFF the meter.
    for (const r of addictionReliefOf(item)) {
      this.drawKeyValue(r.label, "-" + r.amount + "%", 0, currentY);
      currentY += lineHeight;
    }

    const medicine = medicineOf(item);
    if (medicine) {
      this.drawKeyValue(T('Shop.medicineClass'), medicine.label, 0, currentY);
      currentY += lineHeight;
      for (const row of medicineLines(medicine, 4)) {
        this.drawKeyValue(row.label, row.value, 0, currentY);
        currentY += lineHeight;
      }
    }
  };

  Window_ItemDetail.prototype.drawWeaponStats = function (item, y) {
    const lineHeight = this.lineHeight();
    let currentY = y;

    const mods = window.ItemSystemModifiers;
    const modifier = mods && typeof mods.getModifier === "function"
      ? safe("getModifier", () => mods.getModifier(item), null) : null;
    if (modifier && modifier.name) {
      this.drawKeyValue(T('Shop.modifier'), modifier.name, 0, currentY);
      currentY += lineHeight;
    }

    const categoryName = categoryOf(item);
    if (categoryName) {
      this.drawKeyValue(T('Shop.type'), categoryName, 0, currentY);
      currentY += lineHeight;
    }

    const scalingType = this.getWeaponScalingType(item);
    if (scalingType) {
      this.drawKeyValue(T('Shop.scale'), scalingType, 0, currentY);
      currentY += lineHeight;
    }

    const weight = weightOf(item);
    this.drawKeyValue(T('Shop.weight'), formatWeight(weight), 0, currentY);
    currentY += lineHeight;
    // A keepsake is dated, the way a book is: what it is worth is mostly when
    // it is from.
    const yearText = collectibleYear(item);
    if (yearText) {
      this.drawKeyValue(T('Shop.year'), yearText, 0, currentY);
      currentY += lineHeight;
    }
    const nature = natureLabelOf(item);
    if (nature) {
      this.drawKeyValue(T('Shop.nature'), nature, 0, currentY);
      currentY += lineHeight;
    }

    currentY = this.drawMarketPriceInfo(item, currentY);
    currentY = this.drawEquipCompatibility(item, currentY);

    // In a shop the price that counts is the one drawMarketPriceInfo has
    // already printed - what this counter charges today. The database sticker
    // is only worth a line where there is no counter to quote against.
    const price = mods && typeof mods.getModifiedPrice === "function"
      ? safe("getModifiedPrice", () => mods.getModifiedPrice(item), item.price) : item.price;
    if (price > 0 && !(SceneManager._scene instanceof Scene_Shop)) {
      this.drawKeyValue(T('Shop.price'), money(price) + " €", 0, currentY);
      currentY += lineHeight;
    }

    const params = [
      [_si18n("ATT"), modifiedParamOf(item, 2)],
      [_si18n("DEF"), modifiedParamOf(item, 3)],
      [_si18n("M.ATT"), modifiedParamOf(item, 4)],
      [_si18n("M.DEF"), modifiedParamOf(item, 5)],
      [_si18n("AGILITY"), modifiedParamOf(item, 6)],
      [_si18n("LUCK"), modifiedParamOf(item, 7)]
    ];
    for (const param of params) {
      if (param[1] !== 0) {
        const sign = param[1] > 0 ? "+" : "";
        this.drawKeyValue(param[0], sign + param[1], 0, currentY);
        currentY += lineHeight;
      }
    }

    if (Array.isArray(item.traits) && item.traits.length > 0) {
      for (const trait of item.traits) {
        const traitText = safe("getTraitDescription", () => this.getTraitDescription(trait), null);
        if (traitText) {
          const parts = traitText.split(": ");
          if (parts.length > 1) {
            this.drawKeyValue(parts[0], parts[1], 0, currentY);
          } else {
            this.drawTextEx("\\c[6]" + traitText, 0, currentY, this.width - this.padding * 2);
          }
          currentY += lineHeight;
        }
      }
    }
  };

  Window_ItemDetail.prototype.drawArmorStats = function (item, y) {
    const lineHeight = this.lineHeight();
    let currentY = y;

    const categoryName = categoryOf(item);
    if (categoryName) {
      this.drawKeyValue(T('Shop.type'), categoryName, 0, currentY);
      currentY += lineHeight;
    }

    this.drawKeyValue(T('Shop.slot'), translate(equipTypeName(item.etypeId)), 0, currentY);
    currentY += lineHeight;

    const weight = weightOf(item);
    this.drawKeyValue(T('Shop.weight'), formatWeight(weight), 0, currentY);
    currentY += lineHeight;
    // A keepsake is dated, the way a book is: what it is worth is mostly when
    // it is from.
    const yearText = collectibleYear(item);
    if (yearText) {
      this.drawKeyValue(T('Shop.year'), yearText, 0, currentY);
      currentY += lineHeight;
    }
    const nature = natureLabelOf(item);
    if (nature) {
      this.drawKeyValue(T('Shop.nature'), nature, 0, currentY);
      currentY += lineHeight;
    }

    currentY = this.drawMarketPriceInfo(item, currentY);
    currentY = this.drawEquipCompatibility(item, currentY);

    if (item.price > 0 && !(SceneManager._scene instanceof Scene_Shop)) {
      this.drawKeyValue(T('Shop.price'), money(item.price) + " €", 0, currentY);
      currentY += lineHeight;
    }

    const params = [
      [_si18n("ATT"), paramOf(item, 2)],
      [_si18n("DEF"), paramOf(item, 3)],
      [_si18n("M.ATT"), paramOf(item, 4)],
      [_si18n("M.DEF"), paramOf(item, 5)],
      [_si18n("AGILITY"), paramOf(item, 6)],
      [_si18n("LUCK"), paramOf(item, 7)]
    ];
    for (const param of params) {
      if (param[1] !== 0) {
        const sign = param[1] > 0 ? "+" : "";
        this.drawKeyValue(param[0], sign + param[1], 0, currentY);
        currentY += lineHeight;
      }
    }

    if (Array.isArray(item.traits) && item.traits.length > 0) {
      for (const trait of item.traits) {
        const traitText = safe("getTraitDescription", () => this.getTraitDescription(trait), null);
        if (traitText) {
          const parts = traitText.split(": ");
          if (parts.length > 1) {
            this.drawKeyValue(parts[0], parts[1], 0, currentY);
          } else {
            this.drawTextEx("\\c[6]" + traitText, 0, currentY, this.width - this.padding * 2);
          }
          currentY += lineHeight;
        }
      }
    }
  };

  Window_ItemDetail.prototype.drawEquipCompatibility = function (item, y) {
    const lineHeight = this.lineHeight();
    let currentY = y;

    this.changeTextColor(ColorManager.systemColor());
    this.drawText(T('Shop.equipBy'), 0, currentY, this.width - this.padding * 2);
    currentY += lineHeight;

    const party = partyMembers();
    let equipInfoShown = false;

    for (let i = 0; i < party.length; i++) {
      const actor = party[i];
      const canEquip = isProficientWith(actor, item);
      this.resetTextColor();
      const translatedName = actorLabel(actor);

      if (canEquip) {
        this.drawText(translatedName, 20, currentY, this.width - this.padding * 2 - 20);
        currentY += lineHeight;
        equipInfoShown = true;
      }
    }

    if (!equipInfoShown) {
      this.resetTextColor();
      this.drawText(T('Shop.noOneInParty'), 20, currentY, this.width - this.padding * 2 - 20);
      currentY += lineHeight;
    }

    return currentY;
  };

  // The same quote the HTML panel prints, for the canvas window behind it: how
  // far today's index has moved this line, and the price it lands on. A bare
  // "112%" said nothing about what was being paid, so the figure that matters
  // is printed next to it.
  Window_ItemDetail.prototype.drawMarketPriceInfo = function (item, y) {
    const scene = SceneManager._scene;
    if (!(scene instanceof Scene_Shop) || typeof scene.priceQuote !== "function") return y;
    const quote = safe("priceQuote", () => scene.priceQuote(item), null);
    if (!quote) return y;

    const lineHeight = this.lineHeight();
    let currentY = y;

    if (quote.percent !== 0) {
      const label = quote.soul ? T('Shop.soulIndex') : T('Shop.oilIndex');
      const value = quote.percent < 0
        ? T('Shop.marketOff', { percent: -quote.percent })
        : T('Shop.marketUp', { percent: quote.percent });
      const favourable = quote.buying ? quote.percent < 0 : quote.percent > 0;
      this.changeTextColor(ColorManager.textColor(favourable ? 3 : 18));
      this.drawKeyValue(label, value, 0, currentY);
      this.resetTextColor();
      currentY += lineHeight;
    }

    this.drawKeyValue(
      quote.buying ? T('Shop.unitPrice') : T('Shop.unitSellValue'),
      money(quote.price) + " €", 0, currentY);
    return currentY + lineHeight;
  };

  Window_ItemDetail.prototype.drawKeyValue = function (key, value, x, y) {
    const width = this.width - this.padding * 2;
    const isInShop = SceneManager._scene instanceof Scene_Shop;
    const keyWidth = isInShop ? Math.floor(width / 2.5) : Math.floor(width / 3);

    this.changeTextColor(ColorManager.systemColor());
    this.drawText(key, x, y, keyWidth);
    this.resetTextColor();
    this.drawText(value, x + keyWidth, y, width - keyWidth, "left");
  };

  Window_ItemDetail.prototype.drawHorzLine = function (y) {
    const lineY = y + this.lineHeight() / 2 - 1;
    const width = this.width - this.padding * 2;
    this.contents.fillRect(0, lineY, width, 2, ColorManager.systemColor());
  };

  Window_ItemDetail.prototype.wrapText = function (text, maxWidth) {
    if (!text) return [];
    const result = [];
    const words = text.split(" ");
    let currentLine = "";

    for (const word of words) {
      const testLine = currentLine ? currentLine + " " + word : word;
      const testWidth = this.textSizeEx(testLine).width;
      if (testWidth > maxWidth && currentLine) {
        result.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      result.push(currentLine);
    }

    const finalResult = [];
    for (const line of result) {
      const subLines = line.split("\n");
      for (const subLine of subLines) {
        finalResult.push(subLine);
      }
    }
    return finalResult;
  };

  Window_ItemDetail.prototype.getItemTypeName = function (item) {
    if (DataManager.isItem(item)) {
      return item.itypeId === 1 ? (T('Shop.regularItem')) : (T('Shop.keyItem'));
    } else if (DataManager.isWeapon(item)) {
      return T('Shop.weapon');
    } else if (DataManager.isArmor(item)) {
      return T('Shop.armor');
    }
    return T('Shop.unknown');
  };

  // The engine's scope number is the id; only the label is translated, so a
  // scope this game never uses falls through to the unknown label.
  Window_ItemDetail.prototype.getScopeName = function (scope) {
    const key = 'Shop.scope.' + String(scope);
    return T.has(key) ? T(key) : T('Shop.scope.unknown');
  };

  Window_ItemDetail.prototype.getOccasionName = function (occasion) {
    const key = 'Shop.occasion.' + String(occasion);
    return T.has(key) ? T(key) : T('Shop.occasion.unknown');
  };

  Window_ItemDetail.prototype.getDamageTypeName = function (type) {
    const key = 'Shop.damageType.' + String(type);
    return T.has(key) ? T(key) : T('Shop.damageType.none');
  };

  Window_ItemDetail.prototype.getElementName = function (elementId) {
    if (!elementId || elementId <= 1) return null;
    if ($dataSystem && $dataSystem.elements && $dataSystem.elements[elementId]) {
      let elementName = $dataSystem.elements[elementId];
      if (window.translateText && typeof window.translateText === "function") {
        elementName = window.translateText(elementName);
      }
      return elementName;
    }
    return T('Shop.elementN', { id: elementId });
  };

  Window_ItemDetail.prototype.getFormulaPreview = function (formula) {
    if (!formula) return "?";
    let display = formula;
    display = display.replace(/a\.atk/g, _si18n("ATT"))
      .replace(/b\.def/g, _si18n("DEF"))
      .replace(/a\.mat/g, _si18n("M.ATT"))
      .replace(/b\.mdf/g, _si18n("M.DEF"))
      .replace(/a\.agi/g, _si18n("AGILITY"))
      .replace(/b\.luk/g, _si18n("LUCK"));
    return display;
  };

  Window_ItemDetail.prototype.getEffectDescription = function (effect) {
    if (!effect) return null;

    switch (effect.code) {
      case Game_Action.EFFECT_RECOVER_HP:
        const hpPercent = effect.value1 * 100;
        const hpFlat = effect.value2;
        if (hpPercent === 0 && hpFlat === 0) return null;
        if (hpPercent === 0) return (T('Shop.hp')) + hpFlat;
        if (hpFlat === 0) return (T('Shop.hp')) + hpPercent + "%";
        const hpSign = hpFlat > 0 ? "+ " : "";
        return (T('Shop.hp')) + hpPercent + "% " + hpSign + hpFlat;
      case Game_Action.EFFECT_RECOVER_MP:
        const mpPercent = effect.value1 * 100;
        const mpFlat = effect.value2;
        if (mpPercent === 0 && mpFlat === 0) return null;
        if (mpPercent === 0) return (T('Shop.mp')) + mpFlat;
        if (mpFlat === 0) return (T('Shop.mp')) + mpPercent + "%";
        const mpSign = mpFlat > 0 ? "+ " : "";
        return (T('Shop.mp')) + mpPercent + "% " + mpSign + mpFlat;
      case Game_Action.EFFECT_GAIN_TP:
        if (effect.value1 === 0) return null;
        return (T('Shop.ap2')) + effect.value1;
      case Game_Action.EFFECT_ADD_STATE:
        if (effect.value1 === 0) return null;
        return ((T('Shop.status')) + this.getStateName(effect.dataId));
      case Game_Action.EFFECT_REMOVE_STATE:
        if (effect.value1 === 0) return null;
        return ((T('Shop.cura')) + this.getStateName(effect.dataId));
      case Game_Action.EFFECT_ADD_BUFF:
        if (effect.value1 === 0) return null;
        return (((T('Shop.buff')) + this.getParameterName(effect.dataId) + " (" + effect.value1 + (T('Shop.turns'))));
      case Game_Action.EFFECT_ADD_DEBUFF:
        if (effect.value1 === 0) return null;
        return (((T('Shop.debuff')) + this.getParameterName(effect.dataId) + " (" + effect.value1 + (T('Shop.turns'))));
      case Game_Action.EFFECT_REMOVE_BUFF:
        return ((T('Shop.buff2')) + this.getParameterName(effect.dataId));
      case Game_Action.EFFECT_REMOVE_DEBUFF:
        return ((T('Shop.debuff2')) + this.getParameterName(effect.dataId));
      case Game_Action.EFFECT_SPECIAL:
        return T('Shop.special');
      case Game_Action.EFFECT_GROW:
        if (effect.value1 === 0) return null;
        return (((T('Shop.grow')) + this.getParameterName(effect.dataId) + " +" + effect.value1));
      case Game_Action.EFFECT_LEARN_SKILL:
        return ((T('Shop.learn')) + this.getSkillName(effect.dataId));
      case Game_Action.EFFECT_COMMON_EVENT:
        return T('Shop.event');
      default:
        return null;
    }
  };

  Window_ItemDetail.prototype.getTraitDescription = function (trait) {
    if (!trait) return null;

    const code = trait.code;
    const dataId = trait.dataId;
    const value = trait.value;

    switch (code) {
      case Game_BattlerBase.TRAIT_ELEMENT_RATE: {
        if (value === 1) return null;
        // Element 0 (none) and 1 (the physical placeholder) have no name to
        // print; without this the chip reads "Elem: null".
        const rateElement = this.getElementName(dataId);
        if (!rateElement) return null;
        return (T('Shop.elem')) + rateElement + " x" + Math.floor(value * 100) + "%";
      }
      case Game_BattlerBase.TRAIT_DEBUFF_RATE:
        if (value === 1) return null;
        // Shop.debuff is the "+Debuff: " that pairs with "+Buff: " on an effect chip; a
        // trait RATE reads plainly, like the elem and state rates around it.
        return (T('Shop.debuffRate')) + this.getParameterName(dataId) + " x" + Math.floor(value * 100) + "%";
      case Game_BattlerBase.TRAIT_STATE_RATE:
        if (value === 1) return null;
        return (T('Shop.state')) + this.getStateName(dataId) + " x" + Math.floor(value * 100) + "%";
      case Game_BattlerBase.TRAIT_STATE_RESIST:
        return (T('Shop.resist')) + this.getStateName(dataId);
      case Game_BattlerBase.TRAIT_PARAM:
        if (value === 1) return null;
        return (T('Shop.stat')) + this.getParameterName(dataId) + " x" + Math.floor(value * 100) + "%";
      case Game_BattlerBase.TRAIT_XPARAM:
        if (value === 0) return null;
        return (T('Shop.skill')) + this.getXParameterName(dataId) + " +" + Math.floor(value * 100) + "%";
      case Game_BattlerBase.TRAIT_SPARAM:
        if (value === 0 || value === 1) return null;
        return (T('Shop.skill')) + this.getSParameterName(dataId) + " x" + Math.floor(value * 100) + "%";
      case Game_BattlerBase.TRAIT_ATTACK_ELEMENT: {
        const attackElement = this.getElementName(dataId);
        if (!attackElement) return null;
        return (T('Shop.element2')) + attackElement;
      }
      case Game_BattlerBase.TRAIT_ATTACK_STATE:
        if (value === 0) return null;
        return (T('Shop.state')) + this.getStateName(dataId) + " " + Math.floor(value * 100) + "%";
      case Game_BattlerBase.TRAIT_ATTACK_SPEED:
        if (value === 0) return null;
        return (T('Shop.speed')) + value;
      case Game_BattlerBase.TRAIT_ATTACK_TIMES:
        if (value === 0) return null;
        return (T('Shop.times2')) + value;
      case Game_BattlerBase.TRAIT_STYPE_ADD:
        return (T('Shop.type2')) + this.getSkillTypeName(dataId);
      case Game_BattlerBase.TRAIT_STYPE_SEAL:
        return (T('Shop.seal')) + this.getSkillTypeName(dataId);
      case Game_BattlerBase.TRAIT_SKILL_ADD:
        return (T('Shop.skill')) + this.getSkillName(dataId);
      case Game_BattlerBase.TRAIT_SKILL_SEAL:
        return (T('Shop.seal')) + this.getSkillName(dataId);
      case Game_BattlerBase.TRAIT_EQUIP_WTYPE:
        return (T('Shop.equip')) + this.getWeaponTypeName(dataId);
      case Game_BattlerBase.TRAIT_EQUIP_ATYPE:
        return (T('Shop.equip')) + this.getArmorTypeName(dataId);
      case Game_BattlerBase.TRAIT_EQUIP_LOCK:
        return (T('Shop.lock')) + this.getEquipTypeName(dataId);
      case Game_BattlerBase.TRAIT_EQUIP_SEAL:
        return (T('Shop.seal')) + this.getEquipTypeName(dataId);
      case Game_BattlerBase.TRAIT_SLOT_TYPE:
        return dataId === 1 ? T('Shop.dualWielding') : null;
      case Game_BattlerBase.TRAIT_ACTION_PLUS:
        if (value === 0) return null;
        return (T('Shop.extra')) + Math.floor(value * 100) + "%";
      case Game_BattlerBase.TRAIT_SPECIAL_FLAG:
        return (T('Shop.special2')) + this.getSpecialFlagName(dataId);
      default:
        return null;
    }
  };

  Window_ItemDetail.prototype.getStateName = function (stateId) {
    return $dataStates[stateId] ? $dataStates[stateId].name : T('Shop.stateN', { id: stateId });
  };
  Window_ItemDetail.prototype.getParameterName = function (paramId) {
    return TextManager.param(paramId) || T('Shop.paramN', { id: paramId });
  };
  Window_ItemDetail.prototype.getXParameterName = function (xparamId) {
    const names = T.list('Shop.xparams');
    return names[xparamId] || T('Shop.xparamN', { id: xparamId });
  };
  Window_ItemDetail.prototype.getSParameterName = function (sparamId) {
    const names = T.list('Shop.sparams');
    return names[sparamId] || T('Shop.sparamN', { id: sparamId });
  };
  Window_ItemDetail.prototype.getSpecialFlagName = function (flagId) {
    const names = T.list('Shop.specialFlags');
    return names[flagId] || T('Shop.specialFlagN', { id: flagId });
  };
  Window_ItemDetail.prototype.getSkillTypeName = function (stypeId) {
    return $dataSystem.skillTypes[stypeId] || T('Shop.skillTypeN', { id: stypeId });
  };
  Window_ItemDetail.prototype.getSkillName = function (skillId) {
    return $dataSkills[skillId] ? $dataSkills[skillId].name : T('Shop.skillN', { id: skillId });
  };
  Window_ItemDetail.prototype.getWeaponTypeName = function (wtypeId) {
    if (!$dataSystem || !$dataSystem.weaponTypes || !$dataSystem.weaponTypes[wtypeId]) {
      return (T('Shop.weaponType')) + wtypeId;
    }
    let weaponTypeName = $dataSystem.weaponTypes[wtypeId];
    if (window.translateText && typeof window.translateText === "function") {
      weaponTypeName = window.translateText(weaponTypeName);
    }
    return weaponTypeName;
  };

  Window_ItemDetail.prototype.getArmorTypeName = function (atypeId) {
    if (!$dataSystem || !$dataSystem.armorTypes || !$dataSystem.armorTypes[atypeId]) {
      return (T('Shop.armorType')) + atypeId;
    }
    let armorTypeName = $dataSystem.armorTypes[atypeId];
    if (window.translateText && typeof window.translateText === "function") {
      armorTypeName = window.translateText(armorTypeName);
    }
    return armorTypeName;
  };

  Window_ItemDetail.prototype.getEquipTypeName = function (etypeId) {
    return translate(equipTypeName(etypeId));
  };

  //=============================================================================
  // SHOP-SPECIFIC BRIDGING CODE
  //=============================================================================

  const _Window_ShopStatus_initialize = Window_ShopStatus.prototype.initialize;
  Window_ShopStatus.prototype.initialize = function (rect) {
    _Window_ShopStatus_initialize.call(this, rect);
    this._detailWindow = null;
  };

  Window_ShopStatus.prototype.setDetailWindow = function (detailWindow) {
    this._detailWindow = detailWindow;
  };

  const _Window_ShopStatus_setItem = Window_ShopStatus.prototype.setItem;
  Window_ShopStatus.prototype.setItem = function (item) {
    _Window_ShopStatus_setItem.call(this, item);
    if (this._detailWindow) {
      this._detailWindow.setItem(item);
    }
  };

  Window_ShopStatus.prototype.refresh = function () {
    if (this.contents) this.contents.clear();
    this.hideBackgroundDimmer();
    this.hide();
  };

  // Every native shop window is replaced by the DOM overlay below, so each one
  // is parked off-screen and silenced the moment it is built. They are all the
  // same three lines, so the hooks are installed from one table instead of nine
  // hand-written copies that could each miss a null check.
  const HIDDEN_SHOP_WINDOWS = {
    createHelpWindow: '_helpWindow',
    createGoldWindow: '_goldWindow',
    createCommandWindow: '_commandWindow',
    createDummyWindow: '_dummyWindow',
    createBuyWindow: '_buyWindow',
    createCategoryWindow: '_categoryWindow',
    createSellWindow: '_sellWindow',
    createNumberWindow: '_numberWindow',
    createStatusWindow: '_statusWindow'
  };

  const parkWindow = (win) => {
    if (!win) return;
    win.x = -3000;
    win.y = -3000;
    win.opacity = 0;
    win.contentsOpacity = 0;
    win.showBackgroundDimmer = function () { };
  };

  for (const [method, field] of Object.entries(HIDDEN_SHOP_WINDOWS)) {
    const base = Scene_Shop.prototype[method];
    Scene_Shop.prototype[method] = function () {
      base.call(this);
      parkWindow(this[field]);
    };
  }

  // The keys the shop borrows while it is open.
  const SHOP_KEY_BINDINGS = {
    87: 'up',        // W
    65: 'shopBack',  // A → always go back to buy tab
    83: 'down',      // S
    68: 'right',     // D
    81: 'pageup',    // Q → L1 (switch to Buy)
    69: 'pagedown',  // E → R1 (switch to Sell)
    // The keyboard's half of the per-line quantity steppers on a picked card.
    // Both rows of minus/plus, so it works with or without a numpad. MousePan
    // owns these four on the map (mapZoomIn/Out); borrowing is what this table
    // is for, and releaseShopKeys puts them back when the shop closes.
    189: 'shopQtyDown', // -
    187: 'shopQtyUp',   // =/+
    109: 'shopQtyDown', // numpad -
    107: 'shopQtyUp'    // numpad +
  };

  // How far a fully pulled analog trigger has to travel before it counts as a
  // press, and how many frames apart it repeats while it is held. The triggers
  // are the pad's half of the same steppers: they have no Input.gamepadMapper
  // entry (buttons 6/7), so they are read raw through AnalogStickInput, the
  // same way the empathize panel reads them.
  const QTY_TRIGGER_THRESHOLD = 0.5;
  const QTY_REPEAT_WAIT = 24;
  const QTY_REPEAT_INTERVAL = 5;

  // What those keys meant before a shop borrowed them, kept module-wide rather
  // than per scene. A scene-local copy looked right but a shop that opened while
  // another was still standing recorded the shop's OWN bindings as the originals
  // and left WASD stuck in shop mode for the rest of the session.
  //
  // Borrowing is idempotent: shops never legitimately nest (the engine
  // terminates the outgoing scene before creating the incoming one), so a second
  // borrow keeps the first set of originals and any single release restores
  // them. Restoring key by key also leaves alone whatever another plugin
  // remapped in the meantime, which swapping the whole keyMapper back would undo.
  let _shopKeyOriginals = null;

  const borrowShopKeys = () => {
    if (!_shopKeyOriginals) {
      _shopKeyOriginals = {};
      for (const code of Object.keys(SHOP_KEY_BINDINGS)) {
        _shopKeyOriginals[code] = Input.keyMapper[code];
      }
    }
    for (const code of Object.keys(SHOP_KEY_BINDINGS)) {
      Input.keyMapper[code] = SHOP_KEY_BINDINGS[code];
    }
  };

  const releaseShopKeys = () => {
    if (!_shopKeyOriginals) return;
    for (const code of Object.keys(_shopKeyOriginals)) {
      const previous = _shopKeyOriginals[code];
      if (previous === undefined) delete Input.keyMapper[code];
      else Input.keyMapper[code] = previous;
    }
    _shopKeyOriginals = null;
  };

  const _Scene_Shop_create = Scene_Shop.prototype.create;
  Scene_Shop.prototype.create = function () {
    _Scene_Shop_create.call(this);
    this.createItemDetailWindow();
    this.initStock();
    // Analog-trigger hold state for the cart quantity steppers (readShopQtyStep).
    this._qtyTriggerDir = 0;
    this._qtyTriggerHold = 0;
    // The buy list was built while the engine created its windows, before
    // today's stock was rolled, so a shelf filtered against yesterday's numbers
    // is rebuilt now that the record is current.
    if (this._buyWindow) this._buyWindow.refresh();
    this.initUIShopDOM();

    // Haggling and Appraising still decide the numbers on the counter, but the
    // shop keeps them off screen: no chips over the shelves.
    if (window.SpecBadge) safe("SpecBadge", () => window.SpecBadge.hide(), null);

    borrowShopKeys();
    this._shopKeysBorrowed = true;

    // Safety net: a plugin loading after this one may replace a create* hook
    // without calling ours, and an unparked native window would then be drawn
    // on top of the overlay.
    for (const field of Object.values(HIDDEN_SHOP_WINDOWS)) parkWindow(this[field]);
    parkWindow(this._itemDetailWindow);

    // Global keyboard / escape listener. Both listeners live on window, so they
    // must check they still belong to the scene on screen: a shop that failed to
    // tear down would otherwise keep closing whatever scene came after it.
    this._onShopKeyDown = (event) => {
      if (event.key !== "Escape" && event.key !== "Esc") return;  // i18n-ignore  KeyboardEvent.key values
      if (SceneManager._scene !== this) return;
      event.preventDefault();
      this.cancelShopAction();
    };
    window.addEventListener("keydown", this._onShopKeyDown);

    // Global right-click / context menu listener to handle cancellations
    this._onShopContextMenu = (event) => {
      event.preventDefault();
      if (SceneManager._scene !== this) return;
      this.cancelShopAction();
    };
    window.addEventListener("contextmenu", this._onShopContextMenu);
  };

  // Every window this scene drives. Anything reaching into them goes through
  // isShopReady() first: the DOM overlay is refreshed from the update loop and
  // from click handlers, either of which can outlive the windows themselves.
  Scene_Shop.prototype.isShopReady = function () {
    return !!(this._buyWindow && this._sellWindow && this._categoryWindow &&
      this._numberWindow && this._commandWindow);
  };

  // The one way out of the shop. A second popScene in the same frame empties
  // the scene stack and SceneManager.exit() closes the game, which is what a
  // stray click, a gamepad B and the Escape listener firing together used to do.
  // The scene's own flag is checked as well as the engine's: this shop pops
  // itself exactly once whatever any other plugin has done to isSceneChanging.
  Scene_Shop.prototype.closeShop = function () {
    if (this._shopClosing) return;
    if (SceneManager._scene !== this) return;
    if (SceneManager.isSceneChanging()) return;
    this._shopClosing = true;
    this.popScene();
  };

  // Back out of the quantity modal if it is open, otherwise leave the shop.
  Scene_Shop.prototype.cancelShopAction = function () {
    if (this._shopClosing) return;
    if (SceneManager._scene !== this || SceneManager.isSceneChanging()) return;
    SoundManager.playCancel();
    if (this._numberWindow && this._numberWindow.active) {
      this._numberWindow.processCancel();
      this.refreshUIShop();
    } else {
      this.closeShop();
    }
  };

  Scene_Shop.prototype.createItemDetailWindow = function () {
    const rect = this.statusWindowRect();
    this._itemDetailWindow = new Window_ItemDetail(rect);
    parkWindow(this._itemDetailWindow);
    this.addWindow(this._itemDetailWindow);
    if (this._statusWindow && this._statusWindow.setDetailWindow) {
      this._statusWindow.setDetailWindow(this._itemDetailWindow);
    }
  };

  const _Window_ShopBuy_updateHelp = Window_ShopBuy.prototype.updateHelp;
  Window_ShopBuy.prototype.updateHelp = function () {
    _Window_ShopBuy_updateHelp.call(this);
    if (this._statusWindow) {
      this._statusWindow.setItem(this.item());
    }
  };

  Window_ShopBuy.prototype.makeItemList = function () {
    this._data = [];
    this._price = [];
    if (!Array.isArray(this._shopGoods)) return;

    const shopData = currentShopData();
    const scene = SceneManager._scene;
    const items = [];

    // One malformed goods entry must not empty the whole shelf, so each is
    // resolved on its own.
    for (const goods of this._shopGoods) {
      const item = safe("goodsToItem", () => this.goodsToItem(goods), null);
      if (!item) continue;
      // Nobody orders keepsakes in. A collectible is on a shelf only because
      // the party sold it over this counter, and those rows are added below.
      if (fixedPrice(item) !== null) continue;
      // Nothing of the wrong nature is ever on a shelf: a severed world sells
      // no charms and an unbound one sells nothing ordinary
      // (window.MagicNature). The line simply is not stocked, rather than
      // being listed and refused at the till.
      if (window.MagicNature && !window.MagicNature.allowsData(item)) continue;
      // A sold-out line leaves the shelf rather than sitting there greyed out.
      // The record is only consulted for a shop that keeps one, so a plugin
      // shop or an eventless counter still lists everything.
      const stock = (scene instanceof Scene_Shop) ? scene.getStock(item) : UNLIMITED_STOCK;
      if (stock <= 0) continue;
      const listed = goods[2] === 0 ? item.price : goods[3];
      const price = buyUnitPrice(item, listed, shopData);
      items.push({ item: item, price: Math.max(0, price), category: categoryLabelOf(item).toLowerCase() });
    }

    // What the party has left here on consignment, at the same flat price it
    // was paid. Added after the shelf so a counter that also stocks the thing
    // (it cannot, today, but a mod may) never lists it twice.
    if (scene instanceof Scene_Shop) {
      const listed = new Set(items.map(o => o.item));
      for (const item of consignedItems(scene)) {
        if (listed.has(item)) continue;
        if (window.MagicNature && !window.MagicNature.allowsData(item)) continue;
        const price = buyUnitPrice(item, item.price, shopData);
        items.push({ item: item, price: Math.max(0, price), category: categoryLabelOf(item).toLowerCase() });
      }
    }

    // The shelf is read as categories, alphabetically, with the lines inside
    // each one in name order: the list the overlay draws is grouped under a
    // header per category, and the data behind it is kept in the same order so
    // the cursor walks the page the way it looks.
    items.sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      const byName = itemName(a.item).localeCompare(itemName(b.item));
      return byName !== 0 ? byName : a.price - b.price;
    });

    // The whole shelf is kept as well as the filtered list: the chip row is
    // built from everything on offer, not from what the lit chip let through,
    // and a line already in the basket keeps its price when a chip hides it.
    this._allData = items.map(obj => obj.item);
    this._allPrice = items.map(obj => obj.price);

    for (const obj of items) {
      if (scene instanceof Scene_Shop && !scene.passesShopCategory(obj.item, true)) continue;
      this._data.push(obj.item);
      this._price.push(obj.price);
    }
  };

  // The chip in front of the tab row, kept in step with whether a pad is
  // plugged in. The row itself is only rebuilt on a redraw, so the label is
  // moved here rather than re-rendering the tabs every frame.
  Scene_Shop.prototype.syncShopTabHint = function () {
    const onPad = padPluggedIn();
    if (this._shopHintPad === onPad) return;
    this._shopHintPad = onPad;
    const el = this._shopContainer && this._shopContainer.querySelector(".shop-tab-hint");
    if (!el) return;
    el.dataset.pad = onPad ? "1" : "0";
    el.textContent = tabHintLabel();
  };

  // Base price() looks the item up by identity in _data. An item the list does
  // not hold (a stale selection after a refresh, or a line a category chip is
  // currently hiding) used to return undefined and poison every total
  // downstream with NaN, so the whole shelf is asked before giving up.
  Window_ShopBuy.prototype.price = function (item) {
    const index = this._data ? this._data.indexOf(item) : -1;
    let price = index >= 0 && this._price ? this._price[index] : null;
    if (price === null) {
      const shelfIndex = this._allData ? this._allData.indexOf(item) : -1;
      price = shelfIndex >= 0 && this._allPrice ? this._allPrice[shelfIndex] : 0;
    }
    return Number.isFinite(price) ? price : 0;
  };

  // Drives the DOM overlay and carries the input the parked native windows can
  // no longer receive. Nothing below runs for a scene that is closing, has lost
  // its windows, or is no longer the one on screen.
  const _Scene_Shop_update = Scene_Shop.prototype.update;
  Scene_Shop.prototype.update = function () {
    _Scene_Shop_update.call(this);
    if (this._shopClosing || !this.isShopReady() || SceneManager._scene !== this) return;

    this.syncShopTabHint();

    // Robust native input/controller backup checks
    if (Input.isTriggered('shopBack') && !this._numberWindow.active) {
      if (this._sellWindow.active || this._categoryWindow.active) {
        SoundManager.playCursor();
        this.switchToBuy();
        return;
      }
    }

    // Shift puts the highlighted line on the counter, or takes it back off: the
    // keyboard's half of the multi-select the cards do on a click. It works on
    // either side of the counter, on whichever list currently has the cursor.
    if (Input.isTriggered('shift') && !this._numberWindow.active) {
      const buying = this._buyWindow.active;
      const selling = this._sellWindow.active && !this._chipFocus;
      if (buying || selling) {
        const item = buying ? this._buyWindow.item() : this._sellWindow.item();
        if (item && this.toggleCart(item, buying)) {
          SoundManager.playOk();
          this.refreshUIShop();
        }
        return;
      }
    }

    // TAB alone flips between Acquire and Liquidate, which is what the chip in
    // front of the tab row names. A pad reaches the same flip through the
    // bumpers, so the chip reads L1 R1 there instead.
    if (Input.isTriggered('tab') && !Input.isPressed('shift') && !this._numberWindow.active) {
      if (this._buyWindow.active) {
        SoundManager.playCursor();
        this.switchToSell();
        return;
      }
      if (this._sellWindow.active || this._categoryWindow.active) {
        SoundManager.playCursor();
        this.switchToBuy();
        return;
      }
    }

    // SHIFT+TAB takes the whole category the cursor is standing in, or puts it
    // back: the keyboard's half of the press on a category header. TAB has no
    // entry in Input.gamepadMapper, so a pad reaches it through Y ('menu'), the
    // one face button the shop leaves free: A is OK, B is cancel, X is the
    // single-line multi-select above, and the bumpers switch Buy/Sell.
    if (((Input.isTriggered('tab') && Input.isPressed('shift')) || Input.isTriggered('menu')) && !this._numberWindow.active) {
      const buying = this._buyWindow.active;
      const selling = this._sellWindow.active && !this._chipFocus;
      if (buying || selling) {
        const item = buying ? this._buyWindow.item() : this._sellWindow.item();
        const key = item ? categoryLabelOf(item).toLowerCase() : null;
        if (key && this.toggleCategoryCart(key, buying)) {
          SoundManager.playOk();
          this.refreshUIShop();
        }
        return;
      }
    }

    // The per-line quantity on a card already sitting on the counter. The mouse
    // has the little -/+ steppers inside the card; without this the only way a
    // pad or keyboard could change an amount was to take the line off the
    // counter and put it back, so every multi-line cart was stuck at one each.
    // Minus/plus on the keyboard, L2/R2 on a pad, both auto-repeating; SHIFT
    // steps by ten and CTRL goes the whole way, matching the stepper's clicks.
    if (!this._numberWindow.active) {
      const step = this.readShopQtyStep();
      if (step) {
        const buying = this._buyWindow.active;
        const selling = this._sellWindow.active && !this._chipFocus;
        if (buying || selling) {
          const item = buying ? this._buyWindow.item() : this._sellWindow.item();
          // Only a line already on the counter has a quantity to change; on any
          // other line X ('shift') is what puts it there in the first place.
          if (item && this.shopCart(buying).has(item)) {
            const scale = Input.isPressed('control') ? 9999 : (Input.isPressed('shift') ? 10 : 1);
            this.changeCartQty(item, step * scale, buying);
            SoundManager.playCursor();
            this.refreshUIShop();
          }
          return;
        }
      }
    }

    // Guard against double handling: the active buy/sell window's native cancel
    // handler may have already called popScene this frame (it fires whenever the
    // 'cancel' symbol is triggered, including Player 2's cancel and gamepad B,
    // which the split-screen input override folds into Input.isRepeated/isTriggered).
    // Without this check a second popScene here empties the scene stack and
    // SceneManager.exit() closes the game, so cancelShopAction is a no-op once
    // the scene is already on its way out.
    if (!SceneManager.isSceneChanging() && (Input.isTriggered('cancel') || TouchInput.isCancelled())) {
      this.cancelShopAction();
      return;
    }

    this.syncUIShopState();
  };

  // =============================================================================
  // 3D weapon preview on the description page
  // =============================================================================
  // The viewer is window.Weapon3DPreview, declared by ItemSystemEquipmentUI.js
  // and shared by every menu that shows a weapon. Exactly one is ever mounted
  // here -- the shelf can hold hundreds of blades, and one context per line
  // would exhaust the browser's supply and take the game's own canvas with it.

  // Walking the shelf with a held key picks a new blade every few frames, and
  // each one is a fresh WebGL context and a procedurally built model. The piece
  // is therefore only put on the stand once the cursor comes to rest; the
  // square stays empty for that moment and nothing else does.
  const SHOP_PREVIEW_SETTLE_MS = 90;

  Scene_Shop.prototype.mountShopWeaponPreview = function () {
    const model = this._pendingPreviewModel;
    this._pendingPreviewModel = null;
    if (!model || !window.Weapon3DPreview) return;
    this._shopPreviewTimer = setTimeout(() => {
      this._shopPreviewTimer = 0;
      const canvas = document.getElementById("shop-preview-canvas");
      if (!canvas) return;
      const entry = window.Weapon3DPreview.mount(canvas, model);
      this._shopPreviewRenderers = entry ? [entry] : [];
    }, SHOP_PREVIEW_SETTLE_MS);
  };

  Scene_Shop.prototype.cleanupShopWeaponPreview = function () {
    if (this._shopPreviewTimer) {
      clearTimeout(this._shopPreviewTimer);
      this._shopPreviewTimer = 0;
    }
    if (!this._shopPreviewRenderers || !window.Weapon3DPreview) return;
    window.Weapon3DPreview.disposeAll(this._shopPreviewRenderers);
    this._shopPreviewRenderers = [];
  };

  const _Scene_Shop_terminate = Scene_Shop.prototype.terminate;
  Scene_Shop.prototype.terminate = function () {
    this.cleanupShopWeaponPreview();
    this.destroyUIShopDOM();

    // Clean up event listeners to avoid memory leaks
    if (this._onShopKeyDown) {
      window.removeEventListener("keydown", this._onShopKeyDown);
      this._onShopKeyDown = null;
    }
    if (this._onShopContextMenu) {
      window.removeEventListener("contextmenu", this._onShopContextMenu);
      this._onShopContextMenu = null;
    }

    // Hand the borrowed keys back exactly once per shop that took them.
    if (this._shopKeysBorrowed) {
      this._shopKeysBorrowed = false;
      releaseShopKeys();
    }

    _Scene_Shop_terminate.call(this);
  };


  // ============================================================================
  // Premium HTML DOM merchant counter systems
  // ============================================================================
  // The overlay this scene owns, or null once it has gone. Never look the id up
  // directly: a container left behind by an earlier shop carries that id too,
  // and its click handlers still point at that dead scene.
  Scene_Shop.prototype.shopContainer = function () {
    const container = this._shopContainer;
    if (!container || !container.isConnected) return null;
    return container;
  };

  Scene_Shop.prototype.destroyUIShopDOM = function () {
    if (this._shopContainer) {
      this._shopContainer.remove();
      this._shopContainer = null;
    }
    // Anything an earlier shop failed to clear goes with it.
    const stray = document.getElementById("shop-container");
    if (stray) stray.remove();
  };

  Scene_Shop.prototype.initUIShopDOM = function () {
    // Always start from a clean container bound to THIS scene. Reusing one left
    // over from a previous shop kept every button wired to a scene that is no
    // longer on screen, so a click would pop a stack that no longer held it.
    this.destroyUIShopDOM();

    const container = document.createElement("div");
    container.id = "shop-container";
    this._shopContainer = container;
    document.body.appendChild(container);

    container.innerHTML = `
        <div class="shop-spread" style="display: flex; width: 100%; height: 100%; box-sizing: border-box;">
            <div class="shop-left" style="flex: 3; padding: 10px 20px; box-sizing: border-box; display: flex; flex-direction: column; overflow: hidden; height: 100%;">
                <div class="page-header-bar">
                    <div class="back-button focusable" id="shop-close-btn">
                        ${T('Shop.back')}
                    </div>
                    <h2 class="title">${T('Shop.shop')}</h2>
                </div>
                <div id="shop-funds" class="shop-funds">
                    ${T('Shop.availableFunds')} <span class="shop-funds-value">0.00 €</span>
                </div>
                <div class="shop-tabs">
                    <div class="shop-tab-hint" data-pad="0">${esc(tabHintLabel())}</div>
                    <div class="shop-tab" id="tab-buy">${T('Shop.acquireGoods')}</div>
                    <div class="shop-tab" id="tab-sell">${T('Shop.liquidateAssets')}</div>
                    <div class="shop-tab focusable" id="tab-collect" title="${esc(T('Shop.sellCollectiblesHint'))}">${T('Shop.sellCollectibles')}</div>
                </div>
                <div id="shop-categories-container"></div>
                <div id="shop-selection-bar"></div>
                <div class="catalog-viewport" style="flex: 1; overflow-y: auto; padding-right: 4px;"></div>
            </div>
            
            <div class="shop-right" style="flex: 2; padding: 10px 20px 10px 30px; box-sizing: border-box; display: flex; flex-direction: column; overflow: hidden; height: 100%;">
                <div id="detail-viewport" style="flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden;"></div>
            </div>
            
            <div id="modal-viewport"></div>
        </div>
      `;

    // Every handler below runs from the browser, outside the game loop, so each
    // one first asks whether this scene is still the one on screen and still
    // holds its windows.
    const onShopClick = (selector, handler) => {
      const node = container.querySelector(selector);
      if (!node) {
        warnOnce("missing element " + selector, null);
        return;
      }
      node.addEventListener("click", (e) => {
        e.stopPropagation();
        if (SceneManager._scene !== this || !this.isShopReady()) return;
        safe("click " + selector, () => handler(), null);
      });
    };

    // Back Button click
    onShopClick("#shop-close-btn", () => this.cancelShopAction());

    // Tab clicks
    onShopClick("#tab-buy", () => {
      if (!this._buyWindow.active) {
        SoundManager.playOk();
        this.switchToBuy();
      }
    });

    onShopClick("#tab-sell", () => {
      const isSellMode = this._sellWindow.active || this._categoryWindow.active;
      if (!isSellMode) {
        SoundManager.playOk();
        this.switchToSell();
      }
    });

    // The whole keepsake shelf over the counter in one gesture: collectibles
    // have no use and one flat price, so there is nothing to weigh up per line.
    onShopClick("#tab-collect", () => this.sellAllCollectibles());

    // Mousewheel Scroll support for catalog viewport
    container.addEventListener("wheel", (e) => {
      e.preventDefault();
      const viewport = container.querySelector(".catalog-viewport");
      if (viewport) {
        viewport.scrollTop += e.deltaY;
      }
    }, { passive: false });
  };

  // While the quantity modal is open the buy/sell windows are deactivated, so the
  // active-window flags can't tell us which tab we're on. Fall back to the command
  // window's current symbol so the background keeps the correct tab during a purchase.
  Scene_Shop.prototype.isShopBuyMode = function () {
    if (this._numberWindow && this._numberWindow.active) {
      return this._commandWindow.currentSymbol() === "buy";
    }
    return this._buyWindow.active;
  };

  Scene_Shop.prototype.isShopSellMode = function () {
    if (this._numberWindow && this._numberWindow.active) {
      return this._commandWindow.currentSymbol() === "sell";
    }
    return this._sellWindow.active || this._categoryWindow.active;
  };

  Scene_Shop.prototype.buyData = function () {
    return (this._buyWindow && this._buyWindow._data) || [];
  };

  Scene_Shop.prototype.sellData = function () {
    return (this._sellWindow && this._sellWindow._data) || [];
  };

  Scene_Shop.prototype.getShopStateHash = function () {
    const isBuyMode = this.isShopBuyMode();
    const isSellMode = this.isShopSellMode();
    const buyIdx = this._buyWindow.index();
    const sellIdx = this._sellWindow.index();
    const catIdx = this.shopCategoryFilter(isBuyMode);
    const numActive = this._numberWindow.active;
    const numVal = this._numberWindow.number();
    const numMax = this._numberWindow.max();
    const partyGold = $gameParty.gold();
    const buyData = this.buyData();
    const sellData = this.sellData();
    const stockHash = buyData.map(item => this.getStock(item)).join(",");
    // One pass over the party's gear per frame instead of one per listed item.
    const worn = wornCounts();
    const ownedHash = sellData.map(item => $gameParty.numItems(item) + (worn.get(item) || 0)).join(",");

    const chipFocus = this._chipFocus || false;
    const selHash = this.cartHash(isBuyMode);
    return `${isBuyMode}_${isSellMode}_${buyIdx}_${sellIdx}_${catIdx}_${numActive}_${numVal}_${numMax}_${partyGold}_${buyData.length}_${sellData.length}_${stockHash}_${ownedHash}_${chipFocus}_${selHash}`;
  };

  Scene_Shop.prototype.syncUIShopState = function () {
    if (!this.isShopReady()) return;
    const container = this.shopContainer();
    if (!container) return;

    // This runs once a frame off live game data. An exception used to throw
    // again on the next frame, and the next, until the game died; here the
    // overlay is rebuilt once and, if that fails too, the shop closes cleanly
    // rather than taking the session with it.
    try {
      this.renderUIShopState(container);
      this._shopRenderFailures = 0;
    } catch (e) {
      warnOnce("syncUIShopState", e);
      this._shopRenderFailures = (this._shopRenderFailures || 0) + 1;
      if (this._shopRenderFailures === 1) {
        // Rebuild now, draw on the next frame: re-entering the renderer from
        // inside its own catch would only nest the failure.
        safe("rebuild overlay", () => {
          this.initUIShopDOM();
          this._lastShopStateHash = null;
        }, null);
      } else {
        console.error("[ItemSystemShop] overlay cannot be drawn, closing the shop.", e);
        this.closeShop();
      }
    }
  };

  Scene_Shop.prototype.renderUIShopState = function (container) {
    const hash = this.getShopStateHash();
    if (this._lastShopStateHash === hash) return;
    this._lastShopStateHash = hash;


    const isBuyMode = this.isShopBuyMode();
    const activeIndex = isBuyMode ? this._buyWindow.index() : this._sellWindow.index();

    // 1. Update Gold/Funds
    const currentGold = $gameParty.gold();
    const fundsNode = container.querySelector("#shop-funds");
    if (this._renderedGold !== currentGold && fundsNode) {
      this._renderedGold = currentGold;
      fundsNode.innerHTML = `${esc(T('Shop.availableFunds'))} <span class="shop-funds-value">${money(currentGold)} €</span>`;
    }

    // 2. Update Tabs active state
    let forceListRedraw = false;
    if (this._renderedIsBuyMode !== isBuyMode) {
      this._renderedIsBuyMode = isBuyMode;
      forceListRedraw = true;

      const tabBuy = container.querySelector("#tab-buy");
      const tabSell = container.querySelector("#tab-sell");
      if (tabBuy) tabBuy.classList.toggle("active", isBuyMode);
      if (tabSell) tabSell.classList.toggle("active", !isBuyMode);
    }

    // 3. The chip row: every category this side of the counter actually holds,
    // drawn like the backpack's own. It is rebuilt when the set of categories
    // changes (selling the last of something takes its chip away) or when the
    // filter or the cursor moves onto it.
    const chips = this.shopCategoryChips(isBuyMode);
    const activeChip = this.shopCategoryFilter(isBuyMode);
    const chipFocus = this._chipFocus || false;
    const chipHash = `${isBuyMode}_${activeChip}_${chipFocus}_${chips.map(c => c.key).join(",")}`;
    if (this._renderedChipHash !== chipHash) {
      this._renderedChipHash = chipHash;
      forceListRedraw = true;

      const catContainer = container.querySelector("#shop-categories-container");
      if (catContainer) {
        catContainer.innerHTML = `
          <div class="backpack-tabs-row shop-chips${chipFocus ? ' focused' : ''}">
              ${chips.map(chip => `
              <div class="backpack-tab${chip.key === activeChip ? ' active' : ''}" data-cat="${esc(chip.key)}">${esc(chip.label)}</div>`).join("")}
          </div>
        `;

        catContainer.querySelectorAll(".backpack-tab").forEach(chip => {
          chip.addEventListener("click", (e) => {
            e.stopPropagation();
            if (SceneManager._scene !== this || !this.isShopReady()) return;
            safe("category chip click", () => {
              SoundManager.playOk();
              this.setShopCategoryFilter(chip.getAttribute("data-cat"), this.isShopBuyMode());
            }, null);
          });
        });
      }
    }

    // 4. Verify if items data changed
    const worn = wornCounts();
    const listLength = isBuyMode ? this.buyData().length : this.sellData().length;
    const stockHash = this.buyData().map(item => this.getStock(item)).join(",");
    const ownedHash = this.sellData().map(item => $gameParty.numItems(item) + (worn.get(item) || 0)).join(",");

    const selHash = this.cartHash(isBuyMode);

    if (
      this._renderedListLength !== listLength ||
      this._renderedStockHash !== stockHash ||
      this._renderedOwnedHash !== ownedHash ||
      this._renderedSelHash !== selHash
    ) {
      this._renderedListLength = listLength;
      this._renderedStockHash = stockHash;
      this._renderedOwnedHash = ownedHash;
      this._renderedSelHash = selHash;
      forceListRedraw = true;
    }

    // 4b. The counter: what is on the pile, and the one press that settles it.
    const selectionBar = container.querySelector("#shop-selection-bar");
    if (selectionBar && forceListRedraw) {
      this.renderShopCartBar(selectionBar, isBuyMode);
    }

    // 5. Redraw Item Cards List if forced. Both sides of the counter are drawn
    // the same way: one header per category, alphabetically, with that
    // category's lines under it. The header is a press of its own that takes
    // the whole category onto the counter, so a bag full of butchered cuts or
    // a shelf full of one thing is picked in one click rather than twenty.
    const viewport = container.querySelector(".catalog-viewport");
    if (forceListRedraw && viewport) {
      const data = isBuyMode ? this.buyData() : this.sellData();
      let itemsHTML = "";
      if (data.length === 0) {
        itemsHTML = `<div class="shop-empty-note">${esc(T('Shop.listEmpty'))}</div>`;
      } else {
        const cart = this.shopCart(isBuyMode);
        const listFocused = isBuyMode || this._sellWindow.active;
        for (const group of this.shopCategoryGroups(data, isBuyMode)) {
          itemsHTML += this.categoryHeaderHTML(group);
          for (const idx of group.indices) {
            itemsHTML += this.itemCardHTML(data[idx], idx, isBuyMode, cart,
              listFocused && activeIndex === idx);
          }
        }
      }
      // Redrawing the page throws the scroll position away, and every pick
      // redraws it: without this, picking a line halfway down a long bag threw
      // the reader back to the top of it.
      const scrollTop = viewport.scrollTop;
      viewport.innerHTML = itemsHTML;
      viewport.scrollTop = scrollTop;

      // Category headers: one press picks the whole category, a second one
      // puts it all back.
      viewport.querySelectorAll(".shop-cat-header").forEach(header => {
        header.addEventListener("click", (e) => {
          e.stopPropagation();
          if (SceneManager._scene !== this || !this.isShopReady()) return;
          safe("category header click", () => {
            const key = header.getAttribute("data-cat");
            if (this.toggleCategoryCart(key, this.isShopBuyMode())) SoundManager.playOk();
            this.refreshUIShop();
          }, null);
        });
      });

      // Card clicks event listeners. Both sides are multi-select: a click puts
      // the line on the counter (or takes it back off) rather than opening the
      // quantity modal, so several lines can be picked one after another and
      // settled together.
      viewport.querySelectorAll(".item-card").forEach(card => {
        card.addEventListener("click", (e) => {
          e.stopPropagation();
          if (SceneManager._scene !== this || !this.isShopReady()) return;
          safe("card click", () => {
            const idx = parseInt(card.getAttribute("data-idx"), 10);
            if (!Number.isFinite(idx)) return;
            const buying = card.getAttribute("data-mode") === "buy";
            const win = buying ? this._buyWindow : this._sellWindow;
            if (!buying) this._chipFocus = false;
            win.select(idx);
            const item = (buying ? this.buyData() : this.sellData())[idx];
            if (this.toggleCart(item, buying)) SoundManager.playOk();
            this.refreshUIShop();
          }, null);
        });
      });

      // The per-line quantity steppers on a picked card. They sit inside the
      // card, so each stops the click before the card's own toggle sees it.
      // Shift steps by ten and Ctrl goes the whole way, so a line of fifty is
      // not fifty presses.
      viewport.querySelectorAll(".sell-qty-step").forEach(step => {
        step.addEventListener("click", (e) => {
          e.stopPropagation();
          if (SceneManager._scene !== this || !this.isShopReady()) return;
          safe("cart qty step", () => {
            const idx = parseInt(step.getAttribute("data-idx"), 10);
            const delta = parseInt(step.getAttribute("data-step"), 10);
            if (!Number.isFinite(idx) || !Number.isFinite(delta)) return;
            const buying = step.getAttribute("data-mode") === "buy";
            const item = (buying ? this.buyData() : this.sellData())[idx];
            if (!item) return;
            const scale = e.ctrlKey ? 9999 : (e.shiftKey ? 10 : 1);
            this.changeCartQty(item, delta * scale, buying);
            SoundManager.playCursor();
            this.refreshUIShop();
          }, null);
        });
      });
    }

    // 6. Update focus class and scroll if index changed. The cards carry their
    // own index rather than being counted off the page: the category headers
    // sit between them, so their position in the DOM is not their position in
    // the list the cursor walks.
    if (viewport && (this._renderedSelectedIndex !== activeIndex || forceListRedraw)) {
      this._renderedSelectedIndex = activeIndex;

      viewport.querySelectorAll(".item-card").forEach((card) => {
        const idx = parseInt(card.getAttribute("data-idx"), 10);
        if (idx === activeIndex) {
          card.classList.add("focused");
          // Smooth scroll into viewport if not visible
          card.scrollIntoView({ block: "nearest", behavior: "smooth" });
        } else {
          card.classList.remove("focused");
        }
      });
    }

    // 7. Update Item Detail Viewport on Right Page
    const selectedItem = isBuyMode ? this._buyWindow.item() : this._sellWindow.item();
    const detailViewport = container.querySelector("#detail-viewport");
    if (detailViewport && (this._renderedDetailItem !== selectedItem || forceListRedraw)) {
      this._renderedDetailItem = selectedItem;
      // Whatever was being shown is about to be written over, and a WebGL
      // context that is only dropped on the floor is never given back: the
      // browser caps how many may live and force-loses the OLDEST, which is the
      // game's own canvas (see Weapon3DPreview.disposeAll). Every path that
      // rewrites this panel goes through here, so this is the one release.
      this.cleanupShopWeaponPreview();

      if (selectedItem) {
        const isFood = safe("isFoodItem", () => utils.isFoodItem(selectedItem), false);
        const category = categoryOf(selectedItem) || T('Shop.item');
        const weight = formatWeight(weightOf(selectedItem));

        // How many of this there are lives on the description page, next to the
        // weight, rather than on the line: the left page is a price list, and a
        // line that also carried its own weight and its own two counts read as
        // four numbers where one was wanted.
        const wornHere = worn.get(selectedItem) || 0;
        const ownedHere = $gameParty.numItems(selectedItem) + wornHere;
        let countBadgesHTML = `
            <div class="detail-spec-badge">
                <span class="badge-lbl">${esc(T('Shop.ui.owned'))}</span>
                <span class="badge-val">${ownedHere}</span>
            </div>
        `;
        if (isBuyMode) {
          const shelfStock = this.getStock(selectedItem);
          countBadgesHTML += `
            <div class="detail-spec-badge">
                <span class="badge-lbl">${esc(T('Shop.ui.stock'))}</span>
                <span class="badge-val">${shelfStock === UNLIMITED_STOCK ? "∞" : shelfStock}</span>
            </div>
          `;
        } else if (wornHere > 0) {
          // Gear on someone's back is sellable too, but say so: the sale takes
          // it off them.
          countBadgesHTML += `
            <div class="detail-spec-badge">
                <span class="badge-lbl">${esc(T('Shop.ui.worn'))}</span>
                <span class="badge-val">${wornHere}</span>
            </div>
          `;
        }

        let scaleBadgeHTML = "";
        if (DataManager.isWeapon(selectedItem) && this._itemDetailWindow) {
          const scaling = this._itemDetailWindow.getWeaponScalingType(selectedItem);
          if (scaling) {
            scaleBadgeHTML = `
              <div class="detail-spec-badge">
                  <span class="badge-lbl">${esc(T('Shop.ui.scale'))}</span>
                  <span class="badge-val">${esc(scaling)}</span>
              </div>
            `;
          }
        }

        let damageTypeBadgeHTML = "";
        const dt = (selectedItem.meta && selectedItem.meta.DamageType) ||
            (selectedItem.note && (selectedItem.note.match(/<DamageType:\s*([^>]+)>/i) || [])[1]);
        if (dt) {
          damageTypeBadgeHTML = `
            <div class="detail-spec-badge">
                <span class="badge-lbl">${esc(T('Inventory.spec.label.damageCategory') || 'Damage Type')}</span>
                <span class="badge-val" style="color:var(--text-secondary-active); font-weight:bold;">${esc(String(dt).trim())}</span>
            </div>
          `;
        }

        let slotBadgeHTML = "";
        if (DataManager.isWeapon(selectedItem) || DataManager.isArmor(selectedItem)) {
          const slotName = translate(equipTypeName(selectedItem.etypeId));
          slotBadgeHTML = `
            <div class="detail-spec-badge">
                <span class="badge-lbl">${esc(T('Shop.slot'))}</span>
                <span class="badge-val">${esc(slotName || T('Shop.equipSlot'))}</span>
            </div>
          `;
        }

        // With a pile on the counter the page's own button settles the pile, not
        // the one item the cursor happens to be on.
        const cartLines = this.shopCart(isBuyMode).size;
        const bulkDeal = cartLines > 0;
        const actionLabel = bulkDeal
          ? T(isBuyMode ? 'Shop.buySelected' : 'Shop.sellSelected', { lines: cartLines })
          : T(isBuyMode ? 'Shop.buy' : 'Shop.sell');

        // What this line is worth today, and how much of that is the day's
        // OIL/SOUL index rather than the sticker. The figure quoted here is
        // the one the till uses, per copy, so a bulk sale is just this times
        // the pile.
        const quote = this.priceQuote(selectedItem);
        let priceSectionHTML = "";
        if (quote) {
          const pct = quote.percent;
          // A dearer market is good news on the sell page and bad news on the
          // buy page, so the tag is coloured by who it favours, not by sign.
          const favourable = quote.buying ? pct < 0 : pct > 0;
          const marketRowsHTML = pct === 0 ? "" : `
              <div class="detail-price-row">
                  <span class="detail-price-lbl">${esc(quote.soul ? T('Shop.soulIndex') : T('Shop.oilIndex'))}</span>
                  <span class="market-tag ${favourable ? 'good' : 'bad'}">${esc(pct < 0
                    ? T('Shop.marketOff', { percent: -pct })
                    : T('Shop.marketUp', { percent: pct }))}</span>
              </div>
              <div class="detail-price-row detail-price-sub">
                  <span class="detail-price-lbl">${esc(T('Shop.basePrice'))}</span>
                  <span>${money(quote.base)} €</span>
              </div>`;
          priceSectionHTML = `
            <div class="detail-price-box">
                <div class="detail-price-row detail-price-main">
                    <span class="detail-price-lbl">${esc(quote.buying ? T('Shop.unitPrice') : T('Shop.unitSellValue'))}</span>
                    <span class="detail-price-val ${quote.buying ? 'cost' : 'gain'}">${money(quote.price)} €</span>
                </div>
                ${marketRowsHTML}
            </div>
          `;
        }

        let descHTML = "";
        if (selectedItem.description) {
          descHTML = `<div class="detail-desc">${esc(translate(selectedItem.description))}</div>`;
        }

        // Procedural lore (resolves {nation}/{leader}/... tokens) shown below the description.
        const loreText = loreOf(selectedItem);
        if (loreText) descHTML += `<div class="detail-lore">${esc(loreText)}</div>`;

        // Params
        let paramsHTML = "";
        const baseParams = [2, 3, 4, 5, 6, 7];
        const paramNames = [_si18n("ATT"), _si18n("DEF"), _si18n("M.ATT"), _si18n("M.DEF"), _si18n("AGILITY"), _si18n("LUCK")];
        let hasParams = false;

        baseParams.forEach((paramId, pIdx) => {
          let val = 0;
          if (DataManager.isWeapon(selectedItem)) {
            val = modifiedParamOf(selectedItem, paramId);
          } else if (DataManager.isArmor(selectedItem)) {
            val = paramOf(selectedItem, paramId);
          }

          if (val !== 0) {
            hasParams = true;
            const sign = val > 0 ? "+" : "";
            const color = val > 0 ? "var(--text-cost-ok)" : "var(--text-text-alt-10)";

            paramsHTML += `
              <div class="gauge-row">
                  <span style="font-weight:bold;">${esc(paramNames[pIdx])}</span>
                  <span style="font-weight:bold; color:${color};">${sign}${val}</span>
              </div>
            `;
          }
        });

        let combatSectionHTML = "";
        if (hasParams) {
          combatSectionHTML = `
            <div class="gauges-section">
                <div class="card-lbl" class="shop-sec-hdr">
                    ${T('Shop.itemParameters')}
                </div>
                ${paramsHTML}
            </div>
          `;
        }

        // Food & Nutrition
        let nutritionSectionHTML = "";
        if (isFood) {
          const calories = safe("nutrition", () => utils.getNutritionValue(selectedItem, "calories"), 0);
          const protein = safe("nutrition", () => utils.getNutritionValue(selectedItem, "protein"), 0);
          const fat = safe("nutrition", () => utils.getNutritionValue(selectedItem, "fat"), 0);

          let nutGauges = "";
          if (calories > 0) {
            nutGauges += `
              <div class="gauge-row">
                  <span class="shop-stat-key">${T('Shop.calories')}</span>
                  <span style="font-weight:bold; color:var(--text-amber-hint);">${calories} kcal</span>
              </div>
            `;
          }
          if (protein > 0) {
            nutGauges += `
              <div class="gauge-row">
                  <span class="shop-stat-key">${T('Shop.protein')}</span>
                  <span style="font-weight:bold; color:var(--text-cost-ok);">${protein}g</span>
              </div>
            `;
          }
          if (fat > 0) {
            nutGauges += `
              <div class="gauge-row">
                  <span class="shop-stat-key">${T('Shop.fat')}</span>
                  <span style="font-weight:bold; color:var(--text-gold-dark);">${fat}g</span>
              </div>
            `;
          }

          if (nutGauges) {
            nutritionSectionHTML = `
              <div class="gauges-section">
                  <div class="card-lbl" class="shop-sec-hdr">
                      ${T('Shop.vitalNutritionMetrics')}
                  </div>
                  ${nutGauges}
              </div>
            `;
          }
        }

        // Needs restored (non-food consumables: Sleep / Hygiene / Social / Fun)
        let needsSectionHTML = "";
        const needRestores = needRestoresOf(selectedItem);
        if (needRestores.length) {
          const needGauges = needRestores.map(r => `
              <div class="gauge-row">
                  <span class="shop-stat-key">${esc(r.label)}</span>
                  <span style="font-weight:bold; color:${r.color};">+${r.amount}%</span>
              </div>`).join("");
          needsSectionHTML = `
              <div class="gauges-section">
                  <div class="card-lbl" class="shop-sec-hdr">
                      ${T('Shop.needsRestored')}
                  </div>
                  ${needGauges}
              </div>
            `;
        }

        // What it is medicine for, and how long a course of it runs. Only a
        // tagged drug prints this; a healing potion has nothing to say here.
        const medicine = medicineOf(selectedItem);
        if (medicine) {
          const rows = medicineLines(medicine, 10)
            .map(r => `
              <div class="gauge-row">
                  <span class="shop-stat-key">${esc(r.label)}</span>
                  <span style="flex:1 1 auto; text-align:right; font-size:14px;">${esc(r.value)}</span>
              </div>`).join("");
          needsSectionHTML += `
              <div class="gauges-section">
                  <div class="card-lbl" class="shop-sec-hdr">
                      ${T('Shop.medicineClass')}: ${esc(medicine.label)}
                  </div>
                  ${rows}
              </div>
            `;
        }

        // Cravings fed (nicotine, drink, caffeine, narcotics, a bet)
        const cravingRelief = addictionReliefOf(selectedItem);
        if (cravingRelief.length) {
          const cravingGauges = cravingRelief.map(r => `
              <div class="gauge-row">
                  <span class="shop-stat-key">${esc(r.label)}</span>
                  <span style="font-weight:bold; color:var(--text-caption-brown);">-${r.amount}%</span>
              </div>`).join("");
          needsSectionHTML += `
              <div class="gauges-section">
                  <div class="card-lbl" class="shop-sec-hdr">
                      ${T('Shop.cravingsFed')}
                  </div>
                  ${cravingGauges}
              </div>
            `;
        }

        // Effects / Traits. A cure-all item carries two dozen of these, so they
        // are laid out as inline chips that wrap rather than one line each.
        const effectLines = [];

        const detail = this._itemDetailWindow;
        if (detail && Array.isArray(selectedItem.effects)) {
          selectedItem.effects.forEach(eff => {
            const effStr = safe("getEffectDescription", () => detail.getEffectDescription(eff), null);
            if (effStr) effectLines.push(effStr);
          });
        }

        if (detail && Array.isArray(selectedItem.traits)) {
          selectedItem.traits.forEach(tr => {
            const trStr = safe("getTraitDescription", () => detail.getTraitDescription(tr), null);
            if (trStr) effectLines.push(trStr);
          });
        }

        const effectsHTML = effectLines
          .map(line => `<span class="detail-effect-chip">${esc(line)}</span>`)
          .join("");

        let effectsSectionHTML = "";
        if (effectLines.length) {
          effectsSectionHTML = `
            <div style="margin-bottom:18px;">
                <div class="card-lbl" class="shop-sec-hdr">
                    ${T('Shop.signalsChemicalProperties')}
                </div>
                <div class="detail-effect-chips" class="shop-plate">
                    ${effectsHTML}
                </div>
            </div>
          `;
        }

        // Proficiency. A weapon is trained through the specialization the
        // Specializations menu lists for its weapon type, so the panel reports
        // where every party member stands in that one skill rather than a bare
        // yes/no. Items with no weapon specialization say nothing here.
        let proficiencyHTML = "";
        const profSpec = safe("weaponSpec", () => {
          const prof = window.WeaponProficiency;
          if (!prof || !DataManager.isWeapon(selectedItem)) return null;
          return prof.specFor(selectedItem);
        }, null);

        if (profSpec) {
          const prof = window.WeaponProficiency;
          const specs = window.Specializations;
          const specName = (specs && specs.ready) ? specs.displayName(profSpec) : profSpec.name;
          let rows = "";

          partyMembers().forEach(actor => {
            const level = prof.levelFor(actor, selectedItem);
            const trained = level >= prof.PROFICIENT_LEVEL;
            const tier = (specs && specs.ready) ? specs.levelName(level) : "";
            const color = trained ? "var(--text-cost-ok)" : "var(--text-disabled)";

            rows += `
              <div style="display:flex; align-items:baseline; gap:8px; font-size:16px; color:${color}; font-weight:${trained ? 'bold' : 'normal'};">
                  <span style="flex:1 1 auto; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(actorLabel(actor))}</span>
                  <span style="font-size:14px;">${esc(tier)}</span>
                  <span style="font-weight:bold; font-size:14px;">${esc(prof.gradeFor(actor, selectedItem))}</span>
              </div>
            `;
          });

          proficiencyHTML = `
            <div style="margin-bottom:10px;">
                <div class="card-lbl" class="shop-sec-hdr shop-sec-hdr--split">
                    <span>${esc(T('Shop.proficiency'))}</span>
                    <span style="font-weight:normal;">${esc(specName)}</span>
                </div>
                <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:8px 18px; padding-left:4px;">
                    ${rows}
                </div>
            </div>
          `;
        }

        // A weapon or a shield on the shelf is shown as the model it will be in
        // the party's hands, not as its icon: the same viewer the equip menu and
        // the forge mount (window.Weapon3DPreview), asked the same question
        // through modelFor so a shield -- which is drawn through the weapon
        // pipeline rather than having a model of its own -- is not missed.
        // Anything else, and anything on a machine with no three.js, keeps the
        // icon header it always had.
        const previewModel = window.Weapon3DPreview
          ? safe("preview model", () => window.Weapon3DPreview.modelFor(selectedItem), null)
          : null;
        this._pendingPreviewModel = previewModel;
        const previewHTML = previewModel
          ? `<div class="weapon-previews-container">
               <div class="weapon-preview-card weapon-preview-card--single">
                 <canvas id="shop-preview-canvas" width="260" height="240"></canvas>
               </div>
             </div>`
          : "";

        detailViewport.innerHTML = `
          <div class="detail-scroll" style="flex: 1; min-height: 0; display: flex; flex-direction: column; overflow-y: auto;">
              <div class="detail-header">
                  <div class="item-card-icon" style="${this.getIconStyle(selectedItem.iconIndex)} scale: 1.25;"></div>
                  <div class="detail-info">
                      <span class="detail-name">${esc(itemName(selectedItem))}</span>
                  </div>
              </div>

              ${previewHTML}

              <div class="detail-spec-grid">
                  <div class="detail-spec-badge">
                      <span class="badge-lbl">${esc(T('Shop.ui.type'))}</span>
                      <span class="badge-val">${esc(category)}</span>
                  </div>
                  <div class="detail-spec-badge">
                      <span class="badge-lbl">${esc(T('Shop.ui.weight'))}</span>
                      <span class="badge-val">${esc(weight)}</span>
                  </div>
                  ${countBadgesHTML}
                  ${scaleBadgeHTML}
                  ${damageTypeBadgeHTML}
                  ${slotBadgeHTML}
              </div>

              ${priceSectionHTML}
              ${descHTML}
              ${combatSectionHTML}
              ${nutritionSectionHTML}
              ${needsSectionHTML}
              ${effectsSectionHTML}
              ${proficiencyHTML}
          </div>

          <div class="action-btn confirm" id="right-action-btn" style="margin-top: 10px; font-size: 19px; padding: 12px 6px; flex-shrink: 0; flex: none;">
              ${esc(actionLabel)}
          </div>
        `;

        // Mounted after innerHTML rather than before it: the viewer measures the
        // canvas to size its viewport, and a canvas that is not in the document
        // yet measures zero.
        this.mountShopWeaponPreview();

        // Bind BUY/SELL action button
        const actBtn = detailViewport.querySelector("#right-action-btn");
        if (actBtn) {
          actBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (SceneManager._scene !== this || !this.isShopReady()) return;
            safe("action button", () => {
              if (bulkDeal) {
                this.settleCart(isBuyMode);
                return;
              }
              const win = isBuyMode ? this._buyWindow : this._sellWindow;
              win.processOk();
            }, null);
          });
        }
      } else {
        detailViewport.innerHTML = "";
      }
    }

    // 8. Update Quantity Modal Overlay
    const modalViewport = container.querySelector("#modal-viewport");
    if (!modalViewport) return;

    const numberWindow = this._numberWindow;
    const modalActive = numberWindow.active;
    const modalNum = modalActive ? numberWindow.number() : 0;
    const modalMax = modalActive ? numberWindow.max() : 0;
    const unitPrice = Number.isFinite(numberWindow._price) ? numberWindow._price : 0;

    const modalStateChanged = this._renderedQuantityActive !== modalActive || this._renderedQuantityMax !== modalMax;

    if (!modalStateChanged && this._renderedQuantityNumber !== modalNum) {
      this._renderedQuantityNumber = modalNum;
      const qtyDisplay = modalViewport.querySelector(".qty-val-display");
      if (qtyDisplay) qtyDisplay.textContent = modalNum;
      const totalDisplay = modalViewport.querySelector(".card-val");
      if (totalDisplay) totalDisplay.textContent = money(modalNum * unitPrice) + " €";
    } else if (modalStateChanged) {
      this._renderedQuantityActive = modalActive;
      this._renderedQuantityNumber = modalNum;
      this._renderedQuantityMax = modalMax;

      // A modal with nothing to price is not a modal: the number window can be
      // active with its item already gone (a stock refresh mid-purchase).
      if (modalActive && numberWindow._item) {
        const numItem = numberWindow._item;
        const totalCost = modalNum * unitPrice;

        // When the quantity modal is open, the buy window is deactivated
        // (the number window is active instead), so _buyWindow.active is
        // unreliable here. Use the command window's selection to detect mode.
        const isModalBuyMode = this._commandWindow.currentSymbol() === "buy";

        const promptTitle = isModalBuyMode ? T('Shop.buy') : T('Shop.sell');
        const subLabel = isModalBuyMode ? T('Shop.totalCost') : T('Shop.sellValue');

        modalViewport.innerHTML = `
          <div class="modal-overlay">
              <div class="quantity-box">
                  <h3 class="quantity-title">${esc(promptTitle)}</h3>
                  <div style="font-weight:bold; font-size:17px; color:var(--text-success-active); margin-bottom:10px;">${esc(itemName(numItem))}</div>

                  <div class="quantity-slider-row">
                      <div class="qty-arrow" id="qty-dec">－</div>
                      <div class="qty-val-display">${modalNum}</div>
                      <div class="qty-arrow" id="qty-inc">＋</div>
                  </div>

                  <div style="font-size:15px; color:var(--text-info); margin-bottom:14px;">${esc(T('Shop.max'))} ${modalMax}</div>

                  <div style="padding-top:12px; margin-top:14px;">
                      <div class="card-lbl">${esc(subLabel)}</div>
                      <div class="card-val" style="font-size:24px; color:${isModalBuyMode ? 'var(--text-cost-bad)' : 'var(--text-cost-ok)'};">${money(totalCost)} €</div>
                  </div>

                  <div class="quantity-actions">
                      <div class="action-btn confirm" id="qty-confirm">${esc(T('Shop.confirmTransaction'))}</div>
                      <div class="action-btn cancel" id="qty-cancel">${esc(T('Shop.cancel'))}</div>
                  </div>
              </div>
          </div>
        `;

        const onModalClick = (selector, handler) => {
          const node = modalViewport.querySelector(selector);
          if (!node) {
            warnOnce("missing element " + selector, null);
            return;
          }
          node.addEventListener("click", (e) => {
            e.stopPropagation();
            if (SceneManager._scene !== this || !this.isShopReady()) return;
            if (!this._numberWindow.active) return;
            safe("click " + selector, () => handler(this._numberWindow), null);
          });
        };

        // Click Arrow inc, partial update only, no full redraw
        onModalClick("#qty-inc", (w) => {
          if (w.number() < w.max()) {
            w.changeNumber(1);
            SoundManager.playCursor();
            this._updateQuantityModalNumber();
          }
        });

        // Click Arrow dec, partial update only, no full redraw.
        // Pressing minus at 1 wraps to the maximum available quantity.
        onModalClick("#qty-dec", (w) => {
          if (w.number() > 1) {
            w.changeNumber(-1);
          } else {
            w.changeNumber(w.max() - w.number());
          }
          SoundManager.playCursor();
          this._updateQuantityModalNumber();
        });

        onModalClick("#qty-confirm", (w) => {
          w.processOk();
          this.refreshUIShop();
        });

        onModalClick("#qty-cancel", (w) => {
          w.processCancel();
          this.refreshUIShop();
        });
      } else {
        modalViewport.innerHTML = "";
      }
    }
  };

  // The strip above the list, on either side of the counter: a hint while
  // nothing is picked, and otherwise what is on the counter plus the one press
  // that settles the lot.
  Scene_Shop.prototype.renderShopCartBar = function (bar, isBuyMode) {
    const totals = this.cartTotals(isBuyMode);

    bar.innerHTML = totals.lines === 0
      ? ``
      : `
      <div class="shop-selection-bar">
          <div class="selection-summary">
              <span class="selection-count">${esc(T('Shop.selectionCount', { units: totals.units }))}</span>
              <span class="selection-value ${isBuyMode ? 'cost' : ''}">${money(totals.value)} €</span>
          </div>
          <div class="selection-actions">
              <div class="action-btn confirm" id="settle-cart-btn">${esc(T(isBuyMode ? 'Shop.buySelected' : 'Shop.sellSelected', { lines: totals.lines }))}</div>
              <div class="action-btn cancel" id="clear-selection-btn">${esc(T('Shop.clearSelection'))}</div>
          </div>
      </div>
    `;

    const onBarClick = (selector, handler) => {
      const node = bar.querySelector(selector);
      if (!node) return;
      node.addEventListener("click", (e) => {
        e.stopPropagation();
        if (SceneManager._scene !== this || !this.isShopReady()) return;
        safe("click " + selector, () => handler(), null);
      });
    };

    onBarClick("#settle-cart-btn", () => this.settleCart(isBuyMode));
    onBarClick("#clear-selection-btn", () => {
      this.clearCart(isBuyMode);
      SoundManager.playCancel();
      this.refreshUIShop();
    });
  };

  Scene_Shop.prototype.refreshUIShop = function () {
    this._lastShopStateHash = null;
    this._renderedIsBuyMode = null;
    this._renderedChipHash = null;
    this._renderedGold = null;
    this._renderedListLength = null;
    this._renderedStockHash = null;
    this._renderedOwnedHash = null;
    this._renderedSelHash = null;
    this._renderedSelectedIndex = null;
    this._renderedDetailItem = null;
    this._renderedQuantityActive = null;
    this._renderedQuantityNumber = null;
    this._renderedQuantityMax = null;
    this.syncUIShopState();
  };

  Scene_Shop.prototype._updateQuantityModalNumber = function () {
    const container = this.shopContainer();
    if (!container || !this._numberWindow) return;
    const modalViewport = container.querySelector("#modal-viewport");
    if (!modalViewport) return;
    const modalNum = this._numberWindow.number();
    const price = Number.isFinite(this._numberWindow._price) ? this._numberWindow._price : 0;
    const qtyDisplay = modalViewport.querySelector(".qty-val-display");
    if (qtyDisplay) qtyDisplay.textContent = modalNum;
    const totalDisplay = modalViewport.querySelector(".card-val");
    if (totalDisplay) totalDisplay.textContent = money(modalNum * price) + " €";
    this._renderedQuantityNumber = modalNum;
  };

  Scene_Shop.prototype.getIconStyle = function (iconIndex) {
    const iconSize = 32;
    const cols = 16;
    const index = Number.isFinite(iconIndex) && iconIndex >= 0 ? Math.floor(iconIndex) : 0;
    const x = (index % cols) * iconSize;
    const y = Math.floor(index / cols) * iconSize;
    return `background: url('img/system/IconSet.png') -${x}px -${y}px no-repeat; width: 32px; height: 32px; image-rendering: pixelated; display: inline-block;`;
  };


  //=============================================================================
  // Override Window_ShopBuy draw items & draws
  //=============================================================================

  Window_ShopBuy.prototype.drawItem = function (index) {
    const item = this.itemAt(index);
    if (!item) return;
    const priceValue = this.price(item);
    const rect = this.itemLineRect(index);
    const scene = SceneManager._scene;
    const stock = (scene instanceof Scene_Shop) ? scene.getStock(item) : UNLIMITED_STOCK;
    const stockText = stock === UNLIMITED_STOCK ? "" : "x" + stock;

    const unit = $dataSystem.currencyUnit;
    const priceDisplay = this.formatMoneyValue(priceValue) + unit;
    const priceWidth = 120;
    const stockWidth = 60;
    const nameWidth = rect.width - priceWidth - stockWidth - this.itemPadding() * 2;

    this.changePaintOpacity(this.isEnabled(item));

    // The name is passed in, never written onto the item: assigning to
    // item.name edits the shared $dataItems/$dataWeapons entry, and any throw
    // between the two assignments left the truncated name in the database for
    // the rest of the session.
    const localized = itemName(item);
    const displayName = this.truncateItemName ? this.truncateItemName(localized) : localized;
    this.drawItemName(item, rect.x, rect.y, nameWidth, displayName);

    this.drawText(priceDisplay, rect.x + rect.width - priceWidth - stockWidth - 10, rect.y, priceWidth, "right");

    if (stockText) {
      this.changeTextColor(ColorManager.systemColor());
      this.drawText(stockText, rect.x + rect.width - stockWidth, rect.y, stockWidth, "right");
      this.resetTextColor();
    }

    this.changePaintOpacity(true);
  };

  Window_ShopBuy.prototype.drawItemName = function (item, x, y, width, displayName) {
    if (item) {
      const iconY = y + (this.lineHeight() - ImageManager.iconHeight) / 2;
      const textMargin = ImageManager.iconWidth + 4;
      const itemWidth = width || this.innerWidth - textMargin;

      this.resetTextColor();
      this.drawIcon(item.iconIndex || 0, x, iconY);
      this.changeTextColor(rarityColor(item));
      this.drawText(displayName || item.name || "", x + textMargin, y, itemWidth);
      this.resetTextColor();
    }
  };

  //=============================================================================
  // Override Sell Window
  //=============================================================================

  // A key item is never merchandise: it is quest property. It is kept out of
  // the sell list entirely (includes) and refused if anything else manages to
  // put it in front of the till (isEnabled, sellSelection, doSell).
  const isKeyItem = (item) => !!(item && DataManager.isItem(item) && item.itypeId === 2);

  // Em's vector gun is never merchandise: VectorGunSystem.js is the one place
  // that is decided, here and at every other counter it could leave by.
  const isBoundGear = (item) => !!(window.VectorGun && window.VectorGun.isBound(item));

  const _Window_ShopSell_isEnabled = Window_ShopSell.prototype.isEnabled;
  Window_ShopSell.prototype.isEnabled = function (item) {
    if (isKeyItem(item) || isBoundGear(item)) return false;
    return _Window_ShopSell_isEnabled.call(this, item);
  };

  // What the sell list holds is decided by the chip row above it rather than by
  // the engine's item/weapon/armour tabs: the shop reads the party's own
  // categories, which are finer than the three types and are the same ones the
  // list groups itself under. Key items are never merchandise whatever is lit.
  const _Window_ShopSell_includes = Window_ShopSell.prototype.includes;
  Window_ShopSell.prototype.includes = function (item) {
    if (isKeyItem(item) || isBoundGear(item)) return false;
    const scene = SceneManager._scene;
    if (!(scene instanceof Scene_Shop) || typeof scene.passesShopCategory !== "function") {
      return _Window_ShopSell_includes.call(this, item);
    }
    return isShopSellType(item) && scene.passesShopCategory(item, false);
  };

  Window_ShopSell.prototype.maxCols = function () {
    return 1;
  };

  Window_ShopSell.prototype.itemHeight = function () {
    return this.lineHeight();
  };

  Window_ShopSell.prototype.drawItem = function (index) {
    const item = this.itemAt(index);
    if (!item) return;
    const rect = this.itemLineRect(index);
    const x = rect.x + this.itemPadding();
    const y = rect.y;
    const width = rect.width - this.itemPadding() * 2;

    const priceWidth = 120;
    const priceText = this.formatMoneyValue(finalSellPrice(item)) + " €";

    const nameWidth = width - priceWidth - 10;
    this.changePaintOpacity(this.isEnabled(item));
    // The widest item name the price column leaves room for, in characters.
    const maxNameLength = 18;
    // Localize before cutting: the name is measured and clipped in the
    // language it is shown in, and a name shortened first would reach the
    // draw hook as a fragment matching no translation at all.
    const localized = itemName(item);
    const displayName = safe("truncate", () => utils.truncateTextWithEllipsis(localized, maxNameLength), localized);
    this.drawItemName(item, x, y, nameWidth, displayName);
    this.changePaintOpacity(true);

    this.drawText(priceText, x + width - priceWidth, y, priceWidth, 'right');

    const grams = weightOf(item);
    if (grams > 1) {
      const weightStr = formatWeight(grams);
      const weightY = y + this.lineHeight();
      const weightWidth = 100;
      this.drawText(weightStr, x + width - weightWidth, weightY, weightWidth, 'right');
    }

    this.changePaintOpacity(true);
  };

  Window_ShopSell.prototype.drawItemName = function (item, x, y, width, displayName) {
    if (item) {
      const iconY = y + (this.lineHeight() - ImageManager.iconHeight) / 2;
      const textMargin = ImageManager.iconWidth + 4;
      const itemWidth = Math.max(0, width - textMargin);
      this.resetTextColor();
      this.drawIcon(item.iconIndex || 0, x, iconY);
      this.changeTextColor(rarityColor(item));
      this.drawText(displayName || item.name || "", x + textMargin, y, itemWidth);
      this.resetTextColor();
    }
  };

  const _Scene_Shop_sellWindowRect = Scene_Shop.prototype.sellWindowRect;
  Scene_Shop.prototype.sellWindowRect = function () {
    const rect = _Scene_Shop_sellWindowRect.call(this);
    return rect;
  };

  window.Window_ItemDetail = Window_ItemDetail;

  // Remove Cancel from command window
  Window_ShopCommand.prototype.makeCommandList = function () {
    this.addCommand(TextManager.buy, "buy");
    this.addCommand(TextManager.sell, "sell");
  };

  Window_ShopCommand.prototype.maxCols = function () {
    return 2;
  };

  Window_ShopCommand.prototype.processTouch = function () {
    if (this.isOpen()) {
      const hitIndex = this.hitIndex();
      if (hitIndex >= 0) {
        if (TouchInput.isHovered()) {
          this.select(hitIndex);
        }
        if (TouchInput.isTriggered()) {
          this.select(hitIndex);
          this.processOk();
        }
      }
    }
  };

  const _Scene_Shop_start = Scene_Shop.prototype.start;
  Scene_Shop.prototype.start = function () {
    _Scene_Shop_start.call(this);
    if (!this.isShopReady()) return;
    // A counter open to the public can decline the public. Checked on the way
    // in rather than at the till, so the party is turned away at the door the
    // way they would be in life, and told which of the two reasons it is.
    const refusal = serviceRefusal();
    if (refusal) {
      if (window.ParchmentToast) {
        window.ParchmentToast.show(T('Shop.refused.' + refusal), {
          title: T('Shop.refused.title'), duration: 240,
        });
      }
      SoundManager.playBuzzer();
      this.closeShop();
      return;
    }
    // The command window is the tab bar the overlay draws for itself, so it is
    // never given focus: the shop opens straight onto the buy list.
    this._commandWindow.deactivate();
    this._commandWindow.select(0);
    this.commandBuy();
  };

  // Both lists sit under a chip row, and both are walked the same way: up off
  // the top line puts the cursor on the chips, left and right step along them,
  // and down comes back into the list. These four are written once and bound to
  // each window, because the only thing that differs is which side of the
  // counter is being filtered.
  const chipCursorLeft = function (buying) {
    const scene = SceneManager._scene;
    if (!(scene instanceof Scene_Shop) || !scene.isShopReady()) return;
    const win = buying ? scene._buyWindow : scene._sellWindow;
    if (!scene._chipFocus) {
      scene._chipFocus = true;
      win.select(-1);
      SoundManager.playCursor();
      scene.refreshUIShop();
      return;
    }
    if (scene.stepShopCategoryChip(-1, buying)) SoundManager.playCursor();
    else if (!buying) scene.switchToBuy();
  };

  const chipCursorRight = function (buying) {
    const scene = SceneManager._scene;
    if (!(scene instanceof Scene_Shop) || !scene.isShopReady()) return;
    if (scene._chipFocus) {
      if (scene.stepShopCategoryChip(1, buying)) SoundManager.playCursor();
      return;
    }
    // Off the right of the buy list is how the sell side is reached.
    if (buying) scene.switchToSell();
  };

  const chipCursorDown = function (win, wrap) {
    const scene = SceneManager._scene;
    if (scene instanceof Scene_Shop && scene._chipFocus) {
      if (win.maxItems() > 0) {
        scene._chipFocus = false;
        win.select(0);
        SoundManager.playCursor();
        scene.refreshUIShop();
      }
      return;
    }
    Window_Selectable.prototype.cursorDown.call(win, wrap);
  };

  const chipCursorUp = function (win, wrap) {
    const scene = SceneManager._scene;
    if (scene instanceof Scene_Shop && !scene._chipFocus && win.index() <= 0) {
      scene._chipFocus = true;
      win.select(-1);
      SoundManager.playCursor();
      scene.refreshUIShop();
      return;
    }
    Window_Selectable.prototype.cursorUp.call(win, wrap);
  };

  Window_ShopBuy.prototype.cursorLeft = function () { chipCursorLeft(true); };
  Window_ShopBuy.prototype.cursorRight = function () { chipCursorRight(true); };
  Window_ShopBuy.prototype.cursorDown = function (wrap) { chipCursorDown(this, wrap); };
  Window_ShopBuy.prototype.cursorUp = function (wrap) { chipCursorUp(this, wrap); };

  Window_ShopBuy.prototype.cursorPagedown = function () {
    if (SceneManager._scene instanceof Scene_Shop) {
      SoundManager.playCursor();
      SceneManager._scene.switchToSell();
    }
  };

  Window_ShopBuy.prototype.cursorPageup = function () {};

  Window_ShopSell.prototype.cursorLeft = function () { chipCursorLeft(false); };
  Window_ShopSell.prototype.cursorRight = function () { chipCursorRight(false); };
  Window_ShopSell.prototype.cursorDown = function (wrap) { chipCursorDown(this, wrap); };
  Window_ShopSell.prototype.cursorUp = function (wrap) { chipCursorUp(this, wrap); };

  Window_ShopSell.prototype.cursorPageup = function () {
    if (SceneManager._scene instanceof Scene_Shop) {
      SoundManager.playCursor();
      SceneManager._scene.switchToBuy();
    }
  };

  Window_ShopSell.prototype.cursorPagedown = function () {};

  const _Window_ItemCategory_cursorLeft = Window_ItemCategory.prototype.cursorLeft;
  Window_ItemCategory.prototype.cursorLeft = function (wrap) {
    if (this.index() === 0 && SceneManager._scene instanceof Scene_Shop) {
      SceneManager._scene.switchToBuy();
    } else {
      _Window_ItemCategory_cursorLeft.call(this, wrap);
    }
  };

  Scene_Shop.prototype.switchToSell = function () {
    if (!this.isShopReady()) return;
    this._buyWindow.hide();
    this._buyWindow.deactivate();
    this._commandWindow.select(1);
    this.commandSell();
    this._categoryWindow.deactivate();
    this._chipFocus = true;
    this._sellWindow.activate();
    this._sellWindow.setCategory(this._categoryWindow.currentSymbol());
    this._sellWindow.refresh();
    this._sellWindow.select(-1);
    this.refreshUIShop();
  };

  Scene_Shop.prototype.switchToBuy = function () {
    if (!this.isShopReady()) return;
    this._categoryWindow.hide();
    this._categoryWindow.deactivate();
    this._sellWindow.hide();
    this._sellWindow.deactivate();
    this._chipFocus = false;
    this._commandWindow.select(0);
    this.commandBuy();
    this.refreshUIShop();
  };

  // Cancelling out of any of the three lists leaves the shop, through the one
  // guarded exit so a cancel that arrives twice in a frame only pops once. The
  // buy and sell lists take a counter into account first, further down.
  Scene_Shop.prototype.onCategoryCancel = function () {
    this.closeShop();
  };

  //=============================================================================
  // Shop Stock System
  //=============================================================================

  // ── The world of chaos: nobody stocks what they meant to ──────────────────
  // A chaos shop keeps the SHAPE of the counter it was written as (as many
  // rows, sold on the same terms) and none of its contents: every row is drawn
  // from the whole catalogue. The draw is seeded from the world and the shop's
  // own map and event, so a counter holds the same odd assortment every time
  // the player walks back into it, and the stock records that hang off those
  // rows stay meaningful.
  let chaosShelf = null;
  function chaosShelfPool() {
    if (chaosShelf) return chaosShelf;
    chaosShelf = [];
    const tables = [[0, $dataItems], [1, $dataWeapons], [2, $dataArmors]];
    for (const [type, table] of tables) {
      if (!table) continue;
      for (let i = 1; i < table.length; i++) {
        const data = table[i];
        if (!data || !data.name || !data.price) continue;
        chaosShelf.push([type, i]);
      }
    }
    return chaosShelf;
  }

  function chaosGoods(goods, mapId, eventId) {
    const CW = window.ChaosWorld;
    if (!CW || !CW.active() || !Array.isArray(goods) || !goods.length) return goods;
    const pool = chaosShelfPool();
    if (!pool.length) return goods;
    const shop = "shop:" + mapId + ":" + eventId + ":";
    return goods.map((row, i) => {
      if (!Array.isArray(row)) return row;
      const [type, id] = pool[Math.floor(CW.roll(shop + i) * pool.length) % pool.length];
      // Rows 2 and 3 are the price rule (0 = use the item's own price), which
      // is the counter's terms rather than its contents: they are kept.
      return [type, id, row[2], row[3]];
    });
  }

  const _Scene_Shop_prepare = Scene_Shop.prototype.prepare;
  Scene_Shop.prototype.prepare = function (goods, purchaseOnly) {
    const mapId = $gameMap ? $gameMap.mapId() : 0;
    const eventId = ($gameMap && $gameMap._interpreter) ? $gameMap._interpreter.eventId() : 0;
    _Scene_Shop_prepare.call(this, chaosGoods(goods, mapId, eventId), purchaseOnly);
    // A shop pushed straight from a plugin (an NPC trade, the daily shop) has no
    // event behind it, and then it simply keeps no stock record.
    this._shopMapId = $gameMap ? $gameMap.mapId() : 0;
    this._shopEventId = ($gameMap && $gameMap._interpreter) ? $gameMap._interpreter.eventId() : 0;
  };

  // A shop that keeps no stock record sells without limit.
  const UNLIMITED_STOCK = 999;

  // ===========================================================================
  //  Consignment: the only collectibles a counter ever has
  // ---------------------------------------------------------------------------
  //  Nobody orders keepsakes in. A collectible reaches a shelf exactly one way:
  //  the party sold it over that counter, and it sits there afterwards for
  //  whoever wants to buy it back at the same flat price. The record is kept
  //  per shop and NOT on the daily stock roll, so a thing left on consignment
  //  is still there next week.
  // ===========================================================================

  const consignStore = (create) => {
    if (typeof $gameSystem === "undefined" || !$gameSystem) return null;
    if (!$gameSystem._shopConsign) {
      if (!create) return null;
      $gameSystem._shopConsign = {};
    }
    return $gameSystem._shopConsign;
  };

  // The counter the scene is standing at, as a place in that record.
  const consignShelf = (scene, create) => {
    const s = scene || SceneManager._scene;
    if (!(s instanceof Scene_Shop) || !s._shopMapId || !s._shopEventId) return null;
    const store = consignStore(create);
    if (!store) return null;
    const map = String(s._shopMapId);
    const ev = String(s._shopEventId);
    if (!store[map]) {
      if (!create) return null;
      store[map] = {};
    }
    if (!store[map][ev]) {
      if (!create) return null;
      store[map][ev] = {};
    }
    return store[map][ev];
  };

  // How many copies of one thing this counter is holding on consignment.
  const consignedCount = (item, scene) => {
    const shelf = consignShelf(scene, false);
    const key = shelf ? getStockKey(item) : null;
    const n = key ? shelf[key] : 0;
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  };

  // Everything left over this counter, as database rows.
  const consignedItems = (scene) => {
    const shelf = consignShelf(scene, false);
    if (!shelf) return [];
    const rows = [];
    for (const key of Object.keys(shelf)) {
      if (!(shelf[key] > 0)) continue;
      const id = Number(key.slice(2));
      const table = key[0] === "w" ? $dataWeapons : key[0] === "a" ? $dataArmors : $dataItems;
      const item = table && table[id];
      if (item) rows.push(item);
    }
    return rows;
  };

  const addConsignment = (item, amount, scene) => {
    const shelf = consignShelf(scene, true);
    const key = shelf ? getStockKey(item) : null;
    if (!key || !(amount > 0)) return;
    shelf[key] = (Number.isFinite(shelf[key]) ? shelf[key] : 0) + amount;
  };

  const takeConsignment = (item, amount, scene) => {
    const shelf = consignShelf(scene, false);
    const key = shelf ? getStockKey(item) : null;
    if (!key || !Number.isFinite(shelf[key])) return;
    shelf[key] = Math.max(0, shelf[key] - amount);
    if (shelf[key] <= 0) delete shelf[key];
  };

  // What is left of a normal day's run once nobody outside is left to supply
  // it. The shelf still turns over on the same daily key as any other world
  // (see getShopDateKey), there is just far less on it each time it does.
  const ZOMBIE_STOCK_FACTOR = 0.2;

  const getStockKey = (item) => {
    if (!item) return null;
    if (DataManager.isItem(item)) return "i_" + item.id;
    if (DataManager.isWeapon(item)) return "w_" + item.id;
    if (DataManager.isArmor(item)) return "a_" + item.id;
    return "u_" + item.id;
  };

  // Stock is re-rolled whenever this key changes, which is once a day. An
  // empty world answers a constant instead: nobody is left to order more, so a
  // counter is stocked with whatever was on it the day everyone went and is
  // never restocked again. What is taken off it (bought, or stolen through
  // StealingSystem) is gone for good.
  const getShopDateKey = (mapId, eventId) => {
    const WM = window.WorldManager;
    if (WM && typeof WM.isEmptyWorld === "function" && WM.isEmptyWorld()) {
      return "EMPTYWORLD";
    }
    // A zombie world's abandoned tills (a fifth of them, see
    // ShopShiftManager.isAbandonedCounter) are read the same way: nobody is left
    // to order anything in for that counter, so it keeps whatever was on it
    // the day the dead got up and is never restocked. The counters still
    // trading, manned for one daytime shift, restock daily like any other.
    if (window.NPCSim?.ShopShiftManager?.isAbandonedCounter?.(mapId, eventId)) {
      return "ABANDONEDSHOP";
    }
    // Var 113 may hold a number; coerce to string before substring or it throws.
    const dateStr = String($gameVariables.value(113) || "");
    return dateStr.substring(0, 11);
  };

  Scene_Shop.prototype.initStock = function () {
    if (!this._shopMapId || !this._shopEventId) return;

    if (!$gameSystem._shopStocks) $gameSystem._shopStocks = {};
    const stocks = $gameSystem._shopStocks;
    const mapId = this._shopMapId;
    const eventId = this._shopEventId;
    const dateKey = getShopDateKey(mapId, eventId);

    if (!stocks[mapId]) stocks[mapId] = {};
    if (!stocks[mapId][eventId]) stocks[mapId][eventId] = { date: "" };

    if (stocks[mapId][eventId].date !== dateKey) {
      stocks[mapId][eventId] = { date: dateKey, oilFactor: 1.0, soulFactor: 1.0 };
      const newShopData = stocks[mapId][eventId];

      // The market only moves prices when it is a live StockMarketSystem
      // instance. A save written without that plugin restores a plain object
      // with no methods on it, and asking that object for a price threw before
      // the shop had drawn a single item.
      const market = $gameSystem.stockMarket;
      if (market && typeof market.getOilPrice === "function" && typeof market.getSoulsPrice === "function") {
        safe("market factors", () => {
          const smParams = PluginManager.parameters("StockMarketSystem");
          const initOil = Number(smParams["Initial Oil Price"]) || 30000;
          const initSoul = Number(smParams["Initial SOUL Price"]) || 66666;

          const currentOil = Number(market.getOilPrice());
          const currentSoul = Number(market.getSoulsPrice());
          if (!Number.isFinite(currentOil) || !Number.isFinite(currentSoul)) return;

          const maxOil = 80000;
          const minOil = 3000;
          let oilFactor = 1.0;
          if (currentOil >= initOil) {
            oilFactor = 1.0 + ((currentOil - initOil) / (maxOil - initOil)) * 2.0;
          } else {
            oilFactor = 1.0 - ((initOil - currentOil) / (initOil - minOil)) * 0.5;
          }
          // A crash takes half off the sticker price and a squeeze trebles it.
          // The floor is deliberate: goods really do go to 50% off in a world
          // where the price of oil has collapsed.
          newShopData.oilFactor = Math.max(MARKET_FLOOR, Math.min(MARKET_CEIL, oilFactor));
          newShopData.soulFactor = Math.max(MARKET_FLOOR, Math.min(MARKET_CEIL, currentSoul / initSoul));
        }, null);
      }

    }

    // Every row on the shelf is counted, whatever put the record there. The
    // roll used to happen only on the day the record was made, so a counter
    // whose stock had already been opened by a shoplifter (window.ShopStock,
    // which seeds a record without ever showing the shop) came back with
    // numbers for the lifted rows alone and unlimited stock for the rest.
    const shopData = stocks[mapId][eventId];
    for (const goods of (this._goods || [])) {
      if (!Array.isArray(goods)) continue;
      const type = goods[0];
      const id = goods[1];
      let item = null;
      if (type === 0) item = $dataItems[id];
      else if (type === 1) item = $dataWeapons[id];
      else if (type === 2) item = $dataArmors[id];

      const key = getStockKey(item);
      if (key && !Number.isFinite(shopData[key])) shopData[key] = rollStock(item);
    }
  };

  // How deep a shelf is stocked with one thing. A plain function so any
  // counter can be stocked without a Scene_Shop standing open.
  const rollStock = function (item) {
    const price = (item && Number.isFinite(item.price)) ? item.price : 0;
    // A course of medicine is taken once a day for a week or more, so a shelf
    // holding two of them is a shelf holding none. Anything carrying the
    // disease system's <Medicine:> note is stocked several deep.
    const isMedicine = !!(item && item.note && /<Medicine:\s*[\w-]+\s*>/i.test(item.note));
    let base = 20;
    if (price >= 1000) base = 12;
    if (price >= 5000) base = 8;
    if (price >= 20000) base = 4;
    if (price >= 50000) base = 2;
    if (price >= 100000) base = 1;
    if (isMedicine) base = Math.max(base, Math.min(30, Math.round(base * 3) + 6));
    const WM = window.WorldManager;
    if (WM && typeof WM.isZombieWorld === "function" && WM.isZombieWorld()) {
      base = Math.max(1, Math.round(base * ZOMBIE_STOCK_FACTOR));
    }
    return Math.floor(Math.random() * base) + 1;
  };

  Scene_Shop.prototype.generateRandomStock = function (item) {
    return rollStock(item);
  };

  Scene_Shop.prototype.getStock = function (item) {
    // A collectible is never restocked: what is there is what was left there.
    if (fixedPrice(item) !== null) return consignedCount(item, this);
    const shopData = currentShopData(this);
    if (!shopData) return UNLIMITED_STOCK;
    const key = getStockKey(item);
    if (!key) return UNLIMITED_STOCK;
    const stock = shopData[key];
    return Number.isFinite(stock) ? stock : UNLIMITED_STOCK;
  };

  Scene_Shop.prototype.reduceStock = function (item, amount) {
    if (fixedPrice(item) !== null) { takeConsignment(item, amount, this); return; }
    const shopData = currentShopData(this);
    if (!shopData) return;
    const key = getStockKey(item);
    if (!key || !Number.isFinite(shopData[key])) return;
    shopData[key] = Math.max(0, shopData[key] - amount);
  };

  // ===========================================================================
  //  window.ShopStock, what is left on a counter, for anyone who is not the
  //  counter itself
  // ---------------------------------------------------------------------------
  //  A shelf used to be counted only while its shop stood open, so a thief
  //  working a counter he never opened took off a shelf that was never written
  //  down and could take the same thing forever. The record is the same one
  //  Scene_Shop keeps ($gameSystem._shopStocks[mapId][eventId], per day, world
  //  shared through WorldManager), it is simply reachable now without a scene:
  //  ask for a row and it is rolled on the spot the first time, and what is
  //  taken off it is taken off the shop's own numbers.
  // ===========================================================================
  const UNLIMITED = UNLIMITED_STOCK;

  const stockRecord = function (mapId, eventId, create) {
    if (!mapId || !eventId || !$gameSystem) return null;
    const stocks = $gameSystem._shopStocks || (create ? ($gameSystem._shopStocks = {}) : null);
    if (!stocks) return null;
    if (!stocks[mapId]) {
      if (!create) return null;
      stocks[mapId] = {};
    }
    const dateKey = getShopDateKey(mapId, eventId);
    let record = stocks[mapId][eventId];
    if (!record) {
      if (!create) return null;
      record = stocks[mapId][eventId] = { date: dateKey, oilFactor: 1.0, soulFactor: 1.0 };
    }
    // A record left over from another day is a record of nothing: the counter
    // has been restocked since, so it starts again empty of numbers.
    if (record.date !== dateKey) {
      record = stocks[mapId][eventId] = { date: dateKey, oilFactor: 1.0, soulFactor: 1.0 };
    }
    return record;
  };

  window.ShopStock = {
    UNLIMITED,
    key: getStockKey,
    record: (mapId, eventId) => stockRecord(mapId, eventId, false),

    // What is left of one thing on one counter, rolling the shelf the first
    // time anyone asks. Anything with no key at all (a plugin-made row) is
    // reported as unlimited rather than as nothing.
    get(mapId, eventId, item) {
      const key = getStockKey(item);
      if (!key) return UNLIMITED;
      const record = stockRecord(mapId, eventId, true);
      if (!record) return UNLIMITED;
      if (!Number.isFinite(record[key])) record[key] = rollStock(item);
      return record[key];
    },

    // Take amount off the counter and answer with what is left. A counter that
    // keeps no record (no map or event behind it) is left alone.
    reduce(mapId, eventId, item, amount) {
      const key = getStockKey(item);
      if (!key) return UNLIMITED;
      const record = stockRecord(mapId, eventId, true);
      if (!record) return UNLIMITED;
      const left = Number.isFinite(record[key]) ? record[key] : rollStock(item);
      record[key] = Math.max(0, left - (Number.isFinite(amount) ? amount : 1));
      return record[key];
    }
  };

  // Trading is a skill like any other. Haggling (127) cuts what the party pays,
  // Appraising (496) raises what it is paid, and both train on the value of the
  // deal (see window.SpecializationXP). The rates are deliberately lopsided:
  // selling already returns only 10% of an item's price, so even Master
  // Appraising against Master Haggling leaves resale well under cost. Do not
  // widen them without re-checking that, or the shop becomes a money printer.
  const HAGGLE_PER_LEVEL = 0.05;   // up to -20% on the price paid
  const HAGGLE_FLOOR = 0.75;
  const APPRAISE_PER_LEVEL = 0.10; // up to +40% on the price received

  // A factor that came back missing or nonsensical must not silently scale a
  // price to zero or NaN.
  const sanePositive = (value, fallback) =>
    (Number.isFinite(value) && value > 0) ? value : fallback;

  function haggleFactor() {
    const xp = window.SpecializationXP;
    if (!xp || typeof xp.discount !== "function") return 1;
    return sanePositive(safe("haggleFactor", () => xp.discount('Haggling', HAGGLE_PER_LEVEL, HAGGLE_FLOOR), 1), 1);
  }

  function appraiseFactor() {
    const xp = window.SpecializationXP;
    if (!xp || typeof xp.multiplier !== "function") return 1;
    return sanePositive(safe("appraiseFactor", () => xp.multiplier('Appraising', APPRAISE_PER_LEVEL), 1), 1);
  }

  // What a shop pays for an item before the party's Appraising is counted: the
  // listed tenth, scaled by the NPC-trade factor. The sell cards read from this
  // too, so a card can never quote a price the till does not honour.
  const baseSellPrice = (item) => {
    const price = (item && Number.isFinite(item.price)) ? item.price : 0;
    const factor = sanePositive($gameTemp && $gameTemp._npcTradeSellFactor, 1);
    return Math.max(0, Math.floor(Math.floor(price * 0.1) * factor));
  };

  Scene_Shop.prototype.sellingPrice = function () {
    if (!this._item) return 0;
    // The counter buys a collectible back for exactly what it sells it for.
    const flat = fixedPrice(this._item);
    if (flat !== null) return flat;
    // A shop buys at what the market says the thing is worth today, not at
    // what it was worth when it was written into the database.
    const market = marketFactor(currentShopData(this), this._item);
    return Math.max(1, Math.floor(baseSellPrice(this._item) * appraiseFactor() * market));
  };

  const _Scene_Shop_buyingPrice = Scene_Shop.prototype.buyingPrice;
  Scene_Shop.prototype.buyingPrice = function () {
    // Both the market factor and Haggling are already in what the shelf quotes
    // (buyUnitPrice, through Window_ShopBuy#price, which the native
    // buyingPrice reads). Applying them again here is what made the quantity
    // modal and the till ask more than the card: one factor, one place. This
    // override is now only the guard against a stale selection whose line has
    // left the list and prices at NaN.
    const price = safe("buyingPrice", () => _Scene_Shop_buyingPrice.call(this), 0);
    return Number.isFinite(price) && price > 0 ? price : 0;
  };

  // What one copy costs, for anything drawing a quote rather than taking money.
  Scene_Shop.prototype.unitBuyPrice = function (item) {
    if (!item || !this._buyWindow) return 0;
    const price = safe("unitBuyPrice", () => this._buyWindow.price(item), 0);
    return Number.isFinite(price) ? price : 0;
  };

  // Everything the detail panel needs to quote a line: what one copy is worth
  // on the side of the counter the player is standing on, what it would be
  // worth with the indices flat, and how far today's OIL or SOUL price has
  // moved it. The price is the till's own, so the panel is a quote and not an
  // estimate - a pile of n copies is exactly n times this.
  Scene_Shop.prototype.priceQuote = function (item) {
    if (!item) return null;
    const buying = this.isShopBuyMode();
    const price = buying ? this.unitBuyPrice(item) : this.unitSellPrice(item);
    if (!(price > 0)) return null;
    // A collectible has no move to report: it is quoted flat on both sides.
    const factor = fixedPrice(item) !== null ? 1 : marketFactor(currentShopData(this), item);
    return {
      buying: buying,
      price: price,
      base: Math.max(1, Math.round(price / factor)),
      percent: Math.round((factor - 1) * 100),
      soul: isSoulPriced(item)
    };
  };

  const _Scene_Shop_terminate_npcTrade = Scene_Shop.prototype.terminate;
  Scene_Shop.prototype.terminate = function () {
    _Scene_Shop_terminate_npcTrade.call(this);
    $gameTemp._npcTradeSellFactor = null;
  };

  const _Window_ShopBuy_isEnabled = Window_ShopBuy.prototype.isEnabled;
  Window_ShopBuy.prototype.isEnabled = function (item) {
    const enabled = _Window_ShopBuy_isEnabled.call(this, item);
    if (!enabled) return false;
    const scene = SceneManager._scene;
    const stock = scene instanceof Scene_Shop ? scene.getStock(item) : UNLIMITED_STOCK;
    return stock > 0;
  };

  const awardTradeXp = (spec, value) => {
    const xp = window.SpecializationXP;
    if (!xp || typeof xp.awardForValue !== "function") return;
    if (!Number.isFinite(value) || value <= 0) return;
    safe("awardForValue " + spec, () => xp.awardForValue(spec, value), null);
  };

  const _Scene_Shop_doBuy = Scene_Shop.prototype.doBuy;
  Scene_Shop.prototype.doBuy = function (number) {
    const spent = number * this.buyingPrice();
    _Scene_Shop_doBuy.call(this, number);
    this.reduceStock(this._item, number);
    // Buying the last copy takes the line off the shelf, so the cursor may now
    // be past the end of a shorter list.
    if (this._buyWindow) {
      this._buyWindow.refresh();
      const last = this._buyWindow.maxItems() - 1;
      if (this._buyWindow.index() > last) this._buyWindow.select(Math.max(0, last));
    }
    awardTradeXp('Haggling', spent);  // i18n-ignore  Specialization.json id
  };

  const _Scene_Shop_doSell = Scene_Shop.prototype.doSell;
  Scene_Shop.prototype.doSell = function (number) {
    const earned = number * this.sellingPrice();
    // What is sold over a counter stays on it: a keepsake handed in is the
    // only way one ever appears on a shelf, and it can be bought back for
    // exactly what it paid out.
    if (fixedPrice(this._item) !== null) addConsignment(this._item, number, this);
    _Scene_Shop_doSell.call(this, number);
    awardTradeXp('Appraising', earned);  // i18n-ignore  Specialization.json id
  };

  //=============================================================================
  // Selling worn equipment
  //=============================================================================
  // A shop always buys gear, whether it is in the bag or on someone's back.
  // The engine only ever offers $gameParty.allItems(), which excludes equipped
  // weapons and armors, so a player had to visit the equip menu first. Here the
  // sell list also carries what the party is wearing, and the sale unequips as
  // many copies as it needs before the items leave the inventory.

  const equipHolders = () =>
    safe("equipHolders", () => ($gameParty.allMembers ? $gameParty.allMembers() : $gameParty.members()), []) || [];

  // Every piece of gear the party is wearing, counted in one pass. Callers that
  // ask about a whole list (the sell cards, the state hash) take this map rather
  // than walking the party once per item.
  window.ItemSystemShop = window.ItemSystemShop || {};
  const wornCounts = () => {
    const counts = new Map();
    for (const actor of equipHolders()) {
      const equips = safe("actor.equips", () => actor.equips(), []) || [];
      for (const equip of equips) {
        if (equip) counts.set(equip, (counts.get(equip) || 0) + 1);
      }
    }
    return counts;
  };
  window.ItemSystemShop.wornCounts = wornCounts;

  // How many copies of an item the party is wearing right now.
  const equippedCount = (item) => {
    if (!item || DataManager.isItem(item)) return 0;
    return wornCounts().get(item) || 0;
  };
  window.ItemSystemShop.equippedCount = equippedCount;

  // What the party can actually hand over: the bag plus what it is wearing.
  const sellableCount = (item) => $gameParty.numItems(item) + equippedCount(item);
  window.ItemSystemShop.sellableCount = sellableCount;

  // Take `count` copies off whoever is wearing them. changeEquip hands the old
  // piece back to the party, so the ordinary loseItem in doSell can take it.
  // Returns how many actually came off: a locked or sealed slot refuses, and
  // counting those as sold would pay the party for gear it never handed over.
  const unequipForSale = (item, count) => {
    if (!item || count <= 0) return 0;
    let removed = 0;
    for (const actor of equipHolders()) {
      const equips = safe("actor.equips", () => actor.equips(), []) || [];
      for (let slotId = 0; slotId < equips.length && removed < count; slotId++) {
        if (equips[slotId] !== item) continue;
        safe("changeEquip", () => actor.changeEquip(slotId, null), null);
        const stillWorn = safe("actor.equips", () => actor.equips()[slotId], item);
        if (stillWorn !== item) removed++;
      }
      if (removed >= count) break;
    }
    return removed;
  };

  const _Window_ShopSell_makeItemList = Window_ShopSell.prototype.makeItemList;
  Window_ShopSell.prototype.makeItemList = function () {
    _Window_ShopSell_makeItemList.call(this);
    if (!Array.isArray(this._data)) this._data = [];
    for (const item of wornCounts().keys()) {
      if (this.includes(item) && !this._data.includes(item)) {
        this._data.push(item);
      }
    }
    // The bag is read as categories, alphabetically, with the lines inside each
    // one in name order - the same shape the shelf is read in. The overlay draws
    // a header per category off this order, so the cursor walks the page the way
    // it looks.
    this._data.sort((a, b) => {
      // A list the engine padded with a blank line keeps it at the end rather
      // than being asked for a category it has not got.
      if (!a || !b) return (a ? 0 : 1) - (b ? 0 : 1);
      const catA = categoryLabelOf(a).toLowerCase();
      const catB = categoryLabelOf(b).toLowerCase();
      if (catA !== catB) return catA.localeCompare(catB);
      return itemName(a).localeCompare(itemName(b));
    });
  };

  Scene_Shop.prototype.maxSell = function () {
    return sellableCount(this._item);
  };

  const _Scene_Shop_doSell_equipped = Scene_Shop.prototype.doSell;
  Scene_Shop.prototype.doSell = function (number) {
    const inBag = $gameParty.numItems(this._item);
    // Sell no more than the party can actually part with: what is in the bag
    // plus whatever really came off someone's back.
    const takenOff = unequipForSale(this._item, number - inBag);
    const sellable = Math.min(number, inBag + takenOff);
    if (sellable <= 0) return;
    _Scene_Shop_doSell_equipped.call(this, sellable);
  };

  //=============================================================================
  // Trading several lines in one go
  //=============================================================================
  // Emptying a bag (or filling one) a quantity modal at a time was the slowest
  // thing in the shop, so both lists are multi-select: a click (or Shift on the
  // highlighted line) puts a line on the counter, its card keeps its own -/+ to
  // trim that back, the category header above it takes the whole category at
  // once, and one press settles the lot. An empty counter leaves the old
  // single-item modal exactly as it was.

  const isSellableItem = (item) => {
    if (!item || isKeyItem(item) || isBoundGear(item)) return false;
    const price = Number.isFinite(item.price) ? item.price : 0;
    return price > 0 && sellableCount(item) > 0;
  };

  // What the till pays for one copy. It goes through the scene's own
  // sellingPrice() rather than repeating its arithmetic, so every factor that
  // moves it - Appraising, today's OIL/SOUL index, a passive skill another
  // plugin wrapped on top - reaches the card and the counter as well as the
  // receipt. Quoting the sticker here is what had a two-item pile advertised
  // at 2.20 € pay out 5.36 €.
  Scene_Shop.prototype.unitSellPrice = function (item) {
    if (!item) return 0;
    const previous = this._item;
    this._item = item;
    const price = safe("unitSellPrice", () => this.sellingPrice(), 0);
    this._item = previous;
    return Number.isFinite(price) ? price : 0;
  };

  const finalSellPrice = (item) => {
    const scene = SceneManager._scene;
    if (scene instanceof Scene_Shop && typeof scene.unitSellPrice === "function") {
      return scene.unitSellPrice(item);
    }
    // Read outside a shop (the inventory's own item panel): no counter to
    // quote against, so only what the party itself brings to the price.
    const flat = fixedPrice(item);
    if (flat !== null) return flat;
    return Math.max(1, Math.floor(baseSellPrice(item) * appraiseFactor()));
  };

  // The pile is reconciled against the party every time it is read: an item that
  // left the bag between two clicks (or a stack that shrank) must not stay on it.
  Scene_Shop.prototype.sellSelection = function () {
    if (!(this._sellSelection instanceof Map)) this._sellSelection = new Map();
    const selection = this._sellSelection;
    for (const item of Array.from(selection.keys())) {
      if (!isSellableItem(item)) {
        selection.delete(item);
        continue;
      }
      const qty = selection.get(item);
      const clamped = Math.max(1, Math.min(Number.isFinite(qty) ? qty : 1, sellableCount(item)));
      if (clamped !== qty) selection.set(item, clamped);
    }
    return selection;
  };

  // Picking a line up takes every copy of it: the point of a bulk sale is
  // clearing the bag, and the card's own steppers trim it back.
  Scene_Shop.prototype.toggleSellSelection = function (item) {
    if (!isSellableItem(item)) return false;
    const selection = this.sellSelection();
    if (selection.has(item)) selection.delete(item);
    else selection.set(item, sellableCount(item));
    return true;
  };

  Scene_Shop.prototype.changeSellSelectionQty = function (item, delta) {
    const selection = this.sellSelection();
    if (!selection.has(item)) return;
    const next = selection.get(item) + delta;
    // Stepping below one copy is how a line leaves the counter.
    if (next < 1) selection.delete(item);
    else selection.set(item, Math.min(next, sellableCount(item)));
  };

  Scene_Shop.prototype.clearSellSelection = function () {
    this.sellSelection().clear();
  };

  // Hand a list of [item, quantity] pairs over the counter in one go. Every
  // bulk sale ends here, so the till, the windows and the overlay are put back
  // together in exactly one place.
  Scene_Shop.prototype.commitSale = function (entries) {
    let sold = 0;
    for (const [item, qty] of entries) {
      const amount = Math.min(qty, sellableCount(item));
      if (amount <= 0) continue;
      // doSell is the whole chain: it unequips whatever it has to, pays the
      // party and trains Appraising, all against this._item.
      this._item = item;
      safe("bulk sell", () => this.doSell(amount), null);
      sold += amount;
    }
    this._item = null;
    if (sold > 0) SoundManager.playShop();

    if (this._sellWindow) {
      this._sellWindow.refresh();
      const last = this._sellWindow.maxItems() - 1;
      if (last < 0 || this._chipFocus) this._sellWindow.select(-1);
      else this._sellWindow.select(Math.min(Math.max(0, this._sellWindow.index()), last));
      this._sellWindow.activate();
    }
    if (this._statusWindow) this._statusWindow.refresh();
    this.refreshUIShop();
    return sold;
  };

  // Everything in the bag that is only worth what it is worth, handed over in
  // one go. A keepsake has no use, no modifier and no price to think about, so
  // there is nothing a per-line sale would let the player decide.
  Scene_Shop.prototype.sellAllCollectibles = function () {
    const entries = [];
    for (const item of $gameParty.allItems()) {
      if (fixedPrice(item) === null || !isSellableItem(item)) continue;
      entries.push([item, sellableCount(item)]);
    }
    if (!entries.length) {
      SoundManager.playBuzzer();
      if (window.ParchmentToast) window.ParchmentToast.show(T('Shop.noCollectibles'));
      return 0;
    }
    if (this.isShopBuyMode()) this.switchToSell();
    const paid = entries.reduce((sum, [item, qty]) => {
      this._item = item;
      return sum + qty * this.sellingPrice();
    }, 0);
    this._item = null;
    const sold = this.commitSale(entries);
    if (sold > 0 && window.ParchmentToast) {
      window.ParchmentToast.show(T('Shop.soldCollectibles', { count: sold, money: (window.MoneyFormatter ? window.MoneyFormatter.format(paid) : paid) + ' €' }));
    }
    return sold;
  };

  Scene_Shop.prototype.sellSelectedItems = function () {
    const selection = this.sellSelection();
    if (selection.size === 0) return;
    const entries = Array.from(selection);
    selection.clear();
    this.commitSale(entries);
  };

  //=============================================================================
  // The basket on the buy side
  //=============================================================================
  // The mirror of the pile: lines are picked off the shelf, trimmed on their own
  // cards and bought together. What the party can afford is the one thing the
  // basket has to respect that the pile does not, so every quantity that goes
  // into it is capped by the gold left after everything already in it.

  // How many more copies of a line the party could take: what the shelf still
  // has, and what the bag still has room for.
  Scene_Shop.prototype.buyableCount = function (item) {
    if (!item) return 0;
    const stock = this.getStock(item);
    const room = safe("maxItems", () => $gameParty.maxItems(item) - $gameParty.numItems(item), 0);
    return Math.max(0, Math.min(Number.isFinite(stock) ? stock : 0, Number.isFinite(room) ? room : 0));
  };

  // Gold left over once everything already in the basket is paid for. One line
  // may be left out of the sum, which is how that line asks what it may grow to.
  Scene_Shop.prototype.basketBudget = function (excludeItem) {
    let spent = 0;
    for (const [item, qty] of this.buyCart()) {
      if (item === excludeItem) continue;
      spent += qty * this.unitBuyPrice(item);
    }
    return Math.max(0, $gameParty.gold() - spent);
  };

  // The basket is reconciled against the shelf and the purse every time it is
  // read: a line that sold out, or that the party can no longer afford after
  // picking something dearer, must not sit in it quoting a price nobody can pay.
  Scene_Shop.prototype.buyCart = function () {
    if (!(this._buyCart instanceof Map)) this._buyCart = new Map();
    const cart = this._buyCart;
    // Nothing picked, nothing to reconcile: this is read every frame, and an
    // empty basket must not walk the shelf to find that out.
    if (cart.size === 0) return cart;
    // The whole shelf, not what the lit chip shows: a line stays in the basket
    // while the player goes off to another category for the next one.
    const listed = new Set(this.buyPoolItems());
    let budget = $gameParty.gold();
    for (const item of Array.from(cart.keys())) {
      const max = this.buyableCount(item);
      if (!listed.has(item) || max <= 0) {
        cart.delete(item);
        continue;
      }
      const price = this.unitBuyPrice(item);
      const affordable = price > 0 ? Math.floor(budget / price) : max;
      const qty = Math.max(0, Math.min(cart.get(item) | 0, max, affordable));
      if (qty <= 0) {
        cart.delete(item);
        continue;
      }
      cart.set(item, qty);
      budget -= qty * price;
    }
    return cart;
  };

  // Picking a line off the shelf takes one copy, not the whole shelf: a sale
  // clears a bag the player already owns, but a purchase spends money, so the
  // card's own steppers are what raise it from there.
  Scene_Shop.prototype.toggleBuySelection = function (item) {
    if (!item) return false;
    const cart = this.buyCart();
    if (cart.has(item)) {
      cart.delete(item);
      return true;
    }
    if (this.buyableCount(item) <= 0) return false;
    const price = this.unitBuyPrice(item);
    if (price > 0 && this.basketBudget(null) < price) return false;
    cart.set(item, 1);
    return true;
  };

  Scene_Shop.prototype.changeBuySelectionQty = function (item, delta) {
    const cart = this.buyCart();
    if (!cart.has(item)) return;
    const next = cart.get(item) + delta;
    // Stepping below one copy is how a line leaves the basket.
    if (next < 1) {
      cart.delete(item);
      return;
    }
    const price = this.unitBuyPrice(item);
    const affordable = price > 0 ? Math.floor(this.basketBudget(item) / price) : next;
    cart.set(item, Math.max(1, Math.min(next, this.buyableCount(item), affordable)));
  };

  Scene_Shop.prototype.clearBuySelection = function () {
    this.buyCart().clear();
  };

  // Take a list of [item, quantity] pairs off the shelf in one go, the mirror of
  // commitSale. Each line is re-checked against the purse as it goes: the ones
  // before it have already been paid for by the time it is reached.
  Scene_Shop.prototype.commitPurchase = function (entries) {
    let bought = 0;
    for (const [item, qty] of entries) {
      // A line the shelf no longer carries has no price to charge, and charging
      // nothing for it would hand it over free.
      if (!this.buyPoolItems().includes(item)) continue;
      const price = this.unitBuyPrice(item);
      const affordable = price > 0 ? Math.floor($gameParty.gold() / price) : qty;
      const amount = Math.min(qty, this.buyableCount(item), affordable);
      if (amount <= 0) continue;
      // doBuy is the whole chain: it takes the gold, hands over the goods and
      // trains Haggling, all against this._item.
      this._item = item;
      safe("bulk buy", () => this.doBuy(amount), null);
      bought += amount;
    }
    this._item = null;
    if (bought > 0) SoundManager.playShop();

    if (this._buyWindow) {
      this._buyWindow.refresh();
      const last = this._buyWindow.maxItems() - 1;
      if (last < 0) this._buyWindow.select(-1);
      else this._buyWindow.select(Math.min(Math.max(0, this._buyWindow.index()), last));
      this._buyWindow.activate();
    }
    if (this._statusWindow) this._statusWindow.refresh();
    this.refreshUIShop();
    return bought;
  };

  Scene_Shop.prototype.buySelectedItems = function () {
    const cart = this.buyCart();
    if (cart.size === 0) return;
    const entries = Array.from(cart);
    cart.clear();
    this.commitPurchase(entries);
  };

  //=============================================================================
  // One counter, either side of it
  //=============================================================================
  // Everything the overlay draws asks these rather than the pile or the basket
  // directly, so the list, the cards, the category headers and the strip above
  // them are written once and work whichever tab is open.

  Scene_Shop.prototype.shopCart = function (buying) {
    return buying ? this.buyCart() : this.sellSelection();
  };

  Scene_Shop.prototype.toggleCart = function (item, buying) {
    return buying ? this.toggleBuySelection(item) : this.toggleSellSelection(item);
  };

  Scene_Shop.prototype.changeCartQty = function (item, delta, buying) {
    if (buying) this.changeBuySelectionQty(item, delta);
    else this.changeSellSelectionQty(item, delta);
  };

  // -1, +1 or 0 for this frame's quantity step, from either input the steppers
  // answer to. The keyboard half rides Input's own key-repeat; the pad half is
  // the analog triggers, which Input does not see at all (no gamepadMapper
  // entry for buttons 6/7), so their hold has to be counted here to get the
  // same auto-repeat rather than one step per pull.
  Scene_Shop.prototype.readShopQtyStep = function () {
    if (Input.isRepeated('shopQtyUp')) return 1;
    if (Input.isRepeated('shopQtyDown')) return -1;

    const pads = window.AnalogStickInput;
    if (!pads || typeof pads.rightTrigger !== 'function') return 0;
    const up = pads.rightTrigger() >= QTY_TRIGGER_THRESHOLD;
    const down = !up && pads.leftTrigger() >= QTY_TRIGGER_THRESHOLD;
    const dir = up ? 1 : (down ? -1 : 0);
    if (dir === 0 || dir !== this._qtyTriggerDir) {
      // Direction changed (or let go): restart the hold so the new pull steps
      // once immediately instead of inheriting the old one's repeat rhythm.
      this._qtyTriggerDir = dir;
      this._qtyTriggerHold = 0;
      if (dir === 0) return 0;
    }
    const t = ++this._qtyTriggerHold;
    const fires = t === 1 ||
      (t >= QTY_REPEAT_WAIT && (t - QTY_REPEAT_WAIT) % QTY_REPEAT_INTERVAL === 0);
    return fires ? dir : 0;
  };

  Scene_Shop.prototype.clearCart = function (buying) {
    this.shopCart(buying).clear();
  };

  Scene_Shop.prototype.settleCart = function (buying) {
    if (buying) this.buySelectedItems();
    else this.sellSelectedItems();
  };

  // What one copy is worth on the side of the counter being looked at.
  Scene_Shop.prototype.cartUnitPrice = function (item, buying) {
    return buying ? this.unitBuyPrice(item) : finalSellPrice(item);
  };

  // The most of a line that could go onto the counter, before money is counted.
  Scene_Shop.prototype.cartMaxQty = function (item, buying) {
    return buying ? this.buyableCount(item) : sellableCount(item);
  };

  // Whether a line may be picked at all. A sold-out shelf line and a key item
  // are both refused, so a header never claims to have picked one.
  Scene_Shop.prototype.canCart = function (item, buying) {
    if (!item) return false;
    return buying ? this.buyableCount(item) > 0 : isSellableItem(item);
  };

  Scene_Shop.prototype.cartTotals = function (buying) {
    const cart = this.shopCart(buying);
    let units = 0;
    let value = 0;
    for (const [item, qty] of cart) {
      units += qty;
      value += qty * this.cartUnitPrice(item, buying);
    }
    return { lines: cart.size, units: units, value: value };
  };

  // A signature of what is on the counter, so the overlay knows when to redraw.
  Scene_Shop.prototype.cartHash = function (buying) {
    const parts = [];
    for (const [item, qty] of this.shopCart(buying)) parts.push(getStockKey(item) + ":" + qty);
    return parts.join("|");
  };

  //=============================================================================
  // Categories: the shape of the list
  //=============================================================================
  // Both lists are read as categories in alphabetical order, each with its lines
  // under it and a header that picks the whole thing. The label is the item's own
  // category name (the <category:> tag, or its weapon/armour type), so the
  // grouping is the same one the item sheet quotes.

  // The name a category is printed under. The <category:> tag is an id, and the
  // caption for it lives in the one table the whole game reads item categories
  // out of (Inventory.category.<tag>, the backpack's own tabs), so a thing is
  // filed under the same word on both pages of the book. A tag nobody has
  // written a caption for reads as itself.
  const categoryLabelOf = (item) => {
    const tag = String(categoryOf(item) || "").trim();
    if (!tag) return T('Shop.uncategorized');
    const key = 'Inventory.category.' + tag;
    return T.has(key) ? T(key) : tag;
  };

  const categoryKeyOf = (item) => categoryLabelOf(item).toLowerCase();

  //=============================================================================
  // The chip row: filtering by category
  //=============================================================================
  // Above each list, one chip per category that side of the counter actually
  // holds - the shelf's own categories while buying, the party's while selling -
  // drawn like the backpack's tabs and read the same way. There is no fixed
  // list: a category with nothing in it has no chip, and the day the bag holds
  // its first one it gets it.

  const ALL_CATEGORIES = "all";

  // What the sell list could ever show, before any chip narrows it: the bag and
  // whatever the party is wearing, minus the key items no shop will take.
  const isShopSellType = (item) =>
    !!item && !isKeyItem(item) &&
    (DataManager.isItem(item) || DataManager.isWeapon(item) || DataManager.isArmor(item));

  Scene_Shop.prototype.sellPoolItems = function () {
    const pool = safe("allItems", () => $gameParty.allItems(), []) || [];
    const items = pool.filter(isShopSellType);
    for (const worn of wornCounts().keys()) {
      if (isShopSellType(worn) && !items.includes(worn)) items.push(worn);
    }
    return items;
  };

  // The whole shelf, before the chip narrows it. Window_ShopBuy#makeItemList
  // leaves it here so the chips can be built from everything on offer rather
  // than from what the current chip already let through.
  Scene_Shop.prototype.buyPoolItems = function () {
    return (this._buyWindow && this._buyWindow._allData) || this.buyData();
  };

  Scene_Shop.prototype.shopCategoryChips = function (buying) {
    const pool = buying ? this.buyPoolItems() : this.sellPoolItems();
    const byKey = new Map();
    for (const item of pool) {
      if (!item) continue;
      const label = categoryLabelOf(item);
      const key = label.toLowerCase();
      if (!byKey.has(key)) byKey.set(key, label);
    }
    const chips = Array.from(byKey, ([key, label]) => ({ key: key, label: label }));
    chips.sort((a, b) => a.label.localeCompare(b.label));
    chips.unshift({ key: ALL_CATEGORIES, label: T('Shop.allCategories') });
    return chips;
  };

  // Which chip is lit. A filter whose category has since emptied falls back to
  // All rather than leaving the player staring at an empty list with no way
  // back: the chip it named is no longer on the row to press.
  Scene_Shop.prototype.shopCategoryFilter = function (buying) {
    const field = buying ? "_buyCatFilter" : "_sellCatFilter";
    const key = this[field] || ALL_CATEGORIES;
    if (key === ALL_CATEGORIES) return ALL_CATEGORIES;
    const pool = buying ? this.buyPoolItems() : this.sellPoolItems();
    if (!pool.some(item => item && categoryKeyOf(item) === key)) {
      this[field] = ALL_CATEGORIES;
      return ALL_CATEGORIES;
    }
    return key;
  };

  Scene_Shop.prototype.setShopCategoryFilter = function (key, buying) {
    const next = key || ALL_CATEGORIES;
    this[buying ? "_buyCatFilter" : "_sellCatFilter"] = next;
    this._chipFocus = false;
    if (buying) {
      this._buyWindow.refresh();
      this._buyWindow.select(Math.min(this._buyWindow.index(), Math.max(0, this._buyWindow.maxItems() - 1)));
      this._buyWindow.activate();
    } else {
      this._sellWindow.refresh();
      this._sellWindow.select(this._sellWindow.maxItems() > 0 ? 0 : -1);
      this._sellWindow.activate();
    }
    this.refreshUIShop();
  };

  // Whether a line survives the chip currently lit on its side of the counter.
  Scene_Shop.prototype.passesShopCategory = function (item, buying) {
    const key = this.shopCategoryFilter(buying);
    return key === ALL_CATEGORIES || categoryKeyOf(item) === key;
  };

  // Walking the chip row with the cursor rather than the mouse.
  Scene_Shop.prototype.stepShopCategoryChip = function (delta, buying) {
    const chips = this.shopCategoryChips(buying);
    const current = this.shopCategoryFilter(buying);
    const index = Math.max(0, chips.findIndex(chip => chip.key === current));
    const next = index + delta;
    if (next < 0 || next >= chips.length) return false;
    const focus = this._chipFocus;
    this.setShopCategoryFilter(chips[next].key, buying);
    // Stepping through the row does not leave it: the cursor stays on the chips
    // until it is walked down into the list.
    this._chipFocus = focus;
    this.refreshUIShop();
    return true;
  };

  // The lines of one list, gathered into groups by category and sorted by name.
  // The indices are into the list itself: the cursor still walks a flat list, so
  // a card carries the index the sell/buy window knows it by, not its place on
  // the page.
  Scene_Shop.prototype.shopCategoryGroups = function (data, buying) {
    const byKey = new Map();
    data.forEach((item, idx) => {
      if (!item) return;
      const label = categoryLabelOf(item);
      const key = label.toLowerCase();
      let group = byKey.get(key);
      if (!group) {
        group = { key: key, label: label, indices: [] };
        byKey.set(key, group);
      }
      group.indices.push(idx);
    });
    const groups = Array.from(byKey.values());
    groups.sort((a, b) => a.label.localeCompare(b.label));
    // Whatever the party is carrying, or the shop is selling, of one category:
    // how many lines, how many copies and what the lot is worth, so the header
    // says what pressing it would put on the counter.
    const cart = this.shopCart(buying);
    for (const group of groups) {
      let units = 0;
      let value = 0;
      let picked = 0;
      let pickable = 0;
      for (const idx of group.indices) {
        const item = data[idx];
        if (!this.canCart(item, buying)) continue;
        pickable++;
        if (cart.has(item)) picked++;
        const qty = buying ? 1 : this.cartMaxQty(item, buying);
        units += qty;
        value += qty * this.cartUnitPrice(item, buying);
      }
      group.units = units;
      group.value = value;
      group.picked = picked;
      group.pickable = pickable;
    }
    return groups;
  };

  // Picking a category takes every line in it that can be picked - and, on the
  // sell side, every copy of each. A second press puts the lot back.
  Scene_Shop.prototype.toggleCategoryCart = function (key, buying) {
    if (!key) return false;
    const data = buying ? this.buyData() : this.sellData();
    const items = data.filter(item => item && categoryLabelOf(item).toLowerCase() === key);
    if (items.length === 0) return false;
    const cart = this.shopCart(buying);
    const pickable = items.filter(item => this.canCart(item, buying));
    const allPicked = pickable.length > 0 && pickable.every(item => cart.has(item));

    if (allPicked) {
      for (const item of items) cart.delete(item);
      return true;
    }

    let changed = false;
    for (const item of pickable) {
      if (cart.has(item)) continue;
      if (buying) {
        // The basket stops where the money does: the rest of the category is
        // simply not picked rather than picked and refused at the till.
        if (this.toggleBuySelection(item)) changed = true;
      } else {
        cart.set(item, sellableCount(item));
        changed = true;
      }
    }
    return changed;
  };

  //=============================================================================
  // The list itself
  //=============================================================================

  Scene_Shop.prototype.categoryHeaderHTML = function (group) {
    // Empty, some, or all of the category on the counter.
    const state = group.picked === 0 ? "none"
      : (group.picked >= group.pickable ? "all" : "some");
    const mark = state === "all" ? "✓" : (state === "some" ? "–" : "");
    const summary = T('Shop.categorySummary', { value: money(group.value) });
    return `
      <div class="shop-cat-header ${state}" data-cat="${esc(group.key)}" title="${esc(T('Shop.categoryToggleHint'))}">
          <span class="shop-cat-box">${esc(mark)}</span>
          <span class="shop-cat-name">${esc(group.label)}</span>
          <span class="shop-cat-meta">${esc(summary)}</span>
      </div>
    `;
  };

  Scene_Shop.prototype.itemCardHTML = function (item, idx, buying, cart, focused) {
    if (!item) return "";
    const mode = buying ? "buy" : "sell";
    // Both sides quote the price the till will actually use, so a card can never
    // advertise a figure the receipt does not honour.
    const price = this.cartUnitPrice(item, buying);

    // A line on the counter carries its own quantity and subtotal, so a pile of
    // several can still be trimmed one at a time.
    const pickedQty = cart.get(item) || 0;
    const isPicked = pickedQty > 0;
    const qtyHTML = isPicked
      ? `
                      <div class="sell-qty">
                          <span class="sell-qty-step" data-idx="${idx}" data-mode="${mode}" data-step="-1" title="${esc(T('Shop.qtyStepHint'))}">－</span>
                          <span class="sell-qty-val">${pickedQty}</span>
                          <span class="sell-qty-step" data-idx="${idx}" data-mode="${mode}" data-step="1" title="${esc(T('Shop.qtyStepHint'))}">＋</span>
                          <span class="sell-qty-total ${buying ? 'cost' : ''}">${money(pickedQty * price)} €</span>
                      </div>`
      : "";

    return `
              <div class="item-card ${focused ? 'focused' : ''} ${isPicked ? 'selected' : ''}" data-idx="${idx}" data-mode="${mode}" style="border-left: 4px solid ${rarityColor(item)};">
                  <div class="item-card-left">
                      <div class="item-card-icon" style="${this.getIconStyle(item.iconIndex)}"></div>
                      <div class="item-card-info">
                          <span class="item-card-name">${esc(itemName(item))}</span>
                      </div>
                  </div>
                  <div class="item-card-right">
                      <span class="item-card-price">${money(price)} €</span>${qtyHTML}
                  </div>
              </div>
            `;
  };

  //=============================================================================
  // Confirming, cancelling and leaving with something on the counter
  //=============================================================================

  // Confirming with a pile on the counter settles the pile. The engine asks the
  // window whether the line under the cursor may be confirmed, and while a pile
  // is waiting the answer is yes whatever that line is: the deal is not about it.
  const _Window_ShopSell_isCurrentItemEnabled = Window_ShopSell.prototype.isCurrentItemEnabled;
  Window_ShopSell.prototype.isCurrentItemEnabled = function () {
    const scene = SceneManager._scene;
    if (scene instanceof Scene_Shop && typeof scene.sellSelection === "function") {
      if (scene.sellSelection().size > 0) return true;
    }
    return _Window_ShopSell_isCurrentItemEnabled.call(this);
  };

  const _Window_ShopBuy_isCurrentItemEnabled = Window_ShopBuy.prototype.isCurrentItemEnabled;
  Window_ShopBuy.prototype.isCurrentItemEnabled = function () {
    const scene = SceneManager._scene;
    if (scene instanceof Scene_Shop && typeof scene.buyCart === "function") {
      if (scene.buyCart().size > 0) return true;
    }
    return _Window_ShopBuy_isCurrentItemEnabled.call(this);
  };

  const _Scene_Shop_onSellOk = Scene_Shop.prototype.onSellOk;
  Scene_Shop.prototype.onSellOk = function () {
    if (this.sellSelection().size > 0) {
      this.sellSelectedItems();
      return;
    }
    _Scene_Shop_onSellOk.call(this);
  };

  const _Scene_Shop_onBuyOk = Scene_Shop.prototype.onBuyOk;
  Scene_Shop.prototype.onBuyOk = function () {
    if (this.buyCart().size > 0) {
      this.buySelectedItems();
      return;
    }
    _Scene_Shop_onBuyOk.call(this);
  };

  // Cancelling clears the counter before it leaves the shop, so a pile picked by
  // mistake costs one press rather than a trip back through the door. The frame
  // is recorded because the same press also reaches cancelShopAction (the list
  // window's own handler runs first, from the engine's update): without it the
  // clear and the exit would both happen on that one press.
  Scene_Shop.prototype.onSellCancel = function () {
    if (this.sellSelection().size > 0) {
      this.clearSellSelection();
      this._cartCancelFrame = Graphics.frameCount;
      SoundManager.playCancel();
      this.refreshUIShop();
      return;
    }
    this.closeShop();
  };

  Scene_Shop.prototype.onBuyCancel = function () {
    if (this.buyCart().size > 0) {
      this.clearBuySelection();
      this._cartCancelFrame = Graphics.frameCount;
      SoundManager.playCancel();
      this.refreshUIShop();
      return;
    }
    this.closeShop();
  };

  const _Scene_Shop_cancelShopAction = Scene_Shop.prototype.cancelShopAction;
  Scene_Shop.prototype.cancelShopAction = function () {
    // One press clears the counter and no more: a cancel reaches this method
    // from the key listener, the right-click listener AND the update loop, and
    // the second arrival would find an empty counter and leave the shop.
    if (this._cartCancelFrame === Graphics.frameCount) return;
    if (this.isShopReady() && !this._numberWindow.active) {
      const buying = this.isShopBuyMode();
      if ((buying || this.isShopSellMode()) && this.shopCart(buying).size > 0) {
        this.clearCart(buying);
        this._cartCancelFrame = Graphics.frameCount;
        SoundManager.playCancel();
        this.refreshUIShop();
        return;
      }
    }
    _Scene_Shop_cancelShopAction.call(this);
  };

  // Crossing to the other tab puts that side's counter back: a pile is only ever
  // drawn on the side it belongs to, and a hidden one would be settled by the
  // next confirm.
  const _Scene_Shop_switchToBuy = Scene_Shop.prototype.switchToBuy;
  Scene_Shop.prototype.switchToBuy = function () {
    this.clearSellSelection();
    _Scene_Shop_switchToBuy.call(this);
  };

  const _Scene_Shop_switchToSell = Scene_Shop.prototype.switchToSell;
  Scene_Shop.prototype.switchToSell = function () {
    this.clearBuySelection();
    _Scene_Shop_switchToSell.call(this);
  };

  Window_ShopNumber.prototype.max = function () {
    return Math.max(1, this._max || 1);
  };

  // Base engine hardcodes 2 digits (max 99); stacks now go up to 9999.
  Window_ShopNumber.prototype.maxDigits = function () {
    return 4;
  };

  const _Window_ShopNumber_setup = Window_ShopNumber.prototype.setup;
  // Native signature is setup(item, max, price). The previous override mislabelled
  // the args, which fed the price into the max slot (and stock into the price slot),
  // breaking both the displayed total and the stock cap. Cap the purchasable MAX by
  // the shop's remaining stock (buying only; selling is already capped by owned count).
  Window_ShopNumber.prototype.setup = function (item, max, price) {
    const scene = SceneManager._scene;
    const isBuying = scene instanceof Scene_Shop &&
      scene._commandWindow && scene._commandWindow.currentSymbol() === "buy";
    const maxInStock = isBuying ? scene.getStock(item) : UNLIMITED_STOCK;
    const requested = Number.isFinite(max) ? max : 1;
    const actualMax = Math.max(1, Math.min(requested, maxInStock));
    _Window_ShopNumber_setup.call(this, item, actualMax, Number.isFinite(price) ? price : 0);
  };

})();
