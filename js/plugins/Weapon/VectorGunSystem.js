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
 *   OPERATING MODES  what the GUN does. Twenty-three of them, three running at
 *                    once, from Mana bullets to Hexed rounds. They run on the
 *                    unfolded pistol and on nothing else: a frame that has
 *                    folded into a weapon is not a gun and the bays are out of
 *                    the circuit.
 *   THE ELEMENT      what the PISTOL is loaded with. The coilgun carries one
 *                    of its own, calibrated separately, which is how the frame
 *                    holds two at once. Everything else strikes plain.
 *   THE FORM         what the gun is. One shape fitted at a time, out of the
 *                    gun's own and the twenty-two it folds into. In battle the
 *                    reload row is SWITCH: it reconstructs the weapon as the
 *                    fitted shape and back, costs no turn and can be done as
 *                    often as she likes. Left as the gun, SWITCH racks it out
 *                    into a coilgun sniper rifle instead: three shots, four
 *                    times the reach, and the third round spent folds it back.
 *   THE CALIBRATION  what each SHAPE carries of its own, in place of the bays
 *                    and the element it gave up: one gimmick apiece, set on
 *                    the Calibrate page and remembered per shape, so refitting
 *                    a shape finds it exactly as it was left.
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
  // What the Solomon incantation is worth. The words of a spell said out in
  // full before it is cast cost the fight a page of everybody's time, and buy
  // this much: every spell read that way lands, or mends, that much harder.
  const SOLOMON_INCANT_BONUS = 0.15;
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
  // Overload and Deep magazine are NOT here: they only ever deepened the
  // coilgun's rack, and the bays stop at the pistol now, so they are the
  // coilgun's own calibration instead (CAL_DEFAULTS.gun.rack). A savegame
  // carrying either in a bay has it moved there rather than dropped.
  const RACK_MODE_KEYS = ['overload', 'deepMagazine'];
  const BASE_MODE_KEYS = [
    'mana', 'psi', 'recoil', 'solomonIncantation', 'card', 'wide', 'burst', 'pierce',
    'drain', 'siphon', 'deadeye', 'tracker', 'hex', 'longshot',
    'venom', 'concussion', 'thermalOverload', 'thermalUnderload',
    'executioner', 'ambush', 'resonance', 'overpressure',
    'hollowPoint',
  ];

  // What Em has earned the right to run. The frame itself still does not grow
  // with her (see above): a mode is worth exactly what it says whenever it is
  // fitted, and nothing is handed over for standing still except the RIGHT to
  // fit it. She walks in with five, and the other twenty come open one at a
  // time across the ninety-nine levels.
  //
  // The order is the order of what a mode is worth: the five she starts with
  // are the ones that decorate a shot, the last ones are the ones that rewrite
  // what a fight is. A mode that only marks a target comes before one that
  // multiplies a number, and one that multiplies a number comes before one
  // that deletes a rule of the battle map (guard, evasion, the miss).
  const MODE_UNLOCK = {
    // Level 1: the five she is handed with the gun. The recital is one of
    // them, so the pact shape is readable from her very first fight.
    card: 1,                 // no number at all: a kill files a card
    solomonIncantation: 1,   // +15% on spells, and only with the book fitted
    venom: 1,                // one mark, 30% of the time
    wide: 1,                 // MORE bodies hit for LESS damage: a trade, not a gain
    recoil: 1,               // knockback and a float: placement, not damage
    // The rest, weakest first.
    concussion: 4,           // the same one mark, on a better state
    thermalOverload: 8,
    thermalUnderload: 12,
    siphon: 17,              // 15% of the damage back as mana
    deepMagazine: 22,        // four more coilgun rounds, damage untouched
    longshot: 27,            // twice the reach, in a ranged shape only
    resonance: 32,           // up to +40%, and only off a full reservoir
    ambush: 38,              // +50%, and only in the opening round
    mana: 44,                // the shot rescaled onto INT
    psi: 50,                 // the shot rescaled onto PSI
    executioner: 56,         // up to +60%, as the target bleeds out
    hollowPoint: 62,         // +75% on a critical, whenever one lands
    overpressure: 68,        // +35% flat, paid for out of the rack
    drain: 74,               // a quarter of everything dealt, back as health
    deadeye: 80,             // +40 points of critical chance, unconditional
    overload: 85,            // the rack doubled, for 15% off every shot
    burst: 89,               // two shots an attack: 140% of one
    hex: 93,                 // five afflictions, 40% of the time, every shot
    pierce: 96,              // guard stops being a rule
    tracker: 99,             // and so does evasion
  };

  // The modes in that order: the screen lists them this way rather than
  // alphabetically, so the page reads as a progression instead of a catalogue.
  const MODE_ORDER = BASE_MODE_KEYS.slice().sort((a, b) =>
    (MODE_UNLOCK[a] || 1) - (MODE_UNLOCK[b] || 1)
    || BASE_MODE_KEYS.indexOf(a) - BASE_MODE_KEYS.indexOf(b));

  /** The level a mode comes open at. */
  const unlockLevel = (key) => MODE_UNLOCK[key] || 1;

  /**
   * Whose levels the gun answers to: Em's, and in the sandbox (where nobody is
   * Em) whoever is carrying it. With the gun nowhere, the frame is as new.
   */
  function gunLevel() {
    const actor = emActor() || wielder();
    return actor && actor.level ? actor.level : 1;
  }

  /** Whether the mode may be fitted at all right now. */
  const isModeUnlocked = (key) => gunLevel() >= unlockLevel(key);

  /** The modes still to come, weakest first, each with the level it opens at. */
  const lockedModes = () => MODE_ORDER.filter((key) => !isModeUnlocked(key))
    .map((key) => ({ key: key, level: unlockLevel(key) }));

  // The shapes the frame reconstructs itself into, one per weapon type the game
  // knows. ONE of them is fitted at a time, in a selector of its own, and the
  // gun's own shape is the default: fitting a shape does not spend a mode bay.
  // In battle the reload row becomes SWITCH, which folds the weapon into the
  // fitted shape and back. It costs no turn and may be done as many times in a
  // round as she likes; the gun carries no ammunition to fill.
  const MAGIC_STYPE_ID = 1;       // the magic side of the skill list, which pays in mana
  const GUN_FORM = 'gun';         // the shape it always comes back to
  const GUN_WTYPE = 9;
  const SNIPER_SHOTS = 3;         // what the coilgun holds before it must reload
  const SNIPER_RANGE = 4;         // and how much further than the pistol it reaches

  // `range` is the reach in squares on a battle map (MapBattleMode): a shape is
  // a real weapon and reaches as far as that weapon does, so folding the gun
  // into a machete gives up the six squares the pistol was shooting over. The
  // gun's own shapes take a multiplier of the row instead.
  // Two columns say what a shape IS, so nothing has to re-derive it from a
  // literal further down:
  //   gunClass  the shape is still a firearm, so the operating modes run on it
  //   element   which of the two element settings it carries: 'base' is the
  //             pistol's own, 'coil' the coilgun's, and anything without the
  //             column strikes plain. The gun's own shape is 'base' implicitly.
  //   rider     the skill category a shape fires off its swing, if it has one
  //   scale     what the blow is worked out from, when the shape says so
  const FORM_MODES = {
    abrasax:   { wtypeId: 1, range: 1, builder: 'createVectorAthameModel' },    // Athame of Abrasax
    thelema:   { wtypeId: 2, range: 1, builder: 'createVectorBladeModel',
                 rider: 'Swordsmanship' },  // Blade of Thelema
    choronzon: { wtypeId: 3, range: 1, builder: 'createVectorMaulModel' },    // Maul of Choronzon
    babalon:   { wtypeId: 4, range: 1, builder: 'createVectorAxeModel' },    // Axe of Babalon
    nuit:      { wtypeId: 5, range: 2, builder: 'createVectorScourgeModel' },    // Scourge of Nuit
    hadit:     { wtypeId: 6, range: 2, builder: 'createVectorStaffModel' },    // Staff of Hadit
    aiwass:    { wtypeId: 7, range: 6, builder: 'createVectorBowModel' },    // Bow of Aiwass
    zos:       { wtypeId: 8, range: 4, builder: 'createVectorDartsModel' },    // Darts of Zos
    baphomet:  { wtypeId: 10, range: 1, builder: 'createVectorTalonsModel' },   // Talons of Baphomet
    kia:       { wtypeId: 11, range: 1, builder: 'createVectorGauntletModel' },   // Gauntlet of Kia
    longinus:  { wtypeId: 12, range: 2, builder: 'createVectorLanceModel' },   // Lance of Longinus
    // The shapes the frame learned later. Each one is a weapon the game
    // already knows how to hold, and each one carries a gimmick of its own
    // rather than the bays and the element the pistol keeps for itself.
    //
    // The empty hands: Em drops the gun outright and the game's own unarmed
    // rig is what she fights with, so this shape names no builder at all.
    fists:     { wtypeId: 11, range: 1, unarmed: true, rider: 'MartialArts' },
    // The frame split down its own seam, a pistol in each hand.
    twin:      { wtypeId: GUN_WTYPE, range: 6, builder: 'createVectorTwinModel',
                 gunClass: true, shoots: true },
    // Cocked rather than drawn, and it holds exactly one bolt.
    crossbow:  { wtypeId: 7, range: 8, builder: 'createVectorCrossbowModel',
                 bullets: 1, shoots: true },
    eris:      { wtypeId: 5, range: 1, builder: 'createVectorNunchakuModel' },   // Nunchaku of Eris
    maat:      { wtypeId: 3, range: 2, builder: 'createVectorFlailModel' },      // Mail of Maat
    bubba:     { wtypeId: 3, range: 1, builder: 'createVectorWrenchModel' },     // Wrench of Bubba
    yaldabaoth:{ wtypeId: 4, range: 1, builder: 'createVectorChainsawModel',     // Chainsaw of Yaldabaoth
                 sounds: ['Machine', 'Saw1', 'Slash1'] },
    nyarlathotep: { wtypeId: 12, range: 2, builder: 'createVectorScytheModel' }, // Scythe of Nyarlathotep
    // The one blade that is not swung with the arm: it reads the mind behind
    // it, so the blow is worked out from PSI and the words it answers to are
    // the mind's own rather than a swordsman's.
    freud:     { wtypeId: 2, range: 1, builder: 'createVectorKatanaModel',       // Katana of Freud
                 rider: 'PsychicAbilities', scale: ['PSI'] },
    // The one shape that mends rather than strikes: a plain attack with it is
    // turned on her own side. Everything it gives up is the price of that.
    gautama:   { wtypeId: 6, range: 4, builder: 'createVectorRosaryModel',       // Rosary of Gautama
                 mends: true, motion: 'cast',
                 sounds: ['Items/bookFlip1', 'Bell1', 'Items/paper_02'] },
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
                 bullets: SNIPER_SHOTS, rangeMul: SNIPER_RANGE, derived: true,
                 gunClass: true, element: 'coil' },
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
  const FISTS_FORM = 'fists';
  const ROSARY_FORM = 'gautama';
  const GRIMOIRE_FORM = 'grimoire';
  const SOLOMON_FORM = 'solomon';

  /** Whether the pact shape is the one fitted in the form bay. */
  const solomonFitted = () => fittedForm() === SOLOMON_FORM;

  // What the form selector offers: the gun's own shape first, then the rest.
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
    // And a savegame from when the coilgun's rack was two of the bays carries
    // one of those: it is moved to the coilgun's own calibration, where the
    // same two settings now live, rather than being sanitised away.
    for (const key of $gameSystem._vectorGunModes) {
      if (RACK_MODE_KEYS.indexOf(key) < 0) continue;
      const rack = calibration(GUN_FORM).rack;
      if (Array.isArray(rack) && rack.indexOf(key) < 0) rack.push(key);
    }
    $gameSystem._vectorGunModes = $gameSystem._vectorGunModes
      .filter((key) => BASE_MODE_KEYS.includes(key) && isModeUnlocked(key))
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
    if (!MODE_KEYS.includes(key) || !isModeUnlocked(key)) return 'locked';
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
   * @returns {{state: string, replaced: ?string, level: ?number}} 'on', 'off'
   *   or 'locked', whatever was pushed out to make room, and the level a
   *   locked mode comes open at.
   */
  function fitMode(key) {
    if (!MODE_KEYS.includes(key) || !isModeUnlocked(key)) {
      return { state: 'locked', replaced: null, level: unlockLevel(key) };
    }
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
    // A stance the shape was held in comes off with the shape itself.
    onFormWorn(formKey(), wielder(), false);
    $gameSystem._vectorGunForm = null;
    $gameSystem._vectorGunBlade = false;
    $gameSystem._vectorGunSniperShots = 0;
    // The shape it was standing in was carrying an element of its own, or
    // none at all: put back whatever the pistol is loaded with, or the row
    // keeps striking with a shape that is no longer in her hand.
    stampElement();
  }

  //--------------------------------------------------------------------------
  // What each shape is calibrated to
  //--------------------------------------------------------------------------
  // Every shape has ONE gimmick of its own, and the Calibrate page is where it
  // is set. The settings are kept per shape, so fitting something else and
  // coming back finds the shape exactly as it was left: nothing is lost by
  // switching, which is the whole point of a frame that reconstructs itself.
  //
  // One bag on $gameSystem, keyed by shape, validated on every read the way
  // the bays are: a savegame from before the page existed reads as empty and
  // every shape answers with its own defaults.

  const CAL_DEFAULTS = {
    gun:          { element: 1, rack: [] },
    abrasax:      { stateId: 48 },
    thelema:      { skillId: 0 },
    freud:        { skillId: 0 },
    fists:        { skillIds: [] },
    kia:          { stance: 34 },
    hadit:        { weathers: [] },
    solomon:      { schools: [] },
    choronzon:    { damageType: 'Blunt' },
    babalon:      { cleave: 'single' },
    nuit:         { paramId: 2 },
    aiwass:       { draw: 'standard' },
    zos:          { venom: 'venom' },
    baphomet:     { take: 'hp' },
    longinus:     { charge: 'brace' },
    twin:         { pattern: 'two' },
    crossbow:     { head: 'piercing' },
    eris:         { discord: 'tight' },
    maat:         { measure: 'health' },
    bubba:        { archetypes: [] },
    yaldabaoth:   { reads: 'wound' },
    nyarlathotep: { bargain: 'patron' },
    gautama:      { mends: 'hp' },
  };

  /** How many entries a shape's multi-choice gimmick holds at once. */
  const CAL_CAPS = { skillIds: 4, weathers: 4, schools: 24, archetypes: 3 };

  /** Whether a shape has a page on the Calibrate tab at all. */
  const isCalibratable = (key) =>
    Object.prototype.hasOwnProperty.call(CAL_DEFAULTS, key);

  /**
   * What one shape is calibrated to. Always an object and always the live one,
   * so a caller may write into it; a shape nobody has touched gets its own
   * defaults rather than an empty record.
   * @param {string} key - GUN_FORM or one of FORM_KEYS
   * @returns {Object} that shape's settings
   */
  function calibration(key) {
    const defaults = CAL_DEFAULTS[key] || {};
    if (typeof $gameSystem === 'undefined' || !$gameSystem) {
      return JSON.parse(JSON.stringify(defaults));
    }
    if (!$gameSystem._vectorGunCal || typeof $gameSystem._vectorGunCal !== 'object') {
      $gameSystem._vectorGunCal = {};
    }
    const bag = $gameSystem._vectorGunCal;
    if (!bag[key] || typeof bag[key] !== 'object') {
      bag[key] = JSON.parse(JSON.stringify(defaults));
    }
    // A field the shape has since been given, on a record written before it
    // had one: filled in rather than left undefined for every reader to guard.
    for (const field of Object.keys(defaults)) {
      if (bag[key][field] === undefined) {
        bag[key][field] = Array.isArray(defaults[field])
          ? defaults[field].slice() : defaults[field];
      }
    }
    return bag[key];
  }

  /** One scalar setting off a shape, with the shape's own default behind it. */
  function calValue(key, field) {
    const value = calibration(key)[field];
    return value === undefined ? (CAL_DEFAULTS[key] || {})[field] : value;
  }

  /** One set-valued setting off a shape, always an array. */
  function calList(key, field) {
    const value = calibration(key)[field];
    return Array.isArray(value) ? value : [];
  }

  /**
   * Writes one setting of one shape.
   * @param {string} key - the shape
   * @param {string} field - one of that shape's own fields
   * @param {*} value - the new value
   * @returns {boolean} whether anything changed
   */
  function setCalibration(key, field, value) {
    if (!isCalibratable(key)) return false;
    const record = calibration(key);
    if (record[field] === value) return false;
    record[field] = value;
    if (key === GUN_FORM && field === 'element') stampElement();
    return true;
  }

  /**
   * Adds or removes one entry of a shape's set-valued setting. The set is a
   * magazine rather than a row of switches: at its cap the OLDEST entry is
   * pushed out to make room, which is how the mode bays already work.
   * @returns {{state: string, replaced: *}} 'on' or 'off', and what was dropped
   */
  function toggleCalibration(key, field, value) {
    if (!isCalibratable(key)) return { state: 'off', replaced: null };
    const record = calibration(key);
    if (!Array.isArray(record[field])) record[field] = [];
    const list = record[field];
    const at = list.indexOf(value);
    if (at >= 0) {
      list.splice(at, 1);
      return { state: 'off', replaced: null };
    }
    let replaced = null;
    const cap = CAL_CAPS[field] || 0;
    if (cap && list.length >= cap) replaced = list.shift();
    list.push(value);
    return { state: 'on', replaced: replaced };
  }

  /**
   * The part of a model cache key the calibration owns: a shape that has been
   * recalibrated must not come back out of the cache wearing the old setting.
   */
  function calibrationKey() {
    const key = fittedForm();
    if (!isCalibratable(key)) return '';
    const record = calibration(key);
    return Object.keys(record).sort()
      .map((field) => field + '=' + String(record[field])).join(',');
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
   * Whether what the frame stands as is still a firearm. The bays are the
   * GUN's: fitted to the pistol, they are what it does. Folded into something
   * that is not a gun at all they are not in the circuit, and the shape's own
   * calibration is what it is worth instead.
   */
  function inGunShape() {
    const key = formKey();
    return !key || !!FORM_MODES[key].gunClass;
  }

  /** Whether this battler is shooting the vector gun with `key` running. */
  function firing(battler, key) {
    if (!battler || !battler.isActor || !battler.isActor()) return false;
    if (!battler.weapons || !battler.weapons().some(isVectorGun)) return false;
    // Only the unfolded pistol runs them. The coilgun is the gun racked out
    // rather than a shape she fitted, and it is bare too: what it is worth is
    // in its own calibration.
    if (formKey()) return false;
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
    // A shape may be worked out from something of its own whatever the bays
    // say: the katana is swung with the mind behind it rather than the arm.
    const key = formKey();
    if (key && FORM_MODES[key].scale &&
      subject && subject.weapons && subject.weapons().some(isVectorGun)) {
      return FORM_MODES[key].scale.slice();
    }
    if (firing(subject, 'mana')) return ['INT'];
    if (firing(subject, 'psi')) return ['PSI'];
    return null;
  }

  /** Wide shots read as area damage, which is what spreads them over parts. */
  function damageTypeOverride(subject, action) {
    if (!action || typeof action.isAttack !== 'function' || !action.isAttack()) return null;
    const holdsGun = !!subject && !!subject.weapons && subject.weapons().some(isVectorGun);
    if (holdsGun && formKey()) return formDamageType();
    return firing(subject, 'wide') ? 'Area' : null;
  }

  /**
   * What each landed shot is worth. Fanning the vectors, splitting them into a
   * burst and running a doubled magazine each give damage up, and they stack:
   * a gun set to do all three is trading hard for it.
   */
  function damageRate(subject, action, target) {
    if (!action) return 1;
    // A spell is the one thing the gun rewrites without firing it. Read out of
    // the open book, word for word, it carries further than the same spell
    // said under the breath: damage and healing alike, since the reading is
    // done over a mending as readily as over a killing.
    const isAttack = typeof action.isAttack === 'function' && action.isAttack();
    if (!isAttack) {
      const skill = (typeof action.isSkill === 'function' && action.isSkill() && action.item)
        ? action.item() : null;
      if (isSpell(skill) && incanting(subject)) return 1 + SOLOMON_INCANT_BONUS;
      return 1;
    }
    // Only the frame itself folds: another hand's weapon is its own weapon
    // whoever is standing next to it.
    const holdsGun = !!subject && !!subject.weapons && subject.weapons().some(isVectorGun);
    let rate = (damageTypeOverride(subject, action) ? WIDE_DAMAGE_RATE : 1);
    // Folded, the whole frame is behind the blow: every shape strikes harder
    // than the pistol does, which is what makes SWITCH worth the round.
    if (holdsGun && formKey()) rate *= 1 + FORM_DAMAGE_BONUS;
    if (firing(subject, 'burst')) rate *= BURST_DAMAGE_RATE;
    if (firing(subject, 'overpressure')) rate *= 1 + OVERPRESSURE_BONUS;
    // A doubled rack is paid for by every round that comes out of it, and it
    // is the coilgun's own setting rather than one of the bays.
    if (holdsGun && inSniper() && calList(GUN_FORM, 'rack').indexOf('overload') >= 0) {
      rate *= OVERLOAD_DAMAGE_RATE;
    }
    // And what the shape she is standing in is worth, which is the whole of
    // what a folded frame carries now that the bays and the element stop at
    // the gun.
    if (holdsGun) rate *= formDamageRate(subject, action, target);
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
   * Whether the Solomon incantation is saying anything for this battler right
   * now. The mode is fitted in the mode bay like any other, but it only speaks
   * over an open book: the pact shape sitting in the form bay (which opens the
   * book by itself at the head of the fight) or the limit break that folds the
   * frame into a grimoire for the length of one. Fitted with neither, the
   * words are not there to read and the mode is inert.
   * @param {Game_Battler} subject - Whoever is about to cast
   * @returns {boolean} true while the reading is running
   */
  function incanting(subject) {
    if (!hasMode('solomonIncantation')) return false;
    if (!subject || !subject.weapons || !subject.weapons().some(isVectorGun)) return false;
    if (solomonFitted()) return true;
    const LB = window.LimitBreak;
    return !!(LB && LB.isGrimoireOpen && LB.isGrimoireOpen(subject));
  }

  /**
   * Whether a skill is a spell at all. The line is not drawn here:
   * window.SkillDetails.isMagical (CategorizedBattleSkills.js) draws it once
   * for the whole game, and the rest is only for a load order where that
   * service is not up yet.
   */
  function isSpell(skill) {
    if (!skill) return false;
    const SD = window.SkillDetails;
    if (SD && typeof SD.isMagical === 'function') return !!SD.isMagical(skill);
    const MN = window.MagicNature;
    const nature = (MN && typeof MN.natureOf === 'function') ? MN.natureOf(skill) : null;
    if (nature) return nature === 'magical';
    return skill.stypeId === MAGIC_STYPE_ID;
  }

  /**
   * The words themselves: a spell's <Lore:> text, resolved for this world
   * (ItemSystemUtils.loreFor), which is the same incantation the skill card
   * prints. A spell whose words were never written, and anything that is not a
   * spell, has nothing to read out and is cast the way it always was.
   * @param {Object} skill - The $dataSkills row about to be cast
   * @returns {string} The incantation, or ""
   */
  function incantation(skill) {
    if (!isSpell(skill)) return '';
    const utils = window.ItemSystemUtils;
    if (!utils || !utils.loreFor) return '';
    try { return utils.loreFor(skill) || ''; } catch (e) { return ''; }
  }

  //--------------------------------------------------------------------------
  // What each shape is worth: the gimmicks
  //--------------------------------------------------------------------------
  // The bays and the element belong to the gun. A shape gives both of them up
  // the moment the frame folds, and what it gets back is ONE thing of its own,
  // set on the Calibrate page and read here. Every one of them is a tradeoff
  // written into a table rather than a gift: more bodies for less damage each,
  // more reach for a softer blow, a state for the chance of nothing at all.

  // The athame: one affliction, at a chance the state itself decides. The
  // harsher it is the thinner the odds, and PSI is what sharpens them.
  const ATHAME_STATES = {
    48: 0.35,   // Bleeding
    38: 0.30,   // Unbalanced
    5: 0.25,    // Blind
    6: 0.20,    // Silence
    52: 0.12,   // Pinned
    13: 0.10,   // Stun
  };
  const PSI_REFERENCE = 60;       // the PSI at which the odds are half again
  const ATHAME_CAP = 0.75;        // and what no amount of it may pass

  // The gauntlet: one stance carried while she stands in it, paid for by a
  // blow that lands softer for as long as it is up.
  const KIA_STANCES = [22, 34, 49, 55];   // Counter Attack, Perfect Focus, Dodge, Combo
  const KIA_STANCE_RATE = 0.88;

  // The axe and the pair of pistols: more bodies, or more rounds, and less of
  // the blow behind each one.
  const CLEAVE_PLANS = {
    single: { repeats: 1, rate: 1.4 },
    double: { repeats: 2, rate: 0.72 },
    triple: { repeats: 3, rate: 0.5 },
  };
  const TWIN_PATTERNS = {
    two: { repeats: 2, rate: 0.7 },
    three: { repeats: 3, rate: 0.55 },
    four: { repeats: 4, rate: 0.44 },
  };

  // The bow: how far it is drawn. Short is close work and finds the seam,
  // long carries across the field and lands softer for it.
  const BOW_DRAWS = {
    short: { range: 3, crit: 0.15, rate: 1 },
    standard: { range: 6, crit: 0, rate: 1 },
    long: { range: 12, crit: 0, rate: 0.8 },
  };

  // The lance: braced behind a shield, held out at reach, or run through.
  const LANCE_CHARGES = {
    brace: { rate: 0.9, pierceGuard: true },
    reach: { range: 4, rate: 1 },
    overrun: { repeats: 2, rate: 0.7 },
  };

  // The crossbow: one bolt, and what is on the end of it.
  const BOLT_HEADS = {
    piercing: { pierceGuard: true, rate: 1 },
    barbed: { stateId: 48, chance: 0.5, rate: 1 },
    splitting: { area: true, rate: 0.7 },
    heavy: { stateId: 13, chance: 0.25, rate: 1.15 },
  };

  // The nunchaku: how wild the blow is. The wider the band the better it does
  // on average and the less any one swing can be counted on.
  const DISCORD_BANDS = {
    tight: { spread: 0.1, rate: 1 },
    wide: { spread: 0.45, rate: 1.12 },
    chaotic: { spread: 0.9, rate: 1.25 },
  };

  // The flail: what the ankh weighs the target against. The further out of
  // balance it is the harder the head comes down, and a target in balance
  // takes less than a plain swing would have given it.
  const MAAT_MEASURES = ['health', 'mana', 'states', 'level'];
  const MAAT_FLOOR = 0.8;
  const MAAT_SWING = 0.7;
  const MAAT_STATE_SPAN = 4;      // states carried before the scale is hard over
  const MAAT_LEVEL_SPAN = 20;     // and levels between them

  // The wrench: a tool built for one job. Against what it was built for it is
  // worth this much more, against anything else that much less.
  const WRENCH_BONUS = 0.75;
  const WRENCH_PENALTY = 0.8;

  // The chainsaw: it reads how far gone the body already is.
  const SAW_READS = ['wound', 'ruin', 'tally'];
  const SAW_FLOOR = 0.85;
  const SAW_BONUS = 1;

  // The scourge: what the lash tears down, and how often it catches.
  const LASH_PARAMS = [2, 3, 4, 5, 6, 7];
  const LASH_CHANCE = 0.45;
  const LASH_RATE = 0.85;

  // The talons: what they take back out of the wound, and what taking it costs
  // the blow. Action points are dearest, because they are what the shapes that
  // fire a skill off a swing run on.
  const TALON_TAKES = {
    hp: { share: 0.25, rate: 1 },
    mp: { share: 0.2, rate: 0.9 },
    tp: { share: 0.15, rate: 0.85 },
  };

  // The maul: what the head actually delivers, which Health_Core reads.
  const MAUL_TYPES = ['Blunt', 'Cutting', 'Piercing', 'Explosive'];

  // The scythe: the bargain struck. A critical is where it reaps, and what it
  // may take is the whole of the choice.
  const REAP_BARGAINS = {
    patron: { chance: 0.2, enemy: true, party: false, rate: 1 },
    tithe: { chance: 0.5, enemy: false, party: true, rate: 1.3 },
    chaos: { chance: 0.5, enemy: true, party: true, rate: 1.1 },
  };
  const REAP_LEVEL_GAP = 10;      // how far above Em is out of its reach

  // The rosary: what the beads may be set to mend. What each of them is worth
  // lives with the mending itself, further down.
  const ROSARY_MENDS = ['hp', 'mp', 'tp', 'state', 'party'];

  // The blade, the katana and the empty hands: how often the swing becomes the
  // thing she was thinking of instead.
  const RIDER_CHANCE = 0.35;

  /** The shape's calibrated reach, when its gimmick moves it. */
  function formOwnRange(key) {
    if (!key) return 0;
    const own = FORM_MODES[key].range || 0;
    if (key === 'aiwass') {
      return (BOW_DRAWS[calValue(key, 'draw')] || BOW_DRAWS.standard).range || own;
    }
    if (key === 'longinus') {
      return (LANCE_CHARGES[calValue(key, 'charge')] || LANCE_CHARGES.brace).range || own;
    }
    return own;
  }

  /** The level of whatever is being struck, enemy or ally. */
  function battlerLevel(battler) {
    if (!battler) return 0;
    if (battler.isActor && battler.isActor()) return battler.level || 0;
    const data = battler.enemy ? battler.enemy() : null;
    if (!data) return 0;
    const BSE = window.BattleSystemEnhanced;
    if (BSE && BSE.Helpers && BSE.Helpers.getEnemyLevel) {
      return Number(BSE.Helpers.getEnemyLevel(data.note)) || 0;
    }
    const match = /<Level:\s*(\d+)>/i.exec(data.note || '');
    return match ? Number(match[1]) : 0;
  }

  /** What the thing being struck is, as the encounter tables file it. */
  function archetypeOfTarget(target) {
    if (!target || !target.isEnemy || !target.isEnemy()) return null;
    const data = target.enemy ? target.enemy() : null;
    if (!data) return null;
    const BSE = window.BattleSystemEnhanced;
    if (BSE && BSE.Helpers && BSE.Helpers.getEnemyArchetype) {
      return BSE.Helpers.getEnemyArchetype(data);
    }
    const match = /<Archetype:\s*(.+?)>/i.exec(data.note || '');
    return match ? match[1].trim() : null;
  }

  /**
   * How far gone a body already is, read three ways. A monster nothing has
   * struck yet has no anatomy at all, which reads as untouched rather than as
   * an error.
   * @param {Game_Battler} target - what is being cut into
   * @param {string} reads - 'wound', 'ruin' or 'tally'
   * @returns {number} 0 for whole, 1 for entirely wrecked
   */
  function bodyRuin(target, reads) {
    const MH = window.MonsterHealth;
    if (!MH || !MH.parts || !target || !target.isEnemy || !target.isEnemy()) return 0;
    let parts = null;
    try { parts = MH.parts(target); } catch (e) { return 0; }
    if (!parts) return 0;
    const keys = Object.keys(parts);
    if (!keys.length) return 0;
    let worst = 0;
    let sum = 0;
    let gone = 0;
    for (const name of keys) {
      const part = parts[name];
      if (!part) continue;
      const max = Number(part.maxHp) || 0;
      const hurt = max > 0
        ? 1 - Math.max(0, Number(part.currentHp) || 0) / max : 0;
      if (part.destroyed) gone++;
      if (hurt > worst) worst = hurt;
      sum += hurt;
    }
    if (reads === 'ruin') return Math.min(1, worst);
    if (reads === 'tally') return Math.min(1, gone / keys.length);
    return Math.min(1, sum / keys.length);
  }

  /** The nunchaku's roll: one draw inside the band it is calibrated to. */
  function discordRate() {
    const band = DISCORD_BANDS[calValue('eris', 'discord')] || DISCORD_BANDS.tight;
    return band.rate * (1 + (Math.random() * 2 - 1) * band.spread);
  }

  /** The ankh's weighing, on whichever scale it was set to. */
  function maatRate(subject, target) {
    if (!target) return MAAT_FLOOR;
    const measure = calValue('maat', 'measure');
    let off = 0;
    if (measure === 'mana') {
      off = target.mmp ? 1 - Math.max(0, target.mp) / target.mmp : 0;
    } else if (measure === 'states') {
      const carried = (target.states && target.states().length) || 0;
      off = Math.min(1, carried / MAAT_STATE_SPAN);
    } else if (measure === 'level') {
      const mine = battlerLevel(subject);
      off = Math.min(1, Math.abs(battlerLevel(target) - mine) / MAAT_LEVEL_SPAN);
    } else {
      off = target.mhp ? 1 - Math.max(0, target.hp) / target.mhp : 0;
    }
    return MAAT_FLOOR + MAAT_SWING * Math.max(0, Math.min(1, off));
  }

  /** Whether the wrench was built for what it is being swung at. */
  function wrenchRate(target) {
    const chosen = calList('bubba', 'archetypes');
    if (!chosen.length) return 1;
    const archetype = archetypeOfTarget(target);
    // An enemy nobody filed reads as "not one of them" rather than as a miss.
    return (archetype && chosen.indexOf(archetype) >= 0)
      ? 1 + WRENCH_BONUS : WRENCH_PENALTY;
  }

  /**
   * What the shape she is standing in does to the blow. Read once per hit,
   * beside the modes, and it answers 1 for a shape with nothing to say.
   */
  function formDamageRate(subject, action, target) {
    const key = formKey();
    if (!key || !isCalibratable(key)) return 1;
    switch (key) {
      case 'babalon':
        return (CLEAVE_PLANS[calValue(key, 'cleave')] || CLEAVE_PLANS.single).rate;
      case 'twin':
        return (TWIN_PATTERNS[calValue(key, 'pattern')] || TWIN_PATTERNS.two).rate;
      case 'aiwass':
        return (BOW_DRAWS[calValue(key, 'draw')] || BOW_DRAWS.standard).rate;
      case 'longinus':
        return (LANCE_CHARGES[calValue(key, 'charge')] || LANCE_CHARGES.brace).rate;
      case 'crossbow':
        return (BOLT_HEADS[calValue(key, 'head')] || BOLT_HEADS.piercing).rate || 1;
      case 'kia':
        return KIA_STANCE_RATE;
      case 'baphomet':
        return (TALON_TAKES[calValue(key, 'take')] || TALON_TAKES.hp).rate;
      case 'nuit':
        return LASH_RATE;
      case 'eris':
        return discordRate();
      case 'maat':
        return maatRate(subject, target);
      case 'bubba':
        return wrenchRate(target);
      case 'yaldabaoth':
        return SAW_FLOOR + SAW_BONUS * bodyRuin(target, calValue(key, 'reads'));
      case 'nyarlathotep':
        return (REAP_BARGAINS[calValue(key, 'bargain')] || REAP_BARGAINS.patron).rate;
      case ROSARY_FORM:
        return rosaryRate();
      default:
        return 1;
    }
  }

  /** How many times the shape brings itself round in one action. */
  function formRepeats() {
    const key = formKey();
    if (key === 'babalon') {
      return (CLEAVE_PLANS[calValue(key, 'cleave')] || CLEAVE_PLANS.single).repeats || 1;
    }
    if (key === 'twin') {
      return (TWIN_PATTERNS[calValue(key, 'pattern')] || TWIN_PATTERNS.two).repeats || 1;
    }
    if (key === 'longinus') {
      return (LANCE_CHARGES[calValue(key, 'charge')] || LANCE_CHARGES.brace).repeats || 1;
    }
    return 1;
  }

  /** Whether the shape goes through a raised guard as if it were not there. */
  function formPiercesGuard() {
    const key = formKey();
    if (key === 'longinus') {
      return !!(LANCE_CHARGES[calValue(key, 'charge')] || {}).pierceGuard;
    }
    if (key === 'crossbow') {
      return !!(BOLT_HEADS[calValue(key, 'head')] || {}).pierceGuard;
    }
    return false;
  }

  /** What the shape adds to the chance of finding a seam. */
  function formCritBonus() {
    const key = formKey();
    if (key !== 'aiwass') return 0;
    return (BOW_DRAWS[calValue(key, 'draw')] || BOW_DRAWS.standard).crit || 0;
  }

  /** The damage type the shape delivers, when it was told to deliver one. */
  function formDamageType() {
    const key = formKey();
    if (key === 'choronzon') {
      const type = calValue(key, 'damageType');
      return MAUL_TYPES.indexOf(type) >= 0 ? type : 'Blunt';
    }
    if (key === 'crossbow' && (BOLT_HEADS[calValue(key, 'head')] || {}).area) return 'Area';
    return null;
  }

  /** Whether the shape in hand mends rather than strikes. */
  const inMendingForm = () => {
    const key = formKey();
    return !!(key && FORM_MODES[key].mends);
  };

  //--------------------------------------------------------------------------
  // What a shape leaves behind
  //--------------------------------------------------------------------------

  /** The athame's mark: one state, at odds PSI sharpens. */
  function applyAthameState(subject, target) {
    const stateId = Number(calValue('abrasax', 'stateId'));
    const base = ATHAME_STATES[stateId];
    if (!base) return;
    const psi = (subject && subject.luk) || 0;
    const chance = Math.min(ATHAME_CAP, base * (1 + psi / PSI_REFERENCE));
    if (Math.random() >= chance) return;
    if (!target.isStateAffected(stateId)) target.addState(stateId);
  }

  /** What the darts are tipped with, out of the same table the rounds use. */
  function applyDartVenom(target) {
    const mode = STATUS_MODES[calValue('zos', 'venom')];
    if (!mode || Math.random() >= STATUS_CHANCE) return;
    if (!target.isStateAffected(mode.stateId)) target.addState(mode.stateId);
  }

  /** What the talons take back out of the wound. */
  function drainTalons(subject, target) {
    const kind = calValue('baphomet', 'take');
    const take = TALON_TAKES[kind] || TALON_TAKES.hp;
    const dealt = (target.result && target.result().hpDamage) || 0;
    if (dealt <= 0) return;
    const back = Math.max(1, Math.floor(dealt * take.share));
    if (kind === 'mp') {
      subject.gainMp(back);
    } else if (kind === 'tp') {
      subject.gainTp(back);
    } else {
      subject.gainHp(back);
      if (subject.startDamagePopup) subject.startDamagePopup();
    }
  }

  /** What the lash tears down, which is a parameter rather than a state. */
  function lashParam(target) {
    if (Math.random() >= LASH_CHANCE) return;
    const paramId = Number(calValue('nuit', 'paramId'));
    if (LASH_PARAMS.indexOf(paramId) < 0 || !target.addDebuff) return;
    target.addDebuff(paramId, 2);
  }

  /** What is on the end of the bolt. */
  function applyBoltHead(target) {
    const head = BOLT_HEADS[calValue('crossbow', 'head')];
    if (!head || !head.stateId || Math.random() >= (head.chance || 0)) return;
    if (!target.isStateAffected(head.stateId)) target.addState(head.stateId);
  }

  /**
   * Whether the scythe may take this one. A boss is a hand-authored fight, a
   * petrodemon is somebody's oil, and anything more than ten levels above Em
   * is simply out of its reach.
   */
  function reapableEnemy(target) {
    if (!target || !target.isEnemy || !target.isEnemy()) return false;
    const data = target.enemy ? target.enemy() : null;
    if (!data) return false;
    if (data._bsePetrodemon) return false;
    if (data.meta && data.meta.Boss) return false;
    if (/<Boss>/i.test(data.note || '')) return false;
    const em = emActor();
    const mine = em ? em.level : 0;
    return battlerLevel(target) <= mine + REAP_LEVEL_GAP;
  }

  /**
   * The reaping. It only ever happens off a critical, it never takes Em, and
   * it takes nobody by any road but the game's own: addState with the death
   * state is what the gravestone, the permadeath rules and the respawn all
   * hang off (BattleSystemEnhancedDeath.js), so nothing here invents a death.
   */
  function reap(subject, target) {
    if (!target.result || !target.result().critical) return;
    const bargain = REAP_BARGAINS[calValue('nyarlathotep', 'bargain')] || REAP_BARGAINS.patron;
    if (Math.random() >= bargain.chance) return;
    const takers = [];
    if (bargain.enemy && reapableEnemy(target)) takers.push(target);
    if (bargain.party && typeof $gameParty !== 'undefined' && $gameParty) {
      const kin = $gameParty.battleMembers().filter(
        (member) => member && member.isAlive() && !isEm(member) && member !== subject);
      if (kin.length) takers.push(kin[Math.floor(Math.random() * kin.length)]);
    }
    if (!takers.length) return;
    const taken = takers[Math.floor(Math.random() * takers.length)];
    const stateId = taken.deathStateId ? taken.deathStateId() : 1;
    if (taken.isStateAffected(stateId)) return;
    taken.addState(stateId);
    if (window.ParchmentToast) {
      window.ParchmentToast.show(
        T('VectorGun.toast.reaped', { name: taken.name ? taken.name() : '' }),
        { key: 'vgreap', severity: 'danger' });
    }
  }

  /**
   * What the shape she is standing in leaves behind, beside what the rounds
   * leave. Called for every landed blow, the swings included: the shapes are
   * not guns and never reach the mode half of onShotLanded at all.
   */
  function onFormHit(subject, target, action) {
    const key = formKey();
    if (!key || !isCalibratable(key)) return;
    if (!subject || !subject.weapons || !subject.weapons().some(isVectorGun)) return;
    if (!target || !target.result || !target.result().isHit()) return;
    if (key === 'nyarlathotep') reap(subject, target);
    if (!target.isAlive()) return;
    switch (key) {
      case 'abrasax': applyAthameState(subject, target); break;
      case 'zos': applyDartVenom(target); break;
      case 'baphomet': drainTalons(subject, target); break;
      case 'nuit': lashParam(target); break;
      case 'crossbow': applyBoltHead(target); break;
      case ROSARY_FORM: mendWithBeads(subject, target); break;
      default: break;
    }
    queueRider(subject, target, action);
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
    // Folded, the bays are not in the circuit: what the blow leaves behind is
    // the shape's own gimmick and nothing else.
    if (formKey()) { onFormHit(subject, target, action); return; }
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
  // What the Calibrate page offers
  //--------------------------------------------------------------------------
  // ONE authority on what each shape may be set to, so the screen invents no
  // option of its own and a new shape needs no new page. A row is
  //
  //   { kind, field, value, source, section, on }
  //
  // where `kind` is 'pick' (one of) or 'multi' (any of, up to the field's cap),
  // `source` says where the row's NAME comes from (the element roll, the state
  // table, the skill database, the weather model, the school list, the
  // archetype roster, the parameter names, or this plugin's own bank) and
  // `section` is the heading it sits under. The screen turns that into cards.

  const SKILL_POWER = (skill) => (skill.mpCost || 0) + (skill.tpCost || 0) * 2;
  const POWER_PER_LEVEL = 1.6;    // how much of a category one level of hers opens
  const OPEN_SKILL_LIMIT = 12;    // and how many of the hardest are offered at once

  // Ranking a category by what it actually hits for means building real
  // actions, which is not free: the answer is kept per category and level and
  // only ever worked out when the page is opened on a shape that needs it.
  const _skillRankCache = {};

  /**
   * The offered skills of one category, hardest last, worked out once.
   * @param {Array} list - the candidates
   * @param {Game_Actor} actor - whose hands they would be used in
   * @param {string} cacheKey - category and level
   */
  function rankByDamage(list, actor, cacheKey) {
    if (_skillRankCache[cacheKey]) return _skillRankCache[cacheKey].slice();
    const SD = window.SkillDetails;
    const scored = list.map((skill) => {
      let hit = 0;
      if (SD && SD.medianDamageFor) {
        // It builds real actions against real creatures: a formula that reaches
        // for something a dummy does not have is a skill we cannot rank, not a
        // crash.
        try { hit = Number(SD.medianDamageFor(skill, actor)) || 0; } catch (e) { hit = 0; }
      }
      if (!hit) hit = SKILL_POWER(skill);
      return { skill: skill, hit: hit };
    });
    scored.sort((a, b) => b.hit - a.hit);
    const out = scored.map((row) => row.skill);
    _skillRankCache[cacheKey] = out;
    return out.slice();
  }

  /**
   * What a shape that fires a skill off its swing may be set to: everything of
   * its category Em has LEARNED, whether or not she carries it in her nine,
   * and the ones her level has opened on top of that. Picking one of the
   * latter teaches her nothing: the frame is reading it, not she.
   * @param {string} category - a Categories.json key
   * @param {Game_Actor} actor - whoever holds the gun
   * @returns {{learned: Array, open: Array}}
   */
  function formSkillPool(category, actor) {
    const out = { learned: [], open: [] };
    const SM = window.SkillMaster;
    if (!SM || !SM.getSkillsByCategory || !actor) return out;
    let all = [];
    try { all = SM.getSkillsByCategory(category) || []; } catch (e) { return out; }
    const ceiling = POWER_PER_LEVEL * (actor.level || 1);
    const band = [];
    for (const skill of all) {
      if (!skill || !skill.name || skill.name.indexOf('<--') === 0) continue;
      if (!skill.damage || !(skill.damage.type > 0)) continue;
      if (actor.isLearnedSkill && actor.isLearnedSkill(skill.id)) {
        out.learned.push(skill);
        continue;
      }
      if (SKILL_POWER(skill) <= ceiling) band.push(skill);
    }
    out.open = rankByDamage(band, actor, category + ':' + (actor.level || 1))
      .slice(0, OPEN_SKILL_LIMIT);
    return out;
  }

  /** The archetypes the wrench may be built for, off the game's own roster. */
  function archetypeRoster() {
    const bank = window.Health && window.Health.Archetypes;
    if (!bank) return [];
    return Array.isArray(bank)
      ? bank.map((row) => row && (row.key || row.name)).filter(Boolean)
      : Object.keys(bank);
  }

  /** The skies the staff may call, off the weather model's own list. */
  function weatherRoster() {
    return ['none', 'rain', 'storm', 'snow'];
  }

  /** The magic schools the book may be dealt from, off the skill categories. */
  function schoolRoster() {
    const SM = window.SkillMaster;
    if (!SM || !SM.getSplitSkillCategories) return [];
    try {
      const split = SM.getSplitSkillCategories();
      return (split && Array.isArray(split.Magic)) ? split.Magic.slice() : [];
    } catch (e) { return []; }
  }

  /** One row per entry of a fixed table, named out of this plugin's own bank. */
  function pickRows(key, field, values, section) {
    const chosen = calValue(key, field);
    return values.map((value) => ({
      kind: 'pick', field: field, value: value, source: 'text',
      section: section, on: String(chosen) === String(value),
    }));
  }

  /** One row per entry of a set, named out of somewhere the game already knows. */
  function multiRows(key, field, values, source, section) {
    const chosen = calList(key, field);
    return values.map((value) => ({
      kind: 'multi', field: field, value: value, source: source,
      section: section, on: chosen.indexOf(value) >= 0,
    }));
  }

  /**
   * The rows the Calibrate page draws for one shape. Answers an empty list for
   * a shape with nothing to set and for a load order where the service a
   * gimmick reads is not up yet, so the page is never a crash.
   * @param {string} key - the FITTED shape
   * @param {Game_Actor} actor - whoever holds the gun
   * @param {Object} [opts] - `chosenOnly` asks for the rows that are lit and
   *   nothing else. The status strip wants a chip, not a page, and building a
   *   skill page means ranking a whole category by what it hits for.
   */
  function calibrationRows(key, actor, opts) {
    if (!isCalibratable(key)) return [];
    const chosenOnly = !!(opts && opts.chosenOnly);
    const pick = (field, values, section) => pickRows(key, field, values, section);
    switch (key) {
      case GUN_FORM: {
        const element = calValue(key, 'element');
        const rack = calList(key, 'rack');
        return ELEMENT_IDS.map((id) => ({
          kind: 'pick', field: 'element', value: id, source: 'element',
          section: 'element', on: Number(element) === id,
        })).concat(RACK_MODE_KEYS.map((mode) => ({
          kind: 'multi', field: 'rack', value: mode, source: 'mode',
          section: 'rack', on: rack.indexOf(mode) >= 0,
        })));
      }
      case 'abrasax':
        return Object.keys(ATHAME_STATES).map((id) => ({
          kind: 'pick', field: 'stateId', value: Number(id), source: 'state',
          section: 'marks', on: Number(calValue(key, 'stateId')) === Number(id),
        }));
      case 'kia':
        return KIA_STANCES.map((id) => ({
          kind: 'pick', field: 'stance', value: id, source: 'state',
          section: 'stance', on: Number(calValue(key, 'stance')) === id,
        }));
      case 'thelema':
      case 'freud':
      case 'fists': {
        const many = key === FISTS_FORM;
        const field = many ? 'skillIds' : 'skillId';
        const chosen = many ? calList(key, field) : [Number(calValue(key, field))];
        const row = (id, section) => ({
          kind: many ? 'multi' : 'pick', field: field, value: id,
          source: 'skill', section: section, on: chosen.indexOf(id) >= 0,
        });
        if (chosenOnly) {
          return chosen.filter((id) => id).map((id) => row(id, 'known'));
        }
        const pool = formSkillPool(FORM_MODES[key].rider, actor);
        return pool.learned.map((skill) => row(skill.id, 'known'))
          .concat(pool.open.map((skill) => row(skill.id, 'reach')));
      }
      case 'hadit':
        return multiRows(key, 'weathers', weatherRoster(), 'weather', 'sky');
      case 'solomon':
        return multiRows(key, 'schools', schoolRoster(), 'school', 'schools');
      case 'bubba':
        return multiRows(key, 'archetypes', archetypeRoster(), 'archetype', 'quarry');
      case 'nuit':
        return LASH_PARAMS.map((id) => ({
          kind: 'pick', field: 'paramId', value: id, source: 'param',
          section: 'lash', on: Number(calValue(key, 'paramId')) === id,
        }));
      case 'zos':
        return Object.keys(STATUS_MODES).map((mode) => ({
          kind: 'pick', field: 'venom', value: mode, source: 'mode',
          section: 'venom', on: calValue(key, 'venom') === mode,
        }));
      case 'choronzon': return pick('damageType', MAUL_TYPES, 'head');
      case 'babalon': return pick('cleave', Object.keys(CLEAVE_PLANS), 'cleave');
      case 'aiwass': return pick('draw', Object.keys(BOW_DRAWS), 'draw');
      case 'longinus': return pick('charge', Object.keys(LANCE_CHARGES), 'charge');
      case 'twin': return pick('pattern', Object.keys(TWIN_PATTERNS), 'pattern');
      case 'crossbow': return pick('head', Object.keys(BOLT_HEADS), 'bolt');
      case 'eris': return pick('discord', Object.keys(DISCORD_BANDS), 'discord');
      case 'maat': return pick('measure', MAAT_MEASURES, 'measure');
      case 'yaldabaoth': return pick('reads', SAW_READS, 'reads');
      case 'nyarlathotep': return pick('bargain', Object.keys(REAP_BARGAINS), 'bargain');
      case 'gautama': return pick('mends', ROSARY_MENDS, 'mends');
      default: return [];
    }
  }

  /** The schools the pact is dealt from, read by BattleSystemActiveSkills.js. */
  const grimoireSchools = () => calList(SOLOMON_FORM, 'schools');

  //--------------------------------------------------------------------------
  // The skill a shape fires off a swing
  //--------------------------------------------------------------------------
  // Three shapes do not simply hit: the blade remembers a piece of
  // swordsmanship, the katana a turn of mind, the empty hands a whole set of
  // forms to draw out of. A swing that rolls it becomes that skill, and it is
  // paid for in action points like any other.
  //
  // The attack itself is NOT rewritten into the skill. An action that stopped
  // reading as an attack would take the modes, the reach and the weapon's own
  // targeting down with it, so the skill is queued as a follow-up action
  // instead, which is the same road a Gunmancer's chained shot already takes
  // (BattleSystemPassiveSkills.js).

  let _riderPending = null;

  /**
   * Which skill, if any, the shape in hand fires off this swing. A blade names
   * one; the empty hands name a set and draw out of it. Nothing is fired that
   * she cannot pay for, and nothing is LEARNED by being fired: the id is read
   * off the calibration, so a skill she has never learned is still hers to use
   * through the frame.
   * @param {Game_Battler} subject - whoever is swinging
   * @returns {?number} a $dataSkills id, or null
   */
  function riderSkillIdFor(subject) {
    const key = formKey();
    if (!key || !FORM_MODES[key].rider) return null;
    if (!subject || !subject.weapons || !subject.weapons().some(isVectorGun)) return null;
    if (typeof $dataSkills === 'undefined' || !$dataSkills) return null;
    const cal = calibration(key);
    const ids = Array.isArray(cal.skillIds)
      ? cal.skillIds.slice() : (cal.skillId ? [cal.skillId] : []);
    const affordable = ids
      .map((id) => $dataSkills[id])
      .filter((skill) => skill && subject.canPaySkillCost && subject.canPaySkillCost(skill));
    if (!affordable.length) return null;
    return affordable[Math.floor(Math.random() * affordable.length)].id;
  }

  /**
   * Lines the skill up behind the swing that provoked it. One per action
   * however many bodies it landed on, so a shape that sweeps three of them
   * does not fire three of the same skill.
   */
  function queueRider(subject, target, action) {
    if (!action || action._vgRiderQueued) return;
    const key = formKey();
    if (!key || !FORM_MODES[key].rider) return;
    // One roll per action, not per body: the mark goes on before the roll, so
    // a swing that carries into three of them does not get three chances.
    action._vgRiderQueued = true;
    if (Math.random() >= RIDER_CHANCE) return;
    const skillId = riderSkillIdFor(subject);
    if (!skillId) return;
    _riderPending = {
      subject: subject,
      skillId: skillId,
      targetIndex: (target && target.index) ? target.index() : -1,
    };
  }

  // The follow-up goes in at the end of the action that provoked it, which is
  // where the battle system is already willing to take one. The cost is paid
  // by the ordinary road (startAction -> useItem -> paySkillCost), so a
  // Battlemage's surcharge still applies, and the purse is checked twice
  // because the swing itself may have emptied it.
  if (typeof BattleManager !== 'undefined' && BattleManager) {
    const _BattleManager_startAction_VG = BattleManager.startAction;
    BattleManager.startAction = function () {
      _riderPending = null;
      _BattleManager_startAction_VG.call(this);
    };

    const _BattleManager_endAction_VG = BattleManager.endAction;
    BattleManager.endAction = function () {
      const pending = _riderPending;
      _riderPending = null;
      if (pending && pending.subject === this._subject &&
        pending.subject.isAlive() && pending.subject.canMove()) {
        const skill = $dataSkills[pending.skillId];
        if (skill && pending.subject.canPaySkillCost(skill)) {
          const rider = new Game_Action(pending.subject);
          rider.setSkill(pending.skillId);
          if (pending.targetIndex >= 0) rider.setTarget(pending.targetIndex);
          pending.subject._actions.unshift(rider);
        }
      }
      _BattleManager_endAction_VG.call(this);
    };
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
  // The shapes reach every weapon type the game knows, and no longer one
  // apiece: her own hands and the armoured gauntlet are both gloves, the bow
  // that is drawn and the crossbow that is cocked are both bows, the pair of
  // pistols is a firearm like the gun itself. What each of them is worth is
  // its own calibration rather than its type.
  //
  // With one of them fitted, the battle command that would reload becomes
  // SWITCH, and the gun reconstructs itself as that shape: the Blade of
  // Thelema is the arrow-headed ritual machete, but the same frame also opens
  // into a lance, a scourge, a bow, a gauntlet, a chainsaw, a set of beads. In
  // any of them it strikes rather than shoots - the type's own sounds, its
  // swing, its hit effect - and it spends no rounds, because switching back
  // and forth is what loads it: every switch fills the magazine. Only one
  // shape can be fitted at a time; loading a second puts the first away.

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
    // Long shot is one of the bays, so it carries only as far as the bays do.
    if (!key && hasMode('longshot') && shootsAtRange()) mul *= LONGSHOT_RANGE;
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
    const own = formOwnRange(key);
    let reach = own || base;
    if (!own) reach *= rangeMultiplier();
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
    // How deep the rack is, which is the coilgun's own calibration rather than
    // a mode: a deeper well is four more rounds, and Overload doubles whatever
    // is in there, so both together carry fourteen.
    if (key === SNIPER_FORM || !key) {
      const rack = calList(GUN_FORM, 'rack');
      if (rack.indexOf('deepMagazine') >= 0) shots += DEEP_MAGAZINE_ROUNDS;
      if (rack.indexOf('overload') >= 0) shots *= 2;
    }
    return shots;
  }

  //--------------------------------------------------------------------------
  // The reconstruction, on screen
  //--------------------------------------------------------------------------
  // SWITCH is a machine folding itself into another weapon, so it is PLAYED
  // rather than swapped: the fold runs on the shape being put away, panel by
  // panel down its own length, the model is rebuilt at the pivot, and the rise
  // unfolds the shape being drawn out of the hand
  // (WeaponSystemProcedural.startVectorSwitch). The battle scene drives the two
  // halves; this is the one place that knows which sprites are holding the gun.

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
   * Plays one half of the fold.
   * @param {string} phase - 'fold' (closing up) or 'rise' (opening out)
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
   * The same fold played on ONE model that is not in anybody's hand:
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
  //--------------------------------------------------------------------------
  // What a shape does the moment it is built, and the moment it is put away
  //--------------------------------------------------------------------------
  // Two of the gimmicks are not about a blow at all: the staff turns the sky
  // over as it comes out, and the gauntlet is a stance she takes rather than
  // something she does with it. Both hang off the fold itself.

  /**
   * The sky the staff is calibrated to, pinned so the weather model does not
   * roll it straight back. A programmatic setWeather alone does not hold: the
   * periodic roll restores the locked type, so the lock and the stability
   * timer have to be written too (Map/WeatherSystem.js changeWeather).
   */
  function turnTheSky() {
    const weather = window.$gameWeather;
    const wanted = calList('hadit', 'weathers');
    if (!weather || !wanted.length) return;
    const pick = wanted[Math.floor(Math.random() * wanted.length)];
    // Indoors there is no sky to turn over, and setWeather says so by doing
    // nothing at all: say it out loud rather than letting it fail quietly.
    if (weather.isInterior) {
      if (window.ParchmentToast) {
        window.ParchmentToast.show(T('VectorGun.toast.noSky'), { key: 'vgsky' });
      }
      return;
    }
    weather._lockedWeatherType = pick;
    if (weather.setWeather) weather.setWeather(pick);
    // Pushed out as far as an ordinary roll would push it, so the next tick
    // leaves it alone.
    weather._weatherStabilityTimer = Math.max(
      Number(weather._weatherStabilityTimer) || 0, 300 * 60);
  }

  /** The stance the gauntlet is held in, put on with it and taken off with it. */
  function wearStance(holder, on) {
    if (!holder || !holder.addState) return;
    const stateId = Number(calValue('kia', 'stance'));
    if (KIA_STANCES.indexOf(stateId) < 0) return;
    if (on) {
      if (!holder.isStateAffected(stateId)) holder.addState(stateId);
    } else if (holder.isStateAffected(stateId)) {
      holder.removeState(stateId);
    }
  }

  /**
   * Everything a shape does by being built or put away. Called from both ends
   * of the fold, so nothing a shape turned on is left running once it is gone.
   * @param {string} key - the shape, or null for the pistol
   * @param {Game_Battler} holder - whoever is holding the frame
   * @param {boolean} on - true as it is built, false as it is put away
   */
  function onFormWorn(key, holder, on) {
    if (!key) return;
    if (key === 'kia') wearStance(holder, on);
    if (key === 'hadit' && on) turnTheSky();
  }

  function switchForm(actor) {
    const target = switchTarget();
    const folded = !formKey();
    const holder = actor || wielder();
    // Whatever it was standing as stops doing whatever that shape does.
    onFormWorn(formKey(), holder, false);
    $gameSystem._vectorGunForm = folded ? target : null;
    // The old flag is kept in step so a savegame written now still reads right
    // to anything that only ever learned about the blade.
    $gameSystem._vectorGunBlade = folded && target === 'thelema';
    // The element goes on with the shape and comes off with it.
    stampElement();
    // The rack is counted from zero every time the coilgun is built.
    setSniperShotsFired(0);
    // And whatever it is standing as now starts doing its own.
    onFormWorn(formKey(), holder, true);
    // There is no magazine to fill (the frame makes its own rounds), but the
    // reconstruction IS the reload motion: a Gunmancer's chamber reads it as
    // one and is paid for it, once a round (BattleSystemPassiveSkills.js).
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

  /** An element id the game knows, or plain physical. */
  const validElement = (id) =>
    ELEMENT_IDS.indexOf(Number(id)) >= 0 ? Number(id) : PHYSICAL;

  /** The element the coilgun is calibrated to, its own and nobody else's. */
  const coilElementId = () => validElement(calValue(GUN_FORM, 'element'));

  /**
   * Which of the two element settings, if either, the shape in hand carries.
   * The element is the GUN's: it is what the pistol is loaded with, and the
   * coilgun is racked out with one of its own, which is how the frame carries
   * two at once. Everything it folds into is a weapon rather than a gun and
   * strikes with nothing but itself.
   * @returns {string} 'base', 'coil' or 'physical'
   */
  function elementSlot() {
    const key = formKey();
    return key ? (FORM_MODES[key].element || 'physical') : 'base';
  }

  /** Whether the setting on the gun's own screen is what is in her hand. */
  function elementActive() {
    return elementSlot() === 'base';
  }

  /**
   * The element the weapon is striking with right now. Everything that asks
   * what the weapon does asks this; elementId() is only ever the setting.
   */
  function activeElementId() {
    const slot = elementSlot();
    if (slot === 'base') return elementId();
    if (slot === 'coil') return coilElementId();
    return PHYSICAL;
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
    // Whatever the shape in hand is actually carrying: the pistol is repainted
    // by its own setting, the coilgun by the one it was racked out with, and a
    // weapon shape by nothing, because it carries nothing.
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
    (formKey() || 'gun') + ':' + activeElementId() + ':' +
    modes().slice().sort().join('+') + ':' + calibrationKey();

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
    // no shape it stands in can be caught empty. What a shape CAN have is a
    // rack of its own - the coilgun's three, the crossbow's single bolt -
    // which is not ammunition but the length of the shape: the round that
    // empties it is what folds the shape away, and that is its reload.
    const key = formKey();
    const rack = key ? FORM_MODES[key].bullets : 0;
    if (!rack) return;
    const spent = sniperShotsFired() + 1;
    setSniperShotsFired(spent);
    if (spent < magazineSize(rack)) return;
    setSniperShotsFired(0);
    unfold();
    // A shape folding itself back is the same machine doing the same thing, so
    // it is shown the same way rather than blinking into a pistol.
    const scene = typeof SceneManager !== 'undefined' ? SceneManager._scene : null;
    if (scene && scene._spriteset && scene._spriteset.updateWeaponSprite) {
      scene._spriteset.updateWeaponSprite();
    }
    playSwitchFx('rise');
    if (window.ParchmentToast) {
      window.ParchmentToast.show(
        key === SNIPER_FORM
          ? T('VectorGun.toast.unracked')
          : T('VectorGun.toast.spent', { form: T('VectorGun.shape.' + key + '.name') }),
        { key: 'vgform' });
    }
  };

  //--------------------------------------------------------------------------
  // The one shape that mends
  //--------------------------------------------------------------------------
  // Every other shape changes how a blow lands. The rosary changes who it
  // lands on: a plain attack with it is turned on her own side. The attack is
  // still an attack - nothing about it is rewritten into a skill, so the
  // reach, the motion and the weapon's own readings all still answer - only
  // the side it is pointed at and what arrives when it gets there.

  const ROSARY_SHARE = 0.6;        // of a blow's worth, as mending
  const ROSARY_PARTY_SHARE = 0.35; // and of that, to each of them when it is spread

  /**
   * What the beads do to the blow's own number. Mending wounds is the blow
   * itself, run backwards; everything else the beads do is worked out in
   * mendWithBeads and the blow lands as nothing.
   */
  const rosaryRate = () =>
    (calValue(ROSARY_FORM, 'mends') === 'hp' ? -ROSARY_SHARE : 0);

  /** The state ids a battler is carrying, however the engine hands them over. */
  function carriedStates(battler) {
    if (!battler || !battler.states) return [];
    const rows = battler.states() || [];
    return rows.map((row) => (row && typeof row === 'object') ? row.id : row)
      .filter((id) => id);
  }

  /** What one telling of the beads is worth, off the hand holding them. */
  const beadWorth = (subject) =>
    Math.max(1, Math.floor(((subject && subject.atk) || 10) * ROSARY_SHARE));

  /**
   * What arrives when the beads are told. Wounds are closed by the blow itself
   * (rosaryRate), so this is everything else they can be set to.
   * @param {Game_Battler} subject - whoever is holding the rosary
   * @param {Game_Battler} target - whoever it was turned on
   */
  function mendWithBeads(subject, target) {
    const kind = calValue(ROSARY_FORM, 'mends');
    const worth = beadWorth(subject);
    if (kind === 'mp') {
      if (target.gainMp) target.gainMp(worth);
      return;
    }
    if (kind === 'tp') {
      if (target.gainTp) target.gainTp(worth);
      return;
    }
    if (kind === 'state') {
      // One affliction off, and never the one that is death itself: lifting
      // that is a resurrection, which is not what a set of beads does.
      const dead = target.deathStateId ? target.deathStateId() : 1;
      const lift = carriedStates(target).find((id) => id !== dead);
      if (lift && target.removeState) target.removeState(lift);
      return;
    }
    if (kind === 'party') {
      if (typeof $gameParty === 'undefined' || !$gameParty) return;
      const share = Math.max(1, Math.floor(worth * ROSARY_PARTY_SHARE));
      for (const member of $gameParty.battleMembers()) {
        if (member && member.isAlive() && member.gainHp) member.gainHp(share);
      }
    }
  }

  // Which side the blow is pointed at. Both readings are answered, because the
  // engine asks one to find the targets and the other to rule them out.
  const _Game_Action_isForFriend_VG = Game_Action.prototype.isForFriend;
  Game_Action.prototype.isForFriend = function () {
    if (attackWithGun(this) && inMendingForm()) return true;
    return _Game_Action_isForFriend_VG.call(this);
  };

  const _Game_Action_isForOpponent_VG = Game_Action.prototype.isForOpponent;
  Game_Action.prototype.isForOpponent = function () {
    if (attackWithGun(this) && inMendingForm()) return false;
    return _Game_Action_isForOpponent_VG.call(this);
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
    if (!attackWithGun(this)) return repeats;
    // A shape that carries into more than one body, or puts out more than one
    // round, says so itself: the pair of pistols, the axe and the lance run
    // through. Each of them pays for it in damageRate.
    if (formKey()) return repeats * formRepeats();
    if (firing(this.subject(), 'burst')) return repeats + 1;
    return repeats;
  };

  // Piercing vectors go through a raised guard as if it were not there.
  const _Game_Action_applyGuard_VG = Game_Action.prototype.applyGuard;
  Game_Action.prototype.applyGuard = function (damage, target) {
    if (attackWithGun(this)) {
      if (formKey() ? formPiercesGuard() : firing(this.subject(), 'pierce')) return damage;
    }
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
    if (!attackWithGun(this)) return base;
    if (formKey()) return Math.min(1, base + formCritBonus());
    if (firing(this.subject(), 'deadeye')) return Math.min(1, base + DEADEYE_CRIT);
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
      // The empty hands are not a shape the frame builds: Em puts the gun
      // down. So the model is the game's own fist for whatever she is, built
      // off the stand-in weapon the unarmed rig already makes for a bare
      // hand, and it is cached under that weapon's key rather than the gun's.
      const innerCreate = WSP.createModel;
      if (typeof innerCreate === 'function') {
        WSP.createModel = function (weapon) {
          if (isVectorGun(weapon) && formKey() === FISTS_FORM && this.unarmedWeaponFor) {
            const fist = this.unarmedWeaponFor(wielder() || emActor());
            if (fist) return innerCreate.call(this, fist);
          }
          return innerCreate.call(this, weapon);
        };
      }
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
    WEAPON_ID: VG_ID, MAX_MODES, MODE_KEYS, MODE_ORDER, FLOATING_STATE,
    // What she has earned: the modes come open one at a time as she levels.
    MODE_UNLOCK, unlockLevel, isModeUnlocked, lockedModes, gunLevel,
    isVectorGun, isBound, isEm, inStoryMode, inSandboxMode, gunData,
    modes, hasMode, toggleMode, fitMode,
    emActor, wielder, firing,
    scaleOverride, damageTypeOverride, damageRate, onShotLanded,
    incanting, incantation, isSpell, SOLOMON_INCANT_BONUS,
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
    elementActive, activeElementId, elementSlot, coilElementId, FORM_DAMAGE_BONUS,
    // What each shape is calibrated to, and the tables the page reads its
    // choices out of. The screen invents no option of its own.
    calibration, calValue, calList, setCalibration, toggleCalibration,
    calibrationKey, isCalibratable, CAL_DEFAULTS, CAL_CAPS, RACK_MODE_KEYS,
    ATHAME_STATES, KIA_STANCES, CLEAVE_PLANS, TWIN_PATTERNS, BOW_DRAWS,
    LANCE_CHARGES, BOLT_HEADS, DISCORD_BANDS, MAAT_MEASURES, SAW_READS,
    LASH_PARAMS, TALON_TAKES, MAUL_TYPES, REAP_BARGAINS, ROSARY_MENDS,
    RIDER_CHANCE, inGunShape, inMendingForm, riderSkillIdFor, formDamageRate,
    formRepeats, formOwnRange, FISTS_FORM, ROSARY_FORM, ROSARY_SHARE,
    calibrationRows, formSkillPool, grimoireSchools, archetypeRoster,
    weatherRoster, schoolRoster,
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
