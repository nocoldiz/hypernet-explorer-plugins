//=============================================================================
// VectorGunSystem.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Em's vector gun: its operating modes, its restrictions and what they do in a fight
 * @author Assistant
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * The one authority on the vector gun (Weapons.json 525).
 *
 * It answers to Em alone, it is never merchandise, a gift, a parcel or
 * something to leave in a chest, and what it does in a fight is chosen in the
 * main menu rather than written into the weapon. Two choices, kept apart:
 *
 *   OPERATING MODES  what the gun does. Fifteen of them, three running at
 *                    once, from Mana bullets to Hexed rounds.
 *   THE FORM         what the gun is. One shape fitted at a time, out of the
 *                    gun's own and the eleven weapon types it folds into. In
 *                    battle the reload row is SWITCH: it reconstructs the
 *                    weapon as the fitted shape and back, costs no turn and can
 *                    be done as often as she likes. Left as the gun, SWITCH
 *                    racks it out
 *                    into a coilgun sniper rifle instead: three shots, four
 *                    times the reach, and the third round spent folds it back.
 *
 * Everything is read through window.VectorGun, so no other plugin tests for
 * the weapon id itself. VectorGunSystemUI.js draws the screen; the battle
 * system, the shops, the backpack, the containers, the post and the Empathize
 * tray ask this file what may be done with the gun.
 */

// Em's gun is not an ordinary firearm and is not treated as one anywhere in
// the game: it answers to her alone, it is never merchandise, and what it does
// in a fight is chosen here rather than written into the weapon. This section
// is the ONE authority on all three questions. The battle system, the shops,
// the backpack, the containers, the post and the Empathize tray all ask it
// rather than testing for the weapon id themselves.
(() => {
  'use strict';

  const VG_ID = 525;              // Vector gun, data/Weapons.json
  const MAX_MODES = 3;            // three modes run at once, never more
  const FLOATING_STATE = 45;      // States.json "Floating": the recoil throw
  const WIDE_DAMAGE_RATE = 0.62;  // what a fanned shot gives up per body
  const BURST_DAMAGE_RATE = 0.7;  // what each round of a burst gives up
  const OVERLOAD_DAMAGE_RATE = 0.85;  // what a doubled magazine costs a shot
  // What folding is worth. The pistol is the weapon at rest: every shape it
  // reconstructs into, the coilgun included, strikes for this much more, and
  // only a folded weapon carries an element at all. Switching is a decision,
  // not a costume.
  const FORM_DAMAGE_BONUS = 0.4;
  // What a spell costs when it is fired down the barrel instead of cast. A
  // bound spell is ALWAYS loaded, so the price is the mode's whole point: bare,
  // the frame wastes half again as much mana forcing the spell into a round,
  // and the Spellblaster fitting is what brings it back under the cast price.
  const SPELLBLASTER_COST_RATE = 1.5;
  const SPELLBLASTER_FITTED_RATE = 0.75;
  const DRAIN_SHARE = 0.25;       // of the damage dealt, back as health
  const SIPHON_SHARE = 0.15;      // of the damage dealt, back as mana
  const DEADEYE_CRIT = 0.4;       // added to the chance of a critical shot
  const HEX_CHANCE = 0.4;         // that a hexed round leaves its mark
  const HEX_STATES = [5, 6, 38, 40, 53];  // Blind, Silence, Unbalanced, Vulnerability, Guard Broken
  const LONGSHOT_RANGE = 2;       // how much further the shot carries
  const EXECUTIONER_BONUS = 0.6;  // added to a shot as the target bleeds out
  const AMBUSH_BONUS = 0.5;       // added to a shot fired in the opening round
  const RESONANCE_BONUS = 0.4;    // added to a shot fired off a full reservoir
  const OVERPRESSURE_BONUS = 0.35;  // added to a shot that spends two rounds
  const HOLLOW_CRIT_BONUS = 0.75; // added to what a critical shot is worth
  const DEEP_MAGAZINE_ROUNDS = 4; // more rounds in the well, at no cost

  // The frame does NOT grow with her. It used to rewrite itself as Em levelled
  // - a shot worth up to 1.8 times itself, free ATK and AGI on the row, deeper
  // magazines - which made the plain shot the strongest thing she owned and
  // left every mode and every skill in her list looking like a downgrade. What
  // the gun is worth is what is fitted to it: the modes, the form and the
  // element, all of them chosen. Nothing is handed over for standing still.

  // The rounds that are loaded with something. Each one is one mode, each puts
  // ONE affliction on what it hits, and they roll one at a time, so a gun set
  // to two of them can leave two marks with one shot. States.json ids: nothing
  // here invents a state, and addState still answers to the target's own
  // resistances, which is what keeps them fair on a battle map.
  const STATUS_CHANCE = 0.3;
  const STATUS_MODES = {
    venom: { stateId: 4 },              // Poison
    concussion: { stateId: 13 },        // Stun
    thermalOverload: { stateId: 43 },   // Burned
    thermalUnderload: { stateId: 11 },  // Freeze
  };

  // The weapon types that put a shot downrange: the reach of anything else is
  // the reach of an arm, whatever the gun's own row says.
  const RANGED_WTYPES = [7, 8, 9];

  // The operating modes: what the gun DOES. Three of them run at once, and none
  // of them changes the shape of the weapon - that is the form selector's job
  // (see below), which is a separate choice with its own bay.
  const BASE_MODE_KEYS = [
    'mana', 'psi', 'recoil', 'spellblaster', 'card', 'wide', 'burst', 'pierce',
    'drain', 'siphon', 'deadeye', 'tracker', 'overload', 'hex', 'longshot',
    'venom', 'concussion', 'thermalOverload', 'thermalUnderload',
    'executioner', 'ambush', 'resonance', 'overpressure',
    'hollowPoint', 'deepMagazine',
  ];

  // The shapes the frame reconstructs itself into, one per weapon type the game
  // knows. ONE of them is fitted at a time, in a selector of its own, and the
  // gun's own shape is the default: fitting a shape does not spend a mode bay.
  // In battle the reload row becomes SWITCH, which folds the weapon into the
  // fitted shape and back. It costs no turn and may be done as many times in a
  // round as she likes; the gun carries no ammunition to fill.
  const GUN_FORM = 'gun';         // the shape it always comes back to
  const GUN_WTYPE = 9;
  const SNIPER_SHOTS = 3;         // what the coilgun holds before it must reload
  const SNIPER_RANGE = 4;         // and how much further than the pistol it reaches

  // `range` is the reach in squares on a battle map (MapBattleMode): a shape is
  // a real weapon and reaches as far as that weapon does, so folding the gun
  // into a machete gives up the six squares the pistol was shooting over. The
  // gun's own shapes take a multiplier of the row instead.
  const FORM_MODES = {
    abrasax:   { wtypeId: 1, range: 1, builder: 'createVectorAthameModel' },    // Athame of Abrasax
    thelema:   { wtypeId: 2, range: 1, builder: 'createVectorBladeModel' },  // Blade of Thelema
    choronzon: { wtypeId: 3, range: 1, builder: 'createVectorMaulModel' },    // Maul of Choronzon
    babalon:   { wtypeId: 4, range: 1, builder: 'createVectorAxeModel' },    // Axe of Babalon
    nuit:      { wtypeId: 5, range: 2, builder: 'createVectorScourgeModel' },    // Scourge of Nuit
    hadit:     { wtypeId: 6, range: 2, builder: 'createVectorStaffModel' },    // Staff of Hadit
    aiwass:    { wtypeId: 7, range: 6, builder: 'createVectorBowModel' },    // Bow of Aiwass
    zos:       { wtypeId: 8, range: 4, builder: 'createVectorDartsModel' },    // Darts of Zos
    baphomet:  { wtypeId: 10, range: 1, builder: 'createVectorTalonsModel' },   // Talons of Baphomet
    kia:       { wtypeId: 11, range: 1, builder: 'createVectorGauntletModel' },   // Gauntlet of Kia
    longinus:  { wtypeId: 12, range: 2, builder: 'createVectorLanceModel' },   // Lance of Longinus
    // Grimoire of Solomon: the twelfth shape, and the only one that is not a
    // weapon. Fitted, the book is already open when the fight starts: Em walks
    // in reading. It is a pact, not a gift, so her limit break buys no turn of
    // invulnerability with it and the book takes its own price out of her for
    // every spell she reads (BattleSystemActiveSkills.js, window.LimitBreak).
    //
    // The one shape that is not swung at anybody: a book has no edge to bring
    // round, so a plain attack with it is the book driven open and a volley of
    // its own pages going downrange off the clasp. That is why it carries a
    // shot's reach, a motion of its own, paper for a sound and a mark of its
    // own where the pages land, instead of borrowing a staff's.
    solomon:   { wtypeId: 6, range: 4, builder: 'createVectorGrimoireModel',
                 shoots: true, motion: 'cast', hitFX: 'pages',
                 sounds: ['Items/bookFlip1', 'Items/bookFlip2', 'Items/bookFlip3',
                          'Items/paper_02'] },
    // What the gun itself folds into, and the only shape nobody fits: with the
    // frame left as the gun, SWITCH racks the barrel out into a coilgun sniper
    // rifle. It holds three shots, reaches four times as far, and the third
    // round spent puts it back together as the pistol (which is its reload).
    sniper:    { wtypeId: GUN_WTYPE, builder: 'createVectorSniperModel',
                 bullets: SNIPER_SHOTS, rangeMul: SNIPER_RANGE, derived: true },
    // The shape nobody fits and nobody switches into: the gun opens into a
    // grimoire only when Em's limit break says so (window.LimitBreak, the
    // Hyper), whatever it was standing as a moment earlier, and it closes
    // again when the fight ends.
    grimoire:  { wtypeId: 6, range: 4, builder: 'createVectorGrimoireModel', derived: true,
                 shoots: true, motion: 'cast', hitFX: 'pages',
                 sounds: ['Items/bookFlip1', 'Items/bookFlip2', 'Items/bookFlip3',
                          'Items/paper_02'] },
  };
  const FORM_KEYS = Object.keys(FORM_MODES).filter((k) => !FORM_MODES[k].derived);
  const SNIPER_FORM = 'sniper';
  const GRIMOIRE_FORM = 'grimoire';
  const SOLOMON_FORM = 'solomon';

  /** Whether the pact shape is the one fitted in the form bay. */
  const solomonFitted = () => fittedForm() === SOLOMON_FORM;

  // What the form selector offers: the gun's own shape first, then the eleven.
  const FORM_CHOICES = [GUN_FORM].concat(FORM_KEYS);

  const MODE_KEYS = BASE_MODE_KEYS.slice();

  /** Whether a key names one of the shapes the frame reconstructs into. */
  const isFormMode = (key) => Object.prototype.hasOwnProperty.call(FORM_MODES, key);

  const isVectorGun = (item) =>
    !!item && item.etypeId === 1 && item.id === VG_ID && DataManager.isWeapon(item);

  /** The gun's own row, whoever is holding it. */
  const gunData = () => $dataWeapons[VG_ID] || null;

  /** Em, as the presets plugin reads her: never re-derived from a name here. */
  function isEm(actor) {
    if (!actor || !actor.isActor || !actor.isActor()) return false;
    const CP = window.CharacterPresets;
    return !!(CP && CP.isEmActor && CP.isEmActor(actor));
  }

  /** Story mode is the run the gun's screen belongs to. */
  function inStoryMode() {
    const CP = window.CharacterPresets;
    if (CP && CP.isStoryMode) return CP.isStoryMode();
    return !!(typeof $gameSwitches !== 'undefined' && $gameSwitches && $gameSwitches.value(100));
  }

  /**
   * The sandbox is the other run the gun belongs to: nothing there is Em, so
   * the weapon is handed out at the start and whoever holds it is its wielder.
   */
  function inSandboxMode() {
    return !!(typeof $gameSystem !== 'undefined' && $gameSystem && $gameSystem._isSandboxMode);
  }

  //--------------------------------------------------------------------------
  // What the gun is set to
  //--------------------------------------------------------------------------

  function modes() {
    if (typeof $gameSystem === 'undefined' || !$gameSystem) return [];
    if (!Array.isArray($gameSystem._vectorGunModes)) $gameSystem._vectorGunModes = [];
    // A savegame from when the shapes were modes carries one in a bay: it is
    // moved to the form selector rather than dropped, so nothing a player fitted
    // is lost, and the bay it was taking comes back free.
    const stray = $gameSystem._vectorGunModes.find(isFormMode);
    if (stray && !$gameSystem._vectorGunFitted) $gameSystem._vectorGunFitted = stray;
    $gameSystem._vectorGunModes = $gameSystem._vectorGunModes
      .filter((key) => BASE_MODE_KEYS.includes(key))
      .slice(0, MAX_MODES);
    return $gameSystem._vectorGunModes;
  }

  const hasMode = (key) => modes().indexOf(key) >= 0;

  /**
   * Turns one mode on or off. The bays are a queue: fitting a fourth with all
   * three taken is refused rather than quietly dropping one.
   * @param {string} key - One of MODE_KEYS
   * @returns {string} 'on', 'off' or 'full'
   */
  function toggleMode(key) {
    if (!MODE_KEYS.includes(key)) return 'full';
    const list = modes();
    const at = list.indexOf(key);
    if (at >= 0) {
      list.splice(at, 1);
      return 'off';
    }
    if (list.length >= MAX_MODES) return 'full';
    list.push(key);
    return 'on';
  }

  /**
   * Loads one mode into the bays the way the gun's screen works them: the three
   * slots are a magazine rather than three switches, so a fourth mode pushes the
   * OLDEST out instead of being refused. Confirming a mode that is already
   * running unloads it.
   * @param {string} key - One of MODE_KEYS
   * @returns {{state: string, replaced: ?string}} 'on' or 'off', and whatever
   *   was pushed out to make room.
   */
  function fitMode(key) {
    if (!MODE_KEYS.includes(key)) return { state: 'off', replaced: null };
    const list = modes();
    const at = list.indexOf(key);
    if (at >= 0) {
      list.splice(at, 1);
      return { state: 'off', replaced: null };
    }
    let replaced = null;
    if (list.length >= MAX_MODES) replaced = list.shift();
    list.push(key);
    return { state: 'on', replaced: replaced };
  }

  //--------------------------------------------------------------------------
  // The shape the frame is built as
  //--------------------------------------------------------------------------
  // One choice, kept apart from the modes: the modes are what the gun does, the
  // form is what it is. The gun's own shape is the default and is always a
  // valid answer, so the weapon is never left without one.

  /** The shape SWITCH reconstructs the weapon into, the gun's own by default. */
  function fittedForm() {
    if (typeof $gameSystem === 'undefined' || !$gameSystem) return GUN_FORM;
    const key = $gameSystem._vectorGunFitted;
    return FORM_KEYS.includes(key) ? key : GUN_FORM;
  }

  /**
   * Fits one shape. Picking the shape already fitted is not an unfit: the frame
   * always stands as something, and the gun's own shape is how it is put down.
   * @param {string} key - GUN_FORM or one of FORM_KEYS
   * @returns {string} The shape now fitted
   */
  function setForm(key) {
    if (typeof $gameSystem === 'undefined' || !$gameSystem) return GUN_FORM;
    const next = FORM_KEYS.includes(key) ? key : GUN_FORM;
    if (next !== fittedForm()) unfold();
    $gameSystem._vectorGunFitted = next;
    return next;
  }

  /**
   * What SWITCH folds the weapon into from here: the fitted shape, or the
   * coilgun when the frame has been left as the gun.
   */
  const switchTarget = () => (fittedForm() === GUN_FORM ? SNIPER_FORM : fittedForm());

  /**
   * Puts the weapon back together as the gun. Called whenever the fitted shape
   * changes and when the coilgun runs dry, so a savegame never comes back
   * holding something the frame is no longer set to build.
   */
  function unfold() {
    if (typeof $gameSystem === 'undefined' || !$gameSystem) return;
    $gameSystem._vectorGunForm = null;
    $gameSystem._vectorGunBlade = false;
    $gameSystem._vectorGunSniperShots = 0;
  }

  function boundSpellId() {
    if (typeof $gameSystem === 'undefined' || !$gameSystem) return 0;
    return Number($gameSystem._vectorGunSpell) || 0;
  }

  function setBoundSpell(skillId) {
    if (typeof $gameSystem === 'undefined' || !$gameSystem) return;
    $gameSystem._vectorGunSpell = Number(skillId) || 0;
  }

  /** Em's actor, in the party or out of it. */
  function emActor() {
    if (typeof $gameParty === 'undefined' || !$gameParty) return null;
    return $gameParty.allMembers().find(isEm) || null;
  }

  /** Whoever has the gun in hand right now. */
  function wielder() {
    if (typeof $gameParty === 'undefined' || !$gameParty) return null;
    return $gameParty.allMembers()
      .find((member) => member.weapons && member.weapons().some(isVectorGun)) || null;
  }

  /**
   * The spells the gun can be loaded with: offensive, aimed at one enemy and
   * already known by whoever carries the gun.
   * @returns {object[]} $dataSkills rows
   */
  function spellChoices() {
    const actor = wielder() || emActor();
    if (!actor) return [];
    // Magic only. What the barrel can hold is a spell: a skill is a thing the
    // body does, and there is no forcing it into a round. The magic side is
    // stypeId 1 and pays in mana, which is the game's own line between the two
    // (js/db/Skills/Categories.json).
    return actor.skills()
      .filter((skill) => skill && skill.scope === 1 && skill.stypeId === 1 &&
        skill.mpCost > 0 &&
        skill.damage && [1, 2, 5, 6].includes(skill.damage.type) &&
        (skill.occasion === 0 || skill.occasion === 1));
  }

  /** Whether this battler is shooting the vector gun with `key` running. */
  function firing(battler, key) {
    if (!battler || !battler.isActor || !battler.isActor()) return false;
    if (!battler.weapons || !battler.weapons().some(isVectorGun)) return false;
    return hasMode(key);
  }

  //--------------------------------------------------------------------------
  // What the rest of the game asks
  //--------------------------------------------------------------------------

  /**
   * What the shot is worked out from: DEX off the weapon row, unless a mode
   * says otherwise. Mana bullets read INT, Psi vectors read PSI.
   */
  function scaleOverride(subject) {
    if (firing(subject, 'mana')) return ['INT'];
    if (firing(subject, 'psi')) return ['PSI'];
    return null;
  }

  /** Wide shots read as area damage, which is what spreads them over parts. */
  function damageTypeOverride(subject, action) {
    if (!action || typeof action.isAttack !== 'function' || !action.isAttack()) return null;
    return firing(subject, 'wide') ? 'Area' : null;
  }

  /**
   * What each landed shot is worth. Fanning the vectors, splitting them into a
   * burst and running a doubled magazine each give damage up, and they stack:
   * a gun set to do all three is trading hard for it.
   */
  function damageRate(subject, action, target) {
    // Only the gun's own shot is rewritten; a skill fired by the same hand is
    // the skill's own business.
    if (!action || typeof action.isAttack !== 'function' || !action.isAttack()) return 1;
    // Only the frame itself folds: another hand's weapon is its own weapon
    // whoever is standing next to it.
    const holdsGun = !!subject && !!subject.weapons && subject.weapons().some(isVectorGun);
    let rate = (damageTypeOverride(subject, action) ? WIDE_DAMAGE_RATE : 1);
    // Folded, the whole frame is behind the blow: every shape strikes harder
    // than the pistol does, which is what makes SWITCH worth the round.
    if (holdsGun && formKey()) rate *= 1 + FORM_DAMAGE_BONUS;
    if (firing(subject, 'burst')) rate *= BURST_DAMAGE_RATE;
    if (firing(subject, 'overload')) rate *= OVERLOAD_DAMAGE_RATE;
    if (firing(subject, 'overpressure')) rate *= 1 + OVERPRESSURE_BONUS;
    // The executioner reads the target: the emptier it is, the harder the round
    // lands, all the way to two thirds again at the point of death.
    if (target && firing(subject, 'executioner') && target.mhp) {
      rate *= 1 + EXECUTIONER_BONUS * (1 - Math.max(0, target.hp) / target.mhp);
    }
    // The opening round of a fight: the troop is set up on turn 0 and the first
    // round of actions runs on turn 1, so both count as the ambush.
    if (firing(subject, 'ambush') && typeof $gameTroop !== 'undefined' &&
      $gameTroop && $gameTroop.turnCount() <= 1) {
      rate *= 1 + AMBUSH_BONUS;
    }
    // Resonance: the fuller the reservoir behind the shot, the more of it the
    // vectors carry.
    if (firing(subject, 'resonance') && subject.mmp) {
      rate *= 1 + RESONANCE_BONUS * (Math.max(0, subject.mp) / subject.mmp);
    }
    return rate;
  }

  /**
   * What one shot of a bound spell costs the shooter, in mana: half again the
   * cast price bare, and a quarter under it with the Spellblaster fitting on
   * the frame. ONE place works it out, so the screen quotes what the fight
   * charges.
   * @param {Game_Battler} subject - Whoever is holding the gun
   * @param {Object} skill - The bound skill
   * @returns {number} The mana it takes
   */
  function spellCost(subject, skill) {
    if (!subject || !skill || !subject.skillMpCost) return 0;
    const rate = hasMode('spellblaster') ? SPELLBLASTER_FITTED_RATE : SPELLBLASTER_COST_RATE;
    return Math.floor(subject.skillMpCost(skill) * rate);
  }

  /**
   * The spell that rides one shot, already paid for. Null when nothing is
   * bound, the weapon is folded, or the mana is not there: the shot stays plain.
   * @param {Game_Battler} subject - The shooter
   * @param {Game_Action} action - The attack being made
   * @returns {Game_Action|null} A prepared action, or null
   */
  function spellblasterAction(subject, action) {
    if (!action || typeof action.isAttack !== 'function' || !action.isAttack()) return null;
    // The spell rides the GUN's round: another hand's attack, made while a
    // spell happens to be bound, is that weapon's own business and pays nothing.
    if (!subject || !subject.weapons || !subject.weapons().some(isVectorGun)) return null;
    // A bound spell is always loaded: binding it IS the arming. The
    // Spellblaster fitting is what makes it cheap, not what makes it fire.
    // The spell rides a ROUND. Folded there is no round to hang it on, so a
    // machete swing never casts: the spell is the pistol's to fire.
    if (formKey()) return null;
    const skill = $dataSkills[boundSpellId()];
    if (!skill) return null;
    const cost = spellCost(subject, skill);
    if (subject.mp < cost) return null;
    subject.setMp(subject.mp - cost);
    const extra = new Game_Action(subject);
    extra.setSkill(skill.id);
    return extra;
  }

  /** The fallen, banked as a monster card. Nothing happens off the catalogue. */
  function printCard(enemy) {
    const CG = window.CardGame;
    if (!CG || !CG.monsterKey || !CG.addCard) return;
    if (!enemy || typeof enemy.enemyId !== 'function') return;
    const key = CG.monsterKey(enemy.enemyId());
    // catalogue() answers with the whole printable set split by kind; the
    // monsters live in `all` alongside the equipment.
    const cat = CG.catalogue ? CG.catalogue() : null;
    const all = cat && Array.isArray(cat.all) ? cat.all : null;
    if (!all || all.indexOf(key) < 0) return;
    CG.addCard(key, 1);
    if (window.ParchmentToast) {
      window.ParchmentToast.show(T('VectorGun.toast.card', { name: CG.nameOf(key) }), { key: 'vgcard' });
    }
  }

  /**
   * What a landed shot leaves behind: the recoil throw, and the card printed
   * off a killing blow.
   * @param {Game_Battler} subject - The shooter
   * @param {Game_Battler} target - What was hit
   * @param {Game_Action} action - The attack
   */
  function onShotLanded(subject, target, action) {
    if (!target || !action || typeof action.isAttack !== 'function' || !action.isAttack()) return;
    if (firing(subject, 'recoil') && target.result && target.result().isHit() &&
      target.isAlive() && !target.isStateAffected(FLOATING_STATE)) {
      target.addState(FLOATING_STATE);
    }
    if (firing(subject, 'card') && target.isEnemy && target.isEnemy() && target.hp <= 0) {
      printCard(target);
    }

    // What the round takes back out of the wound. Both read the damage that was
    // actually dealt, so a shot that was blocked feeds nothing.
    const dealt = (target.result && target.result().hpDamage) || 0;
    if (dealt > 0 && firing(subject, 'drain')) {
      subject.gainHp(Math.max(1, Math.floor(dealt * DRAIN_SHARE)));
      if (subject.startDamagePopup) subject.startDamagePopup();
    }
    if (dealt > 0 && firing(subject, 'siphon')) {
      subject.gainMp(Math.max(1, Math.floor(dealt * SIPHON_SHARE)));
    }

    const landed = target.result && target.result().isHit() && target.isAlive();
    if (!landed) return;

    // A hexed round leaves its mark: one of five ordinary afflictions, rolled
    // off the game's own randomness rather than a table of the gun's own.
    if (firing(subject, 'hex') && Math.random() < HEX_CHANCE) {
      const stateId = HEX_STATES[Math.floor(Math.random() * HEX_STATES.length)];
      if (!target.isStateAffected(stateId)) target.addState(stateId);
    }

    // And the loaded rounds leave theirs. Each fitted one rolls on its own, so
    // a gun carrying two of them can leave two marks with one shot; addState
    // still goes through the target's own resistances.
    for (const key of Object.keys(STATUS_MODES)) {
      if (!firing(subject, key) || Math.random() >= STATUS_CHANCE) continue;
      const stateId = STATUS_MODES[key].stateId;
      if (!target.isStateAffected(stateId)) target.addState(stateId);
    }
  }

  //--------------------------------------------------------------------------
  // What may never be done with it
  //--------------------------------------------------------------------------

  // The gun is not merchandise, not a gift, not a parcel and not something to
  // leave in a chest: it is the one thing Em never puts down. Every screen that
  // could take it out of her hands asks this and refuses.
  const isBound = (item) => isVectorGun(item);


  //--------------------------------------------------------------------------
  // The forms the gun folds into
  //--------------------------------------------------------------------------
  // Eleven of the modes change the weapon itself, one per weapon type the game
  // knows apart from the gun's own. With one of them running, the battle
  // command that would reload becomes SWITCH, and the gun reconstructs itself
  // as that shape: the Blade of Thelema is the arrow-headed ritual machete, but
  // the same frame also opens into a lance, a scourge, a bow, a gauntlet. In
  // any of them it strikes rather than shoots - the type's own sounds, its
  // swing, its hit effect - and it spends no rounds, because switching back and
  // forth is what loads it: every switch fills the magazine. Only one shape can
  // be fitted at a time; loading a second puts the first away.

  // The sound banks of WeaponSystem's own table (DEFAULT_WEAPON_SOUNDS), by
  // weapon type: whatever the gun has folded into is not a firearm and never
  // makes a firearm's noise. Kept here rather than asked of WeaponSystem
  // because that table is private to its plugin.
  const FORM_SOUNDS = {
    1: ['knifeSlice2', 'blade_03', 'Sling3', 'Throw3'],
    2: ['Slash1', 'Sling2', 'Sling3', 'Throw2', 'Spear2'],
    3: ['Sling1', 'Throw2', 'Hammer1', 'Hammer2'],
    4: ['Slash1', 'Sling1', 'Spear1'],
    5: ['Whip1', 'Whip2', 'Whip3', 'Whip4'],
    6: ['Sling1', 'Sling2', 'Throw1'],
    7: ['Bow', 'Bow2', 'Bow3'],
    8: ['Sling1', 'Sling2', 'Sling3', 'Throw1', 'Throw2', 'Throw3'],
    10: ['knifeSlice2', 'Slash1', 'Sling3'],
    11: ['Punch1', 'Sling1', 'Throw1'],
    12: ['Spear1', 'Spear2', 'Sling1'],
  };
  const BLADE_SOUNDS = FORM_SOUNDS[2];
  const BLADE_ANIMATION = 1187;   // Animations.json: a sword's slash

  /**
   * Whether SWITCH is offered at all: it is, to whoever holds the gun, because
   * the frame always has somewhere to fold to - a fitted shape, or the coilgun.
   */
  const bladeReady = (battler) => {
    const holder = battler || wielder();
    return !!(holder && holder.weapons && holder.weapons().some(isVectorGun));
  };

  // While a menu is drawing a shape the weapon is not standing in, this is the
  // shape it wants built. It is only ever set for the length of one model
  // build (withForm), so nothing outside a preview ever sees it.
  let _previewForm = null;

  /**
   * Builds something as `key` rather than as the shape the weapon is standing
   * in: the gun's screen shows the pistol and the fitted shape side by side.
   * @param {?string} key - GUN_FORM, a form key, or null for the real state
   * @param {Function} fn - Run with that shape in force
   */
  function withForm(key, fn) {
    const previous = _previewForm;
    _previewForm = key;
    try { return fn(); } finally { _previewForm = previous; }
  }

  /**
   * The shape the weapon is standing in right now, or null while it is the
   * plain gun. Savegames written before the coilgun carry a bare blade flag.
   */
  function formKey() {
    if (_previewForm) return _previewForm === GUN_FORM ? null : _previewForm;
    if (typeof $gameSystem === 'undefined' || !$gameSystem) return null;
    // The book beats everything else the frame could be standing as.
    if ($gameSystem._vectorGunGrimoire) return GRIMOIRE_FORM;
    const target = switchTarget();
    if ($gameSystem._vectorGunForm === target) return target;
    if (!$gameSystem._vectorGunForm && $gameSystem._vectorGunBlade && target === 'thelema') return target;
    return null;
  }

  /** Whether the weapon is standing as something other than the plain gun. */
  const inBlade = () => !!formKey();

  //--------------------------------------------------------------------------
  // The grimoire
  //--------------------------------------------------------------------------
  // Not a form anybody fits: the limit break opens it, the end of the fight
  // closes it, and while it is open the frame is a book of gold and black with
  // pages that turn on their own.

  function openGrimoire() {
    if (typeof $gameSystem === 'undefined' || !$gameSystem) return false;
    $gameSystem._vectorGunGrimoire = true;
    return true;
  }

  function closeGrimoire() {
    if (typeof $gameSystem === 'undefined' || !$gameSystem) return false;
    $gameSystem._vectorGunGrimoire = false;
    return true;
  }

  const inGrimoire = () => !!(typeof $gameSystem !== 'undefined' && $gameSystem &&
    $gameSystem._vectorGunGrimoire);

  /** The weapon type the frame is answering to: the gun's own until it folds. */
  function formWeaponType() {
    const key = formKey();
    return key ? FORM_MODES[key].wtypeId : GUN_WTYPE;
  }

  /** Whether what it is standing as strikes rather than shoots. */
  const inMeleeForm = () => inBlade() && formWeaponType() !== GUN_WTYPE;

  /** Whether it is racked out as the coilgun. */
  const inSniper = () => formKey() === SNIPER_FORM;

  /** The procedural model a shape is built with, when it has one of its own. */
  function formBuilder() {
    const key = formKey();
    return (key && FORM_MODES[key].builder) || null;
  }

  /**
   * The animation a shape swings with. The blade's is named outright; the
   * coilgun keeps the gun's own; every other shape borrows the animation the
   * database already gives that weapon type, so no id is invented here.
   */
  const _formAnimCache = {};
  function formAnimationId() {
    const key = formKey();
    if (!key || key === SNIPER_FORM) return 0;
    if (key === 'thelema') return BLADE_ANIMATION;
    if (_formAnimCache[key]) return _formAnimCache[key];
    const wtypeId = FORM_MODES[key].wtypeId;
    const row = ($dataWeapons || []).find(
      (w) => w && w.wtypeId === wtypeId && w.animationId > 0 && w.id !== VG_ID);
    _formAnimCache[key] = row ? row.animationId : BLADE_ANIMATION;
    return _formAnimCache[key];
  }

  /**
   * The sound bank the shape makes when it lands: the bank of the weapon type
   * it is standing as, or the shape's own when what it does is not that type's
   * noise at all (the book, which is paper rather than a staff).
   */
  const formSounds = () => {
    const key = formKey();
    const own = key && FORM_MODES[key].sounds;
    return (own || FORM_SOUNDS[formWeaponType()] || BLADE_SOUNDS).slice();
  };

  /** Whether what the weapon is standing as puts a shot downrange at all. */
  const shootsAtRange = () => {
    const key = formKey();
    if (key && FORM_MODES[key].shoots) return true;
    return RANGED_WTYPES.includes(formWeaponType());
  };

  //--------------------------------------------------------------------------
  // How the shape is held and how it is swung
  //--------------------------------------------------------------------------
  // Every pose the weapon overlay puts the thing in hand through - where it
  // rests, how it sways, where on screen it hangs, whether it turns to face an
  // enemy and what movement its blow is - is read off the row's weapon type in
  // WeaponSystemProcedural. Folded, the row is still the pistol's, so every
  // shape was carried like a firearm, levelled across the battlefield and made
  // to KICK instead of swinging, with no trail off it because a gun leaves
  // none. What those readings are handed instead is this: the gun's own row
  // with the shape's weapon type on it.
  //
  // The gun's weight comes off it as well, so a maul is swung with a maul's
  // mass rather than a pistol's, and so does the magazine, which nothing the
  // frame folds into carries.

  // The readings in WeaponSystemProcedural that answer off the weapon type and
  // are handed the stand-in row instead of the gun's own (installed at boot,
  // below). Every one of them takes the weapon first and three arguments at
  // most. The two that decide the MOVEMENT are wrapped on their own, because a
  // shape may name its own.
  const FORM_POSE_READINGS = [
    'baseRotationFor',   // how it is held at rest
    'anchorOffsetFor',   // where on screen it hangs
    'screenFractionFor', // how large it is drawn
    'aimsAtTarget',      // whether it turns to face an enemy
    'idleSway',          // how it breathes between blows
    'weaponMetrics',     // its reach and its mass, which pace the swing
    'weightOf',
  ];

  // The movements only a firearm makes. A shape that does not shoot is never
  // built with one of them, whatever the row's own tag asks for.
  const GUN_MOTION_KINDS = { recoil: true, crossbow: true, draw: true };

  const _formRows = {};

  /** The row the overlay reads the shape off: the gun's own until it folds. */
  function formWeaponRow() {
    const key = formKey();
    const gun = gunData();
    if (!key || !gun) return gun;
    const cached = _formRows[key];
    if (cached && cached._vectorGunFrom === gun) return cached;
    const row = Object.assign({}, gun, {
      wtypeId: FORM_MODES[key].wtypeId,
      note: String(gun.note || '')
        .replace(/<Weight:[^>]*>\s*/ig, '')
        .replace(/<Bullets:[^>]*>\s*/ig, ''),
      _vectorGunFrom: gun,
    });
    delete row.maxBullets;
    _formRows[key] = row;
    return row;
  }

  /** The movement the shape strikes with, when its type's own is not it. */
  const formMotion = () => {
    const key = formKey();
    return (key && FORM_MODES[key].motion) || null;
  };

  /** The mark the shape leaves, when its type's own is not it. */
  const formHitFX = () => {
    const key = formKey();
    return (key && FORM_MODES[key].hitFX) || null;
  };

  /**
   * How much further than the pistol the weapon carries: four times as far
   * racked out as the coilgun, twice as far with Long shot fitted, and both
   * together when both apply. Nothing that does not shoot is carried further.
   */
  function rangeMultiplier() {
    const key = formKey();
    let mul = (key && FORM_MODES[key].rangeMul) || 1;
    if (hasMode('longshot') && shootsAtRange()) mul *= LONGSHOT_RANGE;
    return mul;
  }

  /**
   * The reach in squares the weapon actually has on a battle map, which is the
   * one answer MapBattleMode is given (weaponRange). A shape with a reach of
   * its own uses it - a machete reaches one square whatever the gun's row says
   * - and the shapes that are still the gun scale the row instead.
   * @param {number} base - The <Range:> the weapon row carries
   */
  function weaponReach(base) {
    const key = formKey();
    const own = key && FORM_MODES[key].range;
    let reach = own || base;
    if (!own) reach *= rangeMultiplier();
    else if (hasMode('longshot') && shootsAtRange()) reach *= LONGSHOT_RANGE;
    return Math.max(1, Math.round(reach));
  }

  /**
   * How many rounds the magazine holds as the weapon stands: three in the
   * coilgun, double with Overload fitted, the row's own otherwise. Nothing
   * here reads anybody's level: the frame does not grow with the hand holding
   * it, so a level 1 well is a level 99 well.
   * @param {number} base - What the weapon row says
   */
  function magazineSize(base) {
    const key = formKey();
    let shots = (key && FORM_MODES[key].bullets) || base;
    // A deeper well is four more rounds wherever they fit, and Overload doubles
    // whatever is in there: fitted together the coilgun carries fourteen.
    if (hasMode('deepMagazine')) shots += DEEP_MAGAZINE_ROUNDS;
    if (hasMode('overload')) shots *= 2;
    return shots;
  }

  //--------------------------------------------------------------------------
  // The reconstruction, on screen
  //--------------------------------------------------------------------------
  // SWITCH is a machine coming apart and building itself back as another
  // weapon, so it is PLAYED rather than swapped: the fold runs on the shape
  // being put away, the model is rebuilt at the pivot, and the rise runs on the
  // shape being drawn (WeaponSystemProcedural.startVectorSwitch). The battle
  // scene drives the two halves; this is the one place that knows which sprites
  // are holding the gun.

  const FOLD_SE = { name: 'Machine', volume: 80, pitch: 130, pan: 0 };
  const RISE_SE = { name: 'Equip1', volume: 90, pitch: 90, pan: 0 };
  const RACK_SE = { name: 'Weapons/Reload5', volume: 80, pitch: 100, pan: 0 };

  /** Every 3D weapon sprite with the gun in it, whichever hand it is in. */
  function heldGunSprites() {
    const scene = typeof SceneManager !== 'undefined' ? SceneManager._scene : null;
    const sprites = scene && scene._spriteset && scene._spriteset._3dWeaponSprites;
    if (!sprites) return [];
    return Object.keys(sprites)
      .map((hand) => sprites[hand])
      .filter((sprite) => sprite && sprite._model && isVectorGun(sprite._weapon));
  }

  /**
   * Plays one half of the reconstruction.
   * @param {string} phase - 'fold' (coming apart) or 'rise' (going together)
   * @returns {number} How long it runs, in milliseconds
   */
  function playSwitchFx(phase, retried) {
    const WSP = window.WeaponSystemProcedural;
    if (!WSP || !WSP.startVectorSwitch) return 0;
    const rise = phase === 'rise';
    const sprites = heldGunSprites();
    for (const sprite of sprites) WSP.startVectorSwitch(sprite._model, phase);
    // A procedural model is built the moment its sprite is, so this is only
    // ever empty when the hand is being rebuilt around us: one frame later it
    // is there, and the half still has time to play.
    if (!sprites.length && !retried) {
      setTimeout(() => playSwitchFx(phase, true), 16);
    }
    if (typeof AudioManager !== 'undefined') {
      AudioManager.playSe(Object.assign({}, rise ? RISE_SE : FOLD_SE));
      // The rack of the new shape locking up, a beat after it has come together.
      if (rise) setTimeout(() => AudioManager.playSe(Object.assign({}, RACK_SE)), 220);
    }
    return rise ? WSP.VECTOR_RISE_MS : WSP.VECTOR_FOLD_MS;
  }

  /**
   * The same reconstruction played on ONE model that is not in anybody's hand:
   * the gun standing on the vector gun screen's bench. The screen shows a
   * single shape at a time and folds it into the other one exactly as the
   * battle does, so the fold, the rise and their sounds come from here rather
   * than from a second copy living in the menu.
   * @param {Object} model - the three.js model on the stand
   * @param {string} phase - 'fold' or 'rise'
   * @returns {number} How long it runs, in milliseconds
   */
  function playSwitchOn(model, phase) {
    const WSP = window.WeaponSystemProcedural;
    if (!WSP || !WSP.startVectorSwitch) return 0;
    const rise = phase === 'rise';
    if (model) WSP.startVectorSwitch(model, phase);
    if (typeof AudioManager !== 'undefined') {
      AudioManager.playSe(Object.assign({}, rise ? RISE_SE : FOLD_SE));
      if (rise) setTimeout(() => AudioManager.playSe(Object.assign({}, RACK_SE)), 220);
    }
    return rise ? WSP.VECTOR_RISE_MS : WSP.VECTOR_FOLD_MS;
  }

  /**
   * Folds the weapon into its fitted shape, or that shape back into the gun.
   * Either way the magazine comes back full: the reconstruction is the reload.
   * @param {Game_Actor} [actor] - Who is holding it (defaults to the wielder)
   * @returns {boolean} The form after the switch: true while it is not the gun
   */
  function switchForm(actor) {
    const target = switchTarget();
    const folded = !formKey();
    $gameSystem._vectorGunForm = folded ? target : null;
    // The old flag is kept in step so a savegame written now still reads right
    // to anything that only ever learned about the blade.
    $gameSystem._vectorGunBlade = folded && target === 'thelema';
    // The element goes on with the shape and comes off with it.
    stampElement();
    // The rack is counted from zero every time the coilgun is built.
    setSniperShotsFired(0);
    // There is no magazine to fill (the frame makes its own rounds), but the
    // reconstruction IS the reload motion: a Gunmancer's chamber reads it as
    // one and is paid for it, once a round (BattleSystemPassiveSkills.js).
    const holder = actor || wielder();
    if (holder && holder.reloadBullets) holder.reloadBullets();
    return folded;
  }

  //--------------------------------------------------------------------------
  // The element it strikes with
  //--------------------------------------------------------------------------
  // Independent of the modes: whatever the gun is doing, and whichever form it
  // is in, it strikes with one element out of System.json's own list. Physical
  // is the default and reads as no flourish at all.

  const PHYSICAL = 1;
  const ELEMENT_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  function elementId() {
    if (typeof $gameSystem === 'undefined' || !$gameSystem) return PHYSICAL;
    const id = Number($gameSystem._vectorGunElement);
    return ELEMENT_IDS.indexOf(id) >= 0 ? id : PHYSICAL;
  }

  /**
   * Whether the element is actually on the weapon. It is not: the pistol is a
   * pistol and shoots plain rounds whatever the screen is set to. The element
   * is what the reconstruction pours into the shape it builds, so it lands, is
   * drawn and tints the model ONLY while the gun stands folded.
   */
  function elementActive() {
    return !!formKey();
  }

  /**
   * The element the weapon is striking with right now: the chosen one while it
   * is folded, and physical while it is the pistol. Everything that asks what
   * the weapon does asks this; elementId() is only ever the setting.
   */
  function activeElementId() {
    return elementActive() ? elementId() : PHYSICAL;
  }

  /**
   * Picks the element. The choice is stamped onto the weapon row as well, which
   * is what the hit effects and the trail read (Weapon3DOverlay's
   * attackElementOf looks at attackElementId first).
   * @param {number} id - An element id from System.json
   */
  function setElement(id) {
    if (typeof $gameSystem === 'undefined' || !$gameSystem) return;
    $gameSystem._vectorGunElement = ELEMENT_IDS.indexOf(Number(id)) >= 0 ? Number(id) : PHYSICAL;
    stampElement();
  }

  /** Writes the chosen element onto the weapon the effects layer reads. */
  function stampElement() {
    const gun = gunData();
    if (!gun) return;
    const id = activeElementId();
    gun.attackElementId = id > PHYSICAL ? id : 0;
  }

  /** The colour the element is drawn in, for the model's own glow. */
  function elementColor() {
    const FX = window.WeaponHitFX;
    // The pistol is never repainted by the setting: an element the weapon is
    // not carrying yet cannot change how it looks.
    const look = FX && FX.ELEMENTS ? FX.ELEMENTS[activeElementId()] : null;
    return look ? look.color : null;
  }

  /**
   * The part of a model cache key that this gun's own state owns. Every choice
   * made on the gun's screen is in it, because every choice is fitted to the
   * weapon itself: the form, the element and the three modes each hang their
   * own piece of hardware off the frame (Weapon/Weapon3D_Guns.js), so a gun set
   * to fan its shots does not come back out of the cache as a bare one.
   */
  const modelKey = () =>
    (formKey() || 'gun') + ':' + activeElementId() + ':' + modes().slice().sort().join('+');

  //--------------------------------------------------------------------------
  // What the blade changes about a swing
  //--------------------------------------------------------------------------

  // Only the shapes that strike are re-voiced: the coilgun is still a gun and
  // keeps the row's own report and muzzle flash.
  const _Game_Actor_getWeaponSounds_VG = Game_Actor.prototype.getWeaponSounds;
  Game_Actor.prototype.getWeaponSounds = function () {
    if (inMeleeForm() && this.weapons().some(isVectorGun)) return formSounds();
    return _Game_Actor_getWeaponSounds_VG.call(this);
  };

  const _Game_Actor_attackAnimationId1_VG = Game_Actor.prototype.attackAnimationId1;
  Game_Actor.prototype.attackAnimationId1 = function () {
    if (inMeleeForm() && this.weapons().some(isVectorGun)) return formAnimationId();
    return _Game_Actor_attackAnimationId1_VG.call(this);
  };

  // Nothing the gun does costs a round: the frame carries no magazine at all
  // (getWeaponBulletConfig below). The one count it keeps is the coilgun's
  // rack, and the shot that ends it puts the weapon back together as the
  // pistol, because reloading it IS unracking it.
  const _Game_Actor_consumeBullet_VG = Game_Actor.prototype.consumeBullet;
  Game_Actor.prototype.consumeBullet = function () {
    const holdsGun = this.weapons && this.weapons().some(isVectorGun);
    if (!holdsGun) { _Game_Actor_consumeBullet_VG.call(this); return; }
    // The frame builds its own rounds: nothing it does spends a magazine, and
    // no shape it stands in can be caught empty. The only count it still keeps
    // is the coilgun's, which is not ammunition but the length of the rack.
    if (inMeleeForm()) return;
    if (inSniper()) {
      const spent = sniperShotsFired() + (hasMode('overpressure') ? 2 : 1);
      setSniperShotsFired(spent);
      if (spent < magazineSize(SNIPER_SHOTS)) return;
      setSniperShotsFired(0);
      unfold();
      // The coilgun folding itself back is the same machine doing the same
      // thing, so it is shown the same way rather than blinking into a pistol.
      const scene = typeof SceneManager !== 'undefined' ? SceneManager._scene : null;
      if (scene && scene._spriteset && scene._spriteset.updateWeaponSprite) {
        scene._spriteset.updateWeaponSprite();
      }
      playSwitchFx('rise');
      if (window.ParchmentToast) {
        window.ParchmentToast.show(T('VectorGun.toast.unracked'), { key: 'vgform' });
      }
    }
  };

  //--------------------------------------------------------------------------
  // The magazine it does not have
  //--------------------------------------------------------------------------
  // The frame condenses its own rounds, so the gun is never out and no count is
  // ever worn on the attack row: it reports no magazine at all, which is how
  // WeaponSystem says a weapon carries no ammunition. The coilgun's three shots
  // are counted here instead of out of a magazine (consumeBullet above), so
  // racking out still ends by folding the pistol back together.
  const _Game_Actor_getWeaponBulletConfig_VG = Game_Actor.prototype.getWeaponBulletConfig;
  Game_Actor.prototype.getWeaponBulletConfig = function () {
    if (this.weapons && this.weapons().some(isVectorGun)) return null;
    return _Game_Actor_getWeaponBulletConfig_VG.call(this);
  };

  /** How many rounds the coilgun has put downrange since it was racked out. */
  function sniperShotsFired() {
    if (typeof $gameSystem === 'undefined' || !$gameSystem) return 0;
    return Number($gameSystem._vectorGunSniperShots) || 0;
  }

  function setSniperShotsFired(count) {
    if (typeof $gameSystem === 'undefined' || !$gameSystem) return;
    $gameSystem._vectorGunSniperShots = Math.max(0, Number(count) || 0);
  }

  //--------------------------------------------------------------------------
  // What the modes change about a shot
  //--------------------------------------------------------------------------
  // Each of these is one line of the mode's own effect text, and none of them
  // touches an action that is not the vector gun's own attack.

  /** Whether this action is a plain attack made with the gun. */
  function attackWithGun(action) {
    if (!action || typeof action.isAttack !== 'function' || !action.isAttack()) return false;
    const subject = action.subject ? action.subject() : null;
    return !!subject && !!subject.weapons && subject.weapons().some(isVectorGun);
  }

  // Burst fire: the trigger is held down for a second round, at the cost of
  // what each one carries (damageRate) and of the round itself.
  const _Game_Action_numRepeats_VG = Game_Action.prototype.numRepeats;
  Game_Action.prototype.numRepeats = function () {
    const repeats = _Game_Action_numRepeats_VG.call(this);
    if (attackWithGun(this) && !inMeleeForm() && firing(this.subject(), 'burst')) return repeats + 1;
    return repeats;
  };

  // Piercing vectors go through a raised guard as if it were not there.
  const _Game_Action_applyGuard_VG = Game_Action.prototype.applyGuard;
  Game_Action.prototype.applyGuard = function (damage, target) {
    if (attackWithGun(this) && firing(this.subject(), 'pierce')) return damage;
    return _Game_Action_applyGuard_VG.call(this, damage, target);
  };

  // The tracker rides the round onto the target: the shot does not miss.
  const _Game_Action_itemHit_VG = Game_Action.prototype.itemHit;
  Game_Action.prototype.itemHit = function (target) {
    if (attackWithGun(this) && firing(this.subject(), 'tracker')) return 1;
    return _Game_Action_itemHit_VG.call(this, target);
  };

  // Hollow point: what a critical shot is worth, not how often one lands. The
  // multiplier the battle system works out (BattleSystemEnhanced's own
  // applyCritical) is raised rather than replaced, so a character's stats still
  // decide most of it.
  const _Game_Action_applyCritical_VG = Game_Action.prototype.applyCritical;
  Game_Action.prototype.applyCritical = function (damage) {
    const critical = _Game_Action_applyCritical_VG.call(this, damage);
    if (attackWithGun(this) && firing(this.subject(), 'hollowPoint')) {
      return Math.round(critical * (1 + HOLLOW_CRIT_BONUS));
    }
    return critical;
  };

  // Deadeye picks the seam rather than the body.
  const _Game_Action_itemCri_VG = Game_Action.prototype.itemCri;
  Game_Action.prototype.itemCri = function (target) {
    const base = _Game_Action_itemCri_VG.call(this, target);
    if (attackWithGun(this) && firing(this.subject(), 'deadeye')) {
      return Math.min(1, base + DEADEYE_CRIT);
    }
    return base;
  };

  // The element it strikes with is the one the player picked, not the trait the
  // database row was written with.
  // Game_Actor has its own reading of this (bare hands), so the hook goes there
  // rather than on the base class, where it would never be reached.
  const _Game_Actor_attackElements_VG = Game_Actor.prototype.attackElements;
  Game_Actor.prototype.attackElements = function () {
    if (this.weapons().some(isVectorGun)) return [activeElementId()];
    return _Game_Actor_attackElements_VG.call(this);
  };

  // The blow the effects layer draws: in blade form the gun is read as a sword,
  // which is what gives it a swing, a trail off the edge and a cut rather than a
  // muzzle flash. Installed once everything is loaded, because the overlay is a
  // later plugin than this one.
  const _Scene_Boot_start_VG = Scene_Boot.prototype.start;
  Scene_Boot.prototype.start = function () {
    _Scene_Boot_start_VG.call(this);
    stampElement();
    // How far the weapon reaches on a battle map: the coilgun's four times, Long
    // shot's two, or both. MapBattleMode asks this of every weapon, so hooking
    // its one reading is enough for the reach, the preview and the row's label.
    const MBM = window.MapBattleMode;
    if (MBM && MBM.weaponRange && !MBM._vectorGunWrapped) {
      MBM._vectorGunWrapped = true;
      const innerRange = MBM.weaponRange.bind(MBM);
      MBM.weaponRange = function (weapon) {
        const range = innerRange(weapon);
        return isVectorGun(weapon) ? weaponReach(range) : range;
      };
    }
    const FX = window.WeaponHitFX;
    if (FX && !FX._vectorGunWrapped) {
      FX._vectorGunWrapped = true;
      const inner = FX.profileFor.bind(FX);
      FX.profileFor = function (weapon) {
        // Whatever the gun has folded into hits like that weapon type does,
        // unless the shape leaves a mark of its own: the book does not cut, it
        // puts pages through whatever it is pointed at.
        if (isVectorGun(weapon) && inBlade() && FX.PROFILES && FX.BY_WTYPE) {
          const profile = FX.PROFILES[formHitFX() || FX.BY_WTYPE[formWeaponType()]];
          if (profile) return profile;
        }
        return inner(weapon);
      };
    }

    // The weapon overlay reads every pose off the row's weapon type, and the
    // row is the pistol's whatever the frame is standing as: each of these is
    // handed the shape's stand-in row instead (formWeaponRow), so a folded
    // maul hangs off its grip, sways with its own mass and sweeps at what it
    // is aimed at with a trail off the head, while the bow and the darts still
    // shoot. Nothing here re-derives the shape: it is asked for.
    const WSP = window.WeaponSystemProcedural;
    if (WSP && !WSP._vectorGunWrapped) {
      WSP._vectorGunWrapped = true;
      for (const name of FORM_POSE_READINGS) {
        const readAs = WSP[name];
        if (typeof readAs !== 'function') continue;
        // Three arguments covers every reading in the list, and the wrapper is
        // on the frame path: nothing is allocated to pass them on.
        WSP[name] = function (weapon, a, b) {
          if (isVectorGun(weapon) && inBlade()) {
            const row = formWeaponRow();
            if (row) return readAs.call(this, row, a, b);
          }
          return readAs.call(this, weapon, a, b);
        };
      }
      // What the blow IS, which is the one reading the weapon type cannot
      // always answer: a book is filed as a staff and neither casts nor
      // sweeps, it fires its own pages. A shape that names its movement is
      // swung with that and nothing else, and one that does not is left to the
      // stand-in row above.
      const innerMotion = WSP.motionForWeapon;
      WSP.motionForWeapon = function (weapon, model) {
        if (isVectorGun(weapon) && inBlade()) {
          return formMotion() || innerMotion.call(this, formWeaponRow(), model);
        }
        return innerMotion.call(this, weapon, model);
      };
      // buildAttack asks this one directly and lets it override whatever
      // movement was asked for, so a shape that shoots has to answer here as
      // well as above, and a shape that strikes has to answer NOTHING or the
      // pistol's recoil would come back over the swing.
      const innerRanged = WSP.rangedMotionFor;
      WSP.rangedMotionFor = function (weapon, model) {
        if (isVectorGun(weapon) && inBlade()) {
          if (!shootsAtRange()) return null;
          return formMotion() || innerRanged.call(this, formWeaponRow(), model);
        }
        return innerRanged.call(this, weapon, model);
      };
      // And the tag itself. The row carries <Movement: Recoil>, which is the
      // PISTOL's blow: asked for by name it is built as authored and no rule
      // below ever reaches it, which is why every shape was kicking. Folded,
      // the name is dropped and the shape is swung the way it moves of its own
      // accord. A movement a SKILL named is left alone: only what a gun does
      // is taken off a thing that is no longer one.
      const innerBuild = WSP.buildAttack;
      WSP.buildAttack = function (weapon, name, model, opts) {
        if (name && isVectorGun(weapon) && inBlade()) {
          const asked = this.ATTACK_MOTIONS && this.ATTACK_MOTIONS[name];
          if (formMotion() || (asked && GUN_MOTION_KINDS[asked.kind] && !shootsAtRange())) {
            name = null;
          }
        }
        return innerBuild.call(this, weapon, name, model, opts);
      };
    }
  };

  window.VectorGun = {
    WEAPON_ID: VG_ID, MAX_MODES, MODE_KEYS, FLOATING_STATE,
    isVectorGun, isBound, isEm, inStoryMode, inSandboxMode, gunData,
    modes, hasMode, toggleMode, fitMode, boundSpellId, setBoundSpell, spellChoices,
    emActor, wielder, firing,
    scaleOverride, damageTypeOverride, damageRate, spellblasterAction, onShotLanded,
    spellCost, SPELLBLASTER_COST_RATE, SPELLBLASTER_FITTED_RATE,
    // The Blade of Thelema and the element, both read by the screen and by the
    // battle command window.
    BLADE_SOUNDS, BLADE_ANIMATION, bladeReady, inBlade, switchForm,
    FORM_MODES, FORM_KEYS, FORM_CHOICES, GUN_FORM, GUN_WTYPE, SNIPER_FORM,
    SNIPER_SHOTS, isFormMode, fittedForm, setForm, switchTarget,
    sniperShotsFired, setSniperShotsFired,
    formKey, formWeaponType, formBuilder, formAnimationId, formSounds,
    formWeaponRow, formMotion, formHitFX, FORM_POSE_READINGS,
    GRIMOIRE_FORM, openGrimoire, closeGrimoire, inGrimoire,
    SOLOMON_FORM, solomonFitted,
    inMeleeForm, inSniper, rangeMultiplier, weaponReach, shootsAtRange,
    magazineSize, withForm,
    STATUS_MODES, STATUS_CHANCE, HEX_STATES,
    playSwitchFx, playSwitchOn,
    ELEMENT_IDS, elementId, setElement, elementColor, modelKey,
    elementActive, activeElementId, FORM_DAMAGE_BONUS,
    // Whether the party can open the gun's screen at all.
    available: () => (inStoryMode() || inSandboxMode()) && !!(emActor() || wielder()),
  };

  //--------------------------------------------------------------------------
  // Only Em carries it
  //--------------------------------------------------------------------------

  const _Game_BattlerBase_canEquip_VG = Game_BattlerBase.prototype.canEquip;
  Game_BattlerBase.prototype.canEquip = function (item) {
    if (isVectorGun(item) && !isEm(this) && !inSandboxMode()) return false;
    return _Game_BattlerBase_canEquip_VG.call(this, item);
  };

  // Optimize: with Em, the gun is the answer to the weapon slot whatever the
  // parameters of anything else in the bag say.
  const _Game_Actor_bestEquipItem_VG = Game_Actor.prototype.bestEquipItem;
  Game_Actor.prototype.bestEquipItem = function (slotId) {
    if (this.equipSlots()[slotId] === 1 && (isEm(this) || inSandboxMode())) {
      const gun = gunData();
      if (gun && (this.hasWeapon(gun) || $gameParty.numItems(gun) > 0)) return gun;
    }
    return _Game_Actor_bestEquipItem_VG.call(this, slotId);
  };
})();
