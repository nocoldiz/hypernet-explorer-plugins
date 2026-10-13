//=============================================================================
// 3D Battler System - Beasts Family
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Distinct procedural 3D models for the many "beast" enemies:
 * bear, wolf/canine, big cat, boar, rodent, horned ungulate, ape. Splits the
 * generic four-legged beast rig into recognisable body plans. Requires
 * 3DBattlerSystem + loads AFTER 3DBattler_Quadruped to override its shared
 * `beast` aliases (bear/wolf/cat/boar/rat/bull/ape/... keywords).
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * ============================================================================
 * 3D Battler - Beasts Family
 * ============================================================================
 *
 * Seven hand-shaped animal body plans that take over the keyword tokens that
 * previously all mapped to the single generic `beast` quadruped, so a wolf, a
 * bear, a tiger, a boar, a rat, a stag and an ape no longer share one silhouette.
 *
 *   bear     - bulky ursine, short thick legs, rounded ears (bears, ursids, yeti)
 *   wolf     - lean canine, long snout, hackles, bushy tail (wolves, coyote, fox,
 *              hyena, jackal)
 *   bigcat   - soft round-headed feline: plump barrel body, oversized skull on
 *              a short muzzle, big catchlit eyes, pink inner ears and toe
 *              beans, whiskers, fluffy upright tail (cat, panther, tiger,
 *              lion, lynx, sabertooth, ...)
 *   boar     - low front-heavy suid, shoulder hump, tusks, bristles (boar, pig,
 *              hog, razorback)
 *   rodent   - small upright critter, big incisors, round ears, long tail (rat,
 *              mouse, squirrel, raccoon, mole, beaver, lemming)
 *   ungulate - tall slim-legged grazer with horns or antlers, hooves (stag, deer,
 *              bull, cow, goat, sheep, rhino, camel, bison)
 *   ape      - upright primate, long knuckling arms (ape, monkey, gorilla)
 *
 * Anything not matched by these keywords (badger, skunk, opossum, kangaroo, ...)
 * still falls back to the generic Quadruped `beast` rig.
 *
 * Each reuses the shared base: per-event id colour/shape/texture variation,
 * part-losing dismemberment, hit-flash, and the base action gestures.
 *
 * EVERY feline in the file (bigcat, the lynxes, the saber-cats and all twelve
 * bespoke bst_* cats) is built by _felineBase, so the whole species reads as
 * one thing. Its options are sizeBody, slim (<1 = gaunt), mane/maneMat, fangs,
 * ear ('tuft'|'round'), eyeGlow, legLen, tail ('bob'), ribs and scar. It also
 * publishes _catEars / _catEyes (twitched and blinked in animatePose) and
 * _catDrop, the crouch a short-legged cat takes; a bespoke builder adding its
 * own trimmings at absolute heights must subtract _catDrop from them.
 *
 * MUST load AFTER BattleSystem/3DBattlerSystem AND 3DBattler_Quadruped.
 */

(() => {
    'use strict';

    if (typeof THREE === 'undefined') return;
    if (!window.Battler3D || !window.Battler3D.Base) {
        console.error('[3D Battler Beasts] Core (3DBattlerSystem) not loaded first.');
        return;
    }

    const Base = window.Battler3D.Base;
    const debugLog = window.Battler3D.debugLog || function () {};
    // Painted coat sheets of the starter critters, one per pattern, shared.
    const LV_SHEETS = new Map();

    // variant + which models face the camera (front) vs the angled 3/4 view,
    // plus per-id HSL colour ranges and a themed texture pool.
    const B_PROFILES = {
        bear:     { variant: 'bear',     front: false, scale: 2.9, texturePool: 'fur',   bodyColor: 0x6b4a2e, accent: 0x2a1810, hue: [0.07, 0.04], sat: [0.45, 0.15], lit: [0.30, 0.10] },
        wolf:     { variant: 'wolf',     front: false, scale: 2.5, texturePool: 'fur',   bodyColor: 0x7c7d82, accent: 0xffcc44, hue: [0.62, 0.10], sat: [0.10, 0.10], lit: [0.42, 0.14] },
        bigcat:   { variant: 'bigcat',   front: false, scale: 2.5, texturePool: 'fur',   bodyColor: 0xc8a24a, accent: 0x9be000, hue: [0.10, 0.05], sat: [0.50, 0.15], lit: [0.48, 0.10] },
        boar:     { variant: 'boar',     front: false, scale: 2.5, texturePool: 'fur',   bodyColor: 0x4a3b30, accent: 0x140d0a, hue: [0.07, 0.04], sat: [0.35, 0.12], lit: [0.26, 0.08] },
        rodent:   { variant: 'rodent',   front: false, scale: 1.9, texturePool: 'fur',   bodyColor: 0x8a7256, accent: 0x1a1410, hue: [0.08, 0.06], sat: [0.28, 0.14], lit: [0.40, 0.14] },
        // ── Rodent one-offs: each former generic `rodent` name gets a bespoke body ──
        armoredbeaver:       { variant: 'armoredbeaver',       front: false, scale: 2.2,  texturePool: 'fur', bodyColor: 0x6b5640, accent: 0xc4c9d2, hue: [0.08, 0.04], sat: [0.30, 0.10], lit: [0.36, 0.10] },
        wastelandbeaver:     { variant: 'wastelandbeaver',     front: false, scale: 2.1,  texturePool: 'fur', bodyColor: 0x5a4d3a, accent: 0x8a8270, hue: [0.09, 0.05], sat: [0.22, 0.10], lit: [0.34, 0.10] },
        armoredporcupine:    { variant: 'armoredporcupine',    front: false, scale: 2.2,  texturePool: 'fur', bodyColor: 0x3a3530, accent: 0xbfc6cc, hue: [0.08, 0.04], sat: [0.10, 0.08], lit: [0.26, 0.08] },
        spikeyporcupine:     { variant: 'spikeyporcupine',     front: false, scale: 2.0,  texturePool: 'fur', bodyColor: 0x5a4632, accent: 0x241a12, hue: [0.08, 0.05], sat: [0.32, 0.12], lit: [0.32, 0.10] },
        caffeinatedsquirrel: { variant: 'caffeinatedsquirrel', front: false, scale: 1.9,  texturePool: 'fur', bodyColor: 0x8a5a32, accent: 0x3a2410, hue: [0.07, 0.04], sat: [0.45, 0.12], lit: [0.40, 0.10] },
        woodsquirrel:        { variant: 'woodsquirrel',        front: false, scale: 1.85, texturePool: 'fur', bodyColor: 0x9a6336, accent: 0x3a2410, hue: [0.07, 0.04], sat: [0.45, 0.12], lit: [0.42, 0.10] },
        fieldmouse:          { variant: 'fieldmouse',          front: false, scale: 1.6,  texturePool: 'fur', bodyColor: 0x9a8868, accent: 0xffb0a0, hue: [0.09, 0.05], sat: [0.24, 0.10], lit: [0.50, 0.12] },
        forestrat:           { variant: 'forestrat',           front: false, scale: 1.85, texturePool: 'fur', bodyColor: 0x6a5a3e, accent: 0x2a1f14, hue: [0.09, 0.05], sat: [0.32, 0.12], lit: [0.36, 0.10] },
        giantrat:            { variant: 'giantrat',            front: false, scale: 2.2,  texturePool: 'fur', bodyColor: 0x7a6a52, accent: 0x1a1410, hue: [0.08, 0.05], sat: [0.28, 0.12], lit: [0.40, 0.12] },
        sewerrat:            { variant: 'sewerrat',            front: false, scale: 1.9,  texturePool: 'fur', bodyColor: 0x55503e, accent: 0x2a2a1a, hue: [0.12, 0.06], sat: [0.20, 0.10], lit: [0.32, 0.10] },
        swamprat:            { variant: 'swamprat',            front: false, scale: 2.05, texturePool: 'fur', bodyColor: 0x4e5538, accent: 0x88aa44, hue: [0.22, 0.08], sat: [0.30, 0.12], lit: [0.32, 0.10] },
        plaguerattus:        { variant: 'plaguerattus',        front: false, scale: 2.6,  texturePool: 'fur', bodyColor: 0x6a6248, accent: 0x9bd34a, hue: [0.18, 0.08], sat: [0.30, 0.12], lit: [0.38, 0.10] },
        ratking:             { variant: 'ratking',             front: false, scale: 2.7,  texturePool: 'fur', bodyColor: 0x5a4e3a, accent: 0xb8932e, hue: [0.09, 0.05], sat: [0.30, 0.12], lit: [0.34, 0.10] },
        frostraccoon:        { variant: 'frostraccoon',        front: false, scale: 2.0,  texturePool: 'fur', bodyColor: 0x9aa6b4, accent: 0xaaf0ff, hue: [0.56, 0.08], sat: [0.16, 0.10], lit: [0.56, 0.10] },
        nightraccoon:        { variant: 'nightraccoon',        front: false, scale: 2.0,  texturePool: 'fur', bodyColor: 0x4a4a52, accent: 0xf0f0f0, hue: [0.62, 0.06], sat: [0.10, 0.08], lit: [0.34, 0.10] },
        molerodent:          { variant: 'molerodent',          front: false, scale: 1.8,  texturePool: 'fur', bodyColor: 0x3a3330, accent: 0xff9a9a, hue: [0.06, 0.04], sat: [0.12, 0.08], lit: [0.24, 0.08] },
        tunnelingmole:       { variant: 'tunnelingmole',       front: false, scale: 2.3,  texturePool: 'fur', bodyColor: 0x423a32, accent: 0xffaa99, hue: [0.07, 0.04], sat: [0.16, 0.08], lit: [0.26, 0.08] },
        icelemming:          { variant: 'icelemming',          front: false, scale: 1.7,  texturePool: 'fur', bodyColor: 0xcfe0ec, accent: 0x66ccff, hue: [0.56, 0.06], sat: [0.20, 0.10], lit: [0.72, 0.10] },
        ungulate: { variant: 'ungulate', front: false, scale: 2.9, texturePool: 'fur',   bodyColor: 0x8a6b45, accent: 0x141414, hue: [0.08, 0.05], sat: [0.40, 0.15], lit: [0.36, 0.12] },
        ape:      { variant: 'ape',      front: true,  scale: 2.7, texturePool: 'fur',   bodyColor: 0x36302c, accent: 0xb89878, hue: [0.07, 0.05], sat: [0.18, 0.10], lit: [0.24, 0.10] },
        chromaticmanticore: { variant: 'chromaticmanticore', front: false, scale: 2.8, texturePool: 'fur', bodyColor: 0x9a3b2e, accent: 0xff4488, hue: [0.95, 0.30], sat: [0.70, 0.20], lit: [0.50, 0.10] },
        chupacabra:  { variant: 'chupacabra',  front: false, scale: 2.3, texturePool: 'fur', bodyColor: 0x4a4640, accent: 0x88ff44, hue: [0.30, 0.10], sat: [0.20, 0.12], lit: [0.28, 0.08] },
        giantsnail:  { variant: 'giantsnail',  front: false, scale: 3.0, texturePool: 'fur', bodyColor: 0x7a8a5a, accent: 0xaad36a, hue: [0.25, 0.08], sat: [0.35, 0.12], lit: [0.42, 0.10] },
        infernalcerberus: { variant: 'infernalcerberus', front: false, scale: 2.7, texturePool: 'fur', bodyColor: 0x201a18, accent: 0xff5510, hue: [0.04, 0.03], sat: [0.55, 0.15], lit: [0.18, 0.06] },
        junglepredator: { variant: 'junglepredator', front: false, scale: 2.6, texturePool: 'fur', bodyColor: 0x2f5a2a, accent: 0xff44aa, hue: [0.32, 0.08], sat: [0.55, 0.15], lit: [0.34, 0.10] },
        mianni:      { variant: 'mianni',      front: true,  scale: 2.4, texturePool: 'fur', bodyColor: 0xff5599, accent: 0x44ddff, hue: [0.0, 1.0], sat: [0.85, 0.10], lit: [0.55, 0.10] },
        palettephantom:  { variant: 'palettephantom',  front: false, scale: 2.4, texturePool: 'fur', bodyColor: 0x8855cc, accent: 0xff66dd, hue: [0.0, 1.0], sat: [0.70, 0.15], lit: [0.55, 0.10] },
        radiantunicorn:  { variant: 'radiantunicorn',  front: false, scale: 2.8, texturePool: 'fur', bodyColor: 0xf2eee0, accent: 0xffe680, hue: [0.13, 0.05], sat: [0.30, 0.10], lit: [0.78, 0.08] },
        rhinobeetle:     { variant: 'rhinobeetle',     front: false, scale: 2.3, texturePool: 'fur', bodyColor: 0x2a2018, accent: 0x6a4a28, hue: [0.08, 0.03], sat: [0.40, 0.12], lit: [0.16, 0.06] },
        rummagingopossum:{ variant: 'rummagingopossum',front: false, scale: 2.0, texturePool: 'fur', bodyColor: 0x9a958c, accent: 0xffc0b0, hue: [0.08, 0.04], sat: [0.12, 0.08], lit: [0.55, 0.12] },
        beast666:        { variant: 'beast666',        front: false, scale: 3.0, texturePool: 'fur', bodyColor: 0x6a0e0e, accent: 0xff6600, hue: [0.0, 0.04], sat: [0.65, 0.15], lit: [0.28, 0.08] },
        tempestpegasus:  { variant: 'tempestpegasus',  front: false, scale: 2.8, texturePool: 'fur', bodyColor: 0xb8c4d0, accent: 0x66ccff, hue: [0.58, 0.08], sat: [0.18, 0.10], lit: [0.70, 0.10] },
        velocicorn:      { variant: 'velocicorn',      front: false, scale: 2.6, texturePool: 'fur', bodyColor: 0x3a4a6a, accent: 0xffee44, hue: [0.62, 0.06], sat: [0.40, 0.12], lit: [0.34, 0.10] },
        swampleviathan:  { variant: 'swampleviathan',  front: false, scale: 3.4, texturePool: 'fur', bodyColor: 0x3a4a30, accent: 0x6a8a3a, hue: [0.28, 0.06], sat: [0.40, 0.12], lit: [0.24, 0.08] },
        invertedhunger:  { variant: 'invertedhunger',  front: true,  scale: 2.6, texturePool: 'fur', bodyColor: 0x8a2a3a, accent: 0xff5566, hue: [0.97, 0.04], sat: [0.55, 0.15], lit: [0.34, 0.10] },
        voidhowler:      { variant: 'voidhowler',      front: false, scale: 2.9, texturePool: 'fur', bodyColor: 0x16121f, accent: 0x9944ff, hue: [0.74, 0.08], sat: [0.55, 0.15], lit: [0.12, 0.06] },
        feastoffamine:   { variant: 'feastoffamine',   front: true,  scale: 3.0, texturePool: 'fur', bodyColor: 0x6a3a28, accent: 0xff8866, hue: [0.06, 0.04], sat: [0.35, 0.12], lit: [0.30, 0.10] },
        maternityward:   { variant: 'maternityward',   front: true,  scale: 2.8, texturePool: 'fur', bodyColor: 0xc89a8a, accent: 0xff99aa, hue: [0.02, 0.04], sat: [0.30, 0.10], lit: [0.55, 0.10] },
        starvingsabercat:{ variant: 'starvingsabercat',front: false, scale: 2.6, texturePool: 'fur', bodyColor: 0x9a8a5a, accent: 0xffd24a, hue: [0.11, 0.05], sat: [0.35, 0.12], lit: [0.40, 0.10] },
        ashenprowler:    { variant: 'ashenprowler',    front: false, scale: 2.5, texturePool: 'fur', bodyColor: 0x6a6a66, accent: 0xff5544, hue: [0.0, 0.05], sat: [0.06, 0.06], lit: [0.40, 0.12] },
        gauntsnapper:    { variant: 'gauntsnapper',    front: false, scale: 2.5, texturePool: 'fur', bodyColor: 0x4a463e, accent: 0x88ff66, hue: [0.10, 0.06], sat: [0.18, 0.10], lit: [0.26, 0.08] },
        holloweyedboar:  { variant: 'holloweyedboar',  front: false, scale: 2.5, texturePool: 'fur', bodyColor: 0x3a2e26, accent: 0x66ff88, hue: [0.07, 0.04], sat: [0.30, 0.12], lit: [0.22, 0.08] },
        ferallynx:       { variant: 'ferallynx',       front: false, scale: 2.3, texturePool: 'fur', bodyColor: 0xb09060, accent: 0xff4444, hue: [0.09, 0.05], sat: [0.32, 0.12], lit: [0.46, 0.10] },
        diregnasher:     { variant: 'diregnasher',     front: false, scale: 2.6, texturePool: 'fur', bodyColor: 0x5a4a3e, accent: 0xffcc44, hue: [0.08, 0.05], sat: [0.20, 0.10], lit: [0.32, 0.10] },
        gauntclawrunner: { variant: 'gauntclawrunner', front: false, scale: 2.5, texturePool: 'fur', bodyColor: 0x46566e, accent: 0x88ccff, hue: [0.60, 0.06], sat: [0.30, 0.12], lit: [0.34, 0.10] },
        bloodmawdirewolf:{ variant: 'bloodmawdirewolf',front: false, scale: 2.8, texturePool: 'fur', bodyColor: 0x6a6258, accent: 0xcc1818, hue: [0.07, 0.05], sat: [0.14, 0.10], lit: [0.36, 0.12] },
        gauntlynx:       { variant: 'gauntlynx',       front: false, scale: 2.3, texturePool: 'fur', bodyColor: 0xa89058, accent: 0xffd24a, hue: [0.10, 0.05], sat: [0.30, 0.12], lit: [0.42, 0.10] },
        feralbadger:     { variant: 'feralbadger',     front: false, scale: 2.2, texturePool: 'fur', bodyColor: 0x4a463e, accent: 0xf0ece0, hue: [0.10, 0.04], sat: [0.14, 0.08], lit: [0.28, 0.08] },
        starvinggnasher: { variant: 'starvinggnasher', front: false, scale: 2.6, texturePool: 'fur', bodyColor: 0x5a4e40, accent: 0xffaa44, hue: [0.08, 0.05], sat: [0.22, 0.10], lit: [0.30, 0.10] },
        feralridgeback:  { variant: 'feralridgeback',  front: false, scale: 2.5, texturePool: 'fur', bodyColor: 0x4e423a, accent: 0xff6644, hue: [0.07, 0.04], sat: [0.24, 0.10], lit: [0.30, 0.10] },
        bf_packboar: { variant: 'boar', scale: 2.5, texturePool: 'fur', bodyColor: 0x6a5a3e, accent: 0x2a1f14, hue: [0.08,0.05], sat: [0.3,0.12], lit: [0.4,0.12] },
        bf_packripper: { variant: 'wolf', scale: 2.5, texturePool: 'fur', bodyColor: 0x6a5a3e, accent: 0x2a1f14, hue: [0.08,0.05], sat: [0.3,0.12], lit: [0.4,0.12] },
        bf_stormgnasher: { variant: 'boar', scale: 2.5, texturePool: 'fur', bodyColor: 0x46566e, accent: 0x88ccff, hue: [0.08,0.05], sat: [0.3,0.12], lit: [0.4,0.12] },
        bf_lonejackal: { variant: 'wolf', scale: 2.4, texturePool: 'fur', bodyColor: 0x6a6660, accent: 0xffcc44, hue: [0.08,0.05], sat: [0.3,0.12], lit: [0.4,0.12] },
        bf_rabidlynx: { variant: 'bigcat', scale: 2.3, texturePool: 'fur', bodyColor: 0x7a6a52, accent: 0xff4444, hue: [0.08,0.05], sat: [0.3,0.12], lit: [0.4,0.12] },
        bf_threetailedlynx: { variant: 'bigcat', scale: 2.3, texturePool: 'fur', bodyColor: 0x6a5a4a, accent: 0xff8844, hue: [0.08,0.05], sat: [0.3,0.12], lit: [0.4,0.12] },
        bf_rabidbadger: { variant: 'boar', scale: 2.2, texturePool: 'fur', bodyColor: 0x7a6a52, accent: 0xff4444, hue: [0.08,0.05], sat: [0.3,0.12], lit: [0.4,0.12] },
        bf_mangyridgeback: { variant: 'boar', scale: 2.5, texturePool: 'fur', bodyColor: 0x6a5a44, accent: 0x8a6a3a, hue: [0.08,0.05], sat: [0.3,0.12], lit: [0.4,0.12] },
        bf_mudcakedgnasher: { variant: 'boar', scale: 2.5, texturePool: 'fur', bodyColor: 0x4a4636, accent: 0x6a7a3a, hue: [0.08,0.05], sat: [0.3,0.12], lit: [0.4,0.12] },
        bf_mudcakedprowler: { variant: 'wolf', scale: 2.5, texturePool: 'fur', bodyColor: 0x4a4636, accent: 0x6a7a3a, hue: [0.08,0.05], sat: [0.3,0.12], lit: [0.4,0.12] },
        bf_threetailedhornbeast: { variant: 'boar', scale: 2.6, texturePool: 'fur', bodyColor: 0x6a5a4a, accent: 0xff8844, hue: [0.08,0.05], sat: [0.3,0.12], lit: [0.4,0.12] },
        bf_feralprowler: { variant: 'wolf', scale: 2.5, texturePool: 'fur', bodyColor: 0x6a5a44, accent: 0xffcc44, hue: [0.08,0.05], sat: [0.3,0.12], lit: [0.4,0.12] },
        bf_frosthornbeast: { variant: 'boar', scale: 2.6, texturePool: 'fur', bodyColor: 0x9ac0d8, accent: 0xaaf0ff, hue: [0.08,0.05], sat: [0.3,0.12], lit: [0.4,0.12] },
        bf_ironfangeddirewolf: { variant: 'wolf', scale: 2.7, texturePool: 'fur', bodyColor: 0x4a423a, accent: 0xffcc44, hue: [0.08,0.05], sat: [0.3,0.12], lit: [0.4,0.12] },
        bf_mangyhowler: { variant: 'wolf', scale: 2.6, texturePool: 'fur', bodyColor: 0x6a5a44, accent: 0x8a6a3a, hue: [0.08,0.05], sat: [0.3,0.12], lit: [0.4,0.12] },
        bf_ashendirewolf: { variant: 'wolf', scale: 2.7, texturePool: 'fur', bodyColor: 0x4a423a, accent: 0xffcc44, hue: [0.08,0.05], sat: [0.3,0.12], lit: [0.4,0.12] },
        bf_ironfangedmawhound: { variant: 'wolf', scale: 2.6, texturePool: 'fur', bodyColor: 0x6a6e74, accent: 0xff4422, hue: [0.08,0.05], sat: [0.3,0.12], lit: [0.4,0.12] },
        bf_packridgeback: { variant: 'boar', scale: 2.5, texturePool: 'fur', bodyColor: 0x6a5a3e, accent: 0x2a1f14, hue: [0.08,0.05], sat: [0.3,0.12], lit: [0.4,0.12] },
        bf_cinderthornhide: { variant: 'boar', scale: 2.5, texturePool: 'fur', bodyColor: 0x3a3330, accent: 0xff6633, hue: [0.08,0.05], sat: [0.3,0.12], lit: [0.4,0.12] },
        bf_packclawrunner: { variant: 'wolf', scale: 2.5, texturePool: 'fur', bodyColor: 0x6a5a3e, accent: 0x2a1f14, hue: [0.08,0.05], sat: [0.3,0.12], lit: [0.4,0.12] },
        bf_packhornbeast: { variant: 'boar', scale: 2.6, texturePool: 'fur', bodyColor: 0x6a5a3e, accent: 0x2a1f14, hue: [0.08,0.05], sat: [0.3,0.12], lit: [0.4,0.12] },
        bf_gauntripper: { variant: 'wolf', scale: 2.5, texturePool: 'fur', bodyColor: 0x8a8270, accent: 0xffcc44, hue: [0.08,0.05], sat: [0.3,0.12], lit: [0.4,0.12] },
        bf_bloodmawmawhound: { variant: 'wolf', scale: 2.6, texturePool: 'fur', bodyColor: 0x5a4a42, accent: 0xcc1818, hue: [0.08,0.05], sat: [0.3,0.12], lit: [0.4,0.12] },
        bf_threetailedboar: { variant: 'boar', scale: 2.5, texturePool: 'fur', bodyColor: 0x6a5a4a, accent: 0xff8844, hue: [0.08,0.05], sat: [0.3,0.12], lit: [0.4,0.12] },
        bf_mudcakedripper: { variant: 'wolf', scale: 2.5, texturePool: 'fur', bodyColor: 0x4a4636, accent: 0x6a7a3a, hue: [0.08,0.05], sat: [0.3,0.12], lit: [0.4,0.12] },
        bf_cinderdirewolf: { variant: 'wolf', scale: 2.7, texturePool: 'fur', bodyColor: 0x3a3330, accent: 0xff6633, hue: [0.08,0.05], sat: [0.3,0.12], lit: [0.4,0.12] },
        bf_direclawrunner: { variant: 'wolf', scale: 2.5, texturePool: 'fur', bodyColor: 0x4a423a, accent: 0xffcc44, hue: [0.08,0.05], sat: [0.3,0.12], lit: [0.4,0.12] },
        bf_packjackal: { variant: 'wolf', scale: 2.4, texturePool: 'fur', bodyColor: 0x6a5a3e, accent: 0x2a1f14, hue: [0.08,0.05], sat: [0.3,0.12], lit: [0.4,0.12] },
        bf_stormhowler: { variant: 'wolf', scale: 2.6, texturePool: 'fur', bodyColor: 0x46566e, accent: 0x88ccff, hue: [0.08,0.05], sat: [0.3,0.12], lit: [0.4,0.12] },
        bf_starvingclawrunner: { variant: 'wolf', scale: 2.5, texturePool: 'fur', bodyColor: 0x9a8a5a, accent: 0xffd24a, hue: [0.08,0.05], sat: [0.3,0.12], lit: [0.4,0.12] },
        bf_scarredclawrunner: { variant: 'wolf', scale: 2.5, texturePool: 'fur', bodyColor: 0x6a6258, accent: 0xff6644, hue: [0.08,0.05], sat: [0.3,0.12], lit: [0.4,0.12] },
        bf_mangystalkhound: { variant: 'wolf', scale: 2.5, texturePool: 'fur', bodyColor: 0x6a5a44, accent: 0x8a6a3a, hue: [0.08,0.05], sat: [0.3,0.12], lit: [0.4,0.12] },
        bf_mudcakedclawrunner: { variant: 'wolf', scale: 2.5, texturePool: 'fur', bodyColor: 0x4a4636, accent: 0x6a7a3a, hue: [0.08,0.05], sat: [0.3,0.12], lit: [0.4,0.12] },
        bf_scarredbristleback: { variant: 'boar', scale: 2.5, texturePool: 'fur', bodyColor: 0x6a6258, accent: 0xff6644, hue: [0.08,0.05], sat: [0.3,0.12], lit: [0.4,0.12] },
        bf_packlynx: { variant: 'bigcat', scale: 2.3, texturePool: 'fur', bodyColor: 0x6a5a3e, accent: 0x2a1f14, hue: [0.08,0.05], sat: [0.3,0.12], lit: [0.4,0.12] },
        bf_holloweyedsnapper: { variant: 'boar', scale: 2.5, texturePool: 'fur', bodyColor: 0x5a5248, accent: 0x66ff88, hue: [0.08,0.05], sat: [0.3,0.12], lit: [0.4,0.12] },
        bf_ironfangedhornbeast: { variant: 'boar', scale: 2.6, texturePool: 'fur', bodyColor: 0x6a6e74, accent: 0xff4422, hue: [0.08,0.05], sat: [0.3,0.12], lit: [0.4,0.12] },
        bf_holloweyedbristleback: { variant: 'boar', scale: 2.5, texturePool: 'fur', bodyColor: 0x5a5248, accent: 0x66ff88, hue: [0.08,0.05], sat: [0.3,0.12], lit: [0.4,0.12] },
        // ── Bespoke split: wolf group (canids) ──────────────────────────────
        bst_arcticfox:          { variant: 'bst_arcticfox',          front: false, scale: 2.0, texturePool: 'fur', bodyColor: 0xeef2f6, accent: 0x9fe8ff, hue: [0.55, 0.06], sat: [0.10, 0.08], lit: [0.82, 0.08] },
        bst_cottonfox:          { variant: 'bst_cottonfox',          front: false, scale: 2.0, texturePool: 'fur', bodyColor: 0xf4ecdc, accent: 0xffb0d0, hue: [0.02, 0.06], sat: [0.14, 0.08], lit: [0.80, 0.08] },
        bst_icewolfpup:         { variant: 'bst_icewolfpup',         front: false, scale: 1.9, texturePool: 'fur', bodyColor: 0xbcd0e0, accent: 0x88ddff, hue: [0.55, 0.06], sat: [0.18, 0.10], lit: [0.66, 0.10] },
        bst_rabidhyena:         { variant: 'bst_rabidhyena',         front: false, scale: 2.4, texturePool: 'fur', bodyColor: 0x8a7a58, accent: 0xffe14a, hue: [0.11, 0.05], sat: [0.30, 0.12], lit: [0.42, 0.10] },
        bst_feralhyenapack:     { variant: 'bst_feralhyenapack',     front: false, scale: 2.4, texturePool: 'fur', bodyColor: 0x7a6a4a, accent: 0xffcc44, hue: [0.10, 0.05], sat: [0.30, 0.12], lit: [0.38, 0.10] },
        bst_graywolf:           { variant: 'bst_graywolf',           front: false, scale: 2.5, texturePool: 'fur', bodyColor: 0x7c7d82, accent: 0xffcc44, hue: [0.62, 0.10], sat: [0.10, 0.10], lit: [0.42, 0.14] },
        bst_manedterrorwolf:    { variant: 'bst_manedterrorwolf',    front: false, scale: 2.6, texturePool: 'fur', bodyColor: 0x5a544e, accent: 0xff5544, hue: [0.06, 0.05], sat: [0.14, 0.10], lit: [0.34, 0.10] },
        bst_redfox:             { variant: 'bst_redfox',             front: false, scale: 2.0, texturePool: 'fur', bodyColor: 0xc85a24, accent: 0x2a1408, hue: [0.05, 0.03], sat: [0.60, 0.12], lit: [0.46, 0.10] },
        bst_alphadirewolf:      { variant: 'bst_alphadirewolf',      front: false, scale: 2.9, texturePool: 'fur', bodyColor: 0xcfd8e0, accent: 0x88ddff, hue: [0.56, 0.06], sat: [0.12, 0.08], lit: [0.72, 0.08] },
        bst_alphawarg:          { variant: 'bst_alphawarg',          front: false, scale: 2.8, texturePool: 'fur', bodyColor: 0x4e453c, accent: 0xffaa44, hue: [0.07, 0.05], sat: [0.24, 0.10], lit: [0.30, 0.10] },
        bst_arcticwolf:         { variant: 'bst_arcticwolf',         front: false, scale: 2.6, texturePool: 'fur', bodyColor: 0xe4eaf0, accent: 0xbfe8ff, hue: [0.56, 0.06], sat: [0.10, 0.08], lit: [0.78, 0.08] },
        bst_rabidcoyote:        { variant: 'bst_rabidcoyote',        front: false, scale: 2.3, texturePool: 'fur', bodyColor: 0x9a8460, accent: 0xff5544, hue: [0.10, 0.05], sat: [0.34, 0.12], lit: [0.46, 0.10] },
        bst_scavengingcoyote:   { variant: 'bst_scavengingcoyote',   front: false, scale: 2.3, texturePool: 'fur', bodyColor: 0x8a7654, accent: 0xffcc44, hue: [0.10, 0.05], sat: [0.30, 0.12], lit: [0.42, 0.10] },
        // ── Bespoke split: bigcat group (felines) ───────────────────────────
        bst_lazycat:            { variant: 'bst_lazycat',            front: false, scale: 1.9, texturePool: 'fur', bodyColor: 0x2a2a30, accent: 0x66ff88, hue: [0.62, 0.06], sat: [0.10, 0.08], lit: [0.20, 0.08] },
        bst_blackpanther:       { variant: 'bst_blackpanther',       front: false, scale: 2.5, texturePool: 'fur', bodyColor: 0x161418, accent: 0x66ddff, hue: [0.68, 0.06], sat: [0.20, 0.10], lit: [0.12, 0.06] },
        bst_reflectivetiger:    { variant: 'bst_reflectivetiger',    front: false, scale: 2.5, texturePool: 'fur', bodyColor: 0xd4e0ec, accent: 0x2a3038, hue: [0.55, 0.06], sat: [0.12, 0.08], lit: [0.78, 0.08] },
        bst_sabercat:           { variant: 'bst_sabercat',           front: false, scale: 2.6, texturePool: 'fur', bodyColor: 0xc8a24a, accent: 0xfff0d0, hue: [0.10, 0.05], sat: [0.48, 0.14], lit: [0.48, 0.10] },
        bst_wildcat:            { variant: 'bst_wildcat',            front: false, scale: 2.1, texturePool: 'fur', bodyColor: 0x9a7a44, accent: 0xffe14a, hue: [0.10, 0.05], sat: [0.44, 0.14], lit: [0.44, 0.10] },
        bst_feralalleycat:      { variant: 'bst_feralalleycat',      front: false, scale: 1.9, texturePool: 'fur', bodyColor: 0x6a6058, accent: 0xffdd33, hue: [0.09, 0.06], sat: [0.14, 0.10], lit: [0.34, 0.12] },
        bst_goldenlion:         { variant: 'bst_goldenlion',         front: false, scale: 2.7, texturePool: 'fur', bodyColor: 0xd0a850, accent: 0x6a3a10, hue: [0.11, 0.04], sat: [0.50, 0.12], lit: [0.52, 0.08] },
        bst_stripedtiger:       { variant: 'bst_stripedtiger',       front: false, scale: 2.6, texturePool: 'fur', bodyColor: 0xd88a30, accent: 0x1a1008, hue: [0.07, 0.03], sat: [0.60, 0.12], lit: [0.48, 0.08] },
        bst_umbrapanthera:      { variant: 'bst_umbrapanthera',      front: false, scale: 2.5, texturePool: 'fur', bodyColor: 0x14121c, accent: 0x9944ff, hue: [0.74, 0.06], sat: [0.35, 0.12], lit: [0.12, 0.06] },
        bst_mysticpanther:      { variant: 'bst_mysticpanther',      front: false, scale: 2.5, texturePool: 'fur', bodyColor: 0x201c28, accent: 0x44ddcc, hue: [0.48, 0.08], sat: [0.28, 0.12], lit: [0.16, 0.06] },
        bst_sabertoothalpha:    { variant: 'bst_sabertoothalpha',    front: false, scale: 2.8, texturePool: 'fur', bodyColor: 0xb89a58, accent: 0xfff4dc, hue: [0.10, 0.05], sat: [0.40, 0.12], lit: [0.46, 0.10] },
        bst_diresabertoothalpha:{ variant: 'bst_diresabertoothalpha',front: false, scale: 3.0, texturePool: 'fur', bodyColor: 0xa8b0bc, accent: 0xbfe8ff, hue: [0.56, 0.06], sat: [0.16, 0.10], lit: [0.60, 0.08] },
        // ── Bespoke split: ungulate group ───────────────────────────────────
        bst_thirstycamel:       { variant: 'bst_thirstycamel',       front: false, scale: 2.9, texturePool: 'fur', bodyColor: 0xc8a468, accent: 0x4a3418, hue: [0.10, 0.04], sat: [0.40, 0.12], lit: [0.54, 0.08] },
        bst_foreststag:         { variant: 'bst_foreststag',         front: false, scale: 2.9, texturePool: 'fur', bodyColor: 0x8a5f38, accent: 0xe8dcc0, hue: [0.07, 0.04], sat: [0.42, 0.12], lit: [0.38, 0.10] },
        bst_pastoralsheep:      { variant: 'bst_pastoralsheep',      front: false, scale: 2.4, texturePool: 'fur', bodyColor: 0xf0ece0, accent: 0x2a2420, hue: [0.10, 0.04], sat: [0.10, 0.06], lit: [0.82, 0.06] },
        bst_armoredrhinoceros:  { variant: 'bst_armoredrhinoceros',  front: false, scale: 3.1, texturePool: 'fur', bodyColor: 0x6a6a64, accent: 0xe8dcc0, hue: [0.10, 0.04], sat: [0.08, 0.06], lit: [0.40, 0.08] },
        bst_bloodbellcow:       { variant: 'bst_bloodbellcow',       front: false, scale: 2.8, texturePool: 'fur', bodyColor: 0x8a2a2a, accent: 0xd8b23a, hue: [0.98, 0.04], sat: [0.45, 0.14], lit: [0.34, 0.10] },
        bst_deersprite:         { variant: 'bst_deersprite',         front: false, scale: 2.6, texturePool: 'fur', bodyColor: 0xc84a1a, accent: 0xffaa22, hue: [0.05, 0.04], sat: [0.60, 0.14], lit: [0.44, 0.10] },
        bst_hollowgoat:         { variant: 'bst_hollowgoat',         front: false, scale: 2.6, texturePool: 'fur', bodyColor: 0x7a7268, accent: 0x3a5a3a, hue: [0.28, 0.06], sat: [0.16, 0.10], lit: [0.42, 0.10] },
        bst_ironhoofcharger:    { variant: 'bst_ironhoofcharger',    front: false, scale: 2.9, texturePool: 'fur', bodyColor: 0x4a4640, accent: 0xc4c9d2, hue: [0.08, 0.04], sat: [0.10, 0.08], lit: [0.28, 0.08] },
        bst_rancorousbull:      { variant: 'bst_rancorousbull',      front: false, scale: 2.9, texturePool: 'fur', bodyColor: 0x3a2e26, accent: 0xe8dcc0, hue: [0.07, 0.04], sat: [0.35, 0.12], lit: [0.24, 0.08] },
        bst_titanotherealpha:   { variant: 'bst_titanotherealpha',   front: false, scale: 3.4, texturePool: 'fur', bodyColor: 0x6a5a4a, accent: 0xaaccdd, hue: [0.55, 0.06], sat: [0.22, 0.10], lit: [0.34, 0.10] },
        // ── Bespoke split: bear group (ursids) ──────────────────────────────
        bst_brownbear:          { variant: 'bst_brownbear',          front: false, scale: 2.9, texturePool: 'fur', bodyColor: 0x6b4a2e, accent: 0x2a1810, hue: [0.07, 0.04], sat: [0.45, 0.15], lit: [0.30, 0.10] },
        bst_hornedbear:         { variant: 'bst_hornedbear',         front: false, scale: 3.0, texturePool: 'fur', bodyColor: 0x4a3a30, accent: 0xe8dcc0, hue: [0.07, 0.04], sat: [0.38, 0.12], lit: [0.26, 0.08] },
        bst_youngyeti:          { variant: 'bst_youngyeti',          front: false, scale: 2.8, texturePool: 'fur', bodyColor: 0xe4eaf0, accent: 0x88ddff, hue: [0.56, 0.06], sat: [0.12, 0.08], lit: [0.80, 0.06] },
        bst_frostbackursid:     { variant: 'bst_frostbackursid',     front: false, scale: 3.0, texturePool: 'fur', bodyColor: 0x9ab4c8, accent: 0xbfe8ff, hue: [0.55, 0.06], sat: [0.20, 0.10], lit: [0.58, 0.10] },
        bst_panda:              { variant: 'bst_panda',              front: false, scale: 2.9, texturePool: 'fur', bodyColor: 0xf0f0f0, accent: 0x141414, hue: [0.10, 0.04], sat: [0.06, 0.04], lit: [0.86, 0.06] },
        bst_polarbear:          { variant: 'bst_polarbear',          front: false, scale: 3.1, texturePool: 'fur', bodyColor: 0xf4f6fa, accent: 0x9fe8ff, hue: [0.56, 0.06], sat: [0.06, 0.06], lit: [0.86, 0.06] },
        bst_timewornowlbear:    { variant: 'bst_timewornowlbear',    front: false, scale: 3.0, texturePool: 'fur', bodyColor: 0x7a6a4e, accent: 0xffcc44, hue: [0.09, 0.05], sat: [0.30, 0.12], lit: [0.40, 0.10] },
        bst_demonbear:          { variant: 'bst_demonbear',          front: false, scale: 3.1, texturePool: 'fur', bodyColor: 0x7a1414, accent: 0xff4422, hue: [0.0, 0.04], sat: [0.60, 0.15], lit: [0.28, 0.08] },
        bst_kodiakbear:         { variant: 'bst_kodiakbear',         front: false, scale: 3.1, texturePool: 'fur', bodyColor: 0x5a3f28, accent: 0x2a1810, hue: [0.07, 0.04], sat: [0.44, 0.14], lit: [0.28, 0.08] },
        bst_emberclawbear:      { variant: 'bst_emberclawbear',      front: false, scale: 2.9, texturePool: 'fur', bodyColor: 0x3a2018, accent: 0xff6610, hue: [0.04, 0.03], sat: [0.55, 0.15], lit: [0.24, 0.08] },
        bst_frostfangbear:      { variant: 'bst_frostfangbear',      front: false, scale: 3.0, texturePool: 'fur', bodyColor: 0xb8d0e0, accent: 0xbfe8ff, hue: [0.55, 0.06], sat: [0.20, 0.10], lit: [0.66, 0.08] },
        bst_thundermawursine:   { variant: 'bst_thundermawursine',   front: false, scale: 3.0, texturePool: 'fur', bodyColor: 0x4a4658, accent: 0xffee44, hue: [0.62, 0.06], sat: [0.24, 0.10], lit: [0.30, 0.10] },
        bst_titaniccavebear:    { variant: 'bst_titaniccavebear',    front: false, scale: 3.4, texturePool: 'fur', bodyColor: 0x5a4636, accent: 0x2a1810, hue: [0.08, 0.04], sat: [0.40, 0.12], lit: [0.26, 0.08] },
        // ── Bespoke split: boar group (suids) ───────────────────────────────
        bst_direpig:            { variant: 'bst_direpig',            front: false, scale: 2.6, texturePool: 'fur', bodyColor: 0x5a4636, accent: 0xfff4d0, hue: [0.07, 0.04], sat: [0.36, 0.12], lit: [0.30, 0.10] },
        bst_flyingpig:          { variant: 'bst_flyingpig',          front: false, scale: 2.4, texturePool: 'fur', bodyColor: 0xe8a0a8, accent: 0xffffff, hue: [0.97, 0.04], sat: [0.32, 0.10], lit: [0.66, 0.08] },
        bst_razorbackboar:      { variant: 'bst_razorbackboar',      front: false, scale: 2.7, texturePool: 'fur', bodyColor: 0x3a2e24, accent: 0xc4c9d2, hue: [0.07, 0.04], sat: [0.35, 0.12], lit: [0.24, 0.08] },
        bst_wildboar:           { variant: 'bst_wildboar',           front: false, scale: 2.5, texturePool: 'fur', bodyColor: 0x4a3b30, accent: 0x140d0a, hue: [0.07, 0.04], sat: [0.35, 0.12], lit: [0.26, 0.08] },
        bst_flyingpig2:         { variant: 'bst_flyingpig2',         front: false, scale: 2.4, texturePool: 'fur', bodyColor: 0xf0b0b8, accent: 0xffffff, hue: [0.97, 0.04], sat: [0.30, 0.10], lit: [0.70, 0.08] },
        bst_normalpig:          { variant: 'bst_normalpig',          front: false, scale: 2.4, texturePool: 'fur', bodyColor: 0xf0aeb4, accent: 0xd88a90, hue: [0.97, 0.04], sat: [0.34, 0.10], lit: [0.72, 0.08] },
        bst_madboar:            { variant: 'bst_madboar',            front: false, scale: 2.6, texturePool: 'fur', bodyColor: 0x4a3b30, accent: 0xff5544, hue: [0.07, 0.04], sat: [0.38, 0.12], lit: [0.26, 0.08] },
        // ── Bespoke split: ape group (primates) ─────────────────────────────
        bst_maleficentape:      { variant: 'bst_maleficentape',      front: true,  scale: 2.9, texturePool: 'fur', bodyColor: 0x2a2622, accent: 0xb89878, hue: [0.07, 0.05], sat: [0.16, 0.10], lit: [0.18, 0.08] },
        bst_organgrindermonkey: { variant: 'bst_organgrindermonkey', front: true,  scale: 2.2, texturePool: 'fur', bodyColor: 0x6a4a30, accent: 0xd8b23a, hue: [0.08, 0.05], sat: [0.40, 0.12], lit: [0.34, 0.10] },
        bst_treemonkey:         { variant: 'bst_treemonkey',         front: true,  scale: 2.2, texturePool: 'fur', bodyColor: 0x7a5638, accent: 0xd8c090, hue: [0.08, 0.05], sat: [0.38, 0.12], lit: [0.36, 0.10] },
        // ── Level 1-5 starter critters: each its own low-poly body ─────────
        lv_pantrymouse:        { variant: 'lv_pantrymouse',         front: false, scale: 1.9, texturePool: 'fur', bodyColor: 0x8a7a66, accent: 0xf4efe4, hue: [0.07, 0.04], sat: [0.1, 0.10], lit: [0.43, 0.08] },
        lv_barnkitten:         { variant: 'lv_barnkitten',          front: false, scale: 2.0, texturePool: 'fur', bodyColor: 0xc8843a, accent: 0x8ad048, hue: [0.07, 0.04], sat: [0.51, 0.10], lit: [0.47, 0.08] },
        lv_acornsquirrel:      { variant: 'lv_acornsquirrel',       front: false, scale: 1.9, texturePool: 'fur', bodyColor: 0xa0582a, accent: 0x6a4a28, hue: [0.04, 0.04], sat: [0.53, 0.10], lit: [0.36, 0.08] },
        lv_molehillpup:        { variant: 'lv_molehillpup',         front: false, scale: 1.8, texturePool: 'fur', bodyColor: 0x3a3438, accent: 0xe890a0, hue: [0.87, 0.04], sat: [0.02, 0.06], lit: [0.18, 0.08] },
        lv_gutterrat:          { variant: 'lv_gutterrat',           front: false, scale: 2.0, texturePool: 'fur', bodyColor: 0x6e6450, accent: 0xd8c060, hue: [0.09, 0.04], sat: [0.11, 0.10], lit: [0.33, 0.08] },
        lv_grumpyhedgehog:     { variant: 'lv_grumpyhedgehog',      front: false, scale: 1.9, texturePool: 'fur', bodyColor: 0x9a7a5a, accent: 0x3a2a1e, hue: [0.06, 0.04], sat: [0.21, 0.10], lit: [0.44, 0.08] },
        lv_chipmunkhoarder:    { variant: 'lv_chipmunkhoarder',     front: false, scale: 1.8, texturePool: 'fur', bodyColor: 0xb0703a, accent: 0x2a1c14, hue: [0.06, 0.04], sat: [0.45, 0.10], lit: [0.42, 0.08] },
        lv_sockthiefferret:    { variant: 'lv_sockthiefferret',     front: false, scale: 2.0, texturePool: 'fur', bodyColor: 0xc8b088, accent: 0xc83a3a, hue: [0.08, 0.04], sat: [0.32, 0.10], lit: [0.62, 0.08] },
        lv_binraccoon:         { variant: 'lv_binraccoon',          front: false, scale: 2.0, texturePool: 'fur', bodyColor: 0x7a7a80, accent: 0xe8c838, hue: [0.65, 0.04], sat: [0.02, 0.06], lit: [0.45, 0.08] },
        lv_dunejerboa:         { variant: 'lv_dunejerboa',          front: false, scale: 2.0, texturePool: 'fur', bodyColor: 0xd8b880, accent: 0x1a1410, hue: [0.09, 0.04], sat: [0.48, 0.10], lit: [0.63, 0.08] },
        lv_fennecfoxkit:       { variant: 'lv_fennecfoxkit',        front: false, scale: 1.9, texturePool: 'fur', bodyColor: 0xe0c090, accent: 0xf4ece0, hue: [0.08, 0.04], sat: [0.51, 0.10], lit: [0.68, 0.08] },
        lv_frostfoxkit:        { variant: 'lv_frostfoxkit',         front: false, scale: 2.0, texturePool: 'fur', bodyColor: 0xe8eef4, accent: 0x8adfff, hue: [0.56, 0.04], sat: [0.3, 0.10], lit: [0.8, 0.06] },
        lv_mudskipper:         { variant: 'lv_mudskipper',          front: false, scale: 2.0, texturePool: 'fur', bodyColor: 0x7a7448, accent: 0x3a6ab8, hue: [0.13, 0.04], sat: [0.21, 0.10], lit: [0.34, 0.08] },
        lv_scrapyardjackal:    { variant: 'lv_scrapyardjackal',     front: false, scale: 2.1, texturePool: 'fur', bodyColor: 0xb08850, accent: 0xffd040, hue: [0.08, 0.04], sat: [0.33, 0.10], lit: [0.46, 0.08] },
        lv_moorwolfpup:        { variant: 'lv_moorwolfpup',         front: false, scale: 2.0, texturePool: 'fur', bodyColor: 0x7a6e60, accent: 0xd89a30, hue: [0.07, 0.04], sat: [0.07, 0.10], lit: [0.39, 0.08] },
        lv_dromedarycalf:      { variant: 'lv_dromedarycalf',       front: false, scale: 2.0, texturePool: 'fur', bodyColor: 0xd0aa70, accent: 0x2a1c14, hue: [0.08, 0.04], sat: [0.46, 0.10], lit: [0.59, 0.08] },
        lv_marshotter:         { variant: 'lv_marshotter',          front: false, scale: 2.0, texturePool: 'fur', bodyColor: 0x6a4a30, accent: 0x8a8c90, hue: [0.05, 0.04], sat: [0.33, 0.10], lit: [0.26, 0.08] },
        lv_froststoat:         { variant: 'lv_froststoat',          front: false, scale: 2.0, texturePool: 'fur', bodyColor: 0xf0f2f4, accent: 0x141210, hue: [0.56, 0.04], sat: [0.1, 0.10], lit: [0.8, 0.06] },
        lv_yeticub:            { variant: 'lv_yeticub',             front: false, scale: 2.1, texturePool: 'fur', bodyColor: 0xe8eef4, accent: 0x6a8ab8, hue: [0.56, 0.04], sat: [0.3, 0.10], lit: [0.8, 0.06] },
        lv_snowsledpup:        { variant: 'lv_snowsledpup',         front: false, scale: 2.0, texturePool: 'fur', bodyColor: 0x8a9098, accent: 0xb83a2a, hue: [0.58, 0.04], sat: [0.01, 0.10], lit: [0.53, 0.08] },
        lv_shrinemouse:        { variant: 'lv_shrinemouse',         front: false, scale: 1.8, texturePool: 'fur', bodyColor: 0xf4f2ee, accent: 0xd02030, hue: [0.09, 0.04], sat: [0.16, 0.10], lit: [0.8, 0.06] },
        lv_pilgrimgoatkid:     { variant: 'lv_pilgrimgoatkid',      front: false, scale: 2.0, texturePool: 'fur', bodyColor: 0xe0d4c0, accent: 0xc8a040, hue: [0.08, 0.04], sat: [0.29, 0.10], lit: [0.78, 0.08] },
        lv_shrinefox:          { variant: 'lv_shrinefox',           front: false, scale: 2.0, texturePool: 'fur', bodyColor: 0xc85a2a, accent: 0xc81e1e, hue: [0.03, 0.04], sat: [0.6, 0.10], lit: [0.43, 0.08] },
        lv_slumbersheep:       { variant: 'lv_slumbersheep',        front: false, scale: 2.0, texturePool: 'fur', bodyColor: 0xf0ece6, accent: 0x4a5aa8, hue: [0.08, 0.04], sat: [0.2, 0.10], lit: [0.8, 0.06] },
        lv_dreamtapir:         { variant: 'lv_dreamtapir',          front: false, scale: 2.2, texturePool: 'fur', bodyColor: 0x2a2a3a, accent: 0xb088ff, hue: [0.65, 0.04], sat: [0.11, 0.10], lit: [0.16, 0.08] },
        lv_subwayrat:          { variant: 'lv_subwayrat',           front: false, scale: 1.9, texturePool: 'fur', bodyColor: 0x5a5a5e, accent: 0xc8e040, hue: [0.65, 0.04], sat: [0.02, 0.06], lit: [0.32, 0.08] },
        lv_cyberpup:           { variant: 'lv_cyberpup',            front: false, scale: 2.0, texturePool: 'fur', bodyColor: 0xc8b8a0, accent: 0xff2a2a, hue: [0.08, 0.04], sat: [0.22, 0.10], lit: [0.67, 0.08] },
        lv_greaserat:          { variant: 'lv_greaserat',           front: false, scale: 1.9, texturePool: 'fur', bodyColor: 0x8a7040, accent: 0xe8c040, hue: [0.09, 0.04], sat: [0.32, 0.10], lit: [0.36, 0.08] },
        lv_chainsawbeaver:     { variant: 'lv_chainsawbeaver',      front: false, scale: 2.0, texturePool: 'fur', bodyColor: 0x7a5232, accent: 0xd86a1a, hue: [0.05, 0.04], sat: [0.37, 0.10], lit: [0.3, 0.08] },
        lv_shopliftingraccoon: { variant: 'lv_shopliftingraccoon',  front: false, scale: 2.0, texturePool: 'fur', bodyColor: 0x6a6a72, accent: 0xe8e8e0, hue: [0.65, 0.04], sat: [0.02, 0.06], lit: [0.39, 0.08] },
        lv_trufflepiglet:      { variant: 'lv_trufflepiglet',       front: false, scale: 1.9, texturePool: 'fur', bodyColor: 0xe0a0a0, accent: 0x5a3e28, hue: [0, 0.04], sat: [0.46, 0.10], lit: [0.71, 0.08] },
        lv_fungalshrew:        { variant: 'lv_fungalshrew',         front: false, scale: 1.8, texturePool: 'fur', bodyColor: 0x6a5a4a, accent: 0xc83a2a, hue: [0.06, 0.04], sat: [0.13, 0.10], lit: [0.31, 0.08] },
        lv_alpinemarmot:       { variant: 'lv_alpinemarmot',        front: false, scale: 1.9, texturePool: 'fur', bodyColor: 0x8a7258, accent: 0xe08a2a, hue: [0.07, 0.04], sat: [0.17, 0.10], lit: [0.4, 0.08] },
        lv_harbourwhelk:       { variant: 'lv_harbourwhelk',        front: false, scale: 2.2, texturePool: 'fur', bodyColor: 0xd8b890, accent: 0x8a9488, hue: [0.07, 0.04], sat: [0.43, 0.10], lit: [0.67, 0.08] },
        lv_jungletamarin:      { variant: 'lv_jungletamarin',       front: false, scale: 2.0, texturePool: 'fur', bodyColor: 0x3a3434, accent: 0xa0482a, hue: [0, 0.04], sat: [0.02, 0.06], lit: [0.18, 0.08] },
        lv_unicornfoal:        { variant: 'lv_unicornfoal',         front: false, scale: 2.0, texturePool: 'fur', bodyColor: 0xf2eee6, accent: 0xffe680, hue: [0.09, 0.04], sat: [0.27, 0.10], lit: [0.8, 0.06] },
        lv_bamboopandacub:     { variant: 'lv_bamboopandacub',      front: false, scale: 2.0, texturePool: 'fur', bodyColor: 0xf0f0ec, accent: 0x1c1c1e, hue: [0.15, 0.04], sat: [0.07, 0.10], lit: [0.8, 0.06] },
        lv_taigasquirrel:      { variant: 'lv_taigasquirrel',       front: false, scale: 1.9, texturePool: 'fur', bodyColor: 0x8a8c90, accent: 0x6a4a2a, hue: [0.59, 0.04], sat: [0.02, 0.06], lit: [0.51, 0.08] },
        lv_savannahmeerkat:    { variant: 'lv_savannahmeerkat',     front: false, scale: 2.0, texturePool: 'fur', bodyColor: 0xc8aa78, accent: 0x9a6a40, hue: [0.08, 0.04], sat: [0.37, 0.10], lit: [0.59, 0.08] },
        lv_steppevole:         { variant: 'lv_steppevole',          front: false, scale: 1.8, texturePool: 'fur', bodyColor: 0x7a5e44, accent: 0x6aa040, hue: [0.06, 0.04], sat: [0.23, 0.10], lit: [0.33, 0.08] },
    };

    class BeastBattler3D extends Base {
        constructor(scale, offsetY, battler, weaponType, creatureType) {
            const profile = B_PROFILES[creatureType] || B_PROFILES.bear;
            super(scale, offsetY, battler, profile, 0, creatureType || 'bear');
            this.variant = profile.variant;
            this._materials = [];
            this._baseY = null;
            if (profile.front) this.facingYaw = 0;
        }

        // ── shared material / part helpers ───────────────────────────────────
        _mat(color, opacity, rough, emissive) {
            const m = new THREE.MeshStandardMaterial({
                color, roughness: (rough === undefined ? 0.8 : rough),
                emissive: new THREE.Color(emissive || 0x000000), emissiveIntensity: emissive ? 0.6 : 0,
                transparent: true, opacity: (opacity === undefined ? 1.0 : opacity)
            });
            this._materials.push(m);
            return m;
        }
        // Main id-varied body fur (fixed base colour tinted by the per-id skin map).
        _furMat() {
            const p = this.profile;
            const m = new THREE.MeshStandardMaterial({
                color: p.bodyColor, map: this.skinTex(), roughness: 0.9, transparent: true,
                emissive: new THREE.Color(p.emissive || 0x000000), emissiveIntensity: p.emissive ? 0.35 : 0
            });
            this._materials.push(m);
            return m;
        }
        _eye(parent, x, y, z, r, accent, glow) {
            const e = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), this._mat(accent || 0x111111, 1.0, 0.2, glow ? accent : 0));
            e.position.set(x, y, z); parent.add(e); return e;
        }
        // A big round cat eye: coloured iris, a soft slit pupil and a white
        // catchlight. The catchlight is what reads as "alive" rather than
        // "glass bead", so it always sits up and inboard of the pupil.
        _catEye(parent, x, y, z, r, iris, glow) {
            const g = new THREE.Group();
            const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 12), this._mat(iris || 0x9be000, 1.0, 0.15, glow ? iris : 0));
            g.add(ball);
            const pupil = new THREE.Mesh(new THREE.SphereGeometry(r * 0.58, 10, 10), this._mat(0x14101a, 1.0, 0.1));
            pupil.scale.set(0.58, 1.0, 0.55); pupil.position.z = r * 0.58; g.add(pupil);
            const glint = new THREE.Mesh(new THREE.SphereGeometry(r * 0.22, 8, 8), this._mat(0xffffff, 0.95, 0.05, 0xffffff));
            glint.position.set(-r * 0.3, r * 0.34, r * 0.74); g.add(glint);
            g.position.set(x, y, z); parent.add(g); return g;
        }
        // Claws on the front of a foot: small cones raked forward and down, in
        // the horn colour rather than the fur colour so they read at a distance.
        // Shared by every paw and pad, which is what gives the whole family a
        // silhouette that ends in something dangerous.
        _claws(parent, count, len, w, color) {
            const m = this._mat(color || 0x1d1712, 1.0, 0.35);
            const n = count || 3;
            for (let i = 0; i < n; i++) {
                const cx = (i - (n - 1) / 2) * 0.052 * w;
                const c = new THREE.Mesh(new THREE.ConeGeometry(0.018 * w, len, 4), m);
                c.position.set(cx, -0.035 * w, 0.13 * w);
                c.rotation.set(1.75, 0, 0);
                parent.add(c);
            }
        }

        // A hip-pivoted leg that swings in the gait.
        // foot: 'paw' | 'hoof' | 'pad' | 'catpaw'. thick scales the limb girth.
        //
        // The limb is jointed rather than a straight stack of two cylinders: an
        // animal's shin sits back under the hip and the ankle steps forward
        // again, and a knee ball at the break stops the two segments reading as
        // one telescoping tube. Every foot ends in toes or horn, never in a
        // bare box, since the feet are what sell the species at battle distance.
        _leg(mat, x, z, hipY, len, foot, thick) {
            const g = new THREE.Group();
            const w = thick || 1.0;
            const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.13 * w, 0.09 * w, len * 0.55, 10), mat);
            thigh.position.set(0, -len * 0.27, 0.012 * len); thigh.rotation.x = -0.05; g.add(thigh);
            const knee = new THREE.Mesh(new THREE.SphereGeometry(0.085 * w, 8, 6), mat);
            knee.position.set(0, -len * 0.52, -0.01 * len); g.add(knee);
            const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.075 * w, 0.055 * w, len * 0.45, 10), mat);
            shin.position.set(0, -len * 0.73, -0.02 * len); shin.rotation.x = 0.07; g.add(shin);

            let f;
            if (foot === 'hoof') {
                // A hoof is cloven and has a pastern above it: one plain
                // cylinder read as a peg leg.
                f = new THREE.Group();
                const hornMat = this._mat(0x241b14, 1.0, 0.4);
                const pastern = new THREE.Mesh(new THREE.CylinderGeometry(0.052 * w, 0.062 * w, 0.09, 8), mat);
                pastern.position.y = 0.07; f.add(pastern);
                for (const hx of [-0.032, 0.032]) {
                    const half = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.052, 0.13, 8), hornMat);
                    half.position.set(hx * w, 0, 0.012); half.rotation.z = hx > 0 ? -0.1 : 0.1; f.add(half);
                }
            } else if (foot === 'paw') {
                // A broad plantigrade paw: a rounded sole, four toes and claws.
                f = new THREE.Group();
                const sole = new THREE.Mesh(new THREE.SphereGeometry(0.115 * w, 12, 10), mat);
                sole.scale.set(1.15, 0.6, 1.5); f.add(sole);
                for (const tx of [-0.072, -0.024, 0.024, 0.072]) {
                    const toe = new THREE.Mesh(new THREE.SphereGeometry(0.036 * w, 6, 4), mat);
                    toe.position.set(tx * w, -0.012, 0.135 * w); f.add(toe);
                }
                this._claws(f, 4, 0.11, w, 0x17120e);
            } else if (foot === 'catpaw') {
                // A soft rounded mitten with three toes, not a shoe box.
                f = new THREE.Group();
                const pad = new THREE.Mesh(new THREE.SphereGeometry(0.11 * w, 12, 10), mat);
                pad.scale.set(1.0, 0.72, 1.25); f.add(pad);
                const toeMat = this._mat(0xe8a0ae, 1.0, 0.5);
                for (const tx of [-0.05, 0, 0.05]) {
                    const toe = new THREE.Mesh(new THREE.SphereGeometry(0.028 * w, 6, 4), toeMat);
                    toe.position.set(tx * w, -0.03, 0.11 * w); f.add(toe);
                }
                this._claws(f, 3, 0.06, w, 0xd8cdba);
            } else {
                // 'pad': a digitigrade foot, toes forward and a short claw each.
                f = new THREE.Group();
                const pad = new THREE.Mesh(new THREE.SphereGeometry(0.093 * w, 10, 8), mat);
                pad.scale.set(1.0, 0.8, 1.35); f.add(pad);
                for (const tx of [-0.05, 0, 0.05]) {
                    const toe = new THREE.Mesh(new THREE.SphereGeometry(0.03 * w, 6, 4), mat);
                    toe.position.set(tx * w, -0.014, 0.105 * w); f.add(toe);
                }
                this._claws(f, 3, 0.075, w, 0x1d1712);
            }
            f.position.set(0, -len * 0.95, -0.02 * len); g.add(f);
            g.position.set(x, hipY, z); this.bodyGroup.add(g); return g;
        }
        // A drooping segmented tail (curls forward if droopZ > 0).
        _tail(mat, baseY, baseZ, segs, taper, droopZ) {
            const g = new THREE.Group();
            let py = 0, pz = 0, r = 0.12;
            for (let i = 0; i < segs; i++) {
                const s = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), mat);
                s.position.set(0, py, pz); g.add(s);
                py -= 0.11; pz += droopZ * 0.09; r *= taper;
            }
            g.position.set(0, baseY, baseZ); this.bodyGroup.add(g); return g;
        }
        // A feline tail: cats carry it UP, not hanging. Leaves the rump angled
        // back, sweeps vertical, then hooks forward at the tip, so the arc
        // clears the haunches and the hind legs instead of dangling between
        // them. Base goes just inside the rump so the root reads as attached.
        // fluff (default 1) fattens the segments and rounds the tip off into a
        // soft pom, which is what makes the tail read as fur and not as beads.
        _felineTail(mat, baseY, baseZ, segs, taper, fluff) {
            const g = new THREE.Group();
            const f = fluff || 1.0;
            let py = 0, pz = 0, r = 0.12 * f;
            for (let i = 0; i < segs; i++) {
                const s = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat);
                s.position.set(0, py, pz); g.add(s);
                const a = -0.55 + (i / (segs - 1)) * 1.25;   // lean: back -> forward
                py += Math.cos(a) * 0.13; pz += Math.sin(a) * 0.13; r *= taper;
                if (i === segs - 1) { const tip = new THREE.Mesh(new THREE.SphereGeometry(r * 1.5, 10, 8), mat); tip.position.set(0, py, pz); g.add(tip); }
            }
            g.position.set(0, baseY, baseZ); this.bodyGroup.add(g); return g;
        }
        _nub(mat, x, y, z, r) {
            const g = new THREE.Group();
            g.add(new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), mat));
            g.position.set(x, y, z); this.bodyGroup.add(g); return g;
        }

        // The wedge of muscle that joins a head to a set of shoulders. Several
        // of these rigs parked the head in mid air a hand's width off the
        // torso, which is the single thing that most made them read as parts in
        // a bag rather than as an animal. It is added to the HEAD group, so it
        // travels with the head when the head turns and vanishes with it when
        // the head is taken off. dropY/dropZ say where the shoulders are,
        // measured in the head group's own space.
        _neck(mat, dropY, dropZ, rTop, rBase, tiltX) {
            const g = new THREE.Group();
            const dy = -dropY, dz = -dropZ;
            const len = Math.max(0.08, Math.hypot(dy, dz));
            const col = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBase, len * 1.12, 10), mat);
            col.position.set(0, dy / 2, dz / 2);
            col.rotation.x = Math.atan2(dz, dy) + (tiltX || 0);
            g.add(col);
            // A collar ball at each end so the joins are not visible seams.
            const top = new THREE.Mesh(new THREE.SphereGeometry(rTop * 1.05, 10, 8), mat);
            g.add(top);
            const base = new THREE.Mesh(new THREE.SphereGeometry(rBase * 1.05, 10, 8), mat);
            base.position.set(0, dy, dz); g.add(base);
            return g;
        }

        // A ruff or mane: a ring of fur cones around the base of the neck.
        _ruff(parent, r, y, z, count, len, mat, spread) {
            const n = count || 12;
            const s = spread === undefined ? 1 : spread;
            for (let i = 0; i < n; i++) {
                const a = (i / n) * Math.PI * 2;
                const tuft = new THREE.Mesh(new THREE.ConeGeometry(len * 0.34, len, 5), mat);
                tuft.position.set(Math.cos(a) * r, y + Math.sin(a) * r * s, z);
                tuft.rotation.set(Math.PI / 2 * 0.55, 0, -a + Math.PI / 2);
                parent.add(tuft);
            }
        }

        // Common four-leg part map + dismemberment cascade.
        _wireQuad(p) {
            const m = {}, set = (ks, mesh) => { if (mesh) ks.forEach(k => m[k] = mesh); };
            set(['BODY', 'TORSO', 'CORE', 'SPINE', 'RIBCAGE', 'MASS'], p.body);
            set(['HEAD', 'SKULL', 'BRAIN', 'FACE', 'EYE', 'EYES'], p.head);
            set(['LEFT_LEG', 'FRONT_LEFT_PAW', 'LEFT_ARM'], p.fl);
            set(['RIGHT_LEG', 'FRONT_RIGHT_PAW', 'RIGHT_ARM'], p.fr);
            set(['REAR_LEFT_LEG', 'HIND_LEFT_LEG', 'LEFT_THIGH'], p.rl);
            set(['REAR_RIGHT_LEG', 'HIND_RIGHT_LEG', 'RIGHT_THIGH'], p.rr);
            set(['TAIL'], p.tail);
            this._partMeshMap = m;
            this._cascadeRules = [
                { gone: ['BODY', 'TORSO', 'CORE', 'SPINE', 'RIBCAGE', 'MASS'], hide: [p.body, p.head, p.fl, p.fr, p.rl, p.rr, p.tail].filter(Boolean) },
                { gone: ['HEAD', 'SKULL', 'BRAIN', 'FACE'], hide: [p.head].filter(Boolean) },
                { gone: ['LEFT_LEG', 'FRONT_LEFT_PAW'], hide: [p.fl].filter(Boolean) },
                { gone: ['RIGHT_LEG', 'FRONT_RIGHT_PAW'], hide: [p.fr].filter(Boolean) },
                { gone: ['REAR_LEFT_LEG', 'HIND_LEFT_LEG'], hide: [p.rl].filter(Boolean) },
                { gone: ['REAR_RIGHT_LEG', 'HIND_RIGHT_LEG'], hide: [p.rr].filter(Boolean) },
                { gone: ['TAIL'], hide: [p.tail].filter(Boolean) },
            ];
        }
        _wireBiped(p) {
            const m = {}, set = (ks, mesh) => { if (mesh) ks.forEach(k => m[k] = mesh); };
            set(['BODY', 'TORSO', 'CORE', 'SPINE', 'RIBCAGE', 'CHEST', 'MASS'], p.body);
            set(['HEAD', 'SKULL', 'BRAIN', 'FACE'], p.head);
            set(['LEFT_ARM', 'LEFT_UPPER_ARM', 'LEFT_HAND'], p.la);
            set(['RIGHT_ARM', 'RIGHT_UPPER_ARM', 'RIGHT_HAND'], p.ra);
            set(['LEFT_LEG', 'LEFT_THIGH', 'REAR_LEFT_LEG', 'HIND_LEFT_LEG'], p.ll);
            set(['RIGHT_LEG', 'RIGHT_THIGH', 'REAR_RIGHT_LEG', 'HIND_RIGHT_LEG'], p.rl);
            this._partMeshMap = m;
            this._cascadeRules = [
                { gone: ['BODY', 'TORSO', 'CORE', 'SPINE', 'RIBCAGE', 'CHEST', 'MASS'], hide: [p.body, p.head, p.la, p.ra, p.ll, p.rl].filter(Boolean) },
                { gone: ['HEAD', 'SKULL', 'BRAIN', 'FACE'], hide: [p.head].filter(Boolean) },
                { gone: ['LEFT_ARM', 'LEFT_UPPER_ARM'], hide: [p.la].filter(Boolean) },
                { gone: ['RIGHT_ARM', 'RIGHT_UPPER_ARM'], hide: [p.ra].filter(Boolean) },
                { gone: ['LEFT_LEG', 'LEFT_THIGH'], hide: [p.ll].filter(Boolean) },
                { gone: ['RIGHT_LEG', 'RIGHT_THIGH'], hide: [p.rl].filter(Boolean) },
            ];
        }

        async load(physicsWorld) {
            this.physicsWorld = physicsWorld; // unused (no ragdoll)
            const fur = this._furMat();
            switch (this.variant) {
                case 'wolf':     this._buildWolf(fur); break;
                case 'bigcat':   this._buildBigcat(fur); break;
                case 'boar':     this._buildBoar(fur); break;
                case 'rodent':   this._buildRodent(fur); break;
                case 'armoredbeaver':       this._buildArmoredbeaver(fur); break;
                case 'wastelandbeaver':     this._buildWastelandbeaver(fur); break;
                case 'armoredporcupine':    this._buildArmoredporcupine(fur); break;
                case 'spikeyporcupine':     this._buildSpikeyporcupine(fur); break;
                case 'caffeinatedsquirrel': this._buildCaffeinatedsquirrel(fur); break;
                case 'woodsquirrel':        this._buildWoodsquirrel(fur); break;
                case 'fieldmouse':          this._buildFieldmouse(fur); break;
                case 'forestrat':           this._buildForestrat(fur); break;
                case 'giantrat':            this._buildGiantrat(fur); break;
                case 'sewerrat':            this._buildSewerrat(fur); break;
                case 'swamprat':            this._buildSwamprat(fur); break;
                case 'plaguerattus':        this._buildPlaguerattus(fur); break;
                case 'ratking':             this._buildRatking(fur); break;
                case 'frostraccoon':        this._buildFrostraccoon(fur); break;
                case 'nightraccoon':        this._buildNightraccoon(fur); break;
                case 'molerodent':          this._buildMolerodent(fur); break;
                case 'tunnelingmole':       this._buildTunnelingmole(fur); break;
                case 'icelemming':          this._buildIcelemming(fur); break;
                case 'ungulate': this._buildUngulate(fur); break;
                case 'ape':      this._buildApe(fur); break;
                case 'chromaticmanticore': this._buildChromaticmanticore(fur); break;
                case 'chupacabra':         this._buildChupacabra(fur); break;
                case 'giantsnail':         this._buildGiantsnail(fur); break;
                case 'infernalcerberus':   this._buildInfernalcerberus(fur); break;
                case 'junglepredator':     this._buildJunglepredator(fur); break;
                case 'mianni':             this._buildMianni(fur); break;
                case 'palettephantom':     this._buildPalettephantom(fur); break;
                case 'radiantunicorn':     this._buildRadiantunicorn(fur); break;
                case 'rhinobeetle':        this._buildRhinobeetle(fur); break;
                case 'rummagingopossum':   this._buildRummagingopossum(fur); break;
                case 'beast666':           this._buildBeast666(fur); break;
                case 'tempestpegasus':     this._buildTempestpegasus(fur); break;
                case 'velocicorn':         this._buildVelocicorn(fur); break;
                case 'swampleviathan':     this._buildSwampleviathan(fur); break;
                case 'invertedhunger':     this._buildInvertedhunger(fur); break;
                case 'voidhowler':         this._buildVoidhowler(fur); break;
                case 'feastoffamine':      this._buildFeastoffamine(fur); break;
                case 'maternityward':      this._buildMaternityward(fur); break;
                case 'starvingsabercat':   this._buildStarvingsabercat(fur); break;
                case 'ashenprowler':       this._buildAshenprowler(fur); break;
                case 'gauntsnapper':       this._buildGauntsnapper(fur); break;
                case 'holloweyedboar':     this._buildHolloweyedboar(fur); break;
                case 'ferallynx':          this._buildFerallynx(fur); break;
                case 'diregnasher':        this._buildDiregnasher(fur); break;
                case 'gauntclawrunner':    this._buildGauntclawrunner(fur); break;
                case 'bloodmawdirewolf':   this._buildBloodmawdirewolf(fur); break;
                case 'gauntlynx':          this._buildGauntlynx(fur); break;
                case 'feralbadger':        this._buildFeralbadger(fur); break;
                case 'starvinggnasher':    this._buildStarvinggnasher(fur); break;
                case 'feralridgeback':     this._buildFeralridgeback(fur); break;
                // ── Bespoke splits (canids) ─────────────────────────────────
                case 'bst_arcticfox':          this._buildBstArcticfox(fur); break;
                case 'bst_cottonfox':          this._buildBstCottonfox(fur); break;
                case 'bst_icewolfpup':         this._buildBstIcewolfpup(fur); break;
                case 'bst_rabidhyena':         this._buildBstRabidhyena(fur); break;
                case 'bst_feralhyenapack':     this._buildBstFeralhyenapack(fur); break;
                case 'bst_graywolf':           this._buildBstGraywolf(fur); break;
                case 'bst_manedterrorwolf':    this._buildBstManedterrorwolf(fur); break;
                case 'bst_redfox':             this._buildBstRedfox(fur); break;
                case 'bst_alphadirewolf':      this._buildBstAlphadirewolf(fur); break;
                case 'bst_alphawarg':          this._buildBstAlphawarg(fur); break;
                case 'bst_arcticwolf':         this._buildBstArcticwolf(fur); break;
                case 'bst_rabidcoyote':        this._buildBstRabidcoyote(fur); break;
                case 'bst_scavengingcoyote':   this._buildBstScavengingcoyote(fur); break;
                // ── Bespoke splits (felines) ────────────────────────────────
                case 'bst_lazycat':            this._buildBstLazycat(fur); break;
                case 'bst_blackpanther':       this._buildBstBlackpanther(fur); break;
                case 'bst_reflectivetiger':    this._buildBstReflectivetiger(fur); break;
                case 'bst_sabercat':           this._buildBstSabercat(fur); break;
                case 'bst_wildcat':            this._buildBstWildcat(fur); break;
                case 'bst_feralalleycat':      this._buildBstFeralalleycat(fur); break;
                case 'bst_goldenlion':         this._buildBstGoldenlion(fur); break;
                case 'bst_stripedtiger':       this._buildBstStripedtiger(fur); break;
                case 'bst_umbrapanthera':      this._buildBstUmbrapanthera(fur); break;
                case 'bst_mysticpanther':      this._buildBstMysticpanther(fur); break;
                case 'bst_sabertoothalpha':    this._buildBstSabertoothalpha(fur); break;
                case 'bst_diresabertoothalpha':this._buildBstDiresabertoothalpha(fur); break;
                // ── Bespoke splits (ungulates) ──────────────────────────────
                case 'bst_thirstycamel':       this._buildBstThirstycamel(fur); break;
                case 'bst_foreststag':         this._buildBstForeststag(fur); break;
                case 'bst_pastoralsheep':      this._buildBstPastoralsheep(fur); break;
                case 'bst_armoredrhinoceros':  this._buildBstArmoredrhinoceros(fur); break;
                case 'bst_bloodbellcow':       this._buildBstBloodbellcow(fur); break;
                case 'bst_deersprite':         this._buildBstDeersprite(fur); break;
                case 'bst_hollowgoat':         this._buildBstHollowgoat(fur); break;
                case 'bst_ironhoofcharger':    this._buildBstIronhoofcharger(fur); break;
                case 'bst_rancorousbull':      this._buildBstRancorousbull(fur); break;
                case 'bst_titanotherealpha':   this._buildBstTitanotherealpha(fur); break;
                // ── Bespoke splits (ursids) ─────────────────────────────────
                case 'bst_brownbear':          this._buildBstBrownbear(fur); break;
                case 'bst_hornedbear':         this._buildBstHornedbear(fur); break;
                case 'bst_youngyeti':          this._buildBstYoungyeti(fur); break;
                case 'bst_frostbackursid':     this._buildBstFrostbackursid(fur); break;
                case 'bst_panda':              this._buildBstPanda(fur); break;
                case 'bst_polarbear':          this._buildBstPolarbear(fur); break;
                case 'bst_timewornowlbear':    this._buildBstTimewornowlbear(fur); break;
                case 'bst_demonbear':          this._buildBstDemonbear(fur); break;
                case 'bst_kodiakbear':         this._buildBstKodiakbear(fur); break;
                case 'bst_emberclawbear':      this._buildBstEmberclawbear(fur); break;
                case 'bst_frostfangbear':      this._buildBstFrostfangbear(fur); break;
                case 'bst_thundermawursine':   this._buildBstThundermawursine(fur); break;
                case 'bst_titaniccavebear':    this._buildBstTitaniccavebear(fur); break;
                // ── Bespoke splits (suids) ──────────────────────────────────
                case 'bst_direpig':            this._buildBstDirepig(fur); break;
                case 'bst_flyingpig':          this._buildBstFlyingpig(fur); break;
                case 'bst_razorbackboar':      this._buildBstRazorbackboar(fur); break;
                case 'bst_wildboar':           this._buildBstWildboar(fur); break;
                case 'bst_flyingpig2':         this._buildBstFlyingpig(fur); break;
                case 'bst_normalpig':          this._buildBstNormalpig(fur); break;
                case 'bst_madboar':            this._buildBstMadboar(fur); break;
                // ── Bespoke splits (primates) ───────────────────────────────
                case 'bst_maleficentape':      this._buildBstMaleficentape(fur); break;
                case 'bst_organgrindermonkey': this._buildBstOrgangrindermonkey(fur); break;
                case 'bst_treemonkey':         this._buildBstTreemonkey(fur); break;
                // ── Level 1-5 starter critters ──────────────────────────────
                case 'lv_pantrymouse':         this._buildLvPantrymouse(); break;
                case 'lv_barnkitten':          this._buildLvBarnkitten(); break;
                case 'lv_acornsquirrel':       this._buildLvAcornsquirrel(); break;
                case 'lv_molehillpup':         this._buildLvMolehillpup(); break;
                case 'lv_gutterrat':           this._buildLvGutterrat(); break;
                case 'lv_grumpyhedgehog':      this._buildLvGrumpyhedgehog(); break;
                case 'lv_chipmunkhoarder':     this._buildLvChipmunkhoarder(); break;
                case 'lv_sockthiefferret':     this._buildLvSockthiefferret(); break;
                case 'lv_binraccoon':          this._buildLvBinraccoon(); break;
                case 'lv_dunejerboa':          this._buildLvDunejerboa(); break;
                case 'lv_fennecfoxkit':        this._buildLvFennecfoxkit(); break;
                case 'lv_frostfoxkit':         this._buildLvFrostfoxkit(); break;
                case 'lv_mudskipper':          this._buildLvMudskipper(); break;
                case 'lv_scrapyardjackal':     this._buildLvScrapyardjackal(); break;
                case 'lv_moorwolfpup':         this._buildLvMoorwolfpup(); break;
                case 'lv_dromedarycalf':       this._buildLvDromedarycalf(); break;
                case 'lv_marshotter':          this._buildLvMarshotter(); break;
                case 'lv_froststoat':          this._buildLvFroststoat(); break;
                case 'lv_yeticub':             this._buildLvYeticub(); break;
                case 'lv_snowsledpup':         this._buildLvSnowsledpup(); break;
                case 'lv_shrinemouse':         this._buildLvShrinemouse(); break;
                case 'lv_pilgrimgoatkid':      this._buildLvPilgrimgoatkid(); break;
                case 'lv_shrinefox':           this._buildLvShrinefox(); break;
                case 'lv_slumbersheep':        this._buildLvSlumbersheep(); break;
                case 'lv_dreamtapir':          this._buildLvDreamtapir(); break;
                case 'lv_subwayrat':           this._buildLvSubwayrat(); break;
                case 'lv_cyberpup':            this._buildLvCyberpup(); break;
                case 'lv_greaserat':           this._buildLvGreaserat(); break;
                case 'lv_chainsawbeaver':      this._buildLvChainsawbeaver(); break;
                case 'lv_shopliftingraccoon':  this._buildLvShopliftingraccoon(); break;
                case 'lv_trufflepiglet':       this._buildLvTrufflepiglet(); break;
                case 'lv_fungalshrew':         this._buildLvFungalshrew(); break;
                case 'lv_alpinemarmot':        this._buildLvAlpinemarmot(); break;
                case 'lv_harbourwhelk':        this._buildLvHarbourwhelk(); break;
                case 'lv_jungletamarin':       this._buildLvJungletamarin(); break;
                case 'lv_unicornfoal':         this._buildLvUnicornfoal(); break;
                case 'lv_bamboopandacub':      this._buildLvBamboopandacub(); break;
                case 'lv_taigasquirrel':       this._buildLvTaigasquirrel(); break;
                case 'lv_savannahmeerkat':     this._buildLvSavannahmeerkat(); break;
                case 'lv_steppevole':          this._buildLvSteppevole(); break;
                default:         this._buildBear(fur); break;
            }
            this.model = this.bodyGroup;
            this.applyModelScale();
            this.loaded = true;
            return this;
        }

        // ── Bear: bulky ursine on short thick legs ───────────────────────────
        // A bear is read from three things: the shoulder hump standing higher
        // than the rump, the long dished muzzle, and the sheer barrel of it.
        // The old rig had none of those and hung its head in mid air.
        _buildBear(fur) {
            const p = this.profile;
            this.body = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 14), fur); torso.scale.set(1.05, 0.95, 1.55); this.body.add(torso);
            // The hump over the shoulders: the highest point on a bear, and the
            // reason its back slopes down toward the tail.
            const hump = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 12), fur);
            hump.scale.set(1.05, 0.85, 1.0); hump.position.set(0, 0.24, 0.34); this.body.add(hump);
            const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.47, 14, 12), fur); shoulders.scale.set(1.1, 1.0, 0.9); shoulders.position.set(0, 0.1, 0.46); this.body.add(shoulders);
            const rump = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 12), fur); rump.scale.set(1.0, 0.95, 0.95); rump.position.set(0, -0.06, -0.5); this.body.add(rump);
            const belly = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), fur); belly.scale.set(0.95, 0.7, 1.35); belly.position.set(0, -0.22, -0.02); this.body.add(belly);
            this.body.position.set(0, 1.05, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            // The head sits forward and low of the hump, so the neck runs back
            // and down into the shoulders rather than straight down.
            this.head.add(this._neck(fur, 0.32, -0.3, 0.2, 0.3, 0));
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 14), fur); skull.scale.set(1.0, 0.98, 1.05); this.head.add(skull);
            const brow = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), fur); brow.scale.set(1.15, 0.55, 0.8); brow.position.set(0, 0.13, 0.16); this.head.add(brow);
            // A bear muzzle is long and tapers, and the bridge dishes down
            // between the eyes: two tapered sections rather than one tube.
            const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.2, 12), fur); bridge.rotation.x = Math.PI / 2; bridge.position.set(0, -0.02, 0.24); this.head.add(bridge);
            const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.15, 0.24, 12), fur); snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.06, 0.42); this.head.add(snout);
            const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), fur); jaw.scale.set(1.0, 0.6, 1.5); jaw.position.set(0, -0.14, 0.36); this.head.add(jaw);
            const nose = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 10), this._mat(0x140d0a, 1.0, 0.35)); nose.scale.set(1.2, 0.85, 0.8); nose.position.set(0, -0.03, 0.53); this.head.add(nose);
            for (const nx of [-0.035, 0.035]) { const n = new THREE.Mesh(new THREE.SphereGeometry(0.022, 5, 4), this._mat(0x070505, 1.0, 0.3)); n.position.set(nx, -0.04, 0.59); this.head.add(n); }
            // Small round ears, set wide and back, with a paler inner cup.
            const innerMat = this._mat(0x6b4a3a, 1.0, 0.8);
            for (const ex of [-0.21, 0.21]) {
                const ear = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 12), fur); ear.position.set(ex, 0.28, -0.04); ear.scale.set(1, 1, 0.45); this.head.add(ear);
                const inner = new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 10), innerMat); inner.position.set(ex * 0.94, 0.28, 0.02); inner.scale.set(1, 1, 0.3); this.head.add(inner);
            }
            this._eye(this.head, -0.13, 0.09, 0.245, 0.048, p.accent, false);
            this._eye(this.head, 0.13, 0.09, 0.245, 0.048, p.accent, false);
            this.head.position.set(0, 1.37, 0.6); this.bodyGroup.add(this.head);

            this.frontLeft  = this._leg(fur, -0.32, 0.42, 0.92, 0.95, 'paw', 1.25);
            this.frontRight = this._leg(fur, 0.32, 0.42, 0.92, 0.95, 'paw', 1.25);
            this.rearLeft   = this._leg(fur, -0.32, -0.42, 0.92, 0.95, 'paw', 1.35);
            this.rearRight  = this._leg(fur, 0.32, -0.42, 0.92, 0.95, 'paw', 1.35);
            this.tail = this._nub(fur, 0, 1.0, -0.74, 0.09);
            this._wireQuad({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Wolf: lean canine with long snout, hackles, bushy tail ───────────
        _buildWolf(fur) {
            const p = this.profile;
            this.body = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.23, 1.05, 14), fur); torso.rotation.x = Math.PI / 2; this.body.add(torso);
            // A canine is deep through the chest and tucked at the waist: the
            // straight tube it used to be read as a sausage on legs.
            const chest = new THREE.Mesh(new THREE.SphereGeometry(0.29, 14, 12), fur); chest.scale.set(0.92, 1.15, 1.0); chest.position.set(0, -0.02, 0.46); this.body.add(chest);
            const waist = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), fur); waist.scale.set(0.9, 0.85, 1.1); waist.position.set(0, -0.03, -0.14); this.body.add(waist);
            const rump = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 12), fur); rump.scale.set(1.0, 1.0, 0.95); rump.position.set(0, 0.02, -0.52); this.body.add(rump);
            // Hackles: a raised ridge along the spine, tallest at the withers.
            for (let i = 0; i < 7; i++) {
                const t = i / 6;
                const sp = new THREE.Mesh(new THREE.ConeGeometry(0.048, 0.22 - t * 0.1, 5), fur);
                sp.position.set(0, 0.26 - t * 0.03, 0.44 - i * 0.16); sp.rotation.x = -0.2; this.body.add(sp);
            }
            this.body.position.set(0, 1.05, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.21, 0.42, 12), fur); neck.rotation.x = 0.7; neck.position.set(0, 0.02, -0.06); this.head.add(neck);
            // The thick ruff of fur around the neck, the thing that makes a
            // wolf look heavier at the shoulders than it really is.
            this._ruff(this.head, 0.2, 0.06, -0.02, 11, 0.2, fur, 1);
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 12), fur); skull.scale.set(0.92, 0.85, 1.12); skull.position.set(0, 0.24, 0.18); this.head.add(skull);
            // Cheek ruffs and a brow, so the head is not a bare ball.
            for (const cx of [-0.19, 0.19]) { const c = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), fur); c.scale.set(0.8, 1.1, 0.9); c.position.set(cx, 0.2, 0.14); this.head.add(c); }
            const brow = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), fur); brow.scale.set(1.1, 0.5, 0.7); brow.position.set(0, 0.33, 0.22); this.head.add(brow);
            // A long muzzle that tapers rather than a cone stuck on the face,
            // with a lower jaw and a black nose leather at the end of it.
            const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.13, 0.38, 10), fur); muzzle.rotation.x = Math.PI / 2; muzzle.position.set(0, 0.2, 0.42); this.head.add(muzzle);
            const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), fur); jaw.scale.set(0.95, 0.6, 1.9); jaw.position.set(0, 0.13, 0.4); this.head.add(jaw);
            const nose = new THREE.Mesh(new THREE.SphereGeometry(0.058, 10, 10), this._mat(0x100b09, 1.0, 0.3)); nose.scale.set(1.2, 0.9, 0.85); nose.position.set(0, 0.21, 0.61); this.head.add(nose);
            // Fangs, just visible at the lip line.
            const fangMat = this._mat(0xf0e8d4, 1.0, 0.3);
            for (const fx of [-0.05, 0.05]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.019, 0.075, 5), fangMat); f.position.set(fx, 0.145, 0.53); f.rotation.x = Math.PI; this.head.add(f); }
            // Tall pricked ears with a paler inner cup.
            const innerMat = this._mat(0x6a5748, 1.0, 0.85);
            for (const ex of [-0.11, 0.11]) {
                const ear = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.24, 6), fur); ear.position.set(ex, 0.47, 0.07); ear.rotation.z = ex > 0 ? -0.14 : 0.14; this.head.add(ear);
                const inner = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.16, 6), innerMat); inner.position.set(ex, 0.46, 0.12); inner.rotation.z = ex > 0 ? -0.14 : 0.14; this.head.add(inner);
            }
            this._eye(this.head, -0.1, 0.27, 0.3, 0.045, p.accent, true);
            this._eye(this.head, 0.1, 0.27, 0.3, 0.045, p.accent, true);
            this.head.position.set(0, 1.2, 0.55); this.bodyGroup.add(this.head);

            this.frontLeft  = this._leg(fur, -0.2, 0.4, 0.96, 1.0, 'pad');
            this.frontRight = this._leg(fur, 0.2, 0.4, 0.96, 1.0, 'pad');
            this.rearLeft   = this._leg(fur, -0.2, -0.42, 0.96, 1.0, 'pad');
            this.rearRight  = this._leg(fur, 0.2, -0.42, 0.96, 1.0, 'pad');
            this.tail = this._tail(fur, 1.06, -0.68, 4, 0.85, -0.4);
            this._wireQuad({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Big cat: the shared cuddly feline, nothing added ─────────────────
        _buildBigcat(fur) { this._felineBase(fur, { eyeGlow: true }); }

        // ── Boar: low front-heavy suid with hump, tusks and bristles ─────────
        // A pig has no neck to speak of: the head is set straight into the
        // shoulders, and the whole animal is a wedge that is tallest and
        // heaviest at the front and tapers away to a small rump. Getting that
        // wedge right is what separates a boar from a generic quadruped.
        _buildBoar(fur) {
            const p = this.profile;
            this.body = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 12), fur); torso.scale.set(1.0, 0.88, 1.5); this.body.add(torso);
            // Front-heavy: a deep chest and a high withers hump, then a rump
            // noticeably narrower and lower than the shoulders.
            const chest = new THREE.Mesh(new THREE.SphereGeometry(0.38, 14, 12), fur); chest.scale.set(1.12, 1.05, 0.95); chest.position.set(0, 0.0, 0.36); this.body.add(chest);
            const hump = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 12), fur); hump.scale.set(1.0, 0.9, 1.1); hump.position.set(0, 0.22, 0.34); this.body.add(hump);
            const rump = new THREE.Mesh(new THREE.SphereGeometry(0.29, 12, 12), fur); rump.scale.set(0.9, 0.9, 0.95); rump.position.set(0, -0.06, -0.52); this.body.add(rump);
            const belly = new THREE.Mesh(new THREE.SphereGeometry(0.33, 12, 10), fur); belly.scale.set(0.98, 0.7, 1.25); belly.position.set(0, -0.19, -0.04); this.body.add(belly);
            // The dorsal bristle crest, taller over the shoulders where a boar
            // raises it, thinning out toward the tail.
            const bristle = this._mat(0x140d0a, 1.0, 0.9);
            for (let i = 0; i < 9; i++) {
                const t = i / 8;
                const h = 0.26 - t * 0.16;
                const b = new THREE.Mesh(new THREE.ConeGeometry(0.036, h, 4), bristle);
                b.position.set(0, 0.3 - t * 0.16, 0.5 - i * 0.13); b.rotation.x = -0.25;
                this.body.add(b);
            }
            this.body.position.set(0, 0.9, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            // Almost no neck: a short thick wedge straight into the shoulders.
            this.head.add(this._neck(fur, 0.1, -0.24, 0.22, 0.28, 0));
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.25, 14, 12), fur); skull.scale.set(0.92, 0.92, 1.15); this.head.add(skull);
            const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), fur); cheek.scale.set(1.1, 0.9, 0.9); cheek.position.set(0, -0.05, -0.02); this.head.add(cheek);
            // A long straight snout ending in the flat disc of the rooting
            // nose, with the two nostrils actually cut into it.
            const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.16, 0.34, 12), fur); snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.07, 0.3); this.head.add(snout);
            const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.05, 12), this._mat(0xa87a72, 1.0, 0.45)); disc.rotation.x = Math.PI / 2; disc.position.set(0, -0.07, 0.48); this.head.add(disc);
            for (const nx of [-0.05, 0.05]) { const n = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.03, 8), this._mat(0x2a1c18, 1.0, 0.4)); n.rotation.x = Math.PI / 2; n.position.set(nx, -0.07, 0.51); this.head.add(n); }
            const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), fur); jaw.scale.set(0.95, 0.6, 1.5); jaw.position.set(0, -0.17, 0.24); this.head.add(jaw);
            // Four tusks: the big upward-curving lowers and the smaller uppers
            // that hone against them. One pair alone never reads as a boar.
            const tuskMat = this._mat(0xe8dcc0, 1.0, 0.35);
            for (const tx of [-0.105, 0.105]) {
                const lower = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.3, 6), tuskMat);
                lower.position.set(tx, -0.14, 0.34); lower.rotation.set(-0.95, 0, tx > 0 ? 0.34 : -0.34); this.head.add(lower);
                const upper = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.16, 6), tuskMat);
                upper.position.set(tx * 1.05, -0.04, 0.38); upper.rotation.set(-2.1, 0, tx > 0 ? 0.28 : -0.28); this.head.add(upper);
            }
            // Ears set high and folded forward, with a paler inner surface.
            const innerMat = this._mat(0x9c7060, 1.0, 0.8);
            for (const ex of [-0.17, 0.17]) {
                const ear = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.2, 6), fur);
                ear.position.set(ex, 0.24, -0.01); ear.rotation.set(0.4, 0, ex > 0 ? -0.35 : 0.35); this.head.add(ear);
                const inner = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.13, 6), innerMat);
                inner.position.set(ex, 0.23, 0.04); inner.rotation.set(0.4, 0, ex > 0 ? -0.35 : 0.35); this.head.add(inner);
            }
            this._eye(this.head, -0.15, 0.08, 0.16, 0.038, p.accent, false);
            this._eye(this.head, 0.15, 0.08, 0.16, 0.038, p.accent, false);
            this.head.position.set(0, 0.95, 0.58); this.bodyGroup.add(this.head);

            // Short stout legs, the front pair carrying the weight.
            this.frontLeft  = this._leg(fur, -0.26, 0.38, 0.78, 0.74, 'hoof', 1.15);
            this.frontRight = this._leg(fur, 0.26, 0.38, 0.78, 0.74, 'hoof', 1.15);
            this.rearLeft   = this._leg(fur, -0.24, -0.4, 0.78, 0.78, 'hoof', 1.0);
            this.rearRight  = this._leg(fur, 0.24, -0.4, 0.78, 0.78, 'hoof', 1.0);
            // A curled tail rather than a straight rod.
            this.tail = new THREE.Group();
            let ty = 0, tz = 0, tr = 0.035;
            for (let i = 0; i < 6; i++) {
                const s = new THREE.Mesh(new THREE.SphereGeometry(tr, 6, 4), fur);
                s.position.set(Math.sin(i * 1.15) * 0.07, ty, tz); this.tail.add(s);
                ty += 0.035; tz -= 0.05; tr *= 0.9;
            }
            this.tail.position.set(0, 0.92, -0.6); this.bodyGroup.add(this.tail);
            this._wireQuad({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Rodent: small upright critter, big incisors, round ears, long tail ─
        _buildRodent(fur) {
            const p = this.profile;
            this.body = new THREE.Group();
            const belly = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 12), fur); belly.scale.set(1.0, 1.2, 1.0); this.body.add(belly);
            this.body.position.set(0, 0.66, 0.02); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this.head.add(new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12), fur));
            const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10), fur); muzzle.position.set(0, -0.06, 0.2); this.head.add(muzzle);
            const nose = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), this._mat(p.accent, 1.0, 0.4)); nose.position.set(0, -0.08, 0.32); this.head.add(nose);
            for (const ix of [-0.045, 0.045]) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.03), this._mat(0xfff4d0, 1.0, 0.4)); t.position.set(ix, -0.14, 0.27); this.head.add(t); }
            // Round ears with a pink inner cup, and whiskers: a rodent's face
            // is mostly whiskers, and without them the head is a bare bean.
            const innerMat = this._mat(0xd79a9a, 1.0, 0.75);
            for (const ex of [-0.18, 0.18]) {
                const ear = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), fur); ear.position.set(ex, 0.22, 0); ear.scale.set(1, 1, 0.3); this.head.add(ear);
                const inner = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 10), innerMat); inner.position.set(ex * 0.93, 0.22, 0.035); inner.scale.set(1, 1, 0.22); this.head.add(inner);
            }
            const whiskerMat = this._mat(0xd8d0c2, 0.75, 0.3);
            for (const sx of [-1, 1]) {
                for (let i = 0; i < 3; i++) {
                    const wk = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.002, 0.26, 3), whiskerMat);
                    wk.position.set(sx * 0.19, -0.05 + i * 0.035, 0.25);
                    wk.rotation.set(0.1, 0, sx * (1.15 + i * 0.16));
                    this.head.add(wk);
                }
            }
            this._eye(this.head, -0.12, 0.06, 0.2, 0.05, 0x120c08, false);
            this._eye(this.head, 0.12, 0.06, 0.2, 0.05, 0x120c08, false);
            this.head.position.set(0, 1.08, 0.06); this.bodyGroup.add(this.head);

            // Tiny held-up front paws with fingers, and folded haunch feet.
            this.frontLeft  = this._rodentPaw(fur, -0.15, 0.66, 0.24, 0.08);
            this.frontRight = this._rodentPaw(fur, 0.15, 0.66, 0.24, 0.08);
            this.rearLeft   = this._rodentFoot(fur, -0.22, 0.34, 0.06, 0.12);
            this.rearRight  = this._rodentFoot(fur, 0.22, 0.34, 0.06, 0.12);
            this.tail = this._tail(fur, 0.58, -0.3, 6, 0.86, 0.6);
            this._wireQuad({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // A held-up rodent forepaw: a small pad with four fingers curled in
        // front of the chest, which is the pose everyone pictures for a rat.
        _rodentPaw(mat, x, y, z, r) {
            const g = new THREE.Group();
            const pad = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat); pad.scale.set(0.9, 1.0, 1.1); g.add(pad);
            const nailMat = this._mat(0xe6dccb, 1.0, 0.4);
            for (let i = 0; i < 4; i++) {
                const f = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.17, r * 0.13, r * 0.9, 4), mat);
                f.position.set((i - 1.5) * r * 0.42, -r * 0.35, r * 0.72);
                f.rotation.x = 1.15; g.add(f);
                const n = new THREE.Mesh(new THREE.ConeGeometry(r * 0.11, r * 0.34, 3), nailMat);
                n.position.set((i - 1.5) * r * 0.42, -r * 0.62, r * 1.05);
                n.rotation.x = 1.6; g.add(n);
            }
            g.position.set(x, y, z); this.bodyGroup.add(g); return g;
        }
        // A folded haunch foot: a long sole flat on the ground with toes.
        _rodentFoot(mat, x, y, z, r) {
            const g = new THREE.Group();
            const sole = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat); sole.scale.set(0.8, 0.6, 1.7); g.add(sole);
            for (let i = 0; i < 4; i++) {
                const t = new THREE.Mesh(new THREE.SphereGeometry(r * 0.24, 6, 4), mat);
                t.position.set((i - 1.5) * r * 0.4, -r * 0.14, r * 1.55); g.add(t);
            }
            g.position.set(x, y, z); this.bodyGroup.add(g); return g;
        }

        // ── Parameterised rodent core, reused by the bespoke rodent one-offs ──
        // Builds body+head+paws+tail and wires the quad cascade. Options:
        //   sx/sy/sz body scale · bodyR · bodyY · headR · headY
        //   ears ('round'|'big'|'tuft'|'tiny'|'none') · teeth(false hides) ·
        //   teethLen · teethColor · nose · eye · eyeGlow ·
        //   tail ('long'|'bushy'|'paddle'|'stub') · tailColor
        _rodentBase(fur, o) {
            o = o || {};
            const p = this.profile;
            const quad = !!o.quad; this._quad = quad;
            const br = o.bodyR || 0.34;
            const hr = o.headR || 0.26;
            const sz = o.sz || 1.0, sx = o.sx || 1.0;
            const by = quad ? 0.52 : (o.bodyY != null ? o.bodyY : 0.66);
            const hy = o.headY != null ? o.headY : 1.08;
            this.body = new THREE.Group();
            const belly = new THREE.Mesh(new THREE.SphereGeometry(br, 12, 12), fur);
            if (quad) belly.scale.set(sx, 0.82, sz * 1.7); else belly.scale.set(sx, o.sy || 1.2, sz);
            this.body.add(belly);
            this.body.position.set(0, by, 0.02); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this.head.add(new THREE.Mesh(new THREE.SphereGeometry(hr, 12, 12), fur));
            const muzzle = new THREE.Mesh(new THREE.SphereGeometry(hr * 0.5, 10, 10), fur); muzzle.position.set(0, -0.06, hr * 0.77); this.head.add(muzzle);
            const nose = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), this._mat(o.nose || p.accent, 1.0, 0.4)); nose.position.set(0, -0.08, hr * 1.23); this.head.add(nose);
            if (o.teeth !== false) for (const ix of [-0.045, 0.045]) { const to = new THREE.Mesh(new THREE.BoxGeometry(0.05, o.teethLen || 0.1, 0.03), this._mat(o.teethColor || 0xfff4d0, 1.0, 0.4)); to.position.set(ix, -0.14, hr * 1.04); this.head.add(to); }
            const ear = o.ears || 'round';
            if (ear === 'tuft') {
                for (const ex of [-0.14, 0.14]) { const e = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 6), fur); e.position.set(ex, 0.27, 0); this.head.add(e); }
            } else if (ear !== 'none') {
                const er = ear === 'big' ? 0.17 : (ear === 'tiny' ? 0.06 : 0.12);
                // A paler inner cup, so a round ear is a cup and not a coin.
                const innerMat = this._mat(o.earInner || 0xd79a9a, 1.0, 0.75);
                for (const ex of [-0.18, 0.18]) {
                    const ey = ear === 'big' ? 0.26 : 0.22;
                    const e = new THREE.Mesh(new THREE.SphereGeometry(er, 12, 12), fur); e.position.set(ex, ey, 0); e.scale.set(1, 1, 0.3); this.head.add(e);
                    const inner = new THREE.Mesh(new THREE.SphereGeometry(er * 0.62, 10, 10), innerMat); inner.position.set(ex * 0.93, ey, 0.035); inner.scale.set(1, 1, 0.22); this.head.add(inner);
                }
            }
            // Whiskers. A rodent's face is mostly whiskers; without them the
            // head reads as a bean with eyes stuck on.
            if (o.whiskers !== false) {
                const whiskerMat = this._mat(o.whiskerColor || 0xd8d0c2, 0.75, 0.3);
                for (const sx2 of [-1, 1]) {
                    for (let i = 0; i < 3; i++) {
                        const wk = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.002, hr * 1.0, 3), whiskerMat);
                        wk.position.set(sx2 * hr * 0.73, -0.05 + i * 0.035, hr * 0.96);
                        wk.rotation.set(0.1, 0, sx2 * (1.15 + i * 0.16));
                        this.head.add(wk);
                    }
                }
            }
            this._eye(this.head, -0.12, 0.06, 0.2, 0.05, o.eye || 0x120c08, !!o.eyeGlow);
            this._eye(this.head, 0.12, 0.06, 0.2, 0.05, o.eye || 0x120c08, !!o.eyeGlow);
            if (quad) { this.head.position.set(0, by + 0.04, br * sz * 1.55 + hr * 0.35); this.head.rotation.x = 0.16; }
            else this.head.position.set(0, hy, 0.06);
            this.bodyGroup.add(this.head);

            if (quad) {
                const lz = br * sz * 0.95, lx = br * sx * 0.78 + 0.03, len = by + 0.04;
                this.frontLeft  = this._leg(fur, -lx, lz, by, len, 'paw');
                this.frontRight = this._leg(fur, lx, lz, by, len, 'paw');
                this.rearLeft   = this._leg(fur, -lx, -lz, by, len, 'paw');
                this.rearRight  = this._leg(fur, lx, -lz, by, len, 'paw');
            } else {
                this.frontLeft  = this._rodentPaw(fur, -0.15, by, 0.24, 0.08);
                this.frontRight = this._rodentPaw(fur, 0.15, by, 0.24, 0.08);
                this.rearLeft   = this._rodentFoot(fur, -0.22, 0.34, 0.06, 0.12);
                this.rearRight  = this._rodentFoot(fur, 0.22, 0.34, 0.06, 0.12);
            }

            const tt = o.tail || 'long';
            const tBaseY = quad ? by : 0.5, tBaseZ = quad ? -(br * sz * 1.5) : -0.34;
            if (tt === 'paddle') {
                this.tail = new THREE.Group();
                const pad = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.5, 0.07), this._mat(o.tailColor || 0x3a2a20, 1.0, 0.6));
                pad.position.set(0, -0.18, 0); this.tail.add(pad);
                this.tail.position.set(0, tBaseY, tBaseZ); this.tail.rotation.x = quad ? 0.9 : 0.55; this.bodyGroup.add(this.tail);
            } else if (tt === 'bushy') {
                this.tail = new THREE.Group();
                let ty = 0, tz = 0, r = 0.17;
                for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), fur); s.position.set(0, ty, tz); this.tail.add(s); ty += 0.17; tz -= 0.04; r *= 0.95; }
                this.tail.position.set(0, quad ? by + 0.06 : 0.52, tBaseZ); this.tail.rotation.x = -0.35; this.bodyGroup.add(this.tail);
            } else if (tt === 'stub') {
                this.tail = this._nub(fur, 0, quad ? by : 0.52, quad ? tBaseZ : -0.3, 0.09);
            } else { // 'long'
                this.tail = this._tail(fur, quad ? by + 0.02 : 0.58, quad ? tBaseZ : -0.3, 6, 0.86, quad ? -0.15 : 0.6);
            }
            this._wireQuad({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }
        // Spine-following Y for back decoration: upright vs quad layouts.
        _backY() { return this._quad ? 0.80 : 0.86; }
        // Attach a decoration mesh so it fades on death and vanishes if the core is lost.
        _deco(mesh) { this.bodyGroup.add(mesh); if (this._cascadeRules && this._cascadeRules[0]) this._cascadeRules[0].hide.push(mesh); return mesh; }

        // ── Armored Beaver: iron-pelt river rodent, paddle tail, back plates ──
        _buildArmoredbeaver(fur) {
            const p = this.profile;
            this._rodentBase(fur, { sx: 1.15, sy: 1.1, sz: 1.2, bodyR: 0.38, headR: 0.27, teethColor: 0xffae3a, teethLen: 0.14, tail: 'paddle', tailColor: 0x4a3a2a });
            const plate = this._mat(p.accent, 1.0, 0.35);
            for (let i = 0; i < 3; i++) { const pl = new THREE.Mesh(new THREE.SphereGeometry(0.22 - i * 0.02, 10, 8), plate); pl.scale.set(1.1, 0.4, 0.9); pl.position.set(0, 0.92, 0.2 - i * 0.22); this._deco(pl); }
        }
        // ── Wasteland Beaver: apocalypse survivor with scrap plating, paddle ──
        _buildWastelandbeaver(fur) {
            this._rodentBase(fur, { sx: 1.1, sy: 1.05, sz: 1.15, bodyR: 0.37, teethColor: 0xd8c890, teethLen: 0.13, tail: 'paddle', tailColor: 0x3a342a });
            const scrap = this._mat(0x6a6258, 1.0, 0.5);
            const slab = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.5), scrap); slab.position.set(0, 0.95, 0.0); slab.rotation.x = 0.12; this._deco(slab);
            const rust = this._mat(0x8a5a32, 1.0, 0.85);
            const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.34, 8), rust); pipe.position.set(0.18, 1.1, -0.05); pipe.rotation.z = 0.4; this._deco(pipe);
        }
        // ── Armored Porcupine: curls into a spinning ball of blade-scales ────
        _buildArmoredporcupine(fur) {
            const p = this.profile;
            this._rodentBase(fur, { sx: 1.2, sy: 1.05, sz: 1.2, bodyR: 0.42, headR: 0.22, headY: 0.92, ears: 'tiny', tail: 'stub' });
            const blade = this._mat(p.accent, 1.0, 0.3);
            for (let i = 0; i < 26; i++) {
                const a = (i / 26) * Math.PI * 2, ring = 0.2 + (i % 3) * 0.18;
                const q = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.3, 4), blade);
                const dx = Math.cos(a) * 0.42, dz = Math.sin(a) * 0.42 - 0.06, dy = 0.66 + Math.sin(ring) * 0.18;
                q.position.set(dx, dy, dz); q.lookAt(dx * 3, dy + (dy - 0.66) * 2, dz * 3); q.rotateX(Math.PI / 2); this._deco(q);
            }
        }
        // ── Spikey Porcupine: stout rodent with a back full of quills ────────
        _buildSpikeyporcupine(fur) {
            const p = this.profile;
            this._rodentBase(fur, { sx: 1.1, sy: 1.0, sz: 1.25, bodyR: 0.36, teethColor: 0xffd27a, tail: 'stub' });
            const quill = this._mat(p.accent, 1.0, 0.45);
            for (let i = 0; i < 16; i++) {
                const row = Math.floor(i / 4), col = i % 4;
                const q = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.42, 5), quill);
                q.position.set(-0.18 + col * 0.12, 0.92, 0.24 - row * 0.2); q.rotation.x = -0.6; this._deco(q);
            }
        }
        // ── Caffeinated Squirrel: jittery, wide glowing eyes, espresso cup ───
        _buildCaffeinatedsquirrel(fur) {
            this._rodentBase(fur, { sx: 0.95, sy: 1.25, sz: 0.95, bodyR: 0.3, ears: 'tuft', tail: 'bushy', eye: 0xffe14a, eyeGlow: true, teethColor: 0xffffff });
            const cup = this._mat(0xf0ece0, 1.0, 0.4);
            const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.12, 10), cup); mug.position.set(0, 0.7, 0.34); this._deco(mug);
            const coffee = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 10), this._mat(0x2a1608, 1.0, 0.3)); coffee.position.set(0, 0.77, 0.34); this._deco(coffee);
        }
        // ── Squirrel: nimble tree-rodent clutching a nut, big bushy tail ─────
        _buildWoodsquirrel(fur) {
            this._rodentBase(fur, { sx: 0.95, sy: 1.25, sz: 0.95, bodyR: 0.3, ears: 'tuft', tail: 'bushy', teethColor: 0xffd27a });
            const nut = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), this._mat(0x6a4422, 1.0, 0.7)); nut.scale.y = 1.2; nut.position.set(0, 0.66, 0.34); this._deco(nut);
        }
        // ── Field Mouse: tiny, oversized round ears, long thin tail ──────────
        _buildFieldmouse(fur) {
            this._rodentBase(fur, { sx: 0.95, sy: 1.1, sz: 1.05, bodyR: 0.28, headR: 0.22, headY: 1.0, ears: 'big', teethLen: 0.07, tail: 'long' });
        }
        // ── Forest Rat: standard woodland rat, long tail (quadrupedal) ───────
        _buildForestrat(fur) {
            this._rodentBase(fur, { quad: true, sx: 1.0, sy: 1.05, sz: 1.2, bodyR: 0.32, tail: 'long' });
        }
        // ── Giant Rat: oversized vermin, prominent incisors (quadrupedal) ────
        _buildGiantrat(fur) {
            this._rodentBase(fur, { quad: true, sx: 1.15, sy: 1.05, sz: 1.3, bodyR: 0.4, headR: 0.3, teethLen: 0.14, teethColor: 0xf0e6b0, tail: 'long' });
        }
        // ── Sewer Rat: grimy scavenger with filth clumps on its back ─────────
        _buildSewerrat(fur) {
            this._rodentBase(fur, { quad: true, sx: 1.0, sy: 1.0, sz: 1.25, bodyR: 0.32, tail: 'long' });
            const muck = this._mat(0x2e2a1c, 1.0, 0.95);
            for (let i = 0; i < 5; i++) { const c = new THREE.Mesh(new THREE.SphereGeometry(0.06 + this.idRand() * 0.03, 7, 6), muck); c.position.set(-0.12 + (i % 2) * 0.24, this._backY(), 0.42 - i * 0.2); this._deco(c); }
        }
        // ── Swamp Rat: buff, bristled marsh rodent ───────────────────────────
        _buildSwamprat(fur) {
            const p = this.profile;
            this._rodentBase(fur, { quad: true, sx: 1.25, sy: 1.1, sz: 1.25, bodyR: 0.37, headR: 0.28, teethColor: 0xc8d27a, tail: 'long' });
            const bristle = this._mat(p.accent, 1.0, 0.5);
            for (let i = 0; i < 12; i++) { const b = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.2, 4), bristle); b.position.set(-0.15 + (i % 4) * 0.1, this._backY(), 0.42 - Math.floor(i / 4) * 0.3); b.rotation.x = -0.5; this._deco(b); }
        }
        // ── Plaguebro Rattus: bloated sewer king, crown, sickly pustules ─────
        _buildPlaguerattus(fur) {
            const p = this.profile;
            this._rodentBase(fur, { quad: true, sx: 1.4, sy: 1.3, sz: 1.4, bodyR: 0.44, headR: 0.32, teethLen: 0.15, teethColor: 0xc8d27a, tail: 'long' });
            const pus = this._mat(p.accent, 0.92, 0.4, p.accent);
            for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.06 + this.idRand() * 0.04, 8, 8), pus); b.position.set(-0.22 + (i % 3) * 0.22, this._backY() - 0.04, 0.34 - Math.floor(i / 3) * 0.42); this._deco(b); }
            const gold = this._mat(0xd8b23a, 1.0, 0.3, 0x4a3a08);
            const band = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 6, 16), gold); band.rotation.x = Math.PI / 2; band.position.set(0, 0.34, 0);
            this.head.add(band);
            for (let i = 0; i < 5; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 5), gold); const a = (i / 5) * Math.PI * 2; sp.position.set(Math.cos(a) * 0.2, 0.06, Math.sin(a) * 0.2); band.add(sp); }
        }
        // ── Rat King: tangle of rats fused at the tails into one mass ────────
        _buildRatking(fur) {
            const p = this.profile;
            this._rodentBase(fur, { quad: true, sx: 1.5, sy: 1.2, sz: 1.5, bodyR: 0.44, headR: 0.28, teethLen: 0.13, tail: 'long' });
            // Extra rat heads sprouting from the tangled mass.
            this._extraHeads = [];
            const offs = this._quad
                ? [[-0.38, 0.66, 0.2, -0.6], [0.4, 0.7, -0.05, 0.6], [-0.05, 0.92, -0.35, Math.PI]]
                : [[-0.34, 1.0, 0.18, -0.5], [0.36, 1.04, 0.1, 0.6], [-0.12, 1.32, -0.16, 0.0]];
            for (const [x, y, z, ry] of offs) {
                const h = new THREE.Group();
                h.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), fur));
                const mz = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), fur); mz.position.set(0, -0.05, 0.15); h.add(mz);
                for (const ex of [-0.14, 0.14]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), fur); e.position.set(ex, 0.17, 0); e.scale.set(1, 1, 0.3); h.add(e); }
                this._eye(h, -0.09, 0.04, 0.16, 0.04, p.accent, true); this._eye(h, 0.09, 0.04, 0.16, 0.04, p.accent, true);
                h.position.set(x, y, z); h.rotation.y = ry; this._deco(h); this._extraHeads.push(h);
            }
            // Knotted extra tails trailing behind.
            for (const tx of [-0.18, 0.18]) { const tl = this._tail(fur, this._quad ? 0.5 : 0.56, this._quad ? -0.7 : -0.32, 5, 0.85, this._quad ? -0.1 : 0.7); tl.position.x = tx; tl.rotation.z = tx > 0 ? -0.4 : 0.4; if (this._cascadeRules && this._cascadeRules[0]) this._cascadeRules[0].hide.push(tl); }
        }
        // ── Frost Raccoon: ringed tail, mask, icicle teeth (quadrupedal) ─────
        _buildFrostraccoon(fur) {
            const p = this.profile;
            this._rodentBase(fur, { quad: true, sx: 1.1, sy: 1.05, sz: 1.2, bodyR: 0.34, headR: 0.28, teeth: false, tail: 'long' });
            // Bandit mask band across the eyes.
            const mask = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.18), this._mat(0x222831, 1.0, 0.5)); mask.position.set(0, 0.06, 0.18); this.head.add(mask);
            // Icicle teeth.
            const ice = this._mat(p.accent, 0.85, 0.2, p.accent);
            for (const ix of [-0.06, 0.06]) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 5), ice); t.position.set(ix, -0.18, 0.27); t.rotation.x = Math.PI; this.head.add(t); }
            // Ringed tail banding.
            if (this.tail) this.tail.children.forEach((s, i) => { if (i % 2 === 1) s.material = this._mat(0x2a3038, 1.0, 0.7); });
        }
        // ── Night Raccoon: dark bandit-masked moonlight scavenger (quad) ─────
        _buildNightraccoon(fur) {
            this._rodentBase(fur, { quad: true, sx: 1.1, sy: 1.05, sz: 1.2, bodyR: 0.34, headR: 0.28, eye: 0xffe14a, eyeGlow: true, teethColor: 0xf0e6c0, tail: 'long' });
            const mask = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.13, 0.18), this._mat(0x14161c, 1.0, 0.5)); mask.position.set(0, 0.06, 0.18); this.head.add(mask);
            if (this.tail) this.tail.children.forEach((s, i) => { if (i % 2 === 1) s.material = this._mat(0xe8e8ee, 1.0, 0.7); });
        }
        // ── Mole: near-blind burrower, pink snout, broad digging claws ───────
        _buildMolerodent(fur) {
            const p = this.profile;
            this._rodentBase(fur, { sx: 1.0, sy: 0.95, sz: 1.3, bodyR: 0.32, headR: 0.24, headY: 0.96, ears: 'none', teeth: false, nose: p.accent, eye: 0x2a1410, tail: 'stub' });
            // Pink star snout.
            const snout = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), this._mat(p.accent, 1.0, 0.4)); snout.scale.z = 0.6; snout.position.set(0, -0.04, 0.28); this.head.add(snout);
            this._digClaws(0.78);
        }
        // ── Tunneling Mole: bigger feral digger that bursts from below ───────
        _buildTunnelingmole(fur) {
            const p = this.profile;
            this._rodentBase(fur, { sx: 1.15, sy: 1.0, sz: 1.4, bodyR: 0.4, headR: 0.3, headY: 1.0, ears: 'none', teethLen: 0.13, nose: p.accent, eye: 0x2a1410, tail: 'stub' });
            const snout = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), this._mat(p.accent, 1.0, 0.4)); snout.scale.z = 0.6; snout.position.set(0, -0.05, 0.32); this.head.add(snout);
            this._digClaws(0.92);
            // Dirt mound kicked up around the base.
            // A ring of turned earth the feet stand in, clods heaped on it.
            const dirt = this._mat(0x4a3c2c, 1.0, 1.0);
            const mound = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.09, 5, 10), dirt); mound.rotation.x = Math.PI / 2; mound.scale.z = 0.7; mound.position.set(0, 0.28, 0.02); this._deco(mound);
            for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const c = new THREE.Mesh(new THREE.SphereGeometry(0.1, 7, 6), dirt); c.scale.y = 0.55; c.position.set(Math.cos(a) * 0.3, 0.31, 0.02 + Math.sin(a) * 0.3); this._deco(c); }
        }
        // Big flat fan claws replacing the front paws (mole diggers).
        _digClaws(yPos) {
            const claw = this._mat(0xe8dcc0, 1.0, 0.4);
            for (const x of [-0.18, 0.18]) {
                const hand = new THREE.Group();
                for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.2, 5), claw); c.position.set((i - 1) * 0.06, 0, 0.06); c.rotation.x = Math.PI / 2 + 0.3; hand.add(c); }
                hand.position.set(x, yPos - 0.2, 0.28); this._deco(hand);
            }
        }
        // ── Ice Lemming: round suicidal critter, ice shards, glowing core ────
        _buildIcelemming(fur) {
            const p = this.profile;
            this._rodentBase(fur, { sx: 1.05, sy: 1.0, sz: 1.0, bodyR: 0.34, headR: 0.24, ears: 'round', teethLen: 0.07, eye: 0x66ccff, eyeGlow: true, tail: 'stub' });
            const ice = this._mat(p.accent, 0.8, 0.15, p.accent);
            for (let i = 0; i < 10; i++) {
                const a = (i / 10) * Math.PI * 2, r = 0.34;
                const sh = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22, 4), ice);
                const dx = Math.cos(a) * r, dz = Math.sin(a) * r - 0.04, dy = 0.66 + (i % 2) * 0.16;
                sh.position.set(dx, dy, dz); sh.lookAt(dx * 3, dy, dz * 3); sh.rotateX(Math.PI / 2); this._deco(sh);
            }
        }

        // ── Ungulate: tall grazer with hooves and horns OR antlers ───────────
        _buildUngulate(fur) {
            const p = this.profile;
            this.body = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.26, 1.0, 14), fur); torso.rotation.x = Math.PI / 2; this.body.add(torso);
            // A grazer carries a deep barrel of a ribcage and a high croup over
            // the hips, with the belly slung between them.
            const chest = new THREE.Mesh(new THREE.SphereGeometry(0.31, 14, 12), fur); chest.scale.set(0.95, 1.15, 1.0); chest.position.set(0, -0.02, 0.44); this.body.add(chest);
            const barrel = new THREE.Mesh(new THREE.SphereGeometry(0.29, 14, 12), fur); barrel.scale.set(1.0, 1.05, 1.3); barrel.position.set(0, -0.06, 0.0); this.body.add(barrel);
            const croup = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 12), fur); croup.scale.set(1.05, 1.0, 0.9); croup.position.set(0, 0.05, -0.46); this.body.add(croup);
            const withers = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), fur); withers.scale.set(0.8, 0.8, 1.2); withers.position.set(0, 0.22, 0.34); this.body.add(withers);
            this.body.position.set(0, 1.15, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.21, 0.58, 12), fur); neck.rotation.x = 0.4; neck.position.set(0, 0.2, 0.0); this.head.add(neck);
            // The dewlap under the throat, and a crest of mane along the top of
            // the neck: a bare cylinder read as a length of pipe.
            const dewlap = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), fur); dewlap.scale.set(0.75, 1.5, 0.75); dewlap.position.set(0, 0.16, 0.16); this.head.add(dewlap);
            for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 5), fur); m.position.set(0, 0.08 + i * 0.11, -0.16 + i * 0.05); m.rotation.x = -0.5; this.head.add(m); }
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 12), fur); skull.scale.set(0.85, 0.9, 1.25); skull.position.set(0, 0.5, 0.18); this.head.add(skull);
            // A long tapering muzzle with a broad grazing lip and dark nostrils.
            const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.13, 0.2, 10), fur); bridge.rotation.x = Math.PI / 2; bridge.position.set(0, 0.48, 0.32); this.head.add(bridge);
            const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.09, 0.16, 10), fur); muzzle.rotation.x = Math.PI / 2; muzzle.position.set(0, 0.45, 0.47); this.head.add(muzzle);
            const lip = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), this._mat(0x2b211c, 1.0, 0.5)); lip.scale.set(1.05, 0.8, 0.5); lip.position.set(0, 0.44, 0.54); this.head.add(lip);
            for (const nx of [-0.045, 0.045]) { const n = new THREE.Mesh(new THREE.SphereGeometry(0.022, 5, 4), this._mat(0x0d0908, 1.0, 0.4)); n.position.set(nx, 0.47, 0.55); this.head.add(n); }
            const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), fur); jaw.scale.set(0.9, 0.7, 1.5); jaw.position.set(0, 0.39, 0.32); this.head.add(jaw);
            // Big mobile ears, cupped and swept out to the sides.
            const innerMat = this._mat(0x8a7360, 1.0, 0.85);
            for (const ex of [-0.11, 0.11]) {
                const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 6), fur); ear.position.set(ex, 0.62, 0.05); ear.rotation.set(0.2, 0, ex > 0 ? -0.7 : 0.7); this.head.add(ear);
                const inner = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.13, 6), innerMat); inner.position.set(ex * 1.15, 0.62, 0.08); inner.rotation.set(0.2, 0, ex > 0 ? -0.7 : 0.7); this.head.add(inner);
            }
            const boneMat = this._mat(0xe8dcc0, 1.0, 0.5);
            if (this.idRand() < 0.5) { // curved horns
                for (const hx of [-0.1, 0.1]) { const h = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.03, 6, 12, Math.PI * 1.1), boneMat); h.position.set(hx, 0.66, 0.08); h.rotation.set(0.4, hx > 0 ? -0.4 : 0.4, hx > 0 ? 0.6 : -0.6); this.head.add(h); }
            } else { // branching antlers
                for (const ax of [-0.1, 0.1]) {
                    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.42, 6), boneMat); beam.position.set(ax, 0.78, 0.04); beam.rotation.z = ax > 0 ? -0.4 : 0.4; this.head.add(beam);
                    for (let t = 0; t < 2; t++) { const tine = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.2, 5), boneMat); tine.position.set(ax + (ax > 0 ? 0.1 : -0.1) * (t + 1), 0.84 + t * 0.1, 0.04); tine.rotation.z = ax > 0 ? -1.0 : 1.0; this.head.add(tine); }
                }
            }
            this._eye(this.head, -0.1, 0.5, 0.28, 0.04, 0x120c08, false);
            this._eye(this.head, 0.1, 0.5, 0.28, 0.04, 0x120c08, false);
            this.head.position.set(0, 1.25, 0.5); this.bodyGroup.add(this.head);

            this.frontLeft  = this._leg(fur, -0.22, 0.42, 1.05, 1.1, 'hoof');
            this.frontRight = this._leg(fur, 0.22, 0.42, 1.05, 1.1, 'hoof');
            this.rearLeft   = this._leg(fur, -0.22, -0.44, 1.05, 1.1, 'hoof');
            this.rearRight  = this._leg(fur, 0.22, -0.44, 1.05, 1.1, 'hoof');
            this.tail = this._tail(fur, 1.18, -0.6, 3, 0.7, -0.5);
            this._wireQuad({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Ape: upright primate with long knuckling arms ────────────────────
        _buildApe(fur) {
            const p = this.profile;
            // An ape is a triangle: enormous across the shoulders, narrow at
            // the hips. One egg for a torso gave it neither, so the barrel is
            // built from a chest, a gut and a pair of deltoid masses.
            this.body = new THREE.Group();
            const trunk = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 14), fur); trunk.scale.set(1.0, 1.2, 0.85); this.body.add(trunk);
            const chest = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 12), fur); chest.scale.set(1.2, 0.8, 0.85); chest.position.set(0, 0.28, 0.04); this.body.add(chest);
            for (const sx of [-0.4, 0.4]) { const delt = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), fur); delt.position.set(sx, 0.34, 0.02); this.body.add(delt); }
            const gut = new THREE.Mesh(new THREE.SphereGeometry(0.38, 14, 12), fur); gut.scale.set(0.95, 0.85, 0.9); gut.position.set(0, -0.3, 0.03); this.body.add(gut);
            const pecMat = this._mat(p.accent, 1.0, 0.7);
            for (const px of [-0.17, 0.17]) { const pec = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), pecMat); pec.scale.set(1.0, 0.7, 0.4); pec.position.set(px, 0.24, 0.36); this.body.add(pec); }
            this.body.position.set(0, 1.15, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            // The head is sunk between the shoulders on almost no neck, which
            // is most of what makes an ape read as an ape.
            this.head.add(this._neck(fur, 0.24, 0.02, 0.19, 0.24, 0));
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 14), fur); this.head.add(skull);
            // A sagittal crest along the top of the skull.
            const crest = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), fur); crest.scale.set(0.5, 1.0, 1.9); crest.position.set(0, 0.24, -0.02); this.head.add(crest);
            const face = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 12), this._mat(p.accent, 1.0, 0.6)); face.scale.set(1, 1.1, 0.6); face.position.set(0, -0.04, 0.18); this.head.add(face);
            const brow = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.1), fur); brow.position.set(0, 0.08, 0.22); this.head.add(brow);
            // A prognathic muzzle with nostrils and a heavy jaw.
            const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), this._mat(p.accent, 1.0, 0.6)); muzzle.scale.set(1.0, 0.75, 0.85); muzzle.position.set(0, -0.11, 0.26); this.head.add(muzzle);
            for (const nx of [-0.04, 0.04]) { const n = new THREE.Mesh(new THREE.SphereGeometry(0.021, 5, 4), this._mat(0x120c08, 1.0, 0.4)); n.position.set(nx, -0.08, 0.35); this.head.add(n); }
            const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), fur); jaw.scale.set(1.0, 0.65, 0.9); jaw.position.set(0, -0.2, 0.14); this.head.add(jaw);
            for (const ex of [-0.26, 0.26]) { const ear = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), fur); ear.scale.set(0.35, 1.0, 0.9); ear.position.set(ex, 0.02, 0.0); this.head.add(ear); }
            this._eye(this.head, -0.08, 0.0, 0.23, 0.04, 0x120c08, false);
            this._eye(this.head, 0.08, 0.0, 0.23, 0.04, 0x120c08, false);
            this.head.position.set(0, 1.85, 0.05); this.bodyGroup.add(this.head);

            this.leftArm = this._apeArm(fur, -1);
            this.rightArm = this._apeArm(fur, 1);
            this.leftLeg = this._apeLeg(fur, -0.22);
            this.rightLeg = this._apeLeg(fur, 0.22);
            this._wireBiped({ body: this.body, head: this.head, la: this.leftArm, ra: this.rightArm, ll: this.leftLeg, rl: this.rightLeg });
        }
        _apeArm(mat, side) {
            const g = new THREE.Group();
            const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), mat); g.add(shoulder);
            const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.6, 10), mat); upper.position.y = -0.3; g.add(upper);
            const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 8), mat); elbow.position.y = -0.58; g.add(elbow);
            const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.075, 0.55, 10), mat); fore.position.y = -0.85; g.add(fore);
            // A knuckling hand: a flat back, four folded fingers taking the
            // weight, and a thumb off to the inside.
            const hand = new THREE.Group();
            const back = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), mat); back.scale.set(1.0, 0.75, 1.15); hand.add(back);
            for (let i = 0; i < 4; i++) {
                const k = new THREE.Mesh(new THREE.SphereGeometry(0.043, 6, 5), mat);
                k.position.set((i - 1.5) * 0.055, -0.055, 0.1); hand.add(k);
            }
            const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), mat);
            thumb.position.set(-side * 0.11, -0.02, 0.03); hand.add(thumb);
            hand.position.y = -1.15; g.add(hand);
            g.position.set(side * 0.5, 1.5, 0.05); g.rotation.z = side * 0.12; g._side = side; this.bodyGroup.add(g); return g;
        }
        _apeLeg(mat, x) {
            const g = new THREE.Group();
            const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.5, 10), mat); thigh.position.y = -0.25; g.add(thigh);
            const knee = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), mat); knee.position.y = -0.48; g.add(knee);
            const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.4, 10), mat); shin.position.y = -0.68; g.add(shin);
            // A grasping foot: a sole, four toes and an opposed big toe.
            const foot = new THREE.Group();
            const sole = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), mat); sole.scale.set(1.0, 0.55, 1.5); foot.add(sole);
            for (let i = 0; i < 4; i++) {
                const t = new THREE.Mesh(new THREE.SphereGeometry(0.033, 6, 5), mat);
                t.position.set((i - 1.5) * 0.048, -0.01, 0.15); foot.add(t);
            }
            const big = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), mat);
            big.position.set(x > 0 ? -0.1 : 0.1, -0.01, 0.05); foot.add(big);
            foot.position.set(0, -0.9, 0.06); g.add(foot);
            g.position.set(x, 0.78, 0); this.bodyGroup.add(g); return g;
        }

        //=====================================================================
        // BESPOKE SPLITS: parametrised cores reused across similar members.
        //=====================================================================

        // ── Canid core: lean dog body. Options control the silhouette ────────
        //   sizeBody · slope (rump lower than shoulders) · ear ('prick'|'round'|'bat')
        //   tail ('bush'|'plume'|'thin') · hackles (spine cones) · eyeGlow · legLen
        _canidBase(fur, o) {
            o = o || {};
            const p = this.profile;
            const b = o.sizeBody || 1.0;
            this.body = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.24 * b, 0.24 * b, 1.05 * b, 12), fur); torso.rotation.x = Math.PI / 2; this.body.add(torso);
            const chest = new THREE.Mesh(new THREE.SphereGeometry(0.28 * b, 12, 12), fur); chest.position.set(0, (o.slope || 0) * 0.12, 0.48 * b); this.body.add(chest);
            const rump = new THREE.Mesh(new THREE.SphereGeometry(0.25 * b, 12, 12), fur); rump.position.set(0, -(o.slope || 0) * 0.1, -0.52 * b); this.body.add(rump);
            if (o.hackles) for (let i = 0; i < 5; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 5), o.hackleMat || fur); sp.position.set(0, 0.26 * b, 0.4 - i * 0.2); this.body.add(sp); }
            this.body.position.set(0, 1.05, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * b, 0.2 * b, 0.4, 10), fur); neck.rotation.x = 0.7; neck.position.set(0, 0.02, -0.06); this.head.add(neck);
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2 * b, 12, 12), fur); skull.scale.set(0.9, 0.85, 1.1); skull.position.set(0, 0.24, 0.18); this.head.add(skull);
            const snoutLen = o.snout || 0.42;
            const snout = new THREE.Mesh(new THREE.ConeGeometry(0.1 * b, snoutLen, 8), fur); snout.rotation.x = Math.PI / 2; snout.position.set(0, 0.2, 0.44); this.head.add(snout);
            const ear = o.ear || 'prick';
            for (const ex of [-0.1, 0.1]) {
                let e;
                if (ear === 'round') { e = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), fur); e.scale.z = 0.4; }
                else if (ear === 'bat') { e = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 5), fur); }
                else { e = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 5), fur); }
                e.position.set(ex, 0.46, 0.08); this.head.add(e);
            }
            this._eye(this.head, -0.1, 0.27, 0.3, 0.045, p.accent, o.eyeGlow !== false);
            this._eye(this.head, 0.1, 0.27, 0.3, 0.045, p.accent, o.eyeGlow !== false);
            this.head.position.set(0, 1.2, 0.55); this.bodyGroup.add(this.head);

            const len = o.legLen || 1.0;
            this.frontLeft  = this._leg(fur, -0.2, 0.4, 0.96, len, 'pad');
            this.frontRight = this._leg(fur, 0.2, 0.4, 0.96, len, 'pad');
            this.rearLeft   = this._leg(fur, -0.2, -0.42, 0.96, len, 'pad');
            this.rearRight  = this._leg(fur, 0.2, -0.42, 0.96, len, 'pad');
            const tt = o.tail || 'bush';
            if (tt === 'bush') this.tail = this._tail(fur, 1.06, -0.68, 5, 0.9, -0.5);
            else if (tt === 'plume') this.tail = this._tail(fur, 1.1, -0.68, 6, 0.92, -0.9);
            else this.tail = this._tail(fur, 1.02, -0.66, 4, 0.8, -0.3);
            this._wireQuad({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Feline core: a soft, round-headed cat ────────────────────────────
        // Cats are built for charm, not for anatomy: a plump barrel body, an
        // oversized round skull on a short muzzle, big catchlit eyes, pink
        // inner ears and toe beans, whiskers, and a fluffy upright tail. Every
        // feline in the file goes through here so none of them reads as a
        // cylinder with cones stuck on it.
        //   sizeBody · slim (<1 = gaunt) · mane · fangs (saber) · ear
        //   ('tuft'|'round') · eyeGlow · legLen · tail ('bob') · ribs · scar
        _felineBase(fur, o) {
            o = o || {};
            const p = this.profile;
            const b = o.sizeBody || 1.0;
            const sl = o.slim || 1.0;
            // Cats sit low and chunky, so every feline gives up a little leg
            // (CROUCH) against the old lanky build. Shorter legs crouch the
            // whole animal rather than leaving it hovering: everything above
            // the hips drops by exactly what the legs lost, and the bespoke
            // builders offset their own trimmings by the same _catDrop.
            const CROUCH = 0.87;
            const len = (o.legLen || 0.85) * CROUCH;
            const drop = this._catDrop = Math.max(0, 0.85 - len) * 0.95;

            this.body = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.SphereGeometry(0.3 * b, 16, 12), fur);
            torso.scale.set(0.94 * sl, 0.94, 2.0); this.body.add(torso);
            const haunch = new THREE.Mesh(new THREE.SphereGeometry(0.31 * b, 14, 12), fur);
            haunch.scale.set(1.0 * sl, 1.0, 0.94); haunch.position.set(0, 0.05, -0.48 * b); this.body.add(haunch);
            const chest = new THREE.Mesh(new THREE.SphereGeometry(0.27 * b, 14, 12), fur);
            chest.scale.set(1.0 * sl, 1.0, 0.95); chest.position.set(0, -0.02, 0.47 * b); this.body.add(chest);
            // Cream bib down the throat.
            const bib = new THREE.Mesh(new THREE.SphereGeometry(0.17 * b, 12, 10), this._mat(o.bibColor || 0xf2e6cf, 1.0, 0.9));
            bib.scale.set(0.78, 1.1, 0.55); bib.position.set(0, -0.14 * b, 0.58 * b); this.body.add(bib);
            if (o.ribs) for (let i = 0; i < 4; i++) {
                const rib = new THREE.Mesh(new THREE.TorusGeometry(0.2 * b * sl, 0.02, 6, 14), this._mat(o.ribColor || 0xd8c8a0, 1.0, 0.5));
                rib.rotation.y = Math.PI / 2; rib.position.set(0, 0, 0.3 * b - i * 0.16); this.body.add(rib);
            }
            if (o.scar) { const scar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.3), this._mat(0xc04030, 1.0, 0.5)); scar.position.set(0.2 * b, 0.1, 0.1); scar.rotation.z = 0.5; this.body.add(scar); }
            // Neck: carries the head clear of the shoulders so the face is not
            // half-buried in the chest. Stays with the body when the head goes.
            const neck = new THREE.Mesh(new THREE.SphereGeometry(0.17 * b, 12, 10), fur);
            neck.scale.set(0.95, 1.05, 0.9); neck.position.set(0, 0.17 * b, 0.55 * b); this.body.add(neck);
            this.body.position.set(0, 0.95 - drop, 0); this.bodyGroup.add(this.body);

            // Head: big, round and set high, the way a kitten's is.
            const hr = 0.24 * b;
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(hr, 16, 14), fur); skull.scale.set(1.06, 1.0, 0.94); this.head.add(skull);
            for (const ex of [-1, 1]) {
                const cheek = new THREE.Mesh(new THREE.SphereGeometry(hr * 0.44, 12, 10), fur);
                cheek.scale.set(0.82, 0.9, 0.68); cheek.position.set(ex * hr * 0.8, -hr * 0.28, hr * 0.34); this.head.add(cheek);
            }
            const muzzle = new THREE.Mesh(new THREE.SphereGeometry(hr * 0.5, 12, 10), fur);
            muzzle.scale.set(1.06, 0.72, 0.82); muzzle.position.set(0, -hr * 0.4, hr * 0.72); this.head.add(muzzle);
            const nose = new THREE.Mesh(new THREE.SphereGeometry(hr * 0.15, 8, 8), this._mat(o.noseColor || 0xe98aa0, 1.0, 0.35));
            nose.scale.set(1.25, 0.85, 0.9); nose.position.set(0, -hr * 0.28, hr * 1.02); this.head.add(nose);

            // Ears are groups (shell + pink inner + optional lynx tuft) so the
            // whole ear can be twitched, or notched, as one thing.
            const earW = o.ear === 'round' ? hr * 0.52 : hr * 0.44;
            const earH = o.ear === 'round' ? hr * 0.7 : hr * 1.05;
            this._catEars = [];
            for (const ex of [-1, 1]) {
                const g = new THREE.Group();
                g.add(new THREE.Mesh(new THREE.ConeGeometry(earW, earH, 6), fur));
                const inner = new THREE.Mesh(new THREE.ConeGeometry(earW * 0.6, earH * 0.72, 6), this._mat(o.innerEar || 0xf0a8b8, 1.0, 0.6));
                inner.position.set(0, -earH * 0.06, hr * 0.1); g.add(inner);
                if (o.ear === 'tuft') { const t = new THREE.Mesh(new THREE.ConeGeometry(hr * 0.07, hr * 0.44, 4), o.tuftMat || fur); t.position.y = earH * 0.6; g.add(t); }
                g.position.set(ex * hr * 0.58, hr * 0.84, -hr * 0.04); g.rotation.z = -ex * 0.16;
                this.head.add(g); this._catEars.push(g);
            }
            if (o.fangs) { const fm = this._mat(o.fangColor || 0xfff4dc, 1.0, 0.3); for (const fx of [-1, 1]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.03, o.fangs, 6), fm); f.position.set(fx * hr * 0.3, -hr * 0.62, hr * 0.86); f.rotation.x = Math.PI; this.head.add(f); } }
            if (o.mane) for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; const sp = new THREE.Mesh(new THREE.ConeGeometry(hr * 0.26, hr * 1.2, 5), o.maneMat || this._mat(p.accent, 1.0, 0.7)); sp.position.set(Math.cos(a) * hr * 1.2, 0.02 + Math.sin(a) * hr * 1.2, -hr * 0.5); sp.rotation.set(0, 0, -a + Math.PI / 2); this.head.add(sp); }

            const er = hr * 0.28;
            this._catEyes = [
                this._catEye(this.head, -hr * 0.42, hr * 0.14, hr * 0.66, er, p.accent, o.eyeGlow !== false),
                this._catEye(this.head, hr * 0.42, hr * 0.14, hr * 0.66, er, p.accent, o.eyeGlow !== false)
            ];
            const wMat = this._mat(0xf6f2e8, 0.8, 0.3);
            for (const side of [-1, 1]) for (let k = 0; k < 3; k++) {
                const w = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, hr * 1.3, 4), wMat);
                w.position.set(side * hr * 0.86, -hr * 0.34 + k * hr * 0.14, hr * 0.76);
                w.rotation.z = Math.PI / 2; w.rotation.y = side * (0.35 - k * 0.12);
                this.head.add(w);
            }
            this.head.position.set(0, 1.06 + 0.16 * b - drop, 0.6 + 0.08 * b); this.bodyGroup.add(this.head);

            const hipY = 0.82 - drop;
            this.frontLeft  = this._leg(fur, -0.2, 0.42, hipY, len, 'catpaw', 1.15);
            this.frontRight = this._leg(fur, 0.2, 0.42, hipY, len, 'catpaw', 1.15);
            this.rearLeft   = this._leg(fur, -0.2, -0.44, hipY, len, 'catpaw', 1.15);
            this.rearRight  = this._leg(fur, 0.2, -0.44, hipY, len, 'catpaw', 1.15);
            if (o.tail === 'bob') {
                this.tail = this._nub(fur, 0, 1.0 - drop, -0.6 * b - 0.04, 0.13 * b);
                const puff = new THREE.Mesh(new THREE.SphereGeometry(0.1 * b, 10, 8), fur); puff.position.set(0, 0.08, -0.06); this.tail.add(puff);
            } else {
                this.tail = this._felineTail(fur, 0.98 - drop, -0.62 * b - 0.06, 7, 0.86, 1.05);
            }
            this._wireQuad({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Ungulate core: tall hooved grazer. horns ('curved'|'antler'|'straight'|'ram'|'none') ─
        _ungulateBase(fur, o) {
            o = o || {};
            const p = this.profile;
            const b = o.sizeBody || 1.0;
            this.body = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.28 * b, 0.28 * b, 1.0 * b, 12), fur); torso.rotation.x = Math.PI / 2; this.body.add(torso);
            const chest = new THREE.Mesh(new THREE.SphereGeometry(0.3 * b, 12, 12), fur); chest.position.z = 0.45 * b; this.body.add(chest);
            if (o.hump) { const h = new THREE.Mesh(new THREE.SphereGeometry(0.32 * b, 12, 12), fur); h.position.set(0, 0.24 * b, -0.05); this.body.add(h); }
            this.body.position.set(0, 1.15, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.55, 10), fur); neck.rotation.x = 0.4; neck.position.set(0, 0.2, 0.0); this.head.add(neck);
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.18 * b, 12, 12), fur); skull.scale.set(0.85, 0.9, 1.25); skull.position.set(0, 0.5, 0.18); this.head.add(skull);
            const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.18, 8), fur); muzzle.rotation.x = Math.PI / 2; muzzle.position.set(0, 0.46, 0.38); this.head.add(muzzle);
            for (const ex of [-0.1, 0.1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 5), fur); ear.position.set(ex, 0.62, 0.05); ear.rotation.z = ex > 0 ? -0.5 : 0.5; this.head.add(ear); }
            const boneMat = o.hornMat || this._mat(0xe8dcc0, 1.0, 0.5);
            const horn = o.horns || 'curved';
            if (horn === 'antler') {
                for (const ax of [-0.1, 0.1]) {
                    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.42, 6), boneMat); beam.position.set(ax, 0.78, 0.04); beam.rotation.z = ax > 0 ? -0.4 : 0.4; this.head.add(beam);
                    for (let t = 0; t < 2; t++) { const tine = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.2, 5), boneMat); tine.position.set(ax + (ax > 0 ? 0.1 : -0.1) * (t + 1), 0.84 + t * 0.1, 0.04); tine.rotation.z = ax > 0 ? -1.0 : 1.0; this.head.add(tine); }
                }
            } else if (horn === 'straight') { // rhino / titanothere nose horn
                const h = new THREE.Mesh(new THREE.ConeGeometry(0.08 * b, 0.4 * b, 8), boneMat); h.position.set(0, 0.5, 0.5); h.rotation.x = -0.6; this.head.add(h);
                const h2 = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 8), boneMat); h2.position.set(0, 0.58, 0.34); h2.rotation.x = -0.7; this.head.add(h2);
            } else if (horn === 'ram') { // heavy spiral goat horns curling back
                for (const hx of [-0.11, 0.11]) { const h = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.045, 8, 14, Math.PI * 1.5), boneMat); h.position.set(hx, 0.62, 0.0); h.rotation.set(1.4, hx > 0 ? -0.3 : 0.3, hx > 0 ? -0.4 : 0.4); this.head.add(h); }
            } else if (horn === 'bull') { // sideways bull horns sweeping up
                for (const hx of [-0.14, 0.14]) { const h = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.4, 7), boneMat); h.position.set(hx, 0.58, 0.02); h.rotation.z = hx > 0 ? -1.1 : 1.1; h.rotation.x = -0.2; this.head.add(h); }
            } else if (horn !== 'none') { // curved
                for (const hx of [-0.1, 0.1]) { const h = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.03, 6, 12, Math.PI * 1.1), boneMat); h.position.set(hx, 0.66, 0.08); h.rotation.set(0.4, hx > 0 ? -0.4 : 0.4, hx > 0 ? 0.6 : -0.6); this.head.add(h); }
            }
            this._eye(this.head, -0.1, 0.5, 0.28, 0.04, o.eye || 0x120c08, !!o.eyeGlow);
            this._eye(this.head, 0.1, 0.5, 0.28, 0.04, o.eye || 0x120c08, !!o.eyeGlow);
            this.head.position.set(0, 1.25, 0.5); this.bodyGroup.add(this.head);

            const len = o.legLen || 1.1;
            this.frontLeft  = this._leg(fur, -0.22, 0.42, 1.05, len, 'hoof');
            this.frontRight = this._leg(fur, 0.22, 0.42, 1.05, len, 'hoof');
            this.rearLeft   = this._leg(fur, -0.22, -0.44, 1.05, len, 'hoof');
            this.rearRight  = this._leg(fur, 0.22, -0.44, 1.05, len, 'hoof');
            this.tail = this._tail(fur, 1.18, -0.6, 3, 0.7, -0.5);
            this._wireQuad({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Ursine core: bulky bear on short legs. ears ('round'|'horn'|'owl') ─
        _ursineBase(fur, o) {
            o = o || {};
            const p = this.profile;
            const b = o.sizeBody || 1.0;
            this.body = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.SphereGeometry(0.5 * b, 14, 12), fur); torso.scale.set(1.0, 0.95, 1.55); this.body.add(torso);
            const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.46 * b, 12, 12), fur); shoulders.position.set(0, 0.14 * b, 0.45); this.body.add(shoulders);
            this.body.position.set(0, 1.05, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this.head.add(new THREE.Mesh(new THREE.SphereGeometry(0.3 * b, 14, 12), fur));
            const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.28, 10), o.snoutMat || fur); snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.05, 0.3); this.head.add(snout);
            const nose = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), this._mat(o.noseColor || 0x140d0a, 1.0, 0.4)); nose.position.set(0, -0.03, 0.46); this.head.add(nose);
            const eartype = o.ear || 'round';
            if (eartype === 'owl') { for (const ex of [-0.18, 0.18]) { const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.24, 5), fur); tuft.position.set(ex, 0.34, -0.02); tuft.rotation.z = ex > 0 ? -0.3 : 0.3; this.head.add(tuft); } }
            else for (const ex of [-0.2, 0.2]) { const ear = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), o.earMat || fur); ear.position.set(ex, 0.28, -0.02); ear.scale.z = 0.5; this.head.add(ear); }
            if (eartype === 'horn') { const hm = o.hornMat || this._mat(o.accent2 || 0xe8dcc0, 1.0, 0.5); for (const hx of [-0.16, 0.16]) { const h = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 6), hm); h.position.set(hx, 0.4, 0.02); h.rotation.z = hx > 0 ? -0.5 : 0.5; this.head.add(h); } }
            this._eye(this.head, -0.13, 0.07, 0.24, 0.05, p.accent, !!o.eyeGlow);
            this._eye(this.head, 0.13, 0.07, 0.24, 0.05, p.accent, !!o.eyeGlow);
            this.head.position.set(0, 1.46, 0.6); this.bodyGroup.add(this.head);

            const paw = o.clawMat ? 'paw' : 'paw';
            this.frontLeft  = this._leg(fur, -0.32, 0.42, 0.92, 0.95, paw);
            this.frontRight = this._leg(fur, 0.32, 0.42, 0.92, 0.95, paw);
            this.rearLeft   = this._leg(fur, -0.32, -0.42, 0.92, 0.95, paw);
            this.rearRight  = this._leg(fur, 0.32, -0.42, 0.92, 0.95, paw);
            this.tail = this._nub(fur, 0, 1.0, -0.74, 0.09);
            this._wireQuad({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Suid core: low hunched boar/pig. tusks · bristles · wings · disc snout ─
        _suidBase(fur, o) {
            o = o || {};
            const p = this.profile;
            this.body = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 12), fur); torso.scale.set(1.0, 0.85, 1.55); this.body.add(torso);
            if (o.hump !== false) { const hump = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 12), fur); hump.position.set(0, 0.2, 0.4); this.body.add(hump); }
            if (o.bristles) for (let i = 0; i < 6; i++) { const bl = new THREE.Mesh(new THREE.ConeGeometry(0.04, o.bristleLen || 0.22, 4), o.bristleMat || this._mat(0x140d0a, 1.0, 0.9)); bl.position.set(0, 0.28, 0.45 - i * 0.17); this.body.add(bl); }
            this.body.position.set(0, 0.9, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), fur); skull.scale.set(0.9, 0.9, 1.2); this.head.add(skull);
            const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.3, 10), fur); snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.06, 0.28); this.head.add(snout);
            const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.04, 10), this._mat(o.discColor || 0x3a2a22, 1.0, 0.5)); disc.rotation.x = Math.PI / 2; disc.position.set(0, -0.06, 0.44); this.head.add(disc);
            if (o.tusks !== false) { const tuskMat = this._mat(0xe8dcc0, 1.0, 0.4); for (const tx of [-0.1, 0.1]) { const tk = new THREE.Mesh(new THREE.ConeGeometry(0.035, o.tuskLen || 0.26, 6), tuskMat); tk.position.set(tx, -0.1, 0.36); tk.rotation.set(-0.7, 0, tx > 0 ? 0.3 : -0.3); this.head.add(tk); } }
            for (const ex of [-0.16, 0.16]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 5), fur); ear.position.set(ex, 0.22, 0); this.head.add(ear); }
            this._eye(this.head, -0.13, 0.06, 0.18, 0.04, p.accent, !!o.eyeGlow);
            this._eye(this.head, 0.13, 0.06, 0.18, 0.04, p.accent, !!o.eyeGlow);
            // Carried off the front of the shoulders, level with the hump.
            this.head.position.set(0, o.hump !== false ? 1.06 : 0.96, 0.64); this.bodyGroup.add(this.head);

            this.frontLeft  = this._leg(fur, -0.26, 0.38, 0.78, 0.78, 'hoof');
            this.frontRight = this._leg(fur, 0.26, 0.38, 0.78, 0.78, 'hoof');
            this.rearLeft   = this._leg(fur, -0.26, -0.4, 0.78, 0.78, 'hoof');
            this.rearRight  = this._leg(fur, 0.26, -0.4, 0.78, 0.78, 'hoof');
            this.tail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 5), fur); this.tail.position.set(0, 0.9, -0.62); this.bodyGroup.add(this.tail);
            this._wireQuad({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
            if (o.wings) { this._wings = []; const wm = this._mat(o.wingColor || 0xffffff, 0.9, 0.6); for (const sgn of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.34), wm); w.position.set(sgn * 0.42, 1.15, 0.05); w.rotation.z = sgn * 0.3; this._deco(w); this._wings.push(w); } }
        }

        // ── Primate core: upright ape. arms/legs from ape helpers, sizeBody ──
        _primateBase(fur, o) {
            o = o || {};
            const p = this.profile;
            const b = o.sizeBody || 1.0;
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.45 * b, 14, 12), fur); this.body.scale.set(1.0, 1.2, 0.85); this.body.position.set(0, 1.15, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this.head.add(new THREE.Mesh(new THREE.SphereGeometry(0.26 * b, 14, 12), fur));
            const face = new THREE.Mesh(new THREE.SphereGeometry(0.18 * b, 12, 12), this._mat(p.accent, 1.0, 0.6)); face.scale.set(1, 1.1, 0.6); face.position.set(0, -0.04, 0.18); this.head.add(face);
            const brow = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.1), fur); brow.position.set(0, 0.08, 0.22); this.head.add(brow);
            if (o.ears) for (const ex of [-0.28 * b, 0.28 * b]) { const ear = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 10), this._mat(p.accent, 1.0, 0.6)); ear.position.set(ex, 0.0, 0.02); ear.scale.z = 0.4; this.head.add(ear); }
            this._eye(this.head, -0.08, 0.0, 0.23, 0.04, o.eye || 0x120c08, !!o.eyeGlow);
            this._eye(this.head, 0.08, 0.0, 0.23, 0.04, o.eye || 0x120c08, !!o.eyeGlow);
            this.head.position.set(0, 1.85, 0.05); this.bodyGroup.add(this.head);

            this.leftArm = this._apeArm(fur, -1);
            this.rightArm = this._apeArm(fur, 1);
            this.leftLeg = this._apeLeg(fur, -0.22);
            this.rightLeg = this._apeLeg(fur, 0.22);
            this._wireBiped({ body: this.body, head: this.head, la: this.leftArm, ra: this.rightArm, ll: this.leftLeg, rl: this.rightLeg });
        }

        //=====================================================================
        // BESPOKE CANIDS
        //=====================================================================
        _buildBstArcticfox(fur)        { this._canidBase(fur, { sizeBody: 0.82, ear: 'prick', tail: 'bush', eyeGlow: false, legLen: 0.9, snout: 0.34 }); }
        _buildBstCottonfox(fur)        { this._canidBase(fur, { sizeBody: 0.86, ear: 'round', tail: 'bush', eyeGlow: false, legLen: 0.9, snout: 0.34 });
            // sticky sugar-web wisps on the tail.
            const web = this._mat(this.profile.accent, 0.5, 0.3); for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), web); s.position.set(-0.1 + i * 0.07, 0.9, -0.9); this._deco(s); } }
        _buildBstIcewolfpup(fur)       { this._canidBase(fur, { sizeBody: 0.78, ear: 'prick', tail: 'bush', legLen: 0.82, snout: 0.3 });
            const ice = this._mat(this.profile.accent, 0.7, 0.15, this.profile.accent); const brk = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), ice); brk.position.set(0, 1.4, 1.02); this._deco(brk); }
        _buildBstRabidhyena(fur)       { this._canidBase(fur, { sizeBody: 1.05, slope: 1.0, ear: 'round', tail: 'thin', eyeGlow: true, legLen: 1.0, snout: 0.36, hackles: true, hackleMat: this._mat(0x3a3226, 1.0, 0.9) }); }
        _buildBstFeralhyenapack(fur)   { this._canidBase(fur, { sizeBody: 1.0, slope: 1.0, ear: 'round', tail: 'thin', eyeGlow: true, legLen: 1.0, snout: 0.36, hackles: true, hackleMat: this._mat(0x2e2820, 1.0, 0.9) }); }
        _buildBstGraywolf(fur)         { this._canidBase(fur, { sizeBody: 1.0, ear: 'prick', tail: 'bush', hackles: true }); }
        _buildBstManedterrorwolf(fur)  { this._canidBase(fur, { sizeBody: 1.1, ear: 'prick', tail: 'bush', eyeGlow: true, legLen: 1.05 });
            // Mane of razor quills around the neck.
            const quill = this._mat(this.profile.accent, 1.0, 0.4); for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const q = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.34, 4), quill); q.position.set(Math.cos(a) * 0.26, 1.2 + Math.sin(a) * 0.26, 0.42); q.rotation.set(0, 0, -a + Math.PI / 2); this._deco(q); } }
        _buildBstRedfox(fur)           { this._canidBase(fur, { sizeBody: 0.84, ear: 'prick', tail: 'plume', eyeGlow: false, legLen: 0.9, snout: 0.36 });
            // White tail tip.
            if (this.tail && this.tail.children.length) { const tip = this.tail.children[this.tail.children.length - 1]; tip.material = this._mat(0xf0ece0, 1.0, 0.8); } }
        _buildBstAlphadirewolf(fur)    { this._canidBase(fur, { sizeBody: 1.25, ear: 'prick', tail: 'plume', eyeGlow: true, legLen: 1.15, snout: 0.46, hackles: true, hackleMat: this._mat(0xaac4d8, 1.0, 0.5) }); }
        _buildBstAlphawarg(fur)        { this._canidBase(fur, { sizeBody: 1.2, ear: 'prick', tail: 'bush', eyeGlow: true, legLen: 1.12, snout: 0.46, hackles: true }); }
        _buildBstArcticwolf(fur)       { this._canidBase(fur, { sizeBody: 1.05, ear: 'prick', tail: 'plume', eyeGlow: true, legLen: 1.05, hackles: true, hackleMat: this._mat(0xd8e4ee, 1.0, 0.6) }); }
        _buildBstRabidcoyote(fur)      { this._canidBase(fur, { sizeBody: 0.92, ear: 'bat', tail: 'thin', eyeGlow: true, legLen: 1.02, snout: 0.44 }); }
        _buildBstScavengingcoyote(fur) { this._canidBase(fur, { sizeBody: 0.9, ear: 'bat', tail: 'thin', eyeGlow: true, legLen: 1.02, snout: 0.44 }); }

        //=====================================================================
        // BESPOKE FELINES
        //=====================================================================
        _buildBstLazycat(fur)          { this._felineBase(fur, { sizeBody: 0.7, ear: 'round', eyeGlow: false, legLen: 0.7 }); }
        _buildBstBlackpanther(fur)     { this._felineBase(fur, { sizeBody: 1.0, eyeGlow: true, legLen: 0.9 }); }
        _buildBstReflectivetiger(fur)  { this._felineBase(fur, { sizeBody: 1.0, eyeGlow: false, legLen: 0.88 });
            // Snow-glint stripes, banded down the flanks where a tiger's are.
            this._tigerStripes(this._mat(this.profile.accent, 1.0, 0.4), 5, 0.3, 0.18, 1.0); }
        _buildBstSabercat(fur)         { this._felineBase(fur, { sizeBody: 1.05, fangs: 0.28, ear: 'round', eyeGlow: true, legLen: 0.9 }); }
        _buildBstWildcat(fur)          { this._felineBase(fur, { sizeBody: 0.8, ear: 'tuft', eyeGlow: false, legLen: 0.78 }); }
        // Street tomcat: small, half-starved, one ear torn off in a fight and
        // a patchy coat of raised hackles down the spine.
        _buildBstFeralalleycat(fur)    { this._felineBase(fur, { sizeBody: 0.68, ear: 'tuft', eyeGlow: true, legLen: 0.72 });
            // Notch the left ear (a torn-off tip, folded over).
            if (this._catEars && this._catEars[0]) { const ear = this._catEars[0]; ear.scale.set(0.9, 0.55, 0.9); ear.rotation.z = -0.5; }
            // Ribs showing through a scruffy coat, and bristling hackles.
            const d = this._catDrop || 0;
            const scruff = this._mat(this.profile.bodyColor, 1.0, 0.95);
            for (let i = 0; i < 5; i++) { const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.13, 4), scruff); tuft.position.set((i % 2 ? 0.03 : -0.03), 1.12 - d, 0.26 - i * 0.14); tuft.rotation.x = -0.4; this._deco(tuft); }
            const rib = this._mat(this.profile.accent, 0.35, 0.8);
            for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.03), rib); r.position.set(0, 0.86 - d, 0.28 - i * 0.12); this._deco(r); } }
        _buildBstGoldenlion(fur)       { this._felineBase(fur, { sizeBody: 1.1, mane: true, maneMat: this._mat(0x6a3a10, 1.0, 0.8), eyeGlow: false, legLen: 0.92 }); }
        _buildBstStripedtiger(fur)     { this._felineBase(fur, { sizeBody: 1.05, eyeGlow: false, legLen: 0.9 });
            this._tigerStripes(this._mat(this.profile.accent, 1.0, 0.6), 6, 0.36, 0.16, 1.05); }
        // Tiger stripes: open hoops that wrap the barrel over the back and
        // down both flanks, leaving the belly bare. Each is a torus arc lying
        // across the spine, so a stripe hugs the coat instead of a flat slab
        // poking out through it sideways.
        _tigerStripes(mat, count, z0, dz, b) {
            const d = this._catDrop || 0;
            for (let i = 0; i < count; i++) {
                const z = z0 - i * dz;
                // The torso is an ellipsoid 0.6*b long; the hoop shrinks with it.
                const k = Math.sqrt(Math.max(0.35, 1 - Math.pow(z / (0.62 * b), 2)));
                const s = new THREE.Mesh(new THREE.TorusGeometry(0.285 * b * k, 0.03, 4, 10, Math.PI * 1.3), mat);
                s.rotation.z = -Math.PI * 0.15; s.scale.set(1.0, 1.0, 1.4);
                s.position.set(0, 0.95 - d, z); this._deco(s);
            }
        }
        _buildBstUmbrapanthera(fur)    { this._felineBase(fur, { sizeBody: 1.0, eyeGlow: true, legLen: 0.9 });
            // Wispy shadow trails off the raised tail tip.
            const d = this._catDrop || 0;
            const sh = this._mat(this.profile.accent, 0.4, 0.2, this.profile.accent); for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.1 - i * 0.02, 8, 8), sh); s.position.set(0, 1.6 - d + i * 0.16, -0.72 - i * 0.04); this._deco(s); } }
        _buildBstMysticpanther(fur)    { this._felineBase(fur, { sizeBody: 1.0, eyeGlow: true, legLen: 0.9 });
            const d = this._catDrop || 0;
            const glow = this._mat(this.profile.accent, 0.6, 0.3, this.profile.accent); for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 6, 10), glow); r.position.set(0, 1.21 - d, 0.24 - i * 0.16); r.rotation.x = Math.PI / 2; this._deco(r); } }
        _buildBstSabertoothalpha(fur)  { this._felineBase(fur, { sizeBody: 1.15, fangs: 0.38, ear: 'tuft', eyeGlow: true, legLen: 0.95 }); }
        _buildBstDiresabertoothalpha(fur){ this._felineBase(fur, { sizeBody: 1.25, fangs: 0.44, ear: 'tuft', eyeGlow: true, legLen: 1.0, fangColor: 0xeaf4ff }); }

        //=====================================================================
        // BESPOKE UNGULATES
        //=====================================================================
        _buildBstThirstycamel(fur)     { this._ungulateBase(fur, { sizeBody: 1.05, horns: 'none', hump: true, legLen: 1.25 }); }
        _buildBstForeststag(fur)       { this._ungulateBase(fur, { sizeBody: 1.0, horns: 'antler', legLen: 1.15 }); }
        _buildBstPastoralsheep(fur)    { this._ungulateBase(fur, { sizeBody: 0.95, horns: 'ram', legLen: 0.9 });
            // Woolly fleece clumps over the body.
            const wool = this._mat(0xf4f0e6, 1.0, 0.95); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const c = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), wool); c.position.set(Math.cos(a) * 0.24, 1.15 + Math.sin(a) * 0.14, (i % 2 - 0.5) * 0.4); this._deco(c); } }
        _buildBstArmoredrhinoceros(fur){ this._ungulateBase(fur, { sizeBody: 1.2, horns: 'straight', legLen: 1.05, hornMat: this._mat(0xd8dce0, 1.0, 0.4) });
            // Armor plates on the back.
            const plate = this._mat(this.profile.accent, 1.0, 0.4); for (let i = 0; i < 3; i++) { const pl = new THREE.Mesh(new THREE.SphereGeometry(0.28 - i * 0.03, 10, 8), plate); pl.scale.set(1.2, 0.4, 0.9); pl.position.set(0, 1.4, 0.24 - i * 0.28); this._deco(pl); } }
        _buildBstBloodbellcow(fur)     { this._ungulateBase(fur, { sizeBody: 1.05, horns: 'bull', legLen: 1.1 });
            // Ominous brass bell under the neck.
            const bell = this._mat(this.profile.accent, 1.0, 0.3, 0x3a2c08); const bm = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.18, 10), bell); bm.position.set(0, 1.02, 0.55); this._deco(bm);
            const clap = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), bell); clap.position.set(0, 0.9, 0.55); this._deco(clap); }
        _buildBstDeersprite(fur)       { this._ungulateBase(fur, { sizeBody: 0.85, horns: 'antler', legLen: 1.1, eye: 0xffaa22, eyeGlow: true, hornMat: this._mat(this.profile.accent, 1.0, 0.4, this.profile.accent) });
            // Flame flickers along the back.
            const fl = this._mat(this.profile.accent, 0.85, 0.4, this.profile.accent); for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.28, 6), fl); f.position.set(0, 1.4, 0.24 - i * 0.2); this._deco(f); } }
        _buildBstHollowgoat(fur)       { this._ungulateBase(fur, { sizeBody: 0.95, horns: 'ram', legLen: 1.0, eye: 0x66ff88, eyeGlow: true });
            // Turtle-like shell over the torso.
            const shell = this._mat(this.profile.accent, 1.0, 0.6); const sh = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), shell); sh.scale.set(1.1, 1.0, 1.3); sh.position.set(0, 1.2, -0.05); this._deco(sh); }
        _buildBstIronhoofcharger(fur)  { this._ungulateBase(fur, { sizeBody: 1.1, horns: 'bull', legLen: 1.1, hornMat: this._mat(this.profile.accent, 1.0, 0.35) });
            // Iron hoof glints (already hooves) plus a metal brow band.
            const band = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.03, 6, 14), this._mat(this.profile.accent, 1.0, 0.3)); band.rotation.x = Math.PI / 2; band.position.set(0, 1.72, 0.6); this._deco(band); }
        _buildBstRancorousbull(fur)    { this._ungulateBase(fur, { sizeBody: 1.15, horns: 'bull', legLen: 1.1, hump: true }); }
        _buildBstTitanotherealpha(fur) { this._ungulateBase(fur, { sizeBody: 1.35, horns: 'straight', legLen: 1.2, hump: true, hornMat: this._mat(this.profile.accent, 1.0, 0.4) }); }

        //=====================================================================
        // BESPOKE URSIDS
        //=====================================================================
        _buildBstBrownbear(fur)        { this._ursineBase(fur, { sizeBody: 1.0, ear: 'round' }); }
        _buildBstHornedbear(fur)       { this._ursineBase(fur, { sizeBody: 1.05, ear: 'horn', eyeGlow: true, accent2: 0x2a1810, hornMat: this._mat(0x1a1210, 1.0, 0.5) }); }
        _buildBstYoungyeti(fur)        { this._ursineBase(fur, { sizeBody: 0.95, ear: 'round', noseColor: 0x445566, earMat: this._mat(0xd0dce8, 1.0, 0.9) });
            const ice = this._mat(this.profile.accent, 0.7, 0.15, this.profile.accent); for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const sh = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 4), ice); sh.position.set(Math.cos(a) * 0.4, 1.2, Math.sin(a) * 0.4); this._deco(sh); } }
        _buildBstFrostbackursid(fur)   { this._ursineBase(fur, { sizeBody: 1.05, ear: 'round', eyeGlow: true, noseColor: 0x335566 });
            const ice = this._mat(this.profile.accent, 0.75, 0.15, this.profile.accent); for (let i = 0; i < 6; i++) { const sh = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.26, 4), ice); sh.position.set(-0.16 + (i % 3) * 0.16, 1.34, 0.2 - Math.floor(i / 3) * 0.3); sh.rotation.x = -0.3; this._deco(sh); } }
        _buildBstPanda(fur)            { this._ursineBase(fur, { sizeBody: 1.0, ear: 'round', earMat: this._mat(0x141414, 1.0, 0.9) });
            // Black eye patches and limbs suggestion.
            const blk = this._mat(this.profile.accent, 1.0, 0.9); for (const ex of [-0.13, 0.13]) { const patch = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), blk); patch.scale.set(1, 1.3, 0.4); patch.position.set(ex, 1.5, 0.82); this._deco(patch); }
            const collar = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.12, 8, 16), blk); collar.rotation.x = Math.PI / 2; collar.position.set(0, 1.18, 0.1); this._deco(collar); }
        _buildBstPolarbear(fur)        { this._ursineBase(fur, { sizeBody: 1.1, ear: 'round', noseColor: 0x1a1a1a }); }
        _buildBstTimewornowlbear(fur)  { this._ursineBase(fur, { sizeBody: 1.05, ear: 'owl', eyeGlow: true, snoutMat: this._mat(0xd8c88a, 1.0, 0.4), noseColor: 0xc8a848 });
            // Barbed feathers across the shoulders.
            const feat = this._mat(0x8a7452, 1.0, 0.8); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI; const f = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 4), feat); f.position.set(Math.cos(a) * 0.4, 1.3, 0.3); f.rotation.set(-0.6, 0, Math.cos(a)); this._deco(f); } }
        _buildBstDemonbear(fur)        { this._ursineBase(fur, { sizeBody: 1.1, ear: 'horn', eyeGlow: true, hornMat: this._mat(this.profile.accent, 1.0, 0.4, this.profile.accent), noseColor: 0x1a0808 }); }
        _buildBstKodiakbear(fur)       { this._ursineBase(fur, { sizeBody: 1.1, ear: 'round' }); }
        _buildBstEmberclawbear(fur)    { this._ursineBase(fur, { sizeBody: 1.0, ear: 'round', eyeGlow: true, noseColor: 0x1a0804 });
            // Burning claws / fiery vents.
            const flame = this._mat(this.profile.accent, 0.9, 0.4, this.profile.accent); for (const x of [-0.32, 0.32]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 6), flame); f.position.set(x, 0.16, 0.5); this._deco(f); } }
        _buildBstFrostfangbear(fur)    { this._ursineBase(fur, { sizeBody: 1.05, ear: 'round', eyeGlow: true, noseColor: 0x335566 });
            const ice = this._mat(this.profile.accent, 0.8, 0.15, this.profile.accent); for (const fx of [-0.06, 0.06]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 5), ice); f.position.set(fx, 1.36, 0.86); f.rotation.x = Math.PI; this._deco(f); } }
        _buildBstThundermawursine(fur) { this._ursineBase(fur, { sizeBody: 1.05, ear: 'round', eyeGlow: true, noseColor: 0x33334a });
            // Two mirrored pairs of spark spikes standing off the shoulders.
            const bolt = this._mat(this.profile.accent, 0.95, 0.4, this.profile.accent); for (let i = 0; i < 4; i++) { const sx = i % 2 ? 1 : -1; const b = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.24, 4), bolt); b.position.set(sx * 0.12, 1.56, 0.36 - (i >> 1) * 0.26); b.rotation.z = -sx * 0.3; this._deco(b); } }
        _buildBstTitaniccavebear(fur)  { this._ursineBase(fur, { sizeBody: 1.25, ear: 'round' });
            const claw = this._mat(0xe8dcc0, 1.0, 0.4); for (const x of [-0.32, 0.32]) for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.18, 5), claw); c.position.set(x + (i - 1) * 0.05, 0.02, 0.52); c.rotation.x = Math.PI / 2 + 0.2; this._deco(c); } }

        //=====================================================================
        // BESPOKE SUIDS
        //=====================================================================
        _buildBstDirepig(fur)          { this._suidBase(fur, { tusks: true, tuskLen: 0.34, bristles: true, eyeGlow: true }); }
        _buildBstFlyingpig(fur)        { this._suidBase(fur, { tusks: false, hump: false, wings: true, wingColor: 0xffffff }); }
        _buildBstRazorbackboar(fur)    { this._suidBase(fur, { tusks: true, tuskLen: 0.3, bristles: true, bristleLen: 0.32, bristleMat: this._mat(this.profile.accent, 1.0, 0.4) }); }
        _buildBstWildboar(fur)         { this._suidBase(fur, { tusks: true, bristles: true }); }
        _buildBstNormalpig(fur)        { this._suidBase(fur, { tusks: false, hump: false, bristles: false, discColor: this.profile.accent }); }
        _buildBstMadboar(fur)          { this._suidBase(fur, { tusks: true, tuskLen: 0.3, bristles: true, eyeGlow: true, bristleMat: this._mat(this.profile.accent, 1.0, 0.4, this.profile.accent) }); }

        //=====================================================================
        // BESPOKE PRIMATES
        //=====================================================================
        _buildBstMaleficentape(fur)    { this._primateBase(fur, { sizeBody: 1.15, eyeGlow: true, ears: true }); }
        _buildBstOrgangrindermonkey(fur){ this._primateBase(fur, { sizeBody: 0.78, ears: true });
            // A grim little organ box held in front.
            const box = this._mat(this.profile.accent, 1.0, 0.4); const b = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.16), box); b.position.set(0, 0.9, 0.4); this._deco(b);
            const crank = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 6), this._mat(0x2a2018, 1.0, 0.5)); crank.rotation.z = Math.PI / 2; crank.position.set(0.18, 0.9, 0.4); this._deco(crank); }
        _buildBstTreemonkey(fur)       { this._primateBase(fur, { sizeBody: 0.78, ears: true });
            // A thrown object clutched in one fist.
            const rock = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), this._mat(0x5a5248, 1.0, 0.9)); rock.position.set(-0.5, 0.35, 0.1); this._deco(rock); }

        // ── Chromatic Manticore: lion body, rainbow mane + spiked tail ───────
        _buildChromaticmanticore(fur) {
            const p = this.profile;
            this.body = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 1.2, 12), fur); torso.rotation.x = Math.PI / 2; this.body.add(torso);
            const chest = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), fur); chest.position.z = 0.52; this.body.add(chest);
            this.body.position.set(0, 1.0, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this.head.add(new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), fur));
            const muzzle = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.24, 8), fur); muzzle.rotation.x = Math.PI / 2; muzzle.position.set(0, -0.04, 0.22); this.head.add(muzzle);
            // Chaotic rainbow mane ring.
            for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; const c = new THREE.Color().setHSL((i / 14 + this.idRand()) % 1, 0.9, 0.55); const sp = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.34, 5), this._mat(c.getHex(), 1.0, 0.5, c.getHex())); sp.position.set(Math.cos(a) * 0.3, 0.04 + Math.sin(a) * 0.3, -0.12); sp.rotation.set(0, 0, -a + Math.PI / 2); this.head.add(sp); }
            this._eye(this.head, -0.1, 0.05, 0.2, 0.05, p.accent, true);
            this._eye(this.head, 0.1, 0.05, 0.2, 0.05, p.accent, true);
            this.head.position.set(0, 1.18, 0.62); this.bodyGroup.add(this.head);

            this.frontLeft  = this._leg(fur, -0.22, 0.42, 0.86, 0.92, 'pad');
            this.frontRight = this._leg(fur, 0.22, 0.42, 0.86, 0.92, 'pad');
            this.rearLeft   = this._leg(fur, -0.22, -0.44, 0.86, 0.92, 'pad');
            this.rearRight  = this._leg(fur, 0.22, -0.44, 0.86, 0.92, 'pad');
            // Scorpion-like tail tipped with a glowing prismatic barb.
            this.tail = this._tail(fur, 1.0, -0.62, 6, 0.92, 1.0);
            const barb = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.34, 6), this._mat(p.accent, 1.0, 0.4, p.accent)); barb.position.set(0, -0.62, 0.42); this.tail.add(barb);
            this._wireQuad({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Chupacabra: gaunt spined predator, fangs, hunched back ───────────
        _buildChupacabra(fur) {
            const p = this.profile;
            this.body = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.16, 0.95, 10), fur); torso.rotation.x = Math.PI / 2; this.body.add(torso);
            const ribs = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), fur); ribs.scale.set(1.1, 0.8, 1.0); ribs.position.z = 0.4; this.body.add(ribs);
            // Hunched dorsal spines.
            for (let i = 0; i < 7; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.26 - i * 0.02, 5), this._mat(p.accent, 1.0, 0.5)); sp.position.set(0, 0.22 + Math.sin(i / 6 * Math.PI) * 0.12, 0.42 - i * 0.13); this.body.add(sp); }
            this.body.position.set(0, 0.95, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), fur); skull.scale.set(0.85, 0.8, 1.1); this.head.add(skull);
            const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.3, 7), fur); jaw.rotation.x = Math.PI / 2; jaw.position.set(0, -0.05, 0.26); this.head.add(jaw);
            for (const fx of [-0.06, 0.06]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.16, 5), this._mat(0xfff4d0, 1.0, 0.3)); f.position.set(fx, -0.13, 0.32); f.rotation.x = Math.PI; this.head.add(f); }
            for (const ex of [-0.12, 0.12]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 5), fur); ear.position.set(ex, 0.2, -0.02); this.head.add(ear); }
            this._eye(this.head, -0.09, 0.04, 0.16, 0.05, p.accent, true);
            this._eye(this.head, 0.09, 0.04, 0.16, 0.05, p.accent, true);
            this.head.position.set(0, 1.1, 0.56); this.bodyGroup.add(this.head);

            this.frontLeft  = this._leg(fur, -0.18, 0.4, 0.92, 1.0, 'paw');
            this.frontRight = this._leg(fur, 0.18, 0.4, 0.92, 1.0, 'paw');
            this.rearLeft   = this._leg(fur, -0.18, -0.42, 0.86, 0.92, 'paw');
            this.rearRight  = this._leg(fur, 0.18, -0.42, 0.86, 0.92, 'paw');
            this.tail = this._tail(fur, 0.96, -0.56, 4, 0.78, 0.7);
            this._wireQuad({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Giant Snail: coiled spiral shell, eyestalks, no real legs ────────
        _buildGiantsnail(fur) {
            const p = this.profile;
            const fleshMat = this._mat(p.accent, 1.0, 0.85);
            // The slug foot is the body: it is what the snail stands on, and
            // the head rears up off its front end, so the head reads above it.
            this.body = new THREE.Group();
            const foot = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 10), fleshMat); foot.scale.set(0.9, 0.4, 1.7); this.body.add(foot);
            const skirt = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), fleshMat); skirt.scale.set(1.0, 0.3, 1.75); this.body.add(skirt);
            this.body.position.set(0, 0.2, 0); this.bodyGroup.add(this.body);
            // Coiled spiral shell built from shrinking spheres, on the foot.
            this.shell = new THREE.Group();
            let sr = 0.42, sa = 0, sy = 0.0;
            for (let i = 0; i < 9; i++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(sr, 12, 12), fur); seg.position.set(0, sy + Math.sin(sa) * 0.12, -0.1 + Math.cos(sa) * 0.25); this.shell.add(seg); sa += 0.8; sr *= 0.84; sy += 0.05; }
            this.shell.position.set(0, 0.6, -0.05); this.bodyGroup.add(this.shell);

            this.head = new THREE.Group();
            const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.5, 10), fleshMat); neck.rotation.x = 1.0; neck.position.set(0, 0.0, 0.12); this.head.add(neck);
            const snout = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), fleshMat); snout.scale.set(1, 0.8, 1.3); snout.position.set(0, 0.18, 0.34); this.head.add(snout);
            // Two long retractable eyestalks, raked forward, an eye on each tip.
            this._stalks = [];
            for (const sx2 of [-0.09, 0.09]) {
                const st = new THREE.Group();
                const stk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.4, 6), fleshMat); stk.position.y = 0.2; st.add(stk);
                this._eye(st, 0, 0.42, 0, 0.07, p.accent, true);
                st.position.set(sx2, 0.24, 0.34); st.rotation.set(0.3, 0, sx2 > 0 ? -0.2 : 0.2); this.head.add(st); this._stalks.push(st);
            }
            this.head.position.set(0, 0.38, 0.6); this.bodyGroup.add(this.head);
            this._wireSnail({ body: this.body, shell: this.shell, head: this.head, stalks: this._stalks });
        }
        // Snail part map (Snail archetype keys): the foot carries everything.
        _wireSnail(p) {
            const m = {}, set = (ks, mesh) => { if (mesh) ks.forEach(k => m[k] = mesh); };
            set(['BODY', 'FOOT', 'MASS'], p.body);
            set(['SHELL'], p.shell);
            set(['HEAD', 'MOUTH', 'FACE'], p.head);
            set(['TENTACLE_1', 'EYE', 'EYES'], p.stalks[0]);
            set(['TENTACLE_2'], p.stalks[1]);
            this._partMeshMap = m;
            this._cascadeRules = [
                { gone: ['BODY', 'FOOT', 'MASS'], hide: [p.body, p.shell, p.head].filter(Boolean) },
                { gone: ['SHELL'], hide: [p.shell].filter(Boolean) },
                { gone: ['HEAD', 'MOUTH', 'FACE'], hide: [p.head].filter(Boolean) },
                { gone: ['TENTACLE_1'], hide: [p.stalks[0]].filter(Boolean) },
                { gone: ['TENTACLE_2'], hide: [p.stalks[1]].filter(Boolean) },
            ];
        }

        // ── Infernal Cerberus: three-headed hellhound wreathed in flame ──────
        _buildInfernalcerberus(fur) {
            const p = this.profile;
            this.body = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.3, 1.1, 12), fur); torso.rotation.x = Math.PI / 2; this.body.add(torso);
            const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 12), fur); shoulders.position.z = 0.5; this.body.add(shoulders);
            // Flame jets along the spine.
            for (let i = 0; i < 5; i++) { const fl = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 6), this._mat(p.accent, 0.9, 0.4, p.accent)); fl.position.set(0, 0.34, 0.42 - i * 0.21); this.body.add(fl); }
            this.body.position.set(0, 1.05, 0); this.bodyGroup.add(this.body);

            // Three heads on one neck group.
            this.head = new THREE.Group();
            for (const hx of [-0.32, 0, 0.32]) {
                const sub = new THREE.Group();
                const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), fur); skull.scale.set(0.9, 0.85, 1.1); sub.add(skull);
                const snout = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.34, 7), fur); snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.04, 0.28); sub.add(snout);
                const maw = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), this._mat(p.accent, 1.0, 0.4, p.accent)); maw.position.set(0, -0.04, 0.42); sub.add(maw);
                for (const ex of [-0.1, 0.1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 5), fur); ear.position.set(ex, 0.22, -0.02); sub.add(ear); }
                this._eye(sub, -0.09, 0.05, 0.2, 0.04, p.accent, true);
                this._eye(sub, 0.09, 0.05, 0.2, 0.04, p.accent, true);
                sub.position.set(hx, 0, hx === 0 ? 0.06 : 0); sub.rotation.y = hx * 0.7; this.head.add(sub);
            }
            this.head.position.set(0, 1.28, 0.55); this.bodyGroup.add(this.head);

            this.frontLeft  = this._leg(fur, -0.26, 0.42, 0.96, 1.0, 'paw');
            this.frontRight = this._leg(fur, 0.26, 0.42, 0.96, 1.0, 'paw');
            this.rearLeft   = this._leg(fur, -0.26, -0.44, 0.96, 1.0, 'paw');
            this.rearRight  = this._leg(fur, 0.26, -0.44, 0.96, 1.0, 'paw');
            this.tail = this._tail(this._mat(p.accent, 0.9, 0.4, p.accent), 1.06, -0.6, 5, 0.85, 0.6);
            this._wireQuad({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Jungle Predator: plant-beast hybrid, maw-pod head, thorned vines ─
        _buildJunglepredator(fur) {
            const p = this.profile;
            this.body = new THREE.Group();
            const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 12), fur); bulb.scale.set(1.0, 0.95, 1.3); this.body.add(bulb);
            // Leafy fronds across the back.
            // Swept back along the spine, splayed a little to each side.
            for (let i = 0; i < 6; i++) { const a = (i / 5) * 2 - 1; const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.42, 4), this._mat(0x3f7a33, 1.0, 0.7)); leaf.position.set(a * 0.24, 0.34 - Math.abs(a) * 0.08, -0.1 - Math.abs(a) * 0.06); leaf.rotation.set(-1.0, 0, -a * 0.45); this.body.add(leaf); }
            this.body.position.set(0, 0.95, 0); this.bodyGroup.add(this.body);

            // Venus-flytrap maw head.
            this.head = new THREE.Group();
            for (const sgn of [1, -1]) { const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI), this._mat(p.accent, 1.0, 0.6)); lobe.scale.set(1, 0.6, 1.2); lobe.rotation.x = sgn * 0.55 - Math.PI / 2; lobe.position.set(0, sgn * 0.08, 0.16); this.head.add(lobe); }
            // Inner thorn teeth.
            for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const th = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.12, 4), this._mat(0xfff0e0, 1.0, 0.4)); th.position.set(Math.cos(a) * 0.18, 0, 0.3); th.rotation.x = Math.PI / 2; this.head.add(th); }
            this._eye(this.head, -0.14, 0.18, 0.1, 0.05, 0xffee44, true);
            this._eye(this.head, 0.14, 0.18, 0.1, 0.05, 0xffee44, true);
            this.head.position.set(0, 1.1, 0.6); this.bodyGroup.add(this.head);

            // Thorned vine legs (paw feet = root clumps).
            this.frontLeft  = this._leg(this._mat(0x2f5a2a, 1.0, 0.7), -0.24, 0.4, 0.9, 0.95, 'paw');
            this.frontRight = this._leg(this._mat(0x2f5a2a, 1.0, 0.7), 0.24, 0.4, 0.9, 0.95, 'paw');
            this.rearLeft   = this._leg(this._mat(0x2f5a2a, 1.0, 0.7), -0.24, -0.42, 0.9, 0.95, 'paw');
            this.rearRight  = this._leg(this._mat(0x2f5a2a, 1.0, 0.7), 0.24, -0.42, 0.9, 0.95, 'paw');
            // Thorned tail vine.
            this.tail = this._tail(this._mat(0x2f5a2a, 1.0, 0.7), 0.96, -0.58, 6, 0.88, 0.8);
            for (let i = 0; i < 4; i++) { const th = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 4), this._mat(0xffe0e8, 1.0, 0.4)); th.position.set((i % 2 ? 0.08 : -0.08), -i * 0.13, 0); th.rotation.z = i % 2 ? -0.7 : 0.7; this.tail.add(th); }
            this._wireQuad({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Mianni: animated crayon scribble that defies physics ─────────────
        _buildMianni(fur) {
            const p = this.profile;
            const palette = [0xff4444, 0xffcc22, 0x44cc55, 0x4488ff, 0xcc55dd];
            const crayonMat = (i) => this._mat(palette[i % palette.length], 1.0, 0.5, palette[i % palette.length]);
            // Wobbly stacked-crayon torso, each a tilted cylinder.
            this.body = new THREE.Group();
            for (let i = 0; i < 4; i++) { const cr = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.34, 8), crayonMat(i)); const tip = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.16, 8), crayonMat(i + 2)); tip.position.y = 0.24; cr.add(tip); cr.position.set(Math.sin(i * 1.3) * 0.12, i * 0.3, Math.cos(i * 1.7) * 0.1); cr.rotation.set(this.idRand() * 0.6 - 0.3, 0, this.idRand() * 0.6 - 0.3); this.body.add(cr); }
            this.body.position.set(0, 0.9, 0); this.bodyGroup.add(this.body);

            // Floating scribble head (defies gravity, no neck).
            this.head = new THREE.Group();
            const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), crayonMat(1)); ball.scale.set(1.1, 0.9, 1.0); this.head.add(ball);
            // Squiggly antennae.
            for (const ax of [-0.12, 0.12]) { const sq = new THREE.Mesh(new THREE.TorusKnotGeometry(0.06, 0.02, 24, 4), crayonMat(3)); sq.position.set(ax, 0.34, 0); this.head.add(sq); }
            this._eye(this.head, -0.1, 0.05, 0.26, 0.07, 0x000000, false);
            this._eye(this.head, 0.12, 0.02, 0.25, 0.06, 0x000000, false);
            this.head.position.set(0, 2.05, 0.12); this.bodyGroup.add(this.head);

            // Detached floating crayon limbs (no joints, physics ignored).
            this.frontLeft  = this._nub(crayonMat(0), -0.5, 1.3, 0.0, 0.1);
            this.frontRight = this._nub(crayonMat(2), 0.5, 1.5, 0.0, 0.1);
            this.rearLeft   = this._nub(crayonMat(3), -0.42, 0.5, 0.0, 0.12);
            this.rearRight  = this._nub(crayonMat(4), 0.42, 0.55, 0.0, 0.12);
            this.tail = this._nub(crayonMat(1), 0, 0.6, -0.5, 0.13);
            // A scribble is drawn, not jointed: the head and the four limbs
            // hang off the body in the air by design.
            this._floaters = [this.head, this.frontLeft, this.frontRight, this.rearLeft, this.rearRight, this.tail];
            this._wireQuad({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Palette Phantom: spectral cat trailing rainbow haze ──────────────
        _buildPalettephantom(fur) {
            const p = this.profile;
            const ghost = this._mat(p.bodyColor, 0.5, 0.3, p.bodyColor);
            this.body = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 1.1, 12), ghost); torso.rotation.x = Math.PI / 2; this.body.add(torso);
            const chest = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), ghost); chest.position.z = 0.5; this.body.add(chest);
            // Drifting colour orbs around the body.
            for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const c = new THREE.Color().setHSL((i / 6 + this.idRand()) % 1, 0.9, 0.6); const orb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), this._mat(c.getHex(), 0.7, 0.3, c.getHex())); orb.position.set(Math.cos(a) * 0.34, 0.08 + Math.sin(a) * 0.2, -0.1); this.body.add(orb); }
            this.body.position.set(0, 0.98, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this.head.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), ghost));
            const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.14, 8), ghost); muzzle.rotation.x = Math.PI / 2; muzzle.position.set(0, -0.05, 0.18); this.head.add(muzzle);
            for (const ex of [-0.13, 0.13]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.16, 6), ghost); ear.position.set(ex, 0.21, 0); this.head.add(ear); }
            this._eye(this.head, -0.1, 0.04, 0.18, 0.05, p.accent, true);
            this._eye(this.head, 0.1, 0.04, 0.18, 0.05, p.accent, true);
            this.head.position.set(0, 1.06, 0.6); this.bodyGroup.add(this.head);

            this.frontLeft  = this._leg(ghost, -0.18, 0.42, 0.84, 0.86, 'pad');
            this.frontRight = this._leg(ghost, 0.18, 0.42, 0.84, 0.86, 'pad');
            this.rearLeft   = this._leg(ghost, -0.18, -0.44, 0.84, 0.86, 'pad');
            this.rearRight  = this._leg(ghost, 0.18, -0.44, 0.84, 0.86, 'pad');
            // Wispy spectral tail dissolving into colour.
            this.tail = this._tail(this._mat(p.accent, 0.55, 0.3, p.accent), 0.98, -0.6, 7, 0.92, 0.7);
            this._wireQuad({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Radiant Unicorn: equine body + spiraling horn of light ───────────
        _buildRadiantunicorn(fur) {
            const p = this.profile;
            this.body = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.27, 1.0, 12), fur); torso.rotation.x = Math.PI / 2; this.body.add(torso);
            const chest = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), fur); chest.position.z = 0.46; this.body.add(chest);
            // Flowing mane crest along the neck/back.
            for (let i = 0; i < 5; i++) { const c = new THREE.Color().setHSL((i / 5 * 0.3 + 0.5) % 1, 0.6, 0.7); const m = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 5), this._mat(c.getHex(), 0.85, 0.4, c.getHex())); m.position.set(0, 0.26, 0.36 - i * 0.16); m.rotation.x = -0.5; this.body.add(m); }
            this.body.position.set(0, 1.18, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.55, 10), fur); neck.rotation.x = 0.45; neck.position.set(0, 0.18, 0.0); this.head.add(neck);
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 12), fur); skull.scale.set(0.8, 0.9, 1.3); skull.position.set(0, 0.5, 0.2); this.head.add(skull);
            const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.2, 8), fur); muzzle.rotation.x = Math.PI / 2; muzzle.position.set(0, 0.45, 0.42); this.head.add(muzzle);
            for (const ex of [-0.09, 0.09]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 5), fur); ear.position.set(ex, 0.64, 0.06); this.head.add(ear); }
            // Spiral horn of light made of stacked, twisting cones.
            const hornMat = this._mat(p.accent, 1.0, 0.2, p.accent);
            for (let i = 0; i < 5; i++) { const seg = new THREE.Mesh(new THREE.ConeGeometry(0.07 - i * 0.012, 0.12, 6), hornMat); seg.position.set(Math.sin(i * 1.2) * 0.02, 0.66 + i * 0.1, 0.32); seg.rotation.y = i * 0.6; this.head.add(seg); }
            this._eye(this.head, -0.1, 0.5, 0.3, 0.04, 0x4466cc, true);
            this._eye(this.head, 0.1, 0.5, 0.3, 0.04, 0x4466cc, true);
            this.head.position.set(0, 1.28, 0.5); this.bodyGroup.add(this.head);

            this.frontLeft  = this._leg(fur, -0.22, 0.42, 1.08, 1.12, 'hoof');
            this.frontRight = this._leg(fur, 0.22, 0.42, 1.08, 1.12, 'hoof');
            this.rearLeft   = this._leg(fur, -0.22, -0.44, 1.08, 1.12, 'hoof');
            this.rearRight  = this._leg(fur, 0.22, -0.44, 1.08, 1.12, 'hoof');
            this.tail = this._tail(this._mat(0xffffff, 0.9, 0.5, p.accent), 1.2, -0.58, 6, 0.9, 0.5);
            this._wireQuad({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Rhinobeetle: chitin carapace, head horn, mandibles, six legs ─────
        _buildRhinobeetle(fur) {
            const p = this.profile;
            const chitin = this.applySkin(this._mat(p.bodyColor, 1.0, 0.35));
            this.body = new THREE.Group();
            // Rounded carapace shell.
            const carapace = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 12), chitin); carapace.scale.set(1.0, 0.7, 1.5); this.body.add(carapace);
            const thorax = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 12), chitin); thorax.scale.set(1.0, 0.7, 1.0); thorax.position.z = 0.5; this.body.add(thorax);
            // Wing-case seam ridge.
            const seam = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.9), this._mat(p.accent, 1.0, 0.4)); seam.position.set(0, 0.34, -0.1); this.body.add(seam);
            this.body.position.set(0, 0.78, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), chitin); skull.scale.set(1.1, 0.8, 0.9); this.head.add(skull);
            // Big upward rhino horn.
            const horn = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.5, 7), this._mat(p.accent, 1.0, 0.4)); horn.position.set(0, 0.28, 0.18); horn.rotation.x = -0.4; this.head.add(horn);
            // Razor mandibles.
            for (const mx of [-0.1, 0.1]) { const md = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.26, 5), this._mat(0x100a08, 1.0, 0.3)); md.position.set(mx, -0.08, 0.24); md.rotation.set(1.4, 0, mx > 0 ? -0.4 : 0.4); this.head.add(md); }
            this._eye(this.head, -0.13, 0.06, 0.14, 0.05, 0x080606, false);
            this._eye(this.head, 0.13, 0.06, 0.14, 0.05, 0x080606, false);
            this.head.position.set(0, 0.82, 0.66); this.bodyGroup.add(this.head);

            // Six insect legs (rear pair maps to tail slot via extra nubs).
            this.frontLeft  = this._leg(chitin, -0.34, 0.42, 0.7, 0.7, 'pad');
            this.frontRight = this._leg(chitin, 0.34, 0.42, 0.7, 0.7, 'pad');
            this.rearLeft   = this._leg(chitin, -0.36, -0.42, 0.7, 0.72, 'pad');
            this.rearRight  = this._leg(chitin, 0.36, -0.42, 0.7, 0.72, 'pad');
            this._leg(chitin, -0.36, 0.0, 0.7, 0.72, 'pad'); this._leg(chitin, 0.36, 0.0, 0.7, 0.72, 'pad');
            this.tail = this._nub(chitin, 0, 0.78, -0.72, 0.12);
            this._wireQuad({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Rummaging Opossum: low marsupial, pointed snout, naked tail ──────
        _buildRummagingopossum(fur) {
            const p = this.profile;
            this.body = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 12), fur); torso.scale.set(1.0, 0.85, 1.4); this.body.add(torso);
            const rump = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), fur); rump.position.z = -0.4; this.body.add(rump);
            this.body.position.set(0, 0.74, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), this._mat(0xe8e4dc, 1.0, 0.7)); skull.scale.set(0.9, 0.9, 1.0); this.head.add(skull);
            // Long pointed pink snout.
            const snout = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.34, 8), this._mat(0xe8e4dc, 1.0, 0.7)); snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.06, 0.28); this.head.add(snout);
            const nose = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), this._mat(p.accent, 1.0, 0.5)); nose.position.set(0, -0.06, 0.46); this.head.add(nose);
            for (const ex of [-0.15, 0.15]) { const ear = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), this._mat(0x2a1a1a, 1.0, 0.6)); ear.position.set(ex, 0.2, -0.04); ear.scale.set(1, 1, 0.3); this.head.add(ear); }
            this._eye(this.head, -0.1, 0.06, 0.18, 0.045, 0x080606, false);
            this._eye(this.head, 0.1, 0.06, 0.18, 0.045, 0x080606, false);
            this.head.position.set(0, 0.86, 0.56); this.bodyGroup.add(this.head);

            this.frontLeft  = this._leg(fur, -0.24, 0.36, 0.62, 0.62, 'paw');
            this.frontRight = this._leg(fur, 0.24, 0.36, 0.62, 0.62, 'paw');
            this.rearLeft   = this._leg(fur, -0.24, -0.38, 0.62, 0.62, 'paw');
            this.rearRight  = this._leg(fur, 0.24, -0.38, 0.62, 0.62, 'paw');
            // Long bare prehensile tail.
            this.tail = this._tail(this._mat(0xc8b8a8, 1.0, 0.7), 0.74, -0.5, 7, 0.88, 0.6);
            this._wireQuad({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Beast 666: many-horned apocalyptic chimera ───────────────────────
        _buildBeast666(fur) {
            const p = this.profile;
            this.body = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.32, 1.2, 12), fur); torso.rotation.x = Math.PI / 2; this.body.add(torso);
            const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 12), fur); shoulders.position.z = 0.52; this.body.add(shoulders);
            // Scattered horns bristling from the back.
            const hornMat = this._mat(0x1a0606, 1.0, 0.5, p.accent);
            for (let i = 0; i < 8; i++) { const a = this.idRand() * Math.PI * 2; const h = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.34, 5), hornMat); h.position.set(Math.cos(a) * 0.28, 0.28, 0.4 - i * 0.13); h.rotation.set(this.idRand() * 0.6, 0, Math.cos(a) * 0.9); this.body.add(h); }
            // Glowing 666 brand sigil.
            const brand = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 6, 16), this._mat(p.accent, 1.0, 0.3, p.accent)); brand.position.set(0, 0.36, 0.5); this.body.add(brand);
            this.body.position.set(0, 1.12, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12), fur); skull.scale.set(1.0, 0.9, 1.1); this.head.add(skull);
            const snout = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.36, 7), fur); snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.06, 0.3); this.head.add(snout);
            const maw = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), this._mat(p.accent, 1.0, 0.3, p.accent)); maw.position.set(0, -0.06, 0.46); this.head.add(maw);
            // Crown of seven curled horns.
            for (let i = 0; i < 7; i++) { const a = (i / 6 - 0.5) * Math.PI; const h = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 6, 10, Math.PI), hornMat); h.position.set(Math.sin(a) * 0.24, 0.24, -0.06); h.rotation.set(0.6, a, Math.cos(a) * 0.5); this.head.add(h); }
            this._eye(this.head, -0.12, 0.06, 0.22, 0.06, p.accent, true);
            this._eye(this.head, 0.12, 0.06, 0.22, 0.06, p.accent, true);
            this._eye(this.head, 0, 0.22, 0.2, 0.05, p.accent, true);
            this.head.position.set(0, 1.34, 0.58); this.bodyGroup.add(this.head);

            this.frontLeft  = this._leg(fur, -0.3, 0.44, 1.04, 1.08, 'paw');
            this.frontRight = this._leg(fur, 0.3, 0.44, 1.04, 1.08, 'paw');
            this.rearLeft   = this._leg(fur, -0.3, -0.46, 1.04, 1.08, 'hoof');
            this.rearRight  = this._leg(fur, 0.3, -0.46, 1.04, 1.08, 'hoof');
            this.tail = this._tail(this._mat(0x1a0606, 1.0, 0.5, p.accent), 1.14, -0.64, 6, 0.88, 0.7);
            const sting = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 6), this._mat(p.accent, 1.0, 0.3, p.accent)); sting.position.set(0, -0.6, 0.4); this.tail.add(sting);
            this._wireQuad({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Tempest Pegasus: winged horse spinning miniature tornadoes ───────
        _buildTempestpegasus(fur) {
            const p = this.profile;
            this.body = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.27, 1.0, 12), fur); torso.rotation.x = Math.PI / 2; this.body.add(torso);
            const chest = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), fur); chest.position.z = 0.46; this.body.add(chest);
            // Feathered wings: stacked tapering feather cones each side.
            const featherMat = this._mat(0xeef4fa, 0.95, 0.6);
            for (const side of [-1, 1]) { const wing = new THREE.Group(); for (let i = 0; i < 5; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.55 - i * 0.05, 5), featherMat); f.position.set(side * (0.1 + i * 0.12), i * 0.04, -0.05 - i * 0.06); f.rotation.set(Math.PI / 2, 0, side * (0.5 + i * 0.12)); wing.add(f); } wing.position.set(side * 0.28, 0.22, 0.05); this.body.add(wing); }
            this.body.position.set(0, 1.2, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.55, 10), fur); neck.rotation.x = 0.45; neck.position.set(0, 0.18, 0.0); this.head.add(neck);
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 12), fur); skull.scale.set(0.8, 0.9, 1.3); skull.position.set(0, 0.5, 0.2); this.head.add(skull);
            const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.2, 8), fur); muzzle.rotation.x = Math.PI / 2; muzzle.position.set(0, 0.45, 0.42); this.head.add(muzzle);
            for (const ex of [-0.09, 0.09]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 5), fur); ear.position.set(ex, 0.64, 0.06); this.head.add(ear); }
            this._eye(this.head, -0.1, 0.5, 0.3, 0.04, p.accent, true);
            this._eye(this.head, 0.1, 0.5, 0.3, 0.04, p.accent, true);
            this.head.position.set(0, 1.3, 0.5); this.bodyGroup.add(this.head);

            this.frontLeft  = this._leg(fur, -0.22, 0.42, 1.1, 1.14, 'hoof');
            this.frontRight = this._leg(fur, 0.22, 0.42, 1.1, 1.14, 'hoof');
            this.rearLeft   = this._leg(fur, -0.22, -0.44, 1.1, 1.14, 'hoof');
            this.rearRight  = this._leg(fur, 0.22, -0.44, 1.1, 1.14, 'hoof');
            // Tail trailing into a swirling vortex of wind.
            this.tail = new THREE.Group();
            for (let i = 0; i < 5; i++) { const r = 0.18 - i * 0.025; const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.025, 6, 14), this._mat(p.accent, 0.6, 0.3, p.accent)); ring.position.set(0, -i * 0.14, 0.05); ring.rotation.x = Math.PI / 2; this.tail.add(ring); }
            this.tail.position.set(0, 1.2, -0.6); this.bodyGroup.add(this.tail);
            this._wireQuad({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Velocicorn: lightning-swift slim equine with a spiral horn ───────
        _buildVelocicorn(fur) {
            const p = this.profile;
            this.body = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 1.05, 12), fur); torso.rotation.x = Math.PI / 2; this.body.add(torso);
            const chest = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12), fur); chest.position.z = 0.48; this.body.add(chest);
            // Crackling speed-bolts streaming off the rump.
            for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.4, 4), this._mat(p.accent, 0.85, 0.3, p.accent)); b.position.set((i % 2 ? 0.18 : -0.18), 0.1, -0.6 - i * 0.08); b.rotation.x = Math.PI / 2 + 0.3; this.body.add(b); }
            this.body.position.set(0, 1.16, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.5, 10), fur); neck.rotation.x = 0.5; neck.position.set(0, 0.16, 0.0); this.head.add(neck);
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 12), fur); skull.scale.set(0.8, 0.9, 1.35); skull.position.set(0, 0.46, 0.22); this.head.add(skull);
            const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.2, 8), fur); muzzle.rotation.x = Math.PI / 2; muzzle.position.set(0, 0.42, 0.44); this.head.add(muzzle);
            for (const ex of [-0.08, 0.08]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 5), fur); ear.position.set(ex, 0.6, 0.08); this.head.add(ear); }
            // Long forward spiral horn (twisting stacked cones).
            const hornMat = this._mat(p.accent, 1.0, 0.2, p.accent);
            for (let i = 0; i < 6; i++) { const seg = new THREE.Mesh(new THREE.ConeGeometry(0.06 - i * 0.008, 0.13, 6), hornMat); seg.position.set(Math.sin(i * 1.4) * 0.015, 0.5 + i * 0.02, 0.5 + i * 0.11); seg.rotation.set(1.2, i * 0.7, 0); this.head.add(seg); }
            this._eye(this.head, -0.1, 0.46, 0.32, 0.04, p.accent, true);
            this._eye(this.head, 0.1, 0.46, 0.32, 0.04, p.accent, true);
            this.head.position.set(0, 1.26, 0.52); this.bodyGroup.add(this.head);

            this.frontLeft  = this._leg(fur, -0.2, 0.42, 1.06, 1.12, 'hoof');
            this.frontRight = this._leg(fur, 0.2, 0.42, 1.06, 1.12, 'hoof');
            this.rearLeft   = this._leg(fur, -0.2, -0.44, 1.06, 1.12, 'hoof');
            this.rearRight  = this._leg(fur, 0.2, -0.44, 1.06, 1.12, 'hoof');
            this.tail = this._tail(this._mat(p.accent, 0.8, 0.4, p.accent), 1.18, -0.58, 5, 0.88, 0.6);
            this._wireQuad({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Swamp Leviathan: colossal heavy-legged marsh monstrosity ─────────
        _buildSwampleviathan(fur) {
            const p = this.profile;
            this.body = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.SphereGeometry(0.6, 14, 12), fur); torso.scale.set(1.2, 0.95, 1.7); this.body.add(torso);
            const back = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 12), fur); back.scale.set(1.1, 0.8, 1.2); back.position.set(0, 0.22, -0.1); this.body.add(back);
            // Mossy plated ridges down the spine.
            for (let i = 0; i < 6; i++) { const pl = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 4), this._mat(p.accent, 1.0, 0.85)); pl.position.set(0, 0.42, 0.5 - i * 0.22); this.body.add(pl); }
            this.body.position.set(0, 1.3, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 12), fur); skull.scale.set(1.0, 0.8, 1.3); this.head.add(skull);
            const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.5), fur); jaw.position.set(0, -0.18, 0.26); this.head.add(jaw);
            for (let i = 0; i < 6; i++) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 4), this._mat(0xd8d0b0, 1.0, 0.4)); t.position.set(-0.22 + i * 0.088, -0.1, 0.46); t.rotation.x = Math.PI; this.head.add(t); }
            this._eye(this.head, -0.18, 0.14, 0.28, 0.06, p.accent, true);
            this._eye(this.head, 0.18, 0.14, 0.28, 0.06, p.accent, true);
            this.head.position.set(0, 1.46, 0.94); this.bodyGroup.add(this.head);

            this.frontLeft  = this._leg(fur, -0.42, 0.5, 1.18, 1.2, 'paw');
            this.frontRight = this._leg(fur, 0.42, 0.5, 1.18, 1.2, 'paw');
            this.rearLeft   = this._leg(fur, -0.42, -0.52, 1.18, 1.2, 'paw');
            this.rearRight  = this._leg(fur, 0.42, -0.52, 1.18, 1.2, 'paw');
            this.tail = this._tail(fur, 1.3, -0.85, 6, 0.9, 0.4);
            this._wireQuad({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Inverted Hunger: inside-out maw-beast, gaping ring of teeth ──────
        _buildInvertedhunger(fur) {
            const p = this.profile;
            const flesh = this._mat(p.bodyColor, 1.0, 0.85);
            const innerMat = this._mat(p.accent, 1.0, 0.6, p.accent);
            this.body = new THREE.Group();
            // Torus body: the creature IS a ring-shaped mouth turned outward.
            const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.26, 14, 20), flesh); ring.rotation.x = Math.PI / 2; this.body.add(ring);
            // Glowing inverted gullet pulled through the middle.
            const gullet = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), innerMat); gullet.scale.set(1, 1, 0.6); this.body.add(gullet);
            // Inward-facing teeth ringing the maw.
            for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const t = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.24, 4), this._mat(0xf4e8d8, 1.0, 0.4)); t.position.set(Math.cos(a) * 0.42, Math.sin(a) * 0.42, 0.18); t.lookAt(0, 0, 0.6); this.body.add(t); }
            this.body.position.set(0, 1.2, 0); this.bodyGroup.add(this.body);

            // "Head" = the pulsing core uvula deep in the throat.
            this.head = new THREE.Group();
            this.head.add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), innerMat));
            this._eye(this.head, -0.07, 0.0, 0.14, 0.05, 0x111111, false);
            this._eye(this.head, 0.07, 0.0, 0.14, 0.05, 0x111111, false);
            this.head.position.set(0, 1.2, 0.05); this.bodyGroup.add(this.head);

            // Fleshy tendril feet hanging from the underside of the ring down
            // to the ground, pivoted where they leave the flesh.
            const tendril = (x, z) => {
                const g = new THREE.Group();
                const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.06, 0.95, 7), flesh); stalk.position.y = -0.47; g.add(stalk);
                const pad = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), flesh); pad.scale.y = 0.6; pad.position.y = -0.95; g.add(pad);
                g.position.set(x, 1.08, z); this.bodyGroup.add(g); return g;
            };
            this.frontLeft  = tendril(-0.3, 0.3);
            this.frontRight = tendril(0.3, 0.3);
            this.rearLeft   = tendril(-0.3, -0.3);
            this.rearRight  = tendril(0.3, -0.3);
            this.tail = this._tail(flesh, 1.2, -0.6, 4, 0.8, -0.5);
            this._wireQuad({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Void Howler: shadow bear leaking tendrils of pure darkness ───────
        _buildVoidhowler(fur) {
            const p = this.profile;
            const voidMat = this._mat(p.bodyColor, 0.92, 0.4, 0x1a0a2a);
            this.body = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 12), voidMat); torso.scale.set(1.0, 0.95, 1.5); this.body.add(torso);
            const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.46, 12, 12), voidMat); shoulders.position.set(0, 0.16, 0.46); this.body.add(shoulders);
            // Writhing void tendrils sprouting from the back.
            const tendrilMat = this._mat(p.accent, 0.8, 0.2, p.accent);
            for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const td = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.55, 5), tendrilMat); td.position.set(Math.cos(a) * 0.3, 0.34, -0.05 + Math.sin(a) * 0.2); td.rotation.set(Math.sin(a) * 0.8, 0, Math.cos(a) * 0.8); this.body.add(td); }
            this.body.position.set(0, 1.05, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this.head.add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12), voidMat));
            const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.3, 10), voidMat); snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.05, 0.32); this.head.add(snout);
            // Glowing void maw mid-howl.
            const maw = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), this._mat(p.accent, 1.0, 0.3, p.accent)); maw.position.set(0, -0.06, 0.44); this.head.add(maw);
            for (const ex of [-0.2, 0.2]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 5), voidMat); ear.position.set(ex, 0.3, -0.02); this.head.add(ear); }
            this._eye(this.head, -0.13, 0.08, 0.24, 0.06, p.accent, true);
            this._eye(this.head, 0.13, 0.08, 0.24, 0.06, p.accent, true);
            this.head.position.set(0, 1.5, 0.6); this.bodyGroup.add(this.head);

            this.frontLeft  = this._leg(voidMat, -0.32, 0.42, 0.92, 0.95, 'paw');
            this.frontRight = this._leg(voidMat, 0.32, 0.42, 0.92, 0.95, 'paw');
            this.rearLeft   = this._leg(voidMat, -0.32, -0.42, 0.92, 0.95, 'paw');
            this.rearRight  = this._leg(voidMat, 0.32, -0.42, 0.92, 0.95, 'paw');
            this.tail = this._tail(tendrilMat, 1.0, -0.74, 5, 0.85, 0.7);
            this._wireQuad({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Feast of Famine: banquet table whose food is its own flesh ───────
        _buildFeastoffamine(fur) {
            const p = this.profile;
            const wood = this._mat(0x4a3220, 1.0, 0.7);
            const flesh = this._mat(p.accent, 1.0, 0.7, 0x2a0808);
            this.body = new THREE.Group();
            // Flat table-top slab body.
            const top = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 1.0), wood); top.position.y = 0.1; this.body.add(top);
            // Heaped fleshy "dishes" laid out across the table.
            for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; const r = 0.5; const lump = new THREE.Mesh(new THREE.SphereGeometry(0.13 + this.idRand() * 0.06, 10, 10), flesh); lump.scale.set(1, 0.7, 1); lump.position.set(Math.cos(a) * r * 1.3, 0.22, Math.sin(a) * r * 0.8); this.body.add(lump); }
            // A central roast: a big lobe of regenerating meat.
            const roast = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), flesh); roast.scale.set(1.3, 0.7, 0.9); roast.position.set(0, 0.26, 0); this.body.add(roast);
            this.body.position.set(0, 0.95, 0); this.bodyGroup.add(this.body);

            // A pleading face peering up from the spread.
            this.head = new THREE.Group();
            this.head.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), flesh));
            const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), this._mat(0x1a0606, 1.0, 0.4)); mouth.position.set(0, -0.1, 0.16); this.head.add(mouth);
            this._eye(this.head, -0.08, 0.04, 0.18, 0.05, 0xffee88, true);
            this._eye(this.head, 0.08, 0.04, 0.18, 0.05, 0xffee88, true);
            this.head.position.set(0, 1.32, 0.36); this.bodyGroup.add(this.head);

            // Four carved table legs.
            // Hips tucked up under the slab, so the legs carry the table.
            this.frontLeft  = this._leg(wood, -0.6, 0.4, 0.99, 0.99, 'pad');
            this.frontRight = this._leg(wood, 0.6, 0.4, 0.99, 0.99, 'pad');
            this.rearLeft   = this._leg(wood, -0.6, -0.4, 0.99, 0.99, 'pad');
            this.rearRight  = this._leg(wood, 0.6, -0.4, 0.99, 0.99, 'pad');
            this.tail = this._nub(flesh, 0, 1.0, -0.55, 0.14);
            this._wireQuad({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Maternity Ward: bloated brood-beast mimicking a pregnant woman ───
        _buildMaternityward(fur) {
            const p = this.profile;
            const skin = this._mat(p.bodyColor, 1.0, 0.75);
            this.body = new THREE.Group();
            // Grotesquely swollen distended belly.
            const belly = new THREE.Mesh(new THREE.SphereGeometry(0.58, 16, 14), skin); belly.scale.set(1.0, 1.1, 1.0); this.body.add(belly);
            // Smaller squirming broodlings bulging through the skin.
            for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const b = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), this._mat(p.accent, 1.0, 0.6, 0x3a0a0a)); b.position.set(Math.cos(a) * 0.5, -0.05 + Math.sin(a) * 0.25, 0.42); this.body.add(b); }
            // A torn birthing slit emitting glow.
            const slit = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), this._mat(0x2a0808, 1.0, 0.4, p.accent)); slit.scale.set(0.5, 1.4, 0.5); slit.position.set(0, -0.4, 0.5); this.body.add(slit);
            this.body.position.set(0, 1.1, 0); this.bodyGroup.add(this.body);

            // Gaunt mimicked human-ish head atop the bloat.
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12), skin); skull.scale.set(0.9, 1.1, 0.9); this.head.add(skull);
            const hair = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10, 0, Math.PI * 2, 0, Math.PI / 1.6), this._mat(0x2a1c18, 1.0, 0.8)); hair.position.y = 0.04; this.head.add(hair);
            const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), this._mat(0x1a0606, 1.0, 0.4)); mouth.position.set(0, -0.12, 0.2); mouth.scale.set(1.4, 0.6, 0.6); this.head.add(mouth);
            this._eye(this.head, -0.09, 0.04, 0.2, 0.05, p.accent, true);
            this._eye(this.head, 0.09, 0.04, 0.2, 0.05, p.accent, true);
            this.head.position.set(0, 1.92, 0.18); this.bodyGroup.add(this.head);

            // Thin spindly limbs clutching the belly.
            this.frontLeft  = this._leg(skin, -0.46, 0.32, 1.5, 0.7, 'pad');
            this.frontRight = this._leg(skin, 0.46, 0.32, 1.5, 0.7, 'pad');
            this.rearLeft   = this._leg(skin, -0.3, -0.2, 0.62, 0.66, 'pad');
            this.rearRight  = this._leg(skin, 0.3, -0.2, 0.62, 0.66, 'pad');
            this.tail = this._nub(this._mat(p.accent, 1.0, 0.6, 0x3a0a0a), 0, 0.7, -0.5, 0.14);
            this._wireQuad({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Starving Saber-Cat: gaunt sabertooth, ribs showing, huge fangs ───
        // Still a cat: half-starved and pleading rather than skeletal.
        _buildStarvingsabercat(fur) {
            this._felineBase(fur, { sizeBody: 0.95, slim: 0.82, fangs: 0.34, fangColor: 0xe8e0c8, ear: 'tuft', eyeGlow: true, legLen: 0.92, ribs: true });
        }

        // ── Ashen Prowler: ash-grey feral canine, slung-low stalking gait ────
        _buildAshenprowler(fur) {
            const p = this.profile;
            this.body = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 1.1, 12), fur); torso.rotation.x = Math.PI / 2; this.body.add(torso);
            const chest = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12), fur); chest.position.z = 0.5; this.body.add(chest);
            const rump = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), fur); rump.position.z = -0.52; this.body.add(rump);
            // Drifting ash motes clinging to its coat.
            for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), this._mat(0xbfbcb6, 0.6, 0.9)); m.position.set(Math.sin(i * 1.7) * 0.18, 0.24 + i * 0.02, 0.4 - i * 0.2); this.body.add(m); }
            this.body.position.set(0, 0.92, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 12), fur); skull.scale.set(0.9, 0.85, 1.05); skull.position.set(0, 0.2, 0.16); this.head.add(skull);
            const snout = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.36, 8), fur); snout.rotation.x = Math.PI / 2; snout.position.set(0, 0.16, 0.42); this.head.add(snout);
            for (const ex of [-0.1, 0.1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 5), fur); ear.position.set(ex, 0.4, 0.04); this.head.add(ear); }
            this._eye(this.head, -0.09, 0.22, 0.28, 0.045, p.accent, true);
            this._eye(this.head, 0.09, 0.22, 0.28, 0.045, p.accent, true);
            this.head.position.set(0, 1.0, 0.52); this.bodyGroup.add(this.head);

            this.frontLeft  = this._leg(fur, -0.2, 0.42, 0.84, 0.9, 'pad');
            this.frontRight = this._leg(fur, 0.2, 0.42, 0.84, 0.9, 'pad');
            this.rearLeft   = this._leg(fur, -0.2, -0.44, 0.84, 0.9, 'pad');
            this.rearRight  = this._leg(fur, 0.2, -0.44, 0.84, 0.9, 'pad');
            this.tail = this._tail(fur, 0.92, -0.66, 5, 0.82, -0.5);
            this._wireQuad({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Gaunt Snapper: hollow-eyed emaciated beast, oversized snapping jaws ─
        _buildGauntsnapper(fur) {
            const p = this.profile;
            this.body = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.16, 1.05, 10), fur); torso.rotation.x = Math.PI / 2; this.body.add(torso);
            const hips = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 10), fur); hips.scale.set(1.1, 0.8, 1.0); hips.position.z = -0.46; this.body.add(hips);
            for (let i = 0; i < 5; i++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.02, 6, 12), this._mat(0xc8c0a8, 1.0, 0.5)); rib.rotation.y = Math.PI / 2; rib.position.set(0, 0, 0.36 - i * 0.15); this.body.add(rib); }
            this.body.position.set(0, 0.95, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), fur); skull.scale.set(0.8, 0.8, 1.0); skull.position.y = 0.06; this.head.add(skull);
            // Oversized upper + lower snapping jaw.
            const upper = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.42), fur); upper.position.set(0, 0.02, 0.34); this.head.add(upper);
            const lower = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.09, 0.4), fur); lower.position.set(0, -0.14, 0.32); this.head.add(lower);
            const fangMat = this._mat(0xfff4d0, 1.0, 0.3);
            for (let i = 0; i < 5; i++) { const tx = -0.08 + i * 0.04; const tu = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.12, 4), fangMat); tu.position.set(tx, -0.04, 0.5); tu.rotation.x = Math.PI; this.head.add(tu); const tl = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.12, 4), fangMat); tl.position.set(tx, -0.1, 0.48); this.head.add(tl); }
            // Hollow glowing eye sockets.
            this._eye(this.head, -0.09, 0.1, 0.16, 0.055, p.accent, true);
            this._eye(this.head, 0.09, 0.1, 0.16, 0.055, p.accent, true);
            this.head.position.set(0, 1.04, 0.58); this.bodyGroup.add(this.head);

            this.frontLeft  = this._leg(fur, -0.17, 0.4, 0.9, 0.96, 'paw');
            this.frontRight = this._leg(fur, 0.17, 0.4, 0.9, 0.96, 'paw');
            this.rearLeft   = this._leg(fur, -0.17, -0.42, 0.86, 0.92, 'paw');
            this.rearRight  = this._leg(fur, 0.17, -0.42, 0.86, 0.92, 'paw');
            this.tail = this._tail(fur, 0.95, -0.58, 4, 0.74, 0.6);
            this._wireQuad({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Hollow-Eyed Boar: rabid boar, empty glowing sockets, tusks, hump ─
        _buildHolloweyedboar(fur) {
            const p = this.profile;
            this.body = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 12), fur); torso.scale.set(1.0, 0.85, 1.55); this.body.add(torso);
            const hump = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 12), fur); hump.scale.set(1.0, 1.15, 0.9); hump.position.set(0, 0.24, 0.42); this.body.add(hump);
            // Ragged raised bristles down the hump.
            for (let i = 0; i < 7; i++) { const b = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.3, 4), this._mat(0x140d0a, 1.0, 0.9)); b.position.set(0, 0.34 + Math.sin(i / 6 * Math.PI) * 0.06, 0.5 - i * 0.16); this.body.add(b); }
            this.body.position.set(0, 0.9, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), fur); skull.scale.set(0.9, 0.9, 1.2); this.head.add(skull);
            const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.32, 10), fur); snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.07, 0.3); this.head.add(snout);
            const tuskMat = this._mat(0xe8dcc0, 1.0, 0.4);
            for (const tx of [-0.11, 0.11]) { const tk = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.3, 6), tuskMat); tk.position.set(tx, -0.1, 0.38); tk.rotation.set(-0.8, 0, tx > 0 ? 0.35 : -0.35); this.head.add(tk); }
            for (const ex of [-0.16, 0.16]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 5), fur); ear.position.set(ex, 0.22, 0); this.head.add(ear); }
            // Empty glowing eye sockets sunk into the skull.
            for (const sx of [-0.13, 0.13]) { const socket = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), this._mat(0x000000, 1.0, 0.4)); socket.position.set(sx, 0.06, 0.16); this.head.add(socket); this._eye(this.head, sx, 0.06, 0.19, 0.035, p.accent, true); }
            // Carried off the front of the hump, not slung under the chest.
            this.head.position.set(0, 1.14, 0.68); this.bodyGroup.add(this.head);

            this.frontLeft  = this._leg(fur, -0.26, 0.38, 0.78, 0.78, 'hoof');
            this.frontRight = this._leg(fur, 0.26, 0.38, 0.78, 0.78, 'hoof');
            this.rearLeft   = this._leg(fur, -0.26, -0.4, 0.78, 0.78, 'hoof');
            this.rearRight  = this._leg(fur, 0.26, -0.4, 0.78, 0.78, 'hoof');
            this.tail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 5), fur); this.tail.position.set(0, 0.9, -0.62); this.bodyGroup.add(this.tail);
            this._wireQuad({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Feral Lynx: compact scarred cat, tufted ears, bobbed tail ────────
        _buildFerallynx(fur) {
            this._felineBase(fur, { sizeBody: 0.9, ear: 'tuft', tuftMat: this._mat(0x140d0a, 1.0, 0.9), eyeGlow: true, legLen: 0.88, tail: 'bob', scar: true });
        }

        // ── Dire Gnasher: pack predator with a huge teeth-crammed gnashing jaw ─
        _buildDiregnasher(fur) {
            const p = this.profile;
            this.body = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.22, 1.0, 12), fur); torso.rotation.x = Math.PI / 2; this.body.add(torso);
            const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), fur); shoulders.position.z = 0.46; this.body.add(shoulders);
            this.body.position.set(0, 0.98, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), fur); skull.scale.set(0.9, 0.85, 1.0); skull.position.y = 0.08; this.head.add(skull);
            // Massively oversized gnashing jaw assembly.
            const upper = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.5), fur); upper.position.set(0, 0.06, 0.36); this.head.add(upper);
            const lower = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.13, 0.46), fur); lower.position.set(0, -0.16, 0.34); this.head.add(lower);
            const fangMat = this._mat(0xfff4d0, 1.0, 0.3);
            for (let i = 0; i < 7; i++) { const tx = -0.13 + i * 0.043; const tu = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.16, 5), fangMat); tu.position.set(tx, 0.0, 0.58); tu.rotation.x = Math.PI; this.head.add(tu); const tl = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.16, 5), fangMat); tl.position.set(tx, -0.1, 0.54); this.head.add(tl); }
            for (const ex of [-0.11, 0.11]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 5), fur); ear.position.set(ex, 0.28, -0.02); this.head.add(ear); }
            this._eye(this.head, -0.1, 0.12, 0.2, 0.045, p.accent, true);
            this._eye(this.head, 0.1, 0.12, 0.2, 0.045, p.accent, true);
            this.head.position.set(0, 1.04, 0.56); this.bodyGroup.add(this.head);

            this.frontLeft  = this._leg(fur, -0.22, 0.42, 0.9, 0.96, 'paw');
            this.frontRight = this._leg(fur, 0.22, 0.42, 0.9, 0.96, 'paw');
            this.rearLeft   = this._leg(fur, -0.22, -0.44, 0.9, 0.96, 'paw');
            this.rearRight  = this._leg(fur, 0.22, -0.44, 0.9, 0.96, 'paw');
            this.tail = this._tail(fur, 0.98, -0.6, 4, 0.8, -0.3);
            this._wireQuad({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Gaunt Clawrunner: lean sprinter, huge raking foreclaws, leyline static ─
        _buildGauntclawrunner(fur) {
            const p = this.profile;
            this.body = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 1.15, 12), fur); torso.rotation.x = Math.PI / 2; this.body.add(torso);
            const chest = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), fur); chest.position.z = 0.52; this.body.add(chest);
            // Crackling static arcs along the spine.
            for (let i = 0; i < 6; i++) { const arc = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.18, 4), this._mat(p.accent, 0.8, 0.4, p.accent)); arc.position.set(Math.sin(i * 1.9) * 0.05, 0.22, 0.45 - i * 0.16); this.body.add(arc); }
            this.body.position.set(0, 0.96, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 12), fur); skull.scale.set(0.85, 0.8, 1.05); skull.position.set(0, 0.18, 0.14); this.head.add(skull);
            const snout = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.34, 8), fur); snout.rotation.x = Math.PI / 2; snout.position.set(0, 0.14, 0.4); this.head.add(snout);
            for (const ex of [-0.09, 0.09]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 5), fur); ear.position.set(ex, 0.38, 0.04); this.head.add(ear); }
            this._eye(this.head, -0.09, 0.2, 0.26, 0.045, p.accent, true);
            this._eye(this.head, 0.09, 0.2, 0.26, 0.045, p.accent, true);
            this.head.position.set(0, 1.02, 0.54); this.bodyGroup.add(this.head);

            // Long raking foreclaw blades on the front legs.
            const clawMat = this._mat(0xe8ecf0, 1.0, 0.3);
            this.frontLeft  = this._leg(fur, -0.19, 0.42, 0.9, 0.96, 'paw');
            this.frontRight = this._leg(fur, 0.19, 0.42, 0.9, 0.96, 'paw');
            for (const fg of [this.frontLeft, this.frontRight]) for (const cx of [-0.06, 0, 0.06]) { const claw = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.3, 5), clawMat); claw.position.set(cx, -0.9, 0.2); claw.rotation.x = 1.4; fg.add(claw); }
            this.rearLeft   = this._leg(fur, -0.19, -0.44, 0.86, 0.92, 'pad');
            this.rearRight  = this._leg(fur, 0.19, -0.44, 0.86, 0.92, 'pad');
            this.tail = this._tail(fur, 0.96, -0.6, 5, 0.82, -0.4);
            this._wireQuad({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Bloodmaw Direwolf: huge mangy wolf, blood-soaked maw, bushy tail ─
        _buildBloodmawdirewolf(fur) {
            const p = this.profile;
            this.body = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.15, 12), fur); torso.rotation.x = Math.PI / 2; this.body.add(torso);
            const chest = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 12), fur); chest.position.z = 0.54; this.body.add(chest);
            const rump = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), fur); rump.position.z = -0.58; this.body.add(rump);
            // Mangy raised hackles down the back.
            for (let i = 0; i < 7; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.26, 5), fur); sp.position.set(0, 0.3, 0.45 - i * 0.17); this.body.add(sp); }
            this.body.position.set(0, 1.1, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), fur); skull.scale.set(0.9, 0.85, 1.1); skull.position.set(0, 0.24, 0.16); this.head.add(skull);
            const snout = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.5, 8), fur); snout.rotation.x = Math.PI / 2; snout.position.set(0, 0.18, 0.48); this.head.add(snout);
            // Blood-soaked dripping maw + bared fangs.
            const bloodMat = this._mat(p.accent, 1.0, 0.3, 0x440000);
            const maw = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), bloodMat); maw.scale.set(1.1, 0.7, 1.3); maw.position.set(0, 0.08, 0.6); this.head.add(maw);
            for (let i = 0; i < 3; i++) { const drip = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), bloodMat); drip.position.set(-0.06 + i * 0.06, -0.05 - i * 0.04, 0.58); this.head.add(drip); }
            for (const fx of [-0.07, 0.07]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 5), this._mat(0xfff4d0, 1.0, 0.3)); f.position.set(fx, 0.04, 0.64); f.rotation.x = Math.PI; this.head.add(f); }
            for (const ex of [-0.12, 0.12]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.26, 5), fur); ear.position.set(ex, 0.48, 0.06); this.head.add(ear); }
            this._eye(this.head, -0.11, 0.28, 0.32, 0.05, p.accent, true);
            this._eye(this.head, 0.11, 0.28, 0.32, 0.05, p.accent, true);
            this.head.position.set(0, 1.26, 0.6); this.bodyGroup.add(this.head);

            this.frontLeft  = this._leg(fur, -0.24, 0.44, 1.04, 1.1, 'pad');
            this.frontRight = this._leg(fur, 0.24, 0.44, 1.04, 1.1, 'pad');
            this.rearLeft   = this._leg(fur, -0.24, -0.46, 1.04, 1.1, 'pad');
            this.rearRight  = this._leg(fur, 0.24, -0.46, 1.04, 1.1, 'pad');
            this.tail = this._tail(fur, 1.12, -0.74, 5, 0.9, -0.4);
            this._wireQuad({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Gaunt Lynx: emaciated bobcat, visible ribs, tufted ears, bob tail ─
        _buildGauntlynx(fur) {
            this._felineBase(fur, { sizeBody: 0.82, slim: 0.86, ear: 'tuft', tuftMat: this._mat(0x140d0a, 1.0, 0.9), eyeGlow: true, legLen: 0.88, tail: 'bob', ribs: true, ribColor: 0xc8c0a8 });
        }

        // ── Feral Badger: low stocky three-tailed digger, striped face, big claws ─
        _buildFeralbadger(fur) {
            const p = this.profile;
            this.body = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 12), fur); torso.scale.set(1.05, 0.7, 1.6); this.body.add(torso);
            this.body.position.set(0, 0.6, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), fur); skull.scale.set(0.95, 0.85, 1.1); this.head.add(skull);
            const snout = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.26, 8), fur); snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.04, 0.24); this.head.add(snout);
            // Bold white facial stripes flanking dark cheeks.
            const stripeMat = this._mat(p.accent, 1.0, 0.6);
            for (const sx of [-0.12, 0, 0.12]) { const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.34, 0.12), stripeMat); stripe.position.set(sx, 0.02, 0.2); this.head.add(stripe); }
            for (const ex of [-0.15, 0.15]) { const ear = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), fur); ear.position.set(ex, 0.2, 0.02); ear.scale.z = 0.5; this.head.add(ear); }
            this._eye(this.head, -0.11, 0.05, 0.2, 0.04, 0x120c08, false);
            this._eye(this.head, 0.11, 0.05, 0.2, 0.04, 0x120c08, false);
            this.head.position.set(0, 0.62, 0.56); this.bodyGroup.add(this.head);

            // Short legs with oversized digging claws on the front.
            const clawMat = this._mat(0xe8dcc0, 1.0, 0.4);
            this.frontLeft  = this._leg(fur, -0.24, 0.36, 0.52, 0.5, 'paw');
            this.frontRight = this._leg(fur, 0.24, 0.36, 0.52, 0.5, 'paw');
            for (const fg of [this.frontLeft, this.frontRight]) for (const cx of [-0.05, 0, 0.05]) { const claw = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.2, 5), clawMat); claw.position.set(cx, -0.48, 0.16); claw.rotation.x = 1.5; fg.add(claw); }
            this.rearLeft   = this._leg(fur, -0.24, -0.38, 0.52, 0.5, 'paw');
            this.rearRight  = this._leg(fur, 0.24, -0.38, 0.52, 0.5, 'paw');
            // Three short stub tails.
            this.tail = new THREE.Group();
            for (const tx of [-0.14, 0, 0.14]) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.24, 6), fur); t.position.set(tx, 0, 0); t.rotation.x = -1.8; this.tail.add(t); }
            this.tail.position.set(0, 0.6, -0.6); this.bodyGroup.add(this.tail);
            this._wireQuad({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Starving Gnasher: ribby three-tailed pack hunter, oversized jaw ──
        _buildStarvinggnasher(fur) {
            const p = this.profile;
            this.body = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.18, 1.05, 12), fur); torso.rotation.x = Math.PI / 2; this.body.add(torso);
            const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12), fur); shoulders.position.z = 0.46; this.body.add(shoulders);
            for (let i = 0; i < 5; i++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.02, 6, 12), this._mat(0xc8c0a8, 1.0, 0.5)); rib.rotation.y = Math.PI / 2; rib.position.set(0, 0, 0.3 - i * 0.15); this.body.add(rib); }
            this.body.position.set(0, 0.96, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), fur); skull.scale.set(0.85, 0.8, 1.0); skull.position.y = 0.08; this.head.add(skull);
            const upper = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.48), fur); upper.position.set(0, 0.04, 0.36); this.head.add(upper);
            const lower = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.11, 0.44), fur); lower.position.set(0, -0.15, 0.34); this.head.add(lower);
            const fangMat = this._mat(0xfff4d0, 1.0, 0.3);
            for (let i = 0; i < 6; i++) { const tx = -0.11 + i * 0.044; const tu = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.14, 5), fangMat); tu.position.set(tx, -0.01, 0.56); tu.rotation.x = Math.PI; this.head.add(tu); const tl = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.14, 5), fangMat); tl.position.set(tx, -0.11, 0.52); this.head.add(tl); }
            for (const ex of [-0.1, 0.1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 5), fur); ear.position.set(ex, 0.28, -0.02); this.head.add(ear); }
            this._eye(this.head, -0.09, 0.12, 0.18, 0.05, p.accent, true);
            this._eye(this.head, 0.09, 0.12, 0.18, 0.05, p.accent, true);
            this.head.position.set(0, 1.02, 0.56); this.bodyGroup.add(this.head);

            this.frontLeft  = this._leg(fur, -0.18, 0.42, 0.9, 0.96, 'paw');
            this.frontRight = this._leg(fur, 0.18, 0.42, 0.9, 0.96, 'paw');
            this.rearLeft   = this._leg(fur, -0.18, -0.44, 0.86, 0.92, 'paw');
            this.rearRight  = this._leg(fur, 0.18, -0.44, 0.86, 0.92, 'paw');
            // Three thin whip tails.
            this.tail = new THREE.Group();
            for (const tx of [-0.1, 0, 0.1]) { const t = this._tail(fur, 0, 0, 4, 0.78, 0.6); t.position.x = tx; this.tail.add(t); this.bodyGroup.remove(t); }
            this.tail.position.set(0, 0.96, -0.56); this.bodyGroup.add(this.tail);
            this._wireQuad({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Feral Ridgeback: starving stalk-hound with a raised bristle spine ─
        _buildFeralridgeback(fur) {
            const p = this.profile;
            this.body = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.18, 1.1, 12), fur); torso.rotation.x = Math.PI / 2; this.body.add(torso);
            const chest = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12), fur); chest.position.z = 0.5; this.body.add(chest);
            const rump = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), fur); rump.position.z = -0.5; this.body.add(rump);
            // Pronounced raised spinal ridge of stiff back-swept bristles.
            const bristleMat = this._mat(0x2a221c, 1.0, 0.9);
            for (let i = 0; i < 9; i++) { const ridge = Math.sin(i / 8 * Math.PI); const b = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18 + ridge * 0.22, 4), bristleMat); b.position.set(0, 0.26 + ridge * 0.16, 0.5 - i * 0.13); b.rotation.x = -0.5; this.body.add(b); }
            this.body.position.set(0, 0.94, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), fur); skull.scale.set(0.85, 0.8, 1.05); skull.position.set(0, 0.18, 0.14); this.head.add(skull);
            const snout = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.4, 8), fur); snout.rotation.x = Math.PI / 2; snout.position.set(0, 0.14, 0.42); this.head.add(snout);
            for (const ex of [-0.1, 0.1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.18, 5), fur); ear.position.set(ex, 0.36, 0.04); ear.rotation.x = 0.3; this.head.add(ear); }
            this._eye(this.head, -0.09, 0.2, 0.28, 0.045, p.accent, true);
            this._eye(this.head, 0.09, 0.2, 0.28, 0.045, p.accent, true);
            this.head.position.set(0, 0.98, 0.54); this.bodyGroup.add(this.head);

            this.frontLeft  = this._leg(fur, -0.19, 0.42, 0.86, 0.92, 'pad');
            this.frontRight = this._leg(fur, 0.19, 0.42, 0.86, 0.92, 'pad');
            this.rearLeft   = this._leg(fur, -0.19, -0.44, 0.86, 0.92, 'pad');
            this.rearRight  = this._leg(fur, 0.19, -0.44, 0.86, 0.92, 'pad');
            this.tail = this._tail(fur, 0.94, -0.62, 5, 0.8, -0.5);
            this._wireQuad({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        //=====================================================================
        // LEVEL 1-5 STARTER CRITTERS (lv_*)
        //=====================================================================
        // The small beasts of the starter roster, each of which used to wear
        // another enemy's body. Built PS1 style: low segment counts the core
        // shades flat, one painted coat sheet per creature (grain, a pattern in
        // a darker ink, a pale belly) tinted by the per-id colour, muddy trim
        // colours, and one odd detail each. Every head group is pivoted at its
        // neck, every limb at its hip or shoulder and every tail at its root,
        // so the shared gait, nods and tail sway turn parts about their joints
        // (none of those groups carries a rest rotation the gait would wipe).
        // Feet stand on y = 0 and every creature faces +Z.

        // A painted coat sheet: 64px, painted in greys so the material colour
        // (the per-id tint) colours it. Shared species wide by pattern and
        // nearest filtered, which is what gives it the PS1 crunch.
        _lvSheet(pattern) {
            const cached = LV_SHEETS.get(pattern);
            if (cached) return cached;
            const W = 64, cv = document.createElement('canvas');
            cv.width = cv.height = W;
            const g = cv.getContext('2d');
            let s = 9;
            for (let i = 0; i < pattern.length; i++) s = (s * 31 + pattern.charCodeAt(i)) % 2147483647;
            const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
            const grey = v => 'rgb(' + v + ',' + v + ',' + v + ')';
            const ink = grey(64), mid = grey(132), pale = grey(252);
            const blot = (x, y, r, col) => { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
            g.fillStyle = grey(224); g.fillRect(0, 0, W, W);
            // Fur grain: short vertical dashes a shade either side of the base.
            for (let i = 0; i < 260; i++) { g.fillStyle = grey(192 + (rnd() * 60 | 0)); g.fillRect(rnd() * W | 0, rnd() * W | 0, 1, 2 + (rnd() * 3 | 0)); }
            switch (pattern) {
                case 'stripe':   // wavy bands from the spine down the flanks
                    for (let i = 0; i < 8; i++) { let x = i * 8 + rnd() * 3; g.fillStyle = ink; for (let y = 2; y < 48; y += 2) { x += (rnd() - 0.5) * 1.6; g.fillRect(x | 0, y, 2 + (rnd() * 2 | 0), 2); } }
                    break;
                case 'bands':    // rings round a tail, a sock, a whorl
                    g.fillStyle = ink; for (let y = 1; y < W; y += 12) g.fillRect(0, y, W, 5);
                    break;
                case 'spots':
                    for (let i = 0; i < 18; i++) blot(rnd() * W, 4 + rnd() * 44, 2 + rnd() * 3, rnd() < 0.6 ? ink : mid);
                    break;
                case 'saddle':   // a darker back fading into the flanks
                    g.fillStyle = mid; g.fillRect(0, 0, W, 20);
                    for (let x = 0; x < W; x += 2) g.fillRect(x, 20, 2, rnd() * 7 | 0);
                    break;
                case 'mottle':
                    for (let i = 0; i < 46; i++) { g.fillStyle = rnd() < 0.5 ? mid : grey(176); g.fillRect(rnd() * W | 0, rnd() * W | 0, 3 + (rnd() * 5 | 0), 2 + (rnd() * 4 | 0)); }
                    break;
                case 'mange':    // bald pale patches through a dark coat
                    g.fillStyle = mid; g.fillRect(0, 0, W, 30);
                    for (let i = 0; i < 9; i++) blot(rnd() * W, rnd() * 50, 3 + rnd() * 4, pale);
                    break;
                case 'soot':
                    for (let i = 0; i < 34; i++) blot(rnd() * W, rnd() * W, 2 + rnd() * 5, grey(70 + (rnd() * 70 | 0)));
                    break;
                case 'speck':    // a night sky: pale stars on a dark field
                    g.fillStyle = grey(96); g.fillRect(0, 0, W, W);
                    g.fillStyle = pale; for (let i = 0; i < 40; i++) g.fillRect(rnd() * W | 0, rnd() * W | 0, 1 + (rnd() * 2 | 0), 1);
                    break;
            }
            // A pale belly along the bottom rows (the underside of a ball).
            if (pattern !== 'flat' && pattern !== 'bands' && pattern !== 'speck') {
                g.fillStyle = pale; g.fillRect(0, 54, W, 10);
                for (let x = 0; x < W; x += 2) g.fillRect(x, 50 + (rnd() * 4 | 0), 2, 4);
            }
            const tex = new THREE.CanvasTexture(cv);
            tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            LV_SHEETS.set(pattern, tex);
            return tex;
        }
        // A coat material on a painted sheet; colour defaults to the per-id tint.
        _lvCoat(pattern, color, rough) {
            const m = new THREE.MeshStandardMaterial({
                color: (color !== undefined && color !== null) ? color : this.color,
                map: this._lvSheet(pattern || 'flat'), roughness: rough === undefined ? 0.92 : rough,
                flatShading: true, transparent: true
            });
            this._materials.push(m);
            return m;
        }
        // Faceted primitives added to a parent at a point. The segment counts
        // are low on purpose: the facets are the look.
        _lvBall(parent, mat, x, y, z, r, sx, sy, sz, seg) {
            const n = seg || 7;
            const m = new THREE.Mesh(new THREE.SphereGeometry(r, n, Math.max(3, Math.round(n * 0.7))), mat);
            m.scale.set(sx === undefined ? 1 : sx, sy === undefined ? 1 : sy, sz === undefined ? 1 : sz);
            m.position.set(x, y, z); parent.add(m); return m;
        }
        _lvCone(parent, mat, x, y, z, r, h, seg) { const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg || 4), mat); m.position.set(x, y, z); parent.add(m); return m; }
        _lvCyl(parent, mat, x, y, z, r0, r1, h, seg) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg || 6), mat); m.position.set(x, y, z); parent.add(m); return m; }
        _lvBox(parent, mat, x, y, z, w, h, d) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m; }
        // A tapered strut between two [x, y, z] points.
        _lvStrut(parent, mat, a, b, r0, r1, seg) {
            return this.addStrut(parent, mat, new THREE.Vector3(a[0], a[1], a[2]), new THREE.Vector3(b[0], b[1], b[2]), r0, r1, seg || 5);
        }
        // A cone whose base sits on point p and whose tip points along dir.
        _lvSpike(parent, mat, p, dir, r, h, seg) {
            const d = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
            const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg || 4), mat);
            m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
            m.position.set(p[0] + d.x * h * 0.45, p[1] + d.y * h * 0.45, p[2] + d.z * h * 0.45);
            parent.add(m); return m;
        }
        // Balls on a polyline from the origin, joined by struts: tails, trunks,
        // moustaches. radii has one entry more than pts (the root's).
        _lvChain(parent, mat, pts, radii, flat) {
            let prev = [0, 0, 0];
            const sx = flat || 1;
            this._lvBall(parent, mat, 0, 0, 0, radii[0], sx, 1, 1, 6);
            pts.forEach((p, i) => {
                this._lvStrut(parent, mat, prev, p, radii[i], radii[i + 1], 5);
                this._lvBall(parent, mat, p[0], p[1], p[2], radii[i + 1], sx, 1, 1, 6);
                prev = p;
            });
        }
        _lvTail(mat, y, z, pts, radii, flat) {
            const g = new THREE.Group();
            this._lvChain(g, mat, pts, radii, flat);
            g.position.set(0, y, z); this.bodyGroup.add(g); return g;
        }
        // A bead eye: a dark (or coloured, or glowing) ball, an optional pupil,
        // a glint set inboard on both eyes so the pair mirrors, and an optional
        // heavy upper lid (lid = how much of the ball it covers, 0..1).
        _lvEye(parent, x, y, z, r, o) {
            o = o || {};
            const g = new THREE.Group();
            const iris = o.iris !== undefined ? o.iris : 0x100c0a;
            this._lvBall(g, this._mat(iris, 1.0, 0.15, o.glow ? iris : 0), 0, 0, 0, r, 1, 1, 1, 6);
            if (o.pupil) this._lvBall(g, this._mat(0x080606, 1.0, 0.1), 0, 0, r * 0.62, r * 0.55, o.slit ? 0.35 : 1, o.bar ? 0.35 : 1, 0.5, 5);
            const s = x < 0 ? 1 : -1;
            this._lvBall(g, this._mat(0xffffff, 1.0, 0.05, 0xffffff), s * r * 0.3, r * 0.35, r * 0.8, r * 0.26, 1, 1, 1, 4);
            if (o.lid) {
                const lid = new THREE.Mesh(new THREE.SphereGeometry(r * 1.12, 6, 3, 0, Math.PI * 2, 0, Math.PI * o.lid), this._mat(o.lidColor !== undefined ? o.lidColor : 0x2a2420, 1.0, 0.8));
                lid.rotation.x = 0.35; g.add(lid);
            }
            g.position.set(x, y, z); parent.add(g); return g;
        }
        // An ear on its own pivot at the base, so it can be flicked. shape
        // 'round' is a cupped disc, anything else a flattened cone; inner is
        // the paler cup colour, tuft a dark tassel on the tip.
        _lvEar(parent, side, x, y, z, o) {
            const g = new THREE.Group();
            const w = o.w, h = o.h, mat = o.mat;
            const inner = o.inner !== undefined && o.inner !== null ? this._mat(o.inner, 1.0, 0.7) : null;
            if (o.shape === 'round') {
                this._lvBall(g, mat, 0, h * 0.5, 0, w, 1, h / (2 * w), 0.32, 7);
                if (inner) this._lvBall(g, inner, 0, h * 0.5, w * 0.12, w * 0.66, 1, h / (2 * w), 0.22, 6);
            } else {
                const c = this._lvCone(g, mat, 0, h * 0.5, 0, w, h, 4); c.scale.z = 0.45;
                if (inner) { const ci = this._lvCone(g, inner, 0, h * 0.42, w * 0.18, w * 0.6, h * 0.72, 4); ci.scale.z = 0.3; }
            }
            if (o.tuft) this._lvCone(g, this._mat(o.tuftColor || 0x1a1410, 1.0, 0.9), 0, h + o.tuft * 0.4, 0, w * 0.22, o.tuft, 4);
            g.position.set(side * x, y, z);
            g.rotation.set(o.tx || 0, o.ty ? side * o.ty : 0, -side * (o.tz || 0));
            g.userData.rx0 = g.rotation.x;
            parent.add(g);
            (this._lvEars || (this._lvEars = [])).push(g);
            return g;
        }
        _lvWhiskers(parent, x, y, z, len, color) {
            const m = this._mat(color || 0xe8e0d0, 0.8, 0.3);
            for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) {
                const wk = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.0025, len, 3), m);
                wk.position.set(sd * (x + len * 0.4), y + (i - 1) * 0.016, z);
                wk.rotation.set(0, -sd * 0.3, sd * (Math.PI / 2 - 0.12 + i * 0.12));
                parent.add(wk);
            }
        }
        // A hip-pivoted two-segment leg standing on y = 0 (or hanging o.len
        // long). knee > 0 bends the knee forward, < 0 back (a haunch); foot is
        // 'paw' | 'long' | 'web' | 'hoof' | 'pad'.
        _lvLeg(mat, x, hipY, z, o) {
            o = o || {};
            const g = new THREE.Group();
            const L = o.len || hipY, r = o.r || 0.05;
            const fr = o.footR || r * 1.3;
            const fz = o.footZ || 0;
            const knee = [0, -L * (o.kneeAt || 0.5), o.knee || 0];
            const ankle = [0, -L + fr * 0.7, o.ankle !== undefined ? o.ankle : fz * 0.4];
            this._lvBall(g, mat, 0, 0, 0, r * 1.2, 1, 1, 1, 6);
            this._lvStrut(g, mat, [0, 0, 0], knee, r, r * 0.85);
            this._lvBall(g, mat, knee[0], knee[1], knee[2], o.kneeR || r * 0.9, 1, 1, 1, 5);
            this._lvStrut(g, mat, knee, ankle, r * 0.85, r * 0.62);
            const foot = this._lvFoot(o.foot || 'paw', fr, o.footMat || mat, o);
            foot.position.set(0, -L, fz); g.add(foot);
            g.position.set(x, hipY, z); this.bodyGroup.add(g); return g;
        }
        // A foot whose origin is the ground under the ankle, toes toward +Z.
        _lvFoot(kind, fr, mat, o) {
            const f = new THREE.Group();
            const clawMat = o.claw ? this._mat(o.claw, 1.0, 0.35) : null;
            if (kind === 'hoof') {
                this._lvCyl(f, this._mat(o.hoofColor || 0x2a2018, 1.0, 0.45), 0, fr * 0.6, 0, fr * 0.8, fr, fr * 1.2, 6);
            } else if (kind === 'long' || kind === 'web') {
                const web = kind === 'web';
                this._lvBall(f, mat, 0, fr * 0.45, fr * 0.9, fr, web ? 1.3 : 0.75, 0.45, 2.2, 6);
                for (let i = -1; i <= 1; i++) this._lvBall(f, mat, i * fr * (web ? 0.55 : 0.4), fr * 0.25, fr * 2.9, fr * 0.32, 1, 1, 1, 4);
                if (clawMat) for (let i = -1; i <= 1; i++) this._lvSpike(f, clawMat, [i * fr * 0.4, fr * 0.25, fr * 3.1], [0, -0.4, 1], fr * 0.12, fr * 0.5);
            } else if (kind === 'pad') {
                this._lvBall(f, mat, 0, fr * 0.4, fr * 0.2, fr, 1.3, 0.5, 1.4, 6);
            } else {
                this._lvBall(f, mat, 0, fr * 0.55, fr * 0.2, fr, 1, 0.6, 1.25, 6);
                for (let i = -1; i <= 1; i++) this._lvBall(f, mat, i * fr * 0.5, fr * 0.3, fr * 1.15, fr * 0.36, 1, 1, 1, 4);
                if (clawMat) for (let i = -1; i <= 1; i++) this._lvSpike(f, clawMat, [i * fr * 0.5, fr * 0.3, fr * 1.4], [0, -0.5, 1], fr * 0.14, fr * 0.55);
            }
            return f;
        }
        // A shoulder-pivoted forelimb for the upright critters: upper arm down,
        // forearm forward, a small hand. The hand group is arm.hand, so props
        // ride in it.
        _lvArm(mat, side, x, y, z, o) {
            o = o || {};
            const g = new THREE.Group();
            const r = o.r || 0.035;
            const elbow = [side * (o.elbowX || 0.02), o.elbowY !== undefined ? o.elbowY : -0.1, o.elbowZ !== undefined ? o.elbowZ : 0.02];
            const wrist = [side * (o.handX || 0), o.handY !== undefined ? o.handY : -0.12, o.reach !== undefined ? o.reach : 0.1];
            this._lvBall(g, mat, 0, 0, 0, r * 1.25, 1, 1, 1, 6);
            this._lvStrut(g, mat, [0, 0, 0], elbow, r, r * 0.85);
            this._lvBall(g, mat, elbow[0], elbow[1], elbow[2], r * 0.88, 1, 1, 1, 5);
            this._lvStrut(g, mat, elbow, wrist, r * 0.85, r * 0.7);
            const hand = new THREE.Group();
            const hr = o.handR || r * 1.25, hm = o.handMat || mat;
            this._lvBall(hand, hm, 0, 0, 0, hr, 1, 0.8, 1.1, 6);
            if (o.fingers !== false) for (let i = -1; i <= 1; i++) this._lvBall(hand, hm, i * hr * 0.45, -hr * 0.35, hr * 0.75, hr * 0.32, 1, 1, 1, 4);
            if (o.claw) { const cm = this._mat(o.claw, 1.0, 0.35); for (let i = -1; i <= 1; i++) this._lvSpike(hand, cm, [i * hr * 0.45, -hr * 0.4, hr * 0.95], [0, -0.6, 1], hr * 0.14, hr * 0.6); }
            hand.position.set(wrist[0], wrist[1], wrist[2]); g.add(hand); g.hand = hand;
            g.position.set(x, y, z); this.bodyGroup.add(g); return g;
        }
        // Beast part map plus MOUTH (the jaw when it is its own group).
        _wireLv(p) {
            this._wireQuad(p);
            this._partMeshMap.MOUTH = p.mouth || p.head;
            if (p.mouth && p.mouth !== p.head) this._cascadeRules.push({ gone: ['MOUTH'], hide: [p.mouth] });
        }
        // A jaw or other part posed by the animation: remember its rest pose.
        _lvRest(o) { o.userData.rx0 = o.rotation.x; o.userData.x0 = o.position.x; return o; }

        // ── Pantry Mouse: flour-dusted larder mouse with ears too big for it,
        //    a cheese crumb in its teeth and a bite out of one ear ──────────
        _buildLvPantrymouse() {
            const p = this.profile;
            const coat = this._lvCoat('saddle'), pink = this._mat(0xe0a0a0, 1.0, 0.6), flour = this._mat(p.accent, 1.0, 1.0);
            this.body = new THREE.Group();
            this._lvBall(this.body, coat, 0, 0, 0, 0.26, 0.85, 0.8, 1.25);
            this._lvBall(this.body, coat, 0, 0, -0.18, 0.2, 1, 0.95, 1);
            // Flour on the back where it sleeps among the sacks.
            this._lvBall(this.body, flour, 0.05, 0.19, 0.06, 0.1, 1, 0.3, 1.2, 6);
            this._lvBall(this.body, flour, -0.07, 0.18, -0.1, 0.09, 1, 0.3, 1.1, 6);
            this._lvBall(this.body, flour, 0.02, 0.17, -0.24, 0.07, 1, 0.3, 1, 5);
            this.body.position.set(0, 0.3, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this._lvBall(this.head, coat, 0, 0.02, 0.08, 0.15, 0.9, 0.85, 1.1);
            this._lvCone(this.head, coat, 0, -0.01, 0.24, 0.075, 0.18, 5).rotation.x = Math.PI / 2;
            this._lvBall(this.head, flour, 0, 0, 0.3, 0.032, 1, 1, 1, 5);
            this._lvBall(this.head, pink, 0, -0.005, 0.33, 0.022, 1, 1, 1, 4);
            for (const ix of [-0.012, 0.012]) this._lvBox(this.head, this._mat(0xf4ecd0, 1.0, 0.4), ix, -0.05, 0.27, 0.016, 0.04, 0.012);
            const crumb = this._lvCyl(this.head, this._mat(0xe8c040, 1.0, 0.7), 0, -0.075, 0.29, 0.04, 0.04, 0.03, 3); crumb.rotation.y = 0.4;
            this._lvEye(this.head, -0.075, 0.06, 0.19, 0.035);
            this._lvEye(this.head, 0.075, 0.06, 0.19, 0.035);
            this._lvEar(this.head, -1, 0.08, 0.1, 0.03, { shape: 'round', w: 0.11, h: 0.2, mat: coat, inner: 0xe8a8b0, tz: 0.45, tx: -0.15 });
            const bitten = this._lvEar(this.head, 1, 0.08, 0.1, 0.03, { shape: 'round', w: 0.11, h: 0.2, mat: coat, inner: 0xe8a8b0, tz: 0.45, tx: -0.15 });
            this._lvBall(bitten, this._mat(0x4a2a24, 1.0, 0.8), 0.07, 0.17, 0.0, 0.03, 1, 1, 0.5, 5);
            this._lvWhiskers(this.head, 0.03, -0.01, 0.27, 0.2);
            this.head.position.set(0, 0.36, 0.25); this.bodyGroup.add(this.head);

            this.frontLeft  = this._lvLeg(coat, -0.11, 0.24, 0.17, { r: 0.035, footR: 0.04, knee: 0.02, footMat: pink });
            this.frontRight = this._lvLeg(coat, 0.11, 0.24, 0.17, { r: 0.035, footR: 0.04, knee: 0.02, footMat: pink });
            this.rearLeft   = this._lvLeg(coat, -0.13, 0.26, -0.2, { r: 0.045, footR: 0.04, knee: -0.07, foot: 'long', footMat: pink });
            this.rearRight  = this._lvLeg(coat, 0.13, 0.26, -0.2, { r: 0.045, footR: 0.04, knee: -0.07, foot: 'long', footMat: pink });
            this.tail = this._lvTail(pink, 0.28, -0.37, [[0, -0.04, -0.15], [0.06, -0.16, -0.3], [0.16, -0.24, -0.36], [0.26, -0.25, -0.3]], [0.03, 0.025, 0.02, 0.014, 0.01]);
            this._lvMove = 'scurry';
            this._wireLv({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Barn Kitten: a scrappy tabby arched on tiptoe with its tail
        //    bottle-brushed, straws from the hayloft stuck in its coat ──────
        _buildLvBarnkitten() {
            const p = this.profile;
            const coat = this._lvCoat('stripe'), cream = this._mat(0xf0e2c8, 1.0, 0.9);
            const straw = this._mat(0xe0c060, 1.0, 0.8), pink = this._mat(0xe890a0, 1.0, 0.6);
            this.body = new THREE.Group();
            this._lvBall(this.body, coat, 0, 0, 0.17, 0.17, 0.95, 1, 1);
            this._lvBall(this.body, coat, 0, 0.09, 0, 0.18, 0.95, 0.95, 1.05);
            this._lvBall(this.body, coat, 0, 0.02, -0.17, 0.17, 0.95, 1, 1);
            this._lvBall(this.body, cream, 0, -0.06, 0.3, 0.1, 0.9, 1, 0.6, 6);
            // Hackles up along the arch.
            for (let i = 0; i < 5; i++) { const z = 0.12 - i * 0.06; this._lvSpike(this.body, coat, [0, 0.24 - z * z * 1.5, z], [0, 1, -0.35], 0.028, 0.09, 4); }
            // Straw from the hayloft, caught in the fur.
            this._lvStrut(this.body, straw, [0.12, 0.12, 0.02], [0.27, 0.2, 0.08], 0.008, 0.007, 3);
            this._lvStrut(this.body, straw, [-0.1, 0.06, -0.15], [-0.25, 0.13, -0.22], 0.008, 0.007, 3);
            this._lvStrut(this.body, straw, [0.05, 0.2, -0.05], [0.11, 0.34, -0.14], 0.008, 0.007, 3);
            this.body.position.set(0, 0.44, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this._lvBall(this.head, coat, 0, 0.07, 0.08, 0.17, 1.05, 0.95, 0.95);
            this._lvBall(this.head, cream, 0, -0.01, 0.22, 0.07, 1.2, 0.75, 0.8, 6);
            this._lvBall(this.head, pink, 0, 0.025, 0.272, 0.02, 1.2, 0.8, 0.8, 4);
            // Mouth open in a hiss, two needle fangs.
            this._lvBall(this.head, this._mat(0x3a1418, 1.0, 0.5), 0, -0.045, 0.24, 0.035, 1.2, 0.7, 0.8, 5);
            for (const fx of [-0.02, 0.02]) this._lvCone(this.head, this._mat(0xfff8ec, 1.0, 0.3), fx, -0.035, 0.262, 0.007, 0.03, 3).rotation.x = Math.PI;
            this._lvEye(this.head, -0.07, 0.08, 0.21, 0.05, { iris: p.accent, pupil: true, slit: true });
            this._lvEye(this.head, 0.07, 0.08, 0.21, 0.05, { iris: p.accent, pupil: true, slit: true });
            this._lvEar(this.head, -1, 0.1, 0.17, 0.05, { w: 0.07, h: 0.13, mat: coat, inner: 0xe8a0b0, tz: 0.25 });
            this._lvEar(this.head, 1, 0.1, 0.17, 0.05, { w: 0.07, h: 0.13, mat: coat, inner: 0xe8a0b0, tz: 0.25 });
            this._lvWhiskers(this.head, 0.06, -0.01, 0.23, 0.18);
            this.head.position.set(0, 0.5, 0.3); this.bodyGroup.add(this.head);

            this.frontLeft  = this._lvLeg(coat, -0.08, 0.38, 0.18, { r: 0.035, footR: 0.045, footMat: cream });
            this.frontRight = this._lvLeg(coat, 0.08, 0.38, 0.18, { r: 0.035, footR: 0.045, footMat: cream });
            this.rearLeft   = this._lvLeg(coat, -0.08, 0.4, -0.17, { r: 0.04, footR: 0.045, knee: -0.03, footMat: cream });
            this.rearRight  = this._lvLeg(coat, 0.08, 0.4, -0.17, { r: 0.04, footR: 0.045, knee: -0.03, footMat: cream });
            this.tail = this._lvTail(coat, 0.5, -0.31, [[0, 0.12, -0.05], [0, 0.26, -0.04], [0, 0.38, 0]], [0.05, 0.065, 0.07, 0.065, 0.045]);
            this._lvMove = 'prowl';
            this._wireLv({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Acorn Squirrel: sits up clutching an acorn and wears the cap of
        //    another one as a helmet ────────────────────────────────────────
        _buildLvAcornsquirrel() {
            const coat = this._lvCoat('saddle'), cream = this._mat(0xf0dcc0, 1.0, 0.9);
            const nutM = this._mat(0xb07a3a, 1.0, 0.5), cupM = this._mat(0x6a4a28, 1.0, 0.95), dark = this._mat(0x1a120c, 1.0, 0.5);
            this.body = new THREE.Group();
            this._lvBall(this.body, coat, 0, 0, 0, 0.2, 0.9, 1.25, 0.85);
            this._lvBall(this.body, coat, 0, 0.17, 0.03, 0.15);
            this._lvBall(this.body, cream, 0, -0.02, 0.14, 0.13, 0.8, 1.3, 0.4, 6);
            this.body.position.set(0, 0.32, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this._lvBall(this.head, coat, 0, 0.07, 0.04, 0.13);
            this._lvBall(this.head, cream, 0, 0.03, 0.15, 0.06, 1, 0.85, 1.1, 6);
            this._lvBall(this.head, dark, 0, 0.05, 0.21, 0.02, 1, 1, 1, 4);
            for (const ix of [-0.01, 0.01]) this._lvBox(this.head, this._mat(0xf0c070, 1.0, 0.4), ix, -0.01, 0.19, 0.014, 0.035, 0.01);
            this._lvEye(this.head, -0.07, 0.1, 0.13, 0.03);
            this._lvEye(this.head, 0.07, 0.1, 0.13, 0.03);
            this._lvEar(this.head, -1, 0.07, 0.17, 0, { w: 0.045, h: 0.09, mat: coat, inner: 0xe0b0a0, tz: 0.15 });
            this._lvEar(this.head, 1, 0.07, 0.17, 0, { w: 0.045, h: 0.09, mat: coat, inner: 0xe0b0a0, tz: 0.15 });
            // The acorn-cap helmet, worn at a slant, stalk up.
            const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2), cupM);
            cap.scale.set(1, 0.7, 1); cap.position.set(0, 0.165, 0.04); cap.rotation.z = 0.2; this.head.add(cap);
            this._lvCyl(this.head, cupM, -0.013, 0.24, 0.04, 0.008, 0.012, 0.05, 4).rotation.z = 0.2;
            this.head.position.set(0, 0.62, 0.04); this.bodyGroup.add(this.head);

            this.frontLeft  = this._lvArm(coat, -1, -0.1, 0.5, 0.08, { r: 0.03, elbowY: -0.08, handX: -0.04, handY: -0.12, reach: 0.14 });
            this.frontRight = this._lvArm(coat, 1, 0.1, 0.5, 0.08, { r: 0.03, elbowY: -0.08, handX: -0.04, handY: -0.12, reach: 0.14 });
            // The acorn it is holding, cap and all.
            const nut = this.frontRight.hand;
            this._lvBall(nut, nutM, -0.06, -0.01, 0.02, 0.055, 1, 1.25, 1, 6);
            const nc = new THREE.Mesh(new THREE.SphereGeometry(0.058, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), cupM); nc.position.set(-0.06, 0.04, 0.02); nut.add(nc);
            this.rearLeft   = this._lvLeg(coat, -0.11, 0.16, -0.02, { r: 0.045, footR: 0.045, knee: 0.06, foot: 'long' });
            this.rearRight  = this._lvLeg(coat, 0.11, 0.16, -0.02, { r: 0.045, footR: 0.045, knee: 0.06, foot: 'long' });
            this.tail = this._lvTail(coat, 0.16, -0.12, [[0, 0.06, -0.12], [0, 0.22, -0.2], [0, 0.4, -0.2], [0, 0.55, -0.12], [0, 0.62, 0]], [0.08, 0.1, 0.11, 0.12, 0.11, 0.09], 0.65);
            this._lvMove = 'sit';
            this._wireLv({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Molehill Pup: a blind velvet mole half out of its molehill,
        //    spade hands flailing, a pink star of feelers for a nose ────────
        _buildLvMolehillpup() {
            const p = this.profile;
            const coat = this._lvCoat('flat'), pink = this._mat(p.accent, 1.0, 0.55);
            const dirt = this._mat(0x5a4430, 1.0, 1.0), claw = this._mat(0xe8dcc0, 1.0, 0.4);
            this.body = new THREE.Group();
            this._lvCone(this.body, dirt, 0, -0.17, 0, 0.42, 0.34, 7).scale.z = 0.9;
            for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3; this._lvBall(this.body, dirt, Math.cos(a) * 0.35, -0.3, Math.sin(a) * 0.31, 0.07, 1, 0.6, 1, 5); }
            this._lvBall(this.body, coat, 0, 0.08, 0.02, 0.2, 1, 1.2, 0.9);
            this.body.position.set(0, 0.34, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this._lvBall(this.head, coat, 0, 0.02, 0.06, 0.12, 0.9, 0.85, 1.2);
            this._lvBall(this.head, pink, 0, 0, 0.19, 0.045, 1, 1, 1, 6);
            // The star nose: a ring of feelers round the snout tip.
            for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; this._lvSpike(this.head, pink, [Math.cos(a) * 0.03, Math.sin(a) * 0.03, 0.215], [Math.cos(a), Math.sin(a), 0.4], 0.012, 0.055, 3); }
            const shut = this._mat(0x120c0c, 1.0, 0.5);
            for (const ex of [-0.055, 0.055]) this._lvBall(this.head, shut, ex, 0.05, 0.135, 0.016, 1.4, 0.35, 0.6, 4);
            this.head.position.set(0, 0.62, 0.08); this.bodyGroup.add(this.head);

            // Spade hands thrown up out of the earth, claws splayed.
            const arm = side => {
                const a = this._lvArm(coat, side, side * 0.15, 0.5, 0.08, { r: 0.045, elbowX: 0.08, elbowY: 0.02, elbowZ: 0.03, handX: 0.14, handY: 0.1, reach: 0.08, handR: 0.085, handMat: pink, fingers: false });
                a.hand.children[0].scale.set(1.15, 1.2, 0.4);
                for (let i = -2; i <= 2; i++) this._lvSpike(a.hand, claw, [i * 0.03, 0.08, 0.01], [i * 0.2 + side * 0.2, 1, 0.2], 0.012, 0.07, 3);
                return a;
            };
            this.frontLeft = arm(-1); this.frontRight = arm(1);
            this.rearLeft   = this._lvLeg(coat, -0.1, 0.24, -0.06, { r: 0.035, footR: 0.04, footMat: pink });
            this.rearRight  = this._lvLeg(coat, 0.1, 0.24, -0.06, { r: 0.035, footR: 0.04, footMat: pink });
            this.tail = this._lvTail(pink, 0.38, -0.17, [[0, 0.02, -0.06]], [0.035, 0.02]);
            this._lvMove = 'scurry'; this._lvFlail = true;
            this._wireLv({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Gutter Rat: a hunched drain rat, knobbed spine, bald patches, a
        //    torn ear and long yellow teeth ─────────────────────────────────
        _buildLvGutterrat() {
            const p = this.profile;
            const coat = this._lvCoat('mange'), tailM = this._lvCoat('bands', 0xb08070), pink = this._mat(0xc88a80, 1.0, 0.6);
            const tooth = this._mat(p.accent, 1.0, 0.35);
            this.body = new THREE.Group();
            this._lvBall(this.body, coat, 0, 0, 0.15, 0.17, 0.95, 0.95, 1.05);
            this._lvBall(this.body, coat, 0, 0.05, -0.01, 0.19, 1, 1, 1.05);
            this._lvBall(this.body, coat, 0, 0.08, -0.17, 0.21, 1, 1, 1.1);
            const ridge = [0.17, 0.21, 0.24, 0.28, 0.29, 0.28];
            for (let i = 0; i < 6; i++) this._lvBall(this.body, coat, 0, ridge[i], 0.18 - i * 0.08, 0.03, 1, 0.8, 1.2, 5);
            this._lvBall(this.body, pink, 0.17, 0.06, -0.06, 0.06, 0.35, 1, 1.2, 5);
            this._lvBall(this.body, pink, -0.15, 0.01, 0.1, 0.05, 0.35, 1, 1.2, 5);
            this.body.position.set(0, 0.36, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this._lvBall(this.head, coat, 0, 0, 0.05, 0.11, 0.9, 0.85, 1.2);
            this._lvCone(this.head, coat, 0, -0.02, 0.19, 0.065, 0.2, 5).rotation.x = Math.PI / 2;
            this._lvBall(this.head, pink, 0, -0.02, 0.29, 0.02, 1, 1, 1, 4);
            for (const ix of [-0.011, 0.011]) this._lvBox(this.head, tooth, ix, -0.065, 0.25, 0.016, 0.07, 0.012);
            this._lvEye(this.head, -0.06, 0.04, 0.12, 0.025, { iris: 0x2a0a0a });
            this._lvEye(this.head, 0.06, 0.04, 0.12, 0.025, { iris: 0x2a0a0a });
            const torn = this._lvEar(this.head, -1, 0.07, 0.08, 0, { shape: 'round', w: 0.055, h: 0.1, mat: coat, inner: 0xc8908a, tz: 0.4 });
            this._lvBall(torn, this._mat(0x3a2a24, 1.0, 0.8), -0.03, 0.09, 0, 0.022, 1, 1, 0.5, 4);
            this._lvEar(this.head, 1, 0.07, 0.08, 0, { shape: 'round', w: 0.055, h: 0.1, mat: coat, inner: 0xc8908a, tz: 0.4 });
            this._lvWhiskers(this.head, 0.03, -0.02, 0.24, 0.16, 0x8a8478);
            this.head.position.set(0, 0.47, 0.3); this.bodyGroup.add(this.head);

            this.frontLeft  = this._lvLeg(coat, -0.1, 0.27, 0.17, { r: 0.03, footR: 0.035, knee: 0.02, footMat: pink, claw: 0xd8c8a0 });
            this.frontRight = this._lvLeg(coat, 0.1, 0.27, 0.17, { r: 0.03, footR: 0.035, knee: 0.02, footMat: pink, claw: 0xd8c8a0 });
            this.rearLeft   = this._lvLeg(coat, -0.12, 0.33, -0.2, { r: 0.045, footR: 0.04, knee: -0.08, foot: 'long', footMat: pink });
            this.rearRight  = this._lvLeg(coat, 0.12, 0.33, -0.2, { r: 0.045, footR: 0.04, knee: -0.08, foot: 'long', footMat: pink });
            this.tail = this._lvTail(tailM, 0.42, -0.38, [[0, -0.06, -0.15], [0, -0.2, -0.3], [0.08, -0.33, -0.42], [0.2, -0.39, -0.48]], [0.035, 0.03, 0.024, 0.017, 0.01]);
            this._lvMove = 'scurry';
            this._wireLv({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Grumpy Hedgehog: a dome of banded spines with a leaf skewered on
        //    it and a scowling little face under a heavy brow ──────────────
        _buildLvGrumpyhedgehog() {
            const skin = this._lvCoat('flat'), spineM = this._mat(0x3a2a1e, 1.0, 0.8), tipM = this._mat(0xd8c8a8, 1.0, 0.7);
            const dark = this._mat(0x140e0a, 1.0, 0.4);
            this.body = new THREE.Group();
            this._lvBall(this.body, spineM, 0, 0, 0, 0.3, 1, 0.85, 1.15, 8);
            this._lvBall(this.body, skin, 0, -0.1, 0.12, 0.22, 1, 0.6, 1.1, 7);
            let k = 0;
            for (let ring = 0; ring < 5; ring++) {
                const th = 0.2 + ring * 0.3, n = 5 + ring * 3;
                for (let i = 0; i < n; i++) {
                    const ph = (i + (ring % 2) * 0.5) / n * Math.PI * 2;
                    const nx = Math.sin(th) * Math.sin(ph), ny = Math.cos(th), nz = Math.sin(th) * Math.cos(ph);
                    if (nz > 0.55 && ny < 0.6) continue;   // the face stays bare
                    this._lvSpike(this.body, (k++ % 3) ? spineM : tipM, [nx * 0.276, ny * 0.235, nz * 0.317], [nx, ny * 1.1, nz], 0.035, 0.17, 4);
                }
            }
            const leaf = this._lvBall(this.body, this._mat(0x8aa040, 1.0, 0.7), 0.1, 0.235, -0.1, 0.07, 1, 0.15, 0.6, 5); leaf.rotation.z = 0.4;
            this.body.position.set(0, 0.27, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this._lvBall(this.head, skin, 0, 0, 0.02, 0.11, 1, 0.9, 1);
            this._lvCone(this.head, skin, 0, -0.03, 0.13, 0.08, 0.2, 5).rotation.x = Math.PI / 2;
            this._lvBall(this.head, dark, 0, -0.03, 0.235, 0.025, 1, 1, 1, 4);
            this._lvEye(this.head, -0.055, 0.04, 0.09, 0.025);
            this._lvEye(this.head, 0.055, 0.04, 0.09, 0.025);
            // The scowl: two brow wedges sloping down to the middle.
            for (const sd of [-1, 1]) this._lvBox(this.head, dark, sd * 0.05, 0.08, 0.09, 0.07, 0.018, 0.03).rotation.z = sd * 0.45;
            this._lvEar(this.head, -1, 0.08, 0.07, -0.02, { shape: 'round', w: 0.035, h: 0.05, mat: skin, tz: 0.4 });
            this._lvEar(this.head, 1, 0.08, 0.07, -0.02, { shape: 'round', w: 0.035, h: 0.05, mat: skin, tz: 0.4 });
            this.head.position.set(0, 0.38, 0.3); this.bodyGroup.add(this.head);

            this.frontLeft  = this._lvLeg(skin, -0.12, 0.12, 0.17, { r: 0.03, footR: 0.035, claw: 0x2a1c14 });
            this.frontRight = this._lvLeg(skin, 0.12, 0.12, 0.17, { r: 0.03, footR: 0.035, claw: 0x2a1c14 });
            this.rearLeft   = this._lvLeg(skin, -0.13, 0.12, -0.17, { r: 0.03, footR: 0.035 });
            this.rearRight  = this._lvLeg(skin, 0.13, 0.12, -0.17, { r: 0.03, footR: 0.035 });
            this.tail = this._lvTail(skin, 0.17, -0.33, [[0, -0.01, -0.04]], [0.035, 0.025]);
            this._lvMove = 'scurry';
            this._wireLv({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Chipmunk Hoarder: sits up with its cheek pouches crammed bigger
        //    than its head, a seed ready to spit and more in its fists ─────
        _buildLvChipmunkhoarder() {
            const p = this.profile;
            const coat = this._lvCoat('saddle'), cream = this._mat(0xf0e0c8, 1.0, 0.9), dark = this._mat(p.accent, 1.0, 0.8);
            const seedM = this._lvCoat('bands', 0x3a3430);
            this.body = new THREE.Group();
            this._lvBall(this.body, coat, 0, 0, 0, 0.18, 0.95, 1.25, 0.9);
            this._lvBall(this.body, cream, 0, -0.02, 0.12, 0.12, 0.8, 1.3, 0.5, 6);
            // Back stripes, nape to rump: dark, pale, dark.
            for (const [x, m] of [[0, dark], [-0.06, cream], [0.06, cream], [-0.1, dark], [0.1, dark]]) this._lvBall(this.body, m, x, 0.02, -0.14, 0.15, 0.1, 1.25, 0.3, 5);
            this.body.position.set(0, 0.3, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this._lvBall(this.head, coat, 0, 0.07, 0.04, 0.12);
            this._lvCheeks = [this._lvBall(this.head, coat, -0.1, 0, 0.09, 0.1, 1, 0.95, 1), this._lvBall(this.head, coat, 0.1, 0, 0.09, 0.1, 1, 0.95, 1)];
            this._lvBall(this.head, cream, 0, 0.03, 0.15, 0.05, 1, 1, 1, 6);
            this._lvBall(this.head, dark, 0, 0.05, 0.2, 0.018, 1, 1, 1, 4);
            this._lvCone(this.head, seedM, 0, -0.02, 0.19, 0.025, 0.07, 4).rotation.x = Math.PI / 2;
            this._lvEye(this.head, -0.06, 0.11, 0.12, 0.028);
            this._lvEye(this.head, 0.06, 0.11, 0.12, 0.028);
            for (const sd of [-1, 1]) this._lvBall(this.head, cream, sd * 0.065, 0.15, 0.1, 0.03, 1.2, 0.25, 0.5, 4);
            this._lvBall(this.head, dark, 0, 0.16, 0.02, 0.06, 0.25, 0.6, 1.4, 5);
            this._lvEar(this.head, -1, 0.07, 0.16, -0.01, { shape: 'round', w: 0.035, h: 0.055, mat: coat, inner: 0xf0d0c0, tz: 0.25 });
            this._lvEar(this.head, 1, 0.07, 0.16, -0.01, { shape: 'round', w: 0.035, h: 0.055, mat: coat, inner: 0xf0d0c0, tz: 0.25 });
            this.head.position.set(0, 0.54, 0.03); this.bodyGroup.add(this.head);

            this.frontLeft  = this._lvArm(coat, -1, -0.09, 0.44, 0.08, { r: 0.028, elbowY: -0.07, handX: -0.04, handY: -0.1, reach: 0.1 });
            this.frontRight = this._lvArm(coat, 1, 0.09, 0.44, 0.08, { r: 0.028, elbowY: -0.07, handX: -0.04, handY: -0.1, reach: 0.1 });
            for (let i = 0; i < 3; i++) this._lvSpike(this.frontRight.hand, seedM, [-0.01 - i * 0.012, 0.02, 0.02], [i - 1, 1, 0.6], 0.016, 0.05, 4);
            this._lvSpike(this.frontLeft.hand, seedM, [0.01, 0.02, 0.02], [0.4, 1, 0.5], 0.016, 0.05, 4);
            this.rearLeft   = this._lvLeg(coat, -0.1, 0.14, -0.02, { r: 0.04, footR: 0.04, knee: 0.05, foot: 'long' });
            this.rearRight  = this._lvLeg(coat, 0.1, 0.14, -0.02, { r: 0.04, footR: 0.04, knee: 0.05, foot: 'long' });
            this.tail = this._lvTail(coat, 0.15, -0.12, [[0, 0.1, -0.08], [0, 0.26, -0.1], [0, 0.4, -0.06]], [0.05, 0.06, 0.065, 0.06, 0.045], 0.7);
            this._lvMove = 'sit';
            this._wireLv({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Sock Thief Ferret: a long arched sable ferret mid war dance, an
        //    odd striped sock hanging out of its mouth ──────────────────────
        _buildLvSockthiefferret() {
            const p = this.profile;
            const coat = this._lvCoat('saddle'), mask = this._mat(0x2a2018, 1.0, 0.8), cream = this._mat(0xf0e6d0, 1.0, 0.9);
            const sock = this._lvCoat('bands', p.accent, 0.95);
            this.body = new THREE.Group();
            const spine = [[0, 0, 0.34], [0, 0.07, 0.17], [0, 0.12, 0], [0, 0.07, -0.17], [0, 0, -0.33]];
            const rad = [0.1, 0.11, 0.115, 0.11, 0.1];
            spine.forEach((q, i) => {
                this._lvBall(this.body, coat, q[0], q[1], q[2], rad[i], 1, 0.95, 1.1);
                if (i) this._lvStrut(this.body, coat, spine[i - 1], q, rad[i - 1] * 0.9, rad[i] * 0.9);
            });
            this.body.position.set(0, 0.24, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            // Head reared high on a long neck, the war dance pose.
            this._lvStrut(this.head, coat, [0, -0.14, -0.06], [0, 0, 0.04], 0.07, 0.06);
            this._lvBall(this.head, coat, 0, 0.03, 0.07, 0.09, 0.9, 0.8, 1.3);
            this._lvBall(this.head, mask, 0, 0.05, 0.11, 0.085, 1.15, 0.45, 0.75, 6);
            this._lvBall(this.head, cream, 0, 0, 0.17, 0.045, 1, 0.8, 1.2, 6);
            this._lvBall(this.head, this._mat(0xe0a0a0, 1.0, 0.6), 0, 0.01, 0.22, 0.016, 1, 1, 1, 4);
            this._lvEye(this.head, -0.045, 0.055, 0.15, 0.02);
            this._lvEye(this.head, 0.045, 0.055, 0.15, 0.02);
            this._lvEar(this.head, -1, 0.06, 0.08, 0.03, { shape: 'round', w: 0.035, h: 0.05, mat: coat, inner: 0xf0e0d0, tz: 0.3 });
            this._lvEar(this.head, 1, 0.06, 0.08, 0.03, { shape: 'round', w: 0.035, h: 0.05, mat: coat, inner: 0xf0e0d0, tz: 0.3 });
            // The stolen sock, heel and toe, dangling from its teeth.
            this._sock = new THREE.Group();
            this._lvStrut(this._sock, sock, [0, 0, 0], [0.08, -0.12, 0.02], 0.035, 0.035);
            this._lvBall(this._sock, sock, 0.08, -0.12, 0.02, 0.037, 1, 1, 1, 6);
            this._lvStrut(this._sock, sock, [0.08, -0.12, 0.02], [0.08, -0.15, 0.11], 0.035, 0.03);
            this._lvBall(this._sock, cream, 0.08, -0.15, 0.11, 0.033, 1, 0.9, 1, 6);
            this._sock.position.set(0, -0.03, 0.17); this.head.add(this._sock);
            this.head.position.set(0, 0.4, 0.42); this.bodyGroup.add(this.head);

            this.frontLeft  = this._lvLeg(coat, -0.08, 0.2, 0.33, { r: 0.03, footR: 0.035, knee: 0.02, footMat: mask });
            this.frontRight = this._lvLeg(coat, 0.08, 0.2, 0.33, { r: 0.03, footR: 0.035, knee: 0.02, footMat: mask });
            this.rearLeft   = this._lvLeg(coat, -0.09, 0.2, -0.32, { r: 0.035, footR: 0.035, knee: -0.04, footMat: mask });
            this.rearRight  = this._lvLeg(coat, 0.09, 0.2, -0.32, { r: 0.035, footR: 0.035, knee: -0.04, footMat: mask });
            this.tail = this._lvTail(coat, 0.25, -0.43, [[0, 0.01, -0.13], [0, -0.02, -0.26]], [0.045, 0.05, 0.045]);
            this._lvBall(this.tail, mask, 0, -0.02, -0.28, 0.046, 1, 1, 1.1, 6);
            this._lvMove = 'scurry';
            this._wireLv({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail, mouth: this._sock });
        }

        // ── Bin Raccoon: a fat masked alley king sat in state with a banana
        //    peel for a crown and an apple core for a sceptre ──────────────
        _buildLvBinraccoon() {
            const p = this.profile;
            const coat = this._lvCoat('flat'), mask = this._mat(0x18181c, 1.0, 0.8), pale = this._mat(0xe8e6e0, 1.0, 0.9);
            const ring = this._lvCoat('bands', 0x8a8a90), peel = this._mat(p.accent, 1.0, 0.6);
            this.body = new THREE.Group();
            this._lvBall(this.body, coat, 0, 0, 0, 0.3, 1, 1.05, 0.95, 8);
            this._lvBall(this.body, pale, 0, -0.04, 0.2, 0.2, 0.85, 1, 0.55);
            this.body.position.set(0, 0.38, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this._lvBall(this.head, coat, 0, 0.06, 0.04, 0.15, 1.1, 0.9, 1);
            this._lvCone(this.head, pale, 0, 0, 0.18, 0.06, 0.13, 5).rotation.x = Math.PI / 2;
            this._lvBall(this.head, mask, 0, 0, 0.25, 0.022, 1, 1, 1, 4);
            this._lvBall(this.head, mask, 0, 0.08, 0.1, 0.11, 1.35, 0.42, 0.75, 6);
            this._lvBall(this.head, pale, 0, 0.13, 0.09, 0.1, 1.1, 0.22, 0.6, 6);
            this._lvEye(this.head, -0.06, 0.085, 0.17, 0.025);
            this._lvEye(this.head, 0.06, 0.085, 0.17, 0.025);
            this._lvEar(this.head, -1, 0.1, 0.16, 0, { w: 0.055, h: 0.09, mat: coat, inner: 0xe8e6e0, tz: 0.35 });
            this._lvEar(this.head, 1, 0.1, 0.16, 0, { w: 0.055, h: 0.09, mat: coat, inner: 0xe8e6e0, tz: 0.35 });
            // The banana-peel crown, strips flopped over the brow.
            this._lvBall(this.head, peel, 0, 0.22, 0.04, 0.03, 1, 1, 1, 5);
            for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; const s = this._lvSpike(this.head, peel, [Math.cos(a) * 0.02, 0.21, 0.04 + Math.sin(a) * 0.02], [Math.cos(a), -0.6, Math.sin(a)], 0.03, 0.17, 4); s.scale.x = 0.45; }
            this.head.position.set(0, 0.68, 0.06); this.bodyGroup.add(this.head);

            this.frontLeft  = this._lvArm(coat, -1, -0.18, 0.56, 0.12, { r: 0.04, elbowX: 0.03, elbowY: -0.1, elbowZ: 0.06, handX: -0.1, handY: -0.13, reach: 0.16, handR: 0.045, handMat: mask, claw: 0x2a2a2a });
            this.frontRight = this._lvArm(coat, 1, 0.18, 0.56, 0.12, { r: 0.04, elbowX: 0.03, elbowY: -0.1, elbowZ: 0.06, handX: -0.1, handY: -0.13, reach: 0.16, handR: 0.045, handMat: mask, claw: 0x2a2a2a });
            const core = this.frontRight.hand, apple = this._mat(0xb83a2a, 1.0, 0.6);
            this._lvCyl(core, this._mat(0xf0e0b0, 1.0, 0.8), -0.08, 0, 0.03, 0.02, 0.02, 0.08, 5);
            this._lvBall(core, apple, -0.08, 0.05, 0.03, 0.035, 1, 0.8, 1, 6);
            this._lvBall(core, apple, -0.08, -0.05, 0.03, 0.035, 1, 0.8, 1, 6);
            this.rearLeft   = this._lvLeg(coat, -0.16, 0.2, 0.08, { r: 0.05, footR: 0.05, knee: 0.08, foot: 'long', footMat: mask });
            this.rearRight  = this._lvLeg(coat, 0.16, 0.2, 0.08, { r: 0.05, footR: 0.05, knee: 0.08, foot: 'long', footMat: mask });
            this.tail = this._lvTail(ring, 0.2, -0.24, [[0.06, -0.08, -0.14], [0.2, -0.11, -0.2], [0.32, -0.1, -0.12]], [0.07, 0.075, 0.07, 0.06, 0.045]);
            this._lvMove = 'sit';
            this._wireLv({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Dune Jerboa: a pebble of a body on kangaroo legs, ears as long as
        //    it is tall and a tail ending in a black and white flag ─────────
        _buildLvDunejerboa() {
            const p = this.profile;
            const coat = this._lvCoat('saddle'), cream = this._mat(0xf4ead8, 1.0, 0.9), pink = this._mat(0xe8b0a8, 1.0, 0.6);
            const black = this._mat(p.accent, 1.0, 0.8);
            this.body = new THREE.Group();
            this._lvBall(this.body, coat, 0, 0, 0, 0.14, 0.9, 1, 1.15);
            this.body.position.set(0, 0.4, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this._lvBall(this.head, coat, 0, 0.03, 0.06, 0.1, 1, 0.95, 1.05);
            this._lvBall(this.head, cream, 0, 0, 0.15, 0.04, 1, 1, 1, 6);
            this._lvBall(this.head, pink, 0, 0.01, 0.19, 0.014, 1, 1, 1, 4);
            this._lvEye(this.head, -0.06, 0.05, 0.12, 0.035);
            this._lvEye(this.head, 0.06, 0.05, 0.12, 0.035);
            this._lvEar(this.head, -1, 0.05, 0.09, 0, { shape: 'round', w: 0.065, h: 0.28, mat: coat, inner: 0xe8b0a8, tz: 0.25, tx: -0.25 });
            this._lvEar(this.head, 1, 0.05, 0.09, 0, { shape: 'round', w: 0.065, h: 0.28, mat: coat, inner: 0xe8b0a8, tz: 0.25, tx: -0.25 });
            this._lvWhiskers(this.head, 0.03, 0, 0.15, 0.26);
            this.head.position.set(0, 0.48, 0.12); this.bodyGroup.add(this.head);

            this.frontLeft  = this._lvArm(cream, -1, -0.06, 0.38, 0.1, { r: 0.018, elbowY: -0.04, handY: -0.06, reach: 0.06, handR: 0.02, fingers: false });
            this.frontRight = this._lvArm(cream, 1, 0.06, 0.38, 0.1, { r: 0.018, elbowY: -0.04, handY: -0.06, reach: 0.06, handR: 0.02, fingers: false });
            // Kangaroo hind legs: knee forward, a long shin back, a long foot.
            const hind = x => this._lvLeg(coat, x, 0.36, -0.06, { r: 0.045, knee: 0.12, kneeAt: 0.45, ankle: -0.1, footR: 0.045, foot: 'long', footZ: -0.08, footMat: cream });
            this.rearLeft = hind(-0.09); this.rearRight = hind(0.09);
            this.tail = this._lvTail(coat, 0.38, -0.15, [[0, -0.04, -0.2], [0, -0.12, -0.42], [0, -0.16, -0.64]], [0.025, 0.02, 0.016, 0.012]);
            this._lvBall(this.tail, black, 0, -0.16, -0.68, 0.035, 0.8, 0.8, 1.3, 6);
            this._lvBall(this.tail, cream, 0, -0.16, -0.74, 0.03, 1, 1, 1, 5);
            this._lvMove = 'hop';
            this._wireLv({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Fennec Fox Kit: a sitting desert kit wearing ears bigger than the
        //    rest of it, tail wrapped round its feet ───────────────────────
        _buildLvFennecfoxkit() {
            const p = this.profile;
            const coat = this._lvCoat('saddle'), cream = this._mat(p.accent, 1.0, 0.9), dark = this._mat(0x1a1410, 1.0, 0.5);
            this.body = new THREE.Group();
            this._lvBall(this.body, coat, 0, 0.03, 0, 0.17, 0.9, 1.15, 1).rotation.x = 0.25;
            this._lvBall(this.body, cream, 0, 0.02, 0.14, 0.11, 0.8, 1.2, 0.5, 6);
            for (const sd of [-1, 1]) this._lvBall(this.body, coat, sd * 0.09, -0.12, -0.07, 0.12, 0.8, 0.85, 1.2);
            this.body.position.set(0, 0.3, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this._lvBall(this.head, coat, 0, 0.04, 0.04, 0.12, 1.05, 0.95, 1);
            this._lvCone(this.head, coat, 0, 0, 0.15, 0.05, 0.12, 5).rotation.x = Math.PI / 2;
            this._lvBall(this.head, dark, 0, 0, 0.215, 0.016, 1, 1, 1, 4);
            this._lvBall(this.head, cream, 0, -0.03, 0.09, 0.07, 1.2, 0.7, 0.8, 6);
            this._lvEye(this.head, -0.06, 0.07, 0.12, 0.04, { iris: 0x2a1a10, pupil: true });
            this._lvEye(this.head, 0.06, 0.07, 0.12, 0.04, { iris: 0x2a1a10, pupil: true });
            // The ears, each with a fan of pale fur standing up inside.
            for (const sd of [-1, 1]) {
                const ear = this._lvEar(this.head, sd, 0.07, 0.12, -0.02, { w: 0.1, h: 0.3, mat: coat, inner: 0xf0d8c8, tz: 0.35 });
                for (let i = -1; i <= 1; i++) this._lvSpike(ear, cream, [i * 0.025, 0.04, 0.03], [i * 0.3, 1, 0.3], 0.012, 0.08, 3);
            }
            this._lvWhiskers(this.head, 0.03, -0.01, 0.17, 0.14);
            this.head.position.set(0, 0.52, 0.07); this.bodyGroup.add(this.head);

            this.frontLeft  = this._lvLeg(coat, -0.06, 0.3, 0.1, { r: 0.025, footR: 0.035 });
            this.frontRight = this._lvLeg(coat, 0.06, 0.3, 0.1, { r: 0.025, footR: 0.035 });
            this.rearLeft   = this._lvLeg(coat, -0.11, 0.12, -0.06, { r: 0.04, footR: 0.04, knee: 0.05, foot: 'long' });
            this.rearRight  = this._lvLeg(coat, 0.11, 0.12, -0.06, { r: 0.04, footR: 0.04, knee: 0.05, foot: 'long' });
            this.tail = this._lvTail(coat, 0.18, -0.1, [[0.08, -0.1, -0.1], [0.2, -0.11, 0.04], [0.18, -0.11, 0.2]], [0.05, 0.065, 0.07, 0.06, 0.045]);
            this._lvBall(this.tail, dark, 0.18, -0.11, 0.24, 0.045, 1, 1, 1, 6);
            this._lvMove = 'sit';
            this._wireLv({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Frost Fox Kit: a white cub stalking low behind a fluffed ruff,
        //    icicles for whiskers and rime grown on its tail ───────────────
        _buildLvFrostfoxkit() {
            const p = this.profile;
            const coat = this._lvCoat('flat'), ice = this._mat(p.accent, 0.8, 0.15, p.accent), dark = this._mat(0x1a1c22, 1.0, 0.5);
            this.body = new THREE.Group();
            this._lvBall(this.body, coat, 0, 0, 0, 0.16, 0.9, 0.85, 1.6);
            for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; this._lvSpike(this.body, coat, [Math.cos(a) * 0.1, Math.sin(a) * 0.09, 0.16], [Math.cos(a), Math.sin(a), -0.6], 0.045, 0.11, 4); }
            this.body.position.set(0, 0.3, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this._lvBall(this.head, coat, 0, 0.02, 0.05, 0.11);
            this._lvCone(this.head, coat, 0, -0.01, 0.17, 0.055, 0.17, 5).rotation.x = Math.PI / 2;
            this._lvBall(this.head, dark, 0, -0.01, 0.26, 0.018, 1, 1, 1, 4);
            this._lvEye(this.head, -0.055, 0.05, 0.12, 0.025, { iris: p.accent, glow: true, pupil: true });
            this._lvEye(this.head, 0.055, 0.05, 0.12, 0.025, { iris: p.accent, glow: true, pupil: true });
            this._lvEar(this.head, -1, 0.065, 0.1, 0, { w: 0.05, h: 0.11, mat: coat, inner: 0xd8e4ee, tz: 0.2 });
            this._lvEar(this.head, 1, 0.065, 0.1, 0, { w: 0.05, h: 0.11, mat: coat, inner: 0xd8e4ee, tz: 0.2 });
            // Icicles where the whiskers should be.
            for (const sd of [-1, 1]) for (let i = 0; i < 2; i++) this._lvSpike(this.head, ice, [sd * 0.035, -0.02 + i * 0.02, 0.17], [sd, -0.2, 0.3], 0.008, 0.08, 3);
            this.head.position.set(0, 0.34, 0.27); this.bodyGroup.add(this.head);

            this.frontLeft  = this._lvLeg(coat, -0.08, 0.24, 0.18, { r: 0.03, footR: 0.035, knee: 0.03 });
            this.frontRight = this._lvLeg(coat, 0.08, 0.24, 0.18, { r: 0.03, footR: 0.035, knee: 0.03 });
            this.rearLeft   = this._lvLeg(coat, -0.08, 0.26, -0.18, { r: 0.035, footR: 0.035, knee: -0.06 });
            this.rearRight  = this._lvLeg(coat, 0.08, 0.26, -0.18, { r: 0.035, footR: 0.035, knee: -0.06 });
            this.tail = this._lvTail(coat, 0.32, -0.25, [[0, -0.02, -0.14], [0, -0.06, -0.28], [0, -0.06, -0.4]], [0.06, 0.075, 0.08, 0.07, 0.05]);
            for (const d of [[0, 1, -0.3], [0.7, 0.5, -0.5], [-0.7, 0.5, -0.5]]) this._lvSpike(this.tail, ice, [0, -0.06, -0.43], d, 0.015, 0.07, 4);
            this._lvMove = 'prowl';
            this._wireLv({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Mudskipper: a goggle-eyed fish propped up on its fin-arms, sail
        //    raised, mud drying on its flanks ──────────────────────────────
        _buildLvMudskipper() {
            const p = this.profile;
            const skin = this._lvCoat('spots', null, 0.45), belly = this._mat(0xd8d0b0, 1.0, 0.6);
            const fin = this._mat(0x8a7a50, 0.9, 0.6), sail = this._mat(p.accent, 0.95, 0.5, 0x0a1830), mud = this._mat(0x3a2c1c, 1.0, 1.0);
            this.body = new THREE.Group();
            this._lvBall(this.body, skin, 0, 0.02, 0, 0.16, 0.85, 0.75, 1.6).rotation.x = -0.12;
            this._lvBall(this.body, belly, 0, -0.06, 0.05, 0.13, 0.8, 0.4, 1.4, 6);
            this._lvCone(this.body, skin, 0, -0.03, -0.32, 0.09, 0.26, 6).rotation.x = -Math.PI / 2 - 0.15;
            for (const [x, y, z, r] of [[0.11, 0, -0.05, 0.035], [-0.12, -0.02, 0.06, 0.03], [0.06, 0.08, -0.16, 0.025]]) this._lvBall(this.body, mud, x, y, z, r, 1, 0.5, 1.3, 5);
            this.body.position.set(0, 0.17, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this._lvBall(this.head, skin, 0, 0, 0.06, 0.13, 1, 0.85, 1);
            this._lvJaw = new THREE.Group();
            this._lvBall(this._lvJaw, belly, 0, 0, 0.04, 0.07, 1.2, 0.35, 0.6, 6);
            this._lvJaw.position.set(0, -0.06, 0.12); this.head.add(this._lvRest(this._lvJaw));
            // The goggles: two turrets on top of the head, an eye on each.
            for (const sd of [-1, 1]) {
                this._lvBall(this.head, skin, sd * 0.045, 0.1, 0.06, 0.05, 1, 1, 1, 6);
                this._lvEye(this.head, sd * 0.045, 0.14, 0.07, 0.045, { iris: 0xc8a040, pupil: true });
            }
            this.head.position.set(0, 0.22, 0.24); this.bodyGroup.add(this.head);

            // Pectoral fins used as arms: a fleshy stump and a fan on the mud.
            const finArm = sd => {
                const g = new THREE.Group();
                this._lvBall(g, skin, 0, 0, 0, 0.035, 1, 1, 1, 5);
                this._lvStrut(g, skin, [0, 0, 0], [sd * 0.08, -0.1, 0.06], 0.03, 0.025);
                this._lvBall(g, fin, sd * 0.1, -0.11, 0.08, 0.07, 0.6, 0.2, 1, 6);
                g.position.set(sd * 0.09, 0.14, 0.12); this.bodyGroup.add(g); return g;
            };
            this.frontLeft = finArm(-1); this.frontRight = finArm(1);
            this._dorsal = new THREE.Group();
            this._lvBall(this._dorsal, sail, 0, 0.08, -0.04, 0.12, 0.12, 0.75, 1.3, 6);
            for (let i = 0; i < 4; i++) this._lvStrut(this._dorsal, fin, [0, 0, -0.1 + i * 0.06], [0, 0.15 - Math.abs(i - 1.5) * 0.02, -0.14 + i * 0.07], 0.008, 0.006, 3);
            const dot = this._mat(0x9ad0ff, 1.0, 0.3, 0x3a6ab8);
            for (const [y, z] of [[0.08, -0.08], [0.12, 0.0], [0.06, 0.04]]) for (const sd of [-1, 1]) this._lvBall(this._dorsal, dot, sd * 0.014, y, z, 0.012, 0.5, 1, 1, 4);
            this._dorsal.position.set(0, 0.28, -0.02); this.bodyGroup.add(this._dorsal);
            this.tail = new THREE.Group();
            this._lvBall(this.tail, fin, 0, 0.02, -0.07, 0.1, 0.12, 1.1, 0.9, 6);
            this.tail.position.set(0, 0.14, -0.43); this.bodyGroup.add(this.tail);
            this._lvMove = 'hop';
            // AquaticFish part map: HEAD, BODY, MOUTH and the four fins.
            const m = {}, set = (ks, o) => ks.forEach(k => m[k] = o);
            set(['BODY', 'TORSO', 'CORE', 'MASS'], this.body);
            set(['HEAD', 'SKULL', 'FACE', 'EYE', 'EYES'], this.head);
            set(['MOUTH'], this._lvJaw);
            set(['TAIL_FIN', 'TAIL'], this.tail);
            set(['DORSAL_FIN'], this._dorsal);
            set(['LEFT_PECTORAL_FIN', 'LEFT_LEG'], this.frontLeft);
            set(['RIGHT_PECTORAL_FIN', 'RIGHT_LEG'], this.frontRight);
            this._partMeshMap = m;
            this._cascadeRules = [
                { gone: ['BODY', 'TORSO', 'CORE', 'MASS'], hide: [this.body, this.head, this.tail, this._dorsal, this.frontLeft, this.frontRight] },
                { gone: ['HEAD', 'SKULL', 'FACE'], hide: [this.head] },
                { gone: ['MOUTH'], hide: [this._lvJaw] },
                { gone: ['TAIL_FIN'], hide: [this.tail] },
                { gone: ['DORSAL_FIN'], hide: [this._dorsal] },
                { gone: ['LEFT_PECTORAL_FIN'], hide: [this.frontLeft] },
                { gone: ['RIGHT_PECTORAL_FIN'], hide: [this.frontRight] },
            ];
        }

        // ── Scrapyard Jackal: lean and laughing, ribs showing, a length of
        //    chain for a collar with a padlock hanging off it ──────────────
        _buildLvScrapyardjackal() {
            const p = this.profile;
            const coat = this._lvCoat('saddle'), cream = this._mat(0xe8d8b8, 1.0, 0.9), dark = this._mat(0x1a1410, 1.0, 0.6);
            const iron = this._mat(0x7a7470, 1.0, 0.45), rust = this._mat(0x8a4a24, 1.0, 0.8), bone = this._mat(0xd8c8a8, 0.85, 0.6);
            this.body = new THREE.Group();
            this._lvBall(this.body, coat, 0, 0, 0.18, 0.15, 0.85, 1.05, 1);
            this._lvBall(this.body, coat, 0, 0.02, -0.2, 0.13, 0.95, 0.95, 1);
            this._lvStrut(this.body, coat, [0, 0, 0.1], [0, 0.02, -0.12], 0.1, 0.085);
            // Ribs standing out round the tucked waist.
            for (let i = 0; i < 3; i++) { const rb = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 4, 8, Math.PI * 1.2), bone); rb.rotation.z = -Math.PI * 0.1; rb.position.set(0, 0.01, 0.07 - i * 0.07); this.body.add(rb); }
            this.body.position.set(0, 0.52, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this._lvStrut(this.head, coat, [0, 0, 0], [0, 0.06, 0.06], 0.07, 0.06);
            this._lvBall(this.head, coat, 0, 0.08, 0.1, 0.095, 0.9, 0.85, 1.1);
            this._lvCone(this.head, coat, 0, 0.06, 0.25, 0.05, 0.2, 5).rotation.x = Math.PI / 2;
            this._lvBall(this.head, dark, 0, 0.06, 0.35, 0.018, 1, 1, 1, 4);
            // The lower jaw, hung open in a laugh.
            this._lvJaw = new THREE.Group();
            this._lvCone(this._lvJaw, cream, 0, 0, 0.08, 0.035, 0.16, 5).rotation.x = Math.PI / 2;
            this._lvBall(this._lvJaw, this._mat(0xc85a6a, 1.0, 0.5), 0, 0.012, 0.06, 0.03, 0.8, 0.4, 1.6, 5);
            this._lvJaw.position.set(0, 0.04, 0.15); this._lvJaw.rotation.x = 0.35; this.head.add(this._lvRest(this._lvJaw));
            this._lvEye(this.head, -0.05, 0.11, 0.17, 0.025, { iris: p.accent, glow: true });
            this._lvEye(this.head, 0.05, 0.11, 0.17, 0.025, { iris: p.accent, glow: true });
            this._lvEar(this.head, -1, 0.06, 0.15, 0.07, { w: 0.055, h: 0.15, mat: coat, inner: 0xe8d8b8, tz: 0.25 });
            this._lvEar(this.head, 1, 0.06, 0.15, 0.07, { w: 0.055, h: 0.15, mat: coat, inner: 0xe8d8b8, tz: 0.25 });
            // A chain collar round the neck, padlock dangling at the throat.
            const collar = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.016, 4, 10), iron); collar.rotation.x = -Math.PI / 4; collar.position.set(0, 0.03, 0.03); this.head.add(collar);
            const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.015, 0.006, 3, 8), iron); shackle.position.set(0, -0.03, 0.09); this.head.add(shackle);
            this._lvBox(this.head, rust, 0, -0.06, 0.09, 0.05, 0.055, 0.025);
            this.head.position.set(0, 0.62, 0.26); this.bodyGroup.add(this.head);

            this.frontLeft  = this._lvLeg(coat, -0.08, 0.48, 0.2, { r: 0.03, footR: 0.035, knee: 0.02 });
            this.frontRight = this._lvLeg(coat, 0.08, 0.48, 0.2, { r: 0.03, footR: 0.035, knee: 0.02 });
            this.rearLeft   = this._lvLeg(coat, -0.08, 0.5, -0.2, { r: 0.035, footR: 0.035, knee: -0.08 });
            this.rearRight  = this._lvLeg(coat, 0.08, 0.5, -0.2, { r: 0.035, footR: 0.035, knee: -0.08 });
            this.tail = this._lvTail(coat, 0.54, -0.32, [[0, -0.1, -0.08], [0, -0.24, -0.12], [0, -0.34, -0.1]], [0.04, 0.05, 0.05, 0.04, 0.03]);
            this._lvBall(this.tail, dark, 0, -0.36, -0.1, 0.032, 1, 1, 1, 5);
            this._lvMove = 'prowl';
            this._wireLv({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail, mouth: this._lvJaw });
        }

        // ── Moor Wolf Pup: all head and paws, milk fangs bared, a pale blaze
        //    down its face ────────────────────────────────────────────────
        _buildLvMoorwolfpup() {
            const p = this.profile;
            const coat = this._lvCoat('saddle'), pale = this._mat(0xe8e4dc, 1.0, 0.9), dark = this._mat(0x141210, 1.0, 0.5);
            this.body = new THREE.Group();
            this._lvBall(this.body, coat, 0, 0, 0, 0.16, 0.95, 0.95, 1.35);
            this._lvBall(this.body, pale, 0, -0.04, 0.15, 0.1, 0.8, 0.9, 0.7, 6);
            this.body.position.set(0, 0.36, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this._lvBall(this.head, coat, 0, 0.06, 0.07, 0.15);
            this._lvBall(this.head, pale, 0, 0, 0.2, 0.07, 0.9, 0.8, 1.2, 6);
            this._lvBall(this.head, dark, 0, 0.02, 0.28, 0.025, 1, 1, 1, 4);
            for (const fx of [-0.025, 0.025]) this._lvCone(this.head, this._mat(0xfffaf0, 1.0, 0.3), fx, -0.05, 0.26, 0.008, 0.035, 3).rotation.x = Math.PI;
            this._lvBall(this.head, pale, 0, 0.13, 0.17, 0.05, 0.5, 1.2, 0.4, 5);
            this._lvEye(this.head, -0.065, 0.09, 0.18, 0.03, { iris: p.accent, pupil: true });
            this._lvEye(this.head, 0.065, 0.09, 0.18, 0.03, { iris: p.accent, pupil: true });
            this._lvEar(this.head, -1, 0.085, 0.16, 0.04, { w: 0.07, h: 0.13, mat: coat, inner: 0xd8c8b8, tz: 0.35 });
            this._lvEar(this.head, 1, 0.085, 0.16, 0.04, { w: 0.07, h: 0.13, mat: coat, inner: 0xd8c8b8, tz: 0.35 });
            this.head.position.set(0, 0.44, 0.17); this.bodyGroup.add(this.head);

            // Paws it has not grown into yet.
            this.frontLeft  = this._lvLeg(coat, -0.09, 0.3, 0.15, { r: 0.04, footR: 0.075, knee: 0.02, claw: 0x2a2420 });
            this.frontRight = this._lvLeg(coat, 0.09, 0.3, 0.15, { r: 0.04, footR: 0.075, knee: 0.02, claw: 0x2a2420 });
            this.rearLeft   = this._lvLeg(coat, -0.09, 0.3, -0.15, { r: 0.045, footR: 0.07, knee: -0.05, claw: 0x2a2420 });
            this.rearRight  = this._lvLeg(coat, 0.09, 0.3, -0.15, { r: 0.045, footR: 0.07, knee: -0.05, claw: 0x2a2420 });
            this.tail = this._lvTail(coat, 0.4, -0.21, [[0, 0.05, -0.08], [0, 0.08, -0.15]], [0.04, 0.05, 0.045]);
            this._lvMove = 'prowl';
            this._wireLv({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Dromedary Calf: knob-kneed and spoiled, long lashes, chewing,
        //    a spit bubble swelling on its lip ─────────────────────────────
        _buildLvDromedarycalf() {
            const p = this.profile;
            const coat = this._lvCoat('flat'), dark = this._mat(p.accent, 1.0, 0.6), lip = this._mat(0xb89060, 1.0, 0.8);
            const spit = this._mat(0xd8f0ff, 0.55, 0.05);
            this.body = new THREE.Group();
            this._lvBall(this.body, coat, 0, 0, 0, 0.2, 0.85, 0.9, 1.3);
            this._lvBall(this.body, coat, 0, 0.16, -0.02, 0.12, 1, 1, 1.3, 6);
            this.body.position.set(0, 0.8, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this._lvStrut(this.head, coat, [0, 0, 0], [0, 0.2, 0.12], 0.07, 0.055);
            this._lvBall(this.head, coat, 0, 0.2, 0.12, 0.055, 1, 1, 1, 5);
            this._lvStrut(this.head, coat, [0, 0.2, 0.12], [0, 0.36, 0.14], 0.055, 0.05);
            this._lvBall(this.head, coat, 0, 0.4, 0.18, 0.085, 0.85, 0.85, 1.5);
            this._lvEye(this.head, -0.05, 0.43, 0.22, 0.025);
            this._lvEye(this.head, 0.05, 0.43, 0.22, 0.025);
            // Long lashes, three over each eye.
            for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) this._lvSpike(this.head, dark, [sd * (0.045 + i * 0.008), 0.448, 0.225 - i * 0.008], [sd * 0.4, 1, 0.6], 0.005, 0.04, 3);
            this._lvEar(this.head, -1, 0.05, 0.45, 0.1, { w: 0.025, h: 0.06, mat: coat, tz: 0.6 });
            this._lvEar(this.head, 1, 0.05, 0.45, 0.1, { w: 0.025, h: 0.06, mat: coat, tz: 0.6 });
            // The chewing lip and the spit bubble on it.
            this._lvJaw = new THREE.Group();
            this._lvBall(this._lvJaw, lip, 0, 0.01, 0.04, 0.05, 1.1, 0.8, 1, 6);
            this._lvBall(this._lvJaw, spit, 0, -0.02, 0.085, 0.035, 1, 1, 1, 6);
            this._lvJaw.position.set(0, 0.35, 0.26); this.head.add(this._lvRest(this._lvJaw));
            this.head.position.set(0, 0.86, 0.2); this.bodyGroup.add(this.head);

            this.frontLeft  = this._lvLeg(coat, -0.1, 0.72, 0.15, { r: 0.03, kneeR: 0.05, knee: 0.02, foot: 'pad', footR: 0.05, footMat: lip });
            this.frontRight = this._lvLeg(coat, 0.1, 0.72, 0.15, { r: 0.03, kneeR: 0.05, knee: 0.02, foot: 'pad', footR: 0.05, footMat: lip });
            this.rearLeft   = this._lvLeg(coat, -0.1, 0.72, -0.16, { r: 0.035, kneeR: 0.05, knee: -0.05, foot: 'pad', footR: 0.05, footMat: lip });
            this.rearRight  = this._lvLeg(coat, 0.1, 0.72, -0.16, { r: 0.035, kneeR: 0.05, knee: -0.05, foot: 'pad', footR: 0.05, footMat: lip });
            this.tail = this._lvTail(coat, 0.84, -0.25, [[0, -0.12, -0.04], [0, -0.24, -0.05]], [0.02, 0.016, 0.012]);
            this._lvBall(this.tail, dark, 0, -0.26, -0.05, 0.03, 1, 1.3, 1, 5);
            this._lvMove = 'drowse';
            this._wireLv({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail, mouth: this._lvJaw });
        }

        // ── Marsh Otter: sat up on its tail, a flat river stone balanced on
        //    its head and another held ready to throw ──────────────────────
        _buildLvMarshotter() {
            const p = this.profile;
            const coat = this._lvCoat('saddle', null, 0.5), pale = this._mat(0xd8c8b0, 1.0, 0.8), dark = this._mat(0x14100c, 1.0, 0.4);
            const stone = this._mat(p.accent, 1.0, 0.6);
            this.body = new THREE.Group();
            this._lvBall(this.body, coat, 0, 0.12, 0, 0.15, 0.9, 1.7, 0.85);
            this._lvBall(this.body, pale, 0, 0.18, 0.08, 0.1, 0.8, 1.6, 0.5, 6);
            this.body.position.set(0, 0.3, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this._lvBall(this.head, coat, 0, 0.05, 0.03, 0.1, 1.15, 0.85, 1);
            this._lvBall(this.head, pale, 0, 0.01, 0.11, 0.06, 1.4, 0.8, 0.8, 6);
            this._lvBall(this.head, dark, 0, 0.03, 0.155, 0.022, 1.4, 1, 1, 4);
            this._lvEye(this.head, -0.05, 0.08, 0.1, 0.02);
            this._lvEye(this.head, 0.05, 0.08, 0.1, 0.02);
            this._lvEar(this.head, -1, 0.1, 0.07, -0.01, { shape: 'round', w: 0.025, h: 0.035, mat: coat, tz: 1.0 });
            this._lvEar(this.head, 1, 0.1, 0.07, -0.01, { shape: 'round', w: 0.025, h: 0.035, mat: coat, tz: 1.0 });
            this._lvWhiskers(this.head, 0.06, 0, 0.12, 0.16, 0xf0ece0);
            // The stone it keeps balanced on its head.
            this._lvBall(this.head, stone, 0, 0.15, 0.03, 0.08, 1.3, 0.45, 1, 6);
            this.head.position.set(0, 0.66, 0.02); this.bodyGroup.add(this.head);

            this.frontLeft  = this._lvArm(coat, -1, -0.1, 0.56, 0.05, { r: 0.03, elbowY: -0.09, handX: -0.05, handY: -0.14, reach: 0.12, handMat: dark });
            this.frontRight = this._lvArm(coat, 1, 0.1, 0.56, 0.05, { r: 0.03, elbowY: -0.09, handX: -0.05, handY: -0.14, reach: 0.12, handMat: dark });
            this._lvBall(this.frontRight.hand, stone, -0.05, 0, 0.02, 0.055, 1.2, 0.6, 1, 6);
            this.rearLeft   = this._lvLeg(coat, -0.09, 0.22, -0.02, { r: 0.045, footR: 0.055, knee: 0.05, foot: 'web', footMat: dark });
            this.rearRight  = this._lvLeg(coat, 0.09, 0.22, -0.02, { r: 0.045, footR: 0.055, knee: 0.05, foot: 'web', footMat: dark });
            this.tail = this._lvTail(coat, 0.24, -0.08, [[0, -0.12, -0.12], [0, -0.19, -0.28], [0, -0.19, -0.42]], [0.07, 0.06, 0.045, 0.03, 0.02]);
            this._lvMove = 'sit';
            this._wireLv({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Frost Stoat: a white winter stoat stood up like a periscope, a
        //    black tail tip and frost grown along its back ─────────────────
        _buildLvFroststoat() {
            const p = this.profile;
            const coat = this._lvCoat('flat'), black = this._mat(p.accent, 1.0, 0.6), ice = this._mat(0xbfe8ff, 0.8, 0.15, 0x6ab8e8);
            this.body = new THREE.Group();
            const spine = [[0, 0, -0.1], [0, 0.04, 0.04], [0, 0.18, 0.08], [0, 0.32, 0.08]];
            const rad = [0.1, 0.095, 0.085, 0.075];
            spine.forEach((q, i) => {
                this._lvBall(this.body, coat, q[0], q[1], q[2], rad[i], 1, 1, 1.15);
                if (i) this._lvStrut(this.body, coat, spine[i - 1], q, rad[i - 1] * 0.95, rad[i] * 0.95);
            });
            for (let i = 0; i < 3; i++) this._lvSpike(this.body, ice, [0, 0.08, -0.08 - i * 0.04], [0, 1, -0.3 - i * 0.2], 0.02, 0.08, 4);
            this.body.position.set(0, 0.16, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this._lvBall(this.head, coat, 0, 0.03, 0.05, 0.075, 0.9, 0.85, 1.25);
            this._lvCone(this.head, coat, 0, 0.02, 0.13, 0.035, 0.08, 5).rotation.x = Math.PI / 2;
            this._lvBall(this.head, black, 0, 0.02, 0.17, 0.014, 1, 1, 1, 4);
            this._lvEye(this.head, -0.04, 0.06, 0.1, 0.018);
            this._lvEye(this.head, 0.04, 0.06, 0.1, 0.018);
            this._lvEar(this.head, -1, 0.05, 0.08, 0, { shape: 'round', w: 0.028, h: 0.035, mat: coat, inner: 0xf0e0e0, tz: 0.4 });
            this._lvEar(this.head, 1, 0.05, 0.08, 0, { shape: 'round', w: 0.028, h: 0.035, mat: coat, inner: 0xf0e0e0, tz: 0.4 });
            this.head.position.set(0, 0.5, 0.1); this.bodyGroup.add(this.head);

            this.frontLeft  = this._lvArm(coat, -1, -0.06, 0.42, 0.1, { r: 0.02, elbowY: -0.06, handY: -0.1, reach: 0.04, handR: 0.022 });
            this.frontRight = this._lvArm(coat, 1, 0.06, 0.42, 0.1, { r: 0.02, elbowY: -0.06, handY: -0.1, reach: 0.04, handR: 0.022 });
            this.rearLeft   = this._lvLeg(coat, -0.08, 0.14, -0.1, { r: 0.035, footR: 0.035, knee: 0.04, foot: 'long' });
            this.rearRight  = this._lvLeg(coat, 0.08, 0.14, -0.1, { r: 0.035, footR: 0.035, knee: 0.04, foot: 'long' });
            this.tail = this._lvTail(coat, 0.16, -0.21, [[0, -0.03, -0.12], [0, -0.07, -0.24]], [0.03, 0.03, 0.028]);
            this._lvBall(this.tail, black, 0, -0.08, -0.28, 0.04, 1, 1, 1.3, 6);
            this._lvMove = 'sit';
            this._wireLv({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Yeti Cub: a shaggy snowball on stubby legs, long hugging arms, a
        //    flat blue face and two ice nubs where horns will grow ─────────
        _buildLvYeticub() {
            const p = this.profile;
            const coat = this._lvCoat('mottle'), face = this._mat(p.accent, 1.0, 0.7), dark = this._mat(0x2a3448, 1.0, 0.5);
            const horn = this._mat(0xbfe0f0, 0.9, 0.2, 0x3a6a8a);
            this.body = new THREE.Group();
            this._lvBall(this.body, coat, 0, 0, 0, 0.26, 1, 1.05, 0.9, 8);
            for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; this._lvSpike(this.body, coat, [Math.cos(a) * 0.2, -0.12, Math.sin(a) * 0.17], [Math.cos(a) * 0.3, -1, Math.sin(a) * 0.3], 0.05, 0.12, 4); }
            for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; this._lvSpike(this.body, coat, [Math.cos(a) * 0.17, 0.16, Math.sin(a) * 0.14], [Math.cos(a) * 0.6, -0.4, Math.sin(a) * 0.6], 0.045, 0.1, 4); }
            this.body.position.set(0, 0.44, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this._lvBall(this.head, coat, 0, 0.08, 0.02, 0.17);
            this._lvBall(this.head, face, 0, 0.06, 0.15, 0.12, 1, 1.05, 0.5, 6);
            this._lvBall(this.head, dark, 0, 0.05, 0.21, 0.03, 1.6, 0.8, 0.8, 5);
            this._lvBall(this.head, dark, 0, -0.01, 0.2, 0.03, 1.6, 0.5, 0.5, 5);
            this._lvEye(this.head, -0.05, 0.1, 0.2, 0.022);
            this._lvEye(this.head, 0.05, 0.1, 0.2, 0.022);
            for (const sd of [-1, 1]) this._lvSpike(this.head, horn, [sd * 0.07, 0.22, 0.02], [sd * 0.4, 1, 0], 0.025, 0.08, 4);
            for (let i = -1; i <= 1; i++) this._lvSpike(this.head, coat, [i * 0.03, 0.24, -0.02], [i * 0.5, 1, -0.3], 0.03, 0.08, 4);
            this.head.position.set(0, 0.68, 0.02); this.bodyGroup.add(this.head);

            this.frontLeft  = this._lvArm(coat, -1, -0.24, 0.56, 0.02, { r: 0.06, elbowX: 0.04, elbowY: -0.14, elbowZ: 0.04, handY: -0.26, reach: 0.14, handR: 0.08, handMat: face });
            this.frontRight = this._lvArm(coat, 1, 0.24, 0.56, 0.02, { r: 0.06, elbowX: 0.04, elbowY: -0.14, elbowZ: 0.04, handY: -0.26, reach: 0.14, handR: 0.08, handMat: face });
            this.rearLeft   = this._lvLeg(coat, -0.12, 0.22, 0, { r: 0.07, footR: 0.09, footMat: face });
            this.rearRight  = this._lvLeg(coat, 0.12, 0.22, 0, { r: 0.07, footR: 0.09, footMat: face });
            this.tail = this._lvTail(coat, 0.36, -0.22, [[0, -0.02, -0.05]], [0.05, 0.035]);
            this._lvMove = 'sit';
            this._wireLv({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Snow Sled Pup: a husky pup still in the red harness it slipped,
        //    the snapped trace trailing and a brass bell at its chest ───────
        _buildLvSnowsledpup() {
            const p = this.profile;
            const coat = this._lvCoat('saddle'), white = this._mat(0xf0f0f0, 1.0, 0.9), strap = this._mat(p.accent, 1.0, 0.6);
            const brass = this._mat(0xc8a040, 1.0, 0.3, 0x3a2a08), rope = this._mat(0xa08860, 1.0, 0.9), dark = this._mat(0x141210, 1.0, 0.5);
            this.body = new THREE.Group();
            this._lvBall(this.body, coat, 0, 0, 0, 0.17, 0.95, 0.95, 1.4);
            this._lvBall(this.body, white, 0, -0.03, 0.14, 0.12, 0.85, 0.85, 0.8, 6);
            for (const z of [0.12, -0.12]) { const band = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.018, 4, 10), strap); band.position.set(0, 0, z); this.body.add(band); }
            this._lvBox(this.body, strap, 0, 0.16, 0, 0.04, 0.02, 0.26);
            this._lvStrut(this.body, rope, [0, 0.15, -0.12], [0.1, -0.02, -0.36], 0.014, 0.012, 4);
            for (const d of [[1, -0.3, -0.6], [0.6, -0.8, -0.4], [1.2, -0.6, -0.2]]) this._lvSpike(this.body, rope, [0.1, -0.02, -0.36], d, 0.008, 0.04, 3);
            this._lvBall(this.body, brass, 0, -0.17, 0.12, 0.035, 1, 1, 1, 6);
            this.body.position.set(0, 0.38, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this._lvBall(this.head, coat, 0, 0.04, 0.05, 0.12);
            this._lvBall(this.head, white, 0, -0.01, 0.12, 0.09, 1.1, 0.8, 0.9, 6);
            this._lvCone(this.head, white, 0, -0.01, 0.2, 0.05, 0.14, 5).rotation.x = Math.PI / 2;
            this._lvBall(this.head, dark, 0, 0, 0.27, 0.02, 1, 1, 1, 4);
            for (const sd of [-1, 1]) this._lvBall(this.head, white, sd * 0.04, 0.11, 0.14, 0.015, 1, 1, 1, 4);
            this._lvEye(this.head, -0.055, 0.07, 0.15, 0.025, { iris: 0x8ad0ff, pupil: true });
            this._lvEye(this.head, 0.055, 0.07, 0.15, 0.025, { iris: 0x8ad0ff, pupil: true });
            this._lvEar(this.head, -1, 0.065, 0.13, 0.03, { w: 0.055, h: 0.1, mat: coat, inner: 0xf0f0f0, tz: 0.15 });
            this._lvEar(this.head, 1, 0.065, 0.13, 0.03, { w: 0.055, h: 0.1, mat: coat, inner: 0xf0f0f0, tz: 0.15 });
            this.head.position.set(0, 0.46, 0.21); this.bodyGroup.add(this.head);

            this.frontLeft  = this._lvLeg(coat, -0.09, 0.3, 0.16, { r: 0.035, footR: 0.04, knee: 0.02, footMat: white });
            this.frontRight = this._lvLeg(coat, 0.09, 0.3, 0.16, { r: 0.035, footR: 0.04, knee: 0.02, footMat: white });
            this.rearLeft   = this._lvLeg(coat, -0.09, 0.32, -0.17, { r: 0.04, footR: 0.04, knee: -0.05, footMat: white });
            this.rearRight  = this._lvLeg(coat, 0.09, 0.32, -0.17, { r: 0.04, footR: 0.04, knee: -0.05, footMat: white });
            this.tail = this._lvTail(coat, 0.44, -0.23, [[0, 0.1, -0.06], [0, 0.18, 0], [0, 0.16, 0.08]], [0.045, 0.06, 0.06, 0.05, 0.035]);
            this._lvMove = 'prowl';
            this._wireLv({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Shrine Mouse: a white temple mouse with red eyes, paws pressed
        //    together over a stolen grain of rice, a paper streamer at its
        //    throat on a red cord ──────────────────────────────────────────
        _buildLvShrinemouse() {
            const p = this.profile;
            const coat = this._lvCoat('flat'), pink = this._mat(0xf0b0b8, 1.0, 0.6), red = this._mat(p.accent, 1.0, 0.5), paper = this._mat(0xfaf8f0, 1.0, 0.9);
            this.body = new THREE.Group();
            this._lvBall(this.body, coat, 0, 0.03, 0, 0.15, 0.9, 1.2, 0.9);
            const cord = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.012, 4, 10), red); cord.rotation.x = Math.PI / 2; cord.position.set(0, 0.16, 0); this.body.add(cord);
            // Two zigzag paper streamers (shide) hung from the cord.
            for (const sd of [-1, 1]) [0, 1, 2].forEach(i => this._lvBox(this.body, paper, sd * (0.03 + (i % 2) * 0.012), 0.135 - i * 0.03, 0.095 + i * 0.006, 0.03, 0.035, 0.004));
            this.body.position.set(0, 0.26, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this._lvBall(this.head, coat, 0, 0.05, 0.04, 0.1);
            this._lvCone(this.head, coat, 0, 0.02, 0.14, 0.05, 0.12, 5).rotation.x = Math.PI / 2;
            this._lvBall(this.head, pink, 0, 0.02, 0.205, 0.014, 1, 1, 1, 4);
            this._lvEye(this.head, -0.05, 0.08, 0.11, 0.025, { iris: p.accent, glow: true });
            this._lvEye(this.head, 0.05, 0.08, 0.11, 0.025, { iris: p.accent, glow: true });
            this._lvEar(this.head, -1, 0.07, 0.12, 0, { shape: 'round', w: 0.065, h: 0.11, mat: coat, inner: 0xf0b0b8, tz: 0.35 });
            this._lvEar(this.head, 1, 0.07, 0.12, 0, { shape: 'round', w: 0.065, h: 0.11, mat: coat, inner: 0xf0b0b8, tz: 0.35 });
            this._lvWhiskers(this.head, 0.025, 0.01, 0.17, 0.14);
            this.head.position.set(0, 0.46, 0.03); this.bodyGroup.add(this.head);

            this.frontLeft  = this._lvArm(coat, -1, -0.07, 0.38, 0.06, { r: 0.022, elbowY: -0.06, handX: -0.055, handY: -0.07, reach: 0.1, handR: 0.028, handMat: pink });
            this.frontRight = this._lvArm(coat, 1, 0.07, 0.38, 0.06, { r: 0.022, elbowY: -0.06, handX: -0.055, handY: -0.07, reach: 0.1, handR: 0.028, handMat: pink });
            this._lvBall(this.frontRight.hand, paper, -0.015, 0.03, 0.01, 0.012, 1, 1.6, 1, 4);
            this.rearLeft   = this._lvLeg(coat, -0.08, 0.15, -0.02, { r: 0.035, footR: 0.035, knee: 0.04, foot: 'long', footMat: pink });
            this.rearRight  = this._lvLeg(coat, 0.08, 0.15, -0.02, { r: 0.035, footR: 0.035, knee: 0.04, foot: 'long', footMat: pink });
            this.tail = this._lvTail(pink, 0.17, -0.1, [[0.04, -0.12, -0.06], [0.14, -0.15, 0], [0.18, -0.15, 0.12]], [0.02, 0.017, 0.013, 0.01]);
            this._lvMove = 'sit';
            this._wireLv({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Pilgrim Goat Kid: a bell-collared kid on wobbly legs, horn nubs,
        //    bar-pupilled eyes and somebody's map rolled up in its mouth ────
        _buildLvPilgrimgoatkid() {
            const p = this.profile;
            const coat = this._lvCoat('mottle'), horn = this._mat(0xd8c8a0, 1.0, 0.5), brass = this._mat(p.accent, 1.0, 0.3, 0x3a2a08);
            const paper = this._mat(0xe8dcb0, 1.0, 0.9), seal = this._mat(0xa02020, 1.0, 0.5), strap = this._mat(0x6a3a20, 1.0, 0.8);
            this.body = new THREE.Group();
            this._lvBall(this.body, coat, 0, 0, 0, 0.17, 0.85, 0.9, 1.35);
            this.body.position.set(0, 0.58, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this._lvStrut(this.head, coat, [0, 0, 0], [0, 0.08, 0.05], 0.05, 0.045);
            this._lvBall(this.head, coat, 0, 0.12, 0.1, 0.09, 0.85, 0.9, 1.35);
            this._lvBall(this.head, coat, 0, 0.09, 0.2, 0.05, 0.9, 0.8, 1);
            this._lvBall(this.head, this._mat(0x2a1c18, 1.0, 0.5), 0, 0.1, 0.245, 0.015, 1, 1, 1, 4);
            for (const sd of [-1, 1]) this._lvCone(this.head, horn, sd * 0.035, 0.21, 0.08, 0.02, 0.05, 4);
            this._lvEar(this.head, -1, 0.07, 0.15, 0.06, { w: 0.03, h: 0.1, mat: coat, inner: 0xe8c8b8, tz: 1.3 });
            this._lvEar(this.head, 1, 0.07, 0.15, 0.06, { w: 0.03, h: 0.1, mat: coat, inner: 0xe8c8b8, tz: 1.3 });
            this._lvEye(this.head, -0.06, 0.14, 0.14, 0.022, { iris: 0xc8a040, pupil: true, bar: true });
            this._lvEye(this.head, 0.06, 0.14, 0.14, 0.022, { iris: 0xc8a040, pupil: true, bar: true });
            // The pilgrim's map, half eaten: a scroll across the mouth and a
            // chewed sheet hanging off it.
            this._lvCyl(this.head, paper, 0, 0.06, 0.22, 0.02, 0.02, 0.18, 6).rotation.z = Math.PI / 2;
            this._lvBall(this.head, seal, 0, 0.06, 0.243, 0.012, 1, 1, 0.5, 5);
            this._lvBox(this.head, paper, 0.05, 0.02, 0.225, 0.06, 0.08, 0.004).rotation.z = 0.2;
            // A bell collar round the neck.
            const collar = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.01, 4, 10), strap); collar.rotation.x = -1.01; collar.position.set(0, 0.03, 0.02); this.head.add(collar);
            this._lvCone(this.head, brass, 0, -0.01, 0.06, 0.025, 0.035, 6);
            this._lvBall(this.head, brass, 0, -0.03, 0.06, 0.01, 1, 1, 1, 4);
            this.head.position.set(0, 0.66, 0.18); this.bodyGroup.add(this.head);

            this.frontLeft  = this._lvLeg(coat, -0.08, 0.52, 0.15, { r: 0.028, kneeR: 0.035, knee: 0.02, foot: 'hoof', footR: 0.03 });
            this.frontRight = this._lvLeg(coat, 0.08, 0.52, 0.15, { r: 0.028, kneeR: 0.035, knee: 0.02, foot: 'hoof', footR: 0.03 });
            this.rearLeft   = this._lvLeg(coat, -0.08, 0.52, -0.16, { r: 0.03, kneeR: 0.035, knee: -0.05, foot: 'hoof', footR: 0.03 });
            this.rearRight  = this._lvLeg(coat, 0.08, 0.52, -0.16, { r: 0.03, kneeR: 0.035, knee: -0.05, foot: 'hoof', footR: 0.03 });
            this.tail = this._lvTail(coat, 0.65, -0.2, [[0, 0.06, -0.04]], [0.03, 0.02]);
            this._lvMove = 'prowl';
            this._wireLv({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Shrine Fox: sits formally in a red bib, its face a white festival
        //    mask with red brush marks, tail raised like a flame ───────────
        _buildLvShrinefox() {
            const p = this.profile;
            const coat = this._lvCoat('belly'), white = this._mat(0xf4f0e8, 1.0, 0.9), red = this._mat(p.accent, 1.0, 0.6), black = this._mat(0x18120e, 1.0, 0.6);
            const gold = this._mat(0xe8c040, 1.0, 0.3, 0xe8a020);
            this.body = new THREE.Group();
            this._lvBall(this.body, coat, 0, 0.05, 0, 0.17, 0.9, 1.25, 0.95).rotation.x = 0.2;
            for (const sd of [-1, 1]) this._lvBall(this.body, coat, sd * 0.09, -0.12, -0.06, 0.13, 0.8, 0.85, 1.2);
            // The red bib knotted at the throat, a gold bell on it.
            const bib = this._lvCyl(this.body, red, 0, 0.15, 0.13, 0.14, 0.001, 0.18, 3); bib.rotation.y = Math.PI; bib.scale.z = 0.35;
            this._lvBall(this.body, gold, 0, 0.22, 0.165, 0.02, 1, 1, 1, 5);
            this.body.position.set(0, 0.34, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this._lvBall(this.head, coat, 0, 0.05, 0.04, 0.11);
            this._lvCone(this.head, coat, 0, 0.01, 0.16, 0.045, 0.15, 5).rotation.x = Math.PI / 2;
            this._lvBall(this.head, black, 0, 0.01, 0.235, 0.015, 1, 1, 1, 4);
            // The mask: a white face plate painted with red slashes.
            this._lvBall(this.head, white, 0, 0.04, 0.1, 0.1, 1, 0.95, 0.55, 6);
            for (const sd of [-1, 1]) this._lvBox(this.head, red, sd * 0.045, 0.1, 0.152, 0.04, 0.01, 0.01).rotation.z = sd * 0.5;
            this._lvBall(this.head, red, 0, 0.125, 0.148, 0.012, 1, 1, 0.5, 4);
            for (const sd of [-1, 1]) { const e = this._lvEye(this.head, sd * 0.045, 0.065, 0.148, 0.022, { iris: gold.color.getHex(), glow: true }); e.scale.y = 0.5; e.rotation.z = sd * 0.3; }
            this._lvEar(this.head, -1, 0.065, 0.12, 0, { w: 0.055, h: 0.14, mat: coat, inner: 0xf4f0e8, tz: 0.18, tuft: 0.04, tuftColor: 0x18120e });
            this._lvEar(this.head, 1, 0.065, 0.12, 0, { w: 0.055, h: 0.14, mat: coat, inner: 0xf4f0e8, tz: 0.18, tuft: 0.04, tuftColor: 0x18120e });
            this.head.position.set(0, 0.6, 0.05); this.bodyGroup.add(this.head);

            this.frontLeft  = this._lvLeg(black, -0.06, 0.32, 0.1, { r: 0.025, footR: 0.035 });
            this.frontRight = this._lvLeg(black, 0.06, 0.32, 0.1, { r: 0.025, footR: 0.035 });
            this.rearLeft   = this._lvLeg(coat, -0.12, 0.12, -0.06, { r: 0.04, footR: 0.04, knee: 0.05, foot: 'long', footMat: black });
            this.rearRight  = this._lvLeg(coat, 0.12, 0.12, -0.06, { r: 0.04, footR: 0.04, knee: 0.05, foot: 'long', footMat: black });
            this.tail = this._lvTail(coat, 0.24, -0.14, [[0, 0.12, -0.1], [0, 0.3, -0.12], [0, 0.46, -0.06]], [0.05, 0.08, 0.09, 0.08, 0.05]);
            this._lvBall(this.tail, white, 0, 0.5, -0.04, 0.055, 1, 1.2, 1, 6);
            this._lvMove = 'sit';
            this._wireLv({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Slumber Sheep: a cloud of wool on spindly legs, eyelids at half
        //    mast and a striped nightcap flopped over to one side ──────────
        _buildLvSlumbersheep() {
            const p = this.profile;
            const wool = this._lvCoat('flat', null, 1.0), face = this._mat(0x2a2624, 1.0, 0.8), cap = this._lvCoat('bands', p.accent), pom = this._mat(0xf8f8f0, 1.0, 1.0);
            this.body = new THREE.Group();
            this._lvBall(this.body, wool, 0, 0, 0, 0.24, 1, 0.9, 1.25, 7);
            const puffs = [[0.16, 0.1, 0.12], [-0.16, 0.1, 0.12], [0.18, 0.08, -0.12], [-0.18, 0.08, -0.12], [0, 0.2, 0.05], [0, 0.18, -0.16], [0.12, 0.18, -0.02], [-0.12, 0.18, -0.02], [0.2, -0.06, 0], [-0.2, -0.06, 0], [0, 0.02, -0.28], [0, 0.06, 0.26]];
            puffs.forEach(([x, y, z], i) => this._lvBall(this.body, wool, x, y, z, 0.1 + (i % 3) * 0.015, 1, 1, 1, 6));
            this.body.position.set(0, 0.5, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this._lvBall(this.head, face, 0, 0, 0.07, 0.09, 0.8, 1, 1.3);
            for (const sd of [-1, 1]) this._lvEye(this.head, sd * 0.045, 0.03, 0.13, 0.022, { iris: 0xd8c8a0, pupil: true, bar: true, lid: 0.55, lidColor: 0x2a2624 });
            this._lvEar(this.head, -1, 0.06, 0.04, 0.04, { w: 0.03, h: 0.09, mat: face, inner: 0x6a5a58, tz: 1.45 });
            this._lvEar(this.head, 1, 0.06, 0.04, 0.04, { w: 0.03, h: 0.09, mat: face, inner: 0x6a5a58, tz: 1.45 });
            this._lvBall(this.head, wool, 0, 0.08, 0.04, 0.07, 1, 1, 1, 6);
            // The nightcap, its tip flopped over with a pom-pom on it.
            this._lvSpike(this.head, cap, [0, 0.12, 0.03], [0.5, 1, -0.2], 0.065, 0.2, 6);
            this._lvBall(this.head, pom, 0.084, 0.287, -0.003, 0.03, 1, 1, 1, 5);
            this.head.position.set(0, 0.52, 0.28); this.bodyGroup.add(this.head);

            this.frontLeft  = this._lvLeg(face, -0.1, 0.36, 0.14, { r: 0.022, foot: 'hoof', footR: 0.025 });
            this.frontRight = this._lvLeg(face, 0.1, 0.36, 0.14, { r: 0.022, foot: 'hoof', footR: 0.025 });
            this.rearLeft   = this._lvLeg(face, -0.1, 0.36, -0.14, { r: 0.022, foot: 'hoof', footR: 0.025 });
            this.rearRight  = this._lvLeg(face, 0.1, 0.36, -0.14, { r: 0.022, foot: 'hoof', footR: 0.025 });
            this.tail = this._lvTail(wool, 0.52, -0.3, [[0, -0.02, -0.05]], [0.06, 0.05]);
            this._lvMove = 'drowse';
            this._wireLv({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Dream Tapir: a round tapir floating in its sleep, a starry
        //    saddle round its middle and a wisp of nightmare on its trunk ───
        _buildLvDreamtapir() {
            const p = this.profile;
            const dark = this._lvCoat('flat'), saddle = this._lvCoat('speck', 0xd8d0f0), glow = this._mat(p.accent, 0.8, 0.3, p.accent);
            this.body = new THREE.Group();
            this._lvBall(this.body, dark, 0, 0, 0.18, 0.24, 1, 1, 1.05);
            this._lvBall(this.body, saddle, 0, 0.02, -0.04, 0.27, 1, 0.98, 0.9);
            this._lvBall(this.body, dark, 0, 0, -0.26, 0.23);
            this.body.position.set(0, 0.62, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this._lvBall(this.head, dark, 0, 0, 0.06, 0.14, 0.9, 0.95, 1.1);
            for (const sd of [-1, 1]) this._lvEye(this.head, sd * 0.075, 0.05, 0.14, 0.022, { lid: 0.6, lidColor: 0x2a2a3a });
            this._lvEar(this.head, -1, 0.08, 0.11, 0, { shape: 'round', w: 0.045, h: 0.07, mat: dark, inner: 0xe8e0f0, tz: 0.3 });
            this._lvEar(this.head, 1, 0.08, 0.11, 0, { shape: 'round', w: 0.045, h: 0.07, mat: dark, inner: 0xe8e0f0, tz: 0.3 });
            // The trunk, curled down, a wisp of eaten nightmare at its tip.
            this._lvJaw = new THREE.Group();
            this._lvChain(this._lvJaw, dark, [[0, -0.04, 0.07], [0, -0.11, 0.11], [0, -0.17, 0.09]], [0.05, 0.045, 0.035, 0.03]);
            this._lvBall(this._lvJaw, glow, 0, -0.2, 0.07, 0.035, 1, 1, 1, 5);
            this._lvJaw.position.set(0, -0.02, 0.2); this.head.add(this._lvRest(this._lvJaw));
            this.head.position.set(0, 0.68, 0.38); this.bodyGroup.add(this.head);

            // Short legs tucked up under it as it floats.
            const leg = (x, z) => this._lvLeg(dark, x, 0.5, z, { len: 0.2, r: 0.05, foot: 'hoof', footR: 0.05, hoofColor: 0x1a1a24 });
            this.frontLeft = leg(-0.13, 0.2); this.frontRight = leg(0.13, 0.2);
            this.rearLeft = leg(-0.13, -0.26); this.rearRight = leg(0.13, -0.26);
            this.tail = this._lvTail(dark, 0.64, -0.48, [[0, -0.02, -0.05]], [0.035, 0.025]);
            this._lvMove = 'float';
            this._wireLv({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail, mouth: this._lvJaw });
        }

        // ── Subway Rat: a soot-grey rat sat up washing its face, eyes shining
        //    like tunnel lamps, a bus ticket in its teeth ──────────────────
        _buildLvSubwayrat() {
            const p = this.profile;
            const coat = this._lvCoat('soot'), pink = this._mat(0xb89890, 1.0, 0.6), ticket = this._mat(0xe8d8a0, 1.0, 0.8), ink = this._mat(0x3a2a7a, 1.0, 0.8);
            this.body = new THREE.Group();
            this._lvBall(this.body, coat, 0, 0.03, -0.02, 0.17, 0.95, 1.15, 1.05);
            this.body.position.set(0, 0.3, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this._lvBall(this.head, coat, 0, 0.02, 0.05, 0.1, 0.9, 0.85, 1.2);
            this._lvCone(this.head, coat, 0, 0, 0.17, 0.055, 0.15, 5).rotation.x = Math.PI / 2;
            this._lvBall(this.head, pink, 0, 0, 0.248, 0.016, 1, 1, 1, 4);
            for (const ix of [-0.01, 0.01]) this._lvBox(this.head, this._mat(0xe8d8a8, 1.0, 0.4), ix, -0.04, 0.21, 0.012, 0.04, 0.01);
            this._lvEye(this.head, -0.05, 0.05, 0.12, 0.02, { iris: p.accent, glow: true });
            this._lvEye(this.head, 0.05, 0.05, 0.12, 0.02, { iris: p.accent, glow: true });
            this._lvEar(this.head, -1, 0.06, 0.08, 0, { shape: 'round', w: 0.055, h: 0.09, mat: coat, inner: 0xb89890, tz: 0.35 });
            this._lvEar(this.head, 1, 0.06, 0.08, 0, { shape: 'round', w: 0.055, h: 0.09, mat: coat, inner: 0xb89890, tz: 0.35 });
            this._lvWhiskers(this.head, 0.025, 0, 0.2, 0.15, 0x9a948a);
            // A punched travel ticket held crosswise in the teeth.
            this._lvBox(this.head, ticket, 0.04, -0.06, 0.21, 0.1, 0.006, 0.05).rotation.y = 0.5;
            this._lvBox(this.head, ink, 0.04, -0.055, 0.21, 0.08, 0.004, 0.012).rotation.y = 0.5;
            this.head.position.set(0, 0.5, 0.06); this.bodyGroup.add(this.head);

            this.frontLeft  = this._lvArm(coat, -1, -0.08, 0.42, 0.08, { r: 0.025, elbowX: 0.03, elbowY: -0.05, elbowZ: 0.05, handX: -0.03, handY: 0.04, reach: 0.12, handMat: pink });
            this.frontRight = this._lvArm(coat, 1, 0.08, 0.42, 0.08, { r: 0.025, elbowX: 0.03, elbowY: -0.05, elbowZ: 0.05, handX: -0.03, handY: 0.04, reach: 0.12, handMat: pink });
            this.rearLeft   = this._lvLeg(coat, -0.1, 0.19, -0.04, { r: 0.04, footR: 0.04, knee: 0.05, foot: 'long', footMat: pink });
            this.rearRight  = this._lvLeg(coat, 0.1, 0.19, -0.04, { r: 0.04, footR: 0.04, knee: 0.05, foot: 'long', footMat: pink });
            this.tail = this._lvTail(pink, 0.2, -0.15, [[0, -0.14, -0.1], [-0.12, -0.17, -0.2], [-0.28, -0.17, -0.16], [-0.36, -0.17, -0.02]], [0.028, 0.024, 0.019, 0.014, 0.01]);
            this._lvMove = 'scurry';
            this._wireLv({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Cyber Pup: a patchy puppy with a cheap implant: one eye a red
        //    lens in a riveted plate, an aerial, a tin hind leg ────────────
        _buildLvCyberpup() {
            const p = this.profile;
            const coat = this._lvCoat('spots'), metal = this._mat(0x8a9098, 1.0, 0.3), dark = this._mat(0x18181c, 1.0, 0.5);
            const led2 = this._mat(0x44ff88, 1.0, 0.2, 0x44ff88);
            this.body = new THREE.Group();
            this._lvBall(this.body, coat, 0, 0, 0, 0.16, 0.95, 0.95, 1.35);
            const collar = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.015, 4, 10), dark); collar.rotation.x = -0.6; collar.position.set(0, 0.06, 0.17); this.body.add(collar);
            this._lvBox(this.body, dark, 0, -0.02, 0.24, 0.05, 0.04, 0.035);
            this._lvBall(this.body, led2, 0, -0.02, 0.26, 0.008, 1, 1, 1, 4);
            this.body.position.set(0, 0.36, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this._lvBall(this.head, coat, 0, 0.05, 0.06, 0.13);
            this._lvBall(this.head, coat, 0, 0, 0.18, 0.06, 0.9, 0.8, 1.2, 6);
            this._lvBall(this.head, dark, 0, 0.01, 0.25, 0.022, 1, 1, 1, 4);
            this._lvEye(this.head, -0.06, 0.08, 0.17, 0.03, { iris: 0x3a2414, pupil: true });
            // The implant: a riveted plate over the right eye, a red lens in it.
            this._lvBox(this.head, metal, 0.065, 0.08, 0.15, 0.08, 0.08, 0.03).rotation.y = 0.4;
            const lens = this._lvEye(this.head, 0.06, 0.08, 0.17, 0.03, { iris: p.accent, glow: true });
            this._lvStrut(this.head, metal, [0.04, 0.16, 0.02], [0.08, 0.33, -0.02], 0.01, 0.007, 4);
            this._lvBall(this.head, led2, 0.08, 0.34, -0.02, 0.02, 1, 1, 1, 5);
            this._lvStrut(this.head, dark, [0.09, 0.03, 0.12], [0.06, -0.1, 0], 0.008, 0.008, 3);
            this._lvEar(this.head, -1, 0.11, 0.1, 0.03, { shape: 'round', w: 0.05, h: 0.11, mat: coat, inner: 0xd8b8a8, tz: 2.4 });
            this._lvEar(this.head, 1, 0.11, 0.1, 0.03, { shape: 'round', w: 0.05, h: 0.11, mat: coat, inner: 0xd8b8a8, tz: 2.4 });
            this.head.position.set(0, 0.44, 0.17); this.bodyGroup.add(this.head);
            this._lvGlow = [lens.children[0].material, led2];

            this.frontLeft  = this._lvLeg(coat, -0.09, 0.3, 0.15, { r: 0.04, footR: 0.05, knee: 0.02 });
            this.frontRight = this._lvLeg(coat, 0.09, 0.3, 0.15, { r: 0.04, footR: 0.05, knee: 0.02 });
            this.rearLeft   = this._lvLeg(coat, -0.09, 0.3, -0.15, { r: 0.045, footR: 0.05, knee: -0.05 });
            this.rearRight  = this._lvLeg(metal, 0.09, 0.3, -0.15, { r: 0.045, footR: 0.05, knee: -0.05 });
            this.tail = this._lvTail(coat, 0.42, -0.21, [[0, 0.07, -0.06], [0, 0.12, -0.08]], [0.03, 0.03, 0.025]);
            this._lvMove = 'prowl';
            this._wireLv({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Grease Rat: a fat rat slick with fryer oil, dripping, a chip
        //    sticking out of the side of its mouth ─────────────────────────
        _buildLvGreaserat() {
            const p = this.profile;
            const coat = this._lvCoat('mottle', null, 0.25), pink = this._mat(0xc89080, 1.0, 0.5), oil = this._mat(0xb8902a, 0.85, 0.1), fry = this._mat(p.accent, 1.0, 0.7);
            this.body = new THREE.Group();
            this._lvBall(this.body, coat, 0, 0, 0, 0.26, 1.05, 0.95, 1.2);
            for (const [x, z] of [[0.12, 0.08], [-0.1, -0.06], [0.04, -0.18]]) this._lvBall(this.body, oil, x, -0.2, z, 0.03, 1, 1.4, 1, 5);
            this.body.position.set(0, 0.28, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this._lvBall(this.head, coat, 0, 0, 0.04, 0.11, 1, 0.85, 1.15);
            this._lvCone(this.head, coat, 0, -0.02, 0.15, 0.055, 0.14, 5).rotation.x = Math.PI / 2;
            this._lvBall(this.head, pink, 0, -0.02, 0.22, 0.018, 1, 1, 1, 4);
            this._lvEye(this.head, -0.055, 0.04, 0.11, 0.02);
            this._lvEye(this.head, 0.055, 0.04, 0.11, 0.02);
            this._lvEar(this.head, -1, 0.065, 0.07, 0, { shape: 'round', w: 0.045, h: 0.07, mat: coat, inner: 0xc89080, tz: 0.4 });
            this._lvEar(this.head, 1, 0.065, 0.07, 0, { shape: 'round', w: 0.045, h: 0.07, mat: coat, inner: 0xc89080, tz: 0.4 });
            this._lvWhiskers(this.head, 0.03, -0.03, 0.18, 0.14, 0x6a5a40);
            this._lvBox(this.head, fry, 0.06, -0.05, 0.16, 0.022, 0.022, 0.2).rotation.y = 0.9;
            this._lvBall(this.head, oil, 0.14, -0.065, 0.22, 0.012, 1, 1.4, 1, 4);
            this.head.position.set(0, 0.36, 0.3); this.bodyGroup.add(this.head);

            this.frontLeft  = this._lvLeg(coat, -0.12, 0.14, 0.2, { r: 0.035, footR: 0.04, footMat: pink });
            this.frontRight = this._lvLeg(coat, 0.12, 0.14, 0.2, { r: 0.035, footR: 0.04, footMat: pink });
            this.rearLeft   = this._lvLeg(coat, -0.14, 0.15, -0.18, { r: 0.04, footR: 0.04, knee: -0.03, foot: 'long', footMat: pink });
            this.rearRight  = this._lvLeg(coat, 0.14, 0.15, -0.18, { r: 0.04, footR: 0.04, knee: -0.03, foot: 'long', footMat: pink });
            this.tail = this._lvTail(pink, 0.22, -0.3, [[0, -0.1, -0.12], [0.06, -0.17, -0.26], [0.14, -0.19, -0.36]], [0.04, 0.033, 0.026, 0.018, 0.012]);
            this._lvMove = 'scurry';
            this._wireLv({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Chainsaw Beaver: a furious beaver in a cloud of sawdust whose
        //    teeth have become a saw bar, buzzing in its mouth ─────────────
        _buildLvChainsawbeaver() {
            const p = this.profile;
            const coat = this._lvCoat('flat'), dark = this._mat(0x2a1a10, 1.0, 0.6), steel = this._mat(0xb8bcc4, 1.0, 0.25), orange = this._mat(p.accent, 1.0, 0.45);
            const tooth = this._mat(0xe8e0c8, 1.0, 0.3), dust = this._mat(0xe8c890, 1.0, 1.0), paddle = this._lvCoat('mottle', 0x3a2a20, 0.6);
            this.body = new THREE.Group();
            this._lvBall(this.body, coat, 0, 0.02, 0, 0.22, 1, 1.15, 0.95);
            for (let i = 0; i < 8; i++) {
                const th = 0.6 + (i % 3) * 0.5, ph = i * 2.1;
                this._lvBox(this.body, dust, Math.sin(th) * Math.sin(ph) * 0.22, 0.02 + Math.cos(th) * 0.253, Math.sin(th) * Math.cos(ph) * 0.209, 0.025, 0.012, 0.02);
            }
            this.body.position.set(0, 0.36, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this._lvBall(this.head, coat, 0, 0.04, 0.05, 0.14, 1.05, 0.95, 1);
            this._lvBall(this.head, coat, 0, -0.01, 0.15, 0.08, 1.3, 0.9, 1);
            this._lvBall(this.head, dark, 0, 0.03, 0.225, 0.025, 1.4, 1, 1, 4);
            this._lvEye(this.head, -0.06, 0.08, 0.15, 0.022, { iris: 0xff4020, glow: true });
            this._lvEye(this.head, 0.06, 0.08, 0.15, 0.022, { iris: 0xff4020, glow: true });
            for (const sd of [-1, 1]) this._lvBox(this.head, dark, sd * 0.055, 0.11, 0.16, 0.06, 0.016, 0.025).rotation.z = sd * 0.45;
            this._lvEar(this.head, -1, 0.11, 0.1, 0, { shape: 'round', w: 0.03, h: 0.04, mat: coat, tz: 0.5 });
            this._lvEar(this.head, 1, 0.11, 0.1, 0, { shape: 'round', w: 0.03, h: 0.04, mat: coat, tz: 0.5 });
            // The saw: an orange housing in the mouth between two incisors and
            // a toothed steel bar angled out of it. The bar buzzes.
            this._saw = new THREE.Group();
            this._lvBox(this._saw, orange, 0, 0, 0, 0.1, 0.07, 0.07);
            for (const sd of [-1, 1]) this._lvBox(this._saw, orange, sd * 0.065, 0.02, 0.02, 0.03, 0.07, 0.02);
            this._lvShake = new THREE.Group();
            this._lvBox(this._lvShake, steel, 0, 0, 0.15, 0.025, 0.06, 0.3);
            for (let i = 0; i < 6; i++) {
                this._lvCone(this._lvShake, tooth, 0, -0.04, 0.04 + i * 0.045, 0.012, 0.03, 3).rotation.x = Math.PI;
                this._lvCone(this._lvShake, tooth, 0, 0.04, 0.04 + i * 0.045, 0.012, 0.03, 3);
            }
            this._lvShake.position.set(0, -0.02, 0.03); this._lvShake.rotation.x = 0.45; this._saw.add(this._lvRest(this._lvShake));
            this._saw.position.set(0, -0.06, 0.18); this.head.add(this._saw);
            this.head.position.set(0, 0.64, 0.05); this.bodyGroup.add(this.head);

            this.frontLeft  = this._lvArm(coat, -1, -0.15, 0.5, 0.08, { r: 0.035, elbowY: -0.08, handX: -0.02, handY: -0.12, reach: 0.14, handMat: dark, claw: 0xe8dcc0 });
            this.frontRight = this._lvArm(coat, 1, 0.15, 0.5, 0.08, { r: 0.035, elbowY: -0.08, handX: -0.02, handY: -0.12, reach: 0.14, handMat: dark, claw: 0xe8dcc0 });
            this.rearLeft   = this._lvLeg(coat, -0.12, 0.2, 0, { r: 0.05, footR: 0.065, knee: 0.05, foot: 'web', footMat: dark });
            this.rearRight  = this._lvLeg(coat, 0.12, 0.2, 0, { r: 0.05, footR: 0.065, knee: 0.05, foot: 'web', footMat: dark });
            this.tail = new THREE.Group();
            this._lvStrut(this.tail, coat, [0, 0, 0], [0, -0.13, -0.14], 0.05, 0.04);
            this._lvBall(this.tail, paddle, 0, -0.165, -0.28, 0.14, 0.8, 0.14, 1.15, 7).rotation.x = 0.12;
            this.tail.position.set(0, 0.2, -0.15); this.bodyGroup.add(this.tail);
            this._lvMove = 'sit';
            this._wireLv({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail, mouth: this._saw });
        }

        // ── Shoplifting Raccoon: walks out upright with its arms full of
        //    groceries, the price tag still hanging off one ear ────────────
        _buildLvShopliftingraccoon() {
            const p = this.profile;
            const coat = this._lvCoat('flat'), mask = this._mat(0x18181c, 1.0, 0.8), pale = this._mat(p.accent, 1.0, 0.9), ring = this._lvCoat('bands', 0x7a7a82);
            const tin = this._mat(0xb8bcc4, 1.0, 0.3), label = this._mat(0xc83a2a, 1.0, 0.6), box = this._mat(0xe8c838, 1.0, 0.7), tag = this._mat(0xfaf8f0, 1.0, 0.8);
            this.body = new THREE.Group();
            this._lvBall(this.body, coat, 0, 0.05, 0, 0.2, 0.95, 1.25, 0.9);
            this._lvBall(this.body, pale, 0, 0.03, 0.1, 0.13, 0.85, 1.2, 0.6, 6);
            this.body.position.set(0, 0.52, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this._lvBall(this.head, coat, 0, 0.05, 0.04, 0.13, 1.1, 0.9, 1);
            this._lvCone(this.head, pale, 0, 0, 0.17, 0.05, 0.12, 5).rotation.x = Math.PI / 2;
            this._lvBall(this.head, mask, 0, 0, 0.235, 0.02, 1, 1, 1, 4);
            this._lvBall(this.head, mask, 0, 0.07, 0.1, 0.1, 1.35, 0.42, 0.75, 6);
            this._lvBall(this.head, pale, 0, 0.12, 0.09, 0.09, 1.1, 0.22, 0.6, 6);
            this._lvEye(this.head, -0.055, 0.075, 0.16, 0.022);
            this._lvEye(this.head, 0.055, 0.075, 0.16, 0.022);
            const tagged = this._lvEar(this.head, -1, 0.09, 0.14, 0, { w: 0.05, h: 0.08, mat: coat, inner: p.accent, tz: 0.35 });
            this._lvEar(this.head, 1, 0.09, 0.14, 0, { w: 0.05, h: 0.08, mat: coat, inner: p.accent, tz: 0.35 });
            // The price tag still hanging from its ear on a red thread.
            this._lvStrut(tagged, label, [0, 0.04, 0], [-0.03, -0.025, 0.02], 0.004, 0.004, 3);
            this._lvBox(tagged, tag, -0.035, -0.055, 0.02, 0.045, 0.06, 0.004);
            this._lvBox(tagged, label, -0.035, -0.045, 0.023, 0.035, 0.012, 0.004);
            this.head.position.set(0, 0.8, 0.04); this.bodyGroup.add(this.head);

            this.frontLeft  = this._lvArm(coat, -1, -0.16, 0.68, 0.06, { r: 0.035, elbowY: -0.12, elbowZ: 0.05, handX: -0.08, handY: -0.18, reach: 0.18, handMat: mask });
            this.frontRight = this._lvArm(coat, 1, 0.16, 0.68, 0.06, { r: 0.035, elbowY: -0.12, elbowZ: 0.05, handX: -0.08, handY: -0.18, reach: 0.18, handMat: mask });
            // The loot: a cereal box with a tin on top, hugged to the chest.
            const loot = this.frontRight.hand;
            this._lvBox(loot, box, -0.08, 0.03, 0.04, 0.15, 0.12, 0.06);
            this._lvCyl(loot, tin, -0.06, 0.125, 0.04, 0.035, 0.035, 0.07, 7);
            this._lvCyl(loot, label, -0.06, 0.125, 0.04, 0.037, 0.037, 0.03, 7);
            this.rearLeft   = this._lvLeg(coat, -0.09, 0.36, -0.02, { r: 0.045, footR: 0.045, knee: 0.05, foot: 'long', footMat: mask });
            this.rearRight  = this._lvLeg(coat, 0.09, 0.36, -0.02, { r: 0.045, footR: 0.045, knee: 0.05, foot: 'long', footMat: mask });
            this.tail = this._lvTail(ring, 0.42, -0.12, [[0, -0.12, -0.1], [0, -0.25, -0.22], [0, -0.3, -0.36]], [0.055, 0.06, 0.055, 0.045, 0.03]);
            this._lvMove = 'sit';
            this._wireLv({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Truffle Piglet: a mud-caked piglet with a snout disc too big for
        //    its face and a black truffle pinned under it ──────────────────
        _buildLvTrufflepiglet() {
            const p = this.profile;
            const coat = this._lvCoat('mottle'), mud = this._mat(p.accent, 1.0, 1.0), disc = this._mat(0xc87880, 1.0, 0.5), dark = this._mat(0x1a1010, 1.0, 0.5);
            const truffle = this._mat(0x2a1c14, 1.0, 0.9);
            this.body = new THREE.Group();
            this._lvBall(this.body, coat, 0, 0, 0, 0.22, 0.95, 0.9, 1.25);
            for (const [x, y, z, r] of [[0.19, -0.06, 0.05, 0.06], [-0.18, -0.08, -0.08, 0.07], [0.12, 0.1, -0.18, 0.05], [-0.06, 0.17, 0.1, 0.045]]) this._lvBall(this.body, mud, x, y, z, r, 0.5, 0.8, 1.2, 5);
            this.body.position.set(0, 0.36, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this._lvBall(this.head, coat, 0, 0, 0.06, 0.13, 1, 0.92, 1);
            this._lvCyl(this.head, coat, 0, -0.04, 0.2, 0.07, 0.07, 0.08, 7).rotation.x = Math.PI / 2;
            this._lvCyl(this.head, disc, 0, -0.04, 0.24, 0.072, 0.072, 0.01, 7).rotation.x = Math.PI / 2;
            for (const sd of [-1, 1]) this._lvBall(this.head, dark, sd * 0.025, -0.04, 0.246, 0.012, 1, 1, 0.5, 4);
            const t = new THREE.Mesh(new THREE.IcosahedronGeometry(0.045, 0), truffle); t.position.set(0, -0.11, 0.26); this.head.add(t);
            this._lvEye(this.head, -0.06, 0.05, 0.16, 0.018);
            this._lvEye(this.head, 0.06, 0.05, 0.16, 0.018);
            this._lvEar(this.head, -1, 0.08, 0.1, 0.03, { w: 0.055, h: 0.1, mat: coat, inner: 0xe8a8b0, tz: 0.3, tx: 0.9 });
            this._lvEar(this.head, 1, 0.08, 0.1, 0.03, { w: 0.055, h: 0.1, mat: coat, inner: 0xe8a8b0, tz: 0.3, tx: 0.9 });
            this.head.position.set(0, 0.44, 0.26); this.bodyGroup.add(this.head);

            // Legs caked in mud to the hip.
            this.frontLeft  = this._lvLeg(mud, -0.1, 0.24, 0.15, { r: 0.035, foot: 'hoof', footR: 0.03, hoofColor: 0x2a1a14 });
            this.frontRight = this._lvLeg(mud, 0.1, 0.24, 0.15, { r: 0.035, foot: 'hoof', footR: 0.03, hoofColor: 0x2a1a14 });
            this.rearLeft   = this._lvLeg(mud, -0.1, 0.24, -0.15, { r: 0.035, foot: 'hoof', footR: 0.03, hoofColor: 0x2a1a14 });
            this.rearRight  = this._lvLeg(mud, 0.1, 0.24, -0.15, { r: 0.035, foot: 'hoof', footR: 0.03, hoofColor: 0x2a1a14 });
            this.tail = new THREE.Group();
            this._lvBall(this.tail, coat, 0, 0, 0, 0.02, 1, 1, 1, 5);
            const curl = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.012, 4, 10, Math.PI * 1.6), coat); curl.rotation.y = Math.PI / 2; curl.position.set(0, 0.02, -0.025); this.tail.add(curl);
            this.tail.position.set(0, 0.4, -0.27); this.bodyGroup.add(this.tail);
            this._lvMove = 'scurry';
            this._wireLv({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Fungal Shrew: a long-nosed shrew furred in mould, toadstools
        //    growing out of its back ───────────────────────────────────────
        _buildLvFungalshrew() {
            const p = this.profile;
            const coat = this._lvCoat('mottle'), mould = this._mat(0x7a9a4a, 1.0, 0.9), cap = this._lvCoat('spots', p.accent, 0.7), stalk = this._mat(0xe8e0c8, 1.0, 0.8);
            const pink = this._mat(0xd89a9a, 1.0, 0.6), dot = this._mat(0xfaf6ea, 1.0, 0.8);
            this.body = new THREE.Group();
            this._lvBall(this.body, coat, 0, 0, 0, 0.14, 0.9, 0.85, 1.5);
            for (const [x, y, z, r] of [[0.1, 0.03, 0.06, 0.04], [-0.09, 0.05, -0.1, 0.035], [0.04, -0.06, -0.16, 0.03]]) this._lvBall(this.body, mould, x, y, z, r, 0.5, 1, 1.3, 5);
            // Toadstools, rooted in the back where its spine should be.
            [[0.02, 0, 0.1, 0.07], [-0.05, -0.12, 0.07, 0.05], [0.05, 0.11, 0.05, 0.04]].forEach(([x, z, h, r], i) => {
                const y0 = 0.119 * Math.sqrt(Math.max(0, 1 - Math.pow(x / 0.126, 2) - Math.pow(z / 0.21, 2))) - 0.01;
                this._lvCyl(this.body, stalk, x, y0 + h * 0.5, z, r * 0.25, r * 0.32, h, 5);
                const c = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2), cap); c.scale.y = 0.75; c.position.set(x, y0 + h, z); this.body.add(c);
                if (!i) for (let k = 0; k < 3; k++) { const a = k * 2.1; this._lvBall(this.body, dot, x + Math.cos(a) * r * 0.55, y0 + h + r * 0.55, z + Math.sin(a) * r * 0.55, r * 0.14, 1, 0.6, 1, 4); }
            });
            this.body.position.set(0, 0.22, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this._lvBall(this.head, coat, 0, 0, 0.04, 0.08, 0.9, 0.85, 1.1);
            this._lvCone(this.head, coat, 0, -0.01, 0.16, 0.035, 0.16, 5).rotation.x = Math.PI / 2;
            this._lvBall(this.head, pink, 0, -0.01, 0.24, 0.013, 1, 1, 1, 4);
            this._lvEye(this.head, -0.04, 0.03, 0.09, 0.015, { iris: 0x9ad040, glow: true });
            this._lvEye(this.head, 0.04, 0.03, 0.09, 0.015, { iris: 0x9ad040, glow: true });
            this._lvEar(this.head, -1, 0.055, 0.05, 0, { shape: 'round', w: 0.025, h: 0.03, mat: coat, tz: 0.5 });
            this._lvEar(this.head, 1, 0.055, 0.05, 0, { shape: 'round', w: 0.025, h: 0.03, mat: coat, tz: 0.5 });
            this._lvWhiskers(this.head, 0.02, -0.01, 0.19, 0.12);
            this.head.position.set(0, 0.32, 0.14); this.bodyGroup.add(this.head);

            this.frontLeft  = this._lvLeg(coat, -0.06, 0.16, 0.12, { r: 0.02, footR: 0.025, footMat: pink });
            this.frontRight = this._lvLeg(coat, 0.06, 0.16, 0.12, { r: 0.02, footR: 0.025, footMat: pink });
            this.rearLeft   = this._lvLeg(coat, -0.07, 0.16, -0.12, { r: 0.025, footR: 0.025, knee: -0.03, footMat: pink });
            this.rearRight  = this._lvLeg(coat, 0.07, 0.16, -0.12, { r: 0.025, footR: 0.025, knee: -0.03, footMat: pink });
            this.tail = this._lvTail(pink, 0.22, -0.2, [[0, -0.05, -0.12], [0, -0.1, -0.22]], [0.02, 0.016, 0.01]);
            this._lvMove = 'scurry';
            this._wireLv({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Alpine Marmot: a plump sentry sat up on its haunches, paws at its
        //    chest, mouth rounded into a whistle over orange teeth ─────────
        _buildLvAlpinemarmot() {
            const p = this.profile;
            const coat = this._lvCoat('saddle'), cream = this._mat(0xd8c0a0, 1.0, 0.9), dark = this._mat(0x2a1c14, 1.0, 0.6);
            const tooth = this._mat(p.accent, 1.0, 0.35), mouth = this._mat(0x3a1a14, 1.0, 0.6);
            this.body = new THREE.Group();
            this._lvBall(this.body, coat, 0, 0.04, 0, 0.25, 1, 1.15, 0.92, 8);
            this._lvBall(this.body, cream, 0, 0, 0.15, 0.17, 0.85, 1.1, 0.55, 6);
            this.body.position.set(0, 0.36, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this._lvBall(this.head, coat, 0, 0.05, 0.04, 0.13, 1.1, 0.95, 1);
            this._lvBall(this.head, cream, 0, 0, 0.14, 0.065, 1.2, 0.9, 1, 6);
            this._lvBall(this.head, dark, 0, 0.04, 0.2, 0.02, 1, 1, 1, 4);
            for (const ix of [-0.01, 0.01]) this._lvBox(this.head, tooth, ix, -0.008, 0.195, 0.014, 0.03, 0.01);
            // The whistle: lips pursed into a ring.
            this._lvCyl(this.head, mouth, 0, -0.035, 0.192, 0.026, 0.026, 0.012, 8).rotation.x = Math.PI / 2;
            const lips = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.01, 4, 10), cream); lips.position.set(0, -0.035, 0.2); this.head.add(lips);
            this._lvEye(this.head, -0.06, 0.08, 0.13, 0.02);
            this._lvEye(this.head, 0.06, 0.08, 0.13, 0.02);
            this._lvEar(this.head, -1, 0.1, 0.1, 0, { shape: 'round', w: 0.03, h: 0.035, mat: coat, tz: 0.5 });
            this._lvEar(this.head, 1, 0.1, 0.1, 0, { shape: 'round', w: 0.03, h: 0.035, mat: coat, tz: 0.5 });
            this.head.position.set(0, 0.66, 0.04); this.bodyGroup.add(this.head);

            this.frontLeft  = this._lvArm(coat, -1, -0.12, 0.54, 0.08, { r: 0.035, elbowY: -0.08, handX: -0.06, handY: -0.1, reach: 0.14, handMat: dark });
            this.frontRight = this._lvArm(coat, 1, 0.12, 0.54, 0.08, { r: 0.035, elbowY: -0.08, handX: -0.06, handY: -0.1, reach: 0.14, handMat: dark });
            this.rearLeft   = this._lvLeg(coat, -0.13, 0.18, 0, { r: 0.05, footR: 0.045, knee: 0.05, foot: 'long', footMat: dark });
            this.rearRight  = this._lvLeg(coat, 0.13, 0.18, 0, { r: 0.05, footR: 0.045, knee: 0.05, foot: 'long', footMat: dark });
            this.tail = this._lvTail(coat, 0.2, -0.16, [[0, -0.08, -0.1], [0, -0.1, -0.2]], [0.05, 0.055, 0.045]);
            this._lvBall(this.tail, dark, 0, -0.1, -0.23, 0.045, 1, 1, 1, 5);
            this._lvMove = 'sit';
            this._wireLv({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Harbour Whelk: a sea snail under a tall ridged whelk shell crusted
        //    with barnacles, a frayed mooring rope still knotted round it ───
        _buildLvHarbourwhelk() {
            const p = this.profile;
            const shellM = this._lvCoat('bands', null, 0.6), ridge = this._mat(0x8a6a48, 1.0, 0.7), flesh = this._mat(p.accent, 1.0, 0.3);
            const barn = this._mat(0xd8d8d0, 1.0, 0.8), barnTip = this._mat(0x3a3a40, 1.0, 0.6), rope = this._mat(0xa08050, 1.0, 0.9);
            this.body = new THREE.Group();
            this._lvBall(this.body, flesh, 0, 0, 0, 0.3, 0.85, 0.35, 1.5, 8);
            this.body.position.set(0, 0.1, 0); this.bodyGroup.add(this.body);

            // The shell: a body whorl and a tapering spire, ridged at each turn.
            this.shell = new THREE.Group();
            this._lvBall(this.shell, shellM, 0, 0, 0, 0.22, 1, 0.85, 1.1, 8);
            [[0.17, -0.03, 0.16], [0.29, -0.06, 0.12], [0.38, -0.08, 0.09], [0.45, -0.1, 0.065], [0.5, -0.11, 0.045], [0.54, -0.12, 0.03]].forEach(([y, z, r]) => {
                this._lvBall(this.shell, shellM, 0, y, z, r, 1, 0.8, 1, 7);
                const rg = new THREE.Mesh(new THREE.TorusGeometry(r * 0.98, 0.012, 3, 10), ridge); rg.rotation.x = Math.PI / 2; rg.position.set(0, y - r * 0.35, z); this.shell.add(rg);
            });
            this._lvSpike(this.shell, shellM, [0, -0.05, 0.2], [0, -0.3, 1], 0.05, 0.16, 6);
            // Barnacles, little volcanoes with dark mouths.
            for (const [th, ph] of [[0.7, 0.6], [1.1, 2.2], [0.9, 3.6], [1.3, 4.6], [0.5, 5.4]]) {
                const n = [Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph)];
                const q = [n[0] * 0.22, n[1] * 0.187, n[2] * 0.242];
                this._lvSpike(this.shell, barn, q, n, 0.03, 0.035, 5);
                this._lvBall(this.shell, barnTip, q[0] + n[0] * 0.03, q[1] + n[1] * 0.03, q[2] + n[2] * 0.03, 0.01, 1, 1, 1, 4);
            }
            // The mooring rope it glued itself to, frayed off at the end.
            const loop = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 4, 14), rope); loop.rotation.x = Math.PI / 2 + 0.3; loop.scale.set(1.12, 1.25, 1); this.shell.add(loop);
            this._lvStrut(this.shell, rope, [0.224, 0, 0.02], [0.3, -0.14, 0.1], 0.012, 0.011, 4);
            for (const d of [[0.5, -1, 0.3], [1, -0.6, 0.6], [0.2, -1, 0.8]]) this._lvSpike(this.shell, rope, [0.3, -0.14, 0.1], d, 0.006, 0.04, 3);
            this.shell.position.set(0, 0.28, -0.06); this.bodyGroup.add(this.shell);

            this.head = new THREE.Group();
            this._lvBall(this.head, flesh, 0, 0.02, 0.04, 0.07, 1.2, 0.8, 1, 6);
            // The siphon, raised like a snorkel.
            this._lvStrut(this.head, flesh, [0, 0.03, 0.02], [0, 0.2, 0.12], 0.025, 0.02, 6);
            const lip = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.007, 3, 8), flesh); lip.rotation.x = -0.5; lip.position.set(0, 0.205, 0.123); this.head.add(lip);
            this._stalks = [];
            for (const sd of [-1, 1]) {
                const st = new THREE.Group();
                this._lvStrut(st, flesh, [0, 0, 0], [sd * 0.06, 0.08, 0.06], 0.015, 0.008, 4);
                this._lvEye(st, sd * 0.012, 0, 0.015, 0.012);
                st.position.set(sd * 0.05, 0.05, 0.07); this.head.add(st); this._stalks.push(st);
            }
            this.head.position.set(0, 0.14, 0.4); this.bodyGroup.add(this.head);
            this._lvMove = 'creep';
            this._wireSnail({ body: this.body, shell: this.shell, head: this.head, stalks: this._stalks });
        }

        // ── Jungle Tamarin: a crouched little monkey with a white moustache
        //    hanging to its knees and a stolen coin under one hand ─────────
        _buildLvJungletamarin() {
            const p = this.profile;
            const coat = this._lvCoat('flat'), face = this._mat(0x6a5a5a, 1.0, 0.7), white = this._mat(0xf4f4f0, 1.0, 0.9), rust = this._mat(p.accent, 1.0, 0.8);
            const gold = this._mat(0xe8c040, 1.0, 0.2, 0x5a4010);
            this.body = new THREE.Group();
            this._lvBall(this.body, coat, 0, 0, 0, 0.14, 0.9, 1, 1.2).rotation.x = 0.35;
            this.body.position.set(0, 0.34, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this._lvBall(this.head, coat, 0, 0.04, 0.05, 0.1);
            this._lvBall(this.head, face, 0, 0.03, 0.12, 0.07, 1, 1.1, 0.5, 6);
            this._lvBall(this.head, this._mat(0x1a1414, 1.0, 0.5), 0, 0.03, 0.155, 0.012, 1, 1, 1, 4);
            this._lvEye(this.head, -0.035, 0.06, 0.14, 0.022);
            this._lvEye(this.head, 0.035, 0.06, 0.14, 0.022);
            // The moustache: two long white strands curling down from the lip.
            for (const sd of [-1, 1]) {
                const m = new THREE.Group();
                this._lvChain(m, white, [[sd * 0.04, -0.025, 0.01], [sd * 0.08, -0.08, 0], [sd * 0.09, -0.15, -0.02]], [0.013, 0.012, 0.009, 0.006]);
                m.position.set(sd * 0.015, 0.005, 0.15); this.head.add(m);
            }
            this._lvBall(this.head, white, 0, -0.04, 0.12, 0.02, 1, 1, 1, 5);
            this._lvEar(this.head, -1, 0.09, 0.06, 0, { shape: 'round', w: 0.025, h: 0.035, mat: coat, tz: 0.5 });
            this._lvEar(this.head, 1, 0.09, 0.06, 0, { shape: 'round', w: 0.025, h: 0.035, mat: coat, tz: 0.5 });
            this.head.position.set(0, 0.44, 0.1); this.bodyGroup.add(this.head);

            this.frontLeft  = this._lvLeg(coat, -0.06, 0.38, 0.1, { r: 0.025, footR: 0.03, knee: 0.03, footMat: face });
            this.frontRight = this._lvLeg(coat, 0.06, 0.38, 0.1, { r: 0.025, footR: 0.03, knee: 0.03, footMat: face });
            const coin = this._lvCyl(this.frontRight, gold, -0.04, -0.376, 0.06, 0.035, 0.035, 0.008, 8); coin.rotation.z = 0.05;
            this.rearLeft   = this._lvLeg(coat, -0.08, 0.3, -0.08, { r: 0.035, footR: 0.035, knee: 0.1, foot: 'long', footMat: face });
            this.rearRight  = this._lvLeg(coat, 0.08, 0.3, -0.08, { r: 0.035, footR: 0.035, knee: 0.1, foot: 'long', footMat: face });
            this.tail = this._lvTail(rust, 0.36, -0.14, [[0, -0.04, -0.15], [0, -0.16, -0.3], [0, -0.3, -0.36], [0, -0.34, -0.28]], [0.03, 0.03, 0.028, 0.024, 0.018]);
            this._lvMove = 'scurry';
            this._wireLv({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Unicorn Foal: knock-kneed on long new legs, a short brush mane
        //    and a horn that is still only a glowing nub ───────────────────
        _buildLvUnicornfoal() {
            const p = this.profile;
            const coat = this._lvCoat('flat'), mane = this._mat(0xd8a8e8, 1.0, 0.6), hornM = this._mat(p.accent, 1.0, 0.3, p.accent), muzzle = this._mat(0xd8c8c8, 1.0, 0.7);
            this.body = new THREE.Group();
            this._lvBall(this.body, coat, 0, 0, 0, 0.2, 0.85, 0.85, 1.35);
            this.body.position.set(0, 0.82, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this._lvStrut(this.head, coat, [0, 0, 0], [0, 0.18, 0.1], 0.06, 0.05);
            this._lvBall(this.head, coat, 0, 0.24, 0.16, 0.09, 0.85, 0.95, 1.4);
            this._lvBall(this.head, muzzle, 0, 0.2, 0.27, 0.055, 0.9, 0.8, 1, 6);
            for (const sd of [-1, 1]) {
                this._lvEye(this.head, sd * 0.055, 0.27, 0.2, 0.03, { iris: 0x2a1e3a, pupil: true });
                for (let i = 0; i < 2; i++) this._lvSpike(this.head, this._mat(0x2a1e3a, 1.0, 0.6), [sd * (0.06 + i * 0.01), 0.295, 0.2 - i * 0.012], [sd * 0.5, 0.7, 0.4], 0.004, 0.035, 3);
            }
            this._lvEar(this.head, -1, 0.04, 0.31, 0.12, { w: 0.025, h: 0.07, mat: coat, inner: 0xf0c0c8, tz: 0.25 });
            this._lvEar(this.head, 1, 0.04, 0.31, 0.12, { w: 0.025, h: 0.07, mat: coat, inner: 0xf0c0c8, tz: 0.25 });
            // A brush mane standing up the back of the neck.
            for (let i = 0; i < 6; i++) { const t = i / 5 * 1.3; this._lvSpike(this.head, mane, [0, t * 0.18 + 0.024, t * 0.1 - 0.044], [0, 0.486, -0.874], 0.025, 0.07, 4); }
            this.horn = new THREE.Group();
            this._lvSpike(this.horn, hornM, [0, 0, 0], [0, 1, 0.5], 0.022, 0.055, 5);
            this.horn.position.set(0, 0.315, 0.22); this.head.add(this.horn);
            this.head.position.set(0, 0.9, 0.22); this.bodyGroup.add(this.head);

            // Long new legs, splayed and knock-kneed.
            const leg = (x, z, knee) => { const g = this._lvLeg(coat, x, 0.76, z, { r: 0.03, kneeR: 0.045, knee, foot: 'hoof', footR: 0.035, hoofColor: 0xc8a868 }); g.rotation.z = x < 0 ? -0.1 : 0.1; return g; };
            this.frontLeft = leg(-0.09, 0.17, 0.02); this.frontRight = leg(0.09, 0.17, 0.02);
            this.rearLeft = leg(-0.09, -0.18, -0.06); this.rearRight = leg(0.09, -0.18, -0.06);
            this.tail = this._lvTail(mane, 0.86, -0.25, [[0, -0.08, -0.06], [0, -0.18, -0.06]], [0.04, 0.05, 0.035]);
            this._lvMove = 'prowl';
            this._wireLv({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
            this._partMeshMap.HORN = this.horn;
            this._cascadeRules.push({ gone: ['HORN'], hide: [this.horn] });
        }

        // ── Bamboo Panda Cub: a round cub sat chewing a bamboo stalk held in
        //    both paws, teardrop patches round its eyes ────────────────────
        _buildLvBamboopandacub() {
            const p = this.profile;
            const coat = this._lvCoat('flat'), black = this._mat(p.accent, 1.0, 0.85), green = this._mat(0x5a9a3a, 1.0, 0.6), node = this._mat(0x3a6a28, 1.0, 0.6), leaf = this._mat(0x6ab84a, 1.0, 0.7);
            this.body = new THREE.Group();
            this._lvBall(this.body, coat, 0, 0, 0, 0.27, 1, 1.05, 0.95, 8);
            const band = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.08, 5, 10), black); band.rotation.x = Math.PI / 2; band.position.set(0, 0.14, 0); band.scale.set(1.1, 0.95, 1); this.body.add(band);
            this.body.position.set(0, 0.36, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this._lvBall(this.head, coat, 0, 0.06, 0.03, 0.17, 1.1, 0.95, 1);
            this._lvBall(this.head, coat, 0, 0, 0.17, 0.07, 1.2, 0.85, 1, 6);
            this._lvBall(this.head, black, 0, 0.03, 0.235, 0.025, 1.4, 1, 1, 4);
            for (const sd of [-1, 1]) {
                this._lvBall(this.head, black, sd * 0.065, 0.06, 0.19, 0.045, 1, 1.5, 0.4, 6).rotation.z = sd * 0.5;
                this._lvEye(this.head, sd * 0.06, 0.065, 0.2, 0.018);
            }
            this._lvEar(this.head, -1, 0.12, 0.17, 0, { shape: 'round', w: 0.06, h: 0.09, mat: black, tz: 0.4 });
            this._lvEar(this.head, 1, 0.12, 0.17, 0, { shape: 'round', w: 0.06, h: 0.09, mat: black, tz: 0.4 });
            this.head.position.set(0, 0.64, 0.04); this.bodyGroup.add(this.head);

            this.frontLeft  = this._lvArm(black, -1, -0.2, 0.52, 0.06, { r: 0.06, elbowX: 0.03, elbowY: -0.1, elbowZ: 0.06, handX: -0.08, handY: -0.16, reach: 0.18, handR: 0.07 });
            this.frontRight = this._lvArm(black, 1, 0.2, 0.52, 0.06, { r: 0.06, elbowX: 0.03, elbowY: -0.1, elbowZ: 0.06, handX: -0.08, handY: -0.16, reach: 0.18, handR: 0.07 });
            // The bamboo stalk, jointed, leaves sprouting at the top.
            const bam = this.frontRight.hand, a = [0, 0, 0.02], b = [-0.24, 0.45, 0.04];
            this._lvStrut(bam, green, a, b, 0.022, 0.02, 6);
            for (const t of [0.3, 0.62, 0.9]) this._lvBall(bam, node, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, 0.026, 1, 0.5, 1, 6);
            for (const d of [[-1, 0.6, 0.2], [-0.6, 1, -0.3], [0.2, 0.8, 0.4]]) this._lvSpike(bam, leaf, b, d, 0.03, 0.12, 4).scale.x = 0.35;
            this.rearLeft   = this._lvLeg(black, -0.14, 0.16, 0.08, { r: 0.07, footR: 0.08, knee: 0.06 });
            this.rearRight  = this._lvLeg(black, 0.14, 0.16, 0.08, { r: 0.07, footR: 0.08, knee: 0.06 });
            this.tail = this._lvTail(coat, 0.24, -0.22, [[0, -0.01, -0.05]], [0.045, 0.035]);
            this._lvMove = 'sit';
            this._wireLv({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Taiga Squirrel: a grey squirrel on all fours, long tassels on its
        //    ears, a tail curled over its back and a pine cone in its teeth ─
        _buildLvTaigasquirrel() {
            const p = this.profile;
            const coat = this._lvCoat('saddle'), cream = this._mat(0xf0ece4, 1.0, 0.9), dark = this._mat(0x2a2420, 1.0, 0.6), cone = this._mat(p.accent, 1.0, 0.85);
            this.body = new THREE.Group();
            this._lvBall(this.body, coat, 0, 0, 0, 0.14, 0.9, 0.95, 1.35);
            this._lvBall(this.body, coat, 0, 0.02, -0.14, 0.13);
            this.body.position.set(0, 0.3, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this._lvBall(this.head, coat, 0, 0.04, 0.06, 0.1);
            this._lvBall(this.head, cream, 0, 0.01, 0.15, 0.045, 1, 1, 1, 6);
            this._lvBall(this.head, dark, 0, 0.03, 0.19, 0.015, 1, 1, 1, 4);
            for (const sd of [-1, 1]) {
                this._lvBall(this.head, cream, sd * 0.055, 0.07, 0.115, 0.034, 1, 1, 0.5, 6);
                this._lvEye(this.head, sd * 0.055, 0.07, 0.13, 0.026);
                this._lvEar(this.head, sd, 0.06, 0.12, 0.03, { w: 0.035, h: 0.08, mat: coat, inner: 0xf0ece4, tz: 0.15, tuft: 0.1, tuftColor: 0x2a2420 });
            }
            // A pine cone carried crosswise, scale on scale.
            for (let i = 0; i < 4; i++) this._lvCone(this.head, cone, -0.04 + i * 0.027, -0.04, 0.17, 0.036 - i * 0.005, 0.035, 5).rotation.z = Math.PI / 2;
            this.head.position.set(0, 0.34, 0.17); this.bodyGroup.add(this.head);

            this.frontLeft  = this._lvLeg(coat, -0.06, 0.24, 0.12, { r: 0.025, footR: 0.03, claw: 0x2a2420 });
            this.frontRight = this._lvLeg(coat, 0.06, 0.24, 0.12, { r: 0.025, footR: 0.03, claw: 0x2a2420 });
            this.rearLeft   = this._lvLeg(coat, -0.09, 0.26, -0.15, { r: 0.04, footR: 0.035, knee: -0.06, foot: 'long' });
            this.rearRight  = this._lvLeg(coat, 0.09, 0.26, -0.15, { r: 0.04, footR: 0.035, knee: -0.06, foot: 'long' });
            this.tail = this._lvTail(coat, 0.34, -0.25, [[0, 0.14, -0.08], [0, 0.3, -0.06], [0, 0.42, 0.04], [0, 0.44, 0.16], [0, 0.38, 0.24]], [0.07, 0.08, 0.085, 0.08, 0.07, 0.06], 0.6);
            this._lvMove = 'scurry';
            this._wireLv({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        // ── Savannah Meerkat: bolt upright on top of a termite mound, arms
        //    hanging, dark rings round its staring eyes ────────────────────
        _buildLvSavannahmeerkat() {
            const p = this.profile;
            const coat = this._lvCoat('stripe'), cream = this._mat(0xe8d8b8, 1.0, 0.9), dark = this._mat(0x1a1410, 1.0, 0.6), earth = this._mat(p.accent, 1.0, 1.0);
            // The termite mound it keeps watch from, turrets and all.
            this._mound = new THREE.Group();
            this._lvCyl(this._mound, earth, 0, 0.16, 0, 0.08, 0.26, 0.32, 7);
            for (const [x, z, h] of [[0.19, 0.08, 0.2], [-0.17, -0.12, 0.26], [0.06, -0.2, 0.16]]) this._lvCone(this._mound, earth, x, h * 0.5, z, 0.06, h, 5);
            this.bodyGroup.add(this._mound);
            this.body = new THREE.Group();
            this._lvBall(this.body, coat, 0, 0, 0, 0.1, 0.9, 2.2, 0.85);
            this._lvBall(this.body, cream, 0, -0.02, 0.05, 0.08, 0.8, 2, 0.5, 6);
            this.body.position.set(0, 0.62, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this._lvBall(this.head, coat, 0, 0.04, 0.03, 0.07, 0.95, 0.9, 1.2);
            this._lvCone(this.head, coat, 0, 0.03, 0.12, 0.03, 0.09, 5).rotation.x = Math.PI / 2;
            this._lvBall(this.head, dark, 0, 0.03, 0.165, 0.012, 1, 1, 1, 4);
            for (const sd of [-1, 1]) {
                this._lvBall(this.head, dark, sd * 0.035, 0.06, 0.09, 0.028, 1, 1, 0.5, 6);
                this._lvEye(this.head, sd * 0.036, 0.06, 0.1, 0.016);
            }
            this._lvEar(this.head, -1, 0.065, 0.05, 0, { shape: 'round', w: 0.02, h: 0.025, mat: dark, tz: 0.6 });
            this._lvEar(this.head, 1, 0.065, 0.05, 0, { shape: 'round', w: 0.02, h: 0.025, mat: dark, tz: 0.6 });
            this.head.position.set(0, 0.84, 0.02); this.bodyGroup.add(this.head);

            this.frontLeft  = this._lvArm(coat, -1, -0.05, 0.74, 0.03, { r: 0.02, elbowX: 0.01, elbowY: -0.08, elbowZ: 0.03, handY: -0.14, reach: 0.05, handR: 0.022, handMat: dark });
            this.frontRight = this._lvArm(coat, 1, 0.05, 0.74, 0.03, { r: 0.02, elbowX: 0.01, elbowY: -0.08, elbowZ: 0.03, handY: -0.14, reach: 0.05, handR: 0.022, handMat: dark });
            this.rearLeft   = this._lvLeg(coat, -0.05, 0.46, 0, { len: 0.14, r: 0.03, footR: 0.03, knee: 0.03, foot: 'long', footMat: dark });
            this.rearRight  = this._lvLeg(coat, 0.05, 0.46, 0, { len: 0.14, r: 0.03, footR: 0.03, knee: 0.03, foot: 'long', footMat: dark });
            this.tail = this._lvTail(coat, 0.48, -0.05, [[0, -0.07, -0.05], [0, -0.14, -0.06]], [0.025, 0.02, 0.015]);
            this._lvMove = 'sit';
            this._wireLv({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
            this._cascadeRules[0].hide.push(this._mound);
        }

        // ── Steppe Vole: a near-round ball of a vole with a mouthful of grass
        //    stalks, seed heads and all ────────────────────────────────────
        _buildLvSteppevole() {
            const p = this.profile;
            const coat = this._lvCoat('saddle'), pink = this._mat(0xc89890, 1.0, 0.6), grass = this._mat(p.accent, 1.0, 0.7), seed = this._mat(0xd8c070, 1.0, 0.8);
            this.body = new THREE.Group();
            this._lvBall(this.body, coat, 0, 0, 0, 0.2, 1, 0.92, 1.1);
            this.body.position.set(0, 0.2, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            this._lvBall(this.head, coat, 0, 0, 0.05, 0.1, 1, 0.9, 1);
            this._lvBall(this.head, coat, 0, -0.01, 0.13, 0.05, 1, 0.85, 1, 6);
            this._lvBall(this.head, pink, 0, 0, 0.18, 0.016, 1, 1, 1, 4);
            this._lvEye(this.head, -0.055, 0.04, 0.11, 0.018);
            this._lvEye(this.head, 0.055, 0.04, 0.11, 0.018);
            this._lvEar(this.head, -1, 0.07, 0.07, 0, { shape: 'round', w: 0.03, h: 0.035, mat: coat, tz: 0.4 });
            this._lvEar(this.head, 1, 0.07, 0.07, 0, { shape: 'round', w: 0.03, h: 0.035, mat: coat, tz: 0.4 });
            this._lvWhiskers(this.head, 0.03, -0.01, 0.15, 0.13);
            // A mouthful of steppe grass, seed heads nodding at the tips.
            for (let i = -2; i <= 2; i++) {
                const d = new THREE.Vector3(i * 0.5, 0.25 + Math.abs(i) * 0.05, 0.15).normalize(), o = [0, -0.04, 0.16];
                this._lvSpike(this.head, grass, o, [d.x, d.y, d.z], 0.008, 0.16, 3);
                if (i % 2) this._lvBall(this.head, seed, o[0] + d.x * 0.15, o[1] + d.y * 0.15, o[2] + d.z * 0.15, 0.014, 1, 1.6, 1, 4);
            }
            this.head.position.set(0, 0.24, 0.18); this.bodyGroup.add(this.head);

            this.frontLeft  = this._lvLeg(coat, -0.1, 0.08, 0.12, { r: 0.02, footR: 0.025, footMat: pink });
            this.frontRight = this._lvLeg(coat, 0.1, 0.08, 0.12, { r: 0.02, footR: 0.025, footMat: pink });
            this.rearLeft   = this._lvLeg(coat, -0.11, 0.09, -0.1, { r: 0.025, footR: 0.03, footMat: pink });
            this.rearRight  = this._lvLeg(coat, 0.11, 0.09, -0.1, { r: 0.025, footR: 0.03, footMat: pink });
            this.tail = this._lvTail(coat, 0.2, -0.21, [[0, -0.01, -0.05]], [0.025, 0.018]);
            this._lvMove = 'scurry';
            this._wireLv({ body: this.body, head: this.head, fl: this.frontLeft, fr: this.frontRight, rl: this.rearLeft, rr: this.rearRight, tail: this.tail });
        }

        animatePose(deltaTime) {
            if (this._baseY === null) this._baseY = this.model.position.y;
            if (this._baseX === null) this._baseX = this.model.position.x;
            const t = this.animTime, anim = this.currentAnimation;
            let growth = 1.0;
            if (anim === 'spawn') growth = Math.min(1.0, t / 0.7);
            this.applyModelScale(growth);
            const fast = (anim === 'attack' || anim === 'specialattack');

            if (this.variant === 'ape' || this.variant === 'bst_maleficentape' || this.variant === 'bst_organgrindermonkey' || this.variant === 'bst_treemonkey') { this._animApe(t, anim, fast); return; }

            // Quadruped gait: diagonal leg pairs swing in anti-phase, faster on
            // attack. Only strides while really travelling (overworld walk) or
            // lunging; a beast standing in battle breathes instead of walking.
            const stride = this.strideMul(fast);
            const gait = fast ? 9 : 2.4;
            const amp = (fast ? 0.5 : (anim === 'hit' ? 0.0 : 0.2)) * stride;
            const sw = (leg, ph) => { if (leg && leg.visible) leg.rotation.x = Math.sin(t * gait + ph) * amp; };
            sw(this.frontLeft, 0); sw(this.rearRight, 0);
            sw(this.frontRight, Math.PI); sw(this.rearLeft, Math.PI);

            const hitJolt = anim === 'hit' ? Math.sin(t * 26) * Math.exp(-t * 6) * 0.15 : 0;
            this.model.position.y = this._baseY + (stride
                ? Math.abs(Math.sin(t * gait)) * (fast ? 0.1 : 0.025) * this.scale
                : (0.5 + Math.sin(t * 1.3) * 0.5) * 0.01 * this.scale);
            this.model.rotation.z = hitJolt;
            if (this.tail && this.tail.visible) this.tail.rotation.z = Math.sin(t * 3) * 0.25;
            if (this.head && this.head.visible) this.head.rotation.x = Math.sin(t * 1.6) * 0.05;

            // Felines: ears swivel and flick, eyes blink. Small idle motions,
            // but they are most of what makes a cat read as a cat.
            if (this._catEars) {
                const flick = Math.max(0, Math.sin(t * 0.8) - 0.9) * 6;
                this._catEars.forEach((ear, i) => {
                    if (!ear.visible) return;
                    const s = i ? 1 : -1;
                    ear.rotation.z = -s * 0.16 - s * (Math.sin(t * 1.7 + i) * 0.06 + flick * 0.5);
                    ear.rotation.x = (fast ? -0.35 : 0.0) + Math.sin(t * 2.3 + i * 1.4) * 0.05;
                });
            }
            if (this._catEyes) {
                const ph = (t * 0.42) % 1;
                const blink = ph > 0.965 ? 0.12 : 1.0;
                this._catEyes.forEach(e => { if (e.visible) e.scale.y = blink; });
            }

            // Per-variant flavour (kept off model.rotation.x, which the base owns).
            const baseX = this._baseX !== null ? this._baseX : this.model.position.x;
            switch (this.variant) {
                case 'bear':
                    if (fast) this.model.position.y += Math.max(0, Math.sin(Math.min(t * 6, Math.PI))) * 0.18 * this.scale;
                    if (this.head && fast) this.head.rotation.x = -0.3 + Math.sin(t * 1.6) * 0.05;
                    break;
                case 'wolf':
                    if (this.head && this.head.visible) this.head.rotation.x = (fast ? 0.22 : 0.0) + Math.sin(t * 1.6) * 0.05;
                    break;
                case 'bigcat':
                    if (fast) { const c = Math.max(0, Math.sin(Math.min(t * 7, Math.PI))); this.model.position.y += c * 0.28 * this.scale; }
                    if (this.tail && this.tail.visible) this.tail.rotation.x = Math.sin(t * 4) * 0.2;
                    break;
                case 'boar':
                    if (this.head && this.head.visible) this.head.rotation.x = (fast ? 0.3 : 0.0) + Math.sin(t * 1.6) * 0.04;
                    break;
                case 'ungulate':
                    if (this.head && this.head.visible && fast) this.head.rotation.x = Math.sin(Math.min(t * 8, Math.PI)) * 0.5;
                    break;
                case 'fieldmouse':
                case 'forestrat':
                case 'giantrat':
                case 'sewerrat':
                case 'swamprat':
                case 'frostraccoon':
                case 'nightraccoon':
                case 'woodsquirrel':
                case 'armoredbeaver':
                case 'wastelandbeaver':
                case 'spikeyporcupine':
                case 'plaguerattus':
                case 'rodent': {
                    this.model.position.x = baseX + Math.sin(t * 9) * 0.03 * this.scale;
                    if (this.head && this.head.visible) this.head.rotation.z = Math.sin(t * 7) * 0.08;
                    break;
                }
                case 'caffeinatedsquirrel':
                    // Espresso jitters: violent twitch on every axis.
                    this.model.position.x = baseX + Math.sin(t * 28) * 0.05 * this.scale;
                    this.model.position.y = this._baseY + Math.abs(Math.sin(t * 22)) * 0.04 * this.scale;
                    if (this.head && this.head.visible) { this.head.rotation.z = Math.sin(t * 24) * 0.18; this.head.rotation.x = Math.sin(t * 19) * 0.12; }
                    if (this.tail && this.tail.visible) this.tail.rotation.x = -0.35 + Math.sin(t * 16) * 0.2;
                    break;
                case 'armoredporcupine':
                    // Curls and spins into a death ball on the attack.
                    if (fast) this.model.rotation.y += 0.5;
                    else if (this.head && this.head.visible) this.head.rotation.z = Math.sin(t * 6) * 0.07;
                    break;
                case 'ratking':
                    // Heads writhe out of sync; the swarm never stills.
                    if (this.head && this.head.visible) this.head.rotation.z = Math.sin(t * 7) * 0.08;
                    if (this._extraHeads) this._extraHeads.forEach((h, i) => { if (h.visible) { h.rotation.z = Math.sin(t * (3 + i) + i * 1.6) * 0.18; h.rotation.x = Math.sin(t * 2.4 + i) * 0.1; } });
                    this.model.position.x = baseX + Math.sin(t * 5) * 0.02 * this.scale;
                    break;
                case 'molerodent':
                case 'tunnelingmole':
                    // Snuffling head bob and digging-paw paddle.
                    if (this.head && this.head.visible) this.head.rotation.x = Math.sin(t * 5) * 0.12;
                    [this.frontLeft, this.frontRight].forEach((l, i) => { if (l && l.visible) l.rotation.x = Math.sin(t * (fast ? 14 : 6) + i * Math.PI) * 0.4; });
                    break;
                case 'icelemming':
                    // Trembles harder as it nears its explosive end.
                    this.model.position.x = baseX + Math.sin(t * 30) * (fast ? 0.06 : 0.03) * this.scale;
                    this.model.rotation.z = Math.sin(t * 26) * 0.05;
                    break;
                case 'chromaticmanticore':
                    if (this.head && this.head.visible) this.head.rotation.z = Math.sin(t * 2) * 0.06;
                    if (this.tail && this.tail.visible) this.tail.rotation.x = Math.sin(t * 3.5) * 0.3;
                    break;
                case 'giantsnail':
                    // Extremely slow, swaying eyestalks.
                    if (this.head && this.head.visible) { this.head.rotation.z = Math.sin(t * 0.8) * 0.12; this.head.rotation.x = Math.sin(t * 0.6) * 0.06; }
                    this.model.position.y = this._baseY + Math.sin(t * 0.7) * 0.01 * this.scale;
                    break;
                case 'infernalcerberus':
                    // Heads sway out of sync, flame flicker.
                    if (this.head && this.head.visible) this.head.children.forEach((h, i) => { h.rotation.x = Math.sin(t * 2 + i * 1.7) * 0.1; });
                    break;
                case 'junglepredator':
                    if (this.head && this.head.visible) this.head.rotation.x = Math.sin(t * 2.5) * 0.12;
                    break;
                case 'mianni':
                    // Defies physics: chaotic floaty wobble.
                    this.model.position.y = this._baseY + Math.sin(t * 3) * 0.08 * this.scale;
                    this.model.rotation.z = Math.sin(t * 1.7) * 0.08;
                    if (this.head && this.head.visible) this.head.rotation.y = Math.sin(t * 2.3) * 0.4;
                    [this.frontLeft, this.frontRight, this.rearLeft, this.rearRight].forEach((l, i) => { if (l && l.visible) l.position.y += Math.sin(t * 4 + i * 1.5) * 0.01 * this.scale; });
                    break;
                case 'palettephantom':
                    // Drifting spectral hover with hue-cycling glow.
                    this.model.position.y = this._baseY + Math.sin(t * 1.4) * 0.04 * this.scale;
                    this.body.children.forEach((c, i) => { if (c.material && c.material.emissive) c.material.emissive.setHSL((t * 0.2 + i * 0.13) % 1, 0.9, 0.5); });
                    if (this.tail && this.tail.visible) this.tail.rotation.x = Math.sin(t * 4) * 0.25;
                    break;
                case 'radiantunicorn':
                    if (this.head && this.head.visible) this.head.rotation.x = (fast ? -0.2 : 0.0) + Math.sin(t * 1.6) * 0.05;
                    break;
                case 'tempestpegasus':
                    // Spinning tail vortex + wing flap.
                    if (this.tail && this.tail.visible) this.tail.rotation.y = t * 6;
                    this.body.children.forEach((c) => { if (c.type === 'Group') c.rotation.z = Math.sin(t * (fast ? 10 : 3)) * 0.25; });
                    if (fast) this.model.position.y += Math.max(0, Math.sin(Math.min(t * 6, Math.PI))) * 0.22 * this.scale;
                    break;
                case 'rhinobeetle':
                    if (this.head && this.head.visible) this.head.rotation.x = (fast ? -0.35 : 0.0) + Math.sin(t * 2) * 0.04;
                    break;
                case 'rummagingopossum':
                    if (this.head && this.head.visible) this.head.rotation.z = Math.sin(t * 6) * 0.1;
                    break;
                case 'beast666':
                    if (this.head && this.head.visible) this.head.rotation.z = Math.sin(t * 1.8) * 0.06;
                    this.body.children.forEach((c) => { if (c.material && c.material.emissive && c.geometry && c.geometry.type === 'TorusGeometry') c.material.emissiveIntensity = 0.5 + Math.sin(t * 5) * 0.4; });
                    break;
                case 'velocicorn':
                    // Twitchy, fast head bob; horn lowers on charge.
                    if (this.head && this.head.visible) this.head.rotation.x = (fast ? -0.35 : 0.0) + Math.sin(t * 4) * 0.06;
                    break;
                case 'swampleviathan':
                    // Heavy ground-shaking lurch.
                    this.model.position.y = this._baseY + Math.abs(Math.sin(t * (fast ? 5 : 1.4))) * 0.05 * this.scale;
                    this.model.rotation.z = Math.sin(t * 1.4) * 0.03;
                    if (this.head && this.head.visible) this.head.rotation.x = Math.sin(t * 1.2) * 0.06;
                    break;
                case 'invertedhunger':
                    // Pulsing maw that breathes in and out.
                    { const pulse = 1.0 + Math.sin(t * 3) * 0.08; if (this.body) this.body.scale.set(pulse, pulse, 1.0); }
                    if (this.head && this.head.visible) this.head.position.z = 0.05 + Math.sin(t * 3) * 0.06;
                    break;
                case 'voidhowler':
                    // Writhing tendrils + howl head-raise; flickering void glow.
                    if (this.head && this.head.visible) this.head.rotation.x = (fast ? -0.4 : -0.15) + Math.sin(t * 1.6) * 0.06;
                    this.body.children.forEach((c, i) => { if (c.geometry && c.geometry.type === 'ConeGeometry') c.rotation.z += Math.sin(t * 2 + i) * 0.01; });
                    break;
                case 'feastoffamine':
                    // Regenerating dishes quiver; face glances around.
                    this.body.children.forEach((c, i) => { if (c.geometry && c.geometry.type === 'SphereGeometry') c.scale.y = 0.7 + Math.sin(t * 4 + i * 1.3) * 0.12; });
                    if (this.head && this.head.visible) this.head.rotation.y = Math.sin(t * 2) * 0.3;
                    break;
                case 'maternityward':
                    // Belly heaves; broodlings squirm.
                    if (this.body) { const h = 1.0 + Math.sin(t * 2.2) * 0.05; this.body.scale.set(1, h, 1); }
                    this.body.children.forEach((c, i) => { if (c.geometry && c.geometry.type === 'SphereGeometry' && c.position.z > 0.3) c.position.z = 0.42 + Math.sin(t * 5 + i * 2) * 0.04; });
                    if (this.head && this.head.visible) this.head.rotation.z = Math.sin(t * 1.5) * 0.08;
                    break;
                case 'starvingsabercat':
                case 'ferallynx':
                    if (fast) { const c = Math.max(0, Math.sin(Math.min(t * 7, Math.PI))); this.model.position.y += c * 0.26 * this.scale; }
                    if (this.head && this.head.visible) this.head.rotation.x = (fast ? 0.25 : 0.0) + Math.sin(t * 1.6) * 0.05;
                    break;
                case 'ashenprowler':
                    if (this.head && this.head.visible) this.head.rotation.x = (fast ? 0.22 : -0.05) + Math.sin(t * 1.6) * 0.05;
                    break;
                case 'gauntclawrunner':
                case 'feralridgeback':
                    if (this.head && this.head.visible) this.head.rotation.x = (fast ? 0.2 : -0.05) + Math.sin(t * 1.6) * 0.05;
                    break;
                case 'bloodmawdirewolf':
                    if (this.head && this.head.visible) this.head.rotation.x = (fast ? 0.24 : 0.0) + Math.sin(t * 1.6) * 0.05;
                    break;
                case 'gauntlynx':
                    if (fast) { const c = Math.max(0, Math.sin(Math.min(t * 7, Math.PI))); this.model.position.y += c * 0.24 * this.scale; }
                    if (this.head && this.head.visible) this.head.rotation.x = (fast ? 0.22 : 0.0) + Math.sin(t * 1.6) * 0.05;
                    break;
                case 'starvinggnasher':
                case 'gauntsnapper':
                case 'diregnasher':
                    // Jaw chomp: lower jaw box (the 2nd head child) gnashes open and shut.
                    if (this.head && this.head.visible) { const lower = this.head.children[2]; if (lower) lower.position.y = -0.15 - Math.abs(Math.sin(t * (fast ? 12 : 4))) * 0.1; this.head.rotation.x = (fast ? 0.18 : 0.0) + Math.sin(t * 1.6) * 0.05; }
                    break;
                case 'holloweyedboar':
                    if (this.head && this.head.visible) this.head.rotation.x = (fast ? 0.3 : 0.0) + Math.sin(t * 1.6) * 0.04;
                    break;
                // ── Bespoke canids: canine head-lower lunge ─────────────────
                case 'bst_arcticfox':
                case 'bst_cottonfox':
                case 'bst_icewolfpup':
                case 'bst_graywolf':
                case 'bst_manedterrorwolf':
                case 'bst_redfox':
                case 'bst_alphadirewolf':
                case 'bst_alphawarg':
                case 'bst_arcticwolf':
                case 'bst_rabidcoyote':
                case 'bst_scavengingcoyote':
                    if (this.head && this.head.visible) this.head.rotation.x = (fast ? 0.24 : 0.0) + Math.sin(t * 1.6) * 0.05;
                    break;
                case 'bst_rabidhyena':
                case 'bst_feralhyenapack':
                    // Hunched cackling bob, quicker head jitter.
                    if (this.head && this.head.visible) this.head.rotation.x = (fast ? 0.2 : 0.0) + Math.sin(t * 3.2) * 0.06;
                    this.model.position.y = this._baseY + (stride
                        ? Math.abs(Math.sin(t * gait)) * (fast ? 0.1 : 0.025) * this.scale
                        : (0.5 + Math.sin(t * 1.3) * 0.5) * 0.01 * this.scale);
                    break;
                // ── Bespoke felines: pounce crouch + tail lash ──────────────
                case 'bst_lazycat':
                    // Barely moves; a lazy tail flick.
                    if (this.tail && this.tail.visible) this.tail.rotation.x = Math.sin(t * 1.2) * 0.3;
                    break;
                case 'bst_feralalleycat':
                    // Skittish: quick head snaps, a fast flicking tail, and a
                    // low crouch before it springs.
                    if (fast) { const c = Math.max(0, Math.sin(Math.min(t * 8, Math.PI))); this.model.position.y += c * 0.22 * this.scale; }
                    if (this.head && this.head.visible) { this.head.rotation.y = Math.sin(t * 2.6) * 0.35; this.head.rotation.x = (fast ? 0.2 : -0.08); }
                    if (this.tail && this.tail.visible) this.tail.rotation.x = Math.sin(t * 6) * 0.3;
                    break;
                case 'bst_blackpanther':
                case 'bst_reflectivetiger':
                case 'bst_sabercat':
                case 'bst_wildcat':
                case 'bst_goldenlion':
                case 'bst_stripedtiger':
                case 'bst_umbrapanthera':
                case 'bst_mysticpanther':
                case 'bst_sabertoothalpha':
                case 'bst_diresabertoothalpha':
                    if (fast) { const c = Math.max(0, Math.sin(Math.min(t * 7, Math.PI))); this.model.position.y += c * 0.26 * this.scale; }
                    if (this.tail && this.tail.visible) this.tail.rotation.x = Math.sin(t * 4) * 0.2;
                    break;
                // ── Bespoke ungulates: nervous graze / charge head-toss ─────
                case 'bst_thirstycamel':
                case 'bst_foreststag':
                case 'bst_pastoralsheep':
                case 'bst_armoredrhinoceros':
                case 'bst_bloodbellcow':
                case 'bst_deersprite':
                case 'bst_hollowgoat':
                case 'bst_ironhoofcharger':
                case 'bst_rancorousbull':
                case 'bst_titanotherealpha':
                    if (this.head && this.head.visible && fast) this.head.rotation.x = Math.sin(Math.min(t * 8, Math.PI)) * 0.5;
                    break;
                // ── Bespoke ursids: rear-up slam on attack ──────────────────
                case 'bst_brownbear':
                case 'bst_hornedbear':
                case 'bst_youngyeti':
                case 'bst_frostbackursid':
                case 'bst_panda':
                case 'bst_polarbear':
                case 'bst_timewornowlbear':
                case 'bst_demonbear':
                case 'bst_kodiakbear':
                case 'bst_emberclawbear':
                case 'bst_frostfangbear':
                case 'bst_thundermawursine':
                case 'bst_titaniccavebear':
                    if (fast) this.model.position.y += Math.max(0, Math.sin(Math.min(t * 6, Math.PI))) * 0.18 * this.scale;
                    if (this.head && fast) this.head.rotation.x = -0.3 + Math.sin(t * 1.6) * 0.05;
                    break;
                // ── Bespoke suids: head-down gore, flap for flyers ──────────
                case 'bst_flyingpig':
                case 'bst_flyingpig2':
                    if (this._wings) this._wings.forEach((w, i) => { w.rotation.z = (i ? 1 : -1) * (0.3 + Math.sin(t * (fast ? 12 : 6)) * 0.4); });
                    this.model.position.y = this._baseY + Math.sin(t * 2.5) * 0.06 * this.scale;
                    break;
                case 'bst_direpig':
                case 'bst_razorbackboar':
                case 'bst_wildboar':
                case 'bst_normalpig':
                case 'bst_madboar':
                    if (this.head && this.head.visible) this.head.rotation.x = (fast ? 0.3 : 0.0) + Math.sin(t * 1.6) * 0.04;
                    break;
                default:
                    if (this._lvMove) this._animLv(t, fast, baseX);
                    break;
            }
        }

        // Starter critter motion. Each picks a way of moving (_lvMove) and the
        // builder hands over whatever else twitches: ears, a jaw, cheek pouches,
        // a vibrating saw, blinking lights. Everything turns about its own
        // joint or rest pose, so nothing leaves the body.
        _animLv(t, fast, baseX) {
            const sc = this.scale;
            const head = this.head && this.head.visible ? this.head : null;
            const lunge = fast ? Math.max(0, Math.sin(Math.min(t * 7, Math.PI))) : 0;
            switch (this._lvMove) {
                case 'scurry':   // never still: a twitching sniff
                    this.model.position.x = baseX + Math.sin(t * 9) * 0.02 * sc;
                    if (head) { head.rotation.z = Math.sin(t * 7) * 0.08; head.rotation.y = Math.sin(t * 2.3) * 0.25; }
                    this.model.position.y += lunge * 0.1 * sc;
                    break;
                case 'hop':      // springs off its feet, high on the attack
                    this.model.position.y += Math.abs(Math.sin(t * (fast ? 7 : 3))) * (fast ? 0.2 : 0.035) * sc;
                    if (head) head.rotation.y = Math.sin(t * 1.9) * 0.2;
                    break;
                case 'sit':      // sat up: looks about, rises into a swipe
                    if (head) head.rotation.y = Math.sin(t * 0.9) * 0.3;
                    this.model.position.y += lunge * 0.12 * sc;
                    break;
                case 'float':    // drifts on air
                    this.model.position.y = this._baseY + ((0.5 + Math.sin(t * 1.3) * 0.5) * 0.06 + lunge * 0.1) * sc;
                    this.model.rotation.z = Math.sin(t * 0.8) * 0.04;
                    break;
                case 'prowl':    // the head drops into the lunge
                    if (head) head.rotation.x += lunge * 0.3;
                    this.model.position.y += lunge * 0.14 * sc;
                    break;
                case 'drowse':   // nodding off where it stands
                    if (head) head.rotation.x += (0.5 + Math.sin(t * 0.7) * 0.5) * 0.16;
                    this.model.position.y += lunge * 0.08 * sc;
                    break;
                case 'creep':    // a snail: barely moves at all
                    if (head) head.rotation.x = Math.sin(t * 0.6) * 0.06;
                    break;
            }
            if (this._lvEars) this._lvEars.forEach((e, i) => {
                if (!e.visible) return;
                const flick = Math.max(0, Math.sin(t * 0.9 + i * 1.7) - 0.9) * 4;
                e.rotation.x = e.userData.rx0 - flick * 0.4 - (fast ? 0.25 : 0);
            });
            if (this._lvJaw && this._lvJaw.visible) this._lvJaw.rotation.x = this._lvJaw.userData.rx0 + (fast ? Math.abs(Math.sin(t * 14)) * 0.4 : Math.abs(Math.sin(t * 1.8)) * 0.06);
            if (this._lvShake && this._lvShake.visible) this._lvShake.position.x = this._lvShake.userData.x0 + Math.sin(t * 60) * (fast ? 0.012 : 0.004);
            if (this._lvCheeks) { const puff = 1 + (fast ? Math.abs(Math.sin(t * 9)) * 0.18 : Math.sin(t * 2.2) * 0.05); this._lvCheeks.forEach(c => c.scale.setScalar(puff)); }
            if (this._lvFlail) [this.frontLeft, this.frontRight].forEach((a, i) => { if (a && a.visible) a.rotation.z = (i ? 1 : -1) * Math.sin(t * (fast ? 12 : 4) + i) * 0.25; });
            if (this._lvGlow) this._lvGlow.forEach((m, i) => { m.emissiveIntensity = Math.sin(t * 6 + i * 2) > 0 ? 1.2 : 0.2; });
        }

        _animApe(t, anim, fast) {
            this.model.position.y = this._baseY + Math.sin(t * 1.6) * 0.03 * this.scale;
            const swing = fast ? Math.sin(t * 11) * 0.6 : Math.sin(t * 2.2) * 0.18;
            if (this.leftArm) this.leftArm.rotation.x = swing;
            if (this.rightArm) this.rightArm.rotation.x = -swing;
            // Chest-beat on a special attack.
            if (anim === 'specialattack') {
                const beat = Math.abs(Math.sin(t * 14));
                if (this.leftArm) this.leftArm.rotation.x = -0.6 - beat * 0.5;
                if (this.rightArm) this.rightArm.rotation.x = -0.6 - beat * 0.5;
            }
            if (this.leftLeg) this.leftLeg.rotation.x = Math.sin(t * 2.2) * 0.08;
            if (this.rightLeg) this.rightLeg.rotation.x = -Math.sin(t * 2.2) * 0.08;
            if (this.head && this.head.visible) this.head.rotation.z = Math.sin(t * 1.4) * 0.05;
            this.model.rotation.z = anim === 'hit' ? Math.sin(t * 26) * Math.exp(-t * 6) * 0.12 : 0;
        }

        deathPose(deltaTime) {
            const t = this.animTime, prog = Math.min(1.0, t / 1.1);
            for (const mat of this._materials) mat.opacity = Math.min(mat.opacity, 1.0 - prog);
            if (this._baseY === null) this._baseY = this.model.position.y;
            this.model.position.y = this._baseY - prog * 0.35 * this.scale;
            this.model.rotation.z = prog * (this.variant === 'ape' ? 0.9 : 1.4);
        }
    }

    const make = (scale, offsetY, enemy, weaponType, key) =>
        new BeastBattler3D(scale, offsetY, enemy, weaponType, key);

    const reg = window.Battler3D.registerArchetype;
    const S = B_PROFILES;
    // These override the matching tokens previously owned by the generic `beast`
    // quadruped (this file loads after Quadruped). Unlisted tokens (badger,
    // skunk, opossum, kangaroo, weasel, wolverine, ...) keep the generic rig.
    reg('bear',     { aliases: ['bear', 'bears', 'ursid', 'ursine', 'ursus', 'owlbear', 'yeti', 'panda'], scale: S.bear.scale, weapon: 0, create: make });
    reg('wolf',     { aliases: ['wolf', 'wolves', 'warg', 'wargs', 'coyote', 'hyena', 'hyenas', 'jackal', 'dingo', 'fox', 'foxes', 'vixen'], scale: S.wolf.scale, weapon: 0, create: make });
    reg('bigcat',   { aliases: ['bigcat', 'cat', 'cats', 'panther', 'panthera', 'tiger', 'tigers', 'lion', 'lions', 'lioness', 'leopard', 'jaguar', 'lynx', 'cougar', 'puma', 'wildcat', 'sabertooth', 'saber', 'ocelot', 'cheetah', 'feline'], scale: S.bigcat.scale, weapon: 0, create: make });
    reg('boar',     { aliases: ['boar', 'boars', 'pig', 'pigs', 'hog', 'hogs', 'swine', 'razorback', 'warthog', 'sow'], scale: S.boar.scale, weapon: 0, create: make });
    reg('rodent',   { aliases: ['rodent', 'rat', 'rats', 'rattus', 'mouse', 'mice', 'squirrel', 'raccoon', 'mole', 'beaver', 'porcupine', 'purcupine', 'lemming', 'vermin', 'chipmunk', 'hamster', 'gopher', 'gerbil'], scale: S.rodent.scale, weapon: 0, create: make });
    reg('ungulate', { aliases: ['ungulate', 'stag', 'deer', 'elk', 'moose', 'bull', 'bulls', 'ox', 'oxen', 'cow', 'cows', 'bovine', 'bison', 'buffalo', 'goat', 'goats', 'ram', 'sheep', 'rhino', 'rhinoceros', 'camel', 'antelope', 'gazelle', 'charger', 'titanothere'], scale: S.ungulate.scale, weapon: 0, create: make });
    reg('ape',      { aliases: ['ape', 'apes', 'monkey', 'monkeys', 'gorilla', 'primate', 'chimp', 'chimpanzee', 'baboon', 'simian'], scale: S.ape.scale, weapon: 0, create: make });
    reg('chromaticmanticore', { aliases: ['chromaticmanticore'], scale: S.chromaticmanticore.scale, weapon: 0, create: make });
    reg('chupacabra',         { aliases: ['chupacabra'], scale: S.chupacabra.scale, weapon: 0, create: make });
    reg('giantsnail',         { aliases: ['giantsnail'], scale: S.giantsnail.scale, weapon: 0, create: make });
    reg('infernalcerberus',   { aliases: ['infernalcerberus'], scale: S.infernalcerberus.scale, weapon: 0, create: make });
    reg('junglepredator',     { aliases: ['junglepredator'], scale: S.junglepredator.scale, weapon: 0, create: make });
    reg('mianni',             { aliases: ['mianni'], scale: S.mianni.scale, weapon: 0, create: make });
    reg('palettephantom',     { aliases: ['palettephantom'], scale: S.palettephantom.scale, weapon: 0, create: make });
    reg('radiantunicorn',     { aliases: ['radiantunicorn'], scale: S.radiantunicorn.scale, weapon: 0, create: make });
    reg('rhinobeetle',        { aliases: ['rhinobeetle'], scale: S.rhinobeetle.scale, weapon: 0, create: make });
    reg('rummagingopossum',   { aliases: ['rummagingopossum'], scale: S.rummagingopossum.scale, weapon: 0, create: make });
    reg('beast666',           { aliases: ['beast666'], scale: S.beast666.scale, weapon: 0, create: make });
    reg('tempestpegasus',     { aliases: ['tempestpegasus'], scale: S.tempestpegasus.scale, weapon: 0, create: make });
    reg('velocicorn',         { aliases: ['velocicorn'], scale: S.velocicorn.scale, weapon: 0, create: make });
    reg('swampleviathan',     { aliases: ['swampleviathan'], scale: S.swampleviathan.scale, weapon: 0, create: make });
    reg('invertedhunger',     { aliases: ['invertedhunger'], scale: S.invertedhunger.scale, weapon: 0, create: make });
    reg('voidhowler',         { aliases: ['voidhowler'], scale: S.voidhowler.scale, weapon: 0, create: make });
    reg('feastoffamine',      { aliases: ['feastoffamine'], scale: S.feastoffamine.scale, weapon: 0, create: make });
    reg('maternityward',      { aliases: ['maternityward'], scale: S.maternityward.scale, weapon: 0, create: make });
    reg('starvingsabercat',   { aliases: ['starvingsabercat'], scale: S.starvingsabercat.scale, weapon: 0, create: make });
    reg('ashenprowler',       { aliases: ['ashenprowler'], scale: S.ashenprowler.scale, weapon: 0, create: make });
    reg('gauntsnapper',       { aliases: ['gauntsnapper'], scale: S.gauntsnapper.scale, weapon: 0, create: make });
    reg('holloweyedboar',     { aliases: ['holloweyedboar'], scale: S.holloweyedboar.scale, weapon: 0, create: make });
    reg('ferallynx',          { aliases: ['ferallynx'], scale: S.ferallynx.scale, weapon: 0, create: make });
    reg('diregnasher',        { aliases: ['diregnasher'], scale: S.diregnasher.scale, weapon: 0, create: make });
    reg('gauntclawrunner',    { aliases: ['gauntclawrunner'], scale: S.gauntclawrunner.scale, weapon: 0, create: make });
    reg('bloodmawdirewolf',   { aliases: ['bloodmawdirewolf'], scale: S.bloodmawdirewolf.scale, weapon: 0, create: make });
    reg('gauntlynx',          { aliases: ['gauntlynx'], scale: S.gauntlynx.scale, weapon: 0, create: make });
    reg('feralbadger',        { aliases: ['feralbadger'], scale: S.feralbadger.scale, weapon: 0, create: make });
    reg('starvinggnasher',    { aliases: ['starvinggnasher'], scale: S.starvinggnasher.scale, weapon: 0, create: make });
    reg('feralridgeback',     { aliases: ['feralridgeback'], scale: S.feralridgeback.scale, weapon: 0, create: make });
    ["bf_packboar","bf_packripper","bf_stormgnasher","bf_lonejackal","bf_rabidlynx","bf_threetailedlynx","bf_rabidbadger","bf_mangyridgeback","bf_mudcakedgnasher","bf_mudcakedprowler","bf_threetailedhornbeast","bf_feralprowler","bf_frosthornbeast","bf_ironfangeddirewolf","bf_mangyhowler","bf_ashendirewolf","bf_ironfangedmawhound","bf_packridgeback","bf_cinderthornhide","bf_packclawrunner","bf_packhornbeast","bf_gauntripper","bf_bloodmawmawhound","bf_threetailedboar","bf_mudcakedripper","bf_cinderdirewolf","bf_direclawrunner","bf_packjackal","bf_stormhowler","bf_starvingclawrunner","bf_scarredclawrunner","bf_mangystalkhound","bf_mudcakedclawrunner","bf_scarredbristleback","bf_packlynx","bf_holloweyedsnapper","bf_ironfangedhornbeast","bf_holloweyedbristleback"].forEach(k => reg(k, { aliases: [k], scale: S[k].scale, weapon: 0, create: make }));
    // Rodent one-offs (narrow aliases; pinned by exact name below).
    reg('armoredbeaver',       { aliases: ['armoredbeaver'],       scale: S.armoredbeaver.scale,       weapon: 0, create: make });
    reg('wastelandbeaver',     { aliases: ['wastelandbeaver'],     scale: S.wastelandbeaver.scale,     weapon: 0, create: make });
    reg('armoredporcupine',    { aliases: ['armoredporcupine'],    scale: S.armoredporcupine.scale,    weapon: 0, create: make });
    reg('spikeyporcupine',     { aliases: ['spikeyporcupine'],     scale: S.spikeyporcupine.scale,     weapon: 0, create: make });
    reg('caffeinatedsquirrel', { aliases: ['caffeinatedsquirrel'], scale: S.caffeinatedsquirrel.scale, weapon: 0, create: make });
    reg('woodsquirrel',        { aliases: ['woodsquirrel'],        scale: S.woodsquirrel.scale,        weapon: 0, create: make });
    reg('fieldmouse',          { aliases: ['fieldmouse'],          scale: S.fieldmouse.scale,          weapon: 0, create: make });
    reg('forestrat',           { aliases: ['forestrat'],           scale: S.forestrat.scale,           weapon: 0, create: make });
    reg('giantrat',            { aliases: ['giantrat'],            scale: S.giantrat.scale,            weapon: 0, create: make });
    reg('sewerrat',            { aliases: ['sewerrat'],            scale: S.sewerrat.scale,            weapon: 0, create: make });
    reg('swamprat',            { aliases: ['swamprat'],            scale: S.swamprat.scale,            weapon: 0, create: make });
    reg('plaguerattus',        { aliases: ['plaguerattus'],        scale: S.plaguerattus.scale,        weapon: 0, create: make });
    reg('ratking',             { aliases: ['ratking'],             scale: S.ratking.scale,             weapon: 0, create: make });
    reg('frostraccoon',        { aliases: ['frostraccoon'],        scale: S.frostraccoon.scale,        weapon: 0, create: make });
    reg('nightraccoon',        { aliases: ['nightraccoon'],        scale: S.nightraccoon.scale,        weapon: 0, create: make });
    reg('molerodent',          { aliases: ['molerodent'],          scale: S.molerodent.scale,          weapon: 0, create: make });
    reg('tunnelingmole',       { aliases: ['tunnelingmole'],       scale: S.tunnelingmole.scale,       weapon: 0, create: make });
    reg('icelemming',          { aliases: ['icelemming'],          scale: S.icelemming.scale,          weapon: 0, create: make });
    // Bespoke Beast splits (narrow aliases; pinned by exact name below).
    ["bst_arcticfox","bst_cottonfox","bst_icewolfpup","bst_rabidhyena","bst_feralhyenapack","bst_graywolf","bst_manedterrorwolf","bst_redfox","bst_alphadirewolf","bst_alphawarg","bst_arcticwolf","bst_rabidcoyote","bst_scavengingcoyote","bst_lazycat","bst_blackpanther","bst_reflectivetiger","bst_sabercat","bst_wildcat","bst_feralalleycat","bst_goldenlion","bst_stripedtiger","bst_umbrapanthera","bst_mysticpanther","bst_sabertoothalpha","bst_diresabertoothalpha","bst_thirstycamel","bst_foreststag","bst_pastoralsheep","bst_armoredrhinoceros","bst_bloodbellcow","bst_deersprite","bst_hollowgoat","bst_ironhoofcharger","bst_rancorousbull","bst_titanotherealpha","bst_brownbear","bst_hornedbear","bst_youngyeti","bst_frostbackursid","bst_panda","bst_polarbear","bst_timewornowlbear","bst_demonbear","bst_kodiakbear","bst_emberclawbear","bst_frostfangbear","bst_thundermawursine","bst_titaniccavebear","bst_direpig","bst_flyingpig","bst_razorbackboar","bst_wildboar","bst_flyingpig2","bst_normalpig","bst_madboar","bst_maleficentape","bst_organgrindermonkey","bst_treemonkey"].forEach(k => reg(k, { aliases: [k], scale: S[k].scale, weapon: 0, create: make }));
    // Level 1-5 starter critters (each enemy carries <Model3D: lv_...>; pinned below too).
    ["lv_pantrymouse","lv_barnkitten","lv_acornsquirrel","lv_molehillpup","lv_gutterrat","lv_grumpyhedgehog","lv_chipmunkhoarder","lv_sockthiefferret","lv_binraccoon","lv_dunejerboa","lv_fennecfoxkit","lv_frostfoxkit","lv_mudskipper","lv_scrapyardjackal","lv_moorwolfpup","lv_dromedarycalf","lv_marshotter","lv_froststoat","lv_yeticub","lv_snowsledpup","lv_shrinemouse","lv_pilgrimgoatkid","lv_shrinefox","lv_slumbersheep","lv_dreamtapir","lv_subwayrat","lv_cyberpup","lv_greaserat","lv_chainsawbeaver","lv_shopliftingraccoon","lv_trufflepiglet","lv_fungalshrew","lv_alpinemarmot","lv_harbourwhelk","lv_jungletamarin","lv_unicornfoal","lv_bamboopandacub","lv_taigasquirrel","lv_savannahmeerkat","lv_steppevole"].forEach(k => reg(k, { aliases: [k], scale: S[k].scale, weapon: 0, create: make }));

    //=========================================================================
    // Name assignments. Every "beast" enemy carries <Archetype: Beast>, which
    // the core resolves BEFORE name-token aliases, so the aliases above alone
    // would never fire for them. registerNamed outranks the Archetype meta, so
    // we pin each Beast-tagged enemy to its specific body plan here. Names
    // already claimed by a bespoke model elsewhere (Behemoth Gorilla -> colossus,
    // Bull Wyvern -> dragon, ...) are intentionally omitted; the unmatched rest
    // (badger, skunk, opossum, kangaroo, unicorn, ...) keep the generic Quadruped
    // beast rig.
    const NAMED = {
        // Bear/wolf/bigcat/boar/ungulate/ape names split into bespoke bst_ rigs below.
        bear: [],
        wolf: [],
        bigcat: [],
        boar: [],
        // ── Bespoke canid pins ──────────────────────────────────────────────
        bst_arcticfox: ["Arctic Fox"],
        bst_cottonfox: ["Cotton Fox"],
        bst_icewolfpup: ["Ice Wolf Pup"],
        bst_rabidhyena: ["Rabid Hyena"],
        bst_feralhyenapack: ["Feral Hyena Pack"],
        bst_graywolf: ["Gray Wolf"],
        bst_manedterrorwolf: ["Maned Terror Wolf"],
        bst_redfox: ["Red Fox"],
        bst_alphadirewolf: ["Alpha Dire Wolf"],
        bst_alphawarg: ["Alpha Warg"],
        bst_arcticwolf: ["Arctic Wolf"],
        bst_rabidcoyote: ["Rabid Coyote"],
        bst_scavengingcoyote: ["Scavenging Coyote"],
        // ── Bespoke feline pins ─────────────────────────────────────────────
        bst_lazycat: ["Lazy Cat"],
        bst_blackpanther: ["Black Panther"],
        bst_reflectivetiger: ["Reflective Tiger"],
        bst_sabercat: ["Saber Cat"],
        bst_wildcat: ["Wildcat"],
        bst_feralalleycat: ["Feral Alley Cat"],
        bst_goldenlion: ["Golden Lion"],
        bst_stripedtiger: ["Striped Tiger"],
        bst_umbrapanthera: ["Umbra Panthera"],
        bst_mysticpanther: ["Mystic Panther"],
        bst_sabertoothalpha: ["Sabertooth Alpha"],
        bst_diresabertoothalpha: ["Dire Saber-tooth Alpha"],
        // ── Bespoke ungulate pins ───────────────────────────────────────────
        bst_thirstycamel: ["Thirsty Camel"],
        bst_foreststag: ["Forest Stag"],
        bst_pastoralsheep: ["Pastoral Sheep"],
        bst_armoredrhinoceros: ["Armored Rhinoceros"],
        bst_bloodbellcow: ["Bloodbell Cow"],
        bst_deersprite: ["Deer Sprite"],
        bst_hollowgoat: ["Hollow Goat"],
        bst_ironhoofcharger: ["Ironhoof Charger"],
        bst_rancorousbull: ["Rancorous Bull"],
        bst_titanotherealpha: ["Titanothere Alpha"],
        // ── Bespoke ursid pins ──────────────────────────────────────────────
        bst_brownbear: ["Brown Bear"],
        bst_hornedbear: ["Horned Bear"],
        bst_youngyeti: ["Young Yeti"],
        bst_frostbackursid: ["Frostback Ursid"],
        bst_panda: ["Panda"],
        bst_polarbear: ["Polar Bear"],
        bst_timewornowlbear: ["Timeworn Owlbear"],
        bst_demonbear: ["Demon Bear"],
        bst_kodiakbear: ["Kodiak Bear"],
        bst_emberclawbear: ["Emberclaw Bear"],
        bst_frostfangbear: ["Frostfang Bear"],
        bst_thundermawursine: ["Thundermaw Ursine"],
        bst_titaniccavebear: ["Titanic Cave Bear"],
        // ── Bespoke suid pins ───────────────────────────────────────────────
        bst_direpig: ["Dire Pig"],
        bst_flyingpig: ["Flying pig"],
        bst_razorbackboar: ["Razorback Boar"],
        bst_wildboar: ["Wild Boar"],
        bst_flyingpig2: ["Flying Pig"],
        bst_normalpig: ["Normal pig"],
        bst_madboar: ["Mad Boar"],
        // ── Bespoke primate pins ────────────────────────────────────────────
        bst_maleficentape: ["Maleficent Ape"],
        bst_organgrindermonkey: ["Organ Grinder Monkey"],
        bst_treemonkey: ["Tree Monkey"],
        // Each former generic `rodent` enemy now has its own bespoke body plan.
        armoredbeaver: ["Armored Beaver"],
        wastelandbeaver: ["Wasteland Beaver"],
        armoredporcupine: ["Armored Purcupine"],
        spikeyporcupine: ["Spikey Porcupine"],
        caffeinatedsquirrel: ["Caffeinated Squirrel"],
        woodsquirrel: ["Squirrel"],
        fieldmouse: ["Field Mouse"],
        forestrat: ["Forest Rat"],
        giantrat: ["Giant Rat"],
        sewerrat: ["Sewer Rat"],
        swamprat: ["Swamp Rat"],
        plaguerattus: ["Plaguebro Rattus"],
        ratking: ["Rat King"],
        frostraccoon: ["Frost Raccoon"],
        nightraccoon: ["Night Raccoon"],
        molerodent: ["Mole"],
        tunnelingmole: ["Tunneling Mole"],
        icelemming: ["Ice Lemming"],
        ungulate: [],
        ape: [],
        chromaticmanticore: ["Chromatic Manticore"],
        chupacabra: ["Chupacabra Fiend"],
        giantsnail: ["Giant Slithering Snail"],
        infernalcerberus: ["Infernal Cerberus"],
        junglepredator: ["Jungle Predator"],
        mianni: ["Mianni"],
        palettephantom: ["Palette Phantom"],
        radiantunicorn: ["Radiant Unicorn"],
        rhinobeetle: ["Rhinobeetle"],
        rummagingopossum: ["Rummaging Opossum"],
        beast666: ["Beast 666"],
        tempestpegasus: ["Tempest Pegasus"],
        velocicorn: ["Velocicorn"],
        swampleviathan: ["Swamp Leviathan"],
        invertedhunger: ["Inverted Hunger"],
        voidhowler: ["Void Howler"],
        feastoffamine: ["Feast of Famine"],
        maternityward: ["Maternity Ward"],
        starvingsabercat: ["Starving Saber-Cat"],
        ashenprowler: ["Ashen Prowler"],
        gauntsnapper: ["Gaunt Snapper"],
        holloweyedboar: ["Hollow-Eyed Boar"],
        ferallynx: ["Feral Lynx"],
        diregnasher: ["Dire Gnasher"],
        gauntclawrunner: ["Gaunt Clawrunner"],
        bloodmawdirewolf: ["Bloodmaw Direwolf"],
        gauntlynx: ["Gaunt Lynx"],
        feralbadger: ["Feral Badger"],
        starvinggnasher: ["Starving Gnasher"],
        feralridgeback: ["Feral Ridgeback"],
        // ── Level 1-5 starter critter pins ──────────────────────────────────
        lv_pantrymouse: ["Pantry Mouse"],
        lv_barnkitten: ["Barn Kitten"],
        lv_acornsquirrel: ["Acorn Squirrel"],
        lv_molehillpup: ["Molehill Pup"],
        lv_gutterrat: ["Gutter Rat"],
        lv_grumpyhedgehog: ["Grumpy Hedgehog"],
        lv_chipmunkhoarder: ["Chipmunk Hoarder"],
        lv_sockthiefferret: ["Sock Thief Ferret"],
        lv_binraccoon: ["Bin Raccoon"],
        lv_dunejerboa: ["Dune Jerboa"],
        lv_fennecfoxkit: ["Fennec Fox Kit"],
        lv_frostfoxkit: ["Frost Fox Kit"],
        lv_mudskipper: ["Mudskipper"],
        lv_scrapyardjackal: ["Scrapyard Jackal"],
        lv_moorwolfpup: ["Moor Wolf Pup"],
        lv_dromedarycalf: ["Dromedary Calf"],
        lv_marshotter: ["Marsh Otter"],
        lv_froststoat: ["Frost Stoat"],
        lv_yeticub: ["Yeti Cub"],
        lv_snowsledpup: ["Snow Sled Pup"],
        lv_shrinemouse: ["Shrine Mouse"],
        lv_pilgrimgoatkid: ["Pilgrim Goat Kid"],
        lv_shrinefox: ["Shrine Fox"],
        lv_slumbersheep: ["Slumber Sheep"],
        lv_dreamtapir: ["Dream Tapir"],
        lv_subwayrat: ["Subway Rat"],
        lv_cyberpup: ["Cyber Pup"],
        lv_greaserat: ["Grease Rat"],
        lv_chainsawbeaver: ["Chainsaw Beaver"],
        lv_shopliftingraccoon: ["Shoplifting Raccoon"],
        lv_trufflepiglet: ["Truffle Piglet"],
        lv_fungalshrew: ["Fungal Shrew"],
        lv_alpinemarmot: ["Alpine Marmot"],
        lv_harbourwhelk: ["Harbour Whelk"],
        lv_jungletamarin: ["Jungle Tamarin"],
        lv_unicornfoal: ["Unicorn Foal"],
        lv_bamboopandacub: ["Bamboo Panda Cub"],
        lv_taigasquirrel: ["Taiga Squirrel"],
        lv_savannahmeerkat: ["Savannah Meerkat"],
        lv_steppevole: ["Steppe Vole"],
    };
    if (window.Battler3D.registerNamed) {
        for (const key in NAMED) NAMED[key].forEach(n => window.Battler3D.registerNamed(n, key));
    }

    debugLog('Beasts family registered');
})();
