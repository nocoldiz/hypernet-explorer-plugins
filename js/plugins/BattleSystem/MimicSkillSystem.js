/*:
 * @target MZ
 * @plugindesc Mimic Class Skill System v2.0.0, note-tag driven transformation skills
 * @author Omni-Lex
 * @orderAfter BattleSystemEnhanced
 * @orderAfter Health_Core
 * @orderAfter CharacterCreationCreature
 * @orderAfter EnemyTalkSystem
 * @orderAfter BattleSystemActiveSkills
 *
 * @help MimicSkillSystem.js
 *
 * The mimic skills, triggered by note tags placed in the Notes field of skill
 * entries in the RPG Maker database.
 *
 * SKILL NOTE TAGS:
 *   <MimicSkills>    , Learn every living enemy's skills for the rest of the fight.
 *   <MimicPartial>   , Copy the enemy's portrait and world sprite. Stats untouched.
 *   <MimicFull>      , Full copy: stats, HP/MP/TP, skills, body archetype, visuals.
 *   <MimicMirror>    , Re-execute the last skill an enemy used, against that enemy.
 *   <MimicCopyParty> , Copy a targeted ally's name, class, skills, sprite, archetype.
 *                       Set the skill scope to "One Ally" in the database.
 *   <MimicRandom>    , Apply MimicFull using a randomly picked enemy from the database.
 *   <MimicMutation>  , Randomly merge two archetypes into the user's body parts only.
 *
 * WHERE THE TAGS FIRE:
 *   Everything except <MimicCopyParty> is dispatched from applyGlobal, so a
 *   mimic skill works whatever its scope is, the user included, and whether or
 *   not the action produced a target at all. A scope of "None" never reaches
 *   Game_Action.apply, which is what kept these tags dead before.
 *   <MimicCopyParty> needs the ally that was picked, so it lives in apply.
 *
 * REVERTING:
 *   A borrowed body is borrowed. Everything <MimicFull>, <MimicRandom> and
 *   <MimicCopyParty> overwrite is snapshotted first and put back when the
 *   battle ends, along with the skills <MimicSkills> lent and the portrait
 *   <MimicPartial> swapped. <MimicMutation> is a real mutation of the
 *   character's own body and is kept.
 *
 * INTEGRATION:
 *   - The portrait uses the per-actor fields (ActorCharacterFields.js): vnBust,
 *     vnBattler, portraitMode, _recruitedEnemyId, plus creature switches 77-79,
 *     exactly the way EnemyTalkSystem dresses a recruited monster.
 *   - Body parts use Health_Core.js via window.changeArchetypeForActor.
 *   - Hybrid body parts mirror CharacterCreationCreature.js applyHybridArchetype.
 *   - Mirror Move uses the standard MZ BattleManager.forceAction pipeline.
 *
 * License: Free for commercial and non-commercial use.
 */

(() => {
    'use strict';

    const T = (key, params) => (window.T ? window.T(key, params) : key);

    // =========================================================================
    // Module-level state
    // =========================================================================

    // The last skill an enemy used this battle, and the index of the enemy that
    // used it. Mirror Move throws exactly that back at exactly that enemy.
    let _lastEnemySkillId = null;
    let _lastEnemyIndex = 0;

    const _BattleManager_startBattle = BattleManager.startBattle;
    BattleManager.startBattle = function () {
        _lastEnemySkillId = null;
        _lastEnemyIndex = 0;
        _pendingMirror = null;
        _BattleManager_startBattle.call(this);
    };

    // =========================================================================
    // Announcing what happened
    // =========================================================================

    // In a fight the battle log says it; outside one the toast service does.
    function announce(text) {
        if (!text) return;
        if ($gameParty && $gameParty.inBattle() && BattleManager._logWindow) {
            BattleManager._logWindow.push('addText', text);
            return;
        }
        if (window.ParchmentToast && window.ParchmentToast.show) {
            window.ParchmentToast.show(text);
        }
    }

    // =========================================================================
    // Actor slot helpers
    // =========================================================================

    // Switches 77/78/79 say whether Actor 1/2/3 is drawn from a battler image
    // instead of a bust (CustomBustFaceSystemjs.js). Nobody past the third slot
    // has one, so nothing is written for them.
    function setCreatureSwitch(actor, on) {
        const slot = actor.actorId();
        if ($gameSwitches && slot >= 1 && slot <= 3) {
            $gameSwitches.setValue(76 + slot, !!on);
        }
    }

    function creatureSwitchValue(actor) {
        const slot = actor.actorId();
        if ($gameSwitches && slot >= 1 && slot <= 3) {
            return $gameSwitches.value(76 + slot);
        }
        return false;
    }

    // Reproduction type is stored per PARTY INDEX, not per actor id:
    // var 87 (first member), 115 (second), 116 (third), the same mapping
    // Health_BiologicSimulation reads.
    function reproductionVarId(actor) {
        const idx = actor && $gameParty ? $gameParty.members().indexOf(actor) : 0;
        if (idx === 1) return 115;
        if (idx === 2) return 116;
        return 87;
    }

    // =========================================================================
    // Enemy data helpers
    // =========================================================================

    // Reads <Char:SpriteName> from an enemy note tag. These walking sprites live
    // in img/characters/Monsters/, and a "$" sheet holds one character at index
    // 0 (the same resolution EnemyTalkSystem uses for a recruit).
    function getEnemyCharSpriteName(enemyDataObj) {
        if (!enemyDataObj || !enemyDataObj.note) return null;
        const m = enemyDataObj.note.match(/<Char:\s*(.+?)>/i);
        return m ? m[1].trim() : null;
    }

    // Reads <Archetype:Name> from an enemy note tag.
    function getEnemyArchetypeName(enemyDataObj) {
        if (!enemyDataObj || !enemyDataObj.note) return null;
        const m = enemyDataObj.note.match(/<Archetype:\s*(.+?)>/i);
        return m ? m[1].trim() : null;
    }

    // The enemy a mimic skill copies: the one the action was aimed at when it
    // was aimed at one, otherwise the first enemy still standing. A dead enemy
    // is never copied, and a troop of one is the common case by design.
    function mimicSourceEnemy(action) {
        if (!$gameParty || !$gameParty.inBattle() || !$gameTroop) return null;
        const troop = $gameTroop.members();
        const idx = action && typeof action._targetIndex === 'number' ? action._targetIndex : -1;
        if (idx >= 0 && troop[idx] && troop[idx].isAlive()) return troop[idx];
        return troop.find(e => e && e.isAlive()) || null;
    }

    // =========================================================================
    // Tag reading
    // =========================================================================

    const MIMIC_TAGS = [
        ['skills', /<MimicSkills>/i],
        ['partial', /<MimicPartial>/i],
        ['full', /<MimicFull>/i],
        ['mirror', /<MimicMirror>/i],
        ['copyParty', /<MimicCopyParty>/i],
        ['random', /<MimicRandom>/i],
        ['mutation', /<MimicMutation>/i],
    ];

    function mimicKindOf(item) {
        if (!item || !item.note) return null;
        for (const pair of MIMIC_TAGS) {
            if (pair[1].test(item.note)) return pair[0];
        }
        return null;
    }

    // A mimic skill is never itself borrowed, copied or mirrored: a copy that
    // hands the copy back is a loop with no bottom.
    function isMimicSkill(item) {
        return mimicKindOf(item) !== null;
    }

    // =========================================================================
    // Snapshot and revert
    // =========================================================================

    // Everything a transformation overwrites, taken once. A second mimic in the
    // same fight must not overwrite the snapshot with the first mimic's body:
    // the character reverts to whoever walked into the fight.
    function snapshotActor(actor) {
        if (actor._mimicRevert) return;
        actor._mimicRevert = {
            name: actor.name(),
            classId: actor._classId,
            skills: actor._skills ? actor._skills.slice() : [],
            characterName: actor._characterName,
            characterIndex: actor._characterIndex,
            battlerName: actor._battlerName,
            faceName: actor._faceName,
            faceIndex: actor._faceIndex,
            vnBust: actor.vnBust ? actor.vnBust() : 0,
            vnBattler: actor.vnBattler ? actor.vnBattler() : 0,
            portraitMode: actor.portraitMode ? actor.portraitMode() : 0,
            recruitedEnemyId: actor._recruitedEnemyId || 0,
            recruitedLook: actor._recruitedLook || null,
            creatureSwitch: creatureSwitchValue(actor),
            archetypeName: actor._currentArchetype || null,
            bodyParts: actor._bodyParts ? JSON.parse(JSON.stringify(actor._bodyParts)) : null,
            statModifiers: actor._statModifiers ? Object.assign({}, actor._statModifiers) : {},
            severedParts: actor._severedParts ? Object.assign({}, actor._severedParts) : {},
            paramOverrides: actor._mimicParamOverrides ? actor._mimicParamOverrides.slice() : null,
            equips: (actor.equips() || []).map(it => it
                ? { id: it.id, isWeapon: !!DataManager.isWeapon(it) }
                : null),
        };
    }

    // A borrowed body has the borrowed body's slots, so anything that does not
    // fit it is handed back to the packs on transformation. The gear is the
    // character's, not the shape's: when the shape goes, it goes back on.
    function restoreEquips(actor, list) {
        if (!list || !list.length) return;
        for (const entry of list) {
            if (!entry) continue;
            const item = entry.isWeapon ? $dataWeapons[entry.id] : $dataArmors[entry.id];
            if (!item) continue;
            if ((actor.equips() || []).some(e => e === item)) continue;
            if (!actor.canEquip(item)) continue;
            if (!$gameParty.hasItem(item)) continue;
            const slot = window.HandSlots && window.HandSlots.emptySlotFor
                ? window.HandSlots.emptySlotFor(actor, item)
                : actor.equipSlots().findIndex((st, i) => st === item.etypeId && !actor.equips()[i]);
            if (slot < 0) continue;
            actor.changeEquip(slot, item);
        }
    }

    // Put the character back. Called for every party member when the battle
    // ends, and a no-op for anyone who never mimicked anything.
    function revertActor(actor) {
        const snap = actor && actor._mimicRevert;
        if (!snap) return;

        actor._mimicRevert = null;
        actor._mimicParamOverrides = snap.paramOverrides;
        actor.setName(snap.name);
        if (actor._classId !== snap.classId) actor.changeClass(snap.classId, false);
        actor._skills = snap.skills.slice();
        actor.setCharacterImage(snap.characterName, snap.characterIndex);
        actor._battlerName = snap.battlerName;
        actor._faceName = snap.faceName;
        actor._faceIndex = snap.faceIndex;
        if (actor.setVnBust) actor.setVnBust(snap.vnBust);
        if (actor.setVnBattler) actor.setVnBattler(snap.vnBattler);
        if (actor.setPortraitMode) actor.setPortraitMode(snap.portraitMode);
        actor._recruitedEnemyId = snap.recruitedEnemyId;
        actor._recruitedLook = snap.recruitedLook;
        setCreatureSwitch(actor, snap.creatureSwitch);
        actor._currentArchetype = snap.archetypeName;
        if (snap.bodyParts) actor._bodyParts = JSON.parse(JSON.stringify(snap.bodyParts));
        actor._statModifiers = Object.assign({}, snap.statModifiers);
        actor._severedParts = Object.assign({}, snap.severedParts);

        // The old body is back, and with it the slots the old gear needs.
        actor.refresh();
        restoreEquips(actor, snap.equips);

        // The old body has the old maximums: clamp what is left of the borrowed
        // one down into them rather than handing back an over-full bar.
        actor.refresh();
        actor.setHp(Math.min(actor.hp, actor.mhp));
        actor.setMp(Math.min(actor.mp, actor.mmp));
        if ($gamePlayer) $gamePlayer.refresh();
    }

    // =========================================================================
    // Visual helpers
    // =========================================================================

    // Dress the actor as the given monster: its battler art becomes the
    // portrait, its walking sheet the world sprite, and the recorded enemy id
    // lets the status screen build that species' procedural 3D model.
    // `liveEnemy` is the instance on the field when there is one, so the look
    // this fight rolled for it travels with the copy.
    function applyMimicLook(actor, enemyDataObj, liveEnemy) {
        if (!enemyDataObj) return;
        const battlerName = enemyDataObj.battlerName || '';

        if (actor.setVnBust) actor.setVnBust('');
        if (actor.setPortraitMode) actor.setPortraitMode('sprite');
        if (actor.setVnBattler) actor.setVnBattler(battlerName);
        actor._battlerName = battlerName;
        actor._faceName = '';
        actor._faceIndex = 0;
        actor._recruitedEnemyId = enemyDataObj.id || 0;
        actor._recruitedLook = (liveEnemy && window.Battler3D && window.Battler3D.currentLook)
            ? window.Battler3D.currentLook(liveEnemy.index ? liveEnemy.index() : 0)
            : null;
        setCreatureSwitch(actor, !!battlerName);

        // The slot may still be carrying the previous occupant's hand-built 3D
        // model. A copy is portrayed by the species it copied, not by them.
        if (window.CC3DModel) {
            const slot = actor.actorId();
            if (window.CC3DModel.setConfig) window.CC3DModel.setConfig(slot, null);
            if (window.CC3DModel.setCreatureSeed) window.CC3DModel.setCreatureSeed(slot, null);
        }

        const charSpriteName = getEnemyCharSpriteName(enemyDataObj);
        if (charSpriteName) {
            actor.setCharacterImage('Monsters/' + charSpriteName, 0);
            if ($gamePlayer) $gamePlayer.refresh();
        }

        if ($gameTemp) $gameTemp.requestBattleRefresh();
    }

    // =========================================================================
    // Handler: Borrow Skills
    // Learn every living enemy's actions for the rest of the fight.
    // =========================================================================

    function applyMimicSkills(actor) {
        if (!$gameParty || !$gameParty.inBattle() || !$gameTroop) return;

        actor._tempLearnedSkills = actor._tempLearnedSkills || [];
        snapshotActor(actor);
        let borrowed = 0;

        for (const enemy of $gameTroop.members()) {
            if (!enemy || !enemy.isAlive()) continue;
            for (const action of (enemy.enemy().actions || [])) {
                const id = action.skillId;
                if (id > 0 && $dataSkills[id] && !actor.isLearnedSkill(id) &&
                    !isMimicSkill($dataSkills[id])) {
                    actor.learnSkill(id);
                    actor._tempLearnedSkills.push(id);
                    borrowed++;
                }
            }
        }

        announce(borrowed > 0
            ? T('Battle.mimic.mirrored', { actor: actor.name() })
            : T('Battle.mimic.nothingToCopy', { actor: actor.name() }));
    }

    // =========================================================================
    // Handler: Partial Mimic
    // Portrait and world sprite only. Stats/HP/MP/TP unchanged.
    // =========================================================================

    function applyMimicPartial(actor, liveEnemy) {
        snapshotActor(actor);
        applyMimicLook(actor, liveEnemy.enemy(), liveEnemy);
        announce(T('Battle.mimic.tookLook', { actor: actor.name(), enemy: liveEnemy.name() }));
    }

    // =========================================================================
    // Handler: Full Mimic
    // Stats, HP/MP/TP, skills, archetype and visuals.
    // liveEnemy is null when called from MimicRandom (no instance on the field).
    // =========================================================================

    function applyMimicFull(actor, enemyDataObj, liveEnemy) {
        if (!enemyDataObj) return;

        snapshotActor(actor);

        // Base params (mhp, mmp, atk, def, mat, mdf, agi, luk), then a refresh
        // so mhp/mmp are the copied body's before any HP is poured into them.
        actor._mimicParamOverrides = enemyDataObj.params.slice(0, 8);
        actor.refresh();

        if (liveEnemy) {
            actor.setHp(Math.min(liveEnemy.hp, actor.mhp));
            actor.setMp(Math.min(liveEnemy.mp, actor.mmp));
            actor.setTp(liveEnemy.tp);
        } else {
            actor.setHp(actor.mhp);
            actor.setMp(actor.mmp);
        }

        // The copied creature fights with the copied creature's moves, so the
        // borrowed list is emptied before the new body is built: changing the
        // archetype grants that anatomy's own part skills (claws, a bite), and
        // those belong to the copy and must survive this wipe.
        actor._skills = [];

        const archetypeName = getEnemyArchetypeName(enemyDataObj);
        if (archetypeName &&
            window.Health &&
            window.Health.Archetypes &&
            window.Health.Archetypes[archetypeName] &&
            typeof window.changeArchetypeForActor === 'function') {
            window.changeArchetypeForActor(actor, archetypeName);
        }

        // Attack and guard are not on the learned list and stay either way:
        // a body still has fists.
        for (const action of (enemyDataObj.actions || [])) {
            const id = action.skillId;
            if (id > 0 && $dataSkills[id] && !actor.isLearnedSkill(id) &&
                !isMimicSkill($dataSkills[id])) {
                actor.learnSkill(id);
            }
        }

        applyMimicLook(actor, enemyDataObj, liveEnemy);
        announce(T('Battle.mimic.becameEnemy', { actor: actor.name(), enemy: enemyDataObj.name }));
    }

    // =========================================================================
    // Handler: Mirror Move
    // Throws the last skill an enemy used back at the enemy that used it.
    //
    // The forced action cannot be queued here. This runs from applyGlobal,
    // inside BattleManager.startAction, and processTurn shifts the acting
    // battler's current action off the moment startAction returns: an action
    // pushed now is the one that gets thrown away, and processForcedAction
    // then reaches for an action that is no longer there. So the mirror is
    // parked and queued from endAction instead, once the mimic skill itself
    // has finished resolving.
    // =========================================================================

    let _pendingMirror = null;

    function applyMimicMirror(actor) {
        if (!$gameParty || !$gameParty.inBattle()) return;
        if (!_lastEnemySkillId || !$dataSkills[_lastEnemySkillId]) {
            announce(T('Battle.mimic.nothingToMirror', { actor: actor.name() }));
            return;
        }

        announce(T('Battle.mimic.mirrorMove', {
            actor: actor.name(),
            skill: $dataSkills[_lastEnemySkillId].name,
        }));
        _pendingMirror = { actor, skillId: _lastEnemySkillId, index: _lastEnemyIndex };
    }

    // The enemy the mirrored move lands on, decided as late as possible: the
    // one that used it if it is still standing, otherwise whoever is left.
    function mirrorTargetIndex(index) {
        const troop = $gameTroop.members();
        if (troop[index] && troop[index].isAlive()) return index;
        return troop.findIndex(e => e && e.isAlive());
    }

    function releasePendingMirror() {
        const pending = _pendingMirror;
        _pendingMirror = null;
        if (!pending) return;
        if (!$gameParty || !$gameParty.inBattle()) return;
        if (BattleManager._phase === 'battleEnd' || BattleManager._phase === 'aborting') return;
        if (!pending.actor.isAlive() || !pending.actor.canMove()) return;

        const index = mirrorTargetIndex(pending.index);
        if (index < 0) return;

        pending.actor.forceAction(pending.skillId, index);
        BattleManager.forceAction(pending.actor);
    }

    // =========================================================================
    // Handler: Copy Party
    // Copies a targeted ally's identity. Requires skill scope = One Ally.
    // =========================================================================

    function applyMimicCopyParty(actor, target) {
        if (!target || !target.isActor || !target.isActor() || target === actor) {
            return;
        }

        snapshotActor(actor);

        actor.setName(target.name());
        if (actor._classId !== target._classId) actor.changeClass(target._classId, false);

        actor._skills = [];
        for (const skill of target.skills()) {
            if (!isMimicSkill(skill)) actor.learnSkill(skill.id);
        }

        actor.setCharacterImage(target._characterName, target._characterIndex);

        // Wear their portrait: their bust if they have one, their creature art
        // if they are a monster, and never a stale mix of the two.
        if (actor.setVnBust) actor.setVnBust(target.vnBust ? target.vnBust() : 0);
        if (actor.setVnBattler) actor.setVnBattler(target.vnBattler ? target.vnBattler() : 0);
        if (actor.setPortraitMode) actor.setPortraitMode(target.portraitMode ? target.portraitMode() : 0);
        actor._battlerName = target._battlerName;
        actor._faceName = target._faceName;
        actor._faceIndex = target._faceIndex;
        actor._recruitedEnemyId = target._recruitedEnemyId || 0;
        actor._recruitedLook = target._recruitedLook || null;
        setCreatureSwitch(actor, creatureSwitchValue(target));

        const archetypeName = target._currentArchetype;
        if (archetypeName &&
            window.Health &&
            window.Health.Archetypes &&
            window.Health.Archetypes[archetypeName] &&
            typeof window.changeArchetypeForActor === 'function') {
            window.changeArchetypeForActor(actor, archetypeName);
        }

        if ($gamePlayer) $gamePlayer.refresh();
        if ($gameTemp) $gameTemp.requestBattleRefresh();
        actor.refresh();
        announce(T('Battle.mimic.becameAlly', { actor: actor.name(), ally: target.name() }));
    }

    // =========================================================================
    // Handler: Random Transform
    // Full Mimic against a random enemy out of the database.
    // =========================================================================

    function applyMimicRandom(actor) {
        const pool = ($dataEnemies || []).filter(e => e && e.name && e.name.trim() !== '');
        if (pool.length === 0) {
            return;
        }

        const picked = pool[Math.floor(Math.random() * pool.length)];
        applyMimicFull(actor, picked, null);
    }

    // =========================================================================
    // Handler: Random Mutation
    // Merges two random archetypes into the user's body parts only. Face, world
    // sprite and stats are unchanged, and this one is permanent: it is the
    // character's own body that changed, not a borrowed one.
    // Mirrors CharacterCreationCreature.js applyHybridArchetype exactly.
    // =========================================================================

    function applyMimicMutation(actor) {
        const Health = window.Health || {};
        const Archetypes = Health.Archetypes;
        if (!Archetypes) {
            return;
        }

        const keys = Object.keys(Archetypes);
        if (keys.length < 2) {
            return;
        }

        // Pick two distinct random archetypes.
        const idx1 = Math.floor(Math.random() * keys.length);
        let idx2;
        do { idx2 = Math.floor(Math.random() * keys.length); } while (idx2 === idx1);

        const key1 = keys[idx1];
        const key2 = keys[idx2];
        const arch1 = Archetypes[key1];
        const arch2 = Archetypes[key2];

        // Merge parts. The dominant archetype keeps every shared part it names;
        // arms and hands are the exception and are spliced on alongside, so a
        // mimicked body ends up with both pairs (HealthCore.mergeArchetypeParts).
        const mergedParts = (window.HealthCore && window.HealthCore.mergeArchetypeParts)
            ? window.HealthCore.mergeArchetypeParts([key2, key1])
            : Object.assign({}, arch1.parts, arch2.parts);

        // Clear existing body parts and stat modifiers.
        actor._statModifiers = {};
        actor._bodyParts = {};
        actor._currentArchetype = key1 + ' / ' + key2;

        // Build body parts with hpPercent scaling against actor's current mhp.
        const getArchText = (typeof window.getArchetypeText === 'function')
            ? window.getArchetypeText.bind(window)
            : (v) => v;

        for (const partKey in mergedParts) {
            const p = mergedParts[partKey];
            const maxHp = Math.round(actor.mhp * ((p.hpPercent || 10) / 100));
            actor._bodyParts[partKey] = {
                name: getArchText(p.name) || p.name || partKey,
                maxHp,
                currentHp: maxHp,
                vital: false,
                damaged: false,
                canCutoff: p.canCutoff || false,
                statEffect: p.statEffect || null,
                damageMsg: getArchText(p.msg) || p.msg || '',
                specialEffect: p.specialEffect || null,
                appliedStatEffect: false,
                canHoldWeapon: !!p.canHoldWeapon,
                limbCopy: p.limbCopy || 0,
                skillId: p.skillId || [],
                hpPercent: p.hpPercent || 10,
            };
        }

        // Gestation belongs to the dominant archetype now.
        if ($gameVariables) {
            const reproVal = arch2.reproduction !== undefined ? arch2.reproduction : 0;
            $gameVariables.setValue(reproductionVarId(actor), reproVal);
        }

        // Grant type-based body-part skills (Mouth/Hands/Eyes/Feet) for the
        // newly merged body.
        if (window.HealthCore && window.HealthCore.ensureBodyPartSkills) {
            window.HealthCore.ensureBodyPartSkills(actor);
        }

        // A mutation is the character's own body from now on. If they had
        // already borrowed one earlier in the same fight there is a snapshot
        // waiting to undo this at the bell, so the snapshot is told about the
        // new anatomy: the borrowed face still goes back, the new limbs do not.
        if (actor._mimicRevert) {
            actor._mimicRevert.archetypeName = actor._currentArchetype;
            actor._mimicRevert.bodyParts = JSON.parse(JSON.stringify(actor._bodyParts));
            actor._mimicRevert.statModifiers = Object.assign({}, actor._statModifiers);
        }

        actor.refresh();
        announce(T('Battle.mimic.mutated', { actor: actor.name(), body: actor._currentArchetype }));
    }

    // =========================================================================
    // paramBase override, enables Full Mimic stat replacement
    // Placed at paramBase so Health_Core's param-level modifiers still apply on top.
    // =========================================================================

    const _Game_Actor_paramBase_mimic = Game_Actor.prototype.paramBase;
    Game_Actor.prototype.paramBase = function (paramId) {
        if (this._mimicParamOverrides && this._mimicParamOverrides[paramId] !== undefined) {
            return this._mimicParamOverrides[paramId];
        }
        return _Game_Actor_paramBase_mimic.call(this, paramId);
    };

    // =========================================================================
    // Dispatch
    //
    // applyGlobal runs once per use, whatever the scope, and even when the
    // action produced no target at all, so every target-independent mimic lives
    // here. apply runs per target, and is where the ally-copying one belongs.
    // =========================================================================

    // A skill the caster lost their grip on does nothing, mimicry included
    // (BattleSystemEnhancedMechanics rolls it once per action and memoises it,
    // so asking here costs nothing and cannot disagree with the battle log).
    function actionFumbled(action) {
        const helpers = window.BSE && window.BSE.Helpers;
        return !!(helpers && helpers.rollStatReqFumble && helpers.rollStatReqFumble(action));
    }

    function rememberEnemySkill(enemy, item) {
        if (isMimicSkill(item)) return;
        _lastEnemySkillId = item.id;
        _lastEnemyIndex = enemy.index ? enemy.index() : 0;
    }

    const _Game_Action_applyGlobal_mimic = Game_Action.prototype.applyGlobal;
    Game_Action.prototype.applyGlobal = function () {
        _Game_Action_applyGlobal_mimic.call(this);

        const subject = this.subject();
        if (!subject || !this.isSkill()) return;

        const item = this.item();
        if (!item) return;
        if (actionFumbled(this)) return;

        if (subject.isEnemy()) {
            rememberEnemySkill(subject, item);
            return;
        }
        if (!subject.isActor()) return;

        const kind = mimicKindOf(item);
        if (!kind || kind === 'copyParty') return;

        if (kind === 'skills') {
            applyMimicSkills(subject);
        } else if (kind === 'partial') {
            const enemy = mimicSourceEnemy(this);
            if (enemy) applyMimicPartial(subject, enemy);
            else announce(T('Battle.mimic.nothingToCopy', { actor: subject.name() }));
        } else if (kind === 'full') {
            const enemy = mimicSourceEnemy(this);
            if (enemy) applyMimicFull(subject, enemy.enemy(), enemy);
            else announce(T('Battle.mimic.nothingToCopy', { actor: subject.name() }));
        } else if (kind === 'mirror') {
            applyMimicMirror(subject);
        } else if (kind === 'random') {
            applyMimicRandom(subject);
        } else if (kind === 'mutation') {
            applyMimicMutation(subject);
        }
    };

    const _Game_Action_apply_mimic = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function (target) {
        _Game_Action_apply_mimic.call(this, target);

        const subject = this.subject();
        if (!subject || !this.isSkill()) return;

        const item = this.item();
        if (!item) return;
        if (actionFumbled(this)) return;

        // An enemy skill with no targets never reaches apply, which is why
        // applyGlobal records it too. Recording it twice costs nothing.
        if (subject.isEnemy()) {
            rememberEnemySkill(subject, item);
            return;
        }
        if (!subject.isActor()) return;

        if (mimicKindOf(item) === 'copyParty') {
            applyMimicCopyParty(subject, target);
        }
    };

    // =========================================================================
    // Handing the body back
    // =========================================================================

    // A mirror parked during applyGlobal is queued here, once the mimic skill
    // that asked for it has finished and its action has been shifted away.
    const _BattleManager_endAction_mimic = BattleManager.endAction;
    BattleManager.endAction = function () {
        _BattleManager_endAction_mimic.call(this);
        releasePendingMirror();
    };

    const _BattleManager_endBattle_mimic = BattleManager.endBattle;
    BattleManager.endBattle = function (result) {
        _pendingMirror = null;
        $gameParty.allMembers().forEach(revertActor);
        _BattleManager_endBattle_mimic.call(this, result);
    };

    // Exposed so the death, respawn and debug paths can drop a borrowed body,
    // and so the tests can read the tag table without a running game.
    window.MimicSkillSystem = {
        kindOf: mimicKindOf,
        isMimicSkill,
        revert: revertActor,
        snapshot: snapshotActor,
        isMimicking: actor => !!(actor && actor._mimicRevert),
    };

})();
