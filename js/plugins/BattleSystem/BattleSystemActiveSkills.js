/*:
 * @target MZ
 * @plugindesc Extends specified classes with special skill learning mechanics and adds new battle commands.
 * @author Omni-Lex (Reworked by OmniLex)
 * @version 2.1.0
 * @help
 * ============================================================================
 * Description
 * ============================================================================
 *
 * This plugin provides special mechanics for designated classes:
 * 1. Learn a random skill from a defined pool upon leveling up.
 * 2. A chance to learn a skill used by an enemy when hit by it.
 *
 * It also adds a new Plugin Command that can be used in battle to temporarily
 * copy all skills from the enemy troop.
 *
 * ============================================================================
 * How to Use
 * ============================================================================
 *
 * 1. Go to the Plugin Manager and add this plugin.
 * 2. Configure the parameters to choose which classes are "special", the
 * skill pool they learn from, and the absorb chance.
 *
 * 3. To use the skill-copying feature:
 * - Create a new skill in the database (e.g., "Mirror Force").
 * - In the skill's "Effects", add a "Common Event".
 * - In that Common Event, use the "Plugin Command" event command.
 * - Select this plugin ("BattleSystemActiveSkills") and then the
 * "Mirror Enemy Skills" command.
 *
 * Now, when an actor uses the skill in battle, the command will run.
 *
 * ============================================================================
 * Plugin Commands
 * ============================================================================
 *
 * @command mirrorSkills
 * @text Mirror Enemy Skills
 * @desc (Battle Only) The user of the skill temporarily learns all skills from all enemies in the current battle.
 *
 * ============================================================================
 * Parameters
 * ============================================================================
 *
 * @param specialClasses
 * @text Special Classes
 * @type class[]
 * @desc The classes that will have the random and absorbed skill learning abilities.
 *
 * @param skillPoolStart
 * @text Skill Pool Start ID
 * @type number
 * @min 1
 * @desc The starting ID for the pool of learnable skills.
 * @default 1
 *
 * @param skillPoolEnd
 * @text Skill Pool End ID
 * @type number
 * @min 1
 * @desc The ending ID for the pool of learnable skills.
 * @default 100
 *
 * @param learnChance
 * @text Learn Chance from Hits
 * @type number
 * @min 0
 * @max 100
 * @desc Percentage chance to learn a skill when hit (0-100).
 * @default 25
 */

(() => {
    'use strict';

    const pluginName = "BattleSystemActiveSkills";
    const parameters = PluginManager.parameters(pluginName);

    const SPECIAL_CLASS_IDS = JSON.parse(parameters['specialClasses'] || '[]').map(Number);
    const SKILL_POOL_START = Number(parameters['skillPoolStart'] || 1);
    const SKILL_POOL_END = Number(parameters['skillPoolEnd'] || 100);
    const LEARN_CHANCE = Number(parameters['learnChance'] || 25);

    let learnableSkillIds = [];

    //-----------------------------------------------------------------------------
    // Helper Functions
    //-----------------------------------------------------------------------------

    const isSpecialClass = (actor) => {
        return actor && actor.isActor() && SPECIAL_CLASS_IDS.includes(actor.currentClass().id);
    };
    
    /**
     * @description This function contains the logic for the "Mirror Enemy Skills" plugin command.
     * It is called when the command is executed from the game.
     */
    const handleMirrorSkillsCommand = () => {
        if (!$gameParty.inBattle() || !BattleManager._subject) {
            return;
        }

        const user = BattleManager._subject;
        if (!user.isActor()) {
            return;
        }

        user._tempLearnedSkills = user._tempLearnedSkills || [];
        const allEnemySkillIds = new Set();

        $gameTroop.members().forEach(enemy => {
            if (enemy.isAlive()) {
                enemy.enemy().actions.forEach(action => {
                    const skillId = action.skillId;
                    if (skillId > 0 && $dataSkills[skillId] && !user.isLearnedSkill(skillId)) {
                        allEnemySkillIds.add(skillId);
                    }
                });
            }
        });

        if (allEnemySkillIds.size > 0) {
            allEnemySkillIds.forEach(skillId => {
                user.learnSkill(skillId);
                user._tempLearnedSkills.push(skillId);
            });
            const message = T('Battle.mimic.mirrored', { actor: user.name() });
            BattleManager._logWindow.push('addText', message);
        }
    };


    //-----------------------------------------------------------------------------
    // Plugin Command Registration
    //-----------------------------------------------------------------------------
    
    PluginManager.registerCommand(pluginName, "mirrorSkills", handleMirrorSkillsCommand);
    PluginManager.registerCommand("BattleSystemActiveSkills", "mirrorSkills", handleMirrorSkillsCommand);
    // This plugin was called EnhancedClassMechanics. Keep the old command key
    // alive so any event still pointing at the former file name (e.g. one the
    // editor rewrites from its own project data) keeps working.
    PluginManager.registerCommand("EnhancedClassMechanics", "mirrorSkills", handleMirrorSkillsCommand);


    //-----------------------------------------------------------------------------
    // DataManager
    //-----------------------------------------------------------------------------

    const _DataManager_isDatabaseLoaded = DataManager.isDatabaseLoaded;
    DataManager.isDatabaseLoaded = function() {
        if (!_DataManager_isDatabaseLoaded.call(this)) {
            return false;
        }
        if (learnableSkillIds.length === 0) {
            for (let i = SKILL_POOL_START; i <= SKILL_POOL_END; i++) {
                if ($dataSkills[i] && $dataSkills[i].name && !$dataSkills[i].name.includes('[HIDDEN]')) {
                    learnableSkillIds.push(i);
                }
            }
        }
        return true;
    };

    //-----------------------------------------------------------------------------
    // Game_Actor
    //-----------------------------------------------------------------------------

    const _Game_Actor_initMembers = Game_Actor.prototype.initMembers;
    Game_Actor.prototype.initMembers = function() {
        _Game_Actor_initMembers.call(this);
        this._tempLearnedSkills = [];
    };

    const _Game_Actor_levelUp = Game_Actor.prototype.levelUp;
    Game_Actor.prototype.levelUp = function() {
        _Game_Actor_levelUp.call(this);
        if (isSpecialClass(this)) {
            learnRandomSkill(this);
        }
    };

    function learnRandomSkill(actor) {
        const unknownSkills = learnableSkillIds.filter(skillId => !actor.isLearnedSkill(skillId));
        if (unknownSkills.length > 0) {
            const skillId = unknownSkills[Math.floor(Math.random() * unknownSkills.length)];
            actor.learnSkill(skillId);
            $gameMessage.add(T('Battle.mimic.hasLearned', { actor: actor.name(), skill: $dataSkills[skillId].name }));
        }
    }

    Game_Actor.prototype.getLearnableSkillsCount = function() {
        if (!isSpecialClass(this)) {
            return 0;
        }
        return learnableSkillIds.filter(skillId => !this.isLearnedSkill(skillId)).length;
    };

    //-----------------------------------------------------------------------------
    // Game_Action
    //-----------------------------------------------------------------------------

    const _Game_Action_apply = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function(target) {
        _Game_Action_apply.call(this, target);

        if (this.isSkill() && this.subject().isEnemy() && isSpecialClass(target)) {
            const skillId = this.item().id;

            const skillData = $dataSkills[skillId];
            const isLearnable = skillId >= SKILL_POOL_START &&
                skillId <= SKILL_POOL_END &&
                !target.isLearnedSkill(skillId) &&
                !!skillData && !!skillData.name && skillData.name.trim() !== '';

            if (isLearnable && Math.randomInt(100) < LEARN_CHANCE) {
                target.learnSkill(skillId);
                const message = T('Battle.mimic.learnedFromEnemy', { actor: target.name(), skill: $dataSkills[skillId].name });
                BattleManager._logWindow.push('addText', message);
            }
        }
    };

    //-----------------------------------------------------------------------------
    // BattleManager
    //-----------------------------------------------------------------------------

    const _BattleManager_endBattle = BattleManager.endBattle;
    BattleManager.endBattle = function(result) {
        $gameParty.allMembers().forEach(actor => {
            if (actor._tempLearnedSkills && actor._tempLearnedSkills.length > 0) {
                actor._tempLearnedSkills.forEach(skillId => actor.forgetSkill(skillId));
                actor._tempLearnedSkills = [];
            }
        });
        _BattleManager_endBattle.call(this, result);
    };

    //-----------------------------------------------------------------------------
    // Window_Status
    //-----------------------------------------------------------------------------

    const _Window_Status_drawProfile = Window_Status.prototype.drawProfile;
    Window_Status.prototype.drawProfile = function(x, y) {
        _Window_Status_drawProfile.call(this, x, y);

        if (isSpecialClass(this._actor)) {
            const learnableCount = this._actor.getLearnableSkillsCount();
            const y2 = y + this.lineHeight() * 2; 
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(T('Battle.mimic.learnableSkills'), x, y2, 200);
            this.resetTextColor();
            this.drawText(learnableCount.toString(), x + 160, y2, 60, "right");
        }
    };

})();


//=============================================================================
// LIMIT BREAKS - the Hyper
//=============================================================================
// A character who is cut down to nothing IN a fight is given one way out of it,
// once a day. When their HP crosses into dying territory during the battle (not
// when they walked in already hurt), the Defense row - or Reload, for a ranged
// weapon - becomes their class's Hyper: one turn of invulnerability and one
// enormous class-signature act.
//
//   armed   the fall happened this battle and the day's Hyper is unspent
//   ready   armed, still dying, still able to act: the row is offered
//   spent   used today; nothing offers it again until the date turns
//
// Every class has its own command name and its own act, both of which live
// outside this file: the names in js/i18n/<lang>/plugins/Battle.json under
// hyper.name.<classId>, the mechanics in HYPERS below, keyed by the same id.
//
// Public API (window.LimitBreak):
//   isArmed(actor) / isReady(actor) / isSpent(actor)
//   commandName(actor)        the class's word for it, for the command row
//   hyperFor(actor)           the registry entry, or null
//   choose(actor)             book it as this actor's action for the turn
//   armFromDamage(actor)      the hook that arms it (called on HP loss)
//=============================================================================

(() => {
    'use strict';

    // How much of a turn's worth of protection the Hyper buys, and what counts
    // as the fall that arms it. isDying() is the engine's own "under a quarter
    // of the bar", the same line the danger warnings read.
    const INVULNERABLE_TURNS = 1;
    const MINUTES_PER_DAY = 1440;

    const text = (leaf, params) => {
        const key = 'Battle.hyper.' + leaf;
        return T.has(key) ? T(key, params) : '';
    };

    const announce = (msg) => {
        if (!msg) return;
        if (BattleManager._logWindow && BattleManager._logWindow.push) {
            BattleManager._logWindow.push('addText', msg);
        }
    };

    /** The day the world is on, so a Hyper is spent for the rest of it. */
    function currentDay() {
        try {
            if (window.TimeDateSystem && window.TimeDateSystem.getGameTimeMinutes) {
                return Math.floor(window.TimeDateSystem.getGameTimeMinutes() / MINUTES_PER_DAY);
            }
        } catch (e) {}
        const minutes = ($gameVariables && $gameVariables.value(114)) || 0;
        return Math.floor(minutes / MINUTES_PER_DAY);
    }

    const rand = (n) => Math.floor(Math.random() * n);
    const pickOne = (arr) => (arr && arr.length ? arr[rand(arr.length)] : null);
    const shuffled = (arr) => {
        const out = arr.slice();
        for (let i = out.length - 1; i > 0; i--) {
            const j = rand(i + 1);
            [out[i], out[j]] = [out[j], out[i]];
        }
        return out;
    };

    const aliveEnemies = () => ($gameTroop ? $gameTroop.aliveMembers() : []);
    const partyMembers = () => ($gameParty ? $gameParty.battleMembers() : []);

    //=========================================================================
    // Damage without a skill behind it
    //=========================================================================
    // A Hyper is not in the skill database: it is one act a class performs once
    // a day, so its damage is dealt the way ThrowItemPlugin deals a thrown
    // crate's - a plain HP hit with the ordinary popup, so the HUD, the corpses
    // and the death handling all see a normal blow.

    function hyperPower(actor, def) {
        const stat = def.stat === 'mat' ? actor.mat : def.stat === 'best'
            ? Math.max(actor.atk, actor.mat) : actor.atk;
        return stat * (def.mult || 1);
    }

    function landHit(actor, target, def) {
        if (!target || !target.isAlive || !target.isAlive()) return 0;
        const guard = def.stat === 'mat' ? target.mdf : target.def;
        let value = Math.max(1, Math.round(hyperPower(actor, def) - guard * 0.5));
        if (def.element) value = Math.round(value * target.elementRate(def.element));
        value = Math.max(1, Math.round(value * (0.9 + Math.random() * 0.2)));
        if (target.clearResult) target.clearResult();
        target.gainHp(-value);
        if (target.result && target.result()) {
            const res = target.result();
            res.used = true;
            res.hpAffected = true;
            res.hpDamage = value;
        }
        if (target.startDamagePopup) target.startDamagePopup();
        if (target.hp <= 0 && target.performCollapse) target.performCollapse();
        return value;
    }

    const addStates = (battler, states) => {
        (states || []).forEach(id => {
            if ($dataStates && $dataStates[id] && battler.addState) battler.addState(id);
        });
    };

    //=========================================================================
    // The acts themselves
    //=========================================================================
    // One function per kind. Every class in the registry names one of these and
    // hands it its own numbers, so a Hyper is a shape plus a class's scale.

    const ACTS = {
        // Everything standing takes it, `hits` times over.
        barrage(actor, def) {
            let total = 0;
            for (let i = 0; i < (def.hits || 1); i++) {
                aliveEnemies().forEach(enemy => { total += landHit(actor, enemy, def); });
            }
            announce(text('act.barrage', { actor: actor.name(), damage: total }));
        },

        // One blow, thrown at whatever is strongest still standing.
        strike(actor, def) {
            const enemies = aliveEnemies();
            if (!enemies.length) return;
            const target = enemies.reduce((a, b) => (a.hp >= b.hp ? a : b));
            // A wretch swings with everything the wound left: the closer to the
            // floor, the harder it lands.
            const scaled = def.desperate
                ? Object.assign({}, def, { mult: (def.mult || 1) * (2 - actor.hp / Math.max(1, actor.mhp)) })
                : def;
            const damage = landHit(actor, target, scaled);
            addStates(target, def.states);
            announce(text('act.strike', { actor: actor.name(), target: target.name(), damage }));
        },

        // A flurry thrown wherever it falls.
        multi(actor, def) {
            let total = 0;
            for (let i = 0; i < (def.hits || 1); i++) {
                const target = pickOne(aliveEnemies());
                if (!target) break;
                total += landHit(actor, target, def);
            }
            announce(text('act.multi', { actor: actor.name(), hits: def.hits || 1, damage: total }));
        },

        // Takes it out of them and puts it back into the one who cast it.
        drain(actor, def) {
            let total = 0;
            aliveEnemies().forEach(enemy => { total += landHit(actor, enemy, def); });
            const healed = Math.round(total * (def.leech || 0.5));
            actor.gainHp(healed);
            announce(text('act.drain', { actor: actor.name(), damage: total, healed }));
        },

        // Anything already this far down does not get up again.
        execute(actor, def) {
            let killed = 0;
            let total = 0;
            aliveEnemies().forEach(enemy => {
                if (enemy.hp / Math.max(1, enemy.mhp) <= (def.threshold || 0.3)) {
                    landHit(actor, enemy, Object.assign({}, def, { mult: (def.mult || 1) * 10 }));
                    if (!enemy.isAlive()) killed++;
                } else {
                    total += landHit(actor, enemy, def);
                }
            });
            announce(text('act.execute', { actor: actor.name(), killed, damage: total }));
        },

        // The whole party back on its feet. `parts` mends what the Health
        // system has broken, `cleanse` strips what is riding them.
        heal(actor, def) {
            partyMembers().forEach(member => {
                if (!member || !member.isAlive()) return;
                member.setHp(member.mhp);
                if (def.mp) member.setMp(member.mmp);
                if (def.parts && window.HealthCore && window.HealthCore.restoreAllBodyParts) {
                    window.HealthCore.restoreAllBodyParts(member);
                }
                if (def.cleanse) {
                    // Everything riding them comes off; death is not a state a
                    // heal argues with, so state 1 is left where it is.
                    member.states().slice().forEach(state => {
                        if (state && state.id !== 1) member.removeState(state.id);
                    });
                }
                addStates(member, def.states);
                if (member.startDamagePopup) member.startDamagePopup();
            });
            announce(text(def.parts ? 'act.healParts' : 'act.heal', { actor: actor.name() }));
        },

        // Everyone who has fallen gets up, whole, and not quite alive.
        raise(actor, def) {
            let raised = 0;
            partyMembers().forEach(member => {
                if (!member || !member.isDead()) return;
                member.revive();
                member.setHp(member.mhp);
                if (def.undead) window.LimitBreak.markUndead(member);
                raised++;
            });
            announce(text(raised ? 'act.raise' : 'act.raiseNobody', { actor: actor.name(), count: raised }));
        },

        // A wall goes up in front of the party and nothing physical gets past
        // it until it comes down.
        wall(actor, def) {
            const turns = def.turns || 3;
            $gameParty._hyperWallTurns = Math.max($gameParty._hyperWallTurns || 0, turns);
            announce(text('act.wall', { actor: actor.name(), turns }));
        },

        // Whatever is in the bag, thrown together and set off at them. The
        // party keeps its stock: this is one act a day, not a shopping trip.
        assembly(actor, def) {
            const usable = $gameParty.allItems().filter(item =>
                item && DataManager.isItem(item) && $gameParty.canUse(item));
            if (!usable.length) {
                announce(text('act.assemblyEmpty', { actor: actor.name() }));
                return;
            }
            const picks = shuffled(usable).slice(0, def.uses || 3);
            picks.forEach(item => {
                const action = new Game_Action(actor);
                action.setItemObject(item);
                const targets = action.isForAll && action.isForAll()
                    ? aliveEnemies()
                    : [pickOne(aliveEnemies())].filter(Boolean);
                targets.forEach(target => {
                    action.apply(target);
                    if (target.startDamagePopup) target.startDamagePopup();
                    if (target.hp <= 0 && target.performCollapse) target.performCollapse();
                });
                action.applyGlobal();
            });
            announce(text('act.assembly', { actor: actor.name(), count: picks.length }));
        },

        // Every spell they carry, cast at once and paid for by nobody.
        overload(actor, def) {
            const spells = actor.skills().filter(skill =>
                skill && skill.stypeId > 0 && skill.damage && skill.damage.type === 1 &&
                skill.occasion !== 3 && skill.occasion !== 2);
            if (!spells.length) {
                announce(text('act.overloadEmpty', { actor: actor.name() }));
                return;
            }
            const casts = shuffled(spells).slice(0, def.casts || 3);
            casts.forEach(skill => {
                const action = new Game_Action(actor);
                action.setSkill(skill.id);
                const targets = action.isForAll && action.isForAll()
                    ? aliveEnemies()
                    : [pickOne(aliveEnemies())].filter(Boolean);
                targets.forEach(target => {
                    action.apply(target);
                    if (target.startDamagePopup) target.startDamagePopup();
                    if (target.hp <= 0 && target.performCollapse) target.performCollapse();
                });
                action.applyGlobal();
            });
            if (def.restore) { actor.setMp(actor.mmp); actor.setTp(100); }
            announce(text('act.overload', { actor: actor.name(), count: casts.length }));
        },

        // The party is picked up and pointed at them.
        rally(actor, def) {
            partyMembers().forEach(member => {
                if (!member || !member.isAlive()) return;
                addStates(member, def.states || []);
                if (def.healRatio) member.gainHp(Math.round(member.mhp * def.healRatio));
                if (member.startDamagePopup) member.startDamagePopup();
            });
            announce(text('act.rally', { actor: actor.name() }));
        },

        // Everything standing is left unable to do much about anything.
        disable(actor, def) {
            let total = 0;
            aliveEnemies().forEach(enemy => {
                if (def.mult) total += landHit(actor, enemy, def);
                addStates(enemy, def.states || []);
            });
            announce(text('act.disable', { actor: actor.name(), damage: total }));
        },

        // A Freelancer has no signature act, which is the signature act: the
        // day's Hyper is somebody else's, drawn on the spot.
        wild(actor) {
            const borrowed = shuffled(Object.keys(HYPERS))
                .map(id => HYPERS[id])
                .find(def => def && def.kind !== 'wild');
            if (!borrowed) return;
            announce(text('act.wild', { actor: actor.name() }));
            const act = ACTS[borrowed.kind];
            if (act) act(actor, borrowed);
        },

        // Em's, and only while the vector gun is in her hands: the frame folds
        // into a grimoire it has no business having a shape for, and every
        // spell she carries is put down for something out of the book. What she
        // was carrying comes back when the fight ends (restoreGrimoire).
        grimoire(actor, def) {
            if (window.VectorGun && window.VectorGun.openGrimoire) window.VectorGun.openGrimoire();
            const spriteset = SceneManager._scene && SceneManager._scene._spriteset;
            if (spriteset && spriteset.updateWeaponSprite) spriteset.updateWeaponSprite();
            const taken = dealGrimoire(actor, def);
            if (!taken) {
                announce(text('act.grimoireEmpty', { actor: actor.name() }));
                return;
            }
            announce(text('act.grimoire', { actor: actor.name(), count: taken.length }));
            // The book reads her back while it is open: an open grimoire keeps
            // the woman holding it on her feet, and holds her still. The
            // Grimoire of Solomon does the opposite, and says so instead.
            if (solomonPact()) {
                announce(text('act.pact', { actor: actor.name() }));
            } else if ($dataStates && $dataStates[REGEN_STATE_ID]) {
                actor.addState(REGEN_STATE_ID);
                announce(text('act.regen', { actor: actor.name() }));
            }
            if ($dataStates && $dataStates[FOCUS_STATE_ID]) actor.addState(FOCUS_STATE_ID);
            emEnter(actor);
        },

        // Money, thrown hard. What the party is carrying is what it lands for,
        // and none of it is spent: the threat is the point.
        gold(actor, def) {
            const purse = $gameParty.gold ? $gameParty.gold() : 0;
            const bonus = Math.min(def.cap || 400, Math.floor(purse / (def.perCoin || 500)));
            const shot = Object.assign({}, def, { mult: (def.mult || 1) + bonus / 100 });
            let total = 0;
            aliveEnemies().forEach(enemy => { total += landHit(actor, enemy, shot); });
            announce(text('act.gold', { actor: actor.name(), damage: total }));
        },
    };

    //=========================================================================
    // What the book offers her
    //=========================================================================
    // The pages are not her spell list: they are the loudest things in the
    // whole database, and how far into it she can read is a matter of level.
    // Under 50 the book stays with what the world knows; from 50 the esoteric
    // schools open (skill ids from ESOTERIC_FROM, the CamelCase menu-cast
    // spells); from 80 the pages that are marked <Forbidden> open too.

    const ESOTERIC_FROM = 1400;
    // The Magic skill type (Categories.json: type decides which one a skill is).
    const MAGIC_STYPE_ID = 1;
    // What turning a page costs her, as a share of the whole bar, and the state
    // the open book puts on her (States.json 15, HP Regeneration).
    const GRIMOIRE_REROLL_HP = 0.15;
    const REGEN_STATE_ID = 15;
    // Graceful Death is not a rage: it is the calmest she ever is. The book
    // puts her regeneration and her focus on together (States.json 34).
    const FOCUS_STATE_ID = 34;
    // The pact's price: a spell read out of the Grimoire of Solomon costs its
    // caster this much of her own health per point the spell costs to cast.
    const SOLOMON_HP_PER_MP = 1;
    // How many of her own lines the entrance is worth. She is not chatty here.
    const EM_ENTER_LINES = 2;
    const GRIMOIRE_ESOTERIC_LEVEL = 50;
    const GRIMOIRE_FORBIDDEN_LEVEL = 80;
    const GRIMOIRE_SLOTS = 9;
    // What counts as loud: the top slice of the pool by what the spell costs
    // anyone else to cast, since nothing cheap is worth turning a page for.
    const GRIMOIRE_TOP_SLICE = 0.25;

    const isForbiddenSkill = (skill) => !!(skill && skill.meta && skill.meta.Forbidden !== undefined);

    // The Grimoire of Solomon deals spells and nothing else: a page of it is
    // never a sword swing. What counts as a spell is not decided here:
    // window.SkillDetails.isMagical (CategorizedBattleSkills.js) draws that
    // line once for the whole game, and this is the same answer the skill card
    // prints its incantation on. The fallback below is only for a load order
    // where that service is not up yet.
    function isMagicalSkill(skill) {
        if (!skill) return false;
        if (window.SkillDetails && typeof window.SkillDetails.isMagical === 'function') {
            return window.SkillDetails.isMagical(skill);
        }
        const nature = window.MagicNature && typeof window.MagicNature.natureOf === 'function'
            ? window.MagicNature.natureOf(skill) : null;
        if (nature) return nature === 'magical';
        return skill.stypeId === MAGIC_STYPE_ID;
    }

    function grimoireSpells(actor, def) {
        const level = actor.level || 1;
        const esoteric = level >= (def.esotericLevel || GRIMOIRE_ESOTERIC_LEVEL);
        const forbidden = level >= (def.forbiddenLevel || GRIMOIRE_FORBIDDEN_LEVEL);
        // Nothing the book deals her is a spell she could never pay for: a page
        // she cannot cast is a dead slot in a nine-slot row.
        const ceiling = actor.mmp || 0;
        const pool = ($dataSkills || []).filter(skill => {
            if (!skill || !skill.name || skill.stypeId <= 0) return false;
            if (!isMagicalSkill(skill)) return false;
            if (skill.occasion !== 0 && skill.occasion !== 1) return false;
            if (!skill.damage || skill.damage.type <= 0) return false;
            if ((skill.mpCost || 0) > ceiling) return false;
            // Nor a page whose <StatReq:> floor she is under: the book deals
            // her spells she can hold, not ones that come apart in her hands.
            if (window.SkillStatReq && !window.SkillStatReq.meets(actor, skill)) return false;
            if (isForbiddenSkill(skill)) return forbidden;
            if (skill.id >= ESOTERIC_FROM) return esoteric;
            return true;
        });
        if (!pool.length) return [];
        const power = (skill) => (skill.mpCost || 0) + (skill.tpCost || 0) * 2;
        const ranked = pool.slice().sort((a, b) => power(b) - power(a));
        const loud = ranked.slice(0, Math.max(GRIMOIRE_SLOTS, Math.floor(ranked.length * GRIMOIRE_TOP_SLICE)));
        return shuffled(loud).slice(0, def.slots || GRIMOIRE_SLOTS).map(skill => skill.id);
    }

    //=========================================================================
    // Her voice while the book is open
    //=========================================================================
    // Graceful Death is the one state Em is not funny in. The lines she says
    // on the way into it, and the incantation she reads out of every spell she
    // casts while she is in it, are drawn from i18n and shown in the battle
    // log. No bust is raised for any of them: nothing paints a portrait over a
    // fight, and this is a fight.

    function emSay(leaf, params) {
        const lines = T.has('Battle.hyper.em.' + leaf) ? [text('em.' + leaf, params)] : [];
        return lines[0] || '';
    }

    function emVoiceLines(leaf) {
        const key = 'Battle.hyper.em.' + leaf;
        const pool = (typeof T.pool === 'function' ? T.pool(key) : null) || [];
        return Array.isArray(pool) ? pool.filter(line => typeof line === 'string' && line) : [];
    }

    /** The two or three words she has for going into it. */
    function emEnter(actor) {
        const pool = emVoiceLines('enter');
        if (!pool.length) return;
        shuffled(pool).slice(0, EM_ENTER_LINES).forEach(line => {
            announce(String(line).replace(/\{actor\}/g, actor.name()));
        });
    }

    /**
     * The incantation of whatever she is about to cast, read out. A spell's
     * words are its <Lore:> text (ItemSystemUtils.loreFor, the generative
     * grammar in js/db/Skills/Lore.json); a spell with none, and anything that
     * is not a spell at all, is named instead. Nobody incants a sword swing.
     */
    function emIncant(actor, skill) {
        if (!skill || !skill.name) return;
        const utils = window.ItemSystemUtils;
        let lore = '';
        try {
            lore = (isMagicalSkill(skill) && utils && utils.loreFor) ? utils.loreFor(skill) : '';
        } catch (e) { lore = ''; }
        announce(lore
            ? text('em.incant', { actor: actor.name(), skill: skill.name, lore })
            : text('em.incantPlain', { actor: actor.name(), skill: skill.name }));
    }

    /**
     * Deals her a fresh row out of the book. The FIRST deal remembers what she
     * was carrying, so every later one (see rerollGrimoire) re-rolls the row
     * without ever losing the row she came in with.
     * @returns {?number[]} the skill ids dealt, or null when the book is blank
     */
    function dealGrimoire(actor, def) {
        const taken = grimoireSpells(actor, def);
        if (!taken.length) return null;
        if (!actor._grimoireRestore) {
            actor._grimoireRestore = {
                loadout: window.BattleLoadout ? window.BattleLoadout.ids(actor).slice() : null,
                learned: [],
            };
        }
        // What the last page gave her is put back before the next one is read,
        // so the pages do not pile up into a spell list nobody can close.
        const previous = actor._grimoireRestore.learned;
        previous.forEach(id => { if (!taken.includes(id)) actor.forgetSkill(id); });
        actor._grimoireRestore.learned = taken.filter(id => {
            if (actor.isLearnedSkill(id) && !previous.includes(id)) return false;
            if (!actor.isLearnedSkill(id)) actor.learnSkill(id);
            return true;
        });
        if (window.BattleLoadout) window.BattleLoadout.setAll(actor, taken);
        return taken;
    }

    /** The book closes with the fight, and she gets her own row back. */
    function restoreGrimoire(actor) {
        const saved = actor && actor._grimoireRestore;
        if (!saved) return;
        actor._grimoireRestore = null;
        (saved.learned || []).forEach(id => actor.forgetSkill(id));
        if (saved.loadout && window.BattleLoadout) window.BattleLoadout.setAll(actor, saved.loadout);
        if (window.VectorGun && window.VectorGun.closeGrimoire) window.VectorGun.closeGrimoire();
    }

    // Em's own Hyper, offered in place of her class's whenever the gun is the
    // thing in her hands.
    const GRIMOIRE_HYPER = {
        kind: 'grimoire',
        slots: GRIMOIRE_SLOTS,
        esotericLevel: GRIMOIRE_ESOTERIC_LEVEL,
        forbiddenLevel: GRIMOIRE_FORBIDDEN_LEVEL,
        grimoire: true,
    };

    /**
     * Whether the pact shape is the one fitted in the gun's form bay
     * (Weapon/VectorGunSystem.js). Everything the pact changes hangs off this:
     * the book opens by itself, the limit break buys no invulnerable turn, and
     * the book takes health rather than giving it.
     */
    function solomonPact() {
        const VG = window.VectorGun;
        return !!(VG && VG.solomonFitted && VG.solomonFitted());
    }

    /** Whether the vector gun is the weapon this actor is holding. */
    function holdsVectorGun(actor) {
        const VG = window.VectorGun;
        if (!VG || !VG.isVectorGun || !actor || !actor.weapons) return false;
        if (VG.isEm && !VG.isEm(actor)) return false;
        return actor.weapons().some(weapon => VG.isVectorGun(weapon));
    }

    //=========================================================================
    // The registry: one Hyper per class
    //=========================================================================
    // Keyed by class id (data/Classes.json). Classes 63 and up are the creature
    // roster and hold no Hyper: a Feral does not have a signature move, it has
    // teeth. The command's name for each id lives in i18n, never here.

    const HYPERS = {
        1:  { kind: 'wild' },                                             // Freelancer, Hyper
        2:  { kind: 'overload', casts: 4 },                              // Witch, Overload
        3:  { kind: 'heal', parts: true, cleanse: true, mp: true },      // Nun, Miracle
        4:  { kind: 'strike', mult: 4.0, states: [53] },                 // Knight, Oath
        5:  { kind: 'barrage', stat: 'mat', mult: 2.6 },                 // Convoker, Convergence
        6:  { kind: 'gold', mult: 1.6, perCoin: 400 },                   // CEO, Buyout
        7:  { kind: 'drain', stat: 'mat', mult: 2.4, leech: 0.6 },       // Vampire, Sanguine
        8:  { kind: 'raise', undead: true },                             // Cultist, Raise
        9:  { kind: 'heal', parts: true },                               // Combat Medic, Triage
        10: { kind: 'barrage', stat: 'mat', mult: 2.4, element: 4 },     // Elementalist, Confluence
        11: { kind: 'multi', mult: 0.9, hits: 8 },                       // Martial Artist, Hundred Fists
        12: { kind: 'disable', states: [9, 6], mult: 1.0 },              // Enchanter, Enthrall
        13: { kind: 'strike', mult: 5.0, desperate: true },              // Berserker, Bloodrage
        14: { kind: 'multi', mult: 1.0, hits: 6 },                       // Acrobat, Cascade
        15: { kind: 'heal', cleanse: true, states: [34] },               // Monk, Serenity
        16: { kind: 'barrage', mult: 1.6, hits: 3 },                     // Gunmancer, Grace
        17: { kind: 'strike', mult: 4.5, states: [13] },                 // Boxer, Haymaker
        18: { kind: 'strike', mult: 5.0, states: [52] },                 // Pro Wrestler, Finisher
        19: { kind: 'barrage', stat: 'mat', mult: 2.8, element: 2 },     // Fire Mage, Pyre
        20: { kind: 'barrage', stat: 'mat', mult: 2.5, element: 3, states: [11] }, // Ice Mage, Absolute Zero
        21: { kind: 'execute', mult: 3.0, threshold: 0.35 },             // Rogue, Shakedown
        22: { kind: 'wall', turns: 3 },                                  // Paladin, Aegis
        23: { kind: 'drain', stat: 'mat', mult: 2.6, leech: 0.5, element: 9 }, // Warlock, Pact
        24: { kind: 'multi', mult: 1.3, hits: 5 },                       // Ranger, Volley
        25: { kind: 'heal', cleanse: true },                             // Cleric, Benediction
        26: { kind: 'strike', mult: 6.0 },                               // Samurai, Iaido
        27: { kind: 'barrage', stat: 'mat', mult: 3.2 },                 // Archmage, Cataclysm
        28: { kind: 'execute', mult: 2.6, threshold: 0.30 },             // Scout, Ambush
        29: { kind: 'overload', casts: 3, restore: true },               // Oracle, Revelation
        30: { kind: 'strike', mult: 4.2 },                               // Gladiator, Coliseum
        31: { kind: 'raise', undead: true },                             // Necromancer, Exhumation
        32: { kind: 'rally', states: [24, 19], healRatio: 0.5 },         // Commander, Rally
        33: { kind: 'wall', turns: 3 },                                  // Guardian, Vigil
        34: { kind: 'multi', stat: 'best', mult: 1.4, hits: 4 },         // Spellblade, Runeblade
        35: { kind: 'rally', states: [24, 15], healRatio: 0.4 },         // Bard, Crescendo
        36: { kind: 'disable', states: [5, 8], mult: 1.2 },              // Illusionist, Mirage
        37: { kind: 'barrage', stat: 'mat', mult: 2.4 },                 // Battlemage, Barrage
        38: { kind: 'gold', mult: 1.8, perCoin: 600 },                   // Mercenary, Payday
        39: { kind: 'overload', casts: 3, restore: true },               // Sage, Enlightenment
        40: { kind: 'strike', mult: 4.6 },                               // Barbarian, Warcry
        41: { kind: 'heal', parts: true },                               // Doctor, Operation
        42: { kind: 'assembly', uses: 3 },                               // Scientist, Breakthrough
        43: { kind: 'barrage', mult: 2.0, element: 2 },                  // Firefighter, Backdraft
        44: { kind: 'disable', states: [13], mult: 1.5 },                // Police Officer, Crackdown
        45: { kind: 'heal', states: [24] },                              // Chef, Banquet
        46: { kind: 'disable', states: [40], mult: 1.2 },                // Journalist, Expose
        47: { kind: 'wall', turns: 4 },                                  // Construction Worker, Wall
        48: { kind: 'overload', casts: 2, restore: true },               // Academic, Thesis
        49: { kind: 'barrage', stat: 'mat', mult: 2.8 },                 // Psyker, Psi Storm
        50: { kind: 'assembly', uses: 2 },                               // Archaeologist, Excavation
        51: { kind: 'heal', parts: true, states: [19] },                 // Nurse, Ward
        52: { kind: 'execute', mult: 2.2, threshold: 0.40 },             // Hunter-Gatherer, Harvest
        53: { kind: 'barrage', stat: 'mat', mult: 3.0 },                 // Physicist, Singularity
        54: { kind: 'assembly', uses: 4 },                               // Mechanic, Assembly
        55: { kind: 'gold', mult: 1.4, perCoin: 300 },                   // Shopkeeper, Clearance
        56: { kind: 'multi', mult: 1.2, hits: 5 },                       // Farmer, Reaping
        57: { kind: 'strike', mult: 4.8 },                               // Lumberjack, Timber
        58: { kind: 'barrage', stat: 'mat', mult: 2.6, element: 4 },     // Meteorologist, Storm Front
        59: { kind: 'heal', cleanse: true, mp: true },                   // Priest, Absolution
        60: { kind: 'rally', states: [24, 34], healRatio: 0.4 },         // Entertainer, Encore
        61: { kind: 'strike', stat: 'best', mult: 7.0, element: 8 },     // Demigod, Apotheosis
        62: { kind: 'strike', mult: 3.0, desperate: true },              // Wretch, Spite
    };

    //=========================================================================
    // State on the actor
    //=========================================================================

    const classIdOf = (actor) =>
        (actor && actor.isActor && actor.isActor() && actor.currentClass && actor.currentClass())
            ? actor.currentClass().id : 0;

    const LimitBreak = {
        /**
         * The Hyper this body would use. The vector gun answers before the
         * class does: whatever Em trained as, the book is what the weapon in
         * her hands opens into.
         */
        hyperFor(actor) {
            if (holdsVectorGun(actor)) return GRIMOIRE_HYPER;
            const def = HYPERS[classIdOf(actor)];
            return def || null;
        },

        /** The class's own word for it, off i18n; the generic word otherwise. */
        commandName(actor) {
            const def = this.hyperFor(actor);
            if (def && def.grimoire) return text('name.grimoire') || text('name.default') || '';
            const key = 'name.' + classIdOf(actor);
            return text(key) || text('name.default') || '';
        },

        isSpent(actor) {
            return !!actor && actor._hyperSpentDay === currentDay();
        },

        isArmed(actor) {
            return !!actor && !!actor._hyperArmed;
        },

        /** Armed, still on the floor, still able to act, and not used today. */
        isReady(actor) {
            if (!actor || !this.hyperFor(actor)) return false;
            if (!$gameParty || !$gameParty.inBattle()) return false;
            return this.isArmed(actor) && !this.isSpent(actor) &&
                actor.isAlive() && actor.isDying() && actor.canMove();
        },

        /**
         * Called whenever an actor loses HP in a fight. The Hyper is armed by
         * the FALL, never by the standing: somebody who walked into the battle
         * already under the line is locked out until they climb back over it
         * and are put down again.
         */
        armFromDamage(actor) {
            if (!actor || !actor.isActor || !actor.isActor()) return;
            if (!$gameParty || !$gameParty.inBattle()) return;
            if (!this.hyperFor(actor)) return;
            if (!actor.isDying()) {
                // Back over the line: the next fall counts again.
                actor._hyperBlocked = false;
                return;
            }
            if (actor._hyperBlocked) return;
            if (actor._hyperArmed) return;
            actor._hyperArmed = true;
            announce(text('armed', { actor: actor.name(), hyper: this.commandName(actor) }));
            if (window.ParchmentToast && window.ParchmentToast.show) {
                window.ParchmentToast.show(text('armedToast', {
                    actor: actor.name(), hyper: this.commandName(actor),
                }));
            }
        },

        /** Booked as this turn's action; the act itself runs at startAction. */
        choose(actor) {
            if (!this.isReady(actor)) return false;
            actor._hyperPending = true;
            return true;
        },

        /** Fires the act, spends the day's charge and raises the shield. */
        unleash(actor) {
            const def = this.hyperFor(actor);
            actor._hyperPending = false;
            actor._hyperArmed = false;
            actor._hyperBlocked = true;
            if (!def) return;
            actor._hyperSpentDay = currentDay();
            // The pact buys no protection: what the book gives, it gives on the
            // page, and the woman reading it stands there unshielded.
            actor._hyperInvulnTurns = (def.grimoire && solomonPact()) ? 0 : INVULNERABLE_TURNS;
            announce(text('unleash', { actor: actor.name(), hyper: this.commandName(actor) }));
            const act = ACTS[def.kind];
            if (act) act(actor, def);
        },

        /**
         * The Grimoire of Solomon opens by itself. Whoever holds the gun with
         * the pact shape fitted walks into every fight already reading, which
         * is the whole of what the form buys and the whole of what it costs.
         * @returns {boolean} true when the book was opened for them
         */
        openPactBook(actor) {
            if (!solomonPact() || !holdsVectorGun(actor)) return false;
            if (this.isGrimoireOpen(actor)) return false;
            if (window.VectorGun && window.VectorGun.openGrimoire) window.VectorGun.openGrimoire();
            const taken = dealGrimoire(actor, GRIMOIRE_HYPER);
            if (!taken) return false;
            announce(text('act.pactOpen', { actor: actor.name(), count: taken.length }));
            if ($dataStates && $dataStates[FOCUS_STATE_ID]) actor.addState(FOCUS_STATE_ID);
            return true;
        },

        /**
         * What a page costs to read under the pact: the book takes out of her
         * what the spell would have taken out of anyone else, in blood rather
         * than in magic. It stops at her last point of health; the pact is a
         * price, not an execution.
         * @returns {number} the health taken
         */
        pactPrice(actor, skill) {
            if (!solomonPact() || !this.isGrimoireOpen(actor)) return 0;
            const cost = Math.round(((skill && skill.mpCost) || 0) * SOLOMON_HP_PER_MP);
            if (cost <= 0) return 0;
            const paid = Math.min(actor.hp - 1, cost);
            if (paid <= 0) return 0;
            actor.setHp(actor.hp - paid);
            if (actor.startDamagePopup) actor.startDamagePopup();
            announce(text('act.pactPrice', { actor: actor.name(), cost: paid }));
            return paid;
        },

        /** Whether the book is open in this one's hands right now. */
        isGrimoireOpen(actor) {
            return !!(actor && actor._grimoireRestore);
        },

        /**
         * Turning a page: while the book is open, SWITCH stops folding the
         * weapon and reads on instead. She pays for it in blood, and the row
         * she is carrying is thrown away for another one out of the same book.
         * @returns {boolean} false when there is no book, or no blood to pay
         */
        rerollGrimoire(actor) {
            if (!this.isGrimoireOpen(actor)) return false;
            if (actor.hp <= 1) return false;
            const def = this.hyperFor(actor) || GRIMOIRE_HYPER;
            const cost = Math.min(actor.hp - 1, Math.max(1, Math.round(actor.mhp * GRIMOIRE_REROLL_HP)));
            actor.setHp(actor.hp - cost);
            if (actor.startDamagePopup) actor.startDamagePopup();
            const taken = dealGrimoire(actor, def);
            if (!taken) {
                announce(text('act.grimoireEmpty', { actor: actor.name() }));
                return true;
            }
            announce(text('act.reroll', { actor: actor.name(), cost, count: taken.length }));
            const line = emSay('page', { actor: actor.name() });
            if (line) announce(line);
            return true;
        },

        isInvulnerable(battler) {
            return !!battler && (battler._hyperInvulnTurns || 0) > 0;
        },

        /** A raised ally walks the rest of the fight on borrowed legs. */
        markUndead(member) {
            member._hyperUndead = true;
        },

        isUndead(member) {
            return !!member && !!member._hyperUndead;
        },

        /** Cleared between fights: none of this outlives the battle it was won in. */
        clearBattleState() {
            if (!$gameParty) return;
            $gameParty._hyperWallTurns = 0;
            $gameParty.allMembers().forEach(member => {
                member._hyperArmed = false;
                member._hyperBlocked = false;
                member._hyperPending = false;
                member._hyperInvulnTurns = 0;
                restoreGrimoire(member);
                // What was raised keeps its feet only as long as the fight did.
                if (member._hyperUndead) {
                    member._hyperUndead = false;
                    if (member.isAlive()) member.setHp(1);
                }
            });
        },

        wallTurns() {
            return ($gameParty && $gameParty._hyperWallTurns) || 0;
        },

        // Read by the tests and by anything that wants to show the roster.
        registry() { return HYPERS; },

        // ------------------------------------------------------------------
        // Reading one out of the fight: the card the menus print
        // ------------------------------------------------------------------
        // The status screen and the character creator both show a class's
        // limit break beside its ability, and neither of them knows what a
        // Hyper is. They ask here and get a name and a sentence, and the
        // sentence is built from the entry's own numbers through one line per
        // KIND of Hyper rather than sixty-odd hand-written ones, so a Hyper
        // that is re-tuned describes itself correctly the same day.

        nameForClass(classId) {
            const key = 'name.' + classId;
            return text(key) || text('name.default') || '';
        },

        // A sentence for one entry, or "" when the class has no Hyper at all
        // (the creature roster, 63 and up).
        describeEntry(def) {
            if (!def) return '';
            const p = {
                mult: def.mult != null ? def.mult : 1,
                hits: def.hits || 1,
                casts: def.casts || 1,
                turns: def.turns || 1,
                slots: def.slots || 0,
                percent: Math.round((def.threshold || 0) * 100),
                leech: Math.round((def.leech || 0) * 100),
                heal: Math.round((def.healRatio || 0) * 100),
            };
            // A barrage sweeps the whole enemy line; only some of them sweep it
            // more than once, and "1 times over" is not a sentence.
            const leaf = (def.kind === 'barrage' && (def.hits || 1) > 1) ? 'barrageMulti' : def.kind;
            const line = text('kindDesc.' + leaf, p);
            return line || text('kindDesc.default', p) || '';
        },

        /** { name, desc } for a class id, or null when it fields no Hyper. */
        cardForClass(classId) {
            const def = HYPERS[classId];
            if (!def) return null;
            return { name: this.nameForClass(classId), desc: this.describeEntry(def) };
        },

        /**
         * The pact the vector gun opens instead of a class Hyper: Em's own, and
         * only ever hers (holdsVectorGun already refuses anybody else). Shown
         * on her card beside whatever her class would otherwise do.
         */
        grimoireCard() {
            return {
                name: text('name.grimoire') || '',
                desc: this.describeEntry(GRIMOIRE_HYPER),
            };
        },

        /** True when this actor's Hyper is the pact rather than her class's. */
        usesGrimoire(actor) { return holdsVectorGun(actor); },
    };

    window.LimitBreak = LimitBreak;

    //=========================================================================
    // Hooks
    //=========================================================================

    // Arming: any loss of HP an actor takes in a fight is a candidate fall.
    const _Game_Battler_onDamage = Game_Battler.prototype.onDamage;
    Game_Battler.prototype.onDamage = function (value) {
        _Game_Battler_onDamage.call(this, value);
        if (value > 0) LimitBreak.armFromDamage(this);
    };

    // Somebody who starts the fight already under the line has to climb out of
    // it before a fall can arm anything.
    const _BattleManager_startBattle_hyper = BattleManager.startBattle;
    BattleManager.startBattle = function () {
        _BattleManager_startBattle_hyper.call(this);
        if ($gameParty) {
            $gameParty._hyperWallTurns = 0;
            $gameParty.allMembers().forEach(member => {
                member._hyperArmed = false;
                member._hyperPending = false;
                member._hyperInvulnTurns = 0;
                member._hyperBlocked = member.isDying();
            });
            // The pact does not wait to be chosen.
            $gameParty.battleMembers().forEach(member => LimitBreak.openPactBook(member));
        }
    };

    // The act runs at the head of the actor's own turn, before the placeholder
    // guard the command booked resolves.
    const _BattleManager_startAction_hyper = BattleManager.startAction;
    BattleManager.startAction = function () {
        const subject = this._subject;
        if (subject && subject._hyperPending) LimitBreak.unleash(subject);
        // Every spell out of the open book is read aloud before it lands.
        if (subject && LimitBreak.isGrimoireOpen(subject) && subject.currentAction) {
            const action = subject.currentAction();
            if (action && action.isSkill && action.isSkill() && action.item) {
                const skill = action.item();
                emIncant(subject, skill);
                // And under the Grimoire of Solomon, the page is paid for.
                LimitBreak.pactPrice(subject, skill);
            }
        }
        _BattleManager_startAction_hyper.call(this);
    };

    // The shield and the wall are both counted down on the battler's own turn
    // end, not on BattleManager.endTurn: the game runs one action per battler
    // per round (IndividualBattleTurns.js), and that round loop never calls
    // endTurn at all. onTurnEnd fires exactly once per battler per round in
    // both flows, so a shield raised this round covers this round and no more.
    const _Game_Battler_onTurnEnd_hyper = Game_Battler.prototype.onTurnEnd;
    Game_Battler.prototype.onTurnEnd = function () {
        if (this._hyperInvulnTurns > 0) this._hyperInvulnTurns--;
        // The wall belongs to the party, so it is counted down once a round:
        // by the first of them still standing, whoever that is.
        if ($gameParty && $gameParty._hyperWallTurns > 0) {
            const first = $gameParty.battleMembers().find(m => m && m.isAlive());
            if (first === this) $gameParty._hyperWallTurns--;
        }
        _Game_Battler_onTurnEnd_hyper.call(this);
    };

    const _BattleManager_endBattle_hyper = BattleManager.endBattle;
    BattleManager.endBattle = function (result) {
        LimitBreak.clearBattleState();
        _BattleManager_endBattle_hyper.call(this, result);
    };

    // Invulnerability and the wall, where the damage is actually written: the
    // shield eats everything for its turn, the wall only what is thrown by a
    // hand or a weapon.
    const _Game_Action_executeHpDamage_hyper = Game_Action.prototype.executeHpDamage;
    Game_Action.prototype.executeHpDamage = function (target, value) {
        if (value > 0) {
            if (LimitBreak.isInvulnerable(target)) {
                announce(text('shielded', { actor: target.name() }));
                value = 0;
            } else if (this.isPhysical() && target.isActor && target.isActor() &&
                       LimitBreak.wallTurns() > 0) {
                announce(text('walled', { actor: target.name() }));
                value = 0;
            }
        }
        _Game_Action_executeHpDamage_hyper.call(this, target, value);
    };

    // Nothing lands on a battler under the shield, states included.
    const _Game_Battler_addState_hyper = Game_Battler.prototype.addState;
    Game_Battler.prototype.addState = function (stateId) {
        if (LimitBreak.isInvulnerable(this) && stateId !== 2) return;
        _Game_Battler_addState_hyper.call(this, stateId);
    };
})();
