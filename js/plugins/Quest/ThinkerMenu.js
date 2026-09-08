/*:
 * @target MZ
 * @plugindesc ThinkerMenu v1.2.0 (D&D Parchment Crafting Edition)
 * @author Omni-Lex
 * @help
 * ============================================================================
 * ThinkerMenu Plugin for RPGMaker MZ - Parchment Edition
 * ============================================================================
 *
 * This plugin adds a premium alchemical crafting menu accessible from the main menu 
 * with Assemble (Crafting) and Disassemble (Salvaging) options.
 *
 * Items can have recipes defined in their note tags:
 * <Recipe: 869x2, 858x1>
 *
 * Items can have categories defined in their note tags:
 * <Category: Food>
 *
 * Items can be excluded from crafting with:
 * <Uncraftable>
 *
 * An item can name the trade it is made in, overriding the one its category
 * would answer for, with the forge's own tag:
 * <Craft: Blacksmithing>
 *
 * An item everybody already knows how to make - legible and buildable at any
 * level of that trade, from the first morning - is marked:
 * <StarterRecipe>
 *
 * Where 869 is the item ID and x2 is the quantity required.
 *
 * NOTE: Items without a <Recipe> tag or with the <Uncraftable> tag cannot
 * be assembled or disassembled.
 *
 * @param menuName
 * @text Menu Name
 * @desc The name displayed in the main menu
 * @default Thinker
 * 
 * @param showInMenu
 * @text Show in Menu
 * @desc Show the Thinker option in the main menu
 * @type boolean
 * @default true
 * 
 * @command openThinkerMenu
 * @text Open Thinker Menu
 * @desc Opens the Thinker crafting menu
 *
 * @command openBlacksmithing
 * @text Open the forge
 * @desc Opens the same workshop with the cursor standing on the anvil.
 */

(() => {
    'use strict';

    const pluginName = 'ThinkerMenu';
    const parameters = PluginManager.parameters(pluginName);
    const menuName = parameters['menuName'] || 'Thinker';
    const showInMenu = parameters['showInMenu'] === 'true';

    // Copy lives in js/i18n/<lang>/plugins/Thinker.json; read live so a
    // language switch reaches the next redraw.
    const thinkerText = () => T.obj('Thinker');



    // Category icon mapping
    function getCategoryIcon(category) {
        // i18n-ignore-start: <category:> note-tag ids; the label the player sees
        // comes from categoryLabel()
        switch (category) {
            case "Arctic": return 67;
            case "Artisan": return 188;
            case "Combat": return 334;
            case "Collectibles": return 210;
            case "Component": return 83;
            case "Counterfeits": return 306;
            case "Enhancers": return 179;
            case "Espionage": return 130;
            case "Essentials": return 83;
            case "Food": return 265;
            case "Homeopathy": return 273;
            case "Jungle": return 277;
            case "Lifestyle": return 84;
            case "Magic": return 176;
            case "Medical": return 32;
            case "Monsters": return 293;
            case "Plants": return 182;
            case "Recovery": return 180;
            case "Survival": return 208;
            case "Trash": return 289;
            case "Weapons": return 96;
            case "Armor": return 128;
            case "Misc": return 245;
            default: return 245;
        }
        // i18n-ignore-end
    }

    // The word for a crafting category. The id stays as written, so an
    // unlisted (modded) category still reads.
    function categoryLabel(category) {
        const key = 'Thinker.category.' + String(category || '');
        return T.has(key) ? T(key) : String(category || '');
    }

    // Parse recipe from item note (cached: notes are static, so parse each entry once)
    const _recipeCache = new Map();
    function parseRecipe(item) {
        if (!item || !item.note) return null;
        if (_recipeCache.has(item)) return _recipeCache.get(item);
        const match = item.note.match(/<Recipe:\s*(.+?)>/i);
        if (!match) {
            _recipeCache.set(item, null);
            return null;
        }

        const recipe = {};
        const parts = match[1].split(',');

        for (const part of parts) {
            const [id, qty] = part.trim().split('x');
            recipe[parseInt(id)] = parseInt(qty) || 1;
        }

        _recipeCache.set(item, recipe);
        return recipe;
    }

    // Parse category from item note
    function parseCategory(item) {
        // i18n-ignore-start: <Category:> note-tag id, named by categoryLabel()
        if (!item || !item.note) return "Misc";
        const match = item.note.match(/<Category:\s*(.+?)>/i);
        return match ? match[1].trim() : "Misc";
        // i18n-ignore-end
    }

    // Check if item is uncraftable
    function isUncraftable(item) {
        if (!item || !item.note) return false;
        return /<Uncraftable>/i.test(item.note);
    }

    // The recipes a party already has on the first morning. A starter recipe is
    // not learned from anybody and not read off a trade: it is the sort of thing
    // everyone in this world grew up watching being made, so it is legible and
    // buildable at Untrained and stays that way at Master. Written on the entry
    // itself as <StarterRecipe>, so what is common knowledge is a property of the
    // thing rather than a list some plugin has to keep in step.
    function isStarterRecipe(item) {
        if (!item || !item.note) return false;
        return /<StarterRecipe>/i.test(item.note);
    }

    // ---- Database-spanning helpers (items + weapons are craftable here; armor
    // is Blacksmithing's alone) ----
    function isRealEntry(x) {
        return x && x.name && x.name.trim() && !x.name.includes('-->');
    }

    function dbKindOf(item) {
        if (DataManager.isWeapon(item)) return 'w';
        if (DataManager.isArmor(item)) return 'a';
        return 'i';
    }

    function getDbEntry(db, id) {
        if (db === 'w') return $dataWeapons[id];
        if (db === 'a') return $dataArmors[id];
        return $dataItems[id];
    }

    let _allEntriesCache = null;
    let _allEntriesSource = null;
    function allCraftableEntries() {
        // Database arrays are static after load; rebuild only if they were reloaded
        if (_allEntriesCache && _allEntriesSource === $dataItems) return _allEntriesCache;
        const out = [];
        for (const x of $dataItems) if (isRealEntry(x)) out.push(x);
        for (const x of $dataWeapons) if (isRealEntry(x)) out.push(x);
        _allEntriesCache = out;
        _allEntriesSource = $dataItems;
        return out;
    }

    // Check if player has materials for recipe
    function canCraft(recipe) {
        if ($gameSystem && $gameSystem._isSandboxMode) return true;
        if (!recipe) return false;

        for (const [itemId, required] of Object.entries(recipe)) {
            const item = $dataItems[parseInt(itemId)];
            if (!item) return false;
            if ($gameParty.numItems(item) < required) {
                return false;
            }
        }
        return true;
    }

    // ------------------------------------------------------------------------
    // Fabrication - the specialization the workbench runs on
    // ------------------------------------------------------------------------
    // The Thinker is the one menu whose contents are gated by a skill. Every
    // recipe is weighted by how much of a job it is (how many different things
    // go into it, and how many of them), and that weight sorts it into one of
    // five tiers. A party can only assemble up to the tier it has trained to,
    // so the workbench opens up as it is used: bigger recipes, more materials.
    //
    // Below Master an assembly can also botch, which is what makes the early
    // tiers worth training out of rather than a formality. A botch eats half
    // the reagents and still teaches a point.
    const FAB_SPEC = 'Fabrication';  // i18n-ignore  Specialization.json id
    // Upper weight bound of tiers 1-4; anything heavier is tier 5.
    const TIER_WEIGHTS = [8, 10, 14, 20];
    // Botch chance at each Fabrication level, 1 (Untrained) to 5 (Master).
    const FAIL_BY_LEVEL = [0, 0.30, 0.18, 0.10, 0.04, 0];
    const TIER_RISK = 0.2;    // ...multiplied by this much per tier above the first
    const FAIL_CAP = 0.6;
    // What a finished assembly teaches, by tier. A tier-5 build is a lesson.
    const TIER_POINTS = [0, 1, 2, 3, 5, 8];
    const BOTCH_POINTS = 1;
    const SALVAGE_POINTS = 1;
    // A hand that knows the trade wastes less of it: the chance each unit of a
    // reagent is handed back off a finished assembly, by the level of the trade
    // the recipe belongs to (1 Untrained to 5 Master). Read off the trade, not
    // off Fabrication: knowing where a bench is does not save you leather.
    const RECLAIM_BY_LEVEL = [0, 0, 0.10, 0.20, 0.32, 0.45];

    function isSandbox() {
        return !!($gameSystem && $gameSystem._isSandboxMode);
    }

    // 2 x (distinct ingredients) + (total units), cached per entry: notes are
    // static, so a recipe's tier never changes at runtime.
    const _tierCache = new Map();
    function recipeTier(item) {
        if (_tierCache.has(item)) return _tierCache.get(item);
        const recipe = parseRecipe(item);
        let tier = 1;
        if (recipe) {
            const ids = Object.keys(recipe);
            let units = 0;
            for (const id of ids) units += recipe[id] || 1;
            const weight = ids.length * 2 + units;
            tier = TIER_WEIGHTS.findIndex(max => weight <= max) + 1;
            if (tier === 0) tier = TIER_WEIGHTS.length + 1;
        }
        _tierCache.set(item, tier);
        return tier;
    }

    // The member the workbench's party switcher has at the bench. Everything
    // the workbench decides - which tiers are open, how likely a botch is, how
    // much a teardown gives back - is read off THEM, not off the party's best.
    function benchActor() {
        const scene = SceneManager._scene;
        if (scene && typeof scene.fabActor === 'function') {
            const actor = scene.fabActor();
            if (actor) return actor;
        }
        return ($gameParty && $gameParty.leader) ? $gameParty.leader() : null;
    }

    function fabLevel() {
        if (!window.SpecializationXP) return 1;
        return window.SpecializationXP.levelOf(benchActor(), FAB_SPEC);
    }

    // Whether the party is trained enough to attempt this recipe at all. A
    // starter recipe asks for no training at any tier: everybody can already
    // make one.
    function tierMet(item) {
        return isSandbox() || isStarterRecipe(item) || fabLevel() >= recipeTier(item);
    }

    // The name of the tier a recipe wants, for the notice on a locked one.
    function tierLevelName(item) {
        const db = window.Specializations;
        return db && db.levelName ? db.levelName(recipeTier(item)) : String(recipeTier(item));
    }

    function botchChance(item) {
        if (isSandbox()) return 0;
        const base = FAIL_BY_LEVEL[Math.max(1, Math.min(5, fabLevel()))] || 0;
        if (!base) return 0;
        return Math.min(FAIL_CAP, base * (1 + TIER_RISK * (recipeTier(item) - 1)));
    }

    // ------------------------------------------------------------------------
    // What the bench can already read
    // ------------------------------------------------------------------------
    // A blueprint used to be legible only once it had been built, so the book
    // was a record of what the party had done rather than of what they know how
    // to do, and a trained smith opened it on a page of question marks.
    // Training reads it too: every crafting category is one trade, and someone
    // who has trained that trade recognises its work on sight. No two
    // categories answer to the same trade, so a cook reads the food page and
    // nothing else, and how much of their own page they read is their level in
    // it against each recipe's tier: a Beginner recognises tier 1 work, an
    // Intermediate tier 2, a Master the whole page. Training therefore opens
    // the book gradually, exactly as it opens the bench.
    //
    // The names are specialization ids from js/db/Skills/Specialization.json;
    // a category with no entry of its own falls back to Misc's, and weapons and
    // armor answer to the forge whatever category they were filed under.
    // i18n-ignore-start
    const CATEGORY_SPECS = {
        Arctic: 'Igloo Building',
        Armor: 'Armor Smithing',
        Artisan: 'Woodcarving',
        Books: 'Bookbinding',
        Collectibles: 'Antique Restoration',
        Combat: 'Improvised Explosives',
        Component: 'Electronics',
        Counterfeits: 'Counterfeiting',
        Enhancers: 'Alchemy',
        Espionage: 'Electronics',
        Essentials: 'Fabrication',
        Farming: 'Farming',
        Food: 'Cooking',
        Homeopathy: 'Naturopathy',
        Jungle: 'Foraging',
        Lifestyle: 'Carpentry',
        Magic: 'Runecrafting',
        Medical: 'Pharmacology',
        Monsters: 'Taxidermy',
        Plants: 'Herbalism',
        Recovery: 'First Aid',
        Survival: 'Survival',
        Tools: 'Metalworking',
        Trash: 'Maintenance',
        Vehicles: 'Mechanics',
        Weapons: 'Weaponsmithing',
        Misc: 'Manual Tooling'
    };
    const WEAPON_SPEC = 'Weaponsmithing';
    const ARMOR_SPEC = 'Armor Smithing';
    // i18n-ignore-end

    // A category page asks for hundreds of rows and every ask walks the
    // member's class and traits, so levels are read once per redraw.
    let _readCache = new Map();
    function clearRecipeKnowledgeCache() {
        _readCache = new Map();
    }

    function readLevel(specName) {
        if (!window.SpecializationXP) return 1;
        if (_readCache.has(specName)) return _readCache.get(specName);
        const level = window.SpecializationXP.levelOf(benchActor(), specName) || 1;
        _readCache.set(specName, level);
        return level;
    }

    // The one trade a recipe belongs to. An entry may name it outright with the
    // forge's own <Craft:> tag, which is how a thing filed on one shelf is made
    // at another bench: a lockpick sits under Espionage with the rest of the
    // burglar's kit, but it is two bits of steel and a smith makes it. Failing
    // that, the shelf answers for it.
    function recipeSpec(item) {
        const declared = item && item.meta && item.meta.Craft;
        if (declared) return String(declared).trim();
        if (DataManager.isWeapon(item)) return WEAPON_SPEC;
        if (DataManager.isArmor(item)) return ARMOR_SPEC;
        return CATEGORY_SPECS[parseCategory(item)] || CATEGORY_SPECS.Misc;
    }

    // The trade the member reads this recipe with and how far along in it they
    // are, whether or not that is far enough to make anything of the page.
    function readingSpec(item) {
        const name = recipeSpec(item);
        return { name, level: readLevel(name) };
    }

    // How far along the trade a pair of hands has to be before this recipe is
    // legible on sight. A tier is not enough by itself: Untrained is where
    // everyone starts, and a level everyone has cannot be what distinguishes a
    // recipe they recognise from one they do not, so the whole book used to open
    // on its tier-1 half already read. Untrained therefore reveals nothing, and
    // the first tier is a Beginner's to recognise. What the party can make on
    // the first morning is only what is marked <StarterRecipe>.
    function revealLevel(item) {
        return Math.max(2, recipeTier(item));
    }

    // The training that puts this recipe on the page, or null when it does not
    // reach that far.
    function revealingSpec(item) {
        const trade = readingSpec(item);
        return trade.level >= revealLevel(item) ? trade : null;
    }

    // Whether the blueprint reads at all: common knowledge, built once before,
    // or recognised off the trade it belongs to.
    function knowsRecipe(item) {
        if (isSandbox()) return true;
        if (isStarterRecipe(item)) return true;
        if ($gameSystem && $gameSystem.hasCrafted(item.id)) return true;
        return !!revealingSpec(item);
    }

    // A specialization's name as the player reads it.
    function specLabel(name) {
        return (typeof window.translateText === 'function') ? window.translateText(name) : name;
    }

    // ── Shared recipe service ────────────────────────────────────────────────
    // What the workbench knows about a blueprint, offered to any other menu that
    // wants to ask the same questions (the main menu's search page lists what the
    // party could make right now). Every answer is the workbench's own, so the
    // two can never disagree about whether a recipe reads or a sack covers it.
    window.CraftRecipes = {
        // Every item/weapon entry the bench could ever make.
        entries: allCraftableEntries,
        parseRecipe,
        isUncraftable,
        categoryOf: parseCategory,
        tier: recipeTier,
        // The bill is covered by what the party carries.
        hasMaterials: (item) => canCraft(parseRecipe(item)),
        // The blueprint reads at all: common knowledge, built before, or
        // recognised off the trade.
        knows: knowsRecipe,
        // Known to everybody from the first morning, whatever their training.
        isStarter: isStarterRecipe,
        // Trained far enough to attempt it.
        tierMet,
        // Reading, making, and holding the reagents for it, all at once.
        canMakeNow: (item) => {
            const recipe = parseRecipe(item);
            if (!recipe || isUncraftable(item)) return false;
            return knowsRecipe(item) && tierMet(item) && canCraft(recipe);
        },
        // The trade a recipe belongs to, as the player reads it.
        tradeName: (item) => specLabel(recipeSpec(item)),
        clearKnowledgeCache: clearRecipeKnowledgeCache
    };

    function levelLabel(level) {
        const db = window.Specializations;
        return (db && db.levelName) ? db.levelName(level) : String(level);
    }

    // The chance each unit of a reagent survives the assembly and is handed
    // back. Sandbox spends nothing in the first place, so it never applies.
    function reclaimChance(item) {
        if (isSandbox()) return 0;
        return RECLAIM_BY_LEVEL[Math.max(1, Math.min(5, readingSpec(item).level))] || 0;
    }

    // How many pieces come back off a teardown: a practised hand takes a thing
    // apart without ruining half of it, and knowing the trade it was made in
    // is worth as much again as knowing the bench.
    function salvageYield(item) {
        const trade = item ? readingSpec(item).level : 1;
        return 1 + Math.floor(Math.random() * 2)
            + Math.floor((fabLevel() - 1) / 2)
            + Math.floor((trade - 1) / 2);
    }

    // Safe item rarity helper
    function getItemRarity(item) {
        if (window.ItemSystemUtils && typeof window.ItemSystemUtils.getItemRarity === 'function') {
            return window.ItemSystemUtils.getItemRarity(item);
        }
        // i18n-ignore-start: rarity tier ids, mirroring ItemSystemUtils
        if (!item) return { name: "Common" };
        const price = item.price || 0;
        if (price >= 1000000) return { name: "Legendary" };
        if (price >= 100000) return { name: "Epic" };
        if (price >= 10000) return { name: "Rare" };
        if (price >= 1000) return { name: "Uncommon" };
        return { name: "Common" };
        // i18n-ignore-end
    }

    // Whether an entry belongs on the page the player is reading: the Learned
    // book holds only what this member can read, the All book holds everything.
    function passesFilter(item, filter) {
        return filter === 'all' || knowsRecipe(item);
    }

    // Get all available categories with craftable counts, under the filter the
    // book is open at. A category nobody in the party can read yet is left off
    // the Learned page entirely rather than opening onto an empty one.
    function getAvailableCategories(filter) {
        const categories = {};
        for (const item of allCraftableEntries()) {
            if (!parseRecipe(item) || isUncraftable(item)) continue;
            if (!passesFilter(item, filter)) continue;

            const category = parseCategory(item);
            if (!categories[category]) {
                categories[category] = {
                    total: 0,
                    craftable: 0
                };
            }

            categories[category].total++;
            // "Craftable" means the party has the materials AND the training:
            // a recipe above its Fabrication tier does not count.
            if (canCraft(parseRecipe(item)) && tierMet(item)) {
                categories[category].craftable++;
            }
        }
        return categories;
    }

    // Plugin command
    PluginManager.registerCommand(pluginName, 'openThinkerMenu', args => {
        SceneManager.push(window.Scene_Thinker);
    });

    // Add to main menu
    if (showInMenu) {
        const _Window_MenuCommand_addMainCommands = Window_MenuCommand.prototype.addMainCommands;
        Window_MenuCommand.prototype.addMainCommands = function () {
            _Window_MenuCommand_addMainCommands.call(this);

            this.addCommand(menuName, 'thinker', true, 186);
        };

        const _Scene_Menu_createCommandWindow = Scene_Menu.prototype.createCommandWindow;
        Scene_Menu.prototype.createCommandWindow = function () {
            _Scene_Menu_createCommandWindow.call(this);
            this._commandWindow.setHandler('thinker', this.commandThinker.bind(this));
        };

        Scene_Menu.prototype.commandThinker = function () {
            SceneManager.push(window.Scene_Thinker);
        };
    }

    // Save crafted items Progress array
    const _Game_System_initialize = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function () {
        _Game_System_initialize.call(this);
        this._craftedItems = [];
    };

    Game_System.prototype.addCraftedItem = function (itemId) {
        if (!this._craftedItems) this._craftedItems = [];
        if (!this._craftedItems.includes(itemId)) {
            this._craftedItems.push(itemId);
        }
    };

    Game_System.prototype.hasCrafted = function (itemId) {
        if ($gameSystem && $gameSystem._isSandboxMode) return true;
        if (!this._craftedItems) this._craftedItems = [];
        return this._craftedItems.includes(itemId);
    };

    const _DataManager_extractSaveContents = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function (contents) {
        _DataManager_extractSaveContents.call(this, contents);
        if ($gameSystem && !$gameSystem._craftedItems) {
            $gameSystem._craftedItems = [];
        }
    };


    // =============================================================================
    // The bench, offered to the workshop
    // =============================================================================
    // The screen that draws all of this is the workshop in
    // Crafting/BlacksmithingMenu.js: one spread, one header, one tab row, with
    // the bench's Assemble and Disassemble standing beside the forge's own
    // sides of the board. Everything the bench KNOWS still lives here, and the
    // workshop asks for it through window.ThinkerBench; nothing about a recipe
    // is decided twice.

    // Beat a recipe out on the bench. Returns what the workshop has to show for
    // it, or null when the job could not be attempted at all.
    function assembleAt(item) {
        const recipe = parseRecipe(item);
        if (!recipe || !canCraft(recipe) || !tierMet(item)) return null;

        // The hands do the work before anyone knows how it went: an unpractised
        // party ruins the job often enough that the first tiers of Fabrication
        // are worth training out of.
        const botched = Math.random() < botchChance(item);

        // A botch eats half the reagents (rounded up, so a single-unit reagent
        // is always lost) rather than the lot. A hand that knows the trade hands
        // units back off a clean job: cut-offs, the second nail out of a pair,
        // the measure of solder that was never needed.
        const reclaimed = [];
        if (!isSandbox()) {
            const saveOdds = botched ? 0 : reclaimChance(item);
            for (const [ingId, qty] of Object.entries(recipe)) {
                const reagent = $dataItems[parseInt(ingId)];
                const spent = botched ? Math.ceil(qty / 2) : qty;
                $gameParty.loseItem(reagent, spent);
                if (!saveOdds || !reagent) continue;
                let saved = 0;
                for (let i = 0; i < spent; i++) {
                    if (Math.random() < saveOdds) saved++;
                }
                if (saved > 0) {
                    $gameParty.gainItem(reagent, saved);
                    reclaimed.push({ item: reagent, count: saved });
                }
            }
        }

        if (botched) {
            // Nothing to show off, but the workbench still taught something: a
            // ruined batch is how anybody learns.
            if (window.SpecializationXP) window.SpecializationXP.award(FAB_SPEC, BOTCH_POINTS, { actor: benchActor() });
            if (window.ParchmentToast) {
                window.ParchmentToast.show(T('Thinker.botched', { item: item.name }), { severity: 'warning' });
            }
            return { mode: 'botched', items: [] };
        }

        $gameParty.gainItem(item, 1);
        $gameSystem.addCraftedItem(item.id);
        if (window.SpecializationXP) {
            const points = TIER_POINTS[recipeTier(item)] || 1;
            // The bench and the trade both learn from the job: the trade is what
            // put the recipe on the page in the first place, so working it is
            // what opens the rest of it.
            window.SpecializationXP.award(FAB_SPEC, points, { actor: benchActor() });
            window.SpecializationXP.award(recipeSpec(item), points, { actor: benchActor() });
        }
        if (reclaimed.length && window.ParchmentToast) {
            const list = reclaimed.map(r => `${r.item.name} x${r.count}`).join(', ');
            window.ParchmentToast.show(T('Thinker.reclaimed', { items: list }));
        }
        if (window.Diary && window.Diary.onCrafted) window.Diary.onCrafted('bench', item.name, 1);
        return { mode: 'assemble', items: [item] };
    }

    // Take one apart again. How many pieces come back is what training buys on
    // this side of the workbench; a teardown can never hand back more than went
    // into it, so the recipe's own unit count is the ceiling.
    function disassembleAt(item) {
        const recipe = parseRecipe(item);
        if (!recipe || isUncraftable(item) || $gameParty.numItems(item) <= 0) return null;

        $gameParty.loseItem(item, 1);

        const materials = Object.keys(recipe);
        const totalUnits = materials.reduce((sum, id) => sum + (recipe[id] || 1), 0);
        const numReturned = Math.min(salvageYield(item), totalUnits);
        const returnedList = [];
        for (let i = 0; i < numReturned; i++) {
            const matId = materials[Math.floor(Math.random() * materials.length)];
            const matItem = $dataItems[parseInt(matId)];
            if (!matItem) continue;
            $gameParty.gainItem(matItem, 1);
            returnedList.push(matItem);
        }

        if (window.SpecializationXP) {
            window.SpecializationXP.award(FAB_SPEC, SALVAGE_POINTS, { actor: benchActor() });
            window.SpecializationXP.award(recipeSpec(item), SALVAGE_POINTS, { actor: benchActor() });
        }
        return { mode: 'disassemble', items: returnedList };
    }

    // Everything the workshop's Assemble and Disassemble sides need in order to
    // draw the bench without knowing how any of it is decided.
    window.ThinkerBench = {
        spec: FAB_SPEC,
        text: thinkerText,
        entries: allCraftableEntries,
        parseRecipe,
        isUncraftable,
        dbKindOf,
        getDbEntry,
        categoryOf: parseCategory,
        categoryLabel,
        categoryIcon: getCategoryIcon,
        categorySpec: (cat) => CATEGORY_SPECS[cat] || CATEGORY_SPECS.Misc,
        categoriesFor: getAvailableCategories,
        passesFilter,
        knows: knowsRecipe,
        isStarter: isStarterRecipe,
        hasMaterials: (item) => canCraft(parseRecipe(item)),
        tier: recipeTier,
        tierMet,
        tierLevelName,
        botchChance,
        reclaimChance,
        readingSpec,
        revealLevel,
        specLabel,
        levelLabel,
        readLevel,
        rarityOf: getItemRarity,
        isSandbox,
        clearKnowledgeCache: clearRecipeKnowledgeCache,
        assemble: assembleAt,
        disassemble: disassembleAt
    };
})();


/* ============================================================================
 * THE FORGE (was Crafting/BlacksmithingMenu.js)
 * ============================================================================
 * The anvil half of the same workshop. It draws the board every tab of this
 * screen is drawn on, the bench included, which is why the two plugins are one
 * file and one button.
 * ============================================================================
 * The forge
 * ============================================================================
 *
 * ONE BOARD
 * ----------
 * The workshop is a single flat list. There is no mode to pick before anything
 * can be seen and no trade to open before a recipe appears: every recipe in the
 * game stands on one board, the bench's items beside the anvil's gear beside the
 * pieces this party has already beaten out, and two strips of chips filter it.
 *
 *   Status  All / Ready / Short / Untrained / Carried / Forged, with the count
 *           each chip would leave on the board. All is the default; the board
 *           opens on Ready only when there is something under it, so the first
 *           thing on screen is always something the player can act on.
 *   Trade   All trades, then one chip per trade actually on the board under the
 *           open status chip.
 *
 * A row says everything the old two-level board made the player go and look
 * for: what it is, which trade makes it, and one mark for why it is or is not
 * workable - a tick and how many of it the sack could pay for, how many lines
 * of its bill are short, or the tier it is waiting for. What can be worked
 * leads the list, then what is nearly workable ordered by how little it is
 * missing, then the untrained work.
 *
 * The dossier on the right page is never blank: the cursor selects a row as
 * the board is built, and every dossier carries the same two buttons. Make and
 * break, resolved off the PIECE and not off a mode - an item is assembled or
 * salvaged at the bench, a weapon or an armor is forged or melted at the anvil.
 *
 * HOW MANY AT ONCE
 * ----------------
 * Every action takes a count. The stepper above the buttons is capped by
 * whatever the sack can actually pay for (or, for a teardown, by how many are
 * held), so it can never be dialled to a number that would fail. A run is
 * worked one piece at a time: each sword off a run of ten rolls its own
 * quality, each assembly rolls its own botch and its own reclaim, and a botch
 * ends the run there.
 *
 * ONE OF A KIND
 * -------------
 * Nothing leaves this anvil as a copy of a catalogue entry. Each finished piece
 * is registered as its own database entry with its own id (from 2001 up), which
 * is what stops the backpack merging two of them into a stack, and it carries a
 * sheet nobody else's copy has. Three things decide that sheet and one of them
 * is luck: how far past the required tier the smith's trade is trained, how rich
 * the bill that went into the crucible was, and the heat on the day. Every
 * parameter then drifts on its own around it, and the price follows, so a
 * masterwork climbs the rarity ladder by itself.
 *
 * The records live on $gameSystem, not the entries: data/Weapons.json is read
 * fresh on every load, so the entries are written back out of the records the
 * moment a save is read.
 *
 * FINISHES
 * --------
 * The skins the 3D weapon models are already drawn with
 * (Weapon/WeaponSystemProcedural.js) are offered as a strip of swatches on the
 * anvil page. Picking one writes `<ForgeTexture:>` onto the finished piece, and
 * the preview is a promise rather than a suggestion: the seed the model is
 * turned under is rolled once, shown, and then kept on the piece as
 * `<ForgeSeed:>`. A piece with no 3D model of its own wears its finish as the
 * cloth it is laid on.
 *
 * THE CRUCIBLE
 * ------------
 * The Smelt button melts a piece the party is carrying back down into its
 * materials: half the bill, and more than that from a piece that was well made.
 * The recovered amounts are printed against the bill itself, so what the fire
 * gives back is read on the same lines that say what it costs.
 *
 * WHAT AN ENTRY NEEDS
 * -------------------
 * Written onto the entry itself in data/Weapons.json / data/Armors.json, so
 * the item is the authority and no lookup table has to agree with it:
 *
 *   <Recipe: 865x13, 863x5, 866x5, 864x6>   what it is made of
 *   <Craft: Bladesmithing>                  the trade that makes it
 *   <CraftLevel: 5>                         the tier of that trade it needs
 *
 * One trade per entry, always: a thing is made by a smith or by a tailor, not
 * by a committee. `<CraftLevel:>` is derived from price (an entry under 5000
 * gold is tier 1, which anybody Untrained can make) and the three tags are
 * regenerated together by tools/forge/balance_forge_recipes.py.
 *
 * Around 31 trades are in play, so the board is not all hammers: a robe is
 * Tailoring, a wig is Wig Making, a costume is Cosplay, a ring is Jewelry
 * Making, a rifle is Gunsmithing, a circuit-woven coat is Electronics.
 *
 * WHOSE HANDS
 * -----------
 * The party switcher on the right page names who is at the anvil. Everything
 * is read off THEM: which tab an entry falls into, whether the Forge button
 * lights, and who earns the specialization points for the work. Switching
 * member re-sorts the whole board.
 */

(() => {
    'use strict';

    // The legacy plugin name, kept only so the openBlacksmithing command an old
    // event page names still finds a handler. The forge has no parameters of
    // its own any more: it is a section of this plugin.
    const pluginName = 'BlacksmithingMenu';

    const bsText = () => T.obj('Blacksmith');
    const tr = (name) => (typeof window.translateText === 'function' ? window.translateText(name) : name);

    function escapeHtml(str) {
        return String(str == null ? '' : str).replace(/[&<>"']/g, c => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
        ));
    }

    // What a finished piece teaches its maker, by the tier it demanded.
    const TIER_POINTS = [0, 1, 2, 4, 6, 9];

    // The workshop is ONE board. A row's status is the only thing that says
    // why a piece is or is not workable this minute, so the strip above the
    // list filters by status instead of cutting the catalogue into pages the
    // player has to hop between hoping one of them is not empty. All is the
    // default and nothing is ever hidden behind a tab.
    const STATUS_TABS = ['all', 'ready', 'short', 'locked', 'owned', 'forged'];

    // The workshop reads as a shelf of trades on the left and the pieces that
    // trade makes laid out on the right. A piece is picked up off that grid and
    // examined on its own, in a window over the board, which is where every
    // choice about it (its look, its name, how many) is made.
    const GRID_COLS = 4;

    function bench() {
        return window.ThinkerBench || null;
    }

    // An item is the bench's work, a weapon or an armor is the anvil's. Which
    // page a row opens is read off the row itself, never off a mode the player
    // had to choose before they could see anything.
    function isBenchItem(item) {
        return !!item && !DataManager.isWeapon(item) && !DataManager.isArmor(item);
    }

    // Runtime ids for forged pieces start past everything the database and the
    // artifact generator (Crafting/ArctifactGenerator.js, which owns 1501-1600)
    // can ever hand out, and grow one per piece from there.
    const FORGE_ID_BASE = 2001;

    // How much of a bill melting a piece down gives back.
    const SMELT_RATE = 0.5;

    // ------------------------------------------------------------------------
    // Reading the entries
    // ------------------------------------------------------------------------
    function isRealEntry(x) {
        return x && x.name && x.name.trim() && !x.name.includes('-->');
    }

    const _recipeCache = new WeakMap();
    function parseRecipe(item) {
        if (!item || !item.note) return null;
        if (_recipeCache.has(item)) return _recipeCache.get(item);
        const match = item.note.match(/<Recipe:\s*(.+?)>/i);
        let recipe = null;
        if (match) {
            recipe = {};
            for (const part of match[1].split(',')) {
                const [id, qty] = part.trim().split('x');
                const mid = parseInt(id);
                if (mid) recipe[mid] = parseInt(qty) || 1;
            }
        }
        _recipeCache.set(item, recipe);
        return recipe;
    }

    // The trade, as the entry itself declares it.
    function craftSpecName(item) {
        const raw = item && item.meta && item.meta.Craft;
        return raw ? String(raw).trim() : '';
    }

    function craftSpec(item) {
        const name = craftSpecName(item);
        if (!name || !window.Specializations || !window.Specializations.ready) return null;
        return window.Specializations.byName.get(name) || null;
    }

    function craftTier(item) {
        const raw = item && item.meta && item.meta.CraftLevel;
        const n = Number(raw);
        return Number.isFinite(n) && n >= 1 ? Math.min(5, Math.round(n)) : 1;
    }

    let _entriesCache = null;
    let _entriesSource = null;
    function forgeEntries() {
        if (_entriesCache && _entriesSource === $dataWeapons) return _entriesCache;
        const out = [];
        // A forged piece carries its base entry's whole note, recipe and trade
        // included, so it has to be kept off the catalogue explicitly: the board
        // lists what CAN be made, and its own tab lists what already was.
        const catalogue = (x) => isRealEntry(x) && !isForged(x) && parseRecipe(x) && craftSpecName(x);
        for (const x of $dataWeapons) if (catalogue(x)) out.push(x);
        for (const x of $dataArmors) if (catalogue(x)) out.push(x);
        _entriesCache = out;
        _entriesSource = $dataWeapons;
        return out;
    }

    function isSandbox() {
        return !!($gameSystem && $gameSystem._isSandboxMode);
    }

    function hasMaterials(recipe) {
        if (isSandbox()) return true;
        if (!recipe) return false;
        for (const [id, need] of Object.entries(recipe)) {
            const mat = $dataItems[parseInt(id)];
            if (!mat || $gameParty.numItems(mat) < need) return false;
        }
        return true;
    }

    // How many lines of the bill the party cannot cover.
    function missingCount(recipe) {
        if (!recipe || isSandbox()) return 0;
        let short = 0;
        for (const [id, need] of Object.entries(recipe)) {
            const mat = $dataItems[parseInt(id)];
            if (!mat || $gameParty.numItems(mat) < need) short++;
        }
        return short;
    }

    function levelName(level) {
        const db = window.Specializations;
        return (db && db.levelName) ? db.levelName(level) : String(level);
    }

    // What the world's research is worth at this bench. A discovered theory
    // raises the trade it belongs to, so a party that has been reading can
    // start pieces their hands alone have not earned yet
    // (ProceduralTechTree.craftLevelBonus). Zero without that plugin, and zero
    // for a trade no tree feeds.
    function researchTiersIn(spec) {
        const tt = window.ProceduralTechTree;
        if (!spec || !tt || typeof tt.craftLevelBonus !== 'function') return 0;
        try { return tt.craftLevelBonus(spec) || 0; } catch (e) { return 0; }
    }

    // The trade level a given pair of hands has in what an entry asks for:
    // what they have practised, plus what the world has worked out.
    function levelInFor(actor, item) {
        const spec = craftSpec(item);
        if (!spec) return 1;
        const practised = window.SpecializationXP
            ? window.SpecializationXP.levelOf(actor, spec) : 1;
        return practised + researchTiersIn(spec);
    }

    // ── Shared forge service ─────────────────────────────────────────────────
    // The anvil's own answers about a piece, for any menu that wants to ask them
    // (the main menu's search page lists what the party could forge right now).
    // Armor is the forge's alone, so window.CraftRecipes cannot answer for it.
    window.ForgeRecipes = {
        entries: forgeEntries,
        parseRecipe,
        hasMaterials: (item) => hasMaterials(parseRecipe(item)),
        missingCount: (item) => missingCount(parseRecipe(item)),
        tier: craftTier,
        tradeName: craftSpecName,
        // Trained far enough in the trade the piece declares. Sandbox makes
        // anything, the same way the forge itself does.
        canMake: (actor, item) => isSandbox() || levelInFor(actor, item) >= craftTier(item),
        canMakeNow: (actor, item) => (isSandbox() || levelInFor(actor, item) >= craftTier(item)) &&
            hasMaterials(parseRecipe(item))
    };

    // ── Forged pieces ────────────────────────────────────────────────────────
    // Everything that comes off this anvil is one of a kind. Rather than adding
    // to the stack of the catalogue entry it was made from, a forged piece is
    // registered as its own database entry with its own id, so the backpack can
    // never merge two of them and each keeps the sheet it was beaten out with.
    //
    // The record, not the entry, is what the save holds: $dataWeapons is rebuilt
    // from data/ on every load, so the entries are written back into it from the
    // records the moment a save is read.

    function isForged(item) {
        return !!(item && item.meta && item.meta.Forged);
    }

    // A forged piece's name was already written in the player's language when
    // the record was turned into an entry, so running it through the translator
    // a second time could only corrupt it.
    function displayName(item) {
        if (!item) return '';
        return isForged(item) ? item.name : tr(item.name);
    }

    // What this world's smiths have beaten out, kept in the world folder
    // (Dwarf-Fortress style, WorldManager.js) rather than on one save: a piece
    // forged here is an artifact of THIS world, seen by every save of it, the
    // same as its history and its NPCs.
    const FORGE_WORLD_FILE = 'forgedGear';

    function forgeStore() {
        if (window.WorldManager && WorldManager.hasActiveWorld && WorldManager.hasActiveWorld()) {
            const file = WorldManager.getFile(FORGE_WORLD_FILE);
            if (!Array.isArray(file.pieces)) file.pieces = [];
            // A save made before pieces moved into the world folder still
            // carries its own copy on $gameSystem; folded in once so nothing
            // forged before this change is lost, then never read again.
            if ($gameSystem && Array.isArray($gameSystem._forgedPieces) && $gameSystem._forgedPieces.length) {
                const known = new Set(file.pieces.map(r => r.kind + ':' + r.id));
                for (const rec of $gameSystem._forgedPieces) {
                    if (!known.has(rec.kind + ':' + rec.id)) file.pieces.push(rec);
                }
                $gameSystem._forgedPieces = [];
            }
            return file.pieces;
        }
        // No active world yet (title screen previews and the like): fall back
        // to the save so nothing here has to null-check its caller.
        if (!$gameSystem) return [];
        if (!$gameSystem._forgedPieces) $gameSystem._forgedPieces = [];
        return $gameSystem._forgedPieces;
    }

    // The database arrays are indexed by id, and a hole read as `undefined`
    // breaks every plugin that walks them expecting null for an empty slot.
    function padSlots(arr, upTo) {
        while (arr.length <= upTo) arr.push(null);
    }

    function nextForgeId(kind) {
        let max = FORGE_ID_BASE - 1;
        for (const rec of forgeStore()) {
            if (rec.kind === kind && rec.id > max) max = rec.id;
        }
        return max + 1;
    }

    // How many pieces this smith has already stamped with this same base entry,
    // so their sixth knife is not called the same thing as their first.
    function markNumber(rec) {
        let n = 0;
        for (const other of forgeStore()) {
            if (other.kind === rec.kind && other.baseId === rec.baseId && other.smith === rec.smith) n++;
        }
        return n;
    }

    // A forged sheet, in words: five bands across the roll's whole range.
    const QUALITY_BANDS = ['crude', 'sound', 'fine', 'superb', 'masterwork'];
    function qualityBand(quality) {
        const q = Number(quality) || 1;
        if (q < 1.0) return QUALITY_BANDS[0];
        if (q < 1.2) return QUALITY_BANDS[1];
        if (q < 1.4) return QUALITY_BANDS[2];
        if (q < 1.6) return QUALITY_BANDS[3];
        return QUALITY_BANDS[4];
    }
    const qualityLabel = (quality) => T('Blacksmith.quality.' + qualityBand(quality));

    function forgedDisplayName(base, rec) {
        const key = rec.mark > 1 ? 'Blacksmith.forgedNameNumbered' : 'Blacksmith.forgedName';
        // A weapon that was given a name of its own at the anvil wears that
        // instead of its catalogue name; armor still reads as the piece it is.
        const name = (rec.customName && rec.customName.trim()) ? rec.customName.trim() : tr(base.name);
        return T(key, { name, smith: rec.smith, mark: rec.mark });
    }

    // Write one record back into the database as a live entry.
    function materialize(rec) {
        const src = rec.kind === 'w' ? $dataWeapons : $dataArmors;
        const base = src[rec.baseId];
        if (!base || isForged(base)) return null;

        const entry = JSON.parse(JSON.stringify(base));
        entry.id = rec.id;
        entry.params = (rec.params || base.params || []).slice();
        entry.price = rec.price;
        entry.name = forgedDisplayName(base, rec);
        // <Restricted> is the database's word for a row exactly one system
        // hands out (ItemSystemUtils.isRestrictedEntry): every pool builder in
        // the game asks before it accepts a row, so a loot roll, a shop shelf,
        // a vending machine or a picked pocket can never produce a second copy
        // of a piece that is supposed to be the only one of itself.
        entry.note = String(base.note || '') +
            '\n<Restricted>' +
            `\n<Forged: ${rec.smith}>` +
            `\n<ForgeQuality: ${rec.quality}>` +
            `\n<ForgeSeed: ${rec.seed || 0}>` +
            // Lets WeaponSystemProcedural.dispatchIdFor still find a bespoke
            // model or a house finish keyed on the entry this piece was
            // forged from, since materializing gave it a brand new id.
            `\n<ForgeBaseId: ${rec.baseId}>` +
            (rec.texture ? `\n<ForgeTexture: ${rec.texture}>` : '');
        entry.description = String(base.description || '').trim();
        const line = T('Blacksmith.forgedDesc', { smith: rec.smith, quality: qualityLabel(rec.quality) });
        entry.description = entry.description ? entry.description + '\n' + line : line;
        DataManager.extractMetadata(entry);

        padSlots(src, rec.id);
        src[rec.id] = entry;
        return entry;
    }

    function rebuildForged() {
        for (const rec of forgeStore()) materialize(rec);
    }

    // What a piece is worth in materials once the fire has had its share. A
    // forged piece gives back in proportion to how well it was made.
    function smeltYield(item) {
        const recipe = parseRecipe(item);
        if (!recipe) return null;
        const q = isForged(item) ? (Number(item.meta.ForgeQuality) || 1) : 1;
        const out = {};
        let any = false;
        for (const [id, need] of Object.entries(recipe)) {
            const back = Math.min(need, Math.floor(need * SMELT_RATE * q));
            if (back > 0) { out[id] = back; any = true; }
        }
        // A bill of single units rounds away to nothing, which makes the
        // crucible look broken. One unit of the cheapest line always survives
        // the fire, so melting a piece down is a loss and never a waste. No
        // recipe in the game is a single line of one, so this can never hand
        // back everything that went in.
        if (!any) {
            let cheapest = null;
            for (const id of Object.keys(recipe)) {
                const mat = $dataItems[parseInt(id)];
                if (!mat) continue;
                if (!cheapest || (mat.price || 0) < (cheapest.price || 0)) cheapest = mat;
            }
            if (cheapest) out[cheapest.id] = 1;
        }
        return out;
    }

    // How rich the bill is, averaged over every unit that goes in: a blade beaten
    // out of crystal and titanium starts better than one beaten out of bone.
    function materialRichness(recipe) {
        let worth = 0;
        let units = 0;
        for (const [id, need] of Object.entries(recipe || {})) {
            const mat = $dataItems[parseInt(id)];
            if (!mat) continue;
            worth += (mat.price || 0) * need;
            units += need;
        }
        if (!units) return 0;
        return Math.max(0, Math.min(1, (worth / units) / 500));
    }

    // The sheet a piece comes off the anvil with. Factors: crafting specialization,
    // weapon proficiency, material richness, and the D20 forge strike roll.
    async function rollQuality(actor, item) {
        const mastery = Math.max(0, Math.min(4, levelInFor(actor, item) - craftTier(item)));
        const richness = materialRichness(parseRecipe(item));
        const wpnProf = (window.WeaponProficiency && DataManager.isWeapon(item) && actor)
            ? window.WeaponProficiency.levelFor(actor, item) : 1;
        const statMod = actor ? Math.floor(((actor.atk || 10) - 10) / 2) : 0;

        let rollVal = 10;
        let nat1 = false;
        let nat20 = false;

        if (window.Dice3D) {
            const res = await window.Dice3D.rollD20({
                actionName: 'Anvil Forging',
                statName: 'STR/CRAFT',
                modifier: mastery + statMod
            });
            rollVal = res.roll;
            nat1 = res.nat1;
            nat20 = res.nat20;
        } else {
            rollVal = Math.floor(Math.random() * 20) + 1;
            nat1 = (rollVal === 1);
            nat20 = (rollVal === 20);
        }

        if (nat1) {
            // Automatic Critical Failure: flawed/cracked forge
            return 0.68;
        }
        if (nat20) {
            // Automatic Critical Success: Masterwork piece
            return Math.round((1.40 + 0.08 * mastery + 0.15 * richness) * 100) / 100;
        }

        const q = 0.80 + 0.07 * mastery + 0.04 * (wpnProf - 1) + 0.15 * richness + (rollVal / 20) * 0.28;
        return Math.round(q * 100) / 100;
    }

    // Every parameter drifts on its own around that sheet, so two pieces off the
    // same bill by the same hands are still not the same piece.
    function rollParams(item, quality) {
        const out = (item.params || []).slice();
        // Scaling alone is invisible on the low end of the catalogue, where a
        // knife's whole sheet is a 1 and a 3 and a fifteen percent roll rounds
        // straight back to where it started. The grade is a flat point or four
        // on top, so a masterwork reads as one at every tier.
        const grade = Math.max(0, Math.round((quality - 1) * 5));
        for (let i = 0; i < out.length; i++) {
            const v = out[i] || 0;
            if (!v) continue;
            const drift = quality * (0.92 + Math.random() * 0.16);
            const rolled = Math.round(v * drift) + (v > 0 ? grade : -grade);
            out[i] = rolled || (v > 0 ? 1 : -1);
        }
        return out;
    }

    // ── Finishes ─────────────────────────────────────────────────────────────
    // The skins the 3D weapon models are already drawn with
    // (Weapon/WeaponSystemProcedural.js), offered as a choice at the anvil. The
    // class-specific run comes first, then everything else, so the swatches a
    // sword usually wears are the ones under the thumb.
    function finishClass(item) {
        if (!DataManager.isWeapon(item)) return 'default';
        const w = item.wtypeId || 1;
        if (w === 9 || w === 8) return 'gun';
        if (w === 1 || w === 2 || w === 10) return 'blade';
        if (w === 3 || w === 4) return 'heavy';
        if (w === 6) return 'magic';
        if (w === 7 || w === 12) return 'wood';
        return 'default';
    }

    function finishesFor(item) {
        const P = window.WeaponSystemProcedural;
        if (!P || !P.getTexturesForType) return [];
        const seen = new Set();
        const out = [];
        // The class run first, then the dream bank: the strange sheets are a
        // choice a smith makes on purpose, so they sit at the end of the tray
        // rather than in among the marbles.
        for (const f of P.getTexturesForType(finishClass(item)) || []) {
            if (!seen.has(f)) { seen.add(f); out.push(f); }
        }
        for (const f of P.getTexturesForType('dream') || []) {
            if (!seen.has(f)) { seen.add(f); out.push(f); }
        }
        return out;
    }

    function finishSrc(filename) {
        const P = window.WeaponSystemProcedural;
        if (P && P.texturePath) return P.texturePath(filename);
        return `img/textures/${filename}`;
    }

    // ── Names ────────────────────────────────────────────────────────────────
    // A weapon coming off the anvil earns its own name, not a found relic's:
    // separate banks from the artifact generator's (Crafting/ArctifactGenerator.js),
    // picked by the same class the finish picker uses (finishClass), so a blade
    // reads like a blade and a gun like a gun.
    function randomForgedName(item) {
        const cls = finishClass(item);
        const prefixes = T.pool('Blacksmith.nameBank.' + cls + '.prefix');
        const nouns = T.pool('Blacksmith.nameBank.' + cls + '.noun');
        if (!prefixes.length || !nouns.length) return '';
        const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
        const noun = nouns[Math.floor(Math.random() * nouns.length)];
        return `${prefix} ${noun}`;
    }

    // Records outlive the database entries built from them, so a loaded save has
    // to put its forged pieces back before anything asks the party what it holds.
    const _DataManager_extractSaveContents = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function (contents) {
        _DataManager_extractSaveContents.call(this, contents);
        rebuildForged();
    };

    window.ForgedPieces = {
        all: forgeStore,
        isForged,
        rebuild: rebuildForged,
        quality: (item) => (isForged(item) ? (Number(item.meta.ForgeQuality) || 1) : 0),
        smeltYield
    };

    function rarityOf(item) {
        if (window.ItemSystemUtils && window.ItemSystemUtils.getItemRarity) {
            return window.ItemSystemUtils.getItemRarity(item);
        }
        return { name: 'Common' };  // i18n-ignore  rarity id
    }

    // Money is always euros, the same split MoneyFormatter draws.
    function money(gold) {
        if (window.ParchmentToast && window.ParchmentToast.money) return window.ParchmentToast.money(gold);
        return String(Math.round(gold || 0));
    }

    function iconStyle(iconIndex, size) {
        const idx = Number(iconIndex) || 0;
        const s = size || 32;
        return `background:url('img/system/IconSet.png') -${(idx % 16) * s}px -${Math.floor(idx / 16) * s}px no-repeat;` +
            (s !== 32 ? `background-size:${s * 16}px auto;` : '') +
            `width:${s}px;height:${s}px;display:inline-block;`;
    }

    // ========================================================================
    // Scene_Blacksmithing
    // ========================================================================
    class Scene_Blacksmithing extends Scene_MenuBase {
        create() {
            super.create();
            if (this._helpWindow) { this._helpWindow.deactivate(); this._helpWindow.hide(); }

            this._status = 'all';         // which chip of the strip is lit
            this._statusIndex = 0;
            this._trade = '';             // '' is every trade
            this._tradeIndex = 0;
            this._activeArea = 'items';   // trades | status | items | finish | forge | smelt
            this._modalOpen = false;      // is a piece open in its own window
            this._itemIndex = 0;
            this._selectedItem = null;
            this._smithIndex = 0;
            this._overlayTimer = 0;
            this._overlayData = null;
            this._listDirty = true;
            this._finishes = {};          // base entry -> chosen skin, this visit
            this._finishIndex = 0;
            this._qty = 1;

            // The shared search + filter strip (UI/MenuSearchBar.js), in the
            // workshop's vocabulary: pieces belong to trades and carry a weight
            // and a price; nothing here has a level or a cast cost.
            this._forgeBar = window.MenuSearchBar ? window.MenuSearchBar.create({
                id: 'forge',
                placeholder: T('Blacksmith.searchPlaceholder'),
                sorts: ['name', 'weight', 'price'],
                onChange: () => {
                    this._itemIndex = 0;
                    this._listDirty = true;
                    this._selectedItem = this.listItems()[0] || null;
                    this.refreshForge();
                    if (this._forgeBar) this._forgeBar.restoreFocus();
                }
            }) : null;

            const b = bench();
            if (b) b.clearKnowledgeCache();
            // The board opens on whatever these hands can make this minute,
            // and on the whole catalogue if that is nothing, so the first thing
            // on screen is always something the player can act on. The cursor
            // starts on the list itself, not on a strip of filters.
            this._status = this.boardCounts().ready > 0 ? 'ready' : 'all';
            this._qty = 1;
            this.selectRow(0);

            this.createLayout();
            this.refreshForge();
            if (window.CharSwitcher) {
                window.CharSwitcher.installTabKey(this, (dir) => this.cycleSmith(dir));
            }
        }

        update() {
            // A focused search field or the name box owns the keyboard.
            const typing = (window.MenuSearchBar && window.MenuSearchBar.isTyping()) ||
                (document.activeElement && document.activeElement.id === 'forge-name-input');
            if (!typing) this.updateForgeInput();
            super.update();
        }

        terminate() {
            if (this._forgeBar) { this._forgeBar.dispose(); this._forgeBar = null; }
            this.dispose3D();
            const c = document.getElementById('blacksmith-container');
            if (c) c.remove();
            if (window.CharSwitcher) window.CharSwitcher.removeTabKey(this);
            if (window.SpecBadge) window.SpecBadge.hide();
            super.terminate();
        }

        // -------------------------------------------------- who is at the anvil
        smithMembers() {
            return ($gameParty && $gameParty.members) ? $gameParty.members() : [];
        }

        smith() {
            const members = this.smithMembers();
            if (!members.length) return null;
            return members[Math.max(0, Math.min(members.length - 1, this._smithIndex || 0))];
        }

        selectSmith(index) {
            const members = this.smithMembers();
            if (!members.length) return;
            const next = ((index % members.length) + members.length) % members.length;
            if (next === this._smithIndex) return;
            this._smithIndex = next;
            SoundManager.playCursor();
            // Another pair of hands re-sorts the whole board: a piece this
            // member cannot make has moved to the other tab, and a whole trade
            // can leave the open tab with it.
            this._listDirty = true;
            this._selectedItem = null;
            this._itemIndex = 0;
            if (this._trade && !this.trades().some(r => r.key === this._trade)) {
                this._trade = '';
                this._tradeIndex = 0;
                this._listDirty = true;
            }
            this.selectRow(this._itemIndex);
            this.refreshForge();
        }

        cycleSmith(dir) { this.selectSmith((this._smithIndex || 0) + dir); }

        // The bench asks the open scene whose hands are on it
        // (Quest/ThinkerMenu.js benchActor), so the two sides of the workshop
        // are always worked by the same member.
        fabActor() { return this.smith(); }

        // Kept because the detail pages ask it, but it is now a question
        // about the SELECTED PIECE and not about a mode: an item is bench work,
        // a weapon or an armor is anvil work.
        isBenchSide() { return isBenchItem(this._selectedItem); }

        // The selected member's level in the trade an entry needs.
        levelIn(item) {
            return levelInFor(this.smith(), item);
        }

        canMake(item) {
            return isSandbox() || this.levelIn(item) >= craftTier(item);
        }

        // -------------------------------------------------------------- board
        // Every recipe in the game on one board: the bench's items, the anvil's
        // gear, and the pieces this party has already beaten out. There is no
        // side of the workshop to pick first, so nothing it can do is ever more
        // than one chip away.
        allEntries() {
            if (this._entriesCache) return this._entriesCache;
            const b = bench();
            const out = [];
            if (b) {
                for (const e of b.entries()) {
                    if (b.parseRecipe(e) && !b.isUncraftable(e)) out.push(e);
                }
            }
            for (const e of forgeEntries()) out.push(e);
            for (const e of this.forgedOwned()) out.push(e);
            this._entriesCache = out;
            return out;
        }

        // The pieces this party is carrying that came off an anvil, newest
        // first, so the last thing made is the first thing on the board.
        forgedOwned() {
            const out = [];
            for (const rec of forgeStore()) {
                const src = rec.kind === 'w' ? $dataWeapons : $dataArmors;
                const entry = src[rec.id];
                if (entry && $gameParty.numItems(entry) > 0) out.push(entry);
            }
            return out.reverse();
        }

        // Why a row is where it is, in one word. This is the whole answer the
        // player needs, and it is printed on the row itself rather than implied
        // by which page they happened to land on.
        statusOf(item) {
            if (isForged(item)) return 'forged';
            const b = bench();
            if (isBenchItem(item)) {
                if (!b) return 'locked';
                if (!b.knows(item) || !b.tierMet(item)) return 'locked';
                return b.hasMaterials(item) ? 'ready' : 'short';
            }
            if (!this.canMake(item)) return 'locked';
            return hasMaterials(parseRecipe(item)) ? 'ready' : 'short';
        }

        // The forge's old three buckets, in the three words the whole board
        // now speaks.
        bucketOf(item) {
            const s = this.statusOf(item);
            return s === 'short' ? 'materials' : s;
        }

        recipeOf(item) {
            const b = bench();
            return (isBenchItem(item) && b) ? b.parseRecipe(item) : parseRecipe(item);
        }

        // How many lines of the bill are short, which is what sorts one
        // unworkable row above another: the piece you are one ingot away from
        // leads the list.
        shortfall(item) {
            return missingCount(this.recipeOf(item) || {});
        }

        // The trade a row answers to, in one vocabulary for both halves of the
        // workshop: the anvil declares its trade on the entry, each of the
        // bench's shelves belongs to one.
        tradeOf(item) {
            const b = bench();
            // The entry is the authority: a lockpick is filed on the burglar's
            // shelf but it is beaten out by a smith, and the chip has to agree
            // with the trade the dossier asks for.
            if (isBenchItem(item) && b) return b.readingSpec(item).name;
            return craftSpecName(item);
        }

        tradeLabelOf(name) {
            const b = bench();
            return b ? b.specLabel(name) : tr(name);
        }

        matchesStatus(item, status) {
            if (status === 'all') return true;
            if (status === 'owned') return $gameParty.numItems(item) > 0;
            return this.statusOf(item) === status;
        }

        // ONE pass over the catalogue builds everything the page draws: the
        // number behind every chip, the trades actually on offer under the open
        // chip, and the rows themselves. Walking a thousand entries once per
        // chip is what made the old board slow to redraw.
        board() {
            const qkey = this._forgeBar ? String(this._forgeBar.query || '') : '';
            const key = this._status + '|' + this._trade + '|' + this._smithIndex + '|' + qkey;
            if (!this._listDirty && this._boardKey === key && this._board) return this._board;
            if (this._listDirty) this._entriesCache = null;
            const b = bench();
            if (b) b.clearKnowledgeCache();

            const counts = { all: 0, ready: 0, short: 0, locked: 0, owned: 0, forged: 0 };
            const trades = new Map();
            const seen = new Map();
            const pool = [];
            for (const item of this.allEntries()) {
                const status = this.statusOf(item);
                seen.set(item, status);
                counts.all++;
                if (counts[status] !== undefined) counts[status]++;
                if ($gameParty.numItems(item) > 0) counts.owned++;
                // The shelf of trades is the whole catalogue's, not the open
                // chip's: which methods exist and how much of each one this
                // member can read is a fact about them, and it must not shuffle
                // under the cursor every time a filter is touched.
                const tk = this.tradeOf(item);
                if (!trades.has(tk)) {
                    trades.set(tk, { key: tk, label: this.tradeLabelOf(tk), total: 0, known: 0, ready: 0 });
                }
                const row = trades.get(tk);
                row.total++;
                if (status !== 'locked') row.known++;
                if (status === 'ready') row.ready++;
                if (!this.matchesStatus(item, this._status)) continue;
                if (!this._trade || tk === this._trade) pool.push(item);
            }

            // What can be worked leads, then what is nearly workable, ordered by
            // how few lines of its bill are missing, and the untrained work last.
            const rank = { ready: 0, forged: 0, short: 1, locked: 2 };
            const shorts = new Map();
            pool.sort((x, y) => {
                const rx = rank[seen.get(x)], ry = rank[seen.get(y)];
                if (rx !== ry) return (rx === undefined ? 3 : rx) - (ry === undefined ? 3 : ry);
                if (rx === 1) {
                    if (!shorts.has(x)) shorts.set(x, this.shortfall(x));
                    if (!shorts.has(y)) shorts.set(y, this.shortfall(y));
                    const d = shorts.get(x) - shorts.get(y);
                    if (d) return d;
                }
                return displayName(x).localeCompare(displayName(y));
            });

            // Last word goes to the search strip, so the page and the cursor are
            // indexed against the same, already-filtered list.
            const items = this._forgeBar ? this._forgeBar.apply(pool, item => ({
                name: displayName(item),
                category: this.tradeOf(item),
                weight: (window.ItemSystemUtils && window.ItemSystemUtils.getItemWeight
                    ? window.ItemSystemUtils.getItemWeight(item) : 0) / 1000,
                price: (item.price || 0) / 100
            })) : pool;

            this._board = {
                counts: counts,
                status: seen,
                trades: Array.from(trades.values()).sort((a, b2) => a.label.localeCompare(b2.label)),
                items: items
            };
            this._boardKey = key;
            this._listDirty = false;
            return this._board;
        }

        boardCounts() { return this.board().counts; }
        trades() { return this.board().trades; }
        listItems() { return this.board().items; }
        // The three action methods still ask for the visible list under this
        // name, and the list is the same list.
        itemsForTrade() { return this.listItems(); }

        setStatus(key) {
            if (this._status === key || STATUS_TABS.indexOf(key) < 0) return;
            this._status = key;
            this._statusIndex = STATUS_TABS.indexOf(key);
            this._listDirty = true;
            this._itemIndex = 0;
            // A trade with nothing under the new chip would filter the board
            // down to nothing, so it is let go rather than left to blank the page.
            if (this._trade && !this.trades().some(r => r.key === this._trade)) {
                this._trade = '';
                this._tradeIndex = 0;
                this._listDirty = true;
            }
            this.selectRow(0);
            SoundManager.playOk();
            this.refreshForge();
        }

        setTrade(key) {
            if (this._trade === key) return;
            this._trade = key;
            this._listDirty = true;
            this._itemIndex = 0;
            const rows = this.trades();
            const at = rows.findIndex(r => r.key === key);
            this._tradeIndex = key && at >= 0 ? at + 1 : 0;
            this.selectRow(0);
            SoundManager.playOk();
            this.refreshForge();
        }

        // Moving the cursor onto a row: the dossier follows it immediately, so
        // the right page is never blank and never stale.
        selectRow(index) {
            const items = this.listItems();
            if (!items.length) { this._selectedItem = null; this._itemIndex = 0; return; }
            this._itemIndex = Math.max(0, Math.min(items.length - 1, index));
            const next = items[this._itemIndex];
            if (next !== this._selectedItem) {
                this._selectedItem = next;
                this._qty = 1;
                this._finishIndex = 0;
            }
        }

        // -------------------------------------------------- how many, at once
        // A bench that can only ever make one of a thing turns a sack of ore
        // into a hundred button presses. Every action on this page takes a
        // count, and the count is capped by what the sack can actually pay for.
        batchCap(item) {
            const recipe = this.recipeOf(item);
            if (!recipe || isForged(item)) return 0;
            if (isSandbox()) return 99;
            let cap = 99;
            for (const [id, need] of Object.entries(recipe)) {
                const mat = $dataItems[parseInt(id)];
                if (!mat || need <= 0) continue;
                cap = Math.min(cap, Math.floor($gameParty.numItems(mat) / need));
            }
            return Math.max(0, cap);
        }

        // Taking a thing apart is capped by how many of it the party is holding.
        breakCap(item) {
            return item ? $gameParty.numItems(item) : 0;
        }

        // Which cap the stepper answers to depends on which of the two buttons
        // the cursor is standing on: make, or break.
        activeCap() {
            const item = this._selectedItem;
            if (!item) return 0;
            if (this._activeArea === 'smelt') return this.breakCap(item);
            if (this._activeArea === 'forge') return this.batchCap(item);
            return Math.max(this.batchCap(item), this.breakCap(item));
        }

        qty() {
            const cap = Math.max(1, this.activeCap());
            return Math.max(1, Math.min(cap, this._qty || 1));
        }

        setQty(n) {
            const cap = Math.max(1, this.activeCap());
            const next = Math.max(1, Math.min(cap, n));
            if (next === (this._qty || 1)) return;
            this._qty = next;
            SoundManager.playCursor();
            this.refreshForge();
        }

        // ----------------------------------------------------------------- DOM
        createLayout() {
            if (!document.getElementById('blacksmith-container')) {
                const el = document.createElement('div');
                el.id = 'blacksmith-container';
                document.body.appendChild(el);
            }
        }

        refreshForge() {
            const container = document.getElementById('blacksmith-container');
            if (!container) return;
            const t = bsText();
            // A bench page asks for hundreds of levels and a level walks the
            // member's class and traits; they cannot change inside one redraw,
            // so they are read once for it.
            if (bench()) bench().clearKnowledgeCache();

            let spread = container.querySelector('.book-spread');
            if (!spread) {
                container.innerHTML = `
                    <div class="book-spread">
                        <div id="forge-overlay-container"></div>
                        <div class="left-page">
                            <div class="page-header-bar forge-header">
                                <div class="back-button focusable" tabindex="0" id="forge-back">${escapeHtml(T('Blacksmith.back'))}</div>
                                <h2 class="title">${escapeHtml(bench() ? T('Blacksmith.workshopTitle') : t.title)}</h2>
                            </div>
                            <div class="left-header"><span class="category-name">${escapeHtml(T('Blacksmith.methods'))}</span></div>
                            <div class="list-viewport" id="forge-trades"></div>
                        </div>
                        <div class="right-page">
                            <div id="forge-companion-row" class="companion-switcher companion-switcher--header"></div>
                            <div id="forge-search-slot"></div>
                            <div id="forge-tabs"></div>
                            <div class="list-viewport" id="forge-list"></div>
                        </div>
                        <div id="forge-modal"></div>
                    </div>`;
                spread = container.querySelector('.book-spread');
                spread.addEventListener('click', (e) => this.onSpreadClick(e));
                // The name field is typed into directly, so its value is read
                // off the DOM as it changes rather than pushed through a
                // re-render, which would blow away the cursor position mid-word.
                spread.addEventListener('input', (e) => {
                    if (e.target && e.target.id === 'forge-name-input' && this._selectedItem) {
                        this.setName(this._selectedItem, e.target.value);
                    }
                });
                // The wheel turns whichever thing the pointer is over: the shelf
                // of trades, the grid of pieces, or the dossier in the window
                // over them. Sending every wheel event to one list is what left
                // the other pages stuck.
                container.addEventListener('wheel', (e) => {
                    const under = e.target && e.target.closest
                        ? e.target.closest('.ui-detail-scroll, .list-viewport') : null;
                    const target = under || container.querySelector('#forge-list');
                    if (target) target.scrollTop += e.deltaY;
                });
            }

            this.renderSwitcher();
            this.renderTrades();
            this.renderFilters();
            this.renderList();
            this.renderDetail();
            this.renderOverlay();

            if (window.SpecBadge) {
                // The forge reports the trade the selected piece is made in; the
                // bench reports Fabrication, which is what gates its tiers.
                // The badge reports the trade of the piece under the cursor,
                // whichever half of the workshop makes it.
                const spec = this._selectedItem ? this.tradeOf(this._selectedItem) : null;
                if (spec) window.SpecBadge.show(spec, { actor: this.smith() });
                else window.SpecBadge.hide();
            }
        }

        renderSwitcher() {
            const row = document.getElementById('forge-companion-row');
            if (!row || !window.CharSwitcher) return;
            // The switcher heads the page in place of its old title, so it is
            // drawn even for a party of one: the single name says whose hands
            // the skill badge underneath is reporting.
            const members = this.smithMembers();
            let tabs = '';
            members.forEach((m, idx) => {
                const sel = idx === (this._smithIndex || 0) ? 'selected' : '';
                tabs += `<div class="companion-tab ${sel}" data-smith="${idx}">${escapeHtml(m.name())}</div>`;
            });
            row.innerHTML = window.CharSwitcher.inner(
                `<div class="companion-tabs-row">${tabs}</div>`, members.length);
        }

        // The shelf of production methods, one row per trade: its name and how
        // much of it these hands can actually read, against everything the
        // world knows how to make in it. This is the whole left page, and it is
        // the only thing the player picks before they are looking at pieces.
        renderTrades() {
            const el = document.getElementById('forge-trades');
            if (!el) return;
            const t = bsText();
            const rows = this.trades();
            const counts = this.boardCounts();

            const row = (key, label, known, total, idx) => {
                const active = this._trade === key ? 'active' : '';
                const focused = (this._activeArea === 'trades' && this._tradeIndex === idx) ? 'focused' : '';
                return `
                    <div class="category-row forge-trade-row focusable ${active} ${focused}" tabindex="0" data-trade="${escapeHtml(key)}">
                        <div class="category-meta-left"><span class="category-name">${escapeHtml(label)}</span></div>
                        <div class="category-meta-left"><span class="forge-known-count">${known}<span class="forge-known-of">/${total}</span></span></div>
                    </div>`;
            };

            let html = row('', t.allTrades, counts.all - (counts.locked || 0), counts.all, 0);
            rows.forEach((r, idx) => { html += row(r.key, r.label, r.known, r.total, idx + 1); });
            el.innerHTML = html;

            const focus = el.querySelector('.forge-trade-row.focused');
            if (focus) focus.scrollIntoView({ block: 'nearest' });
        }

        // What state a piece is in, over the grid it filters. The trade strip
        // that used to sit beside it is the left page now.
        renderFilters() {
            const el = document.getElementById('forge-tabs');
            if (!el) return;
            const counts = this.boardCounts();

            const chip = (label, active, focused, attr) =>
                `<div class="backpack-tab focusable ${active ? 'active' : ''} ${focused ? 'focused' : ''}" tabindex="0" ${attr}>${escapeHtml(label)}</div>`;

            const statusRow = STATUS_TABS.map((key, idx) => chip(
                T('Blacksmith.status.' + key) + ' (' + (counts[key] || 0) + ')',
                this._status === key,
                this._activeArea === 'status' && this._statusIndex === idx,
                'data-status="' + key + '"')).join('');

            el.innerHTML = `<div class="backpack-tabs">
                    <div class="backpack-tabs-row">${statusRow}</div>
                </div>`;

            // The search strip is redrawn with the chips under it, then handed
            // its caret back.
            const searchSlot = document.getElementById('forge-search-slot');
            if (searchSlot && this._forgeBar) {
                searchSlot.innerHTML = this._forgeBar.html();
                this._forgeBar.restoreFocus();
            }
        }

        // The pieces the chosen trade makes, laid out as a grid of cards. The
        // grid is mounted in a window (UI/MenuVirtualList.js) a ROW at a time,
        // so a shelf of two thousand pieces still costs only the cards on
        // screen. Cell clicks are read off the spread by delegation
        // (onSpreadClick), so a card swapped in mid-scroll needs no wiring.
        renderList() {
            const el = document.getElementById('forge-list');
            if (!el) return;
            const t = bsText();
            const board = this.board();
            const items = board.items;

            if (!items.length) {
                window.MenuVirtualList.render(el, {
                    key: `empty|${this._status}|${this._trade}`,
                    count: 1,
                    renderItem: () => `<div class="ui-empty"><span class="ui-empty-text">${escapeHtml(t.noRecipes)}</span></div>`
                });
                return;
            }

            this._itemIndex = Math.max(0, Math.min(items.length - 1, this._itemIndex));
            const rows = Math.ceil(items.length / GRID_COLS);
            const focusedRow = this._activeArea === 'items' ? Math.floor(this._itemIndex / GRID_COLS) : -1;

            window.MenuVirtualList.render(el, {
                key: `${this._status}|${this._trade}|${this._smithIndex}|${this._forgeBar ? this._forgeBar.query : ''}`,
                count: rows,
                renderItem: r => {
                    let cells = '';
                    for (let c = 0; c < GRID_COLS; c++) {
                        const idx = r * GRID_COLS + c;
                        if (idx >= items.length) break;
                        const item = items[idx];
                        cells += this.cellHTML(item, idx,
                            this._activeArea === 'items' && idx === this._itemIndex,
                            board.status.get(item));
                    }
                    return `<div class="forge-grid-row">${cells}</div>`;
                }
            });
            if (focusedRow >= 0) window.MenuVirtualList.scrollToIndex(el, focusedRow);
        }

        // One card shape for the whole workshop: what it is, which trade makes
        // it, and the one mark that says why it is or is not workable. An
        // undiscovered bench formula still holds its place on the shelf, so the
        // grid reads as a thing to fill rather than as a thing that is missing.
        cellHTML(item, idx, focused, status) {
            const b = bench();
            const held = $gameParty.numItems(item);
            const kind = DataManager.isWeapon(item) ? 'w' : (DataManager.isArmor(item) ? 'a' : 'i');
            const hidden = isBenchItem(item) && b && !b.knows(item);

            let mark;
            if (status === 'forged') {
                mark = `<span class="forge-quality-mark">${escapeHtml(qualityLabel(item.meta.ForgeQuality))}</span>`;
            } else if (status === 'locked') {
                mark = `<span class="forge-tier-need">${escapeHtml(
                    isBenchItem(item) && b ? b.tierLevelName(item) : levelName(craftTier(item)))}</span>`;
            } else if (status === 'short') {
                mark = `<span class="forge-mat-state short">&#10006; ${escapeHtml(
                    T('Blacksmith.shortBy', { n: this.shortfall(item) }))}</span>`;
            } else {
                const cap = this.batchCap(item);
                mark = `<span class="forge-mat-state ok">&#10004;${cap > 1 ? ' &times;' + cap : ''}</span>`;
            }
            // What the sack is already holding rides alongside the mark, so the
            // Carried chip and the Salvage button never disagree with the card.
            const carried = held > 0 ? `<span class="forge-quality-mark">&times;${held}</span>` : '';

            const name = hidden
                ? `<span class="blueprint-name-locked">${escapeHtml(b.text().blueprintLocked)}</span>`
                : `<span class="blueprint-name ${window.ItemSystemUtils.rarityClass(
                       isBenchItem(item) && b ? b.rarityOf(item) : rarityOf(item))}">${escapeHtml(displayName(item))}</span>`;
            const icon = hidden
                ? `<span class="blueprint-icon-locked">?</span>`
                : `<span class="menu-icon menu-icon--32" style="--icon-col:${item.iconIndex % 16};--icon-row:${Math.floor(item.iconIndex / 16)}"></span>`;

            const rarity = window.ItemSystemUtils.rarityClass(
                isBenchItem(item) && b ? b.rarityOf(item) : rarityOf(item));

            return `
                <div class="item-slot forge-slot focusable ${focused ? 'selected focused' : ''} ${status}" tabindex="0" data-item="${item.id}" data-kind="${kind}" data-idx="${idx}">
                    <div class="item-rarity-bar ${rarity}"></div>
                    <div class="item-slot-icon">${icon}</div>
                    <div class="item-slot-info">
                        <div class="item-slot-name">${name}</div>
                        <div class="item-slot-meta">
                            <span class="forge-slot-mark">${carried}${mark}</span>
                        </div>
                    </div>
                </div>`;
        }

        // ------------------------------------------------- the piece's window
        // A piece picked up off the grid is examined on its own, in a window
        // over the board: its model, its name, its finish, its bill and the two
        // buttons. Nothing about a piece is decided anywhere else, and closing
        // the window puts the cursor back on the card it was opened from.
        openPiece(index) {
            this.selectRow(index);
            if (!this._selectedItem) { SoundManager.playBuzzer(); return; }
            this._modalOpen = true;
            this._activeArea = this.hasFinishes() ? 'finish' : this.firstButtonArea();
            SoundManager.playOk();
            this.refreshForge();
        }

        closePiece() {
            if (!this._modalOpen) return;
            this._modalOpen = false;
            this._activeArea = 'items';
            SoundManager.playCancel();
            this.refreshForge();
        }

        renderDetail() {
            const el = document.getElementById('forge-modal');
            if (!el) return;
            const item = this._selectedItem;

            if (!this._modalOpen || !item) {
                this.dispose3D();
                el.innerHTML = '';
                el.classList.remove('open');
                return;
            }
            el.classList.add('open');

            const inner = (this.isBenchSide() && bench())
                ? this.benchDetailHTML(item)
                : this.forgeDetailHTML(item);
            if (this.isBenchSide() && bench()) this.dispose3D();

            el.innerHTML = `
                <div class="forge-modal-backdrop" id="forge-modal-close"></div>
                <div class="forge-modal-card workbench">
                    <div class="forge-modal-x focusable" tabindex="0" id="forge-modal-back">${escapeHtml(T('Blacksmith.close'))}</div>
                    ${inner}
                </div>`;

            // The dossier is taller than the window, so the button a keyboard
            // player has just moved onto has to be brought into view.
            const focus = el.querySelector('.inspect-btn.focused, .forge-swatch.focused');
            if (focus) focus.scrollIntoView({ block: 'nearest' });

            if (!this.isBenchSide()) this.mount3D(item);
        }

        // One head for both sides of the workshop: the icon, the name in its
        // rarity, and the blurb under it at the shared prose measure.
        detailHeadHTML(item, name, rarityCls) {
            let html = `
                <div class="ui-detail-head">
                    <span class="menu-icon menu-icon--32" style="--icon-col:${item.iconIndex % 16};--icon-row:${Math.floor(item.iconIndex / 16)}"></span>
                    <div class="ui-detail-titles">
                        <h2 class="${rarityCls}">${escapeHtml(name)}</h2>
                    </div>
                </div>`;
            return html;
        }

        // A label/value pair, the one row shape every detail page in the game
        // reads its facts off.
        specRow(label, value) {
            return `<div class="inspect-spec-row"><span class="inspect-spec-label">${escapeHtml(label)}</span>` +
                `<span class="inspect-spec-value">${escapeHtml(value)}</span></div>`;
        }

        sectionTitle(label) {
            return `<h4 class="inspect-section-title">${escapeHtml(label)}</h4>`;
        }

        // The bill of materials, as label/value rows: what it asks for on the
        // left, what the sack holds against it on the right.
        billHTML(recipe, yields) {
            let rows = '';
            for (const [id, need] of Object.entries(recipe || {})) {
                const mat = $dataItems[parseInt(id)];
                if (!mat) continue;
                const held = $gameParty.numItems(mat);
                const ok = isSandbox() || held >= need;
                const back = (yields || {})[id] || 0;
                rows += `
                    <div class="inspect-spec-row">
                        <span class="inspect-spec-label">
                            <span class="menu-icon" style="--icon-col:${mat.iconIndex % 16};--icon-row:${Math.floor(mat.iconIndex / 16)}"></span>
                            ${escapeHtml(tr(mat.name))}
                        </span>
                        <span class="inspect-spec-value ${ok ? 'forge-have' : 'forge-short'}">${back ? '+' + back + ' ' : ''}${held}/${need}</span>
                    </div>`;
            }
            return rows;
        }

        // ------------------------------------------------------ the anvil page
        forgeDetailHTML(item) {
            const t = bsText();
            const rarity = rarityOf(item);
            const spec = craftSpec(item);
            const tier = craftTier(item);
            const level = this.levelIn(item);
            const forged = isForged(item);
            const makeable = !forged && this.canMake(item);
            const recipe = parseRecipe(item);
            const stocked = hasMaterials(recipe);
            const owned = $gameParty.numItems(item);
            const smeltable = owned > 0;
            const yields = smeltable ? (smeltYield(item) || {}) : {};

            let body = '';
            if (item.description && String(item.description).trim()) {
                const desc = (forged ? String(item.description) : tr(String(item.description)))
                    .replace(/\s*\n\s*/g, ' ').trim();
                body += `<p class="ui-prose">${escapeHtml(desc)}</p>`;
            }
            body += this.previewHTML(item);
            body += this.nameHTML(item);
            body += this.finishHTML(item);

            // The trade and the tier it asks for. A piece already made says
            // instead whose hands made it and how it came out.
            body += this.sectionTitle(t.trades);
            if (forged) {
                body += this.specRow(T('Blacksmith.madeBy', { smith: String(item.meta.Forged).trim() }),
                    qualityLabel(item.meta.ForgeQuality));
            } else {
                body += this.specRow(T('Blacksmith.needs', {
                    trade: spec ? window.Specializations.displayName(spec) : craftSpecName(item),
                    level: levelName(tier)
                }), T('Blacksmith.have', {
                    who: (this.smith() && this.smith().name()) || '', level: levelName(level)
                }));
            }

            const bill = this.billHTML(recipe, yields);
            if (bill) body += this.sectionTitle(t.materials) + bill;
            body += this.metadataHTML(item);

            const enabled = makeable && stocked;
            const btnLabel = forged ? t.alreadyForged
                : (!makeable ? t.tooComplexShort : (stocked ? t.forge : t.noMaterials));
            const smeltLabel = smeltable ? t.smelt : t.smeltNone;

            return `
                <div class="ui-detail">
                    ${this.detailHeadHTML(item, displayName(item), window.ItemSystemUtils.rarityClass(rarity))}
                    <div class="ui-detail-scroll ui-scroll">${body}</div>
                    ${this.actionsHTML([
                        forged ? null : { id: 'forge-action', label: btnLabel, on: enabled, area: 'forge' },
                        { id: 'forge-smelt', label: smeltLabel, on: smeltable, area: 'smelt' }
                    ])}
                </div>`;
        }

        // ------------------------------------------------------- how many, and go
        // The foot of every dossier: a counter, then the buttons. The counter is
        // the whole of the batch feature - a run of ten is the same press as a
        // run of one - and it is capped by whichever of the two jobs the cursor
        // is on, so it can never be set to a number the sack cannot pay for.
        actionsHTML(buttons) {
            const btn = (b) => b ? `<div class="inspect-btn focusable ${b.on ? '' : 'disabled'} ${this._activeArea === b.area ? 'focused' : ''}" tabindex="0" id="${b.id}">${escapeHtml(b.label)}${b.on && this.qty() > 1 ? ' &times;' + this.qty() : ''}</div>` : '';
            const cap = this.activeCap();
            let stepper = '';
            if (cap > 1) {
                const n = this.qty();
                const step = (label, to, on) =>
                    `<div class="inspect-btn forge-qty-step focusable ${on ? '' : 'disabled'}" tabindex="0" data-qty="${to}">${label}</div>`;
                stepper = `
                    <div class="forge-qty-row">
                        ${step('&minus;', n - 1, n > 1)}
                        <span class="forge-qty-value">${n} / ${cap}</span>
                        ${step('&plus;', n + 1, n < cap)}
                        ${step(escapeHtml(T('Blacksmith.qtyMax')), cap, n < cap)}
                    </div>`;
            }
            return stepper + `<div class="inspect-actions inspect-actions--row">${buttons.map(btn).join('')}</div>`;
        }

        // ----------------------------------------------------- the bench page        // ----------------------------------------------------- the bench page
        // The Thinker's side of the workshop, drawn in the same shape: what the
        // recipe is, what it asks for, what the bench thinks of the job, and one
        // button at the foot of it.
        benchDetailHTML(item) {
            const b = bench();
            const bt = b.text();
            const recipe = b.parseRecipe(item);
            const known = b.knows(item);
            const trade = b.readingSpec(item);
            const held = $gameParty.numItems(item);

            let head, body = '';
            if (!known) {
                head = `
                <div class="ui-detail-head">
                    <span class="blueprint-icon-locked">?</span>
                    <div class="ui-detail-titles"><h2>${escapeHtml(bt.blueprintLocked)}</h2></div>
                </div>`;
                body += `<p class="ui-prose">${escapeHtml(T('Thinker.lockedRecipeHint'))}</p>`;
                body += `<p class="ui-prose">${escapeHtml(T('Thinker.revealHint', {
                    spec: b.specLabel(trade.name), level: b.levelLabel(b.revealLevel(item))
                }))}</p>`;
            } else {
                head = this.detailHeadHTML(item, tr(item.name),
                    window.ItemSystemUtils.rarityClass(b.rarityOf(item)));
                if (item.description && String(item.description).trim()) {
                    body += `<p class="ui-prose">${escapeHtml(tr(String(item.description)).replace(/\s*\n\s*/g, ' ').trim())}</p>`;
                }
            }

            // One page says both what a thing costs to make and what it gives
            // back when it is taken apart, so the player never has to change
            // mode to find out whether pulling one apart is worth it.
            if (recipe) {
                body += this.sectionTitle(bt.reagents);
                body += this.billHTML(recipe, null);
            }

            body += this.sectionTitle(bt.workbench);
            if (recipe) {
                const trained = b.tierMet(item);
                const starter = b.isStarter(item);
                const risk = Math.round(b.botchChance(item) * 100);
                const reclaim = Math.round(b.reclaimChance(item) * 100);
                body += this.specRow(
                    starter ? T('Thinker.starterRecipe')
                        : T('Thinker.tierLabel', { tier: b.tier(item), level: b.tierLevelName(item) }),
                    trained && risk > 0 ? T('Thinker.botchRisk', { pct: risk }) : '');
                body += this.specRow(
                    T('Thinker.tradeLabel', { spec: b.specLabel(trade.name), level: b.levelLabel(trade.level) }),
                    reclaim > 0 ? T('Thinker.reclaimChance', { pct: reclaim }) : '');
                if (held > 0) body += this.specRow(bt.salvageYields, String(held));
                if (known && !starter && !$gameSystem.hasCrafted(item.id) && !b.isSandbox()) {
                    body += `<p class="ui-prose">${escapeHtml(T('Thinker.knownBySkill', {
                        spec: b.specLabel(trade.name), level: b.levelLabel(trade.level)
                    }))}</p>`;
                }
                if (!trained) {
                    body += `<p class="ui-prose">${escapeHtml(T('Thinker.needFabrication', { level: b.tierLevelName(item) }))}</p>`;
                }
                if (b.isSandbox()) body += `<p class="ui-prose">${escapeHtml(bt.sandboxMode)}</p>`;
            }

            const canMake = !!recipe && b.hasMaterials(item) && b.tierMet(item);
            return `
                <div class="ui-detail">
                    ${head}
                    <div class="ui-detail-scroll ui-scroll">${body}</div>
                    ${this.actionsHTML([
                        { id: 'forge-action', label: bt.transmute, on: canMake, area: 'forge' },
                        { id: 'forge-smelt', label: held > 0 ? bt.salvage : T('Thinker.noOwned'), on: held > 0, area: 'smelt' }
                    ])}
                </div>`;
        }

        // ------------------------------------------------- the finish picker
        // Which skin the piece comes off the fire wearing. The models are
        // already drawn with these bitmaps (Weapon/WeaponSystemProcedural.js);
        // the anvil simply lets the smith pick instead of letting the seed pick.
        finishKey(item) {
            return `${DataManager.isWeapon(item) ? 'w' : 'a'}${item.id}`;
        }

        chosenFinish(item) {
            return this._finishes[this.finishKey(item)] || '';
        }

        setFinish(item, filename) {
            this._finishes[this.finishKey(item)] = filename || '';
        }

        // The look the piece will keep, held steady while it is on the page, so
        // the preview is a promise rather than a suggestion.
        pendingSeed(item) {
            const key = this.finishKey(item);
            if (!this._seeds) this._seeds = {};
            if (this._seeds[key] === undefined) {
                this._seeds[key] = (Math.random() * 0xFFFFFFFF) >>> 0;
            }
            return this._seeds[key];
        }

        // ------------------------------------------------- the name picker
        // A weapon rolls a name for itself the moment it is looked at, kept
        // steady while it is on the page, exactly like its finish; typing over
        // it or hitting the dice replaces only that piece's roll.
        pendingName(item) {
            const key = this.finishKey(item);
            if (!this._names) this._names = {};
            if (this._names[key] === undefined) {
                this._names[key] = randomForgedName(item);
            }
            return this._names[key];
        }

        setName(item, name) {
            if (!this._names) this._names = {};
            this._names[this.finishKey(item)] = String(name == null ? '' : name).slice(0, 60);
        }

        rerollName(item) {
            if (!this._names) this._names = {};
            this._names[this.finishKey(item)] = randomForgedName(item);
        }

        // What the 3D card is asked to draw: the entry itself once it has been
        // forged, and a stand-in wearing this visit's choices before that.
        previewItem(item) {
            if (isForged(item)) return item;
            const finish = this.chosenFinish(item);
            const seed = this.pendingSeed(item);
            return Object.assign({}, item, {
                note: String(item.note || '') + `\n<ForgeSeed: ${seed}>` +
                    (finish ? `\n<ForgeTexture: ${finish}>` : ''),
                meta: Object.assign({}, item.meta, {
                    ForgeSeed: String(seed),
                    ForgeTexture: finish || undefined
                })
            });
        }

        // A weapon rolls its own name the moment it is looked at (pendingName),
        // typed over freely and rerolled on demand; armor keeps the plain
        // "{smith}'s {piece}" naming, since only a weapon was asked for this.
        nameHTML(item) {
            if (isForged(item) || !DataManager.isWeapon(item)) return '';
            const name = this.pendingName(item);
            return `
                <h4 class="inspect-section-title">${escapeHtml(T("Blacksmith.nameHeader"))}</h4>
                <div class="forge-name-row">
                    <input type="text" id="forge-name-input" class="forge-name-input"
                           value="${escapeHtml(name)}" maxlength="60"
                           placeholder="${escapeHtml(T('Blacksmith.namePlaceholder'))}">
                    <div class="forge-name-reroll" id="forge-name-reroll" title="${escapeHtml(T('Blacksmith.nameReroll'))}">&#8635;</div>
                </div>`;
        }

        finishHTML(item) {
            // A piece already beaten out wears what it was given; only what is
            // still on the bill can still be chosen for.
            if (isForged(item)) return '';
            const list = finishesFor(item);
            if (!list.length) return '';
            const chosen = this.chosenFinish(item);
            const focused = this._activeArea === 'finish';
            // The cursor is read off the piece's own choice, so moving between
            // pieces never leaves it pointing at somebody else's swatch.
            const at = chosen ? list.indexOf(chosen) : -1;
            this._finishIndex = at >= 0 ? at + 1 : 0;

            let swatches = `
                <div class="forge-swatch forge-swatch--auto ${chosen ? '' : 'selected'} ${focused && this._finishIndex === 0 ? 'focused' : ''}"
                     data-finish="" title="${escapeHtml(T('Blacksmith.finishAuto'))}">
                    <span>${escapeHtml(T('Blacksmith.finishAuto'))}</span>
                </div>`;
            let broke = false;
            list.forEach((file, idx) => {
                const sel = chosen === file ? 'selected' : '';
                const foc = (focused && this._finishIndex === idx + 1) ? 'focused' : '';
                if (!broke && String(file).startsWith('dream/')) {
                    broke = true;
                    swatches += `<div class="forge-swatch-divider">${escapeHtml(T('Blacksmith.finishStrange'))}</div>`;
                }
                swatches += `<div class="forge-swatch ${sel} ${foc}" data-finish="${escapeHtml(file)}" data-fidx="${idx + 1}">
                     <img src="${escapeHtml(finishSrc(file))}" alt="" loading="lazy" decoding="async"></div>`;
            });

            return `
                <h4 class="inspect-section-title">${escapeHtml(T("Blacksmith.finish"))}</h4>
                <div class="forge-swatches" id="forge-finishes">${swatches}</div>`;
        }

        // Everything the custom equip menu puts on screen for a piece of gear,
        // read straight off the entry rather than off a wearer: its parameters,
        // its slot and type, what it is worth and what it weighs.
        metadataHTML(item) {
            const t = bsText();
            const et = T.obj('Equip');
            const rows = [];

            const PARAMS = [
                ['hp', 0], ['mp', 1], ['str', 2], ['con', 3],
                ['int', 4], ['wis', 5], ['dex', 6], ['psi', 7]
            ];
            let bonuses = '';
            for (const [key, idx] of PARAMS) {
                const v = (item.params && item.params[idx]) || 0;
                if (!v) continue;
                bonuses += this.specRow(et[key] || key, (v > 0 ? '+' : '') + v);
            }

            const sys = $dataSystem || {};
            if (DataManager.isWeapon(item)) {
                const wt = (sys.weaponTypes || [])[item.wtypeId];
                if (wt) rows.push([t.weaponType, tr(wt)]);
            } else {
                const at = (sys.armorTypes || [])[item.atypeId];
                if (at) rows.push([t.armorType, tr(at)]);
            }
            const slot = (sys.equipTypes || [])[item.etypeId];
            if (slot) rows.push([t.slot, tr(slot)]);
            const rarity = rarityOf(item);
            if (rarity && rarity.name) rows.push([t.rarity, tr(rarity.name)]);
            rows.push([t.value, money(item.price || 0)]);
            if (window.ItemSystemUtils && window.ItemSystemUtils.getItemWeight) {
                rows.push([t.weight, window.ItemSystemUtils.formatWeight(
                    window.ItemSystemUtils.getItemWeight(item))]);
            }
            // Anything else the entry declares (Range, Movement, Level, ...) is
            // shown as written, so a note tag added later surfaces by itself.
            // Bookkeeping the smith wrote on the piece, and the model it is
            // drawn with, are not properties of the thing itself.
            const SKIP = /^(Recipe|Craft|CraftLevel|Category|Lore|Weight|Forge\w*|Forged|model3d|3DModel)$/i;
            for (const key of Object.keys(item.meta || {})) {
                if (SKIP.test(key)) continue;
                const val = item.meta[key];
                rows.push([key, val === true ? T('Blacksmith.yes') : String(val)]);
            }

            let table = '';
            for (const [label, val] of rows) table += this.specRow(label, val);

            let lore = '';
            if (window.ItemSystemUtils && window.ItemSystemUtils.loreFor) {
                const text = window.ItemSystemUtils.loreFor(item);
                if (text) lore = `<p class="ui-prose">${escapeHtml(text)}</p>`;
            }

            return (bonuses ? this.sectionTitle(T('Blacksmith.bonuses')) + `<div class="inspect-spec-grid">${bonuses}</div>` : '') +
                (table ? this.sectionTitle(T('Blacksmith.specs')) + `<div class="inspect-spec-grid">${table}</div>` : '') +
                lore;
        }

        // -------------------------------------------------- weapon preview
        // The same card the equip menu uses, for one entry instead of a
        // wearer's two hands: the weapon's real 3D model. An armor, or a
        // runtime without three.js, gets the icon on its rarity ring instead.
        previewHTML(item) {
            const canThree = typeof THREE !== 'undefined' && DataManager.isWeapon(item);
            let html = '<div class="weapon-previews-container">';
            if (canThree) {
                html += `<div class="weapon-preview-card weapon-preview-card--single"><canvas id="forge-preview-canvas" width="640" height="440"></canvas></div>`;
            } else {
                const rarity = rarityOf(item);
                // Nothing here is drawn in three dimensions, so the finish the
                // smith picked is shown as the cloth the piece is laid on.
                const finish = isForged(item)
                    ? (item.meta.ForgeTexture ? String(item.meta.ForgeTexture).trim() : '')
                    : this.chosenFinish(item);
                const skin = finish
                    ? ` style="background-image:url('${escapeHtml(finishSrc(finish))}'); background-size:cover; background-position:center"`
                    : '';
                const inner = `<div class="weapon-preview-icon-wrapper"><div class="weapon-preview-icon-circle rarity-ring ${window.ItemSystemUtils.rarityClass(rarity)}"><div class="item-icon" style="${iconStyle(item.iconIndex, 32)}"></div></div></div>`;
                html += `<div class="weapon-preview-card weapon-preview-card--single"${skin}>${inner}</div>`;
            }
            return html + '</div>';
        }

        mount3D(baseItem) {
            this.dispose3D();
            if (typeof THREE === 'undefined' || !DataManager.isWeapon(baseItem)) return;
            const item = this.previewItem(baseItem);
            const canvas = document.getElementById('forge-preview-canvas');
            if (!canvas) return;

            const rect = canvas.getBoundingClientRect();
            const width = rect.width || 400;
            const height = rect.height || 440;
            const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
            renderer.setSize(width, height);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

            const scene = new THREE.Scene();
            scene.add(new THREE.AmbientLight(0xffffff, 0.95));
            const key = new THREE.DirectionalLight(0xffffff, 0.7); key.position.set(3, 5, 4); scene.add(key);
            const fill = new THREE.DirectionalLight(0xffffff, 0.4); fill.position.set(-3, -5, -4); scene.add(fill);
            const camera = new THREE.PerspectiveCamera(40, width / height, 0.05, 50);
            camera.position.set(0, 0, 2.7);

            const state = { renderer, scene, camera, model: null, raf: null };
            this._preview = state;

            const place = (m) => {
                const box = new THREE.Box3().setFromObject(m);
                const size = box.getSize(new THREE.Vector3());
                const center = box.getCenter(new THREE.Vector3());
                m.position.sub(center);
                const fit = 1.85 / (Math.max(size.x, size.y, size.z) || 1);
                m.scale.set(fit, fit, fit);
                m.rotation.set(0.1, -0.4, 0.35);
                if (window.PSXShader) window.PSXShader.applyToObject(m);
                scene.add(m);
                state.model = m;
            };

            if (item.meta && item.meta.model3d && THREE.GLTFLoader) {
                new THREE.GLTFLoader().load(`models/${item.meta.model3d}`, g => place(g.scene), undefined,
                    err => console.error('[Blacksmithing] model load failed', err));
            } else if (window.WeaponSystemProcedural && WeaponSystemProcedural.createModel) {
                const model = WeaponSystemProcedural.createModel(item);
                if (model) place(model);
            }

            // Drag slides the view over the piece and the wheel leans in and
            // out. The piece itself never turns: a finish is picked off a still
            // object, and a swatch chosen against a spinning one is a guess.
            let dragging = false;
            let prev = { x: 0, y: 0 };
            const down = (e) => {
                dragging = true;
                prev = { x: e.clientX || 0, y: e.clientY || 0 };
                canvas.style.cursor = 'grabbing';
                e.preventDefault();
            };
            const move = (e) => {
                if (!dragging) return;
                const dx = (e.clientX || 0) - prev.x;
                const dy = (e.clientY || 0) - prev.y;
                const pan = 0.0022 * camera.position.z;
                camera.position.x -= dx * pan;
                camera.position.y += dy * pan;
                prev = { x: e.clientX || 0, y: e.clientY || 0 };
            };
            const up = () => { dragging = false; canvas.style.cursor = ''; };
            const wheel = (e) => {
                e.preventDefault();
                camera.position.z = Math.max(0.35, Math.min(6, camera.position.z + e.deltaY * 0.0015));
            };
            canvas.addEventListener('mousedown', down);
            window.addEventListener('mousemove', move);
            window.addEventListener('mouseup', up);
            canvas.addEventListener('wheel', wheel, { passive: false });
            state.listeners = { canvas, down, move, up, wheel };

            const tick = () => {
                if (!state.renderer) return;
                // Moving parts the procedural model declares for itself.
                if (state.model && window.WeaponSystemProcedural) {
                    WeaponSystemProcedural.tickModelParts(state.model, 16);
                }
                state.renderer.render(state.scene, state.camera);
                state.raf = requestAnimationFrame(tick);
            };
            tick();
        }

        dispose3D() {
            const s = this._preview;
            if (!s) return;
            if (s.raf) cancelAnimationFrame(s.raf);
            if (s.listeners) {
                s.listeners.canvas.removeEventListener('mousedown', s.listeners.down);
                window.removeEventListener('mousemove', s.listeners.move);
                window.removeEventListener('mouseup', s.listeners.up);
                s.listeners.canvas.removeEventListener('wheel', s.listeners.wheel);
            }
            if (s.renderer) {
                s.renderer.dispose();
                // dispose() frees this preview's geometries and textures but
                // leaves the WebGL context itself alive, and renderDetail()
                // hands mount3D a brand new canvas for every recipe the cursor
                // lands on. The browser caps how many contexts may live at once
                // and force-loses the OLDEST past the cap, which is the game's
                // own canvas: a couple of dozen recipes into the forge, PIXI is
                // handed a restored context it cannot rebuild the tilemap and
                // the uploaded textures on, and the picture stays corrupted
                // with stale fragments for the rest of the session. Release it
                // here, and retire the canvas, since a lost context never comes
                // back on the element it was taken from.
                try { if (s.renderer.forceContextLoss) s.renderer.forceContextLoss(); } catch (e) {}
                const canvas = s.renderer.domElement;
                if (canvas && canvas.parentNode) {
                    canvas.parentNode.replaceChild(canvas.cloneNode(false), canvas);
                }
            }
            this._preview = null;
        }

        // ------------------------------------------------------------ overlay
        renderOverlay() {
            const el = document.getElementById('forge-overlay-container');
            if (!el) return;
            if (!(this._overlayTimer > 0 && this._overlayData)) { el.innerHTML = ''; return; }

            const d = this._overlayData;
            const row = (entry, qty) => `
                        <div class="success-item-row">
                            <span class="menu-icon menu-icon--32" style="--icon-col:${entry.iconIndex % 16};--icon-row:${Math.floor(entry.iconIndex / 16)}"></span>
                            <span class="rarity-name ${window.ItemSystemUtils.rarityClass(rarityOf(entry))}">${escapeHtml(tr(entry.name))}${qty ? ' &times;' + qty : ''}</span>
                        </div>`;

            // The bench's own three answers (a finished assembly, a teardown, a
            // ruined batch) and the forge's two are one overlay.
            let title = '', rows = '';
            if (d.bench) {
                const bt = bench().text();
                title = d.mode === 'botched' ? T('Thinker.botchTitle')
                    : (d.mode === 'disassemble' ? bt.extractSuccess : bt.success);
                if (d.mode === 'botched') {
                    rows = `<div class="success-item-row"><span>${escapeHtml(T('Thinker.botchNote'))}</span></div>`;
                } else {
                    rows = `<div class="success-item-row"><span>${escapeHtml(bt.obtained)}</span></div>`;
                    for (const got of d.items) rows += row(got, 0);
                }
            } else {
                title = d.smelted ? bsText().smelted : bsText().forged;
                rows = row(d.item, 0);
                if (d.smelted) {
                    for (const got of d.smelted) rows += row(got.item, got.qty);
                } else if (d.quality) {
                    rows += `<div class="success-item-row"><span>${escapeHtml(qualityLabel(d.quality))}</span></div>`;
                }
            }
            // A run of ten says so in its own title, so a batch is never
            // mistaken for a single piece.
            if (d.batch > 1) title += ' ' + T('Blacksmith.batchCount', { n: d.batch });
            el.innerHTML = `
                    <div class="success-overlay">
                        <div class="cauldron-animation"></div>
                        <h2 class="success-title">${escapeHtml(title)}</h2>
                        ${rows}
                    </div>`;
        }

        // ------------------------------------------------------------- action
        // A run off the anvil. Each piece in the run pays its own bill and rolls
        // its own quality, so ten swords made together are still ten different
        // swords, and the run stops the moment the sack cannot pay for the next.
        async forgeSelected(runs) {
            const item = this._selectedItem;
            if (!item) return;
            const wanted = Math.max(1, runs || 1);
            const recipe = parseRecipe(item);
            if (!this.canMake(item) || !hasMaterials(recipe)) {
                SoundManager.playBuzzer();
                return;
            }
            const batch = [];
            let last = null;
            for (let run = 0; run < wanted; run++) {
                if (!hasMaterials(recipe)) break;
                if (!isSandbox()) {
                    for (const [id, qty] of Object.entries(recipe)) {
                        $gameParty.loseItem($dataItems[parseInt(id)], qty);
                    }
                }
                const piece = await this.forgeOnce(item);
                if (!piece) break;
                batch.push(piece);
                last = piece;
            }
            if (!batch.length) { SoundManager.playBuzzer(); return; }

            this._overlayData = { item: last, quality: last.meta.ForgeQuality, batch: batch.length };
            this._overlayTimer = 110;
            this._listDirty = true;
            this.restoreCursor(item);
            SoundManager.playUseItem();
            this.refreshForge();
        }

        // One piece off the anvil: registered, handed over, written up and paid
        // for in specialization points.
        async forgeOnce(item) {
                        // Nothing leaves this anvil as a copy of a catalogue entry. The
            // piece is registered as its own database entry with its own id, so
            // it stacks with nothing and keeps the sheet it was beaten out with.
            const made = await this.registerForged(item);
            if (!made) return null;
            $gameParty.gainItem(made, 1);
            // What came off the anvil, in the party's diary (Diary.js).
            if (window.Diary) window.Diary.onCrafted('forge', made.name, 1);

            const spec = craftSpec(item);
            if (spec && window.SpecializationXP) {
                window.SpecializationXP.award(spec, TIER_POINTS[craftTier(item)] || 1, { actor: this.smith() });
            }
            return made;
        }

        // One piece, one entry, one id. The record is what the save keeps; the
        // entry is rebuilt from it every time the game is loaded.
        async registerForged(base) {
            const kind = DataManager.isWeapon(base) ? 'w' : 'a';
            const smith = String((this.smith() && this.smith().name()) || '')
                .replace(/[<>\r\n]/g, '').trim();
            const quality = await rollQuality(this.smith(), base);
            const rec = {
                id: nextForgeId(kind),
                kind,
                baseId: base.id,
                smith,
                quality,
                texture: this.chosenFinish(base) || '',
                seed: this.pendingSeed(base),
                customName: (this._names && this._names[this.finishKey(base)] || '').trim(),
                params: rollParams(base, quality),
                price: Math.max(1, Math.round((base.price || 0) * quality * quality)),
                mark: 0
            };
            rec.mark = markNumber(rec) + 1;
            forgeStore().push(rec);
            const entry = materialize(rec);
            if (!entry) { forgeStore().pop(); return null; }
            // The look and the name the smith previewed went into the record
            // with the piece, so the next one off the same bill rolls its own.
            if (this._seeds) delete this._seeds[this.finishKey(base)];
            if (this._names) delete this._names[this.finishKey(base)];
            return entry;
        }

        // ------------------------------------------------------------- smelt
        // Back into the crucible. Half the bill comes out, a well-made piece
        // gives back more, and a piece that was worn down to nothing gives back
        // nothing at all.
        smeltSelected(runs) {
            const item = this._selectedItem;
            const wanted = Math.max(1, runs || 1);
            if (!item || $gameParty.numItems(item) <= 0) {
                SoundManager.playBuzzer();
                return;
            }
            const yields = smeltYield(item);
            if (!yields) { SoundManager.playBuzzer(); return; }

            // A whole shelf can go into the crucible at once; what comes back
            // is added up and reported as one heap.
            const melted = Math.min(wanted, $gameParty.numItems(item));
            const tally = {};
            for (let run = 0; run < melted; run++) {
                $gameParty.loseItem(item, 1);
                for (const [id, qty] of Object.entries(yields)) {
                    if (qty <= 0) continue;
                    tally[id] = (tally[id] || 0) + qty;
                }
            }
            const got = [];
            for (const [id, qty] of Object.entries(tally)) {
                const mat = $dataItems[parseInt(id)];
                if (!mat || qty <= 0) continue;
                $gameParty.gainItem(mat, qty);
                got.push({ item: mat, qty });
            }
            this._overlayData = { item, smelted: got, batch: melted };
            this._overlayTimer = 110;
            this._listDirty = true;

            // Melting the last one down takes the piece off the forged board,
            // so the cursor is put back on whatever now holds its place.
            this.restoreCursor(item);
            SoundManager.playUseItem();
            this.refreshForge();
        }

        // The bench's two buttons. What either of them does is decided by
        // window.ThinkerBench; the workshop only counts the runs and shows what
        // came of them. A botch ends the run: the bench has had enough.
        benchRun(item, runs, job) {
            const b = bench();
            if (!b || !item) return;
            let done = 0, botched = 0;
            const gained = [];
            for (let run = 0; run < Math.max(1, runs || 1); run++) {
                const result = job(item);
                if (!result) break;
                done++;
                if (result.mode === 'botched') { botched++; break; }
                for (const got of (result.items || [])) gained.push(got);
            }
            if (!done) { SoundManager.playBuzzer(); return; }

            this._overlayData = {
                bench: true,
                mode: botched ? 'botched' : (job === b.disassemble ? 'disassemble' : 'assemble'),
                items: gained,
                batch: done
            };
            this._overlayTimer = 110;
            this._listDirty = true;
            if (botched) SoundManager.playBuzzer();
            else SoundManager.playUseItem();
            this.restoreCursor(item);
            this.refreshForge();
        }

        benchAction(runs) {
            const b = bench();
            if (b) this.benchRun(this._selectedItem, runs, b.assemble);
        }

        benchSalvage(runs) {
            const b = bench();
            if (b) this.benchRun(this._selectedItem, runs, b.disassemble);
        }

        // Spending the last of a bill can move a row out from under the open
        // chip, so the cursor holds its place on the board and the dossier
        // follows whatever now stands there.
        restoreCursor(item) {
            const items = this.listItems();
            const at = items.indexOf(item);
            if (at >= 0) {
                this._itemIndex = at;
                this._selectedItem = item;
                return;
            }
            this._selectedItem = null;
            this.selectRow(this._itemIndex);
            // The last one went into the crucible and its card is off the
            // board: the window has nothing left to be about, so it closes.
            if (!this._selectedItem) {
                this._modalOpen = false;
                this._activeArea = 'items';
            }
        }

        // ------------------------------------------------------- the two jobs
        // Make and break, whichever half of the workshop the selected piece
        // belongs to, and however many of them were asked for. A batch is run
        // one at a time so every piece rolls its own quality, its own botch and
        // its own salvage, and it stops the moment the sack runs dry.
        async makeSelected() {
            const item = this._selectedItem;
            if (!item) return;
            const runs = Math.min(this.qty(), Math.max(1, this.batchCap(item)));
            if (isBenchItem(item)) this.benchAction(runs);
            else await this.forgeSelected(runs);
        }

        async breakSelected() {
            const item = this._selectedItem;
            if (!item) return;
            const runs = Math.min(this.qty(), this.breakCap(item));
            if (runs <= 0) { SoundManager.playBuzzer(); return; }
            if (isBenchItem(item)) this.benchSalvage(runs);
            else this.smeltSelected(runs);
        }

        primaryAction() { this.makeSelected(); }

        // The single Back control in the header bar. The board is one page, so
        // there is nothing to step back out of: Back closes the workshop.
        backOut() {
            SoundManager.playCancel();
            this.popScene();
        }

        // -------------------------------------------------------------- input
        onSpreadClick(e) {
            const smith = e.target.closest('[data-smith]');
            if (smith) { this.selectSmith(parseInt(smith.dataset.smith)); return; }

            if (e.target.closest('#forge-back')) { this.backOut(); return; }

            const statusBtn = e.target.closest('[data-status]');
            if (statusBtn) { this.setStatus(statusBtn.dataset.status); return; }

            const tradeBtn = e.target.closest('[data-trade]');
            if (tradeBtn) {
                this._activeArea = 'trades';
                this.setTrade(tradeBtn.dataset.trade);
                return;
            }

            const qtyBtn = e.target.closest('[data-qty]');
            if (qtyBtn) { this.setQty(parseInt(qtyBtn.dataset.qty) || 1); return; }

            // A card is picked up: the piece opens in its own window.
            const cell = e.target.closest('[data-item]');
            if (cell) {
                this._activeArea = 'items';
                this.openPiece(parseInt(cell.dataset.idx) || 0);
                return;
            }

            if (e.target.closest('#forge-modal-back') || e.target.closest('#forge-modal-close')) {
                this.closePiece();
                return;
            }

            if (e.target.closest('#forge-name-reroll')) {
                if (this._selectedItem) this.rerollName(this._selectedItem);
                SoundManager.playCursor();
                this.refreshForge();
                return;
            }

            const swatch = e.target.closest('[data-finish]');
            if (swatch) {
                this.setFinish(this._selectedItem, swatch.dataset.finish);
                this._finishIndex = parseInt(swatch.dataset.fidx) || 0;
                this._activeArea = 'finish';
                SoundManager.playCursor();
                this.refreshForge();
                return;
            }

            if (e.target.closest('#forge-action')) { this.makeSelected(); return; }
            if (e.target.closest('#forge-smelt')) { this.breakSelected(); return; }
        }

        updateForgeInput() {
            if (this._overlayTimer > 0) {
                if (Input.isTriggered('ok') || Input.isTriggered('cancel') || TouchInput.isTriggered()) {
                    this._overlayTimer = 0;
                    this._overlayData = null;
                    this.refreshForge();
                    return;
                }
                if (--this._overlayTimer === 0) {
                    this._overlayData = null;
                    this.refreshForge();
                }
                return;
            }

            // Shoulder buttons hand the workshop to another member.
            if (Input.isTriggered('pagedown')) { this.cycleSmith(1); return; }
            if (Input.isTriggered('pageup')) { this.cycleSmith(-1); return; }

            const cancel = Input.isTriggered('cancel') || TouchInput.isCancelled();

            // The board is two pages: the shelf of trades on the left, the
            // grid of pieces on the right with its status chips over it. Left
            // and right cross between them, up and down walk whichever one the
            // cursor is standing on. Everything else happens in the window a
            // piece opens in.
            if (this._activeArea === 'trades') {
                const rows = this.trades();
                const step = Input.isRepeated('down') ? 1 : (Input.isRepeated('up') ? -1 : 0);
                if (step) {
                    const at = Math.max(0, Math.min(rows.length, this._tradeIndex + step));
                    this._tradeIndex = at;
                    this.setTrade(at === 0 ? '' : rows[at - 1].key);
                    this._activeArea = 'trades';
                    this.refreshForge();
                } else if (Input.isTriggered('ok') || Input.isRepeated('right')) {
                    this._activeArea = this.listItems().length ? 'items' : 'status';
                    SoundManager.playCursor();
                    this.refreshForge();
                } else if (cancel) { this.backOut(); }
                return;
            }

            if (this._activeArea === 'status') {
                const step = Input.isRepeated('right') ? 1 : (Input.isRepeated('left') ? -1 : 0);
                if (step) {
                    const at = this._statusIndex + step;
                    if (at < 0) {
                        this._activeArea = 'trades';
                        SoundManager.playCursor();
                        this.refreshForge();
                        return;
                    }
                    const clamped = Math.min(STATUS_TABS.length - 1, at);
                    this._statusIndex = clamped;
                    this.setStatus(STATUS_TABS[clamped]);
                    this._activeArea = 'status';
                    this.refreshForge();
                } else if (Input.isTriggered('ok') || Input.isTriggered('down')) {
                    this._activeArea = 'items';
                    SoundManager.playCursor();
                    this.refreshForge();
                } else if (cancel) { this.backOut(); }
                return;
            }

            // The grid: four across, so up and down are a row and left off the
            // first column steps back onto the shelf of trades.
            if (this._activeArea === 'items') {
                const items = this.listItems();
                const last = items.length - 1;
                const col = this._itemIndex % GRID_COLS;
                if (Input.isRepeated('right')) {
                    if (this._itemIndex < last) { this.selectRow(this._itemIndex + 1); SoundManager.playCursor(); this.refreshForge(); }
                } else if (Input.isRepeated('left')) {
                    if (col === 0) {
                        this._activeArea = 'trades';
                        SoundManager.playCursor();
                        this.refreshForge();
                    } else {
                        this.selectRow(this._itemIndex - 1);
                        SoundManager.playCursor();
                        this.refreshForge();
                    }
                } else if (Input.isRepeated('down')) {
                    if (this._itemIndex + GRID_COLS <= last) {
                        this.selectRow(this._itemIndex + GRID_COLS);
                        SoundManager.playCursor();
                        this.refreshForge();
                    }
                } else if (Input.isRepeated('up')) {
                    if (this._itemIndex >= GRID_COLS) {
                        this.selectRow(this._itemIndex - GRID_COLS);
                        SoundManager.playCursor();
                    } else {
                        this._activeArea = 'status';
                        SoundManager.playCursor();
                    }
                    this.refreshForge();
                } else if (Input.isTriggered('ok') && items.length) {
                    this.openPiece(this._itemIndex);
                } else if (cancel) { this.backOut(); }
                return;
            }

            // The swatch strip: left and right walk it, OK takes the one under
            // the cursor and drops down to the buttons.
            if (this._activeArea === 'finish') {
                const list = finishesFor(this._selectedItem);
                const last = list.length;   // slot 0 is 'as it falls'
                const step = Input.isRepeated('right') ? 1 : (Input.isRepeated('left') ? -1 : 0);
                if (step) {
                    this._finishIndex = Math.max(0, Math.min(last, this._finishIndex + step));
                    this.setFinish(this._selectedItem, this._finishIndex ? list[this._finishIndex - 1] : '');
                    SoundManager.playCursor();
                    this.refreshForge();
                } else if (Input.isTriggered('ok') || Input.isTriggered('down')) {
                    this._activeArea = this.firstButtonArea();
                    SoundManager.playOk();
                    this.refreshForge();
                } else if (cancel) {
                    this.closePiece();
                }
                return;
            }

            if (this._activeArea === 'forge' || this._activeArea === 'smelt') {
                const making = this._activeArea === 'forge';
                // Standing on a button, left and right set how many: the batch
                // is dialled where it is spent, without leaving the button.
                if (Input.isRepeated('right')) {
                    if (this.qty() < this.activeCap()) { this.setQty(this.qty() + 1); return; }
                    if (making && this.breakCap(this._selectedItem) > 0) {
                        this._activeArea = 'smelt'; SoundManager.playCursor(); this.refreshForge();
                    }
                    return;
                }
                if (Input.isRepeated('left')) {
                    if (this.qty() > 1) { this.setQty(this.qty() - 1); return; }
                    if (!making && !isForged(this._selectedItem)) {
                        this._activeArea = 'forge'; SoundManager.playCursor(); this.refreshForge();
                    }
                    return;
                }
                if (Input.isTriggered('ok')) {
                    if (making) this.makeSelected(); else this.breakSelected();
                } else if (Input.isTriggered('up')) {
                    if (this.hasFinishes()) {
                        this._activeArea = 'finish';
                        SoundManager.playCursor();
                        this.refreshForge();
                    }
                } else if (cancel) {
                    this.closePiece();
                }
            }
        }

        hasFinishes() {
            if (isBenchItem(this._selectedItem)) return false;
            return !!this._selectedItem && !isForged(this._selectedItem) && finishesFor(this._selectedItem).length > 0;
        }

        // A piece already made has no Forge button, so the cursor lands on the
        // crucible instead.
        firstButtonArea() {
            if (isForged(this._selectedItem)) return 'smelt';
            return 'forge';
        }
    }

    window.Scene_Blacksmithing = Scene_Blacksmithing;

    // ========================================================================
    // Entry points
    // ========================================================================
    PluginManager.registerCommand(pluginName, 'openBlacksmithing', () => {
        SceneManager.push(Scene_Blacksmithing);
    });
    PluginManager.registerCommand('ThinkerMenu', 'openBlacksmithing', () => {
        SceneManager.push(Scene_Blacksmithing);
    });

})();


/* ============================================================================
 * Scene_Thinker - the workshop, opened on the bench
 * ============================================================================
 * Kept as a name because plugin commands, saved event pages and the main menu
 * all reach for it. It is the merged workshop with its cursor already standing
 * on the Assemble side.
 */
(() => {
    'use strict';

    class Scene_Thinker extends (window.Scene_Blacksmithing || Scene_MenuBase) {
        create() {
            super.create();
            // Same board, opened with the bench's own trades in front: the
            // door a player came through still decides what they see first.
            const b = window.ThinkerBench;
            const first = b ? this.listItems().find(e => !DataManager.isWeapon(e) && !DataManager.isArmor(e)) : null;
            if (first) {
                this.setTrade(this.tradeOf(first));
                this.refreshForge();
            }
        }
    }

    window.Scene_Thinker = Scene_Thinker;
})();
