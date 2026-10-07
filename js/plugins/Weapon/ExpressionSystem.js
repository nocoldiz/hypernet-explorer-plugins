/*:
 * @target MZ
 * @plugindesc Expression System v1.0.0: an expression seed unlocks Expression, a power the player assembles out of triggers, conditions, branches, effects and a form
 * @author Omni-Lex
 * @help
 * ============================================================================
 * Expression System
 * ============================================================================
 *
 * An expression seed (item 165, tagged <UnlockExpression>) is used on one
 * party member from the backpack. It unlocks that character's Expression, and
 * is refused on a character who already has it. Seeds are a rare find in
 * loot (Crafting/RandomLootSystem.js), and the Expressions scenario hands
 * every character one already grown, with a power rolled at random. A
 * character no seed reached awakens on their own: at level 15 if their class
 * is magical (<Nature: Magical>), at level 25 otherwise, and a toast says so.
 *
 * An Expression is a power the player assembles, the way a Nen ability or a
 * Stand is assembled: out of a moment, the vows it is bound by, what it does
 * and the shape it takes. The Expression bench of the SkillMaster
 * (CharacterCreation/SkillMaster.js) draws it. The pieces:
 *
 *   TRIGGER     when it fires: one. Battle moments (a critical hit, an ally
 *               falling, a state taking hold), and moments of the world
 *               (money spent, a hurt taken on the map, the weather turning,
 *               heat rising, a meal, a disease, an allergy, a level gained, a
 *               word with somebody in Empathize, an opinion changing). Many
 *               are bound to something the player names: an element, a state,
 *               a party member, a sum, a weather, a need, an Empathize verb.
 *   CONDITIONS  up to three, joined by ALL (every one must hold) or ANY (one
 *               is enough). Any condition can be turned around with NOT.
 *               Conditions are vows: the stricter the power, the stronger it
 *               hits, and ALL is worth far more than ANY.
 *   BRANCH      one optional condition checked as the power fires. If it
 *               holds the THEN effects run, otherwise the ELSE effects.
 *   EFFECTS     up to two THEN effects and up to two ELSE effects.
 *   FORM        Aura (it comes off the character) or Summon (it manifests as
 *               a summon modelled on one of the party's follower pets).
 *   LIMITATIONS up to four vows the power is bound by: it cannot be used on a
 *               given weekday, only against one kind of enemy, only by night,
 *               only unarmed, only once a week, only at a price in blood or
 *               gold... Unlike a condition a limitation adds no strength. It
 *               makes the power CHEAPER and EASIER TO REACH: each one weighs
 *               1 to 3, and every point takes a share off the KP the power
 *               costs and lowers every stat requirement in it, so a heavily
 *               bound power can hold pieces the character's stats would not
 *               otherwise open. Limitations that rule each other out (night
 *               and day, a battle-only vow on a world trigger) are refused.
 *
 * In a battle it fires at most once per battle; out in the world at most once
 * per day. An effect that only means something in a fight (a buff, a blow
 * against the troop) does nothing out in the world, and the other way round.
 *
 * Triggers are open to everybody. Conditions, effects and the summon form ask
 * for a base stat (the measure a skill's <StatReq:> reads: class, creation,
 * permanent stat items, augments and grafted parts, then cut by whatever limbs
 * the character has lost). Each stat opens its own line of pieces: the
 * ordinary ones ask for up to 14, a stronger row opens at 20, and the last
 * condition and the last effect at 30. While editing, a piece the character
 * no longer reaches is greyed out, and a draft holding one cannot be
 * finalized until it is taken off.
 *
 * Finalizing spends knowledge (KP) for every piece that was not already part
 * of the finalized power. What is finalized always fires as finalized, even if
 * the character later loses the stats it asked for.
 *
 * Script API: window.Expression (see the object at the foot of this file).
 * ============================================================================
 */

(() => {
    'use strict';

    const UNLOCK_TAG = 'UnlockExpression';   // i18n-ignore  item note tag

    // i18n-ignore-start  option keys, stat keys, slot ids, parameter kinds and
    // the ids they bind to; every name is read from Expression.* in the i18n
    const CATEGORIES = ['trigger', 'rule', 'effect', 'form', 'limit'];
    // Where the pieces of each kind can go, and how many each place holds.
    const SLOTS = { trigger: 1, rules: 3, branch: 1, effects: 2, elseEffects: 2, form: 1, limits: 4 };
    const SLOT_CATEGORY = { trigger: 'trigger', rules: 'rule', branch: 'rule', effects: 'effect', elseEffects: 'effect', form: 'form', limits: 'limit' };
    const STAT_PARAM = { STR: 2, CON: 3, INT: 4, WIS: 5, DEX: 6, PSI: 7 };

    // What some pieces are bound to, beyond the database's own lists.
    const MONEY_STEPS = [1000, 10000, 100000, 1000000];      // 10, 100, 1000, 10000 euros
    const WEATHERS = ['none', 'rain', 'storm', 'snow'];
    const NEEDS = ['hunger', 'sleep', 'hygiene', 'social', 'leisure', 'bladder'];
    const EMPATHIZE_VERBS = ['freeChat', 'socialize', 'bicker', 'gift', 'bribe', 'treat', 'feed',
        'preach', 'debate', 'teach', 'learn', 'romance', 'cardDuel', 'challenge',
        'accuse', 'attack', 'pickpocket', 'infect'];
    const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];                    // Date#getDay: 0 is Sunday

    // The catalogue. `where` says where a piece means something: battle,
    // world or any. Triggers ask for no stat. Conditions and effects come in
    // lines per stat: the ordinary ones, the row that opens at 20, and the one
    // piece of each kind that opens at 30. `param` names what the player binds
    // the piece to.
    const OPTIONS = [
        // Triggers in battle.
        { key: 'opening',        cat: 'trigger', where: 'battle', cost: 60,  icon: 203 },
        { key: 'eachRound',      cat: 'trigger', where: 'battle', cost: 60,  icon: 220 },
        { key: 'bloodied',       cat: 'trigger', where: 'battle', cost: 80,  icon: 86 },
        { key: 'mpDry',          cat: 'trigger', where: 'battle', cost: 80,  icon: 17 },
        { key: 'fallenAlly',     cat: 'trigger', where: 'battle', cost: 100, icon: 85 },
        { key: 'memberFalls',    cat: 'trigger', where: 'battle', cost: 120, icon: 85,  param: 'member' },
        { key: 'takedown',       cat: 'trigger', where: 'battle', cost: 120, icon: 119 },
        { key: 'hitByElement',   cat: 'trigger', where: 'battle', cost: 120, icon: 64,  param: 'element' },
        { key: 'dealtElement',   cat: 'trigger', where: 'battle', cost: 150, icon: 66,  param: 'element' },
        { key: 'stateOnEnemy',   cat: 'trigger', where: 'battle', cost: 150, icon: 58,  param: 'state' },
        { key: 'struckTrue',     cat: 'trigger', where: 'battle', cost: 150, icon: 126 },
        { key: 'deathsDoor',     cat: 'trigger', where: 'battle', cost: 300, icon: 1 },
        // Triggers anywhere.
        { key: 'stateOnSelf',    cat: 'trigger', where: 'any',    cost: 120, icon: 9,   param: 'state' },
        { key: 'afflicted',      cat: 'trigger', where: 'any',    cost: 100, icon: 9 },
        { key: 'levelUp',        cat: 'trigger', where: 'any',    cost: 80,  icon: 87 },
        // Triggers in the world.
        { key: 'spend',          cat: 'trigger', where: 'world',  cost: 80,  icon: 187, param: 'money' },
        { key: 'mapHurt',        cat: 'trigger', where: 'world',  cost: 80,  icon: 86 },
        { key: 'weatherTurns',   cat: 'trigger', where: 'world',  cost: 80,  icon: 69,  param: 'weather' },
        { key: 'heatRises',      cat: 'trigger', where: 'world',  cost: 100, icon: 5 },
        { key: 'crime',          cat: 'trigger', where: 'world',  cost: 100, icon: 126 },
        { key: 'needLow',        cat: 'trigger', where: 'world',  cost: 80,  icon: 219, param: 'need' },
        { key: 'eat',            cat: 'trigger', where: 'world',  cost: 60,  icon: 219 },
        { key: 'diseased',       cat: 'trigger', where: 'world',  cost: 100, icon: 2 },
        { key: 'allergic',       cat: 'trigger', where: 'world',  cost: 100, icon: 184 },
        { key: 'empathize',      cat: 'trigger', where: 'world',  cost: 100, icon: 84,  param: 'empathize' },
        { key: 'admired',        cat: 'trigger', where: 'world',  cost: 100, icon: 84 },
        { key: 'scorned',        cat: 'trigger', where: 'world',  cost: 100, icon: 85 },
        { key: 'rested',         cat: 'trigger', where: 'world',  cost: 60,  icon: 205 },
        { key: 'questDone',      cat: 'trigger', where: 'world',  cost: 120, icon: 145 },
        { key: 'arrive',         cat: 'trigger', where: 'world',  cost: 60,  icon: 140 },
        // Conditions.
        { key: 'outnumbered',    cat: 'rule',    where: 'battle', stat: 'INT', req: 6,  cost: 60,  icon: 125 },
        { key: 'wounded',        cat: 'rule',    where: 'any',    stat: 'CON', req: 6,  cost: 60,  icon: 86 },
        { key: 'night',          cat: 'rule',    where: 'any',    stat: 'WIS', req: 6,  cost: 60,  icon: 270 },
        { key: 'brimming',       cat: 'rule',    where: 'any',    stat: 'INT', req: 8,  cost: 80,  icon: 25 },
        { key: 'weatherIs',      cat: 'rule',    where: 'any',    stat: 'WIS', req: 8,  cost: 80,  icon: 69,  param: 'weather' },
        { key: 'indoors',        cat: 'rule',    where: 'any',    stat: 'DEX', req: 8,  cost: 60,  icon: 205 },
        { key: 'earlyRounds',    cat: 'rule',    where: 'battle', stat: 'DEX', req: 10, cost: 80,  icon: 220 },
        { key: 'wealthy',        cat: 'rule',    where: 'any',    stat: 'PSI', req: 10, cost: 80,  icon: 191, param: 'money' },
        { key: 'wanted',         cat: 'rule',    where: 'any',    stat: 'DEX', req: 12, cost: 100, icon: 5 },
        { key: 'needLowNow',     cat: 'rule',    where: 'any',    stat: 'CON', req: 12, cost: 100, icon: 219, param: 'need' },
        { key: 'memberStanding', cat: 'rule',    where: 'any',    stat: 'WIS', req: 12, cost: 120, icon: 84,  param: 'member' },
        { key: 'memberDown',     cat: 'rule',    where: 'any',    stat: 'CON', req: 12, cost: 120, icon: 85,  param: 'member' },
        { key: 'alone',          cat: 'rule',    where: 'any',    stat: 'CON', req: 14, cost: 120, icon: 88 },
        { key: 'sick',           cat: 'rule',    where: 'any',    stat: 'WIS', req: 14, cost: 120, icon: 2 },
        { key: 'selfHasState',   cat: 'rule',    where: 'any',    stat: 'INT', req: 14, cost: 150, icon: 24,  param: 'state' },
        { key: 'enemyHasState',  cat: 'rule',    where: 'battle', stat: 'INT', req: 20, cost: 380, icon: 58,  param: 'state' },
        { key: 'bossFight',      cat: 'rule',    where: 'battle', stat: 'STR', req: 20, cost: 380, icon: 145 },
        { key: 'duel',           cat: 'rule',    where: 'battle', stat: 'DEX', req: 20, cost: 380, icon: 112 },
        { key: 'lastStand',      cat: 'rule',    where: 'any',    stat: 'PSI', req: 30, cost: 900, icon: 5 },
        // Effects.
        { key: 'mend',           cat: 'effect',  where: 'any',    stat: 'WIS', req: 6,  cost: 60,  icon: 176 },
        { key: 'focus',          cat: 'effect',  where: 'any',    stat: 'INT', req: 6,  cost: 60,  icon: 178 },
        { key: 'restoreNeed',    cat: 'effect',  where: 'world',  stat: 'CON', req: 8,  cost: 80,  icon: 219, param: 'need' },
        { key: 'bulwark',        cat: 'effect',  where: 'battle', stat: 'CON', req: 10, cost: 100, icon: 43 },
        { key: 'fury',           cat: 'effect',  where: 'battle', stat: 'STR', req: 10, cost: 100, icon: 42 },
        { key: 'quicken',        cat: 'effect',  where: 'battle', stat: 'DEX', req: 12, cost: 120, icon: 46 },
        { key: 'purge',          cat: 'effect',  where: 'any',    stat: 'WIS', req: 12, cost: 120, icon: 221 },
        { key: 'mendMember',     cat: 'effect',  where: 'any',    stat: 'WIS', req: 12, cost: 120, icon: 84,  param: 'member' },
        { key: 'windfall',       cat: 'effect',  where: 'world',  stat: 'PSI', req: 12, cost: 120, icon: 191 },
        { key: 'grant',          cat: 'effect',  where: 'any',    stat: 'PSI', req: 14, cost: 150, icon: 40,  param: 'helpful' },
        { key: 'inflict',        cat: 'effect',  where: 'battle', stat: 'INT', req: 14, cost: 150, icon: 59,  param: 'harmful' },
        { key: 'coolHeat',       cat: 'effect',  where: 'world',  stat: 'DEX', req: 14, cost: 150, icon: 72 },
        { key: 'cure',           cat: 'effect',  where: 'any',    stat: 'WIS', req: 14, cost: 150, icon: 221 },
        { key: 'elementBurst',   cat: 'effect',  where: 'battle', stat: 'INT', req: 20, cost: 380, icon: 72,  param: 'element' },
        { key: 'shockwave',      cat: 'effect',  where: 'battle', stat: 'STR', req: 20, cost: 380, icon: 66 },
        { key: 'rally',          cat: 'effect',  where: 'any',    stat: 'WIS', req: 20, cost: 380, icon: 84 },
        { key: 'reviveMember',   cat: 'effect',  where: 'any',    stat: 'WIS', req: 20, cost: 380, icon: 297, param: 'member' },
        { key: 'rebirth',        cat: 'effect',  where: 'any',    stat: 'WIS', req: 30, cost: 900, icon: 225 },
        // Forms: the shape it takes.
        { key: 'aura',           cat: 'form',    where: 'any',    cost: 0,   icon: 87 },
        { key: 'summon',         cat: 'form',    where: 'battle', stat: 'PSI', req: 12, cost: 150, icon: 296, param: 'pet' },
        // Limitations: vows that bind the power. Never stat-gated and free to
        // fit; `weight` is how much each one binds, and so how much it gives
        // back (see LIMIT_DISCOUNT and LIMIT_LEEWAY).
        { key: 'notOnWeekday',   cat: 'limit',   where: 'any',    weight: 1, icon: 220, param: 'weekday' },
        { key: 'onlyOnWeekday',  cat: 'limit',   where: 'any',    weight: 3, icon: 220, param: 'weekday' },
        { key: 'onlyVsKind',     cat: 'limit',   where: 'battle', weight: 3, icon: 119, param: 'archetype' },
        { key: 'notVsBoss',      cat: 'limit',   where: 'any',    weight: 1, icon: 145 },
        { key: 'onlyVsBoss',     cat: 'limit',   where: 'battle', weight: 3, icon: 145 },
        { key: 'onlyAtNight',    cat: 'limit',   where: 'any',    weight: 2, icon: 270 },
        { key: 'onlyByDay',      cat: 'limit',   where: 'any',    weight: 1, icon: 69 },
        { key: 'onlyInWeather',  cat: 'limit',   where: 'any',    weight: 2, icon: 69,  param: 'weather' },
        { key: 'onlyIndoors',    cat: 'limit',   where: 'any',    weight: 2, icon: 205 },
        { key: 'onlyOutdoors',   cat: 'limit',   where: 'any',    weight: 1, icon: 140 },
        { key: 'onlyHurt',       cat: 'limit',   where: 'any',    weight: 2, icon: 86 },
        { key: 'onlyUnharmed',   cat: 'limit',   where: 'any',    weight: 2, icon: 176 },
        { key: 'onlyAlone',      cat: 'limit',   where: 'any',    weight: 3, icon: 88 },
        { key: 'onlyWithMember', cat: 'limit',   where: 'any',    weight: 2, icon: 84,  param: 'member' },
        { key: 'onlyUnarmed',    cat: 'limit',   where: 'any',    weight: 2, icon: 76 },
        { key: 'onlyInBattle',   cat: 'limit',   where: 'battle', weight: 1, icon: 112 },
        { key: 'onlyInWorld',    cat: 'limit',   where: 'world',  weight: 1, icon: 190 },
        { key: 'oncePerWeek',    cat: 'limit',   where: 'any',    weight: 2, icon: 221 },
        { key: 'bloodPrice',     cat: 'limit',   where: 'any',    weight: 2, icon: 1 },
        { key: 'spiritPrice',    cat: 'limit',   where: 'any',    weight: 1, icon: 17 },
        { key: 'goldPrice',      cat: 'limit',   where: 'any',    weight: 1, icon: 191 }
    ];
    // i18n-ignore-end
    const BY_KEY = {};
    OPTIONS.forEach(o => { BY_KEY[o.key] = o; });

    // What a condition adds to the effects, by how they are joined. The last
    // stand is worth four of an ordinary vow.
    const VOW_ALL = 0.25;
    const VOW_ANY = 0.1;
    const LAST_STAND_WEIGHT = 4;
    const BOSS_RATE = 0.5;           // a boss takes half of anything aimed at all enemies
    const BUFF_TURNS = 3;
    const MEND_RATE = 0.3;
    const FOCUS_RATE = 0.3;
    const MEMBER_MEND_RATE = 0.4;
    const RALLY_RATE = 0.2;
    const SHOCK_RATE = 0.15;
    const BURST_RATE = 0.12;
    const INFLICT_CHANCE = 0.6;
    const MEMBER_REVIVE_RATE = 0.5;
    const REBIRTH_RATE = 0.3;
    const NEED_RESTORE = 40;         // percent of a need given back
    const WINDFALL_GOLD = 500;       // 5 euros, before the vows
    const HEAT_COOL = 30;
    const EARLY_ROUNDS = 3;
    const LAST_STAND_HP = 0.25;
    const NEED_LOW = 25;             // percent under which a need is "low"
    const NIGHT_FROM = 20;
    const NIGHT_TO = 6;
    const WORLD_POLL_FRAMES = 30;
    // What a point of limitation gives back: a share of the KP and a lowered
    // stat requirement on every piece, each with a ceiling so no amount of vows
    // makes a power free or opens everything.
    const LIMIT_DISCOUNT = 0.06;
    const MAX_DISCOUNT = 0.6;
    const LIMIT_LEEWAY = 2;
    const MAX_LEEWAY = 12;
    const BLOOD_PRICE = 0.25;        // of maximum HP, never below 1 HP left
    const GOLD_PRICE = 0.05;         // of the party's gold
    const WEEK_DAYS = 7;
    // Limitations that rule each other out: a power bound by both never fires.
    const LIMIT_CLASHES = [
        ['onlyAtNight', 'onlyByDay'], ['onlyIndoors', 'onlyOutdoors'], ['onlyHurt', 'onlyUnharmed'],
        ['onlyInBattle', 'onlyInWorld'], ['notVsBoss', 'onlyVsBoss'], ['onlyAlone', 'onlyWithMember']
    ];

    const isUnlockItem = (item) => !!(item && item.meta && item.meta[UNLOCK_TAG]);
    const isActor = (battler) => !!(battler && typeof battler.isActor === 'function' && battler.isActor());
    // A character the seed never reached awakens on their own: a caster's
    // class (<Nature: Magical>) at level 15, any other class at 25.
    const AWAKEN_LEVEL_MAGICAL = 15;
    const AWAKEN_LEVEL_MUNDANE = 25;
    const awakensAt = (actor) => {
        const data = actor && typeof actor.currentClass === 'function' ? actor.currentClass() : null;
        const MN = window.MagicNature;
        return data && MN && MN.isMagicalData && MN.isMagicalData(data) ? AWAKEN_LEVEL_MAGICAL : AWAKEN_LEVEL_MUNDANE;
    };
    const awakened = (actor) => isActor(actor) && Number(actor.level) >= awakensAt(actor);
    const isUnlocked = (actor) => !!(actor && (actor._expressionUnlocked || awakened(actor)));
    const tx = (s) => (typeof window.translateText === 'function' ? window.translateText(s) : s);

    const unlock = (actor) => {
        if (!isActor(actor) || isUnlocked(actor)) return false;
        actor._expressionUnlocked = true;
        return true;
    };

    const announceAwakening = (actor) => {
        if (!window.ParchmentToast) return;
        window.ParchmentToast.show(T('Expression.awakened', { name: actor.name() }), {
            severity: 'good',
            key: 'expression:' + actor.actorId()   // i18n-ignore  dedupe key
        });
    };

    const members = () => {
        if (typeof $gameParty === 'undefined' || !$gameParty || !$gameParty.allMembers) return [];
        return $gameParty.allMembers().filter(isUnlocked);
    };

    const anyInParty = () => members().length > 0;
    const option = (key) => BY_KEY[key] || null;
    const options = (cat) => OPTIONS.filter(o => o.cat === cat);

    // ── Requirements ─────────────────────────────────────────────────────
    // The base stat a skill's requirement reads (SkillStatReq.baseStat), cut
    // by the limbs the character has lost (Health_Core keeps that as a
    // percentage per parameter in _statModifiers). Worn gear does not count.
    const statOf = (actor, stat) => {
        const paramId = STAT_PARAM[stat];
        if (!actor || paramId === undefined) return 0;
        const req = window.SkillStatReq;
        let value = req && req.baseStat ? req.baseStat(actor, paramId)
            : (actor.paramBase ? actor.paramBase(paramId) : 0);
        const mods = actor._statModifiers;
        if (mods && mods[paramId]) value = Math.round(value * (1 + mods[paramId] / 100));
        return Math.max(0, Math.floor(value));
    };

    // How much a power's limitations bind it: the sum of their weights.
    const limitPoints = (power) => ((power && power.limits) || [])
        .reduce((sum, e) => sum + ((option(e.key) && option(e.key).weight) || 0), 0);
    const discountOf = (power) => Math.min(MAX_DISCOUNT, limitPoints(power) * LIMIT_DISCOUNT);
    const leewayOf = (power) => Math.min(MAX_LEEWAY, limitPoints(power) * LIMIT_LEEWAY);
    // The leeway that applies to this character right now: the draft's, since
    // the draft is what is being built (and starts as the finalized power).
    const leewayFor = (actor) => leewayOf(actor && (actor._expressionDraft || actor._expressionFinal));
    // The requirement a piece asks of this character, after the leeway.
    const reqFor = (actor, key) => {
        const o = option(key);
        if (!o || !o.stat || !o.req) return 0;
        return Math.max(0, o.req - leewayFor(actor));
    };

    // A piece that asks for no stat (every trigger, the aura, every
    // limitation) is always open; the rest are open from their requirement,
    // lowered by the limitations the power is bound by.
    const meets = (actor, key) => {
        const o = option(key);
        if (!o) return false;
        if (!o.stat || !o.req) return true;
        return statOf(actor, o.stat) >= reqFor(actor, key);
    };

    // ── What a piece can be bound to ─────────────────────────────────────
    const isHarmful = (state) => {
        if (!state) return false;
        if (state.restriction > 0) return true;
        return (state.traits || []).some(t =>
            (t.code === Game_BattlerBase.TRAIT_PARAM && t.value < 1) ||
            (t.code === Game_BattlerBase.TRAIT_XPARAM && t.dataId === 7 && t.value < 0));
    };

    const usableStates = () => (typeof $dataStates === 'undefined' || !$dataStates) ? [] :
        $dataStates.filter(s => s && s.id > 1 && s.iconIndex > 0 && (s.name || '').trim());

    const moneyLabel = (gold) => window.MoneyFormatter ? window.MoneyFormatter.format(gold) : String(gold);

    // The kinds of enemy there are: every archetype the bestiary's creatures
    // carry, named the way the anatomy books name them.
    let _archetypes = null;
    const archetypes = () => {
        if (_archetypes) return _archetypes;
        const list = (typeof $dataEnemies !== 'undefined' && $dataEnemies) || [];
        if (!list.length) return [];
        const seen = new Set();
        list.forEach(e => { const a = e && e.meta && e.meta.Archetype; if (typeof a === 'string' && a.trim()) seen.add(a.trim()); });
        _archetypes = [...seen].sort();
        return _archetypes;
    };
    const archetypeName = (a) => {
        const key = 'enemyArchetypes.' + String(a).toLowerCase() + '.name';   // i18n-ignore  enemyArchetypes.json key
        const name = typeof window.getArchetypeText === 'function' ? window.getArchetypeText(key) : '';
        return name && name !== key ? name : String(a);
    };

    // Every value a piece of this kind can be bound to, as { arg, label, icon }.
    const argChoices = (actor, param) => {
        switch (param) {
            case 'element': {
                const list = (typeof $dataSystem !== 'undefined' && $dataSystem && $dataSystem.elements) || [];
                return list.map((name, id) => ({ arg: id, label: tx(name), icon: 0 }))
                    .filter(c => c.arg > 0 && (c.label || '').trim());
            }
            case 'state':
            case 'harmful':
            case 'helpful':
                return usableStates()
                    .filter(s => param === 'state' || (param === 'harmful') === isHarmful(s))
                    .map(s => ({ arg: s.id, label: tx(s.name), icon: s.iconIndex }));
            case 'member':
                if (typeof $gameParty === 'undefined' || !$gameParty) return [];
                return $gameParty.allMembers().filter(m => m !== actor)
                    .map(m => ({ arg: m.actorId(), label: m.name(), icon: 0 }));
            case 'pet': {
                const pets = window.PetSystem && window.PetSystem.getPets ? window.PetSystem.getPets() : [];
                return (pets || []).filter(p => p && p.id).map(p => ({ arg: p.id, label: p.name || '', icon: 0 }));
            }
            case 'money':
                return MONEY_STEPS.map(g => ({ arg: g, label: moneyLabel(g), icon: 0 }));
            case 'weather':
                return WEATHERS.map(w => ({ arg: w, label: T('Expression.weather.' + w), icon: 0 }));
            case 'need':
                return NEEDS.map(n => ({ arg: n, label: T('Expression.need.' + n), icon: 0 }));
            case 'empathize':
                return EMPATHIZE_VERBS.map(v => ({ arg: v, label: T('Expression.empathize.' + v), icon: 0 }));
            case 'weekday':
                return WEEKDAYS.map(d => ({ arg: d, label: T('HypernetCalendar.weekdayLong.' + d), icon: 0 }));
            case 'archetype':
                return archetypes().map(a => ({ arg: a, label: archetypeName(a), icon: 0 }));
            default:
                return [];
        }
    };

    const argLabel = (param, arg) => {
        if (arg === null || arg === undefined) return '';
        const hit = argChoices(null, param).find(c => c.arg === arg);
        if (hit) return hit.label;
        if (param === 'member') {
            const a = typeof $gameActors !== 'undefined' && $gameActors ? $gameActors.actor(arg) : null;
            return a ? a.name() : '';
        }
        return '';
    };

    // A piece as it reads on a slot: its name, and what it is bound to.
    const entryLabel = (entry) => {
        if (!entry) return '';
        const o = option(entry.key);
        const name = T('Expression.option.' + entry.key + '.name');
        const bound = o && o.param ? argLabel(o.param, entry.arg) : '';
        const text = bound ? T('Expression.bound', { name: name, arg: bound }) : name;
        return entry.not ? T('Expression.negated', { name: text }) : text;
    };

    // ── Draft and finalized power ────────────────────────────────────────
    const blank = () => ({
        form: { key: 'aura', arg: null, not: false },
        trigger: null,
        logic: 'all',
        rules: [],
        branch: null,
        effects: [],
        elseEffects: [],
        limits: []
    });

    const copyEntry = (e) => e ? { key: e.key, arg: e.arg === undefined ? null : e.arg, not: !!e.not } : null;
    const clone = (p) => ({
        form: copyEntry(p.form) || { key: 'aura', arg: null, not: false },
        trigger: copyEntry(p.trigger),
        logic: p.logic === 'any' ? 'any' : 'all',
        rules: (p.rules || []).map(copyEntry),
        branch: copyEntry(p.branch),
        effects: (p.effects || []).map(copyEntry),
        elseEffects: (p.elseEffects || []).map(copyEntry),
        limits: (p.limits || []).map(copyEntry)
    });

    const entriesOf = (p) => p ? [p.form, p.trigger, p.branch].concat(p.rules || [], p.effects || [], p.elseEffects || [], p.limits || [])
        .filter(Boolean) : [];
    const idOf = (e) => e.key + ':' + (e.arg === null || e.arg === undefined ? '' : e.arg);

    const finalized = (actor) => (actor && actor._expressionFinal) || null;

    // A draft starts as whatever was last finalized, so editing a power starts
    // from the power.
    const draft = (actor) => {
        if (!actor) return blank();
        if (!actor._expressionDraft) actor._expressionDraft = actor._expressionFinal ? clone(actor._expressionFinal) : blank();
        if (!actor._expressionDraft.limits) actor._expressionDraft.limits = [];
        return actor._expressionDraft;
    };

    const isList = (slot) => slot === 'rules' || slot === 'effects' || slot === 'elseEffects' || slot === 'limits';

    // Puts a piece into a slot. A piece that is already there comes off
    // instead, and a full row pushes out its oldest piece rather than refusing.
    const place = (actor, slot, key, arg) => {
        const o = option(key);
        if (!o || !isUnlocked(actor) || SLOT_CATEGORY[slot] !== o.cat) return { ok: false, reason: 'missing' };
        if (o.param && (arg === null || arg === undefined)) return { ok: false, reason: 'needsArg' };
        if (slot === 'elseEffects' && !draft(actor).branch) return { ok: false, reason: 'needsBranch' };
        const d = draft(actor);
        const entry = { key: key, arg: o.param ? arg : null, not: false };
        if (isList(slot)) {
            const list = d[slot];
            const at = list.findIndex(e => idOf(e) === idOf(entry));
            if (at >= 0) { list.splice(at, 1); return { ok: true, on: false }; }
            if (!meets(actor, key)) return { ok: false, reason: 'locked' };
            list.push(entry);
            while (list.length > SLOTS[slot]) list.shift();
            return { ok: true, on: true };
        }
        if (slot === 'form') {
            if (!meets(actor, key)) return { ok: false, reason: 'locked' };
            d.form = entry;
            return { ok: true, on: true };
        }
        if (d[slot] && idOf(d[slot]) === idOf(entry)) {
            d[slot] = null;
            if (slot === 'branch') d.elseEffects = [];
            return { ok: true, on: false };
        }
        if (!meets(actor, key)) return { ok: false, reason: 'locked' };
        d[slot] = entry;
        return { ok: true, on: true };
    };

    // Taking a piece off is always allowed: it is how a draft holding a piece
    // the character has lost the stats for is mended.
    const removeAt = (actor, slot, index) => {
        const d = draft(actor);
        if (isList(slot)) {
            if (index < 0 || index >= d[slot].length) return false;
            d[slot].splice(index, 1);
            return true;
        }
        if (slot === 'form') { d.form = { key: 'aura', arg: null, not: false }; return true; }
        if (!d[slot]) return false;
        d[slot] = null;
        if (slot === 'branch') d.elseEffects = [];
        return true;
    };

    const toggleNot = (actor, slot, index) => {
        const d = draft(actor);
        const entry = slot === 'branch' ? d.branch : (slot === 'rules' ? d.rules[index] : null);
        if (!entry) return false;
        entry.not = !entry.not;
        return true;
    };

    const setLogic = (actor, logic) => {
        draft(actor).logic = logic === 'any' ? 'any' : 'all';
        return true;
    };

    const isLost = (actor, entry) => !!entry && !meets(actor, entry.key);

    // Limitations that leave the power unable to fire at all: two that rule
    // each other out, two different "only on" days or weathers, or a vow that
    // only holds in battle on a trigger that only comes in the world (or the
    // other way round). Refused, so nobody banks the discount on a dead power.
    const neverFires = (power) => {
        const limits = (power && power.limits) || [];
        const keys = limits.map(e => e.key);
        if (LIMIT_CLASHES.some(([a, b]) => keys.includes(a) && keys.includes(b))) return true;
        for (const k of ['onlyOnWeekday', 'onlyInWeather']) {
            const args = new Set(limits.filter(e => e.key === k).map(e => e.arg));
            if (args.size > 1) return true;
        }
        const days = limits.filter(e => e.key === 'onlyOnWeekday').map(e => e.arg);
        if (days.length && limits.some(e => e.key === 'notOnWeekday' && days.includes(e.arg))) return true;
        const t = power && power.trigger && option(power.trigger.key);
        if (t && t.where !== 'any') {
            const wrong = t.where === 'battle' ? 'world' : 'battle';
            if (limits.some(e => option(e.key) && option(e.key).where === wrong)) return true;
        }
        return false;
    };

    // What finalizing costs: every piece that is not already part of the
    // finalized power, less the share the limitations take off.
    const costOf = (actor) => {
        const d = draft(actor);
        const owned = entriesOf(finalized(actor)).map(idOf);
        const full = entriesOf(d).filter(e => !owned.includes(idOf(e)))
            .reduce((sum, e) => sum + ((option(e.key) && option(e.key).cost) || 0), 0);
        return Math.round(full * (1 - discountOf(d)));
    };

    const finalizeCheck = (actor) => {
        const d = draft(actor);
        const fin = finalized(actor);
        const cost = costOf(actor);
        if (!d.trigger || !d.effects.length) return { ok: false, reason: 'incomplete', cost };
        if (neverFires(d)) return { ok: false, reason: 'neverFires', cost };
        if (entriesOf(d).some(e => isLost(actor, e))) return { ok: false, reason: 'beyondStats', cost };
        if (fin && JSON.stringify(clone(fin)) === JSON.stringify(clone(d))) return { ok: false, reason: 'unchanged', cost };
        const kp = $gameSystem && $gameSystem.getKnowledge ? $gameSystem.getKnowledge() : 0;
        if (kp < cost) return { ok: false, reason: 'kp', cost };
        return { ok: true, reason: '', cost };
    };

    const finalize = (actor) => {
        const check = finalizeCheck(actor);
        if (!check.ok) return check;
        if (check.cost > 0) $gameSystem.spendKnowledge(check.cost);
        actor._expressionFinal = clone(draft(actor));
        return check;
    };

    const potency = (power) => {
        if (!power) return 1;
        const vow = power.logic === 'any' ? VOW_ANY : VOW_ALL;
        return 1 + (power.rules || []).reduce((sum, e) =>
            sum + vow * (e.key === 'lastStand' ? LAST_STAND_WEIGHT : 1), 0);
    };

    // ── A power rolled at random ─────────────────────────────────────────
    // What the Expressions scenario hands each character: a whole power drawn
    // from the pieces that character can already reach, finalized for free.
    const pick = (list) => list[Math.floor(Math.random() * list.length)];
    const randomEntry = (actor, cat, where) => {
        const pool = options(cat).filter(o => meets(actor, o.key) &&
            (!where || o.where === 'any' || o.where === where));
        for (let tries = 0; tries < 8 && pool.length; tries++) {
            const o = pick(pool);
            if (!o.param) return { key: o.key, arg: null, not: false };
            const choices = argChoices(actor, o.param);
            if (choices.length) return { key: o.key, arg: pick(choices).arg, not: false };
        }
        return null;
    };

    const randomize = (actor) => {
        if (!isActor(actor)) return null;
        unlock(actor);
        const trigger = randomEntry(actor, 'trigger');
        const where = trigger && option(trigger.key).where !== 'any' ? option(trigger.key).where : null;
        const power = blank();
        power.trigger = trigger;
        power.logic = Math.random() < 0.7 ? 'all' : 'any';
        const nRules = Math.floor(Math.random() * 3);
        for (let i = 0; i < nRules; i++) {
            const r = randomEntry(actor, 'rule', where);
            if (r && !power.rules.some(e => idOf(e) === idOf(r))) power.rules.push(Object.assign(r, { not: Math.random() < 0.2 }));
        }
        const nEffects = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < nEffects; i++) {
            const e = randomEntry(actor, 'effect', where);
            if (e && !power.effects.some(x => idOf(x) === idOf(e))) power.effects.push(e);
        }
        if (Math.random() < 0.3) {
            power.branch = randomEntry(actor, 'rule', where);
            const e = power.branch ? randomEntry(actor, 'effect', where) : null;
            if (e) power.elseEffects.push(e);
        }
        if (where !== 'world' && meets(actor, 'summon') && argChoices(actor, 'pet').length && Math.random() < 0.3) {
            power.form = { key: 'summon', arg: pick(argChoices(actor, 'pet')).arg, not: false };
        }
        if (!power.trigger || !power.effects.length) return null;
        actor._expressionFinal = clone(power);
        actor._expressionDraft = clone(power);
        return power;
    };

    // ── Firing ───────────────────────────────────────────────────────────
    const inBattle = () => !!(typeof $gameParty !== 'undefined' && $gameParty && $gameParty.inBattle && $gameParty.inBattle());
    const isBoss = (enemy) => !!(enemy && enemy.enemy && enemy.enemy() && enemy.enemy().meta && enemy.enemy().meta.Boss);
    const fighting = (actorId) => {
        const a = $gameActors.actor(actorId);
        return a && $gameParty.allMembers().includes(a) ? a : null;
    };
    const today = () => {
        const tds = window.TimeDateSystem;
        const minutes = tds && tds.getGameTimeMinutes ? tds.getGameTimeMinutes() : 0;
        return Math.floor(minutes / 1440);
    };
    const hourNow = () => {
        const tds = window.TimeDateSystem;
        const d = tds && tds.getCurrentDateObj ? tds.getCurrentDateObj() : null;
        return d ? d.getHours() : 12;
    };
    const weatherNow = () => (window.$gameWeather && window.$gameWeather.currentWeatherType) || 'none';
    const needPercent = (actor, need) => {
        const getter = actor && actor[need + 'Percent'];
        return typeof getter === 'function' ? getter.call(actor) : 100;
    };
    const heatNow = () => (window.CrimeSystem && window.CrimeSystem.getHeat ? window.CrimeSystem.getHeat() : 0);

    const CONDITIONS = {
        outnumbered: () => $gameTroop.aliveMembers().length > $gameParty.aliveMembers().length,
        wounded: (a) => a.hpRate() < 0.5,
        night: () => { const h = hourNow(); return h >= NIGHT_FROM || h < NIGHT_TO; },
        brimming: (a) => a.mmp > 0 && a.mpRate() >= 0.75,
        weatherIs: (a, arg) => weatherNow() === arg,
        indoors: () => !!(window.$gameWeather && window.$gameWeather.isInterior),
        earlyRounds: () => $gameTroop.turnCount() < EARLY_ROUNDS,
        wealthy: (a, arg) => $gameParty.gold() >= arg,
        wanted: () => heatNow() > 0,
        needLowNow: (a, arg) => needPercent(a, arg) < NEED_LOW,
        memberStanding: (a, arg) => { const m = fighting(arg); return !!m && m.isAlive(); },
        memberDown: (a, arg) => { const m = fighting(arg); return !!m && m.isDead(); },
        alone: (a) => $gameParty.aliveMembers().every(m => m === a),
        sick: (a) => !!(window.DiseaseSystem && window.DiseaseSystem.actorEntries &&
            (window.DiseaseSystem.actorEntries(a) || []).length),
        selfHasState: (a, arg) => a.isStateAffected(arg),
        enemyHasState: (a, arg) => $gameTroop.aliveMembers().some(e => e.isStateAffected(arg)),
        bossFight: () => $gameTroop.aliveMembers().some(isBoss),
        duel: () => $gameTroop.aliveMembers().length === 1,
        lastStand: (a) => a.hpRate() <= LAST_STAND_HP
    };

    // A condition that only means something in a fight never holds outside one.
    const holds = (actor, entry) => {
        const o = option(entry.key);
        let value;
        if (o && o.where === 'battle' && !inBattle()) value = false;
        else value = CONDITIONS[entry.key] ? !!CONDITIONS[entry.key](actor, entry.arg) : true;
        return entry.not ? !value : value;
    };

    const weekdayNow = () => {
        const tds = window.TimeDateSystem;
        const d = tds && tds.getCurrentDateObj ? tds.getCurrentDateObj() : null;
        return d ? d.getDay() : 0;
    };
    const isNight = () => { const h = hourNow(); return h >= NIGHT_FROM || h < NIGHT_TO; };
    const enemyKind = (enemy) => {
        const a = enemy && enemy.enemy && enemy.enemy() && enemy.enemy().meta && enemy.enemy().meta.Archetype;
        return typeof a === 'string' ? a.trim().toLowerCase() : '';
    };
    const LIMITS = {
        notOnWeekday: (a, arg) => weekdayNow() !== arg,
        onlyOnWeekday: (a, arg) => weekdayNow() === arg,
        onlyVsKind: (a, arg) => $gameTroop.aliveMembers().some(e => enemyKind(e) === String(arg).toLowerCase()),
        notVsBoss: () => !inBattle() || !$gameTroop.aliveMembers().some(isBoss),
        onlyVsBoss: () => $gameTroop.aliveMembers().some(isBoss),
        onlyAtNight: () => isNight(),
        onlyByDay: () => !isNight(),
        onlyInWeather: (a, arg) => weatherNow() === arg,
        onlyIndoors: () => !!(window.$gameWeather && window.$gameWeather.isInterior),
        onlyOutdoors: () => !(window.$gameWeather && window.$gameWeather.isInterior),
        onlyHurt: (a) => a.hpRate() < 0.5,
        onlyUnharmed: (a) => a.hpRate() >= 1,
        onlyAlone: (a) => $gameParty.aliveMembers().every(m => m === a),
        onlyWithMember: (a, arg) => { const m = fighting(arg); return !!m && m.isAlive(); },
        onlyUnarmed: (a) => !(a.weapons && a.weapons().length),
        onlyInBattle: () => inBattle(),
        onlyInWorld: () => !inBattle(),
        // The prices hold as long as they can be paid.
        bloodPrice: (a) => a.hp > 1,
        spiritPrice: (a) => a.mmp > 0 && a.mp > 0,
        goldPrice: () => $gameParty.gold() > 0
    };
    // Every limitation must hold, always: they are not joined by ALL or ANY,
    // and NOT does not turn them around. One that only means something in a
    // fight never holds outside one.
    const limitsHold = (actor, power) => ((power && power.limits) || []).every(e => {
        const o = option(e.key);
        if (o && o.where === 'battle' && !inBattle()) return false;
        if (o && o.where === 'world' && inBattle()) return false;
        return LIMITS[e.key] ? !!LIMITS[e.key](actor, e.arg) : true;
    });
    const hasLimit = (power, key) => ((power && power.limits) || []).some(e => e.key === key);

    const gateOpen = (actor, power) => {
        const rules = power.rules || [];
        if (!rules.length) return true;
        return power.logic === 'any' ? rules.some(e => holds(actor, e)) : rules.every(e => holds(actor, e));
    };

    const fitsHere = (entry) => {
        const o = option(entry.key);
        const where = o ? o.where : 'any';
        return where === 'any' || where === (inBattle() ? 'battle' : 'world');
    };

    // The effects this firing would run: THEN, or ELSE when the branch fails,
    // keeping only those that mean something where the party stands.
    const chosenEffects = (actor, power) => {
        const list = !power.branch || holds(actor, power.branch) ? (power.effects || []) : (power.elseEffects || []);
        return list.filter(fitsHere);
    };

    const isSpent = (actor) => {
        // Once a week, battle or world alike, counted from the last firing.
        const power = finalized(actor);
        if (hasLimit(power, 'oncePerWeek') && actor._expressionWeekFired != null &&
            today() - actor._expressionWeekFired < WEEK_DAYS) return true;
        return inBattle() ? !!actor._expressionSpent : actor._expressionDay === today();
    };

    // Whether this character's finalized power would fire on this trigger
    // right now. What was finalized fires as finalized: the stats it asked
    // for are never checked again here.
    const ready = (actor, trigger, arg) => {
        if (!isActor(actor) || !isUnlocked(actor)) return null;
        const power = finalized(actor);
        if (!power || !power.trigger || power.trigger.key !== trigger || isSpent(actor)) return null;
        const wanted = power.trigger.arg;
        if (wanted !== null && wanted !== undefined && !argMatches(power.trigger.key, wanted, arg)) return null;
        if (!limitsHold(actor, power) || !gateOpen(actor, power)) return null;
        return chosenEffects(actor, power).length ? power : null;
    };

    // A sum fires on any spend at least that large; everything else on a match.
    const argMatches = (key, wanted, arg) => key === 'spend' ? Number(arg) >= Number(wanted) : wanted === arg;

    const popup = (battler) => { if (inBattle() && battler && battler.startDamagePopup) battler.startDamagePopup(); };
    const heal = (battler, amount) => {
        if (!battler || amount <= 0) return;
        battler.gainHp(Math.round(amount));
        popup(battler);
    };
    const buff = (battler, paramIds, p) => {
        const n = p >= 1.5 ? 2 : 1;
        for (let i = 0; i < n; i++) paramIds.forEach(id => battler.addBuff(id, BUFF_TURNS));
    };
    const strike = (enemy, dmg) => {
        enemy.clearResult();
        enemy.gainHp(-Math.max(1, Math.round(dmg)));
        popup(enemy);
        if (enemy.isDead() && enemy.performCollapse) enemy.performCollapse();
    };
    const raise = (member, rate) => {
        member.revive();
        member.setHp(Math.max(1, Math.round(member.mhp * Math.min(1, rate))));
        popup(member);
    };
    const restoreNeed = (actor, need, pct) => {
        const tds = window.TimeDateSystem;
        const cap = need === 'hunger' ? tds && tds.maxHunger : need === 'sleep' ? tds && tds.maxSleep : 100;
        const add = actor['add' + need.charAt(0).toUpperCase() + need.slice(1)];
        if (typeof add === 'function') add.call(actor, Math.round((cap || 100) * pct / 100));
    };

    const EFFECTS = {
        mend: (a, p) => heal(a, a.mhp * MEND_RATE * p),
        focus: (a, p) => { a.gainMp(Math.round(a.mmp * FOCUS_RATE * p)); },
        restoreNeed: (a, p, arg) => restoreNeed(a, arg, NEED_RESTORE * p),
        bulwark: (a, p) => buff(a, [3, 5], p),
        fury: (a, p) => buff(a, [2], p),
        quicken: (a, p) => buff(a, [6], p),
        purge: (a) => {
            const death = a.deathStateId ? a.deathStateId() : 1;
            a.states().filter(s => s.id !== death && isHarmful(s)).forEach(s => a.removeState(s.id));
        },
        mendMember: (a, p, arg) => { const m = fighting(arg); if (m && m.isAlive()) heal(m, m.mhp * MEMBER_MEND_RATE * p); },
        windfall: (a, p) => $gameParty.gainGold(Math.round(WINDFALL_GOLD * p)),
        grant: (a, p, arg) => a.addState(arg),
        inflict: (a, p, arg) => $gameTroop.aliveMembers().forEach(e => {
            if (Math.random() < Math.min(1, INFLICT_CHANCE * p * e.stateRate(arg))) e.addState(arg);
        }),
        coolHeat: (a, p) => {
            const crime = window.CrimeSystem;
            if (crime && crime.setHeat) crime.setHeat(Math.max(0, heatNow() - Math.round(HEAT_COOL * p)));
        },
        cure: (a) => {
            if (window.DiseaseSystem && window.DiseaseSystem.cureActor) window.DiseaseSystem.cureActor(a, 'all');
            if (window.Allergy && window.Allergy.cure) window.Allergy.cure(a);
        },
        elementBurst: (a, p, arg) => $gameTroop.aliveMembers().forEach(e =>
            strike(e, e.mhp * BURST_RATE * p * e.elementRate(arg) * (isBoss(e) ? BOSS_RATE : 1))),
        shockwave: (a, p) => $gameTroop.aliveMembers().forEach(e =>
            strike(e, e.mhp * SHOCK_RATE * p * (isBoss(e) ? BOSS_RATE : 1))),
        rally: (a, p) => $gameParty.aliveMembers().forEach(m => heal(m, m.mhp * RALLY_RATE * p)),
        reviveMember: (a, p, arg) => { const m = fighting(arg); if (m && m.isDead()) raise(m, MEMBER_REVIVE_RATE * p); },
        rebirth: (a, p) => $gameParty.deadMembers().forEach(m => raise(m, REBIRTH_RATE * p))
    };

    // A summon form manifests first, modelled on the chosen pet, and only in
    // a fight where nothing else already holds the summon slot.
    const manifest = (power) => {
        const form = power.form;
        const summons = window.SummonSystem;
        if (!inBattle() || !form || form.key !== 'summon' || !summons || summons.isActive()) return false;
        try { summons.beast(form.arg); } catch (e) { console.warn('[Expression] summon failed', e); }
        return summons.isActive();
    };

    const announce = (actor, power, effects) => {
        const names = effects.map(entryLabel).join(', ');
        const summoned = power.form && power.form.key === 'summon' && inBattle();
        const text = T(summoned ? 'Expression.firedSummon' : 'Expression.fired',
            { name: actor.name(), effects: names, form: argLabel('pet', power.form && power.form.arg) });
        const log = inBattle() ? BattleManager._logWindow : null;
        if (log && log.push) log.push('addText', text);
        if (window.ParchmentToast) {
            window.ParchmentToast.show(text, {
                severity: 'good',
                key: 'expression:fired:' + actor.actorId()   // i18n-ignore  dedupe key
            });
        }
    };

    // The prices a power's limitations ask, paid as it fires.
    const payPrices = (actor, power) => {
        if (hasLimit(power, 'bloodPrice')) {
            const price = Math.min(actor.hp - 1, Math.round(actor.mhp * BLOOD_PRICE));
            if (price > 0) { actor.gainHp(-price); popup(actor); }
        }
        if (hasLimit(power, 'spiritPrice') && actor.mp > 0) actor.gainMp(-actor.mp);
        if (hasLimit(power, 'goldPrice')) {
            const price = Math.max(1, Math.round($gameParty.gold() * GOLD_PRICE));
            $gameParty._gold = Math.max(0, $gameParty._gold - price);
        }
    };

    const activate = (actor, power) => {
        if (inBattle()) actor._expressionSpent = true;
        else actor._expressionDay = today();
        if (hasLimit(power, 'oncePerWeek')) actor._expressionWeekFired = today();
        payPrices(actor, power);
        const effects = chosenEffects(actor, power);
        const p = potency(power);
        manifest(power);
        effects.forEach(e => { if (EFFECTS[e.key]) EFFECTS[e.key](actor, p, e.arg); });
        announce(actor, power, effects);
        if (actor.refresh) actor.refresh();
    };

    const fire = (actor, trigger, arg) => {
        if (!actor || !actor.isAlive || !actor.isAlive()) return false;
        const power = ready(actor, trigger, arg);
        if (!power) return false;
        activate(actor, power);
        return true;
    };

    const fireAll = (trigger, arg, except) => {
        if (typeof $gameParty === 'undefined' || !$gameParty) return;
        $gameParty.aliveMembers().forEach(m => { if (m !== except) fire(m, trigger, arg); });
    };

    // ── Battle hooks ─────────────────────────────────────────────────────
    // The elements a blow carries: a plain attack strikes with the wielder's.
    const actionElements = (action) => {
        const item = action.item();
        const id = item && item.damage ? item.damage.elementId : 0;
        if (id < 0) return action.subject().attackElements ? action.subject().attackElements() : [];
        return id > 0 ? [id] : [];
    };

    // A new battle spends nobody's power yet, then the opening fires.
    const _BattleManager_startBattle = BattleManager.startBattle;
    BattleManager.startBattle = function () {
        _BattleManager_startBattle.call(this);
        $gameParty.allMembers().forEach(m => { m._expressionSpent = false; });
        fireAll('opening');
    };

    const _BattleManager_startTurn = BattleManager.startTurn;
    BattleManager.startTurn = function () {
        _BattleManager_startTurn.call(this);
        fireAll('eachRound');
    };

    // Damage: the blow that would knock a character out, the one that takes
    // them under half health, a critical hit, an element landing either way,
    // a fall and a kill.
    const _Game_Action_executeHpDamage = Game_Action.prototype.executeHpDamage;
    Game_Action.prototype.executeHpDamage = function (target, value) {
        if (!inBattle() || !target) return _Game_Action_executeHpDamage.call(this, target, value);
        let held = null;
        if (isActor(target) && value > 0 && value >= target.hp && target.isAlive()) {
            held = ready(target, 'deathsDoor');
            if (held) value = Math.max(0, target.hp - 1);
        }
        const wasAlive = target.isAlive();
        const hpBefore = target.hp;
        _Game_Action_executeHpDamage.call(this, target, value);
        if (held) activate(target, held);
        const subject = this.subject();
        const elements = value > 0 ? actionElements(this) : [];
        if (isActor(target) && target.isAlive()) {
            if (hpBefore >= target.mhp / 2 && target.hp < target.mhp / 2) fire(target, 'bloodied');
            if (target.result && target.result().critical) fire(target, 'struckTrue');
            elements.forEach(el => fire(target, 'hitByElement', el));
        }
        if (isActor(subject) && !isActor(target)) elements.forEach(el => fire(subject, 'dealtElement', el));
        if (wasAlive && target.isDead()) {
            if (isActor(target)) {
                fireAll('fallenAlly', null, target);
                fireAll('memberFalls', target.actorId(), target);
            } else if (isActor(subject)) {
                fire(subject, 'takedown');
            }
        }
    };

    const _Game_Battler_addState = Game_Battler.prototype.addState;
    Game_Battler.prototype.addState = function (stateId) {
        const had = this.isStateAffected(stateId);
        _Game_Battler_addState.call(this, stateId);
        if (had || !this.isStateAffected(stateId)) return;
        if (stateId === this.deathStateId()) return;
        if (isActor(this)) {
            fire(this, 'stateOnSelf', stateId);
            if (isHarmful($dataStates[stateId])) fire(this, 'afflicted');
        } else if (inBattle()) {
            fireAll('stateOnEnemy', stateId);
        }
    };

    const _Game_BattlerBase_paySkillCost = Game_BattlerBase.prototype.paySkillCost;
    Game_BattlerBase.prototype.paySkillCost = function (skill) {
        const before = this.mp;
        _Game_BattlerBase_paySkillCost.call(this, skill);
        if (inBattle() && isActor(this) && this.mmp > 0 && before > 0 && this.mp === 0) fire(this, 'mpDry');
    };

    // ── World hooks ──────────────────────────────────────────────────────
    const _Game_Party_gainGold = Game_Party.prototype.gainGold;
    Game_Party.prototype.gainGold = function (amount) {
        const before = this.gold();
        _Game_Party_gainGold.call(this, amount);
        const spent = before - this.gold();
        if (spent > 0 && !inBattle()) fireAll('spend', spent);
    };

    const _Game_Battler_gainHp = Game_Battler.prototype.gainHp;
    Game_Battler.prototype.gainHp = function (value) {
        _Game_Battler_gainHp.call(this, value);
        if (value < 0 && isActor(this) && !inBattle() && typeof $gameParty !== 'undefined' &&
            $gameParty && $gameParty.allMembers().includes(this)) fire(this, 'mapHurt');
    };

    const _Game_Actor_levelUp = Game_Actor.prototype.levelUp;
    Game_Actor.prototype.levelUp = function () {
        const before = !!this._expressionUnlocked || awakened(this);
        _Game_Actor_levelUp.call(this);
        if (!before && awakened(this)) {
            this._expressionUnlocked = true;
            announceAwakening(this);
        }
        if (typeof $gameParty !== 'undefined' && $gameParty && $gameParty.allMembers().includes(this)) fire(this, 'levelUp');
    };

    const _Game_Map_setup = Game_Map.prototype.setup;
    Game_Map.prototype.setup = function (mapId) {
        _Game_Map_setup.call(this, mapId);
        fireAll('arrive');
    };

    // Wraps a method on a plugin's public object once every plugin is loaded.
    const wrapApi = (holder, name, after) => {
        const target = window[holder];
        if (!target || typeof target[name] !== 'function' || target[name]._expressionWrapped) return;
        const original = target[name];
        const wrapped = function () {
            const result = original.apply(this, arguments);
            try { after.call(this, result, arguments); } catch (e) { console.warn('[Expression] ' + holder + '.' + name, e); }
            return result;
        };
        wrapped._expressionWrapped = true;
        target[name] = wrapped;
    };

    const installWorldHooks = () => {
        wrapApi('PartyMeal', 'serve', (result) => {
            ((result && result.members) || []).forEach(m => { if (m && m.actor) fire(m.actor, 'eat'); });
        });
        wrapApi('DiseaseSystem', 'infectActor', (result, args) => { if (result) fire(args[0], 'diseased'); });
        wrapApi('Allergy', 'react', (result, args) => { if (result && result.reaction) fire(args[0], 'allergic'); });
        wrapApi('CrimeSystem', 'addCrime', () => fireAll('crime'));
        wrapApi('KanbanQuest', 'moveQuest', (result, args) => { if (args[1] === 'done') fireAll('questDone'); });
        wrapApi('TimeDateSystem', 'applyRestRecovery', () => fireAll('rested'));
        wrapApi('Diary', 'onOpinionChanged', (result, args) => {
            const actor = $gameActors && $gameActors.actor(args[1]);
            if (!actor || args[3] === args[2]) return;
            fire(actor, args[3] > args[2] ? 'admired' : 'scorned');
        });
        const empathize = window.NPCEmpathize && window.NPCEmpathize.Scene_NPCEmpathize;
        if (empathize && empathize.prototype._runAction && !empathize.prototype._runAction._expressionWrapped) {
            const run = empathize.prototype._runAction;
            empathize.prototype._runAction = function (id) {
                const result = run.call(this, id);
                fireAll('empathize', id);
                return result;
            };
            empathize.prototype._runAction._expressionWrapped = true;
        }
    };

    const _Scene_Boot_start = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = function () {
        _Scene_Boot_start.call(this);
        installWorldHooks();
    };

    // What changes slowly is watched rather than hooked: the weather turning,
    // heat rising and a need running low. Each fires on the change, not while
    // the state lasts.
    const watch = { weather: null, heat: null, needs: {} };
    const pollWorld = () => {
        if (typeof $gameParty === 'undefined' || !$gameParty || inBattle()) return;
        const w = weatherNow();
        if (watch.weather !== null && w !== watch.weather) fireAll('weatherTurns', w);
        watch.weather = w;
        const h = heatNow();
        if (watch.heat !== null && h > watch.heat) fireAll('heatRises');
        watch.heat = h;
        $gameParty.aliveMembers().forEach(m => {
            NEEDS.forEach(need => {
                const id = m.actorId() + ':' + need;
                const low = needPercent(m, need) < NEED_LOW;
                if (low && watch.needs[id] === false) fire(m, 'needLow', need);
                watch.needs[id] = low;
            });
        });
    };

    const _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function () {
        _Scene_Map_update.call(this);
        this._expressionPoll = ((this._expressionPoll || 0) + 1) % WORLD_POLL_FRAMES;
        if (this._expressionPoll === 0) pollWorld();
    };

    // ── The Expressions scenario ─────────────────────────────────────────
    // Begun as origin_expressions (CharacterCreationOrigins), everybody who
    // joins the party later Expresses too, with a power rolled for them.
    const EXPRESSIONS_ORIGIN = 'origin_expressions';   // i18n-ignore  choice symbol
    const _Game_Party_addActor = Game_Party.prototype.addActor;
    Game_Party.prototype.addActor = function (actorId) {
        _Game_Party_addActor.call(this, actorId);
        if (!$gameSystem || $gameSystem._ccOriginSymbol !== EXPRESSIONS_ORIGIN) return;
        const actor = $gameActors.actor(actorId);
        if (actor && this._actors.includes(actorId) && !isUnlocked(actor)) randomize(actor);
    };

    // ── The expression seed ──────────────────────────────────────────────
    // A seed only takes on someone who does not have Expression yet, so the
    // backpack refuses it (and keeps the seed) on anyone else.
    const _Game_Action_testApply = Game_Action.prototype.testApply;
    Game_Action.prototype.testApply = function (target) {
        if (isUnlockItem(this.item())) return isActor(target) && !isUnlocked(target);
        return _Game_Action_testApply.call(this, target);
    };

    const _Game_Action_apply = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function (target) {
        _Game_Action_apply.call(this, target);
        if (!isUnlockItem(this.item()) || !target.result().isHit()) return;
        if (!unlock(target)) return;
        if (window.ParchmentToast) {
            window.ParchmentToast.show(T('Expression.unlocked', { name: target.name() }), {
                severity: 'good',
                key: 'expression:' + target.actorId()   // i18n-ignore  dedupe key
            });
        }
    };

    window.Expression = {
        CATEGORIES,
        SLOTS,
        SLOT_CATEGORY,
        OPTIONS,
        isUnlocked,
        awakensAt,
        AWAKEN_LEVEL_MAGICAL,
        AWAKEN_LEVEL_MUNDANE,
        unlock,
        members,
        anyInParty,
        option,
        options,
        statOf,
        meets,
        isLost,
        argChoices,
        argLabel,
        entryLabel,
        draft,
        finalized,
        place,
        removeAt,
        toggleNot,
        setLogic,
        finalizeCheck,
        finalize,
        potency,
        // Limitations: how much a power is bound, and what that gives back.
        limitPoints,
        discountOf,
        leewayOf,
        reqFor,
        neverFires,
        LIMIT_DISCOUNT,
        LIMIT_LEEWAY,
        MAX_DISCOUNT,
        MAX_LEEWAY,
        randomize,
        isUnlockItem,
        // For the tests and for anything that wants to fire a power by hand.
        fire,
        ready,
        pollWorld,
    };
})();
