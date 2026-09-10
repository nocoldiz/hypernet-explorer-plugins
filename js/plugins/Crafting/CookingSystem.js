/*:
 * @target MZ
 * @plugindesc Implements a cooking system that allows combining two recovery items for enhanced effects.
 * @author Omni-Lex
 * 
 * @param Play Recovery Sound
 * @type boolean
 * @desc Play recovery sound when cooking effect is applied
 * @default true
 * 
 * @param Recovery Sound
 * @type file
 * @dir audio/se/
 * @desc Sound effect to play when cooking effect is applied
 * @default Recovery
 * @parent Play Recovery Sound
 * 
 * @command openCookingMenu
 * @text Open Cooking Menu
 * @desc Opens the cooking menu where players can combine items
 * 
 * @command cookItems
 * @text Cook Items
 * @desc Combines two items from the player's inventory
 * @arg item1Id
 * @type number
 * @text First Item ID
 * @desc ID of the first item to combine
 * @arg item2Id
 * @type number
 * @text Second Item ID
 * @desc ID of the second item to combine
 * 
 * @help 
 * CookingSystem.js
 * 
 * This plugin implements a cooking system that allows players to combine
 * two recovery items (HP or MP) for enhanced effects. The first item's
 * recovery value is doubled, then the second item's recovery is added.
 * 
 * When cooking the same item with itself, a random adjective will be applied
 * with a bonus or penalty to the healing effect.
 * 
 * The cooked item name will be a combination of the first and second item names.
 * If an item has multiple words, it takes the first word of the first item and
 * the last word of the second item.
 * 
 * If two of the same item are used, the name will be "Random Adjective Item"
 * where the adjective determines if there's a bonus or penalty effect.
 * 
 * Plugin Commands:
 * - openCookingMenu: Opens the cooking menu interface
 * - cookItems: Directly combine specified items by their IDs
 * 
 * You can call these commands from event pages using the plugin command feature.
 */

(() => {
    'use strict';

    const pluginName = "CookingSystem";

    //=============================================================================
    // Plugin Parameters
    //=============================================================================
    const parameters = PluginManager.parameters(pluginName);
    const playRecoverySound = parameters['Play Recovery Sound'] === 'true';
    const recoverySoundName = parameters['Recovery Sound'] || 'Recovery';
    const requiredItemIds = [127, 128]; // Replace with your desired item IDs

    // Raw meat and raw plant matter carry no nutrition of their own
    // (category:Crafting, not Food) and are cookable only through their own
    // fixed recipe, or paired with any other food item under their own name.
    const RAW_MEAT_ID = 862;
    const COOKED_MEAT_ID = 447;
    const RAW_VEG_ID = 858;
    const ROASTED_VEG_ID = 499;

    //=============================================================================
    // i18n
    //=============================================================================
    // Copy lives in js/i18n/<lang>/plugins/Cooking.json and is read through the
    // shared resolver, so there is no second loader and no boot race.
    // Resolve a dot-path under the Cooking namespace (e.g. 'ui.cookButton').
    // The shared resolver may not be up yet: a partial plugin load, a mod that
    // breaks DataService, the K hotkey pressed on the very first frame of a
    // loaded game. A kitchen that cannot read its own labels still has to open
    // rather than throw a ReferenceError over a black screen, so every lookup
    // in this file goes through _T instead of the bare global.
    const _T = (key, vars) => (typeof T === 'function' ? T(key, vars) : String(key));
    _T.has = (key) => (typeof T === 'function' && typeof T.has === 'function') ? T.has(key) : false;
    _T.pool = (key) => (typeof T === 'function' && typeof T.pool === 'function') ? T.pool(key) : [];

    const _ci18n = (path, vars) => {
        const key = 'Cooking.' + path;
        return _T.has(key) ? _T(key, vars) : path;
    };


    // Load on boot
    //=============================================================================
    // Plugin Commands
    //=============================================================================
    PluginManager.registerCommand(pluginName, "openCookingMenu", args => {
        SceneManager.push(Scene_Cooking);
    });

    PluginManager.registerCommand(pluginName, "cookItems", args => {
        const item1Id = Number(args && args.item1Id);
        const item2Id = Number(args && args.item2Id);

        const item1 = (typeof $dataItems !== 'undefined' && $dataItems) ? $dataItems[item1Id] : null;
        const item2 = (typeof $dataItems !== 'undefined' && $dataItems) ? $dataItems[item2Id] : null;

        // cookItems does its own stock check now (the same one the menu makes),
        // so a command naming one unit of the same item twice can no longer
        // spend one loaf and eat two.
        if (!CookingSystem.canCook(item1, item2)) {
            console.error("CookingSystem: Invalid items or not enough items in inventory");
            return;
        }
        CookingSystem.cookItems(item1, item2);
    });

    //=============================================================================
    // CookingSystem
    //=============================================================================
    const CookingSystem = {
        _item1: null,
        _item2: null,

        isFoodItem: function (item) {
            if (!item) return false;
            if (item.id === RAW_MEAT_ID || item.id === RAW_VEG_ID) return true;
            return item && item.meta && item.meta.category === "Food";
        },

        // Raw meat and raw plant matter refuse to be cooked with each other;
        // every other pairing (including with themselves) is allowed.
        canPairItems: function (item1, item2) {
            if (!item1 || !item2 || item1 === item2) return true;
            const ids = [item1.id, item2.id];
            return !(ids.includes(RAW_MEAT_ID) && ids.includes(RAW_VEG_ID));
        },

        // The fixed-recipe item raw meat/plant matter becomes when cooked
        // with a second unit of itself, or null for any other pairing.
        fixedRecipeFor: function (item1, item2) {
            if (!item1 || !item2) return null;
            const db = (typeof $dataItems !== 'undefined' && $dataItems) ? $dataItems : [];
            if (item1.id === RAW_MEAT_ID && item2.id === RAW_MEAT_ID) {
                return db[COOKED_MEAT_ID] || null;
            }
            if (item1.id === RAW_VEG_ID && item2.id === RAW_VEG_ID) {
                return db[ROASTED_VEG_ID] || null;
            }
            return null;
        },

        // The one stock check the whole kitchen makes: two real food items, both
        // carried, and two units on hand when the same item is used twice. Every
        // way into cookItems (menu, ASCII, mouse, plugin command) asks this first
        // so none of them can spend an ingredient the party does not have.
        canCook: function (item1, item2) {
            if (!item1 || !item2) return false;
            if (typeof $gameParty === 'undefined' || !$gameParty) return false;
            if (!this.canPairItems(item1, item2)) return false;
            const needed = item1 === item2 ? 2 : 1;
            if ($gameParty.numItems(item1) < needed) return false;
            if (item1 !== item2 && $gameParty.numItems(item2) < 1) return false;
            return true;
        },

        getRecoveryValues: function (item) {
            let hunger = 0;
            let tp = 0;
            let mp = 0;

            if (!item || !item.meta) return { hunger, tp, mp };

            // Extract food stats from meta tags. A tag that is present but not a
            // number (a hand-edited note, a mod's entry) reads 0 rather than
            // poisoning every total downstream with NaN.
            const num = (v) => {
                const n = parseInt(v, 10);
                return Number.isFinite(n) ? n : 0;
            };
            const calories = num(item.meta.calories);
            const protein = num(item.meta.protein);
            const fat = num(item.meta.fat);

            hunger = calories;
            tp = protein;
            mp = fat;

            return { hunger, tp, mp };
        },

        createCookedItemName: function (item1, item2) {
            const tr = (name) => (window.translateText ? window.translateText(name || '') : (name || ''));
            if (!item1 || !item2) return tr((item1 || item2 || {}).name);

            // Raw meat/plant matter cooked in bulk with itself becomes its
            // finished form outright, never the random-adjective roll.
            const fixedRecipe = this.fixedRecipeFor(item1, item2);
            if (fixedRecipe) {
                return tr(fixedRecipe.name);
            }
            // Paired with anything else, raw meat/plant matter names the dish
            // instead of the usual first-word/last-word splice.
            if (item1.id === RAW_MEAT_ID || item2.id === RAW_MEAT_ID) {
                const other = item1.id === RAW_MEAT_ID ? item2 : item1;
                return _ci18n('names.meaty', { name: tr(other.name) });
            }
            if (item1.id === RAW_VEG_ID || item2.id === RAW_VEG_ID) {
                const other = item1.id === RAW_VEG_ID ? item2 : item1;
                return _ci18n('names.vegetarian', { name: tr(other.name) });
            }

            // If items are the same, use a random adjective
            if (item1 === item2) {
                return this.getRandomAdjectiveForSameItem(item1) + " " + tr(item1.name);
            }
            // Otherwise combine names as before

            const firstWord = tr(item1.name).split(' ')[0];
            const lastWord = tr(item2.name).split(' ').pop();
            return firstWord + " " + lastWord;
        },

        // Deterministic pseudo-random in [0,1) so the cook preview matches the
        // result actually applied by cookItems (no per-render re-roll).
        _seededRandom: function (seed) {
            const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
            return x - Math.floor(x);
        },

        getRandomAdjectiveForSameItem: function (item) {
            // Choose the adjective deterministically from the item id so the
            // preview render and cookItems() always agree.
            const seed = item && item.id ? item.id : 0;
            const rand = this._seededRandom(seed * 2 + 1);
            let adjectiveKey;

            if (rand < 0.35) {
                adjectiveKey = 'positive'; // 35% chance
                this._lastAdjectiveEffect = 'positive';
            } else if (rand < 0.75) {
                adjectiveKey = 'neutral';  // 40% chance
                this._lastAdjectiveEffect = 'neutral';
            } else {
                adjectiveKey = 'negative'; // 25% chance
                this._lastAdjectiveEffect = 'negative';
            }

            // Pull the adjective bank from the namespace. T.pool takes the
            // translated array whole, so a shorter one never mixes in English.
            const list = _T.pool('Cooking.adjectives.' + adjectiveKey);

            if (list && list.length > 0) {
                return list[Math.floor(this._seededRandom(seed * 2 + 2) * list.length)];
            }

            // Fallback plain labels if JSON not loaded yet
            return adjectiveKey;
        },

        getMultiplierForSameItem: function () {
            // Use the last adjective effect to determine the multiplier
            if (this._lastAdjectiveEffect === "positive") {
                return 1.5; // 50% bonus
            } else if (this._lastAdjectiveEffect === "neutral") {
                return 0.75; // 25% penalty
            } else {
                return 0.25; // 75% penalty
            }
        },

        // Whoever the Cooking menu's party switcher currently has at the stove.
        // Called from a plugin command instead (no scene, no switcher), it is
        // the leader, which is what every award defaulted to before.
        activeCook: function () {
            const scene = (typeof SceneManager !== 'undefined' && SceneManager) ? SceneManager._scene : null;
            if (scene && typeof scene.cookActor === 'function') {
                const actor = scene.cookActor();
                if (actor) return actor;
            }
            if (typeof $gameParty === 'undefined' || !$gameParty || !$gameParty.leader) return null;
            return $gameParty.leader() || null;
        },

        //=====================================================================
        // Cookware
        //=====================================================================
        // A pot to cook in and a set of utensils to cook with are the
        // difference between a meal and something eaten off a stick. Any item
        // in the pack tagged <Cookware: n> is a piece of kit the kitchen can
        // use, and n is what it is worth as a percentage on top of whatever the
        // dish would have been. They stack, up to COOKWARE_CAP, and each piece
        // counts once however many of it the party is hauling: two pots do not
        // cook twice as well.
        //
        // The tag is the whole rule, so a mod adding a copper cauldron only has
        // to tag it. Nothing here names an item.
        COOKWARE_CAP: 50,

        cookwareValue: function (item) {
            if (!item || !item.note) return 0;
            const m = item.note.match(/<cookware:\s*(\d+)>/i);   // i18n-ignore  note tag
            return m ? Number(m[1]) : 0;
        },

        // Every distinct piece of kit in the pack, best first, with the total
        // it is worth after the cap. The menu prints the list and the dish is
        // multiplied by the total.
        cookware: function () {
            if (typeof $gameParty === 'undefined' || !$gameParty || !$gameParty.items) {
                return { pieces: [], bonus: 0, multiplier: 1 };
            }
            const pieces = ($gameParty.items() || [])
                .map(item => ({ item, value: this.cookwareValue(item) }))
                .filter(entry => entry.value > 0)
                .sort((a, b) => b.value - a.value);
            const raw = pieces.reduce((sum, entry) => sum + entry.value, 0);
            const bonus = Math.min(this.COOKWARE_CAP, raw);
            return { pieces, bonus, multiplier: 1 + bonus / 100 };
        },

        // What the cook's Wisdom is worth on a d20, read the way every other
        // check in the game reads it: the D&D modifier of a bounded score, not
        // the raw MDF param (which is in the hundreds late on and would have
        // made every dish an automatic masterpiece).
        cookAbilityMod: function (cook) {
            if (!cook) return 0;
            if (window.Dice3D && typeof window.Dice3D.statModifier === 'function') {
                const mod = window.Dice3D.statModifier(cook, 'WIS');
                if (Number.isFinite(mod)) return mod;
            }
            if (typeof cook.abilityMod === 'function') {
                const mod = cook.abilityMod(5); // WIS is param 5 (MDF)
                if (Number.isFinite(mod)) return mod;
            }
            const value = typeof cook.param === 'function' ? cook.param(5) : cook.mdf;
            return Math.floor(((Number(value) || 10) - 10) / 2);
        },

        cookItems: async function (item1, item2) {

            // Every entry point checks this first, but cookItems is public and
            // is reached from plugin commands and mods too: it never spends an
            // ingredient it has not confirmed the party is carrying.
            if (!this.canCook(item1, item2)) {
                SoundManager.playBuzzer();
                if (window.ParchmentToast) {
                    window.ParchmentToast.show(_ci18n('messages.cannotCombine'), {
                        severity: "warn",
                        duration: 180
                    });
                }
                return;
            }

            // Remove items from inventory
            $gameParty.loseItem(item1, 1);
            $gameParty.loseItem(item2, 1);

            // Inventory changed: drop the active scene's cached food list.
            if (SceneManager._scene && SceneManager._scene.invalidateFoodList) {
                SceneManager._scene.invalidateFoodList();
            }

            // Get plugin parameters from TimeDateSystem
            const params = PluginManager.parameters('TimeDateSystem');
            const maxHunger = Number(params['maxHunger'] || 100);
            const overeatMaxHunger = Number(params['overeatMaxHunger'] || 150);
            const overeatStateId = Number(params['overeatStateId'] || 41);
            const calorieFactor = Number(params['calorieFactor'] || 0.10);
            const proteinFactor = Number(params['proteinFactor'] || 2.00);
            const fatFactor = Number(params['fatFactor'] || 1.50);

            // Calculate nutritional values (hunger = calories, tp = protein, mp = fat)
            const item1Nutrition = this.getRecoveryValues(item1);
            const item2Nutrition = this.getRecoveryValues(item2);

            // Raw meat/plant matter cooked with a second unit of itself is a
            // fixed recipe, never the random-adjective "same item" roll.
            const fixedRecipe = this.fixedRecipeFor(item1, item2);
            const isSameItem = item1 === item2 && !fixedRecipe;
            let multiplier = 1.0;

            // Roll the cooked name first so getMultiplierForSameItem() reads the
            // freshly rolled adjective effect (createCookedItemName re-rolls
            // _lastAdjectiveEffect). Otherwise the applied multiplier would be
            // taken from a stale roll and disagree with the shown flavor text.
            const cookedName = this.createCookedItemName(item1, item2);

            // A meal made is a thing the party did (Diary.js). Written here so
            // the name is the one already rolled, never a second roll.
            if (window.Diary) window.Diary.onCrafted('cook', cookedName, 1);

            if (isSameItem) {
                // For same item, use random adjective effect multiplier
                multiplier = this.getMultiplierForSameItem();
            }

            // Roll 3D d20 culinary check based on cook's WIS (Wisdom)
            const cook = this.activeCook();
            const wisMod = this.cookAbilityMod(cook);
            // The flat roll is worked out first and stands as the answer, so a
            // Dice3D that is missing, that throws (no WebGL, a scene torn down
            // under it) or that resolves to nothing never leaves the meal
            // half-cooked with a TypeError.
            const cookRoll = Math.floor(Math.random() * 20) + 1;
            let rollRes = {
                roll: cookRoll,
                modifier: wisMod,
                total: cookRoll + wisMod,
                nat1: cookRoll === 1,
                nat20: cookRoll === 20,
                success: cookRoll === 20 || (cookRoll !== 1 && cookRoll + wisMod >= 12)
            };

            if (window.Dice3D && typeof window.Dice3D.rollD20 === 'function') {
                try {
                    const shown = await window.Dice3D.rollD20({
                        actionName: `Cooking: ${cookedName}`,
                        statName: 'WIS',
                        modifier: wisMod,
                        dc: 12,
                        forcedRoll: cookRoll,
                        force3D: true
                    });
                    if (shown && typeof shown === 'object') rollRes = shown;
                } catch (e) {
                    console.warn('CookingSystem: culinary check fell back to a flat roll', e);
                }
            }

            const isNat20 = rollRes.nat20;
            const isNat1 = rollRes.nat1;
            const cookTotal = rollRes.total;
            const cookMod = rollRes.modifier ?? wisMod;

            let culinaryMult = 1.0;
            if (isNat20) {
                culinaryMult = 1.5; // Gourmet Masterpiece!
                if (window.ParchmentToast) {
                    window.ParchmentToast.show(_T('Cooking.roll.masterpiece', { dish: cookedName }), { severity: 'good', duration: 220 });
                }
            } else if (isNat1) {
                culinaryMult = 0.6; // Burnt / Scorched
                if (window.ParchmentToast) {
                    window.ParchmentToast.show(_T('Cooking.roll.scorched', { dish: cookedName }), { severity: 'danger', duration: 220 });
                }
            } else if (rollRes.success) {
                culinaryMult = 1.15; // Well prepared
                if (window.ParchmentToast) {
                    window.ParchmentToast.show(_T('Cooking.roll.delicious', {
                        roll: rollRes.roll,
                        mod: (cookMod >= 0 ? '+' : '') + cookMod,
                        total: cookTotal,
                        dish: cookedName,
                    }), { severity: 'good', duration: 180 });
                }
            }

            // The kit in the pack multiplies the dish alongside the roll: the
            // same two ingredients go further out of a proper pot than off a
            // stick over the fire.
            const kit = this.cookware();
            culinaryMult *= kit.multiplier;

            let totalCalories, totalProtein, totalFat;
            if (fixedRecipe) {
                // The finished item's own nutrition, not the doubled raw total.
                const recipeNutrition = this.getRecoveryValues(fixedRecipe);
                totalCalories = Math.round(recipeNutrition.hunger * culinaryMult);
                totalProtein = Math.round(recipeNutrition.tp * culinaryMult);
                totalFat = Math.round(recipeNutrition.mp * culinaryMult);
            } else {
                // Double first item's nutrition and add second item's nutrition (with potential modifier)
                let baseCal = item1Nutrition.hunger * 2;
                let baseProt = item1Nutrition.tp * 2;
                let baseFat = item1Nutrition.mp * 2;

                if (isSameItem) {
                    baseCal += item2Nutrition.hunger * multiplier;
                    baseProt += item2Nutrition.tp * multiplier;
                    baseFat += item2Nutrition.mp * multiplier;
                } else {
                    baseCal += item2Nutrition.hunger;
                    baseProt += item2Nutrition.tp;
                    baseFat += item2Nutrition.mp;
                }

                totalCalories = Math.round(baseCal * culinaryMult);
                totalProtein = Math.round(baseProt * culinaryMult);
                totalFat = Math.round(baseFat * culinaryMult);
            }

            // Calculate hunger recovery using the same formula as TimeDateSystem.
            // A cook who knows what they are doing wastes less of the same two
            // ingredients (Cooking, specialization 75). It is the member the
            // switcher has at the stove who is judged, not the party's best.
            const cookSkill = window.SpecializationXP
                ? window.SpecializationXP.multiplierFor(cook, 'Cooking', 0.10) : 1;
            const totalHungerRecovery =
                ((totalCalories * calorieFactor) +
                 (totalProtein * proteinFactor) +
                 (totalFat * fatFactor)) * cookSkill;

            const { partySize, hungerGained, report } = this.serveToParty(totalHungerRecovery);

            // What the dish did to every meter it touched, drawn as bars that
            // run up from where each one stood before it.
            if (window.PartyMeal) window.PartyMeal.announce(report, { title: cookedName });

            // Show message with recovery amounts and flavor text for same-item cooking
            let recoverMsg = _ci18n('messages.prepared', { name: cookedName });

            // Add flavor text for same item cooking
            if (isSameItem) {
                if (this._lastAdjectiveEffect === 'positive') {
                    recoverMsg += _ci18n('messages.sameItemPositive');
                } else if (this._lastAdjectiveEffect === 'neutral') {
                    recoverMsg += _ci18n('messages.sameItemNeutral');
                } else {
                    recoverMsg += _ci18n('messages.sameItemNegative');
                }
            }

            // What the party's one food meter gained, as a percentage of a full one.
            const hungerPercent = Math.floor((hungerGained / maxHunger) * 100);

            if (hungerPercent > 0) {
                recoverMsg += _ci18n('messages.recoveredHunger', { percent: hungerPercent });
            }

            recoverMsg += _ci18n('messages.fedParty', { count: partySize });
            if (kit.bonus > 0) {
                recoverMsg += _ci18n('messages.cookware', { percent: kit.bonus });
            }
            // Everything a cooked dish did is reported through the shared
            // notification service: the dish itself, the Hunger it restored,
            // and the Cooking tier if this one pushed the cook over the line.
            if (window.ParchmentToast) {
                const gained = window.SpecializationXP
                    ? (window.SpecializationXP.award('Cooking', isSameItem ? 1 : 2,
                        { actor: cook, silent: true }) || [])
                    : [];
                window.ParchmentToast.group([
                    () => window.ParchmentToast.show(recoverMsg, {
                        severity: "info",
                        duration: 180,
                        icon: item1 ? item1.iconIndex : undefined
                    }),
                    ...(hungerPercent > 0
                        ? [() => window.ParchmentToast.need('hunger', hungerPercent)]
                        : []),
                    ...gained.map(g => () => window.SpecializationXP.announce(g))
                ]);
            }

            // Play recovery sound if enabled
            if (playRecoverySound) {
                AudioManager.playSe({
                    name: recoverySoundName,
                    pan: 0,
                    pitch: 100,
                    volume: 90
                });
            }

            // Clear selected items
            this._item1 = null;
            this._item2 = null;

            // Refresh the screen - corrected to use proper RPG Maker MZ method
            $gameMap.requestRefresh();

            // If we're in a scene with refreshStatus, call it
            if (SceneManager._scene && SceneManager._scene.refreshStatus) {
                SceneManager._scene.refreshStatus();
            }
        },

        // The pot goes to the table, and the table is window.PartyMeal's. The
        // kitchen used to share the dish out itself, between every party slot
        // and never past a full meter: it fed the summon holding the fourth
        // slot, and it threw away the whole surplus of a big dish, which is why
        // a fed party could eat a feast and see nothing move. Hunger is one
        // meter for the whole party, so the dish is served to it once and can
        // now carry into the overeating range, which is what the amber and the
        // red on the bars are for.
        //
        // Returns { partySize, hungerGained, report } - the last being the
        // before-and-after the serving card draws.
        serveToParty: function (totalHungerRecovery) {
            const meal = window.PartyMeal;
            if (!meal) return { partySize: 0, hungerGained: 0, report: null };
            const report = meal.serve(totalHungerRecovery);
            return { partySize: report.members.length, hungerGained: report.total, report };
        },

        // Everyone the pot is shared between, for the preview card: the same
        // table the meal itself is served to.
        mealMembers: function () {
            return window.PartyMeal ? window.PartyMeal.eaters() : [];
        },

        // Eat a single raw ingredient, splitting its nutrition across the party.
        eatSingleItem: function (item) {
            if (!item || typeof $gameParty === 'undefined' || !$gameParty || !$gameParty.hasItem(item)) {
                SoundManager.playBuzzer();
                return false;
            }

            // Remove one unit from inventory
            $gameParty.loseItem(item, 1);

            // Inventory changed: drop the active scene's cached food list.
            if (SceneManager._scene && SceneManager._scene.invalidateFoodList) {
                SceneManager._scene.invalidateFoodList();
            }

            // Get plugin parameters from TimeDateSystem
            const params = PluginManager.parameters('TimeDateSystem');
            const maxHunger = Number(params['maxHunger'] || 100);
            const calorieFactor = Number(params['calorieFactor'] || 0.10);
            const proteinFactor = Number(params['proteinFactor'] || 2.00);
            const fatFactor = Number(params['fatFactor'] || 1.50);

            const nutrition = this.getRecoveryValues(item);

            const totalHungerRecovery =
                (nutrition.hunger * calorieFactor) +
                (nutrition.tp * proteinFactor) +
                (nutrition.mp * fatFactor);

            const { partySize, hungerGained, report } = this.serveToParty(totalHungerRecovery);

            const itemName = window.translateText ? window.translateText(item.name) : item.name;
            // Raw off the shelf is still a meal: the same card, the same bars.
            if (window.PartyMeal) window.PartyMeal.announce(report, { title: itemName });
            let recoverMsg = _ci18n('messages.ate', { name: itemName });

            const hungerPercent = Math.floor((hungerGained / maxHunger) * 100);
            if (hungerPercent > 0) {
                recoverMsg += _ci18n('messages.recoveredHunger', { percent: hungerPercent });
            }
            recoverMsg += _ci18n('messages.fedParty', { count: partySize });

            // Same pairing as a cooked dish: what was eaten, then what it did
            // to the party's Hunger.
            if (window.ParchmentToast) {
                window.ParchmentToast.group([
                    () => window.ParchmentToast.show(recoverMsg, {
                        severity: "info",
                        duration: 180,
                        icon: item ? item.iconIndex : undefined
                    }),
                    ...(hungerPercent > 0
                        ? [() => window.ParchmentToast.need('hunger', hungerPercent)]
                        : [])
                ]);
            }

            if (playRecoverySound) {
                AudioManager.playSe({
                    name: recoverySoundName,
                    pan: 0,
                    pitch: 100,
                    volume: 90
                });
            }

            $gameMap.requestRefresh();
            if (SceneManager._scene && SceneManager._scene.refreshStatus) {
                SceneManager._scene.refreshStatus();
            }
            return true;
        },

        getAvailableRecoveryItems: function () {
            if (typeof $gameParty === 'undefined' || !$gameParty || !$gameParty.items) return [];
            return ($gameParty.items() || []).filter(item => this.isFoodItem(item));
        },

        setFirstItem: function (item) {
            this._item1 = item;
        },

        setSecondItem: function (item) {
            this._item2 = item;
        },

        clearSelectedItems: function () {
            this._item1 = null;
            this._item2 = null;
        },

        getFirstItem: function () {
            return this._item1;
        },

        getSecondItem: function () {
            return this._item2;
        }
    };

    window.CookingSystem = CookingSystem;

    //=============================================================================
    // Scene_Cooking
    //=============================================================================
    function Scene_Cooking() {
        this.initialize(...arguments);
    }

    Scene_Cooking.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_Cooking.prototype.constructor = Scene_Cooking;

    // The scene lives inside this IIFE, so it has to be published the way
    // Scene_Blacksmithing and Scene_Alchemistry are: the main menu tile, the K
    // hotkey and AutoIdleExplorer all reach the kitchen by the global name and
    // without this they either threw a ReferenceError or silently did nothing.
    window.Scene_Cooking = Scene_Cooking;

    Scene_Cooking.prototype.initialize = function () {
        Scene_MenuBase.prototype.initialize.call(this);
        CookingSystem.clearSelectedItems();
    };

    // Who is at the stove. The party switcher in the header picks them, and it
    // is their Cooking that decides how much of the meal survives the pan.
    Scene_Cooking.prototype.cookMembers = function () {
        if (typeof $gameParty === 'undefined' || !$gameParty || !$gameParty.members) return [];
        return ($gameParty.members() || []).filter(m => m && typeof m.name === 'function');
    };

    Scene_Cooking.prototype.cookActor = function () {
        const members = this.cookMembers();
        if (!members.length) return null;
        const idx = Math.max(0, Math.min(members.length - 1, this._cookActorIndex || 0));
        return members[idx];
    };

    Scene_Cooking.prototype.selectCookActor = function (index) {
        const members = this.cookMembers();
        if (!members.length) return;
        const next = ((index % members.length) + members.length) % members.length;
        if (next === this._cookActorIndex) return;
        this._cookActorIndex = next;
        SoundManager.playCursor();
        this.refreshUICooking();
    };

    Scene_Cooking.prototype.cycleCookActor = function (dir) {
        this.selectCookActor((this._cookActorIndex || 0) + dir);
    };

    Scene_Cooking.prototype.create = function () {
        Scene_MenuBase.prototype.create.call(this);
        this._cookActorIndex = 0;
        this._cookingRenderMode = null;
        this._cookingLeaving = false;
        // Name the skill this menu runs on, and whose hands are on it. The badge
        // and the switcher are decorations owned by other plugins: neither is
        // allowed to stop the kitchen from being built.
        try {
            if (window.SpecBadge && window.SpecBadge.show) {
                window.SpecBadge.show('Cooking', { actor: this.cookActor() });  // i18n-ignore  Specialization.json id
            }
        } catch (e) { console.warn('CookingSystem: badge', e); }
        try {
            if (window.CharSwitcher && window.CharSwitcher.installTabKey) {
                window.CharSwitcher.installTabKey(this, (dir) => this.cycleCookActor(dir));
            }
        } catch (e) { console.warn('CookingSystem: switcher', e); }
        this.createHelpWindow();
        this.createItemListWindow();
        this.createConfirmWindow();
    };

    Scene_Cooking.prototype.createHelpWindow = function () {
        this._helpWindow = new Window_Help(new Rectangle(0, 0, Graphics.boxWidth, this.calcWindowHeight(2, false)));
        this.addWindow(this._helpWindow);
        this.updateHelpMessage();
    };

    Scene_Cooking.prototype.createItemListWindow = function () {
        const y = this._helpWindow ? this._helpWindow.height : 0;
        const height = Graphics.boxHeight - y - this.calcWindowHeight(2, false);

        this._itemListWindow = new Window_CookingItemList(new Rectangle(0, y, Graphics.boxWidth, height));
        this._itemListWindow.setHandler("ok", this.onItemOk.bind(this));
        this._itemListWindow.setHandler("cancel", this.onItemCancel.bind(this));
        this._itemListWindow.refresh();
        this._itemListWindow.activate();
        this._itemListWindow.select(0);
        this.addWindow(this._itemListWindow);
    };

    Scene_Cooking.prototype.createConfirmWindow = function () {
        const y = Graphics.boxHeight - this.calcWindowHeight(2, false);
        this._confirmWindow = new Window_CookingConfirm(new Rectangle(0, y, Graphics.boxWidth, this.calcWindowHeight(2, false)));
        this._confirmWindow.setHandler("cook", this.onCookOk.bind(this));
        this._confirmWindow.setHandler("cancel", this.onCookCancel.bind(this));
        this._confirmWindow.deactivate();
        this.addWindow(this._confirmWindow);
    };

    Scene_Cooking.prototype.onItemOk = function () {
        const selectedItem = this._itemListWindow ? this._itemListWindow.item() : null;
        if (!selectedItem) {
            SoundManager.playBuzzer();
            if (this._itemListWindow) this._itemListWindow.activate();
            return;
        }

        if (!CookingSystem.getFirstItem()) {
            // First item selection
            CookingSystem.setFirstItem(selectedItem);
            this.updateHelpMessage();
            this._itemListWindow.refresh();
            this._itemListWindow.activate();
        } else {
            // Second item selection
            CookingSystem.setSecondItem(selectedItem);

            // Check we hold enough of it (the same item picked twice needs two)
            if (!CookingSystem.canCook(CookingSystem.getFirstItem(), selectedItem)) {
                SoundManager.playBuzzer();
                CookingSystem.setSecondItem(null);
                this._itemListWindow.activate();
                return;
            }

            // Update confirm window and activate it
            this._confirmWindow.refresh();
            this._itemListWindow.deactivate();
            this._confirmWindow.activate();
            this._confirmWindow.select(0);
            this.updateHelpMessage();
        }
    };

    Scene_Cooking.prototype.onItemCancel = function () {
        if (CookingSystem.getFirstItem()) {
            // If we've selected the first item, clear it
            CookingSystem.clearSelectedItems();
            this.updateHelpMessage();
            this._itemListWindow.refresh();
            this._itemListWindow.activate();
        } else {
            // Otherwise, exit the scene
            this.popScene();
        }
    };

    Scene_Cooking.prototype.updateHelpMessage = function () {
        if (!this._helpWindow) return;
        if (!CookingSystem.getFirstItem()) {
            this._helpWindow.setText(_ci18n('ui.selectFirstIngredient'));
        } else if (!CookingSystem.getSecondItem()) {
            this._helpWindow.setText(_ci18n('ui.selectSecondIngredient', { name: CookingSystem.getFirstItem().name }));
        } else {
            const item1 = CookingSystem.getFirstItem();
            const item2 = CookingSystem.getSecondItem();
            const cookedName = CookingSystem.createCookedItemName(item1, item2);
            this._helpWindow.setText(_ci18n('ui.confirmCook', { item1: item1.name, item2: item2.name, result: cookedName }));
        }
    };

    Scene_Cooking.prototype.refreshStatus = function () {
        if (this._itemListWindow) this._itemListWindow.refresh();
    };

    // onCookOk is defined once, further down, alongside the rest of the parchment UI. The
    // window-era version that used to sit here was overwritten by it at load and popped the
    // scene stack twice, which would have dropped the player past the map.

    Scene_Cooking.prototype.onCookCancel = function () {
        this._confirmWindow.deactivate();
        CookingSystem.setSecondItem(null);
        this.updateHelpMessage();
        this._itemListWindow.activate();
    };

    //=============================================================================
    // Window_CookingItemList
    //=============================================================================
    function Window_CookingItemList() {
        this.initialize(...arguments);
    }

    Window_CookingItemList.prototype = Object.create(Window_ItemList.prototype);
    Window_CookingItemList.prototype.constructor = Window_CookingItemList;

    Window_CookingItemList.prototype.initialize = function (rect) {
        Window_ItemList.prototype.initialize.call(this, rect);
        this._category = "item";
        this.refresh();
    };

    Window_CookingItemList.prototype.includes = function (item) {
        return item && item.itypeId === 1 && CookingSystem.isFoodItem(item)
    };

    Window_CookingItemList.prototype.isEnabled = function (item) {
        if (!item) return false;

        const firstItem = CookingSystem.getFirstItem();
        if (!firstItem) return true;

        return CookingSystem.canCook(firstItem, item);
    };

    Window_CookingItemList.prototype.drawItem = function (index) {
        const item = this.itemAt(index);
        if (item) {
            const rect = this.itemLineRect(index);
            const firstItem = CookingSystem.getFirstItem();

            // Highlight the first selected item
            if (item === firstItem) {
                this.changePaintOpacity(true);
                this.contents.fillRect(rect.x, rect.y, rect.width, rect.height, 'rgba(255, 255, 128, 0.3)');
            }

            this.changePaintOpacity(this.isEnabled(item));
            this.drawItemName(item, rect.x, rect.y, rect.width);
            this.drawItemNumber(item, rect.x, rect.y, rect.width);
        }
    };

    Window_CookingItemList.prototype.needsNumber = function () {
        return true;
    };

    Window_CookingItemList.prototype.maxCols = function () {
        return 1;
    };

    //=============================================================================
    // Window_CookingConfirm
    //=============================================================================
    function Window_CookingConfirm() {
        this.initialize(...arguments);
    }

    Window_CookingConfirm.prototype = Object.create(Window_HorzCommand.prototype);
    Window_CookingConfirm.prototype.constructor = Window_CookingConfirm;

    Window_CookingConfirm.prototype.initialize = function (rect) {
        Window_HorzCommand.prototype.initialize.call(this, rect);
        this.refresh();
    };

    Window_CookingConfirm.prototype.makeCommandList = function () {
        const item1 = CookingSystem.getFirstItem();
        const item2 = CookingSystem.getSecondItem();
        this.addCommand(_ci18n('ui.cookButton'), 'cook', item1 && item2);
        this.addCommand(_ci18n('ui.cancelButton'), 'cancel');
    };

    Window_CookingConfirm.prototype.maxCols = function () {
        return 2;
    };

    // =============================================================================
    // HTML5 overlay / ASCII Mode Compatibility
    // =============================================================================

    // Cache the available-food list on the scene: getAvailableRecoveryItems()
    // filters the whole party inventory (regex per note) and was called several
    // times per frame. The list only changes when an item is cooked/eaten, which
    // pops the scene, so caching for the scene's lifetime is safe.
    Scene_Cooking.prototype.getCachedFoodList = function () {
        if (!this._cachedFoodList) {
            this._cachedFoodList = CookingSystem.getAvailableRecoveryItems() || [];
        }
        return this._cachedFoodList;
    };
    Scene_Cooking.prototype.invalidateFoodList = function () {
        this._cachedFoodList = null;
    };

    // The pantry can shrink under an open kitchen: a follower eats, a timed
    // event fires, an autosave restores. Both cursors are pulled back into the
    // list before anything reads through them, so a stale index buzzes at worst
    // instead of indexing past the end.
    Scene_Cooking.prototype.clampCookingCursors = function () {
        const len = this.getCachedFoodList().length;
        const clamp = (v) => (len > 0 ? Math.max(0, Math.min(len - 1, v || 0)) : 0);
        this._pantryIndex = clamp(this._pantryIndex);
        this._selectedIndex = clamp(this._selectedIndex);
        this._confirmIndex = (this._confirmIndex || 0) % 2;
        this._selectedConfirmIndex = (this._selectedConfirmIndex || 0) % 2;
        // An ingredient that is no longer carried cannot stay in a pot.
        const item1 = CookingSystem.getFirstItem();
        const item2 = CookingSystem.getSecondItem();
        const gone = (it) => it && (typeof $gameParty === 'undefined' || !$gameParty || !$gameParty.hasItem(it));
        if (gone(item1)) CookingSystem.clearSelectedItems();
        else if (gone(item2)) CookingSystem.setSecondItem(null);
    };

    // Whether the kitchen is being drawn as ASCII this frame.
    Scene_Cooking.prototype.isAsciiCooking = function () {
        return !!(window.AsciiMode && window.AsciiMode.active !== 0);
    };

    Scene_Cooking.prototype.enterAsciiCooking = function () {
        this._cookingRenderMode = 'ascii';
        this._asciiCookingSig = null;
        if (window.AsciiMode.createCanvas) window.AsciiMode.createCanvas();
        if (window.AsciiMode.canvas && window.AsciiMode.canvas.style) {
            window.AsciiMode.canvas.style.display = 'block';
        }

        // Deactivate and hide normal windows
        if (this._helpWindow) { this._helpWindow.deactivate(); this._helpWindow.hide(); }
        if (this._itemListWindow) { this._itemListWindow.deactivate(); this._itemListWindow.hide(); }
        if (this._confirmWindow) { this._confirmWindow.deactivate(); this._confirmWindow.hide(); }

        // The parchment overlay must go with it, or it stays on screen over the
        // ASCII canvas with nothing driving it.
        this.destroyUICooking();

        this._selectedIndex = this._pantryIndex || 0;
        this._activeWindow = 'list'; // 'list', 'confirm'
        this._selectedConfirmIndex = this._confirmIndex || 0; // 0: Cook, 1: Cancel
        this.clampCookingCursors();
    };

    Scene_Cooking.prototype.enterParchmentCooking = function () {
        this._cookingRenderMode = 'parchment';
        if (window.AsciiMode && window.AsciiMode.canvas && window.AsciiMode.canvas.style) {
            window.AsciiMode.canvas.style.display = 'none';
        }

        // Hide standard windows for custom HTML overlay
        if (this._helpWindow) { this._helpWindow.deactivate(); this._helpWindow.hide(); }
        if (this._itemListWindow) { this._itemListWindow.deactivate(); this._itemListWindow.hide(); }
        if (this._confirmWindow) { this._confirmWindow.deactivate(); this._confirmWindow.hide(); }

        // Initialize D&D Cooking view
        this._activeArea = this._activeWindow === 'confirm' ? "confirm" : "pantry";
        this._pantryIndex = this._selectedIndex || 0;
        this._confirmIndex = this._selectedConfirmIndex || 0;
        this.clampCookingCursors();

        this.initUICooking();
        this.refreshUICooking();
    };

    const _Scene_Cooking_start = Scene_Cooking.prototype.start;
    Scene_Cooking.prototype.start = function () {
        if (_Scene_Cooking_start) _Scene_Cooking_start.call(this);
        else Scene_MenuBase.prototype.start.call(this);

        this._cachedFoodList = null;
        this._asciiCookingSig = null;
        this._pantryIndex = 0;
        this._confirmIndex = 0;
        this._selectedIndex = 0;
        this._selectedConfirmIndex = 0;
        this._activeArea = "pantry";
        this._activeWindow = 'list';

        if (this.isAsciiCooking()) this.enterAsciiCooking();
        else this.enterParchmentCooking();
    };

    const _Scene_Cooking_update = Scene_Cooking.prototype.update;
    Scene_Cooking.prototype.update = function () {
        const wantAscii = this.isAsciiCooking();
        // ASCII mode has its own hotkey and can be toggled with the kitchen
        // open. Whichever half takes over is handed a live cursor and a drawn
        // screen, instead of running on the other half's undefined state (which
        // left the player in a menu that answered to nothing).
        if (wantAscii && this._cookingRenderMode !== 'ascii') this.enterAsciiCooking();
        else if (!wantAscii && this._cookingRenderMode !== 'parchment') this.enterParchmentCooking();

        this.clampCookingCursors();

        if (wantAscii) {
            this.updateAsciiCookingInput();
            this.renderAsciiCooking();
            Scene_Base.prototype.update.call(this);
            return;
        }

        this.updateUICookingInput();
        Scene_MenuBase.prototype.update.call(this);
    };

    // Take the parchment overlay off the page. Called on the way out and when
    // ASCII mode takes over mid-scene, so a dead overlay never keeps its click
    // handlers (which close over a scene that is no longer on the stack).
    Scene_Cooking.prototype.destroyUICooking = function () {
        if (typeof document === 'undefined' || !document) return;
        const container = document.getElementById("cooking-container");
        if (container && container.remove) container.remove();
        // Cleanup style block to prevent main menu shrinking/leakage
        const style = document.getElementById("cooking-style");
        if (style && style.remove) style.remove();
    };

    const _Scene_Cooking_terminate = Scene_Cooking.prototype.terminate;
    Scene_Cooking.prototype.terminate = function () {
        // Teardown runs to the end whatever any one step does: a throw here
        // would leave the Tab listener bound to a dead scene and the overlay
        // on top of the map.
        try {
            if (window.AsciiMode && window.AsciiMode.canvas && window.AsciiMode.canvas.style) {
                window.AsciiMode.canvas.style.display = 'none';
            }
        } catch (e) { console.warn('CookingSystem: ASCII teardown', e); }
        try {
            if (window.CharSwitcher && window.CharSwitcher.removeTabKey) {
                window.CharSwitcher.removeTabKey(this);
            }
        } catch (e) { console.warn('CookingSystem: switcher teardown', e); }
        try {
            if (window.SpecBadge && window.SpecBadge.hide) window.SpecBadge.hide();
        } catch (e) { console.warn('CookingSystem: badge teardown', e); }
        try {
            this.destroyUICooking();
        } catch (e) { console.warn('CookingSystem: overlay teardown', e); }

        if (_Scene_Cooking_terminate) _Scene_Cooking_terminate.call(this);
        else Scene_MenuBase.prototype.terminate.call(this);
    };

    Scene_Cooking.prototype.updateAsciiCookingInput = function () {
        const list = this.getCachedFoodList();

        if (this._activeWindow === 'list') {
            if (list.length === 0) {
                if (Input.isTriggered('cancel')) {
                    SoundManager.playCancel();
                    this.popScene();
                }
                return;
            }
            if (Input.isRepeated('down')) {
                this._selectedIndex = (this._selectedIndex + 1) % list.length;
                SoundManager.playCursor();
            }
            if (Input.isRepeated('up')) {
                this._selectedIndex = (this._selectedIndex - 1 + list.length) % list.length;
                SoundManager.playCursor();
            }
            if (Input.isTriggered('ok')) {
                const selectedItem = list[this._selectedIndex];

                if (!selectedItem) {
                    SoundManager.playBuzzer();
                } else if (!CookingSystem.getFirstItem()) {
                    CookingSystem.setFirstItem(selectedItem);
                    SoundManager.playOk();
                } else if (!CookingSystem.canPairItems(CookingSystem.getFirstItem(), selectedItem)) {
                    SoundManager.playBuzzer();
                } else if (!CookingSystem.canCook(CookingSystem.getFirstItem(), selectedItem)) {
                    // Not enough of it (the same item picked twice with one unit).
                    SoundManager.playBuzzer();
                } else {
                    CookingSystem.setSecondItem(selectedItem);
                    this._activeWindow = 'confirm';
                    this._selectedConfirmIndex = 0;
                    SoundManager.playOk();
                }
            }
            if (Input.isTriggered('shift')) {
                // Eat the focused ingredient raw, splitting effects across the party
                const eatItem = list[this._selectedIndex];
                if (CookingSystem.eatSingleItem(eatItem)) {
                    CookingSystem.clearSelectedItems();
                    this.popScene();
                }
                return;
            }
            if (Input.isTriggered('cancel')) {
                if (CookingSystem.getFirstItem()) {
                    CookingSystem.clearSelectedItems();
                    SoundManager.playCancel();
                } else {
                    SoundManager.playCancel();
                    this.popScene();
                }
            }
        } else if (this._activeWindow === 'confirm') {
            if (Input.isRepeated('right') || Input.isRepeated('left')) {
                this._selectedConfirmIndex = (this._selectedConfirmIndex + 1) % 2;
                SoundManager.playCursor();
            }
            if (Input.isTriggered('ok')) {
                if (this._selectedConfirmIndex === 0) { // Cook
                    // The one shared route out of the kitchen: it pops the scene
                    // ONCE. Popping twice here used to drop the player past the
                    // map and onto whatever scene was under it.
                    this.onCookOk();
                } else { // Cancel
                    this._activeWindow = 'list';
                    CookingSystem.setSecondItem(null);
                    SoundManager.playCancel();
                }
            }
            if (Input.isTriggered('cancel')) {
                this._activeWindow = 'list';
                CookingSystem.setSecondItem(null);
                SoundManager.playCancel();
            }
        }
    };

    Scene_Cooking.prototype.renderAsciiCooking = function () {
        if (!window.AsciiMode) return;
        const ctx = window.AsciiMode.context;
        const canvas = window.AsciiMode.canvas;
        if (!ctx || !canvas) return;

        // Only repaint when selection / mode / list state changed, instead of
        // clearing and redrawing the whole canvas every frame.
        const _item1 = CookingSystem.getFirstItem();
        const _item2 = CookingSystem.getSecondItem();
        const _list = this.getCachedFoodList();
        const sig = [
            this._activeWindow, this._selectedIndex, this._selectedConfirmIndex,
            _item1 ? _item1.id : -1, _item2 ? _item2.id : -1, _list.length
        ].join('|');
        if (sig === this._asciiCookingSig) return;
        this._asciiCookingSig = sig;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const fontSize = window.AsciiMode.fontSize;
        ctx.font = `${fontSize}px ${window.AsciiMode.fontFamily}`;

        // Header
        ctx.fillStyle = '#FFD700';
        ctx.textAlign = 'center';
        ctx.fillText("--- COOKING ---", canvas.width / 2, 30);

        // Help Text
        ctx.fillStyle = '#FFFFFF';
        let helpText = _T('Cooking.ui.selectIngredients');
        const item1 = CookingSystem.getFirstItem();
        const item2 = CookingSystem.getSecondItem();

        if (!item1) {
            helpText = _ci18n('ui.selectFirstIngredient');
        } else if (!item2) {
            helpText = _ci18n('ui.selectSecondIngredient', { name: item1.name });
        } else {
            const resultName = CookingSystem.createCookedItemName(item1, item2);
            helpText = _ci18n('ui.confirmCook', { item1: item1.name, item2: item2.name, result: resultName });
        }
        ctx.fillText(helpText, canvas.width / 2, 70);

        // Shift-to-eat hint
        if (this._activeWindow === 'list') {
            ctx.fillStyle = '#9ACD32';
            ctx.fillText(`[Shift / X] ${_ci18n('ui.eatButton')}`, canvas.width / 2, 95);
        }

        // List
        const list = this.getCachedFoodList();
        const listY = 120;
        const listX = 50;

        ctx.textAlign = 'left';
        for (let i = 0; i < list.length; i++) {
            const item = list[i];
            const y = listY + i * (fontSize + 10);

            const isSelected = this._selectedIndex === i && this._activeWindow === 'list';
            const isFirstSelected = item1 === item;

            if (isSelected) {
                ctx.fillStyle = '#FF0000';
                ctx.fillText(`> ${item.name}`, listX, y);
            } else if (isFirstSelected) {
                ctx.fillStyle = '#00FFFF';
                ctx.fillText(`* ${item.name}`, listX, y);
            } else {
                ctx.fillStyle = '#FFFFFF';
                ctx.fillText(`  ${item.name}`, listX, y);
            }

            ctx.fillStyle = '#FFFF00';
            ctx.fillText(`x${$gameParty.numItems(item)}`, listX + 300, y);
        }

        // Details
        const selectedItem = list[this._selectedIndex];
        if (selectedItem) {
            this.renderCookingItemDetails(selectedItem, 450, listY);
        }

        // Confirm Box
        if (this._activeWindow === 'confirm') {
            const boxWidth = 400;
            const boxHeight = 100;
            const bX = (canvas.width - boxWidth) / 2;
            const bY = (canvas.height - boxHeight) / 2;

            ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
            ctx.fillRect(bX, bY, boxWidth, boxHeight);
            ctx.strokeStyle = '#FFFFFF';
            ctx.strokeRect(bX, bY, boxWidth, boxHeight);

            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'center';
            ctx.fillText(_T('Cooking.ui.cookTheseItems'), canvas.width / 2, bY + 30);

            const options = [
                `[ ${_ci18n('ui.cookButton')} ]`,
                `[ ${_ci18n('ui.cancelButton')} ]`
            ];
            for (let i = 0; i < options.length; i++) {
                const x = bX + (i + 1) * (boxWidth / 3);
                if (this._selectedConfirmIndex === i) {
                    ctx.fillStyle = '#FF0000';
                } else {
                    ctx.fillStyle = '#FFFF00';
                }
                ctx.fillText(options[i], x, bY + 70);
            }
        }
    };

    Scene_Cooking.prototype.renderCookingItemDetails = function (item, x, y) {
        if (!item || !window.AsciiMode || !window.AsciiMode.context) return;
        const ctx = window.AsciiMode.context;
        const fontSize = Number(window.AsciiMode.fontSize) || 16;
        const lineHeight = fontSize + 6;
        let currentY = y;

        ctx.fillStyle = '#FFD700';
        ctx.textAlign = 'left';
        ctx.fillText(item.name, x, currentY);
        currentY += lineHeight;

        ctx.strokeStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.moveTo(x, currentY);
        ctx.lineTo(x + 300, currentY);
        ctx.stroke();
        currentY += 10;

        ctx.fillStyle = '#FFFFFF';

        const nut = CookingSystem.getRecoveryValues(item);
        const calories = String(nut.hunger);
        const protein = String(nut.tp);
        const fat = String(nut.mp);

        this.drawCookingKeyValue(_T('Cooking.nutrition.calories'), calories, x, currentY);
        currentY += lineHeight;
        this.drawCookingKeyValue(_T('Cooking.nutrition.protein'), protein, x, currentY);
        currentY += lineHeight;
        this.drawCookingKeyValue(_T('Cooking.nutrition.fat'), fat, x, currentY);
        currentY += lineHeight;
    };

    Scene_Cooking.prototype.drawCookingKeyValue = function (key, value, x, y) {
        if (!window.AsciiMode || !window.AsciiMode.context) return;
        const ctx = window.AsciiMode.context;
        ctx.fillStyle = '#00FFFF';
        ctx.fillText(key + ":", x, y);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(value, x + 100, y);
    };

    // =============================================================================
    // D&D Modern HTML Overlay Implementation
    // =============================================================================

    Scene_Cooking.prototype.popScene = function () {
        // Guarded against a second call: the eat-raw chip and a key press on the
        // same frame would otherwise pop the map out from under the player too.
        if (this._cookingLeaving) return;
        this._cookingLeaving = true;
        Input.clear();
        TouchInput.clear();
        Scene_MenuBase.prototype.popScene.call(this);
    };

    Scene_Cooking.prototype.initUICooking = function () {
        if (typeof document === 'undefined' || !document || !document.body) return;

        // A container left behind by an earlier visit (a terminate that threw,
        // a scene torn down out of order) still carries that visit's click
        // handlers, and those close over a scene that is no longer on the stack:
        // clicking Back would pop the wrong one. The overlay is always built
        // fresh, so every handler belongs to the kitchen the player is in.
        const stale = document.getElementById("cooking-container");
        if (stale && stale.remove) stale.remove();

        const container = document.createElement("div");
        container.id = "cooking-container";
        document.body.appendChild(container);

        const backBtnText = _T('Cooking.back');
        const pantryTitle = _T('Cooking.ingredients');

        container.innerHTML = `
            <div class="book-spread">
                <div class="left-page">
                    <div class="page-header-bar">
                      <div class="back-button focusable">
                        ${backBtnText}
                      </div>
                      <h2 class="title">${pantryTitle}</h2>
                    </div>
                    <div class="pantry-list-container" style="flex: 1; display: flex; flex-direction: column; overflow: hidden"></div>
                </div>
                <div class="right-page">
                    <div class="ui-detail">
                        <div id="cooking-companion-row" class="companion-switcher companion-switcher--header"></div>

                        <h3 class="inspect-section-title">${_T('Cooking.nutritionalBase')}</h3>
                        <div class="slot-container-1"></div>

                        <div class="hearth-area">
                            <div class="cauldron"></div>
                            <div class="hearth-fire"></div>
                        </div>

                        <h3 class="inspect-section-title">${_T('Cooking.aromaticBinder')}</h3>
                        <div class="slot-container-2"></div>

                        <div class="result-card-container"></div>

                        <div class="inspect-actions">
                            <div class="inspect-btn" id="cook-btn"></div>
                            <div class="inspect-btn inspect-btn--secondary focusable" id="eat-raw-btn">${_ci18n('ui.eatButton')}</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Make back button functional
        const backBtn = container.querySelector(".back-button");
        if (backBtn) {
            backBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                e.preventDefault();
                SoundManager.playCancel();
                this.popScene();
            });
        }

        // Scrollwheel should work in left column for moving up and down the scrollbox
        container.addEventListener("wheel", (e) => {
            const list = container.querySelector(".pantry-list");
            if (list) {
                list.scrollTop += e.deltaY;
            }
        });
    };

    Scene_Cooking.prototype.refreshUICooking = function () {
        if (typeof document === 'undefined' || !document) return;
        const container = document.getElementById("cooking-container");
        if (!container) return;

        // The party switcher heads the right page: the same companion-tab row
        // the Skills and Training menus use.
        const compRow = document.getElementById("cooking-companion-row");
        if (compRow && window.CharSwitcher) {
            // The switcher heads the page in place of its old title, so it is
            // drawn even for a party of one: the single name says whose hands
            // the skill badge underneath is reporting.
            const members = this.cookMembers();
            let tabs = "";
            members.forEach((m, idx) => {
                const sel = idx === (this._cookActorIndex || 0) ? "selected" : "";
                // Optional-chained: a tab clicked on the frame the scene is torn
                // down would otherwise call into whatever scene took its place.
                tabs += `<div class="companion-tab ${sel}" onclick="SceneManager._scene?.selectCookActor?.(${idx})">${m.name()}</div>`;
            });
            compRow.innerHTML = window.CharSwitcher.inner(
                `<div class="companion-tabs-row">${tabs}</div>`, members.length);
        }
        try {
            if (window.SpecBadge && window.SpecBadge.show) {
                window.SpecBadge.show('Cooking', { actor: this.cookActor() });  // i18n-ignore  Specialization.json id
            }
        } catch (e) { console.warn('CookingSystem: badge', e); }

        const itemsList = this.getCachedFoodList();
        const item1 = CookingSystem.getFirstItem();
        const item2 = CookingSystem.getSecondItem();

        // 1. Render Pantry List
        const pantryListContainer = container.querySelector(".pantry-list-container");
        if (pantryListContainer) {
            let pantryHTML = "";
            if (itemsList.length === 0) {
                pantryHTML = `
                    <div class="ui-empty empty-pantry-msg">
                        ${_T('Cooking.yourBackpackContainsNoEdible')}
                    </div>
                `;
            } else {
                pantryHTML = `<div class="backpack-grid pantry-list">`;
                itemsList.forEach((item, idx) => {
                    const isSelected = item === item1 || item === item2;
                    const isFocused = this._activeArea === "pantry" && this._pantryIndex === idx;
                    const isEnabled = this._itemListWindow ? this._itemListWindow.isEnabled(item) : true;

                    let finalClass = "item-slot pantry-row";
                    if (isSelected) finalClass += " selected-ingredient";
                    if (isFocused) finalClass += " selected";
                    if (!isEnabled) finalClass += " unusable";

                    const nut = CookingSystem.getRecoveryValues(item);
                    const iconIdx = item.iconIndex;
                    const iconStyle = `background: url('img/system/IconSet.png') -${(iconIdx % 16) * 32}px -${Math.floor(iconIdx / 16) * 32}px no-repeat;`;

                    pantryHTML += `
                        <div class="${finalClass}" data-idx="${idx}">
                            <div class="item-slot-icon">
                                <div class="item-icon" style="${iconStyle}"></div>
                            </div>
                            <div class="item-slot-info">
                                <div class="item-slot-name">${window.translateText ? window.translateText(item.name) : item.name}</div>
                                <div class="item-slot-meta">
                                    <span class="cook-nutrition-line">${_ci18n('nutritionShort.calories')}: ${nut.hunger} | ${_ci18n('nutritionShort.protein')}: ${nut.tp} | ${_ci18n('nutritionShort.fat')}: ${nut.mp}</span>
                                    <span class="item-slot-count">x${$gameParty.numItems(item)}</span>
                                </div>
                            </div>
                        </div>
                    `;
                });
                pantryHTML += `</div>`;
            }
            pantryListContainer.innerHTML = pantryHTML;

            // Bind click handlers for mouse support
            if (itemsList.length > 0) {
                const itemNodes = pantryListContainer.querySelectorAll(".pantry-row");
                itemNodes.forEach(node => {
                    node.addEventListener("click", () => {
                        const idx = parseInt(node.getAttribute("data-idx"), 10);
                        const clickedItem = itemsList[idx];

                        if (!clickedItem ||
                            (this._itemListWindow && !this._itemListWindow.isEnabled(clickedItem))) {
                            SoundManager.playBuzzer();
                            return;
                        }

                        this._activeArea = "pantry";
                        this._pantryIndex = idx;

                        if (!CookingSystem.getFirstItem()) {
                            CookingSystem.setFirstItem(clickedItem);
                            SoundManager.playOk();
                        } else if (!CookingSystem.getSecondItem()) {
                            if (!CookingSystem.canCook(CookingSystem.getFirstItem(), clickedItem)) {
                                SoundManager.playBuzzer();
                            } else {
                                CookingSystem.setSecondItem(clickedItem);
                                SoundManager.playOk();
                                this._activeArea = "confirm";
                                this._confirmIndex = 0;
                            }
                        } else {
                            SoundManager.playBuzzer();
                        }
                        this.refreshUICooking();
                    });
                });

            }
        }

        // The "Eat Raw" order sits with Cook on the right page, so a pantry row
        // stays the same pocket the backpack draws. It eats whatever ingredient
        // the list is focused on, split across the party.
        const eatBtn = container.querySelector("#eat-raw-btn");
        if (eatBtn) {
            const focusedItem = itemsList[this._pantryIndex];
            eatBtn.className = "inspect-btn inspect-btn--secondary focusable" + (focusedItem ? "" : " unusable");
            const newEatBtn = eatBtn.cloneNode(true);
            eatBtn.parentNode.replaceChild(newEatBtn, eatBtn);
            newEatBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                if (!focusedItem) { SoundManager.playBuzzer(); return; }
                if (CookingSystem.eatSingleItem(focusedItem)) {
                    CookingSystem.clearSelectedItems();
                    this.popScene();
                }
            });
        }

        // 2. Render Slots
        const slotContainer1 = container.querySelector(".slot-container-1");
        if (slotContainer1) {
            let slot1HTML = `
                <div class="ui-empty">${_T('Cooking.selectBase')}</div>
            `;
            if (item1) {
                const iconIdx = item1.iconIndex;
                const iconStyle = `background: url('img/system/IconSet.png') -${(iconIdx % 16) * 32}px -${Math.floor(iconIdx / 16) * 32}px no-repeat;`;
                slot1HTML = `
                    <div class="item-slot item-slot--compact">
                        <div class="item-icon" style="${iconStyle}"></div>
                        <div class="item-slot-info">
                            <div class="item-slot-name">${window.translateText ? window.translateText(item1.name) : item1.name}</div>
                            <div class="cook-nutrition-line">${_ci18n('nutritionShort.calories')}: ${item1.meta.calories || 0} | ${_ci18n('nutritionShort.protein')}: ${item1.meta.protein || 0} | ${_ci18n('nutritionShort.fat')}: ${item1.meta.fat || 0}</div>
                        </div>
                    </div>
                `;
            }
            slotContainer1.innerHTML = slot1HTML;
        }

        const slotContainer2 = container.querySelector(".slot-container-2");
        if (slotContainer2) {
            let slot2HTML = `
                <div class="ui-empty">${_T('Cooking.selectBinder')}</div>
            `;
            if (item2) {
                const iconIdx = item2.iconIndex;
                const iconStyle = `background: url('img/system/IconSet.png') -${(iconIdx % 16) * 32}px -${Math.floor(iconIdx / 16) * 32}px no-repeat;`;
                slot2HTML = `
                    <div class="item-slot item-slot--compact">
                        <div class="item-icon" style="${iconStyle}"></div>
                        <div class="item-slot-info">
                            <div class="item-slot-name">${window.translateText ? window.translateText(item2.name) : item2.name}</div>
                            <div class="cook-nutrition-line">${_ci18n('nutritionShort.calories')}: ${item2.meta.calories || 0} | ${_ci18n('nutritionShort.protein')}: ${item2.meta.protein || 0} | ${_ci18n('nutritionShort.fat')}: ${item2.meta.fat || 0}</div>
                        </div>
                    </div>
                `;
            }
            slotContainer2.innerHTML = slot2HTML;
        }

        // 3. Render Result Card
        const resultCardContainer = container.querySelector(".result-card-container");
        if (resultCardContainer) {
            let resultCardHTML = "";
            if (item1 && item2) {
                const cookedName = CookingSystem.createCookedItemName(item1, item2);
                const item1Nutrition = CookingSystem.getRecoveryValues(item1);
                const item2Nutrition = CookingSystem.getRecoveryValues(item2);

                const fixedRecipe = CookingSystem.fixedRecipeFor(item1, item2);
                const isSameItem = item1 === item2 && !fixedRecipe;
                let multiplier = 1.0;
                if (isSameItem) {
                    multiplier = CookingSystem.getMultiplierForSameItem();
                }

                let totalCalories, totalProtein, totalFat;
                if (fixedRecipe) {
                    const recipeNutrition = CookingSystem.getRecoveryValues(fixedRecipe);
                    totalCalories = recipeNutrition.hunger;
                    totalProtein = recipeNutrition.tp;
                    totalFat = recipeNutrition.mp;
                } else {
                    totalCalories = item1Nutrition.hunger * 2;
                    totalProtein = item1Nutrition.tp * 2;
                    totalFat = item1Nutrition.mp * 2;

                    if (isSameItem) {
                        totalCalories += item2Nutrition.hunger * multiplier;
                        totalProtein += item2Nutrition.tp * multiplier;
                        totalFat += item2Nutrition.mp * multiplier;
                    } else {
                        totalCalories += item2Nutrition.hunger;
                        totalProtein += item2Nutrition.tp;
                        totalFat += item2Nutrition.mp;
                    }
                }

                // Get formula params
                const params = PluginManager.parameters('TimeDateSystem');
                const maxHunger = Number(params['maxHunger'] || 100);
                const calorieFactor = Number(params['calorieFactor'] || 0.10);
                const proteinFactor = Number(params['proteinFactor'] || 2.00);
                const fatFactor = Number(params['fatFactor'] || 1.50);

                // The kit in the pack is part of the dish before it is cooked,
                // so the card shows what it will be worth, not what it would
                // have been without a pot.
                const kit = CookingSystem.cookware();
                totalCalories *= kit.multiplier;
                totalProtein *= kit.multiplier;
                totalFat *= kit.multiplier;

                const totalHungerRecovery =
                    (totalCalories * calorieFactor) +
                    (totalProtein * proteinFactor) +
                    (totalFat * fatFactor);

                // Hunger is one meter for the whole party, and it can now be
                // filled past full, so the card shows the whole dish instead of
                // only the part that would have fitted under 100%.
                const partySize = CookingSystem.mealMembers().length;
                const hungerPercent = Math.floor((totalHungerRecovery / maxHunger) * 100);

                let adjectiveMsg = "";
                if (isSameItem) {
                    if (CookingSystem._lastAdjectiveEffect === 'positive') {
                        adjectiveMsg = `<div class="cook-verdict gauge-ink gauge-band--ok">${_T('Cooking.extraordinaryEffect50')}</div>`;
                    } else if (CookingSystem._lastAdjectiveEffect === 'neutral') {
                        adjectiveMsg = `<div class="cook-verdict gauge-ink gauge-band--warn">${_T('Cooking.minorEffect25')}</div>`;
                    } else {
                        adjectiveMsg = `<div class="cook-verdict gauge-ink gauge-band--bad">${_T('Cooking.disastrousEffect75')}</div>`;
                    }
                }

                resultCardHTML = `
                    <div class="cook-result">
                        <h3 class="inspect-section-title">${cookedName}</h3>
                        ${adjectiveMsg}
                        <div class="inspect-spec-grid">
                            <span class="inspect-spec-label">${_T('Cooking.calories')}</span>
                            <span class="inspect-spec-value">${Math.floor(totalCalories)}</span>
                            <span class="inspect-spec-label">${_T('Cooking.protein')}</span>
                            <span class="inspect-spec-value">${Math.floor(totalProtein)}g</span>
                            <span class="inspect-spec-label">${_T('Cooking.fat')}</span>
                            <span class="inspect-spec-value">${Math.floor(totalFat)}g</span>
                            <span class="inspect-spec-label">${_T('Cooking.satietyPerMember')}</span>
                            <span class="inspect-spec-value inspect-spec-value--gain">+${hungerPercent}% (${_T('Cooking.split')} ${partySize})</span>
                            ${kit.bonus > 0 ? `
                            <span class="inspect-spec-label">${_T('Cooking.cookware')}</span>
                            <span class="inspect-spec-value inspect-spec-value--gain">+${kit.bonus}%</span>` : ''}
                        </div>
                        ${kit.bonus > 0 ? `<div class="cook-kit-line">${kit.pieces.map(p =>
                            window.translateText ? window.translateText(p.item.name) : p.item.name
                        ).join(' · ')}</div>` : ''}
                    </div>
                `;
            } else {
                resultCardHTML = "";
            }
            resultCardContainer.innerHTML = resultCardHTML;
        }

        // 4. Update Actions Buttons
        const isCookEnabled = item1 && item2;
        const isCookFocused = this._activeArea === "confirm" && this._confirmIndex === 0;
        this._confirmIndex = 0;

        const cookBtn = container.querySelector("#cook-btn");
        if (cookBtn) {
            cookBtn.className = "inspect-btn focusable" + (isCookEnabled ? "" : " unusable") + (isCookFocused ? " selected" : "");
            cookBtn.textContent = _ci18n('ui.cookButton');
            // Re-bind click handler
            const newCookBtn = cookBtn.cloneNode(true);
            cookBtn.parentNode.replaceChild(newCookBtn, cookBtn);
            newCookBtn.addEventListener("click", () => {
                if (isCookEnabled) {
                    this.onCookOk();
                } else {
                    SoundManager.playBuzzer();
                }
            });
        }

    };

    Scene_Cooking.prototype.updateUICookingInput = function () {
        const itemsList = this.getCachedFoodList();
        const item1 = CookingSystem.getFirstItem();
        const item2 = CookingSystem.getSecondItem();

        // Shoulder buttons change who is cooking, wherever the cursor is (TAB
        // does the same on a keyboard, through CharSwitcher).
        if (Input.isTriggered('pagedown')) { this.cycleCookActor(1); return; }
        if (Input.isTriggered('pageup')) { this.cycleCookActor(-1); return; }

        if (this._activeArea === "pantry") {
            if (itemsList.length === 0) {
                if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
                    SoundManager.playCancel();
                    this.popScene();
                }
                return;
            }

            // The pantry is drawn three across, like the backpack's pockets, so
            // the cursor walks columns sideways and rows up and down.
            const COLS = 3;   // matches .backpack-grid grid-template-columns
            const moveCursor = (delta) => {
                const len = itemsList.length;
                this._pantryIndex = ((this._pantryIndex + delta) % len + len) % len;
                SoundManager.playCursor();
                this.refreshUICooking();
                const container = document.getElementById("cooking-container");
                if (container) {
                    const activeRow = container.querySelector(".pantry-row.selected");
                    if (activeRow) activeRow.scrollIntoView({ block: "nearest" });
                }
            };

            if (Input.isRepeated('down')) {
                moveCursor(COLS);
            } else if (Input.isRepeated('up')) {
                moveCursor(-COLS);
            } else if (Input.isRepeated('left') && this._pantryIndex % COLS !== 0) {
                moveCursor(-1);
            } else if (Input.isRepeated('right') && this._pantryIndex % COLS !== COLS - 1
                       && this._pantryIndex + 1 < itemsList.length) {
                moveCursor(1);
            } else if (Input.isTriggered('right') && item1 && item2) {
                this._activeArea = "confirm";
                this._confirmIndex = 0;
                SoundManager.playCursor();
                this.refreshUICooking();
            } else if (Input.isTriggered('shift')) {
                // Eat the focused ingredient raw, splitting effects across the party
                const eatItem = itemsList[this._pantryIndex];
                if (CookingSystem.eatSingleItem(eatItem)) {
                    CookingSystem.clearSelectedItems();
                    this.popScene();
                }
            } else if (Input.isTriggered('ok')) {
                const selectedItem = itemsList[this._pantryIndex];
                const isEnabled = selectedItem &&
                    (this._itemListWindow ? this._itemListWindow.isEnabled(selectedItem) : true);

                if (!isEnabled) {
                    SoundManager.playBuzzer();
                    return;
                }

                if (!CookingSystem.getFirstItem()) {
                    CookingSystem.setFirstItem(selectedItem);
                    SoundManager.playOk();
                } else if (!CookingSystem.getSecondItem()) {
                    if (!CookingSystem.canCook(CookingSystem.getFirstItem(), selectedItem)) {
                        SoundManager.playBuzzer();
                    } else {
                        CookingSystem.setSecondItem(selectedItem);
                        SoundManager.playOk();
                        this._activeArea = "confirm";
                        this._confirmIndex = 0;
                    }
                }
                this.refreshUICooking();
            } else if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
                if (CookingSystem.getFirstItem()) {
                    CookingSystem.clearSelectedItems();
                    SoundManager.playCancel();
                    this._activeArea = "pantry";
                    this.refreshUICooking();
                } else {
                    SoundManager.playCancel();
                    this.popScene();
                }
            }
        } else if (this._activeArea === "confirm") {
            if (Input.isTriggered('left') || Input.isTriggered('up') || Input.isTriggered('down')) {
                this._activeArea = "pantry";
                SoundManager.playCursor();
                this.refreshUICooking();
            } else if (Input.isTriggered('ok')) {
                this.onCookOk();
            } else if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
                CookingSystem.clearSelectedItems();
                SoundManager.playCancel();
                this._activeArea = "pantry";
                this._pantryIndex = 0;
                this.refreshUICooking();
            }
        }
    };

    // The only way the kitchen cooks, whichever front end asked (parchment,
    // ASCII, mouse). It pops the scene exactly once.
    Scene_Cooking.prototype.onCookOk = function () {
        const item1 = CookingSystem.getFirstItem();
        const item2 = CookingSystem.getSecondItem();
        if (!CookingSystem.canCook(item1, item2)) {
            SoundManager.playBuzzer();
            return;
        }
        SoundManager.playOk();
        // cookItems is a promise (it waits on the culinary d20), so the scene is
        // taken down first and the dish finishes over the map. A throw inside it
        // must not leave the player standing in a kitchen that has already spent
        // the ingredients.
        Promise.resolve(CookingSystem.cookItems(item1, item2))
            .catch(e => console.error('CookingSystem: cooking failed', e));
        CookingSystem.clearSelectedItems();
        this.popScene();
    };

    //=============================================================================
    // Scene_Menu additions
    //=============================================================================
    const _Scene_Menu_createCommandWindow = Scene_Menu.prototype.createCommandWindow;
    Scene_Menu.prototype.createCommandWindow = function () {
        _Scene_Menu_createCommandWindow.call(this);
        if (this._commandWindow && this._commandWindow.setHandler) {
            this._commandWindow.setHandler("cooking", this.commandCooking.bind(this));
        }
    };

    Scene_Menu.prototype.commandCooking = function () {
        SceneManager.push(Scene_Cooking);
    };

    //=============================================================================
    // Window_MenuCommand additions to add cooking to the menu
    //=============================================================================
    const _Window_MenuCommand_addOriginalCommands = Window_MenuCommand.prototype.addOriginalCommands;
    Window_MenuCommand.prototype.addOriginalCommands = function () {
        _Window_MenuCommand_addOriginalCommands.call(this);

        // Check if player has any of the required items
        const hasParty = typeof $gameParty !== 'undefined' && !!$gameParty;
        const db = (typeof $dataItems !== 'undefined' && $dataItems) ? $dataItems : [];
        const hasRequiredItem = hasParty && requiredItemIds.some(itemId => {
            const item = db[itemId];
            return item && $gameParty.hasItem(item);
        });

        this.addCommand(_ci18n('ui.menuLabel'), 'cooking', hasRequiredItem, 219);
    };
})();