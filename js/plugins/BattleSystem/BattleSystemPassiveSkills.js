/*:
 * @target MZ
 * @plugindesc Signature class passive skills, active in and out of battle for the first three party members.
 * @author Omni-Lex
 * @version 1.0.0
 * @orderAfter BattleSystemEnhanced
 * @orderAfter BattleSystemEnhancedMechanics
 * @orderAfter BattleSystemEnhancedState
 * @orderAfter BattleSystemEnhancedDeath
 * @orderAfter BattleSystemEnhancedHUD
 * @orderAfter BattleSystemActiveSkills
 * @orderAfter TimeDateSystem
 * @orderAfter WeatherSystem
 *
 * @help
 * ============================================================================
 * Class Passive Skills
 * ============================================================================
 *
 * Every playable class owns one always-on signature passive. This plugin
 * implements those passives both in combat (damage, elements, healing, death
 * saves, turn effects, enemy telegraphs) and out of combat (survival drain,
 * shop prices).
 *
 * Scope: only the FIRST THREE party members contribute their passives. A
 * fourth (or later) recruited member's passive is ignored, in battle and on
 * the map, exactly as designed.
 *
 * The registry is keyed by class id and exposes a public API used by the
 * character-creation class selector to surface each class's passive
 * description:
 *
 *   window.BattleSystemPassiveSkills.getPassiveName(classId)
 *   window.BattleSystemPassiveSkills.getPassiveDescription(classId)
 *   window.BattleSystemPassiveSkills.getPassive(classId)
 *
 * ============================================================================
 * Trait passives
 * ============================================================================
 *
 * A second registry, keyed by trait id (js/db/Health/Traits.json), lets a
 * trait grant its own always-on passive on top of the class one. Trait
 * passives use the very same hook signatures as class passives and obey the
 * same first-three-members scope, so a character can run its class passive
 * plus up to four trait passives at once.
 *
 * Most registered trait passives are declarations only for now (name and
 * description, no mechanic). The implemented one is:
 *
 *   Gun-Fu (trait 202) - while a Gun, Projectile weapon or Bow is equipped,
 *   any skill whose <category:MartialArts> note matches is followed by a free
 *   normal attack against the same enemy.
 *
 * Trait passive API:
 *
 *   window.BattleSystemPassiveSkills.getTraitPassive(traitId)
 *   window.BattleSystemPassiveSkills.getTraitPassiveName(traitId)
 *   window.BattleSystemPassiveSkills.getTraitPassiveDescription(traitId)
 *   window.BattleSystemPassiveSkills.getTraitPassiveEffect(traitId)
 *   window.BattleSystemPassiveSkills.getActorTraitPassives(actor)
 *
 * No plugin commands. Passives are automatic.
 * ============================================================================
 */

(() => {
  "use strict";

  //==========================================================================
  // Localization helpers
  //   Display text lives in js/i18n/<lang>/plugins/BattlePassives.json and is
  //   keyed by the same class / trait id the registry uses, so a passive's
  //   copy is resolved at read time and follows a language switch.
  //==========================================================================
  const passiveText = (classId, leaf) => {
    const key = "BattlePassives.passive." + classId + "." + leaf;
    return T.has(key) ? T(key) : "";
  };
  const traitText = (traitId, leaf) => {
    const key = "BattlePassives.trait." + traitId + "." + leaf;
    return T.has(key) ? T(key) : "";
  };

  //==========================================================================
  // Utility
  //==========================================================================

  // The first three party members are the only passive contributors.
  // `firstThree()` is called many times per frame from the hot core-getter
  // overrides (param/xparam/sparam) and from getBattleChips, each time
  // allocating a fresh `allMembers().slice()`. Memoize it for the current frame
  // (party membership does not change within a single frame) so those calls
  // collapse to one allocation per frame instead of dozens.
  let _ftCache = null;
  let _ftFrame = -1;
  const firstThree = () => {
    if (!$gameParty) return [];
    const fc = (typeof Graphics !== "undefined") ? Graphics.frameCount : -1;
    if (_ftFrame === fc && _ftCache) return _ftCache;
    _ftCache = $gameParty.allMembers().slice(0, 3);
    _ftFrame = fc;
    return _ftCache;
  };

  const isPassiveActor = (battler) =>
    !!(
      battler &&
      battler.isActor &&
      battler.isActor() &&
      firstThree().indexOf(battler) >= 0
    );

  const classIdOf = (actor) => {
    if (!actor || !actor.currentClass) return 0;
    const c = actor.currentClass();
    return c ? c.id : 0;
  };

  // Passive definition for a battler, but only if it is an eligible member.
  const passiveOf = (battler) =>
    isPassiveActor(battler) ? PASSIVES[classIdOf(battler)] || null : null;

  // Is a living member of a given class id present among the first three?
  const livingClassInParty = (classId) =>
    firstThree().some(
      (a) => a && a.isAlive() && classIdOf(a) === classId
    );

  // Every living first-three member of a class (for stacking party auras).
  const livingMembersOfClass = (classId) =>
    firstThree().filter((a) => a && a.isAlive() && classIdOf(a) === classId);
  const countLivingClassInParty = (classId) =>
    livingMembersOfClass(classId).length;

  // Guardian Aegis ward: total physical + magical damage reduction the party
  // receives, summed across every living Guardian (each contributes in
  // proportion to its own HP) and capped so a hit is never fully negated.
  const guardianWardFraction = () => {
    let frac = 0;
    firstThree().forEach((a) => {
      if (a && a.isAlive() && classIdOf(a) === 33) {
        frac += 0.25 * (a.hp / Math.max(1, a.mhp));
      }
    });
    return Math.min(0.5, frac);
  };

  // Night window (Variable 23 = current hour), matching the world's night model.
  const isNightHours = () => {
    const hour =
      ($gameVariables && $gameVariables.value ? $gameVariables.value(23) : 12) || 0;
    return hour >= 20 || hour < 6;
  };

  // Short element names for battle chips / edge display, keyed by element id.

  // Mental-control states (confusion / fear / charm), resolved by name once, so
  // the Psychologist can be made immune regardless of the project's state ids.
  let _mentalStateIds = null;
  const mentalStateIds = () => {
    if (_mentalStateIds) return _mentalStateIds;
    _mentalStateIds = [];
    if (typeof $dataStates !== "undefined" && $dataStates) {
      const re = /confus|fear|afraid|terror|panic|charm|paura|terrore|ammalia|confond/i;
      for (let i = 1; i < $dataStates.length; i++) {
        const s = $dataStates[i];
        if (s && s.name && re.test(s.name)) _mentalStateIds.push(i);
      }
    }
    return _mentalStateIds;
  };

  // Cache a battle-usable "stun" style state so pin/lockdown passives work
  // regardless of the project's exact state naming.
  let _stunStateId = -1;
  const findStunStateId = () => {
    if (_stunStateId !== -1) return _stunStateId;
    _stunStateId = 0;
    if (typeof $dataStates !== "undefined" && $dataStates) {
      const re = /stun|paraly|stord|storn|numb/i;
      for (let i = 1; i < $dataStates.length; i++) {
        const s = $dataStates[i];
        if (s && s.name && re.test(s.name)) {
          _stunStateId = i;
          break;
        }
      }
    }
    return _stunStateId;
  };

  const battleLog = (msg) => {
    if (
      $gameParty &&
      $gameParty.inBattle() &&
      BattleManager._logWindow &&
      typeof BattleManager._logWindow.push === "function"
    ) {
      BattleManager._logWindow.push("addText", msg);
    }
  };

  const actionElementId = (action) => {
    if (!action || !action.item || !action.item()) return 0;
    const dmg = action.item().damage;
    if (!dmg) return 0;
    let el = dmg.elementId;
    if (el < 0) {
      // Normal-attack element: use the subject's first attack element.
      const subj = action.subject();
      const els = subj && subj.attackElements ? subj.attackElements() : [];
      el = els.length ? els[0] : 0;
    }
    return el || 0;
  };

  const equippedWeaponTypes = (actor) =>
    actor.weapons
      ? actor
          .weapons()
          .filter((w) => w)
          .map((w) => w.wtypeId)
      : [];

  //==========================================================================
  // Passive registry
  //   the class id is the key: its name and effect text live under
  //   BattlePassives.passive.<classId> in js/i18n/<lang>/plugins
  //   combat/needs/economy hooks: optional behavior
  //==========================================================================

  const PASSIVES = {};
  const reg = (id, def) => {
    PASSIVES[id] = def;
  };

  // --- 1. Warrior archetype ------------------------------------------------

  reg(4, {
    // Knight
  });
  reg(13, {
    // Berserker
    outgoing(actor, target, action, value) {
      const ratio = actor.hp / Math.max(1, actor.mhp);
      const bonus = 0.4 * (1 - ratio); // up to +40% at ~0% HP
      return value * (1 + Math.max(0, bonus));
    },
    modifyHeal(actor, value) {
      return value * 0.5;
    },
  });
  reg(26, {
    // Samurai
    battleStart(actor) {
      actor._iaidoReady = true;
    },
    outgoing(actor, target, action, value) {
      return actor._iaidoReady ? value * 2 : value;
    },
    hitRate(actor, action, hit) {
      return actor._iaidoReady ? 1 : hit;
    },
    afterAction(actor) {
      actor._iaidoReady = false;
    },
  });
  reg(30, {
    // Gladiator
  });
  reg(33, {
    // Guardian
  });
  reg(40, {
    // Barbarian
    elementRate(actor, subject, action, rate) {
      return rate > 1.5 ? 1.5 : rate;
    },
  });
  reg(22, {
    // Paladin
    afterHpDamage(actor, target, action, dealt) {
      if (dealt > 0 && actionElementId(action) === 8) {
        actor.gainHp(Math.floor(dealt * 0.2));
      }
    },
  });
  reg(38, {
    // Mercenary
    onEnemyKilled(actor, enemy) {
      const bounty = Math.max(5, Math.floor((enemy.enemy().exp || 10) / 4));
      if ($gameParty) $gameParty.gainGold(bounty);
    },
    economy: { buy: 1, sell: 1 },
  });
  reg(32, {
    // Commander
  });

  // --- 2. Brawler archetype ------------------------------------------------

  reg(5, {
    // Wrestler
    afterHpDamage(actor, target, action, dealt) {
      if (!action || !action.isAttack || !action.isAttack()) {
        actor._pinTarget = null;
        actor._pinCount = 0;
        return;
      }
      if (actor._pinTarget === target) {
        actor._pinCount = (actor._pinCount || 0) + 1;
      } else {
        actor._pinTarget = target;
        actor._pinCount = 1;
      }
      if (actor._pinCount >= 3) {
        const st = findStunStateId();
        if (st > 0 && target.isAlive()) {
          target.addState(st);
          battleLog(
            T("BattlePassives.log.pinStunned", { target: target.name() })
          );
        }
        actor._pinCount = 0;
      }
    },
    // Second half of the Convoker's signature: anything the party calls up
    // through the summoning rites is bound tighter and fights harder. Read by
    // SummonSystem through getSummonBonus() when a spec's params are cut.
    summonBonus: { hp: 0.3, power: 0.2 },
  });
  reg(11, {
    // Martial Artist
    afterAction(actor) {
      actor._chiCount = (actor._chiCount || 0) + 1;
      if (actor._chiCount % 3 === 0) {
        actor.gainTp(15);
        battleLog(
          T("BattlePassives.log.chiFlows", { actor: actor.name() })
        );
      }
    },
  });
  reg(15, {
    // Monk
    needs: { hungerMult: 0.7, sleepMult: 0.7 },
  });
  reg(16, {
    // Gunmancer: the spell is loaded into the chamber, so the bonus belongs to
    // the firearm rather than to the fist, and firing one feeds the caster back.
    outgoing(actor, target, action, value) {
      return equippedWeaponTypes(actor).indexOf(WTYPE_GUN) >= 0 ? value * 1.25 : value;
    },
    afterAction(actor) {
      if (equippedWeaponTypes(actor).indexOf(WTYPE_GUN) < 0) return;
      const before = actor.mp;
      actor.gainMp(Math.max(2, Math.floor(actor.mmp * 0.03)));
      if (actor.mp > before) {
        battleLog(T("BattlePassives.log.chamberedMana", { actor: actor.name() }));
      }
    },
  });
  reg(17, {
    // Boxer
    xparam(actor, xparamId, base) {
      return xparamId === 1 ? base + 0.15 : base; // evasion
    },
    outgoing(actor, target, action, value) {
      const stacks = actor._comboStacks || 0;
      return stacks > 0 ? value * (1 + 0.08 * stacks) : value;
    },
    afterAction(actor) {
      // Combo lasts only until your next action; spend it whatever you do.
      actor._comboStacks = 0;
    },
  });
  reg(18, {
    // Pro Wrestler
    battleStart(actor) {
      actor.gainTp(25);
    },
  });
  reg(14, {
    // Acrobat
    paramRate(actor, paramId, base) {
      return paramId === 6 ? 1.3 : 1; // AGI +30%
    },
  });

  // --- 3. Mage archetype ---------------------------------------------------

  reg(2, {
    // Witch
  });
  reg(10, {
    // Elementalist
    battleStart(actor) {
      actor._attuneElement = currentWeatherElement();
    },
    outgoing(actor, target, action, value) {
      if (actor._attuneElement && actionElementId(action) === actor._attuneElement) {
        return value * 1.25;
      }
      return value;
    },
  });
  reg(12, {
    // Enchanter
  });
  reg(19, {
    // Fire Mage
    outgoing(actor, target, action, value) {
      return actionElementId(action) === 2 ? value * 1.3 : value;
    },
  });
  reg(20, {
    // Ice Mage
    outgoing(actor, target, action, value) {
      return actionElementId(action) === 3 ? value * 1.3 : value;
    },
  });
  reg(27, {
    // Archmage
    skillMpCost(actor, skill, cost) {
      if (skill && skill.stypeId && skill.stypeId !== 0) {
        return Math.floor(cost * 0.8);
      }
      return cost;
    },
  });
  reg(36, {
    // Illusionist
    battleStart(actor) {
      actor._decoys = 2;
    },
    incoming(actor, attacker, action, value) {
      if (actor._decoys > 0 && value > 0) {
        actor._decoys -= 1;
        battleLog(
          T("BattlePassives.log.mirrorShatters", { actor: actor.name() })
        );
        return 0;
      }
      return value;
    },
  });
  reg(39, {
    // Sage
  });
  reg(34, {
    // Spellblade
    afterAction(actor, action) {
      const el = actionElementId(action);
      if (action && action.isSkill && action.isSkill() && el > 1) {
        actor._spellEdgeElement = el;
      }
    },
    outgoing(actor, target, action, value) {
      if (
        action &&
        action.isAttack &&
        action.isAttack() &&
        actor._spellEdgeElement
      ) {
        const rate = target.elementRate
          ? target.elementRate(actor._spellEdgeElement)
          : 1;
        if (rate > 1) return value * rate;
      }
      return value;
    },
  });
  reg(37, {
    // Battlemage
  });

  // --- 4. Occult archetype -------------------------------------------------

  reg(23, {
    // Warlock
  });
  reg(31, {
    // Necromancer
    onEnemyKilled(actor) {
      actor._soulCharges = (actor._soulCharges || 0) + 1;
    },
  });
  reg(8, {
    // Cultist. The night half of the passive is scored here; the other half
    // is a learning rule, not a combat one, so it is enforced by
    // window.SkillArcana (ItemSystem/ItemSystemUtils.js): a Cultist copies any
    // skill out of a grimoire or a skill book, level floors included, and the
    // Skill Master's tree teaches them nothing at all.
    outgoing(actor, target, action, value) {
      return isNightHours() ? value * 1.15 : value;
    },
    incoming(actor, attacker, action, value) {
      return isNightHours() ? value * 0.9 : value;
    },
  });
  reg(7, {
    // Vampire
    afterHpDamage(actor, target, action, dealt) {
      const el = actionElementId(action);
      if (dealt > 0 && (el === 1 || (action && action.isAttack && action.isAttack()))) {
        actor.gainHp(Math.floor(dealt * 0.3));
      }
    },
  });
  reg(62, {
    // Wretch
    xparam(actor, xparamId, base) {
      if (xparamId !== 2 && xparamId !== 1) return base;
      const gold = $gameParty ? $gameParty.gold() : 0;
      const factor = Math.max(0, Math.min(1, 1 - gold / 5000));
      if (xparamId === 2) return base + 0.3 * factor; // critical
      return base + 0.2 * factor; // evasion
    },
  });
  reg(21, {
    // Rogue
    xparam(actor, xparamId, base) {
      return xparamId === 2 ? base + 0.15 : base; // critical
    },
    outgoing(actor, target, action, value) {
      if (target && target.hp >= target.mhp) return value * 1.25;
      return value;
    },
  });
  reg(35, {
    // Bard
    onTurnEndSelf(actor) {
      // Light rotating pulse: small TP to the party each turn.
      firstThree().forEach((m) => {
        if (m && m.isAlive()) m.gainTp(3);
      });
    },
  });

  // --- 5. Devout archetype -------------------------------------------------

  reg(3, {
    // Nun
    onTurnEndSelf(actor) {
      firstThree().forEach((m) => {
        if (m && m.isAlive() && m.hp < m.mhp) {
          m.gainHp(Math.max(1, Math.floor(m.mhp * 0.04)));
        }
      });
    },
  });
  reg(25, {
    // Cleric
  });
  reg(59, {
    // Priest
    outgoing(actor, target, action, value) {
      return actionElementId(action) === 8 ? value * 1.25 : value;
    },
  });
  reg(29, {
    // Oracle
  });
  reg(9, {
    // Combat Medic
  });
  reg(41, {
    // Doctor
  });
  reg(51, {
    // Nurse
    modifyHeal(actor, value) {
      return value * 1.3;
    },
  });
  reg(61, {
    // Demigod
    battleStart(actor) {
      actor._divineBloodReady = true;
    },
  });

  // --- 6. Scholar archetype ------------------------------------------------

  reg(42, {
    // Scientist
  });
  reg(48, {
    // Academic
  });
  reg(49, {
    // Psychologist
  });
  reg(50, {
    // Archaeologist
  });
  reg(53, {
    // Physicist
  });
  reg(58, {
    // Meteorologist
    // Weather they can read is weather they can work in: rain, a storm or snow
    // falling on them is worth 5% of their MP and 5 TP a turn. `weatherType()`
    // is the engine's own answer and the one every other plugin asks
    // (NPCConversation, the fishing and surfing games).
    xparam(actor, xparamId, base) {
      if (xparamId !== 8 && xparamId !== 9) return base;   // MRG, TRG
      const w = (typeof $gameScreen !== "undefined" && $gameScreen &&
        ($gameScreen.weatherType ? $gameScreen.weatherType() : $gameScreen._weatherType)) || "none";
      if (w !== "rain" && w !== "storm" && w !== "snow") return base;
      return base + 0.05;
    },
  });
  reg(46, {
    // Journalist
    onEnemyKilled(actor, enemy) {
      const g = Math.max(3, Math.floor((enemy.enemy().exp || 10) / 6));
      if ($gameParty) $gameParty.gainGold(g);
    },
  });
  reg(54, {
    // Mechanic
  });

  // --- 7. Survivor archetype -----------------------------------------------

  reg(24, {
    // Ranger
    outgoing(actor, target, action, value) {
      const types = equippedWeaponTypes(actor);
      if (types.some((t) => t === 7 || t === 8 || t === 9)) {
        return value * 1.25;
      }
      return value;
    },
  });
  reg(28, {
    // Scout
  });
  reg(52, {
    // Hunter-Gatherer
  });
  reg(56, {
    // Farmer
  });
  reg(57, {
    // Lumberjack
    outgoing(actor, target, action, value) {
      const types = equippedWeaponTypes(actor);
      return types.indexOf(4) >= 0 ? value * 1.2 : value; // Axe
    },
  });
  reg(43, {
    // Firefighter
    elementRate(actor, subject, action, rate) {
      return actionElementId(action) === 2 ? 0 : rate;
    },
  });
  reg(47, {
    // Construction Worker
  });
  reg(45, {
    // Chef
  });

  // --- 8. Outsider archetype -----------------------------------------------

  reg(1, {
    // Freelancer
  });
  reg(6, {
    // CEO
    economy: { buy: 0.9, sell: 1.1 },
  });
  reg(44, {
    // Police Officer
  });
  reg(55, {
    // Shopkeeper
    economy: { buy: 0.85, sell: 1.25 },
  });
  reg(60, {
    // Entertainer
  });
  reg(66, {
    // Mana Cyborg (Cyborg)
    needs: { hungerMult: 0 },
  });
  reg(63, {
    // Beast
    onTurnEndSelf(actor) {
      if (actor.isAlive() && actor.hp < actor.mhp) {
        actor.gainHp(Math.max(1, Math.floor(actor.mhp * 0.03)));
      }
    },
  });
  reg(64, {
    // Mimic
    sparam(actor, sparamId, base) {
      return sparamId === 0 ? base * 0.35 : base; // lower target rate (tgr)
    },
  });
  reg(65, {
    // Monster
    onEnemyKilled(actor) {
      if (actor.isAlive()) {
        actor.gainHp(Math.floor(actor.mhp * 0.15));
      }
    },
  });

  //==========================================================================
  // Trait passive registry
  //   Keyed by the trait id in js/db/Health/Traits.json. A trait passive uses
  //   exactly the same hook signatures as a class passive, so a character can
  //   stack its class passive with up to four trait passives.
  //
  //   Only the FIRST THREE party members contribute, same as class passives.
  //
  //   Most entries below are declarations only: the name/desc are shown by the
  //   creation UI and the status screen, and the mechanic is left for later.
  //   Gun-Fu (202) is the one that is wired up.
  //==========================================================================

  const TRAIT_PASSIVES = {};
  const regTrait = (id, def) => {
    TRAIT_PASSIVES[id] = def;
  };

  // Weapon types that count as "ranged" for Gun-Fu (see data/System.json).
  const WTYPE_BOW = 7;
  const WTYPE_PROJECTILE = 8;
  const WTYPE_GUN = 9;
  const GUNFU_TRAIT_ID = 202;

  regTrait(GUNFU_TRAIT_ID, {
    // Gun-Fu (physical)
  });

  // --- Declared only; mechanics intentionally not implemented yet ----------

  regTrait(43, {
    // Ambidextrous
  });
  regTrait(74, {
    // Congenital Analgesia
  });
  regTrait(41, {
    // Photographic Memory
  });
  regTrait(152, {
    // Duelist
  });
  regTrait(155, {
    // Shield Master
  });
  regTrait(156, {
    // Assassin
  });
  regTrait(31, {
    // Masochist
  });
  regTrait(190, {
    // Magically Gifted
  });
  regTrait(99, {
    // Cursed
  });

  //==========================================================================
  // Trait passive resolution
  //==========================================================================

  const NO_TRAIT_PASSIVES = [];

  // Trait passive lookups sit in the same hot paths as the class ones
  // (param/xparam/sparam run many times per frame), so the resolved list is
  // memoized per frame. The cache lives here rather than on the actor because
  // Game_Actor is serialized into the save file and these entries hold
  // functions.
  const _tpCache = new Map();
  let _tpFrame = -1;

  const traitPassivesOf = (battler) => {
    if (!isPassiveActor(battler)) return NO_TRAIT_PASSIVES;
    const fc = typeof Graphics !== "undefined" ? Graphics.frameCount : -1;
    if (_tpFrame !== fc) {
      _tpCache.clear();
      _tpFrame = fc;
    }
    const cached = _tpCache.get(battler);
    if (cached) return cached;
    const selected = battler._selectedTraits;
    let list = NO_TRAIT_PASSIVES;
    if (selected && selected.length) {
      const found = [];
      for (let i = 0; i < selected.length; i++) {
        const t = selected[i];
        const def = t && TRAIT_PASSIVES[t.id];
        if (def) found.push(def);
      }
      if (found.length) list = found;
    }
    _tpCache.set(battler, list);
    return list;
  };

  const hasTrait = (battler, traitId) => {
    if (!isPassiveActor(battler)) return false;
    const selected = battler._selectedTraits;
    if (!selected || !selected.length) return false;
    for (let i = 0; i < selected.length; i++) {
      if (selected[i] && selected[i].id === traitId) return true;
    }
    return false;
  };

  // Value hooks: chain every trait passive over the value the class passive
  // already produced. `mid` holds the hook's middle arguments, matching the
  // class hook signature (e.g. outgoing(actor, target, action, value)).
  const traitChain = (battler, hook, mid, value) => {
    const list = traitPassivesOf(battler);
    for (let i = 0; i < list.length; i++) {
      const fn = list[i][hook];
      if (fn) value = fn.apply(list[i], [battler].concat(mid, [value]));
    }
    return value;
  };

  // Notification hooks: no return value.
  const traitNotify = (battler, hook, args) => {
    const list = traitPassivesOf(battler);
    for (let i = 0; i < list.length; i++) {
      const fn = list[i][hook];
      if (fn) fn.apply(list[i], [battler].concat(args || []));
    }
  };

  //==========================================================================
  // GUN-FU: a Martial Arts skill fired from a gun / projectile / bow chains
  // into a free normal attack on the same enemy.
  //==========================================================================

  const skillCategoryOf = (item) =>
    item && item.meta && item.meta.category ? String(item.meta.category) : "";

  const hasRangedWeapon = (actor) =>
    equippedWeaponTypes(actor).some(
      (t) => t === WTYPE_BOW || t === WTYPE_PROJECTILE || t === WTYPE_GUN
    );

  function gunFuQualifies(subject, action) {
    if (!action || !subject) return false;
    if (!hasTrait(subject, GUNFU_TRAIT_ID)) return false;
    if (!action.isSkill || !action.isSkill()) return false;
    // The chained attack must never chain off itself.
    if (action.isAttack && action.isAttack()) return false;
    if (skillCategoryOf(action.item()) !== "MartialArts") return false;
    if (!action.isForOpponent || !action.isForOpponent()) return false;
    return hasRangedWeapon(subject);
  }

  // Held between startAction and endAction of the same action; module-scoped so
  // nothing transient is written onto the (serialized) actor.
  let _gunFuPending = null;

  const _BattleManager_startAction = BattleManager.startAction;
  BattleManager.startAction = function () {
    _BattleManager_startAction.call(this);
    _gunFuPending = null;
    const subject = this._subject;
    const action = this._action;
    if (gunFuQualifies(subject, action)) {
      _gunFuPending = {
        subject: subject,
        targetIndex: action._targetIndex != null ? action._targetIndex : -1,
      };
    }
  };

  const _BattleManager_endAction_gunFu = BattleManager.endAction;
  BattleManager.endAction = function () {
    const pending = _gunFuPending;
    _gunFuPending = null;
    if (
      pending &&
      pending.subject === this._subject &&
      pending.subject.isAlive() &&
      pending.subject.canMove()
    ) {
      const followUp = new Game_Action(pending.subject);
      followUp.setAttack();
      if (pending.targetIndex >= 0) followUp.setTarget(pending.targetIndex);
      // Unshift so the shot lands right after the skill, ahead of any other
      // action the battler still has queued this turn.
      pending.subject._actions.unshift(followUp);
      battleLog(
        T("BattlePassives.log.gunFuFollowThrough", {
          actor: pending.subject.name(),
        })
      );
    }
    _BattleManager_endAction_gunFu.call(this);
  };

  //==========================================================================
  // Weather -> element mapping for Elementalist attunement
  //==========================================================================
  function currentWeatherElement() {
    try {
      const ws = window.WeatherSystem;
      const inst = ws && ws.instance ? ws.instance : ws;
      const types = ws && ws.WeatherTypes ? ws.WeatherTypes : null;
      const cur =
        (inst && inst.currentWeatherType != null && inst.currentWeatherType) ||
        (window.weatherName || "");
      if (types && cur != null) {
        if (cur === types.RAIN) return 5; // Water
        if (cur === types.STORM) return 4; // Thunder
        if (cur === types.SNOW) return 3; // Ice
      }
      const name = String(cur || window.weatherName || "").toLowerCase();
      if (name.includes("rain")) return 5;
      if (name.includes("storm") || name.includes("thunder")) return 4;
      if (name.includes("snow")) return 3;
    } catch (e) {
      /* fall through */
    }
    return 2; // Clear -> Fire
  }

  //==========================================================================
  // COMBAT HOOKS
  //==========================================================================

  // --- Damage value: outgoing (attacker) then incoming (defender) ---------
  const _Game_Action_makeDamageValue = Game_Action.prototype.makeDamageValue;
  Game_Action.prototype.makeDamageValue = function (target, critical) {
    let value = _Game_Action_makeDamageValue.call(this, target, critical);
    const subj = this.subject();
    const pa = passiveOf(subj);
    // Negative values are healing (HP-recover skills); don't let outgoing
    // damage multipliers (e.g. Berserker, Rogue) scale recovery.
    if (pa && pa.outgoing && value >= 0) value = pa.outgoing(subj, target, this, value);
    if (value >= 0) value = traitChain(subj, "outgoing", [target, this], value);
    const pd = passiveOf(target);
    if (pd && pd.incoming) value = pd.incoming(target, subj, this, value);
    value = traitChain(target, "incoming", [subj, this], value);
    return Math.round(value);
  };

  // --- Element rate (defender's passive can cap / zero it) ----------------
  const _Game_Action_calcElementRate = Game_Action.prototype.calcElementRate;
  Game_Action.prototype.calcElementRate = function (target) {
    let rate = _Game_Action_calcElementRate.call(this, target);
    const pd = passiveOf(target);
    if (pd && pd.elementRate) {
      rate = pd.elementRate(target, this.subject(), this, rate);
    }
    return traitChain(target, "elementRate", [this.subject(), this], rate);
  };

  // --- Hit rate (Samurai first-strike; Commander ally aura) ---------------
  const _Game_Action_itemHit = Game_Action.prototype.itemHit;
  Game_Action.prototype.itemHit = function (target) {
    let hit = _Game_Action_itemHit.call(this, target);
    const subj = this.subject();
    const pa = passiveOf(subj);
    if (pa && pa.hitRate) hit = pa.hitRate(subj, this, hit);
    hit = traitChain(subj, "hitRate", [this], hit);
    // Commander: allies (first three) gain +10% hit per living Commander.
    if (isPassiveActor(subj) && classIdOf(subj) !== 32) {
      const commanders = countLivingClassInParty(32);
      if (commanders > 0) hit += 0.1 * commanders;
    }
    return hit;
  };

  // --- HP damage execution: death saves, redirect, lifesteal, kills -------
  const _Game_Action_executeHpDamage = Game_Action.prototype.executeHpDamage;
  Game_Action.prototype.executeHpDamage = function (target, value) {
    value = preExecuteHpDamage(this, target, value);
    _Game_Action_executeHpDamage.call(this, target, value);
    postExecuteHpDamage(this, target, value);
  };

  function preExecuteHpDamage(action, target, value) {
    if (value <= 0) return value;

    // Guardian Aegis ward: reduce physical AND magical damage to the whole
    // party, scaled by each living Guardian's HP; stacks per Guardian (cap 50%).
    if (isPassiveActor(target)) {
      const ward = guardianWardFraction();
      if (ward > 0) {
        const blocked = Math.floor(value * ward);
        if (blocked > 0) value -= blocked;
      }
    }

    // Knight aura: protect other party members, redirect the saved portion to
    // the Knights. Each living Knight above 25% HP contributes 15% (cap 45%).
    if (isPassiveActor(target) && classIdOf(target) !== 4) {
      const knights = livingMembersOfClass(4).filter(
        (k) => k !== target && k.hp / Math.max(1, k.mhp) > 0.25
      );
      if (knights.length > 0) {
        const frac = Math.min(0.45, 0.15 * knights.length);
        let redirected = Math.floor(value * frac);
        if (redirected > 0) {
          value -= redirected;
          // Split the redirected damage evenly across the Knights.
          const per = Math.floor(redirected / knights.length);
          let rem = redirected - per * knights.length;
          knights.forEach((k, i) => {
            const take = per + (i < rem ? 1 : 0);
            if (take > 0) k.gainHp(-take);
          });
        }
      }
    }

    // Demigod Divine Blood: a lethal hit revives at 30% instead (once/battle).
    if (isPassiveActor(target) && classIdOf(target) === 61) {
      if (target._divineBloodReady && value >= target.hp) {
        target._divineBloodReady = false;
        const surviveHp = Math.max(1, Math.floor(target.mhp * 0.3));
        battleLog(
          T("BattlePassives.log.divineBloodSurges", { target: target.name() })
        );
        return target.hp - surviveHp;
      }
    }

    return value;
  }

  function postExecuteHpDamage(action, target, value) {
    const subj = action.subject();
    const pa = passiveOf(subj);
    if (pa && pa.afterHpDamage) {
      pa.afterHpDamage(subj, target, action, value);
    }
    traitNotify(subj, "afterHpDamage", [target, action, value]);
    // Enemy killed hooks (Mercenary bounty, Monster feed, Necromancer souls).
    // Only fire once per target - re-hitting an already-dead enemy must not
    // re-grant gold/souls/heals.
    if (target && target.isEnemy && target.isEnemy() && target.hp <= 0) {
      if (!target._passiveKillCounted) {
        target._passiveKillCounted = true;
        if (pa && pa.onEnemyKilled) pa.onEnemyKilled(subj, target);
        traitNotify(subj, "onEnemyKilled", [target]);
      }
    }
  }

  // --- Healing modifiers (Berserker halved, Nurse boosted) ----------------
  const _Game_Battler_gainHp = Game_Battler.prototype.gainHp;
  Game_Battler.prototype.gainHp = function (value) {
    if (value > 0) {
      const p = passiveOf(this);
      if (p && p.modifyHeal) {
        value = Math.round(p.modifyHeal(this, value));
      }
      value = Math.round(traitChain(this, "modifyHeal", [], value));
    }
    _Game_Battler_gainHp.call(this, value);
  };

  // --- Extra x-params in battle (evasion, crit, counter) ------------------
  const _Game_BattlerBase_xparam = Game_BattlerBase.prototype.xparam;
  Game_BattlerBase.prototype.xparam = function (xparamId) {
    let base = _Game_BattlerBase_xparam.call(this, xparamId);
    if (this.isActor && this.isActor() && isPassiveActor(this)) {
      const p = PASSIVES[classIdOf(this)];
      if (p && p.xparam) base = p.xparam(this, xparamId, base);
      base = traitChain(this, "xparam", [xparamId], base);
    }
    return base;
  };

  // --- Base param rate (Acrobat agility) ----------------------------------
  const _Game_BattlerBase_param = Game_BattlerBase.prototype.param;
  Game_BattlerBase.prototype.param = function (paramId) {
    let v = _Game_BattlerBase_param.call(this, paramId);
    if (this.isActor && this.isActor() && isPassiveActor(this)) {
      const p = PASSIVES[classIdOf(this)];
      if (p && p.paramRate) v = Math.round(v * p.paramRate(this, paramId, v));
      const tp = traitPassivesOf(this);
      for (let i = 0; i < tp.length; i++) {
        if (tp[i].paramRate) v = Math.round(v * tp[i].paramRate(this, paramId, v));
      }
    }
    return v;
  };

  // --- Special params (Mimic target rate) ---------------------------------
  const _Game_BattlerBase_sparam = Game_BattlerBase.prototype.sparam;
  Game_BattlerBase.prototype.sparam = function (sparamId) {
    let base = _Game_BattlerBase_sparam.call(this, sparamId);
    if (this.isActor && this.isActor() && isPassiveActor(this)) {
      const p = PASSIVES[classIdOf(this)];
      if (p && p.sparam) base = p.sparam(this, sparamId, base);
      base = traitChain(this, "sparam", [sparamId], base);
    }
    return base;
  };

  // --- Mental-state immunity (Psychologist) -------------------------------
  const _Game_BattlerBase_isStateResist = Game_BattlerBase.prototype.isStateResist;
  Game_BattlerBase.prototype.isStateResist = function (stateId) {
    if (
      this.isActor &&
      this.isActor() &&
      isPassiveActor(this) &&
      classIdOf(this) === 49 &&
      mentalStateIds().indexOf(stateId) >= 0
    ) {
      return true;
    }
    return _Game_BattlerBase_isStateResist.call(this, stateId);
  };

  // --- Battle EXP rate (Academic) -----------------------------------------
  const _Game_Actor_finalExpRate = Game_Actor.prototype.finalExpRate;
  Game_Actor.prototype.finalExpRate = function () {
    let r = _Game_Actor_finalExpRate.call(this);
    if (isPassiveActor(this) && classIdOf(this) === 48) r *= 1.25;
    return r;
  };

  // --- Battlemage: spells draw the MP shortfall from TP -------------------
  const isBattlemage = (b) =>
    !!(b && b.isActor && b.isActor() && isPassiveActor(b) && classIdOf(b) === 37);
  const _Game_BattlerBase_canPaySkillCost = Game_BattlerBase.prototype.canPaySkillCost;
  Game_BattlerBase.prototype.canPaySkillCost = function (skill) {
    if (isBattlemage(this)) {
      const mpCost = this.skillMpCost(skill);
      if (mpCost > this._mp) {
        const shortfall = mpCost - this._mp;
        return this._tp >= this.skillTpCost(skill) + shortfall;
      }
    }
    return _Game_BattlerBase_canPaySkillCost.call(this, skill);
  };
  const _Game_BattlerBase_paySkillCost = Game_BattlerBase.prototype.paySkillCost;
  Game_BattlerBase.prototype.paySkillCost = function (skill) {
    if (isBattlemage(this)) {
      const mpCost = this.skillMpCost(skill);
      if (mpCost > this._mp) {
        const shortfall = mpCost - this._mp;
        this._tp -= this.skillTpCost(skill) + shortfall;
        this._mp = 0;
        return;
      }
    }
    _Game_BattlerBase_paySkillCost.call(this, skill);
  };

  // --- Boxer: dodging an incoming hit builds a Combo stack -----------------
  const _Game_Action_apply = Game_Action.prototype.apply;
  Game_Action.prototype.apply = function (target) {
    _Game_Action_apply.call(this, target);
    const res = target && target.result ? target.result() : null;
    if (
      res &&
      (res.evaded || res.missed) &&
      isPassiveActor(target) &&
      classIdOf(target) === 17
    ) {
      target._comboStacks = Math.min(5, (target._comboStacks || 0) + 1);
      battleLog(
        T("BattlePassives.log.comboSlip", {
          target: target.name(),
          combo: target._comboStacks,
        })
      );
    }
  };

  // --- Scout: preemptive up, surprise down --------------------------------
  if (typeof BattleManager.ratePreemptive === "function") {
    const _BattleManager_ratePreemptive = BattleManager.ratePreemptive;
    BattleManager.ratePreemptive = function (troopAgi) {
      let r = _BattleManager_ratePreemptive.call(this, troopAgi);
      if (countLivingClassInParty(28) > 0) r = Math.min(0.9, r * 4 + 0.2);
      return r;
    };
  }
  if (typeof BattleManager.rateSurprise === "function") {
    const _BattleManager_rateSurprise = BattleManager.rateSurprise;
    BattleManager.rateSurprise = function (troopAgi) {
      let r = _BattleManager_rateSurprise.call(this, troopAgi);
      if (countLivingClassInParty(28) > 0) r *= 0.2;
      return r;
    };
  }

  // --- Spell MP cost (Archmage discount) ----------------------------------
  const _Game_Actor_skillMpCost = Game_Actor.prototype.skillMpCost;
  Game_Actor.prototype.skillMpCost = function (skill) {
    let cost = _Game_Actor_skillMpCost.call(this, skill);
    if (isPassiveActor(this)) {
      const p = PASSIVES[classIdOf(this)];
      if (p && p.skillMpCost) cost = p.skillMpCost(this, skill, cost);
      cost = traitChain(this, "skillMpCost", [skill], cost);
    }
    return Math.max(0, cost);
  };

  // --- Track "action finished" for per-action passives --------------------
  const _Game_Battler_onAllActionsEnd = Game_Battler.prototype.onAllActionsEnd;
  Game_Battler.prototype.onAllActionsEnd = function () {
    _Game_Battler_onAllActionsEnd.call(this);
    const p = passiveOf(this);
    if (p && p.afterAction) {
      p.afterAction(this, this._lastPassiveAction || null);
    }
    traitNotify(this, "afterAction", [this._lastPassiveAction || null]);
  };

  // Remember the last action a battler used so afterAction can inspect it.
  const _Game_Battler_useItem = Game_Battler.prototype.useItem;
  Game_Battler.prototype.useItem = function (item) {
    _Game_Battler_useItem.call(this, item);
    if (this._actions && this._currentAction) {
      this._lastPassiveAction = this._currentAction;
    }
  };
  const _Game_Battler_performActionStart = Game_Battler.prototype.performActionStart;
  Game_Battler.prototype.performActionStart = function (action) {
    _Game_Battler_performActionStart.call(this, action);
    this._currentAction = action;
    this._lastPassiveAction = action;
  };

  // --- Turn-end party passives (Nun, Bard, Beast) -------------------------
  const _Game_Battler_onTurnEnd = Game_Battler.prototype.onTurnEnd;
  Game_Battler.prototype.onTurnEnd = function () {
    _Game_Battler_onTurnEnd.call(this);
    if ($gameParty && $gameParty.inBattle()) {
      const p = passiveOf(this);
      if (p && p.onTurnEndSelf) p.onTurnEndSelf(this);
      traitNotify(this, "onTurnEndSelf", []);
    }
  };

  // --- Battle start flags --------------------------------------------------
  const _BattleManager_startBattle = BattleManager.startBattle;
  BattleManager.startBattle = function () {
    _BattleManager_startBattle.call(this);
    firstThree().forEach((actor) => {
      const p = PASSIVES[classIdOf(actor)];
      if (p && p.battleStart) p.battleStart(actor);
      traitNotify(actor, "battleStart", []);
    });
  };

  //==========================================================================
  // Gunmancer: the chamber
  //==========================================================================
  // The class gimmick, in two halves, both of which only exist while a firearm
  // is actually in hand:
  //
  //   1. Reloading is a casting motion. Snapping a fresh magazine home hands
  //      the Gunmancer a fifth of their maximum mana back, in or out of battle.
  //   2. A spell aimed at one enemy leaves the barrel rather than the hand: it
  //      spends a round, and the weapon is heard and animated firing it. With
  //      an empty magazine there is nothing to load the spell into, so those
  //      spells are refused outright (greyed out in the skill menu, the battle
  //      command list and the hotbar) until the gun is reloaded.
  //
  // Area spells, buffs, heals and anything cast with something other than a
  // gun in hand are untouched: they are cast the ordinary way and cost no ammo.

  const GUNMANCER_CLASS_ID = 16;
  // Fraction of maximum MP a reload returns.
  const RELOAD_MP_FRACTION = 1 / 5;

  /** Whether this battler is a first-three Gunmancer holding a firearm. */
  const isArmedGunmancer = (actor) =>
    !!actor &&
    isPassiveActor(actor) &&
    classIdOf(actor) === GUNMANCER_CLASS_ID &&
    equippedWeaponTypes(actor).indexOf(WTYPE_GUN) >= 0;

  /**
   * Whether a skill is one the gun fires for this actor: a magic skill that
   * damages (or drains from) a single enemy. Scope 1 is one enemy, scope 7 is
   * one enemy the user picks after a random roll; both are a single muzzle.
   * @param {Game_Actor} actor - the caster
   * @param {object} skill - $dataSkills entry
   * @returns {boolean} True when casting it should spend a round
   */
  const isChamberedSpell = (actor, skill) => {
    if (!skill || !isArmedGunmancer(actor)) return false;
    if (skill.stypeId !== 1) return false;
    if (skill.scope !== 1 && skill.scope !== 7) return false;
    const dmg = skill.damage;
    // Types 1 and 5 are HP damage and HP drain: the offensive ones.
    return !!dmg && (dmg.type === 1 || dmg.type === 5);
  };

  /**
   * The magazine of the weapon the actor is holding, or null when the weapon
   * carries no ammunition at all (WeaponSystem is the owner of that answer).
   */
  const bulletsLeft = (actor) =>
    actor && typeof actor.getCurrentBullets === "function"
      ? actor.getCurrentBullets()
      : null;

  // --- 1. Reload feeds the caster -----------------------------------------
  if (typeof Game_Actor.prototype.reloadBullets === "function") {
    const _reloadBullets = Game_Actor.prototype.reloadBullets;
    Game_Actor.prototype.reloadBullets = function () {
      const armed = isArmedGunmancer(this);
      const before = this.mp;
      _reloadBullets.call(this);
      if (!armed) return;
      this.gainMp(Math.ceil(this.mmp * RELOAD_MP_FRACTION));
      if (this.mp > before) {
        battleLog(T("BattlePassives.log.chamberedReload", { actor: this.name() }));
      }
    };
  }

  // --- 2. The spell leaves the barrel --------------------------------------
  // An empty magazine refuses the spell everywhere at once: every menu in the
  // game asks canUse(), and canUse() asks this.
  const _meetsSkillConditions = Game_BattlerBase.prototype.meetsSkillConditions;
  Game_BattlerBase.prototype.meetsSkillConditions = function (skill) {
    if (!_meetsSkillConditions.call(this, skill)) return false;
    if (!isChamberedSpell(this, skill)) return true;
    const left = bulletsLeft(this);
    return left === null || left > 0;
  };

  // Firing it spends the round, the same way a plain attack does.
  const _Game_Action_apply_chamber = Game_Action.prototype.apply;
  Game_Action.prototype.apply = function (target) {
    const subject = this.subject();
    if (
      this.isSkill() &&
      subject &&
      subject.isActor &&
      subject.isActor() &&
      isChamberedSpell(subject, this.item()) &&
      typeof subject.canAttackWithBullets === "function" &&
      subject.canAttackWithBullets()
    ) {
      subject.consumeBullet();
    }
    _Game_Action_apply_chamber.call(this, target);
  };

  // ...and the gun is seen and heard firing it. WeaponSystem only gives a skill
  // the weapon's own shot when the skill is physical or names weapon
  // animations; a chambered spell is neither, so it is declared an attacker
  // here instead.
  if (typeof Window_BattleLog !== "undefined") {
    const _startAction_chamber = Window_BattleLog.prototype.startAction;
    Window_BattleLog.prototype.startAction = function (subject, action, targets) {
      _startAction_chamber.call(this, subject, action, targets);
      if (
        action &&
        action.isSkill &&
        action.isSkill() &&
        subject &&
        subject.isActor &&
        subject.isActor() &&
        isChamberedSpell(subject, action.item())
      ) {
        this._lastAttacker = subject;
        this._multiAttackHitCount = 0;
        // null: the weapon's own shot, not a motion the skill named.
        this._skillAnimations = null;
      }
    };
  }

  // --- Clear per-battle flag state at battle end ---------------------------
  // These transient fields (set in battleStart / during combat) must not
  // persist across battles or leak into the save file.
  const _BattleManager_endBattle = BattleManager.endBattle;
  BattleManager.endBattle = function (result) {
    $gameParty.allMembers().forEach((actor) => {
      actor._spellEdgeElement = null;
      actor._attuneElement = null;
      actor._soulCharges = 0;
      actor._comboStacks = 0;
    });
    _gunFuPending = null;
    _BattleManager_endBattle.call(this, result);
  };

  //==========================================================================
  // NON-BATTLE HOOKS
  //==========================================================================

  // --- Survival drain (Monk slower, Cyborg none) --------------------------
  if (typeof Game_Actor.prototype.reduceHunger === "function") {
    const _reduceHunger = Game_Actor.prototype.reduceHunger;
    Game_Actor.prototype.reduceHunger = function (amount) {
      if (isPassiveActor(this)) {
        const p = PASSIVES[classIdOf(this)];
        if (p && p.needs && p.needs.hungerMult != null) {
          amount *= p.needs.hungerMult;
        }
        traitPassivesOf(this).forEach((t) => {
          if (t.needs && t.needs.hungerMult != null) amount *= t.needs.hungerMult;
        });
      }
      _reduceHunger.call(this, amount);
    };
  }
  if (typeof Game_Actor.prototype.reduceSleep === "function") {
    const _reduceSleep = Game_Actor.prototype.reduceSleep;
    Game_Actor.prototype.reduceSleep = function (amount) {
      if (isPassiveActor(this)) {
        const p = PASSIVES[classIdOf(this)];
        if (p && p.needs && p.needs.sleepMult != null) {
          amount *= p.needs.sleepMult;
        }
        traitPassivesOf(this).forEach((t) => {
          if (t.needs && t.needs.sleepMult != null) amount *= t.needs.sleepMult;
        });
      }
      _reduceSleep.call(this, amount);
    };
  }

  // --- Shop economy (Shopkeeper, CEO, Mercenary) --------------------------
  const bestBuyMult = () => {
    let mult = 1;
    firstThree().forEach((a) => {
      const p = PASSIVES[classIdOf(a)];
      if (p && p.economy && p.economy.buy < mult) mult = p.economy.buy;
      traitPassivesOf(a).forEach((t) => {
        if (t.economy && t.economy.buy < mult) mult = t.economy.buy;
      });
    });
    return mult;
  };
  const bestSellMult = () => {
    let mult = 1;
    firstThree().forEach((a) => {
      const p = PASSIVES[classIdOf(a)];
      if (p && p.economy && p.economy.sell > mult) mult = p.economy.sell;
      traitPassivesOf(a).forEach((t) => {
        if (t.economy && t.economy.sell > mult) mult = t.economy.sell;
      });
    });
    return mult;
  };

  if (typeof Window_ShopBuy !== "undefined" && Window_ShopBuy.prototype.price) {
    const _Window_ShopBuy_price = Window_ShopBuy.prototype.price;
    Window_ShopBuy.prototype.price = function (item) {
      const base = _Window_ShopBuy_price.call(this, item);
      const mult = bestBuyMult();
      return mult !== 1 ? Math.max(0, Math.floor(base * mult)) : base;
    };
  }
  if (typeof Scene_Shop !== "undefined" && Scene_Shop.prototype.sellingPrice) {
    const _Scene_Shop_sellingPrice = Scene_Shop.prototype.sellingPrice;
    Scene_Shop.prototype.sellingPrice = function () {
      const base = _Scene_Shop_sellingPrice.call(this);
      const mult = bestSellMult();
      return mult !== 1 ? Math.floor(base * mult) : base;
    };
  }

  //==========================================================================
  // ORACLE: enemy next-action telegraph on the battle HUD
  //==========================================================================

  const translate = (s) =>
    typeof window.translateText === "function" ? window.translateText(s) : s;

  // Best guess of the action an enemy will take next.
  function predictEnemyAction(enemy) {
    if (!enemy || !enemy.isAlive || !enemy.isAlive()) return null;
    // If the enemy already has actions queued for this turn, read the first.
    if (enemy._actions && enemy._actions.length > 0) {
      const act = enemy._actions[0];
      if (act && act.item && act.item()) return act.item().name;
    }
    // Otherwise fall back to the highest-rated pattern action.
    const data = enemy.enemy ? enemy.enemy() : null;
    if (data && data.actions && data.actions.length) {
      let best = null;
      data.actions.forEach((a) => {
        if (a.skillId > 0 && $dataSkills[a.skillId]) {
          if (!best || a.rating > best.rating) best = a;
        }
      });
      if (best) return $dataSkills[best.skillId].name;
    }
    return null;
  }

  const partyHasOracle = () => livingClassInParty(29);

  // Hook the enhanced HUD's enemy bar to draw the telegraph line.
  const _SBB = window.Sprite_BattleBar;
  if (_SBB && _SBB.prototype && _SBB.prototype.refresh) {
    const _Sprite_BattleBar_refresh = _SBB.prototype.refresh;
    _SBB.prototype.refresh = function () {
      _Sprite_BattleBar_refresh.call(this);
      if (!this._battler || !this._htmlOverlay) return;
      if (window.AsciiMode && window.AsciiMode.active) return;
      if (!partyHasOracle()) return;
      const next = predictEnemyAction(this._battler);
      if (!next) return;
      const label = T("BattlePassives.chip.next") + ": " + translate(next);
      // Every monster bar is the compact one now, and it keeps its last line
      // free for exactly this.
      this._htmlOverlay.addText(
        label,
        8,
        this.bitmap ? this.bitmap.height - 18 : 60,
        this.bitmap ? this.bitmap.width - 16 : 400,
        "left",
        12,
        "#ffd166",
        true,
        "black",
        1,
        "Bitter, serif",
        16
      );
    };
  }

  //==========================================================================
  // PUBLIC API
  //==========================================================================

  // Live, per-actor class-gimmick state, formatted as HUD chips ({label,color}).
  // Only the first three members (the passive contributors) return chips.
  // What a class gimmick chip means, for the hover explanation the HUD hangs
  // on it (BattleSystem/ShowStatesUI.js). A counter on a card says how many;
  // this says what they are for.
  const chipInfo = (key) => {
    const full = "BattlePassives.chipInfo." + key;
    return T.has(full) ? T(full) : "";
  };

  const elemShort = (id) => {
    const key = "BattlePassives.elem." + id;
    return T.has(key) ? T(key) : "";
  };
  function battleChipsFor(actor) {
    if (!actor || !actor.isActor || !actor.isActor()) return [];
    if (!isPassiveActor(actor)) return [];
    const chips = [];
    switch (classIdOf(actor)) {
      case 5: // Wrestler - Pin counter on the current target
        if (
          actor._pinCount > 0 &&
          actor._pinTarget &&
          actor._pinTarget.isAlive &&
          actor._pinTarget.isAlive()
        ) {
          chips.push({
            label: T("BattlePassives.chip.pin", { count: actor._pinCount }),
            info: chipInfo("pin"),
            color: "#ff9f43",
          });
        }
        break;
      case 11: { // Martial Artist - Chi build toward the 3rd-action refund
        const c = (actor._chiCount || 0) % 3;
        chips.push({ label: T("BattlePassives.chip.chi", { count: c }), info: chipInfo("chi"), color: "#66e0ff" });
        break;
      }
      case 17: // Boxer - Combo stacks from dodging
        if (actor._comboStacks > 0) {
          chips.push({
            label: T("BattlePassives.chip.combo", { count: actor._comboStacks }),
            info: chipInfo("combo"),
            color: "#ff9f43",
          });
        }
        break;
      case 36: // Illusionist - remaining decoys
        if (actor._decoys > 0) {
          chips.push({
            label: T("BattlePassives.chip.decoys", { count: actor._decoys }),
            info: chipInfo("decoys"),
            color: "#9ad0ff",
          });
        }
        break;
      case 26: // Samurai - Iaido first-strike ready
        if (actor._iaidoReady) {
          chips.push({ label: T("BattlePassives.chip.iaido"), info: chipInfo("iaido"), color: "#ffd166" });
        }
        break;
      case 34: // Spellblade - carried spell element
        if (actor._spellEdgeElement) {
          chips.push({
            label: T("BattlePassives.chip.edge", { elem: elemShort(actor._spellEdgeElement) }),
            info: chipInfo("edge"),
            color: "#c48cff",
          });
        }
        break;
      case 10: // Elementalist - weather attunement
        if (actor._attuneElement) {
          chips.push({
            label: T("BattlePassives.chip.attuned", { elem: elemShort(actor._attuneElement) }),
            info: chipInfo("attuned"),
            color: "#8fe388",
          });
        }
        break;
      case 31: // Necromancer - soul charges
        if (actor._soulCharges > 0) {
          chips.push({
            label: T("BattlePassives.chip.souls", { count: actor._soulCharges }),
            info: chipInfo("souls"),
            color: "#c48cff",
          });
        }
        break;
      case 61: // Demigod - divine blood revive still available
        if (actor._divineBloodReady) {
          chips.push({ label: T("BattlePassives.chip.divineBlood"), info: chipInfo("divineBlood"), color: "#ffe07a" });
        }
        break;
      case 13: { // Berserker - current Bloodrage bonus
        const bonus = Math.round(40 * (1 - actor.hp / Math.max(1, actor.mhp)));
        if (bonus > 0) {
          chips.push({ label: T("BattlePassives.chip.rage", { bonus: bonus }), info: chipInfo("rage"), color: "#ff6b6b" });
        }
        break;
      }
      case 33: { // Guardian - live Aegis ward strength
        const pct = Math.round(guardianWardFraction() * 100);
        if (pct > 0) {
          chips.push({ label: T("BattlePassives.chip.aegis", { pct: pct }), info: chipInfo("aegis"), color: "#7ec8ff" });
        }
        break;
      }
      case 8: // Cultist - night empowerment
        if (isNightHours()) {
          chips.push({ label: T("BattlePassives.chip.night"), info: chipInfo("night"), color: "#a99bff" });
        }
        break;
    }
    // Trait passives may contribute their own chips.
    traitPassivesOf(actor).forEach((t) => {
      if (t.chips) {
        const extra = t.chips(actor);
        if (extra && extra.length) chips.push.apply(chips, extra);
      }
    });
    return chips;
  }

  // Gun-Fu is armed only while a gun / projectile / bow is equipped, so show
  // the player when the follow-up shot is actually online.
  TRAIT_PASSIVES[GUNFU_TRAIT_ID].chips = (actor) =>
    hasRangedWeapon(actor)
      ? [{ label: T("BattlePassives.chip.gunFu"), info: chipInfo("gunFu"), color: "#ff9f43" }]
      : [];

  // How much the party's Convokers strengthen a summoned battler. Bonuses from
  // several eligible Convokers add up, so a coven calls up sturdier creatures.
  function summonBonus() {
    let hp = 0;
    let power = 0;
    firstThree().forEach((actor) => {
      const p = PASSIVES[classIdOf(actor)];
      if (p && p.summonBonus) {
        hp += p.summonBonus.hp || 0;
        power += p.summonBonus.power || 0;
      }
    });
    return { hp: 1 + hp, power: 1 + power };
  }

  window.BattleSystemPassiveSkills = {
    getPassive(classId) {
      return PASSIVES[classId] || null;
    },
    // --- Trait passives ---------------------------------------------------
    getTraitPassive(traitId) {
      return TRAIT_PASSIVES[traitId] || null;
    },
    hasTraitPassive(traitId) {
      return !!TRAIT_PASSIVES[traitId];
    },
    getTraitPassiveName(traitId) {
      return TRAIT_PASSIVES[traitId] ? traitText(traitId, "name") : "";
    },
    getTraitPassiveDescription(traitId) {
      if (!TRAIT_PASSIVES[traitId]) return "";
      const name = traitText(traitId, "name");
      const desc = traitText(traitId, "desc");
      return name ? `${name}: ${desc}` : desc;
    },
    getTraitPassiveEffect(traitId) {
      return TRAIT_PASSIVES[traitId] ? traitText(traitId, "desc") : "";
    },
    // Every trait passive an actor's selected traits grant, as
    // [{ traitId, name, desc }], for the creation UI and status screen.
    getActorTraitPassives(actor) {
      const out = [];
      const selected = actor && actor._selectedTraits;
      if (!selected) return out;
      selected.forEach((t) => {
        if (t && TRAIT_PASSIVES[t.id]) {
          out.push({
            traitId: t.id,
            name: traitText(t.id, "name"),
            desc: traitText(t.id, "desc"),
          });
        }
      });
      return out;
    },
    // Summon hook: multipliers a summoned battler's health and offence are
    // cut by, as { hp, power }, both 1 when no Convoker is contributing.
    getSummonBonus() {
      try {
        return summonBonus();
      } catch (e) {
        return { hp: 1, power: 1 };
      }
    },
    // HUD hook: live class-gimmick chips for an actor's battle bar.
    getBattleChips(actor) {
      try {
        return battleChipsFor(actor);
      } catch (e) {
        return [];
      }
    },
    getPassiveName(classId) {
      return PASSIVES[classId] ? passiveText(classId, "name") : "";
    },
    getPassiveDescription(classId) {
      if (!PASSIVES[classId]) return "";
      const name = passiveText(classId, "name");
      const desc = passiveText(classId, "desc");
      return name ? `${name}: ${desc}` : desc;
    },
    // Raw effect text without the passive's name prefix.
    getPassiveEffect(classId) {
      return PASSIVES[classId] ? passiveText(classId, "desc") : "";
    },

    // ----------------------------------------------------------------------
    // The passives that are felt OUTSIDE a battle
    // ----------------------------------------------------------------------
    // A class passive is not only a damage number. These four are read by the
    // systems they belong to - the army's paymaster, the reading ledger, the
    // salvage table and the growth menus - and each is the ONE answer to its
    // question, so nobody re-derives "is there a farmer in the party" from a
    // class id of their own. All of them obey the same first-three-members
    // scope every other passive here obeys.

    // Mercenaries know what a company is worth and what it should cost: every
    // one of them in the party takes 5% off the army's weekly wage bill.
    armyUpkeepMultiplier() {
      const mercs = countLivingClassInParty(38);
      return mercs > 0 ? Math.pow(0.95, mercs) : 1;
    },

    // An Archmage reads for the marrow of a thing, and gets twice as much out
    // of a book as anybody else does.
    bookPointsMultiplier(reader) {
      return reader && isPassiveActor(reader) && classIdOf(reader) === 27 ? 2 : 1;
    },

    // What the party pulls out of a terrain feature. A Hunter-Gatherer strips
    // anything worth stripping twice over; a Lumberjack takes a whole tree
    // apart rather than a few branches of it, and only a tree.
    salvageMultiplier(spec) {
      let mult = 1;
      if (countLivingClassInParty(52) > 0) mult *= 2;
      if (String(spec || "") === "Lumberjacking" && countLivingClassInParty(57) > 0) mult *= 10;
      return mult;
    },

    // A Farmer's beds and pens give three times what anybody else's do.
    growthYieldMultiplier() {
      return countLivingClassInParty(56) > 0 ? 3 : 1;
    },

    // A Police Officer can write off what they did as done in the name of the
    // law - up to 5000 gold of charges a day per officer, scaled by rank
    // (their level), and two officers on the strength sign for twice as much.
    // CrimeSystem owns the ledger and the wording; this is only the day's
    // allowance, in gold.
    POLICE_PARDON_PER_LEVEL: 5000,
    selfPardonAllowance() {
      return livingMembersOfClass(44)
        .reduce((sum, a) => sum + Math.max(1, a.level || 1) * 5000, 0);
    },

    // Who is signing it: the highest-ranking officer travelling, since it is
    // their name that goes on the report.
    pardonOfficer() {
      const officers = livingMembersOfClass(44);
      if (!officers.length) return null;
      return officers.slice().sort((a, b) => (b.level || 0) - (a.level || 0))[0];
    },

    // An Entertainer is never off. Travelling with one is company, a song and
    // something to look at, so the whole party's Fun climbs on its own instead
    // of draining: half the leisure a tick would have taken, per entertainer,
    // given back to every member. TimeDateSystem owns the needs and the clock;
    // this only says how much of a show is being put on.
    leisureGainRate() {
      return livingMembersOfClass(60)
        .reduce((sum, a) => sum + 0.5 + Math.min(0.5, (a.level || 1) * 0.01), 0);
    },

    // A Nurse knows what she is looking at. Anybody else has to wait out the
    // window period of an illness before it has a name (Health_DiseaseSystem);
    // with a nurse travelling, every illness the party is carrying is named
    // the day it is caught, which is also the day it can start being treated.
    diagnosesImmediately() {
      return countLivingClassInParty(51) > 0;
    },
  };
})();
