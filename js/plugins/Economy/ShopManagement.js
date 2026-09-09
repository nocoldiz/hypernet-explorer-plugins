/*:
 * @target MZ
 * @plugindesc Shop Management System v2.1.1
 * @author Omni-Lex
 * @url
 * @help
 * ============================================================================
 * Shop Management Plugin for RPG Maker MZ
 * ============================================================================
 *
 * This plugin creates a comprehensive shop management system with support
 * for multiple shops, role-based gameplay, production, delivery, and inventory.
 *
 * Setup Instructions:
 * 1. Tag items with <Category: [YourCategory]> in their note box
 * 2. Add recipes to items: <Recipe: 866x2, 867x1, 869x2, 868x1>
 * 3. Create "Delivery" events on maps where deliveries can be made
 * 4. Material items should be in the ID range 849-871
 * 5. Initialize shops with initializeShop command before use
 *
 * Price Display:
 * - Prices are displayed in euros using conversion: 1200 gold = 12€
 * - Example: 1212 gold = 12.12€
 *
 * @param defaultPriceMultiplier
 * @text Default Price Multiplier
 * @desc Multiplier for base item prices
 * @type number
 * @decimals 2
 * @default 1.5
 *
 * @param producingInterval
 * @text NPC Producing Interval
 * @desc Frames between automatic NPC production attempts
 * @type number
 * @default 300
 *
 * @param deliveryMinGold
 * @text Minimum Delivery Gold
 * @desc Minimum gold earned from deliveries
 * @type number
 * @default 10000
 *
 * @param deliveryMaxGold
 * @text Maximum Delivery Gold
 * @desc Maximum gold earned from deliveries
 * @type number
 * @default 40000
 *
 * @param materialStartId
 * @text Material Start ID
 * @desc Starting item ID for materials
 * @type number
 * @default 849
 *
 * @param materialEndId
 * @text Material End ID
 * @desc Ending item ID for materials
 * @type number
 * @default 871
 *
 * @param producingTileId
 * @text Producing Tile ID
 * @desc Tile ID where NPC must stand to produce (default: 108)
 * @type number
 * @default 108
 *
 * @param npcProducerEventId
 * @text NPC Producer Event ID
 * @desc Event ID of the NPC producer on the current map
 * @type number
 * @default 1
 *
 * @param randomQuantityMin
 * @text Random Quantity Minimum
 * @desc Minimum random starting quantity for event items
 * @type number
 * @default 1
 *
 * @param randomQuantityMax
 * @text Random Quantity Maximum
 * @desc Maximum random starting quantity for event items
 * @type number
 * @default 10
 *
 * @param defaultStockItems
 * @text Default Stock Items Count
 * @desc Number of random category items to add to starting stock (3-8)
 * @type number
 * @default 5
 *
 * @command initializeShop
 * @text Initialize Shop
 * @desc Initialize a new shop with category and switch
 *
 * @arg shopId
 * @text Shop ID
 * @type text
 * @default shop1
 *
 * @arg category
 * @text Item Category
 * @type text
 * @default Food
 * @desc Category tag for items this shop can produce/sell
 *
 * @arg switchId
 * @text Control Switch ID
 * @type switch
 * @default 1
 * @desc Switch that controls this shop's operation
 *
 * @arg eventIds
 * @text Event IDs for Random Stock
 * @type text
 * @default
 * @desc Comma-separated list of item IDs to add random starting quantities (e.g., 1,2,3,4)
 *
 * @command setCurrentShop
 * @text Set Current Shop
 * @desc Set the active shop for operations
 *
 * @arg shopId
 * @text Shop ID
 * @type text
 * @default shop1
 *
 * @command openShopManagement
 * @text Open Shop Management
 * @desc Opens the shop management interface
 *
 * @command closeShopPermanently
 * @text Close Shop Permanently
 * @desc Permanently close a shop and reset its data
 *
 * @arg shopId
 * @text Shop ID
 * @type text
 * @default shop1
 *
 * @command startWork
 * @text Start Work
 * @desc Removes actors 2 & 3, activates job systems
 *
 * @command stopWork
 * @text Stop Work
 * @desc Re-adds actors 2 & 3, deactivates job systems
 *
 * @command switchRole
 * @text Switch Role
 * @desc Switch between Manager, Cook, and Rider roles
 *
 * @arg role
 * @text Role
 * @type select
 * @option Manager
 * @option Producer
 * @option Rider
 * @default Manager
 *
 * @command newDelivery
 * @text New Delivery
 * @desc Start a new delivery to a random visited map
 *
 * @command completeDelivery
 * @text Complete Delivery
 * @desc Complete current delivery and earn gold
 *
 * @command orderMaterials
 * @text Order Materials
 * @desc Order materials from warehouse
 *
 * @arg materialId
 * @text Material Item ID
 * @type number
 * @min 849
 * @max 871
 * @default 849
 *
 * @arg amount
 * @text Amount
 * @type number
 * @min 1
 * @default 10
 *
 * @command setMenuPrice
 * @text Set Menu Price
 * @desc Set price for a food item
 *
 * @arg itemId
 * @text Item ID
 * @type item
 * @default 1
 *
 * @arg price
 * @text Price
 * @type number
 * @min 1
 * @default 100
 *
 * @command produceItem
 * @text Produce Item
 * @desc Manually produce an item
 *
 * @arg shopId
 * @text Shop ID
 * @type text
 * @default shop1
 *
 * @arg itemId
 * @text Item ID
 * @type item
 * @default 1
 *
 * @command startProducingMiniGame
 * @text Start Producing Mini-Game
 * @desc Start the producing mini-game (placeholder)
 *
 * @command showDeliveryInfo
 * @text Show Delivery Info
 * @desc Shows current delivery destination, NPC info and timer
 *
 * @param deliveryTimeLimit
 * @text Delivery Time Limit
 * @desc Time limit for deliveries in seconds
 * @type number
 * @default 120
 */

(() => {
  "use strict";

  const pluginName = "ShopManagement";
  const parameters = PluginManager.parameters(pluginName);

  // Gate the economy/producing logs so they don't spam the console every tick.
  const DEBUG = false;
  const debugLog = (...args) => { if (DEBUG) console.log(...args); };

  // Category -> item list memo. Item notes are static, so the per-category
  // $dataItems scan (with a fresh RegExp per item) is done once and reused.
  const _categoryItemsCache = new Map();
  function getCategoryItems(category) {
    let list = _categoryItemsCache.get(category);
    if (!list) {
      list = $dataItems.filter((item) => item && isItemInCategory(item, category));
      _categoryItemsCache.set(category, list);
    }
    return list;
  }

  const defaultPriceMultiplier = Number(
    parameters["defaultPriceMultiplier"] || 1.5
  );
  const producingInterval = Number(parameters["producingInterval"] || 300);
  const deliveryMinGold = Number(parameters["deliveryMinGold"] || 10000);
  const deliveryMaxGold = Number(parameters["deliveryMaxGold"] || 40000);
  const materialStartId = Number(parameters["materialStartId"] || 849);
  const materialEndId = Number(parameters["materialEndId"] || 871);
  const deliveryTimeLimit = Number(parameters["deliveryTimeLimit"] || 120);
  const producingTileId = Number(parameters["producingTileId"] || 108);
  const npcProducerEventId = Number(parameters["npcProducerEventId"] || 1);
  const randomQuantityMin = Number(parameters["randomQuantityMin"] || 1);
  const randomQuantityMax = Number(parameters["randomQuantityMax"] || 10);
  const defaultStockItems = Number(parameters["defaultStockItems"] || 5);
  function refreshEconomy() {
    reviveShops();
    const currentShop = getCurrentShop();
    if (currentShop && currentShop.isAutoOperating) {
        currentShop.refreshEconomy();
    }
    
    // Optionally refresh all shops
    for (const shopId in shopData.shops) {
        const shop = shopData.shops[shopId];
        if (shop.isAutoOperating && shop !== currentShop) {
            shop.refreshEconomy();
        }
    }
}

  // Helper function to convert gold to euros
  function goldToEuros(goldAmount) {
    return (goldAmount / 100).toFixed(2);
  }

  // Helper function to format price in euros
  function formatEuroPrice(goldAmount) {
    return `€${goldToEuros(goldAmount)}`;
  }

  // Plugin Data Structure - Now supports multiple shops
  let shopData = {
    shops: {},
    currentShopId: null,
    globalData: {
      visitedMaps: [],
      currentDelivery: null,
      deliveryNPC: {
        name: "",
        spriteIndex: 0,
        spriteName: "",
      },
    },
  };

  // Helper function to generate random warehouse materials
  function generateRandomWarehouseMaterials() {
    const materials = {};
    const numMaterials = Math.floor(Math.random() * 8) + 5; // 5-12 different materials
    const availableMaterialIds = [];

    // Create array of available material IDs
    for (let id = materialStartId; id <= materialEndId; id++) {
      if ($dataItems[id]) {
        availableMaterialIds.push(id);
      }
    }

    // Shuffle and select random materials
    const shuffledIds = [...availableMaterialIds].sort(
      () => Math.random() - 0.5
    );
    const selectedIds = shuffledIds.slice(
      0,
      Math.min(numMaterials, availableMaterialIds.length)
    );

    // Assign random quantities to selected materials
    for (const materialId of selectedIds) {
      const randomQuantity = Math.floor(Math.random() * 30) + 10; // 10-39 quantity
      materials[materialId] = randomQuantity;
    }

    return materials;
  }

  // Shop class structure
  class Shop {
    constructor(id, category, switchId, eventIds = "") {
      this.id = id;
      this.category = category;
      this.switchId = switchId;
      this.isWorking = false;
      this.currentRole = "Manager";  // i18n-ignore  role id, switched by switchRole
      this.menuPrices = {};
      this.stockInventory = {};
      this.warehouseInventory = {};
      this.npcProducingTimer = 0;
      this.productionQueue = [];
      this.balance = 200000; // Starting balance: 2000.00€
      this.lastUpdateTime = Date.now();
      // Economy accrual is driven by game time (var 114, total game minutes) so
      // it does not advance while the game is closed. lastUpdateTime is kept only
      // for the human-readable status display.
      this.lastUpdateGameMin = ($gameVariables ? $gameVariables.value(114) : 0);
      this.isAutoOperating = true; // Shop operates automatically
      this.salesPerHour = 12; // Average sales per hour
      this.productionPerHour = 8; // Average production per hour
      this.restockThreshold = 3; // Restock when materials drop below this
      this.maxMaterialStock = 50; // Maximum materials to keep in warehouse
      // Initialize with default items
      this.initializeDefaultInventory();

      // Add random quantities for specified event IDs
      if (eventIds && eventIds.trim()) {
        this.addRandomEventItems(eventIds);
      }
    }
    // NEW METHOD: Main economy refresh function
    refreshEconomy() {
        const nowMin = ($gameVariables ? $gameVariables.value(114) : 0);
        // Backfill on legacy saves so the first refresh after load doesn't jump.
        if (this.lastUpdateGameMin === undefined || this.lastUpdateGameMin === null) {
            this.lastUpdateGameMin = nowMin;
        }
        const minutesElapsed = nowMin - this.lastUpdateGameMin;
        const hoursElapsed = minutesElapsed / 60;

        if (hoursElapsed < 0.1) return; // Skip if less than 6 game-minutes passed

        // A shop the party owns earns off the counter and nothing else: what it
        // sells is what the player put on the shelves, and nobody refills them
        // overnight. So the two automatic halves (free production out of thin
        // air, and a warehouse that restocks itself at cost) are for the event
        // shops the world runs, not for a business with the party's name on the
        // deed. The hours it can sell in are the hours somebody is behind the
        // counter (staffHours below), which is why the shifts matter.
        if (this.owned) {
            this.simulateSales(hoursElapsed * staffCoverage(this));
        } else {
            this.simulateSales(hoursElapsed);
            this.simulateProduction(hoursElapsed);
            this.simulateRestocking(hoursElapsed);
        }

        // Update last update markers
        this.lastUpdateGameMin = nowMin;
        this.lastUpdateTime = Date.now();
    }
    
    // NEW METHOD: Simulate sales over time
    simulateSales(hoursElapsed) {
        // A shop run by somebody who knows the trade moves more stock in the
        // same hours (Retail Management, specialization 726).
        const retail = window.SpecializationXP
            ? window.SpecializationXP.multiplier('Retail Management', 0.10) : 1;
        const expectedSales = Math.floor(this.salesPerHour * hoursElapsed * (0.5 + Math.random()) * retail);
        let actualSales = 0;
        
        // Get available stock items
        const availableSlots = [];
        for (let slotIndex = 1; slotIndex <= 7; slotIndex++) {
            const slot = this.stockInventory[slotIndex];
            if (slot && slot.amount > 0) {
                availableSlots.push({
                    slotIndex: slotIndex,
                    itemId: slot.itemId,
                    amount: slot.amount,
                    price: this.menuPrices[slot.itemId] || 1000
                });
            }
        }
        
        if (availableSlots.length === 0) {
            debugLog(`${this.id}: No items available for sale`);
            return;
        }
        
        // Simulate sales
        let earned = 0;
        for (let i = 0; i < expectedSales && availableSlots.length > 0; i++) {
            // Select random item to sell (weighted by availability)
            const randomSlot = availableSlots[Math.floor(Math.random() * availableSlots.length)];
            
            // Sell one unit
            this.stockInventory[randomSlot.slotIndex].amount--;
            this.balance += randomSlot.price;
            earned += randomSlot.price;
            actualSales++;
            
            // Remove from available slots if sold out
            if (this.stockInventory[randomSlot.slotIndex].amount <= 0) {
                this.stockInventory[randomSlot.slotIndex] = null;
                const slotIndex = availableSlots.indexOf(randomSlot);
                if (slotIndex > -1) {
                    availableSlots.splice(slotIndex, 1);
                }
            } else {
                // Update amount in availableSlots
                randomSlot.amount = this.stockInventory[randomSlot.slotIndex].amount;
            }
        }
        
        if (actualSales > 0) {
            // What the day's toast reads (announceDailyProfits): the counter, not
            // the balance, so money moved in or out by hand is never announced
            // as trade.
            this.soldToday   = (Number(this.soldToday)   || 0) + actualSales;
            this.earnedToday = (Number(this.earnedToday) || 0) + earned;
            const revenue = actualSales * 1200; // Average price estimate
            debugLog(`${this.id}: Sold ${actualSales} items, earned ${formatEuroPrice(revenue)}`);
            // Running a shop that actually sells things is how the trade is
            // learned. Capped per day like every other repeatable activity.
            if (window.SpecializationXP) {
                window.SpecializationXP.awardForValue('Retail Management', revenue);
            }
        }
    }
    
    // NEW METHOD: Simulate production over time
    simulateProduction(hoursElapsed) {
        const expectedProduction = Math.floor(this.productionPerHour * hoursElapsed * (0.7 + Math.random() * 0.6));
        let actualProduction = 0;
        
        // Get category items that can be produced
        const categoryItems = getCategoryItems(this.category);

        if (categoryItems.length === 0) return;
        
        // Attempt production
        for (let i = 0; i < expectedProduction; i++) {
            const randomItem = categoryItems[Math.floor(Math.random() * categoryItems.length)];
            const recipe = getRecipe(randomItem);
            
            if (recipe && hasIngredients(recipe, this)) {
                consumeIngredients(recipe, this);
                if (addToStock(randomItem.id, 1, this)) {
                    actualProduction++;
                }
            } else if (!recipe) {
                // Items without recipes can be produced for free
                if (addToStock(randomItem.id, 1, this)) {
                    actualProduction++;
                }
            }
        }
        
        if (actualProduction > 0) {
            debugLog(`${this.id}: Produced ${actualProduction} items`);
        }
    }
    
    // NEW METHOD: Simulate automatic restocking
    simulateRestocking(hoursElapsed) {
        let totalRestockCost = 0;
        
        // Check each material type and restock if needed
        for (let materialId = materialStartId; materialId <= materialEndId; materialId++) {
            const item = $dataItems[materialId];
            if (!item) continue;
            
            const currentStock = this.warehouseInventory[materialId] || 0;
            
            // Restock if below threshold
            if (currentStock < this.restockThreshold) {
                const restockAmount = this.maxMaterialStock - currentStock;
                const costPerUnit = Math.floor(item.price * 0.8); // Materials cost 80% of base price
                const totalCost = restockAmount * costPerUnit;
                
                // Check if shop can afford restocking
                if (this.balance >= totalCost) {
                    this.warehouseInventory[materialId] = (this.warehouseInventory[materialId] || 0) + restockAmount;
                    this.balance -= totalCost;
                    totalRestockCost += totalCost;
                    
                    debugLog(`${this.id}: Restocked ${restockAmount}x ${item.name} for ${formatEuroPrice(totalCost)}`);
                } else {
                    debugLog(`${this.id}: Cannot afford to restock ${item.name} (need ${formatEuroPrice(totalCost)})`);
                }
            }
        }
        
        if (totalRestockCost > 0) {
            debugLog(`${this.id}: Total restocking cost: ${formatEuroPrice(totalRestockCost)}`);
        }
    }
    
    // NEW METHOD: Get shop financial status
    getFinancialStatus() {
        return {
            balance: this.balance,
            balanceFormatted: formatEuroPrice(this.balance),
            lastUpdate: new Date(this.lastUpdateTime).toLocaleString(),
            hoursInactive: (Date.now() - this.lastUpdateTime) / (1000 * 60 * 60)
        };
    }
    
    // NEW METHOD: Manual balance adjustment (for debugging/events)
    adjustBalance(amount, reason = "Manual adjustment") {  // i18n-ignore  debugLog text only
        this.balance += amount;
        debugLog(`${this.id}: ${reason} - Balance changed by ${formatEuroPrice(amount)} to ${formatEuroPrice(this.balance)}`);
    }
    // Replace the Shop constructor's initializeDefaultInventory method
    initializeDefaultInventory() {
      // Initialize warehouse with random materials from 849-871 range
      this.warehouseInventory = generateRandomWarehouseMaterials();

      // Initialize stock as 7 slots with max 9 items each
      this.stockInventory = {};
      this.stockSlots = 7;
      this.maxItemsPerSlot = 9;

      // Find all items with matching category tag for stock
      const categoryItems = [];
      for (let i = 1; i < $dataItems.length; i++) {
        const item = $dataItems[i];
        if (item && isItemInCategory(item, this.category)) {
          categoryItems.push(item);
        }
      }

      // If no category items found, use fallback items
      if (categoryItems.length === 0) {
        console.warn(
          `No items found with category "${this.category}". Using fallback items.`
        );
        // Add some basic fallback items to first 2 slots
        this.stockInventory[1] = {
          itemId: 1,
          amount: Math.floor(Math.random() * 2) + 1,
        };
        this.stockInventory[2] = {
          itemId: 2,
          amount: Math.floor(Math.random() * 2) + 1,
        };
      } else {
        // Randomly select 7 items from category items (or less if not enough available)
        const shuffledItems = [...categoryItems].sort(
          () => Math.random() - 0.5
        );
        const selectedItems = shuffledItems.slice(
          0,
          Math.min(7, categoryItems.length)
        );

        // Initialize each slot with a random item and 1-2 copies
        for (let slotIndex = 1; slotIndex <= 7; slotIndex++) {
          if (selectedItems[slotIndex - 1]) {
            const item = selectedItems[slotIndex - 1];
            const randomAmount = Math.floor(Math.random() * 2) + 1; // 1-2 copies

            this.stockInventory[slotIndex] = {
              itemId: item.id,
              amount: randomAmount,
            };

            debugLog(
              `Slot ${slotIndex}: Added ${randomAmount}x ${item.name} (Category: ${this.category})`
            );
          } else {
            // Empty slot
            this.stockInventory[slotIndex] = null;
          }
        }
      }

      // Set default prices for all items in slots
      for (let slotIndex = 1; slotIndex <= 7; slotIndex++) {
        const slot = this.stockInventory[slotIndex];
        if (slot) {
          const item = $dataItems[slot.itemId];
          if (item) {
            this.menuPrices[slot.itemId] = Math.floor(
              item.price * defaultPriceMultiplier
            );
          }
        }
      }
    }

    addRandomEventItems(eventIds) {
      const idList = eventIds
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id);

      // Check if these are material IDs (849-871) for warehouse override
      const materialIds = idList.filter((id) => {
        const itemId = Number(id);
        return itemId >= materialStartId && itemId <= materialEndId;
      });

      const stockIds = idList.filter((id) => {
        const itemId = Number(id);
        return itemId < materialStartId || itemId > materialEndId;
      });

      // If material IDs are provided, replace warehouse inventory
      if (materialIds.length > 0) {
        debugLog(
          `Overriding warehouse with specified materials: ${materialIds.join(
            ", "
          )}`
        );
        this.warehouseInventory = {}; // Clear existing warehouse

        for (const itemIdStr of materialIds) {
          const itemId = Number(itemIdStr);

          // Validate item exists
          if (!$dataItems[itemId]) {
            console.warn(
              `Material ID ${itemId} not found in database, skipping.`
            );
            continue;
          }

          // Generate random quantity for warehouse materials
          const randomQuantity = Math.floor(Math.random() * 30) + 10; // 10-39 quantity
          this.warehouseInventory[itemId] = randomQuantity;

          debugLog(
            `Added ${randomQuantity}x ${$dataItems[itemId].name} to ${this.id} warehouse`
          );
        }
      }

      // Add non-material IDs to stock
      for (const itemIdStr of stockIds) {
        const itemId = Number(itemIdStr);

        // Validate item exists
        if (!$dataItems[itemId]) {
          console.warn(`Item ID ${itemId} not found in database, skipping.`);
          continue;
        }

        // Generate random quantity for stock items
        const randomQuantity =
          Math.floor(
            Math.random() * (randomQuantityMax - randomQuantityMin + 1)
          ) + randomQuantityMin;

        // Add to stock inventory
        this.stockInventory[itemId] =
          (this.stockInventory[itemId] || 0) + randomQuantity;

        // Set default price if not already set
        if (!this.menuPrices[itemId]) {
          const item = $dataItems[itemId];
          this.menuPrices[itemId] = Math.floor(
            item.price * defaultPriceMultiplier
          );
        }

        debugLog(
          `Added ${randomQuantity}x ${$dataItems[itemId].name} to ${this.id} stock`
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // The shops belong to the world
  // -------------------------------------------------------------------------
  // A shop is a place, and a place does not change because somebody loaded an
  // older save: the deed, the roster, the shelves and the till are written to
  // the world folder (save/worlds/<name>/shops.json), the same way a town's
  // furniture is (Crafting/FurnitureSystem.js). Every savegame of that world
  // opens the same shop, in the state the last one left it.
  //
  // The savegame still carries a copy, so a world folder that has not been
  // written yet (or a browser build with no worlds at all) loses nothing.
  const SHOP_WORLD_FILE = 'shops';

  function shopWorldName() {
    const wm = window.WorldManager;
    return (wm && wm.activeWorldName) || null;
  }

  function persistShops() {
    const wm = window.WorldManager;
    const world = shopWorldName();
    if (!wm || !world || !wm.writeWorldFile) return false;
    try {
      return wm.writeWorldFile(world, SHOP_WORLD_FILE, {
        shops: shopData.shops,
        currentShopId: shopData.currentShopId,
      });
    } catch (err) {
      console.error('[ShopManagement] could not write the world shop file', err);
      return false;
    }
  }

  // What the world knows wins over what the savegame remembers, since another
  // savegame of the same world may have moved the shelves since.
  function adoptWorldShops() {
    const wm = window.WorldManager;
    const world = shopWorldName();
    if (!wm || !world || !wm.readWorldFile) return false;
    let data = null;
    try { data = wm.readWorldFile(world, SHOP_WORLD_FILE); }
    catch (err) { data = null; }
    if (!data || !data.shops) return false;
    shopData.shops = data.shops;
    if (data.currentShopId && data.shops[data.currentShopId]) {
      shopData.currentShopId = data.currentShopId;
    }
    reviveShops();
    window.$shopData = shopData;
    return true;
  }

  // Save/Load System
  const _DataManager_makeSaveContents = DataManager.makeSaveContents;
  DataManager.makeSaveContents = function () {
    const contents = _DataManager_makeSaveContents.call(this);
    contents.shopManagement = shopData;
    return contents;
  };

  const _DataManager_extractSaveContents = DataManager.extractSaveContents;
  DataManager.extractSaveContents = function (contents) {
    _DataManager_extractSaveContents.call(this, contents);
    if (contents.shopManagement) {
      shopData = contents.shopManagement;
      reviveShops();
    }
    window.$shopData = shopData;
    // The world's own copy is the one the party walks into.
    adoptWorldShops();
  };

  // A save carries the shops as plain objects, so every method the simulation
  // calls on them (refreshEconomy and the rest) is gone the moment a game is
  // loaded. They are put back on the prototype here rather than guarded at each
  // call site, which is what used to make an autosaved shop throw on the first
  // map update after loading.
  function reviveShops() {
    if (!shopData || !shopData.shops) return;
    for (const id of Object.keys(shopData.shops)) {
      const raw = shopData.shops[id];
      if (!raw || raw instanceof Shop) continue;
      shopData.shops[id] = Object.assign(Object.create(Shop.prototype), raw);
    }
  }

  // Get current shop
  function getCurrentShop() {
    if (!shopData.currentShopId) return null;
    return shopData.shops[shopData.currentShopId];
  }

  // Track visited maps
  const _Game_Player_performTransfer = Game_Player.prototype.performTransfer;
  Game_Player.prototype.performTransfer = function () {
    _Game_Player_performTransfer.call(this);
    if (!shopData.globalData.visitedMaps.includes($gameMap.mapId())) {
      shopData.globalData.visitedMaps.push($gameMap.mapId());
    }
  };

  // Helper Functions
  function isItemInCategory(item, category) {
    if (!item) return false;
    // A <Restricted> row is granted by the one system that owns it, so a
    // player-run shop can neither stock nor produce it.
    if (window.ItemSystemUtils && window.ItemSystemUtils.isRestrictedEntry(item)) return false;
    const regex = new RegExp(`<Category:\\s*${category}>`, "i");
    return regex.test(item.note);
  }

  function getRecipe(item) {
    if (!item || !item.note) return null;
    const match = item.note.match(/<Recipe:\s*(.+)>/i);
    if (!match) return null;

    const recipe = {};
    const ingredients = match[1].split(",");
    ingredients.forEach((ing) => {
      const [itemId, amount] = ing
        .trim()
        .split("x")
        .map((n) => parseInt(n));
      recipe[itemId] = amount;
    });
    return recipe;
  }

  function hasIngredients(recipe, shop) {
    for (const [itemId, amount] of Object.entries(recipe)) {
      const currentAmount = shop.warehouseInventory[itemId] || 0;
      if (currentAmount < amount) return false;
    }
    return true;
  }

  function consumeIngredients(recipe, shop) {
    for (const [itemId, amount] of Object.entries(recipe)) {
      shop.warehouseInventory[itemId] =
        (shop.warehouseInventory[itemId] || 0) - amount;
      if (shop.warehouseInventory[itemId] <= 0) {
        delete shop.warehouseInventory[itemId];
      }
    }
  }

  function addToStock(itemId, amount = 1, shop, specificSlot = null) {
    // If specific slot is provided, add to that slot only
    if (specificSlot !== null && specificSlot >= 1 && specificSlot <= 7) {
      const slot = shop.stockInventory[specificSlot];
      if (!slot) {
        // Empty slot - create new entry
        shop.stockInventory[specificSlot] = {
          itemId: itemId,
          amount: Math.min(amount, shop.maxItemsPerSlot),
        };
        return true;
      } else if (slot.itemId === itemId) {
        // Same item - add amount up to max
        const newAmount = Math.min(slot.amount + amount, shop.maxItemsPerSlot);
        slot.amount = newAmount;
        return true;
      }
      return false; // Slot occupied by different item
    }

    // Find existing slot with same item
    for (let slotIndex = 1; slotIndex <= 7; slotIndex++) {
      const slot = shop.stockInventory[slotIndex];
      if (
        slot &&
        slot.itemId === itemId &&
        slot.amount < shop.maxItemsPerSlot
      ) {
        const spaceAvailable = shop.maxItemsPerSlot - slot.amount;
        const amountToAdd = Math.min(amount, spaceAvailable);
        slot.amount += amountToAdd;
        return true;
      }
    }

    // Find empty slot
    for (let slotIndex = 1; slotIndex <= 7; slotIndex++) {
      if (!shop.stockInventory[slotIndex]) {
        shop.stockInventory[slotIndex] = {
          itemId: itemId,
          amount: Math.min(amount, shop.maxItemsPerSlot),
        };
        return true;
      }
    }

    return false; // No space available
  }

  // Replace the removeFromStock function
  function removeFromStock(itemId, amount = 1, shop, specificSlot = null) {
    if (specificSlot !== null && specificSlot >= 1 && specificSlot <= 7) {
      const slot = shop.stockInventory[specificSlot];
      if (!slot || slot.itemId !== itemId) return false;

      if (slot.amount >= amount) {
        slot.amount -= amount;
        if (slot.amount <= 0) {
          shop.stockInventory[specificSlot] = null;
        }
        return true;
      }
      return false;
    }

    // Find slot with the item
    for (let slotIndex = 1; slotIndex <= 7; slotIndex++) {
      const slot = shop.stockInventory[slotIndex];
      if (slot && slot.itemId === itemId) {
        if (slot.amount >= amount) {
          slot.amount -= amount;
          if (slot.amount <= 0) {
            shop.stockInventory[slotIndex] = null;
          }
          return true;
        }
      }
    }

    return false;
  }

  function findDeliveryMaps() {
    const validMaps = [];
    for (const mapId of shopData.globalData.visitedMaps) {
      validMaps.push(mapId);
    }
    return validMaps;
  }

  function getMapDisplayName(mapId) {
    // WorldMapReturn names the place rather than the map file, which is the only
    // way a destination on the procedural map reads as somewhere ("Fields
    // (88,131)") instead of "ProceduralRoom", the one map every world square
    // reuses.
    if (window.WorldMapReturn && window.WorldMapReturn.placeName) {
      const named = window.WorldMapReturn.placeName(mapId);
      if (named) return named;
    }

    let mapName = T('ShopManagement.mapN', { id: mapId });

    if (window.$dataMapInfos && $dataMapInfos[mapId]) {
      const mapInfo = $dataMapInfos[mapId];
      mapName = mapInfo.name;

      if ($gameMap.mapId() === mapId) {
        mapName = $gameMap.displayName() || mapInfo.name;
      }
    }

    return mapName;
  }

  // Plugin Commands
  PluginManager.registerCommand(pluginName, "initializeShop", (args) => {
    refreshEconomy(); // ADD THIS LINE
    const shopId = args.shopId;
    const category = args.category;
    const switchId = Number(args.switchId);
    const eventIds = args.eventIds || "";

    // Create new shop with event IDs
    shopData.shops[shopId] = new Shop(shopId, category, switchId, eventIds);

    // Set as current shop if none selected
    if (!shopData.currentShopId) {
      shopData.currentShopId = shopId;
    }

    // Turn on the switch
    $gameSwitches.setValue(switchId, true);
    window.skipLocalization = true;
    $gameMessage.add(T('ShopManagement.msg.initialized', { shop: shopId }));
    $gameMessage.add(T('ShopManagement.msg.category', { category: category }));
    $gameMessage.add(
      T('ShopManagement.msg.stocked')
    );

    // Show information about added event items
    if (eventIds && eventIds.trim()) {
      $gameMessage.add(
        T('ShopManagement.msg.extraItems', { items: eventIds })
      );
    }
    window.skipLocalization = false;

  });

  PluginManager.registerCommand(pluginName, "setCurrentShop", (args) => {
    refreshEconomy(); // ADD THIS LINE
    const shopId = args.shopId;
    window.skipLocalization = true;

    if (!shopData.shops[shopId]) {
      $gameMessage.add(T('ShopManagement.msg.notFound', { shop: shopId }));
      return;
    }

    shopData.currentShopId = shopId;
    $gameMessage.add(T('ShopManagement.msg.currentShop', { shop: shopId }));
    window.skipLocalization = false;

  });

  // NOTE: The earlier "openShopManagement" registration that referenced a bare
  // (undefined) Scene_ShopManagement was dead - the window-guarded registration
  // below overwrote it. Removed to avoid the latent ReferenceError.

  PluginManager.registerCommand(pluginName, "closeShopPermanently", (args) => {
    refreshEconomy(); // ADD THIS LINE
    const shopId = args.shopId;
    const shop = shopData.shops[shopId];
    window.skipLocalization = true;

    if (!shop) {
      $gameMessage.add(T('ShopManagement.msg.notFound', { shop: shopId }));
      return;
    }
    window.skipLocalization = false;

    // Turn off the switch
    $gameSwitches.setValue(shop.switchId, false);

    // Delete shop data
    delete shopData.shops[shopId];

    // Clear current shop if it was this one
    if (shopData.currentShopId === shopId) {
      shopData.currentShopId = null;
    }
    window.skipLocalization = true;

    $gameMessage.add(T('ShopManagement.msg.closed', { shop: shopId }));
    window.skipLocalization = false;

  });

  PluginManager.registerCommand(pluginName, "startWork", (args) => {
    refreshEconomy(); // ADD THIS LINE
    const shop = getCurrentShop();
    if (!shop) {
      $gameMessage.add(T('ShopManagement.msg.noShopInit'));
      return;
    }

    shop.isWorking = true;

    // Remove actors 2 and 3 from party
    if ($gameParty._actors.includes(2)) {
      $gameParty.removeActor(2);
    }
    if ($gameParty._actors.includes(3)) {
      $gameParty.removeActor(3);
    }

    // Start NPC systems
    shop.npcProducingTimer = 0;
    window.skipLocalization = true;

    $gameMessage.add(T('ShopManagement.msg.nowOpen', { shop: shop.id }));
    window.skipLocalization = false;

  });

  PluginManager.registerCommand(pluginName, "stopWork", (args) => {
    refreshEconomy(); // ADD THIS LINE
    const shop = getCurrentShop();
    if (!shop) return;

    shop.isWorking = false;

    // Re-add actors 2 and 3 to party
    $gameParty.addActor(2);
    $gameParty.addActor(3);

    // Stop NPC systems
    shop.npcProducingTimer = 0;
    shopData.globalData.currentDelivery = null;

    $gameMessage.add(T('ShopManagement.msg.shiftEnded'));
  });

  PluginManager.registerCommand(pluginName, "switchRole", (args) => {
    refreshEconomy(); // ADD THIS LINE
    const shop = getCurrentShop();
    if (!shop) return;

    shop.currentRole = args.role;
    $gameMessage.add(T('ShopManagement.msg.switchedRole', { role: args.role }));
  });

  PluginManager.registerCommand(pluginName, "newDelivery", (args) => {
    refreshEconomy(); // ADD THIS LINE
    const validMaps = findDeliveryMaps();
    if (validMaps.length === 0) {
      $gameMessage.add(T('ShopManagement.msg.noLocations'));
      return;
    }

    const randomMap = validMaps[Math.floor(Math.random() * validMaps.length)];

    // Generate random NPC details
    // i18n-ignore-start  customer given names, kept as proper nouns
    const npcNames = [
      "Sarah",
      "Mike",
      "Emma",
      "John",
      "Lisa",
      "David",
      "Amy",
      "Tom",
      "Jessica",
      "Robert",
    ];
    // i18n-ignore-end
    // Single-character sheets (img/characters/NPCs), so the index is always 0.
    const npcSprites = [
      "NPCs/!$WarSniper1",
      "NPCs/!$UniversityStudent1",
      "NPCs/!$ElvenBarbarian1",
      "NPCs/!$Stylist1",
      "NPCs/!$Botanist1",
      "NPCs/!$Jogger1",
      "Skab/!$OrcStudent",
      "Skab/!$OrcBartender",
      "Skab/!$OrcMercenary",
      "Skab/!$OrcAdventurer",
    ];

    shopData.globalData.currentDelivery = {
      mapId: randomMap,
      startTime: Date.now(),
    };

    shopData.globalData.deliveryNPC = {
      name: npcNames[Math.floor(Math.random() * npcNames.length)],
      spriteName: npcSprites[Math.floor(Math.random() * npcSprites.length)],
      spriteIndex: 0,
    };

    // Start the 2-minute timer
    $gameTimer.start(deliveryTimeLimit * 60);

    // This would activate the Delivery event's self switch A
    $gameSelfSwitches.setValue([randomMap, 1, "A"], true);

    // Get map name
    const mapName = getMapDisplayName(randomMap);

    $gameMessage.add(T('ShopManagement.msg.newDelivery'));
    $gameMessage.add(T('ShopManagement.msg.customer', { name: shopData.globalData.deliveryNPC.name }));
    $gameMessage.add(T('ShopManagement.msg.location', { location: mapName }));
    $gameMessage.add(
      T('ShopManagement.msg.timeLimit', {
        time: `${Math.floor(deliveryTimeLimit / 60)}:${(deliveryTimeLimit % 60)
          .toString()
          .padStart(2, "0")}`,
      })
    );
  });

  PluginManager.registerCommand(pluginName, "completeDelivery", (args) => {
    refreshEconomy(); // ADD THIS LINE
    if (!shopData.globalData.currentDelivery) {
      $gameMessage.add(T('ShopManagement.msg.noDelivery'));
      return;
    }

    // Check if delivery was on time (read timer state BEFORE stopping it)
    const timeLeft = $gameTimer.seconds();
    const onTime = $gameTimer.isWorking() && timeLeft > 0;

    // Stop the timer
    $gameTimer.stop();

    // Turn off delivery event switch
    const mapId = shopData.globalData.currentDelivery.mapId;
    $gameSelfSwitches.setValue([mapId, 1, "A"], false);

    // Calculate gold based on time
    let gold =
      Math.floor(Math.random() * (deliveryMaxGold - deliveryMinGold + 1)) +
      deliveryMinGold;

    if (!onTime) {
      gold = Math.floor(gold * 0.5);
      $gameMessage.add(T('ShopManagement.msg.deliveryLate'));
    } else {
      $gameMessage.add(T('ShopManagement.msg.deliveryDone'));
    }

    $gameParty.gainGold(gold);
    $gameMessage.add(T('ShopManagement.msg.earned', { amount: formatEuroPrice(gold) }));
    // Running the route is what teaches the route (Shipping, 742).
    if (window.SpecializationXP) {
      window.SpecializationXP.awardCapped('Shipping', onTime ? 2 : 1);
    }

    // Reset and start new delivery
    shopData.globalData.currentDelivery = null;
    PluginManager.callCommand(this, pluginName, "newDelivery", {});
  });

  PluginManager.registerCommand(pluginName, "orderMaterials", (args) => {
    refreshEconomy(); // ADD THIS LINE
    const shop = getCurrentShop();
    if (!shop) {
      $gameMessage.add(T('ShopManagement.msg.noShop'));
      return;
    }

    const itemId = Number(args.materialId);
    const amount = Number(args.amount);

    if (itemId < materialStartId || itemId > materialEndId) {
      $gameMessage.add(T('ShopManagement.msg.badMaterial'));
      return;
    }

    shop.warehouseInventory[itemId] =
      (shop.warehouseInventory[itemId] || 0) + amount;

    const item = $dataItems[itemId];
    $gameMessage.add(T('ShopManagement.msg.ordered', { count: amount, material: item.name }));
  });

  PluginManager.registerCommand(pluginName, "showDeliveryInfo", (args) => {
    refreshEconomy(); // ADD THIS LINE
    if (!shopData.globalData.currentDelivery) {
      $gameMessage.add(T('ShopManagement.msg.noDelivery'));
      return;
    }

    const mapName = getMapDisplayName(
      shopData.globalData.currentDelivery.mapId
    );
    const npc = shopData.globalData.deliveryNPC;

    $gameMessage.add(T('ShopManagement.msg.deliveryHeader'));
    $gameMessage.add(T('ShopManagement.msg.customer', { name: npc.name }));
    $gameMessage.add(
      T('ShopManagement.msg.character', { sprite: npc.spriteName, index: npc.spriteIndex + 1 })
    );
    $gameMessage.add(T('ShopManagement.msg.location', { location: mapName }));

    if ($gameTimer.isWorking()) {
      const seconds = Math.floor($gameTimer.seconds());
      const minutes = Math.floor(seconds / 60);
      const secs = seconds % 60;
      $gameMessage.add(
        T('ShopManagement.msg.timeLeft',
          { minutes: minutes, seconds: secs.toString().padStart(2, "0") })
      );
    } else {
      $gameMessage.add(T('ShopManagement.msg.timerOff'));
    }
  });

  // NPC Production System (runs in background)
  const _Scene_Map_update = Scene_Map.prototype.update;
  Scene_Map.prototype.update = function () {
    _Scene_Map_update.call(this);

    const shop = getCurrentShop();
    if (shop && shop.isWorking) {
      updateNPCProducing(shop);
    }

    // Shops the party owns trade whether or not an event says so: without this
    // a bought shop only ever moved stock when a plugin command happened to
    // call refreshEconomy. The accrual itself is game-time based (see
    // Shop.refreshEconomy), so this only decides how often it is checked.
    if (Graphics.frameCount % producingInterval === 0) {
      refreshEconomy();
      checkShopDay();
    }
  };

  // -------------------------------------------------------------------------
  // Filling the shelves
  // -------------------------------------------------------------------------
  // Nobody refills a shop the party owns (Shop.refreshEconomy), so the shelves
  // are filled by hand, out of two places: the bags the party is carrying, and
  // a wholesaler who sells the trade's own goods under the counter price.
  //
  // Anything the party owns may be put out for sale, with two exceptions that
  // are never listed: a key item, which is not merchandise, and a crafting
  // material, which belongs in the back room rather than on the shelf.
  const WHOLESALE_RATE = 0.6;   // what the wholesaler charges, against list
  // A shop whose trade cannot be read off the deed is a hardware store: tools
  // are the one stock every settlement will buy.
  const FALLBACK_TRADE = 'Tools';   // i18n-ignore: a <Category:> note tag

  function isMaterialId(itemId) {
    const id = Number(itemId);
    return id >= materialStartId && id <= materialEndId;
  }

  // A key item is itypeId 2 in the editor, and a <Restricted> row is granted by
  // the system that owns it rather than sold by anybody.
  function isStockable(item) {
    if (!item) return false;
    if (item.itypeId === 2) return false;
    if (isMaterialId(item.id)) return false;
    if (window.ItemSystemUtils && window.ItemSystemUtils.isRestrictedEntry(item)) return false;
    return true;
  }

  // What the party is carrying that could go on a shelf, with how many.
  function stockableItems() {
    let items = [];
    try { items = $gameParty.items() || []; } catch (err) { return []; }
    return items.filter(isStockable).map(item => ({
      item,
      amount: (() => { try { return $gameParty.numItems(item); } catch (err) { return 0; } })(),
    })).filter(entry => entry.amount > 0);
  }

  // The trade the wholesaler deals in for this shop: its own, or the hardware
  // store's when the shop has no readable trade or nothing is written in it.
  function shopTrade(shop) {
    const named = shop && shop.category;
    if (named && getCategoryItems(named).length > 0) return named;
    return FALLBACK_TRADE;
  }

  function wholesalePrice(item) {
    return Math.max(1, Math.floor((Number(item && item.price) || 0) * WHOLESALE_RATE));
  }

  // What the wholesaler has: the trade's goods, priced under the counter.
  function wholesaleOffers(shop) {
    return getCategoryItems(shopTrade(shop))
      .filter(isStockable)
      .map(item => ({ item, price: wholesalePrice(item) }));
  }

  // Out of the bags and onto the shelf.
  function stockFromBag(shopId, itemId, amount = 1) {
    const shop = getShop(shopId);
    const item = $dataItems[Number(itemId)];
    if (!shop || !item || !isStockable(item)) return { ok: false, reason: 'notStockable' };
    let held = 0;
    try { held = $gameParty.numItems(item); } catch (err) { held = 0; }
    const moving = Math.max(1, Math.min(Number(amount) || 1, held));
    if (moving <= 0) return { ok: false, reason: 'noneHeld' };
    if (!addToStock(item.id, moving, shop)) return { ok: false, reason: 'shelvesFull' };
    if (!shop.menuPrices[item.id]) {
      shop.menuPrices[item.id] = Math.floor(item.price * defaultPriceMultiplier);
    }
    try { $gameParty.loseItem(item, moving); } catch (err) { /* no party */ }
    persistShops();
    return { ok: true, amount: moving };
  }

  // Off the shelf and back into the bags. Whatever is stocked can always come
  // back: the shelf is the party's own, not a one-way chute.
  function pullFromStock(shopId, itemId, amount = 1) {
    const shop = getShop(shopId);
    const item = $dataItems[Number(itemId)];
    if (!shop || !item) return { ok: false, reason: 'notFound' };
    let held = 0;
    for (let slot = 1; slot <= 7; slot++) {
      const row = shop.stockInventory[slot];
      if (row && row.itemId === item.id) held += row.amount;
    }
    const moving = Math.max(1, Math.min(Number(amount) || 1, held));
    if (moving <= 0) return { ok: false, reason: 'noneStocked' };
    let taken = 0;
    for (let slot = 1; slot <= 7 && taken < moving; slot++) {
      const row = shop.stockInventory[slot];
      if (!row || row.itemId !== item.id) continue;
      const off = Math.min(row.amount, moving - taken);
      if (removeFromStock(item.id, off, shop, slot)) taken += off;
    }
    if (taken <= 0) return { ok: false, reason: 'noneStocked' };
    try { $gameParty.gainItem(item, taken); } catch (err) { /* no party */ }
    persistShops();
    return { ok: true, amount: taken };
  }

  // Bought from the wholesaler and shelved in one act, paid for out of the
  // party's purse (the till is emptied into it anyway, on the overview page).
  function buyStock(shopId, itemId, amount = 1) {
    const shop = getShop(shopId);
    const item = $dataItems[Number(itemId)];
    if (!shop || !item || !isStockable(item)) return { ok: false, reason: 'notStockable' };
    const each = wholesalePrice(item);
    const wanted = Math.max(1, Number(amount) || 1);
    let purse = 0;
    try { purse = $gameParty.gold(); } catch (err) { purse = 0; }
    const affordable = Math.min(wanted, Math.floor(purse / each));
    if (affordable <= 0) return { ok: false, reason: 'tooDear' };
    if (!addToStock(item.id, affordable, shop)) return { ok: false, reason: 'shelvesFull' };
    if (!shop.menuPrices[item.id]) {
      shop.menuPrices[item.id] = Math.floor(item.price * defaultPriceMultiplier);
    }
    try { $gameParty.loseGold(each * affordable); } catch (err) { /* no purse */ }
    persistShops();
    return { ok: true, amount: affordable, spent: each * affordable };
  }

  // -------------------------------------------------------------------------
  // The workshop, worked for the shop
  // -------------------------------------------------------------------------
  // The Thinker's bench (Quest/ThinkerMenu.js) is opened from inside the
  // management book, and what comes off it goes straight onto the shelves
  // instead of into the party's bags. Nothing about the bench itself changes:
  // it hands the piece to the party as it always does, and while a consignment
  // is open that hand-over is intercepted here. Materials handed back (a saved
  // reagent, a teardown) are not merchandise, so they stay in the bags.
  let _consignTo = null;

  function beginConsignment(shopId) {
    const shop = getShop(shopId);
    if (!shop || !shop.owned) return false;
    _consignTo = shop.id;
    return true;
  }

  function endConsignment() {
    const was = _consignTo;
    _consignTo = null;
    if (was) persistShops();
    return was;
  }

  function consignmentShop() {
    return _consignTo ? getShop(_consignTo) : null;
  }

  if (typeof Game_Party !== 'undefined' && Game_Party.prototype) {
  const _Game_Party_gainItem_shop = Game_Party.prototype.gainItem;
  Game_Party.prototype.gainItem = function (item, amount, includeEquip) {
    const shop = consignmentShop();
    if (!shop || !item || !(Number(amount) > 0) || !isStockable(item)) {
      return _Game_Party_gainItem_shop.call(this, item, amount, includeEquip);
    }
    const shelved = addToStock(item.id, Number(amount), shop);
    if (!shelved) {
      // The shelves are full, so it goes in the bag after all rather than
      // vanishing off the workbench.
      return _Game_Party_gainItem_shop.call(this, item, amount, includeEquip);
    }
    if (!shop.menuPrices[item.id]) {
      shop.menuPrices[item.id] = Math.floor(item.price * defaultPriceMultiplier);
    }
    if (window.ParchmentToast && window.ParchmentToast.show) {
      window.ParchmentToast.show(
        T('ShopManagement.shelves.consigned', {
          item: item.name, shop: shopDisplayName(shop),
        }),
        { title: T('ShopManagement.shelves.title') }
      );
    }
    return true;
  };
  }

  // -------------------------------------------------------------------------
  // Who stands behind the counter
  // -------------------------------------------------------------------------
  // A bought shop has no shopkeeper: the one who was there worked for whoever
  // owned it before. The party staffs it themselves, out of the people they
  // travel with and the ones waiting on the bench (the Party Dynamics board's
  // Inactive list), one to three of them.
  //
  // A day is three eight-hour shifts. One name covers the morning, two cover
  // two thirds of the day, three keep the door open around the clock: the
  // shop only trades in the hours somebody is standing in it, so the roster is
  // what decides how much it can possibly sell (Shop.refreshEconomy).
  const SHOP_SHIFT_HOURS = 8;
  const SHOP_MAX_STAFF   = 3;

  // An entry is an actor (somebody travelling) or a preset (somebody benched),
  // since both are offered and the two are numbered separately.
  function staffList(shop) {
    if (!shop) return [];
    if (!Array.isArray(shop.staff)) shop.staff = [];
    return shop.staff;
  }

  function staffKey(entry) {
    return entry ? `${entry.kind}:${entry.id}` : '';
  }

  // The hours this entry covers, by its place on the roster.
  function staffShift(shop, index) {
    const start = (index * SHOP_SHIFT_HOURS) % 24;
    return { start, end: (start + SHOP_SHIFT_HOURS) % 24 };
  }

  // How much of the day is covered, 0 to 1. Three names is the whole clock.
  function staffCoverage(shop) {
    const staffed = staffList(shop).length;
    if (staffed <= 0) return 0;
    return Math.min(1, (staffed * SHOP_SHIFT_HOURS) / 24);
  }

  // The name a roster entry answers to, wherever it is filed.
  function staffName(entry) {
    if (!entry) return '';
    if (entry.kind === 'actor') {
      const actor = $gameActors ? $gameActors.actor(Number(entry.id)) : null;
      return actor ? actor.name() : '';
    }
    const bench = window.CharacterPresets?.getAvailableRetiredPresets?.() ?? [];
    const preset = bench.find(p => String(p.id) === String(entry.id));
    return preset ? preset.name : '';
  }

  // Everybody who could take a shift: the party as it travels, and the bench.
  // Whoever is already on this shop's roster, or on another shop's, is not
  // offered twice.
  function staffCandidates(shop) {
    const taken = new Set();
    reviveShops();
    for (const id of Object.keys(shopData.shops)) {
      const other = shopData.shops[id];
      if (!other || !other.owned) continue;
      staffList(other).forEach(entry => taken.add(staffKey(entry)));
    }
    const out = [];
    try {
      $gameParty.members().forEach(actor => {
        if (!actor) return;
        const entry = { kind: 'actor', id: actor.actorId() };
        if (taken.has(staffKey(entry))) return;
        out.push(Object.assign({ name: actor.name(), level: actor.level }, entry));
      });
    } catch (err) { /* no party */ }
    const bench = window.CharacterPresets?.getAvailableRetiredPresets?.() ?? [];
    bench.forEach(preset => {
      const entry = { kind: 'preset', id: preset.id };
      if (taken.has(staffKey(entry))) return;
      out.push(Object.assign({ name: preset.name, level: preset.level || 1 }, entry));
    });
    return out;
  }

  // Putting somebody on, and taking them off. Answers { ok } so a picker can
  // say why it refused.
  function assignStaff(shopId, kind, id) {
    const shop = getShop(shopId);
    if (!shop || !shop.owned) return { ok: false, reason: 'noShop' };
    const list = staffList(shop);
    if (list.length >= SHOP_MAX_STAFF) return { ok: false, reason: 'rosterFull' };
    const entry = { kind: String(kind), id: (kind === 'actor' ? Number(id) : id) };
    if (list.some(e => staffKey(e) === staffKey(entry))) return { ok: false, reason: 'already' };
    if (!staffName(entry)) return { ok: false, reason: 'unknown' };
    list.push(entry);
    persistShops();
    return { ok: true, entry };
  }

  function dismissStaff(shopId, kind, id) {
    const shop = getShop(shopId);
    if (!shop) return { ok: false, reason: 'noShop' };
    const list = staffList(shop);
    const key = staffKey({ kind: String(kind), id: (kind === 'actor' ? Number(id) : id) });
    const at = list.findIndex(e => staffKey(e) === key);
    if (at < 0) return { ok: false, reason: 'notOnRoster' };
    list.splice(at, 1);
    persistShops();
    return { ok: true };
  }

  // The roster as a page reads it: a name, the hours it covers, and whether
  // the clock is covered at all.
  function staffRoster(shopId) {
    const shop = typeof shopId === 'object' ? shopId : getShop(shopId);
    if (!shop) return [];
    return staffList(shop).map((entry, index) => Object.assign({}, entry, {
      name:  staffName(entry),
      shift: staffShift(shop, index),
    }));
  }

  // -------------------------------------------------------------------------
  // The day's takings
  // -------------------------------------------------------------------------
  // A shop the party owns trades on its own while they are elsewhere, and the
  // only sign of it used to be a balance that had quietly moved. Once per game
  // day the difference is added up and put on the parchment, one line per shop
  // that made or lost anything, so a business is legible without opening the
  // book. The rent side of the same day is announced by RealEstateMarket.js.
  function shopDayKey() {
    const raw = ($gameVariables ? $gameVariables.value(113) : '') || '';
    // "01 JAN 2001 12:00" -> "01 JAN 2001": the clock is not part of the day.
    return String(raw).split(' ').slice(0, 3).join(' ');
  }

  function ownedShops() {
    reviveShops();
    return Object.keys(shopData.shops)
      .map(id => shopData.shops[id])
      .filter(shop => shop && shop.owned);
  }

  // What each owned shop's till stood at when the day opened, and the profit
  // since. A shop bought today opens its ledger at its own balance, so the
  // first line it ever prints is a day's trade rather than the whole float.
  function shopDailyProfits() {
    const out = [];
    for (const shop of ownedShops()) {
      // Only what went over the counter counts as the day's takings: a shop
      // earns by selling (Shop.simulateSales), so money the player moved in or
      // out by hand is never reported as trade.
      const earned = Number(shop.earnedToday) || 0;
      const sold   = Number(shop.soldToday)   || 0;
      shop.earnedToday = 0;
      shop.soldToday   = 0;
      if (earned !== 0 || sold !== 0) out.push({ shop, profit: earned, sold });
    }
    return out;
  }

  function announceDailyProfits() {
    const takings = shopDailyProfits();
    if (!takings.length) return takings;
    if (!window.ParchmentToast || !window.ParchmentToast.show) return takings;
    for (const entry of takings) {
      const key = entry.profit > 0 ? 'ShopManagement.owned.dayProfit'
                                   : 'ShopManagement.owned.dayQuiet';
      window.ParchmentToast.show(
        T(key, {
          shop:   shopDisplayName(entry.shop),
          amount: formatEuroPrice(Math.abs(entry.profit)),
          sold:   entry.sold || 0,
        }),
        { title: T('ShopManagement.owned.dayTitle') }
      );
    }
    return takings;
  }

  // Once per day, wherever the party is standing. The first check of a fresh
  // game only writes the day down: there is no yesterday to compare with.
  function checkShopDay() {
    const key = shopDayKey();
    if (!key) return false;
    if (!shopData.globalData) shopData.globalData = {};
    if (!shopData.globalData.lastProfitDay) {
      shopData.globalData.lastProfitDay = key;
      shopDailyProfits();
      return false;
    }
    if (shopData.globalData.lastProfitDay === key) return false;
    shopData.globalData.lastProfitDay = key;
    announceDailyProfits();
    persistShops();
    return true;
  }

  function updateNPCProducing(shop) {
    // Check if NPC producer event exists and is on the producing tile
    const producerEvent = $gameMap.event(npcProducerEventId);
    if (!producerEvent) return;

    // Get the tile ID at the producer's position
    const x = producerEvent.x;
    const y = producerEvent.y;

    // Check all layers for the producing tile
    let isOnProducingTile = false;
    for (let z = 0; z < 4; z++) {
      const tileId = $gameMap.tileId(x, y, z);
      if (tileId === producingTileId) {
        isOnProducingTile = true;
        break;
      }
    }

    // Only proceed with production if on the correct tile
    if (!isOnProducingTile) {
      shop.npcProducingTimer = 0;
      return;
    }

    // Increment producing timer
    shop.npcProducingTimer++;

    if (shop.npcProducingTimer >= producingInterval) {
      shop.npcProducingTimer = 0;

      // Try to produce random item from shop's category
      const categoryItems = getCategoryItems(shop.category);

      if (categoryItems.length > 0) {
        const randomItem =
          categoryItems[Math.floor(Math.random() * categoryItems.length)];
        const recipe = getRecipe(randomItem);

        if (recipe && hasIngredients(recipe, shop)) {
          consumeIngredients(recipe, shop);
          addToStock(randomItem.id, 1, shop);

          // Visual feedback for production
          $gameTemp.requestAnimation([producerEvent], 1229);

          debugLog(
            `NPC produced ${randomItem.name} at tile ${producingTileId}`
          );
        }
      }
    }
  }

  // ── Window / Scene UI removed, handled by ShopManagementUI.js ─────────

  // Debugging helper (kept for console use)
  function addItemToShop(shopId, itemId, amount, isStock = true) {
    const shop = shopData.shops[shopId];
    if (!shop) { debugLog(`Shop ${shopId} not found!`); return false; }
    if (isStock) {
      // Stock is slot-keyed ({itemId, amount} objects); route through addToStock
      return addToStock(itemId, amount, shop);
    }
    shop.warehouseInventory[itemId] = (shop.warehouseInventory[itemId] || 0) + amount;
    return true;
  }

  // Expose data API for ShopManagementUI.js
  //===========================================================================
  // Deliveries from the party's own land
  //===========================================================================
  // A player could keep a field, a herd, a hive and a barrel and own a shop,
  // and the two halves never met: the farming plugins handed every crop, egg,
  // jar and cask to the party's backpack, and this plugin's warehouse - the
  // thing its production recipes actually eat - could only be filled by hand.
  //
  // What passes between them now is the PASSIVE yield: what ripened, laid,
  // capped or finished fermenting while the party was elsewhere. Anything the
  // player picks with their own hands still goes to them. A delivery only
  // happens where there is a shop that deals in that sort of thing, so a
  // blacksmith's warehouse never fills up with turnips, and whatever a shop
  // cannot take is handed back for the party to carry.
  //
  // Returns how many units the warehouse took, so the caller can give the rest
  // to the party.
  function deliverToWarehouse(item, amount) {
    const qty = Math.max(0, Math.floor(Number(amount) || 0));
    if (!item || qty <= 0 || !shopData || !shopData.shops) return null;
    for (const shopId of Object.keys(shopData.shops)) {
      const shop = shopData.shops[shopId];
      if (!shop || !shop.warehouseInventory) continue;
      if (!isItemInCategory(item, shop.category)) continue;
      shop.warehouseInventory[item.id] = (shop.warehouseInventory[item.id] || 0) + qty;
      debugLog(`Delivered ${qty}x ${item.name} to shop ${shopId}'s warehouse`);
      return { shopId, qty };
    }
    return null;
  }

  // The one call the farming plugins make in place of a bare gainItem. Where
  // the party owns a shop that deals in the thing, the crate goes to that
  // shop's warehouse and the party is told which one; otherwise it goes into
  // the backpack exactly as it always did, so a player with no shop sees no
  // change at all.
  function deliverProduce(item, amount) {
    const qty = Math.max(0, Math.floor(Number(amount) || 0));
    if (!item || qty <= 0) return { toShop: 0, toParty: 0, shopId: null };
    let delivery = null;
    try { delivery = deliverToWarehouse(item, qty); }
    catch (e) { console.warn('[ShopManagement] delivery failed', e); delivery = null; }
    if (!delivery) {
      if (window.$gameParty) $gameParty.gainItem(item, qty);
      return { toShop: 0, toParty: qty, shopId: null };
    }
    if (window.ParchmentToast) {
      window.ParchmentToast.show(T('ShopManagement.delivery.line', {
        amount: qty, item: item.name, shop: getMapDisplayName(delivery.shopId) || delivery.shopId,
      }), { title: T('ShopManagement.delivery.title'), icon: item.iconIndex, duration: 200 });
    }
    return { toShop: qty, toParty: 0, shopId: delivery.shopId };
  }

  // ── Ownership ─────────────────────────────────────────────────────────────
  // A shop the party bought on the property market is the same Shop the event
  // driven ones are, only it is not tied to a map switch and it knows which
  // deed it came with. The Deeds page reads this register and opens the
  // management book on whichever one is picked.

  // Trades a bought shop can be in. Each is a <Category:> the item database
  // already stocks, so the shelves are never empty on the first morning.
  const PROPERTY_TRADES = [
    'Food', 'Medical', 'Alchemistry', 'Books', 'Magic',
    'Tools', 'Component', 'Artisan', 'Collectibles', 'Combat',
  ];

  // The trade is the property's, not the roll of the day: the same deed is
  // always the same kind of shop, in every savegame of the world.
  function tradeForProperty(property) {
    const id = Number(property && property.id) || 0;
    return PROPERTY_TRADES[Math.abs(id) % PROPERTY_TRADES.length];
  }

  function propertyShopId(property) {
    return 'prop:' + (property && property.id);
  }

  function getShops() {
    reviveShops();
    return shopData.shops;
  }

  function getShop(shopId) {
    reviveShops();
    return shopData.shops[shopId] || null;
  }

  function setCurrentShopId(shopId) {
    if (!shopData.shops[shopId]) return false;
    shopData.currentShopId = shopId;
    return true;
  }

  // What the shop is called on a page. Event shops are keyed by their map id,
  // bought ones carry the name off the deed.
  function shopDisplayName(shop) {
    if (!shop) return '';
    if (shop.displayName) return shop.displayName;
    const asMap = Number(shop.id);
    if (Number.isFinite(asMap) && asMap > 0) return getMapDisplayName(asMap) || String(shop.id);
    return String(shop.id);
  }

  // Called by RealEstateMarket.js the moment a deed changes hands.
  function onPropertyBought(property) {
    if (!property || property.type !== 'Shop') return null;
    const id = propertyShopId(property);
    if (shopData.shops[id]) return shopData.shops[id];

    const shop = new Shop(id, tradeForProperty(property), 0);
    shop.owned = true;
    shop.propertyId = property.id;
    shop.displayName = property.name;
    shop.location = property.location;
    // Whoever used to stand behind that counter worked for the last owner and
    // leaves with them (shopkeeperGone below). The party names their own.
    shop.staff = [];
    shop.keeperDismissed = true;
    shop.soldToday   = 0;
    shop.earnedToday = 0;
    shopData.shops[id] = shop;
    if (!shopData.currentShopId) shopData.currentShopId = id;
    persistShops();

    if (window.ParchmentToast && window.ParchmentToast.show) {
      window.ParchmentToast.show(
        T('ShopManagement.owned.bought', { shop: shop.displayName, trade: shop.category }),
        { title: T('ShopManagement.owned.title') }
      );
    }
    return shop;
  }

  function onPropertySold(property) {
    if (!property) return;
    const id = propertyShopId(property);
    if (!shopData.shops[id]) return;
    delete shopData.shops[id];
    if (shopData.currentShopId === id) {
      const rest = Object.keys(shopData.shops);
      shopData.currentShopId = rest.length ? rest[0] : null;
    }
    persistShops();
  }

  // The one way into the management book: pick the shop, then push the scene.
  function openManagement(shopId, tab) {
    if (shopId && !setCurrentShopId(shopId)) return false;
    if (!getCurrentShop()) return false;
    window._shopMgmtInitTab = tab || 'overview';
    if (!window.Scene_ShopManagement) return false;
    SceneManager.push(window.Scene_ShopManagement);
    return true;
  }

  window.ShopManagement = {
    getData:               () => shopData,
    getCurrentShop,
    goldToEuros,
    formatEuroPrice,
    isItemInCategory,
    getRecipe,
    hasIngredients,
    consumeIngredients,
    addToStock,
    removeFromStock,
    getMapDisplayName,
    defaultPriceMultiplier,
    deliverToWarehouse,
    deliverProduce,
    getShops,
    getShop,
    setCurrentShopId,
    shopDisplayName,
    onPropertyBought,
    onPropertySold,
    tradeForProperty,
    openManagement,
    refreshEconomy,
    // The bench, worked for the shop: what it makes is shelved, not pocketed.
    beginConsignment,
    endConsignment,
    consignmentShop,
    // Filling the shelves by hand: the bags, and the wholesaler.
    isStockable,
    stockableItems,
    shopTrade,
    wholesalePrice,
    wholesaleOffers,
    stockFromBag,
    pullFromStock,
    buyStock,
    WHOLESALE_RATE,
    FALLBACK_TRADE,
    // Who stands behind the counter, and for which eight hours.
    SHIFT_HOURS:       SHOP_SHIFT_HOURS,
    MAX_STAFF:         SHOP_MAX_STAFF,
    staffRoster,
    staffCandidates,
    staffCoverage,
    staffShift,
    staffName,
    assignStaff,
    dismissStaff,
    // The world's own copy of every shop (save/worlds/<name>/shops.json).
    persist:           persistShops,
    adoptWorldShops,
    // The day's takings, announced once per game day (see checkShopDay).
    ownedShops,
    dailyProfits:      shopDailyProfits,
    announceProfits:   announceDailyProfits,
    checkDay:          checkShopDay,
  };

  // Debug globals
  window.$shopData       = shopData;
  window.$addItemToShop  = addItemToShop;
  window.$getCurrentShop = getCurrentShop;
  window.$formatEuroPrice = formatEuroPrice;

  // Plugin commands, UI scene is defined in ShopManagementUI.js
  PluginManager.registerCommand(pluginName, 'openShopManagement', () => {
    if (window.Scene_ShopManagement) SceneManager.push(window.Scene_ShopManagement);
  });

  PluginManager.registerCommand(pluginName, 'openStock', () => {
    window._shopMgmtInitTab = 'stock';
    if (window.Scene_ShopManagement) SceneManager.push(window.Scene_ShopManagement);
  });

  PluginManager.registerCommand(pluginName, 'openWarehouse', () => {
    window._shopMgmtInitTab = 'warehouse';
    if (window.Scene_ShopManagement) SceneManager.push(window.Scene_ShopManagement);
  });

  PluginManager.registerCommand(pluginName, 'startProducingMiniGame', () => {
    const shop = getCurrentShop();
    if (!shop) { $gameMessage.add(T('ShopManagement.msg.noShop')); return; }
    if (!shop.isWorking) { $gameMessage.add(T('ShopManagement.msg.mustBeOpen')); return; }
    const categoryItems = $dataItems.filter(item => item && isItemInCategory(item, shop.category));
    if (categoryItems.length > 0) {
      const randomItem = categoryItems[Math.floor(Math.random() * categoryItems.length)];
      const recipe = getRecipe(randomItem);
      if (recipe && hasIngredients(recipe, shop)) {
        consumeIngredients(recipe, shop);
        addToStock(randomItem.id, 1, shop);
        $gameMessage.add(T('ShopManagement.msg.produced', { item: randomItem.name }));
      } else {
        $gameMessage.add(T('ShopManagement.msg.notEnoughMats'));
      }
    }
  });

  // setMenuPrice and produceItem were declared in the header above but never registered, so
  // an event using either of them did nothing at all. Both are wired to the shop model the
  // rest of the plugin already uses.

  PluginManager.registerCommand(pluginName, 'setMenuPrice', (args) => {
    refreshEconomy();
    const shop = getCurrentShop();
    if (!shop) { $gameMessage.add(T('ShopManagement.msg.noShop')); return; }
    const itemId = Number(args.itemId);
    const price = Number(args.price);
    const item = $dataItems[itemId];
    if (!item || !Number.isFinite(price) || price < 1) {
      $gameMessage.add(T('ShopManagement.msg.badMenuPrice'));
      return;
    }
    shop.menuPrices[itemId] = Math.floor(price);
    $gameMessage.add(T('ShopManagement.msg.menuPriceSet', {
      item: item.name, price: formatEuroPrice(shop.menuPrices[itemId]),
    }));
  });

  PluginManager.registerCommand(pluginName, 'produceItem', (args) => {
    refreshEconomy();
    // This one names its shop, rather than acting on whichever is current.
    const shopId = args.shopId;
    const shop = shopData.shops[shopId];
    if (!shop) { $gameMessage.add(T('ShopManagement.msg.notFound', { shop: shopId })); return; }
    const item = $dataItems[Number(args.itemId)];
    if (!item) { $gameMessage.add(T('ShopManagement.msg.notEnoughMats')); return; }
    const recipe = getRecipe(item);
    // An item with no recipe costs nothing to make, the same rule simulateProduction follows.
    if (recipe && !hasIngredients(recipe, shop)) {
      $gameMessage.add(T('ShopManagement.msg.notEnoughMats'));
      return;
    }
    if (recipe) consumeIngredients(recipe, shop);
    addToStock(item.id, 1, shop);
    $gameMessage.add(T('ShopManagement.msg.produced', { item: item.name }));
  });
})();
