//=============================================================================
// 3D Battler System - Birds Family
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Distinct procedural 3D models for the many "bird" enemies:
 * raptor (eagle/owl/vulture/falcon), corvid/songbird, waterfowl (duck/penguin/
 * flamingo), and roc (giant terror bird/griffon). Splits the single small-flyer
 * bird rig into recognisable body plans, and routes the bat-like ones to the
 * existing `bat`. Requires 3DBattlerSystem + loads AFTER 3DBattler_Winged.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * ============================================================================
 * 3D Battler - Birds Family
 * ============================================================================
 *
 * Every "bird" enemy carries <Archetype: Bird>, which the core resolves before
 * name-token aliases, so the aliases here alone would not reassign them -
 * registerNamed (which outranks the Archetype meta) pins each one to its body
 * plan. Four shared, parametric flyer shapes:
 *
 *   raptor    - upright bird of prey: hooked beak, brow ridge, broad feathered
 *               wings, gripping talons (eagle, falcon, hawk, owl, vulture)
 *   corvid    - small perching bird: slim body, straight beak, short wings,
 *               long tail (raven, crow, jay, pigeon, parrot, songbird)
 *   waterfowl - upright standing waterbird on webbed legs: flat bill, flipper
 *               wings, short neck (duck, penguin, flamingo)
 *   roc       - colossal bird of prey: huge wingspan, massive beak and talons
 *               (giant terror bird, roc, griffon)
 *
 * Bat-like enemies tagged <Archetype: Bird> (Eyeless Bat, Frozen Bat, ...) are
 * routed to the existing Winged `bat`. Leftover oddities (Catican, Tooth Fairy,
 * Umbral Basilisk) keep the generic Winged `bird` rig.
 *
 * Reuses the shared base: per-event id variation, part-losing dismemberment,
 * hit-flash, base action gestures and the physics-free death fade.
 *
 * MUST load AFTER BattleSystem/3DBattlerSystem AND 3DBattler_Winged.
 */

(() => {
    'use strict';

    if (typeof THREE === 'undefined') return;
    if (!window.Battler3D || !window.Battler3D.Base) {
        console.error('[3D Battler Birds] Core (3DBattlerSystem) not loaded first.');
        return;
    }

    const Base = window.Battler3D.Base;
    const debugLog = window.Battler3D.debugLog || function () {};

    // Feature-driven profiles: one builder reads these to shape each silhouette.
    const BIRD_PROFILES = {
        raptor:    { variant: 'raptor',    scale: 2.3, posture: 'hover', texturePool: 'pale', bodyColor: 0x6b5436, wingColor: 0x4a3a24, accent: 0xffcc33, beak: 'hook',     bodyR: 0.34, bodyTall: 1.3,  headR: 0.22, wingLen: 1.0,  wingZ: 0.07, feathers: 3, legs: 'talons', tail: 0.55, neck: 0, eyeFwd: 1, fierce: 1, hue: [0.08, 0.05], sat: [0.40, 0.15], lit: [0.35, 0.10] },
        corvid:    { variant: 'corvid',    scale: 1.9, posture: 'hover', texturePool: 'pale', bodyColor: 0x2b2d33, wingColor: 0x1c1e22, accent: 0x88aaff, beak: 'straight', bodyR: 0.26, bodyTall: 1.25, headR: 0.18, wingLen: 0.66, wingZ: 0.16, feathers: 0, legs: 'thin',   tail: 0.6,  neck: 0, eyeFwd: 0, fierce: 0, hue: [0.62, 0.12], sat: [0.12, 0.14], lit: [0.28, 0.12] },
        waterfowl: { variant: 'waterfowl', scale: 2.1, posture: 'stand', texturePool: 'pale', bodyColor: 0xdddde2, wingColor: 0xc8c8cf, accent: 0xff8a2a, beak: 'flat',     bodyR: 0.34, bodyTall: 1.35, headR: 0.20, wingLen: 0.42, wingZ: 0.45, feathers: 0, legs: 'webbed', tail: 0.22, neck: 1, eyeFwd: 0, fierce: 0, hue: [0.08, 0.12], sat: [0.15, 0.22], lit: [0.70, 0.12] },
        roc:       { variant: 'roc',       scale: 3.4, posture: 'hover', texturePool: 'pale', bodyColor: 0x55402a, wingColor: 0x3a2c1c, accent: 0xffaa22, beak: 'hook',     bodyR: 0.5,  bodyTall: 1.25, headR: 0.3,  wingLen: 1.55, wingZ: 0.06, feathers: 5, legs: 'talons', tail: 0.85, neck: 0, eyeFwd: 1, fierce: 1, hue: [0.07, 0.05], sat: [0.45, 0.15], lit: [0.30, 0.10] },

        // Bespoke firebirds (own builders; bypass the parametric path).
        sacredphoenix:   { variant: 'sacredphoenix',   scale: 2.7, front: true, texturePool: 'pale', bodyColor: 0xffb347, accent: 0xffe066, hue: [0.10, 0.04], sat: [0.85, 0.10], lit: [0.55, 0.10] },
        pyroclastphoenix:{ variant: 'pyroclastphoenix', scale: 2.7, front: true, texturePool: 'pale', bodyColor: 0x3a1410, accent: 0xff5522, hue: [0.02, 0.03], sat: [0.80, 0.12], lit: [0.22, 0.08] },

        //=====================================================================
        // Bespoke per-enemy Birds. Each carries its own palette/silhouette but
        // reuses a family builder (corvid/waterfowl/bat/raptor/roc) via `family`.
        //=====================================================================

        // ── Corvids (small perching birds: slim body, tail, short wings) ──────
        // Inside-out corvid: own builder (organs worn on the outside), bypasses
        // the parametric flyer path.
        brd_backwardsbird: { variant: 'brd_backwardsbird', family: 'corvid', scale: 1.9, posture: 'hover', texturePool: 'pale', bodyColor: 0x8a3a40, wingColor: 0x22201c, accent: 0xb0505c, beak: 'straight', bodyR: 0.3, bodyTall: 1.2, headR: 0.17, wingLen: 0.7, wingZ: 0.16, feathers: 0, legs: 'thin', tail: 0.6, neck: 0, eyeFwd: 0, fierce: 0, headBack: 1, insideOut: 1, crest: 0, hue: [0.98, 0.04], sat: [0.45, 0.12], lit: [0.30, 0.08] },
        brd_bluejay:       { variant: 'brd_bluejay',       family: 'corvid', scale: 1.7, posture: 'hover', texturePool: 'pale', bodyColor: 0x2f6fd6, wingColor: 0x1f4fa8, accent: 0xffffff, beak: 'straight', bodyR: 0.23, bodyTall: 1.2,  headR: 0.17, wingLen: 0.6,  wingZ: 0.16, feathers: 0, legs: 'thin', tail: 0.62, neck: 0, eyeFwd: 0, fierce: 0, crest: 1, hue: [0.6, 0.06], sat: [0.55, 0.12], lit: [0.5, 0.1] },
        brd_tinychick:     { variant: 'brd_tinychick',     family: 'corvid', scale: 1.15, posture: 'stand', texturePool: 'pale', bodyColor: 0xffe27a, wingColor: 0xf2cf5a, accent: 0x2a2a2a, beak: 'flat', bodyR: 0.3, bodyTall: 1.35, headR: 0.22, wingLen: 0.3, wingZ: 0.4, feathers: 0, legs: 'thin', tail: 0.14, neck: 0, eyeFwd: 0, fierce: 0, crest: 0, fluffy: 1, hue: [0.13, 0.03], sat: [0.6, 0.1], lit: [0.7, 0.08] },
        brd_tundracrow:    { variant: 'brd_tundracrow',    family: 'corvid', scale: 1.85, posture: 'hover', texturePool: 'pale', bodyColor: 0x1a1c22, wingColor: 0x101218, accent: 0xbfe3ff, beak: 'straight', bodyR: 0.26, bodyTall: 1.25, headR: 0.18, wingLen: 0.66, wingZ: 0.16, feathers: 0, legs: 'thin', tail: 0.6, neck: 0, eyeFwd: 0, fierce: 0, crest: 0, frost: 1, hue: [0.6, 0.1], sat: [0.1, 0.1], lit: [0.18, 0.08] },
        brd_ominousravenmurder: { variant: 'brd_ominousravenmurder', family: 'corvid', scale: 2.0, posture: 'hover', texturePool: 'pale', bodyColor: 0x181a1f, wingColor: 0x0e1014, accent: 0x99aaff, beak: 'straight', bodyR: 0.28, bodyTall: 1.3, headR: 0.19, wingLen: 0.72, wingZ: 0.16, feathers: 1, legs: 'thin', tail: 0.66, neck: 0, eyeFwd: 0, fierce: 1, crest: 0, hue: [0.62, 0.1], sat: [0.12, 0.1], lit: [0.16, 0.08] },
        brd_parrot:        { variant: 'brd_parrot',        family: 'corvid', scale: 1.7, posture: 'stand', texturePool: 'pale', bodyColor: 0x1fa63a, wingColor: 0xd6242a, accent: 0xffd21f, beak: 'hook', bodyR: 0.25, bodyTall: 1.25, headR: 0.18, wingLen: 0.58, wingZ: 0.18, feathers: 0, legs: 'thin', tail: 0.7, neck: 0, eyeFwd: 0, fierce: 0, crest: 1, hue: [0.33, 0.2], sat: [0.7, 0.1], lit: [0.45, 0.1] },
        brd_spectralsongbird: { variant: 'brd_spectralsongbird', family: 'corvid', scale: 1.6, posture: 'hover', texturePool: 'pale', bodyColor: 0x8fd6d0, wingColor: 0x6fb6b8, accent: 0xe0fffb, beak: 'straight', bodyR: 0.23, bodyTall: 1.2, headR: 0.16, wingLen: 0.58, wingZ: 0.2, feathers: 0, legs: 'thin', tail: 0.58, neck: 0, eyeFwd: 0, fierce: 0, crest: 0, ghost: 1, hue: [0.48, 0.06], sat: [0.35, 0.1], lit: [0.6, 0.1] },
        brd_nightwisp:     { variant: 'brd_nightwisp',     family: 'corvid', scale: 1.8, posture: 'hover', texturePool: 'pale', bodyColor: 0x201830, wingColor: 0x140f22, accent: 0xb088ff, beak: 'straight', bodyR: 0.25, bodyTall: 1.25, headR: 0.17, wingLen: 0.68, wingZ: 0.18, feathers: 0, legs: 'thin', tail: 0.64, neck: 0, eyeFwd: 1, fierce: 0, crest: 0, ghost: 1, hue: [0.72, 0.06], sat: [0.4, 0.1], lit: [0.2, 0.08] },
        brd_ominousraven:  { variant: 'brd_ominousraven',  family: 'corvid', scale: 1.95, posture: 'hover', texturePool: 'pale', bodyColor: 0x15161b, wingColor: 0x0c0d11, accent: 0x8899ff, beak: 'straight', bodyR: 0.27, bodyTall: 1.3, headR: 0.19, wingLen: 0.7, wingZ: 0.16, feathers: 0, legs: 'thin', tail: 0.66, neck: 0, eyeFwd: 0, fierce: 1, crest: 0, hue: [0.62, 0.1], sat: [0.12, 0.1], lit: [0.15, 0.08] },
        brd_badasspigeon:  { variant: 'brd_badasspigeon',  family: 'corvid', scale: 1.7, posture: 'stand', texturePool: 'pale', bodyColor: 0x6b7078, wingColor: 0x54585f, accent: 0x33ddaa, beak: 'straight', bodyR: 0.27, bodyTall: 1.2, headR: 0.17, wingLen: 0.56, wingZ: 0.16, feathers: 0, legs: 'thin', tail: 0.5, neck: 0, eyeFwd: 0, fierce: 0, crest: 0, hue: [0.6, 0.1], sat: [0.1, 0.12], lit: [0.42, 0.1] },

        // ── Waterfowl (upright, flat bill, webbed feet, flipper wings) ────────
        brd_flamingosentinel: { variant: 'brd_flamingosentinel', family: 'waterfowl', scale: 2.4, posture: 'stand', texturePool: 'pale', bodyColor: 0xff8ab0, wingColor: 0xff6f9c, accent: 0x2a2a2a, beak: 'flat', bodyR: 0.28, bodyTall: 1.3, headR: 0.16, wingLen: 0.4, wingZ: 0.4, feathers: 0, legs: 'webbed', tail: 0.22, neck: 2, eyeFwd: 0, fierce: 0, oneLeg: 1, hue: [0.95, 0.04], sat: [0.55, 0.1], lit: [0.66, 0.08] },
        brd_quackingduck:  { variant: 'brd_quackingduck',  family: 'waterfowl', scale: 2.0, posture: 'stand', texturePool: 'pale', bodyColor: 0xe8e4d2, wingColor: 0xcfc9b2, accent: 0xffa52a, beak: 'flat', bodyR: 0.34, bodyTall: 1.3, headR: 0.2, wingLen: 0.4, wingZ: 0.45, feathers: 0, legs: 'webbed', tail: 0.24, neck: 1, eyeFwd: 0, fierce: 0, hue: [0.13, 0.06], sat: [0.15, 0.12], lit: [0.72, 0.08] },
        brd_giantpenguin: { variant: 'brd_giantpenguin', family: 'waterfowl', scale: 2.6, posture: 'stand', texturePool: 'pale', bodyColor: 0x1c1f26, wingColor: 0x14161c, accent: 0xffb020, beak: 'flat', bodyR: 0.42, bodyTall: 1.45, headR: 0.24, wingLen: 0.34, wingZ: 0.5, feathers: 0, legs: 'webbed', tail: 0.16, neck: 0, eyeFwd: 0, fierce: 0, whiteBelly: 1, hue: [0.62, 0.06], sat: [0.1, 0.1], lit: [0.18, 0.08] },

        // ── Bats (leathery membrane wings, big ears, fanged) ─────────────────
        brd_frozenbat:     { variant: 'brd_frozenbat',     family: 'bat', scale: 1.7, posture: 'hover', texturePool: 'pale', bodyColor: 0x9fc4d8, wingColor: 0x6f9ab0, accent: 0xd0f4ff, beak: 'none', bodyR: 0.24, bodyTall: 1.15, headR: 0.18, wingLen: 0.9, wingZ: 0.03, feathers: 0, legs: 'thin', tail: 0.12, neck: 0, eyeFwd: 1, fierce: 0, frost: 1, hue: [0.55, 0.08], sat: [0.3, 0.1], lit: [0.55, 0.1] },
        brd_vegetalvampire:{ variant: 'brd_vegetalvampire',family: 'bat', scale: 1.6, posture: 'hover', texturePool: 'pale', bodyColor: 0x4a2a2f, wingColor: 0x8a1a24, accent: 0xff3a44, beak: 'none', bodyR: 0.24, bodyTall: 1.15, headR: 0.18, wingLen: 0.86, wingZ: 0.03, feathers: 0, legs: 'thin', tail: 0.12, neck: 0, eyeFwd: 1, fierce: 1, hue: [0.98, 0.04], sat: [0.6, 0.1], lit: [0.3, 0.1] },
        brd_crimsonsucker: { variant: 'brd_crimsonsucker', family: 'bat', scale: 1.7, posture: 'hover', texturePool: 'pale', bodyColor: 0x5a0f14, wingColor: 0x3a0a0e, accent: 0xff2a2a, beak: 'none', bodyR: 0.24, bodyTall: 1.15, headR: 0.18, wingLen: 0.9, wingZ: 0.03, feathers: 0, legs: 'thin', tail: 0.12, neck: 0, eyeFwd: 1, fierce: 1, fangy: 1, hue: [0.0, 0.03], sat: [0.75, 0.1], lit: [0.22, 0.08] },
        brd_eyelessbat:    { variant: 'brd_eyelessbat',    family: 'bat', scale: 1.6, posture: 'hover', texturePool: 'pale', bodyColor: 0x2a2620, wingColor: 0x1c1914, accent: 0x111111, beak: 'none', bodyR: 0.24, bodyTall: 1.15, headR: 0.19, wingLen: 0.88, wingZ: 0.03, feathers: 0, legs: 'thin', tail: 0.12, neck: 0, eyeFwd: 0, fierce: 1, eyeless: 1, fangy: 1, hue: [0.09, 0.05], sat: [0.2, 0.1], lit: [0.18, 0.08] },

        // ── Raptors (birds of prey: hooked beak, brow, talons, broad wings) ──
        brd_blizzardowl:   { variant: 'brd_blizzardowl',   family: 'raptor', scale: 2.2, posture: 'hover', texturePool: 'pale', bodyColor: 0xeef2f6, wingColor: 0xd6dee6, accent: 0xffd24a, beak: 'hook', bodyR: 0.34, bodyTall: 1.15, headR: 0.28, wingLen: 0.95, wingZ: 0.07, feathers: 3, legs: 'talons', tail: 0.5, neck: 0, eyeFwd: 1, fierce: 1, owl: 1, frost: 1, hue: [0.58, 0.08], sat: [0.08, 0.1], lit: [0.82, 0.08] },
        brd_giantvulture:  { variant: 'brd_giantvulture',  family: 'raptor', scale: 2.6, posture: 'hover', texturePool: 'pale', bodyColor: 0x3a332a, wingColor: 0x26211a, accent: 0xd94a2a, beak: 'hook', bodyR: 0.38, bodyTall: 1.3, headR: 0.2, wingLen: 1.2, wingZ: 0.06, feathers: 4, legs: 'talons', tail: 0.55, neck: 2, eyeFwd: 1, fierce: 1, bald: 1, hue: [0.09, 0.05], sat: [0.3, 0.1], lit: [0.28, 0.08] },
        brd_wiseowl:       { variant: 'brd_wiseowl',       family: 'raptor', scale: 2.1, posture: 'hover', texturePool: 'pale', bodyColor: 0x7a5c3a, wingColor: 0x5a4228, accent: 0xffcc33, beak: 'hook', bodyR: 0.34, bodyTall: 1.15, headR: 0.28, wingLen: 0.9, wingZ: 0.07, feathers: 3, legs: 'talons', tail: 0.5, neck: 0, eyeFwd: 1, fierce: 1, owl: 1, hue: [0.09, 0.05], sat: [0.4, 0.12], lit: [0.4, 0.1] },
        brd_dustdevilbird: { variant: 'brd_dustdevilbird', family: 'raptor', scale: 2.2, posture: 'hover', texturePool: 'pale', bodyColor: 0xc7a267, wingColor: 0xa9854a, accent: 0xffe0a0, beak: 'hook', bodyR: 0.32, bodyTall: 1.25, headR: 0.2, wingLen: 1.05, wingZ: 0.06, feathers: 3, legs: 'talons', tail: 0.55, neck: 0, eyeFwd: 1, fierce: 1, hue: [0.11, 0.05], sat: [0.45, 0.1], lit: [0.55, 0.1] },
        brd_mountaineagle: { variant: 'brd_mountaineagle', family: 'raptor', scale: 2.4, posture: 'hover', texturePool: 'pale', bodyColor: 0x5a3f24, wingColor: 0x3e2c18, accent: 0xffe27a, beak: 'hook', bodyR: 0.35, bodyTall: 1.3, headR: 0.22, wingLen: 1.15, wingZ: 0.06, feathers: 4, legs: 'talons', tail: 0.58, neck: 0, eyeFwd: 1, fierce: 1, whiteHead: 1, hue: [0.08, 0.04], sat: [0.5, 0.12], lit: [0.3, 0.1] },
        brd_peregrinefalcon:{ variant: 'brd_peregrinefalcon',family: 'raptor', scale: 2.0, posture: 'hover', texturePool: 'pale', bodyColor: 0x4a4f57, wingColor: 0x33373d, accent: 0xffcc33, beak: 'hook', bodyR: 0.3, bodyTall: 1.35, headR: 0.19, wingLen: 1.1, wingZ: 0.05, feathers: 2, legs: 'talons', tail: 0.6, neck: 0, eyeFwd: 1, fierce: 1, sleek: 1, hue: [0.6, 0.06], sat: [0.15, 0.1], lit: [0.4, 0.1] },
        brd_rotvulture:    { variant: 'brd_rotvulture',    family: 'raptor', scale: 2.4, posture: 'hover', texturePool: 'pale', bodyColor: 0x4a4030, wingColor: 0x322a20, accent: 0x8aaa2a, beak: 'hook', bodyR: 0.38, bodyTall: 1.3, headR: 0.2, wingLen: 1.12, wingZ: 0.06, feathers: 3, legs: 'talons', tail: 0.52, neck: 2, eyeFwd: 1, fierce: 1, bald: 1, rot: 1, hue: [0.12, 0.06], sat: [0.35, 0.1], lit: [0.3, 0.1] },
        brd_baldeagle:     { variant: 'brd_baldeagle',     family: 'raptor', scale: 2.4, posture: 'hover', texturePool: 'pale', bodyColor: 0x4a3320, wingColor: 0x32220f, accent: 0xffd21f, beak: 'hook', bodyR: 0.35, bodyTall: 1.3, headR: 0.22, wingLen: 1.18, wingZ: 0.06, feathers: 4, legs: 'talons', tail: 0.58, neck: 0, eyeFwd: 1, fierce: 1, whiteHead: 1, hue: [0.08, 0.04], sat: [0.5, 0.12], lit: [0.28, 0.1] },

        // ── Rocs (colossal birds of prey: huge wingspan, massive beak/talons) ─
        brd_griphon:       { variant: 'brd_griphon',       family: 'roc', scale: 3.2, posture: 'hover', texturePool: 'pale', bodyColor: 0x8a6a3a, wingColor: 0x6a4f28, accent: 0xffcc33, beak: 'hook', bodyR: 0.5, bodyTall: 1.2, headR: 0.3, wingLen: 1.5, wingZ: 0.06, feathers: 5, legs: 'talons', tail: 0.9, neck: 0, eyeFwd: 1, fierce: 1, maned: 1, hue: [0.1, 0.05], sat: [0.45, 0.12], lit: [0.4, 0.1] },
        brd_majesticgriffon:{ variant: 'brd_majesticgriffon',family: 'roc', scale: 3.5, posture: 'hover', texturePool: 'pale', bodyColor: 0xc9a24a, wingColor: 0xa9843a, accent: 0xfff0a0, beak: 'hook', bodyR: 0.52, bodyTall: 1.2, headR: 0.32, wingLen: 1.6, wingZ: 0.06, feathers: 6, legs: 'talons', tail: 0.95, neck: 0, eyeFwd: 1, fierce: 1, maned: 1, hue: [0.11, 0.04], sat: [0.55, 0.1], lit: [0.5, 0.1] },
        brd_stormharbinger:{ variant: 'brd_stormharbinger',family: 'roc', scale: 3.4, posture: 'hover', texturePool: 'pale', bodyColor: 0x3a4a66, wingColor: 0x28374f, accent: 0x9fe8ff, beak: 'hook', bodyR: 0.5, bodyTall: 1.25, headR: 0.3, wingLen: 1.6, wingZ: 0.05, feathers: 5, legs: 'talons', tail: 0.9, neck: 0, eyeFwd: 1, fierce: 1, storm: 1, hue: [0.58, 0.08], sat: [0.4, 0.1], lit: [0.35, 0.1] },
        brd_stormroc:      { variant: 'brd_stormroc',      family: 'roc', scale: 3.5, posture: 'hover', texturePool: 'pale', bodyColor: 0x8f7a52, wingColor: 0x6f5c38, accent: 0xffe0a0, beak: 'hook', bodyR: 0.52, bodyTall: 1.25, headR: 0.3, wingLen: 1.7, wingZ: 0.05, feathers: 6, legs: 'talons', tail: 0.9, neck: 0, eyeFwd: 1, fierce: 1, storm: 1, hue: [0.11, 0.05], sat: [0.4, 0.1], lit: [0.45, 0.1] },
        brd_thunderwingroc:{ variant: 'brd_thunderwingroc',family: 'roc', scale: 3.6, posture: 'hover', texturePool: 'pale', bodyColor: 0x2f2a3a, wingColor: 0x201c2a, accent: 0xffe83a, beak: 'hook', bodyR: 0.52, bodyTall: 1.25, headR: 0.3, wingLen: 1.7, wingZ: 0.05, feathers: 6, legs: 'talons', tail: 0.9, neck: 0, eyeFwd: 1, fierce: 1, storm: 1, hue: [0.7, 0.06], sat: [0.3, 0.1], lit: [0.22, 0.08] },
        brd_giantterrorbird:{ variant: 'brd_giantterrorbird',family: 'roc', scale: 3.3, posture: 'stand', texturePool: 'pale', bodyColor: 0x6a4a2a, wingColor: 0x4a3218, accent: 0xd94a2a, beak: 'hook', bodyR: 0.5, bodyTall: 1.5, headR: 0.34, wingLen: 0.7, wingZ: 0.08, feathers: 2, legs: 'talons', tail: 0.5, neck: 2, eyeFwd: 1, fierce: 1, flightless: 1, hue: [0.09, 0.05], sat: [0.45, 0.12], lit: [0.32, 0.1] },

        //=====================================================================
        // Level 1-5 starter birds: each one its own builder (LV_BUILDERS below),
        // none of them the parametric flyer.
        //=====================================================================
        lv_plazapigeon: { variant: 'lv_plazapigeon', scale: 1.6, texturePool: 'pale', bodyColor: 0x8a8e98, hue: [0.62, 0.08], sat: [0.1, 0.06], lit: [0.48, 0.1] },
        lv_housesparrow: { variant: 'lv_housesparrow', scale: 1.5, texturePool: 'pale', bodyColor: 0x8a6440, hue: [0.08, 0.03], sat: [0.4, 0.1], lit: [0.38, 0.08] },
        lv_farmyardchick: { variant: 'lv_farmyardchick', scale: 1.3, texturePool: 'pale', bodyColor: 0xffe27a, hue: [0.13, 0.03], sat: [0.7, 0.1], lit: [0.68, 0.08] },
        lv_harbourgull: { variant: 'lv_harbourgull', scale: 1.8, texturePool: 'pale', bodyColor: 0xf0f0ec, hue: [0.58, 0.06], sat: [0.06, 0.06], lit: [0.9, 0.05] },
        lv_glintmagpie: { variant: 'lv_glintmagpie', scale: 1.7, texturePool: 'pale', bodyColor: 0x15161a, hue: [0.62, 0.06], sat: [0.1, 0.06], lit: [0.1, 0.05] },
        lv_youngbarnowl: { variant: 'lv_youngbarnowl', scale: 1.8, texturePool: 'pale', bodyColor: 0xe8dcc4, hue: [0.1, 0.04], sat: [0.4, 0.1], lit: [0.85, 0.06] },
        lv_pipistrellebat: { variant: 'lv_pipistrellebat', scale: 1.5, texturePool: 'pale', bodyColor: 0x6a4a32, hue: [0.07, 0.03], sat: [0.4, 0.1], lit: [0.3, 0.08] },
        lv_fruitbat: { variant: 'lv_fruitbat', scale: 1.7, texturePool: 'pale', bodyColor: 0x3a2a22, hue: [0.06, 0.03], sat: [0.4, 0.1], lit: [0.2, 0.06] },
        lv_parkgoose: { variant: 'lv_parkgoose', scale: 2.0, texturePool: 'pale', bodyColor: 0x7a6a58, hue: [0.09, 0.04], sat: [0.18, 0.08], lit: [0.42, 0.08] },
        lv_greyheronfledgling: { variant: 'lv_greyheronfledgling', scale: 2.1, texturePool: 'pale', bodyColor: 0x8a9098, hue: [0.58, 0.06], sat: [0.08, 0.06], lit: [0.56, 0.08] },
        lv_snowsparrow: { variant: 'lv_snowsparrow', scale: 1.4, texturePool: 'pale', bodyColor: 0xb8a890, hue: [0.09, 0.04], sat: [0.25, 0.08], lit: [0.66, 0.08] },
        lv_penguinchick: { variant: 'lv_penguinchick', scale: 1.7, texturePool: 'pale', bodyColor: 0x8a8e94, hue: [0.58, 0.06], sat: [0.05, 0.05], lit: [0.56, 0.08] },
        lv_frostbitebat: { variant: 'lv_frostbitebat', scale: 1.6, texturePool: 'pale', bodyColor: 0xc8dce8, hue: [0.55, 0.05], sat: [0.3, 0.08], lit: [0.82, 0.06] },
        lv_whiteowlet: { variant: 'lv_whiteowlet', scale: 1.6, texturePool: 'pale', bodyColor: 0xf4f4f0, hue: [0.12, 0.05], sat: [0.06, 0.05], lit: [0.94, 0.04] },
        lv_wintercrow: { variant: 'lv_wintercrow', scale: 1.8, texturePool: 'pale', bodyColor: 0x16171c, hue: [0.62, 0.06], sat: [0.1, 0.06], lit: [0.1, 0.05] },
        lv_belfrybat: { variant: 'lv_belfrybat', scale: 1.5, texturePool: 'pale', bodyColor: 0x6e6258, hue: [0.08, 0.04], sat: [0.12, 0.06], lit: [0.4, 0.08] },
        lv_blesseddove: { variant: 'lv_blesseddove', scale: 1.7, texturePool: 'pale', bodyColor: 0xf6f4ee, hue: [0.12, 0.04], sat: [0.1, 0.06], lit: [0.94, 0.04] },
        lv_pitrooster: { variant: 'lv_pitrooster', scale: 1.8, texturePool: 'pale', bodyColor: 0x8a3a1c, hue: [0.04, 0.03], sat: [0.65, 0.1], lit: [0.32, 0.08] },
        lv_parrotchick: { variant: 'lv_parrotchick', scale: 1.5, texturePool: 'pale', bodyColor: 0xc89a90, hue: [0.02, 0.03], sat: [0.4, 0.1], lit: [0.68, 0.06] },
        lv_toucanfledgling: { variant: 'lv_toucanfledgling', scale: 1.8, texturePool: 'pale', bodyColor: 0x141418, hue: [0.62, 0.06], sat: [0.1, 0.06], lit: [0.09, 0.04] },
        lv_highwayhawkchick: { variant: 'lv_highwayhawkchick', scale: 1.6, texturePool: 'pale', bodyColor: 0xd8d4cc, hue: [0.09, 0.04], sat: [0.1, 0.06], lit: [0.82, 0.06] },
        lv_ferrygull: { variant: 'lv_ferrygull', scale: 1.8, texturePool: 'pale', bodyColor: 0xeeeeea, hue: [0.12, 0.05], sat: [0.08, 0.06], lit: [0.9, 0.05] },
        lv_canyonswift: { variant: 'lv_canyonswift', scale: 2.0, texturePool: 'pale', bodyColor: 0x4a423a, hue: [0.06, 0.04], sat: [0.12, 0.06], lit: [0.17, 0.06] }
    };

    // lv_ variant -> its builder method.
    const LV_BUILDERS = {
        lv_plazapigeon: '_buildPlazaPigeon',
        lv_housesparrow: '_buildHouseSparrow',
        lv_farmyardchick: '_buildFarmyardChick',
        lv_harbourgull: '_buildHarbourGull',
        lv_glintmagpie: '_buildGlintMagpie',
        lv_youngbarnowl: '_buildYoungBarnOwl',
        lv_pipistrellebat: '_buildPipistrelleBat',
        lv_fruitbat: '_buildFruitBat',
        lv_parkgoose: '_buildParkGoose',
        lv_greyheronfledgling: '_buildGreyHeronFledgling',
        lv_snowsparrow: '_buildSnowSparrow',
        lv_penguinchick: '_buildPenguinChick',
        lv_frostbitebat: '_buildFrostbiteBat',
        lv_whiteowlet: '_buildWhiteOwlet',
        lv_wintercrow: '_buildWinterCrow',
        lv_belfrybat: '_buildBelfryBat',
        lv_blesseddove: '_buildBlessedDove',
        lv_pitrooster: '_buildPitRooster',
        lv_parrotchick: '_buildParrotChick',
        lv_toucanfledgling: '_buildToucanFledgling',
        lv_highwayhawkchick: '_buildHighwayHawkChick',
        lv_ferrygull: '_buildFerryGull',
        lv_canyonswift: '_buildCanyonSwift'
    };

    class BirdBattler3D extends Base {
        constructor(scale, offsetY, battler, weaponType, creatureType) {
            const profile = BIRD_PROFILES[creatureType] || BIRD_PROFILES.raptor;
            super(scale, offsetY, battler, profile, 0, creatureType || 'raptor');
            this.variant = profile.variant;
            this._materials = [];
            this._baseY = null;
        }

        _mat(color, opacity, rough, emissive) {
            const m = new THREE.MeshStandardMaterial({
                color, roughness: (rough === undefined ? 0.7 : rough),
                emissive: new THREE.Color(emissive || 0x000000), emissiveIntensity: emissive ? 0.6 : 0,
                transparent: true, opacity: (opacity === undefined ? 1.0 : opacity)
            });
            this._materials.push(m); return m;
        }
        _bodyMat() {
            const p = this.profile;
            const m = new THREE.MeshStandardMaterial({ color: p.bodyColor, map: this.skinTex(), roughness: 0.85, transparent: true });
            this._materials.push(m); return m;
        }
        _wingMat() {
            const m = new THREE.MeshStandardMaterial({ color: this.profile.wingColor, roughness: 0.85, side: THREE.DoubleSide, transparent: true });
            this._materials.push(m); return m;
        }
        _eye(parent, x, y, z, r, accent, glow) {
            const e = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), this._mat(accent || 0x111111, 1.0, 0.2, glow ? accent : 0));
            e.position.set(x, y, z); parent.add(e); return e;
        }
        _skinMat(color, rough) { return this.applySkin(this._mat(color, 1.0, rough === undefined ? 0.7 : rough)); }

        async load(physicsWorld) {
            this.physicsWorld = physicsWorld; // unused (no ragdoll)
            const p = this.profile;

            // Bespoke firebirds / the inside-out corvid bypass the shared
            // parametric flyer build.
            if (LV_BUILDERS[this.variant]) {
                this[LV_BUILDERS[this.variant]]();
                this.model = this.bodyGroup;
                this.applyModelScale();
                this.loaded = true;
                return this;
            }
            if (this.variant === 'sacredphoenix' || this.variant === 'pyroclastphoenix' || this.variant === 'brd_backwardsbird') {
                if (this.variant === 'sacredphoenix') this._buildSacredPhoenix();
                else if (this.variant === 'pyroclastphoenix') this._buildPyroclastPhoenix();
                else this._buildBackwardsBird();
                this.model = this.bodyGroup;
                this.applyModelScale();
                this.loaded = true;
                return this;
            }
            const bodyMat = this._bodyMat();
            const stand = p.posture === 'stand';
            const bodyY = stand ? 1.18 : 1.0;
            this._bodyY = bodyY;

            // BODY (egg)
            this.body = new THREE.Mesh(new THREE.SphereGeometry(p.bodyR, 14, 14), bodyMat);
            this.body.scale.set(1, p.bodyTall, 1); this.body.position.y = bodyY;
            this.bodyGroup.add(this.body);

            // Optional white belly patch (penguin) and frost speckling.
            if (p.whiteBelly) { const belly = new THREE.Mesh(new THREE.SphereGeometry(p.bodyR * 0.9, 12, 12), this._mat(0xf4f4ee, 1.0, 0.85)); belly.scale.set(0.75, p.bodyTall * 0.95, 0.55); belly.position.set(0, bodyY, p.bodyR * 0.32); this.bodyGroup.add(belly); }
            if (p.frost) { for (let i = 0; i < 6; i++) { const a = this.idRand() * Math.PI * 2, e = this.idRand() * Math.PI; const fr = new THREE.Mesh(new THREE.OctahedronGeometry(p.bodyR * 0.14, 0), this._mat(p.accent, 0.9, 0.2, p.accent)); fr.position.set(Math.sin(e) * Math.cos(a) * p.bodyR, bodyY + Math.cos(e) * p.bodyR * p.bodyTall, Math.sin(e) * Math.sin(a) * p.bodyR); this.bodyGroup.add(fr); } }

            // Optional neck raises the head above the body (waterfowl, long-necks).
            const neckLen = p.neck === 2 ? 0.9 : (p.neck ? 0.42 : 0.12);
            const headY = bodyY + p.bodyR * p.bodyTall * 0.85 + neckLen;
            if (p.neck) {
                const nMat = p.bald ? this._mat(0xcaa070, 1.0, 0.6) : bodyMat;
                this.neck = new THREE.Mesh(new THREE.CylinderGeometry(p.headR * 0.5, p.headR * 0.8, p.neck === 2 ? 1.0 : 0.5, 8), nMat);
                this.neck.position.set(0, bodyY + p.bodyR * p.bodyTall * 0.7 + (p.neck === 2 ? 0.28 : 0), p.bodyR * 0.15);
                this.bodyGroup.add(this.neck);
            }

            // HEAD + eyes + beak
            this.head = new THREE.Group();
            const headMat = (p.whiteHead || p.bald) ? this._mat((p.whiteHead ? 0xf6f6f0 : 0xcaa070), 1.0, 0.8) : bodyMat;
            this.head.add(new THREE.Mesh(new THREE.SphereGeometry(p.headR, 14, 14), headMat));
            const ez = p.headR * 0.78;
            if (p.eyeless) {
                // Smooth skin where eyes should be (Eyeless Bat).
            } else if (p.owl) {
                // Big forward owl discs.
                for (const s of [-1, 1]) { const disc = new THREE.Mesh(new THREE.CircleGeometry(p.headR * 0.55, 12), this._mat(0xf0e6c8, 1.0, 0.8)); disc.position.set(s * p.headR * 0.42, p.headR * 0.1, ez * 0.95); this.head.add(disc); this._eye(this.head, s * p.headR * 0.42, p.headR * 0.12, ez * 1.0, p.headR * 0.32, p.accent, true); }
            } else if (p.eyeFwd) {
                this._eye(this.head, -p.headR * 0.42, p.headR * 0.18, ez, p.headR * 0.3, p.accent, true);
                this._eye(this.head, p.headR * 0.42, p.headR * 0.18, ez, p.headR * 0.3, p.accent, true);
                if (p.fierce) { const brow = new THREE.Mesh(new THREE.BoxGeometry(p.headR * 1.7, p.headR * 0.3, p.headR * 0.5), headMat); brow.position.set(0, p.headR * 0.46, ez * 0.7); this.head.add(brow); }
            } else {
                this._eye(this.head, -p.headR * 0.68, p.headR * 0.12, ez * 0.6, p.headR * 0.28, 0x111111, false);
                this._eye(this.head, p.headR * 0.68, p.headR * 0.12, ez * 0.6, p.headR * 0.28, 0x111111, false);
            }
            // Bat ears.
            if (p.family === 'bat') { for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(p.headR * 0.3, p.headR * 1.1, 5), headMat); ear.position.set(s * p.headR * 0.5, p.headR * 0.9, -p.headR * 0.1); ear.rotation.z = -s * 0.2; this.head.add(ear); } }
            // Feather crest (jay, parrot).
            if (p.crest) { for (let i = 0; i < 3; i++) { const cr = new THREE.Mesh(new THREE.ConeGeometry(p.headR * 0.14, p.headR * (1.0 - i * 0.15), 4), this._wingMat()); cr.position.set((i - 1) * p.headR * 0.16, p.headR * 0.9, -p.headR * 0.15); cr.rotation.x = -0.4; cr.rotation.z = (i - 1) * 0.25; this.head.add(cr); } }
            // Bat fangs.
            if (p.fangy) { for (const s of [-1, 1]) { const fang = new THREE.Mesh(new THREE.ConeGeometry(p.headR * 0.09, p.headR * 0.4, 4), this._mat(0xf4f0e0, 1.0, 0.4)); fang.position.set(s * p.headR * 0.2, -p.headR * 0.4, ez * 0.8); fang.rotation.x = Math.PI; this.head.add(fang); } }
            this._beak(this.head, p);
            this.head.position.set(0, headY, p.bodyR * 0.2);
            if (p.headBack) this.head.rotation.y = Math.PI; // Backwards Bird faces rearward.
            this.bodyGroup.add(this.head);

            // WINGS, LEGS, TAIL
            this._wingY = bodyY + p.bodyR * 0.1;
            this.lwing = this._wing(-1, p);
            this.rwing = this._wing(1, p);
            this.legs = this._legs(p, bodyY);
            this.tail = this._tail(p, bodyY);

            // Part map + dismemberment cascade.
            const m = {}, set = (ks, mesh) => { if (mesh) ks.forEach(k => m[k] = mesh); };
            set(['HEAD', 'SKULL', 'BRAIN', 'FACE', 'EYE', 'EYES'], this.head);
            set(['BEAK', 'BILL'], this.beak);
            set(['BODY', 'TORSO', 'CORE', 'MASS', 'SPINE'], this.body);
            set(['LEFT_WING', 'LEFT_ARM'], this.lwing);
            set(['RIGHT_WING', 'RIGHT_ARM'], this.rwing);
            set(['TALONS', 'LEFT_LEG', 'RIGHT_LEG', 'FEET', 'LEFT_THIGH', 'RIGHT_THIGH', 'REAR_LEFT_LEG', 'REAR_RIGHT_LEG'], this.legs);
            set(['TAIL'], this.tail);
            this._partMeshMap = m;
            this._cascadeRules = [
                { gone: ['BODY', 'TORSO', 'CORE', 'MASS', 'SPINE'], hide: [this.body, this.head, this.lwing, this.rwing, this.legs, this.tail, this.neck].filter(Boolean) },
                { gone: ['HEAD', 'SKULL', 'BRAIN', 'FACE'], hide: [this.head, this.neck].filter(Boolean) },
                { gone: ['BEAK', 'BILL'], hide: [this.beak].filter(Boolean) },
                { gone: ['LEFT_WING', 'LEFT_ARM'], hide: [this.lwing] },
                { gone: ['RIGHT_WING', 'RIGHT_ARM'], hide: [this.rwing] },
                { gone: ['TALONS', 'LEFT_LEG', 'RIGHT_LEG'], hide: [this.legs] },
                { gone: ['TAIL'], hide: [this.tail] },
            ];

            this.model = this.bodyGroup;
            this.applyModelScale();
            this.loaded = true;
            return this;
        }

        _beak(parent, p) {
            if (p.beak === 'none') { this.beak = null; return; }
            const beakColor = p.family === 'waterfowl' ? (p.accent || 0xffa52a) : 0xe8a23a;
            const m = this._mat(beakColor, 1.0, 0.5);
            if (p.beak === 'hook') {
                const upper = new THREE.Mesh(new THREE.ConeGeometry(p.headR * 0.45, p.headR * 1.1, 7), m); upper.rotation.x = Math.PI / 2; upper.position.set(0, 0, p.headR * 0.9); parent.add(upper);
                const tip = new THREE.Mesh(new THREE.ConeGeometry(p.headR * 0.22, p.headR * 0.5, 6), m); tip.rotation.x = Math.PI * 0.78; tip.position.set(0, -p.headR * 0.2, p.headR * 1.12); parent.add(tip);
                this.beak = upper;
            } else if (p.beak === 'flat') {
                const bill = new THREE.Mesh(new THREE.BoxGeometry(p.headR * 0.95, p.headR * 0.18, p.headR * 1.15), m); bill.position.set(0, -p.headR * 0.1, p.headR * 0.85); parent.add(bill);
                this.beak = bill;
            } else {
                const b = new THREE.Mesh(new THREE.ConeGeometry(p.headR * 0.3, p.headR * 0.95, 6), m); b.rotation.x = Math.PI / 2; b.position.set(0, 0, p.headR * 0.9); parent.add(b);
                this.beak = b;
            }
        }

        _wing(side, p) {
            const g = new THREE.Group();
            const wingMat = this._wingMat();
            // Bats: leathery membrane spanning bony finger struts.
            if (p.family === 'bat') {
                const armMat = this._mat(this.profile.bodyColor, 1.0, 0.7);
                for (let i = 0; i < 3; i++) {
                    const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.015, p.wingLen * (0.9 - i * 0.18), 5), armMat);
                    finger.rotation.z = side * Math.PI / 2; finger.rotation.y = -side * i * 0.28;
                    finger.position.set(side * p.wingLen * 0.4, -i * 0.06, 0); g.add(finger);
                }
                // The membrane is a triangle already lying in the plane of the
                // wing, so it only has to be pointed outward. Turning it with
                // two Euler angles keyed off `side` did not compose into a
                // reflection: the two wings came out at different heights and
                // neither lined up with its own finger bones.
                const memb = new THREE.Mesh(new THREE.CircleGeometry(p.wingLen * 0.7, 3), wingMat);
                memb.rotation.z = side > 0 ? 0 : Math.PI;
                memb.scale.set(1, 0.7, 1); memb.position.set(side * p.wingLen * 0.4, -0.12, 0); g.add(memb);
                g.position.set(side * p.bodyR * 0.5, this._wingY, -0.05); g._side = side;
                this.bodyGroup.add(g); return g;
            }
            // Griffon/roc mane at the shoulder.
            if (p.maned) { for (let i = 0; i < 4; i++) { const tuft = new THREE.Mesh(new THREE.ConeGeometry(p.wingLen * 0.07, p.wingLen * 0.3, 4), this._mat(this.profile.accent, 1.0, 0.6)); tuft.position.set(side * p.bodyR * 0.4, 0.1 - i * 0.08, p.bodyR * 0.3); tuft.rotation.x = 0.6; tuft.rotation.z = side * 0.3; g.add(tuft); } }
            const main = new THREE.Mesh(new THREE.ConeGeometry(p.wingLen * 0.34, p.wingLen, 4), wingMat);
            main.rotation.z = side * Math.PI / 2; main.position.x = side * p.wingLen * 0.5; main.scale.set(1, 1, p.wingZ);
            g.add(main);
            for (let i = 0; i < p.feathers; i++) {
                const f = new THREE.Mesh(new THREE.ConeGeometry(p.wingLen * 0.09, p.wingLen * 0.55, 4), wingMat);
                f.rotation.z = side * Math.PI / 2; f.position.set(side * (p.wingLen * 0.55 + i * p.wingLen * 0.13), -p.wingLen * 0.16, 0); f.scale.set(1, 1, p.wingZ * 0.8);
                g.add(f);
            }
            g.position.set(side * p.bodyR * 0.5, this._wingY, -0.05); g._side = side;
            this.bodyGroup.add(g); return g;
        }

        _legs(p, bodyY) {
            const g = new THREE.Group();
            const legMat = this._mat(p.legs === 'webbed' ? 0xe7a23a : 0xc8902a, 1.0, 0.6);
            const stand = p.posture === 'stand';
            const len = stand ? 0.8 : 0.32;
            const topY = stand ? (bodyY - p.bodyR * p.bodyTall * 0.5) : (bodyY - p.bodyR * 0.7);
            for (const x of [-p.bodyR * 0.5, p.bodyR * 0.5]) {
                const leg = new THREE.Group();
                const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, len, 6), legMat); shank.position.y = -len / 2; leg.add(shank);
                if (p.legs === 'webbed') {
                    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.24), legMat); foot.position.set(0, -len, 0.07); leg.add(foot);
                } else if (p.legs === 'talons') {
                    for (let i = -1; i <= 1; i++) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 5), legMat); t.position.set(i * 0.06, -len - 0.06, 0.04); t.rotation.x = Math.PI; leg.add(t); }
                } else {
                    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.16), legMat); foot.position.set(0, -len, 0.05); leg.add(foot);
                }
                leg.position.set(x, topY, stand ? 0.02 : 0.0);
                g.add(leg);
            }
            this.bodyGroup.add(g); return g;
        }

        _tail(p, bodyY) {
            const g = new THREE.Group();
            const wingMat = this._wingMat();
            const n = 3;
            for (let i = 0; i < n; i++) {
                const a = (i - (n - 1) / 2) * 0.32;
                const h = new THREE.Group();
                const f = new THREE.Mesh(new THREE.ConeGeometry(p.tail * 0.12, p.tail, 4), wingMat);
                f.rotation.x = -Math.PI / 2; f.position.set(0, 0, -p.tail * 0.45); f.scale.set(1, 1, 0.28);
                h.add(f); h.rotation.y = a; g.add(h);
            }
            g.position.set(0, bodyY - p.bodyR * 0.2, -p.bodyR * 0.85); g.rotation.x = 0.35;
            this.bodyGroup.add(g); return g;
        }

        // ── Sacred Phoenix: radiant golden-orange firebird, broad flaming wings,
        //    upright sacred crest, hooked beak and gripping talons ─────────────
        // Source archetype Phoenix: CORE/FEATHERS/BEAK/TALONS/LEFT_WING/RIGHT_WING/LEFT_EYE/RIGHT_EYE.
        _buildSacredPhoenix() {
            const p = this.profile;
            const body = this._skinMat(0xffae3a, 0.45); body.emissive = new THREE.Color(0xff7711); body.emissiveIntensity = 0.45;
            const flame = this._mat(0xffd24a, 0.95, 0.25, 0xffb020);
            const gold  = this._mat(0xffe27a, 1.0, 0.3, 0xffc24a);
            // CORE: rounded plump golden body.
            this.core = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 14), body); this.core.scale.set(0.95, 1.15, 0.9); this.core.position.set(0, 1.25, 0); this.bodyGroup.add(this.core);
            const chest = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), gold); chest.scale.set(0.9, 1.0, 0.6); chest.position.set(0, 1.18, 0.28); this.core.add(chest);
            // FEATHERS: upward sacred halo plume fanning behind the head.
            this.feathers = new THREE.Group();
            for (let i = 0; i < 9; i++) { const a = (i - 4) * 0.28; const len = 0.85 - Math.abs(i - 4) * 0.08; const fl = new THREE.Mesh(new THREE.ConeGeometry(0.05, len, 5), flame); fl.position.set(Math.sin(a) * 0.34, 1.85 + Math.cos(a) * 0.1, -0.34); fl.rotation.x = -0.5; fl.rotation.z = a * 0.9; this.feathers.add(fl); }
            this.bodyGroup.add(this.feathers);
            // HEAD + eyes + sacred crest + hooked beak.
            this.head = new THREE.Group();
            this.head.add(new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 12), body));
            this.leftEye  = this._eye(this.head, -0.09, 0.05, 0.16, 0.055, 0xfff4c0, true);
            this.rightEye = this._eye(this.head,  0.09, 0.05, 0.16, 0.055, 0xfff4c0, true);
            for (let i = 0; i < 3; i++) { const cr = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.26 - i * 0.04, 5), flame); cr.position.set((i - 1) * 0.06, 0.24, -0.04); cr.rotation.x = -0.35; cr.rotation.z = (i - 1) * 0.3; this.head.add(cr); }
            this.head.position.set(0, 1.92, 0.1); this.bodyGroup.add(this.head);
            this.beak = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.26, 6), gold); this.beak.position.set(0, 1.9, 0.36); this.beak.rotation.x = Math.PI / 2 + 0.35; this.bodyGroup.add(this.beak);
            const hook = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 5), gold); hook.position.set(0, 1.82, 0.42); hook.rotation.x = Math.PI * 0.85; this.bodyGroup.add(hook);
            // WINGS: broad layered flame-feather fans sweeping up and out.
            this.leftWing  = this._sacredWing(-1, flame, gold);
            this.rightWing = this._sacredWing( 1, flame, gold);
            // TALONS: golden gripping legs.
            this.talons = new THREE.Group();
            for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.028, 0.34, 6), gold); leg.position.set(s * 0.14, 0.93, 0.06); this.talons.add(leg); for (let i = -1; i <= 1; i++) { const claw = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.13, 4), gold); claw.position.set(s * 0.14 + i * 0.05, 0.76, 0.16); claw.rotation.x = 1.25; this.talons.add(claw); } }
            this.bodyGroup.add(this.talons);
            // TAIL: trailing golden flame ribbons.
            this.tailFx = new THREE.Group();
            for (let i = 0; i < 5; i++) { const a = (i - 2) * 0.22; const rb = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.9 - Math.abs(i - 2) * 0.1, 4), flame); rb.position.set(Math.sin(a) * 0.18, 0.85, -0.5); rb.rotation.x = -2.5; rb.rotation.z = a; this.tailFx.add(rb); }
            this.bodyGroup.add(this.tailFx);
            this._partMeshMap = { CORE: this.core, FEATHERS: this.feathers, BEAK: this.beak, TALONS: this.talons, LEFT_WING: this.leftWing, RIGHT_WING: this.rightWing, LEFT_EYE: this.leftEye, RIGHT_EYE: this.rightEye, HEAD: this.head, TAIL: this.tailFx };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.feathers, this.beak, this.talons, this.leftWing, this.rightWing, this.head, this.tailFx] },
                { gone: ['FEATHERS'], hide: [this.feathers] }, { gone: ['BEAK'], hide: [this.beak] }, { gone: ['TALONS'], hide: [this.talons] },
                { gone: ['LEFT_WING'], hide: [this.leftWing] }, { gone: ['RIGHT_WING'], hide: [this.rightWing] },
                { gone: ['LEFT_EYE'], hide: [this.leftEye] }, { gone: ['RIGHT_EYE'], hide: [this.rightEye] }, { gone: ['TAIL'], hide: [this.tailFx] },
            ];
        }
        _sacredWing(side, flame, gold) {
            const g = new THREE.Group();
            for (let i = 0; i < 6; i++) { const len = 0.9 - i * 0.08; const fl = new THREE.Mesh(new THREE.ConeGeometry(0.07, len, 5), i % 2 ? gold : flame); fl.position.set(side * (0.18 + i * 0.16), 0.12 - i * 0.03, -0.04); fl.rotation.z = side * (1.15 + i * 0.12); g.add(fl); }
            g.position.set(side * 0.32, 1.4, -0.02); g._side = side; this.bodyGroup.add(g); return g;
        }

        // ── Pyroclast Phoenix: volcanic red-black firebird wreathed in ash and
        //    ember-cracked feathers, jagged broken wings, molten beak/talons ───
        // Source archetype Phoenix: CORE/FEATHERS/BEAK/TALONS/LEFT_WING/RIGHT_WING/LEFT_EYE/RIGHT_EYE.
        _buildPyroclastPhoenix() {
            const p = this.profile;
            const char  = this._skinMat(0x2a120e, 0.85);
            const lava  = this._mat(0xff5219, 0.95, 0.3, 0xff3a00);
            const ember = this._mat(0xff8a2a, 1.0, 0.4, 0xff5a10);
            const ash   = this._mat(0x4a4440, 0.85, 0.9);
            // CORE: hunched charred body with embedded glowing ember cracks.
            this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), char); this.core.scale.set(1.0, 1.05, 0.95); this.core.position.set(0, 1.22, 0); this.bodyGroup.add(this.core);
            for (let i = 0; i < 7; i++) { const a = this.idRand() * Math.PI * 2, e = this.idRand() * Math.PI; const dir = new THREE.Vector3(Math.sin(e) * Math.cos(a), Math.cos(e), Math.sin(e) * Math.sin(a)); const ev = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.06), ember); ev.position.set(dir.x * 0.4, dir.y * 0.42, dir.z * 0.4); ev.lookAt(0, 0, 0); this.core.add(ev); }
            // FEATHERS: rising ash/ember plume off the back.
            this.feathers = new THREE.Group();
            for (let i = 0; i < 8; i++) { const a = (i - 3.5) * 0.3; const fl = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.7 + this.idRand() * 0.3, 4), i % 3 ? ash : lava); fl.position.set(Math.sin(a) * 0.3, 1.8 + this.idRand() * 0.15, -0.35); fl.rotation.x = -0.4 + this.idRand() * 0.3; fl.rotation.z = a; this.feathers.add(fl); }
            this.bodyGroup.add(this.feathers);
            // HEAD + molten eyes + jagged crest + cracked beak.
            this.head = new THREE.Group();
            this.head.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 1), char));
            this.leftEye  = this._eye(this.head, -0.09, 0.04, 0.15, 0.06, 0xff3300, true);
            this.rightEye = this._eye(this.head,  0.09, 0.04, 0.15, 0.06, 0xff3300, true);
            for (let i = 0; i < 4; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.22, 4), i % 2 ? lava : ash); sp.position.set((i - 1.5) * 0.07, 0.22, -0.05); sp.rotation.x = -0.2; sp.rotation.z = (i - 1.5) * 0.25; this.head.add(sp); }
            this.head.position.set(0, 1.82, 0.14); this.head.rotation.x = 0.25; this.bodyGroup.add(this.head);
            this.beak = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 5), lava); this.beak.position.set(0, 1.74, 0.38); this.beak.rotation.x = Math.PI / 2 + 0.5; this.bodyGroup.add(this.beak);
            // WINGS: jagged broken ember-shards with molten drips.
            this.leftWing  = this._pyroWing(-1, char, lava);
            this.rightWing = this._pyroWing( 1, char, lava);
            // TALONS: lava-cracked grasping legs.
            this.talons = new THREE.Group();
            for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.32, 5), char); leg.position.set(s * 0.15, 0.92, 0.05); this.talons.add(leg); const glow = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), lava); glow.position.set(s * 0.15, 0.78, 0.08); this.talons.add(glow); for (let i = -1; i <= 1; i++) { const claw = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.15, 4), char); claw.position.set(s * 0.15 + i * 0.05, 0.73, 0.16); claw.rotation.x = 1.3; this.talons.add(claw); } }
            this.bodyGroup.add(this.talons);
            this._partMeshMap = { CORE: this.core, FEATHERS: this.feathers, BEAK: this.beak, TALONS: this.talons, LEFT_WING: this.leftWing, RIGHT_WING: this.rightWing, LEFT_EYE: this.leftEye, RIGHT_EYE: this.rightEye, HEAD: this.head };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.feathers, this.beak, this.talons, this.leftWing, this.rightWing, this.head] },
                { gone: ['FEATHERS'], hide: [this.feathers] }, { gone: ['BEAK'], hide: [this.beak] }, { gone: ['TALONS'], hide: [this.talons] },
                { gone: ['LEFT_WING'], hide: [this.leftWing] }, { gone: ['RIGHT_WING'], hide: [this.rightWing] },
                { gone: ['LEFT_EYE'], hide: [this.leftEye] }, { gone: ['RIGHT_EYE'], hide: [this.rightEye] },
            ];
        }
        _pyroWing(side, char, lava) {
            const g = new THREE.Group();
            for (let i = 0; i < 5; i++) { const len = 0.8 - i * 0.09; const sh = new THREE.Mesh(new THREE.ConeGeometry(0.09, len, 3), char); sh.position.set(side * (0.2 + i * 0.17), 0.08 - i * 0.05, -0.05); sh.rotation.z = side * (1.0 + i * 0.16); sh.rotation.y = side * 0.2; g.add(sh); const drip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.2, 4), lava); drip.position.set(side * (0.24 + i * 0.17), -0.12 - i * 0.05, -0.05); drip.rotation.x = Math.PI; g.add(drip); }
            g.position.set(side * 0.34, 1.34, -0.03); g._side = side; this.bodyGroup.add(g); return g;
        }

        // Back-faced material: only the INSIDE of a shell is drawn, so a sphere
        // reads as a hollow cavity rather than a solid body.
        _innerMat(color) {
            const m = new THREE.MeshStandardMaterial({ color, roughness: 0.45, side: THREE.BackSide, transparent: true });
            this._materials.push(m); return m;
        }

        // ── Backwards Bird: a corvid turned inside out. The plumage lines a
        //    hollow cavity where the torso should be, the ribcage is worn as a
        //    cage on the outside with heart, lungs, liver, gizzard and gut slung
        //    off it, and the skull rides on backwards with the brain exposed and
        //    the throat everted through a split beak. ────────────────────────
        // Source archetype Bird: HEAD/BODY/BEAK/LEFT_WING/RIGHT_WING/TALONS.
        // The torso organ keys (HEART/LEFT_LUNG/RIGHT_LUNG/LIVER/STOMACH/
        // INTESTINES) map to real meshes here, since they are all on the outside.
        _buildBackwardsBird() {
            const p = this.profile;
            const R = 0.3, bodyY = 1.0;
            this._bodyY = bodyY; this._wingY = bodyY + 0.06;
            const bone    = this._mat(0xd6cbaa, 1.0, 0.75);
            const muscle  = this._skinMat(0x83303a, 0.28);
            const viscera = this._mat(0xb0505c, 1.0, 0.2);
            const heartM  = this._mat(0x9c1e27, 1.0, 0.15, 0x2a0206);
            const lungM   = this._mat(0xc78e94, 1.0, 0.3);
            const gutM    = this._mat(0xa87a5e, 1.0, 0.32);
            const sinew   = this._mat(0xe2cba6, 1.0, 0.5);
            const feather = this._mat(p.wingColor, 1.0, 0.9);
            const inner   = this._innerMat(0x2c1013);

            // BODY: the bird's own skin, everted - a back-faced shell whose wet
            // interior is all that is left facing the world.
            this.body = new THREE.Mesh(new THREE.SphereGeometry(R, 16, 14), inner);
            this.body.scale.set(1, p.bodyTall, 1); this.body.position.y = bodyY;
            this.bodyGroup.add(this.body);
            // Plumage now grows INWARD, quills rooted in the shell wall and tips
            // pointing at the cavity's centre.
            this.innerPlumage = new THREE.Group();
            for (let i = 0; i < 20; i++) {
                const a = this.idRand() * Math.PI * 2, e = 0.4 + this.idRand() * 2.3;
                const dir = new THREE.Vector3(Math.sin(e) * Math.cos(a), Math.cos(e) * p.bodyTall, Math.sin(e) * Math.sin(a));
                const q = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.18 + this.idRand() * 0.12, 4), feather);
                q.position.set(dir.x * R * 0.9, bodyY + dir.y * R * 0.9, dir.z * R * 0.9);
                q.lookAt(0, bodyY, 0); q.rotateX(Math.PI / 2); // tip toward the cavity centre
                this.innerPlumage.add(q);
            }
            this.bodyGroup.add(this.innerPlumage);

            // RIBCAGE: hoops worn outside the shell, split open at the rear.
            this.ribs = new THREE.Group();
            for (let i = 0; i < 6; i++) {
                const t = i / 5;
                const hoop = new THREE.Group();
                const rr = R * (0.95 + Math.sin(t * Math.PI) * 0.45); // always clear of the shell
                const rib = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.02, 4, 14, Math.PI * 1.5), bone);
                rib.rotation.x = Math.PI / 2; hoop.add(rib);
                hoop.rotation.y = Math.PI / 4; // swing the gap around to the back
                hoop.position.y = bodyY + R * p.bodyTall * 0.95 - t * R * p.bodyTall * 1.9;
                this.ribs.add(hoop);
            }
            // Sternum keel down the front, spine column up the back.
            const keel = new THREE.Mesh(new THREE.BoxGeometry(0.05, R * 1.5, 0.09), bone);
            keel.position.set(0, bodyY, R * 1.02); this.ribs.add(keel);
            const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, R * 2.0, 6), bone);
            spine.position.set(0, bodyY, -R * 0.95); this.ribs.add(spine);
            this.bodyGroup.add(this.ribs);

            // HEART: slung on the front-left of the cage, still beating.
            this.heart = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), heartM);
            this.heart.scale.set(0.9, 1.15, 0.9);
            this.heart.position.set(-0.2, bodyY + 0.16, R * 0.78); this.bodyGroup.add(this.heart);
            for (const s of [-1, 1]) { const vessel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.014, 0.2, 5), viscera); vessel.position.set(-0.2 + s * 0.05, bodyY + 0.3, R * 0.7); vessel.rotation.z = s * 0.4; vessel.rotation.x = -0.35; this.bodyGroup.add(vessel); }

            // LUNGS: a pair of spongy sacs clamped over the rib hoops.
            this.leftLung  = this._insideOutLung(-1, bodyY, R, lungM, viscera);
            this.rightLung = this._insideOutLung( 1, bodyY, R, lungM, viscera);

            // LIVER: a dark flat lobe on the right flank.
            this.liver = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), this._mat(0x6e2a2e, 1.0, 0.25));
            this.liver.scale.set(1.1, 0.55, 0.8);
            this.liver.position.set(0.22, bodyY - 0.16, R * 0.55); this.liver.rotation.z = -0.3; this.bodyGroup.add(this.liver);

            // STOMACH / gizzard: a taut grit-filled sac under the keel.
            this.stomach = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), gutM);
            this.stomach.scale.set(1.0, 0.85, 0.9);
            this.stomach.position.set(-0.04, bodyY - 0.3, R * 0.5); this.bodyGroup.add(this.stomach);

            // INTESTINES: a loose coil hanging below, swinging as it flies.
            this.guts = new THREE.Group();
            for (let i = 0; i < 11; i++) {
                const a = i * 0.85, rad = 0.12 - i * 0.005;
                const loop = new THREE.Mesh(new THREE.SphereGeometry(0.05 - i * 0.002, 8, 6), gutM);
                loop.position.set(Math.cos(a) * rad, -i * 0.026, Math.sin(a) * rad * 0.7 + 0.08);
                this.guts.add(loop);
            }
            this._gutY = bodyY - R * p.bodyTall - 0.05;
            this.guts.position.set(0, this._gutY, 0); this.bodyGroup.add(this.guts);
            // Mesentery threads tethering the gut back up to the cage.
            for (const s of [-1, 1]) { const th = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.22, 4), sinew); th.position.set(s * 0.08, this._gutY + 0.1, 0.08); this.bodyGroup.add(th); }

            // HEAD: skull on backwards, brain worn on top, eyes on optic cords,
            // throat everted through a beak split open from the inside.
            const headY = bodyY + R * p.bodyTall * 0.9 + 0.16;
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(p.headR, 12, 12), bone); this.head.add(skull);
            this.brain = new THREE.Group();
            for (const s of [-1, 1]) { const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 8), viscera); lobe.scale.set(0.85, 0.7, 1.1); lobe.position.set(s * 0.05, 0.14, -0.02); this.brain.add(lobe); }
            for (let i = 0; i < 3; i++) { const gyrus = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.011, 4, 8, Math.PI), viscera); gyrus.position.set(0, 0.19, -0.07 + i * 0.06); gyrus.rotation.y = Math.PI / 2; this.brain.add(gyrus); }
            this.head.add(this.brain);
            // Eyes pushed out of their sockets, dangling on optic nerves.
            for (const s of [-1, 1]) {
                const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 4), viscera);
                cord.position.set(s * 0.12, -0.02, 0.09); cord.rotation.x = 0.5; cord.rotation.z = -s * 0.4; this.head.add(cord);
                const eye = this._eye(this.head, s * 0.17, -0.1, 0.15, 0.055, p.accent, false);
                if (s < 0) this.leftEye = eye; else this.rightEye = eye;
            }
            // Everted throat: a ridged gullet pushed out through the split beak.
            this.gullet = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 0.24, 8), muscle);
            this.gullet.rotation.x = Math.PI / 2; this.gullet.position.set(0, -0.02, p.headR + 0.1); this.head.add(this.gullet);
            for (let i = 0; i < 3; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.062 + i * 0.006, 0.012, 4, 10), viscera); ring.position.set(0, -0.02, p.headR + 0.03 + i * 0.07); this.head.add(ring); }
            const maw = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.14, 8, 1, true), this._innerMat(0x481216));
            maw.rotation.x = -Math.PI / 2; maw.position.set(0, -0.02, p.headR + 0.02); this.head.add(maw);
            // The beak sheath, peeled open into two halves around the throat.
            const beakM = this._mat(0xc8b48a, 1.0, 0.5);
            this.beak = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.24, 5), beakM);
            this.beak.position.set(0, 0.08, p.headR + 0.08); this.beak.rotation.x = Math.PI * 0.36; this.head.add(this.beak);
            const lower = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 5), beakM);
            lower.position.set(0, -0.12, p.headR + 0.08); lower.rotation.x = Math.PI * 0.64; this.head.add(lower);
            this.head.position.set(0, headY, R * 0.2);
            this.head.rotation.y = Math.PI; // ... and it faces the way it came from
            this.bodyGroup.add(this.head);
            // Bare neck vertebrae between skull and cage.
            for (let i = 0; i < 3; i++) { const v = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), bone); v.position.set(0, headY - 0.1 - i * 0.07, R * 0.15); this.bodyGroup.add(v); }

            // WINGS: bare arm bones, muscle strands laid over them, and flight
            // feathers rooted the wrong way round so they curl back inward.
            this.lwing = this._insideOutWing(-1, bone, muscle, feather, sinew);
            this.rwing = this._insideOutWing( 1, bone, muscle, feather, sinew);

            // TALONS: scaleless legs, tendons on show.
            this.legs = new THREE.Group();
            for (const s of [-1, 1]) {
                const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.026, 0.34, 6), bone);
                shank.position.set(s * 0.13, bodyY - R * p.bodyTall - 0.12, 0.02); this.legs.add(shank);
                const tendon = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.3, 4), sinew);
                tendon.position.set(s * 0.13, bodyY - R * p.bodyTall - 0.12, 0.06); this.legs.add(tendon);
                for (let i = -1; i <= 1; i++) { const claw = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.13, 5), bone); claw.position.set(s * 0.13 + i * 0.05, bodyY - R * p.bodyTall - 0.33, 0.05); claw.rotation.x = Math.PI * 0.9; this.legs.add(claw); }
            }
            this.bodyGroup.add(this.legs);

            // TAIL: exposed caudal vertebrae with the tail feathers curling back
            // under themselves toward the body.
            this.tail = new THREE.Group();
            for (let i = 0; i < 4; i++) { const v = new THREE.Mesh(new THREE.SphereGeometry(0.04 - i * 0.005, 8, 6), bone); v.position.set(0, i * 0.02, -i * 0.09); this.tail.add(v); }
            for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(p.tail * 0.11, p.tail * 0.75, 4), feather); f.position.set((i - 1) * 0.07, 0.12, -0.3); f.rotation.x = 1.05; f.rotation.z = (i - 1) * 0.2; f.scale.set(1, 1, 0.3); this.tail.add(f); }
            this.tail.position.set(0, bodyY - R * 0.2, -R * 0.95); this.tail.rotation.x = 0.35;
            this.bodyGroup.add(this.tail);

            const m = {}, set = (ks, mesh) => { if (mesh) ks.forEach(k => m[k] = mesh); };
            set(['HEAD', 'SKULL', 'FACE', 'EYE', 'EYES'], this.head);
            set(['BRAIN'], this.brain);
            set(['LEFT_EYE'], this.leftEye); set(['RIGHT_EYE'], this.rightEye);
            set(['BEAK', 'BILL'], this.beak);
            set(['BODY', 'TORSO', 'CORE', 'MASS', 'SPINE'], this.body);
            set(['RIBCAGE'], this.ribs);
            set(['HEART'], this.heart);
            set(['LEFT_LUNG'], this.leftLung); set(['RIGHT_LUNG'], this.rightLung);
            set(['LIVER', 'SPLEEN'], this.liver);
            set(['STOMACH', 'GIZZARD'], this.stomach);
            set(['INTESTINES', 'GUTS'], this.guts);
            set(['LEFT_WING', 'LEFT_ARM'], this.lwing);
            set(['RIGHT_WING', 'RIGHT_ARM'], this.rwing);
            set(['TALONS', 'LEFT_LEG', 'RIGHT_LEG', 'FEET', 'LEFT_THIGH', 'RIGHT_THIGH'], this.legs);
            set(['TAIL'], this.tail);
            this._partMeshMap = m;
            this._cascadeRules = [
                { gone: ['BODY', 'TORSO', 'CORE', 'MASS', 'SPINE'], hide: [this.body, this.innerPlumage, this.ribs, this.heart, this.leftLung, this.rightLung, this.liver, this.stomach, this.guts, this.head, this.lwing, this.rwing, this.legs, this.tail] },
                { gone: ['HEAD', 'SKULL', 'FACE'], hide: [this.head] },
                { gone: ['BRAIN'], hide: [this.brain] },
                { gone: ['BEAK', 'BILL'], hide: [this.beak] },
                { gone: ['HEART'], hide: [this.heart] },
                { gone: ['LEFT_LUNG'], hide: [this.leftLung] },
                { gone: ['RIGHT_LUNG'], hide: [this.rightLung] },
                { gone: ['LIVER'], hide: [this.liver] },
                { gone: ['STOMACH'], hide: [this.stomach] },
                { gone: ['INTESTINES'], hide: [this.guts] },
                { gone: ['LEFT_WING', 'LEFT_ARM'], hide: [this.lwing] },
                { gone: ['RIGHT_WING', 'RIGHT_ARM'], hide: [this.rwing] },
                { gone: ['TALONS', 'LEFT_LEG', 'RIGHT_LEG'], hide: [this.legs] },
                { gone: ['TAIL'], hide: [this.tail] },
            ];
        }
        _insideOutLung(side, bodyY, R, lungM, viscera) {
            const g = new THREE.Group();
            for (let i = 0; i < 3; i++) { const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.085 - i * 0.012, 8, 8), lungM); lobe.position.set(0, 0.09 - i * 0.09, i * 0.02); g.add(lobe); }
            const bronchus = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.18, 5), viscera);
            bronchus.position.set(-side * 0.06, 0.12, 0); bronchus.rotation.z = side * 0.7; g.add(bronchus);
            g.position.set(side * (R + 0.17), bodyY + 0.06, -0.02); g.rotation.z = -side * 0.15;
            this.bodyGroup.add(g); return g;
        }
        _insideOutWing(side, bone, muscle, feather, sinew) {
            const g = new THREE.Group();
            const humerus = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.028, 0.34, 6), bone);
            humerus.rotation.z = side * Math.PI / 2; humerus.position.x = side * 0.17; g.add(humerus);
            const radius = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.02, 0.36, 6), bone);
            radius.rotation.z = side * Math.PI / 2; radius.position.set(side * 0.5, -0.03, 0); g.add(radius);
            const joint = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), bone); joint.position.set(side * 0.34, -0.015, 0); g.add(joint);
            // Flight muscle laid over the bone instead of under the skin.
            for (let i = 0; i < 3; i++) { const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.3 - i * 0.05, 5), muscle); strand.rotation.z = side * Math.PI / 2; strand.position.set(side * (0.2 + i * 0.1), -0.05 - i * 0.02, 0.04); g.add(strand); }
            // Feathers rooted backwards, tips curling in toward the body.
            for (let i = 0; i < 5; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.32 - i * 0.02, 4), feather); f.position.set(side * (0.16 + i * 0.14), -0.12, -0.02); f.rotation.z = side * 2.25; f.scale.set(1, 1, 0.35); g.add(f); }
            // Tendon threads trailing off the wrist.
            for (let i = 0; i < 2; i++) { const th = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.16, 4), sinew); th.position.set(side * (0.62 + i * 0.05), -0.12, 0.02); g.add(th); }
            g.position.set(side * 0.16, this._wingY, -0.04); g._side = side;
            this.bodyGroup.add(g); return g;
        }

        //=====================================================================
        // Level 1-5 starter birds (lv_*). Every one has its own builder; the
        // pieces below are shared. Both wing kinds hang off a pivot group AT
        // THE SHOULDER, so a flap rotates the whole wing about its root and
        // never a blade about its own centre, and the left wing is built as
        // the exact reflection of the right (every x is multiplied by side).
        // Legs pivot at the hip, the head at the neck root, the tail at its
        // root. this.body is a group: the torso plus everything worn on it.
        // The pose is one routine (_lvPose) steered by this._lvCfg.
        //=====================================================================
        _lvM(color, rough, emissive, opacity) { return this._mat(color, opacity === undefined ? 1.0 : opacity, rough === undefined ? 0.8 : rough, emissive); }
        _lvSide(color, opacity) { const m = this._lvM(color, 0.85, 0, opacity); m.side = THREE.DoubleSide; return m; }
        _lvBlob(r, mat, sx, sy, sz, ws, hs) {
            const m = new THREE.Mesh(new THREE.SphereGeometry(r, ws || 9, hs || 7), mat);
            m.scale.set(sx || 1, sy || 1, sz || 1); return m;
        }
        _lvAt(mesh, x, y, z, parent) { mesh.position.set(x, y, z); (parent || this.body).add(mesh); return mesh; }
        _lvAim(mesh, dir) { mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()); return mesh; }
        _lvRod(a, b, r0, r1, mat, parent, seg) {
            const d = new THREE.Vector3().subVectors(b, a); const len = d.length();
            const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, seg || 5), mat);
            m.position.copy(a).addScaledVector(d, 0.5);
            m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
            parent.add(m); return m;
        }
        _lvTorso(r, mat, sx, sy, sz, y, z, tilt, ws, hs) {
            this.body = new THREE.Group(); this.bodyGroup.add(this.body);
            this.bodyMesh = this._lvBlob(r, mat, sx, sy, sz, ws, hs);
            this.bodyMesh.position.set(0, y, z || 0); this.bodyMesh.rotation.x = tilt || 0;
            this.body.add(this.bodyMesh); return this.bodyMesh;
        }
        _lvHeadAt(x, y, z) { this.head = new THREE.Group(); this.head.position.set(x, y, z); this.bodyGroup.add(this.head); return this.head; }
        // A cone pointing along +Z (a beak, a snout), base at z0.
        _lvBill(r, len, mat, x, y, z0, parent, seg, pitch) {
            const b = new THREE.Mesh(new THREE.ConeGeometry(r, len, seg || 5), mat);
            b.rotation.x = Math.PI / 2 + (pitch || 0);
            b.position.set(x, y - Math.sin(pitch || 0) * len / 2, z0 + Math.cos(pitch || 0) * len / 2);
            parent.add(b); return b;
        }
        // Spikes / tufts / quills standing off an ellipsoid's surface.
        _lvTufts(n, cx, cy, cz, rx, ry, rz, mat, r, len, opts) {
            opts = opts || {};
            const g = opts.parent || this.body;
            for (let i = 0; i < n; i++) {
                const a = (opts.a0 || 0) + this.idRand() * (opts.aSpan === undefined ? Math.PI * 2 : opts.aSpan);
                const e = (opts.e0 === undefined ? 0.25 : opts.e0) + this.idRand() * (opts.eSpan === undefined ? 1.6 : opts.eSpan);
                const dir = new THREE.Vector3(Math.sin(e) * Math.sin(a), Math.cos(e), Math.sin(e) * Math.cos(a));
                const tuft = this._lvAim(new THREE.Mesh(new THREE.ConeGeometry(r, len, 3), mat), dir);
                tuft.position.set(cx + dir.x * rx * 0.92 + dir.x * len * 0.35, cy + dir.y * ry * 0.92 + dir.y * len * 0.35, cz + dir.z * rz * 0.92 + dir.z * len * 0.35);
                g.add(tuft);
            }
        }

        // A feathered wing. o: x/y/z shoulder (x mirrored by side), span,
        // chord, n primaries, cover/tip colours, tipFrom (0..1 along the span
        // where the tip colour starts), fan (how far the outer feathers swing
        // out), shape(u) feather length factor, bars {n, color} across the
        // coverts, ragged (fraction of feathers missing, the same on both
        // wings). Spread: the arm runs outward, raised by `up`, swept back by
        // `sweep`. fold: the same wing turned to lie along the flank, angled
        // down by `up` (negative) and in by `tuck`.
        _lvWing(side, o) {
            const g = new THREE.Group(); g.position.set(side * o.x, o.y, o.z || 0); g._side = side;
            const arm = new THREE.Group(); g.add(arm);
            if (o.fold) { arm.rotation.z = side * (o.up === undefined ? -0.25 : o.up); arm.rotation.y = side * (Math.PI / 2 + (o.tuck === undefined ? 0.12 : o.tuck)); }
            else { arm.rotation.z = side * (o.up || 0); arm.rotation.y = side * (o.sweep || 0); }
            const span = o.span, chord = o.chord, th = o.th || 0.035;
            const cover = this._lvSide(o.cover), tipM = o.tip !== undefined ? this._lvSide(o.tip) : cover;
            const edge = new THREE.Mesh(new THREE.BoxGeometry(span, th * 1.6, th * 1.6), cover);
            edge.position.x = side * span / 2; arm.add(edge);
            // Folded, the coverts are a shield hanging over the flank; spread,
            // a strip along the leading edge.
            const cov = o.fold ? new THREE.Mesh(new THREE.BoxGeometry(span * 0.78, chord, th), cover) : new THREE.Mesh(new THREE.BoxGeometry(span * 0.62, chord * 0.5, th), cover);
            if (o.fold) cov.position.set(side * span * 0.39, -chord * 0.46, 0); else cov.position.set(side * span * 0.31, -chord * 0.24, 0);
            arm.add(cov);
            if (o.bars) {
                const bm = this._lvSide(o.bars.color);
                for (let b = 0; b < o.bars.n; b++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(span * 0.5, chord * 0.07, th * 1.4), bm); bar.position.set(side * span * (0.3 + b * 0.04), -chord * (0.12 + b * 0.16), 0); arm.add(bar); }
            }
            const n = o.n || 5, fan = o.fan === undefined ? 0.55 : o.fan;
            if (o.ragged && !this._lvRag) { this._lvRag = []; for (let i = 0; i < n; i++) this._lvRag.push({ skip: i > 0 && i < n - 1 && this.idRand() < o.ragged, len: 0.6 + this.idRand() * 0.5 }); }
            for (let i = 0; i < n; i++) {
                const rag = o.ragged ? this._lvRag[i] : null;
                if (rag && rag.skip) continue;
                const u = n === 1 ? 1 : i / (n - 1);
                const piv = new THREE.Group(); let len;
                if (o.fold) {
                    // Folded primaries stack back along the arm, past its tip.
                    len = span * 0.55 * (o.shape ? o.shape(u) : 1.0);
                    piv.position.set(side * span * (0.3 + 0.62 * u), -chord * (0.75 - 0.45 * u), 0); piv.rotation.z = side * (1.2 + 0.12 * u);
                } else {
                    len = chord * (o.shape ? o.shape(u) : 1.0) * (rag ? rag.len : 1);
                    piv.position.set(side * span * (0.12 + 0.88 * u), 0, 0); piv.rotation.z = side * fan * Math.pow(u, 1.6);
                }
                const f = new THREE.Mesh(new THREE.ConeGeometry(o.fold ? chord * 0.3 : chord * (o.fw || 0.3), len, 4), u >= (o.tipFrom === undefined ? 0.7 : o.tipFrom) ? tipM : cover);
                f.rotation.x = Math.PI; f.scale.z = 0.22; f.position.y = -len / 2 + th; piv.add(f); arm.add(piv);
            }
            g._arm = arm;
            (o.parent || this.bodyGroup).add(g); return g;
        }

        // A bat's membrane wing: upper arm to the wrist, finger bones fanning
        // from the wrist, and one skin stretched from the shoulder over the
        // finger tips (scalloped between them) back down to the flank.
        _lvMembrane(side, o) {
            const g = new THREE.Group(); g.position.set(side * o.x, o.y, o.z || 0); g._side = side;
            const arm = new THREE.Group(); arm.rotation.z = side * (o.up || 0); arm.rotation.y = side * (o.sweep || 0); g.add(arm);
            const V = (x, y) => new THREE.Vector3(side * x, y, 0);
            const span = o.span, r = o.r || 0.022;
            const S = V(0, 0), W = V(span * 0.42, span * 0.1);
            this._lvRod(S, W, r * 1.5, r, o.bone, arm);
            const angs = o.angles || [0.15, -0.25, -0.8, -1.3], lens = o.lens || [0.62, 0.58, 0.5, 0.42];
            const tips = angs.map((a, k) => V(span * 0.42 + Math.cos(a) * span * lens[k], span * 0.1 + Math.sin(a) * span * lens[k]));
            tips.forEach(tp => this._lvRod(W, tp, r, r * 0.45, o.bone, arm));
            const poly = [W, tips[0]];
            for (let k = 1; k < tips.length; k++) poly.push(tips[k - 1].clone().lerp(tips[k], 0.5).lerp(W, o.sag === undefined ? 0.28 : o.sag), tips[k]);
            const hip = V(0, -(o.drop || span * 0.4));
            poly.push(tips[tips.length - 1].clone().lerp(hip, 0.5).lerp(S, 0.2), hip);
            const pos = [];
            for (let k = 0; k < poly.length - 1; k++) pos.push(S.x, S.y, S.z, poly[k].x, poly[k].y, poly[k].z, poly[k + 1].x, poly[k + 1].y, poly[k + 1].z);
            const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals();
            arm.add(new THREE.Mesh(geo, o.memb));
            if (o.thumb) { const th = new THREE.Mesh(new THREE.ConeGeometry(r * 1.3, span * 0.1, 4), o.thumb); th.position.copy(W).add(new THREE.Vector3(0, span * 0.05, 0)); arm.add(th); }
            g._tips = tips; g._wrist = W; g._arm = arm;
            (o.parent || this.bodyGroup).add(g); return g;
        }

        // Two legs, each a pivot group at the hip. o: x/y/z hip, len (feet
        // land at y - len), r, color or mat, toe length, toeR, web, zygo (two
        // toes forward, two back), clawMat, spur {len, mat}, splay (knock-
        // kneed when positive), thigh {r, mat}, custom(foot, side, mat) that
        // returns true when it drew its own foot, each(leg, foot, side).
        _lvLegs(o) {
            const g = new THREE.Group(); const mat = o.mat || this._lvM(o.color, 0.6);
            this._lvLegList = [];
            for (const s of [-1, 1]) {
                const leg = new THREE.Group(); leg.position.set(s * o.x, o.y, o.z || 0); if (o.splay) leg.rotation.z = -s * o.splay;
                if (o.thigh) leg.add(this._lvAt(this._lvBlob(o.thigh.r, o.thigh.mat || mat, 1, 1.3, 1, 7, 5), 0, -o.thigh.r * 0.4, 0, leg));
                const shank = new THREE.Mesh(new THREE.CylinderGeometry(o.r, o.r * 0.75, o.len, 5), mat); shank.position.y = -o.len / 2; leg.add(shank);
                const foot = new THREE.Group(); foot.position.y = -o.len; leg.add(foot);
                const tl = o.toe || o.len * 0.4, tr = o.toeR || o.r * 0.7, cm = o.clawMat;
                if (o.custom && o.custom(foot, s, mat)) { /* drew its own foot */ }
                else if (o.web) { const web = new THREE.Mesh(new THREE.CylinderGeometry(tl, tl, 0.025, 3), mat); web.position.set(0, 0.012, tl * 0.5); foot.add(web); }
                else {
                    const dirs = o.zygo ? [0.3, -0.3, Math.PI - 0.35, Math.PI + 0.35] : [-0.5, 0, 0.5, Math.PI];
                    for (const a of dirs) {
                        const tg = new THREE.Group(); tg.rotation.y = a; foot.add(tg);
                        const len = (!o.zygo && Math.abs(a) > 2) ? tl * 0.6 : tl;
                        const toe = new THREE.Mesh(new THREE.CylinderGeometry(tr * 0.6, tr, len, 4), mat); toe.rotation.x = Math.PI / 2; toe.position.set(0, tr * 0.5, len / 2); tg.add(toe);
                        if (cm) { const cl = new THREE.Mesh(new THREE.ConeGeometry(tr * 0.8, tl * 0.35, 4), cm); cl.rotation.x = Math.PI * 0.75; cl.position.set(0, tr * 0.3, len + tl * 0.06); tg.add(cl); }
                    }
                }
                if (o.spur) { const sp = new THREE.Mesh(new THREE.ConeGeometry(o.r * 0.7, o.spur.len, 4), o.spur.mat); sp.rotation.x = -Math.PI / 2 - 0.3; sp.position.set(0, -o.len * 0.72, -o.spur.len * 0.45); leg.add(sp); }
                if (o.each) o.each(leg, foot, s, mat);
                g.add(leg); this._lvLegList.push(leg);
            }
            (o.parent || this.bodyGroup).add(g); this.legs = g; return g;
        }

        // A fanned tail, pivot at its root. o: y/z root, len, n, spread,
        // pitch (positive = up), color, tip, w, shape(u) with u in -0.5..0.5,
        // flip (wide end at the tip, as in a dove's or a pigeon's fan).
        _lvTail(o) {
            const g = new THREE.Group(); g.position.set(0, o.y, o.z);
            const mat = this._lvSide(o.color), tipM = o.tip !== undefined ? this._lvSide(o.tip) : null;
            const n = o.n || 3, w = o.w || o.len * 0.14;
            for (let i = 0; i < n; i++) {
                const u = n === 1 ? 0 : i / (n - 1) - 0.5;
                const len = o.len * (o.shape ? o.shape(u) : 1);
                const h = new THREE.Group(); h.rotation.y = u * (o.spread || 0.6); h.rotation.x = o.pitch || 0; g.add(h);
                const f = new THREE.Mesh(new THREE.ConeGeometry(w, len, 4), mat);
                f.rotation.x = o.flip ? Math.PI / 2 : -Math.PI / 2; f.scale.z = 0.25; f.position.z = -len / 2; h.add(f);
                if (tipM) { const tp = new THREE.Mesh(new THREE.ConeGeometry(w * (o.flip ? 1.05 : 0.5), len * 0.28, 4), tipM); tp.rotation.x = f.rotation.x; tp.scale.z = 0.3; tp.position.z = -len * (o.flip ? 0.86 : 0.84); h.add(tp); }
            }
            (o.parent || this.bodyGroup).add(g); this.tail = g; return g;
        }

        _lvParts(o) {
            o = o || {};
            const m = {}, set = (ks, mesh) => { if (mesh) ks.forEach(k => m[k] = mesh); };
            set(['HEAD', 'SKULL', 'BRAIN', 'FACE', 'EYE', 'EYES'], this.head);
            set(['BEAK', 'BILL', 'MOUTH'], this.beak);
            set(['FANGS', 'TEETH'], this.fangs);
            set(['BODY', 'TORSO', 'CORE', 'MASS', 'SPINE'], this.body);
            set(['LEFT_WING', 'LEFT_ARM'], this.lwing);
            set(['RIGHT_WING', 'RIGHT_ARM'], this.rwing);
            set(['TALONS', 'LEFT_LEG', 'RIGHT_LEG', 'FEET', 'LEFT_THIGH', 'RIGHT_THIGH'], this.legs);
            set(['TAIL'], this.tail);
            this._partMeshMap = m;
            this._cascadeRules = [
                { gone: ['BODY', 'TORSO', 'CORE', 'MASS', 'SPINE'], hide: [this.body, this.head, this.lwing, this.rwing, this.legs, this.tail, ...(o.extra || [])].filter(Boolean) },
                { gone: ['HEAD', 'SKULL', 'BRAIN', 'FACE'], hide: [this.head] },
                { gone: ['BEAK', 'BILL', 'MOUTH'], hide: [this.beak].filter(Boolean) },
                { gone: ['FANGS', 'TEETH'], hide: [this.fangs].filter(Boolean) },
                { gone: ['LEFT_WING', 'LEFT_ARM'], hide: [this.lwing] },
                { gone: ['RIGHT_WING', 'RIGHT_ARM'], hide: [this.rwing] },
                { gone: ['TALONS', 'LEFT_LEG', 'RIGHT_LEG'], hide: [this.legs].filter(Boolean) },
                { gone: ['TAIL'], hide: [this.tail].filter(Boolean) },
            ].filter(r => r.hide.length);
        }

        _lvPose(t, anim) {
            const c = this._lvCfg;
            const fast = anim === 'attack' || anim === 'specialattack';
            const hover = c.mode === 'hover';
            const rate = (c.flap || 6) * (fast ? 1.7 : 1);
            const lift = hover
                ? (c.lift || 0) + Math.sin(t * rate) * (c.amp === undefined ? 0.6 : c.amp)
                : (c.lift || 0) + Math.pow(Math.max(0, Math.sin(t * rate)), 3) * (c.amp === undefined ? 0.3 : c.amp) * (fast ? 2 : 1);
            // Negative z lifts the left wing, positive the right: the pair stays
            // each other's reflection through the whole beat.
            if (this.lwing && this.lwing.visible) this.lwing.rotation.z = -lift;
            if (this.rwing && this.rwing.visible) this.rwing.rotation.z = lift;
            let y = 0;
            if (hover) { y = Math.sin(t * rate) * 0.035 + Math.sin(t * 1.3) * 0.06; this.model.rotation.z = Math.sin(t * 1.1) * (c.bank || 0.05); }
            else { if (c.hop) y = Math.abs(Math.sin(t * c.hop * (fast ? 1.6 : 1))) * (c.hopH || 0.05); this.model.rotation.z = Math.sin(t * 3) * (c.waddle === undefined ? 0.03 : c.waddle); }
            if (anim === 'hit') y += Math.sin(t * 26) * Math.exp(-t * 6) * 0.1;
            this.model.position.y = this._baseY + y * this.scale;
            if (this.head && this.head.visible) {
                const peck = fast ? Math.max(0, Math.sin(t * 9)) * (c.peck === undefined ? 0.4 : c.peck) : 0;
                this.head.rotation.x = Math.sin(t * (c.headRate || 2)) * (c.headAmp === undefined ? 0.08 : c.headAmp) + peck;
                this.head.rotation.y = c.swivel ? Math.sin(t * 0.7) * c.swivel : 0;
            }
            if (this.tail && this.tail.visible) this.tail.rotation.x = Math.sin(t * 2.2) * (c.tailAmp === undefined ? 0.07 : c.tailAmp);
            if (!hover && this._lvLegList) this._lvLegList.forEach((lg, i) => { if (lg.visible) lg.rotation.x = c.hop ? 0 : Math.sin(t * 3 + i * Math.PI) * (c.step === undefined ? 0.08 : c.step); });
            this._lvExtraPose(t, fast);
        }

        // The one odd motion each starter bird has on top of the shared pose.
        _lvExtraPose(t, fast) {
            const h = this.head;
            switch (this.variant) {
                case 'lv_plazapigeon': if (h) h.position.z = this._lvHeadZ + Math.max(0, Math.sin(t * 5)) * 0.05; break;
                case 'lv_housesparrow': if (h) h.rotation.y = Math.sign(Math.sin(t * 1.7)) * 0.3; break;
                case 'lv_youngbarnowl': if (h) h.rotation.z = Math.sin(t * 1.1) * 0.25; break;
                case 'lv_whiteowlet': if (h) h.rotation.z = Math.sin(t * 0.9) * 0.15; break;
                case 'lv_pipistrellebat':
                    if (this.rings) this.rings.forEach((r, i) => { const k = ((t * (fast ? 2.4 : 1.2) + i * 0.5) % 1); r.scale.setScalar(0.6 + k * 0.9); r.material.opacity = 0.55 * (1 - k); });
                    break;
                case 'lv_parkgoose': case 'lv_parrotchick':
                    if (this._jaw) this._jaw.rotation.x = this._lvJaw + Math.abs(Math.sin(t * (fast ? 12 : 5))) * 0.18; break;
                case 'lv_canyonswift':
                    if (this._jaw) this._jaw.rotation.x = fast ? 0.2 + Math.abs(Math.sin(t * 10)) * 0.5 : 0.05; break;
                case 'lv_snowsparrow':
                    this.model.rotation.z = Math.sin(t * 31) * 0.015;
                    if (this.bodyMesh) { const puff = 1 + Math.sin(t * 1.4) * 0.04; this.bodyMesh.scale.set(1.05 * puff, 0.95 * puff, 1.05 * puff); }
                    break;
                case 'lv_belfrybat': if (this.bell) this.bell.rotation.z = Math.sin(t * 2.6) * 0.18; break;
                case 'lv_blesseddove': if (this.halo) this.halo.rotation.z = t * 0.8; break;
                case 'lv_pitrooster':
                    if (h) h.rotation.x -= Math.pow(Math.max(0, Math.sin(t * 0.9)), 8) * 0.7;
                    if (fast) this.model.position.y += Math.abs(Math.sin(t * 7)) * 0.12 * this.scale;
                    break;
                case 'lv_toucanfledgling': if (this.bill) this.bill.rotation.x = 0.15 + Math.sin(t * 2.3) * 0.08; break;
            }
        }

        // ── Plaza Pigeon: plump grey city pigeon, an oily green-and-violet neck
        //    ring, and one foot worn to a stump bound up in old string ───────
        // Archetype Bird: HEAD/BODY/BEAK/LEFT_WING/RIGHT_WING/TALONS.
        _buildPlazaPigeon() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.85), dark = this._lvM(0x2c2e36), chest = this._lvM(0x9a8a9a);
            this._lvTorso(0.34, skin, 0.9, 0.85, 1.25, 0.55, 0, -0.25);
            this._lvAt(this._lvBlob(0.22, chest, 1.1, 1.0, 0.8), 0, 0.63, 0.2);
            const h = this._lvHeadAt(0, 0.74, 0.24); this._lvHeadZ = 0.24;
            this._lvAt(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.24, 7), skin), 0, 0.08, 0.02, h);
            const green = this._lvM(0x2f9a72, 0.3, 0x0a3a2a), violet = this._lvM(0x8a3aa0, 0.3, 0x2a0a3a);
            const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.035, 4, 10), green); r1.rotation.x = Math.PI / 2; this._lvAt(r1, 0, 0.05, 0.02, h);
            const r2 = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.03, 4, 10), violet); r2.rotation.x = Math.PI / 2; this._lvAt(r2, 0, 0.12, 0.02, h);
            this._lvAt(this._lvBlob(0.13, skin, 0.9, 0.95, 1.1, 8, 6), 0, 0.24, 0.05, h);
            for (const s of [-1, 1]) this._eye(h, s * 0.09, 0.27, 0.12, 0.03, 0xff7a1a, false);
            this.beak = this._lvBill(0.03, 0.12, this._lvM(0x4a4a50, 0.5), 0, 0.22, 0.17, h, 5, 0.15);
            this._lvAt(this._lvBlob(0.035, this._lvM(0xeae6e0), 1.2, 0.8, 1.2, 6, 4), 0, 0.245, 0.18, h);
            this.lwing = this._lvWing(-1, { fold: true, x: 0.24, y: 0.62, z: 0.1, span: 0.5, chord: 0.18, n: 4, cover: 0x8d929c, tip: 0x2c2e36, tipFrom: 0.6, bars: { n: 2, color: 0x2c2e36 } });
            this.rwing = this._lvWing( 1, { fold: true, x: 0.24, y: 0.62, z: 0.1, span: 0.5, chord: 0.18, n: 4, cover: 0x8d929c, tip: 0x2c2e36, tipFrom: 0.6, bars: { n: 2, color: 0x2c2e36 } });
            this._lvTail({ y: 0.46, z: -0.34, len: 0.32, n: 5, spread: 0.5, pitch: 0.1, color: 0x7e838d, tip: 0x26282e, flip: true });
            const string = this._lvM(0xd8d0bc, 0.95);
            this._lvLegs({ x: 0.1, y: 0.32, z: 0.02, len: 0.32, r: 0.03, color: 0xc4505e, toe: 0.1, clawMat: dark,
                custom: (foot, s, mat) => {
                    if (s < 0) return false;
                    // The stump: a knuckle of scar with string wound round it.
                    this._lvAt(this._lvBlob(0.05, mat, 1.1, 0.8, 1.2, 6, 4), 0, 0.03, 0.01, foot);
                    for (let k = 0; k < 2; k++) { const w = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.009, 3, 8), string); w.rotation.set(Math.PI / 2 + k * 0.5, 0, k * 0.4); this._lvAt(w, 0, 0.04 + k * 0.02, 0.01, foot); }
                    const end = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.12, 3), string); end.rotation.z = 1.1; this._lvAt(end, 0.06, 0.02, 0.0, foot);
                    return true;
                } });
            this._lvParts();
            this._lvCfg = { mode: 'stand', flap: 1.6, amp: 0.25, headRate: 5, headAmp: 0.05, peck: 0.7, waddle: 0.04 };
        }

        // ── House Sparrow: round brown scrapper, streaked back, black bib, a
        //    seed-cracker beak and a ruff of nape feathers it never smooths ──
        // Archetype Bird: HEAD/BODY/BEAK/LEFT_WING/RIGHT_WING/TALONS.
        _buildHouseSparrow() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.85), streak = this._lvM(0x3a2614), grey = this._lvM(0x80848a), black = this._lvM(0x161616), chest = this._lvM(0xb8b0a0);
            this._lvTorso(0.3, skin, 0.95, 0.9, 1.15, 0.4, 0, -0.2);
            this._lvAt(this._lvBlob(0.22, chest, 1.08, 1.0, 1.0), 0, 0.34, 0.1);
            for (const x of [-0.1, -0.035, 0.035, 0.1]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.025, 0.24), streak); st.rotation.x = -0.25; this._lvAt(st, x, 0.65 - Math.abs(x) * 0.5, -0.06); }
            const h = this._lvHeadAt(0, 0.58, 0.16);
            this._lvAt(this._lvBlob(0.19, skin, 1, 1, 1, 8, 6), 0, 0.12, 0.06, h);
            this._lvAt(this._lvBlob(0.16, grey, 1.0, 0.45, 1.1, 8, 5), 0, 0.25, 0.04, h);
            for (const s of [-1, 1]) {
                this._lvAt(this._lvBlob(0.06, this._lvM(0x8a3a1a), 0.6, 0.6, 1.8, 6, 4), s * 0.15, 0.16, 0.0, h);
                this._lvAt(this._lvBlob(0.07, this._lvM(0xd8d0c0), 0.6, 1, 1, 6, 4), s * 0.13, 0.06, 0.1, h);
                this._eye(h, s * 0.12, 0.16, 0.16, 0.03, 0x111111, false);
            }
            this._lvAt(this._lvBlob(0.12, black, 1.0, 1.1, 0.5, 7, 5), 0, -0.02, 0.17, h);
            this.beak = this._lvBill(0.065, 0.14, this._lvM(0x2a2a2a, 0.5), 0, 0.09, 0.21, h, 6);
            for (let i = 0; i < 5; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.13, 3), skin); sp.rotation.x = -1.0 - (i % 2) * 0.2; sp.rotation.z = (i - 2) * 0.2; this._lvAt(sp, (i - 2) * 0.035, 0.2, -0.12, h); }
            const w = { fold: true, x: 0.24, y: 0.48, z: 0.05, span: 0.42, chord: 0.17, n: 4, cover: 0x7a5230, tip: 0x3a2818, bars: { n: 1, color: 0xe8e0d0 } };
            this.lwing = this._lvWing(-1, w); this.rwing = this._lvWing(1, w);
            this._lvTail({ y: 0.45, z: -0.28, len: 0.3, n: 4, spread: 0.35, pitch: 0.75, color: 0x5a3c22 });
            this._lvLegs({ x: 0.09, y: 0.2, len: 0.2, r: 0.022, color: 0xb08a70, toe: 0.08, clawMat: this._lvM(0x3a3030) });
            this._lvParts();
            this._lvCfg = { mode: 'stand', hop: 4.5, hopH: 0.06, flap: 3, amp: 0.4, headRate: 6, headAmp: 0.1, peck: 0.5 };
        }

        // ── Farmyard Chick: a faceted ball of yellow fluff on enormous feet,
        //    still wearing the cap of the egg it hatched from ────────────────
        // Archetype Bird: HEAD/BODY/BEAK/LEFT_WING/RIGHT_WING/TALONS.
        _buildFarmyardChick() {
            const p = this.profile;
            const fluff = this._skinMat(p.bodyColor, 0.95), shell = this._lvSide(0xf4efe2);
            this.body = new THREE.Group(); this.bodyGroup.add(this.body);
            this.bodyMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), fluff); this.bodyMesh.scale.set(1, 1.02, 1.08); this._lvAt(this.bodyMesh, 0, 0.4, 0);
            this._lvTufts(12, 0, 0.4, 0, 0.3, 0.306, 0.324, fluff, 0.04, 0.08, { e0: 0.3, eSpan: 1.6 });
            const h = this._lvHeadAt(0, 0.62, 0.06);
            const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 1), fluff); this._lvAt(skull, 0, 0.12, 0.05, h);
            // Eggshell cap with a jagged rim, knocked to one side.
            const cap = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.45), shell); cap.rotation.z = 0.3; this._lvAt(cap, 0.03, 0.2, 0.04, h);
            for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; const j = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.07, 3), shell); j.rotation.x = Math.PI; j.position.set(Math.cos(a) * 0.165, 0.0, Math.sin(a) * 0.165); cap.add(j); }
            for (const s of [-1, 1]) this._eye(h, s * 0.09, 0.15, 0.2, 0.035, 0x0c0c0c, false);
            this.beak = this._lvBill(0.04, 0.08, this._lvM(0xf08a20, 0.5), 0, 0.1, 0.23, h, 5);
            const w = { fold: true, x: 0.25, y: 0.45, z: 0.02, span: 0.2, chord: 0.1, n: 3, cover: 0xf2cf5a };
            this.lwing = this._lvWing(-1, w); this.rwing = this._lvWing(1, w);
            this._lvTail({ y: 0.42, z: -0.28, len: 0.12, n: 3, spread: 0.6, pitch: 0.6, color: 0xf2cf5a });
            this._lvLegs({ x: 0.1, y: 0.18, len: 0.18, r: 0.035, color: 0xf08a20, toe: 0.16, toeR: 0.03 });
            this._lvParts();
            this._lvCfg = { mode: 'stand', hop: 3, hopH: 0.04, flap: 4, amp: 0.5, headRate: 7, headAmp: 0.08, peck: 0.8 };
        }

        // ── Harbour Gull: a white gull locked in a glide, black-tipped wings,
        //    red-spotted bill with a stolen gold earring hooked through it ──
        // Archetype Bird: HEAD/BODY/BEAK/LEFT_WING/RIGHT_WING/TALONS.
        _buildHarbourGull() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.8), mantle = this._lvM(0x9aa6b2), bill = this._lvM(0xf2c41a, 0.5);
            this._lvTorso(0.3, skin, 0.85, 0.85, 1.6, 1.0, 0, 0.15);
            this._lvAt(this._lvBlob(0.26, mantle, 0.9, 0.5, 1.5), 0, 1.1, -0.05);
            const h = this._lvHeadAt(0, 1.1, 0.36);
            this._lvAt(this._lvBlob(0.16, skin, 0.9, 0.95, 1.15, 8, 6), 0, 0.08, 0.1, h);
            for (const s of [-1, 1]) { const e = this._eye(h, s * 0.1, 0.12, 0.17, 0.03, 0xf2e6a0, false); this._lvAt(this._lvBlob(0.012, this._lvM(0x0a0a0a), 1, 1, 1, 4, 3), 0, 0, 0.025, e); }
            this.beak = this._lvBill(0.045, 0.2, bill, 0, 0.06, 0.24, h, 4);
            this._lvBill(0.025, 0.06, bill, 0, 0.05, 0.42, h, 4, 0.9);
            this._lvAt(this._lvBlob(0.022, this._lvM(0xd02020), 1, 1, 1, 4, 3), 0, 0.03, 0.36, h);
            const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.01, 4, 10), this._lvM(0xffd23a, 0.25, 0x6a4a00)); ring.rotation.y = Math.PI / 2; this._lvAt(ring, 0, 0.01, 0.39, h);
            const w = { x: 0.2, y: 1.08, z: 0, span: 1.2, chord: 0.3, n: 6, cover: 0x9aa6b2, tip: 0x151515, tipFrom: 0.7, up: 0.12, sweep: 0.3, fan: 0.4, shape: u => 0.7 + 0.5 * u };
            this.lwing = this._lvWing(-1, w); this.rwing = this._lvWing(1, w);
            this._lvTail({ y: 0.97, z: -0.4, len: 0.28, n: 5, spread: 0.4, pitch: -0.1, color: p.bodyColor });
            this._lvLegs({ x: 0.08, y: 0.82, z: -0.05, len: 0.2, r: 0.022, color: 0xe08a90, web: true, toe: 0.1 });
            this._lvParts();
            this._lvCfg = { mode: 'hover', flap: 3.5, amp: 0.35, lift: 0.05, bank: 0.12, peck: 0.5 };
        }

        // ── Glint Magpie: pied black and white, a long graduated tail with a
        //    green sheen, and a stolen gold ring held fast in the beak ───────
        // Archetype Bird: HEAD/BODY/BEAK/LEFT_WING/RIGHT_WING/TALONS.
        _buildGlintMagpie() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.6), white = this._lvM(0xf2f2ee), gold = this._lvM(0xffd23a, 0.25, 0x6a4a00);
            this._lvTorso(0.26, skin, 0.85, 0.9, 1.35, 0.5, 0, -0.2);
            this._lvAt(this._lvBlob(0.2, white, 1.15, 0.9, 1.1), 0, 0.42, 0.06);
            const h = this._lvHeadAt(0, 0.66, 0.2);
            this._lvAt(this._lvBlob(0.14, skin, 1, 1, 1.05, 8, 6), 0, 0.08, 0.07, h);
            for (const s of [-1, 1]) this._eye(h, s * 0.09, 0.11, 0.15, 0.025, 0x2a1a10, false);
            this.beak = this._lvBill(0.045, 0.16, this._lvM(0x101010, 0.4), 0, 0.07, 0.19, h, 5);
            const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 4, 10), gold); ring.rotation.y = Math.PI / 2; this._lvAt(ring, 0, 0.05, 0.31, h);
            const w = { fold: true, x: 0.19, y: 0.56, z: 0.04, span: 0.42, chord: 0.18, n: 5, cover: 0x1a3a5a, tip: 0x163a3a, bars: { n: 1, color: 0xf2f2ee } };
            this.lwing = this._lvWing(-1, w); this.rwing = this._lvWing(1, w);
            this._lvTail({ y: 0.43, z: -0.3, len: 0.8, n: 5, spread: 0.25, pitch: 0.12, color: 0x1f3f4a, w: 0.06, shape: u => 1 - Math.abs(u) * 1.2 });
            this._lvLegs({ x: 0.08, y: 0.3, len: 0.3, r: 0.022, color: 0x141414, toe: 0.09, clawMat: this._lvM(0x080808),
                each: (leg, foot, s) => { if (s > 0) { const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.015, 8), gold); this._lvAt(coin, 0, 0.008, 0.05, foot); } } });
            this._lvParts();
            this._lvCfg = { mode: 'stand', hop: 3.2, hopH: 0.05, flap: 2.5, amp: 0.35, headRate: 3, headAmp: 0.1, peck: 0.7, tailAmp: 0.15 };
        }

        // ── Young Barn Owl: downy, knock-kneed fledgling behind a heart-shaped
        //    white face disc like a mask, head forever tilting ──────────────
        // Archetype Bird: HEAD/BODY/BEAK/LEFT_WING/RIGHT_WING/TALONS.
        _buildYoungBarnOwl() {
            const p = this.profile;
            const down = this._skinMat(p.bodyColor, 0.95), gold = this._lvM(0xc8963a), white = this._lvM(0xf6f2ea), rim = this._lvM(0x8a5a2a);
            this.body = new THREE.Group(); this.bodyGroup.add(this.body);
            this.bodyMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), down); this.bodyMesh.scale.set(1, 1.15, 0.95); this._lvAt(this.bodyMesh, 0, 0.66, 0);
            this._lvAt(this._lvBlob(0.26, gold, 1, 1, 0.6), 0, 0.74, -0.1);
            this._lvTufts(10, 0, 0.66, 0, 0.3, 0.345, 0.285, white, 0.04, 0.1, { e0: 0.4, eSpan: 1.4 });
            const h = this._lvHeadAt(0, 0.92, 0.02);
            const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 1), gold); skull.scale.set(1.05, 0.95, 0.9); this._lvAt(skull, 0, 0.14, 0, h);
            for (const s of [-1, 1]) {
                const l = this._lvBlob(0.145, rim, 1, 1.25, 0.3, 8, 6); l.rotation.z = -s * 0.35; this._lvAt(l, s * 0.075, 0.12, 0.15, h);
                const d = this._lvBlob(0.13, white, 1, 1.25, 0.35, 8, 6); d.rotation.z = -s * 0.35; this._lvAt(d, s * 0.075, 0.12, 0.17, h);
                this._lvAt(this._lvBlob(0.028, this._lvM(0x050505, 0.2), 1, 1, 1, 6, 4), s * 0.07, 0.15, 0.215, h);
            }
            this._lvAt(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.04), this._lvM(0xd8b07a)), 0, 0.13, 0.205, h);
            this.beak = this._lvBill(0.025, 0.08, this._lvM(0xe0c8b0, 0.5), 0, 0.08, 0.2, h, 4, 0.8);
            for (let i = 0; i < 6; i++) { const a = i * 1.05; this._lvAt(this._lvBlob(0.012, this._lvM(0x3a3a3a), 1, 1, 1, 4, 3), Math.sin(a) * 0.12, 0.33, -0.06 + Math.cos(a) * 0.08, h); }
            this._lvTufts(6, 0, 0.14, 0, 0.252, 0.228, 0.216, white, 0.03, 0.08, { parent: h, e0: 0.1, eSpan: 0.9, a0: 2.2, aSpan: 1.8 });
            const w = { fold: true, x: 0.26, y: 0.76, z: 0, span: 0.48, chord: 0.2, n: 5, cover: 0xc8963a, tip: 0xb0a090, bars: { n: 2, color: 0x8a8a8a } };
            this.lwing = this._lvWing(-1, w); this.rwing = this._lvWing(1, w);
            this._lvTail({ y: 0.5, z: -0.24, len: 0.16, n: 3, spread: 0.5, pitch: -0.2, color: 0xc8963a });
            this._lvLegs({ x: 0.12, y: 0.4, len: 0.4, r: 0.045, mat: white, splay: 0.1, toe: 0.08, toeR: 0.022, clawMat: this._lvM(0x1a1a1a), thigh: { r: 0.09 },
                custom: (foot, s) => { const toesM = this._lvM(0x8a8a8a); for (const a of [-0.4, 0, 0.4, Math.PI]) { const tg = new THREE.Group(); tg.rotation.y = a; foot.add(tg); const toe = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.022, 0.08, 4), toesM); toe.rotation.x = Math.PI / 2; toe.position.set(0, 0.011, 0.04); tg.add(toe); const cl = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.04, 4), this._lvM(0x1a1a1a)); cl.rotation.x = Math.PI * 0.75; cl.position.set(0, 0.006, 0.085); tg.add(cl); } return true; } });
            this._lvParts();
            this._lvCfg = { mode: 'stand', flap: 1.2, amp: 0.3, headRate: 1.5, headAmp: 0.12, swivel: 0.5, peck: 0.5 };
        }

        // ── Pipistrelle Bat: a scrap of a bat, all ears and membrane, mouth
        //    wide open in a screech you can see rippling off it ─────────────
        // Archetype Bird: HEAD/BODY/BEAK/LEFT_WING/RIGHT_WING/TALONS (BEAK is
        // the open mouth).
        _buildPipistrelleBat() {
            const p = this.profile;
            const fur = this._skinMat(p.bodyColor, 0.95), bone = this._lvM(0x2e2018), pink = this._lvM(0xd89a9a, 0.6);
            this._lvTorso(0.2, fur, 0.9, 1.15, 0.85, 1.0, 0);
            this._lvAt(this._lvBlob(0.15, this._lvM(0x8a6a4a), 1, 1, 1), 0, 0.95, 0.05);
            const h = this._lvHeadAt(0, 1.17, 0.04);
            this._lvAt(this._lvBlob(0.13, fur, 1, 0.9, 1, 8, 6), 0, 0.08, 0.05, h);
            this._lvAt(this._lvBlob(0.05, this._lvM(0x3a2418), 1.2, 0.8, 0.6, 6, 4), 0, 0.08, 0.17, h);
            for (const s of [-1, 1]) {
                const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.26, 4), fur); ear.rotation.z = -s * 0.35; this._lvAt(ear, s * 0.09, 0.25, 0.01, h);
                const inner = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 4), pink); inner.rotation.z = -s * 0.35; this._lvAt(inner, s * 0.085, 0.23, 0.04, h);
                this._eye(h, s * 0.06, 0.12, 0.15, 0.022, 0x0a0a0a, false);
            }
            this.beak = new THREE.Group(); this.beak.position.set(0, 0.02, 0.13); h.add(this.beak);
            this._lvAt(this._lvBlob(0.05, this._lvM(0x5a0a14, 0.4), 1, 0.9, 0.8, 6, 4), 0, 0, 0, this.beak);
            this._lvAt(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.022, 0.08), pink), 0, -0.045, 0.03, this.beak);
            for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.035, 3), this._lvM(0xf4f0e0, 0.3)); f.rotation.x = Math.PI; this._lvAt(f, s * 0.03, -0.01, 0.05, this.beak); }
            // The screech: two rings in front of the mouth. They are sound, not
            // body, so they hang free and are marked as floating by design.
            this.rings = [];
            for (let i = 0; i < 2; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.08 + i * 0.05, 0.008, 3, 12), this._lvM(0xe0e8ff, 0.3, 0x8090c0, 0.5)); r.userData.float = true; this._lvAt(r, 0, 0.02, 0.3 + i * 0.12, h); this.rings.push(r); }
            const memb = this._lvSide(0x4a3428, 0.92);
            const w = { x: 0.12, y: 1.06, z: -0.02, span: 0.8, bone, memb, up: 0.15, sweep: 0.15, drop: 0.3 };
            this.lwing = this._lvMembrane(-1, w); this.rwing = this._lvMembrane(1, w);
            this._lvLegs({ x: 0.07, y: 0.84, z: -0.06, len: 0.14, r: 0.015, mat: bone, toe: 0.05, clawMat: this._lvM(0x111111),
                each: (leg) => { leg.rotation.x = 0.6; } });
            const ug = new THREE.BufferGeometry(); ug.setAttribute('position', new THREE.Float32BufferAttribute([-0.08, 0.84, -0.04, 0.08, 0.84, -0.04, 0, 0.7, -0.2], 3)); ug.computeVertexNormals();
            this.tail = new THREE.Group(); this.tail.add(new THREE.Mesh(ug, memb)); this.bodyGroup.add(this.tail);
            this._lvParts();
            this._lvCfg = { mode: 'hover', flap: 14, amp: 0.7, lift: 0.1, bank: 0.1, peck: 0.3, tailAmp: 0 };
        }

        // ── Fruit Bat: fox-faced flying fox in a ginger ruff, juice dripping
        //    off its chin and a half-eaten fruit clutched in its feet ────────
        // Archetype Bird: HEAD/BODY/BEAK/LEFT_WING/RIGHT_WING/TALONS (BEAK is
        // the snout).
        _buildFruitBat() {
            const p = this.profile;
            const fur = this._skinMat(p.bodyColor, 0.95), ruff = this._lvM(0xc87a2a, 0.95), bone = this._lvM(0x2a1e18), juice = this._lvM(0x8a1a4a, 0.3);
            this._lvTorso(0.26, fur, 0.9, 1.25, 0.85, 1.0, 0);
            this._lvAt(this._lvBlob(0.22, ruff, 1.15, 0.8, 1.1), 0, 1.2, 0);
            const h = this._lvHeadAt(0, 1.26, 0.06);
            this._lvAt(this._lvBlob(0.14, this._lvM(0xa0622a, 0.9), 1, 1, 1, 8, 6), 0, 0.1, 0.06, h);
            this.beak = this._lvBill(0.07, 0.2, this._lvM(0x8a5222, 0.9), 0, 0.06, 0.14, h, 6);
            this._lvAt(this._lvBlob(0.025, this._lvM(0x0a0a0a, 0.3), 1, 1, 1, 6, 4), 0, 0.06, 0.34, h);
            for (const s of [-1, 1]) {
                const ear = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 4), bone); ear.rotation.z = -s * 0.2; this._lvAt(ear, s * 0.08, 0.24, 0.03, h);
                this._eye(h, s * 0.07, 0.14, 0.16, 0.04, 0x2a1a0a, false);
                const drip = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.07, 3), juice); drip.rotation.x = Math.PI; this._lvAt(drip, s * 0.03, 0.0, 0.25, h);
            }
            const memb = this._lvSide(0x2e2420, 0.95);
            const w = { x: 0.15, y: 1.15, z: -0.02, span: 1.05, bone, memb, thumb: this._lvM(0xd8c8a8, 0.4), up: 0.2, sweep: 0.2, drop: 0.45 };
            this.lwing = this._lvMembrane(-1, w); this.rwing = this._lvMembrane(1, w);
            this._lvLegs({ x: 0.08, y: 0.75, z: 0, len: 0.22, r: 0.02, mat: bone, toe: 0.05, clawMat: this._lvM(0x111111) });
            // The fruit, a wedge bitten out of it, held under the feet.
            const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6, 0, Math.PI * 1.6), this._lvSide(0xe0702a));
            fruit.rotation.y = 0.6; this._lvAt(fruit, 0, 0.43, 0.02, this.legs);
            this._lvAt(this._lvBlob(0.1, this._lvM(0xf0b040, 0.6), 1, 1, 1, 6, 4), 0, 0.43, 0.02, this.legs);
            this._lvRod(new THREE.Vector3(0, 0.53, 0.02), new THREE.Vector3(0.02, 0.6, 0.02), 0.012, 0.008, this._lvM(0x4a6a2a), this.legs, 4);
            this._lvParts();
            this._lvCfg = { mode: 'hover', flap: 6, amp: 0.55, lift: 0.15, bank: 0.06, peck: 0.4 };
        }

        // ── Park Goose: a furious S-necked goose, hissing with its bill open
        //    on a spiked tongue and the saw-toothed edges geese really have ──
        // Archetype Bird: HEAD/BODY/BEAK/LEFT_WING/RIGHT_WING/TALONS.
        _buildParkGoose() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.85), black = this._lvM(0x141414, 0.7), white = this._lvM(0xf0f0ea), tooth = this._lvM(0xe8e2d0, 0.4), pink = this._lvM(0xd87a84, 0.5);
            this._lvTorso(0.4, skin, 0.9, 0.8, 1.4, 0.62, 0, -0.1);
            this._lvAt(this._lvBlob(0.28, this._lvM(0xc8bca8), 1.1, 1, 0.8), 0, 0.62, 0.3);
            this._lvAt(this._lvBlob(0.16, white, 1, 1, 1), 0, 0.52, -0.46);
            // S-neck: three jointed segments, then the head held level.
            const h = this._lvHeadAt(0, 0.82, 0.4);
            const seg = (parent, rx, len) => { const g = new THREE.Group(); g.rotation.x = rx; parent.add(g); this._lvAt(this._lvBlob(0.075, black, 1, 1, 1, 6, 5), 0, 0, 0, g); this._lvRod(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, len, 0), 0.075, 0.065, black, g, 6); const top = new THREE.Group(); top.position.y = len; g.add(top); return top; };
            const s3 = seg(seg(seg(h, 0.5, 0.26), -1.05, 0.26), 0.95, 0.2);
            const skull = new THREE.Group(); skull.rotation.x = -0.4; s3.add(skull);
            this._lvAt(this._lvBlob(0.11, black, 0.85, 0.9, 1.3, 8, 6), 0, 0.04, 0.05, skull);
            for (const s of [-1, 1]) { this._lvAt(this._lvBlob(0.06, white, 0.4, 1, 1, 6, 4), s * 0.08, 0.0, 0.04, skull); this._eye(skull, s * 0.085, 0.07, 0.1, 0.022, 0x111111, false); }
            this.beak = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.04, 0.18), black); this._lvAt(this.beak, 0, 0.05, 0.22, skull);
            for (let k = 0; k < 4; k++) for (const s of [-1, 1]) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.03, 3), tooth); t.rotation.x = Math.PI; this._lvAt(t, s * 0.035, 0.02, 0.17 + k * 0.03, skull); }
            this._jaw = new THREE.Group(); this._jaw.position.set(0, 0.02, 0.14); this._lvJaw = 0.35; this._jaw.rotation.x = 0.35; skull.add(this._jaw);
            this._lvAt(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, 0.16), black), 0, 0, 0.08, this._jaw);
            const tongue = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.12, 4), pink); tongue.rotation.x = Math.PI / 2; this._lvAt(tongue, 0, 0.022, 0.07, this._jaw);
            for (let k = 0; k < 3; k++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.025, 3), tooth); sp.rotation.x = -0.6; this._lvAt(sp, 0, 0.04, 0.04 + k * 0.03, this._jaw); }
            const w = { fold: true, x: 0.3, y: 0.74, z: 0.05, span: 0.62, chord: 0.22, n: 5, cover: 0x5e5244, tip: 0x2a2420, bars: { n: 2, color: 0xc8bca8 } };
            this.lwing = this._lvWing(-1, w); this.rwing = this._lvWing(1, w);
            this._lvTail({ y: 0.62, z: -0.5, len: 0.22, n: 5, spread: 0.6, pitch: 0.35, color: 0x1a1a1a });
            this._lvLegs({ x: 0.13, y: 0.38, len: 0.38, r: 0.04, color: 0x3a3a3a, web: true, toe: 0.17 });
            this._lvParts();
            this._lvCfg = { mode: 'stand', flap: 2, amp: 0.35, lift: 0.25, headRate: 2.5, headAmp: 0.12, peck: 0.5, waddle: 0.05 };
        }

        // ── Grey Heron Fledgling: hunched, gangly and patient, neck folded
        //    in a kink, a fish still skewered on its dagger bill ────────────
        // Archetype Bird: HEAD/BODY/BEAK/LEFT_WING/RIGHT_WING/TALONS.
        _buildGreyHeronFledgling() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.85), black = this._lvM(0x1a1a1e), white = this._lvM(0xe6e8ea), yellow = this._lvM(0xd8b030, 0.5);
            this._lvTorso(0.3, skin, 0.8, 0.9, 1.3, 1.05, 0, 0.35);
            for (const s of [-1, 1]) this._lvAt(this._lvBlob(0.08, black, 1, 1, 1, 6, 5), s * 0.16, 1.12, 0.12);
            const h = this._lvHeadAt(0, 1.16, 0.18);
            const neckM = this._lvM(0xd8dce0);
            this._lvAt(this._lvBlob(0.065, neckM, 1, 1, 1, 6, 5), 0, 0, 0, h);
            this._lvRod(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.26, -0.05), 0.065, 0.055, neckM, h, 6);
            const kink = new THREE.Group(); kink.position.set(0, 0.26, -0.05); kink.rotation.x = 1.3; h.add(kink);
            this._lvAt(this._lvBlob(0.055, neckM, 1, 1, 1, 6, 5), 0, 0, 0, kink);
            this._lvRod(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.2, 0), 0.055, 0.05, neckM, kink, 6);
            const skull = new THREE.Group(); skull.position.y = 0.2; skull.rotation.x = -1.15; kink.add(skull);
            this._lvAt(this._lvBlob(0.09, white, 0.85, 0.9, 1.2, 8, 6), 0, 0.02, 0.03, skull);
            for (const s of [-1, 1]) { const pl = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.3, 3), black); pl.rotation.x = -Math.PI / 2 - 0.25; this._lvAt(pl, s * 0.02, 0.06, -0.18, skull); this._eye(skull, s * 0.07, 0.04, 0.07, 0.02, 0xffd21a, true); }
            this.beak = this._lvBill(0.035, 0.4, yellow, 0, 0.0, 0.1, skull, 4);
            const fish = new THREE.Group(); fish.position.set(0, 0, 0.4); skull.add(fish);
            this._lvAt(this._lvBlob(0.06, this._lvM(0x9ab0c0, 0.3), 2.2, 0.9, 0.5, 7, 5), 0, 0, 0, fish);
            const fin = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.08, 3), this._lvM(0x7a90a0)); fin.rotation.z = Math.PI / 2; fin.scale.z = 0.3; this._lvAt(fin, -0.15, 0, 0, fish);
            const w = { fold: true, x: 0.2, y: 1.1, z: 0.05, span: 0.55, chord: 0.2, n: 5, cover: 0x7a8088, tip: 0x2a2c30 };
            this.lwing = this._lvWing(-1, w); this.rwing = this._lvWing(1, w);
            this._lvTail({ y: 1.0, z: -0.34, len: 0.18, n: 3, spread: 0.4, pitch: -0.4, color: 0x6a7078 });
            this._lvLegs({ x: 0.09, y: 0.84, len: 0.84, r: 0.03, color: 0xa8a060, toe: 0.16, toeR: 0.02 });
            this._lvParts();
            this._lvCfg = { mode: 'stand', flap: 1, amp: 0.2, headRate: 0.8, headAmp: 0.04, peck: 0.9, waddle: 0.015, step: 0.03 };
        }

        // ── Snow Sparrow: fluffed into a near-perfect ball against the cold, a
        //    dollop of snow on its crown and icicles hanging off its tail ────
        // Archetype Bird: HEAD/BODY/BEAK/LEFT_WING/RIGHT_WING/TALONS.
        _buildSnowSparrow() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.95), snow = this._lvM(0xffffff, 0.9), ice = this._lvM(0xcfefff, 0.15, 0x3a7a9a, 0.85);
            this._lvTorso(0.34, skin, 1.05, 0.95, 1.05, 0.36, 0, 0, 8, 6);
            this._lvAt(this._lvBlob(0.26, this._lvM(0xf0ece4), 1, 1, 1, 8, 6), 0, 0.3, 0.14);
            // A ruff of fluffed-up feathers right round the waist.
            for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; const dir = new THREE.Vector3(Math.sin(a), -0.25, Math.cos(a)); const f = this._lvAim(new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 3), skin), dir); this._lvAt(f, Math.sin(a) * 0.36, 0.3, Math.cos(a) * 0.36); }
            const h = this._lvHeadAt(0, 0.55, 0.18);
            this._lvAt(this._lvBlob(0.15, skin, 1, 1, 1, 8, 6), 0, 0.06, 0.06, h);
            this._lvAt(new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), snow), 0, 0.19, 0.03, h);
            this._lvAt(new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), snow), 0.05, 0.25, -0.02, h);
            this._lvAt(this._lvBlob(0.06, this._lvM(0x161616), 1, 0.8, 0.5, 6, 4), 0, -0.02, 0.17, h);
            for (const s of [-1, 1]) this._eye(h, s * 0.09, 0.09, 0.15, 0.025, 0x111111, false);
            this.beak = this._lvBill(0.035, 0.07, this._lvM(0xe0c060, 0.5), 0, 0.05, 0.2, h, 5);
            const w = { fold: true, x: 0.3, y: 0.42, z: 0.02, span: 0.3, chord: 0.14, n: 3, cover: 0x7a6a58, tip: 0x3a3028, bars: { n: 1, color: 0xffffff } };
            this.lwing = this._lvWing(-1, w); this.rwing = this._lvWing(1, w);
            this._lvTail({ y: 0.3, z: -0.32, len: 0.2, n: 3, spread: 0.4, pitch: 0.2, color: 0x6a5c4c });
            for (const [x, z, l] of [[0, -0.12, 0.09], [-0.04, -0.09, 0.06], [0.04, -0.09, 0.07]]) { const ic = new THREE.Mesh(new THREE.ConeGeometry(0.014, l, 4), ice); ic.rotation.x = Math.PI; this._lvAt(ic, x, -l / 2 + 0.01, z, this.tail); }
            this._lvLegs({ x: 0.09, y: 0.09, len: 0.09, r: 0.02, color: 0x5a4a3a, toe: 0.07 });
            this._lvParts();
            this._lvCfg = { mode: 'stand', flap: 2, amp: 0.3, headRate: 3, headAmp: 0.06, peck: 0.6, waddle: 0 };
        }

        // ── Penguin Chick: grey pear of down on big pink feet, a black cap
        //    and the white face mask emperor chicks wear, a mohawk of fluff ──
        // Archetype Bird: HEAD/BODY/BEAK/LEFT_WING/RIGHT_WING/TALONS.
        _buildPenguinChick() {
            const p = this.profile;
            const down = this._skinMat(p.bodyColor, 0.95), black = this._lvM(0x18191c), white = this._lvM(0xf6f6f2), flip = this._lvM(0x6a6e74);
            this._lvTorso(0.3, down, 1, 1.1, 0.95, 0.6, 0);
            this._lvAt(this._lvBlob(0.34, down, 1, 0.85, 0.95), 0, 0.4, 0.02);
            this._lvTufts(10, 0, 0.5, 0, 0.32, 0.36, 0.3, this._lvM(0xa4a8ae, 0.95), 0.04, 0.1, { e0: 0.5, eSpan: 1.6 });
            const h = this._lvHeadAt(0, 0.86, 0.02);
            this._lvAt(this._lvBlob(0.2, black, 1, 1, 1, 8, 6), 0, 0.1, 0.02, h);
            // The white face mask over the black cap, eyes set in it.
            this._lvAt(this._lvBlob(0.15, white, 1.15, 0.8, 0.55, 8, 6), 0, 0.07, 0.12, h);
            for (const s of [-1, 1]) this._eye(h, s * 0.065, 0.1, 0.2, 0.026, 0x0a0a0a, false);
            this.beak = this._lvBill(0.035, 0.1, this._lvM(0x101010, 0.4), 0, 0.07, 0.2, h, 5);
            for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.12, 3), this._lvM(0xc8ccd0, 0.95)); t.rotation.x = -0.3 + i * 0.15; this._lvAt(t, 0, 0.32, 0.06 - i * 0.05, h); }
            const flipper = (s) => {
                const g = new THREE.Group(); g.position.set(s * 0.27, 0.66, 0); g._side = s;
                const f = this._lvBlob(0.12, flip, 0.25, 1, 0.55, 6, 5); f.rotation.z = s * 0.25; this._lvAt(f, s * 0.03, -0.12, 0, g);
                this.bodyGroup.add(g); return g;
            };
            this.lwing = flipper(-1); this.rwing = flipper(1);
            this._lvTail({ y: 0.34, z: -0.3, len: 0.1, n: 1, color: 0x4a4e54 });
            this._lvLegs({ x: 0.11, y: 0.13, len: 0.13, r: 0.04, color: 0xa08890, web: true, toe: 0.14 });
            this._lvParts();
            this._lvCfg = { mode: 'stand', flap: 4, amp: 0.5, lift: 0.1, headRate: 2, headAmp: 0.08, peck: 0.5, waddle: 0.1, step: 0.05 };
        }

        // ── Frostbite Bat: pale, rimed with frost, blank glowing eyes and two
        //    long icicle fangs, icicles hanging off its finger tips ─────────
        // Archetype Bat: HEAD/BODY/LEFT_WING/RIGHT_WING/FANGS.
        _buildFrostbiteBat() {
            const p = this.profile;
            const fur = this._skinMat(p.bodyColor, 0.7), rime = this._lvM(0xe0f8ff, 0.2, 0x4aa0c8), ice = this._lvM(0xdff6ff, 0.1, 0x3a8ab0, 0.85), bone = this._lvM(0x8aa8b8);
            this._lvTorso(0.22, fur, 0.9, 1.2, 0.85, 1.0, 0);
            for (const [x, y, z] of [[-0.14, 1.16, 0.0], [0.14, 1.16, 0.0], [-0.08, 1.2, -0.1], [0.08, 1.2, -0.1], [0, 1.24, -0.06], [0, 0.92, 0.17]]) this._lvAt(new THREE.Mesh(new THREE.OctahedronGeometry(0.035, 0), rime), x, y, z);
            const h = this._lvHeadAt(0, 1.2, 0.03);
            this._lvAt(this._lvBlob(0.14, fur, 1, 0.95, 1.05, 8, 6), 0, 0.08, 0.05, h);
            this._lvAt(this._lvBlob(0.06, fur, 1, 0.8, 0.8, 6, 4), 0, 0.04, 0.16, h);
            for (const s of [-1, 1]) {
                const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 4), fur); ear.rotation.z = -s * 0.3; this._lvAt(ear, s * 0.08, 0.22, 0, h);
                const fr = new THREE.Mesh(new THREE.OctahedronGeometry(0.025, 0), rime); this._lvAt(fr, s * 0.11, 0.31, 0, h);
                this._eye(h, s * 0.06, 0.11, 0.165, 0.035, 0x9fe8ff, true);
            }
            this.fangs = new THREE.Group(); this.fangs.position.set(0, 0, 0.17); h.add(this.fangs);
            for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.14, 4), ice); f.rotation.x = Math.PI; this._lvAt(f, s * 0.03, -0.05, 0, this.fangs); }
            const memb = this._lvSide(0xa8d0e8, 0.7);
            const w = { x: 0.13, y: 1.07, z: -0.02, span: 0.85, bone, memb, up: 0.1, sweep: 0.15, drop: 0.32 };
            for (const s of [-1, 1]) {
                const wing = this._lvMembrane(s, w);
                wing._tips.forEach((tp, k) => { const ic = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.08 + k * 0.02, 4), ice); ic.rotation.x = Math.PI; ic.position.set(tp.x, tp.y - 0.04 - k * 0.01, tp.z); wing._arm.add(ic); });
                if (s < 0) this.lwing = wing; else this.rwing = wing;
            }
            this._lvLegs({ x: 0.07, y: 0.8, z: -0.05, len: 0.12, r: 0.015, mat: bone, toe: 0.045, clawMat: this._lvM(0x203038), each: (leg) => { leg.rotation.x = 0.5; } });
            this._lvParts();
            this._lvCfg = { mode: 'hover', flap: 11, amp: 0.7, lift: 0.1, bank: 0.08, peck: 0.35 };
        }

        // ── White Owlet: a snowball of an owl with black barring, one great
        //    yellow eye wide open and the other half shut, on fluffy feet ───
        // Archetype Bird: HEAD/BODY/BEAK/LEFT_WING/RIGHT_WING/TALONS.
        _buildWhiteOwlet() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.95), bar = this._lvM(0x202020), iris = this._lvM(0xffd21a, 0.3, 0x6a5000), pupil = this._lvM(0x050505, 0.2);
            this._lvTorso(0.34, skin, 1, 1.05, 0.95, 0.48, 0, 0, 8, 6);
            // Black barring laid flat on the white plumage.
            for (let i = 0; i < 8; i++) {
                const a = -1.3 + (i % 4) * 0.85, e = 0.9 + Math.floor(i / 4) * 0.55;
                const dir = new THREE.Vector3(Math.sin(e) * Math.sin(a), Math.cos(e), Math.sin(e) * Math.cos(a));
                const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.025), bar);
                b.position.set(dir.x * 0.335, 0.48 + dir.y * 0.352, dir.z * 0.318); b.rotation.y = a; this.body.add(b);
            }
            const h = this._lvHeadAt(0, 0.78, 0.02);
            this._lvAt(this._lvBlob(0.25, skin, 1.05, 0.92, 0.95, 8, 6), 0, 0.13, 0, h);
            for (const s of [-1, 1]) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.07, 3), skin); t.rotation.z = -s * 0.3; this._lvAt(t, s * 0.13, 0.35, -0.02, h); }
            // Mismatched eyes: the left wide, the right smaller under a lid.
            const eL = this._lvBlob(0.075, iris, 1, 1, 0.6, 8, 6); this._lvAt(eL, -0.1, 0.16, 0.2, h); this._lvAt(this._lvBlob(0.035, pupil, 1, 1, 1, 6, 4), 0, 0, 0.06, eL);
            const eR = this._lvBlob(0.05, iris, 1, 1, 0.6, 8, 6); this._lvAt(eR, 0.1, 0.15, 0.21, h); this._lvAt(this._lvBlob(0.024, pupil, 1, 1, 1, 6, 4), 0, 0, 0.045, eR);
            const lid = new THREE.Mesh(new THREE.SphereGeometry(0.058, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), skin); lid.rotation.x = 0.35; this._lvAt(lid, 0.1, 0.152, 0.21, h);
            this._lvAt(this._lvBlob(0.07, skin, 1, 1, 0.8, 6, 5), 0, 0.07, 0.19, h);
            this.beak = this._lvBill(0.03, 0.07, this._lvM(0x141414, 0.4), 0, 0.09, 0.22, h, 4, 0.6);
            const w = { fold: true, x: 0.3, y: 0.55, z: 0, span: 0.4, chord: 0.2, n: 4, cover: 0xeeeeea, tip: 0xd8d8d0, bars: { n: 2, color: 0x2a2a2a } };
            this.lwing = this._lvWing(-1, w); this.rwing = this._lvWing(1, w);
            this._lvTail({ y: 0.38, z: -0.28, len: 0.16, n: 3, spread: 0.5, pitch: 0.1, color: 0xe8e8e2 });
            this._lvLegs({ x: 0.13, y: 0.2, len: 0.2, r: 0.07, mat: skin, toe: 0.12, toeR: 0.05, clawMat: this._lvM(0x111111) });
            this._lvParts();
            this._lvCfg = { mode: 'stand', flap: 1, amp: 0.2, headRate: 0.7, headAmp: 0.05, swivel: 0.7, peck: 0.4 };
        }

        // ── Winter Crow: a ragged black crow, the same gaps torn in both
        //    wings, frost on its shoulders and one milky eye under a scar ───
        // Archetype Bird: HEAD/BODY/BEAK/LEFT_WING/RIGHT_WING/TALONS.
        _buildWinterCrow() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.6), rime = this._lvM(0xd8f0ff, 0.2, 0x3a7a9a), black = this._lvM(0x0e0e10, 0.4);
            this._lvTorso(0.28, skin, 0.85, 0.9, 1.4, 1.0, 0, 0.15);
            for (const [x, y, z] of [[-0.15, 1.18, 0.05], [0.15, 1.18, 0.05], [-0.06, 1.24, -0.08], [0.07, 1.23, -0.14], [0, 1.25, 0.02]]) this._lvAt(new THREE.Mesh(new THREE.OctahedronGeometry(0.04, 0), rime), x, y, z);
            const h = this._lvHeadAt(0, 1.12, 0.3);
            this._lvAt(this._lvBlob(0.15, skin, 0.9, 0.95, 1.2, 8, 6), 0, 0.08, 0.08, h);
            this.beak = this._lvBill(0.055, 0.22, black, 0, 0.06, 0.2, h, 5);
            this._lvBill(0.03, 0.07, black, 0, 0.05, 0.39, h, 4, 0.9);
            for (let i = 0; i < 4; i++) { const hk = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 3), skin); hk.rotation.x = Math.PI - 0.3; this._lvAt(hk, (i - 1.5) * 0.04, -0.04, 0.1 - (i % 2) * 0.03, h); }
            this._eye(h, -0.09, 0.12, 0.17, 0.028, 0x050505, false);
            this._eye(h, 0.09, 0.12, 0.17, 0.032, 0xd8d8d0, false);
            const scar = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.13, 0.02), this._lvM(0xb06070, 0.5)); scar.rotation.z = 0.5; this._lvAt(scar, 0.095, 0.12, 0.19, h);
            const w = { x: 0.19, y: 1.06, z: 0.02, span: 1.0, chord: 0.32, n: 7, cover: 0x1c1d22, tip: 0x101114, ragged: 0.3, fan: 0.5, up: 0.1, sweep: 0.2 };
            this.lwing = this._lvWing(-1, w); this.rwing = this._lvWing(1, w);
            this._lvTail({ y: 0.98, z: -0.36, len: 0.4, n: 5, spread: 0.35, pitch: 0, color: 0x16171c, shape: u => 1 - Math.abs(u) * 0.5 });
            this._lvLegs({ x: 0.08, y: 0.8, len: 0.2, r: 0.022, color: 0x141414, toe: 0.08, clawMat: black });
            this._lvParts();
            this._lvCfg = { mode: 'hover', flap: 5, amp: 0.5, lift: 0.1, bank: 0.08, peck: 0.55 };
        }

        // ── Belfry Bat: dusty, squinting and half-deaf, one ear torn and
        //    flopped, cobwebs on its wings and a little bell in its feet ─────
        // Archetype Bat: HEAD/BODY/LEFT_WING/RIGHT_WING/FANGS.
        _buildBelfryBat() {
            const p = this.profile;
            const fur = this._skinMat(p.bodyColor, 0.95), bone = this._lvM(0x3a3028), pink = this._lvM(0xc89a96, 0.6), web = this._lvM(0xe8e8e0, 0.9, 0, 0.8), bronze = this._lvM(0xa07a3a, 0.35);
            bronze.metalness = 0.6; bronze.side = THREE.DoubleSide;
            this._lvTorso(0.23, fur, 0.95, 1.1, 0.9, 1.0, 0);
            for (let i = 0; i < 5; i++) this._lvAt(this._lvBlob(0.03, this._lvM(0xb8b0a4, 0.95), 1, 0.5, 1, 4, 3), Math.sin(i * 1.7) * 0.15, 1.1 - i * 0.04, Math.cos(i * 1.7) * 0.14);
            const h = this._lvHeadAt(0, 1.19, 0.03);
            this._lvAt(this._lvBlob(0.15, fur, 1.05, 1, 1, 8, 6), 0, 0.08, 0.04, h);
            const earL = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.2, 4), fur); earL.rotation.z = 0.3; this._lvAt(earL, -0.08, 0.24, 0, h);
            this._lvAt(new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 4), pink), -0.076, 0.22, 0.025, h).rotation.z = 0.3;
            const flop = new THREE.Group(); flop.position.set(0.08, 0.18, 0); flop.rotation.z = -1.5; h.add(flop);
            this._lvAt(new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 4), fur), 0, 0.09, 0, flop);
            this._lvAt(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.03), pink), 0.03, 0.1, 0, flop);   // the tear
            for (const s of [-1, 1]) {
                this._eye(h, s * 0.065, 0.11, 0.165, 0.028, 0x1a1008, false);
                const lidB = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.022, 0.03), fur); lidB.rotation.z = -s * 0.25; this._lvAt(lidB, s * 0.065, 0.135, 0.18, h);
            }
            const leaf = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.01, 3, 8), pink); this._lvAt(leaf, 0, 0.05, 0.19, h);
            this.fangs = new THREE.Group(); this.fangs.position.set(0, 0.0, 0.16); h.add(this.fangs);
            for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.05, 3), this._lvM(0xf4f0e0, 0.3)); f.rotation.x = Math.PI; this._lvAt(f, s * 0.025, -0.02, 0, this.fangs); }
            const memb = this._lvSide(0x5a4e46, 0.9);
            const w = { x: 0.13, y: 1.07, z: -0.02, span: 0.85, bone, memb, up: 0.12, sweep: 0.12, drop: 0.32 };
            for (const s of [-1, 1]) {
                const wing = this._lvMembrane(s, w);
                // Cobweb threads strung between the finger tips.
                for (let k = 0; k < wing._tips.length - 1; k++) this._lvRod(wing._tips[k], wing._tips[k + 1].clone().lerp(wing._wrist, 0.15), 0.004, 0.004, web, wing._arm, 3);
                this._lvRod(wing._tips[0], wing._tips[2], 0.003, 0.003, web, wing._arm, 3);
                if (s < 0) this.lwing = wing; else this.rwing = wing;
            }
            this._lvLegs({ x: 0.06, y: 0.79, len: 0.14, r: 0.018, mat: bone, toe: 0.04, clawMat: this._lvM(0x111111) });
            // A small bronze bell hung from the feet, swinging from its crown.
            this.bell = new THREE.Group(); this.bell.position.set(0, 0.67, 0); this.legs.add(this.bell);
            this._lvAt(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.1, 0.14, 8, 1, true), bronze), 0, -0.09, 0, this.bell);
            this._lvAt(this._lvBlob(0.045, bronze, 1, 0.8, 1, 8, 4), 0, -0.02, 0, this.bell);
            this._lvRod(new THREE.Vector3(0, -0.03, 0), new THREE.Vector3(0, -0.15, 0), 0.008, 0.008, bronze, this.bell, 4);
            this._lvAt(this._lvBlob(0.028, bronze, 1, 1, 1, 6, 4), 0, -0.16, 0, this.bell);
            this._lvParts();
            this._lvCfg = { mode: 'hover', flap: 10, amp: 0.65, lift: 0.1, bank: 0.08, peck: 0.3 };
        }

        // ── Blessed Dove: white dove with gold-leaf wing tips, its tail spread
        //    upright like an altar fan, an olive sprig in its bill and a halo
        // Archetype Bird: HEAD/BODY/BEAK/LEFT_WING/RIGHT_WING/TALONS.
        _buildBlessedDove() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.8), gold = this._lvM(0xffe27a, 0.25, 0xc89a20), leaf = this._lvM(0x6a8a3a, 0.7);
            this._lvTorso(0.26, skin, 0.85, 0.9, 1.35, 1.0, 0);
            const h = this._lvHeadAt(0, 1.12, 0.26);
            this._lvAt(this._lvBlob(0.13, skin, 0.9, 0.95, 1.1, 8, 6), 0, 0.07, 0.07, h);
            for (const s of [-1, 1]) this._eye(h, s * 0.075, 0.1, 0.15, 0.022, 0x2a0a0a, false);
            this.beak = this._lvBill(0.025, 0.08, this._lvM(0xd89a9a, 0.5), 0, 0.06, 0.18, h, 5);
            // Olive sprig across the bill.
            const sprig = new THREE.Group(); sprig.position.set(0, 0.055, 0.23); sprig.rotation.z = 0.15; h.add(sprig);
            const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.24, 3), this._lvM(0x6a5a2a)); stem.rotation.z = Math.PI / 2; this._lvAt(stem, 0.03, 0, 0, sprig);
            for (let k = 0; k < 4; k++) { const lf = this._lvBlob(0.03, leaf, 0.35, 1.0, 0.2, 5, 3); lf.rotation.z = (k % 2 ? 0.9 : -0.9) + Math.PI / 2; this._lvAt(lf, -0.06 + k * 0.05, k % 2 ? 0.02 : -0.02, 0, sprig); }
            this._lvAt(this._lvBlob(0.016, this._lvM(0x2a2a1a), 1, 1, 1, 5, 4), 0.14, -0.01, 0, sprig);
            // The halo hangs above the head on nothing at all: floating by design.
            this.halo = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.015, 4, 14), gold);
            this.halo.rotation.x = Math.PI / 2 - 0.2; this.halo.userData.float = true; this._lvAt(this.halo, 0, 0.3, 0.02, h);
            const w = { x: 0.17, y: 1.06, z: 0, span: 0.95, chord: 0.34, n: 6, cover: p.bodyColor, tip: 0xe8c86a, tipFrom: 0.82, up: 0.35, sweep: 0.15, fan: 0.6, shape: u => 0.8 + 0.3 * Math.sin(u * Math.PI) };
            this.lwing = this._lvWing(-1, w); this.rwing = this._lvWing(1, w);
            // Tail: an upright fan of nine feathers, broad ends out.
            this.tail = new THREE.Group(); this.tail.position.set(0, 1.0, -0.3); this.bodyGroup.add(this.tail);
            const lean = new THREE.Group(); lean.rotation.x = -0.45; this.tail.add(lean);
            const tm = this._lvSide(p.bodyColor), tg = this._lvSide(0xe8c86a);
            for (let i = 0; i < 9; i++) {
                const a = (i - 4) * 0.28, hh = new THREE.Group(); hh.rotation.z = a; lean.add(hh);
                const f = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.34, 4), tm); f.rotation.x = Math.PI; f.scale.z = 0.25; f.position.y = 0.17; hh.add(f);
                const tp = new THREE.Mesh(new THREE.ConeGeometry(0.062, 0.06, 4), tg); tp.rotation.x = Math.PI; tp.scale.z = 0.3; tp.position.y = 0.33; hh.add(tp);
            }
            this._lvLegs({ x: 0.07, y: 0.8, len: 0.14, r: 0.018, color: 0xd88a8a, toe: 0.06 });
            this._lvParts();
            this._lvCfg = { mode: 'hover', flap: 4, amp: 0.45, lift: 0.2, bank: 0.04, peck: 0.35, tailAmp: 0.04 };
        }

        // ── Pit Rooster: scarred fighting cock, plucked raw patches, a tall
        //    serrated comb, arching sickle tail, steel gaffs strapped to its
        //    spurs ──────────────────────────────────────────────────────────
        // Archetype Bird: HEAD/BODY/BEAK/LEFT_WING/RIGHT_WING/TALONS.
        _buildPitRooster() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.8), red = this._lvM(0xd81a1a, 0.5), raw = this._lvM(0xd06a6a, 0.5), hackle = this._lvM(0xe0902a, 0.6), green = this._lvSide(0x1a3a2a), steel = this._lvM(0xc8ccd4, 0.2);
            steel.metalness = 0.8;
            this._lvTorso(0.32, skin, 0.85, 0.95, 1.2, 0.72, 0, -0.35);
            this._lvAt(this._lvBlob(0.24, this._lvM(0x1a2a20), 1, 1.1, 0.8), 0, 0.7, 0.18);
            for (const s of [-1, 1]) {
                this._lvAt(this._lvBlob(0.08, raw, 0.4, 1, 1.2, 6, 4), s * 0.24, 0.64, -0.05);
                const sc = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.012, 0.16), raw); sc.rotation.y = s * 0.3; this._lvAt(sc, s * 0.2, 0.84, 0.0);
            }
            for (let i = 0; i < 9; i++) { const a = -1.4 + i * 0.35; const hk = this._lvAim(new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22, 3), hackle), new THREE.Vector3(Math.sin(a), -0.8, Math.cos(a) * 0.6 - 0.5)); this._lvAt(hk, Math.sin(a) * 0.13, 0.9, 0.18 + Math.cos(a) * 0.08); }
            const h = this._lvHeadAt(0, 0.9, 0.22);
            this._lvAt(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.22, 7), hackle), 0, 0.08, 0.02, h);
            this._lvAt(this._lvBlob(0.11, skin, 0.85, 0.95, 1.1, 8, 6), 0, 0.22, 0.05, h);
            for (let k = 0; k < 5; k++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1 + (k === 2 ? 0.03 : 0), 4), red); c.rotation.x = -0.2 + k * 0.1; this._lvAt(c, 0, 0.35, -0.03 + k * 0.035, h); }
            for (const s of [-1, 1]) { this._lvAt(this._lvBlob(0.04, red, 0.5, 1.4, 0.8, 6, 4), s * 0.025, 0.11, 0.13, h); this._eye(h, s * 0.07, 0.25, 0.1, 0.022, 0xff8a1a, false); this._lvAt(this._lvBlob(0.022, this._lvM(0xf0f0ea), 0.5, 1, 1, 5, 4), s * 0.085, 0.19, 0.04, h); }
            this.beak = this._lvBill(0.03, 0.09, this._lvM(0xe0b030, 0.5), 0, 0.21, 0.13, h, 5, 0.3);
            // Sickle tail: arcs of torus rising off the rump and falling away.
            this.tail = new THREE.Group(); this.tail.position.set(0, 0.72, -0.3); this.bodyGroup.add(this.tail);
            const R0 = [0.3, 0.26, 0.34, 0.22, 0.28];
            for (let i = 0; i < 5; i++) {
                const R = R0[i], fan = new THREE.Group(); fan.rotation.y = (i - 2) * 0.16; this.tail.add(fan);
                const arc = new THREE.Mesh(new THREE.TorusGeometry(R, 0.022, 3, 8, Math.PI * 0.85), i === 2 ? this._lvSide(0x6a4a1a) : green);
                arc.rotation.y = Math.PI / 2; arc.position.set(0, -0.454 * R, -0.891 * R); fan.add(arc);
            }
            const w = { fold: true, x: 0.23, y: 0.78, z: 0.05, span: 0.45, chord: 0.2, n: 5, cover: 0x7a2a14, tip: 0x1a2a20 };
            this.lwing = this._lvWing(-1, w); this.rwing = this._lvWing(1, w);
            this._lvLegs({ x: 0.11, y: 0.45, len: 0.45, r: 0.045, color: 0xe0b030, toe: 0.14, clawMat: this._lvM(0x3a3a3a), spur: { len: 0.16, mat: steel }, thigh: { r: 0.1, mat: skin } });
            this._lvParts();
            this._lvCfg = { mode: 'stand', flap: 2, amp: 0.4, headRate: 3, headAmp: 0.1, peck: 0.8, waddle: 0.04 };
        }

        // ── Parrot Chick: half-feathered and mostly bare pink skin, quills
        //    still in their blue sheaths, a beak far too big, always shrieking
        // Archetype Bird: HEAD/BODY/BEAK/LEFT_WING/RIGHT_WING/TALONS.
        _buildParrotChick() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.5), sheath = this._lvM(0x5a7a9a, 0.6), green = this._lvM(0x2aa040, 0.7), beakM = this._lvM(0x5a5e66, 0.4);
            this._lvTorso(0.32, skin, 1, 1.05, 1.05, 0.42, 0);
            this._lvAt(this._lvBlob(0.26, skin, 1, 1, 1), 0, 0.32, 0.1);
            // Pin feathers: blue sheaths with a green brush just breaking out.
            for (let i = 0; i < 16; i++) {
                const a = this.idRand() * Math.PI * 2, e = 0.3 + this.idRand() * 1.4;
                const dir = new THREE.Vector3(Math.sin(e) * Math.sin(a), Math.cos(e), Math.sin(e) * Math.cos(a));
                const base = new THREE.Vector3(dir.x * 0.3, 0.42 + dir.y * 0.32, dir.z * 0.32);
                const tipP = base.clone().addScaledVector(dir, 0.1);
                this._lvRod(base, tipP, 0.012, 0.012, sheath, this.body, 4);
                const brush = this._lvAim(new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.06, 3), green), dir); brush.position.copy(tipP).addScaledVector(dir, 0.02); this.body.add(brush);
            }
            const h = this._lvHeadAt(0, 0.64, 0.08);
            this._lvAt(this._lvBlob(0.2, skin, 1, 1, 1, 8, 6), 0, 0.12, 0.06, h);
            for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 3), green); t.rotation.x = -0.4 + i * 0.12; t.rotation.z = (i - 1.5) * 0.25; this._lvAt(t, (i - 1.5) * 0.04, 0.32, 0.02, h); }
            for (const s of [-1, 1]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 4, 10), this._lvM(0xf0f0f0)); ring.rotation.y = s * 0.6; this._lvAt(ring, s * 0.11, 0.16, 0.17, h); this._eye(h, s * 0.11, 0.16, 0.17, 0.045, 0x0a0a0a, false); }
            this.beak = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 5), beakM); this.beak.rotation.x = Math.PI * 0.62; this._lvAt(this.beak, 0, 0.08, 0.26, h);
            const hook = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 4), beakM); hook.rotation.x = Math.PI * 0.9; this._lvAt(hook, 0, 0.0, 0.33, h);
            this._jaw = new THREE.Group(); this._jaw.position.set(0, 0.02, 0.2); this._lvJaw = 0.4; this._jaw.rotation.x = 0.4; h.add(this._jaw);
            this._lvAt(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.12), this._lvM(0x3a3e44, 0.5)), 0, 0, 0.04, this._jaw);
            this._lvAt(this._lvBlob(0.035, this._lvM(0x1a1a1a, 0.4), 1, 0.6, 1, 6, 4), 0, 0.025, 0.04, this._jaw);
            const w = { fold: true, x: 0.28, y: 0.5, z: 0.02, span: 0.3, chord: 0.14, n: 3, cover: p.bodyColor, tip: 0x2aa040, tipFrom: 0.4 };
            this.lwing = this._lvWing(-1, w); this.rwing = this._lvWing(1, w);
            this._lvTail({ y: 0.32, z: -0.3, len: 0.1, n: 3, spread: 0.6, pitch: 0.3, color: p.bodyColor });
            this._lvLegs({ x: 0.1, y: 0.18, len: 0.18, r: 0.035, color: 0x6a6e76, toe: 0.1, zygo: true, clawMat: this._lvM(0x2a2a2a) });
            this._lvParts();
            this._lvCfg = { mode: 'stand', flap: 3, amp: 0.45, headRate: 2, headAmp: 0.15, peck: 0.6, waddle: 0.06 };
        }

        // ── Toucan Fledgling: black fledgling under a banded bill twice the
        //    length of its head that it can barely hold level ───────────────
        // Archetype Bird: HEAD/BODY/BEAK/LEFT_WING/RIGHT_WING/TALONS.
        _buildToucanFledgling() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.6);
            this._lvTorso(0.3, skin, 0.9, 1.0, 1.15, 0.55, 0, -0.25);
            this._lvAt(this._lvBlob(0.17, this._lvM(0xf2e8a0), 1.1, 1, 0.6), 0, 0.68, 0.2);
            this._lvAt(this._lvBlob(0.1, this._lvM(0xd02020), 1, 1, 1), 0, 0.42, -0.28);
            const h = this._lvHeadAt(0, 0.8, 0.14);
            this._lvAt(this._lvBlob(0.16, skin, 0.9, 0.95, 1.05, 8, 6), 0, 0.08, 0.04, h);
            for (const s of [-1, 1]) { this._lvAt(this._lvBlob(0.06, this._lvM(0x3a8ae0, 0.4), 0.4, 1, 1, 6, 5), s * 0.12, 0.1, 0.08, h); this._eye(h, s * 0.14, 0.1, 0.09, 0.025, 0x2a8a3a, false); }
            // The bill: banded tapering segments, flattened side to side.
            this.bill = new THREE.Group(); this.bill.position.set(0, 0.08, 0.15); this.bill.rotation.x = 0.15; h.add(this.bill);
            const band = new THREE.Group(); band.scale.set(0.75, 1.3, 1); this.bill.add(band);
            [[0.1, 0.085, 0.18, 0.09, 0x9ac83a], [0.085, 0.065, 0.18, 0.27, 0xf08a1a], [0.065, 0.03, 0.14, 0.43, 0xd8301a]].forEach(([r0, r1, len, z, col]) => {
                const c = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 4), this._lvM(col, 0.4)); c.rotation.x = Math.PI / 2; c.rotation.y = Math.PI / 4; this._lvAt(c, 0, 0, z, band);
            });
            const tipC = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.07, 4), this._lvM(0x101010, 0.4)); tipC.rotation.x = Math.PI / 2; this._lvAt(tipC, 0, 0, 0.53, band);
            this._lvAt(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.36), this._lvM(0x7aa82a, 0.4)), 0, -0.07, 0.2, band);
            this.beak = this.bill;
            const w = { fold: true, x: 0.23, y: 0.6, z: 0, span: 0.4, chord: 0.18, n: 4, cover: 0x1a1a20, tip: 0x101014 };
            this.lwing = this._lvWing(-1, w); this.rwing = this._lvWing(1, w);
            this._lvTail({ y: 0.48, z: -0.3, len: 0.36, n: 4, spread: 0.3, pitch: 0.35, color: 0x18181c });
            this._lvLegs({ x: 0.1, y: 0.3, len: 0.3, r: 0.03, color: 0x5a6a8a, toe: 0.09, zygo: true, clawMat: this._lvM(0x1a1a1a) });
            this._lvParts();
            this._lvCfg = { mode: 'stand', hop: 2.5, hopH: 0.04, flap: 2, amp: 0.3, headRate: 1.6, headAmp: 0.12, peck: 0.6 };
        }

        // ── Highway Hawk Chick: scrawny half-downy hawk perched on top of a
        //    bent yield sign, mantling its stubby wings and screeching ──────
        // Archetype Bird: HEAD/BODY/BEAK/LEFT_WING/RIGHT_WING/TALONS.
        _buildHighwayHawkChick() {
            const p = this.profile;
            const down = this._skinMat(p.bodyColor, 0.95), brown = this._lvM(0x6a4a2a), metal = this._lvM(0x8a8e94, 0.4);
            // The sign it lives on: a pole and a battered yield triangle.
            this.sign = new THREE.Group(); this.bodyGroup.add(this.sign);
            this._lvAt(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.52, 5), metal), 0, 0.26, -0.03, this.sign);
            const plate = new THREE.Group(); plate.position.set(0, 0.52, 0); plate.rotation.set(-0.1, 0, 0.12); this.sign.add(plate);
            const face = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 3), this._lvM(0xe8e8e8, 0.6)); face.rotation.x = Math.PI / 2; this._lvAt(face, 0, 0, 0, plate);
            const rimP = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.02, 3), this._lvM(0xc81a1a, 0.6)); rimP.rotation.x = Math.PI / 2; this._lvAt(rimP, 0, 0, -0.024, plate);
            this._lvTorso(0.26, down, 0.85, 1.05, 1.0, 1.1, 0);
            [[0.12, 1.24, -0.08], [-0.12, 1.2, -0.1], [0, 1.28, -0.14], [0.06, 1.0, -0.18]].forEach(([x, y, z]) => this._lvAt(this._lvBlob(0.1, brown, 1, 0.5, 1.2), x, y, z));
            this._lvTufts(8, 0, 1.1, 0, 0.221, 0.273, 0.26, this._lvM(0xeeeae2, 0.95), 0.035, 0.09, { e0: 0.6, eSpan: 1.4 });
            const h = this._lvHeadAt(0, 1.3, 0.08);
            this._lvAt(this._lvBlob(0.15, down, 0.95, 0.95, 1.05, 8, 6), 0, 0.1, 0.04, h);
            this._lvAt(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.06), brown), 0, 0.15, 0.13, h);
            for (const s of [-1, 1]) this._eye(h, s * 0.075, 0.11, 0.16, 0.028, 0xd8a020, true);
            this._lvAt(this._lvBlob(0.035, this._lvM(0xf0c020, 0.5), 1, 1, 1, 6, 4), 0, 0.08, 0.17, h);
            this.beak = this._lvBill(0.04, 0.1, this._lvM(0x3a3a40, 0.4), 0, 0.08, 0.17, h, 5, 0.3);
            this._lvBill(0.025, 0.06, this._lvM(0xf0c020, 0.5), 0, 0.03, 0.15, h, 4, -0.3);
            const w = { x: 0.18, y: 1.15, z: 0, span: 0.4, chord: 0.2, n: 4, cover: 0x8a6a4a, tip: 0x4a3a2a, up: -0.3, sweep: 0.5, fan: 0.4 };
            this.lwing = this._lvWing(-1, w); this.rwing = this._lvWing(1, w);
            this._lvTail({ y: 1.0, z: -0.24, len: 0.12, n: 3, spread: 0.5, pitch: -0.3, color: 0x6a4a2a });
            // Feet clamped on the sign's top edge.
            this._lvLegs({ x: 0.09, y: 0.9, len: 0.21, r: 0.035, color: 0xe8c020, toe: 0.12, toeR: 0.025, clawMat: this._lvM(0x111111) });
            this._lvParts();
            this._lvCfg = { mode: 'stand', flap: 2.5, amp: 0.4, lift: 0.1, headRate: 2.2, headAmp: 0.1, peck: 0.7, waddle: 0.015, step: 0.02 };
        }

        // ── Ferry Gull: salt-stained gull on yellow legs, head thrown back
        //    mid-scream with its bill wide open, a stolen cone of chips at
        //    its feet ───────────────────────────────────────────────────────
        // Archetype Bird: HEAD/BODY/BEAK/LEFT_WING/RIGHT_WING/TALONS.
        _buildFerryGull() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.8), mantle = this._lvM(0x8e98a2), bill = this._lvM(0xf0c020, 0.5), stain = this._lvM(0xa89878, 0.95);
            this._lvTorso(0.3, skin, 0.85, 0.85, 1.45, 0.62, 0, -0.15);
            this._lvAt(this._lvBlob(0.25, mantle, 1, 0.45, 1.4), 0, 0.74, -0.05);
            [[0.2, 0.55, 0.15], [-0.18, 0.5, 0.05], [0.1, 0.42, -0.2], [-0.05, 0.45, 0.3]].forEach(([x, y, z]) => this._lvAt(this._lvBlob(0.06, stain, 1, 0.4, 1.3, 5, 4), x, y, z));
            const h = this._lvHeadAt(0, 0.76, 0.3);
            this._lvAt(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.2, 7), skin), 0, 0.08, 0, h);
            const skull = new THREE.Group(); skull.position.y = 0.2; skull.rotation.x = -0.7; h.add(skull);
            this._lvAt(this._lvBlob(0.14, skin, 0.9, 0.95, 1.15, 8, 6), 0, 0, 0, skull);
            for (const s of [-1, 1]) this._eye(skull, s * 0.09, 0.04, 0.08, 0.025, 0xf2e6a0, false);
            this._lvAt(this._lvBlob(0.04, this._lvM(0xc82a2a, 0.4), 1, 1, 1, 6, 4), 0, -0.01, 0.13, skull);
            this.beak = this._lvBill(0.04, 0.18, bill, 0, 0.03, 0.1, skull, 4, -0.25);
            this._lvBill(0.035, 0.15, bill, 0, -0.03, 0.1, skull, 4, 0.3);
            const w = { fold: true, x: 0.22, y: 0.7, z: 0.05, span: 0.6, chord: 0.18, n: 5, cover: 0x8e98a2, tip: 0x141414, tipFrom: 0.65, tuck: 0.1 };
            this.lwing = this._lvWing(-1, w); this.rwing = this._lvWing(1, w);
            this._lvTail({ y: 0.58, z: -0.4, len: 0.2, n: 4, spread: 0.4, pitch: 0.1, color: p.bodyColor });
            this._lvLegs({ x: 0.09, y: 0.4, len: 0.4, r: 0.03, color: 0xe0c040, web: true, toe: 0.13,
                each: (leg, foot, s) => {
                    if (s < 0) return;
                    // A paper cone of chips, knocked over against the foot.
                    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 6, 1, true), this._lvSide(0xe8e0d0)); cone.rotation.z = Math.PI / 2; this._lvAt(cone, 0.12, 0.08, 0.06, foot);
                    for (let k = 0; k < 4; k++) { const chip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.12), this._lvM(0xf0c850, 0.8)); chip.rotation.set(0.2 * k, 0.6 + k * 0.3, 0); this._lvAt(chip, 0.02 - k * 0.012, 0.07 + (k % 2) * 0.03, 0.06 + (k - 1.5) * 0.02, foot); }
                } });
            this._lvParts();
            this._lvCfg = { mode: 'stand', flap: 2, amp: 0.3, headRate: 7, headAmp: 0.06, peck: 0.5, waddle: 0.03 };
        }

        // ── Canyon Swift: a sooty cigar on sickle wings, flat-headed, a gape
        //    far wider than its beak, banking hard as it dives past ─────────
        // Archetype Bird: HEAD/BODY/BEAK/LEFT_WING/RIGHT_WING/TALONS.
        _buildCanyonSwift() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.8), dark = this._lvM(0x1a1614);
            this._lvTorso(0.2, skin, 0.95, 0.85, 2.0, 1.0, 0);
            this._lvAt(this._lvBlob(0.07, this._lvM(0xc8bca8), 1, 1, 1, 6, 4), 0, 0.95, 0.27);
            const h = this._lvHeadAt(0, 1.03, 0.28);
            this._lvAt(this._lvBlob(0.12, skin, 1.2, 0.8, 1.0, 8, 6), 0, 0.02, 0.06, h);
            this._lvAt(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.05), dark), 0, 0.07, 0.13, h);
            for (const s of [-1, 1]) this._eye(h, s * 0.07, 0.035, 0.15, 0.022, 0x6a1010, true);
            this.beak = this._lvBill(0.015, 0.04, dark, 0, 0.0, 0.17, h, 4);
            this._jaw = new THREE.Group(); this._jaw.position.set(0, -0.03, 0.1); h.add(this._jaw);
            this._lvAt(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.015, 0.1), this._lvM(0x5a1a1a, 0.5)), 0, 0, 0.03, this._jaw);
            const w = { x: 0.12, y: 1.04, z: 0.05, span: 1.3, chord: 0.24, n: 7, cover: 0x4a423c, tip: 0x2a2420, up: 0.3, sweep: 0.55, fan: 1.0, fw: 0.4, shape: u => 0.9 + u * 1.1 };
            this.lwing = this._lvWing(-1, w); this.rwing = this._lvWing(1, w);
            this._lvTail({ y: 0.98, z: -0.32, len: 0.3, n: 2, spread: 0.6, pitch: 0.05, color: 0x24201e });
            this._lvLegs({ x: 0.05, y: 0.88, z: 0.05, len: 0.05, r: 0.015, color: 0x2a2420, toe: 0.04, clawMat: dark });
            this._lvParts();
            this._lvCfg = { mode: 'hover', flap: 9, amp: 0.35, lift: 0, bank: 0.25, peck: 0.3 };
        }

        animatePose(deltaTime) {
            if (this._baseY === null) this._baseY = this.model.position.y;
            // (sacredphoenix / pyroclastphoenix previously called an unimplemented
            // this._phoenixPose() here, which threw every frame; they now use the
            // standard bird pose below.)
            const t = this.animTime, anim = this.currentAnimation;
            let growth = 1.0;
            if (anim === 'spawn') growth = Math.min(1.0, t / 0.6);
            this.applyModelScale(growth);

            if (this._lvCfg) { this._lvPose(t, anim); return; }
            const fast = anim === 'attack', sp = anim === 'specialattack';
            const stand = this.profile.posture === 'stand';
            const fam = this.profile.family || this.variant;
            const isRoc = this.variant === 'roc' || fam === 'roc';
            const isBat = fam === 'bat';
            let flapRate = isRoc ? 5 : (isBat ? 13 : 9);
            if (fast) flapRate *= 1.8; else if (sp) flapRate *= 2.4;
            const flapAmp = stand ? 0.25 : (isRoc ? 0.8 : (isBat ? 0.9 : 0.7));
            const flap = Math.sin(t * flapRate) * flapAmp;
            const rest = stand ? 0.6 : 0.2;
            if (this.lwing && this.lwing.visible) this.lwing.rotation.z = rest + flap;
            if (this.rwing && this.rwing.visible) this.rwing.rotation.z = -rest - flap;

            if (stand) {
                // Waddle in place rather than hover.
                this.model.rotation.z = Math.sin(t * 3) * 0.06;
                this.model.position.y = this._baseY + Math.abs(Math.sin(t * 3)) * 0.01 * this.scale;
            } else {
                let bob = Math.sin(t * flapRate) * 0.05 + Math.sin(t * 1.4) * 0.07;
                if (anim === 'hit') bob += Math.sin(t * 26) * Math.exp(-t * 6) * 0.14;
                this.model.position.y = this._baseY + bob * this.scale * (isRoc ? 1.4 : 1.0);
                this.model.rotation.z = Math.sin(t * 1.1) * 0.05;
            }
            if (this.head && this.head.visible) this.head.rotation.x = Math.sin(t * (stand ? 2.5 : 2)) * 0.1 + ((fast || sp) ? 0.15 : 0);
            if (this.tail && this.tail.visible) this.tail.rotation.x = 0.35 + Math.sin(t * 2) * 0.08;
            if (this.variant === 'brd_backwardsbird') this._insideOutPose(t, fast || sp);
        }

        // Organs on the outside keep working in open air: the heart beats, the
        // lungs bellow, the gut coil swings under the cage.
        _insideOutPose(t, excited) {
            const rate = excited ? 7.5 : 4.2;
            if (this.heart && this.heart.visible) {
                const beat = 1 + Math.pow(Math.max(0, Math.sin(t * rate)), 8) * 0.28;
                this.heart.scale.set(0.9 * beat, 1.15 * beat, 0.9 * beat);
            }
            const breath = 1 + Math.sin(t * (excited ? 4.0 : 2.2)) * 0.1;
            if (this.leftLung && this.leftLung.visible) this.leftLung.scale.set(breath, 1 / breath, breath);
            if (this.rightLung && this.rightLung.visible) this.rightLung.scale.set(breath, 1 / breath, breath);
            if (this.guts && this.guts.visible) {
                this.guts.rotation.z = Math.sin(t * 1.7) * 0.16;
                this.guts.rotation.x = Math.sin(t * 1.3 + 0.8) * 0.1;
                this.guts.position.y = this._gutY + Math.sin(t * 2.4) * 0.02;
            }
            // Loose eyeballs swing on their optic cords.
            const swing = Math.sin(t * 2.8) * 0.03;
            if (this.leftEye && this.leftEye.visible) this.leftEye.position.x = -0.17 + swing;
            if (this.rightEye && this.rightEye.visible) this.rightEye.position.x = 0.17 + swing;
        }

        deathPose(deltaTime) {
            const t = this.animTime, prog = Math.min(1.0, t / 1.0);
            if (this._baseY === null) this._baseY = this.model.position.y;
            // Tumble out of the sky; the base death fade handles opacity.
            this.model.position.y = this._baseY - prog * 0.8 * this.scale;
            this.model.rotation.x = prog * 1.5;
        }
    }

    const make = (scale, offsetY, enemy, weaponType, key) =>
        new BirdBattler3D(scale, offsetY, enemy, weaponType, key);

    const reg = window.Battler3D.registerArchetype;
    const S = BIRD_PROFILES;
    // Override the bird-of-prey / songbird / waterbird tokens that the generic
    // Winged `bird` rig previously owned (this file loads after Winged).
    reg('raptor',    { aliases: ['raptor', 'eagle', 'eagles', 'falcon', 'falcons', 'hawk', 'hawks', 'owl', 'owls', 'vulture', 'vultures', 'buzzard', 'condor', 'osprey', 'kestrel', 'kite', 'harpy'], scale: S.raptor.scale, weapon: 0, create: make });
    reg('corvid',    { aliases: ['corvid', 'raven', 'ravens', 'crow', 'crows', 'jay', 'jays', 'magpie', 'pigeon', 'pigeons', 'dove', 'sparrow', 'finch', 'robin', 'songbird', 'starling', 'mockingbird', 'cardinal', 'parrot', 'parakeet', 'cockatoo', 'canary'], scale: S.corvid.scale, weapon: 0, create: make });
    reg('waterfowl', { aliases: ['waterfowl', 'duck', 'ducks', 'penguin', 'penguins', 'flamingo', 'flamingos', 'goose', 'geese', 'swan', 'pelican', 'heron', 'stork', 'gull', 'seagull', 'albatross', 'puffin'], scale: S.waterfowl.scale, weapon: 0, create: make });
    reg('roc',       { aliases: ['roc', 'rocs', 'griffon', 'griffin', 'gryphon', 'griphon', 'terrorbird'], scale: S.roc.scale, weapon: 0, create: make });

    // Bespoke per-enemy Birds: each pinned by name via registerNamed below, so
    // aliases stay narrow (self-only) to avoid re-owning shared tokens.
    const BESPOKE = [
        'brd_backwardsbird', 'brd_bluejay', 'brd_tinychick', 'brd_tundracrow', 'brd_ominousravenmurder',
        'brd_parrot', 'brd_spectralsongbird', 'brd_nightwisp', 'brd_ominousraven', 'brd_badasspigeon',
        'brd_flamingosentinel', 'brd_quackingduck', 'brd_giantpenguin',
        'brd_frozenbat', 'brd_vegetalvampire', 'brd_crimsonsucker', 'brd_eyelessbat',
        'brd_blizzardowl', 'brd_giantvulture', 'brd_wiseowl', 'brd_dustdevilbird', 'brd_mountaineagle',
        'brd_peregrinefalcon', 'brd_rotvulture', 'brd_baldeagle',
        'brd_griphon', 'brd_majesticgriffon', 'brd_stormharbinger', 'brd_stormroc', 'brd_thunderwingroc', 'brd_giantterrorbird'
    ];
    BESPOKE.forEach(k => reg(k, { aliases: [k], scale: S[k].scale, weapon: 0, create: make }));
    // Level 1-5 starters, also self-only aliases.
    Object.keys(LV_BUILDERS).forEach(k => reg(k, { aliases: [k], scale: S[k].scale, weapon: 0, create: make }));

    //=========================================================================
    // Name assignments. Birds carry <Archetype: Bird>, which outranks name-token
    // aliases, so registerNamed (higher priority than the meta) pins each one.
    // Bat-like birds go to the existing Winged `bat`; leftover oddities (Catican,
    // Tooth Fairy, Umbral Basilisk) keep the generic `bird` rig.
    const NAMED = {
        // Shared rigs kept intact but no longer own any split names.
        raptor: [],
        corvid: [],
        waterfowl: [],
        roc: [],
        bat: [],
        // Bespoke per-enemy pins.
        brd_backwardsbird: ["Backwards Bird"],
        brd_bluejay: ["Blue Jay"],
        brd_tinychick: ["Tiny Chick"],
        brd_tundracrow: ["Tundra Crow"],
        brd_ominousravenmurder: ["Ominous Raven Murder"],
        brd_parrot: ["Parrot"],
        brd_spectralsongbird: ["Spectral Songbird"],
        brd_nightwisp: ["Nightwisp"],
        brd_ominousraven: ["Ominous Raven"],
        brd_badasspigeon: ["Badass Pigeon"],
        brd_flamingosentinel: ["Flamingo Sentinel"],
        brd_quackingduck: ["Quacking Duck"],
        brd_giantpenguin: ["Giant Penguin"],
        brd_frozenbat: ["Frozen Bat"],
        brd_vegetalvampire: ["Vegetal Vampire"],
        brd_crimsonsucker: ["Crimson Sucker"],
        brd_eyelessbat: ["Eyeless Bat"],
        brd_blizzardowl: ["Blizzard Owl"],
        brd_giantvulture: ["Giant Vulture"],
        brd_wiseowl: ["Wise Owl"],
        brd_dustdevilbird: ["Dust Devil Bird"],
        brd_mountaineagle: ["Mountain Eagle"],
        brd_peregrinefalcon: ["Peregrine Falcon"],
        brd_rotvulture: ["Rotvulture"],
        brd_baldeagle: ["Bald Eagle"],
        brd_griphon: ["Griphon"],
        brd_majesticgriffon: ["Majestic Griffon"],
        brd_stormharbinger: ["Storm Harbinger"],
        brd_stormroc: ["Storm Roc"],
        brd_thunderwingroc: ["Thunderwing Roc"],
        brd_giantterrorbird: ["Giant Terror Bird"],
        // Level 1-5 starters.
        lv_plazapigeon: ["Plaza Pigeon"],
        lv_housesparrow: ["House Sparrow"],
        lv_farmyardchick: ["Farmyard Chick"],
        lv_harbourgull: ["Harbour Gull"],
        lv_glintmagpie: ["Glint Magpie"],
        lv_youngbarnowl: ["Young Barn Owl"],
        lv_pipistrellebat: ["Pipistrelle Bat"],
        lv_fruitbat: ["Fruit Bat"],
        lv_parkgoose: ["Park Goose"],
        lv_greyheronfledgling: ["Grey Heron Fledgling"],
        lv_snowsparrow: ["Snow Sparrow"],
        lv_penguinchick: ["Penguin Chick"],
        lv_frostbitebat: ["Frostbite Bat"],
        lv_whiteowlet: ["White Owlet"],
        lv_wintercrow: ["Winter Crow"],
        lv_belfrybat: ["Belfry Bat"],
        lv_blesseddove: ["Blessed Dove"],
        lv_pitrooster: ["Pit Rooster"],
        lv_parrotchick: ["Parrot Chick"],
        lv_toucanfledgling: ["Toucan Fledgling"],
        lv_highwayhawkchick: ["Highway Hawk Chick"],
        lv_ferrygull: ["Ferry Gull"],
        lv_canyonswift: ["Canyon Swift"],
    };
    if (window.Battler3D.registerNamed) {
        for (const key in NAMED) NAMED[key].forEach(n => window.Battler3D.registerNamed(n, key));
    }

    debugLog('Birds family registered');
})();
