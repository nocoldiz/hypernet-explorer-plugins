// ============================================================================
// Battle System Enhanced - Core & Commands
// For RPG Maker MZ
// ============================================================================

/*:
 * @target MZ
 * @plugindesc v2.0 Core module: config, i18n, plugin commands, shared namespace.
 * @author Combined by Claude, modified by OmniLex
 * @pluginName BattleSystemEnhanced
 *
 * @param respawnMapVar
 * @text Respawn Map Variable ID
 * @desc Game variable ID to store respawn map ID
 * @type variable
 * @default 25
 *
 * @param respawnXVar
 * @text Respawn X Variable ID
 * @desc Game variable ID to store respawn X coordinate
 * @type variable
 * @default 26
 *
 * @param respawnYVar
 * @text Respawn Y Variable ID
 * @desc Game variable ID to store respawn Y coordinate
 * @type variable
 * @default 27
 *
 * @param respawnCountryIDVar
 * @text Respawn Country ID Variable ID
 * @desc Game variable ID to store respawn country ID
 * @type variable
 * @default 112
 *
 * @param levelGapFair
 * @text Level Gap: Fair Fight
 * @desc Levels a monster may outrank the party and still be a fight they can win. Damping and warnings start past this.
 * @type number
 * @default 6
 *
 * @param levelGapHard
 * @text Level Gap: Hard Fight
 * @desc Levels a monster may outrank the party and still be beatable at a cost. Past this the fight is out of reach.
 * @type number
 * @default 8
 *
 * @param levelDampScale
 * @text Level Gap Scale
 * @desc Higher = gentler damping. Level gap is divided by this.
 * @type number
 * @default 4
 *
 * @param levelDampCurve
 * @text Level Gap Curve
 * @desc Exponent of the damping curve. Above 1 it bites harder as the gap widens.
 * @type number
 * @decimals 2
 * @default 2.2
 *
 * @param levelDampFloor
 * @text Level Gap Floor
 * @desc Lowest damage multiplier the gap alone can impose (0.005 = 0.5% damage, chip damage).
 * @type number
 * @decimals 3
 * @default 0.005
 *
 * @param levelDampLeverageCap
 * @text Tactical Leverage Cap
 * @desc Maximum damping reduction tactics (crits, weakness, debuffs) can provide.
 * @type number
 * @decimals 2
 * @default 0.40
 *
 * @param levelDampLeverageFalloff
 * @text Tactical Leverage Falloff
 * @desc Levels over which tactics lose half their worth. Lower = tactics stop rescuing a hopeless gap sooner.
 * @type number
 * @default 3.5
 *
 * @param levelPressurePerLevel
 * @text Level Pressure Per Level
 * @desc Extra damage a monster deals to the party per level it outranks them past the fair gap (0.10 = +10%).
 * @type number
 * @decimals 3
 * @default 0.100
 *
 * @param levelPressureCap
 * @text Level Pressure Cap
 * @desc Ceiling on that multiplier, so an absurd gap cannot scale without end.
 * @type number
 * @decimals 2
 * @default 2.60
 *
 * @param levelPressureOutnumber
 * @text Level Pressure: Outnumbered Monster
 * @desc How much of the outnumbered ratio an over-level monster converts into extra damage, so 3v1 does not trivialise it.
 * @type number
 * @decimals 2
 * @default 0.45
 *
 * @param invisibleHandChipFloorPercent
 * @text Invisible Hand: Chip Floor Percent
 * @desc Minimum HP damage an actor's hit against an enemy always deals, as a fraction of the enemy's max HP, even if the raw formula computes to 0 or less.
 * @type number
 * @decimals 4
 * @default 0.0050
 *
 * @param invisibleHandEnabled
 * @text Invisible Hand: Master Switch
 * @desc Master switch for the auto-balancing enemy stat system. When off, only the one-shot protection and chip floor (below) remain active.
 * @type boolean
 * @default false
 *
 * @param invisibleHandLevelGapEnabled
 * @text Invisible Hand: Level Gap Scaling
 * @desc When enabled, enemy ATK/DEF/MAT/MDF are scaled based on how many levels the enemy outranks the party. Disabled by default for bounded-stat systems.
 * @type boolean
 * @default false
 *
 * @param invisibleHandOutnumberEnabled
 * @text Invisible Hand: Outnumber Scaling
 * @desc When enabled, enemy ATK/DEF/MAT/MDF are adjusted based on headcount ratios. The outnumbered side gets a stat boost, the outnumbering side gets a slight reduction.
 * @type boolean
 * @default false
 *
 * @param invisibleHandOutnumberAtkDefRatio
 * @text Invisible Hand: Outnumber ATK/DEF Ratio
 * @desc How much of the outnumber multiplier goes to ATK/MAT vs DEF/MDF. 0 = defense only, 1 = equal split, 0.5 = current default.
 * @type number
 * @decimals 2
 * @default 0.50
 *
 * @param invisibleHandGraceEdge
 * @text Invisible Hand: Grace Edge
 * @desc Levels an enemy may outrank the party's effective level before the stat curve steepens.
 * @type number
 * @default 2
 *
 * @param invisibleHandGraceMult
 * @text Invisible Hand: Grace Multiplier
 * @desc Enemy ATK/DEF/MAT/MDF multiplier at the grace edge (the "hard but winnable" ceiling).
 * @type number
 * @decimals 2
 * @default 1.40
 *
 * @param invisibleHandSteepK
 * @text Invisible Hand: Steep Coefficient
 * @desc Growth rate of the stat multiplier once an enemy outranks the party by more than the grace edge.
 * @type number
 * @decimals 2
 * @default 0.20
 *
 * @param invisibleHandSteepCurve
 * @text Invisible Hand: Steep Curve
 * @desc Exponent of the post-edge stat growth. Above 1 it bites harder as the gap widens.
 * @type number
 * @decimals 2
 * @default 1.9
 *
 * @param invisibleHandGapDefenseCurve
 * @text Invisible Hand: Gap Defense Curve
 * @desc Fraction of the level-gap stat growth also applied to DEF/MDF, kept lower than ATK/MAT so a higher-level enemy still takes some damage.
 * @type number
 * @decimals 2
 * @default 0.50
 *
 * @param invisibleHandUnderSpan
 * @text Invisible Hand: Underlevel Span
 * @desc Levels an enemy may trail the party before its stat multiplier bottoms out.
 * @type number
 * @default 20
 *
 * @param invisibleHandUnderFloor
 * @text Invisible Hand: Underlevel Floor
 * @desc Lowest stat multiplier a heavily underleveled enemy can be reduced to.
 * @type number
 * @decimals 2
 * @default 0.65
 *
 * @param invisibleHandOutnumberFactor
 * @text Invisible Hand: Outnumber Factor
 * @desc How much tougher (DEF/MDF) an outnumbered enemy gets per extra party member it faces.
 * @type number
 * @decimals 2
 * @default 0.50
 *
 * @param invisibleHandOutnumberOffenseCurve
 * @text Invisible Hand: Outnumber Offense Curve
 * @desc Fraction of the outnumber toughness boost also applied to ATK/MAT, kept gentle since an outnumbered enemy already acts more often.
 * @type number
 * @decimals 2
 * @default 0.50
 *
 * @param invisibleHandStatFloor
 * @text Invisible Hand: Stat Floor
 * @desc Hard safety floor for the combined stat multiplier.
 * @type number
 * @decimals 2
 * @default 0.60
 *
 * @param invisibleHandStatCeiling
 * @text Invisible Hand: Stat Ceiling
 * @desc Hard safety ceiling for the combined stat multiplier.
 * @type number
 * @decimals 2
 * @default 10.00
 *
 * @param invisibleHandGearSpan
 * @text Invisible Hand: Gear Sample Span
 * @desc Levels back sampled from an actor's class curve to estimate its stat growth rate, for converting gear power into effective levels.
 * @type number
 * @default 5
 *
 * @param invisibleHandGearFloor
 * @text Invisible Hand: Gear Level Floor
 * @desc Lowest effective-level adjustment an actor's gear can apply toward the party's balancing level.
 * @type number
 * @default -2
 *
 * @param invisibleHandGearCeiling
 * @text Invisible Hand: Gear Level Ceiling
 * @desc Highest effective-level adjustment an actor's gear can apply toward the party's balancing level.
 * @type number
 * @default 6
 *
*
 * @param invisibleHandWeaponDefenseEnabled
 * @text Weapon-Based Defense Scaling
 * @desc When enabled, enemy DEF/MDF are adjusted by party weapon damage potential only when the enemy is outnumbered.
 * @type boolean
 * @default true
 *
 * @param invisibleHandWeaponDefenseScale
 * @text Weapon Defense: Scale
 * @desc How much enemy DEF/MDF scales per unit of party weapon damage above the threshold.
 * @type number
 * @decimals 2
 * @default 0.0015
 *
 * @param invisibleHandWeaponDefenseThreshold
 * @text Weapon Defense: Baseline Threshold
 * @desc Baseline weapon-damage potential below which no defense adjustment is applied.
 * @type number
 * @default 60
 *
 * @param invisibleHandWeaponDefenseFloor
 * @text Weapon Defense: Floor
 * @desc Lowest multiplier the weapon-damage defense adjustment can go.
 * @type number
 * @decimals 2
 * @default 0.80
 *
 * @param invisibleHandWeaponDefenseCeiling
 * @text Weapon Defense: Ceiling
 * @desc Highest multiplier the weapon-damage defense adjustment can reach.
 * @type number
 * @decimals 2
 * @default 2.50
 *
 * @param loneMemberMaxEnemies
 * @text Lone Traveller: Max Monsters at Once
 * @desc Most monsters a character travelling alone may face at one time. A summon does not count as a second traveller.
 * @type number
 * @min 1
 * @default 2
 *
 * @param dndResolutionEnabled
 * @text D&D Resolution: Master Switch
 * @desc Reads the bounded 8-20 class and enemy stats as D&D ability scores when resolving damage, instead of as raw damage numbers.
 * @type boolean
 * @default true
 *
 * @param dndPaceWeight
 * @text D&D Resolution: Pace Weight
 * @desc How far a hit is pulled from its raw formula value toward the designed hit size. 0 = raw only, 1 = designed pace only.
 * @type number
 * @decimals 2
 * @default 0.70
 *
 * @param dndActorHits
 * @text D&D Resolution: Hits to Fell an Actor
 * @desc Plain hits an even-level foe needs to fell a party member at full HP. Higher = the party survives longer.
 * @type number
 * @default 9
 *
 * @param dndEnemyHits
 * @text D&D Resolution: Hits to Fell an Enemy
 * @desc Plain hits a party member needs to fell an even-level enemy at full HP.
 * @type number
 * @default 5
 *
 * @param dndGapPerLevel
 * @text D&D Resolution: Gap Toughness per Level
 * @desc Extra fraction of the designed hit count a defender gains per level it outranks its attacker.
 * @type number
 * @decimals 3
 * @default 0.045
 *
 * @param dndGapCap
 * @text D&D Resolution: Gap Toughness Cap
 * @desc Ceiling on the level-gap toughness bonus. 2.5 = at most 3.5x the designed hit count.
 * @type number
 * @decimals 2
 * @default 2.50
 *
 * @param dndContestPerPoint
 * @text D&D Resolution: Damage per Modifier Point
 * @desc Damage swing per point the attacker's ability modifier beats the defender's. 0.06 = 6% per point.
 * @type number
 * @decimals 3
 * @default 0.060
 *
 * @param dndContestFloor
 * @text D&D Resolution: Contest Floor
 * @desc Lowest multiplier a losing ability contest can impose, so armour never zeroes a hit outright.
 * @type number
 * @decimals 2
 * @default 0.60
 *
 * @param dndContestCeiling
 * @text D&D Resolution: Contest Ceiling
 * @desc Highest multiplier a winning ability contest can reach.
 * @type number
 * @decimals 2
 * @default 1.50
 *
 * @param dndModCap
 * @text D&D Resolution: Ability Modifier Cap
 * @desc Ceiling on an ability modifier inside the contest. The stat system tops out at 20, so a score above that is an authoring outlier, not a real +8.
 * @type number
 * @default 5
 *
 * @param dndOutnumberContest
 * @text D&D Resolution: Outnumbered Defence Bonus
 * @desc Defensive ability modifier points the outnumbered side gains per extra foe it faces. Applies to a lone enemy and to a lone party member alike.
 * @type number
 * @decimals 2
 * @default 1.80
 *
 * @param dndSkillWeightFloor
 * @text D&D Resolution: Skill Weight Floor
 * @desc Lowest weight a skill may carry against the attacker's own plain attack, so a feeble skill still lands something.
 * @type number
 * @decimals 2
 * @default 0.10
 *
 * @param dndSkillWeightCeiling
 * @text D&D Resolution: Skill Weight Ceiling
 * @desc Highest weight a skill may carry against the attacker's own plain attack, so no single formula runs away with the fight.
 * @type number
 * @decimals 2
 * @default 6.00
 *
 * @param dndSoftCurve
 * @text D&D Resolution: Cap Softness
 * @desc Sharpness of the per-hit ceiling. Higher keeps ordinary hits untouched and only bends the huge ones.
 * @type number
 * @default 3
 *
 * @param dndActorHitMaxPercent
 * @text D&D Resolution: Max % of an Actor per Hit
 * @desc Most of a party member's max HP a single hit may ever remove, so nobody is deleted without warning turns.
 * @type number
 * @decimals 3
 * @default 0.300
 *
 * @param dndActorHitMaxPercentLethal
 * @text D&D Resolution: Max % per Hit (Permadeath)
 * @desc The same ceiling under Hardcore and Blood and Oil, where death is terminal and the 1 HP save may be gone. Tighter than the normal one.
 * @type number
 * @decimals 3
 * @default 0.240
 *
 * @param invisibleHandOneShotMaxPercent
 * @text One-Shot Protection: Max % per Hit
 * @desc Maximum fraction of an enemy's max HP that a single hit can deal. Stops one-shot kills. 0.50 = 50%. Set to 0 to disable.
 * @type number
 * @decimals 3
 * @default 0.50
 *
 * @command startBattle
 * @text Start Event Battle
 * @desc Start a battle with the event's fixed troop and maintain HP state
 *
 * @arg eventId
 * @text Event ID
 * @desc The ID of the event to battle with (use 0 for event running this command)
 * @type number
 * @default 0
 *
 * @command setRespawnPoint
 * @text Set Respawn Point
 * @desc Set the map ID and coordinates where the player will respawn
 *
 * @arg mapId
 * @text Map ID
 * @desc The ID of the map to respawn on
 * @type number
 * @default 1
 *
 * @arg x
 * @text X Coordinate
 * @desc The X coordinate to respawn at
 * @type number
 * @default 21
 *
 * @arg y
 * @text Y Coordinate
 * @desc The Y coordinate to respawn at
 * @type number
 * @default 26
 *
 * @command restore
 * @text Restore Inventory
 * @desc Restores the player's gold and inventory from their last death point and removes the gravestone data.
 *
 * @command startPetrodemonBattle
 * @text Start Petrodemon Battle
 * @desc Raises a unique procedural petrodemon boss and fights it here and now.
 *
 * @arg difficulty
 * @text Difficulty
 * @desc easy is below the party's level, normal slightly above it, then progressively harder.
 * @type select
 * @option easy
 * @option normal
 * @option difficult
 * @option brutal
 * @option hellish
 * @default normal
 *
 * @command fightRandomPetrodemon
 * @text Fight Random Petrodemon
 * @desc Raises a petrodemon at a difficulty rolled at random, from easy to hellish.
 *
 * @help
 * ============================================================================
 * BattleSystemEnhanced, Core Module
 * ============================================================================
 *
 * This is the core module of the BattleSystemEnhanced plugin suite.
 * It provides the shared namespace, plugin parameters, i18n pipeline,
 * and all plugin command registrations.
 *
 * SUB-MODULES (load in this order AFTER this plugin):
 *   1. BattleSystemEnhancedEncounters.js , Encounter & Spawning Engine
 *   2. BattleSystemEnhancedState.js      , Persistent Battles & Rewards
 *   3. BattleSystemEnhancedDeath.js      , Gravestone & Respawn Mechanics
 *   4. BattleSystemEnhancedMechanics.js  , Combat Safety & Level Warnings
 *   5. BattleSystemEnhancedLevelDisplay.js- Map UI & Nameplates
 *
 * Terms of Use:
 * Free for use in both commercial and non-commercial projects.
 */

(() => {
    const pluginName = "BattleSystemEnhanced";

    // ------------------------------------------------------------------
    // 1. SHARED GLOBAL NAMESPACE
    // ------------------------------------------------------------------
    window.BattleSystemEnhanced = window.BattleSystemEnhanced || {};
    const BSE = window.BattleSystemEnhanced;

    BSE.Params    = BSE.Params    || {};
    BSE.Data      = BSE.Data      || {};
    BSE.Helpers   = BSE.Helpers   || {};
    BSE.Functions = BSE.Functions || {};
    BSE.State     = BSE.State     || {};

    // ------------------------------------------------------------------
    // 2. PLUGIN PARAMETERS
    // ------------------------------------------------------------------
    const parameters = PluginManager.parameters(pluginName);
    BSE.Params.respawnMapVar        = Number(parameters['respawnMapVar'] || 25);
    BSE.Params.respawnXVar          = Number(parameters['respawnXVar'] || 26);
    BSE.Params.respawnYVar          = Number(parameters['respawnYVar'] || 27);
    BSE.Params.respawnCountryIDVar  = Number(parameters['respawnCountryIDVar'] || 112);
    BSE.Params.levelGapFair         = Number(parameters['levelGapFair'] || 6);
    BSE.Params.levelGapHard         = Number(parameters['levelGapHard'] || 8);
    BSE.Params.levelDampScale       = Number(parameters['levelDampScale'] || 4);
    BSE.Params.levelDampCurve       = Number(parameters['levelDampCurve'] || 2.2);
    BSE.Params.levelDampFloor       = Number(parameters['levelDampFloor'] || 0.005);
    BSE.Params.levelDampLeverageCap = Number(parameters['levelDampLeverageCap'] || 0.40);
    BSE.Params.levelDampLeverageFalloff = Number(parameters['levelDampLeverageFalloff'] || 3.5);
    BSE.Params.levelPressurePerLevel    = Number(parameters['levelPressurePerLevel'] || 0.100);
    BSE.Params.levelPressureCap         = Number(parameters['levelPressureCap'] || 2.60);
    BSE.Params.levelPressureOutnumber   = Number(parameters['levelPressureOutnumber'] || 0.45);
    BSE.Params.invisibleHandChipFloorPercent      = Number(parameters['invisibleHandChipFloorPercent'] || 0.0050);
    BSE.Params.invisibleHandEnabled               = (parameters['invisibleHandEnabled'] !== 'false');
    BSE.Params.invisibleHandLevelGapEnabled         = (parameters['invisibleHandLevelGapEnabled'] !== 'false');
    BSE.Params.invisibleHandOutnumberEnabled        = (parameters['invisibleHandOutnumberEnabled'] !== 'false');
    BSE.Params.invisibleHandGraceEdge             = Number(parameters['invisibleHandGraceEdge'] || 2);
    BSE.Params.invisibleHandGraceMult             = Number(parameters['invisibleHandGraceMult'] || 1.40);
    BSE.Params.invisibleHandSteepK                = Number(parameters['invisibleHandSteepK'] || 0.20);
    BSE.Params.invisibleHandSteepCurve            = Number(parameters['invisibleHandSteepCurve'] || 1.9);
    BSE.Params.invisibleHandGapDefenseCurve       = Number(parameters['invisibleHandGapDefenseCurve'] || 0.50);
    BSE.Params.invisibleHandUnderSpan             = Number(parameters['invisibleHandUnderSpan'] || 20);
    BSE.Params.invisibleHandUnderFloor            = Number(parameters['invisibleHandUnderFloor'] || 0.65);
    BSE.Params.invisibleHandOutnumberFactor       = Number(parameters['invisibleHandOutnumberFactor'] || 0.50);
    BSE.Params.invisibleHandOutnumberOffenseCurve = Number(parameters['invisibleHandOutnumberOffenseCurve'] || 0.50);
    BSE.Params.invisibleHandStatFloor             = Number(parameters['invisibleHandStatFloor'] || 0.60);
    BSE.Params.invisibleHandStatCeiling           = Number(parameters['invisibleHandStatCeiling'] || 10.00);
    BSE.Params.invisibleHandGearSpan              = Number(parameters['invisibleHandGearSpan'] || 5);
    BSE.Params.invisibleHandGearFloor             = Number(parameters['invisibleHandGearFloor'] || -2);
    BSE.Params.invisibleHandGearCeiling           = Number(parameters['invisibleHandGearCeiling'] || 6);
    BSE.Params.invisibleHandWeaponDefenseEnabled   = (parameters['invisibleHandWeaponDefenseEnabled'] !== 'false');
    BSE.Params.invisibleHandWeaponDefenseScale     = Number(parameters['invisibleHandWeaponDefenseScale'] || 0.0015);
    BSE.Params.invisibleHandWeaponDefenseThreshold = Number(parameters['invisibleHandWeaponDefenseThreshold'] || 60);
    BSE.Params.invisibleHandWeaponDefenseFloor     = Number(parameters['invisibleHandWeaponDefenseFloor'] || 0.80);
    BSE.Params.invisibleHandWeaponDefenseCeiling   = Number(parameters['invisibleHandWeaponDefenseCeiling'] || 2.50);
    BSE.Params.invisibleHandOneShotMaxPercent     = Number(parameters['invisibleHandOneShotMaxPercent'] || 0.50);
    BSE.Params.loneMemberMaxEnemies    = Number(parameters['loneMemberMaxEnemies'] || 2);
    BSE.Params.dndResolutionEnabled   = (parameters['dndResolutionEnabled'] !== 'false');
    BSE.Params.dndPaceWeight          = Number(parameters['dndPaceWeight'] || 0.70);
    BSE.Params.dndActorHits           = Number(parameters['dndActorHits'] || 9);
    BSE.Params.dndEnemyHits           = Number(parameters['dndEnemyHits'] || 5);
    BSE.Params.dndGapPerLevel         = Number(parameters['dndGapPerLevel'] || 0.15);
    BSE.Params.dndGapCap              = Number(parameters['dndGapCap'] || 6.00);
    BSE.Params.dndContestPerPoint     = Number(parameters['dndContestPerPoint'] || 0.060);
    BSE.Params.dndContestFloor        = Number(parameters['dndContestFloor'] || 0.60);
    BSE.Params.dndContestCeiling      = Number(parameters['dndContestCeiling'] || 1.50);
    BSE.Params.dndOutnumberContest    = Number(parameters['dndOutnumberContest'] || 1.80);
    BSE.Params.dndModCap              = Number(parameters['dndModCap'] || 5);
    BSE.Params.dndSkillWeightFloor    = Number(parameters['dndSkillWeightFloor'] || 0.10);
    BSE.Params.dndSkillWeightCeiling  = Number(parameters['dndSkillWeightCeiling'] || 6.00);
    BSE.Params.dndSoftCurve           = Number(parameters['dndSoftCurve'] || 3);
    BSE.Params.dndActorHitMaxPercent  = Number(parameters['dndActorHitMaxPercent'] || 0.300);
    BSE.Params.dndActorHitMaxPercentLethal = Number(parameters['dndActorHitMaxPercentLethal'] || 0.240);

    // ------------------------------------------------------------------
    // 3. SHARED STATE (module-level closures, exposed via BSE.Data)
    // ------------------------------------------------------------------
    BSE.Data._persistentEnemyData  = {};
    BSE.Data._currentBattleEventId = null;
    BSE.Data._currentEventId       = null;
    BSE.Data._currentMapId         = null;
    // `title` / `lines` are the spoils popup's extra copy (a felled petrodemon
    // names itself and reports the OIL options it paid out); both are cleared
    // at the start of every victory. `levelUps` are the levels the fight paid
    // for, held back from the battle's message box and shown as toasts on the
    // map once the spoils have been read out.
    BSE.Data._battleRewards        = {
        exp: 0, gold: 0, items: [], knowledge: 0, title: null, lines: [], levelUps: []
    };
    BSE.Data._needsRespawn         = false;
    BSE.Data._enemyCharSprites     = {};
    BSE.Data._mapCorpses           = [];
    BSE.Data._enemyPartDamage      = {};

    // Convenience accessors so sub-modules can read/write
    BSE.State.persistentEnemyData  = BSE.Data._persistentEnemyData;
    BSE.State.currentBattleEventId = BSE.Data._currentBattleEventId;
    BSE.State.currentEventId       = BSE.Data._currentEventId;
    BSE.State.currentMapId         = BSE.Data._currentMapId;
    BSE.State.battleRewards        = BSE.Data._battleRewards;
    BSE.State.needsRespawn         = BSE.Data._needsRespawn;
    BSE.State.enemyCharSprites     = BSE.Data._enemyCharSprites;
    BSE.State.mapCorpses           = BSE.Data._mapCorpses;
    BSE.State.enemyPartDamage      = BSE.Data._enemyPartDamage;

    // Nearby monsters that joined the current battle (see startPersistentBattle
    // and section 5b of the encounters module). Read it through
    // BSE.Helpers.getReinforcement(), never directly: an arena fight, a trial or
    // any other battle set up outside startPersistentBattle would otherwise see
    // whatever the previous overworld encounter left behind.
    BSE.State.reinforcement = null;

    // The party's InvisibleHand effective level for the battle in progress,
    // null between battles so it is recomputed fresh on the next one. See
    // section 4c below.
    BSE.State.ihPartyLevel = null;

    // ------------------------------------------------------------------
    // 4. SHARED HELPER FUNCTIONS
    // ------------------------------------------------------------------

    /**
     * Extract enemy level from <Level:X> note tag
     */
    BSE.Helpers.getEnemyLevel = function(note) {
        if (!note) return 0;
        const m = note.match(/<Level:\s*(\d+)>/i);
        return m ? parseInt(m[1], 10) : 0;
    };

    /**
     * The reinforcements in the battle being fought right now: which troop slot
     * they were built into, how many members the troop that started the fight
     * contributed (they hold indexes 0..baseSize-1), and one entry per joining
     * map event. Answers a neutral, empty record for every battle that was not
     * set up by startPersistentBattle against a reinforced troop.
     */
    BSE.Helpers.getReinforcement = function() {
        const r = BSE.State.reinforcement;
        if (r && $gameTroop && $gameTroop._troopId === r.troopId) return r;
        return {
            troopId: 0,
            baseSize: ($gameTroop && $gameTroop.members().length) || 0,
            joined: []
        };
    };

    /**
     * Get the median level of the party
     */
    BSE.Helpers.getMedianLevel = function(party) {
        const levels = party.map(m => m.level).sort((a, b) => a - b);
        const mid = Math.floor(levels.length / 2);
        return levels.length % 2
            ? levels[mid]
            : (levels[mid - 1] + levels[mid]) / 2;
    };

    /**
     * Extract archetype from enemy note
     */
    BSE.Helpers.getEnemyArchetype = function(enemyData) {
        if (!enemyData) return null;
        // Notes never change at runtime; parse once and cache on the shared
        // $dataEnemies object (undefined = not yet computed; null is a valid
        // cached "no archetype"). This is hit from per-frame movement/combat.
        if (enemyData._bseArchetype !== undefined) return enemyData._bseArchetype;
        let archetype = null;
        if (enemyData.note) {
            const archetypeMatch = enemyData.note.match(/<Archetype:\s*(.+?)>/i);
            if (archetypeMatch) archetype = archetypeMatch[1].trim();
        }
        enemyData._bseArchetype = archetype;
        return archetype;
    };

    /**
     * Get the archetype of the first enemy in an event's troop
     */
    BSE.Helpers.getEventArchetype = function(event) {
        if (!event || !event._fixedTroopId) return null;
        // Cache on the event, keyed on troop id so a re-fixed event recomputes.
        if (event._bseArchTroop === event._fixedTroopId) return event._bseArch;
        const troop = $dataTroops[event._fixedTroopId];
        let archetype = null;
        if (troop && troop.members.length) {
            const enemy = $dataEnemies[troop.members[0].enemyId];
            if (enemy) archetype = BSE.Helpers.getEnemyArchetype(enemy);
        }
        event._bseArchTroop = event._fixedTroopId;
        event._bseArch = archetype;
        return archetype;
    };

    /**
     * Cached <Climb> note-tag check. Called from the per-frame realMoveSpeed /
     * canPass movement overrides, so memoize on the shared $dataEnemies object.
     */
    BSE.Helpers.enemyHasClimb = function(enemyData) {
        if (!enemyData) return false;
        if (enemyData._bseClimb !== undefined) return enemyData._bseClimb;
        enemyData._bseClimb = !!(enemyData.note && enemyData.note.includes('<Climb>'));
        return enemyData._bseClimb;
    };

    /**
     * Roguelite and Peaceful are the modes a death is walked off in: the party
     * gets back up and the run continues. Hardcore / Blood and Oil (switch 9)
     * end it instead, so nothing is handed back there.
     */
    BSE.Helpers.isForgivingDeathMode = function() {
        if (window.PeacefulMode && window.PeacefulMode.isActive()) return true;
        return !$gameSwitches.value(9);
    };

    /**
     * Every need meter of every party member back to full: hunger and sleep,
     * which live on the actor, and hygiene / social / leisure, which live on
     * the actor for the player and on the society profile for a recruited
     * companion (setExtendedNeed resolves that). Called on a death the party
     * walks away from, so nobody gets back up already starving or filthy.
     */
    BSE.Helpers.refillPartyNeeds = function() {
        const TDS = window.TimeDateSystem || {};
        const maxHunger = TDS.maxHunger || 100;
        const maxSleep  = TDS.maxSleep  || 100;
        const maxNeed   = TDS.maxNeed   || 100;
        for (const member of $gameParty.members()) {
            if (!member) continue;
            if (member._hunger !== undefined) member._hunger = maxHunger;
            if (member._sleep !== undefined) member._sleep = maxSleep;
            if (member.setExtendedNeed) {
                member.setExtendedNeed('hygiene', maxNeed);
                member.setExtendedNeed('social', maxNeed);
                member.setExtendedNeed('leisure', maxNeed);
            }
            // The low-need warnings only fire on the way INTO a low band, so
            // forget the bands the party was in or the next dip stays silent.
            member._prevHungerState = 'normal';
            member._prevSleepState = 'normal';
            member._prevExtNeedStates = {};
        }
    };

    /**
     * Check if a tile is aquatic (region 99 or MovementSystem water)
     */
    BSE.Helpers.isAquaticTile = function(x, y) {
        if (window.MovementSystem && window.MovementSystem.isWaterTile) {
            return window.MovementSystem.isWaterTile(x, y);
        }
        if (!$gameMap) return false;
        return $gameMap.regionId(x, y) === 99;
    };

    // ------------------------------------------------------------------
    // 4b. LEVEL-GAP DAMAGE DAMPING (party -> enemy)
    //
    //   A low-level party may always kill a much higher-level enemy, but not
    //   by trading raw hits: the wider the gap between the attacker's level
    //   and the enemy's <Level:X>, the more of the attack's damage is damped.
    //   The curve is flat inside the fair gap (levelGapFair, the levels a
    //   party is expected to be able to fight above their own), then
    //   accelerates (curve > 1) and bottoms out at the floor, so the gap
    //   alone never zeroes a hit: the party can always land on anything, they
    //   just cannot land for enough.
    //
    //   Tactics buy the damage back. Critical hits, elemental weakness, the
    //   debuffs and crippling states the party has landed and its own buffs
    //   all count as leverage, which undoes up to leverageCap of the damping
    //   - but leverageCap itself decays with the gap (levelDampLeverageFalloff),
    //   so a stacked turn rescues a fight a few levels over the party's head
    //   and does very little for one twenty levels over it. Slip damage
    //   (poison and the like) never passes through here at all, so
    //   damage-over-time remains another way through a big gap.
    //
    //   This half only ever scales an actor's outgoing HP damage. The other
    //   half of the same gap, what the party TAKES from a monster above them,
    //   is levelPressureFactor in section 4b-ter.
    // ------------------------------------------------------------------

    /**
     * Level of any battler, 0 when an enemy carries no <Level:X> tag.
     *
     * An explicit per-instance level (Game_Enemy#level, set by the summon and
     * arena systems and by anything that reads a monster at a level other than
     * the one it was authored at) outranks the tag: the gap rules and the
     * damage formulas have to be looking at the same number, or a monster
     * fights at one level and is priced at another.
     *
     * The tag itself is cached on the shared $dataEnemies entry: this runs per
     * damage roll.
     */
    BSE.Helpers.getBattlerLevel = function(battler) {
        if (!battler) return 0;
        if (battler.isActor && battler.isActor()) return battler.level || 0;
        if (!battler.isEnemy || !battler.isEnemy()) return 0;
        if (battler._bseLevelOverride != null) return battler._bseLevelOverride;
        const enemyData = battler.enemy();
        if (!enemyData) return 0;
        if (enemyData._bseLevel === undefined) {
            enemyData._bseLevel = BSE.Helpers.getEnemyLevel(enemyData.note);
        }
        return enemyData._bseLevel;
    };

    /**
     * The party as the battle rules count it: the people actually travelling,
     * the summon excluded.
     *
     * A summon holds the fourth slot for the length of one fight and leaves
     * with it. It is not another traveller the world can throw monsters at, so
     * it never turns a lone character into a group, neither for the outnumbered
     * rules below nor for how big an encounter the map is allowed to build.
     *
     * Pass true for the ones still standing, false (or nothing) for the roster.
     */
    BSE.Helpers.realPartyMembers = function(aliveOnly) {
        if (!$gameParty) return [];
        const SS = window.SummonSystem;
        const list = aliveOnly ? $gameParty.aliveMembers() : $gameParty.members();
        return list.filter(a =>
            a && !(SS && SS.isProxyActor && SS.isProxyActor(a.actorId())));
    };

    /**
     * How many monsters may stand against the party at once.
     *
     * Every troop in the database is a single monster, so the size of a fight
     * is decided entirely by how many roaming monsters pile in on top of the
     * one the party walked into (section 5b of the encounters module, and the
     * live join in MapBattleMode). Left to the general cap, a character
     * travelling alone could be surrounded by three or more at once, which
     * with one action against three is not a hard fight but an execution.
     *
     * A lone traveller is therefore never faced with more than
     * loneMemberMaxEnemies at a time. A summon does not count toward the party
     * here on purpose: it is spent per battle and cannot be relied on to be
     * there when the encounter is built.
     */
    BSE.Helpers.maxEnemiesForParty = function() {
        const general = BSE.Data.BATTLE_MAX_MEMBERS || 6;
        const size = BSE.Helpers.realPartyMembers(false).length;
        if (size <= 1) return Math.max(1, Math.min(general, BSE.Params.loneMemberMaxEnemies));
        return general;
    };

    /**
     * A state counts as detrimental when it restricts the target, weakens one
     * of its params or drains its HP. Nothing in the database flags a state as
     * good or bad, so its traits are what we read.
     */
    function isDetrimentalState(state) {
        if (!state) return false;
        if (state._bseHarmful !== undefined) return state._bseHarmful;
        let harmful = state.restriction > 0;
        if (!harmful && state.traits) {
            harmful = state.traits.some(t =>
                (t.code === Game_BattlerBase.TRAIT_PARAM && t.value < 1) ||
                (t.code === Game_BattlerBase.TRAIT_XPARAM && t.dataId === 7 && t.value < 0)
            );
        }
        state._bseHarmful = harmful;
        return harmful;
    }

    /**
     * How much of the level damping the party has earned back on this hit.
     * 0 = raw numbers only, 1 = fully offset (capped by leverageCap).
     */
    BSE.Helpers.tacticalLeverage = function(subject, target, action, critical) {
        let leverage = 0;
        if (critical) leverage += 0.5;
        if (action && action.calcElementRate) {
            const rate = action.calcElementRate(target);
            if (rate > 1) leverage += Math.min(0.5, (rate - 1) * 0.5);
        }
        let debuffs = 0;
        if (target._buffs) {
            for (const level of target._buffs) if (level < 0) debuffs++;
        }
        leverage += Math.min(0.4, debuffs * 0.1);
        const crippled = target.states().filter(isDetrimentalState).length;
        leverage += Math.min(0.45, crippled * 0.15);
        let buffs = 0;
        if (subject._buffs) {
            for (const level of subject._buffs) if (level > 0) buffs++;
        }
        leverage += Math.min(0.2, buffs * 0.05);
        return Math.min(1, leverage);
    };

    // ------------------------------------------------------------------
    // 4b-ter. THE LEVEL GAP, READ THE SAME WAY EVERYWHERE
    //
    //   One rule decides what a level number on a monster means, and the
    //   damage layer, the battle-start warning and the map nameplate all
    //   read it from here instead of each carrying its own threshold:
    //
    //     up to levelGapFair (+6)   an even fight. The party can fell it.
    //     up to levelGapHard (+8)   a hard fight, winnable at a cost.
    //     past levelGapHard         out of reach. Chip damage going out,
    //                               real damage coming back.
    //
    //   Past the fair gap two things happen at once, and it matters that
    //   they are two and not one. The party's own hits are damped, so a
    //   monster far above them cannot simply be worn down; and the monster
    //   presses harder in return (levelPressureFactor), so the fight is
    //   lost on the clock rather than merely being slow. Damping alone only
    //   ever made an over-level monster tedious: the party ground it out
    //   over fifty turns because nothing was punishing them for taking
    //   fifty turns. It still lands - a level 1 party can always hit a
    //   level 27 monster - it just never lands for enough.
    //
    //   Outnumbering it does not settle the matter either. Three party
    //   members swinging at one monster is three times the actions per
    //   round, which used to be enough to bring down anything given the
    //   patience, so the pressure a monster puts out scales with how badly
    //   it is outnumbered (levelPressureOutnumber): the same 3v1 that
    //   triples the party's output also triples what each of them is
    //   standing in front of. The other direction is already covered, by
    //   the defensive credit dndOutnumberedBonus hands a lone party member.
    //
    //   Nothing here can delete anyone outright. The per-hit ceiling on a
    //   party member (dndActorHitMaxPercent, tightened under permadeath)
    //   sits over the whole thing, so an over-level monster takes a huge
    //   bite out of a health bar and still leaves turns to run.
    // ------------------------------------------------------------------

    /** Tier names, shared by the damage layer, the warning and the nameplate. */
    BSE.Data.LEVEL_GAP_EVEN     = 0;
    BSE.Data.LEVEL_GAP_HARD     = 1;
    BSE.Data.LEVEL_GAP_HOPELESS = 2;

    /**
     * How far a monster outranks a reference level, and which of the three
     * bands that lands in. `refLevel` defaults to the party's median.
     */
    BSE.Helpers.levelGapTier = function(enemyLevel, refLevel) {
        const ref = refLevel != null ? refLevel : BSE.Helpers.dndReferenceLevel();
        const gap = (enemyLevel || 0) - (ref || 0);
        let tier = BSE.Data.LEVEL_GAP_EVEN;
        if (gap > BSE.Params.levelGapHard) tier = BSE.Data.LEVEL_GAP_HOPELESS;
        else if (gap > BSE.Params.levelGapFair) tier = BSE.Data.LEVEL_GAP_HARD;
        return { gap: gap, tier: tier };
    };

    /**
     * Whether the level gap rules apply at all. They are a difficulty curve,
     * and the sandbox and the playtest character stand outside it.
     */
    function levelGapRulesApply() {
        if ($gameSystem && $gameSystem._isSandboxMode) return false;
        const leader = $gameParty && $gameParty.leader ? $gameParty.leader() : null;
        if (leader && leader.name() === "Test") return false; // i18n-ignore: playtest character name
        return true;
    }

    /**
     * How badly a battler is outnumbered, as a ratio: 0 when the headcount is
     * even or in its favour, 1 when it faces twice its own number, and so on.
     * A <Boss> reads 0, the same exemption it is given everywhere else.
     */
    BSE.Helpers.outnumberedRatio = function(battler) {
        if (!battler || !$gameParty || !$gameParty.inBattle() || !$gameTroop) return 0;
        const isActor = !!(battler.isActor && battler.isActor());
        if (!isActor && battler.enemy && ihIsBossEnemy(battler.enemy())) return 0;
        const partyCount = BSE.Helpers.realPartyMembers(true).length;
        const troopCount = $gameTroop.aliveMembers().length;
        const own   = isActor ? partyCount : troopCount;
        const other = isActor ? troopCount : partyCount;
        if (own <= 0 || other <= own) return 0;
        return other / own - 1;
    };

    /**
     * The two halves of the same curve, both measured in levels PAST the fair
     * gap, and both used in both directions. Whoever is behind has their hits
     * damped; whoever is ahead has them lifted. A gap of 0 or less is an even
     * fight and returns 1 from either.
     */
    function gapDamp(gap) {
        if (gap <= 0) return 1;
        const scale = Math.max(1, BSE.Params.levelDampScale);
        return Math.max(
            BSE.Params.levelDampFloor,
            1 / (1 + Math.pow(gap / scale, BSE.Params.levelDampCurve))
        );
    }

    function gapLift(gap, widen) {
        if (gap <= 0) return 1;
        return Math.min(BSE.Params.levelPressureCap,
            1 + gap * BSE.Params.levelPressurePerLevel * (1 + (widen || 0)));
    }

    /**
     * Multiplier applied to an actor's outgoing damage against an enemy.
     * Always 1 inside the fair gap in either direction, when the enemy has no
     * declared level, or in the sandbox / playtest character.
     *
     * Past the fair gap the party's hits are damped, and tactics (a crit, a
     * weakness, a crippled target) buy back part of that damping, but only
     * part, and less of it the wider the gap: at the edge of the fair gap a
     * well-set-up hit is worth nearly a whole one, and every
     * levelDampLeverageFalloff levels beyond that halves what the same setup
     * is worth. A stacked turn is how a party fells a monster six levels above
     * them. It is not how they fell one twenty levels above them.
     *
     * The gap runs the other way too: a party that outranks a monster by more
     * than the fair gap hits it harder for every level of it, which is what
     * lets them cut through the fauna they have outgrown instead of trading
     * blows with it. The one-shot ceiling
     * (invisibleHandOneShotMaxPercent, applied in makeDamageValue) still
     * stands over the result, so even a crushing gap leaves a turn in the
     * fight rather than deleting a monster from full HP.
     */
    BSE.Helpers.levelDampingFactor = function(subject, target, action, critical) {
        if (!subject || !target) return 1;
        if (!subject.isActor || !subject.isActor()) return 1;
        if (!target.isEnemy || !target.isEnemy()) return 1;
        if (!levelGapRulesApply()) return 1;
        const enemyLevel = BSE.Helpers.getBattlerLevel(target);
        if (enemyLevel <= 0) return 1;
        const actorLevel = BSE.Helpers.getBattlerLevel(subject);
        const gap = enemyLevel - actorLevel;
        const fair = BSE.Params.levelGapFair;
        // Inside the fair gap, in either direction, a hit is a hit.
        if (Math.abs(gap) <= fair) return 1;
        if (gap < 0) {
            // The party outranks the monster by more than the fair gap: they
            // cut through fauna they have outgrown instead of trading blows.
            return gapLift(-gap - fair, 0);
        }
        const over = gap - fair;
        const damp = gapDamp(over);
        const falloff = Math.max(1, BSE.Params.levelDampLeverageFalloff);
        const cap = BSE.Params.levelDampLeverageCap * Math.pow(0.5, over / falloff);
        const leverage = BSE.Helpers.tacticalLeverage(subject, target, action, critical) * cap;
        return Math.max(BSE.Params.levelDampFloor, damp + (1 - damp) * leverage);
    };

    /**
     * Multiplier applied to a monster's outgoing damage against a party
     * member: the other half of the level gap, and the half that decides
     * whether an over-level fight is dangerous or merely long.
     *
     * A monster at the same level presses at 1x. Outranking the party scales
     * damage upward per level (levelPressurePerLevel), amplified if outnumbered
     * (levelPressureOutnumber).
     *
     * An under-level monster is damped accordingly, so fauna the party has
     * outgrown deal chip damage.
     */
    BSE.Helpers.levelPressureFactor = function(subject, target) {
        if (!subject || !target) return 1;
        if (!subject.isEnemy || !subject.isEnemy()) return 1;
        if (!target.isActor || !target.isActor()) return 1;
        if (!levelGapRulesApply()) return 1;
        const enemyLevel = BSE.Helpers.getBattlerLevel(subject);
        if (enemyLevel <= 0) return 1;
        const actorLevel = BSE.Helpers.getBattlerLevel(target);
        const ahead = enemyLevel - actorLevel;
        const fair = BSE.Params.levelGapFair;
        // Inside the fair gap an even fight is an even fight, whatever the
        // head count on either side.
        if (Math.abs(ahead) <= fair) return 1;
        if (ahead < 0) {
            return gapDamp(-ahead - fair);
        }
        // The headcount widens the gap rather than multiplying on top of it,
        // so an even fight is never changed by it and the extra weight comes
        // in gradually as the gap opens instead of arriving as a step.
        return gapLift(ahead - fair, BSE.Helpers.outnumberedRatio(subject) * BSE.Params.levelPressureOutnumber);
    };

    // ------------------------------------------------------------------
    // 4b-bis. D&D STAT RESOLUTION
    //
    //   Every class curve and every monster entry now runs on bounded D&D
    //   ability scores: a class opens around 8-16 and tops out at 20, a
    //   monster reads 8-17 across the whole level range, a weapon is worth
    //   +0 to +10 and a piece of armour +0 to +3. The damage formulas in the
    //   database were written for the linear stat system that came before,
    //   where ATK ran into the hundreds, and they read those bounded scores
    //   as if they were still raw damage numbers. Two things break as a
    //   result:
    //
    //   - `(1 + a.level * 0.05)` swings damage by 5.95x from level 1 to 99
    //     while ATK only swings 1.5x, so the ability score barely decides
    //     anything and the level number decides everything.
    //   - `- b.def * 1.5` subtracts about 24 from a hit of 230, so armour,
    //     the whole defensive half of the sheet, does effectively nothing.
    //
    //   Rather than rewrite 776 formulas and every monster entry, this layer
    //   re-reads what they produce. The formula keeps deciding how heavy one
    //   skill is against another, which is the one thing it is still good
    //   at; this layer decides how much of a battler that weight removes,
    //   the way an ability contest would.
    //
    //   A hit is resolved in three steps:
    //
    //   1. Skill weight. The raw value is measured against what the same
    //      attacker's plain attack would do to the same target right now, so
    //      a working worth three plain swings stays worth three plain swings
    //      whatever the absolute numbers look like.
    //   2. Pace. The plain swing itself is pulled, in log space, toward the
    //      designed hit size, a share of the defender's max HP set by
    //      dndActorHits / dndEnemyHits and widened by the level gap. This is
    //      what stops a monster with an outlier HP pool from being either a
    //      pushover or a wall purely by how it was authored.
    //   3. Contest. STR against CON for a physical hit, INT against WIS for
    //      a magical one, at dndContestPerPoint per point of difference and
    //      bounded both ways. This is where the ability scores finally
    //      matter: every point of a score, and every point a weapon or a
    //      piece of armour adds to one, moves real damage.
    //
    //   The outnumbered side, whichever side that is, adds
    //   dndOutnumberContest defensive modifier points per extra foe it
    //   faces, which is the InvisibleHand's job (section 4c) carried into
    //   the contest: its DEF/MDF boost feeds the raw formula, and a raw
    //   formula is exactly what no longer decides much on its own. A lone
    //   monster holding off three party members is harder to cut down for
    //   the same reason a cornered one is, and a party member left alone
    //   against three monsters is given the same courtesy.
    //
    //   Finally no single hit may take more than dndActorHitMaxPercent of a
    //   party member, so nobody is ever deleted from full HP without turns
    //   to answer for it. Under Hardcore and Blood and Oil, where death is
    //   terminal and the once-per-battle 1 HP save is gone, that ceiling is
    //   tightened rather than loosened: those modes are meant to punish a
    //   run of bad decisions, not a single unlucky roll.
    // ------------------------------------------------------------------

    /**
     * A monster's level as a number the damage formulas can read.
     *
     * Game_Enemy has no level of its own in MZ, so `a.level` in a formula
     * evaluated for a monster is undefined, the whole expression is NaN and
     * evalDamageFormula quietly returns 0. Nearly every damaging skill in
     * the database carries the `(1 + a.level * 0.05)` term, so without this
     * accessor the overwhelming majority of monster attacks land for
     * nothing at all.
     *
     * `<Level:X>` answers it when the entry carries one. When it does not,
     * the monster reads at the party's own level, so an untagged entry
     * fights as an even match instead of as a level 0 no-op.
     */
    Object.defineProperty(Game_Enemy.prototype, "level", {
        get: function() {
            // getBattlerLevel already prefers the per-instance override.
            const tagged = BSE.Helpers.getBattlerLevel(this);
            if (tagged > 0) return tagged;
            return Math.max(1, Math.round(BSE.Helpers.dndReferenceLevel()));
        },
        set: function(value) { this._bseLevelOverride = value; },
        configurable: true
    });

    /**
     * The level an untagged monster reads at: the party's own effective
     * level, or 1 outside a battle.
     */
    BSE.Helpers.dndReferenceLevel = function() {
        if (!$gameParty) return 1;
        if ($gameParty.inBattle()) {
            if (BSE.State.ihPartyLevel === null || BSE.State.ihPartyLevel === undefined) {
                BSE.State.ihPartyLevel = BSE.Helpers.ihComputeEffectivePartyLevel();
            }
            return BSE.State.ihPartyLevel;
        }
        const members = $gameParty.members();
        return members.length ? BSE.Helpers.getMedianLevel(members) : 1;
    };

    /**
     * Defensive ability modifier points the outnumbered side of the field
     * gains, for either side. 0 when the headcount is even or better, and
     * always 0 for a <Boss>, which is already tuned around being fought
     * outnumbered.
     */
    BSE.Helpers.dndOutnumberedBonus = function(battler) {
        if (!battler || !$gameParty || !$gameParty.inBattle() || !$gameTroop) return 0;
        const isActor = !!(battler.isActor && battler.isActor());
        if (!isActor && battler.enemy && ihIsBossEnemy(battler.enemy())) return 0;
        const partyCount = BSE.Helpers.realPartyMembers(true).length;
        const troopCount = $gameTroop.aliveMembers().length;
        const own   = isActor ? partyCount : troopCount;
        const other = isActor ? troopCount : partyCount;
        if (own <= 0 || other <= own) return 0;
        return BSE.Params.dndOutnumberContest * (other / own - 1);
    };

    /**
     * A raw ability modifier read back into the band the stat system actually
     * spans. Classes cap at 20 and monsters are authored to match, so a
     * modifier past dndModCap comes from an outlier entry rather than from a
     * battler that is genuinely that much stronger, and letting it into the
     * contest would hand a stray level 1 monster a veteran's arm.
     */
    function dndClampMod(value) {
        const cap = BSE.Params.dndModCap;
        return Math.max(-cap, Math.min(cap, value || 0));
    }

    /**
     * The attacker's offensive ability modifier for this action: STR for a
     * physical hit, INT for a magical one. A two-handed grip is worth a
     * point of it, which is what the old flat "+1.5 per modifier point"
     * bonus was reaching for before the pace layer made a flat addition to a
     * paced number meaningless.
     */
    BSE.Helpers.dndOffenseMod = function(subject, action) {
        if (!subject) return 0;
        let mod = dndClampMod(action && action.isMagical && action.isMagical()
            ? subject.intMod
            : subject.strMod);
        if (subject.weapons && subject.weapons().some(w => w && w.note && /<TwoHanded>/i.test(w.note))) {
            mod += 1;
        }
        return mod;
    };

    /**
     * The defender's mitigating ability modifier for this action: CON
     * against a physical hit, WIS against a magical one, plus whatever being
     * outnumbered is worth.
     */
    BSE.Helpers.dndDefenseMod = function(target, action) {
        if (!target) return 0;
        const base = dndClampMod(action && action.isMagical && action.isMagical()
            ? target.wisMod
            : target.conMod);
        return base + BSE.Helpers.dndOutnumberedBonus(target);
    };

    /**
     * The ability contest as a damage multiplier, bounded both ways so no
     * armour ever zeroes a hit and no attacker ever runs away with one.
     */
    BSE.Helpers.dndContestMultiplier = function(subject, target, action) {
        const contest = BSE.Helpers.dndOffenseMod(subject, action) -
                        BSE.Helpers.dndDefenseMod(target, action);
        return Math.max(BSE.Params.dndContestFloor,
            Math.min(BSE.Params.dndContestCeiling,
                1 + contest * BSE.Params.dndContestPerPoint));
    };

    /**
     * What the attacker's own plain attack would do to this target right
     * now, read straight off the database formula. The yardstick a skill's
     * weight is measured against; never itself displayed.
     */
    BSE.Helpers.dndReferenceDamage = function(subject, target) {
        if (!subject || !target) return 0;
        const skillId = subject.attackSkillId ? subject.attackSkillId() : 1;
        const skill = $dataSkills[skillId] || $dataSkills[1];
        if (!skill || !skill.damage || !skill.damage.formula) return 0;
        try {
            const a = subject;                  // eslint-disable-line no-unused-vars
            const b = target;                   // eslint-disable-line no-unused-vars
            const v = $gameVariables._data;     // eslint-disable-line no-unused-vars
            const value = eval(skill.damage.formula);
            return isNaN(value) ? 0 : Math.max(0, value);
        } catch (e) {
            return 0;
        }
    };

    /**
     * A saturating ceiling: ordinary hits pass through all but untouched and
     * only the outliers bend, asymptotically, toward the cap. Preferred to a
     * hard clamp because it never flattens two different hits onto the same
     * number, so a better weapon or a better score always still shows.
     */
    function dndSoftCap(ratio, cap) {
        if (!(cap > 0) || ratio <= 0) return ratio;
        const n = Math.max(1, BSE.Params.dndSoftCurve);
        return ratio / Math.pow(1 + Math.pow(ratio / cap, n), 1 / n);
    }

    /**
     * The per-hit ceiling on a party member: no single hit may take more than
     * dndActorHitMaxPercent of them, tightened to dndActorHitMaxPercentLethal
     * under Hardcore and Blood and Oil, where death is terminal and there is
     * no once-per-battle 1 HP save to fall back on. A saturating cap rather
     * than a clamp, so a heavier hit is always still a heavier hit.
     *
     * This is what keeps an over-level monster from instakilling: it removes a
     * huge part of a health bar and leaves turns to answer.
     */
    BSE.Helpers.capActorHit = function(target, value) {
        if (!target || !(target.mhp > 0) || !(value > 0)) return value;
        if (!(target.isActor && target.isActor())) return value;
        const cap = BSE.Helpers.isForgivingDeathMode()
            ? BSE.Params.dndActorHitMaxPercent
            : BSE.Params.dndActorHitMaxPercentLethal;
        return dndSoftCap(value / target.mhp, cap) * target.mhp;
    };

    /**
     * The whole layer, applied to one already rolled HP damage value.
     * Returns the value untouched whenever it has nothing to say: the master
     * switch is off, the sandbox is open, the target has no HP pool, or
     * there is no readable plain attack to measure the hit against.
     */
    BSE.Helpers.dndResolveDamage = function(subject, target, action, value) {
        if (!BSE.Params.dndResolutionEnabled) return value;
        if (!subject || !target || !(value > 0)) return value;
        if ($gameSystem && $gameSystem._isSandboxMode) return value;
        if (!(target.mhp > 0)) return value;

        const reference = BSE.Helpers.dndReferenceDamage(subject, target);
        // With no readable plain attack to measure against there is no scale
        // to speak of, so the raw value is left to stand on its own.
        if (!(reference > 0)) return value;

        // 1. How heavy this skill is against the attacker's own plain swing.
        const weight = Math.max(BSE.Params.dndSkillWeightFloor,
            Math.min(BSE.Params.dndSkillWeightCeiling, value / reference));

        // 2. The designed size of that plain swing against this defender,
        //    widened by however far the defender outranks the attacker.
        const gap = Math.min(BSE.Params.dndGapCap,
            Math.max(0, (target.level || 0) - (subject.level || 0)) * BSE.Params.dndGapPerLevel);
        const isActorTarget = !!(target.isActor && target.isActor());
        const hits = Math.max(1,
            (isActorTarget ? BSE.Params.dndActorHits : BSE.Params.dndEnemyHits) * (1 + gap));
        const designed = target.mhp / hits;

        // Pulled toward the designed size in log space, so the raw formula
        // still tilts the result without being able to run away with it.
        const w = Math.max(0, Math.min(1, BSE.Params.dndPaceWeight));
        const paced = Math.pow(Math.max(1, reference), 1 - w) * Math.pow(designed, w);

        // 3. The ability contest.
        let resolved = paced * weight * BSE.Helpers.dndContestMultiplier(subject, target, action);

        // Nobody is deleted from full HP without turns to answer for it.
        if (isActorTarget) resolved = BSE.Helpers.capActorHit(target, resolved);
        return Math.max(1, resolved);
    };

    const _Game_Action_makeDamageValue_BSE = Game_Action.prototype.makeDamageValue;
    Game_Action.prototype.makeDamageValue = function(target, critical) {
        const value = _Game_Action_makeDamageValue_BSE.call(this, target, critical);
        // HP damage and HP drain only: healing, MP damage and every recovery
        // effect keep their full value.
        if (!this.checkDamageType([1, 5])) return value;
        let finalValue = value;
        if (value <= 0) {
            // InvisibleHand's own DEF/MDF boost (section 4c) can push a raw
            // formula to 0 or below against a much higher-level enemy, at
            // which point no tactic could ever land a hit at all - that is
            // "unwinnable", not "very hard". Guarantee a sliver of chip
            // damage from an actor's hit, scaled to the target's own max HP
            // so it stays meaningful against both a rat and a superboss.
            const subject = this.subject();
            if (subject && subject.isActor && subject.isActor() &&
                target && target.isEnemy && target.isEnemy()) {
                finalValue = Math.max(1, Math.round(target.mhp * BSE.Params.invisibleHandChipFloorPercent));
            } else {
                return value;
            }
        } else {
            // The bounded ability scores are read as ability scores here,
            // before anything that scales the result further (section 4b-bis).
            finalValue = BSE.Helpers.dndResolveDamage(this.subject(), target, this, finalValue);
            // The level gap, from the party's side (section 4b-ter): damped
            // against a monster above them, lifted against one they have
            // outgrown. A damped hit still lands - chip damage is the point,
            // zero is not.
            const factor = BSE.Helpers.levelDampingFactor(this.subject(), target, this, critical);
            if (factor !== 1) finalValue = Math.max(1, finalValue * factor);
            // And from the monster's side: one that outranks the party takes a
            // far bigger bite out of them, scaled again by how badly it is
            // outnumbered, so three party members taking three times the turns
            // is not an answer to a level gap; one they have outgrown scratches
            // instead. The per-hit ceiling inside dndResolveDamage has already
            // bounded the hit, so a lifted one is re-bounded here - otherwise
            // the ceiling would simply swallow the whole pressure term.
            const pressure = BSE.Helpers.levelPressureFactor(this.subject(), target);
            if (pressure > 1) {
                finalValue = BSE.Helpers.capActorHit(target, finalValue * pressure);
            } else if (pressure < 1) {
                finalValue = Math.max(1, finalValue * pressure);
            }
        }
        // One-shot protection: no single hit may deal more than a configurable
        // fraction of an enemy's max HP, so even the strongest attack cannot
        // kill an enemy outright from full or near-full health. This gives
        // every fight at least a couple of turns of meaningful interaction.
        if (BSE.Params.invisibleHandOneShotMaxPercent > 0 &&
            target && target.isEnemy && target.isEnemy()) {
            const maxPerHit = Math.max(1, Math.round(target.mhp * BSE.Params.invisibleHandOneShotMaxPercent));
            if (finalValue > maxPerHit) finalValue = maxPerHit;
        }

        // The two-handed grip is worth a point of the attacker's offensive
        // ability modifier, spent inside the contest in dndOffenseMod. It used
        // to be added here as a flat handful of damage, which a paced hit no
        // longer notices.

        return Math.round(finalValue);
    };

    // ==================================================================
    // D&D / PATHFINDER ABILITY MODIFIERS & BACKGROUND COMBAT SCALING
    // ==================================================================
    Game_BattlerBase.prototype.abilityMod = function(paramId) {
        return Math.floor((this.param(paramId) - 10) / 2);
    };

    Object.defineProperties(Game_BattlerBase.prototype, {
        strMod: { get() { return this.abilityMod(2); }, configurable: true }, // ATK -> STR
        conMod: { get() { return this.abilityMod(3); }, configurable: true }, // DEF -> CON
        intMod: { get() { return this.abilityMod(4); }, configurable: true }, // MAT -> INT
        wisMod: { get() { return this.abilityMod(5); }, configurable: true }, // MDF -> WIS
        dexMod: { get() { return this.abilityMod(6); }, configurable: true }, // AGI -> DEX
        psiMod: { get() { return this.abilityMod(7); }, configurable: true }  // LUK -> PSI
    });

    // Precision & Fortune: DEX and PSI increase Critical Rate (cri)
    const _criDesc = Object.getOwnPropertyDescriptor(Game_BattlerBase.prototype, "cri");
    const _origCri = _criDesc ? _criDesc.get : null;
    Object.defineProperty(Game_BattlerBase.prototype, "cri", {
        get: function() {
            const base = _origCri ? _origCri.call(this) : this.xparam(2);
            const dexBonus = Math.max(0, this.dexMod) * 0.01;   // +1% per DEX mod
            const psiBonus = Math.max(0, this.psiMod) * 0.015;  // +1.5% per PSI mod
            return Math.max(0, base + dexBonus + psiBonus);
        },
        configurable: true
    });

    // Fortitude: CON increases Critical Evasion (cev)
    const _cevDesc = Object.getOwnPropertyDescriptor(Game_BattlerBase.prototype, "cev");
    const _origCev = _cevDesc ? _cevDesc.get : null;
    Object.defineProperty(Game_BattlerBase.prototype, "cev", {
        get: function() {
            const base = _origCev ? _origCev.call(this) : this.xparam(3);
            const conBonus = Math.max(0, this.conMod) * 0.015;  // +1.5% crit evasion per CON mod
            return Math.max(0, base + conBonus);
        },
        configurable: true
    });

    // Critical Multiplier scaling: Base 2.0x + (Primary Mod * 0.05x)
    const _Game_Action_applyCritical_BSE = Game_Action.prototype.applyCritical;
    Game_Action.prototype.applyCritical = function(damage) {
        const subject = this.subject();
        if (!subject) return _Game_Action_applyCritical_BSE ? _Game_Action_applyCritical_BSE.call(this, damage) : damage * 2;
        const primeMod = Math.max(0, Math.max(subject.strMod || 0, subject.dexMod || 0, subject.intMod || 0));
        const multiplier = 2.0 + (primeMod * 0.05);
        return Math.round(damage * multiplier);
    };

    // ------------------------------------------------------------------
    // 4c. INVISIBLE HAND - AUTO-BALANCING ENEMY STATS
    //
    //   The world throws an enormous range of party/enemy level and headcount
    //   combinations at the same static Enemies.json entries, so a fight's
    //   real difficulty is decided live, at paramBase, instead of trusting
    //   whatever ATK/DEF/MAT/MDF a monster happened to be authored with. HP
    //   and MP are never touched: a boosted enemy survives a beating for
    //   longer because it hits harder and shrugs off more, not because it was
    //   handed extra health. AGI and LUK are left alone too, so turn order
    //   (see IndividualBattleTurns.js) and crit luck stay as authored.
    //
    //   Two multipliers stack per stat:
    //
    //   - Level gap: the enemy's <Level:X> against the party's own effective
    //     level (median level, nudged by how far its equipped gear runs
    //     ahead of a bare class curve; see ihGearLevelBonus). Flat at 1x up
    //     to the party's level, ramps to invisibleHandGraceMult by
    //     invisibleHandGraceEdge levels above it (the "hard but still
    //     winnable" edge), then accelerates past that edge so a much
    //     higher-level enemy hits far harder. ATK/MAT take the full curve;
    //     DEF/MDF only take invisibleHandGapDefenseCurve of it (plus the
    //     chip-damage floor in makeDamageValue above), so a high-level enemy
    //     is genuinely dangerous without turning into a wall no hit can ever
    //     get through - the fight stays winnable through tactics rather than
    //     becoming impossible outright. Comfortably below the party it eases
    //     toward invisibleHandUnderFloor instead of collapsing to nothing,
    //     so a low-level mob still fights back a little.
    //
    //   - Outnumbered enemy: when the party (summon excluded) still standing
    //     outnumbers the enemies still standing, the survivors get tougher,
    //     scaled by the ratio (2v1, 3v1, ...). This stacks with the lone
    //     enemy's extra actions from IndividualBattleTurns.js, so the
    //     offense side of the boost (invisibleHandOutnumberOffenseCurve) is
    //     kept gentler than the defense side - a solo enemy already swinging
    //     twice as often would also hit twice as hard otherwise. Recomputed
    //     live off current alive counts, so a 3v3 that whittles down to 3v1
    //     toughens its last survivor mid-fight. <Boss> enemies are exempt
    //     here (already tuned to be fought outnumbered, the same exemption
    //     IndividualBattleTurns.js gives them), but not from the level-gap
    //     multiplier above.
    //
    //   The party's own effective level is snapshotted once, when
    //   BattleManager.setup runs, so a mid-fight buff or a fallen ally never
    //   feeds back into how tough the enemy already is.
    // ------------------------------------------------------------------

    const IH_OFFENSE_PARAMS = [2, 4]; // ATK, MAT
    const IH_DEFENSE_PARAMS = [3, 5]; // DEF, MDF

    function ihIsBossEnemy(enemyData) {
        return !!(enemyData && enemyData.meta && enemyData.meta.Boss);
    }

    /**
     * How many effective levels an actor's equipped gear is worth, above or
     * below a bare class curve at the actor's current level. Sampled against
     * the actor's own growth rate over the last invisibleHandGearSpan
     * levels, so a flat-growth class and a steep one convert gear power to
     * levels fairly.
     */
    BSE.Helpers.ihGearLevelBonus = function(actor) {
        if (!actor || !actor.currentClass) return 0;
        const cls = actor.currentClass();
        if (!cls || !cls.params) return 0;
        const level = actor.level;
        const span = Math.max(1, BSE.Params.invisibleHandGearSpan);
        const lowLevel = Math.max(1, level - span);
        let gearPower = 0;
        let growth = 0;
        for (const id of IH_OFFENSE_PARAMS.concat(IH_DEFENSE_PARAMS)) {
            const bare = actor.paramBase(id);
            const full = bare + actor.paramPlus(id);
            gearPower += Math.max(0, full - bare);
            const table = cls.params[id];
            const lowBare = table ? (table[lowLevel] || 0) : bare;
            growth += Math.max(1, (bare - lowBare) / (level - lowLevel || 1));
        }
        if (growth <= 0) return 0;
        const levels = gearPower / growth;
        return Math.max(BSE.Params.invisibleHandGearFloor,
            Math.min(BSE.Params.invisibleHandGearCeiling, levels));
    };

    /**
     * The party's effective level for InvisibleHand purposes: median level
     * plus the average gear bonus, summon excluded.
     */
    BSE.Helpers.ihComputeEffectivePartyLevel = function() {
        const party = BSE.Helpers.realPartyMembers(false);
        if (!party.length) return 1;
        const median = BSE.Helpers.getMedianLevel(party);
        const gearTotal = party.reduce((sum, a) => sum + BSE.Helpers.ihGearLevelBonus(a), 0);
        return median + gearTotal / party.length;
    };

    /**
     * Max potential weapon damage from the party's equipped weapons.
     * Iterates each non-summon party member and computes the theoretical
     * maximum raw damage output (physical and magical) based on their
     * equipped weapon's ATK/MAT params combined with the actor's own
     * base ATK/MAT. Returns the single highest value found across the
     * party, used by the weapon-based defense adjustment below.
     */
    BSE.Helpers.ihMaxWeaponDamage = function() {
        const party = BSE.Helpers.realPartyMembers(false);
        if (!party.length) return 0;
        let maxDamage = 0;
        for (const actor of party) {
            if (!actor.isActor || !actor.isActor()) continue;
            const weapons = actor.weapons();
            if (!weapons || !weapons.length) continue;
            for (const weapon of weapons) {
                if (!weapon) continue;
                // weapon params[2] = ATK bonus, params[4] = MAT bonus
                const weaponAtk = weapon.params[2] || 0;
                const weaponMat = weapon.params[4] || 0;
                // Actor's own ATK/MAT contribution without the weapon bonus
                const actorBaseAtk = actor.paramBase(2);
                const actorBaseMat = actor.paramBase(4);
                // Total effective attack power
                const totalAtk = Math.max(0, actorBaseAtk + weaponAtk);
                const totalMat = Math.max(0, actorBaseMat + weaponMat);
                // RPG Maker MZ base attack formula: a.atk * 4 - b.def * 2
                // The raw offensive contribution is atk * 4
                const physDmg = totalAtk * 4;
                const magDmg = totalMat * 4;
                maxDamage = Math.max(maxDamage, physDmg, magDmg);
            }
        }
        return maxDamage;
    };

    /**
     * Defense multiplier derived from the party's max weapon-damage potential.
     * When the party's weapons are strong enough to exceed the baseline
     * threshold, enemy DEF/MDF are scaled upward so the fight does not
     * become trivially easy. When weapon damage is below the threshold,
     * no adjustment is made (multiplier of 1).
     */
    BSE.Helpers.ihWeaponDamageDefenseMultiplier = function(enemy) {
        if (!BSE.Params.invisibleHandWeaponDefenseEnabled) return 1;
        if (!$gameParty || !$gameParty.inBattle() || !$gameTroop) return 1;

        // Dynamic Defense is active ONLY when the enemy is outnumbered (e.g. 3v1, 2v1, 3v2)
        const aliveParty = BSE.Helpers.realPartyMembers(true).length;
        const aliveEnemies = $gameTroop.aliveMembers().length;
        if (aliveEnemies <= 0 || aliveParty <= aliveEnemies) return 1;
        if (enemy && enemy.enemy && ihIsBossEnemy(enemy.enemy())) return 1;

        const maxWeaponDmg = BSE.Helpers.ihMaxWeaponDamage();
        if (maxWeaponDmg <= 0) return 1;
        const threshold = Math.max(1, BSE.Params.invisibleHandWeaponDefenseThreshold);
        if (maxWeaponDmg <= threshold) return 1;
        const excess = maxWeaponDmg - threshold;
        const mult = 1 + (excess / threshold) * BSE.Params.invisibleHandWeaponDefenseScale;
        return Math.max(BSE.Params.invisibleHandWeaponDefenseFloor,
            Math.min(BSE.Params.invisibleHandWeaponDefenseCeiling, mult));
    };

    /**
     * Stat multiplier from the level gap alone. gap > 0 means the enemy
     * outranks the party. Defense (DEF/MDF) grows slower than offense above
     * parity: a full-strength DEF/MDF wall can push a formula's damage to 0
     * or below outright, at which point no tactic can ever land a hit at
     * all - that reads as "unwinnable", not "very hard". Offense keeps the
     * full curve, so a much higher-level enemy still hits like a truck.
     */
    /**
     * Stat multiplier from the level gap alone.
     * 1v1 at same level is balanced (mult = 1).
     * Gap of 1-4 levels provides gentle challenge.
     * Gap of 5-6+ levels rapidly scales up health so fighting high-level enemies is much harder.
     */
    BSE.Helpers.ihLevelGapMultiplier = function(enemyLevel, partyLevel) {
        if (!enemyLevel || enemyLevel <= 0 || !partyLevel || partyLevel <= 0) return 1;
        const gap = enemyLevel - partyLevel;
        if (gap <= 0) {
            return Math.max(0.75, 1 + gap * 0.02);
        }
        if (gap <= 4) {
            return 1 + gap * 0.05;
        }
        // At gap >= 5, enemy becomes substantially tougher
        const over = gap - 4;
        return 1.20 + 0.15 * Math.pow(over, 1.4);
    };

    /**
     * Stat multiplier from being outnumbered.
     * ONLY applies to enemy Defense (DEF/MDF) when the party outnumbers what is left standing.
     * For 1v1, 2v2, 3v3 (equal or party outnumbered), returns 1.
     * For 3v1 (party outnumbers single foe), scales defense so the lone foe can sustain attacks and take actions.
     */
    BSE.Helpers.ihOutnumberMultiplier = function(enemy) {
        if (!enemy) return 1;
        const aliveParty = BSE.Helpers.realPartyMembers(true).length;
        const aliveEnemies = $gameTroop.aliveMembers().length;
        if (aliveEnemies <= 0 || aliveParty <= aliveEnemies) return 1;
        if (enemy.enemy && ihIsBossEnemy(enemy.enemy())) return 1;
        const ratio = aliveParty / aliveEnemies;
        const factor = BSE.Params.invisibleHandOutnumberFactor || 0.50;
        return 1 + (ratio - 1) * factor;
    };

    /**
     * Invisible Hand: Modulates ONLY enemy physical and magical defense (DEF: paramId 3, MDF: paramId 5)
     * when the enemy is outnumbered, giving solo/outnumbered enemies the durability to take actions before dying.
     * HP (param 0), MP (param 1), ATK (param 2), MAT (param 4), AGI (param 6), and LUK (param 7) remain untouched.
     */
    BSE.Helpers.ihEnemyParamMultiplier = function(enemy, paramId) {
        if (!BSE.Params.invisibleHandEnabled) return 1;
        // Strictly only modulates physical defense (3) and magical defense (5)
        if (paramId !== 3 && paramId !== 5) return 1;
        if (!$gameParty || !$gameParty.inBattle() || !$gameTroop) return 1;
        if (!$gameTroop.members().includes(enemy)) return 1;

        // Dynamic Defense is active ONLY when the enemy is outnumbered
        const aliveParty = BSE.Helpers.realPartyMembers(true).length;
        const aliveEnemies = $gameTroop.aliveMembers().length;
        if (aliveEnemies <= 0 || aliveParty <= aliveEnemies) return 1;
        if (enemy && enemy.enemy && ihIsBossEnemy(enemy.enemy())) return 1;

        let mult = 1;

        // 1. Dynamic Defense based on party weapon damage when outnumbered
        if (BSE.Params.invisibleHandWeaponDefenseEnabled) {
            mult *= BSE.Helpers.ihWeaponDamageDefenseMultiplier(enemy);
        }

        // 2. Outnumber defense scaling
        if (BSE.Params.invisibleHandOutnumberEnabled) {
            mult *= BSE.Helpers.ihOutnumberMultiplier(enemy);
        }

        // 3. Level-gap defense scaling (gentle curve so high-level outnumbered enemies hold up against high-level parties)
        if (BSE.Params.invisibleHandLevelGapEnabled) {
            if (BSE.State.ihPartyLevel === null || BSE.State.ihPartyLevel === undefined) {
                BSE.State.ihPartyLevel = BSE.Helpers.ihComputeEffectivePartyLevel();
            }
            const enemyLevel = BSE.Helpers.getBattlerLevel(enemy);
            const levelMult = BSE.Helpers.ihLevelGapMultiplier(enemyLevel, BSE.State.ihPartyLevel);
            if (levelMult > 1) {
                const gapCurve = BSE.Params.invisibleHandGapDefenseCurve || 0.50;
                mult *= 1 + (levelMult - 1) * gapCurve;
            }
        }

        return Math.max(BSE.Params.invisibleHandStatFloor, Math.min(BSE.Params.invisibleHandStatCeiling, mult));
    };

    // Chains onto whatever paramBase currently is (e.g. GameOptions.js's own
    // enemy difficulty slider hook), so the two multipliers simply compose
    // regardless of plugin load order.
    const _Game_Enemy_paramBase_ih = Game_Enemy.prototype.paramBase;
    Game_Enemy.prototype.paramBase = function(paramId) {
        const base = _Game_Enemy_paramBase_ih.call(this, paramId);
        const mult = BSE.Helpers.ihEnemyParamMultiplier(this, paramId);
        if (mult === 1) return base;
        return Math.round(base * mult);
    };

    /**
     * Is this overlay actually on screen?
     *
     * Most of the panels below are not built on demand and thrown away: the
     * HTML message box and its choice list are created with the map's windows
     * (DialogueSystem) and then stay in the DOM for the whole scene, merely
     * hidden between lines. Asking whether the ELEMENT EXISTS therefore
     * answers yes the entire time the party is walking around, which is what
     * silently killed every fight: walking into a monster, the startBattle
     * plugin command and BattleManager.setup itself all read the answer as
     * "a menu is open". Only an overlay that is actually displayed blocks a
     * battle.
     */
    BSE.Helpers.isOverlayShown = function(id) {
        if (typeof document === "undefined") return false;
        const el = document.getElementById(id);
        if (!el) return false;
        const style = (typeof window !== "undefined" && window.getComputedStyle)
            ? window.getComputedStyle(el) : el.style;
        if (!style) return true;
        return style.display !== "none" && style.visibility !== "hidden";
    };

    /**
     * Returns true if any game state prohibits initiating a battle:
     * - Player is sleeping or waiting (sleep/wait menu open, active sleep/wait sequence, cryo sequence)
     * - World map is open (fullscreen map overlay)
     * - Fast travel map is open
     * - Talking to NPCs (active message window, NPC empathize / dialogue overlays)
     */
    const _computeBattleInitiationBlocked = function() {
        if ($gameParty && typeof $gameParty.inBattle === "function" && $gameParty.inBattle()) return false;
        const scene = SceneManager._scene;

        // 1. Sleeping or waiting
        if (typeof $gameTemp !== "undefined" && $gameTemp && $gameTemp._sleepMenuOpen) return true;
        if (scene) {
            if (scene._sleepSequenceState && scene._sleepSequenceState > 0) return true;
            if (scene._sleepAdvance != null) return true;
            if (scene._cryoSequenceState && scene._cryoSequenceState > 0) return true;
            if (scene._workSequenceActive === true) return true;
            if (scene._sleepMenuEl != null) return true;
            if (scene._cryoOverlayEl != null) return true;
        }
        if (typeof document !== "undefined") {
            if (BSE.Helpers.isOverlayShown("sleep-menu-overlay")) return true;
            if (BSE.Helpers.isOverlayShown("cryo-overlay")) return true;
        }

        // 2. Map is opened (fullscreen map)
        if (typeof window.isWorldMapFullscreen === "function" && window.isWorldMapFullscreen()) return true;
        if (typeof document !== "undefined") {
            if (BSE.Helpers.isOverlayShown("world-map-ui-overlay")) return true;
            if (BSE.Helpers.isOverlayShown("map-viewer-overlay")) return true;
        }

        // 3. Fast travel map is opened
        if (typeof $gameSystem !== "undefined" && $gameSystem && typeof $gameSystem.getFastTravelData === "function") {
            const ftData = $gameSystem.getFastTravelData();
            if (ftData && ftData.isActive) return true;
        }
        if (typeof document !== "undefined") {
            if (BSE.Helpers.isOverlayShown("fast-travel-ui-overlay")) return true;
            if (BSE.Helpers.isOverlayShown("travel-ui-overlay")) return true;
            if (BSE.Helpers.isOverlayShown("travel-screen")) return true;
        }

        // Waiting fast-forward on map: combat is suppressed while time is speeding by
        if (typeof $gameTemp !== "undefined" && $gameTemp && $gameTemp._isWaitingFastForward) {
            return true;
        }

        // 4. Talking to other NPCs
        if (typeof $gameMessage !== "undefined" && $gameMessage && typeof $gameMessage.isBusy === "function" && $gameMessage.isBusy()) {
            return true;
        }
        if (scene && typeof scene.isMessageWindowActive === "function" && scene.isMessageWindowActive()) {
            return true;
        }
        if (scene && scene._messageWindow && typeof scene._messageWindow.isOpen === "function" && (scene._messageWindow.isOpen() || scene._messageWindow.isOpening())) {
            return true;
        }
        if (window.NPCEmpathize && window.NPCEmpathize.Scene_NPCEmpathize && scene instanceof window.NPCEmpathize.Scene_NPCEmpathize) {
            return true;
        }
        if (typeof document !== "undefined") {
            if (BSE.Helpers.isOverlayShown("html-msg-overlay")) return true;
            if (BSE.Helpers.isOverlayShown("html-choice-overlay")) return true;
            if (BSE.Helpers.isOverlayShown("npc-dialogue-overlay")) return true;
            if (BSE.Helpers.isOverlayShown("npc-empathize-overlay")) return true;
            if (BSE.Helpers.isOverlayShown("npc-conversation-overlay")) return true;
            if (BSE.Helpers.isOverlayShown("empathize-dialog-overlay")) return true;
        }

        return false;
    };

    // The answer is asked for every frame the party walks (Scene_Map's own
    // encounter tick) and reading a computed style is a layout question, so it
    // is worked out once per frame and handed back to everyone else who asks
    // in that frame.
    let _blockedFrame = -1;
    let _blockedValue = false;
    BSE.Functions.isBattleInitiationBlocked = function() {
        const frame = (typeof Graphics !== "undefined" && Graphics.frameCount) || 0;
        if (frame !== _blockedFrame) {
            _blockedFrame = frame;
            _blockedValue = _computeBattleInitiationBlocked();
        }
        return _blockedValue;
    };
    window.isBattleInitiationBlocked = BSE.Functions.isBattleInitiationBlocked;

    // Clear the cached party level at the start of every battle so the next
    // paramBase call recomputes it fresh instead of reusing the last fight's.
    const _BattleManager_setup_ih = BattleManager.setup;
    BattleManager.setup = function(troopId, canEscape, canLose) {
        if (BSE.Functions.isBattleInitiationBlocked && BSE.Functions.isBattleInitiationBlocked()) {
            return;
        }
        BSE.State.ihPartyLevel = null;
        _BattleManager_setup_ih.call(this, troopId, canEscape, canLose);
    };

    const _Scene_Map_updateEncounter_BSE = Scene_Map.prototype.updateEncounter;
    Scene_Map.prototype.updateEncounter = function() {
        if (BSE.Functions.isBattleInitiationBlocked && BSE.Functions.isBattleInitiationBlocked()) {
            return;
        }
        _Scene_Map_updateEncounter_BSE.call(this);
    };

    // Nothing wraps Game_Player.executeEncounter here: section 18 below replaces it with a
    // no-op outright, so any override placed at this point would only be discarded. The
    // block check that matters is the one on updateEncounter just above.

    // ------------------------------------------------------------------
    // 5. i18n
    //   Banks live in js/i18n/<lang>/plugins/Battle.json. T.pool takes the
    //   translated array whole, so a shorter one never mixes in English.
    // ------------------------------------------------------------------
    BSE.Helpers.bi18nList = function(path) {
        const key = 'Battle.' + path;
        return T.has(key) ? T.pool(key) : null;
    };

    // ------------------------------------------------------------------
    // 5b. Stat requirements  ,  window.SkillStatReq
    //   Every real skill carries `<StatReq: STAT N>`, written by
    //   tools/skills/gen_stat_requirements.js: the floor a battler's BASE stat
    //   has to reach for the skill to come out at full strength. N runs 3..20,
    //   which is the range a base parameter actually moves through (a class
    //   opens between 8 and 16 and creeps to between 10 and 20 by level 99),
    //   so the school's own class clears its middle ladder and its ultimates
    //   are the end of somebody's road.
    //
    //   What counts towards it is deliberately narrow: the class curve, the
    //   points spent at character creation and by traits, and any augment or
    //   grafted body part fitted in the body. A weapon does not lend the arm
    //   that swings it the wit to cast, and a buff that lasts three turns is
    //   not learning, so equipment, states, buffs and disease modifiers are all
    //   left out. This is why a sheet reading INT 20 can still fall under an
    //   INT 13 floor: most of that 20 is worn, not held.
    //
    //   Nothing is barred by this: a skill can always be learned, carried and
    //   used. Under the floor it simply starts to slip, and
    //   BattleSystemEnhancedMechanics rolls the fumble.
    // ------------------------------------------------------------------
    const STAT_REQ_PARAM = { STR: 2, CON: 3, INT: 4, WIS: 5, DEX: 6, PSI: 7 };
    // One point short is a stumble, ten is a spell being read out of a book in
    // a language the reader does not have. Each missing point multiplies what
    // is left of the caster's grip on it, and the worst case still leaves a
    // quarter of the casts standing.
    const STAT_REQ_SLIP = 0.93;
    const STAT_REQ_CAP = 0.75;
    const statReqCache = new Map();

    window.SkillStatReq = {
        MAX_FAIL: STAT_REQ_CAP,

        // { stat, paramId, points } for a skill, or null when it carries no tag.
        of(skill) {
            if (!skill || skill.id === undefined) return null;
            if (statReqCache.has(skill.id)) return statReqCache.get(skill.id);
            let out = null;
            const m = /<StatReq:\s*([A-Za-z]+)\s+(\d+)\s*>/i.exec(skill.note || '');
            if (m) {
                const stat = m[1].toUpperCase();
                if (STAT_REQ_PARAM[stat] !== undefined) {
                    out = { stat: stat, paramId: STAT_REQ_PARAM[stat], points: Number(m[2]) };
                }
            }
            statReqCache.set(skill.id, out);
            return out;
        },

        // The localized three-letter name of a stat, the same one the sheet and
        // the equip screen print (js/i18n/<lang>/stats.json).
        statName(stat) {
            return (window.CCStatLabel ? window.CCStatLabel(stat) : null) || stat;
        },

        // What the battler brings to the requirement. Game_Actor.paramPlus adds
        // worn equipment on top, so Game_Battler's is called directly: what is
        // left is the permanent record (character creation, traits, the event
        // command "Change Parameter") plus whatever is bolted into the body.
        baseStat(battler, paramId) {
            if (!battler) return 0;
            let value = battler.paramBase ? battler.paramBase(paramId) : 0;
            if (Game_Battler.prototype.paramPlus) {
                value += Game_Battler.prototype.paramPlus.call(battler, paramId) || 0;
            }
            // Both halves of what surgery leaves behind: the augments bolted in
            // (Health_ProstheticShop keeps them in _prostheticEffects) and the
            // body parts grafted on (_bodyPartStatEffects). Game_Actor.param
            // adds both, and so does the floor: a limb that raises the sheet
            // raises what the caster brings to a spell.
            const augments = battler._prostheticEffects;
            if (augments && augments[paramId]) value += augments[paramId];
            const grafts = battler._bodyPartStatEffects;
            if (grafts && grafts[paramId]) value += grafts[paramId];
            return Math.floor(Math.max(0, value));
        },

        // How the battler stands against one skill, or null when the skill asks
        // for nothing or the battler is not on this scale (creatures are not:
        // their parameters are written in the hundreds).
        check(battler, skill) {
            const req = this.of(skill);
            if (!req || !battler || !battler.isActor || !battler.isActor()) return null;
            const have = this.baseStat(battler, req.paramId);
            const short = Math.max(0, req.points - have);
            return {
                stat: req.stat,
                paramId: req.paramId,
                points: req.points,
                have: have,
                short: short,
                met: short === 0,
                failChance: short ? Math.min(STAT_REQ_CAP, 1 - Math.pow(STAT_REQ_SLIP, short)) : 0
            };
        },

        meets(battler, skill) {
            const c = this.check(battler, skill);
            return !c || c.met;
        },

        failChance(battler, skill) {
            const c = this.check(battler, skill);
            return c ? c.failChance : 0;
        },

        // "INT 14", ready to print anywhere.
        label(skill) {
            const req = this.of(skill);
            return req ? this.statName(req.stat) + ' ' + req.points : '';
        },

        // "INT 8/14", the floor AND what this battler actually holds. Every
        // chip that flags a shortfall prints this rather than the bare floor:
        // a reader looking at a sheet that says INT 20 has no way of guessing
        // that only the base 8 of it counts, so the chip says the number the
        // check is really made against.
        standingLabel(battler, skill) {
            const c = this.check(battler, skill);
            if (!c) return this.label(skill);
            return this.statName(c.stat) + ' ' + c.have + '/' + c.points;
        }
    };

    // ------------------------------------------------------------------
    // 6. DataManager, Load Enemy Char Sprites
    // ------------------------------------------------------------------
    const _DataManager_isDatabaseLoaded = DataManager.isDatabaseLoaded;
    DataManager.isDatabaseLoaded = function() {
        if (!_DataManager_isDatabaseLoaded.call(this)) return false;
        if (!this._enemyCharSpritesLoaded) {
            this.loadEnemyCharSprites($dataEnemies);
            this._enemyCharSpritesLoaded = true;
        }
        return true;
    };

    DataManager.loadEnemyCharSprites = function(data) {
        const sprites = BSE.Data._enemyCharSprites;
        for (let i = 1; i < data.length; i++) {
            const enemy = data[i];
            if (enemy && enemy.note) {
                const charMatch = enemy.note.match(/<Char:(.+?)>/i);
                if (charMatch) {
                    sprites[i] = charMatch[1];
                }
            }
        }
    };

    // ------------------------------------------------------------------
    // 7. startPersistentBattle (shared core function)
    // ------------------------------------------------------------------
    BSE.Functions.startPersistentBattle = function(troopId, persistentId, eventId, mapId) {
        if (BSE.Functions.isBattleInitiationBlocked && BSE.Functions.isBattleInitiationBlocked()) return;
        const pData = BSE.State.persistentEnemyData;
        if (!pData[persistentId]) {
            pData[persistentId] = { troopId: troopId, enemyHp: {} };
        }
        if ($gameSystem.getBattleCooldown() > 0) return;

        // Tactical map battle (MapBattleMode.js): fights play out on the live
        // map instead of pushing Scene_Battle. Presentation-only redirect -
        // MapBattleMode still calls BattleManager.setup itself and reuses all
        // of the win/lose/flee/recruit rules below untouched.
        if (window.isMapBattleMode && window.isMapBattleMode() && window.MapBattleMode) {
            window.MapBattleMode.begin(troopId, persistentId, eventId, mapId);
            return;
        }

        $gameMessage._eventActivator = $gameMessage._eventActivator || window._battleActivatorOverride || "p1";
        window._battleActivatorOverride = null;

        $gameSystem._p1PreBattlePos = {
            mapId: $gameMap.mapId(),
            x: $gamePlayer.x,
            y: $gamePlayer.y,
            d: $gamePlayer.direction()
        };
        if (window.$gameSplitScreen && window.$gameSplitScreen.active && window.$gameSplitScreen.p2Event) {
            const p2 = window.$gameSplitScreen.p2Event;
            $gameSystem._p2PreBattlePos = {
                mapId: $gameMap.mapId(),
                x: p2.x, y: p2.y, d: p2.direction()
            };
        } else {
            $gameSystem._p2PreBattlePos = null;
        }

        BSE.State.currentBattleEventId = persistentId;
        BSE.State.currentEventId = eventId;
        BSE.State.currentMapId = mapId;
        BSE.State.needsRespawn = false;

        // The monsters standing nearby pile in (see section 5b of the encounters
        // module). The battle is then set up against a combined troop, and the
        // joiners' map events are remembered so the state module can clear them
        // on a win and hand their HP back on a flee.
        let setupTroopId = troopId;
        BSE.State.reinforcement = null;
        if (BSE.Functions.getJoiningEnemyEvents && $gameMap.mapId() === mapId) {
            const joiners = BSE.Functions.getJoiningEnemyEvents(eventId);
            if (joiners.length) {
                const built = BSE.Functions.buildReinforcedTroop(troopId, joiners, mapId);
                if (built.joined.length) {
                    setupTroopId = built.troopId;
                    BSE.State.reinforcement = {
                        troopId: built.troopId,
                        baseSize: $dataTroops[troopId].members.length,
                        joined: built.joined
                    };
                }
            }
        }

        BattleManager.setup(setupTroopId, false, false);
        SceneManager.push(Scene_Battle);
    };

    // ------------------------------------------------------------------
    // 8. PLUGIN COMMAND REGISTRATIONS (forwarding pattern)
    // ------------------------------------------------------------------

    PluginManager.registerCommand(pluginName, "startBattle", function(args) {
        if ($gamePlayer.isInVehicle()) return;
        if ($gameSystem.getBattleCooldown() > 0) return;
        if (BSE.Functions.isBattleInitiationBlocked && BSE.Functions.isBattleInitiationBlocked()) return;
        $gameSwitches.setValue(115, true);

        const eventId = Number(args.eventId) || this._eventId;
        const event = $gameMap.event(eventId);
        if (event && event._fixedTroopId > 0) {
            const persistentId = `${$gameMap.mapId()}_${eventId}`;
            BSE.Functions.startPersistentBattle(
                event._fixedTroopId, persistentId, eventId, $gameMap.mapId()
            );
        }
    });

    PluginManager.registerCommand(pluginName, "setRespawnPoint", function(args) {
        $gameVariables.setValue(BSE.Params.respawnMapVar, Number(args.mapId));
        $gameVariables.setValue(BSE.Params.respawnXVar, Number(args.x));
        $gameVariables.setValue(BSE.Params.respawnYVar, Number(args.y));
        // An authored map id and tile: no procedural square to put back, and
        // any wild camp the party had set is no longer where they wake up.
        $gameSystem._respawnProcSurface = null;
        $gameSystem._respawnPointSet = true;
    });

    PluginManager.registerCommand(pluginName, "restore", function(args) {
        if (BSE.Functions.executeRestoreCommand) {
            BSE.Functions.executeRestoreCommand();
        }
    });

    PluginManager.registerCommand(pluginName, "damageActor", function(args) {
        if (BSE.Functions.executeDamageActor) {
            BSE.Functions.executeDamageActor(args);
        }
    });

    // A petrodemon is generated per fight rather than picked out of the
    // database (see section 17 of the encounters module).
    PluginManager.registerCommand(pluginName, "startPetrodemonBattle", function(args) {
        if (!BSE.Functions.startPetrodemonBattle) return;
        BSE.Functions.startPetrodemonBattle(args && args.difficulty);
    });

    PluginManager.registerCommand(pluginName, "fightRandomPetrodemon", function(args) {
        if (!BSE.Functions.startPetrodemonBattle) return;
        const tiers = BSE.Data.PETRO_DIFFICULTIES || ['normal'];
        BSE.Functions.startPetrodemonBattle(tiers[Math.floor(Math.random() * tiers.length)]);
    });

    // ------------------------------------------------------------------
    // 9. Data Save/Load Handling
    // ------------------------------------------------------------------
    const _DataManager_extractSaveContents = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function(contents) {
        _DataManager_extractSaveContents.call(this, contents);
        const pData = BSE.State.persistentEnemyData;
        if (contents.persistentEnemyData) {
            Object.assign(pData, contents.persistentEnemyData);
        }
        if (contents.enemyCharSprites) {
            Object.assign(BSE.Data._enemyCharSprites, contents.enemyCharSprites);
        }
    };

    const _DataManager_makeSaveContents = DataManager.makeSaveContents;
    DataManager.makeSaveContents = function() {
        const contents = _DataManager_makeSaveContents.call(this);
        contents.persistentEnemyData = BSE.State.persistentEnemyData;
        contents.enemyCharSprites = BSE.Data._enemyCharSprites;
        return contents;
    };

    // ------------------------------------------------------------------
    // 10. DataManager.setupNewGame
    // ------------------------------------------------------------------
    const _DataManager_setupNewGame = DataManager.setupNewGame;
    DataManager.setupNewGame = function() {
        _DataManager_setupNewGame.call(this);
        $gameVariables.setValue(BSE.Params.respawnMapVar, 708);
        $gameVariables.setValue(BSE.Params.respawnXVar, 24);
        $gameVariables.setValue(BSE.Params.respawnYVar, 12);
        $gameVariables.setValue(BSE.Params.respawnCountryIDVar, 121);
    };

    // ------------------------------------------------------------------
    // 11. Sprite_Character – Apply Enemy Hue & Flash
    // ------------------------------------------------------------------
    (function() {
        const _SC_update = Sprite_Character.prototype.update;
        Sprite_Character.prototype.update = function() {
            _SC_update.call(this);
            if (this._flashDuration > 0) {
                this._flashDuration--;
                if (this._flashDuration === 0) {
                    this.setBlendColor([0, 0, 0, 0]);
                }
            }
            const char = this._character;
            const hue = char && char._characterHue;
            if (hue) {
                if (!this._hueFilter) {
                    this._hueFilter = new PIXI.filters.ColorMatrixFilter();
                    // Appended, never assigned: something else may already be
                    // filtering this sprite (a map battle draws the monsters
                    // standing out of the fight in black and white) and a bare
                    // assignment would throw that away without a word.
                    this.filters = (this.filters || []).concat(this._hueFilter);
                    this._appliedHue = null;
                }
                // Rebuilding the ColorMatrix every frame is wasteful when the hue
                // hasn't changed; only recompute when it actually differs.
                if (this._appliedHue !== hue) {
                    this._hueFilter.reset();
                    this._hueFilter.hue(hue, false);
                    this._appliedHue = hue;
                }
            } else if (this._hueFilter) {
                this.filters = null;
                this._hueFilter = null;
                this._appliedHue = null;
            }
        };
    })();

    // ------------------------------------------------------------------
    // 12. Scene_Map – stopAudioOnBattleStart
    // ------------------------------------------------------------------
    const _Scene_Map_stopAudio = Scene_Map.prototype.stopAudioOnBattleStart;
    Scene_Map.prototype.stopAudioOnBattleStart = function() {
        if ($gameSystem && typeof $gameSystem.battleBgm === 'function') {
            // Resolve first: the selection may be the Random sentinel, which is
            // no more a bgm file name than __none__ or __map__ are.
            const mss = window.MusicSelectionSystem;
            const sel = (mss && mss.resolveBattleBgmName)
                ? mss.resolveBattleBgmName()
                : ConfigManager.battleMusicName;
            $gameSystem._battleBgm = {
                name: sel || 'RandomMind/Battle',
                volume: 90, pitch: 100, pan: 0
            };
        }
        _Scene_Map_stopAudio.call(this);
    };

    // ------------------------------------------------------------------
    // 13. Corpse Interaction
    // ------------------------------------------------------------------
    // A body is a thing lying on the ground, not a wall: the party steps over it
    // wherever the ground itself allows, and searching it is what standing on it
    // does (checkEventTriggerHere below). Nothing here touches passability, so a
    // corpse on a passable tile is walked onto and one on a wall was never
    // reachable to begin with.
    BSE.Helpers.corpseAt = function(x, y) {
        if (!$gameMap || !BSE.State.mapCorpses) return null;
        const mapId = $gameMap.mapId();
        return BSE.State.mapCorpses.find(c => c && c.mapId === mapId && c.x === x && c.y === y) || null;
    };

    const _Game_Player_checkTriggerHere = Game_Player.prototype.checkEventTriggerHere;
    Game_Player.prototype.checkEventTriggerHere = function(triggers) {
        _Game_Player_checkTriggerHere.call(this, triggers);
        if (!triggers.includes(0)) return;
        if ($gameMap.isEventRunning() || SceneManager.isSceneChanging()) return;
        // A map battle keeps Scene_Map alive: pushing the harvest scene there
        // leaves a stale, unprepared scene on the stack.
        if ($gameParty.inBattle()) return;
        const corpses = BSE.State.mapCorpses.filter(c => c.mapId === $gameMap.mapId());
        const corpse = corpses.find(c => c.x === this.x && c.y === this.y);
        if (corpse && typeof Scene_BodyPartHarvest !== 'undefined') {
            SceneManager.push(Scene_BodyPartHarvest);
            SceneManager.prepareNextScene(corpse);
        }
    };

    const _Game_Player_checkTriggerThere = Game_Player.prototype.checkEventTriggerThere;
    Game_Player.prototype.checkEventTriggerThere = function(triggers) {
        _Game_Player_checkTriggerThere.call(this, triggers);
        if (!triggers.includes(0)) return;
        if ($gameMap.isEventRunning() || SceneManager.isSceneChanging()) return;
        // A map battle keeps Scene_Map alive: pushing the harvest scene there
        // leaves a stale, unprepared scene on the stack.
        if ($gameParty.inBattle()) return;
        const corpses = BSE.State.mapCorpses.filter(c => c.mapId === $gameMap.mapId());
        if (corpses.find(c => c.x === this.x && c.y === this.y)) return;
        const x2 = $gameMap.roundXWithDirection(this.x, this.direction());
        const y2 = $gameMap.roundYWithDirection(this.y, this.direction());
        const corpse = corpses.find(c => c.x === x2 && c.y === y2);
        if (corpse && typeof Scene_BodyPartHarvest !== 'undefined') {
            SceneManager.push(Scene_BodyPartHarvest);
            SceneManager.prepareNextScene(corpse);
        }
    };

    // ------------------------------------------------------------------
    // 14. window.BSE export
    // ------------------------------------------------------------------
    window.BSE = {
        get mapCorpses()      { return BSE.State.mapCorpses; },
        get enemyPartDamage() { return BSE.State.enemyPartDamage; }
    };

    // ------------------------------------------------------------------
    // 15. Party Command Restriction (split-screen)
    // ------------------------------------------------------------------
    const _Window_PartyCommand_process = Window_PartyCommand.prototype.processHandling;
    Window_PartyCommand.prototype.processHandling = function() {
        if (window.$gameSplitScreen && window.$gameSplitScreen.active && $gameMessage._eventActivator) {
            if ($gameMessage._eventActivator === "p2") {
                this.processP2Handling();
                return;
            }
        }
        _Window_PartyCommand_process.call(this);
    };

    // ------------------------------------------------------------------
    // 15b. WHICH MONSTER A SINGLE-TARGET ACTION HITS
    //
    //   A fight is rarely one on one any more (see section 7: the monsters
    //   standing nearby pile in), so an attack, a skill or an item aimed at one
    //   enemy asks the player which one it lands on. A lone monster is the only
    //   thing on the field that can be hit, so it is targeted without a prompt
    //   and the turn goes straight through: the player is never made to confirm
    //   a choice they do not have.
    // ------------------------------------------------------------------
    const _Scene_Battle_startEnemySelection_BSE = Scene_Battle.prototype.startEnemySelection;
    Scene_Battle.prototype.startEnemySelection = function() {
        const alive = $gameTroop.aliveMembers();
        if (alive.length === 1) {
            const action = BattleManager.inputtingAction();
            // The troop index, not the position in the living: a dead monster
            // still holds its slot in $gameTroop.members().
            if (action) action.setTarget(alive[0].index());
            // The command list doubles as the target picker
            // (BattleSystemEnhanchedCommands.js); it has nothing to pick.
            if (this._actorCommandWindow) this._actorCommandWindow._targetSession = null;
            this.hideSubInputWindows();
            this.selectNextCommand();
            return;
        }
        _Scene_Battle_startEnemySelection_BSE.call(this);
    };

    // The same courtesy on the party's own side: an item or a skill aimed at a
    // single ally with only one ally it can land on (a lone survivor, or the
    // one fallen member a revive can reach) is used straight away instead of
    // opening a picker with a single row in it.
    const _Scene_Battle_startActorSelection_BSE = Scene_Battle.prototype.startActorSelection;
    Scene_Battle.prototype.startActorSelection = function() {
        const action = BattleManager.inputtingAction();
        if (action && !action.isForAll() && !action.isForRandom()) {
            // Game_Party.members() is battleMembers() in battle, which is what
            // an action's target index is read against.
            const members = $gameParty.battleMembers();
            const targets = action.isForDeadFriend()
                ? members.filter(m => m.isDead())
                : members.filter(m => m.isAlive());
            if (targets.length === 1) {
                action.setTarget(members.indexOf(targets[0]));
                if (this._actorCommandWindow) this._actorCommandWindow._targetSession = null;
                this.hideSubInputWindows();
                this.selectNextCommand();
                return;
            }
        }
        _Scene_Battle_startActorSelection_BSE.call(this);
    };

    // ------------------------------------------------------------------
    // 15c. A KILLED MONSTER LEAVES THE FIELD
    //
    //   The collapse effect is requested by the battle log as it reads out the
    //   killing blow, so a death that happens away from an action's result (slip
    //   damage at the end of a turn, a passive, a wound to a vital organ) never
    //   asks for one and the body stands there. Nobody saw that while a fight
    //   ended on its only monster's death; with the rest of the pack still
    //   swinging (section 7) it is on screen for the rest of the battle.
    //   Catch those deaths here, once the log has finished with the battler so
    //   its own collapse is never doubled up.
    // ------------------------------------------------------------------
    const _Sprite_Enemy_update_BSE = Sprite_Enemy.prototype.update;
    Sprite_Enemy.prototype.update = function() {
        _Sprite_Enemy_update_BSE.call(this);
        const enemy = this._enemy;
        // _appeared is still true only while nothing has taken the body away.
        if (!enemy || !this._appeared || !enemy.isDead() || this.isEffecting()) return;
        if (enemy.isEffectRequested()) return;
        const log = SceneManager._scene && SceneManager._scene._logWindow;
        if (log && log.isBusy && log.isBusy()) return;
        enemy.performCollapse();
    };

    // ------------------------------------------------------------------
    // 15d. WHICH TWO WEAPONS SWING THIS TURN
    //
    //   A character with more than two hands can carry up to eight weapons,
    //   but nobody swings eight of them. Two are drawn at random when the turn
    //   is handed over (Game_Actor#rollTurnWeapons, ItemSystemEquipment.js) and
    //   only those two contribute their elements, their attack skills and their
    //   sounds for the round. Since the pair is a roll, the log says out loud
    //   which two came to hand: the player is choosing their next action on the
    //   strength of it.
    //
    //   Everyone carrying two weapons or fewer is silent here, which is almost
    //   everyone.
    // ------------------------------------------------------------------
    const _BattleManager_startAction_pair = BattleManager.startAction;
    BattleManager.startAction = function() {
        const subject = this._subject;
        if (subject && subject.isActor && subject.isActor() && subject.allWeapons
            && subject.allWeapons().length > 2 && this._logWindow) {
            const pair = subject.activeWeapons();
            // _turnWeaponIndexes is replaced by each roll and by nothing else,
            // so comparing the reference announces the pair once per turn
            // rather than once per repeat of a multi-hit action.
            if (pair.length >= 2 && subject._pairAnnouncedFor !== subject._turnWeaponIndexes) {
                subject._pairAnnouncedFor = subject._turnWeaponIndexes;
                this._logWindow.push("addText", T('Battle.weapons.pair', {
                    actor: subject.name(), first: pair[0].name, second: pair[1].name
                }));
            }
        }
        _BattleManager_startAction_pair.call(this);
    };

    // ------------------------------------------------------------------
    // 15e. THE KILLING BLOW - A CRITICAL HIT ROLLS FOR A LIMB
    //
    //   A critical hit is the moment the blow found something soft, so it is
    //   also the only moment a fight is allowed to end early. When one lands
    //   on a monster - a swing, an arrow or a spell, it makes no difference -
    //   a d20 is rolled and read out in the battle log against the monster's
    //   own guard:
    //
    //     roll + STR modifier   vs   10 + the monster's CON modifier   (physical)
    //     roll + INT modifier   vs   10 + the monster's WIS modifier   (magical)
    //
    //   The guard is the enemy's defence read as an ability score, so armour
    //   and wards are what stand between a lucky die and a severed head: a
    //   sack of a monster comes apart under a good roll, and anything properly
    //   built is only ever taken by the die itself.
    //
    //     natural 20      the head (or whatever else the thing cannot live
    //                     without) comes off and the monster is finished
    //     total >= DC     a limb goes: an arm, a wing, a leg. It fights on
    //                     without it, and short of whatever the part was worth
    //     anything else   the critical hit stands on its own, which is what it
    //                     was already worth
    //
    //   A natural 1 never takes anything, however large the modifier.
    //
    //   <Boss> monsters are exempt from the ending: a hand-authored fight is
    //   not decided by one die. A natural 20 against one costs it a limb
    //   instead of its life, which is the same blow landing on something that
    //   is simply too much to fall to it.
    //
    //   One die per action, not per hit: a spell that strikes four monsters or
    //   a flurry that lands six times rolls once, so a single turn never fills
    //   the log with six checks of its own.
    // ------------------------------------------------------------------
    const CRIT_SEVER_DC_BASE = 10;    // an even chance against something unarmoured
    const CRIT_SEVER_DC_MIN = 8;
    const CRIT_SEVER_DC_MAX = 30;     // above 20 only the natural 20 gets through

    // Where the killing blow looks for something vital, in order. Whatever the
    // monster is built from, the head is the first thing reached for; a body
    // with no head has a core, a heart, or in the end simply the one part it
    // was written as unable to live without.
    const CRIT_SEVER_VITAL_ORDER = [
        "HEAD", "SKULL", "BRAIN", "NECK", "HEART", "CORE", "BODY", "TORSO"
    ];

    const abilityModOf = (value) => Math.floor(((value || 10) - 10) / 2);

    const CritSever = {};

    // -- the check itself ----------------------------------------------
    CritSever.isMagicalStrike = function(action) {
        return !!(action && action.isMagical && action.isMagical());
    };

    CritSever.modifier = function(subject, magical) {
        if (!subject) return 0;
        if (magical) {
            return Number.isFinite(subject.intMod) ? subject.intMod : abilityModOf(subject.mat);
        }
        return Number.isFinite(subject.strMod) ? subject.strMod : abilityModOf(subject.atk);
    };

    CritSever.dc = function(target, magical) {
        if (!target) return CRIT_SEVER_DC_BASE;
        const guard = magical
            ? (Number.isFinite(target.wisMod) ? target.wisMod : abilityModOf(target.mdf))
            : (Number.isFinite(target.conMod) ? target.conMod : abilityModOf(target.def));
        // A soft, unarmoured thing is genuinely easier to take apart, so a
        // negative modifier lowers the bar as readily as a positive one raises
        // it - down to the floor, which is where the die always has its say.
        const dc = CRIT_SEVER_DC_BASE + guard;
        return Math.max(CRIT_SEVER_DC_MIN, Math.min(CRIT_SEVER_DC_MAX, dc));
    };

    CritSever.verdict = function(roll, modifier, dc, magical) {
        const total = roll + modifier;
        const nat20 = roll === 20;
        const nat1 = roll === 1;
        let outcome = "none";
        if (nat20) outcome = "behead";
        else if (!nat1 && total >= dc) outcome = "maim";
        return { roll, modifier, dc, total, nat20, nat1, magical: !!magical, outcome };
    };

    CritSever.roll = function(subject, target, magical, forcedRoll) {
        const modifier = CritSever.modifier(subject, magical);
        const dc = CritSever.dc(target, magical);
        const roll = Number.isFinite(forcedRoll)
            ? forcedRoll
            : Math.floor(Math.random() * 20) + 1;
        return CritSever.verdict(roll, modifier, dc, magical);
    };

    // -- what the blow takes -------------------------------------------
    CritSever.isBoss = function(enemy) {
        const data = enemy && enemy.enemy ? enemy.enemy() : null;
        if (!data) return false;
        if (data.meta && data.meta.Boss) return true;
        return /<Boss>/i.test(data.note || "");
    };

    CritSever.pickVitalPart = function(enemy) {
        const MH = window.MonsterHealth;
        if (!MH) return null;
        const keys = MH.livingPartKeys(enemy, { vital: true });
        if (!keys.length) return null;
        for (const wanted of CRIT_SEVER_VITAL_ORDER) {
            if (keys.includes(wanted)) return wanted;
        }
        return keys[0];
    };

    CritSever.pickLimb = function(enemy) {
        const MH = window.MonsterHealth;
        if (!MH) return null;
        // What comes away cleanly first; a body of nothing but solid pieces
        // still gives one of them up.
        const clean = MH.livingPartKeys(enemy, { vital: false, canCutoff: true });
        const keys = clean.length ? clean : MH.livingPartKeys(enemy, { vital: false });
        if (!keys.length) return null;
        return keys[Math.floor(Math.random() * keys.length)];
    };

    // The monster falls once the log has finished reading out what happened to
    // it: the same delayed death Health_Monsters.js arms when a vital part is
    // destroyed, so the severing, the blood and the collapse arrive in order.
    CritSever.finish = function(enemy) {
        if (!enemy) return;
        if (typeof $gameTemp !== "undefined" && $gameTemp && window.MonsterHealth) {
            $gameTemp.vitalPartDestroyedEnemy = enemy;
            $gameTemp.scheduleEnemyDeath = true;
            return;
        }
        // No anatomy plugin to hand the death to: take it directly, and let
        // section 15c above walk the body off the field.
        enemy.setHp(0);
        enemy.addState(enemy.deathStateId());
    };

    CritSever.applyVerdict = function(verdict, target) {
        if (!verdict || verdict.outcome === "none") return verdict;
        const boss = CritSever.isBoss(target);
        // A boss keeps its life and loses a piece of itself instead.
        const takesLife = verdict.outcome === "behead" && !boss;
        let partKey = takesLife ? CritSever.pickVitalPart(target) : null;
        if (!partKey) partKey = CritSever.pickLimb(target);
        if (partKey && window.MonsterHealth) window.MonsterHealth.severPart(target, partKey);
        if (takesLife) {
            CritSever.finish(target);
        } else if (verdict.outcome === "behead" && typeof $gameTemp !== "undefined" && $gameTemp) {
            $gameTemp.critSeverNote = T('Battle.critSever.bossEndures', { enemy: target.name() });
        }
        verdict.partKey = partKey;
        verdict.killed = takesLife;
        verdict.boss = boss;
        return verdict;
    };

    // -- the die in the log --------------------------------------------
    //   The check is read out rather than thrown across the screen: a
    //   critical hit is already a beat of its own, and a d20 tumbling over it
    //   stopped the fight dead every time one landed. The line waits for the
    //   damage to be written and then follows it, so the log reads as the
    //   blow, the roll, and what the roll took.
    CritSever.logRoll = function(verdict, target) {
        if (!verdict || typeof $gameTemp === "undefined" || !$gameTemp) return;
        const stat = window.CCStatLabel
            ? window.CCStatLabel(verdict.magical ? "INT" : "STR")
            : (verdict.magical ? "INT" : "STR");
        const mod = (verdict.modifier >= 0 ? "+" : "") + verdict.modifier;
        const outcome = verdict.killed
            ? T('Battle.critSever.outcomeBehead')
            : verdict.partKey
                ? T('Battle.critSever.outcomeMaim')
                : T('Battle.critSever.outcomeNone');
        $gameTemp.critSeverRollNote = T('Battle.critSever.roll', {
            enemy: target && target.name ? target.name() : "",
            roll: verdict.roll,
            mod: mod + " " + stat,
            total: verdict.total,
            dc: verdict.dc
        });
        // What the roll took reads as its own beat: kept off the roll line so a
        // long enemy name cannot push it past the edge of the log.
        $gameTemp.critSeverOutcomeNote = outcome;
    };

    // The lines the anatomy cannot write for us: what the die said, and why the
    // blow that should have finished a boss only cost it a limb.
    const _Window_BattleLog_displayHpDamage_CritSever = Window_BattleLog.prototype.displayHpDamage;
    Window_BattleLog.prototype.displayHpDamage = function(target) {
        _Window_BattleLog_displayHpDamage_CritSever.call(this, target);
        if (typeof $gameTemp === "undefined" || !$gameTemp) return;
        if (!target || !target.isEnemy || !target.isEnemy()) return;
        const push = typeof this.appendToActionLine === "function" ? "appendToActionLine" : "addText";
        if ($gameTemp.critSeverRollNote) {
            this.push(push, $gameTemp.critSeverRollNote);
            $gameTemp.critSeverRollNote = null;
        }
        if ($gameTemp.critSeverOutcomeNote) {
            this.push(push, $gameTemp.critSeverOutcomeNote);
            $gameTemp.critSeverOutcomeNote = null;
        }
        if ($gameTemp.critSeverNote) {
            this.push(push, $gameTemp.critSeverNote);
            $gameTemp.critSeverNote = null;
        }
    };

    // -- the hit that starts it all ------------------------------------
    CritSever.wantsRoll = function(action, target) {
        if (!action || !target || !target.isEnemy || !target.isEnemy()) return false;
        if (action._critSeverRolled) return false;
        const subject = action.subject ? action.subject() : null;
        // The party's own luck only: a monster that crits takes a limb off an
        // actor through Health_Core, not through this.
        if (!subject || !subject.isActor || !subject.isActor()) return false;
        const result = target.result ? target.result() : null;
        if (!result || !result.critical || !result.isHit()) return false;
        // HP damage and HP drain: nothing is severed by a heal or a debuff.
        if (!action.checkDamageType || !action.checkDamageType([1, 5])) return false;
        if (!(result.hpDamage > 0)) return false;
        // Limbs can only be severed by Explosive, Piercing, and Cutting damage.
        const HC = window.HealthCore;
        if (HC && typeof HC.attackerCanCut === "function") {
            if (!HC.attackerCanCut(subject, action)) return false;
        }
        // The critical hit already did it; there is nothing left to take.
        if (target.isDead && target.isDead()) return false;
        return true;
    };

    CritSever.onActionApplied = function(action, target) {
        if (!CritSever.wantsRoll(action, target)) return null;
        action._critSeverRolled = true;
        const magical = CritSever.isMagicalStrike(action);
        const verdict = CritSever.roll(action.subject(), target, magical);
        CritSever.applyVerdict(verdict, target);
        CritSever.logRoll(verdict, target);
        return verdict;
    };

    const _Game_Action_apply_CritSever = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function(target) {
        _Game_Action_apply_CritSever.call(this, target);
        if (typeof $gameParty === "undefined" || !$gameParty || !$gameParty.inBattle()) return;
        try {
            CritSever.onActionApplied(this, target);
        } catch (e) {
            console.error("CritSever: " + e.message);   // i18n-ignore: developer diagnostic
        }
    };

    BSE.CritSever = CritSever;
    window.CritSever = CritSever;

    // ------------------------------------------------------------------
    // 16. Scene_Gameover – redirect to map
    // ------------------------------------------------------------------
    Scene_Gameover.prototype.start = function() {
        AudioManager.stopBgm();
        SceneManager.goto(Scene_Map);
    };

    // ------------------------------------------------------------------
    // 17. window.getEnemyEventsJSON
    // ------------------------------------------------------------------
    window.getEnemyEventsJSON = function() {
        const enemyEvents = $gameMap.events().filter(ev => {
            const eventData = ev.event();
            return eventData && eventData.name === "Enemy";
        });
        const enemyData = enemyEvents.map(event => ({
            eventId: event.eventId(),
            troopId: event._fixedTroopId || 0,
            x: event.x,
            y: event.y,
            mapId: $gameMap.mapId()
        }));
        return JSON.stringify({
            mapId: $gameMap.mapId(),
            mapName: $dataMap.displayName || $dataMap.name || T('Battle.unknownMap'),
            enemyCount: enemyData.length,
            enemies: enemyData
        }, null, 2);
    };

    // ------------------------------------------------------------------
    // 18. Game_Player.executeEncounter (disable default)
    // ------------------------------------------------------------------
    Game_Player.prototype.executeEncounter = function() {};

})();

/* =========================
 * BattleSystemEnhanced - Safe Monster Image Loader
 * ========================= */
(() => {
    'use strict';
    if (typeof Sprite_Character !== 'undefined') {
        const _orig = Sprite_Character.prototype.setCharacterBitmap;
        Sprite_Character.prototype.setCharacterBitmap = function() {
            const name = this._characterName || "";
            if (/^Monsters\//i.test(name)) {
                try { _orig.call(this); } catch (e) {
                    console.error("[BattleSystemEnhanced] Failed to load character image:", name, e);
                    const fw = 48, fh = 48;
                    const bmp = new Bitmap(fw * 3, fh * 4);
                    bmp.fillRect(0, 0, bmp.width, bmp.height, "#222222");
                    bmp.drawText("MISSING", 0, Math.floor(bmp.height / 2) - 12, bmp.width, 24, "center");
                    this.bitmap = bmp;
                    this._isBigCharacter = false;
                    this.setFrame(0, 0, fw, fh);
                }
            } else {
                _orig.call(this);
            }
        };
    }
    if (typeof ImageManager !== 'undefined') {
        const _loadBmp = ImageManager.loadBitmap;
        ImageManager.loadBitmap = function(folder, filename) {
            try { return _loadBmp.call(this, folder, filename); } catch (e) {
                if (typeof folder === "string" && /img\/characters\/Monsters\/?$/i.test(folder)) {
                    console.error("[BattleSystemEnhanced] Failed to load bitmap:", folder, filename, e);
                    const bmp = new Bitmap(144, 192);
                    bmp.fillRect(0, 0, 144, 192, "#222222");
                    bmp.drawText("MISSING", 0, 84, 144, 24, "center");
                    return bmp;
                }
                throw e;
            }
        };
    }
})();