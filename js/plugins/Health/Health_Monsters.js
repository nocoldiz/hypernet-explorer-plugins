/*:
 * @target MZ
 * @plugindesc Enhanced monster limb and organ damage system with targeted attacks
 * @author Inspired by Health_Core
 * @help
 * This plugin implements a detailed limb and organ damage system
 * for enemy monsters. Features include:
 * - Individual health for limbs and organs based on monster archetype
 * - Damage distribution to body parts
 * - Special effects for damaged body parts
 * - Permanent debuffs for destroyed parts during battle
 * - Dynamic enemy archetypes defined in enemy notes
 * - Part severing system for finishing blows
 * - "Check" command to view monster body parts and their HP
 * - NEW: Hit percentage calculation for each body part
 * - NEW: Target specific body parts with calculated hit chance
 * - NEW: Weapon type influences hit chance based on user stats
 * - NEW: Random +/-10% modifier to hit chance for each part
 * - NEW: Bypass vital part protection with targeted attacks
 * - NEW: Persistent targeting when reopening the window
 * - NEW: Wrestling. The Wrestle battle command (offered to any body with a
 *   limb still whole enough to take hold with) aims at one enemy, and once
 *   that enemy is chosen the
 *   actor's command menu is REPLACED by the grapple plan: the limb the hold is
 *   taken with, the limb it is taken on, and the hold itself, each row showing
 *   the odds it will actually work. Either limb is picked on a page of that
 *   same menu, listing the whole body with the state each part is in and a
 *   help line saying what that limb can do or what taking hold of it will be
 *   like. Holds read different stats (a grapple is
 *   STR vs DEX, a joint lock DEX vs STR, a choke CON vs CON), and are scaled by
 *   the character's Wrestling specialization. Grappled/Pinned/Guard Broken/
 *   Winded/Bleeding/Stun/Concussed/Vital Exposed come off the holds that earn
 *   them, limbs can be torn away outright, and a character who has trained any
 *   martial art can finish with that art's real moves without ever having
 *   learned them as skills. A part at 0 HP, marked damaged, or severed can
 *   neither grab nor be grabbed on either side of the fight.
 *
 * Enemy Note Tag Format:
 * <Archetype: Humanoid>
 * <Archetype: Slime>
 * <Archetype: Dragon>
 * etc.
 *
 * Add custom archetypes by extending the Archetypes object.
 *
 * @param Decapitation Sound
 * @desc Sound effect to play when decapitation occurs
 * @default Monster5
 * @type file
 * @dir audio/se/
 *
 * @param Part Severing Message
 * @desc Message to display when a part is severed
 * @default %1's %2 has been severed!
 *
 * @param Part Destruction Message
 * @desc Message to display when a part is destroyed
 * @default %1's %2 has been destroyed!
 *
 * @param Show Hit Location
 * @desc Show hit location in battle log
 * @type boolean
 * @default true
 *
 * @param Check Command Name
 * @desc Name of the command to check monster body parts
 * @default Check
 *
 * @param Target Command Name
 * @desc Name of the command to target specific body parts
 * @default Target
 * 
 * @command OpenEnemyDetails
 * @text Open Enemy Details
 * @desc Opens the enemy body parts detail window during battle
 *
 * @command OpenTargeting
 * @text Open Targeting Window
 * @desc Opens the targeting window to select a specific body part to attack
 */

(function () {
  // Plugin parameters
  var pluginName = "Health_Monsters";
  var parameters = PluginManager.parameters(pluginName);
  var it = ConfigManager.language === "it";
  var decapitationSound = parameters["Decapitation Sound"] || "Monster5";

  var showHitLocation = String(parameters["Show Hit Location"]) === "true";
  var checkCommandName = parameters["Check Command Name"] || "Check";
  var targetCommandName = parameters["Target Command Name"] || "Target";

  // Vital body parts are protected from destruction (clamped to 1 HP) while the
  // enemy still has more than this fraction of HP. Once the enemy drops to this
  // threshold or below, a destroyed vital part triggers a delayed instakill.
  // Non-vital parts have no such protection and can be severed at any HP.
  var VITAL_INSTAKILL_RATE = 0.25;

  // Initialize $gameTemp if it doesn't exist
  if (!$gameTemp) {
    $gameTemp = {};
  }

  // Global variables to track targeting state: the aimed part, and the monster
  // it was aimed at (a battle can hold several).
  $gameTemp.targetedBodyPart = null;
  $gameTemp.targetedBodyPartEnemy = null;

  // ===========================================================================
  // Enemy Archetypes Definition
  // ===========================================================================
  // Each archetype defines a set of body parts with their properties
  // ===========================================================================
  // Enemy Archetypes Definition
  // ===========================================================================
  // Each archetype defines a set of body parts with their properties

  // Dynamic getter to avoid timing issues when window.Health is populated by DataService.js later
  const getArchetypes = () => window.Health ? window.Health.Archetypes : null;

  function getArchetype(archetypeName) {
    const archs = getArchetypes();
    return archs ? archs[archetypeName] : null;
  }


  // Weapon type definitions for hit chance calculations
  var WeaponTypes = {
    DAGGER: { id: 1, primaryStat: 6 }, // Agility
    SWORD: { id: 2, primaryStat: 2 }, // Attack
    AXE: { id: 3, primaryStat: 2 }, // Attack
    MACE: { id: 4, primaryStat: 2 }, // Attack
    SPEAR: { id: 5, primaryStat: 6 }, // Agility
    BOW: { id: 6, primaryStat: 6 }, // Agility
    CROSSBOW: { id: 7, primaryStat: 2 }, // Attack
    GUN: { id: 8, primaryStat: 6 }, // Agility
    STAFF: { id: 9, primaryStat: 3 }, // Magic
    HEAVY: { id: 10, primaryStat: 4 }, // Defense
    // Add more as needed
  };

  // Initialize enemy body parts based on enemy notes
  function initializeEnemyBodyParts(enemy) {
    if (enemy._bodyParts) return; // Already initialized

    // Find the enemy's archetype from its notes
    var archetypeRegex = /<Archetype:\s*(\w+)>/i;
    var archetypeMatch = enemy.enemy().note.match(archetypeRegex);

    // Default to Humanoid if no valid archetype is found
    var archetypeName = archetypeMatch ? archetypeMatch[1] : "Humanoid"; // i18n-ignore: archetype id
    var archetype = getArchetype(archetypeName);

    if (!archetype) {
      // i18n-ignore-start: developer diagnostics and archetype ids
      console.error(
        "Invalid archetype: " +
        archetypeName +
        " for enemy " +
        enemy.name() +
        ". Defaulting to Humanoid."
      );
      archetypeName = "Humanoid";
      archetype = getArchetype("Humanoid");
      // i18n-ignore-end

      // If Humanoid still doesn't exist, this is a critical error
      if (!archetype) {
        console.error(
          "CRITICAL ERROR: Humanoid archetype not defined. This plugin requires a Humanoid archetype to be defined."
        );
        // Create a basic fallback archetype to prevent crashes
        const archs = getArchetypes();
        if (archs) {
          archs.Humanoid = {
            parts: {
              BODY: {
                name: "Body", // i18n-ignore: body-part id, localised from bodyparts.json
                hpPercent: 100,
                vital: true,
                canCutoff: false,
                statEffect: { param: 0, amount: -20 },
                hitDifficulty: 1,
              },
            },
            hitLocations: {
              BODY: { weight: 100 },
            },
          };
          archetype = archs.Humanoid;
        }
      }
    }

    // Store the archetype name for reference
    enemy._archetypeName = archetypeName;
    enemy._bodyParts = {};
    enemy._statModifiers = {}; // Track stat modifiers from damaged parts
    enemy._disabledActions = []; // Track actions disabled by body part damage

    // Initialize body parts based on the archetype
    for (var partKey in archetype.parts) {
      var basePart = archetype.parts[partKey];
      var hpPercentage = basePart.hpPercent / 100;

      // Generate random hit chance modifier for this part (+/- 10%)
      var randomHitModifier = (Math.random() * 20 - 10) / 100; // -10% to +10%

      enemy._bodyParts[partKey] = {
        name: window.getArchetypeText(basePart.name),
        maxHp: Math.max(1, Math.round(enemy.mhp * hpPercentage)),
        currentHp: Math.max(1, Math.round(enemy.mhp * hpPercentage)),
        vital: basePart.vital || false,
        canCutoff: basePart.canCutoff || false,
        regenerates: basePart.regenerates || false,
        destroyed: false,
        specialEffect: basePart.specialEffect || null,
        appliedStatEffect: false,
        hitDifficulty: basePart.hitDifficulty || 1,
        randomHitModifier: randomHitModifier,
      };
    }
  }

  // Get a random hit location based on weights for an enemy's archetype
  function getRandomHitLocation(enemy) {
    try {
      // An aimed part belongs to the monster it was aimed at: with several
      // enemies on the field, a limb picked out on one of them must not steer
      // the blows that land on the others.
      if (
        $gameTemp &&
        $gameTemp.targetedBodyPart &&
        $gameTemp.targetedBodyPartEnemy === enemy &&
        enemy._bodyParts[$gameTemp.targetedBodyPart]
      ) {
        var hitChance = calculateHitChance(enemy, $gameTemp.targetedBodyPart);
        var roll = Math.random() * 100;

        if (roll < hitChance) {
          return { key: $gameTemp.targetedBodyPart, targeted: true };
        }

        // Important: Log that the targeted attack missed its specific target
        if ($gameTemp) {
          $gameTemp.targetMissMessage = T('HealthMonsters.targetedMiss');
        }
      }

      // Otherwise use normal random hit location
      var archetype = getArchetype(enemy._archetypeName);

      // If archetype doesn't exist, use Humanoid as fallback
      if (!archetype) {
        // i18n-ignore-start: developer diagnostics and archetype ids
        console.error(
          "Archetype not found: " +
          enemy._archetypeName +
          ". Using Humanoid as fallback."
        );
        archetype = getArchetype("Humanoid");
        enemy._archetypeName = "Humanoid";
        // i18n-ignore-end
      }

      var hitLocations = archetype.hitLocations;

      var totalWeight = 0;
      var locations = [];

      for (var loc in hitLocations) {
        // Skip parts that are already off the body or ruined
        if (partFinished(enemy._bodyParts[loc])) continue;

        totalWeight += hitLocations[loc].weight;
        locations.push({
          key: loc,
          weight: hitLocations[loc].weight,
          cumulative: totalWeight,
        });
      }

      // If all parts are destroyed or no valid locations, default to the first part
      if (locations.length === 0) {
        var fallbackKey = Object.keys(hitLocations)[0];
        return { key: fallbackKey };
      }

      var roll = Math.random() * totalWeight;

      for (var i = 0; i < locations.length; i++) {
        if (roll <= locations[i].cumulative) {
          return { key: locations[i].key };
        }
      }

      // Failsafe
      return { key: locations[0].key };
    } catch (e) {
      console.error("Error in getRandomHitLocation:", e);
      // Emergency fallback
      return { key: Object.keys(enemy._bodyParts)[0] };
    }
  }

  // How much of the body a part actually is, read off the archetype's own
  // hit-location weights: those already say, for every archetype in the game,
  // that a torso is a wide thing to put a blade into and an eye is not. A part
  // carrying about a tenth of the weight is worth nothing either way.
  function partExposure(enemy, partKey) {
    var archetype = getArchetype(enemy && enemy._archetypeName);
    var locations = archetype && archetype.hitLocations;
    if (!locations || !locations[partKey]) return 0;
    var total = 0;
    for (var key in locations) total += locations[key].weight || 0;
    if (total <= 0) return 0;
    var share = (locations[partKey].weight || 0) / total;
    return Math.round(Math.max(-12, Math.min(12, (share - 0.1) * 90)));
  }

  // Naming a vital part is the whole reason to aim, and it is the hardest thing
  // on a body to reach: small, moving, and behind everything else the monster
  // has. Priced so that aiming for one is a gamble rather than a shortcut past
  // the health bar.
  var VITAL_HIT_PENALTY = 35;

  // Calculate hit chance for a specific body part. `user` is whoever is
  // swinging; the callers that have no battler to hand (the Check panel reads
  // the same numbers off the card) fall back to the first actor.
  function calculateHitChance(enemy, partKey, user) {
    var part = enemy._bodyParts[partKey];

    // Guard against missing part or finished parts
    if (!part || partFinished(part)) return 0;

    user = user || $gameActors.actor(1);
    if (!user) return 0;

    // Base chance is 80%
    var baseChance = 80;

    // Adjust for part difficulty
    baseChance -= (part.hitDifficulty - 1) * 25;

    // Adjust for vital parts (much harder to hit)
    if (part.vital) {
      baseChance -= VITAL_HIT_PENALTY;
    }

    // A big part is a big target, a sliver of one is not.
    baseChance += partExposure(enemy, partKey);

    // A part already cut about is an opening: torn, hanging, no longer covered
    // by whatever was covering it. The worse its condition, the easier it is to
    // put the next blow through the same place.
    var condition = part.maxHp > 0 ? part.currentHp / part.maxHp : 1;
    baseChance += Math.round((1 - Math.max(0, Math.min(1, condition))) * 15);

    // Get weapon type and adjust based on appropriate user stat
    var weaponType = getWeaponType(user);
    var userStat = 0;
    var enemyStat = 0;

    // Determine which stats to use based on weapon type
    if (weaponType) {
      switch (weaponType.primaryStat) {
        case 2: // Attack
          userStat = user.atk;
          enemyStat = enemy.def;
          break;
        case 3: // Magic
          userStat = user.mat;
          enemyStat = enemy.mdf;
          break;
        case 4: // Defense
          userStat = user.def;
          enemyStat = enemy.def;
          break;
        case 6: // Agility
          userStat = user.agi;
          enemyStat = enemy.agi;
          break;
        default:
          userStat = user.atk;
          enemyStat = enemy.def;
      }
    } else {
      // Default to ATK if no weapon type found
      userStat = user.atk;
      enemyStat = enemy.def;
    }

    // Adjust based on user vs enemy stats
    var statRatio = userStat / Math.max(1, enemyStat);
    baseChance += Math.min(15, Math.floor((statRatio - 1) * 20)); // Max +15% for high stat ratio

    // Apply random modifier for this part (set at battle start)
    baseChance += (part.randomHitModifier || 0) * 100;

    // Clamp the final chance between 5% and 95% and round to integer
    return Math.round(Math.max(5, Math.min(95, baseChance)));
  }
  // Get the weapon type for an actor
  function getWeaponType(actor) {
    if (!actor || !actor.weapons()[0]) return null;

    var weapon = actor.weapons()[0];
    var wtypeId = weapon.wtypeId;

    // Map game's weapon type ID to our defined types
    for (var key in WeaponTypes) {
      if (WeaponTypes[key].id === wtypeId) {
        return WeaponTypes[key];
      }
    }

    return null;
  }

  // Get the appropriate message for destroyed body part
  function getElementalMessage(elementId) {
    const verbs = T.obj('HealthMonsters.elementVerb') || {};
    return verbs[elementId] || T('HealthMonsters.elementVerbDefault');
  }

  // Apply damage to an enemy body part
  function applyDamageToBodyPart(enemy, partKey, damage, isTargeted, action) {
    try {
      if (!enemy || !enemy._bodyParts) {
        console.error(
          "Enemy or body parts not initialized in applyDamageToBodyPart"
        );
        return 0;
      }

      var part = enemy._bodyParts[partKey];
      if (!part) {
        // i18n-ignore-start: developer diagnostic
        console.error(
          "Part not found: " + partKey + " for enemy: " +
          (enemy.name ? enemy.name() : "Unknown"));
        // i18n-ignore-end
        return 0;
      }

      if (part.destroyed || part.broken) return 0;

      // Find the archetype data
      var archetype = getArchetype(enemy._archetypeName);
      if (!archetype) {
        console.error("Archetype not found: " + enemy._archetypeName);
        return 0;
      }

      var basePart = archetype.parts[partKey];
      if (!basePart) {
        console.error(   // i18n-ignore: developer diagnostic
          "Base part data not found: " + partKey + " in archetype: " + enemy._archetypeName);
        return 0;
      }

      // Parts can always take damage
      var appliedDamage = Math.min(part.currentHp, damage);
      part.currentHp -= appliedDamage;

      // Check if part can be destroyed/severed.
      // Non-vital parts can be severed/destroyed at ANY enemy HP (no protection).
      // Vital parts are protected: they cannot drop below 1 HP while the enemy
      // still has more than VITAL_INSTAKILL_RATE HP. Once the enemy reaches that
      // threshold or below, destroying a vital part triggers the delayed instakill
      // scheduled in handleDestroyedBodyPart.
      var canBeDestroyed = !basePart.vital || enemy.hpRate() <= VITAL_INSTAKILL_RATE;

      // Check if part is now destroyed
      if (part.currentHp <= 0) {
        part.currentHp = 0;

        if (canBeDestroyed) {
          // A part only leaves the body when the archetype says it can come off
          // AND the blow that finished it cuts (HealthCore.attackerCanCut: an
          // edge, a bullet, or explosive/piercing/cutting damage).
          var cut = !!basePart.canCutoff && partCutByAttacker(null, action);
          if (cut) part.destroyed = true;
          else part.broken = true;
          handleDestroyedBodyPart(enemy, partKey, cut);
        } else {
          // Vital part clamped to 1 HP while the enemy is above the instakill threshold.
          part.currentHp = 1;

          // Show message that the vital part can't be fully destroyed yet
          if ($gameTemp && showHitLocation) {
            $gameTemp.hitLocationMessage = T('HealthMonsters.partSeverelyDamaged', { part: part.name });
          }
        }
      }

      return appliedDamage;
    } catch (e) {
      console.error("Error in applyDamageToBodyPart: " + e.message);
      console.error(e.stack);
      return 0;
    }
  }

  /**
   * Whether the blow being struck can take a part off a body. Health_Core owns
   * the attack damage type check (Limb can cut only by Explosive, Piercing and Cutting damage).
   */
  /**
   * A part that is done: taken off the body (destroyed) or ruined where it
   * stands (broken). Either way it has no HP left to take, cannot be aimed at
   * and grants nothing.
   */
  function partFinished(part) {
    return !!part && (part.destroyed || part.broken);
  }

  function partCutByAttacker(attacker, action) {
    var HC = window.HealthCore;
    if (!HC || typeof HC.attackerCanCut !== "function") return true;
    return HC.attackerCanCut(attacker, action);
  }

  // Apply stat effect for a destroyed part
  function applyStatEffect(enemy, partKey) {
    var part = enemy._bodyParts[partKey];
    var archetype = getArchetype(enemy._archetypeName);
    var basePart = archetype ? archetype.parts[partKey] : null;
    if (!basePart) return;

    if (part.appliedStatEffect || !basePart.statEffect) return;

    // Apply the stat effect. A part that is only broken costs the smaller
    // brokenAmount; one that came off the body costs the archetype's amount.
    var paramId = basePart.statEffect.param;
    var HC = window.HealthCore;
    var removed = !!(part && part.destroyed);
    var amount = (HC && HC.statEffectAmount)
      ? HC.statEffectAmount(basePart.statEffect, removed)
      : basePart.statEffect.amount;

    // Track the stat modifier
    if (!enemy._statModifiers[paramId]) {
      enemy._statModifiers[paramId] = 0;
    }
    enemy._statModifiers[paramId] += amount;

    // Mark as applied
    part.appliedStatEffect = true;

    // Apply special effects if any
    if (basePart.specialEffect) {
      applySpecialEffect(enemy, basePart.specialEffect);
    }

    // Refresh enemy to apply stat changes
    enemy.refresh();
  }

  // Translate a body-part i18n msg key (e.g. "enemyArchetypes.robot.right_arm.msg").
  // Returns null when the key is empty or can't be resolved in the current language,
  // so callers fall back to the localized part name instead of printing the raw key.
  function getPartDamageMsg(basePart, cut) {
    var key = (cut === false && basePart && basePart.brokenMsg)
      ? basePart.brokenMsg
      : (basePart ? basePart.msg : null);
    if (!key) return null;
    var translated =
      typeof window.getArchetypeText === "function"
        ? window.getArchetypeText(key)
        : key;
    // getArchetypeText echoes the key back when the path isn't found.
    if (
      !translated ||
      translated === key ||
      /^enemyArchetypes\./.test(translated)
    ) {
      return null;
    }
    return translated;
  }


  /**
   * A limb does not come off and leave what was on the end of it hanging in the
   * air. Cut a monster's leg and its foot goes with it, cut its arm and the
   * hand goes, and the toes and fingers on the end of those follow
   * (window.HealthCore.dependentPartKeys, the same chain the party's own
   * anatomy uses).
   *
   * Each part that goes takes its own stat penalty, and quietly: the blow that
   * took the limb has already been announced, and one wound is one line in the
   * log. A vital part is never taken this way - losing an arm must not kill a
   * monster outright.
   */
  function cascadeSeveredParts(enemy, partKey) {
    var HC = window.HealthCore;
    if (!HC || !HC.dependentPartKeys || !enemy || !enemy._bodyParts) return;
    var archetype = getArchetype(enemy._archetypeName);
    HC.dependentPartKeys(enemy, partKey).forEach(function (childKey) {
      var child = enemy._bodyParts[childKey];
      if (!child || child.destroyed) return;
      var baseChild = archetype && archetype.parts ? archetype.parts[childKey] : null;
      if (baseChild && baseChild.vital) return;
      child.currentHp = 0;
      child.destroyed = true;
      if (!child.appliedStatEffect) applyStatEffect(enemy, childKey);
    });
  }

  // Handle effects of a destroyed body part
  function handleDestroyedBodyPart(enemy, partKey, cut) {
    try {
      if (!enemy || !enemy._bodyParts) {
        console.error(
          "Enemy or body parts not initialized in handleDestroyedBodyPart"
        );
        return;
      }

      var part = enemy._bodyParts[partKey];
      if (!part) {
        // i18n-ignore-start: developer diagnostic
        console.error(
          "Part not found: " + partKey + " for enemy: " +
          (enemy.name ? enemy.name() : "Unknown"));
        // i18n-ignore-end
        return;
      }

      // Find the archetype data
      var archetype = getArchetype(enemy._archetypeName);
      if (!archetype) {
        console.error("Archetype not found: " + enemy._archetypeName);
        return;
      }

      var basePart = archetype.parts[partKey];
      if (!basePart) {
        console.error(   // i18n-ignore: developer diagnostic
          "Base part data not found: " + partKey + " in archetype: " + enemy._archetypeName);
        return;
      }

      // Callers that take a part off outright (severPart, the cascade) pass
      // nothing and mean a clean cut; the damage path decides with the weapon.
      if (cut === undefined) cut = !!part.destroyed;

      // Apply stat effect if not already applied
      if (!part.appliedStatEffect) {
        applyStatEffect(enemy, partKey);
      }

      // Prepare message based on element type
      var elementId = $gameTemp ? $gameTemp.lastElementalType : null;
      var message = "";

      // Check if it's an elemental attack (and not physical)
      if (elementId && elementId > 1) {
        // Use elemental message format
        var elementalEffect = getElementalMessage(elementId);
        message = T('HealthMonsters.partElementalHit', {
          enemy: enemy.name(), part: part.name, effect: elementalEffect,
        });
      } else {
        // For physical or non-elemental attacks
        var translatedMsg = getPartDamageMsg(basePart, cut);
        if (translatedMsg) {
          // Custom message if available and resolvable in the current language
          message = T('HealthMonsters.customPartMessage', { enemy: enemy.name(), message: translatedMsg });
        } else if (basePart.canCutoff && cut) {
          // Severing message for parts that can be cut off
          message = T('HealthMonsters.partSevered', { enemy: enemy.name(), part: part.name });

          // Play severing sound
          AudioManager.playSe({
            name: decapitationSound,
            volume: 90,
            pitch: 100,
            pan: 0,
          });
        } else if (cut) {
          // Default destruction message
          message = T('HealthMonsters.partDestroyed', { enemy: enemy.name(), part: part.name });
        } else {
          // The part is still on the body, ruined but attached.
          message = T('HealthMonsters.partBroken', { enemy: enemy.name(), part: part.name });
        }
      }

      // Store the message in battle log
      if ($gameTemp) {
        $gameTemp.limbDamageBattleLog = {
          type: "custom",
          text: message,
          isVital: basePart.vital,
        };

        // If vital part is destroyed, schedule delayed death
        if (basePart.vital) {
          $gameTemp.vitalPartDestroyedEnemy = enemy;
        }

        // Add stat effect info to the battle log
        if (basePart.statEffect) {
          $gameTemp.statEffectMessage = {
            enemyName: enemy.name(),
            paramName: getParamName(basePart.statEffect.param),
            amount: Math.abs(basePart.statEffect.amount),
          };
        }
      }

      // Losing a limb erupts a big blood spray and leaves a permanent puddle.
      // Point the FX at this exact part and let BloodSplatterFX (if present)
      // localise the gib onto it (3D mode) or onto the battler sprite (2D mode).
      enemy._fxLastHitPart = partKey;
      // Bump the hit sequence so battle-animation FX can detect a fresh impact
      // and (re)lock onto this exact part for the rest of the effect.
      enemy._fxHitSeq = (enemy._fxHitSeq || 0) + 1;
      // Flag the impact so the 3D battler plays its whole-body stagger/recoil
      // (reserved for critical hits and limb loss; cleared once consumed).
      enemy._partLostStagger = true;
      if (cut && window.BloodSplatterFX && window.BloodSplatterFX.onBodyPartLost) {
        window.BloodSplatterFX.onBodyPartLost(enemy, partKey);
      }

      // ...and everything that was on the end of it goes too - but only when the
      // limb actually came off. A broken arm keeps its hand.
      if (cut) cascadeSeveredParts(enemy, partKey);
    } catch (e) {
      console.error("Error in handleDestroyedBodyPart: " + e.message);
      console.error(e.stack);
    }
  }

  // ==========================================================================
  // The register a monster's anatomy is read and cut from, from outside here
  // ==========================================================================
  //   A body is built and kept in this file, so anything that wants to take a
  //   piece off one - the killing blow rolled on a critical hit in
  //   BattleSystemEnhanced.js, for one - asks through this register instead of
  //   reaching into _bodyParts and inventing its own idea of what a limb is.
  //
  //   severPart is the one thing applyDamageToBodyPart above will not do: it
  //   takes the part off whatever the monster's remaining HP says, because the
  //   vital protection there is exactly what stops an ordinary blow from
  //   beheading everything it lands on. A blow that has already earned the
  //   right to behead does not ask that protection for permission.
  function isVitalPart(enemy, partKey) {
    var archetype = enemy ? getArchetype(enemy._archetypeName) : null;
    var basePart = archetype && archetype.parts ? archetype.parts[partKey] : null;
    return !!(basePart && basePart.vital);
  }

  window.MonsterHealth = {
    // The parts table, built on demand: a monster nothing has struck yet has
    // no anatomy until somebody looks at it.
    parts: function (enemy) {
      if (!enemy) return null;
      if (!enemy._bodyParts) initializeEnemyBodyParts(enemy);
      return enemy._bodyParts;
    },

    isVitalPart: isVitalPart,

    // Everything still attached, filtered by what losing it would mean:
    //   { vital: true|false } - only the parts it could not live without, or
    //                           only the ones it could
    //   { canCutoff: true }   - only the parts that come away cleanly
    livingPartKeys: function (enemy, opts) {
      var o = opts || {};
      var parts = this.parts(enemy);
      if (!parts) return [];
      var archetype = getArchetype(enemy._archetypeName);
      return Object.keys(parts).filter(function (key) {
        var part = parts[key];
        if (!part || partFinished(part)) return false;
        var basePart = archetype && archetype.parts ? archetype.parts[key] : null;
        var vital = !!(basePart && basePart.vital);
        if (o.vital === true && !vital) return false;
        if (o.vital === false && vital) return false;
        if (o.canCutoff === true && !(basePart && basePart.canCutoff)) return false;
        return true;
      });
    },

    // Take the part off regardless of how much fight the monster has left.
    // Everything that hangs off it goes too, the log line is written and, for
    // a vital part, the delayed death is armed - all of it by the same code an
    // ordinary severing goes through.
    severPart: function (enemy, partKey) {
      var parts = this.parts(enemy);
      if (!parts || !parts[partKey] || parts[partKey].destroyed) return false;
      parts[partKey].currentHp = 0;
      parts[partKey].destroyed = true;
      handleDestroyedBodyPart(enemy, partKey);
      return true;
    }
  };

  // Apply special effects based on destroyed parts
  function applySpecialEffect(enemy, effect) {
    switch (effect) {
      case "disableFireBreath":
        // Find skills that involve fire breath. Prefer language-independent
        // signals so this keeps working under localization or skill renames:
        // a <FireBreath> or <Breath> note tag, or the Fire element (id 2, see
        // the elemental id table). Fall back to the English name match only
        // when neither a tag nor a fire element is present.
        var fireBreathSkillIds = [];
        enemy.enemy().actions.forEach(function (action) {
          var skill = $dataSkills[action.skillId];
          if (!skill) return;
          var meta = skill.meta || {};
          var taggedBreath = meta.FireBreath || meta.Breath;
          var isFireElement = skill.damage && skill.damage.elementId === 2;
          var nameMatch =
            skill.name &&
            (skill.name.includes("Fire") || skill.name.includes("Breath")); // i18n-ignore: skill-name probe
          if (taggedBreath || isFireElement || nameMatch) {
            fireBreathSkillIds.push(action.skillId);
          }
        });

        // Add these skill IDs to disabled actions
        enemy._disabledActions =
          enemy._disabledActions.concat(fireBreathSkillIds);
        break;

      // Add more special effects as needed
    }
  }

  // Get parameter name for display
  function getParamName(paramId) {
    return T.list('HealthMonsters.paramNames')[paramId] || T('HealthMonsters.statFallback');
  }

  // Apply limb damage to enemy
  // Apply limb damage to enemy
  function applyLimbDamage(enemy, damage, elementalType, action) {
    try {
      if (!enemy) return;

      // Make sure enemy has body parts initialized
      if (!enemy._bodyParts) initializeEnemyBodyParts(enemy);

      // Make sure $gameTemp exists
      if (!$gameTemp) {
        $gameTemp = {};
      }

      const HC = window.HealthCore;
      const damageType = HC && HC.getActionDamageType ? HC.getActionDamageType(action, action && action.subject ? action.subject() : null) : 'Blunt';
      const isMultiPart = (damageType === 'Area' || damageType === 'Explosive');

      if (isMultiPart) {
        // Area and Explosive: spread damage to multiple enemy body parts
        var livingKeys = [];
        for (var k in enemy._bodyParts) {
          if (!partFinished(enemy._bodyParts[k])) livingKeys.push(k);
        }
        if (livingKeys.length === 0) livingKeys = Object.keys(enemy._bodyParts);

        var count = Math.min(livingKeys.length, Math.floor(Math.random() * 3) + 2); // 2 to 4 parts
        var shuffled = livingKeys.slice().sort(function () { return 0.5 - Math.random(); });
        var partsToHit = shuffled.slice(0, count);

        var primaryKey = partsToHit[0];
        enemy._lastHitPart = primaryKey;
        enemy._fxLastHitPart = primaryKey;
        enemy._fxHitSeq = (enemy._fxHitSeq || 0) + 1;
        var primaryPart = enemy._bodyParts[primaryKey];
        enemy._lastHitPartName = primaryPart ? primaryPart.name : primaryKey;

        if (showHitLocation && $gameParty.inBattle()) {
          $gameTemp.hitLocationMessage = T('HealthMonsters.partWasHit', {
            enemy: enemy.name(), part: enemy._lastHitPartName,
          });
        }

        var damagePerPart = Math.floor(damage / partsToHit.length);
        var totalApplied = 0;
        partsToHit.forEach(function (pk) {
          totalApplied += applyDamageToBodyPart(enemy, pk, damagePerPart, false, action);
        });
        var remainder = damage - totalApplied;
        if (remainder > 0 && partsToHit.length > 0) {
          applyDamageToBodyPart(enemy, partsToHit[0], remainder, false, action);
        }

        $gameTemp.lastElementalType = elementalType;
      } else {
        // Piercing, Cutting, Blunt, Abstract, etc.: hit JUST ONE body part
        var hitLocation = getRandomHitLocation(enemy);
        if (!hitLocation || !hitLocation.key) {
          console.error("Failed to get hit location for enemy: " + enemy.name());
          return;
        }

        var partKey = hitLocation.key;
        enemy._lastHitPart = partKey;
        // Durable copy for blood/effect plugins
        enemy._fxLastHitPart = partKey;
        // Bump the hit sequence
        enemy._fxHitSeq = (enemy._fxHitSeq || 0) + 1;
        if (!enemy._bodyParts[partKey]) {
          console.error(
            "Body part not found: " + partKey + " for enemy: " + enemy.name()
          );
          return;
        }

        var part = enemy._bodyParts[partKey];
        enemy._lastHitPartName = part ? part.name : partKey;
        var isTargeted = hitLocation.targeted || false;

        // Show hit location in battle log if enabled
        if (showHitLocation && $gameParty.inBattle()) {
          if (isTargeted) {
            $gameTemp.hitLocationMessage = T('HealthMonsters.preciseStrike', { part: part.name });
          } else if ($gameTemp.targetMissMessage) {
            $gameTemp.hitLocationMessage = $gameTemp.targetMissMessage;
            $gameTemp.targetMissMessage = null;
          } else {
            $gameTemp.hitLocationMessage = T('HealthMonsters.partWasHit', {
              enemy: enemy.name(), part: part.name,
            });
          }
        }

        // Apply damage to the part
        applyDamageToBodyPart(enemy, partKey, damage, isTargeted, action);

        // Store the elemental type for displaying the correct message later
        $gameTemp.lastElementalType = elementalType;

        // Reset targeted body part after use
        if (isTargeted) {
          $gameTemp.targetedBodyPart = null;
          $gameTemp.targetedBodyPartEnemy = null;
        }
      }
    } catch (e) {
      console.error(e.stack);
    }
  }
  // Override Game_Enemy.param to apply body part damage effects
  var _Game_Enemy_param = Game_Enemy.prototype.param;
  Game_Enemy.prototype.param = function (paramId) {
    var value = _Game_Enemy_param.call(this, paramId);

    // Apply limb damage modifiers
    if (this._statModifiers && this._statModifiers[paramId]) {
      value = Math.round(value * (1 + this._statModifiers[paramId] / 100));
    }

    return Math.max(1, value);
  };

  // Override action list to disable actions from destroyed parts
  var _Game_Enemy_actions = Game_Enemy.prototype.actions;
  Game_Enemy.prototype.actions = function () {
    var actions = _Game_Enemy_actions.call(this);

    // Filter out disabled actions
    if (this._disabledActions && this._disabledActions.length > 0) {
      return actions.filter(function (action) {
        return !this._disabledActions.includes(action.skillId);
      }, this);
    }

    return actions;
  };

  // Override damage application for enemies
  var _Game_Action_executeHpDamage = Game_Action.prototype.executeHpDamage;
  Game_Action.prototype.executeHpDamage = function (target, value) {
    _Game_Action_executeHpDamage.call(this, target, value);

    // Only apply limb damage system to enemies
    if (target.isEnemy() && value > 0) {
      // Get the elemental type if applicable
      var elementalType = null;
      if (
        this.item() &&
        this.item().damage &&
        this.item().damage.elementId > 0
      ) {
        elementalType = this.item().damage.elementId;
      }

      // Store elemental type for later use
      $gameTemp.lastElementalType = elementalType;

      applyLimbDamage(target, value, elementalType, this);
    }
  };

  // Add hooks for BattleLog to display limb damage
  var _Window_BattleLog_displayHpDamage =
    Window_BattleLog.prototype.displayHpDamage;
  Window_BattleLog.prototype.displayHpDamage = function (target) {
    _Window_BattleLog_displayHpDamage.call(this, target);

    // Make sure $gameTemp exists
    if (!$gameTemp) {
      $gameTemp = {};
      return;
    }

    // Show hit location if enabled
    if (showHitLocation && $gameTemp.hitLocationMessage && target.isEnemy()) {
      var pushHit = typeof this.appendToActionLine === "function" ? "appendToActionLine" : "addText";
      this.push(pushHit, $gameTemp.hitLocationMessage);
      $gameTemp.hitLocationMessage = null;
    }

    // Check for limb damage logs
    if ($gameTemp.limbDamageBattleLog && target.isEnemy()) {
      var log = $gameTemp.limbDamageBattleLog;

      // Show the appropriate message
      var pushLimb = typeof this.appendToActionLine === "function" ? "appendToActionLine" : "addText";
      this.push(pushLimb, log.text);

      // Show stat effect if applicable
      /*
            if ($gameTemp.statEffectMessage) {
                var statMsg = $gameTemp.statEffectMessage;
                this.push('addText', statMsg.enemyName + "'s " + statMsg.paramName + " reduced by " + statMsg.amount + "!");
                $gameTemp.statEffectMessage = null;
            }*/

      // Handle delayed death for vital part destruction
      if (log.isVital && $gameTemp.vitalPartDestroyedEnemy) {
        // Push wait commands to delay the death
        this.push("wait");
        this.push("wait");
        this.push("wait");

        // Schedule enemy death on next update
        $gameTemp.scheduleEnemyDeath = true;
      }

      $gameTemp.limbDamageBattleLog = null;
      $gameTemp.lastElementalType = null;
    }
  };

  // Setup for when battle starts
  var _BattleManager_setup = BattleManager.setup;
  BattleManager.setup = function (troopId, canEscape, canLose) {
    _BattleManager_setup.call(this, troopId, canEscape, canLose);

    // Make sure $gameTemp exists
    if (!$gameTemp) {
      $gameTemp = {};
    }

    // Initialize body parts for all enemies
    $gameTroop.members().forEach(function (enemy) {
      initializeEnemyBodyParts(enemy);
    });

    // Initialize temp variables for vital part destruction
    $gameTemp.vitalPartDestroyedEnemy = null;
    $gameTemp.scheduleEnemyDeath = false;
    $gameTemp.checkTargetSelection = false;
    $gameTemp.checkWindowActive = false;
    $gameTemp.targetedBodyPart = null;
    $gameTemp.targetedBodyPartEnemy = null;
    $gameTemp.hitLocationMessage = null;
    $gameTemp.limbDamageBattleLog = null;
    $gameTemp.lastElementalType = null;
    $gameTemp.statEffectMessage = null;
  };
  // ============================================================================
  // The monster panel: Check (read a body) and Aim (pick the part to strike)
  // ============================================================================
  // Both commands open the same card, and it is drawn in HTML like the battle
  // log and the command menu beside it: what it has to show is prose (the
  // monster's description), a table (its stats), a row of state icons and a
  // column of bars, none of which the canvas windows fitted on screen. The list
  // of parts underneath is still a Window_Selectable and still owns the cursor,
  // the scrolling and the click hit-testing: it is laid out over EXACTLY the
  // rectangle the HTML rows are painted in (padding and row spacing are zeroed
  // for that reason), so a click always lands on the row being pointed at.

  var PART_ROW_H = 26;        // one body-part row, shared with the window below
  var PANEL_ICON_PX = 18;     // a state icon, from 32px IconSet cells
  var ICON_SHEET_COLS = 16;   // IconSet.png is 16 cells across

  // getBoundingClientRect() forces a layout, so the canvas rect is read once and
  // only re-read when the window changes size (same pattern as the command menu).
  var _panelScale = null;
  window.addEventListener("resize", function () { _panelScale = null; });

  function panelScale() {
    if (_panelScale) return _panelScale;
    var el = document.getElementById("gameCanvas");
    if (!el) return { sx: 1, sy: 1, ox: 0, oy: 0 };
    var r = el.getBoundingClientRect();
    _panelScale = {
      sx: r.width / Graphics.width,
      sy: r.height / Graphics.height,
      ox: r.left,
      oy: r.top,
    };
    return _panelScale;
  }

  function esc(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function tr(text) {
    return typeof translateText === "function" ? translateText(String(text)) : String(text);
  }

  // The card's geometry, in game pixels. Everything is derived from the screen
  // it has to fit on, and the rows are cut to a whole number of them so the
  // list never ends on half a bar. listDX/listDY are where the list of parts
  // sits inside the card: the canvas window is placed there, and the card is
  // then hung off the window's own position.
  function panelLayout() {
    var margin = 12, pad = 12, gap = 10;
    var headH = 34, listHeadH = 24, footH = 30;
    var cardW = Math.min(Graphics.boxWidth - margin * 2, 760);
    var maxH = Math.min(Graphics.boxHeight - margin * 2, 420);
    var rowsSpace = maxH - pad * 2 - headH - listHeadH - footH;
    var rowsH = Math.max(PART_ROW_H * 3, Math.floor(rowsSpace / PART_ROW_H) * PART_ROW_H);
    var cardH = rowsH + pad * 2 + headH + listHeadH + footH;
    var innerW = cardW - pad * 2;
    var listW = Math.max(200, Math.floor((innerW - gap) * 0.44));
    var infoW = innerW - gap - listW;
    return {
      cardX: Math.floor((Graphics.boxWidth - cardW) / 2),
      cardY: Math.floor((Graphics.boxHeight - cardH) / 2),
      cardW: cardW, cardH: cardH,
      pad: pad, gap: gap, headH: headH, listHeadH: listHeadH, footH: footH,
      infoW: infoW, listW: listW, rowsH: rowsH,
      listDX: pad + infoW + gap,
      listDY: pad + headH + listHeadH,
    };
  }

  // The monster's own description. Descriptions are combinatorial {a | b | c}
  // inline text, resolved (seeded from the world seed) by the shared
  // EnemyDescription service.
  function monsterDescription(enemy) {
    if (!enemy || !enemy.enemy() || !enemy.enemy().note) return "";
    var data = enemy.enemy();
    if (window.EnemyDescription) return window.EnemyDescription.describe(data.id) || "";
    var m = data.note.match(/<En:\s*([^>]+)>/i);
    return m && m[1] ? m[1].trim() : "";
  }

  function monsterLevel(enemy) {
    var note = (enemy && enemy.enemy() && enemy.enemy().note) || "";
    var m = note.match(/<Level:\s*(\d+)>/i);
    return m ? "L." + m[1] : "";
  }

  // Which element the monster hits with, and everything it takes extra damage
  // from, worst first.
  function elementInfo(enemy) {
    var attack = "";
    var traits = enemy.enemy().traits || [];
    for (var i = 0; i < traits.length; i++) {
      if (traits[i].code === Game_BattlerBase.TRAIT_ATTACK_ELEMENT && traits[i].dataId > 0) {
        attack = tr($dataSystem.elements[traits[i].dataId]);
        break;
      }
    }
    var weak = [];
    for (var e = 1; e < $dataSystem.elements.length; e++) {
      var rate = Math.round(enemy.elementRate(e) * 100);
      if (rate > 100) weak.push({ name: tr($dataSystem.elements[e]), rate: rate });
    }
    weak.sort(function (a, b) { return b.rate - a.rate; });
    return { attack: attack, weak: weak };
  }

  function iconStyle(iconIndex, px) {
    var col = iconIndex % ICON_SHEET_COLS;
    var row = Math.floor(iconIndex / ICON_SHEET_COLS);
    return "width:" + px + "px;height:" + px + "px;" +
      "background-size:" + ICON_SHEET_COLS * px + "px auto;" +
      "background-position:" + -col * px + "px " + -row * px + "px;";
  }

  // How healthy a part reads: the row, its bar and the percentage all take
  // their colour from the same four bands.
  function partGrade(part) {
    if (partFinished(part)) return "gone";
    var pct = part.currentHp / part.maxHp;
    if (pct <= 0.25) return "critical";
    if (pct <= 0.5) return "hurt";
    return "whole";
  }

  var MonsterPanel = {
    root: null,
    rowsInner: null,
    rowEls: [],
    footEl: null,
    layout: null,
    enemy: null,
    data: null,
    targeting: false,
    index: -1,
    _lastScroll: null,
    _lastPos: "",

    open: function (enemy, isTargeting, data) {
      this.close();
      var L = panelLayout();
      this.layout = L;
      this.enemy = enemy;
      this.data = data;
      this.targeting = !!isTargeting;
      this.index = -1;

      var root = document.createElement("div");
      root.id = "monster-panel-overlay";
      root.style.cssText =
        "position:fixed;display:none;z-index:400;pointer-events:none;transform-origin:top left;";
      root.style.width = L.cardW + "px";
      root.style.height = L.cardH + "px";
      root.innerHTML = this.buildHtml();
      document.body.appendChild(root);

      this.root = root;
      this.rowsInner = root.querySelector(".mpanel-rows-inner");
      this.footEl = root.querySelector(".mpanel-foot");
      this.rowEls = Array.prototype.slice.call(root.querySelectorAll(".mpanel-row"));
      this._lastScroll = null;
      this._lastPos = "";
      return L;
    },

    buildHtml: function () {
      var L = this.layout, enemy = this.enemy;
      var el = elementInfo(enemy);
      var level = monsterLevel(enemy);
      var desc = monsterDescription(enemy);

      var head =
        '<div class="mpanel-head" style="left:' + L.pad + "px;top:" + L.pad +
          "px;width:" + (L.cardW - L.pad * 2) + "px;height:" + L.headH + 'px">' +
          '<span class="mpanel-name">' + esc(tr(enemy.name())) + "</span>" +
          (level ? '<span class="mpanel-level">' + esc(level) + "</span>" : "") +
          '<span class="mpanel-hp">' + enemy.hp + " / " + enemy.mhp + "</span>" +
          '<span class="mpanel-mode">' +
            esc(T(this.targeting ? "HealthMonsters.panel.aim" : "HealthMonsters.panel.check")) +
          "</span>" +
        "</div>";

      var kv =
        '<div class="mpanel-kv"><span class="k">' + esc(T("HealthMonsters.elementLabel")) + "</span>" +
        '<span class="v">' + esc(el.attack || T("HealthMonsters.none")) + "</span></div>" +
        '<div class="mpanel-kv"><span class="k">' + esc(T("HealthMonsters.weakToLabel")) + "</span>" +
        '<span class="v">' + (el.weak.length
          ? el.weak.map(function (w) {
              return '<em class="mpanel-weak">' + esc(w.name) + " " + w.rate + "%</em>";
            }).join(" ")
          : esc(T("HealthMonsters.none"))) + "</span></div>";

      // The stats as the rest of the game names them (STR, CON, INT, ...), each
      // against the value the species is born with: a stat the fight has already
      // moved reads in the colour of which way it went.
      var stats = "";
      for (var p = 2; p < 8; p++) {
        var current = enemy.param(p);
        var base = enemy.enemy().params[p];
        var diff = current - base;
        var cls = diff > 0 ? " up" : diff < 0 ? " down" : "";
        stats +=
          '<div class="mpanel-stat"><span class="s-name">' + esc(tr(TextManager.param(p))) + "</span>" +
          '<span class="s-val' + cls + '">' + current + "</span></div>";
      }

      var states = enemy.states().map(function (s) {
        return '<span class="mpanel-state">' +
          (s.iconIndex > 0
            ? '<i class="mpanel-state-icon" style="' + iconStyle(s.iconIndex, PANEL_ICON_PX) + '"></i>'
            : "") +
          esc(tr(s.name)) + "</span>";
      }).join("");

      var info =
        '<div class="mpanel-info" style="left:' + L.pad + "px;top:" + (L.pad + L.headH) +
          "px;width:" + L.infoW + "px;height:" + (L.cardH - L.pad * 2 - L.headH) + 'px">' +
          (desc ? '<div class="mpanel-desc">' + esc(desc) + "</div>" : "") +
          '<div class="mpanel-facts">' + kv + "</div>" +
          '<div class="mpanel-stats">' + stats + "</div>" +
          '<div class="mpanel-kv states"><span class="k">' + esc(T("HealthMonsters.statesLabel")) + "</span>" +
          '<span class="v">' + (states || esc(T("HealthMonsters.none"))) + "</span></div>" +
        "</div>";

      var rows = "";
      for (var i = 0; i < this.data.length; i++) {
        rows += this.rowHtml(i);
      }

      var list =
        '<div class="mpanel-list" style="left:' + L.listDX + "px;top:" + (L.pad + L.headH) +
          "px;width:" + L.listW + "px;height:" + (L.cardH - L.pad * 2 - L.headH) + 'px">' +
          '<div class="mpanel-listhead" style="height:' + L.listHeadH + 'px">' +
            esc(T("HealthMonsters.bodyParts")) + "</div>" +
          '<div class="mpanel-rows" style="height:' + L.rowsH + 'px">' +
            '<div class="mpanel-rows-inner">' + rows + "</div>" +
          "</div>" +
          '<div class="mpanel-foot" style="height:' + L.footH + 'px"></div>' +
        "</div>";

      return head + info + list;
    },

    rowHtml: function (index) {
      var item = this.data[index];
      var part = item.part;
      var pct = Math.max(0, Math.min(100, Math.floor((part.currentHp / part.maxHp) * 100)));
      var grade = partGrade(part);
      var cls = "mpanel-row " + grade + (item.selectable === false ? " locked" : "");
      return '<div class="' + cls + '" style="height:' + PART_ROW_H + 'px">' +
        '<span class="p-name">' + esc(tr(part.name)) + "</span>" +
        (part.vital ? '<i class="p-vital"></i>' : "") +
        '<span class="p-bar"><i style="width:' + (part.destroyed ? 0 : pct) + '%"></i></span>' +
        '<span class="p-pct">' + (part.destroyed ? "&times;" : pct + "%") + "</span>" +
      "</div>";
    },

    // The line under the list: everything about the part under the cursor that
    // does not fit on its row. In Aim mode it opens with the odds of actually
    // landing the blow there, which is the whole reason the mode exists.
    footText: function (index) {
      var item = this.data[index];
      if (!item) return "";
      var part = item.part;
      var bits = [];
      if (partFinished(part)) {
        bits.push(T(part.destroyed ? "HealthMonsters.panel.destroyed"
                                   : "HealthMonsters.panel.broken"));
      } else {
        if (this.targeting) {
          bits.push(T("HealthMonsters.panel.hitChance", {
            percent: Math.round(calculateHitChance(this.enemy, item.key)),
          }));
        }
        bits.push(T("HealthMonsters.panel.hp", { current: part.currentHp, max: part.maxHp }));
      }
      if (part.vital) bits.push(T("HealthMonsters.panel.vital"));
      if (part.canCutoff) bits.push(T("HealthMonsters.panel.severable"));
      if (part.regenerates) bits.push(T("HealthMonsters.panel.regenerates"));
      return bits.join("  ·  ");
    },

    setIndex: function (index) {
      if (!this.root || index === this.index) return;
      if (this.rowEls[this.index]) this.rowEls[this.index].classList.remove("sel");
      this.index = index;
      if (this.rowEls[index]) this.rowEls[index].classList.add("sel");
      if (this.footEl) this.footEl.textContent = this.footText(index);
    },

    syncScroll: function (scrollY) {
      if (!this.rowsInner || scrollY === this._lastScroll) return;
      this._lastScroll = scrollY;
      this.rowsInner.style.transform = "translateY(" + -scrollY + "px)";
    },

    // The card hangs off the list window: that window sits at the list's own
    // rectangle, so stepping back by listDX/listDY lands on the card's corner.
    place: function (win) {
      if (!this.root) return;
      var L = this.layout;
      var sc = panelScale();
      var pt = typeof win.getGlobalPosition === "function"
        ? win.getGlobalPosition()
        : { x: win.x, y: win.y };
      var left = sc.ox + (pt.x - L.listDX) * sc.sx;
      var top = sc.oy + (pt.y - L.listDY) * sc.sy;
      // Written only when something actually moved, instead of four style
      // properties every frame.
      var pos = left + "|" + top + "|" + sc.sx + "|" + sc.sy;
      if (pos === this._lastPos) return;
      this._lastPos = pos;
      var s = this.root.style;
      s.left = left + "px";
      s.top = top + "px";
      s.transform = "scale(" + sc.sx + ", " + sc.sy + ")";
      s.display = "block";
    },

    close: function () {
      if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
      var stray = document.getElementById("monster-panel-overlay");
      if (stray && stray.parentNode) stray.parentNode.removeChild(stray);
      this.root = null;
      this.rowsInner = null;
      this.rowEls = [];
      this.footEl = null;
      this.enemy = null;
      this.data = null;
      this.index = -1;
    },
  };

  // ============================================================================
  // Window_MonsterBodyPartsList: the cursor under the HTML list
  // ============================================================================

  function Window_MonsterBodyPartsList() {
    this.initialize.apply(this, arguments);
  }

  Window_MonsterBodyPartsList.prototype = Object.create(Window_Selectable.prototype);
  Window_MonsterBodyPartsList.prototype.constructor = Window_MonsterBodyPartsList;

  Window_MonsterBodyPartsList.prototype.initialize = function (enemy, isTargeting) {
    var L = panelLayout();
    var rect = new Rectangle(L.cardX + L.listDX, L.cardY + L.listDY, L.listW, L.rowsH);
    Window_Selectable.prototype.initialize.call(this, rect);
    this.opacity = 0;
    this.backOpacity = 0;
    this.frameVisible = false;
    this.hideBackgroundDimmer();

    this._enemy = enemy;
    this._isTargeting = isTargeting || false;
    this._data = [];

    if (!$gameTemp) $gameTemp = {};
    if (!$gameTemp.lastTargetSelections) $gameTemp.lastTargetSelections = {};

    if (enemy && enemy._bodyParts) {
      for (var partKey in enemy._bodyParts) {
        this._data.push({
          key: partKey,
          part: enemy._bodyParts[partKey],
          selectable: !(this._isTargeting && partFinished(enemy._bodyParts[partKey])),
        });
      }
    }

    MonsterPanel.open(enemy, this._isTargeting, this._data);
    this.refresh();

    // In Aim mode the limb picked last time on this species is offered again,
    // as long as it is still there to be aimed at.
    var indexToSelect = 0;
    var last = $gameTemp.lastTargetSelections[enemy.enemyId()];
    if (this._isTargeting && last !== undefined &&
        last >= 0 && last < this._data.length && this._data[last].selectable !== false) {
      indexToSelect = last;
    }
    this.select(indexToSelect);
    this.activate();
    this.show();
  };

  // The rows ARE the window: no frame padding and no spacing between them, so
  // the rectangle a click is tested against is the rectangle the row is drawn in.
  Window_MonsterBodyPartsList.prototype.updatePadding = function () { this.padding = 0; };
  Window_MonsterBodyPartsList.prototype.colSpacing = function () { return 0; };
  Window_MonsterBodyPartsList.prototype.rowSpacing = function () { return 0; };
  Window_MonsterBodyPartsList.prototype.itemHeight = function () { return PART_ROW_H; };
  Window_MonsterBodyPartsList.prototype.maxCols = function () { return 1; };
  Window_MonsterBodyPartsList.prototype.maxItems = function () { return this._data.length; };

  // Everything visible is HTML.
  Window_MonsterBodyPartsList.prototype.drawItem = function () {};
  Window_MonsterBodyPartsList.prototype.drawAllItems = function () {};
  Window_MonsterBodyPartsList.prototype.refreshCursor = function () {
    this.setCursorRect(0, 0, 0, 0);
  };

  Window_MonsterBodyPartsList.prototype.select = function (index) {
    Window_Selectable.prototype.select.call(this, index);
    MonsterPanel.setIndex(index);
  };

  Window_MonsterBodyPartsList.prototype.update = function () {
    Window_Selectable.prototype.update.call(this);
    if (this._isTargeting && this.active && this._data.length > 0) {
      if (!this.isCurrentItemEnabled() && this._index >= 0) {
        this.selectNextAvailable();
      }
    }
    MonsterPanel.syncScroll(this.scrollY());
    MonsterPanel.place(this);
  };

  Window_MonsterBodyPartsList.prototype.selectNextAvailable = function () {
    var currentIndex = this.index();
    var maxItems = this._data.length;
    for (var i = 1; i < maxItems; i++) {
      var index = (currentIndex + i) % maxItems;
      if (this._data[index].selectable !== false) {
        this.select(index);
        return;
      }
    }
    this.select(-1);
  };

  Window_MonsterBodyPartsList.prototype.isCurrentItemEnabled = function () {
    if (this.index() < 0 || this.index() >= this._data.length) return false;
    return this._data[this.index()].selectable !== false;
  };

  Window_MonsterBodyPartsList.prototype.processOk = function () {
    if (this._isTargeting && this.index() >= 0 && this.isCurrentItemEnabled()) {
      if (!$gameTemp) $gameTemp = {};
      if (!$gameTemp.lastTargetSelections) $gameTemp.lastTargetSelections = {};
      $gameTemp.lastTargetSelections[this._enemy.enemyId()] = this.index();
      $gameTemp.targetedBodyPart = this._data[this.index()].key;
      // Remember WHICH monster the limb was picked out on, so a field with
      // several of them aims the blow at the one the player was looking at.
      $gameTemp.targetedBodyPartEnemy = this._enemy;
      SoundManager.playOk();
    }
    this.close();
  };

  Window_MonsterBodyPartsList.prototype.close = function () {
    $gameTemp.checkWindowActive = false;
    if (!this._isTargeting) SoundManager.playCancel();
    MonsterPanel.close();
    Window_Selectable.prototype.close.call(this);
    setTimeout(
      function () {
        if (this.parent) this.parent.removeChild(this);
      }.bind(this),
      100
    );
  };

  Window_MonsterBodyPartsList.prototype.destroy = function (options) {
    MonsterPanel.close();
    Window_Selectable.prototype.destroy.call(this, options);
  };
  // Scene_Battle modifications
  // While the panel is up the fight is held: only the list of parts keeps
  // updating, so nothing acts and no turn advances behind the card.
  var _Scene_Battle_update = Scene_Battle.prototype.update;
  Scene_Battle.prototype.update = function () {
    if ($gameTemp.checkWindowActive) {
      if (this._bodyPartsWindow) {
        this._bodyPartsWindow.update();
      }
    } else {
      _Scene_Battle_update.call(this);
    }
  };

  // A battle that ends with the panel still up (a monster dying to a poison
  // tick, the scene being torn down) must not leave the card on screen.
  var _Scene_Battle_terminate = Scene_Battle.prototype.terminate;
  Scene_Battle.prototype.terminate = function () {
    MonsterPanel.close();
    if ($gameTemp) $gameTemp.checkWindowActive = false;
    _Scene_Battle_terminate.call(this);
  };

  // ---------------------------------------------------------------------------
  // Check (read a monster's anatomy) and Aim (pick the limb to strike). Both
  // open on ONE monster, and a battle can hold several since nearby roamers
  // join a fight (BattleSystemEnhancedEncounters, section 5b). With a single
  // living enemy there is nothing to choose and the panel opens straight away;
  // with more, the player picks through the ordinary battle target window
  // first, whose handlers are put back the moment the choice is made.
  // ---------------------------------------------------------------------------

  Scene_Battle.prototype.openMonsterBodyParts = function (enemy, isTargeting) {
    this._actorCommandWindow.deactivate();

    // The card is HTML; this window is the cursor inside its list of parts.
    this._bodyPartsWindow = new Window_MonsterBodyPartsList(enemy, isTargeting);
    this.addWindow(this._bodyPartsWindow);
    if (isTargeting) {
      this._bodyPartsWindow.setHandler("ok", this.onTargetingOk.bind(this));
      this._bodyPartsWindow.setHandler("cancel", this.onTargetingCancel.bind(this));
    } else {
      this._bodyPartsWindow.setHandler("ok", this.onBodyPartsOk.bind(this));
      this._bodyPartsWindow.setHandler("cancel", this.onBodyPartsCancel.bind(this));
    }

    $gameTemp.checkWindowActive = true;
  };

  Scene_Battle.prototype.restoreEnemyWindowHandlers = function () {
    if (!this._enemyWindow) return;
    this._enemyWindow.setHandler("ok", this.onEnemyOk.bind(this));
    this._enemyWindow.setHandler("cancel", this.onEnemyCancel.bind(this));
  };

  Scene_Battle.prototype.selectMonsterForBodyParts = function (isTargeting) {
    var candidates = $gameTroop.aliveMembers().filter(function (e) {
      return e && e._bodyParts;
    });
    if (candidates.length === 0) {
      this._actorCommandWindow.activate();
      return;
    }
    if (candidates.length === 1 || !this._enemyWindow) {
      this.openMonsterBodyParts(candidates[0], isTargeting);
      return;
    }
    this._bodyPartsTargeting = isTargeting;
    this._actorCommandWindow.deactivate();
    this._enemyWindow.refresh();
    this._enemyWindow.show();
    this._enemyWindow.setHandler("ok", this.onBodyPartsEnemyOk.bind(this));
    this._enemyWindow.setHandler("cancel", this.onBodyPartsEnemyCancel.bind(this));
    this._enemyWindow.select(0);
    this._enemyWindow.activate();
  };

  Scene_Battle.prototype.onBodyPartsEnemyOk = function () {
    var enemy = this._enemyWindow.enemy();
    this._enemyWindow.hide();
    this._enemyWindow.deactivate();
    this.restoreEnemyWindowHandlers();
    if (enemy && enemy._bodyParts) {
      this.openMonsterBodyParts(enemy, this._bodyPartsTargeting);
    } else {
      this._actorCommandWindow.activate();
    }
  };

  Scene_Battle.prototype.onBodyPartsEnemyCancel = function () {
    this._enemyWindow.hide();
    this._enemyWindow.deactivate();
    this.restoreEnemyWindowHandlers();
    this._actorCommandWindow.activate();
  };

  // Check command handler
  Scene_Battle.prototype.commandCheck = function () {
    this.selectMonsterForBodyParts(false);
  };

  // Target command handler
  Scene_Battle.prototype.commandTarget = function () {
    this.selectMonsterForBodyParts(true);
  };
  // Handler for closing check window
  Scene_Battle.prototype.onBodyPartsOk = function () {
    this.closeBodyPartsWindow();
  };

  Scene_Battle.prototype.onBodyPartsCancel = function () {
    this.closeBodyPartsWindow();
  };

  // Handler for targeting window
  Scene_Battle.prototype.onTargetingOk = function () {
    // Store the selected index for this enemy
    if (this._bodyPartsWindow && this._bodyPartsWindow._enemy) {
      var enemyId = this._bodyPartsWindow._enemy.enemyId();
      if (!$gameTemp.lastTargetSelections) {
        $gameTemp.lastTargetSelections = {};
      }
      $gameTemp.lastTargetSelections[enemyId] = this._bodyPartsWindow.index();
    }

    if (this._bodyPartsWindow) {
      this._bodyPartsWindow.close();
      this._bodyPartsWindow = null;
    }

    if ($gameTemp) {
      $gameTemp.checkWindowActive = false;
    }

    // After targeting, return to the actor command window and select Attack
    this._actorCommandWindow.activate();
    this._actorCommandWindow.selectSymbol("attack");
  };

  Scene_Battle.prototype.onTargetingCancel = function () {
    // Clear targeted part if $gameTemp exists
    if ($gameTemp) {
      $gameTemp.targetedBodyPart = null;
      $gameTemp.targetedBodyPartEnemy = null;
    }

    // Clear the last target selection for this enemy
    if (this._bodyPartsWindow && this._bodyPartsWindow._enemy) {
      var enemyId = this._bodyPartsWindow._enemy.enemyId();
      if ($gameTemp.lastTargetSelections) {
        delete $gameTemp.lastTargetSelections[enemyId];
      }
    }

    this.closeBodyPartsWindow();
  };

  Scene_Battle.prototype.closeBodyPartsWindow = function () {
    if (this._bodyPartsWindow) {
      this._bodyPartsWindow.close();
      this._bodyPartsWindow = null;
    }

    if ($gameTemp) {
      $gameTemp.checkWindowActive = false;
    }

    this._actorCommandWindow.activate();
  };

  // Add a hook to BattleManager.update to handle delayed enemy death
  var _BattleManager_update = BattleManager.update;
  BattleManager.update = function () {
    _BattleManager_update.apply(this, arguments);

    // Make sure $gameTemp exists
    if (!$gameTemp) {
      $gameTemp = {};
      return;
    }

    // Handle scheduled enemy death after battle log has had time to display
    if ($gameTemp.scheduleEnemyDeath && $gameTemp.vitalPartDestroyedEnemy) {
      // Only apply death if battle log is done processing
      if (!this._logWindow || this._logWindow._methods.length === 0) {
        const target = $gameTemp.vitalPartDestroyedEnemy;
        // If the target was already killed through the normal battle log path
        // (HP damage brought it to 0 in the same blow that destroyed the vital
        // organ), the log has already pushed performCollapse and played the
        // sound. Skip it here to avoid a double collapse sound.
        const alreadyDead = target.isDead();
        target.setHp(0);
        target.addState(target.deathStateId());
        if (!alreadyDead) {
          target.performCollapse();
        }
        $gameTemp.vitalPartDestroyedEnemy = null;
        $gameTemp.scheduleEnemyDeath = false;
      }
    }
  };

  // 1) Init storage
  const _GS_initialize = Game_System.prototype.initialize;
  Game_System.prototype.initialize = function () {
    _GS_initialize.call(this);
    this._troopLimbData = {}; // { "mapId_eventId": [deep copies of each enemy._bodyParts] }
  };

  // 2) Tag the current troopId on Game_Troop
  const _GT_setup = Game_Troop.prototype.setup;
  Game_Troop.prototype.setup = function (troopId) {
    _GT_setup.call(this, troopId);
    this._troopId = troopId;
  };

  // Storage key for limb data. We key by the *map event instance* that started
  // the battle (BSE's persistentId, "mapId_eventId") so each monster on the map
  // remembers its own severed limbs. Two different events of the SAME troop id
  // get distinct keys, so cutting a limb off one no longer carries to the next.
  // Battles with no source event (random encounters, arena, etc.) return null and
  // are never persisted, so they always start with a fresh, intact body.
  function limbDataKey() {
    const bse = window.BattleSystemEnhanced;
    const pid = bse && bse.State && bse.State.currentBattleEventId;
    return pid ? String(pid) : null;
  }

  // 3) On BattleManager.setup, load any saved bodyParts
  const _BM_setup = BattleManager.setup;
  BattleManager.setup = function (troopId, canEscape, canLose) {
    _BM_setup.call(this, troopId, canEscape, canLose);
    const key = limbDataKey();
    if (!key) return;
    if (!$gameSystem._troopLimbData) $gameSystem._troopLimbData = {};
    const saved = $gameSystem._troopLimbData[key];
    if (saved) {
      $gameTroop.members().forEach((enemy, idx) => {
        if (saved[idx]) {
          // deep‐copy to avoid reference bleed
          enemy._bodyParts = JsonEx.makeDeepCopy(saved[idx]);
        }
      });
    }
  };

  // 4) Every time we apply limb damage, snapshot & save
  function saveLimbData() {
    const key = limbDataKey();
    if (!key) return; // non-instanced battle (random encounter, arena, ...) - don't persist
    if (!$gameSystem._troopLimbData) $gameSystem._troopLimbData = {};
    // deep‐clone each enemy._bodyParts; an enemy with no anatomy yet stores null
    // (JsonEx.makeDeepCopy(undefined) throws on the JSON.parse)
    $gameSystem._troopLimbData[key] = $gameTroop
      .members()
      .map((enemy) =>
        enemy && enemy._bodyParts ? JsonEx.makeDeepCopy(enemy._bodyParts) : null
      );
  }

  // Monkey-patch the existing applyDamageToBodyPart function
  const _orig_applyDamage = applyDamageToBodyPart;
  applyDamageToBodyPart = function (enemy, partKey, damage, isTargeted, action) {
    const result = _orig_applyDamage.apply(this, arguments);
    saveLimbData();
    return result;
  };

  // 5) On map change, wipe all saved data
  const _GM_setup = Game_Map.prototype.setup;
  Game_Map.prototype.setup = function (mapId) {
    _GM_setup.call(this, mapId);
    $gameSystem._troopLimbData = {};
  };


  // Add this section after the plugin parameters definition, around line 70

  // Register plugin command for opening enemy detail window
  if (PluginManager.registerCommand) {
    PluginManager.registerCommand(pluginName, "OpenEnemyDetails", args => {
      if ($gameParty.inBattle()) {
        const scene = SceneManager._scene;
        if (scene instanceof Scene_Battle) {
          scene.commandCheck();
        }
      }
    });

    PluginManager.registerCommand(pluginName, "OpenTargeting", args => {
      if ($gameParty.inBattle()) {
        const scene = SceneManager._scene;
        if (scene instanceof Scene_Battle) {
          scene.commandTarget();
        }
      }
    });
  }

  // ===========================================================================
  // WRESTLING
  // ===========================================================================
  // A grapple is the one attack that is about anatomy rather than weapons, so
  // it lives here, beside the limb tables it reads. The Wrestle battle command
  // sets the actor's own body parts against the monster's: the
  // player picks the limb they take hold WITH, the limb they take hold OF, and
  // the hold itself, and every one of those three choices moves the odds.
  //
  // A part at 0 HP, marked damaged or destroyed, or gone from the body outright
  // (severed in Blood and Oil) can neither grab nor be grabbed until it is
  // healed or replaced, on both sides of the fight. Grafts bought in the
  // prosthetic shop are ordinary entries in the same _bodyParts table, so an
  // added arm wrestles exactly like a born one, and a creature's archetype is
  // read off that table too rather than assumed to be human.
  //
  // Nothing here rolls damage by hand: a planned hold rides on the Game_Action
  // itself and is resolved in apply(), so the popup, the battle log, the limb
  // routing above and the blood FX all run as they do for any other blow.
  // ===========================================================================

  // Skill 21 is retired as a skill: nobody learns it, no list shows it, and the
  // Wrestle command is the only way in. The entry stays in the database because
  // a planned hold is applied THROUGH it - it is the Game_Action's item, which
  // is what carries the hit type, the popup, the battle log line and the limb
  // routing, so the grapple resolves exactly like any other blow.
  const WRESTLE_SKILL_ID = 21;
  const SPEC_WRESTLING = 301;          // js/db/Skills/Specialization.json

  // -------------------------------------------------------------------------
  // Sound effects helper: picks a random entry from a list of SE names (with
  // optional subfolder paths) and plays it through the engine's audio manager.
  // -------------------------------------------------------------------------
  function _playWrestleSe(list) {
    if (typeof AudioManager === "undefined" || !list || list.length === 0) return;
    const name = list[Math.floor(Math.random() * list.length)];
    AudioManager.playSe({ name, volume: 85, pitch: 90 + Math.floor(Math.random() * 21), pan: 0 });
  }

  // Sound banks for each wrestling event. Using subfolder paths into audio/se/
  // so the engine resolves them correctly (e.g. "Melee/hit01_mp3").
  const _WRESTLE_SE = {
    // A hold or strike connects
    holdHit: [
      "Melee/hit01_mp3", "Melee/hit03_mp3", "Melee/hit05_mp3",
      "Melee/hit08_mp3", "Melee/hit12_mp3", "Melee/hit15_mp3",
      "Melee/hit19_mp3", "Melee/hit22_mp3", "Melee/hit27_mp3",
    ],
    // A hold or finisher misses
    holdMiss: ["Miss", "Evasion1", "Evasion2"],
    // The enemy reverses the grapple back on the actor
    reversal: [
      "Impact/bfh1_hit_01", "Impact/bfh1_hit_03", "Impact/bfh1_hit_06",
      "Impact/bfh1_hit_10",
    ],
    // A finisher connects - bigger impact
    finisherHit: [
      "Impact/crack01_mp3", "Impact/crack03_mp3", "Impact/crack05_mp3",
      "Impact/bfh1_breaking_01", "Impact/bfh1_breaking_03",
      "Crash", "Explosion1",
    ],
    // A limb is torn off
    rip: [
      "Impact/bfh1_breaking_01", "Impact/bfh1_breaking_02",
      "Impact/bfh1_rock_breaking_01", "Impact/bfh1_rock_breaking_03",
      "Break", "Collapse1",
    ],
    // The actor has no usable limb (cannot grapple at all)
    noLimb: ["Buzzer1", "Buzzer2"],
  };

  // Which limb a part is, from its (language-independent) key. Only these
  // families can take a hold; an organ or an eye is targetable but never the
  // thing doing the wrestling.
  function wrestlePartFamily(partKey) {
    const k = String(partKey || "").toUpperCase();
    if (/BRAIN|HEART|LUNG|LIVER|STOMACH|SPLEEN|INTESTIN|KIDNEY|EYE|EAR|NOSE|TEETH|FANG|GENITAL|ORGAN|CORE|NERVE|BATTERY|REACTOR/.test(k)) return "INTERNAL";
    if (/HAND|FINGER|CLAW|PAW|TALON|PINCER|GRIP/.test(k)) return "HAND";
    if (/ARM|TENTACLE|PSEUDOPOD|WISP|WING/.test(k)) return "ARM";
    if (/FOOT|FEET|TOE|LEG|HOOF|THIGH|SHIN|KNEE/.test(k)) return "LEG";
    if (/HEAD|SKULL|FACE|JAW|MOUTH|SNOUT|BEAK|NECK|HORN/.test(k)) return "HEAD";
    if (/TAIL/.test(k)) return "TAIL";
    return "BODY";
  }

  // A part is fit to wrestle with, or to be wrestled, only while it is whole.
  function wrestlePartUsable(part) {
    if (!part) return false;
    if (partFinished(part) || part.damaged) return false;
    if (typeof part.currentHp === "number" && part.currentHp <= 0) return false;
    return true;
  }

  // The wrestler's own limbs, in the order their body lists them. This reads
  // _bodyParts and nothing else, so grafted parts, hybrid creature archetypes
  // and severed limbs are all already accounted for by whoever wrote that table.
  function wrestleOwnParts(battler) {
    if (battler && !battler._bodyParts) {
      if (typeof window.initializeBodyParts === "function" && battler.isActor && battler.isActor()) {
        window.initializeBodyParts(battler);
      } else if (typeof initializeEnemyBodyParts === "function") {
        initializeEnemyBodyParts(battler);
      }
    }
    const out = [];
    const parts = battler && battler._bodyParts;
    if (!parts) return out;
    for (const key in parts) {
      const family = wrestlePartFamily(key);
      if (family === "INTERNAL") continue;
      if (!wrestlePartUsable(parts[key])) continue;
      out.push({ key: key, part: parts[key], family: family });
    }
    return out;
  }

  // Every part of the monster still worth taking hold of. Organs are left out
  // on both sides of the grapple for the same reason: a liver is something to
  // stab, not something a hand can close on. Aim (above) is still the way to
  // put a weapon through one.
  function wrestleTargetParts(enemy) {
    if (enemy && !enemy._bodyParts) {
      if (typeof initializeEnemyBodyParts === "function") {
        initializeEnemyBodyParts(enemy);
      } else if (typeof window.initializeBodyParts === "function" && enemy.isActor && enemy.isActor()) {
        window.initializeBodyParts(enemy);
      }
    }
    const out = [];
    if (!enemy || !enemy._bodyParts) return out;
    for (const key in enemy._bodyParts) {
      const family = wrestlePartFamily(key);
      if (family === "INTERNAL") continue;
      if (!wrestlePartUsable(enemy._bodyParts[key])) continue;
      out.push({ key: key, part: enemy._bodyParts[key], family: family });
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // The holds
  // ---------------------------------------------------------------------------
  // Each is a different contest: a slam is weight against footing, a joint lock
  // is speed against strength, a choke is one set of lungs against another.
  // `stat` is what the wrestler brings, `vs` what the monster answers with, and
  // `power` scales the damage the hold puts through the limb it is on. `needs`
  // marks the holds that only exist once the monster is already held.
  const WRESTLE_HOLDS = [
    { id: "grapple", icon: 106, stat: "STR", vs: "DEX", base: 72, power: 0.35,
      limbs: ["HAND", "ARM", "LEG", "TAIL"],
      states: [{ id: 51, rate: 1.0 }] },
    { id: "strike",  icon: 77,  stat: "STR", vs: "DEX", base: 82, power: 1.0,
      limbs: ["HAND", "ARM", "LEG", "HEAD", "TAIL"],
      states: [{ id: 48, rate: 0.2 }, { id: 60, rate: 0.25, targetFamily: ["HEAD"] }] },
    { id: "lock",    icon: 73,  stat: "DEX", vs: "STR", base: 58, power: 0.7,
      limbs: ["HAND", "ARM", "LEG"], needs: "hold",
      states: [{ id: 52, rate: 1.0 }, { id: 53, rate: 0.4 }] },
    { id: "wrench",  icon: 223, stat: "STR", vs: "CON", base: 62, power: 1.7,
      limbs: ["HAND", "ARM"], needs: "hold",
      states: [{ id: 53, rate: 0.6 }, { id: 48, rate: 0.4 }] },
    { id: "slam",    icon: 72,  stat: "CON", vs: "DEX", base: 52, power: 2.1,
      limbs: ["ARM", "BODY", "LEG"], needs: "hold",
      states: [{ id: 54, rate: 0.6 }, { id: 38, rate: 0.4 }, { id: 13, rate: 0.25 }] },
    { id: "choke",   icon: 81,  stat: "CON", vs: "CON", base: 48, power: 0.8,
      limbs: ["HAND", "ARM", "TAIL"], needs: "hold", targetFamily: ["HEAD"],
      states: [{ id: 54, rate: 0.85 }, { id: 56, rate: 0.4 }, { id: 13, rate: 0.3 }] },
    { id: "rip",     icon: 1,   stat: "STR", vs: "CON", base: 26, power: 2.6,
      limbs: ["HAND", "ARM", "HEAD"], needs: "hold", rip: true,
      states: [{ id: 48, rate: 0.9 }] },
  ];

  // Holds that only mean anything where the fight has ground under it: the
  // tactical map (MapBattleMode.js). Each is an ordinary hold in every other
  // respect - the same odds, the same damage, the same states - and additionally
  // moves the monster's body across the field. They are offered nowhere else,
  // because in a lined-up battle there is nowhere to throw anybody.
  const WRESTLE_MAP_HOLDS = [
    { id: "shove",  icon: 76, stat: "STR", vs: "CON", base: 76, power: 0.6, map: true,
      limbs: ["HAND", "ARM", "BODY", "LEG"], push: 1,
      states: [{ id: 48, rate: 0.15 }] },
    { id: "throw",  icon: 72, stat: "STR", vs: "DEX", base: 56, power: 1.5, map: true,
      limbs: ["HAND", "ARM"], needs: "hold", push: 3,
      states: [{ id: 54, rate: 0.5 }, { id: 38, rate: 0.3 }] },
    { id: "suplex", icon: 72, stat: "CON", vs: "STR", base: 44, power: 2.4, map: true,
      limbs: ["ARM", "BODY"], needs: "hold", suplex: true,
      states: [{ id: 54, rate: 0.7 }, { id: 13, rate: 0.3 }, { id: 48, rate: 0.35 }] },
  ];

  function wrestleHoldById(id) {
    return WRESTLE_HOLDS.find(h => h.id === id) ||
           WRESTLE_MAP_HOLDS.find(h => h.id === id) || null;
  }

  const WRESTLE_STAT_PARAM = { STR: 2, CON: 3, INT: 4, WIS: 5, DEX: 6, PSI: 7 };

  function wrestleStat(battler, statKey) {
    const paramId = WRESTLE_STAT_PARAM[statKey];
    return Math.max(1, battler.param(paramId == null ? 2 : paramId));
  }

  // How trained the wrestler is, 1 (Untrained) to 5 (Master). Everything the
  // player can feel about being good at this comes off this one number.
  function wrestleLevel(actor) {
    if (!actor || typeof actor.specializationLevel !== "function") return 1;
    return actor.specializationLevel(SPEC_WRESTLING) || 1;
  }

  function wrestleHeld(enemy) {
    return !!(enemy && (enemy.isStateAffected(51) || enemy.isStateAffected(52)));
  }

  // Whether a hold can be attempted with these two limbs, and what it is
  // waiting for if not. The reason rides on the greyed row rather than being
  // hidden, so the player can read why the option is closed.
  function wrestleHoldBlocker(session, hold) {
    if (!session.myPartData() || !session.theirPartData()) return "limb";
    if (hold.limbs && !hold.limbs.includes(session.myFamily())) return "limb";
    if (hold.targetFamily && !hold.targetFamily.includes(session.theirFamily())) return "part";
    if (hold.needs === "hold" && !wrestleHeld(session.enemy)) return "hold";
    return null;
  }

  // The odds, as the row shows them and as apply() rolls them. One function, so
  // the number the player read is the number that is rolled.
  function wrestleChance(session, hold) {
    const actor = session.actor, enemy = session.enemy;
    const mine = session.myPartData(), theirs = session.theirPartData();
    if (!mine || !theirs) return 0;

    let chance = hold.base;

    // The contest itself: what the hold asks of the wrestler against what the
    // monster answers with.
    const ratio = wrestleStat(actor, hold.stat) / wrestleStat(enemy, hold.vs);
    chance += Math.max(-30, Math.min(30, Math.round((ratio - 1) * 34)));

    // Training. Untrained is flat; Master is worth a third of a hold.
    chance += (wrestleLevel(actor) - 1) * 8;

    // The limb doing the work: a battered arm has less to give.
    const wear = mine.maxHp > 0 ? mine.currentHp / mine.maxHp : 1;
    chance -= Math.round((1 - wear) * 25);

    // The limb being taken: small, awkward and vital parts are harder to keep.
    chance -= ((theirs.hitDifficulty || 1) - 1) * 12;
    if (theirs.vital) chance -= 8;

    // Something already held is far easier to work on.
    if (enemy.isStateAffected(52)) chance += 22;
    else if (enemy.isStateAffected(51)) chance += 12;

    return Math.max(5, Math.min(95, Math.round(chance)));
  }

  // Damage a hold puts through the limb it is on. Training is worth about as
  // much again at Master as the raw strength behind it.
  function wrestleDamage(session, hold) {
    const lvl = wrestleLevel(session.actor);
    const base = wrestleStat(session.actor, hold.stat) * (0.55 + 0.22 * lvl) * (hold.power || 1);
    const soak = session.enemy.def * 0.45;
    return Math.max(1, Math.round((base - soak) * (0.9 + Math.random() * 0.2)));
  }

  // How readily a hold's states stick, again off training alone.
  function wrestleStateRate(actor) {
    return 0.7 + 0.12 * (wrestleLevel(actor) - 1);
  }

  // ---------------------------------------------------------------------------
  // Finishers
  // ---------------------------------------------------------------------------
  // A wrestler who has trained an art can end an exchange with one of its real
  // moves whether or not they ever learned it as a skill: the training is the
  // permission. Every close-quarters unarmed skill in the database is a
  // candidate, filed under the specialization SkillSpecs already assigns it, so
  // a boxer brings punches to the same grapple a judoka brings throws to.
  const WRESTLE_ARTS = [
    "Wrestling", "Sumo Wrestling", "Grappling", "Arm Wrestling", "Unarmed Combat",
    "Boxing", "Karate", "Judo", "Aikido", "Capoeira", "Muay Thai", "Taekwondo",
    "Krav Maga", "Kickboxing", "Tai Chi",
  ];
  const WRESTLE_FINISHERS_PER_ART = 2;
  const WRESTLE_FINISHER_CAP = 14;
  // Rows a list page holds before it starts turning. The command window is
  // bottom-pinned and grows upward, so this is what keeps it on screen.
  const WRESTLE_PAGE_ROWS = 8;

  let _wrestleFinisherPool = null;

  // Training needed to pull a move off cold, read off what it costs a battler
  // who owns it: the database stays the single word on how hard a move is.
  function wrestleFinisherTier(skill) {
    return Math.max(1, Math.min(5, Math.ceil((skill.tpCost || 0) / 14) || 1));
  }

  function wrestleFinisherPool() {
    if (_wrestleFinisherPool) return _wrestleFinisherPool;
    if (!window.SkillSpecs || !window.SkillSpecs.ready) return null;
    if (!window.Specializations || !window.Specializations.ready) return null;
    const pool = [];
    for (const skill of $dataSkills) {
      if (!skill || !skill.name || !skill.name.trim() || skill.name.startsWith("<--")) continue;
      if (skill.id === WRESTLE_SKILL_ID) continue;
      if (skill.stypeId <= 0 || skill.scope !== 1) continue;
      if (skill.damage.type !== 1) continue;
      if (skill.occasion !== 0 && skill.occasion !== 1) continue;
      if (skill.requiredWtypeId1 || skill.requiredWtypeId2) continue;
      const role = skill.note ? skill.note.match(/<role:\s*(\w+)>/i) : null;
      if (role && role[1].toLowerCase() !== "offensive") continue;
      const range = skill.note ? skill.note.match(/<Range:\s*(\d+)>/i) : null;
      if (range && Number(range[1]) > 2) continue;
      const spec = window.SkillSpecs.forSkill(skill);
      if (!spec || WRESTLE_ARTS.indexOf(spec.name) < 0) continue;
      pool.push({ id: skill.id, spec: spec, tier: wrestleFinisherTier(skill) });
    }
    _wrestleFinisherPool = pool;
    return pool;
  }

  // What this wrestler can finish with right now: the two best moves of every
  // art they have actually trained, plus anything they know as a skill outright.
  // An untrained art offers nothing, which is what makes training one felt.
  function wrestleFinishers(actor) {
    const pool = wrestleFinisherPool();
    if (!pool || !actor || typeof actor.specializationLevel !== "function") return [];
    const byArt = new Map();
    const known = [];
    for (const entry of pool) {
      if (actor.isLearnedSkill && actor.isLearnedSkill(entry.id)) { known.push(entry); continue; }
      const level = actor.specializationLevel(entry.spec.id) || 1;
      if (level < 2 || entry.tier > level) continue;
      if (!byArt.has(entry.spec.id)) byArt.set(entry.spec.id, []);
      byArt.get(entry.spec.id).push(entry);
    }
    const out = [];
    for (const list of byArt.values()) {
      list.sort((a, b) => (b.tier - a.tier) || (a.id - b.id));
      for (const entry of list.slice(0, WRESTLE_FINISHERS_PER_ART)) out.push(entry);
    }
    for (const entry of known) {
      if (!out.some(e => e.id === entry.id)) out.push(entry);
    }
    out.sort((a, b) =>
      (a.spec.name < b.spec.name ? -1 : a.spec.name > b.spec.name ? 1 : a.tier - b.tier));
    return out.slice(0, WRESTLE_FINISHER_CAP);
  }

  // A finisher is a contest too, on the stat its own art runs on: a judo throw
  // asks a different question of the body than a boxer's uppercut does.
  function wrestleFinisherChance(session, entry) {
    const actor = session.actor, enemy = session.enemy;
    const mine = session.myPartData(), theirs = session.theirPartData();
    if (!mine || !theirs) return 0;
    const ratio = wrestleStat(actor, entry.spec.stat || "STR") / wrestleStat(enemy, "DEX");
    let chance = 66 - (entry.tier - 1) * 7;
    chance += Math.max(-30, Math.min(30, Math.round((ratio - 1) * 34)));
    chance += ((actor.specializationLevel(entry.spec.id) || 1) - 1) * 7;
    chance += (wrestleLevel(actor) - 1) * 3;
    chance -= Math.round((1 - (mine.maxHp > 0 ? mine.currentHp / mine.maxHp : 1)) * 25);
    chance -= ((theirs.hitDifficulty || 1) - 1) * 10;
    if (enemy.isStateAffected(52)) chance += 20;
    else if (enemy.isStateAffected(51)) chance += 10;
    return Math.max(5, Math.min(95, Math.round(chance)));
  }

  // ---------------------------------------------------------------------------
  // The planning session
  // ---------------------------------------------------------------------------
  // Everything the menu shows, and the only thing its rows read. It is rebuilt
  // whenever the menu opens and again when the hold lands, so a limb lost
  // mid-fight is simply gone from the next exchange.
  function wrestleSession(actor, enemy) {
    const session = {
      actor: actor,
      enemy: enemy,
      page: "root",
      offset: 0,
      myParts: wrestleOwnParts(actor),
      theirParts: wrestleTargetParts(enemy),
      myKey: null,
      theirKey: null,
      myPartData() { return this.actor._bodyParts ? this.actor._bodyParts[this.myKey] : null; },
      theirPartData() { return this.enemy._bodyParts ? this.enemy._bodyParts[this.theirKey] : null; },
      myFamily() { return wrestlePartFamily(this.myKey); },
      theirFamily() { return wrestlePartFamily(this.theirKey); },
    };
    // Open on a hand, since that is what a hold is usually taken with, and on
    // the biggest thing the monster presents.
    const hand = session.myParts.find(p => p.family === "HAND") ||
                 session.myParts.find(p => p.family === "ARM") ||
                 session.myParts[0];
    session.myKey = hand ? hand.key : null;
    const bulk = session.theirParts.find(p => p.family === "BODY") ||
                 session.theirParts.find(p => p.family === "HEAD") ||
                 session.theirParts[0];
    session.theirKey = bulk ? bulk.key : null;
    return session;
  }

  // ---------------------------------------------------------------------------
  // Window_WrestleHelp - the line above the limb rows
  // ---------------------------------------------------------------------------
  // Which limb a hold is taken with, and which one it is taken on, are chosen
  // in the battle command menu like everything else the actor does: they are
  // pages of the grapple plan, not a window of their own. What a limb is good
  // for does not fit on a row beside its name, so it is said here, in a box
  // hanging off the top edge of the menu while a limb is under the cursor.
  const WRESTLE_HELP_WIDTH = 520;

  // Window_Help draws its text in one straight line and lets it run off the
  // edge, which a sentence naming five holds does immediately (and Italian
  // sooner than English). This one wraps to the box it was given and then
  // shrinks the box to the lines it actually used, so the panel is as tall as
  // the sentence needs and no taller.
  function Window_WrestleHelp() {
    this.initialize.apply(this, arguments);
  }

  Window_WrestleHelp.prototype = Object.create(Window_Help.prototype);
  Window_WrestleHelp.prototype.constructor = Window_WrestleHelp;

  Window_WrestleHelp.prototype.wrapLines = function (text, maxWidth) {
    const lines = [];
    let line = "";
    for (const word of String(text || "").split(" ")) {
      const candidate = line ? line + " " + word : word;
      if (line && this.textWidth(candidate) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  };

  Window_WrestleHelp.prototype.refresh = function () {
    const rect = this.baseTextRect();
    this.contents.clear();
    const lines = this.wrapLines(this._text, rect.width);
    for (let i = 0; i < lines.length; i++) {
      this.drawText(lines[i], rect.x, rect.y + i * this.lineHeight(), rect.width);
    }
  };

  // The corner the box grows from: it is pinned to the right edge of the limb
  // list and to the space above it, and grows leftward and upward from there.
  Window_WrestleHelp.prototype.anchorTo = function (right, bottom) {
    if (this._anchorRight === right && this._anchorBottom === bottom) return;
    this._anchorRight = right;
    this._anchorBottom = bottom;
    this.fitToText();
  };

  Window_WrestleHelp.prototype.fitToText = function () {
    if (this._anchorRight == null) return;
    const width = Math.min(WRESTLE_HELP_WIDTH, this._anchorRight - 4);
    const inner = width - this.padding * 2 - this.itemPadding() * 2;
    const lines = Math.max(1, Math.min(3, this.wrapLines(this._text, inner).length));
    const height = this.fittingHeight(lines);
    this.move(this._anchorRight - width, Math.max(4, this._anchorBottom - height), width, height);
    this.createContents();
    this.refresh();
  };

  Window_WrestleHelp.prototype.setText = function (text) {
    if (this._text === text) return;
    this._text = text;
    this.fitToText();
  };

  function wrestleCondition(part) {
    return Math.round(100 * (part && part.maxHp > 0 ? part.currentHp / part.maxHp : 1));
  }

  // What the highlighted limb means for the grapple: which holds one of yours
  // can take, and what one of theirs will be like to keep hold of.
  function wrestleLimbHelp(entry, side) {
    const part = entry.part;
    if (side === "mine") {
      const names = WRESTLE_HOLDS
        .filter(hold => !hold.limbs || hold.limbs.includes(entry.family))
        .map(hold => T('HealthMonsters.wrestle.hold.' + hold.id + '.name'));
      return names.length
        ? T('HealthMonsters.wrestle.limbs.helpMine', { part: part.name, holds: names.join(", ") })
        : T('HealthMonsters.wrestle.limbs.helpMineNone', { part: part.name });
    }
    const note = part.vital ? "vital"
               : (part.hitDifficulty || 1) > 1 ? "awkward"
               : "plain";
    return T('HealthMonsters.wrestle.limbs.helpTheirs', {
      part: part.name,
      note: T('HealthMonsters.wrestle.limbs.note.' + note),
    });
  }

  // ---------------------------------------------------------------------------
  // The menu, drawn as the actor's command list
  // ---------------------------------------------------------------------------
  // A grapple replaces the command menu rather than opening a window over it:
  // while the hold is being planned there is nothing else the actor can do, and
  // the rows sit exactly where the player's eye already is. The drawing belongs
  // to BattleSystemEnhanchedCommands (that window is its), and only the list is
  // ours; it calls in through window.Wrestling.
  const Wrestling = {
    isMenuOpen(win) {
      return !!(win && win._wrestleSession);
    },

    // Whether the Wrestle row in the battle command menu
    // (BattleSystemEnhanchedCommands.js) is live for this body. Grappling is a
    // thing a body does, not a spell it knows, so what gates it is anatomy: at
    // least one limb still whole to take hold with, and somebody still standing
    // to take hold of. The grapple menu is drawn in Scene_Battle's own command
    // window, so a tactical map fight has no room for it.
    canCommand(actor) {
      if (!actor || !actor.isActor || !actor.isActor()) return false;
      if (!$gameParty.inBattle()) return false;
      if (!$gameTroop || $gameTroop.aliveMembers().length === 0) return false;
      if (wrestleOwnParts(actor).length === 0) return false;
      // On the map it takes a monster within arm's reach.
      if (mapBattle()) return !!mapBattleGrappleTarget(actor);
      return true;
    },

    // The Wrestle command was chosen: the grapple rides on the ordinary action
    // as skill 21 (retired from every list and learnset, it is the carrier the
    // hold is applied through and nothing else), and the monster is picked with
    // the same target window every single-target action uses. A lone monster is
    // chosen for the player by the alias below, which opens the plan straight
    // away. Returns false when there is nothing to wrestle, so the caller can
    // buzz and hand input back.
    startFromCommand(scene) {
      const actor = BattleManager.actor();
      if (!scene || !actor || !this.canCommand(actor)) return false;
      const action = BattleManager.inputtingAction();
      if (!action) return false;
      action.setSkill(WRESTLE_SKILL_ID);
      const neighbour = mapBattleGrappleTarget(actor);
      if (neighbour) {
        action.setTarget(neighbour.index());
        return scene.openWrestleMenu(neighbour);
      }
      const alive = $gameTroop.aliveMembers();
      if (alive.length === 1) {
        action.setTarget(alive[0].index());
        return scene.openWrestleMenu(alive[0]);
      }
      scene._wrestleSelecting = true;
      scene.startEnemySelection();
      return true;
    },

    // Stands in for Window_ActorCommand.makeCommandList while a hold is being
    // planned. Rows carry their label in `name`, which that window falls back to
    // for symbols it does not know.
    makeCommandList(win) {
      const session = win._wrestleSession;
      const push = (name, ext, enabled, icon) =>
        win.addCommandWithIcon(name, "wrestleRow", enabled !== false, ext, icon, enabled === false);
      // A shelf can run past what the command window has room for (it is
      // bottom-pinned and grows upward), so a long one turns a page at a time
      // instead of running off the top of the screen. Finishers and limbs both
      // do it, and both count their page off session.offset.
      const pageOf = (list) => ({
        shown: list.slice(session.offset, session.offset + WRESTLE_PAGE_ROWS),
        turns: list.length > WRESTLE_PAGE_ROWS,
      });

      if (session.page === "finisher") {
        const finishers = wrestleFinishers(session.actor);
        if (finishers.length === 0) {
          push(T('HealthMonsters.wrestle.menu.noFinisher'), { kind: "blocked" }, false, 76);
        }
        const page = pageOf(finishers);
        for (const entry of page.shown) {
          const skill = $dataSkills[entry.id];
          push(T('HealthMonsters.wrestle.menu.finisherRow', {
                 name: skill.name,
                 art: window.Specializations.displayName(entry.spec),
                 chance: wrestleFinisherChance(session, entry),
               }), { kind: "finisher", id: entry.id }, true, skill.iconIndex || 77);
        }
        if (page.turns) {
          push(T('HealthMonsters.wrestle.menu.more', { count: finishers.length }),
               { kind: "more", total: finishers.length }, true, 4);
        }
        push(T('HealthMonsters.wrestle.menu.back'), { kind: "back" }, true, 140);
        return;
      }

      // A limb page: the whole body, one part per row, the part the plan is
      // already using marked as such. Long bodies turn like the finisher shelf
      // does rather than growing the menu past the top of the screen.
      if (session.page === "mine" || session.page === "theirs") {
        const side = session.page;
        const list = side === "mine" ? session.myParts : session.theirParts;
        const chosen = side === "mine" ? session.myKey : session.theirKey;
        const page = pageOf(list);
        for (const entry of page.shown) {
          const key = entry.key === chosen ? "limbRowCurrent" : "limbRow";
          push(T('HealthMonsters.wrestle.menu.' + key, {
                 part: entry.part.name, percent: wrestleCondition(entry.part),
               }), { kind: "limb", side: side, key: entry.key }, true,
               side === "mine" ? 106 : 96);
        }
        if (page.turns) {
          push(T('HealthMonsters.wrestle.menu.more', { count: list.length }),
               { kind: "more", total: list.length }, true, 4);
        }
        push(T('HealthMonsters.wrestle.menu.back'), { kind: "back" }, true, 140);
        return;
      }

      // Root: the two limbs, then every hold, then the finisher shelf.
      const mine = session.myPartData();
      const theirs = session.theirPartData();
      push(mine ? T('HealthMonsters.wrestle.menu.myLimb',
                    { part: mine.name, percent: wrestleCondition(mine) })
                : T('HealthMonsters.wrestle.menu.noLimb'),
           { kind: "openMine" }, session.myParts.length > 0, 106);
      push(theirs ? T('HealthMonsters.wrestle.menu.theirLimb',
                      { part: theirs.name, percent: wrestleCondition(theirs) })
                  : T('HealthMonsters.wrestle.menu.noTarget'),
           { kind: "openTheirs" }, session.theirParts.length > 0, 96);

      for (const hold of WRESTLE_HOLDS) {
        const name = T('HealthMonsters.wrestle.hold.' + hold.id + '.name');
        const blocker = wrestleHoldBlocker(session, hold);
        if (blocker) {
          push(T('HealthMonsters.wrestle.menu.holdBlocked', {
                 name: name, reason: T('HealthMonsters.wrestle.menu.blocked.' + blocker),
               }), { kind: "blocked" }, false, hold.icon);
        } else {
          push(T('HealthMonsters.wrestle.menu.holdRow', {
                 name: name, chance: wrestleChance(session, hold),
               }), { kind: "hold", id: hold.id }, true, hold.icon);
        }
      }

      // On the map a hold can also move the body it has hold of.
      if (mapBattle()) {
        for (const hold of WRESTLE_MAP_HOLDS) {
          const name = T('HealthMonsters.wrestle.hold.' + hold.id + '.name');
          const blocker = wrestleHoldBlocker(session, hold);
          if (blocker) {
            push(T('HealthMonsters.wrestle.menu.holdBlocked', {
                   name: name, reason: T('HealthMonsters.wrestle.menu.blocked.' + blocker),
                 }), { kind: "blocked" }, false, hold.icon);
          } else {
            push(T('HealthMonsters.wrestle.menu.holdRow', {
                   name: name, chance: wrestleChance(session, hold),
                 }), { kind: "hold", id: hold.id }, true, hold.icon);
          }
        }
      }

      push(T('HealthMonsters.wrestle.menu.finishers'), { kind: "openFinisher" },
           !!mine && !!theirs && wrestleFinishers(session.actor).length > 0, 76);
    },
  };
  window.Wrestling = Wrestling;

  // ---------------------------------------------------------------------------
  // Scene wiring
  // ---------------------------------------------------------------------------

  // The tactical map fight (MapBattleMode.js) is a battle drawn on Scene_Map,
  // so both planning menus work there too; these two answer what is different
  // about it. Grappling is a thing done at arm's length, so on the map it wants
  // a monster standing next to you rather than merely standing.
  function mapBattle() {
    const MBM = window.MapBattleMode;
    return (MBM && MBM.isActive && MBM.isActive()) ? MBM : null;
  }

  function mapBattleGrappleTarget(actor) {
    const MBM = mapBattle();
    return MBM && MBM.grappleTargetFor ? MBM.grappleTargetFor(actor) : null;
  }

  // Ending the actor's command, whichever window the fight is drawn in.
  function endActorCommand(scene) {
    if (scene && scene.selectNextCommand) scene.selectNextCommand();
    else BattleManager.selectNextCommand();
  }

  function isWrestleAction(action) {
    const item = action && action.item ? action.item() : null;
    return !!(item && DataManager.isSkill(item) && item.id === WRESTLE_SKILL_ID);
  }

  Scene_Battle.prototype.openWrestleMenu = function (enemy) {
    const actor = BattleManager.actor();
    const win = this._actorCommandWindow;
    if (!actor || !enemy || !win) return false;
    if (actor && !actor._bodyParts && typeof window.initializeBodyParts === "function") {
      window.initializeBodyParts(actor);
    }
    if (!enemy._bodyParts) initializeEnemyBodyParts(enemy);
    const session = wrestleSession(actor, enemy);
    if (session.myParts.length === 0 || session.theirParts.length === 0) {
      SoundManager.playBuzzer();
      return false;
    }
    this._wrestleSelecting = false;
    win._targetSession = null;
    // Which command opened the list the Wrestle skill was picked from, read
    // while the window is still showing the actor's own commands. Backing out
    // of the plan hands that symbol back to the scene's ordinary
    // onEnemyCancel, so the player lands on the row they left.
    this._wrestleReturnSymbol = win.currentSymbol();
    if (this._skillWindow) { this._skillWindow.deactivate(); this._skillWindow.hide(); }
    if (this._itemWindow) { this._itemWindow.deactivate(); this._itemWindow.hide(); }
    if (this._actorWindow) { this._actorWindow.deactivate(); this._actorWindow.hide(); }
    if (this._enemyWindow) { this._enemyWindow.deactivate(); this._enemyWindow.hide(); }

    // The command window's own handlers are put aside whole and given back on
    // the way out, so nothing else has to know this mode exists.
    win._wrestleSession = session;
    win._wrestleSavedHandlers = win._handlers;
    win._handlers = {};
    win.setHandler("wrestleRow", this.onWrestleRow.bind(this));
    win.setHandler("cancel", this.onWrestleCancel.bind(this));
    win.show();
    win.refresh();
    win.select(0);
    win.activate();
    return true;
  };

  Scene_Battle.prototype.closeWrestleMenu = function () {
    const win = this._actorCommandWindow;
    this.closeWrestleHelpWindow();
    if (!win || !win._wrestleSession) return;
    win._wrestleSession = null;
    if (win._wrestleSavedHandlers) win._handlers = win._wrestleSavedHandlers;
    win._wrestleSavedHandlers = null;
  };

  // Where the cursor should land after the list is rebuilt: the row answering
  // to this kind (and, for a limb, to this part), so stepping in and out of a
  // page reads as one continuous plan rather than a menu that keeps losing the
  // player's place.
  Scene_Battle.prototype._selectWrestleRow = function (focus) {
    const win = this._actorCommandWindow;
    win.refresh();
    const list = win._list || [];
    const index = focus
      ? list.findIndex(row => row.ext && row.ext.kind === focus.kind &&
                              (focus.key == null || row.ext.key === focus.key))
      : -1;
    win.select(index >= 0 ? index : 0);
    win.activate();
  };

  Scene_Battle.prototype.onWrestleRow = function () {
    const win = this._actorCommandWindow;
    const session = win && win._wrestleSession;
    const ext = win ? win.currentExt() : null;
    if (!session || !ext) return;

    let focus = null;
    switch (ext.kind) {
      case "openMine":
      case "openTheirs": {
        const side = ext.kind === "openMine" ? "mine" : "theirs";
        const list = side === "mine" ? session.myParts : session.theirParts;
        if (list.length === 0) { SoundManager.playBuzzer(); win.activate(); return; }
        // The page opens turned to the limb the plan is already using.
        const key = side === "mine" ? session.myKey : session.theirKey;
        const at = list.findIndex(entry => entry.key === key);
        session.page = side;
        session.offset = at > 0 ? Math.floor(at / WRESTLE_PAGE_ROWS) * WRESTLE_PAGE_ROWS : 0;
        focus = { kind: "limb", key: key };
        break;
      }
      case "limb":
        if (ext.side === "mine") session.myKey = ext.key;
        else session.theirKey = ext.key;
        session.page = "root";
        session.offset = 0;
        focus = { kind: ext.side === "mine" ? "openMine" : "openTheirs" };
        break;
      case "openFinisher": session.page = "finisher"; session.offset = 0; break;
      case "back":
        focus = session.page === "mine" ? { kind: "openMine" }
              : session.page === "theirs" ? { kind: "openTheirs" }
              : { kind: "openFinisher" };
        session.page = "root";
        session.offset = 0;
        break;
      case "more":
        session.offset += WRESTLE_PAGE_ROWS;
        if (session.offset >= ext.total) session.offset = 0;
        break;
      case "hold":
      case "finisher": {
        const action = BattleManager.inputtingAction();
        if (!action) return;
        // The plan rides on the action and is settled when the turn comes round.
        action._wrestlePlan = {
          holdId: ext.kind === "hold" ? ext.id : null,
          skillId: ext.kind === "finisher" ? ext.id : 0,
          myPart: session.myKey,
          theirPart: session.theirKey,
        };
        this.closeWrestleMenu();
        endActorCommand(this);
        return;
      }
      default:
        SoundManager.playBuzzer();
        return;
    }
    this._selectWrestleRow(focus);
  };

  Scene_Battle.prototype.onWrestleCancel = function () {
    const win = this._actorCommandWindow;
    const session = win && win._wrestleSession;
    if (!session) return;
    if (session.page !== "root") {
      const focus = session.page === "mine" ? { kind: "openMine" }
                  : session.page === "theirs" ? { kind: "openTheirs" }
                  : { kind: "openFinisher" };
      session.page = "root";
      session.offset = 0;
      this._selectWrestleRow(focus);
      return;
    }
    this.closeWrestleMenu();
    const action = BattleManager.inputtingAction();
    if (action) action._wrestlePlan = null;
    if (this._enemyWindow) this._enemyWindow.hide();
    win.show();
    win.refresh();
    win.selectSymbol(this._wrestleReturnSymbol || "wrestle");
    win.activate();
  };

  // Picking the monster is picking the body. A lone monster is chosen for the
  // player (BattleSystemEnhanced does that for every single-target action), so
  // both roads have to end at the planning menu.
  const _SB_startEnemySelection_WR = Scene_Battle.prototype.startEnemySelection;
  Scene_Battle.prototype.startEnemySelection = function () {
    const action = BattleManager.inputtingAction();
    if (isWrestleAction(action)) {
      const alive = $gameTroop.aliveMembers();
      if (alive.length === 1) {
        action.setTarget(alive[0].index());
        if (this.openWrestleMenu(alive[0])) return;
      }
    }
    _SB_startEnemySelection_WR.call(this);
  };

  const _SB_onEnemyOk_WR = Scene_Battle.prototype.onEnemyOk;
  Scene_Battle.prototype.onEnemyOk = function () {
    const action = BattleManager.inputtingAction();
    if (this._wrestleSelecting || isWrestleAction(action)) {
      this._wrestleSelecting = false;
      const enemy = this._enemyWindow ? this._enemyWindow.enemy() : null;
      if (this._enemyWindow) { this._enemyWindow.hide(); this._enemyWindow.deactivate(); }
      if (action && enemy) {
        action.setTarget(enemy.isEnemy && typeof enemy.index === "function" ? enemy.index() : (this._enemyWindow ? this._enemyWindow.enemyIndex() : 0));
      }
      if (enemy && this.openWrestleMenu(enemy)) return;
      SoundManager.playBuzzer();
      if (this._actorCommandWindow) {
        this._actorCommandWindow.show();
        this._actorCommandWindow.refresh();
        this._actorCommandWindow.activate();
      }
      return;
    }
    _SB_onEnemyOk_WR.call(this);
  };

  // Backing out of the target picker under the Wrestle command: "wrestle" is a
  // symbol the engine's own onEnemyCancel knows nothing about, and would leave
  // no window listening at all.
  const _SB_onEnemyCancel_WRC = Scene_Battle.prototype.onEnemyCancel;
  Scene_Battle.prototype.onEnemyCancel = function () {
    if (this._wrestleSelecting) {
      this._wrestleSelecting = false;
      const win = this._actorCommandWindow;
      if (win) {
        win._targetSession = null;
        win.show();
        win.refresh();
        win.selectSymbol(this._wrestleReturnSymbol || "wrestle");
        win.activate();
      }
      return;
    }
    const win = this._actorCommandWindow;
    if (win && win.currentSymbol() === "wrestle") {
      if (this._enemyWindow) this._enemyWindow.hide();
      win.show();
      win.activate();
      return;
    }
    _SB_onEnemyCancel_WRC.call(this);
  };

  // A menu left standing when input moves on (the next actor, the end of the
  // round, a battle finishing under the player) would leave the command window
  // holding a list that is no longer about anything.
  const _SB_startActorCommandSelection_WR = Scene_Battle.prototype.startActorCommandSelection;
  Scene_Battle.prototype.startActorCommandSelection = function () {
    this.closeWrestleMenu();
    this._wrestleSelecting = false;
    _SB_startActorCommandSelection_WR.call(this);
  };

  const _SB_endCommandSelection_WR = Scene_Battle.prototype.endCommandSelection;
  Scene_Battle.prototype.endCommandSelection = function () {
    this.closeWrestleMenu();
    this._wrestleSelecting = false;
    _SB_endCommandSelection_WR.call(this);
  };

  // The help box that goes with a limb row. It is not an input window: the
  // command menu keeps the cursor throughout, and this only says what the row
  // under it means.
  Scene_Battle.prototype.createWrestleHelpWindow = function () {
    this._wrestleHelp = new Window_WrestleHelp(new Rectangle(0, 0, WRESTLE_HELP_WIDTH, 120));
    this._wrestleHelp.hide();
    this.addWindow(this._wrestleHelp);
  };

  // Called on every cursor move inside the grapple plan (see the select hook
  // below). The box shows only while a limb is highlighted: a hold row says
  // what it needs to say on the row itself.
  Scene_Battle.prototype.updateWrestleHelp = function () {
    const cmd = this._actorCommandWindow;
    const session = cmd && cmd._wrestleSession;
    const ext = session ? cmd.currentExt() : null;
    if (!session || !ext || ext.kind !== "limb") {
      if (this._wrestleHelp) this._wrestleHelp.hide();
      return;
    }
    const list = ext.side === "mine" ? session.myParts : session.theirParts;
    const entry = list.find(item => item.key === ext.key);
    if (!entry) {
      if (this._wrestleHelp) this._wrestleHelp.hide();
      return;
    }
    if (!this._wrestleHelp) this.createWrestleHelpWindow();
    const help = this._wrestleHelp;
    // Pinned to the top-right corner of the command menu, which grows and
    // shrinks with the list it is showing, so the two always share an edge.
    help.anchorTo(cmd.x + cmd.width, cmd.y - 4);
    help.setText(wrestleLimbHelp(entry, ext.side));
    help.show();
  };

  Scene_Battle.prototype.closeWrestleHelpWindow = function () {
    if (this._wrestleHelp) this._wrestleHelp.hide();
  };

  // Every cursor move in the command window is a chance for the help box to
  // change: the rows the grapple plan puts there are its own, and this is the
  // only place the scene hears about the cursor landing on one.
  const _WAC_select_WR = Window_ActorCommand.prototype.select;
  Window_ActorCommand.prototype.select = function (index) {
    _WAC_select_WR.call(this, index);
    const scene = SceneManager._scene;
    if (this._wrestleSession && scene && scene.updateWrestleHelp) scene.updateWrestleHelp();
  };

  // ---------------------------------------------------------------------------
  // Resolving a hold
  // ---------------------------------------------------------------------------

  // The limb a planned hold is on, forced past the ordinary hit-location roll:
  // the wrestler already made their roll, in wrestleChance, and rolling again
  // here would charge them twice for the same aim.
  let _wrestleForcedPart = null;
  let _wrestleForcedEnemy = null;

  const _getRandomHitLocation_WR = getRandomHitLocation;
  getRandomHitLocation = function (enemy) {
    if (_wrestleForcedPart && _wrestleForcedEnemy === enemy && enemy._bodyParts &&
        wrestlePartUsable(enemy._bodyParts[_wrestleForcedPart])) {
      return { key: _wrestleForcedPart, targeted: true };
    }
    return _getRandomHitLocation_WR.call(this, enemy);
  };

  // A planned hold carries its own damage and its own verdict; the formula in
  // the database is only what the skill panel reads.
  const _GA_evalDamageFormula_WR = Game_Action.prototype.evalDamageFormula;
  Game_Action.prototype.evalDamageFormula = function (target) {
    if (this._wrestleDamage != null) return this._wrestleDamage;
    return _GA_evalDamageFormula_WR.call(this, target);
  };

  const _GA_itemHit_WR = Game_Action.prototype.itemHit;
  Game_Action.prototype.itemHit = function (target) {
    if (this._wrestleForceMiss) return 0;
    if (this._wrestleForceHit) return 1;
    return _GA_itemHit_WR.call(this, target);
  };

  const _GA_itemEva_WR = Game_Action.prototype.itemEva;
  Game_Action.prototype.itemEva = function (target) {
    if (this._wrestleForceHit) return 0;
    return _GA_itemEva_WR.call(this, target);
  };

  function wrestleLog(text) {
    const log = BattleManager._logWindow;
    if (log && typeof log.push === "function") {
      log.push("addText", text);
      log.push("wait");
    }
  }

  // A hold that comes apart badly hands the monster the moment: the limb that
  // reached in pays for reaching in. "Badly" is measured against the odds that
  // were taken, not against a flat number, so a 90% hold is only reversed on a
  // genuinely awful roll while a desperate one is reversed about half the times
  // it fails. A flat threshold made reversals impossible for every hold with
  // good odds, since the miss band there is narrower than the threshold.
  function wrestleReversal(session, chance, roll) {
    const actor = session.actor, enemy = session.enemy;
    if (roll < chance + (100 - chance) * 0.5) return;
    if (!actor.isActor || !actor.isActor()) return;
    const part = session.myPartData();
    const hurt = Math.max(1, Math.round(enemy.atk * 0.5));
    actor.gainHp(-hurt);
    if (window.HealthCore && window.HealthCore.injureBodyPart && actor._bodyParts) {
      window.HealthCore.injureBodyPart(actor, session.myKey, Math.round(hurt * 0.6));
    }
    actor.startDamagePopup();
    _playWrestleSe(_WRESTLE_SE.reversal);
    wrestleLog(T('HealthMonsters.wrestle.log.reversal', {
      actor: actor.name(), enemy: enemy.name(), part: part ? part.name : "",
    }));
  }

  const _GA_apply_WR = Game_Action.prototype.apply;
  Game_Action.prototype.apply = function (target) {
    const plan = this._wrestlePlan;
    if (!plan || !isWrestleAction(this) || !target || !target.isEnemy || !target.isEnemy()) {
      _GA_apply_WR.call(this, target);
      return;
    }

    const subject = this.subject();
    if (!target._bodyParts) initializeEnemyBodyParts(target);

    // A plan is made a turn before it lands and limbs go missing in between, so
    // it re-anchors onto a part that is still there rather than dropping the turn.
    const session = wrestleSession(subject, target);
    if (wrestlePartUsable((subject._bodyParts || {})[plan.myPart])) session.myKey = plan.myPart;
    if (wrestlePartUsable(target._bodyParts[plan.theirPart])) session.theirKey = plan.theirPart;
    this._wrestlePlan = null;

    if (!session.myKey || !session.theirKey) {
      _playWrestleSe(_WRESTLE_SE.noLimb);
      this._wrestleForceMiss = true;
      _GA_apply_WR.call(this, target);
      this._wrestleForceMiss = false;
      wrestleLog(T('HealthMonsters.wrestle.log.noLimb', { actor: subject.name() }));
      return;
    }

    if (plan.skillId) this._applyWrestleFinisher(target, session, plan.skillId);
    else this._applyWrestleHold(target, session, plan.holdId);
  };

  Game_Action.prototype._applyWrestleHold = function (target, session, holdId) {
    const subject = this.subject();
    const partName = session.theirPartData().name;
    const hold = wrestleHoldById(holdId) || WRESTLE_HOLDS[0];
    const chance = wrestleChance(session, hold);
    const roll = Math.random() * 100;

    if (roll >= chance) {
      this._wrestleForceMiss = true;
      _GA_apply_WR.call(this, target);
      this._wrestleForceMiss = false;
      wrestleLog(T('HealthMonsters.wrestle.hold.' + hold.id + '.miss', {
        actor: subject.name(), enemy: target.name(), part: partName,
      }));
      _playWrestleSe(_WRESTLE_SE.holdMiss);
      wrestleReversal(session, chance, roll);
      return;
    }

    _wrestleForcedPart = session.theirKey;
    _wrestleForcedEnemy = target;
    this._wrestleDamage = wrestleDamage(session, hold);
    try {
      _GA_apply_WR.call(this, target);
    } finally {
      this._wrestleDamage = null;
      _wrestleForcedPart = null;
      _wrestleForcedEnemy = null;
    }

    wrestleLog(T('HealthMonsters.wrestle.hold.' + hold.id + '.hit', {
      actor: subject.name(), enemy: target.name(), part: partName,
    }));
    _playWrestleSe(_WRESTLE_SE.holdHit);

    // The state a hold IS lands with it: a grapple that worked is a grapple,
    // and rolling a second time for it would make the row's odds a lie. Only
    // the side effects a hold might also cause are left to training.
    const stateRate = wrestleStateRate(session.actor);
    for (const entry of (hold.states || [])) {
      if (entry.targetFamily && entry.targetFamily.indexOf(session.theirFamily()) < 0) continue;
      const odds = entry.rate >= 1 ? 1 : entry.rate * stateRate;
      if (Math.random() < odds) target.addState(entry.id);
    }

    // A map hold ends with the body somewhere else: thrown down the line the
    // grapple was taken along, shoved a square back, or picked up and driven
    // into the ground behind the wrestler.
    if (hold.map) {
      const MBM = mapBattle();
      if (MBM && MBM.displaceGrappled) MBM.displaceGrappled(subject, target, hold);
    }

    // Tearing a limb away is the same wound taken to its end. Whether the body
    // can actually spare it is the limb table's call, not this one's: a vital
    // part still refuses to come off while the monster has fight left in it.
    if (hold.rip) {
      const part = target._bodyParts[session.theirKey];
      if (part && !part.destroyed && part.currentHp > 0) {
        applyDamageToBodyPart(target, session.theirKey, part.currentHp, true);
      }
      const after = target._bodyParts[session.theirKey];
      _playWrestleSe(_WRESTLE_SE.rip);
      wrestleLog(!after || after.destroyed
        ? T('HealthMonsters.wrestle.log.ripped',
            { actor: subject.name(), enemy: target.name(), part: partName })
        : T('HealthMonsters.wrestle.log.ripHeld', { enemy: target.name(), part: partName }));
    }
  };

  Game_Action.prototype._applyWrestleFinisher = function (target, session, skillId) {
    const subject = this.subject();
    const skill = $dataSkills[skillId];
    if (!skill) { this._applyWrestleHold(target, session, "strike"); return; }
    const partName = session.theirPartData().name;
    const entry = (wrestleFinisherPool() || []).find(e => e.id === skillId);
    const chance = entry ? wrestleFinisherChance(session, entry) : 50;
    const roll = Math.random() * 100;

    if (roll >= chance) {
      this._wrestleForceMiss = true;
      _GA_apply_WR.call(this, target);
      this._wrestleForceMiss = false;
      wrestleLog(T('HealthMonsters.wrestle.log.finisherMiss', {
        actor: subject.name(), skill: skill.name, enemy: target.name(),
      }));
      _playWrestleSe(_WRESTLE_SE.holdMiss);
      wrestleReversal(session, chance, roll);
      return;
    }

    wrestleLog(T('HealthMonsters.wrestle.log.finisherHit', {
      actor: subject.name(), skill: skill.name, part: partName,
    }));
    _playWrestleSe(_WRESTLE_SE.finisherHit);

    // The move runs as itself: its own formula, its own effects, on the limb the
    // hold was on, paid for by the grapple instead of by its usual cost.
    _wrestleForcedPart = session.theirKey;
    _wrestleForcedEnemy = target;
    const finisher = new Game_Action(subject);
    finisher.setSkill(skillId);
    finisher._wrestleForceHit = true;
    try {
      finisher.apply(target);
    } finally {
      _wrestleForcedPart = null;
      _wrestleForcedEnemy = null;
    }

    // A landed finisher ends the hold it was set up from: both fighters are
    // back on their feet, one of them worse off.
    target.removeState(51);
    target.removeState(52);
    if (Math.random() < wrestleStateRate(session.actor) * 0.6) target.addState(54);
    if (entry && subject.gainSpecializationExp) subject.gainSpecializationExp(entry.spec.id, 1);
  };


  // ===========================================================================
  // Aim: naming the limb a weapon goes through
  // ===========================================================================
  // Aim is Wrestle's opposite number, and Attack's. A plain swing lands wherever
  // the blow happens to land (getRandomHitLocation, above), spread across the
  // body by the archetype's own weights. Aiming names the part beforehand and
  // stakes the whole swing on reaching it: the hit-location roll is replaced by
  // one roll against that one part, and a swing that fails it hits NOTHING - not
  // the arm it went past, not the body behind it. What that buys is the organ a
  // random blow almost never finds; what it costs is every blow that misses.
  //
  // The choice is free and is not a turn of its own: the part is named and the
  // swing is thrown in the same round. The aim then belongs to the party MEMBER
  // rather than to the party - each one carries their own monster and their own
  // limb, and keeps it from round to round until the part comes off (the aim
  // slides to the weakest part still attached) or the monster goes down (the aim
  // is dropped).
  //
  // The menu is drawn the way the grapple plan is: as the actor's command list,
  // by BattleSystemEnhanchedCommands, which calls in through window.Aiming.

  const AIM_PAGE_ROWS = 8;

  // Every part still worth putting a weapon through. Organs are IN, unlike the
  // wrestling list: reaching one is exactly what aiming is for.
  function aimTargetParts(enemy) {
    const out = [];
    if (!enemy || !enemy._bodyParts) return out;
    for (const key in enemy._bodyParts) {
      const part = enemy._bodyParts[key];
      if (!part || part.destroyed) continue;
      out.push({ key: key, part: part });
    }
    return out;
  }

  // Where an aim goes when the part it was on comes off: the weakest thing still
  // attached, since that is the next one to give.
  function aimWeakestPart(enemy) {
    let best = null;
    for (const entry of aimTargetParts(enemy)) {
      if (!best || entry.part.currentHp < best.part.currentHp) best = entry;
    }
    return best ? best.key : null;
  }

  // Naming the whole body instead of one place on it. The plan still points at
  // ONE monster (that is what an aim is), but the blow lands wherever the
  // ordinary weights send it, so nothing is spent on reaching a limb.
  const AIM_WHOLE = "*"; // i18n-ignore: sentinel key, never shown

  // The aim rides on the actor and points at a TROOP SLOT rather than at a
  // battler object, so it survives everything that rebuilds the troop.
  function aimPlanOf(actor) {
    return (actor && actor._aimPlan) || null;
  }

  function aimIndexOf(enemy) {
    if (!enemy || !$gameTroop || !$gameTroop.members) return -1;
    return $gameTroop.members().indexOf(enemy);
  }

  function aimLivingEnemy(plan) {
    if (!plan || !$gameTroop) return null;
    const enemy = $gameTroop.members()[plan.enemyIndex];
    return enemy && enemy.isAlive && enemy.isAlive() ? enemy : null;
  }

  function aimLog(text) {
    const log = BattleManager._logWindow;
    if (log && typeof log.push === "function") {
      log.push("addText", text);
      log.push("wait");
    }
  }

  // Which limb is lit on which monster. The 3D battler reads this off the
  // battler itself (3DBattlerSystem.js, updateAimHighlight) and paints that part
  // yellow, so a plan is read off the monster rather than off the menu. Only one
  // limb is ever lit: the one the actor now inputting is looking at.
  function aimSetHighlight(enemy, partKey) {
    if (!$gameTroop) return;
    for (const member of $gameTroop.members()) {
      if (!member) continue;
      const key = (member === enemy && partKey) ? partKey : null;
      if (member._aimHighlightPart !== key) member._aimHighlightPart = key;
    }
  }

  // What the menu shows and the only thing its rows read, rebuilt each time it
  // opens so a limb lost in between is simply gone from the list.
  function aimSession(actor, enemy) {
    const plan = aimPlanOf(actor);
    const session = {
      actor: actor,
      enemy: enemy,
      offset: 0,
      parts: aimTargetParts(enemy),
      key: null,
    };
    if (plan && $gameTroop.members()[plan.enemyIndex] === enemy &&
        (plan.partKey === AIM_WHOLE || session.parts.some(entry => entry.key === plan.partKey))) {
      session.key = plan.partKey;
    }
    return session;
  }

  function aimCondition(part) {
    return Math.round(100 * (part && part.maxHp > 0 ? part.currentHp / part.maxHp : 1));
  }

  const Aiming = {
    isMenuOpen(win) {
      return !!(win && win._aimSession);
    },

    // Whether the Aim row in the battle command menu is live for this body.
    // Nothing about the actor gates it - a blind swing can be aimed as well as a
    // careful one - only whether there is a monster standing with a body the
    // health system knows how to read. The menu is drawn in Scene_Battle's own
    // command window, so a tactical map fight has no room for it.
    canCommand(actor) {
      if (!actor || !actor.isActor || !actor.isActor()) return false;
      if (!$gameParty.inBattle()) return false;
      // On the map, naming a body is always open: it reaches every monster in
      // sight, in the fight or not, and the one picked is dragged into it.
      if (mapBattle()) return true;
      return this.candidates().length > 0;
    },

    // The monsters an aim can be taken on: standing, and with an anatomy.
    candidates() {
      if (!$gameTroop) return [];
      return $gameTroop.aliveMembers().filter(enemy => {
        if (!enemy) return false;
        if (!enemy._bodyParts) initializeEnemyBodyParts(enemy);
        return aimTargetParts(enemy).length > 0;
      });
    },

    // This actor's aim as something usable RIGHT NOW: the monster resolved and
    // still standing, the part resolved and still attached. A plan that has run
    // out of either is repaired here (or dropped), so every caller sees one
    // answer and nobody has to re-check.
    planFor(actor) {
      const plan = aimPlanOf(actor);
      if (!plan) return null;
      const enemy = aimLivingEnemy(plan);
      if (!enemy) { this.clear(actor); return null; }
      if (!enemy._bodyParts) initializeEnemyBodyParts(enemy);
      if (plan.partKey === AIM_WHOLE) {
        return {
          enemy: enemy, enemyIndex: plan.enemyIndex, partKey: AIM_WHOLE, whole: true,
          part: { name: T('HealthMonsters.aim.menu.wholeName') },
        };
      }
      let part = enemy._bodyParts[plan.partKey];
      if (!part || part.destroyed) {
        const key = aimWeakestPart(enemy);
        if (!key) { this.clear(actor); return null; }
        plan.partKey = key;
        part = enemy._bodyParts[key];
      }
      return { enemy: enemy, enemyIndex: plan.enemyIndex, partKey: plan.partKey, part: part };
    },

    // The name the Aim command wears once a limb is under it, so the row reads
    // "Aim: Left Arm" and the plan is legible without opening anything.
    partName(actor) {
      const plan = this.planFor(actor);
      return plan ? plan.part.name : null;
    },

    // The odds of the named blow reaching the named place, which is what the
    // rows show and what the swing is rolled against. One function, so the
    // number on the row is the number that is rolled.
    chance(actor, enemy, partKey) {
      if (!enemy || !enemy._bodyParts) return 0;
      return Math.round(calculateHitChance(enemy, partKey, actor));
    },

    set(actor, enemy, partKey) {
      const index = aimIndexOf(enemy);
      if (!actor || index < 0) return;
      actor._aimPlan = { enemyIndex: index, partKey: partKey };
    },

    clear(actor) {
      if (actor) actor._aimPlan = null;
    },

    // A monster that goes down takes every aim on it with it: there is nothing
    // left to name a part of.
    clearForEnemy(enemy) {
      if (!enemy || !$gameParty || !$gameTroop) return;
      const index = aimIndexOf(enemy);
      if (index < 0) return;
      for (const actor of $gameParty.battleMembers()) {
        const plan = aimPlanOf(actor);
        if (plan && plan.enemyIndex === index) this.clear(actor);
      }
      enemy._aimHighlightPart = null;
    },

    clearAll() {
      if ($gameParty && $gameParty.members) {
        for (const actor of $gameParty.members()) this.clear(actor);
      }
      if ($gameTroop && $gameTroop.members) {
        for (const enemy of $gameTroop.members()) { if (enemy) enemy._aimHighlightPart = null; }
      }
    },

    // A limb that comes off does not end an aim: it slides to the weakest part
    // still on the body, so the next swing is already pointed somewhere and the
    // player is not sent back into the menu every time a limb gives.
    reanchor(enemy) {
      if (!enemy || !enemy._bodyParts || !$gameParty || !$gameTroop) return;
      const index = aimIndexOf(enemy);
      if (index < 0) return;
      for (const actor of $gameParty.battleMembers()) {
        const plan = aimPlanOf(actor);
        if (!plan || plan.enemyIndex !== index) continue;
        if (plan.partKey === AIM_WHOLE) continue;
        const part = enemy._bodyParts[plan.partKey];
        if (part && !part.destroyed) continue;
        const key = (enemy.isAlive && enemy.isAlive()) ? aimWeakestPart(enemy) : null;
        if (!key) { this.clear(actor); continue; }
        plan.partKey = key;
        aimLog(T('HealthMonsters.aim.log.moved', {
          actor: actor.name(), enemy: enemy.name(), part: enemy._bodyParts[key].name,
        }));
      }
    },

    // Light the part the actor now inputting has named, on the monster they
    // named it on, and nothing anywhere else.
    refreshHighlight(actor) {
      const plan = actor ? this.planFor(actor) : null;
      aimSetHighlight(plan && !plan.whole ? plan.enemy : null,
                      plan && !plan.whole ? plan.partKey : null);
    },

    // The Aim command was chosen. Unlike Wrestle this rides on no skill and
    // touches no action: naming a limb is not the turn, so the monster is picked
    // here and the command window is handed straight back afterwards. Returns
    // false when there is nothing standing to aim at.
    startFromCommand(scene) {
      const actor = BattleManager.actor();
      if (!scene || !actor || !this.canCommand(actor)) return false;
      const MBM = mapBattle();
      if (MBM) return MBM.startAimSelection();
      // One monster standing is no choice at all: open straight on its body.
      // Counted off the whole troop rather than off the candidates, so a field
      // holding something with no anatomy still asks which one is meant.
      const alive = $gameTroop.aliveMembers();
      if (alive.length === 1) return scene.openAimMenu(alive[0]);
      scene._aimSelecting = true;
      scene.startEnemySelection();
      return true;
    },

    // Stands in for Window_ActorCommand.makeCommandList while a limb is being
    // named. Rows carry their label in `name`, which that window falls back to
    // for symbols it does not know.
    makeCommandList(win) {
      const session = win._aimSession;
      const push = (name, ext, enabled, icon) =>
        win.addCommandWithIcon(name, "aimRow", enabled !== false, ext, icon, enabled === false);

      if (session.parts.length === 0) {
        push(T('HealthMonsters.aim.menu.noParts'), { kind: "blocked" }, false, 96);
        push(T('HealthMonsters.aim.menu.back'), { kind: "back" }, true, 140);
        return;
      }

      // A body can run past what the command window has room for (it is
      // bottom-pinned and grows upward), so a long one turns a page at a time
      // rather than off the top of the screen - the same shelf the grapple plan
      // pages its limbs with.
      const shown = session.parts.slice(session.offset, session.offset + AIM_PAGE_ROWS);
      for (const entry of shown) {
        const key = entry.key === session.key ? "partRowCurrent" : "partRow";
        push(T('HealthMonsters.aim.menu.' + key, {
               part: entry.part.name,
               percent: aimCondition(entry.part),
               chance: this.chance(session.actor, session.enemy, entry.key),
             }), { kind: "part", key: entry.key }, true,
             // A vital part wears the heart: it is the one worth naming and the
             // one the odds on the row are punishing.
             entry.part.vital ? 84 : 96);
      }
      if (session.parts.length > AIM_PAGE_ROWS) {
        push(T('HealthMonsters.aim.menu.more', { count: session.parts.length }),
             { kind: "more", total: session.parts.length }, true, 4);
      }
      // The whole body: still one named monster, but the blow spreads over it
      // the way an unaimed one does, so nothing is risked on reaching a limb.
      push(T('HealthMonsters.aim.menu.' + (session.key === AIM_WHOLE ? 'wholeRowCurrent' : 'wholeRow')),
           { kind: "part", key: AIM_WHOLE }, true, 96);
      push(T('HealthMonsters.aim.menu.clear'), { kind: "clear" }, !!session.key, 140);
      push(T('HealthMonsters.aim.menu.back'), { kind: "back" }, true, 140);
    },
  };
  window.Aiming = Aiming;

  // ---------------------------------------------------------------------------
  // Scene wiring
  // ---------------------------------------------------------------------------

  Scene_Battle.prototype.openAimMenu = function (enemy) {
    const actor = BattleManager.actor();
    const win = this._actorCommandWindow;
    if (!actor || !enemy || !win) return false;
    if (!enemy._bodyParts) initializeEnemyBodyParts(enemy);
    const session = aimSession(actor, enemy);
    if (session.parts.length === 0) {
      SoundManager.playBuzzer();
      return false;
    }
    if (this._skillWindow) { this._skillWindow.deactivate(); this._skillWindow.hide(); }
    if (this._itemWindow) { this._itemWindow.deactivate(); this._itemWindow.hide(); }
    if (this._actorWindow) { this._actorWindow.deactivate(); this._actorWindow.hide(); }
    if (this._enemyWindow) { this._enemyWindow.deactivate(); this._enemyWindow.hide(); }

    // The command window's own handlers are put aside whole and given back on
    // the way out, exactly as the grapple plan does it.
    win._aimSession = session;
    win._aimSavedHandlers = win._handlers;
    win._handlers = {};
    win.setHandler("aimRow", this.onAimRow.bind(this));
    win.setHandler("cancel", this.onAimCancel.bind(this));
    win.show();
    win.refresh();
    // Open on the limb already named, so stepping back in reads as one plan.
    const list = win._list || [];
    const at = session.key
      ? list.findIndex(row => row.ext && row.ext.kind === "part" && row.ext.key === session.key)
      : -1;
    win.select(at >= 0 ? at : 0);
    win.activate();
    return true;
  };

  Scene_Battle.prototype.closeAimMenu = function () {
    const win = this._actorCommandWindow;
    if (!win || !win._aimSession) return;
    win._aimSession = null;
    if (win._aimSavedHandlers) win._handlers = win._aimSavedHandlers;
    win._aimSavedHandlers = null;
    // Back to whatever the actor's own plan says should be lit.
    Aiming.refreshHighlight(BattleManager.actor());
  };

  // Hand the command window back with the cursor on a row of the actor's own
  // list rather than wherever the part list left it.
  Scene_Battle.prototype._leaveAimMenu = function (symbol) {
    const win = this._actorCommandWindow;
    this.closeAimMenu();
    win.show();
    win.refresh();
    win.selectSymbol(symbol);
    win.activate();
  };

  Scene_Battle.prototype.onAimRow = function () {
    const win = this._actorCommandWindow;
    const session = win && win._aimSession;
    const ext = win ? win.currentExt() : null;
    if (!session || !ext) return;

    switch (ext.kind) {
      case "part":
        Aiming.set(session.actor, session.enemy, ext.key);
        // Naming a limb costs nothing and ends no turn: the swing it was named
        // for is thrown in this same round, so the cursor lands on Attack.
        this._leaveAimMenu("attack");
        return;
      case "clear":
        Aiming.clear(session.actor);
        this._leaveAimMenu("aim");
        return;
      case "more":
        session.offset += AIM_PAGE_ROWS;
        if (session.offset >= ext.total) session.offset = 0;
        win.refresh();
        win.select(0);
        win.activate();
        return;
      case "back":
        this._leaveAimMenu("aim");
        return;
      default:
        SoundManager.playBuzzer();
        win.activate();
    }
  };

  Scene_Battle.prototype.onAimCancel = function () {
    if (!this._actorCommandWindow || !this._actorCommandWindow._aimSession) return;
    // Aim is only ever opened from the Aim row, so backing out lands on it.
    this._leaveAimMenu("aim");
  };

  // Picking the monster is picking the body. Aim borrows the ordinary target
  // window for that, and takes it back off the scene the moment the choice is
  // made: `_aimSelecting` is the only thing that says whose choice it was.
  const _SB_onEnemyOk_AIM = Scene_Battle.prototype.onEnemyOk;
  Scene_Battle.prototype.onEnemyOk = function () {
    if (this._aimSelecting) {
      this._aimSelecting = false;
      const enemy = this._enemyWindow ? this._enemyWindow.enemy() : null;
      if (this._enemyWindow) { this._enemyWindow.hide(); this._enemyWindow.deactivate(); }
      if (enemy && this.openAimMenu(enemy)) return;
      SoundManager.playBuzzer();
      this._actorCommandWindow.show();
      this._actorCommandWindow.refresh();
      this._actorCommandWindow.activate();
      return;
    }
    _SB_onEnemyOk_AIM.call(this);
  };

  const _SB_onEnemyCancel_AIM = Scene_Battle.prototype.onEnemyCancel;
  Scene_Battle.prototype.onEnemyCancel = function () {
    if (this._aimSelecting) {
      // The caller (BattleSystemEnhanchedCommands) hides the target window and
      // gives the command list back; there is nothing of ours left to undo.
      this._aimSelecting = false;
      return;
    }
    _SB_onEnemyCancel_AIM.call(this);
  };

  // A part list left standing when input moves on would leave the command window
  // holding rows that are no longer about anything.
  const _SB_startActorCommandSelection_AIM = Scene_Battle.prototype.startActorCommandSelection;
  Scene_Battle.prototype.startActorCommandSelection = function () {
    this.closeAimMenu();
    this._aimSelecting = false;
    _SB_startActorCommandSelection_AIM.call(this);
    // Whoever is inputting now, their aim is the one lit on the field.
    Aiming.refreshHighlight(BattleManager.actor());
  };

  const _SB_endCommandSelection_AIM = Scene_Battle.prototype.endCommandSelection;
  Scene_Battle.prototype.endCommandSelection = function () {
    this.closeAimMenu();
    this._aimSelecting = false;
    _SB_endCommandSelection_AIM.call(this);
    // The highlight is an input-time affordance: while the round plays out the
    // model belongs to the hit flashes.
    aimSetHighlight(null, null);
  };

  // Every cursor move in the command window can move the light on the monster:
  // while a limb is being named (Aim) or a hold planned (Wrestle), the part
  // under the cursor is the one lit, and the moment the cursor leaves the limb
  // rows it falls back to the part the plan has settled on.
  const _WAC_select_AIM = Window_ActorCommand.prototype.select;
  Window_ActorCommand.prototype.select = function (index) {
    _WAC_select_AIM.call(this, index);
    const aim = this._aimSession;
    const grapple = this._wrestleSession;
    if (!aim && !grapple) return;
    const ext = this.currentExt();
    if (aim) {
      aimSetHighlight(aim.enemy, (ext && ext.kind === "part") ? ext.key : aim.key);
    } else {
      const hovered = (ext && ext.kind === "limb" && ext.side === "theirs") ? ext.key : null;
      aimSetHighlight(grapple.enemy, hovered || grapple.theirKey);
    }
  };

  // The grapple plan lights the limb it is being taken on for as long as it is
  // open, and gives the field back to the actor's own aim when it closes.
  const _SB_closeWrestleMenu_AIM = Scene_Battle.prototype.closeWrestleMenu;
  Scene_Battle.prototype.closeWrestleMenu = function () {
    const had = !!(this._actorCommandWindow && this._actorCommandWindow._wrestleSession);
    _SB_closeWrestleMenu_AIM.call(this);
    if (had) Aiming.refreshHighlight(BattleManager.actor());
  };

  // ---------------------------------------------------------------------------
  // Resolving an aimed swing
  // ---------------------------------------------------------------------------

  // The limb an aimed blow is forced onto once its roll has been made, so the
  // hit-location table does not roll a second time for the same swing.
  let _aimForcedPart = null;
  let _aimForcedEnemy = null;

  const _getRandomHitLocation_AIM = getRandomHitLocation;
  getRandomHitLocation = function (enemy) {
    if (_aimForcedPart && _aimForcedEnemy === enemy && enemy._bodyParts &&
        enemy._bodyParts[_aimForcedPart] && !enemy._bodyParts[_aimForcedPart].destroyed) {
      return { key: _aimForcedPart, targeted: true };
    }
    return _getRandomHitLocation_AIM.call(this, enemy);
  };

  const _GA_itemHit_AIM = Game_Action.prototype.itemHit;
  Game_Action.prototype.itemHit = function (target) {
    if (this._aimForceMiss) return 0;
    return _GA_itemHit_AIM.call(this, target);
  };

  // Only the weapon swing is aimed. A spell, a thrown bottle or a planned hold
  // goes where its own rules send it, and would be a second aim on top of the
  // one it already has.
  function isAimedAttack(action) {
    return !!(action && action.isAttack && action.isAttack());
  }

  const _GA_apply_AIM = Game_Action.prototype.apply;
  Game_Action.prototype.apply = function (target) {
    const subject = this.subject();
    const plan = (isAimedAttack(this) && subject && subject.isActor && subject.isActor() &&
                  target && target.isEnemy && target.isEnemy())
      ? Aiming.planFor(subject) : null;
    // An aim is about ONE monster: a swing that landed on any other one is an
    // ordinary swing, spread over that body by the usual weights.
    if (!plan || plan.enemy !== target || plan.whole) {
      _GA_apply_AIM.call(this, target);
      return;
    }

    if (Math.random() * 100 >= Aiming.chance(subject, target, plan.partKey)) {
      // The whole swing was spent on reaching one place and did not reach it.
      // Nothing is struck on the way past: that is the price of naming a part.
      this._aimForceMiss = true;
      try {
        _GA_apply_AIM.call(this, target);
      } finally {
        this._aimForceMiss = false;
      }
      aimLog(T('HealthMonsters.aim.log.missed', {
        actor: subject.name(), enemy: target.name(), part: plan.part.name,
      }));
      return;
    }

    _aimForcedPart = plan.partKey;
    _aimForcedEnemy = target;
    try {
      _GA_apply_AIM.call(this, target);
    } finally {
      _aimForcedPart = null;
      _aimForcedEnemy = null;
    }
  };

  // The engine picks a random monster for every plain attack (see
  // BattleManager.selectNextCommand in rmmz_managers.js). An aimed swing goes to
  // the body it was named on instead, whichever way the command was reached.
  const _BM_selectNextCommand_AIM = BattleManager.selectNextCommand;
  BattleManager.selectNextCommand = function () {
    const actor = this._currentActor;
    const action = (actor && actor.inputtingAction) ? actor.inputtingAction() : null;
    const plan = (action && isAimedAttack(action)) ? Aiming.planFor(actor) : null;
    _BM_selectNextCommand_AIM.call(this);
    if (plan && action) action.setTarget(plan.enemyIndex);
  };

  // A limb coming off is where an aim moves; this is the one road every kind of
  // limb damage takes, so it is the only place that has to know.
  const _applyDamageToBodyPart_AIM = applyDamageToBodyPart;
  applyDamageToBodyPart = function (enemy, partKey, damage, isTargeted) {
    const result = _applyDamageToBodyPart_AIM.apply(this, arguments);
    Aiming.reanchor(enemy);
    return result;
  };

  const _GE_die_AIM = Game_Enemy.prototype.die;
  Game_Enemy.prototype.die = function () {
    _GE_die_AIM.call(this);
    Aiming.clearForEnemy(this);
  };

  // An aim belongs to one fight: the monster it names is a slot in THIS troop.
  const _BM_setup_AIM = BattleManager.setup;
  BattleManager.setup = function (troopId, canEscape, canLose) {
    _BM_setup_AIM.call(this, troopId, canEscape, canLose);
    Aiming.clearAll();
  };

  const _BM_endBattle_AIM = BattleManager.endBattle;
  BattleManager.endBattle = function (result) {
    Aiming.clearAll();
    _BM_endBattle_AIM.call(this, result);
  };

})();