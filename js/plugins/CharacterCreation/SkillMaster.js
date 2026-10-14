/*:
 * @target MZ
 * @plugindesc v4.0.0 SkillMaster - Complete skill management system with 2D skill tree visualizer, progression, and fusion.
 * @author Omni-Lex
 *
 * @param Variable ID
 * @desc ID of the variable to store the selected skill ID
 * @type variable
 * @default 24
 *
 * @param Encyclopedia Command
 * @desc Command name for the skill system in the menu
 * @type string
 * @default Skill Master
 *
 * @param Add to Menu
 * @desc Add the skill system to the main menu?
 * @type boolean
 * @on Yes
 * @off No
 * @default true
 *
 * @param Category Window Width
 * @desc Width of the category selection window
 * @type number
 * @default 300
 *
 * @param Skill List Width
 * @desc Width of the skill list window
 * @type number
 * @default 300
 *
 * @param Confirmation Message
 * @desc Confirmation message for skill fusion
 * @type string
 * @default Do you want to fuse these skills?
 *
 * @param Success Message
 * @desc Success message for skill fusion
 * @type string
 * @default Fusion successful! You learned a new skill!
 *
 * @param Battle Progress Points
 * @desc Points gained after winning a battle with the skill selected
 * @type number
 * @min 1
 * @default 3
 *
 * @command openSkillEncyclopedia
 * @desc Opens the unified skill encyclopedia interface.
 *
 * @command openEncyclopedia
 * @desc Opens the unified skill encyclopedia interface.
 *
 * @command openSkillSystem
 * @desc Opens the unified skill encyclopedia interface.
 *
 * @command openWithSkill
 * @text Open With Skill
 * @desc Opens the encyclopedia and highlights a specific skill
 * @arg skillId
 * @type skill
 * @text Skill
 * @desc The skill to highlight in the encyclopedia
 *
 * @command increaseSkillProgress
 * @desc Manually increases the progress of the currently selected skill.
 * @arg amount
 * @type number
 * @text Amount
 * @desc The amount of progress to add
 * @default 1
 * @min 1
 */

//=============================================================================
// Module: SkillMasterCore.js
//=============================================================================
/*:
 * @target MZ
 * @plugindesc v4.0.0 SkillMaster - Core data, Knowledge Points, category affinity, and persistence.
 * @author Omni-Lex
 *
 * @param Variable ID
 * @desc ID of the variable to store the selected skill ID
 * @type variable
 * @default 24
 *
 * @param Encyclopedia Command
 * @desc Command name for the skill system in the menu
 * @type string
 * @default Skill Master
 *
 * @param Add to Menu
 * @desc Add the skill system to the main menu?
 * @type boolean
 * @on Yes
 * @off No
 * @default true
 *
 * @param Battle Progress Points
 * @desc Points gained after winning a battle with the skill selected
 * @type number
 * @min 1
 * @default 3
 *
 * @command openSkillEncyclopedia
 * @desc Opens the unified skill encyclopedia interface.
 *
 * @command openWithSkill
 * @text Open With Skill
 * @desc Opens the encyclopedia and highlights a specific skill
 * @arg skillId
 * @type skill
 * @text Skill
 * @desc The skill to highlight in the encyclopedia
 *
 * @command increaseSkillProgress
 * @desc Manually increases the progress of the currently selected skill.
 * @arg amount
 * @type number
 * @text Amount
 * @desc The amount of progress to add
 * @default 1
 * @min 1
 */

(() => {
    'use strict';

    window.SkillMaster = window.SkillMaster || {};

    // ── Shared character-switcher hint helper (idempotent across plugins) ──────
    // The companion tab strip is drawn by window.CharSwitcher, which UI/CustomSceneStatus.js
    // owns. This file used to carry its own copy of it behind an
    // `if (!window.CharSwitcher)` guard, along with six other plugins: only the
    // first one loaded ever ran, so a fix made in any of the others did nothing.

    const pluginName = "SkillMasterCore";
    const oldPluginName = "SkillMaster";
    const parameters = PluginManager.parameters(pluginName) || PluginManager.parameters(oldPluginName) || {};
    const variableId = Number(parameters['Variable ID'] || 24);
    const encyclopediaCommand = String(parameters['Encyclopedia Command'] || 'Skill Master');
    const addToMenu = parameters['Add to Menu'] !== 'false';
    const battleProgressPoints = Number(parameters['Battle Progress Points'] || 3);

    SkillMaster.params = {
        variableId,
        encyclopediaCommand,
        addToMenu,
        battleProgressPoints
    };

    let _statsI18n = null;

    const _loadStatsI18n = async () => {
        const lang = ConfigManager.language || 'en';
        const url = `js/i18n/${lang}/stats.json`;
        try {
            const response = await fetch(url);
            _statsI18n = await response.json();
        } catch (e) {
            console.error('SkillMaster: Failed to load i18n data from ' + url, e);
        }
    };

    const _si18n = (key) => {
        if (_statsI18n && _statsI18n[key]) {
            return _statsI18n[key];
        }
        return key;
    };

    _loadStatsI18n();
    SkillMaster._si18n = _si18n;

    //=============================================================================
    // Category Data, loaded from js/db/Skills/Categories.json
    //=============================================================================

    let CATEGORY_DATA = {};

    const _loadCategoryData = async () => {
        const url = 'js/db/Skills/Categories.json';
        try {
            const response = await fetch(url);
            CATEGORY_DATA = await response.json();
            SkillMaster.CATEGORY_DATA = CATEGORY_DATA;
        } catch (e) {
            console.error('SkillMaster: Failed to load Categories.json from ' + url, e);
        }
    };

    _loadCategoryData();
    SkillMaster.CATEGORY_DATA = CATEGORY_DATA;

    // A character's name is typed in by the player, so it is escaped before
    // it goes into a page: a "<" in a name must not eat the markup after it.
    function escHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function uncamelCase(str) {
        if (!str) return '';
        const decamel = str
            .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
            .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
        return decamel.split(/\s+/).map(word => {
            if (!word) return '';
            if (word === word.toUpperCase()) return word;
            return word.charAt(0).toUpperCase() + word.slice(1);
        }).join(' ');
    }

    //=========================================================================
    // Story mode: Em's curriculum
    //=========================================================================
    // Em does not study the ordinary skill categories. A memory-wiped witch who
    // casts through a gun learns one magical system at a time, so in story mode
    // her trees are the ten magical systems themselves plus the one mundane
    // trade she keeps: firearms. Everywhere else, and for everybody else, the
    // categories are untouched.
    const MAGIC_TREE_PREFIX = 'MagicSystem:';
    const EM_STORY_SWITCH = 49;   // raised when a story run is started
    const EM_SKILL_TREES = ['Firearms']; // i18n-ignore: skill category id / type discriminator
    const MAGIC_TREE_ICON = 79;

    function isMagicTree(category) {
        return typeof category === 'string' && category.startsWith(MAGIC_TREE_PREFIX);
    }

    function magicTreeId(category) {
        return isMagicTree(category) ? category.slice(MAGIC_TREE_PREFIX.length) : null;
    }

    function currentTeachActorId() {
        const scene = SceneManager._scene;
        if (scene && scene._teachActorId) return scene._teachActorId;
        return actorCategoryManager._actorId;
    }

    // True only while a story run is teaching Em herself: any other run, and any
    // other member of her party, keeps the ordinary category trees.
    function usesEmCurriculum(actorId) {
        if (typeof $gameSwitches === 'undefined' || !$gameSwitches) return false;
        if (!$gameSwitches.value(EM_STORY_SWITCH)) return false;
        const id = actorId || currentTeachActorId();
        const actor = (typeof $gameActors !== 'undefined' && $gameActors) ? $gameActors.actor(id) : null;
        if (!actor) return false;
        if (actor._presetId === 2) return true;
        const name = String(actor._presetName || (actor.name && actor.name()) || '').trim().toLowerCase();
        return name === 'em';
    }

    function getEmCurriculumCategories() {
        const list = ['All'].concat(EM_SKILL_TREES); // i18n-ignore: skill category id / type discriminator
        for (const sys of getAllMagicalSystems()) {
            if (sys && sys.id) list.push(MAGIC_TREE_PREFIX + sys.id);
        }
        return list;
    }

    function getCategoryDisplayName(categoryName) {
        if (isMagicTree(categoryName)) return getMagicSystemDisplayName(magicTreeId(categoryName));
        const key = 'SkillMaster.category.' + categoryName;
        if (typeof T === 'function' && T.has(key)) return T(key);
        const data = CATEGORY_DATA[categoryName] || SkillMaster.CATEGORY_DATA[categoryName];
        if (data && data.name) {
            const lang = typeof T === 'function' ? T.language() : (ConfigManager.language || 'en');
            return lang === 'it' ? data.name.it : data.name.en;
        }
        return uncamelCase(categoryName);
    }

    function getCategoryIcon(categoryName) {
        if (isMagicTree(categoryName)) return MAGIC_TREE_ICON;
        const data = CATEGORY_DATA[categoryName] || SkillMaster.CATEGORY_DATA[categoryName];
        return data ? data.icon : 245;
    }

    function getCategoryIconStyle(categoryName) {
        if (isMagicTree(categoryName)) return window.CCArt.icon(MAGIC_TREE_ICON, 32);
        const data = CATEGORY_DATA[categoryName] || SkillMaster.CATEGORY_DATA[categoryName];
        return window.CCArt.icon(data ? data.icon : 245, 32);
    }

    function getSkillIconStyle(iconIndex) {
        return window.CCArt.icon(iconIndex || 0, 32);
    }

    function getSkillCategory(skillId) {
        if (!skillId) return null;
        const skill = $dataSkills[skillId];
        if (!skill || !skill.note) return null;
        const match = skill.note.match(/<category:\s*(.+?)\s*>/i);
        return match ? match[1].trim() : null;
    }

    // Guard (2) and Escape (5) are battle menu commands, not skills: no
    // character ever learns or carries them, and no list ever shows them.
    const MENU_COMMAND_SKILL_IDS = [2, 5];
    function isMenuCommandSkill(skillId) {
        return MENU_COMMAND_SKILL_IDS.includes(Number(skillId));
    }

    // The Basic kit (<category:Basic>) is the engine's own fallback moves. It
    // is never a school: SkillMaster does not list it, teach it, or hand it
    // to the forge or the benches.
    function isBasicCategory(category) {
        return typeof category === 'string' && category.trim().toLowerCase() === 'basic'; // i18n-ignore: <category:Basic> note tag
    }

    //=============================================================================
    // HandTrees, over js/db/Skills/SkillTrees.json
    //
    // Every school's Training tree is written by hand: one tree per school,
    // rooted in its basic skills, each node naming its tier and the node(s)
    // it grows out of.
    //=============================================================================

    const HandTrees = {
        _data: undefined,
        _tiers: null,

        all: function () {
            if (this._data !== undefined) return this._data;
            let data = null;
            try {
                const db = window.Skills && window.Skills.SkillTrees;
                data = (db && db.trees) ? db.trees : null;
            } catch (e) {
                console.error('SkillMaster: SkillTrees.json could not be read', e);
            }
            this._data = data;
            return data;
        },

        tree: function (category) {
            const all = this.all();
            const tree = all && category && all[category];
            return (tree && Array.isArray(tree.nodes)) ? tree : null;
        },

        // The rung a skill stands on in its school's tree, -1 when it has none.
        tierOf: function (skillId) {
            if (!this._tiers) {
                const tiers = new Map();
                const all = this.all() || {};
                for (const name of Object.keys(all)) {
                    for (const node of (all[name].nodes || [])) tiers.set(node.id, node.tier);
                }
                this._tiers = tiers;
            }
            const tier = this._tiers.get(Number(skillId));
            return tier === undefined ? -1 : tier;
        }
    };

    window.HandTrees = HandTrees;
    SkillMaster.HandTrees = HandTrees;

    function isHiddenFromSkillMaster(skill) {
        if (!skill) return true;
        if (isMenuCommandSkill(skill.id)) return true;
        const match = (skill.note || '').match(/<category:\s*(.+?)\s*>/i);
        return !!match && isBasicCategory(match[1]);
    }

    function getSkillMagicSystem(skillId) {
        if (!skillId) return null;
        const skill = $dataSkills[skillId];
        if (!skill || !skill.note) return null;
        const match = skill.note.match(/<MagicSystem:\s*([^>]+)>/i);
        return match ? match[1].trim() : null;
    }

    function getActorMagicSystem(actorId) {
        if (!actorId) return null;
        const classId = actorCategoryManager._classIdFor(actorId);
        const cls = classId && $dataClasses[classId];
        if (!cls || !cls.note) return null;
        const match = cls.note.match(/<MagicalSystem:\s*([^>]+)>/i);
        return match ? match[1].trim() : null;
    }

    function getAllMagicalSystems() {
        return (window.Skills && Array.isArray(window.Skills.MagicalSystems)) ? window.Skills.MagicalSystems : [];
    }

    function getMagicSystemDisplayName(id) {
        const key = 'SkillMaster.magicSystem.systems.' + id + '.name';
        return (typeof T === 'function' && T.has(key)) ? T(key) : id;
    }

    function getMagicSystemDesc(id) {
        const key = 'SkillMaster.magicSystem.systems.' + id + '.desc';
        return (typeof T === 'function' && T.has(key)) ? T(key) : '';
    }

    // Hard or soft magic: a cosmetic label on every system, read off the data
    // so the wheel and the detail page never disagree about which is which.
    function getMagicSystemRigor(id) {
        const sys = getAllMagicalSystems().find(s => s && s.id === id);
        return (sys && sys.rigor === 'hard') ? 'hard' : 'soft';
    }

    function getMagicSystemRigorLabel(id) {
        const key = 'SkillMaster.magicSystem.rigor.' + getMagicSystemRigor(id);
        return (typeof T === 'function' && T.has(key)) ? T(key) : '';
    }

    function getMagicSystemRigorHint(id) {
        const key = 'SkillMaster.magicSystem.rigor.' + getMagicSystemRigor(id) + 'Hint'; // i18n-ignore: i18n key prefix
        return (typeof T === 'function' && T.has(key)) ? T(key) : '';
    }

    function getMagicSystemLore(id) {
        const key = 'SkillMaster.magicSystem.systems.' + id + '.lore';
        return (typeof T === 'function' && T.has(key)) ? T(key) : '';
    }

    function getClassesForMagicSystem(id) {
        const names = [];
        if (typeof $dataClasses === 'undefined' || !$dataClasses) return names;
        for (const cls of $dataClasses) {
            if (!cls || !cls.note) continue;
            const match = cls.note.match(/<MagicalSystem:\s*([^>]+)>/i);
            if (match && match[1].trim() === id) names.push(cls.name);
        }
        return names;
    }

    function getSkillsForMagicSystem(id) {
        const list = [];
        if (typeof $dataSkills === 'undefined' || !$dataSkills) return list;
        for (const skill of $dataSkills) {
            if (!skill || !skill.name || skill._customSpell) continue;
            if (isHiddenFromSkillMaster(skill)) continue;
            if (getSkillMagicSystem(skill.id) === id) list.push(skill);
        }
        return list;
    }

    const FUSION_CATEGORY = 'Fusion'; // i18n-ignore: skill category id / type discriminator
    // Every category whose entries live on $gameSystem rather than in the
    // database: the forge's fusions and the two benches' own writing. They are
    // read out of the save, never scanned for in $dataSkills.
    const CUSTOM_CATEGORIES = ['Fusion', 'Crafted', 'Devised']; // i18n-ignore: skill category id / type discriminator

    const actorCategoryManager = {
        _primary: [],
        _secondary: [],
        _initialized: false,
        _actorId: 1,
        _classId: 0,
        _foreign: [],
        _foreignKey: '',

        setActor: function (actorId) {
            if (!actorId || actorId === this._actorId) return;
            this._actorId = actorId;
            this._initialized = false;
        },

        _classIdFor: function (actorId) {
            const gameActor = typeof $gameActors !== 'undefined' && $gameActors ? $gameActors.actor(actorId) : null;
            if (gameActor && gameActor.currentClass()) return gameActor.currentClass().id;
            const data = $dataActors && $dataActors[actorId];
            return data ? data.classId : null;
        },

        initialize: function () {
            if (typeof $dataActors === 'undefined' || !$dataActors) return;
            const classId = this._classIdFor(this._actorId);
            if (!classId) return;
            if (this._initialized && this._classId === classId) return;
            this._classId = classId;

            const map = (CATEGORY_DATA && CATEGORY_DATA.classSkillCategories) || (SkillMaster.CATEGORY_DATA && SkillMaster.CATEGORY_DATA.classSkillCategories);
            if (!map) return;

            const entry = map[classId] || map[String(classId)];
            this._primary = (entry && Array.isArray(entry.primary)) ? entry.primary.slice() : [];
            this._secondary = (entry && Array.isArray(entry.secondary)) ? entry.secondary.slice() : [];
            this._initialized = true;
        },

        isPrimary: function (category) {
            this.initialize();
            return this._primary.includes(category);
        },

        isSecondary: function (category) {
            this.initialize();
            return this._secondary.includes(category);
        },

        foreignCategories: function () {
            this.initialize();
            const own = this._primary.concat(this._secondary);
            if (!own.length) return [];
            const actor = (typeof $gameActors !== 'undefined' && $gameActors)
                ? $gameActors.actor(this._actorId) : null;
            if (!actor || !actor.skills) return [];
            const known = actor.skills();
            const key = `${this._actorId}:${this._classId}:${known.length}`;
            if (this._foreignKey === key) return this._foreign;
            const out = [];
            for (const skill of known) {
                if (!skill) continue;
                const cat = getSkillCategory(skill.id);
                if (!cat || isBasicCategory(cat) || own.includes(cat) || out.includes(cat)) continue;
                out.push(cat);
            }
            this._foreignKey = key;
            this._foreign = out;
            return out;
        },

        isForeign: function (category) {
            if (!category) return false;
            if (this.isPrimary(category) || this.isSecondary(category)) return false;
            return this.foreignCategories().includes(category);
        },

        allowedCategories: function () {
            this.initialize();
            const list = this._primary.concat(this._secondary);
            if (!list.length) return null;
            return list.concat(this.foreignCategories());
        },

        getMultiplier: function (skillId) {
            this.initialize();
            const category = getSkillCategory(skillId);
            if (!category) return 1;
            if (this.isPrimary(category)) return 3;
            if (this.isSecondary(category)) return 1.5;
            return 1;
        }
    };

    function getAllSkillCategories() {
        if (usesEmCurriculum()) return getEmCurriculumCategories();
        const allowed = actorCategoryManager.allowedCategories();
        const categories = new Set();
        categories.add("All"); // i18n-ignore: skill category id / type discriminator

        const MN = window.MagicNature;
        const filterNature = !!(MN && MN.isFiltering());

        if (typeof $dataSkills !== 'undefined' && $dataSkills) {
            for (const skill of $dataSkills) {
                if (!skill) continue;
                if (skill._customSpell) continue;
                if (filterNature && !MN.allowsData(skill)) continue;
                const categoryMatch = (skill.note || "").match(/<category:(.+?)>/i);
                if (categoryMatch) {
                    if (isHiddenFromSkillMaster(skill)) continue;
                    if (allowed && !allowed.includes(categoryMatch[1].trim())) continue;
                    categories.add(categoryMatch[1]);
                }
            }
        }
        for (const custom of CUSTOM_CATEGORIES) {
            if (getSkillsByCategory(custom).length) categories.add(custom);
        }
        return Array.from(categories);
    }

    function getCategoryType(category) {
        if (category === 'All') return 'Skill'; // i18n-ignore: skill category id / type discriminator
        if (isMagicTree(category)) return 'Magic'; // i18n-ignore: skill category id / type discriminator
        const data = CATEGORY_DATA[category] || SkillMaster.CATEGORY_DATA[category];
        return (data && data.type === 'Magic') ? 'Magic' : 'Skill'; // i18n-ignore: skill category id / type discriminator
    }

    function getSplitSkillCategories() {
        const all = getAllSkillCategories();
        const skills = [];
        const magic = [];
        for (const cat of all) {
            if (cat === 'All') continue; // i18n-ignore: skill category id / type discriminator
            if (getCategoryType(cat) === 'Magic') magic.push(cat); // i18n-ignore: skill category id / type discriminator
            else skills.push(cat);
        }
        const byName = (a, b) => getCategoryDisplayName(a).localeCompare(getCategoryDisplayName(b));
        skills.sort(byName);
        magic.sort(byName);
        skills.push('All'); // i18n-ignore: skill category id / type discriminator
        return { Skill: skills, Magic: magic };
    }

    // The name an ability is filed under: the one the reader sees, so the
    // order holds up in Italian as well as in English.
    function skillSortName(skill) {
        const raw = (skill && skill.name) || '';
        return window.translateText ? window.translateText(raw) : raw;
    }

    // A category holds hundreds of abilities and the database hands them over
    // in whatever order they were entered, which is no order at all to read a
    // list of that size in. Every list is filed A to Z before it is returned.
    // The skill graph re-sorts its own input by power, so this costs it
    // nothing.
    function alphabetical(skills) {
        return skills.sort((a, b) => skillSortName(a).localeCompare(skillSortName(b)));
    }

    function getSkillsByCategory(category) {
        if (isMagicTree(category)) {
            const MN0 = window.MagicNature;
            const filter0 = !!(MN0 && MN0.isFiltering());
            return alphabetical(getSkillsForMagicSystem(magicTreeId(category))
                .filter(s => s && s.name && !s.name.startsWith('<--') && (!filter0 || MN0.allowsData(s))));
        }
        if (category === 'All' && usesEmCurriculum()) { // i18n-ignore: skill category id / type discriminator
            const out = [];
            for (const cat of getEmCurriculumCategories()) {
                if (cat === 'All') continue; // i18n-ignore: skill category id / type discriminator
                for (const skill of getSkillsByCategory(cat)) {
                    if (!out.includes(skill)) out.push(skill);
                }
            }
            return alphabetical(out);
        }
        if (CUSTOM_CATEGORIES.includes(category)) {
            const actorId = (SceneManager._scene && SceneManager._scene._teachActorId) || 0;
            if (typeof $gameSystem === 'undefined' || !$gameSystem) return [];
            return alphabetical($gameSystem.getCustomSpells()
                .filter(s => s && s.name && s._ownerActorId === actorId &&
                    (s._customCategory || FUSION_CATEGORY) === category)
                .map(s => $dataSkills[s.id] || s)
                .filter(Boolean));
        }
        const skills = [];
        const catRegex = category === "All" ? null : new RegExp(`<category:${category}>`, 'i');
        const allowed = catRegex ? null : actorCategoryManager.allowedCategories();
        const MN = window.MagicNature;
        const filterNature = !!(MN && MN.isFiltering());

        if (typeof $dataSkills !== 'undefined' && $dataSkills) {
            for (const skill of $dataSkills) {
                if (!skill || !skill.name || skill.name.startsWith('<--')) continue;
                if (skill._customSpell) continue;
                if (isHiddenFromSkillMaster(skill)) continue;
                if (filterNature && !MN.allowsData(skill)) continue;

                if (catRegex) {
                    if (catRegex.test(skill.note)) skills.push(skill);
                    continue;
                }
                if (allowed) {
                    const match = (skill.note || "").match(/<category:(.+?)>/i);
                    if (!match || !allowed.includes(match[1].trim())) continue;
                }
                skills.push(skill);
            }
        }
        return alphabetical(skills);
    }

    // Export helpers
    SkillMaster.uncamelCase = uncamelCase;
    SkillMaster.getCategoryDisplayName = getCategoryDisplayName;
    SkillMaster.getCategoryIcon = getCategoryIcon;
    SkillMaster.getCategoryIconStyle = getCategoryIconStyle;
    SkillMaster.getSkillIconStyle = getSkillIconStyle;
    SkillMaster.getSkillCategory = getSkillCategory;
    SkillMaster.isMenuCommandSkill = isMenuCommandSkill;
    SkillMaster.isBasicCategory = isBasicCategory;
    SkillMaster.isHiddenSkill = isHiddenFromSkillMaster;
    SkillMaster.escHtml = escHtml;
    SkillMaster.getSkillMagicSystem = getSkillMagicSystem;
    SkillMaster.getActorMagicSystem = getActorMagicSystem;
    SkillMaster.getAllMagicalSystems = getAllMagicalSystems;
    SkillMaster.getMagicSystemDisplayName = getMagicSystemDisplayName;
    SkillMaster.getMagicSystemDesc = getMagicSystemDesc;
    SkillMaster.getMagicSystemLore = getMagicSystemLore;
    SkillMaster.getMagicSystemRigor = getMagicSystemRigor;
    SkillMaster.getMagicSystemRigorLabel = getMagicSystemRigorLabel;
    SkillMaster.getMagicSystemRigorHint = getMagicSystemRigorHint;
    SkillMaster.getClassesForMagicSystem = getClassesForMagicSystem;
    SkillMaster.getSkillsForMagicSystem = getSkillsForMagicSystem;
    SkillMaster.actorCategoryManager = actorCategoryManager;
    SkillMaster.getAllSkillCategories = getAllSkillCategories;
    SkillMaster.usesEmCurriculum = usesEmCurriculum;
    SkillMaster.isMagicTree = isMagicTree;
    SkillMaster.magicTreeId = magicTreeId;
    SkillMaster.getCategoryType = getCategoryType;
    SkillMaster.getSplitSkillCategories = getSplitSkillCategories;
    SkillMaster.getSkillsByCategory = getSkillsByCategory;
    SkillMaster.skillSortName = skillSortName;
    SkillMaster.FUSION_CATEGORY = FUSION_CATEGORY;
    SkillMaster.CUSTOM_CATEGORIES = CUSTOM_CATEGORIES;

    //=============================================================================
    // Game_System - Shared Knowledge Points
    //=============================================================================

    const _Game_System_initialize = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function () {
        _Game_System_initialize.call(this);
        this._knowledgePoints = 0;
    };

    function isGrimoireItem(item) {
        if (!item) return false;
        if (item.note && /<Grimoire:/i.test(item.note)) return true;
        if (item.name && /grimoire|grimorie/i.test(item.name)) return true;
        if (item.id >= 1400 && item.id <= 1439) return true;
        return false;
    }

    function isGrimoireStart() {
        if (typeof $gameParty === 'undefined' || !$gameParty) return false;
        if (typeof $gameParty.items === 'function') {
            const items = $gameParty.items();
            for (let i = 0; i < items.length; i++) {
                if (isGrimoireItem(items[i])) return true;
            }
        }
        if (typeof $gameParty.allMembers === 'function') {
            const members = $gameParty.allMembers();
            for (let i = 0; i < members.length; i++) {
                const actor = members[i];
                if (!actor || typeof actor.equips !== 'function') continue;
                const equips = actor.equips();
                for (let j = 0; j < equips.length; j++) {
                    if (isGrimoireItem(equips[j])) return true;
                }
            }
        }
        if (typeof $gameSystem !== 'undefined' && $gameSystem) {
            if ($gameSystem._ccOriginSymbol === 'origin_arcanist') return true;
        }
        return false;
    }

    function isCrowleyStart() {
        if (typeof $gameParty === 'undefined' || !$gameParty || typeof $gameParty.allMembers !== 'function') return false;
        const members = $gameParty.allMembers();
        for (let i = 0; i < members.length; i++) {
            const a = members[i];
            if (!a) continue;
            const name = (typeof a.name === 'function' ? a.name() : (a._name || '')).toLowerCase();
            if (a._presetId === 10 ||
                a._presetKey === 'aleister crowley' ||
                a._presetKey === 'alesteir crowley' ||
                a._presetName === 'Aleister Crowley' ||
                a._presetName === 'Alesteir Crowley' ||
                /aleister\s*crowley|alesteir\s*crowley/i.test(name)) {
                return true;
            }
        }
        return false;
    }

    function isPlaytestStart(sys) {
        if (sys && sys._isSandboxMode) return true;
        if (typeof $gameSystem !== 'undefined' && $gameSystem && $gameSystem._isSandboxMode) return true;
        if (typeof $gameTemp !== 'undefined' && $gameTemp && typeof $gameTemp.isPlaytest === 'function' && $gameTemp.isPlaytest()) return true;
        if (typeof Utils !== 'undefined' && typeof Utils.isOptionValid === 'function' && Utils.isOptionValid('test')) return true;
        if (typeof $gameParty !== 'undefined' && $gameParty) {
            const leader = typeof $gameParty.leader === 'function' ? $gameParty.leader() : (typeof $gameParty.allMembers === 'function' ? $gameParty.allMembers()[0] : null);
            if (leader) {
                const name = typeof leader.name === 'function' ? leader.name() : leader._name;
                if (name && name.toLowerCase() === 'test') return true;
            }
        }
        return false;
    }

    Game_System.prototype.getKnowledge = function () {
        if (this._knowledgePoints === undefined) this._knowledgePoints = 0;
        if (!this._initialKpGranted) {
            const isPlaytest = isPlaytestStart(this);
            const isCrowley = isCrowleyStart();
            const isGrimoire = isGrimoireStart();
            if (isPlaytest || isCrowley || isGrimoire) {
                this._knowledgePoints = 9999;
                this._initialKpGranted = true;
                this._sandboxKnowledgePointsGiven = true;
            }
        }
        return this._knowledgePoints;
    };

    Game_System.prototype.addKnowledge = function (amount) {
        if (this._knowledgePoints === undefined) this._knowledgePoints = 0;
        this.getKnowledge();
        this._knowledgePoints += amount;
    };

    Game_System.prototype.spendKnowledge = function (amount) {
        if (this._knowledgePoints === undefined) this._knowledgePoints = 0;
        this.getKnowledge();
        this._knowledgePoints = Math.max(0, this._knowledgePoints - amount);
    };

    //=============================================================================
    // Knowledge a character brings with them
    //
    // Everyone who joins the party arrives with a head full of what they
    // already studied, and the pool is the party's, not theirs: a character
    // made at creation and a character recruited off the road are worth the
    // same. A party of two therefore starts on 500 KP.
    //
    // The grant is remembered by actor id, so a character who leaves and comes
    // back is not a second payday.
    //=============================================================================

    const KP_PER_MEMBER = 250;
    SkillMaster.KP_PER_MEMBER = KP_PER_MEMBER;

    Game_System.prototype.grantJoinKnowledge = function (actorId) {
        if (!actorId) return false;
        if (!this._kpGrantedActors) this._kpGrantedActors = [];
        if (this._kpGrantedActors.includes(actorId)) return false;
        this._kpGrantedActors.push(actorId);
        this.addKnowledge(KP_PER_MEMBER);
        return true;
    };

    const _Game_Party_addActor_kp = Game_Party.prototype.addActor;
    Game_Party.prototype.addActor = function (actorId) {
        const had = this._actors.includes(actorId);
        _Game_Party_addActor_kp.call(this, actorId);
        if (!had && this._actors.includes(actorId) &&
            typeof $gameSystem !== 'undefined' && $gameSystem &&
            typeof $gameSystem.grantJoinKnowledge === 'function') {
            $gameSystem.grantJoinKnowledge(actorId);
        }
    };

    //=============================================================================
    // Skill power -> Knowledge cost
    //=============================================================================

    const KP_TEACH_BASE = 50;
    const KP_TEACH_EXP = 1.75;
    const KP_TEACH_MIN = 50;
    const KP_TEACH_MAX = 250000;
    const FOREIGN_KP_MULT = 3;
    const KP_TP_WEIGHT = 4;
    const KP_RESOURCE_SOFT = 12;
    const KP_RESOURCE_WEIGHT = 0.35;

    const KP_FORMULA_STATS = ['a.mhp', 'a.mmp', 'a.atk', 'a.def', 'a.mat', 'a.mdf',
        'a.agi', 'a.luk', 'a.level', 'a.hp', 'a.mp', 'a.tp'].map(stat => ({
            stat: stat,
            re: new RegExp(stat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\*\\s*([\\d.]+)')
        }));

    const KP_SCOPE_WEIGHT = {
        0: 0, 1: 0, 2: 0.8, 3: 0.3, 4: 0.45, 5: 0.55, 6: 1.0, 7: 0.15,
        8: 0.6, 9: 0.15, 10: 0.6, 11: 0, 12: 0.6, 13: 0.8, 14: 1.0
    };

    function kpFormulaWeight(formula) {
        if (!formula) return { multiplier: 0, flat: 0 };
        let multiplier = 0;
        for (const entry of KP_FORMULA_STATS) {
            const m = formula.match(entry.re);
            if (m) multiplier = Math.max(multiplier, parseFloat(m[1]) || 0);
            else if (formula.includes(entry.stat)) multiplier = Math.max(multiplier, 1);
        }
        let flat = 0;
        const flatRe = /(?:^|[^.\w])(\d{2,5})(?![.\w])/g;
        let f;
        while ((f = flatRe.exec(formula)) !== null) flat = Math.max(flat, parseInt(f[1], 10));
        return { multiplier: multiplier, flat: flat };
    }

    function skillPower(skill) {
        if (!skill) return 1;
        const resource = (skill.mpCost || 0) + (skill.tpCost || 0) * KP_TP_WEIGHT;
        let power = 1 + Math.log2(1 + resource / KP_RESOURCE_SOFT) * KP_RESOURCE_WEIGHT;

        const dmg = skill.damage || {};
        if (dmg.type > 0) {
            const w = kpFormulaWeight(dmg.formula || '');
            power += Math.min(w.multiplier, 25) * 0.07;
            power += Math.min(w.flat / 1000, 2);
        }
        power += Math.max(0, (skill.repeats || 1) - 1) * 0.25;
        power += (KP_SCOPE_WEIGHT[skill.scope] !== undefined ? KP_SCOPE_WEIGHT[skill.scope] : 0.3) * 0.35;

        for (const eff of (skill.effects || [])) {
            if (!eff) continue;
            switch (eff.code) {
                case Game_Action.EFFECT_ADD_STATE:
                case Game_Action.EFFECT_REMOVE_STATE:
                    power += 0.12 * Math.min(1, Math.max(0.2, eff.value1 || 1)); break;
                case Game_Action.EFFECT_ADD_BUFF:
                case Game_Action.EFFECT_ADD_DEBUFF:
                    power += 0.1; break;
                case Game_Action.EFFECT_RECOVER_HP:
                case Game_Action.EFFECT_RECOVER_MP:
                    power += 0.1; break;
                case Game_Action.EFFECT_GAIN_TP: power += 0.06; break;
                case Game_Action.EFFECT_GROW: power += 0.3; break;
                case Game_Action.EFFECT_LEARN_SKILL: power += 0.2; break;
                case Game_Action.EFFECT_SPECIAL: power += 0.12; break;
                case Game_Action.EFFECT_COMMON_EVENT: power += 0.12; break;
            }
        }
        return Math.max(1, power);
    }

    // What a skill costs to learn is what rung of its school's tree it stands
    // on. The rebalance that wrote SkillTrees.json set every skill's MP, TP,
    // damage and StatReq from that same rung, so the price follows the power:
    // a basic skill is a handful of fights, a capstone a long campaign's worth.
    // On top of its rung an <Esoteric> working costs double and a <Forbidden>
    // one ten times over, besides the level floor in window.SkillArcana.
    const KP_TIER_COST = [60, 120, 220, 380, 600, 900];
    const KP_ESOTERIC_MULT = 2;
    const KP_FORBIDDEN_MULT = 10;

    function kpOccultMultiplier(skill) {
        const note = (skill && skill.note) || '';
        if (/<Forbidden>/i.test(note)) return KP_FORBIDDEN_MULT;
        if (/<Esoteric>/i.test(note)) return KP_ESOTERIC_MULT;
        return 1;
    }

    function kpTeachCost(skill) {
        if (!skill) return KP_TEACH_MIN;
        // Fusions and the benches' own writing stand on no rung: they are
        // still priced off what they do.
        const tier = skill._customSpell ? -1 : HandTrees.tierOf(skill.id);
        const raw = tier >= 0
            ? KP_TIER_COST[Math.min(tier, KP_TIER_COST.length - 1)]
            : KP_TEACH_BASE * Math.pow(skillPower(skill), KP_TEACH_EXP);
        return Math.max(KP_TEACH_MIN, Math.min(KP_TEACH_MAX, Math.round(raw * kpOccultMultiplier(skill))));
    }

    Game_System.prototype.getSkillKnowledgeCost = function (skillId, actorId) {
        const skill = $dataSkills[skillId];
        if (!skill) return KP_TEACH_MIN;
        if (actorId) actorCategoryManager.setActor(actorId);
        let cost = kpTeachCost(skill);
        const category = getSkillCategory(skillId);
        if (category && actorId) {
            if (actorCategoryManager.isPrimary(category)) cost = Math.floor(cost * 0.5);
            else if (actorCategoryManager.isForeign(category)) cost *= FOREIGN_KP_MULT;
        }
        if (actorId) {
            const skillSystem = getSkillMagicSystem(skillId);
            if (skillSystem && skillSystem === getActorMagicSystem(actorId)) {
                cost = Math.floor(cost * 0.5);
            }
        }
        return Math.max(KP_TEACH_MIN, cost);
    };

    //=============================================================================
    // Knowledge award curve
    //=============================================================================

    const KP_BASE = 3;
    const KP_CURVE = 1.5;
    const KP_MIN = 1;
    const KP_MAX = 25;
    const KP_EXTRA_WEIGHT = 0.35;
    const KP_ENCOUNTER_CAP = 60;
    const KP_QUEST_BASE = { 1: 5, 2: 10, 3: 20, 4: 40, 5: 70 };
    const KP_FUSION_PREMIUM = 1.25;
    const KP_FUSION_MIN = 50;

    function kpForEnemy(enemyLevel, partyLevel) {
        const pl = Math.max(1, partyLevel || 1);
        const el = Math.max(1, enemyLevel || 1);
        const v = KP_BASE * Math.pow(el / pl, KP_CURVE);
        return Math.max(KP_MIN, Math.min(KP_MAX, v));
    }

    function kpForEncounter(enemyLevels, partyLevel) {
        const vals = (enemyLevels || [])
            .map(l => kpForEnemy(l, partyLevel))
            .sort((a, b) => b - a);
        if (!vals.length) return 0;
        let total = vals[0];
        for (let i = 1; i < vals.length; i++) total += vals[i] * KP_EXTRA_WEIGHT;
        return Math.max(1, Math.min(KP_ENCOUNTER_CAP, Math.round(total)));
    }

    function kpForQuest(diff, enemyLevels, partyLevel) {
        const stars = Math.max(1, Math.min(5, Math.round(diff || 1)));
        const base = KP_QUEST_BASE[stars] || KP_QUEST_BASE[1];
        const fight = (enemyLevels && enemyLevels.length)
            ? kpForEncounter(enemyLevels, partyLevel) : 0;
        return Math.max(1, Math.round(base + fight));
    }

    function kpFusionCost(componentIds, actorId) {
        let sum = 0;
        for (const id of (componentIds || [])) {
            if (!id) continue;
            sum += $gameSystem.getSkillKnowledgeCost(id, actorId);
        }
        if (sum <= 0) return KP_FUSION_MIN;
        return Math.max(KP_FUSION_MIN, Math.round(sum * KP_FUSION_PREMIUM));
    }

    window.KnowledgePoints = {
        forEnemy: kpForEnemy,
        forEncounter: kpForEncounter,
        forQuest: kpForQuest,
        fusionCost: kpFusionCost,
    };

    SkillMaster.kpFormulaWeight = kpFormulaWeight;
    SkillMaster.skillPower = skillPower;
    SkillMaster.kpTeachCost = kpTeachCost;
    SkillMaster.kpForEnemy = kpForEnemy;
    SkillMaster.kpForEncounter = kpForEncounter;
    SkillMaster.kpForQuest = kpForQuest;
    SkillMaster.kpFusionCost = kpFusionCost;

    //=============================================================================
    // Custom (procedural) spells persistence
    //=============================================================================

    Game_System.prototype.getCustomSpells = function () {
        if (!this._customSpells) this._customSpells = [];
        return this._customSpells;
    };

    Game_System.prototype.allocCustomSkillId = function () {
        if (!this._nextCustomSkillId) {
            const base = (typeof $dataSkills !== 'undefined' && $dataSkills) ? $dataSkills.length : 3000;
            this._nextCustomSkillId = Math.max(3000, base);
        }
        return this._nextCustomSkillId++;
    };

    Game_System.prototype.addCustomSpell = function (skill) {
        const mine = this.getCustomSpells().filter(s => s && s._ownerActorId === skill._ownerActorId);
        skill.note = String(skill.note || '').replace(/\n?<Node:[^>]*>/i, '')
            + '\n<Node: 0,' + mine.length + '>'; // i18n-ignore: note tag
        this.getCustomSpells().push(skill);
        if (typeof $dataSkills !== 'undefined' && $dataSkills) $dataSkills[skill.id] = skill;
    };

    Game_System.prototype.removeCustomSpell = function (skillId) {
        const arr = this.getCustomSpells();
        const idx = arr.findIndex(s => s && s.id === skillId);
        if (idx >= 0) arr.splice(idx, 1);
        if (typeof $dataSkills !== 'undefined' && $dataSkills && $dataSkills[skillId]) {
            $dataSkills[skillId] = null;
        }
    };

    function injectAllCustomSpells() {
        if (typeof $gameSystem === 'undefined' || !$gameSystem) return;
        if (typeof $dataSkills === 'undefined' || !$dataSkills) return;
        for (const s of $gameSystem.getCustomSpells()) {
            if (s && s.id) $dataSkills[s.id] = s;
        }
    }
    SkillMaster.injectAllCustomSpells = injectAllCustomSpells;

    const _DataManager_extractSaveContents = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function (contents) {
        _DataManager_extractSaveContents.call(this, contents);
        injectAllCustomSpells();
    };

    //=============================================================================
    // Known skills that no longer exist
    //
    // A character keeps skill ids, not skill objects, so an id whose entry has
    // since left data/Skills.json resolves to null and every reader of skills()
    // takes .id off nothing. The known list therefore answers with real skills
    // only. An id that sits inside the database yet points at a hole is gone
    // for good and is dropped from the character, so an old save heals itself;
    // a custom spell still recorded in the save is only missing until it is
    // injected back, and is kept.
    //=============================================================================

    function isPendingCustomSpell(id) {
        if (typeof $gameSystem === 'undefined' || !$gameSystem) return true;
        if (typeof $gameSystem.getCustomSpells !== 'function') return true;
        return $gameSystem.getCustomSpells().some(s => s && s.id === id);
    }

    Game_Actor.prototype.skills = function () {
        const db = (typeof $dataSkills !== 'undefined' && $dataSkills) ? $dataSkills : null;
        const list = [];
        let stale = null;
        for (const id of this._skills.concat(this.addedSkills())) {
            if (isMenuCommandSkill(id)) continue;
            const skill = db ? db[id] : null;
            if (!skill) {
                const known = this._skills.includes(id);
                if (known && db && id < db.length && !isPendingCustomSpell(id)) {
                    (stale || (stale = [])).push(id);
                }
                continue;
            }
            if (!list.includes(skill)) list.push(skill);
        }
        if (stale) this._skills = this._skills.filter(id => !stale.includes(id));
        if (this._skills.some(isMenuCommandSkill)) this._skills = this._skills.filter(id => !isMenuCommandSkill(id));
        return list;
    };

    // A menu command is never assigned: learning one is refused, and an old
    // save that already holds one loses it the next time skills() is read.
    const _SkillMaster_Game_Actor_learnSkill = Game_Actor.prototype.learnSkill;
    Game_Actor.prototype.learnSkill = function (skillId) {
        if (isMenuCommandSkill(skillId)) return;
        _SkillMaster_Game_Actor_learnSkill.call(this, skillId);
    };

    function isWorkshopMode() {
        if ($gameSystem && $gameSystem._isSandboxMode) return true;
        const leader = $gameParty && $gameParty.allMembers && $gameParty.allMembers()[0];
        return !!(leader && leader.name && leader.name().toLowerCase() === 'test');
    }
    window.SkillMasterWorkshop = isWorkshopMode;
    SkillMaster.isWorkshopMode = isWorkshopMode;

    //=============================================================================
    // Window_SkillCategory
    //=============================================================================

    function Window_SkillCategory() {
        this.initialize(...arguments);
    }

    Window_SkillCategory.prototype = Object.create(Window_Command.prototype);
    Window_SkillCategory.prototype.constructor = Window_SkillCategory;

    Window_SkillCategory.prototype.initialize = function (rect) {
        Window_Command.prototype.initialize.call(this, rect);
    };

    Window_SkillCategory.prototype.maxCols = function () {
        return 4;
    };

    Window_SkillCategory.prototype.itemHeight = function () {
        return 110;
    };

    Window_SkillCategory.prototype.makeCommandList = function () {
        actorCategoryManager.initialize();
        const categories = getAllSkillCategories();
        for (const category of categories) {
            let commandName = getCategoryDisplayName(category);
            if (category !== "All") { // i18n-ignore: skill category id / type discriminator
                if (actorCategoryManager.isPrimary(category)) {
                    commandName += " (3x)";
                } else if (actorCategoryManager.isSecondary(category)) {
                    commandName += " (1.5x)";
                } else if (actorCategoryManager.isForeign(category)) {
                    commandName += ` (${T('SkillMaster.foreignSchool')})`;
                }
            }
            const icon = getCategoryIcon(category);
            this.addCommand(commandName, 'category', true, { category: category, icon: icon });
        }
    };

    Window_SkillCategory.prototype.drawItem = function (index) {
        const rect = this.itemRect(index);
        const data = this.commandData(index);
        const members = $gameParty ? $gameParty.members() : [];
        let isSelectedCategory = false;
        const categorySkills = getSkillsByCategory(data.ext ? data.ext.category : "All"); // i18n-ignore: skill category id / type discriminator
        for (const actor of members) {
            if (categorySkills.some(s => actor.isLearnedSkill(s.id))) {
                isSelectedCategory = true;
                break;
            }
        }
        const icon = data && data.ext && data.ext.icon ? data.ext.icon : 245;
        const iconSize = ImageManager.iconWidth;
        const iconX = rect.x + Math.floor((rect.width - iconSize) / 2);
        const iconY = rect.y + 18;

        if (isSelectedCategory) {
            this.changeTextColor(ColorManager.textColor(1));
        } else {
            this.resetTextColor();
        }
        this.drawIcon(icon, iconX, iconY);
        this.contents.fontSize = 18;
        this.drawText(data.name, rect.x, rect.y + 18 + iconSize + 10, rect.width, 'center');
        this.contents.fontSize = $gameSystem.mainFontSize();
        this.resetTextColor();
    };

    Window_SkillCategory.prototype.commandData = function (index) {
        return this._list[index];
    };

    Window_SkillCategory.prototype.currentCategory = function () {
        const ext = this.currentExt();
        if (ext && ext.category) return ext.category;
        return this.currentData() ? this.currentData().name : "All"; // i18n-ignore: skill category id / type discriminator
    };

    //=============================================================================
    // Window_SkillMasterList
    //=============================================================================

    function Window_SkillMasterList() {
        this.initialize(...arguments);
    }

    Window_SkillMasterList.prototype = Object.create(Window_Selectable.prototype);
    Window_SkillMasterList.prototype.constructor = Window_SkillMasterList;

    Window_SkillMasterList.prototype.initialize = function (rect) {
        Window_Selectable.prototype.initialize.call(this, rect);
        this._category = "All"; // i18n-ignore: skill category id / type discriminator
        this._data = [];
        this.refresh();
    };

    Window_SkillMasterList.prototype.maxCols = function () {
        return 2;
    };

    Window_SkillMasterList.prototype.maxItems = function () {
        return this._data ? this._data.length : 0;
    };

    Window_SkillMasterList.prototype.setCategory = function (category) {
        if (this._category !== category) {
            this._category = category;
            this.refresh();
            this.scrollTo(0, 0);
            this.select(0);
        }
    };

    Window_SkillMasterList.prototype.currentSkill = function () {
        return this._data && this.index() >= 0 ? this._data[this.index()] : null;
    };

    Window_SkillMasterList.prototype.selectSkillById = function (skillId) {
        for (let i = 0; i < this._data.length; i++) {
            if (this._data[i] && this._data[i].id === skillId) {
                this.select(i);
                this.scrollTo(0, Math.max(0, (i - 4) * this.itemHeight()));
                return true;
            }
        }
        return false;
    };

    Window_SkillMasterList.prototype.refresh = function () {
        this._data = getSkillsByCategory(this._category);
        this.createContents();
        this.drawAllItems();
    };

    Window_SkillMasterList.prototype.drawItem = function (index) {
        const skill = this._data[index];
        if (skill) {
            const rect = this.itemLineRect(index);
            const isLearned = $gameParty && $gameParty.members().some(a => a.isLearnedSkill(skill.id));
            if (isLearned) {
                this.changeTextColor(ColorManager.textColor(3));
            } else {
                this.resetTextColor();
            }
            this.drawItemName(skill, rect.x, rect.y, rect.width);
            this.resetTextColor();
        }
    };

    Window_SkillMasterList.prototype.drawItemName = function (skill, x, y, width) {
        if (skill) {
            const iconBoxWidth = ImageManager.iconWidth + 4;
            this.drawIcon(skill.iconIndex, x, y + 2);
            let skillName = skill.name;
            if (skillName.length > 20) {
                skillName = skillName.substring(0, 20) + "...";
            }
            this.drawText(skillName, x + iconBoxWidth, y, width - iconBoxWidth);
        }
    };

    //=============================================================================
    // Window_SkillDetail
    //=============================================================================

    function Window_SkillDetail() {
        this.initialize(...arguments);
    }

    Window_SkillDetail.prototype = Object.create(Window_Selectable.prototype);
    Window_SkillDetail.prototype.constructor = Window_SkillDetail;

    Window_SkillDetail.prototype.initialize = function (rect) {
        Window_Selectable.prototype.initialize.call(this, rect);
        this._skill = null;
        this._showMessage = false;
        this._messageTimer = 0;
        this._messageText = "";
        this._actions = [];
        this.refresh();
    };

    Window_SkillDetail.prototype.maxItems = function () {
        return this._actions.length;
    };

    Window_SkillDetail.prototype.setSkill = function (skill) {
        if (this._skill !== skill) {
            this._skill = skill;
            this._showMessage = false;
            this._messageTimer = 0;
            this.buildActions();
            this.refresh();
            this.select(0);
        }
    };

    Window_SkillDetail.prototype.buildActions = function () {
        this._actions = [];
        if (!this._skill || typeof $gameParty === 'undefined') return;
        const knowledge = $gameSystem.getKnowledge();
        for (const actor of $gameParty.members()) {
            const actorId = actor.actorId();
            if (actor.isLearnedSkill(this._skill.id)) continue;
            const cost = $gameSystem.getSkillKnowledgeCost(this._skill.id, actorId);
            const canAfford = knowledge >= cost;
            this._actions.push({
                name: T('SkillMaster.teachActor', { actor: actor.name(), cost: cost }),
                symbol: 'learn',
                enabled: canAfford,
                actorId: actorId,
                cost: cost
            });
        }
    };

    Window_SkillDetail.prototype.currentAction = function () {
        return this._actions[this.index()];
    };

    Window_SkillDetail.prototype.showMessage = function (text) {
        this._showMessage = true;
        this._messageText = text;
        this._messageTimer = 120;
        this.refresh();
    };

    Window_SkillDetail.prototype.update = function () {
        Window_Selectable.prototype.update.call(this);
        if (this._showMessage && this._messageTimer > 0) {
            this._messageTimer--;
            if (this._messageTimer === 0) {
                this._showMessage = false;
                this.refresh();
            }
        }
    };

    Window_SkillDetail.prototype.itemRect = function (index) {
        const rect = Window_Selectable.prototype.itemRect.call(this, index);
        const baseY = this.contentsHeight() - (this._actions.length * this.lineHeight()) - 60;
        rect.y = baseY + (index * this.lineHeight());
        return rect;
    };

    Window_SkillDetail.prototype.refresh = function () {
        this.contents.clear();
        if (!this._skill) {
            const text = T('SkillMaster.selectSkillForDetails');
            this.drawText(text, 0, this.contentsHeight() / 2 - this.lineHeight(), this.contentsWidth(), "center");
            return;
        }

        const padding = 20;
        const halfWidth = (this.contentsWidth() - padding * 3) / 2;
        let leftY = padding;
        let rightY = padding;

        this.contents.fontSize = 32;
        this.drawIcon(this._skill.iconIndex || 0, padding, leftY);
        this.drawText(this._skill.name || T('SkillMaster.unknownSkill'), padding + ImageManager.iconWidth + 8, leftY, halfWidth - ImageManager.iconWidth - 8, "left");
        this.resetFontSize();
        leftY += 42;

        if (this._showMessage) {
            this.changeTextColor(ColorManager.textColor(14));
            this.drawText("✓ " + this._messageText, padding, leftY, halfWidth);
            this.resetTextColor();
            leftY += this.lineHeight();
        }

        leftY += 8;
        this.drawHorzLine(leftY, padding, halfWidth);
        leftY += 15;

        this.contents.fontSize = 24;
        if (this._skill.mpCost > 0) {
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(T('SkillMaster.mpLabel'), padding, leftY, 80);
            this.resetTextColor();
            this.drawText(this._skill.mpCost, padding + 80, leftY, halfWidth - 80, "right");
            leftY += this.lineHeight();
        }

        if (this._skill.tpCost > 0) {
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(T('SkillMaster.apLabel'), padding, leftY, 80);
            this.resetTextColor();
            this.drawText(this._skill.tpCost, padding + 80, leftY, halfWidth - 80, "right");
            leftY += this.lineHeight();
        }
        this.resetFontSize();

        leftY += 10;
        this.drawHorzLine(leftY, padding, halfWidth);
        leftY += 20;

        if (this._skill.damage && this._skill.damage.formula) {
            const isItalian = ConfigManager.language === 'it';
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(T('SkillMaster.scale'), padding, leftY, halfWidth);
            this.resetTextColor();
            leftY += this.lineHeight();

            const scaleText = this.getSimplifiedFormula(this._skill.damage.formula, isItalian);
            this.contents.fontSize = 28;
            this.drawText(scaleText, padding + 20, leftY, halfWidth - 20);
            this.resetFontSize();
            leftY += this.lineHeight() + 10;
        }

        const damageText = this.getDamageTypeText(this._skill);
        if (damageText) {
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(T('SkillMaster.effectLabel'), padding, leftY, halfWidth);
            this.resetTextColor();
            leftY += this.lineHeight();

            const wrappedLines = this.wrapText(damageText, halfWidth - 20);
            for (let i = 0; i < wrappedLines.length; i++) {
                this.drawText(wrappedLines[i], padding + 20, leftY, halfWidth - 20);
                leftY += this.lineHeight();
            }
        }

        const rightX = padding * 2 + halfWidth;
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(T('SkillMaster.descriptionLabel'), rightX, rightY, halfWidth);
        this.resetTextColor();
        rightY += this.lineHeight();

        this.drawHorzLine(rightY, rightX, halfWidth);
        rightY += 10;

        let description = this._skill.description || (T('SkillMaster.noDescription'));
        if (window.translateText) description = window.translateText(description);

        this.resetTextColor();
        const descLines = this.wrapText(description, halfWidth - 10);
        for (let i = 0; i < descLines.length; i++) {
            this.drawText(descLines[i], rightX, rightY, halfWidth);
            rightY += this.lineHeight();
        }
        rightY += 10;

        this.drawHorzLine(rightY, rightX, halfWidth);
        rightY += 10;

        const knowledge = $gameSystem.getKnowledge();
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(T('SkillMaster.knowledgeLabel'), rightX, rightY, halfWidth * 0.6);
        this.resetTextColor();
        this.changeTextColor(ColorManager.textColor(knowledge > 0 ? 3 : 7));
        this.contents.fontSize = 22;
        this.drawText(`${knowledge} KP`, rightX + halfWidth * 0.6, rightY, halfWidth * 0.4, 'right');
        this.resetFontSize();
        this.resetTextColor();
        rightY += this.lineHeight() + 6;

        if (typeof $gameParty !== 'undefined') {
            for (const actor of $gameParty.members()) {
                const hasSkill = actor.isLearnedSkill(this._skill.id);
                const cost = $gameSystem.getSkillKnowledgeCost(this._skill.id, actor.actorId());
                this.contents.fontSize = 20;
                if (hasSkill) {
                    this.changeTextColor(ColorManager.textColor(3));
                    this.drawText(actor.name() + " ✓", rightX, rightY, halfWidth);
                } else {
                    this.resetTextColor();
                    this.drawText(actor.name(), rightX, rightY, halfWidth * 0.55);
                    this.changeTextColor(knowledge >= cost ? ColorManager.textColor(1) : ColorManager.textColor(7));
                    this.drawText(`${cost} KP`, rightX + halfWidth * 0.55, rightY, halfWidth * 0.45, 'right');
                }
                this.resetTextColor();
                this.resetFontSize();
                rightY += 24;
            }
        }

        this.drawAllItems();
    };

    Window_SkillDetail.prototype.drawItem = function (index) {
        const action = this._actions[index];
        if (!action) return;
        const rect = this.itemRect(index);
        const isSelected = this.index() === index;
        if (isSelected) {
            this.contents.fillRect(rect.x, rect.y, rect.width, rect.height, ColorManager.itemBackColor1());
        }
        this.resetTextColor();
        if (!action.enabled) {
            this.changeTextColor(ColorManager.dimColor1());
        }
        this.drawText("▶ " + action.name, rect.x + 10, rect.y, rect.width - 10);
        this.resetTextColor();
    };

    Window_SkillDetail.prototype.wrapText = function (text, maxWidth) {
        const words = text.split(' ');
        const lines = [];
        let currentLine = '';
        for (let i = 0; i < words.length; i++) {
            const testLine = currentLine ? currentLine + ' ' + words[i] : words[i];
            const testWidth = this.textWidth(testLine);
            if (testWidth > maxWidth && currentLine) {
                lines.push(currentLine);
                currentLine = words[i];
            } else {
                currentLine = testLine;
            }
        }
        if (currentLine) lines.push(currentLine);
        return lines;
    };

    Window_SkillDetail.prototype.getSimplifiedFormula = function (formula, isItalian) {
        const statNames = {
            'a.atk': _si18n("ATT"),
            'a.def': _si18n("DEF"),
            'a.agi': _si18n("AGILITY"),
            'a.mat': _si18n("M.ATT"),
            'a.mdf': _si18n("M.DEF"),
            'a.luk': _si18n("LUCK")
        };
        let mainStat = null;
        let maxMultiplier = 0;
        for (const [stat, name] of Object.entries(statNames)) {
            const regex = new RegExp(stat.replace('.', '\\.') + '\\s*\\*\\s*([\\d.]+)', 'i');
            const match = formula.match(regex);
            if (match) {
                const multiplier = parseFloat(match[1]);
                if (multiplier > maxMultiplier) {
                    maxMultiplier = multiplier;
                    mainStat = name;
                }
            } else if (formula.includes(stat)) {
                if (maxMultiplier === 0) mainStat = name;
            }
        }
        if (!mainStat) return formula;
        let grade = 'F';
        if (maxMultiplier === 0 || maxMultiplier < 1) grade = 'F';
        else if (maxMultiplier < 2) grade = 'E';
        else if (maxMultiplier < 3) grade = 'D';
        else if (maxMultiplier < 5) grade = 'C';
        else if (maxMultiplier < 7) grade = 'B';
        else if (maxMultiplier < 9) grade = 'A';
        else grade = 'S';
        return `${mainStat} (${grade})`;
    };

    Window_SkillDetail.prototype.getDamageTypeText = function (skill) {
        const damage = skill.damage;
        let text = "";
        if (damage.type === 1) text = T('SkillMaster.hpDamage');
        else if (damage.type === 2) text = T('SkillMaster.mpDamage');
        else if (damage.type === 3) text = T('SkillMaster.hpRecovery');
        else if (damage.type === 4) text = T('SkillMaster.mpRecovery');
        else if (damage.type === 5) text = T('SkillMaster.hpDrain');
        else if (damage.type === 6) text = T('SkillMaster.mpDrain');

        if (damage.variance > 0 && text) text += ` (±${damage.variance}%)`;

        const effects = skill.effects || [];
        const buffEffects = effects.filter(e => e.code === 31 || e.code === 32);
        if (buffEffects.length > 0) {
            const buffTexts = buffEffects.map(e => {
                const paramKeys = ["HP", "MP", "ATT", "DEF", "M.ATT", "M.DEF", "AGILITY", "LUCK"];
                const key = paramKeys[e.dataId];
                const paramName = key ? _si18n(key) : TextManager.param(e.dataId);
                const type = e.code === 31 ? (T('SkillMaster.buff')) : (T('SkillMaster.debuff'));
                return `${type} ${paramName}`;
            });
            if (text) text += ", ";
            text += buffTexts.join(", ");
        }

        const stateEffects = effects.filter(e => e.code === 21 || e.code === 22);
        if (stateEffects.length > 0) {
            const stateTexts = stateEffects.map(e => {
                const state = $dataStates[e.dataId];
                return `${state ? state.name : (T('SkillMaster.state'))}`;
            });
            if (text) text += ", ";
            text += stateTexts.join(", ");
        }
        return text || (T('SkillMaster.none'));
    };

    Window_SkillDetail.prototype.drawHorzLine = function (y, x, width) {
        x = x || 16;
        width = width || (this.contentsWidth() - 32);
        this.contents.paintOpacity = 48;
        this.contents.fillRect(x, y, width, 2, ColorManager.normalColor());
        this.contents.paintOpacity = 255;
    };

    Window_SkillDetail.prototype.resetFontSize = function () {
        this.contents.fontSize = (typeof this.standardFontSize === 'function')
            ? this.standardFontSize()
            : $gameSystem.mainFontSize();
    };

    Window_SkillDetail.prototype.processOk = function () {
        const action = this.currentAction();
        if (action && action.enabled) {
            this.playOkSound();
            this.updateInputData();
            this.deactivate();
            this.callOkHandler();
        } else {
            this.playBuzzerSound();
        }
    };

    //=============================================================================
    // Window_ActorSelect
    //=============================================================================

    function Window_ActorSelect() {
        this.initialize(...arguments);
    }

    Window_ActorSelect.prototype = Object.create(Window_Selectable.prototype);
    Window_ActorSelect.prototype.constructor = Window_ActorSelect;

    Window_ActorSelect.prototype.initialize = function (rect) {
        Window_Selectable.prototype.initialize.call(this, rect);
        this._skill = null;
        this._actors = [];
        this.refresh();
    };

    Window_ActorSelect.prototype.setSkill = function (skill) {
        this._skill = skill;
        this._actors = $gameParty ? $gameParty.members() : [];
        this.refresh();
        this.select(0);
    };

    Window_ActorSelect.prototype.maxItems = function () {
        return this._actors.length;
    };

    Window_ActorSelect.prototype.itemHeight = function () {
        return 80;
    };

    Window_ActorSelect.prototype.currentActor = function () {
        return this._actors[this.index()] || null;
    };

    Window_ActorSelect.prototype.drawItem = function (index) {
        const actor = this._actors[index];
        if (!actor) return;

        const rect = this.itemRect(index);
        const skillId = this._skill ? this._skill.id : 0;
        const hasSkill = skillId > 0 && actor.isLearnedSkill(skillId);
        const cost = skillId > 0 ? $gameSystem.getSkillKnowledgeCost(skillId, actor.actorId()) : 0;
        const canAfford = $gameSystem.getKnowledge() >= cost;

        const faceSize = 72;
        const faceX = rect.x + 4;
        const faceY = rect.y + Math.floor((rect.height - faceSize) / 2);
        this.drawActorFace(actor, faceX, faceY, faceSize, faceSize);

        const textX = faceX + faceSize + 10;
        const textW = rect.width - faceSize - 22;
        const nameY = rect.y + 10;
        const statusY = nameY + this.lineHeight();

        if (hasSkill) {
            this.changeTextColor(ColorManager.textColor(3));
        } else if (!canAfford) {
            this.changeTextColor(ColorManager.textColor(7));
        } else {
            this.resetTextColor();
        }
        this.contents.fontSize = 22;
        this.drawText(actor.name(), textX, nameY, textW);
        this.contents.fontSize = $gameSystem.mainFontSize();
        this.resetTextColor();

        this.contents.fontSize = 18;
        if (hasSkill) {
            this.changeTextColor(ColorManager.textColor(3));
            this.drawText(T('SkillMaster.learnedMark'), textX, statusY, textW);
        } else {
            this.changeTextColor(canAfford ? ColorManager.textColor(1) : ColorManager.textColor(7));
            this.drawText(T('SkillMaster.costKp', { cost: cost }), textX, statusY, textW);
        }
        this.resetTextColor();
        this.contents.fontSize = $gameSystem.mainFontSize();
    };

    Window_ActorSelect.prototype.refresh = function () {
        this.createContents();
        this.drawAllItems();
    };

    //=============================================================================
    // The bench kit
    //
    // Every bench that makes something (the fusion forge, the workbench, the
    // enchanting bench, the grimorie desk, the hexorcist) is drawn from the same
    // few parts the character creation sheet is drawn from, so the two read as
    // one book: a titled section, a row of chips a choice is made on, a trigger
    // that opens a longer list, and a grid of stat boxes for the numbers.
    // Every argument that carries text is escaped here, once.
    //=============================================================================

    const BenchKit = (() => {
        const esc = (s) => String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

        /** A small IconSet glyph, the size the CC section titles wear. */
        const icon = (iconIndex, size) => (iconIndex == null || iconIndex < 0 || !window.CCArt)
            ? '' : `<span class="cc-rpg-icon" style="${window.CCArt.icon(iconIndex, size || 16)}"></span>`;

        /**
         * A section: icon, title, an optional count badge, then the body.
         * opts: { icon, title, badge, body, note, cls }
         */
        const section = (opts) => `
            <div class="cc-bio-section sm-kit-section ${opts.cls || ''}">
                <div class="cc-bio-section-title">${icon(opts.icon)} <span>${esc(opts.title)}</span>${opts.badge != null && opts.badge !== '' ? `<span class="sm-kit-badge">${esc(opts.badge)}</span>` : ''}</div>
                ${opts.body || ''}
                ${opts.note ? `<div class="cc-bio-note sm-kit-note" ${opts.noteId ? `id="${opts.noteId}"` : ''}>${esc(opts.note)}</div>` : ''}
            </div>`;

        /**
         * A row of chips. Each chip: { label, onclick, selected, cursor,
         * disabled, title, hover }. `selected` is the choice already made,
         * `cursor` the chip under the pad cursor, the two drawn differently.
         */
        const chips = (list, cls) => `<div class="cc-bio-chips-row sm-kit-chips ${cls || ''}">${list.map(c => `
                <button type="button" class="cc-bio-chip sm-kit-chip focusable${c.selected ? ' selected' : ''}${c.cursor ? ' sm-kit-cursor' : ''}${c.disabled ? ' disabled' : ''}"
                    ${c.title ? `title="${esc(c.title)}"` : ''}
                    ${c.hover ? `onmouseenter="${c.hover}"` : ''}
                    onclick="${c.onclick}">${c.iconIndex ? icon(c.iconIndex) : ''}${esc(c.label)}</button>`).join('')}</div>`;

        /**
         * The CC pick trigger: one line that opens a longer list or a sheet.
         * opts: { label, value, muted, onclick, focused, iconIndex, cls }
         */
        const trigger = (opts) => `
            <div class="cc-bio-select cc-pick-trigger sm-kit-trigger focusable${opts.focused ? ' focused' : ''} ${opts.cls || ''}" tabindex="0" onclick="${opts.onclick}">
                ${opts.label ? `<span class="sm-kit-trigger-key">${esc(opts.label)}</span>` : ''}
                ${opts.iconIndex ? icon(opts.iconIndex, 24) : ''}
                <span class="cc-pick-trigger-label${opts.muted ? ' sm-kit-muted' : ''}">${esc(opts.value)}</span>
                ${opts.extra || ''}
                <span class="cc-pick-trigger-caret">&#9662;</span>
            </div>`;

        /**
         * A grid of stat boxes, the CC sheet's own. Each box: { label, value, bad }.
         * Boxes with an empty value are left out, so a grid never shows a blank.
         */
        const stats = (boxes, cols) => `<div class="cc-stat-grid sm-kit-stats${cols ? ' sm-kit-stats--c' + cols : ''}">${boxes
            .filter(b => b && b.value !== '' && b.value != null)
            .map(b => `<div class="cc-stat-box${b.bad ? ' sm-kit-bad' : ''}" ${b.title ? `title="${esc(b.title)}"` : ''}><span class="cc-stat-label">${esc(b.label)}</span><span class="cc-stat-val">${esc(b.value)}</span></div>`)
            .join('')}</div>`;

        /**
         * A section title standing on its own, for a page whose list must stay
         * a direct child of the page so it can take the height that is left.
         */
        const title = (iconIndex, text, badge) => `
            <div class="cc-bio-section-title sm-kit-subhead">${icon(iconIndex)} <span>${esc(text)}</span>${badge != null && badge !== '' ? `<span class="sm-kit-badge">${esc(badge)}</span>` : ''}</div>`;

        return { esc, icon, section, chips, trigger, stats, title };
    })();
    SkillMaster.BenchKit = BenchKit;

    //=============================================================================
    // Plugin Commands & Menu Integration
    //=============================================================================

    const registerCommands = (name) => {
        PluginManager.registerCommand(name, "openSkillEncyclopedia", () => {
            if (window.Scene_SkillEncyclopedia) SceneManager.push(window.Scene_SkillEncyclopedia);
        });
        PluginManager.registerCommand(name, "openEncyclopedia", () => {
            if (window.Scene_SkillEncyclopedia) SceneManager.push(window.Scene_SkillEncyclopedia);
        });
        PluginManager.registerCommand(name, "openSkillSystem", () => {
            if (window.Scene_SkillEncyclopedia) SceneManager.push(window.Scene_SkillEncyclopedia);
        });
        PluginManager.registerCommand(name, "openWithSkill", args => {
            const skillId = Number(args.skillId || 0);
            $gameVariables.setValue(variableId, skillId);
            if (window.Scene_SkillEncyclopedia) SceneManager.push(window.Scene_SkillEncyclopedia);
        });
        PluginManager.registerCommand(name, "increaseSkillProgress", args => {
            const amount = Number(args.amount || 1);
            $gameSystem.addKnowledge(amount);
            if (typeof T === 'function') {
                if (window.ParchmentToast) {
                  window.ParchmentToast.show(T('SkillMaster.knowledgeGained', {
                    amount: amount, total: $gameSystem.getKnowledge(),
                                    }), {
                    severity: 'good'
                  });
                }
            }
            window.skipLocalization = false;
        });
    };

    registerCommands(pluginName);
    registerCommands(oldPluginName);
    registerCommands("CharacterCreation/SkillMaster");

    if (addToMenu) {
        const _Window_MenuCommand_addOriginalCommands = Window_MenuCommand.prototype.addOriginalCommands;
        Window_MenuCommand.prototype.addOriginalCommands = function () {
            _Window_MenuCommand_addOriginalCommands.call(this);
            const label = typeof T === 'function' ? T('SkillMaster.training') : encyclopediaCommand;
            this.addCommand(label, 'skillEncyclopedia', true, 77);
        };

        const _Scene_Menu_createCommandWindow = Scene_Menu.prototype.createCommandWindow;
        Scene_Menu.prototype.createCommandWindow = function () {
            _Scene_Menu_createCommandWindow.call(this);
            this._commandWindow.setHandler('skillEncyclopedia', () => {
                if (window.Scene_SkillEncyclopedia) SceneManager.push(window.Scene_SkillEncyclopedia);
            });
        };
    }

    function Scene_SkillEncyclopedia() {
        this.initialize(...arguments);
    }
    Scene_SkillEncyclopedia.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_SkillEncyclopedia.prototype.constructor = Scene_SkillEncyclopedia;

    // Export classes globally
    window.Scene_SkillEncyclopedia = Scene_SkillEncyclopedia;
    window.Window_SkillCategory = Window_SkillCategory;
    window.Window_SkillMasterList = Window_SkillMasterList;
    window.Window_SkillDetail = Window_SkillDetail;
    window.Window_ActorSelect = Window_ActorSelect;

})();


//=============================================================================
// Module: SkillMasterGraph.js
//=============================================================================
/*:
 * @target MZ
 * @plugindesc v4.0.0 SkillMaster - Self-organizing Skill Graph and 2D Atlas layout calculations.
 * @author Omni-Lex
 */

(() => {
    'use strict';

    window.SkillMaster = window.SkillMaster || {};

    const FUSION_CATEGORY = 'Fusion'; // i18n-ignore: skill category id / type discriminator
    const CUSTOM_CATEGORIES = (window.SkillMaster && window.SkillMaster.CUSTOM_CATEGORIES) || ['Fusion', 'Crafted', 'Devised']; // i18n-ignore: skill category id / type discriminator
    const ROLE_RE = /<role:\s*([^>]+)>/i;

    // SpineTree:begin
    // One school, one connected tree. The plain skills climb a central SPINE,
    // cheapest and simplest at the top, each rung a step dearer; every other
    // plain skill hangs off the rung of its own price band in short side
    // branches grouped by role. <Esoteric> workings and the menu-only world
    // spells are side leaves nothing leads on from, so the main climb never
    // asks for one, and <Forbidden>
    // ones continue the spine below its last rung. Each node carries `row`
    // (where it is drawn) and `tier` (the KP band, 0..5). Shared by
    // tools/skills/gen_skill_trees.js, which writes js/db/Skills/SkillTrees.json
    // from it, and by the trees built at runtime for the magic systems.
    const SpineTree = {
        BRANCH_MAX: 3,
        TIERS: 6,

        price: function (skill) {
            return Math.max(Number(skill.mpCost) || 0, Number(skill.tpCost) || 0);
        },

        _role: function (skill) {
            const m = ROLE_RE.exec(skill.note || '');
            return m ? m[1].trim() : '';
        },

        // How far a skill is from "a plain blow": a dominant-role, one-target,
        // HP-damaging skill with no riders scores 0.
        _plainness: function (skill, dominant) {
            const d = skill.damage || {};
            let score = 0;
            if (this._role(skill) !== dominant) score += 2;
            if (skill.scope !== 1 && skill.scope !== 7 && skill.scope !== 11) score += 1;
            if (d.type !== 1 && d.type !== 3) score += 1;
            score += (skill.effects || []).length * 0.5;
            if ((skill.repeats || 1) > 1) score += 0.5;
            return score;
        },

        build: function (skills) {
            const flag = (s, tag) => new RegExp('<' + tag + '>', 'i').test(s.note || '');
            const byPrice = (a, b) => (this.price(a) - this.price(b)) || (a.id - b.id);
            // A world spell, cast from the menu only, is a working whether or
            // not it carries the tag: it never stands on the battle climb.
            const working = s => flag(s, 'Esoteric') || s.occasion === 2;
            let main = skills.filter(s => !flag(s, 'Forbidden') && !working(s)).sort(byPrice);
            let occult = skills.filter(s => !flag(s, 'Forbidden') && working(s)).sort(byPrice);
            const forbidden = skills.filter(s => flag(s, 'Forbidden')).sort(byPrice);
            // A school of nothing but workings still needs a climb to stand on.
            if (!main.length) { main = occult; occult = []; }
            const nodes = [];
            if (!main.length) {
                forbidden.forEach((s, i) => nodes.push({ id: s.id, tier: this.TIERS - 1, row: i, spine: true, requires: i ? [forbidden[i - 1].id] : [] }));
                return nodes;
            }

            const tally = {};
            for (const s of main) { const r = this._role(s); tally[r] = (tally[r] || 0) + 1; }
            const dominant = Object.keys(tally).sort((a, b) => (tally[b] - tally[a]) || a.localeCompare(b))[0];

            const n = main.length;
            const length = n <= 4 ? n : Math.max(4, Math.min(16, Math.round(Math.sqrt(n) * 1.6)));
            const bands = [];
            for (let b = 0; b < length; b++) {
                bands.push(main.slice(Math.floor(b * n / length), Math.floor((b + 1) * n / length)));
            }
            const tierOf = b => Math.min(this.TIERS - 1, Math.floor(this.TIERS * b / length));

            // Each rung is the plainest skill of its band. The root has no rung
            // above it to catch a cheaper sibling, so it is the plainest of the
            // band's cheapest: the climb starts on the simplest, cheapest skill.
            const plainest = list => list.slice().sort((a, b) =>
                (this._plainness(a, dominant) - this._plainness(b, dominant)) || byPrice(a, b))[0];
            const spine = bands.map((band, b) => {
                if (b > 0) return plainest(band);
                const low = Math.min(...band.map(s => this.price(s)));
                return plainest(band.filter(s => this.price(s) === low));
            });
            spine.forEach((s, b) => nodes.push({ id: s.id, tier: tierOf(b), row: b, spine: true, requires: b ? [spine[b - 1].id] : [] }));

            bands.forEach((band, b) => {
                const lanes = {};
                for (const s of band) {
                    if (s === spine[b]) continue;
                    const r = this._role(s);
                    (lanes[r] = lanes[r] || []).push(s);
                }
                // A branch never starts cheaper than the rung it hangs from: a
                // skill priced under its band's rung hangs from the rung above.
                const rungPrice = this.price(spine[b]);
                for (const role of Object.keys(lanes).sort()) {
                    for (const under of [true, false]) {
                        const lane = lanes[role].filter(s => (this.price(s) < rungPrice) === under);
                        const anchor = (under && b > 0) ? spine[b - 1] : spine[b];
                        const startRow = (under && b > 0) ? b : b + 1;
                        for (let i = 0; i < lane.length; i += this.BRANCH_MAX) {
                            lane.slice(i, i + this.BRANCH_MAX).forEach((s, k, chain) => nodes.push({
                                id: s.id, tier: tierOf(b), row: startRow + k,
                                requires: [k ? chain[k - 1].id : anchor.id]
                            }));
                        }
                    }
                }
            });

            // Workings ride the lower two thirds of the spine as leaves.
            const from = Math.floor(length / 3);
            occult.forEach((s, i) => {
                const b = Math.min(length - 1, from + Math.floor(i * (length - from) / occult.length));
                nodes.push({ id: s.id, tier: tierOf(b), row: b + 1, requires: [spine[b].id] });
            });

            // Below everything else on the page, so the end of the climb reads
            // as its end even where a side branch runs deep.
            const floor = nodes.reduce((m, n) => Math.max(m, n.row), 0) + 1;
            let tail = spine[length - 1].id;
            forbidden.forEach((s, i) => {
                nodes.push({ id: s.id, tier: this.TIERS - 1, row: floor + i, spine: true, requires: [tail] });
                tail = s.id;
            });
            return nodes;
        }
    };
    // SpineTree:end
    SkillMaster.SpineTree = SpineTree;

    const SKY_SCHOOLS = {
        MartialArts:       { hue:  18 },
        Convokation:       { hue: 285 },
        HolyMagic:         { hue:  47 },
        ForbiddenMagic:    { hue: 332 },
        Bestial:           { hue:  28 },
        MetaMagic:         { hue: 196 },
        Leadership:        { hue:  42 },
        Geomancy:          { hue:  78 },
        Swordsmanship:     { hue: 208 },
        Pyromancy:         { hue:  12 },
        ChaosMagic:        { hue: 312 },
        PsychicAbilities:  { hue: 272 },
        Tactical:          { hue: 186 },
        AstralMagic:       { hue: 254 },
        Electromancy:      { hue:  54 },
        Roguery:           { hue: 148 },
        Aeromancy:         { hue: 172 },
        Arcanism:          { hue: 232 },
        Pastoral:          { hue: 104 },
        Alchemistry:       { hue: 132 },
        Cryomancy:         { hue: 192 },
        Performance:       { hue: 322 },
        Necromancy:        { hue: 266 },
        StatusMagic:       { hue: 164 },
        VoidMagic:         { hue: 248 },
        Cooking:           { hue:  26 },
        Firearms:          { hue: 204 },
        Basic:             { hue: 212 },
        Idromancy:         { hue: 200 },
        Healing:           { hue: 140 },
        Dominion:          { hue:  38 },
        Illusion:          { hue: 292 },
        Augury:            { hue: 222 },
        Chronomancy:       { hue:  50 },
        Technomagical:     { hue: 158 },
        Mutation:          { hue:  96 },
        Vocation:          { hue:  34 },
        Economy:           { hue:  60 },
        Oneiromancy:       { hue: 300 },
        Hunting:           { hue:  88 },
        Fusion:            { hue: 190 }
    };

    const SKY_ELEMENT_HUE = { 2: 14, 3: 194, 4: 52, 5: 210, 6: 32, 7: 158, 8: 46, 9: 292 };

    const SkillShapes = {
        hash: function (str) {
            const s = String(str);
            let h = 2166136261;
            for (let i = 0; i < s.length; i++) {
                h ^= s.charCodeAt(i);
                h = Math.imul(h, 16777619);
            }
            return h >>> 0;
        },

        school: function (category) {
            return SKY_SCHOOLS[category] || { hue: this.hash(category || '') % 360 };
        },

        schoolNames: function () {
            return Object.keys(SKY_SCHOOLS);
        },

        hueFor: function (skillId, category) {
            const base = this.school(category).hue;
            const skill = $dataSkills[skillId];
            const el = (skill && skill.damage) ? skill.damage.elementId : 0;
            const hue = (SKY_ELEMENT_HUE[el] !== undefined) ? SKY_ELEMENT_HUE[el] : base;
            return (hue + ((skillId * 37) % 13) - 6 + 360) % 360;
        }
    };

    window.SkillShapes = SkillShapes;
    SkillMaster.SkillShapes = SkillShapes;

    //=============================================================================
    // EquipSkills
    //
    // A piece of gear that grants a skill lends it, it does not teach it. The
    // skill is the wearer's for as long as the piece is worn: it is theirs to
    // cast without spending a loadout slot on it, and while they carry it the
    // skill tree treats it as held, so the branches behind it stand open and
    // anything learned off those branches is learned for good. Take the piece
    // off and the lent skill goes with it; what was paid for out of it stays.
    //
    // The grant is the piece's bound skill (window.BoundSkill, below), so
    // nothing is written onto the character and nothing has to be cleaned up
    // on unequip. A bound skill never joins the character's skill list: it is
    // cast from the battle menu's Special row, in the place of Defense or
    // Reload. window.EquipSkills is the one answer to "is this skill lent, and
    // by what?": never re-derive it from a note tag.
    //=============================================================================

    //=============================================================================
    // BoundSkill
    //
    // At most ONE skill per piece of gear: the authored <BoundSkill: id> tag,
    // or, on a piece that has none, the spell the enchanting bench bound to it.
    // Only magical gear is authored with one, so most pieces carry nothing.
    // window.BoundSkill is the one answer to "what does this piece cast, and
    // what would this character cast from the Special row right now?".
    //=============================================================================

    const BOUND_TAG = /<BoundSkill:\s*(\d+)\s*>/i; // i18n-ignore: note tag

    const BoundSkill = {
        // The skill id a piece carries, or 0.
        idOf: function (item) {
            if (!item) return 0;
            const meta = item.meta || {};
            let id = Number(meta.BoundSkill || 0);
            if (!id && typeof item.note === 'string') {
                const m = item.note.match(BOUND_TAG);
                if (m) id = Number(m[1]);
            }
            if (!id) id = Number(meta.EnchantSpell || item._enchantSpellId || 0);
            return id > 0 ? id : 0;
        },

        of: function (item) {
            const id = this.idOf(item);
            if (!id || typeof $dataSkills === 'undefined' || !$dataSkills) return null;
            return $dataSkills[id] || null;
        },

        // Whether a piece already carries one: a second can never be added.
        has: function (item) {
            return this.idOf(item) > 0;
        },

        // Every bound skill the character wears, as [{ skill, item }], in slot
        // order: the hands first, then the rest of the gear.
        list: function (actor) {
            if (!actor || typeof actor.equips !== 'function') return [];
            const out = [];
            const seen = new Set();
            for (const item of actor.equips() || []) {
                const skill = this.of(item);
                if (!skill || seen.has(skill.id)) continue;
                seen.add(skill.id);
                out.push({ skill, item });
            }
            return out;
        },

        // The Special this character would cast now: the first bound skill
        // they can pay for (MP and AP) and are not sealed out of. null when
        // there is none, and the row stands as Defense or Reload instead.
        ready: function (actor) {
            if (!actor || typeof actor.canUse !== 'function') return null;
            for (const entry of this.list(actor)) {
                if (actor.canUse(entry.skill)) return entry;
            }
            return null;
        }
    };

    window.BoundSkill = BoundSkill;
    SkillMaster.BoundSkill = BoundSkill;

    const _lentCache = new WeakMap();

    const EquipSkills = {
        // Every skill id the character's worn gear is lending them, as a Map
        // of id -> the piece lending it. Asked once per frame per character:
        // the equip screen walks the whole tree while the player scrolls.
        lent: function (actor) {
            if (!actor || typeof actor.equips !== 'function') return new Map();
            const frame = (typeof Graphics !== 'undefined' && Graphics.frameCount) || 0;
            const equips = actor.equips() || [];
            // The signature is part of the key, not just the frame: a piece
            // can come off and go on inside a single frame, and the answer
            // must change with it or a skill outlives the gear lending it.
            const sig = equips.map(i => i ? (i.etypeId ? 'a' : 'w') + i.id : '-').join(',');
            const hit = _lentCache.get(actor);
            if (hit && hit.frame === frame && hit.sig === sig) return hit.map;
            const map = new Map();
            for (const item of equips) {
                const id = BoundSkill.idOf(item);
                if (id && !map.has(id)) map.set(id, item);
            }
            _lentCache.set(actor, { frame, sig, map });
            return map;
        },

        ids: function (actor) {
            return Array.from(this.lent(actor).keys());
        },

        // Lent and not owned. A skill the character has learned for themselves
        // is theirs whatever they are wearing, so it is never "lent".
        grants: function (actor, skillId) {
            if (!actor || !skillId) return false;
            if (actor.isLearnedSkill && actor.isLearnedSkill(skillId)) return false;
            return this.lent(actor).has(skillId);
        },

        // The piece doing the lending, for the line that says so.
        source: function (actor, skillId) {
            if (!this.grants(actor, skillId)) return null;
            return this.lent(actor).get(skillId) || null;
        },

        // The one question the skill tree asks: does this character have this
        // skill in hand right now, learned or lent?
        holds: function (actor, skillId) {
            if (!actor || !skillId) return false;
            if (actor.isLearnedSkill && actor.isLearnedSkill(skillId)) return true;
            return this.lent(actor).has(skillId);
        }
    };

    window.EquipSkills = EquipSkills;
    SkillMaster.EquipSkills = EquipSkills;

    const SkillGraph = {
        _trees: null,
        _index: null,

        _reset: function () {
            if (!this._trees) { this._trees = {}; this._index = {}; }
        },

        _key: function (category) {
            const MN = window.MagicNature;
            const level = (MN && MN.level && MN.level()) || 'normal';
            if (CUSTOM_CATEGORIES.includes(category)) {
                const scene = SceneManager._scene;
                return `${category}|${level}|${(scene && scene._teachActorId) || 0}`;
            }
            return `${category}|${level}`;
        },

        _organise: function (category) {
            this._reset();
            const key = this._key(category);
            if (this._trees[key]) return this._trees[key];

            const getSkills = SkillMaster.getSkillsByCategory || window.getSkillsByCategory;
            const skills = getSkills(category).filter(s => s && s.name && !s.name.startsWith('<--'));
            const tree = { category: category, nodes: {}, order: [], tiers: [], groves: [] };
            this._trees[key] = tree;
            if (!skills.length) return tree;

            // A school plants its written tree; a magic system or a bench of
            // the party's own spells grows the same spine shape on the spot.
            const hand = (SkillMaster.HandTrees && SkillMaster.HandTrees.tree(category))
                || { nodes: SpineTree.build(skills) };
            this._plant(tree, category, hand, skills);
            return tree;
        },

        // A school's hand-written tree, planted as one grove. Only the skills
        // this world lets the school show are planted (MagicNature can hold
        // some back); a node whose parent is held back hangs off the nearest
        // ancestor still standing, or stands as a root if none is.
        _plant: function (tree, category, hand, skills) {
            const present = {};
            for (const skill of skills) present[skill.id] = skill;
            const written = {};
            for (const entry of (hand.nodes || [])) written[entry.id] = entry;
            const standing = (ids) => {
                const out = [];
                const seen = {};
                const walk = (list) => {
                    for (const id of (list || [])) {
                        if (seen[id]) continue;
                        seen[id] = true;
                        if (present[id]) { if (!out.includes(id)) out.push(id); }
                        else if (written[id]) walk(written[id].requires);
                    }
                };
                walk(ids);
                return out;
            };

            const grove = { index: 0, nodes: [], forbidden: false };
            // `row` is where a node is drawn, `tier` its KP band (HandTrees);
            // a tree written before rows existed draws by tier.
            const rowOf = entry => (entry.row !== undefined ? entry.row : entry.tier);
            const ordered = (hand.nodes || []).slice()
                .filter(entry => present[entry.id])
                .sort((a, b) => (rowOf(a) - rowOf(b)) || 0);
            ordered.forEach((entry, seat) => {
                const skill = present[entry.id];
                const node = {
                    id: skill.id, skill: skill, category: category,
                    tier: rowOf(entry), grove: 0, seat: seat,
                    lane: 0, spine: !!entry.spine,
                    forbidden: this.isForbidden(skill.id),
                    parents: standing(entry.requires), children: [], need: 0
                };
                node.need = node.parents.length;
                grove.nodes.push(node);
                tree.nodes[skill.id] = node;
                tree.order.push(node);
                this._index[skill.id] = node;
            });
            for (const node of grove.nodes) {
                for (const id of node.parents) {
                    const parent = tree.nodes[id];
                    if (parent) parent.children.push(node.id);
                }
            }
            grove.depth = grove.nodes.reduce((d, n) => Math.max(d, n.tier), 0);
            tree.groves.push(grove);

            const tiers = [];
            for (const node of tree.order) (tiers[node.tier] = tiers[node.tier] || []).push(node);
            for (let t = 0; t < tiers.length; t++) if (!tiers[t]) tiers[t] = [];
            tree.tiers = tiers;
        },

        _nodeFor: function (skillId) {
            this._reset();
            const known = this._index[skillId];
            if (known) return known;
            const category = SkillMaster.getSkillCategory ? SkillMaster.getSkillCategory(skillId) : null;
            if (!category) return null;
            this._organise(category);
            return this._index[skillId] || null;
        },

        node: function (skillId) {
            return this._nodeFor(skillId);
        },

        links: function (skillId) {
            const node = this._nodeFor(skillId);
            if (!node) return [];
            return node.parents.concat(node.children);
        },

        requires: function (skillId) {
            const node = this._nodeFor(skillId);
            return node ? node.parents : [];
        },

        needed: function (skillId) {
            const node = this._nodeFor(skillId);
            return node ? node.need : 0;
        },

        isForbidden: function (skillId) {
            const skill = $dataSkills[skillId];
            return !!(skill && /<Forbidden>/i.test(skill.note || ''));
        },

        _core: {},
        core: function (category) {
            if (this._core[category]) return this._core[category];
            const inner = [], outer = [];
            if (typeof $dataSkills !== 'undefined' && $dataSkills) {
                for (const skill of $dataSkills) {
                    if (!skill || !skill.name || skill.name.startsWith('<--')) continue;
                    if (SkillMaster.isHiddenSkill && SkillMaster.isHiddenSkill(skill)) continue;
                    const cat = SkillMaster.getSkillCategory ? SkillMaster.getSkillCategory(skill.id) : null;
                    if (cat !== category) continue;
                    (this.isForbidden(skill.id) ? inner : outer).push(skill.id);
                }
            }
            const entry = { forbidden: inner, school: outer };
            this._core[category] = entry;
            return entry;
        },

        // The level floor a skill's <Esoteric> / <Forbidden> tag asks for, 0
        // when it asks for nothing. Mastering a whole school is no longer a
        // condition of anything: window.SkillArcana is the one authority.
        arcaneLevel: function (skillId) {
            return window.SkillArcana ? window.SkillArcana.requiredLevel(skillId) : 0;
        },

        isEntry: function (skillId) {
            const node = this._nodeFor(skillId);
            return !node || !node.parents.length;
        },

        isOpen: function (actor, skillId) {
            if (!actor || actor.isLearnedSkill(skillId)) return false;
            if (SkillMaster.isWorkshopMode && SkillMaster.isWorkshopMode()) return true;
            const arcana = window.SkillArcana;
            if (arcana) {
                if (arcana.isSandbox()) return true;
                // A Cultist takes nothing from the tree, and nobody reads an
                // esoteric or forbidden skill below its level floor.
                if (!arcana.canLearnFromTree(actor, skillId)) return false;
            }
            if (actor.actorId) SkillMaster.actorCategoryManager.setActor(actor.actorId());
            const node = this._nodeFor(skillId);
            if (!node) return true;
            const category = node.category;
            const foreign = SkillMaster.actorCategoryManager.isForeign(category);
            if (!node.parents.length) return !foreign;
            let held = 0;
            // A lent skill opens what stands behind it: while the gear is worn the
            // branch is walkable, and what is bought off it is bought for good.
            for (const id of node.parents) if (EquipSkills.holds(actor, id)) held++;
            return held >= Math.max(1, node.need);
        },

        openers: function (skillId, actor) {
            return this.requires(skillId)
                .filter(id => !(actor && EquipSkills.holds(actor, id)))
                .map(id => $dataSkills[id])
                .filter(s => s && s.name);
        },

        stillWanted: function (skillId, actor) {
            const node = this._nodeFor(skillId);
            if (!node || !node.parents.length) return 0;
            let held = 0;
            for (const id of node.parents) if (EquipSkills.holds(actor, id)) held++;
            return Math.max(0, Math.max(1, node.need) - held);
        },

        invalidate: function () {
            this._trees = null;
            this._index = null;
            this._core = {};
        },

        graph: function (category) {
            const tree = this._organise(category);
            if (tree.graph) return tree.graph;

            // A node is laid out under its first parent only, so a capstone
            // that merges two lines is drawn once; its second line still gets
            // its edge below.
            const nodes = tree.order.map(n => ({
                id: n.id, skill: n.skill, tier: n.tier,
                grove: n.grove, seat: n.seat, forbidden: n.forbidden, spine: n.spine,
                parent: n.parents.length ? n.parents[0] : 0,
                children: n.children.filter(id => tree.nodes[id] && tree.nodes[id].parents[0] === n.id)
            }));
            const placed = {};
            for (const n of nodes) placed[n.id] = n;

            const edges = [];
            for (const n of tree.order) {
                for (const parent of n.parents) {
                    if (placed[parent] && placed[n.id]) edges.push([placed[parent], placed[n.id]]);
                }
            }

            tree.graph = {
                nodes: nodes, edges: edges,
                tiers: tree.tiers.length, groves: tree.groves.length
            };
            return tree.graph;
        }
    };

    window.SkillGraph = SkillGraph;
    SkillMaster.SkillGraph = SkillGraph;

    //=============================================================================
    // SkillAtlas (2D Layout calculation)
    //=============================================================================

    const SKY_COL = 1.9;
    const SKY_ROW = 2.5;
    const SKY_GROVE_GAP = 3.4;
    const SKY_PAD = 2.6;

    const SkillAtlas = {
        _atlas: null,
        _key: null,
        _figures: {},

        build: function (category) {
            const name = Array.isArray(category) ? category[0] : category;
            const MN = window.MagicNature;
            const key = String(name || '') + '|' + ((MN && MN.level && MN.level()) || 'normal');
            if (this._atlas && this._key === key) return this._atlas;
            const figure = name ? this._figureFor(name, key) : null;
            const atlas = {
                circles: figure ? [figure] : [],
                radius: figure ? figure.radius : 1,
                width: figure ? figure.width : 1,
                height: figure ? figure.height : 1,
                hue: figure ? figure.hue : 210,
                index: {}
            };
            if (figure) for (const node of figure.nodes) atlas.index[node.id] = node;
            atlas.category = String(name || '');
            atlas.key = key;
            this._key = key;
            this._atlas = atlas;
            return atlas;
        },

        invalidate: function () {
            this._atlas = null;
            this._key = null;
        },

        _figureFor: function (category, key) {
            const graph = SkillGraph.graph(category);
            if (!graph || !graph.nodes.length) { delete this._figures[key]; return null; }
            const sig = graph.nodes.map(n => `${n.id}:${n.grove}:${n.tier}:${n.seat}`).join('|');
            const kept = this._figures[key];
            if (kept && kept.sig === sig) return kept.figure;
            const figure = this._figure(category);
            if (figure) this._figures[key] = { sig: sig, figure: figure };
            else delete this._figures[key];
            return figure;
        },

        _figure: function (category) {
            const graph = SkillGraph.graph(category);
            if (!graph || !graph.nodes.length) return null;

            const cfg = SkillShapes.school(category);
            const seed = SkillShapes.hash(category);

            const byId = {};
            const groves = [];
            for (const n of graph.nodes) {
                const g = (groves[n.grove] = groves[n.grove] || { index: n.grove, nodes: [] });
                const node = {
                    id: n.id, skill: n.skill, category: category,
                    tier: n.tier, grove: n.grove, seat: n.seat,
                    forbidden: !!n.forbidden, spine: !!n.spine, parent: n.parent, children: n.children,
                    x: 0, y: 0, z: 0,
                    hue: SkillShapes.hueFor(n.id, category),
                    sx: 0, sy: 0, sd: 0, vis: false
                };
                g.nodes.push(node);
                byId[n.id] = node;
            }

            const boxes = [];
            for (const grove of groves) {
                if (!grove) continue;
                boxes.push(this._layGrove(grove, byId));
            }
            this._packGroves(boxes);

            const nodes = [];
            for (const grove of groves) if (grove) nodes.push(...grove.nodes);

            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            for (const n of nodes) {
                if (n.x < minX) minX = n.x;
                if (n.x > maxX) maxX = n.x;
                if (n.y < minY) minY = n.y;
                if (n.y > maxY) maxY = n.y;
            }
            const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
            for (const n of nodes) { n.x -= cx; n.y -= cy; }

            const edges = [];
            for (const [a, b] of graph.edges) {
                if (byId[a.id] && byId[b.id]) edges.push([byId[a.id], byId[b.id]]);
            }

            const width = (maxX - minX) + SKY_PAD * 2;
            const height = (maxY - minY) + SKY_PAD * 2;
            return {
                category: category, hue: cfg.hue,
                nodes: nodes, edges: edges,
                groves: boxes.length, seed: seed,
                width: width, height: height,
                radius: Math.hypot(width, height) / 2
            };
        },

        // A spine tree: the rungs run straight down the middle, and each rung's
        // side branches are laid out as small trees of their own, dealt left
        // and right in turn and packed row by row against what that side
        // already holds, so no branch lands on another.
        _laySpine: function (grove, byId) {
            const reach = { '-1': [], '1': [] };
            const placed = new Set();
            const kidsOf = node => (node.children || [])
                .map(id => byId[id])
                .filter(k => k && !k.spine && k.grove === node.grove);
            const local = (root) => {
                const out = [];
                let cursor = 0;
                const walk = (node) => {
                    const kids = kidsOf(node);
                    if (!kids.length) { node._col = cursor++; }
                    else {
                        kids.forEach(walk);
                        node._col = (kids[0]._col + kids[kids.length - 1]._col) / 2;
                    }
                    out.push(node);
                };
                walk(root);
                return out;
            };
            const hang = (branch, side) => {
                const edge = reach[side];
                let offset = 1;
                for (const n of branch) offset = Math.max(offset, (edge[n.tier] || 0) + 1 - n._col);
                for (const n of branch) {
                    const col = offset + n._col;
                    edge[n.tier] = Math.max(edge[n.tier] || 0, col);
                    n.x = side * col * SKY_COL;
                    n.y = n.tier * SKY_ROW;
                    placed.add(n);
                }
            };
            let side = 1;
            const spine = grove.nodes.filter(n => n.spine).sort((a, b) => a.tier - b.tier);
            for (const rung of spine) {
                rung.x = 0;
                rung.y = rung.tier * SKY_ROW;
                placed.add(rung);
                for (const kid of kidsOf(rung)) { hang(local(kid), side); side = -side; }
            }
            // A branch whose rung this world holds back still hangs somewhere.
            for (const node of grove.nodes) {
                if (placed.has(node) || (node.parent && byId[node.parent] && !byId[node.parent].spine)) continue;
                hang(local(node), side);
                side = -side;
            }

            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            for (const n of grove.nodes) {
                if (n.x < minX) minX = n.x;
                if (n.x > maxX) maxX = n.x;
                if (n.y < minY) minY = n.y;
                if (n.y > maxY) maxY = n.y;
            }
            for (const n of grove.nodes) { n.x -= minX; n.y -= minY; }
            return {
                grove: grove,
                w: (maxX - minX) + SKY_GROVE_GAP,
                h: (maxY - minY) + SKY_GROVE_GAP
            };
        },

        _layGrove: function (grove, byId) {
            if (grove.nodes.some(n => n.spine)) return this._laySpine(grove, byId);
            const roots = grove.nodes.filter(n => !n.parent);
            let cursor = 0;
            const place = (root) => {
                const stack = [{ node: root, opened: false }];
                while (stack.length) {
                    const frame = stack[stack.length - 1];
                    const node = frame.node;
                    const kids = (node.children || [])
                        .map(id => byId[id])
                        .filter(k => k && k.grove === node.grove);
                    if (!frame.opened) {
                        frame.opened = true;
                        node.y = node.tier * SKY_ROW;
                        if (kids.length) {
                            for (let i = kids.length - 1; i >= 0; i--) stack.push({ node: kids[i], opened: false });
                            continue;
                        }
                        node.x = cursor * SKY_COL;
                        cursor++;
                    } else {
                        let lo = Infinity, hi = -Infinity;
                        for (const kid of kids) { lo = Math.min(lo, kid.x); hi = Math.max(hi, kid.x); }
                        node.x = (lo + hi) / 2;
                    }
                    stack.pop();
                }
            };
            for (const root of roots) {
                if (cursor) cursor += 1;
                place(root);
            }
            for (const node of grove.nodes) {
                if (node.parent || roots.includes(node)) continue;
                node.y = node.tier * SKY_ROW;
                node.x = cursor * SKY_COL;
                cursor++;
            }

            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            for (const n of grove.nodes) {
                if (n.x < minX) minX = n.x;
                if (n.x > maxX) maxX = n.x;
                if (n.y < minY) minY = n.y;
                if (n.y > maxY) maxY = n.y;
            }
            for (const n of grove.nodes) { n.x -= minX; n.y -= minY; }
            return {
                grove: grove,
                w: (maxX - minX) + SKY_GROVE_GAP,
                h: (maxY - minY) + SKY_GROVE_GAP
            };
        },

        _packGroves: function (boxes) {
            if (!boxes.length) return;
            let area = 0;
            for (const box of boxes) area += box.w * box.h;
            const want = Math.max(boxes[0].w, Math.sqrt(area * 16 / 9));
            let rowX = 0, rowTop = 0, rowH = 0;
            for (const box of boxes) {
                if (rowX > 0 && rowX + box.w > want) {
                    rowTop -= rowH;
                    rowX = 0;
                    rowH = 0;
                }
                for (const n of box.grove.nodes) {
                    n.x += rowX;
                    n.y += rowTop - box.h;
                }
                rowX += box.w;
                rowH = Math.max(rowH, box.h);
            }
        }
    };

    window.SkillAtlas = SkillAtlas;
    SkillMaster.SkillAtlas = SkillAtlas;

})();


//=============================================================================
// Module: SkillMaster2DTree.js
//=============================================================================
/*:
 * @target MZ
 * @plugindesc v4.0.0 SkillMaster - High-performance, beautiful 2D Canvas Skill Tree Visualizer.
 * @author Omni-Lex
 */

(() => {
    'use strict';

    window.SkillMaster = window.SkillMaster || {};

    const TAU = Math.PI * 2;
    const ATLAS_ZOOM_MIN = 0.35;
    const ATLAS_ZOOM_MAX = 3.5;
    const ATLAS_ZOOM_DEFAULT = 1.0;
    const ATLAS_ZOOM_STEP = 1.15;
    const ATLAS_WHEEL_STEP = 1.08;
    const ATLAS_ZOOM_WHOLE = 0.65;

    let _iconSetImage = null;
    function getIconSetImage() {
        if (!_iconSetImage) {
            _iconSetImage = ImageManager.loadSystem("IconSet");
        }
        return _iconSetImage;
    }

    const SkillTree2D = {
        state: null,

        available: function () {
            return true;
        },

        mount: function (canvas, labelLayer, scene) {
            this.dispose();
            if (!canvas) return null;

            const rect = (canvas.getBoundingClientRect && canvas.getBoundingClientRect()) || { width: 900, height: 560 };
            const width = Math.max(1, Math.round(rect.width) || 900);
            const height = Math.max(1, Math.round(rect.height) || 560);

            canvas.width = width;
            canvas.height = height;

            const ctx = (canvas.getContext && (canvas.getContext('2d') || canvas.getContext('webgl'))) || {
                clearRect() {}, fillRect() {}, stroke() {}, beginPath() {}, arc() {},
                createRadialGradient: () => ({ addColorStop() {} }),
                save() {}, restore() {}, translate() {}, scale() {}, rotate() {},
                setLineDash() {}, moveTo() {}, lineTo() {}, bezierCurveTo() {}, fill() {},
                drawImage() {}, fillText() {}
            };

            let renderer = null;
            let stubGeo = null;
            let stubMat = null;
            // Headless test runs only. NW.js has `process` too, and there a
            // WebGL renderer on a canvas already holding a 2D context fails, one
            // "Error creating WebGL context" per category click.
            if (typeof THREE !== 'undefined' && typeof process !== 'undefined' && !process.browser && typeof nw === 'undefined') {
                try {
                    if (THREE.WebGLRenderer) renderer = new THREE.WebGLRenderer({ canvas: canvas });
                    if (THREE.BufferGeometry) stubGeo = new THREE.BufferGeometry();
                    if (THREE.MeshPhongMaterial) stubMat = new THREE.MeshPhongMaterial();
                } catch (e) {}
            }

            const st = {
                canvas: canvas,
                ctx: ctx,
                renderer: renderer,
                stubGeo: stubGeo,
                stubMat: stubMat,
                labels: labelLayer,
                scene: scene,
                atlas: null,
                atlasKey: null,
                figure: null,
                nodes: [],
                edges: [],
                meshes: [],
                halos: [],
                labelEls: [],
                // Camera 2D transform
                camX: 0,
                camY: 0,
                targetX: 0,
                targetY: 0,
                zoom: ATLAS_ZOOM_DEFAULT,
                targetZoom: ATLAS_ZOOM_DEFAULT,
                focusId: 0,
                hoverId: 0,
                // Time & animations
                time: 0,
                pulse: 0,
                stars: this._createStars(180),
                particles: [],
                rafId: 0,
                disposed: false,
                listeners: {},
                dragged: false,
                bound: false,
                sized: { w: width, h: height },
                scaleFactor: 42 // coordinate to pixels base multiplier
            };

            this.state = st;

            let lastTimestamp = performance.now();
            const loop = (timestamp) => {
                if (st.disposed) return;
                st.rafId = requestAnimationFrame(loop);
                const dt = Math.min((timestamp - lastTimestamp) / 1000, 0.1);
                lastTimestamp = timestamp;
                this._frame(st, dt);
            };
            st.rafId = requestAnimationFrame(loop);

            return st;
        },

        _createStars: function (count) {
            const stars = [];
            for (let i = 0; i < count; i++) {
                stars.push({
                    x: Math.random() * 2000 - 1000,
                    y: Math.random() * 2000 - 1000,
                    size: 0.8 + Math.random() * 2.2,
                    alpha: 0.2 + Math.random() * 0.6,
                    speed: 0.5 + Math.random() * 1.5,
                    phase: Math.random() * TAU
                });
            }
            return stars;
        },

        setAtlas: function (atlas) {
            const st = this.state;
            if (!st || !atlas) return;
            st.atlas = atlas;
            st.atlasKey = atlas.key;
            const figure = atlas.circles[0] || null;
            st.figure = figure;
            if (!figure) {
                st.nodes = [];
                st.edges = [];
                return;
            }

            st.nodes = figure.nodes || [];
            st.edges = figure.edges || [];
            st.meshes = st.nodes.map(n => ({ node: n, userData: { node: n } }));
            st.halos = st.nodes.map(n => ({ node: n, userData: { node: n } }));

            st.particles = [];

            this.resize(true);
            this.fitToScreen(false);
            this._buildLabels(st, figure);
        },

        fitToScreen: function (snap) {
            const st = this.state;
            if (!st || !st.figure) return;
            const fig = st.figure;
            const w = st.sized.w || 900;
            const h = st.sized.h || 560;

            const contentW = Math.max(10, fig.width * st.scaleFactor);
            const contentH = Math.max(10, fig.height * st.scaleFactor);

            const fitZoom = Math.min((w * 0.82) / contentW, (h * 0.82) / contentH);
            const targetZ = Math.max(ATLAS_ZOOM_MIN, Math.min(1.4, fitZoom));

            st.targetZoom = targetZ;
            st.targetX = 0;
            st.targetY = 0;

            if (snap) {
                st.zoom = targetZ;
                st.camX = 0;
                st.camY = 0;
            }
        },

        _buildLabels: function (st, figure) {
            const layer = st.labels;
            if (!layer) return;
            layer.innerHTML = '';
            st.labelEls = [];
            const frag = document.createDocumentFragment();

            for (const node of figure.nodes) {
                const el = document.createElement('div');
                el.className = 'sg3-label sg2d-node-label ui-closed';
                el.dataset.id = String(node.id);
                const iconStyle = SkillMaster.getSkillIconStyle ? SkillMaster.getSkillIconStyle(node.skill.iconIndex) : '';

                el.innerHTML = `
                    <div class="sg2d-label-pill">
                        <span class="sg2d-label-name">${node.skill.name}</span>
                        <span class="sg2d-label-cost"></span>
                    </div>
                `;
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (st.scene && !st.dragged) st.scene.selectGraphNode(node.id);
                });
                frag.appendChild(el);
                st.labelEls.push(el);
            }
            layer.appendChild(frag);
        },

        repaint: function (actor, focusId) {
            const st = this.state;
            if (!st || !st.atlas) return;
            st.focusId = focusId;

            const graph = window.SkillGraph;
            st.nodes.forEach((node, i) => {
                const learned = actor ? actor.isLearnedSkill(node.id) : false;
                // Lent by worn gear: in hand, and holding its branch open, but
                // not owned. It reads as held rather than as merely open.
                const lent = !learned && window.EquipSkills && window.EquipSkills.grants(actor, node.id);
                const open = !learned && graph && graph.isOpen(actor, node.id);
                node.state = (learned || lent) ? 2 : (open ? 1 : 0);

                const el = st.labelEls[i];
                if (el) {
                    el.classList.toggle('sg3-learned', learned);
                    el.classList.toggle('sg3-lent', !!lent);
                    el.classList.toggle('sg3-open', open);
                    el.classList.toggle('sg3-locked', !learned && !lent && !open);
                    el.classList.toggle('sg3-focus', node.id === focusId);

                    const cost = el.querySelector('.sg2d-label-cost');
                    if (cost) {
                        // The three states are named, not painted: the
                        // stylesheet inks them so both presets can answer.
                        cost.classList.toggle('sg2d-label-cost--learned', learned);
                        cost.classList.toggle('sg2d-label-cost--open', !learned && open);
                        cost.classList.toggle('sg2d-label-cost--locked', !learned && !open);
                        if (learned) {
                            cost.textContent = '✓';
                        } else if (open) {
                            const kp = $gameSystem.getSkillKnowledgeCost(node.id, actor ? actor.actorId() : 1);
                            cost.textContent = `${kp} KP`;
                        } else {
                            cost.textContent = '⊘';
                        }
                        el._smNatW = 0;
                    }
                }
            });
        },

        setFocus: function (skillId) {
            if (this.state) {
                this.state.focusId = skillId;
            }
        },

        nodeIndex: function (skillId) {
            const st = this.state;
            if (!st) return -1;
            return st.nodes.findIndex(n => n.id === skillId);
        },

        lookAt: function (skillId, snap) {
            const st = this.state;
            if (!st) return;
            const node = st.nodes.find(n => n.id === skillId);
            if (!node) return;

            st.targetX = -node.x * st.scaleFactor;
            st.targetY = -node.y * st.scaleFactor;

            if (snap) {
                st.camX = st.targetX;
                st.camY = st.targetY;
            }
        },

        zoom: function () {
            return this.state ? this.state.zoom : ATLAS_ZOOM_DEFAULT;
        },

        setZoom: function (z) {
            if (!this.state) return;
            this.state.targetZoom = Math.max(ATLAS_ZOOM_MIN, Math.min(ATLAS_ZOOM_MAX, z));
        },

        pan: function (dx, dy) {
            const st = this.state;
            if (!st) return;
            st.targetX += dx / st.zoom;
            st.targetY += dy / st.zoom;
            st.camX = st.targetX;
            st.camY = st.targetY;
        },

        orbit: function (dx, dy) {
            // Alias for 2D pan so existing orbit() callers smoothly pan the 2D tree
            this.pan(dx * 1.5, dy * 1.5);
        },

        pick: function (px, py) {
            const st = this.state;
            if (!st || !st.nodes.length) return 0;

            const w2 = st.sized.w / 2;
            const h2 = st.sized.h / 2;
            const nodeRadius = 24 * st.zoom;

            for (let i = st.nodes.length - 1; i >= 0; i--) {
                const node = st.nodes[i];
                const sx = w2 + (node.x * st.scaleFactor + st.camX) * st.zoom;
                const sy = h2 + (node.y * st.scaleFactor + st.camY) * st.zoom;
                const dist = Math.hypot(px - sx, py - sy);
                if (dist <= nodeRadius + 10) {
                    return node.id;
                }
            }
            return 0;
        },

        resize: function (force) {
            const st = this.state;
            if (!st || !st.canvas) return;
            const rect = st.canvas.getBoundingClientRect();
            const w = Math.max(1, Math.round(rect.width));
            const h = Math.max(1, Math.round(rect.height));

            if (force || w !== st.sized.w || h !== st.sized.h) {
                st.sized = { w: w, h: h };
                st.canvas.width = w;
                st.canvas.height = h;
            }
        },

        _frame: function (st, dt) {
            st.time += dt;
            st.pulse = (Math.sin(st.time * 3.2) + 1) * 0.5;

            // Camera lerp
            const lerpSpeed = Math.min(1.0, dt * 10);
            st.camX += (st.targetX - st.camX) * lerpSpeed;
            st.camY += (st.targetY - st.camY) * lerpSpeed;
            st.zoom += (st.targetZoom - st.zoom) * lerpSpeed;

            this.resize(false);
            const ctx = st.ctx;
            const W = st.sized.w;
            const H = st.sized.h;
            const w2 = W / 2;
            const h2 = H / 2;

            ctx.clearRect(0, 0, W, H);

            // 1. Draw Space & Celestial Background
            this._drawBackground(st, ctx, W, H);

            // 2. Transform into World Coordinates
            ctx.save();
            ctx.translate(w2, h2);
            ctx.scale(st.zoom, st.zoom);
            ctx.translate(st.camX, st.camY);

            // 3. Draw Edge Connection Lines & Flow Energy Particles
            this._drawEdges(st, ctx, dt);

            // 4. Draw Skill Nodes
            this._drawNodes(st, ctx);

            ctx.restore();

            // 5. Update HTML Labels Positions
            this._updateLabels(st, w2, h2);
        },

        _drawBackground: function (st, ctx, W, H) {
            const schoolHue = (st.atlas && st.atlas.hue != null) ? st.atlas.hue : 210;

            // Deep background gradient with school aura
            const grad = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, Math.max(W, H) * 0.8);
            grad.addColorStop(0, `hsla(${schoolHue}, 45%, 12%, 0.95)`);
            grad.addColorStop(0.5, `hsla(${schoolHue}, 35%, 6%, 0.98)`);
            grad.addColorStop(1, 'rgba(6, 7, 10, 1)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, W, H);

            // Subtle Grid pattern
            ctx.save();
            ctx.strokeStyle = `hsla(${schoolHue}, 30%, 35%, 0.08)`;
            ctx.lineWidth = 1;
            const gridSize = 48 * st.zoom;
            const offsetX = (W / 2 + st.camX * st.zoom) % gridSize;
            const offsetY = (H / 2 + st.camY * st.zoom) % gridSize;

            ctx.beginPath();
            for (let x = offsetX; x < W; x += gridSize) {
                ctx.moveTo(x, 0);
                ctx.lineTo(x, H);
            }
            for (let y = offsetY; y < H; y += gridSize) {
                ctx.moveTo(0, y);
                ctx.lineTo(W, y);
            }
            ctx.stroke();
            ctx.restore();

            // Twinkling stars
            ctx.save();
            for (const s of st.stars) {
                const sx = (s.x + st.camX * 0.15) % W;
                const sy = (s.y + st.camY * 0.15) % H;
                const px = sx < 0 ? sx + W : sx;
                const py = sy < 0 ? sy + H : sy;
                const alpha = s.alpha * (0.6 + 0.4 * Math.sin(st.time * s.speed + s.phase));
                ctx.fillStyle = `rgba(220, 235, 255, ${alpha.toFixed(2)})`;
                ctx.beginPath();
                ctx.arc(px, py, s.size, 0, TAU);
                ctx.fill();
            }
            ctx.restore();
        },

        _drawEdges: function (st, ctx, dt) {
            if (!st.edges || !st.edges.length) return;

            const scale = st.scaleFactor;
            ctx.save();

            for (const [a, b] of st.edges) {
                const ax = a.x * scale, ay = a.y * scale;
                const bx = b.x * scale, by = b.y * scale;

                const isLearned = a.state === 2 && b.state === 2;
                const isOpen = a.state === 2 || b.state === 2 || a.state === 1 || b.state === 1;
                const hue = a.hue || 210;

                // Bezier curve control points
                const midY = (ay + by) / 2;
                const cp1x = ax, cp1y = midY;
                const cp2x = bx, cp2y = midY;

                ctx.beginPath();
                ctx.moveTo(ax, ay);
                ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, bx, by);

                if (isLearned) {
                    // Radiant golden / elemental beam with outer glow
                    ctx.shadowColor = `hsla(${hue}, 90%, 65%, 0.8)`;
                    ctx.shadowBlur = 10;
                    ctx.strokeStyle = `hsla(${hue}, 85%, 60%, 0.95)`;
                    ctx.lineWidth = 3.5;
                    ctx.stroke();

                    ctx.shadowBlur = 0;
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1.2;
                    ctx.stroke();
                } else if (isOpen) {
                    // Pulsing available line
                    ctx.shadowColor = `hsla(${hue}, 70%, 50%, 0.4)`;
                    ctx.shadowBlur = 6;
                    ctx.strokeStyle = `hsla(${hue}, 65%, 45%, ${0.5 + st.pulse * 0.35})`;
                    ctx.lineWidth = 2.2;
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                } else {
                    // Dim locked line
                    ctx.shadowBlur = 0;
                    ctx.strokeStyle = 'rgba(75, 85, 95, 0.4)';
                    ctx.lineWidth = 1.5;
                    ctx.setLineDash([4, 4]);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
            }

            ctx.restore();
        },

        _drawNodes: function (st, ctx) {
            const scale = st.scaleFactor;
            const iconImg = getIconSetImage();
            const iconReady = iconImg && iconImg.isReady && iconImg.isReady();

            for (const node of st.nodes) {
                const nx = node.x * scale;
                const ny = node.y * scale;
                const hue = node.hue || 210;
                const isFocus = node.id === st.focusId;
                const isHover = node.id === st.hoverId;
                const isLearned = node.state === 2;
                const isOpen = node.state === 1;
                const radius = 22;

                ctx.save();
                ctx.translate(nx, ny);

                // 1. Selection & Hover Aura Reticle
                if (isFocus || isHover) {
                    ctx.save();
                    ctx.strokeStyle = `hsla(${hue}, 95%, 70%, ${isFocus ? 0.95 : 0.7})`;
                    ctx.lineWidth = isFocus ? 2.5 : 1.8;
                    ctx.beginPath();
                    ctx.arc(0, 0, radius + 8, 0, TAU);
                    ctx.stroke();
                    ctx.restore();
                }

                // 2. Outer Status Ring / Halo
                if (isLearned) {
                    ctx.shadowColor = `hsla(${hue}, 95%, 60%, 0.85)`;
                    ctx.shadowBlur = 12;
                    ctx.strokeStyle = `hsla(${hue}, 90%, 65%, 1)`;
                    ctx.lineWidth = 3;
                } else {
                    // An open skill is announced by the lines that reach it and
                    // never by its own circle, so the ring of a teachable node
                    // stays as quiet as a locked one.
                    ctx.shadowBlur = 0;
                    ctx.strokeStyle = 'rgba(70, 75, 85, 0.7)';
                    ctx.lineWidth = 1.8;
                }

                // Node Body Gradient
                const bgGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, radius);
                if (isLearned) {
                    bgGrad.addColorStop(0, `hsla(${hue}, 70%, 35%, 1)`);
                    bgGrad.addColorStop(1, `hsla(${hue}, 80%, 15%, 1)`);
                } else {
                    bgGrad.addColorStop(0, 'rgba(30, 34, 40, 1)');
                    bgGrad.addColorStop(1, 'rgba(15, 17, 20, 1)');
                }

                ctx.fillStyle = bgGrad;
                ctx.beginPath();
                ctx.arc(0, 0, radius, 0, TAU);
                ctx.fill();
                ctx.stroke();

                // 3. Render Skill Icon in Center
                if (iconReady && node.skill && node.skill.iconIndex != null) {
                    const iconIdx = node.skill.iconIndex;
                    const pw = ImageManager.iconWidth || 32;
                    const ph = ImageManager.iconHeight || 32;
                    const cols = 16;
                    const sx = (iconIdx % cols) * pw;
                    const sy = Math.floor(iconIdx / cols) * ph;
                    const iconSize = 24;

                    ctx.save();
                    if (!isLearned && !isOpen) {
                        ctx.globalAlpha = 0.45;
                    }
                    ctx.drawImage(iconImg._image || iconImg._canvas, sx, sy, pw, ph, -iconSize / 2, -iconSize / 2, iconSize, iconSize);
                    ctx.restore();
                }

                // 4. Status Glyphs (Checkmark / Lock badge on top corner)
                if (isLearned) {
                    ctx.fillStyle = 'var(--text-forest-complete)';
                    ctx.beginPath();
                    ctx.arc(radius - 4, -radius + 4, 6, 0, TAU);
                    ctx.fill();
                    ctx.fillStyle = '#ffffff';
                    ctx.font = 'bold 9px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('✓', radius - 4, -radius + 4.5);
                } else if (!isOpen) {
                    ctx.fillStyle = 'rgba(40, 44, 52, 0.9)';
                    ctx.beginPath();
                    ctx.arc(radius - 4, -radius + 4, 6, 0, TAU);
                    ctx.fill();
                    ctx.fillStyle = '#aaa';
                    ctx.font = '8px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('⊘', radius - 4, -radius + 4.5);
                }

                ctx.restore();
            }
        },

        // Two names written over each other are two names nobody can read, so
        // the layer is laid out rather than merely projected: every name that
        // fits is written where it belongs, one that would land on a name
        // already written drops a line, and one with nowhere left to go is not
        // written at all. The reader keeps the names that matter, in order:
        // the focused skill, then the learned and the open ones, then the rest.
        _updateLabels: function (st, w2, h2) {
            if (!st.labelEls.length) return;
            const scale = st.scaleFactor;
            const maxVisibleLabels = 40;
            const labelScale = Math.max(0.25, Math.min(1.15, st.zoom));
            const cands = [];

            for (let i = 0; i < st.nodes.length; i++) {
                const node = st.nodes[i];
                const el = st.labelEls[i];
                if (!el) continue;

                // Screen position
                const sx = w2 + (node.x * scale + st.camX) * st.zoom;
                const sy = h2 + (node.y * scale + st.camY) * st.zoom;

                node.sx = sx;
                node.sy = sy;
                node.vis = (sx >= -100 && sx <= st.sized.w + 100 && sy >= -100 && sy <= st.sized.h + 100);

                if (!node.vis) { el.classList.add('ui-closed'); continue; }
                cands.push({ node: node, el: el, sx: sx, sy: sy, i: i });
            }

            // A name is measured once and the size kept: repaint() throws the
            // measurement away when it rewrites a cost, and nothing else can
            // change how wide a name is.
            const unmeasured = cands.filter(c => !c.el._smNatW);
            if (unmeasured.length) {
                for (const c of unmeasured) c.el.classList.remove('ui-closed');
                for (const c of unmeasured) {
                    c.el._smNatW = c.el.offsetWidth || 80;
                    c.el._smNatH = c.el.offsetHeight || 16;
                }
            }

            cands.sort((a, b) => {
                const fa = a.node.id === st.focusId ? 1 : 0;
                const fb = b.node.id === st.focusId ? 1 : 0;
                if (fa !== fb) return fb - fa;
                const sa = a.node.state || 0, sb = b.node.state || 0;
                if (sa !== sb) return sb - sa;
                return a.i - b.i;
            });

            const placed = [];
            const overlaps = (r) => {
                for (let k = 0; k < placed.length; k++) {
                    const q = placed[k];
                    if (r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0) return true;
                }
                return false;
            };

            let visibleCount = 0;
            for (const c of cands) {
                const el = c.el;
                if (visibleCount >= maxVisibleLabels) { el.classList.add('ui-closed'); continue; }

                const w = (el._smNatW || 80) * labelScale;
                const h = (el._smNatH || 16) * labelScale;
                const baseY = c.sy + 26 * st.zoom;
                let y = -1;
                for (let line = 0; line < 3; line++) {
                    const ty = baseY + line * (h + 2);
                    const box = { x0: c.sx - w / 2 - 2, x1: c.sx + w / 2 + 2, y0: ty - 1, y1: ty + h + 1 };
                    if (!overlaps(box)) { placed.push(box); y = ty; break; }
                }
                if (y < 0) { el.classList.add('ui-closed'); continue; }

                visibleCount++;
                el.classList.remove('ui-closed');
                el.style.setProperty('--ms-x', `${c.sx.toFixed(1)}px`);
                el.style.setProperty('--ms-y', `${y.toFixed(1)}px`);

                // Scale label with zoom, allowing smaller text at lower zoom out to prevent overlap
                el.style.setProperty('--ms-label-scale', labelScale.toFixed(2));
            }
        },

        dispose: function () {
            const st = this.state;
            this.state = null;
            if (!st) return;
            st.disposed = true;
            if (st.rafId) {
                cancelAnimationFrame(st.rafId);
                st.rafId = 0;
            }
            if (st.stubGeo && st.stubGeo.dispose) st.stubGeo.dispose();
            if (st.stubMat && st.stubMat.dispose) st.stubMat.dispose();
            if (st.renderer) {
                if (st.renderer.dispose) st.renderer.dispose();
                if (st.renderer.forceContextLoss) st.renderer.forceContextLoss();
            }
            const L = st.listeners || {}, c0 = st.canvas;
            if (c0) {
                if (L.down) c0.removeEventListener('pointerdown', L.down);
                if (L.move) c0.removeEventListener('pointermove', L.move);
                if (L.click) c0.removeEventListener('click', L.click);
                if (L.wheel) c0.removeEventListener('wheel', L.wheel);
                if (L.ctx) c0.removeEventListener('contextmenu', L.ctx);
            }
            if (L.up) window.removeEventListener('pointerup', L.up);
            if (st.labels) st.labels.innerHTML = '';
            st.labelEls = [];
        }
    };

    window.SkillTree2D = SkillTree2D;
    window.AtlasSky = SkillTree2D;
    SkillMaster.SkillTree2D = SkillTree2D;

})();


//=============================================================================
// Module: SkillMasterPreview.js
//=============================================================================
/*:
 * @target MZ
 * @plugindesc v4.0.0 SkillMaster - Effekseer 3D Spell & Skill Animation Previewer.
 * @author Omni-Lex
 */

(() => {
    'use strict';

    window.SkillMaster = window.SkillMaster || {};

    const AnimPreview = {
        _ctx: null, _gl: null, _canvas: null,
        _effect: null, _handle: null, _effectName: '',
        _rafId: 0, _animId: 0, _dead: false,
        _yaw: 0, _pitch: 0.12, _dist: 10,
        _interactive: false, _dragging: false, _lastX: 0, _lastY: 0,
        _onDown: null, _onMove: null, _onUp: null, _onWheel: null,

        isSupported() { return !!window.effekseer; },

        init(canvas, interactive) {
            if (this._canvas === canvas && this._ctx) return true;
            this.dispose();
            if (!window.effekseer || !canvas) return false;
            const opts = { alpha: true, premultipliedAlpha: true, depth: true, antialias: true };
            const gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
            if (!gl) return false;
            let ctx;
            try {
                ctx = window.effekseer.createContext();
                ctx.init(gl, { instanceMaxCount: 4000, squareMaxCount: 8000 });
                ctx.setRestorationOfStatesFlag(true);
            } catch (e) {
                console.error('SkillMaster AnimPreview: Effekseer init failed', e);
                return false;
            }
            this._canvas = canvas; this._gl = gl; this._ctx = ctx; this._dead = false;
            this._yaw = 0; this._pitch = 0.12; this._dist = 10;
            this._interactive = !!interactive;
            if (this._interactive) this._bindInput(canvas);
            this._startLoop();
            return true;
        },

        _bindInput(canvas) {
            const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
            this._onDown = (e) => { this._dragging = true; this._lastX = e.clientX; this._lastY = e.clientY; e.preventDefault(); };
            this._onMove = (e) => {
                if (!this._dragging) return;
                this._yaw -= (e.clientX - this._lastX) * 0.01;
                this._pitch = clamp(this._pitch + (e.clientY - this._lastY) * 0.01, -1.3, 1.3);
                this._lastX = e.clientX; this._lastY = e.clientY;
            };
            this._onUp = () => { this._dragging = false; };
            this._onWheel = (e) => {
                this._dist = clamp(this._dist + (e.deltaY > 0 ? 1 : -1) * 1.2, 4, 26);
                e.preventDefault(); e.stopPropagation();
            };
            canvas.addEventListener('pointerdown', this._onDown);
            window.addEventListener('pointermove', this._onMove);
            window.addEventListener('pointerup', this._onUp);
            canvas.addEventListener('wheel', this._onWheel, { passive: false });
        },

        _unbindInput() {
            if (this._canvas && this._onDown) this._canvas.removeEventListener('pointerdown', this._onDown);
            if (this._onMove) window.removeEventListener('pointermove', this._onMove);
            if (this._onUp) window.removeEventListener('pointerup', this._onUp);
            if (this._canvas && this._onWheel) this._canvas.removeEventListener('wheel', this._onWheel);
            this._onDown = this._onMove = this._onUp = this._onWheel = null;
            this._dragging = false;
        },

        _viewMatrix() {
            const cp = Math.cos(this._pitch), sp = Math.sin(this._pitch);
            const sy = Math.sin(this._yaw), cy = Math.cos(this._yaw);
            const ex = this._dist * cp * sy, ey = this._dist * sp, ez = this._dist * cp * cy;
            let fx = -ex, fy = -ey, fz = -ez;
            const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
            let sx = -fz, sy2 = 0, sz = fx;
            const sl = Math.hypot(sx, sy2, sz) || 1; sx /= sl; sy2 /= sl; sz /= sl;
            const ux = sy2 * fz - sz * fy, uy = sz * fx - sx * fz, uz = sx * fy - sy2 * fx;
            return [
                sx, ux, -fx, 0,
                sy2, uy, -fy, 0,
                sz, uz, -fz, 0,
                -(sx * ex + sy2 * ey + sz * ez),
                -(ux * ex + uy * ey + uz * ez),
                (fx * ex + fy * ey + fz * ez),
                1
            ];
        },

        setAnimation(animId) {
            if (!this._ctx) return;
            const anim = (typeof $dataAnimations !== 'undefined') && $dataAnimations[animId];
            this._animId = animId;
            if (!anim || anim.frames || !anim.effectName) {
                this._stopHandle(); this._effect = null; this._effectName = '';
                return;
            }
            const name = anim.effectName;
            if (name === this._effectName && this._effect) { this._replay(); return; }
            this._stopHandle();
            this._effect = null; this._effectName = name;
            const url = 'effects/' + Utils.encodeURI(name) + '.efkefc';
            try {
                const eff = this._ctx.loadEffect(url, 1,
                    () => { if (this._effectName === name) { this._effect = eff; this._replay(); } },
                    () => { /* load failed */ });
            } catch (e) { /* ignore */ }
        },

        _replay() {
            if (!this._ctx || !this._effect) return;
            this._stopHandle();
            try {
                this._handle = this._ctx.play(this._effect, 0, 0, 0);
                if (this._handle) { this._handle.setLocation(0, 0, 0); this._handle.setScale(1, 1, 1); }
            } catch (e) { this._handle = null; }
        },

        _stopHandle() {
            if (this._handle) { try { this._handle.stop(); } catch (e) {} this._handle = null; }
        },

        _startLoop() {
            const W = this._canvas.width, H = this._canvas.height;
            const size = Math.min(W, H);
            const p = -(size / H);
            const proj = [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, p, 0, 0, 0, 1];
            const vx = Math.floor((W - size) / 2), vy = Math.floor((H - size) / 2);
            const loop = () => {
                if (this._dead) return;
                this._rafId = requestAnimationFrame(loop);
                const gl = this._gl, ctx = this._ctx;
                if (!gl || !ctx) return;
                try {
                    gl.clearColor(0, 0, 0, 0);
                    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
                    gl.viewport(vx, vy, size, size);
                    ctx.setProjectionMatrix(proj);
                    ctx.setCameraMatrix(this._viewMatrix());
                    ctx.update();
                    if (this._handle && !this._handle.exists && this._effect) this._replay();
                    ctx.beginDraw();
                    if (this._handle) ctx.drawHandle(this._handle);
                    ctx.endDraw();
                } catch (e) {
                    this._dead = true;
                }
            };
            this._rafId = requestAnimationFrame(loop);
        },

        dispose() {
            this._dead = true;
            this._unbindInput();
            if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = 0; }
            this._stopHandle();
            if (this._gl) {
                try {
                    const ext = this._gl.getExtension('WEBGL_lose_context');
                    if (ext) ext.loseContext();
                } catch (e) {}
            }
            this._effect = null; this._effectName = '';
            this._ctx = null; this._gl = null; this._canvas = null;
        }
    };

    window.SkillAnimPreview = AnimPreview;
    SkillMaster.AnimPreview = AnimPreview;

    // Extend Scene_SkillEncyclopedia prototypes for animation preview
    if (!window.Scene_SkillEncyclopedia) {
        window.Scene_SkillEncyclopedia = function () {
            this.initialize(...arguments);
        };
        window.Scene_SkillEncyclopedia.prototype = Object.create(Scene_MenuBase.prototype);
        window.Scene_SkillEncyclopedia.prototype.constructor = window.Scene_SkillEncyclopedia;
    }

    const Proto = window.Scene_SkillEncyclopedia.prototype;

    Proto.openSpellPreview = function (skillId) {
        const skill = $dataSkills[skillId];
        if (!skill) { SoundManager.playBuzzer(); return; }
        this._previewSkillId = skillId;
        this._viewMode = 'preview';
        SoundManager.playOk();
        this.buildSpellPreviewOverlay(skill);
    };

    Proto.closeSpellPreview = function () {
        AnimPreview.dispose();
        const ov = document.getElementById('spell-preview-overlay');
        if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
        this._viewMode = 'detail';
        SoundManager.playCancel();
    };

    Proto.buildSpellPreviewOverlay = function (skill) {
        if (!this._dndContainer) return;
        const anim = skill.animationId && $dataAnimations ? $dataAnimations[skill.animationId] : null;
        const previewable = !!(anim && anim.effectName && !anim.frames);
        const animLabel = anim && anim.name
            ? `#${skill.animationId} · ${anim.name}`
            : (T('SkillMaster.noAnimation'));
        const noEfkNote = previewable ? '' :
            `<div class="sm-stage-note">${T('SkillMaster.no3dAnimationForThis')}</div>`;

        const old = document.getElementById('spell-preview-overlay');
        if (old && old.parentNode) old.parentNode.removeChild(old);

        // Shape B: the dim, one card in the middle of it, the header bar with
        // the way out first and the button strip last.
        const ov = document.createElement('div');
        ov.id = 'spell-preview-overlay';
        ov.className = 'ui-overlay sm-preview-overlay';
        ov.innerHTML = `
            <div class="ui-panel sm-preview-panel">
                <div class="page-header-bar">
                    <div class="back-button focusable" onclick="SceneManager._scene.closeSpellPreview()">${T('SkillMaster.close')}</div>
                    <h2 class="title">${skill.name}</h2>
                </div>
                <div class="ui-panel-body sm-preview-body">
                    <div id="spell-preview-stage" class="sm-preview-stage">
                        <div class="sm-stage-ring"></div>
                        <div class="sm-stage-shaft"></div>
                        <canvas id="spell-preview-canvas" class="sm-stage-canvas"></canvas>
                        ${noEfkNote}
                    </div>
                    <div class="sm-preview-anim">${animLabel}</div>
                </div>
                <div class="inspect-actions ui-panel-actions">
                    <div class="inspect-btn focusable" onclick="SceneManager._scene.replaySpellPreview()">${T('SkillMaster.replay')}</div>
                </div>
            </div>`;
        this._dndContainer.appendChild(ov);

        requestAnimationFrame(() => {
            if (this._viewMode !== 'preview') return;
            const canvas = document.getElementById('spell-preview-canvas');
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            canvas.width = Math.max(64, Math.floor(rect.width));
            canvas.height = Math.max(64, Math.floor(rect.height));
            if (previewable && AnimPreview.isSupported() && AnimPreview.init(canvas, true)) {
                AnimPreview.setAnimation(skill.animationId);
            }
        });
    };

    Proto.replaySpellPreview = function () {
        const skill = $dataSkills[this._previewSkillId];
        if (skill && skill.animationId) AnimPreview.setAnimation(skill.animationId);
        SoundManager.playCursor();
    };

    Proto.updateSpellPreviewInput = function () {
        if (Input.isTriggered('cancel') || Input.isTriggered('escape') || TouchInput.isCancelled()) {
            this.closeSpellPreview();
            return;
        }
        if (Input.isTriggered('ok')) {
            this.replaySpellPreview();
            return;
        }
        for (const dir of ['down', 'right', 'up', 'left']) {
            if (Input.isTriggered(dir) || Input.isRepeated(dir)) {
                this._ccEnterNav(dir);
                break;
            }
        }
    };

})();


//=============================================================================
// Module: SkillMasterFusion.js
//=============================================================================
/*:
 * @target MZ
 * @plugindesc v4.0.0 SkillMaster - Procedural Spell & Skill Fusion System.
 * @author Omni-Lex
 */

(() => {
    'use strict';

    window.SkillMaster = window.SkillMaster || {};

    const FORGE_DOMINANT_IDX = 0;
    const FORGE_RECESSIVE_IDX = 1;
    const FORGE_ANIM_IDX = 2;
    const FORGE_TAGS_IDX = 3;
    const FORGE_CREATE_IDX = 4;
    const FORGE_SPLIT_BASE = 5;
    const FORGE_SECTION_ICONS = { dominant: 79, recessive: 76, animation: 234, tags: 87, fused: 183 };

    //-------------------------------------------------------------------------
    // Fusion as tags
    //
    // Both parents are read back into tags (window.SkillTags.decompile, in the
    // Workbench section), and the fused entry is rebuilt from the tags the
    // player keeps, priced on the same shipped curve as anything the Workbench
    // writes. A shipped skill that does not decompile in full still fuses by
    // the tags it does read as; what has no tag is listed as lost.
    //-------------------------------------------------------------------------

    // What a pair of parents offers: the union of their tags (the dominant's
    // first), the bench the result belongs on (a skill if the recessive is a
    // skill, as the forge always ruled), and how much of them has no tag.
    function fusionPool(components) {
        const ST = window.SkillTags;
        if (!ST || !components || components.some(c => !c)) return null;
        const reads = components.map(c => ST.decompile(c));
        const last = reads[reads.length - 1];
        const target = last.target === 'skill' ? 'skill' : 'spell';
        const pool = [];
        reads.forEach((r, i) => {
            for (const key of r.tags) if (!pool.some(p => p.key === key)) pool.push({ key, from: i });
        });
        const lost = reads.reduce((n, r) => n + r.lost.length, 0);
        return { pool, target, reads, lost };
    }

    // The tags kept when the player has not chosen: everything that fits,
    // read in group order with the dominant's tag first wherever only one fits.
    function fusionDefaultKept(read) {
        const ST = window.SkillTags;
        if (!ST || !read) return [];
        const order = read.pool.slice().sort((a, b) => a.from - b.from).map(p => p.key);
        return ST.normalize(order, read.target).tags;
    }
    SkillMaster.fusionPool = fusionPool;
    SkillMaster.fusionDefaultKept = fusionDefaultKept;

    function makeFusedSpellName(names) {
        const parts = names.map(n => {
            const clean = String(n || '').replace(/[^A-Za-z]/g, '');
            if (!clean) return '';
            const chunk = clean.slice(0, 4);
            return chunk.charAt(0).toUpperCase() + chunk.slice(1).toLowerCase();
        }).filter(Boolean);
        return parts.join('') || 'CustomSpell';
    }

    function buildFusedSkill(components, actorId, animationId, keptTags) {
        const clone = obj => JSON.parse(JSON.stringify(obj));
        const dominant = components[0];
        const recessive = components[1];
        const ST = window.SkillTags;
        const read = ST ? fusionPool(components) : null;
        if (read) {
            const tags = Array.isArray(keptTags)
                ? ST.normalize(keptTags, read.target).tags
                : fusionDefaultKept(read);
            if (ST.validate(tags, read.target).ok) {
                const fusedTags = ST.buildSkill(tags, {
                    target: read.target,
                    id: $gameSystem.allocCustomSkillId(),
                    name: makeFusedSpellName(components.map(c => c.name)),
                    iconIndex: dominant.iconIndex,
                    animationId: (animationId && animationId > 0) ? animationId : (dominant.animationId || 0),
                    actorId: actorId,
                    category: SkillMaster.FUSION_CATEGORY
                });
                fusedTags._resultIsSkill = read.target === 'skill';
                fusedTags._components = components.map(c => c.id);
                fusedTags._baseSkillId = dominant.id;
                fusedTags._fusionTags = tags.slice();
                fusedTags._craftKind = read.target;
                return fusedTags;
            }
        }
        // Nothing reads as a whole build: the pair is welded the old way, the
        // dominant's sheet carrying both parents' effects.
        const fused = clone(dominant);

        fused.id = $gameSystem.allocCustomSkillId();
        fused.name = makeFusedSpellName(components.map(c => c.name));
        fused.mpCost = components.reduce((sum, c) => sum + (c.mpCost || 0), 0);
        fused.tpCost = components.reduce((sum, c) => sum + (c.tpCost || 0), 0);

        fused.damage = clone(dominant.damage);
        fused.iconIndex = dominant.iconIndex;

        const recCat = recessive ? SkillMaster.getSkillCategory(recessive.id) : null;
        const recIsSkill = recCat ? SkillMaster.getCategoryType(recCat) !== 'Magic' : false; // i18n-ignore: skill category id / type discriminator
        fused._resultIsSkill = recIsSkill;
        if (recIsSkill && recessive) {
            fused.stypeId = recessive.stypeId;
        }

        fused.effects = [];
        for (const c of components) {
            for (const e of (c.effects || [])) fused.effects.push(clone(e));
        }

        if (animationId && animationId > 0) fused.animationId = animationId;

        const names = components.map(c => c.name).join(' + ');
        const descKey = recIsSkill ? 'SkillMaster.fusedSkillDesc' : 'SkillMaster.fusedSpellDesc';
        fused.description = T(descKey, { parts: names, dominant: dominant.name });

        fused.note = '<customSpell>\n<category:' + SkillMaster.FUSION_CATEGORY + '>';
        fused.meta = { customSpell: true };
        fused._customSpell = true;
        fused._ownerActorId = actorId;
        fused._components = components.map(c => c.id);
        fused._baseSkillId = dominant.id;
        fused._animationId = fused.animationId;
        return fused;
    }

    SkillMaster.makeFusedSpellName = makeFusedSpellName;
    SkillMaster.buildFusedSkill = buildFusedSkill;

    if (!window.Scene_SkillEncyclopedia) {
        window.Scene_SkillEncyclopedia = function () {
            this.initialize(...arguments);
        };
        window.Scene_SkillEncyclopedia.prototype = Object.create(Scene_MenuBase.prototype);
        window.Scene_SkillEncyclopedia.prototype.constructor = window.Scene_SkillEncyclopedia;
    }

    const Proto = window.Scene_SkillEncyclopedia.prototype;

    Proto.getEditorCandidatesCached = function (slotIndex) {
        const actor = this.getTeachActor();
        const key = `${slotIndex}:${actor ? actor.actorId() : 0}:${this._editorSlots ? this._editorSlots.join(',') : ''}`;
        if (this._editorCandidatesKey !== key) {
            this._editorCandidatesKey = key;
            this._editorCandidatesCache = this.getEditorCandidates(slotIndex);
        }
        return this._editorCandidatesCache;
    };

    Proto.getEditorCandidates = function (slotIndex) {
        const actor = this.getTeachActor();
        if (!actor) return [];
        const dominantSlot = (slotIndex === FORGE_DOMINANT_IDX);
        const chosenElsewhere = (this._editorSlots || []).filter((id, i) => id != null && i !== slotIndex);
        return actor.skills().filter(s => {
            if (!s || !s.name) return false;
            if (s.id === 1 || (SkillMaster.isHiddenSkill ? SkillMaster.isHiddenSkill(s) : s.id === 2)) return false;
            if (s._customSpell) return false;
            if (!actor.isLearnedSkill(s.id)) return false;
            if (chosenElsewhere.includes(s.id)) return false;
            if (Array.isArray(s.effects) && s.effects.some(e => e && e.code === Game_Action.EFFECT_COMMON_EVENT)) return false;
            const cat = SkillMaster.getSkillCategory(s.id);
            if (cat && cat.toLowerCase() === 'basic') return false;
            const type = cat ? SkillMaster.getCategoryType(cat) : 'Skill'; // i18n-ignore: skill category id / type discriminator
            return dominantSlot ? type === 'Magic' : true; // i18n-ignore: skill category id / type discriminator
        });
    };

    Proto.getEditorCustomSpells = function () {
        const actor = this.getTeachActor();
        if (!actor || typeof $gameSystem === 'undefined') return [];
        return $gameSystem.getCustomSpells().filter(s =>
            s && s._ownerActorId === actor.actorId() && actor.isLearnedSkill(s.id));
    };

    Proto.getAvailableAnimations = function () {
        if (!this._animCache) {
            this._animCache = [];
            if (typeof $dataAnimations !== 'undefined' && $dataAnimations) {
                for (const a of $dataAnimations) {
                    if (a && a.name && a.name.trim() && a.effectName) this._animCache.push(a);
                }
            }
        }
        return this._animCache;
    };

    Proto.getDefaultAnimId = function () {
        if (!this._editorSlots) return 0;
        for (const id of this._editorSlots) {
            const sk = id && $dataSkills[id];
            if (sk && sk.animationId > 0) return sk.animationId;
        }
        return 0;
    };

    Proto.openSpellEditor = function () {
        this._viewMode = 'spellEditor';
        this._editorSlots = [null, null];
        this._editorKept = null;
        this._editorTagChip = 0;
        this._editorFocus = 0;
        this._editorPicking = false;
        this._editorPickIndex = 0;
        this._editorAnimPicking = false;
        this._editorAnimPickIndex = 0;
        this._editorAnimId = 0;
        SoundManager.playOk();
        this.refreshUISkillDOM();
    };

    Proto.closeSpellEditor = function () {
        if (window.SkillAnimPreview) window.SkillAnimPreview.dispose();
        this._viewMode = 'category';
        this._editorPicking = false;
        this._editorAnimPicking = false;
        this._lastLeftMode = null;
        this._lastLeftCategory = null;
        this._lastRightMode = null;
        this._lastRightSkillId = null;
        this._lastRightKnowledge = null;
        SoundManager.playCancel();
        this.refreshUISkillDOM();
    };

    Proto.editorFocusSlot = function (i) {
        this._editorFocus = i;
        const candidates = this.getEditorCandidates(i);
        if (candidates.length === 0) { SoundManager.playBuzzer(); this.refreshUISkillDOM(); return; }
        this._editorPicking = true;
        this._editorPickIndex = 0;
        SoundManager.playOk();
        this.refreshUISkillDOM();
    };

    Proto.editorPickCandidate = function (k) {
        const candidates = this.getEditorCandidates(this._editorFocus);
        const skill = candidates[k];
        if (!skill) { SoundManager.playBuzzer(); return; }
        this._editorSlots[this._editorFocus] = skill.id;
        this._editorKept = null;
        this._editorTagChip = 0;
        this._editorPicking = false;
        if (!this._editorAnimId) this._editorAnimId = this.getDefaultAnimId();
        SoundManager.playOk();
        this.refreshUISkillDOM();
    };

    Proto.openAnimPicker = function () {
        if (typeof $dataAnimations === 'undefined' || !$dataAnimations) { SoundManager.playBuzzer(); return; }
        const list = this.getAvailableAnimations();
        if (!list.length) { SoundManager.playBuzzer(); return; }
        if (this._editorAnimId <= 0 || !$dataAnimations[this._editorAnimId]) {
            this._editorAnimId = this.getDefaultAnimId();
        }
        this._animBackupId = this._editorAnimId;
        let idx = list.findIndex(a => a.id === this._editorAnimId);
        if (idx < 0) idx = 0;
        this._editorAnimPickIndex = idx;
        this._editorAnimId = list[idx].id;
        this._editorAnimPicking = true;
        SoundManager.playOk();
        this.refreshUISkillDOM();
    };

    Proto.editorAnimHighlight = function (k) {
        const list = this.getAvailableAnimations();
        if (!list.length) return;
        k = ((k % list.length) + list.length) % list.length;
        this._editorAnimPickIndex = k;
        this._editorAnimId = list[k].id;

        // The hairline is the whole of the mark, and the stylesheet draws it:
        // nothing is painted from here.
        this.highlightAnimRow('anim-list-box', k, this._editorAnimId, list);
    };

    Proto.editorConfirmAnim = function () {
        this._editorAnimPicking = false;
        if (window.SkillAnimPreview) window.SkillAnimPreview.dispose();
        this._editorFocus = FORGE_ANIM_IDX;
        SoundManager.playOk();
        this.refreshUISkillDOM();
    };

    Proto.editorCancelAnim = function () {
        this._editorAnimPicking = false;
        this._editorAnimId = this._animBackupId || this.getDefaultAnimId();
        if (window.SkillAnimPreview) window.SkillAnimPreview.dispose();
        SoundManager.playCancel();
        this.refreshUISkillDOM();
    };

    // The pair in the slots, read into tags once per pair.
    Proto.editorFusionRead = function () {
        if (!this._editorSlots || !this._editorSlots.every(x => x != null)) return null;
        const key = this._editorSlots.join(',');
        if (this._editorReadKey !== key) {
            this._editorReadKey = key;
            this._editorRead = fusionPool(this._editorSlots.map(id => $dataSkills[id]));
        }
        return this._editorRead;
    };

    Proto.editorKeptTags = function () {
        const read = this.editorFusionRead();
        if (!read) return [];
        if (!Array.isArray(this._editorKept)) this._editorKept = fusionDefaultKept(read);
        return this._editorKept;
    };

    // Whether a tag of the pool can be kept beside the others, and why not.
    Proto.editorTagVerdict = function (key) {
        const ST = window.SkillTags;
        const read = this.editorFusionRead();
        if (!ST || !read) return { ok: false, reason: 'unknown' };
        const kept = this.editorKeptTags();
        if (kept.includes(key)) return { ok: true, on: true };
        const def = ST.get(key);
        if (!def) return { ok: false, reason: 'unknown' };
        const single = ST.GROUPS.find(g => g.key === def.group);
        let work = (single && single.max === 1) ? kept.filter(k => { const d = ST.get(k); return d && d.group !== def.group; }) : kept.slice();
        if (def.group === 'core') work = work.filter(k => { const d = ST.get(k); return d && d.group !== 'shape'; });
        return ST.allowed(work, key, read.target);
    };

    Proto.editorToggleTag = function (key) {
        const ST = window.SkillTags;
        const read = this.editorFusionRead();
        if (!ST || !read) { SoundManager.playBuzzer(); return; }
        const kept = this.editorKeptTags();
        const at = read.pool.findIndex(p => p.key === key);
        if (at >= 0) this._editorTagChip = at;
        this._editorFocus = FORGE_TAGS_IDX;
        if (kept.includes(key)) {
            this._editorKept = ST.normalize(kept.filter(k => k !== key), read.target).tags;
            SoundManager.playCancel();
        } else {
            const verdict = this.editorTagVerdict(key);
            if (!verdict.ok) { SoundManager.playBuzzer(); this.refreshUISkillDOM(); return; }
            const def = ST.get(key);
            const single = ST.GROUPS.find(g => g.key === def.group);
            let next = (single && single.max === 1) ? kept.filter(k => { const d = ST.get(k); return d && d.group !== def.group; }) : kept.slice();
            next.push(key);
            if (def.group === 'core') {
                const shape = next.find(k => { const d = ST.get(k); return d && d.group === 'shape'; });
                if (!ST.coreShapeOk(def, ST.get(shape))) {
                    const heals = def.dmg === 3 || def.dmg === 4;
                    next = next.filter(k => k !== shape).concat([heals ? 'oneAlly' : 'oneEnemy']);
                }
            }
            this._editorKept = ST.normalize(next, read.target).tags;
            SoundManager.playOk();
        }
        this.refreshUISkillDOM();
    };

    // The fused entry as it would come off the forge, for the preview.
    Proto.editorFusionPreview = function () {
        const ST = window.SkillTags;
        const read = this.editorFusionRead();
        if (!ST || !read) return null;
        const kept = this.editorKeptTags();
        if (!ST.validate(kept, read.target).ok) return null;
        const dominant = $dataSkills[this._editorSlots[FORGE_DOMINANT_IDX]];
        return ST.buildSkill(kept, {
            target: read.target, id: 0,
            name: makeFusedSpellName(this._editorSlots.map(id => ($dataSkills[id] || {}).name)),
            iconIndex: dominant ? dominant.iconIndex : 0, category: SkillMaster.FUSION_CATEGORY
        });
    };

    Proto.editorFusionCost = function () {
        if (!this._editorSlots || !this._editorSlots.every(x => x != null)) return 0;
        const actor = this.getTeachActor();
        return SkillMaster.kpFusionCost(this._editorSlots, actor ? actor.actorId() : 0);
    };

    Proto.editorCreate = async function () {
        // One fusion at a time: the bench still reads the pad while the die
        // is in the air, and a second OK would pay and fuse the pair again.
        if (this._editorFusing) { SoundManager.playBuzzer(); return; }
        if (!this._editorSlots || !this._editorSlots.every(x => x != null)) { SoundManager.playBuzzer(); return; }
        const actor = this.getTeachActor();
        const components = this._editorSlots.map(id => $dataSkills[id]);
        if (!actor || components.some(c => !c)) { SoundManager.playBuzzer(); return; }

        const cost = SkillMaster.kpFusionCost(this._editorSlots, actor.actorId());
        if ($gameSystem.getKnowledge() < cost) { SoundManager.playBuzzer(); return; }
        $gameSystem.spendKnowledge(cost);
        // What is melted down is what was paid for, whatever the slots hold
        // by the time the die lands.
        const consumedSlots = this._editorSlots.slice();
        const keptTags = Array.isArray(this._editorKept) ? this._editorKept.slice() : null;
        const animId = (this._editorAnimId && this._editorAnimId > 0) ? this._editorAnimId : this.getDefaultAnimId();
        this._editorFusing = true;

        const intMod = actor ? (actor.intMod ?? Math.floor(((actor.mat || 10) - 10) / 2)) : 0;
        const dc = Math.min(18, Math.max(10, 11 + Math.floor(cost / 30)));
        let rollRes = null;

        if (window.Dice3D) {
            try {
                rollRes = await window.Dice3D.rollD20({
                    actionName: T('SkillMaster.fusionRollAction', { parts: components.map(c => c.name).join(' + ') }),
                    statName: (typeof TextManager !== 'undefined' && TextManager.param) ? TextManager.param(4) : '',
                    modifier: intMod,
                    dc: dc,
                    force3D: true
                });
            } finally {
                this._editorFusing = false;
            }
        } else {
            const rawRoll = Math.floor(Math.random() * 20) + 1;
            rollRes = {
                roll: rawRoll,
                modifier: intMod,
                total: rawRoll + intMod,
                nat1: rawRoll === 1,
                nat20: rawRoll === 20,
                success: rawRoll === 20 || (rawRoll !== 1 && rawRoll + intMod >= dc)
            };
        }
        this._editorFusing = false;

        this._editorSlots = [null, null];
        this._editorKept = null;
        this._editorAnimId = 0;
        this._editorFocus = FORGE_CREATE_IDX;

        if (rollRes.success) {
            const fused = buildFusedSkill(components, actor.actorId(), animId, keptTags);

            if (rollRes.nat20) {
                fused.mpCost = Math.max(1, Math.round((fused.mpCost || 1) * 0.8));
                fused.name = '★ ' + fused.name;
                if (fused.damage && fused.damage.formula) {
                    fused.damage.formula = `(${fused.damage.formula}) * 1.25`;
                }
            }

            $gameSystem.addCustomSpell(fused);
            for (const id of consumedSlots) actor.forgetSkill(id);
            actor.learnSkill(fused.id);
            this.invalidateLearnedSkillCaches();
            SoundManager.playRecovery();

            if (typeof T === 'function') {
                if (rollRes.nat20) {
                    if (window.ParchmentToast) {
                      window.ParchmentToast.show(T('SkillMaster.fusionCritical', {
                        result: T('SkillMaster.fusedResult', {
                            name: fused.name, cost: cost, left: $gameSystem.getKnowledge(),
                        }),
                                            }), {
                        severity: 'good'
                      });
                    }
                } else {
                    if (window.ParchmentToast) {
                      window.ParchmentToast.show(T('SkillMaster.fusedResult', {
                        name: fused.name, cost: cost, left: $gameSystem.getKnowledge(),
                                            }), {
                        severity: 'good'
                      });
                    }
                }
            }
            window.skipLocalization = false;
        } else {
            for (const id of consumedSlots) actor.forgetSkill(id);
            this.invalidateLearnedSkillCaches();
            SoundManager.playBuzzer();

            if (typeof T === 'function') {
                if (window.ParchmentToast) {
                  window.ParchmentToast.show(T('SkillMaster.fusionFailed', {
                    dc: dc, components: components.map(c => c.name).join(' & '),
                                    }), {
                    severity: 'good'
                  });
                }
            }
            window.skipLocalization = false;
        }

        // The bench may have been closed while the die rolled.
        if (window.Dice3D && window.Dice3D.ownerAlive && !window.Dice3D.ownerAlive(this)) return;
        this.refreshUISkillDOM();
    };

    Proto.editorSplit = function (spellId) {
        const actor = this.getTeachActor();
        const spell = $dataSkills[spellId];
        if (!spell || !spell._components) { SoundManager.playBuzzer(); return; }
        const parts = spell._components.slice();

        actor.forgetSkill(spellId);
        for (const cid of parts) actor.learnSkill(cid);
        this.invalidateLearnedSkillCaches();
        $gameSystem.removeCustomSpell(spellId);

        this._editorFocus = FORGE_CREATE_IDX;
        SoundManager.playRecovery();

        if (typeof T === 'function') {
            if (window.ParchmentToast) {
              window.ParchmentToast.show(T('SkillMaster.splitResult', { name: spell.name }), {
                severity: 'good'
              });
            }
        }
        window.skipLocalization = false;

        this.refreshUISkillDOM();
    };

    // The lit stage an animation is tried out on: the caster's face with the
    // effect played over it. The fusion forge and the bench both pick an
    // animation, so both raise the SAME stage rather than each drawing its own.
    Proto.animStageHTML = function (actor, cur, canvasId, labelId) {
        const faceX = (actor.faceIndex() % 4) * 144;
        const faceY = Math.floor(actor.faceIndex() / 4) * 144;
        return `
            <div class="sm-anim-stage">
                <div class="sm-anim-face" style="--sm-face: ${window.CCArt.url('img/faces/' + actor.faceName() + '.png')}; --sm-face-x: -${faceX}px; --sm-face-y: -${faceY}px"></div>
                <canvas id="${canvasId}" class="sm-stage-canvas"></canvas>
            </div>
            <div id="${labelId}" class="sm-preview-anim">${cur ? `#${cur.id} · ${cur.name}` : ''}</div>`;
    };

    // The canvas is only sized once the page is laid out, so the stage is lit
    // on the frame after the page is written, and only if the picker is still open.
    Proto.lightAnimStage = function (canvasId, animId, stillOpen) {
        requestAnimationFrame(() => {
            if (!stillOpen()) return;
            const canvas = document.getElementById(canvasId);
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            canvas.width = Math.max(64, Math.floor(rect.width));
            canvas.height = Math.max(64, Math.floor(rect.height));
            if (window.SkillAnimPreview && window.SkillAnimPreview.isSupported() && window.SkillAnimPreview.init(canvas)) {
                window.SkillAnimPreview.setAnimation(animId);
            }
        });
    };

    // Moving down the list re-plays the effect without rewriting the page, so
    // the stage is never torn down between two neighbouring animations.
    Proto.highlightAnimRow = function (boxId, k, animId, list) {
        const box = document.getElementById(boxId);
        if (box) {
            box.querySelectorAll('.anim-row').forEach(row => {
                row.classList.toggle('focused', parseInt(row.dataset.idx, 10) === k);
            });
        }
        const label = document.getElementById(boxId + '-label');
        if (label && list[k]) label.textContent = `#${list[k].id} · ${list[k].name}`;
        if (window.SkillAnimPreview) window.SkillAnimPreview.setAnimation(animId);
        SoundManager.playCursor();
        this.scrollToActiveItem(boxId, '#' + boxId + ' .anim-row.focused');
    };

    Proto.setupAnimPreview = function () {
        this.lightAnimStage('anim-preview-canvas', this._editorAnimId,
            () => this._viewMode === 'spellEditor' && !!this._editorAnimPicking);
    };

    Proto.renderSpellEditor = function (useItalian, knowledge) {
        const leftBox = document.getElementById('left-page-content');
        const rightBox = document.getElementById('right-page-content');
        if (!leftBox || !rightBox) return;
        const actor = this.getTeachActor();
        const picking = this._editorPicking;
        const animPicking = this._editorAnimPicking;

        const K = SkillMaster.BenchKit;
        // Each slot is a section of the sheet with one trigger in it, the way
        // the character sheet asks for an archetype: the trigger names what is
        // in the slot, and opens the list on the right page.
        const slotMeta = [
            { label: T('SkillMaster.dominantSpell'),
              hint: T('SkillMaster.magicOnlyDefinesTheEffect'), icon: FORGE_SECTION_ICONS.dominant },
            { label: T('SkillMaster.recessiveSpellOrSkill'),
              hint: T('SkillMaster.spellOrSkillSetsThe'), icon: FORGE_SECTION_ICONS.recessive }
        ];
        let slotsHTML = '';
        this._editorSlots.forEach((id, i) => {
            const skill = id ? $dataSkills[id] : null;
            const focused = !animPicking && this._editorFocus === i;
            const meta = slotMeta[i] || { label: '', hint: '' };
            let typeBadge = '';
            if (skill && i === FORGE_RECESSIVE_IDX) {
                const cat = SkillMaster.getSkillCategory(skill.id);
                const isSkill = cat ? SkillMaster.getCategoryType(cat) !== 'Magic' : false; // i18n-ignore: skill category id / type discriminator
                typeBadge = isSkill ? (T('SkillMaster.skill')) : (T('SkillMaster.magic'));
            }
            slotsHTML += K.section({
                icon: meta.icon, title: meta.label, badge: typeBadge, note: meta.hint,
                cls: focused ? 'sm-kit-section--focused' : '',
                body: K.trigger({
                    focused, iconIndex: skill ? skill.iconIndex : 0,
                    value: skill ? skill.name : T('SkillMaster.emptySlot'), muted: !skill,
                    extra: skill ? `<span class="sm-forge-cost">MP ${skill.mpCost} &middot; AP ${skill.tpCost}</span>` : '',
                    onclick: `SceneManager._scene.editorFocusSlot(${i})`
                })
            });
        });

        const animId = (this._editorAnimId && this._editorAnimId > 0) ? this._editorAnimId : this.getDefaultAnimId();
        const animData = animId && $dataAnimations ? $dataAnimations[animId] : null;
        const animName = animData ? `#${animId} · ${animData.name}` : (T('SkillMaster.default'));
        const animFocused = !animPicking && this._editorFocus === FORGE_ANIM_IDX;
        const animRowHTML = K.section({
            icon: FORGE_SECTION_ICONS.animation, title: T('SkillMaster.animation'),
            cls: animFocused ? 'sm-kit-section--focused' : '',
            body: K.trigger({ focused: animFocused, value: animName, onclick: 'SceneManager._scene.openAnimPicker()' })
        });

        // The tags the fused entry keeps: every tag the pair reads as, a chip
        // each, the kept ones lit and the ones that cannot sit beside them
        // greyed with the reason.
        const ST = window.SkillTags;
        const read = this.editorFusionRead();
        let tagsRowHTML = '';
        if (ST && read) {
            const kept = this.editorKeptTags();
            const tagsFocused = !animPicking && this._editorFocus === FORGE_TAGS_IDX;
            const chipAt = Math.max(0, Math.min(read.pool.length - 1, this._editorTagChip || 0));
            const chips = read.pool.map((p, k) => {
                const verdict = this.editorTagVerdict(p.key);
                return {
                    label: ST.name(p.key), selected: kept.includes(p.key),
                    disabled: !verdict.ok, title: verdict.ok ? ST.info(p.key) : ST.why(verdict),
                    cursor: tagsFocused && k === chipAt,
                    onclick: `SceneManager._scene.editorToggleTag('${p.key}')`
                };
            });
            let note = T('SkillMaster.craft.fuse.keepNote');
            if (tagsFocused && read.pool[chipAt]) {
                const v = this.editorTagVerdict(read.pool[chipAt].key);
                note = v.ok ? ST.info(read.pool[chipAt].key) : ST.why(v);
            }
            if (read.lost) note += ' ' + T('SkillMaster.craft.fuse.lost', { n: read.lost });
            tagsRowHTML = K.section({
                icon: FORGE_SECTION_ICONS.tags, title: T('SkillMaster.craft.fuse.keep'),
                badge: `${kept.length}/${read.pool.length}`,
                cls: tagsFocused ? 'sm-kit-section--focused' : '',
                body: chips.length ? K.chips(chips) : `<div class="ui-empty-text">${T('SkillMaster.craft.fuse.none')}</div>`,
                note
            });
        }

        const allFilled = this._editorSlots.every(x => x != null);
        const fuseCost = allFilled ? this.editorFusionCost() : 0;
        const canPay = !allFilled || knowledge >= fuseCost;
        const tagsWhole = !ST || !read || ST.validate(this.editorKeptTags(), read.target).ok;
        const canForge = allFilled && canPay && tagsWhole;
        const createFocused = !animPicking && this._editorFocus === FORGE_CREATE_IDX;
        const costTag = allFilled ? ` <span class="sm-forge-cost">&middot; ${fuseCost} KP</span>` : '';
        const createHTML = `
            <div class="inspect-actions sm-forge-actions">
                <div class="inspect-btn focusable ${createFocused ? 'selected' : ''} ${canForge ? '' : 'unusable'}" onclick="SceneManager._scene.editorCreate()">
                    ${T('SkillMaster.fuseSpells2')}${costTag}
                </div>
            </div>
            ${allFilled && !canPay ? `<div class="sm-craft-block">${knowledge} KP${T('SkillMaster.notEnough')}</div>` : ''}`;

        const customSpells = this.getEditorCustomSpells();
        let fusedListHTML = '';
        customSpells.forEach((s, k) => {
            const focusIdx = FORGE_SPLIT_BASE + k;
            const focused = !animPicking && this._editorFocus === focusIdx;
            fusedListHTML += `
                <div class="sm-skill-row focusable ${focused ? 'focused' : ''}" onclick="SceneManager._scene.editorSplit(${s.id})">
                    <span class="sm-skill-ident"><span class="sm-skill-icon" style="${SkillMaster.getSkillIconStyle(s.iconIndex)}"></span><span class="sm-skill-name">${s.name}</span></span>
                    <span class="ui-chip sm-skill-badge">${T('SkillMaster.split')}</span>
                </div>`;
        });
        if (!fusedListHTML) fusedListHTML = `<div class="ui-empty"><div class="ui-empty-text">${T('SkillMaster.noFusedSpellsYet')}</div></div>`;

        const backBtn = T('SkillMaster.back');
        const title = T('SkillMaster.fuseSpells3');
        leftBox.innerHTML = `
            <div class="page-header-bar sm-bench-header">
              <div class="back-button focusable" onclick="SceneManager._scene.closeSpellEditor()">${backBtn}</div>
              <h2 class="title">${title}</h2>
              <div class="sm-bench-kp-pill"><strong>${knowledge} KP</strong></div>
            </div>
            <div class="sm-kit-scroll sm-forge-rows">
                ${slotsHTML}
                ${animRowHTML}
                ${tagsRowHTML}
            </div>
            ${createHTML}
            ${K.section({
                icon: FORGE_SECTION_ICONS.fused, title: T('SkillMaster.fusedSpells'), badge: customSpells.length,
                cls: 'sm-kit-entries',
                body: `<div id="fused-scroll-box" class="ui-list ui-scroll sm-forged-list">${fusedListHTML}</div>`
            })}`;

        let rightHTML = '';
        if (picking) {
            const slotIdx = this._editorFocus;
            const candidates = this.getEditorCandidates(slotIdx);
            let candHTML = '';
            candidates.forEach((s, k) => {
                const focused = this._editorPickIndex === k;
                candHTML += `
                    <div class="sm-skill-row focusable ${focused ? 'focused' : ''}" onclick="SceneManager._scene.editorPickCandidate(${k})">
                        <span class="sm-skill-ident"><span class="sm-skill-icon" style="${SkillMaster.getSkillIconStyle(s.iconIndex)}"></span><span class="sm-skill-name">${s.name}</span></span>
                        <span class="sm-skill-cost">MP ${s.mpCost} · AP ${s.tpCost}</span>
                    </div>`;
            });
            if (!candHTML) candHTML = `<div class="ui-empty"><div class="ui-empty-text">${T('SkillMaster.noAvailableSkillsForThis')}</div></div>`;
            const pickTitle = slotIdx === FORGE_DOMINANT_IDX
                ? (T('SkillMaster.chooseDominantSpell'))
                : (T('SkillMaster.chooseRecessive'));
            rightHTML = `
                <div class="ui-detail">
                    <div class="ui-detail-head">
                        <div class="ui-detail-titles"><h3 class="sm-detail-name">${pickTitle}</h3></div>
                    </div>
                    <div id="candidates-scroll-box" class="ui-detail-scroll ui-scroll sm-candidate-list">
                        ${candHTML}
                    </div>
                </div>`;
        } else if (animPicking) {
            const list = this.getAvailableAnimations();
            const cur = list[this._editorAnimPickIndex] || list[0];
            let rowsHTML = '';
            list.forEach((a, k) => {
                const on = this._editorAnimPickIndex === k;
                rowsHTML += `
                    <div class="sm-skill-row anim-row focusable ${on ? 'focused' : ''}" data-idx="${k}" onclick="SceneManager._scene.editorAnimHighlight(${k})">
                        <span class="sm-skill-name">${a.name}</span>
                        <span class="sm-skill-cost">#${a.id}</span>
                    </div>`;
            });
            const pickTitle = T('SkillMaster.chooseAnimation');
            const useLbl = T('SkillMaster.use');
            const backLbl = T('SkillMaster.cancel');
            rightHTML = `
                <div class="ui-detail">
                    <div class="ui-detail-head">
                        <div class="ui-detail-titles"><h3 class="sm-detail-name">${pickTitle}</h3></div>
                    </div>
                    ${this.animStageHTML(actor, cur, 'anim-preview-canvas', 'anim-list-box-label')}
                    <div id="anim-list-box" class="ui-list ui-scroll sm-anim-list">
                        ${rowsHTML}
                    </div>
                    <div class="inspect-actions ui-panel-actions sm-anim-actions">
                        <div class="inspect-btn focusable" onclick="SceneManager._scene.editorConfirmAnim()">${useLbl}</div>
                        <div class="inspect-btn focusable" onclick="SceneManager._scene.editorCancelAnim()">${backLbl}</div>
                    </div>
                </div>`;
        } else {
            const filledIds = this._editorSlots.filter(x => x != null);
            if (filledIds.length === this._editorSlots.length) {
                const filled = this._editorSlots.map(id => $dataSkills[id]);
                const dominant = filled[FORGE_DOMINANT_IDX];
                const recessive = filled[FORGE_RECESSIVE_IDX];
                const previewName = makeFusedSpellName(filled.map(s => s.name));
                const mp = filled.reduce((a, s) => a + (s.mpCost || 0), 0);
                const ap = filled.reduce((a, s) => a + (s.tpCost || 0), 0);
                const recCat = recessive ? SkillMaster.getSkillCategory(recessive.id) : null;
                const resultIsSkill = recCat ? SkillMaster.getCategoryType(recCat) !== 'Magic' : false; // i18n-ignore: skill category id / type discriminator
                const resultKind = resultIsSkill ? (T('SkillMaster.skill')) : (T('SkillMaster.magic'));
                const previewCost = this.editorFusionCost();
                const fusedPreview = this.editorFusionPreview();
                const fusedQuote = (ST && read && fusedPreview) ? ST.quote(this.editorKeptTags(), read.target) : null;
                const previewKind = fusedPreview ? (read.target === 'skill' ? T('SkillMaster.skill') : T('SkillMaster.magic')) : resultKind;
                let fusedCard = '';
                if (fusedPreview && window.SkillDetails && typeof window.SkillDetails.card === 'function') {
                    try { fusedCard = window.SkillDetails.card(fusedPreview, actor, { canvasId: 'sm-fuse-inspect-canvas', subtitle: T('SkillMaster.preview2') }); }
                    catch (e) { fusedCard = ''; }
                }
                if (fusedPreview) {
                    rightHTML = `
                    <div class="ui-detail sm-fuse-preview">
                        ${K.stats([
                            { label: T('SkillMaster.mpLabel'), value: fusedPreview.mpCost },
                            { label: T('SkillMaster.apLabel'), value: fusedPreview.tpCost },
                            { label: T('SkillMaster.fusionCost'), value: `${previewCost} KP`, bad: knowledge < previewCost },
                            { label: T('SkillMaster.youHold'), value: `${knowledge} KP` },
                            { label: T('SkillMaster.craft.statFloor'), value: fusedQuote ? `${fusedQuote.statKey} ${fusedQuote.statReq}` : '' },
                            { label: T('SkillMaster.becomesA'), value: previewKind }
                        ])}
                        <div class="sm-craft-card">${fusedCard || `<h3 class="sm-detail-name">${previewName}</h3><div class="ui-prose">${window.NPCShared ? window.NPCShared.escapeHtml(fusedPreview.description) : fusedPreview.description}</div>`}</div>
                        <div class="cc-bio-note sm-kit-note">${T('SkillMaster.theDominantDefinesDamageAnd')}</div>
                    </div>`;
                    if (window.ItemInspect && window.ItemInspect.drawIcon) {
                        const icon = fusedPreview.iconIndex;
                        requestAnimationFrame(() => window.ItemInspect.drawIcon(icon, 'sm-fuse-inspect-canvas'));
                    }
                } else rightHTML = `
                    <div class="ui-detail sm-fuse-preview">
                        <div class="ui-detail-head">
                            <div class="ui-detail-titles">
                                <h3 class="sm-detail-name">${previewName}</h3>
                                <div class="sm-detail-meta">${T('SkillMaster.preview2')}</div>
                            </div>
                            <span class="ui-chip sm-result-chip">${T('SkillMaster.becomesA')} ${resultKind}</span>
                        </div>
                        ${K.stats([
                            { label: T('SkillMaster.mpLabel'), value: mp },
                            { label: T('SkillMaster.apLabel'), value: ap },
                            { label: T('SkillMaster.fusionCost'), value: `${previewCost} KP`, bad: knowledge < previewCost },
                            { label: T('SkillMaster.youHold'), value: `${knowledge} KP` }
                        ])}
                        ${K.stats([
                            { label: T('SkillMaster.dominant'), value: dominant.name },
                            { label: T('SkillMaster.recessive'), value: recessive.name }
                        ], 2)}
                        <div class="cc-bio-note sm-kit-note">${T('SkillMaster.theDominantDefinesDamageAnd')}</div>
                    </div>`;
            } else {
                rightHTML = `
                    <div class="ui-empty sm-empty">
                        <div class="sm-empty-icon" style="${SkillMaster.getCategoryIconStyle('All')}"></div>
                        <h3 class="sm-detail-name">${T('SkillMaster.fuseSpells3')}</h3>
                        <div class="ui-empty-text">${T('SkillMaster.forgeBlurb', { actor: window.NPCShared.escapeHtml(actor.name()), knowledge: knowledge })}</div>
                    </div>`;
            }
        }

        rightBox.innerHTML = rightHTML;
        if (animPicking) this.setupAnimPreview();
    };

    Proto.updateSpellEditorInput = function () {
        if (this._editorPicking) {
            const candidates = this.getEditorCandidatesCached(this._editorFocus);
            const max = candidates.length;
            if (Input.isTriggered('cancel') || Input.isTriggered('escape') || TouchInput.isCancelled()) {
                this._editorPicking = false;
                SoundManager.playCancel();
                this.refreshUISkillDOM();
                return;
            }
            if (max === 0) return;
            const prev = this._editorPickIndex;
            if (Input.isTriggered('ok')) { this.editorPickCandidate(this._editorPickIndex); return; }
            else if (Input.isTriggered('down') || Input.isRepeated('down')) {
                this._editorPickIndex = (this._editorPickIndex + 1) % max;
            } else if (Input.isTriggered('up') || Input.isRepeated('up')) {
                this._editorPickIndex = (this._editorPickIndex - 1 + max) % max;
            }
            if (this._editorPickIndex !== prev) {
                SoundManager.playCursor();
                this.refreshUISkillDOM();
                this.scrollToActiveItem('candidates-scroll-box', '#candidates-scroll-box .focused');
            }
            return;
        }

        if (this._editorAnimPicking) {
            const list = this.getAvailableAnimations();
            const max = list.length;
            if (Input.isTriggered('cancel') || Input.isTriggered('escape') || TouchInput.isCancelled()) {
                this.editorCancelAnim();
                return;
            }
            if (max === 0) return;
            if (Input.isTriggered('ok')) { this.editorConfirmAnim(); return; }
            else if (Input.isTriggered('down') || Input.isRepeated('down')) {
                this.editorAnimHighlight(this._editorAnimPickIndex + 1);
            } else if (Input.isTriggered('up') || Input.isRepeated('up')) {
                this.editorAnimHighlight(this._editorAnimPickIndex - 1);
            }
            return;
        }

        const customCount = this.getEditorCustomSpells().length;
        const maxFocus = FORGE_SPLIT_BASE + customCount;
        const prev = this._editorFocus;

        if ((window.CCNav ? window.CCNav.railDir() : 0) !== 0) {
            if (this._editorFocus >= FORGE_SPLIT_BASE) {
                this._editorFocus = 0;
            } else if (customCount > 0) {
                this._editorFocus = FORGE_SPLIT_BASE;
            }
            SoundManager.playCursor();
            this.refreshUISkillDOM();
            return;
        }

        if (Input.isTriggered('cancel') || Input.isTriggered('escape') || TouchInput.isCancelled()) {
            this.closeSpellEditor();
            return;
        } else if (Input.isTriggered('ok')) {
            if (this._editorFocus <= FORGE_RECESSIVE_IDX) {
                this.editorFocusSlot(this._editorFocus);
            } else if (this._editorFocus === FORGE_ANIM_IDX) {
                this.openAnimPicker();
            } else if (this._editorFocus === FORGE_TAGS_IDX) {
                const read = this.editorFusionRead();
                const chip = read && read.pool[Math.max(0, Math.min(read.pool.length - 1, this._editorTagChip || 0))];
                if (chip) this.editorToggleTag(chip.key); else SoundManager.playBuzzer();
            } else if (this._editorFocus === FORGE_CREATE_IDX) {
                this.editorCreate();
            } else {
                const list = this.getEditorCustomSpells();
                const spell = list[this._editorFocus - FORGE_SPLIT_BASE];
                if (spell) this.editorSplit(spell.id); else SoundManager.playBuzzer();
            }
            return;
        } else if (Input.isTriggered('down') || Input.isRepeated('down')) {
            this._editorFocus = (this._editorFocus + 1) % maxFocus;
            // with no pair in the slots there are no tags to stop on
            if (this._editorFocus === FORGE_TAGS_IDX && !this.editorFusionRead()) this._editorFocus++;
        } else if (Input.isTriggered('up') || Input.isRepeated('up')) {
            this._editorFocus = (this._editorFocus - 1 + maxFocus) % maxFocus;
            if (this._editorFocus === FORGE_TAGS_IDX && !this.editorFusionRead()) this._editorFocus--;
        } else if (this._editorFocus === FORGE_TAGS_IDX && this.editorFusionRead()
            && (Input.isTriggered('right') || Input.isRepeated('right') || Input.isTriggered('left') || Input.isRepeated('left'))) {
            // On the kept tags, left and right walk the chips; OK keeps or drops one.
            const n = this.editorFusionRead().pool.length;
            if (n) {
                const step = (Input.isTriggered('right') || Input.isRepeated('right')) ? 1 : -1;
                this._editorTagChip = ((this._editorTagChip || 0) + step + n) % n;
                SoundManager.playCursor();
                this.refreshUISkillDOM();
            }
            return;
        } else if (Input.isTriggered('right') || Input.isRepeated('right')) {
            if (this._ccEnterNav('right')) return;
        }

        if (this._editorFocus !== prev) {
            SoundManager.playCursor();
            this.refreshUISkillDOM();
            this.scrollToActiveItem('fused-scroll-box', '#fused-scroll-box .focused');
        }
    };

})();


//=============================================================================
// Module: SkillMasterMagicSystems.js
//=============================================================================
/*:
 * @target MZ
 * @plugindesc v4.0.0 SkillMaster - Magical Systems Astrological Wheel Interface.
 * @author Omni-Lex
 */

(() => {
    'use strict';

    window.SkillMaster = window.SkillMaster || {};

    const TAU = Math.PI * 2;

    if (!window.Scene_SkillEncyclopedia) {
        window.Scene_SkillEncyclopedia = function () {
            this.initialize(...arguments);
        };
        window.Scene_SkillEncyclopedia.prototype = Object.create(Scene_MenuBase.prototype);
        window.Scene_SkillEncyclopedia.prototype.constructor = window.Scene_SkillEncyclopedia;
    }

    const Proto = window.Scene_SkillEncyclopedia.prototype;

    Proto.openMagicSystems = function () {
        this._viewMode = 'magicSystems';
        this._magicSystemSelected = null;
        SoundManager.playOk();
        this.refreshUISkillDOM();
    };

    Proto.closeMagicSystems = function () {
        this._viewMode = 'category';
        SoundManager.playCancel();
        this._lastLeftMode = null;
        this._lastLeftCategory = null;
        this._lastRightMode = null;
        this._lastRightSkillId = null;
        this._lastRightKnowledge = null;
        this.refreshUISkillDOM();
    };

    Proto.selectMagicSystem = function (id) {
        if (this._magicSystemSelected === id) return;
        this._magicSystemSelected = id;
        SoundManager.playCursor();
        this.refreshUISkillDOM();
    };

    Proto.renderMagicSystemsView = function () {
        const leftPageBox = document.getElementById('left-page-content');
        const rightPageBox = document.getElementById('right-page-content');
        if (!leftPageBox || !rightPageBox) return;

        const backLabel = T('SkillMaster.back');
        const titleLabel = T('SkillMaster.magicSystem.title');

        leftPageBox.innerHTML = `
            <div class="page-header-bar">
              <div class="back-button focusable" onclick="SceneManager._scene.closeMagicSystems()">${backLabel}</div>
              <h2 class="title">${titleLabel}</h2>
            </div>
            ${this.renderMagicSystemWheelHTML()}
        `;
        rightPageBox.innerHTML = this.renderMagicSystemDetailHTML();

        this._lastLeftMode = 'magicSystems';
        this._lastRightMode = 'magicSystems';
    };

    Proto.renderMagicSystemWheelHTML = function () {
        const systems = SkillMaster.getAllMagicalSystems();
        const size = 720;
        const cx = size / 2, cy = size / 2;
        const outerR = 270;
        const pentR = 64;
        const n = Math.max(1, systems.length);
        const selected = this._magicSystemSelected;
        const actor = this.getTeachActor();
        const actorSystem = actor ? SkillMaster.getActorMagicSystem(actor.actorId()) : null;

        const pts = systems.map((sys, i) => {
            const angle = -Math.PI / 2 + (i / n) * TAU;
            return { sys, x: cx + Math.cos(angle) * outerR, y: cy + Math.sin(angle) * outerR };
        });

        let ringHTML = '';
        for (let i = 0; i < pts.length; i++) {
            const a = pts[i], b = pts[(i + 1) % pts.length];
            ringHTML += `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="var(--border-secondary-hover-translucent-15)" stroke-width="1.5" />`;
        }
        let spokesHTML = '';
        for (const p of pts) {
            spokesHTML += `<line x1="${cx}" y1="${cy}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="var(--border-secondary-hover-translucent-15)" stroke-width="1" stroke-dasharray="3,4" />`;
        }

        const rimHTML = `<circle class="ms-rim" cx="${cx}" cy="${cy}" r="${outerR + 38}" fill="none" stroke="var(--border-secondary-hover-translucent-15)" stroke-width="1" stroke-dasharray="2,10" />`;

        const starPts = [];
        for (let i = 0; i < 5; i++) {
            const a = -Math.PI / 2 + i * (TAU / 5);
            starPts.push([cx + Math.cos(a) * pentR, cy + Math.sin(a) * pentR]);
        }
        const order = [0, 2, 4, 1, 3, 0];
        const starPath = order.map((idx, i) => `${i === 0 ? 'M' : 'L'} ${starPts[idx][0].toFixed(1)} ${starPts[idx][1].toFixed(1)}`).join(' ') + ' Z';

        let nodesHTML = '';
        for (const p of pts) {
            const isSel = selected === p.sys.id;
            const isActor = actorSystem === p.sys.id;
            const skills = SkillMaster.getSkillsForMagicSystem(p.sys.id);
            const known = actor ? skills.filter(s => actor.isLearnedSkill(s.id)).length : 0;
            const pctLabel = skills.length ? Math.round(known / skills.length * 100) + '%' : '&mdash;';
            const yourSysTitle = T('SkillMaster.magicSystem.yourSystem');
            nodesHTML += `
                <div class="ms-node ${isSel ? 'ms-selected' : ''} ${isActor ? 'ms-actor' : ''}" data-id="${p.sys.id}" onclick="SceneManager._scene.selectMagicSystem('${p.sys.id}')" title="${isActor ? yourSysTitle : ''}" style="--ms-x:${(p.x - 70).toFixed(1)}px; --ms-y:${(p.y - 46).toFixed(1)}px; --ms-ink:${p.sys.color}">
                    <div class="ms-ring"><span class="ms-pct">${pctLabel}</span></div>
                    <div class="ms-name">${SkillMaster.getMagicSystemDisplayName(p.sys.id)}</div>
                    <div class="ms-rigor ms-rigor-${SkillMaster.getMagicSystemRigor(p.sys.id)}">${SkillMaster.getMagicSystemRigorLabel(p.sys.id)}</div>
                </div>`;
        }

        return `
            <div class="sm-wheel-frame">
                <div class="ms-wheel-box" style="--ms-wheel-size:${size}px">
                    <svg class="sm-wheel-svg" width="${size}" height="${size}">
                        ${rimHTML}
                        <g>${ringHTML}${spokesHTML}</g>
                        <g class="ms-pentacle">
                            <circle cx="${cx}" cy="${cy}" r="${pentR + 10}" fill="none" stroke="var(--text-secondary-active)" stroke-width="1.5" />
                            <path d="${starPath}" fill="none" stroke="var(--text-secondary-active)" stroke-width="1.5" />
                        </g>
                    </svg>
                    ${nodesHTML}
                </div>
            </div>
        `;
    };

    Proto.renderMagicSystemDetailHTML = function () {
        const id = this._magicSystemSelected;
        if (!id) {
            const emptyLabel = T('SkillMaster.magicSystem.empty');
            return `
                <div class="ui-empty"><div class="ui-empty-text">${emptyLabel}</div></div>`;
        }
        const sys = SkillMaster.getAllMagicalSystems().find(s => s.id === id);
        const color = sys ? sys.color : 'var(--text-secondary-active)';
        const classNames = SkillMaster.getClassesForMagicSystem(id);
        const noClassesLabel = T('SkillMaster.magicSystem.noClasses');
        const classesHTML = classNames.length
            ? `<ul class="sm-ms-list">${classNames.map(n => `<li>${n}</li>`).join('')}</ul>`
            : `<div class="ui-empty-note">${noClassesLabel}</div>`;

        const actor = this.getTeachActor();
        const skills = SkillMaster.getSkillsForMagicSystem(id);
        const known = actor ? skills.filter(s => actor.isLearnedSkill(s.id)).length : 0;
        const fractionLine = skills.length
            ? `<div class="sm-ms-fraction">${T('SkillMaster.magicSystem.knownFraction', { known: known, total: skills.length, pct: Math.round(known / skills.length * 100) })}</div>`
            : '';
        const noSpellsLabel = T('SkillMaster.magicSystem.noSpells');
        const spellsHTML = skills.length
            ? `<ul class="sm-ms-list">${skills.map(s => {
                const isKnown = actor && actor.isLearnedSkill(s.id);
                return `<li class="${isKnown ? 'sm-ms-known' : ''}">${isKnown ? '&#10003; ' : ''}${s.name}</li>`;
              }).join('')}</ul>`
            : `<div class="ui-empty-note">${noSpellsLabel}</div>`;

        const loreText = SkillMaster.getMagicSystemLore(id);
        const loreHeading = T('SkillMaster.magicSystem.loreHeading');
        const loreHTML = loreText
            ? `<div class="ui-section"><h4 class="inspect-section-title">${loreHeading}</h4><div class="ui-prose sm-ms-lore">${loreText}</div></div>`
            : '';
        const classesHeading = T('SkillMaster.magicSystem.classesHeading');
        const spellsHeading = T('SkillMaster.magicSystem.spellsHeading');

        return `
            <div class="ui-detail sm-ms-detail" style="--ms-ink:${color}">
                <div class="ui-detail-head">
                    <span class="sm-ms-dot"></span>
                    <div class="ui-detail-titles">
                        <h3 class="sm-detail-name">${SkillMaster.getMagicSystemDisplayName(id)}</h3>
                        <div class="sm-ms-rigor sm-ms-rigor-${SkillMaster.getMagicSystemRigor(id)}" title="${SkillMaster.getMagicSystemRigorHint(id)}">${SkillMaster.getMagicSystemRigorLabel(id)}</div>
                        ${fractionLine}
                    </div>
                </div>
                <div class="ui-detail-scroll ui-scroll">
                    <div class="ui-prose">${SkillMaster.getMagicSystemDesc(id)}</div>
                    ${loreHTML}
                    <div class="ui-section">
                        <h4 class="inspect-section-title">${classesHeading}</h4>
                        ${classesHTML}
                    </div>
                    <div class="ui-section">
                        <h4 class="inspect-section-title">${spellsHeading}</h4>
                        ${spellsHTML}
                    </div>
                </div>
            </div>
        `;
    };

})();


//=============================================================================
// Module: SkillMasterUI.js
//=============================================================================
/*:
 * @target MZ
 * @plugindesc v4.0.0 SkillMaster - Main Encyclopedia Scene & 2D Skill Tree Controller.
 * @author Omni-Lex
 */

(() => {
    'use strict';

    window.SkillMaster = window.SkillMaster || {};

    // The name escaper lives in the core block; this block borrows it.
    const escHtml = (s) => window.SkillMaster.escHtml(s);

    // Three across, with the backpack and the skills menu. The track count lives
    // in .sm-school-grid (css/theme.css); this is the cursor's copy of it and the
    // two move together.
    const CATEGORY_PAGE_COLS = 3;

    // The benches in the rail down the right edge of the sheet, in the order
    // the cursor walks them down the column. The rail's markup is written in
    // the same order, so the two can never drift apart.
    const CATEGORY_ACTION_BTNS = ['.fuse-spells-btn', '.craft-spell-btn', '.magic-systems-btn',
        '.craft-skill-btn', '.enchant-weapon-btn', '.enchant-armor-btn', '.enchant-book-btn',
        '.write-skillbook-btn', '.write-grimorie-btn', '.hexorcize-btn', '.lobotomagic-btn', '.expression-btn'];
    const CATEGORY_ACTION_FNS = [
        (sc) => sc.openSpellEditor(),
        (sc) => sc.openCraftBench('spell'),
        (sc) => sc.openMagicSystems(),
        (sc) => sc.openCraftBench('skill'),
        (sc) => sc.openEnchantBench('weapon'),
        (sc) => sc.openEnchantBench('armor'),
        (sc) => sc.openEnchantBench('book'),
        (sc) => sc.openWriteBench('skillbook'),
        (sc) => sc.openWriteBench('grimorie'),
        (sc) => sc.openHexorcizeBench(),
        (sc) => sc.openLobotomagicBench(),
        (sc) => sc.openExpressionPicker(),
    ];
    const SKILL_GRID_COLS = 2;
    const ATLAS_ZOOM_DEFAULT = 1.0;
    const ATLAS_ZOOM_WHOLE = 0.65;
    const ATLAS_ZOOM_STEP = 1.15;
    const ATLAS_WHEEL_STEP = 1.08;

    function getSwitchableMembers() {
        return ($gameParty && $gameParty.allMembers) ? $gameParty.allMembers() : [];
    }

    const Scene_SkillEncyclopedia = window.Scene_SkillEncyclopedia || function () {
        this.initialize(...arguments);
    };
    if (!window.Scene_SkillEncyclopedia) {
        Scene_SkillEncyclopedia.prototype = Object.create(Scene_MenuBase.prototype);
        Scene_SkillEncyclopedia.prototype.constructor = Scene_SkillEncyclopedia;
        window.Scene_SkillEncyclopedia = Scene_SkillEncyclopedia;
    }

    Scene_SkillEncyclopedia.prototype.initialize = function () {
        Scene_MenuBase.prototype.initialize.call(this);
        this._viewMode = 'category';
        const varId = (SkillMaster.params && SkillMaster.params.variableId) || 1;
        this._preselectedSkillId = $gameVariables ? $gameVariables.value(varId) : 0;
        this.handlePreselection();
    };

    Scene_SkillEncyclopedia.prototype.handlePreselection = function () {
        this._categoryPane = 0;
        this._selectedCategoryIndex = 0;
        this._selectedSkillIndex = 0;
        this._selectedActionIndex = 0;
        this._focusSkillId = 0;
        this._atlasZoom = 0;
        this._atlasCategory = null;
        this._atlasMemory = {};
        this._categoryFuseFocused = false;

        const leader = $gameParty ? $gameParty.leader() : null;
        this._teachActorId = leader ? leader.actorId() : 1;
        SkillMaster.actorCategoryManager.setActor(this._teachActorId);

        if (this._preselectedSkillId > 0) {
            const skillId = this._preselectedSkillId;
            const skill = $dataSkills[skillId];
            if (skill) {
                const category = SkillMaster.getSkillCategory(skillId);
                if (category) {
                    this._selectedCategory = category;
                    const split = SkillMaster.getSplitSkillCategories();
                    const pane = SkillMaster.getCategoryType(category) === 'Magic' ? 1 : 0; // i18n-ignore: skill category id / type discriminator
                    const list = pane === 1 ? split.Magic : split.Skill;
                    const catIdx = list.indexOf(category);
                    if (catIdx !== -1) {
                        this._categoryPane = pane;
                        this._selectedCategoryIndex = catIdx;
                        const skills = SkillMaster.getSkillsByCategory(category);
                        const skillIdx = skills.findIndex(s => s.id === skillId);
                        if (skillIdx !== -1) {
                            this._selectedSkillIndex = skillIdx;
                            this._focusSkillId = skillId;
                            this._viewMode = 'detail';
                            this._selectedActionIndex = 0;
                            this._preselectedSkillId = 0;
                            return;
                        }
                    }
                }
            }
            this._preselectedSkillId = 0;
        }
    };

    Scene_SkillEncyclopedia.prototype.getTeachActor = function () {
        return ($gameActors && $gameActors.actor(this._teachActorId)) || ($gameParty && $gameParty.leader());
    };

    Scene_SkillEncyclopedia.prototype.create = function () {
        Scene_MenuBase.prototype.create.call(this);
        if (SkillMaster.injectAllCustomSpells) SkillMaster.injectAllCustomSpells();
        this.createCategoryWindow();
        this.createSkillListWindow();
        this.createSkillDetailWindow();
        this.createUISkillDOM();
        if (window.CharSwitcher) {
            window.CharSwitcher.installTabKey(this, (dir) => {
                const benches = ['spellEditor', 'craft', 'enchant', 'writebook', 'hexorcize', 'expression', 'preview'];
                if (!benches.includes(this._viewMode) && getSwitchableMembers().length > 1) this.cycleTeachActor(dir);
            });
        }
    };

    Scene_SkillEncyclopedia.prototype.terminate = function () {
        Scene_MenuBase.prototype.terminate.call(this);
        if (window.CCNav) window.CCNav.detach(this);
        if (window.CharSwitcher) window.CharSwitcher.removeTabKey(this);
        if (window.SkillAnimPreview) window.SkillAnimPreview.dispose();
        if (window.SkillTree2D) window.SkillTree2D.dispose();
        if (this._dndContainer) {
            const container = this._dndContainer;
            container.classList.add('sm-container--leaving');
            setTimeout(() => {
                if (container && container.parentNode) {
                    container.parentNode.removeChild(container);
                }
            }, 200);
            this._dndContainer = null;
        }
    };

    Scene_SkillEncyclopedia.prototype.createCategoryWindow = function () {
        this._categoryWindow = new Window_SkillCategory(new Rectangle(0, 0, 100, 100));
        this._categoryWindow.visible = false;
        this.addWindow(this._categoryWindow);
    };

    Scene_SkillEncyclopedia.prototype.createSkillListWindow = function () {
        this._skillListWindow = new Window_SkillMasterList(new Rectangle(0, 0, 100, 100));
        this._skillListWindow.visible = false;
        this.addWindow(this._skillListWindow);
    };

    Scene_SkillEncyclopedia.prototype.createSkillDetailWindow = function () {
        this._skillDetailWindow = new Window_SkillDetail(new Rectangle(0, 0, 100, 100));
        this._skillDetailWindow.visible = false;
        this.addWindow(this._skillDetailWindow);
    };

    Scene_SkillEncyclopedia.prototype.createUISkillDOM = function () {
        this._dndContainer = document.createElement('div');
        this._dndContainer.id = 'menu-container';
        // Every one of the ten properties this used to set from script is a
        // class now: the ground, the type and the fade all live in the sheet.
        this._dndContainer.classList.add('sm-container');

        this._dndContainer.innerHTML = `
            <div class="book-spread">
                <div class="spine-divider"></div>
                <div class="left-page sm-page">
                    <div id="left-page-content" class="sm-page-body"></div>
                </div>
                <div class="right-page sm-page">
                    <div class="companion-switcher ui-switcher-row" id="skillmaster-companion-row"></div>
                    <div id="right-page-content" class="sm-page-body"></div>
                </div>
            </div>
        `;

        document.body.appendChild(this._dndContainer);

        if (window.CCNav) window.CCNav.attach(this, this._dndContainer);

        // The "?" explains the view on screen: the three views of one school
        // are all its atlas.
        if (window.UIHelp) {
            const ATLAS_VIEWS = { list: 1, detail: 1, preview: 1 };
            UIHelp.attach(this._dndContainer, () =>
                'SkillMaster.help.' + (ATLAS_VIEWS[this._viewMode] ? 'atlas' : this._viewMode));
        }

        this._dndContainer.addEventListener("wheel", (e) => {
            e.preventDefault();
            // Every scrolling pane on this screen wears the shared .ui-scroll
            // now; the school grids are the last to keep their own name.
            let box = e.target.closest && e.target.closest('.ui-scroll, .skill-scroll-box');
            if (!box) {
                box = document.getElementById('category-scroll-box') ||
                      document.getElementById('skills-scroll-box');
            }
            if (!box) {
                if (document.getElementById('skill-atlas-canvas')) {
                    this.setAtlasZoom(this.atlasZoom() * (e.deltaY > 0 ? 1 / ATLAS_WHEEL_STEP : ATLAS_WHEEL_STEP));
                }
                return;
            }
            box.scrollTop += e.deltaY;
        }, { passive: false });

        this._lastLeftMode = null;
        this._lastLeftCategory = null;
        this._lastRightMode = null;
        this._lastRightSkillId = null;
        this._lastRightKnowledge = null;
        this._lastPopupKey = null;

        this.refreshUISkillDOM();

        setTimeout(() => {
            if (this._dndContainer) {
                this._dndContainer.classList.add('sm-container--shown');
            }
        }, 16);
    };

    Scene_SkillEncyclopedia.prototype.getCategoryEmoji = function (catName) {
        return '';
    };

    //=========================================================================
    // 2D Skill Tree Atlas Controller
    //=========================================================================

    Scene_SkillEncyclopedia.prototype.atlasCategories = function () {
        const split = this.getSplitCategoriesCached();
        return split.Skill.filter(c => c !== 'All').concat(split.Magic); // i18n-ignore: skill category id / type discriminator
    };

    Scene_SkillEncyclopedia.prototype.viewedCategory = function () {
        const list = this.atlasCategories();
        if (!list.length) return null;
        if (!this._atlasCategory || !list.includes(this._atlasCategory)) {
            const chosen = this._selectedCategory;
            this._atlasCategory = list.includes(chosen) ? chosen : list[0];
        }
        return this._atlasCategory;
    };

    Scene_SkillEncyclopedia.prototype.currentAtlas = function () {
        return SkillMaster.SkillAtlas ? SkillMaster.SkillAtlas.build(this.viewedCategory()) : { circles: [], index: {} };
    };

    Scene_SkillEncyclopedia.prototype.showAtlasCategory = function (category) {
        const list = this.atlasCategories();
        if (!category || !list.includes(category) || category === this._atlasCategory) return false;
        if (!this._atlasMemory) this._atlasMemory = {};
        if (this._atlasCategory) {
            this._atlasMemory[this._atlasCategory] = {
                skillId: this._focusSkillId, zoom: this._atlasZoom
            };
        }
        this._atlasCategory = category;
        this._selectedCategory = category;
        if (this._skillListWindow) this._skillListWindow.setCategory(category);
        const kept = this._atlasMemory[category];
        this._atlasZoom = 0;
        this._focusSkillId = 0;
        if (kept && this.currentAtlas().index[kept.skillId]) {
            this._focusSkillId = kept.skillId;
            this._atlasZoom = kept.zoom || 0;
        } else {
            this.defaultGraphFocus();
        }
        return true;
    };

    Scene_SkillEncyclopedia.prototype.pageAtlasSchool = function (dir) {
        const list = this.atlasCategories();
        if (list.length <= 1) return false;
        const cur = list.indexOf(this.viewedCategory());
        const next = ((cur < 0 ? 0 : cur) + dir + list.length) % list.length;
        if (!this.showAtlasCategory(list[next])) return false;
        SoundManager.playCursor();
        this.refreshUISkillDOM();
        this.centreAtlasOnFocus();
        return true;
    };

    Scene_SkillEncyclopedia.prototype.usesGraphView = function () {
        return window.SkillTree2D && window.SkillTree2D.available() && this.currentAtlas().circles.length > 0;
    };

    Scene_SkillEncyclopedia.prototype.focusedSkill = function () {
        if (this.usesGraphView()) {
            const skill = $dataSkills[this._focusSkillId];
            if (skill) return skill;
        }
        const skills = this.getSkillsByCategoryCached(this._selectedCategory);
        return skills[this._selectedSkillIndex] || null;
    };

    Scene_SkillEncyclopedia.prototype.focusedCategory = function () {
        if (this.usesGraphView()) return this.viewedCategory();
        return this._selectedCategory;
    };

    Scene_SkillEncyclopedia.prototype.focusSkillId = function (skillId) {
        if (this.currentAtlas().index[skillId]) {
            this._focusSkillId = skillId;
            return true;
        }
        const skills = this.getSkillsByCategoryCached(this._selectedCategory);
        const idx = skills.findIndex(s => s.id === skillId);
        if (idx >= 0) {
            this._selectedSkillIndex = idx;
            this._focusSkillId = skillId;
        }
        return idx >= 0;
    };

    Scene_SkillEncyclopedia.prototype.ensureAtlasFocus = function () {
        const atlas = this.currentAtlas();
        if (!atlas.circles.length || atlas.index[this._focusSkillId]) return;
        this.defaultGraphFocus();
    };

    Scene_SkillEncyclopedia.prototype.defaultGraphFocus = function () {
        const atlas = this.currentAtlas();
        if (!atlas.circles.length) return;
        const circle = atlas.circles[0];
        const actor = this.getTeachActor();
        const known = actor ? circle.nodes.find(n => actor.isLearnedSkill(n.id)) : null;
        const entry = circle.nodes.find(n => n.tier === 0) || circle.nodes[0];
        this.focusSkillId((known || entry).id);
    };

    Scene_SkillEncyclopedia.prototype.graphStateKey = function () {
        const actor = this.getTeachActor();
        const atlas = this.currentAtlas();
        let learned = 0;
        if (actor) {
            for (const circle of atlas.circles) {
                for (const node of circle.nodes) if (actor.isLearnedSkill(node.id)) learned++;
            }
        }
        return `${atlas.key}|${actor ? actor.actorId() : 0}|${learned}`;
    };

    Scene_SkillEncyclopedia.prototype.atlasLearnedCount = function (category) {
        const circle = this.currentAtlas().circles.find(s => !category || s.category === category);
        const actor = this.getTeachActor();
        if (!circle) return { learned: 0, total: 0 };
        let learned = 0;
        if (actor) for (const node of circle.nodes) if (actor.isLearnedSkill(node.id)) learned++;
        return { learned: learned, total: circle.nodes.length };
    };

    Scene_SkillEncyclopedia.prototype.atlasProgressText = function (category) {
        const count = this.atlasLearnedCount(category);
        return T('SkillMaster.atlas.progress', { learned: count.learned, total: count.total });
    };

    Scene_SkillEncyclopedia.prototype.atlasZoom = function () {
        if (!this._atlasZoom) this._atlasZoom = ATLAS_ZOOM_DEFAULT;
        return this._atlasZoom;
    };

    Scene_SkillEncyclopedia.prototype.defaultAtlasZoom = function () {
        return ATLAS_ZOOM_DEFAULT;
    };

    Scene_SkillEncyclopedia.prototype.wholeAtlasZoom = function () {
        return ATLAS_ZOOM_WHOLE;
    };

    Scene_SkillEncyclopedia.prototype.setAtlasZoom = function (zoom) {
        this._atlasZoom = zoom;
        if (window.SkillTree2D) window.SkillTree2D.setZoom(zoom);
    };

    Scene_SkillEncyclopedia.prototype.zoomAtlas = function (dir) {
        this.setAtlasZoom(dir > 0 ? this.atlasZoom() * ATLAS_ZOOM_STEP : this.atlasZoom() / ATLAS_ZOOM_STEP);
    };

    Scene_SkillEncyclopedia.prototype.syncAtlasSky = function () {
        const canvas = document.getElementById('skill-atlas-canvas');
        if (!canvas) {
            if (window.SkillTree2D) window.SkillTree2D.dispose();
            return;
        }
        if (!window.SkillTree2D.state || window.SkillTree2D.state.canvas !== canvas) {
            window.SkillTree2D.mount(canvas, document.getElementById('skill-atlas-labels'), this);
            if (!window.SkillTree2D.state) return;
            window.SkillTree2D.setZoom(this.atlasZoom());
            this.bindAtlasPointer();
            this._lastGraphKey = null;
        }
        const atlas = this.currentAtlas();
        const figure = atlas.circles[0] || null;
        if (window.SkillTree2D.state.figure !== figure) {
            window.SkillTree2D.setAtlas(atlas);
            this._lastGraphKey = null;
            window.SkillTree2D.setZoom(this.atlasZoom());
            window.SkillTree2D.lookAt(this._focusSkillId, true);
        }
        const graphKey = this.graphStateKey();
        if (graphKey !== this._lastGraphKey) {
            this._lastGraphKey = graphKey;
            window.SkillTree2D.repaint(this.getTeachActor(), this._focusSkillId);
        }
    };

    Scene_SkillEncyclopedia.prototype.bindAtlasPointer = function () {
        const st = window.SkillTree2D.state;
        if (!st || st.bound) return;
        const canvas = st.canvas;
        st.bound = true;
        const DEAD = 5;
        let dragging = false, fromX = 0, fromY = 0;
        st.dragged = false;

        const L = st.listeners;
        L.down = (e) => {
            if (e.button !== 0 && e.button !== 2) return;
            dragging = true;
            st.dragged = false;
            fromX = e.clientX; fromY = e.clientY;
            canvas.classList.add('sm-grabbing');
        };
        L.move = (e) => {
            const rect = canvas.getBoundingClientRect();
            if (!dragging) {
                st.hoverId = window.SkillTree2D.pick(e.clientX - rect.left, e.clientY - rect.top);
                canvas.classList.toggle('sm-pointing', !!st.hoverId);
                return;
            }
            const dx = e.clientX - fromX, dy = e.clientY - fromY;
            if (!st.dragged && Math.abs(dx) + Math.abs(dy) < DEAD) return;
            st.dragged = true;
            window.SkillTree2D.pan(dx, dy);
            fromX = e.clientX; fromY = e.clientY;
        };
        L.up = () => {
            dragging = false;
            canvas.classList.remove('sm-grabbing');
        };
        L.click = (e) => {
            if (st.dragged) { st.dragged = false; return; }
            const rect = canvas.getBoundingClientRect();
            const id = window.SkillTree2D.pick(e.clientX - rect.left, e.clientY - rect.top);
            if (id) this.selectGraphNode(id);
        };
        L.wheel = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.setAtlasZoom(this.atlasZoom() * (e.deltaY > 0 ? 1 / ATLAS_WHEEL_STEP : ATLAS_WHEEL_STEP));
        };
        L.ctx = (e) => e.preventDefault();

        canvas.addEventListener('pointerdown', L.down);
        canvas.addEventListener('pointermove', L.move);
        window.addEventListener('pointerup', L.up);
        canvas.addEventListener('click', L.click);
        canvas.addEventListener('wheel', L.wheel, { passive: false });
        canvas.addEventListener('contextmenu', L.ctx);
    };

    Scene_SkillEncyclopedia.prototype.renderAtlasTitleHTML = function () {
        const heading = this.focusedCategory();
        const name = SkillMaster.getCategoryDisplayName(heading);
        const list = this.atlasCategories();
        const cur = list.indexOf(this.viewedCategory());
        if (list.length <= 1 || cur < 0) return name;
        const prev = list[(cur - 1 + list.length) % list.length];
        const next = list[(cur + 1) % list.length];
        return `
            <span class="sg-title-arrow" onclick="SceneManager._scene.pageAtlasSchool(-1)" title="${SkillMaster.getCategoryDisplayName(prev)}">&#8249;</span>
            <span class="sg-title-name">${name}</span>
            <span class="sg-title-arrow" onclick="SceneManager._scene.pageAtlasSchool(1)" title="${SkillMaster.getCategoryDisplayName(next)}">&#8250;</span>`;
    };

    Scene_SkillEncyclopedia.prototype.renderAtlasChromeHTML = function () {
        const category = this.viewedCategory();
        const count = this.atlasLearnedCount(category);
        const progressText = T('SkillMaster.atlas.progress', { learned: count.learned, total: count.total });
        return `
            <div class="sg-topbar">
                <span class="sg-progress">${progressText}</span>
                <span class="sg-zoom" onclick="SceneManager._scene.zoomAtlas(-1)">-</span>
                <span class="sg-zoom" onclick="SceneManager._scene.zoomAtlas(1)">+</span>
            </div>`;
    };

    Scene_SkillEncyclopedia.prototype.renderSkillAtlasHTML = function () {
        return `
            <div id="sg3-chrome">${this.renderAtlasChromeHTML()}</div>
            <div id="skill-atlas-box" class="sg3-sky sg2d-sky-box sm-atlas-box">
                <canvas id="skill-atlas-canvas" class="sm-atlas-canvas"></canvas>
                <div id="skill-atlas-labels" class="sg3-labels sm-atlas-labels"></div>
            </div>
        `;
    };

    Scene_SkillEncyclopedia.prototype.renderSkillListHTML = function () {
        const skills = SkillMaster.getSkillsByCategory(this._selectedCategory);
        const teachActor = this.getTeachActor();
        let skillsListHTML = "";

        skills.forEach((skill, idx) => {
            const isFocused = (this._selectedSkillIndex === idx);
            const isLearned = teachActor ? teachActor.isLearnedSkill(skill.id) : false;
            const isLent = !isLearned && window.EquipSkills && window.EquipSkills.grants(teachActor, skill.id);
            const isOpen = window.SkillGraph ? window.SkillGraph.isOpen(teachActor, skill.id) : true;
            const badge = isLearned
                ? `<span class="ui-chip sm-skill-badge sm-skill-badge--learned">${T('SkillMaster.mastered')}</span>`
                : (isLent ? `<span class="ui-chip sm-skill-badge sm-skill-badge--lent">${T('SkillMaster.lent')}</span>`
                : (!isOpen ? `<span class="ui-chip sm-skill-badge sm-skill-badge--locked">${T('SkillMaster.graph.locked')}</span>` : ''));

            skillsListHTML += `
                <div class="sm-skill-row focusable ${isFocused ? 'focused' : ''} ${isLearned || isLent || isOpen ? '' : 'is-shut'}" onclick="SceneManager._scene.selectSkill(${idx})">
                    <span class="sm-skill-ident">
                        <span class="sm-skill-icon" style="${SkillMaster.getSkillIconStyle(skill.iconIndex)}"></span>
                        <span class="sm-skill-name">${skill.name}</span>
                    </span>
                    ${badge}
                </div>
            `;
        });

        // The track count is the scene's own (the cursor walks it), so it is
        // handed to the stylesheet as a property rather than as a grid rule.
        return `
            <div id="skills-scroll-box" class="ui-list ui-scroll sm-skill-grid" style="--sm-skill-cols:${SKILL_GRID_COLS}">
                ${skillsListHTML}
            </div>
        `;
    };

    Scene_SkillEncyclopedia.prototype.selectGraphNode = function (skillId) {
        if (this._focusSkillId !== skillId && !this.focusSkillId(skillId)) return;
        this.scrollGraphToFocus();
        this.openFocusedSkill();
    };

    Scene_SkillEncyclopedia.prototype.openFocusedSkill = function () {
        const skill = this.focusedSkill();
        if (!skill) { SoundManager.playBuzzer(); return; }
        this._skillDetailWindow.setSkill(skill);
        this._viewMode = 'detail';
        this._selectedActionIndex = 0;
        SoundManager.playOk();
        this.refreshUISkillDOM();
    };

    Scene_SkillEncyclopedia.prototype.moveGraphFocus = function (dx, dy) {
        this.ensureAtlasFocus();
        const atlas = this.currentAtlas();
        const from = atlas.index[this._focusSkillId];
        if (!from) return false;

        let best = null;
        let bestScore = Infinity;
        for (const circle of atlas.circles) {
            for (const node of circle.nodes) {
                if (node.id === from.id) continue;
                const vx = node.x - from.x;
                const vy = node.y - from.y;
                const along = vx * dx + vy * dy;
                if (along <= 0.05) continue;
                const across = Math.abs(vx * dy - vy * dx);
                if (across > along * 1.9) continue;
                const score = along + across * 2.2;
                if (score < bestScore) {
                    bestScore = score;
                    best = node;
                }
            }
        }
        if (!best) return false;
        this.focusSkillId(best.id);
        return true;
    };

    Scene_SkillEncyclopedia.prototype.scrollGraphToFocus = function () {
        if (window.SkillTree2D) {
            window.SkillTree2D.setFocus(this._focusSkillId);
            window.SkillTree2D.lookAt(this._focusSkillId, false);
        }
    };

    Scene_SkillEncyclopedia.prototype.centreAtlasOnFocus = function () {
        if (window.SkillTree2D) {
            window.SkillTree2D.setFocus(this._focusSkillId);
            window.SkillTree2D.lookAt(this._focusSkillId, true);
        }
    };

    Scene_SkillEncyclopedia.prototype.repaintAtlasFocus = function () {
        if (window.SkillTree2D) window.SkillTree2D.setFocus(this._focusSkillId);
        const title = document.getElementById('atlas-school-name');
        const activeCat = this.focusedCategory();
        if (title && activeCat) {
            const titleHTML = this.renderAtlasTitleHTML();
            if (title.innerHTML !== titleHTML) title.innerHTML = titleHTML;
        }
        const chrome = document.getElementById('sg3-chrome');
        if (chrome) {
            const html = this.renderAtlasChromeHTML();
            if (chrome.innerHTML !== html) chrome.innerHTML = html;
        }
    };

    //=========================================================================
    // Skill Detail Sheet Renderer
    //=========================================================================

    Scene_SkillEncyclopedia.prototype.renderSkillDetailHTML = function (skill, knowledge, opts) {
        opts = opts || {};
        const allowActionFocus = (this._viewMode === 'detail');
        let actionsListHTML = "";
        const actor = this.getTeachActor();

        if (actor) {
            const hasSkill = actor.isLearnedSkill(skill.id);
            const cost = $gameSystem.getSkillKnowledgeCost(skill.id, actor.actorId());
            const canAfford = knowledge >= cost;
            const isActionFocused = allowActionFocus && (this._selectedActionIndex === 0);
            const isOpen = window.SkillGraph ? window.SkillGraph.isOpen(actor, skill.id) : true;

            // Lent by worn gear: the character can cast it now, it costs them
            // no carried slot, and it stops being theirs the moment the piece
            // comes off. Learning it properly is still offered underneath.
            const lender = window.EquipSkills ? window.EquipSkills.source(actor, skill.id) : null;
            if (lender) {
                actionsListHTML += `
                    <div class="sm-state-row sm-state-row--lent">
                        <span class="sm-state-title">${escHtml(actor.name())}</span>
                        <span class="sm-state-mark">${T('SkillMaster.lentBy', { item: lender.name })}</span>
                    </div>
                `;
            }

            if (hasSkill) {
                const learnedLabel = T('SkillMaster.learned');
                actionsListHTML += `
                    <div class="sm-state-row sm-state-row--learned">
                        <span class="sm-state-title">${escHtml(actor.name())}</span>
                        <span class="sm-state-mark">✓ ${learnedLabel}</span>
                    </div>
                `;
                actionsListHTML += this.carryToggleHTML(actor, skill, allowActionFocus);
                actionsListHTML += this.rewriteActionsHTML(skill);
                actionsListHTML += this.fusionActionsHTML(actor, skill);
            } else if (!isOpen) {
                const graph = window.SkillGraph;
                const openers = graph ? graph.openers(skill.id, actor).map(s => s.name) : [];
                const wanted = graph ? graph.stillWanted(skill.id, actor) : 1;
                const arcana = window.SkillArcana;
                const arcaneReason = arcana ? arcana.treeBlockReason(actor, skill.id) : null;
                const lockLine = arcaneReason === 'cultist'
                    ? (T('SkillMaster.graph.lockedCultist'))
                    : arcaneReason === 'level'
                    ? (arcana.isForbidden(skill.id)
                        ? T('SkillMaster.graph.lockedForbiddenLevel', { level: arcana.requiredLevel(skill.id) })
                        : T('SkillMaster.graph.lockedEsotericLevel', { level: arcana.requiredLevel(skill.id) }))
                    : (openers.length
                        ? (wanted > 1
                            ? (T('SkillMaster.graph.lockedByCount', { need: wanted, skills: openers.join(', ') }))
                            : (T('SkillMaster.graph.lockedBy', { skills: openers.join(', ') })))
                        : (T('SkillMaster.graph.lockedHint')));
                const lockedTitle = T('SkillMaster.graph.locked');
                actionsListHTML += `
                    <div class="sm-state-row sm-state-row--locked">
                        <div class="sm-state-line">
                            <span class="sm-state-title">${lockedTitle}</span>
                            <span class="sm-state-cost">${cost} KP</span>
                        </div>
                        <div class="sm-state-note">${lockLine}</div>
                    </div>
                `;
            } else {
                const teachText = T('SkillMaster.teachPupil', { actor: actor.name() });
                actionsListHTML += `
                    <div class="inspect-btn sm-wide-btn focusable ${isActionFocused ? 'selected' : ''} ${!canAfford ? 'unusable' : ''}" onclick="SceneManager._scene.teachSkill(${actor.actorId()}, ${cost})">
                        <span class="sm-btn-label">${teachText}</span>
                        <span class="sm-btn-cost">${cost} KP</span>
                    </div>
                `;
            }
        }

        const isPreviewFocused = allowActionFocus && (this._selectedActionIndex === 1);
        const previewLabel = T('SkillMaster.preview');
        const previewBtnHTML = `
            <div class="inspect-btn sm-preview-btn focusable ${isPreviewFocused ? 'selected' : ''}" onclick="SceneManager._scene.openSpellPreview(${skill.id})">
                ${previewLabel}
            </div>`;

        const note = skill.note || '';
        const tagForbidden = T('SkillMaster.tag.forbidden');
        const tagEsoteric = T('SkillMaster.tag.esoteric');
        const occultBadge = /<Forbidden>/i.test(note)
            ? `<span class="sg-occult sg-forbidden">${tagForbidden}</span>`
            : (/<Esoteric>/i.test(note) ? `<span class="sg-occult">${tagEsoteric}</span>` : '');

        const rootClass = opts.popup ? 'sm-skill-detail--popup' : '';
        const closeBtnHTML = opts.popup
            ? `<div class="sm-detail-close focusable" onclick="SceneManager._scene.dismissSkillDetail()" title="${T('SkillMaster.close')}">✕</div>`
            : '';

        const teachLabel = T('SkillMaster.teach');
        const heldLabel = T('SkillMaster.atlas.held', { knowledge: knowledge });

        // The card itself is window.SkillDetails.card, the very page the skills
        // menu reads a skill on (CategorizedBattleSkills.js), so a spell read on
        // the atlas and the same spell read in the menu can never drift apart.
        // This scene only supplies what belongs to it: the teaching strip.
        const teachHTML = `
            <div class="sm-teach-section">
                <h4 class="inspect-section-title sm-teach-heading">
                    ${teachLabel}
                    <span class="sm-teach-held">&middot; ${heldLabel}</span>
                    ${occultBadge}
                </h4>
                <div class="sm-teach-actions">
                    ${actionsListHTML}
                    ${previewBtnHTML}
                </div>
            </div>`;

        const cardHTML = (window.SkillDetails && actor)
            ? window.SkillDetails.card(skill, actor, {
                canvasId: SM_DETAIL_CANVAS_ID,
                actionsHTML: teachHTML
            })
            : '';

        return `
            <div class="sm-skill-detail ${rootClass}">
                ${closeBtnHTML}
                ${cardHTML}
            </div>
        `;
    };

    // The skill icon on that card is painted onto a canvas, the way the backpack
    // paints an item's, so every redraw of the panel repaints it.
    const SM_DETAIL_CANVAS_ID = 'sm-skill-inspect-canvas';
    Scene_SkillEncyclopedia.prototype.paintSkillDetailIcon = function (skill) {
        if (!skill || !window.ItemInspect || !window.ItemInspect.drawIcon) return;
        window.ItemInspect.drawIcon(skill.iconIndex, SM_DETAIL_CANVAS_ID);
    };

    Scene_SkillEncyclopedia.prototype.skillPopupKey = function (skill, knowledge) {
        const actor = this.getTeachActor();
        const LO = window.BattleLoadout;
        const carried = (LO && actor) ? `${LO.isActive(actor, skill) ? 1 : 0}${LO.count(actor)}` : '';
        return `${skill.id}|${actor ? actor.actorId() : 0}|${knowledge}|${this._selectedActionIndex}|${actor && actor.isLearnedSkill(skill.id) ? 1 : 0}|${carried}`;
    };

    Scene_SkillEncyclopedia.prototype.closeSkillDetailPopup = function () {
        const el = document.getElementById('skill-detail-popup');
        if (el && el.parentNode) el.parentNode.removeChild(el);
        this._lastPopupKey = null;
    };

    Scene_SkillEncyclopedia.prototype.dismissSkillDetail = function () {
        if (this._viewMode !== 'detail') return;
        this._viewMode = 'list';
        SoundManager.playCancel();
        this.refreshUISkillDOM();
    };

    Scene_SkillEncyclopedia.prototype.updateSkillDetailPopup = function (skill, knowledge) {
        if (!this._dndContainer) return;
        const key = this.skillPopupKey(skill, knowledge);
        let overlay = document.getElementById('skill-detail-popup');
        if (overlay && this._lastPopupKey === key) return;

        const cardHTML = this.renderSkillDetailHTML(skill, knowledge, { popup: true });
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'skill-detail-popup';
            // ".inspect-pockets" is what makes it the skills menu's own page:
            // the compact tags and the flat card hang off it (css/theme.css).
            overlay.className = 'sm-detail-dock inspect-pockets';
            this._dndContainer.appendChild(overlay);
        }
        overlay.innerHTML = `
            <div id="skill-detail-bar" class="ui-panel sm-detail-bar" onclick="event.stopPropagation()">
                ${cardHTML}
            </div>`;
        this.paintSkillDetailIcon(skill);
        this._lastPopupKey = key;
    };

    //=========================================================================
    // DOM Refresh & View Modes
    //=========================================================================

    Scene_SkillEncyclopedia.prototype.refreshUISkillDOM = function () {
        if (!this._dndContainer) return;
        const useItalian = ConfigManager.language === 'it';
        const knowledge = $gameSystem.getKnowledge();

        SkillMaster.actorCategoryManager.setActor(this._teachActorId);

        const compRow = document.getElementById('skillmaster-companion-row');
        if (compRow) {
            const members = getSwitchableMembers();
            if (this._viewMode === 'spellEditor' || this._viewMode === 'craft' || this._viewMode === 'enchant' || this._viewMode === 'writebook' || this._viewMode === 'hexorcize' || this._viewMode === 'expression' || members.length <= 1) {
                compRow.classList.add('is-hidden');
                compRow.innerHTML = '';
            } else {
                compRow.classList.remove('is-hidden');
                let tabs = '';
                members.forEach((m, idx) => {
                    const sel = m.actorId() === this._teachActorId ? 'selected' : '';
                    tabs += `<div class="companion-tab ${sel}" onclick="SceneManager._scene.switchTeachActor(${idx})">${escHtml(m.name())}</div>`;
                });
                compRow.innerHTML = window.CharSwitcher ? window.CharSwitcher.inner(`<div class="companion-tabs-row">${tabs}</div>`, members.length) : `<div class="companion-tabs-row">${tabs}</div>`;
            }
        }

        const graphSpread = (this._viewMode === 'list' || this._viewMode === 'detail' || this._viewMode === 'preview') && this.usesGraphView();
        if (graphSpread) this.ensureAtlasFocus();
        if (!graphSpread && window.SkillTree2D) window.SkillTree2D.dispose();

        const fullPageList = graphSpread;
        const spreadEl = this._dndContainer.querySelector('.book-spread');
        const leftPageEl = this._dndContainer.querySelector('.left-page');
        const rightPageEl = this._dndContainer.querySelector('.right-page');
        const spineEl = this._dndContainer.querySelector('.spine-divider');
        // The atlas takes the whole sheet: one class on the spread and the
        // stylesheet folds the right page and the spine away with it.
        if (spreadEl) spreadEl.classList.toggle('skill-fullpage', fullPageList);
        // The school picker reads like a bench: every school on the left
        // leaf, every bench button on the right one.
        if (spreadEl) spreadEl.classList.toggle('sm-cat-spread', this._viewMode === 'category');

        if (compRow && !compRow.classList.contains('is-hidden')) {
            if (fullPageList && leftPageEl && compRow.parentNode !== leftPageEl) {
                leftPageEl.appendChild(compRow);
                compRow.classList.add('sm-switcher--pinned');
            } else if (!fullPageList && rightPageEl && compRow.parentNode !== rightPageEl) {
                rightPageEl.insertBefore(compRow, rightPageEl.firstChild);
                compRow.classList.remove('sm-switcher--pinned');
            }
        }

        if (!graphSpread) this.closeSkillDetailPopup();
        this.renderBenchPadTips();

        if (this._viewMode === 'spellEditor') {
            this.renderSpellEditor(useItalian, knowledge);
            return;
        }

        if (this._viewMode === 'craft') {
            this.renderCraftBench(knowledge);
            return;
        }

        if (this._viewMode === 'enchant') {
            this.renderEnchantBench(knowledge);
            return;
        }

        if (this._viewMode === 'writebook') {
            this.renderWriteBench(knowledge);
            return;
        }

        if (this._viewMode === 'hexorcize') {
            this.renderHexorcizeBench(knowledge);
            return;
        }

        if (this._viewMode === 'lobotomagic') {
            this.renderLobotomagicBench(knowledge);
            return;
        }

        if (this._viewMode === 'expression') {
            this.renderExpressionBench(knowledge);
            return;
        }

        if (this._viewMode === 'magicSystems') {
            this.renderMagicSystemsView();
            return;
        }

        const renderCategoryCardsHTML = (list, pane) => {
            let html = "";
            list.forEach((cat, idx) => {
                const focused = (this._categoryPane === pane && this._selectedCategoryIndex === idx);
                const catName = SkillMaster.getCategoryDisplayName(cat);
                let bonusBadge = "";
                if (cat !== "All") { // i18n-ignore: skill category id / type discriminator
                    if (SkillMaster.actorCategoryManager.isPrimary(cat)) {
                        bonusBadge = `<span class="sm-school-badge">${T('SkillMaster.primarySchool')}</span>`;
                    } else if (SkillMaster.actorCategoryManager.isSecondary(cat)) {
                        bonusBadge = `<span class="sm-school-badge">${T('SkillMaster.secondarySchool')}</span>`;
                    } else if (SkillMaster.actorCategoryManager.isForeign(cat)) {
                        bonusBadge = `<span class="sm-school-badge sm-school-badge--foreign">${T('SkillMaster.foreignSchool')}</span>`;
                    }
                }
                html += `
                    <div class="category-card ${focused ? 'focused' : ''}" data-pane="${pane}" data-idx="${idx}" onclick="SceneManager._scene.selectCategoryClick(${pane}, ${idx})">
                        <div class="category-card-icon" style="${SkillMaster.getCategoryIconStyle(cat)}"></div>
                        <div class="category-card-name">${catName}</div>
                        ${bonusBadge}
                    </div>
                `;
            });
            return html;
        };

        const leftPageBox = document.getElementById('left-page-content');
        if (!leftPageBox) return;

        const leftMode = graphSpread ? 'atlas' : this._viewMode;
        const needsLeftRebuild = (this._lastLeftMode !== leftMode) ||
            (leftMode !== 'atlas' && this._viewMode !== 'category' &&
                this._lastLeftCategory !== this._selectedCategory);

        if (needsLeftRebuild) {
            let leftPageHTML = "";
            if (this._viewMode === 'category') {
                const split = SkillMaster.getSplitSkillCategories();
                const backBtnText = T('SkillMaster.back');
                const schoolsTitle = T('SkillMaster.schools');

                const craftSkillLabel = T('SkillMaster.craft.buttonSkill');
                const enchantWeaponLabel = T('SkillMaster.enchant.buttonWeapon');
                const enchantArmorLabel = T('SkillMaster.enchant.buttonArmor');
                const enchantBookLabel = T('SkillMaster.enchant.buttonBook');
                const writeSkillBookLabel = T('SkillMaster.write.buttonSkillBook');
                const writeGrimorieLabel = T('SkillMaster.write.buttonGrimorie');
                leftPageHTML = `
                    <div class="page-header-bar">
                      <div class="back-button focusable" onclick="SceneManager._scene.categoryBack()">${backBtnText}</div>
                      <h2 class="title">${schoolsTitle}</h2>
                      <div class="sm-bench-kp-pill"><strong>${knowledge} KP</strong></div>
                    </div>
                    <div id="category-scroll-box" class="ui-scroll sm-school-scroll">
                        <div class="ui-section sm-bench-subhead">
                            <span class="inspect-section-title">${T('SkillMaster.skills')}</span>
                        </div>
                        <div id="category-scroll-box-left" class="sm-school-grid sm-school-grid--flow">
                            ${renderCategoryCardsHTML(split.Skill, 0)}
                        </div>
                        <div class="ui-section sm-bench-subhead">
                            <span class="inspect-section-title">${T('SkillMaster.magic')}</span>
                        </div>
                        <div id="category-scroll-box-right" class="sm-school-grid sm-school-grid--flow">
                            ${renderCategoryCardsHTML(split.Magic, 1)}
                        </div>
                    </div>
                `;
                // The benches fill the right leaf, in the order the cursor
                // walks them down the column.
                this._railHTML = `
                    <div class="inspect-btn fuse-spells-btn focusable" onclick="SceneManager._scene.openSpellEditor()">${T('SkillMaster.fuseSpells')}</div>
                    <div class="inspect-btn craft-spell-btn focusable" onclick="SceneManager._scene.openCraftBench('spell')">${T('SkillMaster.craft.buttonSpell')}</div>
                    <div class="inspect-btn magic-systems-btn focusable" onclick="SceneManager._scene.openMagicSystems()">${T('SkillMaster.magicSystem.tabLabel')}</div>
                    <div class="inspect-btn craft-skill-btn focusable" onclick="SceneManager._scene.openCraftBench('skill')">${craftSkillLabel}</div>
                    <div class="inspect-btn enchant-weapon-btn focusable" onclick="SceneManager._scene.openEnchantBench('weapon')">${enchantWeaponLabel}</div>
                    <div class="inspect-btn enchant-armor-btn focusable" onclick="SceneManager._scene.openEnchantBench('armor')">${enchantArmorLabel}</div>
                    <div class="inspect-btn enchant-book-btn focusable" onclick="SceneManager._scene.openEnchantBench('book')">${enchantBookLabel}</div>
                    <div class="inspect-btn write-skillbook-btn focusable" onclick="SceneManager._scene.openWriteBench('skillbook')">${writeSkillBookLabel}</div>
                    <div class="inspect-btn write-grimorie-btn focusable" onclick="SceneManager._scene.openWriteBench('grimorie')">${writeGrimorieLabel}</div>
                    <div class="inspect-btn hexorcize-btn focusable" onclick="SceneManager._scene.openHexorcizeBench()">${T('SkillMaster.hexorcize.button')}</div>
                    <div class="inspect-btn lobotomagic-btn focusable" onclick="SceneManager._scene.openLobotomagicBench()">${T('SkillMaster.lobotomagic.button')}</div>
                    <div class="inspect-btn expression-btn focusable${window.Expression && window.Expression.anyInParty() ? '' : ' inspect-btn--disabled'}" onclick="SceneManager._scene.openExpressionPicker()">${T('SkillMaster.expression.button')}</div>
                `;
            } else {
                this._railHTML = '';
                const returnBtnText = T('SkillMaster.back');
                const onAtlas = this.usesGraphView();
                const bodyHTML = onAtlas ? this.renderSkillAtlasHTML() : this.renderSkillListHTML();
                const heading = onAtlas ? this.focusedCategory() : this._selectedCategory;
                leftPageHTML = `
                    <div class="page-header-bar">
                      <div class="back-button focusable" onclick="SceneManager._scene.goBack()">${returnBtnText}</div>
                      <h2 id="atlas-school-name" class="title">${onAtlas ? this.renderAtlasTitleHTML() : SkillMaster.getCategoryDisplayName(heading)}</h2>
                    </div>
                    ${bodyHTML}
                `;
            }

            leftPageBox.innerHTML = leftPageHTML;
            this._lastLeftMode = leftMode;
            this._lastLeftCategory = this._selectedCategory;
        }

        if (this._viewMode === 'category') {
            const applyFocus = (boxId, pane) => {
                const box = document.getElementById(boxId);
                if (!box) return;
                box.querySelectorAll('.category-card').forEach((card) => {
                    const idx = parseInt(card.dataset.idx, 10);
                    const focused = (this._categoryPane === pane && this._selectedCategoryIndex === idx);
                    card.classList.toggle('focused', focused);
                });
            };
            applyFocus('category-scroll-box-left', 0);
            applyFocus('category-scroll-box-right', 1);
        } else if (this.usesGraphView()) {
            this.syncAtlasSky();
            this.repaintAtlasFocus();
            if (needsLeftRebuild) this.centreAtlasOnFocus();
        } else {
            // One class, and the stylesheet draws the hairline. Nothing on
            // this page paints an ink of its own any more.
            const cards = leftPageBox.querySelectorAll('.sm-skill-row');
            cards.forEach((card, idx) => {
                card.classList.toggle('focused', idx === this._selectedSkillIndex);
            });
        }

        const rightPageBox = document.getElementById('right-page-content');
        if (!rightPageBox) return;

        const skill = this.focusedSkill();
        const skillId = skill ? skill.id : null;

        if (graphSpread) {
            if (this._viewMode === 'detail' && skill) {
                this.updateSkillDetailPopup(skill, knowledge);
            } else if (this._viewMode !== 'preview') {
                this.closeSkillDetailPopup();
            }
            this._lastRightMode = null;
            this._lastRightSkillId = null;
            this._lastRightKnowledge = null;
            return;
        }

        const needsRightRebuild = (this._lastRightMode !== this._viewMode) ||
            ((this._viewMode === 'detail' || this._viewMode === 'list') && this._lastRightSkillId !== skillId) ||
            (this._viewMode === 'detail' && this._lastRightActionIndex !== this._selectedActionIndex) ||
            (this._lastRightKnowledge !== knowledge);

        if (needsRightRebuild) {
            let rightPageHTML = "";

            if (this._viewMode === 'category' && this._expressionPicking) {
                rightPageHTML = this.renderExpressionPickerHTML();
            } else if (this._viewMode === 'category') {
                const pupilLine = `<div class="sm-pupil-line">${T('SkillMaster.atlas.held', { knowledge: knowledge })}</div>`;
                rightPageHTML = `
                    <div class="page-header-bar">
                      <h2 class="title">${T('SkillMaster.benches')}</h2>
                    </div>
                    <div class="ui-prose sm-bench-blurb">${T('SkillMaster.benchesBlurb')}</div>
                    <div id="sm-action-rail" class="sm-action-rail ui-scroll">
                        ${this._railHTML || ''}
                    </div>
                    ${pupilLine}
                `;
            } else if (this._viewMode === 'list' || this._viewMode === 'detail') {
                if (!skill) {
                    const selectPrompt = T('SkillMaster.selectASkill');
                    rightPageHTML = `
                        <div class="ui-empty sm-empty">
                            <div class="sm-empty-icon" style="${SkillMaster.getCategoryIconStyle('All')}"></div>
                            <div class="ui-empty-text">${selectPrompt}</div>
                        </div>
                    `;
                } else {
                    rightPageHTML = this.renderSkillDetailHTML(skill, knowledge, { popup: false });
                }
            }

            rightPageBox.innerHTML = rightPageHTML;
            if (skill && (this._viewMode === 'list' || this._viewMode === 'detail')) this.paintSkillDetailIcon(skill);
            this._lastRightMode = this._viewMode;
            this._lastRightSkillId = skillId;
            this._lastRightActionIndex = this._selectedActionIndex;
            this._lastRightKnowledge = knowledge;
        }
        if (this._viewMode === 'category') this.paintBenchFocus();
        if (this._viewMode === 'category' && this._expressionPicking) this.paintExpressionFocus();
    };

    // The bench column on the right leaf is one ring the cursor walks down.
    Scene_SkillEncyclopedia.prototype.paintBenchFocus = function () {
        CATEGORY_ACTION_BTNS.forEach((sel, i) => {
            const el = document.querySelector(sel);
            if (!el) return;
            const on = !!this._categoryFuseFocused && (this._categoryActionIndex || 0) === i;
            el.classList.toggle('focused', on);
            el.classList.toggle('selected', on);
            if (on && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
        });
    };

    Scene_SkillEncyclopedia.prototype.switchTeachActor = function (index) {
        const members = getSwitchableMembers();
        const actor = members[index];
        if (!actor || actor.actorId() === this._teachActorId) return;
        this._teachActorId = actor.actorId();
        SkillMaster.actorCategoryManager.setActor(this._teachActorId);
        SoundManager.playCursor();

        this._splitCategoriesCache = null;
        this._skillsByCategoryKey = null;
        this._categoryPane = 0;
        this._selectedCategoryIndex = 0;
        this._categoryFuseFocused = false;
        this._selectedSkillIndex = 0;
        // A cut armed on one character is never carried over to the next:
        // the Lobotomagic bench follows the switcher, and its second press
        // would otherwise cut the new character's row unasked.
        this._loboArmed = -1;
        this._loboIndex = 0;

        const allowed = SkillMaster.actorCategoryManager.allowedCategories();
        const stillOpen = !this._selectedCategory || this._selectedCategory === 'All' || !allowed || allowed.includes(this._selectedCategory); // i18n-ignore: skill category id / type discriminator
        this._atlasZoom = 0;
        this._atlasMemory = {};
        if (this._atlasCategory && allowed && !allowed.includes(this._atlasCategory)) {
            this._atlasCategory = null;
        }
        if (!stillOpen && (this._viewMode === 'list' || this._viewMode === 'detail')) {
            this._viewMode = 'category';
            this._selectedCategory = null;
        } else if (this.usesGraphView()) {
            this.defaultGraphFocus();
        }

        this._lastLeftMode = null;
        this._lastLeftCategory = null;
        this._lastRightMode = null;
        this._lastRightSkillId = null;
        this._lastRightKnowledge = null;
        this.refreshUISkillDOM();
    };

    Scene_SkillEncyclopedia.prototype.cycleTeachActor = function (dir) {
        const members = getSwitchableMembers();
        if (members.length <= 1) return;
        const cur = members.findIndex(m => m.actorId() === this._teachActorId);
        const next = ((cur < 0 ? 0 : cur) + dir + members.length) % members.length;
        this.switchTeachActor(next);
    };

    Scene_SkillEncyclopedia.prototype.selectCategory = function () {
        const split = SkillMaster.getSplitSkillCategories();
        const list = this._categoryPane === 1 ? split.Magic : split.Skill;
        const cat = list[this._selectedCategoryIndex];
        if (!cat) { SoundManager.playBuzzer(); return; }
        this._selectedCategory = cat;
        this._skillListWindow.setCategory(this._selectedCategory);
        this._viewMode = 'list';
        this._expressionPicking = false;
        this._selectedSkillIndex = 0;

        const schools = this.atlasCategories();
        this._atlasCategory = schools.includes(cat) ? cat : (schools[0] || null);
        this._atlasZoom = 0;
        this._focusSkillId = 0;
        if (this.usesGraphView()) this.defaultGraphFocus();
        SoundManager.playOk();
        this.refreshUISkillDOM();
        this.centreAtlasOnFocus();
    };

    Scene_SkillEncyclopedia.prototype.selectCategoryClick = function (pane, index) {
        this._categoryPane = pane;
        this._selectedCategoryIndex = index;
        this._categoryFuseFocused = false;
        this.selectCategory();
    };

    Scene_SkillEncyclopedia.prototype.categoryBack = function () {
        this.popScene();
    };

    Scene_SkillEncyclopedia.prototype.selectSkill = function (index) {
        this._selectedSkillIndex = index;
        const skills = SkillMaster.getSkillsByCategory(this._selectedCategory);
        const skill = skills[this._selectedSkillIndex];
        if (skill) {
            this._focusSkillId = skill.id;
            this._skillDetailWindow.setSkill(skill);
            this._viewMode = 'detail';
            this._selectedActionIndex = 0;
            SoundManager.playOk();
            this.refreshUISkillDOM();
        }
    };

    Scene_SkillEncyclopedia.prototype.carryToggleHTML = function (actor, skill, allowFocus) {
        const LO = window.BattleLoadout;
        if (!LO) return '';
        const locked = LO.isAlwaysCarried(actor, skill);
        const active = LO.isActive(actor, skill);
        const full = !active && !locked && !LO.hasRoom(actor);
        const label = locked ? (T('SkillMaster.carry.locked'))
            : active ? (T('SkillMaster.carry.drop'))
                : full ? (T('SkillMaster.carry.full')) : (T('SkillMaster.carry.take'));
        const count = `${LO.count(actor)} / ${LO.MAX}`;
        const focused = allowFocus && (this._selectedActionIndex === 0) && !locked;
        const usable = !locked && (active || !full);
        return `
            <div class="inspect-btn sm-wide-btn focusable ${focused ? 'selected' : ''} ${usable ? '' : 'unusable'}" onclick="SceneManager._scene.toggleCarry(${actor.actorId()})">
                <span class="sm-btn-label">${active ? '◉' : '○'} ${label}</span>
                <span class="sm-btn-cost">${count}</span>
            </div>
        `;
    };

    Scene_SkillEncyclopedia.prototype.toggleCarry = function (actorId) {
        const actor = $gameActors.actor(actorId);
        const skill = this.focusedSkill();
        if (!actor || !skill || !window.BattleLoadout) return;
        const result = window.BattleLoadout.toggle(actor, skill);
        if (result === 'on') SoundManager.playOk();
        else if (result === 'off') SoundManager.playCancel();
        else { SoundManager.playBuzzer(); return; }
        this.refreshUISkillDOM();
    };

    Scene_SkillEncyclopedia.prototype.fusionActionsHTML = function (actor, skill) {
        if (!skill || !skill._customSpell || skill._ownerActorId !== actor.actorId()) return '';
        const btn = (label, handler, danger) => `
            <div class="inspect-btn focusable ${danger ? 'inspect-btn--danger' : ''}" onclick="${handler}">
                ${label}
            </div>
        `;
        const renameLabel = T('SkillMaster.rename');
        const dissolveLabel = T('SkillMaster.dissolve');
        return `
            <div class="inspect-actions ui-panel-actions sm-fusion-actions">
                ${btn(renameLabel, `SceneManager._scene.renameFusedSpell(${skill.id})`, false)}
                ${btn(dissolveLabel, `SceneManager._scene.dissolveFusedSpell(${skill.id})`, true)}
            </div>
        `;
    };

    Scene_SkillEncyclopedia.prototype.renameFusedSpell = function (skillId) {
        const spell = $dataSkills[skillId];
        if (!spell || !spell._customSpell) return;
        const current = spell.name || '';
        const promptText = T('SkillMaster.renamePrompt');
        const next = (window.prompt && window.prompt(promptText, current)) || '';
        // The name is printed straight into every page that lists the spell,
        // so markup characters are not part of a spell name.
        const clean = next.replace(/[<>]/g, '').trim();
        if (!clean || clean === current) return;
        spell.name = clean;
        SoundManager.playOk();
        this.refreshUISkillDOM();
    };

    Scene_SkillEncyclopedia.prototype.dissolveFusedSpell = function (skillId) {
        const actor = this.getTeachActor();
        const spell = $dataSkills[skillId];
        if (!actor || !spell || !spell._customSpell) return;
        const confirmText = T('SkillMaster.dissolveConfirm', { name: spell.name });
        if (window.confirm && !window.confirm(confirmText)) return;
        const refund = Math.floor(SkillMaster.kpTeachCost(spell) * 0.5);
        $gameSystem.addKnowledge(refund);
        actor.forgetSkill(skillId);
        $gameSystem.removeCustomSpell(skillId);
        this.invalidateLearnedSkillCaches();
        SoundManager.playRecovery();
        this.refreshUISkillDOM();
    };

    Scene_SkillEncyclopedia.prototype.teachSkill = function (actorId, cost) {
        const actor = $gameActors.actor(actorId);
        const skill = this.focusedSkill();
        const isWorkshop = SkillMaster.isWorkshopMode && SkillMaster.isWorkshopMode();

        if (!actor || !skill || (!isWorkshop && $gameSystem.getKnowledge() < cost)) {
            SoundManager.playBuzzer();
            return;
        }
        // Nobody pays twice for what they already know.
        if (actor.isLearnedSkill(skill.id)) {
            SoundManager.playBuzzer();
            return;
        }

        const graph = window.SkillGraph;
        if (!isWorkshop && graph && !graph.isOpen(actor, skill.id)) {
            SoundManager.playBuzzer();
            const arcana = window.SkillArcana;
            const why = arcana ? arcana.treeBlockReason(actor, skill.id) : null;
            const toast = why === 'cultist'
                ? (T('SkillMaster.graph.lockedCultist'))
                : why === 'level'
                ? (arcana.isForbidden(skill.id)
                    ? T('SkillMaster.graph.lockedForbiddenLevel', { level: arcana.requiredLevel(skill.id) })
                    : T('SkillMaster.graph.lockedEsotericLevel', { level: arcana.requiredLevel(skill.id) }))
                : (T('SkillMaster.graph.lockedToast', { skill: skill.name }));
            this._skillDetailWindow.showMessage(toast);
            this.refreshUISkillDOM();
            return;
        }

        if (!isWorkshop) $gameSystem.spendKnowledge(cost);
        actor.learnSkill(skill.id);
        this.invalidateLearnedSkillCaches();
        SoundManager.playRecovery();

        const learnedToast = T('SkillMaster.actorLearned', { actor: actor.name(), skill: skill.name });
        this._skillDetailWindow.showMessage(learnedToast);
        this.refreshUISkillDOM();
    };

    Scene_SkillEncyclopedia.prototype.goBack = function () {
        this._viewMode = 'category';
        SoundManager.playCancel();
        this.refreshUISkillDOM();
    };

    Scene_SkillEncyclopedia.prototype.invalidateLearnedSkillCaches = function () {
        this._editorCandidatesKey = null;
        if (window.SkillGraph) window.SkillGraph.invalidate();
        if (SkillMaster.SkillAtlas) SkillMaster.SkillAtlas.invalidate();
        this._splitCategoriesCache = null;
    };

    Scene_SkillEncyclopedia.prototype.getSplitCategoriesCached = function () {
        if (!this._splitCategoriesCache || this._splitCategoriesActorId !== this._teachActorId) {
            SkillMaster.actorCategoryManager.setActor(this._teachActorId);
            this._splitCategoriesActorId = this._teachActorId;
            this._splitCategoriesCache = SkillMaster.getSplitSkillCategories();
        }
        return this._splitCategoriesCache;
    };

    Scene_SkillEncyclopedia.prototype.getSkillsByCategoryCached = function (category) {
        const key = `${this._teachActorId}:${category}`;
        if (this._skillsByCategoryKey !== key) {
            SkillMaster.actorCategoryManager.setActor(this._teachActorId);
            this._skillsByCategoryKey = key;
            this._skillsByCategoryCache = SkillMaster.getSkillsByCategory(category);
        }
        return this._skillsByCategoryCache;
    };

    Scene_SkillEncyclopedia.prototype.scrollToActiveItem = function (containerId, selector) {
        const container = document.getElementById(containerId);
        const active = document.querySelector(selector);
        if (container && active) {
            const containerRect = container.getBoundingClientRect();
            const activeRect = active.getBoundingClientRect();
            if (activeRect.bottom > containerRect.bottom) {
                container.scrollTop += (activeRect.bottom - containerRect.bottom) + 10;
            } else if (activeRect.top < containerRect.top) {
                container.scrollTop -= (containerRect.top - activeRect.top) + 10;
            }
        }
    };

    Scene_SkillEncyclopedia.prototype.onNavLeave = function () {
        this.refreshUISkillDOM();
    };

    Scene_SkillEncyclopedia.prototype._ccEnterNav = function (dir) {
        return !!window.CCNav && window.CCNav.tryEnterFromBoard(dir);
    };

    Scene_SkillEncyclopedia.prototype.ccScrollTarget = function () {
        return document.getElementById('skills-scroll-box') ||
            document.getElementById('category-scroll-box') ||
            (this._dndContainer && this._dndContainer.querySelector('.ui-scroll, .skill-scroll-box'));
    };

    Scene_SkillEncyclopedia.prototype.update = function () {
        Scene_MenuBase.prototype.update.call(this);

        // A field has focus somewhere on the sheet: every letter belongs to it
        // and nothing else on the page may read the keyboard. The key guard
        // stops every key before Input sees it, so a cancel that still gets
        // through is the pad's B: a sheet opened at the keyboard and then
        // walked away from with a pad in hand is left, not a trap.
        if (this._craftTyping) {
            if (Input.isTriggered('cancel')) this.closeCraftTextSheet();
            return;
        }
        // Same again for the letter sheet a pad types on: it answers every
        // press itself until it is spent.
        if (window.Controller && Controller.textEntryOpen && Controller.textEntryOpen()) return;
        // A pick sheet (the Workbench's tag catalogue) is modal: it is read
        // before the focus ring, so the press that walks its list never also
        // moves the page behind it.
        if (window.CCPick && window.CCPick.isOpen && window.CCPick.isOpen()) { window.CCPick.pollInput(); return; }

        if (window.CCNav && window.CCNav.update()) return;
        if (window.CCScroll) window.CCScroll.update(this._dndContainer);


        if (this._viewMode === 'category') {
            const split = this.getSplitCategoriesCached();
            const lists = [split.Skill, split.Magic];
            const cols = CATEGORY_PAGE_COLS;
            let pane = this._categoryPane;
            let idx = this._selectedCategoryIndex;
            const prevPane = pane, prevIdx = idx;
            const curLen = lists[pane].length;

            if (this._expressionPicking) {
                this.updateExpressionPickerInput();
                return;
            }

            if (this._categoryFuseFocused) {
                const act = this._categoryActionIndex || 0;
                if (Input.isTriggered('ok')) {
                    (CATEGORY_ACTION_FNS[act] || CATEGORY_ACTION_FNS[0])(this);
                    return;
                }
                if (Input.isTriggered('cancel') || Input.isTriggered('escape') || TouchInput.isCancelled()) {
                    this.categoryBack();
                    return;
                }
                // The rail is a column now: down and up walk it, left steps
                // back onto the schools.
                if (Input.isTriggered('down') || Input.isRepeated('down')) {
                    this._categoryActionIndex = (act + 1) % CATEGORY_ACTION_BTNS.length;
                    SoundManager.playCursor();
                    this.refreshUISkillDOM();
                    return;
                }
                if (Input.isTriggered('up') || Input.isRepeated('up')) {
                    if (act > 0) {
                        this._categoryActionIndex = act - 1;
                        SoundManager.playCursor();
                        this.refreshUISkillDOM();
                        return;
                    }
                }
                if (Input.isTriggered('left') || Input.isRepeated('left') ||
                    Input.isTriggered('up') || Input.isRepeated('up')) {
                    this._categoryFuseFocused = false;
                    this._categoryActionIndex = 0;
                    SoundManager.playCursor();
                    this.refreshUISkillDOM();
                }
                return;
            }

            if (Input.isTriggered('ok')) {
                this.selectCategory();
                return;
            } else if (Input.isTriggered('cancel') || Input.isTriggered('escape') || TouchInput.isCancelled()) {
                this.categoryBack();
                return;
            } else if (Input.isTriggered('right') || Input.isRepeated('right')) {
                // Both grids sit on the left leaf, SKILLS over MAGIC; the end
                // of a row steps across the crease onto the bench column.
                const col = idx % cols;
                if (col === cols - 1 || idx + 1 >= curLen) {
                    this._categoryFuseFocused = true;
                    this._categoryActionIndex = 0;
                    SoundManager.playCursor();
                    this.refreshUISkillDOM();
                    return;
                }
                idx += 1;
            } else if (Input.isTriggered('left') || Input.isRepeated('left')) {
                if (idx % cols > 0) idx -= 1;
            } else if (Input.isTriggered('down') || Input.isRepeated('down')) {
                if (idx + cols < curLen) {
                    idx += cols;
                } else if (pane === 0 && lists[1].length > 0) {
                    pane = 1;
                    idx = Math.min(idx % cols, lists[1].length - 1);
                } else {
                    idx = curLen - 1;
                }
            } else if (Input.isTriggered('up') || Input.isRepeated('up')) {
                if (idx - cols >= 0) {
                    idx -= cols;
                } else if (pane === 1 && lists[0].length > 0) {
                    const len0 = lists[0].length;
                    const lastRow = Math.floor((len0 - 1) / cols) * cols;
                    pane = 0;
                    idx = Math.min(lastRow + (idx % cols), len0 - 1);
                } else if (this._ccEnterNav('up')) {
                    return;
                }
            }

            if (pane !== prevPane || idx !== prevIdx) {
                this._categoryPane = pane;
                this._selectedCategoryIndex = idx;
                SoundManager.playCursor();
                this.refreshUISkillDOM();
                this.scrollToActiveItem('category-scroll-box', '#category-scroll-box .category-card.focused'); // i18n-ignore: CSS selector
            }
        } else if (this._viewMode === 'list') {
            if (this.usesGraphView()) {
                if (Input.isTriggered('ok')) {
                    this.openFocusedSkill();
                    return;
                }
                if (Input.isTriggered('cancel') || Input.isTriggered('escape') || TouchInput.isCancelled()) {
                    this._viewMode = 'category';
                    SoundManager.playCancel();
                    this.refreshUISkillDOM();
                    return;
                }
                let moved = false;
                if (Input.isTriggered('right') || Input.isRepeated('right')) {
                    moved = this.moveGraphFocus(1, 0);
                    if (!moved && this.pageAtlasSchool(1)) return;
                } else if (Input.isTriggered('left') || Input.isRepeated('left')) {
                    moved = this.moveGraphFocus(-1, 0);
                    if (!moved && this.pageAtlasSchool(-1)) return;
                } else if (Input.isTriggered('down') || Input.isRepeated('down')) {
                    moved = this.moveGraphFocus(0, 1);
                    if (!moved && this._ccEnterNav('down')) return;
                } else if (Input.isTriggered('up') || Input.isRepeated('up')) {
                    moved = this.moveGraphFocus(0, -1);
                    if (!moved && this._ccEnterNav('up')) return;
                }
                if (moved) {
                    SoundManager.playCursor();
                    this.refreshUISkillDOM();
                    this.scrollGraphToFocus();
                }
                return;
            }

            const skills = this.getSkillsByCategoryCached(this._selectedCategory);
            const max = skills.length;
            if (max === 0) {
                if (Input.isTriggered('cancel') || Input.isTriggered('escape') || TouchInput.isCancelled()) {
                    this._viewMode = 'category';
                    SoundManager.playCancel();
                    this.refreshUISkillDOM();
                }
                return;
            }
            const cols = SKILL_GRID_COLS;
            const prev = this._selectedSkillIndex;
            if (Input.isTriggered('ok')) {
                this.selectSkill(this._selectedSkillIndex);
                return;
            } else if (Input.isTriggered('cancel') || Input.isTriggered('escape') || TouchInput.isCancelled()) {
                this._viewMode = 'category';
                SoundManager.playCancel();
                this.refreshUISkillDOM();
                return;
            } else if (Input.isTriggered('right') || Input.isRepeated('right')) {
                this._selectedSkillIndex = (this._selectedSkillIndex + 1) % max;
            } else if (Input.isTriggered('left') || Input.isRepeated('left')) {
                this._selectedSkillIndex = (this._selectedSkillIndex - 1 + max) % max;
            } else if (Input.isTriggered('down') || Input.isRepeated('down')) {
                if (this._selectedSkillIndex + cols < max) {
                    this._selectedSkillIndex += cols;
                } else if (this._selectedSkillIndex === max - 1 && this._ccEnterNav('down')) {
                    return;
                } else {
                    this._selectedSkillIndex = max - 1;
                }
            } else if (Input.isTriggered('up') || Input.isRepeated('up')) {
                if (this._selectedSkillIndex - cols >= 0) {
                    this._selectedSkillIndex -= cols;
                } else if (this._ccEnterNav('up')) {
                    return;
                }
            }

            if (this._selectedSkillIndex !== prev) {
                SoundManager.playCursor();
                this.refreshUISkillDOM();
                this.scrollToActiveItem('skills-scroll-box', '.sm-skill-row.focused');
            }
        } else if (this._viewMode === 'preview') {
            this.updateSpellPreviewInput();
        } else if (this._viewMode === 'detail') {
            const skill = this.focusedSkill();
            const maxActions = 2;

            if (Input.isTriggered('down') || Input.isRepeated('down') || Input.isTriggered('right') || Input.isRepeated('right')) {
                if (this._selectedActionIndex === maxActions - 1 && this._ccEnterNav('down')) return;
                this._selectedActionIndex = (this._selectedActionIndex + 1) % maxActions;
                SoundManager.playCursor();
                this.refreshUISkillDOM();
            } else if (Input.isTriggered('up') || Input.isRepeated('up') || Input.isTriggered('left') || Input.isRepeated('left')) {
                this._selectedActionIndex = (this._selectedActionIndex - 1 + maxActions) % maxActions;
                SoundManager.playCursor();
                this.refreshUISkillDOM();
            } else if (Input.isTriggered('ok')) {
                if (!skill) {
                    SoundManager.playBuzzer();
                } else if (this._selectedActionIndex === 0) {
                    const actor = this.getTeachActor();
                    if (!actor) {
                        SoundManager.playBuzzer();
                    } else if (actor.isLearnedSkill(skill.id)) {
                        // A known skill's first action is the carry toggle,
                        // not a lesson: the pad reaches it the way a click does.
                        this.toggleCarry(actor.actorId());
                    } else {
                        const cost = $gameSystem.getSkillKnowledgeCost(skill.id, actor.actorId());
                        this.teachSkill(actor.actorId(), cost);
                    }
                } else {
                    this.openSpellPreview(skill.id);
                }
            } else if (Input.isTriggered('cancel') || Input.isTriggered('escape') || TouchInput.isCancelled()) {
                this._viewMode = 'list';
                SoundManager.playCancel();
                this.refreshUISkillDOM();
            }
        } else if (this._viewMode === 'spellEditor') {
            this.updateSpellEditorInput();
        } else if (this._viewMode === 'craft') {
            this.updateCraftBenchInput();
        } else if (this._viewMode === 'enchant') {
            this.updateEnchantBenchInput();
        } else if (this._viewMode === 'writebook') {
            this.updateWriteBenchInput();
        } else if (this._viewMode === 'hexorcize') {
            this.updateHexorcizeBenchInput();
        } else if (this._viewMode === 'lobotomagic') {
            this.updateLobotomagicBenchInput();
        } else if (this._viewMode === 'expression') {
            this.updateExpressionBenchInput();
        } else if (this._viewMode === 'magicSystems') {
            if (Input.isTriggered('cancel') || Input.isTriggered('escape') || TouchInput.isCancelled()) {
                this.closeMagicSystems();
                return;
            }
            for (const dir of ['down', 'right', 'up', 'left']) {
                if (Input.isTriggered(dir) || Input.isRepeated(dir)) {
                    this._ccEnterNav(dir);
                    break;
                }
            }
        }

        if (window.CCNav) window.CCNav.paint();
    };

    window.Scene_SkillEncyclopedia = Scene_SkillEncyclopedia;
    SkillMaster.Scene_SkillEncyclopedia = Scene_SkillEncyclopedia;

})();



//=============================================================================
// Module: SkillMasterChaos.js
//=============================================================================
/*:
 * @target MZ
 * @plugindesc v1.0.0 SkillMaster - the world of chaos teaches a random skill on every level up
 * @author Omni-Lex
 *
 * @help
 * In a chaos world (WorldManager's second alternate timeline) nobody studies:
 * every level up simply hands the character one more skill, drawn at random
 * from everything the game knows and everything they do not.
 *
 * Two floors stand in the way of the deep end of the book, and they are the
 * only rules the draw obeys:
 *
 *   esoteric   never before level 50
 *   forbidden  never before level 80
 *
 * A skill's rank is read off window.SkillArcana, which is the one authority on
 * what is esoteric and what is forbidden; the floors here are the chaos
 * world's own and are deliberately higher than the ordinary ones.
 */

(function () {
    "use strict";

    const CHAOS_ESOTERIC_LEVEL = 50;
    const CHAOS_FORBIDDEN_LEVEL = 80;

    function chaosActive() {
        return !!(window.ChaosWorld && window.ChaosWorld.active());
    }

    // Every skill a character can be handed. Attack and Guard (skill type 0)
    // are not skills anybody learns, and a skill without a name is a database
    // hole rather than an entry.
    let chaosSkillPool = null;
    function chaosSkillIds() {
        if (chaosSkillPool) return chaosSkillPool;
        chaosSkillPool = [];
        for (let i = 1; i < $dataSkills.length; i++) {
            const skill = $dataSkills[i];
            if (!skill || !skill.name || !skill.stypeId) continue;
            chaosSkillPool.push(i);
        }
        return chaosSkillPool;
    }

    // Is this character deep enough into the book for this skill? The rank is
    // SkillArcana's answer; the floors are the chaos world's.
    function chaosAllowsSkill(actor, skillId) {
        const arcana = window.SkillArcana;
        if (!arcana || !arcana.rank) return true;
        const rank = arcana.rank(skillId);
        // A world made without a floor drops the chaos one as well.
        const keeps = (r) => !arcana.restricts || arcana.restricts(r);
        if (rank === "forbidden" && keeps("forbidden")) return actor.level >= CHAOS_FORBIDDEN_LEVEL;
        if (rank && keeps("esoteric")) return actor.level >= CHAOS_ESOTERIC_LEVEL;
        return true;
    }

    function chaosLearnOnLevelUp(actor) {
        if (!chaosActive() || !actor || typeof $dataSkills === "undefined") return;
        const candidates = chaosSkillIds().filter(id =>
            !actor.isLearnedSkill(id) && chaosAllowsSkill(actor, id));
        if (!candidates.length) return;
        // Rolled off the world, the character and the level reached, so the
        // same character reaching the same level in the same world always
        // picks up the same thing.
        const CW = window.ChaosWorld;
        const key = "levelup:" + actor.actorId() + ":" + actor.level;
        const skillId = candidates[Math.floor(CW.roll(key) * candidates.length) % candidates.length];
        actor.learnSkill(skillId);
        if (typeof window.T === "function") {
            if (window.ParchmentToast) {
              window.ParchmentToast.show(window.T("SkillMaster.chaosLevelSkill", {
                actor: actor.name(), skill: $dataSkills[skillId].name,
                            }), {
                severity: 'good'
              });
            }
        }
    }

    const _SkillMasterChaos_levelUp = Game_Actor.prototype.levelUp;
    Game_Actor.prototype.levelUp = function () {
        _SkillMasterChaos_levelUp.call(this);
        chaosLearnOnLevelUp(this);
    };
})();


//=============================================================================
// Module: SkillMasterCraft.js
//=============================================================================
/*:
 * @target MZ
 * @plugindesc v2.0.0 SkillMaster - the Workbench: a spell or a skill written from tags.
 * @author Omni-Lex
 *
 * @help
 * The Fusion forge welds together two things somebody else wrote. The
 * Workbench is the other half of the bench: nothing is melted down, and what
 * comes off it is a skill entry assembled from TAGS.
 *
 * A tag is one mechanic: an element, a damage kind, a shape, a rider state,
 * a refinement, a payoff written into the damage formula, a note tag the
 * battle system reads (<SelfState:>, <DrainRate:>, <ConsumeSelfState:>,
 * <Stack:>, <TargetPart:>, <AmmoCost:> and the rest). Every tag is the same
 * vocabulary the shipped skills are written in, so a crafted entry behaves in
 * battle exactly as a database skill does, in Scene_Battle and in
 * MapBattleMode alike, and its abilities read out in the skill card's Special
 * section with no help from this file.
 *
 * Pricing is read off the SHIPPED book: the entry's damage formula is struck
 * at the reference caster test/test_skill_power_budget.js uses, and the MP or
 * AP it costs is the price the shipped skills of that power are sold at (the
 * same log-log curve, fitted from $dataSkills at runtime). Riders and
 * mechanics that add no damage are worth a share of power on top, with
 * diminishing returns, so a crafted entry always sits inside the x0.5..x2 band
 * the shipped book is held to. The <StatReq:> floor is the floor the shipped
 * book gives that price. Knowledge (KP) is paid once, at the writing.
 *
 * The name, the description, the lore, the icon and the animation are the
 * writer's own; an unwritten description is generated from the tags.
 *
 * ---------------------------------------------------------------------------
 * window.SkillTags: the one tag registry, shared by every bench that writes a
 * mechanic onto something (the Workbench, the Fusion forge, and the Enchant
 * bench and the ThinkerMenu forge for weapons and armour).
 *
 *   TARGETS                    ['spell', 'skill', 'weapon', 'armor']
 *   GROUPS                     [{ key, min, max, label }] in build order
 *   list(filter)               tag defs; filter { target, group, search }
 *   get(key)                   one tag def, or null
 *   name(key) / info(key)      localized name / one line description
 *   allowed(tags, key, target) { ok, reason, params } may `key` join `tags`?
 *                              reason keys live under SkillMaster.craft.why.*
 *   validate(tags, target)     { ok, reason, key, params } for a whole build
 *   normalize(tags, target)    { tags, dropped } the build with every tag
 *                              that no longer fits taken off, in group order
 *   apply(entry, tags, target) writes the tags onto `entry`. For 'spell' and
 *                              'skill' the entry's skill fields are rebuilt
 *                              (id, name, icon, animation kept). For
 *                              'weapon' / 'armor' traits and note tags are
 *                              ADDED to the item (element -> trait 31 or
 *                              11, on-hit states -> trait 32, resisted
 *                              states -> trait 14, stance -> <DamageType:>,
 *                              speed / extra hits / crit / hit -> traits 33,
 *                              34, 22). A tag with no equipment form does
 *                              nothing there; list({ target }) only offers
 *                              the ones that have one.
 *   buildSkill(tags, opts)     a whole $dataSkills-shaped entry; opts
 *                              { target, id, name, description, lore,
 *                              iconIndex, animationId, actorId, category }
 *   quote(tags, target)        { price, complexity, mpCost, tpCost, statKey,
 *                              paramId, statReq, power, owed, ratio, curve,
 *                              overload (AP over 100), beyond (stronger than
 *                              the book's top floor) } (equipment: price +
 *                              complexity)
 *   describe(tags, target)     the generated description, in the current
 *                              language (SkillMaster.craft.auto.*)
 *   decompile(entry)           { target, tags, lost, complete } any skill,
 *                              shipped or crafted, read back into tags
 *   curves()                   the shipped price curves in use
 * ---------------------------------------------------------------------------
 *
 * The bench also rewrites the description and the lore of ordinary skills the
 * character already knows. Those overrides live on $gameSystem and are laid
 * back over $dataSkills every time a save is loaded.
 */

(() => {
    'use strict';

    window.SkillMaster = window.SkillMaster || {};

    const CRAFT_SPELL_CATEGORY = 'Crafted'; // i18n-ignore: skill category id / type discriminator
    const CRAFT_SKILL_CATEGORY = 'Devised'; // i18n-ignore: skill category id / type discriminator
    SkillMaster.CRAFT_SPELL_CATEGORY = CRAFT_SPELL_CATEGORY;
    SkillMaster.CRAFT_SKILL_CATEGORY = CRAFT_SKILL_CATEGORY;

    // How many entries one character may keep on the bench at a time.
    const CRAFT_MAX_PER_ACTOR = 12;

    // The six base parameters a build can scale on: param id, the formula term
    // it swings with and the defence it is measured against.
    const CRAFT_STATS = {
        STR: { paramId: 2, atk: 'a.atk', def: 'b.def' },
        CON: { paramId: 3, atk: 'a.def', def: 'b.def' },
        INT: { paramId: 4, atk: 'a.mat', def: 'b.mdf' },
        WIS: { paramId: 5, atk: 'a.mdf', def: 'b.mdf' },
        DEX: { paramId: 6, atk: 'a.agi', def: 'b.def' },
        PSI: { paramId: 7, atk: 'a.luk', def: 'b.mdf' }
    };
    const STAT_OF_TERM = { atk: 'STR', def: 'CON', mat: 'INT', mdf: 'WIS', agi: 'DEX', luk: 'PSI' };

    const tr = (key, params) => (typeof T === 'function' ? T('SkillMaster.craft.' + key, params) : key);

    //=========================================================================
    // The tag registry
    //
    // Every mechanic is one row. `kp` is what it costs to buy, `cx` the
    // complexity it adds, `fits` the benches it belongs on, `worth` the share
    // of power it is priced at when it adds no damage of its own, `slot` a
    // family only one member of which may be on a build, `needs` / `excludes`
    // the rules that keep an incoherent build impossible.
    //=========================================================================

    const GROUPS = [
        { key: 'core', min: 1, max: 1 },
        { key: 'element', min: 0, max: 1 },
        { key: 'power', min: 0, max: 1 },
        { key: 'shape', min: 1, max: 1 },
        { key: 'rider', min: 0, max: 4 },
        { key: 'refine', min: 0, max: 5 },
        { key: 'payoff', min: 0, max: 2 },
        { key: 'mechanic', min: 0, max: 3 }
    ];
    const GROUP_ORDER = GROUPS.map(g => g.key);
    const EQUIP_MAX = { element: 1, rider: 3, refine: 3, mechanic: 2 };
    const TARGETS = ['spell', 'skill', 'weapon', 'armor'];
    const SKILL_TARGETS = ['spell', 'skill'];

    const SPELL = ['spell'], SKILL = ['skill'], BOTH = ['spell', 'skill'];
    const fx = (code, dataId, value1, value2) => ({ code, dataId, value1, value2: value2 || 0 });
    const trait = (code, dataId, value) => ({ code, dataId, value });

    const TAGS = [];
    const BY_KEY = {};
    const add = (def) => {
        if (!def.fits) def.fits = BOTH;
        if (def.worth === undefined) def.worth = 0;
        TAGS.push(def);
        BY_KEY[def.key] = def;
        return def;
    };

    // --- cores: what the entry is (its damage kind, power, defence pierced,
    // hit type and the stat it scales on and asks for) ----------------------
    const core = (key, fits, kp, cx, dmg, power, pierce, hit, stat, el) =>
        add({ key, group: 'core', fits, kp, cx, dmg, power, pierce, hit, stat, el: el || 0 });
    core('bolt',       SPELL, 140, 1.0, 1, 2.4, 1.0, 2, 'INT');
    core('mend',       SPELL, 160, 1.1, 3, 2.6, 0.0, 0, 'WIS');
    core('etherFlow',  SPELL, 190, 1.3, 4, 0.9, 0.0, 0, 'WIS');
    core('siphon',     SPELL, 260, 1.9, 5, 1.8, 0.8, 2, 'WIS', 9);
    core('mindBurn',   SPELL, 210, 1.4, 2, 1.2, 0.5, 2, 'PSI');
    core('ward',       SPELL, 90,  0.5, 0, 0.0, 0.0, 0, 'WIS');
    core('strike',     SKILL, 120, 0.9, 1, 3.0, 1.0, 1, 'STR', 1);
    core('cleave',     SKILL, 150, 1.1, 1, 3.4, 1.2, 1, 'STR', 1);
    core('thrust',     SKILL, 165, 1.2, 1, 2.8, 0.5, 1, 'DEX', 1);
    core('brawl',      SKILL, 130, 1.0, 1, 3.1, 0.9, 1, 'STR', 1);
    core('marksman',   SKILL, 175, 1.2, 1, 2.9, 0.7, 0, 'DEX', 1);
    core('venomEdge',  SKILL, 190, 1.3, 1, 2.6, 0.8, 1, 'DEX', 9);
    core('bandage',    SKILL, 140, 1.0, 3, 1.6, 0.0, 0, 'WIS');
    core('secondWind', SKILL, 200, 1.4, 5, 1.6, 0.9, 1, 'CON', 1);
    core('rally',      SKILL, 80,  0.5, 0, 0.0, 0.0, 0, 'WIS');

    // --- elements: the element id, a factor on power, a factor on the
    // defence still counted against it, and (sacred, cursed) the stat a
    // spell then leans on --------------------------------------------------
    const element = (key, kp, cx, id, mult, pierce, wis) =>
        add({ key, group: 'element', kp, cx, id, mult, pierce, wis: !!wis, fits: ['spell', 'skill', 'weapon', 'armor'], needs: ['harms'],
            worth: Math.max(0, 1 - pierce) * 0.25,
            equip: (entry, target) => {
                if (target === 'weapon') entry.traits.push(trait(31, id, 0));
                else entry.traits.push(trait(11, id, 0.5));
            } });
    element('physical', 0,   0.0, 1, 1.00, 1.0);
    element('fire',     40,  0.1, 2, 1.00, 1.0);
    element('ice',      40,  0.1, 3, 0.96, 1.0);
    element('thunder',  60,  0.2, 4, 1.08, 0.8);
    element('water',    35,  0.1, 5, 0.92, 1.1);
    element('stone',    50,  0.1, 6, 1.04, 0.9);
    element('gale',     35,  0.1, 7, 0.92, 1.0);
    element('sacred',   110, 0.6, 8, 1.17, 0.7, true);
    element('cursed',   130, 0.7, 9, 1.25, 0.6, true);

    // --- amplifiers ---------------------------------------------------------
    add({ key: 'focused', group: 'power', kp: 140, cx: 0.8, mult: 1.25, needs: ['acts'] });
    add({ key: 'potent',  group: 'power', kp: 380, cx: 1.8, mult: 1.60, needs: ['acts'] });
    add({ key: 'ruinous', group: 'power', kp: 900, cx: 3.4, mult: 2.10, needs: ['acts'] });

    // --- shapes: `side` is the line the shape points at ---------------------
    const shape = (key, kp, cx, scope, side) => add({ key, group: 'shape', kp, cx, scope, side });
    shape('oneEnemy',    0,   0.0, 1,  'enemy');
    shape('twoRandom',   160, 0.9, 4,  'enemy');
    shape('threeRandom', 300, 1.5, 5,  'enemy');
    shape('allEnemies',  520, 2.3, 2,  'enemy');
    shape('oneAlly',     0,   0.0, 7,  'ally');
    shape('allAllies',   420, 2.0, 8,  'ally');
    shape('theUser',     0,   0.0, 11, 'ally');
    shape('everyone',    780, 3.0, 14, 'both');

    // --- riders: effects written onto the entry. A state rider on the enemy
    // line is an on-hit state on a weapon and a resisted state on armour ------
    const stateRider = (key, kp, cx, side, stateId, chance, extra) => add(Object.assign({
        key, group: 'rider', kp, cx, side, state: stateId, worth: cx * 0.12,
        effects: [fx(21, stateId, chance)],
        fits: side === 'enemy' ? ['spell', 'skill', 'weapon', 'armor'] : BOTH,
        equip: side === 'enemy' ? (entry, target) => {
            if (target === 'weapon') entry.traits.push(trait(32, stateId, Math.min(1, Math.round(chance * 50) / 100)));
            else entry.traits.push(trait(14, stateId, 0));
        } : undefined
    }, extra || {}));
    const fxRider = (key, kp, cx, side, effects, extra) => add(Object.assign({
        key, group: 'rider', kp, cx, side, worth: cx * 0.12, effects
    }, extra || {}));

    stateRider('poison',      150, 0.7, 'enemy', 4,  0.60);
    stateRider('blind',       150, 0.7, 'enemy', 5,  0.55);
    stateRider('silence',     210, 1.0, 'enemy', 6,  0.45);
    stateRider('confusion',   230, 1.1, 'enemy', 8,  0.35);
    stateRider('sleep',       250, 1.2, 'enemy', 10, 0.35);
    stateRider('freeze',      260, 1.2, 'enemy', 11, 0.32);
    stateRider('paralysis',   300, 1.4, 'enemy', 12, 0.30);
    stateRider('stun',        240, 1.1, 'enemy', 13, 0.40);
    stateRider('deathMark',   620, 2.6, 'enemy', 33, 0.22);
    stateRider('provoke',     120, 0.5, 'enemy', 20, 0.90);
    stateRider('bleeding',    170, 0.8, 'enemy', 48, 0.60);
    stateRider('burned',      170, 0.8, 'enemy', 43, 0.60);
    stateRider('vulnerable',  190, 0.9, 'enemy', 40, 0.60);
    stateRider('unbalanced',  220, 1.0, 'enemy', 38, 0.50);
    stateRider('concussed',   240, 1.1, 'enemy', 60, 0.40);
    stateRider('guardBroken', 260, 1.2, 'enemy', 53, 0.50);
    stateRider('hobbled',     220, 1.0, 'enemy', 80, 0.50);
    stateRider('disarmed',    240, 1.1, 'enemy', 81, 0.50);
    // the reaction setups: the state the next element hit sets off
    stateRider('wet',         130, 0.6, 'enemy', 28, 0.80);
    stateRider('oily',        150, 0.7, 'enemy', 47, 0.80);
    stateRider('brittle',     190, 0.9, 'enemy', 77, 0.70);
    stateRider('volatile',    230, 1.1, 'enemy', 78, 0.60);
    // the delayed states: they land when they run out
    stateRider('doom',        700, 2.8, 'enemy', 87, 0.50);
    stateRider('litFuse',     420, 1.9, 'enemy', 88, 0.60);
    // mind control
    stateRider('looped',      300, 1.4, 'enemy', 67, 0.50);
    stateRider('mindSealed',  280, 1.3, 'enemy', 68, 0.60);
    stateRider('puppeted',    520, 2.3, 'enemy', 70, 0.35);
    stateRider('turncoat',    560, 2.5, 'enemy', 71, 0.30);
    stateRider('mindRead',    120, 0.5, 'enemy', 73, 0.90);
    fxRider('sapAtk',     170, 0.8, 'enemy', [fx(32, 2, 5)]);
    fxRider('sapDef',     170, 0.8, 'enemy', [fx(32, 3, 5)]);
    fxRider('sapMat',     170, 0.8, 'enemy', [fx(32, 4, 5)]);
    fxRider('sapAgi',     190, 0.9, 'enemy', [fx(32, 6, 5)]);
    fxRider('stripBuffs', 260, 1.1, 'enemy', [fx(33, 2, 0), fx(33, 3, 0), fx(33, 4, 0)]);

    stateRider('regenHP',      260, 1.2, 'ally', 15, 1.0, { fits: ['spell', 'skill', 'armor'], equip: (e) => e.traits.push(trait(22, 7, 0.05)) });
    stateRider('regenMP',      280, 1.3, 'ally', 16, 1.0, { fits: ['spell', 'skill', 'armor'], equip: (e) => e.traits.push(trait(22, 8, 0.05)) });
    stateRider('regenAP',      280, 1.3, 'ally', 17, 1.0, { fits: ['spell', 'skill', 'armor'], equip: (e) => e.traits.push(trait(22, 9, 0.05)) });
    stateRider('protect',      300, 1.4, 'ally', 19, 1.0);
    stateRider('counter',      330, 1.5, 'ally', 22, 0.90);
    stateRider('inspired',     280, 1.2, 'ally', 24, 1.0);
    stateRider('arcaneSurge',  480, 2.1, 'ally', 36, 0.80);
    stateRider('divineShield', 700, 2.9, 'ally', 32, 0.35);
    stateRider('shadowVeil',   340, 1.5, 'ally', 35, 0.85);
    stateRider('wardAilments', 360, 1.6, 'ally', 23, 0.90);
    stateRider('dawnVow',      520, 2.3, 'ally', 89, 1.0);
    stateRider('rebound',      380, 1.7, 'ally', 69, 1.0);
    stateRider('echo',         520, 2.3, 'ally', 72, 1.0);
    stateRider('bladeDrill',   160, 0.7, 'ally', 64, 1.0);
    stateRider('gunDrill',     160, 0.7, 'ally', 65, 1.0);
    stateRider('drilled',      140, 0.6, 'ally', 66, 1.0);
    // the stances: on a weapon a stance is the damage type it cuts with
    const stance = (key, stateId, type) => stateRider(key, 150, 0.6, 'ally', stateId, 1.0, {
        fits: ['spell', 'skill', 'weapon'], damageType: type,
        equip: (entry) => {
            entry.note = String(entry.note || '').replace(/\n?<DamageType:[^>]*>/i, '') + '\n<DamageType: ' + type + '>'; // i18n-ignore: note tag
            entry.meta = entry.meta || {};
            entry.meta.DamageType = ' ' + type;
        }
    });
    stance('edgeStance',       82, 'Cutting'); // i18n-ignore: Health_Core damage type id
    stance('mercifulStance',   83, 'Blunt'); // i18n-ignore: Health_Core damage type id
    stance('spearpointStance', 84, 'Piercing'); // i18n-ignore: Health_Core damage type id
    stateRider('bulletTime',   420, 1.9, 'ally', 90, 1.0);
    stateRider('foresight',    420, 1.9, 'ally', 91, 1.0);
    stateRider('guardianBond', 360, 1.6, 'ally', 92, 1.0, { needs: ['userShape'] });
    stateRider('lifeLink',     320, 1.4, 'any',  39, 1.0);
    stateRider('freshMagazine', 160, 0.7, 'ally', 85, 1.0);
    const brace = (key, kp, cx, param) => fxRider(key, kp, cx, 'ally', [fx(31, param, 5)], {
        fits: ['spell', 'skill', 'weapon', 'armor'],
        equip: (e) => e.traits.push(trait(21, param, 1.1))
    });
    brace('braceAtk', 170, 0.8, 2);
    brace('braceDef', 170, 0.8, 3);
    brace('braceMat', 170, 0.8, 4);
    brace('braceAgi', 190, 0.9, 6);
    const CLEANSE_IDS = [4, 5, 6, 8, 10, 11, 12, 13];
    fxRider('cleanse',     320, 1.3, 'ally', CLEANSE_IDS.map(id => fx(22, id, 1.0)));
    fxRider('firstAid',    240, 1.0, 'ally', [fx(11, 0, 0.15)]);
    fxRider('etherSplash', 300, 1.3, 'ally', [fx(12, 0, 0.12)]);
    fxRider('apSurge',     220, 1.0, 'ally', [fx(13, 0, 15)]);

    // --- refinements: single named changes to the plain fields --------------
    const refine = (key, kp, cx, apply, extra) => add(Object.assign({ key, group: 'refine', kp, cx, apply }, extra || {}));
    refine('certain',    260, 1.1, sk => { sk.hitType = 0; }, { worth: 0.10 });
    refine('twinCast',   420, 2.0, sk => { sk.repeats = 2; }, {
        slot: 'repeats', fits: ['spell', 'skill', 'weapon'], equip: (e) => e.traits.push(trait(34, 0, 1)) });
    refine('tripleCast', 900, 3.6, sk => { sk.repeats = 3; }, { slot: 'repeats' });
    refine('swift',      200, 0.9, sk => { sk.speed = (sk.speed || 0) + 25; }, {
        worth: 0.08, fits: ['spell', 'skill', 'weapon'], equip: (e) => e.traits.push(trait(33, 0, 25)) });
    refine('precise',    150, 0.6, sk => { sk.successRate = 100; }, {
        worth: 0.05, fits: ['spell', 'skill', 'weapon'], equip: (e) => e.traits.push(trait(22, 0, 0.1)) });
    refine('stable',     130, 0.5, sk => { if (sk.damage) sk.damage.variance = 0; }, { worth: 0.03, slot: 'variance' });
    refine('wild',       60,  0.2, sk => { if (sk.damage) sk.damage.variance = 50; }, { worth: -0.03, slot: 'variance' });
    refine('keenEdge',   340, 1.5, sk => { if (sk.damage) sk.damage.critical = true; }, {
        worth: 0.15, needs: ['damage'], fits: ['spell', 'skill', 'weapon', 'armor'], equip: (e) => e.traits.push(trait(22, 2, 0.1)) });
    refine('guardBreak', 300, 1.3, (sk, ctx) => { ctx.pierce *= 0.5; }, { worth: 0.20, needs: ['hpHit'] });
    refine('efficient',  380, 0.0, (sk, ctx) => { ctx.costMult *= 0.8; });
    refine('menuCast',   260, 1.0, sk => { sk.occasion = 0; }, { worth: 0.05, needs: ['notFoe'] });
    refine('apReturn',   200, 0.8, sk => { sk.tpGain = (sk.tpGain || 0) + 12; }, { worth: 0.08 });

    // --- payoffs: a condition written into the damage formula ---------------
    // A conditional payoff doubles (or half again) the multiplier when its
    // condition holds; the reference strike prices the plain branch, the
    // worth prices the chance of the other.
    const payoff = (key, kp, cx, worth, extra) => add(Object.assign({
        key, group: 'payoff', kp, cx, worth, needs: ['damage']
    }, extra));
    const consume = (key, stateId, kp) => payoff(key, kp, 1.4, 0.35, {
        slot: 'cond', state: stateId, cond: 'a.isStateAffected(' + stateId + ')', factor: 2,
        note: '<ConsumeSelfState: ' + stateId + '>', consumes: stateId }); // i18n-ignore: note tag
    consume('consumeCombo',  55, 300);
    consume('consumeLockOn', 14, 320);
    consume('consumeFocus',  34, 380);
    consume('consumeHide',   21, 300);
    const versus = (key, stateId, kp) => payoff(key, kp, 1.2, 0.30, {
        slot: 'cond', state: stateId, cond: 'b.isStateAffected(' + stateId + ')', factor: 2 });
    versus('vsWet',        28, 240);
    versus('vsOily',       47, 240);
    versus('vsBrittle',    77, 260);
    versus('vsBurned',     43, 240);
    versus('vsPoison',     4,  240);
    versus('vsGrappled',   51, 260);
    versus('vsConcussed',  60, 260);
    versus('vsUnbalanced', 38, 260);
    versus('vsVital',      56, 280);
    const whileHeld = (key, stateId, kp) => payoff(key, kp, 1.0, 0.25, {
        slot: 'cond', state: stateId, cond: 'a.isStateAffected(' + stateId + ')', factor: 1.5 });
    whileHeld('whileRage',     7,  220);
    whileHeld('whileBerserk',  31, 220);
    whileHeld('whileInspired', 24, 240);
    whileHeld('whileSurge',    36, 260);
    whileHeld('whileFlow',     58, 260);
    payoff('execute', 360, 1.5, 0.30, { slot: 'cond', cond: 'b.hpRate() < 0.3', factor: 2 });
    payoff('desperation', 280, 1.2, 0.10, { slot: 'desperate', desperate: true, needs: ['hpHit'] });
    const spend = (key, name, kp) => payoff(key, kp, 1.3, 0.30, {
        slot: 'spend', stack: name, note: '<SpendStacks: ' + name + '>' }); // i18n-ignore: note tag
    spend('spendChi',   'chi',   300);
    spend('spendFaith', 'faith', 300);
    spend('spendSouls', 'souls', 340);

    // --- mechanics: note tags the battle system reads -----------------------
    const mech = (key, kp, cx, worth, extra) => add(Object.assign({ key, group: 'mechanic', kp, cx, worth }, extra));
    const self = (key, stateId, chance, kp, cx, worth) => mech(key, kp, cx, worth, {
        slot: 'self', state: stateId, chance: chance,
        note: '<SelfState: ' + stateId + (chance < 1 ? ', ' + chance : '') + '>' }); // i18n-ignore: note tag
    self('selfCombo',      55, 0.5, 160, 0.7, 0.10);
    self('selfLockOn',     14, 1,   220, 1.0, 0.15);
    self('selfFocus',      34, 1,   320, 1.4, 0.20);
    self('selfDodge',      49, 1,   200, 0.9, 0.12);
    self('selfFlow',       58, 1,   240, 1.1, 0.15);
    self('selfCounter',    22, 1,   260, 1.2, 0.15);
    self('selfGuard',      2,  1,   140, 0.6, 0.08);
    self('selfHide',       21, 1,   200, 0.9, 0.12);
    // drawbacks: a price the user pays, so the cast costs less
    self('selfChiBurn',    59, 1,   40,  0.2, -0.15);
    self('selfUnbalanced', 38, 1,   40,  0.2, -0.15);
    self('selfWinded',     54, 1,   30,  0.2, -0.10);
    self('selfVulnerable', 40, 1,   30,  0.2, -0.10);
    mech('drainGentle', 60,  0.3, -0.10, { slot: 'drain', rate: 0.5, needs: ['drain'], note: '<DrainRate: 0.5>' }); // i18n-ignore: note tag
    mech('drainDeep',   320, 1.4, 0.20,  { slot: 'drain', rate: 1.5, needs: ['drain'], note: '<DrainRate: 1.5>' }); // i18n-ignore: note tag
    mech('manaSap',     260, 1.2, 0.15,  { slot: 'sap', needs: ['hpHit'], note: '<DrainMp: 0.3>' }); // i18n-ignore: note tag
    const stackBuilder = (key, name, kp) => mech(key, kp, 0.8, 0.10, {
        slot: 'stack-' + name, stack: name, note: '<Stack: ' + name + ', max 5>' }); // i18n-ignore: note tag
    stackBuilder('stackChi',   'chi',   180);
    stackBuilder('stackFaith', 'faith', 180);
    mech('soulsOnKill', 200, 0.8, 0.10, { slot: 'stack-souls', stack: 'souls', needs: ['damage'],
        note: '<StackOnKill: souls, max 5>' }); // i18n-ignore: note tag
    const aim = (key, part, kp) => mech(key, kp, 0.9, 0.10, {
        slot: 'aim', fits: SKILL, part: part, needs: ['hpHit', 'oneFoe'], note: '<TargetPart: ' + part + '>' }); // i18n-ignore: note tag
    aim('aimHead', 'head', 260);
    aim('aimArm',  'hand|arm', 220);
    aim('aimLeg',  'leg', 220);
    mech('aimable', 240, 0.9, 0.10, { slot: 'aim', fits: SKILL, needs: ['hpHit', 'oneFoe'], note: '<Aimable>' }); // i18n-ignore: note tag
    const ammo = (key, n, worth, extra) => mech(key, 20, 0.2, worth, Object.assign({
        slot: 'ammo', fits: SKILL, rounds: n, needs: ['marksman'], note: '<AmmoCost: ' + n + '>' }, extra || {})); // i18n-ignore: note tag
    ammo('ammo2', 2, -0.05);
    ammo('ammo4', 4, -0.10);
    ammo('ammoAll', 'all', -0.10, { needs: ['marksman', 'multiHit'] });
    mech('reload', 160, 0.6, 0, { slot: 'ammo', fits: SKILL, needs: ['emptyUser'], note: '<Reload>' }); // i18n-ignore: note tag
    // A dodge phase the user flies (the PSI Blast common event): Scene_Battle
    // opens it, anywhere else the skill is a plain hit.
    const PSI_DODGE_EVENT = 7;
    mech('bulletHell', 600, 2.6, 0.30, { needs: ['hpHit', 'foeSide'], effects: [fx(44, PSI_DODGE_EVENT, 0)] });

    // A few pairs that read as one mechanic undone by the other.
    const EXCLUDES = [
        ['consumeCombo', 'selfCombo'], ['consumeLockOn', 'selfLockOn'], ['consumeFocus', 'selfFocus'],
        ['consumeHide', 'selfHide'], ['spendChi', 'stackChi'], ['spendFaith', 'stackFaith'],
        ['spendSouls', 'soulsOnKill'], ['wild', 'stable']
    ];
    for (const [a, b] of EXCLUDES) {
        (BY_KEY[a].excludes = BY_KEY[a].excludes || []).push(b);
        (BY_KEY[b].excludes = BY_KEY[b].excludes || []).push(a);
    }

    const tagDef = (key) => BY_KEY[key] || null;

    //=========================================================================
    // The rules
    //=========================================================================

    // What the build already is, read once for every rule that asks.
    function buildFacts(tags) {
        const defs = (tags || []).map(tagDef).filter(Boolean);
        const coreDef = defs.find(d => d.group === 'core') || null;
        const shapeDef = defs.find(d => d.group === 'shape') || null;
        return {
            defs, keys: new Set(defs.map(d => d.key)), core: coreDef, shape: shapeDef,
            dmg: coreDef ? coreDef.dmg : -1, side: shapeDef ? shapeDef.side : null
        };
    }

    const NEEDS = {
        damage:    f => f.dmg === 1 || f.dmg === 5,
        harms:     f => !f.core || [1, 2, 5, 6].includes(f.dmg),
        acts:      f => !f.core || f.dmg !== 0,
        hpHit:     f => f.dmg === 1,
        drain:     f => f.dmg === 5 || f.dmg === 6,
        oneFoe:    f => !f.shape || f.shape.scope === 1,
        foeSide:   f => !f.shape || f.side === 'enemy' || f.side === 'both',
        notFoe:    f => !f.core || f.dmg === 0 || f.dmg === 3 || f.dmg === 4,
        userShape: f => !f.shape || f.shape.key === 'theUser',
        marksman:  f => !!f.core && f.core.key === 'marksman',
        multiHit:  f => f.keys.has('twinCast') || f.keys.has('tripleCast'),
        emptyUser: f => !!f.core && f.dmg === 0 && (!f.shape || f.shape.key === 'theUser')
    };

    const groupMax = (group, target) => SKILL_TARGETS.includes(target)
        ? (GROUPS.find(g => g.key === group) || { max: 0 }).max
        : (EQUIP_MAX[group] || 0);

    // Does the shape reach the line a tag means something on?
    function sideOk(def, f) {
        if (!def.side || def.side === 'any' || !f.side || f.side === 'both') return true;
        return def.side === f.side;
    }

    // A core that heals cannot keep an enemy shape, and the other way about.
    function coreShapeOk(coreDef, shapeDef) {
        if (!coreDef || !shapeDef || coreDef.dmg === 0 || shapeDef.side === 'both') return true;
        const heals = coreDef.dmg === 3 || coreDef.dmg === 4;
        return heals ? shapeDef.side === 'ally' : shapeDef.side === 'enemy';
    }

    // May `key` join `tags`? A tag already on the build answers for itself as
    // it stands, so the same question reads whether a build is still whole.
    // Core and shape swap: the one already there is not counted against them.
    function allowed(tags, key, target) {
        const def = tagDef(key);
        target = target || 'spell';
        if (!def) return { ok: false, reason: 'unknown' };
        if (!def.fits.includes(target)) return { ok: false, reason: 'bench' };
        const equip = !SKILL_TARGETS.includes(target);
        if (equip && !def.equip) return { ok: false, reason: 'bench' };
        const list = (tags || []).filter(k => k !== key);
        const single = def.group === 'core' || def.group === 'shape';
        const others = single ? list.filter(k => { const d = tagDef(k); return !d || d.group !== def.group; }) : list;
        const f = buildFacts(others);
        const max = groupMax(def.group, target);
        if (max <= 0) return { ok: false, reason: 'bench' };
        const inGroup = f.defs.filter(d => d.group === def.group).length;
        if (!single && inGroup >= max) return { ok: false, reason: 'full', params: { max } };
        if (def.slot) {
            const twin = f.defs.find(d => d.slot === def.slot);
            if (twin) return { ok: false, reason: 'slot', params: { other: tagName(twin.key) } };
        }
        for (const x of def.excludes || []) {
            if (f.keys.has(x)) return { ok: false, reason: 'clash', params: { other: tagName(x) } };
        }
        if (equip) return { ok: true };
        if (def.group === 'core' && !coreShapeOk(def, f.shape)) return { ok: false, reason: 'shape' };
        if (def.group === 'shape' && !coreShapeOk(f.core, def)) return { ok: false, reason: 'shape' };
        if (def.group === 'shape') {
            // every rider and mechanic already bought must still reach its line
            const stranded = f.defs.find(d => d.group !== 'core' && !sideOk(d, { side: def.side }));
            if (stranded) return { ok: false, reason: 'strands', params: { other: tagName(stranded.key) } };
        }
        if (!sideOk(def, f)) return { ok: false, reason: 'side' };
        for (const n of def.needs || []) {
            if (NEEDS[n] && !NEEDS[n](f)) return { ok: false, reason: 'needs.' + n };
        }
        return { ok: true };
    }

    // The whole build at once: every tag allowed, every group's minimum met.
    function validate(tags, target) {
        target = target || 'spell';
        const list = tags || [];
        if (new Set(list).size !== list.length) return { ok: false, reason: 'have' };
        for (const key of list) {
            const v = allowed(list, key, target);
            if (!v.ok) return Object.assign({ key }, v);
        }
        if (SKILL_TARGETS.includes(target)) {
            for (const g of GROUPS) {
                if (g.min && !list.some(k => { const d = tagDef(k); return d && d.group === g.key; })) {
                    return { ok: false, reason: 'missing', params: { group: tr('group.' + g.key) }, group: g.key };
                }
            }
        }
        return { ok: true };
    }

    const groupIndex = (def) => GROUP_ORDER.indexOf(def.group);
    const sortTags = (tags) => (tags || []).filter(k => tagDef(k))
        .map((k, i) => ({ k, i, g: groupIndex(tagDef(k)) }))
        .sort((x, y) => (x.g - y.g) || (x.i - y.i)).map(x => x.k);

    // The build with every tag that no longer fits taken off. Tags are read in
    // group order, so a core and a shape always win over what hangs on them.
    function normalize(tags, target) {
        const kept = [];
        const dropped = [];
        for (const key of sortTags(tags)) {
            if (kept.includes(key)) continue;
            const v = allowed(kept, key, target);
            if (v.ok) kept.push(key);
            else dropped.push(key);
        }
        return { tags: kept, dropped };
    }

    //=========================================================================
    // The shipped curve
    //
    // test/test_skill_power_budget.js fits it over data/Skills.json: power is
    // the formula struck by a caster with every stat 100 at level 1 against a
    // target with no defence, times its hits on a lone enemy; the price is
    // the MP or AP of the single-pool skills. The same fit runs here over the
    // live $dataSkills (crafted and fused entries left out), so a crafted
    // entry is priced on the book it sits in. The fallback is that fit as it
    // stood when the bench was written.
    //=========================================================================

    const CURVE_FALLBACK = {
        'damage-one/mp': { slope: 0.5432, mx: 3.2664, my: 6.4049 },
        'damage-one/ap': { slope: 0.5611, mx: 3.4390, my: 6.5734 },
        'damage-all/mp': { slope: 0.6468, mx: 4.0345, my: 6.2635 },
        'damage-all/ap': { slope: 0.6825, mx: 3.7868, my: 6.1570 },
        'heal-one/mp':   { slope: 0.7187, mx: 2.9768, my: 5.9543 },
        'heal-one/ap':   { slope: 0.6872, mx: 2.9849, my: 6.0799 },
        'heal-all/mp':   { slope: 0.6513, mx: 3.7569, my: 5.9758 },
        'heal-all/ap':   { slope: 0.6077, mx: 3.4714, my: 5.9621 },
        req:             { slope: 8.3566, mx: 6.3699, my: 11.6385 }
    };
    const WHOLE_SIDE = [2, 8, 10, 14];
    const RANDOM_HITS = { 3: 1, 4: 2, 5: 3, 6: 4 };
    const refBattler = (v) => ({
        atk: v, def: v, mat: v, mdf: v, agi: v, luk: v, level: 1,
        mhp: 1000, hp: 500, mmp: 100, mp: 100, tp: 50,
        hpRate: () => 0.5, mpRate: () => 1, tpRate: () => 0.5,
        isStateAffected: () => false, isDead: () => false, isAlive: () => true,
        param: () => v, states: () => [], elementRate: () => 1
    });
    const REF_CASTER = refBattler(100);
    const REF_TARGET = refBattler(0);
    const FORMULA_FN = new Map();
    function refPower(skill) {
        const f = String((skill && skill.damage && skill.damage.formula) || '');
        if (!f || f === '0') return 0;
        let fn = FORMULA_FN.get(f);
        if (fn === undefined) {
            try { fn = new Function('a', 'b', 'v', 'Math', 'return (' + f + ');'); } catch (e) { fn = null; }
            FORMULA_FN.set(f, fn);
        }
        if (!fn) return NaN;
        let v;
        try { v = Number(fn(REF_CASTER, REF_TARGET, [], Math)); } catch (e) { return NaN; }
        return v * Math.max(1, skill.repeats || 1) * (RANDOM_HITS[skill.scope] || 1);
    }

    const fitLine = (xs, ys) => {
        const n = xs.length;
        const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
        let sxy = 0, sxx = 0;
        for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
        return { slope: sxx ? sxy / sxx : 0, mx, my, n };
    };
    const lineAt = (c, x) => c.my + c.slope * (x - c.mx);
    const lineInv = (c, y) => c.mx + (y - c.my) / c.slope;
    const curveGroup = (dmg, scope) => (dmg === 3 ? 'heal' : 'damage') + (WHOLE_SIDE.includes(scope) ? '-all' : '-one');
    const noteCategory = (s) => ((String(s.note || '').match(/<category:\s*([^>]+)>/i) || [])[1] || '').trim();
    const noteReq = (s) => {
        const m = String(s.note || '').match(/<StatReq:\s*([^>]+)>/i);
        if (!m) return 0;
        return Math.max(0, ...[...m[1].matchAll(/[A-Z]+\s+(\d+)/g)].map(x => Number(x[1])));
    };

    let curveCache = null, curveKey = null;
    function curves() {
        const db = (typeof $dataSkills !== 'undefined' && Array.isArray($dataSkills)) ? $dataSkills : null;
        const key = db ? db.length : 0;
        if (curveCache && curveKey === key) return curveCache;
        const out = Object.assign({}, CURVE_FALLBACK);
        out.fitted = false;
        if (db && db.length > 400) {
            const rows = [];
            const custom = (window.SkillMaster && SkillMaster.CUSTOM_CATEGORIES) || ['Fusion', 'Crafted', 'Devised']; // i18n-ignore: skill category id / type discriminator
            for (const s of db) {
                if (!s || !s.name || String(s.name).startsWith('<--') || s._customSpell) continue;
                const t = s.damage && s.damage.type;
                if (t !== 1 && t !== 5 && t !== 3) continue;
                const cat = noteCategory(s);
                if (cat === 'Basic' || custom.includes(cat)) continue; // i18n-ignore: skill category id / type discriminator
                const p = refPower(s);
                if (!isFinite(p) || p <= 0) continue;
                rows.push({ s, power: p, mp: s.mpCost || 0, ap: s.tpCost || 0, req: noteReq(s), group: curveGroup(t, s.scope) });
            }
            const fitted = {};
            for (const g of ['damage-one', 'damage-all', 'heal-one', 'heal-all']) {
                for (const pool of ['mp', 'ap']) {
                    const other = pool === 'mp' ? 'ap' : 'mp';
                    const shelf = rows.filter(r => r.group === g && r[pool] > 0 && r[other] === 0);
                    if (shelf.length < 8) continue;
                    fitted[g + '/' + pool] = fitLine(shelf.map(r => Math.log(r[pool])), shelf.map(r => Math.log(r.power)));
                }
            }
            if (Object.keys(fitted).length === 8) {
                Object.assign(out, fitted);
                const pick = (g, pool) => out[g + '/' + pool] || out[g.replace(/-.*/, '-one') + '/' + pool];
                const owedOf = (r) => {
                    const apC = pick(r.group, 'ap'), mpC = pick(r.group, 'mp');
                    if (!(r.ap > 0)) return Math.exp(lineAt(mpC, Math.log(r.mp)));
                    let ap = r.ap;
                    if (r.mp > 0) ap += Math.exp(lineInv(apC, lineAt(mpC, Math.log(r.mp))));
                    return Math.exp(lineAt(apC, Math.log(ap)));
                };
                const gated = rows.filter(r => (r.mp > 0 || r.ap > 0) && r.req > 0);
                if (gated.length > 20) out.req = fitLine(gated.map(r => Math.log(owedOf(r))), gated.map(r => r.req));
                out.fitted = true;
            }
        }
        curveCache = out;
        curveKey = key;
        return out;
    }

    //=========================================================================
    // Assembling an entry
    //=========================================================================

    const round2 = (n) => Math.round(n * 100) / 100;
    const LEVEL_LADDER = '(1 + a.level * 0.05)'; // i18n-ignore: RPG Maker damage formula

    // The damage formula, in the shape the shipped book is written in:
    //   (a.mat * 2.4) * (1 + a.level * 0.05) - b.mdf * 1
    // with a payoff as a ternary over the two branches, exactly as the
    // shipped payoffs are, so SkillDetails reads the condition back.
    function composeFormula(ctx, dmg) {
        if (dmg === 0) return '0';
        const st = CRAFT_STATS[ctx.stat] || CRAFT_STATS.INT;
        const heals = dmg === 3 || dmg === 4;
        const pierce = round2(ctx.pierce);
        const branch = (m) => {
            let s = '(' + st.atk + ' * ' + round2(m) + ') * ' + LEVEL_LADDER;
            if (ctx.stack) s += " * (1 + 0.25 * (a.stacks ? a.stacks('" + ctx.stack + "') : 0))"; // i18n-ignore: RPG Maker damage formula
            if (ctx.desperate) s = '(a.mhp - a.hp) * 0.3 + ' + s; // i18n-ignore: RPG Maker damage formula
            if (!heals && pierce > 0) s += ' - ' + st.def + ' * ' + pierce;
            return s;
        };
        if (ctx.cond) return ctx.cond + ' ? ' + branch(ctx.mult * ctx.factor) + ' : ' + branch(ctx.mult);
        return branch(ctx.mult);
    }

    function freshSkill(spell) {
        return {
            id: 0, name: '', iconIndex: 0, description: '', animationId: 0,
            stypeId: spell ? 1 : 2, mpCost: 0, tpCost: 0, scope: 1, occasion: 1,
            speed: 0, successRate: 95, repeats: 1, tpGain: spell ? 0 : 5, hitType: 1,
            requiredWtypeId1: 0, requiredWtypeId2: 0, message1: '', message2: '', messageType: 0,
            damage: { type: 0, elementId: 0, formula: '0', variance: 20, critical: false },
            effects: [], note: '', meta: {}
        };
    }

    // The skill fields of a build, everything but its price. Returns the
    // entry, the context the tags wrote into and the defs in build order.
    function assemble(tags, target) {
        const spell = target !== 'skill';
        const defs = sortTags(tags).map(tagDef);
        const coreDef = defs.find(d => d.group === 'core');
        const shapeDef = defs.find(d => d.group === 'shape');
        const sk = freshSkill(spell);
        const ctx = {
            target, spell, core: coreDef || null,
            mult: coreDef ? coreDef.power : 0, pierce: coreDef ? coreDef.pierce : 1,
            stat: coreDef ? coreDef.stat : (spell ? 'INT' : 'STR'),
            costMult: 1, cond: null, factor: 1, stack: null, desperate: false,
            notes: [], worth: 0, cx: 0, kp: 0
        };
        if (coreDef) {
            sk.damage.type = coreDef.dmg;
            sk.damage.elementId = coreDef.el;
            sk.hitType = coreDef.hit;
        }
        if (shapeDef) sk.scope = shapeDef.scope;
        for (const d of defs) {
            ctx.kp += d.kp || 0;
            ctx.cx += d.cx || 0;
            ctx.worth += d.worth || 0;
            if (d.group === 'element') {
                sk.damage.elementId = d.id;
                ctx.mult *= d.mult;
                ctx.pierce *= d.pierce;
                if (d.wis && spell && coreDef && (coreDef.dmg === 1 || coreDef.dmg === 5)) ctx.stat = 'WIS';
            } else if (d.group === 'power') {
                ctx.mult *= d.mult;
            }
            if (d.apply) d.apply(sk, ctx);
            if (d.effects) for (const e of d.effects) sk.effects.push(Object.assign({}, e));
            if (d.cond) { ctx.cond = d.cond; ctx.factor = d.factor; }
            if (d.group === 'payoff' && d.stack) ctx.stack = d.stack;
            if (d.desperate) ctx.desperate = true;
            if (d.note) ctx.notes.push(d.note);
        }
        // Payoffs are only ever offered on a damaging core, so the formula is
        // the core's whatever else the build says.
        sk.damage.formula = composeFormula(ctx, sk.damage.type);
        return { sk, ctx, defs };
    }

    // What a build costs and what it asks of the character.
    function priceOf(sk, ctx, defs, target) {
        const spell = target !== 'skill';
        const n = defs.length;
        const stacking = 1 + 0.12 * Math.max(0, n - 2);
        const price = Math.max(50, Math.round(ctx.kp * stacking * (spell ? 1.0 : 0.9)));
        const stat = CRAFT_STATS[ctx.stat] ? ctx.stat : 'INT';
        const out = {
            price, complexity: Math.round(ctx.cx * 100) / 100,
            statKey: stat, paramId: CRAFT_STATS[stat].paramId,
            mpCost: 0, tpCost: 0, statReq: 3, power: 0, owed: 0, ratio: 0, curve: null, overload: false, beyond: false
        };
        const dmg = sk.damage.type;
        const power = refPower(sk);
        const pool = spell ? 'mp' : 'ap';
        let cost;
        const c = curves();
        if ((dmg === 1 || dmg === 5 || dmg === 3) && power > 0 && isFinite(power)) {
            // Riders and mechanics are priced as a share of power with
            // diminishing returns: the share never passes 0.8, so the entry's
            // damage never falls under x0.55 of what its price buys.
            const w = ctx.worth;
            const share = w > 0 ? 0.8 * (1 - Math.exp(-w / 0.8)) : Math.max(-0.4, w);
            const group = curveGroup(dmg, sk.scope);
            const line = c[group + '/' + pool];
            cost = Math.exp(lineInv(line, Math.log(power * (1 + share)))) * ctx.costMult;
            cost = Math.max(1, Math.round(cost));
            const owed = Math.exp(lineAt(line, Math.log(cost)));
            out.power = Math.round(power);
            out.owed = Math.round(owed);
            out.ratio = Math.round(power / owed * 100) / 100;
            out.curve = group + '/' + pool;
            const floor = lineAt(c.req, Math.log(owed));
            out.statReq = Math.max(3, Math.min(20, Math.round(floor)));
            // Past a floor of 25 the build is stronger than anything the
            // book holds at any price, and the bench will not write it.
            if (floor > 25) out.beyond = true;
        } else {
            // A build with no HP formula sits off the curve: it is priced on
            // its complexity, the way the support skills of the book are.
            cost = Math.max(1, Math.round((spell ? (3 + ctx.cx * 3.4) : (4 + ctx.cx * 4.2)) * ctx.costMult));
            out.statReq = Math.max(3, Math.min(20, Math.round(5 + ctx.cx * 1.15)));
        }
        // AP is the battler's hundred point pool: a skill that would need more
        // cannot be written at all.
        if (!spell && cost > 100) { out.overload = true; cost = 100; }
        if (spell) out.mpCost = cost; else out.tpCost = cost;
        return out;
    }

    function quote(tags, target) {
        target = target || 'spell';
        if (!SKILL_TARGETS.includes(target)) {
            let kp = 0, cx = 0;
            const defs = (tags || []).map(tagDef).filter(Boolean);
            for (const d of defs) { kp += d.kp || 0; cx += d.cx || 0; }
            return { price: Math.round(kp * (1 + 0.12 * Math.max(0, defs.length - 2))), complexity: Math.round(cx * 100) / 100 };
        }
        const { sk, ctx, defs } = assemble(tags, target);
        return priceOf(sk, ctx, defs, target);
    }

    // RMMZ's own metadata reader, so the battle plugins find the tags on
    // item.meta exactly as on a database entry.
    function parseMeta(note) {
        const meta = {};
        const re = /<([^<>:]+)(:?)([^>]*)>/g;
        let m;
        while ((m = re.exec(String(note || '')))) meta[m[1]] = m[2] === ':' ? m[3] : true;
        return meta;
    }

    function buildSkill(tags, opts) {
        const o = opts || {};
        const target = o.target === 'skill' ? 'skill' : 'spell';
        const spell = target === 'spell';
        const { sk, ctx, defs } = assemble(tags, target);
        const q = priceOf(sk, ctx, defs, target);
        sk.id = o.id || 0;
        sk.name = o.name || tr(spell ? 'defaultSpellName' : 'defaultSkillName');
        sk.iconIndex = o.iconIndex || 0;
        sk.animationId = o.animationId || 0;
        sk.mpCost = q.mpCost;
        sk.tpCost = q.tpCost;
        const category = o.category || (spell ? CRAFT_SPELL_CATEGORY : CRAFT_SKILL_CATEGORY);
        const lore = String(o.lore || '').replace(/[<>]/g, '').trim();
        let note = '<customSpell>\n<category:' + category + '>\n<StatReq: ' + q.statKey + ' ' + q.statReq + '>';
        for (const line of ctx.notes) note += '\n' + line;
        if (lore) note += '\n<Lore: ' + lore + '>';
        sk.note = note;
        sk.meta = parseMeta(note);
        sk.meta.customSpell = true;
        if (lore) sk.meta.Lore = lore;
        sk.description = o.description || describeEntry(sk, defs, target);
        // a generated description is written again in whatever language the
        // save is next loaded in; a written one is the writer's and stays
        sk._autoDesc = !o.description;
        sk._customSpell = true;
        sk._customCategory = category;
        sk._craftTags = sortTags(tags);
        sk._animationId = sk.animationId;
        if (o.actorId !== undefined) sk._ownerActorId = o.actorId;
        return sk;
    }

    // Writing tags onto something that already exists. A skill is rebuilt
    // field by field around its identity; a piece of equipment only gains.
    function apply(entry, tags, target) {
        if (!entry) return entry;
        target = target || 'spell';
        if (SKILL_TARGETS.includes(target)) {
            const sk = buildSkill(tags, {
                target, id: entry.id, name: entry.name, iconIndex: entry.iconIndex,
                animationId: entry.animationId, description: entry.description
            });
            return Object.assign(entry, sk);
        }
        entry.traits = Array.isArray(entry.traits) ? entry.traits : [];
        entry.note = String(entry.note || '');
        for (const key of sortTags(tags)) {
            const def = tagDef(key);
            if (def && def.equip && def.fits.includes(target)) def.equip(entry, target);
        }
        return entry;
    }

    //=========================================================================
    // The generated description
    //
    // House style: what it does, to whom, with which element and states, then
    // the payoffs and the mechanics, ending on timing and accuracy. Every word
    // is a template in SkillMaster.craft.auto.
    //=========================================================================

    function dbName(text) {
        if (!text) return '';
        return typeof window.Hendrix_Localization === 'function' ? window.Hendrix_Localization(String(text)) : String(text);
    }
    function stateLabel(id) {
        const st = (typeof $dataStates !== 'undefined' && $dataStates) ? $dataStates[id] : null;
        return st && st.name ? dbName(st.name) : tr('auto.stateN', { id });
    }
    function joinList(items) {
        if (items.length <= 1) return items.join('');
        return items.slice(0, -1).join(tr('auto.comma')) + tr('auto.and') + items[items.length - 1];
    }
    const sentence = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

    // The words the shipped descriptions use for the same multipliers.
    function weightOf(mult) {
        if (mult < 4) return 'minor';
        if (mult < 5.5) return 'light';
        if (mult < 8) return 'normal';
        if (mult < 11) return 'heavy';
        return 'massive';
    }

    function describeEntry(sk, defs, target) {
        if (!SKILL_TARGETS.includes(target)) {
            return defs.map(d => tagName(d.key)).join(tr('auto.comma'));
        }
        const shapeDef = defs.find(d => d.group === 'shape');
        const who = tr('auto.target.' + (shapeDef ? shapeDef.key : 'oneEnemy'));
        const dmg = sk.damage.type;
        // the plain branch: a payoff's other branch is named on its own
        const mult = (() => {
            const all = [...String(sk.damage.formula).matchAll(/a\.\w+ \* ([\d.]+)\)/g)];
            return all.length ? Number(all[all.length - 1][1]) : 0;
        })();
        const inflicts = [], grants = [], lines = [];
        for (const d of defs) {
            if (d.group !== 'rider') continue;
            if (d.state) (d.side === 'enemy' ? inflicts : grants).push(stateLabel(d.state));
            else lines.push(tr('auto.rider.' + d.key));
        }
        const times = sk.repeats > 1 ? tr('auto.times.' + Math.min(3, sk.repeats)) : '';
        let lead;
        const params = {
            target: who, weight: tr('auto.weight.' + weightOf(mult)),
            element: sk.damage.elementId > 0 ? tr('auto.el.' + sk.damage.elementId) : ''
        };
        if (dmg === 0) {
            if (inflicts.length) { lead = tr('auto.lead.inflict', { states: joinList(inflicts), target: who }); inflicts.length = 0; }
            else if (grants.length) { lead = tr('auto.lead.grant', { states: joinList(grants), target: who }); grants.length = 0; }
            else if (lines.length) { lead = tr('auto.lead.acts', { target: who }); }
            else lead = '';
        } else {
            lead = tr('auto.lead.' + dmg, params) + times;
        }
        const tail = [];
        if (inflicts.length) tail.push(tr('auto.inflicts', { states: joinList(inflicts) }));
        if (grants.length) tail.push(tr('auto.grants', { states: joinList(grants) }));
        for (const l of lines) tail.push(l);
        let text = lead ? sentence(lead + (tail.length ? tr('auto.and') + joinList(tail) : '')) + '.' : '';

        const more = [];
        for (const d of defs) {
            if (d.group === 'payoff' || d.group === 'mechanic') {
                const p = { state: d.state ? stateLabel(d.state) : '', stack: d.stack ? tr('auto.stackName.' + d.stack) : '',
                    part: d.part ? tr('auto.part.' + d.part.split('|').pop()) : '', n: d.rounds };
                let key = 'auto.tag.' + d.key;
                if (d.slot === 'self') key = d.worth < 0 ? 'auto.selfCost' : (d.chance < 1 ? 'auto.selfMaybe' : 'auto.self');
                else if (d.consumes) key = 'auto.consume';
                else if (d.slot === 'cond' && d.state) key = d.factor === 2 ? 'auto.versus' : 'auto.whileHeld';
                else if (d.group === 'payoff' && d.stack) key = 'auto.spend';
                else if (d.slot === 'aim' && d.part) key = 'auto.aim';
                else if (d.slot === 'ammo' && d.rounds) key = d.rounds === 'all' ? 'auto.ammoAll' : 'auto.ammo';
                else if (d.slot && d.slot.startsWith('stack-')) key = d.key === 'soulsOnKill' ? 'auto.stackOnKill' : 'auto.stack';
                more.push(tr(key, p));
            }
        }
        for (const d of defs) {
            if (d.group === 'refine' && ['certain', 'keenEdge', 'menuCast', 'guardBreak', 'apReturn'].includes(d.key)) {
                more.push(tr('auto.tag.' + d.key));
            }
        }
        if (sk.speed > 0) more.push(tr('auto.first'));
        if (dmg === 0 && sk.successRate < 100 && (shapeDef && shapeDef.side === 'enemy')) {
            more.push(tr('auto.lands', { pct: sk.successRate }));
        }
        if (more.length) text += (text ? ' ' : '') + more.join(' ');
        return text || sentence(tr('auto.lead.empty')) + '.';
    }

    function describe(tags, target) {
        target = target || 'spell';
        if (!SKILL_TARGETS.includes(target)) return describeEntry(null, sortTags(tags).map(tagDef), target);
        const { sk, defs } = assemble(tags, target);
        return describeEntry(sk, defs, target);
    }

    //=========================================================================
    // The decompiler
    //
    // Any skill read back into the tags it could be rebuilt from, as far as it
    // can be. What has no tag (an effect, a scope, a note tag the registry
    // does not know) is listed in `lost`.
    //=========================================================================

    const SCOPE_TO_SHAPE = { 1: 'oneEnemy', 2: 'allEnemies', 3: 'oneEnemy', 4: 'twoRandom', 5: 'threeRandom', 6: 'threeRandom',
        7: 'oneAlly', 8: 'allAllies', 11: 'theUser', 14: 'everyone' };
    const POWER_STEPS = [['', 1], ['focused', 1.25], ['potent', 1.6], ['ruinous', 2.1]];

    function targetOf(skill) {
        if (skill._craftKind) return skill._craftKind === 'skill' ? 'skill' : 'spell';
        const cat = noteCategory(skill);
        if (cat && window.SkillMaster && SkillMaster.getCategoryType && cat !== 'Fusion') { // i18n-ignore: skill category id / type discriminator
            const type = SkillMaster.getCategoryType(cat);
            if (type) return type === 'Magic' ? 'spell' : 'skill'; // i18n-ignore: skill category id / type discriminator
        }
        return skill.stypeId === 1 ? 'spell' : 'skill';
    }

    function decompile(skill) {
        const out = { target: 'spell', tags: [], lost: [], complete: true };
        if (!skill) { out.complete = false; return out; }
        if (Array.isArray(skill._craftTags) && skill._craftTags.length) {
            out.target = skill._craftKind === 'skill' ? 'skill' : (skill._craftKind === 'spell' ? 'spell' : targetOf(skill));
            const n = normalize(skill._craftTags, out.target);
            out.tags = n.tags;
            out.lost = n.dropped.map(k => 'tag:' + k);
            out.complete = !n.dropped.length;
            return out;
        }
        const target = targetOf(skill);
        out.target = target;
        const tags = [];
        const lose = (what) => { out.lost.push(what); };
        const d = skill.damage || { type: 0, formula: '0', elementId: 0 };
        const f = String(d.formula || '0');
        const note = String(skill.note || '');
        // the plain branch of a payoff is the formula the core is read off
        const condM = /^\s*([ab])\.isStateAffected\((\d+)\)\s*\?/.exec(f) || /^\s*(b)\.hpRate\(\)\s*<\s*[\d.]+\s*\?/.exec(f);
        const plain = condM ? f.slice(f.lastIndexOf(':') + 1) : f;
        const term = /a\.(atk|def|mat|mdf|agi|luk)\s*\*\s*([\d.]+)/.exec(plain);
        const stat = term ? STAT_OF_TERM[term[1]] : null;
        const mult = term ? Number(term[2]) : 0;
        const pierceM = /-\s*b\.(?:def|mdf)\s*\*\s*([\d.]+)/.exec(plain);

        // the core
        let coreKey = null;
        if (target === 'spell') {
            coreKey = { 0: 'ward', 1: 'bolt', 2: 'mindBurn', 3: 'mend', 4: 'etherFlow', 5: 'siphon' }[d.type] || null;
        } else if (d.type === 1) {
            if (/<AmmoCost:/i.test(note)) coreKey = 'marksman';
            else if (stat === 'DEX') coreKey = skill.hitType === 0 ? 'marksman' : (d.elementId === 9 ? 'venomEdge' : 'thrust');
            else if (noteCategory(skill) === 'MartialArts') coreKey = 'brawl'; // i18n-ignore: skill category id
            else coreKey = (pierceM && Number(pierceM[1]) > 1.1) ? 'cleave' : 'strike';
        } else {
            coreKey = { 0: 'rally', 3: 'bandage', 5: 'secondWind' }[d.type] || null;
        }
        if (!coreKey) { lose('core'); out.complete = false; return out; }
        const coreDef = tagDef(coreKey);
        tags.push(coreKey);

        // the element
        const el = TAGS.find(t => t.group === 'element' && t.id === d.elementId);
        let elMult = 1;
        // an element on an entry that strikes nothing is never read, so it is not a loss either
        if (d.elementId > 0 && d.elementId !== coreDef.el && [1, 2, 5, 6].includes(d.type)) {
            if (el) { tags.push(el.key); elMult = el.mult; } else lose('element');
        } else if (d.elementId < 0 && d.type) lose('element');

        // the amplifier, read as the nearest step over what the core alone strikes for
        if (coreDef.power > 0 && mult > 0) {
            const ratio = mult / (coreDef.power * elMult);
            let best = POWER_STEPS[0];
            for (const step of POWER_STEPS) if (Math.abs(Math.log(ratio / step[1])) < Math.abs(Math.log(ratio / best[1]))) best = step;
            if (best[0]) tags.push(best[0]);
        }

        // the shape
        const shapeKey = SCOPE_TO_SHAPE[skill.scope];
        if (shapeKey) tags.push(shapeKey); else lose('scope');

        // the refinements
        if (skill.hitType === 0 && coreDef.hit !== 0) tags.push('certain');
        if (skill.repeats === 2) tags.push('twinCast'); else if (skill.repeats >= 3) tags.push('tripleCast');
        if (skill.speed > 0) tags.push('swift');
        // a shipped skill lands 100% of the time by default, so only a
        // crafted entry (read off its own tags above) ever carries Precise
        if (d.type && d.variance === 0) tags.push('stable'); else if (d.type && d.variance >= 40) tags.push('wild');
        if (d.type && d.critical) tags.push('keenEdge');
        if (skill.occasion === 0) tags.push('menuCast');
        if ((skill.tpGain || 0) >= 12) tags.push('apReturn');

        // the riders, matched on their first effect
        let cleansed = false, stripped = false;
        for (const e of skill.effects || []) {
            if (!e) continue;
            if (e.code === 22 && CLEANSE_IDS.includes(e.dataId)) { if (!cleansed) tags.push('cleanse'); cleansed = true; continue; }
            if (e.code === 33) { if (!stripped) tags.push('stripBuffs'); stripped = true; continue; }
            const rider = TAGS.find(t => t.effects && t.effects.length && t.effects[0].code === e.code &&
                (t.effects[0].dataId === e.dataId || [11, 12, 13].includes(e.code)) && (e.code !== 11 || e.value1 > 0 || e.value2 > 0));
            if (rider && !tags.includes(rider.key)) tags.push(rider.key);
            else if (!rider) lose('effect:' + e.code + ':' + e.dataId);
        }

        // the payoffs
        const consumeM = /<ConsumeSelfState:\s*(\d+)/i.exec(note);
        if (condM && condM[1] === 'a' && consumeM) {
            const t = TAGS.find(x => x.consumes === Number(consumeM[1]));
            if (t) tags.push(t.key); else lose('consume');
        } else if (condM && condM[2] !== undefined) {
            const id = Number(condM[2]);
            const t = TAGS.find(x => x.slot === 'cond' && x.state === id && !x.consumes &&
                (condM[1] === 'b' ? x.factor === 2 : x.factor === 1.5));
            if (t) tags.push(t.key); else lose('payoff');
        } else if (condM) tags.push('execute');
        if (/a\.mhp\s*-\s*a\.hp/.test(f)) tags.push('desperation');
        const spendM = /<SpendStacks:\s*([^>]+)>/i.exec(note);
        if (spendM) {
            const t = TAGS.find(x => x.group === 'payoff' && x.stack === spendM[1].trim().split(',')[0].trim().toLowerCase());
            if (t) tags.push(t.key); else lose('spend');
        }

        // the mechanics
        const selfM = /<SelfState:\s*(\d+)/i.exec(note);
        if (selfM) { const t = TAGS.find(x => x.slot === 'self' && x.state === Number(selfM[1])); if (t) tags.push(t.key); else lose('self'); }
        const drainM = /<DrainRate:\s*([\d.]+)/i.exec(note);
        if (drainM) tags.push(Number(drainM[1]) < 1 ? 'drainGentle' : 'drainDeep');
        if (/<DrainMp:/i.test(note)) tags.push('manaSap');
        const stackM = /<Stack:\s*([A-Za-z][\w-]*)/i.exec(note);
        if (stackM) { const t = TAGS.find(x => x.group === 'mechanic' && x.stack === stackM[1].toLowerCase()); if (t) tags.push(t.key); else lose('stack'); }
        if (/<StackOnKill:/i.test(note)) tags.push('soulsOnKill');
        const partM = /<TargetPart:\s*([^>]+)>/i.exec(note);
        if (partM) {
            const part = partM[1].toLowerCase();
            tags.push(/head|neck/.test(part) ? 'aimHead' : (/leg|foot|wing/.test(part) ? 'aimLeg' : 'aimArm'));
        } else if (/<Aimable>/i.test(note)) tags.push('aimable');
        const ammoM = /<AmmoCost:\s*(all|\d+)/i.exec(note);
        if (ammoM) tags.push(/all/i.test(ammoM[1]) ? 'ammoAll' : (Number(ammoM[1]) <= 2 ? 'ammo2' : 'ammo4'));
        if (/<Reload>/i.test(note)) tags.push('reload');
        if ((skill.effects || []).some(e => e && e.code === 44 && e.dataId === PSI_DODGE_EVENT)) tags.push('bulletHell');
        for (const k of ['BulletHell', 'OncePerDay', 'PistolWhip', 'FreeHandsNeeded']) {
            if (new RegExp('<' + k + '>', 'i').test(note)) lose('note:' + k);
        }

        const n = normalize(tags, target);
        out.tags = n.tags;
        for (const k of n.dropped) lose('tag:' + k);
        out.complete = out.lost.length === 0;
        return out;
    }

    //=========================================================================
    // Names, and the public service
    //=========================================================================

    function tagName(key) { return tr('tags.' + key + '.name'); }
    function tagInfo(key) { return tr('tags.' + key + '.desc'); }
    function whyText(verdict) {
        if (!verdict || verdict.ok) return '';
        return tr('why.' + verdict.reason, verdict.params || {});
    }

    function list(filter) {
        const fl = filter || {};
        const needle = String(fl.search || '').trim().toLowerCase();
        return TAGS.filter(t => {
            if (fl.group && t.group !== fl.group) return false;
            if (fl.target && !t.fits.includes(fl.target)) return false;
            if (fl.target && !SKILL_TARGETS.includes(fl.target) && !t.equip) return false;
            if (needle && (tagName(t.key) + ' ' + tagInfo(t.key) + ' ' + t.key).toLowerCase().indexOf(needle) < 0) return false;
            return true;
        });
    }

    const SkillTags = {
        TARGETS, GROUPS, TAGS,
        list, get: tagDef, name: tagName, info: tagInfo, why: whyText,
        allowed, validate, normalize, sort: sortTags,
        apply, buildSkill, quote, describe, decompile,
        curves, refPower, parseMeta, coreShapeOk
    };
    window.SkillTags = SkillTags;
    SkillMaster.SkillTags = SkillTags;

    //=========================================================================
    // The bench's own reading of a build: { kind, name, description, lore,
    // iconIndex, animationId, tags }
    //=========================================================================

    function craftQuote(build) {
        return quote((build && build.tags) || [], build && build.kind === 'skill' ? 'skill' : 'spell');
    }
    SkillMaster.craftQuote = craftQuote;

    // What the character brings to the floor. SkillStatReq is the one
    // authority on which points count, so it is asked rather than copied.
    function craftBaseStat(actor, paramId) {
        if (!actor) return 0;
        if (window.SkillStatReq && window.SkillStatReq.baseStat) {
            return window.SkillStatReq.baseStat(actor, paramId);
        }
        return Math.floor(actor.paramBase ? actor.paramBase(paramId) : 0);
    }
    SkillMaster.craftBaseStat = craftBaseStat;

    // The entry itself. Everything the bench decides is decided by the tags,
    // so a build reads back the same way previewed or written for good.
    function buildCraftedSkill(build, actorId, existing) {
        const kind = build.kind === 'skill' ? 'skill' : 'spell';
        const sk = buildSkill(build.tags || [], {
            target: kind,
            id: existing ? existing.id : $gameSystem.allocCustomSkillId(),
            name: build.name, description: build.description, lore: build.lore,
            iconIndex: build.iconIndex, animationId: build.animationId, actorId: actorId
        });
        sk._crafted = true;
        sk._craftKind = kind;
        sk._craftBuild = {
            kind, tags: sortTags(build.tags || []),
            name: sk.name, description: build.description || '', lore: build.lore || '',
            iconIndex: sk.iconIndex, animationId: sk.animationId
        };
        return sk;
    }
    SkillMaster.buildCraftedSkill = buildCraftedSkill;

    //=========================================================================
    // Persistence: rebuilt entries and rewritten stock skills
    //=========================================================================

    Game_System.prototype.updateCustomSpell = function (skill) {
        const arr = this.getCustomSpells();
        const idx = arr.findIndex(s => s && s.id === skill.id);
        if (idx >= 0) {
            const node = /<Node:[^>]*>/i.exec(arr[idx].note || '');
            if (node) skill.note = String(skill.note || '') + '\n' + node[0];
            arr[idx] = skill;
        } else {
            arr.push(skill);
        }
        if (typeof $dataSkills !== 'undefined' && $dataSkills) $dataSkills[skill.id] = skill;
    };

    // The description and the lore a player wrote over a shipped skill. The
    // entry in the database is not theirs to keep, so only the two strings are
    // stored and they are laid back on after every load.
    Game_System.prototype.getSkillTextOverrides = function () {
        if (!this._skillTextOverrides) this._skillTextOverrides = {};
        return this._skillTextOverrides;
    };

    Game_System.prototype.setSkillTextOverride = function (skillId, description, lore) {
        const all = this.getSkillTextOverrides();
        const desc = String(description == null ? '' : description);
        const loreText = String(lore == null ? '' : lore).replace(/[<>]/g, '').trim();
        if (!desc && !loreText) delete all[skillId];
        else all[skillId] = { description: desc, lore: loreText };
        applySkillTextOverrides();
    };

    function applySkillTextOverrides() {
        if (typeof $gameSystem === 'undefined' || !$gameSystem) return;
        if (typeof $dataSkills === 'undefined' || !$dataSkills) return;
        if (!$gameSystem.getSkillTextOverrides) return;
        const all = $gameSystem.getSkillTextOverrides();
        for (const id of Object.keys(all)) {
            const skill = $dataSkills[Number(id)];
            if (!skill) continue;
            const over = all[id];
            if (over.description) skill.description = over.description;
            if (over.lore) {
                skill.meta = skill.meta || {};
                skill.meta.Lore = over.lore;
                skill.note = String(skill.note || '').replace(/\n?<Lore:[^>]*>/i, '') + '\n<Lore: ' + over.lore + '>';
            }
        }
    }
    SkillMaster.applySkillTextOverrides = applySkillTextOverrides;

    // Every generated description is read off its tags again in the language
    // the game is in now.
    function refreshAutoDescriptions() {
        if (typeof $gameSystem === 'undefined' || !$gameSystem || !$gameSystem.getCustomSpells) return;
        for (const s of $gameSystem.getCustomSpells()) {
            if (!s || !s._autoDesc || !Array.isArray(s._craftTags)) continue;
            try { s.description = describe(s._craftTags, s._craftKind === 'skill' ? 'skill' : 'spell'); } catch (e) { /* keep the old words */ }
        }
    }
    SkillMaster.refreshAutoDescriptions = refreshAutoDescriptions;

    const _SkillMasterCraft_extract = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function (contents) {
        _SkillMasterCraft_extract.call(this, contents);
        refreshAutoDescriptions();
        applySkillTextOverrides();
    };

    //=========================================================================
    // The bench
    //=========================================================================

    if (!window.Scene_SkillEncyclopedia) {
        window.Scene_SkillEncyclopedia = function () { this.initialize(...arguments); };
        window.Scene_SkillEncyclopedia.prototype = Object.create(Scene_MenuBase.prototype);
        window.Scene_SkillEncyclopedia.prototype.constructor = window.Scene_SkillEncyclopedia;
    }
    const Proto = window.Scene_SkillEncyclopedia.prototype;


    // The rows of the bench, in the order they are drawn and walked: the
    // identity, one row of chips per tag group, then the three actions.
    const CRAFT_CHIP_ROWS = GROUP_ORDER.slice();
    SkillMaster.CRAFT_CHIP_ROWS = CRAFT_CHIP_ROWS;
    const CRAFT_ROWS = ['name', 'description', 'lore', 'icon', 'animation']
        .concat(CRAFT_CHIP_ROWS, ['catalogue', 'randomize', 'create']);
    SkillMaster.CRAFT_ROWS = CRAFT_ROWS;
    const ADD_CHIP = '+';
    const SINGLE_GROUPS = ['core', 'shape'];

    const CRAFT_DEFAULT_TAGS = { spell: ['bolt', 'fire', 'oneEnemy'], skill: ['strike', 'oneEnemy'] };

    Proto.craftDefaultBuild = function (kind) {
        const spell = kind !== 'skill';
        return {
            kind: spell ? 'spell' : 'skill',
            name: '', description: '', lore: '', iconIndex: 0, animationId: 0,
            tags: CRAFT_DEFAULT_TAGS[spell ? 'spell' : 'skill'].slice()
        };
    };

    Proto.openCraftBench = function (kind, editId) {
        this._viewMode = 'craft';
        this._craftEditingId = editId || null;
        this._craftBaseQuote = null;
        this._craftDropped = [];
        const entry = editId ? $dataSkills[editId] : null;
        const source = entry ? entry._craftBuild : null;
        if (source) {
            // An entry written before the bench spoke in tags is read back
            // through the decompiler, the same way a fusion reads a parent.
            const k = source.kind === 'skill' ? 'skill' : 'spell';
            const tags = Array.isArray(source.tags) ? source.tags.slice() : decompile(Object.assign({}, entry, { _craftTags: null })).tags;
            this._craft = {
                kind: k, name: source.name, description: source.description, lore: source.lore,
                iconIndex: source.iconIndex, animationId: source.animationId,
                tags: normalize(tags, k).tags
            };
            this._craftBaseQuote = craftQuote(this._craft);
        } else {
            this._craftEditingId = null;
            this._craft = this.craftDefaultBuild(kind);
        }
        this._craftStep = 0;
        this._craftFocus = 0;
        this._craftChip = 0;
        this._craftChipAt = {};
        this._craftPicker = null;
        this._craftPickIndex = 0;
        this._craftTyping = false;
        SoundManager.playOk();
        this.refreshUISkillDOM();
    };

    Proto.closeCraftBench = function () {
        this.closeCraftTextSheet();
        if (window.CCPick && window.CCPick.isOpen && window.CCPick.isOpen()) window.CCPick.close(true);
        // Leaving the bench with the stage still lit would leave the effect
        // running behind a page that no longer has a canvas for it.
        if (this._craftPicker === 'animation' && window.SkillAnimPreview) window.SkillAnimPreview.dispose();
        this._viewMode = 'category';
        this._craftPicker = null;
        this._lastLeftMode = null;
        this._lastLeftCategory = null;
        this._lastRightMode = null;
        this._lastRightSkillId = null;
        this._lastRightKnowledge = null;
        SoundManager.playCancel();
        this.refreshUISkillDOM();
    };

    // The cursor's column on the bench is the form rows first and then one stop
    // for every spell already written, so a pad reaches the two chips on a
    // finished entry (open it again, or throw it away) the same way a mouse does.
    Proto.craftFocusRows = function () {
        const build = this._craft;
        return CRAFT_ROWS.length + this.craftedEntries(build ? build.kind : null).length;
    };

    // Which finished entry the cursor is reading, or null while it is still up
    // among the form rows.
    Proto.craftFocusedEntry = function () {
        const at = this._craftFocus - CRAFT_ROWS.length;
        if (at < 0) return null;
        const build = this._craft;
        return this.craftedEntries(build ? build.kind : null)[at] || null;
    };

    Proto.craftedEntries = function (kind) {
        const actor = this.getTeachActor();
        if (!actor || typeof $gameSystem === 'undefined') return [];
        return $gameSystem.getCustomSpells().filter(s =>
            s && s._crafted && s._ownerActorId === actor.actorId() &&
            (!kind || s._craftKind === kind));
    };

    //--- the tags on the build -----------------------------------------------

    const groupOf = (key) => { const d = tagDef(key); return d ? d.group : null; };

    // The tags a build is weighed against when `key` is offered: a group that
    // takes one tag swaps it, so the one already there is set aside.
    function craftWorkingTags(build, key) {
        const def = tagDef(key);
        const tags = (build && build.tags) || [];
        if (!def) return tags.slice();
        return groupMax(def.group, build.kind) === 1 ? tags.filter(k => groupOf(k) !== def.group) : tags.slice();
    }

    // Is `key` on offer to this build, and if not, why not?
    Proto.craftTagVerdict = function (key) {
        const build = this._craft;
        if (!build) return { ok: false, reason: 'unknown' };
        if (build.tags.includes(key)) return { ok: false, reason: 'have' };
        let work = craftWorkingTags(build, key);
        const def = tagDef(key);
        // a core that heals is offered even under an enemy shape: taking it
        // moves the shape onto the party, as the list picker always did
        if (def && def.group === 'core' && def.fits.includes(build.kind)) {
            work = work.filter(k => groupOf(k) !== 'shape');
        }
        return allowed(work, key, build.kind);
    };

    Proto.craftAddTag = function (key) {
        const build = this._craft;
        const def = tagDef(key);
        const verdict = this.craftTagVerdict(key);
        if (!def || !verdict.ok) { SoundManager.playBuzzer(); this.refreshUISkillDOM(); return false; }
        let tags = craftWorkingTags(build, key).concat([key]);
        if (def.group === 'core') {
            const shapeKey = tags.find(k => groupOf(k) === 'shape');
            if (!coreShapeOk(def, tagDef(shapeKey))) {
                const heals = def.dmg === 3 || def.dmg === 4;
                tags = tags.filter(k => k !== shapeKey).concat([heals ? 'oneAlly' : 'oneEnemy']);
            }
        }
        const n = normalize(tags, build.kind);
        build.tags = n.tags;
        this._craftDropped = n.dropped;
        SoundManager.playOk();
        this.refreshUISkillDOM();
        return true;
    };

    Proto.craftRemoveTag = function (key) {
        const build = this._craft;
        if (!build || !build.tags.includes(key)) { SoundManager.playBuzzer(); return; }
        const n = normalize(build.tags.filter(k => k !== key), build.kind);
        build.tags = n.tags;
        this._craftDropped = n.dropped;
        SoundManager.playCancel();
        this.refreshUISkillDOM();
    };

    //--- the catalogue -------------------------------------------------------
    // Every tag the bench sells, grouped, each with the verdict on this build:
    // a refused tag is still listed, greyed, with the reason beside it.

    Proto.craftCatalogueRows = function (group) {
        const build = this._craft;
        if (!build) return [];
        return list({ target: build.kind, group: group || undefined }).map(def => {
            const verdict = this.craftTagVerdict(def.key);
            return { key: def.key, def, verdict, have: build.tags.includes(def.key) };
        });
    };

    Proto.craftCatalogueHint = function (row) {
        if (row.have) return tr('why.have');
        if (!row.verdict.ok) return whyText(row.verdict);
        return tr('tagCost', { kp: row.def.kp || 0, cx: (row.def.cx || 0).toFixed(1) });
    };

    Proto.openCraftCatalogue = function (group) {
        const rows = this.craftCatalogueRows(group);
        if (!rows.length) { SoundManager.playBuzzer(); return; }
        this._craftPickGroup = group || null;
        const pick = window.CCPick;
        if (pick && typeof pick.open === 'function' && this._dndContainer) {
            pick.open({
                title: group ? tr('pick.' + group) : tr('pick.catalogue'),
                container: this._dndContainer,
                search: true,
                options: rows.map(row => ({
                    value: row.key,
                    label: tagName(row.key),
                    hint: this.craftCatalogueHint(row),
                    group: tr('group.' + row.def.group),
                    disabled: row.have || !row.verdict.ok
                })),
                detail: (opt) => {
                    const row = rows.find(r => r.key === opt.value);
                    if (!row) return '';
                    return `<h4 class="cc-modal-title">${esc(tagName(row.key))}</h4>
                        <div class="ui-prose">${esc(tagInfo(row.key))}</div>
                        <div class="cc-bio-note">${esc(tr('tagCost', { kp: row.def.kp || 0, cx: (row.def.cx || 0).toFixed(1) }))}</div>
                        ${row.verdict.ok || row.have ? '' : `<div class="sm-craft-block">${esc(whyText(row.verdict))}</div>`}`;
                },
                onPick: (key) => this.craftAddTag(key)
            });
            SoundManager.playOk();
            return;
        }
        // No pick sheet in this build: the catalogue is a list on the right page.
        this._craftPicker = 'tags';
        this._craftPickIndex = Math.max(0, rows.findIndex(r => !r.have && r.verdict.ok));
        SoundManager.playOk();
        this.refreshUISkillDOM();
    };

    //--- pickers for the icon, the animation and the in-page catalogue --------

    Proto.craftPickerRows = function (group) {
        if (group === 'icon') return this.craftIconChoices();
        if (group === 'animation') return this.getAvailableAnimations();
        if (group === 'tags') return this.craftCatalogueRows(this._craftPickGroup);
        return [];
    };

    // The icons a build may wear are the ones the book already uses, which is
    // the only list guaranteed to exist in this project's IconSet whatever it
    // has been redrawn to.
    Proto.craftIconChoices = function () {
        if (!this._craftIcons) {
            const seen = new Set();
            const out = [];
            if (typeof $dataSkills !== 'undefined' && $dataSkills) {
                for (const s of $dataSkills) {
                    if (!s || !s.name || !s.iconIndex) continue;
                    if (seen.has(s.iconIndex)) continue;
                    seen.add(s.iconIndex);
                    out.push({ key: 'icon' + s.iconIndex, iconIndex: s.iconIndex });
                    if (out.length >= 400) break;
                }
            }
            this._craftIcons = out;
        }
        return this._craftIcons;
    };

    Proto.openCraftPicker = function (group) {
        const rows = this.craftPickerRows(group);
        if (!rows.length) { SoundManager.playBuzzer(); return; }
        this._craftPicker = group;
        const build = this._craft;
        let idx = 0;
        if (group === 'icon') idx = rows.findIndex(r => r.iconIndex === build.iconIndex);
        else if (group === 'animation') idx = rows.findIndex(r => r.id === build.animationId);
        this._craftPickIndex = Math.max(0, idx);
        SoundManager.playOk();
        this.refreshUISkillDOM();
    };

    Proto.craftChoose = function (group, k) {
        const rows = this.craftPickerRows(group);
        const row = rows[k];
        if (!row) { SoundManager.playBuzzer(); return; }
        const build = this._craft;
        this._craftPickIndex = k;
        if (group === 'tags') {
            if (row.have || !row.verdict.ok) { SoundManager.playBuzzer(); this.refreshUISkillDOM(); return; }
            this._craftPicker = null;
            this.craftAddTag(row.key);
            return;
        }
        if (group === 'icon') {
            build.iconIndex = row.iconIndex;
        } else if (group === 'animation') {
            build.animationId = row.id;
            if (window.SkillAnimPreview) window.SkillAnimPreview.dispose();
        }
        this._craftPicker = null;
        SoundManager.playOk();
        this.refreshUISkillDOM();
    };

    Proto.closeCraftPicker = function () {
        if (this._craftPicker === 'animation' && window.SkillAnimPreview) window.SkillAnimPreview.dispose();
        this._craftPicker = null;
        SoundManager.playCancel();
        this.refreshUISkillDOM();
    };

    //--- writing the text ----------------------------------------------------

    // Name, description and lore are typed into a real field. The sheet is
    // opened over the book rather than inside a page the bench re-renders, and
    // a capture phase guard runs ahead of every always-on plugin so nothing
    // else can swallow a letter.
    // `commit` is the third way the sheet can be spent: the bench writes a
    // build field, a skill id rewrites that skill, and a callback lets
    // anything else (a written book being renamed) take the words instead.
    Proto.openCraftTextSheet = function (field, targetSkillId, commit) {
        if (!this._dndContainer || this._craftTyping) return;
        const single = (field === 'name');
        const current = targetSkillId
            ? this.craftOverrideText(targetSkillId, field)
            : String((this._craft && this._craft[field]) || '');
        // On the bench a spell's flavour is the words said over it, so the
        // sheet asks for an incantation there and for lore everywhere else.
        const writeField = (field === 'lore' && !targetSkillId && this._craft && this._craft.kind !== 'skill')
            ? 'incantation' : field;
        // A pad cannot type into a field, and a sheet it cannot leave is a
        // trap. So on a pad the letters are drawn instead: the controller
        // layer's own sheet, spent through the same three ways as this one.
        if (window.Controller && Controller.usingPad && Controller.usingPad()) {
            const take = (value) => {
                this._craftWriteField = field;
                this._craftWriteTarget = targetSkillId || null;
                this._craftWriteCommit = (typeof commit === 'function') ? commit : null;
                this.commitCraftText(String(value));
            };
            Controller.textEntry({
                title: tr('write.' + writeField),
                value: current,
                max: single ? 40 : 400,
                multiline: !single,
                onCommit: take
            });
            return;
        }
        const sheet = document.createElement('div');
        sheet.className = 'sm-craft-write-backdrop';
        sheet.innerHTML = `
            <div class="sm-craft-write">
                <div class="sm-craft-write-title">${tr('write.' + writeField)}</div>
                ${single
                ? `<input id="sm-craft-write-input" class="sm-craft-write-input" type="text" maxlength="40" autocomplete="off" spellcheck="false">`
                : `<textarea id="sm-craft-write-input" class="sm-craft-write-input" rows="5" maxlength="400" autocomplete="off" spellcheck="false"></textarea>`}
                <div class="sm-craft-write-hint">${tr('write.hint')}</div>
                <div class="sm-craft-write-btns">
                    <button type="button" class="sm-craft-write-btn focusable" onclick="SceneManager._scene.closeCraftTextSheet()">${tr('cancel')}</button>
                    <button type="button" class="sm-craft-write-btn focusable" onclick="SceneManager._scene.submitCraftText()">${tr('save')}</button>
                </div>
            </div>`;
        this._dndContainer.appendChild(sheet);
        this._craftWriteEl = sheet;
        this._craftWriteField = field;
        this._craftWriteTarget = targetSkillId || null;
        this._craftWriteCommit = (typeof commit === 'function') ? commit : null;
        this._craftTyping = true;

        const el = sheet.querySelector('#sm-craft-write-input');
        if (el) {
            el.value = current;
            requestAnimationFrame(() => {
                el.focus();
                try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) { /* focus is enough */ }
            });
        }
        this.bindCraftKeyGuard();
        SoundManager.playOk();
    };

    Proto.craftOverrideText = function (skillId, field) {
        const skill = $dataSkills[skillId];
        if (!skill) return '';
        const over = $gameSystem.getSkillTextOverrides()[skillId];
        if (field === 'lore') return over ? over.lore : String((skill.meta && skill.meta.Lore) || '');
        return over ? over.description : String(skill.description || '');
    };

    Proto.bindCraftKeyGuard = function () {
        if (this._craftKeyGuard) return;
        this._craftKeyGuard = (e) => {
            const active = document.activeElement;
            if (!active || (active.tagName !== 'INPUT' && active.tagName !== 'TEXTAREA')) return;
            e.stopImmediatePropagation();
            if (e.type !== 'keydown' || active.id !== 'sm-craft-write-input') return;
            if (e.key === 'Enter' && !e.shiftKey && active.tagName === 'INPUT') {
                e.preventDefault();
                this.submitCraftText();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.closeCraftTextSheet();
            }
        };
        window.addEventListener('keydown', this._craftKeyGuard, true);
        window.addEventListener('keyup', this._craftKeyGuard, true);
        window.addEventListener('keypress', this._craftKeyGuard, true);
    };

    Proto.closeCraftTextSheet = function () {
        if (this._craftKeyGuard) {
            window.removeEventListener('keydown', this._craftKeyGuard, true);
            window.removeEventListener('keyup', this._craftKeyGuard, true);
            window.removeEventListener('keypress', this._craftKeyGuard, true);
            this._craftKeyGuard = null;
        }
        if (this._craftWriteEl && this._craftWriteEl.parentNode) this._craftWriteEl.remove();
        this._craftWriteEl = null;
        this._craftWriteCommit = null;
        // The letter sheet never set the typing flag - it is not a field - but
        // the page still has to be drawn again over whatever it wrote.
        if (this._craftTyping) {
            this._craftTyping = false;
            Input.clear();
            TouchInput.clear();
        }
        this.refreshUISkillDOM();
    };

    Proto.submitCraftText = function () {
        const el = this._craftWriteEl && this._craftWriteEl.querySelector('#sm-craft-write-input');
        this.commitCraftText(el ? String(el.value) : '');
    };

    // What the words are spent on, whichever sheet took them: the field the
    // keyboard types into, or the letter sheet a pad walks.
    Proto.commitCraftText = function (value) {
        const field = this._craftWriteField;
        const target = this._craftWriteTarget;
        const commit = this._craftWriteCommit;
        this._craftWriteCommit = null;
        if (commit) {
            commit(value);
        } else if (target) {
            const desc = field === 'description' ? value : this.craftOverrideText(target, 'description');
            const lore = field === 'lore' ? value : this.craftOverrideText(target, 'lore');
            $gameSystem.setSkillTextOverride(target, desc, lore);
            const owned = $dataSkills[target];
            if (owned && owned._crafted && owned._craftBuild) {
                owned._craftBuild.description = desc;
                owned._craftBuild.lore = lore;
                $gameSystem.updateCustomSpell(owned);
            }
        } else if (field && this._craft) {
            this._craft[field] = field === 'name' ? value.slice(0, 40) : value;
        }
        // Only the bench's own spell name is warned about: a skill may be
        // called anything, and a book being renamed is not a spell at all.
        const warnName = (!commit && !target && field === 'name' && this._craft && this._craft.kind !== 'skill'
            && this._craft.name && !isSpellCamelCase(this._craft.name));
        SoundManager.playSave();
        this.closeCraftTextSheet();
        if (warnName) this.openCraftNameWarning();
    };


    //--- naming, and rolling a whole build -----------------------------------

    // A spell's name is one CamelCase word, the convention every shipped
    // spell follows. A skill's name is free: it may be anything the writer
    // types. The bench only warns about a spell, and never refuses one.
    const CAMEL_RE = /^[A-ZÀ-Þ][A-Za-zÀ-ɏ]*$/;
    const isSpellCamelCase = (name) => CAMEL_RE.test(String(name == null ? '' : name).trim());
    SkillMaster.isSpellCamelCase = isSpellCamelCase;

    const camelJoin = (words) => words
        .map(w => String(w).replace(/[^A-Za-zÀ-ɏ]/g, ''))
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join('');


    // A rolled name is read off the tags the roll bought, so it says what the
    // entry does in whatever language the bench is drawn in.
    Proto.craftRolledName = function (build) {
        const tags = sortTags(build.tags || []);
        const first = (group) => tags.find(k => groupOf(k) === group);
        const parts = [];
        if (first('power')) parts.push(tagName(first('power')));
        parts.push(tagName(first('element') || first('core') || tags[0]));
        const tail = first('rider') || first('payoff') || first('mechanic') || first('refine');
        if (tail) parts.push(tagName(tail));
        const name = build.kind === 'skill'
            ? parts.join(' ').replace(/\s+/g, ' ').trim()
            : camelJoin(parts);
        return name.slice(0, 40);
    };

    // Rolls the whole build at once, the name with it. The roll only ever
    // builds something the bench would accept: every tag is asked of the same
    // rules the catalogue greys its rows by. What it costs is not part of the
    // roll, so an unaffordable build is still rolled and refused at Write.
    Proto.craftRandomize = function () {
        const build = this._craft;
        if (!build) return;
        const kind = build.kind;
        const roll = (n) => Math.floor(Math.random() * n);
        const pick = (arr) => arr[roll(arr.length)];
        const coreDef = pick(list({ target: kind, group: 'core' }));
        const shapes = list({ target: kind, group: 'shape' }).filter(s => coreShapeOk(coreDef, s));
        let tags = [coreDef.key, pick(shapes).key];
        const tryAdd = (group, chance) => {
            if (Math.random() >= chance) return;
            const open = list({ target: kind, group }).filter(t => allowed(tags, t.key, kind).ok);
            if (open.length) tags.push(pick(open).key);
        };
        if (coreDef.dmg !== 0) { tryAdd('element', 0.6); tryAdd('power', 0.6); }
        for (const [group, most] of [['rider', 3], ['refine', 3], ['payoff', 1], ['mechanic', 2]]) {
            const want = roll(most + 1);
            for (let i = 0; i < want; i++) tryAdd(group, 1);
        }
        build.tags = normalize(tags, kind).tags;
        this._craftDropped = [];

        const icons = this.craftIconChoices();
        if (icons.length) build.iconIndex = pick(icons).iconIndex;
        const anims = this.getAvailableAnimations();
        if (anims.length) build.animationId = pick(anims).id;

        build.name = this.craftRolledName(build);
        SoundManager.playOk();
        this.refreshUISkillDOM();
    };

    // The warning a spell name that is not one CamelCase word earns. It is a
    // warning and nothing more: the name is already written, and Keep simply
    // walks away from the sheet.
    Proto.openCraftNameWarning = function () {
        if (!this._dndContainer || this._craftWarnEl) return;
        const sheet = document.createElement('div');
        sheet.className = 'sm-craft-write-backdrop';
        sheet.innerHTML = `
            <div class="sm-craft-write sm-craft-warn">
                <div class="sm-craft-write-title">${esc(tr('camel.title'))}</div>
                <div class="sm-craft-write-hint">${esc(tr('camel.body', { name: (this._craft && this._craft.name) || '' }))}</div>
                <div class="sm-craft-write-btns">
                    <button type="button" class="sm-craft-write-btn focusable" onclick="SceneManager._scene.closeCraftNameWarning(true)">${esc(tr('camel.rename'))}</button>
                    <button type="button" class="sm-craft-write-btn focusable" onclick="SceneManager._scene.closeCraftNameWarning(false)">${esc(tr('camel.keep'))}</button>
                </div>
            </div>`;
        this._dndContainer.appendChild(sheet);
        this._craftWarnEl = sheet;
        SoundManager.playBuzzer();
    };

    Proto.closeCraftNameWarning = function (rename) {
        if (this._craftWarnEl && this._craftWarnEl.parentNode) this._craftWarnEl.remove();
        this._craftWarnEl = null;
        Input.clear();
        TouchInput.clear();
        if (rename) this.openCraftTextSheet('name');
        else this.refreshUISkillDOM();
    };


    //--- writing the entry ---------------------------------------------------

    Proto.craftCanWrite = function () {
        const actor = this.getTeachActor();
        const build = this._craft;
        if (!actor || !build) return { ok: false, reason: 'incomplete' };
        const check = validate(build.tags, build.kind);
        const quoted = craftQuote(build);
        const owed = (this._craftEditingId && this._craftBaseQuote)
            ? Math.max(0, quoted.price - this._craftBaseQuote.price)
            : quoted.price;
        const have = craftBaseStat(actor, quoted.paramId);
        const base = { quote: quoted, owed, have };
        if (!check.ok) {
            return Object.assign(base, { ok: false, reason: check.reason === 'missing' ? 'incomplete' : 'invalid', why: whyText(check), tag: check.key });
        }
        if (quoted.overload) return Object.assign(base, { ok: false, reason: 'overload' });
        if (quoted.beyond) return Object.assign(base, { ok: false, reason: 'beyond' });
        if ($gameSystem.getKnowledge() < owed) return Object.assign(base, { ok: false, reason: 'knowledge' });
        if (have < quoted.statReq) return Object.assign(base, { ok: false, reason: 'stat' });
        if (!this._craftEditingId && this.craftedEntries(build.kind).length >= CRAFT_MAX_PER_ACTOR) {
            return Object.assign(base, { ok: false, reason: 'full' });
        }
        return Object.assign(base, { ok: true });
    };

    Proto.craftWrite = function () {
        const verdict = this.craftCanWrite();
        if (!verdict.ok) { SoundManager.playBuzzer(); this.refreshUISkillDOM(); return; }
        const actor = this.getTeachActor();
        const existing = this._craftEditingId ? $dataSkills[this._craftEditingId] : null;

        if (verdict.owed > 0) $gameSystem.spendKnowledge(verdict.owed);
        const entry = buildCraftedSkill(this._craft, actor.actorId(), existing);

        if (existing) $gameSystem.updateCustomSpell(entry);
        else $gameSystem.addCustomSpell(entry);

        if (!actor.isLearnedSkill(entry.id)) actor.learnSkill(entry.id);
        if (this.invalidateLearnedSkillCaches) this.invalidateLearnedSkillCaches();
        this._craftIcons = null;
        this._craftEditingId = entry.id;
        this._craftBaseQuote = verdict.quote;
        SoundManager.playRecovery();

        if (typeof T === 'function' && window.ParchmentToast) {
            window.ParchmentToast.show(tr(existing ? 'rewrittenResult' : 'writtenResult', {
                name: entry.name, cost: verdict.owed, left: $gameSystem.getKnowledge()
            }), { severity: 'good' });
        }
        window.skipLocalization = false;
        this.refreshUISkillDOM();
    };

    // Unmaking a crafted entry hands back nothing: the tags were spent
    // on the writing, not lent to it. It exists so a full bench can be cleared.
    Proto.craftDiscard = function (skillId) {
        const actor = this.getTeachActor();
        const entry = $dataSkills[skillId];
        if (!actor || !entry || !entry._crafted) { SoundManager.playBuzzer(); return; }
        actor.forgetSkill(skillId);
        $gameSystem.removeCustomSpell(skillId);
        if (this.invalidateLearnedSkillCaches) this.invalidateLearnedSkillCaches();
        if (this._craftEditingId === skillId) {
            this._craftEditingId = null;
            this._craftBaseQuote = null;
        }
        // The list shrank under the cursor: the next entry slides into its
        // row, and the chip goes back to the harmless one so a second OK
        // does not discard that one too. A cursor past the last row is
        // brought back onto it.
        this._craftChip = 0;
        this._craftFocus = Math.max(0, Math.min(this._craftFocus || 0, this.craftFocusRows() - 1));
        SoundManager.playCancel();
        this.refreshUISkillDOM();
    };


    //=========================================================================
    // Drawing
    //=========================================================================

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    const CRAFT_SECTION_ICONS = {
        identity: 224, core: 79, element: 64, power: 176, shape: 190, rider: 87,
        refine: 193, payoff: 77, mechanic: 83, entries: 183
    };
    // The icon sheet is a grid this many across (.sm-kit-icon-grid in theme.css).
    const CRAFT_ICON_COLS = 8;
    SkillMaster.CRAFT_ICON_COLS = CRAFT_ICON_COLS;
    const CRAFT_PREVIEW_CANVAS = 'sm-craft-inspect-canvas';

    // The chips of one group's row: the tags the build carries in it, then the
    // add chip that opens the catalogue on that group.
    Proto.craftChipRows = function (group) {
        const build = this._craft;
        if (!build) return [];
        const rows = build.tags.filter(k => groupOf(k) === group).map(k => ({ key: k }));
        rows.push({ key: ADD_CHIP, add: true });
        return rows;
    };

    // Which chip of a row the pad cursor stands on.
    Proto.craftChipCursor = function (group) {
        const rows = this.craftChipRows(group);
        if (!rows.length) return 0;
        const store = this._craftChipAt || (this._craftChipAt = {});
        const at = store[group] == null ? 0 : store[group];
        return Math.max(0, Math.min(rows.length - 1, at | 0));
    };

    // A tag chip on a row that takes one (core, shape) swaps it; on any other
    // row it takes the tag off. The add chip opens the catalogue.
    Proto.craftPickChip = function (group, key) {
        const rows = this.craftChipRows(group);
        const at = rows.findIndex(r => r.key === key);
        if (at < 0) { SoundManager.playBuzzer(); return; }
        (this._craftChipAt || (this._craftChipAt = {}))[group] = at;
        this._craftFocus = CRAFT_ROWS.indexOf(group);
        if (key === ADD_CHIP || SINGLE_GROUPS.includes(group)) this.openCraftCatalogue(group);
        else this.craftRemoveTag(key);
    };

    // One line that says everything a tag is.
    Proto.craftChipInfo = function (group, key) {
        if (key === ADD_CHIP) return tr('addHint', { group: tr('group.' + group) });
        const def = tagDef(key);
        if (!def) return '';
        return tr('chipInfo', {
            name: tagName(key), desc: tagInfo(key), kp: def.kp || 0, cx: (def.cx || 0).toFixed(1)
        }) + ' ' + (SINGLE_GROUPS.includes(group) ? tr('chipSwap') : tr('chipRemove'));
    };

    // A pointer resting on a chip reads it out under the row, without
    // redrawing the page under the pointer.
    Proto.craftHoverChip = function (group, key) {
        const note = document.getElementById('craft-note-' + group);
        if (note) note.textContent = this.craftChipInfo(group, key);
    };

    Proto.craftRowNote = function (group) {
        if (!this._craftPicker && CRAFT_ROWS[this._craftFocus] === group) {
            const row = this.craftChipRows(group)[this.craftChipCursor(group)];
            if (row) return this.craftChipInfo(group, row.key);
        }
        return tr('groupHint.' + group, { max: groupMax(group, this._craft ? this._craft.kind : 'spell') });
    };

    Proto.craftSetStep = function (step) {
        step = Math.max(0, Math.min(5, step | 0));
        this._craftStep = step;
        const focusMap = {
            0: CRAFT_ROWS.indexOf('core'),
            1: CRAFT_ROWS.indexOf('element'),
            2: CRAFT_ROWS.indexOf('shape'),
            3: CRAFT_ROWS.indexOf('power'),
            4: CRAFT_ROWS.indexOf('name'),
            5: 0
        };
        if (focusMap[step] !== undefined && focusMap[step] >= 0) {
            this._craftFocus = focusMap[step];
        }
        SoundManager.playCursor();
        this.refreshUISkillDOM();
    };

    Proto.craftNextStep = function () {
        const cur = (this._craftStep === undefined) ? 0 : this._craftStep;
        if (cur < 4) this.craftSetStep(cur + 1);
        else if (cur === 4) this.craftWrite();
    };

    Proto.craftPrevStep = function () {
        const cur = (this._craftStep === undefined) ? 0 : this._craftStep;
        if (cur > 0) this.craftSetStep(cur - 1);
    };

    Proto.craftStepPickTag = function (group, key) {
        const build = this._craft;
        if (!build) return;
        if (key === 'none_element') {
            const currentElem = build.tags.find(k => groupOf(k) === 'element');
            if (currentElem) this.craftRemoveTag(currentElem);
            else SoundManager.playOk();
            return;
        }
        if (key === 'none_power') {
            const currentPow = build.tags.find(k => groupOf(k) === 'power');
            if (currentPow) this.craftRemoveTag(currentPow);
            else SoundManager.playOk();
            return;
        }
        if (build.tags.includes(key)) {
            if (group === 'element' || group === 'power') {
                this.craftRemoveTag(key);
            } else {
                SoundManager.playOk();
            }
            return;
        }
        this.craftAddTag(key);
    };

    Proto.renderCraftStepperHTML = function () {
        const build = this._craft;
        const cur = (this._craftStep === undefined) ? 0 : this._craftStep;
        const isDone = (s) => {
            if (!build) return false;
            if (s === 0) return build.tags.some(k => groupOf(k) === 'core');
            if (s === 1) return build.tags.some(k => groupOf(k) === 'element');
            if (s === 2) return build.tags.some(k => groupOf(k) === 'shape');
            if (s === 3) return build.tags.some(k => ['power', 'rider', 'refine', 'payoff', 'mechanic'].includes(groupOf(k)));
            if (s === 4) return !!build.name;
            return false;
        };
        const stepKeys = ['core', 'element', 'shape', 'modifiers', 'identity'];
        const items = stepKeys.map((key, idx) => {
            const active = cur === idx;
            const done = isDone(idx);
            const num = idx + 1;
            const label = tr('step.' + key);
            return `
                <div class="sm-craft-step-tab focusable ${active ? 'active' : ''} ${done ? 'is-done' : ''}"
                     onclick="SceneManager._scene.craftSetStep(${idx})" title="${esc(label)}">
                    <span class="sm-craft-step-num">${num}</span>
                    <span class="sm-craft-step-label">${esc(label)}</span>
                </div>`;
        });
        items.push(`
            <div class="sm-craft-step-tab sm-craft-step-all focusable ${cur === 5 ? 'active' : ''}"
                 onclick="SceneManager._scene.craftSetStep(5)" title="${esc(tr('step.all'))}">
                <span class="sm-craft-step-label">${esc(tr('step.all'))}</span>
            </div>`);
        return `<div class="sm-craft-stepper">${items.join('')}</div>`;
    };

    Proto.renderCraftStepOptionsHTML = function (group) {
        const build = this._craft;
        if (!build) return '';
        const rows = this.craftCatalogueRows(group);
        let html = '';
        if (group === 'element') {
            const hasElem = build.tags.some(k => groupOf(k) === 'element');
            html += `
                <div class="sm-craft-card-opt focusable ${!hasElem ? 'selected' : ''}"
                     onclick="SceneManager._scene.craftStepPickTag('element', 'none_element')"
                     title="${esc(tr('step.noneElementDesc'))}">
                    <div class="sm-craft-opt-header">
                        <strong class="sm-craft-opt-name">${esc(tr('step.noneElement'))}</strong>
                        <span class="sm-craft-opt-cost">0 KP</span>
                    </div>
                    <div class="sm-craft-opt-desc">${esc(tr('step.noneElementDesc'))}</div>
                </div>`;
        }
        rows.forEach(row => {
            const isChosen = row.have;
            const isShut = !isChosen && !row.verdict.ok;
            const costHint = row.def.kp ? `${row.def.kp} KP` : '';
            const cxHint = row.def.cx ? `+${row.def.cx.toFixed(1)} cx` : '';
            const badges = [costHint, cxHint].filter(Boolean).join(' · ');
            html += `
                <div class="sm-craft-card-opt focusable ${isChosen ? 'selected' : ''} ${isShut ? 'is-shut' : ''}"
                     onclick="SceneManager._scene.craftStepPickTag('${group}', '${row.key}')"
                     title="${esc(tagInfo(row.key))}">
                    <div class="sm-craft-opt-header">
                        <strong class="sm-craft-opt-name">${esc(tagName(row.key))}</strong>
                        ${badges ? `<span class="sm-craft-opt-cost">${esc(badges)}</span>` : ''}
                    </div>
                    <div class="sm-craft-opt-desc">${esc(tagInfo(row.key))}</div>
                    ${isShut ? `<div class="sm-craft-opt-shut">${esc(whyText(row.verdict))}</div>` : ''}
                </div>`;
        });
        return `<div class="sm-craft-opts-grid">${html}</div>`;
    };

    Proto.renderCraftStepNavHTML = function (curStep, verdict, owed) {
        if (curStep === 5) return '';
        const hasPrev = curStep > 0;
        const isLast = curStep === 4;
        const prevBtn = hasPrev
            ? `<div class="inspect-btn focusable sm-craft-nav-btn sm-craft-nav-prev" onclick="SceneManager._scene.craftPrevStep()">&lt; ${esc(tr('step.prev'))}</div>`
            : `<div class="sm-craft-nav-spacer"></div>`;
        const nextBtn = !isLast
            ? `<div class="inspect-btn focusable sm-craft-nav-btn sm-craft-nav-next" onclick="SceneManager._scene.craftNextStep()">${esc(tr('step.next'))} &gt;</div>`
            : `<div class="inspect-btn focusable sm-craft-nav-btn sm-craft-nav-write ${verdict.ok ? '' : 'unusable'}" onclick="SceneManager._scene.craftWrite()">
                 ${esc(this._craftEditingId ? tr('rewrite') : tr('writeIt'))} <span class="sm-forge-cost">&middot; ${owed} KP</span>
               </div>`;
        return `
            <div class="sm-craft-step-nav">
                ${prevBtn}
                ${nextBtn}
            </div>`;
    };

    Proto.renderCraftBench = function (knowledge) {
        const leftBox = document.getElementById('left-page-content');
        const rightBox = document.getElementById('right-page-content');
        if (!leftBox || !rightBox) return;
        const actor = this.getTeachActor();
        const build = this._craft;
        if (!actor || !build) return;
        const K = SkillMaster.BenchKit;

        const spell = build.kind !== 'skill';
        const quoted = craftQuote(build);
        const verdict = this.craftCanWrite();
        const picking = this._craftPicker;
        const focusOn = (row) => !picking && this._craftFocus === CRAFT_ROWS.indexOf(row);
        const rowLabelOf = (row) => {
            const rowLabel = (row === 'lore' && spell) ? tr('row.incantation') : tr('row.' + row);
            return rowLabel;
        };
        const activate = (row) => `SceneManager._scene.craftActivateRow(${CRAFT_ROWS.indexOf(row)})`;

        const curStep = (this._craftStep === undefined) ? 0 : this._craftStep;
        const isStepMode = curStep !== 5;

        // Who the entry is: five triggers in one compact block.
        const anim = (build.animationId && typeof $dataAnimations !== 'undefined' && $dataAnimations)
            ? $dataAnimations[build.animationId] : null;
        const identHTML = `
            <div class="sm-kit-ident">
                ${K.trigger({ label: rowLabelOf('name'), cls: 'sm-kit-span2', focused: focusOn('name'),
                    value: build.name || tr(spell ? 'defaultSpellName' : 'defaultSkillName'), muted: !build.name,
                    iconIndex: build.iconIndex, onclick: activate('name') })}
                ${K.trigger({ label: rowLabelOf('icon'), focused: focusOn('icon'),
                    value: build.iconIndex ? '#' + build.iconIndex : tr('none'), muted: !build.iconIndex,
                    onclick: activate('icon') })}
                ${K.trigger({ label: rowLabelOf('animation'), focused: focusOn('animation'),
                    value: anim ? anim.name : tr('none'), muted: !anim, onclick: activate('animation') })}
                ${K.trigger({ label: rowLabelOf('description'), cls: 'sm-kit-span2', focused: focusOn('description'),
                    value: build.description || tr('autoWritten'), muted: !build.description, onclick: activate('description') })}
                ${K.trigger({ label: rowLabelOf('lore'), cls: 'sm-kit-span2', focused: focusOn('lore'),
                    value: build.lore || tr('unwritten'), muted: !build.lore, onclick: activate('lore') })}
            </div>`;

        // One section per tag group: the tags the build carries as chips, and
        // the add chip at the end of the row.
        const chipSection = (group) => {
            const focused = focusOn(group);
            const cursor = this.craftChipCursor(group);
            const chips = this.craftChipRows(group).map((r, k) => ({
                label: r.add ? (SINGLE_GROUPS.includes(group) ? tr('swapChip') : tr('addChip')) : tagName(r.key),
                selected: !r.add,
                cursor: focused && k === cursor,
                hover: `SceneManager._scene.craftHoverChip('${group}', '${r.key}')`,
                onclick: `SceneManager._scene.craftPickChip('${group}', '${r.key}')`
            }));
            const held = build.tags.filter(k => groupOf(k) === group).length;
            return K.section({
                icon: CRAFT_SECTION_ICONS[group], title: tr('group.' + group),
                badge: `${held}/${groupMax(group, build.kind)}`,
                body: K.chips(chips), note: this.craftRowNote(group), noteId: 'craft-note-' + group,
                cls: focused ? 'sm-kit-section--focused' : ''
            });
        };

        const owed = verdict.owed !== undefined ? verdict.owed : quoted.price;
        const statName = window.SkillStatReq ? window.SkillStatReq.statName(quoted.statKey) : quoted.statKey;
        let blockText = verdict.ok ? '' : tr('blocked.' + verdict.reason, {
            stat: statName, need: quoted.statReq, why: verdict.why || '',
            have: verdict.have !== undefined ? verdict.have : 0, max: CRAFT_MAX_PER_ACTOR
        });
        if (this._craftDropped && this._craftDropped.length) {
            blockText = (blockText ? blockText + ' ' : '') + tr('dropped', { tags: this._craftDropped.map(tagName).join(', ') });
        }
        const actionsHTML = `
            <div class="inspect-actions sm-forge-actions" style="${(curStep === 4 || curStep === 5) ? '' : 'display:none;'}">
                <div class="inspect-btn focusable ${focusOn('catalogue') ? 'selected' : ''}" onclick="SceneManager._scene.openCraftCatalogue(null)">${esc(tr('catalogue'))}</div>
                <div class="inspect-btn focusable ${focusOn('randomize') ? 'selected' : ''}" onclick="SceneManager._scene.craftRandomize()">${esc(tr('randomize'))}</div>
                <div class="inspect-btn focusable ${focusOn('create') ? 'selected' : ''} ${verdict.ok ? '' : 'unusable'}" onclick="SceneManager._scene.craftWrite()">
                    ${esc(this._craftEditingId ? tr('rewrite') : tr('writeIt'))} <span class="sm-forge-cost">&middot; ${owed} KP</span>
                </div>
            </div>
            ${blockText ? `<div class="sm-craft-block">${esc(blockText)}</div>` : ''}`;

        const craftTitle = spell ? tr('titleSpell') : tr('titleSkill');
        const stepPanesHTML = `
            <div class="sm-craft-step-pane" data-step="0" style="${curStep === 0 || curStep === 5 ? '' : 'display:none;'}">
                ${isStepMode ? `<div class="sm-craft-step-intro"><strong>${esc(tr('step.core'))}</strong>: ${esc(tr('step.stepHint.core'))}</div>` : ''}
                ${chipSection('core')}
                ${this.renderCraftStepOptionsHTML('core')}
                ${this.renderCraftStepNavHTML(0, verdict, owed)}
            </div>
            <div class="sm-craft-step-pane" data-step="1" style="${curStep === 1 || curStep === 5 ? '' : 'display:none;'}">
                ${isStepMode ? `<div class="sm-craft-step-intro"><strong>${esc(tr('step.element'))}</strong>: ${esc(tr('step.stepHint.element'))}</div>` : ''}
                ${chipSection('element')}
                ${this.renderCraftStepOptionsHTML('element')}
                ${this.renderCraftStepNavHTML(1, verdict, owed)}
            </div>
            <div class="sm-craft-step-pane" data-step="2" style="${curStep === 2 || curStep === 5 ? '' : 'display:none;'}">
                ${isStepMode ? `<div class="sm-craft-step-intro"><strong>${esc(tr('step.shape'))}</strong>: ${esc(tr('step.stepHint.shape'))}</div>` : ''}
                ${chipSection('shape')}
                ${this.renderCraftStepOptionsHTML('shape')}
                ${this.renderCraftStepNavHTML(2, verdict, owed)}
            </div>
            <div class="sm-craft-step-pane" data-step="3" style="${curStep === 3 || curStep === 5 ? '' : 'display:none;'}">
                ${isStepMode ? `<div class="sm-craft-step-intro"><strong>${esc(tr('step.modifiers'))}</strong>: ${esc(tr('step.stepHint.modifiers'))}</div>` : ''}
                ${chipSection('power')}
                ${this.renderCraftStepOptionsHTML('power')}
                ${chipSection('rider')}
                ${chipSection('refine')}
                ${chipSection('payoff')}
                ${chipSection('mechanic')}
                ${this.renderCraftStepNavHTML(3, verdict, owed)}
            </div>
            <div class="sm-craft-step-pane" data-step="4" style="${curStep === 4 || curStep === 5 ? '' : 'display:none;'}">
                ${isStepMode ? `<div class="sm-craft-step-intro"><strong>${esc(tr('step.identity'))}</strong>: ${esc(tr('step.stepHint.identity'))}</div>` : ''}
                ${K.section({ icon: CRAFT_SECTION_ICONS.identity, title: tr('identity'), body: identHTML })}
                ${this.renderCraftStepNavHTML(4, verdict, owed)}
            </div>`;

        leftBox.innerHTML = `
            <div class="page-header-bar sm-bench-header">
              <div class="back-button focusable" onclick="SceneManager._scene.closeCraftBench()">${esc(tr('back'))}</div>
              <h2 class="title">${esc(craftTitle)}</h2>
              <div class="sm-bench-kp-pill"><strong>${knowledge} KP</strong></div>
            </div>
            <div class="backpack-tabs-row sm-bench-tabs">
              <div class="backpack-tab sm-bench-tab focusable ${spell ? 'active' : ''}" onclick="SceneManager._scene.openCraftBench('spell')">${esc(tr('titleSpell'))}</div>
              <div class="backpack-tab sm-bench-tab focusable ${!spell ? 'active' : ''}" onclick="SceneManager._scene.openCraftBench('skill')">${esc(tr('titleSkill'))}</div>
            </div>
            ${this.renderCraftStepperHTML()}
            <div id="craft-form-box" class="ui-scroll sm-kit-scroll sm-craft-rows">
                ${stepPanesHTML}
            </div>
            ${actionsHTML}`;

        if (picking) {
            rightBox.innerHTML = this.renderCraftPickerHTML(picking);
            if (picking === 'animation') this.setupCraftAnimPreview();
            return;
        }

        const entries = this.craftedEntries(build.kind);
        let listHTML = '';
        entries.forEach((s, at) => {
            const on = this._craftEditingId === s.id;
            // Two rings, and they mean different things: "focused" is the entry
            // the cursor is on, "selected" is which of its two chips the OK key
            // would press. Left and right walk between them.
            const cursor = this._craftFocus === CRAFT_ROWS.length + at;
            const chip = (which) => (cursor && this._craftChip === which) ? ' selected' : '';
            listHTML += `
                <div class="sm-skill-row sm-craft-entry focusable ${on ? 'focused' : ''}${cursor ? ' sm-craft-entry--cursor' : ''}">
                    <span class="sm-skill-ident" onclick="SceneManager._scene.openCraftBench('${build.kind}', ${s.id})"><span class="sm-skill-icon" style="${SkillMaster.getSkillIconStyle(s.iconIndex)}"></span><span class="sm-skill-name">${esc(s.name)}</span></span>
                    <span class="ui-chip sm-skill-badge${chip(0)}" onclick="SceneManager._scene.openCraftBench('${build.kind}', ${s.id})">${esc(tr('edit'))}</span>
                    <span class="ui-chip sm-skill-badge sm-craft-discard${chip(1)}" onclick="SceneManager._scene.craftDiscard(${s.id})">${esc(tr('discard'))}</span>
                </div>`;
        });
        if (!listHTML) listHTML = `<div class="ui-empty"><div class="ui-empty-text">${esc(tr('noneYet'))}</div></div>`;

        rightBox.innerHTML = `
            ${this.renderCraftPreviewHTML(quoted, verdict)}
            ${K.section({
                icon: CRAFT_SECTION_ICONS.entries, title: spell ? tr('yourSpells') : tr('yourSkills'),
                badge: `${entries.length}/${CRAFT_MAX_PER_ACTOR}`, cls: 'sm-kit-entries',
                body: `<div id="craft-entries-box" class="ui-list ui-scroll sm-forged-list">${listHTML}</div>`
            })}`;
        if (this._craftPreviewIcon && window.ItemInspect && window.ItemInspect.drawIcon) {
            window.ItemInspect.drawIcon(this._craftPreviewIcon, CRAFT_PREVIEW_CANVAS);
        }
    };

    Proto.renderCraftPickerHTML = function (group) {
        const build = this._craft;
        const rows = this.craftPickerRows(group);
        let html = '';

        // The icons are a sheet to look at, not a list to read: a grid of the
        // glyphs themselves, the one worn now ringed.
        if (group === 'icon') {
            rows.forEach((row, k) => {
                const focused = this._craftPickIndex === k;
                const chosen = row.iconIndex === build.iconIndex;
                html += `
                    <div class="sm-kit-icon-cell focusable ${focused ? 'focused' : ''} ${chosen ? 'selected' : ''}" title="#${row.iconIndex}" onclick="SceneManager._scene.craftChoose('icon', ${k})">
                        <span class="sm-skill-icon" style="${SkillMaster.getSkillIconStyle(row.iconIndex)}"></span>
                    </div>`;
            });
            if (!html) html = `<div class="ui-empty"><div class="ui-empty-text">${esc(tr('nothingToBuy'))}</div></div>`;
            return `
                <div class="ui-detail">
                    <div class="ui-detail-head">
                        <div class="ui-detail-titles"><h3 class="sm-detail-name">${esc(tr('pick.icon'))}</h3></div>
                        <div class="inspect-btn focusable" onclick="SceneManager._scene.closeCraftPicker()">${esc(tr('cancel'))}</div>
                    </div>
                    <div id="craft-pick-box" class="ui-detail-scroll ui-scroll sm-kit-icon-grid">${html}</div>
                </div>`;
        }

        // An animation is chosen by eye: the bench plays it over the writer's
        // face on the forge's own stage, and the pick is only taken on Use.
        if (group === 'animation') {
            rows.forEach((row, k) => {
                const focused = this._craftPickIndex === k;
                html += `
                    <div class="sm-skill-row anim-row focusable ${focused ? 'focused' : ''}" data-idx="${k}" onclick="SceneManager._scene.craftAnimHighlight(${k})">
                        <span class="sm-skill-name">${esc(row.name)}</span>
                        <span class="sm-skill-cost">#${row.id}</span>
                    </div>`;
            });
            const actor = this.getTeachActor();
            const cur = rows[this._craftPickIndex] || rows[0];
            return `
                <div class="ui-detail">
                    <div class="ui-detail-head">
                        <div class="ui-detail-titles"><h3 class="sm-detail-name">${esc(tr('pick.animation'))}</h3></div>
                    </div>
                    ${actor ? this.animStageHTML(actor, cur, 'craft-anim-canvas', 'craft-pick-box-label') : ''}
                    <div id="craft-pick-box" class="ui-list ui-scroll sm-anim-list">${html}</div>
                    <div class="inspect-actions ui-panel-actions sm-anim-actions">
                        <div class="inspect-btn focusable" onclick="SceneManager._scene.craftConfirmAnim()">${esc(tr('use'))}</div>
                        <div class="inspect-btn focusable" onclick="SceneManager._scene.closeCraftPicker()">${esc(tr('cancel'))}</div>
                    </div>
                </div>`;
        }

        // The catalogue as a list: every tag, the refused ones greyed with
        // the reason in place of their price.
        let lastGroup = null;
        rows.forEach((row, k) => {
            const focused = this._craftPickIndex === k;
            const shut = row.have || !row.verdict.ok;
            if (row.def.group !== lastGroup) {
                html += `<div class="cc-pick-group">${esc(tr('group.' + row.def.group))}</div>`;
                lastGroup = row.def.group;
            }
            html += `
                <div class="sm-skill-row focusable ${focused ? 'focused' : ''} ${row.have ? 'selected' : ''} ${shut ? 'is-shut' : ''}" onclick="SceneManager._scene.craftChoose('tags', ${k})">
                    <span class="sm-skill-ident"><span class="sm-skill-name">${esc(tagName(row.key))}</span></span>
                    <span class="sm-skill-cost">${esc(this.craftCatalogueHint(row))}</span>
                </div>`;
        });
        if (!html) html = `<div class="ui-empty"><div class="ui-empty-text">${esc(tr('nothingToBuy'))}</div></div>`;
        const focusedRow = rows[this._craftPickIndex];
        const blurb = focusedRow ? `<div class="ui-prose">${esc(tagInfo(focusedRow.key))}</div>` : '';
        return `
            <div class="ui-detail">
                <div class="ui-detail-head">
                    <div class="ui-detail-titles"><h3 class="sm-detail-name">${esc(this._craftPickGroup ? tr('pick.' + this._craftPickGroup) : tr('pick.catalogue'))}</h3></div>
                    <div class="inspect-btn focusable" onclick="SceneManager._scene.closeCraftPicker()">${esc(tr('cancel'))}</div>
                </div>
                ${blurb}
                <div id="craft-pick-box" class="ui-detail-scroll ui-scroll sm-candidate-list">${html}</div>
            </div>`;
    };

    Proto.craftAnimHighlight = function (k) {
        const rows = this.craftPickerRows('animation');
        if (!rows.length) return;
        k = ((k % rows.length) + rows.length) % rows.length;
        this._craftPickIndex = k;
        this.highlightAnimRow('craft-pick-box', k, rows[k].id, rows);
    };

    Proto.craftConfirmAnim = function () {
        if (window.SkillAnimPreview) window.SkillAnimPreview.dispose();
        this.craftChoose('animation', this._craftPickIndex);
    };

    Proto.setupCraftAnimPreview = function () {
        const rows = this.craftPickerRows('animation');
        const cur = rows[this._craftPickIndex] || rows[0];
        if (!cur) return;
        this.lightAnimStage('craft-anim-canvas', cur.id,
            () => this._viewMode === 'craft' && this._craftPicker === 'animation');
    };


    // The live preview: the price and the floor as stat boxes, then the
    // entry read on the very card the skills menu draws (SkillDetails.card),
    // so what the bench shows is what the book will show.
    Proto.renderCraftPreviewHTML = function (quoted, verdict) {
        const build = this._craft;
        const actor = this.getTeachActor();
        const K = SkillMaster.BenchKit;
        const spell = build.kind !== 'skill';
        const preview = buildCraftedSkill(build, actor.actorId(), { id: 0 });
        const statName = window.SkillStatReq ? window.SkillStatReq.statName(quoted.statKey) : quoted.statKey;
        const have = verdict.have !== undefined ? verdict.have : craftBaseStat(actor, quoted.paramId);
        const short = have < quoted.statReq;
        this._craftPreviewIcon = preview.iconIndex;

        const boxes = K.stats([
            { label: spell ? tr('mpLabel') : tr('apLabel'), value: spell ? preview.mpCost : preview.tpCost, bad: quoted.overload },
            { label: tr('price'), value: `${verdict.owed !== undefined ? verdict.owed : quoted.price} KP`, bad: verdict.reason === 'knowledge' },
            { label: tr('statFloor'), value: `${statName} ${quoted.statReq}`, bad: short },
            { label: tr('yourStat'), value: `${statName} ${have}`, bad: short },
            { label: tr('complexity'), value: quoted.complexity.toFixed(1) },
            { label: tr('powerLabel'), value: quoted.power ? `${quoted.power} / ${quoted.owed}` : tr('offCurve') },
            { label: tr('tagCount'), value: build.tags.length }
        ]);

        let card = '';
        if (window.SkillDetails && typeof window.SkillDetails.card === 'function') {
            try {
                card = window.SkillDetails.card(preview, actor, { canvasId: CRAFT_PREVIEW_CANVAS, subtitle: tr('preview') });
            } catch (e) { card = ''; }
        }
        if (!card) {
            card = `
                <div class="ui-detail-head">
                    <div class="ui-detail-titles">
                        <h3 class="sm-detail-name">${esc(preview.name)}</h3>
                        <div class="sm-detail-meta">${esc(tr('preview'))}</div>
                    </div>
                </div>
                <div class="ui-prose sm-kit-prose">${esc(preview.description)}</div>`;
        }

        return `
            <div class="ui-detail sm-fuse-preview sm-kit-preview">
                ${boxes}
                <div class="sm-craft-card">${card}</div>
                <div class="sm-kit-formula"><span class="cc-stat-label">${esc(tr('formula'))}</span> <code>${esc(preview.damage.formula)}</code></div>
                <div class="cc-bio-note sm-kit-note">${esc(tr('benchBlurb', { stat: statName }))}</div>
            </div>`;
    };

    //=========================================================================
    // Input
    //=========================================================================

    Proto.craftActivateRow = function (idx) {
        this._craftFocus = idx;
        const entry = this.craftFocusedEntry();
        if (entry) {
            if (this._craftChip === 1) this.craftDiscard(entry.id);
            else this.openCraftBench(this._craft ? this._craft.kind : 'spell', entry.id);
            return;
        }
        const row = CRAFT_ROWS[idx];
        if (row === 'name' || row === 'description' || row === 'lore') this.openCraftTextSheet(row);
        else if (row === 'randomize') this.craftRandomize();
        else if (row === 'create') this.craftWrite();
        else if (row === 'catalogue') this.openCraftCatalogue(null);
        else if (CRAFT_CHIP_ROWS.includes(row)) {
            // OK on a row of chips presses the chip under the cursor.
            const chip = this.craftChipRows(row)[this.craftChipCursor(row)];
            if (chip) this.craftPickChip(row, chip.key);
            else SoundManager.playBuzzer();
        }
        else this.openCraftPicker(row);
    };

    Proto.updateCraftBenchInput = function () {
        if (this._craftTyping) return;

        // The catalogue sheet is modal: while it is up it reads the pad itself.
        if (window.CCPick && window.CCPick.isOpen && window.CCPick.isOpen()) {
            window.CCPick.pollInput();
            return;
        }

        // The name warning is a sheet of its own: OK keeps the name, Cancel
        // goes back to the field. Nothing else on the bench answers while it is up.
        if (this._craftWarnEl) {
            if (Input.isTriggered('ok')) this.closeCraftNameWarning(false);
            else if (Input.isTriggered('cancel') || Input.isTriggered('escape')) this.closeCraftNameWarning(true);
            return;
        }

        const pressed = (dir) => Input.isTriggered(dir) || Input.isRepeated(dir);

        if (this._craftPicker) {
            const rows = this.craftPickerRows(this._craftPicker);
            const max = rows.length;
            if (Input.isTriggered('cancel') || Input.isTriggered('escape') || TouchInput.isCancelled()) {
                this.closeCraftPicker();
                return;
            }
            if (!max) return;
            if (this._craftPicker === 'animation') {
                if (Input.isTriggered('ok')) { this.craftConfirmAnim(); return; }
                if (Input.isTriggered('down') || Input.isRepeated('down')) this.craftAnimHighlight(this._craftPickIndex + 1);
                else if (Input.isTriggered('up') || Input.isRepeated('up')) this.craftAnimHighlight(this._craftPickIndex - 1);
                return;
            }
            if (Input.isTriggered('ok')) { this.craftChoose(this._craftPicker, this._craftPickIndex); return; }
            const prev = this._craftPickIndex;
            // The icon sheet is a grid: left and right walk a line of it, up
            // and down a column. Every other list is one column.
            const step = this._craftPicker === 'icon' ? CRAFT_ICON_COLS : 1;
            if (pressed('down')) this._craftPickIndex = Math.min(max - 1, this._craftPickIndex + step);
            else if (pressed('up')) this._craftPickIndex = Math.max(0, this._craftPickIndex - step);
            else if (step > 1 && pressed('right')) this._craftPickIndex = (this._craftPickIndex + 1) % max;
            else if (step > 1 && pressed('left')) this._craftPickIndex = (this._craftPickIndex - 1 + max) % max;
            if (step === 1 && this._craftPickIndex === prev) {
                if (pressed('down')) this._craftPickIndex = 0;
                else if (pressed('up')) this._craftPickIndex = max - 1;
            }
            if (this._craftPickIndex !== prev) {
                SoundManager.playCursor();
                this.refreshUISkillDOM();
                this.scrollToActiveItem('craft-pick-box', '#craft-pick-box .focused');
            }
            return;
        }

        if ((window.CCNav ? window.CCNav.railDir() : 0) !== 0) {
            const nextKind = (this._craft && this._craft.kind === 'skill') ? 'spell' : 'skill';
            this.openCraftBench(nextKind);
            return;
        }

        if (Input.isTriggered('pageup')) {
            this.craftPrevStep();
            return;
        } else if (Input.isTriggered('pagedown')) {
            this.craftNextStep();
            return;
        }

        const max = this.craftFocusRows();
        const prev = this._craftFocus;
        const prevChip = this._craftChip || 0;
        const chipRow = CRAFT_ROWS[this._craftFocus];
        const prevCursor = CRAFT_CHIP_ROWS.includes(chipRow) ? this.craftChipCursor(chipRow) : -1;
        if (Input.isTriggered('cancel') || Input.isTriggered('escape') || TouchInput.isCancelled()) {
            this.closeCraftBench();
            return;
        } else if (Input.isTriggered('ok')) {
            this.craftActivateRow(this._craftFocus);
            return;
        } else if (Input.isTriggered('down') || Input.isRepeated('down')) {
            this._craftFocus = (this._craftFocus + 1) % max;
        } else if (Input.isTriggered('up') || Input.isRepeated('up')) {
            this._craftFocus = (this._craftFocus - 1 + max) % max;
        } else if (this.craftFocusedEntry()
            && (Input.isTriggered('right') || Input.isTriggered('left'))) {
            // Only a finished entry has anything to step sideways to.
            this._craftChip = this._craftChip ? 0 : 1;
        } else if (prevCursor >= 0 && (pressed('right') || pressed('left'))) {
            // On a row of chips, left and right walk the chips; OK presses one.
            const n = this.craftChipRows(chipRow).length;
            if (n) this._craftChipAt[chipRow] = (prevCursor + (pressed('right') ? 1 : -1) + n) % n;
        }
        // Coming onto an entry row always offers the harmless chip first, so a
        // held Down can never land the cursor on Discard.
        if (this._craftFocus !== prev) this._craftChip = 0;
        if (this._craftStep !== 5 && this._craftFocus !== prev) {
            const row = CRAFT_ROWS[this._craftFocus];
            if (row === 'core') this._craftStep = 0;
            else if (row === 'element') this._craftStep = 1;
            else if (row === 'shape') this._craftStep = 2;
            else if (['power', 'rider', 'refine', 'payoff', 'mechanic', 'catalogue'].includes(row)) this._craftStep = 3;
            else if (['name', 'icon', 'animation', 'description', 'lore', 'randomize', 'create'].includes(row)) this._craftStep = 4;
        }
        const cursorMoved = prevCursor >= 0 && this._craftFocus === prev && this.craftChipCursor(chipRow) !== prevCursor;
        if (this._craftFocus !== prev || this._craftChip !== prevChip || cursorMoved) {
            SoundManager.playCursor();
            this.refreshUISkillDOM();
            if (this.craftFocusedEntry()) {
                this.scrollToActiveItem('craft-entries-box', '#craft-entries-box .sm-craft-entry--cursor');
            } else {
                this.scrollToActiveItem('craft-form-box',
                    '#craft-form-box .sm-kit-section--focused, #craft-form-box .sm-kit-trigger.focused');
            }
        }
    };

    // Any skill the character already knows can be given a description and a
    // piece of lore in the player's own words. The entry in the database is
    // not theirs to keep, so only the two strings are stored, and they are
    // laid back over $dataSkills on every load.
    Proto.rewriteActionsHTML = function (skill) {
        if (!skill || skill.id === 1 || skill.id === 2) return '';
        return `
            <div class="inspect-actions ui-panel-actions sm-rewrite-actions">
                <div class="inspect-btn focusable" onclick="SceneManager._scene.openCraftTextSheet('description', ${skill.id})">${esc(tr('rewriteDesc'))}</div>
                <div class="inspect-btn focusable" onclick="SceneManager._scene.openCraftTextSheet('lore', ${skill.id})">${esc(tr('rewriteLore'))}</div>
            </div>`;
    };


})();


//=============================================================================
// Module: SkillMasterEnchant.js
//=============================================================================
/*:
 * @target MZ
 * @plugindesc v1.0.0 SkillMaster - the Enchanting bench: binding a spell into a weapon or a piece of equipment.
 * @author Omni-Lex
 *
 * @help
 * The Workbench writes a spell. The Enchanting bench spends one instead: a
 * spell anybody in the party already knows is bound into a piece of gear, and
 * what comes off the bench is a unique artifact nobody else in the world
 * carries. The knowledge is paid once, in KP, and the price is the spell's,
 * not the gear's.
 *
 * Two benches, and the rule that tells them apart is the spell's aim:
 *
 *   Enchant Weapon      offensive and status spells only, the ones that reach
 *                       the enemy line. The spell is cast, free of MP, on
 *                       EVERY critical hit the weapon lands.
 *   Enchant Equipment   protective spells only, the ones that reach your own
 *                       line. The spell answers a critical hit taken, free of
 *                       MP, ONCE per battle per piece.
 *
 * A skill is never bindable. Only a spell is, which here means anything filed
 * under a school Categories.json calls Magic. On the other side of the bench,
 * the vector gun is never a base: VectorGunSystem rewrites that row's form,
 * element and model at runtime and a binding would fight it for all three.
 *
 * A weapon or a piece of armour may also, or instead, be given special
 * properties: tags out of window.SkillTags (the one registry the Workbench and
 * the Fusion forge write with), each in its equipment form - an element, an
 * on-hit or resisted state, a stance, Swift, Twinned, Keen, Precise, a brace,
 * a regeneration. They are chosen on chip rows the way the Workbench builds a
 * spell, priced in KP off SkillTags.quote(tags, 'weapon' | 'armor'), written
 * as traits and note tags (window.GearTags.write) and marked <GearTags:>, and
 * read in battle by the engine and by ItemSystemEquipment's GearTags section.
 * A book takes a spell and nothing else: it IS the spell, so a tag would have
 * nothing to ride on.
 *
 * A binding alone buys no damage and no stats. A bound weapon has exactly the
 * numbers it had before. What it gains is the spell, the spell's element in
 * place of its own, and the look that element wears: the bench stamps
 * <ForgeTexture:> on the entry, chosen by element first and by school when
 * the spell carries no element, and WeaponSystemProcedural draws the 3D model
 * in it from then on.
 *
 * The forged entry lives on $gameSystem and is laid back over $dataWeapons /
 * $dataArmors on every load, the same way a crafted spell is.
 */

(() => {
    'use strict';

    window.SkillMaster = window.SkillMaster || {};
    const SkillMaster = window.SkillMaster;

    const tr = (key, params) => (typeof T === 'function' ? T('SkillMaster.enchant.' + key, params) : key);

    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const tx = (s) => (typeof window.translateText === 'function' ? window.translateText(s) : s);

    //=========================================================================
    // What a binding costs
    //
    // The gear is free. The spell is not: the price is read off the same
    // skillPower() the teaching desk charges by, so a cantrip is cheap to bind
    // and an ultimate is not, and the two forbidden ranks cost what they cost
    // everywhere else in the book.
    //=========================================================================

    const ENCH_BASE = 60;
    const ENCH_EXP = 1.7;
    const ENCH_MIN = 120;
    const ENCH_MAX = 250000;
    // A weapon fires its binding on every critical it ever lands; a piece of
    // armour fires once a battle; a book fires whenever it is opened, for
    // nothing, until the day it burns. The bench charges for the difference.
    const ENCH_KIND_MULT = { weapon: 1.5, armor: 1.15, book: 1.35 };
    const ENCH_ESOTERIC_MULT = 6;
    const ENCH_FORBIDDEN_MULT = 40;

    function arcanaMult(skill) {
        const note = String((skill && skill.note) || '');
        if (/<Forbidden>/i.test(note)) return ENCH_FORBIDDEN_MULT; // i18n-ignore: note tag
        if (/<Esoteric>/i.test(note)) return ENCH_ESOTERIC_MULT; // i18n-ignore: note tag
        return 1;
    }

    function enchantCost(skill, kind) {
        if (!skill) return ENCH_MIN;
        const power = (typeof SkillMaster.skillPower === 'function') ? SkillMaster.skillPower(skill) : 1;
        const raw = ENCH_BASE * Math.pow(Math.max(0.1, power), ENCH_EXP) *
            arcanaMult(skill) * (ENCH_KIND_MULT[kind] || 1);
        return Math.max(ENCH_MIN, Math.min(ENCH_MAX, Math.round(raw)));
    }

    //=========================================================================
    // Which spells reach which bench
    //
    // The scope is the whole of it: a spell aimed at the enemy line is a
    // weapon's, a spell aimed at your own line is a piece of armour's. A
    // spell that does nothing to whatever it reaches is neither, because
    // binding it would give the gear an animation and no effect.
    //=========================================================================

    const DMG_HP = 1, DMG_MP = 2, DMG_HP_HEAL = 3, DMG_MP_HEAL = 4, DMG_HP_DRAIN = 5, DMG_MP_DRAIN = 6;
    const EFFECT_RECOVER_HP = 11, EFFECT_RECOVER_MP = 12, EFFECT_GAIN_TP = 13;
    const EFFECT_ADD_STATE = 21, EFFECT_REMOVE_STATE = 22;
    const EFFECT_ADD_BUFF = 31, EFFECT_ADD_DEBUFF = 32;
    const EFFECT_REMOVE_BUFF = 33, EFFECT_REMOVE_DEBUFF = 34;

    function hasEffect(skill, ...codes) {
        const list = (skill && skill.effects) || [];
        return list.some(e => e && codes.indexOf(e.code) >= 0);
    }

    function damageType(skill) {
        return (skill && skill.damage && skill.damage.type) || 0;
    }

    /** A spell is anything filed under a school Categories.json calls Magic. */
    function isSpell(skill) {
        if (!skill || !skill.id) return false;
        if (skill.id === 1 || (SkillMaster.isHiddenSkill ? SkillMaster.isHiddenSkill(skill) : skill.id === 2)) return false;
        const cat = SkillMaster.getSkillCategory ? SkillMaster.getSkillCategory(skill.id) : null;
        if (!cat) return false;
        return SkillMaster.getCategoryType(cat) === 'Magic'; // i18n-ignore: skill category id / type discriminator
    }

    /** Offensive or status: it damages, drains, or lands a state or a debuff. */
    function isOffensiveOrStatus(skill) {
        const scope = (skill && skill.scope) || 0;
        if (scope < 1 || scope > 6) return false;
        const d = damageType(skill);
        if (d === DMG_HP || d === DMG_MP || d === DMG_HP_DRAIN || d === DMG_MP_DRAIN) return true;
        return hasEffect(skill, EFFECT_ADD_STATE, EFFECT_ADD_DEBUFF, EFFECT_REMOVE_BUFF);
    }

    /** Protective: it mends, shields, cleanses or strengthens your own line. */
    function isProtective(skill) {
        const scope = (skill && skill.scope) || 0;
        if (scope < 7 || scope > 11) return false;
        const d = damageType(skill);
        if (d === DMG_HP_HEAL || d === DMG_MP_HEAL) return true;
        return hasEffect(skill, EFFECT_RECOVER_HP, EFFECT_RECOVER_MP, EFFECT_GAIN_TP,
            EFFECT_ADD_STATE, EFFECT_REMOVE_STATE, EFFECT_ADD_BUFF, EFFECT_REMOVE_DEBUFF);
    }

    function bindableTo(skill, kind) {
        if (!isSpell(skill)) return false;
        // A book is not a blade and not a shield: it is simply read out, so
        // the aim of what is written in it does not matter. Any spell binds.
        if (kind === 'book') return true;
        return kind === 'weapon' ? isOffensiveOrStatus(skill) : isProtective(skill);
    }

    //=========================================================================
    // The look a binding wears
    //
    // Element first, school second. The assignments below are a choice, not a
    // derivation: they only have to be stable, so a world that enchanted a
    // blade with fire keeps handing back the same blade.
    //=========================================================================

    const SCHOOL_ELEMENT = {
        Pyromancy: 2, Cryomancy: 3, Electromancy: 4, Technomancy: 4, Technomagical: 4,
        Idromancy: 5, Geomancy: 6, Mutation: 6, Aeromancy: 7,
        HolyMagic: 8, Healing: 8, AstralMagic: 8, Augury: 8, Oneiromancy: 8,
        Necromancy: 9, ForbiddenMagic: 9, VoidMagic: 9, ChaosMagic: 9, Convokation: 9,
        Arcanism: 1, MetaMagic: 1, StatusMagic: 1, Chronomancy: 1, Illusion: 1,
        Fusion: 1, Crafted: 1
    }; // i18n-ignore: skill category ids

    const ELEMENT_TEXTURE = {
        1: 'grey_marble.jpg', 2: 'fire.jpg', 3: 'blue_slate.jpg', 4: 'Thunder10.png',
        5: 'teal_marble.jpg', 6: 'brown_stone.jpg', 7: 'sage_cloud_marble.jpg',
        8: 'bright_gold.jpg', 9: 'dark_grey_smoke.jpg'
    }; // i18n-ignore: texture filenames

    const SCHOOL_TEXTURE = {
        Pyromancy: 'burnt_orange_rock.jpg', Cryomancy: 'grey_teal_stone.jpg',
        Electromancy: 'Thunder_Bold.png', Technomancy: 'iridescent_oil.jpg',
        Technomagical: 'copper_patina.jpg', Idromancy: 'turquoise_verdigris.jpg',
        Geomancy: 'cracked_earth.jpg', Aeromancy: 'grey_cloud_concrete.jpg',
        HolyMagic: 'gold_parchment.jpg', Healing: 'sage_plaster.jpg',
        AstralMagic: 'Aurora.png', Augury: 'amber_onyx_marble.jpg',
        Oneiromancy: 'pink_rainbow_swirl.jpg', Illusion: 'psychedelic_marble.jpg',
        Necromancy: 'charcoal_brown_stone.jpg', ForbiddenMagic: 'crimson_psychedelic.jpg',
        VoidMagic: 'dark_grey_smoke.jpg', ChaosMagic: 'magenta_psychedelic.jpg',
        Convokation: 'violet_psychedelic.jpg', Arcanism: 'MagicCircle1.png',
        MetaMagic: 'malachite.jpg', StatusMagic: 'mauve_rock.jpg',
        Chronomancy: 'dark_gold_swirl.jpg', Mutation: 'mossy_green_rock.jpg',
        Fusion: 'Crystal001.png', Crafted: 'olive_parchment.jpg'
    }; // i18n-ignore: texture filenames

    function schoolOf(skill) {
        return (SkillMaster.getSkillCategory ? SkillMaster.getSkillCategory(skill.id) : null) || '';
    }

    /** The element a bound weapon strikes with. The spell's own comes first. */
    function enchantElement(skill) {
        const own = skill && skill.damage ? skill.damage.elementId : 0;
        if (own > 0) return own;
        return SCHOOL_ELEMENT[schoolOf(skill)] || 1;
    }

    /** The finish a bound weapon wears. Element first, school when it has none. */
    function enchantTexture(skill) {
        const own = skill && skill.damage ? skill.damage.elementId : 0;
        if (own > 0 && ELEMENT_TEXTURE[own]) return ELEMENT_TEXTURE[own];
        const bySchool = SCHOOL_TEXTURE[schoolOf(skill)];
        if (bySchool) return bySchool;
        return ELEMENT_TEXTURE[enchantElement(skill)] || ELEMENT_TEXTURE[1];
    }

    SkillMaster.Enchant = {
        cost: enchantCost,
        isSpell: isSpell,
        bindableTo: bindableTo,
        isOffensiveOrStatus: isOffensiveOrStatus,
        isProtective: isProtective,
        element: enchantElement,
        texture: enchantTexture,
        SCHOOL_ELEMENT: SCHOOL_ELEMENT,
        ELEMENT_TEXTURE: ELEMENT_TEXTURE,
        SCHOOL_TEXTURE: SCHOOL_TEXTURE
    };

    //=========================================================================
    // Gear tags: special properties written onto a piece
    //
    // window.SkillTags is the one registry; nothing here lists a mechanic of
    // its own. A piece of gear takes the tags whose equipment form the
    // registry declares (list({ target: 'weapon' | 'armor' })), written as the
    // traits and note tags SkillTags.apply writes, and the piece is marked
    // <GearTags: key, key> so every card and every battle reader can tell
    // what was put on it. The enchanting bench and the forge
    // (Quest/ThinkerMenu.js) both write through window.GearTags.
    //=========================================================================

    const GEAR_TAGS_NOTE = /<GearTags:[^>]*>\s*/gi; // i18n-ignore: note tag regex

    const tagRegistry = () => window.SkillTags || null;

    /** 'weapon' or 'armor': which equipment target a piece is. */
    function gearTarget(item) {
        if (!item) return 'weapon';
        if (item._enchantKind === 'armor' || item._enchantKind === 'weapon') return item._enchantKind;
        return item.wtypeId !== undefined ? 'weapon' : 'armor';
    }

    /** The tag keys a piece carries, in build order. */
    function gearTagsOf(item) {
        if (!item) return [];
        let keys = Array.isArray(item._gearTags) ? item._gearTags.slice() : null;
        if (!keys) {
            const raw = (item.meta && item.meta.GearTags) ||
                ((String(item.note || '').match(/<GearTags:\s*([^>]*)>/i) || [])[1]) || '';
            keys = String(raw === true ? '' : raw).split(',').map(s => s.trim()).filter(Boolean);
        }
        const ST = tagRegistry();
        return ST ? keys.filter(k => ST.get(k)) : keys;
    }

    /**
     * Writes `tags` onto an entry that is being made (a copy, never a shipped
     * row). An element tag on a weapon replaces the blade's element rather
     * than joining it. Returns the tags that were written.
     */
    function writeGearTags(entry, tags, target) {
        const ST = tagRegistry();
        if (!entry || !ST || !tags || !tags.length) return [];
        const kept = ST.normalize(tags, target).tags;
        if (!kept.length) return [];
        entry.traits = Array.isArray(entry.traits) ? entry.traits : [];
        if (target === 'weapon' && kept.some(k => (ST.get(k) || {}).group === 'element')) {
            entry.traits = entry.traits.filter(t => t && t.code !== 31);
        }
        ST.apply(entry, kept, target);
        entry.note = String(entry.note || '').replace(GEAR_TAGS_NOTE, '').trim() +
            '\n<GearTags: ' + kept.join(', ') + '>'; // i18n-ignore: note tag
        entry.meta = entry.meta || {};
        entry.meta.GearTags = ' ' + kept.join(', ');
        entry._gearTags = kept.slice();
        return kept;
    }

    const stateText = (id) => {
        const st = (typeof $dataStates !== 'undefined' && $dataStates) ? $dataStates[id] : null;
        return st && st.name ? tx(st.name) : String(id);
    };
    const elementText = (id) => tx((((typeof $dataSystem !== 'undefined' && $dataSystem) || {}).elements || [])[id] || '');
    const pct = (v) => Math.round(Math.abs(Number(v) || 0) * 100);
    // The stat a brace lifts, in the label SkillStatReq gives it everywhere
    // else (FRZ COS INT SAG DES PSI in Italian).
    const PARAM_KEY = ['', '', 'STR', 'CON', 'INT', 'WIS', 'DEX', 'PSI']; // i18n-ignore: stat ids
    const statLabel = (paramId) => {
        const key = PARAM_KEY[paramId] || '';
        return (window.SkillStatReq && window.SkillStatReq.statName) ? window.SkillStatReq.statName(key) : key;
    };
    const REGEN_KEY = { 7: 'regenHP', 8: 'regenMP', 9: 'regenAP' }; // i18n-ignore: i18n key tails

    /**
     * What a tag does on a piece of gear, in a phrase. It is read off the very
     * traits the registry writes (the tag is applied to a scratch entry), so
     * the words can never disagree with what the piece carries.
     */
    function gearEffectText(key, target) {
        const ST = tagRegistry();
        const def = ST ? ST.get(key) : null;
        if (!def || typeof def.equip !== 'function') return '';
        const scratch = { traits: [], note: '', meta: {} };
        try { def.equip(scratch, target); } catch (e) { return ''; }
        const parts = [];
        for (const t of scratch.traits) {
            if (t.code === 31) parts.push(tr('gear.attackElement', { element: elementText(t.dataId) }));
            else if (t.code === 11) parts.push(tr('gear.resistElement', { element: elementText(t.dataId), pct: pct(1 - t.value) }));
            else if (t.code === 32) parts.push(tr('gear.attackState', { state: stateText(t.dataId), pct: pct(t.value) }));
            else if (t.code === 14) parts.push(tr('gear.resistState', { state: stateText(t.dataId) }));
            else if (t.code === 33) parts.push(tr('gear.speed', { value: t.value }));
            else if (t.code === 34) parts.push(tr('gear.extraHit', { n: t.value }));
            else if (t.code === 21) parts.push(tr('gear.paramRate', { stat: statLabel(t.dataId), pct: pct(t.value - 1) }));
            else if (t.code === 22 && t.dataId === 0) parts.push(tr('gear.hit', { pct: pct(t.value) }));
            else if (t.code === 22 && t.dataId === 2) parts.push(tr('gear.crit', { pct: pct(t.value) }));
            else if (t.code === 22 && REGEN_KEY[t.dataId]) parts.push(tr('gear.' + REGEN_KEY[t.dataId], { pct: pct(t.value) }));
        }
        const type = scratch.meta.DamageType ? String(scratch.meta.DamageType).trim() : '';
        if (type) parts.push(tr('gear.damageType', { type: tr('gear.damageTypes.' + type) }));
        return parts.join(tr('gear.and'));
    }

    /** One line per tag: its name and what it does on this piece. */
    function gearTagLine(key, target) {
        const ST = tagRegistry();
        if (!ST) return '';
        const effect = gearEffectText(key, target);
        return effect ? tr('gear.line', { name: ST.name(key), effect }) : ST.name(key);
    }

    /** Every special ability a piece carries, as the item cards print them. */
    function gearSpecialLines(item) {
        if (!item) return [];
        const target = gearTarget(item);
        const out = gearTagsOf(item).map(k => gearTagLine(k, target)).filter(Boolean);
        const spellId = Number((item.meta && item.meta.EnchantSpell) || item._enchantSpellId || 0);
        const kind = item._enchantKind || (item.meta && item.meta.Enchanted);
        const spell = spellId && typeof $dataSkills !== 'undefined' && $dataSkills ? $dataSkills[spellId] : null;
        if (spell && (kind === 'weapon' || kind === 'armor')) {
            out.push(tr(kind === 'weapon' ? 'gear.onCrit' : 'gear.onCritTaken', { spell: tx(spell.name) }));
        }
        return out;
    }

    // What the tags of an enchantment cost: the registry's own equipment
    // quote, which is the KP the same mechanics cost on the Workbench, times
    // what a weapon or a piece of armour does with them all battle long.
    const ENCH_TAG_MULT = { weapon: 1.5, armor: 1.15 };

    function tagsCost(tags, kind) {
        const ST = tagRegistry();
        if (!ST || !tags || !tags.length || !ENCH_TAG_MULT[kind]) return 0;
        const q = ST.quote(tags, kind);
        return Math.max(ENCH_MIN, Math.round(q.price * ENCH_TAG_MULT[kind]));
    }

    /** The whole price of an enchantment: the spell, the tags, or both. */
    function enchantmentCost(spell, tags, kind) {
        return (spell ? enchantCost(spell, kind) : 0) + tagsCost(tags, kind);
    }

    const GearTags = {
        of: gearTagsOf,
        target: gearTarget,
        write: writeGearTags,
        effect: gearEffectText,
        line: gearTagLine,
        specials: gearSpecialLines,
        has: (item) => gearTagsOf(item).length > 0
    };
    window.GearTags = GearTags;
    SkillMaster.Enchant.GearTags = GearTags;
    SkillMaster.Enchant.tagsCost = tagsCost;
    SkillMaster.Enchant.enchantmentCost = enchantmentCost;
    SkillMaster.Enchant.TAG_MULT = ENCH_TAG_MULT;

    // The item cards (ItemSystemUtils.specialLines) ask every registered
    // provider for a piece's special abilities; this is gear's.
    (function registerGearSpecials() {
        const U = window.ItemSystemUtils = window.ItemSystemUtils || {};
        if (typeof U.registerSpecial === 'function') U.registerSpecial(gearSpecialLines);
        else (U._specialProviders = U._specialProviders || []).push(gearSpecialLines);
    })();

    //=========================================================================
    // Persistence
    //
    // A bound piece is a database entry the database never shipped, so it is
    // kept on $gameSystem and laid back over $dataWeapons / $dataArmors on
    // every load, exactly the way a crafted spell is.
    //=========================================================================

    // Clear of everything data/ ships.
    const ENCH_ID_FLOOR = 2000;

    function ensureSlot(arr, id) {
        if (!arr) return;
        while (arr.length <= id) arr.push(null);
    }

    Game_System.prototype.getEnchantedGear = function () {
        if (!this._enchantedGear) this._enchantedGear = [];
        return this._enchantedGear;
    };

    /**
     * Which database a bound piece belongs in. A weapon and a piece of armour
     * have a rack of their own; everything else the benches write - the
     * enchanted book, the skill book, the grimorie - is an item.
     */
    function dbForKind(kind) {
        if (kind === 'weapon') return (typeof $dataWeapons !== 'undefined') ? $dataWeapons : null;
        if (kind === 'armor') return (typeof $dataArmors !== 'undefined') ? $dataArmors : null;
        return (typeof $dataItems !== 'undefined') ? $dataItems : null;
    }
    Game_System.prototype.allocEnchantedGearId = function (kind) {
        const key = kind === 'weapon' ? '_nextEnchantWeaponId'
            : kind === 'armor' ? '_nextEnchantArmorId' : '_nextEnchantItemId';
        if (!this[key]) {
            const db = dbForKind(kind);
            const len = db ? db.length : ENCH_ID_FLOOR;
            this[key] = Math.max(ENCH_ID_FLOOR, len);
        }
        // Never into the reserved bands the world's artifacts, relics and
        // chip dies take (window.RuntimeItemIds, ItemSystemUtils.js).
        if (window.RuntimeItemIds) this[key] = window.RuntimeItemIds.skip(this[key]);
        return this[key]++;
    };

    function injectOne(entry) {
        if (!entry || !entry.id) return;
        const db = dbForKind(entry._enchantKind);
        if (!db) return;
        ensureSlot(db, entry.id);
        db[entry.id] = entry;
    }

    function injectAllEnchantedGear() {
        if (typeof $gameSystem === 'undefined' || !$gameSystem) return;
        if (typeof $gameSystem.getEnchantedGear !== 'function') return;
        for (const entry of $gameSystem.getEnchantedGear()) injectOne(entry);
    }
    SkillMaster.injectAllEnchantedGear = injectAllEnchantedGear;

    const _DataManager_extractSaveContents_ench = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function (contents) {
        _DataManager_extractSaveContents_ench.call(this, contents);
        injectAllEnchantedGear();
    };

    //=========================================================================
    // Forging
    //=========================================================================

    /** The words an enchantment's tags are listed in on its name and card. */
    function tagsPhrase(tags, kind) {
        const ST = tagRegistry();
        if (!ST || !tags.length) return '';
        return ST.describe(tags, kind);
    }

    /**
     * The unique entry an enchantment writes: a spell bound to it, a set of
     * tags written onto it, or both. A binding alone touches no params and no
     * trait that carries a number: it buys the spell and the look. Tags are
     * the registry's equipment forms, paid for in KP (tagsCost). `opts.preview`
     * builds the entry without taking an id, for the bench's live card.
     */
    function forgeEnchanted(base, kind, spell, tags, opts) {
        const o = opts || {};
        const entry = JSON.parse(JSON.stringify(base));
        entry.id = o.preview ? (base.id || 0) : $gameSystem.allocEnchantedGearId(kind);
        const ST = tagRegistry();
        const kept = (ST && tags && tags.length) ? ST.normalize(tags, kind).tags : [];
        const tagWords = tagsPhrase(kept, kind);
        const lead = kept.length && ST ? ST.name(kept[0]) : '';
        const weapon = kind === 'weapon';
        if (spell) {
            entry.name = tr(weapon ? 'weaponName' : 'armorName', { base: tx(base.name), spell: tx(spell.name) });
            entry.description = kept.length
                ? tr(weapon ? 'weaponDescBoth' : 'armorDescBoth', { spell: tx(spell.name), tags: tagWords })
                : tr(weapon ? 'weaponDesc' : 'armorDesc', { spell: tx(spell.name) });
        } else {
            entry.name = tr(weapon ? 'weaponNameTags' : 'armorNameTags', { base: tx(base.name), tag: lead });
            entry.description = tr(weapon ? 'weaponDescTags' : 'armorDescTags', { tags: tagWords });
        }

        // The finish follows the element: an element tag first, the bound
        // spell's next. A piece that gains neither keeps the look it had.
        const elTag = kept.map(k => ST.get(k)).find(d => d && d.group === 'element');
        const texture = kind !== 'weapon' ? ''
            : (elTag && ELEMENT_TEXTURE[elTag.id]) ? ELEMENT_TEXTURE[elTag.id]
                : (spell ? enchantTexture(spell) : '');

        let note = String(base.note || '')
            .replace(/<EnchantSpell:[^>]*>\s*/gi, '') // i18n-ignore: note tag
            .replace(/<Enchanted:[^>]*>\s*/gi, ''); // i18n-ignore: note tag
        if (texture) note = note.replace(/<ForgeTexture:[^>]*>\s*/gi, ''); // i18n-ignore: note tag
        if (spell) note += '\n<EnchantSpell: ' + spell.id + '>'; // i18n-ignore: note tag
        note += '\n<Enchanted: ' + kind + '>'; // i18n-ignore: note tag
        if (texture) note += '\n<ForgeTexture: ' + texture + '>'; // i18n-ignore: note tag
        entry.note = note.trim();
        entry.meta = Object.assign({}, base.meta);
        delete entry.meta.EnchantSpell;
        if (spell) entry.meta.EnchantSpell = String(spell.id);
        entry.meta.Enchanted = kind;
        if (texture) entry.meta.ForgeTexture = texture;

        if (kind === 'weapon' && spell) {
            // The binding's element replaces the blade's, and is the only
            // trait a binding ever writes.
            entry.traits = (base.traits || []).filter(t => t && t.code !== 31);
            entry.traits.push({ code: 31, dataId: enchantElement(spell), value: 1 });
        }
        if (kept.length) writeGearTags(entry, kept, kind);

        entry._enchantKind = kind;
        entry._enchantSpellId = spell ? spell.id : 0;
        entry._enchantBaseId = base.id;
        entry._enchanted = true;
        return entry;
    }

    //=========================================================================
    // The enchanted book
    //
    // A weapon answers a critical and a piece of armour answers being hit. A
    // book answers nothing: it is opened, and the spell written in it goes off
    // for free, in a turn battle and on the strategic map alike. It does that
    // by BEING the spell - the entry copies the spell's aim, its damage and
    // its effects onto an item - so every battle mode that can already use an
    // item can already use this, and no MP is ever asked for because an item
    // has no MP cost to ask.
    //
    // What it costs instead is the book. Every reading may burn it, and how
    // likely that is depends on the reader: their Enchanting, and how well
    // they know the school the spell was written in.
    //=========================================================================

    // The covers a written book may wear. Named rather than rolled, because
    // the whole point is that the player picks one.
    const BOOK_TEXTURES = [
        'golden_brown_leather.jpg', 'brown_leather_stone.jpg', 'dark_brown_marble.jpg',
        'olive_leather_stone.jpg', 'amber_paper.jpg', 'gold_parchment.jpg',
        'olive_parchment.jpg', 'dark_gold_foil.jpg', 'emerald_marble.jpg',
        'red_marble.jpg', 'grey_smoke_marble.jpg', 'charcoal_brown_stone.jpg',
        'copper_patina.jpg', 'malachite.jpg', 'iridescent_oil.jpg',
        'crimson_psychedelic.jpg', 'violet_psychedelic.jpg', 'psychedelic_marble.jpg'
    ]; // i18n-ignore: texture filenames
    SkillMaster.Enchant.BOOK_TEXTURES = BOOK_TEXTURES;

    /** A small deterministic generator, so one binding names one book. */
    function seededRandom(seed) {
        let a = seed >>> 0 || 1;
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function hashOf(text) {
        let h = 2166136261;
        const str = String(text);
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    /**
     * The name a written book is given. RandomBookGenerator already owns every
     * title in the world, so the bench borrows its grammar rather than growing
     * one of its own; the seed makes the roll stable per entry, and the i18n
     * pattern is the fallback for a world where that plugin is not up.
     */
    function rollBookName(spell, seed) {
        const rng = seededRandom(seed);
        const G = window.RandomBookGenerator;
        if (G && typeof G.generateTitle === 'function') {
            try {
                const title = String(G.generateTitle(rng) || '').trim();
                if (title) return title;
            } catch (e) { /* fall through to the pattern */ }
        }
        return tr('bookFallbackName', { spell: tx(spell.name) });
    }

    /**
     * The entry a book binding writes. It is the spell, as an item: the aim,
     * the damage and the effects are copied across so every battle system
     * already knows what to do with it.
     */
    function forgeEnchantedBook(base, spell) {
        const entry = JSON.parse(JSON.stringify(base));
        entry.id = $gameSystem.allocEnchantedGearId('book');
        const seed = hashOf(entry.id + ':' + spell.id + ':' + base.id);
        entry.name = rollBookName(spell, seed);
        entry.description = tr('bookDesc', { spell: tx(spell.name) });
        entry.itypeId = 1;
        // Never spent by using it. The only thing that takes a written book out
        // of the pack is a burning, and that is rolled in useItem.
        entry.consumable = false;
        entry.occasion = 0;
        entry.scope = spell.scope;
        entry.speed = 0;
        entry.successRate = spell.successRate;
        entry.repeats = spell.repeats;
        entry.tpGain = 0;
        entry.hitType = spell.hitType;
        entry.animationId = spell.animationId;
        entry.damage = JSON.parse(JSON.stringify(spell.damage || {}));
        entry.effects = JSON.parse(JSON.stringify(spell.effects || []));

        const texture = BOOK_TEXTURES[Math.floor(seededRandom(seed ^ 0x9E3779B9)() * BOOK_TEXTURES.length)];
        let note = String(base.note || '')
            .replace(/<EnchantSpell:[^>]*>\s*/gi, '') // i18n-ignore: note tag
            .replace(/<Enchanted:[^>]*>\s*/gi, '') // i18n-ignore: note tag
            .replace(/<BookTexture:[^>]*>\s*/gi, ''); // i18n-ignore: note tag
        note += '\n<EnchantSpell: ' + spell.id + '>\n<Enchanted: book>\n<BookTexture: ' + texture + '>'; // i18n-ignore: note tag
        entry.note = note.trim();
        entry.meta = Object.assign({}, base.meta);
        entry.meta.EnchantSpell = String(spell.id);
        entry.meta.Enchanted = 'book';
        entry.meta.BookTexture = texture;

        entry._enchantKind = 'book';
        entry._enchantSpellId = spell.id;
        entry._enchantBaseId = base.id;
        entry._enchanted = true;
        return entry;
    }
    SkillMaster.Enchant.forgeBook = forgeEnchantedBook;

    //--- burning -------------------------------------------------------------

    // A book read by somebody who has never bound anything and does not know
    // the school burns nearly half the time. At the top of both it almost
    // never does.
    const BURN_BASE = 0.45;
    const BURN_PER_ENCHANTING = 0.06;   // per tier of Enchanting above Untrained
    const BURN_PER_SCHOOL = 0.04;       // per tier of the spell's own school
    const BURN_MIN = 0.05;
    const BURN_MAX = 0.60;
    const ENCHANTING_SPEC = 'Enchanting'; // i18n-ignore: Specialization.json lookup key

    /** The Enchanting record, or null before Specialization.json is up. */
    function enchantingSpec() {
        const S = window.Specializations;
        if (!S || !S.byName) return null;
        return S.byName.get(ENCHANTING_SPEC) || null;
    }
    SkillMaster.Enchant.ENCHANTING_SPEC = ENCHANTING_SPEC;
    SkillMaster.Enchant.enchantingSpec = enchantingSpec;

    /** 1..5, Untrained to Master. 1 for anyone the menus do not cover. */
    function tierOf(actor, specDef) {
        if (!actor || !specDef || !actor.specializationLevel) return 1;
        const n = actor.specializationLevel(specDef.id);
        return Math.max(1, Math.min(5, n || 1));
    }

    /**
     * How likely this reader is to burn this book. Two disciplines answer:
     * Enchanting, which is the craft itself, and whatever specialization the
     * spell's own school runs on (window.SkillSpecs owns that mapping, and is
     * never re-derived here). An esoteric or forbidden page burns harder.
     */
    function burnChance(actor, book) {
        const spell = boundSpellOf(book);
        if (!spell) return 0;
        const ench = tierOf(actor, enchantingSpec());
        const SS = window.SkillSpecs;
        const school = (SS && SS.levelFor) ? Math.max(1, Math.min(5, SS.levelFor(actor, spell))) : 1;
        let chance = BURN_BASE
            - BURN_PER_ENCHANTING * (ench - 1)
            - BURN_PER_SCHOOL * (school - 1);
        chance *= arcanaMult(spell) > 1 ? (arcanaMult(spell) >= ENCH_FORBIDDEN_MULT ? 1.8 : 1.3) : 1;
        return Math.max(BURN_MIN, Math.min(BURN_MAX, chance));
    }
    SkillMaster.Enchant.burnChance = burnChance;

    /** Whether an entry is one of the bench's written books. */
    function isEnchantedBook(item) {
        return !!(item && (item._enchantKind === 'book' ||
            (item.meta && item.meta.Enchanted === 'book')));
    }
    SkillMaster.Enchant.isEnchantedBook = isEnchantedBook;

    /** Rolls the burning and, on a burn, takes the book out of the world. */
    function rollBurn(actor, book) {
        if (!isEnchantedBook(book)) return false;
        const chance = burnChance(actor, book);
        if (Math.random() >= chance) return false;
        $gameParty.loseItem(book, 1);
        // The last copy is gone, so the bench stops listing it. The database
        // row is deliberately LEFT standing: the action that is burning the
        // book is still holding it, and Game_Item#object() re-reads $dataItems
        // every time it is asked, so clearing the row mid-turn would hand the
        // rest of that turn a null item.
        if (!$gameParty.numItems(book)) {
            const list = $gameSystem.getEnchantedGear();
            const at = list.findIndex(e => e && e.id === book.id);
            if (at >= 0) list.splice(at, 1);
        }
        const line = tr('log.burned', { book: book.name });
        const log = BattleManager._logWindow;
        if ($gameParty.inBattle() && log && typeof log.push === 'function') log.push('addText', line);
        else if (window.ParchmentToast) window.ParchmentToast.show(line);
        return true;
    }
    SkillMaster.Enchant.rollBurn = rollBurn;

    // useItem is the one place every use passes through, in a turn battle, on
    // the strategic map and in the menu alike.
    const _Game_Battler_useItem_book = Game_Battler.prototype.useItem;
    Game_Battler.prototype.useItem = function (item) {
        _Game_Battler_useItem_book.call(this, item);
        if (!isEnchantedBook(item)) return;
        try { rollBurn(this, item); } catch (e) { console.error('SkillMaster: a book failed to burn', e); }
    };

    /**
     * Binds `spell` into `slot`, which is either a piece sitting in the pack
     * or one a character is wearing. The base piece is consumed.
     * @param {object} slot - {kind, item, actorId, equipSlot} as enchantableGear() lists it
     * @param {object} spell - the skill entry to bind
     * @returns {object|null} the entry written, or null when nothing was
     */
    function bindSpell(slot, spell) {
        if (!spell) return null;
        return enchantGear(slot, { spell: spell, tags: [] });
    }

    /**
     * Whether an enchantment may go onto `slot` as it stands, and why not.
     * @param {object} slot - as enchantableGear() lists it
     * @param {object} spec - { spell, tags }: either, or both on gear; a book
     *                        takes a spell and no tags
     * @returns {{ ok, reason, cost, tags }}
     */
    function enchantVerdict(slot, spec) {
        const s = spec || {};
        const spell = s.spell || null;
        const kind = slot ? slot.kind : 'weapon';
        const ST = tagRegistry();
        const tags = (kind !== 'book' && ST && s.tags && s.tags.length) ? s.tags.slice() : [];
        const out = { ok: false, reason: '', cost: 0, tags };
        if (!slot || !slot.item || !isBindableBase(slot.item)) { out.reason = 'noBase'; return out; }
        if (!spell && !tags.length) { out.reason = 'empty'; return out; }
        if (spell && !bindableTo(spell, kind)) { out.reason = 'spell'; return out; }
        if (spell && window.BoundSkill && window.BoundSkill.has(slot.item)) { out.reason = 'ownSkill'; return out; }
        if (tags.length) {
            const v = ST.validate(tags, kind);
            if (!v.ok) { out.reason = 'tags'; out.why = ST.why(v); return out; }
        }
        out.cost = enchantmentCost(spell, tags, kind);
        if ($gameSystem.getKnowledge() < out.cost) { out.reason = 'knowledge'; return out; }
        out.ok = true;
        return out;
    }

    /**
     * Writes an enchantment into `slot`: the spell, the tags, or both. The
     * base piece is consumed and the knowledge is paid once.
     * @returns {object|null} the entry written, or null when nothing was
     */
    function enchantGear(slot, spec) {
        const verdict = enchantVerdict(slot, spec);
        if (!verdict.ok) return null;
        const kind = slot.kind;
        const spell = (spec && spec.spell) || null;
        const cost = verdict.cost;

        const entry = (kind === 'book')
            ? forgeEnchantedBook(slot.item, spell)
            : forgeEnchanted(slot.item, kind, spell, verdict.tags);
        injectOne(entry);
        $gameSystem.getEnchantedGear().push(entry);
        $gameParty.gainItem(entry, 1);

        if (slot.actorId) {
            const actor = $gameActors.actor(slot.actorId);
            // changeEquip hands the base back to the pack, so it is lost after.
            if (actor) actor.changeEquip(slot.equipSlot, entry);
        }
        $gameParty.loseItem(slot.item, 1);
        $gameSystem.spendKnowledge(cost);
        return entry;
    }

    /** Unmakes a binding: the piece goes, the knowledge does not come back. */
    function unbind(entryId, kind) {
        const list = $gameSystem.getEnchantedGear();
        const idx = list.findIndex(e => e && e.id === entryId && e._enchantKind === kind);
        if (idx < 0) return false;
        const entry = list[idx];
        if (kind === 'weapon' || kind === 'armor') {
            for (const actor of $gameParty.allMembers()) {
                actor.equips().forEach((eq, i) => {
                    if (eq && eq.id === entry.id && !!eq.wtypeId === (kind === 'weapon')) actor.changeEquip(i, null);
                });
            }
        }
        $gameParty.loseItem(entry, $gameParty.numItems(entry));
        list.splice(idx, 1);
        const db = dbForKind(kind);
        if (db && db[entryId]) db[entryId] = null;
        return true;
    }

    /**
     * The vector gun is one database row the whole of VectorGunSystem keeps
     * rewriting: its form, its element and its model are decided at runtime
     * and belong to that plugin. A binding would fight it for all three, and
     * copying the row into an artifact would strand the copy outside
     * everything that answers to its id. So the bench never touches it.
     */
    function isBindableBase(item) {
        if (!item) return false;
        // Anything either bench already wrote: a bound piece, and a volume the
        // writing bench filled with pages. Neither is raw material again.
        if (item._enchanted || (item.meta && (item.meta.EnchantSpell || item.meta.Enchanted))) return false;
        // A piece the forge already gave special properties to has had its
        // enchantment, the same as one this bench wrote.
        if (gearTagsOf(item).length) return false;
        // One skill per piece: a wand or a robe that came with its own is
        // never bound a second (enchantVerdict), though it may still take tags.
        const VG = window.VectorGun;
        if (VG && typeof VG.isVectorGun === 'function' && VG.isVectorGun(item)) return false;
        return true;
    }
    SkillMaster.Enchant.isBindableBase = isBindableBase;

    /**
     * Every piece the bench may work on: what is in the pack and what the
     * party is wearing, minus anything already bound.
     */
    function enchantableGear(kind) {
        const out = [];
        const seen = new Set();
        // The book bench reads the pack and nothing else: a book is carried,
        // never worn, and window.BookLearning is the one answer to what is a
        // book at all.
        if (kind === 'book') {
            const BL = window.BookLearning;
            for (const item of $gameParty.items()) {
                if (!isBindableBase(item)) continue;
                if (!BL || !BL.isBook(item)) continue;
                // A book is all spell: one that already casts something is done.
                if (window.BoundSkill && window.BoundSkill.has(item)) continue;
                if (seen.has(item.id)) continue;
                seen.add(item.id);
                out.push({ kind: kind, item: item, actorId: 0, equipSlot: -1 });
            }
            return out;
        }
        const isWeapon = kind === 'weapon';
        const pack = isWeapon ? $gameParty.weapons() : $gameParty.armors();
        for (const item of pack) {
            if (!isBindableBase(item)) continue;
            const key = 'p' + item.id;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ kind: kind, item: item, actorId: 0, equipSlot: -1 });
        }
        for (const actor of $gameParty.allMembers()) {
            actor.equips().forEach((eq, i) => {
                if (!isBindableBase(eq)) return;
                const worn = isWeapon ? !!eq.wtypeId : !!eq.atypeId;
                if (!worn) return;
                const key = 'e' + actor.actorId() + ':' + i;
                if (seen.has(key)) return;
                seen.add(key);
                out.push({ kind: kind, item: eq, actorId: actor.actorId(), equipSlot: i });
            });
        }
        return out;
    }

    /** Every spell anybody in the party knows that this bench will take. */
    function bindableSpells(kind) {
        const seen = new Set();
        const out = [];
        for (const actor of $gameParty.allMembers()) {
            for (const s of actor.skills()) {
                if (!s || seen.has(s.id)) continue;
                seen.add(s.id);
                if (SkillMaster.isHiddenSkill ? SkillMaster.isHiddenSkill(s) : s.id === 2) continue;
                if (bindableTo(s, kind)) out.push(s);
            }
        }
        const name = (s) => (SkillMaster.skillSortName ? SkillMaster.skillSortName(s) : s.name);
        out.sort((a, b) => name(a).localeCompare(name(b)));
        return out;
    }

    SkillMaster.Enchant.bindSpell = bindSpell;
    SkillMaster.Enchant.enchantGear = enchantGear;
    SkillMaster.Enchant.verdict = enchantVerdict;
    SkillMaster.Enchant.unbind = unbind;
    SkillMaster.Enchant.enchantableGear = enchantableGear;
    SkillMaster.Enchant.bindableSpells = bindableSpells;
    SkillMaster.Enchant.forge = forgeEnchanted;

    //=========================================================================
    // The bench
    //=========================================================================

    const Proto = window.Scene_SkillEncyclopedia.prototype;

    Proto.openEnchantBench = function (kind) {
        this._viewMode = 'enchant';
        this._enchantKind = (kind === 'armor' || kind === 'book') ? kind : 'weapon';
        this._enchantSlotIndex = 0;
        this._enchantSpellIndex = 0;
        this._enchantColumn = 0;
        this._enchantChip = 0;
        this._enchantChosen = null;
        this._enchantDraft = null;
        this._enchantDropped = null;
        this._enchantFormRow = 0;
        this._enchantChipAt = {};
        SoundManager.playOk();
        this.refreshUISkillDOM();
    };

    Proto.closeEnchantBench = function () {
        if (window.CCPick && window.CCPick.isOpen && window.CCPick.isOpen()) window.CCPick.close(true);
        this._viewMode = 'category';
        this._lastLeftMode = null;
        this._lastLeftCategory = null;
        this._lastRightMode = null;
        this._lastRightSkillId = null;
        this._lastRightKnowledge = null;
        SoundManager.playCancel();
        this.refreshUISkillDOM();
    };

    Proto.enchantSlots = function () {
        return enchantableGear(this._enchantKind || 'weapon');
    };

    Proto.enchantSpells = function () {
        return bindableSpells(this._enchantKind || 'weapon');
    };

    // The left page in one list: the gear waiting for a spell, then the pieces
    // already carrying one. They were two lists with a cursor on only the
    // first, which left everything already made reachable by the mouse alone.
    Proto.enchantBound = function () {
        const kind = this._enchantKind || 'weapon';
        return $gameSystem.getEnchantedGear().filter(e => e && e._enchantKind === kind);
    };

    // What can be done to a piece already bound. A written book may also be
    // renamed and recovered, so its row carries three chips and a weapon one.
    Proto.enchantChips = function () {
        return (this._enchantKind === 'book')
            ? ['rename', 'recover', 'unmake']
            : ['unmake'];
    };

    // The pieces stand in a grid this many across (.sm-gear-grid in theme.css).
    const ENCHANT_GEAR_COLS = 3;

    Proto.enchantLeftRows = function () {
        return this.enchantSlots().length + this.enchantBound().length;
    };

    Proto.enchantBoundAt = function (row) {
        const gear = this.enchantSlots().length;
        return row < gear ? null : (this.enchantBound()[row - gear] || null);
    };

    // The chip under the cursor, pressed.
    Proto.enchantRunChip = function (entry) {
        if (!entry) return;
        const chip = this.enchantChips()[this._enchantChip || 0];
        if (chip === 'rename') this.enchantRename(entry.id);
        else if (chip === 'recover') this.enchantRecover(entry.id, 1);
        else this.enchantUnbind(entry.id);
    };

    Proto.enchantSelectSlot = function (idx) {
        const slots = this.enchantSlots();
        if (!slots[idx]) return;
        this._enchantSlotIndex = idx;
        this._enchantChosen = slots[idx];
        this._enchantColumn = 1;
        this._enchantSpellIndex = 0;
        // A new piece starts a new draft: nothing chosen for the last one
        // carries over onto this one.
        this._enchantDraft = { spellId: 0, tags: [] };
        this._enchantDropped = null;
        this._enchantFormRow = 0;
        this._enchantChipAt = {};
        SoundManager.playOk();
        this.refreshUISkillDOM();
    };

    Proto.enchantBind = function (idx) {
        const spells = this.enchantSpells();
        const spell = spells[idx];
        const slot = this._enchantChosen;
        if (!spell || !slot) { SoundManager.playBuzzer(); return; }
        if ($gameSystem.getKnowledge() < enchantCost(spell, this._enchantKind)) {
            SoundManager.playBuzzer();
            return;
        }
        const entry = bindSpell(slot, spell);
        if (!entry) { SoundManager.playBuzzer(); return; }
        SoundManager.playSave();
        if (window.ParchmentToast) window.ParchmentToast.show(tr('bound', { item: entry.name }));
        this._enchantChosen = null;
        this._enchantColumn = 0;
        this._enchantSlotIndex = 0;
        this.refreshUISkillDOM();
    };

    Proto.enchantUnbind = function (entryId) {
        if (unbind(entryId, this._enchantKind || 'weapon')) {
            // The next piece slides under the cursor: never onto Unmake.
            this._enchantChip = 0;
            SoundManager.playCancel();
            this.refreshUISkillDOM();
        }
    };

    //--- the gear form: a spell, a set of tags, or both ----------------------
    //
    // A weapon or a piece of armour is enchanted on a form, the Workbench's
    // own: the bound spell on one trigger, then one row of chips per tag
    // group the registry offers this kind of gear, then the Enchant button.
    // A refused tag is still listed in the catalogue, greyed, with the reason.

    const isGearKind = (kind) => kind === 'weapon' || kind === 'armor';
    const ADD = '+';

    // The tag groups this kind of gear can carry anything in, in build order.
    function gearGroups(kind) {
        const ST = tagRegistry();
        if (!ST) return [];
        return ST.GROUPS.map(g => g.key).filter(g => ST.list({ target: kind, group: g }).length > 0);
    }
    SkillMaster.Enchant.gearGroups = gearGroups;

    Proto.enchantFormRows = function () {
        return ['spell'].concat(gearGroups(this._enchantKind || 'weapon'), ['enchant']);
    };

    Proto.enchantDraft = function () {
        if (!this._enchantDraft) this._enchantDraft = { spellId: 0, tags: [] };
        return this._enchantDraft;
    };

    Proto.enchantDraftSpell = function () {
        const id = this.enchantDraft().spellId;
        return id && $dataSkills[id] ? $dataSkills[id] : null;
    };

    Proto.enchantFormVerdict = function () {
        const d = this.enchantDraft();
        return enchantVerdict(this._enchantChosen, { spell: this.enchantDraftSpell(), tags: d.tags });
    };

    // Is `key` on offer to this piece's draft, and if not, why not?
    Proto.enchantTagVerdict = function (key) {
        const ST = tagRegistry();
        const d = this.enchantDraft();
        if (!ST) return { ok: false, reason: 'unknown' };
        if (d.tags.includes(key)) return { ok: false, reason: 'have' };
        return ST.allowed(d.tags, key, this._enchantKind);
    };

    Proto.enchantAddTag = function (key) {
        const ST = tagRegistry();
        const d = this.enchantDraft();
        if (!ST || !this.enchantTagVerdict(key).ok) { SoundManager.playBuzzer(); this.refreshUISkillDOM(); return false; }
        const n = ST.normalize(d.tags.concat([key]), this._enchantKind);
        d.tags = n.tags;
        this._enchantDropped = n.dropped;
        SoundManager.playOk();
        this.refreshUISkillDOM();
        return true;
    };

    Proto.enchantRemoveTag = function (key) {
        const ST = tagRegistry();
        const d = this.enchantDraft();
        if (!ST || !d.tags.includes(key)) { SoundManager.playBuzzer(); return; }
        const n = ST.normalize(d.tags.filter(k => k !== key), this._enchantKind);
        d.tags = n.tags;
        this._enchantDropped = n.dropped;
        SoundManager.playCancel();
        this.refreshUISkillDOM();
    };

    // The chips of one group's row: the tags the draft carries in it, then the
    // add chip that opens the catalogue on that group.
    Proto.enchantChipRow = function (group) {
        const ST = tagRegistry();
        const tags = this.enchantDraft().tags.filter(k => ST && (ST.get(k) || {}).group === group);
        return tags.map(k => ({ key: k })).concat([{ key: ADD, add: true }]);
    };

    Proto.enchantChipCursor = function (group) {
        const n = this.enchantChipRow(group).length;
        const at = (this._enchantChipAt || {})[group] | 0;
        return Math.max(0, Math.min(n - 1, at));
    };

    Proto.enchantPickChip = function (group, key) {
        const row = this.enchantFormRows().indexOf(group);
        if (row >= 0) { this._enchantColumn = 1; this._enchantFormRow = row; }
        const at = this.enchantChipRow(group).findIndex(c => c.key === key);
        (this._enchantChipAt || (this._enchantChipAt = {}))[group] = Math.max(0, at);
        if (key === ADD) this.openEnchantCatalogue(group);
        else this.enchantRemoveTag(key);
    };

    Proto.enchantChipInfo = function (group, key) {
        const ST = tagRegistry();
        if (!ST) return '';
        if (key === ADD) return tr('addHint', { group: T('SkillMaster.craft.group.' + group) });
        return tr('chipInfo', { line: gearTagLine(key, this._enchantKind), kp: tagsCost([key], this._enchantKind) });
    };

    Proto.enchantHoverChip = function (group, key) {
        const note = document.getElementById('enchant-note-' + group);
        if (note) note.textContent = this.enchantChipInfo(group, key);
    };

    // Every tag the registry puts on this kind of gear, in one group or all of
    // them, each with its verdict on the draft.
    Proto.openEnchantCatalogue = function (group) {
        const ST = tagRegistry();
        const pick = window.CCPick;
        const kind = this._enchantKind;
        if (!ST || !pick || typeof pick.open !== 'function') { SoundManager.playBuzzer(); return; }
        const rows = ST.list({ target: kind, group: group || undefined }).map(def => ({
            def, verdict: this.enchantTagVerdict(def.key), have: this.enchantDraft().tags.includes(def.key)
        }));
        if (!rows.length) { SoundManager.playBuzzer(); return; }
        pick.open({
            title: tr('pick'),
            container: this._dndContainer,
            search: true,
            options: rows.map(r => ({
                value: r.def.key,
                label: ST.name(r.def.key),
                hint: r.have ? ST.why({ ok: false, reason: 'have' })
                    : (r.verdict.ok ? tr('tagCost', { kp: tagsCost([r.def.key], kind) }) : ST.why(r.verdict)),
                group: T('SkillMaster.craft.group.' + r.def.group),
                disabled: r.have || !r.verdict.ok
            })),
            detail: (opt) => {
                const r = rows.find(x => x.def.key === opt.value);
                if (!r) return '';
                return `<h4 class="cc-modal-title">${esc(ST.name(r.def.key))}</h4>
                    <div class="ui-prose">${esc(gearEffectText(r.def.key, kind))}</div>
                    <div class="cc-bio-note">${esc(tr('tagCost', { kp: tagsCost([r.def.key], kind) }))}</div>
                    ${r.verdict.ok || r.have ? '' : `<div class="sm-craft-block">${esc(ST.why(r.verdict))}</div>`}`;
            },
            onPick: (key) => this.enchantAddTag(key)
        });
        SoundManager.playOk();
    };

    // The spell the piece is to cast, or none: a weapon or a piece of armour
    // may be enchanted with tags alone.
    Proto.openEnchantSpellPicker = function () {
        const pick = window.CCPick;
        const slot = this._enchantChosen;
        if (!pick || typeof pick.open !== 'function' || !slot) { SoundManager.playBuzzer(); return; }
        const kind = this._enchantKind;
        const own = window.BoundSkill && window.BoundSkill.has(slot.item);
        const options = [{ value: 0, label: tr('noSpell'), hint: '' }].concat(this.enchantSpells().map(s => ({
            value: s.id, label: tx(s.name),
            hint: own ? tr('ownSkill') : tr('tagCost', { kp: enchantCost(s, kind) }),
            disabled: own
        })));
        pick.open({
            title: tr('pickSpell'),
            container: this._dndContainer,
            search: true,
            value: this.enchantDraft().spellId || 0,
            options,
            onPick: (id) => {
                this.enchantDraft().spellId = Number(id) || 0;
                SoundManager.playOk();
                this.refreshUISkillDOM();
            }
        });
        SoundManager.playOk();
    };

    Proto.enchantCommit = function () {
        const slot = this._enchantChosen;
        const verdict = this.enchantFormVerdict();
        if (!slot || !verdict.ok) { SoundManager.playBuzzer(); this.refreshUISkillDOM(); return; }
        const entry = enchantGear(slot, { spell: this.enchantDraftSpell(), tags: this.enchantDraft().tags });
        if (!entry) { SoundManager.playBuzzer(); return; }
        SoundManager.playSave();
        if (window.ParchmentToast) window.ParchmentToast.show(tr('bound', { item: entry.name }));
        this._enchantChosen = null;
        this._enchantDraft = null;
        this._enchantDropped = null;
        this._enchantColumn = 0;
        this._enchantSlotIndex = 0;
        this.refreshUISkillDOM();
    };

    Proto.enchantActivateRow = function (row) {
        const rows = this.enchantFormRows();
        const name = rows[row];
        this._enchantColumn = 1;
        this._enchantFormRow = row;
        if (name === 'spell') this.openEnchantSpellPicker();
        else if (name === 'enchant') this.enchantCommit();
        else if (name) {
            const chip = this.enchantChipRow(name)[this.enchantChipCursor(name)];
            if (chip) this.enchantPickChip(name, chip.key);
        }
    };

    const ENCHANT_GROUP_ICONS = { element: 64, rider: 87, refine: 193, mechanic: 83, power: 176, payoff: 77 };

    // The right page while a weapon or a piece of armour is on the bench.
    Proto.renderEnchantFormHTML = function (knowledge) {
        const K = SkillMaster.BenchKit;
        const ST = tagRegistry();
        const slot = this._enchantChosen;
        const kind = this._enchantKind;
        const d = this.enchantDraft();
        const rows = this.enchantFormRows();
        const on = (name) => this._enchantColumn === 1 && rows[this._enchantFormRow || 0] === name;
        const spell = this.enchantDraftSpell();
        const verdict = this.enchantFormVerdict();
        const spellKP = spell ? enchantCost(spell, kind) : 0;
        const tagKP = tagsCost(d.tags, kind);

        let html = K.section({
            icon: ENCHANT_ICONS.book, title: tr('spellRow'),
            body: K.trigger({
                label: '', value: spell ? tx(spell.name) : tr('noSpell'), muted: !spell,
                iconIndex: spell ? spell.iconIndex : 0, focused: on('spell'),
                onclick: 'SceneManager._scene.openEnchantSpellPicker()'
            }),
            note: spell ? tr(kind === 'weapon' ? 'gear.onCrit' : 'gear.onCritTaken', { spell: tx(spell.name) }) : tr('spellOptional'),
            cls: on('spell') ? 'sm-kit-section--focused' : ''
        });
        for (const group of rows.slice(1, -1)) {
            const focused = on(group);
            const cursor = this.enchantChipCursor(group);
            const chips = this.enchantChipRow(group).map((c, k) => ({
                label: c.add ? tr('addChip') : ST.name(c.key),
                selected: !c.add,
                cursor: focused && k === cursor,
                hover: `SceneManager._scene.enchantHoverChip('${group}', '${c.key}')`,
                onclick: `SceneManager._scene.enchantPickChip('${group}', '${c.key}')`
            }));
            const note = focused ? this.enchantChipInfo(group, (this.enchantChipRow(group)[cursor] || {}).key)
                : tr('groupHint');
            html += K.section({
                icon: ENCHANT_GROUP_ICONS[group] || 83, title: T('SkillMaster.craft.group.' + group),
                badge: String(d.tags.filter(k => (ST.get(k) || {}).group === group).length),
                body: K.chips(chips), note, noteId: 'enchant-note-' + group,
                cls: focused ? 'sm-kit-section--focused' : ''
            });
        }

        // The piece as it will come off the bench, on the backpack's own card.
        let card = '';
        const preview = forgeEnchanted(slot.item, kind, spell, d.tags, { preview: true });
        if (window.ItemInspect && typeof window.ItemInspect.build === 'function') {
            try { card = window.ItemInspect.build(preview, { canvasId: 'enchant-preview-canvas' }); } catch (e) { card = ''; }
        }
        if (!card) {
            card = `<div class="ui-prose">${esc(preview.name)}</div><div class="ui-prose">${esc(preview.description)}</div>`;
        }
        this._enchantPreviewIcon = preview.iconIndex;
        const q = ST && d.tags.length ? ST.quote(d.tags, kind) : { complexity: 0 };
        html += `<div class="ui-detail sm-fuse-preview sm-kit-preview">
                ${K.stats([
                    { label: tr('spellPrice'), value: `${spellKP} KP` },
                    { label: tr('tagsPrice'), value: `${tagKP} KP` },
                    { label: tr('price'), value: `${spellKP + tagKP} KP`, bad: verdict.reason === 'knowledge' },
                    { label: tr('complexity'), value: Number(q.complexity || 0).toFixed(1) }
                ])}
                <div class="sm-craft-card">${card}</div>
            </div>`;

        let block = verdict.ok ? '' : tr('blocked.' + verdict.reason, { cost: verdict.cost, why: verdict.why || '' });
        if (this._enchantDropped && this._enchantDropped.length && ST) {
            block = (block ? block + ' ' : '') + tr('dropped', { tags: this._enchantDropped.map(k => ST.name(k)).join(', ') });
        }
        return `
            <div class="page-header-bar sm-bench-header">
              <h2 class="title">${esc(tr('formTitle'))}</h2>
              <div class="sm-bench-kp-pill"><strong>${knowledge} KP</strong></div>
            </div>
            ${K.title(slot.item.iconIndex, tr('bindingInto', { item: tx(slot.item.name) }))}
            <div id="enchant-form-box" class="ui-scroll sm-kit-scroll sm-craft-rows">${html}</div>
            <div class="inspect-actions sm-forge-actions">
                <div class="inspect-btn focusable ${on('enchant') ? 'selected' : ''} ${verdict.ok ? '' : 'unusable'}" onclick="SceneManager._scene.enchantCommit()">
                    ${esc(tr('enchantIt'))} <span class="sm-forge-cost">&middot; ${spellKP + tagKP} KP</span>
                </div>
            </div>
            ${block ? `<div class="sm-craft-block">${esc(block)}</div>` : ''}`;
    };

    // The pad on the gear form: up and down walk its rows, left and right the
    // chips of a row, OK presses what the cursor is on, and left off the
    // first chip (or off a row with none) goes back to the pieces.
    Proto.updateEnchantFormInput = function () {
        const rows = this.enchantFormRows();
        const row = Math.max(0, Math.min(rows.length - 1, this._enchantFormRow || 0));
        this._enchantFormRow = row;
        const name = rows[row];
        const pressed = (dir) => Input.isTriggered(dir) || Input.isRepeated(dir);
        const redraw = () => {
            SoundManager.playCursor();
            this.refreshUISkillDOM();
            this.scrollToActiveItem('enchant-form-box', '#enchant-form-box .sm-kit-section--focused');
        };
        if (Input.isTriggered('ok')) { this.enchantActivateRow(row); return; }
        const chipRow = name !== 'spell' && name !== 'enchant';
        if (pressed('down')) { this._enchantFormRow = (row + 1) % rows.length; redraw(); return; }
        if (pressed('up')) { this._enchantFormRow = (row - 1 + rows.length) % rows.length; redraw(); return; }
        if (pressed('right') && chipRow) {
            const n = this.enchantChipRow(name).length;
            const at = this.enchantChipCursor(name);
            if (at < n - 1) { (this._enchantChipAt || (this._enchantChipAt = {}))[name] = at + 1; redraw(); }
            return;
        }
        if (pressed('left')) {
            const at = chipRow ? this.enchantChipCursor(name) : 0;
            if (chipRow && at > 0) { this._enchantChipAt[name] = at - 1; redraw(); return; }
            this._enchantColumn = 0;
            redraw();
        }
    };

    //--- a written book is the player's to name and to bind ------------------

    /** The stored entry behind an id, whatever kind it is. */
    function entryById(entryId) {
        return $gameSystem.getEnchantedGear().find(e => e && e.id === entryId) || null;
    }
    SkillMaster.Enchant.entryById = entryById;

    /** Writes a change through to the entry, the database and the pack alike. */
    function restampEntry(entry) {
        if (!entry) return;
        injectOne(entry);
    }
    SkillMaster.Enchant.restampEntry = restampEntry;

    Proto.enchantRename = function (entryId) {
        const entry = entryById(entryId);
        if (!entry) return;
        this.openCraftTextSheet('name', null, (value) => {
            const name = String(value || '').trim().slice(0, 40);
            if (!name) return;
            entry.name = name;
            restampEntry(entry);
        });
    };

    /**
     * The cover. One click walks to the next sheet in the bank rather than
     * opening a picker of its own: the bank is short, every one of them is a
     * real file, and the book redraws as it goes.
     */
    Proto.enchantRecover = function (entryId, step) {
        const entry = entryById(entryId);
        if (!entry) return;
        const bank = BOOK_TEXTURES;
        const at = bank.indexOf(String((entry.meta && entry.meta.BookTexture) || ''));
        const next = bank[(at + (step || 1) + bank.length) % bank.length];
        entry.meta = entry.meta || {};
        entry.meta.BookTexture = next;
        entry.note = String(entry.note || '').replace(/<BookTexture:[^>]*>/gi, '').trim() +
            '\n<BookTexture: ' + next + '>'; // i18n-ignore: note tag
        restampEntry(entry);
        SoundManager.playCursor();
        this.refreshUISkillDOM();
    };

    // The glyph each heading of the bench wears, the way the character sheet
    // heads its sections.
    const ENCHANT_ICONS = { weapon: 97, armor: 135, book: 189, bound: 183 };

    Proto.renderEnchantBench = function (knowledge) {
        const leftBox = document.getElementById('left-page-content');
        const rightBox = document.getElementById('right-page-content');
        if (!leftBox || !rightBox) return;
        const K = SkillMaster.BenchKit;
        const kind = this._enchantKind || 'weapon';
        // Weapon / Armor / Book, the tail of every string key this page reads.
        const kindWord = kind.charAt(0).toUpperCase() + kind.slice(1);
        const slots = this.enchantSlots();
        const chosen = this._enchantChosen;

        let slotsHTML = '';
        slots.forEach((slot, idx) => {
            const on = this._enchantColumn === 0 && this._enchantSlotIndex === idx;
            const worn = slot.actorId ? $gameActors.actor(slot.actorId) : null;
            const wornTag = worn ? `<span class="ui-chip sm-skill-badge">${esc(worn.name())}</span>` : '';
            const picked = !!chosen && chosen.item === slot.item && chosen.actorId === slot.actorId;
            slotsHTML += `
                <div class="sm-gear-card focusable ${on ? 'focused' : ''} ${picked ? 'selected' : ''}" onclick="SceneManager._scene.enchantSelectSlot(${idx})">
                    <span class="sm-skill-icon" style="${SkillMaster.getSkillIconStyle(slot.item.iconIndex)}"></span>
                    <span class="sm-gear-name">${esc(tx(slot.item.name))}</span>
                    ${wornTag}
                </div>`;
        });
        if (!slotsHTML) slotsHTML = `<div class="ui-empty"><div class="ui-empty-text">${esc(tr('noGear'))}</div></div>`;

        let boundHTML = '';
        const chips = this.enchantChips();
        this.enchantBound().forEach((entry, i) => {
            const spell = entry._enchantSpellId ? $dataSkills[entry._enchantSpellId] : null;
            const tagKeys = gearTagsOf(entry);
            const ST = tagRegistry();
            // What the piece holds: its spell, its tags, or both.
            const holds = [];
            if (entry._enchantSpellId) holds.push(spell ? tx(spell.name) : tr('lostSpell'));
            if (tagKeys.length && ST) holds.push(tagKeys.map(k => ST.name(k)).join(', '));
            const row = slots.length + i;
            const onRow = this._enchantColumn === 0 && this._enchantSlotIndex === row;
            const chipHTML = chips.map((chip, ci) => {
                const lit = onRow && (this._enchantChip || 0) === ci ? ' focused' : '';
                const call = chip === 'rename' ? `enchantRename(${entry.id})`
                    : chip === 'recover' ? `enchantRecover(${entry.id})`
                        : `enchantUnbind(${entry.id})`;
                return `<span class="ui-chip sm-skill-badge focusable${lit}${chip === 'unmake' ? ' sm-craft-discard' : ''}"
                        onclick="SceneManager._scene.${call}">${esc(tr(chip))}</span>`;
            }).join('');
            boundHTML += `
                <div class="sm-skill-row sm-craft-entry ${onRow ? 'sm-craft-entry--cursor' : ''}">
                    <span class="sm-skill-ident"><span class="sm-skill-icon" style="${SkillMaster.getSkillIconStyle(entry.iconIndex)}"></span><span class="sm-skill-name">${esc(entry.name)}</span></span>
                    <span class="ui-chip sm-skill-badge">${esc(holds.join(' + ') || tr('lostSpell'))}</span>
                    ${chipHTML}
                </div>`;
        });
        if (!boundHTML) boundHTML = `<div class="ui-empty"><div class="ui-empty-text">${esc(tr('noneBound'))}</div></div>`;

        leftBox.innerHTML = `
            <div class="page-header-bar sm-bench-header">
              <div class="back-button focusable" onclick="SceneManager._scene.closeEnchantBench()">${esc(tr('back'))}</div>
              <h2 class="title">${esc(tr('title' + kindWord))}</h2>
              <div class="sm-bench-kp-pill"><strong>${knowledge} KP</strong></div>
            </div>
            <div class="backpack-tabs-row sm-bench-tabs">
              <div class="backpack-tab sm-bench-tab focusable ${kind === 'weapon' ? 'active' : ''}" onclick="SceneManager._scene.openEnchantBench('weapon')">${esc(tr('titleWeapon'))}</div>
              <div class="backpack-tab sm-bench-tab focusable ${kind === 'armor' ? 'active' : ''}" onclick="SceneManager._scene.openEnchantBench('armor')">${esc(tr('titleArmor'))}</div>
              <div class="backpack-tab sm-bench-tab focusable ${kind === 'book' ? 'active' : ''}" onclick="SceneManager._scene.openEnchantBench('book')">${esc(tr('titleBook'))}</div>
            </div>
            <div class="sm-enchant-blurb cc-bio-note">${esc(tr('blurb' + kindWord))}</div>
            ${K.title(ENCHANT_ICONS[kind], tr('chooseGear'), slots.length)}
            <div id="enchant-gear-box" class="ui-scroll sm-gear-grid sm-bench-split-list">
                ${slotsHTML}
            </div>
            ${K.title(ENCHANT_ICONS.bound, tr('boundSoFar'), this.enchantBound().length)}
            <div id="enchant-bound-box" class="ui-list ui-scroll sm-forged-list sm-bench-split-list">
                ${boundHTML}
            </div>`;

        // A weapon or a piece of armour on the bench is enchanted on the form;
        // a book is still the spell it is written with, picked off the list.
        if (isGearKind(kind) && chosen) {
            rightBox.innerHTML = this.renderEnchantFormHTML(knowledge);
            if (this._enchantPreviewIcon && window.ItemInspect && window.ItemInspect.drawIcon) {
                window.ItemInspect.drawIcon(this._enchantPreviewIcon, 'enchant-preview-canvas');
            }
            return;
        }

        const spells = this.enchantSpells();
        let spellsHTML = '';
        spells.forEach((spell, idx) => {
            const cost = enchantCost(spell, kind);
            const afford = knowledge >= cost;
            const on = this._enchantColumn === 1 && this._enchantSpellIndex === idx;
            const elName = ($dataSystem.elements || [])[enchantElement(spell)] || '';
            spellsHTML += `
                <div class="sm-skill-row focusable ${on ? 'focused' : ''} ${(afford && chosen) ? '' : 'unusable'}" onclick="SceneManager._scene.enchantBind(${idx})">
                    <span class="sm-skill-ident"><span class="sm-skill-icon" style="${SkillMaster.getSkillIconStyle(spell.iconIndex)}"></span><span class="sm-skill-name">${esc(tx(spell.name))}</span></span>
                    ${kind === 'weapon' ? `<span class="ui-chip sm-skill-badge">${esc(tx(elName))}</span>` : ''}
                    <span class="sm-forge-cost">${cost} KP</span>
                </div>`;
        });
        if (!spellsHTML) spellsHTML = `<div class="ui-empty"><div class="ui-empty-text">${esc(tr('noSpells'))}</div></div>`;

        const target = chosen
            ? tr('bindingInto', { item: tx(chosen.item.name) })
            : tr('pickGearFirst');

        rightBox.innerHTML = `
            <div class="page-header-bar sm-bench-header">
              <h2 class="title">${esc(tr('spellsTitle'))}</h2>
              <div class="sm-bench-kp-pill"><strong>${knowledge} KP</strong></div>
            </div>
            ${K.title(chosen ? chosen.item.iconIndex : ENCHANT_ICONS[kind], target)}
            <div id="enchant-spell-box" class="ui-list ui-scroll sm-forged-list sm-forged-list--fill">
                ${spellsHTML}
            </div>`;
    };

    Proto.updateEnchantBenchInput = function () {
        // The catalogue and the spell picker are modal: while one is up it
        // reads the pad itself.
        if (window.CCPick && window.CCPick.isOpen && window.CCPick.isOpen()) {
            window.CCPick.pollInput();
            return;
        }
        const tabStep = (window.CCNav ? window.CCNav.railDir() : 0);
        if (tabStep !== 0) {
            const kinds = ['weapon', 'armor', 'book'];
            const curIdx = kinds.indexOf(this._enchantKind || 'weapon');
            const nextIdx = (curIdx + tabStep + kinds.length) % kinds.length;
            this.openEnchantBench(kinds[nextIdx]);
            return;
        }
        if (Input.isTriggered('cancel') || Input.isTriggered('escape') || TouchInput.isCancelled()) {
            if (this._enchantColumn === 1) {
                this._enchantColumn = 0;
                this._enchantChosen = null;
                SoundManager.playCancel();
                this.refreshUISkillDOM();
            } else {
                this.closeEnchantBench();
            }
            return;
        }
        if (this._enchantColumn === 1 && isGearKind(this._enchantKind) && this._enchantChosen) {
            this.updateEnchantFormInput();
            return;
        }
        const spells = this._enchantColumn === 1;
        // Binding a spell or unmaking a piece shortens the list under the
        // cursor; where it stands is answered against the list as it is now.
        if (!spells) {
            this._enchantSlotIndex = Math.max(0,
                Math.min(this._enchantSlotIndex || 0, this.enchantLeftRows() - 1));
        }
        const length = spells ? this.enchantSpells().length : this.enchantLeftRows();
        const key = spells ? '_enchantSpellIndex' : '_enchantSlotIndex';
        const boxId = spells ? 'enchant-spell-box' : 'enchant-gear-box';
        const entry = spells ? null : this.enchantBoundAt(this._enchantSlotIndex);
        if (Input.isTriggered('ok')) {
            if (spells) this.enchantBind(this[key]);
            else if (entry) this.enchantRunChip(entry);
            else this.enchantSelectSlot(this[key]);
            return;
        }
        // On a piece already bound, left and right step its own chips; on a
        // piece waiting for one they cross to the spell book and back.
        const chips = this.enchantChips().length;
        const prevChip = this._enchantChip || 0;
        // The pieces are a grid: left and right walk its row, and the end of a
        // row crosses to the spell book once a piece is chosen.
        const cols = ENCHANT_GEAR_COLS;
        const gear = this.enchantSlots().length;
        const at = this._enchantSlotIndex || 0;
        const inGrid = !spells && !entry && at < gear;
        if (Input.isTriggered('right') || Input.isRepeated('right')) {
            if (entry && prevChip < chips - 1) this._enchantChip = prevChip + 1;
            else if (inGrid && at % cols < cols - 1 && at + 1 < gear) this._enchantSlotIndex = at + 1;
            else if (!spells && this._enchantChosen) this._enchantColumn = 1;
            else return;
            SoundManager.playCursor();
            this.refreshUISkillDOM();
            return;
        }
        if (Input.isTriggered('left') || Input.isRepeated('left')) {
            if (entry && prevChip > 0) this._enchantChip = prevChip - 1;
            else if (spells) this._enchantColumn = 0;
            else if (inGrid && at % cols > 0) this._enchantSlotIndex = at - 1;
            else return;
            SoundManager.playCursor();
            this.refreshUISkillDOM();
            return;
        }
        if (!length) return;
        const prev = this[key];
        const down = Input.isTriggered('down') || Input.isRepeated('down');
        const up = Input.isTriggered('up') || Input.isRepeated('up');
        if (spells || (!down && !up)) {
            if (down) this[key] = (prev + 1) % length;
            else if (up) this[key] = (prev - 1 + length) % length;
        } else if (down) {
            const lastRow = Math.floor((gear - 1) / cols);
            if (prev >= gear) this[key] = (prev + 1) % length;
            else if (prev + cols < gear) this[key] = prev + cols;
            else if (Math.floor(prev / cols) < lastRow) this[key] = gear - 1;
            else this[key] = length > gear ? gear : prev % cols;
        } else {
            if (prev > gear) this[key] = prev - 1;
            else if (prev === gear) this[key] = Math.max(0, gear - 1);
            else if (prev - cols >= 0) this[key] = prev - cols;
            else if (length > gear) this[key] = length - 1;
        }
        if (this[key] !== prev) {
            // Coming onto a bound row always offers the harmless chip first, so
            // a held Down can never land the cursor on Unmake.
            this._enchantChip = 0;
            SoundManager.playCursor();
            this.refreshUISkillDOM();
            // Whichever of the two lists on the left page the cursor landed in.
            const box = spells ? boxId
                : (this.enchantBoundAt(this[key]) ? 'enchant-bound-box' : 'enchant-gear-box');
            this.scrollToActiveItem(box, '#' + box + ' .focused, #' + box + ' .sm-craft-entry--cursor'); // i18n-ignore: CSS selector
        }
    };

    //=========================================================================
    // What a binding does in battle
    //
    // One hook, on the moment a hit is resolved. A weapon answers every
    // critical it lands; a piece of armour answers the first critical its
    // wearer takes in a battle and then stays quiet until the next one.
    // Neither ever pays MP, because neither goes through paySkillCost.
    //=========================================================================

    function boundSpellOf(item) {
        if (!item) return null;
        const id = Number((item.meta && item.meta.EnchantSpell) || item._enchantSpellId || 0);
        if (!id) return null;
        return (typeof $dataSkills !== 'undefined' && $dataSkills) ? ($dataSkills[id] || null) : null;
    }
    SkillMaster.Enchant.boundSpellOf = boundSpellOf;

    // Which pieces have already spoken this battle, keyed battler:item. Kept
    // here rather than on the battler so nothing transient is serialized.
    let _firedThisBattle = new Set();
    // Guards the recursion: a bound spell's own hit never triggers a binding.
    let _resolving = false;

    const _BattleManager_startBattle_ench = BattleManager.startBattle;
    BattleManager.startBattle = function () {
        _firedThisBattle = new Set();
        _resolving = false;
        _BattleManager_startBattle_ench.call(this);
    };

    function battlerKey(battler) {
        if (!battler) return 'x';
        if (battler.isActor && battler.isActor()) return 'a' + battler.actorId();
        return 'e' + (battler.index ? battler.index() : 0);
    }

    function castBound(subject, spell, targets) {
        if (!subject || !spell || !targets || !targets.length) return;
        _resolving = true;
        try {
            const action = new Game_Action(subject);
            action.setSkill(spell.id);
            const log = BattleManager._logWindow;
            const animId = spell.animationId < 0
                ? (subject.attackAnimationId1 ? subject.attackAnimationId1() : 0)
                : spell.animationId;
            if (log && typeof log.push === 'function') {
                log.push('addText', tr('log.fires', { spell: tx(spell.name) }));
                if (animId > 0) log.push('showAnimation', subject, targets.slice(), animId);
            }
            for (const t of targets) {
                if (!t) continue;
                action.apply(t);
                if (log && typeof log.push === 'function') log.push('displayActionResults', subject, t);
            }
            if (action.applyGlobal) action.applyGlobal();
        } catch (e) {
            console.error('SkillMaster: a bound spell failed to resolve', e);
        } finally {
            _resolving = false;
        }
    }

    /** Every critical the weapon lands, on whatever it just hit. */
    function onCriticalDealt(subject, target) {
        if (!subject || !subject.weapons) return;
        for (const weapon of subject.weapons()) {
            const spell = boundSpellOf(weapon);
            if (!spell) continue;
            const action = new Game_Action(subject);
            action.setSkill(spell.id);
            const targets = action.isForAll()
                ? subject.opponentsUnit().aliveMembers()
                : [target].filter(t => t && t.isAlive());
            castBound(subject, spell, targets);
        }
    }

    /** The first critical the wearer takes in a battle, and no more. */
    function onCriticalTaken(wearer) {
        if (!wearer || !wearer.armors) return;
        for (const armor of wearer.armors()) {
            const spell = boundSpellOf(armor);
            if (!spell) continue;
            const key = battlerKey(wearer) + ':' + armor.id;
            if (_firedThisBattle.has(key)) continue;
            _firedThisBattle.add(key);
            const action = new Game_Action(wearer);
            action.setSkill(spell.id);
            const targets = (action.isForAll() && !action.isForUser())
                ? wearer.friendsUnit().aliveMembers()
                : [wearer];
            castBound(wearer, spell, targets);
        }
    }

    SkillMaster.Enchant.onCriticalDealt = onCriticalDealt;
    SkillMaster.Enchant.onCriticalTaken = onCriticalTaken;

    const _Game_Action_apply_ench = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function (target) {
        _Game_Action_apply_ench.call(this, target);
        if (_resolving) return;
        if (typeof $gameParty === 'undefined' || !$gameParty || !$gameParty.inBattle()) return;
        const result = target && target.result ? target.result() : null;
        if (!result || !result.isHit() || !result.critical) return;
        const subject = this.subject();
        if (!subject) return;
        onCriticalDealt(subject, target);
        onCriticalTaken(target);
    };

})();


//=============================================================================
// Module: SkillMasterWrite.js
//=============================================================================
/*:
 * @target MZ
 * @plugindesc v1.0.0 SkillMaster - the writing bench: copying what the party knows into a skill book or a grimorie.
 * @author Omni-Lex
 *
 * @help
 * The enchanting bench spends a spell. This one copies one out. Pick anything
 * the party already knows and the bench writes it down:
 *
 *   Write Skill Book   ordinary abilities, the ones no school claims
 *   Write Grimorie     spells, and only spells
 *
 * What comes off it is a unique volume that opens in the grimoire reader, on
 * the pages the writer chose rather than on five rolled at random. Its one
 * rule is the one that makes it worth writing: it does not close until every
 * entry in it has been read out to somebody. Pick a reader per page with the
 * party list the reader already draws, or cancel - and a cancelled reading
 * costs nothing at all, because the volume goes back in the pack and every
 * page taken from it in that sitting is given back.
 *
 * That cancelling is the reader's now, not this bench's, so it covers the
 * grimoires and skill books the world already ships as well.
 *
 * The knowledge is paid once, per page, at the moment the volume is written.
 */

(() => {
    'use strict';

    window.SkillMaster = window.SkillMaster || {};
    const SkillMaster = window.SkillMaster;

    const tr = (key, params) => (typeof T === 'function' ? T('SkillMaster.write.' + key, params) : key);

    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const tx = (s) => (typeof window.translateText === 'function' ? window.translateText(s) : s);

    // How many pages one volume may hold. Five is what the reader draws.
    const WRITE_MAX_ENTRIES = 5;
    SkillMaster.WRITE_MAX_ENTRIES = WRITE_MAX_ENTRIES;

    const E = () => SkillMaster.Enchant || {};

    /** Everything anybody in the party knows that this bench will copy out. */
    function writableEntries(kind) {
        const wantSpell = kind === 'grimorie';
        const seen = new Set();
        const out = [];
        const En = E();
        for (const actor of $gameParty.allMembers()) {
            for (const s of actor.skills()) {
                if (!s || !s.id || seen.has(s.id)) continue;
                seen.add(s.id);
                if (s.id === 1 || (SkillMaster.isHiddenSkill ? SkillMaster.isHiddenSkill(s) : s.id === 2)) continue;
                const magic = En.isSpell ? En.isSpell(s) : false;
                if (magic !== wantSpell) continue;
                out.push(s);
            }
        }
        const name = (s) => (SkillMaster.skillSortName ? SkillMaster.skillSortName(s) : s.name);
        out.sort((a, b) => name(a).localeCompare(name(b)));
        return out;
    }
    SkillMaster.writableEntries = writableEntries;

    /** What one page costs. The same measure the enchanting bench charges by. */
    function pageCost(skill) {
        const En = E();
        return En.cost ? En.cost(skill, 'write') : 120;
    }

    function volumeCost(skills) {
        return (skills || []).reduce((sum, s) => sum + pageCost(s), 0);
    }
    SkillMaster.Write = { pageCost: pageCost, volumeCost: volumeCost, writableEntries: writableEntries };

    /**
     * The volume itself. It carries its pages on itself, so the reader needs
     * no common event and no row in data/ of its own: <GrimoireEntries:> is
     * the whole of what the reader is told.
     */
    function forgeVolume(kind, skills) {
        const En = E();
        const ids = skills.map(s => s.id);
        const entry = {
            id: $gameSystem.allocEnchantedGearId(kind),
            name: '',
            iconIndex: skills[0] ? skills[0].iconIndex : 0,
            description: '',
            itypeId: 1,
            price: 0,
            consumable: false,
            scope: 0,
            occasion: 2,
            speed: 0,
            successRate: 100,
            repeats: 1,
            tpGain: 0,
            hitType: 0,
            animationId: 0,
            damage: { type: 0, elementId: 0, formula: '0', variance: 0, critical: false },
            // One effect, and it does nothing: an item with no effect at all is
            // drawn greyed in the item list, and the reader is opened off the
            // note tag rather than off a common event (id 0 retrieves nothing,
            // which Game_Interpreter#setupReservedCommonEvent guards for).
            effects: [{ code: 44, dataId: 0, value1: 0, value2: 0 }],
            note: '',
            meta: {}
        };
        const texture = (En.BOOK_TEXTURES && En.BOOK_TEXTURES.length)
            ? En.BOOK_TEXTURES[Math.floor(Math.random() * En.BOOK_TEXTURES.length)]
            : '';
        entry.name = rollVolumeName(kind, skills, entry.id);
        entry.description = tr(kind === 'grimorie' ? 'grimorieDesc' : 'skillBookDesc',
            { count: ids.length });
        entry.note = '<category:Books>\n<GrimoireEntries: ' + ids.join(',') + '>\n<Enchanted: ' + kind + '>' +
            (texture ? '\n<BookTexture: ' + texture + '>' : ''); // i18n-ignore: note tag
        entry.meta = {
            category: 'Books', // i18n-ignore: note tag value
            GrimoireEntries: ids.join(','),
            Enchanted: kind
        };
        if (texture) entry.meta.BookTexture = texture;
        entry._enchantKind = kind;
        entry._enchantEntries = ids.slice();
        entry._enchanted = true;
        return entry;
    }
    SkillMaster.Write.forgeVolume = forgeVolume;

    function rollVolumeName(kind, skills, salt) {
        const G = window.RandomBookGenerator;
        if (G && typeof G.generateTitle === 'function') {
            let a = (salt >>> 0) || 1;
            const rng = function () {
                a |= 0; a = (a + 0x6D2B79F5) | 0;
                let t = Math.imul(a ^ (a >>> 15), 1 | a);
                t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
                return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
            };
            try {
                const title = String(G.generateTitle(rng) || '').trim();
                if (title) return title;
            } catch (e) { /* fall through to the pattern */ }
        }
        return tr(kind === 'grimorie' ? 'grimorieFallbackName' : 'skillBookFallbackName',
            { first: tx(skills[0] ? skills[0].name : '') });
    }

    /** Writes the volume, spends the knowledge and puts it in the pack. */
    function writeVolume(kind, skills) {
        if (!skills || !skills.length) return null;
        const cost = volumeCost(skills);
        if ($gameSystem.getKnowledge() < cost) return null;
        const entry = forgeVolume(kind, skills);
        const En = E();
        if (En.restampEntry) En.restampEntry(entry);
        $gameSystem.getEnchantedGear().push(entry);
        $gameParty.gainItem(entry, 1);
        $gameSystem.spendKnowledge(cost);
        return entry;
    }
    SkillMaster.Write.writeVolume = writeVolume;

    //=========================================================================
    // The bench
    //=========================================================================

    const Proto = window.Scene_SkillEncyclopedia.prototype;

    Proto.openWriteBench = function (kind) {
        this._viewMode = 'writebook';
        this._writeKind = (kind === 'skillbook') ? 'skillbook' : 'grimorie';
        this._writeChosen = [];
        this._writeIndex = 0;
        this._writeRow = 0;
        this._writeChip = 0;
        this._writeColumn = 1;
        SoundManager.playOk();
        this.refreshUISkillDOM();
    };

    Proto.closeWriteBench = function () {
        this._viewMode = 'category';
        this._lastLeftMode = null;
        this._lastLeftCategory = null;
        this._lastRightMode = null;
        this._lastRightSkillId = null;
        this._lastRightKnowledge = null;
        SoundManager.playCancel();
        this.refreshUISkillDOM();
    };

    Proto.writeCandidates = function () {
        return writableEntries(this._writeKind || 'grimorie');
    };

    Proto.writeChosenSkills = function () {
        const ids = this._writeChosen || [];
        return ids.map(id => $dataSkills[id]).filter(Boolean);
    };

    Proto.writeToggle = function (idx) {
        const list = this.writeCandidates();
        const skill = list[idx];
        if (!skill) return;
        if (!this._writeChosen) this._writeChosen = [];
        const at = this._writeChosen.indexOf(skill.id);
        if (at >= 0) {
            this._writeChosen.splice(at, 1);
            SoundManager.playCancel();
        } else {
            if (this._writeChosen.length >= WRITE_MAX_ENTRIES) { SoundManager.playBuzzer(); return; }
            this._writeChosen.push(skill.id);
            SoundManager.playOk();
        }
        this._writeIndex = idx;
        this.refreshUISkillDOM();
    };

    Proto.writeCommit = function () {
        const skills = this.writeChosenSkills();
        if (!skills.length) { SoundManager.playBuzzer(); return; }
        if ($gameSystem.getKnowledge() < volumeCost(skills)) { SoundManager.playBuzzer(); return; }
        const entry = writeVolume(this._writeKind, skills);
        if (!entry) { SoundManager.playBuzzer(); return; }
        SoundManager.playSave();
        if (window.ParchmentToast) window.ParchmentToast.show(tr('written', { book: entry.name }));
        this._writeChosen = [];
        this._writeIndex = 0;
        this.refreshUISkillDOM();
    };

    Proto.writeUnmake = function (entryId) {
        const En = E();
        const kind = this._writeKind || 'grimorie';
        if (En.unbind && En.unbind(entryId, kind)) {
            // The next volume slides under the cursor: never onto Unmake.
            this._writeChip = 0;
            SoundManager.playCancel();
            this.refreshUISkillDOM();
        }
    };

    // What the buttons do on the bench the cursor is standing at. The badges
    // inside the buttons say the rest; this is for the moves that are not a
    // button at all - crossing between the two pages, stepping the chips on a
    // piece already made, walking the letter sheet onto a name.
    Proto.renderBenchPadTips = function () {
        if (!window.Controller || !Controller.tips) return;
        if (Controller.textEntryOpen && Controller.textEntryOpen()) return;
        const tip = (face, key) => ({ face: face, label: T('SkillMaster.tips.' + key) });
        const BENCHES = ['craft', 'enchant', 'writebook', 'hexorcize', 'lobotomagic', 'expression'];
        if (BENCHES.indexOf(this._viewMode) < 0 && this._viewMode !== 'spellEditor') { Controller.clearTips(); return; }
        const tips = [
            tip('A', 'pick'),
            tip('dpad', 'walk'),
            tip('B', 'back')
        ];
        if (this._viewMode === 'enchant' || this._viewMode === 'writebook' || this._viewMode === 'craft') {
            tips.push(tip('lr', 'mode'));
        }
        if (this._viewMode === 'lobotomagic') tips.push(tip('lr', 'member'));
        Controller.tips(tips);
    };

    // Every chip a written volume carries, in the order they stand on its row.
    const WRITE_CHIPS = ['rename', 'recover', 'unmake'];

    // The left page of the writing bench, as one list: the pages chosen for
    // this volume, the button that writes it, and then every volume already
    // written. Walked top to bottom, which is what put the pages and the
    // finished books back within reach of a cursor.
    Proto.writeMade = function () {
        const kind = this._writeKind || 'grimorie';
        return $gameSystem.getEnchantedGear().filter(e => e && e._enchantKind === kind);
    };

    Proto.writeLeftRows = function () {
        return this.writeChosenSkills().length + 1 + this.writeMade().length;
    };

    Proto.writeCommitRow = function () {
        return this.writeChosenSkills().length;
    };

    Proto.writeMadeAt = function (row) {
        const at = row - this.writeCommitRow() - 1;
        return at < 0 ? null : (this.writeMade()[at] || null);
    };

    Proto.writeRunChip = function (entry) {
        if (!entry) return;
        const chip = WRITE_CHIPS[this._writeChip || 0];
        if (chip === 'rename') this.enchantRename(entry.id);
        else if (chip === 'recover') this.enchantRecover(entry.id, 1);
        else this.writeUnmake(entry.id);
    };

    const WRITE_ICONS = { chosen: 189, written: 183 };

    Proto.renderWriteBench = function (knowledge) {
        const leftBox = document.getElementById('left-page-content');
        const rightBox = document.getElementById('right-page-content');
        if (!leftBox || !rightBox) return;
        const K = SkillMaster.BenchKit;
        const kind = this._writeKind || 'grimorie';
        const word = kind === 'grimorie' ? 'Grimorie' : 'SkillBook';
        const chosen = this.writeChosenSkills();
        const cost = volumeCost(chosen);
        const afford = knowledge >= cost && chosen.length > 0;

        const leftRow = this._writeColumn === 0 ? (this._writeRow || 0) : -1;
        let chosenHTML = '';
        chosen.forEach((s, i) => {
            const on = leftRow === i ? ' focused' : '';
            chosenHTML += `
                <div class="sm-skill-row focusable${on}" onclick="SceneManager._scene.writeDrop(${s.id})">
                    <span class="sm-skill-ident"><span class="sm-skill-icon" style="${SkillMaster.getSkillIconStyle(s.iconIndex)}"></span><span class="sm-skill-name">${esc(tx(s.name))}</span></span>
                    <span class="sm-forge-cost">${pageCost(s)} KP</span>
                </div>`;
        });
        if (!chosenHTML) chosenHTML = `<div class="ui-empty"><div class="ui-empty-text">${esc(tr('nothingChosen'))}</div></div>`;

        let writtenHTML = '';
        const chips = WRITE_CHIPS;
        this.writeMade().forEach((entry, i) => {
            const pages = (entry._enchantEntries || []).length;
            const onRow = leftRow === chosen.length + 1 + i;
            const chipHTML = chips.map((chip, ci) => {
                const lit = onRow && (this._writeChip || 0) === ci ? ' focused' : '';
                const call = chip === 'rename' ? `enchantRename(${entry.id})`
                    : chip === 'recover' ? `enchantRecover(${entry.id})`
                        : `writeUnmake(${entry.id})`;
                return `<span class="ui-chip sm-skill-badge focusable${lit}${chip === 'unmake' ? ' sm-craft-discard' : ''}"
                        onclick="SceneManager._scene.${call}">${esc(tr(chip))}</span>`;
            }).join('');
            writtenHTML += `
                <div class="sm-skill-row sm-craft-entry ${onRow ? 'sm-craft-entry--cursor' : ''}">
                    <span class="sm-skill-ident"><span class="sm-skill-icon" style="${SkillMaster.getSkillIconStyle(entry.iconIndex)}"></span><span class="sm-skill-name">${esc(entry.name)}</span></span>
                    <span class="ui-chip sm-skill-badge">${esc(tr('pages', { count: pages }))}</span>
                    ${chipHTML}
                </div>`;
        });
        if (!writtenHTML) writtenHTML = `<div class="ui-empty"><div class="ui-empty-text">${esc(tr('noneWritten'))}</div></div>`;

        const writeFocused = leftRow === chosen.length;
        leftBox.innerHTML = `
            <div class="page-header-bar sm-bench-header">
              <div class="back-button focusable" onclick="SceneManager._scene.closeWriteBench()">${esc(tr('back'))}</div>
              <h2 class="title">${esc(tr('title' + word))}</h2>
              <div class="sm-bench-kp-pill"><strong>${knowledge} KP</strong></div>
            </div>
            <div class="backpack-tabs-row sm-bench-tabs">
              <div class="backpack-tab sm-bench-tab focusable ${kind === 'grimorie' ? 'active' : ''}" onclick="SceneManager._scene.openWriteBench('grimorie')">${esc(tr('titleGrimorie'))}</div>
              <div class="backpack-tab sm-bench-tab focusable ${kind === 'skillbook' ? 'active' : ''}" onclick="SceneManager._scene.openWriteBench('skillbook')">${esc(tr('titleSkillBook'))}</div>
            </div>
            <div class="sm-enchant-blurb cc-bio-note">${esc(tr('blurb' + word))}</div>
            ${K.title(WRITE_ICONS.chosen, tr('chosenPages', { count: chosen.length, max: WRITE_MAX_ENTRIES }))}
            <div id="write-chosen-box" class="ui-list ui-scroll sm-forged-list sm-bench-split-list">
                ${chosenHTML}
            </div>
            <div class="inspect-actions sm-forge-actions">
                <div class="inspect-btn focusable ${writeFocused ? 'selected' : ''} ${afford ? '' : 'unusable'}" onclick="SceneManager._scene.writeCommit()">
                    ${esc(tr('writeIt'))} <span class="sm-forge-cost">&middot; ${cost} KP</span>
                </div>
            </div>
            ${K.title(WRITE_ICONS.written, tr('writtenSoFar'), this.writeMade().length)}
            <div id="write-made-box" class="ui-list ui-scroll sm-forged-list sm-bench-split-list">
                ${writtenHTML}
            </div>`;

        const list = this.writeCandidates();
        let listHTML = '';
        list.forEach((s, idx) => {
            const on = this._writeColumn === 1 && this._writeIndex === idx;
            const picked = (this._writeChosen || []).indexOf(s.id) >= 0;
            listHTML += `
                <div class="sm-skill-row focusable ${on ? 'focused' : ''} ${picked ? 'selected' : ''}" onclick="SceneManager._scene.writeToggle(${idx})">
                    <span class="sm-skill-ident"><span class="sm-skill-icon" style="${SkillMaster.getSkillIconStyle(s.iconIndex)}"></span><span class="sm-skill-name">${esc(tx(s.name))}</span></span>
                    <span class="sm-forge-cost">${pageCost(s)} KP</span>
                </div>`;
        });
        if (!listHTML) listHTML = `<div class="ui-empty"><div class="ui-empty-text">${esc(tr('nothingToCopy'))}</div></div>`;

        rightBox.innerHTML = `
            <div class="page-header-bar sm-bench-header">
              <h2 class="title">${esc(tr('source' + word))}</h2>
              <div class="sm-bench-kp-pill"><strong>${knowledge} KP</strong></div>
            </div>
            ${K.stats([
                { label: tr('statPages'), value: `${chosen.length}/${WRITE_MAX_ENTRIES}` },
                { label: tr('statCost'), value: `${cost} KP`, bad: chosen.length > 0 && knowledge < cost },
                { label: tr('knowledge'), value: `${knowledge} KP` }
            ], 3)}
            <div id="write-source-box" class="ui-list ui-scroll sm-forged-list sm-forged-list--fill">
                ${listHTML}
            </div>`;
    };

    Proto.writeDrop = function (skillId) {
        if (!this._writeChosen) return;
        const at = this._writeChosen.indexOf(skillId);
        if (at < 0) return;
        this._writeChosen.splice(at, 1);
        SoundManager.playCancel();
        this.refreshUISkillDOM();
    };

    Proto.updateWriteBenchInput = function () {
        if ((window.CCNav ? window.CCNav.railDir() : 0) !== 0) {
            const nextKind = (this._writeKind === 'skillbook') ? 'grimorie' : 'skillbook';
            this.openWriteBench(nextKind);
            return;
        }
        if (Input.isTriggered('cancel') || Input.isTriggered('escape') || TouchInput.isCancelled()) {
            this.closeWriteBench();
            return;
        }
        const left = this._writeColumn === 0;
        // A page dropped or a volume written shortens the list under the
        // cursor, so where it is standing is answered against the list as it
        // is now rather than as it was.
        this._writeRow = Math.max(0, Math.min(this._writeRow || 0, this.writeLeftRows() - 1));
        const row = this._writeRow;
        const made = left ? this.writeMadeAt(row) : null;
        if (Input.isTriggered('ok')) {
            if (!left) this.writeToggle(this._writeIndex);
            else if (made) this.writeRunChip(made);
            else if (row === this.writeCommitRow()) this.writeCommit();
            else {
                const page = this.writeChosenSkills()[row];
                if (page) this.writeDrop(page.id);
                else SoundManager.playBuzzer();
            }
            return;
        }
        // On a volume already written, left and right step its own chips;
        // anywhere else on the page they cross between the two columns.
        const prevChip = this._writeChip || 0;
        if (Input.isTriggered('left') || Input.isRepeated('left')) {
            if (made && prevChip > 0) this._writeChip = prevChip - 1;
            else if (left) return;
            else this._writeColumn = 0;
            SoundManager.playCursor();
            this.refreshUISkillDOM();
            return;
        }
        if (Input.isTriggered('right') || Input.isRepeated('right')) {
            if (made && prevChip < WRITE_CHIPS.length - 1) this._writeChip = prevChip + 1;
            else if (!left) return;
            else this._writeColumn = 1;
            SoundManager.playCursor();
            this.refreshUISkillDOM();
            return;
        }
        const length = left ? this.writeLeftRows() : this.writeCandidates().length;
        if (!length) return;
        const key = left ? '_writeRow' : '_writeIndex';
        const prev = this[key] || 0;
        if (Input.isTriggered('down') || Input.isRepeated('down')) this[key] = (prev + 1) % length;
        else if (Input.isTriggered('up') || Input.isRepeated('up')) this[key] = (prev - 1 + length) % length;
        if (this[key] !== prev) {
            // Coming onto a written volume always offers the harmless chip
            // first, so a held Down can never land the cursor on Unmake.
            this._writeChip = 0;
            SoundManager.playCursor();
            this.refreshUISkillDOM();
            const box = !left ? 'write-source-box'
                : (this.writeMadeAt(this[key]) ? 'write-made-box' : 'write-chosen-box');
            this.scrollToActiveItem(box, '#' + box + ' .focused, #' + box + ' .sm-craft-entry--cursor'); // i18n-ignore: CSS selector
        }
    };

})();


//=============================================================================
// Module: SkillMasterHexorcize.js
//=============================================================================
/*:
 * @target MZ
 * @plugindesc v1.0.0 SkillMaster - the Hexorcizing bench: unmaking magical gear back into knowledge.
 * @author Omni-Lex
 *
 * @help
 * The Enchanting bench spends knowledge to put a spell into a piece of gear.
 * This one runs the other way: a weapon or a piece of equipment whose notebox
 * says `<Nature: Magical>` is taken apart, and what was worked into it comes
 * back out as KP.
 *
 * Only what the party is CARRYING is on the bench. Anything worn stays worn:
 * a piece has to be taken off before it can be unmade, so nobody hexorcizes
 * the armour off their own back by walking the cursor down a list.
 *
 * What a piece is worth is read off what it is: its price, the stats it
 * carries, and a half again on top when it is a bound artifact, because a
 * binding put knowledge into it that the bench can take back.
 */

(() => {
    'use strict';

    window.SkillMaster = window.SkillMaster || {};
    const SkillMaster = window.SkillMaster;
    SkillMaster.Hexorcize = SkillMaster.Hexorcize || {};

    const tr = (key, params) => (typeof T === 'function' ? T('SkillMaster.hexorcize.' + key, params) : key);

    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const tx = (s) => (typeof window.translateText === 'function' ? window.translateText(s) : s);

    //=========================================================================
    // What a piece gives back
    //=========================================================================

    const HEX_BASE = 10;        // every piece is worth opening at all
    const HEX_PRICE_DIV = 25;   // what the market thought it was worth
    const HEX_PARAM = 4;        // per point of stat worked into it
    const HEX_BOUND_MULT = 1.5; // a bound artifact holds a spell's knowledge
    const HEX_MIN = 15;
    const HEX_MAX = 20000;

    function hexValue(item) {
        if (!item) return 0;
        const price = Math.max(0, item.price || 0);
        const params = (item.params || []).reduce((a, b) => a + Math.abs(b || 0), 0);
        const bound = (item._enchanted || (item.meta && item.meta.EnchantSpell)) ? HEX_BOUND_MULT : 1;
        const raw = (HEX_BASE + price / HEX_PRICE_DIV + params * HEX_PARAM) * bound;
        return Math.max(HEX_MIN, Math.min(HEX_MAX, Math.round(raw)));
    }
    SkillMaster.Hexorcize.value = hexValue;

    /** True when the notebox says this thing works by magic. */
    function isMagicalGear(item) {
        const MN = window.MagicNature;
        if (MN && typeof MN.isMagicalData === 'function') return MN.isMagicalData(item);
        return /<Nature:\s*Magical\s*>/i.test((item && item.note) || '');
    }
    SkillMaster.Hexorcize.isMagicalGear = isMagicalGear;

    /**
     * Everything the bench will take: the magical weapons and armours in the
     * pack. $gameParty.weapons() and .armors() hold what is CARRIED and never
     * what is worn, so a piece on somebody's back is out of reach by the same
     * rule that keeps it equipped.
     */
    function hexorcizableGear() {
        const out = [];
        if (!window.$gameParty) return out;
        const push = (item) => {
            if (!item || !isMagicalGear(item)) return;
            const count = $gameParty.numItems(item);
            if (count <= 0) return;
            out.push({ item: item, count: count, kp: hexValue(item) });
        };
        $gameParty.weapons().forEach(push);
        $gameParty.armors().forEach(push);
        const name = (row) => tx(row.item.name) || '';
        out.sort((a, b) => name(a).localeCompare(name(b)));
        return out;
    }
    SkillMaster.Hexorcize.gear = hexorcizableGear;

    /** Unmakes `count` of a piece and pays the knowledge out. Returns the KP. */
    function hexorcize(item, count) {
        if (!item) return 0;
        const have = $gameParty.numItems(item);
        const take = Math.max(0, Math.min(count || 1, have));
        if (take <= 0) return 0;
        const gain = hexValue(item) * take;
        $gameParty.loseItem(item, take);
        $gameSystem.addKnowledge(gain);
        return gain;
    }
    SkillMaster.Hexorcize.run = hexorcize;

    //=========================================================================
    // The bench
    //=========================================================================

    const Proto = window.Scene_SkillEncyclopedia.prototype;

    // One row, two chips: unmake one of them, or unmake the whole stack.
    const HEX_CHIPS = ['one', 'all'];

    // ── Expression ─────────────────────────────────────────────────────
    // The Expressions bench lists the party members an expression seed has given
    // Expression to (Weapon/ExpressionSystem.js, window.Expression). It stays
    // greyed out while nobody in the party has it.
    function expressionReady() {
        return !!(window.Expression && window.Expression.anyInParty());
    }

    function expressionMembers() {
        return window.Expression ? window.Expression.members() : [];
    }

    Proto.openExpressionPicker = function () {
        if (!expressionReady()) {
            SoundManager.playBuzzer();
            return;
        }
        this._expressionPicking = true;
        this._expressionIndex = 0;
        this._lastRightMode = null;
        SoundManager.playOk();
        this.refreshUISkillDOM();
    };

    Proto.closeExpressionPicker = function () {
        this._expressionPicking = false;
        this._lastRightMode = null;
        SoundManager.playCancel();
        this.refreshUISkillDOM();
    };

    Proto.pickExpressionActor = function (index) {
        const actor = expressionMembers()[index];
        if (!actor) {
            SoundManager.playBuzzer();
            return;
        }
        this._expressionIndex = index;
        this.openExpressionBench(actor.actorId());
    };

    Proto.renderExpressionPickerHTML = function () {
        const rows = expressionMembers().map((actor, idx) => {
            const sel = actor.actorId() === this._exprActorId ? ' selected' : '';
            return `<div class="inspect-btn expression-actor-btn focusable${sel}" data-idx="${idx}" onclick="SceneManager._scene.pickExpressionActor(${idx})">${esc(actor.name())}</div>`;
        }).join('');
        return `
            <div class="page-header-bar">
              <div class="back-button focusable" onclick="SceneManager._scene.closeExpressionPicker()">${T('SkillMaster.back')}</div>
              <h2 class="title">${T('SkillMaster.expression.title')}</h2>
            </div>
            <div class="ui-prose sm-bench-blurb">${T('SkillMaster.expression.pickBlurb')}</div>
            <div id="sm-expression-list" class="sm-action-rail ui-scroll">${rows}</div>
        `;
    };

    Proto.paintExpressionFocus = function () {
        const members = expressionMembers();
        document.querySelectorAll('.expression-actor-btn').forEach((el) => {
            const idx = parseInt(el.dataset.idx, 10);
            const on = idx === (this._expressionIndex || 0);
            const actor = members[idx];
            el.classList.toggle('focused', on);
            el.classList.toggle('selected', !!actor && actor.actorId() === this._exprActorId);
            if (on && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
        });
    };

    // ── The Expression bench ───────────────────────────────────────────
    // One character's power, assembled the way the vector gun is fitted: a
    // page of cards per kind of piece on the left, the blueprint on the right.
    // Confirming a card fits it (a card bound to something asks what first);
    // the blueprint's chips take pieces off, turn a condition around with NOT
    // and switch the conditions between ALL and ANY. Finalize spends the KP.
    const EXPR_COLS = 3;
    const exprApi = () => window.Expression;
    const exprT = (key, params) => T('SkillMaster.expression.' + key, params);

    Proto.openExpressionBench = function (actorId) {
        this._viewMode = 'expression';
        this._exprActorId = actorId;
        this._exprTab = this._exprTab || 'trigger';
        this._exprIndex = 0;
        this._exprPane = 0;
        this._exprRightIndex = 0;
        this._exprArgFor = null;
        this._exprArgIndex = 0;
        this._exprDestRule = this._exprDestRule || 'rules';
        this._exprDestEffect = this._exprDestEffect || 'effects';
        this._expressionPicking = false;
        SoundManager.playOk();
        this.refreshUISkillDOM();
    };

    Proto.closeExpressionBench = function () {
        this._viewMode = 'category';
        this._expressionPicking = true;
        this._lastLeftMode = null;
        this._lastLeftCategory = null;
        this._lastRightMode = null;
        this._lastRightSkillId = null;
        this._lastRightKnowledge = null;
        SoundManager.playCancel();
        this.refreshUISkillDOM();
    };

    Proto.exprActor = function () {
        return $gameActors.actor(this._exprActorId);
    };

    Proto.exprOptions = function () {
        return exprApi().options(this._exprTab);
    };

    Proto.exprSlotFor = function (cat) {
        if (cat === 'limit') return 'limits';
        if (cat === 'rule') return this._exprDestRule === 'branch' ? 'branch' : 'rules';
        if (cat === 'effect') return this._exprDestEffect === 'elseEffects' ? 'elseEffects' : 'effects';
        return cat;
    };

    Proto.exprTurnTab = function (tab) {
        const tabs = exprApi().CATEGORIES;
        const next = typeof tab === 'number'
            ? tabs[(tabs.indexOf(this._exprTab) + tab + tabs.length) % tabs.length] : tab;
        if (!next || next === this._exprTab) return;
        this._exprTab = next;
        this._exprIndex = 0;
        this._exprArgFor = null;
        this._exprPane = 0;
        SoundManager.playCursor();
        this.refreshUISkillDOM();
    };

    Proto.exprSetDest = function (dest) {
        if (this._exprTab === 'rule') this._exprDestRule = dest === 'branch' ? 'branch' : 'rules';
        else if (this._exprTab === 'effect') {
            if (dest === 'elseEffects' && !exprApi().draft(this.exprActor()).branch) {
                SoundManager.playBuzzer();
                this.exprToast(exprT('needsBranch'), 'warning');
                return;
            }
            this._exprDestEffect = dest === 'elseEffects' ? 'elseEffects' : 'effects';
        }
        SoundManager.playCursor();
        this.refreshUISkillDOM();
    };

    Proto.exprCycleDest = function () {
        if (this._exprTab === 'rule') this.exprSetDest(this._exprDestRule === 'branch' ? 'rules' : 'branch');
        else if (this._exprTab === 'effect') this.exprSetDest(this._exprDestEffect === 'elseEffects' ? 'effects' : 'elseEffects');
    };

    Proto.exprToast = function (text, severity) {
        if (window.ParchmentToast) window.ParchmentToast.show(text, { severity: severity || 'info' });
    };

    Proto.exprReport = function (result) {
        if (result.ok) {
            SoundManager.playOk();
            return;
        }
        SoundManager.playBuzzer();
        const msg = exprT('refusal.' + result.reason);
        if (msg) this.exprToast(msg, 'warning');
    };

    Proto.exprPick = function (idx) {
        const o = this.exprOptions()[idx];
        const actor = this.exprActor();
        if (!o || !actor) return;
        this._exprIndex = idx;
        const E = exprApi();
        const slot = this.exprSlotFor(o.cat);
        if (!E.meets(actor, o.key)) {
            SoundManager.playBuzzer();
            this.exprToast(exprT('needs', { stat: this.exprStatName(o.stat), req: E.reqFor(actor, o.key) }), 'warning');
            this.refreshUISkillDOM();
            return;
        }
        if (o.param) {
            if (!E.argChoices(actor, o.param).length) {
                SoundManager.playBuzzer();
                this.exprToast(exprT('noChoices'), 'warning');
                return;
            }
            this._exprArgFor = o.key;
            this._exprArgIndex = 0;
            SoundManager.playOk();
            this.refreshUISkillDOM();
            return;
        }
        this.exprReport(E.place(actor, slot, o.key, null));
        this.refreshUISkillDOM();
    };

    Proto.exprPickArg = function (idx) {
        const E = exprApi();
        const actor = this.exprActor();
        const o = E.option(this._exprArgFor);
        if (!o || !actor) return;
        const choice = E.argChoices(actor, o.param)[idx];
        if (!choice) return;
        this.exprReport(E.place(actor, this.exprSlotFor(o.cat), o.key, choice.arg));
        this._exprArgFor = null;
        this.refreshUISkillDOM();
    };

    Proto.exprCloseArg = function () {
        this._exprArgFor = null;
        SoundManager.playCancel();
        this.refreshUISkillDOM();
    };

    Proto.exprRun = function (idx) {
        const action = (this._exprActions || [])[idx];
        if (!action) return;
        this._exprRightIndex = idx;
        action();
        this.refreshUISkillDOM();
    };

    Proto.exprRemove = function (slot, index) {
        exprApi().removeAt(this.exprActor(), slot, index);
        if (slot === 'branch' && this._exprDestEffect === 'elseEffects') this._exprDestEffect = 'effects';
        SoundManager.playCancel();
    };

    Proto.exprToggleNot = function (slot, index) {
        exprApi().toggleNot(this.exprActor(), slot, index);
        SoundManager.playCursor();
    };

    Proto.exprToggleLogic = function () {
        const d = exprApi().draft(this.exprActor());
        exprApi().setLogic(this.exprActor(), d.logic === 'all' ? 'any' : 'all');
        SoundManager.playCursor();
    };

    Proto.exprFinalize = function () {
        const actor = this.exprActor();
        const result = exprApi().finalize(actor);
        if (!result.ok) {
            SoundManager.playBuzzer();
            this.exprToast(exprT('refusal.' + result.reason, { kp: result.cost }), 'warning');
            return;
        }
        SoundManager.playSave();
        this.exprToast(exprT('finalizedToast', { name: actor.name() }), 'good');
        this._lastRightKnowledge = null;
    };

    Proto.exprStatName = function (stat) {
        return window.SkillStatReq ? window.SkillStatReq.statName(stat) : stat;
    };

    Proto.exprCardHTML = function (o, idx, actor) {
        const E = exprApi();
        const d = E.draft(actor);
        const fitted = [d.form, d.trigger, d.branch].concat(d.rules, d.effects, d.elseEffects, d.limits || [])
            .some(e => e && e.key === o.key);
        const open = E.meets(actor, o.key);
        const cursor = this._exprPane === 0 && idx === this._exprIndex;
        // A requirement reads as the draft's limitations have lowered it.
        const meta = o.cat === 'limit'
            ? exprT('limitWeight', { n: o.weight })
            : (o.stat && o.req
                ? `${this.exprStatName(o.stat)} ${E.statOf(actor, o.stat)}/${E.reqFor(actor, o.key)}`
                : T('Expression.where.' + o.where));
        const chip = fitted ? exprT('fitted')
            : (o.cat === 'limit' ? exprT('limitGives', { pct: Math.round(o.weight * E.LIMIT_DISCOUNT * 100) })
                : (o.cost ? `${o.cost} KP` : exprT('free')));
        return `
            <div class="item-slot focusable sm-expr-card${cursor ? ' selected' : ''}${fitted ? ' sm-expr-on' : ''}${open ? '' : ' sm-expr-locked'}${o.req >= 30 ? ' sm-expr-tier3' : o.req >= 20 ? ' sm-expr-tier2' : ''}"
                 onclick="SceneManager._scene.exprPick(${idx})">
                <span class="sm-skill-icon sm-expr-icon" style="${SkillMaster.getSkillIconStyle(o.icon)}"></span>
                <div class="item-slot-info">
                    <div class="item-slot-name">${esc(T('Expression.option.' + o.key + '.name'))}</div>
                    <div class="item-slot-meta">
                        <span>${esc(meta)}</span>
                        <span class="item-slot-count">${esc(chip)}</span>
                    </div>
                </div>
            </div>`;
    };

    Proto.renderExpressionBench = function (knowledge) {
        const leftBox = document.getElementById('left-page-content');
        const rightBox = document.getElementById('right-page-content');
        const actor = this.exprActor();
        const E = exprApi();
        if (!leftBox || !rightBox || !E || !actor) return;
        const K = SkillMaster.BenchKit;
        const d = E.draft(actor);
        // ELSE only exists behind a branch: a draft without one (a branch
        // taken off, or another character's bench) aims effects at THEN.
        if (!d.branch && this._exprDestEffect === 'elseEffects') this._exprDestEffect = 'effects';
        const options = this.exprOptions();
        this._exprIndex = Math.max(0, Math.min(this._exprIndex || 0, options.length - 1));

        const tabsHTML = E.CATEGORIES.map(cat => `
            <div class="backpack-tab focusable${cat === this._exprTab ? ' active' : ''}"
                 onclick="SceneManager._scene.exprTurnTab('${cat}')">${esc(T('Expression.category.' + cat))}</div>`).join('');

        let destHTML = '';
        if (this._exprTab === 'rule' || this._exprTab === 'effect') {
            const dests = this._exprTab === 'rule' ? ['rules', 'branch'] : ['effects', 'elseEffects'];
            const current = this._exprTab === 'rule' ? this._exprDestRule : this._exprDestEffect;
            destHTML = `<div class="sm-expr-dest"><span class="sm-expr-dest-label">${esc(exprT('placeIn'))}</span>${K.chips(dests.map(dest => ({
                label: exprT('slot.' + dest),
                selected: dest === current,
                disabled: dest === 'elseEffects' && !d.branch,
                onclick: `SceneManager._scene.exprSetDest('${dest}')`
            })))}</div>`;
        }

        let bodyHTML;
        if (this._exprArgFor) {
            const o = E.option(this._exprArgFor);
            const choices = E.argChoices(actor, o.param);
            this._exprArgIndex = Math.max(0, Math.min(this._exprArgIndex || 0, choices.length - 1));
            bodyHTML = `
                <div class="cc-bio-note sm-expr-bind">${esc(exprT('bindTo', { name: T('Expression.option.' + o.key + '.name') }))}</div>
                <div id="sm-expr-args" class="ui-list ui-scroll sm-forged-list sm-forged-list--fill">
                    ${choices.map((c, i) => `
                        <div class="sm-skill-row sm-craft-entry focusable${i === this._exprArgIndex ? ' sm-craft-entry--cursor' : ''}"
                             onclick="SceneManager._scene.exprPickArg(${i})">
                            <span class="sm-skill-ident">${c.icon ? `<span class="sm-skill-icon" style="${SkillMaster.getSkillIconStyle(c.icon)}"></span>` : ''}<span class="sm-skill-name">${esc(c.label)}</span></span>
                        </div>`).join('')}
                </div>`;
        } else {
            bodyHTML = `<div id="sm-expr-grid" class="backpack-grid sm-expr-grid">${options.map((o, i) => this.exprCardHTML(o, i, actor)).join('')}</div>`;
        }

        leftBox.innerHTML = `
            <div class="page-header-bar sm-bench-header">
              <div class="back-button focusable" onclick="SceneManager._scene.${this._exprArgFor ? 'exprCloseArg' : 'closeExpressionBench'}()">${esc(T('SkillMaster.back'))}</div>
              <h2 class="title">${esc(exprT('benchTitle', { name: actor.name() }))}</h2>
              <div class="sm-bench-kp-pill"><strong>${knowledge} KP</strong></div>
            </div>
            <div class="backpack-tabs sm-expr-tabs">${tabsHTML}</div>
            ${destHTML}
            ${bodyHTML}`;

        // The right page: the piece under the cursor, then the blueprint.
        const actions = [];
        const act = (fn) => { actions.push(fn); return actions.length - 1; };
        const lit = (i) => (this._exprPane === 1 && i === this._exprRightIndex ? ' focused sm-kit-cursor' : '');
        const chipBtn = (label, fn, cls) => {
            const i = act(fn);
            return `<span class="ui-chip sm-skill-badge focusable sm-expr-chip ${cls || ''}${lit(i)}" data-ra="${i}"
                onclick="event.stopPropagation(); SceneManager._scene.exprRun(${i})">${esc(label)}</span>`;
        };
        const slotRow = (slot, entry, index, extra) => {
            const lost = entry && E.isLost(actor, entry);
            const o = entry ? E.option(entry.key) : null;
            const key = slot === 'rules' || slot === 'effects' || slot === 'elseEffects'
                ? exprT('slot.' + slot) + ' ' + (index + 1) : exprT('slot.' + slot);
            const chips = entry ? (extra || '') + chipBtn(exprT('remove'), () => this.exprRemove(slot, index), 'sm-craft-discard') : '';
            return `
                <div class="sm-skill-row sm-expr-slot${entry ? ' sm-expr-slot--on' : ''}${lost ? ' sm-expr-slot--lost' : ''}">
                    <span class="sm-expr-slot-key">${esc(key)}</span>
                    <span class="sm-skill-ident">${o ? `<span class="sm-skill-icon" style="${SkillMaster.getSkillIconStyle(o.icon)}"></span>` : ''}<span class="sm-skill-name">${esc(entry ? E.entryLabel(entry) : exprT('empty'))}</span></span>
                    ${chips}
                </div>`;
        };
        const notChip = (slot, index) => chipBtn(exprT('not'), () => this.exprToggleNot(slot, index));

        let detailHTML = '';
        const focused = !this._exprArgFor && this._exprPane === 0 ? options[this._exprIndex] : null;
        if (focused) {
            const open = E.meets(actor, focused.key);
            detailHTML = `
                ${K.title(focused.icon, T('Expression.option.' + focused.key + '.name'), T('Expression.where.' + focused.where))}
                <div class="ui-prose sm-expr-desc">${esc(T('Expression.option.' + focused.key + '.desc'))}</div>
                ${focused.cat === 'limit' ? K.stats([
                    { label: exprT('limitWeightLabel'), value: String(focused.weight) },
                    { label: exprT('limitGivesLabel'), value: exprT('limitGivesValue', {
                        pct: Math.round(focused.weight * E.LIMIT_DISCOUNT * 100), leeway: focused.weight * E.LIMIT_LEEWAY }) }
                ], 2) : K.stats([
                    focused.stat && focused.req ? {
                        label: exprT('requires'),
                        value: E.reqFor(actor, focused.key) < focused.req
                            ? exprT('reqLowered', { stat: this.exprStatName(focused.stat), have: E.statOf(actor, focused.stat),
                                req: E.reqFor(actor, focused.key), base: focused.req })
                            : `${this.exprStatName(focused.stat)} ${E.statOf(actor, focused.stat)}/${focused.req}`,
                        bad: !open
                    } : null,
                    { label: exprT('cost'), value: focused.cost ? `${focused.cost} KP` : exprT('free') }
                ], 2)}`;
        }

        const rows = [];
        rows.push(slotRow('form', d.form && d.form.key !== 'aura' ? d.form : null, 0));
        rows.push(slotRow('trigger', d.trigger, 0));
        const logicLabel = exprT(d.logic === 'any' ? 'logicAny' : 'logicAll');
        rows.push(`<div class="sm-expr-subhead"><span class="inspect-section-title">${esc(exprT('conditions'))}</span>${chipBtn(logicLabel, () => this.exprToggleLogic(), 'sm-expr-logic')}</div>`);
        for (let i = 0; i < E.SLOTS.rules; i++) rows.push(slotRow('rules', d.rules[i] || null, i, d.rules[i] ? notChip('rules', i) : ''));
        rows.push(slotRow('branch', d.branch, 0, d.branch ? notChip('branch', 0) : ''));
        for (let i = 0; i < E.SLOTS.effects; i++) rows.push(slotRow('effects', d.effects[i] || null, i));
        if (d.branch) for (let i = 0; i < E.SLOTS.elseEffects; i++) rows.push(slotRow('elseEffects', d.elseEffects[i] || null, i));
        // The vows the power is bound by, and what they give back.
        rows.push(`<div class="sm-expr-subhead"><span class="inspect-section-title">${esc(exprT('limitations'))}</span></div>`);
        const limits = d.limits || [];
        for (let i = 0; i < E.SLOTS.limits; i++) rows.push(slotRow('limits', limits[i] || null, i));
        const points = E.limitPoints(d);
        rows.push(`<div class="cc-bio-note sm-expr-limits">${esc(points
            ? exprT('limitSummary', { n: points, pct: Math.round(E.discountOf(d) * 100), leeway: E.leewayOf(d) })
            : exprT('limitNone'))}</div>`);

        const check = E.finalizeCheck(actor);
        const finalizeIdx = act(() => this.exprFinalize());
        const fin = E.finalized(actor);
        const finText = fin
            ? exprT('finalized', { power: [fin.trigger].concat(fin.effects).filter(Boolean).map(E.entryLabel).join(' > ') })
            : exprT('noneFinalized');
        this._exprActions = actions;
        this._exprRightIndex = Math.max(0, Math.min(this._exprRightIndex || 0, actions.length - 1));

        rightBox.innerHTML = `
            <div class="page-header-bar sm-bench-header">
              <h2 class="title">${esc(exprT('blueprint'))}</h2>
              <div class="sm-bench-kp-pill"><strong>${knowledge} KP</strong></div>
            </div>
            <div class="sm-bench-scroll sm-expr-right">
                ${detailHTML}
                <div class="ui-list sm-expr-blueprint">${rows.join('')}</div>
                <div class="cc-bio-note sm-expr-potency">${esc(exprT('potency', { pct: Math.round(E.potency(d) * 100) }))} ${esc(exprT('once'))}</div>
                <div class="cc-bio-note sm-expr-final">${esc(finText)}</div>
                <div class="cc-bio-note sm-expr-note">${esc(exprT('alwaysFires'))}</div>
            </div>
            <div class="inspect-btn sm-expr-finalize focusable${check.ok ? '' : ' inspect-btn--disabled'}${lit(finalizeIdx)}"
                 data-ra="${finalizeIdx}" onclick="SceneManager._scene.exprRun(${finalizeIdx})">${esc(exprT('finalize', { kp: check.cost }))}</div>
            ${check.ok ? '' : `<div class="cc-bio-note sm-expr-reason">${esc(exprT('refusal.' + check.reason, { kp: check.cost }))}</div>`}`;

        const cursorEl = this._exprArgFor ? leftBox.querySelector('.sm-craft-entry--cursor')
            : (this._exprPane === 1 ? rightBox.querySelector('.sm-kit-cursor') : leftBox.querySelector('.sm-expr-card.selected'));
        if (cursorEl && cursorEl.scrollIntoView) cursorEl.scrollIntoView({ block: 'nearest' });
    };

    Proto.updateExpressionBenchInput = function () {
        const cancel = Input.isTriggered('cancel') || Input.isTriggered('escape') || TouchInput.isCancelled();
        const step = (dir) => Input.isTriggered(dir) || Input.isRepeated(dir);
        const ok = Input.isTriggered('ok') || Input.isTriggered('enter');

        if (this._exprArgFor) {
            const o = exprApi().option(this._exprArgFor);
            const count = exprApi().argChoices(this.exprActor(), o.param).length;
            if (cancel) { this.exprCloseArg(); return; }
            if (ok) { this.exprPickArg(this._exprArgIndex || 0); return; }
            if (step('down') || step('up')) {
                this._exprArgIndex = ((this._exprArgIndex || 0) + (step('down') ? 1 : -1) + count) % count;
                SoundManager.playCursor();
                this.refreshUISkillDOM();
            }
            return;
        }
        if (cancel) {
            if (this._exprPane === 1) {
                this._exprPane = 0;
                SoundManager.playCancel();
                this.refreshUISkillDOM();
            } else {
                this.closeExpressionBench();
            }
            return;
        }
        // L1 / R1, PageUp / PageDown and Tab / Shift+Tab all turn the bench's tabs.
        const exprTabStep = window.CCNav ? window.CCNav.railDir() : 0;
        if (exprTabStep !== 0) { this.exprTurnTab(exprTabStep); return; }
        if (Input.isTriggered('shift')) { this.exprCycleDest(); return; }

        if (this._exprPane === 1) {
            const count = (this._exprActions || []).length;
            if (ok) { this.exprRun(this._exprRightIndex || 0); return; }
            let moved = false;
            if (step('down')) { this._exprRightIndex = Math.min(count - 1, (this._exprRightIndex || 0) + 1); moved = true; }
            else if (step('up')) { this._exprRightIndex = Math.max(0, (this._exprRightIndex || 0) - 1); moved = true; }
            else if (step('left')) { this._exprPane = 0; moved = true; }
            if (moved) { SoundManager.playCursor(); this.refreshUISkillDOM(); }
            return;
        }

        const count = this.exprOptions().length;
        const idx = this._exprIndex || 0;
        if (ok) { this.exprPick(idx); return; }
        let next = idx;
        if (step('right')) {
            if (idx % EXPR_COLS === EXPR_COLS - 1 || idx === count - 1) {
                this._exprPane = 1;
                SoundManager.playCursor();
                this.refreshUISkillDOM();
                return;
            }
            next = idx + 1;
        } else if (step('left')) next = idx % EXPR_COLS === 0 ? idx : idx - 1;
        else if (step('down')) next = Math.min(count - 1, idx + EXPR_COLS);
        else if (step('up')) next = idx - EXPR_COLS >= 0 ? idx - EXPR_COLS : idx;
        if (next !== idx) {
            this._exprIndex = next;
            SoundManager.playCursor();
            this.refreshUISkillDOM();
        }
    };

    Proto.updateExpressionPickerInput = function () {
        const count = expressionMembers().length;
        if (Input.isTriggered('cancel') || Input.isTriggered('escape') || TouchInput.isCancelled()) {
            this.closeExpressionPicker();
            return;
        }
        if (count === 0) return;
        const idx = Math.min(this._expressionIndex || 0, count - 1);
        if (Input.isTriggered('ok')) {
            this.pickExpressionActor(idx);
            return;
        }
        if (Input.isTriggered('down') || Input.isRepeated('down')) {
            this._expressionIndex = (idx + 1) % count;
            SoundManager.playCursor();
            this.paintExpressionFocus();
        } else if (Input.isTriggered('up') || Input.isRepeated('up')) {
            this._expressionIndex = (idx - 1 + count) % count;
            SoundManager.playCursor();
            this.paintExpressionFocus();
        }
    };

    Proto.openHexorcizeBench = function () {
        this._viewMode = 'hexorcize';
        this._hexIndex = 0;
        this._hexChip = 0;
        SoundManager.playOk();
        this.refreshUISkillDOM();
    };

    Proto.closeHexorcizeBench = function () {
        this._viewMode = 'category';
        this._lastLeftMode = null;
        this._lastLeftCategory = null;
        this._lastRightMode = null;
        this._lastRightSkillId = null;
        this._lastRightKnowledge = null;
        SoundManager.playCancel();
        this.refreshUISkillDOM();
    };

    Proto.hexorcizeRows = function () {
        return hexorcizableGear();
    };

    Proto.hexorcizeAt = function (idx) {
        return this.hexorcizeRows()[idx] || null;
    };

    Proto.hexorcizeTake = function (idx, all) {
        const row = this.hexorcizeAt(idx);
        if (!row) { SoundManager.playBuzzer(); return; }
        const gain = hexorcize(row.item, all ? row.count : 1);
        if (!gain) { SoundManager.playBuzzer(); return; }
        SoundManager.playSave();
        if (window.ParchmentToast) {
            window.ParchmentToast.show(tr('unmade', { item: tx(row.item.name), kp: gain }), { severity: 'good' });
        }
        const rows = this.hexorcizeRows().length;
        this._hexIndex = Math.max(0, Math.min(this._hexIndex || 0, rows - 1));
        this._lastRightKnowledge = null;
        this.refreshUISkillDOM();
    };

    Proto.hexorcizeRunChip = function (idx) {
        this.hexorcizeTake(idx, HEX_CHIPS[this._hexChip || 0] === 'all');
    };

    const HEX_ICON = 135;

    Proto.renderHexorcizeBench = function (knowledge) {
        const leftBox = document.getElementById('left-page-content');
        const rightBox = document.getElementById('right-page-content');
        if (!leftBox || !rightBox) return;
        const K = SkillMaster.BenchKit;

        const rows = this.hexorcizeRows();
        this._hexIndex = Math.max(0, Math.min(this._hexIndex || 0, rows.length - 1));

        let listHTML = '';
        rows.forEach((row, idx) => {
            const on = (this._hexIndex || 0) === idx;
            const stack = row.count > 1 ? `<span class="ui-chip sm-skill-badge">&times;${row.count}</span>` : '';
            const chipHTML = HEX_CHIPS.map((chip, ci) => {
                if (chip === 'all' && row.count <= 1) return '';
                const lit = on && (this._hexChip || 0) === ci ? ' focused' : '';
                return `<span class="ui-chip sm-skill-badge focusable sm-craft-discard${lit}"
                        onclick="SceneManager._scene.hexorcizeTake(${idx}, ${chip === 'all'})">${esc(tr(chip))}</span>`;
            }).join('');
            listHTML += `
                <div class="sm-skill-row sm-craft-entry ${on ? 'sm-craft-entry--cursor' : ''}">
                    <span class="sm-skill-ident"><span class="sm-skill-icon" style="${SkillMaster.getSkillIconStyle(row.item.iconIndex)}"></span><span class="sm-skill-name">${esc(tx(row.item.name))}</span></span>
                    ${stack}
                    <span class="sm-forge-cost">+${row.kp} KP</span>
                    ${chipHTML}
                </div>`;
        });
        if (!listHTML) listHTML = `<div class="ui-empty"><div class="ui-empty-text">${esc(tr('nothing'))}</div></div>`;

        leftBox.innerHTML = `
            <div class="page-header-bar sm-bench-header">
              <div class="back-button focusable" onclick="SceneManager._scene.closeHexorcizeBench()">${esc(tr('back'))}</div>
              <h2 class="title">${esc(tr('title'))}</h2>
              <div class="sm-bench-kp-pill"><strong>${knowledge} KP</strong></div>
            </div>
            <div class="sm-enchant-blurb cc-bio-note">${esc(tr('blurb'))}</div>
            <div id="hexorcize-gear-box" class="ui-list ui-scroll sm-forged-list sm-forged-list--fill">
                ${listHTML}
            </div>`;

        const focused = this.hexorcizeAt(this._hexIndex || 0);
        const total = rows.reduce((a, r) => a + r.kp * r.count, 0);
        let detailHTML = `<div class="ui-empty"><div class="ui-empty-text">${esc(tr('pickPiece'))}</div></div>`;
        if (focused) {
            const item = focused.item;
            const spell = item.meta && item.meta.EnchantSpell ? $dataSkills[Number(item.meta.EnchantSpell)] : null;
            const params = ($dataSystem.terms && $dataSystem.terms.params) || [];
            // The piece reads as the character sheet reads a build: its worth
            // and its stats as one grid of boxes, not a column of rows.
            const statBoxes = (item.params || []).map((v, i) => (v
                ? { label: tx(params[i] || ''), value: `${v > 0 ? '+' : ''}${v}` } : null));
            detailHTML = `
                ${K.title(HEX_ICON, tx(item.name))}
                ${K.stats([
                    { label: tr('worth'), value: `${focused.kp} KP` },
                    { label: tr('held'), value: focused.count },
                    spell ? { label: tr('bindingHeld'), value: tx(spell.name) } : null
                ], 3)}
                ${K.stats(statBoxes)}`;
        }

        rightBox.innerHTML = `
            <div class="page-header-bar sm-bench-header">
              <h2 class="title">${esc(tr('detailTitle'))}</h2>
              <div class="sm-bench-kp-pill"><strong>${knowledge} KP</strong></div>
            </div>
            <div class="sm-bench-scroll">
                ${detailHTML}
            </div>
            <div class="sm-enchant-target cc-bio-note">${esc(tr('totalHere', { kp: total }))}</div>`;
    };

    Proto.updateHexorcizeBenchInput = function () {
        if (Input.isTriggered('cancel') || Input.isTriggered('escape') || TouchInput.isCancelled()) {
            this.closeHexorcizeBench();
            return;
        }
        const rows = this.hexorcizeRows();
        if (!rows.length) return;
        this._hexIndex = Math.max(0, Math.min(this._hexIndex || 0, rows.length - 1));

        // How many chips the row under the cursor actually draws: a single
        // piece has no whole-stack chip to step onto.
        const chips = (rows[this._hexIndex].count > 1) ? HEX_CHIPS.length : 1;
        this._hexChip = Math.min(this._hexChip || 0, chips - 1);

        let moved = false;
        // A new row always offers the harmless chip first, as every other
        // bench does: a held Down must not carry "the whole stack" along.
        if (Input.isTriggered('down') || Input.isRepeated('down')) {
            this._hexIndex = (this._hexIndex + 1) % rows.length;
            this._hexChip = 0;
            moved = true;
        } else if (Input.isTriggered('up') || Input.isRepeated('up')) {
            this._hexIndex = (this._hexIndex - 1 + rows.length) % rows.length;
            this._hexChip = 0;
            moved = true;
        } else if (Input.isTriggered('right') || Input.isRepeated('right')) {
            this._hexChip = (this._hexChip + 1) % chips;
            moved = true;
        } else if (Input.isTriggered('left') || Input.isRepeated('left')) {
            this._hexChip = (this._hexChip - 1 + chips) % chips;
            moved = true;
        }
        if (moved) {
            this._hexChip = Math.min(this._hexChip, (this.hexorcizeAt(this._hexIndex).count > 1 ? HEX_CHIPS.length : 1) - 1);
            SoundManager.playCursor();
            this._lastRightKnowledge = null;
            this.refreshUISkillDOM();
            this.scrollToActiveItem('hexorcize-gear-box',
                '#hexorcize-gear-box .focused, #hexorcize-gear-box .sm-craft-entry--cursor'); // i18n-ignore: CSS selector
            return;
        }
        if (Input.isTriggered('ok') || Input.isTriggered('enter')) {
            this.hexorcizeRunChip(this._hexIndex);
        }
    };

})();



//=============================================================================
// Module: SkillMasterLobotomagic.js
//=============================================================================
/*:
 * @target MZ
 * @plugindesc v1.0.0 SkillMaster - the Lobotomagic bench: cutting a learned skill or spell back out of a mind.
 * @author Omni-Lex
 *
 * @help
 * Teaching puts knowledge into a party member; this bench takes it back out.
 * A skill or a spell the member has LEARNED is cut away and part of what it
 * would cost to teach them today comes back as KP.
 *
 * Only what sits in the member's own learned list is offered. A skill a trait
 * or a piece of gear grants would come straight back, so it is never on the
 * bench; neither are the battle menu commands nor the Basic kit, which are
 * the engine's own moves and no school's.
 *
 * The cut is armed by the first press and made by the second, because a
 * skill cut away has to be paid for in full to be learned again.
 */

(() => {
    'use strict';

    window.SkillMaster = window.SkillMaster || {};
    const SkillMaster = window.SkillMaster;
    SkillMaster.Lobotomagic = SkillMaster.Lobotomagic || {};

    const tr = (key, params) => (typeof T === 'function' ? T('SkillMaster.lobotomagic.' + key, params) : key);

    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const tx = (s) => (typeof window.translateText === 'function' ? window.translateText(s) : s);

    //=========================================================================
    // What a cut gives back
    //=========================================================================

    const LOBO_REFUND_RATE = 0.5; // half of what teaching it today would cost
    const LOBO_MIN = 1;

    function loboRefund(actor, skill) {
        if (!actor || !skill || !window.$gameSystem) return 0;
        const cost = $gameSystem.getSkillKnowledgeCost(skill.id, actor.actorId());
        return Math.max(LOBO_MIN, Math.floor(cost * LOBO_REFUND_RATE));
    }
    SkillMaster.Lobotomagic.refund = loboRefund;
    SkillMaster.Lobotomagic.RATE = LOBO_REFUND_RATE;

    /** True when this learned skill can be cut out of this actor's mind. */
    function isForgettable(actor, skill) {
        if (!actor || !skill) return false;
        if (!actor._skills || !actor._skills.includes(skill.id)) return false;
        if (window.$dataSystem && skill.id === $dataSystem.attackSkillId) return false;
        if (SkillMaster.isMenuCommandSkill && SkillMaster.isMenuCommandSkill(skill.id)) return false;
        if (SkillMaster.isBasicCategory && SkillMaster.getSkillCategory &&
            SkillMaster.isBasicCategory(SkillMaster.getSkillCategory(skill.id))) return false;
        if (typeof actor.addedSkills === 'function' && actor.addedSkills().includes(skill.id)) return false;
        if (/<NoForget>/i.test(skill.note || '')) return false;
        return true;
    }
    SkillMaster.Lobotomagic.isForgettable = isForgettable;

    /** Every learned skill and spell the bench may cut from `actor`. */
    function forgettableSkills(actor) {
        const out = [];
        if (!actor || !actor._skills || !window.$dataSkills) return out;
        for (const id of actor._skills) {
            const skill = $dataSkills[id];
            if (!isForgettable(actor, skill)) continue;
            out.push({ skill: skill, kp: loboRefund(actor, skill) });
        }
        const name = (row) => tx(row.skill.name) || '';
        out.sort((a, b) => name(a).localeCompare(name(b)));
        return out;
    }
    SkillMaster.Lobotomagic.skills = forgettableSkills;

    /** Cuts `skillId` out of `actor` and pays the knowledge out. Returns the KP. */
    function lobotomize(actor, skillId) {
        const skill = window.$dataSkills ? $dataSkills[skillId] : null;
        if (!isForgettable(actor, skill)) return 0;
        const gain = loboRefund(actor, skill);
        actor.forgetSkill(skill.id);
        $gameSystem.addKnowledge(gain);
        return gain;
    }
    SkillMaster.Lobotomagic.run = lobotomize;

    //=========================================================================
    // The bench
    //=========================================================================

    const Proto = window.Scene_SkillEncyclopedia.prototype;

    // The bench works on whoever the switcher tabs on the right page name.
    Proto.lobotomagicActor = function () {
        return typeof this.getTeachActor === 'function' ? this.getTeachActor() : null;
    };

    Proto.openLobotomagicBench = function () {
        this._viewMode = 'lobotomagic';
        this._loboIndex = 0;
        this._loboArmed = -1;
        SoundManager.playOk();
        this.refreshUISkillDOM();
    };

    Proto.closeLobotomagicBench = function () {
        this._viewMode = 'category';
        this._loboArmed = -1;
        this._lastLeftMode = null;
        this._lastLeftCategory = null;
        this._lastRightMode = null;
        this._lastRightSkillId = null;
        this._lastRightKnowledge = null;
        SoundManager.playCancel();
        this.refreshUISkillDOM();
    };

    Proto.lobotomagicRows = function () {
        return forgettableSkills(this.lobotomagicActor());
    };

    Proto.lobotomagicAt = function (idx) {
        return this.lobotomagicRows()[idx] || null;
    };

    // The first press arms the row, the second makes the cut.
    Proto.lobotomagicTake = function (idx) {
        const row = this.lobotomagicAt(idx);
        if (!row) { SoundManager.playBuzzer(); return; }
        if (this._loboArmed !== idx) {
            this._loboIndex = idx;
            this._loboArmed = idx;
            SoundManager.playCursor();
            this.refreshUISkillDOM();
            return;
        }
        const actor = this.lobotomagicActor();
        const gain = lobotomize(actor, row.skill.id);
        this._loboArmed = -1;
        if (!gain) { SoundManager.playBuzzer(); this.refreshUISkillDOM(); return; }
        SoundManager.playSave();
        if (window.ParchmentToast) {
            window.ParchmentToast.show(tr('cut', { skill: tx(row.skill.name), name: actor.name(), kp: gain }), { severity: 'good' });
        }
        const rows = this.lobotomagicRows().length;
        this._loboIndex = Math.max(0, Math.min(this._loboIndex || 0, rows - 1));
        this._lastRightKnowledge = null;
        this.refreshUISkillDOM();
    };

    Proto.renderLobotomagicBench = function (knowledge) {
        const leftBox = document.getElementById('left-page-content');
        const rightBox = document.getElementById('right-page-content');
        if (!leftBox || !rightBox) return;
        const K = SkillMaster.BenchKit;
        const actor = this.lobotomagicActor();

        const rows = this.lobotomagicRows();
        this._loboIndex = Math.max(0, Math.min(this._loboIndex || 0, rows.length - 1));

        let listHTML = '';
        rows.forEach((row, idx) => {
            const on = (this._loboIndex || 0) === idx;
            const armed = this._loboArmed === idx;
            listHTML += `
                <div class="sm-skill-row sm-craft-entry ${on ? 'sm-craft-entry--cursor' : ''}">
                    <span class="sm-skill-ident"><span class="sm-skill-icon" style="${SkillMaster.getSkillIconStyle(row.skill.iconIndex)}"></span><span class="sm-skill-name">${esc(tx(row.skill.name))}</span></span>
                    <span class="sm-forge-cost">+${row.kp} KP</span>
                    <span class="ui-chip sm-skill-badge focusable sm-craft-discard${on ? ' focused' : ''}"
                        onclick="SceneManager._scene.lobotomagicTake(${idx})">${esc(tr(armed ? 'confirm' : 'forget'))}</span>
                </div>`;
        });
        if (!listHTML) listHTML = `<div class="ui-empty"><div class="ui-empty-text">${esc(tr('nothing'))}</div></div>`;

        leftBox.innerHTML = `
            <div class="page-header-bar sm-bench-header">
              <div class="back-button focusable" onclick="SceneManager._scene.closeLobotomagicBench()">${esc(tr('back'))}</div>
              <h2 class="title">${esc(tr('title'))}</h2>
              <div class="sm-bench-kp-pill"><strong>${knowledge} KP</strong></div>
            </div>
            <div class="sm-enchant-blurb cc-bio-note">${esc(tr('blurb', { pct: Math.round(LOBO_REFUND_RATE * 100) }))}</div>
            <div id="lobotomagic-skill-box" class="ui-list ui-scroll sm-forged-list sm-forged-list--fill">
                ${listHTML}
            </div>`;

        const focused = this.lobotomagicAt(this._loboIndex || 0);
        let detailHTML = `<div class="ui-empty"><div class="ui-empty-text">${esc(tr('pickSkill'))}</div></div>`;
        if (focused && actor) {
            const skill = focused.skill;
            const category = SkillMaster.getSkillCategory ? SkillMaster.getSkillCategory(skill.id) : null;
            const teach = $gameSystem.getSkillKnowledgeCost(skill.id, actor.actorId());
            detailHTML = `
                ${K.title(skill.iconIndex, tx(skill.name))}
                ${K.stats([
                    { label: tr('refund'), value: `${focused.kp} KP` },
                    { label: tr('relearn'), value: `${teach} KP` },
                    category ? { label: tr('school'), value: SkillMaster.getCategoryDisplayName(category) } : null
                ], 3)}
                ${this._loboArmed === this._loboIndex ? `<div class="sm-craft-block">${esc(tr('warning', { name: actor.name() }))}</div>` : ''}`;
        }

        rightBox.innerHTML = `
            <div class="page-header-bar sm-bench-header">
              <h2 class="title">${esc(tr('detailTitle', { name: actor ? actor.name() : '' }))}</h2>
              <div class="sm-bench-kp-pill"><strong>${knowledge} KP</strong></div>
            </div>
            <div class="sm-bench-scroll">
                ${detailHTML}
            </div>`;
    };

    Proto.updateLobotomagicBenchInput = function () {
        if (Input.isTriggered('cancel') || Input.isTriggered('escape') || TouchInput.isCancelled()) {
            if (this._loboArmed >= 0) {
                this._loboArmed = -1;
                SoundManager.playCancel();
                this.refreshUISkillDOM();
                return;
            }
            this.closeLobotomagicBench();
            return;
        }
        // Left and right walk the party, the same as the switcher tabs.
        // The rail inputs (L1 / R1, PageUp / PageDown, Tab / Shift+Tab) do too.
        const loboSideStep = Input.isTriggered('left') ? -1 : (Input.isTriggered('right') ? 1 : 0);
        const dir = loboSideStep || (window.CCNav ? window.CCNav.railDir() : 0);
        if (dir !== 0) {
            this._loboArmed = -1;
            this._loboIndex = 0;
            if (typeof this.cycleTeachActor === 'function') this.cycleTeachActor(dir);
            return;
        }
        const rows = this.lobotomagicRows();
        if (!rows.length) return;
        this._loboIndex = Math.max(0, Math.min(this._loboIndex || 0, rows.length - 1));

        let moved = false;
        if (Input.isTriggered('down') || Input.isRepeated('down')) {
            this._loboIndex = (this._loboIndex + 1) % rows.length;
            moved = true;
        } else if (Input.isTriggered('up') || Input.isRepeated('up')) {
            this._loboIndex = (this._loboIndex - 1 + rows.length) % rows.length;
            moved = true;
        }
        if (moved) {
            // Walking off an armed row disarms it: the cut is never carried along.
            this._loboArmed = -1;
            SoundManager.playCursor();
            this._lastRightKnowledge = null;
            this.refreshUISkillDOM();
            this.scrollToActiveItem('lobotomagic-skill-box',
                '#lobotomagic-skill-box .focused, #lobotomagic-skill-box .sm-craft-entry--cursor'); // i18n-ignore: CSS selector
            return;
        }
        if (Input.isTriggered('ok') || Input.isTriggered('enter')) {
            this.lobotomagicTake(this._loboIndex);
        }
    };

})();
