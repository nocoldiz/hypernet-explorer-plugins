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
        brd_giantterrorbird:{ variant: 'brd_giantterrorbird',family: 'roc', scale: 3.3, posture: 'stand', texturePool: 'pale', bodyColor: 0x6a4a2a, wingColor: 0x4a3218, accent: 0xd94a2a, beak: 'hook', bodyR: 0.5, bodyTall: 1.5, headR: 0.34, wingLen: 0.7, wingZ: 0.08, feathers: 2, legs: 'talons', tail: 0.5, neck: 2, eyeFwd: 1, fierce: 1, flightless: 1, hue: [0.09, 0.05], sat: [0.45, 0.12], lit: [0.32, 0.1] }
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

        animatePose(deltaTime) {
            if (this._baseY === null) this._baseY = this.model.position.y;
            // (sacredphoenix / pyroclastphoenix previously called an unimplemented
            // this._phoenixPose() here, which threw every frame; they now use the
            // standard bird pose below.)
            const t = this.animTime, anim = this.currentAnimation;
            let growth = 1.0;
            if (anim === 'spawn') growth = Math.min(1.0, t / 0.6);
            this.applyModelScale(growth);

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
    };
    if (window.Battler3D.registerNamed) {
        for (const key in NAMED) NAMED[key].forEach(n => window.Battler3D.registerNamed(n, key));
    }

    debugLog('Birds family registered');
})();
