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
 * Formula: (Party Median Level, met halfway by the local difficulty)
 *           + (current Omega Tower floor x 1.25)
 * * 1. Party Median Level:
 * As your party levels up, loot automatically improves.
 * * 2. Local difficulty (nation / biome spawn band on the procedural map):
 * Hard ground pays better, but only up to the party's own level plus 15:
 * a level 1 party in a level 60 country finds that country's crates, not
 * its legends.
 * * 3. Omega Tower floor:
 * The floor the party is standing on RIGHT NOW, up or down the shaft, and
 * it outweighs the party's own level. Not how deep they have ever been:
 * leaving the tower or dying puts it back to 0 on its own.
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

    // Which floor of the Omega Tower the party is standing on RIGHT NOW,
    // counted in floors away from the ground. How deep they have ever been is
    // not the question: a crate on floor 5 pays like floor 5 even to a party
    // that has seen floor 90, and the count answers 0 the moment they are off
    // the tower, so dying or walking out of it resets the skew by itself. The
    // shaft runs both ways from the ground and the two halves count the same,
    // so floor -60 is as deep as floor 60 is high.
    function getCurrentTowerFloor() {
        const DF = window.DungeonFloors;
        if (DF) {
            if (typeof DF.currentFloor === 'function') {
                const lower = Math.abs(DF.currentFloor() || 0);
                if (lower > 0) return lower;
            }
            if (typeof DF.currentAuthoredFloor === 'function') {
                const upper = Math.abs(DF.currentAuthoredFloor() || 0);
                if (upper > 0) return upper;
            }
        }
        // Without the floor system the upper tower's own floor variable is the
        // only answer left, and it only counts while the party is on a floor.
        if (typeof $gameVariables !== 'undefined' && $gameVariables &&
                DF && typeof DF.isDungeonMap === 'function' && DF.isDungeonMap()) {
            return Math.abs($gameVariables.value(MAX_FLOOR_VARIABLE_ID) || 0);
        }
        return 0;
    }

    // The tower is the one place that outweighs the party carrying the crate:
    // a level 1 party on floor 60 is paid by the floor, not by its own level.
    // Each floor is worth slightly more than a level of the party's own, which
    // is what makes the climb the thing that decides the reward.
    const TOWER_FLOOR_WEIGHT = 1.25;

    // ...but the influence is clamped at 100, and a party of any weight reaches
    // that clamp around floor 40. Everything under it used to pay exactly the
    // same, so the deepest half of the shaft - the half whose enemies are still
    // climbing - was the half with no reward gradient at all. Past DEEP_FLOOR
    // the depth therefore stops pushing the influence (it has nowhere left to
    // push) and starts opening the tier ladder itself instead, which the clamp
    // cannot flatten: the lift grows from RARITY_LIFT at DEEP_FLOOR to
    // RARITY_LIFT + DEEP_TOWER_LIFT at the bottom of the tower.
    const DEEP_FLOOR = 40;       // where the influence has already saturated
    const DEEP_TOWER_FLOOR = 91; // the deepest floor that holds anything
    const DEEP_TOWER_LIFT = 0.3; // how much further the ladder opens down there

    // The extra tier lift the floor underfoot is worth, 0 anywhere above
    // DEEP_FLOOR and at its full value on the last floor of the shaft.
    function towerDepthLift() {
        const floor = getCurrentTowerFloor();
        if (floor <= DEEP_FLOOR) return 0;
        const span = DEEP_TOWER_FLOOR - DEEP_FLOOR;
        const t = Math.max(0, Math.min(1, (floor - DEEP_FLOOR) / span));
        return DEEP_TOWER_LIFT * t;
    }

    // Which world the floor underfoot opens onto, and what its crates lean
    // towards (DungeonFloorSystem.js, window.TowerWorlds). A floor of the
    // Omega Tower is not a cellar under Italy: a machine world's crates are
    // full of components and pay better, a ruined one's hold junk and pay
    // worse. Null everywhere else, so every other call site is unchanged.
    function towerWorldLoot() {
        const TW = window.TowerWorlds;
        if (!TW || typeof TW.lootProfile !== 'function') return null;
        try { return TW.lootProfile(); } catch (e) { return null; }
    }

    // How hard a world leans. A favoured shelf is drawn from several times
    // more often and a shunned one several times less, which is a lean and
    // not a law: no world can empty its own pool, because nothing is ever
    // filtered OUT, only weighted.
    const WORLD_FAVOUR_WEIGHT = 4;
    const WORLD_SHUN_WEIGHT = 0.25;

    function worldCategoryFactor(item, profile) {
        if (!profile || !item || !item.note) return 1;
        const note = item.note;
        const holds = (list) => list.some((cat) =>
            new RegExp('<category:\\s*' + cat + '\\s*>', 'i').test(note));
        if (profile.favour && profile.favour.length && holds(profile.favour)) return WORLD_FAVOUR_WEIGHT;
        if (profile.shun && profile.shun.length && holds(profile.shun)) return WORLD_SHUN_WEIGHT;
        return 1;
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

    // How far above its own level a party may be paid by the ground it stands
    // on. Beyond this the area's difficulty stops counting: the reward is the
    // party's, not the map's.
    const AREA_LEVEL_MARGIN = 15;

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
    //
    // The ladder in Rarity.json (50 / 30 / 15 / 4 / 1) is the shape of every
    // roll: a rarer tier is always rarer than the one under it, at every level
    // and in every country. Influence does not reorder that ladder, it only
    // flattens it - each step up the tiers is multiplied by RARITY_LIFT at full
    // influence, so an Epic that is 4 against 50 in a starting country is 32
    // against 50 at the top of the world: reachable, never the usual find.
    //
    // The old curve crossed over instead: past an influence of 50 it weighted
    // Legendary ABOVE Common, and since a country's window feeds the influence
    // the moment the party stood in a middling nation the crates started paying
    // in purple. One bracket must never be able to invert the ladder.
    const RARITY_LIFT = 2.0;   // how much a tier step opens up at full influence

    // The ladder weight of a tier, from Rarity.json where it says so and from
    // the same geometric fall where a modded table leaves it out.
    function tierBaseWeight(tierIndex) {
        const declared = Number((RARITY_TIERS[tierIndex] || {}).weight);
        if (Number.isFinite(declared) && declared > 0) return declared;
        return 50 * Math.pow(0.35, tierIndex);
    }

    function calculateItemWeight(itemPrice, rarityInfluence, extraLift) {
        // Determine which tier this item belongs to
        let tierIndex = 0;
        for (let i = 0; i < RARITY_TIERS.length; i++) {
            if (itemPrice >= RARITY_TIERS[i].minPrice && (RARITY_TIERS[i].maxPrice === null || RARITY_TIERS[i].maxPrice === undefined || itemPrice <= RARITY_TIERS[i].maxPrice)) {
                tierIndex = i;
                break;
            }
        }

        // Normalize influence to 0-1 range
        const influence = Math.max(0, Math.min(1, rarityInfluence / 100));

        const ceiling = RARITY_LIFT + (extraLift || 0);
        const lift = Math.pow(1 + (ceiling - 1) * influence, tierIndex);
        return Math.max(1, tierBaseWeight(tierIndex) * lift * 20);
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
        const towerFloor = Math.round(getCurrentTowerFloor() * TOWER_FLOOR_WEIGHT);
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
        // On the procedural map the encounter level is set by the nation (or
        // biome when no nation rules the square), not the party level. The spawn
        // band center is the same value the atlas prints and the encounter engine
        // uses, so loot in a hard country is hard-country loot regardless of
        // how strong the party is. The party level still acts as a floor: loot
        // is never worse than party level would give.
        let baseLootLevel = levelBracket * 10;
        if (onProcMap && window.BSE && window.BSE.Helpers &&
                typeof window.BSE.Helpers.getSpawnBand === 'function') {
            try {
                const band = window.BSE.Helpers.getSpawnBand();
                let groundLevel = (band && typeof band.center === 'number')
                    ? band.center : null;
                // Under a country it is the MEDIAN of what actually roams there
                // that pays, not the middle of the window it was dealt. The two
                // are not the same number: the window is a promise about the
                // roster and the median is what the roster turned out to hold,
                // and paying on the window handed purple crates to ground that
                // was still fielding its own small fry. The median is also the
                // one number the atlas and the travel book print, so the crate
                // and the card now agree.
                if (band && band.nation &&
                        typeof window.BSE.Helpers.getNationMedianLevel === 'function') {
                    const med = window.BSE.Helpers.getNationMedianLevel(band.nation);
                    if (med > 0) groundLevel = med;
                }
                if (groundLevel !== null) {
                    // The ground can only pay so far above the party carrying
                    // the crate home. A level 1 party that wanders into a level
                    // 60 country finds that country's crates, never its
                    // legends: the ground is first capped at the party's own
                    // level plus AREA_LEVEL_MARGIN, then met halfway, so hard
                    // ground still reads as a step up without handing the top
                    // of the shelf to a party that cannot hold it.
                    const partyLevel = getEffectiveLootLevel();
                    const capped = Math.min(Math.round(groundLevel),
                        partyLevel + AREA_LEVEL_MARGIN);
                    const shared = Math.round((partyLevel + capped) / 2);
                    baseLootLevel = Math.max(baseLootLevel, shared);
                }
            } catch (e) { /* safe fallback to party level */ }
        }
        // The world the floor opens onto pays its own way: a rich world adds
        // to the influence like a good year does, and opens the tier ladder
        // a little further on top, which the clamp cannot flatten.
        const worldLoot = towerWorldLoot();
        const worldBonus = worldLoot ? (worldLoot.rarityBonus || 0) : 0;
        let rarityInfluence = baseLootLevel + towerFloor + lootBonus + appraisal + yearBonus + worldBonus;
        rarityInfluence = Math.max(0, Math.min(100, rarityInfluence));
        // Past the deep floors the clamp above has nothing left to give, so the
        // depth opens the tier ladder itself instead (towerDepthLift).
        const depthLift = towerDepthLift() + (worldLoot ? (worldLoot.lift || 0) : 0);

        // Calculate weighted probability for each item
        let weightedItems = [];
        let totalWeight = 0;
        
        for (let item of validItems) {
            // Skip items with price of 0 (usually key items)
            if (item.price === 0) continue;
            
            // Calculate weight using new algorithm
            let weight = calculateItemWeight(item.price, rarityInfluence, depthLift);

            // A crate of keepsakes is not graded the way a crate of swords is:
            // half the weight is levelled flat across the shelf, so the top of
            // the price range is genuinely reachable at any party level and the
            // spread is wider than any weapon or armour roll.
            if (collectibles) weight = weight * 0.5 + COLLECTIBLE_FLAT_WEIGHT;

            // What the world under the crate actually deals in. A lean, not a
            // law: the shelf it shuns is still on the shelf.
            weight *= worldCategoryFactor(item, worldLoot);

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