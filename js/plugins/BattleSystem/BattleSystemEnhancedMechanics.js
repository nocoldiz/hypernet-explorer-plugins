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

    // Eris boss battle (TrialSystem.js owns which troop that is): during the
    // first 10 turns the 1-HP protection is ALWAYS on for every party member and
    // is never consumed, so nobody can die while Eris mockingly toys with them.
    function erisTrialInvulnerable() {
        const eris = window.ErisChallengeBattle;
        return !!(eris && eris.isToying && eris.isToying());
    }

    const _Game_Actor_setHp = Game_Actor.prototype.setHp;
    Game_Actor.prototype.setHp = function(hp) {
        const oldHp = this.hp;
        const wasAlive = !this.isDead();
        _Game_Actor_setHp.call(this, hp);

        if (wasAlive && this.isDead() && erisTrialInvulnerable()) {
            // Always survive on 1 HP while Eris toys with the party, even a
            // hit taken already on 1 HP, and do NOT spend the one-shot charge.
            _Game_Actor_setHp.call(this, 1);
        } else if (wasAlive && this.isDead() && oldHp > 1 && oneShotSaveApplies(this, oldHp)) {
            BSE.Helpers.useHealthProtection(this.actorId());
            _Game_Actor_setHp.call(this, 1);
            if (this.result && this.result()) {
                this.result().hpDamage = oldHp - 1;
            }
        }

        // Handle map deaths. Going down is filed against whoever it was, but the
        // death sequence itself belongs to the WHOLE party being on the ground:
        // the same rule a battle is lost by. So the leader dropping while the
        // others still stand is only a knockout (processMapDeath says the same),
        // and a companion dropping last - with the leader already down - is what
        // finishes the party off, which nothing used to notice at all.
        if (oldHp > 0 && this.hp <= 0 && !$gameParty.inBattle()) {
            const members = $gameParty.members();
            const slot = members.indexOf(this);
            if (slot === 1) {
                $gameSystem.setActor2Died(true, this.name());
                $gameMap.requestRefresh();
            } else if (slot === 2 && $gameSystem.setActor3Died) {
                $gameSystem.setActor3Died(true, this.name());
                $gameMap.requestRefresh();
            }
            const leader = members[0];
            if (leader && members.every(m => !m || m.isDead())) {
                leader.processMapDeath();
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
            // With two requirements the one furthest under is the one named.
            const req = window.SkillStatReq.check(subject, item) || window.SkillStatReq.of(item);
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
        // Half of an absorbed or nullified hit is still absorbed or nullified.
        if (this._isPiercingPenetration && val > 0) {
            val = Math.max(1, Math.round(val * 0.5));
        } else if (this._isPiercingPenetration && val < 0) {
            val = Math.min(-1, Math.round(val * 0.5));
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
        // A second hand's follow-up is one blow of its own, never a round of
        // the main hand's burst (ItemSystemEquipment, "Both hands swing").
        if (typeof action.isOffHandSwing === 'function' && action.isOffHandSwing()) return 1;
        if (action._bseBurstShare === undefined) {
            let hits = 1;
            try { hits = action.numRepeats(); } catch (e) { hits = 1; }
            // ...and the extra hands are not rounds of the burst either: only
            // the main hand's own repeats are shared out.
            if (typeof action.handExtraSwings === 'function') {
                try { hits -= Math.max(0, action.handExtraSwings() || 0); } catch (e) { /* no hands rule */ }
            }
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
    // A weapon on DEX alone never reads STR; one on two stats splits the swing
    // equally between them. Every firearm is on DEX, the heavy ones (minigun,
    // HMG, anti-material rifle) on STR and DEX: tools/weapons/gen_firearm_scaling.js.

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
                // The weapon's own attack power lands on STR (params[2]), so a
                // stat other than STR is handed it back: a gun that scales on DEX
                // alone still hits harder than an empty hand, and never through
                // STR. With two stats each carries its half of it.
                const weaponPower = (typeof a.weaponParamTotal === 'function') ? (a.weaponParamTotal(2) || 0) : 0;

                scales.forEach(st => {
                    if (!['STR', 'ATK', 'MIX', 'ARC'].includes(st)) statSum += weaponPower;
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

    // ===== LifeLink: shared and guarded HP damage =====
    // Two states bend where a blow's HP damage lands, before it is dealt:
    //
    //   - Life Link (state 39): HP damage on a linked battler is split evenly
    //     across every living linked member of the SAME side, the struck one
    //     included. It works on either side: a party bound by Unity Formation
    //     or SoulBond spreads a big hit thin, a troop chained by GraveChain
    //     carries every single-target blow to all its linked members.
    //   - Guardian Bond (state 92): the holder takes GUARDIAN_SHARE of the HP
    //     damage aimed at any living ally of its side (the sturdiest guardian
    //     answers when there are several), before Life Link splits the rest.
    //
    // The floor: a share never takes a battler who was NOT the one hit below
    // LINK_FLOOR_RATE of their max HP (at least 1 HP). Whatever a bystander has
    // no room for stays with the struck battler, so the link moves damage, it
    // never creates or loses any, and it never kills anybody on its own.
    //
    // Shares are written with setHp, not gainHp, so the bystander's own action
    // result (and the popup it drives) is left alone; the battle log says what
    // moved. MapBattleMode runs actions through BattleManager.processTurn and
    // Game_Action.apply like Scene_Battle does, and hands BattleManager its own
    // log window, so this one hook serves both modes.

    const LIFE_LINK_STATE_ID = 39;
    const GUARDIAN_STATE_ID = 92;
    const GUARDIAN_SHARE = 0.5;
    const LINK_FLOOR_RATE = 0.10;

    function linkInBattle() {
        if (typeof $gameParty !== 'undefined' && $gameParty && $gameParty.inBattle && $gameParty.inBattle()) return true;
        const MBM = typeof window !== 'undefined' ? window.MapBattleMode : null;
        return !!(MBM && MBM.isActive && MBM.isActive());
    }

    function linkHolds(battler, stateId) {
        return !!battler && typeof battler.isStateAffected === 'function' && battler.isStateAffected(stateId);
    }

    function linkFloor(battler) {
        return Math.max(1, Math.ceil((battler.mhp || 0) * LINK_FLOOR_RATE));
    }

    function linkRoom(battler) {
        return Math.max(0, Math.floor(battler.hp - linkFloor(battler)));
    }

    function linkedFriends(target, stateId) {
        const unit = typeof target.friendsUnit === 'function' ? target.friendsUnit() : null;
        if (!unit || typeof unit.aliveMembers !== 'function') return [];
        return unit.aliveMembers().filter(m => m && m !== target && linkHolds(m, stateId));
    }

    function linkLog(key, params) {
        const log = typeof BattleManager !== 'undefined' ? BattleManager._logWindow : null;
        if (!log || typeof log.push !== 'function' || typeof window.T !== 'function') return;
        const text = window.T(key, params);
        if (text) log.push('addText', text);
    }

    function linkName(battler) {
        return typeof battler.name === 'function' ? battler.name() : '';
    }

    /** Moves the shares off a blow of `value` HP on `target`; returns what the target still takes. */
    function spreadLinkedDamage(target, value) {
        if (!(value > 0) || !target || !linkInBattle()) return value;
        let left = value;

        if (!linkHolds(target, GUARDIAN_STATE_ID)) {
            const guardian = linkedFriends(target, GUARDIAN_STATE_ID)
                .filter(g => linkRoom(g) > 0)
                .sort((a, b) => b.hp - a.hp)[0];
            if (guardian) {
                const amount = Math.min(Math.floor(left * GUARDIAN_SHARE), linkRoom(guardian));
                if (amount > 0) {
                    guardian.setHp(guardian.hp - amount);
                    left -= amount;
                    linkLog('Battle.lifeLink.guarded', { guardian: linkName(guardian), name: linkName(target), amount: amount });
                }
            }
        }

        if (linkHolds(target, LIFE_LINK_STATE_ID)) {
            const mates = linkedFriends(target, LIFE_LINK_STATE_ID);
            const share = mates.length ? Math.floor(left / (mates.length + 1)) : 0;
            let moved = 0;
            let count = 0;
            if (share > 0) {
                for (const mate of mates) {
                    const amount = Math.min(share, linkRoom(mate));
                    if (amount <= 0) continue;
                    mate.setHp(mate.hp - amount);
                    moved += amount;
                    count++;
                }
            }
            if (moved > 0) {
                left -= moved;
                linkLog('Battle.lifeLink.shared', { name: linkName(target), amount: moved, count: count });
            }
        }
        return left;
    }

    if (typeof Game_Action !== 'undefined' && Game_Action.prototype && Game_Action.prototype.executeHpDamage) {
        const _Game_Action_executeHpDamage_LifeLink = Game_Action.prototype.executeHpDamage;
        Game_Action.prototype.executeHpDamage = function(target, value) {
            _Game_Action_executeHpDamage_LifeLink.call(this, target, spreadLinkedDamage(target, value));
        };
    }

    // The skill card's Special tags (window.SkillDetails.registerSpecial): a
    // skill that hands out either state says so in the card's right column.
    function linkSpecialsOf(skill) {
        const out = [];
        if (!skill || typeof window.T !== 'function') return out;
        const onFoes = skill.scope >= 1 && skill.scope <= 6;
        const onUser = skill.scope === 11;
        const grants = (id) => (skill.effects || []).some(e => e && e.code === 21 && e.dataId === id);
        const entry = (nameKey, descKey) => ({ name: window.T(nameKey), desc: window.T(descKey) });
        if (grants(LIFE_LINK_STATE_ID)) {
            out.push(onFoes ? entry('SkillsMenu.specialName.lifeLinkFoes', 'SkillsMenu.special.lifeLinkFoes')
                : entry('SkillsMenu.specialName.lifeLinkAllies', 'SkillsMenu.special.lifeLinkAllies'));
        }
        if (grants(GUARDIAN_STATE_ID) && !onFoes) {
            out.push(onUser ? entry('SkillsMenu.specialName.guardianSelf', 'SkillsMenu.special.guardianSelf')
                : entry('SkillsMenu.specialName.guardian', 'SkillsMenu.special.guardian'));
        }
        return out;
    }
    let linkSpecialsRegistered = false;
    function linkRegisterSpecials() {
        if (linkSpecialsRegistered) return;
        const svc = window.SkillDetails;
        if (!svc || typeof svc.registerSpecial !== 'function') return;
        svc.registerSpecial(linkSpecialsOf);
        linkSpecialsRegistered = true;
    }
    // CategorizedBattleSkills loads after this plugin: register once it exists.
    linkRegisterSpecials();
    if (!linkSpecialsRegistered && typeof Scene_Boot !== 'undefined' && Scene_Boot.prototype && Scene_Boot.prototype.start) {
        const _Scene_Boot_start_link = Scene_Boot.prototype.start;
        Scene_Boot.prototype.start = function() {
            linkRegisterSpecials();
            _Scene_Boot_start_link.apply(this, arguments);
        };
    }

    window.LifeLink = {
        STATE_ID: LIFE_LINK_STATE_ID,
        GUARDIAN_STATE_ID: GUARDIAN_STATE_ID,
        GUARDIAN_SHARE: GUARDIAN_SHARE,
        FLOOR_RATE: LINK_FLOOR_RATE,
        floorOf: linkFloor,
        spread: spreadLinkedDamage,
        specialsOf: linkSpecialsOf,
        registerSpecials: linkRegisterSpecials,
    };
    // ===== end LifeLink =====


    // ========================================================================
    // The vector gun's operating modes
    // ========================================================================
    // Em's gun is the one weapon whose behaviour is set by the player rather
    // than by its note tags, and VectorGunSystem.js holds what it is set to.
    // Two of the modes are answered here: the shot's damage is cut when it is
    // fanned across body parts, and what a landed shot leaves behind (the
    // recoil throw, the printed card) is handed back to the same file. Mana
    // bullets is answered by the scaling block above, Wide shots by
    // Health_Core's damage-type reading, and the Solomon incantation by the
    // same damageRate call, which reads a spell as readily as a shot.

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
    };

    // ========================================================================
    // State messages on the map are toasts, not dialogue
    // ========================================================================
    // Game_Actor.showAddedStates / showRemovedStates push their line straight
    // into $gameMessage. Off the battlefield nothing consumes that queue right
    // away, so the lines sit there until the next event opens a window, where
    // they are printed above (and duplicated into) whatever the NPC was about
    // to say. They are status readouts, so they go through the one
    // notification service instead. The text is still the state's own
    // localized message, nothing is hardcoded here.

    function showStateMessage(text, severity) {
        const toast = window.ParchmentToast;
        if (!toast || typeof toast.show !== 'function') return;
        toast.show(text, { severity: severity, key: text });
    }

    Game_Actor.prototype.showAddedStates = function() {
        for (const state of this.result().addedStateObjects()) {
            if (state.message1) {
                showStateMessage(state.message1.format(this._name), 'warning');
            }
        }
    };

    Game_Actor.prototype.showRemovedStates = function() {
        for (const state of this.result().removedStateObjects()) {
            if (state.message4) {
                showStateMessage(state.message4.format(this._name), 'info');
            }
        }
    };

    // ========================================================================
    // <SelfState: id[, chance]> - a mark the move leaves on its own user
    // ========================================================================
    // Some states only ever mean something on the battler that used the skill:
    // Combo Ready is the opening the user has read, Double Money/Items is a
    // party ability that does nothing at all sitting on an enemy. RMMZ effects
    // always land on the target, so those skills were quietly handing the
    // bonus to the wrong side. The note tag says it plainly instead. The roll
    // happens once per action, not once per target, and only if the action
    // connected with someone.

    const SELF_STATE_TAG = /<SelfState:\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?>/i;

    function selfStateOf(item) {
        if (!item || !item.note) return null;
        const m = item.note.match(SELF_STATE_TAG);
        if (!m) return null;
        const chance = m[2] === undefined ? 1 : Number(m[2]);
        return { stateId: Number(m[1]), chance: isNaN(chance) ? 1 : chance };
    }

    const _Game_Action_apply_selfState = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function(target) {
        _Game_Action_apply_selfState.call(this, target);
        const mark = selfStateOf(this.item());
        if (!mark || this._selfStateDone) return;
        if (!target || !target.result().isHit()) return;
        this._selfStateDone = true;
        if (Math.random() >= mark.chance) return;
        const subject = this.subject();
        if (subject) subject.addState(mark.stateId);
    };

    // ===== PartialFixes: <ActionFail: n> stumbles and the Provoke taunt =====
    //
    // <ActionFail: 0.25> on a state (Unbalanced) gives whoever holds it that
    // chance to lose each action it takes. It is the stat fumble's twin: rolled
    // once per action where the action is announced, read out in the log, and
    // every target is left reading a miss. The cost is spent either way. A
    // stat fumble that already took the action is never doubled by a stumble.
    //
    // Provoke landing on an opponent remembers who threw it. While the state
    // holds, that battler's single-target actions against the other side are
    // forced onto the provoker. MapBattleMode honours it: its AI walks toward
    // the provoker, and a forced target out of reach is never aimed at.

    const ACTION_FAIL_TAG = /<ActionFail:\s*([\d.]+)\s*>/i;
    const PROVOKE_STATE_ID = 20;
    const _actionFailCache = {};

    function stateActionFail(state) {
        if (!state) return 0;
        if (_actionFailCache[state.id] !== undefined) return _actionFailCache[state.id];
        const m = String(state.note || '').match(ACTION_FAIL_TAG);
        const v = m ? Math.max(0, Math.min(1, Number(m[1]) || 0)) : 0;
        _actionFailCache[state.id] = v;
        return v;
    }

    // Two sources stack as independent rolls, never past certainty.
    function actionFailChance(battler) {
        const states = battler && typeof battler.states === 'function' ? battler.states() : null;
        if (!Array.isArray(states)) return 0;
        let keep = 1;
        for (const st of states) keep *= 1 - stateActionFail(st);
        return 1 - keep;
    }
    BSE.Helpers.actionFailChance = actionFailChance;

    function rollActionFail(action) {
        if (!action) return false;
        if (action._actionFailed !== undefined) return action._actionFailed;
        action._actionFailed = false;
        const subject = action.subject && action.subject();
        const item = action.item && action.item();
        if (!subject || !item) return false;
        if (action.isGuard && action.isGuard()) return false;
        if (statReqFumble(action)) return false;
        const chance = actionFailChance(subject);
        if (chance > 0 && Math.random() < chance) action._actionFailed = true;
        return action._actionFailed;
    }
    BSE.Helpers.rollActionFail = rollActionFail;

    const _BattleManager_startAction_actionFail = BattleManager.startAction;
    BattleManager.startAction = function() {
        const subject = this._subject;
        const action = subject && subject.currentAction && subject.currentAction();
        if (action) rollActionFail(action);
        _BattleManager_startAction_actionFail.call(this);
    };

    const _Window_BattleLog_startAction_actionFail = Window_BattleLog.prototype.startAction;
    Window_BattleLog.prototype.startAction = function(subject, action, targets) {
        _Window_BattleLog_startAction_actionFail.call(this, subject, action, targets);
        if (action && rollActionFail(action)) {
            this.push('addText', T('Battle.actionFail.stumble', {
                actor: subject.name(),
                skill: action.item().name
            }));
        }
    };

    const _Game_Action_apply_actionFail = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function(target) {
        if (rollActionFail(this)) {
            const result = target.result();
            result.clear();
            result.used = true;
            result.missed = true;
            return;
        }
        // Whoever is applying this action is who a Provoke it lands came from.
        const prev = BSE.State._applyingSubject;
        BSE.State._applyingSubject = this.subject();
        try {
            _Game_Action_apply_actionFail.call(this, target);
        } finally {
            BSE.State._applyingSubject = prev;
        }
    };

    function battlerKey(b) {
        if (!b) return null;
        if (b.isActor && b.isActor()) return 'a' + b.actorId();
        if (b.isEnemy && b.isEnemy()) return 'e' + b.index();
        return null;
    }

    // Headless harnesses load this file without the battler classes.
    const BattlerProto = typeof Game_Battler !== 'undefined' ? Game_Battler.prototype : {};
    const _Game_Battler_addState_provoke = BattlerProto.addState;
    BattlerProto.addState = function(stateId) {
        _Game_Battler_addState_provoke.call(this, stateId);
        if (stateId !== PROVOKE_STATE_ID || !this.isStateAffected(PROVOKE_STATE_ID)) return;
        const from = BSE.State._applyingSubject;
        const opposed = from && from !== this && from.isActor && this.isActor &&
            from.isActor() !== this.isActor();
        this._provokerKey = opposed ? battlerKey(from) : null;
    };

    // The battler that provoked this one, while it is provoked and still up.
    BattlerProto.provoker = function() {
        if (!this._provokerKey || !this.isStateAffected(PROVOKE_STATE_ID)) return null;
        const unit = this.opponentsUnit && this.opponentsUnit();
        if (!unit) return null;
        const b = unit.members().find(m => battlerKey(m) === this._provokerKey);
        return b && b.isAlive() ? b : null;
    };

    function provokedTarget(action) {
        const subject = action.subject();
        if (!subject || typeof subject.provoker !== 'function') return null;
        const provoker = subject.provoker();
        if (!provoker) return null;
        if (!action.item() || action.isForUser() || !action.isForOpponent()) return null;
        if (!action.isForOne() || action.isForRandom()) return null;
        if (subject.isConfused && subject.isConfused() && !action._forcing) return null;
        const MBM = window.MapBattleMode;
        if (MBM && MBM.isActive && MBM.isActive() && MBM.canReach &&
            !MBM.canReach(subject, provoker, MBM.actionRange(action), MBM.actionMinRange(action))) {
            return null;
        }
        return provoker;
    }
    BSE.Helpers.provokedTarget = provokedTarget;

    const _Game_Action_makeTargets_provoke = Game_Action.prototype.makeTargets;
    Game_Action.prototype.makeTargets = function() {
        const targets = _Game_Action_makeTargets_provoke.call(this);
        const provoker = provokedTarget(this);
        if (!provoker) return targets;
        const n = Math.max(1, targets.length);
        return Array.from({ length: n }, () => provoker);
    };


    // ===== MindControl: psychic action control =====
    //
    // The PsychicAbilities family that takes hold of what a battler does, not
    // of what it is. Every one of them is a state; the code below is what the
    // state means.
    //
    //   Looped    (67) repeats the last action it took, on the same target
    //                  where that target still stands, for 1 to 3 of its own
    //                  actions. Fails on a battler that has not acted yet in
    //                  this fight. Bosses shrug it off.
    //   Sealed    (68) the last skill it used is sealed while the state holds.
    //   Rebound   (69) on the user: the next skill an opponent lands on them
    //                  is thrown back at whoever cast it, then the state ends.
    //   Puppeted  (70) the caster picks its next move off its own list, and
    //                  the move is aimed at the puppet's own side.
    //   Turncoat  (71) its next action is aimed at its own side.
    //   Echo      (72) on the user: the next skill they use fires a second,
    //                  free time at the same target, then the state ends.
    //   Mind Read (73) its next action is rolled the moment the state lands,
    //                  read out in the log, and then held to.
    //
    // The forced action is built after makeActions, wrapped outermost once
    // every plugin has loaded (Scene_Boot.start), so nothing that picks a move
    // later (MapBattleMode's ally items) can overwrite it. A party member held
    // by Looped, Puppeted or Turncoat cannot take input: the turn queue then
    // runs the forced action itself (IndividualBattleTurns' canInput false
    // path). MapBattleMode reads _mcKeepTarget to keep the forced target when
    // it is in reach, aims through the action's own units so a turned action
    // walks toward the right side, and walks a forced party member the way it
    // walks its own CPU battlers (window.MindControl.isForced).
    //
    // The per-battler marks are transient and cleared when a fight starts.

    const MC = {
        LOOP: 67, SEAL: 68, REBOUND: 69, PUPPET: 70, TURNCOAT: 71, ECHO: 72, MINDREAD: 73
    };
    const MC_STATES = Object.values(MC);
    // Control the boss's whole will: a boss is never taken over.
    const MC_BOSS_PROOF = [MC.LOOP, MC.PUPPET, MC.TURNCOAT];
    const MC_PUPPET_CHOICES = 8;
    let mcApplying = null;
    const mcAnnounced = new Set();

    const mcRandInt = (n) => (typeof Math.randomInt === 'function' ? Math.randomInt(n) : Math.floor(Math.random() * n));

    function mcMbmActive() {
        const MBM = window.MapBattleMode;
        return !!(MBM && MBM.isActive && MBM.isActive());
    }

    function mcInBattle() {
        return !!(($gameParty && $gameParty.inBattle && $gameParty.inBattle()) || mcMbmActive());
    }

    function mcLog(text) {
        if (!text) return;
        const log = BattleManager._logWindow;
        if (log && typeof log.push === 'function') log.push('addText', text);
    }

    // One line per cause per action, however many hits the action has.
    function mcLogOnce(key, text) {
        const action = BattleManager._action;
        const k = key + '|' + (action && action._mcSerial !== undefined ? action._mcSerial : '-');
        if (mcAnnounced.has(k)) return;
        mcAnnounced.add(k);
        mcLog(text);
    }
    let mcActionSerial = 0;

    const mcT = (key, params) => T('Battle.mindControl.' + key, params || {});

    function mcItemOf(spec) {
        if (!spec) return null;
        return spec.isSkill ? $dataSkills[spec.itemId] : $dataItems[spec.itemId];
    }

    function mcIsBoss(battler) {
        if (!battler || !battler.isEnemy || !battler.isEnemy()) return false;
        const data = battler.enemy && battler.enemy();
        return !!(data && /<Boss>/i.test(data.note || ''));
    }

    function mcClear(battler) {
        battler._mcLast = null;
        battler._mcLoop = null;
        battler._mcSealSkill = 0;
        battler._mcPuppet = null;
        battler._mcPreRolled = null;
        battler._mcFreeCast = false;
    }

    // What a battler did last in THIS fight: the item and where it went.
    // Recorded once the targets are known, so a random pick is pinned to the
    // body it actually hit.
    function mcRecordAction(subject, action, targets) {
        if (!subject || !action || !action.item()) return;
        const t = (targets || [])[0];
        let target = null;
        if (t && t !== subject && t.index) {
            const friend = (t.isActor && subject.isActor) ? t.isActor() === subject.isActor() : false;
            target = { friend, index: t.index() };
        }
        subject._mcLast = { itemId: action.item().id, isSkill: action.isSkill(), target };
    }

    // The side the item's own scope aims at, before anything turns it.
    function mcNaturalFriend(item) {
        if (!item) return false;
        return [7, 8, 9, 10, 11, 12, 13].includes(item.scope);
    }

    // Aims a single-target action: the remembered body when it is still a
    // valid target, otherwise a random valid one (never the user itself while
    // anyone else is there).
    function mcAim(action, pref) {
        if (!action.item() || action.isForUser() || !action.isForOne() || action.isForRandom()) return;
        const unit = action.isForOpponent() ? action.opponentsUnit() : action.friendsUnit();
        if (!unit) return;
        const members = unit.members();
        const wantsDead = action.isForDeadFriend();
        const ok = b => b && (wantsDead ? b.isDead() : b.isAlive());
        let index = -1;
        if (pref && pref.index >= 0 && ok(members[pref.index])) index = pref.index;
        if (index < 0) {
            let pool = members.filter(ok);
            const others = pool.filter(b => b !== action.subject());
            if (others.length) pool = others;
            if (pool.length) index = members.indexOf(pool[mcRandInt(pool.length)]);
        }
        if (index >= 0) {
            action.setTarget(index);
            action._mcKeepTarget = true;
        }
    }

    function mcBuild(battler, spec, kind, swap) {
        const item = mcItemOf(spec);
        if (!item || !battler.canUse(item)) return null;
        const action = new Game_Action(battler);
        if (spec.isSkill) action.setSkill(item.id); else action.setItem(item.id);
        if (swap) action._mcSwap = true;
        action._mcForced = kind;
        mcAim(action, spec.target);
        return action;
    }

    function mcSetOnly(battler, action) {
        battler.clearActions();
        battler._actions = [action];
    }

    // A party member denied input who has nothing forced left still swings.
    function mcFallbackAttack(battler, swap) {
        const action = new Game_Action(battler);
        action.setAttack();
        if (swap) action._mcSwap = true;
        action._mcForced = 'fallback';
        mcAim(action, null);
        mcSetOnly(battler, action);
    }

    function mcForce(battler) {
        if (!battler.canMove || !battler.canMove()) return;
        if (battler.isStateAffected(MC.PUPPET) && battler._mcPuppet) {
            const pick = battler._mcPuppet;
            battler._mcPuppet = null;
            const action = mcBuild(battler, pick, 'puppet', true);
            if (action) { mcSetOnly(battler, action); return; }
        }
        if (battler.isStateAffected(MC.LOOP) && battler._mcLoop) {
            const loop = battler._mcLoop;
            const action = mcBuild(battler, loop, 'loop', loop.swap);
            const item = mcItemOf(loop);
            if (action) {
                mcSetOnly(battler, action);
                mcLog(mcT('loopRepeat', { target: battler.name(), skill: item ? item.name : '' }));
                return;
            }
            mcLog(mcT('loopBreaks', { target: battler.name(), skill: item ? item.name : '' }));
            battler.removeState(MC.LOOP);
        }
        if (battler.isActor() && mcHeld(battler) && !battler._actions.some(a => a && a.item())) {
            mcFallbackAttack(battler, battler.isStateAffected(MC.TURNCOAT));
        }
    }

    // Turncoat: whatever was chosen goes the other way.
    function mcTurn(battler) {
        if (!battler.isStateAffected(MC.TURNCOAT)) return;
        let turned = false;
        for (const action of battler._actions || []) {
            if (!action || !action.item() || action.isForUser()) continue;
            if (action._mcSwap) { turned = true; continue; }
            action._mcSwap = true;
            mcAim(action, null);
            turned = true;
        }
        if (turned) mcLog(mcT('turncoat', { target: battler.name() }));
    }

    // Whether this battler's next action is not its own to choose.
    function mcHeld(battler) {
        if (!battler || !battler.isStateAffected) return false;
        return (battler.isStateAffected(MC.LOOP) && !!battler._mcLoop) ||
            (battler.isStateAffected(MC.PUPPET) && !!battler._mcPuppet) ||
            battler.isStateAffected(MC.TURNCOAT);
    }

    function mcWrapMakeActions(Klass) {
        const inner = Klass.prototype.makeActions;
        if (inner._mcWrapped) return;
        const wrapped = function() {
            if (!mcInBattle()) { inner.call(this); return; }
            const pre = this._mcPreRolled;
            this._mcPreRolled = null;
            if (pre && pre.length && pre.every(a => a && a.item() && a.isValid())) {
                this._actions = pre;
            } else {
                inner.call(this);
                if (!this._actions || !this._actions.length) return; // spared, or no turn at all
                mcForce(this);
            }
            mcTurn(this);
        };
        wrapped._mcWrapped = true;
        Klass.prototype.makeActions = wrapped;
    }

    // Installed once everything else has loaded, so it is the outermost word
    // on what a battler does with its turn.
    function mcInstallLate() {
        if (typeof Game_Enemy !== 'undefined') mcWrapMakeActions(Game_Enemy);
        if (typeof Game_Actor !== 'undefined') mcWrapMakeActions(Game_Actor);
        mcRegisterSpecial();
    }

    // The skill card's Special column: what each of these states does to
    // whoever a skill puts it on.
    const MC_SPECIAL_KEYS = {
        [MC.LOOP]: 'mcLoop', [MC.SEAL]: 'mcSeal', [MC.REBOUND]: 'mcRebound', [MC.PUPPET]: 'mcPuppet',
        [MC.TURNCOAT]: 'mcTurncoat', [MC.ECHO]: 'mcEcho', [MC.MINDREAD]: 'mcMindRead'
    };
    function mcSpecials(skill) {
        const out = [];
        for (const eff of (skill && skill.effects) || []) {
            const key = eff && eff.code === 21 && MC_SPECIAL_KEYS[eff.dataId];
            if (key) out.push({ name: T('SkillsMenu.specialName.' + key), desc: T('SkillsMenu.special.' + key) });
        }
        return out;
    }
    let mcSpecialRegistered = false;
    function mcRegisterSpecial() {
        const SD = window.SkillDetails;
        if (mcSpecialRegistered || !SD || typeof SD.registerSpecial !== 'function') return;
        SD.registerSpecial(mcSpecials);
        mcSpecialRegistered = true;
    }
    mcRegisterSpecial();

    if (typeof Scene_Boot !== 'undefined' && Scene_Boot.prototype && Scene_Boot.prototype.start) {
        const _Scene_Boot_start_mc = Scene_Boot.prototype.start;
        Scene_Boot.prototype.start = function() {
            mcInstallLate();
            if (_Scene_Boot_start_mc) _Scene_Boot_start_mc.call(this);
        };
    }

    // Mind Read: roll the next action now, say it, and hold the battler to it.
    function mcPlanAhead(battler, reader) {
        if (!battler.isEnemy() || !battler.canMove()) return;
        battler._mcPreRolled = null;
        battler.makeActions();
        const actions = (battler._actions || []).filter(a => a && a.item());
        for (const action of actions) {
            if (action._targetIndex < 0 && action.isForOne() && !action.isForUser() && !action.isForRandom()) {
                action.decideRandomTarget();
                action._mcKeepTarget = true;
            }
        }
        battler._mcPreRolled = (battler._actions || []).slice();
        const first = actions[0];
        if (!first) {
            mcLog(mcT('readNothing', { reader: reader ? reader.name() : '', target: battler.name() }));
            return;
        }
        let victim = null;
        if (first.isForOne() && !first.isForUser() && !first.isForRandom() && first._targetIndex >= 0) {
            const unit = first.isForOpponent() ? first.opponentsUnit() : first.friendsUnit();
            victim = unit && unit.members()[first._targetIndex];
        }
        mcLog(mcT(victim ? 'readAction' : 'readPlain', {
            reader: reader ? reader.name() : '', target: battler.name(),
            skill: first.item().name, victim: victim ? victim.name() : ''
        }));
    }

    // Puppet: the caster picks the move. A party member at the controls is
    // asked; anyone else (the CPU) takes the first damaging move it can.
    function mcPuppetOptions(battler) {
        const ids = [];
        if (battler.isEnemy()) {
            for (const a of (battler.enemy().actions || [])) if (a && a.skillId && !ids.includes(a.skillId)) ids.push(a.skillId);
        } else {
            ids.push(battler.attackSkillId());
            for (const s of battler.skills()) if (s && !ids.includes(s.id)) ids.push(s.id);
        }
        return ids.map(id => $dataSkills[id])
            .filter(s => s && s.id !== battler.guardSkillId() && battler.canUse(s))
            .slice(0, MC_PUPPET_CHOICES);
    }

    function mcPlayerControlled(caster) {
        if (!caster || !caster.isActor || !caster.isActor()) return false;
        if (caster.isAutoBattle && caster.isAutoBattle()) return false;
        const MBM = window.MapBattleMode;
        if (mcMbmActive() && MBM.isAiControlled && MBM.isAiControlled(caster)) return false;
        return true;
    }

    function mcSetPuppet(battler, skill) {
        battler._mcPuppet = { itemId: skill.id, isSkill: true, target: null };
        mcLog(mcT('puppetPicked', { target: battler.name(), skill: skill.name }));
    }

    function mcStartPuppet(battler, caster) {
        const options = mcPuppetOptions(battler);
        if (!options.length) {
            battler.removeState(MC.PUPPET);
            mcLog(mcT('puppetNone', { target: battler.name() }));
            return;
        }
        const canAsk = mcPlayerControlled(caster) && $gameMessage && $gameMessage.setChoices &&
            !($gameMessage.isChoice && $gameMessage.isChoice());
        if (!canAsk) {
            const harm = options.find(s => s.damage && [1, 5].includes(s.damage.type));
            mcSetPuppet(battler, harm || options[0]);
            return;
        }
        // Bracketed, or Hendrix_Localization diverts the line into its event
        // buffer and the prompt never draws (test_message_bracket_guard).
        window.skipLocalization = true;
        $gameMessage.add(mcT('puppetPrompt', { caster: caster.name(), target: battler.name() }));
        window.skipLocalization = false;
        $gameMessage.setChoices(options.map(s => s.name), 0, -1);
        $gameMessage.setChoiceCallback(n => {
            const pick = options[n] || options[0];
            if (battler.isStateAffected(MC.PUPPET)) mcSetPuppet(battler, pick);
        });
    }

    // Why a mind-control state does not take, or null when it does.
    function mcRefusal(battler, stateId) {
        if (MC_BOSS_PROOF.includes(stateId) && mcIsBoss(battler)) return 'bossResists';
        if (stateId === MC.LOOP && !battler._mcLast) return 'loopNoHistory';
        if (stateId === MC.SEAL) {
            const last = battler._mcLast;
            if (!last || !last.isSkill || last.itemId === battler.guardSkillId()) return 'sealNoHistory';
        }
        return null;
    }

    // Headless harnesses load this file without the engine classes.
    const mcHasEngine = typeof Game_Battler !== 'undefined' && typeof Game_BattlerBase !== 'undefined' &&
        typeof Game_Action !== 'undefined' && typeof BattleManager !== 'undefined';
    if (mcHasEngine) {
        const _Game_Battler_addState_mc = Game_Battler.prototype.addState;
        Game_Battler.prototype.addState = function(stateId) {
            if (!MC_STATES.includes(stateId) || !mcInBattle()) {
                _Game_Battler_addState_mc.call(this, stateId);
                return;
            }
            const refusal = mcRefusal(this, stateId);
            if (refusal) {
                mcLogOnce(refusal + this.name(), mcT(refusal, { target: this.name() }));
                return;
            }
            const had = this.isStateAffected(stateId);
            _Game_Battler_addState_mc.call(this, stateId);
            if (!this.isStateAffected(stateId) || had) return;
            const caster = mcApplying ? mcApplying.subject() : BattleManager._subject;
            const last = this._mcLast;
            if (stateId === MC.LOOP) {
                const item = mcItemOf(last);
                const swap = !!(last.target && item && last.target.friend !== mcNaturalFriend(item));
                this._mcLoop = { itemId: last.itemId, isSkill: last.isSkill, target: last.target, swap };
                mcLog(mcT('loopStart', { target: this.name(), skill: item ? item.name : '' }));
            } else if (stateId === MC.SEAL) {
                this._mcSealSkill = last.itemId;
                const skill = $dataSkills[last.itemId];
                mcLog(mcT('sealed', { target: this.name(), skill: skill ? skill.name : '' }));
            } else if (stateId === MC.PUPPET) {
                mcStartPuppet(this, caster);
            } else if (stateId === MC.MINDREAD) {
                mcPlanAhead(this, caster);
            }
        };

        const _Game_Battler_removeState_mc = Game_Battler.prototype.removeState;
        Game_Battler.prototype.removeState = function(stateId) {
            _Game_Battler_removeState_mc.call(this, stateId);
            if (this.isStateAffected(stateId)) return;
            if (stateId === MC.LOOP) this._mcLoop = null;
            else if (stateId === MC.SEAL) this._mcSealSkill = 0;
            else if (stateId === MC.PUPPET) this._mcPuppet = null;
            else if (stateId === MC.MINDREAD) this._mcPreRolled = null;
        };

        const _Game_Action_apply_mc = Game_Action.prototype.apply;
        Game_Action.prototype.apply = function(target) {
            const prev = mcApplying;
            mcApplying = this;
            try {
                _Game_Action_apply_mc.call(this, target);
            } finally {
                mcApplying = prev;
            }
        };

        const _Game_BattlerBase_isSkillSealed_mc = Game_BattlerBase.prototype.isSkillSealed;
        Game_BattlerBase.prototype.isSkillSealed = function(skillId) {
            if (_Game_BattlerBase_isSkillSealed_mc.call(this, skillId)) return true;
            return !!(this._mcSealSkill && this._mcSealSkill === skillId && this.isStateAffected(MC.SEAL));
        };

        const _Game_BattlerBase_canInput_mc = Game_BattlerBase.prototype.canInput;
        Game_BattlerBase.prototype.canInput = function() {
            if (!_Game_BattlerBase_canInput_mc.call(this)) return false;
            return !(mcInBattle() && mcHeld(this));
        };

        // Turned actions read the other side as their own.
        const _Game_Action_friendsUnit_mc = Game_Action.prototype.friendsUnit;
        const _Game_Action_opponentsUnit_mc = Game_Action.prototype.opponentsUnit;
        Game_Action.prototype.friendsUnit = function() {
            return this._mcSwap ? _Game_Action_opponentsUnit_mc.call(this) : _Game_Action_friendsUnit_mc.call(this);
        };
        Game_Action.prototype.opponentsUnit = function() {
            return this._mcSwap ? _Game_Action_friendsUnit_mc.call(this) : _Game_Action_opponentsUnit_mc.call(this);
        };

        // Echo: the repeat is free.
        const _Game_BattlerBase_canPaySkillCost_mc = Game_BattlerBase.prototype.canPaySkillCost;
        Game_BattlerBase.prototype.canPaySkillCost = function(skill) {
            if (this._mcFreeCast) return true;
            return _Game_BattlerBase_canPaySkillCost_mc.call(this, skill);
        };
        const _Game_BattlerBase_paySkillCost_mc = Game_BattlerBase.prototype.paySkillCost;
        Game_BattlerBase.prototype.paySkillCost = function(skill) {
            if (this._mcFreeCast) return;
            _Game_BattlerBase_paySkillCost_mc.call(this, skill);
        };

        const _BattleManager_startAction_mc = BattleManager.startAction;
        BattleManager.startAction = function() {
            const subject = this._subject;
            const action = subject && subject.currentAction && subject.currentAction();
            if (action) action._mcSerial = ++mcActionSerial;
            _BattleManager_startAction_mc.call(this);
            if (subject && action) {
                if (action._mcEcho) subject._mcFreeCast = false;
                mcRecordAction(subject, action, this._targets);
            }
        };

        function mcGrantsEcho(item) {
            return !!(item && (item.effects || []).some(e => e && e.code === 21 && e.dataId === MC.ECHO));
        }

        const _BattleManager_endAction_mc = BattleManager.endAction;
        BattleManager.endAction = function() {
            const subject = this._subject;
            const action = this._action;
            if (subject && action && !action._mcEcho && subject.isStateAffected(MC.ECHO) &&
                action.isSkill() && action.item() && subject.isAlive() && subject.canMove() &&
                action.item().id !== subject.attackSkillId() && action.item().id !== subject.guardSkillId() &&
                !mcGrantsEcho(action.item())) {
                const echo = new Game_Action(subject);
                echo.setSkill(action.item().id);
                echo._mcEcho = true;
                if (action._mcSwap) echo._mcSwap = true;
                const last = subject._mcLast;
                mcAim(echo, last && last.itemId === action.item().id ? last.target : null);
                subject._actions.unshift(echo);
                subject._mcFreeCast = true;
                subject.removeState(MC.ECHO);
                mcLog(mcT('echo', { actor: subject.name(), skill: action.item().name }));
            }
            _BattleManager_endAction_mc.call(this);
        };

        // Rebound: the engine's own reflection path, for any skill an opponent
        // lands on the holder, plain attacks aside.
        function mcRebounds(action, target) {
            if (!target || !target.isStateAffected || !target.isStateAffected(MC.REBOUND)) return false;
            const subject = action.subject();
            if (!subject || subject === target || !action.isSkill() || !action.item()) return false;
            if (action.item().id === subject.attackSkillId()) return false;
            return !!(subject.isActor && subject.isActor() !== target.isActor());
        }

        const _Game_Action_itemMrf_mc = Game_Action.prototype.itemMrf;
        Game_Action.prototype.itemMrf = function(target) {
            if (mcRebounds(this, target)) return 1;
            return _Game_Action_itemMrf_mc.call(this, target);
        };

        const _BattleManager_invokeMagicReflection_mc = BattleManager.invokeMagicReflection;
        BattleManager.invokeMagicReflection = function(subject, target) {
            const rebound = mcRebounds(this._action, target);
            if (rebound) target.removeState(MC.REBOUND);
            _BattleManager_invokeMagicReflection_mc.call(this, subject, target);
            if (rebound) {
                mcLog(mcT('rebound', { target: target.name(), caster: subject.name(), skill: this._action.item().name }));
            }
        };

        const _Game_Battler_onAllActionsEnd_mc = Game_Battler.prototype.onAllActionsEnd;
        Game_Battler.prototype.onAllActionsEnd = function() {
            this._mcFreeCast = false;
            _Game_Battler_onAllActionsEnd_mc.call(this);
        };

        const _Game_Battler_onBattleStart_mc = Game_Battler.prototype.onBattleStart;
        Game_Battler.prototype.onBattleStart = function(advantageous) {
            mcClear(this);
            _Game_Battler_onBattleStart_mc.call(this, advantageous);
        };

        const _BattleManager_setup_mc = BattleManager.setup;
        BattleManager.setup = function(troopId, canEscape, canLose) {
            mcAnnounced.clear();
            _BattleManager_setup_mc.call(this, troopId, canEscape, canLose);
        };
    }

    window.MindControl = {
        STATES: MC,
        installLate: mcInstallLate,
        specialsOf: mcSpecials,
        // MapBattleMode: this battler's queued action is forced on it.
        isForced(battler) {
            const action = battler && battler.currentAction && battler.currentAction();
            return !!(action && action._mcForced);
        },
        isHeld: mcHeld,
        lastAction: (battler) => (battler && battler._mcLast) || null
    };
    // ===== end MindControl =====

    // ===== ConsumeStacks: spent setups and battle stacks =====
    // Two halves of one idea: a payoff has to SPEND what it pays off.
    //
    //   <ConsumeSelfState: id[, id...]>  the setup states the user held when
    //       the move began (Combo Ready, Locked On, Perfect Focus, Hide) are
    //       removed once it connects. A state the move itself leaves on the
    //       user (a <SelfState:> rider) was not held at the start and stays.
    //
    //   <Stack: name[, max N][, +G]>     a battle counter the user builds: G
    //       (default 1) per connecting use, never above N (default 5).
    //   <StackOnKill: name[, max N]>     one per opponent the move finishes.
    //   <SpendStacks: name[, name...]>   the counter is emptied after the
    //       move connects. The damage formula reads it while it lands, so
    //       every hit of a multi-hit spender sees the full count:
    //           (a.stacks ? a.stacks('chi') : 0)
    //
    // Everything is settled ONCE per action, at BattleManager.endAction, after
    // every hit has been rolled, so a three-hit payoff is paid for three hits.
    // Scene_Battle (IndividualBattleTurns) and MapBattleMode both run their
    // actions through BattleManager.startAction / invokeAction / endAction,
    // so the same hooks serve both. Stacks live on the battler for one battle
    // and are wiped at onBattleStart and at BattleManager.endBattle.
    //
    // Two setup states also earn their keep on moves that cannot crit:
    //   <SureHit> on a state        the holder's physical blows never miss and
    //                               are never evaded (Perfect Focus).
    //   <IgnoreEvasion> on a state  the holder's physical blows are never
    //                               evaded (Locked On).

    const CS_CONSUME_TAG = /<ConsumeSelfState:\s*([\d\s,]+)>/i;
    const CS_STACK_TAG = /<Stack:\s*([A-Za-z][\w-]*)\s*((?:,\s*[^,>]+)*)>/i;
    const CS_KILL_TAG = /<StackOnKill:\s*([A-Za-z][\w-]*)\s*((?:,\s*[^,>]+)*)>/i;
    const CS_SPEND_TAG = /<SpendStacks:\s*([^>]+)>/i;
    const CS_SURE_HIT_TAG = /<SureHit>/i;
    const CS_IGNORE_EVA_TAG = /<IgnoreEvasion>/i;
    const CS_DEFAULT_MAX = 5;

    function csStackSpec(m) {
        if (!m) return null;
        const spec = { name: m[1].toLowerCase(), max: CS_DEFAULT_MAX, gain: 1 };
        for (const raw of String(m[2] || '').split(',')) {
            const part = raw.trim();
            if (!part) continue;
            const max = part.match(/^max\s*(\d+)$/i);
            if (max) { spec.max = Math.max(1, Number(max[1])); continue; }
            const gain = part.match(/^\+?(\d+)$/);
            if (gain) spec.gain = Math.max(1, Number(gain[1]));
        }
        return spec;
    }

    const csPlanCache = new WeakMap();
    function csPlanOf(item) {
        if (!item || typeof item !== 'object' || !item.note) return null;
        if (csPlanCache.has(item)) return csPlanCache.get(item);
        const note = item.note;
        const consumeM = note.match(CS_CONSUME_TAG);
        const spendM = note.match(CS_SPEND_TAG);
        const plan = {
            consume: consumeM ? consumeM[1].split(',').map(Number).filter(n => n > 0) : [],
            stack: csStackSpec(note.match(CS_STACK_TAG)),
            onKill: csStackSpec(note.match(CS_KILL_TAG)),
            spend: spendM ? spendM[1].split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : []
        };
        const any = plan.consume.length || plan.stack || plan.onKill || plan.spend.length;
        csPlanCache.set(item, any ? plan : null);
        return any ? plan : null;
    }

    // --- the per-battle counters on every battler ---------------------------
    // Game_BattlerBase is the home; a thin test costume may only carry
    // Game_Battler, so the counters go on whichever of the two exists.
    const CS_BASE = typeof Game_BattlerBase !== 'undefined' ? Game_BattlerBase
        : typeof Game_Battler !== 'undefined' ? Game_Battler : null;
    if (CS_BASE) {
        CS_BASE.prototype.stacks = function(name) {
            const bag = this._battleStacks;
            return bag ? (bag[String(name).toLowerCase()] || 0) : 0;
        };
        CS_BASE.prototype.stackMax = function(name) {
            const caps = this._battleStackMax;
            return (caps && caps[String(name).toLowerCase()]) || CS_DEFAULT_MAX;
        };
        CS_BASE.prototype.setStacks = function(name, count, max) {
            const key = String(name).toLowerCase();
            if (!this._battleStacks) this._battleStacks = {};
            if (max > 0) {
                if (!this._battleStackMax) this._battleStackMax = {};
                this._battleStackMax[key] = max;
            }
            const cap = this.stackMax(key);
            const n = Math.max(0, Math.min(cap, Math.floor(Number(count) || 0)));
            if (n > 0) this._battleStacks[key] = n;
            else delete this._battleStacks[key];
            return n;
        };
        CS_BASE.prototype.gainStacks = function(name, amount, max) {
            return this.setStacks(name, this.stacks(name) + (Number(amount) || 0), max);
        };
        CS_BASE.prototype.clearStacks = function() {
            this._battleStacks = null;
            this._battleStackMax = null;
        };
        // [{ name, count, max }] for every counter above zero.
        CS_BASE.prototype.stackList = function() {
            const bag = this._battleStacks || {};
            return Object.keys(bag).filter(k => bag[k] > 0)
                .map(k => ({ name: k, count: bag[k], max: this.stackMax(k) }));
        };

        if (typeof Game_Battler !== 'undefined') {
            const _Game_Battler_onBattleStart_cs = Game_Battler.prototype.onBattleStart;
            Game_Battler.prototype.onBattleStart = function(advantageous) {
                this.clearStacks();
                this._csPending = null;
                if (_Game_Battler_onBattleStart_cs) _Game_Battler_onBattleStart_cs.call(this, advantageous);
            };
        }

    }

    // --- reading the action while it lands ----------------------------------
    function csOpposed(a, b) {
        if (!a || !b || a === b) return false;
        const aActor = !!(a.isActor && a.isActor());
        const bActor = !!(b.isActor && b.isActor());
        return aActor !== bActor;
    }

    const _Game_Action_apply_cs = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function(target) {
        const plan = csPlanOf(this.item());
        const subject = plan ? this.subject() : null;
        if (!plan || !subject || typeof $gameParty === 'undefined' || !$gameParty || !$gameParty.inBattle()) {
            return _Game_Action_apply_cs.call(this, target);
        }
        if (!this._csHeld) {
            // What the user held as the move began: only that is spent.
            this._csHeld = plan.consume.filter(id => subject.isStateAffected(id));
            this._csHit = false;
            this._csKills = 0;
            this._csSettled = false;
            this._csRenewed = [];
            subject._csPending = this;
        }
        const wasAlive = !!(target && target.isAlive && target.isAlive());
        _Game_Action_apply_cs.call(this, target);
        if (target && target.result && target.result().isHit()) this._csHit = true;
        if (plan.onKill && wasAlive && csOpposed(subject, target) &&
            (target.isDead() || target.hp <= 0)) {
            this._csKills++;
        }
    };

    // A held setup the move lays on its user again (Sniper Shot re-locking
    // through its <SelfState:> rider) is a fresh one, and is not spent.
    if (typeof Game_Battler !== 'undefined' && Game_Battler.prototype.addState) {
        const _Game_Battler_addState_cs = Game_Battler.prototype.addState;
        Game_Battler.prototype.addState = function(stateId) {
            const pending = this._csPending;
            if (pending && pending._csHeld && !pending._csSettled &&
                pending._csHeld.indexOf(stateId) >= 0 && pending._csRenewed) {
                pending._csRenewed.push(stateId);
            }
            _Game_Battler_addState_cs.call(this, stateId);
        };
    }

    function csLog(text) {
        const log = BattleManager._logWindow;
        if (text && log && typeof log.push === 'function') log.push('addText', text);
    }

    function csStackLabel(name) {
        const key = 'Battle.stacks.name.' + name;
        return (T.has && T.has(key)) ? T(key) : name;
    }

    // Spend and build, once, after the last hit of the action.
    function csSettle(action) {
        if (!action || !action._csHeld || action._csSettled) return;
        action._csSettled = true;
        const subject = action.subject();
        if (!subject) return;
        if (subject._csPending === action) subject._csPending = null;
        const plan = csPlanOf(action.item());
        if (!plan || !action._csHit) return; // a whiff spends nothing and builds nothing
        for (const id of action._csHeld) {
            if (!subject.isStateAffected(id)) continue;
            if (action._csRenewed && action._csRenewed.indexOf(id) >= 0) continue; // laid on afresh by this move
            subject.removeState(id);
            const res = subject.result();
            if (res && Array.isArray(res.removedStates)) {
                res.removedStates = res.removedStates.filter(s => s !== id);
            }
            const st = $dataStates[id];
            if (st) {
                const stateName = typeof window.translateText === 'function' ? window.translateText(st.name) : st.name;
                csLog(T('Battle.stacks.spentState', { name: subject.name(), state: stateName }));
            }
        }
        for (const name of plan.spend) {
            const had = subject.stacks(name);
            if (had <= 0) continue;
            subject.setStacks(name, 0);
            csLog(T('Battle.stacks.spent', { name: subject.name(), count: had, stack: csStackLabel(name) }));
        }
        const built = [];
        if (plan.stack) built.push([plan.stack, plan.stack.gain]);
        if (plan.onKill && action._csKills > 0) built.push([plan.onKill, action._csKills]);
        for (const [spec, amount] of built) {
            const before = subject.stacks(spec.name);
            const now = subject.gainStacks(spec.name, amount, spec.max);
            if (now > before) {
                csLog(T('Battle.stacks.gained', {
                    name: subject.name(), count: now, max: spec.max, stack: csStackLabel(spec.name)
                }));
            }
        }
    }

    if (typeof BattleManager !== 'undefined') {
        // The fight is over: nobody carries a stack (or a pending action)
        // out of it. BattleManager.endBattle runs at the end of both a
        // Scene_Battle fight and a MapBattleMode one. Game_Battler#onBattleEnd
        // is not used: Game_Actor keeps its own copy (BattleSystemEnhancedState)
        // that a later write to Game_Battler would never reach.
        const _BattleManager_endBattle_cs = BattleManager.endBattle;
        BattleManager.endBattle = function(result) {
            const everyone = [];
            if (typeof $gameParty !== 'undefined' && $gameParty) everyone.push(...$gameParty.allMembers());
            if (typeof $gameTroop !== 'undefined' && $gameTroop) everyone.push(...$gameTroop.members());
            for (const b of everyone) {
                if (b && b.clearStacks) b.clearStacks();
                if (b) b._csPending = null;
            }
            if (_BattleManager_endBattle_cs) return _BattleManager_endBattle_cs.call(this, result);
        };

        const _BattleManager_endAction_cs = BattleManager.endAction;
        BattleManager.endAction = function() {
            csSettle(this._action);
            if (this._subject && this._subject._csPending) csSettle(this._subject._csPending);
            if (_BattleManager_endAction_cs) _BattleManager_endAction_cs.call(this);
        };
    }

    // Any flow that finishes a battler's actions without BattleManager.endAction
    // still settles here; csSettle runs once per action whichever path is first.
    if (typeof Game_Battler !== 'undefined') {
        const _Game_Battler_onAllActionsEnd_cs = Game_Battler.prototype.onAllActionsEnd;
        Game_Battler.prototype.onAllActionsEnd = function() {
            if (this._csPending) csSettle(this._csPending);
            if (_Game_Battler_onAllActionsEnd_cs) _Game_Battler_onAllActionsEnd_cs.call(this);
        };
    }

    // --- Perfect Focus and Locked On on moves that cannot crit -------------
    function csHolds(battler, re) {
        if (!battler || typeof battler.states !== 'function') return false;
        return battler.states().some(s => s && re.test(s.note || ''));
    }

    function csPhysicalOnFoe(action, target) {
        if (typeof action.isPhysical !== 'function' || !action.isPhysical()) return null;
        const subject = typeof action.subject === 'function' ? action.subject() : null;
        return csOpposed(subject, target) ? subject : null;
    }

    const _Game_Action_itemHit_cs = Game_Action.prototype.itemHit;
    if (_Game_Action_itemHit_cs) {
        Game_Action.prototype.itemHit = function(target) {
            const rate = _Game_Action_itemHit_cs.call(this, target);
            const subject = csPhysicalOnFoe(this, target);
            return subject && csHolds(subject, CS_SURE_HIT_TAG) ? 1 : rate;
        };
    }

    const _Game_Action_itemEva_cs = Game_Action.prototype.itemEva;
    if (_Game_Action_itemEva_cs) {
        Game_Action.prototype.itemEva = function(target) {
            const eva = _Game_Action_itemEva_cs.call(this, target);
            const subject = csPhysicalOnFoe(this, target);
            if (subject && (csHolds(subject, CS_SURE_HIT_TAG) || csHolds(subject, CS_IGNORE_EVA_TAG))) return 0;
            return eva;
        };
    }

    // HUD: one chip per live counter. `skip` names counters a class passive
    // already draws a chip of its own for (BattleSystemPassiveSkills).
    window.BattleStacks = {
        planOf: csPlanOf,
        chipsFor(battler, skip) {
            if (!battler || typeof battler.stackList !== 'function') return [];
            const omit = skip || [];
            return battler.stackList().filter(s => omit.indexOf(s.name) < 0).map(s => {
                const infoKey = 'Battle.stacks.info.' + s.name;
                return {
                    label: T('Battle.stacks.chip', { stack: csStackLabel(s.name), count: s.count, max: s.max }),
                    info: (T.has && T.has(infoKey)) ? T(infoKey) : T('Battle.stacks.info.generic'),
                    color: '#f2c14e'
                };
            });
        }
    };

    // The skill card's Special tags (window.SkillDetails.registerSpecial,
    // CategorizedBattleSkills.js). That plugin loads after this one, so the
    // provider is handed over at boot if it is not there yet.
    const CS_FORMULA_STACK = /\.stacks\(\s*['"]([A-Za-z][\w-]*)['"]\s*\)/g;
    function csSpecialsOf(skill) {
        const out = [];
        const entry = (key, params) => ({ name: T('SkillsMenu.specialName.' + key, params), desc: T('SkillsMenu.special.' + key, params) });
        const plan = csPlanOf(skill);
        if (plan) {
            for (const id of plan.consume) {
                const st = typeof $dataStates !== 'undefined' && $dataStates ? $dataStates[id] : null;
                if (!st || !st.name) continue;
                const stateName = typeof window.translateText === 'function' ? window.translateText(st.name) : st.name;
                out.push(entry('spendsState', { state: stateName }));
            }
            if (plan.stack) {
                out.push(entry('buildsStack', {
                    count: plan.stack.gain, stack: csStackLabel(plan.stack.name), max: plan.stack.max
                }));
            }
            if (plan.onKill) {
                out.push(entry('buildsStackOnKill', {
                    stack: csStackLabel(plan.onKill.name), max: plan.onKill.max
                }));
            }
            for (const name of plan.spend) {
                out.push(entry('spendsStacks', { stack: csStackLabel(name) }));
            }
        }
        const f = String((skill && skill.damage && skill.damage.formula) || '');
        const seen = new Set();
        let m;
        CS_FORMULA_STACK.lastIndex = 0;
        while ((m = CS_FORMULA_STACK.exec(f))) {
            const name = m[1].toLowerCase();
            if (seen.has(name)) continue;
            seen.add(name);
            out.push(entry('scalesWithStacks', { stack: csStackLabel(name) }));
        }
        return out;
    }
    let csSpecialsRegistered = false;
    function csRegisterSpecials() {
        if (csSpecialsRegistered) return;
        const svc = window.SkillDetails;
        if (!svc || typeof svc.registerSpecial !== 'function') return;
        svc.registerSpecial(csSpecialsOf);
        csSpecialsRegistered = true;
    }
    csRegisterSpecials();
    if (typeof Scene_Boot !== 'undefined' && Scene_Boot.prototype && Scene_Boot.prototype.start) {
        const _Scene_Boot_start_cs = Scene_Boot.prototype.start;
        Scene_Boot.prototype.start = function() {
            csRegisterSpecials();
            _Scene_Boot_start_cs.apply(this, arguments);
        };
    }
    window.BattleStacks.specialsOf = csSpecialsOf;
    window.BattleStacks.registerSpecials = csRegisterSpecials;
    // ===== end ConsumeStacks =====

    // ===== ElementReactions: an element meeting a state it answers to =====
    // ========================================================================
    // A state can say what happens when a hit of a given element lands on
    // whoever carries it. The table lives in the states' own notes:
    //
    //   <Reaction: 4 to 12 consume as Electrocute>
    //
    //   4, 2,3     the element ids that set it off (1 Physical .. 9 Cursed)
    //   to         splits the trigger from the outcome
    //   12         a state id added to the target (any number of them)
    //   consume    the held state is used up by the reaction
    //   bonus N    the hit deals N% of its own damage again on top
    //   chance N   it happens N% of the time (default 100)
    //   chain      neighbours carrying the same state react as well
    //   spread     the added states also land on the neighbours
    //   as Key     names the battle log line, Battle.reaction.<Key>
    //   kind Name  the special it belongs to (defaults to Key): BrittleShatter
    //              is a kind of Shatter, so one tag on a skill covers both
    //
    // Only a few skills set reactions off at all. A skill names the kinds it
    // carries in its own note, at most two of them:
    //
    //   <Reacts: Ignite, Detonate>
    //
    // and a hit sets off a held state only when its element matches the rule
    // AND the rule's kind is on that list. A skill without the tag, a summon or
    // a plain weapon swing, reacts with nothing.
    //
    // Only a state held BEFORE the hit can react, so a skill that soaks and
    // shocks in one blow does not set itself off. It runs once per landed hit,
    // after damage and effects, inside Game_Action.apply: Scene_Battle and
    // MapBattleMode both resolve every action through it. A neighbour is the
    // battler standing next in line on the same side; on the map it is anyone
    // on the same side within NEIGHBOUR_TILES of the target.

    const REACTION_TAG = /<Reaction:\s*([^>]*)>/gi;
    const REACTION_PHYSICAL = 1;
    const NEIGHBOUR_TILES = 1;

    function parseReaction(body) {
        const m = /^\s*([\d\s,]+?)\s+to\b(.*)$/i.exec(body || '');
        if (!m) return null;
        const elements = m[1].split(',').map(Number).filter(n => n > 0);
        if (!elements.length) return null;
        const rule = { elements: elements, add: [], consume: false, bonus: 0,
            chance: 100, chain: false, spread: false, key: '', kind: '' };
        const tokens = m[2].trim().split(/\s+/).filter(Boolean);
        for (let i = 0; i < tokens.length; i++) {
            const t = tokens[i].toLowerCase();
            if (/^\d+$/.test(t)) rule.add.push(Number(t));
            else if (t === 'consume') rule.consume = true;
            else if (t === 'chain') rule.chain = true;
            else if (t === 'spread') rule.spread = true;
            else if (t === 'bonus') rule.bonus = Number(tokens[++i]) || 0;
            else if (t === 'chance') { const c = Number(tokens[++i]); rule.chance = isNaN(c) ? 100 : c; }
            else if (t === 'as') rule.key = tokens[++i] || '';
            else if (t === 'kind') rule.kind = tokens[++i] || '';
        }
        if (!rule.kind) rule.kind = rule.key;
        return rule;
    }

    // The reaction kinds a skill carries, read off its <Reacts:> tag. Cached on
    // the skill like the rules on a state.
    const REACTS_TAG = /<Reacts:\s*([^>]*)>/i;
    const REACTS_MAX = 2;
    function reactsOf(skill) {
        if (!skill) return [];
        if (skill._reacts) return skill._reacts;
        const m = REACTS_TAG.exec(String(skill.note || ''));
        const list = m ? m[1].split(',').map(s => s.trim()).filter(Boolean).slice(0, REACTS_MAX) : [];
        Object.defineProperty(skill, '_reacts', { value: list, enumerable: false, configurable: true });
        return list;
    }

    function reactionsOf(state) {
        if (!state) return [];
        if (state._reactions) return state._reactions;
        const list = [];
        const note = String(state.note || '');
        REACTION_TAG.lastIndex = 0;
        let m;
        while ((m = REACTION_TAG.exec(note))) {
            const rule = parseReaction(m[1]);
            if (rule) list.push(rule);
        }
        Object.defineProperty(state, '_reactions', { value: list, enumerable: false, configurable: true });
        return list;
    }

    // The elements a hit carries. A recovery or a hit that deals nothing has
    // no contact to react with; a weapon blow with no element of its own is
    // still a physical one.
    function reactionElements(action) {
        const item = action.item();
        if (!item || !item.damage) return [];
        const type = item.damage.type;
        if (!type || type === 3 || type === 4) return [];
        const id = item.damage.elementId;
        let list = [];
        if (id < 0) {
            const subject = action.subject();
            list = subject && subject.attackElements ? subject.attackElements().slice() : [];
        } else if (id > 0) {
            list = [id];
        }
        if (!list.length && action.isPhysical()) list = [REACTION_PHYSICAL];
        return list;
    }

    function reactionNeighbours(target) {
        const unit = target.friendsUnit && target.friendsUnit();
        if (!unit) return [];
        const alive = unit.aliveMembers();
        const MBM = window.MapBattleMode;
        if (MBM && MBM.isActive && MBM.isActive()) {
            const here = MBM.mapCharacterFor(target);
            if (!here) return [];
            return alive.filter(m => {
                if (m === target) return false;
                const c = MBM.mapCharacterFor(m);
                return !!c && MBM.distance(here.x, here.y, c.x, c.y) <= NEIGHBOUR_TILES;
            });
        }
        const i = alive.indexOf(target);
        if (i < 0) return [];
        return [alive[i - 1], alive[i + 1]].filter(Boolean);
    }

    function fireReaction(action, target, state, rule) {
        const record = { stateId: state.id, key: rule.key, bonus: 0, reached: [] };
        const result = target.result();
        if (rule.bonus > 0) {
            const dealt = result.hpDamage > 0 ? result.hpDamage : 0;
            const extra = Math.round(dealt * rule.bonus / 100);
            if (extra > 0) {
                action.executeHpDamage(target, extra);
                result.hpDamage = dealt + extra;
                record.bonus = extra;
            }
        }
        if (rule.consume) target.removeState(state.id);
        if (target.isAlive()) for (const id of rule.add) target.addState(id);
        if (rule.chain || rule.spread) {
            for (const n of reactionNeighbours(target)) {
                if (rule.chain) {
                    if (!n.isStateAffected(state.id)) continue;
                    if (rule.consume) n.removeState(state.id);
                }
                if (!rule.add.length) { if (rule.chain) record.reached.push(n); continue; }
                for (const id of rule.add) n.addState(id);
                record.reached.push(n);
            }
        }
        return record;
    }

    function resolveReactions(action, target, held) {
        const result = target.result();
        if (!result || !result.isHit() || !target.isAlive()) return;
        const kinds = reactsOf(action.item());
        if (!kinds.length) return;
        const elements = reactionElements(action);
        if (!elements.length) return;
        const fired = [];
        for (const state of held) {
            if (!target.isAlive()) break;
            for (const rule of reactionsOf(state)) {
                if (kinds.indexOf(rule.kind) < 0) continue;
                if (!rule.elements.some(e => elements.indexOf(e) >= 0)) continue;
                if (Math.random() * 100 >= rule.chance) continue;
                fired.push(fireReaction(action, target, state, rule));
                break; // one reaction per held state per hit
            }
        }
        if (fired.length) result.reactions = (result.reactions || []).concat(fired);
    }

    // What the last hit set off is read by the log and forgotten with the
    // rest of the result. (typeof: stubbed test sandboxes carry no result.)
    if (typeof Game_ActionResult !== 'undefined') {
        const _Game_ActionResult_clear_reactions = Game_ActionResult.prototype.clear;
        Game_ActionResult.prototype.clear = function() {
            _Game_ActionResult_clear_reactions.call(this);
            this.reactions = null;
        };
    }

    if (typeof Game_Action !== 'undefined') {
        const _Game_Action_apply_reactions = Game_Action.prototype.apply;
        Game_Action.prototype.apply = function(target) {
            const held = target && target.states ? target.states().slice() : [];
            _Game_Action_apply_reactions.call(this, target);
            if (target && held.some(s => reactionsOf(s).length)) resolveReactions(this, target, held);
        };
    }

    function reactionLines(target, record) {
        const state = $dataStates[record.stateId];
        const params = { name: target.name(), state: state ? state.name : '', damage: record.bonus };
        const key = 'Battle.reaction.' + record.key;
        const lines = [(record.key && T.has && T.has(key)) ? T(key, params) : T('Battle.reaction.generic', params)];
        if (record.reached.length) {
            lines.push(T('Battle.reaction.spread', { names: record.reached.map(n => n.name()).join(', ') }));
        }
        return lines;
    }

    // Said before the state changes it causes, so the log reads cause first.
    if (typeof Window_BattleLog !== 'undefined') {
        const _Window_BattleLog_displayAffectedStatus_reactions = Window_BattleLog.prototype.displayAffectedStatus || function() {};
        Window_BattleLog.prototype.displayAffectedStatus = function(target) {
            const list = target && target.result && target.result().reactions;
            if (list && list.length) {
                for (const record of list) {
                    for (const line of reactionLines(target, record)) this.push('addText', line);
                }
            }
            _Window_BattleLog_displayAffectedStatus_reactions.call(this, target);
        };
    }

    // The skill card's Special column: one entry per reaction kind the skill
    // carries, named short with the whole rule as its description. Read off
    // the same tags the battle runs on, so the card cannot promise a reaction
    // that is not there.
    function reactionStaticElements(skill) {
        const d = skill && skill.damage;
        if (!d || !d.type || d.type === 3 || d.type === 4) return [];
        if (d.elementId > 0) return [d.elementId];
        return skill.hitType === 1 ? [REACTION_PHYSICAL] : [];
    }

    function reactionSpecials(skill) {
        if (!skill || typeof $dataStates === 'undefined' || !$dataStates) return [];
        const kinds = reactsOf(skill);
        const elements = reactionStaticElements(skill);
        if (!kinds.length || !elements.length) return [];
        const out = [];
        for (const kind of kinds) {
            let state = null;
            for (const st of $dataStates) {
                if (!st || !st.name) continue;
                if (reactionsOf(st).some(r => r.kind === kind && r.elements.some(e => elements.indexOf(e) >= 0))) { state = st; break; }
            }
            if (!state) continue;
            const has = (key) => T.has && T.has(key);
            const desc = has('SkillsMenu.special.reaction.' + kind) ? T('SkillsMenu.special.reaction.' + kind)
                : T('SkillsMenu.special.reaction.generic', { state: state.name });
            const name = has('SkillsMenu.specialName.reaction.' + kind) ? T('SkillsMenu.specialName.reaction.' + kind)
                : T('SkillsMenu.specialName.reaction.generic');
            out.push({ name, desc });
        }
        return out;
    }

    function registerReactionSpecials() {
        const SD = window.SkillDetails;
        if (!SD || typeof SD.registerSpecial !== 'function') return false;
        if (!SD._elementReactionsRegistered) {
            SD.registerSpecial(reactionSpecials);
            SD._elementReactionsRegistered = true;
        }
        return true;
    }
    // CategorizedBattleSkills builds SkillDetails after this file has loaded.
    if (!registerReactionSpecials() && typeof Scene_Boot !== 'undefined') {
        const _Scene_Boot_start_reactions = Scene_Boot.prototype.start;
        Scene_Boot.prototype.start = function() {
            registerReactionSpecials();
            _Scene_Boot_start_reactions.call(this);
        };
    }

    BSE.Reactions = { of: reactionsOf, parse: parseReaction, elementsOf: reactionElements, reactsOf: reactsOf,
        neighboursOf: reactionNeighbours, specialsOf: reactionSpecials, registerSpecials: registerReactionSpecials };
    // ===== end ElementReactions =====

})();
