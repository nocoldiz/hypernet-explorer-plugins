//=============================================================================
// 3D Battler System - Named Bosses
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Bespoke boss models (eldritch, colossus, witch, reaper) plus
 * name-based auto-assignment of unique models to specific named enemies.
 * Requires 3DBattlerSystem (core) and the other Battler3D families first.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * ============================================================================
 * 3D Battler - Named Bosses
 * ============================================================================
 *
 * Adds four new boss-tier models and auto-assigns unique models to specific
 * named enemies via window.Battler3D.registerNamed(exactName, key). This works
 * for unique enemies whose name carries no archetype keyword (e.g. "The
 * Surgeon", "Lilith the Corruptor", "Glacial Titan"). Resolution priority is:
 *   forced <Battler3D:> tag -> exact unique name -> <Archetype:> -> name tokens.
 *
 * New models registered here: eldritch, colossus, witch, reaper.
 * Existing models reused by name: dragon, lich, vampire, gorgon, angel,
 * krakenlord, cyclops, worldtree, crystalmonarch, slime, goblin, ...
 *
 * MUST load AFTER the other Battler3D family plugins.
 */

(() => {
    'use strict';

    if (typeof THREE === 'undefined') return;
    if (!window.Battler3D || !window.Battler3D.Base) {
        console.error('[3D Battler Bosses] Core (3DBattlerSystem) not loaded first.');
        return;
    }

    const Base = window.Battler3D.Base;
    const debugLog = window.Battler3D.debugLog || function () {};

    // Per-variant eldritch shape specs (drives the parameterised _buildEldritch).
    const EL = (scale, tex, body, accent, hue, sat, lit, spec) =>
        ({ variant: 'eldritch', scale, texturePool: tex, bodyColor: body, accent, hue, sat, lit, spec });
    // Per-variant colossus shape specs (drives the parameterised _buildColossus).
    const COL = (scale, tex, body, accent, hue, sat, lit, spec) =>
        ({ variant: 'colossus', scale, texturePool: tex, bodyColor: body, accent, hue, sat, lit, spec });

    const B_PROFILES = {
        eldritch: { variant: 'eldritch', scale: 4.0, texturePool: 'void', bodyColor: 0x2a1838, accent: 0x9b40ff, hue: [0.78, 0.08], sat: [0.55, 0.15], lit: [0.22, 0.08] },
        // ── 34 cosmic horrors split out of the shared `eldritch` rig ──────────
        el_aiwass:        EL(3.8, 'bone',  0xf0e2a0, 0xffd24a, [0.13,0.04],[0.40,0.10],[0.66,0.10], { core:'sphere', eyes:{mode:'single',size:0.34}, features:['wings','halo'] }),
        el_annunaki:      EL(4.2, 'metal', 0xc9a24a, 0xffe066, [0.12,0.04],[0.50,0.10],[0.46,0.10], { core:'dodeca', eyes:{mode:'pair'}, tentacles:{count:2}, features:['crown','disc'] }),
        el_blankemergence:EL(3.8, 'pale',  0xe8eaf0, 0xaab0ff, [0.62,0.06],[0.10,0.06],[0.85,0.06], { core:'octa', coreScale:[1.1,1.1,1.1], eyes:{mode:'none'}, features:['shards','rift'] }),
        el_choronzon:     EL(3.9, 'void',  0x201828, 0x8844cc, [0.74,0.08],[0.50,0.14],[0.18,0.06], { core:'ico', eyes:{mode:'cluster',count:6}, tentacles:{count:6,style:'spike'}, features:['swarm'] }),
        el_mindmanip:     EL(3.7, 'flesh', 0x8a5a9a, 0xff66cc, [0.86,0.08],[0.45,0.12],[0.46,0.10], { core:'sphere', eyes:{mode:'none'}, features:['brain','tendrils'] }),
        el_yogsothoth:    EL(4.2, 'water', 0x3a6a7a, 0x66ffdd, [0.50,0.08],[0.45,0.14],[0.40,0.10], { core:'sphere', eyes:{mode:'cluster',count:8}, features:['bubbles'] }),
        el_azathoth:      EL(4.6, 'fire',  0x3a1208, 0xff6a18, [0.05,0.04],[0.70,0.12],[0.20,0.08], { core:'ico', eyes:{mode:'none'}, tentacles:{count:8,style:'spike'}, features:['nuclear'] }),
        el_chronovore:    EL(4.0, 'void',  0x14121a, 0xffaa33, [0.09,0.05],[0.45,0.14],[0.14,0.06], { core:'box', coreScale:[1.2,1.1,1.0], eyes:{mode:'pair'}, tentacles:{count:2}, maw:true, features:['clock'] }),
        el_elderthing:    EL(4.0, 'flesh', 0x4a3a4e, 0xaaccaa, [0.30,0.06],[0.20,0.10],[0.30,0.08], { core:'cylinder', coreScale:[1.0,1.2,1.0], eyes:{mode:'vertical',count:5}, features:['wings5','starfish'] }),
        el_glitch:        EL(3.6, 'void',  0x101814, 0x33ff66, [0.40,0.06],[0.60,0.14],[0.16,0.06], { core:'box', eyes:{mode:'pair'}, features:['glitch'] }),
        el_mindoverlord:  EL(3.9, 'flesh', 0x9a4a7a, 0xff66aa, [0.92,0.06],[0.50,0.12],[0.44,0.10], { core:'sphere', eyes:{mode:'none'}, features:['brain','orbs'] }),
        el_mindtyrant:    EL(4.3, 'flesh', 0x7a3a8a, 0xcc66ff, [0.80,0.08],[0.50,0.12],[0.38,0.10], { core:'sphere', coreScale:[1.3,1.3,1.3], eyes:{mode:'none'}, tentacles:{count:4}, features:['brain','orbs'] }),
        el_network:       EL(4.0, 'metal', 0x16202a, 0x33ccff, [0.55,0.06],[0.55,0.14],[0.16,0.06], { core:'octa', eyes:{mode:'single',size:0.3}, features:['rings','antenna'] }),
        el_nightmare:     EL(4.2, 'void',  0x1a1024, 0x9933ff, [0.74,0.08],[0.55,0.14],[0.16,0.06], { core:'ico', eyes:{mode:'cluster',count:7}, ring:10, features:['crown'] }),
        el_nyarlathotep:  EL(4.3, 'void',  0x14100c, 0xff4422, [0.02,0.04],[0.60,0.14],[0.12,0.06], { core:'ico', eyes:{mode:'single'}, tentacles:{count:8,style:'smooth'}, maw:true }),
        el_quantumarchon: EL(4.0, 'crystal',0x2a4a6a,0x66ddff, [0.55,0.08],[0.45,0.14],[0.36,0.10], { core:'octa', eyes:{mode:'single',size:0.28}, features:['clones','rings'] }),
        el_voidempress:   EL(4.1, 'void',  0x140a1e, 0xcc44ff, [0.78,0.08],[0.55,0.14],[0.12,0.06], { core:'cone', coreScale:[1.0,1.1,1.0], eyes:{mode:'pair'}, tentacles:{count:4}, features:['crown'] }),
        el_yellowking:    EL(4.0, 'pale',  0xb0a040, 0xe8e060, [0.15,0.04],[0.55,0.12],[0.46,0.10], { core:'cone', coreScale:[1.1,1.2,1.0], eyes:{mode:'none'}, features:['tatters','crown','mask'] }),
        el_singularity:   EL(4.0, 'metal', 0x050608, 0x66aaff, [0.58,0.06],[0.40,0.14],[0.04,0.03], { core:'sphere', coreR:0.5, eyes:{mode:'none'}, features:['accretion','rings'] }),
        el_chronoconsumer:EL(3.9, 'void',  0x1a1410, 0xffbb33, [0.10,0.05],[0.50,0.14],[0.14,0.06], { core:'ico', eyes:{mode:'single'}, maw:true, features:['clock'] }),
        el_coloroutsound: EL(3.8, 'crystal',0x886688,0xff44cc, [0.0,1.0],[0.55,0.14],[0.50,0.10], { core:'octa', eyes:{mode:'none'}, features:['prism'] }),
        el_childhoodsend: EL(3.4, 'pale',  0xd8c0b0, 0x88aaff, [0.08,0.04],[0.20,0.10],[0.66,0.10], { core:'sphere', coreR:0.55, coreScale:[1.0,1.0,1.0], coreY:1.7, eyes:{mode:'pair',size:0.12}, features:['doll'] }),
        el_yogsothothep:  EL(4.2, 'water', 0x3a5a6a, 0x66ffcc, [0.48,0.08],[0.45,0.14],[0.38,0.10], { core:'sphere', eyes:{mode:'cluster',count:8}, features:['bubbles','rings'] }),
        el_seraph:        EL(4.2, 'fire',  0xfff0c0, 0xffd24a, [0.12,0.04],[0.50,0.10],[0.72,0.10], { core:'sphere', eyes:{mode:'single',size:0.3}, features:['wings6','halo'] }),
        el_vorthak:       EL(4.1, 'crystal',0x2a3a5a,0x66ccff, [0.58,0.06],[0.45,0.14],[0.30,0.08], { core:'ico', eyes:{mode:'pair'}, features:['crystalarms','rift'] }),
        el_yithoghra:     EL(4.0, 'void',  0x4a2a4a, 0xffcc44, [0.85,0.10],[0.45,0.14],[0.28,0.08], { core:'ico', eyes:{mode:'pair'}, features:['split'] }),
        el_mordun:        EL(4.4, 'bone',  0xcabd92, 0xff8855, [0.10,0.04],[0.30,0.10],[0.50,0.10], { core:'box', coreScale:[1.2,1.0,1.2], eyes:{mode:'pair'}, features:['spires'] }),
        el_qelthuzad:     EL(4.0, 'void',  0x2a2438, 0x88ccff, [0.60,0.08],[0.45,0.14],[0.20,0.06], { core:'sphere', eyes:{mode:'single',size:0.28}, features:['tablets'] }),
        el_nythaggoth:    EL(4.1, 'void',  0x3a2a1a, 0x88ff44, [0.28,0.06],[0.55,0.14],[0.18,0.06], { core:'torus', eyes:{mode:'single'}, features:['knot'] }),
        el_shalthyss:     EL(3.9, 'flesh', 0x6a2a4a, 0xff5588, [0.94,0.06],[0.50,0.12],[0.32,0.10], { core:'cone', coreScale:[0.9,1.2,0.9], eyes:{mode:'pair'}, tentacles:{count:2}, features:['blades'] }),
        el_gulmagoth:     EL(4.1, 'metal', 0x1a2230, 0x44ddff, [0.55,0.06],[0.45,0.14],[0.18,0.06], { core:'torus', eyes:{mode:'single'}, features:['loops','clock'] }),
        el_xothnagal:     EL(4.0, 'green', 0x2a3a28, 0x88dd66, [0.30,0.06],[0.45,0.14],[0.24,0.08], { core:'ico', eyes:{mode:'cluster',count:6}, features:['spores'] }),
        el_velkorthak:    EL(4.1, 'void',  0x2a1a3a, 0xff66dd, [0.84,0.08],[0.50,0.14],[0.22,0.08], { core:'sphere', eyes:{mode:'single'}, features:['spawnorbs'] }),
        el_zhothaggur:    EL(4.4, 'void',  0x06060a, 0x221133, [0.74,0.08],[0.40,0.14],[0.03,0.03], { core:'sphere', eyes:{mode:'single',size:0.2}, features:['voidsink'] }),
        // ── 28 titans/behemoths split out of the shared `colossus` rig ────────
        col_bloodleech:   COL(4.8, 'flesh', 0x6a2028, 0xff3344, [0.99,0.04],[0.55,0.14],[0.28,0.10], { body:'sphere', features:['tubes','blooddrops'] }),
        col_bogbehemoth:  COL(4.8, 'stone', 0x3a4a2a, 0x88aa44, [0.28,0.06],[0.35,0.12],[0.24,0.08], { features:['mud','reptilehead'] }),
        col_crumbling:    COL(5.0, 'stone', 0x6a6258, 0xffaa55, [0.08,0.04],[0.15,0.08],[0.40,0.10], { features:['boulders','cracks'] }),
        col_flower:       COL(4.8, 'foliage',0x4a6a3a,0xff66aa, [0.30,0.08],[0.45,0.14],[0.34,0.10], { body:'sphere', features:['flowers','spores'] }),
        col_frost:        COL(5.0, 'crystal',0xaac8e0,0x88e0ff, [0.55,0.06],[0.30,0.10],[0.66,0.10], { features:['ice'] }),
        col_maelstrom:    COL(4.8, 'water', 0x2a5a7a, 0x66ccff, [0.55,0.06],[0.45,0.14],[0.32,0.10], { body:'sphere', features:['watertendrils','vortex'] }),
        col_magmatitan:   COL(5.0, 'fire',  0x3a1810, 0xff6618, [0.05,0.04],[0.60,0.14],[0.20,0.08], { features:['rockarmor','magma'] }),
        col_scorched:     COL(4.8, 'fire',  0x5a2418, 0xff8833, [0.06,0.04],[0.55,0.12],[0.24,0.08], { features:['plates','flames','reptilehead'] }),
        col_storm:        COL(4.9, 'metal', 0x3a4458, 0x66ccff, [0.58,0.06],[0.40,0.12],[0.28,0.08], { features:['plates','lightning'] }),
        col_gorilla:      COL(4.6, 'fur',   0x2a2622, 0xffcc88, [0.08,0.04],[0.15,0.08],[0.16,0.06], { body:'sphere', features:['mane'] }),
        col_chronos:      COL(5.0, 'metal', 0x3a3a5a, 0xffd24a, [0.62,0.06],[0.35,0.12],[0.30,0.10], { features:['clock','rings'] }),
        col_crag:         COL(4.9, 'crystal',0x6a6a78,0x88ddff, [0.58,0.06],[0.20,0.10],[0.44,0.10], { features:['crystals'] }),
        col_crimson:      COL(4.8, 'flesh', 0x4a0e14, 0xff2233, [0.99,0.03],[0.65,0.14],[0.20,0.08], { features:['cape','blooddrops'] }),
        col_glacial:      COL(5.2, 'crystal',0xbcd8ec,0xaaf0ff, [0.55,0.06],[0.30,0.10],[0.72,0.08], { features:['ice','crystals'] }),
        col_magmaoverlord:COL(5.0, 'fire',  0x2a1008, 0xff5510, [0.04,0.03],[0.65,0.14],[0.16,0.06], { body:'sphere', features:['dragonhead','wings','magma'] }),
        col_mountaintitan:COL(5.0, 'stone', 0x6e685e, 0xffaa55, [0.08,0.04],[0.12,0.08],[0.42,0.10], { features:['rocks'] }),
        col_quakemaw:     COL(5.0, 'stone', 0x5e574c, 0xff9944, [0.08,0.04],[0.15,0.08],[0.36,0.10], { features:['maw','cracks'] }),
        col_radiant:      COL(4.9, 'metal', 0xf0ead0, 0xffe066, [0.13,0.04],[0.40,0.10],[0.74,0.08], { features:['armor','halo','radiant'] }),
        col_totemic:      COL(4.8, 'wood',  0x6a4a2a, 0xffcc44, [0.09,0.04],[0.40,0.12],[0.32,0.10], { body:'box', head:false, features:['totem'] }),
        col_war:          COL(5.0, 'metal', 0x4a4640, 0xff6633, [0.06,0.04],[0.30,0.10],[0.28,0.08], { features:['armor','weapons'] }),
        col_mountainking: COL(5.4, 'stone', 0x6a6458, 0x88dd66, [0.10,0.04],[0.15,0.08],[0.42,0.10], { features:['peaks','runes'] }),
        col_ossuary:      COL(5.0, 'bone',  0xcabd92, 0xff8855, [0.11,0.04],[0.25,0.10],[0.52,0.10], { features:['bones','skulls'] }),
        col_stratos:      COL(4.9, 'metal', 0xb8c4d0, 0x66ccff, [0.58,0.06],[0.18,0.10],[0.62,0.10], { features:['wind','wings'] }),
        col_earthen:      COL(5.0, 'stone', 0x5e5448, 0xffaa44, [0.08,0.04],[0.18,0.08],[0.36,0.10], { features:['rocks','shards'] }),
        col_mammoth:      COL(5.2, 'fur',   0x6a5a48, 0xaaf0ff, [0.09,0.04],[0.25,0.10],[0.34,0.10], { body:'sphere', features:['tusks','trunk','mammothfur'] }),
        col_thunderlizard:COL(5.2, 'stone', 0x3a5a3a, 0xffee44, [0.30,0.06],[0.35,0.12],[0.30,0.10], { body:'sphere', features:['dragonhead','tail','lightning'] }),
        col_primordial:   COL(5.2, 'stone', 0x4a3a2a, 0x88ff66, [0.10,0.04],[0.30,0.10],[0.28,0.08], { features:['horns','runes'] }),
        col_porphyrin:    COL(5.0, 'metal', 0x16120e, 0xff9a2e, [0.07,0.04],[0.50,0.12],[0.10,0.05], { body:'sphere', features:['oildrip','leyline'] }),
        u_eternallichking: { variant: 'reaper', scale: 3.7, texturePool: 'bone', bodyColor: 0xe0e6c8, robe: 0x141f10, accent: 0x66ff88, hue: [0.30,0.05], sat: [0.20,0.08], lit: [0.62,0.10] },
        u_forestsovereign: COL(5.3, 'wood',  0x5a4a2a, 0x88ff66, [0.10,0.05],[0.40,0.12],[0.34,0.10], { body:'dodeca', features:['flowers','spires','runes'] }),
        u_tidalwarden:     COL(4.7, 'water', 0x2a5a6a, 0x66ddff, [0.55,0.06],[0.45,0.12],[0.34,0.10], { features:['crystals','watertendrils','vortex'] }),
        u_crudeleviathan:  COL(4.9, 'metal', 0x12100c, 0xff9a2e, [0.07,0.04],[0.55,0.12],[0.10,0.05], { body:'sphere', features:['oildrip','maw'] }),
        colossus: { variant: 'colossus', scale: 5.0, texturePool: 'stone', bodyColor: 0x7a7064, accent: 0xff8833, hue: [0.08, 0.05], sat: [0.12, 0.08], lit: [0.42, 0.10] },
        witch:    { variant: 'witch', scale: 3.0, texturePool: 'void', bodyColor: 0x2a1838, accent: 0xb060ff, hue: [0.78, 0.10], sat: [0.45, 0.15], lit: [0.28, 0.10] },
        reaper:   { variant: 'reaper', scale: 3.4, texturePool: 'bone', bodyColor: 0xd0e0e8, robe: 0x14110f, accent: 0xff33eb, hue: [0.11, 0.04], sat: [0.10, 0.06], lit: [0.78, 0.08] },
        // Petrodemon: a hulking heap of crude with other creatures' parts stuck
        // in it. Every one is generated per battle, so its own rig rolls the
        // heap, the sheen and the grafts from the seed its notebox carries.
        petrodemon: { variant: 'petrodemon', scale: 4.8, texturePool: 'metal', bodyColor: 0x07070a, accent: 0xcbff2e, hue: [0.07, 0.04], sat: [0.55, 0.12], lit: [0.08, 0.04] },
        // Ultimate boss: Eris, discord goddess who consumed Maat (witch rig, chaos-purple body + Maat gold).
        eris: { variant: 'witch', scale: 4.2, texturePool: 'void', bodyColor: 0x1a0f2e, accent: 0xffd24a, hue: [0.80, 0.18], sat: [0.55, 0.18], lit: [0.32, 0.12] },
        // Postgame superboss: the discarded corpse of Maat, goddess of order (vast eldritch rig, decayed gold).
        corpseofmaat: { variant: 'eldritch', scale: 5.4, texturePool: 'bone', bodyColor: 0xcabd92, accent: 0xffe066, hue: [0.12, 0.05], sat: [0.30, 0.10], lit: [0.52, 0.12] },

        // ── 4 bespoke dragons split out of the reused external `dragon` rig ────
        bos_bullwyvern:              { variant: 'bosdragon', scale: 4.4, texturePool: 'stone', bodyColor: 0x6a4a2a, accent: 0xffcc44, spec: { horns: 'ram', wings: 2, breath: 0xffe066 } },
        bos_dragonoftheunderworldkur:{ variant: 'bosdragon', scale: 5.0, texturePool: 'stone', bodyColor: 0x4a463e, accent: 0xff7733, spec: { horns: 'crag', wings: 2, breath: 0xff7733, quake: true } },
        bos_stormdragonkingenlil:    { variant: 'bosdragon', scale: 5.0, texturePool: 'crystal', bodyColor: 0xaac8e0, accent: 0x88e0ff, spec: { horns: 'ice', wings: 4, breath: 0x88e0ff, storm: true } },
        bos_supremedragongodusumgallu:{ variant: 'bosdragon', scale: 5.4, texturePool: 'void', bodyColor: 0x2a1838, accent: 0xffd24a, spec: { horns: 'crown', wings: 6, breath: 0xffd24a, cosmic: true } },

        // ── 11 bespoke reapers/operators split out of the shared `reaper` rig ──
        bos_thesurgeon:       { variant: 'bosreaper', scale: 3.4, texturePool: 'pale', bodyColor: 0xe0e6e0, robe: 0xdedede, accent: 0xaadfff, spec: { prop: 'scalpel', trophies: 'organs' } },
        bos_emperordeathstalker:{ variant: 'bosreaper', scale: 3.6, texturePool: 'flesh', bodyColor: 0x2a2a1a, robe: 0x2a2a1a, accent: 0x9acc4a, spec: { prop: 'stinger', trophies: 'venom' } },
        bos_infernalmonarch:  { variant: 'bosreaper', scale: 3.8, texturePool: 'fire', bodyColor: 0x3a1810, robe: 0x5a1810, accent: 0xff6622, spec: { prop: 'scythe', trophies: 'flames' } },
        bos_thecremator:      { variant: 'bosreaper', scale: 3.5, texturePool: 'fire', bodyColor: 0x4a2418, robe: 0x3a1810, accent: 0xff8833, spec: { prop: 'brazier', trophies: 'flames' } },
        bos_thepuppeteer:     { variant: 'bosreaper', scale: 3.4, texturePool: 'bone', bodyColor: 0xd8c4a0, robe: 0x3a2a4a, accent: 0x66ddcc, spec: { prop: 'strings', trophies: 'wisps' } },
        bos_thescarletjudge:  { variant: 'bosreaper', scale: 3.6, texturePool: 'metal', bodyColor: 0xe8e0d0, robe: 0x5a0e14, accent: 0xffe066, spec: { prop: 'gavel', trophies: 'halo' } },
        bos_thetaxidermist:   { variant: 'bosreaper', scale: 3.4, texturePool: 'bone', bodyColor: 0xcabd92, robe: 0x35506e, accent: 0x88e0ff, spec: { prop: 'needle', trophies: 'skulls' } },
        bos_venomlord:        { variant: 'bosreaper', scale: 3.5, texturePool: 'green', bodyColor: 0x2a3a1a, robe: 0x3a4a1a, accent: 0x9acc4a, spec: { prop: 'scythe', trophies: 'venom' } },
        bos_gravemonarch:     { variant: 'bosreaper', scale: 3.7, texturePool: 'void', bodyColor: 0x1a1830, robe: 0x14110f, accent: 0x9933cc, spec: { prop: 'sceptre', trophies: 'skulls', crown: true } },
        bos_orphanagewarden:  { variant: 'bosreaper', scale: 3.4, texturePool: 'pale', bodyColor: 0xd8d0c0, robe: 0x2a3a4a, accent: 0xaab0ff, spec: { prop: 'lantern', trophies: 'wisps' } },
        bos_asphaltrevenant:  { variant: 'bosreaper', scale: 3.5, texturePool: 'metal', bodyColor: 0x14110f, robe: 0x16140f, accent: 0xff9a2e, spec: { prop: 'wheel', trophies: 'oil' } },

        // ── 2 bespoke vampire nobles split out of the reused external rig ──────
        bos_crimsonpatriarch: { variant: 'bosvampire', scale: 3.6, texturePool: 'flesh', bodyColor: 0x2a0e14, robe: 0x4a0e14, accent: 0xff2233, spec: { cape: 0x4a0e14, mist: true } },
        bos_vampirelord:      { variant: 'bosvampire', scale: 3.6, texturePool: 'void', bodyColor: 0x14101a, robe: 0x201430, accent: 0x9944cc, spec: { cape: 0x201430, bats: true } },

        // ── 15 bespoke witches/queens split out of the shared `witch` rig ──────
        bos_hecatetheplaguemistress: { variant: 'boswitch', scale: 3.0, texturePool: 'green', bodyColor: 0x3a4a1a, robe: 0x4a5a2a, accent: 0x9acc4a, spec: { prop: 'plague' } },
        bos_liliththecorruptor:      { variant: 'boswitch', scale: 3.1, texturePool: 'flesh', bodyColor: 0x4a0e14, robe: 0x5a1018, accent: 0xff2233, spec: { prop: 'whisper' } },
        bos_morganathebloodweaver:   { variant: 'boswitch', scale: 3.0, texturePool: 'flesh', bodyColor: 0x3a0e14, robe: 0x4a0e18, accent: 0xff3344, spec: { prop: 'blood' } },
        bos_ravennatheshadowbinder:  { variant: 'boswitch', scale: 3.0, texturePool: 'void', bodyColor: 0x201430, robe: 0x1a1024, accent: 0x9933cc, spec: { prop: 'shadow' } },
        bos_selenethevoidwitch:      { variant: 'boswitch', scale: 3.2, texturePool: 'void', bodyColor: 0x140a1e, robe: 0x1a1024, accent: 0xcc44ff, spec: { prop: 'void' } },
        bos_summercourtarchon:       { variant: 'boswitch', scale: 3.1, texturePool: 'foliage', bodyColor: 0x4a6a2a, robe: 0x5a6a2a, accent: 0xffe066, spec: { prop: 'radiance' } },
        bos_swampleechqueen:         { variant: 'boswitch', scale: 3.2, texturePool: 'flesh', bodyColor: 0x2a3a1a, robe: 0x2a4a2a, accent: 0x88cc44, spec: { prop: 'leech' } },
        bos_thebloodcountess:        { variant: 'boswitch', scale: 3.0, texturePool: 'flesh', bodyColor: 0x4a0e14, robe: 0x5a1018, accent: 0xff2233, spec: { prop: 'goblet' } },
        bos_thefrozenlady:           { variant: 'boswitch', scale: 3.0, texturePool: 'crystal', bodyColor: 0x2a4a6a, robe: 0x35506e, accent: 0x88e0ff, spec: { prop: 'shatter' } },
        bos_wintersherald:           { variant: 'boswitch', scale: 3.0, texturePool: 'crystal', bodyColor: 0x2a4a6a, robe: 0x35506e, accent: 0x88e0ff, spec: { prop: 'frost' } },
        bos_babalonpriestess:        { variant: 'boswitch', scale: 3.0, texturePool: 'flesh', bodyColor: 0x5a0e18, robe: 0x6a1020, accent: 0xff4466, spec: { prop: 'chalice' } },
        bos_esmeraldathedreamweaver: { variant: 'boswitch', scale: 3.0, texturePool: 'crystal', bodyColor: 0x2a4a5a, robe: 0x2a4a5a, accent: 0x66ddcc, spec: { prop: 'dream' } },
        bos_faequeen:                { variant: 'boswitch', scale: 3.1, texturePool: 'foliage', bodyColor: 0x2a5a3a, robe: 0x2a5a3a, accent: 0x88ff66, spec: { prop: 'radiance' } },
        bos_frostmonarch:            { variant: 'boswitch', scale: 3.3, texturePool: 'crystal', bodyColor: 0x2a4a6a, robe: 0x35506e, accent: 0x88e0ff, spec: { prop: 'frost' } },
        bos_thedreamweaver:          { variant: 'boswitch', scale: 3.0, texturePool: 'void', bodyColor: 0x241a3a, robe: 0x2a4a5a, accent: 0x66ddcc, spec: { prop: 'dream' } },

        // ── 2 bespoke angels split out of the reused external `angel` rig ──────
        bos_celestialavatar:   { variant: 'bosangel', scale: 4.0, texturePool: 'metal', bodyColor: 0xf0ead0, robe: 0xf0ead0, accent: 0xffe066, spec: { wings: 6, halos: 1 } },
        bos_celestialavatarep: { variant: 'bosangel', scale: 4.4, texturePool: 'crystal', bodyColor: 0xe8f0ff, robe: 0xe8f0ff, accent: 0x88e0ff, spec: { wings: 8, halos: 2, prism: true } }
    };

    class BossBattler3D extends Base {
        constructor(scale, offsetY, battler, weaponType, creatureType) {
            const profile = B_PROFILES[creatureType] || B_PROFILES.eldritch;
            super(scale, offsetY, battler, profile, 0, creatureType || 'eldritch');
            this.variant = profile.variant;
            this._materials = [];
            this._baseY = null;
            this._floaters = [];
            // Bipedal bosses (colossus/witch/reaper) face front; a shapeless
            // mass (eldritch, petrodemon) keeps the angled 3/4 view.
            if (this.variant !== 'eldritch' && this.variant !== 'petrodemon') this.facingYaw = 0;
        }

        async load(physicsWorld, startX = 0, startY = 0, startZ = 0) {
            this.physicsWorld = physicsWorld;
            switch (this.variant) {
                case 'colossus':   this._buildColossus(); break;
                case 'witch':      this._buildWitch(); break;
                case 'reaper':     this._buildReaper(); break;
                case 'boswitch':   this._buildBosWitch(); break;
                case 'bosreaper':  this._buildBosReaper(); break;
                case 'bosvampire': this._buildBosVampire(); break;
                case 'bosangel':   this._buildBosAngel(); break;
                case 'bosdragon':  this._buildBosDragon(); break;
                case 'petrodemon': this._buildPetrodemon(); break;
                default:           this._buildEldritch(); break;
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
            const eye = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), this._mat(0xffe9c0, 1.0, 0.3));
            eye.position.set(x, y, z);
            const pupil = new THREE.Mesh(new THREE.SphereGeometry(r * 0.5, 8, 8), this._mat(accent || 0x111111, 1.0, 0.2, accent));
            pupil.position.set(0, 0, r * 0.7); eye.add(pupil); parent.add(eye); return eye;
        }
        _mapCommon(parts) {
            const m = this._partMeshMap;
            const set = (keys, mesh) => { if (mesh) keys.forEach(k => { m[k] = mesh; }); };
            set(['HEAD', 'SKULL', 'BRAIN', 'EYE', 'EYES', 'FACE', 'EYE_RING', 'EYE_CLUSTER', 'MAW'], parts.head);
            set(['TORSO', 'BODY', 'CORE', 'RIBCAGE', 'MASS', 'HEART_CHAMBER', 'MANTLE', 'SPINE', 'NUCLEUS', 'CHESTPLATE'], parts.body);
            set(['LEFT_ARM', 'LEFT_UPPER_ARM', 'TENTACLE_ONE', 'TENTACLES', 'LEFT_APPENDAGE', 'PINCER_LEFT'], parts.leftArm);
            set(['RIGHT_ARM', 'RIGHT_UPPER_ARM', 'TENTACLE_TWO', 'RIGHT_APPENDAGE', 'PINCER_RIGHT', 'CLAWS'], parts.rightArm);
            set(['LEFT_LEG', 'LEFT_THIGH', 'FRONT_LEFT_PAW', 'LOWER_BODY', 'FEET'], parts.leftLeg);
            set(['RIGHT_LEG', 'RIGHT_THIGH', 'FRONT_RIGHT_PAW', 'REAR_LEFT_LEG', 'GEAR_LEGS'], parts.rightLeg);
        }
        _simpleCascade(parts) {
            this._cascadeRules = [
                { gone: ['TORSO', 'BODY', 'CORE', 'RIBCAGE', 'SPINE', 'MASS', 'HEART_CHAMBER'], hide: [parts.body, parts.head, parts.leftArm, parts.rightArm, parts.leftLeg, parts.rightLeg].filter(Boolean) },
                { gone: ['HEAD', 'SKULL', 'BRAIN', 'EYE', 'EYES'], hide: [parts.head].filter(Boolean) },
                { gone: ['LEFT_ARM', 'LEFT_UPPER_ARM', 'TENTACLE_ONE'], hide: [parts.leftArm].filter(Boolean) },
                { gone: ['RIGHT_ARM', 'RIGHT_UPPER_ARM', 'TENTACLE_TWO', 'CLAWS'], hide: [parts.rightArm].filter(Boolean) },
                { gone: ['LEFT_LEG', 'LEFT_THIGH'], hide: [parts.leftLeg].filter(Boolean) },
                { gone: ['RIGHT_LEG', 'RIGHT_THIGH'], hide: [parts.rightLeg].filter(Boolean) },
            ];
        }

        // ── Eldritch horror: spec-driven so every cosmic horror is distinct ──
        // The classic eye-mass is the default when a profile carries no `spec`.
        _buildEldritch() {
            const p = this.profile;
            const spec = p.spec || { core: 'ico', coreScale: [1.1, 1.2, 1.1], eyes: { mode: 'single', size: 0.35 }, ring: 8, tentacles: { count: 4 }, maw: true };
            const mat = this._skinMat(p.bodyColor, spec.rough != null ? spec.rough : 0.5);
            this._hMat = mat;
            // Core mass.
            this.body = new THREE.Mesh(this._geom(spec.core || 'ico', spec.coreR || 0.7), mat);
            const cs = spec.coreScale || [1.1, 1.2, 1.1]; this.body.scale.set(cs[0], cs[1], cs[2]);
            this.body.position.set(0, spec.coreY != null ? spec.coreY : 1.4, 0); this.bodyGroup.add(this.body);
            // Head + eyes.
            this.head = new THREE.Group();
            this._eldritchEyes(this.head, spec.eyes || { mode: 'single', size: 0.35 }, p.accent);
            this.head.position.set(0, spec.headY != null ? spec.headY : 1.5, 0.15); this.bodyGroup.add(this.head);
            // Optional ring of lesser eyes (floater).
            if (spec.ring) {
                this.eyeRing = new THREE.Group();
                for (let i = 0; i < spec.ring; i++) { const a = (i / spec.ring) * Math.PI * 2; this._eye(this.eyeRing, Math.cos(a) * 0.6, 1.4 + Math.sin(a) * 0.6, 0.4, 0.1, p.accent); }
                this.bodyGroup.add(this.eyeRing); this._floaters.push(this.eyeRing);
            }
            // Tentacles.
            const tc = spec.tentacles || { count: 0 };
            this.leftArm = this.rightArm = this.leftLeg = this.rightLeg = null;
            if (tc.count >= 1) this.leftArm = this._tentacle(mat, -1, undefined, tc.style, tc.len);
            if (tc.count >= 2) this.rightArm = this._tentacle(mat, 1, undefined, tc.style, tc.len);
            if (tc.count >= 3) this.leftLeg = this._tentacle(mat, -0.5, 0.9, tc.style, tc.len);
            if (tc.count >= 4) this.rightLeg = this._tentacle(mat, 0.5, 0.9, tc.style, tc.len);
            for (let i = 4; i < tc.count; i++) { const s = (i % 2 ? 1 : -1) * (0.7 + i * 0.04); this._tentacle(mat, s, 1.1, tc.style, tc.len); }
            // Maw underneath.
            if (spec.maw) { const maw = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), this._mat(0x050010, 1.0, 0.5)); maw.position.set(0, 0.9, 0.3); maw.rotation.x = -1.4; this.bodyGroup.add(maw); }
            // Signature flourishes from the description.
            (spec.features || []).forEach(f => this._eldritchFeature(f, mat));
            const fa = this.leftArm || this.body, fb = this.rightArm || this.body, fc = this.leftLeg || this.body, fd = this.rightLeg || this.body;
            this._mapCommon({ head: this.head, body: this.body, leftArm: fa, rightArm: fb, leftLeg: fc, rightLeg: fd });
            this._simpleCascade({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm, leftLeg: this.leftLeg, rightLeg: this.rightLeg });
        }
        _geom(kind, r) {
            r = r || 0.7;
            switch (kind) {
                case 'sphere':   return new THREE.SphereGeometry(r, 16, 14);
                case 'box':      return new THREE.BoxGeometry(r * 1.4, r * 1.4, r * 1.4);
                case 'octa':     return new THREE.OctahedronGeometry(r, 0);
                case 'dodeca':   return new THREE.DodecahedronGeometry(r, 0);
                case 'tetra':    return new THREE.TetrahedronGeometry(r, 0);
                case 'torus':    return new THREE.TorusGeometry(r * 0.8, r * 0.38, 12, 22);
                case 'cone':     return new THREE.ConeGeometry(r, r * 2.2, 14);
                case 'cylinder': return new THREE.CylinderGeometry(r * 0.85, r * 0.9, r * 1.9, 14);
                default:         return new THREE.IcosahedronGeometry(r, 1);
            }
        }
        _eldritchEyes(parent, e, accent) {
            if (!e || e.mode === 'none') return;
            if (e.mode === 'single') { this._eye(parent, 0, 0, 0.55, e.size || 0.35, accent); return; }
            if (e.mode === 'pair') { this._eye(parent, -0.2, 0.05, 0.45, e.size || 0.16, accent); this._eye(parent, 0.2, 0.05, 0.45, e.size || 0.16, accent); return; }
            if (e.mode === 'vertical') { const n = e.count || 5; for (let i = 0; i < n; i++) this._eye(parent, 0, 0.4 - i * 0.18, 0.5, e.size || 0.1, accent); return; }
            if (e.mode === 'cluster') { const n = e.count || 7; for (let i = 0; i < n; i++) { const a = i * 2.39996; const rr = 0.18 + (i % 3) * 0.12; this._eye(parent, Math.cos(a) * rr, Math.sin(a) * rr, 0.42 + (i % 2) * 0.08, e.size || 0.09, accent); } return; }
        }
        _tentacle(mat, side, yBase, style, len) {
            const g = new THREE.Group(); let py = 0; const segs = len || 7;
            for (let s = 0; s < segs; s++) {
                const r = Math.max(0.03, 0.16 - s * 0.018);
                const geo = style === 'spike' ? new THREE.ConeGeometry(r, 0.2, 6) : new THREE.SphereGeometry(r, 8, 8);
                const seg = new THREE.Mesh(geo, mat); seg.position.set(Math.sign(side) * 0.06 * s, py, 0); py -= 0.2; g.add(seg);
            }
            g.position.set(Math.sign(side) * 0.55, yBase !== undefined ? yBase : 1.4, 0.1); g._side = Math.sign(side);
            this.bodyGroup.add(g); this._floaters.push(g); return g;
        }
        // Themed flourishes; rotating bits go on _floaters, glow bits read accent.
        _featWings(n, ac) {
            const g = new THREE.Group();
            for (let i = 0; i < n; i++) {
                const a = (i / n) * Math.PI * 2;
                const w = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.1, 3), this._mat(ac, 0.8, 0.5, ac));
                w.position.set(Math.cos(a) * 0.5, 1.6 + Math.sin(a) * 0.35, -0.25); w.rotation.z = Math.cos(a) * 1.3; w.scale.set(0.28, 1, 1); g.add(w);
            }
            this.bodyGroup.add(g); this._floaters.push(g);
        }
        _eldritchFeature(f, mat) {
            const ac = this.profile.accent;
            const grp = () => { const g = new THREE.Group(); this.bodyGroup.add(g); this._floaters.push(g); return g; };
            switch (f) {
                case 'wings':  this._featWings(2, ac); break;
                case 'wings5': this._featWings(5, ac); break;
                case 'wings6': this._featWings(6, ac); break;
                case 'halo': { const h = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.04, 8, 24), this._mat(ac, 0.9, 0.2, ac)); h.position.set(0, 2.35, 0); h.rotation.x = Math.PI / 2; const g = grp(); g.add(h); break; }
                case 'crown': { for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const sp = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.32, 5), this._mat(ac, 1, 0.3, ac)); sp.position.set(Math.cos(a) * 0.45, 2.15, Math.sin(a) * 0.45); this.bodyGroup.add(sp); } break; }
                case 'disc': { const d = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 8, 26), this._mat(ac, 0.9, 0.2, ac)); d.position.set(0, 1.6, -0.3); const g = grp(); g.add(d); break; }
                case 'brain': { const bm = this._mat(0xe0a0b0, 1, 0.6); for (let i = 0; i < 12; i++) { const a = i * 2.39996; const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), bm); lobe.position.set(Math.cos(a) * 0.18, 0.02 + Math.sin(i * 1.3) * 0.12, 0.12 + Math.sin(a) * 0.16); this.head.add(lobe); } break; }
                case 'tendrils': { for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const t = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.04, 0.7, 5), this._mat(ac, 0.7, 0.4, ac)); t.position.set(Math.cos(a) * 0.3, 2.0, Math.sin(a) * 0.3); t.rotation.set(Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4); this.bodyGroup.add(t); } break; }
                case 'orbs': { const g = grp(); for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; const o = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), this._mat(ac, 0.85, 0.2, ac)); o.position.set(Math.cos(a) * 0.95, 1.5, Math.sin(a) * 0.95); g.add(o); } break; }
                case 'bubbles': { const cols = [ac, 0xffffff, this.profile.bodyColor]; for (let i = 0; i < 9; i++) { const a = i * 2.39996; const rr = 0.4 + (i % 3) * 0.18; const b = new THREE.Mesh(new THREE.SphereGeometry(0.22 - (i % 3) * 0.04, 12, 12), this._mat(cols[i % 3], 0.55, 0.15, ac)); b.position.set(Math.cos(a) * rr, 1.4 + Math.sin(i * 1.7) * 0.4, Math.sin(a) * rr); this.bodyGroup.add(b); } break; }
                case 'nuclear': { const g = grp(); for (let i = 0; i < 14; i++) { const a = i * 2.39996; const s = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.5, 4), this._mat(ac, 0.9, 0.3, ac)); const rr = 0.7; s.position.set(Math.cos(a) * rr, 1.4 + Math.sin(i) * 0.4, Math.sin(a) * rr); s.lookAt(Math.cos(a) * 3, 1.4, Math.sin(a) * 3); s.rotateX(Math.PI / 2); g.add(s); } this.coreGlow = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 12), this._mat(ac, 0.7, 0.2, ac)); this.coreGlow.position.set(0, 1.4, 0); this.bodyGroup.add(this.coreGlow); break; }
                case 'clock': { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 8, 22), this._mat(ac, 1, 0.3, ac)); ring.position.set(0, 1.5, 0.55); this.bodyGroup.add(ring); const g = grp(); for (const [l, w] of [[0.32, 0.02], [0.22, 0.03]]) { const hand = new THREE.Mesh(new THREE.BoxGeometry(w, l, 0.02), this._mat(ac, 1, 0.3, ac)); hand.position.set(0, 1.5 + l / 2 * 0, 0.58); g.add(hand); } g.position.set(0, 1.5, 0); break; }
                case 'rings': { for (let k = 0; k < 3; k++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.7 + k * 0.18, 0.03, 8, 28), this._mat(ac, 0.7, 0.2, ac)); const g = grp(); g.add(r); g.rotation.set(k * 0.7, k * 1.1, 0); r.position.y = 1.4; } break; }
                case 'antenna': { for (const x of [-0.3, 0.3]) { const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 6), this._mat(ac, 1, 0.4)); rod.position.set(x, 2.2, 0); this.bodyGroup.add(rod); const tip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), this._mat(ac, 0.9, 0.2, ac)); tip.position.set(x, 2.6, 0); this.bodyGroup.add(tip); } break; }
                case 'shards': { for (let i = 0; i < 12; i++) { const a = i * 2.39996; const sh = new THREE.Mesh(new THREE.TetrahedronGeometry(0.16, 0), this._mat(ac, 0.7, 0.2, ac)); const rr = 0.7 + (i % 3) * 0.1; sh.position.set(Math.cos(a) * rr, 1.4 + Math.sin(i * 1.6) * 0.5, Math.sin(a) * rr); sh.rotation.set(a, i, 0); this.bodyGroup.add(sh); } break; }
                case 'rift': { const d = new THREE.Mesh(new THREE.CircleGeometry(0.6, 24), this._mat(0x05000a, 0.92, 0.1, ac)); d.position.set(0, 1.4, -0.45); this.bodyGroup.add(d); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.04, 8, 26), this._mat(ac, 0.9, 0.2, ac)); ring.position.set(0, 1.4, -0.44); this.bodyGroup.add(ring); break; }
                case 'swarm': { const g = grp(); for (let i = 0; i < 16; i++) { const a = i * 2.39996; const rr = 0.8 + (i % 4) * 0.12; const m = new THREE.Mesh(new THREE.TetrahedronGeometry(0.07, 0), this._mat(ac, 0.8, 0.3, ac)); m.position.set(Math.cos(a) * rr, 1.4 + Math.sin(i * 2.1) * 0.6, Math.sin(a) * rr); g.add(m); } break; }
                case 'clones': { for (const [dx, op] of [[-0.4, 0.4], [0.4, 0.4]]) { const c = new THREE.Mesh(this._geom('octa', 0.6), this._mat(ac, op, 0.2, ac)); c.position.set(dx, 1.4, dx * 0.3); this.bodyGroup.add(c); } break; }
                case 'tatters': { for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; const t = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.7, 3), this._mat(this.profile.bodyColor, 0.9, 0.85)); t.position.set(Math.cos(a) * 0.4, 0.6, Math.sin(a) * 0.4); t.rotation.x = Math.PI; this.bodyGroup.add(t); } break; }
                case 'mask': { const m = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), this._mat(0xf0ead0, 1, 0.4)); m.position.set(0, 1.5, 0.35); m.rotation.x = 0.2; this.bodyGroup.add(m); break; }
                case 'accretion': { const d = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.16, 4, 30), this._mat(ac, 0.7, 0.2, ac)); const g = grp(); g.add(d); d.position.y = 1.4; g.rotation.x = 1.2; break; }
                case 'prism': { this._prismMeshes = []; for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const pl = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.7, 0.4), this._mat(ac, 0.6, 0.1, ac)); pl.position.set(Math.cos(a) * 0.55, 1.4, Math.sin(a) * 0.55); pl.rotation.y = a; this.bodyGroup.add(pl); this._prismMeshes.push(pl); } break; }
                case 'doll': { const bodyDress = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.9, 12), this._mat(this.profile.accent, 1, 0.7)); bodyDress.position.set(0, 0.85, 0); this.bodyGroup.add(bodyDress); for (const x of [-0.1, 0.1]) { const ch = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), this._mat(0xff9999, 1, 0.5)); ch.position.set(x, 1.62, 0.46); this.head.add(ch); } const stitch = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 0.02), this._mat(0x442222, 1, 0.6)); stitch.position.set(0, 1.5, 0.52); this.head.add(stitch); break; }
                case 'starfish': { const g = new THREE.Group(); for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const arm = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.4, 4), mat); arm.position.set(Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25); arm.rotation.z = Math.PI / 2; arm.lookAt(Math.cos(a), 0, Math.sin(a)); g.add(arm); } g.position.set(0, 0.3, 0.1); this.head.add(g); break; }
                case 'glitch': { const g = grp(); const cols = [ac, 0xff00aa, 0x00ffff]; for (let i = 0; i < 10; i++) { const a = i * 2.39996; const c = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), this._mat(cols[i % 3], 0.8, 0.2, cols[i % 3])); const rr = 0.7 + (i % 3) * 0.12; c.position.set(Math.cos(a) * rr, 1.4 + Math.sin(i * 1.9) * 0.5, Math.sin(a) * rr); g.add(c); } break; }
                case 'split': { const half = new THREE.Mesh(this._geom('ico', 0.72), this._mat(ac, 0.85, 0.3, ac)); half.position.copy(this.body.position); half.scale.set(0.55, 1.25, 1.15); half.position.x += 0.36; this.bodyGroup.add(half); break; }
                case 'spires': { for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const h = 0.5 + (i % 3) * 0.3; const t = new THREE.Mesh(new THREE.BoxGeometry(0.14, h, 0.14), this._mat(this.profile.bodyColor, 1, 0.6)); t.position.set(Math.cos(a) * 0.4, 2.0 + h / 2, Math.sin(a) * 0.4); this.bodyGroup.add(t); } break; }
                case 'tablets': { const g = grp(); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const tb = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.36, 0.04), this._mat(this.profile.bodyColor, 0.95, 0.6, ac)); tb.position.set(Math.cos(a) * 0.85, 1.4 + Math.sin(i) * 0.3, Math.sin(a) * 0.85); tb.rotation.y = -a; g.add(tb); } break; }
                case 'knot': { const k = new THREE.Mesh(new THREE.TorusKnotGeometry(0.5, 0.12, 64, 8), this._mat(ac, 0.9, 0.2, ac)); k.position.set(0, 1.4, 0); this.bodyGroup.add(k); break; }
                case 'blades': { for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const bl = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.6, 4), this._mat(0xd8e0e8, 1, 0.2, ac)); bl.position.set(Math.cos(a) * 0.45, 1.3, Math.sin(a) * 0.45); bl.rotation.set(Math.PI, 0, Math.cos(a) * 0.4); this.bodyGroup.add(bl); } break; }
                case 'loops': { for (let k = 0; k < 3; k++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.05, 8, 26), this._mat(ac, 0.8, 0.2, ac)); const g = grp(); g.add(r); g.rotation.set(k * 1.0, k * 0.6, k * 0.4); r.position.y = 1.4; } break; }
                case 'spores': { const g = grp(); for (let i = 0; i < 18; i++) { const a = i * 2.39996; const rr = 0.7 + (i % 4) * 0.14; const s = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), this._mat(ac, 0.65, 0.4, ac)); s.position.set(Math.cos(a) * rr, 1.4 + Math.sin(i * 1.4) * 0.7, Math.sin(a) * rr); g.add(s); } break; }
                case 'spawnorbs': { const g = grp(); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const o = new THREE.Mesh(new THREE.SphereGeometry(0.12 + (i % 2) * 0.05, 12, 12), this._mat(ac, 0.8, 0.15, ac)); o.position.set(Math.cos(a) * 0.85, 1.4 + Math.sin(i) * 0.3, Math.sin(a) * 0.85); const rng = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.015, 6, 14), this._mat(0xffffff, 0.5, 0.2)); rng.rotation.x = 1.2; o.add(rng); g.add(o); } break; }
                case 'voidsink': { const sink = new THREE.Mesh(new THREE.SphereGeometry(0.85, 16, 16), this._mat(0x000000, 0.96, 0.0)); sink.position.set(0, 1.4, 0); this.bodyGroup.add(sink); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const w = new THREE.Mesh(new THREE.TetrahedronGeometry(0.1, 0), this._mat(ac, 0.7, 0.2, ac)); w.position.set(Math.cos(a) * 1.0, 1.4 + Math.sin(i) * 0.2, Math.sin(a) * 1.0); this.bodyGroup.add(w); } break; }
                case 'crystalarms': { for (const side of [-1, 1]) { const g = new THREE.Group(); for (let s = 0; s < 4; s++) { const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.14 - s * 0.02, 0), this._mat(ac, 0.85, 0.15, ac)); c.position.set(side * 0.08 * s, -s * 0.22, 0); g.add(c); } g.position.set(side * 0.6, 1.5, 0.1); g._side = side; this.bodyGroup.add(g); this._floaters.push(g); if (side < 0) this.leftArm = g; else this.rightArm = g; } break; }
            }
        }

        // ── Colossus: towering giant, spec-driven so each titan is distinct ──
        _buildColossus() {
            const p = this.profile;
            const spec = p.spec || {};
            const mat = this._skinMat(p.bodyColor, spec.rough != null ? spec.rough : 1.0);
            this._cMat = mat;
            this.body = new THREE.Mesh(this._geom(spec.body || 'dodeca', 0.8), mat);
            const cs = spec.coreScale || [1.0, 1.4, 0.9]; this.body.scale.set(cs[0], cs[1], cs[2]);
            this.body.position.set(0, 1.6, 0); this.bodyGroup.add(this.body);
            this.head = new THREE.Group();
            const h = new THREE.Mesh(this._geom(spec.headGeom || 'dodeca', 0.45), mat); this.head.add(h);
            this._eye(this.head, -0.18, 0.05, 0.38, 0.1, p.accent);
            this._eye(this.head, 0.18, 0.05, 0.38, 0.1, p.accent);
            this.head.position.set(0, 2.9, 0); this.bodyGroup.add(this.head);
            this.leftArm = this._block(mat, -1, 1.0, 2.3); this.rightArm = this._block(mat, 1, 1.0, 2.3);
            this.leftLeg = this._block(mat, -0.45, 0.6, 0.9, true); this.rightLeg = this._block(mat, 0.45, 0.6, 0.9, true);
            this.coreGlow = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), this._mat(p.accent, 0.85, 0.2, p.accent));
            this.coreGlow.position.set(0, 1.6, 0.3); this.bodyGroup.add(this.coreGlow);
            // FF8 flourish on every colossus: glowing fault-lattice across the
            // torso + chunks of rubble torn loose and orbiting in its gravity.
            const fault = this._mat(p.accent, 0.9, 0.2, p.accent);
            // The lattice hangs off the torso, so it is placed in the TORSO's
            // own space: the body already stands at y 1.6 and carries the
            // coreScale, so body-space numbers on a child of it threw the
            // whole lattice up above the colossus's head.
            for (let i = 0; i < 6; i++) { const a = i * 2.39996; const ln = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.45 + (i % 2) * 0.2, 0.05), fault); ln.position.set(Math.cos(a) * 0.5 / cs[0], (Math.sin(i) * 0.4) / cs[1], Math.sin(a) * 0.42 / cs[2]); ln.rotation.set(Math.cos(a), 0, Math.sin(a)); this.body.add(ln); }
            this.debris = new THREE.Group();
            for (let i = 0; i < 7; i++) { const a = i * 2.39996; const r = 1.0 + (i % 3) * 0.22; const chunk = new THREE.Mesh(new THREE.TetrahedronGeometry(0.12 + this.idRand() * 0.1, 0), mat); chunk.position.set(Math.cos(a) * r, 1.5 + Math.sin(i * 1.7) * 0.9, Math.sin(a) * r); chunk.rotation.set(a, i, 0); this.debris.add(chunk); }
            this.bodyGroup.add(this.debris); this._floaters.push(this.debris);
            (spec.features || []).forEach(f => this._colossusFeature(f, mat));
            this._mapCommon({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm, leftLeg: this.leftLeg, rightLeg: this.rightLeg });
            this._simpleCascade({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm, leftLeg: this.leftLeg, rightLeg: this.rightLeg });
        }
        // Themed colossus flourishes. accent-glow bits read profile.accent.
        _colossusFeature(f, mat) {
            const ac = this.profile.accent, bc = this.profile.bodyColor;
            const grp = () => { const g = new THREE.Group(); this.bodyGroup.add(g); this._floaters.push(g); return g; };
            const onShoulders = (mk) => { for (const x of [-0.7, 0.7]) { const m = mk(x); m.position.set(x, 2.3, 0); this.bodyGroup.add(m); } };
            switch (f) {
                case 'tubes': { for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const t = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 1.4, 7), this._mat(0x7a1820, 1, 0.7)); t.position.set(Math.cos(a) * 0.5, 0.9, Math.sin(a) * 0.5 + 0.2); t.rotation.set(0.4, 0, Math.cos(a) * 0.3); this.bodyGroup.add(t); } break; }
                case 'mud': { for (let i = 0; i < 10; i++) { const a = i * 2.39996; const lump = new THREE.Mesh(new THREE.SphereGeometry(0.16 + (i % 3) * 0.05, 7, 6), this._mat(bc, 1, 0.95)); lump.position.set(Math.cos(a) * 0.6, 1.2 + Math.sin(i) * 0.6, Math.sin(a) * 0.55); this.bodyGroup.add(lump); } break; }
                case 'reptilehead': { const sn = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 8), mat); sn.rotation.x = Math.PI / 2; sn.position.set(0, 0.0, 0.5); this.head.add(sn); break; }
                case 'dragonhead': { const sn = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.7, 8), mat); sn.rotation.x = Math.PI / 2; sn.position.set(0, 0.0, 0.6); this.head.add(sn); for (const x of [-0.2, 0.2]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.4, 6), this._mat(0xe8dcc0, 1, 0.4)); horn.position.set(x, 0.4, -0.1); horn.rotation.z = x * 0.4; this.head.add(horn); } break; }
                case 'boulders': { const g = grp(); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2, 0), mat); r.position.set(Math.cos(a) * 1.2, 1.6 + Math.sin(i) * 0.5, Math.sin(a) * 1.2); g.add(r); } break; }
                case 'rocks': onShoulders(() => new THREE.Mesh(new THREE.DodecahedronGeometry(0.32, 0), mat)); break;
                case 'peaks': onShoulders((x) => { const c = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 5), mat); return c; }); break;
                case 'shards': { for (let i = 0; i < 12; i++) { const a = i * 2.39996; const sh = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.4, 4), this._mat(ac, 0.8, 0.3, ac)); const rr = 0.85; sh.position.set(Math.cos(a) * rr, 1.6 + Math.sin(i) * 0.5, Math.sin(a) * rr); sh.lookAt(Math.cos(a) * 3, 1.6, Math.sin(a) * 3); sh.rotateX(Math.PI / 2); this.bodyGroup.add(sh); } break; }
                case 'crystals': case 'ice': { const cm = this._mat(f === 'ice' ? 0xcfeaff : ac, 0.8, 0.15, ac); for (let i = 0; i < 9; i++) { const a = i * 2.39996; const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.18 + (i % 3) * 0.05, 0), cm); c.position.set(Math.cos(a) * 0.7, 1.5 + Math.sin(i * 1.4) * 0.7, Math.sin(a) * 0.6); this.bodyGroup.add(c); } break; }
                case 'magma': case 'cracks': case 'leyline': { const lm = this._mat(ac, 0.95, 0.2, ac); for (let i = 0; i < 8; i++) { const a = i * 2.39996; const ln = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.04), lm); ln.position.set(Math.cos(a) * 0.55, 1.6 + Math.sin(i) * 0.4, Math.sin(a) * 0.5); ln.rotation.z = Math.cos(a); this.bodyGroup.add(ln); } break; }
                case 'rockarmor': case 'plates': case 'armor': { for (let i = 0; i < 7; i++) { const a = i * 2.39996; const pl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.12), this._mat(f === 'armor' ? 0x6a6258 : bc, 1, f === 'armor' ? 0.4 : 0.9)); pl.position.set(Math.cos(a) * 0.7, 1.4 + Math.sin(i) * 0.6, Math.sin(a) * 0.62); pl.lookAt(Math.cos(a) * 3, 1.4, Math.sin(a) * 3); this.bodyGroup.add(pl); } break; }
                case 'flames': case 'radiant': onShoulders((x) => { const c = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 6), this._mat(ac, 0.85, 0.2, ac)); return c; }); break;
                case 'lightning': { for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const b = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.7, 4), this._mat(ac, 0.9, 0.2, ac)); b.position.set(Math.cos(a) * 0.8, 1.8, Math.sin(a) * 0.8); b.rotation.z = Math.cos(a) * 0.6; this.bodyGroup.add(b); } break; }
                case 'watertendrils': { const g = grp(); for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; const tn = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.1, 1.3, 7), this._mat(ac, 0.6, 0.2, ac)); tn.position.set(Math.cos(a) * 0.7, 1.2, Math.sin(a) * 0.7); tn.rotation.set(0.5, 0, Math.cos(a) * 0.5); g.add(tn); } break; }
                case 'vortex': { const v = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.1, 6, 24), this._mat(ac, 0.6, 0.2, ac)); const g = grp(); g.add(v); v.position.y = 0.4; g.rotation.x = 1.3; break; }
                case 'mane': { for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.35, 4), mat); tuft.position.set(Math.cos(a) * 0.45, 2.9, Math.sin(a) * 0.45); tuft.rotation.set(Math.sin(a), 0, -Math.cos(a)); this.bodyGroup.add(tuft); } break; }
                case 'clock': { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.06, 8, 22), this._mat(ac, 1, 0.3, ac)); ring.position.set(0, 1.7, 0.6); this.bodyGroup.add(ring); break; }
                case 'rings': { for (let k = 0; k < 3; k++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.9 + k * 0.2, 0.04, 8, 28), this._mat(ac, 0.7, 0.2, ac)); const g = grp(); g.add(r); g.rotation.set(k * 0.7, k * 1.1, 0); r.position.y = 1.6; } break; }
                case 'cape': { const cp = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.0, 10, 1, true), this._mat(0x4a0e14, 0.95, 0.8)); cp.position.set(0, 1.4, -0.4); this.bodyGroup.add(cp); break; }
                case 'blooddrops': case 'oildrip': { const dm = this._mat(f === 'oildrip' ? 0x0c0a08 : 0x8a1018, 1, 0.3, f === 'oildrip' ? 0 : 0); for (let i = 0; i < 8; i++) { const a = i * 2.39996; const dr = new THREE.Mesh(new THREE.SphereGeometry(0.07, 7, 7), dm); dr.scale.y = 1.6; dr.position.set(Math.cos(a) * 0.5, 0.8 + (i % 3) * 0.3, Math.sin(a) * 0.45); this.bodyGroup.add(dr); } break; }
                case 'wings': this._featWings(2, ac); break;
                case 'tail': { const g = new THREE.Group(); let pz = 0, r = 0.18; for (let s = 0; s < 6; s++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), mat); seg.position.set(0, 0, pz); g.add(seg); pz -= 0.28; r *= 0.85; } g.position.set(0, 1.0, -0.7); this.bodyGroup.add(g); this._floaters.push(g); break; }
                case 'maw': { const m = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), this._mat(0x100808, 1, 0.6)); m.position.set(0, 1.5, 0.6); m.rotation.x = -1.4; this.bodyGroup.add(m); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 4), this._mat(0xe8dcc0, 1, 0.4)); tooth.position.set(Math.cos(a) * 0.32, 1.5, 0.6 + Math.sin(a) * 0.1); this.bodyGroup.add(tooth); } break; }
                case 'halo': { const h = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 8, 26), this._mat(ac, 0.9, 0.2, ac)); h.position.set(0, 3.4, 0); h.rotation.x = Math.PI / 2; const g = grp(); g.add(h); break; }
                case 'totem': { for (let k = 0; k < 3; k++) { const face = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.7), mat); face.position.set(0, 0.9 + k * 0.75, 0); this.bodyGroup.add(face); this._eye(this.body, -0.16, 0.9 + k * 0.75 - 1.6, 0.4, 0.07, ac); this._eye(this.body, 0.16, 0.9 + k * 0.75 - 1.6, 0.4, 0.07, ac); } break; }
                case 'weapons': { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 8), this._mat(0x3a2a1a, 1, 0.7)); pole.position.set(1.2, 1.6, 0.2); this.bodyGroup.add(pole); const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.5), this._mat(0x9aa4ac, 1, 0.3)); blade.position.set(1.2, 2.8, 0.2); this.bodyGroup.add(blade); break; }
                case 'bones': { for (let i = 0; i < 8; i++) { const a = i * 2.39996; const rib = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.04, 5, 12, Math.PI), this._mat(0xcabd92, 1, 0.5)); rib.position.set(0, 1.2 + i * 0.15, 0.3); rib.rotation.set(0, 0, a); this.bodyGroup.add(rib); } break; }
                case 'skulls': { for (let i = 0; i < 5; i++) { const a = i * 2.39996; const sk = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), this._mat(0xe8dcc0, 1, 0.5)); sk.position.set(Math.cos(a) * 0.6, 1.4 + Math.sin(i) * 0.6, Math.sin(a) * 0.55); this.bodyGroup.add(sk); } break; }
                case 'wind': { for (let k = 0; k < 3; k++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.8 + k * 0.25, 0.03, 6, 24, Math.PI * 1.5), this._mat(ac, 0.55, 0.2, ac)); const g = grp(); g.add(r); g.rotation.set(1.2, k * 1.0, 0); r.position.y = 1.8; } break; }
                case 'tusks': { for (const x of [-0.25, 0.25]) { const tk = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.04, 6, 12, Math.PI * 1.2), this._mat(0xeae0c8, 1, 0.4)); tk.position.set(x, 0.0, 0.4); tk.rotation.set(1.4, 0, x > 0 ? -0.5 : 0.5); this.head.add(tk); } break; }
                case 'trunk': { const g = new THREE.Group(); let py = 0, r = 0.12; for (let s = 0; s < 5; s++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), mat); seg.position.set(0, py, 0.1 + s * 0.04); g.add(seg); py -= 0.18; r *= 0.9; } g.position.set(0, 0.0, 0.45); this.head.add(g); break; }
                case 'mammothfur': { for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; const f2 = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.5, 4), mat); f2.position.set(Math.cos(a) * 0.7, 0.9, Math.sin(a) * 0.6); f2.rotation.x = Math.PI; this.bodyGroup.add(f2); } break; }
                case 'horns': { for (const x of [-0.22, 0.22]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.5, 6), this._mat(0xe8dcc0, 1, 0.4)); horn.position.set(x, 0.45, 0); horn.rotation.z = x * 0.5; this.head.add(horn); } break; }
                case 'runes': { for (let i = 0; i < 10; i++) { const a = i * 2.39996; const ru = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.02), this._mat(ac, 0.9, 0.2, ac)); ru.position.set(Math.cos(a) * 0.7, 1.4 + Math.sin(i) * 0.6, Math.sin(a) * 0.62); ru.lookAt(Math.cos(a) * 3, 1.4, Math.sin(a) * 3); this.bodyGroup.add(ru); } break; }
                case 'flowers': { for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const petal = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), this._mat(ac, 1, 0.6)); petal.scale.set(1, 0.3, 0.6); petal.position.set(Math.cos(a) * 0.4, 3.0, Math.sin(a) * 0.4); petal.rotation.y = a; this.bodyGroup.add(petal); } const core = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), this._mat(0xffe066, 1, 0.5)); core.position.set(0, 3.05, 0); this.bodyGroup.add(core); break; }
                case 'spores': { const g = grp(); for (let i = 0; i < 16; i++) { const a = i * 2.39996; const rr = 0.9 + (i % 4) * 0.14; const s = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), this._mat(ac, 0.6, 0.4, ac)); s.position.set(Math.cos(a) * rr, 1.6 + Math.sin(i * 1.4) * 0.8, Math.sin(a) * rr); g.add(s); } break; }
            }
        }
        _block(mat, side, r, y, leg) {
            const g = new THREE.Group();
            const seg = new THREE.Mesh(new THREE.BoxGeometry(0.4, leg ? 1.4 : 1.2, 0.4), mat);
            seg.position.y = leg ? -0.7 : -0.5; g.add(seg);
            const end = new THREE.Mesh(new THREE.DodecahedronGeometry(leg ? 0.28 : 0.3, 0), mat);
            end.position.y = leg ? -1.5 : -1.1; g.add(end);
            g.position.set(side * r, y, 0); g.rotation.z = leg ? 0 : -side * 0.15; g._side = side;
            this.bodyGroup.add(g); return g;
        }

        // Per-enemy palette: jitter + tint from the enemy's own name so the
        // shared witch/reaper rigs read as distinct, themed individuals.
        _jit(hex, amt) { let r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255; const f = () => 1 + (this.idRand() - 0.5) * 2 * amt; r = Math.max(0, Math.min(255, Math.round(r * f()))); g = Math.max(0, Math.min(255, Math.round(g * f()))); b = Math.max(0, Math.min(255, Math.round(b * f()))); return (r << 16) | (g << 8) | b; }
        _enemyName() { try { const id = this.battler && this.battler.enemyId && this.battler.enemyId(); if (id && typeof $dataEnemies !== 'undefined' && $dataEnemies[id]) return String($dataEnemies[id].name || ''); } catch (e) {} return ''; }
        _bossPalette() {
            const p = this.profile;
            let body = this._jit(p.bodyColor, 0.14), accent = p.accent, robe = this._jit(p.robe || p.bodyColor, 0.14), skin = this._jit(0xd8c0b0, 0.1);
            const nm = this._enemyName().toLowerCase(), has = w => nm.indexOf(w) >= 0;
            if (has('frost') || has('frozen') || has('winter') || has('ice') || has('snow')) { accent = 0x88e0ff; robe = this._jit(0x35506e, 0.1); body = this._jit(0x2a4a6a, 0.1); skin = this._jit(0xc6d4dc, 0.06); }
            else if (has('blood') || has('crimson') || has('scarlet') || has('countess')) { accent = 0xff2233; robe = this._jit(0x5a1018, 0.12); body = this._jit(0x4a0e14, 0.12); }
            else if (has('void') || has('shadow') || has('umbral') || has('night')) { accent = 0x9933cc; robe = this._jit(0x1a1024, 0.16); body = this._jit(0x201430, 0.14); }
            else if (has('dream') || has('weaver') || has('oneiric')) { accent = 0x66ddcc; robe = this._jit(0x2a4a5a, 0.12); }
            else if (has('fae') || has('summer') || has('forest') || has('swamp') || has('leech') || has('queen')) { accent = 0x88ff66; robe = this._jit(0x2a5a3a, 0.12); }
            else if (has('plague') || has('hecate') || has('poison')) { accent = 0x9acc4a; robe = this._jit(0x4a5a2a, 0.12); }
            else if (has('flame') || has('fire') || has('ember') || has('infernal') || has('cremator') || has('magma')) { accent = 0xff6622; robe = this._jit(0x5a2418, 0.12); body = this._jit(0x3a1810, 0.1); }
            else { accent = this._jit(p.accent, 0.12); }
            return { body, accent, robe, skin };
        }

        // ── Witch: FF8-style sorceress - asymmetric spiked regalia, towering
        //    fan-collar, clawed hands, ornate horned headdress, floating sigils ─
        _buildWitch() {
            const p = this.profile, pal = this._bossPalette();
            const robeMat = this._mat(pal.robe, 1.0, 0.82);
            const trimMat = this._mat(this._jit(pal.accent, 0.1), 1.0, 0.3, pal.accent);
            const skinMat = this._skinMat(pal.skin, 0.6);
            const darkMat = this._mat(this._jit(0x140e1e, 0.3), 1.0, 0.7);
            // Layered gown: inner column + flared outer skirt with pointed hem.
            this.body = new THREE.Group();
            const column = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.34, 1.5, 12), robeMat); column.position.y = -0.1; this.body.add(column);
            const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.4, 14, 1, true), darkMat); skirt.position.y = -0.35; this.body.add(skirt);
            for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.4 + (i % 2) * 0.2, 4), robeMat); spike.position.set(Math.cos(a) * 0.56, -0.9, Math.sin(a) * 0.56); spike.rotation.x = Math.PI; this.body.add(spike); }
            // Cinched waist sash + glowing heart-gem.
            const sash = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 6, 14), trimMat); sash.position.y = 0.4; sash.rotation.x = Math.PI / 2; this.body.add(sash);
            const heart = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), this._mat(pal.accent, 0.95, 0.2, pal.accent)); heart.position.set(0, 0.55, 0.22); this.body.add(heart);
            this.body.position.set(0, 1.0, 0); this.bodyGroup.add(this.body);
            // Towering asymmetric fan-collar rising behind the head (Edea/Ultimecia).
            this.collar = new THREE.Group();
            for (let i = 0; i < 7; i++) { const t = (i / 6 - 0.5); const blade = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.7 + Math.abs(t) * 0.5 + (i > 3 ? 0.3 : 0), 4), robeMat); blade.position.set(t * 0.5, 0.2 + Math.abs(t) * 0.1, -0.28); blade.rotation.set(-0.5, 0, t * 0.7); this.collar.add(blade); }
            this.collar.position.set(0.06, 1.7, 0); this.collar.rotation.z = -0.12; this.bodyGroup.add(this.collar); this._floaters.push(this.collar);
            // Head + ornate horned headdress + face-framing hair.
            this.head = new THREE.Group();
            this.head.add(new THREE.Mesh(new THREE.SphereGeometry(0.25, 14, 14), skinMat));
            this._eye(this.head, -0.1, 0.03, 0.21, 0.05, pal.accent); this._eye(this.head, 0.1, 0.03, 0.21, 0.05, pal.accent);
            const hair = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.66), this._mat(this._jit(0x241626, 0.4), 1, 0.85)); hair.position.y = 0.05; this.head.add(hair);
            const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.12, 12), trimMat); crown.position.y = 0.24; this.head.add(crown);
            for (const hx of [-0.2, 0.2]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.5 + this.idRand() * 0.25, 6), trimMat); horn.position.set(hx, 0.34, -0.04); horn.rotation.z = hx > 0 ? -0.7 : 0.7; horn.rotation.x = -0.3; this.head.add(horn); }
            const centSpike = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.55, 6), trimMat); centSpike.position.set(0, 0.5, -0.02); centSpike.rotation.x = -0.15; this.head.add(centSpike);
            this.head.position.set(0, 2.08, 0); this.bodyGroup.add(this.head);
            // Asymmetric spiked pauldrons (large left, smaller right).
            for (const [sx, sc] of [[-1, 1.0], [1, 0.7]]) { const pa = new THREE.Group(); const cap = new THREE.Mesh(new THREE.SphereGeometry(0.18 * sc, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), trimMat); pa.add(cap); for (let i = 0; i < 3; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.04 * sc, 0.34 * sc, 4), trimMat); sp.position.set((i - 1) * 0.1 * sc, 0.04, 0); sp.rotation.x = -0.4 - i * 0.1; pa.add(sp); } pa.position.set(sx * 0.34, 1.62, 0); this.bodyGroup.add(pa); }
            // Long thin arms ending in elongated claws.
            this.leftArm = this._witchArm(robeMat, skinMat, -1, pal); this.rightArm = this._witchArm(robeMat, skinMat, 1, pal);
            // Ornate staff held in the right claw: twisted haft + talon cradling the orb.
            const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 1.7, 6), this._mat(0x3a2a3a, 1.0, 0.6)); staff.position.set(0.52, 1.15, 0.12); this.bodyGroup.add(staff);
            for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; const talon = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.18, 4), trimMat); talon.position.set(0.52 + Math.cos(a) * 0.1, 1.92, 0.12 + Math.sin(a) * 0.1); talon.rotation.set(Math.cos(a) * 0.7, 0, Math.sin(a) * 0.7); this.bodyGroup.add(talon); }
            const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), this._mat(pal.accent, 0.92, 0.2, pal.accent)); orb.position.set(0.52, 2.02, 0.12); this.bodyGroup.add(orb); this._floaters.push(orb); this.staffOrb = orb;
            // Floating spell-sigils (tilted rings) + orbiting motes.
            this.sigils = new THREE.Group();
            for (let k = 0; k < 2; k++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.5 + k * 0.18, 0.012, 4, 6), this._mat(pal.accent, 0.55, 0.2, pal.accent)); r.position.y = 1.4; r.rotation.set(1.2 + k * 0.4, k, 0); this.sigils.add(r); }
            this.bodyGroup.add(this.sigils); this._floaters.push(this.sigils);
            this.motes = new THREE.Group();
            for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const mo = new THREE.Mesh(new THREE.TetrahedronGeometry(0.06, 0), this._mat(pal.accent, 0.9, 0.2, pal.accent)); mo.position.set(Math.cos(a) * 0.85, 1.5 + Math.sin(a * 2) * 0.3, Math.sin(a) * 0.85); this.motes.add(mo); }
            this.bodyGroup.add(this.motes); this._floaters.push(this.motes);
            this._mapCommon({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm, leftLeg: this.body, rightLeg: this.body });
            this._simpleCascade({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm });
        }
        _witchArm(robeMat, skinMat, side, pal) {
            const g = new THREE.Group();
            const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.05, 0.62, 7), robeMat); sleeve.position.y = -0.3; g.add(sleeve);
            const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.4, 6), skinMat); fore.position.y = -0.72; g.add(fore);
            for (let i = 0; i < 4; i++) { const claw = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.22, 4), skinMat); claw.position.set((i - 1.5) * 0.035, -0.96, 0.02); claw.rotation.x = 0.2; g.add(claw); }
            g.position.set(side * 0.32, 1.55, 0.08); g.rotation.z = side * 0.55; g._side = side; this.bodyGroup.add(g); return g;
        }

        // ── Reaper: hooded skeletal figure with a scythe ─────────────────────
        _buildReaper() {
            const p = this.profile, pal = this._bossPalette();
            const robeMat = this._mat(pal.robe, 0.98, 0.9);
            const boneMat = this._skinMat(this._jit(p.bodyColor, 0.08), 0.6);
            this.body = new THREE.Mesh(new THREE.ConeGeometry(0.45, 2.0, 10), robeMat);
            this.body.position.set(0, 1.1, 0); this.bodyGroup.add(this.body);
            // Tattered hem strips (per-id count) for a more ragged silhouette.
            for (let i = 0, n = 5 + ((this.idRand() * 4) | 0); i < n; i++) { const a = (i / n) * Math.PI * 2; const strip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3 + this.idRand() * 0.25, 3), robeMat); strip.position.set(Math.cos(a) * 0.4, 0.18, Math.sin(a) * 0.4); strip.rotation.x = Math.PI; this.bodyGroup.add(strip); }
            // Exposed bio-mechanical ribcage clutching at the robe collar.
            for (let i = 0; i < 4; i++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(0.22 - i * 0.015, 0.022, 5, 10, Math.PI), boneMat); rib.position.set(0, 1.75 - i * 0.16, 0.12); rib.rotation.set(Math.PI / 2, 0, Math.PI); this.bodyGroup.add(rib); }
            const sternum = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), this._mat(pal.accent, 0.95, 0.2, pal.accent)); sternum.position.set(0, 1.5, 0.22); this.bodyGroup.add(sternum); this._floaters.push(sternum);
            // Floating dislocated spine trailing behind (FF8 bio-horror).
            this.spine = new THREE.Group();
            for (let i = 0; i < 5; i++) { const v = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.03, 5, 8), boneMat); v.position.set(0, 0.4 - i * 0.18, -0.34 - i * 0.04); v.rotation.x = Math.PI / 2; this.spine.add(v); const sp = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 4), boneMat); sp.position.set(0, 0.4 - i * 0.18, -0.46 - i * 0.04); sp.rotation.x = -Math.PI / 2; this.spine.add(sp); }
            this.bodyGroup.add(this.spine); this._floaters.push(this.spine);
            // Hood with a skull and a cluster of cold eye-lights.
            this.head = new THREE.Group();
            const hood = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 14, 0, Math.PI * 2, 0, Math.PI * 0.72), robeMat); hood.position.set(0, 0.05, 0); this.head.add(hood);
            for (let i = 0; i < 5; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22, 4), robeMat); const a = (i / 4 - 0.5) * 1.6; sp.position.set(Math.sin(a) * 0.3, 0.18, -0.18); sp.rotation.set(-0.6, 0, -a); this.head.add(sp); }
            const sk = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), boneMat); sk.scale.set(0.9, 1.05, 1); sk.position.set(0, -0.02, 0.1); this.head.add(sk);
            const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.1), boneMat); jaw.position.set(0, -0.16, 0.14); this.head.add(jaw);
            this._eye(this.head, -0.08, 0.0, 0.24, 0.05 + this.idRand() * 0.02, pal.accent); this._eye(this.head, 0.08, 0.0, 0.24, 0.05 + this.idRand() * 0.02, pal.accent);
            for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), this._mat(pal.accent, 0.9, 0.2, pal.accent)); m.position.set((this.idRand() - 0.5) * 0.22, -0.1 + this.idRand() * 0.18, 0.24); this.head.add(m); }
            this.head.position.set(0, 2.1, 0); this.bodyGroup.add(this.head);
            // Asymmetric arms: left bony claw, right an elongated scythe-arm.
            this.leftArm = this._claw(boneMat, -1);
            this.rightArm = this._claw(boneMat, 1); this.rightArm.scale.set(1.15, 1.3, 1.15);
            // Ornate double-curved scythe in the right hand.
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.04, 2.1, 6), this._mat(0x241018, 1.0, 0.7)); pole.position.set(0.58, 1.3, 0.1); pole.rotation.z = 0.08; this.bodyGroup.add(pole);
            const blade = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.045, 6, 14, Math.PI * 0.85), this._mat(0xcfd8e0, 1.0, 0.25, pal.accent)); blade.position.set(0.5, 2.34, 0.1); blade.rotation.set(0, 0, -0.5); this.bodyGroup.add(blade);
            const blade2 = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 6, 10, Math.PI * 0.6), this._mat(0xcfd8e0, 1.0, 0.25, pal.accent)); blade2.position.set(0.62, 0.5, 0.1); blade2.rotation.set(0, Math.PI, 0.7); this.bodyGroup.add(blade2);
            const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), this._mat(pal.accent, 0.95, 0.2, pal.accent)); pommel.position.set(0.56, 2.3, 0.1); this.bodyGroup.add(pommel); this._floaters.push(pommel);
            // Reaped soul-wisps drifting up.
            this.wisps = new THREE.Group();
            for (let i = 0; i < 5; i++) { const w = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22, 4), this._mat(pal.accent, 0.5, 0.2, pal.accent)); const a = (i / 5) * Math.PI * 2; w.position.set(Math.cos(a) * 0.5, 0.6 + this.idRand() * 1.2, Math.sin(a) * 0.5); w._t = this.idRand(); this.wisps.add(w); }
            this.bodyGroup.add(this.wisps); this._floaters.push(this.wisps);
            this._mapCommon({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm, leftLeg: this.body, rightLeg: this.body });
            this._simpleCascade({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm });
        }
        _claw(mat, side) {
            const g = new THREE.Group();
            const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.6, 6), mat);
            arm.position.set(0, -0.3, 0); g.add(arm);
            for (let i = -1; i <= 1; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.16, 4), mat); f.position.set(i * 0.04, -0.62, 0.04); f.rotation.x = -0.3; g.add(f); }
            g.position.set(side * 0.32, 1.55, 0.1); g.rotation.z = side * 0.4; g._side = side;
            this.bodyGroup.add(g); return g;
        }

        // ── Bespoke witch: reuses the sorceress silhouette but each individual
        //    carries a distinct spell-prop + palette (frost/blood/void/etc). ───
        _buildBosWitch() {
            const p = this.profile, spec = p.spec || {};
            const robeMat = this._mat(this._jit(p.robe || p.bodyColor, 0.1), 1.0, 0.82);
            const trimMat = this._mat(this._jit(p.accent, 0.1), 1.0, 0.3, p.accent);
            const skinMat = this._skinMat(this._jit(0xd8c0b0, 0.08), 0.6);
            const darkMat = this._mat(this._jit(p.bodyColor, 0.12), 1.0, 0.75);
            // Layered gown: inner column + flared skirt with pointed hem.
            this.body = new THREE.Group();
            const column = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.34, 1.5, 12), robeMat); column.position.y = -0.1; this.body.add(column);
            const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.4, 14, 1, true), darkMat); skirt.position.y = -0.35; this.body.add(skirt);
            for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.4 + (i % 2) * 0.2, 4), robeMat); spike.position.set(Math.cos(a) * 0.56, -0.9, Math.sin(a) * 0.56); spike.rotation.x = Math.PI; this.body.add(spike); }
            const sash = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 6, 14), trimMat); sash.position.y = 0.4; sash.rotation.x = Math.PI / 2; this.body.add(sash);
            const heart = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), this._mat(p.accent, 0.95, 0.2, p.accent)); heart.position.set(0, 0.55, 0.22); this.body.add(heart);
            this.body.position.set(0, 1.0, 0); this.bodyGroup.add(this.body);
            // Towering fan-collar.
            this.collar = new THREE.Group();
            for (let i = 0; i < 7; i++) { const t = (i / 6 - 0.5); const blade = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.7 + Math.abs(t) * 0.5, 4), robeMat); blade.position.set(t * 0.5, 0.2 + Math.abs(t) * 0.1, -0.28); blade.rotation.set(-0.5, 0, t * 0.7); this.collar.add(blade); }
            this.collar.position.set(0.06, 1.7, 0); this.bodyGroup.add(this.collar); this._floaters.push(this.collar);
            // Head + horned crown.
            this.head = new THREE.Group();
            this.head.add(new THREE.Mesh(new THREE.SphereGeometry(0.25, 14, 14), skinMat));
            this._eye(this.head, -0.1, 0.03, 0.21, 0.05, p.accent); this._eye(this.head, 0.1, 0.03, 0.21, 0.05, p.accent);
            const hair = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.66), this._mat(this._jit(0x241626, 0.35), 1, 0.85)); hair.position.y = 0.05; this.head.add(hair);
            const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.12, 12), trimMat); crown.position.y = 0.24; this.head.add(crown);
            for (const hx of [-0.2, 0.2]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.5 + this.idRand() * 0.25, 6), trimMat); horn.position.set(hx, 0.34, -0.04); horn.rotation.z = hx > 0 ? -0.7 : 0.7; horn.rotation.x = -0.3; this.head.add(horn); }
            this.head.position.set(0, 2.08, 0); this.bodyGroup.add(this.head);
            // Thin clawed arms.
            this.leftArm = this._witchArm(robeMat, skinMat, -1, p); this.rightArm = this._witchArm(robeMat, skinMat, 1, p);
            // Ornate staff + orb held in the right claw.
            const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 1.7, 6), this._mat(0x3a2a3a, 1.0, 0.6)); staff.position.set(0.52, 1.15, 0.12); this.bodyGroup.add(staff);
            const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), this._mat(p.accent, 0.92, 0.2, p.accent)); orb.position.set(0.52, 2.02, 0.12); this.bodyGroup.add(orb); this._floaters.push(orb); this.staffOrb = orb;
            // Signature per-witch spell prop.
            this._witchProp(spec.prop, p.accent);
            // Floating sigils + orbiting motes.
            this.sigils = new THREE.Group();
            for (let k = 0; k < 2; k++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.5 + k * 0.18, 0.012, 4, 6), this._mat(p.accent, 0.55, 0.2, p.accent)); r.position.y = 1.4; r.rotation.set(1.2 + k * 0.4, k, 0); this.sigils.add(r); }
            this.bodyGroup.add(this.sigils); this._floaters.push(this.sigils);
            this._mapCommon({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm, leftLeg: this.body, rightLeg: this.body });
            this._simpleCascade({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm });
        }
        _witchProp(prop, ac) {
            const grp = () => { const g = new THREE.Group(); this.bodyGroup.add(g); this._floaters.push(g); return g; };
            switch (prop) {
                case 'frost': case 'shatter': { const g = grp(); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const sh = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), this._mat(0xcfeaff, 0.8, 0.15, ac)); sh.position.set(Math.cos(a) * 0.8, 1.5 + Math.sin(i) * 0.4, Math.sin(a) * 0.8); g.add(sh); } break; }
                case 'blood': case 'goblet': case 'chalice': { for (let i = 0; i < 8; i++) { const a = i * 2.39996; const dr = new THREE.Mesh(new THREE.SphereGeometry(0.06, 7, 7), this._mat(0x8a1018, 1, 0.3, ac)); dr.scale.y = 1.6; dr.position.set(Math.cos(a) * 0.55, 0.8 + (i % 3) * 0.3, Math.sin(a) * 0.5); this.bodyGroup.add(dr); } break; }
                case 'void': case 'shadow': { const rift = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), this._mat(0x05000a, 0.92, 0.1, ac)); rift.position.set(0, 1.4, -0.5); this.bodyGroup.add(rift); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.04, 8, 26), this._mat(ac, 0.9, 0.2, ac)); ring.position.set(0, 1.4, -0.49); this.bodyGroup.add(ring); break; }
                case 'radiance': { const g = grp(); const h = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.04, 8, 24), this._mat(ac, 0.9, 0.2, ac)); h.position.set(0, 2.5, 0); h.rotation.x = Math.PI / 2; g.add(h); for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; const ray = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.4, 4), this._mat(ac, 0.7, 0.2, ac)); ray.position.set(Math.cos(a) * 0.7, 1.6, Math.sin(a) * 0.7); ray.rotation.z = Math.cos(a); g.add(ray); } break; }
                case 'plague': { const g = grp(); for (let i = 0; i < 12; i++) { const a = i * 2.39996; const s = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), this._mat(ac, 0.6, 0.4, ac)); s.position.set(Math.cos(a) * (0.7 + (i % 3) * 0.14), 1.4 + Math.sin(i * 1.4) * 0.7, Math.sin(a) * 0.7); g.add(s); } break; }
                case 'leech': { for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; const tn = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.09, 1.1, 7), this._mat(this._jit(this.profile.bodyColor, 0.1), 0.9, 0.6)); tn.position.set(Math.cos(a) * 0.55, 0.9, Math.sin(a) * 0.5); tn.rotation.set(0.5, 0, Math.cos(a) * 0.5); this.bodyGroup.add(tn); } break; }
                case 'dream': { const g = grp(); for (let k = 0; k < 3; k++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.6 + k * 0.16, 0.02, 6, 22), this._mat(ac, 0.5, 0.2, ac)); r.position.y = 1.5; r.rotation.set(k * 0.8, k * 0.6, 0); g.add(r); } break; }
                case 'whisper': { for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const t = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.03, 0.6, 5), this._mat(ac, 0.6, 0.3, ac)); t.position.set(Math.cos(a) * 0.35, 2.1, Math.sin(a) * 0.35); t.rotation.set(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5); this.bodyGroup.add(t); } break; }
            }
        }

        // ── Bespoke reaper/operator: hooded figure, per-enemy prop + trophies ─
        _buildBosReaper() {
            const p = this.profile, spec = p.spec || {};
            const robeMat = this._mat(this._jit(p.robe || p.bodyColor, 0.1), 0.98, 0.9);
            const boneMat = this._skinMat(this._jit(p.bodyColor, 0.08), 0.6);
            this.body = new THREE.Mesh(new THREE.ConeGeometry(0.45, 2.0, 10), robeMat);
            this.body.position.set(0, 1.1, 0); this.bodyGroup.add(this.body);
            for (let i = 0, n = 5 + ((this.idRand() * 4) | 0); i < n; i++) { const a = (i / n) * Math.PI * 2; const strip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3 + this.idRand() * 0.25, 3), robeMat); strip.position.set(Math.cos(a) * 0.4, 0.18, Math.sin(a) * 0.4); strip.rotation.x = Math.PI; this.bodyGroup.add(strip); }
            const sternum = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), this._mat(p.accent, 0.95, 0.2, p.accent)); sternum.position.set(0, 1.5, 0.22); this.bodyGroup.add(sternum); this._floaters.push(sternum);
            // Hood + skull + cold eye-lights.
            this.head = new THREE.Group();
            const hood = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 14, 0, Math.PI * 2, 0, Math.PI * 0.72), robeMat); hood.position.set(0, 0.05, 0); this.head.add(hood);
            const sk = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), boneMat); sk.scale.set(0.9, 1.05, 1); sk.position.set(0, -0.02, 0.1); this.head.add(sk);
            const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.1), boneMat); jaw.position.set(0, -0.16, 0.14); this.head.add(jaw);
            this._eye(this.head, -0.08, 0.0, 0.24, 0.05 + this.idRand() * 0.02, p.accent); this._eye(this.head, 0.08, 0.0, 0.24, 0.05 + this.idRand() * 0.02, p.accent);
            if (spec.crown) { for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const c = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.2, 4), this._mat(p.accent, 1, 0.3, p.accent)); c.position.set(Math.cos(a) * 0.3, 0.24, Math.sin(a) * 0.3); this.head.add(c); } }
            this.head.position.set(0, 2.1, 0); this.bodyGroup.add(this.head);
            // Asymmetric bony arms.
            this.leftArm = this._claw(boneMat, -1);
            this.rightArm = this._claw(boneMat, 1); this.rightArm.scale.set(1.15, 1.3, 1.15);
            // Signature weapon / implement.
            this._reaperProp(spec.prop, p.accent);
            // Trophy flourish.
            this._reaperTrophies(spec.trophies, p.accent);
            this._mapCommon({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm, leftLeg: this.body, rightLeg: this.body });
            this._simpleCascade({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm });
        }
        _reaperProp(prop, ac) {
            switch (prop) {
                case 'scythe': { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.04, 2.1, 6), this._mat(0x241018, 1.0, 0.7)); pole.position.set(0.58, 1.3, 0.1); pole.rotation.z = 0.08; this.bodyGroup.add(pole); const blade = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.045, 6, 14, Math.PI * 0.85), this._mat(0xcfd8e0, 1.0, 0.25, ac)); blade.position.set(0.5, 2.34, 0.1); blade.rotation.set(0, 0, -0.5); this.bodyGroup.add(blade); break; }
                case 'scalpel': case 'needle': { const blade = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.7, 4), this._mat(0xdfe8ef, 1.0, 0.2, ac)); blade.position.set(0.5, 1.1, 0.2); blade.rotation.z = -0.3; this.bodyGroup.add(blade); const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6), this._mat(0x9aa4ac, 1, 0.3)); hilt.position.set(0.55, 1.45, 0.2); hilt.rotation.z = -0.3; this.bodyGroup.add(hilt); break; }
                case 'stinger': { const g = new THREE.Group(); let pz = 0, r = 0.14; for (let s = 0; s < 6; s++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), this._mat(this._jit(this.profile.bodyColor, 0.1), 1, 0.5)); seg.position.set(0, 0.4 + s * 0.28, pz); g.add(seg); pz -= 0.06; r *= 0.85; } const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.4, 5), this._mat(ac, 1, 0.3, ac)); tip.position.set(0, 2.1, -0.3); tip.rotation.x = -0.6; g.add(tip); g.position.set(0, 0.9, -0.5); this.bodyGroup.add(g); this._floaters.push(g); this.tail = g; break; }
                case 'brazier': case 'lantern': { const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), this._mat(0x3a2a1a, 1, 0.6)); bowl.position.set(0.55, 1.2, 0.2); this.bodyGroup.add(bowl); const flame = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 8), this._mat(ac, 0.8, 0.2, ac)); flame.position.set(0.55, 1.45, 0.2); this.bodyGroup.add(flame); this._floaters.push(flame); break; }
                case 'gavel': case 'sceptre': { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.5, 6), this._mat(0x3a2a1a, 1, 0.6)); pole.position.set(0.55, 1.2, 0.15); this.bodyGroup.add(pole); const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.2), this._mat(ac, 0.9, 0.3, ac)); head.position.set(0.55, 1.95, 0.15); this.bodyGroup.add(head); break; }
                case 'strings': { for (let i = 0; i < 5; i++) { const a = (i / 5 - 0.5) * 1.2; const t = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1.4, 4), this._mat(ac, 0.6, 0.3, ac)); t.position.set(0.4 + a * 0.3, 1.0, 0.3); t.rotation.z = a * 0.4; this.bodyGroup.add(t); } break; }
                case 'wheel': { const rim = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.04, 8, 22), this._mat(0x2a2622, 1, 0.6)); rim.position.set(0.5, 1.1, 0.25); rim.rotation.y = 0.4; this.bodyGroup.add(rim); this._floaters.push(rim); for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 5), this._mat(ac, 0.7, 0.3, ac)); sp.position.set(0.5, 1.1, 0.25); sp.rotation.set(0, 0.4, a); this.bodyGroup.add(sp); } break; }
            }
        }
        _reaperTrophies(trophies, ac) {
            const grp = () => { const g = new THREE.Group(); this.bodyGroup.add(g); this._floaters.push(g); return g; };
            switch (trophies) {
                case 'wisps': { const g = grp(); for (let i = 0; i < 5; i++) { const w = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22, 4), this._mat(ac, 0.5, 0.2, ac)); const a = (i / 5) * Math.PI * 2; w.position.set(Math.cos(a) * 0.5, 0.6 + this.idRand() * 1.2, Math.sin(a) * 0.5); g.add(w); } break; }
                case 'skulls': { for (let i = 0; i < 5; i++) { const a = i * 2.39996; const sk = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), this._mat(0xe8dcc0, 1, 0.5)); sk.position.set(Math.cos(a) * 0.5, 0.6 + (i % 3) * 0.35, Math.sin(a) * 0.45); this.bodyGroup.add(sk); } break; }
                case 'organs': { for (let i = 0; i < 5; i++) { const a = i * 2.39996; const o = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), this._mat(0xb04a58, 1, 0.5)); o.scale.set(1, 1.3, 0.8); o.position.set(Math.cos(a) * 0.48, 0.7 + (i % 3) * 0.3, Math.sin(a) * 0.45); this.bodyGroup.add(o); } break; }
                case 'flames': { const g = grp(); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const fl = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.4, 5), this._mat(ac, 0.75, 0.2, ac)); fl.position.set(Math.cos(a) * 0.5, 0.5 + Math.sin(i) * 0.3, Math.sin(a) * 0.5); g.add(fl); } break; }
                case 'venom': { const g = grp(); for (let i = 0; i < 8; i++) { const a = i * 2.39996; const s = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), this._mat(ac, 0.6, 0.4, ac)); s.position.set(Math.cos(a) * (0.6 + (i % 3) * 0.12), 1.2 + Math.sin(i) * 0.5, Math.sin(a) * 0.55); g.add(s); } break; }
                case 'halo': { const h = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.03, 8, 22), this._mat(ac, 0.9, 0.2, ac)); h.position.set(0, 2.55, 0); h.rotation.x = Math.PI / 2; const g = grp(); g.add(h); break; }
                case 'oil': { for (let i = 0; i < 8; i++) { const a = i * 2.39996; const dr = new THREE.Mesh(new THREE.SphereGeometry(0.06, 7, 7), this._mat(0x0c0a08, 1, 0.3)); dr.scale.y = 1.6; dr.position.set(Math.cos(a) * 0.5, 0.7 + (i % 3) * 0.3, Math.sin(a) * 0.45); this.bodyGroup.add(dr); } break; }
            }
        }

        // ── Bespoke vampire: front-facing noble with a flowing cape ───────────
        _buildBosVampire() {
            const p = this.profile, spec = p.spec || {};
            const robeMat = this._mat(this._jit(p.robe || p.bodyColor, 0.1), 1.0, 0.7);
            const skinMat = this._skinMat(this._jit(0xe8e0e0, 0.05), 0.5);
            const trimMat = this._mat(this._jit(p.accent, 0.1), 1.0, 0.3, p.accent);
            // Torso + high-collared coat.
            this.body = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 1.2, 12), robeMat); this.body.add(torso);
            const legs = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.9, 12, 1, true), robeMat); legs.position.y = -0.9; this.body.add(legs);
            const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), this._mat(p.accent, 0.95, 0.2, p.accent)); gem.position.set(0, 0.3, 0.24); this.body.add(gem);
            this.body.position.set(0, 1.2, 0); this.bodyGroup.add(this.body);
            // Dramatic upturned collar.
            for (const sx of [-1, 1]) { const wing = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 4, 1, true), this._mat(this._jit(p.spec.cape, 0.1), 1, 0.75)); wing.position.set(sx * 0.22, 1.9, -0.14); wing.rotation.set(0.4, 0, sx * 0.4); this.bodyGroup.add(wing); }
            // Flowing cape behind.
            const cape = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.9, 10, 1, true), this._mat(this._jit(spec.cape, 0.08), 0.95, 0.8)); cape.position.set(0, 1.2, -0.32); this.bodyGroup.add(cape);
            // Head + slicked hair + red eyes + fangs.
            this.head = new THREE.Group();
            this.head.add(new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 14), skinMat));
            const hair = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), this._mat(0x14100e, 1, 0.8)); hair.position.y = 0.06; this.head.add(hair);
            this._eye(this.head, -0.09, 0.02, 0.2, 0.045, p.accent); this._eye(this.head, 0.09, 0.02, 0.2, 0.045, p.accent);
            for (const fx of [-0.05, 0.05]) { const fang = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.08, 4), this._mat(0xffffff, 1, 0.3)); fang.position.set(fx, -0.14, 0.2); fang.rotation.x = Math.PI; this.head.add(fang); }
            this.head.position.set(0, 2.1, 0); this.bodyGroup.add(this.head);
            // Arms with clawed hands.
            this.leftArm = this._vampArm(robeMat, skinMat, -1); this.rightArm = this._vampArm(robeMat, skinMat, 1);
            // Mist / bat swarm flourish.
            if (spec.mist) { for (let i = 0; i < 10; i++) { const a = i * 2.39996; const m = new THREE.Mesh(new THREE.SphereGeometry(0.14 - (i % 3) * 0.03, 8, 8), this._mat(this._jit(p.bodyColor, 0.2), 0.35, 0.6)); m.position.set(Math.cos(a) * (0.7 + (i % 3) * 0.1), 0.5 + Math.sin(i) * 0.4, Math.sin(a) * 0.6); this.bodyGroup.add(m); } }
            if (spec.bats) { const g = new THREE.Group(); this.bodyGroup.add(g); this._floaters.push(g); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const bat = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 3), this._mat(this._jit(p.bodyColor, 0.15), 0.8, 0.6)); bat.scale.set(2, 0.4, 1); bat.position.set(Math.cos(a) * 0.9, 1.6 + Math.sin(a) * 0.3, Math.sin(a) * 0.9); g.add(bat); } }
            this._mapCommon({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm, leftLeg: this.body, rightLeg: this.body });
            this._simpleCascade({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm });
        }
        _vampArm(robeMat, skinMat, side) {
            const g = new THREE.Group();
            const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.7, 8), robeMat); sleeve.position.y = -0.35; g.add(sleeve);
            const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), skinMat); hand.position.y = -0.72; g.add(hand);
            for (let i = -1; i <= 1; i++) { const claw = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.14, 4), skinMat); claw.position.set(i * 0.03, -0.82, 0.03); claw.rotation.x = 0.2; g.add(claw); }
            g.position.set(side * 0.3, 1.65, 0.06); g.rotation.z = side * 0.35; g._side = side; this.bodyGroup.add(g); return g;
        }

        // ── Bespoke angel: radiant winged humanoid, multi-ring halos ──────────
        _buildBosAngel() {
            const p = this.profile, spec = p.spec || {};
            const robeMat = this._mat(this._jit(p.robe || p.bodyColor, 0.05), 1.0, 0.6);
            const skinMat = this._skinMat(this._jit(0xf0e8d8, 0.04), 0.5);
            const glowMat = this._mat(p.accent, 0.9, 0.2, p.accent);
            // Robed body.
            this.body = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 1.2, 12), robeMat); this.body.add(torso);
            const gown = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.1, 12, 1, true), robeMat); gown.position.y = -0.9; this.body.add(gown);
            const chest = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), glowMat); chest.position.set(0, 0.35, 0.22); this.body.add(chest);
            this.body.position.set(0, 1.3, 0); this.bodyGroup.add(this.body);
            // Serene head.
            this.head = new THREE.Group();
            this.head.add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 14), skinMat));
            this._eye(this.head, -0.08, 0.02, 0.19, 0.04, p.accent); this._eye(this.head, 0.08, 0.02, 0.19, 0.04, p.accent);
            this.head.position.set(0, 2.2, 0); this.bodyGroup.add(this.head);
            // Radiant halo rings.
            this.halos = new THREE.Group();
            for (let k = 0; k < (spec.halos || 1); k++) { const h = new THREE.Mesh(new THREE.TorusGeometry(0.36 + k * 0.12, 0.03, 8, 24), glowMat); h.position.set(0, 2.62 + k * 0.06, 0); h.rotation.x = Math.PI / 2; this.halos.add(h); }
            this.bodyGroup.add(this.halos); this._floaters.push(this.halos);
            // Multiple feathered wings.
            this.wings = new THREE.Group();
            const n = spec.wings || 6;
            for (let i = 0; i < n; i++) { const side = i % 2 ? 1 : -1; const tier = (i >> 1); const w = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.3, 4), this._mat(this._jit(0xffffff, 0.03), 0.9, 0.6, p.accent)); w.scale.set(0.3, 1, 1); w.position.set(side * 0.35, 1.7 - tier * 0.35, -0.25); w.rotation.z = side * (1.1 - tier * 0.2); this.wings.add(w); }
            this.bodyGroup.add(this.wings); this._floaters.push(this.wings);
            // Arms.
            this.leftArm = this._vampArm(robeMat, skinMat, -1); this.rightArm = this._vampArm(robeMat, skinMat, 1);
            // Prismatic flourish for the enhanced avatar.
            if (spec.prism) { this._prismMeshes = []; for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const pl = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.7, 0.4), this._mat(p.accent, 0.6, 0.1, p.accent)); pl.position.set(Math.cos(a) * 0.6, 1.3, Math.sin(a) * 0.6); pl.rotation.y = a; this.bodyGroup.add(pl); this._prismMeshes.push(pl); } }
            this.coreGlow = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), glowMat); this.coreGlow.position.set(0, 1.3, 0); this.bodyGroup.add(this.coreGlow);
            this._mapCommon({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm, leftLeg: this.body, rightLeg: this.body });
            this._simpleCascade({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm });
        }

        // ── Bespoke dragon: front-facing winged reptile, per-element breath ───
        _buildBosDragon() {
            const p = this.profile, spec = p.spec || {};
            const mat = this._skinMat(this._jit(p.bodyColor, 0.08), 0.8);
            const glowMat = this._mat(spec.breath || p.accent, 0.85, 0.2, spec.breath || p.accent);
            // Hulking serpentine torso.
            this.body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 1.6, 12), mat);
            this.body.scale.set(1.0, 1.0, 0.9); this.body.position.set(0, 1.5, 0); this.bodyGroup.add(this.body);
            // Belly plates glow.
            for (let i = 0; i < 5; i++) { const pl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.06), glowMat); pl.position.set(0, 0.9 + i * 0.28, 0.55); this.bodyGroup.add(pl); }
            // Head with maw + horns.
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4, 0), mat); this.head.add(skull);
            const snout = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.7, 8), mat); snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.05, 0.5); this.head.add(snout);
            const maw = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), this._mat(0x100808, 1, 0.6)); maw.position.set(0, -0.14, 0.55); maw.rotation.x = -1.4; this.head.add(maw);
            const breath = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), glowMat); breath.position.set(0, -0.12, 0.7); this.head.add(breath); this._floaters.push(breath); this.staffOrb = breath;
            this._eye(this.head, -0.16, 0.1, 0.32, 0.06, p.accent); this._eye(this.head, 0.16, 0.1, 0.32, 0.06, p.accent);
            this._dragonHorns(spec.horns, mat, p.accent);
            this.head.position.set(0, 2.6, 0.2); this.bodyGroup.add(this.head);
            // Broad wings (count from spec).
            this.wings = new THREE.Group();
            const wn = spec.wings || 2;
            for (let i = 0; i < wn; i++) {
                const side = i % 2 ? 1 : -1; const tier = (i >> 1);
                const mem = this._mat(this._jit(p.bodyColor, 0.14), 0.9, 0.85);
                const wing = this.buildDragonWing(mem, side, side * 0.6, 2.0 - tier * 0.4, -0.4, { span: 1.4 - tier * 0.15, angMin: 0.5 - tier * 0.1, angMax: 1.45 - tier * 0.1 });
                wing.rotation.x = 0.2;
                this.wings.add(wing);
            }
            this.bodyGroup.add(this.wings); this._floaters.push(this.wings);
            // Legs + arms (clawed reptilian limbs).
            this.leftLeg = this._dragonLimb(mat, -0.5, 0.55, true); this.rightLeg = this._dragonLimb(mat, 0.5, 0.55, true);
            this.leftArm = this._dragonLimb(mat, -0.62, 1.7, false); this.rightArm = this._dragonLimb(mat, 0.62, 1.7, false);
            // Long tail.
            this.tail = new THREE.Group(); let pz = 0, r = 0.28, tPrev = new THREE.Vector3(0, 0, 0), tPrevR = r;
            for (let s = 0; s < 7; s++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), mat); seg.position.set(0, 0, pz); this.tail.add(seg); const pt = new THREE.Vector3(0, 0, pz); if (s > 0) this.addStrut(this.tail, mat, tPrev, pt, tPrevR * 0.85, r * 0.85); tPrev = pt; tPrevR = r; pz -= 0.34; r *= 0.84; }
            this.tail.position.set(0, 0.9, -0.7); this.bodyGroup.add(this.tail); this._floaters.push(this.tail);
            // Elemental aura flourish.
            if (spec.storm || spec.cosmic) { const g = new THREE.Group(); this.bodyGroup.add(g); this._floaters.push(g); for (let k = 0; k < 3; k++) { const rg = new THREE.Mesh(new THREE.TorusGeometry(1.0 + k * 0.22, 0.03, 8, 28), this._mat(p.accent, 0.6, 0.2, p.accent)); rg.position.y = 1.5; rg.rotation.set(k * 0.7, k * 1.1, 0); g.add(rg); } }
            if (spec.quake) { for (let i = 0; i < 6; i++) { const a = i * 2.39996; const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 0), mat); rk.position.set(Math.cos(a) * 0.9, 0.4, Math.sin(a) * 0.9); this.bodyGroup.add(rk); } }
            this.coreGlow = breath;
            this._mapCommon({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm, leftLeg: this.leftLeg, rightLeg: this.rightLeg });
            this._simpleCascade({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm, leftLeg: this.leftLeg, rightLeg: this.rightLeg });
        }
        _dragonHorns(kind, mat, ac) {
            const hornMat = kind === 'ice' ? this._mat(0xcfeaff, 0.85, 0.15, ac) : (kind === 'crown' ? this._mat(ac, 1, 0.3, ac) : this._mat(0xe8dcc0, 1, 0.4));
            if (kind === 'crown') { for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const sp = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.4, 5), hornMat); sp.position.set(Math.cos(a) * 0.34, 0.3, Math.sin(a) * 0.34 - 0.1); this.head.add(sp); } return; }
            const len = kind === 'ram' ? 0.55 : (kind === 'crag' ? 0.5 : 0.6);
            for (const x of [-0.22, 0.22]) { const horn = new THREE.Mesh(kind === 'ram' ? new THREE.TorusGeometry(0.2, 0.05, 6, 12, Math.PI * 1.2) : new THREE.ConeGeometry(0.07, len, 6), hornMat); horn.position.set(x, 0.34, -0.08); if (kind === 'ram') horn.rotation.set(1.4, 0, x > 0 ? -0.6 : 0.6); else horn.rotation.z = x * 0.5; this.head.add(horn); }
        }
        _dragonLimb(mat, side, y, leg) {
            const g = new THREE.Group();
            const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, leg ? 0.9 : 0.7, 8), mat); upper.position.y = leg ? -0.45 : -0.35; g.add(upper);
            const foot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), mat); foot.position.y = leg ? -0.95 : -0.72; g.add(foot);
            for (let i = -1; i <= 1; i++) { const claw = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.18, 4), this._mat(0xe8dcc0, 1, 0.3)); claw.position.set(i * 0.06, leg ? -1.05 : -0.82, 0.12); claw.rotation.x = 1.0; g.add(claw); }
            g.position.set(side, y, leg ? 0.1 : 0.2); g.rotation.z = leg ? 0 : -Math.sign(side) * 0.3; g._side = Math.sign(side);
            this.bodyGroup.add(g); return g;
        }

        // ── Petrodemon ───────────────────────────────────────────────────────
        // Every other model is keyed to its enemy id, which is what makes a
        // species look the same wherever it is met. A petrodemon is generated
        // per battle into ONE reused scratch enemy slot, so the id says nothing
        // about it: it carries its own <PetroSeed:> and every roll here reads
        // that instead, which is what makes each one a different creature.
        _petroReseed() {
            let seed = 0;
            const ed = (this.battler && this.battler.enemy) ? this.battler.enemy() : null;
            if (ed && ed.meta && ed.meta.PetroSeed) seed = parseInt(ed.meta.PetroSeed, 10) || 0;
            if (!seed) seed = 1 + Math.floor(Math.random() * 0x7ffffffe);
            let s = seed >>> 0;
            const rng = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
            // Crude is black; what differs between two heaps is the film on top
            // of it, so the roll goes into the sheen rather than the body.
            this.color.setHSL(rng(), 0.30 + rng() * 0.45, 0.06 + rng() * 0.05);
            this._sheenHue = rng();
            const pool = (window.Battler3D.TEXTURE_POOLS || {}).metal;
            if (pool && pool.length) this.skinTextureFile = pool[Math.floor(rng() * pool.length)];
            this._skinTextureObj = null;                 // rebuilt from the new colour
            this.scale *= 0.90 + rng() * 0.32;
            this.shapeXYZ.x *= 0.92 + rng() * 0.24;
            this.shapeXYZ.y *= 0.90 + rng() * 0.28;
            this.shapeXYZ.z *= 0.92 + rng() * 0.24;
            this._pRand = rng;
            return rng;
        }

        // One graft: a part torn off something else and set into the crude.
        // Built pointing +Y, so the caller only has to aim and plant it.
        _petroGraft(kind, oil, bone, chitin) {
            const rng = this._pRand;
            const g = new THREE.Group();
            const seg = (mat, r1, r2, len, y) => {
                const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, 8), mat);
                m.position.y = y; g.add(m); return m;
            };
            switch (kind) {
                case 'insectleg': {                                  // i18n-ignore: internal tag
                    const a = seg(chitin, 0.07, 0.05, 0.7, 0.35);
                    const b = seg(chitin, 0.05, 0.02, 0.8, 1.05); b.rotation.z = 0.9; b.position.x = 0.28;
                    const claw = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22, 6), bone);
                    claw.position.set(0.62, 1.32, 0); claw.rotation.z = 2.3; g.add(claw);
                    a.rotation.z = -0.15;
                    break;
                }
                case 'wing': {                                       // i18n-ignore: internal tag
                    const shape = new THREE.Shape();
                    shape.moveTo(0, 0); shape.quadraticCurveTo(0.9, 0.7, 1.25, 0.05);
                    shape.quadraticCurveTo(0.8, 0.15, 0.75, -0.35); shape.quadraticCurveTo(0.4, -0.1, 0, 0);
                    const w = new THREE.Mesh(new THREE.ShapeGeometry(shape), bone);
                    w.material.side = THREE.DoubleSide;
                    w.position.y = 0.55; w.rotation.y = 0.3; g.add(w);
                    for (let i = 0; i < 3; i++) {
                        const rib = seg(bone, 0.035, 0.012, 0.75, 0.55);
                        rib.rotation.z = -1.0 - i * 0.28; rib.position.x = 0.3;
                    }
                    break;
                }
                case 'batwing': {                                    // i18n-ignore: internal tag
                    const membrane = new THREE.Mesh(new THREE.CircleGeometry(0.62, 10, 0, Math.PI), oil);
                    membrane.position.y = 0.6; membrane.rotation.z = -0.4; g.add(membrane);
                    for (let i = 0; i < 3; i++) {
                        const rib = seg(chitin, 0.03, 0.01, 0.9, 0.62);
                        rib.rotation.z = -0.8 - i * 0.35; rib.position.x = 0.22;
                    }
                    break;
                }
                case 'clawarm': {                                    // i18n-ignore: internal tag
                    seg(chitin, 0.13, 0.09, 0.85, 0.42);
                    const fore = seg(chitin, 0.09, 0.07, 0.7, 1.1); fore.rotation.z = 0.5; fore.position.x = 0.2;
                    for (let i = -1; i <= 1; i++) {
                        const c = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.32, 6), bone);
                        c.position.set(0.48 + i * 0.02, 1.42 + i * 0.08, i * 0.09);
                        c.rotation.z = 2.1 + i * 0.25; g.add(c);
                    }
                    break;
                }
                case 'handarm': {                                    // i18n-ignore: internal tag
                    seg(bone, 0.12, 0.09, 0.8, 0.4);
                    seg(bone, 0.09, 0.08, 0.7, 1.12);
                    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.1), bone);
                    palm.position.y = 1.55; g.add(palm);
                    for (let i = 0; i < 4; i++) {
                        const f = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.24, 5), bone);
                        f.position.set(-0.075 + i * 0.05, 1.74, 0); f.rotation.z = (i - 1.5) * 0.12; g.add(f);
                    }
                    break;
                }
                case 'tentacle': {                                   // i18n-ignore: internal tag
                    let r = 0.16, y = 0, bend = 0;
                    const chain = new THREE.Group();
                    let node = chain;
                    for (let i = 0; i < 6; i++) {
                        const s = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), oil);
                        s.position.set(0, 0.26, 0); s.rotation.z = bend;
                        node.add(s); node = s; r *= 0.82; bend = (rng() - 0.5) * 0.5; y += 0.26;
                    }
                    chain.position.y = 0.2; g.add(chain); g._chain = chain;
                    break;
                }
                case 'skull': {                                      // i18n-ignore: internal tag
                    const s = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), bone);
                    s.scale.set(0.9, 1.0, 1.15); s.position.y = 0.5; g.add(s);
                    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.3), bone);
                    jaw.position.set(0, 0.3, 0.1); g.add(jaw);
                    const socket = this._mat(0x02020a, 1.0, 0.4, this.color.getHex());
                    for (const sx of [-0.11, 0.11]) {
                        const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), socket);
                        e.position.set(sx, 0.55, 0.26); g.add(e);
                    }
                    for (let i = -1; i <= 1; i += 2) {
                        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.4, 6), bone);
                        horn.position.set(i * 0.2, 0.78, -0.05); horn.rotation.z = -i * 0.6; g.add(horn);
                    }
                    break;
                }
                case 'antlers': {                                    // i18n-ignore: internal tag
                    const main = seg(bone, 0.055, 0.02, 0.9, 0.45); main.rotation.z = 0.2;
                    for (let i = 0; i < 3; i++) {
                        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.012, 0.4, 5), bone);
                        b.position.set(-0.1 - i * 0.05, 0.5 + i * 0.24, 0);
                        b.rotation.z = 0.9 + i * 0.2; g.add(b);
                    }
                    break;
                }
                case 'mandibles': {                                  // i18n-ignore: internal tag
                    for (let i = -1; i <= 1; i += 2) {
                        const m = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.65, 6), chitin);
                        m.position.set(i * 0.16, 0.35, 0); m.rotation.z = -i * 0.5; g.add(m);
                    }
                    const gullet = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), this._mat(0x02020a, 1.0, 0.5));
                    gullet.position.y = 0.12; g.add(gullet);
                    break;
                }
                case 'eyestalk': {                                   // i18n-ignore: internal tag
                    seg(oil, 0.06, 0.05, 0.8, 0.4);
                    this._eye(g, 0, 0.86, 0, 0.16, this.profile.accent);
                    break;
                }
                case 'piston': {                                     // i18n-ignore: internal tag
                    const barrel = seg(this._mat(0x3a3a42, 1.0, 0.35), 0.11, 0.11, 0.6, 0.3);
                    barrel.material.metalness = 0.9;
                    const rod = seg(this._mat(0x8a8a92, 1.0, 0.2), 0.045, 0.045, 0.7, 0.85);
                    rod.material.metalness = 1.0;
                    g._piston = rod;
                    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.1, 8), barrel.material);
                    cap.position.y = 1.22; g.add(cap);
                    break;
                }
                case 'vine': {                                       // i18n-ignore: internal tag
                    const stem = seg(this._mat(0x2a3a1a, 1.0, 0.8), 0.05, 0.03, 1.0, 0.5);
                    stem.rotation.z = 0.25;
                    for (let i = 0; i < 4; i++) {
                        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), stem.material);
                        leaf.scale.set(1.0, 0.25, 0.5);
                        leaf.position.set((i % 2 ? 0.14 : -0.14), 0.3 + i * 0.22, 0);
                        leaf.rotation.z = (i % 2 ? -0.6 : 0.6); g.add(leaf);
                    }
                    break;
                }
                default: {                                           // ribcage
                    for (let i = 0; i < 4; i++) {
                        const rib = new THREE.Mesh(new THREE.TorusGeometry(0.24 - i * 0.03, 0.03, 6, 14, Math.PI), bone);
                        rib.position.y = 0.25 + i * 0.2; rib.rotation.y = Math.PI / 2; g.add(rib);
                    }
                    seg(bone, 0.04, 0.04, 0.95, 0.55);
                    break;
                }
            }
            // Where it meets the crude it is drowned in it.
            const sump = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), oil);
            sump.scale.set(1.2, 0.6, 1.2); g.add(sump);
            return g;
        }

        _buildPetrodemon() {
            const p = this.profile;
            const rng = this._petroReseed();
            const oil = this._skinMat(p.bodyColor, 0.10);
            oil.metalness = 0.9;
            oil.emissive = new THREE.Color().setHSL(this._sheenHue, 0.85, 0.22);
            oil.emissiveIntensity = 0.5;
            this._oilMat = oil;
            const bone = this._mat(0xcabd92, 1.0, 0.75);
            const chitin = this._mat(0x241a14, 1.0, 0.45);

            // The heap: lobes of crude piled and boiling, never the same twice.
            this.body = new THREE.Group();
            this._blobs = [];
            const lobes = 7 + Math.floor(rng() * 6);
            let topY = 0, topR = 0;
            for (let i = 0; i < lobes; i++) {
                const r = 0.42 + rng() * 0.55;
                const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 12), oil);
                const a = rng() * Math.PI * 2, rad = rng() * 0.85 * (1 - i / (lobes * 1.6));
                const y = 0.45 + (i / lobes) * 1.9 + rng() * 0.3;
                m.position.set(Math.cos(a) * rad, y, Math.sin(a) * rad * 0.85);
                m.scale.set(1 + rng() * 0.35, 0.78 + rng() * 0.5, 1 + rng() * 0.35);
                m._t = rng() * 6.28; m._r = r; m._home = m.position.clone();
                this.body.add(m); this._blobs.push(m);
                if (y > topY) { topY = y; topR = r; }
            }
            this.bodyGroup.add(this.body);

            // The pool it stands in, and the crude running back down into it.
            const pool = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.12, 20), oil);
            pool.position.y = 0.06; this.bodyGroup.add(pool);
            this._drips = [];
            for (let i = 0; i < 9; i++) {
                const d = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), oil);
                d.scale.set(0.7, 1.8, 0.7);
                const a = rng() * Math.PI * 2, rad = 0.5 + rng() * 0.9;
                d.position.set(Math.cos(a) * rad, 0.4 + rng() * 1.8, Math.sin(a) * rad * 0.8);
                d._x = d.position.x; d._z = d.position.z;
                d._top = 0.6 + rng() * 1.7; d._t = rng();
                d._spd = 0.5 + rng() * 0.9;
                this.bodyGroup.add(d); this._drips.push(d);
            }

            // The head is the crowning lobe: eyes it never grew and a maw.
            this.head = new THREE.Group();
            this.head.position.set(0, topY + topR * 0.5, 0.1);
            const eyes = 2 + Math.floor(rng() * 5);
            for (let i = 0; i < eyes; i++) {
                this._eye(this.head, (rng() - 0.5) * 0.7, (rng() - 0.5) * 0.5,
                    0.28 + rng() * 0.2, 0.07 + rng() * 0.09, p.accent);
            }
            const maw = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), this._mat(0x02020a, 1.0, 0.4));
            maw.position.set(0, -0.28, 0.24); maw.rotation.x = -1.5; this.head.add(maw);
            for (let i = 0; i < 6; i++) {
                const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 5), bone);
                const a = (i / 6) * Math.PI - Math.PI / 2;
                tooth.position.set(Math.sin(a) * 0.22, -0.24, 0.26 + Math.cos(a) * 0.06);
                tooth.rotation.x = 0.4; this.head.add(tooth);
            }
            this.bodyGroup.add(this.head);

            // The grafts: whatever the well swallowed, still moving.
            const KINDS = ['insectleg', 'wing', 'batwing', 'clawarm', 'handarm', 'tentacle',
                'skull', 'antlers', 'mandibles', 'eyestalk', 'piston', 'vine', 'ribcage'];
            this._grafts = [];
            const n = 6 + Math.floor(rng() * 5);
            for (let i = 0; i < n; i++) {
                const kind = KINDS[Math.floor(rng() * KINDS.length)];
                const g = this._petroGraft(kind, oil, bone, chitin);
                const a = (i / n) * Math.PI * 2 + rng() * 0.6;
                const rad = 0.55 + rng() * 0.65;
                g.position.set(Math.cos(a) * rad, 0.5 + rng() * 1.7, Math.sin(a) * rad * 0.85);
                g.rotation.z = -Math.cos(a) * (0.5 + rng() * 0.7);
                g.rotation.x = Math.sin(a) * (0.4 + rng() * 0.6);
                g.rotation.y = rng() * 0.8 - 0.4;
                const s = 0.75 + rng() * 0.8;
                g.scale.set(s, s, s);
                g._t = rng() * 6.28;
                g._sway = 0.06 + rng() * 0.14;
                this.bodyGroup.add(g); this._grafts.push(g);
            }

            const [a1, a2, l1, l2] = this._grafts;
            this._mapCommon({ head: this.head, body: this.body, leftArm: a1, rightArm: a2, leftLeg: l1, rightLeg: l2 });
            this._simpleCascade({ head: this.head, body: this.body, leftArm: a1, rightArm: a2, leftLeg: l1, rightLeg: l2 });
        }

        _animatePetrodemon(t, fast) {
            // The heap never settles: every lobe boils on its own clock.
            const heat = fast ? 2.4 : 1.0;
            for (const b of this._blobs || []) {
                if (!b.visible) continue;
                const w = Math.sin(t * (1.4 + b._r) + b._t) * 0.09 * heat;
                b.position.y = b._home.y + w;
                b.scale.y = (0.78 + b._r * 0.2) * (1 - w * 0.5);
                b.scale.x = b.scale.z = 1 + w * 0.35;
            }
            // The film on the crude turns as it moves.
            if (this._oilMat) {
                this._oilMat.emissive.setHSL((this._sheenHue + t * 0.05) % 1, 0.85, fast ? 0.32 : 0.2);
            }
            // Grafts twitch with whatever is left of the creature they came off.
            for (const g of this._grafts || []) {
                if (!g.visible) continue;
                g.rotation.y += Math.sin(t * (fast ? 7 : 2.2) + g._t) * g._sway * 0.05;
                g.position.y += Math.sin(t * (fast ? 6 : 1.8) + g._t) * 0.004;
                if (g._chain) g._chain.rotation.z = Math.sin(t * (fast ? 5 : 1.6) + g._t) * 0.3;
                if (g._piston) g._piston.position.y = 0.85 + Math.abs(Math.sin(t * (fast ? 9 : 3) + g._t)) * 0.18;
            }
            // Crude runs down it and is swallowed by the pool at its feet.
            for (const d of this._drips || []) {
                d._t += 0.016 * d._spd * (fast ? 1.8 : 1);
                if (d._t > 1) d._t -= 1;
                d.position.y = d._top * (1 - d._t) + 0.08;
                d.scale.y = 1.8 + d._t * 1.6;
            }
        }

        animatePose(deltaTime) {
            if (this._baseY === null) this._baseY = this.model.position.y;
            const t = this.animTime;
            const anim = this.currentAnimation;
            let growth = 1.0;
            if (anim === 'spawn') growth = Math.min(1.0, t / 0.9);
            this.applyModelScale(growth);

            const fast = (anim === 'attack' || anim === 'specialattack' || anim === 'cast' || anim === 'beam' || anim === 'summon' || anim === 'slam' || anim === 'roar');
            const hitJolt = anim === 'hit' ? Math.sin(t * 22) * Math.exp(-t * 6) * 0.1 : 0;
            this.model.rotation.z = hitJolt;
            const floats = (this.variant === 'eldritch' || this.variant === 'witch' || this.variant === 'reaper'
                || this.variant === 'boswitch' || this.variant === 'bosreaper' || this.variant === 'bosvampire'
                || this.variant === 'bosangel');
            this.model.position.y = this._baseY + Math.sin(t * 1.2) * (floats ? 0.08 : 0.02) * this.scale;

            if (this.head && this.head.visible) this.head.rotation.y = Math.sin(t * 1.1) * 0.12;
            this._floaters.forEach((f, i) => {
                if (!f.visible) return;
                if (f._side !== undefined) f.rotation.z = Math.sin(t * (fast ? 6 : 2.5) + i) * 0.4;
                else f.rotation.y = t * (0.4 + i * 0.15);
            });
            if (this.coreGlow && this.coreGlow.material) this.coreGlow.material.emissiveIntensity = (fast ? 1.4 : 0.6) + Math.sin(t * 5) * 0.4;
            if (this._prismMeshes) this._prismMeshes.forEach((m, i) => { if (m.material) m.material.emissive.setHSL((t * 0.3 + i * 0.16) % 1, 0.9, 0.5); });
            if (this.staffOrb && this.staffOrb.material) this.staffOrb.material.emissiveIntensity = 0.6 + Math.sin(t * 4) * 0.4;
            if (this.variant === 'colossus') {
                const gait = fast ? 5 : 1.6;
                [this.leftArm, this.rightLeg].forEach(l => { if (l && l.rotation) l.rotation.x = Math.sin(t * gait) * 0.18; });
                [this.rightArm, this.leftLeg].forEach(l => { if (l && l.rotation) l.rotation.x = Math.sin(t * gait + Math.PI) * 0.18; });
            }
            if (this.variant === 'bosdragon') {
                const sway = fast ? 4 : 1.4;
                if (this.wings && this.wings.visible) this.wings.children.forEach((w, i) => { w.rotation.z = (w._side !== undefined ? w._side : (i % 2 ? 1 : -1)) * 0 + w.rotation.z; });
                if (this.wings && this.wings.visible) this.wings.rotation.x = Math.sin(t * (fast ? 6 : 2)) * 0.14;
                if (this.tail && this.tail.visible) this.tail.rotation.y = Math.sin(t * sway) * 0.25;
                [this.leftArm, this.rightLeg].forEach(l => { if (l && l.rotation) l.rotation.x = Math.sin(t * sway) * 0.12; });
                [this.rightArm, this.leftLeg].forEach(l => { if (l && l.rotation) l.rotation.x = Math.sin(t * sway + Math.PI) * 0.12; });
            }
            if (this.variant === 'bosreaper' && this.tail && this.tail.visible) this.tail.rotation.z = Math.sin(t * (fast ? 5 : 1.8)) * 0.2;
            if (this.variant === 'petrodemon') this._animatePetrodemon(t, fast);
        }

        deathPose(deltaTime) {
            const t = this.animTime;
            const prog = Math.min(1.0, t / 1.4);
            for (const mat of this._materials) mat.opacity = Math.min(mat.opacity, 1.0 - prog);
            if (this._baseY === null) this._baseY = this.model.position.y;
            // A heap of crude does not topple, it loses its hold and spreads.
            if (this.variant === 'petrodemon') {
                const flat = 1 - prog * 0.88, sh = this._shapeProportions(), s = this.scale;
                this.model.scale.set(s * sh.x * (1 + prog * 0.7), s * sh.y * flat, s * sh.z * (1 + prog * 0.7));
                this.model.position.y = this._baseY - prog * 0.2 * this.scale;
                return;
            }
            this.model.position.y = this._baseY - prog * 0.6 * this.scale;
            this.model.rotation.z = prog * (this.variant === 'colossus' ? 1.3 : 0.7);
        }
    }

    const make = (scale, offsetY, enemy, weaponType, key) =>
        new BossBattler3D(scale, offsetY, enemy, weaponType, key);

    const reg = window.Battler3D.registerArchetype;
    const S = B_PROFILES;
    reg('eldritch', { aliases: ['eldritch', 'aberrant', 'outsider'], scale: S.eldritch.scale, weapon: 0, create: make });
    // 34 bespoke cosmic horrors (narrow aliases; pinned by exact name below).
    ['el_aiwass','el_annunaki','el_blankemergence','el_choronzon','el_mindmanip','el_yogsothoth','el_azathoth','el_chronovore',
     'el_elderthing','el_glitch','el_mindoverlord','el_mindtyrant','el_network','el_nightmare','el_nyarlathotep','el_quantumarchon',
     'el_voidempress','el_yellowking','el_singularity','el_chronoconsumer','el_coloroutsound','el_childhoodsend','el_yogsothothep',
     'el_seraph','el_vorthak','el_yithoghra','el_mordun','el_qelthuzad','el_nythaggoth','el_shalthyss','el_gulmagoth','el_xothnagal',
     'el_velkorthak','el_zhothaggur'].forEach(k => reg(k, { aliases: [k], scale: S[k].scale, weapon: 0, create: make }));
    // 28 bespoke titans/behemoths (narrow aliases; pinned by exact name below).
    ['col_bloodleech','col_bogbehemoth','col_crumbling','col_flower','col_frost','col_maelstrom','col_magmatitan','col_scorched',
     'col_storm','col_gorilla','col_chronos','col_crag','col_crimson','col_glacial','col_magmaoverlord','col_mountaintitan',
     'col_quakemaw','col_radiant','col_totemic','col_war','col_mountainking','col_ossuary','col_stratos','col_earthen',
     'col_mammoth','col_thunderlizard','col_primordial','col_porphyrin'].forEach(k => reg(k, { aliases: [k], scale: S[k].scale, weapon: 0, create: make }));
    ['u_eternallichking','u_forestsovereign','u_tidalwarden','u_crudeleviathan'].forEach(k => reg(k, { aliases: [k], scale: S[k].scale, weapon: 0, create: make }));
    reg('colossus', { aliases: ['colossus', 'titan', 'behemoth', 'giant', 'behemutt'], scale: S.colossus.scale, weapon: 0, create: make });
    reg('witch',    { aliases: ['witch', 'sorceress', 'enchantress', 'hag'], scale: S.witch.scale, weapon: 0, create: make });
    reg('reaper',   { aliases: ['reaper', 'wraithlord', 'deathknight'], scale: S.reaper.scale, weapon: 0, create: make });
    reg('petrodemon', { aliases: ['petrodemon', 'oildemon', 'crudefiend'], scale: S.petrodemon.scale, weapon: 0, create: make });
    reg('eris',     { aliases: ['eris', 'discordgoddess'], scale: S.eris.scale, weapon: 0, create: make });
    reg('corpseofmaat', { aliases: ['corpseofmaat', 'deadmaat'], scale: S.corpseofmaat.scale, weapon: 0, create: make });
    // 34 bespoke bosses (dragon/reaper/vampire/witch/angel) split out of the
    // shared/reused rigs. Narrow aliases; pinned by exact name in NAMED below.
    ['bos_bullwyvern','bos_dragonoftheunderworldkur','bos_stormdragonkingenlil','bos_supremedragongodusumgallu',
     'bos_thesurgeon','bos_emperordeathstalker','bos_infernalmonarch','bos_thecremator','bos_thepuppeteer','bos_thescarletjudge',
     'bos_thetaxidermist','bos_venomlord','bos_gravemonarch','bos_orphanagewarden','bos_asphaltrevenant',
     'bos_crimsonpatriarch','bos_vampirelord',
     'bos_hecatetheplaguemistress','bos_liliththecorruptor','bos_morganathebloodweaver','bos_ravennatheshadowbinder',
     'bos_selenethevoidwitch','bos_summercourtarchon','bos_swampleechqueen','bos_thebloodcountess','bos_thefrozenlady',
     'bos_wintersherald','bos_babalonpriestess','bos_esmeraldathedreamweaver','bos_faequeen','bos_frostmonarch','bos_thedreamweaver',
     'bos_celestialavatar','bos_celestialavatarep'].forEach(k => reg(k, { aliases: [k], scale: S[k].scale, weapon: 0, create: make }));

    //=========================================================================
    // Name-based unique assignment for specific named enemies / bosses.
    // (Maps an exact enemy name to a model key; existing keys are reused too.)
    //=========================================================================
    const NAMED = {
        // Cosmic horrors - each now pinned to its own bespoke model.
        el_aiwass: ["Aiwass Messenger"],
        el_annunaki: ["Annunaki Overlord"],
        el_blankemergence: ["Blank Emergence"],
        el_choronzon: ["Choronzon"],
        el_mindmanip: ["Mind Manipulator"],
        el_yogsothoth: ["Yog-Sothoth Spawn"],
        el_azathoth: ["Azathoth Fragment"],
        el_chronovore: ["Chronovore"],
        el_elderthing: ["Elder Thing"],
        el_glitch: ["Glitch Entity"],
        el_mindoverlord: ["Mind Overlord"],
        el_mindtyrant: ["Mind Tyrant"],
        el_network: ["Network Overlord"],
        el_nightmare: ["Nightmare Sovereign"],
        el_nyarlathotep: ["Nyarlathotep Avatar"],
        el_quantumarchon: ["Quantum Archon"],
        el_voidempress: ["Void Empress"],
        el_yellowking: ["Yellow King"],
        el_singularity: ["Singularity Prime"],
        el_chronoconsumer: ["Chrono Consumer"],
        el_coloroutsound: ["Color Out of Sound"],
        el_childhoodsend: ["Childhood's End"],
        el_yogsothothep: ["Yog-Sothoth Spawn :EP"],
        el_seraph: ["Seraph of the Seventh Veil"],
        el_vorthak: ["Vorthak the Membrane-Ripper"],
        el_yithoghra: ["Yith'oghra the Consensus-Breaker"],
        el_mordun: ["Mor'dun the Flesh-Architect"],
        el_qelthuzad: ["Qel'thuzad the Memory-Eater"],
        el_nythaggoth: ["Nyth'aggoth the Concept-Corruptor"],
        el_shalthyss: ["Shal'thyss the Void-Surgeon"],
        el_gulmagoth: ["Gul'magoth the Time-Weaver"],
        el_xothnagal: ["Xoth'nagal the Dream-Plague"],
        el_velkorthak: ["Vel'korthak the Reality-Breeder"],
        el_zhothaggur: ["Zhoth'aggur the Silence-Weaver"],
        // Titans / behemoths - each now pinned to its own bespoke model.
        col_bloodleech: ["Blood Leech Colossus"],
        col_bogbehemoth: ["Bog Behemoth"],
        col_crumbling: ["Crumbling Colossus"],
        col_flower: ["Flower Behemoth"],
        col_frost: ["Frost Colossus"],
        col_maelstrom: ["Maelstrom Sovereign"],
        col_magmatitan: ["Magma Titan"],
        col_scorched: ["Scorched Tyrant"],
        col_storm: ["Storm Behemoth"],
        col_gorilla: ["Behemoth Gorilla"],
        col_chronos: ["Chronos, Time Titan"],
        col_crag: ["Crag Behemoth"],
        col_crimson: ["Crimson Tyrant"],
        col_glacial: ["Glacial Titan"],
        col_magmaoverlord: ["Magma Overlord"],
        col_mountaintitan: ["Mountain Titan"],
        col_quakemaw: ["Quake-Maw Titan"],
        col_radiant: ["Radiant Colossus"],
        col_totemic: ["Totemic Titan"],
        col_war: ["War Colossus"],
        col_mountainking: ["Mountain King"],
        col_ossuary: ["Ossuary Colossus"],
        col_stratos: ["Stratos Sovereign"],
        col_earthen: ["Earthen Colossus"],
        col_mammoth: ["Colossal Mammoth King"],
        col_thunderlizard: ["Thunder Lizard Colossus"],
        col_primordial: ["Primordial Behemoth"],
        col_porphyrin: ["Porphyrin Colossus"],
        // Bespoke witches / queens / enchantresses (each pinned to its own model).
        bos_hecatetheplaguemistress: ["Hecate the Plague Mistress"],
        bos_liliththecorruptor: ["Lilith the Corruptor"],
        bos_morganathebloodweaver: ["Morgana the Bloodweaver"],
        bos_ravennatheshadowbinder: ["Ravenna the Shadowbinder"],
        bos_selenethevoidwitch: ["Selene the Void Witch"],
        bos_summercourtarchon: ["Summer Court Archon"],
        bos_swampleechqueen: ["Swamp Leech Queen"],
        bos_thebloodcountess: ["The Blood Countess"],
        bos_thefrozenlady: ["The Frozen Lady"],
        bos_wintersherald: ["Winter's Herald"],
        bos_babalonpriestess: ["Babalon Priestess"],
        bos_esmeraldathedreamweaver: ["Esmeralda the Dream Weaver"],
        bos_faequeen: ["Fae Queen"],
        bos_frostmonarch: ["Frost Monarch"],
        bos_thedreamweaver: ["The Dreamweaver"],
        // Bespoke grim "operator" uniques + death lords.
        bos_thesurgeon: ["The Surgeon"],
        bos_emperordeathstalker: ["Emperor Deathstalker"],
        bos_infernalmonarch: ["Infernal Monarch"],
        bos_thecremator: ["The Cremator"],
        bos_thepuppeteer: ["The Puppeteer"],
        bos_thescarletjudge: ["The Scarlet Judge"],
        bos_thetaxidermist: ["The Taxidermist"],
        bos_venomlord: ["Venom Lord"],
        bos_gravemonarch: ["Grave Monarch"],
        bos_orphanagewarden: ["Orphanage Warden"],
        bos_asphaltrevenant: ["Asphalt Revenant"],
        // Bespoke dragons.
        bos_bullwyvern: ["Bull Wyvern"],
        bos_dragonoftheunderworldkur: ["Dragon of the Underworld Kur"],
        bos_stormdragonkingenlil: ["Storm Dragon King Enlil"],
        bos_supremedragongodusumgallu: ["Supreme Dragon God Usumgallu"],
        // Bespoke vampire nobles.
        bos_crimsonpatriarch: ["Crimson Patriarch"],
        bos_vampirelord: ["Vampire Lord"],
        // Bespoke angels.
        bos_celestialavatar: ["Celestial Avatar"],
        bos_celestialavatarep: ["Celestial Avatar :EP"],
        // Reuse existing dedicated models for fitting names.
        lich: ["Ancient Lich", "Eternal Lich-King"],
        krakenlord: ["Deep One Monarch", "Tidal Warden"],
        worldtree: ["Forest Sovereign", "Dryad Protector"],
        gorgon: ["Gorgon Queen"],
        slime: ["King Slime"],
        // Flavorful oddball uniques.
        ghost: ["Karaoke Banshee", "Meme Ghost", "Weeping Mask", "The Phantom"],
        mushroom: ["Spore Wanderer"],
        octopus: ["Bubble Squid", "Bubble Squid Second"]
    };
    if (window.Battler3D.registerNamed) {
        for (const key in NAMED) {
            NAMED[key].forEach(name => window.Battler3D.registerNamed(name, key));
        }
    }

    debugLog('Boss models + named assignments registered');

    ;[['u_avatarofthesevensisters',4.8],['u_thewellthatdreams',4.8]].forEach(([k,sc]) => reg(k, { aliases: [k], scale: sc, weapon: 0, create: make }));

    ;[['u_soulreaper',3.4]].forEach(([k,sc]) => reg(k, { aliases: [k], scale: sc, weapon: 0, create: make }));
})();
