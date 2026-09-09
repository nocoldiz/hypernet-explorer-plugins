/*:
 * @target MZ
 * @plugindesc v1.0.0 Item System Utilities - Common functions for item systems
 * @author Omni-Lex
 * @help ItemSystemUtils.js
 *
 * This plugin provides shared utility functions for item systems.
 * It should be loaded BEFORE ItemSystemInventory and ItemSystemShop.
 *
 * Provides:
 * - Weight system calculations
 * - Item category checking
 * - Restricted goods (<Restricted>), see isRestrictedEntry below
 * - Nutrition value extraction
 * - Text formatting utilities
 * - Actor bust image paths
 *
 * Terms of Use:
 * Free for use in both commercial and non-commercial projects.
 */

(function () {
  "use strict";

  //=============================================================================
  // Plugin Parameters
  //=============================================================================
  const BASE_CARRY_WEIGHT = 60000; // 60kg in grams (minimum per character)
  const COS_WEIGHT_BONUS = 300; // 300g per COS point (constitution / param 3)
  const FOR_WEIGHT_BONUS = 500; // 500g per FOR point (strength / param 2)
  const OVERENCUMBERED_SPEED_PENALTY = 0.5; // 50% movement speed
  const FOOD_HP_RECOVERY_VARIABLE_ID = 28;
  const FOOD_COMMON_EVENT_ACTOR1 = 23;
  const FOOD_COMMON_EVENT_ACTOR2 = 24;
  const FOOD_COMMON_EVENT_ACTOR3 = 25;
  const { SpritesAssociation } = window.Sprites || {};

  //=============================================================================
  // Weight caches (perf): item notes are static, so per-item weight is parsed
  // once; total/max carry weight are recomputed only when inventory, equipment
  // or party composition changes (dirty flag set by the aliases below).
  //=============================================================================
  const _itemWeightCache = new Map();
  let _weightCacheDirty = true;
  let _cachedTotalWeight = 0;
  let _cachedMaxCarryWeight = 0;

  function invalidateWeightCache() {
    _weightCacheDirty = true;
  }

  //=============================================================================
  // Stack Cap: items/weapons/armors can stack up to 9999 (raised from the
  // RMMZ default of 99). Game_Party.gainItem clamps to this via maxItems(item).
  //=============================================================================
  Game_Party.prototype.maxItems = function (/*item*/) {
    return 9999;
  };

  //=============================================================================
  // Global Item System Utilities
  //=============================================================================

  window.ItemSystemUtils = {
    // Export constants
    BASE_CARRY_WEIGHT,
    COS_WEIGHT_BONUS,
    FOR_WEIGHT_BONUS,
    OVERENCUMBERED_SPEED_PENALTY,
    FOOD_HP_RECOVERY_VARIABLE_ID,
    FOOD_COMMON_EVENT_ACTOR1,
    FOOD_COMMON_EVENT_ACTOR2,
    FOOD_COMMON_EVENT_ACTOR3,

    /**
     * A restricted entry (<Restricted> note tag) is granted by one system and
     * one system only: a seed weapon grows from a blade seed, nothing else.
     * It never turns up in a loot roll, on a shop shelf, in a vending machine,
     * in a stolen pocket or as a quest reward, so every pool builder asks this
     * before it accepts a row of the database.
     */
    isRestrictedEntry: function (entry) {
      return !!(entry && entry.note && /<Restricted>/i.test(entry.note));
    },

    /**
     * Get item weight from note tag.
     * A <weight: 0> tag, or no tag at all, means the thing is weightless: it is
     * shown as such in the inspect card, so a stack of it must not quietly add
     * up against the carry limit either.
     */
    getItemWeight: function (item) {
      if (!item || !item.note) return 0;

      let grams = _itemWeightCache.get(item);
      if (grams === undefined) {
        const match = item.note.match(/<weight:\s*(\d+)>/i);
        if (match) {
          grams = Math.max(0, parseInt(match[1]) || 0);
          // Food is modestly lightened so survival stocking does not overencumber (#141).
          if (grams > 0 && this.isFoodItem(item)) grams = Math.max(1, Math.round(grams * 0.5));
        } else {
          grams = 0;
        }
        _itemWeightCache.set(item, grams);
      }
      return grams;
    },

    /**
     * Calculate total inventory weight (only unequipped items)
     */
    calculateTotalWeight: function () {
      if (_weightCacheDirty) this._refreshWeightCaches();
      return _cachedTotalWeight;
    },

    _computeTotalWeight: function () {
      let totalWeight = 0;

      // 1. Regular items
      const items = $gameParty.items();
      for (const item of items) {
        totalWeight += this.getItemWeight(item) * $gameParty.numItems(item);
      }

      // 2. Get a copy of weapon and armor counts
      const weapons = Object.assign({}, $gameParty._weapons);
      const armors = Object.assign({}, $gameParty._armors);

      // 3. Subtract equipped items
      for (const actor of $gameParty.members()) {
        for (const equip of actor.equips()) {
          if (equip) {
            if (DataManager.isWeapon(equip)) {
              if (weapons[equip.id]) {
                weapons[equip.id]--;
              }
            } else if (DataManager.isArmor(equip)) {
              if (armors[equip.id]) {
                armors[equip.id]--;
              }
            }
          }
        }
      }

      // 4. Calculate weight of unequipped weapons
      for (const weaponId in weapons) {
        if (weapons[weaponId] > 0) {
          const weapon = $dataWeapons[weaponId];
          totalWeight += this.getItemWeight(weapon) * weapons[weaponId];
        }
      }

      // 5. Calculate weight of unequipped armors
      for (const armorId in armors) {
        if (armors[armorId] > 0) {
          const armor = $dataArmors[armorId];
          totalWeight += this.getItemWeight(armor) * armors[armorId];
        }
      }

      return totalWeight;
    },

    /**
     * Calculate max carry weight.
     * Each party member contributes a base of 60kg (minimum), increased by
     * their FOR (strength / param 2) and COS (constitution / param 3).
     */
    calculateMaxCarryWeight: function () {
      if (_weightCacheDirty) this._refreshWeightCaches();
      return _cachedMaxCarryWeight;
    },

    _computeMaxCarryWeight: function () {
      const members = $gameParty.members();
      if (!members.length) return BASE_CARRY_WEIGHT;

      let total = 0;
      for (const actor of members) {
        const str = actor.param(2); // FOR / strength
        const con = actor.param(3); // COS / constitution
        total += BASE_CARRY_WEIGHT + str * FOR_WEIGHT_BONUS + con * COS_WEIGHT_BONUS;
      }

      return total;
    },

    _refreshWeightCaches: function () {
      _cachedTotalWeight = this._computeTotalWeight();
      _cachedMaxCarryWeight = this._computeMaxCarryWeight();
      _weightCacheDirty = false;
    },

    /**
     * Invalidate the cached total/max carry weight (recomputed lazily).
     */
    invalidateWeightCache: invalidateWeightCache,

    /**
     * Check if party is overencumbered
     */
    isOverencumbered: function () {
      return this.calculateTotalWeight() > this.calculateMaxCarryWeight();
    },

    /**
     * Format weight for display
     */
    formatWeight: function (grams) {
      if (grams < 1000) {
        return grams + "g";
      } else {
        return (grams / 1000).toFixed(1) + "kg";
      }
    },

    /**
     * Get nutrition value from item note tag
     */
    getNutritionValue: function (item, nutrient) {
      if (!item || !item.note) return 0;
      const regex = new RegExp(`<${nutrient}:\\s*(\\d+)>`, "i");
      const match = item.note.match(regex);
      return match ? parseInt(match[1]) : 0;
    },

    //=========================================================================
    // Need restoration (Hunger / Sleep / Hygiene / Social / Fun)
    //
    // Non-food consumables can declare which survival need they replenish via a
    // note tag:  <NeedRestore: leisure 40>  (or several, comma-separated:
    // <NeedRestore: hygiene 30, social 15>). The amount is a 1-100 satisfaction
    // value applied directly to the actor's need meter on use. Food items keep
    // using <calories:>/<protein:>/<fat:> for hunger instead.
    //=========================================================================
    NEED_KEYS: ["hunger", "sleep", "hygiene", "social", "leisure"],
    // Displayed label per need; "leisure" reads as "Mood" everywhere else in the UI.
    // Both label tables now resolve on read; NEED_KEYS above stay the ids.
    get NEED_LABELS() { return T.obj('ItemUtils.need'); },
    get NEED_LABELS_IT() { return T.obj('ItemUtils.need'); },
    NEED_ADDERS:    { hunger: "addHunger", sleep: "addSleep", hygiene: "addHygiene", social: "addSocial", leisure: "addLeisure" },
    NEED_COLORS:    { hunger: "#c0392b", sleep: "#2980b9", hygiene: "#16a085", social: "#8e44ad", leisure: "#d4a64e" },

    /**
     * Localized label for a need key.
     */
    getNeedLabel: function (key) {
      return this.NEED_LABELS[key] || key;
    },

    /**
     * Parse <NeedRestore: ...> tags into [{ key, amount, label, color }].
     * Returns an empty array when the item declares none.
     */
    getNeedRestores: function (item) {
      if (!item || !item.note) return [];
      const out = [];
      const re = /<needRestore:\s*([^>]+)>/gi;
      let m;
      while ((m = re.exec(item.note)) !== null) {
        m[1].split(",").forEach((part) => {
          const t = part.trim().match(/([a-zA-Z]+)\s*[:= ]\s*(\d+)/);
          if (!t) return;
          const key = t[1].toLowerCase();
          if (!this.NEED_KEYS.includes(key)) return;
          out.push({
            key,
            amount: Math.max(1, Math.min(100, parseInt(t[2], 10))),
            label: this.getNeedLabel(key),
            color: this.NEED_COLORS[key] || "#5c4033",
          });
        });
      }
      return out;
    },

    /**
     * Silently apply an item's declared need restoration to a single actor.
     * The actor need methods already write where each meter lives (the extended
     * meters of a recruited member live on their society profile), so only
     * hunger and sleep, which the party shares, are mirrored onto the profile
     * of a recruited member so the society simulation sees the meal too.
     * Returns the applied restores.
     */
    applyNeedRestores: function (actor, item) {
      // Feeding an addiction rides along with the needs: every path that hands
      // an item to somebody already calls this, so a cigarette works wherever
      // a meal does.
      this.applyAddictionRelief(actor, item);
      const restores = this.getNeedRestores(item);
      if (!restores.length || !actor) return [];
      const isLeaderActor = actor.actorId && actor.actorId() === 1;
      const profile = (!isLeaderActor && window.NPCSocietyRegistry && window.NPCSocietyRegistry.getProfile)
        ? window.NPCSocietyRegistry.getProfile(actor.name())
        : null;
      restores.forEach((r) => {
        const adder = this.NEED_ADDERS[r.key];
        if (adder && typeof actor[adder] === "function") actor[adder](r.amount);
        const mirrored = r.key === "hunger" || r.key === "sleep";
        if (mirrored && profile && typeof profile[r.key] === "number") {
          profile[r.key] = Math.max(0, Math.min(100, profile[r.key] + r.amount));
        }
      });
      return restores;
    },

    //=========================================================================
    // Addiction relief (the craving meters of TimeDateSystem's AddictionSystem)
    //
    // A craving is a need read backwards, so it gets its own tag rather than a
    // negative NeedRestore:  <Addiction: nicotine>  feeds that craving in full,
    // <Addiction: alcohol 60>  feeds it partly, and  <Addiction: all 50>  is
    // the detox case, taking the same bite out of every craving the user has.
    // Coffee needs no tag at all: its <caffeine:> nutrition value already says
    // how much of the caffeine craving it answers.
    //=========================================================================
    ADDICTION_KEYS_FALLBACK: ["nicotine", "caffeine", "narcotic", "alcohol", "gambling"],

    addictionKeys: function () {
      const sys = window.AddictionSystem;
      return (sys && sys.KEYS && sys.KEYS.length) ? sys.KEYS : this.ADDICTION_KEYS_FALLBACK;
    },

    getAddictionLabel: function (key) {
      const sys = window.AddictionSystem;
      return sys && sys.label ? sys.label(key) : key;
    },

    /**
     * Parse <Addiction: ...> tags (plus the implicit caffeine of a coffee) into
     * [{ key, amount, label }]. key "all" means every craving the user carries.
     * Returns an empty array when the item feeds nothing.
     */
    getAddictionRelief: function (item) {
      if (!item || !item.note) return [];
      const keys = this.addictionKeys();
      const out = [];
      const re = /<addiction:\s*([^>]+)>/gi;
      let m;
      while ((m = re.exec(item.note)) !== null) {
        m[1].split(",").forEach((part) => {
          const t = part.trim().match(/([a-zA-Z]+)\s*[:= ]?\s*(\d+)?/);
          if (!t) return;
          const key = t[1].toLowerCase();
          if (key !== "all" && !keys.includes(key)) return;
          out.push({
            key,
            amount: t[2] === undefined ? 100 : Math.max(1, Math.min(100, parseInt(t[2], 10))),
            label: key === "all" ? T("ItemUtils.addiction.all") : this.getAddictionLabel(key),
          });
        });
      }
      // A caffeinated drink answers the caffeine craving by however much it
      // carries, without every coffee in the database needing a second tag.
      if (!out.some((r) => r.key === "caffeine" || r.key === "all")) {
        const caffeine = this.getNutritionValue(item, "caffeine");
        if (caffeine > 0) {
          out.push({
            key: "caffeine",
            amount: Math.max(1, Math.min(100, caffeine)),
            label: this.getAddictionLabel("caffeine"),
          });
        }
      }
      return out;
    },

    /**
     * What an item is medicine FOR, ready to print. Reads the notes
     * tools/health/gen_medicines.py writes (<Medicine:>, <Cures: id:days>,
     * <Treats: id>) and names every disease through the disease library, so a
     * buyer can tell an antibiotic from a healing potion before paying for it.
     * Returns null for anything that is not medicine, which a healing potion
     * is not: restoring HP has never cured an illness.
     */
    getMedicineInfo: function (item) {
      if (!item || !item.note) return null;
      const cls = /<Medicine:\s*([\w-]+)\s*>/i.exec(item.note);
      if (!cls) return null;
      const api = window.DiseaseSystem;
      const nameOf = (id) => (api && api.displayName ? api.displayName(id) : id);
      const info = {
        cls: cls[1].toLowerCase(),
        label: window.Medicines ? window.Medicines.className(cls[1].toLowerCase()) : cls[1],
        cures: [],
        treats: [],
      };
      const cures = /<Cures:\s*([^>]*)>/i.exec(item.note);
      if (cures) {
        for (const pair of cures[1].split(",")) {
          const bits = pair.split(":");
          const id = String(bits[0] || "").trim();
          if (!id) continue;
          info.cures.push({ id, name: nameOf(id), days: Math.max(1, Number(bits[1]) || 1) });
        }
        info.cures.sort((a, b) => a.days - b.days || a.name.localeCompare(b.name));
      }
      const treats = /<Treats:\s*([^>]*)>/i.exec(item.note);
      if (treats) {
        info.treats = treats[1].split(",").map((s) => s.trim()).filter(Boolean)
          .map((id) => ({ id, name: nameOf(id) }))
          .sort((a, b) => a.name.localeCompare(b.name));
      }
      return info;
    },

    /**
     * Silently feed whatever this item feeds on a single actor. An actor who
     * does not carry the matching trait has no meter, so nothing happens.
     * Returns the relief that actually landed.
     */
    applyAddictionRelief: function (actor, item) {
      const sys = window.AddictionSystem;
      if (!actor || !sys) return [];
      const relief = this.getAddictionRelief(item);
      const applied = [];
      relief.forEach((r) => {
        if (r.key === "all") {
          if (sys.isAddict(actor)) {
            sys.relieveAll(actor, r.amount);
            applied.push(r);
          }
        } else if (sys.relieve(actor, r.key, r.amount)) {
          applied.push(r);
        }
      });
      return applied;
    },

    /**
     * True when using this item is worthwhile on its own terms, with no HP/MP
     * or state effect to register a hit: it replenishes a need or feeds a
     * craving.
     */
    satisfiesNeed: function (item) {
      return this.getNeedRestores(item).length > 0 || this.getAddictionRelief(item).length > 0;
    },

    /**
     * Check if item has Food category
     */
    isFoodItem: function (item) {
      if (!item || !item.note) return false;
      return /<category:Food>/i.test(item.note);
    },

    /**
     * Check if item has Tools category
     */
    isToolsItem: function (item) {
      if (!item || !item.note) return false;
      return /<category:Tools>/i.test(item.note);
    },

    /**
     * Check if item has Medical category
     */
    isMedicalItem: function (item) {
      if (!item || !item.note) return false;
      return /<category:Medical>/i.test(item.note);
    },

    /**
     * Count items in each category
     */
    countMedicalItems: function () {
      return $gameParty.allItems().filter((item) => DataManager.isItem(item) && this.isMedicalItem(item)).length;
    },

    countFoodItems: function () {
      return $gameParty.allItems().filter((item) => DataManager.isItem(item) && this.isFoodItem(item)).length;
    },

    countToolsItems: function () {
      return $gameParty.allItems().filter((item) => DataManager.isItem(item) && this.isToolsItem(item)).length;
    },

    countWeapons: function () {
      return $gameParty.weapons().length;
    },

    countArmors: function () {
      return $gameParty.armors().length;
    },

    countMaterials: function () {
      return $gameParty.allItems().filter((item) => DataManager.isItem(item) && item.itypeId === 2).length;
    },

    countTrash: function () {
      return $gameParty.allItems().filter((item) => item && (!DataManager.isItem(item) || item.itypeId !== 2)).length;
    },

    /**
     * Get the raw category name from item note tag
     */
    getRawCategoryFromNote: function (item) {
      if (!item || !item.note) return null;
      const match = item.note.match(/<category:\s*(\w+)>/i);
      return match ? match[1] : null;
    },

    /**
     * Get item category name for display
     */
    getItemCategoryName: function (item) {
      if (!item) return null;

      // First, check if item has a category tag in notes
      const rawCategory = this.getRawCategoryFromNote(item);
      if (rawCategory) {
        return rawCategory; // Return the exact category name from the tag
      }

      // If no category tag, return general item type
      if (DataManager.isItem(item)) {
        if (item.itypeId === 2) {
          return T('ItemUtils.category.materials');
        }
        return T('ItemUtils.category.item');
      }
      if (DataManager.isWeapon(item)) {
        // Return the actual weapon type name (Light, Sword, Heavy, etc.)
        let weaponTypeName = $dataSystem.weaponTypes[item.wtypeId];
        if (window.translateText && typeof window.translateText === "function") {
          weaponTypeName = window.translateText(weaponTypeName);
        }
        return weaponTypeName;
      }
      if (DataManager.isArmor(item)) {
        // Return the actual armor type name (Helmet, Armor, Shield, etc.)
        let armorTypeName = $dataSystem.armorTypes[item.atypeId];
        if (window.translateText && typeof window.translateText === "function") {
          armorTypeName = window.translateText(armorTypeName);
        }
        return armorTypeName;
      }

      if (this.isFoodItem(item)) {
        return T('ItemUtils.category.food');
      }
      if (this.isToolsItem(item)) {
        return T('ItemUtils.category.tools');
      }

      // Return general item type for all other items
      if (DataManager.isItem(item)) {
        if (item.itypeId === 2) {
          return T('ItemUtils.category.materials');
        }
        return T('ItemUtils.category.item');
      }

      return null;
    },

    /**
     * Get bust image path based on actor ID and custom variables
     */
    getActorBustImagePath: function (actor) {
      if (!actor) return null;

      const actorId = actor.actorId && actor.actorId();
      const characterName = actor.characterName();

      // Player 1 (Actor 1) special handling
      if (actorId === 1) {
        // Priority 1: Check Variable 109 (Player 1 bust name)
        const player1BustName = $gameActors.actor(1).vnBust();
        if (player1BustName && player1BustName !== "") {
          return "img/busts/" + player1BustName;
        }

        // Priority 2: If Switch 77 is ON, use Variable 106 for monster form
        if ($gameSwitches.value(77)) {
          const player1MonsterName = $gameActors.actor(1).vnBattler();
          if (player1MonsterName && player1MonsterName !== "") {
            return "img/enemies/" + player1MonsterName;
          }
        }

        // Priority 3: Fall back to SpritesAssociation
        if (characterName && SpritesAssociation) {
          const spritesheetName = characterName.split('.')[0];
          const characterIndex = actor.characterIndex();

          if (SpritesAssociation[spritesheetName] &&
            SpritesAssociation[spritesheetName][characterIndex]) {
            const bustName = SpritesAssociation[spritesheetName][characterIndex];
            return "img/busts/" + bustName;
          }
        }

        return "img/busts/7";
      }

      // Players 2 & 3: same priority as Player 1. The bust name comes first,
      // then the battler image when the slot is flagged as a creature (switch
      // 78/79) - that field holds an img/enemies/ name, never a bust one.
      if (actorId === 2 || actorId === 3) {
        const bustName = actor.vnBust();
        if (bustName && bustName !== "") {
          return "img/busts/" + bustName;
        }
        if ($gameSwitches.value(actorId === 2 ? 78 : 79)) {
          const monsterName = actor.vnBattler();
          if (monsterName && monsterName !== "") {
            return "img/enemies/" + monsterName;
          }
        }
      }

      // Fallback to SpritesAssociation for actors 2 & 3
      if (characterName && SpritesAssociation) {
        const spritesheetName = characterName.split('.')[0];
        const characterIndex = actor.characterIndex();

        if (SpritesAssociation[spritesheetName] &&
          SpritesAssociation[spritesheetName][characterIndex]) {
          const bustName = SpritesAssociation[spritesheetName][characterIndex];
          return "img/busts/" + bustName;
        }
      }

      // Final fallback to default bust path structure
      return "img/busts/7";
    },

    /**
     * Truncate text and add ellipsis if needed
     */
    truncateTextWithEllipsis: function (text, maxLength) {
      if (text.length > maxLength) {
        return text.substring(0, maxLength - 3) + "...";
      }
      return text;
    },

    /**
     * Check if item has specific category
     */
    hasItemCategory: function (item, category) {
      if (!item || !item.note) return false;
      const regex = new RegExp(`<category:${category}>`, "i");
      return regex.test(item.note);
    },

    /**
     * Rarity Tiers configuration
     */
    RARITY_TIERS: [
      // i18n-ignore-start  rarity ids; the label is ItemUtils.rarity.<id>
      { name: "Common", colorCode: "#FFFFFF", minPrice: 0, maxPrice: 999 },
      { name: "Uncommon", colorCode: "#1AFF1A", minPrice: 1000, maxPrice: 9999 },
      { name: "Rare", colorCode: "#0080FF", minPrice: 10000, maxPrice: 99999 },
      { name: "Epic", colorCode: "#8000FF", minPrice: 100000, maxPrice: 999999 },
      { name: "Legendary", colorCode: "#FF8000", minPrice: 1000000, maxPrice: Infinity }
    ],
    // i18n-ignore-end
    rarityLabel: function (id) {
      const key = 'ItemUtils.rarity.' + String(id || '');
      return T.has(key) ? T(key) : String(id || '');
    },

    /**
     * The class that inks a name at this rarity: rarity--common and so on,
     * defined in theme.css off the --rarity-* tokens. Prefer this to
     * colorCode in HTML. colorCode stays for the canvas windows, which can
     * only be handed a colour string, and for the loot roller, which reads it
     * as data rather than paint.
     *
     * The presets used to reach the same effect with attribute selectors on
     * the inline colour ([style*="#FF8000"]), which is why the hexes above are
     * not free to change: they are now, and those hacks are gone.
     */
    rarityClass: function (rarity) {
      const id = rarity && rarity.name ? rarity.name : rarity;
      return 'rarity--' + String(id || 'common').toLowerCase();
    },

    /** The class for an item, straight from the item. */
    itemRarityClass: function (item) {
      return this.rarityClass(this.getItemRarity(item));
    },

    /**
     * Get item rarity based on price
     */
    getItemRarity: function (item) {
      if (!item) return this.RARITY_TIERS[0];
      const price = item.price || 0;
      return this.RARITY_TIERS.find(tier => 
        price >= tier.minPrice && 
        (tier.maxPrice === null || tier.maxPrice === undefined || price <= tier.maxPrice)
      ) || this.RARITY_TIERS[0];
    }
  };

  // Load rarity from JSON
  fetch('js/db/Items/Rarity.json')
    .then(response => response.json())
    .then(data => {
      window.ItemSystemUtils.RARITY_TIERS = data;
    })
    .catch(err => {
      console.warn("Failed to load Rarity.json, using fallback tiers:", err);
    });

  //=============================================================================
  // Weight cache invalidation hooks
  //=============================================================================

  const _Game_Party_gainItem = Game_Party.prototype.gainItem;
  Game_Party.prototype.gainItem = function (item, amount, includeEquip) {
    _Game_Party_gainItem.call(this, item, amount, includeEquip);
    invalidateWeightCache();
  };

  const _Game_Party_addActor = Game_Party.prototype.addActor;
  Game_Party.prototype.addActor = function (actorId) {
    _Game_Party_addActor.call(this, actorId);
    invalidateWeightCache();
  };

  const _Game_Party_removeActor = Game_Party.prototype.removeActor;
  Game_Party.prototype.removeActor = function (actorId) {
    _Game_Party_removeActor.call(this, actorId);
    invalidateWeightCache();
  };

  const _Game_Actor_changeEquip = Game_Actor.prototype.changeEquip;
  Game_Actor.prototype.changeEquip = function (slotId, item) {
    _Game_Actor_changeEquip.call(this, slotId, item);
    invalidateWeightCache();
  };

  const _Game_Actor_forceChangeEquip = Game_Actor.prototype.forceChangeEquip;
  Game_Actor.prototype.forceChangeEquip = function (slotId, item) {
    _Game_Actor_forceChangeEquip.call(this, slotId, item);
    invalidateWeightCache();
  };

  // Actor params (FOR/COS) can also change on level up / state changes;
  // refresh() runs on those occasions (not per frame), so hook it too.
  const _Game_Actor_refresh = Game_Actor.prototype.refresh;
  Game_Actor.prototype.refresh = function () {
    _Game_Actor_refresh.call(this);
    invalidateWeightCache();
  };

  // New game / loaded save replace $gameParty entirely.
  const _DataManager_createGameObjects = DataManager.createGameObjects;
  DataManager.createGameObjects = function () {
    _DataManager_createGameObjects.call(this);
    invalidateWeightCache();
  };

  const _DataManager_extractSaveContents = DataManager.extractSaveContents;
  DataManager.extractSaveContents = function (contents) {
    _DataManager_extractSaveContents.call(this, contents);
    invalidateWeightCache();
  };

  //=============================================================================
  // Game_Player Movement Speed Override
  //=============================================================================

  // Sandbox/test parties are exempt from encumbrance entirely: no speed
  // penalty and no standing notice.
  function isSandboxParty() {
    return !!(($gameSystem && $gameSystem._isSandboxMode) ||
      ($gameParty && $gameParty.leader && $gameParty.leader() &&
        $gameParty.leader().name() === "Test"));  // i18n-ignore  debug account name
  }

  // A vehicle carries the load, not the party: nothing they are hauling slows a
  // camper down, and inside its cabin the packs are on the floor rather than on
  // anybody's back. So the penalty is waived both at the wheel and on a
  // vehicle's own interior map (MergedVehicleSystem.isOnVehicleInteriorMap).
  function isLoadCarriedByVehicle() {
    if (typeof $gamePlayer !== "undefined" && $gamePlayer &&
      $gamePlayer.isInVehicle && $gamePlayer.isInVehicle()) return true;
    return !!window.MergedVehicleSystem?.isOnVehicleInteriorMap?.();
  }

  const _Game_Player_realMoveSpeed = Game_Player.prototype.realMoveSpeed;
  Game_Player.prototype.realMoveSpeed = function () {
    let speed = _Game_Player_realMoveSpeed.call(this);

    if (!isSandboxParty() && !isLoadCarriedByVehicle() &&
      window.ItemSystemUtils && window.ItemSystemUtils.isOverencumbered()) {
      speed = Math.max(1, speed * OVERENCUMBERED_SPEED_PENALTY);
    }

    return speed;
  };

  //=============================================================================
  // Overencumbered notice
  //=============================================================================
  // Carrying too much is a condition, not an event, so it is reported as a
  // standing notification (ParchmentToast.sticky) that stays up for as long as
  // the party is over its limit and comes down the moment it is not. The
  // reading is redrawn only when the load actually changes, so a permanent
  // toast costs nothing per frame.
  //
  // A fight is the one place it is never shown: the load cannot change there
  // and the notice would sit over the battle HUD for the whole encounter. It
  // is taken down on the way in and comes back on the way out.

  const ENCUMBRANCE_KEY = "encumbrance";  // i18n-ignore  dedupe key
  const ENCUMBRANCE_CHECK_FRAMES = 20;
  let _encumbranceFrames = 0;
  let _encumbranceShown = "";

  function refreshEncumbranceNotice() {
    const toast = window.ParchmentToast;
    const utils = window.ItemSystemUtils;
    if (!toast || typeof toast.sticky !== "function" || !utils) return;

    const inBattle = (typeof Scene_Battle !== "undefined" &&
      SceneManager._scene instanceof Scene_Battle) ||
      (typeof $gameParty !== "undefined" && $gameParty && $gameParty.inBattle());

    const hasParty = typeof $gameParty !== "undefined" && $gameParty &&
      $gameParty.members().length > 0;
    const over = !inBattle && hasParty && !isSandboxParty() && utils.isOverencumbered();

    if (!over) {
      if (_encumbranceShown) {
        toast.dismiss(ENCUMBRANCE_KEY);
        _encumbranceShown = "";
      }
      return;
    }

    const excess = utils.calculateTotalWeight() - utils.calculateMaxCarryWeight();
    const load = utils.formatWeight(Math.max(0, excess));
    if (load === _encumbranceShown && toast.isLive(ENCUMBRANCE_KEY)) return;
    _encumbranceShown = load;
    toast.sticky(T('ItemUtils.encumbrance.load', { load: load }), {
      key: ENCUMBRANCE_KEY,
      severity: "danger",
      title: T('ItemUtils.encumbrance.title')
    });
  }

  const _Scene_Base_update = Scene_Base.prototype.update;
  Scene_Base.prototype.update = function () {
    _Scene_Base_update.call(this);
    if (--_encumbranceFrames <= 0) {
      _encumbranceFrames = ENCUMBRANCE_CHECK_FRAMES;
      refreshEncumbranceNotice();
    }
  };

})();

/* =========================================================================
 * Procedural Lore Tokens (integrated into the Item System).
 * Resolves {nation}/{leader}/{title}/{govType}/{city}/{faction}/{deity}
 * tokens in an item or armor <Lore:> string, deterministically per item id,
 * from the live world-generation system (NPCPolitics / NPCWorldWeb), with a
 * static lore-flavored fallback when the world is not generated yet.
 * Exposed as window.ItemSystemUtils.fillLore(template, refId, reseed) and the
 * back-compat alias window.ArmorLore.fill used by the inventory/shop/item UIs.
 * The third argument is optional and defaults to 0; pass a non-zero nonce to
 * preview a different roll of the same lore (see HypernetObjectIndex.js). It
 * never writes anything back, so the canonical text is untouched.
 * ========================================================================= */
(function () {
  "use strict";

  // i18n-ignore-start  invented world proper nouns: nations, leaders, titles
  // and government forms, used only when world gen has not produced any yet
  var FALLBACK = {
    nation: ["Varlenia", "the Serene Republic of Ghent", "the Naguka Reach", "Beagle",
             "the Antwerp Pale", "the Verden Holdfast", "the Abyssal Marches", "New Westford"],
    leader: ["Margaret Thatcher", "Aleister Crowley", "Eris", "General Voss",
             "Archon Maelis", "Solomon Vane", "Enrico Mattei", "Iris Calder"],
    title:  ["Sultan", "Prime Minister", "Archon", "General Secretary",
             "High Priest", "First Speaker", "Warlord"],
    govType:["the sultanate", "the serene republic", "the technocracy",
             "the warband confederacy", "the divine pantheon", "the corporatocracy"],
    city:   ["Beagle", "Ghent", "Antwerp", "Varlenia City", "the Road's end",
             "Westford", "the City of Ghosts"],
    faction:["the Mages Guild", "the Archive Foundation", "the Hypercapitalist Collective",
             "Esoteric Heavy Industries", "the Trucker Society", "the Gods"],
    deity:  ["Eris", "the Asphalt God", "the slain Father", "a bound demiurge",
             "the Prime Deity", "an oil-born elemental"]
  };
  // i18n-ignore-end

  function worldSeed() {
    try {
      if (window.NPCShared && typeof NPCShared.worldSeed === "function") return NPCShared.worldSeed() >>> 0;
      if (window.HistoryManager && typeof HistoryManager.getSeed === "function") return HistoryManager.getSeed() >>> 0;
    } catch (e) {}
    return 19002001;
  }

  // reseed is an optional extra mixin (default 0) that lets a caller ask for a
  // different roll of the same lore without touching the world seed or the item
  // id. Only the Object Index's "randomize" preview uses it; at 0 every stage
  // below is bit-identical to what it produced before the parameter existed.
  function roll(refId, salt, reseed) {
    var h = (worldSeed() ^ (((refId | 0) + 1) * 2654435761) ^ (salt * 0x9E3779B1)) >>> 0;
    if (reseed) h = (h ^ mixReseed(reseed)) >>> 0;
    h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0;
    return h >>> 0;
  }

  // Avalanche the reseed before it is mixed in, so consecutive nonces (1, 2, 3)
  // do not produce neighbouring streams that pick the same options.
  function mixReseed(n) {
    var h = (n >>> 0) || 0x9E3779B1;
    h = (h ^ (h >>> 16)) >>> 0;
    h = Math.imul(h, 0x85ebca6b) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 0xc2b2ae35) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
  }

  function pickFrom(arr, refId, salt, reseed) {
    if (!arr || !arr.length) return null;
    var v = arr[roll(refId, salt, reseed) % arr.length];
    if (v && typeof v === "object") v = v.name || v.group || v.title || null;
    return (typeof v === "string" && v.length) ? v : null;
  }

  function powerNames() {
    try { if (window.NPCPolitics && typeof NPCPolitics.listPowers === "function") { var p = NPCPolitics.listPowers(); if (p && p.length) return p; } } catch (e) {}
    return null;
  }
  function cityNames() {
    try { if (window.NPCWorldWeb && typeof NPCWorldWeb.listGroups === "function") { var g = NPCWorldWeb.listGroups(); if (g && g.length) return g; } } catch (e) {}
    return null;
  }
  function powerObj(name) {
    try { if (window.NPCPolitics && typeof NPCPolitics.getPower === "function") return NPCPolitics.getPower(name); } catch (e) {}
    return null;
  }

  function resolve(refId, reseed) {
    var ctx = {};
    var powers = powerNames();
    var cities = cityNames();
    ctx.nation  = pickFrom(powers, refId, 1, reseed) || pickFrom(FALLBACK.nation, refId, 1, reseed);
    ctx.faction = pickFrom(powers, refId, 3, reseed) || pickFrom(FALLBACK.faction, refId, 3, reseed);
    ctx.city    = pickFrom(cities, refId, 2, reseed) || pickFrom(FALLBACK.city, refId, 2, reseed);
    var p = powerObj(ctx.nation);
    if (p) {
      try {
        var head = p.politicians && p.headId != null ? p.politicians[p.headId] : null;
        ctx.leader  = (head && head.name) || pickFrom(FALLBACK.leader, refId, 4, reseed);
        ctx.title   = p.headTitle || pickFrom(FALLBACK.title, refId, 5, reseed);
        ctx.govType = p.govType ? ("the " + p.govType) : pickFrom(FALLBACK.govType, refId, 6, reseed);
      } catch (e) {}
    }
    if (!ctx.leader)  ctx.leader  = pickFrom(FALLBACK.leader, refId, 4, reseed);
    if (!ctx.title)   ctx.title   = pickFrom(FALLBACK.title, refId, 5, reseed);
    if (!ctx.govType) ctx.govType = pickFrom(FALLBACK.govType, refId, 6, reseed);
    ctx.deity = pickFrom(FALLBACK.deity, refId, 7, reseed);
    return ctx;
  }

  // ---- Combinatorial skill-lore generator -------------------------------
  // A <Lore:> value of the form "#School" (or "#School!" to force the
  // forbidden family) is not a finished sentence but a directive: build the
  // lore at runtime from the js/db/Skills/Lore.json grammar, seeded from the
  // live world seed XOR the skill id, so every world tells its own history.
  // The assembled text still carries {faction}/{city}/... tokens, which the
  // normal token pass below fills. See gen_skill_lore.py.
  // The grammar is structure plus vocabulary: js/db/Skills/Lore.json owns the
  // shape (which family an archetype belongs to, which token bank it draws on)
  // and carries the English words; js/i18n/<lang>/lore/LoreGrammar.json carries
  // that language's words and is laid over it. Only string leaves are replaced,
  // so a bank the translation has not reached keeps the English one and the
  // sentence still assembles. `family` and `tokens` are ids and are never taken
  // from the overlay.
  var _grammarCache = null, _grammarLang = null;
  function grammarOverlay(base, over) {
    if (!over || !base) return;
    Object.keys(over).forEach(function (k) {
      if (k === 'family' || k === 'tokens' || k === '_comment' || k === 'version') return;
      var o = over[k];
      if (Array.isArray(o)) {
        if (o.length) base[k] = o.slice();
      } else if (o && typeof o === 'object') {
        if (base[k] && typeof base[k] === 'object') grammarOverlay(base[k], o);
      } else if (typeof o === 'string' && o) {
        base[k] = o;
      }
    });
  }
  function grammar() {
    var db = (window.Skills && window.Skills.Lore) ? window.Skills.Lore : null;
    if (!db) return null;
    var lang = (window.ConfigManager && ConfigManager.language) || 'en';
    if (_grammarCache && _grammarLang === lang) return _grammarCache;
    _grammarLang = lang;
    if (lang === 'en' || !window.T || !T.obj) { _grammarCache = db; return db; }
    var over = T.has('LoreGrammar') ? T.obj('LoreGrammar') : null;
    if (!over) { _grammarCache = db; return db; }
    var merged = JSON.parse(JSON.stringify(db));
    grammarOverlay(merged, over);
    _grammarCache = merged;
    return merged;
  }

  // Deterministic xorshift stream seeded by worldSeed ^ refId. Distinct from
  // roll() (which mixes a per-call salt) so the sentence shape follows the
  // world seed rather than the token layout.
  function loreRng(refId, reseed) {
    var s = (worldSeed() ^ (((refId | 0) + 1) * 2246822519)) >>> 0;
    if (reseed) s = (s ^ mixReseed(reseed)) >>> 0;
    if (!s) s = 0x9E3779B1;
    return function () {
      s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
      return s;
    };
  }
  function rpick(rng, arr) {
    if (!arr || !arr.length) return "";
    return arr[rng() % arr.length];
  }
  function capFirst(str) {
    if (!str) return str;
    return str.replace(/^(\s*)([a-z])/, function (m, sp, c) { return sp + c.toUpperCase(); });
  }

  function generateLore(directive, refId, reseed) {
    var g = grammar();
    if (!g) return "";
    var forceForbidden = false;
    var key = directive.replace(/^#/, "");
    if (key.slice(-1) === "!") { forceForbidden = true; key = key.slice(0, -1); }
    // category alias -> archetype
    if (g.categoryArchetype && g.categoryArchetype[key]) key = g.categoryArchetype[key];
    var arch = (g.archetypes && g.archetypes[key]) || g.fallbackArchetype || null;
    if (!arch) return "";
    var famName = forceForbidden && g.families && g.families.forbidden ? "forbidden" : arch.family;
    var fam = (g.families && g.families[famName]) || (g.families && g.families.generic) || null;
    if (!fam) return "";
    var rng = loreRng(refId, reseed);
    var tmpl = rpick(rng, fam.templates) || "";
    // Pre-roll one pick from each bank so repeated slots stay consistent.
    var banks = {
      art:       rpick(rng, arch.art),
      era:       rpick(rng, arch.era),
      mechanism: rpick(rng, arch.mechanism),
      attrib:    rpick(rng, arch.attrib)
    };
    var tokBankName = (fam.tokens === "arcane") ? "arcane" : "worldly";
    var tokBank = (g.tokenBanks && g.tokenBanks[tokBankName]) || [];
    banks.token = rpick(rng, tokBank);
    var out = tmpl.replace(/\{(\w+?)(_cap)?\}/g, function (m, name, cap) {
      var lname = name.charAt(0).toLowerCase() + name.slice(1);
      var val = banks[lname];
      // Not a grammar slot (e.g. {faction}) -> leave it for the token pass.
      if (val == null) return m;
      // Capitalize when the slot name was written capitalized or ends in _cap.
      var wantCap = cap === "_cap" || (name[0] >= "A" && name[0] <= "Z");
      return wantCap ? capFirst(val) : val;
    });
    return out;
  }

  // Capitalize the first letter of the string and of each sentence. Token
  // clauses are authored lowercase (e.g. "the Mages Guild ...") so they read
  // naturally mid-sentence; after assembly a clause may land at a sentence
  // start, so normalize here.
  function capSentences(str) {
    return str.replace(/(^|[.!?]\s+)([a-z])/g, function (m, pre, c) { return pre + c.toUpperCase(); });
  }

  // reseed (optional, default 0) varies every stage below without touching the
  // world seed or the item id, so a caller can preview an alternative reading of
  // the same lore. Omit it and the output is exactly what it has always been.
  function fill(template, refId, reseed) {
    if (!template || typeof template !== "string") return template;
    var t = template, generated = false;
    reseed = reseed >>> 0;
    if (t.charAt(0) === "#") {
      t = generateLore(t, refId | 0, reseed);
      if (!t) return "";
      generated = true;
    }
    // Combinatorial {a | b | c} groups first (same service the item
    // descriptions use, seeded per refId); it leaves single-option groups such
    // as {faction} alone for the token pass below.
    if (t.indexOf("|") !== -1 && window.ItemDescription) {
      t = window.ItemDescription.resolve(
        t, "lore:" + (refId | 0) + (reseed ? ":" + reseed : "")
      );
    }
    if (t.indexOf("{") !== -1) {
      var ctx = resolve(refId | 0, reseed);
      t = t.replace(/\{(\w+)\}/g, function (m, key) { return (ctx[key] != null) ? ctx[key] : m; });
    }
    // Always: a token clause is authored lowercase ("the Mages Guild ...") and
    // may land at the start of a sentence once assembled, whether the lore was
    // generated from a #directive or written inline in the note.
    return capSentences(t);
  }

  // Convenience: resolved <Lore:> text for an item/armor, or "" if none.
  // The <Lore:> tag holds a translation key (LoreItems.<id>, LoreWeapons.<id>,
  // LoreArmors.<id>, LoreSkills.<id>); the template lives in
  // js/i18n/<lang>/lore/. A tag that still holds a literal template or a
  // #School directive is used as written, so nothing has to be lifted to work.
  function loreTemplate(value) {
    var v = String(value == null ? "" : value).trim();
    if (!v) return "";
    return (typeof T === "function" && T.has(v)) ? T(v) : v;
  }

  function loreFor(item, reseed) {
    if (!item || !item.meta || !item.meta.Lore) return "";
    return fill(loreTemplate(item.meta.Lore), item.id, reseed);
  }

  /* -----------------------------------------------------------------------
   * How a thing is made, for every panel that inspects one.
   *
   * An entry carries its own recipe and, for weapons and armor, the trade and
   * the tier of that trade the forge asks for (Quest/ThinkerMenu.js):
   *
   *   <Recipe: 865x13, 863x5>   <Craft: Bladesmithing>   <CraftLevel: 5>
   *
   * craftInfo() reads them; craftHTML() draws the block the equip screen, the
   * shops and the forge all show, so a recipe reads the same everywhere and
   * the player never has to open a crafting menu to find out what a thing
   * costs to make. Quantities are shown against what the party actually holds.
   * --------------------------------------------------------------------- */
  function craftInfo(item) {
    if (!item || !item.note) return null;
    const m = item.note.match(/<Recipe:\s*(.+?)>/i);
    if (!m) return null;
    const materials = [];
    for (const part of m[1].split(",")) {
      const bits = part.trim().split("x");
      const id = parseInt(bits[0]);
      if (!id) continue;
      materials.push({ id: id, qty: parseInt(bits[1]) || 1 });
    }
    if (!materials.length) return null;
    const trade = (item.meta && item.meta.Craft) ? String(item.meta.Craft).trim() : "";
    const tier = Number(item.meta && item.meta.CraftLevel) || 0;
    return { materials: materials, trade: trade, tier: tier };
  }

  function craftHTML(item) {
    const info = craftInfo(item);
    if (!info || typeof $dataItems === "undefined" || !$dataItems) return "";
    const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const tr = (s) => (typeof window.translateText === "function" ? window.translateText(s) : s);

    let head = T.has("Blacksmith.materials") ? T("Blacksmith.materials") : "Materials";
    if (info.trade) {
      const levels = window.Specializations;
      const tierName = (info.tier && levels && levels.ready && levels.levelName)
        ? levels.levelName(info.tier) : "";
      head += " - " + esc(tr(info.trade)) + (tierName ? ", " + esc(tierName) : "");
    }

    let rows = "";
    for (const mat of info.materials) {
      const data = $dataItems[mat.id];
      if (!data) continue;
      const owned = (typeof $gameParty !== "undefined" && $gameParty) ? $gameParty.numItems(data) : 0;
      const enough = owned >= mat.qty;
      const idx = Number(data.iconIndex) || 0;
      const icon = `<span class="toast-icon" style="width:1.1em;height:1.1em;` +
        `background-size:17.6em auto;background-position:-${1.1 * (idx % 16)}em -${1.1 * Math.floor(idx / 16)}em;"></span>`;
      rows += `<div class="craft-mat-row${enough ? "" : " short"}">` +
        `<span class="craft-mat-name">${icon}${esc(tr(data.name))}</span>` +
        `<span class="craft-mat-count">${owned}/${mat.qty}</span></div>`;
    }
    if (!rows) return "";
    return `<div class="craft-block"><div class="craft-block-title">${head}</div>${rows}</div>`;
  }

  //=============================================================================
  // Trait lines: one compact sentence per non-stat trait (element resist,
  // attack element/state, extra skill grants, dual wielding...) an item's
  // RPG Maker trait array carries. Single source of truth for the Inventory
  // and Equipment screens so their trait-code tables never drift apart again
  // (see the STR-rate/attack-element mislabel bug this replaced).
  //=============================================================================
  function traitLines(item) {
    if (!item || !Array.isArray(item.traits)) return [];
    const T = window.T;
    const getParamName = (id) => (['HP', 'MP', 'STR', 'CON', 'INT', 'WIS', 'DEX', 'PSI'][id] || T('Inventory.spec.stat'));
    const lines = [];
    item.traits.forEach((tr) => {
      const val = tr.value; const did = tr.dataId; let desc = '';
      if      (tr.code === 11) { const el = $dataSystem.elements[did]; desc = T('Inventory.trait.resistance', { element: el || T('Inventory.trait.elementFallback'), pct: Math.round(val * 100) }); }
      else if (tr.code === 12) desc = T('Inventory.trait.debuffRate', { param: getParamName(did), pct: Math.round(val * 100) });
      else if (tr.code === 13) { const s = $dataStates[did]; if (s && s.name) desc = T('Inventory.trait.susceptibility', { state: s.name, pct: Math.round(val * 100) }); }
      else if (tr.code === 14) { const s = $dataStates[did]; if (s && s.name) desc = T('Inventory.trait.resistState', { state: s.name }); }
      else if (tr.code === 21) desc = T('Inventory.trait.paramRate', { param: getParamName(did), pct: Math.round(val * 100) });
      else if (tr.code === 22) { const exN = T.list('Inventory.xparam'); desc = T('Inventory.trait.xparamLine', { name: exN[did] || T('Inventory.trait.specialStat'), value: `${val >= 0 ? '+' : ''}${Math.round(val * 100)}` }); }
      else if (tr.code === 23) { const spN = T.list('Inventory.sparam'); desc = T('Inventory.trait.sparamLine', { name: spN[did] || T('Inventory.trait.specialProperty'), pct: Math.round(val * 100) }); }
      else if (tr.code === 31) { const el = $dataSystem.elements[did]; desc = T('Inventory.trait.attackElement', { element: el || T('Inventory.trait.physicalFallback') }); }
      else if (tr.code === 32) { const s = $dataStates[did]; if (s && s.name) desc = T('Inventory.trait.attackState', { state: s.name, pct: Math.round(val * 100) }); }
      else if (tr.code === 33) desc = T('Inventory.trait.attackSpeed', { value: `${val > 0 ? '+' : ''}${val}` });
      else if (tr.code === 34) desc = T('Inventory.trait.attackTimes', { value: val });
      else if (tr.code === 41) { const st = $dataSystem.skillTypes[did]; if (st) desc = T('Inventory.trait.allowsSkillType', { type: st }); }
      else if (tr.code === 42) { const st = $dataSystem.skillTypes[did]; if (st) desc = T('Inventory.trait.sealSkillType', { type: st }); }
      else if (tr.code === 43) { const sk = $dataSkills[did]; if (sk && sk.name) desc = T('Inventory.trait.grantsSkill', { skill: sk.name }); }
      else if (tr.code === 44) { const sk = $dataSkills[did]; if (sk && sk.name) desc = T('Inventory.trait.sealsSkill', { skill: sk.name }); }
      else if (tr.code === 51) { const wt = $dataSystem.weaponTypes[did]; desc = T('Inventory.trait.allowsWeapon', { type: wt || T('Inventory.spec.label.weaponFallback') }); }
      else if (tr.code === 52) { const at = $dataSystem.armorTypes[did]; desc = T('Inventory.trait.allowsArmor', { type: at || T('Inventory.spec.label.armorFallback') }); }
      else if (tr.code === 53) { const eq = $dataSystem.equipTypes[did]; desc = T('Inventory.trait.lockSlot', { slot: eq || T('Inventory.spec.label.slotFallback') }); }
      else if (tr.code === 54) { const eq = $dataSystem.equipTypes[did]; desc = T('Inventory.trait.sealSlot', { slot: eq || T('Inventory.spec.label.slotFallback') }); }
      else if (tr.code === 55) { if (did === 1) desc = T('Inventory.trait.dualWielding'); }
      else if (tr.code === 61) { if (val !== 0) desc = T('Inventory.trait.actionPlus', { pct: Math.round(val * 100) }); }
      else if (tr.code === 62) { const flagN = T.list('Inventory.specialFlag'); desc = T('Inventory.trait.specialFlagLine', { name: flagN[did] || T('Inventory.trait.specialProperty') }); }
      if (desc) lines.push(desc);
    });
    return lines;
  }

  window.ItemSystemUtils = window.ItemSystemUtils || {};
  window.ItemSystemUtils.fillLore = fill;
  window.ItemSystemUtils.resolveLoreTokens = resolve;
  window.ItemSystemUtils.loreFor = loreFor;
  window.ItemSystemUtils.loreTemplate = loreTemplate;
  window.ItemSystemUtils.craftInfo = craftInfo;
  window.ItemSystemUtils.craftHTML = craftHTML;
  window.ItemSystemUtils.traitLines = traitLines;
  window.ArmorLore = { fill: fill, resolve: resolve, loreFor: loreFor };
})();

/* =========================================================================
 * Combinatorial item descriptions.
 *
 * Every real entry in data/Items.json writes its `description` as a
 * combinatorial template rather than a fixed phrase, e.g.
 *
 *   {Kills germs | Sterilizes hands}; {restores | rebuilds} hygiene.
 *
 * Groups nest and may hold whole phrases, so one template covers dozens of
 * wordings. The pick is NOT random: for a given world seed (default 19002001,
 * read through HistoryManager/NPCShared) each item always resolves to the same
 * wording, and different items resolve differently, exactly like the enemy
 * <En:> descriptions handled by EnemyDescription.js. Change the world seed and
 * every item's phrasing re-rolls together.
 *
 * Resolution happens IN PLACE on $dataItems, so the cramped core help box, the
 * inventory/shop DOM panels and the localization exporter all read a finished
 * string with no per-consumer wiring. The raw templates are kept aside and the
 * pass re-runs whenever the world seed changes (new game, save load, setSeed).
 *
 * Exposed as window.ItemDescription (resolve / describe / raw / apply) and
 * window.ItemSystemUtils.resolveVariants.
 * ========================================================================= */
(function () {
  "use strict";

  // ---- seed helpers (same xorshift stream as NPCShared / EnemyDescription) --
  function nameHash(str) {
    try {
      if (window.NPCShared && typeof NPCShared.nameHash === "function") return NPCShared.nameHash(str) >>> 0;
    } catch (e) {}
    var h = 5381, s = String(str);
    for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h || 1;
  }

  function worldSeed() {
    try {
      if (window.NPCShared && typeof NPCShared.worldSeed === "function") return NPCShared.worldSeed() >>> 0;
      if (window.HistoryManager && typeof HistoryManager.getSeed === "function") return HistoryManager.getSeed() >>> 0;
    } catch (e) {}
    return 19002001; // canon default
  }

  // Avalanche (murmur3 finalizer). xorshift is linear, so two items whose seeds
  // differ in a few bits would otherwise open with the same picks and whole runs
  // of neighbouring ids would read alike. Mixing first decorrelates them.
  function mix32(h) {
    h = (h ^ (h >>> 16)) >>> 0;
    h = Math.imul(h, 0x85ebca6b) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 0xc2b2ae35) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
  }

  function makeRng(seed) {
    var s = mix32((seed || 1) >>> 0) || 0x9e3779b1;
    return function () {
      var x = s;
      x ^= x << 13; x >>>= 0;
      x ^= x >> 17;
      x ^= x << 5;  x >>>= 0;
      s = x;
      return x / 4294967296;
    };
  }

  // ---- template parsing ----------------------------------------------------
  // Nodes: { t:'text', v:string } | { t:'choice', opts:[nodes,...] }
  // A brace group with a single option is NOT a choice: it is left verbatim
  // (braces included) so lore tokens like {faction} survive this pass and are
  // still filled by fillLore() downstream.
  function trimSeq(nodes) {
    if (nodes.length && nodes[0].t === "text") {
      nodes[0].v = nodes[0].v.replace(/^[ \t]+/, "");
      if (!nodes[0].v) nodes.shift();
    }
    if (nodes.length && nodes[nodes.length - 1].t === "text") {
      var last = nodes[nodes.length - 1];
      last.v = last.v.replace(/[ \t]+$/, "");
      if (!last.v) nodes.pop();
    }
    return nodes;
  }

  function parseTemplate(text) {
    var i = 0;

    function parseSeq(top) {
      var nodes = [], buf = "";
      var flush = function () { if (buf) { nodes.push({ t: "text", v: buf }); buf = ""; } };
      while (i < text.length) {
        var c = text[i];
        if (c === "{") {
          flush(); i++;
          var group = parseChoice();
          if (group.opts.length > 1) nodes.push(group);
          else { // single option: keep the braces, resolve anything inside
            nodes.push({ t: "text", v: "{" });
            var inner = group.opts[0] || [];
            for (var k = 0; k < inner.length; k++) nodes.push(inner[k]);
            nodes.push({ t: "text", v: "}" });
          }
        } else if (!top && (c === "|" || c === "}")) break;
        else { buf += c; i++; }
      }
      flush();
      return nodes;
    }

    function parseChoice() {
      var opts = [trimSeq(parseSeq(false))];
      while (text[i] === "|") { i++; opts.push(trimSeq(parseSeq(false))); }
      if (text[i] === "}") i++; // consume closing brace
      return { t: "choice", opts: opts };
    }

    return parseSeq(true);
  }

  // Fix an indefinite article that the chosen option just flipped, e.g.
  // "a {shard | ember}" -> "an ember". Only an article directly preceding a
  // resolved choice is touched, so authored prose is never disturbed.
  var ARTICLE_TAIL = /\b([Aa])n?([ \t]+)$/;

  function evalNodes(nodes, rng) {
    var out = "";
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.t === "text") { out += n.v; continue; }
      var idx = n.opts.length <= 1 ? 0 : Math.floor(rng() * n.opts.length) % n.opts.length;
      var s = evalNodes(n.opts[idx] || [], rng);
      var m = out.match(ARTICLE_TAIL);
      if (m && /[A-Za-z]/.test(s.charAt(0))) {
        var art = /^[aeiou]/i.test(s) ? "an" : "a";
        if (m[1] === "A") art = art.charAt(0).toUpperCase() + art.slice(1);
        out = out.slice(0, out.length - m[0].length) + art + m[2];
      }
      out += s;
    }
    return out;
  }

  // Tidy the spacing that option trimming leaves behind and collapse a word
  // repeated by two neighbouring synonym groups landing on the same term.
  function tidy(s) {
    return s
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]+([.,;:!?)])/g, "$1")
      .replace(/([([])[ \t]+/g, "$1")
      .replace(/\b(\w+)(?:[ \t]+\1\b)+/gi, "$1")
      .replace(/[ \t]+\n/g, "\n")
      .trim();
  }

  function hasVariants(text) {
    return typeof text === "string" && text.indexOf("{") !== -1 && text.indexOf("|") !== -1;
  }

  function resolve(text, seedKey) {
    if (typeof text !== "string" || text.indexOf("{") === -1) return text;
    var key = (seedKey === undefined || seedKey === null) ? text : seedKey;
    var rng = makeRng((worldSeed() ^ nameHash(key)) >>> 0);
    return tidy(evalNodes(parseTemplate(text), rng));
  }

  // ---- in-place pass over $dataItems ---------------------------------------
  var templates = null;   // id -> raw template, captured before the first pass
  var appliedSeed = null; // world seed the text currently in $dataItems reflects

  function captureTemplates() {
    templates = {};
    for (var i = 1; i < $dataItems.length; i++) {
      var item = $dataItems[i];
      if (item && hasVariants(item.description)) templates[i] = item.description;
    }
  }

  function apply(force) {
    if (typeof $dataItems === "undefined" || !$dataItems || !$dataItems.length) return;
    var seed = worldSeed() >>> 0;
    if (!force && appliedSeed === seed) return;
    if (!templates) captureTemplates();
    for (var id in templates) {
      var item = $dataItems[id];
      if (item) item.description = resolve(templates[id], "item:" + id);
    }
    appliedSeed = seed;
  }

  function raw(itemId) {
    if (!templates) {
      if (typeof $dataItems === "undefined" || !$dataItems) return "";
      captureTemplates();
    }
    return templates[Number(itemId)] || "";
  }

  function describe(itemId) {
    apply();
    var item = (typeof $dataItems !== "undefined" && $dataItems) ? $dataItems[Number(itemId)] : null;
    return item ? String(item.description || "") : "";
  }

  // ---- hooks: run once the database is up, and on every world-seed change --
  var _onDatabaseLoaded = Scene_Boot.prototype.onDatabaseLoaded;
  Scene_Boot.prototype.onDatabaseLoaded = function () {
    _onDatabaseLoaded.call(this);
    apply();
  };

  var _setupNewGame = DataManager.setupNewGame;
  DataManager.setupNewGame = function () {
    _setupNewGame.call(this);
    apply();
  };

  var _extractSaveContents = DataManager.extractSaveContents;
  DataManager.extractSaveContents = function (contents) {
    _extractSaveContents.call(this, contents);
    apply();
  };

  // Cheap safety net for a seed changed mid-play (HistoryManager.setSeed):
  // apply() is a single comparison when the seed has not moved.
  var _setItem = Window_Help.prototype.setItem;
  Window_Help.prototype.setItem = function (item) {
    apply();
    _setItem.call(this, item);
  };

  window.ItemSystemUtils = window.ItemSystemUtils || {};
  window.ItemSystemUtils.resolveVariants = resolve;
  window.ItemDescription = {
    resolve: resolve,
    describe: describe,
    raw: raw,
    apply: apply,
    hasVariants: hasVariants
  };
})();

//=============================================================================
// Item 3D Models
//=============================================================================
// Every item and every armour has a 3D model, built the same way the weapons
// are (Weapon/WeaponSystemProcedural.js and its Weapon3D_* families): a tree
// of primitives assembled by a builder, cached as a prototype and handed out
// as instances. The models are drawn only in the flat UI surfaces, the HUD,
// the backpack, the shop counter, the Thinker's bench and so on. Nothing here
// is ever equipped or posed.
//
// Two differences from the weapon pipeline, both deliberate:
//
//  * An item's look is FIXED. A weapon is world-persistent procedural content
//    and hangs off the world seed; a Health Potion is a manufactured object
//    and looks the same in every world, so the RNG here is seeded from the
//    database id and name alone.
//  * The dispatch reads the item's <category:> tag (and, for an armour, its
//    equip and armour type) rather than a weapon type. A category always has
//    a generic silhouette; a bespoke model per database id overrides it.
//
// The builders live in the Item3D_* files beside the weapon families and are
// injected at runtime from ITEM3D_FAMILIES below. None of them is listed in
// plugins.js. The whole shared construction library of WeaponSystemProcedural
// (_mat, _steel, _wood, seg, _rivets, the palettes, the geometry budget) is
// available as `this` inside a builder, because ItemModelSystem inherits from
// it.
//=============================================================================

(function () {
  "use strict";

  const ItemModelSystem = {
    // Seeded from the entry alone, never from the world: a manufactured object
    // looks the same everywhere.
    ITEM_SEED_SALT: 0x4954454d, // "ITEM"

    MODEL_CACHE_MAX: 32,
    _modelCache: new Map(),

    // category -> builder name. Filled in by the families.
    CATEGORY_MODELS: {},
    // "etypeId:atypeId" -> builder name, for armours.
    ARMOR_MODELS: {},
    // database id -> builder name, for the bespoke ones. Items are keyed by
    // 'i<id>', armours by 'a<id>', so the two id spaces never collide.
    UNIQUE_MODELS: {},

    _familyOwners: {},
    FALLBACK_MODEL: "createGenericItemModel",

    /** The one answer to "what family of thing is this". */
    categoryOf(entry) {
      if (!entry) return "";
      const m = /<category:\s*([^>]+)>/i.exec(entry.note || "");
      return m ? m[1].trim() : "";
    },

    isArmor(entry) {
      return !!(entry && entry.etypeId !== undefined && entry.atypeId !== undefined);
    },

    /** Cache and RNG key. Bespoke models are looked up under the same key. */
    keyFor(entry) {
      return (this.isArmor(entry) ? "a" : "i") + (entry.id || 0);
    },

    seedFor(entry) {
      const text = this.keyFor(entry) + ":" + (entry.name || "");
      let h = this.ITEM_SEED_SALT;
      for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0;
      return h >>> 0;
    },

    /**
     * The builder an entry is drawn with, in priority order: its own bespoke
     * model, then its category (or its armour slot), then the fallback.
     */
    builderFor(entry) {
      if (!entry) return null;
      const unique = this.UNIQUE_MODELS[this.keyFor(entry)];
      if (unique) return unique;
      if (this.isArmor(entry)) {
        return this.ARMOR_MODELS[entry.etypeId + ":" + entry.atypeId] ||
          this.ARMOR_MODELS[entry.etypeId + ":*"] ||
          this.FALLBACK_MODEL;
      }
      return this.CATEGORY_MODELS[this.categoryOf(entry)] || this.FALLBACK_MODEL;
    },

    /**
     * Calls a builder by name. A family that failed to load costs only the
     * models it carried: the entry falls back to the generic shape rather
     * than throwing into whatever menu asked for it.
     */
    build(name, entry, rand) {
      if (typeof this[name] === "function") return this[name](entry, rand);
      if (!this._missingBuilders) this._missingBuilders = {};
      if (!this._missingBuilders[name]) {
        this._missingBuilders[name] = true;
        console.warn("[ItemModelSystem] builder not loaded: " + name);
      }
      if (name !== this.FALLBACK_MODEL && typeof this[this.FALLBACK_MODEL] === "function") {
        return this[this.FALLBACK_MODEL](entry, rand);
      }
      return null;
    },

    _buildModel(entry) {
      if (!window.THREE || !this._linkLibrary()) return null;
      const rand = this.createSeededRandom(this.seedFor(entry));
      const restoreGeometry = this._patchGeometryBudget();
      try {
        const model = this.build(this.builderFor(entry), entry, rand);
        if (model) this.weldLooseParts(model);
        return model;
      } catch (e) {
        console.warn("[ItemModelSystem] model build failed for " + (entry && entry.name), e);
        return null;
      } finally {
        restoreGeometry();
      }
    },

    /**
     * The model for a database entry, ready to be added to a scene. Shared
     * geometry, per-instance materials, exactly as the weapons are handed out.
     */
    createModel(entry) {
      if (!window.THREE || !entry || !this._linkLibrary()) return null;
      const key = this.keyFor(entry) + ":" + (this.isLowDetail() ? "lo" : "hi");
      const cached = this._modelCache.get(key);
      if (cached) {
        this._modelCache.delete(key);
        this._modelCache.set(key, cached);
        return this._instance(cached);
      }
      const root = this._buildModel(entry);
      if (!root) return null;
      try {
        this.mergeStaticParts(root);
        this._protectResources(root);
        this._modelCache.set(key, root);
        while (this._modelCache.size > this.MODEL_CACHE_MAX) {
          const oldest = this._modelCache.keys().next().value;
          const victim = this._modelCache.get(oldest);
          this._modelCache.delete(oldest);
          this._freePrototype(victim);
        }
        return this._instance(root);
      } catch (e) {
        console.warn("[ItemModelSystem] model caching failed, using one-off model", e);
        this._modelCache.delete(key);
        this._freePrototypeProtection(root);
        return root;
      }
    },

    clearModelCache() {
      for (const entry of this._modelCache.values()) this._freePrototype(entry);
      this._modelCache.clear();
    },

    /**
     * A family calls this with:
     *   models     { methodName: fn }        builders, bound onto this object
     *   categories { category: methodName }  the generic model of a category
     *   armors     { "etypeId:atypeId": m }  the generic model of an armour slot
     *   unique     { "i123"|"a45": method }  bespoke model per database entry
     */
    registerFamily(family) {
      if (!family) return;
      const owner = family.name || "anonymous";
      if (family.models) {
        for (const key of Object.keys(family.models)) {
          const previous = this._familyOwners[key];
          if (previous && previous !== owner) {
            console.warn("[ItemModelSystem] " + owner + " overrides " + key + " from " + previous);
          }
          this._familyOwners[key] = owner;
          this[key] = family.models[key];
        }
      }
      const tables = [["categories", "CATEGORY_MODELS"], ["armors", "ARMOR_MODELS"], ["unique", "UNIQUE_MODELS"]];
      for (const pair of tables) {
        const source = family[pair[0]];
        if (!source) continue;
        for (const key of Object.keys(source)) this[pair[1]][key] = source[key];
      }
      if (this._modelCache.size) this.clearModelCache();
    }
  };

  // The whole shared construction library of the weapon pipeline (_mat, seg,
  // _plate, the geometry budget, the model cache helpers) is INHERITED rather
  // than copied, by linking this object's prototype to it.
  //
  // That link is made on first use, not here: this file sits near the top of
  // plugins.js (it has to load before the inventory and the shop) while
  // Weapon/WeaponSystemProcedural.js sits far below it, so at this point in the
  // boot there is nothing yet to inherit from. Linking eagerly left every
  // builder without its library and every model build threw.
  ItemModelSystem._linkLibrary = function () {
    if (Object.getPrototypeOf(this) !== Object.prototype) return true;
    const base = window.WeaponSystemProcedural;
    if (!base) {
      if (!this._warnedNoLibrary) {
        this._warnedNoLibrary = true;
        console.error("[ItemModelSystem] WeaponSystemProcedural not loaded; item models disabled");
      }
      return false;
    }
    Object.setPrototypeOf(this, base);
    return true;
  };

  window.ItemModelSystem = ItemModelSystem;

  // ==========================================================================
  // Family loader
  // ==========================================================================
  // One family per subject, injected in list order with async=false so a
  // family may lean on the one before it. A family that fails to arrive costs
  // only the models it carried.
  const ITEM3D_FAMILIES = [
    "Item3D_Generic",      // the generic silhouette of every category and slot
    "Item3D_Medical",      // the pharmacy shelf
    "Item3D_Combat",       // the throwables and the technique records
    "Item3D_Tools",        // the tool rack
    "Item3D_Vehicles",     // what you carry that brings the vehicle
    "Item3D_Lifestyle",    // the evening-off shelf
    "Item3D_Arctic",       // hide, bone, packed snow and ice
    "Item3D_Artisan",      // one master's work per trade
    "Item3D_Books",        // the library, one binding per volume
    "Item3D_Collectibles",  // what people kept from fights
    "Item3D_Counterfeits",  // fakes, built so the fake shows
    "Item3D_Espionage",     // kit built not to be noticed
    "Item3D_Food",          // the food shelf
    "Item3D_Diseases",      // one culture vial, two hundred labels
    "Item3D_Alchemistry",   // one reagent jar, one printed formula
    "Item3D_Components",    // hyperdeck parts, sized off their own grid shape
    "Item3D_Magic",         // enchanted things, and they light
    "Item3D_BodyParts",     // the creature's own battler part, on a tray
    "Item3D_Materials",     // ore, stock, trophies and what was cut out of things
    "Item3D_Sundries",      // the last four shelves: misc, survival, trash, remedies
    "Item3D_Armor"          // every armour, built from its own recipe and weight
  ];

  (function loadItem3DFamilies() {
    if (typeof document === "undefined") return;
    const host = document.body || document.head || document.documentElement;
    if (!host) return;
    const dir = "js/plugins/ItemSystem/";
    for (const name of ITEM3D_FAMILIES) {
      const src = dir + name + ".js";
      if (document.querySelector('script[src="' + src + '"]')) continue;
      const s = document.createElement("script");
      s.type = "text/javascript";
      s.src = src;
      s.async = false;
      s.defer = false;
      s.onerror = () => console.error("[ItemModelSystem] Failed to load family: " + src);
      host.appendChild(s);
    }
  })();
})();

//=============================================================================
// Module: ChaosPrices
//=============================================================================
/*:
 * @target MZ
 * @plugindesc Chaos world pricing: every catalogue price is re-rolled once per world
 * @author Omni-Lex
 *
 * @help
 * The world of chaos (WorldManager's second alternate timeline) keeps every
 * item exactly as the database wrote it, and prices none of them the way the
 * database did: a listed price is multiplied by a factor between a quarter and
 * four, rolled from the world seed and the item's own id.
 *
 * It is done ONCE, to the whole catalogue, before any counter is opened, so a
 * shop, a sell window, a loot value and a quest reward all quote the same
 * money for the same thing. A price of zero stays zero: a thing nobody was
 * ever meant to sell is not given a price here.
 */

(function () {
  "use strict";

  let pricedWorld = null;

  const ChaosPrices = {
    // Re-rolls the catalogue for the active world, once. Cheap to call from
    // anywhere: a second call for the same world does nothing.
    ensure() {
      const CW = window.ChaosWorld;
      if (!CW || !CW.active()) return;
      if (typeof $dataItems === "undefined" || !$dataItems) return;
      const WM = window.WorldManager;
      const world = String((WM && WM.activeWorldName) || "world");
      if (pricedWorld === world) return;
      pricedWorld = world;
      const tables = [["item", $dataItems], ["weapon", $dataWeapons], ["armor", $dataArmors]];
      for (const [kind, table] of tables) {
        if (!table) continue;
        for (let i = 1; i < table.length; i++) {
          const data = table[i];
          if (!data || !data.name) continue;
          // A collectible is worth what it is worth in every world.
          if (window.ItemCollectibles && window.ItemCollectibles.isFixed(data)) continue;
          // The listed price is kept, so re-rolling for another world starts
          // from the database's own number rather than from the last world's.
          if (data._chaosBasePrice === undefined) data._chaosBasePrice = data.price;
          data.price = CW.price(world + ":" + kind + ":" + i, data._chaosBasePrice);
        }
      }
    },
  };

  window.ChaosPrices = ChaosPrices;

  // The one door every playable minute goes through, so nothing ever reads a
  // database price before the world has re-rolled it.
  const _ChaosPrices_Game_Map_setup = Game_Map.prototype.setup;
  Game_Map.prototype.setup = function (mapId) {
    ChaosPrices.ensure();
    _ChaosPrices_Game_Map_setup.call(this, mapId);
  };
})();

//=============================================================================
// Arcane learning gate (window.SkillArcana)
//=============================================================================
// One answer to "may this character learn this skill", for every teacher in
// the game. Two tags on a skill raise a level floor:
//
//   <Esoteric>   readable from level 20
//   <Forbidden>  readable from level 80
//
// (a Forbidden skill is also Esoteric; the higher floor wins). The floor is
// the ONLY gate on that kind of knowledge now: mastering a whole school is no
// longer asked of anybody.
//
// Two characters ignore the tree/book split:
//
//   * Sandbox mode learns anything, anywhere.
//   * The Cultist (class 8) learns NOTHING from the Skill Master's tree, only
//     from written pages.
//     That is the class gimmick, so it lives here rather than in a menu.
//=============================================================================

(function () {
  "use strict";

  const SkillArcana = {
    ESOTERIC_LEVEL: 20,
    FORBIDDEN_LEVEL: 80,
    CULTIST_CLASS_ID: 8,

    skillOf(skill) {
      if (typeof skill === "number") {
        return (typeof $dataSkills !== "undefined" && $dataSkills) ? $dataSkills[skill] : null;
      }
      return skill || null;
    },

    // 'forbidden' | 'esoteric' | null
    rank(skill) {
      const s = this.skillOf(skill);
      if (!s) return null;
      const note = s.note || "";
      if ((s.meta && s.meta.Forbidden) || /<Forbidden>/i.test(note)) return "forbidden";
      if ((s.meta && s.meta.Esoteric) || /<Esoteric>/i.test(note)) return "esoteric";
      return null;
    },

    isForbidden(skill) { return this.rank(skill) === "forbidden"; },
    isEsoteric(skill) { return this.rank(skill) !== null; },

    requiredLevel(skill) {
      const rank = this.rank(skill);
      if (rank === "forbidden") return this.FORBIDDEN_LEVEL;
      if (rank === "esoteric") return this.ESOTERIC_LEVEL;
      return 0;
    },

    isSandbox() {
      return !!(typeof $gameSystem !== "undefined" && $gameSystem && $gameSystem._isSandboxMode);
    },

    isCultist(actor) {
      if (!actor || !actor.currentClass) return false;
      const cls = actor.currentClass();
      return !!cls && cls.id === this.CULTIST_CLASS_ID;
    },

    // The plain level check, nothing else.
    meetsLevel(actor, skill) {
      const need = this.requiredLevel(skill);
      if (need <= 0) return true;
      return !!actor && (actor.level || 0) >= need;
    },

    // Grimoires, skill books, and anything else that hands over written
    // knowledge. Written knowledge has no level floor at all: anybody who
    // holds the page can copy it. The floors only guard the Skill Master.
    canLearnFromBook() {
      return true;
    },

    // The Skill Master's tree. A Cultist learns nothing there at all.
    canLearnFromTree(actor, skill) {
      if (this.isSandbox()) return true;
      if (this.isCultist(actor)) return false;
      return this.meetsLevel(actor, skill);
    },

    // Why the tree refuses, for the lock line: 'cultist' | 'level' | null.
    treeBlockReason(actor, skill) {
      if (this.isSandbox()) return null;
      if (this.isCultist(actor)) return "cultist";
      return this.meetsLevel(actor, skill) ? null : "level";
    },
  };

  window.SkillArcana = SkillArcana;
})();

//=============================================================================
// Module: ItemCollectibles
//=============================================================================
/*:
 * @target MZ
 * @plugindesc Collectibles are priced flat: one number, every counter, forever
 * @author Omni-Lex
 *
 * @help
 * A collectible is a keepsake, not a commodity. Everything else on a shelf is
 * moved by the day's OIL and SOUL indices, by Haggling, by the party's
 * standing and record, by the marketplace tax and its volume ladder, and by
 * the chaos world's re-roll. A collectible is moved by none of them: it is
 * bought and sold at the number written in the database, in every shop scene
 * and on Stockbusters alike, and a shop pays the full sticker for one rather
 * than the usual tenth.
 *
 * This module is the ONE answer to "is this thing price-fixed": never test the
 * <category:> tag for it anywhere else.
 */

(function () {
  "use strict";

  const ItemCollectibles = {
    // The category whose prices never move. Matched against the <category:>
    // note tag, which stays English.
    CATEGORY: "collectibles",  // i18n-ignore  <category:> tag value

    /** Whether this entry's price is fixed. Weapons and armours never are. */
    isFixed(entry) {
      if (!entry || !entry.note) return false;
      const m = /<category:\s*([^>]+)>/i.exec(entry.note);
      return !!m && m[1].trim().toLowerCase() === this.CATEGORY;
    },

    /**
     * The one price such a thing is worth, on either side of any counter. The
     * chaos world keeps the database price it started from, so a collectible
     * that was re-rolled before this rule existed still quotes flat.
     */
    price(entry) {
      if (!entry) return 0;
      const base = entry._chaosBasePrice !== undefined ? entry._chaosBasePrice : entry.price;
      return Number.isFinite(base) && base > 0 ? Math.floor(base) : 0;
    },

    /**
     * The year the thing is from, off `<Year: n>`, the way a book carries
     * `<Published:>`. Negative is BCE, and a fossil is allowed to be older
     * than the calendar. Null when the row does not say.
     */
    year(entry) {
      if (!entry || !entry.note) return null;
      const m = /<Year:\s*(-?\d+)\s*>/i.exec(entry.note);
      return m ? Number(m[1]) : null;
    },

    /**
     * That year as it is written on a label: a plain number, or an era for
     * anything older than the record keeps.
     */
    yearText(entry) {
      const y = this.year(entry);
      if (y === null || !Number.isFinite(y)) return "";
      if (y <= -10000) return T('ItemUtils.year.deepTime', { years: Math.abs(y).toLocaleString() });
      if (y < 0) return T('ItemUtils.year.bce', { year: Math.abs(y) });
      return String(y);
    },

    /**
     * The fixed price of an entry, or null when the caller should go on and
     * work the price out the usual way. Every consumer is written as an early
     * return on this.
     */
    fixed(entry) {
      return this.isFixed(entry) ? this.price(entry) : null;
    },
  };

  window.ItemCollectibles = ItemCollectibles;
})();

//=============================================================================
// Module: BookLearning
//=============================================================================
/*:
 * @target MZ
 * @plugindesc A book teaches one specialization, once to each reader
 * @author Omni-Lex
 *
 * @help
 * Every book in the catalogue is about something, and the something is written
 * on the item:
 *
 *     <Teaches: Theology>
 *
 * The value is the English `name` of an entry in js/db/Skills/Specialization.json
 * and is a LOOKUP KEY, never printed: what the player reads comes back through
 * window.Specializations.displayName.
 *
 * Reading pays twice. Opening the book gives the reader the first points; being
 * carried all the way to the last page gives the rest, which is the larger
 * half. Both are paid to the member holding the book (the party leader) and
 * both are paid once per member per book, so a shelf is worth reading through
 * and a single volume is not worth reading twice.
 *
 * This module is the ONE answer to "what does this book teach" and "has this
 * member read it": never re-derive either from the note tag anywhere else.
 */

(function () {
  "use strict";

  // What one reading is worth, and what finishing it adds on top.
  const OPEN_POINTS = 2;
  const FINISH_POINTS = 5;

  const TEACHES_TAG = /<Teaches:\s*([^>]+)>/i;   // i18n-ignore  note tag
  const BOOK_TAG = /<Book:\s*([^>]+)>/i;         // i18n-ignore  note tag
  const BOOKS_CATEGORY = /<category:\s*Books\s*>/i;  // i18n-ignore  note tag

  const BookLearning = {
    OPEN_POINTS,
    FINISH_POINTS,
    MAX_BOOKMARKS: 5,

    /** Whether this entry is a book at all. */
    isBook(entry) {
      if (!entry || !entry.note) return false;
      return BOOK_TAG.test(entry.note) || BOOKS_CATEGORY.test(entry.note);
    },

    /** The English specialization key written on an item, or null. */
    specName(entry) {
      if (!entry || !entry.note) return null;
      const m = TEACHES_TAG.exec(entry.note);
      return m ? m[1].trim() : null;
    },

    /** That key resolved to the specialization record, or null. */
    spec(entry) {
      const name = this.specName(entry);
      if (!name) return null;
      const S = window.Specializations;
      if (!S || !S.byName) return null;
      return S.byName.get(name) || null;
    },

    /**
     * What the subject is called in the player's language. Empty for an item
     * that teaches nothing, and for one whose key names no specialization
     * (Specialization.json loads asynchronously, so this can be empty early).
     */
    label(entry) {
      const def = this.spec(entry);
      if (!def) return "";
      const S = window.Specializations;
      return (S && S.displayName) ? S.displayName(def) : def.name;
    },

    /** The item that carries a given book file, through the book viewer. */
    itemForFile(file) {
      if (!file) return null;
      const BM = window.BookManager;
      if (BM && BM.itemForBook) {
        try { return BM.itemForBook(file); } catch (e) { /* database not up */ }
      }
      return null;
    },

    // -----------------------------------------------------------------------
    // Who has read what. The ledger lives on $gameSystem, so it belongs to the
    // save: a book read in one party is unread for the next one.
    // -----------------------------------------------------------------------

    ledger() {
      if (typeof $gameSystem === "undefined" || !$gameSystem) return null;
      if (!$gameSystem._bookLearning) $gameSystem._bookLearning = { open: {}, done: {} };
      const l = $gameSystem._bookLearning;
      if (!l.open) l.open = {};
      if (!l.done) l.done = {};
      return l;
    },

    /** Whether this member has already been paid for `stage` of this book. */
    hasRead(actorId, file, stage) {
      const l = this.ledger();
      if (!l || !file) return false;
      const list = l[stage === "done" ? "done" : "open"][file];
      return Array.isArray(list) && list.indexOf(actorId) >= 0;
    },

    _record(actorId, file, stage) {
      const l = this.ledger();
      if (!l || !file) return false;
      const book = l[stage === "done" ? "done" : "open"];
      if (!Array.isArray(book[file])) book[file] = [];
      if (book[file].indexOf(actorId) >= 0) return false;
      book[file].push(actorId);
      return true;
    },

    /**
     * Pay a reader for a book. `stage` is "open" (they started it) or "done"
     * (they reached the last page). Returns the points actually awarded, which
     * is zero for a book they have already been paid for, one that teaches
     * nothing, or a party with nobody in it to read.
     */
    award(file, stage) {
      const item = this.itemForFile(file);
      const def = this.spec(item);
      if (!def) return 0;
      if (typeof $gameParty === "undefined" || !$gameParty) return 0;
      const reader = $gameParty.leader ? $gameParty.leader() : null;
      if (!reader) return 0;
      if (this.hasRead(reader.actorId(), file, stage)) return 0;
      // An Archmage takes twice as much out of a book as anybody else does
      // (the Bookworm half of their passive, BattleSystemPassiveSkills).
      const P = window.BattleSystemPassiveSkills;
      const bookMult = (P && P.bookPointsMultiplier) ? P.bookPointsMultiplier(reader) : 1;
      const points = Math.round((stage === "done" ? FINISH_POINTS : OPEN_POINTS) * bookMult);
      if (!this._record(reader.actorId(), file, stage)) return 0;
      const XP = window.SpecializationXP;
      // Reading is a solitary thing: nobody learns theology by watching
      // somebody else hold a book.
      if (XP) XP.award(def, points, { actor: reader, soloist: true });
      return points;
    },

    // -----------------------------------------------------------------------
    // Bookmarks. Up to five per book, kept as page indexes on the save so a
    // reader picks a book back up where they left their ribbons.
    // -----------------------------------------------------------------------

    bookmarks(file) {
      if (typeof $gameSystem === "undefined" || !$gameSystem || !file) return [];
      if (!$gameSystem._bookmarks) $gameSystem._bookmarks = {};
      const list = $gameSystem._bookmarks[file];
      return Array.isArray(list) ? list : [];
    },

    /**
     * Put a ribbon on a page, or lift the one already there. The sixth ribbon
     * pushes the oldest one out, because there are only five in the drawer.
     * Returns "set", "cleared" or "" when there is nowhere to store it.
     */
    toggleBookmark(file, page) {
      if (typeof $gameSystem === "undefined" || !$gameSystem || !file) return "";
      if (!$gameSystem._bookmarks) $gameSystem._bookmarks = {};
      const store = $gameSystem._bookmarks;
      const list = Array.isArray(store[file]) ? store[file].slice() : [];
      const at = list.indexOf(page);
      if (at >= 0) {
        list.splice(at, 1);
        store[file] = list;
        return "cleared";
      }
      list.push(page);
      while (list.length > this.MAX_BOOKMARKS) list.shift();
      list.sort((a, b) => a - b);
      store[file] = list;
      return "set";
    },
  };

  window.BookLearning = BookLearning;
})();
