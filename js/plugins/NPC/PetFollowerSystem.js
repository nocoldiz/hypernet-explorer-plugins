//=============================================================================
// PetFollowerSystem.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc PetFollowerSystem v1.1.0 - recruit a 4th companion as a pet/follower that trails the party on the map without joining battle.
 * @author Esoteric Heavy Industries
 *
 * @help PetFollowerSystem.js
 *
 * A pet/follower is a companion that walks behind the party on the map but is
 * NOT a party member: it never joins battle, cannot die, and can never be the
 * target of a skill or item (all of which follow naturally from it not being an
 * actor in $gameParty).
 *
 * Cosmetics only: an enemy recruited from one that has the <Talk> tag becomes a
 * "follower"; one without <Talk> becomes a "pet". The distinction only changes
 * the wording in menus and join text, nothing mechanical.
 *
 * Recruiting (see EnemyTalkSystem.js) always routes through the shared API
 * below. Only ONE pet/follower trails the party at a time (the "active" one);
 * recruiting another while one is active simply switches which one follows.
 * Every recruited pet is kept in the registry and can be re-activated or
 * released from the Pets page in the main menu (CustomMainMenuLayout.js).
 *
 * A third kind of record is a CHILD: whatever a party member's pregnancy
 * produces (a baby, a hatchling, a clone, a sprout) is registered here too, so
 * the family walks in the same line as the pets. A child wears the sprite of
 * the party member who bore it and carries a generated name.
 *
 * A pet or a follower can also be TRAINED into a real party member. Which
 * trainings are on offer comes off the creature's archetype roster (the
 * `classes` / `creatureClasses` lists of js/db/Health/Archetypes.json,
 * read through window.CreatureClasses) and off whether the monster it was
 * recruited from carries the <Talk> tag: something that talks is never drilled
 * into one of the creature classes (Beast and everything after it), and an
 * archetype that supports nothing at all falls back to Beast for an animal and
 * to Freelancer for somebody who talks. A child born to the party is family and
 * is never trained; a summon is not the party's to train either.
 *
 * Training is measured in world-clock minutes, and the world clock only moves
 * when the player does: a step walked on the map or an hour waited through.
 * The party's Animal Training (or Leadership, for a follower who talks) takes
 * days off the total. Only the companion actually walking with the party makes
 * progress, so handing the leash to another one stops the drill where it stands.
 *
 * Public API (window.PetSystem):
 *   registerPet(record)  → adds/updates a pet record, does not change active
 *   recruitPet(record)   → registerPet + setActive (used on recruitment)
 *   previewAttrs(sentient, magical, geneticFreak) → the attrs a record with
 *     that trait combination would be given, without registering anything
 *   birthChild(actor, o) → register a newborn from a parent actor
 *   getPets()            → array of pet records
 *   getPet(id)           → one record or null
 *   getChildren()        → the child records only
 *   getActivePet()       → the active (following) record or null
 *   setActivePet(id)     → make a registered pet the active follower
 *   renamePet(id, name)  → give a registered pet a new name
 *   releasePet(id)       → remove a pet from the registry
 *   abandonPet(id)       → file the crime, then remove it (see below)
 *   refreshFollower()    → re-sync the on-map trailing sprite
 *   isRidable(id)        → can this companion be ridden as a mount
 *   getRidablePets()     → every registered companion that can be ridden
 *   canTrain(id)         → is this companion eligible for combat training
 *   trainingOptions(id)  → [classId, ...] the trainings on offer for it
 *   trainingDays(id)     → how many days its training would take right now
 *   trainingInfo(id)     → the live drill record, or null
 *   startTraining(id, classId) / stopTraining(id) / promoteTrainee(id)
 *   hasFreeSlot()        → is there a companion slot open in the party
 *   inductAsMember(record, classId) → straight into the party, no drill first
 *
 * Abandonment is the only way to be rid of a companion, and it is an offence:
 * leaving a pet behind is filed with the nEuroPolice as pet abandonment, and
 * leaving a child behind as the graver charge of child abandonment.
 *
 * Pet record fields: { id, name, characterName, characterIndex, isFollower,
 *   isChild, parentName, bornOn, enemyId, enemyName, level, archetype, note,
 *   skillIds, sentient, magical, geneticFreak, attrs }
 *
 * sentient, magical and geneticFreak are three independent optional traits
 * (any, all or none may be true) set when a companion is taken in. Each
 * leans the flat attrs block registerPet() computes for the record one way:
 * sentient toward Psi, magical toward Intelligence and Wisdom, geneticFreak
 * toward Strength and Constitution. sentient also decides isFollower/_speaks
 * the same way the <Talk> tag always has.
 */

//-----------------------------------------------------------------------------
// Game_PetFollower  (global so JsonEx can reconstruct it from saves)
//
// An extra trailing follower slot that is not backed by a party member. It
// draws the currently active pet's sprite, or nothing when there is no active
// pet. It chases the follower ahead of it via the normal Game_Followers chain.
//-----------------------------------------------------------------------------
function Game_PetFollower() {
    this.initialize(...arguments);
}

Game_PetFollower.prototype = Object.create(Game_Follower.prototype);
Game_PetFollower.prototype.constructor = Game_PetFollower;

Game_PetFollower.prototype.initialize = function (memberIndex) {
    Game_Follower.prototype.initialize.call(this, memberIndex);
};

// Not backed by an actor.
Game_PetFollower.prototype.actor = function () {
    return null;
};

Game_PetFollower.prototype.isVisible = function () {
    const pet = window.PetSystem && window.PetSystem.getActivePet();
    return !!pet && $gamePlayer.followers().isVisible();
};

Game_PetFollower.prototype.refresh = function () {
    const pet = this.isVisible() ? (window.PetSystem && window.PetSystem.getActivePet()) : null;
    const characterName = pet ? pet.characterName : "";
    const characterIndex = pet ? (pet.characterIndex || 0) : 0;
    this.setImage(characterName, characterIndex);
};

window.Game_PetFollower = Game_PetFollower;

(() => {
    "use strict";

    //-------------------------------------------------------------------------
    // Game_Followers - append the pet slot to the trailing follower chain.
    //-------------------------------------------------------------------------

    Game_Followers.prototype.ensurePetFollower = function () {
        if (!this._data) this._data = [];
        if (!this._data.some(f => f instanceof Game_PetFollower)) {
            const pf = new Game_PetFollower(this._data.length);
            // Snap to the player so a slot created mid-map (e.g. loading an old
            // save) doesn't briefly appear at the map corner before it catches up.
            // Skip while $dataMap is null (Game_Followers construction during
            // DataManager.createGameObjects): locate() -> refreshBushDepth()
            // reads $dataMap.width and would crash. The map-setup player locate
            // positions followers anyway in that case.
            if (typeof $dataMap !== "undefined" && $dataMap &&
                typeof $gamePlayer !== "undefined" && $gamePlayer && $gamePlayer.locate) {
                pf.locate($gamePlayer.x, $gamePlayer.y);
            }
            this._data.push(pf);
        }
    };

    const _Game_Followers_setup = Game_Followers.prototype.setup;
    Game_Followers.prototype.setup = function () {
        _Game_Followers_setup.call(this);
        this.ensurePetFollower();
    };

    // The pet slot must be present in _data before the spriteset builds its
    // follower sprites, so old saves (which predate the slot) still get one.
    const _Spriteset_Map_createCharacters = Spriteset_Map.prototype.createCharacters;
    Spriteset_Map.prototype.createCharacters = function () {
        if ($gamePlayer && $gamePlayer.followers()) {
            $gamePlayer.followers().ensurePetFollower();
        }
        _Spriteset_Map_createCharacters.call(this);
    };

    //-------------------------------------------------------------------------
    // window.PetSystem - registry + active-follower management.
    //-------------------------------------------------------------------------

    // Same ceiling the name-entry screen uses for actors, so a
    // pet name can never be longer than a party member's.
    const PET_NAME_MAX_LENGTH = 16;

    function _store() {
        if (!$gameSystem) return null;
        if (!$gameSystem._petRegistry) $gameSystem._petRegistry = [];
        return $gameSystem._petRegistry;
    }

    function _refreshFollower() {
        if ($gamePlayer && $gamePlayer.followers()) {
            $gamePlayer.followers().refresh();
        }
    }

    // The bank a newborn's name is drawn from. Plain given names rather than one
    // of the personality registers the procedural citizens use: a child has no
    // trade yet.
    const CHILD_NAME_DB = "names";  // i18n-ignore  js/db/TextGen/names.json id

    // Unlike a procedural citizen (whose name must come back the same on every
    // visit to its square), a birth happens once, so the name is rolled freely
    // and then kept in the record.
    function _newbornName() {
        if (!window.generateSeededMarkovName) return null;
        const seed = ((Math.random() * 0x7fffffff) >>> 0) ^ (Graphics.frameCount * 2654435761 >>> 0);
        try {
            const gen = window.generateSeededMarkovName(
                seed & 0xffff, (seed >>> 16) & 0xffff, (seed & 0x7fff) || 1,
                CHILD_NAME_DB, 2, 4, 12
            );
            // The generator answers with its own sentinel when the bank is
            // unusable; that is not a name, so the caller falls back.
            if (gen && gen !== "Unknown" && gen !== T('Markov.unknownName')) return gen;  // i18n-ignore: Markov generator sentinel
        } catch (e) {}
        return null;
    }

    // A newborn is its own person and looks like one: the sprite comes from the
    // Skab pixel pack, the same wardrobe every procedural citizen is drawn from
    // (js/db/WorldGen/NPCs.json, npc entries under Skab/). A mitosis clone is
    // the exception and is handed its parent's sprite by the caller.
    // Beta sheets are never dealt here; the pool is asked for fresh each time
    // rather than memoized, since activating another world can still change
    // the rest of the answer (window.SpriteCatalog does the caching).
    function _randomSkabSprite() {
        const skab = (k) => k.indexOf("Skab/") === 0;
        const name = window.SpriteCatalog?.pickNpcKey
            ? window.SpriteCatalog.pickNpcKey(Math.random(), { filter: skab })
            : null;
        if (!name) return null;
        // A "!$" sheet holds one character in a 3x4 grid, so its index is always 0.
        const index = name.includes("!$") ? 0 : Math.floor(Math.random() * 8);
        return { characterName: name, characterIndex: index };
    }

    // The charge an abandonment is filed under, or null when there is none. A
    // follower is a creature that talked its way into the party of its own
    // accord (an enemy with the <Talk> note) and is free to be sent away again,
    // so no law is broken. A pet is a dependent animal and a child is a person:
    // leaving either behind is an offence, the child by far the graver one.
    function _abandonCrimeKey(pet) {
        if (!pet) return null;
        if (pet.isChild) return "abandonChild";  // i18n-ignore  PresetCrimes.json key
        if (pet.isFollower) return null;
        return "abandonPet";                     // i18n-ignore  PresetCrimes.json key
    }

    // ---- Mitosis --------------------------------------------------------
    // A clone is not a child but a second copy of somebody who already exists,
    // so it is named after the original and numbered: "Ada #1", "Ada #2". The
    // number counts every copy the world already holds, whether it is walking
    // in the party or waiting in the followers menu, so no two copies of the
    // same person ever share a name.

    function _copyBaseName(name) {
        return String(name == null ? "" : name).replace(/\s*#\d+\s*$/, "").trim();
    }

    function _nextCopyNumber(baseName) {
        const pattern = new RegExp("^" + baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*#(\\d+)$");
        let highest = 0;
        const consider = (name) => {
            const m = pattern.exec(String(name == null ? "" : name).trim());
            if (m) highest = Math.max(highest, Number(m[1]) || 0);
        };
        if ($gameParty) $gameParty.members().forEach(a => consider(a.name()));
        (_store() || []).forEach(p => consider(p && p.name));
        return highest + 1;
    }

    // Actor 2, then Actor 3. Multiplayer (Switch 67) reserves Actor 3 for the
    // remote guest, exactly as recruiting an NPC does (NPCSystemParty.js), so a
    // clone there can only take Actor 3 when nobody is in it.
    function _freeCompanionSlot() {
        if (!$gameParty || !$gameParty._actors) return 0;
        if ($gameSwitches && $gameSwitches.value(67)) {
            return $gameParty._actors.includes(3) ? 0 : 3;
        }
        if (!$gameParty._actors.includes(2)) return 2;
        if (!$gameParty._actors.includes(3)) return 3;
        return 0;
    }

    // Per-actor slots that hold what used to live in global variables
    // (ActorCharacterFields.js) and the switches/variables the creature and
    // reproduction systems still key by party position.
    const CREATURE_SWITCHES = { 1: 77, 2: 78, 3: 79 };
    const REPRODUCTION_VARS = { 1: 87, 2: 115, 3: 116 };

    function _copyActorInto(actorId, source, name) {
        const clone = $gameActors && $gameActors.actor(actorId);
        if (!clone) return null;
        // Start from the database entry so nothing of a previous occupant of the
        // slot (a companion who left, a guest) survives into the copy.
        clone.setup(actorId);
        clone.setName(name);
        if (source._classId) clone.changeClass(source._classId, false);
        clone.changeLevel(source.level(), false);
        clone.setCharacterImage(source.characterName(), source.characterIndex());
        clone.setFaceImage(source.faceName(), source.faceIndex());
        clone.setBattlerImage(source.battlerName());
        (source._skills || []).forEach(id => clone.learnSkill(id));
        if (clone.setGender && source.gender) clone.setGender(source.gender());
        if (clone.setVnBust && source.vnBust) clone.setVnBust(source.vnBust());
        if (clone.setVnBattler && source.vnBattler) clone.setVnBattler(source.vnBattler());
        // A creature divides into a creature, and whatever divided can divide
        // again: the copy inherits both flags from the original's slot.
        const sourceId = source.actorId();
        if ($gameSwitches && CREATURE_SWITCHES[sourceId] && CREATURE_SWITCHES[actorId]) {
            $gameSwitches.setValue(CREATURE_SWITCHES[actorId], $gameSwitches.value(CREATURE_SWITCHES[sourceId]));
        }
        if ($gameVariables && REPRODUCTION_VARS[sourceId] && REPRODUCTION_VARS[actorId]) {
            $gameVariables.setValue(REPRODUCTION_VARS[actorId], $gameVariables.value(REPRODUCTION_VARS[sourceId]));
        }
        clone.recoverAll();
        $gameParty.addActor(actorId);
        if ($gameVariables) $gameVariables.setValue(29, $gameParty.members().length);
        return clone;
    }

    // ---- Combat training -------------------------------------------------
    // A companion drilled until it is a party member rather than a passenger.
    // Which drills are on offer is not written here: every archetype already
    // carries its own class rosters in js/db/Health/Archetypes.json, read
    // through window.CreatureClasses, and this only decides which of the two
    // rosters a given companion is allowed to be drilled out of.

    // Beast is the first of the creature classes and the drill every animal can
    // always take; Freelancer is the same floor for somebody who talks.
    const BEAST_CLASS_ID = 63;
    const FREELANCER_CLASS_ID = 1;

    // What a drill costs, before anybody's training is taken into account. A
    // bigger creature is a longer job, and the specializations below take days
    // back off it: Master Animal Training is a little under half the work.
    const TRAIN_BASE_DAYS = 5;
    const TRAIN_LEVELS_PER_EXTRA_DAY = 10;
    const TRAIN_MINUTES_PER_DAY = 1440;
    // A cryo sleep or a flight across the continent skips the time; it does not
    // do the work. However far the clock jumps, one pass credits one day.
    const TRAIN_MINUTES_PER_PASS = TRAIN_MINUTES_PER_DAY;
    const TRAIN_SPEC_ANIMAL = "Animal Training";  // i18n-ignore  js/db/Skills/Specialization.json name
    const TRAIN_SPEC_PEOPLE = "Leadership";       // i18n-ignore  ditto
    const TRAIN_SPEC_STEP = 0.12;                 // days taken off per tier
    const TRAIN_SPEC_FLOOR = 0.45;                // and never below this share

    function _toast(text, severity) {
        if (!text) return;
        if (window.ParchmentToast) {
            window.ParchmentToast.show(text, { severity: severity || "info", duration: 180 });
        } else if (typeof $gameMessage !== "undefined" && $gameMessage) {
            $gameMessage.add(text);
        }
    }

    // Sentience is read straight off the record: an explicit choice (the
    // character-creation companion picker) or the monster's own <Talk> tag,
    // kept on the record when it was recruited. Either way it is baked into
    // pet.sentient once, at registration, and every other check just reads
    // the one field. Something sentient is a person, and a person is never
    // drilled into a creature class.
    function _speaks(pet) {
        return !!(pet && pet.sentient);
    }

    // Three optional traits, chosen when a companion is taken in, each lean
    // its base attributes one way: sentience toward Psi, the arcane toward
    // Intelligence and Wisdom, a genetic freak toward Strength and
    // Constitution. Flat and simple, since a pet never rolls a full attribute
    // spread the way a party member does.
    const PET_BASE_ATTR = 10;
    const PET_TRAIT_BONUS = 4;
    // ---- Ridable ---------------------------------------------------------
    // Whether a companion is big and willing enough to be sat on. Three sources,
    // any one of which is enough, and all three are DATA rather than a literal
    // roster kept here:
    //
    //   <Ridable>  on the note of the monster it was recruited from
    //              (data/Enemies.json), which rides along in the pet record
    //   ridable    on its sprite's wardrobe entry in js/db/WorldGen/NPCs.json,
    //              either at the top level or inside animalGrowth (the horses,
    //              the donkeys and the cattle), read through AnimalGrowthSystem
    //
    // A PARTY MEMBER is never any of these: they are actors, not pet records,
    // and nothing here is ever asked about one. Riding a companion goes through
    // the pet registry alone, so a person can never be made into a mount.
    function _isRidableRecord(record) {
        if (!record) return false;
        if (record.ridable === true) return true;
        if (/<Ridable>/i.test(String(record.note || ""))) return true;
        // The enemy it was recruited from may carry the tag even when the record
        // was built without copying the note over.
        const enemy = record.enemyId && typeof $dataEnemies !== "undefined" && $dataEnemies
            ? $dataEnemies[record.enemyId] : null;
        if (enemy && /<Ridable>/i.test(String(enemy.note || ""))) return true;
        return _isRidableSprite(record.characterName);
    }

    // The wardrobe answer for a sprite sheet: the animal breeds go through
    // AnimalGrowthSystem (which folds animalGrowth.ridable up to the breed), and
    // anything else is read off the entry itself.
    function _isRidableSprite(spriteKey) {
        if (!spriteKey) return false;
        if (window.AnimalGrowthSystem && window.AnimalGrowthSystem.isRidableSprite &&
            window.AnimalGrowthSystem.isRidableSprite(spriteKey)) return true;
        const entry = (window.WorldGen && window.WorldGen.NPCs) ? window.WorldGen.NPCs[spriteKey] : null;
        if (!entry) return false;
        if (entry.ridable === true) return true;
        return !!(entry.animalGrowth && entry.animalGrowth.ridable);
    }

    function _petAttrs(sentient, magical, geneticFreak) {
        return {
            STR: PET_BASE_ATTR + (geneticFreak ? PET_TRAIT_BONUS : 0),
            CON: PET_BASE_ATTR + (geneticFreak ? PET_TRAIT_BONUS : 0),
            INT: PET_BASE_ATTR + (magical ? PET_TRAIT_BONUS : 0),
            WIS: PET_BASE_ATTR + (magical ? PET_TRAIT_BONUS : 0),
            PSI: PET_BASE_ATTR + (sentient ? PET_TRAIT_BONUS : 0),
        };
    }

    function _isCreatureClass(classId) {
        const CC = window.CreatureClasses;
        if (CC && CC.isCreatureClass) return CC.isCreatureClass(classId);
        return Number(classId) >= BEAST_CLASS_ID;
    }

    function _className(classId) {
        const data = $dataClasses && $dataClasses[classId];
        if (!data) return "";
        return window.CCDbName ? window.CCDbName(data) : data.name;
    }

    // Which specialization the party is leaning on: an animal is conditioned,
    // a person is led.
    function _trainSpec(pet) {
        return _speaks(pet) ? TRAIN_SPEC_PEOPLE : TRAIN_SPEC_ANIMAL;
    }

    function _trainingOptions(pet) {
        if (!pet) return [];
        const CC = window.CreatureClasses;
        const keys = String(pet.archetype || "")
            .split("/").map(s => s.trim()).filter(Boolean);
        const speaks = _speaks(pet);
        let ids = [];
        if (CC && CC.groupsForArchetypes) {
            const groups = CC.groupsForArchetypes(keys[0] || null, keys[1] || null);
            ids = speaks ? groups.sentient.slice() : groups.creature.concat(groups.sentient);
        }
        if (speaks) ids = ids.filter(id => !_isCreatureClass(id));
        // The drill that is always on the board, whatever the archetype answers.
        const floor = speaks ? FREELANCER_CLASS_ID : BEAST_CLASS_ID;
        if (!ids.includes(floor)) ids.unshift(floor);
        return ids.filter(id => $dataClasses[id] && $dataClasses[id].name);
    }

    // A summon is not the party's to train: it is something they called and are
    // holding, and it goes back where it came from (SummonSystem.js).
    function _isSummoned(pet) {
        const info = window.SummonSystem && window.SummonSystem.mapSummonInfo
            ? window.SummonSystem.mapSummonInfo() : null;
        return !!(info && pet && info.petId === pet.id);
    }

    function _canTrain(pet) {
        if (!pet) return false;
        if (pet.isChild) return false;      // family, not livestock
        if (pet.training) return false;     // already at it
        if (_isSummoned(pet)) return false;
        return _trainingOptions(pet).length > 0;
    }

    function _trainingDays(pet) {
        if (!pet) return TRAIN_BASE_DAYS;
        const base = TRAIN_BASE_DAYS +
            Math.floor(Math.max(1, pet.level || 1) / TRAIN_LEVELS_PER_EXTRA_DAY);
        const XP = window.SpecializationXP;
        const factor = (XP && XP.discount)
            ? XP.discount(_trainSpec(pet), TRAIN_SPEC_STEP, TRAIN_SPEC_FLOOR)
            : 1;
        return Math.max(1, Math.round(base * factor));
    }

    function _worldMinute() {
        const TD = window.TimeDateSystem;
        if (TD && TD.getGameTimeMinutes) return TD.getGameTimeMinutes();
        return (typeof $gameVariables !== "undefined" && $gameVariables)
            ? ($gameVariables.value(114) || 0) : 0;
    }

    // The graduate. It keeps its name, its level, its face and the skills the
    // monster it was came with; what changes is that it is an actor now, on the
    // class it was drilled into.
    function _petIntoActor(actorId, pet, classId) {
        const actor = $gameActors && $gameActors.actor(actorId);
        if (!actor) return null;
        // Start from the database entry so nothing of a previous occupant of
        // the slot survives into the graduate.
        actor.setup(actorId);
        actor.setName(pet.name);
        const wearClass = Number(classId || pet.training?.classId || BEAST_CLASS_ID);
        actor.changeClass(wearClass, false);
        actor.changeLevel(Math.max(1, pet.level || 1), false);
        actor.setCharacterImage(pet.characterName, pet.characterIndex || 0);
        actor.setFaceImage("", 0);
        actor.setBattlerImage("");
        (pet.skillIds || []).forEach(id => { if ($dataSkills[id]) actor.learnSkill(id); });
        // What it is remains what it was: the battle sheet and the 3D model are
        // both resolved off the creature it was recruited from.
        actor._recruitedEnemyId = pet.enemyId || 0;
        actor._recruitedLook = null;   // the look roll of whoever held the slot before goes with them
        if (pet.archetype) {
            actor._currentArchetype = pet.archetype;
            actor._creatureArchetypes = [pet.archetype];
        }
        // A graduate on a creature class is still a creature, and every system
        // that asks does so through this slot's switch.
        if ($gameSwitches && CREATURE_SWITCHES[actorId]) {
            $gameSwitches.setValue(CREATURE_SWITCHES[actorId], _isCreatureClass(wearClass));
        }
        actor.recoverAll();
        $gameParty.addActor(actorId);
        if ($gameVariables) $gameVariables.setValue(29, $gameParty.members().length);
        return actor;
    }

    // The world clock only moves when the player does: a step walked on the map
    // or an hour waited through. Crediting the minutes it gained is therefore
    // exactly "while the party is travelling with it", and nothing else counts.
    // Only the companion actually on the leash makes progress, so handing it to
    // another one leaves the drill standing where it was.
    function _advanceTraining() {
        if (typeof $gameSystem === "undefined" || !$gameSystem) return;
        const now = _worldMinute();
        const last = $gameSystem._petTrainClock;
        $gameSystem._petTrainClock = now;
        if (last == null || now <= last) return;
        const pet = window.PetSystem.getActivePet();
        if (!pet || !pet.training || pet.training.ready) return;
        pet.training.done = Math.min(
            pet.training.need,
            (pet.training.done || 0) + Math.min(now - last, TRAIN_MINUTES_PER_PASS)
        );
        if (pet.training.done >= pet.training.need) {
            pet.training.ready = true;
            const actor = window.PetSystem.promoteTrainee(pet.id);
            if (!actor) {
                // Finished, with nowhere to stand. It waits on the Followers
                // page until a place in the party opens up.
                _toast(T('PetFollower.training.readyNoRoom', { name: pet.name }), "warning");
            }
        }
    }

    const _Scene_Map_update_pets = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function () {
        _Scene_Map_update_pets.call(this);
        _advanceTraining();
    };

    window.PetSystem = {
        // The rename field in the Pets page caps typing at the same length
        // renamePet() enforces.
        NAME_MAX_LENGTH: PET_NAME_MAX_LENGTH,

        // The same formula registerPet() bakes into a record's own attrs, bared
        // for a picker to preview live before the companion is actually taken
        // in (CharacterCreation.js's companion tab).
        previewAttrs(sentient, magical, geneticFreak) {
            return _petAttrs(!!sentient, !!magical, !!geneticFreak);
        },

        getPets() {
            return _store() || [];
        },

        getPet(id) {
            const list = _store();
            if (!list) return null;
            return list.find(p => p && p.id === id) || null;
        },

        getChildren() {
            return this.getPets().filter(p => p && p.isChild);
        },

        getActivePet() {
            if (!$gameSystem || $gameSystem._activePetId == null) return null;
            return this.getPet($gameSystem._activePetId);
        },

        registerPet(record) {
            const list = _store();
            if (!list) return null;
            if (!$gameSystem._petIdCounter) $gameSystem._petIdCounter = 0;
            // Sentience is an explicit choice or the <Talk> tag riding along on
            // the note (a monster recruited through EnemyTalkSystem never sets
            // the flag itself); either is baked into the record from here on.
            const sentient = !!record.sentient || /<Talk>/i.test(String(record.note || ""));
            const magical = !!record.magical;
            const geneticFreak = !!record.geneticFreak;
            const pet = {
                id: ++$gameSystem._petIdCounter,
                name: String(record.name || T('PetFollower.defaultName')),
                characterName: record.characterName || "",
                characterIndex: record.characterIndex || 0,
                isFollower: !!record.isFollower,
                isChild: !!record.isChild,
                parentName: record.parentName || "",
                bornOn: record.bornOn || "",
                enemyId: record.enemyId || 0,
                enemyName: record.enemyName || "",
                level: record.level || 1,
                archetype: record.archetype || null,
                note: record.note || "",
                skillIds: Array.isArray(record.skillIds) ? record.skillIds.slice() : [],
                sentient: sentient,
                magical: magical,
                geneticFreak: geneticFreak,
                // Re-derived on every read (see isRidable) so a companion whose
                // wardrobe entry gains the flag later is not stuck on a stale
                // answer; kept on the record so a menu row can sort on it.
                ridable: false,
                attrs: _petAttrs(sentient, magical, geneticFreak),
            };
            pet.ridable = _isRidableRecord(Object.assign({}, record, {
                characterName: pet.characterName, note: pet.note, enemyId: pet.enemyId
            }));
            list.push(pet);
            return pet;
        },

        recruitPet(record) {
            // Last gate on the rule EnemyTalkSystem owns: a <NoRecruit> creature
            // (a petrodemon) is never a pet, a follower or anyone's company,
            // whichever path asked.
            const unrecruitable = window.EnemyTalk && window.EnemyTalk.isUnrecruitableData;
            if (record && unrecruitable && unrecruitable({ note: record.note || '' })) return null;
            const pet = this.registerPet(record);
            if (pet) this.setActivePet(pet.id);
            return pet;
        },

        // A pregnancy of any kind ending (a birth, a clutch of eggs, a clone, a
        // planted seed) hands the offspring over here. It gets a face of its own
        // out of the Skab pixel pack and a name of its own, unless the caller
        // supplies them (a mitosis clone is its parent twice over, sprite
        // included). A newborn only takes the leash when nothing else is
        // following, so a birth never displaces the pet already walking with the
        // party.
        birthChild(actor, record) {
            if (!actor) return null;
            const opts = record || {};
            const look = (opts.characterName)
                ? { characterName: opts.characterName, characterIndex: opts.characterIndex || 0 }
                : (_randomSkabSprite() || { characterName: actor.characterName(), characterIndex: actor.characterIndex() });
            const child = this.registerPet({
                name: opts.name || _newbornName() || T('PetFollower.defaultChildName'),
                characterName: look.characterName,
                characterIndex: look.characterIndex,
                isChild: true,
                parentName: actor.name(),
                bornOn: $gameVariables ? String($gameVariables.value(113) || "") : "",
                level: 1,
            });
            if (!child) return null;
            if (!this.getActivePet()) this.setActivePet(child.id);
            else _refreshFollower();
            return child;
        },

        // Can this companion be ridden? A child never is (it is family, and it
        // is small), and neither is anything the data does not say so about.
        isRidable(id) {
            const pet = this.getPet(id);
            if (!pet || pet.isChild) return false;
            const ok = _isRidableRecord(pet);
            pet.ridable = ok;
            return ok;
        },

        getRidablePets() {
            return this.getPets().filter(p => p && this.isRidable(p.id));
        },

        setActivePet(id) {
            if (!$gameSystem) return;
            const pet = this.getPet(id);
            $gameSystem._activePetId = pet ? pet.id : null;
            _refreshFollower();
        },

        // A pet joins under the name of the monster it was; the player renames it
        // from the Pets page. An empty or whitespace-only name is refused (the
        // pet keeps the one it has) and anything longer than the name-entry limit
        // is cut, so the registry never holds a name a menu row cannot show.
        renamePet(id, name) {
            const pet = this.getPet(id);
            if (!pet) return null;
            const trimmed = String(name == null ? "" : name).trim().slice(0, PET_NAME_MAX_LENGTH);
            if (!trimmed) return pet;
            pet.name = trimmed;
            return pet;
        },

        releasePet(id) {
            const list = _store();
            if (!list) return;
            const idx = list.findIndex(p => p && p.id === id);
            if (idx < 0) return;
            list.splice(idx, 1);
            if ($gameSystem._activePetId === id) {
                // Fall back to the most recently recruited remaining pet, if any.
                $gameSystem._activePetId = list.length ? list[list.length - 1].id : null;
            }
            _refreshFollower();
        },

        // Mitosis does not make a child, it makes a second of somebody. The copy
        // takes a place in the party when there is one free, and otherwise walks
        // behind it as a companion. Either way it is named after the original
        // and numbered. Returns { name, copyNumber, joined, actorId, child }.
        mitosisSplit(actor) {
            if (!actor) return null;
            const base = _copyBaseName(actor.name()) || T('PetFollower.defaultChildName');
            const copyNumber = _nextCopyNumber(base);
            const name = base + " #" + copyNumber;

            const slot = _freeCompanionSlot();
            if (slot) {
                const clone = _copyActorInto(slot, actor, name);
                if (clone) return { name, copyNumber, joined: true, actorId: slot, child: null };
            }
            // No room to travel: the copy is registered like any other offspring,
            // wearing the original's sprite because that is what it is.
            const child = this.birthChild(actor, {
                name,
                characterName: actor.characterName(),
                characterIndex: actor.characterIndex(),
            });
            return { name, copyNumber, joined: false, actorId: 0, child };
        },

        // What an abandonment would be charged as, for a caller that wants to
        // say so before it happens (the Pets page warns first). Null when the
        // parting is lawful.
        abandonCrimeFor(id) {
            const key = _abandonCrimeKey(this.getPet(id));
            if (!key || !window.CrimeSystem || !window.CrimeSystem.getPresetCrime) return null;
            const preset = window.CrimeSystem.getPresetCrime(key);
            if (!preset) return null;
            return Object.assign({}, preset, {
                key: key,
                name: window.CrimeSystem.presetCrimeName
                    ? window.CrimeSystem.presetCrimeName(key)
                    : preset.name,
            });
        },

        // Leaving a companion behind. The record goes the same way a release
        // went, but the act is filed with the nEuroPolice first when there is
        // anything to file. The charge is filed before the record is dropped,
        // so the notification can still name what was abandoned.
        abandonPet(id) {
            const pet = this.getPet(id);
            if (!pet) return null;
            const key = _abandonCrimeKey(pet);
            if (key && window.CrimeSystem && window.CrimeSystem.addPresetCrime) {
                window.CrimeSystem.addPresetCrime(key);
            }
            this.releasePet(id);
            return pet;
        },

        refreshFollower() {
            _refreshFollower();
        },

        // ---- Combat training ---------------------------------------------

        canTrain(id) {
            return _canTrain(this.getPet(id));
        },

        trainingOptions(id) {
            return _trainingOptions(this.getPet(id));
        },

        trainingDays(id) {
            return _trainingDays(this.getPet(id));
        },

        trainingInfo(id) {
            const pet = this.getPet(id);
            return (pet && pet.training) ? pet.training : null;
        },

        // Put a companion on a drill. It takes the leash at once: walking with
        // the party IS the training, so nothing else can be following while it
        // is being done.
        startTraining(id, classId) {
            const pet = this.getPet(id);
            if (!pet || !_canTrain(pet)) return null;
            const wanted = Number(classId);
            if (!_trainingOptions(pet).includes(wanted)) return null;
            const days = _trainingDays(pet);
            pet.training = {
                classId: wanted,
                days: days,
                need: days * TRAIN_MINUTES_PER_DAY,
                done: 0,
                ready: false,
            };
            this.setActivePet(pet.id);
            // Start the clock from here, so time already spent walking with it
            // before the drill began is not credited to the drill.
            if ($gameSystem) $gameSystem._petTrainClock = _worldMinute();
            _toast(T('PetFollower.training.started', {
                name: pet.name,
                className: _className(wanted),
                days: days,
            }), "info");
            return pet.training;
        },

        // Calling the drill off. What was done is done and is not kept: a drill
        // half-finished is a drill not finished.
        stopTraining(id) {
            const pet = this.getPet(id);
            if (!pet || !pet.training) return null;
            pet.training = null;
            _toast(T('PetFollower.training.stopped', { name: pet.name }), "warning");
            return pet;
        },

        // Is there anywhere for somebody new to stand? The answer the two
        // join offers in the Empathize panel are greyed out on.
        hasFreeSlot() {
            return _freeCompanionSlot() > 0;
        },

        // Taken straight into the party instead of onto the leash. An animal
        // asked to travel rather than to follow is exactly the record a pet
        // would have been, wearing its creature class from the first step: it
        // holds a party slot and it fights, without a drill first. Answers the
        // actor, or null when nobody has room for it.
        inductAsMember(record, classId) {
            const slot = _freeCompanionSlot();
            if (!slot) return null;
            const pet = this.registerPet(record);
            if (!pet) return null;
            const wanted = Number(classId) || (_trainingOptions(pet)[0] ?? BEAST_CLASS_ID);
            const actor = _petIntoActor(slot, pet, wanted);
            this.releasePet(pet.id);
            return actor || null;
        },

        // A finished trainee taking a place in the party. Answers null when
        // every companion slot is taken, which leaves it waiting rather than
        // losing the work.
        promoteTrainee(id) {
            const pet = this.getPet(id);
            if (!pet || !pet.training || !pet.training.ready) return null;
            const slot = _freeCompanionSlot();
            if (!slot) return null;
            const className = _className(pet.training.classId);
            const actor = _petIntoActor(slot, pet);
            if (!actor) return null;
            this.releasePet(pet.id);
            _toast(T('PetFollower.training.graduated', {
                name: actor.name(),
                className: className,
            }), "info");
            return actor;
        },
    };

    console.log("[PetFollowerSystem] v1.1.0 loaded.");
})();
