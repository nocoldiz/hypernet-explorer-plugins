//=============================================================================
// 3D Battler System - Elemental Family
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Floating elemental procedural 3D battlers (fire/water/thunder/
 * storm/metal/dark/sacred + generic). Requires 3DBattlerSystem (core) first.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * ============================================================================
 * 3D Battler - Elemental Family
 * ============================================================================
 *
 * One parametrised floating body plan shared by every elemental: a glowing CORE
 * suspended inside a translucent BODY, with two arm wisps and two leg wisps. It
 * hovers (no physics) and reuses the shared part-losing engine from
 * window.Battler3D.Base.
 *
 * Each archetype names its parts differently (EMBER_ARMS vs LEFT_ELECTRIC_ARM,
 * etc.), so each profile carries a `map` from its body-part keys to logical
 * slots (core/body/larm/rarm/lleg/rleg, plus the groups arms/legs), which drives
 * both the hit-flash map and the dismemberment cascade automatically.
 *
 * Registered archetypes:
 *   Elemental, FireElemental, WaterElemental, ThunderElemental,
 *   StormElemental, MetalElemental, DarkElemental, SacredElemental
 *
 * MUST load AFTER BattleSystem/3DBattlerSystem.
 */

(() => {
    'use strict';

    if (typeof THREE === 'undefined') return;
    if (!window.Battler3D || !window.Battler3D.Base) {
        console.error('[3D Battler Elemental] Core (3DBattlerSystem) not loaded first.');
        return;
    }

    const Base = window.Battler3D.Base;
    const debugLog = window.Battler3D.debugLog || function () {};

    // hue/sat/lit drive the procedural body tint; coreColor/emissive set the glow.
    const ELEMENTAL_PROFILES = {
        elemental: {
            scale: 2.6, coreColor: 0xffffff, emissive: 0x8899aa, bodyColor: 0xaab4c8, texturePool: 'crystal',
            hue: [0.58, 0.20], sat: [0.30, 0.20], lit: [0.60, 0.10],
            map: { CORE: 'core', UPPER_FORM: 'body', LOWER_FORM: 'legs', LEFT_APPENDAGE: 'larm', RIGHT_APPENDAGE: 'rarm' }
        },
        fireelemental: {
            scale: 2.6, coreColor: 0xfff2a0, emissive: 0xff5510, bodyColor: 0xff6a1a, texturePool: 'fire',
            hue: [0.04, 0.04], sat: [0.95, 0.05], lit: [0.52, 0.10],
            map: { CORE: 'core', BODY: 'body', EMBER_ARMS: 'arms', ASH_LEGS: 'legs' }
        },
        waterelemental: {
            scale: 2.6, coreColor: 0xd0f4ff, emissive: 0x1a6aff, bodyColor: 0x2a8fdf, texturePool: 'water',
            hue: [0.58, 0.05], sat: [0.70, 0.15], lit: [0.55, 0.10],
            map: { CORE: 'core', BODY: 'body', WATER_ARMS: 'arms', LEFT_WATER_LEG: 'lleg', RIGHT_WATER_LEG: 'rleg' }
        },
        thunderelemental: {
            scale: 2.6, coreColor: 0xffffd0, emissive: 0xffe000, bodyColor: 0xf0d020, texturePool: 'metal',
            hue: [0.14, 0.04], sat: [0.85, 0.10], lit: [0.55, 0.10],
            map: { CORE: 'core', BODY: 'body', LEFT_ELECTRIC_ARM: 'larm', RIGHT_ELECTRIC_ARM: 'rarm', LEFT_ELECTRIC_LEG: 'lleg', RIGHT_ELECTRIC_LEG: 'rleg' }
        },
        stormelemental: {
            variant: 'stormelemental', scale: 2.7, texturePool: 'void', bodyColor: 0x3a4150, accent: 0xfff060, front: true,
            hue: [0.62, 0.06], sat: [0.30, 0.15], lit: [0.42, 0.08],
            coreColor: 0xe6ecff, emissive: 0x6677cc
        },
        metalelemental: {
            scale: 2.6, coreColor: 0xfff0d0, emissive: 0x443322, bodyColor: 0x9a9aa2, texturePool: 'metal',
            hue: [0.08, 0.05], sat: [0.10, 0.08], lit: [0.55, 0.10],
            map: { CORE: 'core', PLATE_ARMOR: 'body', SPIKE_ARMS: 'arms', GEAR_LEGS: 'legs' }
        },
        darkelemental: {
            scale: 2.6, coreColor: 0x9933cc, emissive: 0x3a0a55, bodyColor: 0x2a1838, texturePool: 'void',
            hue: [0.78, 0.06], sat: [0.55, 0.15], lit: [0.22, 0.08],
            map: { CORE: 'core', BODY: 'body', LEFT_ARM: 'larm', RIGHT_ARM: 'rarm', LEFT_LEG: 'lleg', RIGHT_LEG: 'rleg' }
        },
        sacredelemental: {
            scale: 2.6, coreColor: 0xfffbe0, emissive: 0xffe9a8, bodyColor: 0xfff3cf, texturePool: 'pale',
            hue: [0.13, 0.04], sat: [0.40, 0.15], lit: [0.78, 0.10],
            map: { CORE: 'core', BODY: 'body', LEFT_ARM: 'larm', RIGHT_ARM: 'rarm', LEFT_LEG: 'lleg', RIGHT_LEG: 'rleg' }
        },

        // ── Bespoke unique elementals (variant-driven, hand-built geometry) ──
        waternymph: {
            variant: 'waternymph', scale: 2.4, texturePool: 'water', bodyColor: 0x4fc6ff, accent: 0xd6f6ff, front: true,
            hue: [0.55, 0.05], sat: [0.55, 0.12], lit: [0.62, 0.08],
            coreColor: 0xe0f8ff, emissive: 0x2a9fff
        },
        flameelemental: {
            variant: 'flameelemental', scale: 2.6, texturePool: 'fire', bodyColor: 0xff6a14, accent: 0xffd040, front: true,
            hue: [0.045, 0.03], sat: [0.95, 0.05], lit: [0.52, 0.08],
            coreColor: 0xfff2a0, emissive: 0xff4400
        },
        luckelemental: {
            variant: 'luckelemental', scale: 2.4, texturePool: 'metal', bodyColor: 0xf4cf4a, accent: 0x66dd66, front: true,
            hue: [0.13, 0.03], sat: [0.70, 0.10], lit: [0.62, 0.08],
            coreColor: 0xfff4b0, emissive: 0xffcc22
        },
        moltenjuggernaut: {
            variant: 'moltenjuggernaut', scale: 3.0, texturePool: 'fire', bodyColor: 0x4a2a22, accent: 0xff5a10, front: true,
            hue: [0.04, 0.03], sat: [0.45, 0.12], lit: [0.26, 0.06],
            coreColor: 0xffb030, emissive: 0xff3a00
        },
        quantumfluctuation: {
            variant: 'quantumfluctuation', scale: 2.5, texturePool: 'void', bodyColor: 0x9a3ad6, accent: 0xff66ff, front: true,
            hue: [0.78, 0.06], sat: [0.70, 0.12], lit: [0.50, 0.08],
            coreColor: 0xffaaff, emissive: 0xaa22ff
        },
        swampgaselemental: {
            variant: 'swampgaselemental', scale: 2.6, texturePool: 'void', bodyColor: 0x6a8a2a, accent: 0xbaff66, front: true,
            hue: [0.26, 0.05], sat: [0.55, 0.12], lit: [0.42, 0.08],
            coreColor: 0xd6ff88, emissive: 0x88cc22
        },
        tsunamiguardian: {
            variant: 'tsunamiguardian', scale: 3.2, texturePool: 'water', bodyColor: 0x1f7fd6, accent: 0xc8f0ff, front: true,
            hue: [0.57, 0.05], sat: [0.72, 0.12], lit: [0.52, 0.08],
            coreColor: 0xe0f8ff, emissive: 0x1a6aff
        },
        wintersharbinger: {
            variant: 'wintersharbinger', scale: 2.7, texturePool: 'crystal', bodyColor: 0x9fc6e8, accent: 0xeafaff, front: true,
            hue: [0.55, 0.05], sat: [0.35, 0.12], lit: [0.72, 0.08],
            coreColor: 0xeafaff, emissive: 0x66aaff
        },
        zephyrdjinn: {
            variant: 'zephyrdjinn', scale: 2.6, texturePool: 'void', bodyColor: 0xbfe8ff, accent: 0xeafcff, front: true,
            hue: [0.52, 0.05], sat: [0.20, 0.10], lit: [0.78, 0.08],
            coreColor: 0xeafcff, emissive: 0x88ddff
        },
        earthsentinel: {
            variant: 'earthsentinel', scale: 3.1, texturePool: 'crystal', bodyColor: 0x6e5a40, accent: 0x88ff66, front: true,
            hue: [0.09, 0.05], sat: [0.35, 0.10], lit: [0.34, 0.06],
            coreColor: 0xbaff88, emissive: 0x55cc22
        },
        galesentinel: {
            variant: 'galesentinel', scale: 2.8, texturePool: 'void', bodyColor: 0xbfeede, accent: 0xeafff6, front: true,
            hue: [0.45, 0.05], sat: [0.25, 0.10], lit: [0.72, 0.08],
            coreColor: 0xeafff6, emissive: 0x66ffcc
        },
        blazinginfernoelemental: {
            variant: 'blazinginfernoelemental', scale: 3.4, texturePool: 'fire', bodyColor: 0xffe8b0, accent: 0xffffff, front: true,
            hue: [0.09, 0.03], sat: [0.55, 0.10], lit: [0.78, 0.08],
            coreColor: 0xffffff, emissive: 0xffd060
        },
        bascapeflame: {
            variant: 'bascapeflame', scale: 2.7, texturePool: 'fire', bodyColor: 0x161210, accent: 0xff7a18, front: true,
            hue: [0.045, 0.03], sat: [0.85, 0.10], lit: [0.30, 0.06],
            coreColor: 0xffb030, emissive: 0xff5a00
        },
        es_cinderwrappedsentinel: { variant: 'elemspirit', scale: 2.3, texturePool: 'crystal', bodyColor: 0x4a2418, accent: 0xff6633, coreColor: 0xff6633, emissive: 0xff6633, hue:[0.55,0.2], sat:[0.4,0.15], lit:[0.45,0.12], spec:{ form:'sentinel' } },
        es_encompassingroadwarden: { variant: 'elemspirit', scale: 2.3, texturePool: 'crystal', bodyColor: 0x5a5448, accent: 0xaa9988, coreColor: 0xaa9988, emissive: 0xaa9988, hue:[0.55,0.2], sat:[0.4,0.15], lit:[0.45,0.12], spec:{ form:'sentinel' } },
        es_tempestdjinn: { variant: 'elemspirit', scale: 2.3, texturePool: 'crystal', bodyColor: 0x46566e, accent: 0x88ccff, coreColor: 0x88ccff, emissive: 0x88ccff, hue:[0.55,0.2], sat:[0.4,0.15], lit:[0.45,0.12], spec:{ form:'sylph' } },
        es_lullabywraith: { variant: 'elemspirit', scale: 2.3, texturePool: 'crystal', bodyColor: 0x4a3a6a, accent: 0xaa88ff, coreColor: 0xaa88ff, emissive: 0xaa88ff, hue:[0.55,0.2], sat:[0.4,0.15], lit:[0.45,0.12], spec:{ form:'spirit' } },
        es_forgottensentinel: { variant: 'elemspirit', scale: 2.3, texturePool: 'crystal', bodyColor: 0x8a8270, accent: 0xccbbaa, coreColor: 0xccbbaa, emissive: 0xccbbaa, hue:[0.55,0.2], sat:[0.4,0.15], lit:[0.45,0.12], spec:{ form:'sentinel' } },
        es_gildedsentinel: { variant: 'elemspirit', scale: 2.3, texturePool: 'crystal', bodyColor: 0xb8932e, accent: 0xffe066, coreColor: 0xffe066, emissive: 0xffe066, hue:[0.55,0.2], sat:[0.4,0.15], lit:[0.45,0.12], spec:{ form:'sentinel' } },
        es_tempestconduit: { variant: 'elemspirit', scale: 2.3, texturePool: 'crystal', bodyColor: 0x46566e, accent: 0x88ccff, coreColor: 0x88ccff, emissive: 0x88ccff, hue:[0.55,0.2], sat:[0.4,0.15], lit:[0.45,0.12], spec:{ form:'conduit' } },
        es_livingsentinel: { variant: 'elemspirit', scale: 2.3, texturePool: 'crystal', bodyColor: 0x5a6a4a, accent: 0x88ff88, coreColor: 0x88ff88, emissive: 0x88ff88, hue:[0.55,0.2], sat:[0.4,0.15], lit:[0.45,0.12], spec:{ form:'sentinel' } },
        es_surgingsylph: { variant: 'elemspirit', scale: 2.3, texturePool: 'crystal', bodyColor: 0x3a5468, accent: 0x66ddff, coreColor: 0x66ddff, emissive: 0x66ddff, hue:[0.55,0.2], sat:[0.4,0.15], lit:[0.45,0.12], spec:{ form:'sylph' } },
        es_ragingconduit: { variant: 'elemspirit', scale: 2.3, texturePool: 'crystal', bodyColor: 0x6a2210, accent: 0xff5522, coreColor: 0xff5522, emissive: 0xff5522, hue:[0.55,0.2], sat:[0.4,0.15], lit:[0.45,0.12], spec:{ form:'conduit' } },
        es_howlingelemental: { variant: 'elemspirit', scale: 2.3, texturePool: 'crystal', bodyColor: 0xb8c4d0, accent: 0xccf0ff, coreColor: 0xccf0ff, emissive: 0xccf0ff, hue:[0.55,0.2], sat:[0.4,0.15], lit:[0.45,0.12], spec:{ form:'spirit' } },
        es_moltencolossusspawn: { variant: 'elemspirit', scale: 2.3, texturePool: 'crystal', bodyColor: 0x6a1e0a, accent: 0xff6a18, coreColor: 0xff6a18, emissive: 0xff6a18, hue:[0.55,0.2], sat:[0.4,0.15], lit:[0.45,0.12], spec:{ form:'construct' } },
        es_frozenrevenant: { variant: 'elemspirit', scale: 2.3, texturePool: 'crystal', bodyColor: 0x9ac0d8, accent: 0x88e0ff, coreColor: 0x88e0ff, emissive: 0x88e0ff, hue:[0.55,0.2], sat:[0.4,0.15], lit:[0.45,0.12], spec:{ form:'spirit' } },
        es_radiantmonolith: { variant: 'elemspirit', scale: 2.3, texturePool: 'crystal', bodyColor: 0xf0ead0, accent: 0xffe066, coreColor: 0xffe066, emissive: 0xffe066, hue:[0.55,0.2], sat:[0.4,0.15], lit:[0.45,0.12], spec:{ form:'construct' } },
        es_ragingcolossusspawn: { variant: 'elemspirit', scale: 2.3, texturePool: 'crystal', bodyColor: 0x6a2210, accent: 0xff5522, coreColor: 0xff5522, emissive: 0xff5522, hue:[0.55,0.2], sat:[0.4,0.15], lit:[0.45,0.12], spec:{ form:'construct' } },
        es_obsidianconduit: { variant: 'elemspirit', scale: 2.3, texturePool: 'crystal', bodyColor: 0x201a28, accent: 0x9944ff, coreColor: 0x9944ff, emissive: 0x9944ff, hue:[0.55,0.2], sat:[0.4,0.15], lit:[0.45,0.12], spec:{ form:'conduit' } },
        es_grindingconstruct: { variant: 'elemspirit', scale: 2.3, texturePool: 'crystal', bodyColor: 0x8a9aa0, accent: 0xccddee, coreColor: 0xccddee, emissive: 0xccddee, hue:[0.55,0.2], sat:[0.4,0.15], lit:[0.45,0.12], spec:{ form:'construct' } },
        es_howlingsylph: { variant: 'elemspirit', scale: 2.3, texturePool: 'crystal', bodyColor: 0xb8c4d0, accent: 0xccf0ff, coreColor: 0xccf0ff, emissive: 0xccf0ff, hue:[0.55,0.2], sat:[0.4,0.15], lit:[0.45,0.12], spec:{ form:'sylph' } },
        es_tempestwisp: { variant: 'elemspirit', scale: 2.3, texturePool: 'crystal', bodyColor: 0x46566e, accent: 0x88ccff, coreColor: 0x88ccff, emissive: 0x88ccff, hue:[0.55,0.2], sat:[0.4,0.15], lit:[0.45,0.12], spec:{ form:'spirit' } },
        es_quartzwisp: { variant: 'elemspirit', scale: 2.3, texturePool: 'crystal', bodyColor: 0x6a6a78, accent: 0x88ddff, coreColor: 0x88ddff, emissive: 0x88ddff, hue:[0.55,0.2], sat:[0.4,0.15], lit:[0.45,0.12], spec:{ form:'spirit' } },
        es_howlingrevenant: { variant: 'elemspirit', scale: 2.3, texturePool: 'crystal', bodyColor: 0xb8c4d0, accent: 0xccf0ff, coreColor: 0xccf0ff, emissive: 0xccf0ff, hue:[0.55,0.2], sat:[0.4,0.15], lit:[0.45,0.12], spec:{ form:'spirit' } },
        es_grindingspirit: { variant: 'elemspirit', scale: 2.3, texturePool: 'crystal', bodyColor: 0x8a9aa0, accent: 0xccddee, coreColor: 0xccddee, emissive: 0xccddee, hue:[0.55,0.2], sat:[0.4,0.15], lit:[0.45,0.12], spec:{ form:'spirit' } },
        es_cracklingspirit: { variant: 'elemspirit', scale: 2.3, texturePool: 'crystal', bodyColor: 0x3a4458, accent: 0x66ccff, coreColor: 0x66ccff, emissive: 0x66ccff, hue:[0.55,0.2], sat:[0.4,0.15], lit:[0.45,0.12], spec:{ form:'spirit' } },
        es_moltensylph: { variant: 'elemspirit', scale: 2.3, texturePool: 'crystal', bodyColor: 0x6a1e0a, accent: 0xff6a18, coreColor: 0xff6a18, emissive: 0xff6a18, hue:[0.55,0.2], sat:[0.4,0.15], lit:[0.45,0.12], spec:{ form:'sylph' } },
        es_petrifiedwarden: { variant: 'elemspirit', scale: 2.3, texturePool: 'crystal', bodyColor: 0x5a5448, accent: 0xaa9988, coreColor: 0xaa9988, emissive: 0xaa9988, hue:[0.55,0.2], sat:[0.4,0.15], lit:[0.45,0.12], spec:{ form:'sentinel' } },
        es_livingelemental: { variant: 'elemspirit', scale: 2.3, texturePool: 'crystal', bodyColor: 0x5a6a4a, accent: 0x88ff88, coreColor: 0x88ff88, emissive: 0x88ff88, hue:[0.55,0.2], sat:[0.4,0.15], lit:[0.45,0.12], spec:{ form:'spirit' } },
        es_raginganimus: { variant: 'elemspirit', scale: 2.3, texturePool: 'crystal', bodyColor: 0x6a2210, accent: 0xff5522, coreColor: 0xff5522, emissive: 0xff5522, hue:[0.55,0.2], sat:[0.4,0.15], lit:[0.45,0.12], spec:{ form:'spirit' } },
        es_searingspirit: { variant: 'elemspirit', scale: 2.3, texturePool: 'crystal', bodyColor: 0x6a1e0a, accent: 0xff8833, coreColor: 0xff8833, emissive: 0xff8833, hue:[0.55,0.2], sat:[0.4,0.15], lit:[0.45,0.12], spec:{ form:'spirit' } },
        es_petrifiedeffigy: { variant: 'elemspirit', scale: 2.3, texturePool: 'crystal', bodyColor: 0x5a5448, accent: 0xaa9988, coreColor: 0xaa9988, emissive: 0xaa9988, hue:[0.55,0.2], sat:[0.4,0.15], lit:[0.45,0.12], spec:{ form:'spirit' } },
        es_tempestcolossusspawn: { variant: 'elemspirit', scale: 2.3, texturePool: 'crystal', bodyColor: 0x46566e, accent: 0x88ccff, coreColor: 0x88ccff, emissive: 0x88ccff, hue:[0.55,0.2], sat:[0.4,0.15], lit:[0.45,0.12], spec:{ form:'construct' } },
        es_moltenconstruct: { variant: 'elemspirit', scale: 2.3, texturePool: 'crystal', bodyColor: 0x6a1e0a, accent: 0xff6a18, coreColor: 0xff6a18, emissive: 0xff6a18, hue:[0.55,0.2], sat:[0.4,0.15], lit:[0.45,0.12], spec:{ form:'construct' } },
        es_quartzmonolith: { variant: 'elemspirit', scale: 2.3, texturePool: 'crystal', bodyColor: 0x6a6a78, accent: 0x88ddff, coreColor: 0x88ddff, emissive: 0x88ddff, hue:[0.55,0.2], sat:[0.4,0.15], lit:[0.45,0.12], spec:{ form:'construct' } },
        es_quartzsylph: { variant: 'elemspirit', scale: 2.3, texturePool: 'crystal', bodyColor: 0x6a6a78, accent: 0x88ddff, coreColor: 0x88ddff, emissive: 0x88ddff, hue:[0.55,0.2], sat:[0.4,0.15], lit:[0.45,0.12], spec:{ form:'sylph' } },
        es_moltenwarden: { variant: 'elemspirit', scale: 2.3, texturePool: 'crystal', bodyColor: 0x6a1e0a, accent: 0xff6a18, coreColor: 0xff6a18, emissive: 0xff6a18, hue:[0.55,0.2], sat:[0.4,0.15], lit:[0.45,0.12], spec:{ form:'sentinel' } },
        es_moltensentinel: { variant: 'elemspirit', scale: 2.3, texturePool: 'crystal', bodyColor: 0x6a1e0a, accent: 0xff6a18, coreColor: 0xff6a18, emissive: 0xff6a18, hue:[0.55,0.2], sat:[0.4,0.15], lit:[0.45,0.12], spec:{ form:'sentinel' } },
        es_searingelemental: { variant: 'elemspirit', scale: 2.3, texturePool: 'crystal', bodyColor: 0x6a1e0a, accent: 0xff8833, coreColor: 0xff8833, emissive: 0xff8833, hue:[0.55,0.2], sat:[0.4,0.15], lit:[0.45,0.12], spec:{ form:'spirit' } },
        es_tempestsylph: { variant: 'elemspirit', scale: 2.3, texturePool: 'crystal', bodyColor: 0x46566e, accent: 0x88ccff, coreColor: 0x88ccff, emissive: 0x88ccff, hue:[0.55,0.2], sat:[0.4,0.15], lit:[0.45,0.12], spec:{ form:'sylph' } },
    };

    class ElementalBattler3D extends Base {
        constructor(scale, offsetY, battler, weaponType, creatureType) {
            const profile = ELEMENTAL_PROFILES[creatureType] || ELEMENTAL_PROFILES.elemental;
            super(scale, offsetY, battler, profile, 0, creatureType || 'elemental');
            this._materials = [];
            this._baseY = null;
            this.variant = profile.variant || null;
            if (profile.front) this.facingYaw = 0; // bespoke uniques face the viewer
        }

        // Build (and track for fade) a translucent standard material.
        _mat(color, opacity, rough, emissive) {
            const m = new THREE.MeshStandardMaterial({
                color, roughness: (rough === undefined ? 0.6 : rough),
                emissive: new THREE.Color(emissive || 0x000000), emissiveIntensity: emissive ? 0.7 : 0,
                transparent: true, opacity: (opacity === undefined ? 1.0 : opacity)
            });
            this._materials.push(m);
            return m;
        }
        _skinMat(color, rough) { return this.applySkin(this._mat(color, 1.0, rough === undefined ? 0.55 : rough)); }

        // Tiny glowing eye dot (Base has no _eye; build one inline).
        _eyeDot(parent, x, y, z, size, color) {
            const e = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 8), this._mat(color, 1.0, 0.1, color));
            e.position.set(x, y, z);
            parent.add(e);
            return e;
        }

        async load(physicsWorld, startX = 0, startY = 0, startZ = 0) {
            this.physicsWorld = physicsWorld; // unused (no ragdoll)
            // Bespoke unique elementals route to their own hand-built geometry.
            if (this.variant) {
                switch (this.variant) {
                    case 'waternymph':         this._buildWaterNymph(); break;
                    case 'flameelemental':     this._buildFlameElemental(); break;
                    case 'luckelemental':      this._buildLuckElemental(); break;
                    case 'moltenjuggernaut':   this._buildMoltenJuggernaut(); break;
                    case 'quantumfluctuation': this._buildQuantumFluctuation(); break;
                    case 'swampgaselemental':  this._buildSwampGasElemental(); break;
                    case 'tsunamiguardian':    this._buildTsunamiGuardian(); break;
                    case 'wintersharbinger':   this._buildWintersHarbinger(); break;
                    case 'zephyrdjinn':        this._buildZephyrDjinn(); break;
                    case 'earthsentinel':      this._buildEarthSentinel(); break;
                    case 'galesentinel':       this._buildGaleSentinel(); break;
                    case 'stormelemental':     this._buildStormElemental(); break;
                    case 'blazinginfernoelemental': this._buildBlazingInfernoElemental(); break;
                    case 'bascapeflame':       this._buildBascapeFlame(); break;
                    case 'elemspirit':         this._buildElemSpirit(); break;
                }
                this.model = this.bodyGroup;
                this.applyModelScale();
                this.loaded = true;
                return this;
            }
            const p = this.profile;
            const skin = this.skinTex();
            const bodyMat = new THREE.MeshStandardMaterial({
                color: p.bodyColor, map: skin, emissive: new THREE.Color(p.emissive),
                emissiveIntensity: 0.5, roughness: 0.5, transparent: true, opacity: 0.8
            });
            this._materials.push(bodyMat);
            const limbMat = bodyMat.clone(); this._materials.push(limbMat);

            // Body: a tall ovoid trunk.
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 16), bodyMat);
            this.body.position.y = 1.0; this.body.scale.set(1.0, 1.5, 1.0);
            this.bodyGroup.add(this.body);

            // Glowing core suspended inside the body.
            const coreMat = new THREE.MeshStandardMaterial({
                color: p.coreColor, emissive: new THREE.Color(p.coreColor),
                emissiveIntensity: 1.2, roughness: 0.2
            });
            this._materials.push(coreMat);
            this.core = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 14), coreMat);
            this.core.position.y = 1.0;
            this.bodyGroup.add(this.core);

            // Arm wisps (tapered cones angled outward/up).
            this.larm = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.6, 8), limbMat);
            this.larm.position.set(-0.42, 1.05, 0); this.larm.rotation.z = 0.7;
            this.bodyGroup.add(this.larm);
            this.rarm = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.6, 8), limbMat);
            this.rarm.position.set(0.42, 1.05, 0); this.rarm.rotation.z = -0.7;
            this.bodyGroup.add(this.rarm);

            // Leg wisps (cones pointing down into the hover).
            this.lleg = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.7, 8), limbMat);
            this.lleg.position.set(-0.18, 0.35, 0); this.lleg.rotation.x = Math.PI;
            this.bodyGroup.add(this.lleg);
            this.rleg = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.7, 8), limbMat);
            this.rleg.position.set(0.18, 0.35, 0); this.rleg.rotation.x = Math.PI;
            this.bodyGroup.add(this.rleg);

            this.model = this.bodyGroup;
            this.applyModelScale();

            this._wireFromMap(p.map);

            this.loaded = true;
            return this;
        }

        // Logical slot -> the meshes it covers.
        _slotMeshes(slot) {
            switch (slot) {
                case 'core': return [this.core];
                case 'body': return [this.body];
                case 'larm': return [this.larm];
                case 'rarm': return [this.rarm];
                case 'lleg': return [this.lleg];
                case 'rleg': return [this.rleg];
                case 'arms': return [this.larm, this.rarm];
                case 'legs': return [this.lleg, this.rleg];
                default: return [];
            }
        }

        // Build the part-mesh map + cascade from the archetype's key->slot map.
        _wireFromMap(map) {
            let coreKey = 'CORE';
            const allMeshes = [this.core, this.body, this.larm, this.rarm, this.lleg, this.rleg];
            for (const key in map) {
                const meshes = this._slotMeshes(map[key]);
                if (meshes.length) this._partMeshMap[key] = meshes[0];
                if (map[key] === 'core') coreKey = key;
                this._cascadeRules.push({ gone: [key], hide: meshes });
            }
            // Core destroyed -> the elemental dissipates entirely.
            this._cascadeRules.unshift({ gone: [coreKey], hide: allMeshes });
        }

        // ── Water Nymph: a graceful translucent water-maiden ────────────────
        // Slender liquid torso tapering to a flowing tail, two cascading arm
        // streams, and a crown of falling water-hair around a bright droplet core.
        _buildWaterNymph() {
            const p = this.profile;
            const water = this._skinMat(p.bodyColor, 0.18); water.opacity = 0.6;
            // BODY: slim feminine ovoid torso melting into a tail (no feet).
            this.body = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 18), water); torso.scale.set(0.85, 1.5, 0.7); torso.position.y = 1.15; this.body.add(torso);
            const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 0.5, 16), water); waist.position.y = 0.7; this.body.add(waist);
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), water); head.position.y = 1.62; this.body.add(head);
            this.bodyGroup.add(this.body);
            // LEGS: a single twin water-fall tail (two tapered streams to the floor).
            this.lleg = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.1, 12), water); this.lleg.rotation.x = Math.PI; this.lleg.position.set(-0.1, 0.05, 0); this.bodyGroup.add(this.lleg);
            this.rleg = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.1, 12), water); this.rleg.rotation.x = Math.PI; this.rleg.position.set(0.1, 0.05, 0); this.bodyGroup.add(this.rleg);
            // ARMS: flowing curved water streams (shared group, one slot).
            this.arms = new THREE.Group();
            for (const sx of [-1, 1]) {
                const arm = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.75, 10), water); arm.position.set(sx * 0.36, 1.05, 0.05); arm.rotation.z = sx * 0.6; arm._sx = sx; this.arms.add(arm);
            }
            this.bodyGroup.add(this.arms);
            // Flowing water-hair: a ring of thin falling strands around the head.
            this.hair = new THREE.Group();
            for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, 0.55, 6), water); strand.position.set(Math.cos(a) * 0.18, 1.4, Math.sin(a) * 0.18); strand._a = a; this.hair.add(strand); }
            this.bodyGroup.add(this.hair);
            // CORE: a bright droplet in the chest.
            this.core = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 14), this._mat(p.coreColor, 0.95, 0.1, p.emissive)); this.core.position.y = 1.1; this.core.scale.y = 1.4; this.bodyGroup.add(this.core);
            this._partMeshMap = { CORE: this.core, BODY: this.body, WATER_ARMS: this.arms, LEFT_WATER_LEG: this.lleg, RIGHT_WATER_LEG: this.rleg };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.body, this.arms, this.lleg, this.rleg, this.hair] },
                { gone: ['BODY'], hide: [this.body, this.hair] },
                { gone: ['WATER_ARMS'], hide: [this.arms] },
                { gone: ['LEFT_WATER_LEG'], hide: [this.lleg] },
                { gone: ['RIGHT_WATER_LEG'], hide: [this.rleg] }
            ];
        }

        // ── Flame Elemental: a roaring humanoid bonfire ─────────────────────
        // Stacked shrinking flame tongues for the torso, jagged ember arm
        // claws, a flaring ash skirt for legs, and a blazing core in the chest.
        _buildFlameElemental() {
            const p = this.profile;
            const flame = this._skinMat(p.bodyColor, 0.4); flame.emissive = new THREE.Color(p.emissive); flame.emissiveIntensity = 0.9; flame.opacity = 0.85;
            // BODY: a tapering stack of upward flame tongues.
            this.body = new THREE.Group();
            const tiers = [[0.42, 0.7, 0.6], [0.34, 0.7, 1.2], [0.24, 0.7, 1.75], [0.14, 0.55, 2.15]];
            for (const [r, h, y] of tiers) { const t = new THREE.Mesh(new THREE.ConeGeometry(r, h, 9), flame); t.position.y = y; this.body.add(t); }
            this.bodyGroup.add(this.body);
            // ARMS: ember claws - bright flickering tongues thrusting outward.
            this.arms = new THREE.Group();
            for (const sx of [-1, 1]) { const a = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 7), this._mat(p.accent, 0.9, 0.3, p.accent)); a.position.set(sx * 0.42, 1.35, 0.1); a.rotation.z = sx * 1.1; a._sx = sx; this.arms.add(a); }
            this.bodyGroup.add(this.arms);
            // LEGS: a flaring ash-and-ember skirt (cone base) instead of feet.
            this.legs = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.85, 12), this._mat(0x551a08, 0.92, 0.7, 0xaa3000)); this.legs.position.y = 0.42; this.bodyGroup.add(this.legs);
            // Drifting ember sparks.
            this.embers = new THREE.Group();
            for (let i = 0; i < 9; i++) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), this._mat(p.accent, 0.9, 0.2, p.accent)); e.position.set((this.idRand() - 0.5) * 0.9, 0.6 + this.idRand() * 1.8, (this.idRand() - 0.5) * 0.6); e._t = this.idRand(); this.embers.add(e); }
            this.bodyGroup.add(this.embers);
            // CORE: blazing heart in the chest.
            this.core = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 14), this._mat(p.coreColor, 1.0, 0.1, p.coreColor)); this.core.position.y = 1.2; this.bodyGroup.add(this.core);
            this._partMeshMap = { CORE: this.core, BODY: this.body, EMBER_ARMS: this.arms, ASH_LEGS: this.legs };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.body, this.arms, this.legs, this.embers] },
                { gone: ['BODY'], hide: [this.body, this.embers] },
                { gone: ['EMBER_ARMS'], hide: [this.arms] },
                { gone: ['ASH_LEGS'], hide: [this.legs] }
            ];
        }

        // ── Luck Elemental: golden shimmering ethereal being ────────────────
        // A diamond-faceted golden upper form over a tapering lower wisp, two
        // coin-tipped appendages, a halo of orbiting coins, and a clover glow.
        _buildLuckElemental() {
            const p = this.profile;
            const gold = this._skinMat(p.bodyColor, 0.15); gold.metalness = 0.6; gold.emissive = new THREE.Color(0x553300); gold.emissiveIntensity = 0.3; gold.opacity = 0.85;
            // UPPER_FORM: an octahedron gem head/torso.
            this.upper = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), gold); this.upper.position.y = 1.25; this.upper.scale.set(0.9, 1.3, 0.9); this.bodyGroup.add(this.upper);
            // LOWER_FORM: a downward tapering wisp.
            this.lower = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.1, 12), gold); this.lower.rotation.x = Math.PI; this.lower.position.y = 0.55; this.bodyGroup.add(this.lower);
            const mkCoin = () => { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.04, 16), this._mat(p.bodyColor, 1.0, 0.2, 0x553300)); c.rotation.x = Math.PI / 2; return c; };
            // Appendages: thin golden arms tipped with a spinning coin.
            this.larm = new THREE.Group(); const la = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8), gold); la.position.set(-0.45, 1.15, 0); la.rotation.z = 0.7; this.larm.add(la); const lc = mkCoin(); lc.position.set(-0.66, 0.95, 0); this.larm.add(lc); this.larm._coin = lc; this.bodyGroup.add(this.larm);
            this.rarm = new THREE.Group(); const ra = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8), gold); ra.position.set(0.45, 1.15, 0); ra.rotation.z = -0.7; this.rarm.add(ra); const rc = mkCoin(); rc.position.set(0.66, 0.95, 0); this.rarm.add(rc); this.rarm._coin = rc; this.bodyGroup.add(this.rarm);
            // Orbiting halo of floating coins.
            this.coins = new THREE.Group();
            for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const c = mkCoin(); c.position.set(Math.cos(a) * 0.7, 1.5 + Math.sin(a * 2) * 0.15, Math.sin(a) * 0.7); c._a = a; this.coins.add(c); }
            this.bodyGroup.add(this.coins);
            // Four-leaf-clover glow: four green heart-ish discs around the core.
            this.clover = new THREE.Group();
            for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), this._mat(p.accent, 0.85, 0.2, p.accent)); leaf.scale.set(1, 1.2, 0.4); leaf.position.set(Math.cos(a) * 0.13, 1.25, Math.sin(a) * 0.13); this.clover.add(leaf); }
            this.bodyGroup.add(this.clover);
            // CORE.
            this.core = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 14), this._mat(p.coreColor, 1.0, 0.1, p.emissive)); this.core.position.y = 1.25; this.bodyGroup.add(this.core);
            this._partMeshMap = { CORE: this.core, UPPER_FORM: this.upper, LOWER_FORM: this.lower, LEFT_APPENDAGE: this.larm, RIGHT_APPENDAGE: this.rarm };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.upper, this.lower, this.larm, this.rarm, this.coins, this.clover] },
                { gone: ['UPPER_FORM'], hide: [this.upper, this.clover] },
                { gone: ['LOWER_FORM'], hide: [this.lower] },
                { gone: ['LEFT_APPENDAGE'], hide: [this.larm] },
                { gone: ['RIGHT_APPENDAGE'], hide: [this.rarm] }
            ];
        }

        // ── Molten Juggernaut: massive fire-and-rock elemental ──────────────
        // A cracked rocky boulder-torso glowing with magma seams, stubby legs,
        // and two huge boulder fists. Heavy, broad, low.
        _buildMoltenJuggernaut() {
            const p = this.profile;
            const rock = this._skinMat(p.bodyColor, 0.95); rock.opacity = 1.0; rock.emissive = new THREE.Color(p.emissive); rock.emissiveIntensity = 0.25;
            // UPPER_FORM: a blocky cracked boulder torso + craggy shoulders.
            this.upper = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6, 0), rock); torso.position.y = 1.25; torso.scale.set(1.2, 1.1, 1.0); this.upper.add(torso);
            for (const sx of [-1, 1]) { const sh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32, 0), rock); sh.position.set(sx * 0.62, 1.55, 0); this.upper.add(sh); }
            // Glowing magma seams across the torso.
            for (let i = 0; i < 5; i++) { const seam = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.05), this._mat(p.coreColor, 1.0, 0.3, p.coreColor)); seam.position.set((this.idRand() - 0.5) * 0.6, 1.0 + this.idRand() * 0.6, 0.55); seam.rotation.z = (this.idRand() - 0.5) * 1.5; this.upper.add(seam); }
            this.bodyGroup.add(this.upper);
            // LOWER_FORM: stubby twin rock legs.
            this.lower = new THREE.Group();
            for (const sx of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.6, 8), rock); leg.position.set(sx * 0.3, 0.35, 0); this.lower.add(leg); }
            this.bodyGroup.add(this.lower);
            // Appendages: huge boulder fists on short magma arms.
            this.larm = new THREE.Group(); const lf = new THREE.Mesh(new THREE.DodecahedronGeometry(0.34, 0), rock); lf.position.set(-0.85, 0.85, 0.1); this.larm.add(lf); const la = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.4, 6), this._mat(p.accent, 1.0, 0.4, p.accent)); la.position.set(-0.7, 1.2, 0.05); la.rotation.z = 0.9; this.larm.add(la); this.bodyGroup.add(this.larm);
            this.rarm = new THREE.Group(); const rf = new THREE.Mesh(new THREE.DodecahedronGeometry(0.34, 0), rock); rf.position.set(0.85, 0.85, 0.1); this.rarm.add(rf); const raM = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.4, 6), this._mat(p.accent, 1.0, 0.4, p.accent)); raM.position.set(0.7, 1.2, 0.05); raM.rotation.z = -0.9; this.rarm.add(raM); this.bodyGroup.add(this.rarm);
            // CORE: cracked magma heart.
            this.core = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 14), this._mat(p.coreColor, 1.0, 0.2, p.coreColor)); this.core.position.set(0, 1.25, 0.35); this.bodyGroup.add(this.core);
            this._partMeshMap = { CORE: this.core, UPPER_FORM: this.upper, LOWER_FORM: this.lower, LEFT_APPENDAGE: this.larm, RIGHT_APPENDAGE: this.rarm };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.upper, this.lower, this.larm, this.rarm] },
                { gone: ['UPPER_FORM'], hide: [this.upper, this.larm, this.rarm] },
                { gone: ['LOWER_FORM'], hide: [this.lower] },
                { gone: ['LEFT_APPENDAGE'], hide: [this.larm] },
                { gone: ['RIGHT_APPENDAGE'], hide: [this.rarm] }
            ];
        }

        // ── Quantum Fluctuation: unstable flickering violet entity ──────────
        // A jittering icosahedron body with phantom after-image shells, two
        // crackling probability arms, a torus electron-cloud skirt, glitch core.
        _buildQuantumFluctuation() {
            const p = this.profile;
            const phase = this._skinMat(p.bodyColor, 0.25); phase.emissive = new THREE.Color(p.emissive); phase.emissiveIntensity = 0.7; phase.opacity = 0.7;
            // BODY: a flickering icosahedron + ghost after-image shells.
            this.body = new THREE.Group();
            this.bodyCore = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), phase); this.bodyCore.position.y = 1.2; this.body.add(this.bodyCore);
            this.shells = [];
            for (let i = 0; i < 2; i++) { const sh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), this._mat(p.accent, 0.25, 0.3, p.accent)); sh.position.y = 1.2; this.shells.push(sh); this.body.add(sh); }
            this.bodyGroup.add(this.body);
            // ARMS: crackling probability bolts (zig of small boxes).
            this.arms = new THREE.Group();
            for (const sx of [-1, 1]) { const arm = new THREE.Group(); for (let i = 0; i < 4; i++) { const seg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), this._mat(p.accent, 0.9, 0.2, p.accent)); seg.position.set(sx * (0.42 + i * 0.14), 1.2 + ((i % 2) ? 0.12 : -0.12), 0); arm.add(seg); } arm._sx = sx; this.arms.add(arm); }
            this.bodyGroup.add(this.arms);
            // LEGS: an electron-cloud torus skirt instead of feet.
            this.legs = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.08, 8, 20), this._mat(p.accent, 0.6, 0.3, p.accent)); this.legs.rotation.x = Math.PI / 2; this.legs.position.y = 0.45; this.bodyGroup.add(this.legs);
            // Orbiting probability particles.
            this.particles = new THREE.Group();
            for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; const pt = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), this._mat(p.coreColor, 0.9, 0.2, p.coreColor)); pt.position.set(Math.cos(a) * 0.6, 1.2, Math.sin(a) * 0.6); pt._a = a; this.particles.add(pt); }
            this.bodyGroup.add(this.particles);
            // CORE: a small glitching cube.
            this.core = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), this._mat(p.coreColor, 1.0, 0.1, p.coreColor)); this.core.position.y = 1.2; this.bodyGroup.add(this.core);
            this._partMeshMap = { CORE: this.core, BODY: this.body, EMBER_ARMS: this.arms, ASH_LEGS: this.legs };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.body, this.arms, this.legs, this.particles] },
                { gone: ['BODY'], hide: [this.body, this.particles] },
                { gone: ['EMBER_ARMS'], hide: [this.arms] },
                { gone: ['ASH_LEGS'], hide: [this.legs] }
            ];
        }

        // ── Swamp Gas Elemental: sickly green hazy methane cloud ────────────
        // A diffuse billowing cloud of overlapping puff-spheres with rising
        // spore motes, drooping gas-tendril appendages, and a soft glowing core.
        _buildSwampGasElemental() {
            const p = this.profile;
            const gas = this._mat(p.bodyColor, 0.4, 0.9); gas.emissive = new THREE.Color(p.emissive); gas.emissiveIntensity = 0.4;
            // UPPER_FORM: a billowing cloud of overlapping puffs.
            this.upper = new THREE.Group();
            this.puffs = [];
            for (let i = 0; i < 7; i++) { const r = 0.24 + this.idRand() * 0.18; const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 12), gas); puff.position.set((this.idRand() - 0.5) * 0.7, 1.1 + (this.idRand() - 0.5) * 0.7, (this.idRand() - 0.5) * 0.5); puff._ph = this.idRand() * 6.28; this.puffs.push(puff); this.upper.add(puff); }
            this.bodyGroup.add(this.upper);
            // LOWER_FORM: a settling heavier gas pool drifting to the floor.
            this.lower = new THREE.Group();
            for (let i = 0; i < 4; i++) { const r = 0.3 + this.idRand() * 0.12; const low = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), gas); low.position.set((this.idRand() - 0.5) * 0.8, 0.2 + this.idRand() * 0.3, (this.idRand() - 0.5) * 0.5); low.scale.y = 0.6; this.lower.add(low); }
            this.bodyGroup.add(this.lower);
            // Appendages: drooping wispy gas tendrils.
            this.larm = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.7, 8), gas); this.larm.position.set(-0.5, 0.85, 0); this.larm.rotation.z = 2.5; this.bodyGroup.add(this.larm);
            this.rarm = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.7, 8), gas); this.rarm.position.set(0.5, 0.85, 0); this.rarm.rotation.z = -2.5; this.bodyGroup.add(this.rarm);
            // Rising spore motes.
            this.spores = new THREE.Group();
            for (let i = 0; i < 10; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), this._mat(p.accent, 0.9, 0.2, p.accent)); m.position.set((this.idRand() - 0.5) * 1.0, 0.4 + this.idRand() * 1.4, (this.idRand() - 0.5) * 0.7); m._t = this.idRand(); this.spores.add(m); }
            this.bodyGroup.add(this.spores);
            // CORE: a soft diffuse glow.
            this.core = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 14), this._mat(p.coreColor, 0.85, 0.3, p.coreColor)); this.core.position.y = 1.1; this.bodyGroup.add(this.core);
            this._partMeshMap = { CORE: this.core, UPPER_FORM: this.upper, LOWER_FORM: this.lower, LEFT_APPENDAGE: this.larm, RIGHT_APPENDAGE: this.rarm };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.upper, this.lower, this.larm, this.rarm, this.spores] },
                { gone: ['UPPER_FORM'], hide: [this.upper, this.spores] },
                { gone: ['LOWER_FORM'], hide: [this.lower] },
                { gone: ['LEFT_APPENDAGE'], hide: [this.larm] },
                { gone: ['RIGHT_APPENDAGE'], hide: [this.rarm] }
            ];
        }

        // ── Tsunami Guardian: a colossal towering wave with a curling crest ──
        // A tall C-curved wall of water whose top scrolls forward into a curling
        // foam crest; two massive water arms reach out; twin column legs anchor it.
        _buildTsunamiGuardian() {
            const p = this.profile;
            const water = this._skinMat(p.bodyColor, 0.12); water.opacity = 0.62;
            const foam = this._mat(p.accent, 0.85, 0.3, p.accent);
            // BODY: stacked widening rings forming a leaning wave wall.
            this.body = new THREE.Group();
            const rings = [[0.55, 0.3], [0.6, 0.85], [0.62, 1.4], [0.55, 1.95], [0.42, 2.45]];
            for (let i = 0; i < rings.length; i++) { const [r, y] = rings[i]; const seg = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.06, 0.6, 16), water); seg.position.set(i * 0.06, y, -i * 0.05); this.body.add(seg); }
            // Curling crest: a forward-leaning torus lip of foam at the top.
            this.crest = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.16, 10, 18, Math.PI * 1.3), foam);
            this.crest.rotation.set(Math.PI / 2.2, 0, 0); this.crest.position.set(0.15, 2.6, 0.3); this.body.add(this.crest);
            this.bodyGroup.add(this.body);
            // ARMS: two massive curved water-arms sweeping outward (one shared slot).
            this.arms = new THREE.Group();
            for (const sx of [-1, 1]) { const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 1.3, 12), water); arm.position.set(sx * 0.7, 1.7, 0.25); arm.rotation.z = sx * 1.0; arm._sx = sx; this.arms.add(arm); const fist = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12), water); fist.position.set(sx * 1.15, 2.1, 0.45); this.arms.add(fist); }
            this.bodyGroup.add(this.arms);
            // LEGS: twin water-column legs sinking into the floor.
            this.lleg = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.34, 0.9, 12), water); this.lleg.position.set(-0.28, 0.1, 0); this.bodyGroup.add(this.lleg);
            this.rleg = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.34, 0.9, 12), water); this.rleg.position.set(0.28, 0.1, 0); this.bodyGroup.add(this.rleg);
            // Spray droplets along the crest.
            this.spray = new THREE.Group();
            for (let i = 0; i < 10; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), foam); d.position.set((this.idRand() - 0.5) * 1.0, 2.4 + this.idRand() * 0.6, 0.2 + this.idRand() * 0.5); d._t = this.idRand(); this.spray.add(d); }
            this.bodyGroup.add(this.spray);
            // CORE: bright water-heart deep in the wave.
            this.core = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 14), this._mat(p.coreColor, 1.0, 0.1, p.coreColor)); this.core.position.set(0, 1.4, 0); this.bodyGroup.add(this.core);
            this._partMeshMap = { CORE: this.core, BODY: this.body, WATER_ARMS: this.arms, LEFT_WATER_LEG: this.lleg, RIGHT_WATER_LEG: this.rleg };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.body, this.arms, this.lleg, this.rleg, this.spray] },
                { gone: ['BODY'], hide: [this.body, this.spray] },
                { gone: ['WATER_ARMS'], hide: [this.arms] },
                { gone: ['LEFT_WATER_LEG'], hide: [this.lleg] },
                { gone: ['RIGHT_WATER_LEG'], hide: [this.rleg] }
            ];
        }

        // ── Winter's Harbinger: a pale-blue robed ice mage elemental ────────
        // A flared robed upper form crowned with a ring of icicles, two thin
        // ice-staff arms, and a frozen swirling vortex lower body (no feet).
        _buildWintersHarbinger() {
            const p = this.profile;
            const ice = this._skinMat(p.bodyColor, 0.2); ice.opacity = 0.85;
            const frost = this._mat(p.accent, 0.9, 0.1, p.accent);
            // UPPER_FORM: a flared robe cone + hood-sphere head.
            this.upper = new THREE.Group();
            const robe = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.3, 14), ice); robe.position.y = 1.15; this.upper.add(robe);
            const hood = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 16), ice); hood.position.y = 1.95; hood.scale.set(0.9, 1.1, 0.9); this.upper.add(hood);
            const face = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 14), this._mat(0x0a1a2a, 0.9, 0.5)); face.position.set(0, 1.9, 0.16); this.upper.add(face);
            // Icicle crown: a ring of downward spikes around the hood.
            for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const ic = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.32, 6), frost); ic.position.set(Math.cos(a) * 0.26, 2.18, Math.sin(a) * 0.26); ic.rotation.x = Math.PI; this.upper.add(ic); }
            this.bodyGroup.add(this.upper);
            this._eyeDot(this.upper, -0.06, 1.92, 0.27, 0.04, 0x66ccff);
            this._eyeDot(this.upper, 0.06, 1.92, 0.27, 0.04, 0x66ccff);
            // Appendages: thin frost-staff arms (left holds a glowing ice orb).
            this.larm = new THREE.Group(); const lh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 8), frost); lh.position.set(-0.42, 1.3, 0.1); lh.rotation.z = 0.25; this.larm.add(lh); const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), this._mat(p.coreColor, 0.8, 0.1, p.coreColor)); orb.position.set(-0.55, 1.78, 0.1); this.larm.add(orb); this.larm._orb = orb; this.bodyGroup.add(this.larm);
            this.rarm = new THREE.Group(); const rh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.55, 8), ice); rh.position.set(0.42, 1.3, 0.1); rh.rotation.z = -0.6; this.rarm.add(rh); this.bodyGroup.add(this.rarm);
            // LOWER_FORM: a frozen swirling vortex (twisted tapering helix of shards).
            this.lower = new THREE.Group();
            for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 3; const r = 0.36 - i * 0.03; const sh = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 6), ice); sh.position.set(Math.cos(a) * r, 0.65 - i * 0.07, Math.sin(a) * r); sh.rotation.set(0.3, a, 0.3); this.lower.add(sh); }
            this.bodyGroup.add(this.lower);
            // CORE: a cold glowing snowflake heart.
            this.core = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), this._mat(p.coreColor, 1.0, 0.1, p.coreColor)); this.core.position.y = 1.2; this.bodyGroup.add(this.core);
            this._partMeshMap = { CORE: this.core, UPPER_FORM: this.upper, LOWER_FORM: this.lower, LEFT_APPENDAGE: this.larm, RIGHT_APPENDAGE: this.rarm };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.upper, this.lower, this.larm, this.rarm] },
                { gone: ['UPPER_FORM'], hide: [this.upper, this.larm, this.rarm] },
                { gone: ['LOWER_FORM'], hide: [this.lower] },
                { gone: ['LEFT_APPENDAGE'], hide: [this.larm] },
                { gone: ['RIGHT_APPENDAGE'], hide: [this.rarm] }
            ];
        }

        // ── Zephyr Djinn: a translucent wind djinn over a vortex tail ────────
        // A near-invisible wispy upper torso/head, two trailing wind-ribbon arms,
        // tapering into a swirling air-vortex tail (stacked shrinking rings).
        _buildZephyrDjinn() {
            const p = this.profile;
            const air = this._skinMat(p.bodyColor, 0.5); air.opacity = 0.3; air.emissive = new THREE.Color(p.emissive); air.emissiveIntensity = 0.3;
            const wisp = this._mat(p.accent, 0.35, 0.5, p.accent);
            // UPPER_FORM: a faint torso ovoid + small head.
            this.upper = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 16), air); torso.position.y = 1.5; torso.scale.set(0.9, 1.2, 0.8); this.upper.add(torso);
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 14), air); head.position.y = 2.05; this.upper.add(head);
            this.bodyGroup.add(this.upper);
            this._eyeDot(this.upper, -0.08, 2.07, 0.2, 0.045, 0xeafcff);
            this._eyeDot(this.upper, 0.08, 2.07, 0.2, 0.045, 0xeafcff);
            // Appendages: trailing curled wind-ribbon arms (torus arcs).
            this.larm = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 8, 16, Math.PI * 1.2), wisp); this.larm.position.set(-0.45, 1.55, 0); this.larm.rotation.set(0, 0.4, 0.8); this.bodyGroup.add(this.larm);
            this.rarm = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 8, 16, Math.PI * 1.2), wisp); this.rarm.position.set(0.45, 1.55, 0); this.rarm.rotation.set(0, -0.4, -0.8); this.bodyGroup.add(this.rarm);
            // LOWER_FORM: a swirling air vortex of shrinking offset rings.
            this.lower = new THREE.Group(); this.rings = [];
            for (let i = 0; i < 6; i++) { const r = 0.42 - i * 0.06; const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.04, 8, 18), wisp); ring.rotation.x = Math.PI / 2; ring.position.y = 1.0 - i * 0.17; ring._a = i; this.rings.push(ring); this.lower.add(ring); }
            this.bodyGroup.add(this.lower);
            // Drifting dust motes swept up by the vortex.
            this.motes = new THREE.Group();
            for (let i = 0; i < 9; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), wisp); const a = this.idRand() * 6.28; m.position.set(Math.cos(a) * 0.3, this.idRand() * 1.6, Math.sin(a) * 0.3); m._a = a; m._y = m.position.y; this.motes.add(m); }
            this.bodyGroup.add(this.motes);
            // CORE: a faint swirling glow.
            this.core = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 14), this._mat(p.coreColor, 0.7, 0.2, p.coreColor)); this.core.position.y = 1.45; this.bodyGroup.add(this.core);
            this._partMeshMap = { CORE: this.core, UPPER_FORM: this.upper, LOWER_FORM: this.lower, LEFT_APPENDAGE: this.larm, RIGHT_APPENDAGE: this.rarm };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.upper, this.lower, this.larm, this.rarm, this.motes] },
                { gone: ['UPPER_FORM'], hide: [this.upper] },
                { gone: ['LOWER_FORM'], hide: [this.lower, this.motes] },
                { gone: ['LEFT_APPENDAGE'], hide: [this.larm] },
                { gone: ['RIGHT_APPENDAGE'], hide: [this.rarm] }
            ];
        }

        // ── Earth Sentinel: a mountainous golem of stacked boulders ─────────
        // A cluster of huge rough rock chunks forming a hulking torso with a
        // glowing core seam, stubby boulder legs, and two craggy rock fists.
        _buildEarthSentinel() {
            const p = this.profile;
            const rock = this._skinMat(p.bodyColor, 0.98); rock.opacity = 1.0;
            const glow = this._mat(p.coreColor, 1.0, 0.3, p.coreColor);
            // UPPER_FORM: a stack/cluster of dodecahedron boulders.
            this.upper = new THREE.Group();
            const chunks = [[0.6, 0, 1.35, 0], [0.4, -0.45, 1.7, 0.1], [0.4, 0.45, 1.7, -0.1], [0.34, 0, 2.05, 0], [0.3, -0.3, 1.1, 0], [0.3, 0.3, 1.1, 0]];
            for (const [r, x, y, z] of chunks) { const b = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rock); b.position.set(x, y, z); b.rotation.set(this.idRand() * 3, this.idRand() * 3, this.idRand() * 3); this.upper.add(b); }
            // Glowing molten seam across the chest.
            for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.06, 0.06), glow); s.position.set((this.idRand() - 0.5) * 0.5, 1.2 + this.idRand() * 0.5, 0.58); s.rotation.z = (this.idRand() - 0.5) * 1.4; this.upper.add(s); }
            this.bodyGroup.add(this.upper);
            // LOWER_FORM: two stubby pillar-rock legs.
            this.lower = new THREE.Group();
            for (const sx of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.32, 0.7, 7), rock); leg.position.set(sx * 0.32, 0.4, 0); leg.scale.x = 1.1; this.lower.add(leg); const foot = new THREE.Mesh(new THREE.DodecahedronGeometry(0.26, 0), rock); foot.position.set(sx * 0.32, 0.1, 0.05); this.lower.add(foot); }
            this.bodyGroup.add(this.lower);
            // Appendages: craggy rock fists on short stone arms.
            this.larm = new THREE.Group(); const lf = new THREE.Mesh(new THREE.DodecahedronGeometry(0.36, 0), rock); lf.position.set(-0.9, 0.95, 0.1); this.larm.add(lf); const la = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.5, 6), rock); la.position.set(-0.74, 1.3, 0.05); la.rotation.z = 0.8; this.larm.add(la); this.bodyGroup.add(this.larm);
            this.rarm = new THREE.Group(); const rf = new THREE.Mesh(new THREE.DodecahedronGeometry(0.36, 0), rock); rf.position.set(0.9, 0.95, 0.1); this.rarm.add(rf); const ra = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.5, 6), rock); ra.position.set(0.74, 1.3, 0.05); ra.rotation.z = -0.8; this.rarm.add(ra); this.bodyGroup.add(this.rarm);
            // CORE: a glowing crystal heart embedded in the chest.
            this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), glow); this.core.position.set(0, 1.35, 0.4); this.bodyGroup.add(this.core);
            this._partMeshMap = { CORE: this.core, UPPER_FORM: this.upper, LOWER_FORM: this.lower, LEFT_APPENDAGE: this.larm, RIGHT_APPENDAGE: this.rarm };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.upper, this.lower, this.larm, this.rarm] },
                { gone: ['UPPER_FORM'], hide: [this.upper, this.larm, this.rarm] },
                { gone: ['LOWER_FORM'], hide: [this.lower] },
                { gone: ['LEFT_APPENDAGE'], hide: [this.larm] },
                { gone: ['RIGHT_APPENDAGE'], hide: [this.rarm] }
            ];
        }

        // ── Gale Sentinel: a swirling sentinel of circling razor-wind blades ─
        // A vertical column of orbiting crescent blade-rings around a calm eye
        // core, with twin blade-arm clusters and twin slim air-jet legs.
        _buildGaleSentinel() {
            const p = this.profile;
            const blade = this._mat(p.accent, 0.85, 0.25, p.accent); blade.metalness = 0.4;
            const air = this._skinMat(p.bodyColor, 0.4); air.opacity = 0.35;
            // BODY: stacked rings of orbiting crescent blades around a hollow center.
            this.body = new THREE.Group(); this.bladeRings = [];
            for (let lvl = 0; lvl < 4; lvl++) { const ring = new THREE.Group(); const count = 5; const r = 0.5; const y = 0.9 + lvl * 0.4; for (let i = 0; i < count; i++) { const a = (i / count) * Math.PI * 2; const bl = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.03, 6, 12, Math.PI), blade); bl.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); bl.rotation.set(Math.PI / 2, a, 0.4); ring.add(bl); } ring.position.y = y; ring._dir = (lvl % 2) ? 1 : -1; this.bladeRings.push(ring); this.body.add(ring); }
            this.bodyGroup.add(this.body);
            // Appendages: twin spinning blade-clusters as "arms".
            this.larm = new THREE.Group(); this.rarm = new THREE.Group();
            for (const [grp, sx] of [[this.larm, -1], [this.rarm, 1]]) { for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; const bl = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 6, 10, Math.PI), blade); bl.position.set(sx * 0.85 + Math.cos(a) * 0.16, 1.6, Math.sin(a) * 0.16); bl.rotation.set(Math.PI / 2, a, 0); grp.add(bl); } }
            this.bodyGroup.add(this.larm); this.bodyGroup.add(this.rarm);
            // LEGS: slim downward air-jet cones.
            this.lleg = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.8, 9), air); this.lleg.rotation.x = Math.PI; this.lleg.position.set(-0.2, 0.35, 0); this.bodyGroup.add(this.lleg);
            this.rleg = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.8, 9), air); this.rleg.rotation.x = Math.PI; this.rleg.position.set(0.2, 0.35, 0); this.bodyGroup.add(this.rleg);
            // CORE: a calm eye at the storm's center.
            this.core = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), this._mat(p.coreColor, 1.0, 0.1, p.coreColor)); this.core.position.y = 1.5; this.bodyGroup.add(this.core);
            this._eyeDot(this.bodyGroup, 0, 1.5, 0.18, 0.08, 0x224488);
            this._partMeshMap = { CORE: this.core, BODY: this.body, LEFT_RAIN_ARM: this.larm, RIGHT_RAIN_ARM: this.rarm, LEFT_THUNDER_LEG: this.lleg, RIGHT_THUNDER_LEG: this.rleg };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.body, this.larm, this.rarm, this.lleg, this.rleg] },
                { gone: ['BODY'], hide: [this.body] },
                { gone: ['LEFT_RAIN_ARM'], hide: [this.larm] },
                { gone: ['RIGHT_RAIN_ARM'], hide: [this.rarm] },
                { gone: ['LEFT_THUNDER_LEG'], hide: [this.lleg] },
                { gone: ['RIGHT_THUNDER_LEG'], hide: [this.rleg] }
            ];
        }

        // ── Storm Elemental: a dark storm-cloud humanoid crackling lightning ─
        // A billowing dark cloud torso/head streaked with rain, two jagged
        // lightning-bolt arms and two bolt legs branching from the cloud body.
        _buildStormElemental() {
            const p = this.profile;
            const cloud = this._mat(p.bodyColor, 0.78, 0.95); cloud.emissive = new THREE.Color(p.emissive); cloud.emissiveIntensity = 0.2;
            const bolt = this._mat(p.accent, 1.0, 0.2, p.accent);
            const rain = this._mat(0x88aadd, 0.5, 0.3, 0x4466aa);
            // BODY: a cluster of dark cloud puffs forming torso + head.
            this.body = new THREE.Group(); this.puffs = [];
            const lumps = [[0.5, 0, 1.3], [0.34, -0.4, 1.55], [0.34, 0.4, 1.55], [0.32, 0, 1.95], [0.3, -0.25, 1.0], [0.3, 0.25, 1.0]];
            for (const [r, x, y] of lumps) { const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 12), cloud); puff.position.set(x, y, (this.idRand() - 0.5) * 0.2); puff._ph = this.idRand() * 6.28; this.puffs.push(puff); this.body.add(puff); }
            this.bodyGroup.add(this.body);
            this._eyeDot(this.body, -0.13, 1.95, 0.28, 0.05, p.accent);
            this._eyeDot(this.body, 0.13, 1.95, 0.28, 0.05, p.accent);
            // Helper: a jagged lightning bolt (zig of thin boxes).
            const mkBolt = (sx, baseY, dir) => { const g = new THREE.Group(); let x = 0, y = 0; for (let i = 0; i < 4; i++) { const seg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.34, 0.08), bolt); const nx = x + (i % 2 ? 0.12 : -0.12); const ny = y + dir * 0.3; seg.position.set((x + nx) / 2, (y + ny) / 2, 0); seg.rotation.z = Math.atan2(nx - x, -(ny - y)); g.add(seg); x = nx; y = ny; } g.position.set(sx * 0.5, baseY, 0.1); return g; };
            // Appendages: lightning-bolt arms.
            this.larm = mkBolt(-1, 1.4, 0.4); this.larm.rotation.z = 0.5; this.bodyGroup.add(this.larm);
            this.rarm = mkBolt(1, 1.4, 0.4); this.rarm.rotation.z = -0.5; this.bodyGroup.add(this.rarm);
            // LEGS: lightning-bolt legs branching downward.
            this.lleg = mkBolt(-1, 0.95, -1); this.lleg.position.set(-0.22, 0.95, 0); this.bodyGroup.add(this.lleg);
            this.rleg = mkBolt(1, 0.95, -1); this.rleg.position.set(0.22, 0.95, 0); this.bodyGroup.add(this.rleg);
            // Rain streaks falling through the body.
            this.rain = new THREE.Group();
            for (let i = 0; i < 12; i++) { const drop = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 4), rain); drop.position.set((this.idRand() - 0.5) * 1.0, 0.4 + this.idRand() * 1.5, (this.idRand() - 0.5) * 0.4); drop._t = this.idRand(); this.rain.add(drop); }
            this.bodyGroup.add(this.rain);
            // CORE: a crackling charge at the cloud's heart.
            this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 0), this._mat(p.coreColor, 1.0, 0.1, p.coreColor)); this.core.position.y = 1.35; this.bodyGroup.add(this.core);
            this._partMeshMap = { CORE: this.core, BODY: this.body, LEFT_RAIN_ARM: this.larm, RIGHT_RAIN_ARM: this.rarm, LEFT_THUNDER_LEG: this.lleg, RIGHT_THUNDER_LEG: this.rleg };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.body, this.larm, this.rarm, this.lleg, this.rleg, this.rain] },
                { gone: ['BODY'], hide: [this.body, this.rain] },
                { gone: ['LEFT_RAIN_ARM'], hide: [this.larm] },
                { gone: ['RIGHT_RAIN_ARM'], hide: [this.rarm] },
                { gone: ['LEFT_THUNDER_LEG'], hide: [this.lleg] },
                { gone: ['RIGHT_THUNDER_LEG'], hide: [this.rleg] }
            ];
        }

        // ── Blazing Inferno Elemental: a towering white-hot raging firestorm ─
        // A huge broad-shouldered humanoid pillar of flame: a thick column torso
        // wreathed in a spiral of rising flame sheets, two massive upswept blaze
        // arms ending in claw-flares, a wide roaring fire base, and a blinding core.
        _buildBlazingInfernoElemental() {
            const p = this.profile;
            const white = this._skinMat(p.bodyColor, 0.35); white.emissive = new THREE.Color(p.emissive); white.emissiveIntensity = 1.1; white.opacity = 0.9;
            const hot = this._mat(p.accent, 0.95, 0.1, p.accent);
            // BODY: a tall thick column torso with broad flame shoulders, sheathed in a rising spiral of flame sheets.
            this.body = new THREE.Group();
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.62, 2.0, 14), white); trunk.position.y = 1.6; this.body.add(trunk);
            for (const sx of [-1, 1]) { const sh = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 12), white); sh.position.set(sx * 0.6, 2.35, 0); sh.scale.set(1.0, 0.8, 0.9); this.body.add(sh); }
            // Rising spiral of curved flame sheets hugging the column.
            this.sheets = [];
            for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 4; const r = 0.55 - i * 0.025; const sheet = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.9, 6), hot); sheet.position.set(Math.cos(a) * r, 0.8 + i * 0.22, Math.sin(a) * r); sheet.rotation.set(0.2, a, Math.sin(a) * 0.3); sheet._a = a; sheet._i = i; this.sheets.push(sheet); this.body.add(sheet); }
            this.bodyGroup.add(this.body);
            // ARMS: two massive upswept blaze pillars ending in splayed claw-flares.
            this.arms = new THREE.Group();
            for (const sx of [-1, 1]) { const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.3, 9), white); upper.position.set(sx * 0.95, 2.0, 0.05); upper.rotation.z = sx * 0.7; this.arms.add(upper); for (let c = 0; c < 3; c++) { const claw = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.7, 6), hot); claw.position.set(sx * 1.45, 2.7 + c * 0.12, (c - 1) * 0.18); claw.rotation.z = sx * (0.4 + c * 0.25); this.arms.add(claw); } }
            this.bodyGroup.add(this.arms);
            // LEGS: a wide roaring fire base - a broad cone with a flared ember rim.
            this.legs = new THREE.Group();
            const base = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.1, 14), this._mat(0x9a3000, 0.92, 0.5, 0xff5a00)); base.position.y = 0.55; this.legs.add(base);
            for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const tongue = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.55, 6), hot); tongue.position.set(Math.cos(a) * 0.72, 0.4, Math.sin(a) * 0.72); tongue.rotation.x = Math.cos(a) * 0.3; tongue.rotation.z = Math.sin(a) * 0.3; this.legs.add(tongue); }
            this.bodyGroup.add(this.legs);
            // Blinding ember storm drifting upward.
            this.embers = new THREE.Group();
            for (let i = 0; i < 14; i++) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), hot); e.position.set((this.idRand() - 0.5) * 1.4, 0.6 + this.idRand() * 2.6, (this.idRand() - 0.5) * 0.9); e._t = this.idRand(); this.embers.add(e); }
            this.bodyGroup.add(this.embers);
            // CORE: a blinding white-hot heart.
            this.core = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 16), this._mat(p.coreColor, 1.0, 0.05, p.coreColor)); this.core.position.y = 1.7; this.bodyGroup.add(this.core);
            this._partMeshMap = { CORE: this.core, BODY: this.body, EMBER_ARMS: this.arms, ASH_LEGS: this.legs };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.body, this.arms, this.legs, this.embers] },
                { gone: ['BODY'], hide: [this.body, this.embers] },
                { gone: ['EMBER_ARMS'], hide: [this.arms] },
                { gone: ['ASH_LEGS'], hide: [this.legs] }
            ];
        }

        // ── The Bascape Flame: a vengeful aircraft-wreck fire ───────────────
        // An oily black-and-orange flame: a hunched smoke-blackened torso pierced
        // by twisted wreckage struts, two ragged ember-claw arms, a smouldering
        // debris-pool base, and trailing black smoke plumes.
        _buildBascapeFlame() {
            const p = this.profile;
            const soot = this._skinMat(p.bodyColor, 0.85); soot.opacity = 0.92; soot.emissive = new THREE.Color(p.emissive); soot.emissiveIntensity = 0.35;
            const ember = this._mat(p.accent, 0.92, 0.25, p.accent);
            const metal = this._mat(0x3a3430, 1.0, 0.4, 0x110a06); metal.metalness = 0.7;
            // BODY: a hunched soot torso ovoid with an ember-veined upper, pierced by twisted wreckage struts.
            this.body = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 14), soot); torso.position.y = 1.25; torso.scale.set(0.95, 1.5, 0.85); this.body.add(torso);
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), soot); head.position.y = 1.95; head.scale.set(0.9, 1.0, 0.85); this.body.add(head);
            // Ember veins flickering through the soot.
            for (let i = 0; i < 6; i++) { const v = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.4, 0.04), ember); v.position.set((this.idRand() - 0.5) * 0.6, 1.0 + this.idRand() * 1.1, 0.36); v.rotation.z = (this.idRand() - 0.5) * 1.6; this.body.add(v); }
            // Twisted wreckage struts jutting from the torso (bent fuselage shards).
            this.struts = [];
            for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.6; const s = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.7, 0.07), metal); s.position.set(Math.cos(a) * 0.5, 1.3 + Math.sin(a) * 0.4, Math.sin(a) * 0.35); s.rotation.set(a * 0.5, a, 0.8 + Math.sin(a)); this.struts.push(s); this.body.add(s); }
            this.bodyGroup.add(this.body);
            this._eyeDot(this.body, -0.1, 1.97, 0.22, 0.05, p.accent);
            this._eyeDot(this.body, 0.1, 1.97, 0.22, 0.05, p.accent);
            // ARMS: ragged ember-claw arms - soot upper with splayed flame talons.
            this.arms = new THREE.Group();
            for (const sx of [-1, 1]) { const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, 0.7, 7), soot); upper.position.set(sx * 0.5, 1.35, 0.1); upper.rotation.z = sx * 0.8; this.arms.add(upper); for (let c = 0; c < 3; c++) { const talon = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.45, 5), ember); talon.position.set(sx * 0.78, 1.05 + c * 0.08, (c - 1) * 0.14); talon.rotation.z = sx * (1.2 + c * 0.2); this.arms.add(talon); } }
            this.bodyGroup.add(this.arms);
            // LEGS: a smouldering debris-pool base - a low charred mound with scattered metal scrap.
            this.legs = new THREE.Group();
            const pool = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), this._mat(0x100c0a, 0.95, 0.8, 0x551800)); pool.position.y = 0.18; pool.scale.set(1.2, 0.45, 1.0); this.legs.add(pool);
            for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const scrap = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.1), metal); scrap.position.set(Math.cos(a) * 0.5, 0.12, Math.sin(a) * 0.4); scrap.rotation.set(0, a, (this.idRand() - 0.5) * 0.6); this.legs.add(scrap); }
            this.bodyGroup.add(this.legs);
            // Trailing black smoke plumes rising and dissipating.
            this.smoke = new THREE.Group();
            for (let i = 0; i < 8; i++) { const puff = new THREE.Mesh(new THREE.SphereGeometry(0.16 + this.idRand() * 0.1, 8, 8), this._mat(0x0a0807, 0.5, 0.95)); puff.position.set((this.idRand() - 0.5) * 0.6, 1.8 + this.idRand() * 1.4, (this.idRand() - 0.5) * 0.4); puff._t = this.idRand(); this.smoke.add(puff); }
            this.bodyGroup.add(this.smoke);
            // CORE: a sullen vengeful glow.
            this.core = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 14), this._mat(p.coreColor, 1.0, 0.1, p.coreColor)); this.core.position.y = 1.2; this.bodyGroup.add(this.core);
            this._partMeshMap = { CORE: this.core, BODY: this.body, EMBER_ARMS: this.arms, ASH_LEGS: this.legs };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.body, this.arms, this.legs, this.smoke] },
                { gone: ['BODY'], hide: [this.body, this.smoke] },
                { gone: ['EMBER_ARMS'], hide: [this.arms] },
                { gone: ['ASH_LEGS'], hide: [this.legs] }
            ];
        }

        // ── Elemental spirit/construct: name-driven (element prefix + form word) ─
        _buildElemSpirit() {
            const p = this.profile, s = p.spec || {}, ac = p.accent, bc = p.bodyColor, form = s.form || 'spirit';
            const mat = this._skinMat(bc, 0.4);
            const parts = [];
            const core = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 14), this._mat(ac, 1, 0.1, ac));
            if (form === 'sentinel' || form === 'construct') {
                this.body = new THREE.Mesh(form === 'construct' ? new THREE.DodecahedronGeometry(0.55, 0) : new THREE.BoxGeometry(0.7, 0.95, 0.55), mat);
                this.body.position.y = 1.0; this.bodyGroup.add(this.body); parts.push(this.body);
                // The head rests on the torso and the arms hang off its sides.
                // Both used to be set out far enough to leave a gap of air
                // where the neck and the shoulders should be.
                this.head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), mat); this.head.position.y = 1.66; this.bodyGroup.add(this.head); parts.push(this.head);
                this._eyeDot(this.head, -0.1, 0.05, 0.22, 0.05, ac); this._eyeDot(this.head, 0.1, 0.05, 0.22, 0.05, ac);
                for (const sx of [-1, 1]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.18), mat); arm.position.set(sx * 0.43, 1.0, 0); this.bodyGroup.add(arm); parts.push(arm); }
                core.position.set(0, 1.0, 0.32); this.bodyGroup.add(core); parts.push(core); this.core = core;
            } else if (form === 'conduit') {
                // Each crystal steps by its own half-height plus the next
                // one's, so the column stays one body as they shrink: a fixed
                // step left the upper two floating above the conduit.
                this.body = new THREE.Group(); let y = 0.45, r = 0.32;
                for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.OctahedronGeometry(r, 0), this._mat(ac, 0.85, 0.1, ac)); c.position.y = y; this.body.add(c); const next = r * 0.78; y += (r + next) * 0.86; r = next; }
                this.bodyGroup.add(this.body); parts.push(this.body);
                core.position.y = 1.0; this.bodyGroup.add(core); parts.push(core); this.core = core; this.head = this.body;
            } else if (form === 'sylph') {
                this.body = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.5, 10), mat); this.body.material.opacity = 0.55; this.body.position.y = 0.85; this.bodyGroup.add(this.body); parts.push(this.body);
                this.head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12), mat); this.head.material.opacity = 0.55; this.head.position.y = 1.7; this.bodyGroup.add(this.head); parts.push(this.head);
                this._eyeDot(this.head, -0.09, 0.03, 0.2, 0.045, ac); this._eyeDot(this.head, 0.09, 0.03, 0.2, 0.045, ac);
                core.position.y = 1.0; this.bodyGroup.add(core); parts.push(core); this.core = core;
            } else {
                core.scale.set(1.3, 1.5, 1.3); core.position.y = 1.15; this.bodyGroup.add(core); parts.push(core); this.core = core; this.head = core;
                this.wisps = new THREE.Group();
                for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const w = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), this._mat(ac, 0.6, 0.1, ac)); w.position.set(Math.cos(a) * 0.42, 1.15 + Math.sin(i) * 0.4, Math.sin(a) * 0.42); this.wisps.add(w); }
                this.bodyGroup.add(this.wisps); parts.push(this.wisps);
                this._eyeDot(core, -0.08, 0.05, 0.18, 0.04, 0xffffff); this._eyeDot(core, 0.08, 0.05, 0.18, 0.04, 0xffffff);
            }
            this._partMeshMap = { CORE: this.core, BODY: this.body || this.core, HEAD: this.head || this.core, MASS: this.core, TORSO: this.body || this.core, NUCLEUS: this.core };
            this._cascadeRules = [{ gone: ['CORE', 'NUCLEUS', 'BODY', 'MASS', 'TORSO'], hide: parts }, { gone: ['HEAD'], hide: [this.head].filter(Boolean) }];
        }

        animatePose(deltaTime) {
            if (this._baseY === null) this._baseY = this.model.position.y;
            const t = this.animTime;

            let growth = 1.0;
            if (this.currentAnimation === 'spawn') growth = Math.min(1.0, t / 0.7);
            this.applyModelScale(growth);

            if (this.variant) { this._animateVariant(t); return; }

            // Hover bob + slow turn.
            let bob = Math.sin(t * 1.7) * 0.1;
            if (this.currentAnimation === 'attack') bob += Math.sin(t * 9) * 0.12;
            else if (this.currentAnimation === 'specialattack') bob += Math.sin(t * 12) * 0.22;
            else if (this.currentAnimation === 'hit') bob += Math.sin(t * 26) * Math.exp(-t * 6) * 0.18;
            this.model.position.y = this._baseY + bob * this.scale;

            // Core pulses; limbs flutter.
            if (this.core && this.core.material) {
                this.core.material.emissiveIntensity = 1.0 + Math.sin(t * 4) * 0.5;
                const cs = 1.0 + Math.sin(t * 5) * 0.12;
                this.core.scale.setScalar(cs);
            }
            if (this.larm && this.larm.visible) this.larm.rotation.z = 0.7 + Math.sin(t * 3) * 0.2;
            if (this.rarm && this.rarm.visible) this.rarm.rotation.z = -0.7 - Math.sin(t * 3) * 0.2;
            if (this.body && this.body.visible) {
                const wob = 1.0 + Math.sin(t * 2.3) * 0.05;
                this.body.scale.set(wob, 1.5 / wob, wob);
            }
        }

        // Idle flavour for the bespoke unique elementals.
        _animateVariant(t) {
            const fast = (this.currentAnimation === 'attack' || this.currentAnimation === 'specialattack');
            let bob = Math.sin(t * 1.6) * 0.09;
            if (fast) bob += Math.sin(t * 10) * 0.1;
            else if (this.currentAnimation === 'hit') bob += Math.sin(t * 24) * Math.exp(-t * 6) * 0.16;
            this.model.position.y = this._baseY + bob * this.scale;
            if (this.core && this.core.material) this.core.material.emissiveIntensity = 0.9 + Math.sin(t * 4) * 0.5;

            switch (this.variant) {
                case 'elemspirit':
                    if (this.wisps) this.wisps.rotation.y = t * 1.2;
                    if (this.head && this.head !== this.core && this.head.rotation) this.head.rotation.y = Math.sin(t * 1.4) * 0.2;
                    break;
                case 'waternymph':
                    if (this.arms) this.arms.children.forEach(a => { a.rotation.z = a._sx * (0.6 + Math.sin(t * 2.2) * 0.25); });
                    if (this.hair) this.hair.children.forEach((s, i) => { s.position.y = 1.4 + Math.sin(t * 3 + s._a) * 0.05; });
                    if (this.body) this.body.rotation.z = Math.sin(t * 1.4) * 0.05;
                    break;
                case 'flameelemental':
                    if (this.body) this.body.children.forEach((tng, i) => { tng.scale.x = tng.scale.z = 1 + Math.sin(t * 8 + i * 1.3) * 0.12; });
                    if (this.embers) this.embers.children.forEach(e => { e.position.y += 0.02; if (e.position.y > 2.6) e.position.y = 0.6; });
                    if (this.arms) this.arms.children.forEach(a => { a.rotation.z = a._sx * (1.1 + Math.sin(t * (fast ? 12 : 5)) * 0.25); });
                    break;
                case 'luckelemental':
                    if (this.coins) { this.coins.rotation.y = t * 1.2; this.coins.children.forEach(c => { c.rotation.z = t * 4; }); }
                    if (this.larm && this.larm._coin) this.larm._coin.rotation.z = t * 5;
                    if (this.rarm && this.rarm._coin) this.rarm._coin.rotation.z = -t * 5;
                    if (this.upper) this.upper.rotation.y = t * 0.6;
                    if (this.clover) this.clover.children.forEach(l => { l.material.emissiveIntensity = 0.4 + Math.sin(t * 3) * 0.3; });
                    break;
                case 'moltenjuggernaut':
                    if (this.larm) this.larm.position.y = Math.sin(t * (fast ? 9 : 2)) * 0.08;
                    if (this.rarm) this.rarm.position.y = Math.sin(t * (fast ? 9 : 2) + 1) * 0.08;
                    if (this.upper) this.upper.position.x = Math.sin(t * 1.5) * 0.03;
                    break;
                case 'quantumfluctuation':
                    if (this.bodyCore) this.bodyCore.rotation.set(t * 1.3, t * 1.7, 0);
                    if (this.shells) this.shells.forEach((sh, i) => { const f = (i + 1) * 0.06; sh.position.set(Math.sin(t * 13 + i * 2) * f, 1.2 + Math.cos(t * 11 + i) * f, Math.sin(t * 9 + i) * f); sh.material.opacity = 0.15 + Math.abs(Math.sin(t * 6 + i)) * 0.2; });
                    if (this.particles) { this.particles.rotation.y = -t * 2; }
                    if (this.core) { this.core.rotation.set(t * 5, t * 4, 0); this.core.visible = Math.sin(t * 18) > -0.5; }
                    if (this.arms) this.arms.children.forEach(a => { a.visible = Math.sin(t * 14 + a._sx) > -0.3; });
                    break;
                case 'swampgaselemental':
                    if (this.puffs) this.puffs.forEach((puff, i) => { const s = 1 + Math.sin(t * 1.6 + puff._ph) * 0.12; puff.scale.setScalar(s); puff.position.y += Math.sin(t * 1.2 + i) * 0.002; });
                    if (this.spores) this.spores.children.forEach(m => { m.position.y += 0.012; if (m.position.y > 2.0) m.position.y = 0.4; });
                    if (this.larm) this.larm.rotation.z = 2.5 + Math.sin(t * 1.8) * 0.15;
                    if (this.rarm) this.rarm.rotation.z = -2.5 - Math.sin(t * 1.8) * 0.15;
                    break;
                case 'tsunamiguardian':
                    if (this.crest) this.crest.rotation.z = Math.sin(t * 1.5) * 0.12;
                    if (this.body) this.body.children.forEach((seg, i) => { seg.position.x = i * 0.06 + Math.sin(t * 1.6 + i * 0.5) * 0.05; });
                    if (this.arms) this.arms.children.forEach((a, i) => { if (a._sx) a.rotation.z = a._sx * (1.0 + Math.sin(t * (fast ? 8 : 2)) * 0.3); });
                    if (this.spray) this.spray.children.forEach(d => { d.position.y += 0.02; if (d.position.y > 3.1) d.position.y = 2.4; });
                    break;
                case 'wintersharbinger':
                    if (this.lower) this.lower.rotation.y = t * 1.4;
                    if (this.larm && this.larm._orb) { this.larm._orb.rotation.y = t * 2; this.larm._orb.position.y = 1.78 + Math.sin(t * 2) * 0.04; }
                    if (this.upper) this.upper.rotation.z = Math.sin(t * 1.2) * 0.04;
                    break;
                case 'zephyrdjinn':
                    if (this.rings) this.rings.forEach((r, i) => { r.rotation.z = t * (1.5 + i * 0.4) * (i % 2 ? 1 : -1); });
                    if (this.lower) this.lower.rotation.y = t * 2.2;
                    if (this.motes) this.motes.children.forEach(m => { m._a += 0.04; m.position.set(Math.cos(m._a) * 0.3, m.position.y + 0.01, Math.sin(m._a) * 0.3); if (m.position.y > 1.8) m.position.y = 0.1; });
                    if (this.upper) this.upper.position.x = Math.sin(t * 1.3) * 0.04;
                    if (this.larm) this.larm.rotation.z = 0.8 + Math.sin(t * 2) * 0.2;
                    if (this.rarm) this.rarm.rotation.z = -0.8 - Math.sin(t * 2) * 0.2;
                    break;
                case 'earthsentinel':
                    if (this.larm) this.larm.position.y = Math.sin(t * (fast ? 8 : 1.6)) * 0.06;
                    if (this.rarm) this.rarm.position.y = Math.sin(t * (fast ? 8 : 1.6) + 1.2) * 0.06;
                    if (this.upper) this.upper.rotation.z = Math.sin(t * 1.0) * 0.02;
                    break;
                case 'galesentinel':
                    if (this.bladeRings) this.bladeRings.forEach(r => { r.rotation.y += 0.05 * r._dir; });
                    if (this.larm) this.larm.rotation.y = t * 4;
                    if (this.rarm) this.rarm.rotation.y = -t * 4;
                    if (this.body) this.body.rotation.y = Math.sin(t * 0.8) * 0.1;
                    break;
                case 'stormelemental':
                    if (this.puffs) this.puffs.forEach(puff => { const s = 1 + Math.sin(t * 1.8 + puff._ph) * 0.08; puff.scale.setScalar(s); });
                    if (this.rain) this.rain.children.forEach(d => { d.position.y -= 0.05; if (d.position.y < 0.2) d.position.y = 1.9; });
                    if (this.core && this.core.material) { const flash = Math.sin(t * 20) > 0.7; this.core.material.emissiveIntensity = flash ? 2.4 : 0.9; }
                    if (this.larm) this.larm.visible = Math.sin(t * 9) > -0.6;
                    if (this.rarm) this.rarm.visible = Math.sin(t * 9 + 2) > -0.6;
                    break;
                case 'blazinginfernoelemental':
                    if (this.sheets) this.sheets.forEach(s => { s.scale.x = s.scale.z = 1 + Math.sin(t * (fast ? 14 : 7) + s._i * 0.7) * 0.18; s.position.y = (0.8 + s._i * 0.22) + Math.sin(t * 4 + s._a) * 0.05; });
                    if (this.embers) this.embers.children.forEach(e => { e.position.y += 0.03; if (e.position.y > 3.4) e.position.y = 0.6; });
                    if (this.body) this.body.rotation.y = Math.sin(t * 1.2) * 0.06;
                    if (this.core && this.core.material) this.core.material.emissiveIntensity = 1.4 + Math.sin(t * 6) * 0.6;
                    break;
                case 'bascapeflame':
                    if (this.smoke) this.smoke.children.forEach(puff => { puff.position.y += 0.018; puff.scale.multiplyScalar(1.004); if (puff.position.y > 3.4) { puff.position.y = 1.8; puff.scale.setScalar(1); } });
                    if (this.struts) this.struts.forEach((s, i) => { s.position.y += Math.sin(t * 2 + i) * 0.002; });
                    if (this.arms) this.arms.children.forEach((a, i) => { if (a.geometry && a.geometry.type === 'ConeGeometry') a.rotation.x = Math.sin(t * (fast ? 10 : 3) + i) * 0.2; });
                    if (this.body) this.body.position.x = Math.sin(t * 1.5) * 0.03;
                    break;
            }
        }

        deathPose(deltaTime) {
            const t = this.animTime;
            const prog = Math.min(1.0, t / 1.0);
            const op = 1.0 - prog;
            for (const mat of this._materials) mat.opacity = Math.min(mat.opacity, op);
            // Collapse the form into its fading core.
            if (this._baseY === null) this._baseY = this.model.position.y;
            const sc = this.scale * (1.0 - prog * 0.5);
            this.model.scale.set(sc, sc, sc);
        }
    }

    const make = (scale, offsetY, enemy, weaponType, key) =>
        new ElementalBattler3D(scale, offsetY, enemy, weaponType, key);

    const reg = window.Battler3D.registerArchetype;
    const S = ELEMENTAL_PROFILES;
    reg('elemental',        { aliases: ['elemental', 'elementals'], scale: S.elemental.scale, weapon: 0, create: make });
    reg('fireelemental',    { aliases: ['fireelemental', 'flame', 'ifrit', 'magma'], scale: S.fireelemental.scale, weapon: 0, create: make });
    reg('waterelemental',   { aliases: ['waterelemental', 'undine'], scale: S.waterelemental.scale, weapon: 0, create: make });
    reg('thunderelemental', { aliases: ['thunderelemental', 'lightning'], scale: S.thunderelemental.scale, weapon: 0, create: make });
    reg('stormelemental',   { aliases: ['stormelemental', 'tempest'], scale: S.stormelemental.scale, weapon: 0, create: make });
    reg('metalelemental',   { aliases: ['metalelemental', 'ironelemental'], scale: S.metalelemental.scale, weapon: 0, create: make });
    reg('darkelemental',    { aliases: ['darkelemental', 'shadowelemental', 'umbral'], scale: S.darkelemental.scale, weapon: 0, create: make });
    reg('sacredelemental',  { aliases: ['sacredelemental', 'holyelemental', 'lightelemental'], scale: S.sacredelemental.scale, weapon: 0, create: make });

    // Bespoke unique elementals (assigned by exact name; override <Battler3D: key>).
    reg('waternymph',         { aliases: ['waternymph'],         scale: S.waternymph.scale,         weapon: 0, create: make });
    reg('flameelemental',     { aliases: ['flameelemental'],     scale: S.flameelemental.scale,     weapon: 0, create: make });
    reg('luckelemental',      { aliases: ['luckelemental'],      scale: S.luckelemental.scale,      weapon: 0, create: make });
    reg('moltenjuggernaut',   { aliases: ['moltenjuggernaut'],   scale: S.moltenjuggernaut.scale,   weapon: 0, create: make });
    reg('quantumfluctuation', { aliases: ['quantumfluctuation'], scale: S.quantumfluctuation.scale, weapon: 0, create: make });
    reg('swampgaselemental',  { aliases: ['swampgaselemental'],  scale: S.swampgaselemental.scale,  weapon: 0, create: make });
    reg('tsunamiguardian',    { aliases: ['tsunamiguardian'],    scale: S.tsunamiguardian.scale,    weapon: 0, create: make });
    reg('wintersharbinger',   { aliases: ['wintersharbinger'],   scale: S.wintersharbinger.scale,   weapon: 0, create: make });
    reg('zephyrdjinn',        { aliases: ['zephyrdjinn'],        scale: S.zephyrdjinn.scale,        weapon: 0, create: make });
    reg('earthsentinel',      { aliases: ['earthsentinel'],      scale: S.earthsentinel.scale,      weapon: 0, create: make });
    reg('galesentinel',       { aliases: ['galesentinel'],       scale: S.galesentinel.scale,       weapon: 0, create: make });
    reg('blazinginfernoelemental', { aliases: ['blazinginfernoelemental'], scale: S.blazinginfernoelemental.scale, weapon: 0, create: make });
    reg('bascapeflame',       { aliases: ['bascapeflame'],       scale: S.bascapeflame.scale,       weapon: 0, create: make });

["es_cinderwrappedsentinel","es_tempestconduit","es_livingsentinel","es_surgingsylph","es_ragingconduit","es_howlingelemental","es_moltencolossusspawn","es_frozenrevenant","es_radiantmonolith","es_ragingcolossusspawn","es_obsidianconduit","es_grindingconstruct","es_howlingsylph","es_tempestwisp","es_quartzwisp","es_howlingrevenant","es_grindingspirit","es_cracklingspirit","es_moltensylph","es_petrifiedwarden","es_livingelemental","es_raginganimus","es_searingspirit","es_petrifiedeffigy","es_tempestcolossusspawn","es_moltenconstruct","es_quartzmonolith","es_quartzsylph","es_moltenwarden","es_moltensentinel","es_searingelemental","es_tempestsylph"].forEach(k => reg(k, { aliases: [k], scale: S[k].scale, weapon: 0, create: make }));

["es_encompassingroadwarden","es_tempestdjinn","es_lullabywraith","es_forgottensentinel","es_gildedsentinel"].forEach(k => reg(k, { aliases: [k], scale: S[k].scale, weapon: 0, create: make }));

    const NAMED = {
        waternymph:         ["Water Nymph"],
        flameelemental:     ["Flame Elemental"],
        luckelemental:      ["Luck Elemental"],
        moltenjuggernaut:   ["Molten Juggernaut"],
        quantumfluctuation: ["Quantum Fluctuation"],
        swampgaselemental:  ["Swamp Gas Elemental"],
        tsunamiguardian:    ["Tsunami Guardian"],
        wintersharbinger:   ["Winter's Harbinger"],
        zephyrdjinn:        ["Zephyr Djinn"],
        earthsentinel:      ["Earth Sentinel"],
        galesentinel:       ["Gale Sentinel"],
        stormelemental:     ["Storm Elemental"],
        blazinginfernoelemental: ["Blazing Inferno Elemental"],
        bascapeflame:       ["The Bascape Flame"]
    };
    if (window.Battler3D.registerNamed) {
        for (const key in NAMED) NAMED[key].forEach(n => window.Battler3D.registerNamed(n, key));
    }

    debugLog('Elemental family registered');
})();
