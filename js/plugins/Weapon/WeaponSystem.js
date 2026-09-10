//=============================================================================
// WeaponSystem.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc v4.0.0 Weapon sounds, ammo and the first-person 3D weapon overlay
 * @author Assistant
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @param pitchVariation
 * @text Pitch Variation
 * @type number
 * @min 0
 * @max 50
 * @default 10
 * @desc Random pitch variation percentage (0-50). Default: 10%
 *
 * @param volume
 * @text Volume
 * @type number
 * @min 0
 * @max 100
 * @default 90
 * @desc Volume for weapon sounds (0-100). Default: 90
 *
 * @param useSubfolder
 * @text Use Weapons Subfolder
 * @type boolean
 * @default true
 * @desc Load sounds from audio/se/Weapons/ subfolder?
 *
 * @param weaponSpriteX
 * @text Weapon X Position
 * @type number
 * @min -9999
 * @max 9999
 * @default 740
 * @desc X position of the held weapon, in game pixels from the left.
 *
 * @param weaponSpriteY
 * @text Weapon Y Position
 * @type number
 * @min -9999
 * @max 9999
 * @default 450
 * @desc Y position of the held weapon, in game pixels from the top.
 *
 * @param debugMode
 * @text Debug Mode
 * @type boolean
 * @default false
 * @desc Enable console logging for debugging?
 *
 * @help WeaponSystem.js
 *
 * Weapon sounds, the ammo/reload system, and the first-person weapon the
 * player looks down at in battle.
 *
 * ============================================================================
 * Every weapon is a 3D model
 * ============================================================================
 *
 * There is no 2D weapon path and no weapon picture folder. What the player
 * holds is a THREE.Group, drawn in the shared overlay in Weapon3DOverlay.js
 * (WeaponThreeScene / Sprite_3DWeapon), and built either from a <3DModel:>
 * GLB or, for every weapon in the database, procedurally by
 * WeaponSystemProcedural.js and its Weapon3D_* family files. An empty right
 * hand is not empty either: it holds the fist of the character's archetype.
 *
 * Spriteset_Battle keeps at most two of them, one per hand
 * (setHeldWeaponModel), and the left hand only appears when the actor is dual
 * wielding or holding claws.
 *
 * ============================================================================
 * Weapon Note Tags
 * ============================================================================
 *
 * MOVEMENT:
 * <Movement: anim1, anim2, anim3>
 * - Names a clip from js/db/Sprites/MovementKeyFrame3d.json to attack with.
 * - Without it the motion comes from the weapon's own measured length and
 *   weight (WeaponSystemProcedural.motionFor), so most weapons need no tag.
 *
 * SHAPE (read by WeaponSystemProcedural):
 * <Whip> / <Flail>
 * - The two shapes that hang off the grip rather than extending it. They get
 *   a rope rig, their own rest pose and their own swing.
 *
 * <Segments: X>
 * - How many links that rope is built from.
 *
 * <3DModel: path> / <3DScale: X> / <3DRotation: x, y, z>
 * - Use an authored GLB instead of a procedural model.
 *
 * SOUND SYSTEM:
 * <weaponSound: filename>
 * - Sets a single sound file for the weapon
 * - Example: <weaponSound: Sword1>
 *
 * <weaponSounds: file1, file2, file3>
 * - Sets multiple sounds that will be chosen randomly
 * - Example: <weaponSounds: Sword1, Sword2, Sword3>
 *
 * <NoMultiAttackSound>
 * - Prevents playing different sounds for each hit in multi-attacks
 * - Only the first hit will play a sound
 *
 * <Weight: grams>
 * - Drives both the attack motion and the recoil of a firearm.
 *
 * BULLET SYSTEM:
 * <Bullets: X>
 * - Set max bullets for weapon (default: unlimited)
 * - Example: <Bullets: 6>
 *
 * <HitSounds: file1, file2, file3>
 * - The sounds this weapon may land with; one is picked per blow. Stamped by
 *   tools/weapons/gen-hit-sounds.js from the weapon's attack animation.
 * - Example: <HitSounds: Slash5, Melee/hit07_mp3>
 *
 * <HitFX: profile>
 * - Draws a named WeaponHitFX profile where the blow lands instead of the one
 *   this weapon's type hits with (light, sword, heavy, axe, whip, staff, bow,
 *   projectile, gun, claw, glove, spear).
 * - Example: <HitFX: gun>
 *
 * <ReloadSound: filename>
 * - Sound effect from audio/se for reloading
 * - Example: <ReloadSound: Reload>
 *
 * ============================================================================
 * File Locations
 * ============================================================================
 *
 * Weapon Sounds (if subfolder enabled): audio/se/Weapons/
 * Weapon Sounds (if subfolder disabled): audio/se/
 * Attack clips: js/db/Sprites/MovementKeyFrame3d.json
 *
 * ============================================================================
 * Terms of Use
 * ============================================================================
 *
 * Free for commercial and non-commercial use.
 *
 * ============================================================================
 * Changelog
 * ============================================================================
 *
 * v4.0.0 - Removed the 2D weapon layer entirely: every weapon renders in 3D
 * v3.2.0 - Added multi-frame sprite animation support and Static animation
 * v3.1.0 - Added smooth FPS-style weapon animations with 16 frames each
 * v3.0.0 - Merged bullet system and weapon sounds into unified plugin
 * v2.0.0 - Added FPS-style weapon sprite display
 * v1.0.0 - Initial release
 */

(() => {
  "use strict";

  const pluginName = "WeaponSystem";
  const parameters = PluginManager.parameters(pluginName);
  const pitchVariation = Number(parameters["pitchVariation"] || 10);
  const volume = Number(parameters["volume"] || 90);
  const useSubfolder = parameters["useSubfolder"] !== "false";
  const weaponSpriteX = Number(parameters["weaponSpriteX"] || 650);
  const weaponSpriteY = Number(parameters["weaponSpriteY"] || 450);
  const debugMode = parameters["debugMode"] === "true";

  // Debug logging helper
  const debugLog = (...args) => {
    if (debugMode) {
      console.log("[WeaponSystem]", ...args);
    }
  };
  // Resolution scaling helpers
  const getResolutionScale = () => {
    if ($gameSystem && $gameSystem.getCurrentResolution) {
      const resolution = $gameSystem.getCurrentResolution();
      return resolution === "16:9" ? { x: 1.568, y: 1.154 } : { x: 1, y: 1 };
    }
    return { x: 1, y: 1 };
  };

  const getScaledWeaponX = (isLeftHand = false) => {
    const scale = getResolutionScale();
    if (isLeftHand) {
      // Left hand weapons: scale from left edge
      return Math.round(200 * scale.x);
    }
    // Right-hand weapon sits on the right side of the screen, behind the
    // battle command menu (command overlay is z-index 350, weapon canvas is 10).
    return Math.round(weaponSpriteX * scale.x);
  };

  const getScaledWeaponY = () => {
    const scale = getResolutionScale();
    return Math.round(weaponSpriteY * scale.y);
  };

  // Default sounds per weapon type (System.json weaponTypes), for whichever
  // weapon carries no <WeaponSound(s):> tag of its own. Blades and blunt
  // weapons keep the plain swing bank as their common ground and layer a
  // sharper or heavier set on top of it, so a dagger and a warhammer no
  // longer share one whoosh.
  // Bow, projectile and gun: the weapon types whose attack is a shot rather
  // than a swing. One shot is one discrete round, which is why they are heard
  // whether or not the round connects.
  const RANGED_WTYPES = [7, 8, 9];

  const DEFAULT_WEAPON_SOUNDS = {
    // Chosen by measuring every candidate in audio/se/Weapons rather than by
    // what its filename claims, because the filenames turned out to be a poor
    // guide. Three numbers decided it: the spectral centroid of the audible
    // part (how much blade there is in it against how much thud), how much of
    // the file is audible at all, and whether the centroid climbs and falls
    // again the way a real pass through the air does.
    //
    // What that turned up: Sword1, Sword2, Sword3 and sword_sound all sit at
    // 319-481 Hz, which is a low knock with no edge in it, and Swing1 to
    // Swing8 are knocks of the same kind whatever their name says. None of
    // those twelve is drawn any more; they stay on disk unused.
    // Sling* and Throw* are the recorded stick swooshes; those names say which
    // slot first used them, not what is in them, and they are the brightest
    // and airiest swings available, so the blades draw them too.
    1: ["knifeSlice2", "blade_03", "Sling3", "Throw3"], // Light: knives, daggers, shivs
    2: ["Slash1", "Sling2", "Sling3", "Throw2", "Spear2"], // Sword
    3: ["Sling1", "Throw2", "Hammer1", "Hammer2"], // Heavy: maces, clubs, hammers, flails
    4: ["Slash1", "Sling1", "Spear1"], // Axe
    5: ["Whip1", "Whip2", "Whip3", "Whip4"], // Whip
    6: ["Sling1", "Sling2", "Throw1"], // Staff
    7: ["Bow", "Bow2", "Bow3"], // Bow
    8: ["Sling1", "Sling2", "Sling3", "Throw1", "Throw2", "Throw3"], // Projectile (name-routed further, see PROJECTILE_NAME_SOUND_RULES)
    9: ["Pistol1", "Pistol2", "Pistol3", "Pistol4", "Pistol5"], // Gun (name-routed further, see GUN_NAME_SOUND_RULES)
    10: ["Throw3", "knifeSlice2", "blade_03", "Sling3"], // Claw
    11: ["Punch1", "Punch2", "Punch3"], // Glove
    12: ["Spear1", "Spear2", "Throw2", "Sling1"] // Spear
  };

  // A firearm database entry is a name, not a caliber: "Shotgun", "Sniper
  // Rifle" and "Desert Eagle" all share wtypeId 9 (Gun), so an explicit
  // <WeaponSound:> tag would have to be hand-authored on every one of the
  // hundreds of procedurally named variants. Routed by name instead, closest
  // match first; anything left over keeps the generic Pistol bank above.
  const GUN_NAME_SOUND_RULES = [
    // The outliers first: half the Gun slot is not a firearm at all, and each
    // of these has a bank of its own cut for it. Nothing here reaches into
    // another SE folder at play time, and nothing here is an engine stock
    // sound: every file named below lives in audio/se/Weapons.
    { test: /taser|stun|shock|\bemp\b|neural|scrambler|paralyz/i,
      sounds: ["Taser1", "Taser2"],
      reload: "Reload" },
    { test: /brainwave|mind|thought|psionic|telepath|headache|knowledge|adaptive combat|cyberarm|arsenal|projector/i,
      sounds: ["Psi1", "Psi2"],
      reload: "Reload" },
    { test: /rail\s*gun|railgun|coil\s*gun|coilgun|gauss|mass driver/i,
      sounds: ["Railgun1", "Railgun2"],
      reload: "Reload5" },
    { test: /laser|\bbeam\b|optical|photon|disintegr/i,
      sounds: ["BeamShot1", "BeamShot2", "LaserShot1"],
      reload: "Reload5" },
    { test: /plasma|heat ray|\bion\b|\bblaster\b|\benergy\b|particle/i,
      sounds: ["LaserShot1", "LaserShot2", "LaserShot3"],
      reload: "Reload5" },
    // A launcher is heard twice: the tube letting go, then what lands.
    { test: /rocket|missile|\brpg\b|manpads|bazooka|launcher|mortar|grenade/i,
      sounds: ["Launch1", "Launch2", "Boom1", "Boom2", "Boom3"],
      reload: "Reload3" },
    { test: /flame|flamethrower|torch|incendiar|napalm|sprayer/i,
      sounds: ["Flame1", "Flame2", "Flame3", "Flame4"],
      reload: "Reload5" },
    { test: /air |pneumat|pump|pressure|potato|spud|t-shirt|cap gun|suction|water|hose|jet cutter|dart|blowgun|seed gun|nail|tranquil/i,
      sounds: ["AirGun1", "AirGun2", "AirGun3"],
      reload: "Reload" },
    // Real firearms, closest match first.
    { test: /shotgun|blunderbuss|riot gun|scattergun|\b12 gauge\b/i,
      sounds: ["Shotgun1", "Shotgun2", "Shotgun3", "Shotgun4", "Shotgun5", "Shotgun6", "Shotgun7", "Shotgun8"],
      reload: "Reload3" },
    { test: /minigun|gatling|machine gun|\bhmg\b|\blmg\b|tommy|thompson|chain gun|volley|autocannon|repeater/i,
      sounds: ["MachineGun1", "MachineGun2", "MachineGun3", "UziAutomatic"],
      reload: "Reload5" },
    { test: /sniper|bolt-action|bolt action|\bdmr\b|marksman|anti-materi[ae]l/i,
      sounds: ["Sniper1", "Sniper2", "Sniper3"],
      reload: "Reload4" },
    { test: /\bsmg\b|uzi|submachine|\bmp\d|\bpdw\b|vector|\baks?-?74u\b|machine pistol/i,
      sounds: ["SMG1", "SMG2", "SMG3", "SMG4", "SMG5", "UziAutomatic"],
      reload: "Reload5" },
    // Black powder comes before the plain rifle rule: a flintlock is not an
    // AK, and half the muzzle-loaders in the database are called rifles.
    { test: /flintlock|wheellock|matchlock|musket|black powder|percussion|arquebus|dueling|harquebus/i,
      sounds: ["Musket1", "Musket2", "Musket3"],
      reload: "Reload4" },
    { test: /desert eagle|hand cannon|\.50\b|magnum/i,
      sounds: ["DesertEagle", "DoubleGunshot"],
      reload: "Reload6" },
    { test: /revolver|six-shooter|six shooter|peacemaker|pepperbox|double-barrel/i,
      sounds: ["Revolver1", "Revolver2", "DoubleGunshot"],
      reload: "Reload7" },
    { test: /rifle|carbine|garand|\bak-|\bar-|\bsks\b|assault|battle rifle/i,
      sounds: ["Rifle1", "Rifle2", "Rifle3", "Rifle4"],
      reload: "Reload4" }
  ];

  // The projectile slot (wtypeId 8) holds slings, blowguns, crossbows and a
  // handful of sci-fi throwables, none of which move or sound like each
  // other; routed the same way as guns, by name, on top of the generic sling
  // fallback above.
  const PROJECTILE_NAME_SOUND_RULES = [
    { test: /crossbow|arbalest/i, sounds: ["Crossbow1", "Crossbow2"], reload: "ReloadBow" },
    { test: /bow\b|longbow|shortbow|recurve/i, sounds: ["Bow", "Bow2", "Bow3"], reload: "ReloadBow" },
    { test: /sling|atlatl|bola|shongo|rope dart/i, sounds: ["Sling1", "Sling2", "Sling3"], reload: null },
    { test: /blowgun|blowpipe|dart|skewer|staple|needle/i, sounds: ["Blowgun1", "Blowgun2"], reload: null },
    { test: /taser|\bemp\b|neural|scrambler|disruptor|cyber warfare|knowledge injector/i,
      sounds: ["Taser1", "Taser2"], reload: null },
    { test: /grenade|explos|rocket|missile|launcher/i,
      sounds: ["Launch1", "Boom1", "Boom2"], reload: "Reload3" },
    { test: /chakram|discus|disc|boomerang|portal/i, sounds: ["Throw1", "Throw2", "Throw3"], reload: null },
    { test: /pepper spray|hairspray|torch|flame/i, sounds: ["Flame1", "Flame3"], reload: null },
    { test: /drone|stellar|swarm/i, sounds: ["Psi1", "LaserShot2"], reload: null }
  ];

  // The SE files in audio/se/Weapons that are not one report but a burst of
  // them, counted off the waveforms rather than read off the names: three or
  // more separate transients in the same file. A weapon drawing one of these
  // is already heard firing several rounds, so it is played once for a whole
  // flurry and never once per hit; the engine reuses one buffer per SE name,
  // so a second copy a frame later only cuts the first one off.
  const MULTI_SHOT_SOUNDS = [
    "UziAutomatic", "MachineGun1", "MachineGun2", "MachineGun3",
    "Musket1", "Taser2", "DoubleGunshot"
  ];

  // How many rounds one Attack sends downrange. A trigger held down is not a
  // single shot: an Uzi empties a third of its magazine in the time a musket
  // fires once, and each of those rounds is its own motion, its own damage and
  // (unless the weapon is <Automatic>) its own report. Routed by name, closest
  // match first, the same way the sound banks are, so the hundreds of
  // procedurally named firearms need no hand-authored tag.
  //   automatic: the shot SE covers the whole burst, so it plays once
  const FIRE_RATE_NAME_RULES = [
    { test: /minigun|gatling|chain gun|autocannon|\brotary\b/i, rate: 6, automatic: true },
    { test: /machine gun|\bhmg\b|\blmg\b|\bmg\b/i, rate: 5, automatic: true },
    { test: /\bsmg\b|uzi|submachine|\bmp\d|\bpdw\b|\baks?-?74u\b|machine pistol|tommy|thompson/i,
      rate: 4, automatic: true },
    { test: /flame|flamethrower|napalm|incendiar|sprayer|water jet|\bhose\b/i, rate: 4, automatic: true },
    { test: /taser|stun|shock|paralyz|scrambler|disruptor/i, rate: 3, automatic: true },
    { test: /volley|repeater|micro-missile|missile array|swarm/i, rate: 3, automatic: false },
    { test: /assault|battle rifle|carbine|bullpup|modular combat|\bak-|\bar-|\bsks\b|memetic rifle/i,
      rate: 3, automatic: true },
    { test: /combat shotgun|tactical shotgun|riot gun|double-barrel|pepperbox|double gun/i,
      rate: 2, automatic: false }
  ];

  /**
   * How many rounds this weapon sends per Attack, and whether its shot SE
   * already covers the burst. Only the three shooting types have a fire rate:
   * a sword swings as often as the actor's attack times say and no more.
   */
  const fireProfileFor = (weapon) => {
    if (!weapon || !RANGED_WTYPES.includes(weapon.wtypeId)) return { rate: 1, automatic: false };
    let rate = weapon.fireRate || 0;
    let automatic = weapon.automatic === true;
    if (!rate || weapon.automatic === undefined) {
      const rule = FIRE_RATE_NAME_RULES.find((r) => r.test.test(weapon.name || ""));
      if (rule) {
        if (!rate) rate = rule.rate;
        if (weapon.automatic === undefined) automatic = rule.automatic;
      }
    }
    // A weapon whose bank is a recorded burst is heard once whatever its name
    // is: the file itself decides that, not the tag.
    if (!automatic) {
      const bank = weaponSoundsFor(weapon) || [];
      automatic = bank.some((n) => MULTI_SHOT_SOUNDS.includes(String(n).split("/").pop()));
    }
    return { rate: Math.max(1, rate || 1), automatic };
  };

  window.WeaponFireRate = { profileFor: fireProfileFor, multiShotSounds: MULTI_SHOT_SOUNDS };

  // Static animation keyframes (no movement, just holds position)
  // Add this near the top of the file where STATIC_ANIMATION is defined (around line 138)
  // Mirrored swing animation for left hand
  // Add this near the top of the file where STATIC_ANIMATION is defined (around line 138)
  // Mirrored swing animation for left hand

  //=============================================================================
  // DataManager
  //=============================================================================

  const _DataManager_createGameObjects = DataManager.createGameObjects;
  DataManager.createGameObjects = function () {
    _DataManager_createGameObjects.call(this);
    $gameParty.initBulletData();
  };

  const _DataManager_isDatabaseLoaded = DataManager.isDatabaseLoaded;
  DataManager.isDatabaseLoaded = function () {
    if (!_DataManager_isDatabaseLoaded.call(this)) {
      return false;
    }
    if (!this._weaponSystemProcessed) {
      this.processWeaponSystemNotetags();
      this._weaponSystemProcessed = true;
    }
    return true;
  };

  DataManager.processWeaponSystemNotetags = function () {
    debugLog("Processing weapon system notetags...");
    for (const weapon of $dataWeapons) {
      if (!weapon) continue;
      this.extractWeaponSystemData(weapon);
    }
    for (const armor of $dataArmors) {
      if (!armor) continue;
      this.extractWeaponSystemData(armor); // Reuse same extraction method
    }
    debugLog("Weapon system processing complete");
  };

  DataManager.extractWeaponSystemData = function (weapon) {
    weapon.weaponSounds = [];
    weapon.noMultiAttackSound = false;
    weapon.fireRate = 0;
    weapon.automatic = undefined;
    weapon.weaponAnimations = [];
    weapon.maxBullets = null;
    weapon.reloadSound = null;
    weapon.weight = 300;
    weapon.segments = null;
    // The three shapes that hang or fold off the grip rather than extending
    // it, which changes the model, its rest pose and the blow it can throw.
    weapon.isWhip = false;
    weapon.isFlail = false;
    weapon.isNunchaku = false;
    weapon.model3d = null;
    weapon.model3dScale = 800.0;
    weapon.model3dScaleAuthored = false;
    weapon.model3dRotation = null;
    const note = weapon.note || "";

    if (note.match(/<Whip>/i)) {
      weapon.isWhip = true;
      debugLog(`Weapon ${weapon.name}: Whip physics enabled`);
    }
    if (note.match(/<Flail>/i)) {
      weapon.isFlail = true;
      debugLog(`Weapon ${weapon.name}: Flail physics enabled`);
    }
    if (note.match(/<Nunchaku>/i)) {
      weapon.isNunchaku = true;
      debugLog(`Weapon ${weapon.name}: Nunchaku motion enabled`);
    }
    // Sound system tags
    if (note.match(/<NoMultiAttackSound>/i)) {
      weapon.noMultiAttackSound = true;
      debugLog(`Weapon ${weapon.name}: NoMultiAttackSound enabled`);
    }
    // <FireRate: n>: how many rounds one Attack sends, each its own motion,
    // damage and (unless <Automatic>) report. Untagged ranged weapons fall
    // back to FIRE_RATE_NAME_RULES.
    const fireRateMatch = note.match(/<FireRate:\s*(\d+)>/i);
    if (fireRateMatch) {
      weapon.fireRate = Math.max(1, parseInt(fireRateMatch[1]));
      debugLog(`Weapon ${weapon.name}: FireRate ${weapon.fireRate}`);
    }
    // <Automatic>: the shot SE is a recorded burst, so it is played once for
    // the whole flurry rather than once per round.
    if (note.match(/<Automatic>/i)) {
      weapon.automatic = true;
      debugLog(`Weapon ${weapon.name}: Automatic fire, one report per burst`);
    } else if (note.match(/<SemiAuto>/i)) {
      weapon.automatic = false;
    }
    const singleMatch = note.match(/<WeaponSound:\s*(.+?)>/i);
    if (singleMatch) {
      const sound = singleMatch[1].trim();
      weapon.weaponSounds.push(sound);
      debugLog(`Weapon ${weapon.name}: Added single sound "${sound}"`);
    }
    const segmentsMatch = note.match(/<Segments:\s*(\d+)>/i);
    if (segmentsMatch) {
      weapon.segments = parseInt(segmentsMatch[1]);
      debugLog(`Weapon ${weapon.name}: Segments set to ${weapon.segments}`);
    }

    const weightMatch = note.match(/<Weight:\s*(\d+)>/i);
    if (weightMatch) {
      weapon.weight = parseInt(weightMatch[1]);
      debugLog(`Weapon ${weapon.name}: Weight set to ${weapon.weight}g`);
    } else {
      weapon.weight = 300; // Default weight
    }
    const multiMatch = note.match(/<WeaponSounds:\s*(.+?)>/i);
    if (multiMatch) {
      const sounds = multiMatch[1]
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s);
      weapon.weaponSounds = weapon.weaponSounds.concat(sounds);
      debugLog(`Weapon ${weapon.name}: Added multiple sounds`, sounds);
    }

    // An authored clip name overrides the motion the weapon's own length and
    // weight imply (WeaponSystemProcedural.motionFor), which is what an
    // untagged weapon swings with.
    const animMatch = note.match(/<Movement:\s*(.+?)>/i);
    if (animMatch) {
      const anims = animMatch[1]
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s);
      weapon.weaponAnimations = anims;
      debugLog(`Weapon ${weapon.name}: Movement`, anims);
    }

    // Bullet system tags
    const bulletsMatch = note.match(/<Bullets:\s*(\d+)>/i);
    if (bulletsMatch) {
      weapon.maxBullets = parseInt(bulletsMatch[1]);
      debugLog(`Weapon ${weapon.name}: Max bullets ${weapon.maxBullets}`);
    }

    // <HitFX: name> names one of WeaponHitFX.PROFILES instead of the profile
    // this weapon's type would hit with. Nothing declares one yet: the type
    // profiles are the whole picture until a weapon asks for its own.
    // <HitSounds: a, b, c> is the pool the procedural hit effect draws its
    // contact sound from, stamped onto every weapon by
    // tools/weapons/gen-hit-sounds.js out of the weapon's own attack
    // animation. One is picked per blow, so the same weapon does not land on
    // the same sample twice running.
    const hitSoundsMatch = note.match(/<HitSounds:\s*(.+?)>/i);
    if (hitSoundsMatch) {
      weapon.hitSounds = hitSoundsMatch[1].split(",").map(x => x.trim()).filter(Boolean);
      debugLog(`Weapon ${weapon.name}: hit sounds`, weapon.hitSounds);
    } else {
      weapon.hitSounds = [];
    }

    const hitFXMatch = note.match(/<HitFX:\s*(\w+)>/i);
    if (hitFXMatch) {
      weapon.hitFX = hitFXMatch[1].toLowerCase();
      debugLog(`Weapon ${weapon.name}: hit FX profile "${weapon.hitFX}"`);
    }

    const reloadMatch = note.match(/<ReloadSound:\s*(\w+)>/i);
    if (reloadMatch) {
      weapon.reloadSound = reloadMatch[1];
      debugLog(`Weapon ${weapon.name}: Reload sound "${weapon.reloadSound}"`);
    }

    // Name-based sound routing for guns and projectiles: only when the
    // weapon carries no explicit tag of its own, so an authored one always
    // wins.
    if (weapon.weaponSounds.length === 0) {
      const rules = weapon.wtypeId === 9 ? GUN_NAME_SOUND_RULES
        : weapon.wtypeId === 8 ? PROJECTILE_NAME_SOUND_RULES
        : null;
      const rule = rules && rules.find((r) => r.test.test(weapon.name || ""));
      if (rule) {
        weapon.weaponSounds = [...rule.sounds];
        if (!weapon.reloadSound && rule.reload) weapon.reloadSound = rule.reload;
        debugLog(`Weapon ${weapon.name}: name-routed sound bank`, rule.sounds);
      }
    }

    // Every bow reloads with its own nock-and-draw, not the generic click.
    if (weapon.wtypeId === 7 && !weapon.reloadSound) {
      weapon.reloadSound = "ReloadBow";
    }

    if (weapon.weaponSounds.length > 0) {
      weapon.weaponSounds = [...new Set(weapon.weaponSounds)];
    }

    // A gun or a bow is one piece of hardware and makes one noise. A melee
    // weapon rolling through a bank of samples reads as the same blade landing
    // differently each time, but a pistol that fires a different report every
    // shot reads as a different pistol every shot. The bank is therefore
    // collapsed to a single entry, picked off the weapon's own id so it is the
    // same report for the life of that weapon while two different pistols can
    // still sound unlike each other.
    if (RANGED_WTYPES.includes(weapon.wtypeId) && weapon.weaponSounds.length > 1) {
      weapon.weaponSounds = [weapon.weaponSounds[weapon.id % weapon.weaponSounds.length]];
    }

    // Process skills for movement tags
    for (const skill of $dataSkills) {
      if (!skill) continue;
      skill.weaponAnimations = [];

      const skillNote = skill.note || "";
      const skillAnimMatch = skillNote.match(/<Movement:\s*(.+?)>/i);
      if (skillAnimMatch) {
        const anims = skillAnimMatch[1]
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s);
        skill.weaponAnimations = anims;
        debugLog(`Skill ${skill.name}: Movement`, anims);
      }
    }

    const model3dMatch = note.match(/<3DModel:\s*(.+?)>/i);
    if (model3dMatch) weapon.model3d = model3dMatch[1].trim();

    // On a <3DModel> weapon this is the GLB's absolute scale. On a procedural
    // one the size comes from the bounding-box fit, so an authored value acts
    // as a relative multiplier on it (the flag tells the two apart from the
    // 800.0 default).
    const scale3dMatch = note.match(/<3DScale:\s*([\d.]+)>/i);
    if (scale3dMatch) {
      weapon.model3dScale = parseFloat(scale3dMatch[1]);
      weapon.model3dScaleAuthored = true;
    }

    const rot3dMatch = note.match(/<3DRotation:\s*([\d.-]+)\s*,\s*([\d.-]+)\s*,\s*([\d.-]+)>/i);
    if (rot3dMatch) weapon.model3dRotation = { x: parseFloat(rot3dMatch[1]), y: parseFloat(rot3dMatch[2]), z: parseFloat(rot3dMatch[3]) };
  };

  //=============================================================================
  // Game_Party - Bullet Data Management
  //=============================================================================

  Game_Party.prototype.initBulletData = function () {
    if (!this._bulletData) {
      this._bulletData = {};
    }
  };

  Game_Party.prototype.getBulletData = function (actorId, weaponId) {
    this.initBulletData();
    const key = `${actorId}_${weaponId}`;
    return this._bulletData[key];
  };

  Game_Party.prototype.setBulletData = function (actorId, weaponId, value) {
    this.initBulletData();
    const key = `${actorId}_${weaponId}`;
    this._bulletData[key] = value;
  };

  //=============================================================================
  // Game_Actor - Weapon System
  //=============================================================================

  // Sound system methods







  /**
   * What a weapon sounds like, whoever is holding it and wherever it is being
   * held: its own <weaponSound(s)> if it declares any, otherwise the default
   * bank for its type. No weapon at all is a bare hand, which is what the
   * Glove bank (type 11) is.
   */
  const weaponSoundsFor = (weapon) => {
    if (!weapon) return DEFAULT_WEAPON_SOUNDS[11];
    if (weapon.weaponSounds && weapon.weaponSounds.length > 0) {
      return weapon.weaponSounds;
    }
    if (weapon.wtypeId && DEFAULT_WEAPON_SOUNDS[weapon.wtypeId]) {
      const bank = DEFAULT_WEAPON_SOUNDS[weapon.wtypeId];
      // The type fallback bank is collapsed the same way the tagged one is, so
      // a weapon that never got a tag still fires the same report every time.
      if (RANGED_WTYPES.includes(weapon.wtypeId) && bank.length > 1) {
        return [bank[(weapon.id || 0) % bank.length]];
      }
      return bank;
    }
    return null;
  };

  /**
   * Plays one entry of a sound list, pitch-varied.
   * @returns {number} the pitch it was played at, so a caller can layer another
   *   SE over it in tune, or 0 when the list has nothing to say.
   */
  const playSoundList = (sounds) => {
    if (!sounds || sounds.length === 0) return 0;

    const soundName = sounds[Math.floor(Math.random() * sounds.length)];
    const randomPitch = 100 + (Math.random() * pitchVariation * 2 - pitchVariation);
    const pitch = Math.round(Math.max(50, Math.min(150, randomPitch)));
    const finalSoundName =
      useSubfolder && !soundName.includes("/") ? "Weapons/" + soundName : soundName;

    debugLog(`Playing weapon sound "${finalSoundName}" (pitch: ${pitch})`);
    try {
      AudioManager.playSe({
        name: finalSoundName,
        volume: volume,
        pitch: pitch,
        pan: 0,
      });
    } catch (error) {
      console.error("[WeaponSystem] Error playing sound:", error);
      return 0;
    }
    return pitch;
  };

  const playWeaponSoundFor = (weapon) => playSoundList(weaponSoundsFor(weapon));

  // What a ranged weapon sounds like once it has run dry and Attack becomes
  // Bash: a plain melee strike with the weapon in hand, not a gunshot or a
  // bowstring, so it borrows the recorded swooshes the melee banks draw.
  const BASH_SOUNDS = ["Sling1", "Sling2", "Sling3", "Throw1", "Throw2", "Throw3"];

  // The one reading of what a weapon sounds like, so anything holding one
  // outside a battle (the dream's first-person weapon, DreamSystem.js) makes
  // the same noise the same weapon makes in the party's hands.
  window.WeaponSounds = { soundsFor: weaponSoundsFor, play: playWeaponSoundFor };

  Game_Actor.prototype.getWeaponSounds = function () {
    if (this.isOutOfBullets()) return BASH_SOUNDS;
    return weaponSoundsFor(this.weapons()[0]);
  };

  /**
   * The fire profile of the weapon actually in hand. A dry magazine turns
   * Attack into Bash, one strike with the thing itself, so there is no burst
   * and no automatic report to fold.
   */
  Game_Actor.prototype.fireProfile = function () {
    if (this.isOutOfBullets()) return { rate: 1, automatic: false };
    return fireProfileFor(this.weapons()[0]);
  };

  Game_Actor.prototype.fireRate = function () {
    return this.fireProfile().rate;
  };

  Game_Actor.prototype.isAutomaticWeapon = function () {
    return this.fireProfile().automatic;
  };

  Game_Actor.prototype.hasNoMultiAttackSound = function () {
    const weapons = this.weapons();
    if (weapons.length === 0) return false;

    const weapon = weapons[0];
    return weapon && weapon.noMultiAttackSound === true;
  };

  Game_Actor.prototype.playWeaponSound = function () {
    const pitch = playSoundList(this.getWeaponSounds());
    // Layer the elemental shimmer SE over the weapon sound when applicable.
    if (pitch) this.playWeaponShimmerSE(pitch);
  };

  // Bullet system methods
  Game_Actor.prototype.getWeaponBulletConfig = function () {
    const weapons = this.weapons();
    if (weapons.length === 0) return null;

    const weapon = weapons[0];
    if (!weapon || !weapon.maxBullets) return null;

    return {
      max: weapon.maxBullets,
      weaponId: weapon.id,
    };
  };

  Game_Actor.prototype.getCurrentBullets = function () {
    const config = this.getWeaponBulletConfig();
    if (!config) return null;

    let current = $gameParty.getBulletData(this.actorId(), config.weaponId);
    if (current === undefined) {
      current = config.max;
      $gameParty.setBulletData(this.actorId(), config.weaponId, current);
    }
    return current;
  };

  Game_Actor.prototype.setCurrentBullets = function (value) {
    const config = this.getWeaponBulletConfig();
    if (!config) return;

    const clamped = Math.max(0, Math.min(value, config.max));
    $gameParty.setBulletData(this.actorId(), config.weaponId, clamped);
  };

  Game_Actor.prototype.consumeBullet = function () {
    const current = this.getCurrentBullets();
    if (current !== null && current > 0) {
      this.setCurrentBullets(current - 1);
    }
  };

  Game_Actor.prototype.reloadBullets = function () {
    const config = this.getWeaponBulletConfig();
    if (!config) return;

    this.setCurrentBullets(config.max);

    const weapons = this.weapons();
    if (weapons.length > 0) {
      const weapon = weapons[0];
      const soundName = weapon.reloadSound || "Reload";  // i18n-ignore  audio/se/Weapons filename
      // A reload named with a folder of its own (an energy weapon spinning up,
      // say) is left alone; a bare name is a file in audio/se/Weapons.
      const reloadName = soundName.includes("/") ? soundName : "Weapons/" + soundName;

      AudioManager.playSe({
        name: reloadName,
        volume: 90,
        pitch: 100,
        pan: 0,
      });

      const scene = SceneManager._scene;
      const sprites = scene && scene._spriteset && scene._spriteset._3dWeaponSprites;
      if (sprites) {
        // Every hand that is holding something works on it: the gun being
        // reloaded is not always the right one (a pistol carried offhand is
        // still a pistol), and only the hand that holds the weapon used to
        // move at all.
        for (const hand in sprites) {
          const sprite3d = sprites[hand];
          if (sprite3d && sprite3d.playReload) sprite3d.playReload();
        }
      }
    }
  };

  Game_Actor.prototype.isOutOfBullets = function () {
    const current = this.getCurrentBullets();
    return current !== null && current <= 0;
  };

  Game_Actor.prototype.canAttackWithBullets = function () {
    const config = this.getWeaponBulletConfig();
    if (!config) return true;

    const current = this.getCurrentBullets();
    return current > 0;
  };

  //=============================================================================
  // Game_Action - Bullet Consumption
  //=============================================================================

  const _Game_Action_apply = Game_Action.prototype.apply;
  Game_Action.prototype.apply = function (target) {
    const subject = this.subject();

    if (this.isAttack() && subject.isActor()) {
      // Out of bullets: Attack is now Bash, an ordinary strike with whatever
      // is in hand rather than a shot, so it still lands and costs no ammo.
      if (subject.canAttackWithBullets()) {
        subject.consumeBullet();
      }
    }

    _Game_Action_apply.call(this, target);
  };

  const _Game_Action_numRepeats = Game_Action.prototype.numRepeats;
  Game_Action.prototype.numRepeats = function () {
    const subject = this.subject();

    if (this.isAttack() && subject && subject.isActor()) {
      let repeats = _Game_Action_numRepeats.call(this);
      // The trigger held down: every extra round of the burst is a repeat of
      // its own, so it gets its own motion, its own damage and its own report.
      // The Attack Times trait a firearm carries says the same thing the fire
      // rate says, so the two are read as one reading of how many rounds leave
      // the barrel, never added together.
      const rate = subject.fireRate();
      if (rate > 1) repeats = Math.max(repeats, rate);
      const current = subject.getCurrentBullets();
      // A full or partial magazine still caps the repeat count at what's
      // left; an empty one no longer caps it at zero hits, that's the Bash.
      if (current !== null && current > 0) return Math.min(repeats, current);
      // Dry: the Bash is one swing of the thing itself, never a burst of them.
      if (current !== null) return 1;
      return repeats;
    }

    return _Game_Action_numRepeats.call(this);
  };

  //=============================================================================
  // Game_Action - What a Shot and a Bash Are Worth
  //=============================================================================

  // A gun held by the barrel is a poor club: the Bash lands with a fraction of
  // what the weapon is worth when it is doing what it was built to do.
  const BASH_DAMAGE_RATE = 0.4;

  /**
   * A burst is not free damage. Every round of it rolls the weapon's full
   * damage on its own, so a six round rate would otherwise be six times the
   * one swing a sword gets in the same turn. Each round is worth less the
   * faster they leave the barrel, so the whole burst grows with the square
   * root of the rate: 6 rounds hit about 2.4 times as hard as a single shot,
   * not 6 times.
   */
  const burstDamageRate = (rate) => (rate > 1 ? 1 / Math.sqrt(rate) : 1);

  const _Game_Action_makeDamageValue = Game_Action.prototype.makeDamageValue;
  Game_Action.prototype.makeDamageValue = function (target, critical) {
    let value = _Game_Action_makeDamageValue.call(this, target, critical);
    const subject = this.subject();
    if (!this.isAttack() || !subject || !subject.isActor()) return value;

    const weapon = subject.weapons()[0];
    if (!weapon || !RANGED_WTYPES.includes(weapon.wtypeId)) return value;

    if (subject.isOutOfBullets()) return Math.round(value * BASH_DAMAGE_RATE);
    return Math.round(value * burstDamageRate(subject.fireRate()));
  };

  window.WeaponDamageRates = { bash: BASH_DAMAGE_RATE, burst: burstDamageRate };

  //=============================================================================
  // Window_BattleLog - Weapon Sounds
  //=============================================================================

  const _Window_BattleLog_startAction = Window_BattleLog.prototype.startAction;
  Window_BattleLog.prototype.startAction = function (subject, action, targets) {
    if (action && subject && subject.isActor()) {

      if (action.isAttack()) {
        this._lastAttacker = subject;
        this._multiAttackHitCount = 0;
        this._skillAnimations = null;
        debugLog(`Tracking attacker: ${subject.name()}`);
      } else if (action.isSkill()) {
        const skill = action.item();
        const weapons = subject.weapons();
        const wtypeId = (weapons.length && weapons[0]) ? weapons[0].wtypeId : 0;
        // A weapon that shoots plays its own shot for a skill as well as for a
        // plain attack. What a bow, a sling or a gun does is decided by the
        // weapon and not by the name the skill asked for
        // (WeaponSystemProcedural.rangedMotionFor), so there is no sword swing
        // to suppress here: suppressing it is what left an archer standing
        // still for every skill they used, holding a bow that never moved.
        const shoots = wtypeId === 7 || wtypeId === 8 || wtypeId === 9;
        const declared = !!(skill && skill.weaponAnimations && skill.weaponAnimations.length > 0);
        // Claws and gloves are still left out: they have no motion of their own
        // to fall back on, so a skill would swing them like a sword.
        const swings = declared && wtypeId !== 10 && wtypeId !== 11;

        if (shoots && (declared || action.isPhysical())) {
          this._lastAttacker = subject;
          this._multiAttackHitCount = 0;
          // null: its own shot, not whatever movement the skill named.
          this._skillAnimations = null;
          debugLog(`Skill ${skill.name} shoots with the weapon's own motion`);
        } else if (swings) {
          this._lastAttacker = subject;
          this._multiAttackHitCount = 0;
          this._skillAnimations = skill.weaponAnimations;
          debugLog(
            `Skill ${skill.name} has animations:`,
            this._skillAnimations
          );
        } else {
          this._lastAttacker = null;
          this._multiAttackHitCount = 0;
          this._skillAnimations = null;
        }
      } else {
        this._lastAttacker = null;
        this._multiAttackHitCount = 0;
        this._skillAnimations = null;
      }
    } else {
      this._lastAttacker = null;
      this._multiAttackHitCount = 0;
      this._skillAnimations = null;
    }

    // A plain weapon attack is drawn by WeaponHitFX now, so the database
    // animation the weapon names is not shown on top of it. Skills keep
    // whatever animation they were authored with.
    this._hitFXAttack = !!(
      action && action.isAttack && action.isAttack() &&
      subject && subject.isActor() &&
      window.WeaponHitFX && window.WeaponHitFX.isEnabled()
    );

    _Window_BattleLog_startAction.call(this, subject, action, targets);
  };

  /**
   * A plain weapon attack is drawn by WeaponHitFX and heard through the tags
   * on the weapon itself, so the database animation is not played at all: not
   * its picture, and not its sound timings either. What it used to sound like
   * now lives on the weapon as <WeaponSounds:> and <HitSounds:>, stamped there
   * by tools/weapons/gen-hit-sounds.js.
   */
  const _Window_BattleLog_showAnimation = Window_BattleLog.prototype.showAnimation;
  Window_BattleLog.prototype.showAnimation = function (subject, targets, animationId) {
    if (this._hitFXAttack) return;
    _Window_BattleLog_showAnimation.call(this, subject, targets, animationId);
  };

  const _Window_BattleLog_displayActionResults =
    Window_BattleLog.prototype.displayActionResults;
  Window_BattleLog.prototype.displayActionResults = function (subject, target) {
    // Play weapon animation on ANY attack action result (hit, miss, evade, counter, etc.)
    if (
      target &&
      target.result().used &&
      this._lastAttacker &&
      this._lastAttacker.isActor()
    ) {
      const actor = this._lastAttacker;
      const weapons = actor.weapons();
      const isDualWielding = weapons.length >= 2;

      // Determine weapon index for dual wield
      let weaponIndex = 0;
      if (isDualWielding) {
        this._multiAttackHitCount = this._multiAttackHitCount || 0;
        const weapon1Repeats = weapons[0] ? actor.attackTimesAdd() + 1 : 1;
        weaponIndex = this._multiAttackHitCount < weapon1Repeats ? 0 : 1;
      }

      // Play animation even on miss/evade/counter
      // Map-battle mode runs the battle log over Spriteset_Map, which has no
      // weapon sprites, so only call it where the method actually exists.
      const spriteset = SceneManager._scene && SceneManager._scene._spriteset;
      // A critical hit is a different blow, not the same one with a bigger
      // number over it, so the swing is told which one it is.
      if (spriteset && typeof spriteset.playWeaponAnimation === "function") {
        spriteset.playWeaponAnimation(
          this._skillAnimations,
          weaponIndex,
          { crit: !!target.result().critical }
        );
      }

      // The mark the blow leaves, drawn on the target rather than played out
      // of Animations.json. Only on a landed hit: a miss has the swing sound
      // and nothing else.
      if (this._hitFXAttack && target.result().isHit() &&
          spriteset && typeof spriteset.playWeaponHitFX === "function") {
        let hitWeapon = weapons[weaponIndex] || weapons[0];
        if (!hitWeapon && window.WeaponSystemProcedural) {
          hitWeapon = WeaponSystemProcedural.unarmedWeaponFor(actor);
        }
        spriteset.playWeaponHitFX(hitWeapon, target, {
          crit: !!target.result().critical,
          leftHand: weaponIndex === 1,
          // The animation's own SE travels with the effect and is played on
          // the beat it lands on, so the fallback impact bank stays quiet.
          // A bow, a sling and a gun are heard through their own shot, which
          // displayActionResults plays below; they have no contact sound.
          silent: !window.WeaponHitFX.swings(hitWeapon),
          // Nothing got through: the blow rings off the target instead of
          // cutting it, and holds on the contact for longer.
          blocked: (target.result().hpDamage || 0) <= 0
        });
      }

      // The swing is heard whether or not it connects. A blade going past a
      // target that dodged still cuts the air, an arrow still leaves the
      // string and a gun still goes off; only the impact above is gated on
      // the blow landing, which is why a miss is a whoosh and nothing else.
      // (A landed hit on an enemy is sounded again by displayHpDamage, which
      // never runs on a miss, so this cannot double one up.)
      if (!this._skillAnimations) {
        const heldWeapon = weapons[weaponIndex] || weapons[0];
        // A round leaves the barrel or the string on every shot of a burst,
        // hit or miss, so a ranged weapon is never folded into one report for
        // the whole flurry the way a multi-hit swing is.
        const ranged = !!(heldWeapon && RANGED_WTYPES.includes(heldWeapon.wtypeId)) &&
          !actor.isOutOfBullets();
        // An <Automatic> weapon, or one whose bank is a recorded burst, is the
        // exception to that: the file already holds every report of the
        // flurry, so it is played on the first round and left to run.
        const automatic = ranged && fireProfileFor(heldWeapon).automatic;
        const noMultiSound = automatic || (!ranged && actor.hasNoMultiAttackSound());
        this._multiAttackHitCount = this._multiAttackHitCount || 0;

        if (this._multiAttackHitCount === 0 || !noMultiSound) {
          actor.playWeaponSound();
        }
      }

      this._multiAttackHitCount = (this._multiAttackHitCount || 0) + 1;
    }

    _Window_BattleLog_displayActionResults.call(this, subject, target);
  };
  // In Window_BattleLog.prototype.displayHpDamage - Replace the existing method:
  const _Window_BattleLog_displayHpDamage =
    Window_BattleLog.prototype.displayHpDamage;
  Window_BattleLog.prototype.displayHpDamage = function (target) {
    if (
      target &&
      target.isActor() &&
      SceneManager._scene._spriteset &&
      SceneManager._scene._spriteset._shieldSprite
    ) {
      SceneManager._scene._spriteset._shieldSprite.playBlockAnimation();
      debugLog("Shield block animation triggered");
    }

    // The swing used to be played a second time here, on top of the one
    // displayActionResults already played for the same blow. Two copies of the
    // same file a frame apart do not sound like two hits: the engine reuses one
    // buffer per SE name, so the second call cuts the first off and what comes
    // out is a smeared half-swing, or nothing at all. It also advanced
    // _multiAttackHitCount twice per hit, which walked the dual-wield hand
    // index off the end of the flurry. displayActionResults owns the sound now,
    // hit and miss alike, and this is only the shield.

    _Window_BattleLog_displayHpDamage.call(this, target);
  };
  const _Window_BattleLog_endAction = Window_BattleLog.prototype.endAction;
  Window_BattleLog.prototype.endAction = function (subject) {
    this._multiAttackHitCount = 0;
    this._lastAttacker = null;
    _Window_BattleLog_endAction.call(this, subject);
  };
  // Add this after the existing _Scene_Battle_start alias
  // Replace the existing _Scene_Battle_start alias
  const _Scene_Battle_start = Scene_Battle.prototype.start;
  Scene_Battle.prototype.start = function () {
    _Scene_Battle_start.call(this);

    // Rebuild the held models from the current equipment when a battle opens,
    // starting from nothing so a weapon swapped between fights cannot linger.
    if (this._spriteset) {
      if (this._spriteset.clearWeaponModels) this._spriteset.clearWeaponModels();
      this._spriteset.updateWeaponSprite();

      // Ensure bullet gauge is set for first actor
      const actor = $gameParty.battleMembers()[0];
      if (actor && this._spriteset._bulletGauge) {
        this._spriteset._bulletGauge.setActor(actor);
      }
    }
  };
  //=============================================================================
  // Weapon Shimmer - elemental state tint
  //=============================================================================
  // States tagged <weaponShimmer: Element> tint the wielder's weapon sprite.
  // The tint color is read from the same state's <Hex: #RRGGBB> tag.
  function getStateShimmerColor(state) {
    if (!state) return null;
    if (state._weaponShimmerColor !== undefined) return state._weaponShimmerColor;
    let color = null;
    if (state.note && /<weaponShimmer\b/i.test(state.note)) {
      const hex = state.note.match(/<Hex:\s*#?([0-9a-fA-F]{6})>/);
      color = hex ? parseInt(hex[1], 16) : 0xffffff;
    }
    state._weaponShimmerColor = color;
    return color;
  }

  // Elemental SE filenames (under audio/se/) for a shimmer state's
  // <weaponShimmerSE: a, b, c, d> tag. Returns a cached array (possibly empty).
  function getStateShimmerSE(state) {
    if (!state) return [];
    if (state._weaponShimmerSE !== undefined) return state._weaponShimmerSE;
    let list = [];
    const m = state.note && state.note.match(/<weaponShimmerSE:\s*([^>]+)>/i);
    if (m) {
      list = m[1].split(",").map((s) => s.trim()).filter((s) => s.length > 0);
    }
    state._weaponShimmerSE = list;
    return list;
  }

  // Track shimmer states in application order so the most recent one wins.
  const _Game_BattlerBase_addNewState = Game_BattlerBase.prototype.addNewState;
  Game_BattlerBase.prototype.addNewState = function (stateId) {
    _Game_BattlerBase_addNewState.call(this, stateId);
    if (getStateShimmerColor($dataStates[stateId]) != null) {
      if (!this._weaponShimmerStack) this._weaponShimmerStack = [];
      const i = this._weaponShimmerStack.indexOf(stateId);
      if (i >= 0) this._weaponShimmerStack.splice(i, 1);
      this._weaponShimmerStack.push(stateId);
    }
  };

  const _Game_BattlerBase_eraseState = Game_BattlerBase.prototype.eraseState;
  Game_BattlerBase.prototype.eraseState = function (stateId) {
    _Game_BattlerBase_eraseState.call(this, stateId);
    if (this._weaponShimmerStack) {
      const i = this._weaponShimmerStack.indexOf(stateId);
      if (i >= 0) this._weaponShimmerStack.splice(i, 1);
    }
  };

  const _Game_BattlerBase_clearStates = Game_BattlerBase.prototype.clearStates;
  Game_BattlerBase.prototype.clearStates = function () {
    _Game_BattlerBase_clearStates.call(this);
    this._weaponShimmerStack = [];
  };

  // Id of the most recently applied, still-active shimmer state (or 0).
  Game_BattlerBase.prototype.getLatestWeaponShimmerStateId = function () {
    const stack = this._weaponShimmerStack;
    if (!stack || stack.length === 0) return 0;
    for (let i = stack.length - 1; i >= 0; i--) {
      const stateId = stack[i];
      if (this.isStateAffected(stateId)) return stateId;
    }
    return 0;
  };

  // Color of the most recently applied, still-active shimmer state (or null).
  Game_BattlerBase.prototype.getLatestWeaponShimmerColor = function () {
    const stateId = this.getLatestWeaponShimmerStateId();
    return stateId ? getStateShimmerColor($dataStates[stateId]) : null;
  };

  // Play the elemental SE of the latest shimmer state alongside the weapon
  // sound. `pitch` is matched to the weapon swing so the two read as one hit.
  Game_BattlerBase.prototype.playWeaponShimmerSE = function (pitch) {
    const stateId = this.getLatestWeaponShimmerStateId();
    if (!stateId) return;
    const list = getStateShimmerSE($dataStates[stateId]);
    if (!list || list.length === 0) return;
    const name = list[Math.floor(Math.random() * list.length)];
    try {
      AudioManager.playSe({
        name: name,
        volume: Math.round(volume * 0.85),
        pitch: pitch || 100,
        pan: 0,
      });
    } catch (error) {
      console.error("[WeaponSystem] Error playing shimmer SE:", error);
    }
  };
  //=============================================================================
  // Sprite_BulletGauge - Bullet Display
  //=============================================================================

  function Sprite_BulletGauge() {
    this.initialize(...arguments);
  }

  Sprite_BulletGauge.prototype = Object.create(Sprite.prototype);
  Sprite_BulletGauge.prototype.constructor = Sprite_BulletGauge;

  Sprite_BulletGauge.prototype.initialize = function () {
    Sprite.prototype.initialize.call(this);
    this._actor = null;
    this._lastCurrent = -1;
    this._lastMax = -1;
    this.bitmap = new Bitmap(120, 40);
    const scale = getResolutionScale();
    this.x = Math.round(300 * scale.x);
    this.y = Math.round(70 * scale.y);
  };

  Sprite_BulletGauge.prototype.setActor = function (actor) {
    if (this._actor !== actor) {
      this._actor = actor;
      this._lastCurrent = -1;
      this._lastMax = -1;
    }
  };

  Sprite_BulletGauge.prototype.update = function () {
    Sprite.prototype.update.call(this);

    if (this._actor) {
      const config = this._actor.getWeaponBulletConfig();
      if (config) {
        const current = this._actor.getCurrentBullets();
        if (current !== this._lastCurrent || config.max !== this._lastMax) {
          this.refresh(current, config.max);
          this._lastCurrent = current;
          this._lastMax = config.max;
        }
        this.visible = true;
      } else {
        this.visible = false;
      }
    } else {
      this.visible = false;
    }
  };

  // Replace the Sprite_BulletGauge.prototype.refresh method (around line 1988)
  Sprite_BulletGauge.prototype.refresh = function (current, max) {
    this.bitmap.clear();

    // Determine icon based on weapon type
    let iconIndex = 104; // Default bullet icon
    if (this._actor) {
      const weapons = this._actor.weapons();
      if (weapons.length > 0 && weapons[0]) {
        const weapon = weapons[0];
        if (weapon.wtypeId === 7) {
          iconIndex = 102; // Bow/arrow icon
        }
      }
    }

    // Draw weapon icon
    const iconBitmap = ImageManager.loadSystem("IconSet");
    const pw = ImageManager.iconWidth;
    const ph = ImageManager.iconHeight;
    const sx = (iconIndex % 16) * pw;
    const sy = Math.floor(iconIndex / 16) * ph;

    this.bitmap.blt(iconBitmap, sx, sy, pw, ph, 0, 0);

    // Draw bullet count text next to icon
    this.bitmap.fontSize = 24;
    this.bitmap.textColor = "#FFFFFF";
    this.bitmap.outlineWidth = 4;
    this.bitmap.outlineColor = "#000000";
    this.bitmap.drawText(`x ${current}`, 36, 4, 80, 32, "left");
  };

  //=============================================================================
  // Spriteset_Battle - Weapon and Bullet Display
  //=============================================================================

  const _Spriteset_Battle_createLowerLayer =
    Spriteset_Battle.prototype.createLowerLayer;
  Spriteset_Battle.prototype.createLowerLayer = function () {
    _Spriteset_Battle_createLowerLayer.call(this);
    this.createWeaponSprite();
    this.createBulletGauge();
  };
  Spriteset_Battle.prototype.createWeaponSprite = function () {
    // Defensive guard: Map Battle Mode (MapBattleMode.js) never actually
    // constructs a Spriteset_Battle, but skip the weapon overlay here too in
    // case any other code path ever instantiates one while it's active.
    if (window.MapBattleMode && window.MapBattleMode.isActive()) return;
    this._3dWeaponSprites = {};
    this.updateWeaponSprite();
  };

  Spriteset_Battle.prototype.getCurrentBattleActor = function (
    allowFallback = true
  ) {
    // The actor currently taking a turn (selecting a command or acting)
    const active =
      BattleManager.actor() ||
      (BattleManager._subject && BattleManager._subject.isActor()
        ? BattleManager._subject
        : null);

    if (window.$gameSplitScreen && window.$gameSplitScreen.active) {
      const activator = $gameMessage._eventActivator || "p1";
      if (activator === "p2" && $gameParty.battleMembers().length >= 2) {
        return active || (allowFallback ? $gameParty.battleMembers()[1] : null);
      }
    }

    return active || (allowFallback ? $gameParty.battleMembers()[0] : null);
  };

  Spriteset_Battle.prototype.createBulletGauge = function () {
    // The floating bullet/projectile count below the enemy bar is intentionally
    // not created: the live projectile count now lives on the Attack command.
    // Other code paths reference _bulletGauge guarded by `&&`, so leaving it
    // undefined is safe.
  };

  /** Drop every held model, e.g. leaving the scene or entering card mode. */
  Spriteset_Battle.prototype.clearWeaponModels = function () {
    // Anything still playing is drawn in the same overlay and would be left
    // painted over the screen once the layer goes idle.
    if (window.WeaponHitFX) window.WeaponHitFX.clear();
    if (!this._3dWeaponSprites) return;
    for (const key in this._3dWeaponSprites) {
      const s = this._3dWeaponSprites[key];
      if (s && s.terminate) s.terminate();
    }
    this._3dWeaponSprites = {};
  };

  /**
   * Fade every held model out of frame, the battle being over. The models are
   * kept alive until the scene terminates so the fade actually plays, and no
   * weapon is put back in frame in the meantime.
   */
  Spriteset_Battle.prototype.fadeOutWeaponModels = function () {
    this._weaponModelsExiting = true;
    if (window.WeaponHitFX) window.WeaponHitFX.clear();
    if (!this._3dWeaponSprites) return;
    for (const key in this._3dWeaponSprites) {
      const s = this._3dWeaponSprites[key];
      if (s && s.beginExit) s.beginExit();
    }
  };

  /**
   * Put whatever the acting actor is holding in frame. Two models at most, one
   * per hand: a character with six arms still only swings two things a turn
   * (Game_Actor#activeWeapons), and a shield counts as one of them, so sword
   * and board, two swords and two shields are all drawn the same way. An empty
   * right hand is not empty, it holds the fist of the character's archetype
   * (WeaponSystemProcedural.unarmedWeaponFor).
   */
  Spriteset_Battle.prototype.updateWeaponSprite = function () {
    if (this._weaponModelsExiting) return;
    if (!this._3dWeaponSprites) this._3dWeaponSprites = {};
    this._mirroredOffhand = false;

    if (!window.Sprite_3DWeapon) {
      this.clearWeaponModels();
      return;
    }

    if (window.WeaponSystemProcedural) WeaponSystemProcedural.patchSprite3DWeapon();

    // Only show a weapon for the actor actually taking a turn (no player-1
    // fallback), so nothing flashes at battle start before turn order resolves.
    const actor = this.getCurrentBattleActor(false);
    if (!actor) {
      this.clearWeaponModels();
      return;
    }

    // The weapons swinging this turn come first; a shield fills whichever hand
    // is left over. Both are drawn through the same model pipeline, the shield
    // wrapped as a weapon by WeaponSystemProcedural.shieldWeaponFor.
    const weapons = actor.weapons();
    const held = window.HandSlots ? window.HandSlots.heldItems(actor) : [];
    const shields = held.filter(item => item && item.etypeId === 2);
    const shieldModel = (armor) => (armor && window.WeaponSystemProcedural)
      ? WeaponSystemProcedural.shieldWeaponFor(armor)
      : null;

    let rightWeapon = weapons[0] || null;
    let rightShield = null;
    if (!rightWeapon && shields.length) rightShield = shields.shift();
    if (!rightWeapon && !rightShield && window.WeaponSystemProcedural) {
      rightWeapon = WeaponSystemProcedural.unarmedWeaponFor(actor);
    }

    // Claws are a pair even when the database lists one of them.
    const isClaws = !!(weapons[0] && weapons[0].wtypeId === 10);
    let leftWeapon = weapons[1] || null;
    let leftShield = null;
    if (!leftWeapon && shields.length) leftShield = shields.shift();
    if (!leftWeapon && !leftShield && isClaws) leftWeapon = weapons[0];
    // Remembered for the swing: the off hand holds a copy of the right hand's
    // claw rather than a weapon of its own, so nothing in the action tells
    // playWeaponAnimation that there is a second claw to move.
    this._mirroredOffhand = (!weapons[1] && isClaws && leftWeapon === weapons[0]);

    this.setHeldWeaponModel('right', rightWeapon || shieldModel(rightShield));
    this.setHeldWeaponModel('left', leftWeapon || shieldModel(leftShield));
  };

  // How long a blow takes to arrive when the weapon has no movement to read it
  // off: a little under half of a stock swing, which since the attack clips
  // were paced up (WeaponSystemProcedural.ATTACK_PACE) runs about 600ms.
  const DEFAULT_STRIKE_DELAY = 260;

  // How far behind the leading claw the mirrored off-hand one rakes.
  const OFFHAND_CLAW_DELAY = 110;

  /** Show `weapon` in `hand`, rebuilding the model only when it changed. */
  Spriteset_Battle.prototype.setHeldWeaponModel = function (hand, weapon) {
    if (!this._3dWeaponSprites) this._3dWeaponSprites = {};
    const held = this._3dWeaponSprites[hand];
    if (!weapon) {
      if (held) {
        held.terminate();
        delete this._3dWeaponSprites[hand];
      }
      return null;
    }
    // The vector gun is ONE database row in two shapes: folded into the Blade
    // of Thelema it is a different model in the hand, and the row is the same
    // object either way, so the form (and the element it strikes with) has to
    // be compared too or the machete never appears (Weapon/VectorGunSystem.js).
    const formKey = (window.VectorGun && window.VectorGun.isVectorGun(weapon))
      ? window.VectorGun.modelKey() : '';
    if (!held || held._weapon !== weapon || held._vgFormKey !== formKey) {
      const isLeft = hand === 'left';
      // The incoming model is built BEFORE the outgoing one is let go. When
      // this is the only weapon on screen, terminating first drops the last
      // reference to the shared overlay, and a swap must never leave the
      // layer holding nothing.
      const next = new Sprite_3DWeapon(
        weapon, getScaledWeaponX(isLeft), getScaledWeaponY());
      // terminate() runs disposeWeaponObject3D; a bare scene.remove would leak
      // the model's GPU buffers on every swap.
      if (held) held.terminate();
      next._vgFormKey = formKey;
      this._3dWeaponSprites[hand] = next;
    }
    const sprite = this._3dWeaponSprites[hand];
    if (sprite._model && !sprite._exiting) {
      sprite._model.visible = true;
      sprite._visible = true;
    }
    return sprite;
  };

  /**
   * The enemy the weapon in the party's hands is turned toward: what a gun or a
   * bow is aimed at, and what a blade swings at. Whoever is being picked in the
   * target window wins, then the target of the action being carried out, then
   * whichever enemy is still standing.
   */
  Spriteset_Battle.prototype.weaponAimBattler = function () {
    const scene = SceneManager._scene;
    const win = scene && scene._enemyWindow;
    if (win && win.active && win.visible && typeof win.enemy === "function") {
      const picked = win.enemy();
      if (picked && picked.isAlive()) return picked;
    }
    const targets = BattleManager._targets;
    if (targets) {
      for (const t of targets) {
        if (t && t.isEnemy && t.isEnemy() && t.isAlive()) return t;
      }
    }
    const alive = $gameTroop ? $gameTroop.aliveMembers() : null;
    return alive && alive.length ? alive[0] : null;
  };

  /** Where that enemy is, in game pixels, or null when there is nobody to aim at. */
  Spriteset_Battle.prototype.weaponAimPoint = function () {
    const enemy = this.weaponAimBattler();
    if (!enemy) return null;
    // A 3D battler is wherever its model projects to; the 2D sprite behind it
    // never moves, so asking the sprite first would aim at an empty slot.
    let p = this.getBattlerPartPosition
      ? this.getBattlerPartPosition(enemy, null)
      : null;
    if (!p) {
      const sprite = this.findTargetSprite(enemy);
      if (!sprite) return null;
      // Sprite_Enemy is anchored at the battler's feet: aim at its middle.
      p = { x: sprite.x, y: sprite.y - (sprite.height || 120) / 2 };
    }
    // Both of those are battlefield-local; the weapon overlay is in game pixels.
    const field = this._battleField;
    return { x: p.x + (field ? field.x : 0), y: p.y + (field ? field.y : 0) };
  };

  /**
   * Where `battler` is on screen in game pixels: its 3D model's projection
   * when it has one, otherwise the middle of its 2D sprite. This is where a
   * blow lands, and where WeaponHitFX draws it.
   */
  Spriteset_Battle.prototype.battlerScreenPoint = function (battler) {
    if (!battler) return null;
    let p = this.getBattlerPartPosition
      ? this.getBattlerPartPosition(battler, battler._fxLastHitPart)
      : null;
    if (!p && this.getBattlerPartPosition) p = this.getBattlerPartPosition(battler, null);
    if (!p) {
      const sprite = this.findTargetSprite(battler);
      if (!sprite) return null;
      p = { x: sprite.x, y: sprite.y - (sprite.height || 120) / 2 };
    }
    const field = this._battleField;
    return { x: p.x + (field ? field.x : 0), y: p.y + (field ? field.y : 0) };
  };

  /**
   * Draw the blow `weapon` just landed on `target`. The line of the hit runs
   * from the hand the weapon is held in to wherever the target stands, which
   * is what a shot or a thrust is drawn along.
   */
  Spriteset_Battle.prototype.playWeaponHitFX = function (weapon, target, opts) {
    if (!window.WeaponHitFX || !weapon) return;
    const point = this.battlerScreenPoint(target);
    if (!point) return;
    const handX = getScaledWeaponX(!!(opts && opts.leftHand));
    const handY = getScaledWeaponY();
    const angle = Math.atan2(-(point.y - handY), point.x - handX);
    // The blow is drawn on the beat of the swing that is playing and along the
    // line that swing sweeps, so the trail follows the weapon rather than
    // appearing beside it.
    const hand = (opts && opts.leftHand) ? 'left' : 'right';
    const sprite = this._3dWeaponSprites && this._3dWeaponSprites[hand];
    const strike = (sprite && sprite.strikeInfo) ? sprite.strikeInfo() : null;
    // No clip resolved yet (the model or the keyframe table is still loading):
    // the blow still waits roughly the time a swing takes to arrive rather
    // than flashing on the frame the action started.
    const delay = strike ? strike.delay : DEFAULT_STRIKE_DELAY;
    window.WeaponHitFX.play(weapon, point, Object.assign({
      angle: angle,
      motionAngle: strike ? strike.angle : undefined,
      delay: delay
    }, opts || {}));
  };

  // Add helper method to find enemy sprite
  Spriteset_Battle.prototype.findTargetSprite = function (target) {
    if (!this._enemySprites) return null;

    for (const sprite of this._enemySprites) {
      if (sprite._battler === target) {
        return sprite;
      }
    }
    return null;
  };

  /**
   * The next entry of a weapon's <Movement:> list. A weapon that authored six
   * movements meant all six of them, and taking only the first one is what had
   * every flail in the game playing the same swing for a whole fight. The
   * cursor lives on the weapon data object, which is rebuilt from the note tags
   * every time the database loads, so there is nothing to save.
   */
  function nextWeaponMovement(weapon) {
    const anims = weapon && weapon.weaponAnimations;
    if (!anims || anims.length === 0) return null;
    if (anims.length === 1) return anims[0];
    const next = ((weapon._movementCursor || 0) + 1) % anims.length;
    weapon._movementCursor = next;
    return anims[next];
  }

  /**
   * Swing whichever hand is acting. The clip is the skill's own movement if it
   * declares one, otherwise the next of the weapon's <Movement:> entries,
   * otherwise the motion its shape implies (WeaponSystemProcedural.motionFor).
   * @param {object} [opts] - what kind of blow this is, {crit:boolean}.
   */
  Spriteset_Battle.prototype.playWeaponAnimation = function (
    animationOverride = null,
    weaponIndex = 0,
    opts = null
  ) {
    if (!window.Sprite_3DWeapon) return;
    if (this._weaponModelsExiting) return;
    const actor = this.getCurrentBattleActor();
    if (!actor) return;
    if (window.WeaponSystemProcedural) WeaponSystemProcedural.patchSprite3DWeapon();

    const weapons = actor.weapons();
    const isLeftHand = weaponIndex === 1;

    let weapon = weapons[weaponIndex];
    if (!weapon && !isLeftHand && window.WeaponSystemProcedural) {
      weapon = WeaponSystemProcedural.unarmedWeaponFor(actor);
    }
    if (!weapon) return;

    const sprite = this.setHeldWeaponModel(isLeftHand ? 'left' : 'right', weapon);
    if (!sprite) return;
    // No <Movement:> tag means "whatever this weapon does", NOT a sword swing:
    // defaulting to Swing here is what had untagged firearms and slings
    // clubbing the enemy with the stock. WeaponSystemProcedural.motionForWeapon
    // answers it from the weapon's own type and length.
    const animName = nextWeaponMovement(weapon);
    const clip = animationOverride || animName;
    sprite.playAnimation(clip, opts);

    // A pair of claws is one database weapon worn on both hands
    // (updateWeaponSprite), so the blow is thrown with both: the off hand
    // rakes a beat behind the leading one rather than in lockstep with it,
    // which is what reads as a pair of claws instead of one doubled model.
    if (!isLeftHand && this._mirroredOffhand) {
      const offhand = this._3dWeaponSprites && this._3dWeaponSprites['left'];
      if (offhand && offhand._weapon === weapon) {
        setTimeout(() => {
          const spriteset = SceneManager._scene && SceneManager._scene._spriteset;
          if (spriteset !== this) return;
          if (this._weaponModelsExiting) return;
          if (this._3dWeaponSprites['left'] !== offhand) return;
          offhand.playAnimation(clip, opts);
        }, OFFHAND_CLAW_DELAY);
      }
    }
  };

  const _Spriteset_Battle_update = Spriteset_Battle.prototype.update;
  Spriteset_Battle.prototype.update = function () {
    _Spriteset_Battle_update.call(this);
    let anyModelVisible = false;
    if (this._3dWeaponSprites) {
      // Where the enemy is, resolved once a frame and shared by both hands: a
      // weapon that shoots turns to face it, and one that is swung sends its
      // blow at it. Costs one projection of the enemy's model.
      let aimPoint;
      for (const key in this._3dWeaponSprites) {
        const spr = this._3dWeaponSprites[key];
        if (aimPoint === undefined) aimPoint = this.weaponAimPoint();
        spr._aimPoint = aimPoint;
        spr.update();
        // A stroke still fading counts as something to draw: the weapon may
        // already be out of frame behind its own trail.
        if ((spr._model && spr._model.visible) ||
            (spr.trailActive && spr.trailActive())) {
          anyModelVisible = true;
        }
      }
    }
    // The impact effects live in the same overlay scene and are stepped here,
    // so a hit keeps playing on a frame where no weapon is held.
    let fxActive = false;
    if (window.WeaponHitFX) {
      window.WeaponHitFX.update();
      fxActive = window.WeaponHitFX.active();
    }
    // Batch the shared three.js overlay render once per frame (formerly done
    // per weapon instance inside each Sprite_3DWeapon.update). Only render when
    // at least one weapon model is visible, plus one last pass on the frame the
    // last one goes: the overlay canvas keeps whatever was drawn into it, so
    // without it a faded-out weapon would stay painted over the battle.
    // Below 60fps the engine runs the logic two or three times per drawn frame
    // (window.FrameBudget in Core/ParchmentToast.js) and only the last of them
    // is shown, so a pass on any of the others is thrown away at full price.
    // The pass that clears the overlay after the last weapon has gone is never
    // skipped: the canvas keeps what was drawn into it, so skipping that one
    // would leave a faded-out weapon painted over the battle. A skipped pass
    // also leaves the "something is painted" flag alone, since the canvas still
    // holds the frame before it.
    const clearingOverlay = !anyModelVisible && !fxActive;
    const presented = !window.FrameBudget || window.FrameBudget.isPresented();
    if ((anyModelVisible || fxActive || this._weaponOverlayDrawn) &&
        (presented || clearingOverlay) && window.WeaponThreeScene &&
        typeof window.WeaponThreeScene.render === 'function') {
      window.WeaponThreeScene.render();
      this._weaponOverlayDrawn = anyModelVisible || fxActive;
    }
  };
  //=============================================================================
  // Scene_Battle - Command Handling and Updates
  //=============================================================================

  const _Scene_Battle_changeInputWindow =
    Scene_Battle.prototype.changeInputWindow;
  Scene_Battle.prototype.changeInputWindow = function () {
    _Scene_Battle_changeInputWindow.call(this);
    if (this._spriteset) {
      this._spriteset.updateWeaponSprite();
    }
  };

  const _Scene_Battle_startActorCommandSelection =
    Scene_Battle.prototype.startActorCommandSelection;
  Scene_Battle.prototype.startActorCommandSelection = function () {
    _Scene_Battle_startActorCommandSelection.call(this);
    if (this._spriteset && this._spriteset._bulletGauge) {
      this._spriteset._bulletGauge.setActor(BattleManager.actor());
    }
    // BUGFIX: Force weapon sprite refresh to ensure it's visible
    if (this._spriteset) {
      this._spriteset.updateWeaponSprite();
    }
  };

  const _Scene_Battle_update = Scene_Battle.prototype.update;
  Scene_Battle.prototype.update = function () {
    _Scene_Battle_update.call(this);
    if (
      this._spriteset &&
      this._spriteset._bulletGauge &&
      BattleManager.actor()
    ) {
      this._spriteset._bulletGauge.setActor(BattleManager.actor());
    }
  };

  //=============================================================================
  // Scene_Boot - Initialization
  //=============================================================================

  const _Scene_Boot_start = Scene_Boot.prototype.start;
  Scene_Boot.prototype.start = function () {
    _Scene_Boot_start.call(this);

    if (debugMode) {
      console.log("[WeaponSystem] Plugin v4.0.0 loaded successfully");
      console.log("[WeaponSystem] Settings:", {
        pitchVariation: pitchVariation,
        volume: volume,
        useSubfolder: useSubfolder,
        weaponSpriteX: weaponSpriteX,
        weaponSpriteY: weaponSpriteY,
        debugMode: debugMode,
      });
    }
  };

  //=============================================================================
  // BattleManager - end of battle
  //=============================================================================

  // Victory, defeat and escape all pass through endBattle, which is raised
  // while the scene is still running: the held models fade out over the last
  // moments of the battle instead of vanishing with the scene.
  const _BattleManager_endBattle = BattleManager.endBattle;
  BattleManager.endBattle = function (result) {
    _BattleManager_endBattle.call(this, result);
    const scene = SceneManager._scene;
    if (scene && scene._spriteset && scene._spriteset.fadeOutWeaponModels) {
      scene._spriteset.fadeOutWeaponModels();
    }
  };

  const _Scene_Battle_terminate = Scene_Battle.prototype.terminate;
  Scene_Battle.prototype.terminate = function () {
    _Scene_Battle_terminate.call(this);

    // Drop every held model when the battle ends.
    if (this._spriteset && this._spriteset.clearWeaponModels) {
      this._spriteset.clearWeaponModels();
    }
  };
})();