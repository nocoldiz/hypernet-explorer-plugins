/*:
 * @target MZ
 * @plugindesc Blade Seed System v1.3.0
 * @author Omni-Lex
 * @help
 * ============================================================================
 * Blade Seed System Plugin
 * ============================================================================
 * 
 * This plugin implements a spirit weapon binding system where players can
 * create and bind a spirit weapon that levels up with the party.
 * 
 * Features:
 * - Bind a spirit weapon with procedural name generation
 * - Spirit companion with random stats that level up
 * - Spirit evolution at levels 10 and 30 with new images
 * - Elemental spirits with visual indicators
 * - Spirit skill learning system with learning points
 * - The weapon is chosen, named and shaped at binding: the player picks its
 *   look from the procedural variants before committing to it
 * - Custom menu command for spirit management
 * - Class-based weapon compatibility filtering
 * - Reshuffle name and spirit before binding
 * 
 * Plugin Commands:
 * - Bind Blade Seed: Opens the binding menu
 * - Unbind Blade Seed: Removes the spirit and unseals equipment
 * 
 * @command bindBladeSeed
 * @text Bind Blade Seed
 * @desc Opens the blade seed binding menu
 * 
 * @command unbindBladeSeed
 * @text Unbind Blade Seed
 * @desc Removes the blade seed and unseals weapon slot
 * 

 * 

 */

(() => {
    'use strict';
    
    const pluginName = 'BladeSeedSystem';
    const parameters = PluginManager.parameters(pluginName);
    
    // The twelve seed weapons, one per weapon type. These are the only way
    // into the database rows: a seed weapon carries <Restricted>, so no loot
    // roll, shop shelf or forge recipe can produce one, and the blade seed is
    // the single thing that grows it.
    // The panel labels each row with the weapon's own localised name and type,
    // so nothing here is displayed as written.
    // i18n-ignore-start  database ids and the $dataSystem.weaponTypes vocabulary
    const weaponTypes = [
        {"id": 1,  "name": "Light",      "weaponId": "12"}, // Seed Dagger
        {"id": 2,  "name": "Sword",      "weaponId": "54"}, // Seed Sword
        {"id": 3,  "name": "Heavy",      "weaponId": "55"}, // Seed Mace
        {"id": 4,  "name": "Axe",        "weaponId": "206"}, // Seed Axe
        {"id": 5,  "name": "Whip",       "weaponId": "243"}, // Seed Whip
        {"id": 6,  "name": "Staff",      "weaponId": "284"},  // Seed Staff
        {"id": 7,  "name": "Bow",        "weaponId": "344"}, // Seed Bow
        {"id": 8,  "name": "Projectile", "weaponId": "392"},  // Seed Grimoire
        {"id": 9,  "name": "Gun",        "weaponId": "438"}, // Seed Gun
        {"id": 10, "name": "Claw",       "weaponId": "545"}, // Seed Claw
        {"id": 11, "name": "Glove",      "weaponId": "580"}, // Seed Glove
        {"id": 12, "name": "Spear",      "weaponId": "628"}  // Seed Spear
    ];
    // i18n-ignore-end

    // The skill a seed weapon is grown holding is resolved out of the database
    // on read rather than written down, for the reason given at isRealSkill:
    // a fixed id drifts onto another row every time the balance generators
    // run. The weapon row itself says which type it is, so the number is never
    // taken from the entry's own position in this list.
    weaponTypes.forEach(wt => Object.defineProperty(wt, 'startingSkill', {
        get: () => {
            const weapon = $dataWeapons[parseInt(wt.weaponId)];
            return seedStartingSkill(weapon ? weapon.wtypeId : wt.id);
        },
        enumerable: true
    }));
    
    // Hardcoded spirit evolution sets
    // i18n-ignore-start  image1..3 are img/enemies/BladeSeeds filenames
    const spiritSets = [
        {"element": 1, "name": "Warrior Spirit", "image1": "Ifrit 4 4X", "image2": "Jelly A 4 4X", "image3": "The Slime 9 4X"},
        {"element": 2, "name": "Fire Spirit","image1": "Ifrit 4 4X", "image2": "Jelly A 4 4X", "image3": "The Slime 9 4X"},
        {"element": 3, "name": "Ice Spirit", "image1": "Ifrit 4 4X", "image2": "Jelly A 4 4X", "image3": "The Slime 9 4X"},
        {"element": 4, "name": "Thunder Spirit","image1": "Ifrit 4 4X", "image2": "Jelly A 4 4X", "image3": "The Slime 9 4X"},
        {"element": 5, "name": "Water Spirit", "image1": "Ifrit 4 4X", "image2": "Jelly A 4 4X", "image3": "The Slime 9 4X"},
        {"element": 6, "name": "Metal Spirit","image1": "Ifrit 4 4X", "image2": "Jelly A 4 4X", "image3": "The Slime 9 4X"},
        {"element": 7, "name": "Wind Spirit", "image1": "Ifrit 4 4X", "image2": "Jelly A 4 4X", "image3": "The Slime 9 4X"},
        {"element": 8, "name": "Sacred Spirit", "image1": "Ifrit 4 4X", "image2": "Jelly A 4 4X", "image3": "The Slime 9 4X"},
        {"element": 9, "name": "Cursed Spirit", "image1": "Ifrit 4 4X", "image2": "Jelly A 4 4X", "image3": "The Slime 9 4X"}
    ];
    // i18n-ignore-end
    // The display name resolves on read, keyed by element.
    spiritSets.forEach(set => Object.defineProperty(set, 'name', {
        get: () => T('BladeSeed.spiritSet.' + set.element)
    }));
    
    // Element names mapping
    // Resolved on read so a language switch is honoured.
    const elementNames = {};
    for (let _e = 1; _e <= 9; _e++) {
        Object.defineProperty(elementNames, _e, {
            get: ((id) => () => T('BladeSeed.element.' + id))(_e),
            enumerable: true
        });
    }
    
    // ── Skill resolution ─────────────────────────────────────────────────
    // Skill ids are not stable: data/Skills.json is regenerated by the balance
    // generators under tools/, so a number written down here drifts onto some
    // other row (or onto a blank one) the next time they run. Nothing below
    // names a skill by id; every list is read out of the database the spirit
    // is actually living in.
    const isRealSkill = (s) =>
        !!s && !!s.name && !s.name.startsWith('<') && !s.name.startsWith('ESK');

    // The <category:> tag every skill carries, lowercased. Same reader the
    // battle system's school gate uses.
    const skillSchoolOf = (s) =>
        (/<category:\s*([A-Za-z]+)\s*>/i.exec((s && s.note) || '') || [])[1] || '';

    // Cheapest first, by the same price the player is actually quoted
    // (calculateSkillLearningCost below), so a ladder reads as one.
    const bySkillCost = (a, b) =>
        calculateSkillLearningCost(a.id) - calculateSkillLearningCost(b.id) || a.id - b.id;

    // The two the engine itself leans on, known from the moment of binding.
    const BASE_SPIRIT_SKILL_IDS = [1, 2];
    // How many skills a spirit offers in all, the two base ones included.
    const SPIRIT_SKILL_COUNT = 6;

    // A spirit of an element teaches that element, and the database is the
    // only list of what that means: $dataSkills carries the element on the
    // skill's own damage row, so the pool follows the data wherever it moves.
    const buildSpiritSkills = (elementId) => {
        const base = BASE_SPIRIT_SKILL_IDS
            .filter(id => isRealSkill($dataSkills[id]))
            .map(id => ({ skillId: id, cost: 0, learned: true }));
        const taken = new Set(base.map(s => s.skillId));
        const pool = $dataSkills
            .filter(s => isRealSkill(s) && s.damage &&
                         s.damage.elementId === elementId && !taken.has(s.id))
            .sort(bySkillCost)
            .slice(0, Math.max(0, SPIRIT_SKILL_COUNT - base.length))
            .map(s => ({ skillId: s.id, cost: calculateSkillLearningCost(s.id) }));
        return base.concat(pool);
    };

    // Resolved on read and once only: $dataSkills is in place long before a
    // seed is ever bound, and it is rebuilt from file on every boot.
    const spiritSkillCache = new Map();
    const spiritSkills = {};
    for (let _s = 1; _s <= 9; _s++) {
        Object.defineProperty(spiritSkills, _s, {
            get: ((id) => () => {
                if (!spiritSkillCache.has(id)) spiritSkillCache.set(id, buildSpiritSkills(id));
                return spiritSkillCache.get(id);
            })(_s),
            enumerable: true
        });
    }

    // The school a seed weapon opens with. Which weapon types are ranged is
    // BattleSystemEnhanced's answer (window.SkillWeaponReq) and never a literal
    // repeated here, and the two schools that ARE a weapon rather than a
    // technique are exactly the two that gate on it.
    const seedSchoolFor = (wtypeId) => {
        const req = window.SkillWeaponReq;
        if (!req || !req.RANGED_WTYPES) return null;  // the authority is not up yet
        // i18n-ignore  <category:> tag values, not display strings
        return req.RANGED_WTYPES.includes(wtypeId) ? 'Firearms' : 'Swordsmanship';
    };

    // The weapon types that open with the same school, in database order.
    // A school is dealt out across them rather than handed whole to each, so
    // a Seed Sword and a Seed Spear do not grow the same opening skill.
    const schoolPeers = (school) => {
        const ids = [];
        const types = ($dataSystem && $dataSystem.weaponTypes) || [];
        for (let w = 1; w < types.length; w++) {
            if (seedSchoolFor(w) === school) ids.push(w);
        }
        return ids;
    };

    // The one skill a seed weapon is grown holding: its seat in its school's
    // ladder. 0 when the database carries no skill of that school, and the
    // weapon then starts bare rather than teaching a blank row.
    const seedStartingSkillCache = new Map();
    const seedStartingSkill = (wtypeId) => {
        if (seedStartingSkillCache.has(wtypeId)) return seedStartingSkillCache.get(wtypeId);
        const named = seedSchoolFor(wtypeId);
        // Asked before the battle system is up, melee is the answer for nine
        // of the twelve types, but it is a guess and is never remembered: the
        // next call, once the authority is there, settles it for good.
        const school = (named || 'Swordsmanship').toLowerCase();
        const pool = $dataSkills
            .filter(s => isRealSkill(s) && skillSchoolOf(s).toLowerCase() === school)
            .sort(bySkillCost);
        if (!pool.length) return 0;
        const peers = named ? schoolPeers(named) : [];
        const seat = Math.max(0, peers.indexOf(wtypeId));
        const id = pool[seat % pool.length].id;
        if (named) seedStartingSkillCache.set(wtypeId, id);
        return id;
    };
    
    // Name generation components
    // i18n-ignore-start  invented proper-name syllables, concatenated into a
    // weapon's name; a proper noun is never translated
    const nameComponents = {
        prefixes: ['Shard', 'Edge', 'Soul', 'Dark', 'Light', 'Storm', 'Flame', 'Frost', 
                  'Steel', 'Void', 'Dawn', 'Dusk', 'Shadow', 'Star', 'Moon', 'Sun'],
        suffixes: ['bane', 'fang', 'claw', 'blade', 'edge', 'heart', 'soul', 'wing', 
                  'strike', 'pierce', 'cut', 'rend', 'tear', 'break', 'sever', 'cleave'],
        elementPrefixes: {
            1: ['Iron', 'Steel', 'War'],
            2: ['Flame', 'Ember', 'Blaze'],
            3: ['Frost', 'Ice', 'Chill'],
            4: ['Storm', 'Spark', 'Bolt'],
            5: ['Flow', 'Wave', 'Tide'],
            6: ['Metal', 'Forge', 'Alloy'],
            7: ['Wind', 'Gale', 'Zephyr'],
            8: ['Holy', 'Divine', 'Sacred'],
            9: ['Curse', 'Hex', 'Blight']
        }
    };
    // i18n-ignore-end
    const loadBladeSeedImage = (filename) => {
        return ImageManager.loadBitmap('img/enemies/BladeSeeds/', filename);
    };
    // Generate procedural weapon name
    const generateWeaponName = (element, weaponType) => {
        const elementPrefixes = nameComponents.elementPrefixes[element] || nameComponents.prefixes;
        const allPrefixes = [...elementPrefixes, ...nameComponents.prefixes];
        const prefix = allPrefixes[Math.floor(Math.random() * allPrefixes.length)];
        const suffix = nameComponents.suffixes[Math.floor(Math.random() * nameComponents.suffixes.length)];
        
        let name = prefix + suffix;
        
        // Ensure max 10 characters
        if (name.length > 10) {
            // Try shorter combinations
            const shortPrefixes = allPrefixes.filter(p => p.length <= 5);
            const shortSuffixes = nameComponents.suffixes.filter(s => s.length <= 5);
            
            if (shortPrefixes.length > 0 && shortSuffixes.length > 0) {
                const shortPrefix = shortPrefixes[Math.floor(Math.random() * shortPrefixes.length)];
                const shortSuffix = shortSuffixes[Math.floor(Math.random() * shortSuffixes.length)];
                name = shortPrefix + shortSuffix;
                
                if (name.length > 10) {
                    name = name.substring(0, 10);
                }
            } else {
                name = name.substring(0, 10);
            }
        }
        
        return name;
    };
    
    // Initialize blade seed data
    const initializeBladeSeedData = () => {
        if (!$gameSystem._bladeSeed) {
            $gameSystem._bladeSeed = {
                bound: false,
                weaponName: '',
                weaponId: 0,
                weaponTypeId: 0,
                appearanceSeed: 0,
                spirit: null,
                level: 1,
                experience: 0,
                learningPoints: 0
            };
        }
        // Ensure learningPoints exists for older saves
        if ($gameSystem._bladeSeed && typeof $gameSystem._bladeSeed.learningPoints === 'undefined') {
            $gameSystem._bladeSeed.learningPoints = 0;
        }
    };
    
    // Override weapon name display for Blade Seed weapons
    const getBladeSeedWeaponName = (weaponId) => {
        if ($gameSystem._bladeSeed && $gameSystem._bladeSeed.bound && 
            $gameSystem._bladeSeed.weaponId === weaponId) {
            return $gameSystem._bladeSeed.weaponName;
        }
        return null;
    };
    
    // Get compatible weapon types for actor
    const getCompatibleWeaponTypes = (actor) => {
        const compatibleTypes = [];
        
        for (const weaponType of weaponTypes) {
            const weaponData = $dataWeapons[parseInt(weaponType.weaponId)];
            if (weaponData) {
                // Every class can equip every weapon now, so compatibility means
                // the actor is proficient with the type (see WeaponProficiency).
                const prof = window.WeaponProficiency;
                const ok = prof ? !prof.isUntrained(actor, weaponData) : actor.canEquip(weaponData);
                if (ok) {
                    compatibleTypes.push(weaponType);
                }
            }
        }
        
        // If no compatible weapons, default to gloves
        if (compatibleTypes.length === 0) {
            const gloveType = weaponTypes.find(wt => wt.name === "Glove");
            if (gloveType) {
                const gloveData = $dataWeapons[parseInt(gloveType.weaponId)];
                // Even if gloves aren't normally equippable, add them as fallback
                compatibleTypes.push(gloveType);
            }
        }
        
        return compatibleTypes;
    };
    
    // Calculate skill learning cost based on MP + TP cost
    const calculateSkillLearningCost = (skillId) => {
        const skill = $dataSkills[skillId];
        if (!skill) return 0;
        
        let cost = skill.mpCost || 0;
        cost += skill.tpCost || 0;
        
        // If both costs are 0, use a base cost of 10
        if (cost === 0) cost = 10;
        
        return cost;
    };
    
    // Spirit class
    class SpiritCompanion {
        constructor() {
            this.name = this.generateName();
            this.spiritSet = this.selectSpiritSet();
            this.element = this.spiritSet.element;
            this.level = 1;
            this.experience = 0;
            this.baseStats = this.generateRandomStats();
            this.currentStats = {...this.baseStats};
            this.skills = this.initializeSkills();
        }
        
        generateName() {
            // i18n-ignore-start  invented spirit-name syllables
            const prefixes = ['Ancient', 'Mystic', 'Shadow', 'Light', 'Storm', 'Fire', 'Ice', 'Earth'];
            const suffixes = ['Spirit', 'Guardian', 'Essence', 'Soul', 'Wisp', 'Phantom'];
            // i18n-ignore-end
            return prefixes[Math.floor(Math.random() * prefixes.length)] + ' ' + 
                   suffixes[Math.floor(Math.random() * suffixes.length)];
        }
        
        selectSpiritSet() {
            if (spiritSets.length === 0) {
                return {
                    element: 1,
                    name: T('BladeSeed.defaultSpirit'),
                    image1: "Actor1_1",
                    image2: "Actor1_2",
                    image3: "Actor1_3"
                };
            }
            return spiritSets[Math.floor(Math.random() * spiritSets.length)];
        }
        
        initializeSkills() {
            const elementSkills = spiritSkills[this.element] || spiritSkills[1];
            // Only skills the database really carries: an id whose row is
            // missing or blank would sit in the learn list as an empty line and
            // cost the player points for nothing.
            return elementSkills
                .filter(skill => isRealSkill($dataSkills[skill.skillId]))
                .map(skill => ({
                    skillId: skill.skillId,
                    name: $dataSkills[skill.skillId].name,
                    // A skill the spirit already knows is not on sale, so it
                    // carries no price into the learned list.
                    cost: skill.learned ? 0
                        : (skill.cost > 0 ? skill.cost : calculateSkillLearningCost(skill.skillId)),
                    learned: skill.learned || false,
                    source: skill.learned ? 'spirit' : 'unlearned' // Track source
                }));
        }
        
        addWeaponSkill(weaponType) {
            const startingSkill = weaponType.startingSkill;
            // No school skill in the database means the weapon starts bare.
            // An empty row would sit in the list as a nameless line the player
            // is asked to pay for.
            if (!startingSkill || !isRealSkill($dataSkills[startingSkill])) return;

            // Check if skill already exists in spirit skills
            const existingSkillIndex = this.skills.findIndex(skill => skill.skillId === startingSkill);

            if (existingSkillIndex >= 0) {
                // If skill exists, mark it as learned and update source
                this.skills[existingSkillIndex].learned = true;
                this.skills[existingSkillIndex].source = 'weapon';
            } else {
                // Add new weapon skill
                this.skills.push({
                    skillId: startingSkill,
                    name: $dataSkills[startingSkill].name,
                    cost: 0,
                    learned: true,
                    source: 'weapon'
                });
            }
        }
        
        getCurrentImage() {
            if (this.level >= 30) {
                return this.spiritSet.image3;
            } else if (this.level >= 10) {
                return this.spiritSet.image2;
            } else {
                return this.spiritSet.image1;
            }
        }
        
        getEvolutionStage() {
            if (this.level >= 30) return 3;
            if (this.level >= 10) return 2;
            return 1;
        }
        
        generateRandomStats() {
            return {
                atk: Math.floor(Math.random() * 5) + 1,
                def: Math.floor(Math.random() * 5) + 1,
                mat: Math.floor(Math.random() * 5) + 1,
                mdf: Math.floor(Math.random() * 5) + 1,
                agi: Math.floor(Math.random() * 5) + 1,
                luk: Math.floor(Math.random() * 5) + 1,
                mhp: Math.floor(Math.random() * 20) + 10,
                mmp: Math.floor(Math.random() * 10) + 5
            };
        }
        
        levelUp() {
            const oldStage = this.getEvolutionStage();
            this.level++;
            const newStage = this.getEvolutionStage();
            
            // Increase stats randomly on level up
            Object.keys(this.currentStats).forEach(stat => {
                const growth = Math.floor(Math.random() * 3) + 1;
                this.currentStats[stat] += growth;
            });
            
            // Return true if evolved
            return newStage > oldStage;
        }
        
        getExpForNextLevel() {
            return this.level * 100;
        }
        
        gainExperience(amount) {
            this.experience += amount;
            const needed = this.getExpForNextLevel();
            if (this.experience >= needed) {
                this.experience -= needed;
                const evolved = this.levelUp();
                return { levelUp: true, evolved: evolved };
            }
            return { levelUp: false, evolved: false };
        }
        
        canLearnSkill(skillIndex) {
            const skill = this.skills[skillIndex];
            if (!skill || skill.learned) return false;
            
            const learningPoints = $gameSystem._bladeSeed.learningPoints || 0;
            return learningPoints >= skill.cost;
        }
        
        learnSkill(skillIndex) {
            const skill = this.skills[skillIndex];
            if (!skill || skill.learned) return false;
            
            const learningPoints = $gameSystem._bladeSeed.learningPoints || 0;
            if (learningPoints >= skill.cost) {
                skill.learned = true;
                $gameSystem._bladeSeed.learningPoints -= skill.cost;
                
                // Add skill to actor 1
                const actor = $gameActors.actor(1);
                if (actor && !actor.hasSkill(skill.skillId)) {
                    actor.learnSkill(skill.skillId);
                }
                
                return true;
            }
            return false;
        }
        
        getLearnedSkills() {
            return this.skills.filter(skill => skill.learned);
        }
        
        getUnlearnedSkills() {
            return this.skills.filter(skill => !skill.learned);
        }
    }
    
    // ── Window / Scene UI removed, handled by BladeSeedSystemUI.js ─────────

    // ── Chosen appearance ────────────────────────────────────────────────
    // A weapon's procedural look is normally derived from the world seed and
    // its database id, so every copy of a sword looks alike in a given world.
    // A seed weapon is grown for one person, so its look is theirs to pick.
    // The seed rides in the same <ForgeSeed:> note the anvil already uses to
    // keep the piece the smith previewed (WeaponSystemProcedural.seedFor), so
    // the model system needs to know nothing about blade seeds.
    const FORGE_SEED_TAG = /\s*<ForgeSeed:[^>]*>/i;

    const randomAppearanceSeed = () => (Math.random() * 0x100000000) >>> 0;

    // One candidate look, as a throwaway copy of the weapon carrying the seed
    // under test. The panel's 3D preview builds its model from this, so nothing
    // is written to the database until the player binds.
    const previewWithAppearance = (weaponId, seed) => {
        const base = $dataWeapons[weaponId];
        if (!base) return null;
        return Object.assign({}, base, {
            meta: Object.assign({}, base.meta, { ForgeSeed: String(seed >>> 0) })
        });
    };

    // Writes the chosen look onto the live database row. Only a blade seed can
    // produce these weapons and only one can be bound at a time, so the row is
    // this binding's alone to shape. The database is rebuilt from file on every
    // boot, hence applyStoredAppearance below.
    const applyAppearance = (weaponId, seed) => {
        const weapon = $dataWeapons[weaponId];
        if (!weapon) return;
        weapon.note = String(weapon.note || '').replace(FORGE_SEED_TAG, '') +
            '\n<ForgeSeed: ' + (seed >>> 0) + '>';
        DataManager.extractMetadata(weapon);
    };

    const clearAppearance = (weaponId) => {
        const weapon = $dataWeapons[weaponId];
        if (!weapon) return;
        weapon.note = String(weapon.note || '').replace(FORGE_SEED_TAG, '');
        DataManager.extractMetadata(weapon);
    };

    // Puts the bound weapon's chosen look back on the database row after a load
    // or a new game, since $dataWeapons comes off disk unmarked.
    const applyStoredAppearance = () => {
        const data = $gameSystem && $gameSystem._bladeSeed;
        if (!data || !data.bound || !data.weaponId || !data.appearanceSeed) return;
        applyAppearance(data.weaponId, data.appearanceSeed);
    };

    // Expose data API for BladeSeedSystemUI.js
    window.BladeSeed = {
        weaponTypes,
        elementNames,
        spiritSets,
        spiritSkills,
        SpiritCompanion,
        generateWeaponName,
        loadBladeSeedImage,
        getCompatibleWeaponTypes,
        calculateSkillLearningCost,
        initializeBladeSeedData,
        isRealSkill,
        seedStartingSkill,
        buildSpiritSkills,
        randomAppearanceSeed,
        previewWithAppearance,
        applyAppearance,
        clearAppearance,
    };

    // Plugin Commands
    PluginManager.registerCommand(pluginName, 'bindBladeSeed', args => {
        initializeBladeSeedData();
        if ($gameSystem._bladeSeed && $gameSystem._bladeSeed.bound) {
            if (typeof window !== 'undefined') {
                window.skipLocalization = true;
            }
            $gameMessage.add(T('BladeSeed.alreadyBound'));
            if (typeof window !== 'undefined') {
                window.skipLocalization = false;
            }
            return;
        }
        if (window.Scene_BladeSeedBind) SceneManager.push(window.Scene_BladeSeedBind);
    });
    
    PluginManager.registerCommand(pluginName, 'unbindBladeSeed', args => {
        initializeBladeSeedData();
        if (!$gameSystem._bladeSeed || !$gameSystem._bladeSeed.bound) {
            return;
        }
        
        // Remove weapon from inventory
        const weaponId = $gameSystem._bladeSeed.weaponId;
        const actor = $gameActors.actor(1);
        
        // Remove learned spirit skills from actor
        const spirit = $gameSystem._bladeSeed.spirit;
        if (spirit) {
            const learnedSkills = spirit.getLearnedSkills();
            learnedSkills.forEach(skill => {
                if (actor.hasSkill(skill.skillId)) {
                    actor.forgetSkill(skill.skillId);
                }
            });
        }
        
        // Unequip weapon
        actor.changeEquip(0, null);

        // Remove weapon from inventory
        $gameParty.loseItem($dataWeapons[weaponId], 1);

        // The chosen look belonged to that binding, not to the database row.
        clearAppearance(weaponId);
        
        // Remove spirit stats
        if (actor._bladeSeedBonus) {
            delete actor._bladeSeedBonus;
        }
        
        // Clear blade seed data
        $gameSystem._bladeSeed = {
            bound: false,
            weaponName: '',
            weaponId: 0,
            weaponTypeId: 0,
            appearanceSeed: 0,
            spirit: null,
            level: 1,
            experience: 0,
            learningPoints: 0
        };
        
        // Clear modified weapon data
        if ($gameSystem._bladeSeedWeaponData) {
            delete $gameSystem._bladeSeedWeaponData;
        }
    });
    
    // Override weapon name display system
    const _Window_Base_drawItemName = Window_Base.prototype.drawItemName;
    Window_Base.prototype.drawItemName = function(item, x, y, width) {
        if (item && DataManager.isWeapon(item)) {
            const customName = getBladeSeedWeaponName(item.id);
            if (customName) {
                // Create temporary item with custom name
                const tempItem = Object.assign({}, item);
                tempItem.name = customName;
                return _Window_Base_drawItemName.call(this, tempItem, x, y, width);
            }
        }
        return _Window_Base_drawItemName.call(this, item, x, y, width);
    };
    
    // Override for status windows and equipment displays
    const _Window_Status_drawItemName = Window_Status ? Window_Status.prototype.drawItemName : null;
    if (Window_Status && _Window_Status_drawItemName) {
        Window_Status.prototype.drawItemName = function(item, x, y, width) {
            if (item && DataManager.isWeapon(item)) {
                const customName = getBladeSeedWeaponName(item.id);
                if (customName) {
                    const tempItem = Object.assign({}, item);
                    tempItem.name = customName;
                    return _Window_Status_drawItemName.call(this, tempItem, x, y, width);
                }
            }
            return _Window_Status_drawItemName.call(this, item, x, y, width);
        };
    }
    
    // Override for equipment window
    const _Window_EquipItem_drawItemName = Window_EquipItem ? Window_EquipItem.prototype.drawItemName : null;
    if (Window_EquipItem && _Window_EquipItem_drawItemName) {
        Window_EquipItem.prototype.drawItemName = function(item, x, y, width) {
            if (item && DataManager.isWeapon(item)) {
                const customName = getBladeSeedWeaponName(item.id);
                if (customName) {
                    const tempItem = Object.assign({}, item);
                    tempItem.name = customName;
                    return _Window_EquipItem_drawItemName.call(this, tempItem, x, y, width);
                }
            }
            return _Window_EquipItem_drawItemName.call(this, item, x, y, width);
        };
    }
    
    // Override item name in text processing
    const _Game_Message_allText = Game_Message.prototype.allText;
    Game_Message.prototype.allText = function() {
        let text = _Game_Message_allText.call(this);
        
        // Replace weapon names in text if Blade Seed is bound
        if ($gameSystem._bladeSeed && $gameSystem._bladeSeed.bound) {
            const base = $dataWeapons[$gameSystem._bladeSeed.weaponId];
            const originalName = base && base.name;
            const customName = $gameSystem._bladeSeed.weaponName;
            // The weapon's name is a name, not a pattern: a bracket or a plus
            // in it would otherwise throw here and take every message box in
            // the game down with it.
            if (originalName && customName) {
                const pattern = originalName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                text = text.replace(new RegExp(pattern, 'g'), customName);
            }
        }
        
        return text;
    };
    
    // Add menu command
    const _Window_MenuCommand_addOriginalCommands = Window_MenuCommand.prototype.addOriginalCommands;
    Window_MenuCommand.prototype.addOriginalCommands = function() {
        _Window_MenuCommand_addOriginalCommands.call(this);
        initializeBladeSeedData();
        if ($gameSystem._bladeSeed && $gameSystem._bladeSeed.bound) {
            this.addCommand(T('BladeSeed.title'), 'bladeSeed', true);
        }
    };
    
    const _Scene_Menu_createCommandWindow = Scene_Menu.prototype.createCommandWindow;
    Scene_Menu.prototype.createCommandWindow = function() {
        _Scene_Menu_createCommandWindow.call(this);
        this._commandWindow.setHandler('bladeSeed', this.commandBladeSeed.bind(this));
    };
    
    Scene_Menu.prototype.commandBladeSeed = function() {
        if (window.Scene_BladeSeedStatus) SceneManager.push(window.Scene_BladeSeedStatus);
    };
    
    // Extend Game_Actor to include blade seed bonuses
    const _Game_Actor_paramBase = Game_Actor.prototype.paramBase;
    Game_Actor.prototype.paramBase = function(paramId) {
        let value = _Game_Actor_paramBase.call(this, paramId);
        if (this._bladeSeedBonus && this._bladeSeedBonus[paramId]) {
            value += this._bladeSeedBonus[paramId];
        }
        return value;
    };
    
    // Handle experience gain for spirit
    const _Game_Actor_gainExp = Game_Actor.prototype.gainExp;
    Game_Actor.prototype.gainExp = function(exp) {
        _Game_Actor_gainExp.call(this, exp);
        
        if (this.actorId() === 1 && $gameSystem._bladeSeed && $gameSystem._bladeSeed.bound) {
            const spirit = $gameSystem._bladeSeed.spirit;
            // A save written before the spirit was revived, or one whose seed
            // was cleared behind the flag, leaves a bare object here. Growing
            // nothing is right; throwing on every kill is not.
            if (!spirit || typeof spirit.gainExperience !== 'function') return;
            const spiritExp = Math.floor(exp * 0.5); // Spirit gains 50% of actor exp
            
            const result = spirit.gainExperience(spiritExp);
            if (result.levelUp) {
                if (typeof window !== 'undefined') {
                    window.skipLocalization = true;
                }
                // A blade growing is a side effect of a fight the party has
                // just won: told over the screen, not through a box that has
                // to be dismissed after every battle.
                const lines = [T('BladeSeed.leveledUp', { name: spirit.name, level: spirit.level })];
                if (result.evolved) {
                    lines.push(T('BladeSeed.evolved', { name: spirit.name, stage: spirit.getEvolutionStage() }));
                }
                if (window.ParchmentToast) {
                    window.ParchmentToast.show(lines.join('<br>'), {
                        severity: 'good', html: true,
                        key: 'bladeseed:' + spirit.level  // i18n-ignore  dedupe key
                    });
                } else {
                    lines.forEach(l => $gameMessage.add(l));
                }

                if (typeof window !== 'undefined') {
                    window.skipLocalization = false;
                }
                
                // Reapply stats
                const actor = $gameActors.actor(1);
                actor._bladeSeedBonus = {
                    0: spirit.currentStats.mhp,
                    1: spirit.currentStats.mmp,
                    2: spirit.currentStats.atk,
                    3: spirit.currentStats.def,
                    4: spirit.currentStats.mat,
                    5: spirit.currentStats.mdf,
                    6: spirit.currentStats.agi,
                    7: spirit.currentStats.luk
                };
            }
        }
    };
    
    // Track normal attacks to gain learning points
    const _Game_Action_apply = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function(target) {
        _Game_Action_apply.call(this, target);
        
        // Check if this is a normal attack by actor 1 with blade seed bound.
        // A plain attack IS a skill in MZ, the row at attackSkillId(), so
        // isAttack() is the whole question: asking for a swing that is not a
        // skill asks for something that never happens, and the points a spirit
        // learns from would never have been paid.
        const subject = this.subject();
        if (subject && subject.isActor() && subject.actorId() === 1) {
            if ($gameSystem._bladeSeed && $gameSystem._bladeSeed.bound) {
                if (this.isAttack()) {
                    // Add 1 learning point for normal attacks
                    $gameSystem._bladeSeed.learningPoints = ($gameSystem._bladeSeed.learningPoints || 0) + 1;
                }
            }
        }
    };
    
    // Initialize on game load
    const _DataManager_createGameObjects = DataManager.createGameObjects;
    DataManager.createGameObjects = function() {
        _DataManager_createGameObjects.call(this);
        initializeBladeSeedData();
    };
    
    const _DataManager_makeSaveContents = DataManager.makeSaveContents;
    DataManager.makeSaveContents = function() {
        const contents = _DataManager_makeSaveContents.call(this);
        contents.bladeSeed = $gameSystem._bladeSeed;
        return contents;
    };
    
    const _DataManager_extractSaveContents = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function(contents) {
        _DataManager_extractSaveContents.call(this, contents);
        $gameSystem._bladeSeed = contents.bladeSeed || null;
        
        // Initialize if data doesn't exist
        initializeBladeSeedData();
        
        // Reconstruct spirit methods if spirit exists
        if ($gameSystem._bladeSeed && $gameSystem._bladeSeed.spirit) {
            Object.setPrototypeOf($gameSystem._bladeSeed.spirit, SpiritCompanion.prototype);
        }

        // The database is read off disk unmarked, so the weapon gets its
        // chosen look back here rather than keeping it in the save file.
        applyStoredAppearance();
    };
})();
