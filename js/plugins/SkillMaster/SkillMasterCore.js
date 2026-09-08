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

    function getCategoryDisplayName(categoryName) {
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
        const data = CATEGORY_DATA[categoryName] || SkillMaster.CATEGORY_DATA[categoryName];
        return data ? data.icon : 245;
    }

    function getCategoryIconStyle(categoryName) {
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
        if (getSkillsByCategory(FUSION_CATEGORY).length) categories.add(FUSION_CATEGORY);
        return Array.from(categories);
    }

    function getCategoryType(category) {
        if (category === 'All') return 'Skill';
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
        if (category === FUSION_CATEGORY) {
            const actorId = (SceneManager._scene && SceneManager._scene._teachActorId) || 0;
            if (typeof $gameSystem === 'undefined' || !$gameSystem) return [];
            return $gameSystem.getCustomSpells()
                .filter(s => s && s.name && s._ownerActorId === actorId)
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
    SkillMaster.getClassesForMagicSystem = getClassesForMagicSystem;
    SkillMaster.getSkillsForMagicSystem = getSkillsForMagicSystem;
    SkillMaster.actorCategoryManager = actorCategoryManager;
    SkillMaster.getAllSkillCategories = getAllSkillCategories;
    SkillMaster.getCategoryType = getCategoryType;
    SkillMaster.getSplitSkillCategories = getSplitSkillCategories;
    SkillMaster.getSkillsByCategory = getSkillsByCategory;
    SkillMaster.FUSION_CATEGORY = FUSION_CATEGORY;

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
