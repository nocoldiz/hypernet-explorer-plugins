//=============================================================================
// Stealing System Plugin
// Version: 1.0.1
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Advanced stealing system that scans shop events and calculates steal chances
 * @author Omni-Lex
 *
 * @command openStealWindow
 * @text Open Steal Window
 * @desc Opens the stealing window to steal from nearby shops
 *
 * @help
 * This plugin creates a stealing system for RPG Maker MZ.
 *
 * Features:
 * - Scans current map for shop events
 * - Calculates steal percentage based on player agility, item value, and weight
 * - Shows stealable items with success percentages
 * - Handles steal attempts and stores results
 * - Italian translation support
 * - Compatible with RandomDailyShop, SearchableItemShop and the vending machines:
 *   rebuilds each nearby shop's real stock through its own generator
 *
 * Item Note Tags:
 * <Weight: X> - Sets item weight in grams (e.g., <Weight: 500>)
 *
 * Plugin Command:
 * openStealWindow - Opens the stealing interface
 *
 * The system will:
 * - Store stolen item value in Variable 79
 * - Call Common Event 125 only when a steal attempt fails (caught)
 *
 * Proximity Rules:
 * - Every shop within 20 tiles of the player is scanned, and nothing beyond it:
 *   standard Shop Processing counters, RandomDailyShop themed shops (plugin
 *   command or script call), the coordinate seeded local bazaar
 *   (SearchableItemShop OpenLimitedShop) and vending machines.
 *
 * Shop Integration:
 * A themed shop's shelf is rebuilt through RandomDailyShop's own generator for
 * that event's coordinates and date; the bazaar and the vending machines answer
 * through theirs, so a lifted item is always one that is really on sale there.
 *
 * Invisible:
 * While a party member carries the Invisible state, the whole party steals from
 * behind that cover: that member's INT and DEX modifiers raise both the listed
 * chance and the modifier on the roll.
 */

(() => {
    const pluginName = "StealingSystem";

    //=============================================================================
    // Translation System
    //=============================================================================
    

    // Kept as an accessor so every call site (SS().translate('stealTitle'))
    // stays as it was; the copy is in js/i18n/<lang>/plugins/Steal.json.
    function translate(key) {
        const full = 'Steal.' + String(key || '');
        return T.has(full) ? T(full) : key;
    }

    function goldToEuros(gold) {
        // 100 gold = 1 euro
        const euros = gold / 100;
        return `€${euros.toFixed(2)}`;
    }

    PluginManager.registerCommand(pluginName, "openStealWindow", args => {
        if (window.Scene_Steal) SceneManager.push(window.Scene_Steal);
    });

    //=============================================================================
    // DataManager - Extract item weight from notes
    //=============================================================================
    
    DataManager.getItemWeight = function(item) {
        if (!item || !item.note) return 100; // Default weight
        const match = item.note.match(/<Weight:\s*(\d+)>/i);
        return match ? parseInt(match[1]) : 100;
    };

    //=============================================================================
    // Game_System - Store shop data
    //=============================================================================
    
    const _Game_System_initialize = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function() {
        _Game_System_initialize.call(this);
        this._lastStealValue = 0;
    };

    //=============================================================================
    // Steal Calculator
    //=============================================================================
    
    class StealCalculator {
        // There is nobody behind the counter and nobody to call, so taking
        // something off a shelf in an empty world is not a risk, it is just
        // carrying it out. Always 100%, whatever the item weighs or is worth.
        static isEmptyWorld() {
            const WM = window.WorldManager;
            return !!(WM && typeof WM.isEmptyWorld === "function" && WM.isEmptyWorld());
        }

        // Unseen hands. While a party member is Invisible the whole party
        // works behind that cover, and how much it is worth is that member's
        // own wits and fingers: INT and DEX modifiers, a few points each.
        static INVISIBLE_STATE_ID = 46;
        static INVISIBLE_POINTS_PER_MOD = 3;

        static invisibleBonus() {
            if (!window.$gameParty || !$gameParty.members) return 0;
            let best = 0;
            for (const actor of $gameParty.members()) {
                if (!actor || !actor.isStateAffected(this.INVISIBLE_STATE_ID)) continue;
                const intMod = Math.floor((actor.param(4) - 10) / 2);
                const dexMod = Math.floor((actor.param(6) - 10) / 2);
                best = Math.max(best, (intMod + dexMod) * this.INVISIBLE_POINTS_PER_MOD);
            }
            return Math.max(0, Math.floor(best));
        }

        static isNightTime() {
            if (typeof $gameWeather !== 'undefined' && $gameWeather) {
                const mode = $gameWeather.sunlightMode;
                if (mode === 'night') return true;
                if (mode === 'day') return false;
                if ($gameWeather.currentHour !== undefined) {
                    const h = $gameWeather.currentHour;
                    return h >= 20 || h < 6;
                }
            }
            if (typeof $gameVariables !== 'undefined' && $gameVariables) {
                const dateStr = $gameVariables.value(113);
                if (dateStr && typeof dateStr === 'string') {
                    const timePart = dateStr.split(' ')[3];
                    if (timePart) {
                        const h = parseInt(timePart.split(':')[0], 10);
                        if (!isNaN(h)) return h >= 20 || h < 6;
                    }
                }
            }
            return false;
        }

        // Night / Darkness advantage: applies on exterior maps at night or maps tagged <Dark>,
        // but does NOT apply in interior maps (<Interior>) unless explicitly tagged <Dark>.
        static isDarkOrNightCrimeEnvironment() {
            if ($dataMap && $dataMap.note) {
                const note = $dataMap.note;
                if (/<Dark>/i.test(note)) return true;
                if (/<Interior>/i.test(note)) return false;
            }
            if (typeof window.isProceduralInteriorMap === "function" && window.isProceduralInteriorMap()) {
                return true;
            }
            if (window.DungeonFloors && typeof window.DungeonFloors.currentFloor === "function" && window.DungeonFloors.currentFloor() < 0) {
                return true;
            }
            if ($gameVariables && typeof $gameVariables.value(1) === "number" && $gameVariables.value(1) < 0) {
                return true;
            }
            if ($gameMap && $gameMap.mapId() === 636) {
                const data = $gameSystem && $gameSystem._procGenData;
                if (data) {
                    if (data._dungeonSession && data._dungeonSession.type === "tower") return true;
                    if (data.biomeLayerStack && data.biomeLayerStack.length > 0) return true;
                    const b = (data.currentBiome || "").toLowerCase();
                    if (b.includes("cave") || b.includes("dungeon") || b.includes("crypt") || b.includes("sewer") || b.includes("cellar") || b.includes("vault")) {
                        return true;
                    }
                    if (typeof window.isInteriorBiome === "function" && window.isInteriorBiome(data.currentBiome)) {
                        return false;
                    }
                }
            }
            return this.isNightTime();
        }

        // The die is thrown with the same hands that set the odds: the
        // leader's DEX plus whatever the invisible member is worth, plus cover of night/darkness.
        static rollModifier(agility) {
            const nightMod = this.isDarkOrNightCrimeEnvironment() ? 2 : 0;
            return Math.floor(((agility || 10) - 10) / 2) + this.invisibleBonus() + nightMod;
        }

        static calculateStealChance(item, agility) {
            if (this.isEmptyWorld()) return 100;
            const baseChance = 50;
            const dexMod = Math.floor(((agility || 10) - 10) / 2);
            const agilityBonus = dexMod * 5; // 5% per point of DEX modifier
            const value = item ? (item.price || 0) : 0;
            const weight = DataManager.getItemWeight(item);
            
            // Penalties
            const valuePenalty = Math.min(value / 100, 30); // Max 30% penalty
            const weightPenalty = Math.min(weight / 100, 30); // Max 30% penalty
            
            // Practised hands (Pickpocketing, specialization 203). Four points
            // a tier, inside the same clamp, so it never becomes a certainty.
            const trained = window.SpecializationXP
                ? (window.SpecializationXP.partyLevel('Pickpocketing') - 1) * 4 : 0;

            // Night/Dark cover bonus: darkness and low visibility make crimes significantly harder to catch (+20%)
            // Does not apply in interior maps unless tagged with <Dark>.
            const nightBonus = this.isDarkOrNightCrimeEnvironment() ? 20 : 0;

            let chance = baseChance + agilityBonus + trained + this.invisibleBonus() + nightBonus
                - valuePenalty - weightPenalty;

            // Clamp between 5% and 95%
            return Math.max(5, Math.min(95, Math.floor(chance)));
        }

        static performSteal(chance, options = {}) {
            // Every attempt teaches, caught or not. Losing the item is already
            // punishment enough without also learning nothing from it.
            if (window.SpecializationXP) {
                window.SpecializationXP.awardCapped('Pickpocketing', 1, { soloist: true });
            }
            if (window.Dice3D && typeof window.Dice3D.rollPercentage === 'function') {
                return window.Dice3D.rollPercentage(chance, {
                    actionName: options.actionName || 'Steal Attempt',
                    statName: 'DEX',
                    modifier: options.modifier || 0
                }).then(res => res.success);
            }
            return Promise.resolve(Math.random() * 100 < chance);
        }
    }

    //=============================================================================
    // Shop Scanner - Finds shops on current map
    //=============================================================================
    
    class ShopScanner {
        // A shoplifter works the block, not the map: every counter, stall,
        // shelf and machine standing within this many tiles of the player is
        // fair game, and nothing beyond it is.
        static SHOP_PROXIMITY = 20;

        // Every shop RandomDailyShop runs is one themed shop behind one plugin
        // command, so a lifted shelf is that command's shopType argument put
        // back through the plugin's own generator. The coordinate seeded bazaar
        // and the vending machines answer the same way, each through its own.
        static SHOP_COMMANDS = {
            themed:  { plugin: 'RandomDailyShop',         command: 'openThemedShop' },
            limited: { plugin: 'SearchableItemShop',      command: 'OpenLimitedShop' },
            vending: { plugin: 'RealisticVendingMachine', command: 'openVendingMachine' }
        };

        // Event pages store the plugin's path-prefixed name on newer maps
        // ("Economy/RandomDailyShop") and the bare one on older ones.
        static matchesCommand(params, kind) {
            const spec = this.SHOP_COMMANDS[kind];
            return !!params && !!spec &&
                String(params[0] || '').split('/').pop() === spec.plugin &&
                params[1] === spec.command;
        }

        static isDailyShopCommand(params) {
            return this.matchesCommand(params, 'themed');
        }

        static shopTypeOf(params) {
            return String((params[3] && params[3].shopType) || '').trim();
        }

        static scanMapForShops() {
            const items = [];
            const events = $gameMap.events();
            const playerX = $gamePlayer.x;
            const playerY = $gamePlayer.y;

            for (const event of events) {
                if (!event) continue;
                const shopItems = this.extractShopItems(event, playerX, playerY);
                items.push(...shopItems);
            }

            // Remove duplicates
            const uniqueItems = [];
            const seen = new Set();

            for (const item of items) {
                const key = `${item.type}_${item.id}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    uniqueItems.push(item);
                }
            }

            // What is on the shelf is what can be lifted off it. Every row is
            // put against the counter's own stock record (window.ShopStock,
            // the same numbers the till sells from), and a row the shop has
            // run out of is not offered. Without this a thief could take the
            // same thing off the same shelf forever.
            return uniqueItems.filter(entry => {
                entry.stock = this.stockOf(entry);
                return entry.stock > 0;
            });
        }

        // How many of an entry the counter it came from still holds. A source
        // that keeps no stock of its own answers with the unlimited count, so
        // nothing that was stealable before stops being stealable now.
        static stockOf(entry) {
            const SS = window.ShopStock;
            if (!SS || !entry || !entry.data) return 999;
            if (!entry.sourceMapId || !entry.sourceEventId) return 999;
            try {
                return SS.get(entry.sourceMapId, entry.sourceEventId, entry.data);
            } catch (e) {
                console.error('StealingSystem: Error reading shop stock:', e);
                return 999;
            }
        }

        static isWithinProximity(eventX, eventY, playerX, playerY, distance) {
            // Chebyshev distance: a square block of tiles around the player,
            // so a counter is as reachable diagonally as it is straight ahead.
            const dist = Math.max(Math.abs(eventX - playerX), Math.abs(eventY - playerY));
            return dist <= distance;
        }

        // A page can also open a shop from a script line rather than a plugin
        // command, which is how the convenience wrappers are called.
        static scriptShopType(text) {
            const themed = text.match(/openRandomThemedShop\s*\(\s*['"]([A-Za-z]+)['"]/);
            if (themed) return themed[1];
            const wrapper = text.match(/openRandomDaily([A-Za-z]+)\s*\(/);
            if (wrapper) {
                const suffix = wrapper[1];
                if (suffix === 'SpellShop' || suffix === 'SkillShop') return null;
                const shops = window.RandomDailyThemedShops || {};
                const key = suffix.charAt(0).toLowerCase() + suffix.slice(1);
                return shops[key] ? key : null;
            }
            return null;
        }

        static extractShopItems(event, playerX, playerY) {
            const items = [];
            const pages = event.event().pages;

            // Nothing on this event is within reach, so nothing on it is read.
            if (!this.isWithinProximity(event.x, event.y, playerX, playerY, this.SHOP_PROXIMITY)) {
                return items;
            }

            const sourceMapId = $gameMap.mapId();
            const sourceEventId = event.eventId();
            const push = (list) => {
                for (const entry of list) {
                    entry.sourceMapId = sourceMapId;
                    entry.sourceEventId = sourceEventId;
                    items.push(entry);
                }
            };
            const goodsEntry = (type, id) => {
                let data = null;
                let itemType = '';
                if (type === 0 && id > 0)      { data = $dataItems[id];   itemType = 'item'; }
                else if (type === 1 && id > 0) { data = $dataWeapons[id]; itemType = 'weapon'; }
                else if (type === 2 && id > 0) { data = $dataArmors[id];  itemType = 'armor'; }
                return data ? { type: itemType, id, data } : null;
            };

            const seenThemed = new Set();
            let hasLimited = false;
            let hasVending = false;
            let scriptBuffer = '';

            for (const page of pages) {
                const list = page.list;
                for (let i = 0; i < list.length; i++) {
                    const command = list[i];

                    // Command 302: standard Shop Processing, plus its 605 rows
                    if (command.code === 302) {
                        const first = goodsEntry(command.parameters[0], command.parameters[1]);
                        if (first) push([first]);

                        let j = i + 1;
                        while (j < list.length && list[j].code === 605) {
                            const goods = list[j].parameters;
                            if (goods && goods.length >= 2) {
                                const entry = goodsEntry(goods[0], goods[1]);
                                if (entry) push([entry]);
                            }
                            j++;
                        }
                    }

                    // Command 357: a shop opened by one of the shop plugins
                    if (command.code === 357) {
                        if (this.matchesCommand(command.parameters, 'themed')) {
                            const shopType = this.shopTypeOf(command.parameters);
                            if (shopType && !seenThemed.has(shopType)) {
                                seenThemed.add(shopType);
                                push(this.getDailyShopItems(event, shopType));
                            }
                        } else if (this.matchesCommand(command.parameters, 'limited')) {
                            hasLimited = true;
                        } else if (this.matchesCommand(command.parameters, 'vending')) {
                            hasVending = true;
                        }
                    }

                    // Commands 355 / 655: a shop opened from a script line
                    if (command.code === 355 || command.code === 655) {
                        scriptBuffer += String(command.parameters[0] || '') + '\n';
                    }
                }
            }

            if (scriptBuffer) {
                const shopType = this.scriptShopType(scriptBuffer);
                if (shopType && !seenThemed.has(shopType)) {
                    seenThemed.add(shopType);
                    push(this.getDailyShopItems(event, shopType));
                }
                if (/OpenLimitedShop|limitedSelection/.test(scriptBuffer)) hasLimited = true;
            }

            if (hasLimited) push(this.getLimitedShopItems(event));
            if (hasVending) push(this.getVendingMachineItems(event));

            // Fallback: If no shop items found, and the event is the currently active interpreter event (e.g. NPC Pickpocketing)
            if (items.length === 0 && event.eventId() === $gameMap._interpreter.eventId()) {
                const npcItems = this.generateNPCItems(event);
                items.push(...npcItems);
            }

            return items;
        }

        // A row off any of the shelves reduced to the one shape the steal
        // list understands.
        static toStealEntries(entries) {
            const out = [];
            for (const entry of entries || []) {
                if (!entry || !entry.name) continue;
                let itemType = '';
                if (DataManager.isItem(entry))        itemType = 'item';
                else if (DataManager.isWeapon(entry)) itemType = 'weapon';
                else if (DataManager.isArmor(entry))  itemType = 'armor';
                if (itemType) out.push({ type: itemType, id: entry.id, data: entry });
            }
            return out;
        }

        static getLimitedShopItems(event) {
            const api = window.SearchableItemShop;
            if (!api || typeof api.limitedSelection !== 'function') return [];
            try {
                const seed = api.limitedSeedString($gameMap.mapId(), event.x, event.y);
                const selection = api.limitedSelection(seed, 6);
                return this.toStealEntries(selection && selection.items);
            } catch (e) {
                console.error('StealingSystem: Error reading the local bazaar stock:', e);
                return [];
            }
        }

        static getVendingMachineItems(event) {
            const api = window.VendingMachine;
            if (!api || typeof api.stockAt !== 'function') return [];
            try {
                const stock = api.stockAt($gameMap.mapId(), event.x, event.y);
                const slots = (stock && stock.slots) || {};
                return this.toStealEntries(Object.keys(slots).map(code => slots[code].item));
            } catch (e) {
                console.error('StealingSystem: Error reading vending machine stock:', e);
                return [];
            }
        }


        static generateNPCItems(event) {
            const items = [];
            try {
                const mapId = $gameMap.mapId();
                const x = event.x;
                const y = event.y;
                const eventId = event.eventId();
                
                // Use Variable 113 to seed the daily generation consistently
                const dateKey = $gameVariables.value(113) || new Date().toDateString();
                const seedStr = `${mapId}_${eventId}_${x}_${y}_${dateKey}`;
                let seed = 0;
                for (let i = 0; i < seedStr.length; i++) {
                    seed = (seed * 31 + seedStr.charCodeAt(i)) & 0x7fffffff;
                }
                
                const seededRandom = () => {
                    seed = (seed * 9301 + 49297) % 233280;
                    return seed / 233280;
                };

                // Gather low/medium value items. A <Restricted> row is granted
                // by the system that owns it, so it is never in a pocket.
                const stealable = (entry) =>
                    !(window.ItemSystemUtils && window.ItemSystemUtils.isRestrictedEntry(entry));
                const validItems = [];
                if (typeof $dataItems !== 'undefined') {
                    for (let i = 1; i < $dataItems.length; i++) {
                        const item = $dataItems[i];
                        if (item && item.name && !item.name.startsWith("---") && item.price > 0 && item.price <= 5000 && stealable(item)) {
                            validItems.push({ type: 'item', id: i, data: item });
                        }
                    }
                }
                if (typeof $dataWeapons !== 'undefined') {
                    for (let i = 1; i < $dataWeapons.length; i++) {
                        const weapon = $dataWeapons[i];
                        if (weapon && weapon.name && !weapon.name.startsWith("---") && weapon.price > 0 && weapon.price <= 5000 && stealable(weapon)) {
                            validItems.push({ type: 'weapon', id: i, data: weapon });
                        }
                    }
                }
                if (typeof $dataArmors !== 'undefined') {
                    for (let i = 1; i < $dataArmors.length; i++) {
                        const armor = $dataArmors[i];
                        if (armor && armor.name && !armor.name.startsWith("---") && armor.price > 0 && armor.price <= 5000 && stealable(armor)) {
                            validItems.push({ type: 'armor', id: i, data: armor });
                        }
                    }
                }

                if (validItems.length > 0) {
                    const numItems = Math.floor(seededRandom() * 3) + 1; // 1 to 3 items
                    const sourceMapId = mapId;
                    const sourceEventId = eventId;
                    
                    for (let k = 0; k < numItems; k++) {
                        const idx = Math.floor(seededRandom() * validItems.length);
                        const selected = validItems[idx];
                        items.push({
                            type: selected.type,
                            id: selected.id,
                            data: selected.data,
                            sourceMapId,
                            sourceEventId
                        });
                    }
                }
            } catch (e) {
                console.error("StealingSystem: Error generating NPC items:", e);
            }
            return items;
        }

        static getDailyShopItems(event, shopType = 'generalStore') {
            const items = [];

            if (!window.getRandomThemedShopItems) {
                console.warn('StealingSystem: getRandomThemedShopItems not found; is RandomDailyShop loaded?');
                return items;
            }

            try {
                const mapId = $gameMap.mapId();
                const x = event.x;
                const y = event.y;

                const dailyShopItems = window.getRandomThemedShopItems(shopType, mapId, x, y);

                // Convert items to stealing system format
                if (dailyShopItems && Array.isArray(dailyShopItems)) {
                    for (const item of dailyShopItems) {
                        if (item && item.name) {
                            let itemType = '';

                            if (DataManager.isItem(item)) {
                                itemType = 'item';
                            } else if (DataManager.isWeapon(item)) {
                                itemType = 'weapon';
                            } else if (DataManager.isArmor(item)) {
                                itemType = 'armor';
                            }

                            if (itemType) {
                                items.push({
                                    type: itemType,
                                    id: item.id,
                                    data: item
                                });
                            }
                        }
                    }
                }
            } catch (e) {
                console.error("StealingSystem: Error generating daily shop items:", e);
            }

            return items;
        }
    }


    // Public API consumed by StealingSystemUI.js
    window.StealingSystem = {
        scanItems:    () => ShopScanner.scanMapForShops(),
        calcChance:   (item, agi) => StealCalculator.calculateStealChance(item, agi),
        performSteal: (chance, options) => StealCalculator.performSteal(chance, options),
        invisibleBonus: () => StealCalculator.invisibleBonus(),
        rollModifier: (agi) => StealCalculator.rollModifier(agi),
        fmt:          goldToEuros,
        translate,
        // A lifted thing comes off the shop's own stock, whether or not that
        // counter has ever been opened: window.ShopStock writes the record the
        // till reads. The old version wrote only into a record that already
        // existed, which for an unopened shop was none, so nothing was ever
        // taken off the shelf.
        stockOf: (entry) => ShopScanner.stockOf(entry),
        reduceStock: (entry) => {
            if (!entry || !entry.data || !entry.sourceMapId || !entry.sourceEventId) return;
            if (!window.ShopStock) return;
            try {
                window.ShopStock.reduce(entry.sourceMapId, entry.sourceEventId, entry.data, 1);
            } catch (e) {
                console.error('StealingSystem: Error reducing shop stock:', e);
            }
        },
    };
    window.StealCalculator = StealCalculator;
    window.ShopScanner = ShopScanner;
})();