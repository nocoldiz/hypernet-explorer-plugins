/*:
 * @plugindesc v2.1 Random Loot System - Loot quality scales with Party Median Level + Variable.
 * @author Omni-Lex (Modified)
 * @target MZ MV
 * @filename RandomLootSystem.js
 * @orderAfter PluginManager
 *
 * @command getItem
 * @text Get Random Item
 * @desc Adds a random item to the player's inventory.
 *
 * @command getArmor
 * @text Get Random Armor
 * @desc Adds a random armor to the player's inventory.
 *
 * @command getWeapon
 * @text Get Random Weapon
 * @desc Adds a random weapon to the player's inventory.
 *
 * @help
 * This plugin adds commands to randomly generate loot with rarity tiers.
 * * Plugin Commands (MV Style):
 * getItem                # Get a random item
 * getArmor               # Get a random armor
 * getWeapon              # Get a random weapon
 * * --- HOW RARITY IS CALCULATED ---
 * The plugin calculates a "Rarity Score" (0-100).
 * Formula: (Game Variable 2) + (Party Median Level)
 * * 1. Party Median Level:
 * As your party levels up, loot automatically improves.
 * * 2. Game Variable 2 (Modifier):
 * Use this variable to add "Map Difficulty" or "Luck".
 * - Set to 0: Loot is based purely on party level.
 * - Set to 20: Loot is equivalent to a party 20 levels higher.
 * - Set to -20: Loot is worse (good for low-level areas).
 * * Score Benchmarks:
 * - 0-20: Almost all Common items
 * - 25-45: Mix of Common and Uncommon
 * - 50: Balanced distribution
 * - 75: More Epic and Legendary items
 * - 100: Almost all Legendary items
 * * Rarity Tiers (based on item price):
 * - Common (White): 8000-19999 gold
 * - Uncommon (Green): 20000-59999 gold
 * - Rare (Blue): 60000-99999 gold
 * - Epic (Purple): 100000-999999 gold
 * - Legendary (Orange): 1000000+ gold
 */

(function() {
    
    // Define rarity tiers and their colors
    // i18n-ignore-start: tier ids; the heading is named through Loot.tier.<id>
    let RARITY_TIERS = [
        { name: "Common", colorCode: "#FFFFFF", minPrice: 8000, maxPrice: 19999 },
        { name: "Uncommon", colorCode: "#1AFF1A", minPrice: 20000, maxPrice: 59999 },
        { name: "Rare", colorCode: "#0080FF", minPrice: 60000, maxPrice: 99999 },
        { name: "Epic", colorCode: "#8000FF", minPrice: 100000, maxPrice: 999999 },
        { name: "Legendary", colorCode: "#FF8000", minPrice: 1000000, maxPrice: Infinity }
    ];
    // i18n-ignore-end

    fetch('js/db/Items/Rarity.json')
        .then(response => response.json())
        .then(data => {
            RARITY_TIERS = data;
        })
        .catch(err => {
            console.warn("Failed to load Rarity.json, using fallback tiers:", err);
        });
    
    // Section-header / divider rows (e.g. "<-- Light -->") and nameless
    // placeholder entries exist only to group shop lists. Never loot them.
    // A <Restricted> row is not loot either: it is granted by the one system
    // that owns it (ItemSystemUtils.isRestrictedEntry).
    function isSelectableLootItem(item) {
        if (!item) return false;
        const name = (item.name || '').trim();
        if (name === '') return false;
        if (/^<--.*-->$/.test(name)) return false;
        if (window.ItemSystemUtils && window.ItemSystemUtils.isRestrictedEntry(item)) return false;
        return true;
    }

    // Variable 2 = DungeonFloorSystem "Maximum floor reached" (deeper = rarer loot)
    const MAX_FLOOR_VARIABLE_ID = 2;

    // --- Seeded RNG (mulberry32) keyed by world seed + location + level bracket ---
    function getWorldSeed() {
        let historySeed = 19002001;
        if (window.HistoryManager && typeof window.HistoryManager.getSeed === 'function') {
            historySeed = window.HistoryManager.getSeed();
        } else if (typeof $gameSystem !== 'undefined' && $gameSystem && $gameSystem._historySeed !== undefined) {
            historySeed = $gameSystem._historySeed;
        }
        return historySeed >>> 0;
    }

    function mulberry32(seed) {
        let a = seed >>> 0;
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // How far into the Omega Tower the party has been, counted in floors. The
    // shaft runs both ways from the ground: a hundred floors climbed and
    // ninety-two descended are the same kind of achievement, so the deepest
    // lower floor reached (window.DungeonFloors) is added to the highest upper
    // one and the pair feeds the rarity equation together.
    function getMaxDungeonFloor() {
        const climbed = (typeof $gameVariables !== 'undefined' && $gameVariables)
            ? ($gameVariables.value(MAX_FLOOR_VARIABLE_ID) || 0)
            : 0;
        const descended = (window.DungeonFloors && typeof window.DungeonFloors.depthReached === 'function')
            ? (window.DungeonFloors.depthReached() || 0)
            : 0;
        return climbed + descended;
    }

    const START_YEAR_MIN = 2001;
    const START_YEAR_MAX_LOOT = 2012;

    function getWorldStartingYear() {
        if (window.WorldManager && typeof window.WorldManager.startingYear === 'function') {
            return window.WorldManager.startingYear();
        }
        if (window.WorldManager && typeof window.WorldManager.worldInfo === 'function') {
            const info = window.WorldManager.worldInfo();
            if (info && info.startYear !== undefined) {
                const y = Number(info.startYear);
                if (Number.isFinite(y)) return y;
            }
        }
        return START_YEAR_MIN;
    }

    function getWorldStartingLevel() {
        if (window.WorldManager && typeof window.WorldManager.startingLevel === 'function') {
            return window.WorldManager.startingLevel();
        }
        if (window.WorldManager && typeof window.WorldManager.worldInfo === 'function') {
            const info = window.WorldManager.worldInfo();
            if (info && info.startLevel !== undefined) {
                const l = Number(info.startLevel);
                if (Number.isFinite(l)) return Math.max(1, l);
            }
        }
        return 1;
    }

    // 2001 gives default value (0 bonus), 2012 gives max (100 bonus),
    // intermediate years scale in between.
    function getYearLootBonus() {
        const year = getWorldStartingYear();
        if (year <= START_YEAR_MIN) return 0;
        if (year >= START_YEAR_MAX_LOOT) return 100;
        return Math.round(((year - START_YEAR_MIN) / (START_YEAR_MAX_LOOT - START_YEAR_MIN)) * 100);
    }

    // --- Calculate Party Median Level & Effective Loot Level ---
    function getPartyMedianLevel() {
        if (typeof $gameParty === 'undefined' || !$gameParty || typeof $gameParty.battleMembers !== 'function') {
            return 1;
        }
        // Get battle members
        const members = $gameParty.battleMembers();
        if (!members || members.length === 0) return 1;

        // Extract levels and sort numerically
        const levels = members.map(actor => actor.level).sort((a, b) => a - b);
        
        const mid = Math.floor(levels.length / 2);

        // Calculate median
        if (levels.length % 2 !== 0) {
            // Odd number of members, pick middle
            return levels[mid];
        } else {
            // Even number of members, average the two middle ones
            return Math.floor((levels[mid - 1] + levels[mid]) / 2);
        }
    }

    function getEffectiveLootLevel() {
        return Math.max(getPartyMedianLevel(), getWorldStartingLevel());
    }

    // 10-level brackets: Lv 1-10 -> 0, 11-20 -> 1, ... Higher brackets unlock rarer tiers
    // AND reshuffle the loot pool, so the same spot yields a different/rarer item per bracket.
    function getLevelBracket() {
        return Math.floor(getEffectiveLootLevel() / 10);
    }

    // Build an RNG seeded from world seed + current location + level bracket.
    // salt distinguishes item/armor/weapon rolls at the same tile so they don't collide.
    function makeLootRNG(salt) {
        const mapId = (typeof $gameMap !== 'undefined' && $gameMap) ? $gameMap.mapId() : 0;
        let x = 0, y = 0;
        const interp = (typeof $gameMap !== 'undefined' && $gameMap) ? $gameMap._interpreter : null;
        const event = interp && interp.eventId() > 0 ? $gameMap.event(interp.eventId()) : null;
        if (event) {
            x = event.x; y = event.y;
        } else if (typeof $gamePlayer !== 'undefined' && $gamePlayer) {
            x = $gamePlayer.x; y = $gamePlayer.y;
        }
        const bracket = getLevelBracket();
        let seed = (mapId * 73856093) ^ (x * 19349663) ^ (y * 83492791) ^ getWorldSeed()
            ^ Math.imul(bracket + 1, 40503)
            ^ Math.imul((salt || 0) + 1, 2654435761);
        seed = seed >>> 0;
        return mulberry32(seed);
    }
    
    // Calculate the rarity tier based on item price
    function getItemRarityTier(price) {
        for (let tier of RARITY_TIERS) {
            if (price >= tier.minPrice && (tier.maxPrice === null || tier.maxPrice === undefined || price <= tier.maxPrice)) {
                return tier;
            }
        }
        return RARITY_TIERS[0]; // Default to Common if something goes wrong
    }
    
    // WEIGHT CALCULATION
    function calculateItemWeight(itemPrice, rarityInfluence) {
        // Determine which tier this item belongs to
        let tierIndex = 0;
        for (let i = 0; i < RARITY_TIERS.length; i++) {
            if (itemPrice >= RARITY_TIERS[i].minPrice && (RARITY_TIERS[i].maxPrice === null || RARITY_TIERS[i].maxPrice === undefined || itemPrice <= RARITY_TIERS[i].maxPrice)) {
                tierIndex = i;
                break;
            }
        }
        
        // Normalize influence to 0-1 range
        const influence = rarityInfluence / 100;
        
        // Calculate tier position (0 = Common, 1 = Legendary)
        const tierPower = tierIndex / (RARITY_TIERS.length - 1);
        
        // Use smooth power curve for weight calculation
        let weight = Math.pow(influence, tierPower * 3) * Math.pow(1 - influence, (1 - tierPower) * 3) * 1000;
        
        // Boost Uncommon items by 50% to make them more common
        if (tierIndex === 1) {
            weight *= 1.5;
        }
        
        return Math.max(1, weight);
    }
    
    // Get random item based on rarity influence.
    // `collectibles` flips the pool over: instead of everything BUT the
    // keepsake shelf, only the keepsake shelf, drawn on a much flatter curve.
    function getRandomItem(itemList, salt, collectibles) {
        if (!itemList || itemList.length === 0) return null;

        const rand = makeLootRNG(salt);

        // Allow optional whitespace inside the tag (e.g. "<category: BodyPart >")
        // so spaced notes cannot bypass the exclusion.
        // A sealed vial of rabies is contraband somebody bottled on purpose,
        // not something a barrel coughs up, so the Diseases shelf is out of
        // the loot pool with the reagents and the offal.
        const EXCLUDED = [/<category:\s*BodyPart\s*>/i, /<category:\s*Alchemistry\s*>/i, /<category:\s*Crafting\s*>/i, /<category:\s*Diseases\s*>/i];
        const isKeepsake = (item) =>
            !!(window.ItemCollectibles && window.ItemCollectibles.isFixed(item));
        const validItems = itemList.filter(item =>
            item &&
            isSelectableLootItem(item) &&
            // Keepsakes are their own draw (see lootItem): out of the ordinary
            // pool, and the whole of the collectible one.
            (collectibles ? isKeepsake(item) : !isKeepsake(item)) &&
            // Nothing of the wrong nature is ever found either: a severed
            // world turns up no charms in a crate and an unbound one turns up
            // nothing ordinary (window.MagicNature).
            (!window.MagicNature || window.MagicNature.allowsData(item)) &&
            !(item.note && EXCLUDED.some(re => re.test(item.note))));
        if (validItems.length === 0) return null;

        // --- RARITY SCALING ---
        // Discrete level brackets (every 10 levels) plus the deepest dungeon floor reached.
        // Higher brackets/floors push the weighting toward rarer tiers.
        const levelBracket = getLevelBracket();
        const maxFloor = getMaxDungeonFloor();
        // Cave chests are rare but carry rare loot: the procedural chest placer
        // sets $gameSystem._lootRarityBonus and it applies only on the proc map.
        const onProcMap = typeof $gameMap !== 'undefined' && $gameMap && $gameMap.mapId() === 636;
        const procBonus = (onProcMap && typeof $gameSystem !== 'undefined' && $gameSystem._lootRarityBonus) || 0;
        // A patron's treasure room is behind one hatch in one world square and
        // pays like it (PatreonRewards.lootRarityBonus).
        const patronBonus = (window.PatreonRewards && typeof window.PatreonRewards.lootRarityBonus === 'function')
            ? window.PatreonRewards.lootRarityBonus() : 0;
        const lootBonus = Math.max(procBonus, patronBonus);
        // Somebody who can tell junk from worth picks the good thing out of the
        // pile rather than the first thing (Appraising, specialization 496).
        const appraisal = window.SpecializationXP
            ? (window.SpecializationXP.partyLevel('Appraising') - 1) * 4 : 0;
        const yearBonus = getYearLootBonus();
        let rarityInfluence = levelBracket * 10 + maxFloor + lootBonus + appraisal + yearBonus;
        rarityInfluence = Math.max(0, Math.min(100, rarityInfluence));
        
        // Calculate weighted probability for each item
        let weightedItems = [];
        let totalWeight = 0;
        
        for (let item of validItems) {
            // Skip items with price of 0 (usually key items)
            if (item.price === 0) continue;
            
            // Calculate weight using new algorithm
            let weight = calculateItemWeight(item.price, rarityInfluence);

            // A crate of keepsakes is not graded the way a crate of swords is:
            // half the weight is levelled flat across the shelf, so the top of
            // the price range is genuinely reachable at any party level and the
            // spread is wider than any weapon or armour roll.
            if (collectibles) weight = weight * 0.5 + COLLECTIBLE_FLAT_WEIGHT;

            // Add extreme rarity for artifacts
            if (item.id >= 1500 || (item.note && item.note.toLowerCase().includes('<category: artifact>'))) {
                if (typeof $gameParty !== 'undefined' && $gameParty.hasItem(item, true)) continue;
                weight *= 0.005; // 0.5% of standard weight
            }
            
            weightedItems.push({
                item: item,
                weight: weight
            });
            
            totalWeight += weight;
        }
        
        // If no valid weighted items, return random item
        if (weightedItems.length === 0 || totalWeight === 0) {
            return validItems[Math.floor(rand() * validItems.length)];
        }

        // Select random item based on weight
        let random = rand() * totalWeight;
        let currentWeight = 0;

        for (let weightedItem of weightedItems) {
            currentWeight += weightedItem.weight;
            if (random <= currentWeight) {
                return weightedItem.item;
            }
        }

        // Fallback
        return validItems[Math.floor(rand() * validItems.length)];
    }
    
    // A quarter of every item chest holds a keepsake instead of something
    // useful. It is the only thing that puts one in the world besides an NPC's
    // own pockets, and it is drawn on its own RNG so the ordinary item a chest
    // would otherwise have held does not shift when this roll misses.
    const COLLECTIBLE_CHEST_CHANCE = 0.25;
    const COLLECTIBLE_FLAT_WEIGHT = 250;

    function lootItem(salt) {
        const draw = makeLootRNG((salt || 0) + 0x51D);
        if (draw() < COLLECTIBLE_CHEST_CHANCE) {
            const keepsake = getRandomItem($dataItems, (salt || 0) + 0xC0, true);
            if (keepsake) return keepsake;
        }
        return getRandomItem($dataItems, salt);
    }

    // Finding loot is a reward like any other, so it goes through the shared
    // popup (ParchmentToast.reward) instead of stopping the player with a
    // message box. The rarity tier becomes the popup's heading.
    // The tier id names itself through the namespace; an id with no entry reads
    // as written, which is what a modded tier wants.
    function tierLabel(id) {
        const key = 'Loot.tier.' + String(id || '').toLowerCase();
        return T.has(key) ? T(key) : String(id || '');
    }

    function showLootMessage(item) {
        if (!item) return;
        const tier = getItemRarityTier(item.price);
        const tierName = tier && tier.name ? tierLabel(tier.name) : '';
        if (window.ParchmentToast) {
            window.ParchmentToast.reward({
                title: tierName
                    ? T('Loot.foundWithTier', { tier: tierName })
                    : T('Loot.found'),
                entries: [{ obj: item, qty: 1 }]
            });
            return;
        }
        const message = T('Loot.foundMessage', {
            color: colorToCode(tier.colorCode),
            item: window.translateText ? window.translateText(item.name) : item.name,
        });
        window.skipLocalization = true
        $gameMessage.add(message);
        window.skipLocalization = false
    }
    
    // Convert hex color to RPG Maker color code
    function colorToCode(hexColor) {
        const colorMap = {
            "#FFFFFF": 0, // White
            "#1AFF1A": 3, // Green
            "#0080FF": 4, // Blue
            "#8000FF": 10, // Purple
            "#FF8000": 6  // Orange
        };
        
        return colorMap[hexColor] || 0;
    }
    
    // Extend the plugin command interpreter for MV
    const _Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;
    Game_Interpreter.prototype.pluginCommand = function(command, args) {
        _Game_Interpreter_pluginCommand.call(this, command, args);
        
        switch (command.toLowerCase()) {
            case 'getitem':
                const randomItem = lootItem(1);
                if (randomItem) {
                    $gameParty.gainItem(randomItem, 1);
                    showLootMessage(randomItem);
                }
                break;
                
            case 'getarmor':
                const randomArmor = getRandomItem($dataArmors, 2);
                if (randomArmor) {
                    $gameParty.gainItem(randomArmor, 1);
                    showLootMessage(randomArmor);
                }
                break;
                
            case 'getweapon':
                const randomWeapon = getRandomItem($dataWeapons, 3);
                if (randomWeapon) {
                    $gameParty.gainItem(randomWeapon, 1);
                    showLootMessage(randomWeapon);
                }
                break;
        }
    };
    
    // Register plugin commands for MZ
    if (Utils.RPGMAKER_NAME === "MZ") {
        PluginManager.registerCommand("RandomLootSystem", "getItem", args => {
            const randomItem = lootItem(1);
            if (randomItem) {
                $gameParty.gainItem(randomItem, 1);
                showLootMessage(randomItem);
            }
        });
        
        PluginManager.registerCommand("RandomLootSystem", "getArmor", args => {
            const randomArmor = getRandomItem($dataArmors, 2);
            if (randomArmor) {
                $gameParty.gainItem(randomArmor, 1);
                showLootMessage(randomArmor);
            }
        });
        
        PluginManager.registerCommand("RandomLootSystem", "getWeapon", args => {
            const randomWeapon = getRandomItem($dataWeapons, 3);
            if (randomWeapon) {
                $gameParty.gainItem(randomWeapon, 1);
                showLootMessage(randomWeapon);
            }
        });
    }
})();