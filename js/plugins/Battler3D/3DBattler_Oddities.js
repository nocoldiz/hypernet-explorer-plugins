//=============================================================================
// 3D Battler System - Oddity Uniques
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Bespoke oddball unique models (marionette, war machine, flesh
 * horror, floating eye, crawling hand, grimoire, inside-out whale, inverted
 * angel, inside-out critter) + name-based assignment to specific named enemies.
 * Requires 3DBattlerSystem + families first.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * ============================================================================
 * 3D Battler - Oddity Uniques
 * ============================================================================
 *
 * Distinctive one-off models for flavourful named enemies, auto-assigned by
 * exact name (overrideable with <Battler3D: marionette> etc.). They share the
 * part-losing engine, per-id variation and the base action gestures.
 *
 * Registered: marionette, warmachine,
 *             grimoire, insideoutwhale, invertedangel, insideoutcritter
 *
 * MUST load AFTER the other Battler3D family plugins.
 */

(() => {
    'use strict';

    if (typeof THREE === 'undefined') return;
    if (!window.Battler3D || !window.Battler3D.Base) {
        console.error('[3D Battler Oddities] Core (3DBattlerSystem) not loaded first.');
        return;
    }

    const Base = window.Battler3D.Base;
    const debugLog = window.Battler3D.debugLog || function () {};

    const O_PROFILES = {
        marionette:   { variant: 'marionette', scale: 3.0, texturePool: 'wood', bodyColor: 0xb98a4a, accent: 0xcc3344, hue: [0.08, 0.04], sat: [0.45, 0.12], lit: [0.46, 0.10] },
        warmachine:   { variant: 'warmachine', scale: 3.4, texturePool: 'metal', bodyColor: 0x6a7079, accent: 0xff6622, hue: [0.58, 0.05], sat: [0.10, 0.06], lit: [0.46, 0.10] },
        // ── 10 puppets split out of the shared `marionette` rig ───────────────
        mar_phantom:      { variant: 'mar_phantom',      scale: 3.0, texturePool: 'wood', bodyColor: 0xb98a4a, accent: 0xcc3344, hue: [0.08,0.04], sat: [0.45,0.12], lit: [0.46,0.10] },
        mar_twisted:      { variant: 'mar_twisted',      scale: 2.9, texturePool: 'pale', bodyColor: 0xf0e8e0, accent: 0xcc3344, hue: [0.02,0.04], sat: [0.20,0.10], lit: [0.78,0.08] },
        mar_haunted:      { variant: 'mar_haunted',      scale: 3.1, texturePool: 'wood', bodyColor: 0x8a6a3a, accent: 0xaa4422, hue: [0.08,0.04], sat: [0.40,0.12], lit: [0.40,0.10] },
        mar_mannequin:    { variant: 'mar_mannequin',    scale: 3.0, texturePool: 'pale', bodyColor: 0xd8cdb8, accent: 0x8899aa, hue: [0.10,0.04], sat: [0.14,0.08], lit: [0.70,0.08] },
        mar_backwards:    { variant: 'mar_backwards',    scale: 2.9, texturePool: 'pale', bodyColor: 0xe8d8c8, accent: 0x66ddff, hue: [0.08,0.04], sat: [0.18,0.08], lit: [0.74,0.08] },
        mar_stringbound:  { variant: 'mar_stringbound',  scale: 3.4, texturePool: 'wood', bodyColor: 0x7a5a32, accent: 0xff5522, hue: [0.08,0.04], sat: [0.45,0.12], lit: [0.36,0.10] },
        mar_meatpuppet:   { variant: 'mar_meatpuppet',   scale: 3.0, texturePool: 'flesh',bodyColor: 0x9a4a4a, accent: 0xff5566, hue: [0.99,0.04], sat: [0.45,0.12], lit: [0.40,0.10] },
        mar_boneorchestra:{ variant: 'mar_boneorchestra',scale: 3.1, texturePool: 'bone', bodyColor: 0xcabd92, accent: 0xffeecc, hue: [0.11,0.04], sat: [0.28,0.10], lit: [0.58,0.10] },
        mar_puppetcorpse: { variant: 'mar_puppetcorpse', scale: 3.1, texturePool: 'wood', bodyColor: 0x5a4a3a, accent: 0x88aa44, hue: [0.10,0.05], sat: [0.30,0.10], lit: [0.34,0.10] },
        mar_babydoll:     { variant: 'mar_babydoll',     scale: 2.6, texturePool: 'pale', bodyColor: 0xf0ece8, accent: 0x88aaff, hue: [0.08,0.04], sat: [0.16,0.08], lit: [0.82,0.06] },
        // ── 9 war machines split out of the shared `warmachine` rig ───────────
        wm_assault:       { variant: 'wm_assault',       scale: 3.4, texturePool: 'metal', bodyColor: 0x6a7079, accent: 0xff6622, hue: [0.58,0.05], sat: [0.10,0.06], lit: [0.46,0.10] },
        wm_battlemech:    { variant: 'wm_battlemech',    scale: 3.6, texturePool: 'metal', bodyColor: 0x5a6068, accent: 0xff8822, hue: [0.58,0.05], sat: [0.12,0.06], lit: [0.42,0.10] },
        wm_battlemechep:  { variant: 'wm_battlemechep',  scale: 3.5, texturePool: 'metal', bodyColor: 0x586878, accent: 0x44ddff, hue: [0.56,0.05], sat: [0.14,0.08], lit: [0.46,0.10] },
        wm_arsenal:       { variant: 'wm_arsenal',       scale: 3.3, texturePool: 'metal', bodyColor: 0x7a7064, accent: 0xffcc44, hue: [0.10,0.05], sat: [0.16,0.08], lit: [0.48,0.10] },
        wm_tank:          { variant: 'wm_tank',          scale: 3.4, texturePool: 'metal', bodyColor: 0x4a5240, accent: 0xff6622, hue: [0.28,0.06], sat: [0.20,0.08], lit: [0.36,0.10] },
        wm_cogwork:       { variant: 'wm_cogwork',       scale: 3.5, texturePool: 'metal', bodyColor: 0x6a5a3a, accent: 0xffaa33, hue: [0.10,0.05], sat: [0.30,0.10], lit: [0.40,0.10] },
        wm_ironbastion:   { variant: 'wm_ironbastion',   scale: 3.7, texturePool: 'metal', bodyColor: 0x70665a, accent: 0xffcc66, hue: [0.10,0.05], sat: [0.18,0.08], lit: [0.42,0.10] },
        wm_marauder:      { variant: 'wm_marauder',      scale: 3.3, texturePool: 'metal', bodyColor: 0x5a5660, accent: 0xff4422, hue: [0.62,0.06], sat: [0.12,0.08], lit: [0.40,0.10] },
        wm_veteranbot:    { variant: 'wm_veteranbot',    scale: 3.2, texturePool: 'metal', bodyColor: 0x6a6258, accent: 0xff8844, hue: [0.09,0.05], sat: [0.16,0.08], lit: [0.40,0.10] },
        sb_backalleybot: { variant: 'scrapbot', scale: 3.0, texturePool: 'metal', bodyColor: 0x2a2a30, accent: 0x88aaff, hue:[0.6,0.06], sat:[0.12,0.08], lit:[0.42,0.1] },
        sb_conscriptautomaton: { variant: 'scrapbot', scale: 3.0, texturePool: 'metal', bodyColor: 0x3a5a3a, accent: 0x88dd44, hue:[0.6,0.06], sat:[0.12,0.08], lit:[0.42,0.1] },
        sb_disgracedbot: { variant: 'scrapbot', scale: 3.0, texturePool: 'metal', bodyColor: 0x4a3a5a, accent: 0xaa66ff, hue:[0.6,0.06], sat:[0.12,0.08], lit:[0.42,0.1] },
        sb_scrapbot: { variant: 'scrapbot', scale: 3.0, texturePool: 'metal', bodyColor: 0x6a5a3a, accent: 0xff8844, hue:[0.6,0.06], sat:[0.12,0.08], lit:[0.42,0.1] },
        sb_renegadebot: { variant: 'scrapbot', scale: 3.0, texturePool: 'metal', bodyColor: 0x5a4044, accent: 0xff3322, hue:[0.6,0.06], sat:[0.12,0.08], lit:[0.42,0.1] },
        sb_maskedbot: { variant: 'scrapbot', scale: 3.0, texturePool: 'metal', bodyColor: 0x4a4a52, accent: 0xeeeeee, hue:[0.6,0.06], sat:[0.12,0.08], lit:[0.42,0.1] },
        sb_salvagedautomaton: { variant: 'scrapbot', scale: 3.0, texturePool: 'metal', bodyColor: 0x3a5a58, accent: 0x44ddcc, hue:[0.6,0.06], sat:[0.12,0.08], lit:[0.42,0.1] },
        sb_scrapautomaton: { variant: 'scrapbot', scale: 3.0, texturePool: 'metal', bodyColor: 0x6a5a3a, accent: 0xff8844, hue:[0.6,0.06], sat:[0.12,0.08], lit:[0.42,0.1] },
        sb_grizzledbot: { variant: 'scrapbot', scale: 3.0, texturePool: 'metal', bodyColor: 0x6a5e4a, accent: 0xffcc88, hue:[0.6,0.06], sat:[0.12,0.08], lit:[0.42,0.1] },
        sb_twitchysapper: { variant: 'scrapbot', scale: 3.0, texturePool: 'metal', bodyColor: 0x6a6a3a, accent: 0xffee44, hue:[0.6,0.06], sat:[0.12,0.08], lit:[0.42,0.1] },
        sb_twitchydrone: { variant: 'scrapbot', scale: 3.0, texturePool: 'metal', bodyColor: 0x6a6a3a, accent: 0xffee44, hue:[0.6,0.06], sat:[0.12,0.08], lit:[0.42,0.1] },
        sb_renegadedrone: { variant: 'scrapbot', scale: 3.0, texturePool: 'metal', bodyColor: 0x5a4044, accent: 0xff3322, hue:[0.6,0.06], sat:[0.12,0.08], lit:[0.42,0.1] },
        sb_twitchybot: { variant: 'scrapbot', scale: 3.0, texturePool: 'metal', bodyColor: 0x6a6a3a, accent: 0xffee44, hue:[0.6,0.06], sat:[0.12,0.08], lit:[0.42,0.1] },
        sb_mercenarydrone: { variant: 'scrapbot', scale: 3.0, texturePool: 'metal', bodyColor: 0x3a4458, accent: 0x66aaff, hue:[0.6,0.06], sat:[0.12,0.08], lit:[0.42,0.1] },
        grimoire:     { variant: 'grimoire', scale: 2.6, texturePool: 'void', bodyColor: 0x3a2320, accent: 0x66c2ff, hue: [0.80, 0.10], sat: [0.45, 0.15], lit: [0.28, 0.10] },
        // Inside-out / inverted body-horror trio.
        insideoutwhale:   { variant: 'insideoutwhale',   scale: 3.4, texturePool: 'void',  bodyColor: 0x2a2438, accent: 0xc83a4a, hue: [0.74, 0.06], sat: [0.30, 0.10], lit: [0.22, 0.08] },
        invertedangel:    { variant: 'invertedangel',    scale: 3.0, texturePool: 'flesh', bodyColor: 0x3ab884, accent: 0xeeeeee, hue: [0.99, 0.04], sat: [0.55, 0.12], lit: [0.42, 0.10] },
        insideoutcritter: { variant: 'insideoutcritter', scale: 1.8, texturePool: 'flesh', bodyColor: 0xc05058, accent: 0xe07a86, hue: [0.98, 0.04], sat: [0.50, 0.12], lit: [0.50, 0.10] },

        // ── Batch 5 (IDs 361-380): the "T/U/V" stretch ──────────────────────
        tidesorcerer:    { variant: 'tidesorcerer',    front: true, scale: 3.0, texturePool: 'water',   bodyColor: 0x2a6aa8, accent: 0x9ce4ff, hue: [0.56, 0.05], sat: [0.55, 0.12], lit: [0.50, 0.10] },
        timberwoodshaman:{ variant: 'timberwoodshaman',front: true, scale: 3.0, texturePool: 'wood',    bodyColor: 0x6b4a2a, accent: 0x5cc24a, hue: [0.10, 0.05], sat: [0.45, 0.12], lit: [0.42, 0.10] },
        toothfairy:      { variant: 'toothfairy',      front: true, scale: 2.0, texturePool: 'pale',    bodyColor: 0xe8e0d8, accent: 0xcc4466, hue: [0.95, 0.06], sat: [0.30, 0.12], lit: [0.62, 0.10] },
        totemguardian:   { variant: 'totem',           front: true, scale: 3.0, texturePool: 'wood',    bodyColor: 0x7a5430, accent: 0x66cc44, hue: [0.09, 0.04], sat: [0.45, 0.10], lit: [0.40, 0.10] },
        toteminitiate:   { variant: 'totem', icy: true,front: true, scale: 2.8, texturePool: 'stone',   bodyColor: 0x8aa0b0, accent: 0xaadfff, hue: [0.56, 0.06], sat: [0.20, 0.10], lit: [0.55, 0.10] },
        toxicsprayer:    { variant: 'toxicsprayer',    front: true, scale: 3.0, texturePool: 'metal',   bodyColor: 0x70787e, accent: 0x88ff44, hue: [0.30, 0.08], sat: [0.12, 0.06], lit: [0.48, 0.10] },
        trashling:       { variant: 'trashling',       scale: 2.4, texturePool: 'wood',    bodyColor: 0x4a4030, accent: 0xaacb55, hue: [0.12, 0.06], sat: [0.30, 0.12], lit: [0.32, 0.10] },
        tridenthunter:   { variant: 'tridenthunter',   front: true, scale: 3.0, texturePool: 'water',   bodyColor: 0x2a7a7a, accent: 0xffcc44, hue: [0.50, 0.06], sat: [0.45, 0.12], lit: [0.42, 0.10] },
        mammothcalf:     { variant: 'mammothcalf',     scale: 2.8, texturePool: 'fur',     bodyColor: 0x7a5a3a, accent: 0xe8e0d0, hue: [0.08, 0.04], sat: [0.40, 0.10], lit: [0.40, 0.10] },
        twilightsatyr:   { variant: 'twilightsatyr',   front: true, scale: 3.0, texturePool: 'fur',     bodyColor: 0x3a2a3a, accent: 0xaa66cc, hue: [0.80, 0.08], sat: [0.35, 0.12], lit: [0.34, 0.10] },
        umbralbasilisk:  { variant: 'umbralbasilisk',  scale: 2.8, texturePool: 'void',    bodyColor: 0x6a7aa8, accent: 0xaaccff, hue: [0.62, 0.06], sat: [0.30, 0.12], lit: [0.46, 0.10] },
        vampirebat:      { variant: 'vampirebat',      front: true, scale: 2.4, texturePool: 'fur',     bodyColor: 0x2a2b3a, accent: 0x2241cc, hue: [0.00, 0.03], sat: [0.40, 0.12], lit: [0.30, 0.10] },

        // ── Batch 6 (IDs 382-420): the "snake-through-acid" stretch ─────────
        venomoussnake:   { variant: 'venomoussnake',   front: true, scale: 3.0, texturePool: 'flesh',   bodyColor: 0x3a7a3a, accent: 0xaaff44, hue: [0.30, 0.06], sat: [0.45, 0.12], lit: [0.40, 0.10] },
        webweaver:       { variant: 'webweaver',       scale: 2.8, texturePool: 'stone',   bodyColor: 0x5a5048, accent: 0xcccc88, hue: [0.10, 0.05], sat: [0.20, 0.10], lit: [0.36, 0.10] },
        whisperwisp:     { variant: 'whisperwisp',     front: true, scale: 2.2, texturePool: 'void',    bodyColor: 0xe8e8f0, accent: 0xccccff, hue: [0.66, 0.08], sat: [0.20, 0.10], lit: [0.66, 0.10] },
        wildrabbit:      { variant: 'wildrabbit',      scale: 2.2, texturePool: 'fur',     bodyColor: 0x9a7a5a, accent: 0xe8d8c0, hue: [0.08, 0.04], sat: [0.35, 0.10], lit: [0.46, 0.10] },
        willowisplamp:   { variant: 'willowisplamp',   front: true, scale: 2.4, texturePool: 'metal',   bodyColor: 0x8a6a30, accent: 0x88ffcc, hue: [0.10, 0.05], sat: [0.45, 0.12], lit: [0.42, 0.10] },
        abyssalcrab:     { variant: 'abyssalcrab',     scale: 2.8, texturePool: 'void',    bodyColor: 0x1a1a26, accent: 0x8a3acc, hue: [0.74, 0.06], sat: [0.30, 0.12], lit: [0.20, 0.08] },
        hallucigenia:    { variant: 'hallucigenia',    scale: 2.6, texturePool: 'flesh',   bodyColor: 0x8a7a6a, accent: 0xcc4466, hue: [0.06, 0.05], sat: [0.30, 0.12], lit: [0.46, 0.10] },
        abyssalhorror:   { variant: 'abyssalhorror',   front: true, scale: 3.2, texturePool: 'void',    bodyColor: 0x181e12, accent: 0x6bff40, hue: [0.76, 0.08], sat: [0.35, 0.12], lit: [0.18, 0.08] },
        abyssaltentacler:{ variant: 'abyssaltentacler',scale: 3.0, texturePool: 'flesh',   bodyColor: 0x7a2a3a, accent: 0xffccaa, hue: [0.98, 0.05], sat: [0.45, 0.12], lit: [0.36, 0.10] },
        acidbombardier:  { variant: 'acidbombardier',  scale: 2.8, texturePool: 'flesh',   bodyColor: 0x4a4022, accent: 0x9aff33, hue: [0.18, 0.06], sat: [0.40, 0.12], lit: [0.32, 0.10] },
        acidictidecaller:{ variant: 'acidictidecaller',scale: 2.8, texturePool: 'stone',   bodyColor: 0x3a5a2a, accent: 0x99ff44, hue: [0.28, 0.06], sat: [0.40, 0.12], lit: [0.34, 0.10] },

        // ── Batch 7 (IDs 421-453): elementals, bugs, reptiles, bog horrors ──
        airelemental:   { variant: 'airelemental',   front: true, scale: 3.0, texturePool: 'void',  bodyColor: 0xcfe8ff, accent: 0xeaf6ff, hue: [0.56, 0.05], sat: [0.20, 0.10], lit: [0.72, 0.10] },
        ancientdragon:  { variant: 'ancientdragon',  scale: 3.6, texturePool: 'flesh', bodyColor: 0x6a3a2a, accent: 0xff7722, hue: [0.04, 0.05], sat: [0.45, 0.12], lit: [0.34, 0.10] },
        anguishphantom: { variant: 'anguishphantom', front: true, scale: 3.0, texturePool: 'void',  bodyColor: 0x4a5a55, accent: 0x88ffcc, hue: [0.45, 0.08], sat: [0.25, 0.10], lit: [0.40, 0.10] },
        aquaticelemental:{ variant: 'aquaticelemental', front: true, scale: 2.8, texturePool: 'water', bodyColor: 0x2a7ab8, accent: 0xaad8ff, hue: [0.56, 0.05], sat: [0.50, 0.12], lit: [0.50, 0.10] },
        aquaticmantis:  { variant: 'aquaticmantis',  front: true, scale: 3.0, texturePool: 'flesh', bodyColor: 0x2a7a5a, accent: 0xaaffdd, hue: [0.42, 0.06], sat: [0.45, 0.12], lit: [0.42, 0.10] },
        assassinwasp:   { variant: 'assassinwasp',   scale: 2.6, texturePool: 'flesh', bodyColor: 0xcaa01a, accent: 0x141414, hue: [0.13, 0.05], sat: [0.55, 0.12], lit: [0.46, 0.10] },
        bloodwidow:     { variant: 'bloodwidow',     front: true, scale: 3.0, texturePool: 'flesh', bodyColor: 0x5a1a22, accent: 0xcc3344, hue: [0.98, 0.04], sat: [0.50, 0.12], lit: [0.32, 0.10] },
        bogelemental:   { variant: 'bogelemental',   scale: 3.2, texturePool: 'wood',  bodyColor: 0x3a3a22, accent: 0x6a8a3a, hue: [0.20, 0.06], sat: [0.35, 0.12], lit: [0.28, 0.10] },
        bogmutant:      { variant: 'bogmutant',      scale: 2.8, texturePool: 'flesh', bodyColor: 0x5a6a4a, accent: 0x99cc44, hue: [0.24, 0.06], sat: [0.35, 0.12], lit: [0.38, 0.10] },
        brinewisp:      { variant: 'brinewisp',      front: true, scale: 2.4, texturePool: 'water', bodyColor: 0x4aa8c8, accent: 0xddffff, hue: [0.52, 0.05], sat: [0.45, 0.12], lit: [0.56, 0.10] },

        // ── Batch 8 (IDs 456-473): dinos, beasts, hounds, drones, bog-horrors ─
        chainfury:      { variant: 'chainfury',      scale: 2.8, texturePool: 'metal', bodyColor: 0x4a4038, accent: 0xb0b0b8, hue: [0.10, 0.04], sat: [0.20, 0.10], lit: [0.32, 0.10] },
        cinderweaver:   { variant: 'cinderweaver',   scale: 2.8, texturePool: 'flesh', bodyColor: 0x3a1810, accent: 0xff5522, hue: [0.04, 0.04], sat: [0.50, 0.12], lit: [0.26, 0.10] },
        cindermawhound: { variant: 'hellhound',      scale: 2.8, texturePool: 'flesh', bodyColor: 0x2a1818, accent: 0xff5522, hue: [0.02, 0.04], sat: [0.45, 0.12], lit: [0.24, 0.10] },
        cloudgiant:     { variant: 'cloudgiant',     front: true, scale: 3.8, texturePool: 'void',  bodyColor: 0xdfe8f0, accent: 0xaaddff, hue: [0.58, 0.05], sat: [0.15, 0.10], lit: [0.74, 0.10] },
        combatdrone:    { variant: 'combatdrone',    front: true, scale: 2.4, texturePool: 'metal', bodyColor: 0x55606a, accent: 0xff3322, hue: [0.58, 0.05], sat: [0.10, 0.06], lit: [0.46, 0.10] },
        bioslave:       { variant: 'bioslave',       scale: 2.8, texturePool: 'flesh', bodyColor: 0x5a6a3a, accent: 0x99ee44, hue: [0.26, 0.06], sat: [0.40, 0.12], lit: [0.36, 0.10] },

        // ── Batch 9 (IDs 482-516): crystals, serpents, reptiles, bog flora ──
        crystalhoarder: { variant: 'crystalentity', hoard: true, front: true, scale: 2.8, texturePool: 'crystal', bodyColor: 0x8a7acc, accent: 0xffdd44, hue: [0.74, 0.08], sat: [0.40, 0.12], lit: [0.50, 0.10] },
        crystalsiren:   { variant: 'crystalentity', siren: true, front: true, scale: 2.8, texturePool: 'crystal', bodyColor: 0x8acccc, accent: 0xff88dd, hue: [0.50, 0.08], sat: [0.40, 0.12], lit: [0.56, 0.10] },
        emeraldstalker: { variant: 'crystalentity', stalker: true, front: true, scale: 2.8, texturePool: 'crystal', bodyColor: 0x2a8a4a, accent: 0x88ff88, hue: [0.36, 0.06], sat: [0.50, 0.12], lit: [0.44, 0.10] },

        // ── Batch 10 (IDs 519-539): fire/frost beasts, treants, slimes ──────
        filthfiend:     { variant: 'trashling',    scale: 2.5, texturePool: 'wood',  bodyColor: 0x3a4a28, accent: 0x9acb55, hue: [0.22, 0.06], sat: [0.35, 0.12], lit: [0.28, 0.10] },
        flametouchedhellhound: { variant: 'hellhound', scale: 2.8, texturePool: 'flesh', bodyColor: 0x1a1414, accent: 0xff7733, hue: [0.03, 0.04], sat: [0.45, 0.12], lit: [0.22, 0.10] },
        frostslime:     { variant: 'frostslime',   front: true, scale: 2.6, texturePool: 'water', bodyColor: 0x88c8e8, accent: 0xddffff, hue: [0.54, 0.06], sat: [0.35, 0.12], lit: [0.58, 0.10] },

        // ── Batch 11 (IDs 540-567): leviathans, worms, ghosts, dryads ───────
        gatorghast:     { variant: 'gatorghast',   scale: 3.4, texturePool: 'flesh', bodyColor: 0x3a4a3a, accent: 0x88ffaa, hue: [0.36, 0.06], sat: [0.30, 0.12], lit: [0.30, 0.10] },
        harpybanshee:   { variant: 'harpybanshee', front: true, scale: 3.0, texturePool: 'void',  bodyColor: 0x6a5a7a, accent: 0xccbbff, hue: [0.74, 0.06], sat: [0.30, 0.12], lit: [0.42, 0.10] },

        // ── Batch 12 (IDs 569-590): dragons, beasts, krakens, elementals ────
        interdimensionaltourist:{ variant: 'whisperwisp', front: true, scale: 2.2, texturePool: 'void', bodyColor: 0xcce8ff, accent: 0xff88cc, hue: [0.72, 0.10], sat: [0.30, 0.12], lit: [0.62, 0.10] },
        ironhorse:      { variant: 'ironhorse',    scale: 3.0, texturePool: 'metal', bodyColor: 0x6a7079, accent: 0xff5522, hue: [0.58, 0.05], sat: [0.10, 0.06], lit: [0.42, 0.10] },
        landfillleviathan:{ variant: 'trashling', scale: 3.4, texturePool: 'wood', bodyColor: 0x4a4430, accent: 0x9acb55, hue: [0.14, 0.06], sat: [0.30, 0.12], lit: [0.30, 0.10] },

        // ── Batch 13 (IDs 592-610): jellies, marsh reptiles, mimics ─────────
        luminousdefender:{ variant: 'crystalentity', siren: true, front: true, scale: 2.8, texturePool: 'crystal', bodyColor: 0xe8e0a0, accent: 0xfff0aa, hue: [0.13, 0.06], sat: [0.30, 0.12], lit: [0.62, 0.10] },
        mimicshapedbox: { variant: 'chestmimic', front: true, scale: 2.6, texturePool: 'wood', bodyColor: 0x6a4a2a, accent: 0xcc44aa, hue: [0.09, 0.05], sat: [0.40, 0.12], lit: [0.34, 0.10] },

        // ── Batch 14 (IDs 613-632): molten beasts, fungoids, hydras ─────────
        nightmarebacteria:{ variant: 'bacteria', scale: 2.6, texturePool: 'void', bodyColor: 0x5a2a4a, accent: 0xcc44aa, hue: [0.86, 0.06], sat: [0.40, 0.12], lit: [0.32, 0.10] },

        // ── Batch 15 (IDs 644-668): phantoms, gorgons, mimics, unicorns ─────
        petrifyinggorgon:{ variant: 'gorgon', front: true, scale: 2.9, texturePool: 'stone', bodyColor: 0x9a8a7a, accent: 0xffdd44, hue: [0.10, 0.05], sat: [0.30, 0.12], lit: [0.44, 0.10] },
        platinummimic:  { variant: 'chestmimic', front: true, scale: 2.6, texturePool: 'metal', bodyColor: 0xccccdc, accent: 0x88ffff, hue: [0.58, 0.06], sat: [0.12, 0.08], lit: [0.62, 0.10] },
        prismaticpolychromus:{ variant: 'crystalentity', front: true, scale: 2.8, texturePool: 'crystal', bodyColor: 0xcc88ff, accent: 0x66ffcc, hue: [0.78, 0.10], sat: [0.45, 0.12], lit: [0.54, 0.10] },

        // ── Batch 16 (IDs 669-689): slimes, voidspawn, phoenix, desert reptiles ─
        ritualsentinel: { variant: 'totem', front: true, scale: 3.0, texturePool: 'wood', bodyColor: 0x7a5430, accent: 0xffcc44, hue: [0.09, 0.05], sat: [0.45, 0.10], lit: [0.40, 0.10] },
        rubbler:        { variant: 'trashling', scale: 2.6, texturePool: 'wood', bodyColor: 0x5a4a3a, accent: 0xaaaa88, hue: [0.10, 0.05], sat: [0.25, 0.12], lit: [0.32, 0.10] },
        sacredphoenix:  { variant: 'phoenix', front: true, scale: 3.0, texturePool: 'fire', bodyColor: 0xff7722, accent: 0xffdd44, hue: [0.06, 0.05], sat: [0.65, 0.12], lit: [0.50, 0.10] },

        // ── Batch 17 (IDs 692-716): all reuse existing builders ─────────────
        scrapforged:    { variant: 'trashling', scale: 2.8, texturePool: 'metal', bodyColor: 0x5a5550, accent: 0xaa8844, hue: [0.10, 0.05], sat: [0.20, 0.10], lit: [0.34, 0.10] },
        shadowbat:      { variant: 'vampirebat', front: true, scale: 2.4, texturePool: 'void', bodyColor: 0x1a1a22, accent: 0x6a3a8a, hue: [0.76, 0.06], sat: [0.30, 0.12], lit: [0.20, 0.08] },
        sonicmoltendrakebat:{ variant: 'vampirebat', front: true, scale: 2.6, texturePool: 'fire', bodyColor: 0x6a2a1a, accent: 0xff6622, hue: [0.04, 0.05], sat: [0.50, 0.12], lit: [0.34, 0.10] },

        // ── Batch 18 (IDs 718-749): spiky horrors, scorpions, dragonlings ───
        spineshade:     { variant: 'spikymonster', front: true, scale: 2.6, texturePool: 'bone', bodyColor: 0x2a2a33, accent: 0xccccdc, hue: [0.62, 0.06], sat: [0.20, 0.10], lit: [0.26, 0.10] },

        // ── Batch 19 (IDs 751-769): all reuse existing builders ─────────────
        totemadept:     { variant: 'totem', front: true, scale: 2.8, texturePool: 'wood', bodyColor: 0x6a5438, accent: 0x88cc66, hue: [0.12, 0.05], sat: [0.40, 0.10], lit: [0.38, 0.10] },

        // ── Batch 20 (IDs 770-815): all reuse existing builders ─────────────
        brimstonebehemutt:{ variant: 'hellhound', scale: 3.0, texturePool: 'flesh', bodyColor: 0x2a1410, accent: 0xff5522, hue: [0.03, 0.04], sat: [0.45, 0.12], lit: [0.24, 0.10] },
        cognitivebacteria:{ variant: 'bacteria', scale: 2.6, texturePool: 'void', bodyColor: 0x3a4a6a, accent: 0x66ccff, hue: [0.58, 0.06], sat: [0.40, 0.12], lit: [0.34, 0.10] },

        // ── Batch 21 (IDs 823-862): all reuse existing builders ─────────────
        dumpsterhead:   { variant: 'whisperwisp', front: true, scale: 2.4, texturePool: 'metal', bodyColor: 0x5a5040, accent: 0x99cc44, hue: [0.22, 0.06], sat: [0.30, 0.12], lit: [0.36, 0.10] },
        gildedguardian: { variant: 'crystalentity', front: true, scale: 2.9, texturePool: 'crystal', bodyColor: 0xc8a838, accent: 0xffee66, hue: [0.13, 0.05], sat: [0.45, 0.12], lit: [0.48, 0.10] },
        mindshield:     { variant: 'whisperwisp', front: true, scale: 2.4, texturePool: 'void', bodyColor: 0x6a8acc, accent: 0xaaddff, hue: [0.60, 0.06], sat: [0.35, 0.12], lit: [0.50, 0.10] },

        // ── Batch 22 (IDs 864-909): 1 new (turret); rest reuse ──────────────
        obsidiandreadnought:{ variant: 'crystalentity', front: true, scale: 3.0, texturePool: 'crystal', bodyColor: 0x2a2a33, accent: 0x9b40ff, hue: [0.78, 0.08], sat: [0.35, 0.12], lit: [0.24, 0.10] },
        plagueheap:     { variant: 'trashling', scale: 3.0, texturePool: 'wood', bodyColor: 0x5a5a3a, accent: 0x99cc44, hue: [0.22, 0.06], sat: [0.30, 0.12], lit: [0.32, 0.10] },
        realitywarper:  { variant: 'whisperwisp', front: true, scale: 2.6, texturePool: 'void', bodyColor: 0x8a66cc, accent: 0xff88ff, hue: [0.80, 0.08], sat: [0.35, 0.12], lit: [0.48, 0.10] },
        shardmaw:       { variant: 'crystalentity', front: true, scale: 2.8, texturePool: 'crystal', bodyColor: 0x6a8acc, accent: 0xccf0ff, hue: [0.60, 0.06], sat: [0.35, 0.12], lit: [0.46, 0.10] },

        // ── Batch 23 (IDs 913-950): all reuse existing builders ─────────────
        totemicprotector:{ variant: 'totem', front: true, scale: 3.0, texturePool: 'wood', bodyColor: 0x7a5430, accent: 0x66cc88, hue: [0.12, 0.05], sat: [0.40, 0.10], lit: [0.38, 0.10] },
        waridol:        { variant: 'totem', front: true, scale: 3.2, texturePool: 'stone', bodyColor: 0x6a4a3a, accent: 0xff5522, hue: [0.04, 0.05], sat: [0.40, 0.10], lit: [0.34, 0.10] },

        // ── Batch 24 (IDs 954-1002): all reuse existing builders ────────────
        totemicoverlord:{ variant: 'totem', front: true, scale: 3.4, texturePool: 'wood', bodyColor: 0x6a4a3a, accent: 0xffcc44, hue: [0.10, 0.05], sat: [0.40, 0.10], lit: [0.36, 0.10] },
        xylomantiflorous:{ variant: 'eldertreant', front: true, scale: 3.0, texturePool: 'wood', bodyColor: 0x4a5a2a, accent: 0xccff66, hue: [0.26, 0.06], sat: [0.40, 0.10], lit: [0.34, 0.10] },
        crystalgiant:   { variant: 'crystalentity', front: true, scale: 3.4, texturePool: 'crystal', bodyColor: 0x8aaccc, accent: 0xccf0ff, hue: [0.58, 0.06], sat: [0.35, 0.12], lit: [0.48, 0.10] },

        // ── Batch 25 (IDs 1005-1037): all reuse existing builders ───────────
        identitythief:  { variant: 'whisperwisp', front: true, scale: 2.4, texturePool: 'void', bodyColor: 0x6a6a8a, accent: 0xff88cc, hue: [0.80, 0.08], sat: [0.30, 0.12], lit: [0.46, 0.10] },

        // ── Batch 26 (IDs 1039-1053): all reuse existing builders ───────────
        mathematicseater:{ variant: 'whisperwisp', front: true, scale: 2.6, texturePool: 'void', bodyColor: 0x4a6a8a, accent: 0x88ffcc, hue: [0.50, 0.06], sat: [0.30, 0.12], lit: [0.44, 0.10] },
        quantumfluctuationep:{ variant: 'crystalentity', front: true, scale: 2.8, texturePool: 'crystal', bodyColor: 0x8a44cc, accent: 0x66ffff, hue: [0.76, 0.10], sat: [0.45, 0.12], lit: [0.46, 0.10] },
        temporalbarnacle:{ variant: 'crystalentity', front: true, scale: 2.6, texturePool: 'crystal', bodyColor: 0x6a8a8a, accent: 0xccffee, hue: [0.48, 0.06], sat: [0.35, 0.12], lit: [0.46, 0.10] },

        // ── Batch 27 (IDs 1054-1090): all reuse existing builders ───────────
        totemofsins:    { variant: 'totem', front: true, scale: 3.2, texturePool: 'wood', bodyColor: 0x5a2a3a, accent: 0xcc3366, hue: [0.96, 0.05], sat: [0.40, 0.10], lit: [0.32, 0.10] },
        whisperingdoor: { variant: 'totem', front: true, scale: 3.0, texturePool: 'wood', bodyColor: 0x4a3a2a, accent: 0x88ccff, hue: [0.10, 0.05], sat: [0.30, 0.10], lit: [0.34, 0.10] },
        // ── Batch 28 (IDs 1091-1124): 1 new builder (ophanim), rest reuse ───
        obsidianhellhound:{ variant: 'hellhound', scale: 2.8, texturePool: 'flesh', bodyColor: 0x18141c, accent: 0xff5522, hue: [0.04, 0.04], sat: [0.45, 0.12], lit: [0.20, 0.08] },
        ophanim:        { variant: 'ophanim', front: true, scale: 3.2, texturePool: 'fire', bodyColor: 0xd8b048, accent: 0xfff0aa, hue: [0.12, 0.05], sat: [0.45, 0.12], lit: [0.52, 0.10] },
        abortionmimic:  { variant: 'chestmimic', front: true, scale: 2.6, texturePool: 'flesh', bodyColor: 0x8a4a4a, accent: 0xcc4466, hue: [0.98, 0.04], sat: [0.40, 0.12], lit: [0.40, 0.10] },
        diamondmimicep: { variant: 'chestmimic', front: true, scale: 2.7, texturePool: 'crystal', bodyColor: 0xcce8f0, accent: 0x88ffff, hue: [0.54, 0.06], sat: [0.20, 0.10], lit: [0.66, 0.10] },
        // ── Batch 29 (IDs 1124-1358): ZERO new builders, all reuse ──────────
        pyroclastphoenix:{ variant: 'phoenix', front: true, scale: 3.0, texturePool: 'fire', bodyColor: 0xff5522, accent: 0xffcc44, hue: [0.04, 0.05], sat: [0.70, 0.12], lit: [0.48, 0.10] },
        dragonofwisdomenki:{ variant: 'ancientdragon', scale: 3.8, texturePool: 'water', bodyColor: 0x3a7ab0, accent: 0x88ddcc, wingColor: 0x4a6a9a, hue: [0.52, 0.06], sat: [0.45, 0.12], lit: [0.44, 0.10] },
        // ── Final batch (IDs 1450-1547): remaining slimes/elementals ────────
        crystallinebroodthing:{ variant: 'frostslime', front: true, scale: 2.5, texturePool: 'crystal', bodyColor: 0x8aaccc, accent: 0xccf0ff, hue: [0.58, 0.06], sat: [0.35, 0.12], lit: [0.48, 0.10] },
        gelatinousdronebug:{ variant: 'frostslime', front: true, scale: 2.5, texturePool: 'flesh', bodyColor: 0x5a8a5a, accent: 0x99ff99, hue: [0.34, 0.06], sat: [0.40, 0.12], lit: [0.42, 0.10] },
        bloateddronebug:{ variant: 'frostslime', front: true, scale: 2.6, texturePool: 'flesh', bodyColor: 0x6a7a4a, accent: 0xaacc66, hue: [0.22, 0.06], sat: [0.40, 0.12], lit: [0.38, 0.10] },
        gelatinousmirespawn:{ variant: 'frostslime', front: true, scale: 2.5, texturePool: 'flesh', bodyColor: 0x4a6a4a, accent: 0x88cc88, hue: [0.34, 0.06], sat: [0.35, 0.12], lit: [0.36, 0.10] },
        bloatedgel:     { variant: 'frostslime', front: true, scale: 2.6, texturePool: 'flesh', bodyColor: 0x7a7a5a, accent: 0xccccaa, hue: [0.14, 0.06], sat: [0.30, 0.12], lit: [0.42, 0.10] },
        glitteringbroodthing:{ variant: 'frostslime', front: true, scale: 2.5, texturePool: 'crystal', bodyColor: 0xcc66cc, accent: 0xffaaff, hue: [0.82, 0.08], sat: [0.45, 0.12], lit: [0.50, 0.10] },
        quiveringlarva: { variant: 'frostslime', front: true, scale: 2.3, texturePool: 'flesh', bodyColor: 0xd8a890, accent: 0xffccaa, hue: [0.07, 0.05], sat: [0.35, 0.12], lit: [0.52, 0.10] },
        crystallineglob:{ variant: 'frostslime', front: true, scale: 2.5, texturePool: 'crystal', bodyColor: 0x8a8acc, accent: 0xccccff, hue: [0.66, 0.06], sat: [0.40, 0.12], lit: [0.48, 0.10] },
        bloatedmold:    { variant: 'frostslime', front: true, scale: 2.6, texturePool: 'flesh', bodyColor: 0x5a6a3a, accent: 0x99cc55, hue: [0.26, 0.06], sat: [0.40, 0.12], lit: [0.36, 0.10] },
        chitteringpudding:{ variant: 'frostslime', front: true, scale: 2.5, texturePool: 'flesh', bodyColor: 0x8a6a4a, accent: 0xddaa66, hue: [0.10, 0.05], sat: [0.40, 0.12], lit: [0.42, 0.10] },
        acidicmirespawn:{ variant: 'frostslime', front: true, scale: 2.5, texturePool: 'flesh', bodyColor: 0x6a8a2a, accent: 0xaaff33, hue: [0.24, 0.06], sat: [0.50, 0.12], lit: [0.40, 0.10] },
        skitteringmold: { variant: 'frostslime', front: true, scale: 2.5, texturePool: 'flesh', bodyColor: 0x4a5a3a, accent: 0x88bb55, hue: [0.28, 0.06], sat: [0.40, 0.12], lit: [0.36, 0.10] },
        causticmirespawn:{ variant: 'frostslime', front: true, scale: 2.5, texturePool: 'flesh', bodyColor: 0x6a8a3a, accent: 0xbbff44, hue: [0.24, 0.06], sat: [0.50, 0.12], lit: [0.38, 0.10] },
        causticcarapace:{ variant: 'frostslime', front: true, scale: 2.6, texturePool: 'flesh', bodyColor: 0x5a7a3a, accent: 0xaaee44, hue: [0.26, 0.06], sat: [0.45, 0.12], lit: [0.36, 0.10] },
        twitchingdronebug:{ variant: 'frostslime', front: true, scale: 2.4, texturePool: 'flesh', bodyColor: 0x7a6a4a, accent: 0xccaa66, hue: [0.10, 0.05], sat: [0.40, 0.12], lit: [0.40, 0.10] },
        brackishpudding:{ variant: 'frostslime', front: true, scale: 2.5, texturePool: 'flesh', bodyColor: 0x3a5a5a, accent: 0x77ccbb, hue: [0.48, 0.06], sat: [0.35, 0.12], lit: [0.34, 0.10] },
        chitteringhuskbeetle:{ variant: 'frostslime', front: true, scale: 2.5, texturePool: 'flesh', bodyColor: 0x6a5a3a, accent: 0xccaa55, hue: [0.10, 0.05], sat: [0.40, 0.12], lit: [0.36, 0.10] },
        iridescentcrawler:{ variant: 'frostslime', front: true, scale: 2.5, texturePool: 'crystal', bodyColor: 0x6accaa, accent: 0xaaffee, hue: [0.46, 0.08], sat: [0.45, 0.12], lit: [0.48, 0.10] },
        bloatedcarapace:{ variant: 'frostslime', front: true, scale: 2.6, texturePool: 'flesh', bodyColor: 0x6a6a4a, accent: 0xbbbb66, hue: [0.16, 0.06], sat: [0.35, 0.12], lit: [0.38, 0.10] },
        raginggeist:    { variant: 'airelemental', front: true, scale: 3.0, texturePool: 'fire', bodyColor: 0xcc5522, accent: 0xffaa44, hue: [0.04, 0.05], sat: [0.45, 0.12], lit: [0.46, 0.10] },
        obsidianelemental:{ variant: 'bogelemental', scale: 3.2, texturePool: 'stone', bodyColor: 0x2a2a30, accent: 0x8a5acc, hue: [0.74, 0.06], sat: [0.25, 0.10], lit: [0.22, 0.08] },
        cracklinganimus:{ variant: 'airelemental', front: true, scale: 3.0, texturePool: 'void', bodyColor: 0x9aaecc, accent: 0xffee66, hue: [0.58, 0.06], sat: [0.30, 0.10], lit: [0.56, 0.10] },
        obsidiananimus: { variant: 'bogelemental', scale: 3.2, texturePool: 'stone', bodyColor: 0x26262c, accent: 0x9b6aff, hue: [0.74, 0.06], sat: [0.25, 0.10], lit: [0.22, 0.08] },
        frozenmonolith: { variant: 'bogelemental', scale: 3.2, texturePool: 'stone', bodyColor: 0x6a8aaa, accent: 0xddffff, hue: [0.56, 0.06], sat: [0.25, 0.10], lit: [0.44, 0.10] },
        cracklingrevenant:{ variant: 'aquaticelemental', front: true, scale: 2.9, texturePool: 'water', bodyColor: 0x3a7ab8, accent: 0x88ddff, hue: [0.58, 0.06], sat: [0.45, 0.12], lit: [0.46, 0.10] },
        frozenconstruct:{ variant: 'aquaticelemental', front: true, scale: 3.0, texturePool: 'water', bodyColor: 0x6a9ac8, accent: 0xddffff, hue: [0.56, 0.06], sat: [0.35, 0.12], lit: [0.50, 0.10] },
        frozensentinel: { variant: 'aquaticelemental', front: true, scale: 3.0, texturePool: 'water', bodyColor: 0x5a8ac0, accent: 0xccf0ff, hue: [0.57, 0.06], sat: [0.35, 0.12], lit: [0.48, 0.10] },
        glacialgeist:   { variant: 'aquaticelemental', front: true, scale: 2.9, texturePool: 'water', bodyColor: 0x7aaad8, accent: 0xeaffff, hue: [0.56, 0.06], sat: [0.30, 0.12], lit: [0.54, 0.10] },
        cracklingeffigy:{ variant: 'fireelemental', front: true, scale: 2.8, texturePool: 'fire', bodyColor: 0xff6622, accent: 0xffdd44, hue: [0.05, 0.05], sat: [0.70, 0.12], lit: [0.50, 0.10] },
        petrifiedsylph: { variant: 'fireelemental', front: true, scale: 2.8, texturePool: 'fire', bodyColor: 0xcc6633, accent: 0xffaa44, hue: [0.06, 0.05], sat: [0.55, 0.12], lit: [0.44, 0.10] },
        ragingsentinel: { variant: 'fireelemental', front: true, scale: 3.0, texturePool: 'fire', bodyColor: 0xff5522, accent: 0xffcc33, hue: [0.04, 0.05], sat: [0.70, 0.12], lit: [0.48, 0.10] },
        surgingconstruct:{ variant: 'fireelemental', front: true, scale: 2.9, texturePool: 'fire', bodyColor: 0xff7733, accent: 0xffee66, hue: [0.07, 0.05], sat: [0.65, 0.12], lit: [0.50, 0.10] },
        cracklingelemental:{ variant: 'sacredelemental', front: true, scale: 3.0, texturePool: 'fire', bodyColor: 0xe8d048, accent: 0xfff0aa, hue: [0.13, 0.05], sat: [0.45, 0.12], lit: [0.54, 0.10] },
        surgingelemental:{ variant: 'sacredelemental', front: true, scale: 3.0, texturePool: 'fire', bodyColor: 0xf0e070, accent: 0xffffcc, hue: [0.14, 0.05], sat: [0.40, 0.12], lit: [0.58, 0.10] },
        petrifiedmonolith:{ variant: 'sacredelemental', front: true, scale: 3.2, texturePool: 'stone', bodyColor: 0xc8c0a0, accent: 0xfff0cc, hue: [0.12, 0.05], sat: [0.25, 0.10], lit: [0.52, 0.10] },
        quartzcolossusspawn:{ variant: 'crystalentity', front: true, scale: 3.0, texturePool: 'crystal', bodyColor: 0xc8c0d8, accent: 0xf0e8ff, hue: [0.74, 0.06], sat: [0.25, 0.10], lit: [0.56, 0.10] },
        quartzgeist:    { variant: 'crystalentity', front: true, scale: 2.7, texturePool: 'crystal', bodyColor: 0xb8c8d8, accent: 0xe8f8ff, hue: [0.58, 0.06], sat: [0.25, 0.10], lit: [0.56, 0.10] },

        // ── QA fixes: description-conforming models ─────────────────────────
        goldenseahorse: { variant: 'seahorse', front: true, scale: 2.4, texturePool: 'water', bodyColor: 0xd8b048, accent: 0xffe088, hue: [0.12, 0.05], sat: [0.45, 0.12], lit: [0.50, 0.10] },
        pregseahorse:   { variant: 'seahorse', pregnant: true, front: true, scale: 2.5, texturePool: 'water', bodyColor: 0x4a8a7a, accent: 0xffcc66, hue: [0.46, 0.06], sat: [0.45, 0.12], lit: [0.44, 0.10] },
        sardineschool:  { variant: 'fishschool', front: true, scale: 2.8, texturePool: 'water', bodyColor: 0xaaccdd, accent: 0xeef4ff, hue: [0.56, 0.06], sat: [0.25, 0.10], lit: [0.58, 0.10] },
        // Procedural Slime enemies that were keyword-hijacked to insect/object models -> frostslime
        twitchingpudding:{ variant: 'frostslime', front: true, scale: 2.5, texturePool: 'flesh', bodyColor: 0x7a6a4a, accent: 0xccaa66, hue: [0.10, 0.05], sat: [0.40, 0.12], lit: [0.40, 0.10] },
        moltenglob:     { variant: 'frostslime', front: true, scale: 2.6, texturePool: 'fire', bodyColor: 0x8a3a1a, accent: 0xff7722, hue: [0.04, 0.05], sat: [0.55, 0.12], lit: [0.36, 0.10] },
        swarmingbroodthing:{ variant: 'frostslime', front: true, scale: 2.5, texturePool: 'flesh', bodyColor: 0x6a5a3a, accent: 0xbbaa55, hue: [0.12, 0.05], sat: [0.40, 0.12], lit: [0.38, 0.10] },
        crystallinecarapace:{ variant: 'frostslime', front: true, scale: 2.6, texturePool: 'crystal', bodyColor: 0x8a9acc, accent: 0xccddff, hue: [0.62, 0.06], sat: [0.35, 0.12], lit: [0.48, 0.10] },
        causticlarva:   { variant: 'frostslime', front: true, scale: 2.3, texturePool: 'flesh', bodyColor: 0x6a8a2a, accent: 0xbbff44, hue: [0.24, 0.06], sat: [0.50, 0.12], lit: [0.40, 0.10] },
        glitteringcrawler:{ variant: 'frostslime', front: true, scale: 2.5, texturePool: 'crystal', bodyColor: 0xcc88cc, accent: 0xffbbff, hue: [0.82, 0.08], sat: [0.45, 0.12], lit: [0.50, 0.10] },
        chitteringmirespawn:{ variant: 'frostslime', front: true, scale: 2.5, texturePool: 'flesh', bodyColor: 0x4a6a4a, accent: 0x88cc88, hue: [0.34, 0.06], sat: [0.35, 0.12], lit: [0.36, 0.10] },
        bloatedglob:    { variant: 'frostslime', front: true, scale: 2.6, texturePool: 'flesh', bodyColor: 0x6a6a4a, accent: 0xbbbb66, hue: [0.16, 0.06], sat: [0.35, 0.12], lit: [0.38, 0.10] },
        brackishooze:   { variant: 'frostslime', front: true, scale: 2.5, texturePool: 'flesh', bodyColor: 0x3a5a5a, accent: 0x77ccbb, hue: [0.48, 0.06], sat: [0.35, 0.12], lit: [0.34, 0.10] },
        bloatedooze:    { variant: 'frostslime', front: true, scale: 2.6, texturePool: 'flesh', bodyColor: 0x5a6a3a, accent: 0x99cc55, hue: [0.26, 0.06], sat: [0.40, 0.12], lit: [0.36, 0.10] },
        moltenmold:     { variant: 'frostslime', front: true, scale: 2.5, texturePool: 'fire', bodyColor: 0x7a3a1a, accent: 0xff6622, hue: [0.05, 0.05], sat: [0.55, 0.12], lit: [0.34, 0.10] },
        gelatinousglob: { variant: 'frostslime', front: true, scale: 2.5, texturePool: 'flesh', bodyColor: 0x4a7a4a, accent: 0x88ee88, hue: [0.34, 0.06], sat: [0.40, 0.12], lit: [0.40, 0.10] },
        twitchingooze:  { variant: 'frostslime', front: true, scale: 2.5, texturePool: 'flesh', bodyColor: 0x6a6a3a, accent: 0xbbcc55, hue: [0.18, 0.06], sat: [0.40, 0.12], lit: [0.38, 0.10] },
        sludgycrawler:  { variant: 'frostslime', front: true, scale: 2.5, texturePool: 'flesh', bodyColor: 0x4a4a3a, accent: 0x99aa55, hue: [0.20, 0.06], sat: [0.30, 0.12], lit: [0.32, 0.10] },
        swarmingswarmling:{ variant: 'frostslime', front: true, scale: 2.4, texturePool: 'flesh', bodyColor: 0x6a7a4a, accent: 0xaacc66, hue: [0.24, 0.06], sat: [0.40, 0.12], lit: [0.40, 0.10] },
        crystallinedronebug:{ variant: 'frostslime', front: true, scale: 2.5, texturePool: 'crystal', bodyColor: 0x8aaccc, accent: 0xccf0ff, hue: [0.58, 0.06], sat: [0.35, 0.12], lit: [0.48, 0.10] },
        quiveringcarapace:{ variant: 'frostslime', front: true, scale: 2.6, texturePool: 'flesh', bodyColor: 0x6a5a5a, accent: 0xccaaaa, hue: [0.00, 0.05], sat: [0.30, 0.12], lit: [0.40, 0.10] },
        acidiclarva:    { variant: 'frostslime', front: true, scale: 2.3, texturePool: 'flesh', bodyColor: 0x6a8a2a, accent: 0xaaff33, hue: [0.24, 0.06], sat: [0.50, 0.12], lit: [0.40, 0.10] },
        quiveringhivemind:{ variant: 'frostslime', front: true, scale: 2.6, texturePool: 'flesh', bodyColor: 0x5a5a6a, accent: 0xaaaacc, hue: [0.66, 0.06], sat: [0.30, 0.12], lit: [0.40, 0.10] },
        crystallinelarva:{ variant: 'frostslime', front: true, scale: 2.3, texturePool: 'crystal', bodyColor: 0x8a9acc, accent: 0xccddff, hue: [0.62, 0.06], sat: [0.35, 0.12], lit: [0.48, 0.10] },
        crystallinegel: { variant: 'frostslime', front: true, scale: 2.5, texturePool: 'crystal', bodyColor: 0x9a9acc, accent: 0xd0d0ff, hue: [0.66, 0.06], sat: [0.35, 0.12], lit: [0.50, 0.10] },
        quiveringbroodthing:{ variant: 'frostslime', front: true, scale: 2.5, texturePool: 'flesh', bodyColor: 0x6a5a4a, accent: 0xccaa77, hue: [0.10, 0.05], sat: [0.35, 0.12], lit: [0.38, 0.10] },
        swarmingmirespawn:{ variant: 'frostslime', front: true, scale: 2.5, texturePool: 'flesh', bodyColor: 0x4a6a4a, accent: 0x99cc66, hue: [0.34, 0.06], sat: [0.40, 0.12], lit: [0.38, 0.10] },
        gelatinoushuskbeetle:{ variant: 'frostslime', front: true, scale: 2.5, texturePool: 'flesh', bodyColor: 0x5a6a3a, accent: 0xaacc55, hue: [0.26, 0.06], sat: [0.40, 0.12], lit: [0.38, 0.10] }
    };

    class OddityBattler3D extends Base {
        constructor(scale, offsetY, battler, weaponType, creatureType) {
            const profile = O_PROFILES[creatureType] || O_PROFILES.marionette;
            super(scale, offsetY, battler, profile, 0, creatureType || 'marionette');
            this.variant = profile.variant;
            this._materials = [];
            this._baseY = null;
            this._floaters = [];
            // Bipedal oddities (marionette/war machine) face front; the others
            // (flesh/eye/hand/grimoire) keep the angled 3/4 view. Newer profiles
            // opt in via `front: true`.
            if (this.variant === 'marionette' || this.variant === 'warmachine' || this.variant === 'invertedangel' || profile.front) this.facingYaw = 0;
        }

        async load(physicsWorld, startX = 0, startY = 0, startZ = 0) {
            this.physicsWorld = physicsWorld;
            switch (this.variant) {
                case 'warmachine':  this._buildWmAssault(); break;
                case 'mar_phantom':       this._buildMarPhantom(); break;
                case 'mar_twisted':       this._buildMarTwisted(); break;
                case 'mar_haunted':       this._buildMarHaunted(); break;
                case 'mar_mannequin':     this._buildMarMannequin(); break;
                case 'mar_backwards':     this._buildMarBackwards(); break;
                case 'mar_stringbound':   this._buildMarStringbound(); break;
                case 'mar_meatpuppet':    this._buildMarMeatpuppet(); break;
                case 'mar_boneorchestra': this._buildMarBoneorchestra(); break;
                case 'mar_puppetcorpse':  this._buildMarPuppetcorpse(); break;
                case 'mar_babydoll':      this._buildMarBabydoll(); break;
                case 'wm_assault':      this._buildWmAssault(); break;
                case 'wm_battlemech':   this._buildWmBattlemech(); break;
                case 'wm_battlemechep': this._buildWmBattlemechep(); break;
                case 'wm_arsenal':      this._buildWmArsenal(); break;
                case 'wm_tank':         this._buildWmTank(); break;
                case 'wm_cogwork':      this._buildWmCogwork(); break;
                case 'wm_ironbastion':  this._buildWmIronbastion(); break;
                case 'wm_marauder':     this._buildWmMarauder(); break;
                case 'wm_veteranbot':   this._buildWmVeteranbot(); break;
                case 'scrapbot':        this._buildScrapbot(); break;
                case 'flesh':       this._buildFleshHorror(); break;
                case 'eye':         this._buildFloatingEye(); break;
                case 'hand':        this._buildCrawlingHand(); break;
                case 'grimoire':    this._buildGrimoire(); break;
                case 'insideoutwhale':   this._buildInsideOutWhale(); break;
                case 'invertedangel':    this._buildInvertedAngel(); break;
                case 'insideoutcritter': this._buildInsideOutCritter(); break;
                case 'tidesorcerer':     this._buildTideSorcerer(); break;
                case 'timberwoodshaman': this._buildTimberwoodShaman(); break;
                case 'toothfairy':       this._buildToothFairy(); break;
                case 'totem':            this._buildTotem(); break;
                case 'toxicsprayer':     this._buildToxicSprayer(); break;
                case 'trashling':        this._buildTrashling(); break;
                case 'tridenthunter':    this._buildTridentHunter(); break;
                case 'mammothcalf':      this._buildMammothCalf(); break;
                case 'twilightsatyr':    this._buildTwilightSatyr(); break;
                case 'umbralbasilisk':   this._buildUmbralBasilisk(); break;
                case 'vampirebat':       this._buildVampireBat(); break;
                case 'venomoussnake':    this._buildVenomousSnake(); break;
                case 'webweaver':        this._buildWebweaver(); break;
                case 'whisperwisp':      this._buildWhisperWisp(); break;
                case 'wildrabbit':       this._buildWildRabbit(); break;
                case 'willowisplamp':    this._buildWillOWispLamp(); break;
                case 'abyssalcrab':      this._buildAbyssalCrab(); break;
                case 'hallucigenia':     this._buildHallucigenia(); break;
                case 'abyssalhorror':    this._buildAbyssalHorror(); break;
                case 'abyssaltentacler': this._buildAbyssalTentacler(); break;
                case 'acidbombardier':   this._buildAcidBombardier(); break;
                case 'acidictidecaller': this._buildAcidicTidecaller(); break;
                case 'airelemental':     this._buildAirElemental(); break;
                case 'ancientdragon':    this._buildAncientDragon(); break;
                case 'anguishphantom':   this._buildAnguishPhantom(); break;
                case 'aquaticelemental': this._buildAquaticElemental(); break;
                case 'aquaticmantis':    this._buildAquaticMantis(); break;
                case 'assassinwasp':     this._buildAssassinWasp(); break;
                case 'reptilian':        this._buildReptilian(); break;
                case 'bloodwidow':       this._buildBloodWidow(); break;
                case 'bogelemental':     this._buildBogElemental(); break;
                case 'bogmutant':        this._buildBogMutant(); break;
                case 'brinewisp':        this._buildBrineWisp(); break;
                case 'theropod':         this._buildTheropod(); break;
                case 'chainfury':        this._buildChainFury(); break;
                case 'beast':            this._buildBeast(); break;
                case 'cinderweaver':     this._buildCinderWeaver(); break;
                case 'hellhound':        this._buildHellhound(); break;
                case 'cloudgiant':       this._buildCloudGiant(); break;
                case 'combatdrone':      this._buildCombatDrone(); break;
                case 'coralturtle':      this._buildCoralTurtle(); break;
                case 'bioslave':         this._buildBioslave(); break;
                case 'crystalentity':    this._buildCrystalEntity(); break;
                case 'serpent':          this._buildSerpent(); break;
                case 'crystalturtle':    this._buildCrystalTurtle(); break;
                case 'eldertreant':      this._buildElderTreant(); break;
                case 'electrospider':    this._buildElectroSpider(); break;
                case 'tickswarm':        this._buildTickSwarm(); break;
                case 'fireelemental':    this._buildFireElemental(); break;
                case 'centipede':        this._buildCentipede(); break;
                case 'scarab':           this._buildScarab(); break;
                case 'frostslime':       this._buildFrostSlime(); break;
                case 'gatorghast':       this._buildGatorghast(); break;
                case 'snail':            this._buildSnail(); break;
                case 'segmentworm':      this._buildSegmentWorm(); break;
                case 'harpybanshee':     this._buildHarpyBanshee(); break;
                case 'dryad':            this._buildDryad(); break;
                case 'termite':          this._buildTermite(); break;
                case 'hydroengine':      this._buildHydroEngine(); break;
                case 'ironhorse':        this._buildIronHorse(); break;
                case 'tentacledcreature': this._buildTentacledCreature(); break;
                case 'chestmimic':       this._buildChestMimic(); break;
                case 'fungoid':          this._buildFungoid(); break;
                case 'hydra':            this._buildHydra(); break;
                case 'bacteria':         this._buildBacteria(); break;
                case 'gorgon':           this._buildGorgon(); break;
                case 'phoenix':          this._buildPhoenix(); break;
                case 'spikymonster':     this._buildSpikyMonster(); break;
                case 'scorpion':         this._buildScorpion(); break;
                case 'turret':           this._buildTurret(); break;
                case 'ophanim':          this._buildOphanim(); break;
                case 'sacredelemental':  this._buildSacredElemental(); break;
                case 'seahorse':         this._buildSeahorse(); break;
                case 'fishschool':       this._buildFishSchool(); break;
                default:            this._buildMarionette(); break;
            }
            this.model = this.bodyGroup;
            this.applyModelScale();
            this.loaded = true;
            return this;
        }

        _mat(color, opacity, rough, emissive) {
            const m = new THREE.MeshStandardMaterial({
                color, roughness: (rough === undefined ? 0.7 : rough),
                emissive: new THREE.Color(emissive || 0x000000), emissiveIntensity: emissive ? 0.5 : 0,
                transparent: true, opacity: (opacity === undefined ? 1.0 : opacity)
            });
            this._materials.push(m);
            return m;
        }
        _skinMat(color, rough) { return this.applySkin(this._mat(color, 1.0, rough === undefined ? 0.7 : rough)); }
        _eye(parent, x, y, z, r, accent) {
            const eye = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 12), this._mat(0xffffff, 1.0, 0.2));
            eye.position.set(x, y, z);
            const iris = new THREE.Mesh(new THREE.SphereGeometry(r * 0.55, 10, 10), this._mat(accent || 0x3366cc, 1.0, 0.2, accent));
            iris.position.set(0, 0, r * 0.6); eye.add(iris);
            const pupil = new THREE.Mesh(new THREE.SphereGeometry(r * 0.28, 8, 8), this._mat(0x000000, 1.0, 0.1));
            pupil.position.set(0, 0, r * 0.85); eye.add(pupil);
            parent.add(eye); return eye;
        }
        _mapCommon(parts) {
            const m = this._partMeshMap;
            const set = (keys, mesh) => { if (mesh) keys.forEach(k => { m[k] = mesh; }); };
            set(['HEAD', 'SKULL', 'BRAIN', 'EYE', 'EYES', 'FACE', 'SENSOR_ARRAY', 'SENSORS', 'CAP'], parts.head);
            set(['TORSO', 'BODY', 'CORE', 'RIBCAGE', 'MASS', 'CHASSIS', 'MEMBRANE', 'NUCLEUS', 'HEART', 'HEART_CHAMBER', 'TRASH_PILE'], parts.body);
            set(['LEFT_ARM', 'LEFT_UPPER_ARM', 'TENTACLE_ONE', 'PINCER_LEFT', 'LIMBS', 'CLAWS'], parts.leftArm);
            set(['RIGHT_ARM', 'RIGHT_UPPER_ARM', 'ARM_CANNON', 'TENTACLE_TWO', 'PINCER_RIGHT', 'GUN_BARREL'], parts.rightArm);
            set(['LEFT_LEG', 'LEFT_THIGH', 'LEG_JOINTS', 'FEET', 'FOOT', 'ROOTS', 'STALK'], parts.leftLeg);
            set(['RIGHT_LEG', 'RIGHT_THIGH', 'FRONT_LEFT_PAW', 'GEAR_LEGS'], parts.rightLeg);
        }
        _simpleCascade(parts) {
            this._cascadeRules = [
                { gone: ['TORSO', 'BODY', 'CORE', 'RIBCAGE', 'MASS', 'CHASSIS', 'MEMBRANE', 'NUCLEUS'], hide: [parts.body, parts.head, parts.leftArm, parts.rightArm, parts.leftLeg, parts.rightLeg].filter(Boolean) },
                { gone: ['HEAD', 'SKULL', 'BRAIN', 'EYE', 'EYES'], hide: [parts.head].filter(Boolean) },
                { gone: ['LEFT_ARM', 'LEFT_UPPER_ARM', 'TENTACLE_ONE', 'PINCER_LEFT'], hide: [parts.leftArm].filter(Boolean) },
                { gone: ['RIGHT_ARM', 'RIGHT_UPPER_ARM', 'ARM_CANNON', 'GUN_BARREL'], hide: [parts.rightArm].filter(Boolean) },
                { gone: ['LEFT_LEG', 'LEFT_THIGH', 'LEG_JOINTS'], hide: [parts.leftLeg].filter(Boolean) },
                { gone: ['RIGHT_LEG', 'RIGHT_THIGH'], hide: [parts.rightLeg].filter(Boolean) },
            ];
        }

        // ── Marionette: jointed puppet hung from a control cross + strings ───
        _buildMarionette() {
            const p = this.profile;
            const wood = this._skinMat(p.bodyColor, 0.7);
            this.body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.7, 8), wood);
            this.body.position.set(0, 1.2, 0); this.bodyGroup.add(this.body);
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 14), wood); this.head.add(h);
            this._eye(this.head, -0.12, 0.04, 0.22, 0.08, p.accent);
            this._eye(this.head, 0.12, 0.04, 0.22, 0.08, p.accent);
            const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.12), wood); jaw.position.set(0, -0.2, 0.16); this.head.add(jaw); this.head._jaw = jaw;
            this.head.position.set(0, 1.75, 0); this.bodyGroup.add(this.head);
            this.leftArm = this._limb(wood, -0.34, 1.45, true);
            this.rightArm = this._limb(wood, 0.34, 1.45, true);
            this.leftLeg = this._limb(wood, -0.16, 0.85, false);
            this.rightLeg = this._limb(wood, 0.16, 0.85, false);
            // Control cross + strings.
            const barMat = this._mat(0x3a2a18, 1.0, 0.8);
            this.controlBar = new THREE.Group();
            const bx = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.06), barMat);
            const bz = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.8), barMat);
            this.controlBar.add(bx, bz); this.controlBar.position.set(0, 3.1, 0);
            this.bodyGroup.add(this.controlBar); this._floaters.push(this.controlBar);
            const strMat = this._mat(0xddddcc, 0.5, 0.6);
            const string = (x, z, y2) => { const len = 3.1 - y2; const s = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, len, 4), strMat); s.position.set(x, (3.1 + y2) / 2, z); this.bodyGroup.add(s); return s; };
            this.strings = [string(-0.34, 0, 1.6), string(0.34, 0, 1.6), string(-0.16, 0, 1.0), string(0.16, 0, 1.0), string(0, 0, 2.0)];
            this._mapCommon({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm, leftLeg: this.leftLeg, rightLeg: this.rightLeg });
            this._simpleCascade({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm, leftLeg: this.leftLeg, rightLeg: this.rightLeg });
        }
        _limb(mat, x, y, arm) {
            const g = new THREE.Group();
            const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.3, 6), mat); upper.position.y = -0.15; g.add(upper);
            const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.3, 6), mat); lower.position.y = -0.5; g.add(lower);
            const end = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), mat); end.position.y = -0.68; g.add(end);
            g.position.set(x, y, 0); g._arm = arm; g._x = x;
            this.bodyGroup.add(g); return g;
        }
        // Parameterised marionette rig reused by the bespoke puppet one-offs.
        _marRig(mat, o) {
            o = o || {};
            this.body = new THREE.Mesh(o.bodyGeom || new THREE.CylinderGeometry(0.26, 0.32, 0.7, 8), mat); this.body.position.set(0, 1.2, 0); this.bodyGroup.add(this.body);
            this.head = new THREE.Group();
            const h = new THREE.Mesh(o.headGeom || new THREE.SphereGeometry(0.3, 14, 14), o.headMat || mat); this.head.add(h);
            this._eye(this.head, -0.12, 0.04, 0.22, 0.08, this.profile.accent);
            this._eye(this.head, 0.12, 0.04, 0.22, 0.08, this.profile.accent);
            if (o.teeth) for (let i = 0; i < 6; i++) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 4), this._mat(0xffffff, 1, 0.3)); t.position.set(-0.12 + i * 0.048, -0.16, 0.24); this.head.add(t); }
            else { const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.12), o.headMat || mat); jaw.position.set(0, -0.2, 0.16); this.head.add(jaw); this.head._jaw = jaw; }
            this.head.position.set(0, o.headY || 1.75, o.headZ || 0); if (o.headRotY) this.head.rotation.y = o.headRotY; this.bodyGroup.add(this.head);
            this.leftArm = this._limb(mat, -0.34, 1.45, true); this.rightArm = this._limb(mat, 0.34, 1.45, true);
            this.leftLeg = this._limb(mat, -0.16, 0.85, false); this.rightLeg = this._limb(mat, 0.16, 0.85, false);
            if (o.strings !== false) this._marStrings();
            this._mapCommon({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm, leftLeg: this.leftLeg, rightLeg: this.rightLeg });
            this._simpleCascade({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm, leftLeg: this.leftLeg, rightLeg: this.rightLeg });
        }
        _marStrings() {
            const barMat = this._mat(0x3a2a18, 1.0, 0.8);
            this.controlBar = new THREE.Group();
            this.controlBar.add(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.06), barMat), new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.8), barMat));
            this.controlBar.position.set(0, 3.1, 0); this.bodyGroup.add(this.controlBar); this._floaters.push(this.controlBar);
            const strMat = this._mat(0xddddcc, 0.5, 0.6);
            const string = (x, z, y2) => { const len = 3.1 - y2; const s = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, len, 4), strMat); s.position.set(x, (3.1 + y2) / 2, z); this.bodyGroup.add(s); return s; };
            this.strings = [string(-0.34, 0, 1.6), string(0.34, 0, 1.6), string(-0.16, 0, 1.0), string(0.16, 0, 1.0), string(0, 0, 2.0)];
        }
        _buildMarPhantom() { const w = this._skinMat(this.profile.bodyColor, 0.8); this._marRig(w, {}); for (let i = 0; i < 6; i++) { const a = i * 2.39996; const sp = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.2, 4), w); sp.position.set(Math.cos(a) * 0.28, Math.sin(i) * 0.25, Math.sin(a) * 0.28); sp.rotation.z = Math.cos(a); this.body.add(sp); } }
        _buildMarTwisted() { const por = this._skinMat(this.profile.bodyColor, 0.3); this._marRig(por, { headMat: por, teeth: true }); }
        _buildMarHaunted() { const w = this._skinMat(this.profile.bodyColor, 0.8); this._marRig(w, { bodyGeom: new THREE.BoxGeometry(0.5, 0.7, 0.35), headGeom: new THREE.BoxGeometry(0.45, 0.5, 0.45) }); }
        _buildMarMannequin() { const w = this._skinMat(this.profile.bodyColor, 0.5); this._marRig(w, { strings: false }); }
        _buildMarBackwards() { const por = this._skinMat(this.profile.bodyColor, 0.4); this._marRig(por, { headMat: por, headRotY: Math.PI }); }
        _buildMarStringbound() { const w = this._skinMat(this.profile.bodyColor, 0.7); this._marRig(w, { bodyGeom: new THREE.CylinderGeometry(0.3, 0.4, 1.0, 8), headY: 2.0 }); this._limb(w, -0.52, 1.5, true); this._limb(w, 0.52, 1.5, true); }
        _buildMarMeatpuppet() { const flesh = this._skinMat(this.profile.bodyColor, 0.4); this._marRig(flesh, { headMat: flesh, teeth: true }); for (let i = 0; i < 4; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 0.02), this._mat(0x442222, 1, 0.6)); st.position.set(0, -0.2 + i * 0.18, 0.32); this.body.add(st); } }
        _buildMarBoneorchestra() { const bone = this._skinMat(this.profile.bodyColor, 0.5); this._marRig(bone, { headMat: bone, teeth: true }); const skull2 = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), bone); skull2.position.set(0.42, 1.4, 0.1); this.bodyGroup.add(skull2); const flute = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6), this._mat(0xe8e0d0, 1, 0.5)); flute.position.set(-0.4, 1.3, 0.25); flute.rotation.z = 0.5; this.bodyGroup.add(flute); }
        _buildMarPuppetcorpse() { const w = this._skinMat(this.profile.bodyColor, 0.7); this._marRig(w, {}); this.body.rotation.x = 0.15; for (let i = 0; i < 4; i++) { const a = i * 1.8; const dr = new THREE.Mesh(new THREE.SphereGeometry(0.05, 7, 7), this._mat(0x4a5530, 1, 0.5)); dr.scale.y = 1.5; dr.position.set(Math.cos(a) * 0.22, -0.1, Math.sin(a) * 0.22); this.body.add(dr); } }
        _buildMarBabydoll() {
            const por = this._skinMat(this.profile.bodyColor, 0.3);
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 18, 18), por); this.body.position.set(0, 0.7, 0); this.bodyGroup.add(this.body); this.head = this.body;
            this._eye(this.body, -0.22, 0.08, 0.5, 0.12, this.profile.accent); this._eye(this.body, 0.22, 0.08, 0.5, 0.12, this.profile.accent);
            const crack = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.4, 0.02), this._mat(0x222222, 1, 0.5)); crack.position.set(0.12, 0.88, 0.56); crack.rotation.z = 0.4; this.bodyGroup.add(crack);
            for (const x of [-0.22, 0.22]) { const tr = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), this._mat(this.profile.accent, 0.8, 0.2, this.profile.accent)); tr.scale.y = 2; tr.position.set(x, 0.5, 0.55); this.bodyGroup.add(tr); }
            this._partMeshMap = { HEAD: this.body, BODY: this.body, CORE: this.body, FACE: this.body };
            this._cascadeRules = [{ gone: ['BODY', 'CORE', 'HEAD'], hide: [this.body] }];
        }

        // ── War machine: armored mech with a cannon arm ──────────────────────
        _buildWarMachine() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.4);
            this.body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 0.7), mat);
            this.body.position.set(0, 1.3, 0); this.bodyGroup.add(this.body);
            const plate = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 0.78), mat); plate.position.set(0, 1.55, 0); this.bodyGroup.add(plate);
            this.head = new THREE.Group();
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat); this.head.add(dome);
            this.headEye = this._eye(this.head, 0, 0.02, 0.22, 0.1, p.accent);
            this.head.position.set(0, 2.0, 0); this.bodyGroup.add(this.head);
            // Cannon arm (right).
            this.rightArm = new THREE.Group();
            const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), mat); this.rightArm.add(shoulder);
            const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.9, 10), mat); barrel.rotation.x = Math.PI / 2; barrel.position.z = 0.5; this.rightArm.add(barrel);
            const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.04, 6, 12), this._mat(p.accent, 0.9, 0.3, p.accent)); muzzle.position.z = 0.95; this.rightArm.add(muzzle); this.rightArm._muzzle = muzzle;
            this.rightArm.position.set(0.65, 1.4, 0); this.bodyGroup.add(this.rightArm);
            // Piston claw (left).
            this.leftArm = new THREE.Group();
            const la = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.7, 8), mat); la.position.y = -0.3; this.leftArm.add(la);
            for (let i = -1; i <= 1; i += 2) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 4), mat); c.position.set(i * 0.08, -0.7, 0.05); c.rotation.x = Math.PI; this.leftArm.add(c); }
            this.leftArm.position.set(-0.6, 1.5, 0); this.bodyGroup.add(this.leftArm);
            // Heavy legs.
            this.leftLeg = this._mechLeg(mat, -0.32); this.rightLeg = this._mechLeg(mat, 0.32);
            this._mapCommon({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm, leftLeg: this.leftLeg, rightLeg: this.rightLeg });
            this._simpleCascade({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm, leftLeg: this.leftLeg, rightLeg: this.rightLeg });
        }
        _mechLeg(mat, x) {
            const g = new THREE.Group();
            const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.6, 0.26), mat); thigh.position.y = -0.35; g.add(thigh);
            const foot = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 0.5), mat); foot.position.set(0, -0.75, 0.1); g.add(foot);
            g.position.set(x, 0.8, 0); this.bodyGroup.add(g); return g;
        }
        // Parameterised mech rig reused by the bespoke war-machine one-offs.
        _mechGun(mat) { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), mat)); const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.9, 10), mat); barrel.rotation.x = Math.PI / 2; barrel.position.z = 0.5; g.add(barrel); const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.04, 6, 12), this._mat(this.profile.accent, 0.9, 0.3, this.profile.accent)); muzzle.position.z = 0.95; g.add(muzzle); g._muzzle = muzzle; return g; }
        _mechClaw(mat) { const g = new THREE.Group(); const la = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.7, 8), mat); la.position.y = -0.3; g.add(la); for (let i = -1; i <= 1; i += 2) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 4), mat); c.position.set(i * 0.08, -0.7, 0.05); c.rotation.x = Math.PI; g.add(c); } return g; }
        _mechRig(mat, o) {
            o = o || {};
            this.body = new THREE.Mesh(o.bodyGeom || new THREE.BoxGeometry(1.0, 1.0, 0.7), mat); this.body.position.set(0, 1.3, 0); this.bodyGroup.add(this.body);
            if (o.plate !== false) { const plate = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 0.78), mat); plate.position.set(0, 1.55, 0); this.bodyGroup.add(plate); }
            this.head = new THREE.Group();
            const dome = new THREE.Mesh(o.headGeom || new THREE.SphereGeometry(0.26, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat); this.head.add(dome);
            this.headEye = this._eye(this.head, 0, 0.02, 0.22, 0.1, this.profile.accent);
            // The head sits on whatever shoulder this chassis actually has.
            // Bodies here come in four sizes; at one fixed height the dome
            // hovered over the shoulders of every mech in the family.
            dome.geometry.computeBoundingBox();
            const bodyH = (this.body.geometry.parameters && this.body.geometry.parameters.height) || 1.0;
            const shoulder = Math.max(1.3 + bodyH / 2, o.plate !== false ? 1.8 : 0);
            this._shoulderY = shoulder;
            this.head.position.set(0, o.headY !== undefined ? o.headY : shoulder - dome.geometry.boundingBox.min.y - 0.06, 0);
            this.bodyGroup.add(this.head);
            this.rightArm = (o.rightArm === 'claw') ? this._mechClaw(mat) : this._mechGun(mat); this.rightArm.position.set(0.65, 1.4, 0); this.bodyGroup.add(this.rightArm);
            this.leftArm = (o.leftArm === 'gun') ? this._mechGun(mat) : this._mechClaw(mat); this.leftArm.position.set(-0.6, 1.5, 0); this.bodyGroup.add(this.leftArm);
            this.leftLeg = this._mechLeg(mat, -0.32); this.rightLeg = this._mechLeg(mat, 0.32);
            this._mapCommon({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm, leftLeg: this.leftLeg, rightLeg: this.rightLeg });
            this._simpleCascade({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm, leftLeg: this.leftLeg, rightLeg: this.rightLeg });
        }
        _buildWmAssault() { this._mechRig(this._skinMat(this.profile.bodyColor, 0.4), {}); }
        _buildWmBattlemech() { const m = this._skinMat(this.profile.bodyColor, 0.4); this._mechRig(m, { bodyGeom: new THREE.BoxGeometry(1.2, 1.2, 0.85) }); const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, 0.18), this._mat(0x9aa4ac, 1, 0.3)); blade.position.set(-0.6, 0.9, 0.1); this.leftArm.add(blade); }
        _buildWmBattlemechep() { const m = this._skinMat(this.profile.bodyColor, 0.4); this._mechRig(m, {}); for (let k = 0; k < 2; k++) { const sh = new THREE.Mesh(new THREE.TorusGeometry(0.8 + k * 0.15, 0.04, 8, 28), this._mat(this.profile.accent, 0.6, 0.2, this.profile.accent)); const g = new THREE.Group(); g.add(sh); sh.position.y = 1.4; g.rotation.set(k * 0.8, k, 0); this.bodyGroup.add(g); this._floaters.push(g); } }
        _buildWmArsenal() { const m = this._skinMat(this.profile.bodyColor, 0.4); this._mechRig(m, { plate: false }); this.orbWeapons = new THREE.Group(); for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const sw = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 0.05), this._mat(0x9aa4ac, 1, 0.3, this.profile.accent)); sw.position.set(Math.cos(a) * 1.0, 1.6, Math.sin(a) * 1.0); this.orbWeapons.add(sw); } this.bodyGroup.add(this.orbWeapons); this._floaters.push(this.orbWeapons); }
        _buildWmTank() {
            const m = this._skinMat(this.profile.bodyColor, 0.4);
            this.body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 1.0), m); this.body.position.set(0, 0.8, 0); this.bodyGroup.add(this.body);
            this.head = new THREE.Group(); const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 0.4, 12), m); this.head.add(turret); const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.0, 10), m); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0, 0.6); this.head.add(barrel); const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 6, 12), this._mat(this.profile.accent, 0.9, 0.3, this.profile.accent)); muzzle.position.set(0, 0, 1.1); this.head.add(muzzle); this.head._muzzle = muzzle;
            this.head.position.set(0, 1.15, 0); this.bodyGroup.add(this.head);
            for (const x of [-0.78, 0.78]) { const tread = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.55, 1.2), this._mat(0x2a2a2e, 1, 0.7)); tread.position.set(x, 0.55, 0); this.bodyGroup.add(tread); }
            this.leftLeg = this.rightLeg = this.leftArm = this.rightArm = null;
            this._mapCommon({ head: this.head, body: this.body, leftArm: this.body, rightArm: this.body, leftLeg: this.body, rightLeg: this.body });
            this._simpleCascade({ head: this.head, body: this.body });
        }
        _buildWmCogwork() { const m = this._skinMat(this.profile.bodyColor, 0.5); this._mechRig(m, {}); for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; const gear = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.07, 5, 10), this._mat(0x8a6a3a, 1, 0.5)); gear.position.set(Math.cos(a) * 0.4, 1.3 + Math.sin(i) * 0.3, 0.4); this.body.add(gear); } }
        _buildWmIronbastion() { const m = this._skinMat(this.profile.bodyColor, 0.4); this._mechRig(m, { bodyGeom: new THREE.BoxGeometry(1.3, 1.3, 0.95) }); const barrier = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 14), this._mat(this.profile.accent, 0.18, 0.1, this.profile.accent)); barrier.position.y = 1.4; this.bodyGroup.add(barrier); }
        _buildWmMarauder() { const m = this._skinMat(this.profile.bodyColor, 0.5); this._mechRig(m, { rightArm: 'gun', leftArm: 'gun' }); }
        _buildWmVeteranbot() { const m = this._skinMat(this.profile.bodyColor, 0.6); this._mechRig(m, {}); for (let i = 0; i < 5; i++) { const a = i * 2.39996; const scrap = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.12), this._mat(0x6a5a3a, 1, 0.7)); scrap.position.set(Math.cos(a) * 0.5, 1.3 + Math.sin(i) * 0.4, 0.36); scrap.rotation.set(a, i, 0); this.bodyGroup.add(scrap); } }
        // ── Scrap bot: salvaged post-Squishing automaton (name-driven palette) ─
        _buildScrapbot() {
            const p = this.profile, s = p.spec || {};
            const m = this._skinMat(p.bodyColor, 0.5);
            this._mechRig(m, { bodyGeom: new THREE.BoxGeometry(0.85, 0.9, 0.6) });
            // Salvage riveted onto the chest plate, so it is kept inside the
            // chassis it is bolted to: further out it hung off the front of
            // the machine with daylight behind it.
            for (let i = 0; i < 4; i++) { const a = i * 2.39996; const plate = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.06), this._mat(0x6a5a3a, 1, 0.75)); plate.position.set(Math.cos(a) * 0.26, Math.sin(i) * 0.26, 0.28); plate.rotation.z = a; this.body.add(plate); }
            // The aerial grows out of the head, so it rides the head: left in
            // body space it stayed put while the head came down to the body.
            const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 5), m); rod.position.set(0.15, 0.32, 0); this.head.add(rod);
            const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), this._mat(p.accent, 0.9, 0.2, p.accent)); tip.position.set(0.15, 0.57, 0); this.head.add(tip);
        }


        // ── Flesh horror: pulsating mass of mouths, eyes and tendrils ────────
        _buildFleshHorror() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.4);
            this.body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 1), mat);
            this.body.position.set(0, 1.3, 0); this.body.scale.set(1.1, 1.0, 1.0);
            this.bodyGroup.add(this.body);
            // Scattered eyes (head group) + gaping mouths.
            this.head = new THREE.Group();
            for (let i = 0; i < 5; i++) { const a = this.idRand() * Math.PI * 2, e = this.idRand() * Math.PI; this._eye(this.head, Math.sin(e) * Math.cos(a) * 0.7, 1.3 + Math.cos(e) * 0.6, Math.sin(e) * Math.sin(a) * 0.6, 0.08 + this.idRand() * 0.05, p.accent); }
            this.bodyGroup.add(this.head);
            this.mouths = new THREE.Group();
            for (let i = 0; i < 3; i++) { const a = this.idRand() * Math.PI * 2; const mo = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.06, 8, 14), this._mat(0x3a0808, 1.0, 0.5)); mo.position.set(Math.cos(a) * 0.5, 1.0 + this.idRand() * 0.6, 0.5 + Math.sin(a) * 0.1); this.mouths.add(mo); }
            this.bodyGroup.add(this.mouths);
            // Writhing tendrils as limbs.
            this.leftArm = this._tendril(mat, -1, 1.5); this.rightArm = this._tendril(mat, 1, 1.5);
            this.leftLeg = this._tendril(mat, -0.5, 0.9); this.rightLeg = this._tendril(mat, 0.5, 0.9);
            this._mapCommon({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm, leftLeg: this.leftLeg, rightLeg: this.rightLeg });
            this._simpleCascade({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm, leftLeg: this.leftLeg, rightLeg: this.rightLeg });
        }
        _tendril(mat, side, yBase) {
            const g = new THREE.Group(); let py = 0;
            for (let s = 0; s < 6; s++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.13 - s * 0.016, 8, 8), mat); seg.position.set(Math.sign(side) * 0.05 * s, py, 0); py -= 0.18; g.add(seg); }
            g.position.set(Math.sign(side) * 0.55, yBase, 0.1); g._side = Math.sign(side);
            this.bodyGroup.add(g); this._floaters.push(g); return g;
        }

        // ── Floating eye: a giant eyeball with eyestalks ─────────────────────
        _buildFloatingEye() {
            const p = this.profile;
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.7, 18, 18), this._mat(0xf0ece8, 1.0, 0.25));
            this.body.position.set(0, 1.4, 0); this.bodyGroup.add(this.body);
            // Big iris/pupil that tracks.
            this.head = new THREE.Group();
            const iris = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 14), this._mat(p.accent, 1.0, 0.2, p.accent)); iris.position.z = 0.42; this.head.add(iris);
            const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), this._mat(0x000000, 1.0, 0.1)); pupil.position.z = 0.62; this.head.add(pupil);
            const veins = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.02, 6, 18), this._mat(0xcc4444, 0.7, 0.4)); veins.rotation.x = 0.4; this.head.add(veins);
            this.head.position.set(0, 1.4, 0); this.bodyGroup.add(this.head);
            // Eyestalks (limbs) topped with small eyes.
            this.leftArm = this._stalk(-1, 1.7); this.rightArm = this._stalk(1, 1.7);
            this.leftLeg = this._stalk(-0.6, 1.0); this.rightLeg = this._stalk(0.6, 1.0);
            this._mapCommon({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm, leftLeg: this.leftLeg, rightLeg: this.rightLeg });
            this._cascadeRules = [
                { gone: ['EYE', 'EYES', 'HEAD', 'CORE', 'BODY', 'TORSO'], hide: [this.body, this.head, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg] },
                { gone: ['LEFT_ARM', 'TENTACLE_ONE'], hide: [this.leftArm] },
                { gone: ['RIGHT_ARM', 'TENTACLE_TWO'], hide: [this.rightArm] },
            ];
        }
        _stalk(side, yBase) {
            const g = new THREE.Group();
            const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.7, 6), this._mat(0xc8b0c8, 1.0, 0.4));
            stalk.position.y = 0.35; stalk.rotation.z = -Math.sign(side) * 0.6; g.add(stalk);
            this._eye(g, Math.sign(side) * 0.4, 0.7, 0, 0.12, this.profile.accent);
            g.position.set(Math.sign(side) * 0.4, yBase, 0); g._side = Math.sign(side);
            this.bodyGroup.add(g); this._floaters.push(g); return g;
        }

        // ── Crawling hand: a giant severed hand ──────────────────────────────
        _buildCrawlingHand() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.6);
            this.body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.8), mat);
            this.body.position.set(0, 0.7, 0); this.bodyGroup.add(this.body);
            const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.4, 10), mat); wrist.position.set(0, 0.65, -0.55); wrist.rotation.x = 1.4;
            const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 6), this._mat(0xe8e0d0, 1.0, 0.5)); bone.position.set(0, 0.05, -0.25); wrist.add(bone);
            this.bodyGroup.add(wrist);
            // Five fingers (front four + thumb) act as the limbs.
            this.fingers = [];
            const fx = [-0.28, -0.1, 0.1, 0.28];
            fx.forEach((x, i) => { this.fingers.push(this._finger(mat, x, 0.45, 1)); });
            this.thumb = this._finger(mat, -0.4, 0.3, 0); this.thumb.rotation.y = 0.6;
            this.head = this.fingers[1]; // pointer finger doubles as "head" target
            this.leftArm = this.fingers[0]; this.rightArm = this.fingers[3];
            this.leftLeg = this.fingers[2]; this.rightLeg = this.thumb;
            this._mapCommon({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm, leftLeg: this.leftLeg, rightLeg: this.rightLeg });
            this._cascadeRules = [
                { gone: ['BODY', 'CORE', 'TORSO', 'HAND'], hide: [this.body, ...this.fingers, this.thumb] },
            ];
        }
        _finger(mat, x, z, front) {
            const g = new THREE.Group();
            let py = 0;
            for (let s = 0; s < 3; s++) { const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.06 - s * 0.008, 0.05 - s * 0.008, 0.22, 6), mat); seg.position.set(0, 0.11, py); seg.rotation.x = -1.3 + s * 0.3; g.add(seg); py += 0.2; }
            g.position.set(x, 0.85, z); g._phase = Math.abs(x) + (front ? 0 : 1);
            this.bodyGroup.add(g); this._floaters.push(g); return g;
        }

        // ── Grimoire: a floating spellbook with an eye on the cover ──────────
        _buildGrimoire() {
            const p = this.profile;
            const coverMat = this._skinMat(p.bodyColor, 0.6);
            const pageMat = this._mat(0xe8dcc0, 1.0, 0.9);
            this.body = new THREE.Group();
            const lc = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.95), coverMat); lc.position.set(-0.38, 0, 0); lc.rotation.z = 0.35; this.body.add(lc);
            const rc = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.95), coverMat); rc.position.set(0.38, 0, 0); rc.rotation.z = -0.35; this.body.add(rc);
            const lp = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.04, 0.9), pageMat); lp.position.set(-0.36, 0.05, 0); lp.rotation.z = 0.35; this.body.add(lp);
            const rp = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.04, 0.9), pageMat); rp.position.set(0.36, 0.05, 0); rp.rotation.z = -0.35; this.body.add(rp);
            this.body.position.set(0, 1.3, 0); this.body.rotation.x = -0.5; this.bodyGroup.add(this.body);
            // Cover eye.
            this.head = new THREE.Group();
            this._eye(this.head, 0, 0, 0.1, 0.22, p.accent);
            this.head.position.set(0, 1.55, 0.25); this.bodyGroup.add(this.head);
            // Floating rune motes.
            this.motes = new THREE.Group();
            for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; const mo = new THREE.Mesh(new THREE.TetrahedronGeometry(0.07, 0), this._mat(p.accent, 0.9, 0.2, p.accent)); mo.position.set(Math.cos(a) * 0.9, 1.3 + Math.sin(a * 2) * 0.3, Math.sin(a) * 0.9); this.motes.add(mo); }
            this.bodyGroup.add(this.motes); this._floaters.push(this.motes);
            this._mapCommon({ head: this.head, body: this.body, leftArm: this.motes, rightArm: this.motes, leftLeg: this.body, rightLeg: this.body });
            this._cascadeRules = [
                { gone: ['BODY', 'CORE', 'TORSO'], hide: [this.body, this.head, this.motes] },
                { gone: ['EYE', 'EYES', 'HEAD'], hide: [this.head] },
            ];
        }

        // ── Inside-Out Whale: void cetacean with its organs on the outside ───
        // Source archetype AbyssalLeviathan: CORE/ABYSSAL_EYE/MAW/VOID_TENDRIL_1/2.
        _buildInsideOutWhale() {
            const p = this.profile;
            const voidMat = this._skinMat(p.bodyColor, 0.5); voidMat.opacity = 0.6; voidMat.transparent = true;
            const fleshMat = this._mat(0xb83a3a, 1.0, 0.4);
            const heartMat = this._mat(0xcc2a3a, 1.0, 0.3, 0x551018);
            // Body shell (CORE): elongated void ellipsoid swimming through matter.
            this.core = new THREE.Mesh(new THREE.SphereGeometry(0.7, 18, 14), voidMat);
            this.core.position.set(0, 1.3, 0); this.core.scale.set(1.0, 0.85, 1.9); this.bodyGroup.add(this.core);
            // Tail fluke at the back.
            this.tail = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.5, 4), voidMat);
            this.tail.position.set(0, 1.3, -1.5); this.tail.rotation.x = -Math.PI / 2; this.tail.scale.set(1.6, 1, 0.25);
            this.bodyGroup.add(this.tail);
            // Big abyssal eye + toothy maw at the front.
            this.abyssalEye = this._eye(this.bodyGroup, 0, 1.5, 1.2, 0.22, p.accent);
            this.maw = new THREE.Group();
            const mawRing = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.08, 8, 16), fleshMat); mawRing.position.set(0, 1.1, 1.35); mawRing.rotation.x = Math.PI / 2; this.maw.add(mawRing);
            for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; const t = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 4), this._mat(0xece4d0, 1.0, 0.4)); t.position.set(Math.cos(a) * 0.3, 1.1 + Math.sin(a) * 0.06, 1.4); t.rotation.x = -Math.PI / 2; this.maw.add(t); }
            this.bodyGroup.add(this.maw);
            // External organs clinging on top: throbbing heart + coiled gut.
            this.organs = new THREE.Group();
            const heart = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), heartMat); heart.position.set(0.2, 1.92, 0.2); heart.scale.set(1, 1.2, 1); this.organs.add(heart); this.organs._heart = heart;
            const gut = new THREE.Mesh(new THREE.TorusKnotGeometry(0.22, 0.07, 64, 8), fleshMat); gut.position.set(-0.25, 1.85, -0.35); this.organs.add(gut);
            this.bodyGroup.add(this.organs);
            // Dangling organ tendrils double as the fins (VOID_TENDRIL_1/2).
            this.tendril1 = this._organTendril(-0.55, 1.05, 0.2, fleshMat);
            this.tendril2 = this._organTendril(0.55, 1.05, 0.2, fleshMat);
            this._partMeshMap = { CORE: this.core, ABYSSAL_EYE: this.abyssalEye, MAW: this.maw, VOID_TENDRIL_1: this.tendril1, VOID_TENDRIL_2: this.tendril2 };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.tail, this.abyssalEye, this.maw, this.organs, this.tendril1, this.tendril2] },
                { gone: ['ABYSSAL_EYE'], hide: [this.abyssalEye] },
                { gone: ['MAW'], hide: [this.maw] },
                { gone: ['VOID_TENDRIL_1'], hide: [this.tendril1] },
                { gone: ['VOID_TENDRIL_2'], hide: [this.tendril2] },
            ];
        }
        _organTendril(x, y, z, mat) {
            const g = new THREE.Group(); let py = 0;
            for (let s = 0; s < 5; s++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.12 - s * 0.018, 8, 8), mat); seg.position.set(0, py, 0); py -= 0.2; g.add(seg); }
            g.position.set(x, y, z); this.bodyGroup.add(g); return g;
        }

        // ── Inverted Angel: a flayed celestial, sinew wings, ichor-dripping halo ─
        // Source archetype Angel (humanoid keys) + LEFT_WING/RIGHT_WING/HALO.
        _buildInvertedAngel() {
            const p = this.profile;
            const sinew = this._skinMat(p.bodyColor, 0.4);
            const ichor = this._mat(0x0a0a12, 1.0, 0.2);
            // Flayed torso (TORSO/CORE/BODY) with exposed rib arcs.
            this.body = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.26, 0.9, 10), sinew); this.body.add(torso);
            for (let i = 0; i < 3; i++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(0.3 - i * 0.02, 0.025, 6, 12, Math.PI), this._mat(0xe8e0d0, 1.0, 0.5)); rib.position.y = 0.2 - i * 0.22; rib.rotation.x = Math.PI / 2; rib.rotation.z = Math.PI; this.body.add(rib); }
            this.body.position.set(0, 1.25, 0); this.bodyGroup.add(this.body);
            // Raw head with bare eyes.
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 14), sinew); this.head.add(skull);
            this._eye(this.head, -0.1, 0.04, 0.2, 0.07, p.accent); this._eye(this.head, 0.1, 0.04, 0.2, 0.07, p.accent);
            this.head.position.set(0, 1.95, 0); this.bodyGroup.add(this.head);
            // Sinew limbs.
            this.leftArm = this._limb(sinew, -0.4, 1.5, true); this.rightArm = this._limb(sinew, 0.4, 1.5, true);
            this.leftLeg = this._limb(sinew, -0.16, 0.85, false); this.rightLeg = this._limb(sinew, 0.16, 0.85, false);
            // Exposed-sinew wings.
            this.leftWing = this._sinewWing(-1, sinew); this.rightWing = this._sinewWing(1, sinew);
            // Corrupted halo dripping black ichor.
            this.halo = new THREE.Group();
            const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.04, 8, 20), this._mat(0xd4b042, 1.0, 0.3, 0x6a5010)); ring.rotation.x = Math.PI / 2; this.halo.add(ring);
            this.halo.position.set(0, 2.4, 0); this.bodyGroup.add(this.halo);
            this.drips = new THREE.Group();
            for (let i = 0; i < 5; i++) { const dr = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), ichor); const a = (i / 5) * Math.PI * 2; dr.position.set(Math.cos(a) * 0.27, 2.4 - this.idRand() * 0.5, Math.sin(a) * 0.27); dr.scale.y = 1.6; this.drips.add(dr); }
            this.bodyGroup.add(this.drips);
            this._partMeshMap = {
                HEAD: this.head, SKULL: this.head, BRAIN: this.head, TORSO: this.body, BODY: this.body, CORE: this.body, RIBCAGE: this.body, HEART: this.body,
                LEFT_ARM: this.leftArm, LEFT_UPPER_ARM: this.leftArm, RIGHT_ARM: this.rightArm, RIGHT_UPPER_ARM: this.rightArm,
                LEFT_LEG: this.leftLeg, LEFT_THIGH: this.leftLeg, RIGHT_LEG: this.rightLeg, RIGHT_THIGH: this.rightLeg,
                LEFT_WING: this.leftWing, RIGHT_WING: this.rightWing, HALO: this.halo
            };
            this._cascadeRules = [
                { gone: ['TORSO', 'BODY', 'CORE', 'RIBCAGE'], hide: [this.body, this.head, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg, this.leftWing, this.rightWing, this.halo, this.drips] },
                { gone: ['HEAD', 'SKULL', 'BRAIN'], hide: [this.head] },
                { gone: ['LEFT_ARM', 'LEFT_UPPER_ARM'], hide: [this.leftArm] },
                { gone: ['RIGHT_ARM', 'RIGHT_UPPER_ARM'], hide: [this.rightArm] },
                { gone: ['LEFT_LEG', 'LEFT_THIGH'], hide: [this.leftLeg] },
                { gone: ['RIGHT_LEG', 'RIGHT_THIGH'], hide: [this.rightLeg] },
                { gone: ['LEFT_WING'], hide: [this.leftWing] },
                { gone: ['RIGHT_WING'], hide: [this.rightWing] },
                { gone: ['HALO'], hide: [this.halo, this.drips] },
            ];
        }
        _sinewWing(side, mat) {
            const g = new THREE.Group();
            for (let i = 0; i < 5; i++) {
                const len = 0.7 - i * 0.08;
                const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.045, len, 5), mat);
                strand.position.set(side * (0.2 + i * 0.12), 0.1 - i * 0.06, -0.05 * i);
                strand.rotation.z = side * (0.8 + i * 0.12); g.add(strand);
            }
            g.position.set(side * 0.3, 1.5, -0.1); g._side = side; this.bodyGroup.add(g); return g;
        }

        // ── Inside-Out Critter: a small beast with throbbing exposed organs ──
        // Source archetype Beast: BODY/HEAD + four legs.
        _buildInsideOutCritter() {
            const p = this.profile;
            const flesh = this._skinMat(p.bodyColor, 0.4);
            const organMat = this._mat(0xc83a4a, 1.0, 0.3, 0x441015);
            // Exposed-flesh body (BODY/TORSO) with rib arcs.
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 12), flesh); this.body.position.set(0, 0.7, 0); this.body.scale.set(1.0, 0.85, 1.5); this.bodyGroup.add(this.body);
            // Head with a bared brain + a single big eye.
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12), flesh); this.head.add(skull);
            const brain = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), this._mat(0xe0a0b0, 1.0, 0.5)); brain.position.y = 0.16; brain.scale.set(1, 0.7, 1.1); this.head.add(brain);
            this._eye(this.head, 0, 0.0, 0.22, 0.1, p.accent);
            this.head.position.set(0, 0.85, 0.6); this.bodyGroup.add(this.head);
            // Throbbing heart + gut on the back.
            this.organs = new THREE.Group();
            const heart = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), organMat); heart.position.set(0, 1.0, -0.1); heart.scale.set(1, 1.2, 1); this.organs.add(heart); this.organs._heart = heart;
            const gut = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.05, 6, 12), organMat); gut.position.set(0, 0.95, 0.2); this.organs.add(gut);
            this.bodyGroup.add(this.organs);
            // Four stubby legs.
            this.frontLeft = this._critterLeg(-0.22, 0.4, flesh); this.frontRight = this._critterLeg(0.22, 0.4, flesh);
            this.rearLeft = this._critterLeg(-0.22, -0.4, flesh); this.rearRight = this._critterLeg(0.22, -0.4, flesh);
            this._partMeshMap = {
                BODY: this.body, TORSO: this.body, SPINE: this.body, RIBCAGE: this.body, HEAD: this.head, SKULL: this.head, BRAIN: this.head,
                LEFT_LEG: this.frontLeft, FRONT_LEFT_PAW: this.frontLeft, RIGHT_LEG: this.frontRight, FRONT_RIGHT_PAW: this.frontRight,
                REAR_LEFT_LEG: this.rearLeft, HIND_LEFT_LEG: this.rearLeft, REAR_RIGHT_LEG: this.rearRight, HIND_RIGHT_LEG: this.rearRight
            };
            this._cascadeRules = [
                { gone: ['BODY', 'TORSO', 'SPINE', 'RIBCAGE'], hide: [this.body, this.head, this.organs, this.frontLeft, this.frontRight, this.rearLeft, this.rearRight] },
                { gone: ['HEAD', 'SKULL', 'BRAIN'], hide: [this.head] },
                { gone: ['LEFT_LEG', 'FRONT_LEFT_PAW'], hide: [this.frontLeft] },
                { gone: ['RIGHT_LEG', 'FRONT_RIGHT_PAW'], hide: [this.frontRight] },
                { gone: ['REAR_LEFT_LEG', 'HIND_LEFT_LEG'], hide: [this.rearLeft] },
                { gone: ['REAR_RIGHT_LEG', 'HIND_RIGHT_LEG'], hide: [this.rearRight] },
            ];
        }
        _critterLeg(x, z, mat) {
            const g = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.035, 0.45, 6), mat);
            g.position.set(x, 0.32, z); this.bodyGroup.add(g); return g;
        }

        // ── Tide Sorcerer: a humanoid pillar of swirling ocean water ─────────
        // Source archetype WaterElemental: CORE/BODY/WATER_ARMS/LEFT_WATER_LEG/RIGHT_WATER_LEG.
        _buildTideSorcerer() {
            const p = this.profile;
            const water = this._skinMat(p.bodyColor, 0.2); water.transparent = true; water.opacity = 0.62; water.emissive = new THREE.Color(0x123a66); water.emissiveIntensity = 0.4;
            // Translucent water torso + crested head.
            this.body = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.5, 1.1, 14), water); torso.position.y = 0.0; this.body.add(torso);
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 14), water); head.position.y = 0.78; this.body.add(head);
            this._eye(head, -0.11, 0.02, 0.22, 0.07, p.accent); this._eye(head, 0.11, 0.02, 0.22, 0.07, p.accent);
            if (p.nymph) {
                // Water Nymph: flowing hair strands instead of a jagged crown,
                // and a slimmer torso befitting a beguiling spirit.
                torso.scale.set(0.82, 1.0, 0.82);
                this._crest = new THREE.Group();
                for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; const g = new THREE.Group(); let py = 0; for (let k = 0; k < 4; k++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.06 - k * 0.01, 6, 6), water); seg.position.set(0, py, 0); py -= 0.14; g.add(seg); } g.position.set(Math.cos(a) * 0.22, 1.05, Math.sin(a) * 0.22); g._phase = i; this._crest.add(g); }
                head.add(this._crest);
            } else {
                // Wave crown.
                for (let i = 0; i < 5; i++) { const w = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 5), water); const a = (i / 5) * Math.PI * 2; w.position.set(Math.cos(a) * 0.18, 1.05, Math.sin(a) * 0.18); w.rotation.z = Math.cos(a) * 0.4; w.rotation.x = Math.sin(a) * 0.4; this.body.add(w); }
            }
            this.body.position.set(0, 1.3, 0); this.bodyGroup.add(this.body);
            // Bright nucleus core suspended in the chest.
            this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 0), this._mat(p.accent, 0.95, 0.2, p.accent)); this.core.position.set(0, 1.4, 0.05); this.bodyGroup.add(this.core);
            // Two flowing water arms (mapped to the single WATER_ARMS key).
            this.arms = new THREE.Group();
            [-1, 1].forEach(s => { const g = new THREE.Group(); let py = 0; for (let k = 0; k < 5; k++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.13 - k * 0.018, 8, 8), water); seg.position.set(s * 0.04 * k, py, 0); py -= 0.2; g.add(seg); } g.position.set(s * 0.5, 1.6, 0.05); g._side = s; this.arms.add(g); });
            this.bodyGroup.add(this.arms);
            // Two water-column legs ending in a swirl.
            this.leftLeg = this._waterColumn(-0.2, water); this.rightLeg = this._waterColumn(0.2, water);
            this._partMeshMap = { CORE: this.core, BODY: this.body, WATER_ARMS: this.arms, LEFT_WATER_LEG: this.leftLeg, RIGHT_WATER_LEG: this.rightLeg };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.body, this.arms, this.leftLeg, this.rightLeg] },
                { gone: ['BODY'], hide: [this.body, this.arms] },
                { gone: ['WATER_ARMS'], hide: [this.arms] },
                { gone: ['LEFT_WATER_LEG'], hide: [this.leftLeg] },
                { gone: ['RIGHT_WATER_LEG'], hide: [this.rightLeg] },
            ];
        }
        _waterColumn(x, mat) {
            const g = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 0.9, 10), mat);
            g.position.set(x, 0.5, 0); this.bodyGroup.add(g); return g;
        }

        // ── Timberwood Shaman: a wooden mystic crowned with leaves ───────────
        // Source archetype Plant: FLOWER/STEM/ROOTS/VINE_1/VINE_2.
        _buildTimberwoodShaman() {
            const p = this.profile;
            const wood = this._skinMat(p.bodyColor, 0.8);
            const leaf = this._mat(p.accent, 1.0, 0.6, 0x0a2a08);
            // STEM: gnarled trunk body.
            this.stem = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 1.4, 9), wood); this.stem.position.set(0, 1.0, 0); this.bodyGroup.add(this.stem);
            // FLOWER: carved spirit-mask head with a leafy crown.
            this.flower = new THREE.Group();
            const mask = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.56, 0.3), wood); this.flower.add(mask);
            this._eye(this.flower, -0.12, 0.06, 0.16, 0.07, p.accent); this._eye(this.flower, 0.12, 0.06, 0.16, 0.07, p.accent);
            const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.06), this._mat(0x1a0e06, 1.0, 0.6)); mouth.position.set(0, -0.18, 0.16); this.flower.add(mouth);
            for (let i = 0; i < 7; i++) { const lf = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.34, 4), leaf); const a = (i / 7) * Math.PI * 2; lf.position.set(Math.cos(a) * 0.22, 0.34, Math.sin(a) * 0.12); lf.rotation.z = Math.cos(a) * 0.6; lf.rotation.x = -0.4; this.flower.add(lf); }
            this.flower.position.set(0, 1.95, 0); this.bodyGroup.add(this.flower);
            // VINE_1 / VINE_2: two writhing vine arms, the right gripping a staff.
            this.vine1 = this._vineArm(-1, wood, leaf);
            this.vine2 = this._vineArm(1, wood, leaf);
            const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.4, 6), wood); staff.position.set(0.62, 1.3, 0.1); this.vine2.add(staff);
            const orb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), this._mat(p.accent, 0.9, 0.3, p.accent)); orb.position.set(0.62, 2.0, 0.1); this.vine2.add(orb);
            // ROOTS: splayed root feet.
            this.roots = new THREE.Group();
            for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const r = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.5, 5), wood); r.position.set(Math.cos(a) * 0.22, 0.18, Math.sin(a) * 0.22); r.rotation.z = Math.cos(a) * 0.7; r.rotation.x = -Math.sin(a) * 0.7; this.roots.add(r); }
            this.bodyGroup.add(this.roots);
            this._partMeshMap = { FLOWER: this.flower, STEM: this.stem, ROOTS: this.roots, VINE_1: this.vine1, VINE_2: this.vine2 };
            this._cascadeRules = [
                { gone: ['STEM'], hide: [this.stem, this.flower, this.roots, this.vine1, this.vine2] },
                { gone: ['FLOWER'], hide: [this.flower] },
                { gone: ['ROOTS'], hide: [this.roots] },
                { gone: ['VINE_1'], hide: [this.vine1] },
                { gone: ['VINE_2'], hide: [this.vine2] },
            ];
        }
        _vineArm(side, wood, leaf) {
            const g = new THREE.Group(); let py = 0;
            for (let k = 0; k < 4; k++) { const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.07 - k * 0.01, 0.08 - k * 0.01, 0.28, 6), wood); seg.position.set(side * 0.04 * k, py, 0); seg.rotation.z = -side * 0.2; g.add(seg); py -= 0.26; }
            const lf = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 4), leaf); lf.position.set(side * 0.16, py + 0.1, 0); g.add(lf);
            g.position.set(side * 0.34, 1.55, 0.05); g._side = side; this.bodyGroup.add(g); return g;
        }

        // ── Tooth Fairy: a twisted fae floating with bone pliers ─────────────
        // Source archetype Bird: HEAD/BODY/BEAK/LEFT_WING/RIGHT_WING/TALONS.
        _buildToothFairy() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.5);
            const bone = this._mat(0xece4d0, 1.0, 0.5);
            // BODY: small hunched torso draped with a tooth necklace.
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), skin); this.body.scale.set(0.9, 1.1, 0.8); this.body.position.set(0, 1.2, 0); this.bodyGroup.add(this.body);
            this.necklace = new THREE.Group();
            for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI - Math.PI * 0.05; const t = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 4), bone); t.position.set(Math.cos(a) * 0.3, 1.05 - Math.sin(a) * 0.02, 0.22 + Math.sin(a) * 0.04); t.rotation.x = Math.PI; this.necklace.add(t); }
            this.bodyGroup.add(this.necklace);
            // HEAD: oversized head with a wide tooth-filled grin + glowing eyes.
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 14), skin); this.head.add(skull);
            this._eye(this.head, -0.12, 0.05, 0.24, 0.08, p.accent); this._eye(this.head, 0.12, 0.05, 0.24, 0.08, p.accent);
            const grin = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.04, 6, 12, Math.PI), this._mat(0x2a0808, 1.0, 0.5)); grin.position.set(0, -0.12, 0.26); grin.rotation.z = Math.PI; this.head.add(grin);
            for (let i = 0; i < 6; i++) { const tt = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.07, 4), bone); tt.position.set(-0.13 + i * 0.052, -0.1, 0.28); this.head.add(tt); }
            this.head.position.set(0, 1.7, 0); this.bodyGroup.add(this.head);
            // BEAK -> bone pliers held forward.
            this.beak = new THREE.Group();
            const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 5), bone); handle.rotation.x = Math.PI / 2; this.beak.add(handle);
            for (let s = -1; s <= 1; s += 2) { const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 4), bone); jaw.position.set(s * 0.04, 0, 0.28); jaw.rotation.x = -Math.PI / 2; this.beak.add(jaw); }
            this.beak.position.set(0.2, 1.25, 0.25); this.bodyGroup.add(this.beak);
            // LEFT_WING / RIGHT_WING: tattered insect wings.
            this.leftWing = this._faeWing(-1, p.accent); this.rightWing = this._faeWing(1, p.accent);
            // TALONS: dangling little legs.
            this.talons = new THREE.Group();
            [-0.1, 0.1].forEach(x => { const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.3, 5), skin); lg.position.set(x, 0.9, 0); this.talons.add(lg); });
            this.bodyGroup.add(this.talons);
            this._partMeshMap = { HEAD: this.head, BODY: this.body, BEAK: this.beak, LEFT_WING: this.leftWing, RIGHT_WING: this.rightWing, TALONS: this.talons };
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.body, this.head, this.beak, this.leftWing, this.rightWing, this.talons, this.necklace] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['BEAK'], hide: [this.beak] },
                { gone: ['LEFT_WING'], hide: [this.leftWing] },
                { gone: ['RIGHT_WING'], hide: [this.rightWing] },
                { gone: ['TALONS'], hide: [this.talons] },
            ];
        }
        _faeWing(side, accent) {
            const g = new THREE.Group();
            const mat = this._mat(accent, 0.4, 0.2, accent);
            const upper = new THREE.Mesh(new THREE.CircleGeometry(0.3, 10), mat); upper.material.side = THREE.DoubleSide; upper.position.set(side * 0.28, 0.1, -0.05); upper.rotation.y = side * 0.5; g.add(upper);
            const lower = new THREE.Mesh(new THREE.CircleGeometry(0.2, 10), mat); lower.material.side = THREE.DoubleSide; lower.position.set(side * 0.22, -0.18, -0.05); lower.rotation.y = side * 0.5; g.add(lower);
            g.position.set(side * 0.22, 1.35, -0.12); g._side = side; this.bodyGroup.add(g); return g;
        }

        // ── Totem: a stacked carved totem (wood guardian / icy initiate) ─────
        // Source archetype Totem: CORE/LEFT_ARM/RIGHT_ARM/EYES/BASE.
        _buildTotem() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, p.icy ? 0.3 : 0.85);
            if (p.icy) { mat.transparent = true; mat.opacity = 0.85; mat.emissive = new THREE.Color(0x2a4a66); mat.emissiveIntensity = 0.25; }
            // CORE: three stacked carved blocks.
            this.core = new THREE.Group();
            const sizes = [[0.5, 0.6], [0.46, 0.6], [0.42, 0.6]];
            sizes.forEach((s, i) => { const blk = new THREE.Mesh(new THREE.CylinderGeometry(s[0], s[0] * 1.05, s[1], p.icy ? 6 : 9), mat); blk.position.y = 0.55 + i * 0.62; this.core.add(blk); });
            this.bodyGroup.add(this.core);
            // EYES: glowing carved faces near the top.
            this.eyes = new THREE.Group();
            this._eye(this.eyes, -0.16, 0, 0.4, 0.1, p.accent); this._eye(this.eyes, 0.16, 0, 0.4, 0.1, p.accent);
            const maw = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.1), this._mat(0x140a06, 1.0, 0.6)); maw.position.set(0, -0.22, 0.42); this.eyes.add(maw);
            this.eyes.position.set(0, 1.85, 0); this.bodyGroup.add(this.eyes);
            // Crest: leaves (wood) or ice shards (icy).
            this.crest = new THREE.Group();
            for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const c = new THREE.Mesh(p.icy ? new THREE.ConeGeometry(0.07, 0.4, 4) : new THREE.ConeGeometry(0.12, 0.3, 4), p.icy ? this._mat(p.accent, 0.7, 0.2, p.accent) : this._mat(p.accent, 1.0, 0.6, 0x0a2a08)); c.position.set(Math.cos(a) * 0.2, 2.3, Math.sin(a) * 0.2); c.rotation.z = Math.cos(a) * 0.5; c.rotation.x = -Math.sin(a) * 0.5; this.crest.add(c); }
            this.bodyGroup.add(this.crest);
            // LEFT_ARM / RIGHT_ARM: carved wing-plank arms.
            this.leftArm = this._totemArm(-1, mat); this.rightArm = this._totemArm(1, mat);
            // BASE: wide foot block.
            this.base = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 0.4, p.icy ? 6 : 9), mat); this.base.position.set(0, 0.2, 0); this.bodyGroup.add(this.base);
            this._partMeshMap = { CORE: this.core, LEFT_ARM: this.leftArm, RIGHT_ARM: this.rightArm, EYES: this.eyes, BASE: this.base };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.eyes, this.crest, this.leftArm, this.rightArm] },
                { gone: ['EYES'], hide: [this.eyes] },
                { gone: ['LEFT_ARM'], hide: [this.leftArm] },
                { gone: ['RIGHT_ARM'], hide: [this.rightArm] },
                { gone: ['BASE'], hide: [this.base] },
            ];
        }
        _totemArm(side, mat) {
            const g = new THREE.Group();
            const plank = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.2), mat); plank.position.set(side * 0.3, 0, 0); g.add(plank);
            const tip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.4, 0.2), mat); tip.position.set(side * 0.55, -0.18, 0); g.add(tip);
            g.position.set(side * 0.4, 1.3, 0); g._side = side; this.bodyGroup.add(g); return g;
        }

        // ── Toxic Sprayer: a hovering spherical decontamination automaton ────
        // Source archetype Robot: HEAD/CORE/LEFT_ARM/RIGHT_ARM/LEFT_LEG/RIGHT_LEG.
        _buildToxicSprayer() {
            const p = this.profile;
            const metal = this._skinMat(p.bodyColor, 0.4);
            const tank = this._mat(p.accent, 0.55, 0.3, p.accent);
            // CORE: central sphere chassis with a glass chemical tank.
            this.core = new THREE.Group();
            const shell = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 14), metal); this.core.add(shell);
            const band = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.07, 8, 18), metal); band.rotation.x = Math.PI / 2; this.core.add(band);
            const fluid = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), tank); fluid.position.set(0, 0.1, 0.45); this.core.add(fluid);
            this.core.position.set(0, 1.4, 0); this.bodyGroup.add(this.core);
            // HEAD: optic sensor dome on top.
            this.head = new THREE.Group();
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), metal); this.head.add(dome);
            this.headEye = this._eye(this.head, 0, 0.02, 0.18, 0.09, p.accent);
            this.head.position.set(0, 2.0, 0); this.bodyGroup.add(this.head);
            // LEFT_ARM / RIGHT_ARM: nozzle arms, the right venting corrosive mist.
            this.rightArm = this._sprayArm(1, metal, p.accent, true); this.leftArm = this._sprayArm(-1, metal, p.accent, false);
            // LEFT_LEG / RIGHT_LEG: little stabilizer landing struts.
            this.leftLeg = this._strut(-0.28, metal); this.rightLeg = this._strut(0.28, metal);
            this._mapCommon({ head: this.head, body: this.core, leftArm: this.leftArm, rightArm: this.rightArm, leftLeg: this.leftLeg, rightLeg: this.rightLeg });
            this._simpleCascade({ head: this.head, body: this.core, leftArm: this.leftArm, rightArm: this.rightArm, leftLeg: this.leftLeg, rightLeg: this.rightLeg });
        }
        _sprayArm(side, metal, accent, active) {
            const g = new THREE.Group();
            const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 7), metal); arm.position.set(side * 0.2, 0, 0); arm.rotation.z = Math.PI / 2; g.add(arm);
            const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 8), metal); nozzle.position.set(side * 0.5, 0, 0); nozzle.rotation.z = -side * Math.PI / 2; g.add(nozzle);
            if (active) { const mist = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), this._mat(accent, 0.4, 0.3, accent)); mist.position.set(side * 0.7, 0, 0); g.add(mist); g._mist = mist; }
            g.position.set(side * 0.55, 1.4, 0); g._side = side; this.bodyGroup.add(g); return g;
        }
        _strut(x, metal) {
            const g = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.5, 6), metal);
            g.position.set(x, 0.85, 0); g.rotation.z = -Math.sign(x) * 0.25; this.bodyGroup.add(g); return g;
        }

        // ── Trashling: a quivering glob of alley refuse ──────────────────────
        // Source archetype TrashCreature: TRASH_PILE/LIMBS/EYES/HEART.
        _buildTrashling() {
            const p = this.profile;
            const grime = this._skinMat(p.bodyColor, 0.85);
            // TRASH_PILE: lumpy mound of fused junk.
            this.pile = new THREE.Group();
            const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), grime); blob.scale.set(1.1, 0.9, 1.0); this.pile.add(blob);
            const junkMats = [this._mat(0x556644, 1.0, 0.6), this._mat(0x884422, 1.0, 0.7), this._mat(0x445566, 0.9, 0.5)];
            for (let i = 0; i < 7; i++) { const j = new THREE.Mesh(i % 2 ? new THREE.BoxGeometry(0.18, 0.24, 0.14) : new THREE.CylinderGeometry(0.1, 0.1, 0.26, 6), junkMats[i % 3]); const a = this.idRand() * Math.PI * 2, e = 0.3 + this.idRand() * 0.6; j.position.set(Math.sin(e) * Math.cos(a) * 0.55, 0.7 + Math.cos(e) * 0.45, Math.sin(e) * Math.sin(a) * 0.5); j.rotation.set(this.idRand() * 3, this.idRand() * 3, this.idRand() * 3); this.pile.add(j); }
            this.pile.position.set(0, 0.7, 0); this.bodyGroup.add(this.pile);
            // EYES: two mismatched eyes peering out.
            this.eyes = new THREE.Group();
            this._eye(this.eyes, -0.16, 0, 0.5, 0.11, p.accent); this._eye(this.eyes, 0.18, 0.06, 0.46, 0.07, p.accent);
            this.eyes.position.set(0, 0.85, 0); this.bodyGroup.add(this.eyes);
            // HEART: a glowing crushed can pulsing at the centre.
            this.heart = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.22, 8), this._mat(p.accent, 0.95, 0.3, p.accent)); this.heart.position.set(0, 0.7, 0.1); this.bodyGroup.add(this.heart);
            // LIMBS: oily pseudopods.
            this.limbs = new THREE.Group();
            [-1, 1, -0.5, 0.5].forEach((s, i) => { const g = new THREE.Group(); let py = 0; for (let k = 0; k < 4; k++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.1 - k * 0.018, 8, 8), grime); seg.position.set(0, py, 0); py -= 0.16; g.add(seg); } g.position.set(s * 0.45, 0.5, (i % 2 ? 0.2 : -0.2)); g._phase = i; this.limbs.add(g); });
            this.bodyGroup.add(this.limbs);
            this._partMeshMap = { TRASH_PILE: this.pile, LIMBS: this.limbs, EYES: this.eyes, HEART: this.heart };
            this._cascadeRules = [
                { gone: ['TRASH_PILE'], hide: [this.pile, this.eyes, this.heart, this.limbs] },
                { gone: ['EYES'], hide: [this.eyes] },
                { gone: ['HEART'], hide: [this.heart] },
                { gone: ['LIMBS'], hide: [this.limbs] },
            ];
        }

        // ── Trident Hunter: a mer-warrior with a barbed trident ──────────────
        // Source archetype Humanoid (mapped via _mapCommon).
        _buildTridentHunter() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.5);
            const scale = this._mat(0x1f5a5a, 1.0, 0.4, 0x062424);
            this.body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.95, 10), scale); this.body.position.set(0, 1.25, 0); this.bodyGroup.add(this.body);
            // Fin crest down the back.
            const fin = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 4), this._mat(p.accent, 0.8, 0.4, p.accent)); fin.position.set(0, 1.55, -0.25); fin.rotation.x = -0.5; this.bodyGroup.add(fin);
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.27, 14, 14), skin); this.head.add(h);
            this._eye(this.head, -0.1, 0.03, 0.2, 0.07, p.accent); this._eye(this.head, 0.1, 0.03, 0.2, 0.07, p.accent);
            const gillFin = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 4), this._mat(p.accent, 0.8, 0.4)); gillFin.position.set(-0.24, 0.05, 0); gillFin.rotation.z = 1.2; this.head.add(gillFin);
            this.head.position.set(0, 1.95, 0); this.bodyGroup.add(this.head);
            this.leftArm = this._limb(skin, -0.38, 1.5, true); this.rightArm = this._limb(skin, 0.38, 1.5, true);
            this.leftLeg = this._limb(scale, -0.16, 0.85, false); this.rightLeg = this._limb(scale, 0.16, 0.85, false);
            // Barbed trident gripped in the right hand.
            this.weapon = new THREE.Group();
            const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 1.7, 6), this._mat(0x7a5a30, 1.0, 0.7)); this.weapon.add(haft);
            for (let s = -1; s <= 1; s++) { const prong = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.4, 5), this._mat(0xcfd4dc, 1.0, 0.25)); prong.position.set(s * 0.14, 1.0, 0); this.weapon.add(prong); const barb = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 4), this._mat(0xcfd4dc, 1.0, 0.25)); barb.position.set(s * 0.14, 0.86, 0.06); barb.rotation.x = 2.4; this.weapon.add(barb); }
            this.weapon.position.set(0.5, 1.3, 0.12); this.weapon.rotation.z = 0.12; this.rightArm.add(this.weapon);
            this._mapCommon({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm, leftLeg: this.leftLeg, rightLeg: this.rightLeg });
            this._simpleCascade({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm, leftLeg: this.leftLeg, rightLeg: this.rightLeg });
        }

        // ── Tundra Mammoth Calf: a small woolly mammoth ──────────────────────
        // Source archetype Elephant: HEAD/TRUNK/TUSKS/BODY/LEFT_LEG/RIGHT_LEG/HIND_LEFT_LEG/HIND_RIGHT_LEG.
        _buildMammothCalf() {
            const p = this.profile;
            const fur = this._skinMat(p.bodyColor, 0.95);
            const ivory = this._mat(p.accent, 1.0, 0.5);
            // BODY: round woolly barrel.
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 14, 12), fur); this.body.scale.set(1.4, 1.0, 1.0); this.body.position.set(0, 0.95, 0); this.bodyGroup.add(this.body);
            // Shaggy fur tufts.
            for (let i = 0; i < 10; i++) { const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 4), fur); const a = this.idRand() * Math.PI * 2, e = this.idRand() * Math.PI; tuft.position.set(Math.sin(e) * Math.cos(a) * 0.8, 0.95 + Math.cos(e) * 0.55, Math.sin(e) * Math.sin(a) * 0.55); tuft.lookAt(tuft.position.clone().multiplyScalar(2)); this.body.add(tuft); }
            // HEAD: domed woolly head at the front.
            this.head = new THREE.Group();
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 12), fur); this.head.add(dome);
            this._eye(this.head, -0.16, 0.08, 0.32, 0.06, 0x221a12); this._eye(this.head, 0.16, 0.08, 0.32, 0.06, 0x221a12);
            const lEar = new THREE.Mesh(new THREE.CircleGeometry(0.22, 10), fur); lEar.material.side = THREE.DoubleSide; lEar.position.set(-0.4, 0.1, 0); lEar.rotation.y = 0.7; this.head.add(lEar);
            const rEar = lEar.clone(); rEar.position.x = 0.4; rEar.rotation.y = -0.7; this.head.add(rEar);
            this.head.position.set(0.75, 1.15, 0); this.bodyGroup.add(this.head);
            // TRUNK: short curling trunk.
            this.trunk = new THREE.Group(); let ty = 0, tz = 0;
            for (let k = 0; k < 5; k++) { const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.13 - k * 0.018, 0.14 - k * 0.018, 0.2, 7), fur); seg.position.set(0, ty, tz); seg.rotation.x = 0.5 + k * 0.25; this.trunk.add(seg); ty -= 0.14; tz += 0.12; }
            this.trunk.position.set(1.05, 1.0, 0.2); this.head.add(this.trunk);
            // TUSKS: stubby growing tusks.
            this.tusks = new THREE.Group();
            for (let s = -1; s <= 1; s += 2) { const tk = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.32, 6), ivory); tk.position.set(1.0 + 0, 0.85, s * 0.16); tk.rotation.z = 0.9; tk.rotation.x = -s * 0.3; this.tusks.add(tk); }
            this.head.add(this.tusks);
            // Four legs.
            this.frontLeft = this._mammothLeg(0.55, 0.32, fur); this.frontRight = this._mammothLeg(0.55, -0.32, fur);
            this.hindLeft = this._mammothLeg(-0.55, 0.32, fur); this.hindRight = this._mammothLeg(-0.55, -0.32, fur);
            this._partMeshMap = {
                HEAD: this.head, TRUNK: this.trunk, TUSKS: this.tusks, BODY: this.body,
                LEFT_LEG: this.frontLeft, RIGHT_LEG: this.frontRight, HIND_LEFT_LEG: this.hindLeft, HIND_RIGHT_LEG: this.hindRight
            };
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.body, this.head, this.trunk, this.tusks, this.frontLeft, this.frontRight, this.hindLeft, this.hindRight] },
                { gone: ['HEAD'], hide: [this.head, this.trunk, this.tusks] },
                { gone: ['TRUNK'], hide: [this.trunk] },
                { gone: ['TUSKS'], hide: [this.tusks] },
                { gone: ['LEFT_LEG'], hide: [this.frontLeft] },
                { gone: ['RIGHT_LEG'], hide: [this.frontRight] },
                { gone: ['HIND_LEFT_LEG'], hide: [this.hindLeft] },
                { gone: ['HIND_RIGHT_LEG'], hide: [this.hindRight] },
            ];
        }
        _mammothLeg(x, z, fur) {
            const g = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.7, 8), fur);
            g.position.set(x, 0.35, z); this.bodyGroup.add(g); return g;
        }

        // ── Twilight Satyr: a dark bargain-making fae with goat legs ─────────
        // Source archetype Fairy: HEAD/TORSO/LEFT_ARM/RIGHT_ARM/LEFT_WING/RIGHT_WING/PIXIE_DUST_SAC.
        _buildTwilightSatyr() {
            const p = this.profile;
            const fur = this._skinMat(p.bodyColor, 0.9);
            const skin = this._mat(0x6a5560, 1.0, 0.5);
            // TORSO: lean torso, furred lower half.
            this.body = new THREE.Group();
            const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.6, 10), skin); chest.position.y = 0.3; this.body.add(chest);
            const haunch = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.4, 10), fur); haunch.position.y = -0.1; this.body.add(haunch);
            this.body.position.set(0, 1.25, 0); this.bodyGroup.add(this.body);
            // HEAD: horned goat-fae head with glowing eyes.
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 14), skin); h.scale.set(0.9, 1.0, 1.1); this.head.add(h);
            this._eye(this.head, -0.1, 0.02, 0.2, 0.07, p.accent); this._eye(this.head, 0.1, 0.02, 0.2, 0.07, p.accent);
            const muzzle = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 6), skin); muzzle.position.set(0, -0.06, 0.22); muzzle.rotation.x = Math.PI / 2; this.head.add(muzzle);
            for (let s = -1; s <= 1; s += 2) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.4, 6), this._mat(0x2a1a18, 1.0, 0.5)); horn.position.set(s * 0.14, 0.28, -0.05); horn.rotation.z = s * 0.6; horn.rotation.x = -0.5; this.head.add(horn); }
            this.head.position.set(0, 1.95, 0); this.bodyGroup.add(this.head);
            // Arms.
            this.leftArm = this._limb(skin, -0.34, 1.5, true); this.rightArm = this._limb(skin, 0.34, 1.5, true);
            // Goat legs (mapped to the wing keys for part-loss coverage).
            this.leftWing = this._goatLeg(-0.16, fur); this.rightWing = this._goatLeg(0.16, fur);
            // PIXIE_DUST_SAC -> a coin pouch of crooked bargains.
            this.sac = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), this._mat(0x4a3520, 1.0, 0.7)); this.sac.scale.set(1, 1.2, 1); this.sac.position.set(0.26, 1.0, 0.18); this.bodyGroup.add(this.sac);
            this._partMeshMap = {
                HEAD: this.head, TORSO: this.body, BODY: this.body,
                LEFT_ARM: this.leftArm, RIGHT_ARM: this.rightArm,
                LEFT_WING: this.leftWing, RIGHT_WING: this.rightWing, PIXIE_DUST_SAC: this.sac
            };
            this._cascadeRules = [
                { gone: ['TORSO', 'BODY'], hide: [this.body, this.head, this.leftArm, this.rightArm, this.leftWing, this.rightWing, this.sac] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['LEFT_ARM'], hide: [this.leftArm] },
                { gone: ['RIGHT_ARM'], hide: [this.rightArm] },
                { gone: ['LEFT_WING'], hide: [this.leftWing] },
                { gone: ['RIGHT_WING'], hide: [this.rightWing] },
                { gone: ['PIXIE_DUST_SAC'], hide: [this.sac] },
            ];
        }
        _goatLeg(x, fur) {
            const g = new THREE.Group();
            const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.4, 7), fur); thigh.position.set(0, -0.1, 0.08); thigh.rotation.x = 0.4; g.add(thigh);
            const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.4, 6), fur); shin.position.set(0, -0.45, -0.02); shin.rotation.x = -0.4; g.add(shin);
            const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.12, 6), this._mat(0x1a1212, 1.0, 0.4)); hoof.position.set(0, -0.66, 0.04); g.add(hoof);
            g.position.set(x, 1.0, 0); this.bodyGroup.add(g); return g;
        }

        // ── Umbral Basilisk: a spectral jellyfish drifting through the air ───
        // Source archetype Bird: HEAD/BODY/BEAK/LEFT_WING/RIGHT_WING/TALONS.
        _buildUmbralBasilisk() {
            const p = this.profile;
            const ghost = this._skinMat(p.bodyColor, 0.2); ghost.transparent = true; ghost.opacity = 0.5; ghost.emissive = new THREE.Color(0x223a66); ghost.emissiveIntensity = 0.35;
            // BODY: translucent bell.
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), ghost); this.body.position.set(0, 1.55, 0); this.body.scale.set(1.1, 0.9, 1.1); this.bodyGroup.add(this.body);
            const rim = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.05, 8, 20), this._mat(p.accent, 0.5, 0.3, p.accent)); rim.position.set(0, 1.2, 0); rim.rotation.x = Math.PI / 2; this.bodyGroup.add(rim); this._rim = rim;
            // HEAD: an inner luminous core (the "basilisk gaze").
            this.head = new THREE.Group();
            this._eye(this.head, 0, 0, 0, 0.16, p.accent);
            this.head.position.set(0, 1.5, 0.1); this.bodyGroup.add(this.head);
            // BEAK -> a central mouth-stinger hanging below the bell.
            this.beak = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 6), this._mat(p.accent, 0.6, 0.3, p.accent)); this.beak.position.set(0, 1.0, 0); this.beak.rotation.x = Math.PI; this.bodyGroup.add(this.beak);
            // LEFT_WING / RIGHT_WING -> frilly oral arms.
            this.leftWing = this._jellyFrill(-1, ghost); this.rightWing = this._jellyFrill(1, ghost);
            // TALONS -> bundle of trailing stinging tentacles.
            this.talons = new THREE.Group();
            for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; const g = new THREE.Group(); let py = 0; for (let k = 0; k < 6; k++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.05 - k * 0.005, 6, 6), this._mat(p.accent, 0.45, 0.3, p.accent)); seg.position.set(0, py, 0); py -= 0.18; g.add(seg); } g.position.set(Math.cos(a) * 0.35, 1.1, Math.sin(a) * 0.35); g._phase = i; this.talons.add(g); }
            this.bodyGroup.add(this.talons);
            this._partMeshMap = { HEAD: this.head, BODY: this.body, BEAK: this.beak, LEFT_WING: this.leftWing, RIGHT_WING: this.rightWing, TALONS: this.talons };
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.body, this.head, this.beak, this.leftWing, this.rightWing, this.talons, rim] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['BEAK'], hide: [this.beak] },
                { gone: ['LEFT_WING'], hide: [this.leftWing] },
                { gone: ['RIGHT_WING'], hide: [this.rightWing] },
                { gone: ['TALONS'], hide: [this.talons] },
            ];
        }
        _jellyFrill(side, mat) {
            const g = new THREE.Group();
            for (let k = 0; k < 4; k++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.5, 4), mat); f.position.set(side * (0.1 + k * 0.06), -0.2 - k * 0.05, 0); f.rotation.z = side * 0.3; f.rotation.x = Math.PI; g.add(f); }
            g.position.set(side * 0.3, 1.2, 0); g._side = side; this.bodyGroup.add(g); return g;
        }

        // ── Vampire Bat: a nocturnal blood-draining flyer ───────────────────
        // Source archetype Bat: HEAD/BODY/LEFT_WING/RIGHT_WING/FANGS.
        _buildVampireBat() {
            const p = this.profile;
            const fur = this._skinMat(p.bodyColor, 0.9);
            // BODY: small furred body.
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 12), fur); this.body.scale.set(0.9, 1.1, 0.8); this.body.position.set(0, 1.3, 0); this.bodyGroup.add(this.body);
            // HEAD: snouted head with huge ears + glowing eyes.
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12), fur); this.head.add(h);
            this._eye(this.head, -0.1, 0.04, 0.2, 0.06, p.accent); this._eye(this.head, 0.1, 0.04, 0.2, 0.06, p.accent);
            const snout = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.18, 6), fur); snout.position.set(0, -0.04, 0.22); snout.rotation.x = Math.PI / 2; this.head.add(snout);
            for (let s = -1; s <= 1; s += 2) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 4), fur); ear.position.set(s * 0.14, 0.28, -0.02); ear.rotation.z = s * 0.2; this.head.add(ear); }
            this.head.position.set(0, 1.7, 0.02); this.bodyGroup.add(this.head);
            // FANGS: a pair of dripping fangs.
            this.fangs = new THREE.Group();
            for (let s = -1; s <= 1; s += 2) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 4), this._mat(0xf4ecdc, 1.0, 0.3)); f.position.set(s * 0.05, 1.56, 0.2); f.rotation.x = Math.PI; this.fangs.add(f); }
            this.bodyGroup.add(this.fangs);
            // Membrane wings.
            this.leftWing = this._batWing(-1, p.bodyColor); this.rightWing = this._batWing(1, p.bodyColor);
            // Little hind feet hanging.
            const feet = new THREE.Group(); [-0.1, 0.1].forEach(x => { const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.015, 0.2, 5), fur); lg.position.set(x, 1.0, 0); feet.add(lg); }); this.bodyGroup.add(feet); this._feet = feet;
            this._partMeshMap = { HEAD: this.head, BODY: this.body, LEFT_WING: this.leftWing, RIGHT_WING: this.rightWing, FANGS: this.fangs };
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.body, this.head, this.leftWing, this.rightWing, this.fangs, feet] },
                { gone: ['HEAD'], hide: [this.head, this.fangs] },
                { gone: ['FANGS'], hide: [this.fangs] },
                { gone: ['LEFT_WING'], hide: [this.leftWing] },
                { gone: ['RIGHT_WING'], hide: [this.rightWing] },
            ];
        }
        _batWing(side, color) {
            const g = new THREE.Group();
            const mem = this._mat(color, 0.85, 0.7); mem.side = THREE.DoubleSide;
            const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.5, 5), this._mat(0x1a1212, 1.0, 0.6)); arm.position.set(side * 0.25, 0.05, 0); arm.rotation.z = side * Math.PI / 2; g.add(arm);
            for (let k = 0; k < 3; k++) { const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.01, 0.4, 4), this._mat(0x1a1212, 1.0, 0.6)); finger.position.set(side * (0.45 + k * 0.06), -0.05 - k * 0.06, 0); finger.rotation.z = side * (1.2 + k * 0.2); g.add(finger); }
            const web = new THREE.Mesh(new THREE.CircleGeometry(0.4, 8, 0, Math.PI), mem); web.position.set(side * 0.4, -0.1, -0.02); web.rotation.z = side * 1.0; g.add(web);
            g.position.set(side * 0.28, 1.35, -0.05); g._side = side; this.bodyGroup.add(g); return g;
        }

        // ── Venomous Snake: a coiled green naga rearing to strike ────────────
        // Source archetype Serpent: HEAD/FANGS/BODY_SEGMENT_1/BODY_SEGMENT_2/TAIL.
        _buildVenomousSnake() {
            const p = this.profile;
            const scale = this._skinMat(p.bodyColor, 0.4);
            // Coiled lower body (TAIL + segments) as a flat stacked spiral.
            this.tail = new THREE.Group();
            for (let i = 0; i < 12; i++) { const a = i * 0.9; const r = 0.55 - i * 0.025; const seg = new THREE.Mesh(new THREE.SphereGeometry(0.2 - i * 0.006, 10, 8), scale); seg.position.set(Math.cos(a) * r, 0.18 + i * 0.015, Math.sin(a) * r); this.tail.add(seg); }
            this.bodyGroup.add(this.tail);
            // Two rising body segments forming an S-curve up to the head.
            this.seg1 = new THREE.Group(); let py = 0.4, pz = 0;
            for (let i = 0; i < 5; i++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.19 - i * 0.012, 10, 8), scale); seg.position.set(0, py, pz); this.seg1.add(seg); py += 0.2; pz += (i < 2 ? 0.08 : -0.04); }
            this.bodyGroup.add(this.seg1);
            this.seg2 = new THREE.Group(); py = 1.4; pz = 0.04;
            for (let i = 0; i < 4; i++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.16 - i * 0.012, 10, 8), scale); seg.position.set(0, py, pz); this.seg2.add(seg); py += 0.18; pz += 0.05; }
            this.bodyGroup.add(this.seg2);
            // HEAD: flared cobra-hood head with slit eyes.
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), scale); skull.scale.set(1.0, 0.8, 1.3); this.head.add(skull);
            const hood = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), scale); hood.scale.set(1.3, 0.5, 0.6); hood.position.set(0, 0.04, -0.1); hood.rotation.x = Math.PI; this.head.add(hood);
            this._eye(this.head, -0.1, 0.05, 0.18, 0.06, p.accent); this._eye(this.head, 0.1, 0.05, 0.18, 0.06, p.accent);
            this.head.position.set(0, 2.1, 0.3); this.head.rotation.x = 0.3; this.bodyGroup.add(this.head);
            // FANGS: a pair of venom-dripping fangs.
            this.fangs = new THREE.Group();
            for (let s = -1; s <= 1; s += 2) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.14, 4), this._mat(0xf4ecdc, 1.0, 0.3)); f.position.set(s * 0.06, 1.98, 0.45); f.rotation.x = Math.PI - 0.3; this.fangs.add(f); const drop = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), this._mat(p.accent, 0.8, 0.3, p.accent)); drop.position.set(s * 0.06, 1.9, 0.47); this.fangs.add(drop); }
            this.bodyGroup.add(this.fangs);
            this._partMeshMap = { HEAD: this.head, FANGS: this.fangs, BODY_SEGMENT_1: this.seg1, BODY_SEGMENT_2: this.seg2, TAIL: this.tail };
            this._cascadeRules = [
                { gone: ['TAIL'], hide: [this.tail, this.seg1, this.seg2, this.head, this.fangs] },
                { gone: ['BODY_SEGMENT_1'], hide: [this.seg1, this.seg2, this.head, this.fangs] },
                { gone: ['BODY_SEGMENT_2'], hide: [this.seg2, this.head, this.fangs] },
                { gone: ['HEAD'], hide: [this.head, this.fangs] },
                { gone: ['FANGS'], hide: [this.fangs] },
            ];
        }

        // ── Webweaver: a large ash spider with eight legs ────────────────────
        // Source archetype Spider (8 legs + cephalothorax/abdomen/fangs/spinnerets).
        _buildWebweaver() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.6);
            // CEPHALOTHORAX (front body) + ABDOMEN (rear bulb).
            this.cephalothorax = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 12), mat); this.cephalothorax.position.set(0, 0.7, 0.35); this.bodyGroup.add(this.cephalothorax);
            this.abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 12), mat); this.abdomen.scale.set(1.0, 0.85, 1.2); this.abdomen.position.set(0, 0.75, -0.35); this.bodyGroup.add(this.abdomen);
            // Web pattern markings on the abdomen.
            const mark = new THREE.Mesh(new THREE.CircleGeometry(0.2, 4), this._mat(p.accent, 0.8, 0.5, p.accent)); mark.position.set(0, 1.1, -0.4); mark.rotation.x = -1.0; this.bodyGroup.add(mark);
            // HEAD: cluster of eyes at the front of the cephalothorax.
            this.head = new THREE.Group();
            for (let i = 0; i < 4; i++) this._eye(this.head, -0.12 + (i % 2) * 0.24, 0.02 + Math.floor(i / 2) * 0.1, 0.28, 0.05, p.accent);
            this.head.position.set(0, 0.72, 0.35); this.bodyGroup.add(this.head);
            // FANGS / SPINNERETS.
            this.fangs = new THREE.Group();
            for (let s = -1; s <= 1; s += 2) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 5), this._mat(0x201810, 1.0, 0.4)); f.position.set(s * 0.08, 0.58, 0.6); f.rotation.x = 2.6; this.fangs.add(f); }
            this.bodyGroup.add(this.fangs);
            this.spinnerets = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.2, 6), mat); this.spinnerets.position.set(0, 0.7, -0.85); this.spinnerets.rotation.x = -1.6; this.bodyGroup.add(this.spinnerets);
            // Eight legs (left/right x4).
            this.legs = {};
            const legDefs = [['LEFT_LEG', -1, 0.45, 0.4], ['RIGHT_LEG', 1, 0.45, 0.4], ['MID_LEFT_LEG', -1, 0.15, 0.55], ['MID_RIGHT_LEG', 1, 0.15, 0.55], ['MID_REAR_LEFT_LEG', -1, -0.15, 0.55], ['MID_REAR_RIGHT_LEG', 1, -0.15, 0.55], ['REAR_LEFT_LEG', -1, -0.45, 0.4], ['REAR_RIGHT_LEG', 1, -0.45, 0.4]];
            legDefs.forEach(([key, side, z, spread]) => { this.legs[key] = this._spiderLeg(side, z, spread, mat); });
            this._partMeshMap = { HEAD: this.head, CEPHALOTHORAX: this.cephalothorax, ABDOMEN: this.abdomen, FANGS: this.fangs, SPINNERETS: this.spinnerets, ...this.legs };
            const legMeshes = (this._legsArr || (this._legsArr = Object.values(this.legs)));
            this._cascadeRules = [
                { gone: ['CEPHALOTHORAX'], hide: [this.cephalothorax, this.abdomen, this.head, this.fangs, this.spinnerets, ...legMeshes] },
                { gone: ['HEAD'], hide: [this.head] }, { gone: ['ABDOMEN'], hide: [this.abdomen, this.spinnerets] }, { gone: ['FANGS'], hide: [this.fangs] }, { gone: ['SPINNERETS'], hide: [this.spinnerets] },
                ...legDefs.map(([key]) => ({ gone: [key], hide: [this.legs[key]] })),
            ];
        }
        _spiderLeg(side, z, spread, mat) {
            const g = new THREE.Group();
            const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.5, 5), mat); upper.position.set(side * 0.25, 0.1, 0); upper.rotation.z = side * 1.0; g.add(upper);
            const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.55, 5), mat); lower.position.set(side * 0.5, -0.25, 0); lower.rotation.z = side * 0.4; g.add(lower);
            g.position.set(side * 0.25, 0.7, z); g._side = side; g._z = z; this.bodyGroup.add(g); return g;
        }

        // ── Whisper Wisp: a pale orb that speaks the dead's last words ────────
        // Source archetype Spherical: CORE/SHELL/SENSOR_ARRAY/SPIN_SPINES/AUX_DRIVES.
        _buildWhisperWisp() {
            const p = this.profile;
            // SHELL: translucent glowing orb.
            this.shell = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 18), this._mat(p.bodyColor, 0.35, 0.2, p.accent)); this.shell.position.set(0, 1.4, 0); this.bodyGroup.add(this.shell);
            // CORE: bright inner nucleus.
            this.core = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), this._mat(0xffffff, 0.95, 0.1, p.accent)); this.core.position.set(0, 1.4, 0); this.bodyGroup.add(this.core);
            // SENSOR_ARRAY: a faint sorrowful face on the surface.
            this.face = new THREE.Group();
            this._eye(this.face, -0.14, 0.06, 0.42, 0.06, 0x8888cc); this._eye(this.face, 0.14, 0.06, 0.42, 0.06, 0x8888cc);
            const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 6, 10, Math.PI), this._mat(0x6666aa, 0.7, 0.4)); mouth.position.set(0, -0.12, 0.45); this.face.add(mouth);
            this.face.position.set(0, 1.4, 0); this.bodyGroup.add(this.face);
            // SPIN_SPINES: a ring of drifting light motes (whispers).
            this.spines = new THREE.Group();
            for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const mo = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), this._mat(p.accent, 0.7, 0.2, p.accent)); mo.position.set(Math.cos(a) * 0.8, 1.4 + Math.sin(a * 2) * 0.2, Math.sin(a) * 0.8); this.spines.add(mo); }
            this.bodyGroup.add(this.spines);
            // AUX_DRIVES: trailing wisp tail.
            this.aux = new THREE.Group(); let py = 0;
            for (let k = 0; k < 5; k++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.12 - k * 0.02, 8, 8), this._mat(p.bodyColor, 0.3, 0.2, p.accent)); seg.position.set(0, py, 0); py -= 0.18; this.aux.add(seg); }
            this.aux.position.set(0, 1.0, 0); this.bodyGroup.add(this.aux);
            this._partMeshMap = { CORE: this.core, SHELL: this.shell, SENSOR_ARRAY: this.face, SPIN_SPINES: this.spines, AUX_DRIVES: this.aux };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.shell, this.face, this.spines, this.aux] },
                { gone: ['SHELL'], hide: [this.shell] }, { gone: ['SENSOR_ARRAY'], hide: [this.face] }, { gone: ['SPIN_SPINES'], hide: [this.spines] }, { gone: ['AUX_DRIVES'], hide: [this.aux] },
            ];
        }

        // ── Wild Rabbit: a fleet-footed forest hare ──────────────────────────
        // Source archetype Rabbit: HEAD/BODY/EARS/LEFT_LEG/RIGHT_LEG/REAR_LEFT_LEG/REAR_RIGHT_LEG/TAIL.
        _buildWildRabbit() {
            const p = this.profile;
            const fur = this._skinMat(p.bodyColor, 0.95);
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 12), fur); this.body.scale.set(1.0, 0.95, 1.3); this.body.position.set(0, 0.55, 0); this.bodyGroup.add(this.body);
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12), fur); this.head.add(h);
            this._eye(this.head, -0.13, 0.05, 0.18, 0.06, 0x442211); this._eye(this.head, 0.13, 0.05, 0.18, 0.06, 0x442211);
            const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), this._mat(0xcc8899, 1.0, 0.4)); nose.position.set(0, -0.04, 0.24); this.head.add(nose);
            this.head.position.set(0, 0.85, 0.32); this.bodyGroup.add(this.head);
            // EARS: tall alert ears.
            this.ears = new THREE.Group();
            for (let s = -1; s <= 1; s += 2) { const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.34, 4, 8), fur); ear.position.set(s * 0.1, 0.3, -0.02); ear.rotation.z = s * 0.15; this.ears.add(ear); const inner = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.26, 4, 6), this._mat(0xd8a0a8, 1.0, 0.6)); inner.position.set(s * 0.1, 0.3, 0.03); inner.rotation.z = s * 0.15; this.ears.add(inner); }
            this.head.add(this.ears);
            // Legs + powder-puff tail.
            this.frontLeft = this._bunnyLeg(-0.18, 0.28, 0.25, fur); this.frontRight = this._bunnyLeg(0.18, 0.28, 0.25, fur);
            this.rearLeft = this._bunnyLeg(-0.2, -0.28, 0.35, fur); this.rearRight = this._bunnyLeg(0.2, -0.28, 0.35, fur);
            this.tail = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), this._mat(0xf0ece4, 1.0, 1.0)); this.tail.position.set(0, 0.6, -0.5); this.bodyGroup.add(this.tail);
            this._partMeshMap = { HEAD: this.head, BODY: this.body, EARS: this.ears, LEFT_LEG: this.frontLeft, RIGHT_LEG: this.frontRight, REAR_LEFT_LEG: this.rearLeft, REAR_RIGHT_LEG: this.rearRight, TAIL: this.tail };
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.body, this.head, this.frontLeft, this.frontRight, this.rearLeft, this.rearRight, this.tail] },
                { gone: ['HEAD'], hide: [this.head] }, { gone: ['EARS'], hide: [this.ears] }, { gone: ['TAIL'], hide: [this.tail] },
                { gone: ['LEFT_LEG'], hide: [this.frontLeft] }, { gone: ['RIGHT_LEG'], hide: [this.frontRight] }, { gone: ['REAR_LEFT_LEG'], hide: [this.rearLeft] }, { gone: ['REAR_RIGHT_LEG'], hide: [this.rearRight] },
            ];
        }
        _bunnyLeg(x, z, h, fur) {
            const g = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, h, 4, 8), fur);
            g.position.set(x, h * 0.5 + 0.05, z); this.bodyGroup.add(g); return g;
        }

        // ── Will-O'-Wisp Lamp: a possessed oil lamp with a ghostly flame ─────
        // Source archetype Ghost: FACE/CORE/LEFT_WISP/RIGHT_WISP.
        _buildWillOWispLamp() {
            const p = this.profile;
            const brass = this._skinMat(p.bodyColor, 0.35);
            const glass = this._mat(0xbfeede, 0.3, 0.1, p.accent);
            // Lamp body: base reservoir + glass chimney + handle.
            this.lamp = new THREE.Group();
            const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.32, 12), brass); base.position.y = 0; this.lamp.add(base);
            const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.45, 12), glass); chimney.position.y = 0.4; this.lamp.add(chimney);
            const cap = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.2, 12), brass); cap.position.y = 0.72; this.lamp.add(cap);
            const handle = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.025, 6, 16, Math.PI), brass); handle.position.y = 0.85; this.lamp.add(handle);
            this.lamp.position.set(0, 1.2, 0); this.bodyGroup.add(this.lamp);
            // CORE: the ghostly flame inside.
            this.core = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 8), this._mat(p.accent, 0.85, 0.1, p.accent)); this.core.position.set(0, 1.6, 0); this.bodyGroup.add(this.core);
            // FACE: a spectral face hovering above the chimney.
            this.face = new THREE.Group();
            this._eye(this.face, -0.1, 0.05, 0.12, 0.05, p.accent); this._eye(this.face, 0.1, 0.05, 0.12, 0.05, p.accent);
            const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), this._mat(0x113322, 0.7, 0.3)); mouth.position.set(0, -0.1, 0.12); mouth.scale.set(1, 1.4, 0.6); this.face.add(mouth);
            this.face.position.set(0, 1.7, 0); this.bodyGroup.add(this.face);
            // LEFT_WISP / RIGHT_WISP: drifting ghost-lights.
            this.leftWisp = this._wisp(-1, p.accent); this.rightWisp = this._wisp(1, p.accent);
            this._partMeshMap = { FACE: this.face, CORE: this.core, LEFT_WISP: this.leftWisp, RIGHT_WISP: this.rightWisp };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.face, this.lamp, this.leftWisp, this.rightWisp] },
                { gone: ['FACE'], hide: [this.face] }, { gone: ['LEFT_WISP'], hide: [this.leftWisp] }, { gone: ['RIGHT_WISP'], hide: [this.rightWisp] },
            ];
        }
        _wisp(side, accent) {
            const g = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), this._mat(accent, 0.6, 0.2, accent));
            g.position.set(side * 0.6, 1.5, 0); g._side = side; this.bodyGroup.add(g); return g;
        }

        // ── Abyssal Crab: a light-devouring deep-sea crustacean ──────────────
        // Source archetype Crustacean: CLAW_LEFT/CLAW_RIGHT/CARAPACE/ABDOMEN/FRONT_LEG/REAR_LEG/ANTENNAE.
        _buildAbyssalCrab() {
            const p = this.profile;
            const shell = this._skinMat(p.bodyColor, 0.3); shell.emissive = new THREE.Color(0x140a22); shell.emissiveIntensity = 0.2;
            // CARAPACE: wide dark dome.
            this.carapace = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), shell); this.carapace.scale.set(1.3, 0.7, 1.0); this.carapace.position.set(0, 0.7, 0); this.bodyGroup.add(this.carapace);
            this.abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 10), shell); this.abdomen.scale.set(1.2, 0.5, 0.8); this.abdomen.position.set(0, 0.5, -0.4); this.bodyGroup.add(this.abdomen);
            // Glowing void eyes on stalks (ANTENNAE doubles as the eye-stalks).
            this.antennae = new THREE.Group();
            for (let s = -1; s <= 1; s += 2) { const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.3, 5), shell); stalk.position.set(s * 0.18, 1.05, 0.4); this.antennae.add(stalk); this._eye(this.antennae, s * 0.18, 1.22, 0.4, 0.08, p.accent); }
            this.bodyGroup.add(this.antennae);
            // CLAW_LEFT / CLAW_RIGHT: big asymmetric pincers.
            this.clawLeft = this._crabClaw(-1, 0.32, shell); this.clawRight = this._crabClaw(1, 0.46, shell);
            // FRONT_LEG / REAR_LEG: bundles of walking legs.
            this.frontLeg = this._crabLegs(0.3, shell); this.rearLeg = this._crabLegs(-0.2, shell);
            this._partMeshMap = { CLAW_LEFT: this.clawLeft, CLAW_RIGHT: this.clawRight, CARAPACE: this.carapace, ABDOMEN: this.abdomen, FRONT_LEG: this.frontLeg, REAR_LEG: this.rearLeg, ANTENNAE: this.antennae };
            this._cascadeRules = [
                { gone: ['CARAPACE'], hide: [this.carapace, this.abdomen, this.antennae, this.clawLeft, this.clawRight, this.frontLeg, this.rearLeg] },
                { gone: ['ABDOMEN'], hide: [this.abdomen] }, { gone: ['ANTENNAE'], hide: [this.antennae] },
                { gone: ['CLAW_LEFT'], hide: [this.clawLeft] }, { gone: ['CLAW_RIGHT'], hide: [this.clawRight] },
                { gone: ['FRONT_LEG'], hide: [this.frontLeg] }, { gone: ['REAR_LEG'], hide: [this.rearLeg] },
            ];
        }
        _crabClaw(side, size, mat) {
            const g = new THREE.Group();
            const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.4, 6), mat); arm.position.set(side * 0.25, 0, 0.1); arm.rotation.z = Math.PI / 2; g.add(arm);
            const palm = new THREE.Mesh(new THREE.SphereGeometry(size * 0.5, 10, 8), mat); palm.position.set(side * 0.55, 0, 0.2); palm.scale.set(1.2, 1.0, 0.7); g.add(palm);
            const upper = new THREE.Mesh(new THREE.ConeGeometry(size * 0.22, size * 0.9, 6), mat); upper.position.set(side * (0.55 + size * 0.4), size * 0.18, 0.3); upper.rotation.z = -side * 1.3; g.add(upper);
            const lower = new THREE.Mesh(new THREE.ConeGeometry(size * 0.22, size * 0.9, 6), mat); lower.position.set(side * (0.55 + size * 0.4), -size * 0.18, 0.3); lower.rotation.z = -side * 1.85; g.add(lower);
            g.position.set(side * 0.6, 0.6, 0.2); g._side = side; this.bodyGroup.add(g); return g;
        }
        _crabLegs(z, mat) {
            const g = new THREE.Group();
            for (let s = -1; s <= 1; s += 2) for (let i = 0; i < 2; i++) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.5, 5), mat); leg.position.set(s * (0.6 + i * 0.12), 0.35, z - i * 0.18); leg.rotation.z = s * 1.0; g.add(leg); }
            this.bodyGroup.add(g); return g;
        }

        // ── Abyssal Hallucigenia: a spiked Cambrian nightmare-worm ───────────
        // Source archetype Insectoid (mapped onto a spined worm body).
        _buildHallucigenia() {
            const p = this.profile;
            const flesh = this._skinMat(p.bodyColor, 0.5);
            const spineMat = this._mat(0xe8e0d0, 1.0, 0.3);
            // THORAX + ABDOMEN as a long arched tube of segments.
            this.thorax = new THREE.Group(); this.abdomen = new THREE.Group();
            this.spinePairs = [];
            const segN = 9;
            for (let i = 0; i < segN; i++) {
                const theta = (i / (segN - 1)) * Math.PI; // arch
                const seg = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), flesh);
                seg.position.set((i - segN / 2) * 0.22, 0.55 + Math.sin(theta) * 0.45, 0);
                (i < segN / 2 ? this.thorax : this.abdomen).add(seg);
                // Paired dorsal spines + ventral tentacle legs.
                for (let s = -1; s <= 1; s += 2) {
                    const spine = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.4, 5), spineMat); spine.position.copy(seg.position); spine.position.y += 0.28; spine.position.z = s * 0.04; spine.rotation.x = -s * 0.25; (i < segN / 2 ? this.thorax : this.abdomen).add(spine);
                    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.015, 0.4, 5), flesh); leg.position.copy(seg.position); leg.position.y -= 0.32; leg.position.z = s * 0.08; leg.rotation.x = s * 0.2; (i < segN / 2 ? this.thorax : this.abdomen).add(leg);
                }
            }
            this.bodyGroup.add(this.thorax); this.bodyGroup.add(this.abdomen);
            // HEAD: a blind tubular maw at one end.
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.3, 9), flesh); h.rotation.z = Math.PI / 2; this.head.add(h);
            const maw = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.03, 6, 10), this._mat(p.accent, 0.9, 0.4, p.accent)); maw.position.set(-0.16, 0, 0); maw.rotation.y = Math.PI / 2; this.head.add(maw);
            this.head.position.set(-segN / 2 * 0.22 - 0.1, 0.55, 0); this.bodyGroup.add(this.head);
            // MANDIBLES around the maw.
            this.mandibles = new THREE.Group();
            for (let s = -1; s <= 1; s += 2) { const md = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 4), spineMat); md.position.set(-segN / 2 * 0.22 - 0.22, 0.55, s * 0.08); md.rotation.z = Math.PI / 2; this.mandibles.add(md); }
            this.bodyGroup.add(this.mandibles);
            // Map insectoid keys; the leg keys all point at the segment groups.
            this._partMeshMap = { HEAD: this.head, THORAX: this.thorax, ABDOMEN: this.abdomen, MANDIBLES: this.mandibles, LEFT_LEG: this.thorax, RIGHT_LEG: this.thorax, MIDDLE_LEFT_LEG: this.abdomen, MIDDLE_RIGHT_LEG: this.abdomen, REAR_LEFT_LEG: this.abdomen, REAR_RIGHT_LEG: this.abdomen };
            this._cascadeRules = [
                { gone: ['THORAX'], hide: [this.thorax, this.head, this.mandibles] },
                { gone: ['ABDOMEN'], hide: [this.abdomen] }, { gone: ['HEAD'], hide: [this.head, this.mandibles] }, { gone: ['MANDIBLES'], hide: [this.mandibles] },
            ];
        }

        // ── Abyssal Horror: a shapeless engulfing void-mass ──────────────────
        // Source archetype Voidspawn: ABYSSAL_EYE/MAW/VOID_TENDRIL_1/VOID_TENDRIL_2/CORE.
        _buildAbyssalHorror() {
            const p = this.profile;
            const voidMat = this._skinMat(p.bodyColor, 0.6); voidMat.emissive = new THREE.Color(0x120a22); voidMat.emissiveIntensity = 0.3;
            // CORE: lumpy amorphous central mass.
            this.core = new THREE.Group();
            const main = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 1), voidMat); main.scale.set(1.1, 1.2, 1.0); this.core.add(main);
            for (let i = 0; i < 5; i++) { const bulge = new THREE.Mesh(new THREE.SphereGeometry(0.3 + this.idRand() * 0.15, 10, 8), voidMat); const a = this.idRand() * Math.PI * 2, e = this.idRand() * Math.PI; bulge.position.set(Math.sin(e) * Math.cos(a) * 0.6, Math.cos(e) * 0.6, Math.sin(e) * Math.sin(a) * 0.5); this.core.add(bulge); }
            this.core.position.set(0, 1.4, 0); this.bodyGroup.add(this.core);
            // ABYSSAL_EYE: a single huge eye.
            this.abyssalEye = this._eye(this.bodyGroup, 0, 1.55, 0.7, 0.26, p.accent);
            // MAW: a vertical engulfing mouth lined with teeth.
            this.maw = new THREE.Group();
            const lip = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.08, 8, 16), this._mat(0x2a0a18, 1.0, 0.5)); lip.position.set(0, 1.05, 0.6); this.maw.add(lip);
            for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const t = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 4), this._mat(0xe8e0d0, 1.0, 0.4)); t.position.set(Math.cos(a) * 0.28, 1.05 + Math.sin(a) * 0.28, 0.66); t.lookAt(0, 1.05, 0.66); this.maw.add(t); }
            this.bodyGroup.add(this.maw);
            // VOID_TENDRIL_1/2: groping black tendrils.
            this.tendril1 = this._organTendril(-0.6, 1.0, 0.2, voidMat);
            this.tendril2 = this._organTendril(0.6, 1.0, 0.2, voidMat);
            this._partMeshMap = { CORE: this.core, ABYSSAL_EYE: this.abyssalEye, MAW: this.maw, VOID_TENDRIL_1: this.tendril1, VOID_TENDRIL_2: this.tendril2 };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.abyssalEye, this.maw, this.tendril1, this.tendril2] },
                { gone: ['ABYSSAL_EYE'], hide: [this.abyssalEye] }, { gone: ['MAW'], hide: [this.maw] },
                { gone: ['VOID_TENDRIL_1'], hide: [this.tendril1] }, { gone: ['VOID_TENDRIL_2'], hide: [this.tendril2] },
            ];
        }

        // ── Abyssal Tentacler: a deep-sea giant squid ────────────────────────
        // Source archetype Octopus: HEAD/MANTLE/TENTACLE_1..4.
        _buildAbyssalTentacler() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.4);
            // MANTLE: pointed conical mantle pointing up.
            this.mantle = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 14), mat); this.mantle.position.set(0, 1.7, 0); this.bodyGroup.add(this.mantle);
            const fin = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.4, 4), mat); fin.position.set(0, 2.35, 0); fin.scale.set(1.6, 0.6, 1.0); this.bodyGroup.add(fin);
            // HEAD: bulbous head with a huge eye.
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 12), mat); this.head.add(h);
            this.bigEye = this._eye(this.head, 0.0, 0.05, 0.36, 0.18, p.accent);
            this.head.position.set(0, 1.05, 0.05); this.bodyGroup.add(this.head);
            // TENTACLE_1..4: long curling tentacles.
            this.t1 = this._squidTentacle(-1, 0.3, mat); this.t2 = this._squidTentacle(1, 0.3, mat);
            this.t3 = this._squidTentacle(-0.5, -0.25, mat); this.t4 = this._squidTentacle(0.5, -0.25, mat);
            this._partMeshMap = { HEAD: this.head, MANTLE: this.mantle, TENTACLE_1: this.t1, TENTACLE_2: this.t2, TENTACLE_3: this.t3, TENTACLE_4: this.t4 };
            this._cascadeRules = [
                { gone: ['MANTLE'], hide: [this.mantle, this.head, this.t1, this.t2, this.t3, this.t4] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['TENTACLE_1'], hide: [this.t1] }, { gone: ['TENTACLE_2'], hide: [this.t2] }, { gone: ['TENTACLE_3'], hide: [this.t3] }, { gone: ['TENTACLE_4'], hide: [this.t4] },
            ];
        }
        _squidTentacle(side, z, mat) {
            const g = new THREE.Group(); let py = 0;
            for (let k = 0; k < 7; k++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.11 - k * 0.012, 8, 8), mat); seg.position.set(Math.sign(side) * 0.04 * k, py, 0); py -= 0.18; g.add(seg); }
            g.position.set(Math.sign(side) * 0.28, 0.85, z); g._side = Math.sign(side); this.bodyGroup.add(g); return g;
        }

        // ── Acid Bombardier: a massive acid-spraying ant ─────────────────────
        // Source archetype Insectoid: HEAD/THORAX/ABDOMEN/6 legs/MANDIBLES.
        _buildAcidBombardier() {
            const p = this.profile;
            const chitin = this._skinMat(p.bodyColor, 0.4);
            // THORAX + ABDOMEN + HEAD as three connected ant nodes.
            this.thorax = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), chitin); this.thorax.scale.set(1.0, 0.9, 1.3); this.thorax.position.set(0, 0.7, 0); this.bodyGroup.add(this.thorax);
            this.abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 12), chitin); this.abdomen.scale.set(1.0, 0.95, 1.3); this.abdomen.position.set(0, 0.78, -0.6); this.bodyGroup.add(this.abdomen);
            // Acid gland glow + raised spray nozzle on the abdomen.
            const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 6), chitin); nozzle.position.set(0, 1.05, -0.95); nozzle.rotation.x = -1.0; this.bodyGroup.add(nozzle);
            this.acid = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), this._mat(p.accent, 0.6, 0.2, p.accent)); this.acid.position.set(0, 1.2, -1.1); this.bodyGroup.add(this.acid);
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12), chitin); this.head.add(h);
            this._eye(this.head, -0.12, 0.06, 0.16, 0.06, p.accent); this._eye(this.head, 0.12, 0.06, 0.16, 0.06, p.accent);
            this.head.position.set(0, 0.72, 0.5); this.bodyGroup.add(this.head);
            this.mandibles = new THREE.Group();
            for (let s = -1; s <= 1; s += 2) { const md = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22, 5), this._mat(0x201810, 1.0, 0.4)); md.position.set(s * 0.1, 0.66, 0.7); md.rotation.x = 1.4; md.rotation.z = -s * 0.4; this.mandibles.add(md); }
            this.bodyGroup.add(this.mandibles);
            // Six legs.
            this.legs = {};
            const defs = [['LEFT_LEG', -1, 0.3], ['RIGHT_LEG', 1, 0.3], ['MIDDLE_LEFT_LEG', -1, 0.0], ['MIDDLE_RIGHT_LEG', 1, 0.0], ['REAR_LEFT_LEG', -1, -0.3], ['REAR_RIGHT_LEG', 1, -0.3]];
            defs.forEach(([key, side, z]) => { this.legs[key] = this._antLeg(side, z, chitin); });
            this._partMeshMap = { HEAD: this.head, THORAX: this.thorax, ABDOMEN: this.abdomen, MANDIBLES: this.mandibles, ...this.legs };
            this._cascadeRules = [
                { gone: ['THORAX'], hide: [this.thorax, this.abdomen, this.head, this.mandibles, ...(this._legsArr || (this._legsArr = Object.values(this.legs)))] },
                { gone: ['HEAD'], hide: [this.head, this.mandibles] }, { gone: ['ABDOMEN'], hide: [this.abdomen] }, { gone: ['MANDIBLES'], hide: [this.mandibles] },
                ...defs.map(([key]) => ({ gone: [key], hide: [this.legs[key]] })),
            ];
        }
        _antLeg(side, z, mat) {
            const g = new THREE.Group();
            const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.4, 5), mat); upper.position.set(side * 0.22, 0.05, 0); upper.rotation.z = side * 1.1; g.add(upper);
            const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.015, 0.4, 5), mat); lower.position.set(side * 0.42, -0.22, 0); lower.rotation.z = side * 0.3; g.add(lower);
            g.position.set(side * 0.2, 0.7, z); g._side = side; this.bodyGroup.add(g); return g;
        }

        // ── Acidic Tidecaller: a toxic bile-spewing turtle ───────────────────
        // Source archetype Turtle: SHELL/HEAD/LEFT_LEG/RIGHT_LEG/REAR_LEFT_LEG/REAR_RIGHT_LEG/TAIL.
        _buildAcidicTidecaller() {
            const p = this.profile;
            const skin = this._skinMat(0x4a6a3a, 0.7);
            const shellMat = this._skinMat(p.bodyColor, 0.5);
            // SHELL: domed shell pocked with dripping acid pores.
            this.shell = new THREE.Group();
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), shellMat); dome.scale.set(1.2, 0.8, 1.2); this.shell.add(dome);
            for (let i = 0; i < 7; i++) { const a = this.idRand() * Math.PI * 2, r = this.idRand() * 0.45; const pore = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), this._mat(p.accent, 0.7, 0.2, p.accent)); pore.position.set(Math.cos(a) * r, 0.35 + this.idRand() * 0.2, Math.sin(a) * r); this.shell.add(pore); }
            this.shell.position.set(0, 0.7, 0); this.bodyGroup.add(this.shell);
            const plastron = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.15, 14), skin); plastron.position.set(0, 0.35, 0); this.bodyGroup.add(plastron);
            // HEAD: outstretched head dribbling bile.
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), skin); h.scale.set(0.9, 0.9, 1.2); this.head.add(h);
            this._eye(this.head, -0.1, 0.04, 0.18, 0.05, p.accent); this._eye(this.head, 0.1, 0.04, 0.18, 0.05, p.accent);
            const bile = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), this._mat(p.accent, 0.7, 0.2, p.accent)); bile.position.set(0, -0.1, 0.22); bile.scale.y = 1.5; this.head.add(bile);
            this.head.position.set(0, 0.55, 0.62); this.bodyGroup.add(this.head);
            // Four legs + a stubby tail.
            this.frontLeft = this._turtleLeg(-0.42, 0.32, skin); this.frontRight = this._turtleLeg(0.42, 0.32, skin);
            this.rearLeft = this._turtleLeg(-0.42, -0.32, skin); this.rearRight = this._turtleLeg(0.42, -0.32, skin);
            this.tail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 6), skin); this.tail.position.set(0, 0.45, -0.62); this.tail.rotation.x = -1.8; this.bodyGroup.add(this.tail);
            this._partMeshMap = { SHELL: this.shell, HEAD: this.head, LEFT_LEG: this.frontLeft, RIGHT_LEG: this.frontRight, REAR_LEFT_LEG: this.rearLeft, REAR_RIGHT_LEG: this.rearRight, TAIL: this.tail };
            this._cascadeRules = [
                { gone: ['SHELL'], hide: [this.shell, this.head, this.frontLeft, this.frontRight, this.rearLeft, this.rearRight, this.tail] },
                { gone: ['HEAD'], hide: [this.head] }, { gone: ['TAIL'], hide: [this.tail] },
                { gone: ['LEFT_LEG'], hide: [this.frontLeft] }, { gone: ['RIGHT_LEG'], hide: [this.frontRight] }, { gone: ['REAR_LEFT_LEG'], hide: [this.rearLeft] }, { gone: ['REAR_RIGHT_LEG'], hide: [this.rearRight] },
            ];
        }
        _turtleLeg(x, z, mat) {
            const g = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.4, 7), mat);
            g.position.set(x, 0.25, z); this.bodyGroup.add(g); return g;
        }

        // ── Air Elemental: a near-invisible swirling wind vortex ─────────────
        // Source archetype Elemental: CORE/UPPER_FORM/LOWER_FORM/LEFT_APPENDAGE/RIGHT_APPENDAGE.
        _buildAirElemental() {
            const p = this.profile;
            const wind = this._skinMat(p.bodyColor, 0.1); wind.transparent = true; wind.opacity = 0.28; wind.emissive = new THREE.Color(0x88aacc); wind.emissiveIntensity = 0.3;
            // UPPER_FORM: a swirl of stacked rings widening upward.
            this.upper = new THREE.Group();
            for (let i = 0; i < 6; i++) { const r = 0.2 + i * 0.08; const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.04, 6, 18), wind); ring.position.y = 1.6 + i * 0.16; ring.rotation.x = Math.PI / 2; ring.rotation.z = i * 0.5; this.upper.add(ring); }
            this.bodyGroup.add(this.upper);
            // LOWER_FORM: a tapering funnel of rings.
            this.lower = new THREE.Group();
            for (let i = 0; i < 5; i++) { const r = 0.36 - i * 0.06; const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 6, 16), wind); ring.position.y = 1.5 - i * 0.26; ring.rotation.x = Math.PI / 2; ring.rotation.z = -i * 0.5; this.lower.add(ring); }
            this.bodyGroup.add(this.lower);
            // CORE: a faint bright nucleus.
            this.core = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), this._mat(0xffffff, 0.7, 0.1, p.accent)); this.core.position.set(0, 1.5, 0); this.bodyGroup.add(this.core);
            // Two trailing wind-streak appendages.
            this.leftApp = this._windStreak(-1, wind); this.rightApp = this._windStreak(1, wind);
            this._partMeshMap = { CORE: this.core, UPPER_FORM: this.upper, LOWER_FORM: this.lower, LEFT_APPENDAGE: this.leftApp, RIGHT_APPENDAGE: this.rightApp };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.upper, this.lower, this.leftApp, this.rightApp] },
                { gone: ['UPPER_FORM'], hide: [this.upper] }, { gone: ['LOWER_FORM'], hide: [this.lower] },
                { gone: ['LEFT_APPENDAGE'], hide: [this.leftApp] }, { gone: ['RIGHT_APPENDAGE'], hide: [this.rightApp] },
            ];
        }
        _windStreak(side, mat) {
            const g = new THREE.Group();
            for (let k = 0; k < 4; k++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.1 - k * 0.018, 8, 6), mat); seg.position.set(side * (0.4 + k * 0.18), 1.5 + Math.sin(k) * 0.1, 0); g.add(seg); }
            g._side = side; this.bodyGroup.add(g); return g;
        }

        // ── Ancient Dragon: a winged reptile with a glowing breath organ ─────
        // Source archetype Dragon: HEAD/FIRE_BREATH_ORGAN/NECK/BODY/LEFT_WING/RIGHT_WING/LEFT_LEG/RIGHT_LEG/TAIL.
        _buildAncientDragon() {
            const p = this.profile;
            const scale = this._skinMat(p.bodyColor, 0.5);
            const membrane = this._mat(p.wingColor || 0x4a221a, 0.85); membrane.side = THREE.DoubleSide;
            // BODY.
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 14, 12), scale); this.body.scale.set(1.0, 0.9, 1.4); this.body.position.set(0, 1.2, 0); this.bodyGroup.add(this.body);
            // NECK: curved segments rising to the front.
            this.neck = new THREE.Group(); let ny = 1.5, nz = 0.5;
            for (let i = 0; i < 4; i++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.24 - i * 0.025, 10, 10), scale); seg.position.set(0, ny, nz); this.neck.add(seg); ny += 0.22; nz += 0.16; }
            this.bodyGroup.add(this.neck);
            // HEAD with horns + jaw.
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12), scale); skull.scale.set(0.9, 0.85, 1.3); this.head.add(skull);
            const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.4), scale); jaw.position.set(0, -0.12, 0.2); this.head.add(jaw); this.head._jaw = jaw;
            this._eye(this.head, -0.12, 0.06, 0.2, 0.06, p.accent); this._eye(this.head, 0.12, 0.06, 0.2, 0.06, p.accent);
            for (const s of [-1, 1]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.34, 5), this._mat(0xe8e0d0, 1.0, 0.5)); horn.position.set(s * 0.14, 0.22, -0.18); horn.rotation.z = s * 0.5; horn.rotation.x = -0.6; this.head.add(horn); }
            this.head.position.set(0, 2.35, 1.1); this.head.rotation.x = 0.3; this.bodyGroup.add(this.head);
            // FIRE_BREATH_ORGAN: glowing throat sac at the neck base.
            this.breathOrgan = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), this._mat(p.accent, 0.85, 0.3, p.accent)); this.breathOrgan.position.set(0, 1.7, 0.65); this.bodyGroup.add(this.breathOrgan);
            // WINGS.
            this.leftWing = this._dragonWing(-1, membrane, scale); this.rightWing = this._dragonWing(1, membrane, scale);
            // LEGS.
            this.leftLeg = this._dragonLeg(-0.32, scale); this.rightLeg = this._dragonLeg(0.32, scale);
            // TAIL: long tapering segmented tail.
            this.tail = new THREE.Group(); let ty = 1.1, tz = -0.7;
            for (let i = 0; i < 7; i++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.22 - i * 0.026, 8, 8), scale); seg.position.set(0, ty - i * 0.02, tz - i * 0.28); this.tail.add(seg); }
            this.bodyGroup.add(this.tail);
            this._partMeshMap = { HEAD: this.head, FIRE_BREATH_ORGAN: this.breathOrgan, NECK: this.neck, BODY: this.body, LEFT_WING: this.leftWing, RIGHT_WING: this.rightWing, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg, TAIL: this.tail };
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.body, this.neck, this.head, this.breathOrgan, this.leftWing, this.rightWing, this.leftLeg, this.rightLeg, this.tail] },
                { gone: ['NECK'], hide: [this.neck, this.head, this.breathOrgan] }, { gone: ['HEAD'], hide: [this.head] }, { gone: ['FIRE_BREATH_ORGAN'], hide: [this.breathOrgan] },
                { gone: ['LEFT_WING'], hide: [this.leftWing] }, { gone: ['RIGHT_WING'], hide: [this.rightWing] },
                { gone: ['LEFT_LEG'], hide: [this.leftLeg] }, { gone: ['RIGHT_LEG'], hide: [this.rightLeg] }, { gone: ['TAIL'], hide: [this.tail] },
            ];
        }
        _dragonWing(side, membrane, boneMat) {
            const g = new THREE.Group();
            const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.8, 6), boneMat); arm.position.set(side * 0.4, 0.1, -0.1); arm.rotation.z = side * 1.1; g.add(arm);
            for (let k = 0; k < 4; k++) { const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.015, 0.7, 5), boneMat); rib.position.set(side * (0.7 + k * 0.12), 0.0 - k * 0.05, -0.2 - k * 0.1); rib.rotation.z = side * (1.4 + k * 0.12); g.add(rib); }
            const web = new THREE.Mesh(new THREE.CircleGeometry(0.7, 10, 0, Math.PI), membrane); web.position.set(side * 0.7, -0.05, -0.25); web.rotation.z = side * 1.2; web.rotation.y = side * 0.2; g.add(web);
            g.position.set(side * 0.4, 1.5, -0.1); g._side = side; this.bodyGroup.add(g); return g;
        }
        _dragonLeg(x, mat) {
            const g = new THREE.Group();
            const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.5, 7), mat); thigh.position.set(0, -0.1, 0); g.add(thigh);
            const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.45, 6), mat); shin.position.set(0, -0.55, 0.05); g.add(shin);
            const foot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.34), mat); foot.position.set(0, -0.78, 0.12); g.add(foot);
            for (let i = -1; i <= 1; i++) { const claw = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 4), this._mat(0xe8e0d0, 1.0, 0.4)); claw.position.set(i * 0.06, -0.82, 0.3); claw.rotation.x = Math.PI / 2; g.add(claw); }
            g.position.set(x, 1.0, 0.15); this.bodyGroup.add(g); return g;
        }

        // ── Anguish Phantom: a tormented hooded wraith ───────────────────────
        // Source archetype Ghost: FACE/CORE/LEFT_WISP/RIGHT_WISP.
        _buildAnguishPhantom() {
            const p = this.profile;
            const shroud = this._skinMat(p.bodyColor, 0.4); shroud.transparent = true; shroud.opacity = 0.55; shroud.side = THREE.DoubleSide; shroud.emissive = new THREE.Color(0x183a30); shroud.emissiveIntensity = 0.3;
            // CORE: tattered shroud body tapering to a wispy tail.
            this.core = new THREE.Group();
            const hood = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.7, 10, 1, true), shroud); hood.position.y = 1.7; this.core.add(hood);
            const robe = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.4, 10, 1, true), shroud); robe.position.y = 0.95; this.core.add(robe);
            this.bodyGroup.add(this.core);
            // FACE: an anguished pale face inside the hood.
            this.face = new THREE.Group();
            const f = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), this._mat(0xcfe8dd, 0.8, 0.3)); f.scale.set(0.9, 1.1, 0.7); this.face.add(f);
            this._eye(this.face, -0.09, 0.04, 0.16, 0.05, p.accent); this._eye(this.face, 0.09, 0.04, 0.16, 0.05, p.accent);
            const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), this._mat(0x0a1a16, 0.6, 0.3)); mouth.scale.set(0.8, 1.6, 0.5); mouth.position.set(0, -0.12, 0.18); this.face.add(mouth);
            this.face.position.set(0, 1.7, 0.18); this.bodyGroup.add(this.face);
            // Wisp hands.
            this.leftWisp = this._phantomWisp(-1, shroud); this.rightWisp = this._phantomWisp(1, shroud);
            this._partMeshMap = { FACE: this.face, CORE: this.core, LEFT_WISP: this.leftWisp, RIGHT_WISP: this.rightWisp };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.face, this.leftWisp, this.rightWisp] },
                { gone: ['FACE'], hide: [this.face] }, { gone: ['LEFT_WISP'], hide: [this.leftWisp] }, { gone: ['RIGHT_WISP'], hide: [this.rightWisp] },
            ];
        }
        _phantomWisp(side, mat) {
            const g = new THREE.Group(); let py = 0;
            for (let k = 0; k < 4; k++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.1 - k * 0.02, 8, 8), mat); seg.position.set(side * 0.05 * k, py, 0); py -= 0.14; g.add(seg); }
            const claw = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 4), mat); claw.position.set(side * 0.18, py, 0); claw.rotation.z = side * 0.8; g.add(claw);
            g.position.set(side * 0.5, 1.4, 0.15); g._side = side; this.bodyGroup.add(g); return g;
        }

        // ── Aquatic Elemental: a shapeshifting mass of living water ──────────
        // Source archetype WaterElemental: CORE/BODY/WATER_ARMS/LEFT_WATER_LEG/RIGHT_WATER_LEG.
        _buildAquaticElemental() {
            const p = this.profile;
            const water = this._skinMat(p.bodyColor, 0.15); water.transparent = true; water.opacity = 0.58; water.emissive = new THREE.Color(0x123a66); water.emissiveIntensity = 0.35;
            // BODY: a roiling blob with surface bulges.
            this.body = new THREE.Group();
            const main = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), water); main.scale.set(1.0, 1.2, 1.0); this.body.add(main);
            for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.22 + this.idRand() * 0.1, 10, 8), water); const a = this.idRand() * Math.PI * 2, e = this.idRand() * Math.PI; b.position.set(Math.sin(e) * Math.cos(a) * 0.55, Math.cos(e) * 0.6, Math.sin(e) * Math.sin(a) * 0.5); this.body.add(b); }
            this.body.position.set(0, 1.3, 0); this.bodyGroup.add(this.body);
            this.core = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), this._mat(p.accent, 0.9, 0.2, p.accent)); this.core.position.set(0, 1.3, 0.05); this.bodyGroup.add(this.core);
            // WATER_ARMS: two reaching liquid tendrils.
            this.arms = new THREE.Group();
            [-1, 1].forEach(s => { const g = new THREE.Group(); let py = 0; for (let k = 0; k < 5; k++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.14 - k * 0.02, 8, 8), water); seg.position.set(s * 0.05 * k, py, 0); py -= 0.18; g.add(seg); } g.position.set(s * 0.55, 1.5, 0.05); g._side = s; this.arms.add(g); });
            this.bodyGroup.add(this.arms);
            this.leftLeg = this._waterColumn(-0.22, water); this.rightLeg = this._waterColumn(0.22, water);
            this._partMeshMap = { CORE: this.core, BODY: this.body, WATER_ARMS: this.arms, LEFT_WATER_LEG: this.leftLeg, RIGHT_WATER_LEG: this.rightLeg };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.body, this.arms, this.leftLeg, this.rightLeg] },
                { gone: ['BODY'], hide: [this.body, this.arms] }, { gone: ['WATER_ARMS'], hide: [this.arms] },
                { gone: ['LEFT_WATER_LEG'], hide: [this.leftLeg] }, { gone: ['RIGHT_WATER_LEG'], hide: [this.rightLeg] },
            ];
        }

        // ── Aquatic Mantis: an upright predatory mantis ──────────────────────
        // Source archetype Insectoid: HEAD/THORAX/ABDOMEN/6 legs/MANDIBLES.
        _buildAquaticMantis() {
            const p = this.profile;
            const chitin = this._skinMat(p.bodyColor, 0.4);
            // THORAX: upright elongated prothorax.
            this.thorax = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.9, 8), chitin); this.thorax.position.set(0, 1.4, 0); this.thorax.rotation.x = 0.2; this.bodyGroup.add(this.thorax);
            // ABDOMEN: curved tail abdomen + patterned wing cases.
            this.abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), chitin); this.abdomen.scale.set(0.9, 0.8, 1.6); this.abdomen.position.set(0, 1.0, -0.3); this.bodyGroup.add(this.abdomen);
            for (const s of [-1, 1]) { const wingcase = new THREE.Mesh(new THREE.CircleGeometry(0.3, 10), this._mat(p.accent, 0.6, 0.4, p.accent)); wingcase.material.side = THREE.DoubleSide; wingcase.position.set(s * 0.18, 1.1, -0.3); wingcase.rotation.y = s * 0.5; this.bodyGroup.add(wingcase); }
            // HEAD: triangular head with big compound eyes.
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.3, 5), chitin); h.rotation.x = Math.PI; h.scale.set(1, 0.7, 1); this.head.add(h);
            this._eye(this.head, -0.13, 0.02, 0.08, 0.08, p.accent); this._eye(this.head, 0.13, 0.02, 0.08, 0.08, p.accent);
            this.head.position.set(0, 1.95, 0.05); this.bodyGroup.add(this.head);
            this.mandibles = new THREE.Group();
            for (const s of [-1, 1]) { const md = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 4), chitin); md.position.set(s * 0.05, 1.82, 0.14); md.rotation.x = 1.2; this.mandibles.add(md); }
            this.bodyGroup.add(this.mandibles);
            // Raptorial forelimbs (mapped to LEFT_LEG/RIGHT_LEG, the front pair).
            this.legs = {};
            this.legs.LEFT_LEG = this._mantisArm(-1, chitin); this.legs.RIGHT_LEG = this._mantisArm(1, chitin);
            // Walking legs.
            const wl = [['MIDDLE_LEFT_LEG', -1, 0.1], ['MIDDLE_RIGHT_LEG', 1, 0.1], ['REAR_LEFT_LEG', -1, -0.3], ['REAR_RIGHT_LEG', 1, -0.3]];
            wl.forEach(([k, s, z]) => { this.legs[k] = this._mantisLeg(s, z, chitin); });
            this._partMeshMap = { HEAD: this.head, THORAX: this.thorax, ABDOMEN: this.abdomen, MANDIBLES: this.mandibles, ...this.legs };
            this._cascadeRules = [
                { gone: ['THORAX'], hide: [this.thorax, this.abdomen, this.head, this.mandibles, ...(this._legsArr || (this._legsArr = Object.values(this.legs)))] },
                { gone: ['HEAD'], hide: [this.head, this.mandibles] }, { gone: ['ABDOMEN'], hide: [this.abdomen] }, { gone: ['MANDIBLES'], hide: [this.mandibles] },
                ...Object.keys(this.legs).map(k => ({ gone: [k], hide: [this.legs[k]] })),
            ];
        }
        _mantisArm(side, mat) {
            const g = new THREE.Group();
            const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.4, 6), mat); upper.position.set(side * 0.1, -0.05, 0.1); upper.rotation.z = side * 0.6; g.add(upper);
            const scythe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.02, 0.5, 6), mat); scythe.position.set(side * 0.3, 0.05, 0.35); scythe.rotation.z = side * 1.2; scythe.rotation.x = -0.6; g.add(scythe);
            for (let i = 0; i < 4; i++) { const spike = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.08, 4), mat); spike.position.set(side * (0.22 + i * 0.05), 0.1 + i * 0.08, 0.4); g.add(spike); }
            g.position.set(side * 0.18, 1.55, 0.1); g._side = side; this.bodyGroup.add(g); return g;
        }
        _mantisLeg(side, z, mat) {
            const g = new THREE.Group();
            const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.5, 5), mat); upper.position.set(side * 0.25, 0.1, 0); upper.rotation.z = side * 1.0; g.add(upper);
            const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.015, 0.55, 5), mat); lower.position.set(side * 0.5, -0.25, 0); lower.rotation.z = side * 0.3; g.add(lower);
            g.position.set(side * 0.18, 1.1, z); g._side = side; this.bodyGroup.add(g); return g;
        }

        // ── Assassin Wasp: a striped predatory wasp with a huge stinger ──────
        // Source archetype Insectoid: HEAD/THORAX/ABDOMEN/6 legs/MANDIBLES.
        _buildAssassinWasp() {
            const p = this.profile;
            const chitin = this._skinMat(p.bodyColor, 0.4);
            const black = this._mat(p.accent, 1.0, 0.4);
            this.thorax = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), chitin); this.thorax.scale.set(1, 0.9, 1.1); this.thorax.position.set(0, 1.2, 0); this.bodyGroup.add(this.thorax);
            // ABDOMEN: striped teardrop with a stinger.
            this.abdomen = new THREE.Group();
            const ab = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 12), chitin); ab.scale.set(1, 0.9, 1.6); this.abdomen.add(ab);
            for (let i = 0; i < 3; i++) { const band = new THREE.Mesh(new THREE.TorusGeometry(0.3 - i * 0.04, 0.05, 8, 16), black); band.position.z = -0.1 - i * 0.18; band.rotation.x = Math.PI / 2; this.abdomen.add(band); }
            const stinger = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.4, 6), black); stinger.position.z = -0.7; stinger.rotation.x = -Math.PI / 2; this.abdomen.add(stinger);
            this.abdomen.position.set(0, 1.05, -0.5); this.bodyGroup.add(this.abdomen);
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), chitin); this.head.add(h);
            this._eye(this.head, -0.12, 0.04, 0.14, 0.08, 0x111111); this._eye(this.head, 0.12, 0.04, 0.14, 0.08, 0x111111);
            for (const s of [-1, 1]) { const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.3, 4), black); ant.position.set(s * 0.06, 0.2, 0.05); ant.rotation.z = s * 0.4; this.head.add(ant); }
            this.head.position.set(0, 1.25, 0.32); this.bodyGroup.add(this.head);
            this.mandibles = new THREE.Group();
            for (const s of [-1, 1]) { const md = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 4), black); md.position.set(s * 0.05, 1.16, 0.5); md.rotation.x = 1.3; this.mandibles.add(md); }
            this.bodyGroup.add(this.mandibles);
            // Wings (decorative, not body-part keyed).
            this.wings = new THREE.Group();
            for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.CircleGeometry(0.4, 10), this._mat(0xcfe0ff, 0.3, 0.2)); w.material.side = THREE.DoubleSide; w.position.set(s * 0.3, 1.45, -0.15); w.rotation.y = s * 0.4; w.rotation.z = s * 0.3; this.wings.add(w); }
            this.bodyGroup.add(this.wings);
            // Six legs.
            this.legs = {};
            const defs = [['LEFT_LEG', -1, 0.2], ['RIGHT_LEG', 1, 0.2], ['MIDDLE_LEFT_LEG', -1, 0.0], ['MIDDLE_RIGHT_LEG', 1, 0.0], ['REAR_LEFT_LEG', -1, -0.2], ['REAR_RIGHT_LEG', 1, -0.2]];
            defs.forEach(([k, s, z]) => { this.legs[k] = this._waspLeg(s, z, black); });
            this._partMeshMap = { HEAD: this.head, THORAX: this.thorax, ABDOMEN: this.abdomen, MANDIBLES: this.mandibles, ...this.legs };
            this._cascadeRules = [
                { gone: ['THORAX'], hide: [this.thorax, this.abdomen, this.head, this.mandibles, this.wings, ...(this._legsArr || (this._legsArr = Object.values(this.legs)))] },
                { gone: ['HEAD'], hide: [this.head, this.mandibles] }, { gone: ['ABDOMEN'], hide: [this.abdomen] }, { gone: ['MANDIBLES'], hide: [this.mandibles] },
                ...defs.map(([k]) => ({ gone: [k], hide: [this.legs[k]] })),
            ];
        }
        _waspLeg(side, z, mat) {
            const g = new THREE.Group();
            const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.018, 0.35, 5), mat); upper.position.set(side * 0.18, -0.05, 0); upper.rotation.z = side * 1.0; g.add(upper);
            const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.012, 0.35, 5), mat); lower.position.set(side * 0.34, -0.28, 0); lower.rotation.z = side * 0.4; g.add(lower);
            g.position.set(side * 0.22, 1.15, z); g._side = side; this.bodyGroup.add(g); return g;
        }

        // ── Reptilian: a basilisk (quadruped) or lizardfolk (biped) ──────────
        // Source archetype Reptilian: HEAD/TORSO/LEFT_ARM/RIGHT_ARM/LEFT_LEG/RIGHT_LEG/TAIL.
        _buildReptilian() {
            const p = this.profile;
            const biped = !!p.biped;
            const scale = this._skinMat(p.bodyColor, 0.45);
            const torsoY = biped ? 1.25 : 0.75;
            // TORSO.
            this.body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, biped ? 0.9 : 1.1, 10), scale);
            this.body.position.set(0, torsoY, 0); if (!biped) this.body.rotation.x = Math.PI / 2;
            this.bodyGroup.add(this.body);
            // Dorsal scale ridge.
            for (let i = 0; i < 5; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 4), this._mat(p.accent, 0.9, 0.5)); if (biped) { sp.position.set(0, torsoY + 0.2 - i * 0.12, -0.3); sp.rotation.x = -0.4; } else { sp.position.set(0, torsoY + 0.32, 0.4 - i * 0.22); } this.bodyGroup.add(sp); }
            // Optional crystalline growths sprouting from the back (Crystalback).
            if (p.crystalGrowths) { for (let i = 0; i < 6; i++) { const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.09 + this.idRand() * 0.06, 0), this._mat(p.accent, 0.85, 0.2, p.accent)); cr.position.set((this.idRand() - 0.5) * 0.45, torsoY + 0.3, (this.idRand() - 0.5) * (biped ? 0.4 : 0.9)); cr.rotation.set(this.idRand() * 3, 0, this.idRand() * 3); this.bodyGroup.add(cr); } }
            // Optional glowing mushroom growths (Fungal Snapjaw).
            if (p.fungalGrowths) { for (let i = 0; i < 5; i++) { const x = (this.idRand() - 0.5) * 0.5, z = (this.idRand() - 0.5) * (biped ? 0.4 : 0.9); const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.18, 5), this._mat(0x8a7a6a, 0.8)); stalk.position.set(x, torsoY + 0.32, z); this.bodyGroup.add(stalk); const cap = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2), this._mat(p.accent, 0.6, 0.2, p.accent)); cap.position.set(x, torsoY + 0.42, z); this.bodyGroup.add(cap); } }
            // HEAD with hypnotic eyes.
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12), scale); h.scale.set(0.9, 0.8, 1.3); this.head.add(h);
            const snout = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.26, 6), scale); snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.02, 0.26); this.head.add(snout);
            this._eye(this.head, -0.13, 0.06, 0.18, 0.08, p.accent); this._eye(this.head, 0.13, 0.06, 0.18, 0.08, p.accent);
            if (biped) { this.head.position.set(0, 1.95, 0.05); } else { this.head.position.set(0, 0.85, 0.85); }
            this.bodyGroup.add(this.head);
            // Optional glowing ember throat (Cinderthroat Varanus).
            if (p.emberThroat) {
                this._emberThroat = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 10), this._mat(p.accent, 0.85, 0.3, p.accent));
                this._emberThroat.position.set(this.head.position.x, this.head.position.y - 0.16, this.head.position.z - 0.12);
                this.bodyGroup.add(this._emberThroat);
            }
            // ARMS / LEGS.
            if (biped) {
                this.leftArm = this._lizClawArm(-0.38, 1.5, scale); this.rightArm = this._lizClawArm(0.38, 1.5, scale);
                this.leftLeg = this._lizLeg(-0.18, true, scale); this.rightLeg = this._lizLeg(0.18, true, scale);
            } else {
                this.leftArm = this._lizLeg(-0.34, false, scale, 0.5); this.rightArm = this._lizLeg(0.34, false, scale, 0.5);   // front legs
                this.leftLeg = this._lizLeg(-0.34, false, scale, -0.5); this.rightLeg = this._lizLeg(0.34, false, scale, -0.5); // rear legs
            }
            // TAIL.
            this.tail = new THREE.Group(); let ty = torsoY - (biped ? 0.3 : 0), tz = biped ? -0.3 : -0.7;
            for (let i = 0; i < 6; i++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.16 - i * 0.022, 8, 8), scale); seg.position.set(0, ty - (biped ? i * 0.05 : 0), tz - i * 0.24); this.tail.add(seg); }
            this.bodyGroup.add(this.tail);
            this._partMeshMap = { HEAD: this.head, TORSO: this.body, LEFT_ARM: this.leftArm, RIGHT_ARM: this.rightArm, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg, TAIL: this.tail };
            this._cascadeRules = [
                { gone: ['TORSO'], hide: [this.body, this.head, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg, this.tail] },
                { gone: ['HEAD'], hide: [this.head] }, { gone: ['TAIL'], hide: [this.tail] },
                { gone: ['LEFT_ARM'], hide: [this.leftArm] }, { gone: ['RIGHT_ARM'], hide: [this.rightArm] },
                { gone: ['LEFT_LEG'], hide: [this.leftLeg] }, { gone: ['RIGHT_LEG'], hide: [this.rightLeg] },
            ];
        }
        _lizClawArm(x, y, mat) {
            const g = new THREE.Group();
            const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.34, 6), mat); upper.position.y = -0.17; g.add(upper);
            const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.32, 6), mat); fore.position.y = -0.5; g.add(fore);
            for (let i = -1; i <= 1; i++) { const claw = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.14, 4), this._mat(0x1a1410, 1.0, 0.4)); claw.position.set(i * 0.05, -0.7, 0.04); claw.rotation.x = 0.3; g.add(claw); }
            g.position.set(x, y, 0.05); this.bodyGroup.add(g); return g;
        }
        _lizLeg(x, biped, mat, z) {
            const g = new THREE.Group();
            if (biped) {
                const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.34, 7), mat); thigh.position.set(0, -0.12, 0.04); thigh.rotation.x = 0.4; g.add(thigh);
                const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.36, 6), mat); shin.position.set(0, -0.46, -0.04); shin.rotation.x = -0.5; g.add(shin);
                const foot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.3), mat); foot.position.set(0, -0.66, 0.08); g.add(foot);
                g.position.set(x, 0.95, 0);
            } else {
                const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.6, 6), mat); leg.position.y = -0.0; leg.rotation.z = Math.sign(x) * 0.3; g.add(leg);
                const foot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.2), mat); foot.position.set(Math.sign(x) * 0.12, -0.3, 0.04); g.add(foot);
                g.position.set(x, 0.55, z || 0);
            }
            this.bodyGroup.add(g); return g;
        }

        // ── Blood Widow: a drider (spider body + humanoid torso) ─────────────
        // Source archetype SpiderHumanHybrid: BODY/TORSO/HEAD + 6 leg keys.
        _buildBloodWidow() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.5);
            const chitin = this._mat(0x2a0a10, 0.5);
            // BODY: bulbous spider abdomen low to the ground.
            this.spiderBody = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 12), chitin); this.spiderBody.scale.set(1.1, 0.8, 1.3); this.spiderBody.position.set(0, 0.6, -0.3); this.bodyGroup.add(this.spiderBody);
            const hourglass = new THREE.Mesh(new THREE.CircleGeometry(0.16, 3), this._mat(p.accent, 0.6, 0.4, p.accent)); hourglass.position.set(0, 0.95, -0.3); hourglass.rotation.x = -0.6; this.bodyGroup.add(hourglass);
            // TORSO: humanoid upper body rising from the front of the spider body.
            this.body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.7, 9), skin); this.body.position.set(0, 1.2, 0.2); this.bodyGroup.add(this.body);
            this.leftArm = this._limb(skin, -0.28, 1.45, true); this.rightArm = this._limb(skin, 0.28, 1.45, true);
            // HEAD with multiple eyes.
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), skin); this.head.add(h);
            for (let i = 0; i < 4; i++) this._eye(this.head, -0.12 + (i % 2) * 0.24, 0.04 + Math.floor(i / 2) * 0.1, 0.2, 0.045, p.accent);
            this.head.position.set(0, 1.75, 0.2); this.bodyGroup.add(this.head);
            // Spider legs (6 keyed).
            this.legs = {};
            const defs = [['LEFT_LEG', -1, 0.1], ['RIGHT_LEG', 1, 0.1], ['MIDDLE_LEFT_LEG', -1, -0.2], ['MIDDLE_RIGHT_LEG', 1, -0.2], ['REAR_LEFT_LEG', -1, -0.5], ['REAR_RIGHT_LEG', 1, -0.5]];
            defs.forEach(([k, s, z]) => { this.legs[k] = this._widowLeg(s, z, chitin); });
            this._partMeshMap = { BODY: this.spiderBody, TORSO: this.body, HEAD: this.head, LEFT_ARM: this.leftArm, RIGHT_ARM: this.rightArm, ...this.legs };
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.spiderBody, this.body, this.head, this.leftArm, this.rightArm, ...(this._legsArr || (this._legsArr = Object.values(this.legs)))] },
                { gone: ['TORSO'], hide: [this.body, this.head, this.leftArm, this.rightArm] }, { gone: ['HEAD'], hide: [this.head] },
                { gone: ['LEFT_ARM'], hide: [this.leftArm] }, { gone: ['RIGHT_ARM'], hide: [this.rightArm] },
                ...defs.map(([k]) => ({ gone: [k], hide: [this.legs[k]] })),
            ];
        }
        _widowLeg(side, z, mat) {
            const g = new THREE.Group();
            const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.55, 5), mat); upper.position.set(side * 0.28, 0.15, 0); upper.rotation.z = side * 1.1; g.add(upper);
            const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.6, 5), mat); lower.position.set(side * 0.55, -0.25, 0); lower.rotation.z = side * 0.35; g.add(lower);
            g.position.set(side * 0.25, 0.65, z); g._side = side; this.bodyGroup.add(g); return g;
        }

        // ── Bog Elemental: a shambling mass of muck and roots ────────────────
        // Source archetype Elemental: CORE/UPPER_FORM/LOWER_FORM/LEFT_APPENDAGE/RIGHT_APPENDAGE.
        _buildBogElemental() {
            const p = this.profile;
            const muck = this._skinMat(p.bodyColor, 0.95);
            const rootMat = this._mat(0x2a2014, 0.9);
            // LOWER_FORM: wide muck base. UPPER_FORM: lumpy hunched mass.
            this.lower = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 0.8, 9), muck); this.lower.position.set(0, 0.5, 0); this.bodyGroup.add(this.lower);
            this.upper = new THREE.Group();
            const hump = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), muck); hump.scale.set(1.1, 0.9, 1.0); this.upper.add(hump);
            for (let i = 0; i < 6; i++) { const root = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.4, 5), rootMat); const a = this.idRand() * Math.PI * 2; root.position.set(Math.cos(a) * 0.4, this.idRand() * 0.4 - 0.1, Math.sin(a) * 0.4); root.rotation.set(this.idRand() * 2, 0, this.idRand() * 2); this.upper.add(root); }
            this.upper.position.set(0, 1.2, 0); this.bodyGroup.add(this.upper);
            // CORE: a will-o-wisp light buried inside.
            this.core = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), this._mat(p.accent, 0.85, 0.3, p.accent)); this.core.position.set(0, 1.2, 0.2); this.bodyGroup.add(this.core);
            // Root appendages (arms).
            this.leftApp = this._rootArm(-1, rootMat); this.rightApp = this._rootArm(1, rootMat);
            this._partMeshMap = { CORE: this.core, UPPER_FORM: this.upper, LOWER_FORM: this.lower, LEFT_APPENDAGE: this.leftApp, RIGHT_APPENDAGE: this.rightApp };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.upper, this.lower, this.leftApp, this.rightApp] },
                { gone: ['UPPER_FORM'], hide: [this.upper] }, { gone: ['LOWER_FORM'], hide: [this.lower] },
                { gone: ['LEFT_APPENDAGE'], hide: [this.leftApp] }, { gone: ['RIGHT_APPENDAGE'], hide: [this.rightApp] },
            ];
        }
        _rootArm(side, mat) {
            const g = new THREE.Group(); let py = 0;
            for (let k = 0; k < 4; k++) { const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.08 - k * 0.012, 0.09 - k * 0.012, 0.3, 6), mat); seg.position.set(side * 0.05 * k, py, 0); seg.rotation.z = -side * 0.2; g.add(seg); py -= 0.28; }
            g.position.set(side * 0.5, 1.3, 0.05); g._side = side; this.bodyGroup.add(g); return g;
        }

        // ── Bog Mutant: an asymmetric mass of moss, bone and toxic slime ─────
        // Source archetype Mutant: HEAD/MASS/EXTRA_LIMB_1/EXTRA_LIMB_2/EYE_CLUSTER/TAIL_SPIKE.
        _buildBogMutant() {
            const p = this.profile;
            const flesh = this._skinMat(p.bodyColor, 0.7);
            const slimeMat = this._mat(p.accent, 0.7, 0.2, p.accent);
            // MASS: lumpy asymmetric body.
            this.mass = new THREE.Group();
            const main = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), flesh); main.scale.set(1.2, 1.0, 0.9); this.mass.add(main);
            for (let i = 0; i < 5; i++) { const lump = new THREE.Mesh(new THREE.SphereGeometry(0.18 + this.idRand() * 0.12, 10, 8), flesh); const a = this.idRand() * Math.PI * 2, e = this.idRand() * Math.PI; lump.position.set(Math.sin(e) * Math.cos(a) * 0.55, Math.cos(e) * 0.5, Math.sin(e) * Math.sin(a) * 0.5); this.mass.add(lump); }
            const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 5), this._mat(0xe8e0d0, 1.0, 0.5)); bone.position.set(0.3, 0.3, 0.3); bone.rotation.z = 0.8; this.mass.add(bone);
            this.mass.position.set(0, 1.0, 0); this.bodyGroup.add(this.mass);
            // HEAD: a lopsided head fused to the mass.
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12), flesh); h.scale.set(1.0, 0.9, 0.95); this.head.add(h);
            const maw = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), this._mat(0x2a0808, 0.9, 0.4)); maw.scale.set(1.4, 0.7, 0.6); maw.position.set(0, -0.1, 0.22); this.head.add(maw);
            this.head.position.set(-0.25, 1.5, 0.2); this.head.rotation.z = 0.2; this.bodyGroup.add(this.head);
            // EYE_CLUSTER: a knot of mismatched eyes.
            this.eyeCluster = new THREE.Group();
            for (let i = 0; i < 5; i++) { this._eye(this.eyeCluster, this.idRand() * 0.3 - 0.15, this.idRand() * 0.3 - 0.15, 0.2 + this.idRand() * 0.05, 0.05 + this.idRand() * 0.04, p.accent); }
            this.eyeCluster.position.set(0.3, 1.4, 0.25); this.bodyGroup.add(this.eyeCluster);
            // EXTRA_LIMB_1/2: a clawed arm + a tentacle.
            this.extra1 = this._mutantClawArm(-1, flesh); this.extra2 = this._mutantTentacle(1, flesh);
            // TAIL_SPIKE: a barbed bone tail.
            this.tailSpike = new THREE.Group();
            const tseg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.04, 0.5, 6), flesh); tseg.position.set(0, 0.0, 0); tseg.rotation.x = 1.0; this.tailSpike.add(tseg);
            const barb = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.26, 5), this._mat(0xe8e0d0, 1.0, 0.4)); barb.position.set(0, -0.2, -0.3); barb.rotation.x = 2.2; this.tailSpike.add(barb);
            this.tailSpike.position.set(0.2, 0.7, -0.4); this.bodyGroup.add(this.tailSpike);
            // Toxic drip globs.
            for (let i = 0; i < 4; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), slimeMat); d.position.set(this.idRand() * 0.8 - 0.4, 0.5 + this.idRand() * 0.4, 0.4); d.scale.y = 1.5; this.mass.add(d); }
            this._partMeshMap = { HEAD: this.head, MASS: this.mass, EXTRA_LIMB_1: this.extra1, EXTRA_LIMB_2: this.extra2, EYE_CLUSTER: this.eyeCluster, TAIL_SPIKE: this.tailSpike };
            this._cascadeRules = [
                { gone: ['MASS'], hide: [this.mass, this.head, this.extra1, this.extra2, this.eyeCluster, this.tailSpike] },
                { gone: ['HEAD'], hide: [this.head] }, { gone: ['EYE_CLUSTER'], hide: [this.eyeCluster] },
                { gone: ['EXTRA_LIMB_1'], hide: [this.extra1] }, { gone: ['EXTRA_LIMB_2'], hide: [this.extra2] }, { gone: ['TAIL_SPIKE'], hide: [this.tailSpike] },
            ];
        }
        _mutantClawArm(side, mat) {
            const g = new THREE.Group();
            const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.4, 6), mat); upper.position.y = -0.2; upper.rotation.z = side * 0.3; g.add(upper);
            for (let i = -1; i <= 1; i++) { const claw = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.2, 4), this._mat(0x1a1410, 1.0, 0.4)); claw.position.set(i * 0.06, -0.5, 0.05); claw.rotation.x = 0.3; g.add(claw); }
            g.position.set(side * 0.5, 1.2, 0.1); g._side = side; this.bodyGroup.add(g); return g;
        }
        _mutantTentacle(side, mat) {
            const g = new THREE.Group(); let py = 0;
            for (let k = 0; k < 5; k++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.11 - k * 0.016, 8, 8), mat); seg.position.set(side * 0.05 * k, py, 0); py -= 0.18; g.add(seg); }
            g.position.set(side * 0.5, 1.2, 0.05); g._side = side; this.bodyGroup.add(g); return g;
        }

        // ── Brine Wisp: a small briny water sprite with jet nozzles ──────────
        // Source archetype WaterElemental: CORE/BODY/WATER_ARMS/LEFT_WATER_LEG/RIGHT_WATER_LEG.
        _buildBrineWisp() {
            const p = this.profile;
            const water = this._skinMat(p.bodyColor, 0.15); water.transparent = true; water.opacity = 0.6; water.emissive = new THREE.Color(0x2a566a); water.emissiveIntensity = 0.35;
            // BODY: a compact floating water orb-droplet.
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 14), water); this.body.scale.set(1, 1.2, 1); this.body.position.set(0, 1.5, 0); this.bodyGroup.add(this.body);
            // Salt-crystal flecks suspended inside.
            for (let i = 0; i < 6; i++) { const fleck = new THREE.Mesh(new THREE.TetrahedronGeometry(0.05, 0), this._mat(0xeafaff, 0.8, 0.2, 0x88ccff)); fleck.position.set(this.idRand() * 0.5 - 0.25, 1.5 + this.idRand() * 0.5 - 0.25, this.idRand() * 0.4 - 0.2); this.bodyGroup.add(fleck); }
            this.core = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), this._mat(p.accent, 0.9, 0.2, p.accent)); this.core.position.set(0, 1.5, 0.05); this.bodyGroup.add(this.core);
            // WATER_ARMS: two high-pressure jet streams.
            this.arms = new THREE.Group();
            [-1, 1].forEach(s => { const g = new THREE.Group(); const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 8), water); nozzle.position.set(s * 0.4, 1.45, 0); nozzle.rotation.z = -s * Math.PI / 2; g.add(nozzle); const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 0.4, 6), this._mat(p.accent, 0.4, 0.2, p.accent)); jet.position.set(s * 0.7, 1.45, 0); jet.rotation.z = -s * Math.PI / 2; g.add(jet); g._side = s; this.arms.add(g); });
            this.bodyGroup.add(this.arms);
            // Short tail-drips as the "legs".
            this.leftLeg = this._brineTail(-0.16, water); this.rightLeg = this._brineTail(0.16, water);
            this._partMeshMap = { CORE: this.core, BODY: this.body, WATER_ARMS: this.arms, LEFT_WATER_LEG: this.leftLeg, RIGHT_WATER_LEG: this.rightLeg };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.body, this.arms, this.leftLeg, this.rightLeg] },
                { gone: ['BODY'], hide: [this.body, this.arms] }, { gone: ['WATER_ARMS'], hide: [this.arms] },
                { gone: ['LEFT_WATER_LEG'], hide: [this.leftLeg] }, { gone: ['RIGHT_WATER_LEG'], hide: [this.rightLeg] },
            ];
        }
        _brineTail(x, mat) {
            const g = new THREE.Group(); let py = 0;
            for (let k = 0; k < 3; k++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.1 - k * 0.025, 8, 8), mat); seg.position.set(0, py, 0); py -= 0.16; g.add(seg); }
            g.position.set(x, 1.1, 0); this.bodyGroup.add(g); return g;
        }

        _hueHex(t) { const c = new THREE.Color(); c.setHSL(((t % 1) + 1) % 1, 0.9, 0.55); return c.getHex(); }

        // ── Crystal Entity: a faceted gem-being (hoarder / siren / stalker) ──
        // Source archetype CrystalEntity: CORE/LEFT_SPIRE/RIGHT_SPIRE/FOCUS_GEM/SHIELD_CRYSTAL.
        _buildCrystalEntity() {
            const p = this.profile;
            const crys = this._skinMat(p.bodyColor, 0.2); crys.transparent = true; crys.opacity = 0.82; crys.emissive = new THREE.Color(p.accent); crys.emissiveIntensity = 0.25;
            this.core = new THREE.Group();
            const main = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), crys); main.scale.set(1, 1.3, 1); this.core.add(main);
            for (let i = 0; i < 4; i++) { const sh = new THREE.Mesh(new THREE.OctahedronGeometry(0.2 + this.idRand() * 0.12, 0), crys); const a = this.idRand() * Math.PI * 2; sh.position.set(Math.cos(a) * 0.35, this.idRand() * 0.6 - 0.2, Math.sin(a) * 0.3); this.core.add(sh); }
            this.core.position.set(0, 1.2, 0); this.bodyGroup.add(this.core);
            this._eye(this.core, -0.13, 0.1, 0.4, 0.07, p.accent); this._eye(this.core, 0.13, 0.1, 0.4, 0.07, p.accent);
            if (p.stalker) { for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 4), crys); f.position.set(s * 0.08, 0.85, 0.38); f.rotation.x = Math.PI; this.bodyGroup.add(f); } }
            this.leftSpire = this._crystalSpire(-1, crys); this.rightSpire = this._crystalSpire(1, crys);
            this.focusGem = new THREE.Mesh(new THREE.OctahedronGeometry(p.siren ? 0.26 : 0.16, 0), this._mat(p.accent, 0.9, 0.1, p.accent)); this.focusGem.position.set(0, 1.95, 0.12); this.bodyGroup.add(this.focusGem);
            this.shieldCrystal = new THREE.Group();
            for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const sh = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), crys); sh.position.set(Math.cos(a) * 0.72, 1.2, Math.sin(a) * 0.72); this.shieldCrystal.add(sh); }
            this.bodyGroup.add(this.shieldCrystal);
            if (p.hoard) { for (let i = 0; i < 8; i++) { const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 8), this._mat(0xffcc33, 0.3, 0.8, 0x553300)); coin.position.set(this.idRand() * 0.8 - 0.4, 0.45 + this.idRand() * 0.3, this.idRand() * 0.6 - 0.3); coin.rotation.set(this.idRand() * 3, 0, this.idRand() * 3); this.bodyGroup.add(coin); } }
            this._partMeshMap = { CORE: this.core, LEFT_SPIRE: this.leftSpire, RIGHT_SPIRE: this.rightSpire, FOCUS_GEM: this.focusGem, SHIELD_CRYSTAL: this.shieldCrystal };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.leftSpire, this.rightSpire, this.focusGem, this.shieldCrystal] },
                { gone: ['LEFT_SPIRE'], hide: [this.leftSpire] }, { gone: ['RIGHT_SPIRE'], hide: [this.rightSpire] },
                { gone: ['FOCUS_GEM'], hide: [this.focusGem] }, { gone: ['SHIELD_CRYSTAL'], hide: [this.shieldCrystal] },
            ];
        }
        _crystalSpire(side, mat) {
            const g = new THREE.Group();
            for (let k = 0; k < 3; k++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.12 - k * 0.03, 0.5 - k * 0.1, 5), mat); sp.position.set(side * 0.05 * k, 0.3 + k * 0.3, 0); sp.rotation.z = -side * 0.2; g.add(sp); }
            g.position.set(side * 0.55, 0.9, -0.1); g._side = side; this.bodyGroup.add(g); return g;
        }

        // ── Serpent: a coiled snake (phantom / venom / centipede) ────────────
        // Source archetype Serpent: HEAD/FANGS/BODY_SEGMENT_1/BODY_SEGMENT_2/TAIL.
        _buildSerpent() {
            const p = this.profile;
            const scale = this._skinMat(p.bodyColor, 0.4);
            if (p.phantom) { scale.transparent = true; scale.opacity = 0.6; scale.emissive = new THREE.Color(p.accent); scale.emissiveIntensity = 0.3; }
            this.tail = new THREE.Group();
            for (let i = 0; i < 12; i++) { const a = i * 0.9; const r = 0.55 - i * 0.025; const seg = new THREE.Mesh(new THREE.SphereGeometry(0.2 - i * 0.006, 10, 8), scale); seg.position.set(Math.cos(a) * r, 0.18 + i * 0.015, Math.sin(a) * r); this.tail.add(seg); if (p.centipede) { for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.008, 0.24, 4), scale); leg.position.set(Math.cos(a) * r + s * 0.12, 0.1 + i * 0.015, Math.sin(a) * r); leg.rotation.z = s * 0.9; this.tail.add(leg); } } }
            this.bodyGroup.add(this.tail);
            this.seg1 = new THREE.Group(); let py = 0.4, pz = 0;
            for (let i = 0; i < 5; i++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.19 - i * 0.012, 10, 8), scale); seg.position.set(0, py, pz); this.seg1.add(seg); py += 0.2; pz += (i < 2 ? 0.08 : -0.04); }
            this.bodyGroup.add(this.seg1);
            this.seg2 = new THREE.Group(); py = 1.4; pz = 0.04;
            for (let i = 0; i < 4; i++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.16 - i * 0.012, 10, 8), scale); seg.position.set(0, py, pz); this.seg2.add(seg); py += 0.18; pz += 0.05; }
            this.bodyGroup.add(this.seg2);
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), scale); skull.scale.set(1, 0.8, 1.3); this.head.add(skull);
            if (p.phantom) { const hood = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), scale); hood.scale.set(1.4, 0.55, 0.6); hood.position.set(0, 0.06, -0.1); hood.rotation.x = Math.PI; this.head.add(hood); }
            this._eye(this.head, -0.1, 0.05, 0.18, 0.06, p.accent); this._eye(this.head, 0.1, 0.05, 0.18, 0.06, p.accent);
            this.head.position.set(0, 2.1, 0.3); this.head.rotation.x = 0.3; this.bodyGroup.add(this.head);
            this.fangs = new THREE.Group();
            for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 4), this._mat(0xf4ecdc, 1, 0.3)); f.position.set(s * 0.06, 1.98, 0.45); f.rotation.x = Math.PI - 0.3; this.fangs.add(f); const drop = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), this._mat(p.accent, 0.8, 0.3, p.accent)); drop.position.set(s * 0.06, 1.9, 0.47); this.fangs.add(drop); }
            this.bodyGroup.add(this.fangs);
            this._partMeshMap = { HEAD: this.head, FANGS: this.fangs, BODY_SEGMENT_1: this.seg1, BODY_SEGMENT_2: this.seg2, TAIL: this.tail };
            this._cascadeRules = [
                { gone: ['TAIL'], hide: [this.tail, this.seg1, this.seg2, this.head, this.fangs] },
                { gone: ['BODY_SEGMENT_1'], hide: [this.seg1, this.seg2, this.head, this.fangs] },
                { gone: ['BODY_SEGMENT_2'], hide: [this.seg2, this.head, this.fangs] },
                { gone: ['HEAD'], hide: [this.head, this.fangs] }, { gone: ['FANGS'], hide: [this.fangs] },
            ];
        }

        // ── Crystal Turtle: a turtle with a jagged crystallized shell ────────
        // Source archetype Turtle: SHELL/HEAD/4 legs/TAIL.
        _buildCrystalTurtle() {
            const p = this.profile;
            const skin = this._skinMat(0x5a6a7a, 0.5);
            const crys = this._skinMat(p.bodyColor, 0.2); crys.transparent = true; crys.opacity = 0.85; crys.emissive = new THREE.Color(p.accent); crys.emissiveIntensity = 0.2;
            this.shell = new THREE.Group();
            const dome = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 0), crys); dome.scale.set(1.2, 0.7, 1.2); this.shell.add(dome);
            for (let i = 0; i < 7; i++) { const a = this.idRand() * Math.PI * 2, r = this.idRand() * 0.4; const sh = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.32, 4), crys); sh.position.set(Math.cos(a) * r, 0.32 + this.idRand() * 0.2, Math.sin(a) * r); sh.rotation.set(this.idRand(), 0, this.idRand()); this.shell.add(sh); }
            this.shell.position.set(0, 0.75, 0); this.bodyGroup.add(this.shell);
            const plastron = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.15, 14), skin); plastron.position.set(0, 0.35, 0); this.bodyGroup.add(plastron);
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), skin); h.scale.set(0.9, 0.9, 1.2); this.head.add(h);
            this._eye(this.head, -0.1, 0.04, 0.18, 0.05, p.accent); this._eye(this.head, 0.1, 0.04, 0.18, 0.05, p.accent);
            this.head.position.set(0, 0.55, 0.66); this.bodyGroup.add(this.head);
            this.frontLeft = this._turtleLeg(-0.42, 0.32, skin); this.frontRight = this._turtleLeg(0.42, 0.32, skin);
            this.rearLeft = this._turtleLeg(-0.42, -0.32, skin); this.rearRight = this._turtleLeg(0.42, -0.32, skin);
            this.tail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 6), skin); this.tail.position.set(0, 0.45, -0.62); this.tail.rotation.x = -1.8; this.bodyGroup.add(this.tail);
            this._partMeshMap = { SHELL: this.shell, HEAD: this.head, LEFT_LEG: this.frontLeft, RIGHT_LEG: this.frontRight, REAR_LEFT_LEG: this.rearLeft, REAR_RIGHT_LEG: this.rearRight, TAIL: this.tail };
            this._cascadeRules = [
                { gone: ['SHELL'], hide: [this.shell, this.head, this.frontLeft, this.frontRight, this.rearLeft, this.rearRight, this.tail] },
                { gone: ['HEAD'], hide: [this.head] }, { gone: ['TAIL'], hide: [this.tail] },
                { gone: ['LEFT_LEG'], hide: [this.frontLeft] }, { gone: ['RIGHT_LEG'], hide: [this.frontRight] }, { gone: ['REAR_LEFT_LEG'], hide: [this.rearLeft] }, { gone: ['REAR_RIGHT_LEG'], hide: [this.rearRight] },
            ];
        }

        // ── Elderwood Guardian: an ancient face-bearing treant ───────────────
        // Source archetype Plant: FLOWER/STEM/ROOTS/VINE_1/VINE_2.
        _buildElderTreant() {
            const p = this.profile;
            const wood = this._skinMat(p.bodyColor, 0.9);
            const leaf = this._mat(p.accent, 1, 0.6, 0x0a2a08);
            this.stem = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 1.8, 9), wood); this.stem.position.set(0, 1.1, 0); this.bodyGroup.add(this.stem);
            // Carved face on the trunk.
            this._eye(this.stem, -0.18, 0.4, 0.4, 0.09, p.accent); this._eye(this.stem, 0.18, 0.4, 0.4, 0.09, p.accent);
            const maw = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.1), this._mat(0x140a06, 1, 0.6)); maw.position.set(0, 0.05, 0.4); this.stem.add(maw);
            // FLOWER: a leafy canopy crown.
            this.flower = new THREE.Group();
            for (let i = 0; i < 10; i++) { const a = this.idRand() * Math.PI * 2, r = this.idRand() * 0.45; const cl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28 + this.idRand() * 0.14, 0), leaf); cl.position.set(Math.cos(a) * r, 2.3 + this.idRand() * 0.4, Math.sin(a) * r); this.flower.add(cl); }
            this.bodyGroup.add(this.flower);
            // VINE_1 / VINE_2: gnarled branch arms.
            this.vine1 = this._vineArm(-1, wood, leaf); this.vine2 = this._vineArm(1, wood, leaf);
            // ROOTS: splayed base roots.
            this.roots = new THREE.Group();
            for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const r = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.6, 5), wood); r.position.set(Math.cos(a) * 0.3, 0.2, Math.sin(a) * 0.3); r.rotation.z = Math.cos(a) * 0.7; r.rotation.x = -Math.sin(a) * 0.7; this.roots.add(r); }
            this.bodyGroup.add(this.roots);
            this._partMeshMap = { FLOWER: this.flower, STEM: this.stem, ROOTS: this.roots, VINE_1: this.vine1, VINE_2: this.vine2 };
            this._cascadeRules = [
                { gone: ['STEM'], hide: [this.stem, this.flower, this.roots, this.vine1, this.vine2] },
                { gone: ['FLOWER'], hide: [this.flower] }, { gone: ['ROOTS'], hide: [this.roots] },
                { gone: ['VINE_1'], hide: [this.vine1] }, { gone: ['VINE_2'], hide: [this.vine2] },
            ];
        }

        // ── Electro Arachnid: a spider crackling with electricity ────────────
        // Source archetype Spider (8 legs + cephalothorax/abdomen/fangs/spinnerets).
        _buildElectroSpider() {
            const p = this.profile;
            const carapace = this._skinMat(p.bodyColor, 0.4);
            const spark = this._mat(p.accent, 0.9, 0.2, p.accent);
            this.cephalothorax = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 12), carapace); this.cephalothorax.position.set(0, 0.7, 0.35); this.bodyGroup.add(this.cephalothorax);
            this.abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 12), carapace); this.abdomen.scale.set(1.0, 0.85, 1.2); this.abdomen.position.set(0, 0.75, -0.35); this.bodyGroup.add(this.abdomen);
            // Arcing electric nodes on the abdomen.
            this.arcs = new THREE.Group();
            for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const node = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), spark); node.position.set(Math.cos(a) * 0.4, 1.0 + Math.sin(a) * 0.1, -0.35 + Math.sin(a) * 0.3); this.arcs.add(node); }
            this.bodyGroup.add(this.arcs);
            this.head = new THREE.Group();
            for (let i = 0; i < 4; i++) this._eye(this.head, -0.12 + (i % 2) * 0.24, 0.02 + Math.floor(i / 2) * 0.1, 0.28, 0.05, p.accent);
            this.head.position.set(0, 0.72, 0.35); this.bodyGroup.add(this.head);
            this.fangs = new THREE.Group();
            for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 5), this._mat(0x1a1a2a, 1, 0.4)); f.position.set(s * 0.08, 0.58, 0.6); f.rotation.x = 2.6; this.fangs.add(f); }
            this.bodyGroup.add(this.fangs);
            this.spinnerets = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.2, 6), spark); this.spinnerets.position.set(0, 0.7, -0.85); this.spinnerets.rotation.x = -1.6; this.bodyGroup.add(this.spinnerets);
            this.legs = {};
            const legDefs = [['LEFT_LEG', -1, 0.45, 0.4], ['RIGHT_LEG', 1, 0.45, 0.4], ['MID_LEFT_LEG', -1, 0.15, 0.55], ['MID_RIGHT_LEG', 1, 0.15, 0.55], ['MID_REAR_LEFT_LEG', -1, -0.15, 0.55], ['MID_REAR_RIGHT_LEG', 1, -0.15, 0.55], ['REAR_LEFT_LEG', -1, -0.45, 0.4], ['REAR_RIGHT_LEG', 1, -0.45, 0.4]];
            // Pass z raw so legs straddle the body (same fix as Cinder Weaver);
            // adding 0.7 pushed every leg out in front of the cephalothorax.
            legDefs.forEach(([key, side, z, spread]) => { this.legs[key] = this._spiderLeg(side, z, spread, carapace); });
            this._partMeshMap = { HEAD: this.head, CEPHALOTHORAX: this.cephalothorax, ABDOMEN: this.abdomen, FANGS: this.fangs, SPINNERETS: this.spinnerets, ...this.legs };
            this._cascadeRules = [
                { gone: ['CEPHALOTHORAX'], hide: [this.cephalothorax, this.abdomen, this.head, this.fangs, this.spinnerets, this.arcs, ...(this._legsArr || (this._legsArr = Object.values(this.legs)))] },
                { gone: ['HEAD'], hide: [this.head] }, { gone: ['ABDOMEN'], hide: [this.abdomen, this.spinnerets, this.arcs] }, { gone: ['FANGS'], hide: [this.fangs] }, { gone: ['SPINNERETS'], hide: [this.spinnerets] },
                ...legDefs.map(([k]) => ({ gone: [k], hide: [this.legs[k]] })),
            ];
        }

        // ── Engorged Tick Swarm: a writhing mass of bloodsucking ticks ───────
        // Source archetype Insectoid: HEAD/THORAX/ABDOMEN/6 legs/MANDIBLES.
        _buildTickSwarm() {
            const p = this.profile;
            const flesh = this._skinMat(p.bodyColor, 0.6);
            const blood = this._mat(p.accent, 0.8, 0.3, 0x330808);
            // THORAX: the central engorged blob of fused ticks.
            this.thorax = new THREE.Group();
            const main = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 12), flesh); this.thorax.add(main);
            this._ticks = [];
            for (let i = 0; i < 14; i++) { const tick = new THREE.Mesh(new THREE.SphereGeometry(0.1 + this.idRand() * 0.08, 8, 8), this.idRand() > 0.5 ? blood : flesh); const a = this.idRand() * Math.PI * 2, e = this.idRand() * Math.PI; const r = 0.45 + this.idRand() * 0.15; tick.position.set(Math.sin(e) * Math.cos(a) * r, Math.cos(e) * r, Math.sin(e) * Math.sin(a) * r); for (const s of [-1, 1]) { const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.006, 0.12, 4), flesh); lg.position.set(s * 0.08, -0.04, 0); lg.rotation.z = s * 0.9; tick.add(lg); } this.thorax.add(tick); this._ticks.push(tick); }
            this.thorax.position.set(0, 0.9, 0); this.bodyGroup.add(this.thorax);
            // HEAD: a dominant big tick at the front with eyes + mandibles.
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12), blood); this.head.add(h);
            this._eye(this.head, -0.1, 0.05, 0.2, 0.05, 0x220404); this._eye(this.head, 0.1, 0.05, 0.2, 0.05, 0x220404);
            this.head.position.set(0, 0.95, 0.5); this.bodyGroup.add(this.head);
            this.mandibles = new THREE.Group();
            for (const s of [-1, 1]) { const md = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 4), this._mat(0x1a0a0a, 1, 0.4)); md.position.set(s * 0.06, 0.86, 0.66); md.rotation.x = 1.3; this.mandibles.add(md); }
            this.bodyGroup.add(this.mandibles);
            // ABDOMEN: a swollen blood-sac at the back.
            this.abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 10), blood); this.abdomen.position.set(0, 0.85, -0.5); this.bodyGroup.add(this.abdomen);
            // Skittering legs underneath.
            this.legs = {};
            const defs = [['LEFT_LEG', -1, 0.2], ['RIGHT_LEG', 1, 0.2], ['MIDDLE_LEFT_LEG', -1, -0.05], ['MIDDLE_RIGHT_LEG', 1, -0.05], ['REAR_LEFT_LEG', -1, -0.3], ['REAR_RIGHT_LEG', 1, -0.3]];
            defs.forEach(([k, s, z]) => { const g = new THREE.Group(); const u = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.015, 0.4, 5), flesh); u.position.set(s * 0.2, -0.05, 0); u.rotation.z = s * 1.1; g.add(u); g.position.set(s * 0.4, 0.7, z); g._side = s; this.bodyGroup.add(g); this.legs[k] = g; });
            this._partMeshMap = { HEAD: this.head, THORAX: this.thorax, ABDOMEN: this.abdomen, MANDIBLES: this.mandibles, ...this.legs };
            this._cascadeRules = [
                { gone: ['THORAX'], hide: [this.thorax, this.head, this.abdomen, this.mandibles, ...(this._legsArr || (this._legsArr = Object.values(this.legs)))] },
                { gone: ['HEAD'], hide: [this.head, this.mandibles] }, { gone: ['ABDOMEN'], hide: [this.abdomen] }, { gone: ['MANDIBLES'], hide: [this.mandibles] },
                ...defs.map(([k]) => ({ gone: [k], hide: [this.legs[k]] })),
            ];
        }

        // ── Theropod: a bipedal T-rex (celestial / cobalt dino-cat) ──────────
        // Source archetype Reptilian: HEAD/TORSO/LEFT_ARM/RIGHT_ARM/LEFT_LEG/RIGHT_LEG/TAIL.
        _buildTheropod() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.5);
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 12), skin); this.body.scale.set(1.0, 0.9, 1.6); this.body.position.set(0, 1.2, 0); this.bodyGroup.add(this.body);
            if (p.starry) { for (let i = 0; i < 16; i++) { const st = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), this._mat(p.accent, 0.9, 0.2, p.accent)); st.position.set(this.idRand() - 0.5, this.idRand() * 0.6 - 0.3, this.idRand() * 1.4 - 0.7); this.body.add(st); } }
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.52), skin); this.head.add(skull);
            const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.44), skin); jaw.position.set(0, -0.17, 0.06); this.head.add(jaw); this.head._jaw = jaw;
            for (let i = 0; i < 5; i++) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.09, 4), this._mat(0xe8e0d0, 1, 0.4)); t.position.set(-0.1 + i * 0.05, -0.04, 0.26); t.rotation.x = Math.PI; this.head.add(t); }
            this._eye(this.head, -0.14, 0.1, 0.2, 0.05, p.accent); this._eye(this.head, 0.14, 0.1, 0.2, 0.05, p.accent);
            if (p.catEars) { for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 4), skin); ear.position.set(s * 0.15, 0.26, -0.04); ear.rotation.z = s * 0.2; this.head.add(ear); } }
            this.head.position.set(0, 1.8, 0.95); this.head.rotation.x = 0.1; this.bodyGroup.add(this.head);
            this.leftArm = this._trexArm(-0.28, skin); this.rightArm = this._trexArm(0.28, skin);
            this.leftLeg = this._trexLeg(-0.26, skin); this.rightLeg = this._trexLeg(0.26, skin);
            this.tail = new THREE.Group(); let ty = 1.2, tz = -0.7;
            for (let i = 0; i < 7; i++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.26 - i * 0.03, 8, 8), skin); seg.position.set(0, ty - i * 0.03, tz - i * 0.3); this.tail.add(seg); }
            this.bodyGroup.add(this.tail);
            this._partMeshMap = { HEAD: this.head, TORSO: this.body, LEFT_ARM: this.leftArm, RIGHT_ARM: this.rightArm, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg, TAIL: this.tail };
            this._cascadeRules = [
                { gone: ['TORSO'], hide: [this.body, this.head, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg, this.tail] },
                { gone: ['HEAD'], hide: [this.head] }, { gone: ['TAIL'], hide: [this.tail] },
                { gone: ['LEFT_ARM'], hide: [this.leftArm] }, { gone: ['RIGHT_ARM'], hide: [this.rightArm] },
                { gone: ['LEFT_LEG'], hide: [this.leftLeg] }, { gone: ['RIGHT_LEG'], hide: [this.rightLeg] },
            ];
        }
        _trexArm(x, mat) {
            const g = new THREE.Group();
            const u = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.22, 6), mat); u.position.y = -0.11; g.add(u);
            for (let i = -1; i <= 1; i += 2) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.08, 4), this._mat(0xe8e0d0, 1, 0.4)); c.position.set(i * 0.03, -0.24, 0.04); g.add(c); }
            g.position.set(x, 1.35, 0.45); this.bodyGroup.add(g); return g;
        }
        _trexLeg(x, mat) {
            const g = new THREE.Group();
            const th = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.1, 0.5, 7), mat); th.position.y = -0.1; g.add(th);
            const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.42, 6), mat); sh.position.set(0, -0.5, 0.06); sh.rotation.x = 0.3; g.add(sh);
            const foot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.36), mat); foot.position.set(0, -0.72, 0.16); g.add(foot);
            g.position.set(x, 1.0, 0); this.bodyGroup.add(g); return g;
        }

        // ── Chainbound Fury: a chain-wrapped predatory insectoid ─────────────
        // Source archetype Insectoid: HEAD/THORAX/ABDOMEN/6 legs/MANDIBLES.
        _buildChainFury() {
            const p = this.profile;
            const chitin = this._skinMat(p.bodyColor, 0.45);
            const iron = this._mat(p.accent, 1.0, 0.3, 0);
            this.thorax = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 12), chitin); this.thorax.position.set(0, 0.95, 0); this.bodyGroup.add(this.thorax);
            this.abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.44, 14, 12), chitin); this.abdomen.scale.set(1, 0.9, 1.3); this.abdomen.position.set(0, 0.95, -0.55); this.bodyGroup.add(this.abdomen);
            // Chain wraps around the abdomen.
            for (let i = 0; i < 3; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4 - i * 0.05, 0.04, 6, 14), iron); ring.position.set(0, 0.95, -0.4 - i * 0.18); ring.rotation.x = Math.PI / 2; this.bodyGroup.add(ring); }
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), chitin); this.head.add(h);
            for (let i = 0; i < 4; i++) this._eye(this.head, -0.1 + (i % 2) * 0.2, 0.02 + Math.floor(i / 2) * 0.1, 0.2, 0.045, p.accent);
            this.head.position.set(0, 1.0, 0.32); this.bodyGroup.add(this.head);
            this.mandibles = new THREE.Group();
            for (const s of [-1, 1]) { const md = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 5), iron); md.position.set(s * 0.1, 0.92, 0.5); md.rotation.x = 1.4; md.rotation.z = -s * 0.5; this.mandibles.add(md); }
            this.bodyGroup.add(this.mandibles);
            // Dangling chain whips on the front legs.
            this.legs = {};
            const defs = [['LEFT_LEG', -1, 0.25], ['RIGHT_LEG', 1, 0.25], ['MIDDLE_LEFT_LEG', -1, 0.0], ['MIDDLE_RIGHT_LEG', 1, 0.0], ['REAR_LEFT_LEG', -1, -0.25], ['REAR_RIGHT_LEG', 1, -0.25]];
            defs.forEach(([k, s, z]) => { this.legs[k] = this._spiderLeg(s, 0.95 + z, 0, chitin); });
            this._partMeshMap = { HEAD: this.head, THORAX: this.thorax, ABDOMEN: this.abdomen, MANDIBLES: this.mandibles, ...this.legs };
            this._cascadeRules = [
                { gone: ['THORAX'], hide: [this.thorax, this.abdomen, this.head, this.mandibles, ...(this._legsArr || (this._legsArr = Object.values(this.legs)))] },
                { gone: ['HEAD'], hide: [this.head, this.mandibles] }, { gone: ['ABDOMEN'], hide: [this.abdomen] }, { gone: ['MANDIBLES'], hide: [this.mandibles] },
                ...defs.map(([k]) => ({ gone: [k], hide: [this.legs[k]] })),
            ];
        }

        // ── Beast: a generic quadruped fallback (bespoke beasts now live in 3DBattler_Beasts.js) ──
        // Source archetype Beast: HEAD/BODY/LEFT_LEG/RIGHT_LEG/REAR_LEFT_LEG/REAR_RIGHT_LEG/TAIL.
        _buildBeast() {
            const p = this.profile;
            const fur = this._skinMat(p.bodyColor, 0.85);
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 12), fur); this.body.scale.set(1.0, 0.9, 1.5); this.body.position.set(0, 0.85, 0); this.bodyGroup.add(this.body);
            if (p.spineRidge) { for (let i = 0; i < 6; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 4), this._mat(p.accent, 0.9, 0.5)); sp.position.set(0, 1.2, 0.5 - i * 0.2); sp.rotation.x = -0.2; this.bodyGroup.add(sp); } }
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), fur); this.head.add(h);
            const snout = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 8), fur); snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.04, 0.28); this.head.add(snout);
            this._eye(this.head, -0.12, 0.06, 0.24, 0.06, p.accent); this._eye(this.head, 0.12, 0.06, 0.24, 0.06, p.accent);
            if (p.bigFangs) { for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 4), this._mat(0xf4ecdc, 1, 0.3)); f.position.set(s * 0.06, -0.16, 0.34); f.rotation.x = Math.PI; this.head.add(f); } }
            if (p.leatheryEars) { for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.24, 4), fur); ear.position.set(s * 0.18, 0.22, 0); ear.rotation.z = s * 0.5; this.head.add(ear); } }
            if (p.horn) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.5, 6), this._mat(p.accent, 0.6, 0.3, p.accent)); horn.position.set(0, 0.3, 0.26); horn.rotation.x = 0.4; this.head.add(horn); }
            if (p.mane) { this._mane = new THREE.Group(); for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; const col = p.maneRainbow ? this._hueHex(i / 16) : p.accent; const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.32, 4), this._mat(col, 0.9, 0.5, col)); tuft.position.set(Math.cos(a) * 0.34, 0.32, Math.sin(a) * 0.34); tuft.rotation.z = Math.cos(a) * 0.7; tuft.rotation.x = -Math.sin(a) * 0.7; this._mane.add(tuft); } this.head.add(this._mane); }
            this.head.position.set(0, 1.05, 0.7); this.bodyGroup.add(this.head);
            // Extra heads (Cerberus): clone the head to the sides.
            this._extraHeads = [];
            if (p.heads && p.heads > 1) { for (let hI = 1; hI < p.heads; hI++) { const side = hI === 1 ? -1 : 1; const eh = this.head.clone(); eh.position.set(side * 0.34, 1.0, 0.6); eh.rotation.y = side * 0.5; this.bodyGroup.add(eh); this._extraHeads.push(eh); } }
            this.frontLeft = this._beastLeg(-0.25, 0.45, fur); this.frontRight = this._beastLeg(0.25, 0.45, fur);
            this.rearLeft = this._beastLeg(-0.25, -0.45, fur); this.rearRight = this._beastLeg(0.25, -0.45, fur);
            if (p.wings) { this.leftWing = this._beastWing(-1, p.accent); this.rightWing = this._beastWing(1, p.accent); }
            // TAIL: barbed scorpion tail (manticore) or drooping tail.
            this.tail = new THREE.Group();
            if (p.barbTail) { let ty = 1.0, tz = -0.7; for (let i = 0; i < 5; i++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.12 - i * 0.012, 8, 8), fur); seg.position.set(0, ty + i * 0.12, tz + i * 0.03); this.tail.add(seg); } const barb = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.28, 5), this._mat(p.accent, 0.9, 0.4, p.accent)); barb.position.set(0, 1.65, -0.55); barb.rotation.x = 1.0; this.tail.add(barb); }
            else { let ty = 0.85, tz = -0.7; for (let i = 0; i < 5; i++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.12 - i * 0.018, 8, 8), fur); seg.position.set(0, ty - i * 0.06, tz - i * 0.18); this.tail.add(seg); } }
            this.bodyGroup.add(this.tail);
            this._partMeshMap = { HEAD: this.head, BODY: this.body, LEFT_LEG: this.frontLeft, RIGHT_LEG: this.frontRight, REAR_LEFT_LEG: this.rearLeft, REAR_RIGHT_LEG: this.rearRight, TAIL: this.tail };
            const wings = [this.leftWing, this.rightWing].filter(Boolean);
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.body, this.head, this.frontLeft, this.frontRight, this.rearLeft, this.rearRight, this.tail, ...wings, ...this._extraHeads] },
                { gone: ['HEAD'], hide: [this.head, ...this._extraHeads] }, { gone: ['TAIL'], hide: [this.tail] },
                { gone: ['LEFT_LEG'], hide: [this.frontLeft] }, { gone: ['RIGHT_LEG'], hide: [this.frontRight] },
                { gone: ['REAR_LEFT_LEG'], hide: [this.rearLeft] }, { gone: ['REAR_RIGHT_LEG'], hide: [this.rearRight] },
            ];
        }
        _beastLeg(x, z, mat) {
            const g = new THREE.Group();
            const u = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.45, 6), mat); u.position.y = -0.05; g.add(u);
            const paw = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), mat); paw.position.y = -0.3; g.add(paw);
            g.position.set(x, 0.6, z); this.bodyGroup.add(g); return g;
        }
        _beastWing(side, accent) {
            const g = new THREE.Group();
            const mem = this._mat(0x2a1018, 0.8); mem.side = THREE.DoubleSide;
            const web = new THREE.Mesh(new THREE.CircleGeometry(0.45, 8, 0, Math.PI), mem); web.position.set(side * 0.35, 1.3, -0.2); web.rotation.z = side * 1.0; web.rotation.y = side * 0.4; g.add(web);
            g._side = side; this.bodyGroup.add(g); return g;
        }

        // ── Cinder Weaver: a volcanic spider with burning silk ───────────────
        // Source archetype Spider (8 legs + cephalothorax/abdomen/fangs/spinnerets).
        _buildCinderWeaver() {
            const p = this.profile;
            const char = this._skinMat(p.bodyColor, 0.6);
            const ember = this._mat(p.accent, 0.9, 0.3, p.accent);
            this.cephalothorax = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 12), char); this.cephalothorax.position.set(0, 0.7, 0.35); this.bodyGroup.add(this.cephalothorax);
            this.abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 12), char); this.abdomen.scale.set(1.0, 0.85, 1.2); this.abdomen.position.set(0, 0.75, -0.35); this.bodyGroup.add(this.abdomen);
            // Glowing lava cracks on the abdomen.
            for (let i = 0; i < 6; i++) { const crack = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), ember); const a = this.idRand() * Math.PI * 2, e = this.idRand() * Math.PI; crack.position.set(Math.sin(e) * Math.cos(a) * 0.48, 0.75 + Math.cos(e) * 0.4, -0.35 + Math.sin(e) * Math.sin(a) * 0.5); this.bodyGroup.add(crack); }
            this.head = new THREE.Group();
            for (let i = 0; i < 4; i++) this._eye(this.head, -0.12 + (i % 2) * 0.24, 0.02 + Math.floor(i / 2) * 0.1, 0.28, 0.05, p.accent);
            this.head.position.set(0, 0.72, 0.35); this.bodyGroup.add(this.head);
            this.fangs = new THREE.Group();
            for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 5), this._mat(0x1a0a06, 1, 0.4)); f.position.set(s * 0.08, 0.58, 0.6); f.rotation.x = 2.6; this.fangs.add(f); }
            this.bodyGroup.add(this.fangs);
            this.spinnerets = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.2, 6), ember); this.spinnerets.position.set(0, 0.7, -0.85); this.spinnerets.rotation.x = -1.6; this.bodyGroup.add(this.spinnerets);
            this.legs = {};
            const legDefs = [['LEFT_LEG', -1, 0.45, 0.4], ['RIGHT_LEG', 1, 0.45, 0.4], ['MID_LEFT_LEG', -1, 0.15, 0.55], ['MID_RIGHT_LEG', 1, 0.15, 0.55], ['MID_REAR_LEFT_LEG', -1, -0.15, 0.55], ['MID_REAR_RIGHT_LEG', 1, -0.15, 0.55], ['REAR_LEFT_LEG', -1, -0.45, 0.4], ['REAR_RIGHT_LEG', 1, -0.45, 0.4]];
            // z is the leg's front-to-back position along the body; _spiderLeg uses
            // it as the group's world z directly, so pass it raw (the body spans
            // z -0.95..0.69). Adding 0.7 shoved every leg out in front of the body.
            legDefs.forEach(([key, side, z, spread]) => { this.legs[key] = this._spiderLeg(side, z, spread, char); });
            this._partMeshMap = { HEAD: this.head, CEPHALOTHORAX: this.cephalothorax, ABDOMEN: this.abdomen, FANGS: this.fangs, SPINNERETS: this.spinnerets, ...this.legs };
            this._cascadeRules = [
                { gone: ['CEPHALOTHORAX'], hide: [this.cephalothorax, this.abdomen, this.head, this.fangs, this.spinnerets, ...(this._legsArr || (this._legsArr = Object.values(this.legs)))] },
                { gone: ['HEAD'], hide: [this.head] }, { gone: ['ABDOMEN'], hide: [this.abdomen, this.spinnerets] }, { gone: ['FANGS'], hide: [this.fangs] }, { gone: ['SPINNERETS'], hide: [this.spinnerets] },
                ...legDefs.map(([k]) => ({ gone: [k], hide: [this.legs[k]] })),
            ];
        }

        // ── Hellhound: a fiery quadruped with a spiked collar ────────────────
        // Source archetype Hellhound: HEAD/COLLAR/BODY/LEFT_LEG/RIGHT_LEG/HIND_LEFT_LEG/HIND_RIGHT_LEG.
        _buildHellhound() {
            const p = this.profile;
            const hide = this._skinMat(p.bodyColor, 0.7);
            const fire = this._mat(p.accent, 0.9, 0.3, p.accent);
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.46, 14, 12), hide); this.body.scale.set(1.0, 0.9, 1.5); this.body.position.set(0, 0.8, 0); this.bodyGroup.add(this.body);
            // Flaming dorsal mane.
            for (let i = 0; i < 6; i++) { const fl = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.28, 5), fire); fl.position.set(0, 1.15, 0.5 - i * 0.2); fl.rotation.x = -0.2; this.bodyGroup.add(fl); }
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12), hide); h.scale.set(0.9, 0.9, 1.1); this.head.add(h);
            const snout = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.32, 7), hide); snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.06, 0.3); this.head.add(snout);
            const maw = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), fire); maw.position.set(0, -0.08, 0.42); this.head.add(maw);
            this._eye(this.head, -0.12, 0.08, 0.22, 0.06, p.accent); this._eye(this.head, 0.12, 0.08, 0.22, 0.06, p.accent);
            for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 4), hide); ear.position.set(s * 0.16, 0.24, -0.02); ear.rotation.z = s * 0.3; this.head.add(ear); }
            this.head.position.set(0, 1.05, 0.7); this.bodyGroup.add(this.head);
            // COLLAR: spiked iron collar at the neck.
            this.collar = new THREE.Group();
            const band = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 8, 14), this._mat(0x222226, 0.4, 0.6)); band.rotation.x = 0.4; this.collar.add(band);
            for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const sp = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.14, 4), this._mat(0x33333a, 0.4, 0.6)); sp.position.set(Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2); sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.cos(a), 0, Math.sin(a))); this.collar.add(sp); }
            this.collar.position.set(0, 0.95, 0.4); this.bodyGroup.add(this.collar);
            this.frontLeft = this._beastLeg(-0.24, 0.42, hide); this.frontRight = this._beastLeg(0.24, 0.42, hide);
            this.hindLeft = this._beastLeg(-0.24, -0.42, hide); this.hindRight = this._beastLeg(0.24, -0.42, hide);
            this._partMeshMap = { HEAD: this.head, COLLAR: this.collar, BODY: this.body, LEFT_LEG: this.frontLeft, RIGHT_LEG: this.frontRight, HIND_LEFT_LEG: this.hindLeft, HIND_RIGHT_LEG: this.hindRight };
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.body, this.head, this.collar, this.frontLeft, this.frontRight, this.hindLeft, this.hindRight] },
                { gone: ['HEAD'], hide: [this.head] }, { gone: ['COLLAR'], hide: [this.collar] },
                { gone: ['LEFT_LEG'], hide: [this.frontLeft] }, { gone: ['RIGHT_LEG'], hide: [this.frontRight] },
                { gone: ['HIND_LEFT_LEG'], hide: [this.hindLeft] }, { gone: ['HIND_RIGHT_LEG'], hide: [this.hindRight] },
            ];
        }

        // ── Cloud Giant: a billowing storm humanoid with lightning limbs ─────
        // Source archetype StormElemental: CORE/BODY/LEFT_RAIN_ARM/RIGHT_RAIN_ARM/LEFT_THUNDER_LEG/RIGHT_THUNDER_LEG.
        _buildCloudGiant() {
            const p = this.profile;
            const cloud = this._skinMat(p.bodyColor, 0.9); cloud.transparent = true; cloud.opacity = 0.85;
            // BODY: a billowing cloud torso of fused puffs.
            this.body = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 12), cloud); torso.scale.set(1.1, 1.2, 1.0); this.body.add(torso);
            for (let i = 0; i < 6; i++) { const puff = new THREE.Mesh(new THREE.SphereGeometry(0.3 + this.idRand() * 0.12, 10, 8), cloud); const a = this.idRand() * Math.PI * 2; puff.position.set(Math.cos(a) * 0.45, this.idRand() * 0.7 - 0.1, Math.sin(a) * 0.4); this.body.add(puff); }
            this.body.position.set(0, 1.5, 0); this.bodyGroup.add(this.body);
            // Head puff with glaring eyes.
            this.head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 12), cloud); this.head.position.set(0, 2.2, 0); this.bodyGroup.add(this.head);
            this._eye(this.head, -0.13, 0.02, 0.28, 0.07, p.accent); this._eye(this.head, 0.13, 0.02, 0.28, 0.07, p.accent);
            // CORE: a charged storm nucleus.
            this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 0), this._mat(p.accent, 0.9, 0.2, p.accent)); this.core.position.set(0, 1.5, 0.1); this.bodyGroup.add(this.core);
            // Rain arms + thunder legs as jagged lightning bolts.
            this.leftArm = this._boltLimb(-0.6, 1.6, p.accent, cloud); this.rightArm = this._boltLimb(0.6, 1.6, p.accent, cloud);
            this.leftLeg = this._boltLimb(-0.25, 0.95, p.accent, cloud); this.rightLeg = this._boltLimb(0.25, 0.95, p.accent, cloud);
            this._partMeshMap = { CORE: this.core, BODY: this.body, LEFT_RAIN_ARM: this.leftArm, RIGHT_RAIN_ARM: this.rightArm, LEFT_THUNDER_LEG: this.leftLeg, RIGHT_THUNDER_LEG: this.rightLeg };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.body, this.head, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg] },
                { gone: ['BODY'], hide: [this.body, this.head] },
                { gone: ['LEFT_RAIN_ARM'], hide: [this.leftArm] }, { gone: ['RIGHT_RAIN_ARM'], hide: [this.rightArm] },
                { gone: ['LEFT_THUNDER_LEG'], hide: [this.leftLeg] }, { gone: ['RIGHT_THUNDER_LEG'], hide: [this.rightLeg] },
            ];
        }
        _boltLimb(x, y, accent, cloudMat) {
            const g = new THREE.Group(); let py = 0, px = 0;
            for (let k = 0; k < 4; k++) { const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.24, 4), this._mat(accent, 0.9, 0.2, accent)); seg.position.set(px, py, 0); seg.rotation.z = (k % 2 ? 0.5 : -0.5); g.add(seg); py -= 0.22; px += (k % 2 ? 0.1 : -0.1); }
            g.position.set(x, y, 0); this.bodyGroup.add(g); return g;
        }

        // ── Combat Drone: an autonomous armed quadrotor ──────────────────────
        // Source archetype Drone: SENSOR_ARRAY/CHASSIS/LEFT_PROP/RIGHT_PROP.
        _buildCombatDrone() {
            const p = this.profile;
            const metal = this._skinMat(p.bodyColor, 0.4);
            // CHASSIS: armoured central body.
            this.chassis = new THREE.Group();
            const core = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 0.5), metal); this.chassis.add(core);
            const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.4, 8), this._mat(0x222226, 0.4, 0.6)); gun.rotation.x = Math.PI / 2; gun.position.set(0, -0.1, 0.32); this.chassis.add(gun); this.chassis._gun = gun;
            this.chassis.position.set(0, 1.4, 0); this.bodyGroup.add(this.chassis);
            // SENSOR_ARRAY: a red optical eye on top.
            this.sensor = new THREE.Group();
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10, 0, Math.PI * 2, 0, Math.PI / 1.6), metal); this.sensor.add(dome);
            this.sensorEye = this._eye(this.sensor, 0, 0.0, 0.14, 0.08, p.accent);
            this.sensor.position.set(0, 1.6, 0.05); this.bodyGroup.add(this.sensor);
            // LEFT_PROP / RIGHT_PROP: rotor arms with spinning blades.
            this.leftProp = this._droneRotor(-1, metal, p.accent); this.rightProp = this._droneRotor(1, metal, p.accent);
            this._partMeshMap = { SENSOR_ARRAY: this.sensor, CHASSIS: this.chassis, LEFT_PROP: this.leftProp, RIGHT_PROP: this.rightProp };
            this._cascadeRules = [
                { gone: ['CHASSIS'], hide: [this.chassis, this.sensor, this.leftProp, this.rightProp] },
                { gone: ['SENSOR_ARRAY'], hide: [this.sensor] },
                { gone: ['LEFT_PROP'], hide: [this.leftProp] }, { gone: ['RIGHT_PROP'], hide: [this.rightProp] },
            ];
        }
        _droneRotor(side, metal, accent) {
            const g = new THREE.Group();
            const arm = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.08), metal); arm.position.set(side * 0.25, 0, 0); g.add(arm);
            const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 8), metal); hub.position.set(side * 0.45, 0.06, 0); g.add(hub);
            const blades = new THREE.Group();
            for (let i = 0; i < 2; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.01, 0.05), this._mat(0x88909a, 0.3, 0.5)); b.rotation.y = i * Math.PI / 2; blades.add(b); }
            blades.position.set(side * 0.45, 0.1, 0); g.add(blades); g._blades = blades;
            const light = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), this._mat(accent, 0.9, 0.2, accent)); light.position.set(side * 0.45, -0.02, 0); g.add(light);
            g.position.set(0, 1.42, 0); this.bodyGroup.add(g); return g;
        }

        // ── Coralic Warcaster: a storm-infused coral sea turtle ──────────────
        // Source archetype Turtle: SHELL/HEAD/LEFT_LEG/RIGHT_LEG/REAR_LEFT_LEG/REAR_RIGHT_LEG/TAIL.
        _buildCoralTurtle() {
            const p = this.profile;
            const skin = this._skinMat(0x2a6a6a, 0.6);
            const shellMat = this._skinMat(p.bodyColor, 0.5);
            const coral = this._mat(p.accent, 0.8, 0.4, 0);
            this.shell = new THREE.Group();
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), shellMat); dome.scale.set(1.2, 0.85, 1.2); this.shell.add(dome);
            // Coral branches growing from the shell.
            for (let i = 0; i < 6; i++) { const a = this.idRand() * Math.PI * 2, r = this.idRand() * 0.4; const br = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 5), coral); br.position.set(Math.cos(a) * r, 0.4 + this.idRand() * 0.2, Math.sin(a) * r); br.rotation.set(this.idRand(), 0, this.idRand()); this.shell.add(br); }
            this.shell.position.set(0, 0.75, 0); this.bodyGroup.add(this.shell);
            // Storm orbs orbiting the shell.
            this.stormOrbs = new THREE.Group();
            for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; const orb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), this._mat(0xaad8ff, 0.7, 0.2, 0x88bbff)); orb.position.set(Math.cos(a) * 0.8, 1.0, Math.sin(a) * 0.8); this.stormOrbs.add(orb); }
            this.bodyGroup.add(this.stormOrbs);
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), skin); h.scale.set(0.9, 0.9, 1.2); this.head.add(h);
            this._eye(this.head, -0.1, 0.04, 0.18, 0.05, p.accent); this._eye(this.head, 0.1, 0.04, 0.18, 0.05, p.accent);
            this.head.position.set(0, 0.6, 0.66); this.bodyGroup.add(this.head);
            this.frontLeft = this._turtleLeg(-0.42, 0.32, skin); this.frontRight = this._turtleLeg(0.42, 0.32, skin);
            this.rearLeft = this._turtleLeg(-0.42, -0.32, skin); this.rearRight = this._turtleLeg(0.42, -0.32, skin);
            this.tail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 6), skin); this.tail.position.set(0, 0.5, -0.62); this.tail.rotation.x = -1.8; this.bodyGroup.add(this.tail);
            this._partMeshMap = { SHELL: this.shell, HEAD: this.head, LEFT_LEG: this.frontLeft, RIGHT_LEG: this.frontRight, REAR_LEFT_LEG: this.rearLeft, REAR_RIGHT_LEG: this.rearRight, TAIL: this.tail };
            this._cascadeRules = [
                { gone: ['SHELL'], hide: [this.shell, this.head, this.frontLeft, this.frontRight, this.rearLeft, this.rearRight, this.tail, this.stormOrbs] },
                { gone: ['HEAD'], hide: [this.head] }, { gone: ['TAIL'], hide: [this.tail] },
                { gone: ['LEFT_LEG'], hide: [this.frontLeft] }, { gone: ['RIGHT_LEG'], hide: [this.frontRight] }, { gone: ['REAR_LEFT_LEG'], hide: [this.rearLeft] }, { gone: ['REAR_RIGHT_LEG'], hide: [this.rearRight] },
            ];
        }

        // ── Corrupted Bioslave: a plant-and-flesh toxic guardian ─────────────
        // Source archetype Mutant: HEAD/MASS/EXTRA_LIMB_1/EXTRA_LIMB_2/EYE_CLUSTER/TAIL_SPIKE.
        _buildBioslave() {
            const p = this.profile;
            const flesh = this._skinMat(p.bodyColor, 0.7);
            const vineMat = this._mat(0x3a5a28, 0.85);
            const toxin = this._mat(p.accent, 0.7, 0.2, p.accent);
            this.mass = new THREE.Group();
            const main = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), flesh); main.scale.set(1.1, 1.1, 0.95); this.mass.add(main);
            // Vines wrapping the mass.
            for (let i = 0; i < 4; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55 - i * 0.06, 0.04, 6, 16), vineMat); ring.rotation.set(this.idRand() * 3, this.idRand() * 3, 0); this.mass.add(ring); }
            for (let i = 0; i < 4; i++) { const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.26, 4), vineMat); const a = this.idRand() * Math.PI * 2; leaf.position.set(Math.cos(a) * 0.5, this.idRand() * 0.4, Math.sin(a) * 0.4); this.mass.add(leaf); }
            this.mass.position.set(0, 1.0, 0); this.bodyGroup.add(this.mass);
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12), flesh); this.head.add(h);
            const maw = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), this._mat(0x2a0808, 0.9, 0.4)); maw.scale.set(1.3, 0.7, 0.6); maw.position.set(0, -0.08, 0.22); this.head.add(maw);
            // A flytrap-style frill around the head.
            for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const petal = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.24, 4), vineMat); petal.position.set(Math.cos(a) * 0.26, 0.04, Math.sin(a) * 0.26); petal.rotation.z = Math.cos(a) * 0.8; petal.rotation.x = -Math.sin(a) * 0.8; this.head.add(petal); }
            this.head.position.set(0, 1.55, 0.18); this.bodyGroup.add(this.head);
            this.eyeCluster = new THREE.Group();
            for (let i = 0; i < 4; i++) this._eye(this.eyeCluster, this.idRand() * 0.3 - 0.15, this.idRand() * 0.3 - 0.15, 0.2, 0.05 + this.idRand() * 0.03, p.accent);
            this.eyeCluster.position.set(0.3, 1.3, 0.25); this.bodyGroup.add(this.eyeCluster);
            this.extra1 = this._mutantTentacle(-1, vineMat); this.extra2 = this._mutantTentacle(1, vineMat);
            // TAIL_SPIKE: a thorned vine tail.
            this.tailSpike = new THREE.Group();
            const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.03, 0.5, 6), vineMat); stalk.position.set(0, 0, 0); stalk.rotation.x = 1.0; this.tailSpike.add(stalk);
            const thorn = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.26, 5), toxin); thorn.position.set(0, -0.2, -0.3); thorn.rotation.x = 2.2; this.tailSpike.add(thorn);
            this.tailSpike.position.set(0.2, 0.7, -0.4); this.bodyGroup.add(this.tailSpike);
            this._partMeshMap = { HEAD: this.head, MASS: this.mass, EXTRA_LIMB_1: this.extra1, EXTRA_LIMB_2: this.extra2, EYE_CLUSTER: this.eyeCluster, TAIL_SPIKE: this.tailSpike };
            this._cascadeRules = [
                { gone: ['MASS'], hide: [this.mass, this.head, this.extra1, this.extra2, this.eyeCluster, this.tailSpike] },
                { gone: ['HEAD'], hide: [this.head] }, { gone: ['EYE_CLUSTER'], hide: [this.eyeCluster] },
                { gone: ['EXTRA_LIMB_1'], hide: [this.extra1] }, { gone: ['EXTRA_LIMB_2'], hide: [this.extra2] }, { gone: ['TAIL_SPIKE'], hide: [this.tailSpike] },
            ];
        }

        // ── Fire Elemental: a living flame humanoid ──────────────────────────
        // Source archetype FireElemental: CORE/BODY/EMBER_ARMS/ASH_LEGS.
        _buildFireElemental() {
            const p = this.profile;
            const fire = this._skinMat(p.bodyColor, 0.2); fire.transparent = true; fire.opacity = 0.72; fire.emissive = new THREE.Color(p.accent); fire.emissiveIntensity = 0.6;
            this.body = new THREE.Group();
            for (let i = 0; i < 5; i++) { const fl = new THREE.Mesh(new THREE.ConeGeometry(0.36 - i * 0.05, 0.7, 8), fire); fl.position.y = 1.0 + i * 0.22; fl.rotation.y = i * 0.5; this.body.add(fl); }
            this.bodyGroup.add(this.body);
            this.core = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), this._mat(0xffffaa, 0.9, 0.1, p.accent)); this.core.position.set(0, 1.3, 0); this.bodyGroup.add(this.core);
            this._eye(this.bodyGroup, -0.12, 1.5, 0.26, 0.06, 0x331100); this._eye(this.bodyGroup, 0.12, 1.5, 0.26, 0.06, 0x331100);
            this.arms = new THREE.Group();
            [-1, 1].forEach(s => { const g = new THREE.Group(); for (let k = 0; k < 3; k++) { const fl = new THREE.Mesh(new THREE.ConeGeometry(0.1 - k * 0.02, 0.3, 6), fire); fl.position.set(s * (0.3 + k * 0.12), 1.4 - k * 0.1, 0); fl.rotation.z = -s * 0.6; g.add(fl); } g._side = s; this.arms.add(g); });
            this.bodyGroup.add(this.arms);
            this.legs = new THREE.Group();
            [-0.18, 0.18].forEach(x => { const ash = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.5, 6), this._mat(0x2a1a14, 0.9, 0.3)); ash.position.set(x, 0.4, 0); this.legs.add(ash); });
            this.bodyGroup.add(this.legs);
            this._partMeshMap = { CORE: this.core, BODY: this.body, EMBER_ARMS: this.arms, ASH_LEGS: this.legs };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.body, this.arms, this.legs] },
                { gone: ['BODY'], hide: [this.body, this.arms] }, { gone: ['EMBER_ARMS'], hide: [this.arms] }, { gone: ['ASH_LEGS'], hide: [this.legs] },
            ];
        }

        // ── Centipede: a long burning multi-segmented insectoid ──────────────
        // Source archetype Insectoid (mapped onto a segmented centipede body).
        _buildCentipede() {
            const p = this.profile;
            const chitin = this._skinMat(p.bodyColor, 0.5);
            const ember = this._mat(p.accent, 0.9, 0.3, p.accent);
            this.thorax = new THREE.Group(); this.abdomen = new THREE.Group();
            const N = 10;
            for (let i = 0; i < N; i++) {
                const seg = new THREE.Mesh(new THREE.SphereGeometry(0.2 - i * 0.008, 10, 8), chitin);
                seg.position.set((i - N / 2) * 0.26, 0.6 + Math.sin((i / (N - 1)) * Math.PI) * 0.3, 0);
                const grp = i < N / 2 ? this.thorax : this.abdomen; grp.add(seg);
                if (i % 2 === 0) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), ember); e.position.copy(seg.position); e.position.y += 0.16; grp.add(e); }
                for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.012, 0.34, 4), chitin); leg.position.set(seg.position.x, seg.position.y - 0.2, s * 0.12); leg.rotation.x = s * 0.4; grp.add(leg); }
            }
            this.bodyGroup.add(this.thorax); this.bodyGroup.add(this.abdomen);
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), chitin); this.head.add(h);
            this._eye(this.head, -0.1, 0.04, 0.16, 0.05, p.accent); this._eye(this.head, 0.1, 0.04, 0.16, 0.05, p.accent);
            this.head.position.set(-N / 2 * 0.26 - 0.05, 0.6, 0); this.bodyGroup.add(this.head);
            this.mandibles = new THREE.Group();
            for (const s of [-1, 1]) { const md = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 4), this._mat(0x1a0a06, 1, 0.4)); md.position.set(-N / 2 * 0.26 - 0.15, 0.6, s * 0.1); md.rotation.z = Math.PI / 2; md.rotation.x = s * 0.3; this.mandibles.add(md); }
            this.bodyGroup.add(this.mandibles);
            this._partMeshMap = { HEAD: this.head, THORAX: this.thorax, ABDOMEN: this.abdomen, MANDIBLES: this.mandibles, LEFT_LEG: this.thorax, RIGHT_LEG: this.thorax, MIDDLE_LEFT_LEG: this.abdomen, MIDDLE_RIGHT_LEG: this.abdomen, REAR_LEFT_LEG: this.abdomen, REAR_RIGHT_LEG: this.abdomen };
            this._cascadeRules = [
                { gone: ['THORAX'], hide: [this.thorax, this.head, this.mandibles] }, { gone: ['ABDOMEN'], hide: [this.abdomen] },
                { gone: ['HEAD'], hide: [this.head, this.mandibles] }, { gone: ['MANDIBLES'], hide: [this.mandibles] },
            ];
        }

        // ── Scarab: an armoured beetle with an icy crystalline carapace ──────
        // Source archetype Insectoid: HEAD/THORAX/ABDOMEN/6 legs/MANDIBLES.
        _buildScarab() {
            const p = this.profile;
            const chitin = this._skinMat(p.bodyColor, 0.3);
            const ice = this._mat(p.accent, 0.6, 0.2, p.accent);
            this.thorax = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), chitin); this.thorax.position.set(0, 0.7, 0.2); this.bodyGroup.add(this.thorax);
            this.abdomen = new THREE.Group();
            const shell = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 12, 0, Math.PI * 2, 0, Math.PI / 2), chitin); shell.scale.set(1.2, 0.9, 1.4); this.abdomen.add(shell);
            const seam = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.9), this._mat(0x111111, 0.5)); seam.position.y = 0.45; this.abdomen.add(seam);
            for (let i = 0; i < 5; i++) { const fac = new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), ice); const a = this.idRand() * Math.PI * 2; fac.position.set(Math.cos(a) * 0.3, 0.4 + this.idRand() * 0.2, -0.2 + Math.sin(a) * 0.3); this.abdomen.add(fac); }
            this.abdomen.position.set(0, 0.7, -0.3); this.bodyGroup.add(this.abdomen);
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), chitin); this.head.add(h);
            this._eye(this.head, -0.1, 0.04, 0.14, 0.05, p.accent); this._eye(this.head, 0.1, 0.04, 0.14, 0.05, p.accent);
            const hornb = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.24, 5), chitin); hornb.position.set(0, 0.1, 0.18); hornb.rotation.x = -0.6; this.head.add(hornb);
            this.head.position.set(0, 0.72, 0.5); this.bodyGroup.add(this.head);
            this.mandibles = new THREE.Group();
            for (const s of [-1, 1]) { const md = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 4), this._mat(0x1a1a22, 1, 0.4)); md.position.set(s * 0.06, 0.66, 0.66); md.rotation.x = 1.3; this.mandibles.add(md); }
            this.bodyGroup.add(this.mandibles);
            this.legs = {};
            const defs = [['LEFT_LEG', -1, 0.3], ['RIGHT_LEG', 1, 0.3], ['MIDDLE_LEFT_LEG', -1, 0.05], ['MIDDLE_RIGHT_LEG', 1, 0.05], ['REAR_LEFT_LEG', -1, -0.2], ['REAR_RIGHT_LEG', 1, -0.2]];
            defs.forEach(([k, s, z]) => { const g = new THREE.Group(); const u = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.018, 0.36, 5), chitin); u.position.set(s * 0.18, -0.05, 0); u.rotation.z = s * 1.0; g.add(u); g.position.set(s * 0.3, 0.6, z); g._side = s; this.bodyGroup.add(g); this.legs[k] = g; });
            this._partMeshMap = { HEAD: this.head, THORAX: this.thorax, ABDOMEN: this.abdomen, MANDIBLES: this.mandibles, ...this.legs };
            this._cascadeRules = [
                { gone: ['THORAX'], hide: [this.thorax, this.abdomen, this.head, this.mandibles, ...(this._legsArr || (this._legsArr = Object.values(this.legs)))] },
                { gone: ['HEAD'], hide: [this.head, this.mandibles] }, { gone: ['ABDOMEN'], hide: [this.abdomen] }, { gone: ['MANDIBLES'], hide: [this.mandibles] },
                ...defs.map(([k]) => ({ gone: [k], hide: [this.legs[k]] })),
            ];
        }

        // ── Frost Slime: a chilling gelatinous mass ──────────────────────────
        // Source archetype Slime: CORE/UPPER_BODY/LOWER_BODY/PSEUDOPOD_1/PSEUDOPOD_2.
        _buildFrostSlime() {
            const p = this.profile;
            const goo = this._skinMat(p.bodyColor, 0.2); goo.transparent = true; goo.opacity = 0.75; goo.emissive = new THREE.Color(0x2a5a7a); goo.emissiveIntensity = 0.2;
            this.lower = new THREE.Mesh(new THREE.SphereGeometry(0.6, 14, 12), goo); this.lower.scale.set(1.2, 0.7, 1.1); this.lower.position.set(0, 0.5, 0); this.bodyGroup.add(this.lower);
            this.upper = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 12), goo); this.upper.scale.set(1.0, 0.9, 1.0); this.upper.position.set(0, 0.95, 0); this.bodyGroup.add(this.upper);
            for (let i = 0; i < 5; i++) { const sh = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.24, 4), this._mat(p.accent, 0.7, 0.2, p.accent)); const a = this.idRand() * Math.PI * 2; sh.position.set(Math.cos(a) * 0.3, 1.2, Math.sin(a) * 0.3); this.bodyGroup.add(sh); }
            this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), this._mat(p.accent, 0.9, 0.1, p.accent)); this.core.position.set(0, 0.7, 0); this.bodyGroup.add(this.core);
            // Eyes embedded just under the upper-blob surface (parented to it so
            // they track the blob and never float outside the translucent goo).
            this._eye(this.upper, -0.14, 0.05, 0.3, 0.06, 0x113344); this._eye(this.upper, 0.14, 0.05, 0.3, 0.06, 0x113344);
            this.pseudo1 = this._slimePod(-1, goo); this.pseudo2 = this._slimePod(1, goo);
            this._partMeshMap = { CORE: this.core, UPPER_BODY: this.upper, LOWER_BODY: this.lower, PSEUDOPOD_1: this.pseudo1, PSEUDOPOD_2: this.pseudo2 };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.upper, this.lower, this.pseudo1, this.pseudo2] },
                { gone: ['UPPER_BODY'], hide: [this.upper] }, { gone: ['LOWER_BODY'], hide: [this.lower, this.pseudo1, this.pseudo2] },
                { gone: ['PSEUDOPOD_1'], hide: [this.pseudo1] }, { gone: ['PSEUDOPOD_2'], hide: [this.pseudo2] },
            ];
        }
        _slimePod(side, mat) {
            const g = new THREE.Group();
            for (let k = 0; k < 3; k++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.14 - k * 0.03, 8, 8), mat); seg.position.set(side * 0.06 * k, -k * 0.02, 0); g.add(seg); }
            g.position.set(side * 0.55, 0.5, 0.1); g._side = side; this.bodyGroup.add(g); return g;
        }

        // ── Gatorghast Horror: a ghostly swamp leviathan-gator ───────────────
        // Source archetype AbyssalLeviathan: EYE/MAW/DORSAL_PLATES/TENTACLES/HEART_CHAMBER.
        _buildGatorghast() {
            const p = this.profile;
            const hide = this._skinMat(p.bodyColor, 0.5); hide.transparent = true; hide.opacity = 0.82; hide.emissive = new THREE.Color(0x183a28); hide.emissiveIntensity = 0.25;
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 14, 12), hide); this.body.scale.set(1.0, 0.8, 1.8); this.body.position.set(0, 1.0, 0); this.bodyGroup.add(this.body);
            this.heart = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), this._mat(p.accent, 0.9, 0.3, p.accent)); this.heart.position.set(0, 1.1, 0.5); this.body.add(this.heart);
            this.maw = new THREE.Group();
            const upper = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.7), hide); upper.position.set(0, 1.15, 1.1); this.maw.add(upper);
            const lower = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.62), hide); lower.position.set(0, 0.95, 1.05); this.maw.add(lower); this.maw._lower = lower;
            for (let i = 0; i < 6; i++) { const tth = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.12, 4), this._mat(0xe8e0d0, 1, 0.4)); tth.position.set(-0.12 + i * 0.05, 1.04, 0.85 + (i % 2) * 0.3); tth.rotation.x = Math.PI; this.maw.add(tth); }
            this.bodyGroup.add(this.maw);
            this.eye = this._eye(this.bodyGroup, 0, 1.5, 0.7, 0.18, p.accent);
            this.dorsal = new THREE.Group();
            for (let i = 0; i < 6; i++) { const pl = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.26, 4), hide); pl.position.set(0, 1.4, 0.6 - i * 0.32); pl.rotation.x = -0.2; this.dorsal.add(pl); }
            this.bodyGroup.add(this.dorsal);
            this.tentacles = new THREE.Group();
            for (const s of [-1, 1]) { const g = new THREE.Group(); let py = 0; for (let k = 0; k < 5; k++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.1 - k * 0.016, 8, 8), hide); seg.position.set(0, py, 0); py -= 0.2; g.add(seg); } g.position.set(s * 0.3, 0.9, -1.2); g._side = s; this.tentacles.add(g); }
            this.bodyGroup.add(this.tentacles);
            for (const sx of [-1, 1]) for (const sz of [0.5, -0.5]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.4, 6), hide); leg.position.set(sx * 0.45, 0.55, sz); this.bodyGroup.add(leg); }
            this._partMeshMap = { EYE: this.eye, MAW: this.maw, DORSAL_PLATES: this.dorsal, TENTACLES: this.tentacles, HEART_CHAMBER: this.body };
            this._cascadeRules = [
                { gone: ['HEART_CHAMBER'], hide: [this.body, this.maw, this.eye, this.dorsal, this.tentacles] },
                { gone: ['EYE'], hide: [this.eye] }, { gone: ['MAW'], hide: [this.maw] }, { gone: ['DORSAL_PLATES'], hide: [this.dorsal] }, { gone: ['TENTACLES'], hide: [this.tentacles] },
            ];
        }

        // ── Giant Slithering Snail: a lumbering acid-trailing snail ──────────
        // Source archetype Beast (mapped onto a shelled gastropod).
        _buildSnail() {
            const p = this.profile;
            const flesh = this._skinMat(p.bodyColor, 0.6);
            const shellMat = this._skinMat(0x8a6a4a, 0.5);
            this.foot = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), flesh); this.foot.scale.set(1.0, 0.55, 2.1); this.foot.position.set(0, 0.35, 0); this.bodyGroup.add(this.foot);
            this.body = new THREE.Group();
            const shell = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 14), shellMat); this.body.add(shell);
            const spiral = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.12, 8, 20), shellMat); spiral.rotation.y = Math.PI / 2; this.body.add(spiral);
            this.body.position.set(0, 0.85, -0.3); this.bodyGroup.add(this.body);
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), flesh); h.scale.set(0.9, 0.9, 1.3); this.head.add(h);
            for (const s of [-1, 1]) { const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.3, 5), flesh); stalk.position.set(s * 0.1, 0.2, 0.05); this.head.add(stalk); this._eye(this.head, s * 0.1, 0.36, 0.05, 0.06, p.accent); }
            this.head.position.set(0, 0.5, 0.75); this.bodyGroup.add(this.head);
            // Foot-pad ripples (the leg keys) + acid trail (tail).
            this.frontLeft = this._snailPad(-0.16, 0.55, flesh); this.frontRight = this._snailPad(0.16, 0.55, flesh);
            this.rearLeft = this._snailPad(-0.16, -0.2, flesh); this.rearRight = this._snailPad(0.16, -0.2, flesh);
            this.tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 8), this._mat(p.accent, 0.5, 0.2, p.accent)); this.tail.position.set(0, 0.18, -0.9); this.tail.rotation.x = Math.PI / 2; this.bodyGroup.add(this.tail);
            this._partMeshMap = { HEAD: this.head, BODY: this.body, LEFT_LEG: this.frontLeft, RIGHT_LEG: this.frontRight, REAR_LEFT_LEG: this.rearLeft, REAR_RIGHT_LEG: this.rearRight, TAIL: this.tail };
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.body, this.head, this.foot, this.frontLeft, this.frontRight, this.rearLeft, this.rearRight, this.tail] },
                { gone: ['HEAD'], hide: [this.head] }, { gone: ['TAIL'], hide: [this.tail] },
                { gone: ['LEFT_LEG'], hide: [this.frontLeft] }, { gone: ['RIGHT_LEG'], hide: [this.frontRight] }, { gone: ['REAR_LEFT_LEG'], hide: [this.rearLeft] }, { gone: ['REAR_RIGHT_LEG'], hide: [this.rearRight] },
            ];
        }
        _snailPad(x, z, mat) { const g = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mat); g.scale.set(1, 0.4, 1.2); g.position.set(x, 0.12, z); this.bodyGroup.add(g); return g; }

        // ── Segment Worm: a titanic burrowing worm (gloomwurm / maggotus) ────
        // Source archetype SegmentWorm: HEAD/HEART_SEGMENT/BODY_SEGMENT/TAIL.
        _buildSegmentWorm() {
            const p = this.profile;
            const flesh = this._skinMat(p.bodyColor, 0.6);
            this.bodySeg = new THREE.Group(); this.tail = new THREE.Group();
            const N = 9, mid = Math.floor(N / 2);
            for (let i = 0; i < N; i++) {
                const r = 0.26 - i * 0.012; const theta = (i / (N - 1)) * Math.PI;
                const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), flesh); seg.position.set((i - N / 2) * 0.3, 0.5 + Math.sin(theta) * 0.5, 0);
                if (i === mid) { this.heartSeg = new THREE.Mesh(new THREE.SphereGeometry(r + 0.05, 10, 8), this._mat(p.accent, 0.85, 0.3, p.accent)); this.heartSeg.position.copy(seg.position); this.bodyGroup.add(this.heartSeg); }
                else if (i > N - 3) this.tail.add(seg); else this.bodySeg.add(seg);
            }
            this.bodyGroup.add(this.bodySeg); this.bodyGroup.add(this.tail);
            this.head = new THREE.Group();
            const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.06, 8, 14), flesh); ring.rotation.y = Math.PI / 2; this.head.add(ring);
            for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 4), this._mat(0xe8e0d0, 1, 0.4)); tooth.position.set(0, Math.cos(a) * 0.18, Math.sin(a) * 0.18); tooth.rotation.z = Math.PI / 2; this.head.add(tooth); }
            this.head.position.set(-N / 2 * 0.3 - 0.1, 0.5, 0); this.bodyGroup.add(this.head);
            if (p.spores) { for (let i = 0; i < 8; i++) { const sp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), this._mat(p.accent, 0.6, 0.2, p.accent)); sp.position.set((this.idRand() - 0.5) * 2, 1.0 + this.idRand() * 0.5, (this.idRand() - 0.5) * 0.4); this.bodyGroup.add(sp); } }
            this._partMeshMap = { HEAD: this.head, HEART_SEGMENT: this.heartSeg, BODY_SEGMENT: this.bodySeg, TAIL: this.tail };
            this._cascadeRules = [
                { gone: ['HEART_SEGMENT'], hide: [this.heartSeg, this.bodySeg, this.head, this.tail] },
                { gone: ['BODY_SEGMENT'], hide: [this.bodySeg] }, { gone: ['HEAD'], hide: [this.head] }, { gone: ['TAIL'], hide: [this.tail] },
            ];
        }

        // ── Harpy Banshee: a winged screaming ghost ──────────────────────────
        // Source archetype Ghost: FACE/CORE/LEFT_WISP/RIGHT_WISP.
        _buildHarpyBanshee() {
            const p = this.profile;
            const ghost = this._skinMat(p.bodyColor, 0.4); ghost.transparent = true; ghost.opacity = 0.6; ghost.emissive = new THREE.Color(p.accent); ghost.emissiveIntensity = 0.3; ghost.side = THREE.DoubleSide;
            this.core = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.3, 10, 1, true), ghost); torso.position.y = 0.9; this.core.add(torso); this.bodyGroup.add(this.core);
            this.face = new THREE.Group();
            const f = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), this._mat(0xcfc8e0, 0.7, 0.3)); f.scale.set(0.9, 1.1, 0.8); this.face.add(f);
            this._eye(this.face, -0.09, 0.05, 0.16, 0.05, p.accent); this._eye(this.face, 0.09, 0.05, 0.16, 0.05, p.accent);
            const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), this._mat(0x1a0a22, 0.7, 0.3)); mouth.scale.set(0.7, 1.6, 0.5); mouth.position.set(0, -0.12, 0.16); this.face.add(mouth);
            this.face.position.set(0, 1.7, 0.1); this.bodyGroup.add(this.face);
            this.wings = new THREE.Group();
            for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.CircleGeometry(0.6, 10, 0, Math.PI), ghost); w.position.set(s * 0.4, 1.4, -0.2); w.rotation.z = s * 1.0; w.rotation.y = s * 0.4; this.wings.add(w); }
            this.bodyGroup.add(this.wings);
            this.leftWisp = this._phantomWisp(-1, ghost); this.rightWisp = this._phantomWisp(1, ghost);
            this._partMeshMap = { FACE: this.face, CORE: this.core, LEFT_WISP: this.leftWisp, RIGHT_WISP: this.rightWisp };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.face, this.wings, this.leftWisp, this.rightWisp] },
                { gone: ['FACE'], hide: [this.face] }, { gone: ['LEFT_WISP'], hide: [this.leftWisp] }, { gone: ['RIGHT_WISP'], hide: [this.rightWisp] },
            ];
        }

        // ── Hellthorn Dryad: a thorny tree-woman with flaming flowers ────────
        // Source archetype Tree: CROWN/TRUNK/ROOTS/BRANCH_1/BRANCH_2.
        _buildDryad() {
            const p = this.profile;
            const wood = this._skinMat(p.bodyColor, 0.9);
            const flame = this._mat(0xff5522, 0.9, 0.3, 0xff5522);
            const sap = this._mat(p.accent, 0.7, 0.3, p.accent);
            this.trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.5, 1.6, 9), wood); this.trunk.position.set(0, 1.0, 0); this.bodyGroup.add(this.trunk);
            this._eye(this.trunk, -0.14, 0.3, 0.34, 0.07, p.accent); this._eye(this.trunk, 0.14, 0.3, 0.34, 0.07, p.accent);
            this.crown = new THREE.Group();
            for (let i = 0; i < 8; i++) { const a = this.idRand() * Math.PI * 2, r = this.idRand() * 0.45; const flower = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), flame); flower.position.set(Math.cos(a) * r, 2.2 + this.idRand() * 0.4, Math.sin(a) * r); this.crown.add(flower); }
            this.bodyGroup.add(this.crown);
            this.branch1 = this._thornVine(-1, wood, sap); this.branch2 = this._thornVine(1, wood, sap);
            this.roots = new THREE.Group();
            for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const r = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.1, 0.5, 5), wood); r.position.set(Math.cos(a) * 0.3, 0.2, Math.sin(a) * 0.3); r.rotation.z = Math.cos(a) * 0.7; r.rotation.x = -Math.sin(a) * 0.7; this.roots.add(r); }
            this.bodyGroup.add(this.roots);
            this._partMeshMap = { CROWN: this.crown, TRUNK: this.trunk, ROOTS: this.roots, BRANCH_1: this.branch1, BRANCH_2: this.branch2 };
            this._cascadeRules = [
                { gone: ['TRUNK'], hide: [this.trunk, this.crown, this.roots, this.branch1, this.branch2] },
                { gone: ['CROWN'], hide: [this.crown] }, { gone: ['ROOTS'], hide: [this.roots] },
                { gone: ['BRANCH_1'], hide: [this.branch1] }, { gone: ['BRANCH_2'], hide: [this.branch2] },
            ];
        }
        _thornVine(side, wood, sap) {
            const g = new THREE.Group(); let py = 0;
            for (let k = 0; k < 4; k++) { const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.06 - k * 0.01, 0.07 - k * 0.01, 0.3, 6), wood); seg.position.set(side * 0.04 * k, py, 0); seg.rotation.z = -side * 0.2; g.add(seg); const thorn = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 4), wood); thorn.position.set(side * 0.04 * k, py, 0.08); thorn.rotation.x = 1.2; g.add(thorn); py -= 0.28; }
            const drip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), sap); drip.position.set(side * 0.16, py + 0.1, 0); drip.scale.y = 1.5; g.add(drip);
            g.position.set(side * 0.45, 1.5, 0.05); g._side = side; this.bodyGroup.add(g); return g;
        }

        // ── Hivemind Termite: a colony fused into a humanoid mass ────────────
        // Source archetype Insectoid: HEAD/THORAX/ABDOMEN/6 legs/MANDIBLES.
        _buildTermite() {
            const p = this.profile;
            const chitin = this._skinMat(p.bodyColor, 0.6);
            this.thorax = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 1.0, 9), chitin); torso.position.y = 1.0; this.thorax.add(torso);
            this._termites = [];
            for (let i = 0; i < 20; i++) { const tm = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.1, 3, 6), chitin); const a = this.idRand() * Math.PI * 2, e = this.idRand() * Math.PI, r = 0.32 + this.idRand() * 0.1; tm.position.set(Math.sin(e) * Math.cos(a) * r, 1.0 + Math.cos(e) * 0.5, Math.sin(e) * Math.sin(a) * r); tm.rotation.set(this.idRand() * 3, this.idRand() * 3, this.idRand() * 3); this.thorax.add(tm); this._termites.push(tm); }
            this.bodyGroup.add(this.thorax);
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12), chitin); this.head.add(h);
            this._eye(this.head, -0.1, 0.04, 0.2, 0.05, p.accent); this._eye(this.head, 0.1, 0.04, 0.2, 0.05, p.accent);
            this.head.position.set(0, 1.75, 0); this.bodyGroup.add(this.head);
            this.mandibles = new THREE.Group();
            for (const s of [-1, 1]) { const md = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 4), this._mat(0xe8d8a0, 1, 0.4)); md.position.set(s * 0.08, 1.66, 0.18); md.rotation.x = 1.4; md.rotation.z = -s * 0.4; this.mandibles.add(md); }
            this.bodyGroup.add(this.mandibles);
            this.abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), chitin); this.abdomen.scale.set(1.1, 0.8, 1.0); this.abdomen.position.set(0, 0.45, 0); this.bodyGroup.add(this.abdomen);
            this.legs = {};
            const defs = [['LEFT_LEG', -1, 1.3], ['RIGHT_LEG', 1, 1.3], ['MIDDLE_LEFT_LEG', -1, 0.9], ['MIDDLE_RIGHT_LEG', 1, 0.9], ['REAR_LEFT_LEG', -1, 0.5], ['REAR_RIGHT_LEG', 1, 0.5]];
            defs.forEach(([k, s, y]) => { const g = new THREE.Group(); const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.4, 6), chitin); arm.position.set(s * 0.3, 0, 0); arm.rotation.z = s * 0.8; g.add(arm); g.position.set(s * 0.15, y, 0.1); g._side = s; this.bodyGroup.add(g); this.legs[k] = g; });
            this._partMeshMap = { HEAD: this.head, THORAX: this.thorax, ABDOMEN: this.abdomen, MANDIBLES: this.mandibles, ...this.legs };
            this._cascadeRules = [
                { gone: ['THORAX'], hide: [this.thorax, this.head, this.abdomen, this.mandibles, ...(this._legsArr || (this._legsArr = Object.values(this.legs)))] },
                { gone: ['HEAD'], hide: [this.head, this.mandibles] }, { gone: ['ABDOMEN'], hide: [this.abdomen] }, { gone: ['MANDIBLES'], hide: [this.mandibles] },
                ...defs.map(([k]) => ({ gone: [k], hide: [this.legs[k]] })),
            ];
        }

        // ── Hydrokinetic Engine: a water-control machine with jet arms ───────
        // Source archetype Robot: HEAD/CORE/LEFT_ARM/RIGHT_ARM/LEFT_LEG/RIGHT_LEG.
        _buildHydroEngine() {
            const p = this.profile;
            const metal = this._skinMat(p.bodyColor, 0.4);
            const water = this._mat(p.accent, 0.5, 0.2, p.accent);
            this.core = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.5), metal); this.core.position.set(0, 1.2, 0); this.bodyGroup.add(this.core);
            this.tank = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.5, 12), water); this.tank.position.set(0, 1.2, 0.3); this.bodyGroup.add(this.tank);
            this.head = new THREE.Group();
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10, 0, Math.PI * 2, 0, Math.PI / 1.7), metal); this.head.add(dome);
            this._eye(this.head, 0, 0.02, 0.18, 0.08, p.accent);
            this.head.position.set(0, 1.75, 0); this.bodyGroup.add(this.head);
            this.leftArm = this._jetArm(-1, metal, p.accent); this.rightArm = this._jetArm(1, metal, p.accent);
            this.leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.7, 6), metal); this.leftLeg.position.set(-0.2, 0.55, 0); this.bodyGroup.add(this.leftLeg);
            this.rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.7, 6), metal); this.rightLeg.position.set(0.2, 0.55, 0); this.bodyGroup.add(this.rightLeg);
            this._mapCommon({ head: this.head, body: this.core, leftArm: this.leftArm, rightArm: this.rightArm, leftLeg: this.leftLeg, rightLeg: this.rightLeg });
            this._simpleCascade({ head: this.head, body: this.core, leftArm: this.leftArm, rightArm: this.rightArm, leftLeg: this.leftLeg, rightLeg: this.rightLeg });
        }
        _jetArm(side, metal, accent) {
            const g = new THREE.Group();
            const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 7), metal); arm.position.set(side * 0.2, 0, 0); arm.rotation.z = Math.PI / 2; g.add(arm);
            const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 8), metal); nozzle.position.set(side * 0.5, 0, 0); nozzle.rotation.z = -side * Math.PI / 2; g.add(nozzle);
            const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.07, 0.4, 6), this._mat(accent, 0.4, 0.2, accent)); jet.position.set(side * 0.72, 0, 0); jet.rotation.z = -side * Math.PI / 2; g.add(jet); g._jet = jet;
            g.position.set(side * 0.4, 1.25, 0); g._side = side; this.bodyGroup.add(g); return g;
        }

        // ── Iron Horse: a rogue-AI mechanical steed ──────────────────────────
        // Source archetype Robot: HEAD/CORE/LEFT_ARM/RIGHT_ARM/LEFT_LEG/RIGHT_LEG
        // (arms map to the front legs, legs to the hind legs).
        _buildIronHorse() {
            const p = this.profile;
            const metal = this._skinMat(p.bodyColor, 0.35);
            const glow = this._mat(p.accent, 0.4, 0.3, p.accent);
            this.core = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 1.3), metal); this.core.position.set(0, 1.0, 0); this.bodyGroup.add(this.core);
            // Plated neck + head.
            this.head = new THREE.Group();
            const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.6, 8), metal); neck.position.set(0, -0.1, 0.0); neck.rotation.x = 0.5; this.head.add(neck);
            const skull = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.42), metal); skull.position.set(0, 0.2, 0.18); this.head.add(skull);
            this._eye(this.head, -0.09, 0.24, 0.36, 0.05, p.accent); this._eye(this.head, 0.09, 0.24, 0.36, 0.05, p.accent);
            for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 4), metal); ear.position.set(s * 0.08, 0.36, 0.1); this.head.add(ear); }
            // Plasma mane along the neck.
            for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 4), glow); m.position.set(0, 0.0 + i * 0.08, -0.08 - i * 0.04); m.rotation.x = -0.6; this.head.add(m); }
            this.head.position.set(0, 1.35, 0.7); this.bodyGroup.add(this.head);
            // Four piston legs: front pair = arms, hind pair = legs.
            this.leftArm = this._horseLeg(-0.22, 0.5, metal); this.rightArm = this._horseLeg(0.22, 0.5, metal);
            this.leftLeg = this._horseLeg(-0.22, -0.5, metal); this.rightLeg = this._horseLeg(0.22, -0.5, metal);
            // Exhaust tail.
            this.tail = new THREE.Group();
            for (let k = 0; k < 4; k++) { const seg = new THREE.Mesh(new THREE.ConeGeometry(0.08 - k * 0.015, 0.2, 6), glow); seg.position.set(0, 1.05 - k * 0.05, -0.75 - k * 0.16); seg.rotation.x = 1.4; this.tail.add(seg); }
            this.bodyGroup.add(this.tail);
            this._partMeshMap = { HEAD: this.head, CORE: this.core, LEFT_ARM: this.leftArm, RIGHT_ARM: this.rightArm, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg, BODY: this.core, TORSO: this.core, TAIL: this.tail };
            this._cascadeRules = [
                { gone: ['CORE', 'BODY', 'TORSO'], hide: [this.core, this.head, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg, this.tail] },
                { gone: ['HEAD'], hide: [this.head] }, { gone: ['TAIL'], hide: [this.tail] },
                { gone: ['LEFT_ARM'], hide: [this.leftArm] }, { gone: ['RIGHT_ARM'], hide: [this.rightArm] },
                { gone: ['LEFT_LEG'], hide: [this.leftLeg] }, { gone: ['RIGHT_LEG'], hide: [this.rightLeg] },
            ];
        }
        _horseLeg(x, z, mat) {
            const g = new THREE.Group();
            const upper = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, 0.12), mat); upper.position.y = -0.05; g.add(upper);
            const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.4, 6), mat); lower.position.set(0, -0.4, 0.04); g.add(lower);
            const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.1, 6), mat); hoof.position.set(0, -0.62, 0.04); g.add(hoof);
            g.position.set(x, 0.75, z); this.bodyGroup.add(g); return g;
        }

        // ── Tentacled Creature: a bioluminescent hypnotic jellyfish ──────────
        // Source archetype TentacledCreature: EYE/TENTACLE_ONE/TENTACLE_TWO/BODY.
        _buildTentacledCreature() {
            const p = this.profile;
            const jelly = this._skinMat(p.bodyColor, 0.2); jelly.transparent = true; jelly.opacity = 0.55; jelly.emissive = new THREE.Color(p.accent); jelly.emissiveIntensity = 0.4;
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), jelly); this.body.position.set(0, 1.55, 0); this.body.scale.set(1.1, 1.0, 1.1); this.bodyGroup.add(this.body);
            this._rim = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.05, 8, 20), this._mat(p.accent, 0.6, 0.3, p.accent)); this._rim.position.set(0, 1.25, 0); this._rim.rotation.x = Math.PI / 2; this.bodyGroup.add(this._rim);
            this.eye = this._eye(this.bodyGroup, 0, 1.5, 0.1, 0.18, p.accent);
            this.t1 = this._jellyTentacle(-1, jelly); this.t2 = this._jellyTentacle(1, jelly);
            this._partMeshMap = { EYE: this.eye, BODY: this.body, TENTACLE_ONE: this.t1, TENTACLE_TWO: this.t2 };
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.body, this.eye, this.t1, this.t2, this._rim] },
                { gone: ['EYE'], hide: [this.eye] }, { gone: ['TENTACLE_ONE'], hide: [this.t1] }, { gone: ['TENTACLE_TWO'], hide: [this.t2] },
            ];
        }
        _jellyTentacle(side, mat) {
            const g = new THREE.Group();
            for (let b = 0; b < 3; b++) { const sub = new THREE.Group(); let py = 0; for (let k = 0; k < 6; k++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.06 - k * 0.007, 6, 6), mat); seg.position.set(0, py, 0); py -= 0.2; sub.add(seg); } sub.position.set(side * 0.2 + (b - 1) * 0.12, 1.2, 0.1); g.add(sub); }
            g._side = side; this.bodyGroup.add(g); return g;
        }

        // ── Chest Mimic: a fanged treasure-chest ambusher ────────────────────
        // Source archetype ChestMimic: CORE/LID/TEETH/TONGUE/FEET.
        _buildChestMimic() {
            const p = this.profile;
            const wood = this._skinMat(p.bodyColor, 0.6);
            this.core = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.7), wood); this.core.position.set(0, 0.7, 0); this.bodyGroup.add(this.core);
            // Trim band. It is a CHILD of the core, so its position is core-local:
            // the old (0, 0.7, 0) stacked on the core's own y and left a
            // half-transparent slab floating in the air above the chest. It also
            // has to be opaque -- _mat's 2nd argument is opacity, not roughness.
            const band = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.1, 0.74), this._mat(p.accent, 1.0, 0.4, p.accent)); band.position.set(0, -0.22, 0); this.core.add(band);
            this.lid = new THREE.Group();
            const lidBox = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 0.7), wood); lidBox.position.set(0, 0.1, -0.3); this.lid.add(lidBox);
            this._eye(this.lid, -0.18, 0.16, 0.02, 0.07, p.accent); this._eye(this.lid, 0.18, 0.16, 0.02, 0.07, p.accent);
            this.lid.position.set(0, 1.0, -0.05); this.lid.rotation.x = -0.7; this.bodyGroup.add(this.lid);
            // Mouth: a slit across the front face (z = 0.35, spanning y 0.40..1.00).
            // The upper row hangs DOWN from the top rim and the lower row points
            // UP at it -- they used to be the wrong way round, so one row stuck
            // up out of the chest like a crown and the other bit into its own lid.
            // Cone height 0.16, so a centre of 0.92 puts the upper bases flush
            // with the rim, and the rows close on a 0.12 gap for the tongue.
            this.teeth = new THREE.Group();
            const toothMat = this._mat(0xe8e0d0, 1, 0.4);
            for (let i = 0; i < 8; i++) {
                const tx = -0.35 + i * 0.1;
                const tp = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 4), toothMat); tp.position.set(tx, 0.92, 0.32); tp.rotation.x = Math.PI; this.teeth.add(tp);
                const bt = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 4), toothMat); bt.position.set(tx, 0.64, 0.32); this.teeth.add(bt);
            }
            this.bodyGroup.add(this.teeth);
            this.tongue = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.4), this._mat(0xcc4466, 1.0, 0.6)); this.tongue.position.set(0, 0.78, 0.26); this.tongue.rotation.x = 0.3; this.bodyGroup.add(this.tongue);
            this.feet = new THREE.Group();
            for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.28), wood); f.position.set(s * 0.3, 0.32, 0.1); this.feet.add(f); }
            this.bodyGroup.add(this.feet);
            this._partMeshMap = { CORE: this.core, LID: this.lid, TEETH: this.teeth, TONGUE: this.tongue, FEET: this.feet };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.lid, this.teeth, this.tongue, this.feet] },
                { gone: ['LID'], hide: [this.lid] }, { gone: ['TEETH'], hide: [this.teeth] }, { gone: ['TONGUE'], hide: [this.tongue] }, { gone: ['FEET'], hide: [this.feet] },
            ];
        }

        // ── Fungoid: a cheerful sentient mushroom ────────────────────────────
        // Source archetype Mushroom: CAP/STALK/ROOTS/SPORE_SACS.
        _buildFungoid() {
            const p = this.profile;
            const stalkMat = this._skinMat(0xe8e0d0, 0.7);
            const capMat = this._skinMat(p.bodyColor, 0.6);
            this.stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.1, 10), stalkMat); this.stalk.position.set(0, 0.8, 0); this.bodyGroup.add(this.stalk);
            this._eye(this.stalk, -0.12, 0.1, 0.22, 0.07, 0x222222); this._eye(this.stalk, 0.12, 0.1, 0.22, 0.07, 0x222222);
            const smile = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 6, 12, Math.PI), this._mat(0x222222, 0.5)); smile.position.set(0, -0.02, 0.24); smile.rotation.z = Math.PI; this.stalk.add(smile);
            this.cap = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), capMat); this.cap.scale.set(1.2, 0.9, 1.2); this.cap.position.set(0, 1.5, 0); this.bodyGroup.add(this.cap);
            for (let i = 0; i < 6; i++) { const a = this.idRand() * Math.PI * 2, r = this.idRand() * 0.45; const spot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), this._mat(p.accent, 0.6, 0.3, p.accent)); spot.position.set(Math.cos(a) * r, 1.5 + Math.sqrt(Math.max(0, 0.4 - r * r)) * 0.6, Math.sin(a) * r); spot.scale.y = 0.4; this.cap.add(spot); }
            this.sporeSacs = new THREE.Group();
            for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const sac = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), this._mat(p.accent, 0.7, 0.2, p.accent)); sac.position.set(Math.cos(a) * 0.4, 1.35, Math.sin(a) * 0.4); this.sporeSacs.add(sac); }
            this.bodyGroup.add(this.sporeSacs);
            this.roots = new THREE.Group();
            for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const r = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.4, 5), stalkMat); r.position.set(Math.cos(a) * 0.2, 0.2, Math.sin(a) * 0.2); r.rotation.z = Math.cos(a) * 0.6; r.rotation.x = -Math.sin(a) * 0.6; this.roots.add(r); }
            this.bodyGroup.add(this.roots);
            this._partMeshMap = { CAP: this.cap, STALK: this.stalk, ROOTS: this.roots, SPORE_SACS: this.sporeSacs };
            this._cascadeRules = [
                { gone: ['STALK'], hide: [this.stalk, this.cap, this.roots, this.sporeSacs] },
                { gone: ['CAP'], hide: [this.cap, this.sporeSacs] }, { gone: ['ROOTS'], hide: [this.roots] }, { gone: ['SPORE_SACS'], hide: [this.sporeSacs] },
            ];
        }

        // ── Hydra: a multi-headed reptilian monster ──────────────────────────
        // Source archetype Hydra: HEAD_ONE/HEAD_TWO/HEAD_THREE/BODY/TAIL.
        _buildHydra() {
            const p = this.profile;
            const scale = this._skinMat(p.bodyColor, 0.5);
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 14, 12), scale); this.body.scale.set(1.1, 0.9, 1.3); this.body.position.set(0, 0.9, 0); this.bodyGroup.add(this.body);
            this.head1 = this._hydraHead(-0.5, scale, p.accent); this.head2 = this._hydraHead(0.0, scale, p.accent); this.head3 = this._hydraHead(0.5, scale, p.accent);
            for (const sx of [-1, 1]) for (const sz of [0.4, -0.4]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.07, 0.5, 6), scale); leg.position.set(sx * 0.4, 0.45, sz); this.bodyGroup.add(leg); }
            this.tail = new THREE.Group(); let ty = 0.9, tz = -0.7;
            for (let i = 0; i < 6; i++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.2 - i * 0.025, 8, 8), scale); seg.position.set(0, ty - i * 0.02, tz - i * 0.26); this.tail.add(seg); }
            this.bodyGroup.add(this.tail);
            this._partMeshMap = { HEAD_ONE: this.head1, HEAD_TWO: this.head2, HEAD_THREE: this.head3, BODY: this.body, TAIL: this.tail };
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.body, this.head1, this.head2, this.head3, this.tail] },
                { gone: ['HEAD_ONE'], hide: [this.head1] }, { gone: ['HEAD_TWO'], hide: [this.head2] }, { gone: ['HEAD_THREE'], hide: [this.head3] }, { gone: ['TAIL'], hide: [this.tail] },
            ];
        }
        _hydraHead(x, mat, accent) {
            const g = new THREE.Group(); let ny = 0, nz = 0;
            for (let i = 0; i < 4; i++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.18 - i * 0.02, 10, 8), mat); seg.position.set(0, ny, nz); g.add(seg); ny += 0.24; nz += 0.12; }
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), mat); head.scale.set(0.9, 0.8, 1.3); head.position.set(0, ny, nz + 0.1); g.add(head);
            this._eye(head, -0.1, 0.05, 0.16, 0.05, accent); this._eye(head, 0.1, 0.05, 0.16, 0.05, accent);
            for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 4), this._mat(0xe8e0d0, 1, 0.4)); f.position.set(s * 0.06, ny - 0.1, nz + 0.28); f.rotation.x = Math.PI; g.add(f); }
            g.position.set(x, 1.3, 0.4); g.rotation.z = -x * 0.3; g._x = x; this.bodyGroup.add(g); return g;
        }

        // ── Bacteria: a translucent nightmare microbe ────────────────────────
        // Source archetype Bacterial: NUCLEUS/MEMBRANE/FLAGELLUM/TOXIN_SACS.
        _buildBacteria() {
            const p = this.profile;
            const memb = this._skinMat(p.bodyColor, 0.2); memb.transparent = true; memb.opacity = 0.6; memb.emissive = new THREE.Color(p.accent); memb.emissiveIntensity = 0.3;
            this.membrane = new THREE.Mesh(new THREE.SphereGeometry(0.65, 16, 14), memb); this.membrane.position.set(0, 1.1, 0); this.membrane.scale.set(1.1, 1.0, 1.0); this.bodyGroup.add(this.membrane);
            this.nucleus = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25, 0), this._mat(p.accent, 0.8, 0.2, p.accent)); this.nucleus.position.set(0, 1.1, 0); this.bodyGroup.add(this.nucleus);
            this._eye(this.bodyGroup, -0.12, 1.2, 0.5, 0.07, 0x220022); this._eye(this.bodyGroup, 0.12, 1.2, 0.5, 0.07, 0x220022);
            this.toxinSacs = new THREE.Group();
            for (let i = 0; i < 5; i++) { const a = this.idRand() * Math.PI * 2, e = this.idRand() * Math.PI; const sac = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), this._mat(0x66aa33, 0.7, 0.2, 0x224400)); sac.position.set(Math.sin(e) * Math.cos(a) * 0.4, 1.1 + Math.cos(e) * 0.4, Math.sin(e) * Math.sin(a) * 0.35); this.toxinSacs.add(sac); }
            this.bodyGroup.add(this.toxinSacs);
            this.flagellum = new THREE.Group();
            for (const s of [-1, 1]) { const g = new THREE.Group(); let py = 0; for (let k = 0; k < 6; k++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.05 - k * 0.006, 6, 6), memb); seg.position.set(0, py, 0); py -= 0.2; g.add(seg); } g.position.set(s * 0.3, 0.6, -0.4); g._side = s; this.flagellum.add(g); }
            this.bodyGroup.add(this.flagellum);
            this._partMeshMap = { NUCLEUS: this.nucleus, MEMBRANE: this.membrane, FLAGELLUM: this.flagellum, TOXIN_SACS: this.toxinSacs };
            this._cascadeRules = [
                { gone: ['NUCLEUS'], hide: [this.nucleus, this.membrane, this.flagellum, this.toxinSacs] },
                { gone: ['MEMBRANE'], hide: [this.membrane] }, { gone: ['FLAGELLUM'], hide: [this.flagellum] }, { gone: ['TOXIN_SACS'], hide: [this.toxinSacs] },
            ];
        }

        // ── Gorgon: a serpent-haired matriarch with a snake tail ─────────────
        // Source archetype Gorgon: EYES/SNAKE_HAIR/UPPER_BODY/LOWER_BODY.
        _buildGorgon() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.5);
            const scaleMat = this._skinMat(0x3a5a3a, 0.4);
            this.lower = new THREE.Group();
            for (let i = 0; i < 12; i++) { const a = i * 0.9; const r = 0.5 - i * 0.022; const seg = new THREE.Mesh(new THREE.SphereGeometry(0.18 - i * 0.006, 10, 8), scaleMat); seg.position.set(Math.cos(a) * r, 0.18 + i * 0.02, Math.sin(a) * r); this.lower.add(seg); }
            this.bodyGroup.add(this.lower);
            this.upper = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.32, 0.8, 10), skin); this.upper.position.set(0, 1.3, 0); this.bodyGroup.add(this.upper);
            this.leftArm = this._limb(skin, -0.3, 1.55, true); this.rightArm = this._limb(skin, 0.3, 1.55, true);
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), skin); this.head.add(h);
            this.eyes = new THREE.Group(); this._eye(this.eyes, -0.1, 0.04, 0.2, 0.06, p.accent); this._eye(this.eyes, 0.1, 0.04, 0.2, 0.06, p.accent); this.head.add(this.eyes);
            this.head.position.set(0, 1.95, 0); this.bodyGroup.add(this.head);
            this.snakeHair = new THREE.Group();
            for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const g = new THREE.Group(); let py = 0; for (let k = 0; k < 3; k++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.05 - k * 0.008, 6, 6), scaleMat); seg.position.set(0, py, 0); py += 0.1; g.add(seg); } g.position.set(Math.cos(a) * 0.18, 2.1, Math.sin(a) * 0.18); g.rotation.z = Math.cos(a) * 0.5; g.rotation.x = -Math.sin(a) * 0.5; g._a = a; this.snakeHair.add(g); }
            this.bodyGroup.add(this.snakeHair);
            this._partMeshMap = { EYES: this.eyes, SNAKE_HAIR: this.snakeHair, UPPER_BODY: this.upper, LOWER_BODY: this.lower, HEAD: this.head, LEFT_ARM: this.leftArm, RIGHT_ARM: this.rightArm };
            this._cascadeRules = [
                { gone: ['LOWER_BODY'], hide: [this.lower, this.upper, this.head, this.snakeHair, this.eyes, this.leftArm, this.rightArm] },
                { gone: ['UPPER_BODY'], hide: [this.upper, this.head, this.snakeHair, this.eyes, this.leftArm, this.rightArm] },
                { gone: ['EYES'], hide: [this.eyes] }, { gone: ['SNAKE_HAIR'], hide: [this.snakeHair] },
                { gone: ['LEFT_ARM'], hide: [this.leftArm] }, { gone: ['RIGHT_ARM'], hide: [this.rightArm] },
            ];
        }

        // ── Phoenix: a legendary flaming firebird ────────────────────────────
        // Source archetype Phoenix: CORE/FEATHERS/BEAK/TALONS/LEFT_WING/RIGHT_WING/LEFT_EYE/RIGHT_EYE.
        _buildPhoenix() {
            const p = this.profile;
            const feather = this._skinMat(p.bodyColor, 0.4); feather.emissive = new THREE.Color(p.accent); feather.emissiveIntensity = 0.4;
            const fire = this._mat(p.accent, 0.9, 0.3, p.accent);
            this.core = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 12), feather); this.core.scale.set(0.9, 1.1, 0.9); this.core.position.set(0, 1.3, 0); this.bodyGroup.add(this.core);
            this.feathers = new THREE.Group();
            for (let i = 0; i < 7; i++) { const a = (i - 3) * 0.2; const fl = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.7 - Math.abs(i - 3) * 0.06, 5), fire); fl.position.set(a * 0.3, 0.9, -0.4); fl.rotation.x = 2.4; fl.rotation.z = a; this.feathers.add(fl); }
            this.bodyGroup.add(this.feathers);
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), feather); this.head.add(h);
            this.leftEye = this._eye(this.head, -0.09, 0.04, 0.16, 0.05, 0xfff0aa); this.rightEye = this._eye(this.head, 0.09, 0.04, 0.16, 0.05, 0xfff0aa);
            for (let i = 0; i < 3; i++) { const cr = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.2, 4), fire); cr.position.set(0, 0.2, -i * 0.06); cr.rotation.x = -0.3 + i * 0.2; this.head.add(cr); }
            this.head.position.set(0, 1.9, 0.1); this.bodyGroup.add(this.head);
            this.beak = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 5), this._mat(0xffcc44, 1, 0.4)); this.beak.position.set(0, 1.88, 0.34); this.beak.rotation.x = Math.PI / 2; this.bodyGroup.add(this.beak);
            this.leftWing = this._phoenixWing(-1, fire); this.rightWing = this._phoenixWing(1, fire);
            this.talons = new THREE.Group();
            for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.3, 5), this._mat(0xffcc44, 1, 0.4)); leg.position.set(s * 0.12, 0.95, 0.05); this.talons.add(leg); for (let i = -1; i <= 1; i++) { const claw = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.1, 4), this._mat(0xffcc44, 1, 0.4)); claw.position.set(s * 0.12 + i * 0.04, 0.8, 0.12); claw.rotation.x = 1.2; this.talons.add(claw); } }
            this.bodyGroup.add(this.talons);
            this._partMeshMap = { CORE: this.core, FEATHERS: this.feathers, BEAK: this.beak, TALONS: this.talons, LEFT_WING: this.leftWing, RIGHT_WING: this.rightWing, LEFT_EYE: this.leftEye, RIGHT_EYE: this.rightEye, HEAD: this.head };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.feathers, this.beak, this.talons, this.leftWing, this.rightWing, this.head] },
                { gone: ['FEATHERS'], hide: [this.feathers] }, { gone: ['BEAK'], hide: [this.beak] }, { gone: ['TALONS'], hide: [this.talons] },
                { gone: ['LEFT_WING'], hide: [this.leftWing] }, { gone: ['RIGHT_WING'], hide: [this.rightWing] },
                { gone: ['LEFT_EYE'], hide: [this.leftEye] }, { gone: ['RIGHT_EYE'], hide: [this.rightEye] },
            ];
        }
        _phoenixWing(side, fire) {
            const g = new THREE.Group();
            for (let i = 0; i < 5; i++) { const len = 0.6 - i * 0.06; const fl = new THREE.Mesh(new THREE.ConeGeometry(0.06, len, 5), fire); fl.position.set(side * (0.2 + i * 0.14), 0.1 - i * 0.04, -0.05); fl.rotation.z = side * (1.3 + i * 0.1); g.add(fl); }
            g.position.set(side * 0.3, 1.4, 0); g._side = side; this.bodyGroup.add(g); return g;
        }

        // ── Spiky Monster: a needle-wreathed lurking horror ──────────────────
        // Source archetype SpikyMonster: SPIKES/BODY/EYES/LEFT_LEG/RIGHT_LEG.
        _buildSpikyMonster() {
            const p = this.profile;
            const flesh = this._skinMat(p.bodyColor, 0.6);
            const spikeMat = this._mat(0xe8e0d0, 1, 0.3);
            this.body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), flesh); this.body.position.set(0, 1.1, 0); this.bodyGroup.add(this.body);
            this.spikes = new THREE.Group();
            for (let i = 0; i < 18; i++) { const a = this.idRand() * Math.PI * 2, e = this.idRand() * Math.PI; const dir = new THREE.Vector3(Math.sin(e) * Math.cos(a), Math.cos(e), Math.sin(e) * Math.sin(a)); const sp = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.32, 4), spikeMat); sp.position.set(dir.x * 0.6, 1.1 + dir.y * 0.6, dir.z * 0.6); sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); this.spikes.add(sp); }
            this.bodyGroup.add(this.spikes);
            this.eyes = new THREE.Group(); this._eye(this.eyes, -0.13, 0.05, 0.5, 0.08, p.accent); this._eye(this.eyes, 0.13, 0.05, 0.5, 0.08, p.accent); this.eyes.position.set(0, 1.1, 0); this.bodyGroup.add(this.eyes);
            this.leftLeg = this._spikyLeg(-0.2, flesh); this.rightLeg = this._spikyLeg(0.2, flesh);
            this._partMeshMap = { SPIKES: this.spikes, BODY: this.body, EYES: this.eyes, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg };
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.body, this.spikes, this.eyes, this.leftLeg, this.rightLeg] },
                { gone: ['SPIKES'], hide: [this.spikes] }, { gone: ['EYES'], hide: [this.eyes] }, { gone: ['LEFT_LEG'], hide: [this.leftLeg] }, { gone: ['RIGHT_LEG'], hide: [this.rightLeg] },
            ];
        }
        _spikyLeg(x, mat) { const g = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.6, 6), mat); g.position.set(x, 0.55, 0); this.bodyGroup.add(g); return g; }

        // ── Scorpion: an armoured arachnid with pincers and a stinger tail ───
        // Source archetype Scorpion: HEAD/CEPHALOTHORAX/ABDOMEN/TAIL/STINGER/PINCER_LEFT/PINCER_RIGHT/8 legs.
        _buildScorpion() {
            const p = this.profile;
            const chitin = this._skinMat(p.bodyColor, 0.4);
            this.cephalothorax = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 12), chitin); this.cephalothorax.scale.set(1.1, 0.7, 1.3); this.cephalothorax.position.set(0, 0.6, 0.2); this.bodyGroup.add(this.cephalothorax);
            this.abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 12), chitin); this.abdomen.scale.set(1.0, 0.7, 1.2); this.abdomen.position.set(0, 0.6, -0.4); this.bodyGroup.add(this.abdomen);
            this.head = new THREE.Group(); this._eye(this.head, -0.08, 0.04, 0.16, 0.05, p.accent); this._eye(this.head, 0.08, 0.04, 0.16, 0.05, p.accent); this.head.position.set(0, 0.62, 0.5); this.bodyGroup.add(this.head);
            this.tail = new THREE.Group(); const path = [[0.7, -0.7], [0.95, -0.85], [1.25, -0.85], [1.5, -0.7], [1.65, -0.45]];
            for (let i = 0; i < path.length; i++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.13 - i * 0.012, 8, 8), chitin); seg.position.set(0, path[i][0], path[i][1]); this.tail.add(seg); }
            this.bodyGroup.add(this.tail);
            this.stinger = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.28, 6), this._mat(p.accent, 0.9, 0.3, p.accent)); this.stinger.position.set(0, 1.62, -0.3); this.stinger.rotation.x = -0.8; this.bodyGroup.add(this.stinger);
            this.pincerLeft = this._scorpionPincer(-1, chitin); this.pincerRight = this._scorpionPincer(1, chitin);
            this.legs = {};
            const defs = [['LEFT_LEG', -1, 0.45], ['RIGHT_LEG', 1, 0.45], ['MID_LEFT_LEG', -1, 0.2], ['MID_RIGHT_LEG', 1, 0.2], ['MID_REAR_LEFT_LEG', -1, -0.05], ['MID_REAR_RIGHT_LEG', 1, -0.05], ['REAR_LEFT_LEG', -1, -0.3], ['REAR_RIGHT_LEG', 1, -0.3]];
            defs.forEach(([k, s, z]) => { const g = new THREE.Group(); const u = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.5, 5), chitin); u.position.set(s * 0.25, 0, 0); u.rotation.z = s * 1.1; g.add(u); g.position.set(s * 0.3, 0.55, z); g._side = s; this.bodyGroup.add(g); this.legs[k] = g; });
            this._partMeshMap = { HEAD: this.head, CEPHALOTHORAX: this.cephalothorax, ABDOMEN: this.abdomen, TAIL: this.tail, STINGER: this.stinger, PINCER_LEFT: this.pincerLeft, PINCER_RIGHT: this.pincerRight, ...this.legs };
            this._cascadeRules = [
                { gone: ['CEPHALOTHORAX'], hide: [this.cephalothorax, this.abdomen, this.head, this.tail, this.stinger, this.pincerLeft, this.pincerRight, ...(this._legsArr || (this._legsArr = Object.values(this.legs)))] },
                { gone: ['ABDOMEN'], hide: [this.abdomen, this.tail, this.stinger] }, { gone: ['HEAD'], hide: [this.head] },
                { gone: ['TAIL'], hide: [this.tail, this.stinger] }, { gone: ['STINGER'], hide: [this.stinger] },
                { gone: ['PINCER_LEFT'], hide: [this.pincerLeft] }, { gone: ['PINCER_RIGHT'], hide: [this.pincerRight] },
                ...defs.map(([k]) => ({ gone: [k], hide: [this.legs[k]] })),
            ];
        }
        _scorpionPincer(side, mat) {
            const g = new THREE.Group();
            const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 6), mat); arm.position.set(side * 0.2, 0, 0.1); arm.rotation.z = Math.PI / 2; g.add(arm);
            const palm = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), mat); palm.position.set(side * 0.45, 0, 0.25); g.add(palm);
            const up = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 5), mat); up.position.set(side * 0.55, 0.1, 0.35); up.rotation.z = -side * 1.5; g.add(up);
            const lo = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 5), mat); lo.position.set(side * 0.55, -0.1, 0.35); lo.rotation.z = -side * 1.9; g.add(lo);
            g.position.set(side * 0.4, 0.6, 0.4); g._side = side; this.bodyGroup.add(g); return g;
        }

        // ── Turret: an ancient rotating mechanical guardian ──────────────────
        // Source archetype Turret: CORE/GUN_BARREL/SENSOR_ARRAY/ROTATION_MECH/AMMO_CHAMBER.
        _buildTurret() {
            const p = this.profile;
            const metal = this._skinMat(p.bodyColor, 0.4);
            this.rotationMech = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.3, 12), metal); this.rotationMech.position.set(0, 0.3, 0); this.bodyGroup.add(this.rotationMech);
            this.core = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 12, 0, Math.PI * 2, 0, Math.PI), metal); this.core.scale.set(1.1, 0.9, 1.1); this.core.position.set(0, 0.8, 0); this.bodyGroup.add(this.core);
            for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; const pl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.06), metal); pl.position.set(Math.cos(a) * 0.42, 0.05, Math.sin(a) * 0.42); pl.lookAt(0, 0.05, 0); this.core.add(pl); }
            this.sensorArray = new THREE.Group(); this._eye(this.sensorArray, 0, 0.05, 0.32, 0.1, p.accent); this.sensorArray.position.set(0, 0.9, 0); this.bodyGroup.add(this.sensorArray);
            this.gunBarrel = new THREE.Group();
            const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.7, 10), metal); barrel.rotation.x = Math.PI / 2; barrel.position.z = 0.45; this.gunBarrel.add(barrel);
            this.gunBarrel._muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 6, 12), this._mat(p.accent, 0.9, 0.3, p.accent)); this.gunBarrel._muzzle.position.z = 0.8; this.gunBarrel._muzzle.rotation.x = Math.PI / 2; this.gunBarrel.add(this.gunBarrel._muzzle);
            this.gunBarrel.position.set(0, 0.85, 0.2); this.bodyGroup.add(this.gunBarrel);
            this.ammoChamber = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.2, 8), metal); this.ammoChamber.rotation.z = Math.PI / 2; this.ammoChamber.position.set(-0.4, 0.9, -0.1); this.bodyGroup.add(this.ammoChamber);
            this._partMeshMap = { CORE: this.core, GUN_BARREL: this.gunBarrel, SENSOR_ARRAY: this.sensorArray, ROTATION_MECH: this.rotationMech, AMMO_CHAMBER: this.ammoChamber };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.gunBarrel, this.sensorArray, this.ammoChamber] },
                { gone: ['GUN_BARREL'], hide: [this.gunBarrel] }, { gone: ['SENSOR_ARRAY'], hide: [this.sensorArray] }, { gone: ['ROTATION_MECH'], hide: [this.rotationMech] }, { gone: ['AMMO_CHAMBER'], hide: [this.ammoChamber] },
            ];
        }

        // Ophanim: a biblically-accurate angel - interlocking eye-studded wheels
        // around a fiery core, ringed by a band of unblinking eyes.
        _buildOphanim() {
            const p = this.profile;
            const ringMat = this._skinMat(p.bodyColor, 0.4);
            this._ophWheels = [];
            const orients = [[0, 0, 0], [Math.PI / 2, 0, 0], [0, 0, Math.PI / 2], [Math.PI / 4, Math.PI / 4, 0]];
            const radii = [0.98, 0.8, 0.62, 0.46];
            const wkeys = ['WHEEL_ONE', 'WHEEL_TWO', 'WHEEL_THREE', 'WHEEL_FOUR'];
            const wheelMeshes = {};
            for (let i = 0; i < 4; i++) {
                const w = new THREE.Mesh(new THREE.TorusGeometry(radii[i], 0.055, 8, 32), ringMat);
                w.rotation.set(orients[i][0], orients[i][1], orients[i][2]);
                w.position.y = 1.3; w._spin = (i % 2 ? -1 : 1) * (0.4 + i * 0.15);
                for (let e = 0; e < 8; e++) { const a = e / 8 * Math.PI * 2; this._eye(w, Math.cos(a) * radii[i], Math.sin(a) * radii[i], 0, 0.05, p.accent); }
                this.bodyGroup.add(w); this._ophWheels.push(w); wheelMeshes[wkeys[i]] = w;
            }
            // central fiery core
            this.core = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 16), this._mat(p.accent, 0.85, 0.2, p.accent));
            this.core.position.y = 1.3; this.bodyGroup.add(this.core);
            // EYE_RING - band of larger eyes orbiting the core
            this.eyeRing = new THREE.Group();
            for (let e = 0; e < 10; e++) { const a = e / 10 * Math.PI * 2; this._eye(this.eyeRing, Math.cos(a) * 0.36, Math.sin(a) * 0.36, 0.12, 0.07, 0xffffff); }
            this.eyeRing.position.y = 1.3; this.bodyGroup.add(this.eyeRing);
            this._partMeshMap = { WHEEL_ONE: wheelMeshes.WHEEL_ONE, WHEEL_TWO: wheelMeshes.WHEEL_TWO, WHEEL_THREE: wheelMeshes.WHEEL_THREE, WHEEL_FOUR: wheelMeshes.WHEEL_FOUR, EYE_RING: this.eyeRing };
            this._cascadeRules = [
                { gone: ['EYE_RING'], hide: [this.core, this.eyeRing].concat(this._ophWheels) },
                { gone: ['WHEEL_ONE'], hide: [wheelMeshes.WHEEL_ONE] }, { gone: ['WHEEL_TWO'], hide: [wheelMeshes.WHEEL_TWO] },
                { gone: ['WHEEL_THREE'], hide: [wheelMeshes.WHEEL_THREE] }, { gone: ['WHEEL_FOUR'], hide: [wheelMeshes.WHEEL_FOUR] },
            ];
        }

        // ── Sacred Elemental: a radiant haloed energy humanoid ───────────────
        // Source archetype SacredElemental: CORE/BODY/LEFT_ARM/RIGHT_ARM/LEFT_LEG/RIGHT_LEG.
        _buildSacredElemental() {
            const p = this.profile;
            const holy = this._skinMat(p.bodyColor, 0.2); holy.transparent = true; holy.opacity = 0.6; holy.emissive = new THREE.Color(p.accent); holy.emissiveIntensity = 0.5;
            this.body = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 1.0, 12), holy); this.body.add(torso);
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 14), holy); head.position.y = 0.7; this.body.add(head);
            this._eye(head, -0.1, 0.02, 0.2, 0.06, p.accent); this._eye(head, 0.1, 0.02, 0.2, 0.06, p.accent);
            this.halo = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 8, 20), this._mat(p.accent, 0.9, 0.2, p.accent)); this.halo.position.y = 1.05; this.halo.rotation.x = Math.PI / 2; this.body.add(this.halo);
            this.body.position.set(0, 1.3, 0); this.bodyGroup.add(this.body);
            this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 0), this._mat(0xffffff, 0.95, 0.1, p.accent)); this.core.position.set(0, 1.4, 0.05); this.bodyGroup.add(this.core);
            this.leftArm = this._sacredLimb(-0.42, 1.6, holy); this.rightArm = this._sacredLimb(0.42, 1.6, holy);
            this.leftLeg = this._sacredLimb(-0.2, 0.85, holy); this.rightLeg = this._sacredLimb(0.2, 0.85, holy);
            this._partMeshMap = { CORE: this.core, BODY: this.body, LEFT_ARM: this.leftArm, RIGHT_ARM: this.rightArm, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.body, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg] },
                { gone: ['BODY'], hide: [this.body] },
                { gone: ['LEFT_ARM'], hide: [this.leftArm] }, { gone: ['RIGHT_ARM'], hide: [this.rightArm] },
                { gone: ['LEFT_LEG'], hide: [this.leftLeg] }, { gone: ['RIGHT_LEG'], hide: [this.rightLeg] },
            ];
        }
        _sacredLimb(x, y, mat) {
            const g = new THREE.Group(); let py = 0;
            for (let k = 0; k < 3; k++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.1 - k * 0.02, 8, 8), mat); seg.position.set(0, py, 0); py -= 0.2; g.add(seg); }
            g.position.set(x, y, 0); g._side = Math.sign(x) || 1; this.bodyGroup.add(g); return g;
        }

        // ── Seahorse: an upright curled seahorse ─────────────────────────────
        // Source archetype AquaticFish: HEAD/BODY/TAIL_FIN/DORSAL_FIN/LEFT_PECTORAL_FIN/RIGHT_PECTORAL_FIN.
        _buildSeahorse() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.5);
            // BODY: ribbed S-curve trunk.
            this.body = new THREE.Group();
            let by = 0.7, bx = 0; let topx = 0, topy = 0;
            for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.2 - i * 0.022, 10, 8), skin); s.position.set(bx, by, 0); this.body.add(s); topx = bx; topy = by; by += 0.2; bx += (i < 3 ? 0.05 : -0.05); }
            this.bodyGroup.add(this.body);
            // Pregnant brood pouch: a swollen belly on the lower trunk.
            if (p.pregnant) {
                this.pouch = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12), skin);
                this.pouch.scale.set(1.1, 1.0, 1.1); this.pouch.position.set(0.12, 0.85, 0.16);
                this.bodyGroup.add(this.pouch);
                for (let i = 0; i < 4; i++) { const egg = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), this._mat(p.accent, 0.7, 0.2, p.accent)); egg.position.set(0.12 + (this.idRand() - 0.5) * 0.18, 0.85 + (this.idRand() - 0.5) * 0.18, 0.32); this.bodyGroup.add(egg); }
            }
            // HEAD: horse-like with a long snout + coronet.
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), skin); h.scale.set(0.9, 1.1, 1.0); this.head.add(h);
            const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.06, 0.34, 7), skin); snout.position.set(0, -0.04, 0.22); snout.rotation.x = 1.2; this.head.add(snout);
            this._eye(this.head, -0.09, 0.05, 0.1, 0.045, p.accent); this._eye(this.head, 0.09, 0.05, 0.1, 0.045, p.accent);
            for (let i = 0; i < 3; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.1, 4), skin); sp.position.set(-0.05 + i * 0.05, 0.18, -0.04); this.head.add(sp); }
            this.head.position.set(topx + 0.04, topy + 0.18, 0); this.head.rotation.z = -0.25; this.bodyGroup.add(this.head);
            // TAIL_FIN: curled prehensile tail spiralling at the base.
            this.tailFin = new THREE.Group();
            for (let i = 0; i < 6; i++) { const a = i * 0.95; const r = 0.22 - i * 0.025; const s = new THREE.Mesh(new THREE.SphereGeometry(0.1 - i * 0.013, 8, 8), skin); s.position.set(Math.sin(a) * r, 0.55 - i * 0.02, Math.cos(a) * r - 0.12); this.tailFin.add(s); }
            this.bodyGroup.add(this.tailFin);
            // DORSAL_FIN: rippling back fin.
            const finMat = this._mat(p.accent, 0.55, 0.3, p.accent); finMat.side = THREE.DoubleSide;
            this.dorsalFin = new THREE.Mesh(new THREE.CircleGeometry(0.2, 8, 0, Math.PI), finMat); this.dorsalFin.position.set(-0.1, 1.15, 0); this.dorsalFin.rotation.y = Math.PI / 2; this.bodyGroup.add(this.dorsalFin);
            // Pectoral fins.
            this.leftFin = this._seahorseFin(-1, finMat); this.rightFin = this._seahorseFin(1, finMat);
            this._partMeshMap = { HEAD: this.head, BODY: this.body, TAIL_FIN: this.tailFin, DORSAL_FIN: this.dorsalFin, LEFT_PECTORAL_FIN: this.leftFin, RIGHT_PECTORAL_FIN: this.rightFin };
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.body, this.head, this.tailFin, this.dorsalFin, this.leftFin, this.rightFin] },
                { gone: ['HEAD'], hide: [this.head] }, { gone: ['TAIL_FIN'], hide: [this.tailFin] }, { gone: ['DORSAL_FIN'], hide: [this.dorsalFin] },
                { gone: ['LEFT_PECTORAL_FIN'], hide: [this.leftFin] }, { gone: ['RIGHT_PECTORAL_FIN'], hide: [this.rightFin] },
            ];
        }
        _seahorseFin(side, mat) {
            const f = new THREE.Mesh(new THREE.CircleGeometry(0.11, 6, 0, Math.PI), mat); f.position.set(side * 0.2, 1.45, 0); f.rotation.y = side * 0.7; f._side = side; this.bodyGroup.add(f); return f;
        }

        // ── Fish School: a swirling shoal of many small fish (swarm) ─────────
        // Source archetype AquaticFish (rendered as a multi-fish swarm).
        _buildFishSchool() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.5);
            const finMat = this._mat(p.accent, 0.7, 0.3, p.accent);
            this.body = new THREE.Group(); this._fish = [];
            for (let i = 0; i < 16; i++) {
                const fish = new THREE.Group();
                const b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), skin); b.scale.set(1.7, 0.7, 0.5); fish.add(b);
                const tail = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.14, 4), finMat); tail.position.set(-0.17, 0, 0); tail.rotation.z = Math.PI / 2; fish.add(tail);
                const a = this.idRand() * Math.PI * 2, e = this.idRand() * Math.PI, r = 0.4 + this.idRand() * 0.55;
                fish.position.set(Math.sin(e) * Math.cos(a) * r, 1.3 + Math.cos(e) * 0.6, Math.sin(e) * Math.sin(a) * r);
                fish.rotation.y = this.idRand() * Math.PI * 2; fish._phase = this.idRand() * Math.PI * 2; fish._r = r; fish._a = a;
                this.body.add(fish); this._fish.push(fish);
            }
            this.bodyGroup.add(this.body);
            // Whole school maps to every part key; root-protection keeps it intact until death.
            this._partMeshMap = { HEAD: this.body, BODY: this.body, TAIL_FIN: this.body, DORSAL_FIN: this.body, LEFT_PECTORAL_FIN: this.body, RIGHT_PECTORAL_FIN: this.body };
            this._cascadeRules = [{ gone: ['BODY', 'HEAD'], hide: [this.body] }];
        }

        animatePose(deltaTime) {
            if (this._baseY === null) this._baseY = this.model.position.y;
            const t = this.animTime;
            const anim = this.currentAnimation;
            let growth = 1.0;
            if (anim === 'spawn') growth = Math.min(1.0, t / 0.8);
            this.applyModelScale(growth);

            const fast = (anim === 'attack' || anim === 'specialattack');
            // Four-legged models only stride while really travelling (overworld
            // walk) or lunging on an attack; standing in battle they keep still.
            const stride = this.strideMul(fast);
            // variant never changes after construction, so the grounded lookup
            // is resolved once per instance instead of rebuilding the list every frame.
            if (this._floats === undefined) {
            const grounded = ['totem', 'mammothcalf', 'trashling', 'tridenthunter', 'twilightsatyr', 'timberwoodshaman',
                'venomoussnake', 'webweaver', 'wildrabbit', 'abyssalcrab', 'hallucigenia', 'abyssaltentacler', 'acidbombardier', 'acidictidecaller',
                'ancientdragon', 'aquaticmantis', 'reptilian', 'bloodwidow', 'bogelemental', 'bogmutant',
                'theropod', 'chainfury', 'beast', 'cinderweaver', 'hellhound', 'coralturtle', 'bioslave',
                'crystalentity', 'serpent', 'crystalturtle', 'eldertreant', 'electrospider', 'tickswarm',
                'centipede', 'scarab', 'frostslime',
                'gatorghast', 'snail', 'segmentworm', 'dryad', 'termite', 'hydroengine', 'ironhorse', 'chestmimic',
                'fungoid', 'hydra', 'gorgon', 'spikymonster', 'scorpion', 'turret', 'sacredelemental'];
            this._floats = (this.variant !== 'warmachine' && !this.variant.startsWith('wm_') && this.variant !== 'scrapbot' && this.variant !== 'hand' && grounded.indexOf(this.variant) === -1);
            }
            const floats = this._floats;
            this.model.position.y = this._baseY + Math.sin(t * 1.3) * (floats ? 0.08 : 0.02) * this.scale;

            switch (this.variant) {
                case 'mar_phantom': case 'mar_twisted': case 'mar_haunted': case 'mar_mannequin':
                case 'mar_backwards': case 'mar_stringbound': case 'mar_meatpuppet': case 'mar_boneorchestra':
                case 'mar_puppetcorpse': case 'mar_babydoll':
                case 'marionette': {
                    // Jerky, string-pulled twitching.
                    const j = (m, ph) => { if (m && m.visible) m.rotation.x = Math.sin(t * (fast ? 12 : 4) + ph) * (fast ? 0.5 : 0.25); };
                    j(this.leftArm, 0); j(this.rightArm, 1.5); j(this.leftLeg, 3); j(this.rightLeg, 4.5);
                    if (this.head) { this.head.rotation.z = Math.sin(t * 3) * 0.15; if (this.head._jaw) this.head._jaw.position.y = -0.2 - Math.abs(Math.sin(t * (fast ? 10 : 3))) * 0.08; }
                    if (this.controlBar) this.controlBar.rotation.z = Math.sin(t * 2) * 0.05;
                    break;
                }
                case 'wm_assault': case 'wm_battlemech': case 'wm_battlemechep': case 'wm_arsenal':
                case 'wm_tank': case 'wm_cogwork': case 'wm_ironbastion': case 'wm_marauder': case 'wm_veteranbot':
                case 'scrapbot':
                case 'warmachine': {
                    if (this.head) this.head.rotation.y = Math.sin(t * (fast ? 5 : 1.2)) * 0.5;
                    if (this.rightArm) { this.rightArm.rotation.x = fast ? Math.sin(t * 8) * 0.2 : 0; if (this.rightArm._muzzle && this.rightArm._muzzle.material) this.rightArm._muzzle.material.emissiveIntensity = (fast ? 1.6 : 0.5) + Math.sin(t * 6) * 0.4; }
                    break;
                }
                case 'flesh': {
                    if (this.body) { const s = 1.0 + Math.sin(t * (fast ? 6 : 2.5)) * 0.1; this.body.scale.set(1.1 * s, 1.0 / s, 1.0 * s); }
                    this._floaters.forEach((f, i) => { if (f.visible && f._side !== undefined) f.rotation.z = Math.sin(t * (fast ? 7 : 3) + i) * 0.4; });
                    if (this.mouths) this.mouths.children.forEach((m, i) => { m.scale.setScalar(1.0 + Math.abs(Math.sin(t * 4 + i)) * 0.4); });
                    break;
                }
                case 'eye': {
                    // Iris darts around; eyestalks weave; periodic blink.
                    if (this.head) { this.head.rotation.x = Math.sin(t * 1.5) * 0.25; this.head.rotation.y = Math.cos(t * 1.1) * 0.3; const blink = Math.pow(Math.max(0, Math.sin(t * 0.3 * Math.PI * 2)), 14); this.head.scale.y = 1.0 - blink * 0.9; }
                    this._floaters.forEach((f, i) => { if (f.visible) f.rotation.z = (f._side || 1) * 0.6 + Math.sin(t * 2 + i) * 0.3; });
                    break;
                }
                case 'hand': {
                    // Scuttle: fingers flex in a wave; whole hand bobs.
                    this._floaters.forEach((f) => { if (f.visible) f.rotation.x = Math.sin(t * (fast ? 10 : 4) + (f._phase || 0)) * 0.4; });
                    this.model.position.y = this._baseY + Math.abs(Math.sin(t * (fast ? 8 : 3))) * 0.06 * this.scale;
                    this.model.rotation.y = Math.sin(t * 1.2) * 0.1;
                    break;
                }
                case 'grimoire': {
                    this.model.rotation.y = t * 0.4;
                    if (this.motes) this.motes.rotation.y = -t * 0.8;
                    if (this.head && this.head.children[0]) this.head.children[0].rotation.y = Math.sin(t * 2) * 0.3;
                    break;
                }
                case 'insideoutwhale': {
                    this.model.rotation.y = Math.sin(t * 0.6) * 0.1; // slow swim through matter
                    if (this.tail) this.tail.rotation.y = Math.sin(t * 1.6) * 0.4;
                    if (this.organs && this.organs._heart) { const s = 1 + Math.sin(t * (fast ? 8 : 3)) * 0.18; this.organs._heart.scale.set(s, s * 1.2, s); }
                    if (this.abyssalEye) { const blink = Math.pow(Math.max(0, Math.sin(t * 0.4 * Math.PI * 2)), 14); this.abyssalEye.scale.y = 1 - blink * 0.85; }
                    [this.tendril1, this.tendril2].forEach((td, i) => { if (td && td.visible) td.rotation.x = Math.sin(t * 2 + i) * 0.3; });
                    break;
                }
                case 'invertedangel': {
                    const flapw = Math.sin(t * (fast ? 6 : 2.2));
                    if (this.leftWing) this.leftWing.rotation.z = 0.2 + flapw * 0.5;
                    if (this.rightWing) this.rightWing.rotation.z = -0.2 - flapw * 0.5;
                    if (this.halo) this.halo.rotation.y = t * 0.5;
                    if (this.drips) this.drips.children.forEach(dr => { dr.position.y -= 0.015; if (dr.position.y < 1.9) dr.position.y = 2.4; });
                    if (this.head) this.head.rotation.z = Math.sin(t * 1.3) * 0.08;
                    break;
                }
                case 'insideoutcritter': {
                    if (this.body) { const s = 1 + Math.sin(t * (fast ? 7 : 3)) * 0.06; this.body.scale.set(1.0 * s, 0.85 / s, 1.5); } // breathe
                    if (this.organs && this.organs._heart) { const s = 1 + Math.sin(t * (fast ? 9 : 4)) * 0.2; this.organs._heart.scale.set(s, s * 1.2, s); }
                    if (this.head) this.head.rotation.x = Math.sin(t * 2) * 0.12;
                    [this.frontLeft, this.frontRight, this.rearLeft, this.rearRight].forEach((lg, i) => { if (lg) lg.rotation.x = Math.sin(t * (fast ? 8 : 4) + i * 1.5) * 0.2 * stride; });
                    break;
                }
                case 'tidesorcerer': {
                    if (this.core && this.core.material) this.core.material.emissiveIntensity = 0.8 + Math.sin(t * 4) * 0.4;
                    if (this.body) this.body.rotation.y = Math.sin(t * 0.8) * 0.12;
                    if (this.arms) this.arms.children.forEach((a, i) => { a.rotation.z = (a._side || 1) * 0.3 + Math.sin(t * (fast ? 6 : 2.4) + i) * 0.5; });
                    if (this.head) this.head.rotation.x = Math.sin(t * 1.2) * 0.1;
                    if (this._crest) this._crest.children.forEach((g, i) => { g.rotation.x = Math.sin(t * 2 + (g._phase || i)) * 0.3; g.rotation.z = Math.cos(t * 1.6 + i) * 0.2; });
                    break;
                }
                case 'timberwoodshaman': {
                    if (this.flower) this.flower.rotation.z = Math.sin(t * 1.4) * 0.08;
                    [this.vine1, this.vine2].forEach((v, i) => { if (v && v.visible) v.rotation.z = (v._side || 1) * 0.1 + Math.sin(t * (fast ? 5 : 2) + i * 1.5) * 0.25; });
                    break;
                }
                case 'toothfairy': {
                    const flap = Math.sin(t * (fast ? 22 : 16));
                    if (this.leftWing) this.leftWing.rotation.y = 0.5 + flap * 0.5;
                    if (this.rightWing) this.rightWing.rotation.y = -0.5 - flap * 0.5;
                    if (this.head) this.head.rotation.z = Math.sin(t * 2.5) * 0.12;
                    if (this.beak && fast) this.beak.rotation.z = Math.sin(t * 14) * 0.4;
                    if (this.talons) this.talons.rotation.z = Math.sin(t * 2) * 0.08;
                    break;
                }
                case 'totem': {
                    if (this.eyes) this.eyes.children.forEach(e => { if (e.material) e.material.emissiveIntensity = 0.5 + Math.sin(t * 3) * 0.3; });
                    if (this.core) this.core.rotation.y = Math.sin(t * (fast ? 4 : 1.0)) * (fast ? 0.18 : 0.06);
                    if (this.crest) this.crest.rotation.y = t * 0.3;
                    break;
                }
                case 'toxicsprayer': {
                    if (this.head) this.head.rotation.y = Math.sin(t * (fast ? 5 : 1.4)) * 0.5;
                    this.model.rotation.y = Math.sin(t * 0.6) * 0.05;
                    if (this.rightArm && this.rightArm._mist) { const s = 1 + Math.sin(t * (fast ? 10 : 4)) * 0.4; this.rightArm._mist.scale.setScalar(s); this.rightArm._mist.material.opacity = (fast ? 0.6 : 0.35) + Math.sin(t * 6) * 0.15; }
                    break;
                }
                case 'trashling': {
                    if (this.pile) { const s = 1 + Math.sin(t * (fast ? 6 : 2.5)) * 0.06; this.pile.scale.set(1.0 * s, 1.0 / s, 1.0 * s); }
                    if (this.heart && this.heart.material) this.heart.material.emissiveIntensity = 0.6 + Math.abs(Math.sin(t * 3)) * 0.6;
                    if (this.limbs) this.limbs.children.forEach(l => { if (l.visible) l.rotation.z = Math.sin(t * (fast ? 7 : 3) + (l._phase || 0)) * 0.4; });
                    break;
                }
                case 'tridenthunter': {
                    if (this.rightArm) this.rightArm.rotation.x = fast ? Math.sin(t * 9) * 0.5 - 0.3 : Math.sin(t * 1.5) * 0.1;
                    if (this.leftArm) this.leftArm.rotation.x = Math.sin(t * 1.5 + 1) * 0.1;
                    if (this.head) this.head.rotation.y = Math.sin(t * 1.1) * 0.18;
                    break;
                }
                case 'mammothcalf': {
                    if (this.trunk) this.trunk.rotation.z = Math.sin(t * (fast ? 5 : 1.8)) * 0.2;
                    if (this.head) this.head.rotation.z = Math.sin(t * 1.4) * 0.06;
                    [this.frontLeft, this.frontRight, this.hindLeft, this.hindRight].forEach((lg, i) => { if (lg) lg.rotation.x = Math.sin(t * (fast ? 6 : 2.5) + i * 1.5) * 0.18 * stride; });
                    this.model.position.y = this._baseY + Math.abs(Math.sin(t * 2)) * 0.02 * this.scale;
                    break;
                }
                case 'twilightsatyr': {
                    if (this.head) this.head.rotation.y = Math.sin(t * 1.2) * 0.2;
                    if (this.leftArm) this.leftArm.rotation.x = Math.sin(t * 2) * 0.15;
                    if (this.rightArm) this.rightArm.rotation.x = Math.sin(t * 2 + 1) * 0.15;
                    [this.leftWing, this.rightWing].forEach((lg, i) => { if (lg) lg.rotation.x = Math.sin(t * (fast ? 6 : 2.5) + i * 3) * 0.15; });
                    break;
                }
                case 'umbralbasilisk': {
                    if (this.body) { const s = 1 + Math.sin(t * (fast ? 5 : 2)) * 0.1; this.body.scale.set(1.1 * s, 0.9 / s, 1.1 * s); }
                    if (this._rim) this._rim.scale.setScalar(1 + Math.sin(t * 2) * 0.06);
                    if (this.head && this.head.children[0]) this.head.children[0].rotation.y = Math.sin(t * 1.5) * 0.4;
                    [this.leftWing, this.rightWing].forEach(w => { if (w) w.rotation.x = Math.sin(t * 2 + (w._side || 0)) * 0.2; });
                    if (this.talons) this.talons.children.forEach(td => { if (td.visible) td.rotation.x = Math.sin(t * 2 + (td._phase || 0)) * 0.25; });
                    break;
                }
                case 'vampirebat': {
                    const wf = Math.sin(t * (fast ? 16 : 10));
                    if (this.leftWing) this.leftWing.rotation.z = 0.2 + wf * 0.7;
                    if (this.rightWing) this.rightWing.rotation.z = -0.2 - wf * 0.7;
                    if (this.head) this.head.rotation.x = Math.sin(t * 2) * 0.12;
                    this.model.position.y = this._baseY + Math.sin(t * 3) * 0.1 * this.scale;
                    break;
                }
                case 'venomoussnake': {
                    const sway = Math.sin(t * (fast ? 5 : 1.8));
                    if (this.seg2) this.seg2.rotation.z = sway * 0.12;
                    if (this.head) { this.head.rotation.z = sway * 0.2; this.head.position.z = 0.3 + (fast ? Math.max(0, Math.sin(t * 8)) * 0.4 : 0); }
                    if (this.tail) this.tail.rotation.y = t * 0.2;
                    break;
                }
                case 'webweaver': {
                    if (this.legs) (this._legsArr || (this._legsArr = Object.values(this.legs))).forEach((lg, i) => { if (lg) lg.rotation.x = Math.sin(t * (fast ? 8 : 3.5) + i * 0.8) * 0.18; });
                    if (this.abdomen) { const s = 1 + Math.sin(t * 2) * 0.04; this.abdomen.scale.set(s, 0.85 * s, 1.2 * s); }
                    break;
                }
                case 'whisperwisp': {
                    if (this.core && this.core.material) this.core.material.emissiveIntensity = 0.7 + Math.sin(t * 3) * 0.4;
                    if (this.spines) { this.spines.rotation.y = t * 0.5; this.spines.children.forEach((m, i) => { m.position.y = 1.4 + Math.sin(t * 2 + i) * 0.2; }); }
                    if (this.aux) this.aux.children.forEach((s, i) => { s.position.x = Math.sin(t * 2 + i * 0.6) * 0.08; });
                    if (this.face) this.face.rotation.y = Math.sin(t * 0.7) * 0.3;
                    break;
                }
                case 'wildrabbit': {
                    const hop = Math.abs(Math.sin(t * (fast ? 7 : 3)));
                    this.model.position.y = this._baseY + hop * (fast ? 0.18 : 0.08) * this.scale;
                    if (this.ears) this.ears.rotation.x = Math.sin(t * 2.5) * 0.15;
                    if (this.head) this.head.rotation.z = Math.sin(t * 1.8) * 0.06;
                    [this.frontLeft, this.frontRight, this.rearLeft, this.rearRight].forEach((lg, i) => { if (lg) lg.rotation.x = Math.sin(t * (fast ? 7 : 3) + (i < 2 ? 0 : Math.PI)) * 0.25 * stride; });
                    break;
                }
                case 'willowisplamp': {
                    if (this.core) { this.core.scale.y = 1 + Math.sin(t * 6) * 0.2; if (this.core.material) this.core.material.emissiveIntensity = 0.7 + Math.abs(Math.sin(t * 4)) * 0.6; }
                    if (this.lamp) this.lamp.rotation.z = Math.sin(t * 1.2) * 0.06;
                    [this.leftWisp, this.rightWisp].forEach((w, i) => { if (w) { w.position.y = 1.5 + Math.sin(t * 2 + i * 2) * 0.25; w.position.x = (w._side || 1) * (0.5 + Math.sin(t * 1.3 + i) * 0.18); } });
                    break;
                }
                case 'abyssalcrab': {
                    if (this.clawLeft) this.clawLeft.rotation.y = fast ? Math.sin(t * 9) * 0.3 : Math.sin(t * 2) * 0.1;
                    if (this.clawRight) this.clawRight.rotation.y = fast ? Math.sin(t * 9 + 1) * 0.4 : Math.sin(t * 2 + 1) * 0.12;
                    if (this.antennae) this.antennae.rotation.z = Math.sin(t * 1.5) * 0.08;
                    this.model.position.x = (this.model.position.x || 0); // sidle handled by base
                    break;
                }
                case 'hallucigenia': {
                    const undulate = (grp, off) => { if (grp) grp.children.forEach((c, i) => { c.position.y += Math.sin(t * (fast ? 6 : 2.5) + i * 0.5 + off) * 0.004; }); };
                    undulate(this.thorax, 0); undulate(this.abdomen, 1.5);
                    if (this.mandibles) this.mandibles.rotation.z = Math.sin(t * (fast ? 8 : 3)) * 0.2;
                    break;
                }
                case 'abyssalhorror': {
                    if (this.core) { const s = 1 + Math.sin(t * (fast ? 5 : 2)) * 0.08; this.core.scale.set(1.1 * s, 1.2 / s, 1.0 * s); this.core.rotation.y = Math.sin(t * 0.5) * 0.2; }
                    if (this.abyssalEye) { const blink = Math.pow(Math.max(0, Math.sin(t * 0.4 * Math.PI * 2)), 14); this.abyssalEye.scale.y = 1 - blink * 0.85; }
                    if (this.maw) this.maw.scale.y = 1 + Math.sin(t * (fast ? 7 : 2.5)) * 0.25;
                    [this.tendril1, this.tendril2].forEach((td, i) => { if (td && td.visible) td.rotation.x = Math.sin(t * 2 + i) * 0.35; });
                    break;
                }
                case 'abyssaltentacler': {
                    if (this.head) this.head.rotation.z = Math.sin(t * 1.2) * 0.08;
                    [this.t1, this.t2, this.t3, this.t4].forEach((td, i) => { if (td && td.visible) { td.rotation.x = Math.sin(t * (fast ? 6 : 2.5) + i) * 0.4; td.rotation.z = (td._side || 1) * Math.sin(t * 1.5 + i) * 0.2; } });
                    if (this.bigEye) this.bigEye.rotation.y = Math.sin(t * 1.1) * 0.2;
                    break;
                }
                case 'acidbombardier': {
                    if (this.legs) (this._legsArr || (this._legsArr = Object.values(this.legs))).forEach((lg, i) => { if (lg) lg.rotation.x = Math.sin(t * (fast ? 9 : 4) + i * 1.0) * 0.2; });
                    if (this.mandibles) this.mandibles.rotation.x = Math.sin(t * (fast ? 8 : 3)) * 0.2;
                    if (this.acid && this.acid.material) { const s = 1 + Math.sin(t * (fast ? 10 : 4)) * 0.4; this.acid.scale.setScalar(s); this.acid.material.opacity = (fast ? 0.7 : 0.5) + Math.sin(t * 5) * 0.2; }
                    break;
                }
                case 'acidictidecaller': {
                    if (this.head) { this.head.position.z = 0.62 + Math.sin(t * 1.5) * 0.06; this.head.rotation.x = Math.sin(t * 2) * 0.08; }
                    [this.frontLeft, this.frontRight, this.rearLeft, this.rearRight].forEach((lg, i) => { if (lg) lg.rotation.x = Math.sin(t * (fast ? 5 : 2.5) + i * 1.5) * 0.18 * stride; });
                    if (this.shell) this.shell.children.forEach((c, i) => { if (i > 0 && c.material) c.material.emissiveIntensity = 0.4 + Math.abs(Math.sin(t * 2 + i)) * 0.5; });
                    break;
                }
                case 'airelemental': {
                    if (this.upper) this.upper.rotation.y = t * (fast ? 5 : 2.5);
                    if (this.lower) this.lower.rotation.y = -t * (fast ? 4 : 2.0);
                    if (this.core && this.core.material) this.core.material.emissiveIntensity = 0.7 + Math.sin(t * 5) * 0.4;
                    [this.leftApp, this.rightApp].forEach(a => { if (a) a.rotation.z = Math.sin(t * 3 + (a._side || 0)) * 0.3; });
                    break;
                }
                case 'ancientdragon': {
                    const flap = Math.sin(t * (fast ? 5 : 1.8));
                    if (this.leftWing) this.leftWing.rotation.z = 0.2 + flap * 0.4;
                    if (this.rightWing) this.rightWing.rotation.z = -0.2 - flap * 0.4;
                    if (this.neck) this.neck.rotation.x = Math.sin(t * 1.2) * 0.08;
                    if (this.head && this.head._jaw) this.head._jaw.position.y = -0.12 - (fast ? Math.abs(Math.sin(t * 7)) * 0.12 : 0);
                    if (this.breathOrgan && this.breathOrgan.material) this.breathOrgan.material.emissiveIntensity = (fast ? 1.4 : 0.5) + Math.sin(t * 6) * 0.4;
                    if (this.tail) this.tail.rotation.y = Math.sin(t * 1.0) * 0.18;
                    break;
                }
                case 'anguishphantom': {
                    if (this.face) this.face.rotation.z = Math.sin(t * 1.5) * 0.1;
                    [this.leftWisp, this.rightWisp].forEach((w, i) => { if (w) w.rotation.z = (w._side || 1) * 0.2 + Math.sin(t * 2 + i) * 0.4; });
                    if (this.core) this.core.rotation.y = Math.sin(t * 0.6) * 0.1;
                    break;
                }
                case 'aquaticelemental': {
                    if (this.body) { const s = 1 + Math.sin(t * (fast ? 5 : 2.2)) * 0.08; this.body.scale.set(1.0 * s, 1.2 / s, 1.0 * s); this.body.rotation.y = Math.sin(t * 0.7) * 0.15; }
                    if (this.core && this.core.material) this.core.material.emissiveIntensity = 0.7 + Math.sin(t * 4) * 0.4;
                    if (this.arms) this.arms.children.forEach((a, i) => { a.rotation.z = (a._side || 1) * 0.3 + Math.sin(t * (fast ? 6 : 2.4) + i) * 0.5; });
                    break;
                }
                case 'aquaticmantis': {
                    if (this.head) this.head.rotation.y = Math.sin(t * 1.2) * 0.2;
                    ['LEFT_LEG', 'RIGHT_LEG'].forEach((k, i) => { const a = this.legs && this.legs[k]; if (a) a.rotation.x = fast ? Math.sin(t * 9 + i) * 0.4 - 0.2 : Math.sin(t * 1.5 + i) * 0.12; });
                    if (this.abdomen) this.abdomen.rotation.x = Math.sin(t * 1.5) * 0.08;
                    break;
                }
                case 'assassinwasp': {
                    if (this.wings) this.wings.children.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * (0.3 + Math.sin(t * 30) * 0.3); });
                    if (this.abdomen) this.abdomen.rotation.x = Math.sin(t * (fast ? 6 : 2)) * 0.15 - (fast ? 0.2 : 0);
                    if (this.legs) (this._legsArr || (this._legsArr = Object.values(this.legs))).forEach((lg, i) => { if (lg) lg.rotation.x = Math.sin(t * 3 + i) * 0.12; });
                    break;
                }
                case 'reptilian': {
                    if (this.head) this.head.rotation.y = Math.sin(t * 1.1) * 0.15;
                    if (this.tail) this.tail.rotation.y = Math.sin(t * (fast ? 4 : 1.6)) * 0.25;
                    if (this.profile.biped) { [this.leftArm, this.rightArm].forEach((a, i) => { if (a) a.rotation.x = fast ? Math.sin(t * 8 + i) * 0.4 : Math.sin(t * 1.5 + i) * 0.12; }); }
                    else { [this.leftArm, this.rightArm, this.leftLeg, this.rightLeg].forEach((lg, i) => { if (lg) lg.rotation.x = Math.sin(t * (fast ? 6 : 2.5) + i * 1.5) * 0.15; }); }
                    if (this._emberThroat && this._emberThroat.material) this._emberThroat.material.emissiveIntensity = 0.6 + Math.abs(Math.sin(t * 3)) * 0.6;
                    break;
                }
                case 'bloodwidow': {
                    if (this.head) this.head.rotation.z = Math.sin(t * 1.5) * 0.1;
                    [this.leftArm, this.rightArm].forEach((a, i) => { if (a) a.rotation.x = fast ? Math.sin(t * 8 + i) * 0.4 : Math.sin(t * 1.5 + i) * 0.12; });
                    if (this.legs) (this._legsArr || (this._legsArr = Object.values(this.legs))).forEach((lg, i) => { if (lg) lg.rotation.x = Math.sin(t * (fast ? 7 : 3) + i * 0.8) * 0.12; });
                    break;
                }
                case 'bogelemental': {
                    if (this.upper) { const s = 1 + Math.sin(t * (fast ? 4 : 1.8)) * 0.05; this.upper.scale.set(s, 1 / s, s); }
                    if (this.core && this.core.material) this.core.material.emissiveIntensity = 0.5 + Math.abs(Math.sin(t * 2)) * 0.5;
                    [this.leftApp, this.rightApp].forEach(a => { if (a) a.rotation.z = (a._side || 1) * 0.1 + Math.sin(t * (fast ? 5 : 2) + (a._side || 0)) * 0.3; });
                    break;
                }
                case 'bogmutant': {
                    if (this.mass) { const s = 1 + Math.sin(t * (fast ? 5 : 2.2)) * 0.05; this.mass.scale.set(1.2 * s, 1.0 / s, 0.9 * s); }
                    if (this.eyeCluster) this.eyeCluster.rotation.y = Math.sin(t * 1.2) * 0.3;
                    if (this.extra1) this.extra1.rotation.x = fast ? Math.sin(t * 8) * 0.4 : Math.sin(t * 1.5) * 0.12;
                    if (this.extra2) this.extra2.rotation.z = (this.extra2._side || 1) * 0.2 + Math.sin(t * 2.5) * 0.3;
                    if (this.tailSpike) this.tailSpike.rotation.y = Math.sin(t * (fast ? 6 : 2)) * 0.2;
                    break;
                }
                case 'brinewisp': {
                    if (this.body) { const s = 1 + Math.sin(t * (fast ? 6 : 2.5)) * 0.08; this.body.scale.set(s, 1.2 / s, s); }
                    if (this.core && this.core.material) this.core.material.emissiveIntensity = 0.7 + Math.sin(t * 4) * 0.4;
                    if (this.arms) this.arms.children.forEach((a, i) => { a.rotation.z = -((a._side || 1)) * Math.PI / 2; const jet = a.children[1]; if (jet && jet.material) jet.material.opacity = (fast ? 0.6 : 0.35) + Math.sin(t * 8 + i * 3) * 0.2; });
                    break;
                }
                case 'theropod': {
                    this.model.rotation.x = Math.sin(t * (fast ? 4 : 1.2)) * 0.04;
                    if (this.head) { this.head.rotation.x = 0.1 + Math.sin(t * 1.3) * 0.08; if (this.head._jaw) this.head._jaw.position.y = -0.17 - (fast ? Math.abs(Math.sin(t * 8)) * 0.12 : 0); }
                    if (this.tail) this.tail.rotation.y = Math.sin(t * (fast ? 4 : 1.4)) * 0.2;
                    [this.leftLeg, this.rightLeg].forEach((lg, i) => { if (lg) lg.rotation.x = Math.sin(t * (fast ? 6 : 1.6) + i * Math.PI) * 0.12; });
                    [this.leftArm, this.rightArm].forEach((a, i) => { if (a) a.rotation.x = Math.sin(t * 3 + i) * 0.2; });
                    break;
                }
                case 'chainfury': {
                    if (this.mandibles) this.mandibles.rotation.z = Math.sin(t * (fast ? 8 : 3)) * 0.2;
                    if (this.legs) (this._legsArr || (this._legsArr = Object.values(this.legs))).forEach((lg, i) => { if (lg) lg.rotation.x = Math.sin(t * (fast ? 8 : 3.5) + i * 0.8) * 0.16; });
                    if (this.abdomen) { const s = 1 + Math.sin(t * 2) * 0.04; this.abdomen.scale.set(s, 0.9 * s, 1.3 * s); }
                    break;
                }
                case 'beast': {
                    if (this.head) this.head.rotation.y = Math.sin(t * 1.2) * 0.15;
                    if (this._mane && this.profile.maneRainbow) this._mane.rotation.z = t * 0.4;
                    if (this._extraHeads) this._extraHeads.forEach((eh, i) => { eh.rotation.z = Math.sin(t * 2 + i * 2) * 0.12; });
                    [this.frontLeft, this.frontRight, this.rearLeft, this.rearRight].forEach((lg, i) => { if (lg) lg.rotation.x = Math.sin(t * (fast ? 7 : 3) + (i < 2 ? 0 : Math.PI)) * 0.18 * stride; });
                    if (this.tail) this.tail.rotation.y = Math.sin(t * (fast ? 5 : 2)) * 0.2;
                    if (this.leftWing) this.leftWing.rotation.z = 0.2 + Math.sin(t * 2) * 0.2;
                    if (this.rightWing) this.rightWing.rotation.z = -0.2 - Math.sin(t * 2) * 0.2;
                    break;
                }
                case 'cinderweaver': {
                    if (this.legs) (this._legsArr || (this._legsArr = Object.values(this.legs))).forEach((lg, i) => { if (lg) lg.rotation.x = Math.sin(t * (fast ? 8 : 3.5) + i * 0.8) * 0.18; });
                    if (this.spinnerets && this.spinnerets.material) this.spinnerets.material.emissiveIntensity = 0.5 + Math.abs(Math.sin(t * 3)) * 0.6;
                    break;
                }
                case 'hellhound': {
                    if (this.head) this.head.rotation.x = Math.sin(t * 1.5) * 0.08;
                    [this.frontLeft, this.frontRight, this.hindLeft, this.hindRight].forEach((lg, i) => { if (lg) lg.rotation.x = Math.sin(t * (fast ? 8 : 3.5) + (i < 2 ? 0 : Math.PI)) * 0.2 * stride; });
                    break;
                }
                case 'cloudgiant': {
                    if (this.body) this.body.rotation.y = Math.sin(t * 0.5) * 0.12;
                    if (this.core && this.core.material) this.core.material.emissiveIntensity = 0.7 + Math.sin(t * 6) * 0.5;
                    [this.leftArm, this.rightArm, this.leftLeg, this.rightLeg].forEach((b, i) => { if (b && b.children) b.children.forEach(seg => { if (seg.material) seg.material.emissiveIntensity = 0.4 + Math.abs(Math.sin(t * 8 + i)) * 0.8; }); });
                    break;
                }
                case 'combatdrone': {
                    [this.leftProp, this.rightProp].forEach(r => { if (r && r._blades) r._blades.rotation.y += (fast ? 1.2 : 0.8); });
                    if (this.sensor) this.sensor.rotation.y = Math.sin(t * (fast ? 4 : 1.4)) * 0.4;
                    this.model.position.y = this._baseY + Math.sin(t * 2.5) * 0.06 * this.scale;
                    if (this.chassis) this.chassis.rotation.x = (fast ? -0.15 : 0) + Math.sin(t * 2) * 0.03;
                    break;
                }
                case 'coralturtle': {
                    if (this.head) this.head.position.z = 0.66 + Math.sin(t * 1.5) * 0.05;
                    [this.frontLeft, this.frontRight, this.rearLeft, this.rearRight].forEach((lg, i) => { if (lg) lg.rotation.x = Math.sin(t * (fast ? 5 : 2.5) + i * 1.5) * 0.18 * stride; });
                    if (this.stormOrbs) { this.stormOrbs.rotation.y = t * (fast ? 2.5 : 1.2); this.stormOrbs.children.forEach((o, i) => { if (o.material) o.material.emissiveIntensity = 0.4 + Math.abs(Math.sin(t * 3 + i)) * 0.6; }); }
                    break;
                }
                case 'bioslave': {
                    if (this.mass) { const s = 1 + Math.sin(t * (fast ? 5 : 2.2)) * 0.05; this.mass.scale.set(1.1 * s, 1.1 / s, 0.95 * s); }
                    if (this.eyeCluster) this.eyeCluster.rotation.y = Math.sin(t * 1.2) * 0.3;
                    [this.extra1, this.extra2].forEach((e, i) => { if (e) e.rotation.z = (e._side || 1) * 0.2 + Math.sin(t * 2.5 + i) * 0.35; });
                    if (this.tailSpike) this.tailSpike.rotation.y = Math.sin(t * (fast ? 6 : 2)) * 0.2;
                    break;
                }
                case 'crystalentity': {
                    if (this.core) this.core.rotation.y = Math.sin(t * 0.6) * 0.12;
                    if (this.focusGem) { this.focusGem.rotation.y = t * 1.2; if (this.focusGem.material) this.focusGem.material.emissiveIntensity = 0.7 + Math.sin(t * 4) * 0.4; }
                    if (this.shieldCrystal) { this.shieldCrystal.rotation.y = t * (fast ? 2.5 : 1.0); this.shieldCrystal.children.forEach((s, i) => { s.position.y = 1.2 + Math.sin(t * 2 + i) * 0.15; }); }
                    break;
                }
                case 'serpent': {
                    const sway = Math.sin(t * (fast ? 5 : 1.8));
                    if (this.seg2) this.seg2.rotation.z = sway * 0.12;
                    if (this.head) { this.head.rotation.z = sway * 0.2; this.head.position.z = 0.3 + (fast ? Math.max(0, Math.sin(t * 8)) * 0.4 : 0); }
                    if (this.tail) this.tail.rotation.y = t * 0.2;
                    break;
                }
                case 'crystalturtle': {
                    if (this.head) this.head.position.z = 0.66 + Math.sin(t * 1.5) * 0.05;
                    [this.frontLeft, this.frontRight, this.rearLeft, this.rearRight].forEach((lg, i) => { if (lg) lg.rotation.x = Math.sin(t * (fast ? 5 : 2.5) + i * 1.5) * 0.18 * stride; });
                    if (this.shell) this.shell.rotation.y = Math.sin(t * 0.8) * 0.05;
                    break;
                }
                case 'eldertreant': {
                    if (this.flower) this.flower.rotation.y = Math.sin(t * 0.5) * 0.06;
                    [this.vine1, this.vine2].forEach((v, i) => { if (v && v.visible) v.rotation.z = (v._side || 1) * 0.1 + Math.sin(t * (fast ? 4 : 1.6) + i * 1.5) * 0.25; });
                    break;
                }
                case 'electrospider': {
                    if (this.legs) (this._legsArr || (this._legsArr = Object.values(this.legs))).forEach((lg, i) => { if (lg) lg.rotation.x = Math.sin(t * (fast ? 8 : 3.5) + i * 0.8) * 0.18; });
                    if (this.arcs) this.arcs.children.forEach((n, i) => { if (n.material) n.material.emissiveIntensity = 0.4 + Math.abs(Math.sin(t * 10 + i * 2)) * 0.9; });
                    if (this.spinnerets && this.spinnerets.material) this.spinnerets.material.emissiveIntensity = 0.5 + Math.sin(t * 7) * 0.4;
                    break;
                }
                case 'tickswarm': {
                    if (this.thorax) { const s = 1 + Math.sin(t * (fast ? 5 : 2.2)) * 0.05; this.thorax.scale.set(s, s, s); }
                    if (this._ticks) this._ticks.forEach((tk, i) => { tk.position.y += Math.sin(t * 4 + i) * 0.003; });
                    if (this.mandibles) this.mandibles.rotation.z = Math.sin(t * (fast ? 8 : 3)) * 0.2;
                    if (this.legs) (this._legsArr || (this._legsArr = Object.values(this.legs))).forEach((lg, i) => { if (lg) lg.rotation.x = Math.sin(t * (fast ? 8 : 4) + i) * 0.15; });
                    break;
                }
                case 'fireelemental': {
                    if (this.body) this.body.children.forEach((fl, i) => { fl.scale.y = 1 + Math.sin(t * (fast ? 12 : 7) + i) * 0.18; fl.rotation.y = t * 0.6 + i; });
                    if (this.core && this.core.material) this.core.material.emissiveIntensity = 0.7 + Math.sin(t * 8) * 0.4;
                    if (this.arms) this.arms.children.forEach((a, i) => { a.rotation.z = (a._side || 1) * 0.2 + Math.sin(t * (fast ? 8 : 4) + i) * 0.4; });
                    break;
                }
                case 'centipede': {
                    const undulate = (grp, off) => { if (grp) grp.children.forEach((c, i) => { c.position.y += Math.sin(t * (fast ? 7 : 3) + i * 0.5 + off) * 0.004; }); };
                    undulate(this.thorax, 0); undulate(this.abdomen, 1.5);
                    if (this.mandibles) this.mandibles.rotation.z = Math.PI / 2 + Math.sin(t * (fast ? 8 : 3)) * 0.2;
                    break;
                }
                case 'scarab': {
                    if (this.legs) (this._legsArr || (this._legsArr = Object.values(this.legs))).forEach((lg, i) => { if (lg) lg.rotation.x = Math.sin(t * (fast ? 9 : 4) + i * 1.0) * 0.2; });
                    if (this.head) this.head.rotation.x = Math.sin(t * 1.5) * 0.1;
                    if (this.abdomen) this.abdomen.children.forEach((c, i) => { if (i > 1 && c.material) c.material.emissiveIntensity = 0.4 + Math.abs(Math.sin(t * 2 + i)) * 0.5; });
                    break;
                }
                case 'frostslime': {
                    if (this.lower) { const s = 1 + Math.sin(t * (fast ? 5 : 2.2)) * 0.06; this.lower.scale.set(1.2 * s, 0.7 / s, 1.1 * s); }
                    if (this.upper) { const s = 1 + Math.sin(t * (fast ? 5 : 2.2) + 0.6) * 0.06; this.upper.scale.set(s, 0.9 / s, s); }
                    if (this.core && this.core.material) this.core.material.emissiveIntensity = 0.6 + Math.sin(t * 3) * 0.4;
                    [this.pseudo1, this.pseudo2].forEach((pd, i) => { if (pd) pd.rotation.z = (pd._side || 1) * 0.2 + Math.sin(t * 3 + i) * 0.3; });
                    break;
                }
                case 'gatorghast': {
                    if (this.maw && this.maw._lower) this.maw._lower.position.y = 0.95 - (fast ? Math.abs(Math.sin(t * 7)) * 0.18 : Math.abs(Math.sin(t * 1.5)) * 0.06);
                    if (this.heart && this.heart.material) this.heart.material.emissiveIntensity = 0.5 + Math.abs(Math.sin(t * 3)) * 0.6;
                    if (this.tentacles) this.tentacles.children.forEach((td, i) => { td.rotation.x = Math.sin(t * 2 + i) * 0.3; });
                    this.model.rotation.y = Math.sin(t * 0.5) * 0.06;
                    break;
                }
                case 'snail': {
                    if (this.head) { this.head.rotation.y = Math.sin(t * 0.8) * 0.2; this.head.children.forEach(c => { if (c.geometry && c.geometry.type === 'CylinderGeometry') c.rotation.z = Math.sin(t * 1.5) * 0.15; }); }
                    if (this.body) this.body.rotation.z = Math.sin(t * 1.0) * 0.04;
                    break;
                }
                case 'segmentworm': {
                    const undulate = (grp, off) => { if (grp) grp.children.forEach((c, i) => { c.position.y += Math.sin(t * (fast ? 6 : 2.5) + i * 0.5 + off) * 0.005; }); };
                    undulate(this.bodySeg, 0); undulate(this.tail, 1.5);
                    if (this.head) this.head.rotation.z = Math.sin(t * (fast ? 7 : 3)) * 0.2;
                    if (this.heartSeg && this.heartSeg.material) this.heartSeg.material.emissiveIntensity = 0.5 + Math.abs(Math.sin(t * 2)) * 0.5;
                    break;
                }
                case 'harpybanshee': {
                    const flap = Math.sin(t * (fast ? 8 : 4));
                    if (this.wings) this.wings.children.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * (0.8 + flap * 0.5); });
                    if (this.face) { this.face.rotation.z = Math.sin(t * 1.5) * 0.08; const mo = this.face.children[3]; if (mo) mo.scale.y = 1.6 + (fast ? Math.abs(Math.sin(t * 9)) * 1.2 : 0); }
                    [this.leftWisp, this.rightWisp].forEach((w, i) => { if (w) w.rotation.z = (w._side || 1) * 0.2 + Math.sin(t * 3 + i) * 0.3; });
                    break;
                }
                case 'dryad': {
                    if (this.crown) this.crown.children.forEach((fl, i) => { if (fl.material) fl.material.emissiveIntensity = 0.5 + Math.abs(Math.sin(t * 4 + i)) * 0.6; });
                    [this.branch1, this.branch2].forEach((b, i) => { if (b) b.rotation.z = (b._side || 1) * 0.1 + Math.sin(t * (fast ? 4 : 1.6) + i * 1.5) * 0.25; });
                    break;
                }
                case 'termite': {
                    if (this._termites) this._termites.forEach((tm, i) => { tm.position.x += Math.sin(t * 5 + i) * 0.002; tm.position.y += Math.cos(t * 5 + i) * 0.002; });
                    if (this.mandibles) this.mandibles.rotation.z = Math.sin(t * (fast ? 8 : 3)) * 0.2;
                    if (this.legs) (this._legsArr || (this._legsArr = Object.values(this.legs))).forEach((lg, i) => { if (lg) lg.rotation.x = Math.sin(t * (fast ? 7 : 3) + i) * 0.15; });
                    break;
                }
                case 'hydroengine': {
                    if (this.head) this.head.rotation.y = Math.sin(t * (fast ? 4 : 1.4)) * 0.4;
                    if (this.tank && this.tank.material) this.tank.material.emissiveIntensity = 0.4 + Math.sin(t * 4) * 0.3;
                    [this.leftArm, this.rightArm].forEach((a, i) => { if (a && a._jet && a._jet.material) a._jet.material.opacity = (fast ? 0.6 : 0.3) + Math.sin(t * 8 + i * 3) * 0.2; });
                    break;
                }
                case 'ironhorse': {
                    [this.leftArm, this.rightArm, this.leftLeg, this.rightLeg].forEach((lg, i) => { if (lg) lg.rotation.x = Math.sin(t * (fast ? 8 : 3.5) + (i % 2 ? Math.PI : 0)) * 0.22; });
                    if (this.head) this.head.rotation.x = Math.sin(t * 1.4) * 0.08;
                    if (this.tail) this.tail.children.forEach((s, i) => { if (s.material) s.material.emissiveIntensity = 0.4 + Math.abs(Math.sin(t * 6 + i)) * 0.6; });
                    break;
                }
                case 'tentacledcreature': {
                    if (this.body) { const s = 1 + Math.sin(t * (fast ? 5 : 2)) * 0.1; this.body.scale.set(1.1 * s, 1.0 / s, 1.1 * s); }
                    if (this.eye && this.eye.material) this.eye.material.emissiveIntensity = 0.6 + Math.sin(t * 4) * 0.4;
                    if (this._rim) this._rim.scale.setScalar(1 + Math.sin(t * 2) * 0.06);
                    [this.t1, this.t2].forEach((td, i) => { if (td) td.children.forEach((sub, j) => { sub.rotation.x = Math.sin(t * 2 + i + j) * 0.25; }); });
                    break;
                }
                case 'chestmimic': {
                    if (this.lid) this.lid.rotation.x = -0.7 + (fast ? Math.abs(Math.sin(t * 8)) * 0.5 : Math.sin(t * 2) * 0.12);
                    if (this.tongue) this.tongue.rotation.x = 0.3 + Math.sin(t * (fast ? 7 : 3)) * 0.15;
                    if (this.feet) this.feet.children.forEach((f, i) => { f.position.y = 0.32 + Math.abs(Math.sin(t * (fast ? 8 : 4) + i * Math.PI)) * 0.06; });
                    break;
                }
                case 'fungoid': {
                    if (this.cap) this.cap.rotation.z = Math.sin(t * 1.5) * 0.08;
                    this.model.position.y = this._baseY + Math.abs(Math.sin(t * (fast ? 5 : 2))) * 0.04 * this.scale;
                    if (this.sporeSacs) this.sporeSacs.children.forEach((s, i) => { if (s.material) s.material.emissiveIntensity = 0.4 + Math.abs(Math.sin(t * 3 + i)) * 0.5; });
                    break;
                }
                case 'hydra': {
                    [this.head1, this.head2, this.head3].forEach((h, i) => { if (h) { h.rotation.z = -(h._x || 0) * 0.3 + Math.sin(t * (fast ? 5 : 2) + i * 1.5) * 0.18; h.rotation.x = Math.sin(t * 1.4 + i) * 0.1; } });
                    if (this.tail) this.tail.rotation.y = Math.sin(t * (fast ? 4 : 1.6)) * 0.2;
                    break;
                }
                case 'bacteria': {
                    if (this.membrane) { const s = 1 + Math.sin(t * (fast ? 5 : 2.2)) * 0.08; this.membrane.scale.set(1.1 * s, 1.0 / s, 1.0 * s); }
                    if (this.nucleus && this.nucleus.material) this.nucleus.material.emissiveIntensity = 0.6 + Math.sin(t * 4) * 0.4;
                    if (this.flagellum) this.flagellum.children.forEach((fl, i) => { fl.rotation.x = Math.sin(t * (fast ? 8 : 4) + i) * 0.4; });
                    if (this.toxinSacs) this.toxinSacs.rotation.y = Math.sin(t * 0.8) * 0.2;
                    break;
                }
                case 'phoenix': {
                    const flap = Math.sin(t * (fast ? 8 : 4));
                    if (this.leftWing) this.leftWing.rotation.z = 0.2 + flap * 0.5;
                    if (this.rightWing) this.rightWing.rotation.z = -0.2 - flap * 0.5;
                    if (this.feathers) this.feathers.children.forEach((fl, i) => { if (fl.material) fl.material.emissiveIntensity = 0.5 + Math.abs(Math.sin(t * 5 + i)) * 0.6; });
                    this.model.position.y = this._baseY + Math.sin(t * 2.5) * 0.1 * this.scale;
                    break;
                }
                case 'turret': {
                    const sweep = Math.sin(t * (fast ? 3 : 1)) * 0.5;
                    if (this.core) this.core.rotation.y = sweep;
                    if (this.gunBarrel) { this.gunBarrel.rotation.y = sweep; if (this.gunBarrel._muzzle && this.gunBarrel._muzzle.material) this.gunBarrel._muzzle.material.emissiveIntensity = (fast ? 1.4 : 0.5) + Math.sin(t * 6) * 0.4; }
                    if (this.sensorArray) this.sensorArray.rotation.y = sweep;
                    if (this.ammoChamber) this.ammoChamber.rotation.x += fast ? 0.3 : 0.1;
                    break;
                }
                case 'ophanim': {
                    const sp = fast ? 2.2 : 1;
                    if (this._ophWheels) this._ophWheels.forEach(w => { w.rotation.z += w._spin * 0.02 * sp; });
                    if (this.eyeRing) this.eyeRing.rotation.y = t * 0.6;
                    if (this.core && this.core.material) this.core.material.emissiveIntensity = (fast ? 1.3 : 0.6) + Math.sin(t * 4) * 0.4;
                    this.model.position.y = this._baseY + Math.sin(t * 1.6) * 0.08 * this.scale;
                    break;
                }
                case 'sacredelemental': {
                    if (this.core && this.core.material) this.core.material.emissiveIntensity = 0.7 + Math.sin(t * 4) * 0.4;
                    if (this.halo) this.halo.rotation.z = t * 0.8;
                    if (this.body) this.body.rotation.y = Math.sin(t * 0.8) * 0.1;
                    [this.leftArm, this.rightArm].forEach((a, i) => { if (a) a.rotation.z = (a._side || 1) * 0.2 + Math.sin(t * (fast ? 6 : 2.4) + i) * 0.4; });
                    break;
                }
                case 'seahorse': {
                    if (this.body) this.body.rotation.z = Math.sin(t * 1.2) * 0.06;
                    if (this.tailFin) this.tailFin.rotation.y = Math.sin(t * (fast ? 5 : 2)) * 0.2;
                    [this.leftFin, this.rightFin].forEach((f, i) => { if (f) f.rotation.z = Math.sin(t * (fast ? 14 : 9) + i) * 0.4; });
                    this.model.position.y = this._baseY + Math.sin(t * 1.6) * 0.06 * this.scale;
                    break;
                }
                case 'fishschool': {
                    if (this._fish) this._fish.forEach((f, i) => { const a = (f._a || 0) + t * (fast ? 1.4 : 0.7) * (i % 2 ? 1 : -1); f.position.x = Math.cos(a) * (f._r || 0.5); f.position.z = Math.sin(a) * (f._r || 0.5); f.position.y = 1.3 + Math.sin(t * 2 + (f._phase || 0)) * 0.3; f.rotation.y = -a; });
                    break;
                }
                case 'spikymonster': {
                    if (this.body) this.body.rotation.y = Math.sin(t * 1.2) * 0.15;
                    if (this.spikes) this.spikes.rotation.y = Math.sin(t * (fast ? 4 : 1.5)) * 0.1;
                    this.model.position.y = this._baseY + Math.abs(Math.sin(t * (fast ? 5 : 2))) * 0.04 * this.scale;
                    break;
                }
                case 'scorpion': {
                    if (this.tail) this.tail.children.forEach((s, i) => { s.position.x = Math.sin(t * (fast ? 5 : 2) + i * 0.4) * 0.04; });
                    if (this.stinger) this.stinger.position.y = 1.62 + (fast ? Math.abs(Math.sin(t * 7)) * 0.15 : 0);
                    [this.pincerLeft, this.pincerRight].forEach((pc, i) => { if (pc) pc.rotation.y = Math.sin(t * (fast ? 6 : 2.5) + i) * 0.2; });
                    if (this.legs) (this._legsArr || (this._legsArr = Object.values(this.legs))).forEach((lg, i) => { if (lg) lg.rotation.x = Math.sin(t * (fast ? 8 : 3.5) + i * 0.7) * 0.14; });
                    break;
                }
                case 'gorgon': {
                    if (this.head) this.head.rotation.y = Math.sin(t * 1.1) * 0.25;
                    if (this.snakeHair) this.snakeHair.children.forEach((s, i) => { s.rotation.x = Math.cos(s._a || 0) * 0.5 + Math.sin(t * (fast ? 6 : 3) + i) * 0.3; });
                    if (this.eyes && this.eyes.children) this.eyes.children.forEach(e => { if (e.children && e.children[0] && e.children[0].material) e.children[0].material.emissiveIntensity = 0.5 + Math.abs(Math.sin(t * 2)) * 0.6; });
                    [this.leftArm, this.rightArm].forEach((a, i) => { if (a) a.rotation.x = Math.sin(t * 1.5 + i) * 0.12; });
                    break;
                }
            }
        }

        deathPose(deltaTime) {
            const t = this.animTime;
            const prog = Math.min(1.0, t / 1.2);
            for (const mat of this._materials) mat.opacity = Math.min(mat.opacity, 1.0 - prog);
            if (this._baseY === null) this._baseY = this.model.position.y;
            this.model.position.y = this._baseY - prog * 0.5 * this.scale;
            this.model.rotation.z = prog * (this.variant === 'marionette' ? 1.4 : 0.7);
        }
    }

    const make = (scale, offsetY, enemy, weaponType, key) =>
        new OddityBattler3D(scale, offsetY, enemy, weaponType, key);

    const reg = window.Battler3D.registerArchetype;
    const S = O_PROFILES;
    reg('marionette',   { aliases: ['marionette', 'puppet', 'doll', 'mannequin', 'dummy'], scale: S.marionette.scale, weapon: 0, create: make });
    reg('warmachine',   { aliases: ['warmachine', 'mech', 'tank', 'arsenal', 'bulwark'], scale: S.warmachine.scale, weapon: 0, create: make });
    ['mar_phantom','mar_twisted','mar_haunted','mar_mannequin','mar_backwards','mar_stringbound','mar_meatpuppet','mar_boneorchestra','mar_puppetcorpse','mar_babydoll',
     'wm_assault','wm_battlemech','wm_battlemechep','wm_arsenal','wm_tank','wm_cogwork','wm_ironbastion','wm_marauder','wm_veteranbot'].forEach(k => reg(k, { aliases: [k], scale: S[k].scale, weapon: 0, create: make }));
    ["sb_backalleybot","sb_conscriptautomaton","sb_disgracedbot","sb_scrapbot","sb_renegadebot","sb_maskedbot","sb_salvagedautomaton","sb_scrapautomaton","sb_grizzledbot","sb_twitchysapper","sb_twitchydrone","sb_renegadedrone","sb_twitchybot","sb_mercenarydrone"].forEach(k => reg(k, { aliases: [k], scale: S[k].scale, weapon: 0, create: make }));
    reg('grimoire',     { aliases: ['grimoire', 'grimorie', 'spellbook', 'tome', 'codex'], scale: S.grimoire.scale, weapon: 0, create: make });
    // Narrow aliases (key only) so name tokens like "angel"/"whale" can't hijack
    // unrelated enemies; the actual enemies are pinned by exact name below.
    reg('insideoutwhale',   { aliases: ['insideoutwhale'],   scale: S.insideoutwhale.scale,   weapon: 0, create: make });
    reg('invertedangel',    { aliases: ['invertedangel'],    scale: S.invertedangel.scale,    weapon: 0, create: make });
    reg('insideoutcritter', { aliases: ['insideoutcritter'], scale: S.insideoutcritter.scale, weapon: 0, create: make });
    // Batch 5 (IDs 361-380). Narrow aliases (key only) so common name tokens
    // can't hijack unrelated enemies; the real enemies are pinned by exact name.
    reg('tidesorcerer',     { aliases: ['tidesorcerer'],     scale: S.tidesorcerer.scale,     weapon: 0, create: make });
    reg('timberwoodshaman', { aliases: ['timberwoodshaman'], scale: S.timberwoodshaman.scale, weapon: 0, create: make });
    reg('toothfairy',       { aliases: ['toothfairy'],       scale: S.toothfairy.scale,       weapon: 0, create: make });
    reg('totemguardian',    { aliases: ['totemguardian'],    scale: S.totemguardian.scale,    weapon: 0, create: make });
    reg('toteminitiate',    { aliases: ['toteminitiate'],    scale: S.toteminitiate.scale,    weapon: 0, create: make });
    reg('toxicsprayer',     { aliases: ['toxicsprayer'],     scale: S.toxicsprayer.scale,     weapon: 0, create: make });
    reg('trashling',        { aliases: ['trashling'],        scale: S.trashling.scale,        weapon: 0, create: make });
    reg('tridenthunter',    { aliases: ['tridenthunter'],    scale: S.tridenthunter.scale,    weapon: 0, create: make });
    reg('mammothcalf',      { aliases: ['mammothcalf'],      scale: S.mammothcalf.scale,      weapon: 0, create: make });
    reg('twilightsatyr',    { aliases: ['twilightsatyr'],    scale: S.twilightsatyr.scale,    weapon: 0, create: make });
    reg('umbralbasilisk',   { aliases: ['umbralbasilisk'],   scale: S.umbralbasilisk.scale,   weapon: 0, create: make });
    reg('vampirebat',       { aliases: ['vampirebat'],       scale: S.vampirebat.scale,       weapon: 0, create: make });
    // Batch 6 (IDs 382-420).
    reg('venomoussnake',    { aliases: ['venomoussnake'],    scale: S.venomoussnake.scale,    weapon: 0, create: make });
    reg('webweaver',        { aliases: ['webweaver'],        scale: S.webweaver.scale,        weapon: 0, create: make });
    reg('whisperwisp',      { aliases: ['whisperwisp'],      scale: S.whisperwisp.scale,      weapon: 0, create: make });
    reg('wildrabbit',       { aliases: ['wildrabbit'],       scale: S.wildrabbit.scale,       weapon: 0, create: make });
    reg('willowisplamp',    { aliases: ['willowisplamp'],    scale: S.willowisplamp.scale,    weapon: 0, create: make });
    reg('abyssalcrab',      { aliases: ['abyssalcrab'],      scale: S.abyssalcrab.scale,      weapon: 0, create: make });
    reg('hallucigenia',     { aliases: ['hallucigenia'],     scale: S.hallucigenia.scale,     weapon: 0, create: make });
    reg('abyssalhorror',    { aliases: ['abyssalhorror'],    scale: S.abyssalhorror.scale,    weapon: 0, create: make });
    reg('abyssaltentacler', { aliases: ['abyssaltentacler'], scale: S.abyssaltentacler.scale, weapon: 0, create: make });
    reg('acidbombardier',   { aliases: ['acidbombardier'],   scale: S.acidbombardier.scale,   weapon: 0, create: make });
    reg('acidictidecaller', { aliases: ['acidictidecaller'], scale: S.acidictidecaller.scale, weapon: 0, create: make });
    // Batch 7 (IDs 421-453).
    reg('airelemental',     { aliases: ['airelemental'],     scale: S.airelemental.scale,     weapon: 0, create: make });
    reg('ancientdragon',    { aliases: ['ancientdragon'],    scale: S.ancientdragon.scale,    weapon: 0, create: make });
    reg('anguishphantom',   { aliases: ['anguishphantom'],   scale: S.anguishphantom.scale,   weapon: 0, create: make });
    reg('aquaticelemental', { aliases: ['aquaticelemental'], scale: S.aquaticelemental.scale, weapon: 0, create: make });
    reg('aquaticmantis',    { aliases: ['aquaticmantis'],    scale: S.aquaticmantis.scale,    weapon: 0, create: make });
    reg('assassinwasp',     { aliases: ['assassinwasp'],     scale: S.assassinwasp.scale,     weapon: 0, create: make });
    reg('bloodwidow',       { aliases: ['bloodwidow'],       scale: S.bloodwidow.scale,       weapon: 0, create: make });
    reg('bogelemental',     { aliases: ['bogelemental'],     scale: S.bogelemental.scale,     weapon: 0, create: make });
    reg('bogmutant',        { aliases: ['bogmutant'],        scale: S.bogmutant.scale,        weapon: 0, create: make });
    reg('brinewisp',        { aliases: ['brinewisp'],        scale: S.brinewisp.scale,        weapon: 0, create: make });
    // Batch 8 (IDs 456-473).
    reg('chainfury',         { aliases: ['chainfury'],         scale: S.chainfury.scale,         weapon: 0, create: make });
    reg('cinderweaver',      { aliases: ['cinderweaver'],      scale: S.cinderweaver.scale,      weapon: 0, create: make });
    reg('cindermawhound',    { aliases: ['cindermawhound'],    scale: S.cindermawhound.scale,    weapon: 0, create: make });
    reg('cloudgiant',        { aliases: ['cloudgiant'],        scale: S.cloudgiant.scale,        weapon: 0, create: make });
    reg('combatdrone',       { aliases: ['combatdrone'],       scale: S.combatdrone.scale,       weapon: 0, create: make });
    reg('bioslave',          { aliases: ['bioslave'],          scale: S.bioslave.scale,          weapon: 0, create: make });
    // Batch 9 (IDs 482-516).
    reg('crystalhoarder',    { aliases: ['crystalhoarder'],    scale: S.crystalhoarder.scale,    weapon: 0, create: make });
    reg('crystalsiren',      { aliases: ['crystalsiren'],      scale: S.crystalsiren.scale,      weapon: 0, create: make });
    reg('emeraldstalker',    { aliases: ['emeraldstalker'],    scale: S.emeraldstalker.scale,    weapon: 0, create: make });
    // Batch 10 (IDs 519-539).
    reg('filthfiend',        { aliases: ['filthfiend'],        scale: S.filthfiend.scale,        weapon: 0, create: make });
    reg('flametouchedhellhound', { aliases: ['flametouchedhellhound'], scale: S.flametouchedhellhound.scale, weapon: 0, create: make });
    reg('frostslime',        { aliases: ['frostslime'],        scale: S.frostslime.scale,        weapon: 0, create: make });
    // Batch 11 (IDs 540-567).
    reg('gatorghast',        { aliases: ['gatorghast'],        scale: S.gatorghast.scale,        weapon: 0, create: make });
    reg('harpybanshee',      { aliases: ['harpybanshee'],      scale: S.harpybanshee.scale,      weapon: 0, create: make });
    // Batch 12 (IDs 569-590).
    reg('interdimensionaltourist', { aliases: ['interdimensionaltourist'], scale: S.interdimensionaltourist.scale, weapon: 0, create: make });
    reg('ironhorse',         { aliases: ['ironhorse'],         scale: S.ironhorse.scale,         weapon: 0, create: make });
    reg('landfillleviathan', { aliases: ['landfillleviathan'], scale: S.landfillleviathan.scale, weapon: 0, create: make });
    // Batch 13 (IDs 592-610).
    reg('luminousdefender',  { aliases: ['luminousdefender'],  scale: S.luminousdefender.scale,  weapon: 0, create: make });
    reg('mimicshapedbox',    { aliases: ['mimicshapedbox'],    scale: S.mimicshapedbox.scale,    weapon: 0, create: make });
    // Batch 14 (IDs 613-632).
    reg('nightmarebacteria', { aliases: ['nightmarebacteria'], scale: S.nightmarebacteria.scale, weapon: 0, create: make });
    // Batch 15 (IDs 644-668).
    reg('petrifyinggorgon',  { aliases: ['petrifyinggorgon'],  scale: S.petrifyinggorgon.scale,  weapon: 0, create: make });
    reg('platinummimic',     { aliases: ['platinummimic'],     scale: S.platinummimic.scale,     weapon: 0, create: make });
    reg('prismaticpolychromus',{ aliases: ['prismaticpolychromus'], scale: S.prismaticpolychromus.scale, weapon: 0, create: make });
    // Batch 16 (IDs 669-689).
    reg('ritualsentinel',    { aliases: ['ritualsentinel'],    scale: S.ritualsentinel.scale,    weapon: 0, create: make });
    reg('rubbler',           { aliases: ['rubbler'],           scale: S.rubbler.scale,           weapon: 0, create: make });
    reg('sacredphoenix',     { aliases: ['sacredphoenix'],     scale: S.sacredphoenix.scale,     weapon: 0, create: make });
    // Batch 17 (IDs 692-716) - all reuse existing variant builders.
    reg('scrapforged',       { aliases: ['scrapforged'],       scale: S.scrapforged.scale,       weapon: 0, create: make });
    // shadowbat / sonicmoltendrakebat are canonically registered by 3DBattler_Winged.js.
    // Registering them here would silently shadow that family, so they are intentionally omitted.
    // Batch 18 (IDs 718-749).
    reg('spineshade',        { aliases: ['spineshade'],        scale: S.spineshade.scale,        weapon: 0, create: make });
    // Batch 19 (IDs 751-769) - all reuse existing variant builders.
    reg('totemadept',        { aliases: ['totemadept'],        scale: S.totemadept.scale,        weapon: 0, create: make });
    // Batch 20 (IDs 770-815) - all reuse existing variant builders.
    reg('brimstonebehemutt', { aliases: ['brimstonebehemutt'], scale: S.brimstonebehemutt.scale, weapon: 0, create: make });
    reg('cognitivebacteria', { aliases: ['cognitivebacteria'], scale: S.cognitivebacteria.scale, weapon: 0, create: make });
    // Batch 21 (IDs 823-862) - all reuse existing variant builders.
    reg('dumpsterhead',      { aliases: ['dumpsterhead'],      scale: S.dumpsterhead.scale,      weapon: 0, create: make });
    reg('gildedguardian',    { aliases: ['gildedguardian'],    scale: S.gildedguardian.scale,    weapon: 0, create: make });
    reg('mindshield',        { aliases: ['mindshield'],        scale: S.mindshield.scale,        weapon: 0, create: make });
    // Batch 22 (IDs 864-909).
    reg('obsidiandreadnought',{ aliases: ['obsidiandreadnought'], scale: S.obsidiandreadnought.scale, weapon: 0, create: make });
    reg('plagueheap',        { aliases: ['plagueheap'],        scale: S.plagueheap.scale,        weapon: 0, create: make });
    reg('realitywarper',     { aliases: ['realitywarper'],     scale: S.realitywarper.scale,     weapon: 0, create: make });
    reg('shardmaw',          { aliases: ['shardmaw'],          scale: S.shardmaw.scale,          weapon: 0, create: make });
    // Batch 23 (IDs 913-950) - all reuse existing variant builders.
    reg('totemicprotector',  { aliases: ['totemicprotector'],  scale: S.totemicprotector.scale,  weapon: 0, create: make });
    reg('waridol',           { aliases: ['waridol'],           scale: S.waridol.scale,           weapon: 0, create: make });
    // Batch 24 (IDs 954-1002) - all reuse existing variant builders.
    reg('totemicoverlord',   { aliases: ['totemicoverlord'],   scale: S.totemicoverlord.scale,   weapon: 0, create: make });
    // xylomantiflorous is canonically registered by 3DBattler_Flora.js; omitted here to avoid shadowing it.
    reg('crystalgiant',      { aliases: ['crystalgiant'],      scale: S.crystalgiant.scale,      weapon: 0, create: make });
    // Batch 25 (IDs 1005-1037) - all reuse existing variant builders.
    reg('identitythief',     { aliases: ['identitythief'],     scale: S.identitythief.scale,     weapon: 0, create: make });
    // Batch 26 (IDs 1039-1053) - all reuse existing variant builders.
    reg('mathematicseater',  { aliases: ['mathematicseater'],  scale: S.mathematicseater.scale,  weapon: 0, create: make });
    reg('quantumfluctuationep',{ aliases: ['quantumfluctuationep'], scale: S.quantumfluctuationep.scale, weapon: 0, create: make });
    reg('temporalbarnacle',  { aliases: ['temporalbarnacle'],  scale: S.temporalbarnacle.scale,  weapon: 0, create: make });
    // Batch 27 (IDs 1054-1090) - all reuse existing variant builders.
    reg('totemofsins',       { aliases: ['totemofsins'],       scale: S.totemofsins.scale,       weapon: 0, create: make });
    reg('whisperingdoor',    { aliases: ['whisperingdoor'],    scale: S.whisperingdoor.scale,    weapon: 0, create: make });
    // Batch 28 (IDs 1091-1124) - ophanim is a new builder, the rest reuse.
    reg('obsidianhellhound', { aliases: ['obsidianhellhound'], scale: S.obsidianhellhound.scale, weapon: 0, create: make });
    // ophanim is canonically registered by 3DBattler_Exotic.js (with aliases ophan/thronebearer);
    // omitted here so those aliases are not lost to a shadowing overwrite.
    reg('abortionmimic',     { aliases: ['abortionmimic'],     scale: S.abortionmimic.scale,     weapon: 0, create: make });
    reg('diamondmimicep',    { aliases: ['diamondmimicep'],    scale: S.diamondmimicep.scale,    weapon: 0, create: make });
    // Batch 29 (IDs 1124-1358) - all reuse existing variant builders.
    reg('pyroclastphoenix',  { aliases: ['pyroclastphoenix'],  scale: S.pyroclastphoenix.scale,  weapon: 0, create: make });
    // dragonofwisdomenki is canonically registered by 3DBattler_Draconic.js; omitted here to avoid shadowing it.
    // Final batch (IDs 1450-1547) - remaining slimes/elementals (1 new: sacredelemental).
    ['crystallinebroodthing','gelatinousdronebug','bloateddronebug','gelatinousmirespawn','bloatedgel','glitteringbroodthing','quiveringlarva','crystallineglob','bloatedmold','chitteringpudding','acidicmirespawn','skitteringmold','causticmirespawn','causticcarapace','twitchingdronebug','brackishpudding','chitteringhuskbeetle','iridescentcrawler','bloatedcarapace','raginggeist','obsidianelemental','cracklinganimus','obsidiananimus','frozenmonolith','cracklingrevenant','frozenconstruct','frozensentinel','glacialgeist','cracklingeffigy','petrifiedsylph','ragingsentinel','surgingconstruct','cracklingelemental','surgingelemental','petrifiedmonolith','quartzcolossusspawn','quartzgeist'].forEach(k => reg(k, { aliases: [k], scale: S[k].scale, weapon: 0, create: make }));
    // QA fixes: seahorse, fish-school, and de-hijacked procedural slimes.
    ['goldenseahorse','pregseahorse','sardineschool','twitchingpudding','moltenglob','swarmingbroodthing','crystallinecarapace','causticlarva','glitteringcrawler','chitteringmirespawn','bloatedglob','brackishooze','bloatedooze','moltenmold','gelatinousglob','twitchingooze','sludgycrawler','swarmingswarmling','crystallinedronebug','quiveringcarapace','acidiclarva','quiveringhivemind','crystallinelarva','crystallinegel','quiveringbroodthing','swarmingmirespawn','gelatinoushuskbeetle'].forEach(k => reg(k, { aliases: [k], scale: S[k].scale, weapon: 0, create: make }));

    //=========================================================================
    // Name-based assignment for specific named enemies.
    //=========================================================================
    const NAMED = {
        mar_phantom: ["Phantom Marionette"], mar_twisted: ["Twisted Marionette"], mar_puppetcorpse: ["Puppet Master's Corpse"],
        mar_meatpuppet: ["Meat Puppet Theater"], mar_haunted: ["Haunted Mannequin"], mar_mannequin: ["Mannequin"],
        mar_backwards: ["Backwards Doll"], mar_babydoll: ["Baby Doll Head"], mar_boneorchestra: ["Bone Orchestra"], mar_stringbound: ["Stringbound Abomination"],
        wm_assault: ["Assault Mech"], wm_battlemech: ["Battle Mech"], wm_battlemechep: ["Battle Mech :EP"], wm_arsenal: ["Animated Arsenal"],
        wm_cogwork: ["Cogwork Bulwark"], wm_tank: ["Cybernetic Tank"], wm_ironbastion: ["Iron Bastion Automaton"],
        wm_marauder: ["Overclocked Marauder"], wm_veteranbot: ["Veteran Bot"],
        grimoire:    ["Cursed Grimorie", "Hyperdimensional Grimorie", "Hyperdimensional Grimorie :EP"],
        // (Cosmic horrors now have bespoke per-enemy models pinned in 3DBattler_Bosses.js.)
        // (Blick, Babalon Priestess, Death's Head, Giggling Skull and Skull Keeper
        // now have their own bespoke models pinned via <Model3D:> in Enemies.json;
        // their former shared-rig pins were removed to avoid name collisions.)
        // Inside-out / inverted body-horror trio.
        insideoutwhale:   ["Inside-Out Whale"],
        invertedangel:    ["Inverted Angel"],
        insideoutcritter: ["Inside-Out Critter"],
        // Batch 5 (IDs 361-380).
        tidesorcerer:     ["Tide Sorcerer"],
        timberwoodshaman: ["Timberwood Shaman"],
        toothfairy:       ["Tooth Fairy"],
        totemguardian:    ["Totem Guardian"],
        toteminitiate:    ["Totem Initiate"],
        toxicsprayer:     ["Toxic Sprayer"],
        trashling:        ["Trashling"],
        tridenthunter:    ["Trident Hunter"],
        mammothcalf:      ["Tundra Mammoth Calf"],
        twilightsatyr:    ["Twilight Satyr"],
        umbralbasilisk:   ["Umbral Basilisk"],
        vampirebat:       ["Vampire Bat"],
        // Batch 6 (IDs 382-420).
        venomoussnake:    ["Venomous Snake"],
        webweaver:        ["Webweaver"],
        whisperwisp:      ["Whisper Wisp"],
        wildrabbit:       ["Wild Rabbit"],
        willowisplamp:    ["Will-O-’-Wisp Lamp"],
        abyssalcrab:      ["Abyssal Crab"],
        hallucigenia:     ["Abyssal Hallucigenia"],
        abyssalhorror:    ["Abyssal Horror"],
        abyssaltentacler: ["Abyssal Tentacler"],
        acidbombardier:   ["Acid Bombardier"],
        acidictidecaller: ["Acidic Tidecaller"],
        // Batch 7 (IDs 421-453).
        airelemental:     ["Air Elemental"],
        ancientdragon:    ["Ancient Dragon"],
        anguishphantom:   ["Anguish Phantom"],
        aquaticelemental: ["Aquatic Elemental"],
        aquaticmantis:    ["Aquatic Mantis"],
        assassinwasp:     ["Assassin Wasp"],
        bloodwidow:       ["Blood Widow"],
        bogelemental:     ["Bog Elemental"],
        bogmutant:        ["Bog Mutant"],
        brinewisp:        ["Brine Wisp"],
        // Batch 8 (IDs 456-473).
        chainfury:        ["Chainbound Fury"],
        cinderweaver:     ["Cinder Weaver"],
        cindermawhound:   ["Cindermaw Hound"],
        cloudgiant:       ["Cloud Giant"],
        combatdrone:      ["Combat Drone"],
        bioslave:         ["Corrupted Bioslave"],
        // Batch 9 (IDs 482-516).
        crystalhoarder:   ["Crystal Hoarder"],
        crystalsiren:     ["Crystal Siren"],
        emeraldstalker:   ["Emerald Stalker"],
        // Batch 10 (IDs 519-539).
        filthfiend:       ["Filth Fiend"],
        flametouchedhellhound: ["Flame-Touched Hellhound"],
        frostslime:       ["Frost Slime"],
        // Batch 11 (IDs 540-567).
        gatorghast:       ["Gatorghast Horror"],
        harpybanshee:     ["Harpy Banshee"],
        // Batch 12 (IDs 569-590).
        interdimensionaltourist: ["Interdimensional Tourist"],
        ironhorse:        ["Iron Horse"],
        landfillleviathan:["Landfill Leviathan"],
        // Batch 13 (IDs 592-610).
        luminousdefender: ["Luminous Defender"],
        mimicshapedbox:   ["Mimic shaped box"],
        // Batch 14 (IDs 613-632).
        nightmarebacteria:["Nightmare Bacteria"],
        // Batch 15 (IDs 644-668).
        petrifyinggorgon: ["Petrifying Gorgon"],
        platinummimic:    ["Platinum Mimic"],
        prismaticpolychromus: ["Prismatic Polychromus"],
        // Batch 16 (IDs 669-689).
        ritualsentinel:   ["Ritual Sentinel"],
        rubbler:          ["Rubbler"],
        sacredphoenix:    ["Sacred Phoenix"],
        // Batch 17 (IDs 692-716).
        scrapforged:      ["Scrapforged"],
        shadowbat:        ["Shadow Bat"],
        sonicmoltendrakebat: ["Sonic Molten Drakebat"],
        // Batch 18 (IDs 718-749).
        spineshade:       ["Spineshade"],
        // Batch 19 (IDs 751-769).
        totemadept:       ["Totem Adept"],
        // Batch 20 (IDs 770-815).
        brimstonebehemutt:["Brimstone Behemutt"],
        cognitivebacteria:["Cognitive Bacteria"],
        // Batch 21 (IDs 823-862).
        dumpsterhead:     ["Dumpster Head"],
        gildedguardian:   ["Gilded Guardian"],
        mindshield:       ["Mind Shield"],
        // Batch 22 (IDs 864-909).
        obsidiandreadnought: ["Obsidian Dreadnought"],
        plagueheap:       ["Plague Heap"],
        realitywarper:    ["Reality Warper"],
        shardmaw:         ["Shardmaw"],
        // Batch 23 (IDs 913-950).
        totemicprotector: ["Totemic Protector"],
        waridol:          ["War Idol"],
        // Batch 24 (IDs 954-1002).
        totemicoverlord:  ["Totemic Overlord"],
        xylomantiflorous: ["Xylomanti Florous"],
        crystalgiant:     ["Crystal Giant"],
        // Batch 25 (IDs 1005-1037).
        identitythief:    ["Identity Thief"],
        // Batch 26 (IDs 1039-1053).
        mathematicseater: ["Mathematics Eater"],
        quantumfluctuationep: ["Quantum Fluctuation :EP"],
        temporalbarnacle: ["Temporal Barnacle"],
        // Batch 27 (IDs 1054-1090).
        totemofsins:      ["Totem of Sins"],
        whisperingdoor:   ["Whispering Door"],
        // Batch 28 (IDs 1091-1124).
        obsidianhellhound:["Obsidian Hellhound"],
        ophanim:          ["Ophanim Judicator", "Archangel Mortifier"],
        abortionmimic:    ["Abortion Mimic"],
        diamondmimicep:   ["Diamond Mimic :EP"],
        // Batch 29 (IDs 1124-1358).
        pyroclastphoenix: ["Pyroclast Phoenix"],
        dragonofwisdomenki: ["Dragon of Wisdom Enki"],
        // Final batch (IDs 1450-1547): remaining slimes/elementals.
        crystallinebroodthing: ["Crystalline Brood-Thing"],
        gelatinousdronebug: ["Gelatinous Drone-Bug"],
        bloateddronebug: ["Bloated Drone-Bug"],
        gelatinousmirespawn: ["Gelatinous Mire-Spawn"],
        bloatedgel: ["Bloated Gel"],
        glitteringbroodthing: ["Glittering Brood-Thing"],
        quiveringlarva: ["Quivering Larva"],
        crystallineglob: ["Crystalline Glob"],
        bloatedmold: ["Bloated Mold"],
        chitteringpudding: ["Chittering Pudding"],
        acidicmirespawn: ["Acidic Mire-Spawn"],
        skitteringmold: ["Skittering Mold"],
        causticmirespawn: ["Caustic Mire-Spawn"],
        causticcarapace: ["Caustic Carapace"],
        twitchingdronebug: ["Twitching Drone-Bug"],
        brackishpudding: ["Brackish Pudding"],
        chitteringhuskbeetle: ["Chittering Husk-Beetle"],
        iridescentcrawler: ["Iridescent Crawler"],
        bloatedcarapace: ["Bloated Carapace"],
        raginggeist: ["Raging Geist"],
        obsidianelemental: ["Obsidian Elemental"],
        cracklinganimus: ["Crackling Animus"],
        obsidiananimus: ["Obsidian Animus"],
        frozenmonolith: ["Frozen Monolith"],
        cracklingrevenant: ["Crackling Revenant"],
        frozenconstruct: ["Frozen Construct"],
        frozensentinel: ["Frozen Sentinel"],
        glacialgeist: ["Glacial Geist"],
        cracklingeffigy: ["Crackling Effigy"],
        petrifiedsylph: ["Petrified Sylph"],
        ragingsentinel: ["Raging Sentinel"],
        surgingconstruct: ["Surging Construct"],
        cracklingelemental: ["Crackling Elemental"],
        surgingelemental: ["Surging Elemental"],
        petrifiedmonolith: ["Petrified Monolith"],
        quartzcolossusspawn: ["Quartz Colossus-Spawn"],
        quartzgeist: ["Quartz Geist"],
        // QA fixes (description-conforming).
        goldenseahorse: ["Golden Seahorse"],
        pregseahorse: ["Pregnant Seahorse"],
        sardineschool: ["Sardine School"],
        twitchingpudding: ["Twitching Pudding"],
        moltenglob: ["Molten Glob"],
        swarmingbroodthing: ["Swarming Brood-Thing"],
        crystallinecarapace: ["Crystalline Carapace"],
        causticlarva: ["Caustic Larva"],
        glitteringcrawler: ["Glittering Crawler"],
        chitteringmirespawn: ["Chittering Mire-Spawn"],
        bloatedglob: ["Bloated Glob"],
        brackishooze: ["Brackish Ooze"],
        bloatedooze: ["Bloated Ooze"],
        moltenmold: ["Molten Mold"],
        gelatinousglob: ["Gelatinous Glob"],
        twitchingooze: ["Twitching Ooze"],
        sludgycrawler: ["Sludgy Crawler"],
        swarmingswarmling: ["Swarming Swarmling"],
        crystallinedronebug: ["Crystalline Drone-Bug"],
        quiveringcarapace: ["Quivering Carapace"],
        acidiclarva: ["Acidic Larva"],
        quiveringhivemind: ["Quivering Hivemind"],
        crystallinelarva: ["Crystalline Larva"],
        crystallinegel: ["Crystalline Gel"],
        quiveringbroodthing: ["Quivering Brood-Thing"],
        swarmingmirespawn: ["Swarming Mire-Spawn"],
        gelatinoushuskbeetle: ["Gelatinous Husk-Beetle"]
    };
    if (window.Battler3D.registerNamed) {
        for (const key in NAMED) NAMED[key].forEach(n => window.Battler3D.registerNamed(n, key));
    }

    debugLog('Oddity uniques + named assignments registered');

    ;[['u_cursedgrimorie',2.6],['u_hyperdimensionalgrimorieep',2.6],['u_foldedsaint',3.0],['u_maatwithineris',3.0]].forEach(([k,sc]) => reg(k, { aliases: [k], scale: sc, weapon: 0, create: make }));

    ;[['u_deepmawhorror',3.2],['u_screechingnightbat',2.4]].forEach(([k,sc]) => reg(k, { aliases: [k], scale: sc, weapon: 0, create: make }));
})();
