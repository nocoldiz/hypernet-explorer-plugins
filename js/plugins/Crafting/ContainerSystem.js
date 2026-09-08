/*:
 * @target MZ
 * @plugindesc Container System v2.1.0
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 * @help
 * ============================================================================
 * Container System Plugin for RPG Maker MZ
 * ============================================================================
 *
 * This plugin provides a comprehensive container system that allows you to
 * create storage containers throughout your game world with automatic item
 * generation based on categories and rarity.
 *
 * Features:
 * - Unlimited containers with infinite storage capacity
 * - Store and retrieve items with quantity selection
 * - Containers are unique per map and event
 * - Automatic item generation based on categories and rarity
 * - Extradimensional container accessible from anywhere
 * - Single column item display with rarity colors
 * - Italian translation support
 *
 * Item Setup:
 * - Add <category:CategoryName> in item notes to assign categories
 * - Item price determines rarity and spawn chance
 *
 * Rarity Tiers (based on item price):
 * - Common (White): 0-999 gold
 * - Uncommon (Green): 1,000-9,999 gold
 * - Rare (Blue): 10,000-99,999 gold
 * - Epic (Purple): 100,000-999,999 gold
 * - Legendary (Orange): 1,000,000+ gold
 *
 * ============================================================================
 * Plugin Commands
 * ============================================================================
 *
 * Open Container
 * - Opens a container at the current event location
 *
 * Open Extradimensional Container
 * - Opens a special container that can be accessed from anywhere
 *
 * Generate Container Items
 * - Generates items for container based on categories
 * - Format: Food,Weapon,Potion (comma-separated categories)
 * - Higher rarity items have lower spawn chances
 *
 * UI is provided by ContainerSystemUI.js, load that plugin after this one.
 *
 * ============================================================================
 *
 * @command openContainer
 * @text Open Container
 * @desc Opens a container at the current event location
 *
 * @command openExtradimensionalContainer
 * @text Open Extradimensional Container
 * @desc Opens the extradimensional container accessible from anywhere
 *
 * @command openCamperContainer
 * @text Open Camper Container
 * @desc Opens the camper container accessible from anywhere
 *
 * @command openCarContainer
 * @text Open Car Container
 * @desc Opens the car container accessible from anywhere
 *
 * @command generateContainerItems
 * @text Generate Container Items
 * @desc Generates items based on categories and rarity
 *
 * @arg category1
 * @text Category 1
 * @type select
 * @option None
 * @value
 * @option Alchemistry
 * @value Alchemistry
 * @option Arctic
 * @value Arctic
 * @option Armor
 * @value Armor
 * @option Armor: Clothes
 * @value Armor: Clothes
 * @option Armor: Robe
 * @value Armor: Robe
 * @option Armor: Light Armor
 * @value Armor: Light Armor
 * @option Armor: Heavy Armor
 * @value Armor: Heavy Armor
 * @option Armor: Equipment
 * @value Armor: Equipment
 * @option Armor: Shield
 * @value Armor: Shield
 * @option Artisan
 * @value Artisan
 * @option BodyPart
 * @value BodyPart
 * @option Books
 * @value Books
 * @option Collectibles
 * @value Collectibles
 * @option Combat
 * @value Combat
 * @option Component
 * @value Component
 * @option Counterfeits
 * @value Counterfeits
 * @option Crafting
 * @value Crafting
 * @option Espionage
 * @value Espionage
 * @option Farming
 * @value Farming
 * @option Food
 * @value Food
 * @option Homeopathy
 * @value Homeopathy
 * @option Jungle
 * @value Jungle
 * @option Lifestyle
 * @value Lifestyle
 * @option Magic
 * @value Magic
 * @option Medical
 * @value Medical
 * @option Misc
 * @value Misc
 * @option Monsters
 * @value Monsters
 * @option Plants
 * @value Plants
 * @option Survival
 * @value Survival
 * @option Tools
 * @value Tools
 * @option Trash
 * @value Trash
 * @option Weapons
 * @value Weapons
 * @default Food
 *
 * @arg category2
 * @text Category 2
 * @type select
 * @option None
 * @value
 * @option Alchemistry
 * @value Alchemistry
 * @option Arctic
 * @value Arctic
 * @option Armor
 * @value Armor
 * @option Armor: Clothes
 * @value Armor: Clothes
 * @option Armor: Robe
 * @value Armor: Robe
 * @option Armor: Light Armor
 * @value Armor: Light Armor
 * @option Armor: Heavy Armor
 * @value Armor: Heavy Armor
 * @option Armor: Equipment
 * @value Armor: Equipment
 * @option Armor: Shield
 * @value Armor: Shield
 * @option Artisan
 * @value Artisan
 * @option BodyPart
 * @value BodyPart
 * @option Books
 * @value Books
 * @option Collectibles
 * @value Collectibles
 * @option Combat
 * @value Combat
 * @option Component
 * @value Component
 * @option Counterfeits
 * @value Counterfeits
 * @option Crafting
 * @value Crafting
 * @option Espionage
 * @value Espionage
 * @option Farming
 * @value Farming
 * @option Food
 * @value Food
 * @option Homeopathy
 * @value Homeopathy
 * @option Jungle
 * @value Jungle
 * @option Lifestyle
 * @value Lifestyle
 * @option Magic
 * @value Magic
 * @option Medical
 * @value Medical
 * @option Misc
 * @value Misc
 * @option Monsters
 * @value Monsters
 * @option Plants
 * @value Plants
 * @option Survival
 * @value Survival
 * @option Tools
 * @value Tools
 * @option Trash
 * @value Trash
 * @option Weapons
 * @value Weapons
 * @default
 *
 * @arg category3
 * @text Category 3
 * @type select
 * @option None
 * @value
 * @option Alchemistry
 * @value Alchemistry
 * @option Arctic
 * @value Arctic
 * @option Armor
 * @value Armor
 * @option Armor: Clothes
 * @value Armor: Clothes
 * @option Armor: Robe
 * @value Armor: Robe
 * @option Armor: Light Armor
 * @value Armor: Light Armor
 * @option Armor: Heavy Armor
 * @value Armor: Heavy Armor
 * @option Armor: Equipment
 * @value Armor: Equipment
 * @option Armor: Shield
 * @value Armor: Shield
 * @option Artisan
 * @value Artisan
 * @option BodyPart
 * @value BodyPart
 * @option Books
 * @value Books
 * @option Collectibles
 * @value Collectibles
 * @option Combat
 * @value Combat
 * @option Component
 * @value Component
 * @option Counterfeits
 * @value Counterfeits
 * @option Crafting
 * @value Crafting
 * @option Espionage
 * @value Espionage
 * @option Farming
 * @value Farming
 * @option Food
 * @value Food
 * @option Homeopathy
 * @value Homeopathy
 * @option Jungle
 * @value Jungle
 * @option Lifestyle
 * @value Lifestyle
 * @option Magic
 * @value Magic
 * @option Medical
 * @value Medical
 * @option Misc
 * @value Misc
 * @option Monsters
 * @value Monsters
 * @option Plants
 * @value Plants
 * @option Survival
 * @value Survival
 * @option Tools
 * @value Tools
 * @option Trash
 * @value Trash
 * @option Weapons
 * @value Weapons
 * @default
 *
 * @arg itemCount
 * @text Max Items
 * @desc Maximum number of items to generate (actual count is random 0–max). Set to 0 for a permanently empty container.
 * @type number
 * @min 0
 * @max 20
 * @default 3
 *
 */

(() => {
    'use strict';

    const pluginName = 'ContainerSystem';

    //=============================================================================
    // Translation
    //=============================================================================



    function getText(key) {
        const full = 'Container.' + key;
        return T.has(full) ? T(full) : key;
    }

    window.getContainerText = getText;

    //=============================================================================
    // Rarity configuration
    //=============================================================================

    // i18n-ignore-start: tier ids, keyed into RARITY_DISPLAY_COLORS and the drop
    // tables; the visible word comes from Container.<tier.toLowerCase()>
    let RARITY_TIERS = [
        { name: "Common",    colorCode: "#FFFFFF",  minPrice: 0,       maxPrice: 999,      weight: 50 },
        { name: "Uncommon",  colorCode: "#1AFF1A",  minPrice: 1000,    maxPrice: 9999,     weight: 30 },
        { name: "Rare",      colorCode: "#0080FF",  minPrice: 10000,   maxPrice: 99999,    weight: 15 },
        { name: "Epic",      colorCode: "#8000FF",  minPrice: 100000,  maxPrice: 999999,   weight: 4  },
        { name: "Legendary", colorCode: "#FF8000",  minPrice: 1000000, maxPrice: Infinity, weight: 1  }
    ];
    // i18n-ignore-end

    // i18n-ignore-start: keyed by the tier id
    // The one rarity ladder, read from the presets. This used to be a third
    // private copy of it, in a third set of hues.
    const RARITY_DISPLAY_COLORS = {
        "Common":    "var(--rarity-common)",
        "Uncommon":  "var(--rarity-uncommon)",
        "Rare":      "var(--rarity-rare)",
        "Epic":      "var(--rarity-epic)",
        "Legendary": "var(--rarity-legendary)"
    };
    // i18n-ignore-end

    window.RARITY_DISPLAY_COLORS = RARITY_DISPLAY_COLORS;

    fetch('js/db/Items/Rarity.json')
        .then(response => response.json())
        .then(data => { RARITY_TIERS = data; })
        .catch(() => {});

    //=============================================================================
    // ItemUtils
    //=============================================================================

    class ItemUtils {
        // Section-header / divider entries (e.g. "<-- Food -->") and nameless
        // placeholder rows exist in the database purely to group shop lists.
        // They must never be generated, stored, listed or selected anywhere.
        static isSelectableItem(item) {
            if (!item) return false;
            const name = (item.name || '').trim();
            if (name === '') return false;
            if (/^<--.*-->$/.test(name)) return false;
            // A sealed vial of a live pathogen is contraband somebody bottled
            // on purpose. It is never what is at the bottom of a crate.
            if (item.note && /<category:\s*Diseases\s*>/i.test(item.note)) return false;
            // A <Restricted> row is granted by the one system that owns it and
            // is never found in a container either.
            if (window.ItemSystemUtils && window.ItemSystemUtils.isRestrictedEntry(item)) return false;
            return true;
        }

        static getItemCategory(item) {
            if (!item || !item.note) return null;
            const match = item.note.match(/<category:\s*([^>]+)>/i);
            return match ? match[1].trim() : null;
        }

        static getItemRarity(item) {
            if (!item) return RARITY_TIERS[0];
            const price = item.price || 0;
            return RARITY_TIERS.find(tier =>
                price >= tier.minPrice &&
                (tier.maxPrice === null || tier.maxPrice === undefined || price <= tier.maxPrice)
            ) || RARITY_TIERS[0];
        }

        static getItemDisplayColor(item) {
            const rarity = this.getItemRarity(item);
            return RARITY_DISPLAY_COLORS[rarity.name] || "var(--rarity-common)";
        }

        // Which database a given data object belongs to.
        static getDataKind(obj) {
            if (!obj) return null;
            if (DataManager.isWeapon(obj)) return 'weapon';
            if (DataManager.isArmor(obj))  return 'armor';
            return 'item';
        }

        // Container storage keys. Items keep their bare numeric id so existing
        // saves stay valid; weapons/armors get a type prefix because their ids
        // overlap with item ids.
        static encodeKey(obj) {
            const kind = this.getDataKind(obj);
            if (kind === 'weapon') return 'w' + obj.id;
            if (kind === 'armor')  return 'a' + obj.id;
            return String(obj.id);
        }

        static decodeKey(key) {
            key = String(key);
            if (key[0] === 'w') return $dataWeapons[parseInt(key.slice(1), 10)];
            if (key[0] === 'a') return $dataArmors[parseInt(key.slice(1), 10)];
            return $dataItems[parseInt(key, 10)];
        }

        static getItemsByCategory(category) {
            // Virtual categories pull every selectable weapon / armor regardless
            // of note tags, so a container can be filled purely with gear.
            if (category === 'Weapons') { // i18n-ignore: virtual category id
                const out = [];
                for (let i = 1; i < $dataWeapons.length; i++) {
                    const w = $dataWeapons[i];
                    if (w && this.isSelectableItem(w)) out.push(w);
                }
                return out;
            }
            if (category === 'Armor') { // i18n-ignore: virtual category id
                const out = [];
                for (let i = 1; i < $dataArmors.length; i++) {
                    const a = $dataArmors[i];
                    if (a && this.isSelectableItem(a)) out.push(a);
                }
                return out;
            }
            // Armor sub-type, e.g. "Armor: Heavy Armor" filters by armor type.
            if (category.indexOf('Armor: ') === 0) {
                const typeName = category.slice(7);
                const atypeId  = ($dataSystem.armorTypes || []).indexOf(typeName);
                const out = [];
                if (atypeId > 0) {
                    for (let i = 1; i < $dataArmors.length; i++) {
                        const a = $dataArmors[i];
                        if (a && this.isSelectableItem(a) && a.atypeId === atypeId) out.push(a);
                    }
                }
                return out;
            }
            // Named categories scan items, weapons and armors for the note tag.
            const out = [];
            const scan = (list) => {
                for (let i = 1; i < list.length; i++) {
                    const obj = list[i];
                    if (obj && this.isSelectableItem(obj) && this.getItemCategory(obj) === category) out.push(obj);
                }
            };
            scan($dataItems);
            scan($dataWeapons);
            scan($dataArmors);
            return out;
        }

        static generateRandomQuantity(rarity) {
            const rand = Math.random();
            // i18n-ignore-start: tier ids, see RARITY_TIERS
            switch (rarity.name) {
                case "Common":    return rand < 0.55 ? 1 : rand < 0.90 ? 2 : 3;
                case "Uncommon":  return rand < 0.60 ? 1 : rand < 0.93 ? 2 : 3;
                case "Rare":      return rand < 0.65 ? 1 : rand < 0.95 ? 2 : 3;
                case "Epic":      return rand < 0.75 ? 1 : rand < 0.97 ? 2 : 3;
                case "Legendary": return rand < 0.80 ? 1 : rand < 0.98 ? 2 : 3;
                default:          return 1;
            }
            // i18n-ignore-end
        }

        // weightedPool: array of { item, weight } where weight is the effective spawn weight
        static selectItemsByRarity(weightedPool, count) {
            if (weightedPool.length === 0) return [];
            const selected    = [];
            const maxAttempts = count * 10;
            let attempts      = 0;
            const totalWeight = weightedPool.reduce((s, e) => s + e.weight, 0);

            while (selected.length < count && attempts < maxAttempts) {
                attempts++;
                let rand = Math.random() * totalWeight;
                let pick = null;
                for (const entry of weightedPool) {
                    rand -= entry.weight;
                    if (rand <= 0) { pick = entry.item; break; }
                }

                // The item database carries a few literal duplicates (same name,
                // different id, e.g. two "Meta Magic Grimoire" rows) so identity
                // alone is not enough: dedupe by name too, or a container can
                // roll both rows and show the same item twice.
                if (pick && !selected.find(s => s.item === pick || s.item.name === pick.name)) {
                    const rarity = this.getItemRarity(pick);
                    selected.push({ item: pick, quantity: this.generateRandomQuantity(rarity), rarity });
                }
            }
            return selected;
        }
    }

    window.ItemUtils = ItemUtils;

    //=============================================================================
    // ContainerManager
    //=============================================================================

    // Reused interior maps (procedural houses, multi-floor buildings, treasure
    // rooms) share a single map id across many physical world locations. Without
    // a discriminator every copy of interior map 656 would draw from the same
    // `656_<eventId>` container storage, so looting a chest in one house would
    // empty the "same" chest in every other reuse of that template. Whichever
    // plugin owns the current interior supplies a per-instance key (derived from
    // the entrance map+tile, plus floor for multi-floor buildings) so each
    // physical location keeps independent loot. Ordinary maps return '' here,
    // leaving their container ids (and existing saves) untouched.
    function getInteriorInstanceKey() {
        const H = window.ProceduralHouseSystem;
        if (H && typeof H.getContainerInstanceKey === 'function') {
            const k = H.getContainerInstanceKey();
            if (k) return 'H' + k;
        }
        const T = window.TreasureRoomSystem;
        if (T && typeof T.getContainerInstanceKey === 'function') {
            const k = T.getContainerInstanceKey();
            if (k) return 'T' + k;
        }
        return '';
    }

    //=============================================================================
    // Theft: emptying somebody else's cupboards
    //=============================================================================
    // A procedural building belongs to whoever lives there until the player buys
    // the floor (ProceduralHouseSystem's ownership keys). Carrying something out
    // of a building the player does not own is a theft, so every retrieval is
    // filed as its own charge, priced on what was taken. Storing things is never
    // a crime, and the extradimensional / vehicle containers are the player's own.

    // Tier thresholds are the total shop value of the goods in one grab (gold).
    const THEFT_TIERS = [
        { maxValue: 1000,     key: 'pettyTheft', base: 50   },
        { maxValue: 10000,    key: 'burglary',   base: 500  },
        { maxValue: Infinity, key: 'grandTheft', base: 2000 }
    ];
    const THEFT_VALUE_SHARE = 0.1; // of the goods' shop value, on top of the base

    function isStolenContainer(containerId, isExtradimensional) {
        if (isExtradimensional || !containerId) return false;
        if (String(containerId).indexOf('vehicle_') === 0) return false;
        const H = window.ProceduralHouseSystem;
        if (!H || typeof H.isInsideHouse !== 'function') return false;
        return H.isInsideHouse() && !H.isCurrentFloorOwned();
    }

    function theftTier(value) {
        return THEFT_TIERS.find(t => value < t.maxValue) || THEFT_TIERS[THEFT_TIERS.length - 1];
    }

    // CrimeSystem only pops its own notification on the map, and a container is
    // looted from Scene_Container, so the charge would land silently. Repeat its
    // toast here for exactly the scenes it skips.
    function showTheftToast(crimeName, bounty) {
        if (!(bounty > 0) || !window.ParchmentToast) return;
        if (SceneManager._scene instanceof Scene_Map) return;
        const C = window.CrimeSystem;
        const amount = C && C.goldToEuros ? C.goldToEuros(bounty) : String(bounty);
        window.ParchmentToast.show(
            `<div class="crime-notif-row">` +
                `<span class="crime-notif-name">${crimeName}</span>` +
                `<span class="crime-notif-bounty">${amount}</span>` +
            `</div>`,
            { severity: 'danger', duration: 180, html: true, key: `theft:${crimeName}:${Date.now()}` }
        );
    }

    function reportContainerTheft(containerId, item, amount, isExtradimensional) {
        if (!item || !(amount > 0)) return;
        if (!isStolenContainer(containerId, isExtradimensional)) return;
        const C = window.CrimeSystem;
        if (!C || typeof C.addCrime !== 'function') return;

        const value  = Math.max(0, (item.price || 0) * amount);
        const tier   = theftTier(value);
        const bounty = tier.base + Math.round(value * THEFT_VALUE_SHARE);
        const goods  = amount > 1
            ? T('Container.theft.stack', { item: item.name, count: amount })
            : item.name;
        const name   = T('Container.theft.charge', { crime: getText('theft.' + tier.key), item: goods });

        // addCrime returns nothing and may discount or void the bounty (sandbox,
        // Eris immunity, Streetwise), so read what actually landed on the record.
        const before = C.getTotalBounty ? C.getTotalBounty() : 0;
        C.addCrime(name, bounty, tier.key);
        const filed = (C.getTotalBounty ? C.getTotalBounty() : 0) - before;
        showTheftToast(name, filed);
    }

    //=============================================================================
    // Where a container's contents live
    //=============================================================================
    // A chest standing in the world belongs to the WORLD, not to the party that
    // opened it: emptying a cupboard in one savegame must leave it empty for
    // every other savegame of the same world, and anything left inside one
    // (artifacts included) has to be there for whoever walks in next. Those
    // containers therefore live in save/worlds/<name>/containers.json.
    //
    // The party's own bags are the exception. The extradimensional container and
    // the camper / car holds travel WITH a party rather than sitting somewhere on
    // the map, so they stay in the binary savegame where the rest of the party's
    // inventory is.
    const WORLD_FILE = 'containers'; // i18n-ignore: world data file key

    function worldStore() {
        const W = window.WorldManager;
        if (!W || typeof W.getFile !== 'function') return null;
        // Never cache the object: setActiveWorld drops the whole file cache, so
        // a held reference would go on writing into a world nobody is playing.
        const store = W.getFile(WORLD_FILE);
        if (!store.containers) store.containers = {};
        if (!store.stocked)    store.stocked    = {};
        return store;
    }

    // Writing every world file costs more than one item transfer is worth, so
    // the flush is coalesced: the player empties a chest, and a moment after the
    // last card moves the world folder catches up. A savegame write flushes on
    // its own (DataManager), so nothing is ever left only in memory.
    const WORLD_FLUSH_DELAY = 1000;
    let flushTimer = null;

    function requestWorldFlush() {
        const W = window.WorldManager;
        if (!W || typeof W.flush !== 'function' || flushTimer) return;
        flushTimer = setTimeout(() => {
            flushTimer = null;
            try { W.flush(); } catch (e) { /* non-fatal */ }
        }, WORLD_FLUSH_DELAY);
    }

    class ContainerManager {
        static initialize() {
            this._privateContainers = {};
            this._privateStocked = {};
            this._extradimensionalContainer = {};
            this.load();
        }

        // True for a container that stands somewhere in the world. The vehicle
        // holds are the party's; the extradimensional container never reaches
        // here at all (it is addressed by flag, not by id).
        static isWorldContainer(containerId) {
            if (!containerId) return false;
            return String(containerId).indexOf('vehicle_') !== 0;
        }

        // The two ledgers a given container id is filed in: what it holds, and
        // whether it has been stocked. Both answer from the world folder for a
        // world container and from the savegame for a party bag, falling back to
        // the savegame when no world is active (sandbox / playtest).
        static _bag(containerId) {
            if (this.isWorldContainer(containerId)) {
                const store = worldStore();
                if (store) return store.containers;
            }
            return this._privateContainers;
        }

        static _ledger(containerId) {
            if (this.isWorldContainer(containerId)) {
                const store = worldStore();
                if (store) return store.stocked;
            }
            return this._privateStocked;
        }

        static getContainerId(mapId, eventId) {
            const instance = getInteriorInstanceKey();
            return instance ? `${instance}:${mapId}_${eventId}` : `${mapId}_${eventId}`;
        }

        static getContainer(containerId) {
            const bag = this._bag(containerId);
            if (!bag[containerId]) bag[containerId] = {};
            return bag[containerId];
        }

        static getExtradimensionalContainer() {
            return this._extradimensionalContainer;
        }

        // cat1 = common slot (weight ×1.0), cat2 = rare slot (×0.2), cat3 = very rare slot (×0.04)
        static generateContainerItems(containerId, cat1, cat2, cat3, maxItemCount) {
            // A container is stocked exactly once. Emptiness alone cannot decide
            // this: a container the player has looted is empty again, and since
            // generation is seeded off the container id it would be refilled
            // with the very same items on every later call, forever.
            if (this.isStocked(containerId)) return;
            if (!this.isContainerEmpty(containerId)) { this.markStocked(containerId); return; }
            // maxItemCount === 0 is the documented "permanently empty" setting.
            // For any configured container (max >= 1) roll 1..max instead of
            // 0..max, so a valid category never deterministically produces an
            // empty container just because its seed happened to roll a 0.
            if (maxItemCount <= 0) return;
            const actualCount = Math.floor(Math.random() * maxItemCount) + 1;
            const container   = this.getContainer(containerId);
            const slotWeights = [1.0, 0.2, 0.04];
            const pool        = [];
            for (let i = 0; i < 3; i++) {
                const cat = [cat1, cat2, cat3][i];
                if (!cat) continue;
                for (const item of ItemUtils.getItemsByCategory(cat)) {
                    const rarity = ItemUtils.getItemRarity(item);
                    // Inside a patron's treasure room the tiers are re-weighted
                    // toward the expensive end (PatreonRewards).
                    const tierBoost = (window.PatreonRewards && typeof window.PatreonRewards.containerTierWeight === 'function')
                        ? window.PatreonRewards.containerTierWeight(RARITY_TIERS.indexOf(rarity)) : 1;
                    pool.push({ item, weight: rarity.weight * slotWeights[i] * tierBoost });
                }
            }
            if (pool.length === 0) return;
            const selected = ItemUtils.selectItemsByRarity(pool, actualCount);
            for (const s of selected) container[ItemUtils.encodeKey(s.item)] = s.quantity;
            this._ledger(containerId)[containerId] = true;
            this.save();
        }

        static isStocked(containerId) {
            return !!this._ledger(containerId)[containerId];
        }

        static markStocked(containerId) {
            const ledger = this._ledger(containerId);
            if (ledger[containerId]) return;
            ledger[containerId] = true;
            this.save();
        }

        static isContainerEmpty(containerId) {
            const container = this._bag(containerId)[containerId];
            if (!container) return true;
            for (const itemId in container) { if (container[itemId] > 0) return false; }
            return true;
        }

        static addItem(containerId, itemId, amount, isExtradimensional = false) {
            const container = isExtradimensional ? this._extradimensionalContainer : this.getContainer(containerId);
            const key = itemId.toString();
            if (!container[key]) container[key] = 0;
            container[key] += amount;
            this.save();
        }

        static removeItem(containerId, itemId, amount, isExtradimensional = false) {
            const container = isExtradimensional ? this._extradimensionalContainer : this.getContainer(containerId);
            const key = itemId.toString();
            if (container[key]) {
                container[key] -= amount;
                if (container[key] <= 0) delete container[key];
                this.save();
            }
        }

        // True while the container's contents belong to somebody else, so a UI
        // can warn before the player helps themselves.
        static isStolenGoods(containerId, isExtradimensional = false) {
            return isStolenContainer(containerId, isExtradimensional);
        }

        // Files one charge for the items just carried out of an unowned building.
        // A no-op everywhere else, so retrieval paths can call it unconditionally.
        static reportTheft(containerId, item, amount, isExtradimensional = false) {
            reportContainerTheft(containerId, item, amount, isExtradimensional);
        }

        static getItemAmount(containerId, itemId, isExtradimensional = false) {
            const container = isExtradimensional ? this._extradimensionalContainer : this.getContainer(containerId);
            return container[itemId.toString()] || 0;
        }

        static pregenerateMapContainers(mapId) {
            if (!$dataMap || !$dataMap.events || !$gameSelfSwitches) return;

            for (const eventData of $dataMap.events) {
                if (!eventData || !eventData.pages) continue;

                let genArgs = null;
                for (const page of eventData.pages) {
                    if (!page || !page.list) continue;
                    const cmd = page.list.find(c =>
                        c.code === 357 &&
                        c.parameters[0] === 'ContainerSystem' &&
                        c.parameters[1] === 'generateContainerItems'
                    );
                    if (cmd) { genArgs = cmd.parameters[3] || {}; break; }
                }
                if (!genArgs) continue;

                const containerId = ContainerManager.getContainerId(mapId, eventData.id);
                generateSeededContainer(containerId, genArgs);

                const empty = ContainerManager.isContainerEmpty(containerId);
                $gameSelfSwitches.setValue([mapId, eventData.id, 'A'], empty);
            }
        }

        // The world containers are already written straight into the world
        // file's own objects, so saving is only the party's bags plus a request
        // to put the world folder on disk.
        static save() {
            $gameSystem._containerData = {
                containers:        this._privateContainers,
                extradimensional:  this._extradimensionalContainer,
                stocked:           this._privateStocked
            };
            requestWorldFlush();
        }

        static load() {
            this._privateContainers = {};
            this._privateStocked = {};
            this._extradimensionalContainer = {};
            const data = $gameSystem._containerData;
            if (!data) return;

            this._extradimensionalContainer = data.extradimensional || {};
            const containers = data.containers || {};
            // Saves made before containers were stocked-once carry no ledger:
            // treat everything they already hold as stocked, so old chests keep
            // their contents instead of rolling a fresh set.
            const stocked = data.stocked ||
                Object.keys(containers).reduce((acc, id) => { acc[id] = true; return acc; }, {});

            // Everything a savegame made before this was world-shared is still
            // filed in the binary save, world containers included. Hand those
            // over to the world folder on the way in; the party's bags stay.
            const store = worldStore();
            const ids = new Set(Object.keys(containers).concat(Object.keys(stocked)));
            for (const id of ids) {
                if (store && this.isWorldContainer(id)) {
                    // The world's own record always wins: a chest this world has
                    // already dealt (or already had emptied) must never be
                    // refilled from some other savegame's older copy of it.
                    if (store.stocked[id] || store.containers[id]) continue;
                    if (containers[id]) store.containers[id] = containers[id];
                    if (stocked[id])    store.stocked[id]    = true;
                } else {
                    if (containers[id]) this._privateContainers[id] = containers[id];
                    if (stocked[id])    this._privateStocked[id]    = true;
                }
            }
            if (store) requestWorldFlush();
        }
    }

    window.ContainerManager = ContainerManager;

    //=============================================================================
    // Generation argument parsing + seeded generation helper
    //=============================================================================

    // Two authoring conventions exist in the project:
    //   - Common events pass a single comma-separated "categories" arg
    //     (e.g. {categories:"Trash", itemCount:"6"}).
    //   - Map events using the plugin's declared arg schema pass
    //     category1 / category2 / category3.
    // Accept both so a container fills no matter how it was wired.
    function parseGenArgs(genArgs) {
        genArgs = genArgs || {};
        let cats;
        if (genArgs.categories != null && String(genArgs.categories).trim() !== '') {
            cats = String(genArgs.categories).split(',').map(s => s.trim()).filter(Boolean);
        } else {
            cats = [genArgs.category1, genArgs.category2, genArgs.category3];
        }
        const _max = parseInt(genArgs.itemCount);
        return {
            cat1:     cats[0] || '',
            cat2:     cats[1] || '',
            cat3:     cats[2] || '',
            maxItems: isNaN(_max) ? 3 : _max
        };
    }

    // Generate a container's contents deterministically from the world history
    // seed, so the same container always yields the same loot for a given save.
    function generateSeededContainer(containerId, genArgs) {
        const historySeed = ($gameSystem && $gameSystem._historySeed) || 19002001;
        const { cat1, cat2, cat3, maxItems } = parseGenArgs(genArgs);
        const rng = makeSeededRNG(hashContainerSeed(historySeed, containerId));
        const origRandom = Math.random;
        Math.random = rng;
        try {
            ContainerManager.generateContainerItems(containerId, cat1, cat2, cat3, maxItems);
        } finally {
            Math.random = origRandom;
        }
    }

    //=============================================================================
    // Plugin Commands
    // Scene classes are provided by ContainerSystemUI.js
    //=============================================================================

    PluginManager.registerCommand(pluginName, 'openContainer', () => {
        const mapId     = $gameMap.mapId();
        const eventId   = $gameMap._interpreter.eventId();
        const containerId = ContainerManager.getContainerId(mapId, eventId);
        SceneManager.push(Scene_Container);
        SceneManager.prepareNextScene(containerId, false);
    });

    PluginManager.registerCommand(pluginName, 'openExtradimensionalContainer', () => {
        SceneManager.push(Scene_Container);
        SceneManager.prepareNextScene(null, true);
    });

    // Vehicle storage is its own persistent container (separate from the
    // infinite extradimensional one) and capped by a realistic payload weight.
    // Limits are in grams. A camper's living space holds far more than a car trunk.
    const CAMPER_WEIGHT_LIMIT = 350000; // 350 kg
    const CAR_WEIGHT_LIMIT    = 75000;  // 75 kg

    PluginManager.registerCommand(pluginName, 'openCamperContainer', () => {
        SceneManager.push(Scene_Container);
        SceneManager.prepareNextScene('vehicle_camper', false, CAMPER_WEIGHT_LIMIT);
    });

    PluginManager.registerCommand(pluginName, 'openCarContainer', () => {
        SceneManager.push(Scene_Container);
        SceneManager.prepareNextScene('vehicle_car', false, CAR_WEIGHT_LIMIT);
    });

    // Populate the container for the current event, then no-op on subsequent
    // calls (generateContainerItems bails when the container is non-empty).
    // Most containers are wired as: generateContainerItems -> openContainer
    // inside a common event, so this MUST run at runtime. Map events that embed
    // the command directly are also handled ahead of time by
    // pregenerateMapContainers; both paths are idempotent.
    PluginManager.registerCommand(pluginName, 'generateContainerItems', function (args) {
        const mapId       = $gameMap.mapId();
        const eventId     = $gameMap._interpreter ? $gameMap._interpreter.eventId() : 0;
        const containerId = ContainerManager.getContainerId(mapId, eventId);
        generateSeededContainer(containerId, args);
    });

    //=============================================================================
    // DataManager hooks
    //=============================================================================

    //=============================================================================
    // Seeded RNG helpers (mulberry32)
    //=============================================================================

    function makeSeededRNG(seed) {
        let s = seed >>> 0;
        return function () {
            s = (s + 0x6D2B79F5) >>> 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function hashContainerSeed(base, containerId) {
        let h = base >>> 0;
        for (let i = 0; i < containerId.length; i++) {
            h = Math.imul(h ^ containerId.charCodeAt(i), 0x9e3779b9) >>> 0;
            h = ((h << 13) | (h >>> 19)) >>> 0;
        }
        return h;
    }

    //=============================================================================
    // Map entry pre-generation hook
    //=============================================================================

    const _Game_Map_setup = Game_Map.prototype.setup;
    Game_Map.prototype.setup = function (mapId) {
        _Game_Map_setup.call(this, mapId);
        ContainerManager.pregenerateMapContainers(mapId);
    };

    //=============================================================================
    // DataManager hooks
    //=============================================================================

    const _DataManager_createGameObjects = DataManager.createGameObjects;
    DataManager.createGameObjects = function () {
        _DataManager_createGameObjects.call(this);
        ContainerManager.initialize();
    };

    const _DataManager_makeSaveContents = DataManager.makeSaveContents;
    DataManager.makeSaveContents = function () {
        const contents = _DataManager_makeSaveContents.call(this);
        ContainerManager.save();
        return contents;
    };

    const _DataManager_extractSaveContents = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function (contents) {
        _DataManager_extractSaveContents.call(this, contents);
        ContainerManager.load();
    };

})();
