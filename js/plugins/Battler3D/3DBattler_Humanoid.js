//=============================================================================
// 3D Battler System - Humanoid Family
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Humanoid procedural 3D battlers (goblin/hobgoblin/orc/ogre/
 * skeleton/undead). Requires 3DBattlerSystem (core) to load first.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * ============================================================================
 * 3D Battler - Humanoid Family
 * ============================================================================
 *
 * Provides the biped body plan (head, torso, two arms, two legs) that every
 * humanoid archetype shares. This is the canonical "goblin" rig: kinematic
 * FK arm/leg animation, weapon mesh, facial animation and the dismemberment
 * cascade inherited from window.Battler3D.Base.
 *
 * Registered archetypes (match by <Archetype: X> meta or by a name keyword):
 *   Goblin, Hobgoblin, Orc, Ogre, Skeleton, Undead
 *
 * Skeleton and Undead are profile reskins of the same biped rig, so they keep
 * the exact part-losing behaviour. Their body-part keys (HEAD/TORSO/LEFT_ARM/
 * ...) and the goblin's detailed keys (SKULL/RIBCAGE/LEFT_UPPER_ARM/...) are
 * both mapped, so either Health archetype schema dismembers correctly.
 *
 * MUST load AFTER BattleSystem/3DBattlerSystem.
 */

(() => {
    'use strict';

    if (typeof THREE === 'undefined') return;
    if (!window.Battler3D || !window.Battler3D.Base) {
        console.error('[3D Battler Humanoid] Core (3DBattlerSystem) not loaded first.');
        return;
    }

    const Base = window.Battler3D.Base;
    const debugLog = window.Battler3D.debugLog || function () {};

    // Weapon types animated with the fast/short swing arc (dagger, claw, ...).
    const LIGHT_WEAPONS = [1, 8, 10, 11];

    // ── MOUTH SHAPE BANK (see _buildMouth) ──────────────────────────────────
    // Every humanoid used to wear the same flat dark circle. Goblinoids now draw
    // a shape from this bank, hashed off their species identity, so no two
    // goblin ids share a face. Anything else keeps 'round' (the old look).
    const MOUTH_STYLES = [
        'round', 'wide', 'slit', 'grin', 'snaggle', 'underbite', 'sneer',
        'frown', 'gape', 'toothy', 'pucker', 'lopsided', 'gaptooth', 'drool',
        'stitched', 'tusker'
    ];

    // ── STANDING HEIGHT (see _normalizeHeight) ──────────────────────────────
    // World units of standing height per unit of profile scale. The humanoid
    // family never ran the core's fit clamp, so the per-id size multiplier left
    // goblins of one species nearly twice as tall as each other and the tallest
    // ones overflowed the battle view. Goblinoid profiles are given a target
    // height off this factor instead and the model is rescaled onto it.
    const GOBLIN_HEIGHT_PER_SCALE = 1.20;

    // Where the top of the shared rig sits at scale 1: torso 1.1, head riding
    // 0.65 over it, and the head's own 0.35 of radius above that. This is what
    // _normalizeHeight measures a profile's top at, so a profile's real build
    // scale is its standHeight divided by this - which is the number the
    // overworld needs to stand the same creature on real ground beside a party
    // (see worldScale below).
    const HEAD_Y   = 1.75;
    const RIG_TOP  = HEAD_Y + 0.35;

    // Hair (see _applyHair): surfaces that never grow it, and the gear pieces
    // that already cover the scalp.
    const BALD_POOLS = ['bone', 'metal', 'stone'];
    const HEADGEAR_KEYS = ['helmet', 'hornhelm', 'hood', 'crown', 'headwrap',
                           'bonemask', 'skullmask', 'gnomehat'];

    // ── Shared arm-IK scratch (reused every frame, never allocate in the loop) ─
    // The attack pose is solved as a real 2-DOF shoulder (pitch + abduction) plus
    // a 1-DOF elbow hinge so the fist travels a lateral punch arc instead of the
    // forearm folding flat into a stiff raised-arm "salute".
    const _AX_X = new THREE.Vector3(1, 0, 0);
    const _AX_Z = new THREE.Vector3(0, 0, 1);
    const _V_UP = new THREE.Vector3(0, 1, 0);
    const _V_DOWN = new THREE.Vector3(0, -1, 0);
    const _qAb = new THREE.Quaternion(), _qPi = new THREE.Quaternion();
    const _qSh = new THREE.Quaternion(), _qEl = new THREE.Quaternion(), _qLimb = new THREE.Quaternion();
    const _upDir = new THREE.Vector3(), _foreDir = new THREE.Vector3(), _hinge = new THREE.Vector3(), _neg = new THREE.Vector3();

    // The two forward-kinematics helpers below used to be built inside
    // animatePose, which meant two fresh closures per humanoid per frame for
    // functions that close over nothing but the module scratch objects above.
    // They are pure arithmetic on the meshes they are handed, so they live out
    // here and are built once.
    // ── FK HELPER ────────────────────────────────────────────────────
    function fk(mesh, ox, oy, oz, angle, len) {
        const ca = Math.cos(angle), sa = Math.sin(angle);
        if (mesh && mesh.visible) {
            mesh.position.set(ox, oy - len * 0.5 * ca, oz + len * 0.5 * sa);
            mesh.rotation.set(-angle, 0, 0);
        }
        return { x: ox, y: oy - len * ca, z: oz + len * sa };
    }

    // 2-DOF shoulder (pitch forward, abduct out to the side) + 1-DOF elbow
    // hinge. `side` is +1 for the right arm, -1 for the left (abduction
    // swings the elbow AWAY from the torso). Poses both cylinders with
    // quaternions so the elbow is a genuine hinge and the whole arm can
    // punch laterally. Writes _foreDir (world forward of the forearm, used
    // to align a held weapon) and returns the wrist position.
    function fk2(upper, fore, hand, sx, sy, sz, pitch, abduct, elbow, side, upLen, foreLen) {
        // Shoulder: abduct about Z, then pitch about X (forward is +Z).
        _qAb.setFromAxisAngle(_AX_Z, side * abduct);
        _qPi.setFromAxisAngle(_AX_X, -pitch);
        _qSh.copy(_qPi).multiply(_qAb);
        _upDir.copy(_V_DOWN).applyQuaternion(_qSh);           // shoulder -> elbow
        const ex = sx + _upDir.x * upLen, ey = sy + _upDir.y * upLen, ez = sz + _upDir.z * upLen;
        if (upper && upper.visible) {
            upper.position.set(sx + _upDir.x * upLen * 0.5, sy + _upDir.y * upLen * 0.5, sz + _upDir.z * upLen * 0.5);
            upper.quaternion.setFromUnitVectors(_V_UP, _neg.copy(_upDir).negate());
        }
        // Elbow hinge about the upper arm's local lateral axis (fold forward).
        _hinge.copy(_AX_X).applyQuaternion(_qSh);
        _qEl.setFromAxisAngle(_hinge, -elbow);
        _foreDir.copy(_upDir).applyQuaternion(_qEl);          // elbow -> wrist
        const wx = ex + _foreDir.x * foreLen, wy = ey + _foreDir.y * foreLen, wz = ez + _foreDir.z * foreLen;
        if (fore && fore.visible) {
            fore.position.set(ex + _foreDir.x * foreLen * 0.5, ey + _foreDir.y * foreLen * 0.5, ez + _foreDir.z * foreLen * 0.5);
            fore.quaternion.setFromUnitVectors(_V_UP, _neg.copy(_foreDir).negate());
        }
        if (hand && hand.visible) hand.position.set(wx, wy - 0.05, wz + 0.02);
        return { x: wx, y: wy, z: wz };
    }

    //=========================================================================
    // Humanoid creature profiles (visual only; the rig keeps goblin dimensions)
    //=========================================================================
    // Bulk/head/ear/nose factors radially scale meshes so FK chains stay
    // aligned. texture overlays grain on top of the HSL skin tint.
    const CREATURE_PROFILES = {
        goblin: {
            scale: 2.5, bodyBulk: 1.0, headScale: 1.0, earScale: 1.0, noseScale: 1.0, earType: 'pointed',
            fangs: 0, slouch: 0.0, texture: 'olive_leather_stone.jpg',
            hue: [0.30, 0.10], sat: [0.65, 0.25], lit: [0.38, 0.14]
        },
        hobgoblin: {
            scale: 2.6, bodyBulk: 1.12, headScale: 1.0, earScale: 0.9, noseScale: 1.0, earType: 'pointed',
            fangs: 1, slouch: 0.05, texture: 'golden_brown_leather.jpg',
            hue: [0.02, 0.04], sat: [0.85, 0.15], lit: [0.32, 0.12]
        },
        // Orcs: taller, broad, upright and humanoid, muscular green, small tusks.
        orc: {
            scale: 3.1, bodyBulk: 1.28, headScale: 0.95, earScale: 0.5, noseScale: 0.55, earType: 'pointed',
            fangs: 1, slouch: 0.0, texture: 'mossy_green_rock.jpg',
            hue: [0.27, 0.05], sat: [0.50, 0.20], lit: [0.30, 0.10]
        },
        // Ogres: huge, hunched, monstrous, oversized head with big jutting fangs.
        ogre: {
            scale: 4.2, bodyBulk: 1.55, headScale: 1.3, earScale: 0.55, noseScale: 0.8,
            fangs: 2, slouch: 0.20, texture: 'brown_leather_stone.jpg',
            hue: [0.07, 0.04], sat: [0.28, 0.18], lit: [0.42, 0.12]
        },
        // Skeletons: thin, bone-white, small ears/nose, no fangs.
        skeleton: {
            scale: 2.5, bodyBulk: 0.68, headScale: 1.0, earScale: 0.3, noseScale: 0.4,
            fangs: 0, slouch: 0.05, texture: 'brown_leather_stone.jpg',
            hue: [0.11, 0.04], sat: [0.10, 0.06], lit: [0.82, 0.10]
        },
        // ── Bespoke skeleton splits (floating-skull themed reskins) ────────
        // Giggling Skull: oversized bright bone head, tiny gaunt body, manic.
        hmn_gigglingskull: {
            scale: 2.4, bodyBulk: 0.52, headScale: 1.35, earScale: 0.2, noseScale: 0.35,
            fangs: 0, weapon: 0, slouch: 0.02, texturePool: 'bone', gear: ['bonenecklace'],
            hue: [0.13, 0.03], sat: [0.10, 0.05], lit: [0.88, 0.08]
        },
        // Death's Head: dark-energy-wreathed grey skull with a hooded shroud.
        hmn_deathshead: {
            scale: 2.5, bodyBulk: 0.60, headScale: 1.28, earScale: 0.2, noseScale: 0.35,
            fangs: 0, weapon: 0, slouch: 0.06, texturePool: 'bone', emissive: 0x120022, gear: ['hood'],
            hue: [0.72, 0.05], sat: [0.10, 0.06], lit: [0.60, 0.10]
        },
        // Skull Keeper: multidimensional warden, crowned, faint self-glow.
        hmn_skullkeeper: {
            scale: 2.6, bodyBulk: 0.66, headScale: 1.25, earScale: 0.2, noseScale: 0.35,
            fangs: 0, weapon: 0, slouch: 0.0, texturePool: 'bone', emissive: 0x102233, gear: ['crown', 'cape'],
            hue: [0.55, 0.05], sat: [0.12, 0.06], lit: [0.78, 0.08]
        },
        // Undead: gaunt, rotting greenish flesh, hunched.
        undead: {
            scale: 2.5, bodyBulk: 0.92, headScale: 1.0, earScale: 0.6, noseScale: 0.7,
            fangs: 0, slouch: 0.14, texture: 'mossy_green_rock.jpg',
            hue: [0.24, 0.06], sat: [0.30, 0.15], lit: [0.30, 0.10]
        },
        // Minotaur: huge, broad, bull head with big horns.
        minotaur: {
            scale: 3.8, bodyBulk: 1.45, headScale: 1.15, earScale: 0.5, noseScale: 0.9,
            fangs: 0, horns: 2, slouch: 0.08, texture: 'brown_leather_stone.jpg',
            hue: [0.07, 0.03], sat: [0.40, 0.18], lit: [0.28, 0.10]
        },
        // Vampire: tall, gaunt, pale, prominent fangs.
        vampire: {
            scale: 2.7, bodyBulk: 0.95, headScale: 1.0, earScale: 0.7, noseScale: 0.8,
            fangs: 1, slouch: 0.0, texture: 'brown_leather_stone.jpg',
            hue: [0.96, 0.04], sat: [0.12, 0.08], lit: [0.74, 0.10]
        },
        // Reptilian: scaly green, small fangs, dragging tail.
        reptilian: {
            scale: 2.9, bodyBulk: 1.1, headScale: 0.95, earScale: 0.3, noseScale: 0.7,
            fangs: 1, tail: 1, slouch: 0.1, texture: 'mossy_green_rock.jpg',
            hue: [0.33, 0.06], sat: [0.55, 0.15], lit: [0.34, 0.10]
        },
        // Constructed undead: stitched flesh-golem, no real legs in its part list
        // (they still render but are never targeted), slight self-glow at seams.
        constructedundead: {
            scale: 3.0, bodyBulk: 1.3, headScale: 1.05, earScale: 0.5, noseScale: 0.7,
            fangs: 0, slouch: 0.12, texture: 'mossy_green_rock.jpg', emissive: 0x223311,
            hue: [0.28, 0.05], sat: [0.25, 0.12], lit: [0.34, 0.10]
        },
        // Plain human.
        humanoid: {
            scale: 2.6, bodyBulk: 1.0, headScale: 1.0, earScale: 0.8, noseScale: 0.9,
            fangs: 0, slouch: 0.0, texture: 'brown_leather_stone.jpg',
            hue: [0.07, 0.03], sat: [0.45, 0.12], lit: [0.60, 0.12]
        },
        // Scarecrow: lanky, straw-coloured, stitched-sack head.
        scarecrow: {
            scale: 2.7, bodyBulk: 0.82, headScale: 1.1, earScale: 0.2, noseScale: 1.2,
            fangs: 0, slouch: 0.06, texture: 'golden_brown_leather.jpg',
            hue: [0.13, 0.03], sat: [0.55, 0.12], lit: [0.52, 0.10]
        },
        // Robot: blocky metal, glowing core, no ears/nose.
        robot: {
            scale: 2.7, bodyBulk: 1.12, headScale: 0.9, earScale: 0.0, noseScale: 0.0,
            fangs: 0, slouch: 0.0, texture: 'brown_leather_stone.jpg', emissive: 0x113355,
            hue: [0.58, 0.05], sat: [0.06, 0.04], lit: [0.55, 0.10]
        },
        // Golem: massive rocky construct with a glowing core.
        golem: {
            scale: 3.7, bodyBulk: 1.5, headScale: 0.8, earScale: 0.0, noseScale: 0.3,
            fangs: 0, slouch: 0.12, texture: 'brown_leather_stone.jpg', emissive: 0x221100,
            hue: [0.08, 0.04], sat: [0.16, 0.10], lit: [0.40, 0.10]
        },
        // Armored knight: polished plate, helmet, no exposed skin.
        armoredknight: {
            scale: 2.9, bodyBulk: 1.2, headScale: 0.9, earScale: 0.0, noseScale: 0.0,
            fangs: 0, slouch: 0.0, texture: 'brown_leather_stone.jpg', emissive: 0x101022,
            hue: [0.60, 0.04], sat: [0.06, 0.04], lit: [0.62, 0.10]
        },
        // Elven: slender, fair, long pointed ears, carries a bow.
        elven: {
            scale: 2.6, bodyBulk: 0.85, headScale: 1.0, earScale: 1.0, noseScale: 0.8, earType: 'long',
            fangs: 0, slouch: 0.0, texture: 'brown_leather_stone.jpg',
            hue: [0.09, 0.03], sat: [0.40, 0.10], lit: [0.70, 0.10]
        },
        // Gnome: short, ruddy, big nose, bushy presence, iconic red cone hat.
        gnome: {
            scale: 1.8, bodyBulk: 1.1, headScale: 1.2, earScale: 0.6, noseScale: 1.5,
            fangs: 0, slouch: 0.04, texture: 'golden_brown_leather.jpg', gear: ['gnomehat'],
            hue: [0.05, 0.03], sat: [0.45, 0.12], lit: [0.55, 0.10]
        },
        // Demon: red, horned, winged, tailed, fanged.
        demon: {
            scale: 3.3, bodyBulk: 1.28, headScale: 1.0, earScale: 0.6, noseScale: 0.6, earType: 'pointed',
            fangs: 2, horns: 2, tail: 1, wings: 1, wingColor: 0x3a1018, slouch: 0.05,
            texture: 'brown_leather_stone.jpg',
            hue: [0.00, 0.03], sat: [0.60, 0.15], lit: [0.32, 0.10]
        },
        // Winged demon: leaner flying fiend with a glowing core and claws.
        wingeddemon: {
            scale: 3.1, bodyBulk: 1.1, headScale: 1.0, earScale: 0.6, noseScale: 0.5, earType: 'pointed',
            fangs: 1, horns: 1, tail: 1, wings: 1, wingColor: 0x2a0a14, slouch: 0.0,
            texture: 'brown_leather_stone.jpg', emissive: 0x330011,
            hue: [0.98, 0.03], sat: [0.55, 0.15], lit: [0.28, 0.10]
        },
        // Angel: radiant, white-winged, haloed.
        angel: {
            scale: 3.0, bodyBulk: 1.0, headScale: 1.0, earScale: 0.3, noseScale: 0.7,
            fangs: 0, wings: 1, halo: 1, wingColor: 0xffffff, slouch: 0.0,
            texture: 'brown_leather_stone.jpg', emissive: 0x222018,
            hue: [0.11, 0.03], sat: [0.20, 0.10], lit: [0.85, 0.08]
        },
        // Fairy: tiny, bright, gossamer winged.
        fairy: {
            scale: 1.5, bodyBulk: 0.8, headScale: 1.2, earScale: 1.0, noseScale: 0.6, earType: 'pointed',
            fangs: 0, wings: 1, wingColor: 0xbfe9ff, slouch: 0.0,
            texture: 'brown_leather_stone.jpg', emissive: 0x224466,
            hue: [0.85, 0.10], sat: [0.50, 0.15], lit: [0.70, 0.10]
        },
        // Roguelite humanoid: battle-worn adventurer (own look, full biped rig).
        humanoid_roguelite: {
            scale: 2.6, bodyBulk: 1.05, headScale: 1.0, earScale: 0.7, noseScale: 0.9,
            fangs: 0, slouch: 0.04, texturePool: 'flesh',
            hue: [0.05, 0.03], sat: [0.40, 0.12], lit: [0.52, 0.10]
        },
        // Double-headed humanoid (ettin): broad, brutish, two heads.
        doubleheadedhumanoid: {
            scale: 3.2, bodyBulk: 1.35, headScale: 0.9, earScale: 0.5, noseScale: 0.9,
            fangs: 1, secondHead: 1, slouch: 0.1, texturePool: 'flesh',
            hue: [0.07, 0.04], sat: [0.35, 0.15], lit: [0.42, 0.10]
        },
        // Robotic defender: armoured biped with an arm cannon and a glowing eye.
        roboticdefender: {
            scale: 2.9, bodyBulk: 1.18, headScale: 0.85, earScale: 0.0, noseScale: 0.0,
            fangs: 0, armCannon: 1, slouch: 0.0, texturePool: 'metal', emissive: 0x113355,
            hue: [0.58, 0.05], sat: [0.06, 0.04], lit: [0.58, 0.10]
        }
    };
    // Assign a themed texture pool per archetype so each monster id picks a
    // distinct-but-fitting surface (skin/bone/metal/stone).
    const POOL_BY_TYPE = {
        goblin: 'green', orc: 'green', undead: 'green', reptilian: 'green', constructedundead: 'green',
        hobgoblin: 'flesh', ogre: 'flesh', minotaur: 'flesh', humanoid: 'flesh', scarecrow: 'flesh',
        elven: 'flesh', gnome: 'flesh', demon: 'flesh', fairy: 'flesh', vampire: 'bone',
        skeleton: 'bone', angel: 'bone', robot: 'metal', armoredknight: 'metal',
        golem: 'stone', wingeddemon: 'stone'
    };
    for (const k in CREATURE_PROFILES) {
        if (POOL_BY_TYPE[k]) CREATURE_PROFILES[k].texturePool = POOL_BY_TYPE[k];
    }
    // Expose for any future shared use.
    Object.assign(window.Battler3D.CREATURE_PROFILES, CREATURE_PROFILES);

    //=========================================================================
    // Goblin / Hobgoblin SPECIES (shared goblin rig; bespoke clothing+weapon)
    //=========================================================================
    // Every species reuses the canonical goblin biped and differs only by gear,
    // colour, size and weapon (built in _applyGear). Hobgoblin species also wear
    // corpse paint and a black-metal aesthetic (spikes/studs + pale face).
    const _gob = (o) => Object.assign({}, CREATURE_PROFILES.goblin, { texturePool: 'green' }, o);
    const _hob = (o) => Object.assign({}, CREATURE_PROFILES.hobgoblin, {
        texturePool: 'green', corpsePaint: 1, blackMetal: 1,
        hue: [0.32, 0.05], sat: [0.18, 0.10], lit: [0.20, 0.06]
    }, o);
    Object.assign(CREATURE_PROFILES, {
        // ── Goblins (green) ───────────────────────────────────────────────
        gob_grunt:         _gob({ scale: 2.3, bodyBulk: 0.95, weapon: 1,  gear: ['loincloth'] }),
        gob_scout:         _gob({ scale: 2.3, bodyBulk: 0.85, weapon: 1,  gear: ['hood', 'feather'] }),
        gob_warrior:       _gob({ scale: 2.5, bodyBulk: 1.10, weapon: 4,  gear: ['leatherchest', 'pauldrons'] }),
        gob_archer:        _gob({ scale: 2.4, bodyBulk: 0.90, weapon: 7,  gear: ['hood', 'quiver'] }),
        gob_sniper:        _gob({ scale: 2.5, bodyBulk: 0.90, weapon: 7,  gear: ['hood', 'quiver', 'feather'] }),
        gob_mountedarcher: _gob({ scale: 2.4, bodyBulk: 0.95, weapon: 7,  gear: ['harness', 'quiver', 'mount'] }),
        gob_cavalry:       _gob({ scale: 2.5, bodyBulk: 1.05, weapon: 12, gear: ['harness', 'pauldrons', 'mount'] }),
        gob_shaman:        _gob({ scale: 2.4, bodyBulk: 0.95, weapon: 6,  gear: ['bonemask', 'bonenecklace'] }),
        gob_witchdoctor:   _gob({ scale: 2.4, bodyBulk: 0.95, weapon: 6,  gear: ['skullmask', 'feather', 'warpaint', 'bonenecklace'] }),
        gob_necromancer:   _gob({ scale: 2.4, bodyBulk: 0.95, weapon: 8,  gear: ['hood', 'bonenecklace'], hue: [0.74, 0.06], sat: [0.25, 0.10], lit: [0.30, 0.08] }),
        gob_shadowsorc:    _gob({ scale: 2.5, bodyBulk: 0.95, weapon: 8,  gear: ['hood', 'shadowmotes'], hue: [0.74, 0.06], sat: [0.22, 0.10], lit: [0.24, 0.08] }),
        gob_chieftain:     _gob({ scale: 2.7, bodyBulk: 1.20, weapon: 4,  gear: ['hornhelm', 'cape', 'pauldrons'] }),
        gob_warchief:      _gob({ scale: 2.9, bodyBulk: 1.30, weapon: 3,  gear: ['hornhelm', 'cape', 'spikedpauldrons'] }),
        gob_eliteguard:    _gob({ scale: 2.6, bodyBulk: 1.15, weapon: 12, gear: ['helmet', 'pauldrons'] }),
        gob_king:          _gob({ scale: 3.0, bodyBulk: 1.30, weapon: 3,  gear: ['crown', 'cape', 'pauldrons'] }),
        gob_bell:          _gob({ scale: 2.3, bodyBulk: 0.95, weapon: 0,  gear: ['bell', 'hood'] }),
        gob_raider:        _gob({ scale: 2.5, bodyBulk: 1.00, weapon: 2,  gear: ['headwrap'], texturePool: 'flesh', hue: [0.09, 0.03], sat: [0.45, 0.12], lit: [0.46, 0.10] }),
        gob_mutant:        _gob({ scale: 2.6, bodyBulk: 1.15, weapon: 10, gear: ['mutation'], hue: [0.78, 0.08], sat: [0.35, 0.12], lit: [0.34, 0.10] }),
        // Glitter Goblin: base goblin rig, futuristic chrome + rainbow glitter.
        gob_glitter:       _gob({ scale: 2.3, bodyBulk: 0.95, weapon: 0, gear: ['robotic', 'glitter'], emissive: 0x223355, texturePool: 'metal', hue: [0.83, 0.12], sat: [0.45, 0.15], lit: [0.62, 0.10] }),
        // ── Black-metal goblins (corpse paint + spikes) ───────────────────
        gobm_moshlord:     _gob({ scale: 2.6, bodyBulk: 1.15, weapon: 4, gear: ['spikes', 'pauldrons'],            corpsePaint: 1, blackMetal: 1, hue: [0.30, 0.05], sat: [0.18, 0.08], lit: [0.22, 0.06] }),
        gobm_warlord:      _gob({ scale: 2.9, bodyBulk: 1.28, weapon: 4, gear: ['spikedpauldrons', 'spikes', 'cape'], corpsePaint: 1, blackMetal: 1, hue: [0.30, 0.05], sat: [0.18, 0.08], lit: [0.20, 0.06] }),
        gobm_riotcaster:   _gob({ scale: 2.5, bodyBulk: 1.00, weapon: 6, gear: ['spikes', 'studs'],                corpsePaint: 1, blackMetal: 1, hue: [0.30, 0.05], sat: [0.18, 0.08], lit: [0.22, 0.06] }),
        gobm_shrieker:     _gob({ scale: 2.4, bodyBulk: 0.95, weapon: 0, gear: ['spikes', 'studs'],                corpsePaint: 1, blackMetal: 1, hue: [0.30, 0.05], sat: [0.18, 0.08], lit: [0.22, 0.06] }),
        // NB: "Goblin Head" (943) intentionally NOT pinned - its name collides
        // (case-insensitively) with the severed-head enemy "Goblin head" (841,
        // Spherical), so it resolves to the plain goblin rig instead.
        // ── Hobgoblins (corpse paint + black metal) ───────────────────────
        hob_runt:          _hob({ scale: 2.1, bodyBulk: 0.85, weapon: 1, gear: ['spikes'] }),
        hob_warrior:       _hob({ scale: 2.6, bodyBulk: 1.12, weapon: 4, gear: ['spikedpauldrons', 'spikes'] }),
        hob_archer:        _hob({ scale: 2.5, bodyBulk: 1.00, weapon: 7, gear: ['hood', 'quiver', 'spikes'] }),
        hob_scout:         _hob({ scale: 2.4, bodyBulk: 0.95, weapon: 1, gear: ['hood', 'spikes'] }),
        hob_firestarter:   _hob({ scale: 2.5, bodyBulk: 1.00, weapon: 1, gear: ['torch', 'firemotes', 'spikes'] }),
        hob_shaman:        _hob({ scale: 2.5, bodyBulk: 1.00, weapon: 6, gear: ['spikes', 'bonenecklace'] })
    });

    // Mark every goblinoid profile (the two base rigs plus each species) and give
    // it a standing height in world units. `goblinoid` opens the mouth bank;
    // `standHeight` is the height _normalizeHeight rescales the model onto, so a
    // species reads at one size however its per-id size multiplier rolled.
    for (const k in CREATURE_PROFILES) {
        if (k !== 'goblin' && k !== 'hobgoblin' &&
            k.indexOf('gob_') !== 0 && k.indexOf('gobm_') !== 0 && k.indexOf('hob_') !== 0) continue;
        const p = CREATURE_PROFILES[k];
        p.goblinoid = 1;
        p.standHeight = (p.scale || 2.5) * GOBLIN_HEIGHT_PER_SCALE;
        // ...and what that works out to as a build scale. A goblinoid is built
        // at `scale` and then rescaled onto `standHeight`, so `scale` is not
        // what it ends up at: a goblin is registered at 2.5, the same as a
        // skeleton and all but level with a plain human at 2.6, but the battle
        // view shows it at little over half a man. Nothing in the battle view
        // reads this - it is here so anything standing the creature somewhere
        // else can show it at the size the battle view does.
        p.worldScale = p.standHeight / RIG_TOP;
    }
    Object.assign(window.Battler3D.CREATURE_PROFILES, CREATURE_PROFILES);

    // Exact-name pins (also parsed by scripts/gen_3d_models_doc.js).
    const NAMED = {
        gob_grunt: ["Goblin Grunt"],
        gob_scout: ["Goblin Scout"],
        gob_warrior: ["Goblin Warrior"],
        gob_archer: ["Goblin Marksman"],
        gob_sniper: ["Goblin Master Sniper"],
        gob_mountedarcher: ["Goblin Mounted Archer"],
        gob_cavalry: ["Goblin Cavalry"],
        gob_shaman: ["Goblin Shaman"],
        gob_witchdoctor: ["Goblin Witch Doctor"],
        gob_necromancer: ["Goblin Necromancer"],
        gob_shadowsorc: ["Goblin Shadow Sorcerer"],
        gob_chieftain: ["Goblin Chieftain"],
        gob_warchief: ["Goblin War Chief"],
        gob_eliteguard: ["Goblin Elite Guard"],
        gob_king: ["Goblin King"],
        gob_bell: ["Bell Goblin"],
        gob_raider: ["Desert Raider"],
        gob_mutant: ["Mutated Goblin"],
        gob_glitter: ["Glitter Goblin"],
        gobm_moshlord: ["Goblin Mosh Lord"],
        gobm_warlord: ["Goblin Metal Warlord"],
        gobm_riotcaster: ["Goblin Riot Caster"],
        gobm_shrieker: ["Goblin Shrieker"],
        hob_runt: ["Hobgoblin Runt"],
        hob_warrior: ["Hobgoblin Warrior"],
        hob_archer: ["Hobgoblin Archer"],
        hob_scout: ["Hobgoblin Scout"],
        hob_firestarter: ["Hobgoblin Firestarter"],
        hob_shaman: ["Hobgoblin Shaman"],
        // Bespoke skeleton splits (were resolving to the shared 'skeleton' rig
        // via the 'skull'/'skeleton' keyword aliases; now pinned by exact name).
        hmn_gigglingskull: ["Giggling Skull"],
        hmn_deathshead: ["Death's Head"],
        hmn_skullkeeper: ["Skull Keeper"]
    };

    //=========================================================================
    // HumanoidBattler3D
    //=========================================================================
    class HumanoidBattler3D extends Base {
        constructor(scale, offsetY, battler, weaponType, creatureType) {
            // creatureType may be a bespoke profile OBJECT (character-creation
            // custom humanoids) instead of a registered profile key.
            const isCustom = creatureType && typeof creatureType === 'object';
            const profile = isCustom
                ? creatureType
                : (CREATURE_PROFILES[creatureType] || CREATURE_PROFILES.goblin);
            const typeKey = isCustom
                ? (creatureType.key || 'humanoid')
                : (creatureType || 'goblin');
            super(scale, offsetY, battler, profile, weaponType, typeKey);

            // Everything the caller multiplied onto the archetype's own scale:
            // the <3d_scale:> note tag and the crowd factor that shrinks a big
            // troop so it fits side by side. Height normalisation replaces the
            // model's scale outright, so it has to re-apply this on top or a
            // crowded fight would lay its goblins out at the wrong size.
            this._extScaleMul = (scale && profile.scale) ? (scale / profile.scale) : 1;

            // Meshes
            this.head = null; this.torso = null;
            this.leftEyeMesh = null; this.rightEyeMesh = null; this.mouthMesh = null;
            this.hornsMesh = null; this.tailMesh = null;
            this.leftWing = null; this.rightWing = null; this.haloMesh = null;
            this.secondHead = null; this.cannonMesh = null;
            this.leftUpperArm = null; this.leftForearm = null; this.leftHand = null;
            this.rightUpperArm = null; this.rightForearm = null; this.rightHand = null;
            this.leftThigh = null; this.leftShin = null; this.leftFoot = null;
            this.rightThigh = null; this.rightShin = null; this.rightFoot = null;

            // Weapon
            this.weaponMesh = null;
            // Humanoid drives attack/specialattack/hit through its own limb FK, so
            // it skips the generic whole-body action gesture.
            this.useBaseActionMotion = false;
            // Bipedal: face the camera front-on (not the non-biped 3/4 angle).
            this.facingYaw = 0;
        }

        async load(physicsWorld, startX = 0, startY = 0, startZ = 0) {
            return new Promise((resolve) => {
                this.physicsWorld = physicsWorld;

                // Skin material shared across body meshes; each mesh clones it so
                // emissive hit-flashing is per-part.
                const skinTexture = this.buildSkinTexture(this.skinTextureFile);
                const baseMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: skinTexture, roughness: 0.8 });
                if (this.profile.emissive) baseMat.emissive = new THREE.Color(this.profile.emissive);
                const m = () => baseMat.clone();

                // Geometry Setup
                this.torso = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.8, 8), m()); this.bodyGroup.add(this.torso);
                this.head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 16), m()); this.bodyGroup.add(this.head);

                // Ear shape by profile. Default is small ROUNDED ears; pointed
                // cones are reserved for goblinoid profiles and long swept-back
                // ears for elves, so a plain humanoid no longer reads as a goblin.
                const earType = this.profile.earType || 'round';
                const earScale = this.profile.earScale || 1.0;
                if (earType !== 'none') {
                    if (earType === 'pointed' || earType === 'long') {
                        const len = earType === 'long' ? 0.6 : 0.4;
                        const rad = earType === 'long' ? 0.07 : 0.1;
                        const tilt = earType === 'long' ? 0.5 : 0.2;
                        const back = earType === 'long' ? -0.05 : 0;
                        const pitch = earType === 'long' ? -0.3 : 0;
                        const earGeo = new THREE.ConeGeometry(rad, len, 4);
                        const le = new THREE.Mesh(earGeo, m()); le.position.set(-0.34, 0.1, back); le.rotation.z = Math.PI / 2 + tilt; le.rotation.x = pitch; le.scale.setScalar(earScale); this.head.add(le);
                        const re = new THREE.Mesh(earGeo, m()); re.position.set(0.34, 0.1, back); re.rotation.z = -Math.PI / 2 - tilt; re.rotation.x = pitch; re.scale.setScalar(earScale); this.head.add(re);
                    } else {
                        // Rounded ears: small flattened spheres flush to the head.
                        const earGeo = new THREE.SphereGeometry(0.12, 8, 8);
                        const le = new THREE.Mesh(earGeo, m()); le.position.set(-0.33, 0.06, 0.02); le.scale.set(0.5 * earScale, 1.0 * earScale, 0.7 * earScale); this.head.add(le);
                        const re = new THREE.Mesh(earGeo, m()); re.position.set(0.33, 0.06, 0.02); re.scale.set(0.5 * earScale, 1.0 * earScale, 0.7 * earScale); this.head.add(re);
                    }
                }
                const nose = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 4), m()); nose.position.set(0, 0, 0.35); nose.rotation.x = Math.PI / 2; nose.scale.setScalar(this.profile.noseScale || 1.0); this.head.add(nose);
                const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffff00, roughness: 0.2 });
                const pupilMat = new THREE.MeshStandardMaterial({ color: 0x000000 });
                const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), eyeMat); leftEye.position.set(-0.15, 0.1, 0.3);
                const leftPupil = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), pupilMat); leftPupil.position.set(0, 0, 0.04); leftEye.add(leftPupil); this.head.add(leftEye);
                this.leftEyeMesh = leftEye;
                const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), eyeMat); rightEye.position.set(0.15, 0.1, 0.3);
                const rightPupil = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), pupilMat); rightPupil.position.set(0, 0, 0.04); rightEye.add(rightPupil); this.head.add(rightEye);
                this.rightEyeMesh = rightEye;
                // Mouth: a wrapper holding the species' own shape from the bank
                // plus the plain round mouth, which is swapped in for the length
                // of a hit (a goblin taking a blow drops its face and shouts, see
                // the mouth block in animatePose). The wrapper is left unrotated
                // so the jaw animation (scale.x / scale.y) stretches it across and
                // OPENS it, rather than driving its depth into the head.
                const mouth = new THREE.Group();
                const mouthStyle = this._mouthStyle();
                this._mouthShape = this._buildMouth(mouthStyle);
                mouth.add(this._mouthShape);
                if (mouthStyle === 'round') {
                    this._mouthOpen = this._mouthShape;   // already the circle
                } else {
                    this._mouthOpen = this._buildMouth('round');
                    this._mouthOpen.visible = false;
                    mouth.add(this._mouthOpen);
                }
                mouth.name = 'mouth_' + mouthStyle;
                mouth.position.set(0, -0.15, 0.33);
                this.head.add(mouth);
                this.mouthMesh = mouth;

                // Tusks / fangs: small upward tusks for orcs, big jutting fangs for ogres.
                if (this.profile.fangs > 0) {
                    const fangMat = new THREE.MeshStandardMaterial({ color: 0xefe6cf, roughness: 0.5 });
                    const big = this.profile.fangs >= 2;
                    const fLen = big ? 0.24 : 0.1;
                    const fRad = big ? 0.05 : 0.025;
                    const fGeo = new THREE.ConeGeometry(fRad, fLen, 5);
                    const fx = 0.12, fy = -0.13 + fLen * 0.5, fz = 0.31;
                    const leftFang = new THREE.Mesh(fGeo, fangMat); leftFang.position.set(-fx, fy, fz); this.head.add(leftFang);
                    const rightFang = new THREE.Mesh(fGeo, fangMat); rightFang.position.set(fx, fy, fz); this.head.add(rightFang);
                }

                // Horns (minotaur etc.): curved cones on the head, hidden as a unit
                // when the HORNS body part is destroyed.
                if (this.profile.horns > 0) {
                    const hornMat = new THREE.MeshStandardMaterial({ color: 0xe8ddc4, roughness: 0.6 });
                    this.hornsMesh = new THREE.Group();
                    const big = this.profile.horns >= 2;
                    const hLen = big ? 0.5 : 0.32;
                    const hRad = big ? 0.07 : 0.05;
                    const hGeo = new THREE.ConeGeometry(hRad, hLen, 6);
                    const hx = 0.26, hy = 0.28, hz = 0.0;
                    const lh = new THREE.Mesh(hGeo, hornMat); lh.position.set(-hx, hy, hz); lh.rotation.z = 0.9; lh.rotation.x = -0.3;
                    const rh = new THREE.Mesh(hGeo, hornMat); rh.position.set(hx, hy, hz); rh.rotation.z = -0.9; rh.rotation.x = -0.3;
                    this.hornsMesh.add(lh, rh);
                    this.head.add(this.hornsMesh);
                }

                // Tail (reptilian etc.): tapered segmented cone trailing behind the
                // torso; follows the torso transform and is hidden when TAIL is lost.
                if (this.profile.tail > 0) {
                    const tailMat = m();
                    this.tailMesh = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.9, 7), tailMat);
                    this.tailMesh.position.set(0, -0.45, -0.3);
                    this.tailMesh.rotation.x = -2.4; // sweep down and back
                    this.torso.add(this.tailMesh);
                }

                // Wings (demon/angel/fairy): a flattened fan on each shoulder blade,
                // children of the torso so they follow its transform. Hidden per
                // side when LEFT_WING / RIGHT_WING is destroyed.
                if (this.profile.wings > 0) {
                    const wingMat = new THREE.MeshStandardMaterial({
                        color: this.profile.wingColor || 0xffffff, roughness: 0.7,
                        side: THREE.DoubleSide, transparent: true, opacity: 0.92
                    });
                    const wingGeo = new THREE.ConeGeometry(0.32, 1.0, 4);
                    this.leftWing = new THREE.Group();
                    const lw = new THREE.Mesh(wingGeo, wingMat);
                    lw.position.set(-0.5, 0, 0); lw.rotation.z = Math.PI / 2; lw.scale.set(1, 1, 0.12);
                    this.leftWing.add(lw); this.leftWing.position.set(-0.15, 0.25, -0.25);
                    this.torso.add(this.leftWing);
                    this.rightWing = new THREE.Group();
                    const rw = new THREE.Mesh(wingGeo, wingMat);
                    rw.position.set(0.5, 0, 0); rw.rotation.z = -Math.PI / 2; rw.scale.set(1, 1, 0.12);
                    this.rightWing.add(rw); this.rightWing.position.set(0.15, 0.25, -0.25);
                    this.torso.add(this.rightWing);
                }

                // Halo (angel): glowing ring floating above the head.
                if (this.profile.halo > 0) {
                    const haloMat = new THREE.MeshStandardMaterial({ color: 0xfff2a0, emissive: 0xffd24a, emissiveIntensity: 1.0, roughness: 0.3 });
                    this.haloMesh = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.04, 8, 20), haloMat);
                    this.haloMesh.position.set(0, 0.5, 0); this.haloMesh.rotation.x = Math.PI / 2;
                    this.head.add(this.haloMesh);
                }

                // Second head (double-headed humanoid). Built as a sibling group so
                // it can be flanked beside the main head and lost independently.
                if (this.profile.secondHead > 0) {
                    // Shrink both heads a touch so they sit side by side.
                    this.head.scale.multiplyScalar(0.82);
                    this.secondHead = new THREE.Group();
                    const sh = new THREE.Mesh(new THREE.SphereGeometry(0.35 * 0.82, 16, 16), m());
                    this.secondHead.add(sh);
                    const sEyeMat = new THREE.MeshStandardMaterial({ color: 0xffff00, roughness: 0.2 });
                    const sPupilMat = new THREE.MeshStandardMaterial({ color: 0x000000 });
                    [[-0.12], [0.12]].forEach(([ex]) => {
                        const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), sEyeMat); e.position.set(ex, 0.08, 0.25);
                        const pp = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), sPupilMat); pp.position.set(0, 0, 0.04); e.add(pp);
                        this.secondHead.add(e);
                    });
                    const sNose = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.24, 4), m()); sNose.position.set(0, 0, 0.3); sNose.rotation.x = Math.PI / 2; this.secondHead.add(sNose);
                    if (this.profile.fangs > 0) {
                        const fMat = new THREE.MeshStandardMaterial({ color: 0xefe6cf, roughness: 0.5 });
                        for (const fx of [-0.1, 0.1]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.1, 5), fMat); f.position.set(fx, -0.1, 0.26); this.secondHead.add(f); }
                    }
                    this.bodyGroup.add(this.secondHead);
                }

                this.leftUpperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.35, 8), m()); this.bodyGroup.add(this.leftUpperArm);
                this.leftForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.35, 8), m()); this.bodyGroup.add(this.leftForearm);
                this.leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), m()); this.bodyGroup.add(this.leftHand);

                this.rightUpperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.35, 8), m()); this.bodyGroup.add(this.rightUpperArm);
                this.rightForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.35, 8), m()); this.bodyGroup.add(this.rightForearm);
                this.rightHand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), m()); this.bodyGroup.add(this.rightHand);

                // Arm cannon (robotic defender): parents a barrel onto the right
                // hand. Must run AFTER this.rightHand is created above, else it
                // throws in load() and the enemy never builds.
                if (this.profile.armCannon > 0) {
                    const cannonMat = new THREE.MeshStandardMaterial({ color: 0x8a8f98, roughness: 0.4, metalness: 0.7, map: this.skinTex() });
                    this.cannonMesh = new THREE.Group();
                    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.45, 10), cannonMat);
                    barrel.rotation.x = Math.PI / 2; barrel.position.z = 0.18; this.cannonMesh.add(barrel);
                    const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.03, 6, 12), new THREE.MeshStandardMaterial({ color: 0x113355, emissive: 0x2266aa, emissiveIntensity: 1.0 }));
                    muzzle.position.z = 0.4; this.cannonMesh.add(muzzle);
                    this.rightHand.add(this.cannonMesh);
                    this.rightHand.visible = true; // host the cannon
                }

                this.leftThigh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.3, 8), m()); this.bodyGroup.add(this.leftThigh);
                this.leftShin = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.3, 8), m()); this.bodyGroup.add(this.leftShin);
                this.leftFoot = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.2), m()); this.bodyGroup.add(this.leftFoot);

                this.rightThigh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.3, 8), m()); this.bodyGroup.add(this.rightThigh);
                this.rightShin = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.3, 8), m()); this.bodyGroup.add(this.rightShin);
                this.rightFoot = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.2), m()); this.bodyGroup.add(this.rightFoot);

                // ── PER-CREATURE BULK (visual only; varied per monster id) ───
                const bb = (this.profile.bodyBulk || 1.0) * this.bulkMul;
                this._bulk = bb;   // animatePose anchors the shoulders on it
                if (bb !== 1.0) {
                    this.torso.scale.set(bb, 1, bb);
                    [this.leftUpperArm, this.leftForearm, this.rightUpperArm, this.rightForearm,
                     this.leftThigh, this.leftShin, this.rightThigh, this.rightShin].forEach(mm => mm.scale.set(bb, 1, bb));
                    [this.leftHand, this.rightHand].forEach(mm => mm.scale.setScalar(bb));
                    [this.leftFoot, this.rightFoot].forEach(mm => mm.scale.set(bb, 1, bb));
                }
                const hs = (this.profile.headScale || 1.0) * this.headMul;
                if (hs !== 1.0) this.head.scale.setScalar(hs);

                // ── WEAPON MESH GENERATION ───────────────────────────────────
                // The weapon lives in bodyGroup (uniform scale - parenting it to the
                // forearm would shear it via the per-creature (bb,1,bb) bulk scale).
                // It is gripped at the wrist and given an explicit WORLD pitch each
                // frame in animatePose (held upright at rest, arcing forward on a
                // strike), independent of the elbow so it never lies along the arm.
                this._buildWeaponMesh();
                if (this.weaponType !== 0 && this.weaponMesh) this.bodyGroup.add(this.weaponMesh);

                this.model = this.bodyGroup;
                this.model.scale.set(this.scale, this.scale, this.scale);

                // ── PART-LOSING WIRING (mesh map + cascade rules)
                this._wireDismemberment();

                // ── PER-SPECIES GEAR (goblin/hobgoblin clothing, props, paint)
                if (this.profile.gear || this.profile.corpsePaint) this._applyGear();

                // ── HAIR (after gear, so a helmeted/hooded head stays bald)
                this._applyHair();

                // ── STANDING HEIGHT (last: it measures the finished head+gear)
                this._normalizeHeight();

                this.loaded = true;
                resolve(this);
            });
        }

        // ── MOUTH ────────────────────────────────────────────────────────────
        // Which shape off the bank this battler wears. Hashed off the species
        // seed rather than idRand: idRand is a shared stream and drawing from it
        // here would shift every draw made after it (bulk, head, hair, gear).
        _mouthStyle() {
            if (this.profile.mouthStyle) return this.profile.mouthStyle;
            if (!this.profile.goblinoid) return 'round';
            const s = ((this._speciesSeed >>> 0) || 1) % 1000003;
            const x = Math.sin(s * 0.000431 + 2.17) * 20219.7;
            const f = x - Math.floor(x);
            return MOUTH_STYLES[Math.min(MOUTH_STYLES.length - 1, Math.floor(f * MOUTH_STYLES.length))];
        }

        // Build one mouth as a group in head-local space: +Z points out of the
        // face, +X is across it and +Y up, with the group's own origin on the
        // mouth line so the jaw animation scales it about its centre.
        _buildMouth(style) {
            const g = new THREE.Group();
            g.name = 'mouth_' + style;
            const dark = new THREE.MeshStandardMaterial({ color: 0x140f12, roughness: 0.95 });
            const tooth = new THREE.MeshStandardMaterial({ color: 0xefe6cf, roughness: 0.5 });
            const flesh = new THREE.MeshStandardMaterial({ color: 0x8f3a48, roughness: 0.7 });

            // A flat opening lying against the face. The cylinder is laid on its
            // side, so after the rotation its scale reads (width, depth, height).
            const maw = (w, h, y) => {
                const m = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 10), dark);
                m.rotation.x = Math.PI / 2;
                m.scale.set(w, 1, h);
                m.position.y = y || 0;
                g.add(m);
                return m;
            };
            // A straight lip line.
            const slit = (w, h, y, rz) => {
                const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.03), dark);
                m.position.y = y || 0;
                m.rotation.z = rz || 0;
                g.add(m);
                return m;
            };
            // A curved lip line: `up` bulges the arc upward (a scowl), otherwise
            // it dips downward (a grin).
            const curve = (r, tube, up) => {
                const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 5, 14, Math.PI), dark);
                m.rotation.z = up ? 0 : Math.PI;
                m.position.y = up ? -r * 0.45 : r * 0.45;
                g.add(m);
                return m;
            };
            // A row of `n` teeth. `dir` +1 points them up (from the lower lip),
            // -1 points them down (from the upper lip).
            const teeth = (n, dir, len, rad, y, span) => {
                const sp = span === undefined ? 0.15 : span;
                for (let i = 0; i < n; i++) {
                    const t = new THREE.Mesh(new THREE.ConeGeometry(rad, len, 4), tooth);
                    const u = n > 1 ? (i / (n - 1)) - 0.5 : 0;
                    t.position.set(u * sp, (y || 0) + dir * len * 0.5, 0.018);
                    if (dir < 0) t.rotation.z = Math.PI;
                    g.add(t);
                }
            };
            // One oversized tusk.
            const tusk = (x, dir, len, tilt) => {
                const t = new THREE.Mesh(new THREE.ConeGeometry(0.022, len, 5), tooth);
                t.position.set(x, dir * len * 0.45, 0.022);
                t.rotation.z = (dir < 0 ? Math.PI : 0) + (tilt || 0);
                g.add(t);
                return t;
            };

            switch (style) {
                case 'wide':      // a broad letterbox slot
                    maw(1.75, 0.45);
                    break;
                case 'slit':      // a thin closed line
                    slit(0.24, 0.035, 0);
                    break;
                case 'grin':      // curved up at the corners, upper teeth showing
                    curve(0.12, 0.022, false);
                    teeth(5, -1, 0.05, 0.017, 0.03);
                    break;
                case 'snaggle':   // crooked line with one tusk out of it
                    slit(0.22, 0.04, 0, 0.16);
                    tusk(-0.07, 1, 0.11, -0.2);
                    tusk(0.06, -1, 0.05, 0.1);
                    break;
                case 'underbite': // jaw pushed forward, lower teeth over the lip
                    maw(1.3, 0.5, -0.01);
                    teeth(4, 1, 0.07, 0.02, -0.03);
                    break;
                case 'sneer':     // one corner hauled up, a single tooth bared
                    slit(0.23, 0.038, 0, 0.38);
                    tusk(0.075, -1, 0.055, 0.25);
                    break;
                case 'frown':     // corners dragged down
                    curve(0.12, 0.024, true);
                    break;
                case 'gape':      // hanging open, throat and tongue behind it
                    maw(0.95, 1.55);
                    {
                        const throat = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), dark);
                        throat.position.z = -0.03; throat.scale.set(1, 1.4, 0.6); g.add(throat);
                        const tg = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), flesh);
                        tg.position.set(0, -0.05, 0.012); tg.scale.set(1, 1.1, 0.35); g.add(tg);
                    }
                    break;
                case 'toothy':    // a full ring of interlocking teeth
                    maw(1.35, 1.05);
                    teeth(5, -1, 0.055, 0.016, 0.05, 0.19);
                    teeth(4, 1, 0.05, 0.016, -0.05, 0.16);
                    break;
                case 'pucker':    // pursed lips pushed out from the face
                    {
                        const lips = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.028, 6, 12), flesh);
                        lips.position.z = 0.012; g.add(lips);
                        maw(0.45, 0.45, 0);
                    }
                    break;
                case 'lopsided':  // the whole mouth set on a slant
                    // Rolled about the disc's OWN axis (local Y, applied before
                    // the lay-down about X), so the oval tilts in the face plane.
                    maw(1.45, 0.6).rotation.y = -0.55;
                    break;
                case 'gaptooth':  // wide, with two teeth and a hole between them
                    maw(1.6, 0.55);
                    tusk(-0.045, -1, 0.06, 0);
                    tusk(0.045, -1, 0.06, 0);
                    break;
                case 'drool':     // slack, with a tongue lolling out of it
                    maw(1.2, 0.75);
                    {
                        const tg = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.09, 3, 6), flesh);
                        tg.position.set(0.03, -0.075, 0.022); tg.rotation.z = 0.35; g.add(tg);
                    }
                    break;
                case 'stitched':  // a sewn-shut line
                    slit(0.24, 0.03, 0);
                    for (let i = 0; i < 4; i++) {
                        const th = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.055, 0.02), tooth);
                        th.position.set(-0.09 + i * 0.06, 0, 0.02);
                        th.rotation.z = (i % 2 ? 1 : -1) * 0.5;
                        g.add(th);
                    }
                    break;
                case 'tusker':    // two boar tusks curling up past the lip
                    slit(0.2, 0.045, 0);
                    tusk(-0.08, 1, 0.13, 0.28);
                    tusk(0.08, 1, 0.13, -0.28);
                    break;
                case 'round':
                default:          // the original flat disc
                    maw(0.95, 0.95);
                    break;
            }
            return g;
        }

        // ── STANDING HEIGHT ──────────────────────────────────────────────────
        // Rescale the model so the top of its head lands on the profile's
        // declared standing height. Only profiles that declare one (the
        // goblinoids) are touched; every other humanoid keeps its rolled size.
        //
        // The rig is measured, not assumed: animatePose stands the torso at
        // y = 1.1 and rides the head 0.65 above that, and the head carries its
        // own gear (helm, horns, crown, hair), so the head's built extent is
        // read straight off it. The feet sit on the ground plane the model is
        // placed at, so head-top local Y * scale IS the standing height.
        _normalizeHeight() {
            const target = this.profile.standHeight;
            if (!target || !this.model || !this.scale || typeof THREE.Box3 === 'undefined') return;
            let top = HEAD_Y + 0.35 * ((this.profile.headScale || 1) * (this.headMul || 1));
            if (this.head) {
                this.model.updateMatrixWorld(true);
                const box = new THREE.Box3().setFromObject(this.head);
                if (!box.isEmpty()) {
                    const localMax = (box.max.y - this.model.position.y) / this.scale;
                    if (localMax > 0) top = HEAD_Y + localMax;
                }
            }
            if (top < 0.5) return;            // nonsense measurement, leave it alone
            // Keep a hint of the per-id size roll (+/-5%) so a line of the same
            // species is not a row of clones, and re-apply whatever the caller
            // multiplied on (note tag, crowd factor).
            const roll = Math.max(0, Math.min(1, ((this.sizeMul || 1) - 0.86) / 0.30));
            this.scale = (target / top) * (0.95 + roll * 0.10) * (this._extScaleMul || 1);
            this.model.scale.set(this.scale, this.scale, this.scale);
        }

        // ── GEAR: per-species clothing, accessories and hand props ───────────
        // Built after the body so each piece can parent to a body-part mesh; it
        // then FK-animates and hides on dismemberment for free (THREE hides a
        // descendant when its ancestor is hidden). Driven by profile.gear plus
        // the profile.corpsePaint / profile.blackMetal flags.
        _applyGear() {
            const feats = this.profile.gear || [];
            const has = (f) => feats.indexOf(f) !== -1;
            if (this.profile.corpsePaint) this._gearCorpsePaint();
            if (this.profile.blackMetal || has('spikes')) this._gearSpikes();
            if (has('studs')) this._gearStuds();
            if (has('loincloth')) this._gearLoincloth();
            if (has('leatherchest')) this._gearLeatherChest();
            if (has('harness')) this._gearHarness();
            if (has('bonenecklace')) this._gearBoneNecklace();
            if (has('pauldrons')) this._gearPauldrons(false);
            if (has('spikedpauldrons')) this._gearPauldrons(true);
            if (has('cape')) this._gearCape();
            if (has('quiver')) this._gearQuiver();
            if (has('hood')) this._gearHood();
            if (has('helmet')) this._gearHelmet(false);
            if (has('hornhelm')) this._gearHelmet(true);
            if (has('crown')) this._gearCrown();
            if (has('headwrap')) this._gearHeadwrap();
            if (has('bonemask')) this._gearMask(false);
            if (has('skullmask')) this._gearMask(true);
            if (has('warpaint')) this._gearWarPaint();
            if (has('feather')) this._gearFeather();
            if (has('mutation')) this._gearMutation();
            if (has('shadowmotes')) this._gearMotes(0x6a30aa, 0x9b40ff);
            if (has('firemotes')) this._gearMotes(0xff6622, 0xffaa33);
            if (has('torch')) this._gearTorch();
            if (has('bell')) this._gearBell();
            if (has('robotic')) this._gearRobotic();
            if (has('glitter')) this._gearGlitter();
            if (has('mount')) this._gearMount();
            if (has('gnomehat')) this._gearGnomeHat();
        }
        // Iconic tall red cone hat for gnomes (child of the head mesh).
        _gearGnomeHat() {
            if (!this.head) return;
            const red = this._gmat(0xcc2222, 0.7);
            const cone = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.95, 14), red); cone.position.set(0.03, 0.5, 0); cone.rotation.z = -0.08; this.head.add(cone);
            const tip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), red); tip.position.set(0.1, 0.94, 0); this.head.add(tip);
        }
        _gmat(color, rough, metal, emissive) {
            return new THREE.MeshStandardMaterial({
                color, roughness: rough === undefined ? 0.7 : rough, metalness: metal || 0,
                emissive: new THREE.Color(emissive || 0x000000), emissiveIntensity: emissive ? 0.6 : 0
            });
        }
        _gearCorpsePaint() {
            if (this.head && this.head.material) { this.head.material.map = null; this.head.material.color.setHex(0xe9e4d8); this.head.material.needsUpdate = true; }
            const black = this._gmat(0x080808, 0.5);
            for (const ex of [-0.12, 0.12]) { const patch = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), black); patch.scale.set(1, 1.1, 0.35); patch.position.set(ex, 0.05, 0.30); if (this.head) this.head.add(patch); }
            const smear = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.04), black); smear.position.set(0, -0.08, 0.33); if (this.head) this.head.add(smear);
        }
        _gearSpikes() {
            const mat = this._gmat(0x141414, 0.4, 0.6);
            for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const sp = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 4), mat); sp.position.set(Math.cos(a) * 0.32, 0.42, Math.sin(a) * 0.32); sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.cos(a), 0.3, Math.sin(a)).normalize()); if (this.torso) this.torso.add(sp); }
        }
        _gearStuds() {
            const mat = this._gmat(0x0a0a0a, 0.3, 0.7);
            [this.leftForearm, this.rightForearm].forEach(arm => { if (!arm) return; for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; const st = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), mat); st.position.set(Math.cos(a) * 0.09, 0.05, Math.sin(a) * 0.09); arm.add(st); } });
        }
        _gearLoincloth() {
            const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.34, 8, 1, true), this._gmat(0x6b4a2a, 0.95)); skirt.material.side = THREE.DoubleSide; skirt.position.y = -0.45; if (this.torso) this.torso.add(skirt);
        }
        _gearLeatherChest() {
            const vest = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.44, 0.6, 8, 1, true), this._gmat(0x5a3a22, 0.9)); vest.material.side = THREE.DoubleSide; vest.position.y = 0.05; if (this.torso) this.torso.add(vest);
        }
        _gearHarness() {
            const mat = this._gmat(0x3a2818, 0.9);
            for (const r of [0.5, -0.5]) { const strap = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.03, 6, 16), mat); strap.rotation.x = Math.PI / 2; strap.rotation.z = r; strap.position.y = 0.1; if (this.torso) this.torso.add(strap); }
        }
        _gearBoneNecklace() {
            const mat = this._gmat(0xe8e0d0, 0.5);
            for (let i = 0; i < 7; i++) { const a = (i / 6) * Math.PI - Math.PI / 2; const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.1, 4), mat); bone.position.set(Math.sin(a) * 0.3, 0.3 - Math.cos(a) * 0.04, 0.28); if (this.torso) this.torso.add(bone); }
        }
        _gearPauldrons(spiked) {
            const mat = this._gmat(spiked ? 0x161616 : 0x4a3422, spiked ? 0.4 : 0.8, spiked ? 0.6 : 0);
            [this.leftUpperArm, this.rightUpperArm].forEach((arm, idx) => { if (!arm) return; const pad = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat); pad.position.set(0, 0.16, 0); arm.add(pad); if (spiked) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 4), mat); sp.position.set((idx ? 1 : -1) * 0.08, 0.22, 0); sp.rotation.z = (idx ? -1 : 1) * 0.6; arm.add(sp); } });
        }
        _gearCape() {
            const mat = this._gmat(0x4a1018, 0.9); mat.side = THREE.DoubleSide;
            const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.9), mat); cape.position.set(0, -0.05, -0.28); cape.rotation.x = 0.12; if (this.torso) this.torso.add(cape);
        }
        _gearQuiver() {
            const mat = this._gmat(0x4a3420, 0.9), featherMat = this._gmat(0xb0a070, 0.8);
            const q = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.4, 8), mat); q.position.set(-0.18, 0.1, -0.28); q.rotation.x = 0.3; q.rotation.z = -0.3; if (this.torso) this.torso.add(q);
            for (let i = 0; i < 3; i++) { const ar = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4), this._gmat(0x6b4a2a, 0.9)); ar.position.set(-0.18 + i * 0.03, 0.32, -0.3); ar.rotation.z = -0.3; if (this.torso) this.torso.add(ar); const fl = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 4), featherMat); fl.position.set(-0.18 + i * 0.03, 0.45, -0.31); if (this.torso) this.torso.add(fl); }
        }
        _gearHood() {
            const mat = this._gmat(this.profile.blackMetal ? 0x1a1a1a : 0x3a2e1e, 0.9); mat.side = THREE.DoubleSide;
            const hood = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.5, 8, 1, true), mat); hood.position.set(0, 0.18, -0.04); if (this.head) this.head.add(hood);
            const drape = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.3, 8, 1, true), mat); drape.position.set(0, -0.2, -0.05); if (this.head) this.head.add(drape);
        }
        // ── HAIR: static procedural hair from the shared core library ────────
        // No bones, no per-frame update, no physics: it is built once onto the
        // head mesh and rides the rig's FK for free.
        //
        // An explicit profile.hair ({style, color}) always wins -- that is how
        // the player's character creator drives it. Otherwise a fleshy humanoid
        // rolls its own off idRand, which is keyed to the enemy id + the world
        // seed, so two goblins with different enemy ids get different hair and a
        // new world seed re-rolls the whole cast. Bone/metal/stone bodies and
        // anything already wearing headgear stay bald.
        _applyHair() {
            const H = window.Battler3D && window.Battler3D.Hair;
            if (!H || !this.head) return;
            const p = this.profile || {};
            let style, color;
            if (p.hair && p.hair.style) {
                style = p.hair.style;
                color = (p.hair.color != null) ? p.hair.color : H.colorHex('brown');
            } else {
                if (BALD_POOLS.indexOf(String(p.texturePool || 'flesh')) >= 0) return;
                const gear = p.gear || [];
                for (const k of HEADGEAR_KEYS) if (gear.indexOf(k) >= 0) return;
                const roll = H.roll(() => this.idRand(), { noHelmet: true });
                style = roll.style; color = roll.color;
            }
            if (!style || style === 'bald') return;
            if (style === 'helmet') { this._gearHelmet(false); return; }
            const hair = H.build(style, 0.35, this._gmat(color, 0.85));
            if (hair) this.head.add(hair);
        }

        _gearHelmet(horned) {
            const cap = new THREE.Mesh(new THREE.SphereGeometry(0.37, 12, 10, 0, Math.PI * 2, 0, Math.PI / 1.7), this._gmat(0x55595e, 0.4, 0.7)); cap.position.y = 0.02; if (this.head) this.head.add(cap);
            if (horned) this._gearHorns(this.head, 0x2a1c12);
        }
        _gearHorns(parent, color) {
            const mat = this._gmat(color || 0xe8e0d0, 0.6);
            for (const s of [-1, 1]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.4, 6), mat); horn.position.set(s * 0.22, 0.28, -0.02); horn.rotation.z = s * 0.7; if (parent) parent.add(horn); }
        }
        _gearCrown() {
            const mat = this._gmat(0xd4af37, 0.3, 0.9, 0x4a3a10);
            const band = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.12, 10, 1, true), mat); band.material.side = THREE.DoubleSide; band.position.y = 0.28; if (this.head) this.head.add(band);
            for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const pt = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 4), mat); pt.position.set(Math.cos(a) * 0.34, 0.4, Math.sin(a) * 0.34); if (this.head) this.head.add(pt); }
        }
        _gearHeadwrap() {
            const mat = this._gmat(0xc8b89a, 0.9);
            const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.09, 8, 16), mat); wrap.rotation.x = Math.PI / 2; wrap.position.y = 0.18; if (this.head) this.head.add(wrap);
            const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.04), mat); tail.position.set(-0.28, 0.05, -0.05); if (this.head) this.head.add(tail);
        }
        _gearMask(skull) {
            const mask = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 12, 0, Math.PI * 2, Math.PI / 3, Math.PI / 2.2), this._gmat(skull ? 0xe9e4d8 : 0xcaa06a, 0.5)); mask.scale.set(1, 1, 0.5); mask.position.set(0, 0.02, 0.06); if (this.head) this.head.add(mask);
            const black = this._gmat(0x111111, 0.5);
            for (const ex of [-0.12, 0.12]) { const eh = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), black); eh.scale.set(1, 1.4, 0.3); eh.position.set(ex, 0.04, 0.32); if (this.head) this.head.add(eh); }
        }
        _gearWarPaint() {
            const mat = this._gmat(0xaa2222, 0.6);
            for (const ex of [-0.14, 0.14]) { const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.03), mat); stripe.position.set(ex, 0.0, 0.31); if (this.head) this.head.add(stripe); }
        }
        _gearFeather() {
            const quill = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4), this._gmat(0x6b4a2a, 0.8)); quill.position.set(0.16, 0.4, -0.12); quill.rotation.z = -0.4; if (this.head) this.head.add(quill);
            const vane = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 4), this._gmat(0xcc4444, 0.7)); vane.position.set(0.22, 0.52, -0.12); vane.rotation.z = -0.4; if (this.head) this.head.add(vane);
        }
        _gearMutation() {
            const mat = this._gmat(0x7a6a8a, 0.6, 0, 0x221033);
            for (let i = 0; i < 5; i++) { const lump = new THREE.Mesh(new THREE.SphereGeometry(0.08 + this.idRand() * 0.06, 8, 8), mat); const a = this.idRand() * Math.PI * 2, h = -0.2 + this.idRand() * 0.6; lump.position.set(Math.cos(a) * 0.34, h, Math.sin(a) * 0.3); if (this.torso) this.torso.add(lump); }
            if (this.rightUpperArm) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10), this._gmat(0xffee88, 0.2, 0, 0x664400)); eye.position.set(0, 0.15, 0.08); this.rightUpperArm.add(eye); }
        }
        _gearMotes(coreColor, glowColor) {
            this._motesGroup = new THREE.Group();
            for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const mo = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), this._gmat(coreColor, 0.3, 0, glowColor)); mo.position.set(Math.cos(a) * 0.45, 0.3 + Math.sin(a * 2) * 0.3, Math.sin(a) * 0.45); this._motesGroup.add(mo); }
            this.bodyGroup.add(this._motesGroup);
        }
        _gearTorch() {
            if (!this.leftHand) return;
            const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.4, 6), this._gmat(0x4a3420, 0.9)); handle.position.set(0, -0.1, 0); this.leftHand.add(handle);
            const flame = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.24, 8), this._gmat(0xff6622, 0.2, 0, 0xff8833)); flame.position.set(0, 0.18, 0); this.leftHand.add(flame);
        }
        // Bell Goblin: not a goblin RINGING a bell -- a goblin WEARING one. The
        // giant bell swallows it from the hips up so only the legs show, and it
        // is parented to the torso so it bobs and sways with the body.
        //
        // Nothing about the goblin itself is hidden: the shell is open-bottomed
        // and every surface is DoubleSide, so looking up from underneath you see
        // the inside of the bell, the clapper, and the goblin still standing in
        // there. Local coordinates are torso-relative (the torso sits at y 1.1,
        // the hips at 0.7 and the crown of the head at ~2.1).
        _gearBell() {
            if (!this.torso) return;
            const mat = this._gmat(0xb8860b, 0.3, 0.8, 0x3a2a08);
            const shell = () => { const m = mat.clone(); m.side = THREE.DoubleSide; return m; };
            const bell = new THREE.Group();
            // Flared skirt, open at the bottom: world y 0.60 (below the hips) to 2.10.
            const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.95, 1.5, 24, 1, true), shell());
            skirt.position.y = 0.25; bell.add(skirt);
            const lip = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.07, 8, 24), mat);
            lip.position.y = -0.5; lip.rotation.x = Math.PI / 2; bell.add(lip);
            const waist = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.05, 8, 24), mat);
            waist.position.y = 0.45; waist.rotation.x = Math.PI / 2; bell.add(waist);
            // Domed crown + hanging loop.
            const crown = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), shell());
            crown.position.y = 1.0; crown.scale.y = 0.55; bell.add(crown);
            const loop = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.05, 8, 14), mat);
            loop.position.y = 1.42; bell.add(loop);
            // Clapper, hung down the FRONT of the interior so it clears the head
            // and torso on the centre axis and is the first thing you see when
            // looking up into the bell.
            const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 6), mat);
            stem.position.set(0, 0.55, 0.55); bell.add(stem);
            const ball = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10), mat);
            ball.position.set(0, 0.05, 0.55); bell.add(ball);
            this.bellShell = bell;
            this.torso.add(bell);
        }
        // Glitter Goblin: futuristic chrome plating - visor, antenna, chest core.
        _gearRobotic() {
            const chrome = this._gmat(0xbfc6cf, 0.25, 0.95);
            const glow = this._gmat(0x22e6ff, 0.2, 0.3, 0x22e6ff);
            if (this.head) {
                const visor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.08), this._gmat(0x111418, 0.2, 0.6, 0x22e6ff)); visor.position.set(0, 0.05, 0.30); this.head.add(visor);
                const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 5), chrome); ant.position.set(0.12, 0.42, 0); this.head.add(ant);
                const tip = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), glow); tip.position.set(0.12, 0.58, 0); this.head.add(tip);
            }
            if (this.torso) {
                const panel = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.4, 0.06), chrome); panel.position.set(0, 0.05, 0.30); this.torso.add(panel);
                const core = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 10), glow); core.position.set(0, 0.05, 0.34); this.torso.add(core);
            }
            [this.leftForearm, this.rightForearm].forEach(a => { if (a) { const br = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.2, 8), chrome); a.add(br); } });
        }
        // A drifting cloud of rainbow glitter shards around the body.
        _gearGlitter() {
            this._glitter = new THREE.Group();
            const colors = [0xff4fd8, 0x4fd8ff, 0xfff14f, 0x9b5cff, 0x5cff9b];
            for (let i = 0; i < 24; i++) {
                const c = colors[i % colors.length];
                const bit = new THREE.Mesh(new THREE.TetrahedronGeometry(0.04, 0), this._gmat(c, 0.1, 0.4, c));
                const a = this.idRand() * Math.PI * 2, e = this.idRand() * Math.PI, r = 0.5 + this.idRand() * 0.5;
                bit.position.set(Math.sin(e) * Math.cos(a) * r, 0.9 + Math.cos(e) * 0.8, Math.sin(e) * Math.sin(a) * r);
                this._glitter.add(bit);
            }
            this.bodyGroup.add(this._glitter);
        }
        // A procedural wolf mount beneath the rider (not a body part, so it never
        // dismembers). Sits in model-space under the goblin's hips.
        _gearMount() {
            const fur = this._gmat(0x4a4038, 0.9), dark = this._gmat(0x2a241e, 0.9);
            this._mount = new THREE.Group();
            const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 1.0, 6, 10), fur); body.rotation.z = Math.PI / 2; body.position.set(0, 0.6, 0.1); this._mount.add(body);
            const chest = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 10), fur); chest.position.set(0, 0.62, 0.7); chest.scale.set(1, 1, 0.9); this._mount.add(chest);
            const head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12), fur); skull.scale.set(0.9, 0.9, 1.1); head.add(skull);
            const snout = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.3, 8), fur); snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.04, 0.26); head.add(snout);
            for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 4), fur); ear.position.set(s * 0.13, 0.24, -0.02); head.add(ear); }
            for (const x of [-0.1, 0.1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), this._gmat(0xffcc33, 0.2, 0, 0xaa7700)); eye.position.set(x, 0.06, 0.2); head.add(eye); }
            head.position.set(0, 0.86, 1.05); this._mount.add(head);
            const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.02, 0.5, 6), fur); tail.position.set(0, 0.72, -0.7); tail.rotation.x = -0.6; this._mount.add(tail);
            const leg = (x, z) => { const g = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.6, 6), dark); g.position.set(x, 0.3, z); this._mount.add(g); };
            leg(-0.22, 0.6); leg(0.22, 0.6); leg(-0.22, -0.4); leg(0.22, -0.4);
            const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.62), this._gmat(0x6b2a2a, 0.9)); saddle.position.set(0, 0.92, 0.0); this._mount.add(saddle);
            this.bodyGroup.add(this._mount);
        }

        _buildWeaponMesh() {
            const woodMat  = new THREE.MeshStandardMaterial({ color: 0x5C4033, roughness: 0.9 });
            const metalMat = new THREE.MeshStandardMaterial({ color: 0xAAAAAA, roughness: 0.3, metalness: 0.8 });
            const darkMat  = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
            this.weaponMesh = new THREE.Group();
            switch (this.weaponType) {
                case 1: { // Light (Dagger)
                    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.18, 6), woodMat);
                    h.position.y = -0.09; this.weaponMesh.add(h);
                    const b = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.25, 4), metalMat);
                    b.scale.z = 0.2; b.position.y = 0.125; this.weaponMesh.add(b);
                    break;
                }
                case 2: { // Sword
                    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.2, 6), woodMat);
                    h.position.y = -0.1; this.weaponMesh.add(h);
                    const g = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.025, 0.04), metalMat);
                    g.position.y = 0.01; this.weaponMesh.add(g);
                    const b = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, 0.01), metalMat);
                    b.position.y = 0.24; this.weaponMesh.add(b);
                    break;
                }
                case 3: { // Heavy (Hammer)
                    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.55, 6), woodMat);
                    h.position.y = -0.15; this.weaponMesh.add(h);
                    const hd = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.12), metalMat);
                    hd.position.y = 0.18; this.weaponMesh.add(hd);
                    break;
                }
                case 4: { // Axe
                    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.4, 6), woodMat);
                    h.position.y = -0.08; this.weaponMesh.add(h);
                    const hd = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.12, 0.18, 4), metalMat);
                    hd.rotation.z = Math.PI / 2; hd.position.set(0.09, 0.18, 0); this.weaponMesh.add(hd);
                    break;
                }
                case 5: { // Whip
                    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.015, 0.12, 6), woodMat);
                    h.position.y = -0.05; this.weaponMesh.add(h);
                    const curve = new THREE.CatmullRomCurve3([
                        new THREE.Vector3(0, 0.02, 0), new THREE.Vector3(0.05, 0.1, 0.02),
                        new THREE.Vector3(-0.03, 0.18, 0.06), new THREE.Vector3(0.02, 0.24, 0.12),
                        new THREE.Vector3(-0.01, 0.28, 0.22)
                    ]);
                    this.weaponMesh.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.008, 4, false), darkMat));
                    break;
                }
                case 6: { // Staff
                    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.75, 6), woodMat);
                    p.position.y = 0.05; this.weaponMesh.add(p);
                    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), new THREE.MeshBasicMaterial({ color: 0x44aaff }));
                    orb.position.y = 0.45; this.weaponMesh.add(orb);
                    break;
                }
                case 7: { // Bow
                    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.018, 6, 12, Math.PI), woodMat);
                    arc.position.y = 0.1; this.weaponMesh.add(arc);
                    const str = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.44, 4), new THREE.MeshStandardMaterial({ color: 0xffffff }));
                    str.position.set(-0.22, 0.1, 0); str.rotation.z = Math.PI / 2; this.weaponMesh.add(str);
                    break;
                }
                case 8: { // Projectile (Dart/Kunai)
                    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.01, 0.1, 4), darkMat);
                    h.position.y = -0.04; this.weaponMesh.add(h);
                    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.1, 4), metalMat);
                    tip.position.y = 0.08; this.weaponMesh.add(tip);
                    this.weaponMesh.scale.setScalar(0.6);
                    break;
                }
                case 9: { // Gun
                    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.04), darkMat);
                    grip.rotation.z = Math.PI / 4; grip.position.y = -0.04; this.weaponMesh.add(grip);
                    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 6), metalMat);
                    barrel.rotation.z = Math.PI / 2; barrel.position.set(0.1, 0.04, 0); this.weaponMesh.add(barrel);
                    break;
                }
                case 10: { // Claw
                    this.weaponMesh.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.08), darkMat));
                    for (let ci = -1; ci <= 1; ci++) {
                        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.12, 4), metalMat);
                        claw.position.set(ci * 0.045, 0.08, 0.02); claw.rotation.x = -0.3;
                        this.weaponMesh.add(claw);
                    }
                    break;
                }
                case 11: { // Glove
                    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), darkMat);
                    glove.scale.set(1.0, 0.85, 0.85); this.weaponMesh.add(glove);
                    break;
                }
                case 12: { // Spear
                    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.85, 6), woodMat);
                    pole.position.y = 0.05; this.weaponMesh.add(pole);
                    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.18, 5), metalMat);
                    tip.position.y = 0.52; this.weaponMesh.add(tip);
                    break;
                }
            }
        }

        // Build the body-part -> mesh map and the dismemberment cascade rules.
        // Supports BOTH the goblin's detailed part keys and the simple
        // HEAD/TORSO/LEFT_ARM schema used by other humanoid archetypes
        // (skeleton/undead/ogre/...).
        _wireDismemberment() {
            // Covers the goblin's detailed keys, the simple HEAD/TORSO/LEFT_ARM
            // schema, and the full 30-part Humanoid schema + armour/construct keys.
            const HEAD_PARTS  = ['SKULL','BRAIN','HEAD','HEAD_LEFT','HEAD_RIGHT','EYE_LEFT','EYE_RIGHT','LEFT_EYE','RIGHT_EYE','EAR_LEFT','EAR_RIGHT','LEFT_EAR','RIGHT_EAR','NOSE','MOUTH','TONGUE','TEETH','HORNS','FANGS','HELMET','BEARD','HAT','SENSORS','EYE_CLUSTER'];
            const TORSO_PARTS = ['TORSO','RIBCAGE','PELVIS','HEART','LUNGS','LEFT_LUNG','RIGHT_LUNG','LIVER','KIDNEYS','STOMACH','SMALL_INTESTINE','LARGE_INTESTINE','INTESTINES','PANCREAS','SPLEEN','GENITALS','POWER_STITCH','CORE','BODY','MASS','ROBE','CHESTPLATE','PIXIE_DUST_SAC'];
            HEAD_PARTS.forEach(k => { this._partMeshMap[k] = this.head; });
            TORSO_PARTS.forEach(k => { this._partMeshMap[k] = this.torso; });
            Object.assign(this._partMeshMap, {
                LEFT_UPPER_ARM: this.leftUpperArm,  LEFT_ARM: this.leftUpperArm,  PAULDRON_LEFT: this.leftUpperArm,
                LEFT_FOREARM:   this.leftForearm,
                LEFT_HAND:      this.leftHand,      LEFT_FINGERS: this.leftHand,
                RIGHT_UPPER_ARM: this.rightUpperArm, RIGHT_ARM: this.rightUpperArm, PAULDRON_RIGHT: this.rightUpperArm, ARM_CANNON: this.rightUpperArm,
                RIGHT_FOREARM:  this.rightForearm,
                RIGHT_HAND:     this.rightHand,     RIGHT_FINGERS: this.rightHand,  CLAWS: this.rightHand,
                LEFT_THIGH:     this.leftThigh,      LEFT_LEG: this.leftThigh,      GREAVES_LEFT: this.leftThigh,  LEG_JOINTS: this.leftThigh,
                LEFT_SHIN:      this.leftShin,
                LEFT_FOOT:      this.leftFoot,      LEFT_TOES: this.leftFoot,
                RIGHT_THIGH:    this.rightThigh,     RIGHT_LEG: this.rightThigh,    GREAVES_RIGHT: this.rightThigh,
                RIGHT_SHIN:     this.rightShin,
                RIGHT_FOOT:     this.rightFoot,     RIGHT_TOES: this.rightFoot,
            });

            // Cascade (parent-first; union semantics reproduce the goblin chain).
            this._cascadeRules = [
                { gone: ['SKULL','BRAIN','HEAD'],        hide: [this.head] },
                { gone: ['LEFT_UPPER_ARM','LEFT_ARM'],   hide: [this.leftUpperArm, this.leftForearm, this.leftHand] },
                { gone: ['LEFT_FOREARM'],                hide: [this.leftForearm, this.leftHand] },
                { gone: ['LEFT_HAND'],                   hide: [this.leftHand] },
                { gone: ['RIGHT_UPPER_ARM','RIGHT_ARM'], hide: [this.rightUpperArm, this.rightForearm, this.rightHand] },
                { gone: ['RIGHT_FOREARM'],               hide: [this.rightForearm, this.rightHand] },
                { gone: ['RIGHT_HAND'],                  hide: [this.rightHand] },
                { gone: ['LEFT_THIGH','LEFT_LEG'],       hide: [this.leftThigh, this.leftShin, this.leftFoot] },
                { gone: ['LEFT_SHIN'],                   hide: [this.leftShin, this.leftFoot] },
                { gone: ['LEFT_FOOT'],                   hide: [this.leftFoot] },
                { gone: ['RIGHT_THIGH','RIGHT_LEG'],     hide: [this.rightThigh, this.rightShin, this.rightFoot] },
                { gone: ['RIGHT_SHIN'],                  hide: [this.rightShin, this.rightFoot] },
                { gone: ['RIGHT_FOOT'],                  hide: [this.rightFoot] },
            ];

            // Optional appendages get their own mesh + cascade so they detach
            // independently rather than vanishing with the head/torso.
            if (this.hornsMesh) {
                this._partMeshMap.HORNS = this.hornsMesh;
                this._cascadeRules.push({ gone: ['HORNS'], hide: [this.hornsMesh] });
            }
            if (this.tailMesh) {
                this._partMeshMap.TAIL = this.tailMesh;
                this._cascadeRules.push({ gone: ['TAIL'], hide: [this.tailMesh] });
            }
            if (this.leftWing) {
                this._partMeshMap.LEFT_WING = this.leftWing;
                this._cascadeRules.push({ gone: ['LEFT_WING'], hide: [this.leftWing] });
            }
            if (this.rightWing) {
                this._partMeshMap.RIGHT_WING = this.rightWing;
                this._cascadeRules.push({ gone: ['RIGHT_WING'], hide: [this.rightWing] });
            }
            if (this.haloMesh) {
                this._partMeshMap.HALO = this.haloMesh;
                this._cascadeRules.push({ gone: ['HALO'], hide: [this.haloMesh] });
            }
            if (this.secondHead) {
                this._partMeshMap.HEAD_LEFT = this.head;
                this._partMeshMap.HEAD_RIGHT = this.secondHead;
                this._cascadeRules.push({ gone: ['HEAD_LEFT'], hide: [this.head] });
                this._cascadeRules.push({ gone: ['HEAD_RIGHT'], hide: [this.secondHead] });
            }
            if (this.cannonMesh) {
                this._partMeshMap.ARM_CANNON = this.cannonMesh;
                this._cascadeRules.push({ gone: ['ARM_CANNON'], hide: [this.cannonMesh] });
            }

            // Bespoke floating-skull splits: a lost core/torso collapses the whole
            // model (these read as a skull driving a frail body, so nothing should
            // linger once the body is gone).
            if (this.creatureType === 'hmn_gigglingskull' || this.creatureType === 'hmn_deathshead' || this.creatureType === 'hmn_skullkeeper') {
                this._cascadeRules.unshift({
                    gone: ['TORSO', 'BODY', 'CORE', 'RIBCAGE'],
                    hide: [this.torso, this.head, this.leftUpperArm, this.leftForearm, this.leftHand,
                           this.rightUpperArm, this.rightForearm, this.rightHand,
                           this.leftThigh, this.leftShin, this.leftFoot,
                           this.rightThigh, this.rightShin, this.rightFoot].filter(Boolean)
                });
            }
        }

        // Live (non-death) pose: kinematic torso + FK limbs + facial anim.
        animatePose(deltaTime) {
            const s  = this.scale;
            const t  = this.animTime;
            const prone = this._updateProne(deltaTime);

            // ── TORSO (kinematic) ────────────────────────────────────────────
            // Stand the torso at its nominal height and let the FK below pose
            // the limbs; a small bob/sway keeps the idle alive.
            const bob = Math.sin(t * 1.5) * 0.02;
            this.torso.position.set(0, 1.1 + bob, 0);
            this.torso.rotation.set(0, 0, Math.sin(t * 1.2) * 0.03);
            const tx = 0, ty = 1.1 + bob, tz = 0;


            // ── ANIMATION ANGLES ─────────────────────────────────────────────
            const wt = this.weaponType;
            // Whether the weapon in hand is a light one is a scan of a small
            // array, and it was scanned three or four times a frame for an answer
            // that cannot change once the creature is built. Asked once, on the
            // first frame, and kept on the battler after that.
            if (this._isLightWeapon === undefined) {
                this._isLightWeapon = LIGHT_WEAPONS.includes(wt);
                this._lightWeaponFor = wt;
            } else if (this._lightWeaponFor !== wt) {
                // A mimic or a transformation can hand it something else.
                this._isLightWeapon = LIGHT_WEAPONS.includes(wt);
                this._lightWeaponFor = wt;
            }
            const isLight = this._isLightWeapon;
            const atkSpeedMult  = isLight ? 1.6 : (wt === 3 ? 0.6 : 1.0);
            const atkSwingArc   = isLight ? 0.75 : (wt === 3 ? 1.65 : 1.1);
            const idleSlouch    = (wt === 3 ? 0.1 : 0) + (this.posture || 0);

            let lA = 0, rA = 0, lL = 0, rL = 0;
            let elbB = wt === 3 ? 0.45 : (isLight ? 0.2 : 0.28);
            // Per-arm elbow override (undefined -> falls back to shared elbB below).
            let lElb, rElb;
            // When set, the ARMS block solves the attacking arm(s) with the full
            // 2-DOF-shoulder + elbow-hinge IK (side punch / lateral weapon swing)
            // instead of the flat sagittal FK. Each entry: {pitch, abduct, elbow}.
            let armIK = null;

            if (this.currentAnimation === 'idle') {
                lA   =  Math.sin(t * 1.8) * 0.18;
                rA   = -Math.sin(t * 1.8) * 0.18 + idleSlouch;
                lL   =  Math.sin(t * 1.4) * 0.05;
                rL   = -Math.sin(t * 1.4) * 0.05;
                elbB = wt === 3 ? 0.4 : (isLight ? 0.18 : 0.22);
            } else if (this.currentAnimation === 'attack') {
                // A normal attack is a real SIDE PUNCH / lateral swing: the shoulder
                // abducts the arm out to the side (real elbow held away from the
                // body) and the elbow hinge snaps from a cocked guard to full
                // extension as the fist drives forward. Solved by fk2() below so the
                // limb never freezes into a stiff raised-arm "salute".
                if (wt === 0) {
                    // PUNCH: alternating cross. Each arm cocks out to the side with a
                    // bent elbow, then extends forward-and-in on its thrust; the two
                    // fists fire in opposite phase so they never rise together.
                    const ph = t * 9 * atkSpeedMult;
                    const rThrust = Math.max(0, Math.sin(ph));
                    const lThrust = Math.max(0, Math.sin(ph + Math.PI));
                    armIK = {
                        r: { pitch: 0.35 + rThrust * 1.00, abduct: 0.95 - rThrust * 0.55, elbow: 1.75 - rThrust * 1.55 },
                        l: { pitch: 0.35 + lThrust * 1.00, abduct: 0.95 - lThrust * 0.55, elbow: 1.75 - lThrust * 1.55 }
                    };
                    lL   =  Math.sin(t * 5) * 0.08;
                    rL   = -Math.sin(t * 5) * 0.08;
                } else {
                    // WEAPON STRIKE: the right arm winds up raised out to the side
                    // (elbow cocked) then swings across and down as the elbow extends;
                    // the held weapon is aligned to the forearm each frame (see the
                    // weapon block) so its blade tracks the swing at the correct angle.
                    const drive = Math.max(0, Math.sin(Math.PI * Math.min(1, t / 0.6))); // 0 -> 1 -> 0
                    armIK = {
                        r: { pitch: 0.45 + drive * 0.95, abduct: 0.85 - drive * 0.55, elbow: 1.25 - drive * 1.00 },
                        l: { pitch: 0.20, abduct: 0.18, elbow: 1.00 }
                    };
                    lL   =  Math.sin(t * 5) * 0.1;
                    rL   = -Math.sin(t * 5) * 0.1;
                }
            } else if (this.currentAnimation === 'specialattack') {
                const ph = t * 13;
                lA   =  Math.sin(ph)  * 1.7;
                rA   =  Math.cos(ph)  * 1.7;
                lL   =  Math.sin(t * 8) * 0.22;
                rL   = -Math.cos(t * 8) * 0.22;
                elbB = 1.0;
            } else if (this.currentAnimation === 'hit') {
                const f = Math.exp(-t * 8);
                lA = -f * 0.7;
                rA = -f * 0.7;
            } else if (this.currentAnimation === 'spawn') {
                const b = Math.exp(-t * 4);
                lA =  Math.sin(t * 18) * b * 0.65;
                rA = -Math.sin(t * 18) * b * 0.65;
            }

            // ── HEAD ─────────────────────────────────────────────────────────
            const headDX = this.secondHead ? 0.28 : 0; // flank two heads apart
            if (this.head && this.head.visible) {
                this.head.position.set(tx - headDX, ty + 0.65, tz + Math.sin(t * 0.9) * 0.01);
                this.head.rotation.set(Math.sin(t * 0.7) * 0.04, 0, headDX ? 0.06 : 0);
            }
            if (this.secondHead && this.secondHead.visible) {
                this.secondHead.position.set(tx + headDX, ty + 0.64, tz + Math.sin(t * 0.9 + 1.4) * 0.01);
                this.secondHead.rotation.set(Math.sin(t * 0.7 + 1.4) * 0.04, 0, -0.06);
            }

            // ── ARMS ─────────────────────────────────────────────────────────
            if (lElb === undefined) lElb = elbB;
            if (rElb === undefined) rElb = elbB;
            // Shoulders ride on the torso's ACTUAL width: load() scales the torso
            // and the limbs by (bb,1,bb) for the per-creature bulk, so a fixed
            // +/-0.42 anchor left every gaunt profile's arms (skeleton bodyBulk
            // 0.68, undead, vampire, fairy) hanging in the air beside the chest.
            const shX = 0.42 * (this._bulk || 1);
            const lSh = { x: tx - shX, y: ty + 0.2, z: tz };
            const rSh = { x: tx + shX, y: ty + 0.2, z: tz };
            // A held weapon is aligned to the forearm only while it is actively
            // swinging (attack); otherwise it keeps its own gentle upright sway.
            const weaponFollowsArm = !!armIK;
            let lWr, rWr;
            if (armIK) {
                // Full IK: side punch / lateral weapon swing. Solve left first so
                // _foreDir ends holding the RIGHT forearm's forward (weapon aligns).
                lWr = fk2(this.leftUpperArm,  this.leftForearm,  this.leftHand,
                          lSh.x, lSh.y, lSh.z, armIK.l.pitch, armIK.l.abduct, armIK.l.elbow, -1, 0.35, 0.35);
                rWr = fk2(this.rightUpperArm, this.rightForearm, this.rightHand,
                          rSh.x, rSh.y, rSh.z, armIK.r.pitch, armIK.r.abduct, armIK.r.elbow, +1, 0.35, 0.35);
            } else {
                const lEl = fk(this.leftUpperArm,  lSh.x, lSh.y, lSh.z, lA,        0.35);
                lWr = fk(this.leftForearm,   lEl.x, lEl.y, lEl.z, lA + lElb, 0.35);
                if (this.leftHand && this.leftHand.visible)  this.leftHand.position.set(lWr.x, lWr.y - 0.05, lWr.z + 0.02);

                const rEl = fk(this.rightUpperArm, rSh.x, rSh.y, rSh.z, rA,        0.35);
                rWr = fk(this.rightForearm,  rEl.x, rEl.y, rEl.z, rA + rElb, 0.35);
                if (this.rightHand && this.rightHand.visible) this.rightHand.position.set(rWr.x, rWr.y - 0.05, rWr.z + 0.02);
            }

            // ── WEAPON HOLD ──────────────────────────────────────────────────
            // Grip the weapon at the wrist and drive its shaft's WORLD pitch
            // directly (the weapon group is modelled along +Y: grip at the bottom,
            // head at the top). pitch 0 = shaft straight up (orb up), PI/2 = forward.
            // Setting it here, decoupled from the elbow, keeps the weapon held
            // upright at rest and lets it ARC FORWARD on a strike instead of lying
            // along the arm. Hidden if the weapon arm is gone.
            if (this.weaponMesh && this.weaponType !== 0 && !this.weaponDropped) {
                this.weaponMesh.visible = !!(this.rightForearm && this.rightForearm.visible);
                if (this.weaponMesh.visible) {
                    if (weaponFollowsArm) {
                        // The arm is solved by full IK (side swing): align the weapon's
                        // shaft (+Y, grip at bottom) to the RIGHT forearm's forward
                        // direction so the blade extends straight out of the fist at
                        // the correct angle through the whole arc, then nudge it a
                        // touch further along that direction so it rests past the hand.
                        this.weaponMesh.quaternion.setFromUnitVectors(_V_UP, _foreDir);
                        this.weaponMesh.position.set(
                            rWr.x + _foreDir.x * 0.05,
                            rWr.y + _foreDir.y * 0.05,
                            rWr.z + _foreDir.z * 0.05
                        );
                    } else {
                        let wp;
                        const anim = this.currentAnimation;
                        if (anim === 'specialattack') {
                            wp = -0.15 + Math.sin(t * 6) * 0.12;   // raised, channelling
                        } else if (anim === 'hit') {
                            wp = 0.15 + Math.exp(-t * 8) * 0.4;
                        } else {
                            wp = 0.12 + Math.sin(t * 1.4) * 0.04;  // idle: held upright, gentle sway
                        }
                        // Grip sits at the wrist, nudged forward so it rests in the fist.
                        this.weaponMesh.position.set(rWr.x, rWr.y, rWr.z + 0.05);
                        this.weaponMesh.rotation.set(wp, 0, 0);
                    }
                }
            } else if (this.weaponMesh && this.weaponType !== 0 && this.weaponDropped && this.weaponBody) {
                this.weaponMesh.visible = true;
                this.weaponMesh.position.copy(this.weaponBody.position).sub(this.model.position).divideScalar(s);
                this.weaponMesh.quaternion.copy(this.weaponBody.quaternion);
            }

            // ── LEGS, IK keeps feet at ground ────────────────────────────────
            const groundLY   = (-1.5 - this.model.position.y) / s;
            const footTargLY = groundLY + 0.05;
            const hipY       = ty - 0.4;
            const hipToGnd   = Math.max(0, hipY - footTargLY);
            const kneeBend   = 0.12 + Math.max(0, 0.4 - hipToGnd) * 0.6;

            const lHp = { x: tx - 0.2, y: hipY, z: tz };
            const lKn = fk(this.leftThigh, lHp.x, lHp.y, lHp.z, lL,             0.3);
            const lAn = fk(this.leftShin,  lKn.x, lKn.y, lKn.z, lL - kneeBend,  0.3);
            if (this.leftFoot && this.leftFoot.visible) {
                this.leftFoot.position.set(lAn.x, lAn.y - 0.05, lAn.z + 0.04);
                this.leftFoot.rotation.set(-(lL - kneeBend) * 0.35, 0, 0);
            }

            const rHp = { x: tx + 0.2, y: hipY, z: tz };
            const rKn = fk(this.rightThigh, rHp.x, rHp.y, rHp.z, rL,            0.3);
            const rAn = fk(this.rightShin,  rKn.x, rKn.y, rKn.z, rL - kneeBend, 0.3);
            if (this.rightFoot && this.rightFoot.visible) {
                this.rightFoot.position.set(rAn.x, rAn.y - 0.05, rAn.z + 0.04);
                this.rightFoot.rotation.set(-(rL - kneeBend) * 0.35, 0, 0);
            }

            // ── FACIAL ANIMATION ─────────────────────────────────────────────
            if (this.head && this.head.visible) {
                if (this.leftEyeMesh && this.rightEyeMesh && !this._isAsleep()) {
                    const isHit = this.currentAnimation === 'hit';
                    let eyeScaleY;
                    if (isHit) {
                        eyeScaleY = 1.0 + Math.exp(-t * 8) * 0.45;
                    } else {
                        const blinkRaw = Math.sin(t * 0.25 * Math.PI * 2);
                        const blinkVal = Math.pow(Math.max(0, blinkRaw), 14);
                        eyeScaleY = 1.0 - blinkVal * 0.92;
                    }
                    this.leftEyeMesh.scale.y  = eyeScaleY;
                    this.rightEyeMesh.scale.y = eyeScaleY;
                }
                if (this.mouthMesh) {
                    const anim = this.currentAnimation;
                    // A blow knocks the face out of its own shape: whatever the
                    // species wears from the bank is swapped for the plain round
                    // mouth and blown open into a circular shout, then handed back
                    // the moment the hit reaction is over.
                    if (this._mouthOpen && this._mouthOpen !== this._mouthShape) {
                        const shout = anim === 'hit';
                        if (this._mouthOpen.visible !== shout) {
                            this._mouthOpen.visible = shout;
                            this._mouthShape.visible = !shout;
                        }
                    }
                    let msx = 1.0, msy = 1.0;
                    if (anim === 'hit') {
                        // Kept square (x and y together) so the round mouth reads
                        // as a circle rather than a stretched slot.
                        const gasp = Math.sin(t * 20) * 0.09;
                        msx = 1.5 + gasp;
                        msy = 1.5 + gasp;
                    } else if (anim === 'specialattack') {
                        msx = 1.4;
                        msy = 0.6 + Math.abs(Math.sin(t * 14)) * 0.9;
                    } else {
                        msy = 0.85 + Math.sin(t * 0.35) * 0.12;
                    }
                    this.mouthMesh.scale.x += (msx - this.mouthMesh.scale.x) * 0.18;
                    this.mouthMesh.scale.y += (msy - this.mouthMesh.scale.y) * 0.18;
                }
            }

            // ── BESPOKE SKELETON-SPLIT IDLE FLOURISH ─────────────────────────
            // Floating-skull reskins (giggling skull / death's head / skull
            // keeper) share one idle case: an extra head bob + wobble so the big
            // skull reads as buoyant. Layered on top of the shared FK head pose.
            switch (this.creatureType) {
                case 'hmn_gigglingskull':
                case 'hmn_deathshead':
                case 'hmn_skullkeeper': {
                    if (this.currentAnimation === 'idle' && this.head && this.head.visible) {
                        this.head.position.y += Math.sin(t * 2.2) * 0.05;
                        this.head.rotation.z += Math.sin(t * 1.7) * 0.06;
                    }
                    break;
                }
            }

            // ── PRONE (both legs severed) ────────────────────────────────────
            // Last, so the finished pose is laid down as a whole. Untouched
            // while the creature still has a leg to stand on.
            if (prone > 0) this._applyProne(prone);
        }
    }

    //=========================================================================
    // Registration
    //=========================================================================
    const make = (scale, offsetY, enemy, weaponType, key) =>
        new HumanoidBattler3D(scale, offsetY, enemy, weaponType, key);

    // Every archetype in this family is registered through here so that a
    // profile which is rescaled after it is built (see worldScale) says so.
    const reg = (key, def) => {
        const p = CREATURE_PROFILES[key];
        if (p && p.worldScale) def.worldScale = p.worldScale;
        return window.Battler3D.registerArchetype(key, def);
    };
    reg('goblin',    { aliases: ['goblin', 'goblins'],       scale: CREATURE_PROFILES.goblin.scale,    create: make });
    reg('hobgoblin', { aliases: ['hobgoblin', 'hobgoblins'], scale: CREATURE_PROFILES.hobgoblin.scale, create: make });
    reg('orc',       { aliases: ['orc', 'orcs'],             scale: CREATURE_PROFILES.orc.scale,       create: make });
    reg('ogre',      { aliases: ['ogre', 'ogres'],           scale: CREATURE_PROFILES.ogre.scale,      weapon: 3, create: make });
    reg('skeleton',  { aliases: ['skeleton', 'skeletons', 'skele', 'bone', 'skull', 'ossuary', 'boneyard', 'bonechewer'], scale: CREATURE_PROFILES.skeleton.scale, create: make });
    reg('undead',    { aliases: ['undead', 'zombie', 'zombies', 'ghoul', 'ghouls', 'corpse', 'remains', 'revenant', 'thrall', 'shambler', 'wight', 'draugr', 'mummy', 'husk', 'cadaver', 'decaying', 'festering', 'rotting', 'reanimated', 'rotted', 'carrion', 'plaguebearer', 'wraithlike'], scale: CREATURE_PROFILES.undead.scale, create: make });
    reg('minotaur',  { aliases: ['minotaur', 'minotaurs', 'taurus'], scale: CREATURE_PROFILES.minotaur.scale, weapon: 4, create: make });
    reg('vampire',   { aliases: ['vampire', 'vampires', 'nosferatu', 'dracula'], scale: CREATURE_PROFILES.vampire.scale, create: make });
    reg('reptilian', { aliases: ['reptilian', 'reptile', 'lizardman', 'lizardfolk', 'saurian', 'lizard', 'basilisk', 'gecko', 'iguana', 'skink', 'varanus', 'komodo', 'sceloporus', 'newt', 'gila', 'chameleon'], scale: CREATURE_PROFILES.reptilian.scale, create: make });
    reg('constructedundead', { aliases: ['constructedundead', 'fleshgolem', 'frankenstein', 'abomination'], scale: CREATURE_PROFILES.constructedundead.scale, weapon: 0, create: make });
    reg('humanoid',  { aliases: ['humanoid', 'human', 'bandit', 'thug', 'soldier', 'villager', 'cultist', 'acolyte', 'novice', 'apprentice', 'pyromancer', 'mage', 'wizard', 'sorcerer', 'warlock', 'necromancer', 'archmage', 'arcanist', 'archer', 'assassin', 'commander', 'boxer', 'pugilist', 'hunter', 'sniper', 'raider', 'marauder', 'brigand', 'champion', 'master', 'sculptor', 'fighter', 'mercenary', 'cleric', 'druid', 'shaman', 'monk', 'priest', 'priestess', 'pirate', 'ninja', 'samurai', 'brawler', 'gladiator', 'rogue', 'ranger', 'cleric', 'initiate', 'poacher', 'raider', 'contender', 'slave', 'guard', 'warcaster', 'splicer', 'tanaka', 'messenger', 'host'], scale: CREATURE_PROFILES.humanoid.scale, create: make });
    reg('scarecrow', { aliases: ['scarecrow', 'scarecrows', 'strawman'], scale: CREATURE_PROFILES.scarecrow.scale, create: make });
    reg('robot',     { aliases: ['robot', 'robots', 'android', 'mech'], scale: CREATURE_PROFILES.robot.scale, weapon: 0, create: make });
    reg('golem',     { aliases: ['golem', 'golems', 'stonegolem', 'guardian', 'statue', 'construct', 'bulwark', 'idol', 'automaton', 'sentry', 'colossus_minor', 'gargoyle', 'monument', 'effigy', 'juggernaut'], scale: CREATURE_PROFILES.golem.scale, weapon: 0, create: make });
    reg('armoredknight', { aliases: ['armoredknight', 'knight', 'paladin', 'crusader'], scale: CREATURE_PROFILES.armoredknight.scale, weapon: 2, create: make });
    reg('elven',     { aliases: ['elven', 'elf', 'elves', 'elf'], scale: CREATURE_PROFILES.elven.scale, weapon: 7, create: make });
    reg('gnome',     { aliases: ['gnome', 'gnomes', 'dwarf', 'dwarves', 'kobold'], scale: CREATURE_PROFILES.gnome.scale, create: make });
    reg('demon',     { aliases: ['demon', 'demons', 'fiend', 'devil'], scale: CREATURE_PROFILES.demon.scale, weapon: 0, create: make });
    reg('wingeddemon', { aliases: ['wingeddemon', 'imp', 'gargoyle'], scale: CREATURE_PROFILES.wingeddemon.scale, weapon: 0, create: make });
    reg('angel',     { aliases: ['angel', 'angels', 'seraph', 'cherub'], scale: CREATURE_PROFILES.angel.scale, weapon: 0, create: make });
    reg('fairy',     { aliases: ['fairy', 'fairies', 'pixie', 'sprite', 'faerie'], scale: CREATURE_PROFILES.fairy.scale, weapon: 0, create: make });
    reg('humanoid_roguelite',   { aliases: ['humanoid_roguelite', 'roguelite', 'adventurer'], scale: CREATURE_PROFILES.humanoid_roguelite.scale, create: make });
    reg('doubleheadedhumanoid', { aliases: ['doubleheadedhumanoid', 'doubleheaded', 'ettin', 'twoheaded'], scale: CREATURE_PROFILES.doubleheadedhumanoid.scale, weapon: 3, create: make });
    reg('roboticdefender',      { aliases: ['roboticdefender', 'defender', 'sentinel', 'sentry bot'], scale: CREATURE_PROFILES.roboticdefender.scale, weapon: 0, create: make });

    // Goblin/Hobgoblin species: same rig, bespoke gear+weapon (see NAMED above).
    Object.keys(NAMED).forEach(k => reg(k, {
        aliases: [k], scale: CREATURE_PROFILES[k].scale, weapon: CREATURE_PROFILES[k].weapon, create: make
    }));
    if (window.Battler3D.registerNamed) {
        for (const key in NAMED) NAMED[key].forEach(n => window.Battler3D.registerNamed(n, key));
    }

    // Build a humanoid from an ad-hoc profile object (character-creation custom
    // party models). The profile is a CREATURE_PROFILES-shaped object; scale is
    // the final model scale (profile.scale when omitted).
    window.Battler3D.createCustomHumanoid = function (profile, scale, offsetY, battler, weaponType) {
        if (!profile || typeof profile !== 'object') return null;
        return new HumanoidBattler3D(scale || profile.scale || 2.6, offsetY || 0, battler || null, weaponType || 0, profile);
    };

    debugLog('Humanoid family registered');
})();
