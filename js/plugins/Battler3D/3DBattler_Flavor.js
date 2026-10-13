//=============================================================================
// 3D Battler System - Flavor Uniques
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Description-driven bespoke models for distinctive named enemies
 * (gun burger, sushi snail, origami crane, cursed candle, pillow guardian,
 * weeping mask, paperwork spirit, traffic-cone mimic, walking door, baptism
 * font, rotating sawblade, hair ball). Requires 3DBattlerSystem + families first.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * ============================================================================
 * 3D Battler - Flavor Uniques
 * ============================================================================
 *
 * One-off models hand-shaped to match a specific enemy's flavour text, assigned
 * by exact name (override with <Battler3D: key>). Each reuses the shared base:
 * part-losing, per-event id variation, base action gestures.
 *
 * MUST load AFTER the other Battler3D family plugins.
 */

(() => {
    'use strict';

    if (typeof THREE === 'undefined') return;
    if (!window.Battler3D || !window.Battler3D.Base) {
        console.error('[3D Battler Flavor] Core (3DBattlerSystem) not loaded first.');
        return;
    }

    const Base = window.Battler3D.Base;
    const debugLog = window.Battler3D.debugLog || function () {};

    // variant + which models face the camera (front) vs the angled 3/4 view.
    const F_PROFILES = {
        gunburger:    { variant: 'gunburger', front: true,  scale: 2.4, texturePool: 'flesh', bodyColor: 0xd8a24a, accent: 0xff2222, hue: [0.10, 0.04], sat: [0.55, 0.12], lit: [0.55, 0.10] },
        sushisnail:   { variant: 'sushisnail', front: false, scale: 2.2, texturePool: 'pale', bodyColor: 0xd9c7a8, accent: 0xe7553b, hue: [0.09, 0.04], sat: [0.30, 0.12], lit: [0.62, 0.10] },
        origamicrane: { variant: 'origami', front: false, scale: 2.6, texturePool: 'pale', bodyColor: 0xf2efe6, accent: 0xcc3344, hue: [0.10, 0.03], sat: [0.08, 0.05], lit: [0.85, 0.06] },
        cursedcandle: { variant: 'candle', front: true,  scale: 2.6, texturePool: 'metal', bodyColor: 0x9a8a5a, accent: 0xff7a1a, hue: [0.10, 0.04], sat: [0.30, 0.10], lit: [0.45, 0.10] },
        pillowguardian:{ variant: 'pillow', front: true,  scale: 3.0, texturePool: 'flesh', bodyColor: 0xc9a9c9, accent: 0x33223a, hue: [0.85, 0.10], sat: [0.30, 0.12], lit: [0.62, 0.10] },
        weepingmask:  { variant: 'mask', front: true,  scale: 2.4, texturePool: 'bone', bodyColor: 0xe8e0d0, accent: 0x111111, hue: [0.11, 0.03], sat: [0.10, 0.06], lit: [0.80, 0.08] },
        paperwork:    { variant: 'paperwork', front: true,  scale: 2.8, texturePool: 'pale', bodyColor: 0xc6d9e6, accent: 0x773e33, hue: [0.10, 0.03], sat: [0.15, 0.08], lit: [0.80, 0.08] },
        // Everyday objects that came alive (ChestMimic / Spherical archetypes).
        trafficcone:  { variant: 'trafficcone', front: true,  scale: 2.4, texturePool: 'pale',  bodyColor: 0xf26a1b, accent: 0xff3322, hue: [0.05, 0.03], sat: [0.85, 0.10], lit: [0.52, 0.08] },
        sentientcone: { variant: 'sentientcone', front: true,  scale: 2.2, texturePool: 'pale',  bodyColor: 0xf26a1b, accent: 0x222222, hue: [0.05, 0.03], sat: [0.85, 0.10], lit: [0.52, 0.08] },
        walkingdoor:  { variant: 'walkingdoor', front: true,  scale: 3.2, texturePool: 'wood',  bodyColor: 0x286e35, accent: 0x37d480, hue: [0.08, 0.03], sat: [0.45, 0.12], lit: [0.38, 0.10] },
        baptismfont:  { variant: 'baptismfont', front: true,  scale: 2.8, texturePool: 'stone', bodyColor: 0x8a8f96, accent: 0x66ff88, hue: [0.33, 0.06], sat: [0.08, 0.05], lit: [0.55, 0.08] },
        sawblade:     { variant: 'sawblade',    front: true,  scale: 2.6, texturePool: 'metal', bodyColor: 0x9aa0aa, accent: 0xff3322, hue: [0.58, 0.05], sat: [0.08, 0.05], lit: [0.60, 0.10] },
        hairball:     { variant: 'hairball',    front: false, scale: 2.5, texturePool: 'fur',   bodyColor: 0x2e2018, accent: 0xcdddf0, hue: [0.07, 0.04], sat: [0.35, 0.15], lit: [0.22, 0.08] },
        // ── FF8-inspired bespoke models (each the sole user of its archetype) ──
        tidesculptor:     { variant: 'tidesculptor',     front: true,  scale: 2.7, texturePool: 'water',   bodyColor: 0x2f7fa8, accent: 0x7fe8ff, hue: [0.54, 0.06], sat: [0.55, 0.12], lit: [0.46, 0.10] },
        forestcentaur:    { variant: 'forestcentaur',    front: true,  scale: 3.2, texturePool: 'fur',     bodyColor: 0x7a5230, accent: 0xa8d86a, hue: [0.07, 0.04], sat: [0.45, 0.12], lit: [0.36, 0.10] },
        obsidianvisionary:{ variant: 'obsidianvisionary',front: true,  scale: 2.8, texturePool: 'crystal', bodyColor: 0x171018, accent: 0xff7a3a, hue: [0.78, 0.10], sat: [0.30, 0.14], lit: [0.18, 0.08] },
        ochrejelly:       { variant: 'ochrejelly',       front: true,  scale: 2.8, texturePool: 'water',   bodyColor: 0xc98a2a, accent: 0xffd86a, hue: [0.09, 0.04], sat: [0.65, 0.12], lit: [0.50, 0.10] },
        barbedmanticore:  { variant: 'barbedmanticore',  front: false, scale: 3.6, texturePool: 'fur',     bodyColor: 0x7a2a22, accent: 0xff5a2a, hue: [0.03, 0.03], sat: [0.55, 0.14], lit: [0.34, 0.10] },
        nobleguardian:    { variant: 'nobleguardian',    front: true,  scale: 3.0, texturePool: 'metal',   bodyColor: 0x8b929c, accent: 0xff3b2a, hue: [0.58, 0.05], sat: [0.10, 0.06], lit: [0.55, 0.10] },
        forestarcher:     { variant: 'forestarcher',     front: true,  scale: 2.7, texturePool: 'foliage', bodyColor: 0x3f5a2c, accent: 0xc8e07a, hue: [0.27, 0.08], sat: [0.45, 0.12], lit: [0.36, 0.10] },
        enchantress:      { variant: 'enchantress',      front: true,  scale: 2.8, texturePool: 'water',   bodyColor: 0xd98ab0, accent: 0x7fe8ff, hue: [0.90, 0.10], sat: [0.45, 0.14], lit: [0.62, 0.10] },
        // ── Batch: first non-unique enemies in ID order (224-247) ─────────────
        embersprite:     { variant: 'embersprite',     front: true,  scale: 1.9, texturePool: 'fire',    fire: true,  bodyColor: 0xff7a1a, accent: 0xffe070, hue: [0.06, 0.03], sat: [0.85, 0.10], lit: [0.55, 0.10] },
        frostsylph:      { variant: 'embersprite',     front: true,  scale: 1.9, texturePool: 'water',   fire: false, bodyColor: 0x9fd8ff, accent: 0xeafcff, hue: [0.55, 0.06], sat: [0.55, 0.12], lit: [0.70, 0.10] },
        flamefrake:      { variant: 'flamefrake',      front: false, scale: 2.6, texturePool: 'fire',    bodyColor: 0xb83c1a, accent: 0xffb030, hue: [0.04, 0.03], sat: [0.70, 0.12], lit: [0.42, 0.10] },
        flameturret:     { variant: 'flameturret',     front: true,  scale: 2.6, texturePool: 'metal',   bodyColor: 0x8a7060, accent: 0xff5a1a, hue: [0.06, 0.04], sat: [0.20, 0.08], lit: [0.45, 0.10] },
        fluxlingfurret:  { variant: 'fluxlingfurret',  front: true,  scale: 2.0, texturePool: 'crystal', bodyColor: 0x8a6ad0, accent: 0x6affd0, hue: [0.74, 0.20], sat: [0.55, 0.16], lit: [0.58, 0.12] },
        foresttreant:    { variant: 'foresttreant',    front: true,  scale: 3.4, texturePool: 'wood',    bodyColor: 0x5a4026, accent: 0x4f7a32, hue: [0.09, 0.04], sat: [0.40, 0.12], lit: [0.34, 0.10] },
        forestwitch:     { variant: 'forestwitch',     front: true,  scale: 2.7, texturePool: 'foliage', bodyColor: 0x3a5a3a, accent: 0x9fe070, hue: [0.30, 0.08], sat: [0.40, 0.12], lit: [0.34, 0.10] },
        frostelemental:  { variant: 'frostelemental',  front: true,  scale: 2.6, texturePool: 'crystal', bodyColor: 0x8fd0e8, accent: 0xeafcff, hue: [0.54, 0.06], sat: [0.45, 0.14], lit: [0.62, 0.12] },
        frostspider:     { variant: 'spider',          front: false, scale: 2.6, texturePool: 'crystal', icy: true,  bodyColor: 0xc77fd8, accent: 0xf6eaff, hue: [0.55, 0.06], sat: [0.40, 0.12], lit: [0.58, 0.12] },
        giantspider:     { variant: 'spider',          front: false, scale: 3.0, texturePool: 'fur',     icy: false, bodyColor: 0x2a2220, accent: 0xb03020, hue: [0.06, 0.04], sat: [0.30, 0.12], lit: [0.20, 0.08] },
        giantjellyfish:  { variant: 'giantjellyfish',  front: true,  scale: 3.0, texturePool: 'water',   bodyColor: 0x9b6ad0, accent: 0x6affd0, hue: [0.74, 0.16], sat: [0.45, 0.16], lit: [0.62, 0.12] },
        giantscorpion:   { variant: 'giantscorpion',   front: false, scale: 3.0, texturePool: 'stone',   bodyColor: 0x6a5238, accent: 0xc8d030, hue: [0.09, 0.04], sat: [0.35, 0.12], lit: [0.40, 0.10] },
        // ── Batch: non-unique enemies in ID order (249-295) ───────────────────
        glaciercrab:     { variant: 'glaciercrab',     front: false, scale: 2.4, texturePool: 'crystal', bodyColor: 0x7fc8e8, accent: 0xeafcff, hue: [0.55, 0.06], sat: [0.45, 0.12], lit: [0.60, 0.12] },
        glimmershrimp:   { variant: 'glimmershrimp',   front: true,  scale: 1.9, texturePool: 'crystal', bodyColor: 0xffd0e0, accent: 0xfff0a0, hue: [0.95, 0.10], sat: [0.50, 0.14], lit: [0.70, 0.10] },
        goldenmimic:     { variant: 'goldenmimic',     front: true,  scale: 2.4, texturePool: 'metal',   bodyColor: 0xd4af37, accent: 0xfff0a0, hue: [0.12, 0.03], sat: [0.70, 0.10], lit: [0.55, 0.10] },
        holographicdecoy:{ variant: 'holographicdecoy',front: true,  scale: 2.7, texturePool: 'crystal', bodyColor: 0x4c46ff, accent: 0xeaedff, hue: [0.55, 0.08], sat: [0.65, 0.14], lit: [0.62, 0.12] },
        icekangaroo:     { variant: 'icekangaroo',     front: true,  scale: 2.8, texturePool: 'crystal', bodyColor: 0x9fd8ff, accent: 0xeafcff, hue: [0.55, 0.06], sat: [0.40, 0.12], lit: [0.66, 0.12] },
        insectswarm:     { variant: 'insectswarm',     front: true,  scale: 2.6, texturePool: 'void',    bodyColor: 0x2a2218, accent: 0x9aff5a, hue: [0.10, 0.04], sat: [0.30, 0.12], lit: [0.22, 0.08] },
        junkrat:         { variant: 'junkrat',         front: true,  scale: 2.4, texturePool: 'flesh',   bodyColor: 0x6a5a44, accent: 0x9aff5a, hue: [0.10, 0.04], sat: [0.30, 0.12], lit: [0.36, 0.10] },
        kangaroo:        { variant: 'kangaroo',        front: true,  scale: 2.9, texturePool: 'fur',     bodyColor: 0x9a6a44, accent: 0x3a241a, hue: [0.07, 0.04], sat: [0.45, 0.12], lit: [0.40, 0.10] },
        komododragon:    { variant: 'komododragon',    front: false, scale: 2.8, texturePool: 'foliage', bodyColor: 0x6a6a4a, accent: 0xc8b070, hue: [0.18, 0.06], sat: [0.30, 0.12], lit: [0.38, 0.10] },
        magmaant:        { variant: 'magmaant',        front: false, scale: 2.4, texturePool: 'fire',    bodyColor: 0x3a1c12, accent: 0xff7a1a, hue: [0.05, 0.03], sat: [0.55, 0.14], lit: [0.28, 0.10] },
        marshwraith:     { variant: 'marshwraith',     front: true,  scale: 2.8, texturePool: 'void',    bodyColor: 0x3a4a3a, accent: 0x8aff9a, hue: [0.35, 0.08], sat: [0.35, 0.12], lit: [0.28, 0.10] },
        mindleech:       { variant: 'mindleech',       front: true,  scale: 2.2, texturePool: 'flesh',   bodyColor: 0x9a4a5a, accent: 0xff6a8a, hue: [0.95, 0.06], sat: [0.45, 0.14], lit: [0.42, 0.10] },
        // ── Batch: non-unique enemies in ID order (296-336) ───────────────────
        mirespider:      { variant: 'mirespider',      front: false, scale: 2.6, texturePool: 'foliage', bodyColor: 0x4a5a3a, accent: 0x9aff5a, hue: [0.28, 0.08], sat: [0.40, 0.12], lit: [0.32, 0.10] },
        monitorlizard:   { variant: 'monitorlizard',   front: false, scale: 2.8, texturePool: 'foliage', bodyColor: 0x6a6a4a, accent: 0xc8b070, hue: [0.18, 0.06], sat: [0.30, 0.12], lit: [0.38, 0.10] },
        monstrousbadger: { variant: 'monstrousbadger', front: false, scale: 2.6, texturePool: 'fur',     bodyColor: 0x3a3a3a, accent: 0xffcc44, hue: [0.10, 0.04], sat: [0.10, 0.06], lit: [0.26, 0.10] },
        mutantbug:       { variant: 'mutantbug',       front: false, scale: 2.0, texturePool: 'flesh',   bodyColor: 0x7a5a3a, accent: 0x9aff5a, hue: [0.10, 0.04], sat: [0.40, 0.12], lit: [0.36, 0.10] },
        overworkedvillager:{ variant: 'overworkedvillager', front: true, scale: 2.7, texturePool: 'pale', bodyColor: 0x8a7a5a, accent: 0x6a4a3a, hue: [0.10, 0.04], sat: [0.25, 0.10], lit: [0.52, 0.10] },
        primalkangaroo:  { variant: 'primalkangaroo',  front: true,  scale: 2.9, texturePool: 'fur',     bodyColor: 0x9a6a44, accent: 0x7a2a22, hue: [0.07, 0.04], sat: [0.45, 0.12], lit: [0.40, 0.10] },
        quagmirecreeper: { variant: 'quagmirecreeper', front: false, scale: 2.5, texturePool: 'flesh',   bodyColor: 0x5a4a3a, accent: 0x8aaf4a, hue: [0.20, 0.08], sat: [0.35, 0.12], lit: [0.32, 0.10] },
        rabidjackrabbit: { variant: 'rabidjackrabbit', front: true,  scale: 2.2, texturePool: 'fur',     bodyColor: 0xb0a890, accent: 0xff5a5a, hue: [0.10, 0.05], sat: [0.20, 0.10], lit: [0.58, 0.10] },
        reaganite:       { variant: 'reaganite',       front: true,  scale: 2.4, texturePool: 'crystal', bodyColor: 0xe8d86a, accent: 0xff5a4a, hue: [0.12, 0.05], sat: [0.55, 0.14], lit: [0.60, 0.12] },
        ribcagecrab:     { variant: 'ribcagecrab',     front: false, scale: 2.5, texturePool: 'bone',    bodyColor: 0xc05a4a, accent: 0xff3344, hue: [0.02, 0.03], sat: [0.45, 0.14], lit: [0.42, 0.10] },
        securitybot:     { variant: 'securitybot',     front: true,  scale: 2.7, texturePool: 'metal',   bodyColor: 0x7a8290, accent: 0xffaa22, hue: [0.58, 0.05], sat: [0.10, 0.06], lit: [0.52, 0.10] },
        seraphicemissary:{ variant: 'seraphicemissary',front: true,  scale: 2.9, texturePool: 'pale',    bodyColor: 0xf0ead8, accent: 0xffb030, hue: [0.10, 0.04], sat: [0.15, 0.08], lit: [0.84, 0.08] },
        // ── Batch: non-unique enemies in ID order (337-360) ───────────────────
        shadowcrawler:   { variant: 'shadowcrawler',   front: false, scale: 2.2, texturePool: 'void',    bodyColor: 0x1a1822, accent: 0x8a5aff, hue: [0.74, 0.10], sat: [0.30, 0.12], lit: [0.16, 0.08] },
        shadowstalker:   { variant: 'shadowstalker',   front: true,  scale: 2.6, texturePool: 'void',    bodyColor: 0x201514, accent: 0xff773a, hue: [0.72, 0.10], sat: [0.35, 0.12], lit: [0.14, 0.08] },
        shadowwraith:    { variant: 'shadowwraith',    front: true,  scale: 2.8, texturePool: 'void',    bodyColor: 0x0e0e16, accent: 0x9a6aff, hue: [0.76, 0.10], sat: [0.40, 0.14], lit: [0.12, 0.08] },
        spectralwardstone:{ variant: 'spectralwardstone',front: true, scale: 2.6, texturePool: 'stone',  bodyColor: 0x726a70, accent: 0xba7fff, hue: [0.55, 0.08], sat: [0.10, 0.06], lit: [0.42, 0.10] },
        spinedlizard:    { variant: 'spinedlizard',    front: false, scale: 2.6, texturePool: 'stone',   bodyColor: 0x8a7a4a, accent: 0xc8d030, hue: [0.13, 0.05], sat: [0.35, 0.12], lit: [0.42, 0.10] },
        spinysprinter:   { variant: 'spinysprinter',   front: true,  scale: 2.0, texturePool: 'fur',     bodyColor: 0x6a5a4a, accent: 0xffcc44, hue: [0.10, 0.04], sat: [0.30, 0.12], lit: [0.36, 0.10] },
        stoneguardian:   { variant: 'stoneguardian',   front: true,  scale: 2.9, texturePool: 'stone',   bodyColor: 0x7a7a82, accent: 0x66ccff, hue: [0.58, 0.06], sat: [0.08, 0.05], lit: [0.46, 0.10] },
        stormbanshee:    { variant: 'stormbanshee',    front: true,  scale: 2.7, texturePool: 'crystal', bodyColor: 0x6a7aa8, accent: 0xeaff6a, hue: [0.60, 0.08], sat: [0.30, 0.12], lit: [0.46, 0.10] },
        stormcaller:     { variant: 'stormcaller',     front: true,  scale: 2.8, texturePool: 'crystal', bodyColor: 0x4a5a7a, accent: 0xffe04a, hue: [0.60, 0.08], sat: [0.35, 0.12], lit: [0.40, 0.10] },
        swampcrocodile:  { variant: 'swampcrocodile',  front: false, scale: 3.0, texturePool: 'foliage', bodyColor: 0x4a5a3a, accent: 0xc8d070, hue: [0.28, 0.08], sat: [0.35, 0.12], lit: [0.32, 0.10] },
        tarantula:       { variant: 'tarantula',       front: false, scale: 2.6, texturePool: 'fur',     bodyColor: 0x2a1f18, accent: 0xc04a2a, hue: [0.06, 0.04], sat: [0.30, 0.12], lit: [0.18, 0.08] },
        thundersprite:   { variant: 'thundersprite',   front: true,  scale: 1.8, texturePool: 'crystal', bodyColor: 0x8acfff, accent: 0xffff8a, hue: [0.58, 0.08], sat: [0.45, 0.14], lit: [0.66, 0.12] },
        // ── Level 1-5 roster: bespoke starter models (built along Z, facing +Z) ──
        lv_foldedairplane:     { variant: 'lv_foldedairplane',     front: false, scale: 2.0, texturePool: 'pale',    bodyColor: 0xe8e2cc, accent: 0xc0302a, hue: [0.12, 0.03], sat: [0.15, 0.06], lit: [0.84, 0.06] },
        lv_wasabisnail:        { variant: 'lv_wasabisnail',        front: false, scale: 2.0, texturePool: 'flesh',   bodyColor: 0x7fa83a, accent: 0xe88a9a, hue: [0.24, 0.04], sat: [0.55, 0.12], lit: [0.44, 0.08] },
        lv_clockworktinsoldier:{ variant: 'lv_clockworktinsoldier',front: true,  scale: 2.2, texturePool: 'metal',   bodyColor: 0xb8262a, accent: 0xe0b040, hue: [0.00, 0.03], sat: [0.65, 0.10], lit: [0.42, 0.08] },
        lv_dryerlintgolem:     { variant: 'lv_dryerlintgolem',     front: true,  scale: 2.2, texturePool: 'fur',     bodyColor: 0x9a9aa4, accent: 0x6ad8ff, hue: [0.62, 0.05], sat: [0.06, 0.04], lit: [0.62, 0.08] },
        lv_sandgecko:          { variant: 'lv_sandgecko',          front: false, scale: 2.0, texturePool: 'stone',   bodyColor: 0xd8b878, accent: 0x3a2a1a, hue: [0.11, 0.03], sat: [0.45, 0.12], lit: [0.62, 0.08] },
        lv_deserttumbleweed:   { variant: 'lv_deserttumbleweed',   front: true,  scale: 2.0, texturePool: 'wood',    bodyColor: 0x9a7a4a, accent: 0xff8a3a, hue: [0.09, 0.03], sat: [0.40, 0.12], lit: [0.44, 0.08] },
        lv_dunescorpling:      { variant: 'lv_dunescorpling',      front: false, scale: 2.0, texturePool: 'pale',    bodyColor: 0xe6d6a8, accent: 0x8aff6a, hue: [0.12, 0.03], sat: [0.40, 0.10], lit: [0.76, 0.06] },
        lv_saltcrab:           { variant: 'lv_saltcrab',           front: true,  scale: 2.0, texturePool: 'bone',    bodyColor: 0xeae6dc, accent: 0xd84a3a, hue: [0.10, 0.03], sat: [0.12, 0.06], lit: [0.86, 0.05] },
        lv_desertporcupine:    { variant: 'lv_desertporcupine',    front: false, scale: 2.1, texturePool: 'fur',     bodyColor: 0x8a6a48, accent: 0xf0e8d8, hue: [0.08, 0.03], sat: [0.35, 0.10], lit: [0.42, 0.08] },
        lv_manticorecub:       { variant: 'lv_manticorecub',       front: false, scale: 2.3, texturePool: 'fur',     bodyColor: 0xb07a40, accent: 0xd84a6a, hue: [0.08, 0.03], sat: [0.50, 0.12], lit: [0.46, 0.08] },
        lv_belltowergargoyle:  { variant: 'lv_belltowergargoyle',  front: true,  scale: 2.3, texturePool: 'stone',   bodyColor: 0x7a7670, accent: 0x6ab0e0, hue: [0.10, 0.04], sat: [0.06, 0.04], lit: [0.46, 0.08] },
        lv_voidferretkit:      { variant: 'lv_voidferretkit',      front: false, scale: 2.0, texturePool: 'void',    bodyColor: 0x4a3a6a, accent: 0xc06aff, hue: [0.74, 0.06], sat: [0.30, 0.10], lit: [0.32, 0.08] },
        lv_astraljellyfish:    { variant: 'lv_astraljellyfish',    front: true,  scale: 2.4, texturePool: 'water',   bodyColor: 0x2a3a8a, accent: 0xbfe6ff, hue: [0.64, 0.05], sat: [0.55, 0.12], lit: [0.36, 0.08] },
        lv_lunarhopper:        { variant: 'lv_lunarhopper',        front: false, scale: 2.1, texturePool: 'pale',    bodyColor: 0xd8d8d0, accent: 0xffe89a, hue: [0.14, 0.03], sat: [0.06, 0.04], lit: [0.82, 0.05] },
        lv_mallguardbot:       { variant: 'lv_mallguardbot',       front: true,  scale: 2.3, texturePool: 'metal',   bodyColor: 0x2a3a6a, accent: 0xff3a3a, hue: [0.62, 0.04], sat: [0.45, 0.10], lit: [0.30, 0.06] },
        lv_looseboltbot:       { variant: 'lv_looseboltbot',       front: true,  scale: 2.0, texturePool: 'metal',   bodyColor: 0x8a8a7a, accent: 0x5ad0ff, hue: [0.16, 0.04], sat: [0.08, 0.05], lit: [0.50, 0.08] },
        lv_plushbear:          { variant: 'lv_plushbear',          front: true,  scale: 2.1, texturePool: 'fur',     bodyColor: 0x9a6a40, accent: 0xd83a4a, hue: [0.08, 0.03], sat: [0.45, 0.10], lit: [0.42, 0.08] },
        lv_sparkplugsprite:    { variant: 'lv_sparkplugsprite',    front: true,  scale: 1.9, texturePool: 'crystal', bodyColor: 0xeeeae0, accent: 0x6ac8ff, hue: [0.12, 0.03], sat: [0.10, 0.05], lit: [0.88, 0.05] },
        lv_plagueleech:        { variant: 'lv_plagueleech',        front: false, scale: 2.1, texturePool: 'flesh',   bodyColor: 0x2e2a22, accent: 0xb8d040, hue: [0.12, 0.04], sat: [0.20, 0.08], lit: [0.18, 0.06] },
        lv_coinpursemimic:     { variant: 'lv_coinpursemimic',     front: true,  scale: 2.0, texturePool: 'flesh',   bodyColor: 0x7a4a2a, accent: 0xe0b040, hue: [0.07, 0.03], sat: [0.50, 0.10], lit: [0.32, 0.06] },
        lv_morguecrawler:      { variant: 'lv_morguecrawler',      front: false, scale: 2.1, texturePool: 'pale',    bodyColor: 0xd8d8d4, accent: 0x6a8ad0, hue: [0.55, 0.05], sat: [0.06, 0.04], lit: [0.82, 0.05] },
        lv_pizzaooze:          { variant: 'lv_pizzaooze',          front: false, scale: 2.1, texturePool: 'flesh',   bodyColor: 0xf0b840, accent: 0xc0302a, hue: [0.12, 0.03], sat: [0.75, 0.10], lit: [0.58, 0.06] },
        lv_hoardlizard:        { variant: 'lv_hoardlizard',        front: false, scale: 2.0, texturePool: 'foliage', bodyColor: 0x6a7a3a, accent: 0xe0b040, hue: [0.20, 0.04], sat: [0.40, 0.10], lit: [0.36, 0.06] },
        lv_pitrhinobeetle:     { variant: 'lv_pitrhinobeetle',     front: false, scale: 2.1, texturePool: 'metal',   bodyColor: 0x4a1e12, accent: 0xf0e8d0, hue: [0.04, 0.03], sat: [0.55, 0.10], lit: [0.20, 0.05] },
        lv_hoardwyrmling:      { variant: 'lv_hoardwyrmling',      front: false, scale: 2.2, texturePool: 'fire',    bodyColor: 0x8a3a2a, accent: 0xffa040, hue: [0.03, 0.03], sat: [0.50, 0.10], lit: [0.36, 0.06] },
        lv_fishnetcrab:        { variant: 'lv_fishnetcrab',        front: true,  scale: 2.0, texturePool: 'water',   bodyColor: 0x4a6a6a, accent: 0xff6a3a, hue: [0.48, 0.05], sat: [0.20, 0.08], lit: [0.38, 0.06] },
        lv_sewergatorhatchling:{ variant: 'lv_sewergatorhatchling',front: false, scale: 2.2, texturePool: 'pale',    bodyColor: 0xe8e0d0, accent: 0xd83030, hue: [0.10, 0.03], sat: [0.12, 0.05], lit: [0.84, 0.05] },
        lv_shadowpuddle:       { variant: 'lv_shadowpuddle',       front: true,  scale: 2.2, texturePool: 'void',    bodyColor: 0x140e1c, accent: 0xe8d86a, hue: [0.76, 0.06], sat: [0.30, 0.10], lit: [0.10, 0.04] },
        lv_wishingtotem:       { variant: 'lv_wishingtotem',       front: true,  scale: 2.2, texturePool: 'wood',    bodyColor: 0x8a5a30, accent: 0x40d0c0, hue: [0.08, 0.03], sat: [0.45, 0.10], lit: [0.36, 0.06] },
        lv_centaurfoal:        { variant: 'lv_centaurfoal',        front: false, scale: 2.6, texturePool: 'fur',     bodyColor: 0x9a6a3a, accent: 0xf0e8d8, hue: [0.07, 0.03], sat: [0.45, 0.10], lit: [0.38, 0.06] },
        lv_ruingecko:          { variant: 'lv_ruingecko',          front: false, scale: 2.0, texturePool: 'stone',   bodyColor: 0x8a8a84, accent: 0x8aff9a, hue: [0.14, 0.04], sat: [0.06, 0.04], lit: [0.52, 0.06] },
        // ── Bespoke uniques pinned by key from the enemy's own note ─────────────
        u_umbrallurker:          { variant: 'u_umbrallurker', front: true, scale: 2.6, texturePool: 'void', bodyColor: 0x1a1424, accent: 0xb06aff, hue: [0.76, 0.05], sat: [0.30, 0.10], lit: [0.12, 0.05] },
        u_bureaucraticnightmare: { variant: 'u_bureaucraticnightmare', front: true, scale: 2.8, texturePool: 'metal', bodyColor: 0x6a7a6a, accent: 0xff3a2a, hue: [0.30, 0.04], sat: [0.10, 0.05], lit: [0.44, 0.06] },
        u_offrampincarnate:      { variant: 'u_offrampincarnate', front: true, scale: 3.2, texturePool: 'stone', bodyColor: 0x2e2e30, accent: 0xfff0b0, hue: [0.60, 0.04], sat: [0.04, 0.03], lit: [0.20, 0.05] },
        u_varleniamirage:        { variant: 'u_varleniamirage', front: true, scale: 2.7, texturePool: 'stone', bodyColor: 0xe8c880, accent: 0xffe8a0, hue: [0.11, 0.03], sat: [0.50, 0.10], lit: [0.70, 0.06] },
        u_rimespinner:           { variant: 'u_rimespinner', front: false, scale: 2.6, texturePool: 'crystal', bodyColor: 0x6a9ac8, accent: 0xd0f4ff, hue: [0.56, 0.04], sat: [0.40, 0.10], lit: [0.52, 0.06] },
        u_thothsbrokenward:      { variant: 'u_thothsbrokenward', front: true, scale: 2.6, texturePool: 'stone', bodyColor: 0xb8a888, accent: 0xd02a8a, hue: [0.11, 0.03], sat: [0.25, 0.08], lit: [0.60, 0.06] }
    };

    // ── Level 1-5 roster helpers: terse low-poly primitives ──────────────────
    const lvBox = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    const lvSph = (r, w, h) => new THREE.SphereGeometry(r, w || 7, h || 5);
    const lvCyl = (rt, rb, h, s) => new THREE.CylinderGeometry(rt, rb, h, s || 7);
    const lvCone = (r, h, s) => new THREE.ConeGeometry(r, h, s || 5);
    const lvTor = (R, r, rs, ts, arc) => new THREE.TorusGeometry(R, r, rs || 4, ts || 10, arc === undefined ? Math.PI * 2 : arc);

    class FlavorBattler3D extends Base {
        constructor(scale, offsetY, battler, weaponType, creatureType) {
            const profile = F_PROFILES[creatureType] || F_PROFILES.gunburger;
            super(scale, offsetY, battler, profile, 0, creatureType || 'gunburger');
            this.variant = profile.variant;
            this._materials = [];
            this._baseY = null;
            this._floaters = [];
            if (profile.front) this.facingYaw = 0;
        }

        async load(physicsWorld, startX = 0, startY = 0, startZ = 0) {
            this.physicsWorld = physicsWorld;
            switch (this.variant) {
                case 'sushisnail': this._buildSushiSnail(); break;
                case 'origami':    this._buildOrigami(); break;
                case 'candle':     this._buildCandle(); break;
                case 'pillow':     this._buildPillow(); break;
                case 'mask':       this._buildMask(); break;
                case 'paperwork':  this._buildPaperwork(); break;
                case 'trafficcone': this._buildTrafficCone(); break;
                case 'sentientcone': this._buildSentientCone(); break;
                case 'walkingdoor': this._buildDoor(); break;
                case 'baptismfont': this._buildBaptismFont(); break;
                case 'sawblade':    this._buildSawblade(); break;
                case 'hairball':    this._buildHairBall(); break;
                case 'tidesculptor':      this._buildTideSculptor(); break;
                case 'forestcentaur':     this._buildForestCentaur(); break;
                case 'obsidianvisionary': this._buildObsidianVisionary(); break;
                case 'ochrejelly':        this._buildOchreJelly(); break;
                case 'barbedmanticore':   this._buildBarbedManticore(); break;
                case 'nobleguardian':     this._buildNobleGuardian(); break;
                case 'forestarcher':      this._buildForestArcher(); break;
                case 'enchantress':       this._buildEnchantress(); break;
                case 'embersprite':       this._buildSpriteFairy(); break;
                case 'flamefrake':        this._buildFlameFrake(); break;
                case 'flameturret':       this._buildFlameTurret(); break;
                case 'fluxlingfurret':    this._buildFluxlingFurret(); break;
                case 'foresttreant':      this._buildForestTreant(); break;
                case 'forestwitch':       this._buildForestWitch(); break;
                case 'frostelemental':    this._buildFrostElemental(); break;
                case 'spider':            this._buildSpider(); break;
                case 'giantjellyfish':    this._buildGiantJellyfish(); break;
                case 'giantscorpion':     this._buildGiantScorpion(); break;
                case 'glaciercrab':       this._buildGlacierCrab(); break;
                case 'glimmershrimp':     this._buildGlimmerShrimp(); break;
                case 'goldenmimic':       this._buildGoldenMimic(); break;
                case 'holographicdecoy':  this._buildHolographicDecoy(); break;
                case 'icekangaroo':       this._buildIceKangaroo(); break;
                case 'insectswarm':       this._buildInsectSwarm(); break;
                case 'junkrat':           this._buildJunkrat(); break;
                case 'kangaroo':          this._buildKangaroo(); break;
                case 'komododragon':      this._buildKomodoDragon(); break;
                case 'magmaant':          this._buildMagmaAnt(); break;
                case 'marshwraith':       this._buildMarshWraith(); break;
                case 'mindleech':         this._buildMindLeech(); break;
                case 'mirespider':        this._buildMireSpider(); break;
                case 'monitorlizard':     this._buildMonitorLizard(); break;
                case 'monstrousbadger':   this._buildMonstrousBadger(); break;
                case 'mutantbug':         this._buildMutantBug(); break;
                case 'overworkedvillager':this._buildOverworkedVillager(); break;
                case 'primalkangaroo':    this._buildPrimalKangaroo(); break;
                case 'quagmirecreeper':   this._buildQuagmireCreeper(); break;
                case 'rabidjackrabbit':   this._buildRabidJackrabbit(); break;
                case 'reaganite':         this._buildReaganite(); break;
                case 'ribcagecrab':       this._buildRibCageCrab(); break;
                case 'securitybot':       this._buildSecurityBot(); break;
                case 'seraphicemissary':  this._buildSeraphicEmissary(); break;
                case 'shadowcrawler':     this._buildShadowCrawler(); break;
                case 'shadowstalker':     this._buildShadowStalker(); break;
                case 'shadowwraith':      this._buildShadowWraith(); break;
                case 'spectralwardstone': this._buildSpectralWardstone(); break;
                case 'spinedlizard':      this._buildSpinedLizard(); break;
                case 'spinysprinter':     this._buildSpinySprinter(); break;
                case 'stoneguardian':     this._buildStoneGuardian(); break;
                case 'stormbanshee':      this._buildStormBanshee(); break;
                case 'stormcaller':       this._buildStormCaller(); break;
                case 'swampcrocodile':    this._buildSwampCrocodile(); break;
                case 'tarantula':         this._buildTarantula(); break;
                case 'thundersprite':     this._buildThunderSprite(); break;
                case 'lv_foldedairplane':      this._buildLvFoldedAirplane(); break;
                case 'lv_wasabisnail':         this._buildLvWasabiSnail(); break;
                case 'lv_clockworktinsoldier': this._buildLvTinSoldier(); break;
                case 'lv_dryerlintgolem':      this._buildLvLintGolem(); break;
                case 'lv_sandgecko':           this._buildLvSandGecko(); break;
                case 'lv_deserttumbleweed':    this._buildLvTumbleweed(); break;
                case 'lv_dunescorpling':       this._buildLvScorpling(); break;
                case 'lv_saltcrab':            this._buildLvSaltCrab(); break;
                case 'lv_desertporcupine':     this._buildLvPorcupine(); break;
                case 'lv_manticorecub':        this._buildLvManticoreCub(); break;
                case 'lv_belltowergargoyle':   this._buildLvGargoyle(); break;
                case 'lv_voidferretkit':       this._buildLvVoidFerret(); break;
                case 'lv_astraljellyfish':     this._buildLvAstralJelly(); break;
                case 'lv_lunarhopper':         this._buildLvLunarHopper(); break;
                case 'lv_mallguardbot':        this._buildLvMallGuard(); break;
                case 'lv_looseboltbot':        this._buildLvLooseBolt(); break;
                case 'lv_plushbear':           this._buildLvPlushBear(); break;
                case 'lv_sparkplugsprite':     this._buildLvSparkPlug(); break;
                case 'lv_plagueleech':         this._buildLvPlagueLeech(); break;
                case 'lv_coinpursemimic':      this._buildLvCoinPurse(); break;
                case 'lv_morguecrawler':       this._buildLvMorgueCrawler(); break;
                case 'lv_pizzaooze':           this._buildLvPizzaOoze(); break;
                case 'lv_hoardlizard':         this._buildLvHoardLizard(); break;
                case 'lv_pitrhinobeetle':      this._buildLvRhinoBeetle(); break;
                case 'lv_hoardwyrmling':       this._buildLvWyrmling(); break;
                case 'lv_fishnetcrab':         this._buildLvFishnetCrab(); break;
                case 'lv_sewergatorhatchling': this._buildLvGatorHatchling(); break;
                case 'lv_shadowpuddle':        this._buildLvShadowPuddle(); break;
                case 'lv_wishingtotem':        this._buildLvWishingTotem(); break;
                case 'lv_centaurfoal':         this._buildLvCentaurFoal(); break;
                case 'lv_ruingecko':           this._buildLvRuinGecko(); break;
                case 'u_umbrallurker':          this._buildUUmbralLurker(); break;
                case 'u_bureaucraticnightmare': this._buildUBureaucrat(); break;
                case 'u_offrampincarnate':      this._buildUOffRamp(); break;
                case 'u_varleniamirage':        this._buildUVarlenia(); break;
                case 'u_rimespinner':           this._buildURimeSpinner(); break;
                case 'u_thothsbrokenward':      this._buildUThothWard(); break;
                default:           this._buildGunBurger(); break;
            }
            this.model = this.bodyGroup;
            this.applyModelScale();
            this.loaded = true;
            return this;
        }

        _mat(color, opacity, rough, emissive) {
            const m = new THREE.MeshStandardMaterial({
                color, roughness: (rough === undefined ? 0.7 : rough),
                emissive: new THREE.Color(emissive || 0x000000), emissiveIntensity: emissive ? 0.6 : 0,
                transparent: true, opacity: (opacity === undefined ? 1.0 : opacity), side: THREE.DoubleSide
            });
            this._materials.push(m);
            return m;
        }
        _skinMat(color, rough) { return this.applySkin(this._mat(color, 1.0, rough === undefined ? 0.7 : rough)); }
        _eye(parent, x, y, z, r, accent) {
            const eye = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), this._mat(0xffffff, 1.0, 0.2));
            eye.position.set(x, y, z);
            const pupil = new THREE.Mesh(new THREE.SphereGeometry(r * 0.5, 8, 8), this._mat(accent || 0x111111, 1.0, 0.2, accent));
            pupil.position.set(0, 0, r * 0.7); eye.add(pupil); parent.add(eye); return eye;
        }
        _mapCommon(p) {
            const m = this._partMeshMap, set = (ks, mesh) => { if (mesh) ks.forEach(k => m[k] = mesh); };
            set(['HEAD', 'SKULL', 'BRAIN', 'EYE', 'EYES', 'FACE', 'CAP'], p.head);
            set(['TORSO', 'BODY', 'CORE', 'MASS', 'STALK', 'STEM', 'TRUNK', 'SHELL'], p.body);
            set(['LEFT_ARM', 'LEFT_UPPER_ARM', 'TENTACLE_ONE', 'LIMBS'], p.leftArm);
            set(['RIGHT_ARM', 'RIGHT_UPPER_ARM', 'ARM_CANNON', 'GUN_BARREL', 'TENTACLE_TWO'], p.rightArm);
            set(['LEFT_LEG', 'LEFT_THIGH', 'ROOTS', 'FOOT', 'FEET'], p.leftLeg);
            set(['RIGHT_LEG', 'RIGHT_THIGH'], p.rightLeg);
        }
        _bodyCascade(p) {
            this._cascadeRules = [
                { gone: ['BODY', 'CORE', 'TORSO', 'MASS', 'SHELL', 'STALK'], hide: [p.body, p.head, p.leftArm, p.rightArm, p.leftLeg, p.rightLeg].filter(Boolean) },
                { gone: ['HEAD', 'SKULL', 'BRAIN', 'EYE', 'EYES', 'FACE'], hide: [p.head].filter(Boolean) },
                { gone: ['LEFT_ARM', 'LEFT_UPPER_ARM', 'TENTACLE_ONE'], hide: [p.leftArm].filter(Boolean) },
                { gone: ['RIGHT_ARM', 'RIGHT_UPPER_ARM', 'ARM_CANNON', 'GUN_BARREL'], hide: [p.rightArm].filter(Boolean) },
                { gone: ['LEFT_LEG', 'LEFT_THIGH'], hide: [p.leftLeg].filter(Boolean) },
                { gone: ['RIGHT_LEG', 'RIGHT_THIGH'], hide: [p.rightLeg].filter(Boolean) },
            ];
        }

        // ── Gun Burger: a mass-produced security gun shaped like a hamburger ──
        _buildGunBurger() {
            const p = this.profile;
            const bun = this._skinMat(p.bodyColor, 0.7);
            this.body = new THREE.Group();
            const bot = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.52, 0.26, 16), bun); this.body.add(bot);
            const patty = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.64, 0.16, 16), this._mat(0x5a3420, 1.0, 0.8)); patty.position.y = 0.2; this.body.add(patty);
            const cheese = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.05, 1.05), this._mat(0xffb733, 1.0, 0.5)); cheese.position.y = 0.3; cheese.rotation.y = 0.4; this.body.add(cheese);
            const lettuce = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.09, 6, 18), this._mat(0x6abf4a, 1.0, 0.6)); lettuce.position.y = 0.35; lettuce.rotation.x = Math.PI / 2; this.body.add(lettuce);
            this.body.position.y = 0.9; this.bodyGroup.add(this.body);
            this.head = new THREE.Group();
            const top = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), bun); top.scale.y = 0.8; this.head.add(top);
            for (let i = 0; i < 6; i++) { const a = this.idRand() * 6.28, r = this.idRand() * 0.32; const s = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), this._mat(0xfff0c0, 1, 0.4)); s.position.set(Math.cos(a) * r, 0.35, Math.sin(a) * r); this.head.add(s); }
            this.head.position.y = 1.28; this.bodyGroup.add(this.head);
            this.headEye = this._eye(this.head, 0, 0.05, 0.55, 0.11, p.accent);
            // Surveillance antenna (sweeps with the head) + a blinking sensor tip.
            this.antenna = new THREE.Group();
            const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 6), this._mat(0x141414, 1.0, 0.4)); rod.position.y = 0.16; this.antenna.add(rod);
            this.antenna._blip = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), this._mat(p.accent, 1.0, 0.3, p.accent)); this.antenna._blip.position.y = 0.34; this.antenna.add(this.antenna._blip);
            this.antenna.position.set(-0.2, 0.34, 0); this.head.add(this.antenna);
            // Mounted gun barrel arm (right) + an ammo drum on the left.
            this.rightArm = new THREE.Group();
            const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.7, 10), this._mat(0x2a2a2a, 1.0, 0.4)); barrel.rotation.x = Math.PI / 2; barrel.position.z = 0.45; this.rightArm.add(barrel);
            this.rightArm._muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 6, 12), this._mat(p.accent, 0.9, 0.3, p.accent)); this.rightArm._muzzle.position.z = 0.8; this.rightArm.add(this.rightArm._muzzle);
            this.rightArm.position.set(0.3, 0.95, 0.4); this.bodyGroup.add(this.rightArm);
            this.leftArm = new THREE.Group();
            const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 14), this._mat(0x333333, 1.0, 0.45)); drum.rotation.z = Math.PI / 2; this.leftArm.add(drum);
            this.leftArm.position.set(-0.5, 0.95, 0.15); this.bodyGroup.add(this.leftArm);
            // Stubby mass-produced security legs so it stands rather than floats.
            this.leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.4, 8), this._mat(0x222222, 1.0, 0.4)); this.leftLeg.position.set(-0.26, 0.55, 0); this.bodyGroup.add(this.leftLeg);
            this.rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.4, 8), this._mat(0x222222, 1.0, 0.4)); this.rightLeg.position.set(0.26, 0.55, 0); this.bodyGroup.add(this.rightLeg);
            this._mapCommon({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm, leftLeg: this.leftLeg, rightLeg: this.rightLeg });
            this._bodyCascade({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm, leftLeg: this.leftLeg, rightLeg: this.rightLeg });
        }

        // ── Sushi Snail: gelatinous snail with a nigiri shell, smells of soy ──
        _buildSushiSnail() {
            const p = this.profile;
            const flesh = this._skinMat(p.bodyColor, 0.4);
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), flesh); this.body.position.set(0, 0.45, 0.2); this.body.scale.set(1, 1, 2.1); this.bodyGroup.add(this.body);
            this.foot = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 1.15), flesh); this.foot.position.set(0, 0.18, 0.1); this.bodyGroup.add(this.foot);
            // Nigiri shell: rice block + salmon slab bound by a nori strip.
            this.shell = new THREE.Group();
            const rice = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.7), this._mat(0xfaf6ee, 1.0, 0.85)); this.shell.add(rice);
            const salmon = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.1, 0.74), this._mat(0xe7553b, 1.0, 0.5)); salmon.position.y = 0.22; this.shell.add(salmon);
            for (let i = 0; i < 3; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.53, 0.005, 0.04), this._mat(0xf2efe6, 1.0, 0.6)); st.position.set(0, 0.28, -0.2 + i * 0.2); this.shell.add(st); }
            const nori = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.46, 0.74), this._mat(0x1c2a1c, 1.0, 0.5)); this.shell.add(nori);
            this.shell.position.set(0, 0.62, -0.25); this.bodyGroup.add(this.shell);
            this.head = new THREE.Group();
            this.t1 = this._stalk(-0.1, p.accent); this.t2 = this._stalk(0.1, p.accent); this.head.add(this.t1, this.t2);
            this.bodyGroup.add(this.head);
            this._partMeshMap = { SHELL: this.shell, BODY: this.body, FOOT: this.foot, HEAD: this.head, EYE: this.head, TENTACLE_1: this.t1, TENTACLE_2: this.t2 };
            this._cascadeRules = [
                { gone: ['BODY', 'CORE'], hide: [this.body, this.shell, this.foot, this.head] },
                { gone: ['SHELL'], hide: [this.shell] },
                { gone: ['FOOT'], hide: [this.foot] },
                { gone: ['HEAD', 'EYE', 'TENTACLE_1', 'TENTACLE_2'], hide: [this.head] },
            ];
        }
        _stalk(x, accent) {
            const g = new THREE.Group();
            const st = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 6), this._skinMat(this.profile.bodyColor, 0.4)); st.position.y = 0.2; g.add(st);
            const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), this._mat(accent || 0x111111, 1.0, 0.2)); e.position.y = 0.42; g.add(e);
            g.position.set(x, 0.6, 0.55); this.bodyGroup.add(g); this._floaters.push(g); return g;
        }

        // ── Origami Crane: a living folded-paper bird with razor edges ───────
        _buildOrigami() {
            const p = this.profile;
            const paper = this._mat(p.bodyColor, 1.0, 0.5); paper.flatShading = true;
            this.body = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), paper); this.body.position.set(0, 1.0, 0); this.body.scale.set(0.7, 0.7, 1.4); this.bodyGroup.add(this.body);
            this.head = new THREE.Group();
            const neck = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 4), paper); neck.rotation.x = -1.0; neck.position.set(0, 0.2, 0.4); this.head.add(neck);
            const beak = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.4, 4), paper); beak.rotation.x = 1.6; beak.position.set(0, 0.5, 0.7); this.head.add(beak);
            this._eye(neck, -0.08, 0.0, 0.0, 0.04, p.accent); this._eye(neck, 0.08, 0.0, 0.0, 0.04, p.accent);
            this.head.position.set(0, 1.0, 0); this.bodyGroup.add(this.head);
            // Flat folded wings.
            this.leftArm = this._wing(paper, -1); this.rightArm = this._wing(paper, 1);
            // Tail fold.
            this.tail = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.8, 4), paper); this.tail.rotation.x = 1.9; this.tail.position.set(0, 1.0, -0.55); this.tail.scale.set(1, 1, 0.2); this.bodyGroup.add(this.tail);
            this._partMeshMap = { HEAD: this.head, BODY: this.body, LEFT_WING: this.leftArm, RIGHT_WING: this.rightArm, LEFT_ARM: this.leftArm, RIGHT_ARM: this.rightArm, TAIL: this.tail };
            this._cascadeRules = [
                { gone: ['BODY', 'CORE'], hide: [this.body, this.head, this.leftArm, this.rightArm, this.tail] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['LEFT_WING', 'LEFT_ARM'], hide: [this.leftArm] },
                { gone: ['RIGHT_WING', 'RIGHT_ARM'], hide: [this.rightArm] },
                { gone: ['TAIL'], hide: [this.tail] },
            ];
        }
        _wing(mat, side) {
            const g = new THREE.Group();
            const w = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 3), mat); w.rotation.z = side * Math.PI / 2; w.position.x = side * 0.55; w.scale.set(1, 1, 0.06);
            g.add(w); g.position.set(0, 1.05, -0.05); g._side = side; this.bodyGroup.add(g); this._floaters.push(g); return g;
        }

        // ── Cursed Candle: possessed candelabra with unholy flames + a face ──
        _buildCandle() {
            const p = this.profile;
            const brass = this._skinMat(p.bodyColor, 0.4);
            this.body = new THREE.Group();
            const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.18, 12), brass); this.body.add(base);
            const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.2, 10), brass); stem.position.y = 0.7; this.body.add(stem);
            const waxMat = this._mat(0xeae0c8, 1.0, 0.6);
            this.head = new THREE.Group();
            const central = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.7, 12), waxMat); this.head.add(central);
            this._eye(this.head, -0.09, 0.12, 0.16, 0.06, 0xff7a1a); this._eye(this.head, 0.09, 0.12, 0.16, 0.06, 0xff7a1a);
            const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.06), this._mat(0x1a0a00, 1.0, 0.6)); mouth.position.set(0, -0.05, 0.16); this.head.add(mouth);
            this.flames = new THREE.Group();
            this.flames.add(this._flame(0, 0.45));
            this.head.position.y = 1.55; this.bodyGroup.add(this.head);
            // Side arms holding candles.
            this.leftArm = this._candleArm(brass, waxMat, -1); this.rightArm = this._candleArm(brass, waxMat, 1);
            this.body.position.y = 0; this.bodyGroup.add(this.body);
            this.head.add(this.flames);
            this._mapCommon({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm });
            this._bodyCascade({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm });
        }
        _flame(x, y) {
            const f = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.32, 8), this._mat(0xff7a1a, 0.92, 0.2, 0xff5500));
            f.position.set(x, y, 0); f._flame = true; this._floaters.push(f); return f;
        }
        _candleArm(brass, wax, side) {
            const g = new THREE.Group();
            const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8), brass); arm.rotation.z = side * 1.3; arm.position.set(side * 0.25, 0.1, 0); g.add(arm);
            const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.12, 10), brass); cup.position.set(side * 0.45, 0.25, 0); g.add(cup);
            const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 8), wax); candle.position.set(side * 0.45, 0.45, 0); g.add(candle);
            const fl = this._flame(side * 0.45, 0.65); g.add(fl);
            g.position.set(0, 1.0, 0); this.bodyGroup.add(g); return g;
        }

        // ── Pillow Guardian: a sturdy golem of cushions and blankets ─────────
        _buildPillow() {
            const p = this.profile;
            const fab = this._skinMat(p.bodyColor, 0.9);
            const cushion = (w, h, d) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), fab); return m; };
            this.body = cushion(1.0, 1.1, 0.7); this.body.position.y = 1.3; this.bodyGroup.add(this.body);
            const lower = cushion(0.9, 0.7, 0.6); lower.position.y = 0.55; this.bodyGroup.add(lower);
            this.head = new THREE.Group();
            const h = cushion(0.6, 0.55, 0.55); this.head.add(h);
            // Button eyes + stitched mouth.
            const btn = (x) => { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 10), this._mat(p.accent, 1.0, 0.4)); b.rotation.x = Math.PI / 2; b.position.set(x, 0.06, 0.29); this.head.add(b); };
            btn(-0.14); btn(0.14);
            this.head.position.y = 2.1; this.bodyGroup.add(this.head);
            this.leftArm = this._pillowLimb(fab, -0.62, 1.45); this.rightArm = this._pillowLimb(fab, 0.62, 1.45);
            this.leftLeg = this._pillowLimb(fab, -0.3, 0.2); this.rightLeg = this._pillowLimb(fab, 0.3, 0.2);
            this._mapCommon({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm, leftLeg: this.leftLeg, rightLeg: this.rightLeg });
            this._bodyCascade({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm, leftLeg: this.leftLeg, rightLeg: this.rightLeg });
        }
        _pillowLimb(mat, x, y) {
            const g = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.7, 0.26), mat);
            g.position.set(x, y, 0); if (Math.abs(x) > 0.5) g.rotation.z = -Math.sign(x) * 0.3;
            this.bodyGroup.add(g); g._x = x; return g;
        }

        // ── Weeping Mask: floating theatre mask dripping black ichor ─────────
        _buildMask() {
            const p = this.profile;
            const porcelain = this._skinMat(p.bodyColor, 0.3);
            this.body = new THREE.Group();
            const face = new THREE.Mesh(new THREE.SphereGeometry(0.55, 18, 14, 0, Math.PI * 2, Math.PI * 0.15, Math.PI * 0.7), porcelain);
            face.scale.set(1.0, 1.25, 0.55); this.body.add(face);
            // Hollow eyes + dramatic frown.
            const hole = (x) => { const h = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 12), this._mat(0x000000, 1.0, 0.1)); h.position.set(x, 0.12, 0.32); h.scale.set(1, 1.3, 0.6); this.body.add(h); return h; };
            this.leftHole = hole(-0.2); this.rightHole = hole(0.2);
            const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.04, 8, 14, Math.PI), this._mat(0x111111, 1.0, 0.4)); mouth.position.set(0, -0.32, 0.3); mouth.rotation.z = Math.PI; this.body.add(mouth);
            this.body.position.y = 1.3; this.bodyGroup.add(this.body);
            this.head = this.body;
            // Falling tears.
            this.tears = new THREE.Group();
            for (let i = 0; i < 6; i++) { const t = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), this._mat(0x0a0a14, 0.9, 0.2)); t.position.set((i % 2 ? 0.2 : -0.2), 1.3 - this.idRand() * 0.9, 0.34); t.scale.y = 1.6; t._t = this.idRand(); this.tears.add(t); }
            this.bodyGroup.add(this.tears); this._floaters.push(this.tears);
            this._partMeshMap = { FACE: this.body, HEAD: this.body, BODY: this.body, EYES: this.body };
            this._cascadeRules = [{ gone: ['FACE', 'HEAD', 'BODY', 'CORE'], hide: [this.body, this.tears] }];
        }

        // ── Paperwork Spirit: a swirling column of forms with a stamping hand ─
        _buildPaperwork() {
            const p = this.profile;
            const robe = this._mat(0x33425a, 0.96, 0.85);
            this.body = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.7, 10), robe); this.body.position.set(0, 1.0, 0); this.bodyGroup.add(this.body);
            this.head = new THREE.Group();
            const pockets = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.1), this._skinMat(p.bodyColor, 0.8)); this.head.add(pockets);
            this._eye(this.head, -0.1, 0.08, 0.08, 0.05, p.accent); this._eye(this.head, 0.1, 0.08, 0.08, 0.05, p.accent);
            this.head.position.set(0, 2.0, 0); this.bodyGroup.add(this.head);
            // Stamp arm.
            this.rightArm = new THREE.Group();
            const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8), robe); arm.position.set(0.1, -0.2, 0); this.rightArm.add(arm);
            const stamp = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.14, 10), this._mat(0x6a4a2a, 1.0, 0.6)); stamp.position.set(0.1, -0.45, 0); this.rightArm.add(stamp); this.rightArm._stamp = stamp;
            this.rightArm.position.set(0.35, 1.6, 0.1); this.bodyGroup.add(this.rightArm);
            // Swirling papers.
            this.papers = new THREE.Group();
            for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; const pa = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.01), this._mat(0xf2efe6, 1.0, 0.9)); pa.position.set(Math.cos(a) * 0.8, 0.9 + Math.sin(a * 2) * 0.5, Math.sin(a) * 0.8); pa.rotation.set(this.idRand() * 6, this.idRand() * 6, this.idRand() * 6); this.papers.add(pa); }
            this.bodyGroup.add(this.papers); this._floaters.push(this.papers);
            this._mapCommon({ head: this.head, body: this.body, rightArm: this.rightArm });
            this._bodyCascade({ head: this.head, body: this.body, rightArm: this.rightArm });
        }

        // ── Traffic-cone mimic: striped cone that splits into a fanged maw ────
        // Source enemy uses the ChestMimic archetype: CORE/LID/TEETH/TONGUE/FEET.
        _buildTrafficCone() {
            const p = this.profile;
            const coneMat = this._skinMat(p.bodyColor, 0.5);
            const stripeMat = this._mat(0xf4f1ea, 1.0, 0.35);
            const mawMat = this._mat(0x4a0a0a, 1.0, 0.5, 0x3a0606);
            this.feet = new THREE.Group();
            const base = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.16, 1.05), coneMat);
            base.position.y = 0.08; this.feet.add(base);
            const footMat = this._mat(0x1c1c1c, 1.0, 0.8);
            for (const fx of [-0.36, 0.36]) for (const fz of [-0.36, 0.36]) {
                const foot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.13, 0.2), footMat);
                foot.position.set(fx, -0.04, fz); this.feet.add(foot);
            }
            this.bodyGroup.add(this.feet);
            this.body = new THREE.Group(); // lower frustum (CORE) + stripe band
            const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.5, 0.5, 18), coneMat);
            lower.position.y = 0.41; this.body.add(lower);
            const band = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.47, 0.16, 18), stripeMat);
            band.position.y = 0.3; this.body.add(band);
            this.bodyGroup.add(this.body);
            this.maw = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.4, 16), mawMat);
            this.maw.position.y = 0.7; this.bodyGroup.add(this.maw);
            this.lid = new THREE.Group(); // hinged tip carrying the eyes
            const tip = new THREE.Mesh(new THREE.ConeGeometry(0.33, 0.62, 18), coneMat);
            tip.position.y = 0.31; this.lid.add(tip);
            const tband = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.14, 16), stripeMat);
            tband.position.y = 0.2; this.lid.add(tband);
            this._eye(this.lid, -0.16, 0.16, 0.2, 0.075, p.accent);
            this._eye(this.lid, 0.16, 0.16, 0.2, 0.075, p.accent);
            this.lid.position.set(0, 0.66, -0.3); this.bodyGroup.add(this.lid);
            this.teeth = new THREE.Group();
            const toothMat = this._mat(0xf2efe0, 1.0, 0.4);
            for (let i = 0; i < 12; i++) {
                const a = (i / 12) * Math.PI * 2;
                const t = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 4), toothMat);
                t.position.set(Math.cos(a) * 0.3, 0.66, Math.sin(a) * 0.3); this.teeth.add(t);
            }
            this.bodyGroup.add(this.teeth);
            this.tongue = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.36), this._mat(0xc04a5a, 1.0, 0.5));
            this.tongue.position.set(0, 0.66, 0.28); this.tongue.rotation.x = 0.5; this.bodyGroup.add(this.tongue);
            this._partMeshMap = { CORE: this.body, LID: this.lid, TEETH: this.teeth, TONGUE: this.tongue, FEET: this.feet };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.body, this.lid, this.teeth, this.tongue, this.maw, this.feet] },
                { gone: ['LID'], hide: [this.lid] },
                { gone: ['TEETH'], hide: [this.teeth] },
                { gone: ['TONGUE'], hide: [this.tongue] },
                { gone: ['FEET'], hide: [this.feet] },
            ];
        }

        // ── Sentient traffic cone: the Cone Mimic's honest cousin ───────────
        // Deliberately does NOT split: one unbroken moulded cone on its square
        // base, two reflective bands, and a pair of eyes. No hinge, no maw, no
        // teeth -- it is a traffic cone that happens to be awake.
        _buildSentientCone() {
            const p = this.profile;
            const coneMat = this._skinMat(p.bodyColor, 0.5);
            const stripeMat = this._mat(0xf4f1ea, 1.0, 0.35);
            // FEET: the moulded square base it waddles on.
            this.feet = new THREE.Group();
            const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 1.1), coneMat); base.position.y = 0.07; this.feet.add(base);
            const bevel = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.08, 0.92), coneMat); bevel.position.y = 0.17; this.feet.add(bevel);
            const padMat = this._mat(0x1c1c1c, 1.0, 0.85);
            for (const fx of [-0.38, 0.38]) for (const fz of [-0.38, 0.38]) {
                const pad = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.22), padMat);
                pad.position.set(fx, -0.02, fz); this.feet.add(pad);
            }
            this.bodyGroup.add(this.feet);
            // CORE: one continuous cone, apex at y 1.70, base radius 0.42 at y 0.20.
            this.body = new THREE.Group();
            const cone = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.5, 20), coneMat);
            cone.position.y = 0.95; this.body.add(cone);
            // Reflective bands, sized to the cone's radius at their own height so
            // they hug the taper instead of ringing it like hoops.
            const rAt = (y) => 0.42 * (1.70 - y) / 1.5;
            const bandAt = (yc, h, grow) => {
                const b = new THREE.Mesh(new THREE.CylinderGeometry(rAt(yc + h / 2) * grow, rAt(yc - h / 2) * grow, h, 20), stripeMat);
                b.position.y = yc; this.body.add(b);
            };
            bandAt(0.80, 0.26, 1.03);
            bandAt(1.20, 0.18, 1.03);
            this.bodyGroup.add(this.body);
            // EYES on the front of the taper, sunk to the surface at that height.
            this.face = new THREE.Group();
            this._eye(this.face, -0.15, 0.58, rAt(0.58) - 0.02, 0.1, p.accent);
            this._eye(this.face, 0.15, 0.58, rAt(0.58) - 0.02, 0.1, p.accent);
            this.bodyGroup.add(this.face);
            this._partMeshMap = { CORE: this.body, HEAD: this.face, EYES: this.face, FACE: this.face, FEET: this.feet };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.body, this.face, this.feet] },
                { gone: ['HEAD', 'EYES', 'FACE'], hide: [this.face] },
                { gone: ['FEET'], hide: [this.feet] },
            ];
        }

        // ── Walking door: a sentient door slab that talks and ambles ─────────
        _buildDoor() {
            const p = this.profile;
            const woodMat = this._skinMat(p.bodyColor, 0.6);
            const trimMat = this._mat(0x2e2014, 1.0, 0.7);
            const W = 0.92, D = 0.16;
            this.body = new THREE.Group(); // lower slab (CORE)
            const lowerSlab = new THREE.Mesh(new THREE.BoxGeometry(W, 0.95, D), woodMat);
            lowerSlab.position.y = 0.55; this.body.add(lowerSlab);
            const lp = new THREE.Mesh(new THREE.BoxGeometry(W * 0.62, 0.5, 0.04), trimMat);
            lp.position.set(0, 0.5, D / 2); this.body.add(lp);
            this.bodyGroup.add(this.body);
            this.lid = new THREE.Group(); // upper slab hinged above the mouth
            const upperSlab = new THREE.Mesh(new THREE.BoxGeometry(W, 0.95, D), woodMat);
            upperSlab.position.y = 0.5; this.lid.add(upperSlab);
            const up = new THREE.Mesh(new THREE.BoxGeometry(W * 0.62, 0.5, 0.04), trimMat);
            up.position.set(0, 0.55, D / 2); this.lid.add(up);
            const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), this._mat(p.accent, 1.0, 0.3, p.accent));
            knob.position.set(W * 0.36, 0.4, D / 2); this.lid.add(knob);
            this._eye(this.lid, -0.2, 0.66, D / 2, 0.09, p.accent);
            this._eye(this.lid, 0.2, 0.66, D / 2, 0.09, p.accent);
            this.lid.position.set(0, 1.05, -D * 0.4); this.bodyGroup.add(this.lid);
            this.mouth = new THREE.Mesh(new THREE.BoxGeometry(W * 0.7, 0.18, 0.12), this._mat(0x300808, 1.0, 0.6));
            this.mouth.position.set(0, 1.04, D * 0.25); this.bodyGroup.add(this.mouth);
            this.teeth = new THREE.Group();
            const toothMat = this._mat(0xece8d8, 1.0, 0.4);
            for (let i = 0; i < 7; i++) {
                const tx = -W * 0.3 + i * (W * 0.6 / 6);
                const tu = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 4), toothMat);
                tu.position.set(tx, 1.1, D * 0.32); tu.rotation.x = Math.PI; this.teeth.add(tu);
                const td = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 4), toothMat);
                td.position.set(tx, 0.99, D * 0.32); this.teeth.add(td);
            }
            this.bodyGroup.add(this.teeth);
            this.tongue = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.3), this._mat(0xb04a5a, 1.0, 0.5));
            this.tongue.position.set(0, 1.02, D * 0.4); this.tongue.rotation.x = 0.4; this.bodyGroup.add(this.tongue);
            this.feet = new THREE.Group();
            const footMat = this._mat(0x241a10, 1.0, 0.8);
            for (const fx of [-0.26, 0.26]) {
                const foot = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.4), footMat);
                foot.position.set(fx, 0.0, 0.05); this.feet.add(foot);
            }
            this.bodyGroup.add(this.feet);
            this._partMeshMap = { CORE: this.body, LID: this.lid, TEETH: this.teeth, TONGUE: this.tongue, FEET: this.feet };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.body, this.lid, this.teeth, this.tongue, this.mouth, this.feet] },
                { gone: ['LID'], hide: [this.lid] },
                { gone: ['TEETH'], hide: [this.teeth] },
                { gone: ['TONGUE'], hide: [this.tongue] },
                { gone: ['FEET'], hide: [this.feet] },
            ];
        }

        // ── Baptism font: a stone basin brimming with acidic tears ───────────
        _buildBaptismFont() {
            const p = this.profile;
            const stoneMat = this._skinMat(p.bodyColor, 0.85);
            const acidMat = this._mat(p.accent, 0.85, 0.25, p.accent);
            this.feet = new THREE.Group();
            const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.22, 16), stoneMat);
            foot.position.y = 0.11; this.feet.add(foot); this.bodyGroup.add(this.feet);
            this.body = new THREE.Group(); // column + basin (CORE)
            const column = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.32, 0.95, 14), stoneMat);
            column.position.y = 0.72; this.body.add(column);
            const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.4, 0.34, 18), stoneMat);
            basin.position.y = 1.3; this.body.add(basin);
            const rimLip = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 18), stoneMat);
            rimLip.position.y = 1.44; this.body.add(rimLip);
            this.bodyGroup.add(this.body);
            this.lid = new THREE.Group(); // acidic water surface + reflected eyes
            this.water = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 20), acidMat);
            this.water.position.y = 1.46; this.lid.add(this.water);
            this._eye(this.lid, -0.16, 1.52, 0.16, 0.07, p.accent);
            this._eye(this.lid, 0.16, 1.52, 0.16, 0.07, p.accent);
            this.bodyGroup.add(this.lid);
            this.teeth = new THREE.Group(); // gothic rim spikes
            for (let i = 0; i < 10; i++) {
                const a = (i / 10) * Math.PI * 2;
                const sp = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 5), stoneMat);
                sp.position.set(Math.cos(a) * 0.58, 1.55, Math.sin(a) * 0.58); this.teeth.add(sp);
            }
            this.bodyGroup.add(this.teeth);
            this.tongue = new THREE.Group(); // reaching acid tendril
            let py = 0;
            for (let s = 0; s < 5; s++) {
                const seg = new THREE.Mesh(new THREE.SphereGeometry(0.11 - s * 0.016, 10, 10), acidMat);
                seg.position.set(0, py, 0); py += 0.15; this.tongue.add(seg);
            }
            this.tongue.position.set(0, 1.48, 0.1); this.bodyGroup.add(this.tongue);
            this.halo = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.025, 8, 24), this._mat(0xfff0b0, 0.8, 0.3, 0xffe080));
            this.halo.position.y = 2.0; this.halo.rotation.x = Math.PI / 2;
            this.bodyGroup.add(this.halo); this._floaters.push(this.halo);
            this._partMeshMap = { CORE: this.body, LID: this.lid, TEETH: this.teeth, TONGUE: this.tongue, FEET: this.feet };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.body, this.lid, this.teeth, this.tongue, this.halo, this.feet] },
                { gone: ['LID'], hide: [this.lid] },
                { gone: ['TEETH'], hide: [this.teeth] },
                { gone: ['TONGUE'], hide: [this.tongue] },
                { gone: ['FEET'], hide: [this.feet] },
            ];
        }

        // ── Rotating sawblade: a spinning disc with a fixed staring eye ──────
        // Source enemy uses the Spherical archetype:
        // CORE/SHELL/SENSOR_ARRAY/SPIN_SPINES/AUX_DRIVES.
        _buildSawblade() {
            const p = this.profile;
            const steelMat = this._skinMat(p.bodyColor, 0.3);
            this.bladeSpin = new THREE.Group();
            this.bladeSpin.position.y = 1.25;
            this.shell = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.07, 36), steelMat);
            this.shell.rotation.x = Math.PI / 2; this.bladeSpin.add(this.shell);
            this.spinSpines = new THREE.Group();
            const teethN = 18;
            for (let i = 0; i < teethN; i++) {
                const a = (i / teethN) * Math.PI * 2;
                const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 4), steelMat);
                tooth.position.set(Math.cos(a) * 0.8, Math.sin(a) * 0.8, 0);
                tooth.rotation.z = a - Math.PI / 2; this.spinSpines.add(tooth);
            }
            this.bladeSpin.add(this.spinSpines);
            this.core = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 16), this._mat(0x444a52, 1.0, 0.4));
            this.core.rotation.x = Math.PI / 2; this.bladeSpin.add(this.core);
            this.auxDrives = new THREE.Group();
            const boltMat = this._mat(0x6a7079, 1.0, 0.35);
            for (let i = 0; i < 5; i++) {
                const a = (i / 5) * Math.PI * 2;
                const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.1, 6), boltMat);
                bolt.position.set(Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0.04);
                bolt.rotation.x = Math.PI / 2; this.auxDrives.add(bolt);
            }
            this.bladeSpin.add(this.auxDrives);
            this.bodyGroup.add(this.bladeSpin);
            this.sensorArray = new THREE.Group(); // hub eye, does NOT spin
            this._eye(this.sensorArray, 0, 0, 0.12, 0.16, p.accent);
            this.sensorArray.position.set(0, 1.25, 0.02); this.bodyGroup.add(this.sensorArray);
            this.body = this.core; // alias so generic helpers see a body
            this._partMeshMap = { CORE: this.core, SHELL: this.shell, SENSOR_ARRAY: this.sensorArray, SPIN_SPINES: this.spinSpines, AUX_DRIVES: this.auxDrives };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.bladeSpin, this.sensorArray] },
                { gone: ['SHELL'], hide: [this.shell] },
                { gone: ['SENSOR_ARRAY'], hide: [this.sensorArray] },
                { gone: ['SPIN_SPINES'], hide: [this.spinSpines] },
                { gone: ['AUX_DRIVES'], hide: [this.auxDrives] },
            ];
        }

        // ── Hair ball: a matted tumbleweed of a hundred people's hair ────────
        _buildHairBall() {
            const p = this.profile;
            const coreMat = this._skinMat(p.bodyColor, 0.85);
            const hairCols = [0x2a1a10, 0x140f0c, 0x5a3a22, 0x7a5a38, 0x3a2a20, 0x8a7a50, 0x6a6a6a];
            const rndDir = () => new THREE.Vector3(this.idRand() * 2 - 1, this.idRand() * 2 - 1, this.idRand() * 2 - 1);
            const strand = (group, dir, len, rad) => {
                const c = hairCols[Math.floor(this.idRand() * hairCols.length)];
                const seg = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.4, rad, len, 4), this._mat(c, 1.0, 0.85));
                const d = dir.clone().normalize();
                seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
                seg.position.copy(d.clone().multiplyScalar(0.4 + len * 0.5)).add(new THREE.Vector3(0, 0.95, 0));
                group.add(seg);
            };
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 14), coreMat); // inner ball (CORE)
            this.body.position.y = 0.95; this.bodyGroup.add(this.body);
            this.core = this.body;
            this.shell = new THREE.Group(); // matted hair layer
            for (let i = 0; i < 46; i++) strand(this.shell, rndDir(), 0.18 + this.idRand() * 0.22, 0.02);
            this.bodyGroup.add(this.shell);
            this.spinSpines = new THREE.Group(); // long sticking-out tufts
            for (let i = 0; i < 9; i++) strand(this.spinSpines, rndDir(), 0.45 + this.idRand() * 0.3, 0.025);
            this.bodyGroup.add(this.spinSpines);
            this.auxDrives = new THREE.Group(); // short fuzz
            for (let i = 0; i < 24; i++) strand(this.auxDrives, rndDir(), 0.1 + this.idRand() * 0.12, 0.018);
            this.bodyGroup.add(this.auxDrives);
            this.sensorArray = new THREE.Group(); // peeking eyes
            for (let i = 0; i < 4; i++) {
                const d = rndDir().normalize().multiplyScalar(0.4);
                this._eye(this.sensorArray, d.x, 0.95 + d.y, Math.abs(d.z) + 0.05, 0.07 + this.idRand() * 0.03, p.accent);
            }
            this.bodyGroup.add(this.sensorArray);
            this._partMeshMap = { CORE: this.core, SHELL: this.shell, SENSOR_ARRAY: this.sensorArray, SPIN_SPINES: this.spinSpines, AUX_DRIVES: this.auxDrives };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.shell, this.spinSpines, this.auxDrives, this.sensorArray] },
                { gone: ['SHELL'], hide: [this.shell] },
                { gone: ['SENSOR_ARRAY'], hide: [this.sensorArray] },
                { gone: ['SPIN_SPINES'], hide: [this.spinSpines] },
                { gone: ['AUX_DRIVES'], hide: [this.auxDrives] },
            ];
        }

        // Small glowing orb that we track for orbit/pulse animation.
        _orb(r, color, list) {
            const o = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 12), this._mat(color, 0.85, 0.2, color));
            o.userData.orbit = true;   // drifts free of the body by design
            (list || this._floaters).push(o); this.bodyGroup.add(o); return o;
        }

        // ── Tide Sculptor: amphibian water-mage with orbiting water constructs ─
        // Amphibian rig: HEAD(vital) / TORSO(vital) / TONGUE / LEFT_LEG / RIGHT_LEG.
        _buildTideSculptor() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.35);
            const robe = this._mat(0x1e5f80, 0.9, 0.4, 0x10384a);
            // Flowing water-mantle robe (TORSO).
            this.body = new THREE.Group();
            const mantle = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.5, 14), robe); mantle.position.y = 0.75; this.body.add(mantle);
            const collar = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.08, 8, 16), this._mat(p.accent, 0.8, 0.2, p.accent)); collar.position.y = 1.42; collar.rotation.x = Math.PI / 2; this.body.add(collar);
            this.bodyGroup.add(this.body);
            // Amphibian head: smooth dome, wide bulbous eyes, slit mouth.
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 14), skin); skull.scale.set(1.0, 0.85, 1.05); this.head.add(skull);
            this._eye(this.head, -0.16, 0.1, 0.22, 0.11, 0x0a2a12); this._eye(this.head, 0.16, 0.1, 0.22, 0.11, 0x0a2a12);
            this.mouth = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, 0.05), this._mat(0x09202a, 1.0, 0.5)); this.mouth.position.set(0, -0.14, 0.28); this.head.add(this.mouth);
            this.head.position.y = 1.75; this.bodyGroup.add(this.head);
            // Webbed legs peeking from the mantle.
            const legMat = skin;
            this.leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.4, 8), legMat); this.leftLeg.position.set(-0.18, 0.2, 0.05); this.bodyGroup.add(this.leftLeg);
            this.rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.4, 8), legMat); this.rightLeg.position.set(0.18, 0.2, 0.05); this.bodyGroup.add(this.rightLeg);
            // Water-jet tongue/whip the sculptor lashes with.
            this.tongue = new THREE.Group();
            let ty = 0; for (let s = 0; s < 5; s++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.09 - s * 0.013, 10, 10), this._mat(p.accent, 0.75, 0.2, p.accent)); seg.position.y = ty; ty += 0.18; this.tongue.add(seg); }
            this.tongue.position.set(0, 1.6, 0.32); this.tongue.rotation.x = 1.2; this.bodyGroup.add(this.tongue);
            // Orbiting aquatic-construct orbs.
            this.waterOrbs = [];
            for (let i = 0; i < 4; i++) { const o = this._orb(0.1 + this.idRand() * 0.05, p.accent, this.waterOrbs); o._a = (i / 4) * Math.PI * 2; o._r = 0.7 + this.idRand() * 0.2; o._h = 1.0 + this.idRand() * 0.7; }
            this._partMeshMap = { HEAD: this.head, EYE: this.head, EYES: this.head, TORSO: this.body, BODY: this.body, CORE: this.body, TONGUE: this.tongue, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg };
            this._cascadeRules = [
                { gone: ['TORSO', 'BODY', 'CORE'], hide: [this.body, this.head, this.tongue, this.leftLeg, this.rightLeg, ...this.waterOrbs] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['TONGUE'], hide: [this.tongue] },
                { gone: ['LEFT_LEG'], hide: [this.leftLeg] },
                { gone: ['RIGHT_LEG'], hide: [this.rightLeg] },
            ];
        }

        // ── Forest Centaur: elf torso on a stag body, drawing a longbow ───────
        // Centaur rig: HEAD(vital)/TORSO/LEFT_ARM/RIGHT_ARM/BODY/LEFT_LEG/RIGHT_LEG/REAR_LEFT_LEG/REAR_RIGHT_LEG.
        _buildForestCentaur() {
            const p = this.profile;
            const hide = this._skinMat(p.bodyColor, 0.7);
            const flesh = this._mat(0xc89a72, 1.0, 0.6);
            const cloth = this._mat(0x2f5a32, 1.0, 0.7);
            const woodMat = this._mat(0x5a3a1e, 1.0, 0.6);
            // Equine barrel (BODY) + neck up to the human waist.
            this.body = new THREE.Group();
            const barrel = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.0, 6, 12), hide); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 1.0, -0.1); this.body.add(barrel);
            const chest = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 12), hide); chest.position.set(0, 1.1, 0.5); chest.scale.set(0.9, 1.0, 0.8); this.body.add(chest);
            this.bodyGroup.add(this.body);
            // Human torso rising from the withers.
            this.torso = new THREE.Group();
            const abdomen = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.55, 10), cloth); this.torso.add(abdomen);
            const tunic = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12), cloth); tunic.position.y = 0.3; tunic.scale.set(1.0, 0.9, 0.7); this.torso.add(tunic);
            this.torso.position.set(0, 1.55, 0.5); this.bodyGroup.add(this.torso);
            // Elf head with antlers + long ears.
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 14), flesh); skull.scale.set(0.92, 1.05, 0.95); this.head.add(skull);
            this._eye(this.head, -0.08, 0.02, 0.16, 0.045, 0x2a5a2a); this._eye(this.head, 0.08, 0.02, 0.16, 0.045, 0x2a5a2a);
            for (const s of [-1, 1]) {
                const ear = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22, 5), flesh); ear.position.set(s * 0.2, 0.05, 0); ear.rotation.z = -s * 1.1; this.head.add(ear);
                const antler = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.45, 5), woodMat); antler.position.set(s * 0.1, 0.28, -0.02); antler.rotation.z = -s * 0.4; this.head.add(antler);
                const branch = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.2, 4), woodMat); branch.position.set(s * 0.2, 0.42, -0.02); branch.rotation.z = -s * 0.9; this.head.add(branch);
            }
            this.head.position.set(0, 2.05, 0.5); this.bodyGroup.add(this.head);
            // Arms: left grips the bow, right draws the string.
            this.leftArm = new THREE.Group();
            const lUp = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.5, 8), flesh); lUp.position.set(0, -0.2, 0); this.leftArm.add(lUp);
            this.bow = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.025, 6, 18, Math.PI * 1.2), woodMat); this.bow.position.set(0, -0.42, 0.18); this.bow.rotation.set(0, Math.PI / 2, Math.PI / 2); this.leftArm.add(this.bow);
            const string = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.92, 4), this._mat(0xe8e0c0, 1.0, 0.5)); string.position.set(0, -0.42, 0.16); this.leftArm.add(string);
            this.leftArm.position.set(-0.34, 1.7, 0.55); this.leftArm.rotation.z = 0.3; this.bodyGroup.add(this.leftArm);
            this.rightArm = new THREE.Group();
            const rUp = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.5, 8), flesh); rUp.position.set(0, -0.2, 0); this.rightArm.add(rUp);
            this.arrow = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 5), woodMat); this.arrow.rotation.x = Math.PI / 2; this.arrow.position.set(0, -0.34, 0.18); this.rightArm.add(this.arrow);
            this.rightArm.position.set(0.3, 1.7, 0.45); this.rightArm.rotation.z = -0.3; this.bodyGroup.add(this.rightArm);
            // Four stag legs, each hung from a hip pivot inside the barrel so a
            // stride swings it about the hip instead of about its own middle.
            const leg = (x, z) => { const l = new THREE.Group(); const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.04, 0.95, 8), hide); m.position.y = -0.475; l.add(m); l.position.set(x, 0.955, z); this.bodyGroup.add(l); return l; };
            this.leftLeg = leg(-0.28, 0.45); this.rightLeg = leg(0.28, 0.45);
            this.rearLeftLeg = leg(-0.28, -0.6); this.rearRightLeg = leg(0.28, -0.6);
            this._partMeshMap = { HEAD: this.head, EYE: this.head, TORSO: this.torso, BODY: this.body, LEFT_ARM: this.leftArm, RIGHT_ARM: this.rightArm, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg, REAR_LEFT_LEG: this.rearLeftLeg, REAR_RIGHT_LEG: this.rearRightLeg };
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.body, this.torso, this.head, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg, this.rearLeftLeg, this.rearRightLeg] },
                { gone: ['TORSO'], hide: [this.torso, this.head, this.leftArm, this.rightArm] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['LEFT_ARM'], hide: [this.leftArm] },
                { gone: ['RIGHT_ARM'], hide: [this.rightArm] },
                { gone: ['LEFT_LEG'], hide: [this.leftLeg] },
                { gone: ['RIGHT_LEG'], hide: [this.rightLeg] },
                { gone: ['REAR_LEFT_LEG'], hide: [this.rearLeftLeg] },
                { gone: ['REAR_RIGHT_LEG'], hide: [this.rearRightLeg] },
            ];
        }

        // ── Obsidian Visionary: floating robed seer, crystal eye, glass shards ─
        // DarkElemental rig: CORE(vital)/BODY/LEFT_ARM/RIGHT_ARM/LEFT_LEG/RIGHT_LEG.
        _buildObsidianVisionary() {
            const p = this.profile;
            const robe = this._skinMat(p.bodyColor, 0.45);
            const glass = this._mat(0x20141c, 0.92, 0.15, 0x140a10);
            // Tapered robe (BODY) tapering into a wispy hem instead of feet.
            this.body = new THREE.Group();
            const lower = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.7, 12), robe); lower.position.y = 0.85; this.body.add(lower);
            const hood = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 14, 0, Math.PI * 2, 0, Math.PI * 0.6), robe); hood.position.y = 1.7; hood.scale.set(1.0, 1.2, 1.0); this.body.add(hood);
            this.bodyGroup.add(this.body);
            // CORE: the single glowing scrying eye in the cowl.
            this.core = new THREE.Group();
            const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 14), this._mat(0xffe2c0, 0.95, 0.2)); this.core.add(sclera);
            const iris = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12), this._mat(p.accent, 1.0, 0.2, p.accent)); iris.position.z = 0.1; this.core.add(iris);
            this.core.position.set(0, 1.62, 0.22); this.bodyGroup.add(this.core);
            // Shadow sleeves.
            this.leftArm = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.7, 8), robe); this.leftArm.position.set(-0.42, 1.1, 0.1); this.leftArm.rotation.z = 0.5; this.bodyGroup.add(this.leftArm);
            this.rightArm = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.7, 8), robe); this.rightArm.position.set(0.42, 1.1, 0.1); this.rightArm.rotation.z = -0.5; this.bodyGroup.add(this.rightArm);
            // Wispy hem folds standing in for legs.
            this.leftLeg = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 6), robe); this.leftLeg.position.set(-0.16, 0.1, 0.06); this.bodyGroup.add(this.leftLeg);
            this.rightLeg = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 6), robe); this.rightLeg.position.set(0.16, 0.1, 0.06); this.bodyGroup.add(this.rightLeg);
            // Orbiting obsidian shards (volcanic glass).
            this.shards = [];
            for (let i = 0; i < 7; i++) {
                const sh = new THREE.Mesh(new THREE.TetrahedronGeometry(0.12 + this.idRand() * 0.08), glass);
                sh.userData.orbit = true; sh._a = (i / 7) * Math.PI * 2; sh._r = 0.75 + this.idRand() * 0.3; sh._h = 0.8 + this.idRand() * 1.1; sh._sp = 0.6 + this.idRand() * 0.6;
                this.shards.push(sh); this.bodyGroup.add(sh);
            }
            this._partMeshMap = { CORE: this.core, EYE: this.core, BODY: this.body, LEFT_ARM: this.leftArm, RIGHT_ARM: this.rightArm, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.body, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg, ...this.shards] },
                { gone: ['BODY'], hide: [this.body, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg] },
                { gone: ['LEFT_ARM'], hide: [this.leftArm] },
                { gone: ['RIGHT_ARM'], hide: [this.rightArm] },
                { gone: ['LEFT_LEG'], hide: [this.leftLeg] },
                { gone: ['RIGHT_LEG'], hide: [this.rightLeg] },
            ];
        }

        // ── Ochre Jelly Swarm: amber gel mass lashing stinging pseudopods ─────
        // Jellyfish has no health rig -> defaults to Humanoid keys; map both sets.
        _buildOchreJelly() {
            const p = this.profile;
            const gel = this._mat(p.bodyColor, 0.6, 0.15, 0x6a4a10); gel.transparent = true;
            // Main gelatinous mass (TORSO/BODY/CORE).
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 14), gel); this.body.position.y = 0.85; this.body.scale.set(1.1, 0.9, 1.1); this.bodyGroup.add(this.body);
            // Suspended undigested debris.
            for (let i = 0; i < 6; i++) { const d = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), this._mat(0x5a4018, 1.0, 0.7)); d.position.set((this.idRand() - 0.5) * 0.7, 0.85 + (this.idRand() - 0.5) * 0.6, (this.idRand() - 0.5) * 0.6); d.rotation.set(this.idRand() * 6, this.idRand() * 6, this.idRand() * 6); this.body.add(d); }
            // Top bulge head with two suspended eyes.
            this.head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 12), gel); this.head.position.y = 1.45; this.bodyGroup.add(this.head);
            this._eye(this.head, -0.13, 0.04, 0.24, 0.08, 0xaa3300); this._eye(this.head, 0.13, 0.04, 0.24, 0.08, 0xaa3300);
            // Four lashing pseudopods mapped to the humanoid limb keys.
            const pseudo = (x, z) => {
                const g = new THREE.Group(); let py = 0;
                for (let s = 0; s < 4; s++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.13 - s * 0.025, 10, 10), gel); seg.position.y = py; py -= 0.18; g.add(seg); }
                g.position.set(x, 0.75, z); this.bodyGroup.add(g); return g;
            };
            this.leftArm = pseudo(-0.55, 0.2); this.rightArm = pseudo(0.55, 0.2);
            this.leftLeg = pseudo(-0.3, -0.3); this.rightLeg = pseudo(0.3, -0.3);
            this._partMeshMap = { TORSO: this.body, BODY: this.body, CORE: this.body, HEAD: this.head, EYE: this.head, LEFT_ARM: this.leftArm, RIGHT_ARM: this.rightArm, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg };
            this._cascadeRules = [
                { gone: ['TORSO', 'BODY', 'CORE'], hide: [this.body, this.head, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['LEFT_ARM'], hide: [this.leftArm] },
                { gone: ['RIGHT_ARM'], hide: [this.rightArm] },
                { gone: ['LEFT_LEG'], hide: [this.leftLeg] },
                { gone: ['RIGHT_LEG'], hide: [this.rightLeg] },
            ];
        }

        // ── Barbed Manticore: volcanic lion, leather wings, barbed stinger tail ─
        // Manticore rig: BRAIN(vital)/SKULL/SPINE/RIBCAGE/FRONT_*_PAW/REAR_*_LEG/
        // LEFT_EYE/RIGHT_EYE/LEFT_WING/RIGHT_WING/LEFT_LUNG/RIGHT_LUNG.
        _buildBarbedManticore() {
            const p = this.profile;
            const fur = this._skinMat(p.bodyColor, 0.75);
            const mane = this._mat(0x3a140e, 1.0, 0.85);
            const membrane = this._mat(0x4a1810, 0.92, 0.6, 0x200804);
            const chitin = this._mat(0x2a1410, 1.0, 0.4);
            // Lion body (SPINE / RIBCAGE / lungs).
            this.body = new THREE.Group();
            const barrel = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1.2, 6, 12), fur); barrel.rotation.z = Math.PI / 2; barrel.position.set(0, 1.0, 0); this.body.add(barrel);
            const haunch = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 12), fur); haunch.position.set(-0.75, 1.0, 0); haunch.scale.set(0.9, 1.0, 1.0); this.body.add(haunch);
            this.bodyGroup.add(this.body);
            // Maned head (SKULL / BRAIN) with glowing eyes.
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 14), fur); skull.scale.set(0.95, 0.9, 1.05); this.head.add(skull);
            const maneRing = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.16, 8, 18), mane); maneRing.position.z = -0.08; this.head.add(maneRing);
            const muzzle = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.34, 10), fur); muzzle.rotation.x = Math.PI / 2; muzzle.position.set(0, -0.05, 0.32); this.head.add(muzzle);
            this.leftEye = this._eye(this.head, -0.13, 0.08, 0.28, 0.06, p.accent); this.rightEye = this._eye(this.head, 0.13, 0.08, 0.28, 0.06, p.accent);
            for (const s of [-1, 1]) { const fang = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 4), this._mat(0xf0e8d0, 1.0, 0.4)); fang.position.set(s * 0.06, -0.16, 0.42); fang.rotation.x = Math.PI; this.head.add(fang); }
            this.head.position.set(0.78, 1.25, 0); this.bodyGroup.add(this.head);
            // Four legs.
            const leg = (x, z) => { const g = new THREE.Group(); const up = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.6, 8), fur); up.position.y = -0.3; g.add(up); const paw = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), fur); paw.position.y = -0.62; paw.scale.set(1.1, 0.7, 1.2); g.add(paw); g.position.set(x, 0.95, z); this.bodyGroup.add(g); return g; };
            this.flPaw = leg(0.55, 0.3); this.frPaw = leg(0.55, -0.3);
            this.rlLeg = leg(-0.55, 0.3); this.rrLeg = leg(-0.55, -0.3);
            // Leathery wings.
            const wing = (s) => { const g = new THREE.Group(); const w = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.3, 3), membrane); w.scale.set(1, 1, 0.05); w.rotation.z = s * 1.0; w.position.set(s * 0.45, 0.3, 0); g.add(w); g.position.set(-0.1, 1.55, -0.3); g._s = s; this.bodyGroup.add(g); return g; };
            this.lWing = wing(-1); this.rWing = wing(1);
            // Segmented barbed scorpion tail with a venom stinger.
            this.tail = new THREE.Group();
            let tx = -0.9, ty = 1.1; const tail = this.tail;
            for (let i = 0; i < 6; i++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.16 - i * 0.012, 10, 10), chitin); seg.position.set(tx, ty, 0); tail.add(seg); const barb = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 4), chitin); barb.position.set(tx, ty + 0.14, 0); barb.rotation.x = -0.4; tail.add(barb); tx -= 0.16; ty += 0.22; }
            this.stinger = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 8), this._mat(p.accent, 1.0, 0.3, p.accent)); this.stinger.position.set(tx + 0.05, ty, 0); this.stinger.rotation.z = 0.8; tail.add(this.stinger);
            this.bodyGroup.add(this.tail);
            this._partMeshMap = { SPINE: this.body, RIBCAGE: this.body, LEFT_LUNG: this.body, RIGHT_LUNG: this.body, SKULL: this.head, BRAIN: this.head, LEFT_EYE: this.leftEye, RIGHT_EYE: this.rightEye, FRONT_LEFT_PAW: this.flPaw, FRONT_RIGHT_PAW: this.frPaw, REAR_LEFT_LEG: this.rlLeg, REAR_RIGHT_LEG: this.rrLeg, LEFT_WING: this.lWing, RIGHT_WING: this.rWing, TAIL: this.tail };
            this._cascadeRules = [
                { gone: ['SPINE', 'RIBCAGE'], hide: [this.body, this.head, this.flPaw, this.frPaw, this.rlLeg, this.rrLeg, this.lWing, this.rWing, this.tail] },
                { gone: ['SKULL', 'BRAIN'], hide: [this.head] },
                { gone: ['FRONT_LEFT_PAW'], hide: [this.flPaw] },
                { gone: ['FRONT_RIGHT_PAW'], hide: [this.frPaw] },
                { gone: ['REAR_LEFT_LEG'], hide: [this.rlLeg] },
                { gone: ['REAR_RIGHT_LEG'], hide: [this.rrLeg] },
                { gone: ['LEFT_WING'], hide: [this.lWing] },
                { gone: ['RIGHT_WING'], hide: [this.rWing] },
            ];
        }

        // ── Noble Guardian: heavily armed bipedal war mech with an arm cannon ──
        // RoboticDefender rig: HEAD/ARM_CANNON/TORSO/LEG_JOINTS/SENSORS.
        _buildNobleGuardian() {
            const p = this.profile;
            const plate = this._skinMat(p.bodyColor, 0.35);
            const dark = this._mat(0x2c3038, 1.0, 0.4);
            const trim = this._mat(0xc8a44a, 1.0, 0.3, 0x3a2c10);
            // Armored torso (TORSO).
            this.body = new THREE.Group();
            const chest = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.85, 0.65), plate); chest.position.y = 1.55; this.body.add(chest);
            const core = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 12), this._mat(p.accent, 1.0, 0.2, p.accent)); core.rotation.x = Math.PI / 2; core.position.set(0, 1.55, 0.34); this.body.add(core); this._reactor = core;
            const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.55), dark); pelvis.position.y = 1.0; this.body.add(pelvis);
            const lPauld = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), plate); lPauld.position.set(-0.6, 1.85, 0); lPauld.scale.set(1, 0.8, 1); this.body.add(lPauld);
            this.bodyGroup.add(this.body);
            // Head + SENSORS visor.
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.4, 0.42), plate); this.head.add(skull);
            const crest = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.34, 0.1), trim); crest.position.set(0, 0.32, 0); this.head.add(crest);
            this.head.position.y = 2.15; this.bodyGroup.add(this.head);
            this.sensors = new THREE.Group();
            const visor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.06), this._mat(p.accent, 1.0, 0.2, p.accent)); visor.position.set(0, 2.16, 0.23); this.sensors.add(visor); this._visor = visor;
            this.bodyGroup.add(this.sensors);
            // Left forearm (decorative shield fist).
            this.leftArm = new THREE.Group();
            const lArm = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.7, 10), dark); lArm.position.y = -0.35; this.leftArm.add(lArm);
            const fist = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), plate); fist.position.y = -0.72; this.leftArm.add(fist);
            this.leftArm.position.set(-0.6, 1.7, 0.05); this.bodyGroup.add(this.leftArm);
            // ARM_CANNON: big shoulder-mounted barrel on the right.
            this.cannon = new THREE.Group();
            const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), plate); shoulder.position.set(0, 0.15, 0); this.cannon.add(shoulder);
            const housing = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.55), dark); housing.position.set(0, 0, 0.3); this.cannon.add(housing);
            const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.8, 12), this._mat(0x1c1e22, 1.0, 0.4)); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0, 0.75); this.cannon.add(barrel);
            this._muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.04, 6, 14), this._mat(p.accent, 0.9, 0.3, p.accent)); this._muzzle.position.set(0, 0, 1.12); this.cannon.add(this._muzzle);
            this.cannon.position.set(0.62, 1.75, 0); this.bodyGroup.add(this.cannon);
            // LEG_JOINTS: two armored legs.
            this.legs = new THREE.Group();
            const mkLeg = (x) => { const g = new THREE.Group(); const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.55, 8), dark); thigh.position.y = 0.65; g.add(thigh); const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.55, 8), plate); shin.position.y = 0.18; g.add(shin); const foot = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.42), dark); foot.position.set(0, -0.06, 0.08); g.add(foot); g.position.set(x, 0, 0); this.legs.add(g); return g; };
            mkLeg(-0.24); mkLeg(0.24); this.bodyGroup.add(this.legs);
            this._partMeshMap = { TORSO: this.body, HEAD: this.head, SENSORS: this.sensors, ARM_CANNON: this.cannon, LEG_JOINTS: this.legs, LEFT_ARM: this.leftArm };
            this._cascadeRules = [
                { gone: ['TORSO'], hide: [this.body, this.head, this.sensors, this.cannon, this.leftArm, this.legs] },
                { gone: ['HEAD'], hide: [this.head, this.sensors] },
                { gone: ['SENSORS'], hide: [this.sensors] },
                { gone: ['ARM_CANNON'], hide: [this.cannon] },
                { gone: ['LEG_JOINTS'], hide: [this.legs] },
            ];
        }

        // ── Forest Archer: hooded leaf-camo ambush archer drawing a longbow ───
        // SacredElemental rig: CORE(vital)/BODY/LEFT_ARM/RIGHT_ARM/LEFT_LEG/RIGHT_LEG.
        _buildForestArcher() {
            const p = this.profile;
            const cloak = this._skinMat(p.bodyColor, 0.85);
            const leather = this._mat(0x5a4226, 1.0, 0.7);
            const flesh = this._mat(0xb8906a, 1.0, 0.6);
            const woodMat = this._mat(0x4a3018, 1.0, 0.6);
            // CORE: chest/torso core. BODY: hooded cloak shell.
            this.core = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.85, 10), leather); this.core.position.y = 1.25; this.bodyGroup.add(this.core);
            this.body = new THREE.Group();
            const cape = new THREE.Mesh(new THREE.ConeGeometry(0.46, 1.4, 10, 1, true), cloak); cape.position.y = 1.0; this.body.add(cape);
            // Leafy fringe on the cloak.
            for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 4), this._mat(0x4f7a32, 1.0, 0.7)); leaf.position.set(Math.cos(a) * 0.42, 0.5 + this.idRand() * 0.5, Math.sin(a) * 0.42); leaf.rotation.set(this.idRand() * 6, 0, this.idRand() * 6); this.body.add(leaf); }
            const hood = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.5, 10), cloak); hood.position.y = 1.95; this.body.add(hood);
            const face = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), flesh); face.position.y = 1.85; face.scale.set(0.9, 1.0, 0.9); this.body.add(face);
            this._eye(this.body, -0.07, 1.86, 0.15, 0.035, 0x2a5a2a); this._eye(this.body, 0.07, 1.86, 0.15, 0.035, 0x2a5a2a);
            this.bodyGroup.add(this.body);
            // Arms: left holds the bow forward, right draws back the nocked arrow.
            this.leftArm = new THREE.Group();
            const lUp = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.6, 8), cloak); lUp.rotation.z = 1.3; lUp.position.set(-0.2, 0, 0.2); this.leftArm.add(lUp);
            this.bow = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.028, 6, 20, Math.PI * 1.25), woodMat); this.bow.position.set(-0.42, 0, 0.42); this.bow.rotation.set(0, Math.PI / 2, Math.PI / 2); this.leftArm.add(this.bow);
            this.string = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1.0, 4), this._mat(0xe8e0c0, 1.0, 0.5)); this.string.position.set(-0.42, 0, 0.4); this.leftArm.add(this.string);
            this.leftArm.position.set(0, 1.5, 0); this.bodyGroup.add(this.leftArm);
            this.rightArm = new THREE.Group();
            const rUp = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.55, 8), cloak); rUp.rotation.z = -0.9; rUp.position.set(0.22, -0.05, -0.05); this.rightArm.add(rUp);
            this.arrow = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.85, 5), woodMat); this.arrow.rotation.set(0, 0, Math.PI / 2); this.arrow.position.set(-0.05, 0.05, 0.32); this.rightArm.add(this.arrow);
            const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 4), this._mat(0xb0b8c0, 1.0, 0.3)); tip.rotation.z = -Math.PI / 2; tip.position.set(-0.5, 0.05, 0.32); this.rightArm.add(tip);
            this.rightArm.position.set(0, 1.5, 0); this.bodyGroup.add(this.rightArm);
            // Legs.
            this.leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.85, 8), leather); this.leftLeg.position.set(-0.16, 0.45, 0); this.bodyGroup.add(this.leftLeg);
            this.rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.85, 8), leather); this.rightLeg.position.set(0.16, 0.45, 0); this.bodyGroup.add(this.rightLeg);
            this._partMeshMap = { CORE: this.core, BODY: this.body, HEAD: this.body, LEFT_ARM: this.leftArm, RIGHT_ARM: this.rightArm, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.body, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg] },
                { gone: ['BODY'], hide: [this.body, this.leftArm, this.rightArm] },
                { gone: ['LEFT_ARM'], hide: [this.leftArm] },
                { gone: ['RIGHT_ARM'], hide: [this.rightArm] },
                { gone: ['LEFT_LEG'], hide: [this.leftLeg] },
                { gone: ['RIGHT_LEG'], hide: [this.rightLeg] },
            ];
        }

        // ── Majestic Enchantress: siren rising from a spiral shell, lure-lights ─
        // Snail rig: SHELL / BODY(vital) / TENTACLE_1 / TENTACLE_2 / EYE / FOOT.
        _buildEnchantress() {
            const p = this.profile;
            const flesh = this._skinMat(p.bodyColor, 0.4);
            const pearl = this._mat(0xe8d6e6, 0.95, 0.2, 0x201018);
            const footMat = this._mat(0x9a8ab0, 0.9, 0.5);
            // FOOT: gliding muscular base.
            this.foot = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, 1.0), footMat); this.foot.position.set(0, 0.12, 0.05); this.bodyGroup.add(this.foot);
            // SHELL: ornate iridescent spiral coil behind the siren.
            this.shell = new THREE.Group();
            let sr = 0.42, sa = 0, sy = 0.6;
            for (let i = 0; i < 9; i++) { const w = new THREE.Mesh(new THREE.SphereGeometry(sr, 12, 12), pearl); w.position.set(Math.cos(sa) * 0.18, sy, Math.sin(sa) * 0.18 - 0.5); this.shell.add(w); sr *= 0.84; sa += 1.1; sy += 0.12; }
            this.bodyGroup.add(this.shell);
            // BODY: graceful siren torso emerging from the aperture.
            this.body = new THREE.Group();
            const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.5, 10), flesh); waist.position.y = 0.55; this.body.add(waist);
            const bust = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), flesh); bust.position.y = 0.85; bust.scale.set(1.0, 0.85, 0.8); this.body.add(bust);
            this.body.position.set(0, 0.5, 0.2); this.bodyGroup.add(this.body);
            // Head + hypnotic EYE pair.
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 14), flesh); this.head.add(skull);
            this._eye(this.head, -0.07, 0.02, 0.15, 0.05, p.accent); this._eye(this.head, 0.07, 0.02, 0.15, 0.05, p.accent);
            // Trailing fin-like hair.
            for (let i = 0; i < 5; i++) { const a = -0.4 + i * 0.2; const str = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.5, 5), this._mat(0x7a4a8a, 0.9, 0.5)); str.position.set(Math.sin(a) * 0.16, -0.2, -0.16); str.rotation.x = -0.5; this.head.add(str); }
            this.head.position.set(0, 1.5, 0.2); this.bodyGroup.add(this.head);
            // Two flowing tentacle-arms.
            const tentacle = (s) => {
                const g = new THREE.Group(); let ty = 0, tx = 0;
                for (let i = 0; i < 6; i++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.1 - i * 0.012, 10, 10), flesh); seg.position.set(tx, ty, 0); g.add(seg); ty -= 0.02; tx += s * 0.12; ty += 0.16; }
                g.position.set(s * 0.22, 1.3, 0.2); this.bodyGroup.add(g); g._s = s; return g;
            };
            this.t1 = tentacle(-1); this.t2 = tentacle(1);
            // Hypnotic lure-lights drifting around her.
            this.lures = [];
            for (let i = 0; i < 5; i++) { const o = this._orb(0.07 + this.idRand() * 0.04, p.accent, this.lures); o._a = (i / 5) * Math.PI * 2; o._r = 0.6 + this.idRand() * 0.3; o._h = 0.9 + this.idRand() * 1.0; }
            this._partMeshMap = { SHELL: this.shell, BODY: this.body, CORE: this.body, TENTACLE_1: this.t1, TENTACLE_2: this.t2, EYE: this.head, HEAD: this.head, FOOT: this.foot };
            this._cascadeRules = [
                { gone: ['BODY', 'CORE'], hide: [this.body, this.head, this.t1, this.t2, this.shell, this.foot, ...this.lures] },
                { gone: ['SHELL'], hide: [this.shell] },
                { gone: ['EYE', 'HEAD'], hide: [this.head] },
                { gone: ['TENTACLE_1'], hide: [this.t1] },
                { gone: ['TENTACLE_2'], hide: [this.t2] },
                { gone: ['FOOT'], hide: [this.foot] },
            ];
        }

        // ── Ember Sprite / Frost Sylph: tiny elemental fairy (Fairy rig) ──────
        // Fairy rig: HEAD/TORSO/LEFT_ARM/RIGHT_ARM/LEFT_WING/RIGHT_WING/PIXIE_DUST_SAC.
        _buildSpriteFairy() {
            const p = this.profile, fire = !!p.fire;
            const glow = this._mat(p.bodyColor, 0.95, 0.2, p.bodyColor);
            const wingMat = this._mat(p.accent, 0.6, 0.2, p.accent);
            // Small glowing torso + head.
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), glow); this.body.position.y = 1.0; this.body.scale.set(0.8, 1.1, 0.8); this.bodyGroup.add(this.body);
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), glow); this.head.add(skull);
            this._eye(this.head, -0.06, 0.02, 0.12, 0.035, 0xffffff); this._eye(this.head, 0.06, 0.02, 0.12, 0.035, 0xffffff);
            this.head.position.y = 1.32; this.bodyGroup.add(this.head);
            // Thin limbs.
            this.leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.3, 6), glow); this.leftArm.position.set(-0.18, 0.95, 0); this.leftArm.rotation.z = 0.7; this.bodyGroup.add(this.leftArm);
            this.rightArm = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.3, 6), glow); this.rightArm.position.set(0.18, 0.95, 0); this.rightArm.rotation.z = -0.7; this.bodyGroup.add(this.rightArm);
            // Elemental wings: jagged flame cones vs faceted ice shards.
            const wing = (s) => {
                const g = new THREE.Group();
                if (fire) { for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5 - i * 0.1, 6), wingMat); f.position.set(s * 0.18, 0.1 + i * 0.12, -0.05); f.rotation.z = s * (0.4 + i * 0.2); g.add(f); } }
                else { for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(new THREE.OctahedronGeometry(0.16 - i * 0.03), wingMat); f.position.set(s * (0.18 + i * 0.1), 0.1 + i * 0.05, -0.05); g.add(f); } }
                g.position.set(0, 1.05, -0.1); g._s = s; this.bodyGroup.add(g); return g;
            };
            this.lWing = wing(-1); this.rWing = wing(1);
            // PIXIE_DUST_SAC: glowing ember/frost mote that trails sparks.
            this.dustSac = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), this._mat(p.accent, 0.9, 0.2, p.accent)); this.dustSac.position.set(0, 0.72, 0); this.bodyGroup.add(this.dustSac);
            this.sparks = [];
            for (let i = 0; i < 6; i++) { const sp = this._orb(0.03 + this.idRand() * 0.02, p.accent, this.sparks); sp._a = this.idRand() * 6.28; sp._r = 0.25 + this.idRand() * 0.25; sp._h = 0.7 + this.idRand() * 0.7; }
            this._partMeshMap = { HEAD: this.head, TORSO: this.body, BODY: this.body, CORE: this.body, LEFT_ARM: this.leftArm, RIGHT_ARM: this.rightArm, LEFT_WING: this.lWing, RIGHT_WING: this.rWing, PIXIE_DUST_SAC: this.dustSac };
            this._cascadeRules = [
                { gone: ['TORSO', 'BODY', 'CORE'], hide: [this.body, this.head, this.leftArm, this.rightArm, this.lWing, this.rWing, this.dustSac, ...this.sparks] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['LEFT_ARM'], hide: [this.leftArm] },
                { gone: ['RIGHT_ARM'], hide: [this.rightArm] },
                { gone: ['LEFT_WING'], hide: [this.lWing] },
                { gone: ['RIGHT_WING'], hide: [this.rWing] },
                { gone: ['PIXIE_DUST_SAC'], hide: [this.dustSac] },
            ];
        }

        // ── Flame Frake: a small fire drake (Dragon rig) ─────────────────────
        // Dragon rig: HEAD/FIRE_BREATH_ORGAN/NECK/BODY/LEFT_WING/RIGHT_WING/LEFT_LEG/RIGHT_LEG/TAIL.
        _buildFlameFrake() {
            const p = this.profile;
            const scale = this._skinMat(p.bodyColor, 0.45);
            const belly = this._mat(0xe8a850, 1.0, 0.5);
            const membrane = this._mat(0xd4602a, 0.9, 0.6, 0x5a1c08);
            // Compact body + arched neck.
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 12), scale); this.body.position.set(0, 0.95, 0); this.body.scale.set(1.0, 0.9, 1.3); this.bodyGroup.add(this.body);
            const bel = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), belly); bel.position.set(0, 0.82, 0.12); bel.scale.set(0.9, 0.8, 1.2); this.bodyGroup.add(bel);
            this.neck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, 0.6, 8), scale); this.neck.position.set(0.3, 1.25, 0.2); this.neck.rotation.z = -0.7; this.bodyGroup.add(this.neck);
            // Head with glowing FIRE_BREATH_ORGAN throat.
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), scale); skull.scale.set(1.0, 0.85, 1.2); this.head.add(skull);
            const snout = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 8), scale); snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.02, 0.26); this.head.add(snout);
            for (const s of [-1, 1]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22, 5), this._mat(0x3a2410, 1.0, 0.5)); horn.position.set(s * 0.1, 0.18, -0.05); horn.rotation.x = -0.5; this.head.add(horn); }
            this._eye(this.head, -0.11, 0.06, 0.16, 0.045, p.accent); this._eye(this.head, 0.11, 0.06, 0.16, 0.045, p.accent);
            this.head.position.set(0.55, 1.5, 0.35); this.bodyGroup.add(this.head);
            this.fireOrgan = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), this._mat(p.accent, 0.9, 0.2, p.accent)); this.fireOrgan.position.set(0, -0.06, 0.34); this.head.add(this.fireOrgan);
            // Wings.
            const wing = (s) => { const g = new THREE.Group(); const w = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.0, 3), membrane); w.scale.set(1, 1, 0.05); w.rotation.z = s * 1.1; w.position.set(s * 0.4, 0.25, 0); g.add(w); g.position.set(-0.05, 1.3, -0.2); g._s = s; this.bodyGroup.add(g); return g; };
            this.lWing = wing(-1); this.rWing = wing(1);
            // Legs.
            const leg = (x, z) => { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.06, 0.5, 8), scale); l.position.set(x, 0.45, z); this.bodyGroup.add(l); return l; };
            this.leftLeg = leg(-0.22, 0.18); this.rightLeg = leg(0.22, 0.18);
            // Tail.
            this.tail = new THREE.Group(); let tx = -0.35, ty = 0.9;
            for (let i = 0; i < 5; i++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.15 - i * 0.022, 8, 8), scale); seg.position.set(tx, ty, 0); this.tail.add(seg); tx -= 0.2; ty -= 0.08; }
            this.tailTip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 6), membrane); this.tailTip.position.set(tx, ty, 0); this.tailTip.rotation.z = 1.4; this.tail.add(this.tailTip);
            this.bodyGroup.add(this.tail);
            this._partMeshMap = { HEAD: this.head, FIRE_BREATH_ORGAN: this.fireOrgan, NECK: this.neck, BODY: this.body, LEFT_WING: this.lWing, RIGHT_WING: this.rWing, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg, TAIL: this.tail };
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.body, this.neck, this.head, this.fireOrgan, this.lWing, this.rWing, this.leftLeg, this.rightLeg, this.tail] },
                { gone: ['NECK'], hide: [this.neck, this.head, this.fireOrgan] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['FIRE_BREATH_ORGAN'], hide: [this.fireOrgan] },
                { gone: ['LEFT_WING'], hide: [this.lWing] },
                { gone: ['RIGHT_WING'], hide: [this.rWing] },
                { gone: ['LEFT_LEG'], hide: [this.leftLeg] },
                { gone: ['RIGHT_LEG'], hide: [this.rightLeg] },
                { gone: ['TAIL'], hide: [this.tail] },
            ];
        }

        // ── Flame Turret: automated heat-beam defense turret (Robot rig) ──────
        // Robot rig: HEAD/CORE/LEFT_ARM/RIGHT_ARM/LEFT_LEG/RIGHT_LEG.
        _buildFlameTurret() {
            const p = this.profile;
            const hull = this._skinMat(p.bodyColor, 0.4);
            const dark = this._mat(0x33302c, 1.0, 0.4);
            // Tripod base mapped to legs.
            const leg = (a) => { const g = new THREE.Group(); const l = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.7, 6), dark); l.position.set(Math.cos(a) * 0.3, 0.32, Math.sin(a) * 0.3); l.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); g.add(l); this.bodyGroup.add(g); return g; };
            this.leftLeg = leg(Math.PI * 0.5); this.rightLeg = leg(Math.PI * 1.17);
            const backLeg = leg(Math.PI * 1.83);
            // CORE: central reactor housing.
            this.core = new THREE.Group();
            const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.5, 10), hull); housing.position.y = 0.85; this.core.add(housing);
            const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.05, 8, 16), this._mat(p.accent, 0.9, 0.3, p.accent)); ring.position.y = 0.85; ring.rotation.x = Math.PI / 2; this.core.add(ring); this._coreRing = ring;
            this.bodyGroup.add(this.core);
            // HEAD: rotating barrel cluster turret.
            this.head = new THREE.Group();
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), hull); this.head.add(dome);
            this._eye(this.head, 0, 0.05, 0.28, 0.09, p.accent);
            this.barrels = new THREE.Group();
            for (const bx of [-0.12, 0, 0.12]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.55, 8), dark); b.rotation.x = Math.PI / 2; b.position.set(bx, -0.02, 0.4); this.barrels.add(b); }
            this._muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), this._mat(p.accent, 0.9, 0.2, p.accent)); this._muzzle.position.set(0, -0.02, 0.7); this.barrels.add(this._muzzle);
            this.head.add(this.barrels);
            this.head.position.y = 1.2; this.bodyGroup.add(this.head);
            // Side heat-vent arms.
            this.leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.3, 0.2), dark); this.leftArm.position.set(-0.42, 0.85, 0); this.bodyGroup.add(this.leftArm);
            this.rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.3, 0.2), dark); this.rightArm.position.set(0.42, 0.85, 0); this.bodyGroup.add(this.rightArm);
            this.body = this.core;
            this._partMeshMap = { HEAD: this.head, CORE: this.core, LEFT_ARM: this.leftArm, RIGHT_ARM: this.rightArm, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.head, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg, backLeg] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['LEFT_ARM'], hide: [this.leftArm] },
                { gone: ['RIGHT_ARM'], hide: [this.rightArm] },
                { gone: ['LEFT_LEG'], hide: [this.leftLeg] },
                { gone: ['RIGHT_LEG'], hide: [this.rightLeg] },
            ];
        }

        // ── Fluxling Furret: a prismatic mote phasing in and out (VoidSpawn) ──
        // VoidSpawn has no health rig -> Humanoid keys; map BODY/HEAD/limbs.
        _buildFluxlingFurret() {
            const p = this.profile;
            const flux = this._mat(p.bodyColor, 0.7, 0.15, p.bodyColor); flux.transparent = true;
            // Elongated ferret-like body of unstable energy.
            this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.5, 6, 12), flux); this.body.rotation.z = Math.PI / 2; this.body.position.y = 0.85; this.bodyGroup.add(this.body);
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 10), flux); skull.rotation.x = Math.PI / 2; this.head.add(skull);
            for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 5), flux); ear.position.set(s * 0.1, 0.14, -0.1); this.head.add(ear); }
            this._eye(this.head, -0.08, 0.04, 0.18, 0.05, p.accent); this._eye(this.head, 0.08, 0.04, 0.18, 0.05, p.accent);
            this.head.position.set(0.42, 0.95, 0); this.bodyGroup.add(this.head);
            // Stubby limbs.
            const limb = (x, z) => { const l = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), flux); l.position.set(x, 0.62, z); this.bodyGroup.add(l); return l; };
            this.leftArm = limb(0.25, 0.16); this.rightArm = limb(0.25, -0.16);
            this.leftLeg = limb(-0.3, 0.16); this.rightLeg = limb(-0.3, -0.16);
            // Bushy energy tail.
            this.tail = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.7, 8), flux); this.tail.position.set(-0.6, 1.0, 0); this.tail.rotation.z = -0.9; this.bodyGroup.add(this.tail);
            // Phasing afterimages (prismatic motes).
            this.motes = [];
            for (let i = 0; i < 6; i++) { const m = this._orb(0.05 + this.idRand() * 0.04, p.accent, this.motes); m._a = this.idRand() * 6.28; m._r = 0.4 + this.idRand() * 0.4; m._h = 0.6 + this.idRand() * 0.7; }
            this._partMeshMap = { HEAD: this.head, TORSO: this.body, BODY: this.body, CORE: this.body, LEFT_ARM: this.leftArm, RIGHT_ARM: this.rightArm, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg, TAIL: this.tail };
            this._cascadeRules = [
                { gone: ['TORSO', 'BODY', 'CORE'], hide: [this.body, this.head, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg, this.tail, ...this.motes] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['LEFT_ARM'], hide: [this.leftArm] },
                { gone: ['RIGHT_ARM'], hide: [this.rightArm] },
                { gone: ['LEFT_LEG'], hide: [this.leftLeg] },
                { gone: ['RIGHT_LEG'], hide: [this.rightLeg] },
            ];
        }

        // ── Forest Treant: an animated oak smashing with gnarled limbs (Tree) ─
        // Tree rig: CROWN/TRUNK/ROOTS/BRANCH_1/BRANCH_2.
        _buildForestTreant() {
            const p = this.profile;
            const bark = this._skinMat(p.bodyColor, 0.9);
            const leafMat = this._mat(p.accent, 1.0, 0.7);
            // TRUNK with a gnarled face.
            this.trunk = new THREE.Group();
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.6, 2.0, 10), bark); trunk.position.y = 1.1; this.trunk.add(trunk);
            const brow = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.2), bark); brow.position.set(0, 1.55, 0.4); this.trunk.add(brow);
            this._eye(this.trunk, -0.16, 1.42, 0.42, 0.08, 0xd4a017); this._eye(this.trunk, 0.16, 1.42, 0.42, 0.08, 0xd4a017);
            const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.12), this._mat(0x1c1208, 1.0, 0.8)); mouth.position.set(0, 1.1, 0.46); this.trunk.add(mouth);
            this.bodyGroup.add(this.trunk);
            // CROWN of leaves.
            this.crown = new THREE.Group();
            for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const c = new THREE.Mesh(new THREE.SphereGeometry(0.5 + this.idRand() * 0.2, 10, 10), leafMat); c.position.set(Math.cos(a) * 0.4, 2.4 + this.idRand() * 0.3, Math.sin(a) * 0.4); this.crown.add(c); }
            const top = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 12), leafMat); top.position.y = 2.7; this.crown.add(top);
            this.bodyGroup.add(this.crown);
            // Branch arms.
            const branch = (s) => {
                const g = new THREE.Group();
                const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.7, 7), bark); upper.position.set(s * 0.3, 0, 0); upper.rotation.z = -s * 1.1; g.add(upper);
                const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.6, 7), bark); fore.position.set(s * 0.62, -0.3, 0); fore.rotation.z = -s * 0.4; g.add(fore);
                for (let i = 0; i < 3; i++) { const twig = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.25, 5), bark); twig.position.set(s * 0.78, -0.55 + i * 0.05, -0.1 + i * 0.1); twig.rotation.z = -s * 0.2; g.add(twig); }
                g.position.set(0, 1.5, 0.1); g._s = s; this.bodyGroup.add(g); return g;
            };
            this.branch1 = branch(-1); this.branch2 = branch(1);
            // ROOTS as feet.
            this.roots = new THREE.Group();
            for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const r = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 6), bark); r.position.set(Math.cos(a) * 0.45, 0.18, Math.sin(a) * 0.45); r.rotation.set(Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8); this.roots.add(r); }
            this.bodyGroup.add(this.roots);
            this._partMeshMap = { CROWN: this.crown, TRUNK: this.trunk, ROOTS: this.roots, BRANCH_1: this.branch1, BRANCH_2: this.branch2 };
            this._cascadeRules = [
                { gone: ['TRUNK'], hide: [this.trunk, this.crown, this.branch1, this.branch2, this.roots] },
                { gone: ['CROWN'], hide: [this.crown] },
                { gone: ['ROOTS'], hide: [this.roots] },
                { gone: ['BRANCH_1'], hide: [this.branch1] },
                { gone: ['BRANCH_2'], hide: [this.branch2] },
            ];
        }

        // ── Forest Witch: vine-haired nature witch (Gorgon rig) ──────────────
        // Gorgon rig: EYES/SNAKE_HAIR/UPPER_BODY/LOWER_BODY.
        _buildForestWitch() {
            const p = this.profile;
            const robe = this._skinMat(p.bodyColor, 0.8);
            const flesh = this._mat(0x8aa86a, 1.0, 0.6);
            const vine = this._mat(0x3f6a2c, 1.0, 0.7);
            // LOWER_BODY: long witch robe.
            this.lower = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.5, 12), robe); this.lower.position.y = 0.75; this.bodyGroup.add(this.lower);
            // UPPER_BODY: torso + arms + a crooked staff.
            this.upper = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.55, 10), robe); this.upper.add(torso);
            const lArm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 7), robe); lArm.position.set(-0.28, 0, 0.05); lArm.rotation.z = 0.6; this.upper.add(lArm);
            const rArm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 7), robe); rArm.position.set(0.28, 0, 0.05); rArm.rotation.z = -0.4; this.upper.add(rArm);
            this.staff = new THREE.Group();
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.3, 6), this._mat(0x4a3018, 1.0, 0.7)); this.staff.add(pole);
            this.staffOrb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), this._mat(p.accent, 0.9, 0.2, p.accent)); this.staffOrb.position.y = 0.7; this.staff.add(this.staffOrb);
            this.staff.position.set(0.45, 0.15, 0.1); this.staff.rotation.z = -0.15; this.upper.add(this.staff);
            this.upper.position.y = 1.45; this.bodyGroup.add(this.upper);
            // Head + glowing EYES under a wide hat.
            this.head = new THREE.Group();
            const face = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), flesh); face.scale.set(0.9, 1.05, 0.9); this.head.add(face);
            this.eyesGrp = new THREE.Group();
            this._eye(this.eyesGrp, -0.08, 0.02, 0.16, 0.05, p.accent); this._eye(this.eyesGrp, 0.08, 0.02, 0.16, 0.05, p.accent);
            this.head.add(this.eyesGrp);
            const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 14), this._mat(0x2a3a2a, 1.0, 0.7)); hatBrim.position.y = 0.22; this.head.add(hatBrim);
            const hatCone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 12), this._mat(0x2a3a2a, 1.0, 0.7)); hatCone.position.y = 0.5; hatCone.rotation.z = 0.15; this.head.add(hatCone);
            this.head.position.y = 1.95; this.bodyGroup.add(this.head);
            // SNAKE_HAIR re-imagined as writhing vines.
            this.hair = new THREE.Group();
            for (let i = 0; i < 7; i++) {
                const a = (i / 7) * Math.PI * 2; const v = new THREE.Group(); let vy = 0;
                for (let s = 0; s < 4; s++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.05 - s * 0.008, 8, 8), vine); seg.position.y = vy; vy -= 0.12; v.add(seg); }
                v.position.set(Math.cos(a) * 0.18, 1.9, Math.sin(a) * 0.18 - 0.05); this.hair.add(v);
            }
            this.bodyGroup.add(this.hair);
            this._partMeshMap = { EYES: this.eyesGrp, SNAKE_HAIR: this.hair, UPPER_BODY: this.upper, LOWER_BODY: this.lower, HEAD: this.head };
            this._cascadeRules = [
                { gone: ['LOWER_BODY'], hide: [this.lower, this.upper, this.head, this.hair] },
                { gone: ['UPPER_BODY'], hide: [this.upper, this.head, this.hair] },
                { gone: ['SNAKE_HAIR'], hide: [this.hair] },
                { gone: ['EYES'], hide: [this.eyesGrp] },
            ];
        }

        // ── Frost Elemental: a living shard of ice (Elemental rig) ───────────
        // Elemental rig: CORE/UPPER_FORM/LOWER_FORM/LEFT_APPENDAGE/RIGHT_APPENDAGE.
        _buildFrostElemental() {
            const p = this.profile;
            const ice = this._mat(p.bodyColor, 0.7, 0.1, 0x2a4a5a); ice.transparent = true;
            const bright = this._mat(p.accent, 0.85, 0.1, p.accent);
            // CORE: glowing frozen heart.
            this.core = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), bright); this.core.position.y = 1.1; this.bodyGroup.add(this.core);
            // UPPER_FORM: jagged ice crystal cluster.
            this.upper = new THREE.Group();
            for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const sh = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.6 + this.idRand() * 0.3, 6), ice); sh.position.set(Math.cos(a) * 0.22, 1.45 + this.idRand() * 0.2, Math.sin(a) * 0.22); sh.rotation.set(Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3); this.upper.add(sh); }
            this.bodyGroup.add(this.upper);
            // LOWER_FORM: swirling frost base.
            this.lower = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.0, 10), ice); this.lower.position.y = 0.5; this.lower.rotation.x = Math.PI; this.bodyGroup.add(this.lower);
            // Appendages: ice-spike arms.
            const arm = (s) => { const g = new THREE.Group(); for (let i = 0; i < 3; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.08 - i * 0.02, 0.35, 6), ice); sp.position.set(s * (0.1 + i * 0.12), i * 0.05, 0); sp.rotation.z = -s * (0.8 + i * 0.2); g.add(sp); } g.position.set(s * 0.4, 1.05, 0); g._s = s; this.bodyGroup.add(g); return g; };
            this.leftApp = arm(-1); this.rightApp = arm(1);
            // Drifting snow motes.
            this.motes = [];
            for (let i = 0; i < 7; i++) { const m = this._orb(0.04 + this.idRand() * 0.03, p.accent, this.motes); m._a = this.idRand() * 6.28; m._r = 0.5 + this.idRand() * 0.3; m._h = 0.6 + this.idRand() * 1.0; }
            this._partMeshMap = { CORE: this.core, UPPER_FORM: this.upper, LOWER_FORM: this.lower, LEFT_APPENDAGE: this.leftApp, RIGHT_APPENDAGE: this.rightApp };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.upper, this.lower, this.leftApp, this.rightApp, ...this.motes] },
                { gone: ['UPPER_FORM'], hide: [this.upper] },
                { gone: ['LOWER_FORM'], hide: [this.lower] },
                { gone: ['LEFT_APPENDAGE'], hide: [this.leftApp] },
                { gone: ['RIGHT_APPENDAGE'], hide: [this.rightApp] },
            ];
        }

        // ── Spider: Frost Spider / Giant Spider (Spider rig) ─────────────────
        // Spider rig: HEAD/CEPHALOTHORAX/ABDOMEN/FANGS/SPINNERETS + 8 legs.
        _buildSpider() {
            const p = this.profile, icy = !!p.icy;
            const chitin = this._skinMat(p.bodyColor, icy ? 0.25 : 0.6);
            const dark = this._mat(icy ? 0x4a7088 : 0x140f0c, 1.0, 0.5);
            // ABDOMEN (rear bulb) + CEPHALOTHORAX (front).
            this.abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 12), chitin); this.abdomen.position.set(-0.5, 0.85, 0); this.abdomen.scale.set(1.0, 0.9, 1.1); this.bodyGroup.add(this.abdomen);
            if (icy) { for (let i = 0; i < 5; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 5), this._mat(p.accent, 0.8, 0.1, p.accent)); const a = this.idRand() * 6.28; sp.position.set(Math.cos(a) * 0.45, this.idRand() * 0.4, Math.sin(a) * 0.45); sp.rotation.set(this.idRand() * 6, 0, this.idRand() * 6); this.abdomen.add(sp); } }
            this.cephalo = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 12), chitin); this.cephalo.position.set(0.2, 0.8, 0); this.bodyGroup.add(this.cephalo);
            // HEAD + eye cluster + FANGS.
            this.head = new THREE.Group();
            const face = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), chitin); this.head.add(face);
            for (let i = 0; i < 4; i++) { const ex = -0.1 + (i % 2) * 0.2, ey = 0.05 + Math.floor(i / 2) * 0.08; this._eye(this.head, ex, ey, 0.18, 0.04, p.accent); }
            this.head.position.set(0.5, 0.85, 0); this.bodyGroup.add(this.head);
            this.fangs = new THREE.Group();
            for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 5), dark); f.position.set(s * 0.07, -0.12, 0.16); f.rotation.x = 0.3; this.fangs.add(f); }
            this.head.add(this.fangs);
            // SPINNERETS at the rear.
            this.spinnerets = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.24, 6), dark); this.spinnerets.position.set(-1.0, 0.8, 0); this.spinnerets.rotation.z = Math.PI / 2; this.bodyGroup.add(this.spinnerets);
            // Eight legs.
            const mkLeg = (x, z, s, lift) => {
                const g = new THREE.Group();
                const femur = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.55, 6), chitin); femur.position.set(s * 0.28, 0.1, 0); femur.rotation.z = -s * 1.2; g.add(femur);
                const tibia = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.6, 6), chitin); tibia.position.set(s * 0.52, -0.25, 0); tibia.rotation.z = -s * 0.4; g.add(tibia);
                g.position.set(x, 0.85, z); g._s = s; g._lift = lift; this.bodyGroup.add(g); return g;
            };
            this.legL1 = mkLeg(0.25, 0.3, 1, 0); this.legR1 = mkLeg(0.25, -0.3, -1, 1);
            this.legL2 = mkLeg(0.05, 0.34, 1, 1); this.legR2 = mkLeg(0.05, -0.34, -1, 0);
            this.legL3 = mkLeg(-0.2, 0.34, 1, 0); this.legR3 = mkLeg(-0.2, -0.34, -1, 1);
            this.legL4 = mkLeg(-0.45, 0.3, 1, 1); this.legR4 = mkLeg(-0.45, -0.3, -1, 0);
            this._legs = [this.legL1, this.legR1, this.legL2, this.legR2, this.legL3, this.legR3, this.legL4, this.legR4];
            this._partMeshMap = {
                HEAD: this.head, CEPHALOTHORAX: this.cephalo, ABDOMEN: this.abdomen, FANGS: this.fangs, SPINNERETS: this.spinnerets,
                LEFT_LEG: this.legL1, RIGHT_LEG: this.legR1, MID_LEFT_LEG: this.legL2, MID_RIGHT_LEG: this.legR2,
                MID_REAR_LEFT_LEG: this.legL3, MID_REAR_RIGHT_LEG: this.legR3, REAR_LEFT_LEG: this.legL4, REAR_RIGHT_LEG: this.legR4
            };
            this._cascadeRules = [
                { gone: ['CEPHALOTHORAX'], hide: [this.cephalo, this.head, this.fangs, this.abdomen, this.spinnerets, ...this._legs] },
                { gone: ['ABDOMEN'], hide: [this.abdomen, this.spinnerets] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['FANGS'], hide: [this.fangs] },
                { gone: ['SPINNERETS'], hide: [this.spinnerets] },
                { gone: ['LEFT_LEG'], hide: [this.legL1] }, { gone: ['RIGHT_LEG'], hide: [this.legR1] },
                { gone: ['MID_LEFT_LEG'], hide: [this.legL2] }, { gone: ['MID_RIGHT_LEG'], hide: [this.legR2] },
                { gone: ['MID_REAR_LEFT_LEG'], hide: [this.legL3] }, { gone: ['MID_REAR_RIGHT_LEG'], hide: [this.legR3] },
                { gone: ['REAR_LEFT_LEG'], hide: [this.legL4] }, { gone: ['REAR_RIGHT_LEG'], hide: [this.legR4] },
            ];
        }

        // ── Giant Jellyfish: translucent paralyzing bell (TentacledCreature) ──
        // TentacledCreature rig: EYE/TENTACLE_ONE/TENTACLE_TWO/BODY.
        _buildGiantJellyfish() {
            const p = this.profile;
            const bell = this._mat(p.bodyColor, 0.5, 0.1, 0x301a48); bell.transparent = true;
            // BODY: the dome bell.
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.75, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.6), bell); this.body.position.y = 1.6; this.body.scale.set(1.0, 0.85, 1.0); this.bodyGroup.add(this.body);
            const frill = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.08, 8, 24), this._mat(p.accent, 0.6, 0.2, p.accent)); frill.position.y = 1.3; frill.rotation.x = Math.PI / 2; this.bodyGroup.add(frill);
            // EYE: glowing nucleus suspended inside.
            this.eyeGrp = new THREE.Group();
            const nucleus = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), this._mat(p.accent, 0.85, 0.2, p.accent)); this.eyeGrp.add(nucleus);
            this.eyeGrp.position.y = 1.5; this.bodyGroup.add(this.eyeGrp);
            // Long stinging tentacles; two mapped, rest decorative.
            this.tentacles = [];
            const mkTent = (a, len, thick) => {
                const g = new THREE.Group(); let ty = 0;
                const n = Math.round(len / 0.18);
                for (let s = 0; s < n; s++) { const r = thick - s * (thick * 0.6 / n); const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), bell); seg.position.y = ty; if (s) this.addStrut(g, bell, new THREE.Vector3(0, ty + 0.18, 0), new THREE.Vector3(0, ty, 0), r * 0.8, r * 0.75, 6); ty -= 0.18; g.add(seg); }
                g.position.set(Math.cos(a) * 0.62, 1.3, Math.sin(a) * 0.62); g._a = a; this.bodyGroup.add(g); this.tentacles.push(g); return g;
            };
            this.t1 = mkTent(0, 1.4, 0.08); this.t2 = mkTent(Math.PI, 1.4, 0.08);
            for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.4; mkTent(a, 0.9 + this.idRand() * 0.5, 0.05); }
            this._partMeshMap = { EYE: this.eyeGrp, BODY: this.body, CORE: this.body, TENTACLE_ONE: this.t1, TENTACLE_TWO: this.t2 };
            this._cascadeRules = [
                { gone: ['BODY', 'CORE'], hide: [this.body, this.eyeGrp, ...this.tentacles] },
                { gone: ['EYE'], hide: [this.eyeGrp] },
                { gone: ['TENTACLE_ONE'], hide: [this.t1] },
                { gone: ['TENTACLE_TWO'], hide: [this.t2] },
            ];
        }

        // ── Giant Scorpion: venomous desert arachnid (Scorpion rig) ──────────
        // Scorpion rig: HEAD/CEPHALOTHORAX/ABDOMEN/TAIL/STINGER/PINCER_*/8 legs.
        _buildGiantScorpion() {
            const p = this.profile;
            const chitin = this._skinMat(p.bodyColor, 0.5);
            const dark = this._mat(0x3a2c1a, 1.0, 0.5);
            // CEPHALOTHORAX + ABDOMEN + HEAD.
            this.cephalo = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 12), chitin); this.cephalo.position.set(0.3, 0.7, 0); this.cephalo.scale.set(1.1, 0.8, 1.0); this.bodyGroup.add(this.cephalo);
            this.abdomen = new THREE.Group();
            let ax = -0.1, ay = 0.7;
            for (let i = 0; i < 4; i++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.32 - i * 0.03, 12, 10), chitin); seg.position.set(ax, ay, 0); seg.scale.set(1.0, 0.8, 1.0); this.abdomen.add(seg); ax -= 0.3; }
            this.bodyGroup.add(this.abdomen);
            this.head = new THREE.Group();
            const face = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), chitin); this.head.add(face);
            this._eye(this.head, -0.08, 0.06, 0.12, 0.04, p.accent); this._eye(this.head, 0.08, 0.06, 0.12, 0.04, p.accent);
            this.head.position.set(0.62, 0.72, 0); this.bodyGroup.add(this.head);
            // Pincers on long arms.
            const pincer = (s) => {
                const g = new THREE.Group();
                const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.5, 7), chitin); arm.rotation.z = Math.PI / 2; arm.position.set(0.25, 0, 0); g.add(arm);
                const palm = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), chitin); palm.position.set(0.55, 0, 0); palm.scale.set(1.3, 0.8, 0.7); g.add(palm);
                const claw1 = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 6), dark); claw1.position.set(0.78, 0.06, 0); claw1.rotation.z = -Math.PI / 2; g.add(claw1);
                const claw2 = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 6), dark); claw2.position.set(0.78, -0.06, 0); claw2.rotation.z = -Math.PI / 2; g.add(claw2); g._claw = claw2;
                g.position.set(0.7, 0.7, s * 0.32); this.bodyGroup.add(g); g._s = s; return g;
            };
            this.pincerL = pincer(1); this.pincerR = pincer(-1);
            // Segmented tail arching over the back, ending in a STINGER.
            this.tail = new THREE.Group();
            let tx = -1.0, ty = 0.75; const pts = [];
            for (let i = 0; i < 6; i++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.16 - i * 0.012, 10, 10), chitin); seg.position.set(tx, ty, 0); this.tail.add(seg); pts.push([tx, ty]); tx += 0.05 + i * 0.02; ty += 0.28; }
            this.stinger = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.42, 8), this._mat(p.accent, 1.0, 0.3, p.accent)); this.stinger.position.set(tx + 0.08, ty - 0.05, 0); this.stinger.rotation.z = 1.6; this.tail.add(this.stinger);
            this.bodyGroup.add(this.tail);
            // Eight walking legs.
            const mkLeg = (x, z, s, lift) => {
                const g = new THREE.Group();
                const femur = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.4, 6), chitin); femur.position.set(s * 0.2, 0.0, 0); femur.rotation.z = -s * 1.1; g.add(femur);
                const tibia = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.45, 6), chitin); tibia.position.set(s * 0.4, -0.25, 0); tibia.rotation.z = -s * 0.3; g.add(tibia);
                g.position.set(x, 0.68, z); g._s = s; g._lift = lift; this.bodyGroup.add(g); return g;
            };
            this.legL1 = mkLeg(0.4, 0.3, 1, 0); this.legR1 = mkLeg(0.4, -0.3, -1, 1);
            this.legL2 = mkLeg(0.2, 0.34, 1, 1); this.legR2 = mkLeg(0.2, -0.34, -1, 0);
            this.legL3 = mkLeg(0.0, 0.34, 1, 0); this.legR3 = mkLeg(0.0, -0.34, -1, 1);
            this.legL4 = mkLeg(-0.2, 0.3, 1, 1); this.legR4 = mkLeg(-0.2, -0.3, -1, 0);
            this._legs = [this.legL1, this.legR1, this.legL2, this.legR2, this.legL3, this.legR3, this.legL4, this.legR4];
            this._partMeshMap = {
                HEAD: this.head, CEPHALOTHORAX: this.cephalo, ABDOMEN: this.abdomen, TAIL: this.tail, STINGER: this.stinger, PINCER_LEFT: this.pincerL, PINCER_RIGHT: this.pincerR,
                LEFT_LEG: this.legL1, RIGHT_LEG: this.legR1, MID_LEFT_LEG: this.legL2, MID_RIGHT_LEG: this.legR2,
                MID_REAR_LEFT_LEG: this.legL3, MID_REAR_RIGHT_LEG: this.legR3, REAR_LEFT_LEG: this.legL4, REAR_RIGHT_LEG: this.legR4
            };
            this._cascadeRules = [
                { gone: ['CEPHALOTHORAX'], hide: [this.cephalo, this.head, this.abdomen, this.tail, this.stinger, this.pincerL, this.pincerR, ...this._legs] },
                { gone: ['ABDOMEN'], hide: [this.abdomen, this.tail, this.stinger] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['TAIL'], hide: [this.tail, this.stinger] },
                { gone: ['STINGER'], hide: [this.stinger] },
                { gone: ['PINCER_LEFT'], hide: [this.pincerL] }, { gone: ['PINCER_RIGHT'], hide: [this.pincerR] },
                { gone: ['LEFT_LEG'], hide: [this.legL1] }, { gone: ['RIGHT_LEG'], hide: [this.legR1] },
                { gone: ['MID_LEFT_LEG'], hide: [this.legL2] }, { gone: ['MID_RIGHT_LEG'], hide: [this.legR2] },
                { gone: ['MID_REAR_LEFT_LEG'], hide: [this.legL3] }, { gone: ['MID_REAR_RIGHT_LEG'], hide: [this.legR3] },
                { gone: ['REAR_LEFT_LEG'], hide: [this.legL4] }, { gone: ['REAR_RIGHT_LEG'], hide: [this.legR4] },
            ];
        }

        // ── Glacier Crab: blue-ice crab with snapping claws (Crustacean) ──────
        // Crustacean rig: CLAW_LEFT/CLAW_RIGHT/CARAPACE/ABDOMEN/FRONT_LEG/REAR_LEG/ANTENNAE.
        _buildGlacierCrab() {
            const p = this.profile;
            const ice = this._skinMat(p.bodyColor, 0.25);
            const bright = this._mat(p.accent, 0.8, 0.1, p.accent);
            // CARAPACE shell + ABDOMEN underbelly.
            this.carapace = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), ice); this.carapace.position.y = 0.7; this.carapace.scale.set(1.3, 0.7, 1.0); this.bodyGroup.add(this.carapace);
            for (let i = 0; i < 4; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.26, 5), bright); const a = -0.6 + i * 0.4; sp.position.set(a * 0.7, 0.95, -0.1); this.carapace.add(sp); }
            this.abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 8), ice); this.abdomen.position.set(0, 0.5, 0.1); this.abdomen.scale.set(1.2, 0.5, 1.0); this.bodyGroup.add(this.abdomen);
            // Eyestalks + antennae.
            this.antennae = new THREE.Group();
            for (const s of [-1, 1]) { const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 5), ice); stalk.position.set(s * 0.18, 1.1, 0.3); this.antennae.add(stalk); this._eye(this.antennae, s * 0.18, 1.28, 0.3, 0.06, 0x0a2a3a); }
            this.bodyGroup.add(this.antennae);
            // Big asymmetric claws on jointed arms.
            const claw = (s, big) => {
                const g = new THREE.Group();
                const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.5, 7), ice); arm.rotation.z = Math.PI / 2; arm.position.set(s * 0.25, 0, 0); g.add(arm);
                const sz = big ? 0.26 : 0.18;
                const palm = new THREE.Mesh(new THREE.SphereGeometry(sz, 10, 10), ice); palm.position.set(s * 0.6, 0.02, 0); palm.scale.set(1.2, 1.0, 0.7); g.add(palm);
                const upper = new THREE.Mesh(new THREE.ConeGeometry(sz * 0.5, sz * 1.6, 6), ice); upper.position.set(s * (0.6 + sz), 0.12, 0); upper.rotation.z = -s * Math.PI / 2; g.add(upper); g._upper = upper;
                const lower = new THREE.Mesh(new THREE.ConeGeometry(sz * 0.5, sz * 1.6, 6), ice); lower.position.set(s * (0.6 + sz), -0.08, 0); lower.rotation.z = -s * Math.PI / 2; g.add(lower);
                g.position.set(s * 0.5, 0.7, 0.3); g._s = s; this.bodyGroup.add(g); return g;
            };
            this.clawL = claw(1, true); this.clawR = claw(-1, false);
            // Walking legs.
            this.frontLeg = new THREE.Group(); this.rearLeg = new THREE.Group();
            for (const s of [-1, 1]) for (let i = 0; i < 2; i++) {
                const tgt = i === 0 ? this.frontLeg : this.rearLeg;
                const l = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.45, 6), ice); l.position.set(s * (0.5 + i * 0.12), 0.32, -0.1 - i * 0.25); l.rotation.z = -s * 1.0; tgt.add(l);
            }
            this.bodyGroup.add(this.frontLeg, this.rearLeg);
            this._partMeshMap = { CLAW_LEFT: this.clawL, CLAW_RIGHT: this.clawR, CARAPACE: this.carapace, ABDOMEN: this.abdomen, FRONT_LEG: this.frontLeg, REAR_LEG: this.rearLeg, ANTENNAE: this.antennae };
            this._cascadeRules = [
                { gone: ['CARAPACE'], hide: [this.carapace, this.abdomen, this.antennae, this.clawL, this.clawR, this.frontLeg, this.rearLeg] },
                { gone: ['ABDOMEN'], hide: [this.abdomen] },
                { gone: ['CLAW_LEFT'], hide: [this.clawL] }, { gone: ['CLAW_RIGHT'], hide: [this.clawR] },
                { gone: ['FRONT_LEG'], hide: [this.frontLeg] }, { gone: ['REAR_LEG'], hide: [this.rearLeg] },
                { gone: ['ANTENNAE'], hide: [this.antennae] },
            ];
        }

        // ── Glimmer Shrimp: a luminous shrimp like a ball of dancing light ────
        // Crustacean rig (small): CLAW_*/CARAPACE/ABDOMEN/FRONT_LEG/REAR_LEG/ANTENNAE.
        _buildGlimmerShrimp() {
            const p = this.profile;
            const glow = this._mat(p.bodyColor, 0.85, 0.2, p.bodyColor); glow.transparent = true;
            // Curved segmented body: CARAPACE (head/thorax) -> ABDOMEN (curling tail).
            this.carapace = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12), glow); this.carapace.position.set(0.15, 1.0, 0); this.carapace.scale.set(1.0, 1.1, 1.2); this.bodyGroup.add(this.carapace);
            this.abdomen = new THREE.Group();
            let bx = 0.0, by = 1.0;
            for (let i = 0; i < 6; i++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.2 - i * 0.025, 10, 10), glow); seg.position.set(bx, by, 0); this.abdomen.add(seg); bx -= 0.16; by -= 0.02 - i * 0.03; }
            const fan = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.22, 6), glow); fan.position.set(bx, by + 0.04, 0); fan.rotation.z = -1.2; fan.scale.set(1, 1, 0.4); this.abdomen.add(fan);
            this.bodyGroup.add(this.abdomen);
            // Antennae + eyes.
            this.antennae = new THREE.Group();
            for (const s of [-1, 1]) { const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.6, 4), glow); ant.position.set(0.3 + s * 0.04, 1.05 + s * 0.05, 0); ant.rotation.z = -1.0 + s * 0.2; this.antennae.add(ant); this._eye(this.antennae, 0.28, 1.05 + s * 0.08, 0.12, 0.04, 0xffffff); }
            this.bodyGroup.add(this.antennae);
            // Tiny claws + swimmeret legs.
            const claw = (s) => { const c = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 5), glow); c.position.set(0.34, 0.82, s * 0.08); c.rotation.x = 1.2; this.bodyGroup.add(c); return c; };
            this.clawL = claw(1); this.clawR = claw(-1);
            this.frontLeg = new THREE.Group(); this.rearLeg = new THREE.Group();
            for (let i = 0; i < 5; i++) { const tgt = i < 3 ? this.frontLeg : this.rearLeg; const l = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 4), glow); l.position.set(0.1 - i * 0.13, 0.82, 0); l.rotation.x = 0.4; tgt.add(l); }
            this.bodyGroup.add(this.frontLeg, this.rearLeg);
            // Dancing light halo.
            this.lights = [];
            for (let i = 0; i < 8; i++) { const o = this._orb(0.04 + this.idRand() * 0.03, p.accent, this.lights); o._a = (i / 8) * Math.PI * 2; o._r = 0.4 + this.idRand() * 0.25; o._h = 0.8 + this.idRand() * 0.5; }
            this._partMeshMap = { CLAW_LEFT: this.clawL, CLAW_RIGHT: this.clawR, CARAPACE: this.carapace, ABDOMEN: this.abdomen, FRONT_LEG: this.frontLeg, REAR_LEG: this.rearLeg, ANTENNAE: this.antennae };
            this._cascadeRules = [
                { gone: ['CARAPACE'], hide: [this.carapace, this.abdomen, this.antennae, this.clawL, this.clawR, this.frontLeg, this.rearLeg, ...this.lights] },
                { gone: ['ABDOMEN'], hide: [this.abdomen] },
                { gone: ['CLAW_LEFT'], hide: [this.clawL] }, { gone: ['CLAW_RIGHT'], hide: [this.clawR] },
                { gone: ['FRONT_LEG'], hide: [this.frontLeg] }, { gone: ['REAR_LEG'], hide: [this.rearLeg] },
                { gone: ['ANTENNAE'], hide: [this.antennae] },
            ];
        }

        // ── Golden Mimic: ornate treasure-chest mimic stuffed with loot ───────
        // ChestMimic rig: CORE/LID/TEETH/TONGUE/FEET.
        _buildGoldenMimic() {
            const p = this.profile;
            const wood = this._mat(0x7a4a22, 1.0, 0.6);
            const gold = this._skinMat(p.bodyColor, 0.3);
            // CORE: chest box base.
            this.body = new THREE.Group();
            const box = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.6, 0.7), wood); box.position.y = 0.55; this.body.add(box);
            for (const gx of [-0.5, 0.5]) { const band = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.62, 0.72), gold); band.position.set(gx, 0.55, 0); this.body.add(band); }
            const lock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.08), gold); lock.position.set(0, 0.36, 0.37); this.body.add(lock);
            // Loot spilling out.
            for (let i = 0; i < 8; i++) { const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 10), gold); coin.position.set((this.idRand() - 0.5) * 0.7, 0.85 + this.idRand() * 0.1, (this.idRand() - 0.3) * 0.3); coin.rotation.set(this.idRand() * 3, this.idRand() * 3, this.idRand() * 3); this.body.add(coin); }
            this.bodyGroup.add(this.body);
            // LID hinged on the back top rim, reaching FORWARD from the hinge --
            // centring the slab on the hinge parks the whole lid behind the box.
            this.lid = new THREE.Group();
            const lidTop = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.3, 0.7), wood); lidTop.position.set(0, 0.15, 0.35); this.lid.add(lidTop);
            for (const gx of [-0.5, 0.5]) { const band = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32, 0.72), gold); band.position.set(gx, 0.15, 0.35); this.lid.add(band); }
            this._eye(this.lid, -0.22, 0.2, 0.66, 0.08, 0xff3322); this._eye(this.lid, 0.22, 0.2, 0.66, 0.08, 0xff3322);
            this.lid.position.set(0, 0.85, -0.35); this.bodyGroup.add(this.lid);
            // TEETH + TONGUE lining the front face (z 0.35, box spans y 0.25..0.85).
            // The upper bases sit flush with the top rim: at the old y they hung
            // above the chest entirely, unattached to anything.
            this.teeth = new THREE.Group();
            const gtMat = this._mat(0xf2efe0, 1.0, 0.4);
            for (let i = 0; i < 9; i++) {
                const tx = -0.4 + i * 0.1;
                const tu = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 4), gtMat); tu.position.set(tx, 0.77, 0.3); tu.rotation.x = Math.PI; this.teeth.add(tu);
                const td = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 4), gtMat); td.position.set(tx, 0.57, 0.3); this.teeth.add(td);
            }
            this.bodyGroup.add(this.teeth);
            this.tongue = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.4), this._mat(0xc04a5a, 1.0, 0.5)); this.tongue.position.set(0, 0.67, 0.26); this.tongue.rotation.x = 0.4; this.bodyGroup.add(this.tongue);
            // FEET.
            this.feet = new THREE.Group();
            for (const fx of [-0.36, 0.36]) { const foot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.4), wood); foot.position.set(fx, 0.15, 0.06); this.feet.add(foot); }
            this.bodyGroup.add(this.feet);
            this._partMeshMap = { CORE: this.body, LID: this.lid, TEETH: this.teeth, TONGUE: this.tongue, FEET: this.feet };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.body, this.lid, this.teeth, this.tongue, this.feet] },
                { gone: ['LID'], hide: [this.lid] }, { gone: ['TEETH'], hide: [this.teeth] },
                { gone: ['TONGUE'], hide: [this.tongue] }, { gone: ['FEET'], hide: [this.feet] },
            ];
        }

        // ── Holographic Decoy: flickering solid-light projection (Robot rig) ──
        // Robot rig: HEAD/CORE/LEFT_ARM/RIGHT_ARM/LEFT_LEG/RIGHT_LEG.
        _buildHolographicDecoy() {
            const p = this.profile;
            const holo = this._mat(p.bodyColor, 0.55, 0.1, p.bodyColor); holo.transparent = true; holo.wireframe = false;
            const bright = this._mat(p.accent, 0.7, 0.1, p.accent); bright.transparent = true;
            // CORE: projector base disc + light cone.
            this.core = new THREE.Group();
            const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.1, 16), this._mat(0x223040, 1.0, 0.4)); disc.position.y = 0.06; this.core.add(disc);
            const beam = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.6, 16, 1, true), bright); beam.position.y = 0.9; this.core.add(beam); this._beam = beam;
            this.bodyGroup.add(this.core);
            // A solid-light humanoid silhouette.
            this.body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.7, 10), holo); this.body.position.y = 1.3; this.bodyGroup.add(this.body);
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), holo); this.head.add(skull);
            this._eye(this.head, -0.07, 0.02, 0.16, 0.04, p.accent); this._eye(this.head, 0.07, 0.02, 0.16, 0.04, p.accent);
            this.head.position.y = 1.85; this.bodyGroup.add(this.head);
            this.leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.6, 7), holo); this.leftArm.position.set(-0.28, 1.35, 0); this.leftArm.rotation.z = 0.4; this.bodyGroup.add(this.leftArm);
            this.rightArm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.6, 7), holo); this.rightArm.position.set(0.28, 1.35, 0); this.rightArm.rotation.z = -0.4; this.bodyGroup.add(this.rightArm);
            this.leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.75, 7), holo); this.leftLeg.position.set(-0.13, 0.55, 0); this.bodyGroup.add(this.leftLeg);
            this.rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.75, 7), holo); this.rightLeg.position.set(0.13, 0.55, 0); this.bodyGroup.add(this.rightLeg);
            // Horizontal scanline rings.
            this.scanlines = new THREE.Group();
            for (let i = 0; i < 5; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.01, 4, 18), bright); r.rotation.x = Math.PI / 2; r.position.y = 0.5 + i * 0.35; this.scanlines.add(r); }
            this.bodyGroup.add(this.scanlines); this._floaters.push(this.scanlines);
            this._partMeshMap = { HEAD: this.head, CORE: this.core, BODY: this.body, LEFT_ARM: this.leftArm, RIGHT_ARM: this.rightArm, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.body, this.head, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg, this.scanlines] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['LEFT_ARM'], hide: [this.leftArm] }, { gone: ['RIGHT_ARM'], hide: [this.rightArm] },
                { gone: ['LEFT_LEG'], hide: [this.leftLeg] }, { gone: ['RIGHT_LEG'], hide: [this.rightLeg] },
            ];
        }

        // ── Ice Kangaroo: translucent ice roo with freezing punches ───────────
        // Source uses the Scorpion rig; map the kangaroo onto those keys.
        _buildIceKangaroo() {
            const p = this.profile;
            const ice = this._skinMat(p.bodyColor, 0.25);
            const bright = this._mat(p.accent, 0.8, 0.1, p.accent);
            // Torso (CEPHALOTHORAX) + belly/lower (ABDOMEN).
            this.cephalo = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.5, 6, 12), ice); this.cephalo.position.set(0, 1.4, 0); this.bodyGroup.add(this.cephalo);
            this.abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 12), ice); this.abdomen.position.set(0, 0.95, 0.08); this.abdomen.scale.set(1.0, 1.1, 0.9); this.bodyGroup.add(this.abdomen);
            // Head with long ears.
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), ice); skull.scale.set(0.9, 1.0, 1.2); this.head.add(skull);
            const snout = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.26, 8), ice); snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.04, 0.24); this.head.add(snout);
            for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.34, 6), ice); ear.position.set(s * 0.12, 0.28, -0.04); ear.rotation.z = -s * 0.2; this.head.add(ear); }
            this._eye(this.head, -0.1, 0.05, 0.18, 0.045, 0x0a2a3a); this._eye(this.head, 0.1, 0.05, 0.18, 0.045, 0x0a2a3a);
            this.head.position.set(0, 1.95, 0); this.bodyGroup.add(this.head);
            // Boxing fists (PINCER_LEFT/RIGHT).
            const arm = (s) => { const g = new THREE.Group(); const up = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.5, 7), ice); up.position.set(0, -0.2, 0); g.add(up); const fist = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 10), ice); fist.position.set(0, -0.48, 0.1); g.add(fist); g.position.set(s * 0.34, 1.4, 0.05); g._s = s; this.bodyGroup.add(g); return g; };
            this.pincerL = arm(-1); this.pincerR = arm(1);
            // Powerful hind legs (LEFT_LEG/RIGHT_LEG).
            const leg = (s) => { const g = new THREE.Group(); const thigh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), ice); thigh.scale.set(0.8, 1.3, 0.9); thigh.position.y = 0.55; g.add(thigh); const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.6, 7), ice); shin.position.set(0, 0.15, 0.05); g.add(shin); const foot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.5), ice); foot.position.set(0, -0.1, 0.18); g.add(foot); g.position.set(s * 0.22, 0.3, 0); this.bodyGroup.add(g); return g; };
            this.legL = leg(-1); this.legR = leg(1);
            // Thick tail (TAIL) + frozen tip (STINGER).
            this.tail = new THREE.Group(); let tx = 0, ty = 0.85;
            for (let i = 0; i < 5; i++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.18 - i * 0.025, 10, 10), ice); seg.position.set(tx, ty, 0); this.tail.add(seg); tx -= 0.04; ty -= 0.18; }
            this.stinger = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.24, 6), bright); this.stinger.position.set(tx, ty, 0); this.stinger.rotation.x = -0.4; this.tail.add(this.stinger);
            this.tail.position.z = -0.4; this.bodyGroup.add(this.tail);
            this._partMeshMap = { HEAD: this.head, CEPHALOTHORAX: this.cephalo, ABDOMEN: this.abdomen, TAIL: this.tail, STINGER: this.stinger, PINCER_LEFT: this.pincerL, PINCER_RIGHT: this.pincerR, LEFT_LEG: this.legL, RIGHT_LEG: this.legR };
            this._cascadeRules = [
                { gone: ['CEPHALOTHORAX'], hide: [this.cephalo, this.head, this.abdomen, this.tail, this.pincerL, this.pincerR, this.legL, this.legR] },
                { gone: ['ABDOMEN'], hide: [this.abdomen] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['TAIL'], hide: [this.tail] }, { gone: ['STINGER'], hide: [this.stinger] },
                { gone: ['PINCER_LEFT'], hide: [this.pincerL] }, { gone: ['PINCER_RIGHT'], hide: [this.pincerR] },
                { gone: ['LEFT_LEG'], hide: [this.legL] }, { gone: ['RIGHT_LEG'], hide: [this.legR] },
            ];
        }

        // ── Insect Swarm: a roiling cloud of small biting insects (InsectSwarm) ─
        // InsectSwarm rig: MANDIBLES/WINGS/LEGS/ABDOMEN/STINGERS.
        _buildInsectSwarm() {
            const p = this.profile;
            const chitin = this._mat(p.bodyColor, 1.0, 0.5);
            const wingMat = this._mat(0xcfeaff, 0.4, 0.2);
            const mkBug = () => {
                const b = new THREE.Group();
                const body = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), chitin); body.scale.set(1, 0.8, 1.6); b.add(body);
                const w1 = new THREE.Mesh(new THREE.CircleGeometry(0.07, 6), wingMat); w1.position.set(-0.06, 0.04, 0); w1.rotation.y = 0.5; b.add(w1);
                const w2 = new THREE.Mesh(new THREE.CircleGeometry(0.07, 6), wingMat); w2.position.set(0.06, 0.04, 0); w2.rotation.y = -0.5; b.add(w2);
                return b;
            };
            // Group the swarm into the rig's named clusters so part-loss thins it.
            this.abdomenG = new THREE.Group(); this.wingsG = new THREE.Group(); this.legsG = new THREE.Group(); this.mandiblesG = new THREE.Group(); this.stingersG = new THREE.Group();
            const groups = [this.abdomenG, this.wingsG, this.legsG, this.mandiblesG, this.stingersG];
            this._bugs = [];
            for (let i = 0; i < 30; i++) {
                const b = mkBug(); const g = groups[i % groups.length];
                b._a = this.idRand() * 6.28; b._r = 0.3 + this.idRand() * 0.6; b._h = 0.6 + this.idRand() * 1.1; b._sp = 0.5 + this.idRand() * 1.5; b._ph = this.idRand() * 6.28;
                g.add(b); this._bugs.push(b);
            }
            groups.forEach(g => this.bodyGroup.add(g));
            this._partMeshMap = { ABDOMEN: this.abdomenG, WINGS: this.wingsG, LEGS: this.legsG, MANDIBLES: this.mandiblesG, STINGERS: this.stingersG };
            this._cascadeRules = [
                { gone: ['ABDOMEN'], hide: [this.abdomenG, this.wingsG, this.legsG, this.mandiblesG, this.stingersG] },
                { gone: ['WINGS'], hide: [this.wingsG] }, { gone: ['LEGS'], hide: [this.legsG] },
                { gone: ['MANDIBLES'], hide: [this.mandiblesG] }, { gone: ['STINGERS'], hide: [this.stingersG] },
            ];
        }

        // ── Junkrat: a toxic, scab-covered mutant rat of swollen scraps ───────
        // TrashCreature rig: TRASH_PILE/LIMBS/EYES/HEART.
        _buildJunkrat() {
            const p = this.profile;
            const flesh = this._skinMat(p.bodyColor, 0.8);
            const junkCols = [0x4a4438, 0x6a5a3a, 0x3a3a44, 0x5a3a2a];
            // TRASH_PILE: a bloated lumpy rat body crusted with debris.
            this.body = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 12), flesh); torso.position.y = 0.8; torso.scale.set(1.1, 0.95, 1.3); this.body.add(torso);
            for (let i = 0; i < 10; i++) { const c = junkCols[Math.floor(this.idRand() * junkCols.length)]; const chunk = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), this._mat(c, 1.0, 0.7)); const a = this.idRand() * 6.28, e = this.idRand() * 1.4; chunk.position.set(Math.cos(a) * 0.5 * Math.cos(e), 0.8 + Math.sin(e) * 0.5, Math.sin(a) * 0.5 * Math.cos(e)); chunk.rotation.set(this.idRand() * 3, this.idRand() * 3, this.idRand() * 3); this.body.add(chunk); }
            this.bodyGroup.add(this.body);
            // Rat head with snout, ears, buck teeth.
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12), flesh); skull.scale.set(0.9, 0.9, 1.2); this.head.add(skull);
            const snout = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.34, 8), flesh); snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.04, 0.3); this.head.add(snout);
            for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.CircleGeometry(0.14, 10), flesh); ear.position.set(s * 0.18, 0.22, -0.05); ear.rotation.y = s * 0.6; this.head.add(ear); }
            this.eyesGrp = new THREE.Group(); this._eye(this.eyesGrp, -0.1, 0.05, 0.2, 0.05, 0xffcc33); this._eye(this.eyesGrp, 0.1, 0.05, 0.2, 0.05, 0xffcc33); this.head.add(this.eyesGrp);
            const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.04), this._mat(0xd8c89a, 1.0, 0.5)); tooth.position.set(0, -0.16, 0.4); this.head.add(tooth);
            this.head.position.set(0.42, 1.1, 0); this.bodyGroup.add(this.head);
            // LIMBS group: clawed paws + a long scaly tail.
            this.limbs = new THREE.Group();
            for (const s of [-1, 1]) { const paw = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), flesh); paw.position.set(0.3, 0.4, s * 0.3); this.limbs.add(paw); }
            this.tail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.08, 1.0, 6), this._mat(0xb89a8a, 1.0, 0.6)); this.tail.position.set(-0.7, 0.7, 0); this.tail.rotation.z = 1.0; this.limbs.add(this.tail);
            this.bodyGroup.add(this.limbs);
            // HEART: glowing toxic core.
            this.heart = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), this._mat(p.accent, 0.9, 0.2, p.accent)); this.heart.position.set(0, 0.85, 0.4); this.bodyGroup.add(this.heart);
            this._partMeshMap = { TRASH_PILE: this.body, LIMBS: this.limbs, EYES: this.eyesGrp, HEART: this.heart, HEAD: this.head };
            this._cascadeRules = [
                { gone: ['TRASH_PILE'], hide: [this.body, this.head, this.limbs, this.heart] },
                { gone: ['LIMBS'], hide: [this.limbs] }, { gone: ['EYES'], hide: [this.eyesGrp] }, { gone: ['HEART'], hide: [this.heart] },
            ];
        }

        // ── Kangaroo: a powerful marsupial with a pouch (Beast rig) ───────────
        // Beast rig: HEAD/BODY/LEFT_LEG/RIGHT_LEG/REAR_LEFT_LEG/REAR_RIGHT_LEG/TAIL.
        _buildKangaroo() {
            const p = this.profile;
            const fur = this._skinMat(p.bodyColor, 0.8);
            const pale = this._mat(0xcaa884, 1.0, 0.7);
            // Upright body.
            this.body = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.7, 6, 12), fur); torso.position.y = 1.35; torso.rotation.x = 0.2; this.body.add(torso);
            const belly = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 12), pale); belly.position.set(0, 1.05, 0.12); belly.scale.set(0.9, 1.1, 0.7); this.body.add(belly);
            const pouch = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), this._mat(0x7a5436, 1.0, 0.8)); pouch.position.set(0, 0.95, 0.28); pouch.rotation.x = Math.PI; this.body.add(pouch);
            this.bodyGroup.add(this.body);
            // Head with long muzzle + ears.
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), fur); skull.scale.set(0.85, 0.95, 1.2); this.head.add(skull);
            const snout = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.3, 8), fur); snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.04, 0.28); this.head.add(snout);
            for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.34, 6), fur); ear.position.set(s * 0.12, 0.3, -0.04); ear.rotation.z = -s * 0.25; this.head.add(ear); }
            this._eye(this.head, -0.1, 0.04, 0.18, 0.045, 0x1a0e06); this._eye(this.head, 0.1, 0.04, 0.18, 0.045, 0x1a0e06);
            this.head.position.set(0, 1.95, 0.1); this.bodyGroup.add(this.head);
            // Small forearms (mapped to front legs).
            const arm = (s) => { const a = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.45, 7), fur); a.position.set(s * 0.26, 1.25, 0.12); a.rotation.z = s * 0.5; this.bodyGroup.add(a); return a; };
            this.leftLeg = arm(-1); this.rightLeg = arm(1);
            // Big hind legs (mapped to rear legs).
            const hind = (s) => { const g = new THREE.Group(); const thigh = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 10), fur); thigh.scale.set(0.8, 1.4, 1.0); thigh.position.y = 0.6; g.add(thigh); const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.6, 7), fur); shin.position.set(0, 0.18, 0.04); g.add(shin); const foot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.55), fur); foot.position.set(0, -0.12, 0.2); g.add(foot); g.position.set(s * 0.24, 0.32, 0); this.bodyGroup.add(g); return g; };
            this.rearLeftLeg = hind(-1); this.rearRightLeg = hind(1);
            // Thick balancing tail.
            this.tail = new THREE.Group(); let tx = 0, ty = 0.9;
            for (let i = 0; i < 6; i++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.18 - i * 0.022, 10, 10), fur); seg.position.set(tx, ty, 0); this.tail.add(seg); tx -= 0.06; ty -= 0.16; }
            this.tail.position.z = -0.45; this.bodyGroup.add(this.tail);
            this._partMeshMap = { HEAD: this.head, BODY: this.body, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg, REAR_LEFT_LEG: this.rearLeftLeg, REAR_RIGHT_LEG: this.rearRightLeg, TAIL: this.tail };
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.body, this.head, this.leftLeg, this.rightLeg, this.rearLeftLeg, this.rearRightLeg, this.tail] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['LEFT_LEG'], hide: [this.leftLeg] }, { gone: ['RIGHT_LEG'], hide: [this.rightLeg] },
                { gone: ['REAR_LEFT_LEG'], hide: [this.rearLeftLeg] }, { gone: ['REAR_RIGHT_LEG'], hide: [this.rearRightLeg] },
                { gone: ['TAIL'], hide: [this.tail] },
            ];
        }

        // ── Komodo Dragon: a sprawling venomous monitor lizard (Reptilian) ────
        // Reptilian rig: HEAD/TORSO/LEFT_ARM/RIGHT_ARM/LEFT_LEG/RIGHT_LEG/TAIL.
        _buildKomodoDragon() {
            const p = this.profile;
            const scale = this._skinMat(p.bodyColor, 0.7);
            const belly = this._mat(0xb0a878, 1.0, 0.7);
            // Low slung TORSO.
            this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 1.1, 6, 12), scale); this.body.rotation.z = Math.PI / 2; this.body.position.set(0, 0.6, 0); this.bodyGroup.add(this.body);
            const bel = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.9, 6, 10), belly); bel.rotation.z = Math.PI / 2; bel.position.set(0, 0.45, 0.08); this.bodyGroup.add(bel);
            // Long head with jaws + forked tongue.
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12), scale); skull.scale.set(1.0, 0.8, 1.6); this.head.add(skull);
            const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.42), belly); jaw.position.set(0, -0.12, 0.18); this.head.add(jaw); this._jaw = jaw;
            this.tongue = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.34, 4), this._mat(0xcc3355, 1.0, 0.5)); this.tongue.rotation.x = Math.PI / 2; this.tongue.position.set(0, -0.08, 0.5); this.head.add(this.tongue);
            this._eye(this.head, -0.14, 0.1, 0.24, 0.05, 0xd4b020); this._eye(this.head, 0.14, 0.1, 0.24, 0.05, 0xd4b020);
            this.head.position.set(0.85, 0.7, 0); this.bodyGroup.add(this.head);
            // Four sprawling legs.
            const leg = (x, z, s) => { const g = new THREE.Group(); const up = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.4, 7), scale); up.position.set(s * 0.18, 0.05, 0); up.rotation.z = -s * 1.2; g.add(up); const ft = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.24), scale); ft.position.set(s * 0.34, -0.18, 0.04); g.add(ft); g.position.set(x, 0.4, z); g._s = s; this.bodyGroup.add(g); return g; };
            this.leftArm = leg(0.55, 0.34, 1); this.rightArm = leg(0.55, -0.34, -1);
            this.leftLeg = leg(-0.5, 0.34, 1); this.rightLeg = leg(-0.5, -0.34, -1);
            // Long tapering tail.
            this.tail = new THREE.Group(); let tx = -0.9, ty = 0.55;
            for (let i = 0; i < 6; i++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.22 - i * 0.03, 10, 10), scale); seg.position.set(tx, ty, 0); this.tail.add(seg); tx -= 0.28; ty -= 0.02; }
            this.bodyGroup.add(this.tail);
            this._partMeshMap = { HEAD: this.head, TORSO: this.body, LEFT_ARM: this.leftArm, RIGHT_ARM: this.rightArm, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg, TAIL: this.tail };
            this._cascadeRules = [
                { gone: ['TORSO'], hide: [this.body, this.head, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg, this.tail] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['LEFT_ARM'], hide: [this.leftArm] }, { gone: ['RIGHT_ARM'], hide: [this.rightArm] },
                { gone: ['LEFT_LEG'], hide: [this.leftLeg] }, { gone: ['RIGHT_LEG'], hide: [this.rightLeg] },
                { gone: ['TAIL'], hide: [this.tail] },
            ];
        }

        // ── Magma Ant: a volcanic ant with molten mandibles (Insectoid) ───────
        // Insectoid rig: HEAD/THORAX/ABDOMEN/6 legs/MANDIBLES.
        _buildMagmaAnt() {
            const p = this.profile;
            const chitin = this._skinMat(p.bodyColor, 0.5);
            const molten = this._mat(p.accent, 0.95, 0.2, p.accent);
            // Three body segments.
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12), chitin); this.head.add(skull);
            this._eye(this.head, -0.13, 0.06, 0.18, 0.06, p.accent); this._eye(this.head, 0.13, 0.06, 0.18, 0.06, p.accent);
            this.mandibles = new THREE.Group();
            for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.34, 5), molten); m.position.set(s * 0.1, -0.06, 0.26); m.rotation.set(1.4, 0, s * 0.4); this.mandibles.add(m); }
            this.head.add(this.mandibles);
            this.head.position.set(0.62, 0.75, 0); this.bodyGroup.add(this.head);
            this.thorax = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), chitin); this.thorax.position.set(0.15, 0.72, 0); this.thorax.scale.set(1.2, 1.0, 1.0); this.bodyGroup.add(this.thorax);
            this.abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 12), chitin); this.abdomen.position.set(-0.5, 0.78, 0); this.abdomen.scale.set(1.2, 1.0, 1.0); this.bodyGroup.add(this.abdomen);
            // Molten cracks (glowing veins) on the abdomen.
            for (let i = 0; i < 5; i++) { const a = this.idRand() * 6.28; const v = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), molten); v.position.set(Math.cos(a) * 0.38, this.idRand() * 0.4 - 0.1, Math.sin(a) * 0.38); this.abdomen.add(v); }
            // Six legs.
            const mkLeg = (x, s, lift) => { const g = new THREE.Group(); const femur = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.45, 6), chitin); femur.position.set(s * 0.22, 0.05, 0); femur.rotation.z = -s * 1.1; g.add(femur); const tibia = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.45, 6), chitin); tibia.position.set(s * 0.42, -0.22, 0); tibia.rotation.z = -s * 0.3; g.add(tibia); g.position.set(x, 0.7, 0); g._s = s; g._lift = lift; this.bodyGroup.add(g); return g; };
            this.legL1 = mkLeg(0.25, 1, 0); this.legR1 = mkLeg(0.25, -1, 1);
            this.legL2 = mkLeg(0.1, 1, 1); this.legR2 = mkLeg(0.1, -1, 0);
            this.legL3 = mkLeg(-0.08, 1, 0); this.legR3 = mkLeg(-0.08, -1, 1);
            this._legs = [this.legL1, this.legR1, this.legL2, this.legR2, this.legL3, this.legR3];
            this._partMeshMap = { HEAD: this.head, THORAX: this.thorax, ABDOMEN: this.abdomen, MANDIBLES: this.mandibles, LEFT_LEG: this.legL1, RIGHT_LEG: this.legR1, MIDDLE_LEFT_LEG: this.legL2, MIDDLE_RIGHT_LEG: this.legR2, REAR_LEFT_LEG: this.legL3, REAR_RIGHT_LEG: this.legR3 };
            this._cascadeRules = [
                { gone: ['THORAX'], hide: [this.thorax, this.head, this.abdomen, this.mandibles, ...this._legs] },
                { gone: ['ABDOMEN'], hide: [this.abdomen] },
                { gone: ['HEAD'], hide: [this.head] }, { gone: ['MANDIBLES'], hide: [this.mandibles] },
                { gone: ['LEFT_LEG'], hide: [this.legL1] }, { gone: ['RIGHT_LEG'], hide: [this.legR1] },
                { gone: ['MIDDLE_LEFT_LEG'], hide: [this.legL2] }, { gone: ['MIDDLE_RIGHT_LEG'], hide: [this.legR2] },
                { gone: ['REAR_LEFT_LEG'], hide: [this.legL3] }, { gone: ['REAR_RIGHT_LEG'], hide: [this.legR3] },
            ];
        }

        // ── Marsh Wraith: a hungering specter of mist and rot (Ghost rig) ─────
        // Ghost rig: FACE/CORE/LEFT_WISP/RIGHT_WISP.
        _buildMarshWraith() {
            const p = this.profile;
            const mist = this._mat(p.bodyColor, 0.55, 0.5, 0x102014); mist.transparent = true;
            // Tattered trailing shroud.
            this.body = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.9, 10), mist); this.body.position.y = 0.95; this.bodyGroup.add(this.body);
            for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const rag = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 4), mist); rag.position.set(Math.cos(a) * 0.4, 0.4, Math.sin(a) * 0.4); rag.rotation.x = Math.PI; this.bodyGroup.add(rag); }
            // Hollow FACE within a cowl.
            this.face = new THREE.Group();
            const hood = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 14, 0, Math.PI * 2, 0, Math.PI * 0.65), mist); hood.scale.set(1, 1.2, 1); this.face.add(hood);
            const dark = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), this._mat(0x040806, 1.0, 0.2)); dark.position.set(0, -0.02, 0.1); this.face.add(dark);
            this._eye(this.face, -0.1, 0.0, 0.22, 0.06, p.accent); this._eye(this.face, 0.1, 0.0, 0.22, 0.06, p.accent);
            this.face.position.y = 1.7; this.bodyGroup.add(this.face);
            // CORE: rotting heart-light suspended in the chest.
            this.core = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), this._mat(p.accent, 0.85, 0.2, p.accent)); this.core.position.y = 1.1; this.bodyGroup.add(this.core);
            // Two trailing wisp arms.
            const wisp = (s) => { const g = new THREE.Group(); let wy = 0; for (let i = 0; i < 5; i++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.12 - i * 0.02, 8, 8), mist); seg.position.set(s * i * 0.08, wy, 0); g.add(seg); wy -= 0.16; } g.position.set(s * 0.42, 1.3, 0.1); g._s = s; this.bodyGroup.add(g); return g; };
            this.leftWisp = wisp(-1); this.rightWisp = wisp(1);
            this._partMeshMap = { FACE: this.face, CORE: this.core, LEFT_WISP: this.leftWisp, RIGHT_WISP: this.rightWisp, BODY: this.body };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.body, this.face, this.leftWisp, this.rightWisp] },
                { gone: ['FACE'], hide: [this.face] },
                { gone: ['LEFT_WISP'], hide: [this.leftWisp] }, { gone: ['RIGHT_WISP'], hide: [this.rightWisp] },
            ];
        }

        // ── Mind Leech: a parasitic brain-feeding demon (Insectoid rig) ───────
        // Insectoid rig: HEAD/THORAX/ABDOMEN/6 legs/MANDIBLES.
        _buildMindLeech() {
            const p = this.profile;
            const flesh = this._skinMat(p.bodyColor, 0.45);
            const wet = this._mat(0x6a2a3a, 1.0, 0.3, 0x200810);
            // Sucker HEAD with a ringed maw of hooks (MANDIBLES).
            this.head = new THREE.Group();
            const sucker = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.2, 14), flesh); sucker.rotation.x = Math.PI / 2; sucker.position.z = 0.05; this.head.add(sucker);
            const maw = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 14), wet); maw.rotation.x = Math.PI / 2; maw.position.z = 0.18; this.head.add(maw);
            this.mandibles = new THREE.Group();
            for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const hook = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 4), this._mat(0x2a1018, 1.0, 0.4)); hook.position.set(Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0.2); hook.rotation.x = -1.0; this.mandibles.add(hook); }
            this.head.add(this.mandibles);
            this._eye(this.head, -0.1, 0.18, 0.05, 0.05, p.accent); this._eye(this.head, 0.1, 0.18, 0.05, 0.05, p.accent);
            this.head.position.set(0.5, 1.0, 0); this.head.rotation.y = -0.3; this.bodyGroup.add(this.head);
            // Segmented sucking body (THORAX -> ABDOMEN, brain-like).
            this.thorax = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12), flesh); this.thorax.position.set(0.15, 0.95, 0); this.bodyGroup.add(this.thorax);
            this.abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 14), flesh); this.abdomen.position.set(-0.35, 0.95, 0); this.bodyGroup.add(this.abdomen);
            // Brain-fold wrinkles on the abdomen.
            for (let i = 0; i < 6; i++) { const a = this.idRand() * 6.28; const fold = new THREE.Mesh(new THREE.TorusGeometry(0.12 + this.idRand() * 0.1, 0.03, 5, 10), wet); fold.position.set(Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0.25); fold.rotation.set(this.idRand() * 3, this.idRand() * 3, 0); this.abdomen.add(fold); }
            // Grasping limbs.
            const mkLeg = (x, s, lift) => { const g = new THREE.Group(); let ly = 0; for (let i = 0; i < 3; i++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.06 - i * 0.012, 8, 8), flesh); seg.position.set(s * i * 0.1, ly, 0); g.add(seg); ly -= 0.12; } g.position.set(x, 0.85, s * 0.18); g._s = s; g._lift = lift; this.bodyGroup.add(g); return g; };
            this.legL1 = mkLeg(0.25, 1, 0); this.legR1 = mkLeg(0.25, -1, 1);
            this.legL2 = mkLeg(0.05, 1, 1); this.legR2 = mkLeg(0.05, -1, 0);
            this.legL3 = mkLeg(-0.2, 1, 0); this.legR3 = mkLeg(-0.2, -1, 1);
            this._legs = [this.legL1, this.legR1, this.legL2, this.legR2, this.legL3, this.legR3];
            this._partMeshMap = { HEAD: this.head, THORAX: this.thorax, ABDOMEN: this.abdomen, MANDIBLES: this.mandibles, LEFT_LEG: this.legL1, RIGHT_LEG: this.legR1, MIDDLE_LEFT_LEG: this.legL2, MIDDLE_RIGHT_LEG: this.legR2, REAR_LEFT_LEG: this.legL3, REAR_RIGHT_LEG: this.legR3 };
            this._cascadeRules = [
                { gone: ['THORAX'], hide: [this.thorax, this.head, this.abdomen, this.mandibles, ...this._legs] },
                { gone: ['ABDOMEN'], hide: [this.abdomen] },
                { gone: ['HEAD'], hide: [this.head] }, { gone: ['MANDIBLES'], hide: [this.mandibles] },
                { gone: ['LEFT_LEG'], hide: [this.legL1] }, { gone: ['RIGHT_LEG'], hide: [this.legR1] },
                { gone: ['MIDDLE_LEFT_LEG'], hide: [this.legL2] }, { gone: ['MIDDLE_RIGHT_LEG'], hide: [this.legR2] },
                { gone: ['REAR_LEFT_LEG'], hide: [this.legL3] }, { gone: ['REAR_RIGHT_LEG'], hide: [this.legR3] },
            ];
        }

        // ── Mire Spider: venomous bog arachnid, dripping sacs + web (Spider) ──
        _buildMireSpider() {
            const p = this.profile;
            const chitin = this._skinMat(p.bodyColor, 0.55);
            const slime = this._mat(p.accent, 0.85, 0.3, p.accent);
            this.abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.58, 14, 12), chitin); this.abdomen.position.set(-0.5, 0.8, 0); this.abdomen.scale.set(1.0, 0.92, 1.15); this.bodyGroup.add(this.abdomen);
            this.sacs = [];
            for (let i = 0; i < 4; i++) { const a = this.idRand() * 6.28; const sac = new THREE.Mesh(new THREE.SphereGeometry(0.1 + this.idRand() * 0.05, 8, 8), slime); sac.position.set(Math.cos(a) * 0.3, 0.05 - this.idRand() * 0.25, Math.sin(a) * 0.35); this.abdomen.add(sac); this.sacs.push(sac); }
            this.cephalo = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 12), chitin); this.cephalo.position.set(0.25, 0.78, 0); this.bodyGroup.add(this.cephalo);
            this.head = new THREE.Group();
            const face = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), chitin); this.head.add(face);
            for (let i = 0; i < 4; i++) { const ex = -0.09 + (i % 2) * 0.18, ey = 0.04 + Math.floor(i / 2) * 0.08; this._eye(this.head, ex, ey, 0.16, 0.035, p.accent); }
            this.head.position.set(0.52, 0.82, 0); this.bodyGroup.add(this.head);
            this.fangs = new THREE.Group();
            for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.22, 5), this._mat(0x121810, 1.0, 0.5)); f.position.set(s * 0.06, -0.12, 0.15); f.rotation.x = 0.3; this.fangs.add(f); }
            this.head.add(this.fangs);
            this.spinnerets = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.24, 6), this._mat(0x1a2418, 1.0, 0.5)); this.spinnerets.position.set(-1.02, 0.78, 0); this.spinnerets.rotation.z = Math.PI / 2; this.bodyGroup.add(this.spinnerets);
            const web = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.9, 4), this._mat(0xdfe8e0, 0.4, 0.6)); web.position.set(-1.18, 0.33, 0); this.bodyGroup.add(web);
            const mkLeg = (x, z, s) => { const g = new THREE.Group(); const femur = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.58, 6), chitin); femur.position.set(s * 0.3, 0.08, 0); femur.rotation.z = -s * 1.25; g.add(femur); const tibia = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.62, 6), chitin); tibia.position.set(s * 0.56, -0.28, 0); tibia.rotation.z = -s * 0.35; g.add(tibia); g.position.set(x, 0.82, z); g._s = s; this.bodyGroup.add(g); return g; };
            this.legL1 = mkLeg(0.28, 0.3, 1); this.legR1 = mkLeg(0.28, -0.3, -1);
            this.legL2 = mkLeg(0.06, 0.34, 1); this.legR2 = mkLeg(0.06, -0.34, -1);
            this.legL3 = mkLeg(-0.2, 0.34, 1); this.legR3 = mkLeg(-0.2, -0.34, -1);
            this.legL4 = mkLeg(-0.45, 0.3, 1); this.legR4 = mkLeg(-0.45, -0.3, -1);
            this._legs = [this.legL1, this.legR1, this.legL2, this.legR2, this.legL3, this.legR3, this.legL4, this.legR4];
            this._partMeshMap = { HEAD: this.head, CEPHALOTHORAX: this.cephalo, ABDOMEN: this.abdomen, FANGS: this.fangs, SPINNERETS: this.spinnerets, LEFT_LEG: this.legL1, RIGHT_LEG: this.legR1, MID_LEFT_LEG: this.legL2, MID_RIGHT_LEG: this.legR2, MID_REAR_LEFT_LEG: this.legL3, MID_REAR_RIGHT_LEG: this.legR3, REAR_LEFT_LEG: this.legL4, REAR_RIGHT_LEG: this.legR4 };
            this._cascadeRules = [
                { gone: ['CEPHALOTHORAX'], hide: [this.cephalo, this.head, this.fangs, this.abdomen, this.spinnerets, ...this._legs] },
                { gone: ['ABDOMEN'], hide: [this.abdomen, this.spinnerets] },
                { gone: ['HEAD'], hide: [this.head] }, { gone: ['FANGS'], hide: [this.fangs] }, { gone: ['SPINNERETS'], hide: [this.spinnerets] },
                { gone: ['LEFT_LEG'], hide: [this.legL1] }, { gone: ['RIGHT_LEG'], hide: [this.legR1] },
                { gone: ['MID_LEFT_LEG'], hide: [this.legL2] }, { gone: ['MID_RIGHT_LEG'], hide: [this.legR2] },
                { gone: ['MID_REAR_LEFT_LEG'], hide: [this.legL3] }, { gone: ['MID_REAR_RIGHT_LEG'], hide: [this.legR3] },
                { gone: ['REAR_LEFT_LEG'], hide: [this.legL4] }, { gone: ['REAR_RIGHT_LEG'], hide: [this.legR4] },
            ];
        }

        // ── Monitor Lizard: low predatory reptile, long tail + claws (Reptilian) ──
        _buildMonitorLizard() {
            const p = this.profile;
            const scaleMat = this._skinMat(p.bodyColor, 0.6);
            this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.95, 6, 12), scaleMat); this.body.rotation.z = Math.PI / 2; this.body.position.set(-0.1, 0.55, 0); this.bodyGroup.add(this.body);
            const ridge = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.7, 4), this._mat(0x6a5a30, 1.0, 0.6)); ridge.rotation.z = Math.PI / 2; ridge.position.set(-0.1, 0.86, 0); ridge.scale.set(1, 1.8, 0.4); this.bodyGroup.add(ridge);
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.6, 10), scaleMat); skull.rotation.x = Math.PI / 2; skull.position.z = 0.2; this.head.add(skull);
            const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.42), scaleMat); jaw.position.set(0, -0.12, 0.28); this.head.add(jaw);
            this.tongue = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.34, 4), this._mat(0xd14a6a, 1.0, 0.5)); this.tongue.rotation.x = -Math.PI / 2; this.tongue.position.set(0, -0.06, 0.5); this.head.add(this.tongue);
            this._eye(this.head, -0.14, 0.14, 0.2, 0.06, p.accent); this._eye(this.head, 0.14, 0.14, 0.2, 0.06, p.accent);
            this.head.position.set(0.6, 0.62, 0); this.bodyGroup.add(this.head);
            this.tail = new THREE.Group();
            let tx = -0.6, ty = 0.5, tr = 0.24;
            for (let i = 0; i < 5; i++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(tr, 10, 8), scaleMat); seg.position.set(tx, ty, 0); this.tail.add(seg); tx -= tr * 1.5; ty -= 0.02; tr *= 0.78; }
            this.bodyGroup.add(this.tail);
            const mkLeg = (x, z, s) => { const g = new THREE.Group(); const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.5, 7), scaleMat); limb.position.set(s * 0.12, -0.15, 0); limb.rotation.z = -s * 0.6; g.add(limb); for (let c = 0; c < 3; c++) { const claw = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.1, 4), this._mat(0x141414, 1.0, 0.4)); claw.position.set(s * 0.26 + (c - 1) * 0.05, -0.36, 0.05); claw.rotation.x = 1.2; g.add(claw); } g.position.set(x, 0.42, z); this.bodyGroup.add(g); return g; };
            this.frontL = mkLeg(0.35, 0.32, 1); this.frontR = mkLeg(0.35, -0.32, -1);
            this.rearL = mkLeg(-0.35, 0.34, 1); this.rearR = mkLeg(-0.35, -0.34, -1);
            this._partMeshMap = { HEAD: this.head, TORSO: this.body, BODY: this.body, TAIL: this.tail, LEFT_ARM: this.frontL, RIGHT_ARM: this.frontR, LEFT_LEG: this.rearL, RIGHT_LEG: this.rearR };
            this._cascadeRules = [
                { gone: ['TORSO', 'BODY'], hide: [this.body, this.head, this.tail, this.frontL, this.frontR, this.rearL, this.rearR] },
                { gone: ['HEAD'], hide: [this.head] }, { gone: ['TAIL'], hide: [this.tail] },
                { gone: ['LEFT_ARM'], hide: [this.frontL] }, { gone: ['RIGHT_ARM'], hide: [this.frontR] },
                { gone: ['LEFT_LEG'], hide: [this.rearL] }, { gone: ['RIGHT_LEG'], hide: [this.rearR] },
            ];
        }

        // ── Monstrous Badger: stocky burrower, striped face, iron claws (Beast) ──
        _buildMonstrousBadger() {
            const p = this.profile;
            const fur = this._skinMat(p.bodyColor, 0.85);
            const pale = this._mat(0xe8e4d8, 1.0, 0.8);
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 12), fur); this.body.scale.set(1.5, 0.85, 1.0); this.body.position.set(-0.15, 0.55, 0); this.bodyGroup.add(this.body);
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), pale); skull.scale.set(1.0, 0.95, 1.1); this.head.add(skull);
            for (const s of [-1, 1]) { const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.34, 0.2), fur); stripe.position.set(s * 0.13, 0.02, 0.16); this.head.add(stripe); }
            const snout = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.26, 8), pale); snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.04, 0.3); this.head.add(snout);
            const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), this._mat(0x1a1a1a, 1.0, 0.4)); nose.position.set(0, -0.04, 0.44); this.head.add(nose);
            this._eye(this.head, -0.13, 0.1, 0.22, 0.045, p.accent); this._eye(this.head, 0.13, 0.1, 0.22, 0.045, p.accent);
            this.head.position.set(0.6, 0.6, 0); this.bodyGroup.add(this.head);
            this.tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 8), fur); this.tail.rotation.x = -Math.PI / 2.5; this.tail.position.set(-0.75, 0.6, 0); this.bodyGroup.add(this.tail);
            const mkLeg = (x, z) => { const g = new THREE.Group(); const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.42, 8), fur); leg.position.y = -0.1; g.add(leg); for (let c = 0; c < 3; c++) { const claw = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 5), this._mat(0x9aa0aa, 1.0, 0.25, 0x223040)); claw.position.set((c - 1) * 0.07, -0.32, 0.12); claw.rotation.x = 1.4; g.add(claw); } g.position.set(x, 0.4, z); this.bodyGroup.add(g); return g; };
            this.legFL = mkLeg(0.35, 0.3); this.legFR = mkLeg(0.35, -0.3);
            this.legRL = mkLeg(-0.4, 0.3); this.legRR = mkLeg(-0.4, -0.3);
            this._partMeshMap = { HEAD: this.head, BODY: this.body, TAIL: this.tail, LEFT_LEG: this.legFL, RIGHT_LEG: this.legFR, REAR_LEFT_LEG: this.legRL, REAR_RIGHT_LEG: this.legRR };
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.body, this.head, this.tail, this.legFL, this.legFR, this.legRL, this.legRR] },
                { gone: ['HEAD'], hide: [this.head] }, { gone: ['TAIL'], hide: [this.tail] },
                { gone: ['LEFT_LEG'], hide: [this.legFL] }, { gone: ['RIGHT_LEG'], hide: [this.legFR] },
                { gone: ['REAR_LEFT_LEG'], hide: [this.legRL] }, { gone: ['REAR_RIGHT_LEG'], hide: [this.legRR] },
            ];
        }

        // ── Mutant Bug: aggressive segmented carrion crawler (SegmentWorm) ──────
        _buildMutantBug() {
            const p = this.profile;
            const chitin = this._skinMat(p.bodyColor, 0.5);
            this.heart = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), this._mat(p.accent, 0.9, 0.3, p.accent)); this.heart.position.set(-0.1, 0.5, 0); this.bodyGroup.add(this.heart);
            this.bodySeg = new THREE.Group();
            let sx = 0.2, sr = 0.26;
            for (let i = 0; i < 4; i++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(sr, 10, 8), chitin); seg.position.set(sx, 0.5, 0); this.bodySeg.add(seg); for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 5), chitin); leg.position.set(sx, 0.4, s * 0.18); leg.rotation.x = s * 0.6; this.bodySeg.add(leg); } sx -= sr * 1.4; sr *= 0.9; }
            this.bodyGroup.add(this.bodySeg);
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), chitin); this.head.add(skull);
            for (const s of [-1, 1]) { const mand = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.26, 5), this._mat(0x141008, 1.0, 0.4)); mand.position.set(s * 0.12, -0.05, 0.2); mand.rotation.set(1.2, 0, -s * 0.4); this.head.add(mand); }
            this._eye(this.head, -0.1, 0.08, 0.18, 0.05, p.accent); this._eye(this.head, 0.1, 0.08, 0.18, 0.05, p.accent);
            this.head.position.set(0.5, 0.52, 0); this.bodyGroup.add(this.head);
            this.tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 6), chitin); this.tail.rotation.x = -1.0; this.tail.position.set(-0.95, 0.55, 0); this.bodyGroup.add(this.tail);
            this._partMeshMap = { HEAD: this.head, HEART_SEGMENT: this.heart, BODY_SEGMENT: this.bodySeg, TAIL: this.tail };
            this._cascadeRules = [
                { gone: ['HEART_SEGMENT'], hide: [this.heart, this.bodySeg, this.head, this.tail] },
                { gone: ['BODY_SEGMENT'], hide: [this.bodySeg, this.tail] },
                { gone: ['HEAD'], hide: [this.head] }, { gone: ['TAIL'], hide: [this.tail] },
            ];
        }

        // ── Overworked Villager: weary peasant slumped over a hoe (Humanoid) ────
        _buildOverworkedVillager() {
            const p = this.profile;
            const cloth = this._skinMat(p.bodyColor, 0.85);
            const skin = this._mat(0xcaa07a, 1.0, 0.7);
            this.body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.95, 12), cloth); this.body.position.y = 0.95; this.body.rotation.x = 0.12; this.bodyGroup.add(this.body);
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.27, 14, 14), skin); this.head.add(skull);
            for (const s of [-1, 1]) { const bag = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), this._mat(0x6a4a3a, 1.0, 0.7)); bag.scale.set(1.3, 0.5, 0.4); bag.position.set(s * 0.1, -0.02, 0.23); this.head.add(bag); this._eye(this.head, s * 0.1, 0.04, 0.22, 0.05, p.accent); }
            const brow = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.05), this._mat(0x3a2a1a, 1.0, 0.6)); brow.position.set(0, 0.13, 0.24); brow.rotation.z = 0.1; this.head.add(brow);
            this.head.position.set(0.05, 1.55, 0.02); this.head.rotation.x = 0.25; this.bodyGroup.add(this.head);
            this.leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.7, 8), cloth); this.leftArm.position.set(-0.38, 1.0, 0); this.leftArm.rotation.z = 0.25; this.bodyGroup.add(this.leftArm);
            this.rightArm = new THREE.Group();
            const ra = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.7, 8), cloth); ra.position.set(0.36, 0.0, 0); ra.rotation.z = -0.2; this.rightArm.add(ra);
            const hoe = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 6), this._mat(0x6e4a28, 1.0, 0.7)); hoe.position.set(0.5, -0.1, 0.1); this.rightArm.add(hoe);
            const blade = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.03), this._mat(0x9aa0aa, 1.0, 0.3)); blade.position.set(0.5, -0.6, 0.1); this.rightArm.add(blade);
            this.rightArm.position.set(0, 1.1, 0); this.bodyGroup.add(this.rightArm);
            this.leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.6, 8), this._mat(0x4a3a2a, 1.0, 0.8)); this.leftLeg.position.set(-0.14, 0.3, 0); this.bodyGroup.add(this.leftLeg);
            this.rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.6, 8), this._mat(0x4a3a2a, 1.0, 0.8)); this.rightLeg.position.set(0.14, 0.3, 0); this.bodyGroup.add(this.rightLeg);
            this._mapCommon({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm, leftLeg: this.leftLeg, rightLeg: this.rightLeg });
            this._bodyCascade({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm, leftLeg: this.leftLeg, rightLeg: this.rightLeg });
        }

        // ── Primal Kangaroo: savage hopper, gnashing jaw, huge legs (Beast) ─────
        _buildPrimalKangaroo() {
            const p = this.profile;
            const fur = this._skinMat(p.bodyColor, 0.8);
            this.body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 1.0, 12), fur); this.body.position.set(0, 1.0, 0); this.body.rotation.x = -0.15; this.bodyGroup.add(this.body);
            const scar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.4, 0.02), this._mat(0x7a2a22, 1.0, 0.6)); scar.position.set(0.12, 1.05, 0.4); scar.rotation.z = 0.5; this.bodyGroup.add(scar);
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), fur); skull.scale.set(1.0, 0.9, 1.3); this.head.add(skull);
            this.jaw = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.34), fur); this.jaw.position.set(0, -0.13, 0.18); this.head.add(this.jaw);
            for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.28, 6), fur); ear.position.set(s * 0.12, 0.26, -0.05); ear.rotation.z = s * 0.2; this.head.add(ear); this._eye(this.head, s * 0.12, 0.08, 0.2, 0.05, p.accent); }
            this.head.position.set(0, 1.7, 0.1); this.bodyGroup.add(this.head);
            this.leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.45, 7), fur); this.leftArm.position.set(-0.3, 1.05, 0.15); this.leftArm.rotation.z = 0.5; this.bodyGroup.add(this.leftArm);
            this.rightArm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.45, 7), fur); this.rightArm.position.set(0.3, 1.05, 0.15); this.rightArm.rotation.z = -0.5; this.bodyGroup.add(this.rightArm);
            const mkHind = (s) => { const g = new THREE.Group(); const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.5, 8), fur); thigh.position.y = -0.05; g.add(thigh); const foot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.5), fur); foot.position.set(0, -0.34, 0.15); g.add(foot); g.position.set(s * 0.18, 0.55, 0); this.bodyGroup.add(g); return g; };
            this.leftLeg = mkHind(-1); this.rightLeg = mkHind(1);
            this.tail = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.1, 8), fur); this.tail.rotation.x = 1.3; this.tail.position.set(0, 0.45, -0.6); this.bodyGroup.add(this.tail);
            this._partMeshMap = { HEAD: this.head, BODY: this.body, TAIL: this.tail, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg, REAR_LEFT_LEG: this.leftArm, REAR_RIGHT_LEG: this.rightArm };
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.body, this.head, this.tail, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg] },
                { gone: ['HEAD'], hide: [this.head] }, { gone: ['TAIL'], hide: [this.tail] },
                { gone: ['LEFT_LEG'], hide: [this.leftLeg] }, { gone: ['RIGHT_LEG'], hide: [this.rightLeg] },
                { gone: ['REAR_LEFT_LEG'], hide: [this.leftArm] }, { gone: ['REAR_RIGHT_LEG'], hide: [this.rightArm] },
            ];
        }

        // ── Quagmire Creeper: arched leech, gaping toothed sucker (SegmentWorm) ──
        _buildQuagmireCreeper() {
            const p = this.profile;
            const flesh = this._skinMat(p.bodyColor, 0.4);
            this.bodySeg = new THREE.Group();
            const segN = 6;
            for (let i = 0; i < segN; i++) { const t = i / (segN - 1); const seg = new THREE.Mesh(new THREE.SphereGeometry(0.3 - t * 0.12, 12, 10), flesh); seg.scale.set(1.2, 0.7, 1.0); const ang = Math.PI * (0.15 + t * 0.7); seg.position.set(Math.cos(ang) * 0.7 - 0.2, 0.4 + Math.sin(ang) * 0.7, 0); this.bodySeg.add(seg); }
            this.bodyGroup.add(this.bodySeg);
            this.heart = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), this._mat(p.accent, 0.85, 0.3, p.accent)); this.heart.position.set(0.0, 0.95, 0.0); this.bodyGroup.add(this.heart);
            this.head = new THREE.Group();
            const maw = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.12, 0.3, 12, 1, true), this._mat(0x4a1a22, 1.0, 0.5)); maw.rotation.x = -1.2; this.head.add(maw);
            this.teeth = new THREE.Group();
            for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.12, 4), this._mat(0xe8e0d0, 1.0, 0.5)); tooth.position.set(Math.cos(a) * 0.2, 0.0, Math.sin(a) * 0.2); tooth.rotation.x = -1.4; this.teeth.add(tooth); }
            this.head.add(this.teeth);
            this.head.position.set(0.55, 0.6, 0); this.head.rotation.z = -0.6; this.bodyGroup.add(this.head);
            this.tail = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), flesh); this.tail.scale.set(1, 0.5, 1); this.tail.position.set(-0.75, 0.25, 0); this.bodyGroup.add(this.tail);
            this.drips = new THREE.Group();
            for (let i = 0; i < 4; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), this._mat(p.accent, 0.7, 0.3, p.accent)); d.position.set(0.55 + (this.idRand() - 0.5) * 0.3, 0.4 - this.idRand() * 0.3, 0); this.drips.add(d); }
            this.bodyGroup.add(this.drips); this._floaters.push(this.drips);
            // The tail end of the arch runs down to the ground.
            this.addStrut(this.bodySeg, flesh, new THREE.Vector3(-0.824, 0.718, 0), new THREE.Vector3(-0.75, 0.25, 0), 0.1, 0.12, 8);
            this._partMeshMap = { HEAD: this.head, HEART_SEGMENT: this.heart, BODY_SEGMENT: this.bodySeg, TAIL: this.tail };
            this._cascadeRules = [
                { gone: ['HEART_SEGMENT'], hide: [this.heart, this.bodySeg, this.head, this.tail, this.drips] },
                { gone: ['BODY_SEGMENT'], hide: [this.bodySeg, this.tail] },
                { gone: ['HEAD'], hide: [this.head] }, { gone: ['TAIL'], hide: [this.tail] },
            ];
        }

        // ── Rabid Jackrabbit: frenzied foaming hopper, long ears (Rabbit) ──────
        _buildRabidJackrabbit() {
            const p = this.profile;
            const fur = this._skinMat(p.bodyColor, 0.85);
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 12), fur); this.body.scale.set(0.9, 1.1, 1.0); this.body.position.set(0, 0.75, 0); this.bodyGroup.add(this.body);
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 14), fur); this.head.add(skull);
            const snout = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), fur); snout.position.set(0, -0.08, 0.22); this.head.add(snout);
            this.foam = new THREE.Group();
            for (let i = 0; i < 5; i++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), this._mat(0xf2f2f0, 0.9, 0.5)); f.position.set((this.idRand() - 0.5) * 0.16, -0.16 - this.idRand() * 0.08, 0.25); this.foam.add(f); }
            this.head.add(this.foam);
            for (const s of [-1, 1]) this._eye(this.head, s * 0.12, 0.06, 0.2, 0.055, p.accent);
            this.head.position.set(0, 1.25, 0.05); this.bodyGroup.add(this.head);
            this.ears = new THREE.Group();
            for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.4, 4, 8), fur); ear.position.set(s * 0.1, 0.3, -0.02); ear.rotation.z = s * 0.18; this.ears.add(ear); }
            this.head.add(this.ears);
            this.foreL = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.4, 7), fur); this.foreL.position.set(-0.18, 0.45, 0.18); this.bodyGroup.add(this.foreL);
            this.foreR = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.4, 7), fur); this.foreR.position.set(0.18, 0.45, 0.18); this.bodyGroup.add(this.foreR);
            const mkHind = (s) => { const g = new THREE.Group(); const thigh = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 10), fur); thigh.scale.set(0.7, 1.0, 1.3); g.add(thigh); const foot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.4), fur); foot.position.set(0, -0.2, 0.12); g.add(foot); g.position.set(s * 0.22, 0.4, -0.05); this.bodyGroup.add(g); return g; };
            this.hindL = mkHind(-1); this.hindR = mkHind(1);
            this.tail = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), this._mat(0xf0ece0, 1.0, 0.9)); this.tail.position.set(0, 0.7, -0.4); this.bodyGroup.add(this.tail);
            this._partMeshMap = { HEAD: this.head, BODY: this.body, EARS: this.ears, TAIL: this.tail, LEFT_LEG: this.foreL, RIGHT_LEG: this.foreR, REAR_LEFT_LEG: this.hindL, REAR_RIGHT_LEG: this.hindR };
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.body, this.head, this.ears, this.tail, this.foreL, this.foreR, this.hindL, this.hindR] },
                { gone: ['HEAD'], hide: [this.head, this.ears] }, { gone: ['EARS'], hide: [this.ears] }, { gone: ['TAIL'], hide: [this.tail] },
                { gone: ['LEFT_LEG'], hide: [this.foreL] }, { gone: ['RIGHT_LEG'], hide: [this.foreR] },
                { gone: ['REAR_LEFT_LEG'], hide: [this.hindL] }, { gone: ['REAR_RIGHT_LEG'], hide: [this.hindR] },
            ];
        }

        // ── Reaganite: a faceted crystal fragment of a shattered soul (CrystalEntity) ──
        _buildReaganite() {
            const p = this.profile;
            const crystal = this._mat(p.bodyColor, 0.6, 0.1, p.bodyColor); crystal.flatShading = true;
            this.core = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), crystal); this.core.position.y = 1.1; this.core.scale.set(0.9, 1.3, 0.9); this.bodyGroup.add(this.core);
            this.focus = new THREE.Group();
            const gem = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 0), this._mat(p.accent, 0.85, 0.1, p.accent)); this.focus.add(gem);
            for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), this._mat(0xffffff, 0.9, 0.2, 0xffffff)); e.position.set(s * 0.07, 0.04, 0.15); this.focus.add(e); }
            this.focus.position.y = 1.1; this.bodyGroup.add(this.focus);
            this.leftSpire = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 5), crystal); this.leftSpire.position.set(-0.45, 0.9, 0); this.leftSpire.rotation.z = 0.3; this.bodyGroup.add(this.leftSpire);
            this.rightSpire = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 5), crystal); this.rightSpire.position.set(0.45, 0.9, 0); this.rightSpire.rotation.z = -0.3; this.bodyGroup.add(this.rightSpire);
            this.shield = new THREE.Group();
            for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const sh = new THREE.Mesh(new THREE.TetrahedronGeometry(0.1, 0), crystal); sh.position.set(Math.cos(a) * 0.6, 1.1, Math.sin(a) * 0.6); this.shield.add(sh); }
            this.bodyGroup.add(this.shield);
            this._partMeshMap = { CORE: this.core, FOCUS_GEM: this.focus, LEFT_SPIRE: this.leftSpire, RIGHT_SPIRE: this.rightSpire, SHIELD_CRYSTAL: this.shield };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.focus, this.leftSpire, this.rightSpire, this.shield] },
                { gone: ['FOCUS_GEM'], hide: [this.focus] }, { gone: ['LEFT_SPIRE'], hide: [this.leftSpire] }, { gone: ['RIGHT_SPIRE'], hide: [this.rightSpire] },
                { gone: ['SHIELD_CRYSTAL'], hide: [this.shield] },
            ];
        }

        // ── Rib Cage Crab: crab wearing a human ribcage, heart still beats (Crustacean) ──
        _buildRibCageCrab() {
            const p = this.profile;
            const shellMat = this._skinMat(p.bodyColor, 0.6);
            const bone = this._mat(0xe8e0cc, 1.0, 0.7);
            this.carapace = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), shellMat); this.carapace.scale.set(1.3, 0.7, 1.0); this.carapace.position.set(0, 0.55, 0); this.bodyGroup.add(this.carapace);
            this.ribs = new THREE.Group();
            for (let i = 0; i < 5; i++) { const z = -0.3 + i * 0.15; const rib = new THREE.Mesh(new THREE.TorusGeometry(0.28 - Math.abs(i - 2) * 0.03, 0.03, 6, 14, Math.PI), bone); rib.position.set(0, 0.62, z); rib.rotation.x = -Math.PI / 2; this.ribs.add(rib); }
            const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6), bone); spine.rotation.x = Math.PI / 2; spine.position.set(0, 0.62, 0); this.ribs.add(spine);
            this.carapace.add(this.ribs);
            this.heart = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), this._mat(p.accent, 0.9, 0.3, p.accent)); this.heart.position.set(0, 0.62, 0); this.carapace.add(this.heart);
            this.abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), shellMat); this.abdomen.position.set(0, 0.45, -0.45); this.bodyGroup.add(this.abdomen);
            const mkClaw = (s) => { const g = new THREE.Group(); const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.4, 7), shellMat); arm.rotation.z = Math.PI / 2; arm.position.x = s * 0.2; g.add(arm); const pincer = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), shellMat); pincer.scale.set(1.2, 0.7, 0.8); pincer.position.x = s * 0.45; g.add(pincer); const claw2 = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.24, 6), bone); claw2.position.set(s * 0.6, 0.06, 0); claw2.rotation.z = s * Math.PI / 2; g.add(claw2); g.position.set(s * 0.45, 0.55, 0.25); this.bodyGroup.add(g); return g; };
            this.clawL = mkClaw(-1); this.clawR = mkClaw(1);
            this.frontLeg = new THREE.Group(); this.rearLeg = new THREE.Group();
            for (let i = 0; i < 3; i++) { for (const s of [-1, 1]) { const tgt = i < 2 ? this.frontLeg : this.rearLeg; const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.4, 5), shellMat); leg.position.set(s * 0.5, 0.35, -0.1 + i * 0.18); leg.rotation.z = s * 1.0; tgt.add(leg); } }
            this.bodyGroup.add(this.frontLeg); this.bodyGroup.add(this.rearLeg);
            this.antennae = new THREE.Group();
            for (const s of [-1, 1]) { const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.2, 5), shellMat); stalk.position.set(s * 0.12, 0.78, 0.3); this.antennae.add(stalk); this._eye(this.antennae, s * 0.12, 0.9, 0.3, 0.05, p.accent); }
            this.bodyGroup.add(this.antennae);
            this._partMeshMap = { CARAPACE: this.carapace, ABDOMEN: this.abdomen, CLAW_LEFT: this.clawL, CLAW_RIGHT: this.clawR, FRONT_LEG: this.frontLeg, REAR_LEG: this.rearLeg, ANTENNAE: this.antennae };
            this._cascadeRules = [
                { gone: ['CARAPACE'], hide: [this.carapace, this.abdomen, this.clawL, this.clawR, this.frontLeg, this.rearLeg, this.antennae] },
                { gone: ['ABDOMEN'], hide: [this.abdomen] }, { gone: ['CLAW_LEFT'], hide: [this.clawL] }, { gone: ['CLAW_RIGHT'], hide: [this.clawR] },
                { gone: ['FRONT_LEG'], hide: [this.frontLeg] }, { gone: ['REAR_LEG'], hide: [this.rearLeg] }, { gone: ['ANTENNAE'], hide: [this.antennae] },
            ];
        }

        // ── Security Bot: riot android with optic + stun baton (Robot) ─────────
        _buildSecurityBot() {
            const p = this.profile;
            const metal = this._skinMat(p.bodyColor, 0.35);
            const dark = this._mat(0x2a2e34, 1.0, 0.4);
            this.core = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.4), metal); this.core.position.y = 1.0; this.bodyGroup.add(this.core);
            const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.05), dark); plate.position.set(0, 1.05, 0.22); this.bodyGroup.add(plate);
            this.head = new THREE.Group();
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12, 0, Math.PI * 2, 0, Math.PI / 2), metal); this.head.add(dome);
            const visor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.05), dark); visor.position.set(0, 0.02, 0.2); this.head.add(visor);
            this.optic = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10), this._mat(p.accent, 0.9, 0.2, p.accent)); this.optic.position.set(0, 0.02, 0.24); this.head.add(this.optic);
            this.head.position.set(0, 1.35, 0); this.bodyGroup.add(this.head);
            this.leftArm = new THREE.Group();
            const la = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.55, 8), metal); la.position.y = -0.05; this.leftArm.add(la);
            const shield = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.4), dark); shield.position.set(0, -0.3, 0.1); this.leftArm.add(shield);
            this.leftArm.position.set(-0.42, 1.15, 0); this.bodyGroup.add(this.leftArm);
            this.rightArm = new THREE.Group();
            const ra = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.55, 8), metal); ra.position.y = -0.05; this.rightArm.add(ra);
            this.baton = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6), dark); this.baton.position.set(0, -0.5, 0.1); this.rightArm.add(this.baton);
            this.batonTip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), this._mat(p.accent, 0.9, 0.2, p.accent)); this.batonTip.position.set(0, -0.78, 0.1); this.rightArm.add(this.batonTip);
            this.rightArm.position.set(0.42, 1.15, 0); this.bodyGroup.add(this.rightArm);
            this.leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.2), metal); this.leftLeg.position.set(-0.16, 0.35, 0); this.bodyGroup.add(this.leftLeg);
            this.rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.2), metal); this.rightLeg.position.set(0.16, 0.35, 0); this.bodyGroup.add(this.rightLeg);
            this._partMeshMap = { HEAD: this.head, CORE: this.core, BODY: this.core, LEFT_ARM: this.leftArm, RIGHT_ARM: this.rightArm, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.head, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg] },
                { gone: ['HEAD'], hide: [this.head] }, { gone: ['LEFT_ARM'], hide: [this.leftArm] }, { gone: ['RIGHT_ARM'], hide: [this.rightArm] },
                { gone: ['LEFT_LEG'], hide: [this.leftLeg] }, { gone: ['RIGHT_LEG'], hide: [this.rightLeg] },
            ];
        }

        // ── Seraphic Emissary: celestial envoy with fiery wings + halo (Angel) ──
        _buildSeraphicEmissary() {
            const p = this.profile;
            const robeMat = this._skinMat(p.bodyColor, 0.6);
            const glow = this._mat(p.accent, 0.85, 0.2, p.accent);
            this.core = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 0.7, 12), robeMat); torso.position.y = 1.1; this.core.add(torso);
            const headM = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 14), this._mat(0xfff0d8, 1.0, 0.5, 0x553311)); headM.position.y = 1.6; this.core.add(headM);
            this.bodyGroup.add(this.core);
            this.robe = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.0, 14), robeMat); this.robe.position.y = 0.55; this.bodyGroup.add(this.robe);
            this.halo = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 8, 20), glow); this.halo.position.y = 1.95; this.halo.rotation.x = Math.PI / 2; this.bodyGroup.add(this.halo); this._floaters.push(this.halo);
            const mkWing = (s) => { const g = new THREE.Group(); for (let i = 0; i < 4; i++) { const feather = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.7 - i * 0.1, 5), this._mat(0xfff0d8, 0.92, 0.4, p.accent)); feather.position.set(s * (0.2 + i * 0.18), 0.1 - i * 0.12, -0.05); feather.rotation.z = s * (1.1 + i * 0.15); g.add(feather); } g.position.set(s * 0.2, 1.3, -0.1); this.bodyGroup.add(g); return g; };
            this.leftWing = mkWing(-1); this.rightWing = mkWing(1);
            this.leftFoot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), this._mat(0xfff0d8, 1.0, 0.5)); this.leftFoot.position.set(-0.12, 0.1, 0.05); this.bodyGroup.add(this.leftFoot);
            this.rightFoot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), this._mat(0xfff0d8, 1.0, 0.5)); this.rightFoot.position.set(0.12, 0.1, 0.05); this.bodyGroup.add(this.rightFoot);
            this._partMeshMap = { CORE: this.core, HEAD: this.core, ROBE: this.robe, HALO: this.halo, LEFT_WING: this.leftWing, RIGHT_WING: this.rightWing, LEFT_FOOT: this.leftFoot, RIGHT_FOOT: this.rightFoot };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.robe, this.halo, this.leftWing, this.rightWing, this.leftFoot, this.rightFoot] },
                { gone: ['ROBE'], hide: [this.robe] }, { gone: ['HALO'], hide: [this.halo] },
                { gone: ['LEFT_WING'], hide: [this.leftWing] }, { gone: ['RIGHT_WING'], hide: [this.rightWing] },
                { gone: ['LEFT_FOOT'], hide: [this.leftFoot] }, { gone: ['RIGHT_FOOT'], hide: [this.rightFoot] },
            ];
        }

        // Shared limb builders for the shadow/storm batch.
        _wispArm(side, mat, accent) {
            const g = new THREE.Group();
            let y = 0;
            for (let i = 0; i < 4; i++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.12 - i * 0.02, 8, 8), mat); seg.position.set(side * (0.1 + i * 0.12), y, 0); g.add(seg); y -= 0.05; }
            const claw = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 5), this._mat(accent, 0.85, 0.2, accent)); claw.position.set(side * 0.6, -0.2, 0); claw.rotation.z = side * 1.2; g.add(claw);
            g.position.set(side * 0.2, 1.15, 0.1); this.bodyGroup.add(g); return g;
        }
        _boltLimb(side, y, mat) {
            const g = new THREE.Group();
            let px = 0, py = 0;
            for (let i = 0; i < 3; i++) { const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.28, 4), mat); seg.position.set(px, py, 0); seg.rotation.z = side * (i % 2 ? 0.6 : -0.4); g.add(seg); px += side * 0.12; py -= 0.22; }
            g.position.set(side * 0.35, y, 0.05); this.bodyGroup.add(g); return g;
        }

        // ── Shadow Crawler: a shadow-phasing insect (Insectoid) ────────────────
        _buildShadowCrawler() {
            const p = this.profile;
            const shadow = this._skinMat(p.bodyColor, 0.4); shadow.transparent = true; shadow.opacity = 0.78;
            this.thorax = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 12), shadow); this.thorax.position.set(0.15, 0.6, 0); this.bodyGroup.add(this.thorax);
            this.abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 12), shadow); this.abdomen.position.set(-0.45, 0.6, 0); this.abdomen.scale.set(1.1, 0.9, 1.0); this.bodyGroup.add(this.abdomen);
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), shadow); this.head.add(skull);
            this._eye(this.head, -0.1, 0.06, 0.18, 0.05, p.accent); this._eye(this.head, 0.1, 0.06, 0.18, 0.05, p.accent);
            this.head.position.set(0.5, 0.62, 0); this.bodyGroup.add(this.head);
            this.mandibles = new THREE.Group();
            for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.24, 5), this._mat(p.accent, 0.9, 0.3, p.accent)); m.position.set(s * 0.1, -0.06, 0.2); m.rotation.set(1.2, 0, -s * 0.4); this.mandibles.add(m); }
            this.head.add(this.mandibles);
            const mkLeg = (x, z, s) => { const g = new THREE.Group(); const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.6, 6), shadow); leg.position.set(s * 0.28, -0.06, 0); leg.rotation.z = -s * 1.0; g.add(leg); g.position.set(x, 0.6, z); this.bodyGroup.add(g); return g; };
            this.legL1 = mkLeg(0.25, 0.28, 1); this.legR1 = mkLeg(0.25, -0.28, -1);
            this.legL2 = mkLeg(0.0, 0.32, 1); this.legR2 = mkLeg(0.0, -0.32, -1);
            this.legL3 = mkLeg(-0.3, 0.3, 1); this.legR3 = mkLeg(-0.3, -0.3, -1);
            this._legs = [this.legL1, this.legR1, this.legL2, this.legR2, this.legL3, this.legR3];
            this._partMeshMap = { HEAD: this.head, THORAX: this.thorax, ABDOMEN: this.abdomen, MANDIBLES: this.mandibles, LEFT_LEG: this.legL1, RIGHT_LEG: this.legR1, MIDDLE_LEFT_LEG: this.legL2, MIDDLE_RIGHT_LEG: this.legR2, REAR_LEFT_LEG: this.legL3, REAR_RIGHT_LEG: this.legR3 };
            this._cascadeRules = [
                { gone: ['THORAX'], hide: [this.thorax, this.head, this.mandibles, this.abdomen, ...this._legs] },
                { gone: ['ABDOMEN'], hide: [this.abdomen] }, { gone: ['HEAD'], hide: [this.head, this.mandibles] }, { gone: ['MANDIBLES'], hide: [this.mandibles] },
                { gone: ['LEFT_LEG'], hide: [this.legL1] }, { gone: ['RIGHT_LEG'], hide: [this.legR1] },
                { gone: ['MIDDLE_LEFT_LEG'], hide: [this.legL2] }, { gone: ['MIDDLE_RIGHT_LEG'], hide: [this.legR2] },
                { gone: ['REAR_LEFT_LEG'], hide: [this.legL3] }, { gone: ['REAR_RIGHT_LEG'], hide: [this.legR3] },
            ];
        }

        // ── Shadow Stalker: hooded shadow predator with wisp claws (Ghost) ─────
        _buildShadowStalker() {
            const p = this.profile;
            const shade = this._mat(p.bodyColor, 0.7, 0.5, 0x05030a); shade.transparent = true;
            this.core = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.5, 12), shade); this.core.position.y = 0.95; this.bodyGroup.add(this.core);
            this.face = new THREE.Group();
            const hood = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.65), shade); this.face.add(hood);
            for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), this._mat(p.accent, 0.95, 0.2, p.accent)); e.position.set(s * 0.1, -0.05, 0.2); this.face.add(e); }
            this.face.position.set(0, 1.55, 0.02); this.bodyGroup.add(this.face);
            this.leftWisp = this._wispArm(-1, shade, p.accent); this.rightWisp = this._wispArm(1, shade, p.accent);
            this._partMeshMap = { FACE: this.face, CORE: this.core, HEAD: this.face, BODY: this.core, LEFT_WISP: this.leftWisp, RIGHT_WISP: this.rightWisp };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.face, this.leftWisp, this.rightWisp] },
                { gone: ['FACE'], hide: [this.face] }, { gone: ['LEFT_WISP'], hide: [this.leftWisp] }, { gone: ['RIGHT_WISP'], hide: [this.rightWisp] },
            ];
        }

        // ── Shadow Wraith: drifting tattered specter, ethereal claws (Ghost) ───
        _buildShadowWraith() {
            const p = this.profile;
            const ether = this._mat(p.bodyColor, 0.55, 0.6, 0x0a0614); ether.transparent = true;
            this.core = new THREE.Group();
            const body = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.6, 12), ether); body.position.y = 0.9; this.core.add(body);
            this.tatters = new THREE.Group();
            for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; const tt = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.5 + this.idRand() * 0.3, 4), ether); tt.position.set(Math.cos(a) * 0.35, 0.2, Math.sin(a) * 0.35); tt.rotation.x = Math.PI; this.tatters.add(tt); }
            this.core.add(this.tatters); this.bodyGroup.add(this.core);
            this.face = new THREE.Group();
            const hood = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.7), ether); this.face.add(hood);
            const glow = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), this._mat(p.accent, 0.9, 0.2, p.accent)); glow.position.set(0, -0.02, 0.1); this.face.add(glow);
            this.face.position.set(0, 1.6, 0.02); this.bodyGroup.add(this.face);
            this.leftWisp = this._wispArm(-1, ether, p.accent); this.rightWisp = this._wispArm(1, ether, p.accent);
            this._partMeshMap = { FACE: this.face, CORE: this.core, HEAD: this.face, BODY: this.core, LEFT_WISP: this.leftWisp, RIGHT_WISP: this.rightWisp };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.face, this.leftWisp, this.rightWisp] },
                { gone: ['FACE'], hide: [this.face] }, { gone: ['LEFT_WISP'], hide: [this.leftWisp] }, { gone: ['RIGHT_WISP'], hide: [this.rightWisp] },
            ];
        }

        // ── Spectral Wardstone: rune-stone trapping a spirit + lantern (Totem) ──
        _buildSpectralWardstone() {
            const p = this.profile;
            const stone = this._skinMat(p.bodyColor, 0.85);
            const rune = this._mat(p.accent, 0.9, 0.3, p.accent);
            this.base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.35, 8), stone); this.base.position.y = 0.2; this.bodyGroup.add(this.base);
            this.core = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.2, 0.4), stone); this.core.position.y = 1.0; this.bodyGroup.add(this.core);
            this.runes = new THREE.Group();
            for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.018, 6, 10), rune); r.position.set((this.idRand() - 0.5) * 0.3, 0.7 + i * 0.22, 0.21); this.runes.add(r); }
            this.core.add(this.runes);
            this.eyes = new THREE.Group();
            const lantern = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), this._mat(p.accent, 0.85, 0.2, p.accent)); this.eyes.add(lantern);
            this.eyes.position.set(0, 1.75, 0.1); this.bodyGroup.add(this.eyes);
            const mkHand = (s) => { const g = new THREE.Group(); const palm = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), stone); palm.scale.set(1, 0.6, 1); g.add(palm); for (let f = 0; f < 3; f++) { const fin = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.015, 0.18, 5), stone); fin.position.set((f - 1) * 0.07, 0.1, 0.05); g.add(fin); } this.addStrut(g, stone, new THREE.Vector3(0, 0, 0), new THREE.Vector3(-s * 0.3, 0, -0.12), 0.06, 0.07, 6); g.position.set(s * 0.55, 1.1, 0.2); this.bodyGroup.add(g); return g; };
            this.leftArm = mkHand(-1); this.rightArm = mkHand(1);
            this._partMeshMap = { CORE: this.core, BASE: this.base, EYES: this.eyes, LEFT_ARM: this.leftArm, RIGHT_ARM: this.rightArm };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.eyes, this.leftArm, this.rightArm, this.base] },
                { gone: ['BASE'], hide: [this.base] }, { gone: ['EYES'], hide: [this.eyes] },
                { gone: ['LEFT_ARM'], hide: [this.leftArm] }, { gone: ['RIGHT_ARM'], hide: [this.rightArm] },
            ];
        }

        // ── Spined Lizard: desert reptile with venom spines + whip tail (Reptilian) ──
        _buildSpinedLizard() {
            const p = this.profile;
            const scaleMat = this._skinMat(p.bodyColor, 0.65);
            const spineMat = this._mat(p.accent, 0.9, 0.3, p.accent);
            this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.85, 6, 12), scaleMat); this.body.rotation.z = Math.PI / 2; this.body.position.set(-0.05, 0.55, 0); this.bodyGroup.add(this.body);
            this.spines = new THREE.Group();
            for (let i = 0; i < 7; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 5), spineMat); sp.position.set(0.4 - i * 0.16, 0.85, 0); this.spines.add(sp); }
            this.bodyGroup.add(this.spines);
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.5, 9), scaleMat); skull.rotation.x = Math.PI / 2; skull.position.z = 0.18; this.head.add(skull);
            for (const s of [-1, 1]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.18, 4), spineMat); horn.position.set(s * 0.12, 0.14, 0); this.head.add(horn); }
            this._eye(this.head, -0.12, 0.1, 0.18, 0.05, p.accent); this._eye(this.head, 0.12, 0.1, 0.18, 0.05, p.accent);
            this.head.position.set(0.55, 0.6, 0); this.bodyGroup.add(this.head);
            this.tail = new THREE.Group();
            let tx = -0.55, tr = 0.2;
            for (let i = 0; i < 5; i++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(tr, 9, 7), scaleMat); seg.position.set(tx, 0.5, 0); this.tail.add(seg); tx -= tr * 1.6; tr *= 0.72; }
            const tip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 6), spineMat); tip.rotation.z = Math.PI / 2; tip.position.set(tx, 0.5, 0); this.tail.add(tip);
            this.bodyGroup.add(this.tail);
            const mkLeg = (x, z, s) => { const g = new THREE.Group(); const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.46, 7), scaleMat); limb.position.set(s * 0.1, -0.13, 0); limb.rotation.z = -s * 0.6; g.add(limb); g.position.set(x, 0.4, z); this.bodyGroup.add(g); return g; };
            this.frontL = mkLeg(0.3, 0.3, 1); this.frontR = mkLeg(0.3, -0.3, -1); this.rearL = mkLeg(-0.3, 0.32, 1); this.rearR = mkLeg(-0.3, -0.32, -1);
            this._partMeshMap = { HEAD: this.head, TORSO: this.body, BODY: this.body, TAIL: this.tail, LEFT_ARM: this.frontL, RIGHT_ARM: this.frontR, LEFT_LEG: this.rearL, RIGHT_LEG: this.rearR };
            this._cascadeRules = [
                { gone: ['TORSO', 'BODY'], hide: [this.body, this.spines, this.head, this.tail, this.frontL, this.frontR, this.rearL, this.rearR] },
                { gone: ['HEAD'], hide: [this.head] }, { gone: ['TAIL'], hide: [this.tail] },
                { gone: ['LEFT_ARM'], hide: [this.frontL] }, { gone: ['RIGHT_ARM'], hide: [this.frontR] },
                { gone: ['LEFT_LEG'], hide: [this.rearL] }, { gone: ['RIGHT_LEG'], hide: [this.rearR] },
            ];
        }

        // ── Spiny Sprinter: swift burrower bristling with spines (SpikyMonster) ──
        _buildSpinySprinter() {
            const p = this.profile;
            const fur = this._skinMat(p.bodyColor, 0.85);
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 12), fur); this.body.position.y = 0.7; this.body.scale.set(1.1, 0.9, 1.0); this.bodyGroup.add(this.body);
            this.spikes = new THREE.Group();
            const up = new THREE.Vector3(0, 1, 0);
            for (let i = 0; i < 18; i++) { const a = this.idRand() * 6.28, e = Math.acos(2 * this.idRand() - 1); const dir = new THREE.Vector3(Math.sin(e) * Math.cos(a), Math.cos(e), Math.sin(e) * Math.sin(a)); const sp = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.28, 5), this._mat(p.accent, 1.0, 0.4)); sp.position.set(dir.x * 0.5, 0.7 + dir.y * 0.45, dir.z * 0.5); sp.quaternion.setFromUnitVectors(up, dir.clone().normalize()); this.spikes.add(sp); }
            this.bodyGroup.add(this.spikes);
            this.eyes = new THREE.Group();
            this._eye(this.eyes, -0.13, 0.78, 0.42, 0.06, p.accent); this._eye(this.eyes, 0.13, 0.78, 0.42, 0.06, p.accent);
            this.bodyGroup.add(this.eyes);
            this.leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.3, 7), fur); this.leftLeg.position.set(-0.2, 0.25, 0.1); this.bodyGroup.add(this.leftLeg);
            this.rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.3, 7), fur); this.rightLeg.position.set(0.2, 0.25, 0.1); this.bodyGroup.add(this.rightLeg);
            this._partMeshMap = { BODY: this.body, SPIKES: this.spikes, EYES: this.eyes, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg };
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.body, this.spikes, this.eyes, this.leftLeg, this.rightLeg] },
                { gone: ['SPIKES'], hide: [this.spikes] }, { gone: ['EYES'], hide: [this.eyes] },
                { gone: ['LEFT_LEG'], hide: [this.leftLeg] }, { gone: ['RIGHT_LEG'], hide: [this.rightLeg] },
            ];
        }

        // ── Stone Guardian: floating animated stone construct (Golem/FloatingHead) ──
        _buildStoneGuardian() {
            const p = this.profile;
            const stone = this._skinMat(p.bodyColor, 0.9);
            const rune = this._mat(p.accent, 0.85, 0.3, p.accent);
            this.core = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.55), stone); torso.position.y = 1.0; this.core.add(torso);
            const headBlk = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.45), stone); headBlk.position.y = 1.65; this.core.add(headBlk);
            for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), rune); e.position.set(s * 0.13, 1.68, 0.24); this.core.add(e); }
            const glyph = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.03, 6, 12), rune); glyph.position.set(0, 1.0, 0.29); this.core.add(glyph);
            this.bodyGroup.add(this.core);
            const mkFist = (s) => { const g = new THREE.Group(); const fist = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), stone); g.add(fist); g.position.set(s * 0.5, 1.0, 0.1); this.bodyGroup.add(g); return g; };
            this.leftArm = mkFist(-1); this.rightArm = mkFist(1);
            this.leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.55, 0.25), stone); this.leftLeg.position.set(-0.2, 0.34, 0); this.bodyGroup.add(this.leftLeg);
            this.rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.55, 0.25), stone); this.rightLeg.position.set(0.2, 0.34, 0); this.bodyGroup.add(this.rightLeg);
            this._mapCommon({ head: this.core, body: this.core, leftArm: this.leftArm, rightArm: this.rightArm, leftLeg: this.leftLeg, rightLeg: this.rightLeg });
            this._bodyCascade({ head: this.core, body: this.core, leftArm: this.leftArm, rightArm: this.rightArm, leftLeg: this.leftLeg, rightLeg: this.rightLeg });
        }

        // ── Storm Banshee: spectral thunderstorm spirit, wailing (StormElemental) ──
        _buildStormBanshee() {
            const p = this.profile;
            const cloud = this._mat(p.bodyColor, 0.6, 0.5, 0x223044); cloud.transparent = true;
            const bolt = this._mat(p.accent, 0.9, 0.2, p.accent);
            this.body = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.5, 12), cloud); this.body.position.y = 0.9; this.bodyGroup.add(this.body);
            this.core = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), bolt); this.core.position.y = 1.1; this.bodyGroup.add(this.core);
            this.face = new THREE.Group();
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 12), cloud); this.face.add(head);
            for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), bolt); e.position.set(s * 0.1, 0.04, 0.22); this.face.add(e); }
            const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), this._mat(0x05060a, 1.0, 0.4)); mouth.scale.set(0.7, 1.4, 0.5); mouth.position.set(0, -0.12, 0.24); this.face.add(mouth);
            this.face.position.set(0, 1.55, 0); this.bodyGroup.add(this.face);
            this.leftArm = this._boltLimb(-1, 1.1, bolt); this.rightArm = this._boltLimb(1, 1.1, bolt);
            this.leftLeg = this._boltLimb(-1, 0.45, bolt); this.rightLeg = this._boltLimb(1, 0.45, bolt);
            this._partMeshMap = { CORE: this.core, BODY: this.body, FACE: this.face, HEAD: this.face, LEFT_RAIN_ARM: this.leftArm, RIGHT_RAIN_ARM: this.rightArm, LEFT_THUNDER_LEG: this.leftLeg, RIGHT_THUNDER_LEG: this.rightLeg };
            this._cascadeRules = [
                { gone: ['CORE', 'BODY'], hide: [this.body, this.core, this.face, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg] },
                { gone: ['LEFT_RAIN_ARM'], hide: [this.leftArm] }, { gone: ['RIGHT_RAIN_ARM'], hide: [this.rightArm] },
                { gone: ['LEFT_THUNDER_LEG'], hide: [this.leftLeg] }, { gone: ['RIGHT_THUNDER_LEG'], hide: [this.rightLeg] },
            ];
        }

        // ── Storm Caller: thunder-bringing mage with a lightning staff (StormElemental) ──
        _buildStormCaller() {
            const p = this.profile;
            const cloud = this._skinMat(p.bodyColor, 0.5);
            const bolt = this._mat(p.accent, 0.9, 0.2, p.accent);
            this.body = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.4, 12), cloud); this.body.position.y = 0.8; this.bodyGroup.add(this.body);
            this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), bolt); this.core.position.y = 1.0; this.bodyGroup.add(this.core);
            this.face = new THREE.Group();
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 12), cloud); this.face.add(head);
            this._eye(this.face, -0.1, 0.04, 0.2, 0.05, p.accent); this._eye(this.face, 0.1, 0.04, 0.2, 0.05, p.accent);
            const crown = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), this._mat(p.bodyColor, 0.6, 0.5)); crown.position.y = 0.18; this.face.add(crown);
            this.face.position.set(0, 1.5, 0); this.bodyGroup.add(this.face);
            this.leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.55, 7), cloud); this.leftArm.position.set(-0.35, 0.95, 0.1); this.leftArm.rotation.z = 0.4; this.bodyGroup.add(this.leftArm);
            this.rightArm = new THREE.Group();
            const ra = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.55, 7), cloud); ra.rotation.z = -0.3; this.rightArm.add(ra);
            this.staff = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.3, 6), this._mat(0x4a4a52, 1.0, 0.5)); this.staff.position.set(0.2, -0.1, 0.1); this.rightArm.add(this.staff);
            this.staffOrb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), bolt); this.staffOrb.position.set(0.2, 0.55, 0.1); this.rightArm.add(this.staffOrb);
            this.rightArm.position.set(0.38, 0.95, 0.1); this.bodyGroup.add(this.rightArm);
            this.leftLeg = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 6), cloud); this.leftLeg.position.set(-0.15, 0.25, 0); this.leftLeg.rotation.x = Math.PI; this.bodyGroup.add(this.leftLeg);
            this.rightLeg = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 6), cloud); this.rightLeg.position.set(0.15, 0.25, 0); this.rightLeg.rotation.x = Math.PI; this.bodyGroup.add(this.rightLeg);
            this._partMeshMap = { CORE: this.core, BODY: this.body, FACE: this.face, HEAD: this.face, LEFT_RAIN_ARM: this.leftArm, RIGHT_RAIN_ARM: this.rightArm, LEFT_THUNDER_LEG: this.leftLeg, RIGHT_THUNDER_LEG: this.rightLeg };
            this._cascadeRules = [
                { gone: ['CORE', 'BODY'], hide: [this.body, this.core, this.face, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg] },
                { gone: ['LEFT_RAIN_ARM'], hide: [this.leftArm] }, { gone: ['RIGHT_RAIN_ARM'], hide: [this.rightArm] },
                { gone: ['LEFT_THUNDER_LEG'], hide: [this.leftLeg] }, { gone: ['RIGHT_THUNDER_LEG'], hide: [this.rightLeg] },
            ];
        }

        // ── Swamp Crocodile: armored ancient reptile, powerful jaws (Reptilian) ──
        _buildSwampCrocodile() {
            const p = this.profile;
            const hide = this._skinMat(p.bodyColor, 0.7);
            const tooth = this._mat(0xf0ead0, 1.0, 0.5);
            this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 1.0, 6, 12), hide); this.body.rotation.z = Math.PI / 2; this.body.position.set(-0.1, 0.45, 0); this.bodyGroup.add(this.body);
            this.scutes = new THREE.Group();
            for (let i = 0; i < 6; i++) { const sc = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.18, 4), hide); sc.position.set(0.4 - i * 0.18, 0.75, 0); this.scutes.add(sc); }
            this.bodyGroup.add(this.scutes);
            this.head = new THREE.Group();
            const upper = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.7), hide); upper.position.set(0, 0.05, 0.3); this.head.add(upper);
            const lower = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.66), hide); lower.position.set(0, -0.1, 0.3); this.head.add(lower);
            for (let i = 0; i < 6; i++) { const tt = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.08, 4), tooth); tt.position.set((i % 2 ? 0.1 : -0.1), -0.02, 0.1 + i * 0.08); tt.rotation.x = Math.PI; this.head.add(tt); }
            this._eye(this.head, -0.13, 0.13, 0.05, 0.05, p.accent); this._eye(this.head, 0.13, 0.13, 0.05, 0.05, p.accent);
            this.head.position.set(0.55, 0.5, 0); this.bodyGroup.add(this.head);
            this.tail = new THREE.Group();
            let tx = -0.6, tr = 0.26;
            for (let i = 0; i < 5; i++) { const seg = new THREE.Mesh(new THREE.BoxGeometry(tr, tr * 0.8, 0.3), hide); seg.position.set(tx, 0.45, 0); this.tail.add(seg); tx -= tr * 1.1; tr *= 0.78; }
            this.bodyGroup.add(this.tail);
            const mkLeg = (x, z, s) => { const g = new THREE.Group(); const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.4, 7), hide); limb.position.set(s * 0.12, -0.1, 0); limb.rotation.z = -s * 0.7; g.add(limb); g.position.set(x, 0.32, z); this.bodyGroup.add(g); return g; };
            this.frontL = mkLeg(0.3, 0.34, 1); this.frontR = mkLeg(0.3, -0.34, -1); this.rearL = mkLeg(-0.3, 0.36, 1); this.rearR = mkLeg(-0.3, -0.36, -1);
            this._partMeshMap = { HEAD: this.head, TORSO: this.body, BODY: this.body, TAIL: this.tail, LEFT_ARM: this.frontL, RIGHT_ARM: this.frontR, LEFT_LEG: this.rearL, RIGHT_LEG: this.rearR };
            this._cascadeRules = [
                { gone: ['TORSO', 'BODY'], hide: [this.body, this.scutes, this.head, this.tail, this.frontL, this.frontR, this.rearL, this.rearR] },
                { gone: ['HEAD'], hide: [this.head] }, { gone: ['TAIL'], hide: [this.tail] },
                { gone: ['LEFT_ARM'], hide: [this.frontL] }, { gone: ['RIGHT_ARM'], hide: [this.frontR] },
                { gone: ['LEFT_LEG'], hide: [this.rearL] }, { gone: ['RIGHT_LEG'], hide: [this.rearR] },
            ];
        }

        // ── Tarantula: hairy aggressive hunting spider (Spider) ────────────────
        _buildTarantula() {
            const p = this.profile;
            const fur = this._skinMat(p.bodyColor, 0.9);
            const hairMat = this._mat(0x1a120c, 1.0, 0.95);
            const up = new THREE.Vector3(0, 1, 0);
            this.abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 12), fur); this.abdomen.position.set(-0.45, 0.7, 0); this.bodyGroup.add(this.abdomen);
            for (let i = 0; i < 12; i++) { const a = this.idRand() * 6.28, e = Math.acos(2 * this.idRand() - 1); const dir = new THREE.Vector3(Math.sin(e) * Math.cos(a), Math.cos(e), Math.sin(e) * Math.sin(a)); const h = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.16, 4), hairMat); h.position.set(dir.x * 0.5, dir.y * 0.5, dir.z * 0.5); h.quaternion.setFromUnitVectors(up, dir.clone().normalize()); this.abdomen.add(h); }
            this.cephalo = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 12), fur); this.cephalo.position.set(0.2, 0.68, 0); this.bodyGroup.add(this.cephalo);
            this.head = new THREE.Group();
            const face = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), fur); this.head.add(face);
            for (let i = 0; i < 4; i++) { const ex = -0.09 + (i % 2) * 0.18, ey = 0.04 + Math.floor(i / 2) * 0.08; this._eye(this.head, ex, ey, 0.16, 0.035, p.accent); }
            this.head.position.set(0.5, 0.72, 0); this.bodyGroup.add(this.head);
            this.fangs = new THREE.Group();
            for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.24, 5), this._mat(p.accent, 1.0, 0.4, p.accent)); f.position.set(s * 0.07, -0.12, 0.16); f.rotation.x = 0.3; this.fangs.add(f); }
            this.head.add(this.fangs);
            this.spinnerets = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 6), fur); this.spinnerets.position.set(-0.92, 0.68, 0); this.spinnerets.rotation.z = Math.PI / 2; this.bodyGroup.add(this.spinnerets);
            const mkLeg = (x, z, s) => { const g = new THREE.Group(); const femur = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.6, 6), fur); femur.position.set(s * 0.3, 0.12, 0); femur.rotation.z = -s * 1.1; g.add(femur); const tibia = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.6, 6), fur); tibia.position.set(s * 0.56, -0.22, 0); tibia.rotation.z = -s * 0.5; g.add(tibia); g.position.set(x, 0.7, z); g._s = s; this.bodyGroup.add(g); return g; };
            this.legL1 = mkLeg(0.25, 0.32, 1); this.legR1 = mkLeg(0.25, -0.32, -1);
            this.legL2 = mkLeg(0.05, 0.36, 1); this.legR2 = mkLeg(0.05, -0.36, -1);
            this.legL3 = mkLeg(-0.2, 0.36, 1); this.legR3 = mkLeg(-0.2, -0.36, -1);
            this.legL4 = mkLeg(-0.42, 0.32, 1); this.legR4 = mkLeg(-0.42, -0.32, -1);
            this._legs = [this.legL1, this.legR1, this.legL2, this.legR2, this.legL3, this.legR3, this.legL4, this.legR4];
            this._partMeshMap = { HEAD: this.head, CEPHALOTHORAX: this.cephalo, ABDOMEN: this.abdomen, FANGS: this.fangs, SPINNERETS: this.spinnerets, LEFT_LEG: this.legL1, RIGHT_LEG: this.legR1, MID_LEFT_LEG: this.legL2, MID_RIGHT_LEG: this.legR2, MID_REAR_LEFT_LEG: this.legL3, MID_REAR_RIGHT_LEG: this.legR3, REAR_LEFT_LEG: this.legL4, REAR_RIGHT_LEG: this.legR4 };
            this._cascadeRules = [
                { gone: ['CEPHALOTHORAX'], hide: [this.cephalo, this.head, this.fangs, this.abdomen, this.spinnerets, ...this._legs] },
                { gone: ['ABDOMEN'], hide: [this.abdomen, this.spinnerets] },
                { gone: ['HEAD'], hide: [this.head] }, { gone: ['FANGS'], hide: [this.fangs] }, { gone: ['SPINNERETS'], hide: [this.spinnerets] },
                { gone: ['LEFT_LEG'], hide: [this.legL1] }, { gone: ['RIGHT_LEG'], hide: [this.legR1] },
                { gone: ['MID_LEFT_LEG'], hide: [this.legL2] }, { gone: ['MID_RIGHT_LEG'], hide: [this.legR2] },
                { gone: ['MID_REAR_LEFT_LEG'], hide: [this.legL3] }, { gone: ['MID_REAR_RIGHT_LEG'], hide: [this.legR3] },
                { gone: ['REAR_LEFT_LEG'], hide: [this.legL4] }, { gone: ['REAR_RIGHT_LEG'], hide: [this.legR4] },
            ];
        }

        // ── Thunder Sprite: tiny darting spark elemental (StormElemental) ──────
        _buildThunderSprite() {
            const p = this.profile;
            const spark = this._mat(p.bodyColor, 0.7, 0.2, p.bodyColor); spark.transparent = true;
            const bolt = this._mat(p.accent, 0.95, 0.15, p.accent);
            this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), bolt); this.core.position.y = 1.0; this.bodyGroup.add(this.core);
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 12), spark); this.body.position.y = 1.0; this.bodyGroup.add(this.body);
            this._eye(this.core, -0.12, 0.05, 0.22, 0.05, 0xffffff); this._eye(this.core, 0.12, 0.05, 0.22, 0.05, 0xffffff);
            this.leftArm = this._boltLimb(-1, 1.05, bolt); this.rightArm = this._boltLimb(1, 1.05, bolt);
            this.leftLeg = this._boltLimb(-1, 0.75, bolt); this.rightLeg = this._boltLimb(1, 0.75, bolt);
            this.sparks = [];
            for (let i = 0; i < 5; i++) { const sp = this._orb(0.04, p.accent, this.sparks); sp._a = (i / 5) * Math.PI * 2; sp._r = 0.4 + this.idRand() * 0.2; sp._h = 1.0; }
            this._partMeshMap = { CORE: this.core, BODY: this.body, LEFT_RAIN_ARM: this.leftArm, RIGHT_RAIN_ARM: this.rightArm, LEFT_THUNDER_LEG: this.leftLeg, RIGHT_THUNDER_LEG: this.rightLeg };
            this._cascadeRules = [
                { gone: ['CORE', 'BODY'], hide: [this.core, this.body, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg, ...this.sparks] },
                { gone: ['LEFT_RAIN_ARM'], hide: [this.leftArm] }, { gone: ['RIGHT_RAIN_ARM'], hide: [this.rightArm] },
                { gone: ['LEFT_THUNDER_LEG'], hide: [this.leftLeg] }, { gone: ['RIGHT_THUNDER_LEG'], hide: [this.rightLeg] },
            ];
        }

        // ═════════════════════════════════════════════════════════════════════
        // Level 1-5 roster (lv_ keys): small, odd starter creatures that used
        // to borrow another enemy's model. Every one faces +Z and walks along
        // Z; limbs hang from joint pivots so a swing never leaves the body.
        // ═════════════════════════════════════════════════════════════════════
        _lvMesh(parent, geo, mat, p, r, s) {
            const m = new THREE.Mesh(geo, mat);
            if (p) m.position.set(p[0], p[1], p[2]);
            if (r) m.rotation.set(r[0], r[1], r[2]);
            if (s !== undefined && s !== null) { if (typeof s === 'number') m.scale.setScalar(s); else m.scale.set(s[0], s[1], s[2]); }
            if (parent) parent.add(m);
            return m;
        }
        _lvGroup(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); (parent || this.bodyGroup).add(g); return g; }
        // A limb hung from its joint: a Group at (x,y,z), struts through `pts`
        // (local points after the joint), a ball at every bend, and an optional
        // end mesh (foot, claw, hand) carried to the last point.
        _lvLimb(parent, x, y, z, pts, r0, r1, mat, end) {
            const g = this._lvGroup(parent, x, y, z);
            const P = [new THREE.Vector3(0, 0, 0)].concat(pts.map(q => new THREE.Vector3(q[0], q[1], q[2])));
            const n = P.length - 1;
            for (let i = 0; i < n; i++) {
                const ra = r0 + (r1 - r0) * (i / n), rb = r0 + (r1 - r0) * ((i + 1) / n);
                this.addStrut(g, mat, P[i], P[i + 1], ra, rb, 6);
                if (i > 0) this._lvMesh(g, lvSph(ra * 1.05, 6, 4), mat, [P[i].x, P[i].y, P[i].z]);
            }
            if (end) { end.position.add(P[n]); g.add(end); }
            g._tip = P[n];
            return g;
        }
        // One flat mesh from a raw triangle list [[[x,y,z] x3], ...].
        _lvTris(parent, mat, tris) {
            const v = [];
            tris.forEach(tri => tri.forEach(q => v.push(q[0], q[1], q[2])));
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
            geo.computeVertexNormals();
            const m = new THREE.Mesh(geo, mat); if (parent) parent.add(m); return m;
        }
        // A mesh stood on an ellipsoid (centre c, radii rad) along direction d,
        // its own +Y turned to the outward direction and lifted by `lift`.
        _lvStud(parent, geo, mat, c, rad, d, lift) {
            const n = new THREE.Vector3(d[0], d[1], d[2]).normalize();
            const m = new THREE.Mesh(geo, mat);
            m.position.set(c[0] + n.x * rad[0], c[1] + n.y * rad[1], c[2] + n.z * rad[2]).addScaledVector(n, lift || 0);
            m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
            parent.add(m); return m;
        }
        // A splayed fan of toe pads (geckos).
        _lvToes(mat, n, r, spread, side) {
            const g = new THREE.Group();
            for (let i = 0; i < n; i++) { const a = (i / (n - 1) - 0.5) * spread + (side > 0 ? 0.5 : Math.PI - 0.5); this._lvMesh(g, lvSph(r, 5, 4), mat, [Math.cos(a) * r * 2.2, -0.005, Math.sin(a) * r * 2.2], null, [1, 0.6, 1]); }
            this._lvMesh(g, lvSph(r * 1.3, 5, 4), mat, [0, 0, 0], null, [1, 0.6, 1]);
            return g;
        }
        // Part map + cascade: the vital keys take `all` with them, every key in
        // `singles` takes only its own part.
        _lvRig(map, vital, all, singles) {
            this._partMeshMap = map;
            const rules = [{ gone: vital, hide: all.filter(Boolean) }];
            (singles || []).forEach(k => { if (map[k]) rules.push({ gone: [k], hide: [map[k]] }); });
            this._cascadeRules = rules;
        }

        // ── Folded Airplane: an overdue bill folded into a dart, inked eye ───
        // Bird rig: HEAD/BODY/BEAK/LEFT_WING/RIGHT_WING/TALONS.
        _buildLvFoldedAirplane() {
            const p = this.profile;
            const paper = this._skinMat(p.bodyColor, 0.85);
            const ink = this._mat(0x2a2a3a, 1.0, 0.8);
            const red = this._mat(p.accent, 1.0, 0.6);
            // BODY: the creased keel under the spine.
            this.body = this._lvGroup(null, 0, 1.0, 0);
            this._lvTris(this.body, paper, [
                [[0, 0, 0.75], [0, 0, -0.7], [-0.045, -0.28, -0.55]],
                [[0, 0, 0.75], [0.045, -0.28, -0.55], [0, 0, -0.7]],
                [[0, 0, -0.7], [0.045, -0.28, -0.55], [-0.045, -0.28, -0.55]]
            ]);
            // Wings hinge on the spine; the trailing third of each edge is folded up.
            const wing = (s) => {
                const g = this._lvGroup(null, 0, 1.0, 0);
                this._lvTris(g, paper, [
                    [[0, 0, 0.75], [s * 0.78, 0.07, -0.7], [0, 0, -0.7]],
                    [[s * 0.78, 0.07, -0.7], [s * 0.52, 0.047, -0.22], [s * 0.76, 0.28, -0.62]]
                ]);
                return g;
            };
            this.leftWing = wing(-1); this.rightWing = wing(1);
            // The bill it was folded from: printed lines on one wing, a red
            // OVERDUE stamp on the other.
            for (let i = 0; i < 3; i++) this._lvMesh(this.leftWing, lvBox(0.26, 0.008, 0.014), ink, [-0.26, 0.024, -0.08 - i * 0.1], [0, 0, -0.09]);
            this._lvMesh(this.rightWing, lvBox(0.24, 0.012, 0.13), red, [0.3, 0.028, -0.36], [0, 0.2, 0.09]);
            this._lvMesh(this.rightWing, lvBox(0.16, 0.016, 0.02), this._mat(0xf4e8e0, 1.0, 0.7), [0.3, 0.03, -0.36], [0, 0.2, 0.09]);
            // HEAD: the folded nose cone with a pair of inked, staring eyes.
            this.head = this._lvGroup(null, 0, 0.965, 0.5);
            this._lvMesh(this.head, lvCone(0.07, 0.42, 3), paper, null, [Math.PI / 2, 0, 0]);
            for (const s of [-1, 1]) {
                this._lvMesh(this.head, lvSph(0.042, 6, 4), this._mat(0xf8f4ea, 1.0, 0.5), [s * 0.04, 0.012, -0.06], null, [0.5, 1, 1.1]);
                this._lvMesh(this.head, lvSph(0.02, 5, 4), this._mat(p.accent, 1.0, 0.4, p.accent), [s * 0.058, 0.012, -0.05]);
            }
            // BEAK: the red-inked crease at the very tip.
            this.beak = this._lvMesh(this.head, lvCone(0.03, 0.12, 3), red, [0, 0, 0.25], [Math.PI / 2, 0, 0]);
            // TALONS: a paper clip still hanging off the keel.
            this.talons = this._lvMesh(this.body, lvTor(0.05, 0.01, 3, 10), this._mat(0xa0a6b0, 1.0, 0.3), [0, -0.3, -0.42], [0, Math.PI / 2, 0], [1, 1.9, 1]);
            this._lvRig({ HEAD: this.head, BODY: this.body, BEAK: this.beak, LEFT_WING: this.leftWing, RIGHT_WING: this.rightWing, TALONS: this.talons },
                ['BODY'], [this.body, this.head, this.leftWing, this.rightWing], ['HEAD', 'BEAK', 'LEFT_WING', 'RIGHT_WING', 'TALONS']);
        }

        // ── Wasabi Snail: a piped wasabi swirl shell, weeping eyestalks ──────
        // Slime rig: CORE/UPPER_BODY/LOWER_BODY/PSEUDOPOD_1/PSEUDOPOD_2/MAW.
        _buildLvWasabiSnail() {
            const p = this.profile;
            const paste = this._skinMat(p.bodyColor, 0.55);
            const deep = this._mat(0x4f7a22, 1.0, 0.6);
            const ginger = this._mat(p.accent, 0.92, 0.4);
            // LOWER_BODY: the creeping foot, with the head rising at the front.
            this.foot = this._lvGroup(null, 0, 0, 0);
            this._lvMesh(this.foot, new THREE.CapsuleGeometry(0.22, 0.85, 3, 7), paste, [0, 0.13, -0.02], [Math.PI / 2, 0, 0], [1.25, 1, 0.55]);
            this._lvMesh(this.foot, lvCyl(0.13, 0.17, 0.36, 7), paste, [0, 0.32, 0.5], [0.35, 0, 0]);
            this._lvMesh(this.foot, lvSph(0.14, 7, 5), paste, [0, 0.5, 0.57]);
            this.maw = this._lvMesh(this.foot, lvSph(0.07, 6, 4), this._mat(0x1a2410, 1.0, 0.7), [0, 0.44, 0.68], null, [1.5, 0.45, 0.6]);
            // UPPER_BODY: the shell is a piped swirl of paste, ring on ring.
            this.shell = this._lvGroup(null, 0, 0.22, -0.18);
            this._lvMesh(this.shell, lvCyl(0.06, 0.28, 0.62, 7), deep, [0, 0.3, 0]);
            [[0.3, 0.11, 0.06], [0.25, 0.1, 0.2], [0.19, 0.09, 0.33], [0.13, 0.075, 0.45], [0.07, 0.06, 0.55]].forEach(([R, r, y], i) =>
                this._lvMesh(this.shell, lvTor(R, r, 4, 9), paste, [Math.sin(i * 1.7) * 0.02, y, 0], [Math.PI / 2, 0, i * 0.5]));
            this._lvMesh(this.shell, lvCone(0.05, 0.16, 5), paste, [0.02, 0.66, 0], [0, 0, -0.3]);
            // CORE: a rosette of pickled ginger tucked under the shell's lip.
            this.core = this._lvGroup(null, 0, 0.25, -0.5);
            for (let i = 0; i < 4; i++) this._lvMesh(this.core, lvSph(0.09, 6, 4), ginger, [Math.cos(i * 1.57) * 0.05, 0.02, Math.sin(i * 1.57) * 0.05], [0.6, i * 1.57, 0], [1, 0.25, 1.3]);
            // PSEUDOPODS: eyestalks, red-rimmed and dripping a tear apiece.
            const stalk = (s) => {
                const eye = new THREE.Group();
                this._eye(eye, 0, 0, 0, 0.055, 0xcc2222);
                this._lvMesh(eye, lvCone(0.025, 0.07, 4), this._mat(0xaee8ff, 0.8, 0.1), [0, -0.075, 0.03], [Math.PI, 0, 0]);
                return this._lvLimb(null, s * 0.07, 0.6, 0.58, [[s * 0.05, 0.14, 0.03], [s * 0.08, 0.26, 0.07]], 0.035, 0.022, paste, eye);
            };
            this.stalkL = stalk(-1); this.stalkR = stalk(1);
            this._lvRig({ CORE: this.core, UPPER_BODY: this.shell, LOWER_BODY: this.foot, PSEUDOPOD_1: this.stalkL, PSEUDOPOD_2: this.stalkR, MAW: this.maw },
                ['LOWER_BODY', 'CORE'], [this.foot, this.shell, this.core, this.stalkL, this.stalkR], ['UPPER_BODY', 'PSEUDOPOD_1', 'PSEUDOPOD_2', 'MAW']);
        }

        // ── Clockwork Tin Soldier: painted toy, nutcracker jaw, wind-up key ──
        // Robot rig: HEAD/CORE/LEFT_ARM/RIGHT_ARM/LEFT_LEG/RIGHT_LEG/JAWS.
        _buildLvTinSoldier() {
            const p = this.profile;
            const coat = this._skinMat(p.bodyColor, 0.4);
            const blue = this._mat(0x22306a, 1.0, 0.45);
            const white = this._mat(0xeeeae0, 1.0, 0.5);
            const gold = this._mat(p.accent, 1.0, 0.3);
            const black = this._mat(0x151515, 1.0, 0.35);
            const peach = this._mat(0xf0c8a8, 1.0, 0.55);
            // Tin tunic: white plastron, brass buttons, belt and epaulettes.
            this.body = this._lvGroup(null, 0, 1.0, 0);
            this._lvMesh(this.body, lvCyl(0.2, 0.22, 0.52, 8), coat);
            this._lvMesh(this.body, lvBox(0.17, 0.36, 0.04), white, [0, 0.02, 0.2]);
            for (let i = 0; i < 3; i++) this._lvMesh(this.body, lvSph(0.024, 5, 4), gold, [0, 0.12 - i * 0.1, 0.225]);
            this._lvMesh(this.body, lvTor(0.215, 0.03, 4, 12), black, [0, -0.22, 0], [Math.PI / 2, 0, 0]);
            for (const s of [-1, 1]) this._lvMesh(this.body, lvSph(0.075, 7, 4), gold, [s * 0.21, 0.25, 0], null, [1, 0.45, 1]);
            this._lvMesh(this.body, lvCyl(0.07, 0.08, 0.1, 7), peach, [0, 0.3, 0]);
            // HEAD: painted face, round red cheeks, a tall shako and plume.
            this.head = this._lvGroup(null, 0, 1.43, 0);
            this._lvMesh(this.head, lvSph(0.15, 8, 6), peach, null, null, [1, 1.08, 1]);
            for (const s of [-1, 1]) {
                this._lvMesh(this.head, lvSph(0.022, 5, 4), black, [s * 0.055, 0.03, 0.135]);
                this._lvMesh(this.head, lvSph(0.03, 5, 4), this._mat(0xe05050, 1.0, 0.6), [s * 0.085, -0.035, 0.115], null, [1, 1, 0.4]);
            }
            this._lvMesh(this.head, lvBox(0.12, 0.025, 0.03), black, [0, -0.04, 0.14]);
            this._lvMesh(this.head, lvCyl(0.15, 0.13, 0.3, 8), black, [0, 0.24, 0]);
            this._lvMesh(this.head, lvCyl(0.155, 0.155, 0.03, 8), gold, [0, 0.1, 0]);
            this._lvMesh(this.head, lvBox(0.1, 0.1, 0.02), gold, [0, 0.21, 0.135]);
            this._lvMesh(this.head, lvSph(0.06, 6, 5), this._mat(0xd02020, 1.0, 0.7), [0, 0.42, 0.03], null, [1, 1.4, 1]);
            // JAWS: a nutcracker jaw that clacks on its hinge.
            this.jaw = this._lvGroup(this.head, 0, -0.07, 0.02);
            this._lvMesh(this.jaw, lvBox(0.14, 0.05, 0.13), peach, [0, -0.04, 0.05]);
            this._lvMesh(this.jaw, lvBox(0.1, 0.014, 0.02), white, [0, -0.015, 0.11]);
            // Arms: white gloves; the right shoulders a rifle with a pin for a bayonet.
            const glove = () => this._lvMesh(null, lvSph(0.055, 6, 5), white);
            this.leftArm = this._lvLimb(null, -0.25, 1.2, 0, [[-0.03, -0.42, 0.02]], 0.055, 0.05, coat, glove());
            this.rightArm = this._lvLimb(null, 0.25, 1.2, 0, [[0.03, -0.24, 0.12], [0.02, -0.3, 0.3]], 0.055, 0.05, coat, glove());
            this.rifle = this._lvGroup(this.rightArm, 0.02, -0.3, 0.3);
            this.rifle.rotation.x = -0.5;
            this._lvMesh(this.rifle, lvBox(0.04, 0.05, 0.55), this._mat(0x6a4020, 1.0, 0.7), [0, 0.02, 0.05]);
            this._lvMesh(this.rifle, lvCyl(0.012, 0.012, 0.3, 5), black, [0, 0.05, 0.4], [Math.PI / 2, 0, 0]);
            this._lvMesh(this.rifle, lvCyl(0.002, 0.005, 0.12, 4), this._mat(0xd8dde4, 1.0, 0.2), [0, 0.05, 0.61], [Math.PI / 2, 0, 0]);
            // Legs: stiff blue trousers and black boots.
            const boot = () => this._lvMesh(null, lvBox(0.11, 0.08, 0.17), black, [0, -0.02, 0.03]);
            this.leftLeg = this._lvLimb(null, -0.1, 0.76, 0, [[0, -0.66, 0]], 0.075, 0.065, blue, boot());
            this.rightLeg = this._lvLimb(null, 0.1, 0.76, 0, [[0, -0.66, 0]], 0.075, 0.065, blue, boot());
            // CORE: the brass wind-up key in its back, always turning.
            this.core = this._lvGroup(null, 0, 1.02, -0.19);
            this._lvMesh(this.core, lvCyl(0.025, 0.025, 0.28, 6), gold, [0, 0, -0.13], [Math.PI / 2, 0, 0]);
            for (const s of [-1, 1]) this._lvMesh(this.core, lvTor(0.085, 0.022, 4, 10), gold, [0, s * 0.09, -0.24], [0, Math.PI / 2, 0]);
            this._lvRig({ HEAD: this.head, CORE: this.core, LEFT_ARM: this.leftArm, RIGHT_ARM: this.rightArm, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg, JAWS: this.jaw, TORSO: this.body, BODY: this.body },
                ['TORSO', 'BODY'], [this.body, this.head, this.core, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg], ['HEAD', 'CORE', 'LEFT_ARM', 'RIGHT_ARM', 'LEFT_LEG', 'RIGHT_LEG', 'JAWS']);
        }

        // ── Dryer Lint Golem: grey fluff, coin and button eyes, a sock arm ───
        // Golem rig: CORE/LEFT_ARM/RIGHT_ARM/LEFT_LEG/RIGHT_LEG/MAW.
        _buildLvLintGolem() {
            const p = this.profile;
            const lint = this._skinMat(p.bodyColor, 0.95);
            const lintDk = this._mat(0x7a7a84, 1.0, 0.95);
            this.body = this._lvGroup(null, 0, 0.78, 0);
            this._lvMesh(this.body, new THREE.IcosahedronGeometry(0.48, 1), lint, null, null, [1.1, 0.95, 0.95]);
            for (let i = 0; i < 9; i++) {
                const a = i * 2.4, e = (this.idRand() - 0.3) * 1.2;
                this._lvStud(this.body, new THREE.IcosahedronGeometry(0.14 + this.idRand() * 0.08, 0), i % 2 ? lint : lintDk, [0, 0, 0], [0.5, 0.43, 0.43], [Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)], -0.05);
            }
            // Mismatched eyes: a coin and a four-hole shirt button.
            this.eyes = this._lvGroup(this.body, 0, 0.12, 0.43);
            this._lvMesh(this.eyes, lvCyl(0.075, 0.075, 0.025, 8), this._mat(0xc8a040, 1.0, 0.3), [-0.15, 0, 0], [Math.PI / 2, 0, 0]);
            this._lvMesh(this.eyes, lvSph(0.025, 5, 4), this._mat(0x8a6a20, 1.0, 0.4), [-0.15, 0.01, 0.012]);
            this._lvMesh(this.eyes, lvCyl(0.055, 0.055, 0.025, 8), this._mat(0xf4f0e8, 1.0, 0.3), [0.14, 0.02, 0], [Math.PI / 2, 0, 0]);
            for (let i = 0; i < 4; i++) this._lvMesh(this.eyes, lvSph(0.011, 4, 3), this._mat(0x101010, 1.0, 0.5), [0.14 + (i % 2 ? 0.018 : -0.018), 0.02 + (i < 2 ? 0.018 : -0.018), 0.014]);
            // MAW: a lint-trap slot of a mouth, grille and all.
            this.maw = this._lvGroup(this.body, 0, -0.1, 0.43);
            this._lvMesh(this.maw, lvBox(0.3, 0.08, 0.04), this._mat(0x101014, 1.0, 0.8));
            for (let i = 0; i < 5; i++) this._lvMesh(this.maw, lvBox(0.012, 0.08, 0.05), this._mat(0xb8bcc4, 1.0, 0.3), [-0.12 + i * 0.06, 0, 0]);
            // CORE: a crackling knot of static that sparks out of its crown.
            this.core = this._lvMesh(this.body, new THREE.OctahedronGeometry(0.12, 0), this._mat(p.accent, 0.9, 0.2, p.accent), [0.08, 0.42, 0.05]);
            for (let i = 0; i < 3; i++) { const a = i * 2.1; this.addStrut(this.core, this.core.material, new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(a) * 0.18, 0.12, Math.sin(a) * 0.18), 0.012, 0.005, 4); }
            // LEFT_ARM: a lost striped sock; RIGHT_ARM: a club of matted lint.
            const sockA = this._mat(0xd84a4a, 1.0, 0.9), sockB = this._mat(0xf0ece0, 1.0, 0.9);
            this.leftArm = this._lvGroup(null, -0.48, 0.86, 0);
            [[-0.06, -0.06, 0.02], [-0.12, -0.16, 0.05], [-0.15, -0.27, 0.08], [-0.16, -0.38, 0.11], [-0.14, -0.48, 0.16]].forEach((q, i) => this._lvMesh(this.leftArm, lvSph(0.1 - i * 0.004, 6, 5), i % 2 ? sockB : sockA, q));
            this._lvMesh(this.leftArm, lvSph(0.11, 6, 5), sockA, [-0.12, -0.56, 0.24], null, [1, 0.8, 1.4]);
            this.rightArm = this._lvGroup(null, 0.48, 0.86, 0);
            [[0.07, -0.1, 0.02, 0.13], [0.12, -0.25, 0.06, 0.12], [0.12, -0.42, 0.1, 0.15]].forEach(([x, y, z, r], i) => this._lvMesh(this.rightArm, new THREE.IcosahedronGeometry(r, 0), i % 2 ? lintDk : lint, [x, y, z]));
            const lFoot = () => this._lvMesh(null, new THREE.IcosahedronGeometry(0.14, 0), lintDk, null, null, [1.1, 0.6, 1.3]);
            this.leftLeg = this._lvLimb(null, -0.2, 0.42, 0, [[0, -0.3, 0.02]], 0.13, 0.12, lint, lFoot());
            this.rightLeg = this._lvLimb(null, 0.2, 0.42, 0, [[0, -0.3, 0.02]], 0.13, 0.12, lint, lFoot());
            this._lvRig({ CORE: this.core, LEFT_ARM: this.leftArm, RIGHT_ARM: this.rightArm, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg, MAW: this.maw, BODY: this.body, TORSO: this.body, EYES: this.eyes },
                ['BODY', 'TORSO'], [this.body, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg], ['CORE', 'LEFT_ARM', 'RIGHT_ARM', 'LEFT_LEG', 'RIGHT_LEG', 'MAW', 'EYES']);
        }

        // ── Sand Gecko: banded, bug-eyed, its tongue up licking its own eye ──
        // Reptilian rig: HEAD/TORSO/LEFT_ARM/RIGHT_ARM/LEFT_LEG/RIGHT_LEG/TAIL/MAW.
        _buildLvSandGecko() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.75);
            const pale = this._mat(0xf0dcb0, 1.0, 0.7);
            const band = this._mat(0x8a5a2a, 1.0, 0.8);
            this.body = this._lvGroup(null, 0, 0, 0);
            this._lvMesh(this.body, new THREE.CapsuleGeometry(0.16, 0.5, 3, 7), skin, [0, 0.22, 0], [Math.PI / 2, 0, 0], [1.3, 1, 0.8]);
            for (let i = 0; i < 4; i++) this._lvMesh(this.body, lvSph(0.12, 6, 4), band, [0, 0.33, -0.27 + i * 0.16], null, [1.5, 0.3, 0.4]);
            this.head = this._lvGroup(null, 0, 0.26, 0.48);
            this._lvMesh(this.head, lvSph(0.15, 7, 5), skin, null, null, [1.15, 0.72, 1.3]);
            for (const s of [-1, 1]) this._eye(this.head, s * 0.12, 0.07, 0.03, 0.075, p.accent).rotation.y = s * 0.9;
            this.jaw = this._lvMesh(this.head, lvSph(0.12, 6, 4), pale, [0, -0.05, 0.08], null, [1.05, 0.3, 1.25]);
            this.tongue = this._lvLimb(this.head, 0.05, -0.04, 0.2, [[0.06, 0.04, 0.0], [0.1, 0.1, -0.06], [0.1, 0.14, -0.12]], 0.022, 0.016, this._mat(0xe06a7a, 1.0, 0.5));
            const leg = (s, z, pts) => this._lvLimb(null, s * 0.15, 0.24, z, pts, 0.045, 0.032, skin, this._lvToes(pale, 4, 0.028, 1.6, s));
            this.leftArm = leg(-1, 0.24, [[-0.16, 0.02, 0.05], [-0.24, -0.2, 0.1]]);
            this.rightArm = leg(1, 0.24, [[0.16, 0.02, 0.05], [0.24, -0.2, 0.1]]);
            this.leftLeg = leg(-1, -0.24, [[-0.18, 0.0, -0.06], [-0.26, -0.21, -0.12]]);
            this.rightLeg = leg(1, -0.24, [[0.18, 0.0, -0.06], [0.26, -0.21, -0.12]]);
            // A fat carrot of a tail, where it keeps its water.
            this.tail = this._lvLimb(null, 0, 0.22, -0.38, [[0, -0.03, -0.2], [0.05, -0.1, -0.42], [0.13, -0.15, -0.6]], 0.12, 0.03, skin);
            this._lvRig({ HEAD: this.head, TORSO: this.body, LEFT_ARM: this.leftArm, RIGHT_ARM: this.rightArm, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg, TAIL: this.tail, MAW: this.jaw },
                ['TORSO'], [this.body, this.head, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg, this.tail], ['HEAD', 'LEFT_ARM', 'RIGHT_ARM', 'LEFT_LEG', 'RIGHT_LEG', 'TAIL', 'MAW']);
        }

        // ── Desert Tumbleweed: rings of brush caging a sun-bleached skull ────
        // Spherical rig: CORE/SHELL/SENSOR_ARRAY/SPIN_SPINES/AUX_DRIVES/MAW.
        _buildLvTumbleweed() {
            const p = this.profile;
            const twig = this._skinMat(p.bodyColor, 0.9);
            const dry = this._mat(0x6a5030, 1.0, 0.9);
            const bone = this._mat(0xe8dcc0, 1.0, 0.6);
            this.ball = this._lvGroup(null, 0, 0.67, 0);
            this.shell = this._lvGroup(this.ball, 0, 0, 0);
            const rings = [];
            for (let i = 0; i < 9; i++) {
                const R = 0.53 + this.idRand() * 0.03;
                const r = this._lvMesh(this.shell, lvTor(R, 0.022, 3, 14), i % 3 ? twig : dry, null, [this.idRand() * Math.PI, this.idRand() * Math.PI, 0]);
                r._R = R; rings.push(r);
            }
            // A point on ring i at angle a, in the ball's space.
            const onRing = (i, a) => new THREE.Vector3(Math.cos(a) * rings[i]._R, Math.sin(a) * rings[i]._R, 0).applyQuaternion(rings[i].quaternion);
            this.spines = this._lvGroup(this.ball, 0, 0, 0);
            for (let i = 0; i < 16; i++) { const v = onRing(i % 9, i * 1.9); this._lvStud(this.spines, lvCone(0.022, 0.15, 4), dry, [0, 0, 0], [v.length(), v.length(), v.length()], [v.x, v.y, v.z], 0.05); }
            // CORE: a little cow skull lodged in the middle on four twigs.
            this.core = this._lvGroup(this.ball, 0, 0, 0);
            this._lvMesh(this.core, lvSph(0.15, 7, 5), bone, [0, 0.03, -0.02], null, [1, 0.9, 1.1]);
            this._lvMesh(this.core, lvBox(0.12, 0.09, 0.2), bone, [0, -0.04, 0.13]);
            for (const s of [-1, 1]) this._lvMesh(this.core, lvCone(0.035, 0.24, 5), bone, [s * 0.17, 0.08, 0], [0, 0, -s * 1.2]);
            for (let i = 0; i < 4; i++) { const v = onRing(i * 2, 0.7 + i); const d = v.clone().normalize(); this.addStrut(this.shell, dry, d.clone().multiplyScalar(0.1), v, 0.022, 0.016, 4); }
            // SENSOR_ARRAY: embers in the eye sockets; MAW: the loose jawbone.
            this.sensors = this._lvGroup(this.core, 0, 0.06, 0.1);
            for (const s of [-1, 1]) this._lvMesh(this.sensors, lvSph(0.03, 5, 4), this._mat(p.accent, 1.0, 0.3, p.accent), [s * 0.06, 0, 0.02]);
            this.jaw = this._lvGroup(this.core, 0, -0.09, 0.03);
            this._lvMesh(this.jaw, lvBox(0.11, 0.03, 0.18), bone, [0, -0.01, 0.09]);
            for (const s of [-1, 1]) this._lvMesh(this.jaw, lvCone(0.012, 0.04, 4), bone, [s * 0.03, 0.025, 0.16]);
            // AUX_DRIVES: the snapped root stem it broke loose from.
            const v0 = onRing(3, 4.0);
            this.roots = this._lvLimb(this.ball, v0.x, v0.y, v0.z, [[v0.x * 0.25, v0.y * 0.25 - 0.05, v0.z * 0.25], [v0.x * 0.4, v0.y * 0.4 - 0.12, v0.z * 0.45]], 0.035, 0.012, dry);
            this._lvRig({ CORE: this.core, SHELL: this.shell, SENSOR_ARRAY: this.sensors, SPIN_SPINES: this.spines, AUX_DRIVES: this.roots, MAW: this.jaw },
                ['CORE'], [this.core, this.shell, this.spines, this.roots], ['SHELL', 'SENSOR_ARRAY', 'SPIN_SPINES', 'AUX_DRIVES', 'MAW']);
        }

        // ── Dune Scorpling: glassy little scorpion, gut showing, one eye ─────
        // Scorpion rig: HEAD/CEPHALOTHORAX/ABDOMEN/TAIL/STINGER/PINCER_*/8 legs/MANDIBLES.
        _buildLvScorpling() {
            const p = this.profile;
            const shell = this.applySkin(this._mat(p.bodyColor, 0.72, 0.35));
            const gut = this._mat(0x5a2a1a, 1.0, 0.6);
            const amber = this._mat(0xd89a2a, 1.0, 0.3, 0x3a2000);
            this.ceph = this._lvMesh(this.bodyGroup, lvSph(0.2, 7, 5), shell, [0, 0.22, 0.18], null, [1.05, 0.5, 1.0]);
            this.head = this._lvGroup(null, 0, 0.23, 0.36);
            this._lvMesh(this.head, new THREE.DodecahedronGeometry(0.1, 0), shell, null, null, [1.2, 0.6, 0.9]);
            this._eye(this.head, 0, 0.06, 0.02, 0.055, p.accent);
            this.mandibles = this._lvGroup(this.head, 0, -0.02, 0.08);
            for (const s of [-1, 1]) this._lvMesh(this.mandibles, lvCone(0.025, 0.08, 4), amber, [s * 0.035, 0, 0.02], [Math.PI / 2, 0, 0]);
            // ABDOMEN: shingled glassy plates over a dark coil of gut.
            this.abdomen = this._lvGroup(null, 0, 0, 0);
            [[-0.02, 0.19], [-0.16, 0.18], [-0.29, 0.16], [-0.4, 0.13]].forEach(([z, r]) => this._lvMesh(this.abdomen, lvSph(r, 7, 4), shell, [0, 0.22, z], null, [1.05, 0.5, 0.75]));
            const gp = [[0, 0.22, 0.08], [0.03, 0.22, -0.14], [-0.03, 0.22, -0.3], [0, 0.23, -0.44]].map(q => new THREE.Vector3(q[0], q[1], q[2]));
            for (let i = 0; i < 3; i++) this.addStrut(this.abdomen, gut, gp[i], gp[i + 1], 0.035, 0.03, 5);
            // TAIL arched over the back; STINGER is a venom bulb and barb.
            this.stinger = new THREE.Group();
            this._lvMesh(this.stinger, lvSph(0.05, 6, 4), amber);
            this._lvMesh(this.stinger, lvCone(0.025, 0.12, 4), amber, [0, -0.05, 0.06], [Math.PI * 0.75, 0, 0]);
            this.tail = this._lvLimb(null, 0, 0.25, -0.47, [[0, 0.12, -0.12], [0, 0.3, -0.14], [0, 0.44, -0.04], [0, 0.48, 0.1]], 0.06, 0.04, shell, this.stinger);
            const pincer = (s) => {
                const claw = new THREE.Group();
                this._lvMesh(claw, lvSph(0.085, 6, 4), shell, [0, 0, 0.05], null, [0.85, 0.6, 1.35]);
                this._lvMesh(claw, lvCone(0.026, 0.13, 4), shell, [s * 0.03, 0, 0.17], [Math.PI / 2, 0, 0]);
                claw._f = this._lvGroup(claw, -s * 0.03, 0, 0.1);
                this._lvMesh(claw._f, lvCone(0.024, 0.13, 4), shell, [0, 0, 0.065], [Math.PI / 2, 0, 0]);
                const g = this._lvLimb(null, s * 0.14, 0.22, 0.32, [[s * 0.13, 0.05, 0.1], [s * 0.13, 0.07, 0.22]], 0.04, 0.034, shell, claw);
                g._claw = claw; return g;
            };
            this.pincerL = pincer(-1); this.pincerR = pincer(1);
            this._legs = [];
            const legKeys = [['LEFT_LEG', 'RIGHT_LEG'], ['MID_LEFT_LEG', 'MID_RIGHT_LEG'], ['MID_REAR_LEFT_LEG', 'MID_REAR_RIGHT_LEG'], ['REAR_LEFT_LEG', 'REAR_RIGHT_LEG']];
            const map = { HEAD: this.head, CEPHALOTHORAX: this.ceph, ABDOMEN: this.abdomen, TAIL: this.tail, STINGER: this.stinger, PINCER_LEFT: this.pincerL, PINCER_RIGHT: this.pincerR, MANDIBLES: this.mandibles };
            [0.27, 0.17, 0.07, -0.03].forEach((z, i) => {
                const dz = (1.5 - i) * 0.05;
                [-1, 1].forEach((s, j) => { const l = this._lvLimb(null, s * 0.15, 0.2, z, [[s * 0.13, 0.07, dz], [s * 0.24, -0.2, dz * 2]], 0.024, 0.014, shell); this._legs.push(l); map[legKeys[i][j]] = l; });
            });
            this._lvRig(map, ['CEPHALOTHORAX'], [this.ceph, this.head, this.abdomen, this.tail, this.pincerL, this.pincerR, ...this._legs],
                ['HEAD', 'ABDOMEN', 'TAIL', 'STINGER', 'PINCER_LEFT', 'PINCER_RIGHT', 'MANDIBLES', 'LEFT_LEG', 'RIGHT_LEG', 'MID_LEFT_LEG', 'MID_RIGHT_LEG', 'MID_REAR_LEFT_LEG', 'MID_REAR_RIGHT_LEG', 'REAR_LEFT_LEG', 'REAR_RIGHT_LEG']);
        }

        // ── Salt Crab: tall crusted shell growing salt cubes, one huge claw ──
        // Crustacean rig: CLAW_LEFT/CLAW_RIGHT/CARAPACE/ABDOMEN/FRONT_LEG/REAR_LEG/ANTENNAE/MANDIBLES.
        _buildLvSaltCrab() {
            const p = this.profile;
            const crust = this._skinMat(p.bodyColor, 0.85);
            const red = this._mat(0xc87a5a, 1.0, 0.6);
            const salt = this._mat(0xfafaf4, 0.95, 0.25);
            const dark = this._mat(0x1a1410, 1.0, 0.4);
            const C = [0, 0.42, 0], R = [0.468, 0.198, 0.36];
            this.carapace = this._lvGroup(null, 0, 0, 0);
            this._lvMesh(this.carapace, lvSph(0.36, 8, 5), crust, C, null, [1.3, 0.55, 1.0]);
            for (let i = 0; i < 10; i++) {
                const a = i * 2.39, e = 0.45 + this.idRand() * 0.9;
                const c = this._lvStud(this.carapace, lvBox(1, 1, 1), salt, C, R, [Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)], 0);
                c.scale.setScalar(0.06 + this.idRand() * 0.07); c.rotateY(this.idRand() * 3);
            }
            this.abdomen = this._lvMesh(this.bodyGroup, lvSph(0.22, 7, 4), red, [0, 0.3, -0.12], null, [1, 0.45, 1]);
            this.antennae = this._lvGroup(null, 0, 0.5, 0.3);
            for (const s of [-1, 1]) {
                this._lvLimb(this.antennae, s * 0.08, 0, 0, [[s * 0.02, 0.14, 0.02]], 0.02, 0.016, red, this._lvMesh(null, lvSph(0.035, 6, 4), dark));
                this.addStrut(this.antennae, red, new THREE.Vector3(s * 0.03, -0.02, 0.02), new THREE.Vector3(s * 0.18, 0.12, 0.3), 0.008, 0.005, 4);
            }
            this.mandibles = this._lvGroup(null, 0, 0.37, 0.33);
            for (const s of [-1, 1]) this._lvMesh(this.mandibles, lvBox(0.05, 0.06, 0.04), red, [s * 0.03, 0, 0.01], [0, 0, s * 0.2]);
            const claw = (s, k) => {
                const hand = new THREE.Group();
                this._lvMesh(hand, lvSph(0.13 * k, 7, 5), red, [0, 0, 0.08 * k], null, [0.8, 0.9, 1.3]);
                this._lvMesh(hand, lvCone(0.05 * k, 0.2 * k, 5), crust, [s * 0.03 * k, 0.04 * k, 0.26 * k], [Math.PI / 2, 0, 0]);
                hand._f = this._lvGroup(hand, -s * 0.03 * k, -0.02 * k, 0.16 * k);
                this._lvMesh(hand._f, lvCone(0.045 * k, 0.18 * k, 5), crust, [0, 0, 0.09 * k], [Math.PI / 2, 0, 0]);
                const g = this._lvLimb(null, s * 0.38, 0.4, 0.18, [[s * 0.14, 0.04, 0.14], [s * 0.18, 0.1, 0.3]], 0.05, 0.045, red, hand);
                g._hand = hand; return g;
            };
            this.leftClaw = claw(-1, 1.5); this.rightClaw = claw(1, 0.75);
            const ext = (z) => R[0] * Math.sqrt(Math.max(0, 1 - (z / R[2]) * (z / R[2])));
            this.frontLegs = this._lvGroup(null, 0, 0, 0); this.rearLegs = this._lvGroup(null, 0, 0, 0); this._legs = [];
            [0.08, -0.06, -0.18, -0.29].forEach((z, i) => {
                const dz = (1.5 - i) * 0.06;
                for (const s of [-1, 1]) this._legs.push(this._lvLimb(i < 2 ? this.frontLegs : this.rearLegs, s * (ext(z) - 0.04), 0.38, z, [[s * 0.16, 0.06, dz], [s * 0.28, -0.38, dz * 1.5]], 0.035, 0.018, red));
            });
            this._lvRig({ CLAW_LEFT: this.leftClaw, CLAW_RIGHT: this.rightClaw, CARAPACE: this.carapace, ABDOMEN: this.abdomen, FRONT_LEG: this.frontLegs, REAR_LEG: this.rearLegs, ANTENNAE: this.antennae, MANDIBLES: this.mandibles },
                ['CARAPACE'], [this.carapace, this.abdomen, this.leftClaw, this.rightClaw, this.frontLegs, this.rearLegs, this.antennae, this.mandibles], ['CLAW_LEFT', 'CLAW_RIGHT', 'ABDOMEN', 'FRONT_LEG', 'REAR_LEG', 'ANTENNAE', 'MANDIBLES']);
        }

        // ── Desert Porcupine: banded quills swept back, a hollow-quill rattle ─
        // SpikyMonster rig: SPIKES/BODY/EYES/LEFT_LEG/RIGHT_LEG/LEFT_CLAW/RIGHT_CLAW/MAW.
        _buildLvPorcupine() {
            const p = this.profile;
            const fur = this._skinMat(p.bodyColor, 0.9);
            const face = this._mat(0x3a2a20, 1.0, 0.8);
            const qA = this._mat(p.accent, 1.0, 0.5), qB = this._mat(0x2a2018, 1.0, 0.5);
            const C = [0, 0.42, -0.05], R = [0.36, 0.306, 0.45];
            this.body = this._lvGroup(null, 0, 0, 0);
            this._lvMesh(this.body, lvSph(0.36, 8, 6), fur, C, null, [1, 0.85, 1.25]);
            this._lvMesh(this.body, lvSph(0.14, 7, 5), face, [0, 0.36, 0.42], null, [0.85, 0.75, 1.25]);
            this._lvMesh(this.body, lvSph(0.035, 5, 4), this._mat(0x0a0a0a, 1.0, 0.3), [0, 0.37, 0.6]);
            this.eyes = this._lvGroup(null, 0, 0.44, 0.385);
            for (const s of [-1, 1]) this._eye(this.eyes, s * 0.09, 0, 0, 0.03, 0x101010);
            // MAW: bright orange incisors, as a porcupine's are.
            this.maw = this._lvGroup(null, 0, 0.29, 0.57);
            for (const s of [-1, 1]) this._lvMesh(this.maw, lvBox(0.02, 0.05, 0.015), this._mat(0xe08a2a, 1.0, 0.4), [s * 0.012, 0, 0]);
            // SPIKES: two-tone quills swept back, and a rattle of hollow quills on the rump.
            this.spikes = this._lvGroup(null, 0, 0, 0);
            const back = new THREE.Vector3(0, 0.15, -0.6);
            for (let i = 0; i < 34; i++) {
                const d = new THREE.Vector3(this.idRand() * 2 - 1, 0.15 + this.idRand() * 0.85, this.idRand() * 1.4 - 1.0).normalize();
                const dir = d.clone().add(back).normalize(), h = 0.32 + this.idRand() * 0.14;
                const q = new THREE.Group();
                q.position.set(C[0] + d.x * R[0], C[1] + d.y * R[1], C[2] + d.z * R[2]).addScaledVector(dir, -0.04);
                q.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
                this._lvMesh(q, lvCone(0.024, h, 4), qA, [0, h / 2, 0]);
                this._lvMesh(q, lvCone(0.014, h * 0.3, 4), qB, [0, h * 0.86, 0]);
                this.spikes.add(q);
            }
            for (let i = 0; i < 6; i++) { const a = i * 1.05; this._lvMesh(this.spikes, new THREE.CylinderGeometry(0.03, 0.03, 0.16, 6, 1, true), qA, [Math.cos(a) * 0.06, 0.5 + Math.sin(a) * 0.05, -0.5], [-0.9, 0, 0]); }
            const paw = (claws) => { const g = new THREE.Group(); this._lvMesh(g, lvSph(0.07, 6, 4), face, [0, 0, 0.03], null, [1, 0.5, 1.4]); if (claws) for (let i = -1; i <= 1; i++) this._lvMesh(g, lvCone(0.012, 0.06, 4), qA, [i * 0.03, -0.01, 0.12], [Math.PI / 2, 0, 0]); return g; };
            this.leftLeg = this._lvLimb(null, -0.2, 0.26, -0.22, [[0, -0.2, 0.02]], 0.07, 0.06, fur, paw(false));
            this.rightLeg = this._lvLimb(null, 0.2, 0.26, -0.22, [[0, -0.2, 0.02]], 0.07, 0.06, fur, paw(false));
            this.leftClaw = this._lvLimb(null, -0.17, 0.26, 0.22, [[0, -0.2, 0.04]], 0.06, 0.05, fur, paw(true));
            this.rightClaw = this._lvLimb(null, 0.17, 0.26, 0.22, [[0, -0.2, 0.04]], 0.06, 0.05, fur, paw(true));
            this._lvRig({ SPIKES: this.spikes, BODY: this.body, EYES: this.eyes, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg, LEFT_CLAW: this.leftClaw, RIGHT_CLAW: this.rightClaw, MAW: this.maw },
                ['BODY'], [this.body, this.spikes, this.eyes, this.maw, this.leftLeg, this.rightLeg, this.leftClaw, this.rightClaw], ['SPIKES', 'EYES', 'LEFT_LEG', 'RIGHT_LEG', 'LEFT_CLAW', 'RIGHT_CLAW', 'MAW']);
        }

        // ── Manticore Cub: scruffy cub with a pale human mask of a face ──────
        // Manticore rig: BRAIN/SKULL/SPINE/RIBCAGE/paws+legs/eyes/wings/lungs/MAW.
        _buildLvManticoreCub() {
            const p = this.profile;
            const fur = this._skinMat(p.bodyColor, 0.85);
            const mane = this._mat(0x5a2a14, 1.0, 0.9);
            const face = this._mat(0xe8c0a0, 1.0, 0.55);
            const wingM = this._mat(0x6a3020, 0.9, 0.6);
            const soft = this._mat(p.accent, 1.0, 0.6);
            this.body = this._lvGroup(null, 0, 0, 0);
            this._lvMesh(this.body, new THREE.CapsuleGeometry(0.25, 0.42, 3, 8), fur, [0, 0.52, -0.08], [Math.PI / 2, 0, 0]);
            for (let i = 0; i < 6; i++) this._lvStud(this.body, lvCone(0.05, 0.14, 4), mane, [0, 0.52, -0.08], [0.25, 0.25, 0.46], [(this.idRand() - 0.5) * 0.6, 1, 0.3 - i * 0.22], 0.04);
            // SKULL / BRAIN: an oversized cub head wearing a too-human face.
            this.head = this._lvGroup(null, 0, 0.8, 0.4);
            this._lvMesh(this.head, lvSph(0.24, 8, 6), fur, null, null, [1, 0.95, 0.95]);
            this._lvMesh(this.head, lvSph(0.19, 8, 6), face, [0, -0.02, 0.15], null, [0.9, 1.05, 0.4]);
            for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; this._lvMesh(this.head, lvCone(0.05, i % 2 ? 0.14 : 0.1, 4), mane, [Math.cos(a) * 0.21, Math.sin(a) * 0.21 - 0.02, 0.05], [0, 0, a - Math.PI / 2]); }
            for (const s of [-1, 1]) this._lvMesh(this.head, lvCone(0.06, 0.1, 4), fur, [s * 0.14, 0.2, -0.04], [0, 0, -s * 0.5]);
            this.leftEye = this._eye(this.head, -0.07, 0.04, 0.2, 0.035, 0x3a6a2a);
            this.rightEye = this._eye(this.head, 0.07, 0.04, 0.2, 0.035, 0x3a6a2a);
            for (const s of [-1, 1]) this._lvMesh(this.head, lvBox(0.07, 0.015, 0.02), mane, [s * 0.07, 0.09, 0.21], [0, 0, s * 0.25]);
            this._lvMesh(this.head, lvBox(0.025, 0.06, 0.03), face, [0, -0.01, 0.22]);
            this.maw = this._lvGroup(this.head, 0, -0.08, 0.2);
            this._lvMesh(this.maw, lvTor(0.08, 0.016, 3, 8, Math.PI), this._mat(0x3a0a0a, 1.0, 0.6), null, [0, 0, Math.PI]);
            this._lvMesh(this.maw, lvBox(0.1, 0.016, 0.01), this._mat(0xf4ecd8, 1.0, 0.4), [0, -0.06, 0.006]);
            // Stubby wings, swept back off the shoulders.
            this.leftWing = this.buildDragonWing(wingM, 1, -0.14, 0.72, -0.1, { span: 0.6, fingers: 3 }); this.leftWing.rotation.y = -0.5;
            this.rightWing = this.buildDragonWing(wingM, -1, 0.14, 0.72, -0.1, { span: 0.6, fingers: 3 }); this.rightWing.rotation.y = 0.5;
            // A soft tail that ends in a rubbery spike ball it flings anyway.
            const ball = new THREE.Group();
            this._lvMesh(ball, lvSph(0.08, 6, 5), soft);
            for (let i = 0; i < 6; i++) this._lvStud(ball, lvCone(0.025, 0.1, 4), soft, [0, 0, 0], [0.08, 0.08, 0.08], [Math.cos(i * 1.05), (i % 3) - 1, Math.sin(i * 1.05)], 0.03);
            this.tail = this._lvLimb(null, 0, 0.6, -0.5, [[0, 0.12, -0.16], [0, 0.32, -0.22], [0, 0.5, -0.12]], 0.06, 0.04, fur, ball);
            const pawM = () => this._lvMesh(null, lvSph(0.09, 6, 4), fur, null, null, [1.1, 0.6, 1.3]);
            this.flPaw = this._lvLimb(null, -0.14, 0.42, 0.2, [[0, -0.36, 0.03]], 0.085, 0.07, fur, pawM());
            this.frPaw = this._lvLimb(null, 0.14, 0.42, 0.2, [[0, -0.36, 0.03]], 0.085, 0.07, fur, pawM());
            this.rlLeg = this._lvLimb(null, -0.14, 0.42, -0.32, [[0, -0.14, -0.06], [0, -0.36, 0.0]], 0.085, 0.07, fur, pawM());
            this.rrLeg = this._lvLimb(null, 0.14, 0.42, -0.32, [[0, -0.14, -0.06], [0, -0.36, 0.0]], 0.085, 0.07, fur, pawM());
            this._lvRig({ SPINE: this.body, RIBCAGE: this.body, LEFT_LUNG: this.body, RIGHT_LUNG: this.body, SKULL: this.head, BRAIN: this.head, LEFT_EYE: this.leftEye, RIGHT_EYE: this.rightEye,
                FRONT_LEFT_PAW: this.flPaw, FRONT_RIGHT_PAW: this.frPaw, REAR_LEFT_LEG: this.rlLeg, REAR_RIGHT_LEG: this.rrLeg, LEFT_WING: this.leftWing, RIGHT_WING: this.rightWing, TAIL: this.tail, MAW: this.maw },
                ['SPINE', 'RIBCAGE'], [this.body, this.head, this.flPaw, this.frPaw, this.rlLeg, this.rrLeg, this.leftWing, this.rightWing, this.tail],
                ['SKULL', 'FRONT_LEFT_PAW', 'FRONT_RIGHT_PAW', 'REAR_LEFT_LEG', 'REAR_RIGHT_LEG', 'LEFT_WING', 'RIGHT_WING', 'TAIL', 'LEFT_EYE', 'RIGHT_EYE', 'MAW']);
        }

        // ── Belltower Gargoyle: crouched stone, lead spout mouth, a bell ─────
        // Golem rig: CORE/LEFT_ARM/RIGHT_ARM/LEFT_LEG/RIGHT_LEG/MAW.
        _buildLvGargoyle() {
            const p = this.profile;
            const stone = this._skinMat(p.bodyColor, 0.95);
            const lead = this._mat(0x5a6068, 1.0, 0.5);
            const bronze = this._mat(0x8a6a3a, 1.0, 0.35);
            const water = this._mat(0x7ab8e0, 0.7, 0.1, 0x1a3a50);
            this.body = this._lvGroup(null, 0, 0, 0);
            this._lvMesh(this.body, lvSph(0.3, 7, 5), stone, [0, 0.62, -0.05], null, [1.05, 1.1, 0.9]);
            for (let i = 0; i < 4; i++) this._lvMesh(this.body, lvCone(0.04, 0.12, 4), stone, [0, 0.88 - i * 0.12, -0.27 - i * 0.012], [-1.2, 0, 0]);
            // Folded wings, pressed flat to the back.
            for (const s of [-1, 1]) this._lvTris(this.body, stone, [[[s * 0.1, 0.85, -0.17], [s * 0.42, 1.05, -0.3], [s * 0.3, 0.42, -0.32]], [[s * 0.42, 1.05, -0.3], [s * 0.4, 0.62, -0.36], [s * 0.3, 0.42, -0.32]]]);
            this.head = this._lvGroup(null, 0, 0.95, 0.15);
            this._lvMesh(this.head, new THREE.DodecahedronGeometry(0.19, 0), stone, null, null, [1, 0.9, 1.05]);
            this._lvMesh(this.head, lvBox(0.3, 0.06, 0.08), stone, [0, 0.07, 0.13]);
            for (const s of [-1, 1]) {
                this._lvMesh(this.head, lvCone(0.04, 0.22, 4), stone, [s * 0.12, 0.16, -0.06], [-0.8, 0, -s * 0.5]);
                this._lvMesh(this.head, lvCone(0.035, 0.14, 4), stone, [s * 0.2, 0.02, -0.02], [0, 0, -s * 1.3]);
                this._lvMesh(this.head, lvSph(0.025, 5, 4), this._mat(p.accent, 1.0, 0.3, p.accent), [s * 0.07, 0.025, 0.165]);
            }
            // MAW: a lead rain spout jutting from the jaws, still dripping.
            this.maw = this._lvGroup(this.head, 0, -0.07, 0.12);
            this._lvMesh(this.maw, lvCyl(0.045, 0.045, 0.25, 7), lead, [0, 0, 0.12], [Math.PI / 2, 0, 0]);
            this._lvMesh(this.maw, lvTor(0.045, 0.012, 3, 8), lead, [0, 0, 0.25]);
            this._lvMesh(this.maw, lvBox(0.16, 0.05, 0.12), stone, [0, -0.06, 0.02]);
            this.drip = this._lvGroup(this.maw, 0, -0.02, 0.24);
            this._lvMesh(this.drip, lvCyl(0.012, 0.016, 0.24, 5), water, [0, -0.12, 0]);
            this._lvMesh(this.drip, lvSph(0.024, 5, 4), water, [0, -0.25, 0], null, [1, 1.3, 1]);
            // CORE: an iron collar with a little bronze bell on the chest.
            this.core = this._lvGroup(null, 0, 0, 0);
            this._lvMesh(this.core, lvTor(0.18, 0.016, 3, 12), lead, [0, 0.86, 0.0], [Math.PI / 2, 0, 0], [1.05, 0.9, 1]);
            this.bell = this._lvGroup(this.core, 0, 0.86, 0.17);
            this.addStrut(this.bell, lead, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.1, 0.05), 0.01, 0.01, 4);
            this._lvMesh(this.bell, lvCyl(0.04, 0.085, 0.12, 8), bronze, [0, -0.16, 0.06]);
            this._lvMesh(this.bell, lvSph(0.025, 5, 4), bronze, [0, -0.23, 0.06]);
            const hand = (s) => { const g = new THREE.Group(); this._lvMesh(g, lvSph(0.08, 6, 4), stone, null, null, [1, 0.6, 1.2]); for (let i = -1; i <= 1; i++) this._lvMesh(g, lvCone(0.018, 0.08, 4), lead, [i * 0.04, -0.03, 0.1], [Math.PI * 0.6, 0, 0]); return g; };
            this.leftArm = this._lvLimb(null, -0.3, 0.8, 0.02, [[-0.1, -0.28, 0.14], [-0.08, -0.67, 0.24]], 0.075, 0.06, stone, hand(-1));
            this.rightArm = this._lvLimb(null, 0.3, 0.8, 0.02, [[0.1, -0.28, 0.14], [0.08, -0.67, 0.24]], 0.075, 0.06, stone, hand(1));
            const foot = () => { const g = new THREE.Group(); this._lvMesh(g, lvBox(0.14, 0.07, 0.22), stone, [0, 0, 0.05]); for (let i = -1; i <= 1; i++) this._lvMesh(g, lvCone(0.02, 0.07, 4), lead, [i * 0.045, -0.01, 0.18], [Math.PI / 2, 0, 0]); return g; };
            this.leftLeg = this._lvLimb(null, -0.17, 0.4, -0.08, [[-0.04, 0.02, 0.22], [-0.04, -0.35, 0.12]], 0.1, 0.08, stone, foot());
            this.rightLeg = this._lvLimb(null, 0.17, 0.4, -0.08, [[0.04, 0.02, 0.22], [0.04, -0.35, 0.12]], 0.1, 0.08, stone, foot());
            this._lvRig({ CORE: this.core, LEFT_ARM: this.leftArm, RIGHT_ARM: this.rightArm, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg, MAW: this.maw, HEAD: this.head, BODY: this.body, TORSO: this.body },
                ['BODY', 'TORSO'], [this.body, this.head, this.core, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg], ['CORE', 'LEFT_ARM', 'RIGHT_ARM', 'LEFT_LEG', 'RIGHT_LEG', 'MAW', 'HEAD']);
        }

        // ── Void Ferret Kit: a slinky ferret half-poured through a hole ──────
        // Voidspawn rig: ABYSSAL_EYE/MAW/VOID_TENDRIL_1/VOID_TENDRIL_2/CORE.
        _buildLvVoidFerret() {
            const p = this.profile;
            const fur = this._skinMat(p.bodyColor, 0.8);
            const ghost = this.applySkin(this._mat(p.bodyColor, 0.42, 0.8));   // the half still somewhere else
            const voidM = this._mat(0x05030a, 1.0, 0.2, 0x10051a);
            const rim = this._mat(p.accent, 0.95, 0.3, p.accent);
            this.body = this._lvGroup(null, 0, 0, 0);
            const V = (x, y, z) => new THREE.Vector3(x, y, z);
            this.addStrut(this.body, fur, V(0, 0.32, 0), V(0, 0.33, 0.2), 0.12, 0.11, 7);
            this.addStrut(this.body, fur, V(0, 0.33, 0.2), V(0, 0.3, 0.36), 0.11, 0.1, 7);
            this._lvMesh(this.body, lvSph(0.11, 7, 5), fur, [0, 0.33, 0.2]);
            this.addStrut(this.body, ghost, V(0, 0.32, 0), V(0, 0.3, -0.25), 0.12, 0.115, 7);
            this.addStrut(this.body, ghost, V(0, 0.3, -0.25), V(0, 0.26, -0.44), 0.115, 0.1, 7);
            this._lvMesh(this.body, lvSph(0.115, 7, 5), ghost, [0, 0.3, -0.25]);
            this._lvMesh(this.body, lvSph(0.1, 7, 5), ghost, [0, 0.26, -0.44]);
            // CORE: the hole in the world its waist passes through.
            this.core = this._lvGroup(null, 0, 0.32, 0);
            this.core.rotation.y = 0.25;
            this._lvMesh(this.core, new THREE.CircleGeometry(0.27, 9), voidM);
            this._lvMesh(this.core, lvTor(0.27, 0.035, 4, 12), rim);
            // A second tendril creeps out of the rim with a stolen spoon.
            const spoon = new THREE.Group();
            this._lvMesh(spoon, lvSph(0.035, 6, 4), this._mat(0xd0d4dc, 1.0, 0.2), [0, 0, 0.03], null, [1, 0.3, 1.4]);
            this._lvMesh(spoon, lvBox(0.015, 0.008, 0.12), this._mat(0xd0d4dc, 1.0, 0.2), [0, 0, -0.06]);
            this.tendril = this._lvLimb(this.core, Math.cos(0.7) * 0.27, Math.sin(0.7) * 0.27, 0, [[0.08, 0.08, 0.06], [0.12, 0.04, 0.16]], 0.03, 0.012, ghost, spoon);
            this.head = this._lvGroup(null, 0, 0.33, 0.42);
            this._lvMesh(this.head, lvSph(0.12, 7, 5), fur, null, null, [0.9, 0.85, 1.1]);
            this._lvMesh(this.head, lvCone(0.07, 0.14, 5), fur, [0, -0.02, 0.15], [Math.PI / 2, 0, 0]);
            this._lvMesh(this.head, lvSph(0.022, 5, 4), voidM, [0, -0.02, 0.22]);
            for (const s of [-1, 1]) this._lvMesh(this.head, lvSph(0.045, 5, 4), fur, [s * 0.08, 0.09, -0.02], null, [1, 1, 0.45]);
            // ABYSSAL_EYE: no eyes but one, open in the forehead.
            this.eye = this._eye(this.head, 0, 0.06, 0.09, 0.05, p.accent);
            this.maw = this._lvMesh(this.head, lvSph(0.05, 6, 4), voidM, [0, -0.07, 0.12], null, [1.2, 0.4, 1]);
            this.tail = this._lvLimb(null, 0, 0.26, -0.5, [[0, 0.04, -0.15], [0.06, 0.12, -0.28], [0.02, 0.24, -0.34]], 0.06, 0.015, ghost);
            const pawM = (m) => this._lvMesh(null, lvSph(0.04, 5, 4), m, null, null, [1, 0.6, 1.3]);
            this.leftLeg = this._lvLimb(null, -0.06, 0.26, 0.28, [[-0.02, -0.21, 0.02]], 0.04, 0.035, fur, pawM(fur));
            this.rightLeg = this._lvLimb(null, 0.06, 0.26, 0.28, [[0.02, -0.21, 0.02]], 0.04, 0.035, fur, pawM(fur));
            this.rearLeftLeg = this._lvLimb(null, -0.06, 0.24, -0.36, [[-0.02, -0.2, -0.02]], 0.04, 0.035, ghost, pawM(ghost));
            this.rearRightLeg = this._lvLimb(null, 0.06, 0.24, -0.36, [[0.02, -0.2, -0.02]], 0.04, 0.035, ghost, pawM(ghost));
            this._lvRig({ ABYSSAL_EYE: this.eye, MAW: this.maw, VOID_TENDRIL_1: this.tail, VOID_TENDRIL_2: this.tendril, CORE: this.core, HEAD: this.head, BODY: this.body,
                LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg, REAR_LEFT_LEG: this.rearLeftLeg, REAR_RIGHT_LEG: this.rearRightLeg },
                ['CORE', 'BODY'], [this.core, this.body, this.head, this.tail, this.leftLeg, this.rightLeg, this.rearLeftLeg, this.rearRightLeg],
                ['ABYSSAL_EYE', 'MAW', 'VOID_TENDRIL_1', 'VOID_TENDRIL_2', 'HEAD', 'LEFT_LEG', 'RIGHT_LEG', 'REAR_LEFT_LEG', 'REAR_RIGHT_LEG']);
        }

        // ── Astral Jellyfish: a faceted night-sky bell, a ringed planet eye ──
        // TentacledCreature rig: EYE/TENTACLE_ONE/TENTACLE_TWO/BODY/BEAK.
        _buildLvAstralJelly() {
            const p = this.profile;
            const bellM = this.applySkin(this._mat(p.bodyColor, 0.74, 0.2, 0x10184a));
            const star = this._mat(0xffffff, 1.0, 0.2, 0xfff8d0);
            const line = this._mat(p.accent, 0.8, 0.2, p.accent);
            const sting = this._mat(0x9adfff, 0.85, 0.2, 0x3a9adf);
            this.body = this._lvGroup(null, 0, 1.35, 0);
            this._lvMesh(this.body, new THREE.SphereGeometry(0.45, 7, 4, 0, Math.PI * 2, 0, Math.PI * 0.55), bellM);
            this._lvMesh(this.body, lvTor(0.44, 0.03, 3, 14), bellM, [0, -0.07, 0], [Math.PI / 2, 0, 0]);
            // Star specks on the bell and a constellation drawn inside it.
            for (let i = 0; i < 10; i++) { const a = i * 2.4, e = 0.25 + this.idRand() * 1.1; this._lvStud(this.body, new THREE.OctahedronGeometry(0.03, 0), star, [0, 0, 0], [0.45, 0.45, 0.45], [Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)], -0.005); }
            const cp = [[-0.6, 0.5], [-0.1, 0.9], [0.4, 0.7], [0.9, 1.1], [1.5, 0.6]].map(([a, e]) => new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)).multiplyScalar(0.44));
            for (let i = 0; i < cp.length; i++) { this._lvMesh(this.body, new THREE.OctahedronGeometry(0.035, 0), star, [cp[i].x, cp[i].y, cp[i].z]); if (i) this.addStrut(this.body, line, cp[i - 1], cp[i], 0.007, 0.007, 3); }
            // EYE: a stalked eye like a small planet, wearing its own ring.
            this.addStrut(this.body, bellM, new THREE.Vector3(0, 0.0, 0), new THREE.Vector3(0, -0.3, 0), 0.07, 0.05, 6);
            this.eye = this._lvGroup(this.body, 0, -0.38, 0);
            this._lvMesh(this.eye, lvSph(0.1, 8, 6), this._mat(0xd8e8ff, 1.0, 0.3));
            this._lvMesh(this.eye, lvSph(0.05, 6, 4), this._mat(p.accent, 1.0, 0.2, p.accent), [0, 0, 0.07]);
            this.ring = this._lvMesh(this.eye, lvTor(0.16, 0.012, 3, 16), line, null, [1.2, 0.3, 0]);
            this.ring.userData.float = true; this._floaters.push(this.ring);
            // BEAK: four oral arms under the eye.
            this.beak = this._lvGroup(this.body, 0, -0.48, 0);
            for (let i = 0; i < 4; i++) this._lvMesh(this.beak, lvCone(0.025, 0.12, 4), bellM, [Math.cos(i * 1.57) * 0.04, -0.03, Math.sin(i * 1.57) * 0.04], [Math.PI, 0, 0]);
            // Two long zigzag stinging tentacles, plus a fringe off the rim.
            const zig = (s) => this._lvLimb(null, s * 0.42, 1.27, 0.1, [[s * 0.06, -0.22, 0.04], [-s * 0.03, -0.44, 0.06], [s * 0.06, -0.66, 0.04], [0, -0.86, 0.02]], 0.03, 0.014, sting);
            this.tentacleOne = zig(-1); this.tentacleTwo = zig(1);
            this._fringe = [];
            for (let i = 0; i < 8; i++) { const a = (i + 0.5) / 8 * Math.PI * 2; this._fringe.push(this._lvLimb(null, Math.cos(a) * 0.43, 1.27, Math.sin(a) * 0.43, [[Math.cos(a) * 0.03, -0.18, Math.sin(a) * 0.03], [0, -0.36, 0]], 0.018, 0.008, line)); }
            this._lvRig({ EYE: this.eye, TENTACLE_ONE: this.tentacleOne, TENTACLE_TWO: this.tentacleTwo, BODY: this.body, BEAK: this.beak },
                ['BODY'], [this.body, this.tentacleOne, this.tentacleTwo, ...this._fringe], ['EYE', 'TENTACLE_ONE', 'TENTACLE_TWO', 'BEAK']);
        }

        // ── Lunar Hopper: crater-pocked hare, a glowing crescent on its brow ──
        // Rabbit rig: HEAD/BODY/EARS/LEFT_LEG/RIGHT_LEG/REAR_LEFT_LEG/REAR_RIGHT_LEG/TAIL/TEETH.
        _buildLvLunarHopper() {
            const p = this.profile;
            const fur = this._skinMat(p.bodyColor, 0.9);
            const crater = this._mat(0x8a8a88, 1.0, 0.9);
            const pink = this._mat(0xe8b8c0, 1.0, 0.7);
            const C = [0, 0.42, -0.06], R = [0.255, 0.255, 0.39];
            this.body = this._lvGroup(null, 0, 0, 0);
            this._lvMesh(this.body, lvSph(0.3, 8, 6), fur, C, null, [0.85, 0.85, 1.3]);
            for (let i = 0; i < 6; i++) { const a = i * 2.2 + 0.4, e = 0.1 + this.idRand() * 0.8; this._lvStud(this.body, lvCyl(0.055, 0.045, 0.03, 7), crater, C, R, [Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)], -0.008); }
            this.head = this._lvGroup(null, 0, 0.62, 0.34);
            this._lvMesh(this.head, lvSph(0.16, 8, 6), fur, null, null, [0.9, 0.95, 1.15]);
            this._lvMesh(this.head, lvTor(0.055, 0.014, 3, 8, Math.PI), this._mat(p.accent, 1.0, 0.3, p.accent), [0, 0.1, 0.13], [-0.6, 0, Math.PI]);
            for (const s of [-1, 1]) this._eye(this.head, s * 0.1, 0.03, 0.09, 0.045, 0x101018).rotation.y = s * 0.8;
            this._lvMesh(this.head, lvSph(0.025, 5, 4), pink, [0, -0.02, 0.18]);
            this.teeth = this._lvGroup(this.head, 0, -0.08, 0.16);
            for (const s of [-1, 1]) this._lvMesh(this.teeth, lvBox(0.025, 0.05, 0.015), this._mat(0xfaf6ec, 1.0, 0.3), [s * 0.014, 0, 0]);
            this.ears = this._lvGroup(this.head, 0, 0.12, -0.04);
            for (const s of [-1, 1]) { const e = this._lvGroup(this.ears, s * 0.05, 0, 0); e.rotation.set(-0.35, 0, -s * 0.18); this._lvMesh(e, lvSph(0.06, 6, 5), fur, [0, 0.25, 0], null, [0.6, 4.5, 0.3]); this._lvMesh(e, lvSph(0.045, 6, 5), pink, [0, 0.25, 0.012], null, [0.5, 4.2, 0.2]); }
            const pawM = () => this._lvMesh(null, lvSph(0.04, 5, 4), fur, null, null, [1, 0.6, 1.4]);
            this.leftLeg = this._lvLimb(null, -0.09, 0.3, 0.2, [[0, -0.26, 0.04]], 0.035, 0.03, fur, pawM());
            this.rightLeg = this._lvLimb(null, 0.09, 0.3, 0.2, [[0, -0.26, 0.04]], 0.035, 0.03, fur, pawM());
            const hind = (s) => {
                const g = this._lvLimb(null, s * 0.16, 0.36, -0.2, [[0, -0.16, -0.14], [0, -0.31, -0.02]], 0.06, 0.045, fur, this._lvMesh(null, lvBox(0.08, 0.045, 0.36), fur, [0, -0.005, 0.12]));
                this._lvMesh(g, lvSph(0.15, 7, 5), fur, null, null, [0.6, 1.0, 1.3]); return g;
            };
            this.rearLeftLeg = hind(-1); this.rearRightLeg = hind(1);
            this.tail = this._lvMesh(this.bodyGroup, lvSph(0.08, 6, 5), this._mat(0xfaf8f0, 1.0, 0.95), [0, 0.5, -0.44]);
            this._lvRig({ HEAD: this.head, BODY: this.body, EARS: this.ears, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg, REAR_LEFT_LEG: this.rearLeftLeg, REAR_RIGHT_LEG: this.rearRightLeg, TAIL: this.tail, TEETH: this.teeth },
                ['BODY'], [this.body, this.head, this.leftLeg, this.rightLeg, this.rearLeftLeg, this.rearRightLeg, this.tail], ['HEAD', 'EARS', 'LEFT_LEG', 'RIGHT_LEG', 'REAR_LEFT_LEG', 'REAR_RIGHT_LEG', 'TAIL', 'TEETH']);
        }

        // ── Mall Guard Bot: a squat drum on casters, CCTV head, riot shield ──
        // RoboticDefender rig: HEAD/ARM_CANNON/TORSO/LEG_JOINTS/SENSORS/JAWS.
        _buildLvMallGuard() {
            const p = this.profile;
            const plate = this._skinMat(p.bodyColor, 0.4);
            const grey = this._mat(0x9aa0a8, 1.0, 0.4);
            const black = this._mat(0x181818, 1.0, 0.5);
            this.body = this._lvGroup(null, 0, 0, 0);
            this._lvMesh(this.body, lvCyl(0.36, 0.4, 0.56, 8), plate, [0, 0.56, 0]);
            this._lvMesh(this.body, lvCyl(0.376, 0.384, 0.08, 8), this._mat(0xf0f0f0, 1.0, 0.5), [0, 0.66, 0]);
            this._lvMesh(this.body, lvBox(0.1, 0.12, 0.02), this._mat(0xd8b040, 1.0, 0.3), [0.17, 0.76, 0.33], [0, 0.48, 0]);
            for (const s of [-1, 1]) this._lvMesh(this.body, lvSph(0.08, 6, 4), grey, [s * 0.38, 0.74, 0]);
            this._lvMesh(this.body, lvCyl(0.05, 0.05, 0.16, 6), grey, [0, 0.9, 0]);
            // The keys to every exit, swinging on a lanyard from the badge.
            const ring = new THREE.Group();
            this._lvMesh(ring, lvTor(0.03, 0.006, 3, 8), grey, [0, -0.03, 0]);
            for (let i = 0; i < 3; i++) this._lvMesh(ring, lvBox(0.015, 0.07, 0.006), this._mat(0xc8b060, 1.0, 0.3), [(i - 1) * 0.02, -0.09, 0.004], [0, 0, (i - 1) * 0.3]);
            this.keys = this._lvLimb(this.body, 0.17, 0.7, 0.34, [[0.01, -0.12, 0.02], [-0.01, -0.2, 0.03]], 0.008, 0.008, this._mat(0xc02020, 1.0, 0.8), ring);
            // LEG_JOINTS: a skirt on three caster wheels.
            this.base = this._lvGroup(null, 0, 0, 0);
            this._lvMesh(this.base, lvCyl(0.4, 0.34, 0.14, 8), grey, [0, 0.21, 0]);
            for (let i = 0; i < 3; i++) { const a = i * 2.09 + 0.5; this._lvMesh(this.base, lvBox(0.03, 0.08, 0.03), grey, [Math.cos(a) * 0.22, 0.14, Math.sin(a) * 0.22]); this._lvMesh(this.base, lvCyl(0.07, 0.07, 0.05, 8), black, [Math.cos(a) * 0.22, 0.07, Math.sin(a) * 0.22], [0, 0, Math.PI / 2]); }
            // HEAD: a CCTV camera that turns to follow you.
            this.head = this._lvGroup(null, 0, 0.98, 0);
            this._lvMesh(this.head, lvBox(0.24, 0.18, 0.34), grey, [0, 0.04, 0.04]);
            this._lvMesh(this.head, lvBox(0.28, 0.03, 0.4), plate, [0, 0.145, 0.06]);
            this._lvMesh(this.head, lvCyl(0.07, 0.08, 0.06, 8), black, [0, 0.04, 0.23], [Math.PI / 2, 0, 0]);
            this.lens = this._lvMesh(this.head, lvSph(0.045, 6, 4), this._mat(p.accent, 1.0, 0.2, p.accent), [0, 0.04, 0.255], null, [1, 1, 0.5]);
            // SENSORS: a red and blue beacon on the hood.
            this.siren = this._lvGroup(this.head, 0, 0.16, 0.0);
            this._lvMesh(this.siren, lvCyl(0.06, 0.07, 0.03, 8), black, [0, 0.0, 0]);
            this._lvMesh(this.siren, new THREE.SphereGeometry(0.06, 6, 4, 0, Math.PI, 0, Math.PI / 2), this._mat(0xff2a2a, 0.9, 0.2, 0xff2a2a), [0, 0.015, 0]);
            this._lvMesh(this.siren, new THREE.SphereGeometry(0.06, 6, 4, Math.PI, Math.PI, 0, Math.PI / 2), this._mat(0x2a5aff, 0.9, 0.2, 0x2a5aff), [0, 0.015, 0]);
            // JAWS: the speaker grille it barks "the mall is closed" through.
            this.jaws = this._lvGroup(null, 0, 0.47, 0.385);
            this._lvMesh(this.jaws, lvBox(0.24, 0.12, 0.03), black);
            for (let i = 0; i < 4; i++) this._lvMesh(this.jaws, lvBox(0.22, 0.012, 0.04), grey, [0, -0.045 + i * 0.03, 0]);
            // ARM_CANNON: a long police torch; the left arm holds a riot shield.
            const torch = new THREE.Group();
            this._lvMesh(torch, lvCyl(0.05, 0.07, 0.26, 8), black, [0, 0, 0.1], [Math.PI / 2, 0, 0]);
            this.torchLens = this._lvMesh(torch, lvCyl(0.065, 0.065, 0.01, 8), this._mat(0xfff0a0, 1.0, 0.2, 0xfff0a0), [0, 0, 0.235], [Math.PI / 2, 0, 0]);
            this.rightArm = this._lvLimb(null, 0.4, 0.72, 0, [[0.06, -0.16, 0.12], [0.06, -0.2, 0.28]], 0.06, 0.05, grey, torch);
            const shield = new THREE.Group();
            this._lvMesh(shield, lvBox(0.36, 0.5, 0.03), this._mat(0x9ac8e8, 0.55, 0.1), [0, -0.02, 0.05]);
            this._lvMesh(shield, lvBox(0.3, 0.06, 0.035), black, [0, 0.12, 0.05]);
            this.leftArm = this._lvLimb(null, -0.4, 0.72, 0, [[-0.06, -0.14, 0.14]], 0.06, 0.05, grey, shield);
            this._lvRig({ HEAD: this.head, ARM_CANNON: this.rightArm, TORSO: this.body, LEG_JOINTS: this.base, SENSORS: this.siren, JAWS: this.jaws, LEFT_ARM: this.leftArm },
                ['TORSO'], [this.body, this.head, this.base, this.jaws, this.leftArm, this.rightArm], ['HEAD', 'ARM_CANNON', 'LEG_JOINTS', 'SENSORS', 'JAWS', 'LEFT_ARM']);
        }

        // ── Loose Bolt Bot: a crooked box held by one bolt, spring legs ──────
        // Robot rig: HEAD/CORE/LEFT_ARM/RIGHT_ARM/LEFT_LEG/RIGHT_LEG/JAWS.
        _buildLvLooseBolt() {
            const p = this.profile;
            const tin = this._skinMat(p.bodyColor, 0.5);
            const steel = this._mat(0xb8bcc4, 1.0, 0.3);
            const dark = this._mat(0x202020, 1.0, 0.5);
            this.body = this._lvGroup(null, 0, 0.62, 0);
            this.body.rotation.z = 0.12;
            this._lvMesh(this.body, lvBox(0.42, 0.36, 0.34), tin);
            this._lvMesh(this.body, lvBox(0.16, 0.14, 0.02), this._mat(0xa86a3a, 1.0, 0.6), [0.1, 0.05, 0.175], [0, 0, 0.1]);
            for (let i = 0; i < 6; i++) this._lvMesh(this.body, lvSph(0.016, 4, 3), steel, [(i % 3 - 1) * 0.17, i < 3 ? 0.15 : -0.15, 0.172]);
            this.oil = this._lvGroup(this.body, 0.14, -0.18, 0.1);
            this._lvMesh(this.oil, lvCone(0.02, 0.06, 4), dark, [0, -0.03, 0], [Math.PI, 0, 0]);
            this._lvMesh(this.oil, lvSph(0.02, 4, 3), dark, [0, -0.075, 0], null, [1, 1.3, 1]);
            // CORE: the one loose bolt right through it, half its nut spun off.
            this.core = this._lvGroup(this.body, 0, 0, 0.04);
            this._lvMesh(this.core, lvCyl(0.035, 0.035, 0.62, 6), steel, null, [0, 0, Math.PI / 2]);
            this._lvMesh(this.core, lvCyl(0.08, 0.08, 0.06, 6), steel, [0.32, 0, 0], [0, 0, Math.PI / 2]);
            this._lvMesh(this.core, lvCyl(0.07, 0.07, 0.05, 6), steel, [-0.29, 0, 0], [0.4, 0, Math.PI / 2]);
            // HEAD: a tin can on a spring, one big lens and one tiny one.
            for (let i = 0; i < 3; i++) this._lvMesh(this.body, lvTor(0.05, 0.016, 4, 8), steel, [0, 0.2 + i * 0.03, 0], [Math.PI / 2, 0, 0]);
            this.head = this._lvGroup(this.body, 0, 0.37, 0);
            this.head.rotation.z = -0.2;
            this._lvMesh(this.head, lvCyl(0.14, 0.14, 0.2, 8), tin);
            this._lvMesh(this.head, lvTor(0.14, 0.012, 3, 10), steel, [0, 0.1, 0], [Math.PI / 2, 0, 0]);
            this._eye(this.head, -0.05, 0.02, 0.12, 0.055, p.accent);
            this._eye(this.head, 0.07, 0.04, 0.125, 0.025, 0xff3322);
            this.addStrut(this.head, steel, new THREE.Vector3(0.06, 0.08, 0), new THREE.Vector3(0.06, 0.24, 0), 0.008, 0.008, 4);
            this.addStrut(this.head, steel, new THREE.Vector3(0.06, 0.24, 0), new THREE.Vector3(0.13, 0.3, 0), 0.008, 0.008, 4);
            this._lvMesh(this.head, lvSph(0.02, 5, 4), this._mat(0xff3322, 1.0, 0.3, 0xff3322), [0.13, 0.3, 0]);
            // JAWS: a jaw plate dangling off its last hinge.
            this.jaw = this._lvGroup(this.head, 0, -0.1, 0.12);
            this.jaw.rotation.x = 0.5;
            this._lvMesh(this.jaw, lvBox(0.16, 0.02, 0.1), tin, [0, -0.01, 0.04]);
            const claw = new THREE.Group();
            for (const s of [-1, 1]) this._lvMesh(claw, lvCone(0.02, 0.1, 4), steel, [s * 0.025, -0.04, 0], [0, 0, s * 0.3 + Math.PI]);
            this.leftArm = this._lvLimb(this.body, -0.22, 0.08, 0, [[-0.1, -0.12, 0.06], [-0.12, -0.28, 0.12]], 0.03, 0.025, steel, claw);
            const wrench = new THREE.Group();
            this._lvMesh(wrench, lvBox(0.03, 0.18, 0.015), steel, [0, -0.07, 0]);
            this._lvMesh(wrench, lvTor(0.04, 0.014, 3, 8, Math.PI * 1.4), steel, [0, -0.19, 0], [0, 0, -Math.PI * 0.2]);
            this.rightArm = this._lvLimb(this.body, 0.22, 0.08, 0, [[0.1, -0.1, 0.08], [0.12, -0.26, 0.14]], 0.03, 0.025, steel, wrench);
            const spring = (s) => {
                const g = this._lvGroup(null, s * 0.12, 0.47, 0);
                for (let i = 0; i < 12; i++) this._lvMesh(g, lvTor(0.05, 0.018, 4, 8), steel, [0, -0.02 - i * 0.034, 0], [Math.PI / 2, 0, 0]);
                this._lvMesh(g, lvBox(0.12, 0.04, 0.16), dark, [0, -0.43, 0.02]);
                return g;
            };
            this.leftLeg = spring(-1); this.rightLeg = spring(1);
            this._lvRig({ HEAD: this.head, CORE: this.core, LEFT_ARM: this.leftArm, RIGHT_ARM: this.rightArm, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg, JAWS: this.jaw, TORSO: this.body, BODY: this.body },
                ['TORSO', 'BODY'], [this.body, this.leftLeg, this.rightLeg], ['HEAD', 'CORE', 'LEFT_ARM', 'RIGHT_ARM', 'LEFT_LEG', 'RIGHT_LEG', 'JAWS']);
        }

        // ── Plush Bear: a threadbare shop teddy, one button eye, price tag ───
        // Golem rig: CORE/LEFT_ARM/RIGHT_ARM/LEFT_LEG/RIGHT_LEG/MAW.
        _buildLvPlushBear() {
            const p = this.profile;
            const plush = this._skinMat(p.bodyColor, 0.95);
            const tan = this._mat(0xd8b088, 1.0, 0.9);
            const black = this._mat(0x101010, 1.0, 0.3);
            const thread = this._mat(0x2a1a10, 1.0, 0.9);
            const C = [0, 0.42, 0], R = [0.34, 0.38, 0.306];
            this.body = this._lvGroup(null, 0, 0, 0);
            this._lvMesh(this.body, lvSph(0.34, 8, 6), plush, C, null, [1, 1.12, 0.9]);
            this._lvMesh(this.body, lvSph(0.22, 7, 5), tan, [0, 0.36, 0.16], null, [1, 1.1, 0.75]);
            // Stuffing bursting out of a split side seam.
            for (let i = 0; i < 3; i++) this._lvStud(this.body, new THREE.IcosahedronGeometry(0.07 - i * 0.012, 0), this._mat(0xf4f0e8, 1.0, 0.95), C, R, [-0.8, 0.3 - i * 0.12, 0.5 + i * 0.05], -0.01);
            // CORE: a stitched red felt heart.
            this.core = this._lvGroup(null, -0.12, 0.58, 0.27);
            const felt = this._mat(p.accent, 1.0, 0.85);
            for (const s of [-1, 1]) this._lvMesh(this.core, lvSph(0.04, 6, 4), felt, [s * 0.03, 0.01, 0], null, [1, 1, 0.4]);
            this._lvMesh(this.core, lvCone(0.065, 0.08, 4), felt, [0, -0.045, 0], [Math.PI, 0, 0], [1, 1, 0.35]);
            this.head = this._lvGroup(null, 0, 0.93, 0.02);
            this._lvMesh(this.head, lvSph(0.27, 8, 6), plush);
            this._lvMesh(this.head, lvSph(0.11, 7, 5), tan, [0, -0.06, 0.23], null, [1.25, 0.9, 0.85]);
            this._lvMesh(this.head, lvSph(0.04, 6, 4), black, [0, -0.02, 0.31], null, [1.3, 0.8, 0.8]);
            for (const s of [-1, 1]) { this._lvMesh(this.head, lvSph(0.09, 6, 5), plush, [s * 0.19, 0.2, 0], null, [1, 1, 0.5]); this._lvMesh(this.head, lvSph(0.055, 6, 4), tan, [s * 0.19, 0.2, 0.03], null, [1, 1, 0.3]); }
            // One shank button eye; the other is gone, sewn shut with an X.
            this._lvMesh(this.head, lvCyl(0.045, 0.045, 0.02, 8), black, [-0.09, 0.05, 0.25], [Math.PI / 2, 0, 0]);
            for (const s of [-1, 1]) this._lvMesh(this.head, lvBox(0.07, 0.012, 0.014), thread, [0.09, 0.05, 0.25], [0, 0, s * 0.78]);
            this.addStrut(this.head, thread, new THREE.Vector3(0.11, 0.03, 0.25), new THREE.Vector3(0.13, -0.06, 0.27), 0.004, 0.004, 3);
            // The shop's price tag, still hanging off the left ear.
            this.addStrut(this.head, this._mat(0xf0f0f0, 1.0, 0.8), new THREE.Vector3(-0.24, 0.2, 0.02), new THREE.Vector3(-0.3, 0.06, 0.06), 0.005, 0.005, 3);
            this._lvMesh(this.head, lvBox(0.09, 0.06, 0.008), this._mat(0xfafafa, 1.0, 0.8), [-0.3, 0.03, 0.06]);
            this._lvMesh(this.head, lvBox(0.07, 0.015, 0.01), this._mat(0xd02020, 1.0, 0.7), [-0.3, 0.03, 0.062]);
            // MAW: a stitched mouth under the nose.
            this.maw = this._lvGroup(this.head, 0, -0.1, 0.305);
            this._lvMesh(this.maw, lvBox(0.01, 0.05, 0.01), thread, [0, 0.03, 0]);
            for (const s of [-1, 1]) this._lvMesh(this.maw, lvBox(0.05, 0.01, 0.01), thread, [s * 0.02, 0.005, -0.004], [0, 0, s * 0.5]);
            const pawEnd = () => { const g = new THREE.Group(); this._lvMesh(g, lvSph(0.1, 7, 5), plush); this._lvMesh(g, lvSph(0.06, 6, 4), tan, [0, 0, 0.06], null, [1, 1, 0.4]); return g; };
            this.leftArm = this._lvLimb(null, -0.27, 0.62, 0.02, [[-0.12, -0.05, 0.2]], 0.09, 0.085, plush, pawEnd());
            this.rightArm = this._lvLimb(null, 0.27, 0.62, 0.02, [[0.12, -0.05, 0.2]], 0.09, 0.085, plush, pawEnd());
            const footEnd = () => { const g = new THREE.Group(); this._lvMesh(g, lvSph(0.12, 7, 5), plush, null, null, [1, 1, 0.6]); this._lvMesh(g, lvSph(0.08, 6, 4), tan, [0, 0, 0.06], null, [1, 1, 0.3]); return g; };
            this.leftLeg = this._lvLimb(null, -0.16, 0.2, 0.1, [[-0.02, -0.06, 0.26]], 0.1, 0.095, plush, footEnd());
            this.rightLeg = this._lvLimb(null, 0.16, 0.2, 0.1, [[0.02, -0.06, 0.26]], 0.1, 0.095, plush, footEnd());
            this._lvRig({ CORE: this.core, LEFT_ARM: this.leftArm, RIGHT_ARM: this.rightArm, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg, MAW: this.maw, HEAD: this.head, BODY: this.body, TORSO: this.body },
                ['BODY', 'TORSO'], [this.body, this.head, this.core, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg], ['CORE', 'LEFT_ARM', 'RIGHT_ARM', 'LEFT_LEG', 'RIGHT_LEG', 'MAW', 'HEAD']);
        }

        // ── Spark Plug Sprite: an escaped spark plug, arcing in its own gap ──
        // ThunderElemental rig: CORE/BODY/arms/legs (electric)/MAW.
        _buildLvSparkPlug() {
            const p = this.profile;
            const ceramic = this._skinMat(p.bodyColor, 0.3);
            const steel = this._mat(0xa8b0b8, 1.0, 0.25);
            const zap = this._mat(p.accent, 0.95, 0.2, p.accent);
            this.body = this._lvGroup(null, 0, 0, 0);
            this._lvMesh(this.body, lvCyl(0.05, 0.05, 0.08, 6), steel, [0, 1.32, 0]);
            for (let i = 0; i < 4; i++) this._lvMesh(this.body, lvCyl(i % 2 ? 0.085 : 0.1, i % 2 ? 0.085 : 0.1, 0.06, 8), ceramic, [0, 1.25 - i * 0.06, 0]);
            this._lvMesh(this.body, lvCyl(0.11, 0.12, 0.2, 8), ceramic, [0, 0.93, 0]);
            this._lvMesh(this.body, lvCyl(0.15, 0.15, 0.12, 6), steel, [0, 0.77, 0]);
            this._lvMesh(this.body, lvCyl(0.08, 0.08, 0.18, 8), steel, [0, 0.62, 0]);
            for (let i = 0; i < 3; i++) this._lvMesh(this.body, lvTor(0.08, 0.012, 3, 8), steel, [0, 0.57 + i * 0.05, 0], [Math.PI / 2, 0, 0]);
            this._lvMesh(this.body, lvCyl(0.015, 0.015, 0.06, 5), steel, [0, 0.5, 0]);
            this._lvMesh(this.body, lvBox(0.025, 0.12, 0.025), steel, [0.07, 0.47, 0]);
            this._lvMesh(this.body, lvBox(0.09, 0.025, 0.025), steel, [0.035, 0.4, 0]);
            // A face on the insulator: two arc-light eyes and a zigzag grin.
            for (const s of [-1, 1]) this._lvMesh(this.body, lvSph(0.025, 5, 4), zap, [s * 0.045, 0.97, 0.105]);
            this.maw = this._lvGroup(null, 0, 0.9, 0.115);
            const mp = [[-0.05, 0.01], [-0.025, -0.01], [0, 0.01], [0.025, -0.01], [0.05, 0.01]].map(([x, y]) => new THREE.Vector3(x, y, 0));
            for (let i = 0; i < 4; i++) this.addStrut(this.maw, this._mat(0x1a1a24, 1.0, 0.5), mp[i], mp[i + 1], 0.008, 0.008, 3);
            // CORE: the spark itself, jumping the electrode gap.
            this.core = this._lvMesh(this.bodyGroup, new THREE.OctahedronGeometry(0.04, 0), this._mat(0xffffff, 1.0, 0.2, p.accent), [0, 0.44, 0]);
            const spark = () => this._lvMesh(null, new THREE.OctahedronGeometry(0.035, 0), zap);
            const bolt = (s, y, pts) => this._lvLimb(null, s * 0.1, y, 0, pts, 0.022, 0.014, zap, spark());
            this.leftArm = bolt(-1, 0.77, [[-0.14, 0.1, 0.02], [-0.2, -0.02, 0.05], [-0.32, 0.08, 0.06]]);
            this.rightArm = bolt(1, 0.77, [[0.14, 0.1, 0.02], [0.2, -0.02, 0.05], [0.32, 0.08, 0.06]]);
            this.leftLeg = bolt(-1, 0.73, [[-0.06, -0.12, 0.02], [0.0, -0.24, 0.03], [-0.08, -0.36, 0.02]]);
            this.rightLeg = bolt(1, 0.73, [[0.06, -0.12, 0.02], [0.0, -0.24, 0.03], [0.08, -0.36, 0.02]]);
            this._lvRig({ CORE: this.core, BODY: this.body, LEFT_ELECTRIC_ARM: this.leftArm, RIGHT_ELECTRIC_ARM: this.rightArm, LEFT_ELECTRIC_LEG: this.leftLeg, RIGHT_ELECTRIC_LEG: this.rightLeg, MAW: this.maw },
                ['BODY'], [this.body, this.core, this.maw, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg], ['CORE', 'LEFT_ELECTRIC_ARM', 'RIGHT_ELECTRIC_ARM', 'LEFT_ELECTRIC_LEG', 'RIGHT_ELECTRIC_LEG', 'MAW']);
        }

        // ── Plague Leech: arched and bloated, a glassy blood-full segment ────
        // SegmentWorm rig: HEAD/HEART_SEGMENT/BODY_SEGMENT/TAIL/MAW.
        _buildLvPlagueLeech() {
            const p = this.profile;
            const hide = this._skinMat(p.bodyColor, 0.35);
            const band = this._mat(0x8a5a2a, 1.0, 0.5);
            const boil = this._mat(p.accent, 1.0, 0.4, 0x2a3000);
            // Anchored by the rear sucker, the front reared up to bite.
            const S = [[-0.6, 0.13, 0.15], [-0.4, 0.18, 0.2], [-0.15, 0.24, 0.25], [0.1, 0.3, 0.26], [0.3, 0.42, 0.2], [0.44, 0.56, 0.14]];
            this._segs = [];
            const seg = (parent, i, mat) => { const [z, y, r] = S[i]; const m = this._lvMesh(parent, lvSph(r, 8, 6), mat, [0, y, z], null, [1.15, 0.8, 1]); this._segs.push(m); this._lvMesh(parent, lvTor(r * 0.97, 0.018, 3, 12), band, [0, y, z], null, [1.15, 0.8, 1]); return m; };
            this.body = this._lvGroup(null, 0, 0, 0);
            [1, 2, 4].forEach(i => seg(this.body, i, hide));
            for (let i = 0; i < 6; i++) { const [z, y, r] = S[[1, 2, 4][i % 3]]; this._lvStud(this.body, lvSph(0.035 + (i % 2) * 0.015, 5, 4), boil, [0, y, z], [r * 1.15, r * 0.8, r], [Math.cos(i * 2.1) * 0.7, 0.8, Math.sin(i * 2.1) * 0.5], -0.01); }
            // HEART_SEGMENT: glassy skin over a dark sac of every sickness it drank,
            // pierced by the brass ring of an apothecary's tag.
            this.heart = this._lvGroup(null, 0, 0, 0);
            seg(this.heart, 3, this.applySkin(this._mat(0x6a1a1a, 0.55, 0.15)));
            const H = S[3];
            this.sac = this._lvMesh(this.heart, lvSph(0.15, 7, 5), this._mat(0xa01010, 1.0, 0.3, 0x300000), [0, H[1], H[0]]);
            this._lvMesh(this.heart, lvTor(0.07, 0.012, 3, 10), this._mat(0xc8a040, 1.0, 0.3), [0.29, H[1] + 0.02, H[0]], [0, Math.PI / 2, 0]);
            this._lvMesh(this.heart, lvBox(0.008, 0.1, 0.07), this._mat(0xe8dcb0, 1.0, 0.8), [0.31, H[1] - 0.1, H[0]]);
            this.head = this._lvGroup(null, 0, 0, 0);
            seg(this.head, 5, hide);
            for (let i = 0; i < 5; i++) this._lvMesh(this.head, lvSph(0.012, 4, 3), this._mat(0x0a0a0a, 1.0, 0.3), [(i - 2) * 0.03, S[5][1] + 0.105, S[5][0] + 0.02 - Math.abs(i - 2) * 0.01]);
            // MAW: a ring sucker set with tiny teeth, tipped down to bite.
            this.maw = this._lvGroup(this.head, 0, S[5][1] - 0.02, S[5][0] + 0.13);
            this.maw.rotation.x = 0.35;
            this._lvMesh(this.maw, lvTor(0.07, 0.025, 4, 10), this._mat(0x5a1018, 1.0, 0.5));
            for (let i = 0; i < 8; i++) this._lvMesh(this.maw, lvSph(0.012, 4, 3), this._mat(0xf0e8d8, 1.0, 0.4), [Math.cos(i * 0.785) * 0.05, Math.sin(i * 0.785) * 0.05, 0.01]);
            this.tail = this._lvGroup(null, 0, 0, 0);
            seg(this.tail, 0, hide);
            this._lvMesh(this.tail, lvCyl(0.13, 0.15, 0.03, 10), this._mat(0x1a1410, 1.0, 0.6), [0, 0.02, -0.6]);
            this._lvRig({ HEAD: this.head, HEART_SEGMENT: this.heart, BODY_SEGMENT: this.body, TAIL: this.tail, MAW: this.maw },
                ['HEART_SEGMENT'], [this.heart, this.body, this.head, this.tail], ['HEAD', 'BODY_SEGMENT', 'TAIL', 'MAW']);
        }

        // ── Coin Purse Mimic: a kiss-lock purse, clasp knobs for eyes ────────
        // ChestMimic rig: CORE/LID/TEETH/TONGUE/FEET.
        _buildLvCoinPurse() {
            const p = this.profile;
            const leather = this._skinMat(p.bodyColor, 0.7);
            const brass = this._mat(0xd8b040, 1.0, 0.25);
            const tooth = this._mat(0xf0ead8, 1.0, 0.4);
            const coinM = this._mat(p.accent, 1.0, 0.25, 0x302000);
            this.core = this._lvGroup(null, 0, 0, 0);
            this._lvMesh(this.core, new THREE.SphereGeometry(0.38, 9, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), leather, [0, 0.4, 0], null, [1.25, 0.85, 0.8]);
            this._lvMesh(this.core, lvCyl(0.44, 0.44, 0.01, 10), this._mat(0x3a0a10, 1.0, 0.8), [0, 0.39, 0], null, [1, 1, 0.64]);
            this._lvMesh(this.core, lvTor(0.38, 0.022, 4, 14), brass, [0, 0.4, 0], [Math.PI / 2, 0, 0], [1.25, 0.8, 1]);
            for (let i = 0; i < 2; i++) this._lvMesh(this.core, lvTor(0.3 - i * 0.08, 0.012, 3, 12), this._mat(0x5a3418, 1.0, 0.8), [0, 0.28 - i * 0.08, 0], [Math.PI / 2, 0, 0], [1.25 + i * 0.05, 0.8, 1]);
            this.teeth = this._lvGroup(null, 0, 0, 0);
            for (let i = 0; i < 9; i++) { const a = Math.PI * (0.12 + i * 0.095); this._lvMesh(this.teeth, lvCone(0.03, 0.08, 4), tooth, [Math.cos(a) * 0.44, 0.43, Math.sin(a) * 0.27]); }
            // LID: the upper half on its rear hinge; the clasp knobs stare.
            this.lid = this._lvGroup(null, 0, 0.4, -0.3);
            this.lid.rotation.x = -0.18;
            this._lvMesh(this.lid, new THREE.SphereGeometry(0.38, 9, 4, 0, Math.PI * 2, 0, Math.PI / 2), leather, [0, 0, 0.3], null, [1.25, 0.7, 0.8]);
            this._lvMesh(this.lid, lvTor(0.38, 0.022, 4, 14), brass, [0, 0, 0.3], [Math.PI / 2, 0, 0], [1.25, 0.8, 1]);
            for (let i = 0; i < 7; i++) { const a = Math.PI * (0.18 + i * 0.11); this._lvMesh(this.lid, lvCone(0.026, 0.07, 4), tooth, [Math.cos(a) * 0.44, -0.03, 0.3 + Math.sin(a) * 0.27], [Math.PI, 0, 0]); }
            this.eyes = this._lvGroup(this.lid, 0, 0.05, 0.58);
            for (const s of [-1, 1]) { this._lvMesh(this.eyes, lvSph(0.055, 7, 5), brass, [s * 0.06, 0, 0]); this._lvMesh(this.eyes, lvSph(0.025, 5, 4), this._mat(0x0a0a0a, 1.0, 0.3), [s * 0.06, 0.005, 0.045]); }
            // TONGUE: a shingled run of coins lolling over the front lip.
            this.tongue = this._lvGroup(null, 0, 0.41, -0.05);
            for (let i = 0; i < 6; i++) this._lvMesh(this.tongue, lvCyl(0.07, 0.07, 0.022, 10), coinM, [Math.sin(i) * 0.02, 0.02 - Math.max(0, i - 3) * 0.05, 0.05 + i * 0.065], [1.2 + Math.max(0, i - 3) * 0.3, 0, 0]);
            this.feet = this._lvGroup(null, 0, 0, 0);
            for (const sx of [-1, 1]) for (const sz of [-1, 1]) this._lvMesh(this.feet, lvCyl(0.04, 0.03, 0.15, 6), leather, [sx * 0.18, 0.075, sz * 0.12]);
            this._lvRig({ CORE: this.core, LID: this.lid, TEETH: this.teeth, TONGUE: this.tongue, FEET: this.feet },
                ['CORE'], [this.core, this.lid, this.teeth, this.tongue, this.feet], ['LID', 'TEETH', 'TONGUE', 'FEET']);
        }

        // ── Morgue Crawler: pallid blue-veined centipede, a toe tag in tow ───
        // SegmentWorm rig: HEAD/HEART_SEGMENT/BODY_SEGMENT/TAIL/MAW.
        _buildLvMorgueCrawler() {
            const p = this.profile;
            const pale = this._skinMat(p.bodyColor, 0.6);
            const vein = this._mat(p.accent, 1.0, 0.5);
            this.body = this._lvGroup(null, 0, 0, 0);
            this.heart = this._lvGroup(null, 0, 0, 0);
            this.tail = this._lvGroup(null, 0, 0, 0);
            this._legs = [];
            const Z = [0.5, 0.33, 0.16, -0.01, -0.18, -0.35, -0.52, -0.69];
            Z.forEach((z, i) => {
                if (i === 0) return;
                const parent = i === 3 ? this.heart : (i === 7 ? this.tail : this.body);
                const y = 0.2 + Math.sin(i * 1.3) * 0.015, r = i > 5 ? 0.15 - (i - 5) * 0.02 : 0.15;
                this._lvMesh(parent, lvSph(r, 8, 5), pale, [0, y, z], null, [1.3, 0.72, 1.0]);
                this.addStrut(parent, vein, new THREE.Vector3(-0.05, y + r * 0.58, z - 0.08), new THREE.Vector3(0.04, y + r * 0.58, z + 0.08), 0.006, 0.006, 3);
                for (const s of [-1, 1]) this._legs.push(this._lvLimb(this.body, s * 0.16, 0.19, z, [[s * 0.1, 0.08, 0.0], [s * 0.19, -0.19, 0.03]], 0.02, 0.013, pale));
            });
            this._lvMesh(this.heart, lvSph(0.05, 6, 4), this._mat(0xd88a9a, 1.0, 0.5, 0x401018), [0, 0.245, -0.01], null, [1.4, 0.5, 1]);
            this.head = this._lvGroup(null, 0, 0.21, 0.52);
            this._lvMesh(this.head, lvSph(0.12, 8, 5), pale, null, null, [1.3, 0.6, 1.1]);
            for (const s of [-1, 1]) { this._lvMesh(this.head, lvSph(0.025, 5, 4), this._mat(0xe8eef0, 1.0, 0.2), [s * 0.08, 0.04, 0.08]); this.addStrut(this.head, pale, new THREE.Vector3(s * 0.04, 0.04, 0.1), new THREE.Vector3(s * 0.2, 0.06, 0.34), 0.01, 0.005, 3); }
            // MAW: two hooked forcipules that gnaw at toes.
            this.maw = this._lvGroup(this.head, 0, -0.03, 0.12);
            this._jaws = [-1, 1].map(s => { const j = this._lvGroup(this.maw, s * 0.05, 0, 0); this._lvMesh(j, lvCone(0.022, 0.12, 4), this._mat(0x6a3a2a, 1.0, 0.4), [-s * 0.02, 0, 0.05], [Math.PI / 2, 0, s * 0.4]); return j; });
            // The toe tag tied round its last segment, dragging behind.
            this.addStrut(this.tail, this._mat(0xe8e0d0, 1.0, 0.9), new THREE.Vector3(0, 0.15, -0.75), new THREE.Vector3(0.05, 0.03, -0.92), 0.005, 0.005, 3);
            this._lvMesh(this.tail, lvBox(0.1, 0.008, 0.16), this._mat(0xd8c890, 1.0, 0.9), [0.06, 0.012, -0.99], [0, 0.3, 0]);
            this._lvMesh(this.tail, lvBox(0.06, 0.01, 0.012), this._mat(0x2a2a2a, 1.0, 0.8), [0.06, 0.015, -1.0], [0, 0.3, 0]);
            this._lvRig({ HEAD: this.head, HEART_SEGMENT: this.heart, BODY_SEGMENT: this.body, TAIL: this.tail, MAW: this.maw },
                ['HEART_SEGMENT'], [this.heart, this.body, this.head, this.tail], ['HEAD', 'BODY_SEGMENT', 'TAIL', 'MAW']);
        }

        // ── Pizza Ooze: a melted slice on a puddle of cheese, pepperoni eyes ─
        // Slime rig: CORE/UPPER_BODY/LOWER_BODY/PSEUDOPOD_1/PSEUDOPOD_2/MAW.
        _buildLvPizzaOoze() {
            const p = this.profile;
            const cheese = this._skinMat(p.bodyColor, 0.45);
            const crust = this._mat(0xc8883a, 1.0, 0.8);
            const pep = this._mat(p.accent, 1.0, 0.5);
            this.blob = this._lvMesh(this.bodyGroup, lvSph(0.42, 8, 5), cheese, [0, 0.15, -0.05], null, [1.15, 0.38, 1.15]);
            // UPPER_BODY: the slice itself, crust forward like a lip, tip drooping back.
            this.slice = this._lvGroup(null, 0, 0, 0);
            const L = [-0.42, 0.34, 0.32], Rr = [0.42, 0.34, 0.32], T = [0, 0.22, -0.6];
            const lo = (q) => [q[0], q[1] - 0.05, q[2]];
            this._lvTris(this.slice, cheese, [[L, Rr, T], [lo(L), lo(T), lo(Rr)], [L, T, lo(T)], [L, lo(T), lo(L)], [Rr, lo(T), T], [Rr, lo(Rr), lo(T)]]);
            this._lvMesh(this.slice, lvCyl(0.075, 0.075, 0.9, 7), crust, [0, 0.32, 0.34], [0, 0, Math.PI / 2]);
            const topY = (z) => 0.34 - 0.13 * (0.32 - z);
            [[-0.05, -0.3], [0.08, -0.45]].forEach(([x, z]) => this._lvMesh(this.slice, lvCyl(0.06, 0.06, 0.015, 8), pep, [x, topY(z) + 0.006, z], [-0.13, 0, 0]));
            for (let i = 0; i < 4; i++) this._lvMesh(this.slice, lvBox(0.06, 0.012, 0.02), this._mat(0x3a8a2a, 1.0, 0.6), [(i - 1.5) * 0.12, topY(-0.1) + 0.008, -0.1 - (i % 2) * 0.12], [-0.13, i, 0]);
            // Pepperoni for eyes, each with a black olive pupil.
            this.eyes = this._lvGroup(this.slice, 0, 0, 0);
            for (const s of [-1, 1]) { this._lvMesh(this.eyes, lvCyl(0.085, 0.085, 0.02, 8), pep, [s * 0.15, topY(0.12) + 0.07, 0.12], [1.07, 0, 0]); this._lvMesh(this.eyes, lvSph(0.032, 5, 4), this._mat(0x101010, 1.0, 0.3), [s * 0.15, topY(0.12) + 0.08, 0.135]); }
            // MAW: the crust bites, a row of teeth in the gap under it.
            this.maw = this._lvGroup(null, 0, 0.25, 0.37);
            this._lvMesh(this.maw, lvBox(0.6, 0.05, 0.03), this._mat(0x3a1008, 1.0, 0.8), [0, 0, -0.02]);
            for (let i = 0; i < 8; i++) this._lvMesh(this.maw, lvCone(0.022, 0.06, 4), this._mat(0xf4ecd8, 1.0, 0.4), [(i - 3.5) * 0.07, -0.005, 0], [Math.PI, 0, 0]);
            // CORE: one slow bubble of hot cheese.
            this.core = this._lvMesh(this.bodyGroup, lvSph(0.06, 6, 5), this._mat(0xffd860, 0.95, 0.2, 0x402800), [0.12, topY(-0.22), -0.22]);
            const glob = () => this._lvMesh(null, lvSph(0.05, 6, 4), cheese, null, null, [1, 0.8, 1]);
            this.podL = this._lvLimb(null, -0.27, 0.28, 0, [[-0.16, -0.02, 0.14], [-0.22, -0.14, 0.3]], 0.045, 0.025, cheese, glob());
            this.podR = this._lvLimb(null, 0.27, 0.28, 0, [[0.16, -0.02, 0.14], [0.22, -0.14, 0.3]], 0.045, 0.025, cheese, glob());
            this._lvRig({ CORE: this.core, UPPER_BODY: this.slice, LOWER_BODY: this.blob, PSEUDOPOD_1: this.podL, PSEUDOPOD_2: this.podR, MAW: this.maw },
                ['LOWER_BODY', 'CORE'], [this.blob, this.slice, this.core, this.maw, this.podL, this.podR], ['UPPER_BODY', 'PSEUDOPOD_1', 'PSEUDOPOD_2', 'MAW']);
        }

        // ── Hoard Lizard: coin-swollen belly, a coin in its jaws, gem studs ──
        // Reptilian rig: HEAD/TORSO/LEFT_ARM/RIGHT_ARM/LEFT_LEG/RIGHT_LEG/TAIL/MAW.
        _buildLvHoardLizard() {
            const p = this.profile;
            const scales = this._skinMat(p.bodyColor, 0.6);
            const belly = this._mat(0xc8b070, 1.0, 0.6);
            const gold = this._mat(p.accent, 1.0, 0.25, 0x2a1a00);
            this.body = this._lvGroup(null, 0, 0, 0);
            this._lvMesh(this.body, lvSph(0.26, 8, 6), scales, [0, 0.3, -0.02], null, [1.05, 0.82, 1.5]);
            this._lvMesh(this.body, lvSph(0.22, 8, 5), belly, [0, 0.22, 0.0], null, [1.15, 0.75, 1.4]);
            for (let i = 0; i < 7; i++) this._lvStud(this.body, lvCyl(0.05, 0.05, 0.012, 8), gold, [0, 0.22, 0], [0.253, 0.165, 0.308], [Math.cos(i * 0.9) * 0.8, -0.3 + (i % 3) * 0.2, Math.sin(i * 0.9)], -0.004);
            [0xc02040, 0x20a060, 0x3060d0, 0xc02040, 0x20a060].forEach((c, i) => { const z = 0.2 - i * 0.11; this._lvMesh(this.body, new THREE.OctahedronGeometry(0.035, 0), this._mat(c, 1.0, 0.2, c), [0, 0.3 + 0.213 * Math.sqrt(1 - (z + 0.02) * (z + 0.02) / 0.152), z]); });
            this.head = this._lvGroup(null, 0, 0.36, 0.42);
            this._lvMesh(this.head, lvSph(0.13, 7, 5), scales, null, null, [1.05, 0.7, 1.35]);
            for (const s of [-1, 1]) this._eye(this.head, s * 0.09, 0.05, 0.06, 0.04, 0x2a1a00).rotation.y = s * 0.8;
            this.jaw = this._lvMesh(this.head, lvSph(0.11, 6, 4), belly, [0, -0.04, 0.06], null, [1, 0.3, 1.3]);
            this.coin = this._lvMesh(this.head, lvCyl(0.06, 0.06, 0.014, 10), gold, [0, -0.02, 0.17], [0, 0, Math.PI / 2]);
            const foot = () => this._lvMesh(null, lvSph(0.05, 6, 4), scales, null, null, [1.2, 0.5, 1.4]);
            const leg = (s, z) => this._lvLimb(null, s * 0.2, 0.26, z, [[s * 0.1, -0.1, 0.02], [s * 0.13, -0.24, 0.05]], 0.055, 0.04, scales, foot());
            this.leftArm = leg(-1, 0.2); this.rightArm = leg(1, 0.2); this.leftLeg = leg(-1, -0.22); this.rightLeg = leg(1, -0.22);
            // TAIL coiled round a little stack of hoarded coins.
            const stack = new THREE.Group();
            for (let i = 0; i < 4; i++) this._lvMesh(stack, lvCyl(0.06, 0.06, 0.02, 10), gold, [-0.06, -0.05 + i * 0.021, 0.04], [0, i, 0]);
            this.tail = this._lvLimb(null, 0, 0.27, -0.36, [[0, -0.08, -0.2], [0.12, -0.18, -0.38], [0.3, -0.2, -0.36], [0.34, -0.2, -0.16]], 0.1, 0.03, scales, stack);
            this._lvRig({ HEAD: this.head, TORSO: this.body, LEFT_ARM: this.leftArm, RIGHT_ARM: this.rightArm, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg, TAIL: this.tail, MAW: this.jaw },
                ['TORSO'], [this.body, this.head, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg, this.tail], ['HEAD', 'LEFT_ARM', 'RIGHT_ARM', 'LEFT_LEG', 'RIGHT_LEG', 'TAIL', 'MAW']);
        }

        // ── Pit Rhino Beetle: glossy arena beetle, painted, a ringed horn ────
        // Insectoid rig: HEAD/THORAX/ABDOMEN/6 legs/MANDIBLES.
        _buildLvRhinoBeetle() {
            const p = this.profile;
            const chitin = this._skinMat(p.bodyColor, 0.25);
            const black = this._mat(0x120a08, 1.0, 0.3);
            const paint = this._mat(p.accent, 1.0, 0.6);
            this.abdomen = this._lvGroup(null, 0, 0, 0);
            this._lvMesh(this.abdomen, lvSph(0.2, 7, 5), black, [0, 0.27, -0.12], null, [1.05, 0.5, 1.7]);
            for (const s of [-1, 1]) {
                this._lvMesh(this.abdomen, new THREE.SphereGeometry(0.24, 7, 4, 0, Math.PI * 2, 0, Math.PI * 0.55), chitin, [s * 0.115, 0.29, -0.16], null, [0.55, 0.85, 1.35]);
                this._lvMesh(this.abdomen, lvBox(0.03, 0.012, 0.36), paint, [s * 0.115, 0.488, -0.16]);
            }
            // The fight number painted on the left wing case.
            this._lvMesh(this.abdomen, lvCyl(0.05, 0.05, 0.012, 8), paint, [-0.12, 0.47, -0.3], [0.4, 0, 0.3]);
            this._lvMesh(this.abdomen, lvBox(0.012, 0.014, 0.06), black, [-0.12, 0.478, -0.3], [0.4, 0, 0.3]);
            this.thorax = this._lvGroup(null, 0, 0, 0);
            this._lvMesh(this.thorax, lvSph(0.22, 7, 5), chitin, [0, 0.34, 0.17], null, [1.15, 0.75, 0.85]);
            this._lvMesh(this.thorax, lvCone(0.05, 0.18, 4), chitin, [0, 0.5, 0.24], [0.9, 0, 0]);
            this.head = this._lvGroup(null, 0, 0.27, 0.38);
            this._lvMesh(this.head, lvSph(0.11, 6, 5), black, null, null, [1.1, 0.8, 1]);
            const hp = [[0, 0.02, 0.06], [0, 0.14, 0.2], [0, 0.32, 0.27], [0, 0.44, 0.22]].map(q => new THREE.Vector3(q[0], q[1], q[2]));
            for (let i = 0; i < 3; i++) { this.addStrut(this.head, chitin, hp[i], hp[i + 1], 0.065 - i * 0.017, 0.048 - i * 0.017, 5); if (i) this._lvMesh(this.head, lvSph(0.05 - i * 0.012, 5, 4), chitin, [hp[i].x, hp[i].y, hp[i].z]); }
            for (const s of [-1, 1]) this._lvMesh(this.head, lvCone(0.018, 0.08, 4), chitin, [s * 0.025, 0.47, 0.2], [0, 0, -s * 0.4]);
            // A dented brass bout ring hammered onto the horn.
            const band = this._lvMesh(this.head, lvTor(0.052, 0.014, 3, 10), this._mat(0xc8a040, 1.0, 0.3), [hp[1].x, hp[1].y, hp[1].z]);
            band.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), hp[2].clone().sub(hp[0]).normalize());
            this.mandibles = this._lvGroup(this.head, 0, -0.05, 0.09);
            for (const s of [-1, 1]) this._lvMesh(this.mandibles, lvCone(0.018, 0.07, 4), black, [s * 0.035, 0, 0.02], [Math.PI / 2, 0, -s * 0.4]);
            const map = { HEAD: this.head, THORAX: this.thorax, ABDOMEN: this.abdomen, MANDIBLES: this.mandibles };
            this._legs = [];
            [['LEFT_LEG', 'RIGHT_LEG', 0.28, 0.26], ['MIDDLE_LEFT_LEG', 'MIDDLE_RIGHT_LEG', 0.27, 0.08], ['REAR_LEFT_LEG', 'REAR_RIGHT_LEG', 0.26, -0.18]].forEach(([kl, kr, y, z], i) => {
                const dz = (1 - i) * 0.08;
                [-1, 1].forEach(s => { const l = this._lvLimb(null, s * 0.15, y, z, [[s * 0.15, 0.06, dz], [s * 0.28, -y + 0.01, dz * 2]], 0.03, 0.018, black); this._lvMesh(l, lvCone(0.012, 0.05, 3), black, [s * 0.21, -0.1, dz * 1.5], [0, 0, s * 1.2]); this._legs.push(l); map[s < 0 ? kl : kr] = l; });
            });
            this._lvRig(map, ['THORAX'], [this.thorax, this.head, this.abdomen, ...this._legs], ['HEAD', 'ABDOMEN', 'MANDIBLES', 'LEFT_LEG', 'RIGHT_LEG', 'MIDDLE_LEFT_LEG', 'MIDDLE_RIGHT_LEG', 'REAR_LEFT_LEG', 'REAR_RIGHT_LEG']);
        }

        // ── Hoard Wyrmling: a puffed whelp sitting on buttons and bottle caps ─
        // Dragon rig: HEAD/FIRE_BREATH_ORGAN/NECK/BODY/wings/legs/TAIL/claws/MAW.
        _buildLvWyrmling() {
            const p = this.profile;
            const scales = this._skinMat(p.bodyColor, 0.6);
            const belly = this._mat(0xd8a060, 1.0, 0.6);
            const wingM = this._mat(0x6a2a1a, 0.92, 0.6);
            // The hoard: a heap of buttons and crimped bottle caps.
            this.hoard = this._lvGroup(null, 0, 0, 0);
            this._lvMesh(this.hoard, lvCone(0.55, 0.3, 8), this._mat(0x4a3a2a, 1.0, 0.9), [0, 0.15, 0]);
            const cols = [0xd83a3a, 0x3a7ad8, 0xe8c040, 0x40b060, 0xf0f0f0, 0x8a3ad8];
            for (let i = 0; i < 18; i++) {
                const a = i * 2.39, r = 0.16 + (i % 6) * 0.065, cap = i % 3 === 0;
                const n = new THREE.Vector3(Math.cos(a) * 0.3, 0.55, Math.sin(a) * 0.3).normalize();
                const m = this._lvMesh(this.hoard, cap ? lvCyl(0.05, 0.05, 0.025, 10) : lvCyl(0.04, 0.04, 0.014, 8), this._mat(cols[i % cols.length], 1.0, cap ? 0.3 : 0.5), [Math.cos(a) * r, 0.3 * (1 - r / 0.55) + 0.006, Math.sin(a) * r]);
                m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
            }
            this.body = this._lvGroup(null, 0, 0, 0);
            this._lvMesh(this.body, lvSph(0.26, 8, 6), scales, [0, 0.52, 0], null, [1, 1.2, 0.95]);
            this._lvMesh(this.body, lvSph(0.2, 7, 5), belly, [0, 0.46, 0.07], null, [1, 1.2, 0.8]);
            // FIRE_BREATH_ORGAN: a throat sac puffed out with pride and smoke.
            this.sac = this._lvMesh(this.bodyGroup, lvSph(0.15, 7, 5), this._mat(0xff8a30, 0.8, 0.2, 0xa03a00), [0, 0.66, 0.17], null, [1, 1.1, 0.9]);
            this.neck = this._lvGroup(null, 0, 0, 0);
            this.addStrut(this.neck, scales, new THREE.Vector3(0, 0.76, 0.03), new THREE.Vector3(0, 0.94, 0.1), 0.09, 0.08, 6);
            this.head = this._lvGroup(null, 0, 1.0, 0.14);
            this._lvMesh(this.head, lvSph(0.15, 7, 5), scales, null, null, [0.95, 0.85, 1.15]);
            this._lvMesh(this.head, lvBox(0.14, 0.1, 0.18), scales, [0, -0.03, 0.17]);
            for (const s of [-1, 1]) {
                this._lvMesh(this.head, lvCone(0.035, 0.14, 4), belly, [s * 0.08, 0.12, -0.08], [-0.9, 0, -s * 0.3]);
                this._eye(this.head, s * 0.08, 0.05, 0.1, 0.04, p.accent);
                this._lvMesh(this.head, lvSph(0.03, 5, 4), this._mat(0x8a8a8a, 0.7, 0.9), [s * 0.03, 0.04, 0.25]);
                this._lvMesh(this.head, lvSph(0.04, 5, 4), this._mat(0x9a9a9a, 0.55, 0.9), [s * 0.04, 0.09, 0.27]);
            }
            this.jaw = this._lvGroup(this.head, 0, -0.07, 0.08);
            this._lvMesh(this.jaw, lvBox(0.12, 0.04, 0.16), belly, [0, -0.01, 0.08]);
            this.leftWing = this.buildDragonWing(wingM, 1, -0.14, 0.7, -0.1, { span: 0.5, fingers: 3 }); this.leftWing.rotation.y = -0.6;
            this.rightWing = this.buildDragonWing(wingM, -1, 0.14, 0.7, -0.1, { span: 0.5, fingers: 3 }); this.rightWing.rotation.y = 0.6;
            const foot = () => { const g = new THREE.Group(); this._lvMesh(g, lvBox(0.1, 0.05, 0.14), scales, [0, 0, 0.04]); for (let i = -1; i <= 1; i++) this._lvMesh(g, lvCone(0.014, 0.05, 3), belly, [i * 0.03, -0.01, 0.12], [Math.PI / 2, 0, 0]); return g; };
            this.leftLeg = this._lvLimb(null, -0.16, 0.3, 0.02, [[-0.04, -0.04, 0.14], [-0.05, -0.15, 0.22]], 0.08, 0.06, scales, foot());
            this.rightLeg = this._lvLimb(null, 0.16, 0.3, 0.02, [[0.04, -0.04, 0.14], [0.05, -0.15, 0.22]], 0.08, 0.06, scales, foot());
            const hand = () => this._lvMesh(null, lvSph(0.04, 5, 4), scales);
            this.leftClaw = this._lvLimb(null, -0.17, 0.6, 0.12, [[-0.04, -0.08, 0.1], [0.0, -0.1, 0.18]], 0.045, 0.035, scales, hand());
            this.rightClaw = this._lvLimb(null, 0.17, 0.6, 0.12, [[0.04, -0.08, 0.1], [0.0, -0.1, 0.18]], 0.045, 0.035, scales, hand());
            this._lvMesh(this.rightClaw, lvCyl(0.05, 0.05, 0.025, 10), this._mat(0xd83a3a, 1.0, 0.3), [0.0, -0.1, 0.23], [Math.PI / 2, 0, 0]);
            const spade = this._lvMesh(null, lvCone(0.06, 0.12, 3), scales, [0, 0, 0.04], [Math.PI / 2, 0, 0], [1, 1, 0.3]);
            this.tail = this._lvLimb(null, 0, 0.32, -0.2, [[0.08, -0.1, -0.18], [0.26, -0.18, -0.24], [0.42, -0.22, -0.08], [0.46, -0.24, 0.12]], 0.09, 0.025, scales, spade);
            this._lvRig({ HEAD: this.head, FIRE_BREATH_ORGAN: this.sac, NECK: this.neck, BODY: this.body, LEFT_WING: this.leftWing, RIGHT_WING: this.rightWing, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg,
                TAIL: this.tail, LEFT_CLAW: this.leftClaw, RIGHT_CLAW: this.rightClaw, MAW: this.jaw },
                ['BODY'], [this.body, this.sac, this.neck, this.head, this.leftWing, this.rightWing, this.leftLeg, this.rightLeg, this.tail, this.leftClaw, this.rightClaw],
                ['HEAD', 'FIRE_BREATH_ORGAN', 'LEFT_WING', 'RIGHT_WING', 'LEFT_LEG', 'RIGHT_LEG', 'TAIL', 'LEFT_CLAW', 'RIGHT_CLAW', 'MAW']);
            this._cascadeRules.push({ gone: ['NECK'], hide: [this.neck, this.head] });
        }

        // ── Fishnet Crab: flat and long-legged, draped in net, hooked ────────
        // Crustacean rig: CLAW_LEFT/CLAW_RIGHT/CARAPACE/ABDOMEN/FRONT_LEG/REAR_LEG/ANTENNAE/MANDIBLES.
        _buildLvFishnetCrab() {
            const p = this.profile;
            const shellM = this._skinMat(p.bodyColor, 0.55);
            const under = this._mat(0xb8a080, 1.0, 0.6);
            const netM = this._mat(0x8a7a5a, 1.0, 0.9);
            const steel = this._mat(0xc0c4cc, 1.0, 0.2);
            const C = [0, 0.34, 0], R = [0.525, 0.134, 0.357];
            this.carapace = this._lvGroup(null, 0, 0, 0);
            this._lvMesh(this.carapace, lvSph(0.42, 9, 4), shellM, C, null, [1.25, 0.32, 0.85]);
            for (let i = 0; i < 6; i++) { const a = Math.PI * (0.2 + i * 0.12); this._lvStud(this.carapace, lvCone(0.022, 0.08, 4), shellM, C, R, [Math.cos(a), 0, Math.sin(a)], 0.02); }
            // The net: a lattice draped over the shell and trailing behind it.
            this.net = this._lvGroup(this.carapace, 0, 0, 0);
            const surf = (x, z) => { const k = 1 - (x / R[0]) * (x / R[0]) - (z / R[2]) * (z / R[2]); return new THREE.Vector3(x, C[1] + R[1] * Math.sqrt(Math.max(0, k)) + 0.006, z); };
            const xs = [-0.3, -0.1, 0.1, 0.3], zs = [-0.22, -0.08, 0.06, 0.2];
            zs.forEach(z => { const w = R[0] * Math.sqrt(1 - (z / R[2]) * (z / R[2])) * 0.92; for (let i = 0; i < 5; i++) this.addStrut(this.net, netM, surf(-w + i * w / 2.5, z), surf(-w + (i + 1) * w / 2.5, z), 0.009, 0.009, 3); });
            xs.forEach(x => { const d = R[2] * Math.sqrt(1 - (x / R[0]) * (x / R[0])) * 0.95; const pts = [surf(x, d), surf(x, d * 0.4), surf(x, -d * 0.4), surf(x, -d)]; for (let i = 0; i < 3; i++) this.addStrut(this.net, netM, pts[i], pts[i + 1], 0.009, 0.009, 3);
                this.addStrut(this.net, netM, pts[3], new THREE.Vector3(x * 1.25, 0.015, -0.6), 0.009, 0.009, 3); this.addStrut(this.net, netM, new THREE.Vector3(x * 1.25, 0.015, -0.6), new THREE.Vector3(x * 1.4, 0.015, -0.8), 0.009, 0.009, 3); });
            for (const z of [-0.6, -0.8]) this.addStrut(this.net, netM, new THREE.Vector3(xs[0] * (z < -0.7 ? 1.4 : 1.25), 0.015, z), new THREE.Vector3(xs[3] * (z < -0.7 ? 1.4 : 1.25), 0.015, z), 0.009, 0.009, 3);
            this._lvMesh(this.net, lvSph(0.06, 6, 4), this._mat(p.accent, 1.0, 0.7), [0.42, 0.06, -0.8], null, [1, 1, 1.6]);
            // A fishhook stuck fast in the shell, its line trailing to the ground.
            this._lvMesh(this.carapace, lvTor(0.05, 0.01, 3, 10, Math.PI * 1.3), steel, [0.2, 0.47, 0.05], [0, 0.4, 0.5]);
            this.addStrut(this.carapace, this._mat(0xe0e0d0, 1.0, 0.5), new THREE.Vector3(0.22, 0.5, 0.05), new THREE.Vector3(0.45, 0.01, 0.32), 0.004, 0.004, 3);
            this.abdomen = this._lvMesh(this.bodyGroup, lvSph(0.2, 7, 4), under, [0, 0.27, -0.12], null, [1, 0.4, 1]);
            this.antennae = this._lvGroup(null, 0, 0.4, 0.3);
            for (const s of [-1, 1]) { this._lvLimb(this.antennae, s * 0.07, 0, 0, [[s * 0.02, 0.12, 0.03]], 0.018, 0.015, shellM, this._lvMesh(null, lvSph(0.035, 6, 4), this._mat(0x0a0a0a, 1.0, 0.3))); this.addStrut(this.antennae, shellM, new THREE.Vector3(s * 0.03, 0, 0.03), new THREE.Vector3(s * 0.25, 0.08, 0.35), 0.007, 0.004, 3); }
            this.mandibles = this._lvGroup(null, 0, 0.3, 0.33);
            for (const s of [-1, 1]) this._lvMesh(this.mandibles, lvBox(0.04, 0.05, 0.04), under, [s * 0.025, 0, 0], [0, 0, s * 0.3]);
            // Scissor claws: two long crossed blades on a rivet.
            const claw = (s) => {
                const hand = new THREE.Group();
                this._lvMesh(hand, lvSph(0.045, 5, 4), shellM);
                this._lvMesh(hand, lvBox(0.03, 0.02, 0.3), under, [0, 0, 0.15], [0, s * 0.15, 0]);
                hand._b = this._lvGroup(hand, 0, 0.02, 0);
                this._lvMesh(hand._b, lvBox(0.03, 0.02, 0.3), under, [0, 0, 0.15], [0, -s * 0.15, 0]);
                const g = this._lvLimb(null, s * 0.45, 0.34, 0.12, [[s * 0.12, 0.06, 0.12], [s * 0.12, 0.1, 0.28]], 0.04, 0.035, shellM, hand);
                g._hand = hand; return g;
            };
            this.leftClaw = claw(-1); this.rightClaw = claw(1);
            const ext = (z) => R[0] * Math.sqrt(Math.max(0, 1 - (z / R[2]) * (z / R[2])));
            this.frontLegs = this._lvGroup(null, 0, 0, 0); this.rearLegs = this._lvGroup(null, 0, 0, 0); this._legs = [];
            [0.1, -0.04, -0.16, -0.26].forEach((z, i) => {
                const dz = (1.5 - i) * 0.07;
                for (const s of [-1, 1]) this._legs.push(this._lvLimb(i < 2 ? this.frontLegs : this.rearLegs, s * (ext(z) - 0.04), 0.33, z, [[s * 0.24, 0.1, dz], [s * 0.46, -0.32, dz * 1.4]], 0.028, 0.014, shellM));
            });
            this._lvRig({ CLAW_LEFT: this.leftClaw, CLAW_RIGHT: this.rightClaw, CARAPACE: this.carapace, ABDOMEN: this.abdomen, FRONT_LEG: this.frontLegs, REAR_LEG: this.rearLegs, ANTENNAE: this.antennae, MANDIBLES: this.mandibles },
                ['CARAPACE'], [this.carapace, this.abdomen, this.leftClaw, this.rightClaw, this.frontLegs, this.rearLegs, this.antennae, this.mandibles], ['CLAW_LEFT', 'CLAW_RIGHT', 'ABDOMEN', 'FRONT_LEG', 'REAR_LEG', 'ANTENNAE', 'MANDIBLES']);
        }

        // ── Sewer Gator Hatchling: albino baby, red eyes, eggshell cap ───────
        // Reptilian rig: HEAD/TORSO/LEFT_ARM/RIGHT_ARM/LEFT_LEG/RIGHT_LEG/TAIL/MAW.
        _buildLvGatorHatchling() {
            const p = this.profile;
            const hide = this._skinMat(p.bodyColor, 0.6);
            const belly = this._mat(0xf4ece0, 1.0, 0.6);
            const shellM = this._mat(0xf0e8d0, 1.0, 0.5);
            const tooth = this._mat(0xffffff, 1.0, 0.3);
            this.body = this._lvGroup(null, 0, 0, 0);
            this._lvMesh(this.body, new THREE.CapsuleGeometry(0.16, 0.5, 3, 8), hide, [0, 0.2, -0.05], [Math.PI / 2, 0, 0], [1.15, 1, 0.75]);
            for (const s of [-1, 1]) for (let i = 0; i < 5; i++) this._lvMesh(this.body, lvBox(0.04, 0.03, 0.05), hide, [s * 0.06, 0.315, -0.3 + i * 0.12]);
            this.head = this._lvGroup(null, 0, 0.25, 0.42);
            this._lvMesh(this.head, lvSph(0.16, 8, 6), hide, null, null, [1.05, 0.85, 1]);
            this._lvMesh(this.head, lvBox(0.17, 0.07, 0.26), hide, [0, -0.02, 0.2]);
            for (const s of [-1, 1]) {
                this._eye(this.head, s * 0.09, 0.08, 0.06, 0.065, p.accent).rotation.y = s * 0.6;
                this._lvMesh(this.head, lvSph(0.02, 4, 3), hide, [s * 0.035, 0.02, 0.32]);
                for (let i = 0; i < 4; i++) this._lvMesh(this.head, lvCone(0.01, 0.035, 3), tooth, [s * 0.075, -0.065, 0.12 + i * 0.06], [Math.PI, 0, 0]);
            }
            // The eggshell it hatched from, still worn as a cap.
            const cap = this._lvGroup(this.head, 0.02, 0.11, -0.03);
            cap.rotation.z = 0.25;
            this._lvMesh(cap, new THREE.SphereGeometry(0.12, 7, 3, 0, Math.PI * 2, 0, Math.PI * 0.45), shellM);
            for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; this._lvMesh(cap, lvCone(0.022, 0.05, 3), shellM, [Math.cos(a) * 0.115, 0.02, Math.sin(a) * 0.115], [0, -a, 0]); }
            this.jaw = this._lvGroup(this.head, 0, -0.06, 0.06);
            this._lvMesh(this.jaw, lvBox(0.15, 0.045, 0.26), belly, [0, -0.02, 0.13]);
            for (const s of [-1, 1]) for (let i = 0; i < 3; i++) this._lvMesh(this.jaw, lvCone(0.01, 0.035, 3), tooth, [s * 0.065, 0.015, 0.1 + i * 0.07]);
            const foot = () => { const g = new THREE.Group(); this._lvMesh(g, lvBox(0.1, 0.02, 0.1), hide); for (let i = -1; i <= 1; i++) this._lvMesh(g, lvCone(0.012, 0.05, 3), hide, [i * 0.035, 0, 0.07], [Math.PI / 2, 0, 0]); return g; };
            const leg = (s, z, dz) => this._lvLimb(null, s * 0.15, 0.18, z, [[s * 0.12, 0.0, dz], [s * 0.17, -0.15, dz * 1.6]], 0.045, 0.035, hide, foot());
            this.leftArm = leg(-1, 0.22, 0.04); this.rightArm = leg(1, 0.22, 0.04); this.leftLeg = leg(-1, -0.3, -0.04); this.rightLeg = leg(1, -0.3, -0.04);
            const tp = [[0, -0.02, -0.22], [0.04, -0.06, -0.45], [0.1, -0.1, -0.66]];
            this.tail = this._lvLimb(null, 0, 0.2, -0.45, tp, 0.11, 0.03, hide);
            for (let i = 0; i < 6; i++) { const k = i / 6, a = new THREE.Vector3(); const j = Math.min(2, Math.floor(k * 3)), f = k * 3 - j; const A = j ? tp[j - 1] : [0, 0, 0], B = tp[j]; a.set(A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f); const r = 0.11 - 0.08 * k; for (const s of [-1, 1]) this._lvMesh(this.tail, lvCone(0.018, 0.05, 3), hide, [a.x + s * r * 0.4, a.y + r * 0.85, a.z]); }
            this._lvRig({ HEAD: this.head, TORSO: this.body, LEFT_ARM: this.leftArm, RIGHT_ARM: this.rightArm, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg, TAIL: this.tail, MAW: this.jaw },
                ['TORSO'], [this.body, this.head, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg, this.tail], ['HEAD', 'LEFT_ARM', 'RIGHT_ARM', 'LEFT_LEG', 'RIGHT_LEG', 'TAIL', 'MAW']);
        }

        // ── Shadow Puddle: an ink pool with one eye, hands and tripping tendrils
        // DarkElemental rig: CORE/BODY/LEFT_ARM/RIGHT_ARM/LEFT_LEG/RIGHT_LEG/MAW.
        _buildLvShadowPuddle() {
            const p = this.profile;
            const ink = this._mat(p.bodyColor, 0.92, 0.08, 0x0a0614);
            const inkSoft = this._mat(0x30244a, 0.8, 0.1, 0x0a0614);
            this.body = this._lvGroup(null, 0, 0, 0);
            this._lvMesh(this.body, lvCyl(0.62, 0.66, 0.04, 9), ink, [0, 0.02, 0]);
            for (let i = 0; i < 7; i++) { const a = i * 0.9 + 0.3; this._lvMesh(this.body, lvSph(0.13, 6, 4), ink, [Math.cos(a) * 0.6, 0.02, Math.sin(a) * 0.6], null, [1, 0.22, 1]); }
            this.ripples = [0.3, 0.48].map(r => this._lvMesh(this.body, lvTor(r, 0.012, 3, 16), inkSoft, [0, 0.042, 0], [Math.PI / 2, 0, 0]));
            // CORE: one eye floating at the surface, looking up at you.
            this.core = this._lvGroup(null, 0, 0.05, 0.1);
            this._lvMesh(this.core, lvSph(0.13, 8, 6), this._mat(0xf0ead8, 1.0, 0.2), null, null, [1, 0.75, 1]);
            this.iris = this._lvMesh(this.core, lvSph(0.06, 6, 5), this._mat(p.accent, 1.0, 0.2, p.accent), [0, 0.04, 0.09]);
            this._lvMesh(this.core, lvBox(0.015, 0.07, 0.02), this._mat(0x050505, 1.0, 0.3), [0, 0.045, 0.145]);
            // MAW: a split in the surface lined with little teeth.
            this.maw = this._lvGroup(null, 0, 0.045, 0.4);
            this._lvMesh(this.maw, lvBox(0.3, 0.02, 0.07), this._mat(0x3a0010, 1.0, 0.6));
            for (let i = 0; i < 6; i++) this._lvMesh(this.maw, lvCone(0.014, 0.04, 3), this._mat(0xe8e0d0, 1.0, 0.4), [(i - 2.5) * 0.05, 0.02, (i % 2 ? 0.025 : -0.025)]);
            const hand = () => { const g = new THREE.Group(); this._lvMesh(g, lvSph(0.05, 6, 4), ink); for (let i = -1; i <= 1; i++) this._lvMesh(g, lvCone(0.015, 0.14, 4), ink, [i * 0.035, -0.03, 0.07], [Math.PI * 0.6, i * 0.3, 0]); return g; };
            this.leftArm = this._lvLimb(null, -0.3, 0.03, 0.05, [[-0.03, 0.28, 0.04], [0.03, 0.52, 0.14], [0.0, 0.6, 0.28]], 0.075, 0.035, ink, hand());
            this.rightArm = this._lvLimb(null, 0.3, 0.03, 0.05, [[0.03, 0.28, 0.04], [-0.03, 0.52, 0.14], [0.0, 0.6, 0.28]], 0.075, 0.035, ink, hand());
            this.leftLeg = this._lvLimb(null, -0.22, 0.03, 0.5, [[-0.08, 0.0, 0.2], [0.0, 0.0, 0.4], [-0.1, 0.01, 0.56]], 0.04, 0.014, ink);
            this.rightLeg = this._lvLimb(null, 0.22, 0.03, 0.5, [[0.08, 0.0, 0.2], [0.0, 0.0, 0.4], [0.1, 0.01, 0.56]], 0.04, 0.014, ink);
            this._lvRig({ CORE: this.core, BODY: this.body, LEFT_ARM: this.leftArm, RIGHT_ARM: this.rightArm, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg, MAW: this.maw },
                ['BODY'], [this.body, this.core, this.maw, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg], ['CORE', 'LEFT_ARM', 'RIGHT_ARM', 'LEFT_LEG', 'RIGHT_LEG', 'MAW']);
        }

        // ── Wishing Totem: carved faces, a coin-slot mouth, knotted ribbons ──
        // Totem rig: CORE/LEFT_ARM/RIGHT_ARM/EYES/BASE/MOUTH.
        _buildLvWishingTotem() {
            const p = this.profile;
            const wood = this._skinMat(p.bodyColor, 0.85);
            const darkW = this._mat(0x4a2a14, 1.0, 0.9);
            const brass = this._mat(0xc8a040, 1.0, 0.3);
            const ribbonCols = [0xd83a3a, 0xe8c040, 0x3a7ad8, 0x40b060];
            this.base = this._lvGroup(null, 0, 0, 0);
            this._lvMesh(this.base, lvCyl(0.3, 0.36, 0.18, 6), this._mat(0x8a8680, 1.0, 0.95), [0, 0.09, 0]);
            for (let i = 0; i < 4; i++) this._lvMesh(this.base, lvCyl(0.03, 0.03, 0.01, 8), brass, [Math.cos(i * 1.7 + 0.4) * 0.24, 0.185, Math.sin(i * 1.7 + 0.4) * 0.24]);
            this.core = this._lvGroup(null, 0, 0, 0);
            this._lvMesh(this.core, lvBox(0.34, 0.34, 0.3), wood, [0, 0.35, 0]);
            // The grumpy lower face: angry brows, a wedge nose, a frown.
            for (const s of [-1, 1]) this._lvMesh(this.core, lvBox(0.12, 0.035, 0.04), darkW, [s * 0.07, 0.44, 0.16], [0, 0, s * 0.35]);
            this._lvMesh(this.core, lvBox(0.06, 0.1, 0.05), wood, [0, 0.37, 0.17]);
            this._lvMesh(this.core, lvTor(0.07, 0.018, 3, 8, Math.PI), darkW, [0, 0.25, 0.155]);
            this._lvMesh(this.core, lvBox(0.3, 0.3, 0.28), wood, [0, 0.67, 0]);
            this._lvMesh(this.core, new THREE.SphereGeometry(0.17, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), wood, [0, 0.82, 0]);
            // A wishbone crowns it.
            const V = (x, y, z) => new THREE.Vector3(x, y, z);
            this._lvMesh(this.core, lvSph(0.04, 6, 4), darkW, [0, 0.98, 0]);
            for (const s of [-1, 1]) { this.addStrut(this.core, darkW, V(0, 0.98, 0), V(s * 0.1, 1.12, 0), 0.025, 0.022, 5); this.addStrut(this.core, darkW, V(s * 0.1, 1.12, 0), V(s * 0.07, 1.26, 0), 0.022, 0.018, 5); this._lvMesh(this.core, lvSph(0.023, 5, 4), darkW, [s * 0.1, 1.12, 0]); }
            // EYES: inlaid shell, the irises lit; MOUTH: a brass-framed coin slot.
            this.eyes = this._lvGroup(null, 0, 0.71, 0.14);
            for (const s of [-1, 1]) { this._lvMesh(this.eyes, lvCyl(0.05, 0.05, 0.02, 8), this._mat(0xf4f0e0, 1.0, 0.3), [s * 0.07, 0, 0.005], [Math.PI / 2, 0, 0]); this._lvMesh(this.eyes, lvSph(0.025, 5, 4), this._mat(p.accent, 1.0, 0.2, p.accent), [s * 0.07, 0, 0.02]); }
            this.mouth = this._lvGroup(null, 0, 0.6, 0.145);
            this._lvMesh(this.mouth, lvBox(0.14, 0.05, 0.02), brass);
            this._lvMesh(this.mouth, lvBox(0.1, 0.015, 0.025), this._mat(0x050505, 1.0, 0.5));
            // Ribbons knotted to the arms and the wishbone, each on its own knot.
            this.ribbons = [];
            const ribbon = (parent, x, y, z, i) => { const g = this._lvGroup(parent, x, y, z); this._lvMesh(g, lvBox(0.035, 0.28, 0.006), this._mat(ribbonCols[i % 4], 1.0, 0.8), [0, -0.14, 0]); this._lvMesh(g, lvSph(0.02, 4, 3), this._mat(ribbonCols[i % 4], 1.0, 0.8)); this.ribbons.push(g); return g; };
            const paddle = (i) => { const m = this._lvMesh(null, lvBox(0.08, 0.18, 0.04), wood, [0, 0.04, 0]); ribbon(m, 0, -0.08, 0.025, i); return m; };
            this.leftArm = this._lvLimb(null, -0.14, 0.7, 0, [[-0.16, 0.04, 0.0], [-0.28, 0.14, 0.02]], 0.04, 0.035, wood, paddle(0));
            this.rightArm = this._lvLimb(null, 0.14, 0.7, 0, [[0.16, 0.04, 0.0], [0.28, 0.14, 0.02]], 0.04, 0.035, wood, paddle(1));
            ribbon(this.core, -0.1, 1.12, 0.02, 2); ribbon(this.core, 0.1, 1.12, 0.02, 3);
            this._lvRig({ CORE: this.core, LEFT_ARM: this.leftArm, RIGHT_ARM: this.rightArm, EYES: this.eyes, BASE: this.base, MOUTH: this.mouth },
                ['CORE'], [this.core, this.eyes, this.mouth, this.leftArm, this.rightArm], ['LEFT_ARM', 'RIGHT_ARM', 'EYES', 'BASE', 'MOUTH']);
        }

        // ── Centaur Foal: gangly knob-kneed foal, dappled, a stone to throw ──
        // Centaur rig: HEAD/TORSO/LEFT_ARM/RIGHT_ARM/BODY/LEFT_LEG/RIGHT_LEG/REAR_LEFT_LEG/REAR_RIGHT_LEG/MOUTH.
        _buildLvCentaurFoal() {
            const p = this.profile;
            const coat = this._skinMat(p.bodyColor, 0.8);
            const spot = this._mat(p.accent, 1.0, 0.9);
            const skin = this._mat(0xd8a880, 1.0, 0.6);
            const hair = this._mat(0x3a2414, 1.0, 0.9);
            const vest = this._mat(0x4a6a3a, 1.0, 0.8);
            const hoofM = this._mat(0x2a1e14, 1.0, 0.5);
            // BODY: a short barrel running nose to tail, dappled on the rump.
            this.body = this._lvGroup(null, 0, 0, 0);
            this._lvMesh(this.body, new THREE.CapsuleGeometry(0.22, 0.42, 3, 8), coat, [0, 0.95, -0.08], [Math.PI / 2, 0, 0]);
            this._lvMesh(this.body, lvSph(0.23, 8, 6), coat, [0, 1.0, 0.3], null, [0.95, 1, 0.85]);
            for (let i = 0; i < 7; i++) this._lvStud(this.body, lvSph(0.045, 5, 4), spot, [0, 0.95, -0.08], [0.22, 0.22, 0.43], [(i % 2 ? 1 : -1) * (0.5 + this.idRand() * 0.5), 0.3 + this.idRand() * 0.6, -0.2 - this.idRand() * 0.8], -0.012).scale.set(1, 0.35, 1);
            // TORSO: a child's torso in a little vest, rising from the withers.
            this.torso = this._lvGroup(null, 0, 1.34, 0.3);
            this._lvMesh(this.torso, lvCyl(0.13, 0.15, 0.3, 8), vest);
            this._lvMesh(this.torso, lvSph(0.15, 7, 5), vest, [0, 0.12, 0], null, [1.1, 0.8, 0.8]);
            this._lvMesh(this.torso, lvCyl(0.05, 0.05, 0.12, 6), skin, [0, 0.2, 0]);
            // HEAD: big for its body, messy hair, pointed ears, freckles.
            this.head = this._lvGroup(null, 0, 1.7, 0.33);
            this._lvMesh(this.head, lvSph(0.16, 8, 6), skin);
            for (let i = 0; i < 8; i++) { const a = i * 0.8; this._lvStud(this.head, lvCone(0.05, 0.13, 4), hair, [0, 0, 0], [0.16, 0.16, 0.16], [Math.cos(a) * 0.6, 0.9, Math.sin(a) * 0.6 - 0.35], 0.02); }
            for (const s of [-1, 1]) {
                this._lvMesh(this.head, lvCone(0.035, 0.12, 4), skin, [s * 0.16, 0.03, -0.02], [0, 0, -s * 1.3]);
                this._eye(this.head, s * 0.06, 0.02, 0.135, 0.035, 0x3a2a1a);
                for (let i = 0; i < 3; i++) this._lvMesh(this.head, lvSph(0.008, 4, 3), this._mat(0xa0583a, 1.0, 0.8), [s * (0.07 + i * 0.015), -0.035 - (i % 2) * 0.01, 0.138]);
            }
            this.mouth = this._lvMesh(this.head, lvBox(0.06, 0.014, 0.012), this._mat(0x5a1a10, 1.0, 0.7), [0, -0.075, 0.148]);
            // Arms: thin; the right hand clutches a stone it means to throw.
            const handM = () => this._lvMesh(null, lvSph(0.04, 5, 4), skin);
            this.leftArm = this._lvLimb(null, -0.17, 1.44, 0.3, [[-0.05, -0.18, 0.06], [-0.03, -0.34, 0.16]], 0.04, 0.035, skin, handM());
            this.rightArm = this._lvLimb(null, 0.17, 1.44, 0.3, [[0.05, -0.18, 0.06], [0.03, -0.34, 0.16]], 0.04, 0.035, skin, handM());
            this.stone = this._lvMesh(this.rightArm, new THREE.DodecahedronGeometry(0.05, 0), this._mat(0x8a8680, 1.0, 0.9), [0.03, -0.36, 0.21]);
            // Gangly legs with oversized knobbly knees and small dark hooves.
            const hoof = () => this._lvMesh(null, lvCyl(0.045, 0.055, 0.07, 6), hoofM);
            const leg = (s, z, pts) => { const g = this._lvLimb(null, s * 0.12, 0.92, z, pts, 0.045, 0.03, coat, hoof()); this._lvMesh(g, lvSph(0.065, 6, 4), coat, pts[pts.length - 2]); return g; };
            this.leftLeg = leg(-1, 0.3, [[0, -0.42, 0.03], [0, -0.87, 0.0]]);
            this.rightLeg = leg(1, 0.3, [[0, -0.42, 0.03], [0, -0.87, 0.0]]);
            this.rearLeftLeg = leg(-1, -0.36, [[0, -0.3, -0.08], [0, -0.6, 0.02], [0, -0.87, 0.0]]);
            this.rearRightLeg = leg(1, -0.36, [[0, -0.3, -0.08], [0, -0.6, 0.02], [0, -0.87, 0.0]]);
            // A braided tail finished with a bead.
            this.tail = this._lvGroup(null, 0, 1.02, -0.5);
            for (let i = 0; i < 8; i++) this._lvMesh(this.tail, lvSph(0.045 - i * 0.0018, 5, 4), hair, [0, -i * 0.05, -i * 0.02]);
            this._lvMesh(this.tail, lvSph(0.035, 6, 4), this._mat(0x3a8ad8, 1.0, 0.3), [0, -0.39, -0.16]);
            this._lvRig({ HEAD: this.head, TORSO: this.torso, LEFT_ARM: this.leftArm, RIGHT_ARM: this.rightArm, BODY: this.body, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg,
                REAR_LEFT_LEG: this.rearLeftLeg, REAR_RIGHT_LEG: this.rearRightLeg, MOUTH: this.mouth, TAIL: this.tail },
                ['BODY'], [this.body, this.torso, this.head, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg, this.rearLeftLeg, this.rearRightLeg, this.tail],
                ['HEAD', 'LEFT_ARM', 'RIGHT_ARM', 'LEFT_LEG', 'RIGHT_LEG', 'REAR_LEFT_LEG', 'REAR_RIGHT_LEG', 'MOUTH', 'TAIL']);
            this._cascadeRules.push({ gone: ['TORSO'], hide: [this.torso, this.head, this.leftArm, this.rightArm] });
        }

        // ── Ruin Gecko: flat stone gecko, glyph-carved, a ruin shard fused on ─
        // Reptilian rig: HEAD/TORSO/LEFT_ARM/RIGHT_ARM/LEFT_LEG/RIGHT_LEG/TAIL/MAW.
        _buildLvRuinGecko() {
            const p = this.profile;
            const stone = this._skinMat(p.bodyColor, 0.95);
            const glyph = this._mat(0x2a2a30, 1.0, 0.9);
            const lichen = this._mat(0x7a9a4a, 1.0, 0.95);
            const C = [0, 0.16, 0], R = [0.26, 0.09, 0.4];
            this.body = this._lvGroup(null, 0, 0, 0);
            this._lvMesh(this.body, lvSph(0.2, 8, 5), stone, C, null, [1.3, 0.45, 2.0]);
            const topY = (x, z) => C[1] + R[1] * Math.sqrt(Math.max(0, 1 - (x / R[0]) * (x / R[0]) - (z / R[2]) * (z / R[2])));
            [[-0.08, 0.12, 0.6], [0.08, 0.12, -0.6], [0, -0.05, 0], [-0.1, -0.22, 0.9], [0.1, -0.22, -0.9]].forEach(([x, z, r]) => this._lvMesh(this.body, lvBox(0.014, 0.008, 0.1), glyph, [x, topY(x, z) - 0.001, z], [0, r, 0]));
            [[0.0, 0.18], [0.06, -0.14]].forEach(([x, z]) => this._lvMesh(this.body, lvTor(0.028, 0.006, 3, 8), glyph, [x, topY(x, z), z], [Math.PI / 2, 0, 0]));
            for (let i = 0; i < 3; i++) this._lvStud(this.body, lvSph(0.05, 5, 4), lichen, C, R, [Math.cos(i * 2.3) * 0.7, 0.6, Math.sin(i * 2.3) * 0.7], -0.02).scale.set(1, 0.3, 1);
            // The carved ruin shard grown into its back.
            this.shard = this._lvGroup(null, 0.04, 0.31, -0.08);
            this.shard.rotation.set(-0.2, 0.3, 0.25);
            this._lvMesh(this.shard, lvBox(0.16, 0.2, 0.04), stone);
            this._lvMesh(this.shard, lvTor(0.04, 0.008, 3, 8), glyph, [0, 0.02, 0.022]);
            this._lvMesh(this.shard, lvBox(0.012, 0.1, 0.006), glyph, [0, 0.02, 0.024]);
            this.head = this._lvGroup(null, 0, 0.2, 0.46);
            this.head.rotation.x = -0.15;
            this._lvMesh(this.head, lvCone(0.16, 0.3, 3), stone, null, [Math.PI / 2, 0, 0], [1.2, 1, 0.5]);
            this._lvMesh(this.head, lvSph(0.025, 5, 4), this._mat(p.accent, 1.0, 0.2, p.accent), [0, 0.04, -0.03]);
            for (const s of [-1, 1]) this._eye(this.head, s * 0.1, 0.02, -0.02, 0.03, 0x1a1a10).rotation.y = s * 1.2;
            this.jaw = this._lvMesh(this.head, lvBox(0.16, 0.02, 0.18), stone, [0, -0.045, 0.02]);
            const leg = (s, z, pts) => this._lvLimb(null, s * 0.2, 0.15, z, pts, 0.04, 0.03, stone, this._lvToes(stone, 4, 0.025, 1.8, s));
            this.leftArm = leg(-1, 0.2, [[-0.2, 0.04, 0.06], [-0.3, -0.13, 0.12]]);
            this.rightArm = leg(1, 0.2, [[0.2, 0.04, 0.06], [0.3, -0.13, 0.12]]);
            this.leftLeg = leg(-1, -0.2, [[-0.22, 0.04, -0.06], [-0.32, -0.13, -0.14]]);
            this.rightLeg = leg(1, -0.2, [[0.22, 0.04, -0.06], [0.32, -0.13, -0.14]]);
            // A tail curled round to one side, like a carved spiral.
            this.tail = this._lvLimb(null, 0, 0.15, -0.38, [[0, -0.03, -0.2], [0.12, -0.06, -0.4], [0.32, -0.08, -0.46], [0.44, -0.09, -0.32], [0.4, -0.1, -0.18]], 0.08, 0.02, stone);
            this._lvRig({ HEAD: this.head, TORSO: this.body, LEFT_ARM: this.leftArm, RIGHT_ARM: this.rightArm, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg, TAIL: this.tail, MAW: this.jaw },
                ['TORSO'], [this.body, this.shard, this.head, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg, this.tail], ['HEAD', 'LEFT_ARM', 'RIGHT_ARM', 'LEFT_LEG', 'RIGHT_LEG', 'TAIL', 'MAW']);
        }

        // ═════════════════════════════════════════════════════════════════════
        // Bespoke uniques (u_ keys) that an enemy's own note pins by key.
        // ═════════════════════════════════════════════════════════════════════

        // ── Umbral Lurker: a hooded rag of shadow, a three-slit mask, and an
        // arm that reaches over its own head; it is tethered to its shadow.
        // Ghost rig: FACE/CORE/LEFT_WISP/RIGHT_WISP/MAW.
        _buildUUmbralLurker() {
            const p = this.profile;
            const shade = this._mat(p.bodyColor, 0.9, 0.3, 0x0a0614);
            const bone = this._skinMat(0xd8d0c0, 0.5);
            this.body = this._lvGroup(null, 0, 0, 0);
            this._lvMesh(this.body, lvCone(0.32, 1.3, 7), shade, [0, 1.15, 0], [Math.PI, 0, 0]);
            this._lvMesh(this.body, lvSph(0.26, 7, 5), shade, [0, 1.8, 0], null, [1, 1.2, 1]);
            for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; this._lvMesh(this.body, lvCone(0.07, 0.45, 4), shade, [Math.cos(a) * 0.12, 0.55, Math.sin(a) * 0.12], [Math.PI + Math.sin(a) * 0.3, 0, Math.cos(a) * 0.3]); }
            // Its own shadow, still holding on to it by a thread of dark.
            this.addStrut(this.body, shade, new THREE.Vector3(0, 0.55, 0), new THREE.Vector3(0.05, 0.02, -0.1), 0.05, 0.02, 5);
            this.pool = this._lvMesh(this.body, lvCyl(0.5, 0.55, 0.02, 9), this._mat(0x05030a, 0.85, 0.1), [0.05, 0.01, -0.1]);
            // FACE: a cracked bone mask with three slit eyes; MAW: a vertical split.
            this.face = this._lvGroup(null, 0, 1.72, 0.28);
            this._lvMesh(this.face, lvSph(0.17, 7, 5), bone, null, null, [0.9, 1.2, 0.45]);
            for (const [x, y, rz] of [[-0.07, 0.05, 0.4], [0.07, 0.05, -0.4], [0, 0.14, Math.PI / 2]]) {
                this._lvMesh(this.face, lvBox(0.07, 0.016, 0.02), this._mat(0x050505, 1.0, 0.4), [x, y, 0.07], [0, 0, rz]);
                this._lvMesh(this.face, lvSph(0.012, 4, 3), this._mat(p.accent, 1.0, 0.2, p.accent), [x, y, 0.08]);
            }
            this.maw = this._lvGroup(this.face, 0, -0.08, 0.07);
            this._lvMesh(this.maw, lvBox(0.025, 0.14, 0.02), this._mat(0x200010, 1.0, 0.5));
            for (let i = 0; i < 4; i++) for (const s of [-1, 1]) this._lvMesh(this.maw, lvCone(0.008, 0.03, 3), bone, [s * 0.016, -0.05 + i * 0.033, 0.005], [0, 0, s * Math.PI / 2]);
            // CORE: a cold violet heart showing through the rags.
            this.core = this._lvMesh(this.bodyGroup, lvSph(0.09, 6, 5), this._mat(p.accent, 0.95, 0.2, p.accent), [0, 1.25, 0.17]);
            // Wisps: one arm reaches over its own head, the other comes in low.
            const hook = () => { const g = new THREE.Group(); for (let i = -1; i <= 1; i++) this._lvMesh(g, lvCone(0.018, 0.14, 4), shade, [i * 0.03, 0, 0.06], [Math.PI / 2 + 0.4, i * 0.3, 0]); return g; };
            this.leftWisp = this._lvLimb(null, -0.22, 1.55, 0.05, [[-0.2, 0.15, 0.05], [-0.35, 0.45, 0.15], [-0.15, 0.65, 0.35]], 0.07, 0.025, shade, hook());
            this.rightWisp = this._lvLimb(null, 0.2, 1.4, 0.05, [[0.25, -0.15, 0.1], [0.45, -0.45, 0.25], [0.4, -0.7, 0.45]], 0.07, 0.025, shade, hook());
            this._lvRig({ FACE: this.face, CORE: this.core, LEFT_WISP: this.leftWisp, RIGHT_WISP: this.rightWisp, MAW: this.maw, BODY: this.body },
                ['CORE', 'BODY'], [this.body, this.face, this.core, this.leftWisp, this.rightWisp], ['FACE', 'LEFT_WISP', 'RIGHT_WISP', 'MAW']);
        }

        // ── Bureaucratic Nightmare: a filing cabinet bound in red tape, a
        // rubber stamp for a head, a pen nib for a hand, castors for feet.
        // Humanoid rig.
        _buildUBureaucrat() {
            const p = this.profile;
            const steel = this._skinMat(p.bodyColor, 0.45);
            const suit = this._mat(0x2a2a30, 1.0, 0.7);
            const paper = this._mat(0xf4f0e4, 1.0, 0.8);
            const tape = this._mat(0xc81e1e, 1.0, 0.6);
            const dark = this._mat(0x101012, 1.0, 0.5);
            this.body = this._lvGroup(null, 0, 1.15, 0);
            this._lvMesh(this.body, lvBox(0.5, 0.8, 0.42), steel);
            for (const i of [0, 2]) { this._lvMesh(this.body, lvBox(0.14, 0.03, 0.03), this._mat(0xb8bcc4, 1.0, 0.3), [0, 0.26 - i * 0.26, 0.22]); this._lvMesh(this.body, lvBox(0.1, 0.05, 0.01), paper, [0, 0.31 - i * 0.26, 0.212]); }
            // Red tape wound round and round it.
            const band = this._lvGroup(this.body, 0, 0.05, 0); band.rotation.x = 0.35;
            for (const [w, d, x, z] of [[0.6, 0.012, 0, 0.216], [0.6, 0.012, 0, -0.216], [0.012, 0.44, 0.27, 0], [0.012, 0.44, -0.27, 0]]) this._lvMesh(band, lvBox(w, 0.05, d), tape, [x, 0, z]);
            // STOMACH: the middle drawer hangs open, stuffed with forms.
            this.drawer = this._lvGroup(this.body, 0, 0.0, 0.2);
            this._lvMesh(this.drawer, lvBox(0.44, 0.22, 0.3), steel, [0, 0, 0.1]);
            for (let i = 0; i < 6; i++) this._lvMesh(this.drawer, lvBox(0.3, 0.008, 0.24), paper, [(i % 2 - 0.5) * 0.04, 0.1 + i * 0.012, 0.08], [-0.25 - i * 0.12, 0, (i - 2.5) * 0.06]);
            this._lvMesh(this.body, lvCyl(0.05, 0.05, 0.14, 6), suit, [0, 0.46, 0]);
            // HEAD: a rubber stamp; its eyes are punched holes, its mouth a slot.
            this.head = this._lvGroup(null, 0, 1.72, 0);
            this._lvMesh(this.head, lvBox(0.34, 0.14, 0.26), this._mat(0x6a4020, 1.0, 0.7));
            this._lvMesh(this.head, lvBox(0.34, 0.03, 0.26), this._mat(0xa81818, 1.0, 0.5), [0, -0.08, 0]);
            this._lvMesh(this.head, lvCyl(0.045, 0.06, 0.2, 7), this._mat(0x6a4020, 1.0, 0.7), [0, 0.17, 0]);
            this._lvMesh(this.head, lvSph(0.09, 7, 5), this._mat(0xa81818, 1.0, 0.4), [0, 0.3, 0]);
            this.eyes = [-1, 1].map(s => { const e = this._lvMesh(this.head, lvCyl(0.035, 0.035, 0.02, 8), dark, [s * 0.08, 0.02, 0.13], [Math.PI / 2, 0, 0]); this._lvMesh(e, lvSph(0.015, 4, 3), this._mat(p.accent, 1.0, 0.2, p.accent), [0, 0.012, 0]); return e; });
            this.mouth = this._lvMesh(this.head, lvBox(0.16, 0.02, 0.02), dark, [0, -0.035, 0.13]);
            // Arms: a clipboard in one hand, the other ends in a fountain-pen nib.
            const clip = new THREE.Group();
            this._lvMesh(clip, lvBox(0.2, 0.28, 0.02), this._mat(0x8a5a2a, 1.0, 0.7), [0, -0.1, 0.02]);
            this._lvMesh(clip, lvBox(0.17, 0.22, 0.005), paper, [0, -0.12, 0.033]);
            this._lvMesh(clip, lvBox(0.08, 0.03, 0.03), this._mat(0xb8bcc4, 1.0, 0.3), [0, 0.03, 0.03]);
            this.leftArm = this._lvLimb(null, -0.3, 1.48, 0, [[-0.12, -0.3, 0.06], [-0.1, -0.55, 0.22]], 0.045, 0.04, suit, clip);
            const nib = this._lvMesh(null, lvCone(0.04, 0.24, 4), this._mat(0xd8b040, 1.0, 0.2), [0, 0, 0.1], [Math.PI / 2, 0, 0]);
            this.rightArm = this._lvLimb(null, 0.3, 1.48, 0, [[0.12, -0.28, 0.08], [0.08, -0.48, 0.28]], 0.045, 0.04, suit, nib);
            const castor = () => { const g = new THREE.Group(); this._lvMesh(g, lvBox(0.05, 0.05, 0.05), dark); this._lvMesh(g, lvCyl(0.05, 0.05, 0.04, 8), dark, [0, -0.05, 0], [0, 0, Math.PI / 2]); return g; };
            this.leftLeg = this._lvLimb(null, -0.13, 0.78, 0, [[0, -0.4, 0.02], [0, -0.68, 0]], 0.05, 0.04, suit, castor());
            this.rightLeg = this._lvLimb(null, 0.13, 0.78, 0, [[0, -0.4, 0.02], [0, -0.68, 0]], 0.05, 0.04, suit, castor());
            const m = { HEAD: this.head, BRAIN: this.head, NOSE: this.head, LEFT_EAR: this.head, RIGHT_EAR: this.head, LEFT_EYE: this.eyes[0], RIGHT_EYE: this.eyes[1], MOUTH: this.mouth, TEETH: this.mouth,
                TORSO: this.body, HEART: this.body, LEFT_LUNG: this.body, RIGHT_LUNG: this.body, LIVER: this.body, SPLEEN: this.body, GENITALS: this.body, STOMACH: this.drawer, INTESTINES: this.drawer,
                LEFT_ARM: this.leftArm, LEFT_HAND: this.leftArm, LEFT_FINGERS: this.leftArm, RIGHT_ARM: this.rightArm, RIGHT_HAND: this.rightArm, RIGHT_FINGERS: this.rightArm,
                LEFT_LEG: this.leftLeg, LEFT_FOOT: this.leftLeg, LEFT_TOES: this.leftLeg, RIGHT_LEG: this.rightLeg, RIGHT_FOOT: this.rightLeg, RIGHT_TOES: this.rightLeg };
            this._lvRig(m, ['TORSO'], [this.body, this.head, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg], ['LEFT_EYE', 'RIGHT_EYE', 'MOUTH', 'STOMACH', 'LEFT_ARM', 'RIGHT_ARM', 'LEFT_LEG', 'RIGHT_LEG']);
            this._cascadeRules.push({ gone: ['HEAD', 'BRAIN'], hide: [this.head] });
        }

        // ── Off-Ramp Incarnate: a wrong turn with a body. Asphalt torso with
        // lane lines and a lit tunnel in its belly, an exit-sign head pointing
        // the wrong way, gantry-sign wings and a tail that is a curling ramp.
        // Demon rig: HEAD/HORNS/TORSO/LEFT_WING/RIGHT_WING/TAIL/LEFT_CLAW/RIGHT_CLAW/MAW.
        _buildUOffRamp() {
            const p = this.profile;
            const asphalt = this._skinMat(p.bodyColor, 0.95);
            const yellow = this._mat(0xf0c020, 1.0, 0.6);
            const white = this._mat(0xf0f0ea, 1.0, 0.6);
            const green = this._mat(0x1a6a3a, 1.0, 0.5);
            const steel = this._mat(0x9aa0a8, 1.0, 0.35);
            const concrete = this._mat(0x8a8884, 1.0, 0.95);
            this.body = this._lvGroup(null, 0, 1.25, 0);
            this._lvMesh(this.body, lvBox(0.9, 0.85, 0.5), asphalt);
            for (let i = 0; i < 3; i++) this._lvMesh(this.body, lvBox(0.05, 0.14, 0.01), yellow, [0, 0.3 - i * 0.2, 0.255]);
            for (const s of [-1, 1]) this._lvMesh(this.body, lvBox(0.03, 0.8, 0.01), white, [s * 0.38, 0, 0.255]);
            // Somewhere that should not touch here, glowing at the end of a tunnel.
            this._lvMesh(this.body, new THREE.CircleGeometry(0.17, 8, 0, Math.PI), this._mat(0x020204, 1.0, 0.5), [0, -0.3, 0.256]);
            this.farLight = this._lvMesh(this.body, new THREE.CircleGeometry(0.04, 6), this._mat(p.accent, 1.0, 0.2, p.accent), [0, -0.24, 0.258]);
            this._lvMesh(this.body, lvCyl(0.04, 0.04, 0.24, 6), steel, [0, 0.5, 0]);
            // HEAD: an exit sign, its arrow pointing back where you came from.
            this.head = this._lvGroup(null, 0, 1.95, 0.05);
            this._lvMesh(this.head, lvBox(0.6, 0.38, 0.06), green);
            for (const [w, h, x, y] of [[0.56, 0.02, 0, 0.165], [0.56, 0.02, 0, -0.165], [0.02, 0.34, 0.27, 0], [0.02, 0.34, -0.27, 0]]) this._lvMesh(this.head, lvBox(w, h, 0.065), white, [x, y, 0]);
            this._lvMesh(this.head, lvBox(0.04, 0.16, 0.065), white, [-0.12, 0.04, 0], [0, 0, 0.6]);
            this._lvMesh(this.head, lvCone(0.06, 0.1, 3), white, [-0.17, 0.11, 0], [0, 0, 0.6]);
            for (const s of [-1, 1]) this._lvMesh(this.head, lvBox(0.06, 0.035, 0.02), this._mat(0xffb020, 1.0, 0.2, 0xffb020), [s * 0.1 + 0.08, -0.06, 0.04]);
            this.horns = this._lvGroup(this.head, 0, 0, 0);
            for (const s of [-1, 1]) { this.addStrut(this.horns, steel, new THREE.Vector3(s * 0.24, 0.17, 0), new THREE.Vector3(s * 0.38, 0.4, 0), 0.025, 0.02, 5); this.addStrut(this.horns, steel, new THREE.Vector3(s * 0.38, 0.4, 0), new THREE.Vector3(s * 0.3, 0.56, 0), 0.02, 0.016, 5); this._lvMesh(this.horns, lvSph(0.022, 5, 4), steel, [s * 0.38, 0.4, 0]); }
            this._lvMesh(this.horns, lvCyl(0.08, 0.08, 0.02, 8), this._mat(0xc81e1e, 1.0, 0.5), [0.3, 0.6, 0], [Math.PI / 2, 0, 0]);
            // MAW: the lower sign panel drops open on a row of road studs.
            this.maw = this._lvGroup(this.head, 0, -0.19, 0.02);
            this._lvMesh(this.maw, lvBox(0.5, 0.12, 0.05), green, [0, -0.06, 0]);
            for (let i = 0; i < 6; i++) this._lvMesh(this.maw, lvCone(0.022, 0.06, 4), white, [-0.2 + i * 0.08, 0.02, 0.01]);
            // Wings: two overhead gantry signs.
            const wing = (s) => { const g = this._lvGroup(null, s * 0.45, 1.6, -0.15); this._lvMesh(g, lvBox(0.7, 0.32, 0.04), green, [s * 0.35, 0.15, 0], [0, 0, s * 0.45]); this._lvMesh(g, lvBox(0.66, 0.03, 0.045), white, [s * 0.35, 0.15, 0], [0, 0, s * 0.45]); return g; };
            this.leftWing = wing(-1); this.rightWing = wing(1);
            // Claws: guardrail arms ending in bent rebar.
            const rebar = () => { const g = new THREE.Group(); this._lvMesh(g, lvBox(0.14, 0.1, 0.12), concrete); for (let i = -1; i <= 1; i++) this._lvMesh(g, lvCone(0.018, 0.16, 4), this._mat(0x7a3a1a, 1.0, 0.6), [i * 0.045, -0.06, 0.08], [Math.PI * 0.65, 0, 0]); return g; };
            this.leftClaw = this._lvLimb(null, -0.5, 1.5, 0.05, [[-0.15, -0.35, 0.1], [-0.18, -0.75, 0.2]], 0.07, 0.06, steel, rebar());
            this.rightClaw = this._lvLimb(null, 0.5, 1.5, 0.05, [[0.15, -0.35, 0.1], [0.18, -0.75, 0.2]], 0.07, 0.06, steel, rebar());
            // Legs: bridge pillars on concrete footings.
            const footing = () => this._lvMesh(null, lvBox(0.3, 0.06, 0.3), concrete);
            this.leftLeg = this._lvLimb(null, -0.25, 0.86, 0, [[0, -0.8, 0]], 0.15, 0.17, concrete, footing());
            this.rightLeg = this._lvLimb(null, 0.25, 0.86, 0, [[0, -0.8, 0]], 0.15, 0.17, concrete, footing());
            // TAIL: a ramp curling down behind it, lane line and all.
            this.tail = this._lvGroup(null, 0, 1.0, -0.24);
            const tp = [[0, 0, 0], [0, -0.12, -0.28], [0.18, -0.32, -0.5], [0.45, -0.52, -0.55], [0.65, -0.72, -0.38], [0.72, -0.93, -0.12]].map(q => new THREE.Vector3(q[0], q[1], q[2]));
            for (let i = 0; i < tp.length - 1; i++) {
                const d = tp[i + 1].clone().sub(tp[i]), len = d.length();
                const seg = this._lvMesh(this.tail, lvBox(0.28, 0.04, len + 0.06), asphalt);
                seg.position.copy(tp[i]).lerp(tp[i + 1], 0.5); seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize());
                this._lvMesh(seg, lvBox(0.03, 0.045, len * 0.4), yellow);
            }
            this._lvRig({ HEAD: this.head, HORNS: this.horns, TORSO: this.body, LEFT_WING: this.leftWing, RIGHT_WING: this.rightWing, TAIL: this.tail, LEFT_CLAW: this.leftClaw, RIGHT_CLAW: this.rightClaw, MAW: this.maw, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg },
                ['TORSO'], [this.body, this.head, this.leftWing, this.rightWing, this.tail, this.leftClaw, this.rightClaw, this.leftLeg, this.rightLeg], ['HEAD', 'HORNS', 'LEFT_WING', 'RIGHT_WING', 'TAIL', 'LEFT_CLAW', 'RIGHT_CLAW', 'MAW', 'LEFT_LEG', 'RIGHT_LEG']);
        }

        // ── Varlenia Mirage: a floating scrap of oasis, palm and pool, with
        // eyes in the water and teeth all round its underside.
        // Ghost rig: FACE/CORE/LEFT_WISP/RIGHT_WISP/MAW.
        _buildUVarlenia() {
            const p = this.profile;
            const sand = this.applySkin(this._mat(p.bodyColor, 0.85, 0.7, 0x2a1a00));
            const earth = this._mat(0x7a5a3a, 0.8, 0.9, 0x1a0a00);
            const haze = this._mat(p.accent, 0.5, 0.2, p.accent);
            this.core = this._lvGroup(null, 0, 0, 0);
            this._lvMesh(this.core, lvCyl(0.5, 0.45, 0.08, 9), sand, [0, 1.3, 0]);
            this._lvMesh(this.core, lvCone(0.45, 0.6, 9), earth, [0, 0.96, 0], [Math.PI, 0, 0]);
            const V = (x, y, z) => new THREE.Vector3(x, y, z);
            const palm = [V(0.15, 1.33, -0.1), V(0.2, 1.68, -0.12), V(0.28, 1.95, -0.05)];
            for (let i = 0; i < 2; i++) this.addStrut(this.core, this._mat(0x8a6a3a, 0.85, 0.8), palm[i], palm[i + 1], 0.045 - i * 0.01, 0.035 - i * 0.01, 6);
            for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; this._lvMesh(this.core, lvCone(0.07, 0.4, 3), this._mat(0x3a9a4a, 0.8, 0.6), [0.28 + Math.cos(a) * 0.17, 1.9, -0.05 + Math.sin(a) * 0.17], [Math.sin(a) * 1.7, 0, -Math.cos(a) * 1.7], [1, 1, 0.3]); }
            for (const s of [-1, 1]) this._lvMesh(this.core, lvSph(0.04, 5, 4), this._mat(0x5a3a1a, 0.85, 0.6), [0.28 + s * 0.04, 1.9, -0.02]);
            // FACE: two eyes watching out of the pool.
            this.face = this._lvGroup(null, -0.1, 1.34, 0.12);
            this._lvMesh(this.face, lvCyl(0.2, 0.2, 0.02, 10), this._mat(0x4ad8d0, 0.7, 0.1, 0x0a4a4a));
            this.eyes = [-1, 1].map(s => this._eye(this.face, s * 0.07, 0.02, 0.03, 0.05, 0x1a0a00));
            // MAW: the underside is all teeth.
            this.maw = this._lvGroup(null, 0, 1.08, 0);
            this._lvMesh(this.maw, lvTor(0.3, 0.03, 4, 12), this._mat(0x3a0a10, 0.9, 0.5), null, [Math.PI / 2, 0, 0]);
            for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; this._lvMesh(this.maw, lvCone(0.025, 0.1, 4), this._mat(0xf0ead8, 0.9, 0.4), [Math.cos(a) * 0.32, (i % 2 ? 0.05 : -0.05), Math.sin(a) * 0.32], [i % 2 ? Math.PI : 0, 0, 0]); }
            // Wisps: heat-shimmer ribbons trailing under it.
            this.leftWisp = this._lvLimb(null, -0.45, 1.28, 0, [[-0.1, -0.25, 0.05], [-0.02, -0.5, 0.1], [-0.12, -0.75, 0.05]], 0.05, 0.012, haze);
            this.rightWisp = this._lvLimb(null, 0.45, 1.28, 0, [[0.1, -0.25, 0.05], [0.02, -0.5, 0.1], [0.12, -0.75, 0.05]], 0.05, 0.012, haze);
            this._lvRig({ FACE: this.face, CORE: this.core, LEFT_WISP: this.leftWisp, RIGHT_WISP: this.rightWisp, MAW: this.maw, BODY: this.core },
                ['CORE', 'BODY'], [this.core, this.face, this.maw, this.leftWisp, this.rightWisp], ['FACE', 'LEFT_WISP', 'RIGHT_WISP', 'MAW']);
        }

        // ── Rime Spinner: an ice-mantis sorcerer with an icicle crown, a hex
        // barrier held in its forelegs and a snowflake turning in its belly.
        // Insectoid rig: HEAD/THORAX/ABDOMEN/6 legs/MANDIBLES.
        _buildURimeSpinner() {
            const p = this.profile;
            const chitin = this._skinMat(p.bodyColor, 0.3);
            const ice = this._mat(0xbfe8ff, 0.55, 0.1, 0x1a4a6a);
            const bright = this._mat(p.accent, 1.0, 0.2, p.accent);
            this.abdomen = this._lvGroup(null, 0, 0.35, -0.35);
            this._lvMesh(this.abdomen, lvSph(0.26, 8, 6), ice, null, null, [0.9, 0.8, 1.3]);
            this.flake = this._lvGroup(this.abdomen, 0, 0, 0);
            for (let i = 0; i < 3; i++) this._lvMesh(this.flake, lvBox(0.3, 0.02, 0.02), bright, null, [0, i * Math.PI / 3, 0]);
            this.thorax = this._lvGroup(null, 0, 0, 0);
            this.addStrut(this.thorax, chitin, new THREE.Vector3(0, 0.4, -0.1), new THREE.Vector3(0, 0.85, 0.12), 0.09, 0.07, 6);
            this._lvMesh(this.thorax, lvSph(0.1, 6, 5), chitin, [0, 0.42, -0.08]);
            this._lvMesh(this.thorax, lvSph(0.085, 6, 5), chitin, [0, 0.85, 0.12]);
            this.head = this._lvGroup(null, 0, 0.95, 0.18);
            this._lvMesh(this.head, lvSph(0.1, 7, 5), chitin, null, null, [1.5, 0.8, 0.8]);
            for (const s of [-1, 1]) this._lvMesh(this.head, lvSph(0.05, 6, 4), bright, [s * 0.13, 0.02, 0.02]);
            for (let i = 0; i < 5; i++) this._lvMesh(this.head, lvCone(0.022, 0.16 - Math.abs(i - 2) * 0.03, 4), ice, [(i - 2) * 0.05, 0.12 - Math.abs(i - 2) * 0.012, -0.02]);
            this.mandibles = this._lvGroup(this.head, 0, -0.06, 0.06);
            for (const s of [-1, 1]) this._lvMesh(this.mandibles, lvCone(0.015, 0.07, 3), chitin, [s * 0.025, -0.02, 0.01], [Math.PI, 0, s * 0.3]);
            // Raptorial forelegs, holding a hexagonal ice barrier between them.
            const fore = (s) => this._lvLimb(null, s * 0.08, 0.75, 0.08, [[s * 0.12, 0.05, 0.18], [s * 0.1, 0.25, 0.3]], 0.035, 0.025, chitin, this._lvMesh(null, lvCone(0.025, 0.14, 4), ice, [0, 0.06, 0.02]));
            this.leftLeg = fore(-1); this.rightLeg = fore(1);
            this.barrier = this._lvMesh(this.leftLeg, lvCyl(0.2, 0.2, 0.02, 6), ice, [0.1, 0.25, 0.34], [Math.PI / 2, 0, 0]);
            const walk = (s, x, y, z, pts) => this._lvLimb(null, s * x, y, z, pts, 0.03, 0.018, chitin);
            this.midLeftLeg = walk(-1, 0.07, 0.42, -0.05, [[-0.18, 0.08, 0.05], [-0.32, -0.42, 0.1]]);
            this.midRightLeg = walk(1, 0.07, 0.42, -0.05, [[0.18, 0.08, 0.05], [0.32, -0.42, 0.1]]);
            this.rearLeftLeg = walk(-1, 0.08, 0.38, -0.2, [[-0.2, 0.1, -0.05], [-0.34, -0.38, -0.15]]);
            this.rearRightLeg = walk(1, 0.08, 0.38, -0.2, [[0.2, 0.1, -0.05], [0.34, -0.38, -0.15]]);
            this._lvRig({ HEAD: this.head, THORAX: this.thorax, ABDOMEN: this.abdomen, MANDIBLES: this.mandibles, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg,
                MIDDLE_LEFT_LEG: this.midLeftLeg, MIDDLE_RIGHT_LEG: this.midRightLeg, REAR_LEFT_LEG: this.rearLeftLeg, REAR_RIGHT_LEG: this.rearRightLeg },
                ['THORAX'], [this.thorax, this.head, this.abdomen, this.leftLeg, this.rightLeg, this.midLeftLeg, this.midRightLeg, this.rearLeftLeg, this.rearRightLeg],
                ['HEAD', 'ABDOMEN', 'MANDIBLES', 'LEFT_LEG', 'RIGHT_LEG', 'MIDDLE_LEFT_LEG', 'MIDDLE_RIGHT_LEG', 'REAR_LEFT_LEG', 'REAR_RIGHT_LEG']);
        }

        // ── Thoth's Broken Ward: a stone cage under an ibis head, one pillar
        // snapped, the chaos it was built to hold leaking out of the gap.
        // Golem rig: CORE/LEFT_ARM/RIGHT_ARM/LEFT_LEG/RIGHT_LEG/MAW.
        _buildUThothWard() {
            const p = this.profile;
            const stone = this._skinMat(p.bodyColor, 0.9);
            const glyph = this._mat(0x2a2620, 1.0, 0.9);
            const lapis = this._mat(0x2a4a9a, 1.0, 0.5);
            const chaos = this._mat(p.accent, 0.95, 0.2, p.accent);
            this.body = this._lvGroup(null, 0, 0, 0);
            this._lvMesh(this.body, lvBox(0.7, 0.12, 0.55), stone, [0, 0.72, 0]);
            this._lvMesh(this.body, lvBox(0.75, 0.14, 0.6), stone, [0, 1.52, 0]);
            for (const [x, z] of [[-0.3, 0.22], [-0.3, -0.22], [0.3, -0.22]]) this._lvMesh(this.body, lvBox(0.1, 0.7, 0.1), stone, [x, 1.12, z]);
            // The snapped pillar: a jagged stump below, a jagged stub above.
            this._lvMesh(this.body, lvBox(0.1, 0.38, 0.1), stone, [0.3, 0.95, 0.22]);
            for (let i = 0; i < 3; i++) this._lvMesh(this.body, lvCone(0.03, 0.08, 3), stone, [0.27 + i * 0.03, 1.17, 0.2 + (i % 2) * 0.04]);
            this._lvMesh(this.body, lvCone(0.035, 0.1, 3), stone, [0.3, 1.41, 0.22], [Math.PI, 0, 0]);
            for (let i = 0; i < 4; i++) { this._lvMesh(this.body, lvBox(0.04, 0.06, 0.01), glyph, [-0.25 + i * 0.16, 1.52, 0.302]); this._lvMesh(this.body, lvBox(0.06, 0.03, 0.01), glyph, [-0.22 + i * 0.15, 0.72, 0.277]); }
            // CORE: the chaos it was meant to cage, leaking out of the gap.
            this.core = this._lvGroup(null, 0, 1.12, 0);
            this._lvMesh(this.core, new THREE.IcosahedronGeometry(0.2, 0), chaos);
            const V = (x, y, z) => new THREE.Vector3(x, y, z);
            for (const [a, b] of [[V(0.1, 0.05, 0.1), V(0.45, 0.2, 0.4)], [V(0.12, -0.05, 0.08), V(0.5, -0.15, 0.3)], [V(0.05, 0.1, 0.14), V(0.3, 0.32, 0.45)]]) this.addStrut(this.core, chaos, a, b, 0.035, 0.008, 4);
            // HEAD: an ibis head in a striped headdress; MAW: the long curved beak.
            this._lvMesh(this.body, lvCyl(0.06, 0.08, 0.22, 7), stone, [0, 1.68, 0]);
            this.head = this._lvGroup(null, 0, 1.85, 0.03);
            this._lvMesh(this.head, lvSph(0.13, 7, 5), stone, null, null, [0.9, 1, 1.2]);
            for (const s of [-1, 1]) {
                this._lvMesh(this.head, lvBox(0.08, 0.3, 0.02), lapis, [s * 0.11, -0.12, -0.05], [0.2, 0, 0]);
                this._lvMesh(this.head, lvBox(0.085, 0.03, 0.025), this._mat(0xd8b040, 1.0, 0.3), [s * 0.11, -0.08, -0.05], [0.2, 0, 0]);
                this._lvMesh(this.head, lvSph(0.025, 5, 4), this._mat(0x40e0d0, 1.0, 0.2, 0x40e0d0), [s * 0.08, 0.03, 0.1]);
            }
            this.maw = this._lvLimb(this.head, 0, -0.02, 0.13, [[0, -0.06, 0.2], [0, -0.18, 0.34]], 0.04, 0.012, glyph);
            // Arms: a scribe's palette and a reed pen.
            const palette = new THREE.Group();
            this._lvMesh(palette, lvBox(0.08, 0.03, 0.26), this._mat(0xc8a878, 1.0, 0.8), [0, 0, 0.08]);
            for (const z of [0.0, 0.08]) this._lvMesh(palette, lvCyl(0.018, 0.018, 0.012, 6), z ? this._mat(0xc81e1e, 1.0, 0.5) : glyph, [0, 0.018, z]);
            this.leftArm = this._lvLimb(null, -0.42, 1.45, 0, [[-0.1, -0.3, 0.08], [-0.08, -0.58, 0.2]], 0.08, 0.07, stone, palette);
            const pen = new THREE.Group(); this._lvMesh(pen, lvSph(0.07, 6, 4), stone); this._lvMesh(pen, lvCyl(0.012, 0.012, 0.3, 4), this._mat(0xb89a5a, 1.0, 0.7), [0, 0.06, 0.08], [0.8, 0, 0]);
            this.rightArm = this._lvLimb(null, 0.42, 1.45, 0, [[0.1, -0.3, 0.08], [0.08, -0.58, 0.2]], 0.08, 0.07, stone, pen);
            const foot = () => this._lvMesh(null, lvBox(0.18, 0.08, 0.26), stone, [0, 0, 0.04]);
            this.leftLeg = this._lvLimb(null, -0.2, 0.7, 0, [[0, -0.62, 0.02]], 0.1, 0.09, stone, foot());
            this.rightLeg = this._lvLimb(null, 0.2, 0.7, 0, [[0, -0.62, 0.02]], 0.1, 0.09, stone, foot());
            this._lvRig({ CORE: this.core, LEFT_ARM: this.leftArm, RIGHT_ARM: this.rightArm, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg, MAW: this.maw, HEAD: this.head, BODY: this.body, TORSO: this.body },
                ['BODY', 'TORSO'], [this.body, this.core, this.head, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg], ['CORE', 'LEFT_ARM', 'RIGHT_ARM', 'LEFT_LEG', 'RIGHT_LEG', 'MAW', 'HEAD']);
        }

        // Motion for the level 1-5 roster and the u_ uniques.
        _animateLv(t, fast, stride, baseX, deltaTime) {
            const S = Math.sin, A = Math.abs;
            switch (this.variant) {
                case 'lv_foldedairplane': {
                    const f = S(t * (fast ? 10 : 2.4)) * (fast ? 0.14 : 0.06);
                    if (this.leftWing) this.leftWing.rotation.z = -f;
                    if (this.rightWing) this.rightWing.rotation.z = f;
                    this.model.rotation.z = S(t * 0.9) * 0.14;
                    break;
                }
                case 'lv_wasabisnail': {
                    [this.stalkL, this.stalkR].forEach((g, i) => { if (g) { g.rotation.z = (i ? -1 : 1) * S(t * 1.6 + i) * 0.18; g.rotation.x = fast ? 0.5 * A(S(t * 8)) : S(t * 1.1 + i) * 0.1; } });
                    if (this.foot) this.foot.scale.z = 1 + S(t * 1.8) * 0.04;
                    if (this.shell) this.shell.rotation.z = S(t * 0.9) * 0.05;
                    break;
                }
                case 'lv_clockworktinsoldier': {
                    const m = S(t * (fast ? 7 : 3.2)) * 0.32;
                    if (this.leftLeg) this.leftLeg.rotation.x = m;
                    if (this.rightLeg) this.rightLeg.rotation.x = -m;
                    if (this.leftArm) this.leftArm.rotation.x = -m * 0.8;
                    if (this.rightArm) this.rightArm.rotation.x = fast ? -0.5 * A(S(t * 8)) : 0;
                    if (this.core) this.core.rotation.z -= deltaTime * (fast ? 9 : 3);
                    if (this.jaw) this.jaw.rotation.x = A(S(t * (fast ? 12 : 4))) * 0.3;
                    this.model.position.y = this._baseY + A(S(t * (fast ? 7 : 3.2))) * 0.03 * this.scale;
                    break;
                }
                case 'lv_dryerlintgolem': {
                    const b = 1 + S(t * 1.4) * 0.03;
                    if (this.body) this.body.scale.set(b, 2 - b, b);
                    if (this.leftArm) this.leftArm.rotation.x = fast ? -0.7 * A(S(t * 6)) : S(t * 1.2) * 0.12;
                    if (this.rightArm) this.rightArm.rotation.x = fast ? -0.7 * A(S(t * 6 + 1.5)) : S(t * 1.2 + 1) * 0.12;
                    if (this.core) { this.core.rotation.y = t * 4; if (this.core.material) this.core.material.emissiveIntensity = (fast ? 1.6 : 0.7) + A(S(t * 23)) * 0.8; }
                    break;
                }
                case 'lv_sandgecko':
                case 'lv_ruingecko':
                case 'lv_hoardlizard':
                case 'lv_sewergatorhatchling': {
                    if (this.head) this.head.rotation.y = S(t * (this.variant === 'lv_hoardlizard' ? 3.1 : 0.9)) * (this.variant === 'lv_hoardlizard' ? 0.25 : 0.12);
                    if (this.tail) this.tail.rotation.y = S(t * (fast ? 5 : 1.4)) * 0.2;
                    if (this.tongue) this.tongue.rotation.x = S(t * 5) * 0.15;
                    if (this.jaw && this.jaw.isGroup) this.jaw.rotation.x = fast ? A(S(t * 9)) * 0.45 : A(S(t * 0.8)) * 0.08;
                    const lg = [this.leftArm, this.rightLeg, this.rightArm, this.leftLeg];
                    lg.forEach((l, i) => { if (l) l.rotation.x = S(t * 4 + (i < 2 ? 0 : Math.PI)) * 0.25 * stride; });
                    if (this.variant === 'lv_sandgecko' && !fast) this.model.position.y = this._baseY + Math.max(0, S(t * 1.6)) * 0.02 * this.scale; // push-ups
                    break;
                }
                case 'lv_deserttumbleweed': {
                    if (this.ball) this.ball.rotation.x += deltaTime * (fast ? 5 : 1.1);
                    if (this.jaw) this.jaw.rotation.x = A(S(t * (fast ? 10 : 2))) * 0.35;
                    this.model.position.y = this._baseY + A(S(t * (fast ? 6 : 2.2))) * 0.04 * this.scale;
                    break;
                }
                case 'lv_dunescorpling': {
                    if (this.tail) this.tail.rotation.x = fast ? -0.35 * A(S(t * 8)) : S(t * 1.3) * 0.06;
                    [this.pincerL, this.pincerR].forEach((g, i) => { if (g && g._claw && g._claw._f) g._claw._f.rotation.y = (i ? -1 : 1) * A(S(t * (fast ? 10 : 2) + i)) * 0.4; });
                    if (this._legs) this._legs.forEach((l, i) => { l.rotation.x = S(t * 6 + i * 0.9) * 0.18 * stride; });
                    break;
                }
                case 'lv_saltcrab':
                case 'lv_fishnetcrab': {
                    [this.leftClaw, this.rightClaw].forEach((g, i) => {
                        if (!g) return;
                        g.rotation.x = fast ? -0.45 * A(S(t * 7 + i)) : S(t * 1.2 + i) * 0.08;
                        const h = g._hand; if (h && h._f) h._f.rotation.y = (i ? -1 : 1) * A(S(t * (fast ? 9 : 2) + i)) * 0.35;
                        if (h && h._b) h._b.rotation.y = (i ? 1 : -1) * A(S(t * (fast ? 9 : 2) + i)) * 0.3;
                    });
                    if (this._legs) this._legs.forEach((l, i) => { l.rotation.z = S(t * 5 + i * 0.8) * 0.08 * (fast ? 1.5 : 0.4); });
                    this.model.position.x = baseX + S(t * 0.7) * 0.03 * this.scale;
                    break;
                }
                case 'lv_desertporcupine': {
                    if (this.spikes) { this.spikes.rotation.z = fast ? S(t * 40) * 0.025 : 0; const b = 1 + S(t * 1.5) * 0.02; this.spikes.scale.set(b, b, b); }
                    if (this.eyes) this.eyes.rotation.y = S(t * 0.8) * 0.1;
                    [this.leftClaw, this.rightLeg, this.rightClaw, this.leftLeg].forEach((l, i) => { if (l) l.rotation.x = S(t * 5 + (i < 2 ? 0 : Math.PI)) * 0.3 * stride; });
                    break;
                }
                case 'lv_manticorecub': {
                    if (this.leftWing) this.leftWing.rotation.z = S(t * (fast ? 12 : 2.4)) * 0.15;
                    if (this.rightWing) this.rightWing.rotation.z = -S(t * (fast ? 12 : 2.4)) * 0.15;
                    if (this.tail) { this.tail.rotation.y = S(t * 1.8) * 0.25; this.tail.rotation.x = fast ? 0.5 * A(S(t * 6)) : 0; }
                    if (this.head) this.head.rotation.z = S(t * 0.9) * 0.1;
                    [this.flPaw, this.rrLeg, this.frPaw, this.rlLeg].forEach((l, i) => { if (l) l.rotation.x = S(t * 5 + (i < 2 ? 0 : Math.PI)) * 0.3 * stride; });
                    break;
                }
                case 'lv_belltowergargoyle': {
                    if (this.drip) this.drip.scale.y = 1 + S(t * 3) * 0.25;
                    if (this.bell) this.bell.rotation.x = S(t * (fast ? 9 : 1.6)) * (fast ? 0.35 : 0.12);
                    if (this.head) this.head.rotation.y = S(t * 0.6) * 0.18;
                    [this.leftArm, this.rightArm].forEach((a, i) => { if (a) a.rotation.x = fast ? -0.6 * A(S(t * 6 + i * 1.5)) : 0; });
                    break;
                }
                case 'lv_voidferretkit': {
                    if (this.core) this.core.rotation.z = S(t * 0.7) * 0.25;
                    if (this.tendril) this.tendril.rotation.z = S(t * 1.9) * 0.3;
                    if (this.tail) this.tail.rotation.y = S(t * 2.2) * 0.3;
                    if (this.head) this.head.rotation.y = S(t * 1.3) * 0.2;
                    [this.leftLeg, this.rearRightLeg, this.rightLeg, this.rearLeftLeg].forEach((l, i) => { if (l) l.rotation.x = S(t * 6 + (i < 2 ? 0 : Math.PI)) * 0.3 * stride; });
                    break;
                }
                case 'lv_astraljellyfish': {
                    const pulse = S(t * (fast ? 5 : 1.6));
                    if (this.body) this.body.scale.set(1 + pulse * 0.06, 1 - pulse * 0.05, 1 + pulse * 0.06);
                    [this.tentacleOne, this.tentacleTwo].forEach((g, i) => { if (g) { g.rotation.x = S(t * 1.3 + i) * 0.15; g.rotation.z = (i ? -1 : 1) * (fast ? 0.3 * A(S(t * 7)) : S(t * 0.9 + i) * 0.08); } });
                    if (this._fringe) this._fringe.forEach((g, i) => { g.rotation.x = S(t * 1.6 + i) * 0.12; });
                    if (this.ring) this.ring.rotation.z = t * 0.8;
                    break;
                }
                case 'lv_lunarhopper': {
                    const hop = A(S(t * (fast ? 6 : 1.8)));
                    this.model.position.y = this._baseY + hop * (fast ? 0.25 : 0.04) * this.scale;
                    if (this.ears) this.ears.rotation.x = S(t * 3.1) * 0.1 - hop * 0.2;
                    if (this.rearLeftLeg) this.rearLeftLeg.rotation.x = hop * 0.4;
                    if (this.rearRightLeg) this.rearRightLeg.rotation.x = hop * 0.4;
                    break;
                }
                case 'lv_mallguardbot': {
                    if (this.head) this.head.rotation.y = S(t * (fast ? 4 : 0.9)) * 0.45;
                    if (this.siren) this.siren.rotation.y = t * 6;
                    if (this.keys) this.keys.rotation.z = S(t * 2.4) * 0.25;
                    if (this.leftArm) this.leftArm.rotation.x = fast ? -0.4 * A(S(t * 6)) : 0;
                    if (this.torchLens && this.torchLens.material) this.torchLens.material.emissiveIntensity = fast ? 1.8 : 0.6;
                    this.model.position.x = baseX + S(t * 0.5) * 0.03 * this.scale;
                    break;
                }
                case 'lv_looseboltbot': {
                    if (this.body) this.body.rotation.z = 0.12 + S(t * (fast ? 9 : 2.6)) * 0.05;
                    if (this.head) this.head.rotation.z = -0.2 + S(t * 3.3) * 0.12;
                    if (this.core) this.core.rotation.x += deltaTime * (fast ? 14 : 2);
                    if (this.jaw) this.jaw.rotation.x = 0.5 + S(t * 5) * 0.2;
                    [this.leftLeg, this.rightLeg].forEach((l, i) => { if (l) l.scale.y = 1 + S(t * (fast ? 10 : 3) + i * 1.6) * 0.06; });
                    if (this.rightArm) this.rightArm.rotation.x = fast ? -0.6 * A(S(t * 7)) : S(t * 1.4) * 0.1;
                    break;
                }
                case 'lv_plushbear': {
                    if (this.head) this.head.rotation.z = S(t * 0.8) * 0.12;
                    const hug = fast ? 0.35 * A(S(t * 5)) : S(t * 1.1) * 0.05;
                    if (this.leftArm) this.leftArm.rotation.y = -hug;
                    if (this.rightArm) this.rightArm.rotation.y = hug;
                    break;
                }
                case 'lv_sparkplugsprite': {
                    if (this.core) { const j = 1.1 + S(t * 37) * S(t * 23) * 0.3; this.core.scale.setScalar(j); if (this.core.material) this.core.material.emissiveIntensity = (fast ? 2.0 : 1.0) + A(S(t * 29)) * 0.8; }
                    [this.leftArm, this.rightArm, this.leftLeg, this.rightLeg].forEach((l, i) => { if (l) l.rotation.z = S(t * (fast ? 14 : 7) + i * 1.3) * 0.18; });
                    this.model.rotation.y = S(t * 0.8) * 0.3;
                    this.model.position.x = baseX + S(t * 2.2) * 0.04 * this.scale;
                    break;
                }
                case 'lv_plagueleech': {
                    if (this._segs) this._segs.forEach((m, i) => { m.scale.y = 0.8 * (1 + S(t * (fast ? 6 : 2.4) - i * 0.9) * 0.08); });
                    if (this.maw) { const k = 1 + (fast ? A(S(t * 9)) * 0.35 : S(t * 2) * 0.08); this.maw.scale.set(k, k, 1); }
                    if (this.sac && this.sac.material) this.sac.material.emissiveIntensity = 0.4 + A(S(t * 2.2)) * 0.6;
                    break;
                }
                case 'lv_coinpursemimic': {
                    const gape = fast ? 0.55 + S(t * 9) * 0.15 : 0.14 + Math.max(0, S(t * 0.7)) * 0.16;
                    if (this.lid) this.lid.rotation.x = -gape;
                    if (this.tongue) this.tongue.rotation.x = -gape * 0.4 + S(t * 3) * 0.05;
                    if (this.eyes) this.eyes.rotation.y = S(t * 1.1) * 0.15;
                    break;
                }
                case 'lv_morguecrawler': {
                    if (this._legs) this._legs.forEach((l, i) => { l.rotation.x = S(t * (fast ? 12 : 5) + i * 0.6) * 0.25; });
                    if (this.head) this.head.rotation.y = S(t * 1.4) * 0.15;
                    if (this._jaws) this._jaws.forEach((j, i) => { j.rotation.y = (i ? -1 : 1) * A(S(t * (fast ? 12 : 3))) * 0.35; });
                    break;
                }
                case 'lv_pizzaooze': {
                    const w = 1 + S(t * (fast ? 6 : 2)) * 0.06;
                    if (this.blob) this.blob.scale.set(1.15 * w, 0.38 / w, 1.15 * w);
                    if (this.core) this.core.scale.setScalar(0.8 + A(S(t * 1.7)) * 0.4);
                    [this.podL, this.podR].forEach((g, i) => { if (g) { g.rotation.x = fast ? -0.4 * A(S(t * 7 + i)) : S(t * 1.5 + i) * 0.1; } });
                    if (this.maw) this.maw.position.y = 0.25 - A(S(t * (fast ? 10 : 2))) * 0.02;
                    break;
                }
                case 'lv_pitrhinobeetle': {
                    if (this.head) this.head.rotation.x = fast ? -0.4 * A(S(t * 6)) : S(t * 1.1) * 0.05;
                    if (this._legs) this._legs.forEach((l, i) => { l.rotation.x = S(t * 6 + i * 1.7) * 0.2 * stride; });
                    break;
                }
                case 'lv_hoardwyrmling': {
                    if (this.sac) { const s = 1 + A(S(t * (fast ? 5 : 1.5))) * 0.15; this.sac.scale.set(s, 1.1 * s, 0.9 * s); if (this.sac.material) this.sac.material.emissiveIntensity = 0.4 + s - 1; }
                    if (this.head) this.head.rotation.y = S(t * 0.8) * 0.2;
                    if (this.jaw) this.jaw.rotation.x = fast ? A(S(t * 8)) * 0.4 : 0;
                    if (this.leftWing) this.leftWing.rotation.z = S(t * (fast ? 10 : 2)) * 0.12;
                    if (this.rightWing) this.rightWing.rotation.z = -S(t * (fast ? 10 : 2)) * 0.12;
                    if (this.tail) this.tail.rotation.y = S(t * 1.2) * 0.12;
                    break;
                }
                case 'lv_shadowpuddle': {
                    if (this.ripples) this.ripples.forEach((r, i) => { const k = (t * 0.4 + i * 0.5) % 1; r.scale.set(0.8 + k * 0.4, 0.8 + k * 0.4, 1); });
                    if (this.iris && this.iris.material) this.iris.material.emissiveIntensity = (fast ? 1.6 : 0.6) + S(t * 3) * 0.3;
                    [this.leftArm, this.rightArm].forEach((a, i) => { if (a) { a.rotation.x = fast ? 0.5 * A(S(t * 7 + i)) : S(t * 1.2 + i) * 0.1; a.rotation.z = (i ? -1 : 1) * S(t * 1.6 + i) * 0.1; } });
                    [this.leftLeg, this.rightLeg].forEach((l, i) => { if (l) l.rotation.y = (i ? -1 : 1) * S(t * 1.8 + i) * 0.2; });
                    break;
                }
                case 'lv_wishingtotem': {
                    if (this.ribbons) this.ribbons.forEach((r, i) => { r.rotation.z = S(t * 2.1 + i) * 0.25; r.rotation.x = S(t * 1.7 + i * 2) * 0.15; });
                    [this.leftArm, this.rightArm].forEach((a, i) => { if (a) a.rotation.z = (i ? -1 : 1) * (fast ? 0.6 * A(S(t * 7)) : S(t * 1.3) * 0.08); });
                    if (fast) this.model.position.y = this._baseY + A(S(t * 7)) * 0.06 * this.scale;
                    break;
                }
                case 'u_umbrallurker': {
                    if (this.leftWisp) this.leftWisp.rotation.x = fast ? 0.5 * A(S(t * 7)) : S(t * 1.1) * 0.12;
                    if (this.rightWisp) { this.rightWisp.rotation.z = S(t * 1.4) * 0.15; this.rightWisp.rotation.x = fast ? -0.4 * A(S(t * 7 + 1)) : 0; }
                    if (this.face) this.face.rotation.z = S(t * 0.7) * 0.12;
                    if (this.core && this.core.material) this.core.material.emissiveIntensity = (fast ? 1.6 : 0.6) + A(S(t * 2.3)) * 0.4;
                    break;
                }
                case 'u_bureaucraticnightmare': {
                    if (this.head) this.head.rotation.x = fast ? 0.4 * A(S(t * 8)) : 0;
                    if (this.rightArm) this.rightArm.rotation.x = fast ? -0.7 * A(S(t * 7)) : S(t * 1.3) * 0.08;
                    if (this.leftArm) this.leftArm.rotation.x = S(t * 1.1) * 0.06;
                    if (this.drawer) this.drawer.position.z = 0.2 + A(S(t * (fast ? 6 : 0.9))) * 0.05;
                    [this.leftLeg, this.rightLeg].forEach((l, i) => { if (l) l.rotation.x = S(t * 5 + i * Math.PI) * 0.3 * stride; });
                    break;
                }
                case 'u_offrampincarnate': {
                    if (this.leftWing) this.leftWing.rotation.z = -S(t * (fast ? 6 : 1.2)) * 0.12;
                    if (this.rightWing) this.rightWing.rotation.z = S(t * (fast ? 6 : 1.2)) * 0.12;
                    if (this.maw) this.maw.rotation.x = fast ? 0.5 * A(S(t * 8)) : A(S(t * 0.8)) * 0.1;
                    if (this.tail) this.tail.rotation.y = S(t * 0.8) * 0.1;
                    if (this.farLight && this.farLight.material) this.farLight.material.emissiveIntensity = 0.6 + A(S(t * 1.7)) * 1.2;
                    [this.leftClaw, this.rightClaw].forEach((c, i) => { if (c) c.rotation.x = fast ? -0.6 * A(S(t * 6 + i)) : S(t * 1.1 + i) * 0.06; });
                    break;
                }
                case 'u_varleniamirage': {
                    if (this.core) this.core.rotation.y = S(t * 0.4) * 0.3;
                    if (this.maw) { const k = 1 + (fast ? A(S(t * 9)) * 0.25 : S(t * 1.6) * 0.05); this.maw.scale.set(k, 1, k); }
                    [this.leftWisp, this.rightWisp].forEach((w, i) => { if (w) { w.rotation.z = (i ? -1 : 1) * S(t * 1.8 + i) * 0.2; w.rotation.x = S(t * 1.3 + i) * 0.15; } });
                    break;
                }
                case 'u_rimespinner': {
                    if (this.flake) this.flake.rotation.y += deltaTime * (fast ? 6 : 1.5);
                    [this.leftLeg, this.rightLeg].forEach(l => { if (l) l.rotation.x = fast ? -0.4 * A(S(t * 6)) : S(t * 1.2) * 0.08; });
                    if (this.head) this.head.rotation.y = S(t * 0.9) * 0.2;
                    [this.midLeftLeg, this.rearRightLeg, this.midRightLeg, this.rearLeftLeg].forEach((l, i) => { if (l) l.rotation.x = S(t * 5 + (i < 2 ? 0 : Math.PI)) * 0.25 * stride; });
                    break;
                }
                case 'u_thothsbrokenward': {
                    if (this.core) { this.core.rotation.y = t * (fast ? 3 : 0.8); this.core.rotation.x = S(t * 1.3) * 0.3; }
                    if (this.head) this.head.rotation.y = S(t * 0.6) * 0.2;
                    if (this.maw) this.maw.rotation.x = fast ? 0.5 * A(S(t * 7)) : 0;
                    [this.leftArm, this.rightArm].forEach((a, i) => { if (a) a.rotation.x = fast ? -0.6 * A(S(t * 6 + i)) : S(t * 1 + i) * 0.05; });
                    break;
                }
                case 'lv_centaurfoal': {
                    if (this.head) this.head.rotation.y = S(t * 0.9) * 0.25;
                    if (this.tail) this.tail.rotation.z = S(t * 2.2) * 0.2;
                    if (this.rightArm) this.rightArm.rotation.x = fast ? -1.2 * A(S(t * 6)) : S(t * 1.2) * 0.06;
                    const kick = fast ? A(S(t * 7)) * 0.6 : 0;
                    if (this.rearLeftLeg) this.rearLeftLeg.rotation.x = -kick + S(t * 5) * 0.25 * stride;
                    if (this.rearRightLeg) this.rearRightLeg.rotation.x = -kick - S(t * 5) * 0.25 * stride;
                    if (this.leftLeg) this.leftLeg.rotation.x = -S(t * 5) * 0.3 * stride;
                    if (this.rightLeg) this.rightLeg.rotation.x = S(t * 5) * 0.3 * stride;
                    break;
                }
            }
        }

        animatePose(deltaTime) {
            if (this._baseY === null) this._baseY = this.model.position.y;
            if (this._baseX === null) this._baseX = this.model.position.x;
            const t = this.animTime, anim = this.currentAnimation;
            let growth = 1.0;
            if (anim === 'spawn') growth = Math.min(1.0, t / 0.8);
            this.applyModelScale(growth);
            const fast = (anim === 'attack' || anim === 'specialattack');
            // Four-legged models only stride while really travelling (overworld
            // walk) or lunging on an attack; standing in battle they keep still.
            const stride = this.strideMul(fast);
            const floats = (this.variant === 'origami' || this.variant === 'mask' || this.variant === 'paperwork' || this.variant === 'sawblade' || this.variant === 'tidesculptor' || this.variant === 'obsidianvisionary' || this.variant === 'ochrejelly' || this.variant === 'enchantress' || this.variant === 'embersprite' || this.variant === 'frostelemental' || this.variant === 'giantjellyfish' || this.variant === 'fluxlingfurret' || this.variant === 'glimmershrimp' || this.variant === 'insectswarm' || this.variant === 'marshwraith' || this.variant === 'reaganite' || this.variant === 'seraphicemissary' || this.variant === 'shadowstalker' || this.variant === 'shadowwraith' || this.variant === 'stoneguardian' || this.variant === 'stormbanshee' || this.variant === 'thundersprite' || this.variant === 'lv_foldedairplane' || this.variant === 'lv_astraljellyfish' || this.variant === 'lv_sparkplugsprite' || this.variant === 'u_umbrallurker' || this.variant === 'u_varleniamirage');
            this.model.position.y = this._baseY + Math.sin(t * 1.3) * (floats ? 0.09 : 0.03) * this.scale;

            const baseX = this._baseX !== null ? this._baseX : this.model.position.x;
            if (this.variant.indexOf('lv_') === 0 || this.variant.indexOf('u_') === 0) this._animateLv(t, fast, stride, baseX, deltaTime);
            switch (this.variant) {
                case 'gunburger': {
                    if (this.head) this.head.rotation.y = Math.sin(t * (fast ? 5 : 1.4)) * 0.3; // surveillance scan
                    if (this.rightArm) { this.rightArm.rotation.x = fast ? Math.sin(t * 10) * 0.2 : 0; if (this.rightArm._muzzle && this.rightArm._muzzle.material) this.rightArm._muzzle.material.emissiveIntensity = (fast ? 1.6 : 0.5) + Math.sin(t * 6) * 0.4; }
                    if (this.antenna && this.antenna._blip && this.antenna._blip.material) this.antenna._blip.material.emissiveIntensity = 0.6 + Math.abs(Math.sin(t * (fast ? 9 : 4))) * 0.6;
                    break;
                }
                case 'sushisnail': {
                    this.model.position.x = baseX + Math.sin(t * 0.6) * 0.02 * this.scale;
                    if (this.t1) this.t1.rotation.z = Math.sin(t * 1.5) * 0.2;
                    if (this.t2) this.t2.rotation.z = -Math.sin(t * 1.5 + 0.5) * 0.2;
                    break;
                }
                case 'origami': {
                    const flap = Math.sin(t * (fast ? 12 : 5)) * 0.6;
                    if (this.leftArm) this.leftArm.rotation.z = 0.1 + flap;
                    if (this.rightArm) this.rightArm.rotation.z = -0.1 - flap;
                    this.model.rotation.z = Math.sin(t * 1.1) * 0.05;
                    break;
                }
                case 'candle': {
                    this._floaters.forEach((f) => { if (f._flame) { f.material.emissiveIntensity = (fast ? 1.8 : 0.9) + Math.sin(t * 14 + f.position.x * 9) * 0.5; const s = 1.0 + Math.sin(t * 16 + f.position.x * 7) * 0.2; f.scale.set(s, 1.0 / s, s); } });
                    if (this.head) this.head.rotation.z = Math.sin(t * 2) * 0.06;
                    break;
                }
                case 'pillow': {
                    const sway = fast ? Math.sin(t * 7) * 0.2 : Math.sin(t * 2) * 0.06;
                    if (this.leftArm) this.leftArm.rotation.x = sway;
                    if (this.rightArm) this.rightArm.rotation.x = -sway;
                    if (this.head) this.head.rotation.z = Math.sin(t * 1.5) * 0.05;
                    break;
                }
                case 'mask': {
                    this.model.rotation.z = Math.sin(t * 1.1) * 0.08;
                    if (this.tears) this.tears.children.forEach(tr => { tr.position.y -= 0.02; if (tr.position.y < 0.4) tr.position.y = 1.3; });
                    break;
                }
                case 'paperwork': {
                    if (this.papers) this.papers.rotation.y = t * (fast ? 2.5 : 1.0);
                    if (this.rightArm) this.rightArm.rotation.x = fast ? Math.abs(Math.sin(t * 9)) * 0.8 : Math.sin(t * 2) * 0.1;
                    if (this.head) this.head.rotation.y = Math.sin(t * 1.4) * 0.2;
                    break;
                }
                case 'trafficcone': {
                    const gape = fast ? (0.5 + Math.sin(t * 9) * 0.15) : Math.max(0, Math.sin(t * 0.6)) * 0.18;
                    if (this.lid) this.lid.rotation.x = -gape;
                    if (this.tongue) this.tongue.rotation.x = 0.5 + (fast ? Math.sin(t * 8) * 0.3 : 0);
                    break;
                }
                case 'sentientcone': {
                    // Nothing to open: it just rocks on its base and hops when
                    // riled, so the silhouette stays a plain traffic cone.
                    this.model.rotation.z = Math.sin(t * (fast ? 7 : 1.4)) * (fast ? 0.16 : 0.05);
                    if (fast) this.model.position.y = this._baseY + Math.abs(Math.sin(t * 7)) * 0.12 * this.scale;
                    break;
                }
                case 'walkingdoor': {
                    const speak = fast ? (0.35 + Math.abs(Math.sin(t * 7)) * 0.25) : (0.05 + Math.abs(Math.sin(t * 1.6)) * 0.12);
                    if (this.lid) this.lid.rotation.x = -speak;
                    if (this.tongue) this.tongue.rotation.x = 0.4 + speak * 0.5;
                    this.model.rotation.z = Math.sin(t * 1.3) * 0.04; // creak/sway
                    if (this.feet) this.feet.children.forEach((f, i) => { f.position.y = Math.abs(Math.sin(t * 2 + i * Math.PI)) * 0.05; });
                    break;
                }
                case 'baptismfont': {
                    if (this.water) { const r = 1.0 + Math.sin(t * (fast ? 6 : 3)) * 0.12; this.water.scale.set(r, 1, r); this.water.material.emissiveIntensity = 0.5 + Math.sin(t * 4) * 0.3; }
                    if (this.tongue) { this.tongue.rotation.z = Math.sin(t * (fast ? 5 : 2)) * 0.4; this.tongue.children.forEach((s, i) => { s.position.x = Math.sin(t * 3 + i * 0.6) * 0.04 * i; }); }
                    if (this.halo) { this.halo.rotation.z = t * 0.6; this.halo.position.y = 2.0 + Math.sin(t * 1.5) * 0.06; }
                    break;
                }
                case 'sawblade': {
                    if (this.bladeSpin) this.bladeSpin.rotation.z += (fast ? 22 : 9) * deltaTime;
                    if (this.sensorArray && this.sensorArray.children[0]) this.sensorArray.children[0].rotation.y = Math.sin(t * 2) * 0.3;
                    this.model.rotation.z = Math.sin(t * 4) * 0.03; // wobble
                    break;
                }
                case 'hairball': {
                    this.model.rotation.z += (fast ? 3.2 : 1.4) * deltaTime; // tumble
                    this.model.rotation.x = Math.sin(t * 1.1) * 0.2;
                    this.model.position.y = this._baseY + Math.abs(Math.sin(t * (fast ? 6 : 3))) * 0.08 * this.scale;
                    if (this.spinSpines) this.spinSpines.children.forEach((s, i) => { s.rotation.z = Math.sin(t * 4 + i) * 0.15; });
                    break;
                }
                case 'tidesculptor': {
                    if (this.waterOrbs) this.waterOrbs.forEach((o) => { const a = o._a + t * (fast ? 2.4 : 1.1); o.position.set(Math.cos(a) * o._r, o._h + Math.sin(t * 2 + o._a) * 0.15, Math.sin(a) * o._r * 0.5); o.material.emissiveIntensity = 0.5 + Math.sin(t * 4 + o._a) * 0.4; });
                    if (this.head) this.head.rotation.y = Math.sin(t * 1.2) * 0.25;
                    if (this.tongue) this.tongue.rotation.x = 1.2 + (fast ? Math.sin(t * 9) * 0.5 : Math.sin(t * 2) * 0.15);
                    break;
                }
                case 'forestcentaur': {
                    const draw = fast ? Math.abs(Math.sin(t * 6)) * 0.3 : 0.1 + Math.sin(t * 1.5) * 0.05;
                    if (this.rightArm) this.rightArm.position.z = 0.45 - draw;
                    if (this.arrow) this.arrow.position.z = 0.18 + (fast && Math.sin(t * 6) > 0.9 ? 0.5 : 0);
                    if (this.head) this.head.rotation.y = Math.sin(t * 0.9) * 0.15;
                    [this.leftLeg, this.rightLeg, this.rearLeftLeg, this.rearRightLeg].forEach((l, i) => { if (l) l.rotation.x = Math.sin(t * 2 + i * 1.6) * (fast ? 0.18 : 0.05) * stride; });
                    break;
                }
                case 'obsidianvisionary': {
                    if (this.shards) this.shards.forEach((s) => { const a = s._a + t * s._sp * (fast ? 2.2 : 1.0); s.position.set(Math.cos(a) * s._r, s._h + Math.sin(t * 1.5 + s._a) * 0.2, Math.sin(a) * s._r); s.rotation.set(t * 1.3 + s._a, t * 0.9, 0); });
                    if (this.core && this.core.children[1] && this.core.children[1].material) this.core.children[1].material.emissiveIntensity = (fast ? 1.4 : 0.7) + Math.sin(t * 5) * 0.4;
                    this.model.rotation.y = Math.sin(t * 0.6) * 0.15;
                    break;
                }
                case 'ochrejelly': {
                    const wob = 1.0 + Math.sin(t * (fast ? 5 : 2.5)) * 0.08;
                    if (this.body) this.body.scale.set(1.1 * wob, 0.9 / wob, 1.1 * wob);
                    if (this.head) this.head.position.y = 1.45 + Math.sin(t * 2.5) * 0.06;
                    [this.leftArm, this.rightArm, this.leftLeg, this.rightLeg].forEach((ps, i) => { if (ps) { ps.rotation.z = Math.sin(t * (fast ? 7 : 3) + i * 1.5) * (fast ? 0.6 : 0.3); ps.rotation.x = Math.cos(t * 2.4 + i) * 0.2; } });
                    break;
                }
                case 'barbedmanticore': {
                    if (this.tail) { this.tail.rotation.z = (fast ? -0.5 : 0) + Math.sin(t * (fast ? 6 : 2)) * (fast ? 0.4 : 0.18); }
                    if (this.stinger && this.stinger.material) this.stinger.material.emissiveIntensity = 0.5 + Math.abs(Math.sin(t * 3)) * 0.6;
                    if (this.head) this.head.rotation.x = Math.sin(t * 1.4) * 0.08 + (fast ? -0.15 : 0);
                    [this.leftEye, this.rightEye].forEach(e => { if (e && e.children[0] && e.children[0].material) e.children[0].material.emissiveIntensity = 0.6 + Math.sin(t * 4) * 0.4; });
                    const flap = fast ? Math.sin(t * 8) * 0.3 : Math.sin(t * 1.8) * 0.12;
                    if (this.lWing) this.lWing.rotation.z = -0.2 - flap; if (this.rWing) this.rWing.rotation.z = 0.2 + flap;
                    break;
                }
                case 'nobleguardian': {
                    if (this._visor && this._visor.material) this._visor.material.emissiveIntensity = (fast ? 1.5 : 0.7) + Math.sin(t * (fast ? 8 : 3)) * 0.4;
                    if (this._reactor && this._reactor.material) this._reactor.material.emissiveIntensity = 0.6 + Math.sin(t * 2.5) * 0.3;
                    if (this.cannon) { this.cannon.rotation.x = fast ? -0.2 + Math.sin(t * 12) * 0.08 : Math.sin(t * 1.5) * 0.05; if (this._muzzle && this._muzzle.material) this._muzzle.material.emissiveIntensity = (fast ? 1.8 : 0.4) + Math.abs(Math.sin(t * 9)) * 0.6; }
                    if (this.head) this.head.rotation.y = Math.sin(t * (fast ? 4 : 1.2)) * 0.2;
                    break;
                }
                case 'forestarcher': {
                    const draw = fast ? Math.abs(Math.sin(t * 7)) * 0.25 : 0.05 + Math.sin(t * 1.6) * 0.04;
                    if (this.rightArm) this.rightArm.position.x = -draw;
                    if (this.arrow) this.arrow.position.x = -0.05 - draw;
                    if (this.string) this.string.scale.x = 1.0 + draw * 2;
                    if (this.body) this.body.rotation.y = Math.sin(t * 0.8) * 0.08;
                    break;
                }
                case 'enchantress': {
                    if (this.lures) this.lures.forEach((o) => { const a = o._a + t * (fast ? 2.0 : 0.9); o.position.set(Math.cos(a) * o._r, o._h + Math.sin(t * 1.8 + o._a) * 0.2, Math.sin(a) * o._r * 0.6 + 0.1); o.material.emissiveIntensity = 0.5 + Math.abs(Math.sin(t * 3 + o._a)) * 0.6; });
                    if (this.head) this.head.rotation.z = Math.sin(t * 1.3) * 0.12;
                    if (this.t1) this.t1.rotation.z = Math.sin(t * (fast ? 5 : 2)) * 0.3;
                    if (this.t2) this.t2.rotation.z = -Math.sin(t * (fast ? 5 : 2) + 0.5) * 0.3;
                    if (this.body) this.body.rotation.y = Math.sin(t * 0.7) * 0.1;
                    break;
                }
                case 'embersprite': {
                    const flap = Math.sin(t * (fast ? 22 : 14));
                    if (this.lWing) this.lWing.rotation.y = flap * 0.5; if (this.rWing) this.rWing.rotation.y = -flap * 0.5;
                    if (this.dustSac && this.dustSac.material) this.dustSac.material.emissiveIntensity = (fast ? 1.5 : 0.8) + Math.sin(t * 6) * 0.4;
                    if (this.sparks) this.sparks.forEach((s) => { const a = s._a + t * 1.5; s.position.set(Math.cos(a) * s._r, s._h + Math.sin(t * 3 + s._a) * 0.2, Math.sin(a) * s._r); });
                    if (this.head) this.head.rotation.z = Math.sin(t * 2) * 0.1;
                    break;
                }
                case 'flamefrake': {
                    const flap = fast ? Math.sin(t * 9) * 0.4 : Math.sin(t * 2.2) * 0.18;
                    if (this.lWing) this.lWing.rotation.z = -0.2 - flap; if (this.rWing) this.rWing.rotation.z = 0.2 + flap;
                    if (this.fireOrgan && this.fireOrgan.material) { const s = 1 + (fast ? 0.6 : 0.2) * Math.abs(Math.sin(t * 6)); this.fireOrgan.scale.set(s, s, s); this.fireOrgan.material.emissiveIntensity = (fast ? 1.8 : 0.7) + Math.sin(t * 8) * 0.4; }
                    if (this.tail) this.tail.rotation.z = Math.sin(t * 1.6) * 0.15;
                    if (this.head) this.head.rotation.y = Math.sin(t * 1.2) * 0.15;
                    break;
                }
                case 'flameturret': {
                    if (this.head) this.head.rotation.y = fast ? Math.sin(t * 4) * 0.5 : Math.sin(t * 0.8) * 0.7; // sweep scan
                    if (this._muzzle && this._muzzle.material) this._muzzle.material.emissiveIntensity = (fast ? 1.9 : 0.4) + Math.abs(Math.sin(t * (fast ? 12 : 4))) * 0.6;
                    if (this._coreRing && this._coreRing.material) this._coreRing.material.emissiveIntensity = 0.5 + Math.sin(t * 3) * 0.3;
                    break;
                }
                case 'fluxlingfurret': {
                    // Phase in and out of reality.
                    const phase = 0.4 + Math.abs(Math.sin(t * (fast ? 6 : 2.5))) * 0.6;
                    // Every body material, not only the ones already standing in
                    // the transparent queue: a solid one is put back in the opaque
                    // queue at build time (armFadeOnDemand) and rejoins the
                    // transparent one the moment its opacity is driven under 1.
                    for (const m of this._materials) m.opacity = phase;
                    if (this.motes) this.motes.forEach((m) => { const a = m._a + t * 2.2; m.position.set(Math.cos(a) * m._r, m._h + Math.sin(t * 2.5 + m._a) * 0.25, Math.sin(a) * m._r); });
                    this.model.rotation.y = Math.sin(t * 1.3) * 0.3;
                    if (this.tail) this.tail.rotation.z = -0.9 + Math.sin(t * 4) * 0.2;
                    break;
                }
                case 'foresttreant': {
                    const swing = fast ? Math.sin(t * 5) * 0.5 : Math.sin(t * 1.4) * 0.12;
                    if (this.branch1) this.branch1.rotation.z = swing; if (this.branch2) this.branch2.rotation.z = -swing;
                    if (this.crown) this.crown.rotation.y = Math.sin(t * 0.7) * 0.08;
                    this.model.rotation.z = Math.sin(t * 0.9) * 0.03;
                    break;
                }
                case 'forestwitch': {
                    if (this.staffOrb && this.staffOrb.material) this.staffOrb.material.emissiveIntensity = (fast ? 1.5 : 0.7) + Math.sin(t * 5) * 0.4;
                    if (this.hair) this.hair.children.forEach((v, i) => { v.rotation.z = Math.sin(t * (fast ? 5 : 2.5) + i) * 0.3; v.rotation.x = Math.cos(t * 2 + i) * 0.15; });
                    if (this.upper) this.upper.rotation.y = Math.sin(t * 1.1) * 0.12;
                    break;
                }
                case 'frostelemental': {
                    if (this.core && this.core.material) this.core.material.emissiveIntensity = (fast ? 1.6 : 0.8) + Math.sin(t * 4) * 0.4;
                    if (this.upper) this.upper.rotation.y = t * (fast ? 1.5 : 0.6);
                    if (this.lower) this.lower.rotation.y = -t * (fast ? 1.2 : 0.5);
                    const pulse = fast ? Math.sin(t * 7) * 0.2 : 0;
                    if (this.leftApp) this.leftApp.rotation.z = 0.1 + pulse; if (this.rightApp) this.rightApp.rotation.z = -0.1 - pulse;
                    if (this.motes) this.motes.forEach((m) => { const a = m._a + t * 0.8; m.position.set(Math.cos(a) * m._r, m._h + Math.sin(t * 1.5 + m._a) * 0.2, Math.sin(a) * m._r); });
                    break;
                }
                case 'spider': {
                    if (this._legs) this._legs.forEach((l, i) => { l.rotation.x = Math.sin(t * (fast ? 9 : 3.5) + l._lift * Math.PI + i * 0.3) * (fast ? 0.3 : 0.12); });
                    if (this.fangs) this.fangs.rotation.x = fast ? Math.abs(Math.sin(t * 8)) * 0.4 : 0;
                    if (this.abdomen) this.abdomen.position.y = 0.85 + Math.sin(t * 2) * 0.03;
                    this.model.position.y = this._baseY + Math.sin(t * 2.5) * 0.02 * this.scale;
                    break;
                }
                case 'giantjellyfish': {
                    const pump = 1.0 + Math.sin(t * (fast ? 4 : 2)) * 0.12;
                    if (this.body) this.body.scale.set(pump, 0.85 / pump, pump);
                    if (this.eyeGrp && this.eyeGrp.children[0] && this.eyeGrp.children[0].material) this.eyeGrp.children[0].material.emissiveIntensity = 0.5 + Math.sin(t * 3) * 0.4;
                    if (this.tentacles) this.tentacles.forEach((te, i) => { te.rotation.z = Math.sin(t * (fast ? 4 : 1.8) + i * 0.7) * 0.2; te.rotation.x = Math.cos(t * 1.5 + i) * 0.15; });
                    break;
                }
                case 'giantscorpion': {
                    const tailRaise = fast ? -0.3 + Math.sin(t * 6) * 0.3 : Math.sin(t * 1.5) * 0.12;
                    if (this.tail) this.tail.rotation.z = tailRaise;
                    if (this.stinger && this.stinger.material) this.stinger.material.emissiveIntensity = 0.4 + Math.abs(Math.sin(t * 3)) * 0.5;
                    const snap = fast ? Math.abs(Math.sin(t * 10)) * 0.4 : Math.sin(t * 1.8) * 0.1;
                    if (this.pincerL && this.pincerL._claw) this.pincerL._claw.rotation.z = -Math.PI / 2 + snap; if (this.pincerR && this.pincerR._claw) this.pincerR._claw.rotation.z = -Math.PI / 2 + snap;
                    if (this._legs) this._legs.forEach((l, i) => { l.rotation.x = Math.sin(t * (fast ? 8 : 3) + l._lift * Math.PI + i * 0.3) * (fast ? 0.25 : 0.1); });
                    break;
                }
                case 'glaciercrab': {
                    const snap = fast ? Math.abs(Math.sin(t * 9)) * 0.6 : Math.max(0, Math.sin(t * 1.2)) * 0.3;
                    if (this.clawL && this.clawL._upper) this.clawL._upper.rotation.z = -this.clawL._s * Math.PI / 2 - snap;
                    if (this.clawR && this.clawR._upper) this.clawR._upper.rotation.z = -this.clawR._s * Math.PI / 2 - snap * 0.6;
                    if (this.antennae) this.antennae.rotation.z = Math.sin(t * 2) * 0.08;
                    this.model.position.x = baseX + Math.sin(t * 1.4) * 0.03 * this.scale; // sidle
                    break;
                }
                case 'glimmershrimp': {
                    if (this.lights) this.lights.forEach((o) => { const a = o._a + t * (fast ? 2.5 : 1.3); o.position.set(Math.cos(a) * o._r, o._h + Math.sin(t * 2 + o._a) * 0.2, Math.sin(a) * o._r * 0.6); o.material.emissiveIntensity = 0.6 + Math.sin(t * 5 + o._a) * 0.4; });
                    if (this.abdomen) this.abdomen.rotation.z = Math.sin(t * 2.5) * 0.12;
                    if (this.antennae) this.antennae.rotation.z = Math.sin(t * 1.6) * 0.1;
                    break;
                }
                case 'goldenmimic': {
                    const gape = fast ? (0.5 + Math.sin(t * 9) * 0.2) : Math.max(0, Math.sin(t * 0.6)) * 0.25;
                    if (this.lid) this.lid.rotation.x = -gape;
                    if (this.tongue) this.tongue.rotation.x = 0.4 + (fast ? Math.sin(t * 8) * 0.3 : 0);
                    if (this.feet) this.feet.children.forEach((f, i) => { f.position.y = 0.1 + (fast ? Math.abs(Math.sin(t * 6 + i * Math.PI)) * 0.06 : 0); });
                    break;
                }
                case 'holographicdecoy': {
                    // Flicker + scanline drift.
                    const flick = (Math.sin(t * 13) > 0.85 || Math.sin(t * 31) > 0.9) ? 0.15 : (0.45 + Math.sin(t * 4) * 0.15);
                    for (const m of this._materials) m.opacity = flick;   // see fluxlingfurret
                    if (this.scanlines) this.scanlines.children.forEach((r, i) => { r.position.y = 0.5 + ((i * 0.35 + t * 0.6) % 1.8); });
                    if (this._beam && this._beam.material) this._beam.material.opacity = 0.15 + Math.abs(Math.sin(t * 3)) * 0.2;
                    if (this.head) this.head.rotation.y = Math.sin(t * 1.5) * 0.2;
                    break;
                }
                case 'icekangaroo': {
                    const jab = fast ? Math.abs(Math.sin(t * 11)) * 0.7 : Math.sin(t * 1.8) * 0.15;
                    if (this.pincerL) this.pincerL.rotation.x = -jab; if (this.pincerR) this.pincerR.rotation.x = -jab * 0.5 - (fast ? Math.abs(Math.sin(t * 11 + 1.5)) * 0.5 : 0);
                    if (this.stinger && this.stinger.material) this.stinger.material.emissiveIntensity = 0.4 + Math.sin(t * 4) * 0.3;
                    if (this.head) this.head.rotation.x = Math.sin(t * 1.4) * 0.06;
                    this.model.position.y = this._baseY + Math.abs(Math.sin(t * (fast ? 5 : 2))) * 0.04 * this.scale; // bounce
                    break;
                }
                case 'insectswarm': {
                    if (this._bugs) this._bugs.forEach((b) => { const a = b._a + t * b._sp; b.position.set(Math.cos(a) * b._r, b._h + Math.sin(t * 2 + b._ph) * 0.4, Math.sin(a) * b._r); b.rotation.y = a + Math.PI / 2; b.children.forEach((w, wi) => { if (wi > 0) w.rotation.x = Math.sin(t * 40 + b._ph) * 0.8; }); });
                    break;
                }
                case 'junkrat': {
                    if (this.heart && this.heart.material) { const s = 1 + Math.sin(t * 3) * 0.2; this.heart.scale.set(s, s, s); this.heart.material.emissiveIntensity = 0.6 + Math.sin(t * 3) * 0.4; }
                    if (this.tail) this.tail.rotation.z = 1.0 + Math.sin(t * 2.2) * 0.2;
                    if (this.head) this.head.rotation.y = Math.sin(t * (fast ? 5 : 1.5)) * 0.2;
                    if (this.body) this.body.position.y = Math.sin(t * 2) * 0.02;
                    break;
                }
                case 'kangaroo': {
                    const hop = Math.abs(Math.sin(t * (fast ? 5 : 2.2)));
                    this.model.position.y = this._baseY + hop * (fast ? 0.12 : 0.05) * this.scale;
                    if (this.tail) this.tail.rotation.z = Math.sin(t * 2.2) * 0.12;
                    if (this.leftLeg) this.leftLeg.rotation.x = (fast ? Math.sin(t * 10) * 0.5 : 0); if (this.rightLeg) this.rightLeg.rotation.x = (fast ? -Math.sin(t * 10) * 0.5 : 0);
                    if (this.head) this.head.rotation.x = Math.sin(t * 1.6) * 0.06;
                    break;
                }
                case 'komododragon': {
                    if (this.tongue) { const flick = Math.sin(t * 6) > 0.5; this.tongue.scale.z = flick ? 1.4 : 0.2; }
                    if (this._jaw) this._jaw.rotation.x = fast ? Math.abs(Math.sin(t * 7)) * 0.4 : 0.05 + Math.abs(Math.sin(t * 1.2)) * 0.08;
                    if (this.tail) this.tail.rotation.y = Math.sin(t * 1.4) * 0.3;
                    if (this.head) this.head.rotation.y = Math.sin(t * 1.0) * 0.12;
                    [this.leftArm, this.rightArm, this.leftLeg, this.rightLeg].forEach((l, i) => { if (l) l.rotation.x = Math.sin(t * (fast ? 6 : 2.5) + i * 1.6) * (fast ? 0.2 : 0.08); });
                    break;
                }
                case 'magmaant': {
                    if (this.mandibles) this.mandibles.children.forEach((m, i) => { m.rotation.z = (i ? -1 : 1) * (fast ? Math.abs(Math.sin(t * 9)) * 0.5 : Math.sin(t * 2) * 0.15); });
                    if (this._legs) this._legs.forEach((l, i) => { l.rotation.x = Math.sin(t * (fast ? 9 : 4) + l._lift * Math.PI + i * 0.3) * (fast ? 0.3 : 0.12); });
                    if (this.abdomen) this.abdomen.children.forEach(v => { if (v.material) v.material.emissiveIntensity = 0.5 + Math.sin(t * 4 + v.position.x * 8) * 0.4; });
                    break;
                }
                case 'marshwraith': {
                    if (this.core && this.core.material) this.core.material.emissiveIntensity = (fast ? 1.4 : 0.7) + Math.sin(t * 4) * 0.4;
                    if (this.leftWisp) this.leftWisp.rotation.z = 0.2 + Math.sin(t * (fast ? 4 : 2)) * 0.3; if (this.rightWisp) this.rightWisp.rotation.z = -0.2 - Math.sin(t * (fast ? 4 : 2) + 0.5) * 0.3;
                    if (this.face) this.face.rotation.z = Math.sin(t * 1.1) * 0.08;
                    this.model.rotation.y = Math.sin(t * 0.6) * 0.12;
                    break;
                }
                case 'mindleech': {
                    if (this.mandibles) this.mandibles.rotation.z = t * (fast ? 3 : 1.2);
                    if (this.head) { this.head.position.z = (fast ? Math.abs(Math.sin(t * 8)) * 0.15 : 0); this.head.rotation.y = -0.3 + Math.sin(t * 1.5) * 0.15; }
                    if (this.abdomen) { const s = 1 + Math.sin(t * 2.5) * 0.08; this.abdomen.scale.set(s, s, s); }
                    if (this._legs) this._legs.forEach((l, i) => { l.rotation.z = Math.sin(t * (fast ? 6 : 3) + i) * 0.3; });
                    break;
                }
                case 'mirespider': {
                    if (this._legs) this._legs.forEach((l, i) => { l.rotation.x = Math.sin(t * (fast ? 7 : 3) + i * 0.8) * 0.18; });
                    if (this.sacs) this.sacs.forEach((s, i) => { const k = 1 + Math.sin(t * 2 + i) * 0.12; s.scale.set(k, k, k); });
                    if (this.fangs) this.fangs.rotation.x = fast ? Math.abs(Math.sin(t * 9)) * 0.4 : 0;
                    break;
                }
                case 'monitorlizard': {
                    if (this.tongue) this.tongue.scale.z = 1 + Math.abs(Math.sin(t * (fast ? 8 : 2.5))) * 1.2;
                    if (this.tail) this.tail.rotation.y = Math.sin(t * (fast ? 4 : 1.6)) * 0.35;
                    if (this.head) this.head.rotation.z = Math.sin(t * 1.4) * 0.06;
                    break;
                }
                case 'monstrousbadger': {
                    if (this.head) this.head.rotation.x = (fast ? Math.abs(Math.sin(t * 7)) * 0.3 : Math.sin(t * 1.6) * 0.06) - 0.05;
                    this.model.position.x = baseX + Math.sin(t * 0.7) * 0.02 * this.scale;
                    if (this.tail) this.tail.rotation.z = Math.sin(t * 2) * 0.2;
                    break;
                }
                case 'mutantbug': {
                    if (this.bodySeg) this.bodySeg.children.forEach((c, i) => { c.position.y = 0.5 + Math.sin(t * (fast ? 8 : 4) + i * 0.7) * 0.05; });
                    if (this.heart) { const s = 1 + Math.sin(t * 4) * 0.12; this.heart.scale.set(s, s, s); }
                    break;
                }
                case 'overworkedvillager': {
                    if (this.head) this.head.rotation.x = 0.25 + Math.sin(t * 0.8) * 0.08; // weary nodding
                    this.model.rotation.z = Math.sin(t * 0.5) * 0.03;
                    if (this.rightArm) this.rightArm.rotation.x = fast ? Math.abs(Math.sin(t * 6)) * 0.6 : Math.sin(t * 0.9) * 0.06;
                    break;
                }
                case 'primalkangaroo': {
                    if (this.jaw) this.jaw.rotation.x = (fast ? Math.abs(Math.sin(t * 9)) : Math.abs(Math.sin(t * 2))) * 0.4; // gnashing
                    this.model.position.y = this._baseY + Math.abs(Math.sin(t * (fast ? 5 : 2))) * 0.06 * this.scale;
                    if (this.tail) this.tail.rotation.x = 1.3 + Math.sin(t * 2) * 0.08;
                    break;
                }
                case 'quagmirecreeper': {
                    if (this.bodySeg) this.bodySeg.children.forEach((c, i) => { c.position.x += Math.sin(t * (fast ? 6 : 2.5) + i * 0.6) * 0.004; });
                    if (this.teeth) this.teeth.rotation.z = t * (fast ? 3 : 1.2);
                    if (this.head) this.head.rotation.z = -0.6 + Math.sin(t * 2) * 0.1;
                    break;
                }
                case 'rabidjackrabbit': {
                    if (this.ears) this.ears.children.forEach((e, i) => { e.rotation.z = (i === 0 ? -1 : 1) * (0.18 + Math.sin(t * (fast ? 9 : 4) + i) * 0.2); });
                    if (this.foam) this.foam.children.forEach((f, i) => { f.position.y -= 0.012; if (f.position.y < -0.3) f.position.y = -0.12; });
                    this.model.position.y = this._baseY + Math.abs(Math.sin(t * (fast ? 6 : 3))) * 0.05 * this.scale;
                    break;
                }
                case 'reaganite': {
                    if (this.shield) this.shield.rotation.y = t * (fast ? 2.5 : 1.0);
                    if (this.focus) this.focus.rotation.y = Math.sin(t * 1.5) * 0.4;
                    if (this.core && this.core.material) this.core.material.emissiveIntensity = 0.4 + Math.sin(t * 3) * 0.3;
                    break;
                }
                case 'ribcagecrab': {
                    if (this.clawL) this.clawL.rotation.y = (fast ? Math.abs(Math.sin(t * 8)) * 0.5 : Math.sin(t * 2) * 0.15);
                    if (this.clawR) this.clawR.rotation.y = -(fast ? Math.abs(Math.sin(t * 8 + 1)) * 0.5 : Math.sin(t * 2 + 1) * 0.15);
                    if (this.heart) { const s = 1 + Math.sin(t * 5) * 0.18; this.heart.scale.set(s, s, s); }
                    break;
                }
                case 'securitybot': {
                    if (this.head) this.head.rotation.y = Math.sin(t * (fast ? 5 : 1.6)) * 0.4; // scanning
                    if (this.optic && this.optic.material) this.optic.material.emissiveIntensity = 0.5 + Math.abs(Math.sin(t * (fast ? 8 : 3))) * 0.6;
                    if (this.rightArm) this.rightArm.rotation.x = fast ? Math.sin(t * 10) * 0.5 : Math.sin(t * 1.5) * 0.08;
                    if (this.batonTip && this.batonTip.material) this.batonTip.material.emissiveIntensity = (fast ? 1.6 : 0.5) + Math.sin(t * 12) * 0.5;
                    break;
                }
                case 'seraphicemissary': {
                    const flap = Math.sin(t * (fast ? 8 : 3)) * 0.4;
                    if (this.leftWing) this.leftWing.rotation.y = 0.2 + flap;
                    if (this.rightWing) this.rightWing.rotation.y = -0.2 - flap;
                    if (this.halo) this.halo.rotation.z = t * 0.8;
                    if (this.halo && this.halo.material) this.halo.material.emissiveIntensity = 0.5 + Math.sin(t * 3) * 0.3;
                    break;
                }
                case 'shadowcrawler': {
                    if (this._legs) this._legs.forEach((l, i) => { l.rotation.x = Math.sin(t * (fast ? 8 : 4) + i * 0.9) * 0.22; });
                    if (this.mandibles) this.mandibles.rotation.x = fast ? Math.abs(Math.sin(t * 10)) * 0.4 : Math.sin(t * 2) * 0.1;
                    this._materials.forEach(m => { m.opacity = 0.55 + Math.sin(t * 1.5) * 0.22; }); // phasing, see fluxlingfurret
                    break;
                }
                case 'shadowstalker': {
                    if (this.leftWisp) this.leftWisp.rotation.z = 0.1 + Math.sin(t * (fast ? 7 : 2.5)) * 0.3;
                    if (this.rightWisp) this.rightWisp.rotation.z = -0.1 - Math.sin(t * (fast ? 7 : 2.5) + 0.5) * 0.3;
                    if (this.face) this.face.rotation.y = Math.sin(t * 1.3) * 0.25;
                    break;
                }
                case 'shadowwraith': {
                    if (this.tatters) this.tatters.children.forEach((tr, i) => { tr.rotation.z = Math.sin(t * (fast ? 5 : 2) + i) * 0.25; });
                    if (this.leftWisp) this.leftWisp.rotation.z = 0.1 + Math.sin(t * 3) * 0.4;
                    if (this.rightWisp) this.rightWisp.rotation.z = -0.1 - Math.sin(t * 3 + 0.7) * 0.4;
                    this.model.rotation.z = Math.sin(t * 0.9) * 0.05;
                    break;
                }
                case 'spectralwardstone': {
                    if (this.eyes) { this.eyes.rotation.y = t * (fast ? 2.5 : 1.0); this.eyes.position.y = 1.75 + Math.sin(t * 1.6) * 0.05; }
                    if (this.runes) this.runes.children.forEach((r, i) => { if (r.material) r.material.emissiveIntensity = 0.4 + Math.abs(Math.sin(t * 2 + i)) * 0.5; });
                    if (this.leftArm) this.leftArm.position.y = 1.1 + Math.sin(t * 1.8) * 0.06;
                    if (this.rightArm) this.rightArm.position.y = 1.1 + Math.sin(t * 1.8 + 1) * 0.06;
                    break;
                }
                case 'spinedlizard': {
                    if (this.tail) this.tail.rotation.y = Math.sin(t * (fast ? 5 : 1.8)) * 0.4;
                    if (this.spines) this.spines.children.forEach((s, i) => { s.scale.y = 1 + (fast ? Math.abs(Math.sin(t * 7 + i)) * 0.4 : 0); });
                    if (this.head) this.head.rotation.z = Math.sin(t * 1.4) * 0.05;
                    break;
                }
                case 'spinysprinter': {
                    this.model.position.y = this._baseY + Math.abs(Math.sin(t * (fast ? 7 : 3))) * 0.05 * this.scale; // scurrying
                    if (this.spikes) this.spikes.scale.setScalar(fast ? 1.15 + Math.sin(t * 9) * 0.1 : 1.0);
                    this.model.rotation.y = (this.facingYaw || 0) + Math.sin(t * 2) * 0.08;
                    break;
                }
                case 'stoneguardian': {
                    if (this.leftArm) this.leftArm.position.y = 1.0 + Math.sin(t * (fast ? 5 : 1.6)) * 0.08;
                    if (this.rightArm) this.rightArm.position.y = 1.0 + Math.sin(t * (fast ? 5 : 1.6) + Math.PI) * 0.08;
                    if (this.core) this.core.rotation.y = Math.sin(t * 0.8) * 0.08;
                    break;
                }
                case 'stormbanshee': {
                    [this.leftArm, this.rightArm, this.leftLeg, this.rightLeg].forEach((l, i) => { if (l) l.rotation.z = Math.sin(t * (fast ? 9 : 4) + i) * 0.25; });
                    if (this.core && this.core.material) { this.core.material.emissiveIntensity = (fast ? 1.8 : 0.8) + Math.sin(t * 12) * 0.6; const s = 1 + Math.sin(t * 6) * 0.15; this.core.scale.set(s, s, s); }
                    if (this.face) this.face.rotation.z = Math.sin(t * 2) * 0.08;
                    break;
                }
                case 'stormcaller': {
                    if (this.staffOrb && this.staffOrb.material) this.staffOrb.material.emissiveIntensity = (fast ? 1.8 : 0.7) + Math.abs(Math.sin(t * (fast ? 10 : 4))) * 0.6;
                    if (this.rightArm) this.rightArm.rotation.x = fast ? -0.6 + Math.sin(t * 8) * 0.3 : Math.sin(t * 1.5) * 0.08;
                    if (this.core) this.core.rotation.y = t * 1.5;
                    break;
                }
                case 'swampcrocodile': {
                    if (this.head) this.head.children.forEach(c => { if (c.position.y < -0.05) c.rotation.x = (fast ? Math.abs(Math.sin(t * 8)) : Math.abs(Math.sin(t * 1.5))) * 0.3; }); // jaw chomp on lower parts
                    if (this.tail) this.tail.children.forEach((s, i) => { s.position.z = Math.sin(t * (fast ? 5 : 2) - i * 0.5) * 0.12; });
                    this.model.position.x = baseX + Math.sin(t * 0.6) * 0.02 * this.scale;
                    break;
                }
                case 'tarantula': {
                    if (this._legs) this._legs.forEach((l, i) => { l.rotation.x = Math.sin(t * (fast ? 7 : 3) + i * 0.7) * 0.16; });
                    if (this.fangs) this.fangs.rotation.x = fast ? Math.abs(Math.sin(t * 9)) * 0.4 : 0;
                    this.model.position.y = this._baseY + Math.abs(Math.sin(t * (fast ? 5 : 2))) * 0.02 * this.scale;
                    break;
                }
                case 'thundersprite': {
                    if (this.sparks) this.sparks.forEach((sp, i) => { const ang = sp._a + t * (fast ? 5 : 2.5); sp.position.set(Math.cos(ang) * sp._r, sp._h + Math.sin(t * 3 + i) * 0.1, Math.sin(ang) * sp._r); });
                    if (this.core) { this.core.rotation.y = t * 3; if (this.core.material) this.core.material.emissiveIntensity = (fast ? 1.8 : 0.9) + Math.sin(t * 14) * 0.6; }
                    [this.leftArm, this.rightArm, this.leftLeg, this.rightLeg].forEach((l, i) => { if (l) l.rotation.z = Math.sin(t * (fast ? 12 : 6) + i) * 0.3; });
                    this.model.position.x = baseX + Math.sin(t * 2.2) * 0.04 * this.scale; // darting
                    break;
                }
            }
        }

        deathPose(deltaTime) {
            const t = this.animTime, prog = Math.min(1.0, t / 1.2);
            for (const mat of this._materials) mat.opacity = Math.min(mat.opacity, 1.0 - prog);
            if (this._baseY === null) this._baseY = this.model.position.y;
            this.model.position.y = this._baseY - prog * 0.5 * this.scale;
            this.model.rotation.z = prog * 0.8;
        }
    }

    const make = (scale, offsetY, enemy, weaponType, key) =>
        new FlavorBattler3D(scale, offsetY, enemy, weaponType, key);

    const reg = window.Battler3D.registerArchetype;
    const S = F_PROFILES;
    reg('gunburger',      { aliases: ['gunburger'], scale: S.gunburger.scale, weapon: 0, create: make });
    reg('sushisnail',     { aliases: ['sushisnail'], scale: S.sushisnail.scale, weapon: 0, create: make });
    reg('origamicrane',   { aliases: ['origamicrane', 'origami'], scale: S.origamicrane.scale, weapon: 0, create: make });
    reg('cursedcandle',   { aliases: ['cursedcandle', 'candelabra'], scale: S.cursedcandle.scale, weapon: 0, create: make });
    reg('pillowguardian', { aliases: ['pillowguardian', 'pillowgolem'], scale: S.pillowguardian.scale, weapon: 0, create: make });
    reg('weepingmask',    { aliases: ['weepingmask', 'theatremask'], scale: S.weepingmask.scale, weapon: 0, create: make });
    reg('paperwork',      { aliases: ['paperwork'], scale: S.paperwork.scale, weapon: 0, create: make });
    // Aliases kept narrow (the key only) so common name tokens such as
    // "door"/"cone"/"blade" can never hijack unrelated enemies; the actual
    // enemies are pinned below by exact name instead.
    reg('trafficcone',    { aliases: ['trafficcone'], scale: S.trafficcone.scale, weapon: 0, create: make });
    reg('sentientcone',   { aliases: ['sentientcone', 'sentienttrafficcone'], scale: S.sentientcone.scale, weapon: 0, create: make });
    reg('walkingdoor',    { aliases: ['walkingdoor'], scale: S.walkingdoor.scale, weapon: 0, create: make });
    reg('baptismfont',    { aliases: ['baptismfont'], scale: S.baptismfont.scale, weapon: 0, create: make });
    reg('sawblade',       { aliases: ['sawblade'],    scale: S.sawblade.scale,    weapon: 0, create: make });
    reg('hairball',       { aliases: ['hairball'],    scale: S.hairball.scale,    weapon: 0, create: make });
    // FF8-inspired bespoke uniques. Aliases kept to the key only so they never
    // steal a shared archetype from other enemies; pinned by exact name below.
    reg('tidesculptor',      { aliases: ['tidesculptor'],      scale: S.tidesculptor.scale,      weapon: 0, create: make });
    reg('forestcentaur',     { aliases: ['forestcentaur'],     scale: S.forestcentaur.scale,     weapon: 0, create: make });
    reg('obsidianvisionary', { aliases: ['obsidianvisionary'], scale: S.obsidianvisionary.scale, weapon: 0, create: make });
    reg('ochrejelly',        { aliases: ['ochrejelly'],        scale: S.ochrejelly.scale,        weapon: 0, create: make });
    reg('barbedmanticore',   { aliases: ['barbedmanticore'],   scale: S.barbedmanticore.scale,   weapon: 0, create: make });
    reg('nobleguardian',     { aliases: ['nobleguardian'],     scale: S.nobleguardian.scale,     weapon: 0, create: make });
    reg('forestarcher',      { aliases: ['forestarcher'],      scale: S.forestarcher.scale,      weapon: 0, create: make });
    reg('enchantress',       { aliases: ['enchantress'],       scale: S.enchantress.scale,       weapon: 0, create: make });
    // Batch (IDs 224-247): one bespoke model per enemy, pinned by exact name.
    reg('embersprite',     { aliases: ['embersprite'],     scale: S.embersprite.scale,     weapon: 0, create: make });
    reg('frostsylph',      { aliases: ['frostsylph'],      scale: S.frostsylph.scale,      weapon: 0, create: make });
    reg('flamefrake',      { aliases: ['flamefrake'],      scale: S.flamefrake.scale,      weapon: 0, create: make });
    reg('flameturret',     { aliases: ['flameturret'],     scale: S.flameturret.scale,     weapon: 0, create: make });
    reg('fluxlingfurret',  { aliases: ['fluxlingfurret'],  scale: S.fluxlingfurret.scale,  weapon: 0, create: make });
    reg('foresttreant',    { aliases: ['foresttreant'],    scale: S.foresttreant.scale,    weapon: 0, create: make });
    reg('forestwitch',     { aliases: ['forestwitch'],     scale: S.forestwitch.scale,     weapon: 0, create: make });
    reg('frostelemental',  { aliases: ['frostelemental'],  scale: S.frostelemental.scale,  weapon: 0, create: make });
    reg('frostspider',     { aliases: ['frostspider'],     scale: S.frostspider.scale,     weapon: 0, create: make });
    reg('giantspider',     { aliases: ['giantspider'],     scale: S.giantspider.scale,     weapon: 0, create: make });
    reg('giantjellyfish',  { aliases: ['giantjellyfish'],  scale: S.giantjellyfish.scale,  weapon: 0, create: make });
    reg('giantscorpion',   { aliases: ['giantscorpion'],   scale: S.giantscorpion.scale,   weapon: 0, create: make });
    // Batch (IDs 249-295), one bespoke per enemy, pinned by exact name.
    reg('glaciercrab',     { aliases: ['glaciercrab'],     scale: S.glaciercrab.scale,     weapon: 0, create: make });
    reg('glimmershrimp',   { aliases: ['glimmershrimp'],   scale: S.glimmershrimp.scale,   weapon: 0, create: make });
    reg('goldenmimic',     { aliases: ['goldenmimic'],     scale: S.goldenmimic.scale,     weapon: 0, create: make });
    reg('holographicdecoy',{ aliases: ['holographicdecoy'],scale: S.holographicdecoy.scale,weapon: 0, create: make });
    reg('icekangaroo',     { aliases: ['icekangaroo'],     scale: S.icekangaroo.scale,     weapon: 0, create: make });
    // insectswarm is canonically registered by 3DBattler_Arachnid.js (with aliases swarm/locusts/bees/hornets);
    // omitted here so those aliases keep routing to that family instead of being shadowed.
    reg('junkrat',         { aliases: ['junkrat'],         scale: S.junkrat.scale,         weapon: 0, create: make });
    reg('kangaroo',        { aliases: ['kangaroo'],        scale: S.kangaroo.scale,        weapon: 0, create: make });
    reg('komododragon',    { aliases: ['komododragon'],    scale: S.komododragon.scale,    weapon: 0, create: make });
    reg('magmaant',        { aliases: ['magmaant'],        scale: S.magmaant.scale,        weapon: 0, create: make });
    reg('marshwraith',     { aliases: ['marshwraith'],     scale: S.marshwraith.scale,     weapon: 0, create: make });
    reg('mindleech',       { aliases: ['mindleech'],       scale: S.mindleech.scale,       weapon: 0, create: make });
    // Batch (IDs 296-336), one bespoke per enemy, pinned by exact name.
    reg('mirespider',        { aliases: ['mirespider'],        scale: S.mirespider.scale,        weapon: 0, create: make });
    reg('monitorlizard',     { aliases: ['monitorlizard'],     scale: S.monitorlizard.scale,     weapon: 0, create: make });
    reg('monstrousbadger',   { aliases: ['monstrousbadger'],   scale: S.monstrousbadger.scale,   weapon: 0, create: make });
    reg('mutantbug',         { aliases: ['mutantbug'],         scale: S.mutantbug.scale,         weapon: 0, create: make });
    reg('overworkedvillager',{ aliases: ['overworkedvillager'],scale: S.overworkedvillager.scale,weapon: 0, create: make });
    reg('primalkangaroo',    { aliases: ['primalkangaroo'],    scale: S.primalkangaroo.scale,    weapon: 0, create: make });
    reg('quagmirecreeper',   { aliases: ['quagmirecreeper'],   scale: S.quagmirecreeper.scale,   weapon: 0, create: make });
    reg('rabidjackrabbit',   { aliases: ['rabidjackrabbit'],   scale: S.rabidjackrabbit.scale,   weapon: 0, create: make });
    reg('reaganite',         { aliases: ['reaganite'],         scale: S.reaganite.scale,         weapon: 0, create: make });
    reg('ribcagecrab',       { aliases: ['ribcagecrab'],       scale: S.ribcagecrab.scale,       weapon: 0, create: make });
    reg('securitybot',       { aliases: ['securitybot'],       scale: S.securitybot.scale,       weapon: 0, create: make });
    reg('seraphicemissary',  { aliases: ['seraphicemissary'],  scale: S.seraphicemissary.scale,  weapon: 0, create: make });
    // Batch (IDs 337-360), one bespoke per enemy, pinned by exact name.
    reg('shadowcrawler',     { aliases: ['shadowcrawler'],     scale: S.shadowcrawler.scale,     weapon: 0, create: make });
    reg('shadowstalker',     { aliases: ['shadowstalker'],     scale: S.shadowstalker.scale,     weapon: 0, create: make });
    reg('shadowwraith',      { aliases: ['shadowwraith'],      scale: S.shadowwraith.scale,      weapon: 0, create: make });
    reg('spectralwardstone', { aliases: ['spectralwardstone'], scale: S.spectralwardstone.scale, weapon: 0, create: make });
    reg('spinedlizard',      { aliases: ['spinedlizard'],      scale: S.spinedlizard.scale,      weapon: 0, create: make });
    reg('spinysprinter',     { aliases: ['spinysprinter'],     scale: S.spinysprinter.scale,     weapon: 0, create: make });
    reg('stoneguardian',     { aliases: ['stoneguardian'],     scale: S.stoneguardian.scale,     weapon: 0, create: make });
    reg('stormbanshee',      { aliases: ['stormbanshee'],      scale: S.stormbanshee.scale,      weapon: 0, create: make });
    reg('stormcaller',       { aliases: ['stormcaller'],       scale: S.stormcaller.scale,       weapon: 0, create: make });
    reg('swampcrocodile',    { aliases: ['swampcrocodile'],    scale: S.swampcrocodile.scale,    weapon: 0, create: make });
    reg('tarantula',         { aliases: ['tarantula'],         scale: S.tarantula.scale,         weapon: 0, create: make });
    reg('thundersprite',     { aliases: ['thundersprite'],     scale: S.thundersprite.scale,     weapon: 0, create: make });
    // Level 1-5 roster: each lv_ key is its own bespoke model.
reg('lv_foldedairplane',      { aliases: ['lv_foldedairplane'],      scale: S.lv_foldedairplane.scale,      weapon: 0, create: make });
    reg('lv_wasabisnail',         { aliases: ['lv_wasabisnail'],         scale: S.lv_wasabisnail.scale,         weapon: 0, create: make });
    reg('lv_clockworktinsoldier', { aliases: ['lv_clockworktinsoldier'], scale: S.lv_clockworktinsoldier.scale, weapon: 0, create: make });
    reg('lv_dryerlintgolem',      { aliases: ['lv_dryerlintgolem'],      scale: S.lv_dryerlintgolem.scale,      weapon: 0, create: make });
    reg('lv_sandgecko',           { aliases: ['lv_sandgecko'],           scale: S.lv_sandgecko.scale,           weapon: 0, create: make });
    reg('lv_deserttumbleweed',    { aliases: ['lv_deserttumbleweed'],    scale: S.lv_deserttumbleweed.scale,    weapon: 0, create: make });
    reg('lv_dunescorpling',       { aliases: ['lv_dunescorpling'],       scale: S.lv_dunescorpling.scale,       weapon: 0, create: make });
    reg('lv_saltcrab',            { aliases: ['lv_saltcrab'],            scale: S.lv_saltcrab.scale,            weapon: 0, create: make });
    reg('lv_desertporcupine',     { aliases: ['lv_desertporcupine'],     scale: S.lv_desertporcupine.scale,     weapon: 0, create: make });
    reg('lv_manticorecub',        { aliases: ['lv_manticorecub'],        scale: S.lv_manticorecub.scale,        weapon: 0, create: make });
    reg('lv_belltowergargoyle',   { aliases: ['lv_belltowergargoyle'],   scale: S.lv_belltowergargoyle.scale,   weapon: 0, create: make });
    reg('lv_voidferretkit',       { aliases: ['lv_voidferretkit'],       scale: S.lv_voidferretkit.scale,       weapon: 0, create: make });
    reg('lv_astraljellyfish',     { aliases: ['lv_astraljellyfish'],     scale: S.lv_astraljellyfish.scale,     weapon: 0, create: make });
    reg('lv_lunarhopper',         { aliases: ['lv_lunarhopper'],         scale: S.lv_lunarhopper.scale,         weapon: 0, create: make });
    reg('lv_mallguardbot',        { aliases: ['lv_mallguardbot'],        scale: S.lv_mallguardbot.scale,        weapon: 0, create: make });
    reg('lv_looseboltbot',        { aliases: ['lv_looseboltbot'],        scale: S.lv_looseboltbot.scale,        weapon: 0, create: make });
    reg('lv_plushbear',           { aliases: ['lv_plushbear'],           scale: S.lv_plushbear.scale,           weapon: 0, create: make });
    reg('lv_sparkplugsprite',     { aliases: ['lv_sparkplugsprite'],     scale: S.lv_sparkplugsprite.scale,     weapon: 0, create: make });
    reg('lv_plagueleech',         { aliases: ['lv_plagueleech'],         scale: S.lv_plagueleech.scale,         weapon: 0, create: make });
    reg('lv_coinpursemimic',      { aliases: ['lv_coinpursemimic'],      scale: S.lv_coinpursemimic.scale,      weapon: 0, create: make });
    reg('lv_morguecrawler',       { aliases: ['lv_morguecrawler'],       scale: S.lv_morguecrawler.scale,       weapon: 0, create: make });
    reg('lv_pizzaooze',           { aliases: ['lv_pizzaooze'],           scale: S.lv_pizzaooze.scale,           weapon: 0, create: make });
    reg('lv_hoardlizard',         { aliases: ['lv_hoardlizard'],         scale: S.lv_hoardlizard.scale,         weapon: 0, create: make });
    reg('lv_pitrhinobeetle',      { aliases: ['lv_pitrhinobeetle'],      scale: S.lv_pitrhinobeetle.scale,      weapon: 0, create: make });
    reg('lv_hoardwyrmling',       { aliases: ['lv_hoardwyrmling'],       scale: S.lv_hoardwyrmling.scale,       weapon: 0, create: make });
    reg('lv_fishnetcrab',         { aliases: ['lv_fishnetcrab'],         scale: S.lv_fishnetcrab.scale,         weapon: 0, create: make });
    reg('lv_sewergatorhatchling', { aliases: ['lv_sewergatorhatchling'], scale: S.lv_sewergatorhatchling.scale, weapon: 0, create: make });
    reg('lv_shadowpuddle',        { aliases: ['lv_shadowpuddle'],        scale: S.lv_shadowpuddle.scale,        weapon: 0, create: make });
    reg('lv_wishingtotem',        { aliases: ['lv_wishingtotem'],        scale: S.lv_wishingtotem.scale,        weapon: 0, create: make });
    reg('lv_centaurfoal',         { aliases: ['lv_centaurfoal'],         scale: S.lv_centaurfoal.scale,         weapon: 0, create: make });
    reg('lv_ruingecko',           { aliases: ['lv_ruingecko'],           scale: S.lv_ruingecko.scale,           weapon: 0, create: make });

    //=========================================================================
    // Name assignments (description-matched).
    //=========================================================================
    const NAMED = {
        gunburger:      ["Gun Burger"],
        sushisnail:     ["Sushi Snail"],
        origamicrane:   ["Origami Crane"],
        cursedcandle:   ["Cursed Candle"],
        pillowguardian: ["Pillow Guardian"],
        weepingmask:    ["Weeping Mask"],
        paperwork:      ["Tax Collector"],
        trafficcone:    ["Cone Mimic"],
        sentientcone:   ["Sentient Traffic Cone"],
        walkingdoor:    ["Talking Door"],
        baptismfont:    ["Baptism Font"],
        sawblade:       ["Rotating Sawblade"],
        hairball:       ["Hair Ball"],
        // FF8-inspired sole-of-archetype enemies.
        tidesculptor:      ["Tide Sculptor"],
        forestcentaur:     ["Forest Centaur"],
        obsidianvisionary: ["Obsidian Visionary"],
        ochrejelly:        ["Ochre Jelly Swarm"],
        barbedmanticore:   ["Barbed Manticore"],
        nobleguardian:     ["Noble Guardian"],
        forestarcher:      ["Forest Archer"],
        enchantress:       ["Majestic Enchantress"],
        // Batch IDs 224-247.
        embersprite:       ["Ember Sprite"],
        frostsylph:        ["Frost Sylph"],
        flamefrake:        ["Flame Frake"],
        flameturret:       ["Flame Turret"],
        fluxlingfurret:    ["Fluxling Furret"],
        foresttreant:      ["Forest Treant"],
        forestwitch:       ["Forest Witch"],
        frostelemental:    ["Frost Elemental"],
        frostspider:       ["Frost Spider"],
        giantspider:       ["Giant Spider"],
        giantjellyfish:    ["Giant Jellyfish"],
        giantscorpion:     ["Giant Scorpion"],
        // Batch IDs 249-295.
        glaciercrab:       ["Glacier Crab"],
        glimmershrimp:     ["Glimmer Shrimp"],
        goldenmimic:       ["Golden Mimic"],
        holographicdecoy:  ["Holographic Decoy"],
        icekangaroo:       ["Ice Kangaroo"],
        insectswarm:       ["Insect Swarm"],
        junkrat:           ["Junkrat"],
        kangaroo:          ["Kangaroo"],
        komododragon:      ["Komodo Dragon"],
        magmaant:          ["Magma Ant"],
        marshwraith:       ["Marsh Wraith"],
        mindleech:         ["Mind Leech"],
        // Batch IDs 296-336.
        mirespider:        ["Mire Spider"],
        monitorlizard:     ["Monitor Lizard"],
        monstrousbadger:   ["Monstrous Badger"],
        mutantbug:         ["Mutant Bug"],
        overworkedvillager:["Overworked Villager"],
        primalkangaroo:    ["Primal Kangaroo"],
        quagmirecreeper:   ["Quagmire Creeper"],
        rabidjackrabbit:   ["Rabid Jackrabbit"],
        reaganite:         ["Reaganite"],
        ribcagecrab:       ["Rib Cage Crab"],
        securitybot:       ["Security Bot"],
        seraphicemissary:  ["Seraphic Emissary"],
        // Batch IDs 337-360. Two enemies share the "Shadow Stalker" name.
        shadowcrawler:     ["Shadow Crawler"],
        shadowstalker:     ["Shadow Stalker"],
        shadowwraith:      ["Shadow Wraith"],
        spectralwardstone: ["Spectral Wardstone"],
        spinedlizard:      ["Spined Lizard"],
        spinysprinter:     ["Spiny Sprinter"],
        stoneguardian:     ["Stone Guardian"],
        stormbanshee:      ["Storm Banshee"],
        stormcaller:       ["Storm Caller"],
        swampcrocodile:    ["Swamp Crocodile"],
        tarantula:         ["Tarantula"],
        thundersprite:     ["Thunder Sprite"],
        // Level 1-5 roster (bespoke lv_ models).
        lv_foldedairplane:      ["Folded Airplane"],
        lv_wasabisnail:         ["Wasabi Snail"],
        lv_clockworktinsoldier: ["Clockwork Tin Soldier"],
        lv_dryerlintgolem:      ["Dryer Lint Golem"],
        lv_sandgecko:           ["Sand Gecko"],
        lv_deserttumbleweed:    ["Desert Tumbleweed"],
        lv_dunescorpling:       ["Dune Scorpling"],
        lv_saltcrab:            ["Salt Crab"],
        lv_desertporcupine:     ["Desert Porcupine"],
        lv_manticorecub:        ["Manticore Cub"],
        lv_belltowergargoyle:   ["Belltower Gargoyle"],
        lv_voidferretkit:       ["Void Ferret Kit"],
        lv_astraljellyfish:     ["Astral Jellyfish"],
        lv_lunarhopper:         ["Lunar Hopper"],
        lv_mallguardbot:        ["Mall Guard Bot"],
        lv_looseboltbot:        ["Loose Bolt Bot"],
        lv_plushbear:           ["Plush Bear"],
        lv_sparkplugsprite:     ["Spark Plug Sprite"],
        lv_plagueleech:         ["Plague Leech"],
        lv_coinpursemimic:      ["Coin Purse Mimic"],
        lv_morguecrawler:       ["Morgue Crawler"],
        lv_pizzaooze:           ["Pizza Ooze"],
        lv_hoardlizard:         ["Hoard Lizard"],
        lv_pitrhinobeetle:      ["Pit Rhino Beetle"],
        lv_hoardwyrmling:       ["Hoard Wyrmling"],
        lv_fishnetcrab:         ["Fishnet Crab"],
        lv_sewergatorhatchling: ["Sewer Gator Hatchling"],
        lv_shadowpuddle:        ["Shadow Puddle"],
        lv_wishingtotem:        ["Wishing Totem"],
        lv_centaurfoal:         ["Centaur Foal"],
        lv_ruingecko:           ["Ruin Gecko"],
        // Bespoke uniques (their notes also pin the key).
        u_umbrallurker:          ["Umbral Lurker"],
        u_bureaucraticnightmare: ["Bureaucratic Nightmare"],
        u_offrampincarnate:      ["Off-Ramp Incarnate"],
        u_varleniamirage:        ["Varlenia Mirage"],
        u_rimespinner:           ["Rime Spinner"],
        u_thothsbrokenward:      ["Thoth's Broken Ward"]
    };
    if (window.Battler3D.registerNamed) {
        for (const key in NAMED) NAMED[key].forEach(n => window.Battler3D.registerNamed(n, key));
    }

    debugLog('Flavor uniques registered');

    reg('u_umbrallurker',         { aliases: ['u_umbrallurker'],         scale: S.u_umbrallurker.scale,         weapon: 0, create: make });
    reg('u_bureaucraticnightmare',{ aliases: ['u_bureaucraticnightmare'],scale: S.u_bureaucraticnightmare.scale,weapon: 0, create: make });
    reg('u_offrampincarnate',     { aliases: ['u_offrampincarnate'],     scale: S.u_offrampincarnate.scale,     weapon: 0, create: make });
    reg('u_varleniamirage',       { aliases: ['u_varleniamirage'],       scale: S.u_varleniamirage.scale,       weapon: 0, create: make });
    reg('u_rimespinner',          { aliases: ['u_rimespinner'],          scale: S.u_rimespinner.scale,          weapon: 0, create: make });
    reg('u_thothsbrokenward',     { aliases: ['u_thothsbrokenward'],     scale: S.u_thothsbrokenward.scale,     weapon: 0, create: make });
})();
