//=============================================================================
// SummonSystem.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Summon System v4.0.0: battle-only summons that take the 4th party slot, balanced against the party and the troop, with a HYPER gauge that pays out an ultimate.
 * @author Omni-Lex
 * @version 4.0.0
 *
 * @param summonActorId
 * @text Summon Actor ID
 * @desc Actor ID used as the summon proxy (default: 4). Should be a dedicated dummy actor.
 * @type actor
 * @default 4
 *
 * @command summonDemon
 * @text Summon: Demon
 * @desc Summons a demon. It feeds on the summoner's blood: HP is paid every turn it stays.
 *
 * @arg enemyId
 * @text Enemy ID
 * @desc A specific enemy to call. 0 rolls one from the demonic archetypes.
 * @type enemy
 * @default 0
 *
 * @command summonUndead
 * @text Summon: Undead
 * @desc Raises an undead thing. Costs the summoner HP every turn it stays.
 *
 * @arg enemyId
 * @text Enemy ID
 * @desc A specific enemy to raise. 0 rolls one from the undead archetypes.
 * @type enemy
 * @default 0
 *
 * @command summonElemental
 * @text Summon: Elemental
 * @desc Binds an elemental. Costs the summoner MP every turn it stays.
 *
 * @arg enemyId
 * @text Enemy ID
 * @desc A specific enemy to bind. 0 rolls one from the elemental archetypes.
 * @type enemy
 * @default 0
 *
 * @command summonCelestial
 * @text Summon: Celestial
 * @desc Calls down a celestial. Costs the summoner a great deal of MP every turn.
 *
 * @arg enemyId
 * @text Enemy ID
 * @desc A specific enemy to call. 0 rolls one from the celestial archetypes.
 * @type enemy
 * @default 0
 *
 * @command summonConstruct
 * @text Summon: Construct
 * @desc Activates a machine. It runs on money: gold is spent every turn it stays.
 *
 * @arg enemyId
 * @text Enemy ID
 * @desc A specific enemy to activate. 0 rolls one from the automaton archetypes.
 * @type enemy
 * @default 0
 *
 * @command summonMecha
 * @text Summon: War Machine
 * @desc Fields a war machine. Expensive: a great deal of gold every turn.
 *
 * @arg enemyId
 * @text Enemy ID
 * @desc A specific enemy to field. 0 rolls one from the mechanical archetypes.
 * @type enemy
 * @default 0
 *
 * @command summonBeast
 * @text Summon: Beast
 * @desc Calls the party's pet into the fight as a temporary member. With no pet, a wild beast answers instead.
 *
 * @arg petId
 * @text Pet ID
 * @desc A specific registered pet. 0 takes the active one.
 * @type number
 * @default 0
 *
 * @command summonSwarm
 * @text Summon: Swarm
 * @desc Calls vermin. They feed on the summoner, a little HP every turn.
 *
 * @arg enemyId
 * @text Enemy ID
 * @desc A specific enemy to call. 0 rolls one from the vermin archetypes.
 * @type enemy
 * @default 0
 *
 * @command summonAquatic
 * @text Summon: Aquatic
 * @desc Calls something out of the water. Costs the summoner MP every turn.
 *
 * @arg enemyId
 * @text Enemy ID
 * @desc A specific enemy to call. 0 rolls one from the aquatic archetypes.
 * @type enemy
 * @default 0
 *
 * @command summonAvian
 * @text Summon: Avian
 * @desc Calls something with wings. Costs the summoner MP every turn.
 *
 * @arg enemyId
 * @text Enemy ID
 * @desc A specific enemy to call. 0 rolls one from the winged archetypes.
 * @type enemy
 * @default 0
 *
 * @command summonSerpent
 * @text Summon: Serpent
 * @desc Calls a cold-blooded thing. Costs the summoner MP every turn.
 *
 * @arg enemyId
 * @text Enemy ID
 * @desc A specific enemy to call. 0 rolls one from the reptilian archetypes.
 * @type enemy
 * @default 0
 *
 * @command summonVerdant
 * @text Summon: Verdant
 * @desc Roots a plant on the field. It asks for nothing but cannot stay long.
 *
 * @arg enemyId
 * @text Enemy ID
 * @desc A specific enemy to root. 0 rolls one from the plant archetypes.
 * @type enemy
 * @default 0
 *
 * @command summonFae
 * @text Summon: Fae
 * @desc Strikes a bargain with the small folk. Costs the summoner MP every turn.
 *
 * @arg enemyId
 * @text Enemy ID
 * @desc A specific enemy to call. 0 rolls one from the fae archetypes.
 * @type enemy
 * @default 0
 *
 * @command summonSpirit
 * @text Summon: Spirit
 * @desc Calls a spirit, held by the party's SOUL holdings: shares are burned every turn.
 *
 * @arg enemyId
 * @text Enemy ID
 * @desc A specific enemy to call. 0 rolls one from the spirit archetypes.
 * @type enemy
 * @default 0
 *
 * @command summonShadow
 * @text Summon: Shadow
 * @desc The shadows resolve into something. Costs the summoner HP every turn.
 *
 * @arg enemyId
 * @text Enemy ID
 * @desc A specific enemy to call. 0 rolls one from the shadow archetypes.
 * @type enemy
 * @default 0
 *
 * @command summonVoid
 * @text Summon: Voidspawn
 * @desc Opens a way for something outside. Costs the summoner a great deal of MP.
 *
 * @arg enemyId
 * @text Enemy ID
 * @desc A specific enemy to call. 0 rolls one from the void archetypes.
 * @type enemy
 * @default 0
 *
 * @command summonDragon
 * @text Summon: Dragon
 * @desc Buys a dragon's attention. Tribute in gold is paid every turn.
 *
 * @arg enemyId
 * @text Enemy ID
 * @desc A specific enemy to call. 0 rolls one from the draconic archetypes.
 * @type enemy
 * @default 0
 *
 * @command summonTitan
 * @text Summon: Titan
 * @desc Wakes something enormous. It leans on the summoner: heavy HP every turn.
 *
 * @arg enemyId
 * @text Enemy ID
 * @desc A specific enemy to wake. 0 rolls one from the giant archetypes.
 * @type enemy
 * @default 0
 *
 * @command summonKnight
 * @text Summon: Champion
 * @desc Hires an armed champion. A wage in gold is paid every turn.
 *
 * @arg enemyId
 * @text Enemy ID
 * @desc A specific enemy to hire. 0 rolls one from the martial archetypes.
 * @type enemy
 * @default 0
 *
 * @command summonRabble
 * @text Summon: Rabble
 * @desc Buys the help of whatever is loitering nearby. Cheap, and about as good.
 *
 * @arg enemyId
 * @text Enemy ID
 * @desc A specific enemy to call. 0 rolls one from the rabble archetypes.
 * @type enemy
 * @default 0
 *
 * @command summonMimic
 * @text Summon: Mimic
 * @desc Calls something that eats money. Gold is paid every turn, and it wants more.
 *
 * @arg enemyId
 * @text Enemy ID
 * @desc A specific enemy to call. 0 rolls one from the mimic archetypes.
 * @type enemy
 * @default 0
 *
 * @command summonMirror
 * @text Summon: Reflection
 * @desc Calls a lesser copy of the summoner. It spends the summoner's own AP every turn.
 *
 * @command summonRevenant
 * @text Summon: Revenant
 * @desc Calls back a traveller the party has lost. Costs the summoner HP every turn.
 *
 * @arg memberName
 * @text Member name
 * @desc A specific former party member. Empty takes the most recent loss.
 * @type string
 * @default
 *
 * @command summonPetrodemon
 * @text Summon: Petrodemon
 * @desc Burns the party's OIL holdings to hold a petrodemon on the field. The barrels left are shown on its bar.
 *
 * @command summonElder
 * @text Summon: Elder Entity
 * @desc Something very old is asked to attend, and it does. It is not balanced against anything, and it drinks the summoner dry.
 *
 * @arg enemyId
 * @text Enemy ID
 * @desc A specific enemy to call. 0 takes the greatest thing the rite can reach.
 * @type enemy
 * @default 0
 *
 * @command summonNpc
 * @text Summon: Marked NPC
 * @desc Calls a marked person to the field at the party's median level.
 *
 * @arg npcName
 * @text NPC name
 * @desc A specific marked person. Empty takes the most recently marked one.
 * @type string
 * @default
 *
 * @command summonEnemy
 * @text Summon: Enemy
 * @desc Calls any creature from the bestiary. Costs the summoner MP every turn.
 *
 * @arg enemyId
 * @text Enemy ID
 * @desc The creature to call. 0 takes the marked one, then a random one at the party's level.
 * @type enemy
 * @default 0
 *
 * @command summonLastSlain
 * @text Summon: Last Slain
 * @desc Calls back the last creature the party killed. Costs the summoner HP every turn.
 *
 * @command summonKind
 * @text Summon: By Kind
 * @desc Runs any rite by name (demon, undead, elemental, void, titan, elder...). For events that pick their own rite.
 *
 * @arg kindKey
 * @text Kind
 * @desc The rite to run. window.SummonSystem.kinds() lists every one.
 * @type string
 * @default demon
 *
 * @arg enemyId
 * @text Enemy ID
 * @desc A specific enemy. 0 rolls inside the rite's own archetypes.
 * @type enemy
 * @default 0
 *
 * @command summonRandom
 * @text Summon: Wild Rite
 * @desc Runs a rite nobody chose. Whatever answers, answers.
 *
 * @command addSoftSummon
 * @text Summon: Familiar
 * @desc The caster's own familiar: its species comes from their class, its name from their name, its strength from their level. Free, and it stays a few turns.
 *
 * @command markNpc
 * @text Mark NPC
 * @desc Marks the person the player is facing, so they can be summoned later.
 *
 * @command markEnemy
 * @text Mark Enemy
 * @desc Marks a creature, so it can be summoned later.
 *
 * @arg enemyId
 * @text Enemy ID
 * @desc The creature to mark. 0 marks the one being fought.
 * @type enemy
 * @default 0
 *
 * @command dismissSummon
 * @text Dismiss Summon
 * @desc Sends the current summon away.
 *
 * @command startSummon
 * @text Summon Enemy (legacy)
 * @desc Kept for events written against v2: summons the given enemy id.
 *
 * @arg enemyId
 * @text Enemy ID
 * @desc ID of the enemy to summon.
 * @type enemy
 * @default 1
 *
 * @help SummonSystem.js
 *
 * ============================================================================
 * Summon System (v4)
 * ============================================================================
 *
 * A summon is a temporary 4th party member. It exists only inside a battle:
 * it is never saved, never walks the map, never reaches the menu, and it goes
 * the moment the fight ends OR the moment the conditions holding it there stop
 * being met.
 *
 * WHAT CAN BE SUMMONED
 *
 *   A creature   any entry in data/Enemies.json. It joins wearing its own
 *                <Char:...> walking sprite (img/characters/Monsters/), with the
 *                enemy's skills.
 *   A person     anyone the party has MARKED. They join as themselves, from
 *                their society profile, wearing their js/db/WorldGen/NPCs.json
 *                sprite (so the party bar draws their real bust).
 *   A pet        whatever is following the party (PetFollowerSystem): the
 *                animal summon simply calls it in off the leash.
 *   A reflection a lesser copy of the summoner, built from their own sheet.
 *   A revenant   a traveller the party has lost (PartyRoster's ledger).
 *
 * EACH RITE DRAWS FROM ITS OWN ARCHETYPES
 *
 * A demonic rite calls demons and nothing else. Every kind holds a list of
 * <Archetype:...> values (data/Enemies.json) and only ever rolls inside it.
 * Passing an explicit enemy id overrides the roll.
 *
 * BALANCE: A SUMMON IS NEVER STRONGER THAN THE FIGHT
 *
 * A creature is NOT brought in with the numbers the bestiary gave it. Its
 * params are re-cut against a reference traveller (the median of the party's
 * own stats) and against the level of the troop actually on the field, so the
 * same rite answers with something that belongs in this fight whether it is
 * cast at level 3 or at level 80. Each kind then takes a `share` of that
 * reference: a familiar is half a traveller, a titan is a little more than
 * one, and nothing goes past `MAX_SHARE`. The creature keeps its own SHAPE
 * (a bruiser stays a bruiser) because the re-cut is done per stat group and
 * clamped, not flattened.
 *
 * Two rites are deliberately exempt and say so: the PETRODEMON (held by the
 * party's oil, and priced accordingly) and the ELDER ENTITY, which is not
 * balanced against anything at all and arrives with the numbers it was born
 * with, multiplied. It drinks the summoner dry in about three turns, which is
 * the only thing holding it.
 *
 * THE FAMILIAR IS SOMEBODY'S, NOT THE PARTY'S
 *
 * The familiar is the one rite that belongs to a person. Which creature
 * answers is decided by the CLASS of whoever is taking the turn (a Necromancer
 * is met by something dead, a Mechanic by something built, a Witch by a bat);
 * what it is called is rolled once out of their own NAME and never changes;
 * and it is measured against THEIR stats and THEIR level alone, so it neither
 * rides on a strong party nor is held back by a weak one. Its ultimate is
 * bracketed by their level too. Change class and the pact is re-made with
 * something that suits the new one.
 *
 * The first time a traveller calls their familiar it is written into the
 * Followers page as one of the party's animals (PetFollowerSystem), and it
 * stays on that list afterwards whether it is on the field or not.
 *
 * THE CONDITIONS THAT HOLD IT THERE
 *
 *   HP        demon, undead, shadow, swarm, titan, revenant, last slain, elder
 *   MP        elemental, celestial, aquatic, avian, serpent, fae, void, enemy
 *   AP        the reflection, which spends the summoner's own momentum
 *   Gold      construct, war machine, dragon, champion, rabble, mimic
 *   SOUL      spirits, burned out of the party's holdings
 *   OIL       the petrodemon, whose barrels are written live on its bar
 *   Nothing   beast, verdant, familiar and a called person, who instead stay
 *             for a fixed few turns
 *
 * When the summoner cannot pay, the summon leaves on the spot. It is never
 * lethal: a summoner who cannot pay in blood is left standing at 1 HP.
 *
 * THE HYPER GAUGE
 *
 * While anything is summoned, a HYPER bar is drawn across the top centre of
 * the screen. It fills with the damage the party deals to the enemy for as
 * long as the summon is on the field, one hit contributing at most a third of
 * it, so it is earned over a fight rather than in one blow. Full, the summon
 * unleashes its ULTIMATE at the end of the current action and the gauge empties
 * to fill again.
 *
 * Every kind has its own ultimate, and which one it is depends on the party's
 * median level in brackets of ten: the same rite pays out a Lesser figure at
 * level 5 and a Final one at level 90, growing in damage, widening from one
 * target to the whole enemy line at bracket 3, and adding the kind's own
 * signature (a heal, a mana return, life drained back, a purge, a purse) from
 * bracket 5. Damage is capped as a fraction of each target's maximum HP, so an
 * ultimate is always a large hit and never a delete button. The elder entity's
 * is uncapped, like everything else about it.
 *
 * The summon is ALWAYS CPU-controlled (auto-battle) and never receives the
 * 1-HP death protection the real party members have: when it dies it is gone,
 * and it cannot be revived.
 *
 * Everything here works both in the ordinary battle scene and in the tactical
 * map battles of MapBattleMode.js, where the summon takes the 4th body in the
 * follower train and is placed next to whoever called it.
 *
 * OUTSIDE A FIGHT the same rites are answered too. What they call takes a
 * trailing slot of its own (alongside the pet of PetFollowerSystem.js, never
 * instead of it) and walks with the party. What holds it there is what the rite
 * cost: every point of MP the caster paid buys a fixed number of steps, and
 * when the last one is walked the binding lets go with a notice. A familiar is
 * bound rather than rented and is never counted down: it stays until it falls
 * in a fight or is sent away from the Followers page, where everything the
 * party is walking with can be dismissed.
 *
 * A summon walking with the party joins any fight the party gets into, at the
 * stature it was called with. It owes no upkeep and has no turn limit there,
 * having been paid for on the road; if it survives the fight it goes back to
 * walking, and if it falls it is gone from the map with it.
 *
 * Requires the BattleSystemEnhanced suite (loaded BEFORE this plugin).
 *
 * ============================================================================
 */

//-----------------------------------------------------------------------------
// Game_SummonFollower  (global so JsonEx can reconstruct it from saves)
//
// The body a summon walks in outside a fight. Like the pet slot of
// PetFollowerSystem.js it is not backed by a party member: it draws whatever
// rite the party is currently holding on the map, and nothing at all when
// there is none. The moment the summon steps into a fight it is the proxy
// actor's own body that stands in the line, so this slot goes blank and the
// two are never on the field at once.
//-----------------------------------------------------------------------------
function Game_SummonFollower() {
    this.initialize(...arguments);
}

Game_SummonFollower.prototype = Object.create(Game_Follower.prototype);
Game_SummonFollower.prototype.constructor = Game_SummonFollower;

Game_SummonFollower.prototype.initialize = function (memberIndex) {
    Game_Follower.prototype.initialize.call(this, memberIndex);
};

// Not backed by an actor.
Game_SummonFollower.prototype.actor = function () {
    return null;
};

Game_SummonFollower.prototype.sprite = function () {
    const S = window.SummonSystem;
    return (S && S.mapSummonSprite) ? S.mapSummonSprite() : null;
};

Game_SummonFollower.prototype.isVisible = function () {
    return !!this.sprite() && $gamePlayer.followers().isVisible();
};

Game_SummonFollower.prototype.refresh = function () {
    const look = this.isVisible() ? this.sprite() : null;
    this.setImage(look ? look.characterName : '', look ? (look.characterIndex || 0) : 0);
};

window.Game_SummonFollower = Game_SummonFollower;

(() => {
    'use strict';

    const pluginName = 'SummonSystem';
    const parameters = PluginManager.parameters(pluginName);
    const summonActorId = Number(parameters['summonActorId'] || 4);

    // How many people the party can keep marked for summoning at once. Marking
    // someone new past this pushes out the oldest mark.
    const MARK_LIMIT = 8;

    // ------------------------------------------------------------------
    // The kinds of summon, and what each one costs to keep on the field.
    //
    // `archetypes` are <Archetype:...> values from data/Enemies.json; a kind
    // only ever rolls inside its own list, which is what makes a demonic rite
    // call a demon and never a rabbit. `null` means the whole bestiary.
    //
    // `upkeep.amount` is a FRACTION of the summoner's maximum for hp/mp/ap, and
    // a flat quantity for gold, oil and soul. `null` upkeep means the summon
    // asks for nothing and is held by `turns` alone instead.
    //
    // `share` is how much of a real traveller the thing is worth once it has
    // been re-cut for this fight (see balanceParams). `pick` decides which end
    // of the archetype pool the rite reaches into: 'near' the party's level,
    // 'weak' the bottom of it, 'strong' the top.
    //
    // `balance: false` opts a rite out of the re-cut entirely: the petrodemon
    // is priced in barrels rather than in fairness, and `raw: true` on top of
    // it (the elder entity) skips even the level fit.
    //
    // `ult` is the kind's own ultimate: the animation, the element it lands
    // as, whether it opens on one target or the line, and the signature it
    // adds once the party is deep enough into the level brackets.
    // ------------------------------------------------------------------
    // i18n-ignore-start: data/Enemies.json <Archetype:> ids, animation ids, internal tags
    const KINDS = {
        demon: {
            archetypes: ['Demon', 'Hellhound', 'Gorgon', 'Minotaur', 'DoubleHeadedHumanoid'],
            upkeep: { type: 'hp', amount: 0.07, min: 5 },
            share: 0.95,
            ult: { anim: 385, element: 2, scope: 'one', bonus: 'drain' }
        },
        undead: {
            archetypes: ['Undead', 'Skeleton', 'Ghost', 'ConstructedUndead', 'Vampire'],
            upkeep: { type: 'hp', amount: 0.04, min: 3 },
            share: 0.85,
            ult: { anim: 214, element: 9, scope: 'all', bonus: 'drain' }
        },
        elemental: {
            archetypes: ['Elemental', 'FireElemental', 'WaterElemental', 'StormElemental',
                'ThunderElemental', 'DarkElemental', 'SacredElemental', 'CrystalEntity', 'Totem'],
            upkeep: { type: 'mp', amount: 0.09, min: 4 },
            share: 0.9,
            ult: { anim: 1592, element: 4, scope: 'all', bonus: 'mana' }
        },
        celestial: {
            archetypes: ['Angel', 'Ophanim', 'Phoenix', 'SacredElemental'],
            upkeep: { type: 'mp', amount: 0.14, min: 8 },
            share: 1,
            ult: { anim: 777, element: 8, scope: 'all', bonus: 'heal' }
        },
        construct: {
            archetypes: ['Golem', 'Robot', 'Turret', 'ConstructedUndead', 'Spherical'],
            upkeep: { type: 'gold', amount: 350 },
            share: 0.9,
            ult: { anim: 366, element: 4, scope: 'one', bonus: 'none' }
        },
        mecha: {
            archetypes: ['Robot', 'Drone', 'RoboticDefender', 'Turret', 'Spherical'],
            upkeep: { type: 'gold', amount: 900 },
            share: 1.05,
            ult: { anim: 726, element: 4, scope: 'all', bonus: 'none' }
        },
        beast: {
            archetypes: ['Beast', 'Bird', 'Insectoid', 'Reptilian', 'Serpent', 'Spider', 'Turtle',
                'Rabbit', 'Bat', 'Frog', 'Amphibian', 'Scorpion', 'Crustacean', 'Octopus', 'Snail',
                'AquaticFish', 'Elephant', 'InsectSwarm', 'Manticore', 'Centaur'],
            upkeep: null,
            turns: 6,
            share: 0.8,
            ult: { anim: 113, element: 1, scope: 'one', bonus: 'none' }
        },
        swarm: {
            archetypes: ['Insectoid', 'InsectSwarm', 'Spider', 'Scorpion', 'SegmentWorm',
                'Snail', 'Bacterial', 'SpiderHumanHybrid'],
            upkeep: { type: 'hp', amount: 0.03, min: 2 },
            share: 0.7,
            ult: { anim: 1032, element: 9, scope: 'all', bonus: 'drain' }
        },
        aquatic: {
            archetypes: ['AquaticFish', 'Octopus', 'Crustacean', 'Turtle', 'Amphibian',
                'Frog', 'WaterElemental'],
            upkeep: { type: 'mp', amount: 0.06, min: 3 },
            share: 0.85,
            ult: { anim: 1453, element: 5, scope: 'all', bonus: 'none' }
        },
        avian: {
            archetypes: ['Bird', 'Phoenix', 'StormElemental', 'Fairy'],
            upkeep: { type: 'mp', amount: 0.07, min: 4 },
            share: 0.8,
            ult: { anim: 1631, element: 7, scope: 'one', bonus: 'none' }
        },
        serpent: {
            archetypes: ['Serpent', 'Reptilian', 'Hydra', 'Gorgon'],
            upkeep: { type: 'mp', amount: 0.08, min: 4 },
            share: 0.9,
            ult: { anim: 1079, element: 9, scope: 'one', bonus: 'none' }
        },
        verdant: {
            archetypes: ['Plant', 'Tree', 'Mushroom'],
            upkeep: null,
            turns: 7,
            share: 0.85,
            ult: { anim: 1647, element: 5, scope: 'all', bonus: 'heal' }
        },
        fae: {
            archetypes: ['Fairy', 'Gnome', 'Mushroom'],
            upkeep: { type: 'mp', amount: 0.05, min: 3 },
            share: 0.75,
            ult: { anim: 130, element: 8, scope: 'all', bonus: 'purge' }
        },
        spirit: {
            archetypes: ['Ghost', 'Totem', 'SacredElemental', 'Fairy'],
            upkeep: { type: 'soul', amount: 1 },
            share: 0.95,
            ult: { anim: 215, element: 9, scope: 'all', bonus: 'mana' }
        },
        shadow: {
            archetypes: ['Ghost', 'Voidspawn', 'Bat', 'Hellhound', 'Vampire'],
            upkeep: { type: 'hp', amount: 0.05, min: 4 },
            share: 0.9,
            ult: { anim: 152, element: 9, scope: 'one', bonus: 'drain' }
        },
        void: {
            archetypes: ['Voidspawn', 'TentacledCreature', 'AbyssalLeviathan', 'SpiderHumanHybrid'],
            upkeep: { type: 'mp', amount: 0.12, min: 8 },
            share: 1,
            ult: { anim: 180, element: 9, scope: 'all', bonus: 'none' }
        },
        dragon: {
            archetypes: ['Dragon', 'Hydra'],
            upkeep: { type: 'gold', amount: 1200 },
            share: 1.1,
            ult: { anim: 1683, element: 2, scope: 'all', bonus: 'none' }
        },
        titan: {
            archetypes: ['Golem', 'Elephant', 'Minotaur', 'AbyssalLeviathan', 'Hydra'],
            upkeep: { type: 'hp', amount: 0.09, min: 8 },
            share: 1.1,
            ult: { anim: 254, element: 1, scope: 'all', bonus: 'none' }
        },
        knight: {
            archetypes: ['ArmoredKnight', 'Humanoid'],
            upkeep: { type: 'gold', amount: 300 },
            share: 0.95,
            ult: { anim: 1343, element: 1, scope: 'one', bonus: 'heal' }
        },
        rabble: {
            archetypes: ['TrashCreature', 'Slime', 'Gnome', 'Mutant'],
            upkeep: { type: 'gold', amount: 80 },
            share: 0.6,
            ult: { anim: 315, element: 1, scope: 'all', bonus: 'purse' }
        },
        mimic: {
            archetypes: ['ChestMimic', 'Slime'],
            upkeep: { type: 'gold', amount: 250 },
            share: 0.8,
            ult: { anim: 1753, element: 1, scope: 'one', bonus: 'purse' }
        },
        familiar: {
            archetypes: ['Fairy', 'Gnome', 'Bat', 'Slime', 'Mushroom', 'Ghost', 'Bird', 'Rabbit'],
            upkeep: null,
            turns: 4,
            share: 0.6,
            pick: 'weak',
            // A familiar belongs to one person, not to the party: it is measured
            // against its own summoner and grows only as they do.
            bindsToSummoner: true,
            ult: { anim: 129, element: 8, scope: 'one', bonus: 'purge' }
        },
        petro: {
            archetypes: ['Demon', 'Voidspawn', 'AbyssalLeviathan'],
            upkeep: { type: 'oil', amount: 3 },
            balance: false,
            power: 1.7,
            meter: true,
            ult: { anim: 458, element: 6, scope: 'all', bonus: 'purse' }
        },
        elder: {
            archetypes: ['AbyssalLeviathan', 'Voidspawn', 'TentacledCreature', 'Dragon', 'Hydra'],
            upkeep: { type: 'hp', amount: 0.33, min: 40 },
            balance: false,
            raw: true,
            power: 4.5,
            pick: 'strong',
            announce: 'elderArrives',
            ult: { anim: 409, element: 9, scope: 'all', bonus: 'drain', power: 4, uncapped: true }
        },
        enemy: {
            archetypes: null,
            upkeep: { type: 'mp', amount: 0.10, min: 6 },
            share: 0.9,
            ult: { anim: 368, element: 1, scope: 'one', bonus: 'none' }
        },
        lastSlain: {
            archetypes: null,
            upkeep: { type: 'hp', amount: 0.05, min: 4 },
            share: 0.9,
            ult: { anim: 929, element: 9, scope: 'one', bonus: 'drain' }
        },
        npc: {
            archetypes: null,
            upkeep: null,
            turns: 5,
            share: 0.9,
            ult: { anim: 1433, element: 1, scope: 'one', bonus: 'heal' }
        },
        mirror: {
            archetypes: null,
            upkeep: { type: 'ap', amount: 0.25, min: 5 },
            share: 0.7,
            ult: { anim: 1522, element: 1, scope: 'one', bonus: 'mana' }
        },
        revenant: {
            archetypes: null,
            upkeep: { type: 'hp', amount: 0.06, min: 5 },
            share: 0.9,
            ult: { anim: 154, element: 9, scope: 'all', bonus: 'heal' }
        }
    };
    // i18n-ignore-end

    // A summon is a fourth body, not a second party: nothing is ever re-cut
    // above this many times a real traveller, whatever a kind asks for.
    const MAX_SHARE = 1.2;
    // How far a single stat may wander from the reference once the re-cut is
    // done, so a creature keeps its shape without any one number running away.
    const STAT_FLOOR = 0.25;
    const STAT_CEIL = 1.6;

    // The HYPER gauge: how much damage the party must land on the enemy, while
    // the summon is out, to pay for one ultimate. Read as a fraction of what
    // the whole troop is worth, with a ceiling on what any single blow may
    // contribute so the bar is earned over a fight rather than in one hit.
    const HYPER_TROOP_SHARE = 0.55;
    const HYPER_MIN = 150;
    const HYPER_HIT_CAP = 0.34;

    // ------------------------------------------------------------------
    // Module state. Battle-only: never written to a save, always cleared on
    // load, and torn down the moment the fight ends.
    // ------------------------------------------------------------------
    let active = null;          // the summon record, or null
    let pendingLeave = null;    // reason key: it is going, at the next safe point
    let pendingUltimate = false;// the gauge is full: it fires at the next safe point
    let lastUpkeepFrame = -1;   // dedupe: one upkeep per frame, whatever calls it
    let heldBody = null;        // the follower slot a tactical summon stands in
    let gauge = null;           // the HYPER sprite, while a summon is on the field

    // ------------------------------------------------------------------
    // Outside a fight the rite is answered all the same, and what it calls
    // walks behind the party instead of standing in a battle line. What holds
    // it there is what the rite cost: every point of MP the caster paid buys a
    // number of steps beside them, and when the last one is walked the binding
    // lets go. A familiar is the one exception and is never counted down: it is
    // its summoner's own animal and stays until something kills it in a fight
    // or they send it away from the Followers page.
    //
    // Unlike a battle summon, a map summon IS save data: it lives on
    // $gameSystem so it survives a map change, a save and a load.
    // ------------------------------------------------------------------
    const MAP_STEPS_PER_MP = 4;
    const MAP_STEPS_MIN = 40;
    const MAP_STEPS_MAX = 2000;
    const MAP_STEPS_NO_RITE = 120;   // an event called it, and events pay nothing
    const RITE_WINDOW = 600;         // frames a paid rite still counts as the one being cast

    let riteCost = 0;           // MP the skill now casting took from its caster
    let riteActorId = 0;        // who paid it
    let riteFrame = -Infinity;  // when, so a stale rite never prices a later one

    // ==================================================================
    // 1. HELPERS
    // ==================================================================

    function actorProxy() {
        return $gameActors ? $gameActors.actor(summonActorId) : null;
    }

    function bse() {
        return window.BattleSystemEnhanced || window.BSE || null;
    }

    function mbm() {
        const m = window.MapBattleMode;
        return (m && typeof m.isActive === 'function' && m.isActive()) ? m : null;
    }

    function toast(text, severity) {
        if (!text) return;
        if (window.ParchmentToast) {
            window.ParchmentToast.show(text, { severity: severity || 'info', duration: 150 });
        } else if (window.MapBattleMode && window.MapBattleMode._logWindow) {
            window.MapBattleMode._logWindow.addText(text);
        } else {
            $gameMessage.add(text);
        }
    }

    function clamp(value, low, high) {
        return Math.max(low, Math.min(high, value));
    }

    function median(values) {
        if (!values.length) return 0;
        const sorted = values.slice().sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    // The enemy's own walking sprite name, without the "Monsters/" prefix.
    function enemyCharName(enemy) {
        if (!enemy) return null;
        const B = bse();
        if (B && B.Data && B.Data._enemyCharSprites) {
            const v = B.Data._enemyCharSprites[enemy.id];
            if (v) return v;
        }
        if (enemy.note) {
            const m = enemy.note.match(/<Char:\s*(.+?)>/i);
            if (m) return m[1].trim();
        }
        return null;
    }

    function enemyArchetype(enemy) {
        const B = bse();
        if (B && B.Helpers && B.Helpers.getEnemyArchetype) return B.Helpers.getEnemyArchetype(enemy);
        if (!enemy || !enemy.note) return null;
        const m = enemy.note.match(/<Archetype:\s*(.+?)>/i);
        return m ? m[1].trim() : null;
    }

    function enemyLevel(enemy) {
        const B = bse();
        if (B && B.Helpers && B.Helpers.getEnemyLevel) return B.Helpers.getEnemyLevel(enemy.note) || 1;
        if (!enemy || !enemy.note) return 1;
        const m = enemy.note.match(/<Level:\s*(\d+)>/i);
        return m ? Number(m[1]) : 1;
    }

    function realMembers() {
        return ($gameParty ? $gameParty.members() : [])
            .filter(a => a && a.actorId() !== summonActorId);
    }

    // The level the party is fighting at: the median of the travellers, never
    // the proxy's own (it has none of its own to speak of).
    function partyMedianLevel() {
        const members = realMembers();
        if (!members.length) return 1;
        const B = bse();
        if (B && B.Helpers && B.Helpers.getMedianLevel) {
            return Math.max(1, Math.round(B.Helpers.getMedianLevel(members)));
        }
        return Math.max(1, Math.round(median(members.map(m => m.level))));
    }

    // The level the troop on the field is fighting at. 0 when there is no
    // troop to read, which is what makes the summon fall back to the party.
    function troopMedianLevel() {
        if (!$gameTroop || !$gameParty || !$gameParty.inBattle()) return 0;
        const levels = $gameTroop.members()
            .filter(e => e && e.isAlive() && e.enemy())
            .map(e => enemyLevel(e.enemy()))
            .filter(n => n > 0);
        return levels.length ? Math.max(1, Math.round(median(levels))) : 0;
    }

    // What a summon arrives as. Half the party's own level and half the level
    // of what they are actually fighting, so a rite cast against something far
    // above the party answers with something that can stand in that fight, and
    // one cast against vermin does not oversell itself. Bounded either way, so
    // a single high-level straggler in a troop cannot inflate the whole rite.
    function summonLevel() {
        const party = partyMedianLevel();
        const troop = troopMedianLevel();
        if (!troop) return party;
        const blended = Math.round((party + troop) / 2);
        return Math.max(1, clamp(blended, Math.round(party * 0.6), Math.round(party * 1.4) + 2));
    }

    // Whoever is doing the summoning: the battler taking the action, else the
    // member currently being asked for input, else the first traveller standing.
    function resolveSummoner() {
        const candidates = [BattleManager._subject, BattleManager._currentActor];
        for (const c of candidates) {
            if (c && c.isActor && c.isActor() && c.actorId() !== summonActorId) return c;
        }
        // Outside a fight nobody is "taking a turn", so the caster is whoever
        // just paid for the rite from the skill menu. It matters: a familiar is
        // measured against its own summoner and nobody else's.
        const caster = riteCaster();
        if (caster) return caster;
        const party = realMembers();
        return party.find(a => a.isAlive()) || party[0] || null;
    }

    // The traveller whose skill reserved the common event now running, while
    // that is still recent enough to be the rite being cast.
    function riteCaster() {
        if ((Graphics.frameCount - riteFrame) > RITE_WINDOW) return null;
        const actor = (riteActorId && $gameActors) ? $gameActors.actor(riteActorId) : null;
        return (actor && actor.actorId() !== summonActorId) ? actor : null;
    }

    // Every enemy carrying one of these archetypes. Built once and cached: the
    // bestiary is 1600 entries and a rite may be cast every turn.
    const poolCache = {};
    function archetypePool(archetypes) {
        const key = archetypes ? archetypes.join('|') : '*';
        if (poolCache[key]) return poolCache[key];
        const wanted = archetypes ? new Set(archetypes.map(a => a.toLowerCase())) : null;
        const pool = [];
        for (const enemy of $dataEnemies) {
            if (!enemy || !enemy.name) continue;
            // A creature with no walking sprite has no body to stand in the
            // party line, so it is not something that can be called.
            if (!enemyCharName(enemy)) continue;
            if (wanted) {
                const arch = enemyArchetype(enemy);
                if (!arch || !wanted.has(arch.toLowerCase())) continue;
            }
            pool.push(enemy);
        }
        poolCache[key] = pool;
        return pool;
    }

    // A creature the rite can actually hold. 'near' takes the closest handful
    // to the level this fight is being held at and rolls between them, so the
    // same rite does not always answer with the same thing; 'weak' takes the
    // bottom of the pool and 'strong' the top, which is what makes the elder
    // rite reach for the largest thing it knows.
    function pickFromPool(kind) {
        const pool = archetypePool(kind.archetypes);
        if (!pool.length) return null;
        const mode = kind.pick || 'near';
        if (mode === 'weak') {
            const lowest = pool.slice().sort((a, b) => enemyLevel(a) - enemyLevel(b));
            const band = lowest.slice(0, Math.max(1, Math.ceil(lowest.length / 3)));
            return band[Math.floor(Math.random() * band.length)];
        }
        if (mode === 'strong') {
            const highest = pool.slice().sort((a, b) => enemyLevel(b) - enemyLevel(a));
            const band = highest.slice(0, Math.min(8, highest.length));
            return band[Math.floor(Math.random() * band.length)];
        }
        const target = summonLevel();
        const sorted = pool.slice().sort((a, b) =>
            Math.abs(enemyLevel(a) - target) - Math.abs(enemyLevel(b) - target));
        const band = sorted.slice(0, Math.min(12, sorted.length));
        return band[Math.floor(Math.random() * band.length)];
    }

    // ==================================================================
    // 1b. FAMILIARS
    //
    // A familiar is not a rite like the others. It is ONE creature belonging to
    // ONE person: what answers depends on the class they carry, what it is
    // called is rolled once from their own name and never changes, and how
    // strong it is depends on THEIR level alone, never on the party's median or
    // on what they happen to be fighting. Two travellers casting the same skill
    // therefore get two different animals with two different names, and a
    // veteran's familiar is a veteran's whether they walk with beginners or not.
    // ==================================================================

    // What answers whose call. Keyed by $dataClasses id, so nothing here reads
    // a translated class name.
    // i18n-ignore-start: data/Enemies.json <Archetype:> ids
    const FAMILIAR_CLASSES = {
        1: ['Rabbit', 'Bird', 'Slime'],                      // Freelancer
        2: ['Bat', 'Ghost', 'Fairy'],                        // Witch
        3: ['Fairy', 'Angel', 'Bird'],                       // Nun
        4: ['Bird', 'Beast'],                                // Knight
        5: ['Beast', 'Minotaur'],                            // Wrestler
        6: ['ChestMimic', 'Gnome', 'Drone'],                 // CEO
        7: ['Bat', 'Ghost', 'Undead'],                       // Vampire
        8: ['Voidspawn', 'TentacledCreature', 'Ghost'],      // Cultist
        9: ['Fairy', 'Drone', 'Bird'],                       // Combat Medic
        10: ['Elemental', 'FireElemental', 'WaterElemental', 'StormElemental'], // Elementalist
        11: ['Beast', 'Bird', 'Serpent'],                    // Martial Artist
        12: ['Fairy', 'CrystalEntity', 'Gnome'],             // Enchanter
        13: ['Hellhound', 'Beast', 'Minotaur'],              // Berserker
        14: ['Bird', 'Rabbit', 'Frog'],                      // Acrobat
        15: ['Turtle', 'Bird', 'Totem'],                     // Monk
        16: ['Beast', 'Minotaur'],                           // Brawler
        17: ['Beast', 'Bird'],                               // Boxer
        18: ['Beast', 'Minotaur', 'TrashCreature'],          // Pro Wrestler
        19: ['FireElemental', 'Phoenix', 'Hellhound'],       // Fire Mage
        20: ['WaterElemental', 'CrystalEntity', 'Bird'],     // Ice Mage
        21: ['Bat', 'Spider', 'Rabbit'],                     // Rogue
        22: ['Angel', 'SacredElemental', 'Bird'],            // Paladin
        23: ['Demon', 'Voidspawn', 'Hellhound'],             // Warlock
        24: ['Bird', 'Beast', 'Rabbit'],                     // Ranger
        25: ['Angel', 'Fairy', 'SacredElemental'],           // Cleric
        26: ['Serpent', 'Bird', 'Beast'],                    // Samurai
        27: ['Elemental', 'CrystalEntity', 'Fairy'],         // Archmage
        28: ['Bird', 'Bat', 'Rabbit'],                       // Scout
        29: ['Ghost', 'Fairy', 'Totem'],                     // Oracle
        30: ['Beast', 'Hellhound'],                          // Gladiator
        31: ['Skeleton', 'Ghost', 'Undead'],                 // Necromancer
        32: ['Bird', 'Beast', 'Drone'],                      // Commander
        33: ['Golem', 'Turtle', 'Totem'],                    // Guardian
        34: ['Elemental', 'CrystalEntity', 'Ghost'],         // Spellblade
        35: ['Bird', 'Fairy', 'Gnome'],                      // Bard
        36: ['Ghost', 'Fairy', 'Slime'],                     // Illusionist
        37: ['FireElemental', 'Golem', 'Elemental'],         // Battlemage
        38: ['Beast', 'Mutant', 'Drone'],                    // Mercenary
        39: ['Totem', 'CrystalEntity', 'Turtle'],            // Sage
        40: ['Beast', 'Hellhound', 'Minotaur'],              // Barbarian
        41: ['Bacterial', 'Drone', 'Fairy'],                 // Doctor
        42: ['Bacterial', 'Slime', 'Drone'],                 // Scientist
        43: ['FireElemental', 'Beast', 'Bird'],              // Firefighter
        44: ['Beast', 'Drone', 'Bird'],                      // Police Officer
        45: ['Slime', 'Mushroom', 'Crustacean'],             // Chef
        46: ['Bird', 'Drone', 'Gnome'],                      // Journalist
        47: ['Golem', 'Gnome', 'Robot'],                     // Construction Worker
        48: ['Gnome', 'Bird', 'Ghost'],                      // Academic
        49: ['Ghost', 'Fairy', 'TentacledCreature'],         // Psychologist
        50: ['Skeleton', 'Gnome', 'Snail'],                  // Archaeologist
        51: ['Fairy', 'Bird', 'Slime'],                      // Nurse
        52: ['Beast', 'Bird', 'Rabbit'],                     // Hunter-Gatherer
        53: ['CrystalEntity', 'Spherical', 'Elemental'],     // Physicist
        54: ['Robot', 'Drone', 'Spherical'],                 // Mechanic
        55: ['ChestMimic', 'Gnome', 'Slime'],                // Shopkeeper
        56: ['Rabbit', 'Insectoid', 'Plant'],                // Farmer
        57: ['Beast', 'Tree', 'Insectoid'],                  // Lumberjack
        58: ['StormElemental', 'ThunderElemental', 'Bird'],  // Meteorologist
        59: ['Angel', 'SacredElemental', 'Fairy'],           // Priest
        60: ['Fairy', 'Bird', 'Gnome'],                      // Entertainer
        61: ['Ophanim', 'Angel', 'Phoenix'],                 // Demigod
        62: ['TrashCreature', 'Slime', 'Snail'],             // Wretch
        63: ['Beast', 'Bat', 'Insectoid'],                   // Feral
        64: ['ChestMimic', 'Slime'],                         // Mimic
        65: ['Voidspawn', 'Slime', 'Insectoid'],             // Monster
        66: ['Robot', 'Drone', 'CrystalEntity'],             // Mana Cyborg
        67: ['Ghost', 'Undead', 'Voidspawn'],                // Ghost
        68: ['Undead', 'Skeleton', 'Bacterial'],             // Zombie
        69: ['Mutant', 'Slime', 'Insectoid'],                // Mutant
        70: ['Drone', 'Robot', 'Spherical']                  // Drone
    };
    // i18n-ignore-end

    // A stable number out of a name. The same traveller always rolls the same
    // familiar, in this savegame and in the next one, because nothing about the
    // roll is random once the name is known.
    function nameSeed(text) {
        let hash = 2166136261;
        const str = String(text || '');
        for (let i = 0; i < str.length; i++) {
            hash ^= str.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return Math.abs(hash >>> 0);
    }

    function familiarStore() {
        if (!$gameSystem) return {};
        if (!$gameSystem._summonFamiliars) $gameSystem._summonFamiliars = {};
        return $gameSystem._summonFamiliars;
    }

    // The creature bound to one person: rolled once out of their class's own
    // list, named once out of their own name, and written down so it is the
    // same animal every time they call it.
    function familiarFor(actor) {
        if (!actor) return null;
        const store = familiarStore();
        const key = String(actor.actorId());
        const seed = nameSeed(actor.name());
        const record = store[key];
        // A record is re-rolled when the traveller has changed class since it
        // was written: a Necromancer does not keep the Ranger's hawk.
        if (record && record.classId === actor._classId && $dataEnemies[record.enemyId]) {
            return record;
        }
        const archetypes = FAMILIAR_CLASSES[actor._classId] || KINDS.familiar.archetypes;
        const pool = archetypePool(archetypes).length
            ? archetypePool(archetypes)
            : archetypePool(KINDS.familiar.archetypes);
        if (!pool.length) return null;
        // The bottom third of the pool: a familiar is a small thing, whatever
        // class it answers to.
        const lowest = pool.slice().sort((a, b) => enemyLevel(a) - enemyLevel(b));
        const band = lowest.slice(0, Math.max(1, Math.ceil(lowest.length / 3)));
        const enemy = band[seed % band.length];
        const names = T.pool ? T.pool('Battle.summon.familiar.names') : [];
        const bank = names.length ? names : [enemy.name];
        const written = {
            enemyId: enemy.id,
            classId: actor._classId,
            name: bank[Math.floor(seed / 7) % bank.length],
            petId: (record && record.petId) || 0
        };
        store[key] = written;
        return written;
    }

    // The familiar is measured against its own summoner and against nothing
    // else: their params are the reference, their level is the level, and the
    // troop on the field does not enter into it.
    function buildFamiliarSpec(summoner) {
        const record = familiarFor(summoner);
        const enemy = record ? $dataEnemies[record.enemyId] : null;
        if (!enemy) return null;
        const spec = buildEnemySpec('familiar', enemy);              // i18n-ignore: internal tag
        const ownParams = [];
        for (let i = 0; i < 8; i++) ownParams.push(summoner.param(i));
        spec.name = record.name;
        spec.familiarOf = summoner.actorId();
        spec.creatureName = enemy.name;
        spec.level = Math.max(1, summoner.level);
        spec.tierLevel = Math.max(1, summoner.level);
        spec.params = applyConvokerBonus(balanceParams(enemy.params, KINDS.familiar, { ref: ownParams, bias: 1 }));
        return spec;
    }

    // The first time somebody calls their familiar it stops being a spell and
    // starts being an animal they own: it is written into the Followers page
    // alongside the pets and the children, and stays there. Later calls only
    // keep its record current with the level its summoner has reached.
    function registerFamiliarPet(summoner, spec) {
        const pets = window.PetSystem;
        if (!pets || !pets.registerPet) return;
        const store = familiarStore();
        const key = String(summoner.actorId());
        const record = store[key];
        if (!record) return;
        const existing = record.petId ? pets.getPet(record.petId) : null;
        if (existing) {
            existing.level = spec.level;
            linkMapSummonPet(existing.id);
            return;
        }
        const pet = pets.registerPet({
            name: spec.name,
            characterName: spec.characterName,
            characterIndex: spec.characterIndex || 0,
            isFollower: true,
            enemyId: spec.enemyId,
            enemyName: spec.creatureName,
            level: spec.level,
            archetype: enemyArchetype($dataEnemies[spec.enemyId]),
            note: ($dataEnemies[spec.enemyId] || {}).note || '',
            skillIds: spec.skillIds
        });
        if (!pet) return;
        record.petId = pet.id;
        linkMapSummonPet(pet.id);
        toast(T('Battle.summon.familiar.bound', {
            name: spec.name,
            summoner: summoner.name()
        }), 'info');
    }

    // ==================================================================
    // 2. MARKS  (people and creatures the party has taken note of)
    // ==================================================================

    function marks() {
        if (!$gameSystem) return { npcs: [], enemyId: 0 };
        if (!$gameSystem._summonMarks) $gameSystem._summonMarks = { npcs: [], enemyId: 0 };
        if (!Array.isArray($gameSystem._summonMarks.npcs)) $gameSystem._summonMarks.npcs = [];
        return $gameSystem._summonMarks;
    }

    // The person standing in front of the player, else the nearest one within a
    // few tiles. Only real people count: an "Enemy" event is a creature and is
    // marked through markEnemy instead.
    function npcEventNearPlayer() {
        if (!$gameMap || !$gamePlayer) return null;
        const registry = window.NPCSocietyRegistry;
        if (!registry) return null;
        const named = (event) => {
            const data = event && event.event();
            const name = (data && data.name || '').trim();
            if (!name || name === 'Enemy' || name === 'Player2') return null;  // i18n-ignore: event names
            return name;
        };
        const facing = { x: $gamePlayer.x, y: $gamePlayer.y };
        const dir = $gamePlayer.direction();
        const front = {
            x: $gameMap.roundXWithDirection(facing.x, dir),
            y: $gameMap.roundYWithDirection(facing.y, dir)
        };
        let best = null;
        let bestDistance = Infinity;
        for (const event of $gameMap.events()) {
            if (!event || event._erased) continue;
            const name = named(event);
            if (!name) continue;
            if (event.x === front.x && event.y === front.y) return { event, name };
            const distance = Math.abs(event.x - facing.x) + Math.abs(event.y - facing.y);
            if (distance <= 4 && distance < bestDistance) {
                bestDistance = distance;
                best = { event, name };
            }
        }
        return best;
    }

    function markNpc() {
        const registry = window.NPCSocietyRegistry;
        const found = npcEventNearPlayer();
        if (!found || !registry) {
            toast(T('Battle.summon.noOneToMark'), 'warning');
            return;
        }
        // Minting the profile here is exactly what opening the Empathize panel
        // on them would do, so a marked stranger is a real person afterwards.
        const profile = registry.getProfile(found.name) ||
            (registry.ensureProfile ? registry.ensureProfile(found.name, null) : null);
        if (!profile) {
            toast(T('Battle.summon.noOneToMark'), 'warning');
            return;
        }
        const record = {
            name: found.name,
            characterName: found.event.characterName(),
            characterIndex: found.event.characterIndex()
        };
        const list = marks().npcs;
        const existing = list.findIndex(m => m && m.name === record.name);
        if (existing >= 0) list.splice(existing, 1);
        list.push(record);
        while (list.length > MARK_LIMIT) list.shift();
        toast(T('Battle.summon.marked', { name: record.name }), 'info');
    }

    function markEnemy(enemyId) {
        let id = Number(enemyId || 0);
        if (!id && $gameTroop && $gameParty && $gameParty.inBattle()) {
            const target = $gameTroop.members().find(e => e && e.isAlive());
            if (target) id = target.enemyId();
        }
        if (!id && $gameSystem && $gameSystem._lastSlainEnemyId) id = $gameSystem._lastSlainEnemyId;
        const enemy = $dataEnemies[id];
        // A petrodemon (anything <NoRecruit>) is never anyone's to call.
        const unrecruitable = window.EnemyTalk && window.EnemyTalk.isUnrecruitableData;
        if (!enemy || (unrecruitable && unrecruitable(enemy))) {
            toast(T('Battle.summon.noOneToMark'), 'warning');
            return;
        }
        marks().enemyId = id;
        toast(T('Battle.summon.marked', { name: enemy.name }), 'info');
    }

    // ==================================================================
    // 3. THE LAST CREATURE THE PARTY KILLED
    //
    // Remembered across battles and across maps, so a necromancer can call back
    // something they put down yesterday. Recorded per world, in the save.
    // ==================================================================

    const _Game_Enemy_die = Game_Enemy.prototype.die;
    Game_Enemy.prototype.die = function () {
        _Game_Enemy_die.call(this);
        // A creature nothing can recruit is nothing anyone can call back either
        // (the petrodemons, EnemyTalkSystem's isUnrecruitable). Its slot is also
        // rewritten by the next one, so the id would call up a stranger.
        if (this.isUnrecruitable && this.isUnrecruitable()) return;
        if ($gameSystem && this.enemyId) $gameSystem._lastSlainEnemyId = this.enemyId();
    };

    // ==================================================================
    // 4. BUILDING THE SUMMON, AND CUTTING IT DOWN TO SIZE
    // ==================================================================

    // What a traveller in this party is worth, stat by stat. The median rather
    // than the best or the leader, so one over-equipped member does not decide
    // what every rite answers with.
    function referenceParams() {
        const members = realMembers().filter(a => a);
        if (members.length) {
            const out = [];
            for (let i = 0; i < 8; i++) {
                out.push(Math.max(1, Math.round(median(members.map(m => m.param(i))))));
            }
            return out;
        }
        // No travellers to measure (a lone summon, an odd event): fall back to
        // a plain curve read off the level the fight is being held at.
        const lv = summonLevel();
        return [200 + lv * 40, 50 + lv * 10, 12 + lv * 3, 10 + lv * 2.5,
                12 + lv * 3, 10 + lv * 2.5, 12 + lv * 2.5, 8 + lv * 2]
            .map(v => Math.max(1, Math.round(v)));
    }

    // How much the fight itself moves the reference. A troop well above the
    // party pulls the summon up a little, one well below pulls it down, and
    // neither goes far: the party is still the yardstick.
    function levelBias() {
        const party = partyMedianLevel();
        if (party <= 0) return 1;
        return clamp(summonLevel() / party, 0.75, 1.3);
    }

    // Re-cut a set of params so the thing wearing them belongs in this fight.
    //
    // The creature's own numbers are kept only as a SHAPE: within each stat
    // group (health, magic, the six combat stats) the group is scaled as a
    // whole to the reference, so a creature that was built as a bruiser is
    // still a bruiser afterwards, only one sized for the travellers standing
    // beside it. Each stat is then clamped against the reference so no single
    // number can run away with the fight.
    //
    // `opts.ref` measures the thing against somebody in particular rather than
    // against the party (a familiar is its summoner's, and nobody else's), and
    // `opts.bias` takes the troop out of the reckoning with it.
    function balanceParams(raw, kind, opts) {
        const ref = (opts && opts.ref) || referenceParams();
        const bias = (opts && opts.bias !== undefined) ? opts.bias : levelBias();
        const share = clamp((kind && kind.share) || 0.9, 0.25, MAX_SHARE) * bias;
        const groups = [[0], [1], [2, 3, 4, 5, 6, 7]];
        const source = (raw || []).map(v => Math.max(0, Number(v) || 0));
        const out = ref.slice();
        for (const group of groups) {
            const srcMean = Math.max(1, median(group.map(i => source[i] || 0)) ||
                group.reduce((sum, i) => sum + (source[i] || 0), 0) / group.length);
            const refMean = Math.max(1, group.reduce((sum, i) => sum + ref[i], 0) / group.length);
            const factor = (refMean / srcMean) * share;
            for (const i of group) {
                // A creature with no magic of its own is still given a pool to
                // cast the skills it came with, rather than a pool of nothing.
                const own = (i === 1 && source[i] <= 1) ? srcMean * 0.6 : source[i];
                const scaled = Math.round(own * factor);
                // The floor moves with the share (a familiar is allowed to be
                // small) but the ceiling never does: no summon of any kind
                // carries a stat further above a traveller's than STAT_CEIL,
                // however lopsided the creature it was cut from.
                out[i] = clamp(scaled,
                    Math.max(1, Math.round(ref[i] * STAT_FLOOR * share)),
                    Math.max(1, Math.round(ref[i] * STAT_CEIL)));
            }
        }
        return out;
    }

    // The unbalanced path, kept for the two rites that are priced rather than
    // fitted: the petrodemon (level-fitted, then multiplied by what the oil is
    // buying) and the elder entity (`raw`, which is exactly what it sounds
    // like: the bestiary's own numbers, multiplied, answering to nothing).
    function unbalancedParams(enemy, kind) {
        const power = (kind && kind.power) || 1;
        if (kind && kind.raw) {
            return (enemy.params || []).map(v => Math.max(1, Math.round((v || 1) * power)));
        }
        const target = summonLevel();
        const own = Math.max(1, enemyLevel(enemy));
        const fit = clamp(target / own, 0.35, 3);
        return (enemy.params || []).map(v => Math.max(1, Math.round((v || 1) * fit * power)));
    }

    // A Convoker in the party binds what it calls up more tightly: the thing
    // comes through with more health behind it and more force in its blows.
    // The plugin that owns the class passives answers how much, so the boundary
    // is never re-derived here.
    function convokerBonus() {
        const P = window.BattleSystemPassiveSkills;
        const b = (P && P.getSummonBonus) ? P.getSummonBonus() : null;
        return b || { hp: 1, power: 1 };
    }

    // Health takes the health bonus, the four offensive stats take the power
    // one; defence, agility and luck are left as they were cut.
    function applyConvokerBonus(params) {
        const bonus = convokerBonus();
        if (bonus.hp === 1 && bonus.power === 1) return params;
        const out = (params || []).slice();
        const scale = (i, mult) => {
            if (out[i] === undefined) return;
            out[i] = Math.max(1, Math.round(out[i] * mult));
        };
        scale(0, bonus.hp);
        [2, 4].forEach(i => scale(i, bonus.power));
        return out;
    }

    function summonParams(raw, kind, enemy) {
        if (kind && kind.balance === false && enemy) {
            return applyConvokerBonus(unbalancedParams(enemy, kind));
        }
        return applyConvokerBonus(balanceParams(raw, kind));
    }

    // A person fights as the sheet the Empathize panel already shows, re-cut
    // like everything else so a clerk is not suddenly a champion.
    function profileParams(profile) {
        const keys = ['mhp', 'mmp', 'atk', 'def', 'mat', 'mdf', 'agi', 'luk'];
        return keys.map(k => {
            const v = Number(profile && profile[k]);
            return Number.isFinite(v) && v > 0 ? Math.round(v) : 1;
        });
    }

    // Build the record the whole system reads from.
    function buildEnemySpec(kindKey, enemy) {
        const kind = KINDS[kindKey];
        const charName = enemyCharName(enemy);
        const skillIds = [];
        for (const action of (enemy.actions || [])) {
            if (action.skillId > 0 && $dataSkills[action.skillId] && !skillIds.includes(action.skillId)) {
                skillIds.push(action.skillId);
            }
        }
        return {
            kindKey,
            kind,
            source: 'enemy',                                        // i18n-ignore: internal tag
            name: enemy.name,
            enemyId: enemy.id,
            level: summonLevel(),
            params: summonParams(enemy.params, kind, enemy),
            skillIds,
            classId: 0,
            // A creature stands in the line wearing the walking sprite its own
            // notebox names (img/characters/Monsters/).
            characterName: charName ? 'Monsters/' + charName : '',  // i18n-ignore: asset folder
            characterIndex: 0,
            battlerName: enemy.battlerName || ''
        };
    }

    function buildNpcSpec(mark, profile) {
        const skillIds = (profile.skillIds || []).filter(id => $dataSkills[id]);
        // A person is drawn from the sprite catalogue, which is what makes the
        // party bar resolve their real bust (js/db/WorldGen/NPCs.json).
        const catalogued = profile.spriteKey && window.SpriteCatalog &&
            window.SpriteCatalog.entry && window.SpriteCatalog.entry(profile.spriteKey);
        const characterName = catalogued ? profile.spriteKey : (mark.characterName || '');
        const characterIndex = catalogued ? (profile.bustIndex || 0) : (mark.characterIndex || 0);
        return {
            kindKey: 'npc',                                         // i18n-ignore: internal tag
            kind: KINDS.npc,
            source: 'npc',                                          // i18n-ignore: internal tag
            name: mark.name,
            npcName: mark.name,
            enemyId: 0,
            level: summonLevel(),
            params: applyConvokerBonus(balanceParams(profileParams(profile), KINDS.npc)),
            skillIds,
            classId: (profile.assignedClassId && $dataClasses[profile.assignedClassId])
                ? profile.assignedClassId : 0,
            characterName,
            characterIndex,
            battlerName: ''
        };
    }

    // A pet joins as itself: it kept the enemy it was recruited from, so its
    // skills and stature come back with it. A pet with no creature behind it (a
    // child, a clone) has no params of its own and fights off the proxy's own
    // class curve at the party's level, which is what a null `params` means.
    function buildPetSpec(pet) {
        const enemy = pet.enemyId ? $dataEnemies[pet.enemyId] : null;
        const spec = enemy
            ? buildEnemySpec('beast', enemy)                         // i18n-ignore: internal tag
            : {
                kindKey: 'beast',                                   // i18n-ignore: internal tag
                kind: KINDS.beast,
                name: pet.name,
                enemyId: 0,
                level: Math.max(1, pet.level || summonLevel()),
                params: null,
                skillIds: (pet.skillIds || []).filter(id => $dataSkills[id]),
                classId: 0,
                characterName: pet.characterName || '',
                characterIndex: pet.characterIndex || 0,
                battlerName: ''
            };
        // Whatever it was born as, it walks in wearing the face the party knows
        // and answers to the name they gave it.
        spec.source = 'pet';                                        // i18n-ignore: internal tag
        spec.petId = pet.id;
        spec.name = pet.name || spec.name;
        if (pet.characterName) {
            spec.characterName = pet.characterName;
            spec.characterIndex = pet.characterIndex || 0;
        }
        return spec;
    }

    // A lesser copy of whoever cast the rite. It is built from the summoner's
    // own sheet and then cut to the reflection's share, so it is recognisably
    // them and reliably weaker than them.
    function buildMirrorSpec(summoner) {
        const raw = [];
        for (let i = 0; i < 8; i++) raw.push(summoner.param(i));
        const skillIds = summoner.skills()
            .filter(s => s && $dataSkills[s.id] && s.occasion < 2)
            .sort((a, b) => (b.mpCost || 0) - (a.mpCost || 0))
            .slice(0, 8)
            .map(s => s.id);
        return {
            kindKey: 'mirror',                                      // i18n-ignore: internal tag
            kind: KINDS.mirror,
            source: 'mirror',                                       // i18n-ignore: internal tag
            name: T('Battle.summon.mirrorName', { name: summoner.name() }),
            enemyId: 0,
            level: Math.max(1, summoner.level),
            params: applyConvokerBonus(balanceParams(raw, KINDS.mirror)),
            skillIds,
            classId: summoner._classId || 0,
            characterName: summoner.characterName(),
            characterIndex: summoner.characterIndex(),
            battlerName: ''
        };
    }

    // Everyone the party has lost, newest departure last (NPCSystemParty's
    // world-shared ledger). A revenant is called out of it by name, or the most
    // recent loss answers.
    function pastMembers() {
        const list = ($gameSystem && Array.isArray($gameSystem._npcPastPartyMembers))
            ? $gameSystem._npcPastPartyMembers : [];
        const here = new Set(realMembers().map(a => a.name()));
        return list.filter(e => e && e.name && !here.has(e.name));
    }

    function buildRevenantSpec(entry) {
        return {
            kindKey: 'revenant',                                    // i18n-ignore: internal tag
            kind: KINDS.revenant,
            source: 'revenant',                                     // i18n-ignore: internal tag
            name: entry.name,
            enemyId: 0,
            level: Math.max(1, entry.level || summonLevel()),
            // A revenant is not the sheet they died on, it is the memory of a
            // traveller: built straight off the reference and cut to share.
            params: applyConvokerBonus(balanceParams(referenceParams(), KINDS.revenant)),
            skillIds: [],
            classId: (entry.classId && $dataClasses[entry.classId]) ? entry.classId : 0,
            characterName: entry.characterName || '',
            characterIndex: entry.characterIndex || 0,
            battlerName: ''
        };
    }

    // ==================================================================
    // 5. SUMMONING AND DISMISSING
    // ==================================================================

    // A rite cast outside a fight is never refused for being outside one: it is
    // answered on the map instead, and what it calls walks with the party (see
    // section 5b). Only a fight has room for exactly one summon at a time.
    function canSummonNow() {
        if (!$gameParty) return false;
        if (!$gameParty.inBattle()) return true;
        if (active) {
            toast(T('Battle.summon.alreadyActive'), 'warning');
            return false;
        }
        // The proxy is somebody's real party slot in this save; never clobber it.
        if ($gameParty._actors.includes(summonActorId)) return false;
        return true;
    }

    async function beginSummon(spec) {
        if (!spec || !canSummonNow()) return false;
        // No fight to stand in: the thing walks with the party instead.
        if (!$gameParty.inBattle()) return beginMapSummon(spec);

        const summoner = resolveSummoner();
        // A summon that walked into the fight beside the party is already paid
        // for, in steps or in the bond of a familiar. It asks for nothing more
        // and it has no clock on it: only a blade takes it off the field.
        const upkeep = (!spec.mapBound && spec.kind && spec.kind.upkeep) ? spec.kind.upkeep : null;

        // The first turn is paid for up front, so a rite nobody can afford never
        // gets to act at all.
        if (upkeep && !canPay(summoner, upkeep)) {
            toast(T('Battle.summon.cannotAfford', { name: spec.name }), 'warning');
            return false;
        }

        const intMod = summoner ? (summoner.intMod ?? Math.floor(((summoner.mat || 10) - 10) / 2)) : 0;
        let rollRes = null;

        if (window.Dice3D) {
            rollRes = await window.Dice3D.rollD20({
                actionName: `Summoning: ${spec.name || 'Creature'}`,
                statName: 'INT',
                modifier: intMod,
                dc: 10,
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
                success: rawRoll === 20 || (rawRoll !== 1 && rawRoll + intMod >= 10)
            };
        }

        const hyperMax = hyperThreshold();
        let initialHyper = 0;
        let pendingUlt = false;

        if (rollRes.nat20) {
            // Natural 20 fills hyper bar at 100% immediately!
            initialHyper = hyperMax;
            pendingUlt = true;
        } else if (rollRes.success) {
            // Scale starting hyper charge with INT modifier
            const intBonus = Math.max(0, intMod * 0.05 + 0.1);
            initialHyper = Math.min(Math.round(hyperMax * 0.5), Math.round(hyperMax * intBonus));
        }

        active = Object.assign({}, spec, {
            summonerId: summoner ? summoner.actorId() : 0,
            upkeep,
            turnsLeft: spec.mapBound ? 0 : ((spec.kind && spec.kind.turns) || 0),
            turnsServed: 0,
            hyper: initialHyper,
            hyperMax: hyperMax
        });
        pendingLeave = null;
        pendingUltimate = pendingUlt;
        lastUpkeepFrame = -1;

        configureProxy(active);
        $gameParty.addActor(summonActorId);

        // A summon never benefits from the party's one-shot 1-HP save.
        const B = bse();
        if (B && B.Helpers && B.Helpers.useHealthProtection) {
            B.Helpers.useHealthProtection(summonActorId);
        }

        const proxy = actorProxy();
        if (proxy) {
            proxy.onBattleStart();
            proxy.clearActions();

            // Apply INT-based parameter buffs to the summoned creature
            const buffTurns = rollRes.nat20 ? 8 : Math.max(3, 4 + Math.max(0, intMod));
            if (rollRes.nat20) {
                // Critical bind: max double buffs
                proxy.addBuff(2, buffTurns); // ATK
                proxy.addBuff(2, buffTurns);
                proxy.addBuff(4, buffTurns); // MAT
                proxy.addBuff(4, buffTurns);
                proxy.addBuff(3, buffTurns); // DEF
                proxy.addBuff(5, buffTurns); // MDF
                proxy.addBuff(6, buffTurns); // AGI
            } else if (rollRes.success) {
                if (intMod >= 1 || rollRes.total >= 13) {
                    proxy.addBuff(2, buffTurns); // ATK
                    proxy.addBuff(4, buffTurns); // MAT
                }
                if (intMod >= 3 || rollRes.total >= 17) {
                    proxy.addBuff(3, buffTurns); // DEF
                    proxy.addBuff(5, buffTurns); // MDF
                }
                if (intMod >= 5) {
                    proxy.addBuff(6, buffTurns); // AGI
                }
            } else if (rollRes.nat1) {
                // Nat 1: Disrupted bind
                proxy.addDebuff(2, 3);
                proxy.addDebuff(4, 3);
            }

            if (proxy.canMove()) proxy.makeActions();
        }

        placeOnBattlefield(summoner);
        refreshMeter();
        rebuildBars();
        refreshBattle();

        toast(T('Battle.summon.summoned', { name: active.name }), 'info');
        if (rollRes.nat20) {
            toast(T('Battle.summon.perfectRitual', { name: active.name }), 'good');
        } else if (rollRes.success && intMod > 0) {
            toast(T('Battle.summon.empowered', { mod: intMod, name: active.name }), 'info');
        }
        if (spec.kind && spec.kind.announce) {
            toast(T('Battle.summon.' + spec.kind.announce, { name: active.name }), 'warning');
        }
        return true;
    }

    // Turn the proxy actor into whatever was called.
    function configureProxy(spec) {
        const actor = actorProxy();
        if (!actor) return;

        // Clean slate from the database first: the slot may still hold the last
        // thing that was summoned into it.
        actor.setup(summonActorId);
        actor.setName(spec.name);
        if (spec.classId) actor.changeClass(spec.classId, false);
        actor.changeLevel(Math.max(1, spec.level || 1), false);

        actor._skills = [];
        for (const id of (spec.skillIds || [])) actor.learnSkill(id);

        if (spec.characterName) actor.setCharacterImage(spec.characterName, spec.characterIndex || 0);
        actor._battlerName = spec.battlerName || '';
        actor._faceName = '';
        actor._faceIndex = 0;
        // A creature is portrayed by its own species - the procedural 3D model
        // of the enemy it is, falling back to that enemy's battler art - rather
        // than by whatever bust or custom model the slot last carried.
        if (actor.setVnBust) actor.setVnBust('');
        if (actor.setPortraitMode) actor.setPortraitMode('sprite');
        if (actor.setVnBattler) actor.setVnBattler(spec.battlerName || '');
        actor._recruitedEnemyId = spec.enemyId || 0;
        actor._recruitedLook = null;   // the look roll of whoever held the slot before goes with them

        actor.recoverAll();
        actor.clearActions();
    }

    // Send the summon away. `reasonKey` names the line the party reads; a
    // silent dismissal (the battle ending) passes none.
    function dismissSummon(reasonKey) {
        if (!active) return;
        const name = active.name;
        // A summon that walked in from the map goes back to walking with the
        // party when the fight simply ends (no reason given). Anything else -
        // a blade, a broken binding, an order to go - is a real departure and
        // takes it off the map with it.
        const wasMapBound = !!active.mapBound;
        active = null;              // unlocks removeActor and the param overrides
        pendingLeave = null;
        pendingUltimate = false;

        $gameParty.removeActor(summonActorId);

        // A queued turn belonging to something that is no longer on the field
        // would otherwise stall the round loop waiting for it to act.
        if (Array.isArray(BattleManager._battlers)) {
            BattleManager._battlers = BattleManager._battlers
                .filter(b => !(b && b.isActor && b.isActor() && b.actorId() === summonActorId));
        }

        releaseBattlefieldBody();
        removeHyperGauge();

        const actor = actorProxy();
        if (actor) {
            actor.clearActions();
            actor.setup(summonActorId);   // reset the proxy to its database state
        }

        if (wasMapBound && reasonKey) dismissMapSummon(null);
        refreshFollowers();

        rebuildBars();
        refreshBattle();
        if (reasonKey) toast(T('Battle.summon.' + reasonKey, { name }), 'warning');
    }

    // A summon never leaves in the middle of something. Both the round loop
    // (IndividualBattleTurns) and the tactical driver hold the acting battler by
    // its position in a queue and read that position again the instant the turn
    // hook returns, so pulling the summon out of the party from inside its own
    // turn hands them the wrong battler, or none at all. Every departure is
    // therefore written down here and carried out at the end of an action, where
    // nothing is in flight: the thing takes its last swing and then goes.
    function flushLeave() {
        if (!active || !pendingLeave) return;
        // A death that was healed away before the flush is not a departure.
        if (pendingLeave === 'slain') {                             // i18n-ignore: key fragment
            const actor = actorProxy();
            if (!actor || !actor.isDead()) {
                pendingLeave = null;
                return;
            }
        }
        dismissSummon(pendingLeave);
    }

    // ==================================================================
    // 5b. MAP SUMMONS: the rite answered outside a fight
    //
    // A rite cast from the skill menu calls the same creature it would call in
    // a fight, but there is no line for it to stand in, so it takes a body of
    // its own in the follower train (Game_SummonFollower, above) and walks with
    // the party exactly as a pet does. The two are separate slots and both walk
    // at once: a party can travel with its animal AND with something it called.
    //
    // The whole record is kept on $gameSystem, so what the party is walking
    // with survives a map change, a save and a load. When a fight starts it is
    // handed straight to beginSummon() and the thing the party has been
    // travelling with is the thing that fights beside them.
    // ==================================================================

    function refreshFollowers() {
        if ($gamePlayer && $gamePlayer.followers()) $gamePlayer.followers().refresh();
    }

    function mapSummon() {
        return ($gameSystem && $gameSystem._mapSummon) || null;
    }

    // A familiar is bound rather than rented: it is not counted down in steps,
    // and nothing but a death or an order sends it away.
    function isBoundKind(spec) {
        return !!spec && spec.kindKey === 'familiar';               // i18n-ignore: internal tag
    }

    // How far a rite carries. Every point of MP the caster paid buys the same
    // number of steps, floored so even a free rite is worth walking with and
    // capped so an enormous one is not effectively permanent. A rite an event
    // cast (an event pays nothing) gets the flat allowance instead.
    function riteSteps() {
        if ((Graphics.frameCount - riteFrame) > RITE_WINDOW) return MAP_STEPS_NO_RITE;
        return clamp(Math.round(riteCost * MAP_STEPS_PER_MP), MAP_STEPS_MIN, MAP_STEPS_MAX);
    }

    function beginMapSummon(spec) {
        // Everything that answers a rite carries a walking sprite (archetypePool
        // only ever deals creatures that have one), but a hand-written event can
        // still name something that does not, and an empty slot would follow the
        // party invisibly forever.
        if (!spec.characterName) {
            toast(T('Battle.summon.noBodyToWalk', { name: spec.name }), 'warning');
            return false;
        }
        const previous = mapSummon();
        if (previous) {
            $gameSystem._mapSummon = null;
            toast(T('Battle.summon.mapReplaced', { name: previous.spec.name }), 'warning');
        }

        const bound = isBoundKind(spec);
        const steps = bound ? 0 : riteSteps();
        // KINDS is code, not save data: only the key is written down, and the
        // kind itself is looked up again when the thing goes into a fight.
        const stored = Object.assign({}, spec);
        delete stored.kind;

        $gameSystem._mapSummon = {
            spec: stored,
            bound,
            petId: 0,
            stepsLeft: steps,
            stepsTotal: steps
        };
        refreshFollowers();
        toast(bound
            ? T('Battle.summon.mapBound', { name: spec.name })
            : T('Battle.summon.mapWalks', { name: spec.name, steps }), 'info');
        return true;
    }

    // Send away whatever is walking with the party. `reasonKey` names the line
    // they read; a silent dismissal (the summon stepping into a fight and dying
    // there, which has already been announced) passes none.
    function dismissMapSummon(reasonKey) {
        const record = mapSummon();
        if (!record) return false;
        const name = record.spec.name;
        $gameSystem._mapSummon = null;
        refreshFollowers();
        if (reasonKey) toast(T('Battle.summon.' + reasonKey, { name }), 'warning');
        return true;
    }

    // A familiar already has a record in the Followers page (it is an animal
    // somebody owns, not a spell they cast), so the two are tied together: the
    // Pets page puts the "send away" button on that row rather than listing the
    // same creature twice.
    function linkMapSummonPet(petId) {
        const record = mapSummon();
        if (record && petId) record.petId = petId;
    }

    // One step walked. Nothing is counted while the summon is in a fight: there
    // it is held by the battle, not by the road.
    function walkMapSummon() {
        const record = mapSummon();
        if (!record || record.bound || active) return;
        record.stepsLeft = Math.max(0, (record.stepsLeft || 0) - 1);
        if (record.stepsLeft <= 0) dismissMapSummon('mapExpired');  // i18n-ignore: key fragment
    }

    // The fight opens and what the party has been walking with joins it, at the
    // stature it was called with and owing nothing further.
    function joinBattleFromMap() {
        const record = mapSummon();
        if (!record || active) return;
        const spec = Object.assign({}, record.spec);
        spec.kind = KINDS[spec.kindKey] || null;
        spec.mapBound = true;
        beginSummon(spec);
    }

    // ==================================================================
    // 6. UPKEEP: the conditions that hold a summon on the field
    // ==================================================================

    function oilShares() {
        const market = $gameSystem && $gameSystem.stockMarket;
        if (market && market.getOilShares) return market.getOilShares();
        return $gameVariables ? Math.max(0, Number($gameVariables.value(51)) || 0) : 0;
    }

    function soulShares() {
        const market = $gameSystem && $gameSystem.stockMarket;
        if (market && market.getSoulsShares) return market.getSoulsShares();
        return $gameVariables ? Math.max(0, Number($gameVariables.value(52)) || 0) : 0;
    }

    // Variables 51 and 52 are the holdings' public face and the market re-syncs
    // from them, so burning is a write to the variable and nothing else.
    function burnShares(varId, held, amount) {
        const left = Math.max(0, held - amount);
        if ($gameVariables) $gameVariables.setValue(varId, left);
        return left;
    }

    function upkeepCost(summoner, upkeep) {
        switch (upkeep.type) {
            case 'hp':                                              // i18n-ignore: internal tag
                return Math.max(upkeep.min || 1,
                    Math.floor((summoner ? summoner.mhp : 100) * upkeep.amount));
            case 'mp':                                              // i18n-ignore: internal tag
                return Math.max(upkeep.min || 1,
                    Math.floor((summoner ? summoner.mmp : 50) * upkeep.amount));
            case 'ap':                                              // i18n-ignore: internal tag
                return Math.max(upkeep.min || 1,
                    Math.floor((summoner ? summoner.maxTp() : 100) * upkeep.amount));
            default:
                return upkeep.amount;
        }
    }

    function canPay(summoner, upkeep) {
        const cost = upkeepCost(summoner, upkeep);
        switch (upkeep.type) {
            case 'hp':                                              // i18n-ignore: internal tag
                return !!summoner && summoner.hp > cost;
            case 'mp':                                              // i18n-ignore: internal tag
                return !!summoner && summoner.mp >= cost;
            case 'ap':                                              // i18n-ignore: internal tag
                return !!summoner && summoner.tp >= cost;
            case 'gold':                                            // i18n-ignore: internal tag
                return $gameParty.gold() >= cost;
            case 'oil':                                             // i18n-ignore: internal tag
                return oilShares() >= cost;
            case 'soul':                                            // i18n-ignore: internal tag
                return soulShares() >= cost;
        }
        return true;
    }

    // What is left of the resource after paying, for the line the party reads.
    function payOnce(summoner, upkeep) {
        const cost = upkeepCost(summoner, upkeep);
        switch (upkeep.type) {
            case 'hp':                                              // i18n-ignore: internal tag
                summoner.gainHp(-cost);
                return { cost, left: summoner.hp };
            case 'mp':                                              // i18n-ignore: internal tag
                summoner.gainMp(-cost);
                return { cost, left: summoner.mp };
            case 'ap':                                              // i18n-ignore: internal tag
                summoner.gainTp(-cost);
                return { cost, left: summoner.tp };
            case 'gold':                                            // i18n-ignore: internal tag
                $gameParty.loseGold(cost);
                return { cost, left: $gameParty.gold() };
            case 'oil':                                             // i18n-ignore: internal tag
                return { cost, left: burnShares(51, oilShares(), cost) };
            case 'soul':                                            // i18n-ignore: internal tag
                return { cost, left: burnShares(52, soulShares(), cost) };
        }
        return { cost: 0, left: 0 };
    }

    // The petrodemon's barrels are written straight onto its bar, so the party
    // can watch the holding drain rather than being told about it afterwards.
    function refreshMeter() {
        if (!active || !active.kind || !active.kind.meter) return;
        const actor = actorProxy();
        if (!actor) return;
        actor.setName(T('Battle.summon.meterName', {
            name: active.name,
            n: oilShares()
        }));
    }

    // One turn's upkeep. Called from the summon's own turn hook, so it runs once
    // per round in the ordinary battle scene, in the ITB round loop and in the
    // tactical map battles alike.
    function payUpkeep() {
        if (!active) return;
        if (Graphics.frameCount === lastUpkeepFrame) return;   // one payment per frame
        lastUpkeepFrame = Graphics.frameCount;
        active.turnsServed += 1;

        if (!active.upkeep) {
            if (active.turnsLeft > 0 && --active.turnsLeft <= 0) {
                pendingLeave = 'expired';                                                  // i18n-ignore: key fragment
            }
            return;
        }

        const summoner = active.summonerId ? $gameActors.actor(active.summonerId) : null;
        const drawsOnSummoner = active.upkeep.type === 'hp' || active.upkeep.type === 'mp' ||
            active.upkeep.type === 'ap';
        if (drawsOnSummoner && (!summoner || summoner.isDead() ||
            !$gameParty.members().includes(summoner))) {
            pendingLeave = 'summonerLost';                                                 // i18n-ignore: key fragment
            return;
        }

        if (!canPay(summoner, active.upkeep)) {
            // Blood is taken to the last drop but never past it: a summoner who
            // runs out is left standing, and the thing they were holding leaves.
            if (active.upkeep.type === 'hp' && summoner && summoner.hp > 1) summoner.setHp(1);
            pendingLeave = 'upkeepFailed';                                                 // i18n-ignore: key fragment
            return;
        }

        const paid = payOnce(summoner, active.upkeep);
        refreshMeter();
        toast(T('Battle.summon.upkeep.' + active.upkeep.type, {
            name: active.name,
            cost: paid.cost,
            left: paid.left
        }), 'info');
    }

    // ==================================================================
    // 7. THE HYPER GAUGE AND THE ULTIMATE
    // ==================================================================

    // What one ultimate costs in damage dealt. Read off the troop actually on
    // the field, so a long fight against something enormous pays out roughly as
    // often as a short one against a pack.
    function hyperThreshold() {
        let total = 0;
        if ($gameTroop) {
            for (const enemy of $gameTroop.members()) {
                if (enemy) total += enemy.mhp;
            }
        }
        return Math.max(HYPER_MIN, Math.round(total * HYPER_TROOP_SHARE));
    }

    function hyperRate() {
        if (!active || !active.hyperMax) return 0;
        return clamp(active.hyper / active.hyperMax, 0, 1);
    }

    function addHyperCharge(amount) {
        if (!active || pendingUltimate || !(amount > 0)) return;
        const cap = Math.round(active.hyperMax * HYPER_HIT_CAP);
        active.hyper = Math.min(active.hyperMax, active.hyper + Math.min(amount, cap));
        if (active.hyper >= active.hyperMax) pendingUltimate = true;
    }

    // Which ultimate a rite pays out: its own figure, at the bracket the party
    // has reached. Ten levels to a bracket, nine brackets over a full career.
    // A summon bound to one person (a familiar) is bracketed by THAT person's
    // level instead, which is the only level it has ever answered to.
    function ultimateTier() {
        const level = (active && active.tierLevel) || partyMedianLevel();
        return clamp(Math.floor((level - 1) / 10), 0, 9);
    }

    function ultimateName(kindKey, tier) {
        return T('Battle.summon.ultimate.title', {
            rank: T('Battle.summon.ultimate.rank.' + tier),
            art: T('Battle.summon.ultimate.art.' + kindKey)
        });
    }

    // A bracket decides three things: how hard the figure lands, whether it
    // opens on one target or on the whole line (from bracket 3 up), and whether
    // the kind's own signature comes with it (from bracket 5 up).
    function ultimateShape(kind, tier) {
        const ult = (kind && kind.ult) || {};
        return {
            anim: ult.anim || 0,
            element: ult.element || 1,
            hitsAll: ult.scope === 'all' ? tier >= 1 : tier >= 3,
            bonus: tier >= 5 ? (ult.bonus || 'none') : 'none',      // i18n-ignore: internal tag
            power: (ult.power || 1) * (1 + tier * 0.22),
            uncapped: !!ult.uncapped
        };
    }

    function ultimateDamage(caster, target, shape) {
        const raw = (caster.atk * 1.1 + caster.mat * 1.4) * 2.2 * shape.power;
        const soak = target.def * 0.6 + target.mdf * 0.6;
        const rate = target.elementRate ? target.elementRate(shape.element) : 1;
        let damage = Math.round(Math.max(raw * 0.25, raw - soak) * rate);
        if (!shape.uncapped) {
            // Always a large hit, never a delete button: the cap widens with the
            // bracket but a target's own maximum is what it is measured against,
            // so an ultimate cannot trivialise something far above the party.
            const tier = ultimateTier();
            const ceiling = target.mhp * ((shape.hitsAll ? 0.16 : 0.28) + tier * (shape.hitsAll ? 0.03 : 0.045));
            damage = Math.min(damage, Math.round(ceiling));
            damage = Math.max(damage, Math.round(target.mhp * 0.04));
        }
        return Math.max(1, damage);
    }

    function applyUltimateDamage(target, damage) {
        target.clearResult();
        target._result.hpDamage = damage;
        target._result.hpAffected = true;
        target.gainHp(-damage);
        if (target.startDamagePopup) target.startDamagePopup();
        if (target.performDamage) target.performDamage();
        if (target.isDead() && target.performCollapse) target.performCollapse();
    }

    // The signature a rite adds once the party is deep enough in: what the
    // ultimate leaves behind besides a hole in the enemy line.
    function applyUltimateBonus(bonus, caster, dealt) {
        const party = realMembers().filter(a => a.isAlive());
        switch (bonus) {
            case 'heal': {                                          // i18n-ignore: internal tag
                for (const member of party) member.gainHp(Math.round(member.mhp * 0.2));
                break;
            }
            case 'mana': {                                          // i18n-ignore: internal tag
                for (const member of party) member.gainMp(Math.round(member.mmp * 0.25));
                break;
            }
            case 'drain': {                                         // i18n-ignore: internal tag
                if (caster) caster.gainHp(Math.round(dealt * 0.25));
                break;
            }
            case 'purge': {                                         // i18n-ignore: internal tag
                for (const member of party) {
                    for (const state of member.states().slice()) {
                        if (state && state.id !== member.deathStateId()) member.removeState(state.id);
                    }
                }
                break;
            }
            case 'purse': {                                         // i18n-ignore: internal tag
                $gameParty.gainGold(Math.max(50, Math.round(dealt * 0.5)));
                break;
            }
        }
    }

    // The gauge is full: the summon takes its figure. Fired at the end of an
    // action for the same reason a departure is, so nothing is in flight when
    // the enemy line suddenly changes shape.
    function flushUltimate() {
        if (!active || !pendingUltimate) return;
        pendingUltimate = false;
        active.hyper = 0;

        const caster = actorProxy();
        if (!caster || caster.isDead()) return;
        const living = $gameTroop ? $gameTroop.members().filter(e => e && e.isAlive()) : [];
        if (!living.length) return;

        const tier = ultimateTier();
        const shape = ultimateShape(active.kind, tier);
        const targets = shape.hitsAll
            ? living
            : [living.slice().sort((a, b) => b.hp - a.hp)[0]];

        if (shape.anim && $dataAnimations && $dataAnimations[shape.anim] && $gameTemp) {
            $gameTemp.requestAnimation(targets, shape.anim);
        }

        let dealt = 0;
        for (const target of targets) {
            const damage = ultimateDamage(caster, target, shape);
            applyUltimateDamage(target, damage);
            dealt += damage;
        }
        applyUltimateBonus(shape.bonus, caster, dealt);

        toast(T('Battle.summon.hyper.unleash', {
            name: active.name,
            art: ultimateName(active.kindKey, tier)
        }), 'warning');

        refreshBattle();
    }

    // Every point of damage the party lands on the enemy while the summon is
    // out feeds the gauge. The summon's own ultimate does not go through
    // Game_Action, so it can never pay for itself.
    const _Game_Action_executeHpDamage = Game_Action.prototype.executeHpDamage;
    Game_Action.prototype.executeHpDamage = function (target, value) {
        _Game_Action_executeHpDamage.call(this, target, value);
        if (active && value > 0 && target && target.isEnemy && target.isEnemy()) {
            addHyperCharge(value);
        }
    };

    // ------------------------------------------------------------------
    // The bar itself, across the top centre of the screen. It is drawn by the
    // plugin rather than by the battle HUD because it belongs to the summon and
    // has to survive both the battle scene and the tactical map battles, where
    // the HUD's own party cards are not what is on screen.
    // ------------------------------------------------------------------
    const GAUGE_W = 420;
    const GAUGE_H = 34;
    const GAUGE_TOP = 8;

    function Sprite_HyperGauge() {
        this.initialize.apply(this, arguments);
    }
    Sprite_HyperGauge.prototype = Object.create(Sprite.prototype);
    Sprite_HyperGauge.prototype.constructor = Sprite_HyperGauge;

    Sprite_HyperGauge.prototype.initialize = function () {
        Sprite.prototype.initialize.call(this);
        this.bitmap = new Bitmap(GAUGE_W, GAUGE_H);
        this.x = Math.round((Graphics.width - GAUGE_W) / 2);
        this.y = GAUGE_TOP;
        this._drawnRate = -1;
        this._drawnReady = null;
        this._pulse = 0;
        this.refresh(0, false);
    };

    Sprite_HyperGauge.prototype.update = function () {
        Sprite.prototype.update.call(this);
        const rate = hyperRate();
        const ready = rate >= 1;
        if (Math.abs(rate - this._drawnRate) > 0.004 || ready !== this._drawnReady) {
            this.refresh(rate, ready);
        }
        // Full and waiting to fire: the bar breathes so it is read as a state
        // rather than as a bar that simply stopped moving.
        this._pulse = ready ? (this._pulse + 0.08) : 0;
        this.opacity = ready ? 200 + Math.round(55 * Math.sin(this._pulse)) : 255;
    };

    Sprite_HyperGauge.prototype.refresh = function (rate, ready) {
        this._drawnRate = rate;
        this._drawnReady = ready;
        const b = this.bitmap;
        b.clear();
        b.paintOpacity = 170;
        b.fillRect(0, 0, GAUGE_W, GAUGE_H, '#0a0a12');
        b.paintOpacity = 255;
        b.fillRect(0, 0, GAUGE_W, 1, '#5c5c78');
        b.fillRect(0, GAUGE_H - 1, GAUGE_W, 1, '#5c5c78');

        const barX = 82;
        const barY = 9;
        const barW = GAUGE_W - barX - 66;
        const barH = GAUGE_H - 18;
        b.fillRect(barX, barY, barW, barH, '#1b1b2c');
        const filled = Math.round(barW * clamp(rate, 0, 1));
        if (filled > 0) {
            const from = ready ? '#ffe66d' : '#2f7bd6';
            const to = ready ? '#ff8a3d' : '#63e2ff';
            b.gradientFillRect(barX, barY, filled, barH, from, to);
        }

        b.fontFace = $gameSystem ? $gameSystem.mainFontFace() : 'sans-serif';
        b.fontSize = 16;
        b.outlineWidth = 3;
        b.outlineColor = '#000000';
        b.textColor = ready ? '#ffe66d' : '#c8d4ff';
        b.drawText(T('Battle.summon.hyper.label'), 10, 0, barX - 14, GAUGE_H, 'left');
        b.fontSize = 14;
        b.textColor = '#ffffff';
        const right = ready
            ? T('Battle.summon.hyper.ready')
            : Math.floor(clamp(rate, 0, 1) * 100) + '%';
        b.drawText(right, barX + barW + 6, 0, GAUGE_W - barX - barW - 12, GAUGE_H, 'right');
    };

    function ensureHyperGauge() {
        const scene = SceneManager._scene;
        if (!scene || !scene.addChild) return;
        if (gauge && gauge.parent === scene) return;
        removeHyperGauge();
        gauge = new Sprite_HyperGauge();
        scene.addChild(gauge);
    }

    function removeHyperGauge() {
        if (!gauge) return;
        if (gauge.parent) gauge.parent.removeChild(gauge);
        if (gauge.destroy) gauge.destroy();
        gauge = null;
    }

    // Both scenes a summon can be standing in call this every frame: it puts
    // the bar up while something is summoned and takes it down when nothing is.
    function updateHyperGauge() {
        if (active) ensureHyperGauge();
        else if (gauge) removeHyperGauge();
    }

    // ==================================================================
    // 8. THE BODY ON THE FIELD
    // ==================================================================

    function rebuildBars() {
        const scene = SceneManager._scene;
        if (scene instanceof Scene_Battle &&
            scene._spriteset &&
            typeof scene.removeBattleHealthBars === 'function' &&
            typeof scene.createBattleHealthBars === 'function') {
            scene.removeBattleHealthBars();
            scene.createBattleHealthBars();
        }
        const M = mbm();
        if (M && M._refreshHpBars) M._refreshHpBars();
    }

    function refreshBattle() {
        if (!$gameParty || !$gameParty.inBattle()) return;
        if (typeof BattleManager.refreshStatus === 'function') BattleManager.refreshStatus();
        $gameTemp.requestBattleRefresh();
    }

    // In a tactical map battle the summon is a real body standing on a tile: the
    // 4th place in the follower train. Put it down next to whoever called it,
    // solid like every other combatant, and let MapBattleMode's own teardown
    // hand it back (it restores the through flag of everything it listed).
    function placeOnBattlefield(summoner) {
        const M = mbm();
        if (!M) return;
        if ($gamePlayer && $gamePlayer.followers()) $gamePlayer.followers().refresh();

        const body = M.mapCharacterFor ? M.mapCharacterFor(actorProxy()) : null;
        if (!body) return;

        const anchor = (summoner && M.mapCharacterFor && M.mapCharacterFor(summoner)) || $gamePlayer;
        const taken = (M._battlerCharacters ? M._battlerCharacters() : [])
            .map(c => ({ x: c.x, y: c.y }));
        const spot = (M._flankTiles ? M._flankTiles(anchor, 1, taken) : [])[0];

        if (body instanceof Game_Follower) {
            // Followers walk through walls outside a fight; as a combatant it has
            // to be as solid as everyone else. MapBattleMode puts it back at the
            // end of the fight, and releaseBattlefieldBody() does it sooner when
            // the summon leaves before the fight does.
            heldBody = { follower: body, through: body.isThrough() };
            if (Array.isArray(M._followerThrough)) M._followerThrough.push(heldBody);
            body.setThrough(false);
        }
        if (spot) {
            body.locate(spot.x, spot.y);
            if (M._syncSwimState) M._syncSwimState(body);
        }
    }

    // Hand the tile back. A follower slot with nobody in it is invisible but
    // still blocks the tile it is standing on while it is solid, so a summon
    // that leaves mid-fight must not leave a hole in the battlefield behind it.
    function releaseBattlefieldBody() {
        if (!heldBody) return;
        heldBody.follower.setThrough(heldBody.through);
        const M = window.MapBattleMode;
        if (M && Array.isArray(M._followerThrough)) {
            const i = M._followerThrough.indexOf(heldBody);
            if (i >= 0) M._followerThrough.splice(i, 1);
        }
        heldBody = null;
    }

    // ==================================================================
    // 9. GAME OBJECT OVERRIDES (live only while a summon is on the field)
    // ==================================================================

    function isSummonBattler(battler) {
        return !!active && !!battler && battler.isActor && battler.isActor() &&
            battler.actorId() === summonActorId;
    }

    // A summon's stature is the thing it was called from, cut to this fight,
    // not the proxy's class curve. A pet with no creature behind it keeps the
    // curve and is skipped.
    const _Game_Actor_paramBase = Game_Actor.prototype.paramBase;
    Game_Actor.prototype.paramBase = function (paramId) {
        if (isSummonBattler(this) && active.params) {
            const value = active.params[paramId];
            if (Number.isFinite(value)) return value;
        }
        return _Game_Actor_paramBase.call(this, paramId);
    };

    // Always CPU-driven: nobody holds a controller for a summon, in the battle
    // scene or on the tactical map. isAutoBattle() also makes canInput() false,
    // so it is skipped by every input step.
    const _Game_Actor_isAutoBattle = Game_Actor.prototype.isAutoBattle;
    Game_Actor.prototype.isAutoBattle = function () {
        if (isSummonBattler(this)) return true;
        return _Game_Actor_isAutoBattle.call(this);
    };

    // One turn of upkeep, taken on the summon's own turn. This is the one hook
    // every turn driver in the project agrees on.
    const _Game_Battler_onTurnEnd = Game_Battler.prototype.onTurnEnd;
    Game_Battler.prototype.onTurnEnd = function () {
        _Game_Battler_onTurnEnd.call(this);
        if (isSummonBattler(this)) payUpkeep();
    };

    // Death is final for a summon: it leaves the fight and cannot be revived.
    const _Game_Actor_die = Game_Actor.prototype.die;
    Game_Actor.prototype.die = function () {
        _Game_Actor_die.call(this);
        if (isSummonBattler(this)) pendingLeave = 'slain';           // i18n-ignore: key fragment
    };

    // Nothing but this plugin may drop the summon out of the party.
    const _Game_Party_removeActor = Game_Party.prototype.removeActor;
    Game_Party.prototype.removeActor = function (actorId) {
        if (active && actorId === summonActorId) return;
        _Game_Party_removeActor.call(this, actorId);
    };

    // ==================================================================
    // 10. BATTLE HOOKS
    // ==================================================================

    const _BattleManager_endAction = BattleManager.endAction;
    BattleManager.endAction = function () {
        _BattleManager_endAction.call(this);
        flushUltimate();
        flushLeave();
    };

    const _BattleManager_endTurn = BattleManager.endTurn;
    BattleManager.endTurn = function () {
        _BattleManager_endTurn.call(this);
        flushUltimate();
        flushLeave();
    };

    // What a rite cost, remembered for the moment. A skill used from the menu
    // reserves its common event and that event runs a few frames later on the
    // map, so by the time the summon command fires there is nothing left to
    // read the cost off: it is written down here, where the action still knows
    // both the skill and who paid for it.
    const _Game_Action_applyGlobal = Game_Action.prototype.applyGlobal;
    Game_Action.prototype.applyGlobal = function () {
        const item = this.item();
        const subject = this.subject();
        if (item && DataManager.isSkill(item) && subject && subject.isActor && subject.isActor()) {
            riteCost = subject.skillMpCost ? subject.skillMpCost(item) : (item.mpCost || 0);
            riteActorId = subject.actorId();
            riteFrame = Graphics.frameCount;
        }
        _Game_Action_applyGlobal.call(this);
    };

    // The trailing slot the summon walks in, appended to the follower chain the
    // same way PetFollowerSystem.js appends the pet's. They are two slots and
    // the party keeps both: the animal it owns and the thing it called.
    Game_Followers.prototype.ensureSummonFollower = function () {
        if (!this._data) this._data = [];
        if (this._data.some(f => f instanceof Game_SummonFollower)) return;
        const slot = new Game_SummonFollower(this._data.length);
        // Snap to the player so a slot created mid-map (an old save that
        // predates it) does not flash at the map corner on its way over.
        // $dataMap is null while DataManager builds the game objects, and
        // locate() reads its width, so that pass is left to the map setup.
        if (typeof $dataMap !== 'undefined' && $dataMap &&
            typeof $gamePlayer !== 'undefined' && $gamePlayer && $gamePlayer.locate) {
            slot.locate($gamePlayer.x, $gamePlayer.y);
        }
        this._data.push(slot);
    };

    const _Game_Followers_setup = Game_Followers.prototype.setup;
    Game_Followers.prototype.setup = function () {
        _Game_Followers_setup.call(this);
        this.ensureSummonFollower();
    };

    // The slot has to be in _data before the spriteset builds its follower
    // sprites, so a save made before this existed still gets one.
    const _Spriteset_Map_createCharacters = Spriteset_Map.prototype.createCharacters;
    Spriteset_Map.prototype.createCharacters = function () {
        if ($gamePlayer && $gamePlayer.followers()) {
            $gamePlayer.followers().ensureSummonFollower();
        }
        _Spriteset_Map_createCharacters.call(this);
    };

    // The road is what pays for a summon outside a fight.
    const _Game_Player_increaseSteps = Game_Player.prototype.increaseSteps;
    Game_Player.prototype.increaseSteps = function () {
        _Game_Player_increaseSteps.call(this);
        walkMapSummon();
    };

    // A fight opens: whatever the party is walking with steps into it. This is
    // the one call both the battle scene and the tactical map battles make.
    const _Game_Party_onBattleStart = Game_Party.prototype.onBattleStart;
    Game_Party.prototype.onBattleStart = function (advantage) {
        _Game_Party_onBattleStart.call(this, advantage);
        joinBattleFromMap();
    };

    const _BattleManager_endBattle = BattleManager.endBattle;
    BattleManager.endBattle = function (result) {
        if (active) dismissSummon(null);
        _BattleManager_endBattle.call(this, result);
    };

    // The tactical map battles never push Scene_Battle, so they run their own
    // teardown; this is the one call both paths make. Dismissal is idempotent.
    const _Game_Party_onBattleEnd = Game_Party.prototype.onBattleEnd;
    Game_Party.prototype.onBattleEnd = function () {
        if (active) dismissSummon(null);
        _Game_Party_onBattleEnd.call(this);
    };

    // The gauge is put up and taken down from the two scenes a fight can be
    // running in, so it survives a summon called in either of them.
    const _Scene_Battle_update = Scene_Battle.prototype.update;
    Scene_Battle.prototype.update = function () {
        _Scene_Battle_update.call(this);
        updateHyperGauge();
    };

    const _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function () {
        _Scene_Map_update.call(this);
        updateHyperGauge();
    };

    // The BATTLE summon is battle-only, always: a save can never hold one and a
    // load never restores one. The map summon is the opposite and lives on
    // $gameSystem, so a loaded save resumes walking with whatever it was
    // walking with; the follower train is refreshed once the map is up.
    const _Game_System_onAfterLoad = Game_System.prototype.onAfterLoad;
    Game_System.prototype.onAfterLoad = function () {
        _Game_System_onAfterLoad.call(this);
        active = null;
        pendingLeave = null;
        pendingUltimate = false;
        heldBody = null;
        gauge = null;
        lastUpkeepFrame = -1;
    };

    // ==================================================================
    // 11. PLUGIN COMMANDS
    // ==================================================================

    // A rite that names a creature calls that one; a rite that names nothing
    // rolls inside its own archetypes.
    function summonByKind(kindKey, enemyId) {
        const kind = KINDS[kindKey];
        if (!kind) {
            toast(T('Battle.summon.unknownKind'), 'warning');
            return;
        }
        if (!canSummonNow()) return;
        let enemy = Number(enemyId) > 0 ? $dataEnemies[Number(enemyId)] : null;
        if (!enemy) enemy = pickFromPool(kind);
        if (!enemy) {
            toast(T('Battle.summon.nothingAnswers'), 'warning');
            return;
        }
        const spec = buildEnemySpec(kindKey, enemy);
        spec.kind = kind;
        beginSummon(spec);
    }

    // The rites that are not simply "roll inside an archetype list". They are
    // named functions rather than command bodies because the Convokation skills
    // reach them through a common event's script line (window.SummonSystem.*),
    // which is how a skill casts one without knowing a plugin command's name.

    // The familiar Em was handed at the start of story mode, dressed as a
    // familiar rather than as a pet: the beast the player picked, standing at
    // her own level. Returns null for anyone else, on any other run, or when
    // nothing was picked, and the ordinary class roll takes over.
    function storyModeFamiliarFor(summoner) {
        const CP = window.CharacterPresets;
        if (!summoner || !CP || !CP.isEmPlaythrough || !CP.isEmPlaythrough()) return null;
        if (summoner.name() !== 'Em') return null;                  // i18n-ignore: proper name
        const pets = window.PetSystem;
        const chosenId = $gameSystem && $gameSystem._partyPet ? $gameSystem._partyPet.id : null;
        const pet = pets ? (pets.getPet(chosenId) || pets.getActivePet()) : null;
        if (!pet) return null;
        const spec = buildPetSpec(pet);
        if (!spec) return null;
        spec.kindKey = 'familiar';                                  // i18n-ignore: internal tag
        spec.kind = KINDS.familiar;
        spec.familiarOf = summoner.actorId();
        spec.level = Math.max(1, summoner.level);
        spec.tierLevel = Math.max(1, summoner.level);
        if (spec.params) {
            const ownParams = [];
            for (let i = 0; i < 8; i++) ownParams.push(summoner.param(i));
            spec.params = applyConvokerBonus(balanceParams(spec.params, KINDS.familiar, { ref: ownParams, bias: 1 }));
        }
        linkMapSummonPet(pet.id);
        return spec;
    }

    // The familiar answers whoever is taking this turn, and nobody else: which
    // creature it is comes off their class, what it is called comes off their
    // name, and how strong it is comes off their level. The first call writes
    // it into the Followers page for good.
    function summonFamiliar() {
        if (!canSummonNow()) return;
        const summoner = resolveSummoner();
        if (!summoner) {
            toast(T('Battle.summon.noSummoner'), 'warning');
            return;
        }
        // Story mode is played as Em, and story mode asks her which creature
        // answers to her before the game starts (the Familiar tab of character
        // creation). When she is the one casting, that is the creature that
        // comes: the class roll below is for everybody else.
        const chosen = storyModeFamiliarFor(summoner);
        if (chosen) {
            beginSummon(chosen);
            return;
        }
        const spec = buildFamiliarSpec(summoner);
        if (!spec) {
            // No creature in their class's list has a body to stand in the line.
            summonByKind('familiar', 0);
            return;
        }
        if (beginSummon(spec)) registerFamiliarPet(summoner, spec);
    }

    // Whatever answers, answers. The rites that are not balanced against
    // anything are kept out of the roll: they are asked for on purpose or not
    // at all.
    function summonRandomKind() {
        const keys = Object.keys(KINDS).filter(k => KINDS[k].archetypes && KINDS[k].balance !== false);
        summonByKind(keys[Math.floor(Math.random() * keys.length)], 0);
    }

    function summonMarkedEnemy(enemyId) {
        const id = Number(enemyId) || marks().enemyId || 0;
        summonByKind('enemy', id);
    }

    function summonLastSlain() {
        const id = $gameSystem && $gameSystem._lastSlainEnemyId;
        if (!id || !$dataEnemies[id]) {
            toast(T('Battle.summon.noneSlain'), 'warning');
            return;
        }
        summonByKind('lastSlain', id);
    }

    // The leash comes off: whatever is following the party fights beside it.
    function summonPetOrBeast(petId) {
        if (!canSummonNow()) return;
        const pets = window.PetSystem;
        const pet = pets ? (petId ? pets.getPet(Number(petId)) : pets.getActivePet()) : null;
        if (pet) {
            const spec = buildPetSpec(pet);
            spec.kind = KINDS.beast;
            beginSummon(spec);
            return;
        }
        // Nobody on the leash: the wild answers instead.
        summonByKind('beast', 0);
    }

    // A marked person, called to where the party is standing.
    function summonMarkedNpc(npcName) {
        if (!canSummonNow()) return;
        const wanted = String(npcName || '').trim();
        const list = marks().npcs;
        const mark = wanted
            ? list.find(m => m && m.name === wanted)
            : list[list.length - 1];
        if (!mark) {
            toast(T('Battle.summon.noMark'), 'warning');
            return;
        }
        const registry = window.NPCSocietyRegistry;
        const profile = registry &&
            (registry.getProfile(mark.name) ||
             (registry.ensureProfile ? registry.ensureProfile(mark.name, null) : null));
        if (!profile) {
            toast(T('Battle.summon.noMark'), 'warning');
            return;
        }
        beginSummon(buildNpcSpec(mark, profile));
    }

    // A copy of whoever is casting, and never a better one.
    function summonReflection() {
        if (!canSummonNow()) return;
        const summoner = resolveSummoner();
        if (!summoner) {
            toast(T('Battle.summon.noSummoner'), 'warning');
            return;
        }
        beginSummon(buildMirrorSpec(summoner));
    }

    // Somebody the party has already buried, or dismissed, or left behind.
    function summonRevenant(memberName) {
        if (!canSummonNow()) return;
        const wanted = String(memberName || '').trim();
        const list = pastMembers();
        const entry = wanted
            ? list.find(e => e.name === wanted)
            : list[list.length - 1];
        if (!entry) {
            toast(T('Battle.summon.noRevenant'), 'warning');
            return;
        }
        beginSummon(buildRevenantSpec(entry));
    }

    // Sending a summon away, wherever it happens to be standing. In a fight
    // that is the battle line; on the road it is the follower train; a summon
    // that walked into a fight is both at once and leaves both.
    function dismissAnySummon() {
        if (active) {
            dismissSummon('dismissed');                             // i18n-ignore: key fragment
            return true;
        }
        return dismissMapSummon('dismissed');                       // i18n-ignore: key fragment
    }

    function register(name, fn) {
        PluginManager.registerCommand(pluginName, name, fn);
    }

    // Every rite that simply rolls inside its own archetypes, wired the same way.
    // i18n-ignore-start: plugin command names and internal kind keys
    const ARCHETYPE_COMMANDS = {
        summonDemon: 'demon',
        summonUndead: 'undead',
        summonElemental: 'elemental',
        summonCelestial: 'celestial',
        summonConstruct: 'construct',
        summonMecha: 'mecha',
        summonSwarm: 'swarm',
        summonAquatic: 'aquatic',
        summonAvian: 'avian',
        summonSerpent: 'serpent',
        summonVerdant: 'verdant',
        summonFae: 'fae',
        summonSpirit: 'spirit',
        summonShadow: 'shadow',
        summonVoid: 'void',
        summonDragon: 'dragon',
        summonTitan: 'titan',
        summonKnight: 'knight',
        summonRabble: 'rabble',
        summonMimic: 'mimic',
        summonElder: 'elder'
    };
    // i18n-ignore-end
    for (const [command, kindKey] of Object.entries(ARCHETYPE_COMMANDS)) {
        register(command, args => summonByKind(kindKey, args && args.enemyId));
    }

    register('summonPetrodemon', () => summonByKind('petro', 0));
    register('addSoftSummon', () => summonFamiliar());
    register('summonRandom', () => summonRandomKind());
    register('summonEnemy', args => summonMarkedEnemy(args && args.enemyId));
    register('summonLastSlain', () => summonLastSlain());
    register('summonBeast', args => summonPetOrBeast(args && args.petId));
    register('summonNpc', args => summonMarkedNpc(args && args.npcName));
    register('summonMirror', () => summonReflection());
    register('summonRevenant', args => summonRevenant(args && args.memberName));

    // Any rite at all, named by an event that picks its own.
    register('summonKind', args => {
        const key = String((args && args.kindKey) || '').trim();
        summonByKind(key, args && args.enemyId);
    });

    register('markNpc', () => markNpc());
    register('markEnemy', args => markEnemy(args && args.enemyId));
    register('dismissSummon', () => dismissAnySummon());            // i18n-ignore: none

    // v2 events call this with a bare enemy id. An event that names none (the
    // ConvokeRite common event does not) used to be answered with enemy 1 every
    // single time; with no id the rite now rolls, like every other one.
    register('startSummon', args => summonByKind('enemy', Number((args && args.enemyId) || 0)));

    // ==================================================================
    // 12. PUBLIC API
    // ==================================================================

    window.SummonSystem = {
        // The proxy slot, so the roster ledger and anything else that watches
        // the party can tell a summon from a companion.
        proxyActorId: summonActorId,
        isProxyActor(actorId) { return Number(actorId) === summonActorId; },
        isActive() { return !!active; },
        current() { return active ? Object.assign({}, active) : null; },
        kinds() { return Object.keys(KINDS); },
        summon(kindKey, enemyId) { summonByKind(kindKey, enemyId); },
        // The rites that are not a straight roll inside an archetype list. The
        // Convokation skills reach these through their common event's script
        // line, so a skill can cast one without naming a plugin command.
        familiar() { summonFamiliar(); },
        random() { summonRandomKind(); },
        beast(petId) { summonPetOrBeast(petId); },
        enemy(enemyId) { summonMarkedEnemy(enemyId); },
        lastSlain() { summonLastSlain(); },
        npc(name) { summonMarkedNpc(name); },
        reflection() { summonReflection(); },
        revenant(name) { summonRevenant(name); },
        dismiss(reasonKey) { dismissSummon(reasonKey || 'dismissed'); },  // i18n-ignore: key fragment
        // Whatever the party is walking with, for the Followers page and for
        // the follower slot that draws it.
        isMapActive() { return !!mapSummon(); },
        mapSummonSprite() {
            // While it is fighting, the proxy actor's own body is on the field:
            // the trailing slot must not draw a second copy of it.
            const record = active ? null : mapSummon();
            if (!record) return null;
            return {
                characterName: record.spec.characterName,
                characterIndex: record.spec.characterIndex || 0
            };
        },
        mapSummonInfo() {
            const record = mapSummon();
            if (!record) return null;
            return {
                name: record.spec.name,
                characterName: record.spec.characterName,
                characterIndex: record.spec.characterIndex || 0,
                level: record.spec.level || 1,
                kindKey: record.spec.kindKey,
                petId: record.petId || 0,
                bound: !!record.bound,
                stepsLeft: record.stepsLeft || 0,
                stepsTotal: record.stepsTotal || 0,
                fighting: !!active
            };
        },
        dismissMapSummon() { return dismissAnySummon(); },
        markNpc,
        markEnemy,
        marks() { return marks(); },
        lastSlainEnemyId() { return ($gameSystem && $gameSystem._lastSlainEnemyId) || 0; },
        // The HYPER gauge, for anything that wants to draw or drive it itself.
        hyperRate,
        hyperCharge(amount) { addHyperCharge(Number(amount) || 0); },
        ultimateTier,
        ultimateName(kindKey) { return ultimateName(kindKey || (active && active.kindKey), ultimateTier()); },
        // What a rite would answer with, for anything that wants to price it.
        levelFor() { return summonLevel(); },
        referenceParams,
        // Whose familiar is what, for the Followers page and anything else that
        // wants to name a traveller's animal outside a fight.
        familiarFor(actor) { return familiarFor(actor || ($gameParty && $gameParty.leader())); }
    };

    // Kept for events and plugins written against v2.
    window.isSummonActive = function () { return !!active; };
    window.endSummon = function () { dismissSummon(null); };

})();
