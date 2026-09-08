/*:
 * @target MZ
 * @plugindesc Starting equipment and weapon management system for character creation
 * @author Omni-Lex
 * @orderAfter CharacterCreationShared
 * @orderBefore CharacterPresets
 * @orderBefore CharacterCreation
 *
 * @help
 * This plugin manages starting equipment for characters:
 * - Starter weapon pool per weapon type, derived from shop price (used to
 *   fill spare slots and for the battle-test randomizer, not the class's own
 *   starting loadout)
 * - Weapon type icon mapping
 * - Compatible weapon detection for classes
 * - Fixed thematic weapon(s), armor and items per class, read off that
 *   class's own Classes.json note tags
 * - Global starter skills
 *
 * A class's starting weapon(s), armor and items are hardcoded per class in
 * its Classes.json note (<StartWeapon:>, <StartArmor:>, <StartItems:>), not
 * rolled at creation time: every character of the same class walks out with
 * the same peculiar, low-power kit. <StartWeapon:> lists one id, or two for a
 * class with the DualWield trait (both get equipped, one per hand). A class
 * with no tags falls back to the old random-from-cheap-pool behaviour, which
 * is why that pool is still built and kept around below.
 *
 * Dependencies:
 * - CharacterCreationShared.js
 *
 * Functions exported to global namespace:
 * - window.StartingEquipment.equipRandomCompatibleWeapon(actor, classId)
 * - window.StartingEquipment.equipClassStartingArmor(actor, classId)
 * - window.StartingEquipment.getClassStartWeapons(classId)
 * - window.StartingEquipment.getClassStartArmors(classId)
 * - window.StartingEquipment.getCompatibleWeapons(compatibleTypes)
 * - window.StartingEquipment.getCompatibleWeaponTypes(classId)
 * - window.StartingEquipment.getStarterWeaponPool()
 * - window.StartingEquipment.auditClassStartingItems()
 * - window.StartingEquipment.GLOBAL_STARTER_SKILLS
 * - window.StartingEquipment.weaponTypeIcons
 */

(() => {
  const pluginName = "StartingEquipment";

  //=============================================================================
  // Constants - Global Starter Skills
  //=============================================================================

  // Skills that all characters learn on creation
  const GLOBAL_STARTER_SKILLS = [2, 836, 837, 838, 839, 847];

  //=============================================================================
  // Constants - Weapon Type Icons
  //=============================================================================

  const weaponTypeIcons = {
    1: 96,   // Dagger / Light
    2: 97,   // Sword
    3: 98,   // Flail / Heavy
    4: 99,   // Axe
    5: 100,  // Whip
    6: 101,  // Staff
    7: 102,  // Bow
    8: 114,  // Crossbow / Projectile
    9: 104,  // Gun
    10: 105, // Claw
    11: 106, // Glove
    12: 107  // Spear
  };

  //=============================================================================
  // Starter Weapon Pool (derived from price, not from stats)
  //=============================================================================

  // A starting character carries the cheapest junk its class can hold: the pool
  // is the low end of the shop price list for each weapon type, which is also
  // the low end of the level curve, so no stat scoring is involved.
  //
  // This used to be a hardcoded table of weapon ids, and it went stale the
  // moment Weapons.json was re-indexed: the ids no longer pointed at the type
  // they were filed under, and the pool was handing out end-game artifacts
  // (Glove resolved to weapon 31, the level 95 / 112000g Timeflow Manipulator;
  // Spear to the Dragon Daggar and Memory Thief) and, worse, the nameless
  // "<-- Light -->" divider rows. Deriving the pool from the database means it
  // cannot drift out of sync again.
  const STARTER_PRICE_CAP = 2000;  // gold; above this it is not starting gear
  const STARTER_POOL_MAX = 8;      // never offer more than the N cheapest
  const STARTER_POOL_MIN = 3;      // ... but always offer this many if they exist

  let starterPoolCache = null;

  /**
   * Real database entry test: skips the blank padding rows and the
   * "<-- Category -->" dividers that separate weapon/armor type blocks.
   * Works on both $dataWeapons and $dataArmors entries; only the name field
   * is checked.
   * @param {object} entry - $dataWeapons or $dataArmors entry
   * @returns {boolean}
   */
  function isRealEntry(entry) {
    if (!entry || !entry.name) return false;
    const name = entry.name.trim();
    return name.length > 0 && !name.startsWith("<--");
  }

  /**
   * Build the {wtypeId: [weaponId, ...]} starter pool from $dataWeapons.
   * @returns {object}
   */
  function buildStarterWeaponPool() {
    const pool = {};
    if (typeof $dataWeapons === "undefined" || !Array.isArray($dataWeapons)) {
      return pool;
    }

    const byType = {};
    $dataWeapons.forEach((weapon) => {
      if (!isRealEntry(weapon) || !weapon.wtypeId || !(weapon.price > 0)) return;
      (byType[weapon.wtypeId] = byType[weapon.wtypeId] || []).push(weapon);
    });

    Object.keys(byType).forEach((typeId) => {
      const sorted = byType[typeId].sort((a, b) => a.price - b.price);
      const cheap = sorted.filter((w) => w.price <= STARTER_PRICE_CAP);
      // A type with nothing under the cap still has to arm its classes, so fall
      // back to the cheapest few it does have.
      const picked = cheap.length >= STARTER_POOL_MIN ? cheap : sorted.slice(0, STARTER_POOL_MIN);
      pool[typeId] = picked.slice(0, STARTER_POOL_MAX).map((w) => w.id);
    });

    return pool;
  }

  /**
   * Memoized starter pool. Built on first use (the database is not loaded when
   * this plugin's body runs).
   * @returns {object} {wtypeId: [weaponId, ...]}
   */
  function getStarterWeaponPool() {
    if (!starterPoolCache || Object.keys(starterPoolCache).length === 0) {
      starterPoolCache = buildStarterWeaponPool();
    }
    return starterPoolCache;
  }

  //=============================================================================
  // Weapon Functions
  //=============================================================================

  /**
   * Get compatible weapon type IDs for a class
   * @param {number} classId - Class ID
   * @returns {array} Array of weapon type IDs
   */
  function getCompatibleWeaponTypes(classId) {
    const classData = $dataClasses[classId];
    if (!classData) {
      console.warn(`Class with ID ${classId} not found in database`);
      return [];
    }

    // Get the weapon type array from the class data
    // In RPG Maker MZ, this is stored in classData.traits as type code 51 (Weapon Equip)
    const weaponTypes = [];

    if (classData.traits && Array.isArray(classData.traits)) {
      classData.traits.forEach((trait) => {
        // Trait code 51 is weapon equip type
        if (trait.code === 51) {
          weaponTypes.push(trait.dataId);
        }
      });
    }

    return weaponTypes;
  }

  /**
   * Weapon types a class can be armed with at creation. Same as the declared
   * equip types, except that a class declaring none (Archmage, Beast) falls
   * back to every type rather than starting bare-handed: class weapon locks
   * were converted into the Weapons specializations, so any class can hold
   * anything, it is only worse at it.
   * @param {number} classId - Class ID
   * @returns {array} Array of weapon type IDs
   */
  function getStarterWeaponTypes(classId) {
    const declared = getCompatibleWeaponTypes(classId);
    if (declared.length > 0) return declared;
    return Object.keys(getStarterWeaponPool()).map(Number);
  }

  /**
   * Get weapons for compatible types from the limited pool
   * @param {array} compatibleTypes - Array of weapon type IDs (empty means all)
   * @returns {array} Array of weapon objects
   */
  function getCompatibleWeapons(compatibleTypes) {
    const compatibleWeapons = [];
    const pool = getStarterWeaponPool();
    const types =
      compatibleTypes && compatibleTypes.length > 0
        ? compatibleTypes
        : Object.keys(pool).map(Number);

    // For each compatible weapon type, get weapons from the pool
    types.forEach((typeId) => {
      const weaponsOfType = pool[typeId];
      if (weaponsOfType && Array.isArray(weaponsOfType)) {
        // Add valid weapons from this type's pool to the compatible list
        weaponsOfType.forEach((weaponId) => {
          const weapon = $dataWeapons[weaponId];
          if (isRealEntry(weapon)) {
            compatibleWeapons.push(weapon);
          }
        });
      }
    });

    return compatibleWeapons;
  }

  /**
   * Read a comma/space separated list of ids out of a `<Tag: 1, 2>` note tag.
   * @param {string} note - Note field to search
   * @param {string} tag - Tag name (without angle brackets or colon)
   * @returns {array} Array of numbers, empty if the tag is absent
   */
  function parseNoteIdList(note, tag) {
    if (!note) return [];
    const match = note.match(new RegExp(`<${tag}:\\s*([^>]+)>`, 'i'));
    if (!match) return [];
    return match[1]
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));
  }

  /**
   * A class's hardcoded starting weapon(s), from its Classes.json
   * `<StartWeapon: id[, id2]>` note tag. Two ids means the class equips both
   * at once (its DualWield trait gives it the second hand to hold them).
   * @param {number} classId - Class ID
   * @returns {array} Array of $dataWeapons ids (empty if the class has no tag)
   */
  function getClassStartWeapons(classId) {
    const classData = $dataClasses[classId];
    return classData ? parseNoteIdList(classData.note, 'StartWeapon') : [];
  }

  /**
   * A class's hardcoded starting armor pieces, from its Classes.json
   * `<StartArmor: id[, id2, ...]>` note tag.
   * @param {number} classId - Class ID
   * @returns {array} Array of $dataArmors ids (empty if the class has no tag)
   */
  function getClassStartArmors(classId) {
    const classData = $dataClasses[classId];
    return classData ? parseNoteIdList(classData.note, 'StartArmor') : [];
  }

  /**
   * Place an item into whatever equip slot will take it (weapon, off-hand,
   * head, body or gear), the way initEquips does, so a dual-wielder's second
   * weapon and a shield-in-hand both land correctly without hand-coding slot
   * indices here.
   * @param {Game_Actor} actor - Actor to equip
   * @param {object} item - $dataWeapons or $dataArmors entry
   * @returns {boolean} True if it was equipped
   */
  function equipIntoOpenSlot(actor, item) {
    if (!item) return false;
    const slot = window.HandSlots && window.HandSlots.emptySlotFor
      ? window.HandSlots.emptySlotFor(actor, item)
      : actor.emptySlotFor(item);
    if (slot < 0) return false;
    try {
      actor.changeEquip(slot, item);
      return true;
    } catch (e) {
      console.error(`Failed to equip ${item.name}: ${e}`);
      return false;
    }
  }

  /**
   * Arm an actor with the starter weapon(s) of their class.
   *
   * A class's weapon(s) are hardcoded on its own Classes.json entry
   * (`<StartWeapon:>`), so every character of that class starts with the
   * same peculiar, low-power loadout instead of one rolled out of a shared
   * cheap-weapon pool. A class without the tag (the natural-weapon creature
   * classes, or anything not yet authored) falls back to the old pool roll so
   * it still walks out armed. The name is kept for the many callers that
   * already say it.
   *
   * @param {Game_Actor} actor - Actor to equip
   * @param {number} classId - Class ID
   * @returns {boolean} Success status
   */
  function equipRandomCompatibleWeapon(actor, classId) {
    if (!actor || !classId) {
      console.warn('Invalid actor or class ID');
      return false;
    }

    const fixedIds = getClassStartWeapons(classId);
    if (fixedIds.length > 0) {
      const weapons = fixedIds.map((id) => $dataWeapons[id]).filter(isRealEntry);
      if (weapons.length === 0) {
        console.warn(`StartWeapon tag for class ${classId} points at no real weapon.`);
        return false;
      }
      weapons.forEach((weapon) => {
        $gameParty.gainItem(weapon, 1);
        recordClassGrant(actor, 'weapon', 'weapon', weapon.id, 1);
      });
      let equippedAny = false;
      weapons.forEach((weapon) => {
        if (equipIntoOpenSlot(actor, weapon)) equippedAny = true;
      });
      return equippedAny;
    }

    // Fallback: no fixed loadout authored for this class, roll one from the
    // shared cheap-weapon pool the way every class used to.
    const pool = getStarterWeaponPool();
    const compatibleTypes = getStarterWeaponTypes(classId);
    const types = compatibleTypes && compatibleTypes.length > 0
      ? compatibleTypes
      : Object.keys(pool).map(Number);

    // The cheapest starter of each type the class can hold. The pool is already
    // sorted by price, so the first entry of a type is that type's cheapest.
    const starters = [];
    types.forEach((typeId) => {
      const ids = pool[typeId];
      if (!ids || !ids.length) return;
      for (const id of ids) {
        const weapon = $dataWeapons[id];
        if (isRealEntry(weapon)) { starters.push(weapon); return; }
      }
    });

    if (starters.length === 0) {
      console.warn(`No weapons found in pool for compatible types [${types.join(', ')}] for class ${classId}`);
      return false;
    }

    starters.forEach((weapon) => {
      $gameParty.gainItem(weapon, 1);
      recordClassGrant(actor, 'weapon', 'weapon', weapon.id, 1);
    });

    // The one actually held is the cheapest of the set: a starting character
    // walks out carrying their whole kit but wearing the humblest of it.
    const held = starters.slice().sort((a, b) => (a.price || 0) - (b.price || 0))[0];
    try {
      actor.changeEquip(0, held);
      return true;
    } catch (e) {
      console.error(`Failed to equip weapon: ${e}`);
      return false;
    }
  }

  /**
   * Arm an actor with the starter armor pieces of their class, from its
   * `<StartArmor:>` note tag. Classes without the tag get nothing here: the
   * end-of-creation gap-filler (CharacterCreation.js) covers any slot still
   * empty afterwards with a random low-stat piece.
   * @param {Game_Actor} actor - Actor to equip
   * @param {number} classId - Class ID
   * @returns {boolean} True if at least one piece was equipped
   */
  function equipClassStartingArmor(actor, classId) {
    if (!actor || !classId) return false;
    const armors = getClassStartArmors(classId).map((id) => $dataArmors[id]).filter(isRealEntry);
    if (armors.length === 0) return false;
    armors.forEach((armor) => {
      $gameParty.gainItem(armor, 1);
      recordClassGrant(actor, 'armor', 'armor', armor.id, 1);
    });
    let equippedAny = false;
    armors.forEach((armor) => {
      if (equipIntoOpenSlot(actor, armor)) equippedAny = true;
    });
    return equippedAny;
  }

  /**
   * Learn global starter skills for an actor
   * @param {Game_Actor} actor - Actor to teach skills to
   */
  function learnStarterSkills(actor) {
    if (!actor) {
      console.warn('Invalid actor for learning starter skills');
      return;
    }

    GLOBAL_STARTER_SKILLS.forEach((skillId) => {
      if ($dataSkills[skillId]) {
        actor.learnSkill(skillId);
      } else {
        console.warn(`Starter skill ${skillId} not found in database`);
      }
    });
  }

  //=============================================================================
  // Class Starting Items (Items.json only, no weapons/armors)
  //=============================================================================

  // The thematic starting-item loadout, like the starting weapon(s) and
  // armor, is hardcoded per class on its own Classes.json entry, as a
  // `<StartItems: id:qty, id:qty>` note tag, rather than a name-keyed JS
  // table: it cannot go stale if a class is ever renamed, and everything the
  // wizard hands out at class selection now lives in one place.
  //
  // A loadout is judged by PRICE, not by what its items do: the whole kit must
  // stay under CLASS_ITEM_BUDGET (checked by auditClassStartingItems below),
  // which keeps a new character in cheap, mundane gear. Traits are the other
  // half of the starting kit and are deliberately not bound by this: whatever a
  // trait hands out is the trait's business.

  /**
   * Get the thematic starting-item loadout for a class (display + grant use).
   * @param {number} classId - Class ID
   * @returns {array} Array of { id, qty } entries (empty if none defined)
   */
  function getClassStartingItems(classId) {
    const classData = $dataClasses[classId];
    if (!classData) return [];
    const match = classData.note && classData.note.match(/<StartItems:\s*([^>]+)>/i);
    if (!match) return [];
    return match[1]
      .split(',')
      .map((pair) => {
        const [id, qty] = pair.split(':').map((s) => parseInt(s.trim(), 10));
        return isNaN(id) ? null : { id, qty: isNaN(qty) ? 1 : qty };
      })
      .filter(Boolean);
  }

  /**
   * Grant a class's thematic starting items to the party inventory.
   * @param {Game_Actor} actor - Actor whose class was just chosen (unused for
   *   the grant itself, since items go to the shared party inventory, but kept
   *   for a consistent signature with equipRandomCompatibleWeapon)
   * @param {number} classId - Class ID
   */
  function giveClassStartingItems(actor, classId) {
    getClassStartingItems(classId).forEach((entry) => {
      const item = $dataItems[entry.id];
      if (item) {
        $gameParty.gainItem(item, entry.qty);
        recordClassGrant(actor, 'item', 'item', entry.id, entry.qty);
      } else {
        console.warn(`StartingEquipment: class starting item ${entry.id} not found.`);
      }
    });
  }

  /**
   * Total shop value of a class loadout, in gold.
   * @param {number} classId - Class ID
   * @returns {number}
   */
  function getClassStartingItemsValue(classId) {
    return getClassStartingItems(classId).reduce((sum, entry) => {
      const item = $dataItems[entry.id];
      return sum + (item ? (item.price || 0) * (entry.qty || 1) : 0);
    }, 0);
  }

  // Ceiling for a whole class loadout, in gold (100 gold = 1 EUR), i.e. 100 EUR
  // of goods on top of the party's 100 EUR purse. Anything dearer than this is
  // not starting gear, it is treasure.
  const CLASS_ITEM_BUDGET = 10000;

  /**
   * Check every class's <StartItems:> loadout against CLASS_ITEM_BUDGET and
   * report the ones that break it, together with any entry pointing at a
   * missing or blank item. Run from the console after editing a class note.
   * @returns {array} Offending { class, total, items } rows
   */
  function auditClassStartingItems() {
    const offenders = [];
    $dataClasses.forEach((classData) => {
      if (!classData) return;
      const entries = getClassStartingItems(classData.id);
      if (entries.length === 0) return;
      const broken = entries.filter((entry) => {
        const item = $dataItems[entry.id];
        return !item || !item.name || !item.name.trim();
      });
      const total = entries.reduce((sum, entry) => {
        const item = $dataItems[entry.id];
        return sum + (item ? (item.price || 0) * (entry.qty || 1) : 0);
      }, 0);
      if (total > CLASS_ITEM_BUDGET || broken.length > 0) {
        offenders.push({ class: classData.name, total, items: entries });
        console.warn(
          `StartingEquipment: ${classData.name} loadout is ${total}g` +
            (broken.length ? ` and has ${broken.length} missing item(s)` : "") +
            ` (budget ${CLASS_ITEM_BUDGET}g).`
        );
      }
    });
    return offenders;
  }

  /**
   * Apply the full starting kit to an actor: weapon(s), armor, thematic
   * items and starter skills. Used by callers outside the main wizard flow
   * (e.g. split-screen multiplayer) that need the same loadout class
   * selection itself grants.
   * @param {Game_Actor} actor - Actor to equip
   * @param {number} classId - Class ID
   */
  function applyStartingGear(actor, classId) {
    if (!actor || !classId) {
      console.warn('Invalid actor or class ID for starting gear');
      return;
    }

    equipRandomCompatibleWeapon(actor, classId);
    equipClassStartingArmor(actor, classId);
    giveClassStartingItems(actor, classId);
    learnStarterSkills(actor);

    console.log(`Applied starting gear to ${actor.name()} (Class: ${classId})`);
  }

  //=============================================================================
  // Class Grant Ledger
  //=============================================================================
  //
  // An indecisive player used to walk out of creation carrying every class
  // they ever hovered over: each visit to the class step handed out a fresh
  // weapon, armor and item kit and taught a fresh set of class skills, and
  // nothing ever took the last class's deal back. The ledger below writes down
  // what a class handed to an actor, so the next class change can take exactly
  // that back before the new class deals its own. Only creation is touched: a
  // mid-game class change is somebody else's business.

  const CLASS_GRANT_SLOTS = ["weapon", "armor", "item"];

  /** True while one of the character creation scenes is on screen. */
  function isCreationScene() {
    const scene = typeof SceneManager !== "undefined" ? SceneManager._scene : null;
    const name = scene && scene.constructor ? scene.constructor.name : "";
    return /CharacterCreation|CreateCreature|ClassSelect|CharacterPreset/i.test(name);
  }

  function grantEntryData(kind, id) {
    if (kind === "weapon") return $dataWeapons[id];
    if (kind === "armor") return $dataArmors[id];
    return $dataItems[id];
  }

  function classGrantBook(actor) {
    if (!actor._ccClassGrants) actor._ccClassGrants = {};
    return actor._ccClassGrants;
  }

  /**
   * Write down one thing a class just handed over.
   * @param {Game_Actor} actor - Actor the class was chosen for
   * @param {string} slot - "weapon", "armor" or "item"
   * @param {string} kind - Which database the entry lives in
   * @param {number} id - Entry id
   * @param {number} qty - How many were handed over
   */
  function recordClassGrant(actor, slot, kind, id, qty) {
    if (!actor || !isCreationScene()) return;
    const book = classGrantBook(actor);
    if (!book[slot]) book[slot] = [];
    book[slot].push({ kind, id, qty: qty || 1 });
  }

  /**
   * Take back everything a previous class handed to this actor in one slot.
   * A piece still worn is taken off first, so it lands in the bag and can be
   * removed from it like anything else.
   * @param {Game_Actor} actor - Actor to strip
   * @param {string} slot - "weapon", "armor" or "item"
   */
  function revokeClassGrant(actor, slot) {
    if (!actor || !actor._ccClassGrants) return;
    const rows = actor._ccClassGrants[slot];
    if (!rows) return;
    delete actor._ccClassGrants[slot];
    rows.forEach((row) => {
      const data = grantEntryData(row.kind, row.id);
      if (!data) return;
      if (row.kind !== "item") {
        actor.equips().forEach((piece, slotId) => {
          if (piece === data) {
            try { actor.changeEquip(slotId, null); } catch (e) { /* slot refused, leave it worn */ }
          }
        });
      }
      const held = $gameParty.numItems(data);
      if (held > 0) $gameParty.loseItem(data, Math.min(held, row.qty || 1));
    });
  }

  /** Take back every class-dealt piece and kit this actor is holding. */
  function revokeAllClassGrants(actor) {
    CLASS_GRANT_SLOTS.forEach((slot) => revokeClassGrant(actor, slot));
  }

  /**
   * Unlearn the skills the class being left behind taught, keeping anything
   * the class being joined teaches too and the global starter skills every
   * character keeps whatever they end up being.
   * @param {Game_Actor} actor - Actor changing class
   * @param {number} oldClassId - Class being left
   * @param {number} newClassId - Class being joined
   */
  function forgetClassSkills(actor, oldClassId, newClassId) {
    const oldClass = $dataClasses[oldClassId];
    if (!actor || !oldClass) return;
    const newClass = $dataClasses[newClassId];
    const kept = new Set(GLOBAL_STARTER_SKILLS);
    ((newClass && newClass.learnings) || []).forEach((l) => kept.add(l.skillId));
    (oldClass.learnings || []).forEach((learning) => {
      if (kept.has(learning.skillId)) return;
      actor.forgetSkill(learning.skillId);
    });
  }

  // The one hook: every class change during creation, from whichever of the
  // many wizard paths made it, settles the last class's account first.
  const _Game_Actor_changeClass = Game_Actor.prototype.changeClass;
  Game_Actor.prototype.changeClass = function (classId, keepExp) {
    const previous = this._classId;
    _Game_Actor_changeClass.call(this, classId, keepExp);
    if (!previous || !isCreationScene()) return;
    // The same class picked twice is still a second deal, so its kit is taken
    // back too; only the skills are left alone, since nothing changed there.
    if (previous !== classId) forgetClassSkills(this, previous, classId);
    revokeAllClassGrants(this);
  };

  //=============================================================================
  // Exports to Global Namespace
  //=============================================================================

  window.StartingEquipment = {
    // Constants
    GLOBAL_STARTER_SKILLS,
    weaponTypeIcons,
    STARTER_PRICE_CAP,
    CLASS_ITEM_BUDGET,

    // The derived starter pool, kept under its old name for outside readers.
    get weaponsForType() {
      return getStarterWeaponPool();
    },

    // Functions
    getStarterWeaponPool,
    getStarterWeaponTypes,
    getCompatibleWeaponTypes,
    getCompatibleWeapons,
    getClassStartWeapons,
    getClassStartArmors,
    equipRandomCompatibleWeapon,
    equipClassStartingArmor,
    learnStarterSkills,
    applyStartingGear,
    getClassStartingItems,
    getClassStartingItemsValue,
    giveClassStartingItems,
    auditClassStartingItems,

    // Class grant ledger
    recordClassGrant,
    revokeClassGrant,
    revokeAllClassGrants,
    forgetClassSkills
  };

  console.log(`${pluginName} loaded successfully.`);
})();
