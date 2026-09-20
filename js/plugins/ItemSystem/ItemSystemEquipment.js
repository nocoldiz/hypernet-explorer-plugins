/*:
 * @target MZ
 * @plugindesc Character Switch Equip Menu v1.6.0 (D&D Parchment Modern Edition)
 * @author Omni-Lex
 * @version 1.6.0
 * @description Modernized Equip screen into a premium D&D double-page character codex. Syncs variables 121-132.
 * @url https://nocoldiz.itch.io/hypernet-explorer
 * @help ItemSystemEquipment.js
 *
 * Business-logic layer. Must be listed before ItemSystemEquipmentUI.js.
 * Exposes window.EquipI18n and window.EquipParams for the UI layer.
 *
 * Armor Type Stats:
 * - Clothes (Type 1): Substance 100%, Stealth 100%
 * - Robe (Type 2): Arcane 100%
 * - Light Armor (Type 3): Stealth 100%
 * - Heavy Armor (Type 4): Intimidation 100%
 *
 * Weapon Type Stats:
 * - Dagger (Type 1): Stealth 100%
 * - Sword (Type 2): Intimidation 100%
 * - Heavy (Type 3): Intimidation 100%
 * - Axe (Type 4): Intimidation 100%
 * - Whip (Type 5): Substance 100%
 * - Staff (Type 6): Arcane 100%
 * - Bow (Type 7): Stealth 100%
 * - Projectile (Type 8): Substance 100%
 * - Gun (Type 9): Substance 100%
 * - Claw (Type 10): Intimidation 100%
 *
 * Hands:
 * - Every hand may hold a weapon. A class that dual wields (the <DualWield>
 *   note tag, or the stock Dual Wield trait) swings them all at no cost, and
 *   Optimize fills its hands with weapons. A class that does not may still be
 *   handed a second weapon, but then EVERY weapon it carries is cut to 65%
 *   (HandSlots.UNTRAINED_DUAL_PENALTY); Optimize leaves those classes holding
 *   one weapon and puts a shield in the other hand.
 * - So a pair of hands comes to one of: two shields, a weapon and a shield,
 *   one two-handed weapon across both, two one-handed weapons, one of either
 *   on its own, or nothing at all.
 * - Every body part that declares canHoldWeapon in js/db/Health/Archetypes.json
 *   is a weapon slot, and a hand takes a weapon or a shield without distinction,
 *   so two shields are as legal as two swords.
 * - A <TwoHanded> weapon needs two free hands. One hand means one <OneHanded>
 *   weapon (or one shield) and no other weapon slot at all.
 * - A body with no hands holds its weapon in its mouth instead: one slot, and
 *   it takes anything, one-handed or two-handed, weapon or shield. A class
 *   tagged <MouthSlot> (the samurai) keeps that slot on top of its hands.
 * - Eight weapon slots is the ceiling however many limbs a body grows.
 * - Past two weapons the arsenal stops being a sum: each parameter becomes the
 *   median of what is carried, and two of them, drawn at random, are the ones
 *   that swing each turn (Game_Actor#activeWeapons).
 * - Losing a limb takes its slot with it and hands back what it was holding.
 *
 * Weapon Proficiency:
 * - Any class can equip any weapon type. How well it is wielded comes from the
 *   matching "Weapons" specialization (js/db/Skills/Specialization.json), which
 *   starts at Intermediate (level 3) for the weapon types the class used to be
 *   limited to and Untrained for the rest.
 * - Weapon parameters are scaled by proficiency level:
 *   Untrained 33%, Beginner 67%, Intermediate 100%, Advanced 110%, Master 125%.
 * - Winning a battle grants 1 proficiency point per equipped weapon type, so an
 *   untrained weapon carried long enough catches up.
 *
 * Weapon Scaling (shown when weapon slot selected):
 * - No attack skill: STR scaling
 * - Attack skill 840: DEX scaling
 * - Attack skill 841: MIX scaling
 * - Attack skill 842: PSI scaling
 * - Attack skill 843: INT scaling
 * - Attack skill 844: CON scaling
 * - Attack skill 845: WIS scaling
 *
 * @param enableSwitching
 * @text Enable Character Switching
 * @desc Enable switching characters with Left/Right keys in equip menu
 * @type boolean
 * @default true
 *
 * @param switchSound
 * @text Switch Sound Effect
 * @desc Play sound when switching characters
 * @type boolean
 * @default true
 */

(() => {
    'use strict';

    const pluginName = 'ItemSystemEquipment';
    const parameters = PluginManager.parameters(pluginName);

    // Copy lives in js/i18n/<lang>/plugins/Equip.json. The i18n[lang][key]
    // shape is kept so the UI's `i18n[lang] || i18n['en']` call sites and
    // window.EquipI18n consumers are unchanged.
    const equipText = new Proxy({}, {
        get: (_, key) => {
            if (key === 'weaponTypes' || key === 'armorTypes' || key === 'short') {
                return new Proxy({}, {
                    get: (__, subKey) => T('Equip.' + String(key) + '.' + String(subKey))
                });
            }
            return T('Equip.' + String(key));
        }
    });
    const i18n = new Proxy({}, { get: () => equipText });

    // =============================================================================
    // Hands, and what they can hold
    // =============================================================================
    //
    // There is no dual-wield flag any more. How many weapons a character can
    // carry is a fact about their body: every body part that declares
    // `canHoldWeapon` in js/db/Health/Archetypes.json is a slot, and the
    // part's own name says what kind of slot it is. A hand (an arm, a claw, a
    // pincer, a tentacle, a vine, a wisp...) takes one weapon or one shield;
    // there is nothing special about an off-hand, so two shields are as legal
    // as two swords.
    //
    //   * A weapon tagged <TwoHanded> needs two free hands.
    //   * With a single hand only a <OneHanded> weapon (or a shield) fits, and
    //     that is the only weapon slot the character has.
    //   * With no hands at all the mouth takes over: one slot, and it holds
    //     anything, one-handed or two-handed, weapon or shield. That is how a
    //     beast, a quadruped or a machine carries a weapon.
    //   * Eight weapon slots is the ceiling however many limbs a body grows.
    //
    // A samurai always has the mouth slot on top of their hands (<MouthSlot>
    // on the class), because carrying a blade in the teeth is the whole point.
    //
    // Losing a limb takes its slot with it. In Blood and Oil a part that is
    // finished is finished, whether it came off the body (cut off) or was
    // ruined where it stands (destroyed), and either way it grips nothing: the
    // slot goes, and the piece that was in THAT limb - not whichever happened
    // to be last in the list - is handed back to the party
    // (releaseSlotForPart, below). A destroyed mouth is the same story, so a
    // beast that loses its jaws carries no weapon until new ones are grafted
    // on. On every other difficulty an arm is only ever broken, never severed,
    // and a broken arm is still an arm: it keeps its slot and what is in it,
    // and mends with rest or a potion.

    const ETYPE_WEAPON  = 1;
    const ETYPE_OFFHAND = 2;
    const ETYPE_HEAD    = 3;
    const ETYPE_BODY    = 4;
    const MAX_WEAPON_SLOTS = 8;
    const MOUTH_SLOT_TAG = 'MouthSlot';
    const DUAL_WIELD_TAG = 'DualWield';
    // Trait code 55 (Special Flag), dataId 1: the stock Dual Wield flag, which
    // is how the classes in data/Classes.json that dual wield say so. The note
    // tag is the other way of saying it, for a class or a spliced-on body that
    // was never given the trait.
    const TRAIT_SPECIAL_FLAG = 55;
    const FLAG_DUAL_WIELD = 1;
    // What a hand pays for a second weapon it was never trained to hold. Both
    // weapons are cut, not just the off-hand one: fighting with a blade in
    // each hand is worse than fighting with one unless the class knows how.
    const UNTRAINED_DUAL_PENALTY = 0.65;

    // Part keys are matched a token at a time, so LEFT_HAND, CLAW_RIGHT,
    // WATER_ARMS and VOID_TENDRIL_1 all read as hands while PLATE_ARMOR (which
    // merely contains "ARM") does not.
    // i18n-ignore-start: body-part keys, matched against data, never shown
    const HAND_TOKENS = new Set([
        'HAND', 'HANDS', 'ARM', 'ARMS', 'FOREARM', 'CLAW', 'CLAWS', 'PINCER',
        'PINCERS', 'TALON', 'TALONS', 'TENTACLE', 'TENTACLES', 'TENDRIL',
        'PSEUDOPOD', 'APPENDAGE', 'LIMB', 'LIMBS', 'VINE', 'BRANCH', 'WISP',
        'SPIRE', 'GAUNTLET', 'GRIPPER', 'CANNON'
    ]);
    const MOUTH_TOKENS = new Set([
        'MOUTH', 'MAW', 'JAWS', 'JAW', 'BEAK', 'FANGS', 'MANDIBLES', 'TONGUE',
        'TEETH', 'TRUNK', 'SNOUT', 'PROBOSCIS', 'RADULA'
    ]);
    // A helmet needs a head to sit on and a breastplate needs something to go
    // round, so those two slots are anatomy as well: a slime has neither, and a
    // body that loses its head in Blood and Oil loses the slot with it.
    const HEAD_TOKENS = new Set([
        'HEAD', 'SKULL', 'CROWN', 'FACE', 'HELMET', 'HAT', 'CAP', 'VISAGE'
    ]);
    const BODY_TOKENS = new Set([
        'TORSO', 'BODY', 'CHEST', 'CHESTPLATE', 'CHASSIS', 'THORAX', 'ABDOMEN',
        'CEPHALOTHORAX', 'MASS', 'FORM', 'SEGMENT', 'PILE', 'BASE', 'HULL',
        'FRAME', 'CORE', 'NUCLEUS', 'SHELL', 'CARAPACE', 'PLATE', 'PLATES',
        'PLATING', 'ARMOR', 'MANTLE', 'MEMBRANE', 'RIBCAGE', 'HIDE', 'ROBE'
    ]);
    // An arm is a limb with nothing on the end of it yet. Which is what a hand
    // has to be grafted onto (Health/Health_ProstheticShop.js).
    const ARM_TOKENS = new Set([
        'ARM', 'ARMS', 'FOREARM', 'APPENDAGE', 'LIMB', 'LIMBS'
    ]);
    // i18n-ignore-end

    // Part keys repeat across every body in the game, so the answer is worked
    // out once per key and remembered: this is read on every equip screen draw.
    const partKindCache = {};
    function partKind(partKey) {
        const key = String(partKey || '');
        if (partKindCache[key] !== undefined) return partKindCache[key];
        // A part is one thing, and the more specific reading wins: an
        // elephant's TRUNK is a mouth rather than a torso, and a HELMET is a
        // head rather than plating.
        let kind = null;
        for (const token of key.toUpperCase().split('_')) {
            if (HAND_TOKENS.has(token)) { kind = 'hand'; break; }
            if (MOUTH_TOKENS.has(token)) { kind = 'mouth'; continue; }
            if (kind === 'mouth') continue;
            if (HEAD_TOKENS.has(token)) { kind = 'head'; continue; }
            if (kind !== 'head' && BODY_TOKENS.has(token)) kind = 'body';
        }
        partKindCache[key] = kind;
        return kind;
    }

    // A grasping limb that is only an arm: something a hand could go on the
    // end of, rather than the hand itself.
    function isBareArmKey(partKey) {
        let arm = false;
        for (const token of String(partKey || '').toUpperCase().split('_')) {
            if (ARM_TOKENS.has(token)) arm = true;
            else if (HAND_TOKENS.has(token)) return false;
        }
        return arm;
    }

    // A limb that is past using: ruined where it stands, which only ever
    // happens in Blood and Oil and only to a part the body cannot shed (a
    // torso, a mouth). A part that came off is simply not in the anatomy any
    // more and needs no flag; a part that is merely broken still grips what it
    // is gripping, and mends. Deliberately NOT keyed on `damaged` or on zero
    // HP: a part is marked broken a beat before the difficulty decides what
    // becomes of it, and reading the slot list in that gap would renumber the
    // hands while the equipment list still had the old shape.
    function isPartSpent(part) {
        return !!(part && part.ruined);
    }

    function isTwoHandedWeapon(item) {
        return !!(item && item.wtypeId && item.meta && item.meta.TwoHanded);
    }

    // A weapon or an off-hand piece: the two things a hand can close around.
    function isHeldItem(item) {
        return !!item && (item.etypeId === ETYPE_WEAPON || item.etypeId === ETYPE_OFFHAND);
    }

    const HandSlots = {
        MAX_WEAPON_SLOTS,

        isTwoHanded: isTwoHandedWeapon,
        isHeldItem,

        // The class that never puts its blade down.
        classHasMouthSlot(actor) {
            const cls = actor && actor.currentClass && actor.currentClass();
            return !!(cls && cls.meta && cls.meta[MOUTH_SLOT_TAG]);
        },

        UNTRAINED_DUAL_PENALTY,

        // Whether this character was trained to fight with a weapon in each
        // hand. Asked of the class note tag first and of the character's own
        // traits second, so a flag handed out by a specialization, a piece of
        // gear or a spliced-on body counts as well as the class itself.
        hasDualWield(actor) {
            if (!actor) return false;
            const cls = actor.currentClass && actor.currentClass();
            if (cls && cls.meta && cls.meta[DUAL_WIELD_TAG]) return true;
            if (typeof actor.specialFlag === 'function') {
                try { if (actor.specialFlag(FLAG_DUAL_WIELD)) return true; } catch (e) { /* no traits yet */ }
            }
            if (typeof actor.traits === 'function') {
                try {
                    return actor.traits(TRAIT_SPECIAL_FLAG)
                        .some(tr => tr && tr.dataId === FLAG_DUAL_WIELD);
                } catch (e) { /* no traits yet */ }
            }
            return false;
        },

        // How much of its listed strength each weapon delivers. A single
        // weapon is always whole, and so is an armful in the hands of a class
        // that dual wields. Anyone else pays UNTRAINED_DUAL_PENALTY on every
        // weapon they hold, the moment a second one goes in.
        dualPenalty(actor, weaponCount) {
            if (!actor) return 1;
            const count = weaponCount !== undefined
                ? weaponCount
                : (actor.equips ? actor.equips().filter(i => i && i.wtypeId).length : 0);
            if (count < 2) return 1;
            return this.hasDualWield(actor) ? 1 : UNTRAINED_DUAL_PENALTY;
        },

        // Is this character paying that penalty right now? What the equip
        // screen puts its warning on.
        isPenalisedDualWield(actor) {
            return this.dualPenalty(actor) < 1;
        },

        // Count weapons already in hand slots, optionally ignoring one slot
        // (the one being changed) so a swap is measured against what fits.
        weaponCountInHands(actor, exceptSlot) {
            const layout = this.layout(actor);
            const equips = actor.equips();
            let count = 0;
            for (let i = 0; i < layout.hands; i++) {
                if (i === exceptSlot) continue;
                if (equips[i] && equips[i].wtypeId) count++;
            }
            return count;
        },

        // How many weapons these hands can carry at once. Every hand counts:
        // there is no cap any more, only a penalty for the classes that were
        // never trained for it (dualPenalty, above).
        maxWeapons(actor) {
            return this.layout(actor).hands;
        },

        // ...and how many of them are free of that penalty, which is what
        // Optimize fills and what the character sheet quotes.
        freeWeapons(actor) {
            const h = this.layout(actor).hands;
            return this.hasDualWield(actor) ? h : Math.min(1, h);
        },

        // What the body can hold with. Anything without an anatomy on file (a
        // guest actor, a battler built outside the health system) is read as a
        // pair of hands, which is what every character had before this existed.
        layout(actor, keepKey) {
            let hands = 0;
            let biter = false;   // a mouth the body carries a weapon in
            let mouthed = false; // a mouth at all
            let headed = false;  // something a helmet would sit on
            let bodied = false;  // something a breastplate would go round
            let handKeys = [];   // the parts the hand slots answer for, in order
            let mouthKey = null;
            // An anatomy is otherwise built the first time somebody is hurt or
            // the health menu is opened, which would leave a beast looking like
            // it had a pair of hands until then.
            let parts = actor && actor._bodyParts;
            const health = window.Health;
            if (!parts && actor && window.initializeBodyParts && !this._buildingAnatomy &&
                health && health.Archetypes) {
                this._buildingAnatomy = true;
                try { window.initializeBodyParts(actor); } catch (e) { /* health system not up */ }
                this._buildingAnatomy = false;
                parts = actor._bodyParts;
            }
            // An empty map is a body that was never filled in, not a body with
            // nothing on it: read as no anatomy on file rather than as a torso
            // with no way to hold anything.
            if (parts && !Object.keys(parts).length) parts = null;
            if (parts) {
                const counted = this.count(parts, actor, keepKey);
                hands = counted.hands;
                biter = counted.biter;
                mouthed = counted.mouthed;
                headed = counted.headed;
                bodied = counted.bodied;
                handKeys = counted.handKeys;
                mouthKey = counted.mouthKey;
            } else {
                hands = 2;
                headed = true;
                bodied = true;
            }
            hands = Math.min(hands, MAX_WEAPON_SLOTS);
            handKeys = handKeys.slice(0, hands);
            // The mouth is the fallback for a body with nothing to grip with,
            // never an extra slot on top of a pair of hands - unless the class
            // is the one that fights with a blade in its teeth, which only
            // needs a mouth to put it in.
            let mouth = hands > 0 ? (mouthed && this.classHasMouthSlot(actor)) : biter;
            if (hands >= MAX_WEAPON_SLOTS) mouth = false;
            return {
                hands, mouth, slots: hands + (mouth ? 1 : 0),
                head: headed, body: bodied,
                handKeys, mouthKey: mouth ? mouthKey : null
            };
        },

        // What a map of body parts amounts to. `actor` is optional and only
        // used to answer for a part that does not carry the flag itself: one
        // built before the flag existed (an older save), or copied by something
        // that did not bring it across, is answered from the archetype the body
        // was built out of rather than being read as a stump.
        count(parts, actor, keepKey) {
            const HC = window.HealthCore;
            let hands = 0, biter = false, mouthed = false, headed = false, bodied = false;
            const handKeys = [];
            let mouthKey = null;
            for (const partKey in parts) {
                const part = parts[partKey];
                if (!part) continue;
                const kind = partKind(partKey);
                // A limb finished in Blood and Oil grips nothing, whether it
                // came off or was ruined where it stands. `keepKey` is the one
                // exception: the limb that has just been finished is counted
                // one last time, so it can be asked which slot was its before
                // the list renumbers (releaseSlotForPart).
                if (partKey !== keepKey && isPartSpent(part)) continue;
                if (kind === 'mouth') mouthed = true;
                else if (kind === 'head') headed = true;
                else if (kind === 'body') bodied = true;
                const holds = part.canHoldWeapon !== undefined
                    ? !!part.canHoldWeapon
                    : !!(HC && HC.canPartHoldWeapon && HC.canPartHoldWeapon(actor, partKey, part));
                if (kind === 'mouth' && !mouthKey) mouthKey = partKey;
                if (!holds) continue;
                if (kind === 'hand') { hands++; handKeys.push(partKey); }
                else if (kind === 'mouth') biter = true;
            }
            return { hands, biter, mouthed, headed, bodied, handKeys, mouthKey };
        },

        // The layout a bare anatomy comes to, for the screens that weigh up a
        // body nobody is wearing yet (the creature wizard's archetype picker).
        layoutForParts(parts) {
            const counted = this.count(parts || {});
            const hands = Math.min(counted.hands, MAX_WEAPON_SLOTS);
            const mouth = hands > 0 ? false : counted.biter;
            return {
                hands, mouth, slots: hands + (mouth ? 1 : 0),
                head: counted.headed, body: counted.bodied,
                handKeys: counted.handKeys.slice(0, hands),
                mouthKey: mouth ? counted.mouthKey : null
            };
        },

        // Arms with nothing on the end of them, which is what a hand has to be
        // grafted onto. Sides are of no interest to the surgeon: a left hand
        // goes on a right arm perfectly well, and a body may have two right
        // arms and no left one, so this is a straight tally.
        bareArms(actor) {
            const parts = (actor && actor._bodyParts) || {};
            let arms = 0, grippers = 0;
            for (const partKey in parts) {
                if (!parts[partKey]) continue;
                if (partKind(partKey) !== 'hand') continue;
                if (isBareArmKey(partKey)) arms++;
                else grippers++;
            }
            return Math.max(0, arms - grippers);
        },

        isBareArmKey,
        // 'hand' | 'mouth' | 'head' | 'body' | null, for the screens that ask
        // about a part the body does not have yet (the prosthetic shop).
        kindOfPart: partKind,

        // Which body part a weapon slot answers for, or null: the hands in the
        // order the anatomy lists them, then the mouth. `keepKey` counts a limb
        // that has just been finished as though it were still whole, which is
        // the only way to ask about a slot that is on its way out.
        partForSlot(actor, slotId, keepKey) {
            if (slotId < 0) return null;
            const layout = this.layout(actor, keepKey);
            if (slotId < layout.handKeys.length) return layout.handKeys[slotId];
            if (layout.mouthKey && slotId === layout.hands) return layout.mouthKey;
            return null;
        },

        // The slot a body part answers for, or -1.
        slotForPart(actor, partKey, keepKey) {
            if (!partKey) return -1;
            const layout = this.layout(actor, keepKey);
            const hand = layout.handKeys.indexOf(partKey);
            if (hand >= 0) return hand;
            if (layout.mouthKey === partKey) return layout.hands;
            return -1;
        },

        // Friendly name of the anatomy body part behind a slot.
        bodyPartName(actor, slotId) {
            const partKey = this.partForSlot(actor, slotId);
            if (partKey) {
                const parts = actor && actor._bodyParts;
                if (parts && parts[partKey] && parts[partKey].name) {
                    const raw = parts[partKey].name;
                    return (typeof T === 'function' ? T(raw) : (window.translateText ? window.translateText(raw) : raw));
                }
                return partKey.replace(/_/g, ' ').toLowerCase();
            }
            if (actor && actor.equipSlots) {
                const slots = actor.equipSlots();
                const etype = slots[slotId];
                if (etype === ETYPE_HEAD) return T('Equip.slotHead');
                const kind = this.slotKind(actor, slotId);
                if (kind === 'clothes') return T('Equip.slotClothes');
                if (kind === 'robe') return T('Equip.slotRobe');
                if (kind === 'armor') return T('Equip.slotArmor');
                if (etype === ETYPE_BODY) return T('Equip.slotBody');
                if (etype === 5) return T('Equip.slotGear');
            }
            return '';
        },

        /**
         * A limb is finished: cut off, or destroyed where it stands. Hand back
         * what THAT limb was carrying, before the slot list renumbers around
         * the loss. Called from Health/Health_Core.js at the moment the part
         * goes, which is why the part itself is still on the body here.
         *
         * A two-handed weapon held across the remaining hands is not this
         * function's business: reconcileHandSlots notices there are no longer
         * two hands to hold it and puts it down as well.
         */
        releaseSlotForPart(actor, partKey) {
            if (!actor || !actor._bodyParts) return;
            const kind = partKind(partKey);
            if (kind !== 'hand' && kind !== 'mouth') return;
            const slotId = this.slotForPart(actor, partKey, partKey);
            if (slotId < 0 || !actor._equips || slotId >= actor._equips.length) return;
            const held = actor.equips()[slotId];
            // The slot goes with the limb, so it is taken OUT of the list
            // rather than emptied: everything behind it moves up a place and
            // the weapon in the other hand stays in the other hand. Emptying
            // it in place would leave the list one slot too long and the next
            // piece along would be read against the wrong slot and dropped.
            actor._equips.splice(slotId, 1);
            if (held) $gameParty.gainItem(held, 1);
            actor.refresh();
        },

        // 'hand', 'mouth', 'clothes', 'robe', 'armor', 'head', 'gear'
        slotKind(actor, slotId) {
            if (slotId < 0 || !actor) return null;
            const layout = this.layout(actor);
            if (slotId < layout.hands) return 'hand';
            if (layout.mouth && slotId === layout.hands) return 'mouth';
            let cur = layout.slots;
            if (layout.head) {
                if (slotId === cur) return 'head';
                cur++;
            }
            if (layout.body) {
                if (slotId === cur) return 'clothes';
                if (slotId === cur + 1) return 'robe';
                if (slotId === cur + 2) return 'armor';
                cur += 3;
            }
            if (slotId === cur) return 'gear';
            if (typeof actor.equipSlots === 'function') {
                const slots = actor.equipSlots();
                if (slotId >= slots.length) return null;
                if (slots[slotId] === ETYPE_HEAD) return 'head';
                if (slots[slotId] === ETYPE_BODY) return 'clothes';
                if (slots[slotId] === 5) return 'gear';
            }
            return null;
        },

        // How many hands an item ties up in that slot. The mouth costs none.
        handCost(kind, item) {
            if (kind !== 'hand' || !item) return 0;
            return isTwoHandedWeapon(item) ? 2 : 1;
        },

        // Hands already committed, optionally ignoring one slot (the one being
        // changed) so a swap is measured against what would be left.
        usedHands(actor, exceptSlot) {
            const layout = this.layout(actor);
            const equips = actor.equips();
            let used = 0;
            for (let i = 0; i < layout.hands; i++) {
                if (i === exceptSlot) continue;
                used += this.handCost('hand', equips[i]);
            }
            return used;
        },

        // Could this slot ever hold this item, hand budget aside? Used when
        // deciding what to give back after the body or the loadout changed.
        slotFits(actor, slotId, item) {
            if (!item) return true;
            const slots = actor.equipSlots();
            if (slotId >= slots.length) return false;
            const kind = this.slotKind(actor, slotId);
            if (kind === 'clothes') {
                return item.etypeId === ETYPE_BODY && item.atypeId === 1;
            }
            if (kind === 'robe') {
                return item.etypeId === ETYPE_BODY && item.atypeId === 2;
            }
            if (kind === 'armor') {
                return item.etypeId === ETYPE_BODY && (item.atypeId === 3 || item.atypeId === 4);
            }
            if (kind === 'head') {
                return item.etypeId === ETYPE_HEAD;
            }
            if (kind === 'gear') {
                return item.etypeId === 5;
            }
            if (!kind || (kind !== 'hand' && kind !== 'mouth')) {
                return item.etypeId === slots[slotId];
            }
            if (!isHeldItem(item)) return false;
            // One hand is one weapon, and a small one at that.
            if (kind === 'hand' && isTwoHandedWeapon(item) && this.layout(actor).hands < 2) return false;
            // Any hand takes any weapon. A class that cannot dual wield is not
            // refused the second one, it is charged for it (dualPenalty).
            return true;
        },

        // ...and is there room for it right now? Deliberately the same
        // question: taking up a two-handed weapon while both hands are full is
        // allowed, and what was in the way is put down for you
        // (reconcileHandSlots). What is refused is only what could never fit,
        // a greatsword on a one-armed body.
        slotAccepts(actor, slotId, item) {
            return this.slotFits(actor, slotId, item);
        },

        // Is there a free hand for this, without anything being put down?
        hasRoomFor(actor, slotId, item) {
            if (!this.slotFits(actor, slotId, item)) return false;
            const kind = this.slotKind(actor, slotId);
            if (kind !== 'hand') return true;
            return this.usedHands(actor, slotId) + this.handCost(kind, item) <= this.layout(actor).hands;
        },

        // The first empty slot that would take this item as things stand, or -1.
        emptySlotFor(actor, item) {
            const equips = actor.equips();
            const slots = actor.equipSlots();
            for (let i = 0; i < slots.length; i++) {
                if (equips[i]) continue;
                if (this.hasRoomFor(actor, i, item)) return i;
            }
            return -1;
        },

        // Best slot for inspecting / equipping an item: empty slot first, or first fitting slot.
        targetSlotFor(actor, item) {
            if (!item || !actor) return -1;
            const empty = this.emptySlotFor(actor, item);
            if (empty >= 0) return empty;
            const slots = actor.equipSlots();
            for (let i = 0; i < slots.length; i++) {
                if (this.slotFits(actor, i, item)) return i;
            }
            return -1;
        },

        // Everything the character is holding, in slot order: weapons and
        // shields alike, which is what the battle overlay puts in frame.
        heldItems(actor) {
            const layout = this.layout(actor);
            const equips = actor.equips();
            const held = [];
            for (let i = 0; i < layout.slots; i++) {
                if (equips[i]) held.push(equips[i]);
            }
            return held;
        },

        // Trim a pool of candidates down to what this slot would take.
        filterPoolForSlot(actor, slotId, pool) {
            return pool.filter(item => this.slotFits(actor, slotId, item));
        }
    };

    // A hand slot is open while it holds something (there is always the option
    // of putting it down) or while a hand is still free.
    const _Game_Actor_isEquipChangeOk_handedness = Game_Actor.prototype.isEquipChangeOk;
    Game_Actor.prototype.isEquipChangeOk = function (slotId) {
        if (!_Game_Actor_isEquipChangeOk_handedness.call(this, slotId)) return false;
        if (HandSlots.slotKind(this, slotId) !== 'hand') return true;
        if (this.equips()[slotId]) return true;
        return HandSlots.usedHands(this, slotId) < HandSlots.layout(this).hands;
    };

    /**
     * Hand back whatever no longer fits: the shield the two-handed sword just
     * displaced, or everything the arm that came off in Blood and Oil was
     * holding. There is no weapon cap to enforce: a hand may always close
     * round a weapon, and an untrained second one is paid for in damage
     * rather than refused. Empties from the last slot forward, so the piece just equipped
     * (`_handKeepSlot`) is never the one taken away.
     */
    Game_Actor.prototype.reconcileHandSlots = function (forcing) {
        const layout = HandSlots.layout(this);
        let guard = MAX_WEAPON_SLOTS + 1;
        while (guard-- > 0) {
            const equips = this.equips();
            // Two-handed budget
            let used = 0;
            for (let i = 0; i < layout.hands; i++) used += HandSlots.handCost('hand', equips[i]);
            if (used > layout.hands) {
                let dropped = -1;
                for (let i = layout.hands - 1; i >= 0; i--) {
                    if (equips[i] && i !== this._handKeepSlot) { dropped = i; break; }
                }
                if (dropped >= 0) {
                    if (forcing) this.forceChangeEquip(dropped, null);
                    else this.changeEquip(dropped, null);
                    continue;
                }
            }
            break;
        }
    };

    window.HandSlots = HandSlots;

    // =============================================================================
    // Equip slots
    // =============================================================================

    Game_Actor.prototype.equipSlots = function () {
        const layout = HandSlots.layout(this);
        // The stock weapon and off-hand slots are replaced wholesale; head,
        // body and gear keep their places behind the hands.
        // Body provides 3 slots: Clothes, Robe, and Armour (Light/Heavy).
        const rest = [];
        const types = (typeof $dataSystem !== 'undefined' && $dataSystem && $dataSystem.equipTypes)
            ? $dataSystem.equipTypes
            : ["", "Weapon", "Off-hand", "Head", "Body", "Gear"];
        for (let i = 3; i < types.length; i++) {
            if (i === ETYPE_HEAD) {
                if (layout.head) rest.push(ETYPE_HEAD);
            } else if (i === ETYPE_BODY) {
                if (layout.body) {
                    rest.push(ETYPE_BODY, ETYPE_BODY, ETYPE_BODY);
                }
            } else {
                rest.push(i);
            }
        }
        const held = [];
        for (let i = 0; i < layout.slots; i++) held.push(ETYPE_WEAPON);
        return held.concat(rest);
    };

    // The name the equip screen prints beside a slot.
    Game_Actor.prototype.equipSlotName = function (slotId) {
        const kind = HandSlots.slotKind(this, slotId);
        if (kind === 'mouth') return T('Equip.slotMouth');
        if (kind === 'hand') {
            const hands = HandSlots.layout(this).hands;
            if (hands === 1) return T('Equip.slotHand');
            if (slotId === 0) return T('Equip.slotMainHand');
            if (slotId === 1) return T('Equip.slotOffHand');
            return T('Equip.slotExtraHand', { n: slotId + 1 });
        }
        if (kind === 'clothes') return T('Equip.slotClothes');
        if (kind === 'robe') return T('Equip.slotRobe');
        if (kind === 'armor') return T('Equip.slotArmor');
        return $dataSystem.equipTypes[this.equipSlots()[slotId]] || '';
    };

    Game_Actor.prototype.emptySlotFor = function (item) {
        return HandSlots.emptySlotFor(this, item);
    };

    // A shield in a hand slot is a slot type that does not match the item's
    // own, which is the one thing the stock changeEquip refuses to do.
    const _Game_Actor_changeEquip = Game_Actor.prototype.changeEquip;
    Game_Actor.prototype.changeEquip = function (slotId, item) {
        if (!this._equips) this._equips = [];
        if (slotId >= 0) {
            while (this._equips.length <= slotId) this._equips.push(new Game_Item());
        }
        if (!HandSlots.slotAccepts(this, slotId, item)) return;
        this._handKeepSlot = slotId;
        try {
            if (item && this.equipSlots()[slotId] !== item.etypeId) {
                if (this.tradeItemWithParty(item, this.equips()[slotId])) {
                    this._equips[slotId].setObject(item);
                    this.refresh();
                }
            } else {
                _Game_Actor_changeEquip.call(this, slotId, item);
            }
            this.reconcileHandSlots(false);
        } finally {
            this._handKeepSlot = -1;
        }
        this.saveCustomStatsToVariables();
    };

    const _Game_Actor_forceChangeEquip = Game_Actor.prototype.forceChangeEquip;
    Game_Actor.prototype.forceChangeEquip = function (slotId, item) {
        if (!this._equips) this._equips = [];
        if (slotId >= 0) {
            while (this._equips.length <= slotId) this._equips.push(new Game_Item());
        }
        this._handKeepSlot = slotId;
        try {
            _Game_Actor_forceChangeEquip.call(this, slotId, item);
            this.reconcileHandSlots(true);
        } finally {
            this._handKeepSlot = -1;
        }
        this.saveCustomStatsToVariables();
    };

    // Runs on every refresh, so it is also what notices that a hand is gone.
    Game_Actor.prototype.releaseUnequippableItems = function (forcing) {
        if (this._releasingHeld) return;
        this._releasingHeld = true;
        try {
            if (!this._equips) this._equips = [];
            const slots = this.equipSlots();
            while (this._equips.length < slots.length) {
                this._equips.push(new Game_Item());
            }
            for (;;) {
                let changed = false;
                const equips = this.equips();
                for (let i = 0; i < equips.length; i++) {
                    const item = equips[i];
                    if (!item) continue;
                    if (this.canEquip(item) && HandSlots.slotFits(this, i, item)) continue;
                    if (forcing) this.forceChangeEquip(i, null);
                    else this.changeEquip(i, null);
                    changed = true;
                }
                if (!changed) break;
            }
            this.reconcileHandSlots(forcing);
        } finally {
            this._releasingHeld = false;
        }
    };

    // Starting gear is listed in the stock slot order (weapon, off-hand, head,
    // body, gear). Hands changed how many slots come first, so every piece is
    // placed by what it is rather than by where it sat.
    Game_Actor.prototype.initEquips = function (equips) {
        const slots = this.equipSlots();
        this._equips = [];
        for (let i = 0; i < slots.length; i++) this._equips[i] = new Game_Item();
        for (let j = 0; j < (equips || []).length; j++) {
            const id = equips[j];
            if (!id) continue;
            const item = j === 0 ? $dataWeapons[id] : $dataArmors[id];
            if (!item) continue;
            const slot = HandSlots.emptySlotFor(this, item);
            if (slot >= 0) this._equips[slot].setObject(item);
        }
        this.releaseUnequippableItems(true);
        this.refresh();
    };

    // =============================================================================
    // Core Actor Custom Stats Engine (Variable Persistency Sync)
    // =============================================================================

    Game_Actor.prototype.calculateCustomStats = function () {
        const equips = this.equips();
        const statContributions = { arcane: 0, substance: 0, stealth: 0, intimidation: 0 };
        let totalRelevantPieces = 0;

        for (let i = 0; i < equips.length; i++) {
            const item = equips[i];
            if (!item) continue;

            if (DataManager.isWeapon(item)) {
                totalRelevantPieces++;
                switch (item.wtypeId) {
                    case 1: statContributions.stealth++;       break; // Dagger
                    case 2: statContributions.intimidation++;  break; // Sword
                    case 3: statContributions.intimidation++;  break; // Heavy
                    case 4: statContributions.intimidation++;  break; // Axe
                    case 5: statContributions.substance++;     break; // Whip
                    case 6: statContributions.arcane++;        break; // Staff
                    case 7: statContributions.stealth++;       break; // Bow
                    case 8: statContributions.substance++;     break; // Projectile
                    case 9: statContributions.substance++;     break; // Gun
                    case 10: statContributions.intimidation++; break; // Claw
                }
            } else if (DataManager.isArmor(item)) {
                const atypeId = item.atypeId;
                if (atypeId >= 1 && atypeId <= 4) {
                    totalRelevantPieces++;
                    switch (atypeId) {
                        case 1: statContributions.substance++; statContributions.stealth++; break; // Clothes
                        case 2: statContributions.arcane++;        break; // Robe
                        case 3: statContributions.stealth++;       break; // Light Armor
                        case 4: statContributions.intimidation++;  break; // Heavy Armor
                    }
                }
            }
        }

        const stats = { arcane: 0, substance: 0, stealth: 0, intimidation: 0 };
        if (totalRelevantPieces > 0) {
            stats.arcane       = Math.round((statContributions.arcane       / totalRelevantPieces) * 100);
            stats.substance    = Math.round((statContributions.substance    / totalRelevantPieces) * 100);
            stats.stealth      = Math.round((statContributions.stealth      / totalRelevantPieces) * 100);
            stats.intimidation = Math.round((statContributions.intimidation / totalRelevantPieces) * 100);
        }
        return stats;
    };

    Game_Actor.prototype.saveCustomStatsToVariables = function () {
        const stats   = this.calculateCustomStats();
        const actorId = this.actorId();
        if (actorId === 1) {
            $gameActors.actor(1).setPvArcane(stats.arcane);
            $gameActors.actor(1).setPvSubstance(stats.substance);
            $gameActors.actor(1).setPvStealth(stats.stealth);
            $gameActors.actor(1).setPvIntimidation(stats.intimidation);
        } else if (actorId === 2) {
            $gameActors.actor(2).setPvArcane(stats.arcane);
            $gameActors.actor(2).setPvSubstance(stats.substance);
            $gameActors.actor(2).setPvStealth(stats.stealth);
            $gameActors.actor(2).setPvIntimidation(stats.intimidation);
        } else if (actorId === 3) {
            $gameActors.actor(3).setPvArcane(stats.arcane);
            $gameActors.actor(3).setPvSubstance(stats.substance);
            // Actor 3's last two stats used to be dumped into Variables 131 and
            // 132, left over from before the pv* actor fields existed. 131 is
            // the police heat (CrimeSystem), so every equip change re-wrote the
            // party's wanted level to actor 3's stealth percentage and the
            // police were after a party that had never committed a crime.
            $gameActors.actor(3).setPvStealth(stats.stealth);
            $gameActors.actor(3).setPvIntimidation(stats.intimidation);
        }
    };


    Game_Actor.prototype.randomEquipments = function () {
        const maxSlots = this.equipSlots().length;
        this.clearEquipments();
        for (let i = 0; i < maxSlots; i++) {
            if (this.isEquipChangeOk(i)) this.changeEquip(i, this.randomEquipItem(i));
        }
    };

    // Everything the party owns that this slot would take. A hand slot takes
    // weapons and shields alike, which is the whole point of the hand model.
    Game_Actor.prototype.slotCandidates = function (slotId) {
        const kind = HandSlots.slotKind(this, slotId);
        // Only a hand (or the mouth) takes weapons. Every other slot is offered
        // the party's armour and narrowed by slotFits, which is the one place
        // that knows a Clothes slot from a Robe slot from an Armour slot: all
        // three carry the same equip type and differ only by armour type.
        const held = kind === 'hand' || kind === 'mouth';
        const pool = held
            ? $gameParty.weapons().concat($gameParty.armors().filter(a => a.etypeId === ETYPE_OFFHAND))
            : $gameParty.armors();
        return pool.filter(item => this.canEquip(item) && HandSlots.slotFits(this, slotId, item));
    };

    Game_Actor.prototype.randomEquipItem = function (slotId) {
        const itemList = this.slotCandidates(slotId);
        if (itemList.length === 0) return null;
        return itemList[Math.floor(Math.random() * itemList.length)];
    };

    // =============================================================================
    // Weapon proficiency
    // =============================================================================
    //
    // Classes no longer gate which weapons can be picked up: anyone may equip
    // anything. What a class knows is expressed as a specialization level in the
    // "Weapons" category of js/db/Skills/Specialization.json (one entry per
    // weapon type, tagged with its wtypeId). A class starts at Intermediate
    // (level 3) in the weapon types it used to be restricted to, Untrained in
    // the rest.
    //
    // Below Intermediate a weapon fights at a fraction of its listed stats; at
    // Intermediate it applies in full; above it gains a small bonus. Winning
    // battles with a weapon equipped trains its proficiency, so an untrained
    // weapon carried long enough eventually performs normally.

    const PROFICIENT_LEVEL = 3;
    const LEVEL_MULTIPLIER = [1, 1 / 3, 2 / 3, 1, 1.1, 1.25]; // indexed by level
    const BATTLE_EXP = 1;

    // The same five tiers read as a letter grade on the equip screen, next to
    // the stat the weapon scales on: Untrained F, Beginner D, Intermediate C
    // (the tier where the weapon finally performs as listed), Advanced B,
    // Master S. Indexed by level, so index 0 is never reached.
    // i18n-ignore-start  letter grades, not words
    const LEVEL_GRADE = ['F', 'F', 'D', 'C', 'B', 'S'];
    // i18n-ignore-end

    const WeaponProficiency = {
        PROFICIENT_LEVEL,

        // wtypeId is the cheap weapon test: DataManager.isWeapon scans the whole
        // weapon database, and this runs inside paramPlus.
        specFor(weapon) {
            if (!weapon || !weapon.wtypeId) return null;
            const db = window.Specializations;
            return db && db.ready ? db.forWtype(weapon.wtypeId) : null;
        },

        // Anything without proficiency data (Specialization.json still loading,
        // or a weapon type with no specialization) counts as proficient, so
        // nothing is ever penalised for missing data.
        levelFor(actor, weapon) {
            const spec = this.specFor(weapon);
            if (!spec || !actor || !actor.specializationLevel) return PROFICIENT_LEVEL;
            return actor.specializationLevel(spec.id);
        },

        multiplierForLevel(level) {
            const clamped = Math.max(1, Math.min(LEVEL_MULTIPLIER.length - 1, level));
            return LEVEL_MULTIPLIER[clamped];
        },

        multiplier(actor, weapon) {
            return this.multiplierForLevel(this.levelFor(actor, weapon));
        },

        isUntrained(actor, weapon) {
            return this.levelFor(actor, weapon) < PROFICIENT_LEVEL;
        },

        // The one ordering every automatic weapon pick uses: what the wielder
        // can actually use comes first, and only then does raw power decide.
        // Proficient weapons outrank untrained ones however good the untrained
        // one looks on paper; inside each group the higher tier wins ties, and
        // among equals the better performing weapon does.
        rankFor(actor, weapon) {
            const level = this.levelFor(actor, weapon);
            return { proficient: level >= PROFICIENT_LEVEL ? 1 : 0, level };
        },

        // Negative when `a` should be offered before `b`, so it drops straight
        // into Array#sort.
        compare(actor, a, b) {
            const ra = this.rankFor(actor, a);
            const rb = this.rankFor(actor, b);
            if (ra.proficient !== rb.proficient) return rb.proficient - ra.proficient;
            if (ra.level !== rb.level) return rb.level - ra.level;
            return 0;
        },

        // Letter grade of the wielder's proficiency with this weapon, F to S.
        gradeFor(actor, weapon) {
            const level = Math.max(1, Math.min(LEVEL_GRADE.length - 1, this.levelFor(actor, weapon)));
            return LEVEL_GRADE[level];
        },

        levelNameFor(actor, weapon) {
            const db = window.Specializations;
            if (!db || !db.ready) return '';
            return db.levelName(this.levelFor(actor, weapon));
        },

        // One point per battle won for each distinct weapon type carried.
        rewardBattle() {
            if (!$gameParty || !window.Specializations || !window.Specializations.ready) return;
            $gameParty.battleMembers().forEach(actor => {
                if (!actor || !actor.isAlive() || !actor.gainSpecializationExp) return;
                const trained = [];
                actor.equips().forEach(item => {
                    const spec = this.specFor(item);
                    if (!spec || trained.includes(spec.id)) return;
                    trained.push(spec.id);
                    // Through the shared award service, so the toast matches
                    // the rest of the game. `soloist` is the point here: only
                    // the hand that swung the weapon learns it, no share to
                    // the party members who merely watched it happen.
                    if (window.SpecializationXP) {
                        window.SpecializationXP.award(spec, BATTLE_EXP, { actor, soloist: true });
                    } else {
                        actor.gainSpecializationExp(spec.id, BATTLE_EXP);
                    }
                });
            });
        }
    };

    // Any class may equip any weapon type; proficiency handles the rest.
    Game_BattlerBase.prototype.isEquipWtypeOk = function (/* wtypeId */) {
        return true;
    };

    // ...and any armour type. Which slot a piece belongs in is decided by
    // HandSlots.slotFits, which tells clothes from robe from armour by armour
    // type, not by the class. Leaving the stock trait check in place meant 71
    // of the 77 classes could wear nothing at all: they carry no armour-type
    // trait, so the head, body and gear slots came up empty on the bench and
    // an armour picked from the bag was refused without a word.
    Game_BattlerBase.prototype.isEquipAtypeOk = function (/* atypeId */) {
        return true;
    };

    // How an armful of weapons adds up.
    //
    // One or two of them stack the way they always have. Past that the arsenal
    // stops being a sum and becomes a median: eight swords make a character no
    // stronger than the typical sword among them, which is what keeps a body
    // with six arms from being six times a body with two. Each weapon is
    // measured after its wielder's proficiency has been applied, so an
    // untrained blade drags the middle of the pile down.
    function medianOf(values) {
        if (!values.length) return 0;
        const sorted = values.slice().sort((a, b) => a - b);
        const mid = sorted.length >> 1;
        return sorted.length % 2
            ? sorted[mid]
            : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    }

    // Applied as a delta on top of the stock paramPlus sum so it stacks cleanly
    // with the other paramPlus wrappers (item modifiers, diseases).
    //
    // A second weapon in the hands of a class that was never trained for it
    // costs both of them a third of their strength (HandSlots.dualPenalty):
    // the whole point of the Dual Wield classes is that they do not pay it.
    Game_Actor.prototype.weaponParamDelta = function (paramId) {
        const equips = this.equips();
        let raw = 0;
        const scaled = [];
        let carried = 0;
        for (let i = 0; i < equips.length; i++) {
            const item = equips[i];
            if (item && item.wtypeId) carried++;
        }
        const penalty = HandSlots.dualPenalty(this, carried);
        for (let i = 0; i < equips.length; i++) {
            const item = equips[i];
            if (!item || !item.wtypeId || !item.params) continue;
            const base = item.params[paramId] || 0;
            raw += base;
            scaled.push(Math.round(base * WeaponProficiency.multiplier(this, item) * penalty));
        }
        if (!scaled.length) return 0;
        const total = scaled.length > 2
            ? medianOf(scaled)
            : scaled.reduce((sum, value) => sum + value, 0);
        return total - raw;
    };

    const _Game_Actor_paramPlus_proficiency = Game_Actor.prototype.paramPlus;
    Game_Actor.prototype.paramPlus = function (paramId) {
        return _Game_Actor_paramPlus_proficiency.call(this, paramId) + this.weaponParamDelta(paramId);
    };

    // "Optimize" scores candidates by raw parameters, which would happily hand a
    // character a powerful weapon they cannot use. Score weapons by what they
    // would actually deliver in that character's hands instead.
    const _Game_Actor_calcEquipItemPerformance = Game_Actor.prototype.calcEquipItemPerformance;
    Game_Actor.prototype.calcEquipItemPerformance = function (item) {
        const performance = _Game_Actor_calcEquipItemPerformance.call(this, item);
        if (!item || !item.wtypeId) return performance;
        return Math.round(performance * WeaponProficiency.multiplier(this, item));
    };

    // Scoring alone is not enough: a legendary weapon the character is untrained
    // with can still outscore every trained one they own. "Optimize" therefore
    // ignores weapons below Intermediate outright, and only falls back to the
    // untrained pool when the character owns nothing they are proficient with.
    // "Random" is deliberately left alone, it may still pick anything.
    const _Game_Actor_bestEquipItem = Game_Actor.prototype.bestEquipItem;
    Game_Actor.prototype.bestEquipItem = function (slotId) {
        const kind = HandSlots.slotKind(this, slotId);
        if (kind !== 'hand' && kind !== 'mouth') {
            const items = this.slotCandidates(slotId);
            let bestItem = null;
            let bestPerformance = -1000;
            for (const item of items) {
                const performance = this.calcEquipItemPerformance(item);
                if (performance > bestPerformance) {
                    bestPerformance = performance;
                    bestItem = item;
                }
            }
            return bestItem;
        }

        // Optimize never talks a character into a penalty. A class that dual
        // wields gets a weapon in every hand; a class that does not is given
        // one weapon and offered a shield for the rest, which is what the
        // player would have to give up a third of their damage to change by
        // hand.
        let items = this.slotCandidates(slotId);
        if (kind === 'hand' && !HandSlots.hasDualWield(this)) {
            const elsewhere = HandSlots.weaponCountInHands(this, slotId);
            if (elsewhere >= HandSlots.freeWeapons(this)) {
                items = items.filter(item => !item.wtypeId);
            }
        } else if (kind === 'hand' && HandSlots.layout(this).hands >= 2) {
            // A dual wielder ends up with a blade in each hand rather than one
            // greatsword across both, so a two-handed weapon is only picked
            // when there is nothing one-handed to pick.
            const oneHanded = items.filter(item => !HandSlots.isTwoHanded(item));
            if (oneHanded.length) items = oneHanded;
        }
        if (!items.length) return null;
        const trained = items.filter(item => !WeaponProficiency.isUntrained(this, item));
        // Nothing trained in the pack means the character has to make do, and
        // then the least unfamiliar weapon leads: Beginner before Untrained.
        const pool = trained.length > 0 ? trained : items;

        let bestItem = null;
        let bestPerformance = -1000;
        for (const item of pool) {
            const performance = this.calcEquipItemPerformance(item);
            if (!bestItem) {
                bestItem = item;
                bestPerformance = performance;
                continue;
            }
            const rank = WeaponProficiency.compare(this, item, bestItem);
            if (rank < 0 || (rank === 0 && performance > bestPerformance)) {
                bestItem = item;
                bestPerformance = performance;
            }
        }
        return bestItem;
    };

    // =============================================================================
    // Which weapons swing this turn
    // =============================================================================
    //
    // Nobody swings six weapons at once. A character carrying more than two
    // fights each turn with two of them, drawn at random when the turn is
    // handed to them (makeActions), so an arsenal reads as variety - a
    // different pair of elements, attack skills and sounds every round -
    // rather than as raw multiplication. Their traits are the only weapon
    // traits that apply for that turn; the stats they add are already the
    // median of the whole armful (weaponParamDelta, above), so the roll never
    // moves the character's numbers, only what the numbers are made of.
    //
    // Carrying one or two weapons is untouched: both are always active.

    Game_Actor.prototype.rollTurnWeapons = function () {
        const count = this.allWeapons().length;
        if (count <= 2) {
            this._turnWeaponIndexes = null;
            return;
        }
        const first = Math.floor(Math.random() * count);
        let second = Math.floor(Math.random() * (count - 1));
        if (second >= first) second++;
        this._turnWeaponIndexes = [first, second];
    };

    const _Game_Actor_weapons_all = Game_Actor.prototype.weapons;

    /** Every weapon the character has equipped, however many hands they have. */
    Game_Actor.prototype.allWeapons = function () {
        return _Game_Actor_weapons_all.call(this);
    };

    /** The two drawn for this turn (or all of them, when there are two or fewer). */
    Game_Actor.prototype.activeWeapons = function () {
        const weapons = this.allWeapons();
        if (weapons.length <= 2) return weapons;
        const picked = this._turnWeaponIndexes;
        if (!picked) return weapons.slice(0, 2);
        const chosen = [];
        for (const index of picked) {
            if (weapons[index]) chosen.push(weapons[index]);
        }
        return chosen.length ? chosen : weapons.slice(0, 2);
    };

    // In a fight, "the weapons you are holding" means the pair being swung this
    // turn: the attack motion, the attack animations, the sounds and the models
    // in frame all read this, and all of them are about the blow being struck.
    // Out of battle nothing is drawn and the whole armful answers.
    Game_Actor.prototype.weapons = function () {
        const weapons = this.allWeapons();
        if (weapons.length <= 2) return weapons;
        if (typeof $gameParty === 'undefined' || !$gameParty || !$gameParty.inBattle()) return weapons;
        return this.activeWeapons();
    };

    const _Game_Actor_makeActions_weapons = Game_Actor.prototype.makeActions;
    Game_Actor.prototype.makeActions = function () {
        this.rollTurnWeapons();
        _Game_Actor_makeActions_weapons.call(this);
    };

    const _Game_Actor_onBattleStart_weapons = Game_Actor.prototype.onBattleStart;
    Game_Actor.prototype.onBattleStart = function (advantageous) {
        this.rollTurnWeapons();
        _Game_Actor_onBattleStart_weapons.call(this, advantageous);
    };

    // Only the pair in hand this turn contributes its elements, its attack
    // skill and its parameter rates. Shields and armour are never touched, and
    // a character carrying two weapons or fewer skips the filter entirely.
    const _Game_Actor_traitObjects_weapons = Game_Actor.prototype.traitObjects;
    Game_Actor.prototype.traitObjects = function () {
        const objects = _Game_Actor_traitObjects_weapons.call(this);
        if (this.allWeapons().length <= 2) return objects;
        const active = this.activeWeapons();
        return objects.filter(object => !(object && object.wtypeId) || active.includes(object));
    };

    // =============================================================================
    // Training the weapons in hand
    // =============================================================================
    //
    // Winning a fight teaches every weapon type carried (rewardBattle). Landing
    // a blow teaches the ones that actually swung, which is what makes an
    // untrained weapon worth persevering with: the pair drawn for the turn is
    // credited, not the whole armful. Capped per in-game day like every other
    // repeatable activity, so a character cannot grind proficiency on a
    // training dummy.

    const ATTACK_EXP = 0.5;

    WeaponProficiency.rewardAttack = function (actor) {
        if (!actor || !actor.isActor || !actor.isActor()) return;
        if (!window.Specializations || !window.Specializations.ready) return;
        const trained = [];
        for (const weapon of actor.activeWeapons()) {
            const spec = this.specFor(weapon);
            if (!spec || trained.includes(spec.id)) continue;
            trained.push(spec.id);
            if (window.SpecializationXP) {
                window.SpecializationXP.awardCapped(spec, ATTACK_EXP, { actor, soloist: true });
            } else if (actor.gainSpecializationExp) {
                actor.gainSpecializationExp(spec.id, ATTACK_EXP);
            }
        }
    };

    const _BattleManager_startAction_proficiency = BattleManager.startAction;
    BattleManager.startAction = function () {
        const subject = this._subject;
        const action = subject && subject.currentAction && subject.currentAction();
        if (action && (action.isAttack() || action.isPhysical())) {
            WeaponProficiency.rewardAttack(subject);
        }
        _BattleManager_startAction_proficiency.call(this);
    };

    const _BattleManager_processVictory_proficiency = BattleManager.processVictory;
    BattleManager.processVictory = function () {
        WeaponProficiency.rewardBattle();
        _BattleManager_processVictory_proficiency.call(this);
    };

    Game_Actor.prototype.getWeaponScalingType = function (weapon) {
        if (!weapon || !DataManager.isWeapon(weapon)) return null;
        const note = (weapon.note || '');
        const scales = [];
        const regex = /<Scale:\s*([^>]+)>/gi;
        let match;
        while ((match = regex.exec(note)) !== null) {
            const parts = match[1].split(',').map(s => s.trim().toUpperCase());
            scales.push(...parts);
        }
        if (scales.length === 0 && weapon.meta && weapon.meta.Scale) {
            scales.push(...String(weapon.meta.Scale).split(',').map(s => s.trim().toUpperCase()));
        }
        if (scales.includes('STR') && scales.includes('DEX')) return 'MIX';
        if (scales.includes('STR') && scales.includes('INT')) return 'ARC';
        if (scales.includes('MIX')) return 'MIX';
        if (scales.includes('ARC')) return 'ARC';
        if (scales.includes('DEX')) return 'DEX';
        if (scales.includes('INT')) return 'INT';
        if (scales.includes('WIS')) return 'WIS';
        if (scales.includes('CON')) return 'CON';
        if (scales.includes('PSI')) return 'PSI';
        if (scales.includes('STR')) return 'STR';
        return 'STR';
    };

    // Expose to UI layer
    window.WeaponProficiency = WeaponProficiency;
    window.EquipI18n   = i18n;
    window.EquipParams = {
        enableSwitching: parameters['enableSwitching'] === 'true',
        switchSound:     parameters['switchSound'] === 'true'
    };
})();
