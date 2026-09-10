/*:
 * @target MZ
 * @plugindesc v4.0.0 SkillMaster - Complete skill management system with 2D skill tree visualizer, progression, and fusion.
 * @author Omni-Lex
 *
 * @param Variable ID
 * @desc ID of the variable to store the selected skill ID
 * @type variable
 * @default 1
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
 * @default 1
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
    if (!window.CharSwitcher) {
        window.CharSwitcher = {
            isControllerConnected() {
                const pads = navigator.getGamepads ? navigator.getGamepads() : [];
                for (let i = 0; i < pads.length; i++) {
                    if (pads[i] && pads[i].connected) return true;
                }
                return false;
            },
            parts(memberCount) {
                if (!memberCount || memberCount <= 1) return { left: '', right: '' };
                if (this.isControllerConnected()) {
                    return {
                        left: '<span class="char-switch-hint">L</span>',
                        right: '<span class="char-switch-hint">R</span>'
                    };
                }
                return { left: '', right: '<span class="char-switch-hint">TAB</span>' };
            },
            inner(tabsRowHTML, memberCount) {
                const p = this.parts(memberCount);
                return p.left + tabsRowHTML + p.right;
            },
            wrap(tabsRowHTML, memberCount) {
                return `<div class="companion-switcher">${this.inner(tabsRowHTML, memberCount)}</div>`;
            },
            installTabKey(scene, onCycle) {
                if (scene._charSwitchTabListener) return;
                scene._charSwitchTabListener = (e) => {
                    if (e.key !== 'Tab') return;
                    e.preventDefault();
                    if (this.isControllerConnected()) return;
                    onCycle(e.shiftKey ? -1 : 1);
                };
                window.addEventListener('keydown', scene._charSwitchTabListener);
            },
            removeTabKey(scene) {
                if (scene._charSwitchTabListener) {
                    window.removeEventListener('keydown', scene._charSwitchTabListener);
                    scene._charSwitchTabListener = null;
                }
            }
        };
    }

    const pluginName = "SkillMasterCore";
    const oldPluginName = "SkillMaster";
    const parameters = PluginManager.parameters(pluginName) || PluginManager.parameters(oldPluginName) || {};
    const variableId = Number(parameters['Variable ID'] || 1);
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
    const EM_SKILL_TREES = ['Firearms'];
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
        const list = ['All'].concat(EM_SKILL_TREES);
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
        if (!skill) return null;
        const match = skill.note.match(/<category:\s*(.+?)\s*>/i);
        return match ? match[1].trim() : null;
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
        const key = 'SkillMaster.magicSystem.rigor.' + getMagicSystemRigor(id) + 'Hint';
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
            if (getSkillMagicSystem(skill.id) === id) list.push(skill);
        }
        return list;
    }

    const FUSION_CATEGORY = 'Fusion';
    // Every category whose entries live on $gameSystem rather than in the
    // database: the forge's fusions and the two benches' own writing. They are
    // read out of the save, never scanned for in $dataSkills.
    const CUSTOM_CATEGORIES = ['Fusion', 'Crafted', 'Devised'];

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
                if (!cat || own.includes(cat) || out.includes(cat)) continue;
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
        categories.add("All");

        const MN = window.MagicNature;
        const filterNature = !!(MN && MN.isFiltering());

        if (typeof $dataSkills !== 'undefined' && $dataSkills) {
            for (const skill of $dataSkills) {
                if (!skill) continue;
                if (skill._customSpell) continue;
                if (filterNature && !MN.allowsData(skill)) continue;
                const categoryMatch = skill.note.match(/<category:(.+?)>/i);
                if (categoryMatch) {
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
        if (category === 'All') return 'Skill';
        if (isMagicTree(category)) return 'Magic';
        const data = CATEGORY_DATA[category] || SkillMaster.CATEGORY_DATA[category];
        return (data && data.type === 'Magic') ? 'Magic' : 'Skill';
    }

    function getSplitSkillCategories() {
        const all = getAllSkillCategories();
        const skills = [];
        const magic = [];
        for (const cat of all) {
            if (cat === 'All') continue;
            if (getCategoryType(cat) === 'Magic') magic.push(cat);
            else skills.push(cat);
        }
        const byName = (a, b) => getCategoryDisplayName(a).localeCompare(getCategoryDisplayName(b));
        skills.sort(byName);
        magic.sort(byName);
        skills.unshift('All');
        return { Skill: skills, Magic: magic };
    }

    function getSkillsByCategory(category) {
        if (isMagicTree(category)) {
            const MN0 = window.MagicNature;
            const filter0 = !!(MN0 && MN0.isFiltering());
            return getSkillsForMagicSystem(magicTreeId(category))
                .filter(s => s && s.name && !s.name.startsWith('<--') && (!filter0 || MN0.allowsData(s)));
        }
        if (category === 'All' && usesEmCurriculum()) {
            const out = [];
            for (const cat of getEmCurriculumCategories()) {
                if (cat === 'All') continue;
                for (const skill of getSkillsByCategory(cat)) {
                    if (!out.includes(skill)) out.push(skill);
                }
            }
            return out;
        }
        if (CUSTOM_CATEGORIES.includes(category)) {
            const actorId = (SceneManager._scene && SceneManager._scene._teachActorId) || 0;
            if (typeof $gameSystem === 'undefined' || !$gameSystem) return [];
            return $gameSystem.getCustomSpells()
                .filter(s => s && s.name && s._ownerActorId === actorId &&
                    (s._customCategory || FUSION_CATEGORY) === category)
                .map(s => $dataSkills[s.id] || s)
                .filter(Boolean);
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
                if (filterNature && !MN.allowsData(skill)) continue;

                if (catRegex) {
                    if (catRegex.test(skill.note)) skills.push(skill);
                    continue;
                }
                if (allowed) {
                    const match = skill.note.match(/<category:(.+?)>/i);
                    if (!match || !allowed.includes(match[1].trim())) continue;
                }
                skills.push(skill);
            }
        }
        return skills;
    }

    // Export helpers
    SkillMaster.uncamelCase = uncamelCase;
    SkillMaster.getCategoryDisplayName = getCategoryDisplayName;
    SkillMaster.getCategoryIcon = getCategoryIcon;
    SkillMaster.getCategoryIconStyle = getCategoryIconStyle;
    SkillMaster.getSkillIconStyle = getSkillIconStyle;
    SkillMaster.getSkillCategory = getSkillCategory;
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

    Game_System.prototype.getKnowledge = function () {
        if (this._knowledgePoints === undefined) this._knowledgePoints = 0;
        if (!this._sandboxKnowledgePointsGiven) {
            const isSandbox = (this._isSandboxMode) || ($gameSystem && $gameSystem._isSandboxMode);
            const isTestPlayer = ($gameParty && $gameParty.allMembers && $gameParty.allMembers().length > 0 && $gameParty.allMembers()[0].name().toLowerCase() === 'test');
            if (isSandbox || isTestPlayer) {
                this._knowledgePoints = 99999;
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
    // Skill power -> Knowledge cost
    //=============================================================================

    const KP_TEACH_BASE = 50;
    const KP_TEACH_EXP = 1.75;
    const KP_TEACH_MIN = 50;
    const KP_TEACH_MAX = 250000;
    const KP_ESOTERIC_MULT = 10;
    const KP_FORBIDDEN_MULT = 100;
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

    function kpOccultMultiplier(skill) {
        const note = (skill && skill.note) || '';
        if (/<Forbidden>/i.test(note)) return KP_FORBIDDEN_MULT;
        if (/<Esoteric>/i.test(note)) return KP_ESOTERIC_MULT;
        return 1;
    }

    const KP_TIER_STEP = 0.19;

    function kpTeachCost(skill) {
        const raw = KP_TEACH_BASE * Math.pow(skillPower(skill), KP_TEACH_EXP)
            * kpOccultMultiplier(skill);
        return Math.max(KP_TEACH_MIN, Math.min(KP_TEACH_MAX, Math.round(raw)));
    }

    Game_System.prototype.getSkillKnowledgeCost = function (skillId, actorId) {
        const skill = $dataSkills[skillId];
        if (!skill) return KP_TEACH_MIN;
        if (actorId) actorCategoryManager.setActor(actorId);
        let cost = kpTeachCost(skill);
        const placed = window.SkillGraph && window.SkillGraph.node(skillId);
        if (placed && placed.tier > 0) {
            cost = Math.min(KP_TEACH_MAX, Math.round(cost * (1 + placed.tier * KP_TIER_STEP)));
        }
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
            + '\n<Node: 0,' + mine.length + '>';
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

    function isWorkshopMode() {
        if ($gameSystem && ($gameSystem._isSandboxMode || $gameSystem._sandboxKnowledgePointsGiven)) return true;
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
            if (category !== "All") {
                if (actorCategoryManager.isPrimary(category)) {
                    commandName += " (3x)";
                } else if (actorCategoryManager.isSecondary(category)) {
                    commandName += " (1.5x)";
                } else if (actorCategoryManager.isForeign(category)) {
                    commandName += ` (${typeof T === 'function' ? T('SkillMaster.foreignSchool') : 'Foreign'})`;
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
        const categorySkills = getSkillsByCategory(data.ext ? data.ext.category : "All");
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
        return this.currentData() ? this.currentData().name : "All";
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
        this._category = "All";
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
                name: typeof T === 'function' ? T('SkillMaster.teachActor', { actor: actor.name(), cost: cost }) : `Teach ${actor.name()} (${cost} KP)`,
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
            const text = typeof T === 'function' ? T('SkillMaster.selectSkillForDetails') : "Select a skill";
            this.drawText(text, 0, this.contentsHeight() / 2 - this.lineHeight(), this.contentsWidth(), "center");
            return;
        }

        const padding = 20;
        const halfWidth = (this.contentsWidth() - padding * 3) / 2;
        let leftY = padding;
        let rightY = padding;

        this.contents.fontSize = 32;
        this.drawIcon(this._skill.iconIndex || 0, padding, leftY);
        this.drawText(this._skill.name || "Unknown", padding + ImageManager.iconWidth + 8, leftY, halfWidth - ImageManager.iconWidth - 8, "left");
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
            this.drawText(typeof T === 'function' ? T('SkillMaster.mpLabel') : 'MP', padding, leftY, 80);
            this.resetTextColor();
            this.drawText(this._skill.mpCost, padding + 80, leftY, halfWidth - 80, "right");
            leftY += this.lineHeight();
        }

        if (this._skill.tpCost > 0) {
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(typeof T === 'function' ? T('SkillMaster.apLabel') : 'AP', padding, leftY, 80);
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
            this.drawText(typeof T === 'function' ? T('SkillMaster.scale') : 'Scaling', padding, leftY, halfWidth);
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
            this.drawText(typeof T === 'function' ? T('SkillMaster.effectLabel') : 'Effect', padding, leftY, halfWidth);
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
        this.drawText(typeof T === 'function' ? T('SkillMaster.descriptionLabel') : 'Description', rightX, rightY, halfWidth);
        this.resetTextColor();
        rightY += this.lineHeight();

        this.drawHorzLine(rightY, rightX, halfWidth);
        rightY += 10;

        let description = this._skill.description || (typeof T === 'function' ? T('SkillMaster.noDescription') : 'No description');
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
        this.drawText(typeof T === 'function' ? T('SkillMaster.knowledgeLabel') : 'Knowledge', rightX, rightY, halfWidth * 0.6);
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
        if (damage.type === 1) text = typeof T === 'function' ? T('SkillMaster.hpDamage') : 'HP Damage';
        else if (damage.type === 2) text = typeof T === 'function' ? T('SkillMaster.mpDamage') : 'MP Damage';
        else if (damage.type === 3) text = typeof T === 'function' ? T('SkillMaster.hpRecovery') : 'HP Recovery';
        else if (damage.type === 4) text = typeof T === 'function' ? T('SkillMaster.mpRecovery') : 'MP Recovery';
        else if (damage.type === 5) text = typeof T === 'function' ? T('SkillMaster.hpDrain') : 'HP Drain';
        else if (damage.type === 6) text = typeof T === 'function' ? T('SkillMaster.mpDrain') : 'MP Drain';

        if (damage.variance > 0 && text) text += ` (±${damage.variance}%)`;

        const effects = skill.effects || [];
        const buffEffects = effects.filter(e => e.code === 31 || e.code === 32);
        if (buffEffects.length > 0) {
            const buffTexts = buffEffects.map(e => {
                const paramKeys = ["HP", "MP", "ATT", "DEF", "M.ATT", "M.DEF", "AGILITY", "LUCK"];
                const key = paramKeys[e.dataId];
                const paramName = key ? _si18n(key) : TextManager.param(e.dataId);
                const type = e.code === 31 ? (typeof T === 'function' ? T('SkillMaster.buff') : 'Buff') : (typeof T === 'function' ? T('SkillMaster.debuff') : 'Debuff');
                return `${type} ${paramName}`;
            });
            if (text) text += ", ";
            text += buffTexts.join(", ");
        }

        const stateEffects = effects.filter(e => e.code === 21 || e.code === 22);
        if (stateEffects.length > 0) {
            const stateTexts = stateEffects.map(e => {
                const state = $dataStates[e.dataId];
                return `${state ? state.name : (typeof T === 'function' ? T('SkillMaster.state') : 'State')}`;
            });
            if (text) text += ", ";
            text += stateTexts.join(", ");
        }
        return text || (typeof T === 'function' ? T('SkillMaster.none') : 'None');
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
            this.drawText(typeof T === 'function' ? T('SkillMaster.learnedMark') : 'Learned', textX, statusY, textW);
        } else {
            this.changeTextColor(canAfford ? ColorManager.textColor(1) : ColorManager.textColor(7));
            this.drawText(typeof T === 'function' ? T('SkillMaster.costKp', { cost: cost }) : `${cost} KP`, textX, statusY, textW);
        }
        this.resetTextColor();
        this.contents.fontSize = $gameSystem.mainFontSize();
    };

    Window_ActorSelect.prototype.refresh = function () {
        this.createContents();
        this.drawAllItems();
    };

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
            window.skipLocalization = true;
            if (typeof T === 'function') {
                $gameMessage.add(T('SkillMaster.knowledgeGained', {
                    amount: amount, total: $gameSystem.getKnowledge(),
                }));
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

    const GROVE_MAX = 20;
    const GROVE_MIN = 4;
    const GROVE_FANOUT = 3;
    const FUSION_CATEGORY = 'Fusion';
    const CUSTOM_CATEGORIES = (window.SkillMaster && window.SkillMaster.CUSTOM_CATEGORIES) || ['Fusion', 'Crafted', 'Devised'];
    const ROLE_RE = /<role:\s*([^>]+)>/i;

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

        _lane: function (skill) {
            const el = (skill.damage && skill.damage.elementId) || 0;
            if (el > 1) return 'E' + el;
            const role = (skill.note || '').match(ROLE_RE);
            if (role) return 'R' + role[1].trim();
            if (el === 1) return 'R@physical';
            return 'R@other';
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

            const forbidden = [];
            const climb = [];
            for (const skill of skills) {
                (this.isForbidden(skill.id) ? forbidden : climb).push(skill);
            }

            const power = {};
            const scoreFn = SkillMaster.skillPower || window.skillPower || (() => 1);
            for (const skill of skills) power[skill.id] = scoreFn(skill);
            const rank = (a, b) => (power[a.id] - power[b.id]) || (a.id - b.id);

            const laneNames = Array.from(new Set(skills.map(s => this._lane(s)))).sort();
            const laneOf = {};
            laneNames.forEach((name, i) => { laneOf[name] = i; });
            tree.lanes = laneNames;

            for (const members of this._groves(climb, rank)) {
                this._grow(tree, category, members, laneOf, false);
            }
            if (forbidden.length) {
                this._grow(tree, category, forbidden.slice().sort(rank), laneOf, true);
            }

            this._rank(tree);
            return tree;
        },

        _groves: function (climb, rank) {
            if (!climb.length) return [];
            const byLane = {};
            for (const skill of climb) {
                const lane = this._lane(skill);
                (byLane[lane] = byLane[lane] || []).push(skill);
            }
            const groves = [];
            const spill = [];
            const deal = (list) => {
                const parts = Math.max(1, Math.ceil(list.length / GROVE_MAX));
                const bins = [];
                for (let i = 0; i < parts; i++) bins.push([]);
                list.slice().sort(rank).forEach((skill, i) => bins[i % parts].push(skill));
                for (const bin of bins) if (bin.length) groves.push(bin);
            };
            for (const lane of Object.keys(byLane).sort()) {
                const list = byLane[lane];
                if (list.length < GROVE_MIN) spill.push(...list);
                else deal(list);
            }
            if (spill.length) deal(spill);
            if (!groves.length) deal(climb);
            return groves;
        },

        _grow: function (tree, category, members, laneOf, forbidden) {
            if (!members.length) return;
            const grove = { index: tree.groves.length, nodes: [], forbidden: !!forbidden };
            members.forEach((skill, seat) => {
                const node = {
                    id: skill.id, skill: skill, category: category,
                    tier: 0, grove: grove.index, seat: seat,
                    lane: laneOf[this._lane(skill)] || 0,
                    forbidden: !!forbidden,
                    parents: [], children: [], need: 0
                };
                grove.nodes.push(node);
                tree.nodes[skill.id] = node;
                tree.order.push(node);
                this._index[skill.id] = node;
            });
            if (!forbidden) {
                for (let i = 1; i < grove.nodes.length; i++) {
                    const parent = grove.nodes[Math.floor((i - 1) / GROVE_FANOUT)];
                    const node = grove.nodes[i];
                    node.parents = [parent.id];
                    node.tier = parent.tier + 1;
                    node.need = 1;
                    parent.children.push(node.id);
                }
            }
            grove.depth = grove.nodes.reduce((d, n) => Math.max(d, n.tier), 0);
            tree.groves.push(grove);
        },

        _rank: function (tree) {
            let deepest = 0;
            for (const node of tree.order) if (!node.forbidden) deepest = Math.max(deepest, node.tier);
            for (const node of tree.order) if (node.forbidden) node.tier = deepest + 1;
            const tiers = [];
            for (const node of tree.order) {
                (tiers[node.tier] = tiers[node.tier] || []).push(node);
            }
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
            if (!node) return true;
            return !node.forbidden && node.tier === 0;
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
            // Past the level floor a forbidden node stands open on its own.
            if (node.forbidden) return true;
            const foreign = SkillMaster.actorCategoryManager.isForeign(category);
            if (!foreign && node.tier === 0) return true;
            if (!node.parents.length) return !foreign;
            let held = 0;
            for (const id of node.parents) if (actor.isLearnedSkill(id)) held++;
            return held >= Math.max(1, node.need);
        },

        openers: function (skillId, actor) {
            // A forbidden skill has no prerequisite skills any more, only a
            // level floor, which the lock line states by itself.
            if (this.isForbidden(skillId)) return [];
            return this.requires(skillId)
                .filter(id => !(actor && actor.isLearnedSkill(id)))
                .map(id => $dataSkills[id])
                .filter(s => s && s.name);
        },

        stillWanted: function (skillId, actor) {
            const node = this._nodeFor(skillId);
            if (!node || node.forbidden || !node.parents.length) return 0;
            let held = 0;
            for (const id of node.parents) if (actor && actor.isLearnedSkill(id)) held++;
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

            const nodes = tree.order.map(n => ({
                id: n.id, skill: n.skill, tier: n.tier,
                grove: n.grove, seat: n.seat, forbidden: n.forbidden,
                parent: n.parents.length ? n.parents[0] : 0, children: n.children.slice()
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
                    forbidden: !!n.forbidden, parent: n.parent, children: n.children,
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

        _layGrove: function (grove, byId) {
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
            if (typeof THREE !== 'undefined' && typeof process !== 'undefined' && !process.browser) {
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
                const open = !learned && graph && graph.isOpen(actor, node.id);
                node.state = learned ? 2 : (open ? 1 : 0);

                const el = st.labelEls[i];
                if (el) {
                    el.classList.toggle('sg3-learned', learned);
                    el.classList.toggle('sg3-open', open);
                    el.classList.toggle('sg3-locked', !learned && !open);
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
                } else if (isOpen) {
                    ctx.shadowColor = `hsla(${hue}, 80%, 50%, ${0.5 + st.pulse * 0.4})`;
                    ctx.shadowBlur = 8 + st.pulse * 6;
                    ctx.strokeStyle = `hsla(${hue}, 80%, 55%, 0.95)`;
                    ctx.lineWidth = 2.5;
                } else {
                    ctx.shadowBlur = 0;
                    ctx.strokeStyle = 'rgba(70, 75, 85, 0.7)';
                    ctx.lineWidth = 1.8;
                }

                // Node Body Gradient
                const bgGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, radius);
                if (isLearned) {
                    bgGrad.addColorStop(0, `hsla(${hue}, 70%, 35%, 1)`);
                    bgGrad.addColorStop(1, `hsla(${hue}, 80%, 15%, 1)`);
                } else if (isOpen) {
                    bgGrad.addColorStop(0, `hsla(${hue}, 50%, 25%, 1)`);
                    bgGrad.addColorStop(1, `hsla(${hue}, 60%, 10%, 1)`);
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

        _updateLabels: function (st, w2, h2) {
            if (!st.labelEls.length) return;
            const scale = st.scaleFactor;
            const maxVisibleLabels = 40;
            let visibleCount = 0;

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

                if (!node.vis || visibleCount >= maxVisibleLabels) {
                    el.classList.add('ui-closed');
                    continue;
                }

                visibleCount++;
                el.classList.remove('ui-closed');
                el.style.setProperty('--ms-x', `${sx.toFixed(1)}px`);
                el.style.setProperty('--ms-y', `${(sy + 26 * st.zoom).toFixed(1)}px`);

                // Scale label with zoom subtly
                const labelScale = Math.max(0.75, Math.min(1.15, st.zoom));
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
            : (typeof T === 'function' ? T('SkillMaster.noAnimation') : 'No Animation');
        const noEfkNote = previewable ? '' :
            `<div class="sm-stage-note">${typeof T === 'function' ? T('SkillMaster.no3dAnimationForThis') : 'No 3D Animation'}</div>`;

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
                    <div class="back-button focusable" onclick="SceneManager._scene.closeSpellPreview()">${typeof T === 'function' ? T('SkillMaster.close') : 'Close'}</div>
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
                    <div class="inspect-btn focusable" onclick="SceneManager._scene.replaySpellPreview()">${typeof T === 'function' ? T('SkillMaster.replay') : 'Replay'}</div>
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
    const FORGE_CREATE_IDX = 3;
    const FORGE_SPLIT_BASE = 4;

    function makeFusedSpellName(names) {
        const parts = names.map(n => {
            const clean = String(n || '').replace(/[^A-Za-z]/g, '');
            if (!clean) return '';
            const chunk = clean.slice(0, 4);
            return chunk.charAt(0).toUpperCase() + chunk.slice(1).toLowerCase();
        }).filter(Boolean);
        return parts.join('') || 'CustomSpell';
    }

    function buildFusedSkill(components, actorId, animationId) {
        const clone = obj => JSON.parse(JSON.stringify(obj));
        const dominant = components[0];
        const recessive = components[1];
        const fused = clone(dominant);

        fused.id = $gameSystem.allocCustomSkillId();
        fused.name = makeFusedSpellName(components.map(c => c.name));
        fused.mpCost = components.reduce((sum, c) => sum + (c.mpCost || 0), 0);
        fused.tpCost = components.reduce((sum, c) => sum + (c.tpCost || 0), 0);

        fused.damage = clone(dominant.damage);
        fused.iconIndex = dominant.iconIndex;

        const recCat = recessive ? SkillMaster.getSkillCategory(recessive.id) : null;
        const recIsSkill = recCat ? SkillMaster.getCategoryType(recCat) !== 'Magic' : false;
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
        fused.description = typeof T === 'function'
            ? T(descKey, { parts: names, dominant: dominant.name })
            : `${names} (Dominant: ${dominant.name})`;

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
            if (s.id === 1 || s.id === 2) return false;
            if (s._customSpell) return false;
            if (!actor.isLearnedSkill(s.id)) return false;
            if (chosenElsewhere.includes(s.id)) return false;
            if (Array.isArray(s.effects) && s.effects.some(e => e && e.code === Game_Action.EFFECT_COMMON_EVENT)) return false;
            const cat = SkillMaster.getSkillCategory(s.id);
            if (cat && cat.toLowerCase() === 'basic') return false;
            const type = cat ? SkillMaster.getCategoryType(cat) : 'Skill';
            return dominantSlot ? type === 'Magic' : true;
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

        const box = document.getElementById('anim-list-box');
        if (box) {
            box.querySelectorAll('.anim-row').forEach(row => {
                const ri = parseInt(row.dataset.idx, 10);
                const on = ri === k;
                // The hairline is the whole of the mark, and the stylesheet
                // draws it: nothing is painted from here.
                row.classList.toggle('focused', on);
            });
        }
        const label = document.getElementById('anim-preview-label');
        if (label) label.textContent = `#${list[k].id} · ${list[k].name}`;
        if (window.SkillAnimPreview) window.SkillAnimPreview.setAnimation(this._editorAnimId);
        SoundManager.playCursor();
        this.scrollToActiveItem('anim-list-box', '#anim-list-box .anim-row.focused');
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

    Proto.editorFusionCost = function () {
        if (!this._editorSlots || !this._editorSlots.every(x => x != null)) return 0;
        const actor = this.getTeachActor();
        return SkillMaster.kpFusionCost(this._editorSlots, actor ? actor.actorId() : 0);
    };

    Proto.editorCreate = async function () {
        if (!this._editorSlots || !this._editorSlots.every(x => x != null)) { SoundManager.playBuzzer(); return; }
        const actor = this.getTeachActor();
        const components = this._editorSlots.map(id => $dataSkills[id]);
        if (components.some(c => !c)) { SoundManager.playBuzzer(); return; }

        const cost = SkillMaster.kpFusionCost(this._editorSlots, actor.actorId());
        if ($gameSystem.getKnowledge() < cost) { SoundManager.playBuzzer(); return; }
        $gameSystem.spendKnowledge(cost);

        const intMod = actor ? (actor.intMod ?? Math.floor(((actor.mat || 10) - 10) / 2)) : 0;
        const dc = Math.min(18, Math.max(10, 11 + Math.floor(cost / 30)));
        let rollRes = null;

        if (window.Dice3D) {
            rollRes = await window.Dice3D.rollD20({
                actionName: `Arcane Fusion: ${components.map(c => c.name).join(' + ')}`,
                statName: 'INT',
                modifier: intMod,
                dc: dc,
                force3D: true
            });
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

        const consumedSlots = this._editorSlots.slice();
        const animId = (this._editorAnimId && this._editorAnimId > 0) ? this._editorAnimId : this.getDefaultAnimId();
        this._editorSlots = [null, null];
        this._editorAnimId = 0;
        this._editorFocus = FORGE_CREATE_IDX;

        if (rollRes.success) {
            const fused = buildFusedSkill(components, actor.actorId(), animId);

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

            window.skipLocalization = true;
            if (typeof T === 'function') {
                if (rollRes.nat20) {
                    $gameMessage.add(T('SkillMaster.fusionCritical', {
                        result: T('SkillMaster.fusedResult', {
                            name: fused.name, cost: cost, left: $gameSystem.getKnowledge(),
                        }),
                    }));
                } else {
                    $gameMessage.add(T('SkillMaster.fusedResult', {
                        name: fused.name, cost: cost, left: $gameSystem.getKnowledge(),
                    }));
                }
            }
            window.skipLocalization = false;
        } else {
            for (const id of consumedSlots) actor.forgetSkill(id);
            this.invalidateLearnedSkillCaches();
            SoundManager.playBuzzer();

            window.skipLocalization = true;
            if (typeof T === 'function') {
                $gameMessage.add(T('SkillMaster.fusionFailed', {
                    dc: dc, components: components.map(c => c.name).join(' & '),
                }));
            }
            window.skipLocalization = false;
        }

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

        window.skipLocalization = true;
        if (typeof T === 'function') {
            $gameMessage.add(T('SkillMaster.splitResult', { name: spell.name }));
        }
        window.skipLocalization = false;

        this.refreshUISkillDOM();
    };

    Proto.setupAnimPreview = function () {
        requestAnimationFrame(() => {
            if (this._viewMode !== 'spellEditor' || !this._editorAnimPicking) return;
            const canvas = document.getElementById('anim-preview-canvas');
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            canvas.width = Math.max(64, Math.floor(rect.width));
            canvas.height = Math.max(64, Math.floor(rect.height));
            if (window.SkillAnimPreview && window.SkillAnimPreview.isSupported() && window.SkillAnimPreview.init(canvas)) {
                window.SkillAnimPreview.setAnimation(this._editorAnimId);
            }
        });
    };

    Proto.renderSpellEditor = function (useItalian, knowledge) {
        const leftBox = document.getElementById('left-page-content');
        const rightBox = document.getElementById('right-page-content');
        if (!leftBox || !rightBox) return;
        const actor = this.getTeachActor();
        const picking = this._editorPicking;
        const animPicking = this._editorAnimPicking;

        const slotMeta = [
            { label: typeof T === 'function' ? T('SkillMaster.dominantSpell') : 'Dominant Spell',
              hint: typeof T === 'function' ? T('SkillMaster.magicOnlyDefinesTheEffect') : 'Magic only · Defines effect & damage' },
            { label: typeof T === 'function' ? T('SkillMaster.recessiveSpellOrSkill') : 'Recessive Spell / Skill',
              hint: typeof T === 'function' ? T('SkillMaster.spellOrSkillSetsThe') : 'Spell or Skill · Determines result type' }
        ];
        let slotsHTML = '';
        this._editorSlots.forEach((id, i) => {
            const skill = id ? $dataSkills[id] : null;
            const focused = !animPicking && this._editorFocus === i;
            const meta = slotMeta[i] || { label: '', hint: '' };
            let typeBadge = '';
            if (skill && i === FORGE_RECESSIVE_IDX) {
                const cat = SkillMaster.getSkillCategory(skill.id);
                const isSkill = cat ? SkillMaster.getCategoryType(cat) !== 'Magic' : false;
                const bLabel = isSkill ? (typeof T === 'function' ? T('SkillMaster.skill') : 'Skill') : (typeof T === 'function' ? T('SkillMaster.magic') : 'Magic');
                typeBadge = `<span class="sm-forge-badge">${bLabel}</span>`;
            }
            const value = skill
                ? `<span class="sm-forge-icon" style="${SkillMaster.getSkillIconStyle(skill.iconIndex)}"></span><span class="inspect-spec-value">${skill.name}</span><span class="sm-forge-cost">MP ${skill.mpCost} &middot; AP ${skill.tpCost}</span>`
                : `<span class="inspect-spec-value inspect-spec-value--muted">${typeof T === 'function' ? T('SkillMaster.emptySlot') : 'Empty'}</span>`;
            slotsHTML += `
                <div class="sm-forge-row focusable ${focused ? 'focused' : ''}" onclick="SceneManager._scene.editorFocusSlot(${i})">
                    <span class="inspect-spec-label">${meta.label}${typeBadge}</span>
                    <span class="sm-forge-answer">${value}</span>
                    <span class="sm-forge-hint">${meta.hint}</span>
                </div>`;
        });

        const animId = (this._editorAnimId && this._editorAnimId > 0) ? this._editorAnimId : this.getDefaultAnimId();
        const animData = animId && $dataAnimations ? $dataAnimations[animId] : null;
        const animName = animData ? `#${animId} · ${animData.name}` : (typeof T === 'function' ? T('SkillMaster.default') : 'Default');
        const animFocused = !animPicking && this._editorFocus === FORGE_ANIM_IDX;
        const animRowHTML = `
            <div class="sm-forge-row focusable ${animFocused ? 'focused' : ''}" onclick="SceneManager._scene.openAnimPicker()">
                <span class="inspect-spec-label">${typeof T === 'function' ? T('SkillMaster.animation') : 'Animation'}</span>
                <span class="sm-forge-answer"><span class="inspect-spec-value">${animName}</span></span>
            </div>`;

        const allFilled = this._editorSlots.every(x => x != null);
        const fuseCost = allFilled ? this.editorFusionCost() : 0;
        const canPay = !allFilled || knowledge >= fuseCost;
        const canForge = allFilled && canPay;
        const createFocused = !animPicking && this._editorFocus === FORGE_CREATE_IDX;
        const costTag = allFilled ? ` <span class="sm-forge-cost">&middot; ${fuseCost} KP</span>` : '';
        const createHTML = `
            <div class="inspect-actions sm-forge-actions">
                <div class="inspect-btn focusable ${createFocused ? 'selected' : ''} ${canForge ? '' : 'unusable'}" onclick="SceneManager._scene.editorCreate()">
                    ${typeof T === 'function' ? T('SkillMaster.fuseSpells2') : 'Fuse Spells'}${costTag}
                </div>
            </div>
            <div class="sm-forge-knowledge ${canPay ? '' : 'sm-forge-knowledge--short'}">
                ${typeof T === 'function' ? T('SkillMaster.knowledge') : 'Knowledge'}: <strong>${knowledge} KP</strong>${allFilled && !canPay ? (typeof T === 'function' ? T('SkillMaster.notEnough') : ' (Not enough KP)') : ''}
            </div>`;

        const customSpells = this.getEditorCustomSpells();
        let fusedListHTML = '';
        customSpells.forEach((s, k) => {
            const focusIdx = FORGE_SPLIT_BASE + k;
            const focused = !animPicking && this._editorFocus === focusIdx;
            fusedListHTML += `
                <div class="sm-skill-row focusable ${focused ? 'focused' : ''}" onclick="SceneManager._scene.editorSplit(${s.id})">
                    <span class="sm-skill-ident"><span class="sm-skill-icon" style="${SkillMaster.getSkillIconStyle(s.iconIndex)}"></span><span class="sm-skill-name">${s.name}</span></span>
                    <span class="ui-chip sm-skill-badge">${typeof T === 'function' ? T('SkillMaster.split') : 'Split'}</span>
                </div>`;
        });
        if (!fusedListHTML) fusedListHTML = `<div class="ui-empty"><div class="ui-empty-text">${typeof T === 'function' ? T('SkillMaster.noFusedSpellsYet') : 'No fused spells forged yet'}</div></div>`;

        const backBtn = typeof T === 'function' ? T('SkillMaster.back') : 'Back';
        const title = typeof T === 'function' ? T('SkillMaster.fuseSpells3') : 'Spell Fusion';
        leftBox.innerHTML = `
            <div class="page-header-bar">
              <div class="back-button focusable" onclick="SceneManager._scene.closeSpellEditor()">${backBtn}</div>
              <h2 class="title">${title}</h2>
            </div>
            <div class="sm-forge-rows">
                ${slotsHTML}
                ${animRowHTML}
                ${createHTML}
            </div>
            <div class="ui-section sm-forged-section">
                <h4 class="inspect-section-title">${typeof T === 'function' ? T('SkillMaster.fusedSpells') : 'Forged Spells'}</h4>
            </div>
            <div id="fused-scroll-box" class="ui-list ui-scroll sm-forged-list">
                ${fusedListHTML}
            </div>`;

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
            if (!candHTML) candHTML = `<div class="ui-empty"><div class="ui-empty-text">${typeof T === 'function' ? T('SkillMaster.noAvailableSkillsForThis') : 'No available skills for this slot'}</div></div>`;
            const pickTitle = slotIdx === FORGE_DOMINANT_IDX
                ? (typeof T === 'function' ? T('SkillMaster.chooseDominantSpell') : 'Choose Dominant Spell')
                : (typeof T === 'function' ? T('SkillMaster.chooseRecessive') : 'Choose Recessive Component');
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
            const faceX = (actor.faceIndex() % 4) * 144;
            const faceY = Math.floor(actor.faceIndex() / 4) * 144;
            let rowsHTML = '';
            list.forEach((a, k) => {
                const on = this._editorAnimPickIndex === k;
                rowsHTML += `
                    <div class="sm-skill-row anim-row focusable ${on ? 'focused' : ''}" data-idx="${k}" onclick="SceneManager._scene.editorAnimHighlight(${k})">
                        <span class="sm-skill-name">${a.name}</span>
                        <span class="sm-skill-cost">#${a.id}</span>
                    </div>`;
            });
            const pickTitle = typeof T === 'function' ? T('SkillMaster.chooseAnimation') : 'Choose Animation';
            const useLbl = typeof T === 'function' ? T('SkillMaster.use') : 'Use';
            const backLbl = typeof T === 'function' ? T('SkillMaster.cancel') : 'Cancel';
            rightHTML = `
                <div class="ui-detail">
                    <div class="ui-detail-head">
                        <div class="ui-detail-titles"><h3 class="sm-detail-name">${pickTitle}</h3></div>
                    </div>
                    <div class="sm-anim-stage">
                        <div class="sm-anim-face" style="--sm-face: ${window.CCArt.url('img/faces/' + actor.faceName() + '.png')}; --sm-face-x: -${faceX}px; --sm-face-y: -${faceY}px"></div>
                        <canvas id="anim-preview-canvas" class="sm-stage-canvas"></canvas>
                    </div>
                    <div id="anim-preview-label" class="sm-preview-anim">${cur ? `#${cur.id} · ${cur.name}` : ''}</div>
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
                const resultIsSkill = recCat ? SkillMaster.getCategoryType(recCat) !== 'Magic' : false;
                const resultKind = resultIsSkill ? (typeof T === 'function' ? T('SkillMaster.skill') : 'Skill') : (typeof T === 'function' ? T('SkillMaster.magic') : 'Magic');
                const previewCost = this.editorFusionCost();
                rightHTML = `
                    <div class="ui-detail sm-fuse-preview">
                        <div class="ui-detail-head">
                            <div class="ui-detail-titles">
                                <h3 class="sm-detail-name">${previewName}</h3>
                                <div class="sm-detail-meta">${typeof T === 'function' ? T('SkillMaster.preview2') : 'Preview'}</div>
                            </div>
                            <span class="ui-chip sm-result-chip">${typeof T === 'function' ? T('SkillMaster.becomesA') : 'Becomes a'} ${resultKind}</span>
                        </div>
                        <div class="ui-detail-scroll ui-scroll">
                            <div class="inspect-spec-grid">
                                <div class="inspect-spec-row"><span class="inspect-spec-label">${typeof T === 'function' ? T('SkillMaster.mpLabel') : 'MP'}</span><span class="inspect-spec-value">${mp}</span></div>
                                <div class="inspect-spec-row"><span class="inspect-spec-label">${typeof T === 'function' ? T('SkillMaster.apLabel') : 'AP'}</span><span class="inspect-spec-value">${ap}</span></div>
                                <div class="inspect-spec-row"><span class="inspect-spec-label">${typeof T === 'function' ? T('SkillMaster.fusionCost') : 'Fusion Cost'}</span><span class="inspect-spec-value ${knowledge >= previewCost ? '' : 'sm-value--short'}">${previewCost} KP</span></div>
                                <div class="inspect-spec-row"><span class="inspect-spec-label">${typeof T === 'function' ? T('SkillMaster.youHold') : 'You have'}</span><span class="inspect-spec-value">${knowledge} KP</span></div>
                                <div class="inspect-spec-row"><span class="inspect-spec-label">${typeof T === 'function' ? T('SkillMaster.dominant') : 'Dominant'}</span><span class="inspect-spec-value">${dominant.name}</span></div>
                                <div class="inspect-spec-row"><span class="inspect-spec-label">${typeof T === 'function' ? T('SkillMaster.recessive') : 'Recessive'}</span><span class="inspect-spec-value">${recessive.name}</span></div>
                            </div>
                            <div class="ui-prose">${typeof T === 'function' ? T('SkillMaster.theDominantDefinesDamageAnd') : 'Dominant sets core properties, recessive provides mixed traits.'}</div>
                        </div>
                    </div>`;
            } else {
                rightHTML = `
                    <div class="ui-empty sm-empty">
                        <div class="sm-empty-icon" style="${SkillMaster.getCategoryIconStyle('All')}"></div>
                        <h3 class="sm-detail-name">${typeof T === 'function' ? T('SkillMaster.fuseSpells3') : 'Spell Fusion'}</h3>
                        <div class="ui-empty-text">${typeof T === 'function' ? T('SkillMaster.forgeBlurb', { actor: actor.name(), knowledge: knowledge }) : `Combine two known abilities into a unique spell for ${actor.name()}.`}</div>
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

        if (Input.isTriggered('cancel') || Input.isTriggered('escape') || TouchInput.isCancelled()) {
            this.closeSpellEditor();
            return;
        } else if (Input.isTriggered('ok')) {
            if (this._editorFocus <= FORGE_RECESSIVE_IDX) {
                this.editorFocusSlot(this._editorFocus);
            } else if (this._editorFocus === FORGE_ANIM_IDX) {
                this.openAnimPicker();
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
        } else if (Input.isTriggered('up') || Input.isRepeated('up')) {
            this._editorFocus = (this._editorFocus - 1 + maxFocus) % maxFocus;
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

        const backLabel = typeof T === 'function' ? T('SkillMaster.back') : 'Back';
        const titleLabel = typeof T === 'function' ? T('SkillMaster.magicSystem.title') : 'Magical Systems';

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
            const yourSysTitle = typeof T === 'function' ? T('SkillMaster.magicSystem.yourSystem') : 'Your System';
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
            const emptyLabel = typeof T === 'function' ? T('SkillMaster.magicSystem.empty') : 'Select a system to inspect';
            return `
                <div class="ui-empty"><div class="ui-empty-text">${emptyLabel}</div></div>`;
        }
        const sys = SkillMaster.getAllMagicalSystems().find(s => s.id === id);
        const color = sys ? sys.color : 'var(--text-secondary-active)';
        const classNames = SkillMaster.getClassesForMagicSystem(id);
        const noClassesLabel = typeof T === 'function' ? T('SkillMaster.magicSystem.noClasses') : 'No classes affiliated';
        const classesHTML = classNames.length
            ? `<ul class="sm-ms-list">${classNames.map(n => `<li>${n}</li>`).join('')}</ul>`
            : `<div class="ui-empty-note">${noClassesLabel}</div>`;

        const actor = this.getTeachActor();
        const skills = SkillMaster.getSkillsForMagicSystem(id);
        const known = actor ? skills.filter(s => actor.isLearnedSkill(s.id)).length : 0;
        const fractionLine = skills.length
            ? `<div class="sm-ms-fraction">${typeof T === 'function' ? T('SkillMaster.magicSystem.knownFraction', { known: known, total: skills.length, pct: Math.round(known / skills.length * 100) }) : `Known: ${known} / ${skills.length} (${Math.round(known / skills.length * 100)}%)`}</div>`
            : '';
        const noSpellsLabel = typeof T === 'function' ? T('SkillMaster.magicSystem.noSpells') : 'No spells listed';
        const spellsHTML = skills.length
            ? `<ul class="sm-ms-list">${skills.map(s => {
                const isKnown = actor && actor.isLearnedSkill(s.id);
                return `<li class="${isKnown ? 'sm-ms-known' : ''}">${isKnown ? '&#10003; ' : ''}${s.name}</li>`;
              }).join('')}</ul>`
            : `<div class="ui-empty-note">${noSpellsLabel}</div>`;

        const loreText = SkillMaster.getMagicSystemLore(id);
        const loreHeading = typeof T === 'function' ? T('SkillMaster.magicSystem.loreHeading') : 'Lore';
        const loreHTML = loreText
            ? `<div class="ui-section"><h4 class="inspect-section-title">${loreHeading}</h4><div class="ui-prose sm-ms-lore">${loreText}</div></div>`
            : '';
        const classesHeading = typeof T === 'function' ? T('SkillMaster.magicSystem.classesHeading') : 'Affiliated Classes';
        const spellsHeading = typeof T === 'function' ? T('SkillMaster.magicSystem.spellsHeading') : 'Curriculum Spells';

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

    // Three across, with the backpack and the skills menu. The track count lives
    // in .sm-school-grid (css/theme.css); this is the cursor's copy of it and the
    // two move together.
    const CATEGORY_PAGE_COLS = 3;

    // The action buttons under the two school grids, in the order the ring
    // walks them: the fusion forge, the spell bench, the skill bench.
    const CATEGORY_ACTION_BTNS = ['.fuse-spells-btn', '.craft-spell-btn', '.craft-skill-btn'];
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
                    const pane = SkillMaster.getCategoryType(category) === 'Magic' ? 1 : 0;
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
                if (this._viewMode !== 'spellEditor' && this._viewMode !== 'preview') this.cycleTeachActor(dir);
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

        this._dndContainer.addEventListener("wheel", (e) => {
            e.preventDefault();
            // Every scrolling pane on this screen wears the shared .ui-scroll
            // now; the school grids are the last to keep their own name.
            let box = e.target.closest && e.target.closest('.ui-scroll, .skill-scroll-box');
            if (!box) {
                box = document.getElementById('category-scroll-box-left') ||
                      document.getElementById('category-scroll-box-right') ||
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
        return split.Skill.filter(c => c !== 'All').concat(split.Magic);
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
        return typeof T === 'function' ? T('SkillMaster.atlas.progress', { learned: count.learned, total: count.total }) : `${count.learned} / ${count.total}`;
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
        const progressText = typeof T === 'function' ? T('SkillMaster.atlas.progress', { learned: count.learned, total: count.total }) : `${count.learned} / ${count.total}`;
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
            const isOpen = window.SkillGraph ? window.SkillGraph.isOpen(teachActor, skill.id) : true;
            const badge = isLearned
                ? `<span class="ui-chip sm-skill-badge sm-skill-badge--learned">${typeof T === 'function' ? T('SkillMaster.mastered') : 'Mastered'}</span>`
                : (!isOpen ? `<span class="ui-chip sm-skill-badge sm-skill-badge--locked">${typeof T === 'function' ? T('SkillMaster.graph.locked') : 'Locked'}</span>` : '');

            skillsListHTML += `
                <div class="sm-skill-row focusable ${isFocused ? 'focused' : ''} ${isLearned || isOpen ? '' : 'is-shut'}" onclick="SceneManager._scene.selectSkill(${idx})">
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

            if (hasSkill) {
                const learnedLabel = typeof T === 'function' ? T('SkillMaster.learned') : 'Learned';
                actionsListHTML += `
                    <div class="sm-state-row sm-state-row--learned">
                        <span class="sm-state-title">${actor.name()}</span>
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
                    ? (typeof T === 'function' ? T('SkillMaster.graph.lockedCultist') : 'A Cultist learns only from grimoires and skill books.')
                    : arcaneReason === 'level'
                    ? (typeof T === 'function'
                        ? T(arcana.isForbidden(skill.id) ? 'SkillMaster.graph.lockedForbiddenLevel' : 'SkillMaster.graph.lockedEsotericLevel', { level: arcana.requiredLevel(skill.id) })
                        : `Requires level ${arcana.requiredLevel(skill.id)}`)
                    : (openers.length
                        ? (wanted > 1
                            ? (typeof T === 'function' ? T('SkillMaster.graph.lockedByCount', { need: wanted, skills: openers.join(', ') }) : `Requires ${wanted} more of: ${openers.join(', ')}`)
                            : (typeof T === 'function' ? T('SkillMaster.graph.lockedBy', { skills: openers.join(', ') }) : `Requires: ${openers.join(', ')}`))
                        : (typeof T === 'function' ? T('SkillMaster.graph.lockedHint') : 'Prerequisites not yet unlocked.'));
                const lockedTitle = typeof T === 'function' ? T('SkillMaster.graph.locked') : 'Locked';
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
                const teachText = typeof T === 'function' ? T('SkillMaster.teachPupil', { actor: actor.name() }) : `Teach ${actor.name()}`;
                actionsListHTML += `
                    <div class="inspect-btn sm-wide-btn focusable ${isActionFocused ? 'selected' : ''} ${!canAfford ? 'unusable' : ''}" onclick="SceneManager._scene.teachSkill(${actor.actorId()}, ${cost})">
                        <span class="sm-btn-label">${teachText}</span>
                        <span class="sm-btn-cost">${cost} KP</span>
                    </div>
                `;
            }
        }

        // The words the spell is said over, drawn from the same service the
        // skills menu reads them from (window.SkillDetails, CategorizedBattleSkills.js).
        // On a tree panel they are printed under the name, where the branch is
        // being read, rather than at the foot of the numbers; the block below
        // therefore asks build() not to print them a second time.
        const incantation = (window.SkillDetails && window.SkillDetails.incantationOf)
            ? window.SkillDetails.incantationOf(skill) : '';
        const escText = (str) => String(str == null ? '' : str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const incantationLabel = typeof T === 'function' ? T('SkillsMenu.section.incantation') : 'Incantation';
        const incantationHTML = incantation
            ? `<div class="ui-section sm-detail-incantation">
                   <h4 class="inspect-section-title">${escText(incantationLabel)}</h4>
                   <div class="inspect-flavour">${escText(incantation)}</div>
               </div>`
            : '';
        const detailedInfoHTML = window.SkillDetails
            ? window.SkillDetails.build(skill, actor, { skipLore: !!incantation }) : '';

        let descriptionText = skill.description || (typeof T === 'function' ? T('SkillMaster.noDescriptionAvailable') : 'No description available');
        if (window.translateText) descriptionText = window.translateText(descriptionText);

        const isPreviewFocused = allowActionFocus && (this._selectedActionIndex === 1);
        const previewLabel = typeof T === 'function' ? T('SkillMaster.preview') : 'Preview';
        const previewBtnHTML = `
            <div class="inspect-btn sm-preview-btn focusable ${isPreviewFocused ? 'selected' : ''}" onclick="SceneManager._scene.openSpellPreview(${skill.id})">
                ${previewLabel}
            </div>`;

        const note = skill.note || '';
        const tagForbidden = typeof T === 'function' ? T('SkillMaster.tag.forbidden') : 'Forbidden';
        const tagEsoteric = typeof T === 'function' ? T('SkillMaster.tag.esoteric') : 'Esoteric';
        const occultBadge = /<Forbidden>/i.test(note)
            ? `<span class="sg-occult sg-forbidden">${tagForbidden}</span>`
            : (/<Esoteric>/i.test(note) ? `<span class="sg-occult">${tagEsoteric}</span>` : '');

        const rootClass = opts.popup ? 'sm-skill-detail--popup' : '';
        const closeBtnHTML = opts.popup
            ? `<div class="sm-detail-close focusable" onclick="SceneManager._scene.dismissSkillDetail()" title="${typeof T === 'function' ? T('SkillMaster.close') : 'Close'}">✕</div>`
            : '';

        const teachLabel = typeof T === 'function' ? T('SkillMaster.teach') : 'Teach';
        const heldLabel = typeof T === 'function' ? T('SkillMaster.atlas.held', { knowledge: knowledge }) : `${knowledge} KP held`;

        return `
            <div class="ui-detail sm-skill-detail ${rootClass}">
                <div class="ui-detail-head">
                    <span class="sm-detail-icon" style="${SkillMaster.getSkillIconStyle(skill.iconIndex)}"></span>
                    <div class="ui-detail-titles">
                        <h3 class="sm-detail-name">${skill.name}</h3>
                        <div class="sm-detail-meta">
                            <span>MP ${skill.mpCost || 0}</span>
                            <span>&middot;</span>
                            <span>AP ${skill.tpCost || 0}</span>
                            ${occultBadge}
                        </div>
                    </div>
                    ${closeBtnHTML}
                </div>

                <div class="ui-detail-scroll ui-scroll sm-detail-body">
                    <div class="ui-prose sm-detail-desc">${descriptionText}</div>
                    ${incantationHTML}
                    ${detailedInfoHTML}
                </div>

                <div class="ui-section sm-teach-section">
                    <h4 class="inspect-section-title sm-teach-heading">
                        ${teachLabel}
                        <span class="sm-teach-held">&middot; ${heldLabel}</span>
                    </h4>
                    <div class="inspect-actions sm-teach-actions">
                        ${actionsListHTML}
                        ${previewBtnHTML}
                    </div>
                </div>
            </div>
        `;
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
            overlay.className = 'sm-detail-dock';
            this._dndContainer.appendChild(overlay);
        }
        overlay.innerHTML = `
            <div id="skill-detail-bar" class="ui-panel sm-detail-bar" onclick="event.stopPropagation()">
                ${cardHTML}
            </div>`;
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
            if (this._viewMode === 'spellEditor' || this._viewMode === 'craft' || members.length <= 1) {
                compRow.classList.add('is-hidden');
                compRow.innerHTML = '';
            } else {
                compRow.classList.remove('is-hidden');
                let tabs = '';
                members.forEach((m, idx) => {
                    const sel = m.actorId() === this._teachActorId ? 'selected' : '';
                    tabs += `<div class="companion-tab ${sel}" onclick="SceneManager._scene.switchTeachActor(${idx})">${m.name()}</div>`;
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

        if (this._viewMode === 'spellEditor') {
            this.renderSpellEditor(useItalian, knowledge);
            return;
        }

        if (this._viewMode === 'craft') {
            this.renderCraftBench(knowledge);
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
                if (cat !== "All") {
                    if (SkillMaster.actorCategoryManager.isPrimary(cat)) {
                        bonusBadge = `<span class="sm-school-badge">${typeof T === 'function' ? T('SkillMaster.primarySchool') : 'Primary'}</span>`;
                    } else if (SkillMaster.actorCategoryManager.isSecondary(cat)) {
                        bonusBadge = `<span class="sm-school-badge">${typeof T === 'function' ? T('SkillMaster.secondarySchool') : 'Secondary'}</span>`;
                    } else if (SkillMaster.actorCategoryManager.isForeign(cat)) {
                        bonusBadge = `<span class="sm-school-badge sm-school-badge--foreign">${typeof T === 'function' ? T('SkillMaster.foreignSchool') : 'Foreign'}</span>`;
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
                const categoriesListHTML = renderCategoryCardsHTML(split.Skill, 0);
                const backBtnText = typeof T === 'function' ? T('SkillMaster.back') : 'Back';
                const skillsTitle = typeof T === 'function' ? T('SkillMaster.skills') : 'Skills';

                const craftSkillLabel = typeof T === 'function' ? T('SkillMaster.craft.buttonSkill') : 'Craft Skill';
                leftPageHTML = `
                    <div class="page-header-bar">
                      <div class="back-button focusable" onclick="SceneManager._scene.categoryBack()">${backBtnText}</div>
                      <h2 class="title">${skillsTitle}</h2>
                    </div>
                    <div id="category-scroll-box-left" class="skill-scroll-box sm-school-grid">
                        ${categoriesListHTML}
                    </div>
                    <div class="inspect-actions sm-magic-actions">
                        <div class="inspect-btn craft-skill-btn focusable" onclick="SceneManager._scene.openCraftBench('skill')">${craftSkillLabel}</div>
                    </div>
                `;
            } else {
                const returnBtnText = typeof T === 'function' ? T('SkillMaster.back') : 'Back';
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
            // The three buttons under the schools are one ring: the forge, the
            // spell bench and the skill bench, walked left and right.
            CATEGORY_ACTION_BTNS.forEach((sel, i) => {
                const el = document.querySelector(sel);
                if (!el) return;
                const on = !!this._categoryFuseFocused && (this._categoryActionIndex || 0) === i;
                el.classList.toggle('focused', on);
                el.classList.toggle('selected', on);
                if (on && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
            });
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

            if (this._viewMode === 'category') {
                const split = SkillMaster.getSplitSkillCategories();
                const magicListHTML = renderCategoryCardsHTML(split.Magic, 1);
                const magicTitle = typeof T === 'function' ? T('SkillMaster.magic') : 'Magic';
                const pupilLine = `<div class="sm-pupil-line">${typeof T === 'function' ? T('SkillMaster.atlas.held', { knowledge: knowledge }) : `${knowledge} KP`}</div>`;
                const fuseLabel = typeof T === 'function' ? T('SkillMaster.fuseSpells') : 'Fuse Spells';
                const magicSysLabel = typeof T === 'function' ? T('SkillMaster.magicSystem.tabLabel') : 'Magical Systems Wheel';

                const craftSpellLabel = typeof T === 'function' ? T('SkillMaster.craft.buttonSpell') : 'Craft Spell';
                const fuseBtn = `
                    <div class="inspect-btn fuse-spells-btn focusable" onclick="SceneManager._scene.openSpellEditor()">${fuseLabel}</div>
                    <div class="inspect-btn craft-spell-btn focusable" onclick="SceneManager._scene.openCraftBench('spell')">${craftSpellLabel}</div>`;
                const magicSystemsBtn = `
                    <div class="inspect-btn magic-systems-btn focusable" onclick="SceneManager._scene.openMagicSystems()">${magicSysLabel}</div>`;

                rightPageHTML = `
                    <div class="page-header-bar">
                      <h2 class="title">${magicTitle}</h2>
                    </div>
                    <div id="category-scroll-box-right" class="skill-scroll-box sm-school-grid">
                        ${magicListHTML}
                    </div>
                    <div class="inspect-actions sm-magic-actions">
                        ${fuseBtn}
                        ${magicSystemsBtn}
                    </div>
                    ${pupilLine}
                `;
            } else if (this._viewMode === 'list' || this._viewMode === 'detail') {
                if (!skill) {
                    const selectPrompt = typeof T === 'function' ? T('SkillMaster.selectASkill') : 'Select a skill';
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
            this._lastRightMode = this._viewMode;
            this._lastRightSkillId = skillId;
            this._lastRightActionIndex = this._selectedActionIndex;
            this._lastRightKnowledge = knowledge;
        }
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

        const allowed = SkillMaster.actorCategoryManager.allowedCategories();
        const stillOpen = !this._selectedCategory || this._selectedCategory === 'All' || !allowed || allowed.includes(this._selectedCategory);
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
        const label = locked ? (typeof T === 'function' ? T('SkillMaster.carry.locked') : 'Always Carried')
            : active ? (typeof T === 'function' ? T('SkillMaster.carry.drop') : 'Unequip Skill')
                : full ? (typeof T === 'function' ? T('SkillMaster.carry.full') : 'Loadout Full') : (typeof T === 'function' ? T('SkillMaster.carry.take') : 'Equip Skill');
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
        const LO = window.BattleLoadout;
        if (LO.isAlwaysCarried(actor, skill)) { SoundManager.playBuzzer(); return; }
        if (LO.isActive(actor, skill)) {
            LO.remove(actor, skill);
            SoundManager.playCancel();
        } else {
            if (!LO.hasRoom(actor)) { SoundManager.playBuzzer(); return; }
            LO.add(actor, skill);
            SoundManager.playOk();
        }
        this.refreshUISkillDOM();
    };

    Scene_SkillEncyclopedia.prototype.fusionActionsHTML = function (actor, skill) {
        if (!skill || !skill._customSpell || skill._ownerActorId !== actor.actorId()) return '';
        const btn = (label, handler, danger) => `
            <div class="inspect-btn focusable ${danger ? 'inspect-btn--danger' : ''}" onclick="${handler}">
                ${label}
            </div>
        `;
        const renameLabel = typeof T === 'function' ? T('SkillMaster.rename') : 'Rename';
        const dissolveLabel = typeof T === 'function' ? T('SkillMaster.dissolve') : 'Dissolve';
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
        const promptText = typeof T === 'function' ? T('SkillMaster.renamePrompt') : 'Enter new spell name:';
        const next = (window.prompt && window.prompt(promptText, current)) || '';
        const clean = next.trim();
        if (!clean || clean === current) return;
        spell.name = clean;
        SoundManager.playOk();
        this.refreshUISkillDOM();
    };

    Scene_SkillEncyclopedia.prototype.dissolveFusedSpell = function (skillId) {
        const actor = this.getTeachActor();
        const spell = $dataSkills[skillId];
        if (!actor || !spell || !spell._customSpell) return;
        const confirmText = typeof T === 'function' ? T('SkillMaster.dissolveConfirm', { name: spell.name }) : `Dissolve ${spell.name} into knowledge?`;
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

        const graph = window.SkillGraph;
        if (!isWorkshop && graph && !graph.isOpen(actor, skill.id)) {
            SoundManager.playBuzzer();
            const arcana = window.SkillArcana;
            const why = arcana ? arcana.treeBlockReason(actor, skill.id) : null;
            const toast = why === 'cultist'
                ? (typeof T === 'function' ? T('SkillMaster.graph.lockedCultist') : 'A Cultist learns only from grimoires and skill books.')
                : why === 'level'
                ? (typeof T === 'function'
                    ? T(arcana.isForbidden(skill.id) ? 'SkillMaster.graph.lockedForbiddenLevel' : 'SkillMaster.graph.lockedEsotericLevel', { level: arcana.requiredLevel(skill.id) })
                    : `Requires level ${arcana.requiredLevel(skill.id)}`)
                : (typeof T === 'function' ? T('SkillMaster.graph.lockedToast', { skill: skill.name }) : `${skill.name} is locked!`);
            this._skillDetailWindow.showMessage(toast);
            this.refreshUISkillDOM();
            return;
        }

        if (!isWorkshop) $gameSystem.spendKnowledge(cost);
        actor.learnSkill(skill.id);
        this.invalidateLearnedSkillCaches();
        SoundManager.playRecovery();

        const learnedToast = typeof T === 'function' ? T('SkillMaster.actorLearned', { actor: actor.name(), skill: skill.name }) : `${actor.name()} learned ${skill.name}!`;
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
            document.getElementById('category-scroll-box-right') ||
            document.getElementById('category-scroll-box-left') ||
            (this._dndContainer && this._dndContainer.querySelector('.ui-scroll, .skill-scroll-box'));
    };

    Scene_SkillEncyclopedia.prototype.update = function () {
        Scene_MenuBase.prototype.update.call(this);

        // A field has focus somewhere on the sheet: every letter belongs to it
        // and nothing else on the page may read the keyboard.
        if (this._craftTyping) return;

        if (window.CCNav && window.CCNav.update()) return;
        if (window.CCScroll) window.CCScroll.update(this._dndContainer);

        if (this._viewMode !== 'spellEditor' && this._viewMode !== 'craft' && this._viewMode !== 'preview' && getSwitchableMembers().length > 1) {
            if (Input.isTriggered('pagedown')) { this.cycleTeachActor(1); return; }
            if (Input.isTriggered('pageup')) { this.cycleTeachActor(-1); return; }
        }

        if (this._viewMode === 'category') {
            const split = this.getSplitCategoriesCached();
            const lists = [split.Skill, split.Magic];
            const cols = CATEGORY_PAGE_COLS;
            let pane = this._categoryPane;
            let idx = this._selectedCategoryIndex;
            const prevPane = pane, prevIdx = idx;
            const curLen = lists[pane].length;

            if (this._categoryFuseFocused) {
                const act = this._categoryActionIndex || 0;
                if (Input.isTriggered('ok')) {
                    if (act === 1) this.openCraftBench('spell');
                    else if (act === 2) this.openCraftBench('skill');
                    else this.openSpellEditor();
                    return;
                }
                if (Input.isTriggered('cancel') || Input.isTriggered('escape') || TouchInput.isCancelled()) {
                    this.categoryBack();
                    return;
                }
                if (Input.isTriggered('right') || Input.isRepeated('right')) {
                    this._categoryActionIndex = (act + 1) % CATEGORY_ACTION_BTNS.length;
                    SoundManager.playCursor();
                    this.refreshUISkillDOM();
                    return;
                }
                if (Input.isTriggered('left') || Input.isRepeated('left')) {
                    if (act > 0) {
                        this._categoryActionIndex = act - 1;
                        SoundManager.playCursor();
                        this.refreshUISkillDOM();
                        return;
                    }
                }
                if (Input.isTriggered('up') || Input.isRepeated('up') || Input.isTriggered('left') || Input.isRepeated('left')) {
                    this._categoryFuseFocused = false;
                    this._categoryActionIndex = 0;
                    SoundManager.playCursor();
                    this.refreshUISkillDOM();
                }
                return;
            }

            if (Input.isTriggered('shift')) {
                this.openSpellEditor();
                return;
            } else if (Input.isTriggered('ok')) {
                this.selectCategory();
                return;
            } else if (Input.isTriggered('cancel') || Input.isTriggered('escape') || TouchInput.isCancelled()) {
                this.categoryBack();
                return;
            } else if (Input.isTriggered('right') || Input.isRepeated('right')) {
                const col = idx % cols;
                if (col === cols - 1 && pane === 0 && lists[1].length > 0) {
                    const row = Math.floor(idx / cols);
                    pane = 1;
                    idx = Math.min(row * cols, lists[1].length - 1);
                } else if (idx + 1 < curLen) {
                    idx += 1;
                }
            } else if (Input.isTriggered('left') || Input.isRepeated('left')) {
                const col = idx % cols;
                if (col === 0 && pane === 1 && lists[0].length > 0) {
                    const row = Math.floor(idx / cols);
                    pane = 0;
                    idx = Math.min(row * cols + (cols - 1), lists[0].length - 1);
                } else if (idx - 1 >= 0) {
                    idx -= 1;
                }
            } else if (Input.isTriggered('down') || Input.isRepeated('down')) {
                if (idx + cols < curLen) {
                    idx += cols;
                } else if (pane === 1 && idx === curLen - 1) {
                    this._categoryFuseFocused = true;
                    this._categoryActionIndex = 0;
                    SoundManager.playCursor();
                    this.refreshUISkillDOM();
                    return;
                } else {
                    idx = curLen - 1;
                }
            } else if (Input.isTriggered('up') || Input.isRepeated('up')) {
                if (idx - cols >= 0) {
                    idx -= cols;
                } else if (this._ccEnterNav('up')) {
                    return;
                }
            }

            if (pane !== prevPane || idx !== prevIdx) {
                this._categoryPane = pane;
                this._selectedCategoryIndex = idx;
                SoundManager.playCursor();
                this.refreshUISkillDOM();
                const boxId = pane === 1 ? 'category-scroll-box-right' : 'category-scroll-box-left';
                this.scrollToActiveItem(boxId, `#${boxId} .category-card.focused`);
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
                if (Input.isTriggered('shift')) {
                    const wide = this.wholeAtlasZoom();
                    this.setAtlasZoom(this.atlasZoom() > wide + 0.01 ? wide : this.defaultAtlasZoom());
                    this.scrollGraphToFocus();
                    SoundManager.playCursor();
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
                    const cost = $gameSystem.getSkillKnowledgeCost(skill.id, actor.actorId());
                    this.teachSkill(actor.actorId(), cost);
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
        if (rank === "forbidden") return actor.level >= CHAOS_FORBIDDEN_LEVEL;
        if (rank === "esoteric") return actor.level >= CHAOS_ESOTERIC_LEVEL;
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
            $gameMessage.add(window.T("SkillMaster.chaosLevelSkill", {
                actor: actor.name(), skill: $dataSkills[skillId].name,
            }));
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
 * @plugindesc v1.0.0 SkillMaster - the Workbench: writing a spell or a skill from bought components.
 * @author Omni-Lex
 *
 * @help
 * The Fusion forge welds together two things somebody else wrote. The
 * Workbench is the other half of the bench: nothing is melted down, every part
 * is bought, and what comes off it is a skill entry written field by field,
 * the same fields the editor itself writes.
 *
 * A build is a core, a shape, an optional amplifier, any number of riders and
 * any number of refinements. Each part carries two numbers: what it costs in
 * knowledge, and how much complexity it adds. The knowledge is paid once, at
 * the moment the entry is written. The complexity is paid forever:
 *
 *   resource cost    a spell spends MP, a skill spends AP, and both scale
 *                    with the complexity of the build
 *   stat floor       the build stamps <StatReq: INT n> on a spell and
 *                    <StatReq: WIS n> on a skill, and the bench refuses to
 *                    write an entry whose floor the character cannot reach
 *
 * That floor is the balance: knowledge alone never buys an ultimate, because
 * the only characters who can hold a complicated build are the ones who
 * studied the stat it leans on. Under the floor a skill still slips in battle
 * exactly as every shipped skill does (window.SkillStatReq owns that, and this
 * bench does not re-derive it).
 *
 * The name, the description, the lore, the icon and the animation are the
 * writer's own, and any of them can be rewritten later for nothing. A crafted
 * entry can also be re-opened and rebuilt: the bench charges only the
 * difference in price and never refunds.
 *
 * The bench also rewrites the description and the lore of ordinary skills the
 * character already knows. Those overrides live on $gameSystem and are laid
 * back over $dataSkills every time a save is loaded.
 */

(() => {
    'use strict';

    window.SkillMaster = window.SkillMaster || {};

    const CRAFT_SPELL_CATEGORY = 'Crafted';
    const CRAFT_SKILL_CATEGORY = 'Devised';
    SkillMaster.CRAFT_SPELL_CATEGORY = CRAFT_SPELL_CATEGORY;
    SkillMaster.CRAFT_SKILL_CATEGORY = CRAFT_SKILL_CATEGORY;

    // How many entries one character may keep on the bench at a time. The cap
    // is the bench's, not the party's: it stops a character carrying forty
    // near-identical builds and turning the list into something unreadable.
    const CRAFT_MAX_PER_ACTOR = 12;
    const CRAFT_MAX_RIDERS = 4;
    const CRAFT_MAX_REFINES = 5;

    const PARAM_INT = 4;
    const PARAM_WIS = 5;

    const tr = (key, params) => (typeof T === 'function' ? T('SkillMaster.craft.' + key, params) : key);

    //=========================================================================
    // The catalogue
    //
    // Every component is one row of these tables. `kp` is what it costs to
    // buy, `cx` the complexity it adds, and `use` which bench it belongs to.
    // Nothing else in the module knows a component by name.
    //=========================================================================

    // Cores. `dmg` is the damage type an entry with this core writes
    // (1 HP damage, 2 MP damage, 3 HP recovery, 4 MP recovery, 5 HP drain,
    // 6 MP drain, 0 nothing at all), `power` the multiplier on the caster's
    // attacking stat and `pierce` the share of the target's defence that
    // still counts against it.
    const CORES = [
        { key: 'fire',       use: 'spell', kp: 140, cx: 1.0, dmg: 1, element: 2, power: 2.4, pierce: 1.0, hit: 2 },
        { key: 'ice',        use: 'spell', kp: 140, cx: 1.0, dmg: 1, element: 3, power: 2.3, pierce: 1.0, hit: 2 },
        { key: 'thunder',    use: 'spell', kp: 150, cx: 1.1, dmg: 1, element: 4, power: 2.6, pierce: 0.8, hit: 2 },
        { key: 'water',      use: 'spell', kp: 135, cx: 1.0, dmg: 1, element: 5, power: 2.2, pierce: 1.1, hit: 2 },
        { key: 'stone',      use: 'spell', kp: 145, cx: 1.0, dmg: 1, element: 6, power: 2.5, pierce: 0.9, hit: 2 },
        { key: 'gale',       use: 'spell', kp: 135, cx: 1.0, dmg: 1, element: 7, power: 2.2, pierce: 1.0, hit: 2 },
        { key: 'sacred',     use: 'spell', kp: 200, cx: 1.5, dmg: 1, element: 8, power: 2.8, pierce: 0.7, hit: 2 },
        { key: 'cursed',     use: 'spell', kp: 220, cx: 1.6, dmg: 1, element: 9, power: 3.0, pierce: 0.6, hit: 2 },
        { key: 'arcane',     use: 'spell', kp: 180, cx: 1.3, dmg: 1, element: 0, power: 2.5, pierce: 0.8, hit: 2 },
        { key: 'mend',       use: 'spell', kp: 160, cx: 1.1, dmg: 3, element: 0, power: 2.6, pierce: 0.0, hit: 0 },
        { key: 'etherFlow',  use: 'spell', kp: 190, cx: 1.3, dmg: 4, element: 0, power: 0.9, pierce: 0.0, hit: 0 },
        { key: 'siphon',     use: 'spell', kp: 260, cx: 1.9, dmg: 5, element: 9, power: 1.8, pierce: 0.8, hit: 2 },
        { key: 'mindBurn',   use: 'spell', kp: 210, cx: 1.4, dmg: 2, element: 0, power: 1.2, pierce: 0.5, hit: 2 },
        { key: 'ward',       use: 'spell', kp: 90,  cx: 0.5, dmg: 0, element: 0, power: 0.0, pierce: 0.0, hit: 0 },

        { key: 'strike',     use: 'skill', kp: 120, cx: 0.9, dmg: 1, element: 1, power: 3.0, pierce: 1.0, hit: 1 },
        { key: 'cleave',     use: 'skill', kp: 150, cx: 1.1, dmg: 1, element: 1, power: 3.4, pierce: 1.2, hit: 1 },
        { key: 'thrust',     use: 'skill', kp: 165, cx: 1.2, dmg: 1, element: 1, power: 2.8, pierce: 0.5, hit: 1 },
        { key: 'brawl',      use: 'skill', kp: 130, cx: 1.0, dmg: 1, element: 1, power: 3.1, pierce: 0.9, hit: 1 },
        { key: 'marksman',   use: 'skill', kp: 175, cx: 1.2, dmg: 1, element: 1, power: 2.9, pierce: 0.7, hit: 0 },
        { key: 'venomEdge',  use: 'skill', kp: 190, cx: 1.3, dmg: 1, element: 9, power: 2.6, pierce: 0.8, hit: 1 },
        { key: 'bandage',    use: 'skill', kp: 140, cx: 1.0, dmg: 3, element: 0, power: 1.6, pierce: 0.0, hit: 0 },
        { key: 'secondWind', use: 'skill', kp: 200, cx: 1.4, dmg: 5, element: 1, power: 1.6, pierce: 0.9, hit: 1 },
        { key: 'rally',      use: 'skill', kp: 80,  cx: 0.5, dmg: 0, element: 0, power: 0.0, pierce: 0.0, hit: 0 }
    ];

    // Amplifiers. One at most, and the multiplier lands on the core's power.
    const POWERS = [
        { key: 'plain',   kp: 0,   cx: 0.0, mult: 1.00 },
        { key: 'focused', kp: 140, cx: 0.8, mult: 1.25 },
        { key: 'potent',  kp: 380, cx: 1.8, mult: 1.60 },
        { key: 'ruinous', kp: 900, cx: 3.4, mult: 2.10 }
    ];

    // Shapes. `side` is the line the shape points at, so the bench can refuse
    // a healing core aimed across the field.
    const SCOPES = [
        { key: 'oneEnemy',    kp: 0,   cx: 0.0, scope: 1,  side: 'enemy' },
        { key: 'twoRandom',   kp: 160, cx: 0.9, scope: 4,  side: 'enemy' },
        { key: 'threeRandom', kp: 300, cx: 1.5, scope: 5,  side: 'enemy' },
        { key: 'allEnemies',  kp: 520, cx: 2.3, scope: 2,  side: 'enemy' },
        { key: 'oneAlly',     kp: 0,   cx: 0.0, scope: 7,  side: 'ally' },
        { key: 'allAllies',   kp: 420, cx: 2.0, scope: 8,  side: 'ally' },
        { key: 'theUser',     kp: 0,   cx: 0.0, scope: 11, side: 'ally' },
        { key: 'everyone',    kp: 780, cx: 3.0, scope: 14, side: 'both' }
    ];

    // Riders. Each writes effects onto the entry. `side` is the line the rider
    // makes sense on, and the bench bars the ones the shape cannot reach.
    const RIDERS = [
        { key: 'poison',       kp: 150, cx: 0.7, side: 'enemy', effects: [{ code: 21, dataId: 4,  value1: 0.60, value2: 0 }] },
        { key: 'blind',        kp: 150, cx: 0.7, side: 'enemy', effects: [{ code: 21, dataId: 5,  value1: 0.55, value2: 0 }] },
        { key: 'silence',      kp: 210, cx: 1.0, side: 'enemy', effects: [{ code: 21, dataId: 6,  value1: 0.45, value2: 0 }] },
        { key: 'confusion',    kp: 230, cx: 1.1, side: 'enemy', effects: [{ code: 21, dataId: 8,  value1: 0.35, value2: 0 }] },
        { key: 'sleep',        kp: 250, cx: 1.2, side: 'enemy', effects: [{ code: 21, dataId: 10, value1: 0.35, value2: 0 }] },
        { key: 'freeze',       kp: 260, cx: 1.2, side: 'enemy', effects: [{ code: 21, dataId: 11, value1: 0.32, value2: 0 }] },
        { key: 'paralysis',    kp: 300, cx: 1.4, side: 'enemy', effects: [{ code: 21, dataId: 12, value1: 0.30, value2: 0 }] },
        { key: 'stun',         kp: 240, cx: 1.1, side: 'enemy', effects: [{ code: 21, dataId: 13, value1: 0.40, value2: 0 }] },
        { key: 'deathMark',    kp: 620, cx: 2.6, side: 'enemy', effects: [{ code: 21, dataId: 33, value1: 0.22, value2: 0 }] },
        { key: 'provoke',      kp: 120, cx: 0.5, side: 'enemy', effects: [{ code: 21, dataId: 20, value1: 0.90, value2: 0 }] },
        { key: 'sapAtk',       kp: 170, cx: 0.8, side: 'enemy', effects: [{ code: 32, dataId: 2,  value1: 5, value2: 0 }] },
        { key: 'sapDef',       kp: 170, cx: 0.8, side: 'enemy', effects: [{ code: 32, dataId: 3,  value1: 5, value2: 0 }] },
        { key: 'sapMat',       kp: 170, cx: 0.8, side: 'enemy', effects: [{ code: 32, dataId: 4,  value1: 5, value2: 0 }] },
        { key: 'sapAgi',       kp: 190, cx: 0.9, side: 'enemy', effects: [{ code: 32, dataId: 6,  value1: 5, value2: 0 }] },
        { key: 'stripBuffs',   kp: 260, cx: 1.1, side: 'enemy', effects: [{ code: 33, dataId: 2, value1: 0, value2: 0 }, { code: 33, dataId: 3, value1: 0, value2: 0 }, { code: 33, dataId: 4, value1: 0, value2: 0 }] },

        { key: 'regenHP',      kp: 260, cx: 1.2, side: 'ally',  effects: [{ code: 21, dataId: 15, value1: 1.0, value2: 0 }] },
        { key: 'regenMP',      kp: 280, cx: 1.3, side: 'ally',  effects: [{ code: 21, dataId: 16, value1: 1.0, value2: 0 }] },
        { key: 'regenAP',      kp: 280, cx: 1.3, side: 'ally',  effects: [{ code: 21, dataId: 17, value1: 1.0, value2: 0 }] },
        { key: 'protect',      kp: 300, cx: 1.4, side: 'ally',  effects: [{ code: 21, dataId: 19, value1: 1.0, value2: 0 }] },
        { key: 'counter',      kp: 330, cx: 1.5, side: 'ally',  effects: [{ code: 21, dataId: 22, value1: 0.90, value2: 0 }] },
        { key: 'inspired',     kp: 280, cx: 1.2, side: 'ally',  effects: [{ code: 21, dataId: 24, value1: 1.0, value2: 0 }] },
        { key: 'arcaneSurge',  kp: 480, cx: 2.1, side: 'ally',  effects: [{ code: 21, dataId: 36, value1: 0.80, value2: 0 }] },
        { key: 'divineShield', kp: 700, cx: 2.9, side: 'ally',  effects: [{ code: 21, dataId: 32, value1: 0.35, value2: 0 }] },
        { key: 'shadowVeil',   kp: 340, cx: 1.5, side: 'ally',  effects: [{ code: 21, dataId: 35, value1: 0.85, value2: 0 }] },
        { key: 'wardAilments', kp: 360, cx: 1.6, side: 'ally',  effects: [{ code: 21, dataId: 23, value1: 0.90, value2: 0 }] },
        { key: 'braceAtk',     kp: 170, cx: 0.8, side: 'ally',  effects: [{ code: 31, dataId: 2, value1: 5, value2: 0 }] },
        { key: 'braceDef',     kp: 170, cx: 0.8, side: 'ally',  effects: [{ code: 31, dataId: 3, value1: 5, value2: 0 }] },
        { key: 'braceMat',     kp: 170, cx: 0.8, side: 'ally',  effects: [{ code: 31, dataId: 4, value1: 5, value2: 0 }] },
        { key: 'braceAgi',     kp: 190, cx: 0.9, side: 'ally',  effects: [{ code: 31, dataId: 6, value1: 5, value2: 0 }] },
        { key: 'cleanse',      kp: 320, cx: 1.3, side: 'ally',  effects: [4, 5, 6, 8, 10, 11, 12, 13].map(id => ({ code: 22, dataId: id, value1: 1.0, value2: 0 })) },
        { key: 'firstAid',     kp: 240, cx: 1.0, side: 'ally',  effects: [{ code: 11, dataId: 0, value1: 0.15, value2: 0 }] },
        { key: 'etherSplash',  kp: 300, cx: 1.3, side: 'ally',  effects: [{ code: 12, dataId: 0, value1: 0.12, value2: 0 }] },
        { key: 'apSurge',      kp: 220, cx: 1.0, side: 'ally',  effects: [{ code: 13, dataId: 0, value1: 15, value2: 0 }] }
    ];

    // Refinements write the plain fields of the entry rather than its effects,
    // and each one is a single named change, so the readout can say exactly
    // what the build did to the sheet.
    const REFINES = [
        { key: 'certain',    kp: 260, cx: 1.1, apply: sk => { sk.hitType = 0; } },
        { key: 'twinCast',   kp: 420, cx: 2.0, apply: sk => { sk.repeats = 2; } },
        { key: 'tripleCast', kp: 900, cx: 3.6, apply: sk => { sk.repeats = 3; } },
        { key: 'swift',      kp: 200, cx: 0.9, apply: sk => { sk.speed = (sk.speed || 0) + 25; } },
        { key: 'precise',    kp: 150, cx: 0.6, apply: sk => { sk.successRate = 100; } },
        { key: 'stable',     kp: 130, cx: 0.5, apply: sk => { if (sk.damage) sk.damage.variance = 0; } },
        { key: 'wild',       kp: 60,  cx: 0.2, apply: sk => { if (sk.damage) sk.damage.variance = 50; } },
        { key: 'keenEdge',   kp: 340, cx: 1.5, apply: sk => { if (sk.damage) sk.damage.critical = true; } },
        { key: 'guardBreak', kp: 300, cx: 1.3, apply: (sk, ctx) => { ctx.pierce *= 0.5; } },
        { key: 'efficient',  kp: 380, cx: 0.0, apply: (sk, ctx) => { ctx.costMult *= 0.7; } },
        { key: 'menuCast',   kp: 260, cx: 1.0, apply: sk => { sk.occasion = 0; } },
        { key: 'apReturn',   kp: 200, cx: 0.8, apply: sk => { sk.tpGain = (sk.tpGain || 0) + 12; } }
    ];

    const byKey = (list, key) => list.find(c => c.key === key) || null;

    SkillMaster.CraftCatalogue = { CORES, POWERS, SCOPES, RIDERS, REFINES };

    //=========================================================================
    // Pricing
    //
    // One place answers what a build costs and what it asks of the character.
    // Nothing else in the module works it out a second time.
    //=========================================================================

    function craftParts(build) {
        const parts = [];
        const core = byKey(CORES, build.core);
        const power = byKey(POWERS, build.power) || POWERS[0];
        const scope = byKey(SCOPES, build.scope);
        if (core) parts.push(core);
        if (power && power.kp) parts.push(power);
        if (scope) parts.push(scope);
        for (const k of (build.riders || [])) { const r = byKey(RIDERS, k); if (r) parts.push(r); }
        for (const k of (build.refines || [])) { const r = byKey(REFINES, k); if (r) parts.push(r); }
        return parts;
    }

    function craftQuote(build) {
        const parts = craftParts(build);
        const spell = build.kind !== 'skill';
        let kp = 0, cx = 0;
        for (const p of parts) { kp += p.kp || 0; cx += p.cx || 0; }

        // A long build is worth more than the sum of its parts: every
        // component past the second asks the bench to reconcile it with
        // everything already on the slab, and that is what is being paid for.
        const stacking = 1 + 0.12 * Math.max(0, parts.length - 2);
        let costMult = 1;
        if ((build.refines || []).includes('efficient')) costMult *= 0.7;

        const resourceRaw = spell ? (3 + cx * 3.4) : (4 + cx * 4.2);
        const resource = Math.max(1, Math.round(resourceRaw * costMult));

        return {
            parts: parts,
            complexity: Math.round(cx * 100) / 100,
            price: Math.max(50, Math.round(kp * stacking * (spell ? 1.0 : 0.9))),
            // A spell spends MP and a skill spends AP. AP is the battler's
            // hundred point pool, so a skill can never ask for more than all
            // of it; MP has no such ceiling.
            mpCost: spell ? resource : 0,
            tpCost: spell ? 0 : Math.min(100, resource),
            statKey: spell ? 'INT' : 'WIS',
            paramId: spell ? PARAM_INT : PARAM_WIS,
            statReq: Math.max(3, Math.min(20, Math.round(5 + cx * 1.15)))
        };
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

    function scopeSide(build) {
        const scope = byKey(SCOPES, build.scope);
        return scope ? scope.side : 'enemy';
    }

    // A rider aimed at the line the shape never reaches is not an error, it
    // simply never lands, so the bench refuses to sell it rather than letting
    // it be bought and wasted.
    function riderAllowed(build, rider) {
        const side = scopeSide(build);
        return side === 'both' || rider.side === side;
    }

    // A healing core pointed at the enemy line, or a damaging core pointed at
    // the party, is the other half of the same rule.
    function coreMatchesScope(build) {
        const core = byKey(CORES, build.core);
        if (!core) return false;
        if (core.dmg === 0) return true;
        const side = scopeSide(build);
        if (side === 'both') return true;
        const heals = (core.dmg === 3 || core.dmg === 4);
        return heals ? side === 'ally' : side === 'enemy';
    }

    SkillMaster.craftRiderAllowed = riderAllowed;
    SkillMaster.craftCoreMatchesScope = coreMatchesScope;

    //=========================================================================
    // Writing the entry
    //=========================================================================

    function craftFormula(build, ctx) {
        const core = byKey(CORES, build.core);
        const power = byKey(POWERS, build.power) || POWERS[0];
        if (!core || core.dmg === 0) return '0';
        const spell = build.kind !== 'skill';
        const atkStat = spell ? 'a.mat' : 'a.atk';
        const defStat = spell ? 'b.mdf' : 'b.def';
        const mult = Math.round(core.power * power.mult * 100) / 100;

        if (core.dmg === 3) return `${atkStat} * ${mult} + a.level * 2`;
        if (core.dmg === 4) return `${atkStat} * ${mult} + a.level`;
        const pierce = Math.round(ctx.pierce * 100) / 100;
        if (pierce <= 0) return `${atkStat} * ${mult}`;
        return `${atkStat} * ${mult} - ${defStat} * ${pierce}`;
    }

    // The entry itself, field by field. Everything the bench decides is
    // decided here and nowhere else, so a build reads back the same way
    // whether it is being previewed or written for good.
    function buildCraftedSkill(build, actorId, existing) {
        const core = byKey(CORES, build.core);
        const scope = byKey(SCOPES, build.scope);
        const quote = craftQuote(build);
        const spell = build.kind !== 'skill';
        const ctx = { pierce: core ? core.pierce : 1.0, costMult: 1 };

        const sk = {
            id: existing ? existing.id : $gameSystem.allocCustomSkillId(),
            name: build.name || tr(spell ? 'defaultSpellName' : 'defaultSkillName'),
            iconIndex: build.iconIndex || 0,
            description: build.description || '',
            animationId: build.animationId || 0,
            stypeId: spell ? 1 : 2,
            mpCost: quote.mpCost,
            tpCost: quote.tpCost,
            scope: scope ? scope.scope : 1,
            occasion: 1,
            speed: 0,
            successRate: 95,
            repeats: 1,
            tpGain: spell ? 0 : 5,
            hitType: core ? core.hit : 1,
            requiredWtypeId1: 0,
            requiredWtypeId2: 0,
            message1: '',
            message2: '',
            messageType: 0,
            damage: {
                type: core ? core.dmg : 0,
                elementId: core ? core.element : 0,
                formula: '0',
                variance: 20,
                critical: false
            },
            effects: []
        };

        for (const k of (build.refines || [])) {
            const r = byKey(REFINES, k);
            if (r && r.apply) r.apply(sk, ctx);
        }
        sk.damage.formula = craftFormula(build, ctx);

        for (const k of (build.riders || [])) {
            const r = byKey(RIDERS, k);
            if (!r) continue;
            for (const e of r.effects) sk.effects.push(Object.assign({}, e));
        }

        const category = spell ? CRAFT_SPELL_CATEGORY : CRAFT_SKILL_CATEGORY;
        const lore = String(build.lore || '').replace(/[<>]/g, '').trim();
        let note = '<customSpell>\n<category:' + category + '>\n'
            + '<StatReq: ' + quote.statKey + ' ' + quote.statReq + '>';
        if (lore) note += '\n<Lore: ' + lore + '>';
        sk.note = note;
        sk.meta = { customSpell: true };
        if (lore) sk.meta.Lore = lore;

        sk._customSpell = true;
        sk._crafted = true;
        sk._craftKind = spell ? 'spell' : 'skill';
        sk._customCategory = category;
        sk._ownerActorId = actorId;
        sk._craftBuild = {
            kind: build.kind, core: build.core, power: build.power, scope: build.scope,
            riders: (build.riders || []).slice(), refines: (build.refines || []).slice(),
            name: sk.name, description: sk.description, lore: build.lore || '',
            iconIndex: sk.iconIndex, animationId: sk.animationId
        };
        sk._animationId = sk.animationId;
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

    const _SkillMasterCraft_extract = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function (contents) {
        _SkillMasterCraft_extract.call(this, contents);
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

    // The rows of the bench, in the order they are drawn and walked.
    const CRAFT_ROWS = ['name', 'description', 'lore', 'icon', 'animation',
        'core', 'power', 'scope', 'riders', 'refines', 'create'];
    SkillMaster.CRAFT_ROWS = CRAFT_ROWS;

    Proto.craftDefaultBuild = function (kind) {
        const spell = kind !== 'skill';
        return {
            kind: spell ? 'spell' : 'skill',
            name: '',
            description: '',
            lore: '',
            iconIndex: 0,
            animationId: 0,
            core: spell ? 'fire' : 'strike',
            power: 'plain',
            scope: 'oneEnemy',
            riders: [],
            refines: []
        };
    };

    Proto.openCraftBench = function (kind, editId) {
        this._viewMode = 'craft';
        this._craftEditingId = editId || null;
        this._craftBaseQuote = null;
        const source = editId && $dataSkills[editId] ? $dataSkills[editId]._craftBuild : null;
        if (source) {
            this._craft = {
                kind: source.kind, name: source.name, description: source.description, lore: source.lore,
                iconIndex: source.iconIndex, animationId: source.animationId,
                core: source.core, power: source.power, scope: source.scope,
                riders: (source.riders || []).slice(), refines: (source.refines || []).slice()
            };
            this._craftBaseQuote = craftQuote(this._craft);
        } else {
            this._craftEditingId = null;
            this._craft = this.craftDefaultBuild(kind);
        }
        this._craftFocus = 0;
        this._craftPicker = null;
        this._craftPickIndex = 0;
        this._craftTyping = false;
        SoundManager.playOk();
        this.refreshUISkillDOM();
    };

    Proto.closeCraftBench = function () {
        this.closeCraftTextSheet();
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

    Proto.craftedEntries = function (kind) {
        const actor = this.getTeachActor();
        if (!actor || typeof $gameSystem === 'undefined') return [];
        return $gameSystem.getCustomSpells().filter(s =>
            s && s._crafted && s._ownerActorId === actor.actorId() &&
            (!kind || s._craftKind === kind));
    };

    //--- pickers -------------------------------------------------------------

    Proto.craftPickerRows = function (group) {
        const build = this._craft;
        if (group === 'core') return CORES.filter(c => c.use === build.kind);
        if (group === 'power') return POWERS;
        if (group === 'scope') return SCOPES;
        if (group === 'riders') return RIDERS;
        if (group === 'refines') return REFINES;
        if (group === 'icon') return this.craftIconChoices();
        if (group === 'animation') return this.getAvailableAnimations();
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
        if (group === 'core' || group === 'power' || group === 'scope') {
            idx = rows.findIndex(r => r.key === build[group]);
        } else if (group === 'icon') {
            idx = rows.findIndex(r => r.iconIndex === build.iconIndex);
        } else if (group === 'animation') {
            idx = rows.findIndex(r => r.id === build.animationId);
        }
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

        if (group === 'riders' || group === 'refines') {
            const list = build[group];
            const cap = group === 'riders' ? CRAFT_MAX_RIDERS : CRAFT_MAX_REFINES;
            if (group === 'riders' && !riderAllowed(build, row)) { SoundManager.playBuzzer(); return; }
            const at = list.indexOf(row.key);
            if (at >= 0) list.splice(at, 1);
            else if (list.length >= cap) { SoundManager.playBuzzer(); return; }
            else list.push(row.key);
            SoundManager.playCursor();
            this.refreshUISkillDOM();
            return;
        }

        if (group === 'core') {
            build.core = row.key;
            // A core that heals cannot keep an enemy shape, and the other way
            // about. Rather than refuse the pick, the bench moves the shape to
            // the nearest one that makes sense.
            if (!coreMatchesScope(build)) {
                build.scope = (row.dmg === 3 || row.dmg === 4) ? 'oneAlly' : 'oneEnemy';
            }
            this.craftDropInvalidRiders();
        } else if (group === 'power') {
            build.power = row.key;
        } else if (group === 'scope') {
            const before = build.scope;
            build.scope = row.key;
            if (!coreMatchesScope(build)) {
                const wantsHealing = row.side === 'ally';
                const fallback = CORES.find(c => c.use === build.kind &&
                    (wantsHealing ? (c.dmg === 3 || c.dmg === 0) : (c.dmg === 1)));
                if (fallback) build.core = fallback.key;
                else build.scope = before;
            }
            this.craftDropInvalidRiders();
        } else if (group === 'icon') {
            build.iconIndex = row.iconIndex;
        } else if (group === 'animation') {
            build.animationId = row.id;
        }

        this._craftPicker = null;
        SoundManager.playOk();
        this.refreshUISkillDOM();
    };

    Proto.craftDropInvalidRiders = function () {
        const build = this._craft;
        build.riders = build.riders.filter(k => {
            const r = byKey(RIDERS, k);
            return r && riderAllowed(build, r);
        });
    };

    Proto.closeCraftPicker = function () {
        this._craftPicker = null;
        SoundManager.playCancel();
        this.refreshUISkillDOM();
    };

    //--- writing the text ----------------------------------------------------

    // Name, description and lore are typed into a real field. The sheet is
    // opened over the book rather than inside a page the bench re-renders, and
    // a capture phase guard runs ahead of every always-on plugin so nothing
    // else can swallow a letter.
    Proto.openCraftTextSheet = function (field, targetSkillId) {
        if (!this._dndContainer || this._craftTyping) return;
        const single = (field === 'name');
        const current = targetSkillId
            ? this.craftOverrideText(targetSkillId, field)
            : String((this._craft && this._craft[field]) || '');
        const sheet = document.createElement('div');
        sheet.className = 'sm-craft-write-backdrop';
        sheet.innerHTML = `
            <div class="sm-craft-write">
                <div class="sm-craft-write-title">${tr('write.' + field)}</div>
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
        if (!this._craftTyping) return;
        this._craftTyping = false;
        Input.clear();
        TouchInput.clear();
        this.refreshUISkillDOM();
    };

    Proto.submitCraftText = function () {
        const el = this._craftWriteEl && this._craftWriteEl.querySelector('#sm-craft-write-input');
        const value = el ? String(el.value) : '';
        const field = this._craftWriteField;
        const target = this._craftWriteTarget;
        if (target) {
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
        SoundManager.playSave();
        this.closeCraftTextSheet();
    };

    //--- writing the entry ---------------------------------------------------

    Proto.craftCanWrite = function () {
        const actor = this.getTeachActor();
        const build = this._craft;
        if (!actor || !build) return { ok: false, reason: 'incomplete' };
        if (!byKey(CORES, build.core) || !byKey(SCOPES, build.scope)) return { ok: false, reason: 'incomplete' };
        const quote = craftQuote(build);
        const owed = (this._craftEditingId && this._craftBaseQuote)
            ? Math.max(0, quote.price - this._craftBaseQuote.price)
            : quote.price;
        const have = craftBaseStat(actor, quote.paramId);
        if (!coreMatchesScope(build)) return { ok: false, reason: 'mismatch', quote, owed, have };
        if ($gameSystem.getKnowledge() < owed) return { ok: false, reason: 'knowledge', quote, owed, have };
        if (have < quote.statReq) return { ok: false, reason: 'stat', quote, owed, have };
        if (!this._craftEditingId && this.craftedEntries(build.kind).length >= CRAFT_MAX_PER_ACTOR) {
            return { ok: false, reason: 'full', quote, owed, have };
        }
        return { ok: true, quote, owed, have };
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

        window.skipLocalization = true;
        if (typeof T === 'function') {
            $gameMessage.add(tr(existing ? 'rewrittenResult' : 'writtenResult', {
                name: entry.name, cost: verdict.owed, left: $gameSystem.getKnowledge()
            }));
        }
        window.skipLocalization = false;
        this.refreshUISkillDOM();
    };

    // Unmaking a crafted entry hands back nothing: the components were spent
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

    const componentName = (group, key) => tr('comp.' + group + '.' + key + '.name');
    const componentDesc = (group, key) => tr('comp.' + group + '.' + key + '.desc');

    Proto.renderCraftBench = function (knowledge) {
        const leftBox = document.getElementById('left-page-content');
        const rightBox = document.getElementById('right-page-content');
        if (!leftBox || !rightBox) return;
        const actor = this.getTeachActor();
        const build = this._craft;
        if (!actor || !build) return;

        const spell = build.kind !== 'skill';
        const quote = craftQuote(build);
        const verdict = this.craftCanWrite();
        const picking = this._craftPicker;

        const plain = (text, muted) =>
            `<span class="inspect-spec-value ${muted ? 'inspect-spec-value--muted' : ''}">${esc(text)}</span>`;
        const rowHTML = (idx, label, value, hint) => {
            const focused = !picking && this._craftFocus === idx;
            return `
                <div class="sm-forge-row focusable ${focused ? 'focused' : ''}" onclick="SceneManager._scene.craftActivateRow(${idx})">
                    <span class="inspect-spec-label">${esc(label)}</span>
                    <span class="sm-forge-answer">${value}</span>
                    ${hint ? `<span class="sm-forge-hint">${esc(hint)}</span>` : ''}
                </div>`;
        };

        let rowsHTML = '';
        CRAFT_ROWS.forEach((row, idx) => {
            if (row === 'create') return;
            let value = '', hint = '';
            if (row === 'name') {
                value = plain(build.name || tr(spell ? 'defaultSpellName' : 'defaultSkillName'), !build.name);
            } else if (row === 'description' || row === 'lore') {
                value = plain(build[row] || tr('unwritten'), !build[row]);
            } else if (row === 'icon') {
                value = build.iconIndex
                    ? `<span class="sm-forge-icon" style="${SkillMaster.getSkillIconStyle(build.iconIndex)}"></span>${plain('#' + build.iconIndex)}`
                    : plain(tr('none'), true);
            } else if (row === 'animation') {
                const a = (build.animationId && typeof $dataAnimations !== 'undefined' && $dataAnimations)
                    ? $dataAnimations[build.animationId] : null;
                value = plain(a ? `#${a.id} · ${a.name}` : tr('none'), !a);
            } else if (row === 'core') {
                value = plain(componentName('core', build.core));
                hint = componentDesc('core', build.core);
            } else if (row === 'power' || row === 'scope') {
                value = plain(componentName(row, build[row] || 'plain'));
            } else if (row === 'riders' || row === 'refines') {
                value = build[row].length
                    ? plain(build[row].map(k => componentName(row, k)).join(', '))
                    : plain(tr('none'), true);
                hint = `${build[row].length}/${row === 'riders' ? CRAFT_MAX_RIDERS : CRAFT_MAX_REFINES}`;
            }
            rowsHTML += rowHTML(idx, tr('row.' + row), value, hint);
        });

        const createIdx = CRAFT_ROWS.indexOf('create');
        const createFocused = !picking && this._craftFocus === createIdx;
        const owed = verdict.owed !== undefined ? verdict.owed : quote.price;
        const statName = window.SkillStatReq ? window.SkillStatReq.statName(quote.statKey) : quote.statKey;
        const blockText = verdict.ok ? '' : tr('blocked.' + verdict.reason, {
            stat: statName, need: quote.statReq,
            have: verdict.have !== undefined ? verdict.have : 0, max: CRAFT_MAX_PER_ACTOR
        });
        const createHTML = `
            <div class="inspect-actions sm-forge-actions">
                <div class="inspect-btn focusable ${createFocused ? 'selected' : ''} ${verdict.ok ? '' : 'unusable'}" onclick="SceneManager._scene.craftWrite()">
                    ${esc(this._craftEditingId ? tr('rewrite') : tr('writeIt'))} <span class="sm-forge-cost">· ${owed} KP</span>
                </div>
            </div>
            <div class="sm-forge-knowledge ${verdict.reason === 'knowledge' ? 'sm-forge-knowledge--short' : ''}">
                ${esc(tr('knowledge'))}: <strong>${knowledge} KP</strong>
                ${blockText ? `<span class="sm-craft-block">${esc(blockText)}</span>` : ''}
            </div>`;

        let listHTML = '';
        for (const s of this.craftedEntries(build.kind)) {
            const on = this._craftEditingId === s.id;
            listHTML += `
                <div class="sm-skill-row sm-craft-entry focusable ${on ? 'focused' : ''}">
                    <span class="sm-skill-ident" onclick="SceneManager._scene.openCraftBench('${build.kind}', ${s.id})"><span class="sm-skill-icon" style="${SkillMaster.getSkillIconStyle(s.iconIndex)}"></span><span class="sm-skill-name">${esc(s.name)}</span></span>
                    <span class="ui-chip sm-skill-badge" onclick="SceneManager._scene.openCraftBench('${build.kind}', ${s.id})">${esc(tr('edit'))}</span>
                    <span class="ui-chip sm-skill-badge sm-craft-discard" onclick="SceneManager._scene.craftDiscard(${s.id})">${esc(tr('discard'))}</span>
                </div>`;
        }
        if (!listHTML) listHTML = `<div class="ui-empty"><div class="ui-empty-text">${esc(tr('noneYet'))}</div></div>`;

        leftBox.innerHTML = `
            <div class="page-header-bar">
              <div class="back-button focusable" onclick="SceneManager._scene.closeCraftBench()">${esc(tr('back'))}</div>
              <h2 class="title">${esc(spell ? tr('titleSpell') : tr('titleSkill'))}</h2>
            </div>
            <div class="sm-forge-rows sm-craft-rows">
                ${rowsHTML}
                ${createHTML}
            </div>
            <div class="ui-section sm-forged-section">
                <h4 class="inspect-section-title">${esc(spell ? tr('yourSpells') : tr('yourSkills'))}</h4>
            </div>
            <div id="craft-scroll-box" class="ui-list ui-scroll sm-forged-list">
                ${listHTML}
            </div>`;

        rightBox.innerHTML = picking
            ? this.renderCraftPickerHTML(picking)
            : this.renderCraftPreviewHTML(quote, verdict);
    };

    Proto.renderCraftPickerHTML = function (group) {
        const build = this._craft;
        const rows = this.craftPickerRows(group);
        let html = '';
        rows.forEach((row, k) => {
            const focused = this._craftPickIndex === k;
            if (group === 'icon') {
                html += `
                    <div class="sm-skill-row focusable ${focused ? 'focused' : ''}" onclick="SceneManager._scene.craftChoose('icon', ${k})">
                        <span class="sm-skill-ident"><span class="sm-skill-icon" style="${SkillMaster.getSkillIconStyle(row.iconIndex)}"></span><span class="sm-skill-name">#${row.iconIndex}</span></span>
                    </div>`;
                return;
            }
            if (group === 'animation') {
                html += `
                    <div class="sm-skill-row focusable ${focused ? 'focused' : ''}" onclick="SceneManager._scene.craftChoose('animation', ${k})">
                        <span class="sm-skill-name">${esc(row.name)}</span>
                        <span class="sm-skill-cost">#${row.id}</span>
                    </div>`;
                return;
            }
            const chosen = (group === 'riders' || group === 'refines')
                ? build[group].includes(row.key)
                : build[group] === row.key;
            const barred = group === 'riders' && !riderAllowed(build, row);
            html += `
                <div class="sm-skill-row focusable ${focused ? 'focused' : ''} ${chosen ? 'selected' : ''} ${barred ? 'is-shut' : ''}" onclick="SceneManager._scene.craftChoose('${group}', ${k})">
                    <span class="sm-skill-ident"><span class="sm-skill-name">${chosen ? '✓ ' : ''}${esc(componentName(group, row.key))}</span></span>
                    <span class="sm-skill-cost">${row.kp || 0} KP · ${esc(tr('cxShort'))} ${(row.cx || 0).toFixed(1)}</span>
                </div>`;
        });
        if (!html) html = `<div class="ui-empty"><div class="ui-empty-text">${esc(tr('nothingToBuy'))}</div></div>`;

        const focusedRow = rows[this._craftPickIndex];
        const blurb = (focusedRow && focusedRow.key && group !== 'icon' && group !== 'animation')
            ? `<div class="ui-prose">${esc(componentDesc(group, focusedRow.key))}</div>` : '';
        return `
            <div class="ui-detail">
                <div class="ui-detail-head">
                    <div class="ui-detail-titles"><h3 class="sm-detail-name">${esc(tr('pick.' + group))}</h3></div>
                </div>
                ${blurb}
                <div id="craft-pick-box" class="ui-detail-scroll ui-scroll sm-candidate-list">${html}</div>
            </div>`;
    };

    Proto.renderCraftPreviewHTML = function (quote, verdict) {
        const build = this._craft;
        const actor = this.getTeachActor();
        const spell = build.kind !== 'skill';
        const preview = buildCraftedSkill(build, actor.actorId(), { id: 0 });
        const statName = window.SkillStatReq ? window.SkillStatReq.statName(quote.statKey) : quote.statKey;
        const have = verdict.have !== undefined ? verdict.have : craftBaseStat(actor, quote.paramId);
        const short = have < quote.statReq;
        const elName = (preview.damage.elementId && typeof $dataSystem !== 'undefined' && $dataSystem && $dataSystem.elements)
            ? $dataSystem.elements[preview.damage.elementId] : '';

        const spec = (label, value, bad) =>
            `<div class="inspect-spec-row"><span class="inspect-spec-label">${esc(label)}</span><span class="inspect-spec-value ${bad ? 'sm-value--short' : ''}">${esc(value)}</span></div>`;

        return `
            <div class="ui-detail sm-fuse-preview">
                <div class="ui-detail-head">
                    <div class="ui-detail-titles">
                        <h3 class="sm-detail-name">${esc(preview.name)}</h3>
                        <div class="sm-detail-meta">${esc(tr('preview'))}</div>
                    </div>
                    <span class="ui-chip sm-result-chip">${esc(spell ? tr('spendsMP') : tr('spendsAP'))}</span>
                </div>
                <div class="ui-detail-scroll ui-scroll">
                    <div class="inspect-spec-grid">
                        ${spec(spell ? tr('mpLabel') : tr('apLabel'), spell ? preview.mpCost : preview.tpCost)}
                        ${spec(tr('complexity'), quote.complexity.toFixed(1))}
                        ${spec(tr('statFloor'), `${statName} ${quote.statReq}`, short)}
                        ${spec(tr('yourStat'), `${statName} ${have}`, short)}
                        ${spec(tr('price'), `${verdict.owed !== undefined ? verdict.owed : quote.price} KP`, verdict.reason === 'knowledge')}
                        ${spec(tr('effectLabel'), tr('dmgType.' + preview.damage.type))}
                        ${spec(tr('element'), elName || tr('none'))}
                        ${spec(tr('formula'), preview.damage.formula)}
                        ${spec(tr('repeats'), preview.repeats)}
                        ${spec(tr('variance'), preview.damage.variance + '%')}
                        ${spec(tr('critical'), preview.damage.critical ? tr('yes') : tr('no'))}
                        ${spec(tr('occasionLabel'), preview.occasion === 0 ? tr('anywhere') : tr('battleOnly'))}
                        ${spec(tr('riderCount'), preview.effects.length)}
                    </div>
                    ${preview.description ? `<div class="ui-prose">${esc(preview.description)}</div>` : ''}
                    ${build.lore ? `<div class="inspect-flavour">${esc(build.lore)}</div>` : ''}
                    <div class="ui-prose">${esc(tr('benchBlurb', { stat: statName }))}</div>
                </div>
            </div>`;
    };

    //=========================================================================
    // Input
    //=========================================================================

    Proto.craftActivateRow = function (idx) {
        this._craftFocus = idx;
        const row = CRAFT_ROWS[idx];
        if (row === 'name' || row === 'description' || row === 'lore') this.openCraftTextSheet(row);
        else if (row === 'create') this.craftWrite();
        else this.openCraftPicker(row);
    };

    Proto.updateCraftBenchInput = function () {
        if (this._craftTyping) return;

        if (this._craftPicker) {
            const rows = this.craftPickerRows(this._craftPicker);
            const max = rows.length;
            if (Input.isTriggered('cancel') || Input.isTriggered('escape') || TouchInput.isCancelled()) {
                this.closeCraftPicker();
                return;
            }
            if (!max) return;
            if (Input.isTriggered('ok')) { this.craftChoose(this._craftPicker, this._craftPickIndex); return; }
            const prev = this._craftPickIndex;
            if (Input.isTriggered('down') || Input.isRepeated('down')) this._craftPickIndex = (this._craftPickIndex + 1) % max;
            else if (Input.isTriggered('up') || Input.isRepeated('up')) this._craftPickIndex = (this._craftPickIndex - 1 + max) % max;
            if (this._craftPickIndex !== prev) {
                SoundManager.playCursor();
                this.refreshUISkillDOM();
                this.scrollToActiveItem('craft-pick-box', '#craft-pick-box .focused');
            }
            return;
        }

        const max = CRAFT_ROWS.length;
        const prev = this._craftFocus;
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
        }
        if (this._craftFocus !== prev) {
            SoundManager.playCursor();
            this.refreshUISkillDOM();
            this.scrollToActiveItem('craft-scroll-box', '.sm-craft-rows .focused');
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
