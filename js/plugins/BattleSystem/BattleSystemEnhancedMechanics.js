// ============================================================================
// Battle System Enhanced - Combat Safety
// For RPG Maker MZ
// ============================================================================

/*:
 * @target MZ
 * @plugindesc v2.1 Mechanics module: health protection, stat requirement fumbles, commands.
 * @author Combined by Claude, modified by OmniLex
 * @pluginName BattleSystemEnhancedMechanics
 *
 * @help
 * ============================================================================
 * BattleSystemEnhancedMechanics, Sub-module
 * ============================================================================
 *
 * Requires BattleSystemEnhanced.js (Core) and sub-modules to be loaded first.
 *
 * Provides the one-shot 1-HP save, the stat requirement
 * fumble roll (<StatReq: STAT N>, window.SkillStatReq), the drain share
 * tags (<DrainRate: n> on an HP/MP drain, <DrainMp: n> on a damaging
 * skill that saps mana), and debug commands.
 *
 * Loading order:
 *   1. BattleSystemEnhanced.js (Core)
 *   2. BattleSystemEnhancedEncounters.js
 *   3. BattleSystemEnhancedState.js
 *   4. BattleSystemEnhancedDeath.js
 *   5. BattleSystemEnhancedMechanics.js (THIS PLUGIN)
 *   6. BattleSystemEnhancedLevelDisplay.js
 */

(() => {
    'use strict';

    if (!window.BattleSystemEnhanced) {
        console.error('BattleSystemEnhancedMechanics: Core plugin not loaded!');
        return;
    }
    const BSE = window.BattleSystemEnhanced;

    // ========================================================================
    // 1. THE ONE-SHOT SAVE
    //
    //   A party member caught in full health by a blow that would kill them
    //   outright is left standing on 1 HP instead. It is a save against being
    //   deleted without a turn to answer, not a save against dying: it asks
    //   only where the character stood BEFORE the hit landed.
    //
    //     - at or above HEALTH_PROTECTION_MIN_HP_RATE of max HP: the blow
    //       leaves them on 1 HP, and the charge is spent.
    //     - below it: the blow kills. A character already worn down dies to
    //       the hit that finishes them, whether or not the charge is unspent.
    //
    //   One charge per party member per battle, cleared at BattleManager.setup
    //   and never carried into a save, and only inside a battle: bleeding out
    //   on the map is its own business. Blood and Oil mode keeps it too - that
    //   mode makes death stick, it does not make a full-health character
    //   deletable in one blow.
    // ========================================================================

    const HEALTH_PROTECTION_MIN_HP_RATE = 1.00;

    BSE.State._healthProtectionUsed = {};

    BSE.Functions.resetHealthProtection = function() {
        BSE.State._healthProtectionUsed = {};
    };

    /** Whether this member still holds their charge for this battle. */
    BSE.Helpers.hasHealthProtection = function(actorId) {
        return !BSE.State._healthProtectionUsed[actorId];
    };

    BSE.Helpers.useHealthProtection = function(actorId) {
        BSE.State._healthProtectionUsed[actorId] = true;
    };

    /**
     * Whether the blow that just landed is the one the save exists for: a
     * battle hit, on a member who stood at full health (100% of max HP)
     * a moment ago, who still holds their charge for this battle.
     */
    function oneShotSaveApplies(actor, hpBeforeHit) {
        const inBattle = ($gameParty && $gameParty.inBattle()) ||
            (typeof window !== 'undefined' && window.MapBattleMode && window.MapBattleMode.isActive && window.MapBattleMode.isActive());
        if (!inBattle) return false;
        if (!(actor.mhp > 0)) return false;
        if (hpBeforeHit < actor.mhp || hpBeforeHit / actor.mhp < HEALTH_PROTECTION_MIN_HP_RATE) return false;
        return BSE.Helpers.hasHealthProtection(actor.actorId());
    }

    // Eris Trial battle (troop 1342, the Eris = enemy 1343 troop): during the
    // first 10 turns the 1-HP protection is ALWAYS on for every party member and
    // is never consumed, so nobody can die while Eris mockingly toys with them.
    const ERIS_TRIAL_TROOP_ID = 1342;
    function erisTrialInvulnerable() {
        return (
            $gameParty.inBattle() &&
            $gameTroop._troopId === ERIS_TRIAL_TROOP_ID &&
            $gameTroop.turnCount() <= 10
        );
    }

    const _Game_Actor_setHp = Game_Actor.prototype.setHp;
    Game_Actor.prototype.setHp = function(hp) {
        const oldHp = this.hp;
        const wasAlive = !this.isDead();
        _Game_Actor_setHp.call(this, hp);

        if (wasAlive && this.isDead() && oldHp > 1 && erisTrialInvulnerable()) {
            // Always survive on 1 HP while Eris toys with the party, and do
            // NOT spend the one-shot charge on it.
            _Game_Actor_setHp.call(this, 1);
        } else if (wasAlive && this.isDead() && oldHp > 1 && oneShotSaveApplies(this, oldHp)) {
            BSE.Helpers.useHealthProtection(this.actorId());
            _Game_Actor_setHp.call(this, 1);
            if (this.result && this.result()) {
                this.result().hpDamage = oldHp - 1;
            }
        }

        // Handle map deaths
        if (oldHp > 0 && this.hp <= 0 && !$gameParty.inBattle()) {
            if (this === $gameParty.members()[0]) {
                this.processMapDeath();
            } else if (this === $gameParty.members()[1]) {
                $gameSystem.setActor2Died(true, this.name());
                $gameMap.requestRefresh();
            }
        }
    };

    // ========================================================================
    // 2. BattleManager - a fresh charge for every fight
    // ========================================================================

    const _BattleManager_setup_HP = BattleManager.setup;
    BattleManager.setup = function(troopId, canEscape, canLose) {
        _BattleManager_setup_HP.call(this, troopId, canEscape, canLose);
        BSE.Functions.resetHealthProtection();
    };

    // ========================================================================
    // 7. ENEMY MERCY: A NON-BOSS <TALK> ENEMY MAY SPARE THE PARTY
    //
    //   On its turn, a <Talk> enemy that is not a <Boss> weighs the fight it is
    //   in and can walk away unharmed, without a corpse, when any of these
    //   hold: it so outclasses the party that finishing them is beneath it
    //   (its own level gap, MERCY_LEVEL_GAP), the
    //   party has already won it over through the talk menu (EnemyTalkSystem's
    //   disposition), or the party is already down a member or fighting on
    //   critical HP and it takes pity rather than finish them off.
    //   MERCY_CHANCE keeps this a "sometimes", not a guarantee, and the roll
    //   only happens for an eligible enemy that still has a turn to act, so a
    //   failed roll is silent and the enemy simply attacks as normal.
    // ========================================================================

    const MERCY_CHANCE = 0.05;
    const MERCY_DISPOSITION_THRESHOLD = 70;
    // Its own threshold: it asks whether the monster is so far past the party
    // that killing them is beneath it. Sparing the party every time they are six levels down
    // would hand them most of the hard band for free.
    const MERCY_LEVEL_GAP = 13;

    function enemyMercyEligible(enemy) {
        if (!enemy || !enemy.isAlive || !enemy.isAlive()) return false;
        if (($gameSystem && $gameSystem._isSandboxMode)) return false;
        const leader = $gameParty.leader();
        if (leader && leader.name() === "Test") return false; // i18n-ignore: playtest character name
        const data = enemy.enemy();
        if (!data) return false;
        const note = data.note || "";
        if (/<Boss>/i.test(note)) return false;
        if (!/<Talk>/i.test(note)) return false;
        if (enemy.isUnrecruitable && enemy.isUnrecruitable()) return false;
        return true;
    }

    function enemyOutclassesParty(enemy) {
        const party = $gameParty.members();
        if (!party.length) return false;
        const enemyLevel = BSE.Helpers.getBattlerLevel(enemy);
        if (enemyLevel <= 0) return false;
        return enemyLevel > BSE.Helpers.getMedianLevel(party) + MERCY_LEVEL_GAP;
    }

    function partyWonEnemyOver(enemy) {
        return !!(enemy.disposition && enemy.disposition() >= MERCY_DISPOSITION_THRESHOLD);
    }

    function partyIsHurting() {
        return $gameParty.members().some(m => m && (m.isDead() || m.isDying()));
    }

    // Which pool of dialogue fits, in priority order: a friendship earned
    // through the talk menu comes first (the rarer, more deliberate reason),
    // then pity for a party already reeling, then simple condescension.
    function mercyReason(enemy) {
        if (partyWonEnemyOver(enemy)) return 'friendly';
        if (partyIsHurting()) return 'pity';
        if (enemyOutclassesParty(enemy)) return 'tooStrong';
        return null;
    }

    function rollEnemyMercy(enemy) {
        if (!enemyMercyEligible(enemy)) return null;
        const reason = mercyReason(enemy);
        if (!reason) return null;
        return Math.random() < MERCY_CHANCE ? reason : null;
    }

    function spareParty(enemy, reason) {
        const pool = BSE.Helpers.bi18nList('mercy.' + reason) || [];
        const line = pool[Math.floor(Math.random() * pool.length)] || '';
        window.skipLocalization = true;
        $gameMessage.add(enemy.name() + ": " + line);
        window.skipLocalization = false;
        // Gone whole, not killed: no corpse, and its map event is removed
        // until the player returns to the map, exactly like a talked-round
        // recruit leaving the field (EnemyTalkSystem.js).
        enemy.hide();
        if ($gameTroop.aliveMembers().length === 0) BattleManager.abort();
    }

    const _Game_Enemy_makeActions_mercy = Game_Enemy.prototype.makeActions;
    Game_Enemy.prototype.makeActions = function() {
        const reason = rollEnemyMercy(this);
        if (reason) {
            this.clearActions();
            spareParty(this, reason);
            return;
        }
        _Game_Enemy_makeActions_mercy.call(this);
    };

    // ========================================================================
    // 8. STAT REQUIREMENT FUMBLES
    // ========================================================================
    // Every skill names a base stat and a floor for it (`<StatReq: INT 14>`,
    // read by window.SkillStatReq in the Core module). Nothing bars a character
    // from carrying or casting a skill they are short on: they simply do not
    // have the grip on it yet, and the action can come apart in their hands.
    //
    // The roll is taken ONCE per action, not once per target, so a spell thrown
    // at the whole troop either lands on all of them or on none. The cost is
    // paid either way - Game_Battler.useItem has already run by the time the
    // action is invoked, and a spell that fizzles halfway out still burns the MP
    // it was pushed with.

    function statReqFumble(action) {
        if (!action || action._statReqFumbled !== undefined) return action ? action._statReqFumbled : false;
        action._statReqFumbled = false;
        const subject = action.subject && action.subject();
        const item = action.item && action.item();
        if (!subject || !item || !action.isSkill || !action.isSkill()) return false;
        if (!window.SkillStatReq) return false;
        const chance = window.SkillStatReq.failChance(subject, item);
        if (chance > 0 && Math.random() < chance) action._statReqFumbled = true;
        return action._statReqFumbled;
    }
    BSE.Helpers.rollStatReqFumble = statReqFumble;

    // Rolled where the action is announced, so the battle log can say what went
    // wrong before the first target is touched.
    const _BattleManager_startAction_statReq = BattleManager.startAction;
    BattleManager.startAction = function() {
        const subject = this._subject;
        const action = subject && subject.currentAction && subject.currentAction();
        if (action) statReqFumble(action);
        _BattleManager_startAction_statReq.call(this);
    };

    const _Window_BattleLog_startAction_statReq = Window_BattleLog.prototype.startAction;
    Window_BattleLog.prototype.startAction = function(subject, action, targets) {
        _Window_BattleLog_startAction_statReq.call(this, subject, action, targets);
        if (action && statReqFumble(action)) {
            const item = action.item();
            const req = window.SkillStatReq.of(item);
            this.push('addText', T('Battle.statReq.fumble', {
                actor: subject.name(),
                skill: item.name,
                stat: window.SkillStatReq.statName(req.stat)
            }));
        }
    };

    // A fumbled action reaches its targets and does nothing to them. The result
    // is left reading as a miss so every HUD, log and animation already written
    // for a miss says the right thing without being taught a new word.
    const _Game_Action_apply_statReq = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function(target) {
        if (statReqFumble(this)) {
            const result = target.result();
            result.clear();
            result.used = true;
            result.missed = true;
            return;
        }
        _Game_Action_apply_statReq.call(this, target);
    };

    // ========================================================================
    // 9. PLUGIN COMMAND FORWARDING
    // ========================================================================

    BSE.Functions.executeDamageActor = function(args) {
        const actorId = parseInt(args.actorId) || 1;
        const amount = parseInt(args.damage) || 0;
        if (amount > 0 && $gameActors.actor(actorId)) {
            const actor = $gameActors.actor(actorId);
            actor.gainHp(-amount);
            if (!$gameParty.inBattle()) {
                $gameTemp.requestAnimation([$gamePlayer], 1229);
                $gameScreen.startFlash([255, 0, 0, 128], 30);
            }
        }
    };

    // ========================================================================
    // 10. PIERCING DAMAGE MECHANICS
    // ========================================================================
    // Piercing weapons, skills, and spells possess distinctive penetration:
    //   1. Guard (Status 2 / isGuard): Inflict half of full damage instead of
    //      heavy guard reduction or 0 damage.
    //   2. Protect / Substitute (Status 19): If an ally is covered by a
    //      substitute, the substitute protector takes full damage AND the
    //      piercing blow punches through to deal half damage to the protected ally.
    //   3. Divine Shield (Status 32): Piercing attacks ignore Divine Shield
    //      completely (bypassing its 100% physical evasion and elemental resistance).
    //   4. Magic Reflection (Status 18): Piercing spells and skills ignore
    //      magic reflection, striking the target directly without reflecting.

    function isPiercingAction(action) {
        if (!action) return false;
        const HC = window.HealthCore;
        if (HC && typeof HC.getActionDamageType === 'function') {
            const subject = action.subject ? action.subject() : null;
            return HC.getActionDamageType(action, subject) === 'Piercing';
        }
        const item = typeof action.item === 'function' ? action.item() : null;
        if (item) {
            const dt = (item.meta && item.meta.DamageType) ||
                (item.note && (item.note.match(/<DamageType:\s*([^>]+)>/i) || [])[1]);
            if (dt && String(dt).trim() === 'Piercing') return true;
        }
        return false;
    }
    BSE.Helpers.isPiercingAction = isPiercingAction;

    // 1. Guard (Status 2): Piercing deals half of full damage
    const _Game_Action_applyGuard_Piercing = Game_Action.prototype.applyGuard;
    Game_Action.prototype.applyGuard = function(damage, target) {
        if (isPiercingAction(this) && damage > 0 && (target.isGuard() || target.isStateAffected(2))) {
            return damage * 0.5;
        }
        return _Game_Action_applyGuard_Piercing.call(this, damage, target);
    };

    // 2. Magic Reflection (Status 18): Piercing ignores reflection
    const _Game_Action_itemMrf_Piercing = Game_Action.prototype.itemMrf;
    Game_Action.prototype.itemMrf = function(target) {
        if (isPiercingAction(this)) {
            return 0;
        }
        return _Game_Action_itemMrf_Piercing.call(this, target);
    };

    // 3. Divine Shield (Status 32): Piercing ignores evasion and damage resistance
    const _Game_Action_itemEva_Piercing = Game_Action.prototype.itemEva;
    Game_Action.prototype.itemEva = function(target) {
        if (isPiercingAction(this) && target && target.isStateAffected && target.isStateAffected(32)) {
            const idx = target._states ? target._states.indexOf(32) : -1;
            if (idx !== -1) {
                target._states.splice(idx, 1);
                const eva = _Game_Action_itemEva_Piercing.call(this, target);
                target._states.splice(idx, 0, 32);
                return eva;
            }
        }
        return _Game_Action_itemEva_Piercing.call(this, target);
    };

    const _Game_Action_makeDamageValue_Piercing = Game_Action.prototype.makeDamageValue;
    Game_Action.prototype.makeDamageValue = function(target, critical) {
        let val;
        if (isPiercingAction(this) && target && target.isStateAffected && target.isStateAffected(32)) {
            const idx = target._states ? target._states.indexOf(32) : -1;
            if (idx !== -1) {
                target._states.splice(idx, 1);
                val = _Game_Action_makeDamageValue_Piercing.call(this, target, critical);
                target._states.splice(idx, 0, 32);
            } else {
                val = _Game_Action_makeDamageValue_Piercing.call(this, target, critical);
            }
        } else {
            val = _Game_Action_makeDamageValue_Piercing.call(this, target, critical);
        }
        if (this._isPiercingPenetration) {
            val = Math.max(1, Math.round(val * 0.5));
        }
        return val;
    };

    // ========================================================================
    // Burst fire: a flurry is not a multiplier
    // ========================================================================
    // A plain attack's damage is read off the attacker's stats, not off the
    // weapon, so every round of a burst used to land for exactly what a
    // greatsword lands for. An assault rifle firing nine times therefore hit
    // nine times as hard as any melee weapon in the game, for the price of
    // ammunition. The burst keeps every one of its hits, its motion and its
    // reports; what it no longer does is multiply the damage by the round
    // count. The whole flurry is worth a little more than one strike, which
    // is what the ammunition and the range are already paying for.
    const BURST_TOTAL = 1.6;

    /**
     * The share of one strike each round of this action's burst carries. 1 for
     * anything that resolves once. Read once per action and remembered: the
     * repeat count shrinks as the magazine empties, and a burst must not hit
     * harder the further into itself it gets.
     */
    const burstShareFor = (action) => {
        if (!action || typeof action.isAttack !== 'function' || !action.isAttack()) return 1;
        if (action._bseBurstShare === undefined) {
            let hits = 1;
            try { hits = action.numRepeats(); } catch (e) { hits = 1; }
            action._bseBurstShare = (hits > 1) ? (BURST_TOTAL / hits) : 1;
        }
        return action._bseBurstShare;
    };
    BSE.Helpers.burstShareFor = burstShareFor;

    const _Game_Action_makeDamageValue_Burst = Game_Action.prototype.makeDamageValue;
    Game_Action.prototype.makeDamageValue = function(target, critical) {
        const value = _Game_Action_makeDamageValue_Burst.call(this, target, critical);
        const share = burstShareFor(this);
        if (share === 1 || !value) return value;
        const scaled = Math.round(value * share);
        return value > 0 ? Math.max(1, scaled) : Math.min(-1, scaled);
    };

    // 4. Protect (Status 19 / Substitute): Piercing hits substitute for full damage and penetrates to protected target for half damage
    const _BattleManager_invokeNormalAction_Piercing = BattleManager.invokeNormalAction;
    BattleManager.invokeNormalAction = function(subject, target) {
        const realTarget = this.applySubstitute(target);
        if (isPiercingAction(this._action) && realTarget && target && realTarget !== target) {
            // Apply full damage to the substitute protector
            this._action.apply(realTarget);
            this._logWindow.displayActionResults(subject, realTarget);

            // Punch through and apply half damage to the protected ally
            this._action._isPiercingPenetration = true;
            this._action.apply(target);
            this._logWindow.displayActionResults(subject, target);
            this._action._isPiercingPenetration = false;
            return;
        }
        _BattleManager_invokeNormalAction_Piercing.call(this, subject, target);
    };

    // ========================================================================
    // 11. WEAPON SCALING DAMAGE CALCULATION
    // ========================================================================
    // Weapons declare their scaling in notes via `<Scale: STAT>` tags
    // (e.g. `<Scale: STR>`, `<Scale: DEX>`, `<Scale: STR>` + `<Scale: DEX>` for MIX,
    // `<Scale: PSI>`, `<Scale: INT>`, etc.).
    // Standard Attack (Skill 1) dynamically reads the weapon's scaling tags to
    // evaluate damage formula based on the character's corresponding attributes.

    // What a plain swing is worth. A normal attack costs nothing, needs no
    // resource and is available every single round, so it is the FLOOR of the
    // damage scale rather than a competitor to the skill list: the median
    // damaging skill in the database is worth about two of it, and the heaviest
    // are worth what the one-shot ceiling allows. Raising these two numbers
    // does not make attacking hit harder in absolute terms - the pace layer
    // holds the size of a hit - it makes every skill in the game worth less.
    const ATTACK_COEFFICIENT = 3;
    const ATTACK_DEF_COEFFICIENT = 0.5;

    function getWeaponScalingStats(subject) {
        // The vector gun's modes can rewrite what the shot is worked out from
        // (Mana bullets reads INT), and VectorGunSystem.js is the only place
        // that is decided.
        const vectorScale = window.VectorGun && window.VectorGun.scaleOverride
            ? window.VectorGun.scaleOverride(subject) : null;
        if (vectorScale) return vectorScale.slice();
        const weapon = (subject && typeof subject.weapons === 'function' && subject.weapons().length > 0)
            ? subject.weapons()[0]
            : null;
        const note = (weapon && weapon.note) ? weapon.note : (subject && subject.note ? subject.note : '');
        const scales = [];
        const regex = /<Scale:\s*([^>]+)>/gi;
        let match;
        while ((match = regex.exec(note)) !== null) {
            const parts = match[1].split(',').map(s => s.trim().toUpperCase());
            scales.push(...parts);
        }
        if (scales.length === 0 && weapon && weapon.meta && weapon.meta.Scale) {
            scales.push(...String(weapon.meta.Scale).split(',').map(s => s.trim().toUpperCase()));
        }
        if (scales.length === 0) {
            scales.push('STR');
        }
        return scales;
    }
    BSE.Helpers.getWeaponScalingStats = getWeaponScalingStats;

    const _Game_Action_evalDamageFormula_Scaling = Game_Action.prototype.evalDamageFormula;
    Game_Action.prototype.evalDamageFormula = function(target) {
        const item = this.item();
        if (item && (item.id === 1 || this.isAttack())) {
            const a = this.subject();
            const b = target;
            if (a) {
                const scales = getWeaponScalingStats(a);
                let statSum = 0;
                let isMagicDef = true;

                scales.forEach(st => {
                    switch (st) {
                        case 'DEX':
                        case 'AGI':
                            statSum += a.agi;
                            isMagicDef = false;
                            break;
                        case 'CON':
                        case 'DEF':
                            statSum += a.def;
                            isMagicDef = false;
                            break;
                        case 'INT':
                        case 'MAT':
                            statSum += a.mat;
                            break;
                        case 'WIS':
                        case 'MDF':
                            statSum += a.mdf;
                            break;
                        case 'PSI':
                        case 'LUK':
                            statSum += a.luk;
                            isMagicDef = false;
                            break;
                        case 'MIX':
                            statSum += (a.atk + a.agi) / 2;
                            isMagicDef = false;
                            break;
                        case 'ARC':
                            statSum += (a.atk + a.mat) / 2;
                            isMagicDef = false;
                            break;
                        case 'STR':
                        case 'ATK':
                        default:
                            statSum += a.atk;
                            isMagicDef = false;
                            break;
                    }
                });

                const attackerStat = statSum / scales.length;
                const targetDef = (isMagicDef && b) ? b.mdf : ((b && b.def) ? b.def : 0);
                const level = (typeof a.level === 'number' && Number.isFinite(a.level)) ? a.level : 1;
                const sign = [3, 4].includes(item.damage.type) ? -1 : 1;
                // ATTACK_COEFFICIENT and ATTACK_DEF_COEFFICIENT are the same two
                // numbers Skills.json 1 carries, and they have to stay the same
                // two: the D&D layer weighs every skill against the plain attack
                // by evaluating THAT row (dndReferenceDamage), so a swing written
                // heavier here than there would read as a skill worth less than
                // one. They are deliberately low - a free swing is the floor the
                // whole skill list is measured against, not a rival to it.
                const val = Math.max((attackerStat * ATTACK_COEFFICIENT) * (1 + level * 0.05) -
                    targetDef * ATTACK_DEF_COEFFICIENT, 1) * sign;
                return isNaN(val) ? 0 : val;
            }
        }
        return _Game_Action_evalDamageFormula_Scaling.call(this, target);
    };

    // ========================================================================
    // Life and mana drain
    // ========================================================================
    // A life-stealing skill used to carry a "Recover HP" effect, which RMMZ
    // applies to the TARGET: the vampire healed whoever it bit. Those skills
    // are HP drains (damage type 5) now, and the fraction they used to recover
    // is kept as <DrainRate: n>, read here. A skill that saps mana while it
    // deals HP damage carries <DrainMp: n> instead and moves that share of the
    // damage out of the target's MP and into the user's.

    function drainMetaRate(item, tag) {
        if (!item || !item.meta) return null;
        const raw = item.meta[tag];
        if (raw === undefined || raw === true) return null;
        const value = Number(String(raw).trim());
        if (!Number.isFinite(value) || value <= 0) return null;
        return value;
    }

    function drainBeneficiary(action) {
        return action._reflectionTarget || action.subject();
    }

    const _Game_Action_gainDrainedHp = Game_Action.prototype.gainDrainedHp;
    Game_Action.prototype.gainDrainedHp = function(value) {
        const rate = drainMetaRate(this.item(), 'DrainRate');
        const amount = rate === null ? value : Math.floor(value * rate);
        _Game_Action_gainDrainedHp.call(this, amount);
    };

    const _Game_Action_gainDrainedMp = Game_Action.prototype.gainDrainedMp;
    Game_Action.prototype.gainDrainedMp = function(value) {
        const rate = drainMetaRate(this.item(), 'DrainRate');
        const amount = rate === null ? value : Math.floor(value * rate);
        _Game_Action_gainDrainedMp.call(this, amount);
    };

    const _Game_Action_executeHpDamage_Drain = Game_Action.prototype.executeHpDamage;
    Game_Action.prototype.executeHpDamage = function(target, value) {
        _Game_Action_executeHpDamage_Drain.call(this, target, value);
        const rate = drainMetaRate(this.item(), 'DrainMp');
        if (rate === null || !(value > 0)) return;
        const wanted = Math.floor(value * rate);
        const taken = Math.min(wanted, target.mp);
        if (taken <= 0) return;
        target.gainMp(-taken);
        const gainTarget = drainBeneficiary(this);
        if (gainTarget) gainTarget.gainMp(taken);
    };


    // ========================================================================
    // The vector gun's operating modes
    // ========================================================================
    // Em's gun is the one weapon whose behaviour is set by the player rather
    // than by its note tags, and VectorGunSystem.js holds what it is set to.
    // Three of the five modes are answered here: the shot's damage is cut when
    // it is fanned across body parts, the bound spell rides the shot, and what
    // a landed shot leaves behind (the recoil throw, the printed card) is
    // handed back to the same file. Mana bullets is answered by the scaling
    // block above, Wide shots by Health_Core's damage-type reading.

    const _Game_Action_makeDamageValue_Vector = Game_Action.prototype.makeDamageValue;
    Game_Action.prototype.makeDamageValue = function(target, critical) {
        const value = _Game_Action_makeDamageValue_Vector.call(this, target, critical);
        const VG = window.VectorGun;
        if (!VG || !VG.damageRate) return value;
        // The target is handed over as well: the Executioner mode reads how much
        // of it is left, and nothing else can answer that from the action alone.
        const rate = VG.damageRate(this.subject(), this, target);
        return rate === 1 ? value : Math.round(value * rate);
    };

    const _BattleManager_invokeNormalAction_Vector = BattleManager.invokeNormalAction;
    BattleManager.invokeNormalAction = function(subject, target) {
        _BattleManager_invokeNormalAction_Vector.call(this, subject, target);
        const VG = window.VectorGun;
        if (!VG) return;
        const action = this._action;
        VG.onShotLanded(subject, target, action);
        // Spellblaster: the bound spell is paid for and cast on the same
        // target, as its own line in the log. With no mana it never comes back
        // and the shot stays an ordinary one.
        const extra = VG.spellblasterAction(subject, action);
        if (!extra) return;
        this._action = extra;
        const item = extra.item();
        if (item && item.animationId > 0 && this._logWindow) {
            this._logWindow.push('showAnimation', subject, [target], item.animationId);
        }
        extra.apply(target);
        if (this._logWindow) this._logWindow.displayActionResults(subject, target);
        this._action = action;
    };

})();
