/*:
 * @target MZ
 * @plugindesc [v1.0] Raman Spectroscopy Scanner ,  analyzes statues, paintings, and library objects in front of the player.
 * @author Esoteric Heavy Industries
 *
 * @help
 * Raman Spectroscopy Scanner
 * ==========================
 * Call the ScanFront plugin command to scan the object the player is facing.
 * The scanner identifies material composition of statues, paintings, and
 * library/bookcase objects and renders an authentic Raman spectrum graph.
 *
 * Detected object types (matched against event name):
 *   Statues  : statue, sculpt, figure, bust, idol, carv
 *   Paintings: paint, picture, portrait, canvas, artwork, fresco
 *   Libraries: book, shelf, librar, tome, scroll
 *   Masks    : mask
 *
 * Manual material override (event note tag):
 *   <RamanMaterial:marble>
 *
 * Supported material keys:
 *   marble, granite, bronze, limestone
 *   lapis, vermillion, malachite, lead_white
 *   wood, paper
 *
 * Close the display with OK, Cancel, or click.
 *
 * Carrying the Raman probe (or a probe head fitted to the hyperdeck) turns any
 * readable object - a statue, a fossil, a painting, a bookcase - into a
 * Look / Analyze / Cancel choice: Look is whatever the object always did,
 * Analyze runs the spectrum on it.
 *
 * @command ScanFront
 * @text Scan Object in Front
 * @desc Performs Raman spectroscopy scan on the object the player is facing.
 */

(() => {
    'use strict';
    const pluginName = 'RamanSpectroscopy';

    // =========================================================
    // MATERIAL DATABASE
    // Peaks: { pos: Raman shift cm⁻¹, height: 0-1, fwhm: cm⁻¹ }
    // =========================================================
    const MATERIAL_DB = {
        marble: {
            get name() { return T('Raman.material.marble.name'); },
            get subname() { return T('Raman.material.marble.subname'); },
            color: 0x88CCFF,
            confidence: 97.4,
            peaks: [
                { pos: 156,  height: 0.28, fwhm: 16 },
                { pos: 280,  height: 0.42, fwhm: 18 },
                { pos: 712,  height: 0.52, fwhm: 22 },
                { pos: 1085, height: 1.00, fwhm: 14 },
                { pos: 1434, height: 0.10, fwhm: 28 },
            ],
        },
        granite: {
            get name() { return T('Raman.material.granite.name'); },
            get subname() { return T('Raman.material.granite.subname'); },
            color: 0xFFBB88,
            confidence: 95.1,
            peaks: [
                { pos: 128,  height: 0.28, fwhm: 20 },
                { pos: 206,  height: 0.52, fwhm: 16 },
                { pos: 265,  height: 0.38, fwhm: 16 },
                { pos: 356,  height: 0.32, fwhm: 20 },
                { pos: 464,  height: 1.00, fwhm: 12 },
                { pos: 808,  height: 0.42, fwhm: 16 },
                { pos: 1082, height: 0.22, fwhm: 24 },
            ],
        },
        bronze: {
            get name() { return T('Raman.material.bronze.name'); },
            get subname() { return T('Raman.material.bronze.subname'); },
            color: 0xCC9944,
            confidence: 91.8,
            peaks: [
                { pos: 218,  height: 0.55, fwhm: 50 },
                { pos: 296,  height: 1.00, fwhm: 40 },
                { pos: 413,  height: 0.38, fwhm: 60 },
                { pos: 624,  height: 0.30, fwhm: 70 },
                { pos: 1048, height: 0.18, fwhm: 80 },
            ],
        },
        limestone: {
            get name() { return T('Raman.material.limestone.name'); },
            get subname() { return T('Raman.material.limestone.subname'); },
            color: 0xDDCCAA,
            confidence: 98.2,
            peaks: [
                { pos: 155,  height: 0.22, fwhm: 24 },
                { pos: 280,  height: 0.30, fwhm: 28 },
                { pos: 725,  height: 0.38, fwhm: 28 },
                { pos: 1088, height: 1.00, fwhm: 18 },
                { pos: 1405, height: 0.12, fwhm: 34 },
            ],
        },
        lapis: {
            get name() { return T('Raman.material.lapis.name'); },
            get subname() { return T('Raman.material.lapis.subname'); },
            color: 0x4488FF,
            confidence: 93.6,
            peaks: [
                { pos: 258,  height: 0.28, fwhm: 30 },
                { pos: 548,  height: 0.72, fwhm: 24 },
                { pos: 820,  height: 1.00, fwhm: 20 },
                { pos: 1096, height: 0.42, fwhm: 24 },
                { pos: 1442, height: 0.48, fwhm: 40 },
                { pos: 1657, height: 0.38, fwhm: 36 },
            ],
        },
        vermillion: {
            get name() { return T('Raman.material.vermillion.name'); },
            get subname() { return T('Raman.material.vermillion.subname'); },
            color: 0xFF4422,
            confidence: 99.1,
            peaks: [
                { pos: 252,  height: 1.00, fwhm: 16 },
                { pos: 343,  height: 0.58, fwhm: 20 },
                { pos: 1442, height: 0.45, fwhm: 40 },
                { pos: 1657, height: 0.32, fwhm: 36 },
                { pos: 2850, height: 0.28, fwhm: 60 },
                { pos: 2920, height: 0.52, fwhm: 50 },
            ],
        },
        malachite: {
            get name() { return T('Raman.material.malachite.name'); },
            get subname() { return T('Raman.material.malachite.subname'); },
            color: 0x44CC66,
            confidence: 96.7,
            peaks: [
                { pos: 179,  height: 0.42, fwhm: 24 },
                { pos: 271,  height: 0.68, fwhm: 20 },
                { pos: 330,  height: 0.52, fwhm: 20 },
                { pos: 433,  height: 1.00, fwhm: 16 },
                { pos: 727,  height: 0.32, fwhm: 30 },
                { pos: 1096, height: 0.28, fwhm: 28 },
            ],
        },
        lead_white: {
            get name() { return T('Raman.material.lead_white.name'); },
            get subname() { return T('Raman.material.lead_white.subname'); },
            color: 0xEEDDAA,
            confidence: 94.3,
            peaks: [
                { pos: 401,  height: 0.28, fwhm: 30 },
                { pos: 918,  height: 0.48, fwhm: 24 },
                { pos: 1055, height: 1.00, fwhm: 20 },
                { pos: 1370, height: 0.38, fwhm: 28 },
                { pos: 2988, height: 0.55, fwhm: 40 },
            ],
        },
        wood: {
            get name() { return T('Raman.material.wood.name'); },
            get subname() { return T('Raman.material.wood.subname'); },
            color: 0xAA7744,
            confidence: 88.9,
            peaks: [
                { pos: 380,  height: 0.28, fwhm: 50 },
                { pos: 900,  height: 0.52, fwhm: 40 },
                { pos: 1095, height: 1.00, fwhm: 30 },
                { pos: 1268, height: 0.48, fwhm: 36 },
                { pos: 1378, height: 0.42, fwhm: 30 },
                { pos: 1598, height: 0.62, fwhm: 24 },
                { pos: 2900, height: 0.70, fwhm: 60 },
            ],
        },
        paper: {
            get name() { return T('Raman.material.paper.name'); },
            get subname() { return T('Raman.material.paper.subname'); },
            color: 0xFFEEBB,
            confidence: 92.0,
            peaks: [
                { pos: 380,  height: 0.18, fwhm: 40 },
                { pos: 900,  height: 0.38, fwhm: 36 },
                { pos: 1095, height: 1.00, fwhm: 24 },
                { pos: 1378, height: 0.32, fwhm: 30 },
                { pos: 2900, height: 0.58, fwhm: 50 },
            ],
        },
        onyx: {
            get name() { return T('Raman.material.onyx.name'); },
            get subname() { return T('Raman.material.onyx.subname'); },
            color: 0x9988CC,
            confidence: 96.3,
            peaks: [
                { pos: 207,  height: 0.38, fwhm: 18 },
                { pos: 464,  height: 1.00, fwhm: 10 },
                { pos: 697,  height: 0.20, fwhm: 28 },
                { pos: 808,  height: 0.35, fwhm: 16 },
                { pos: 1085, height: 0.30, fwhm: 30 },
                { pos: 1600, height: 0.25, fwhm: 60 },  // D band ,  carbon inclusions
                { pos: 2900, height: 0.22, fwhm: 80 },  // G band ,  carbon inclusions
            ],
        },
        // ---- Stone / Mineral ----
        obsidian: {
            get name() { return T('Raman.material.obsidian.name'); },
            get subname() { return T('Raman.material.obsidian.subname'); },
            color: 0x553355,
            confidence: 89.7,
            peaks: [
                { pos: 464,  height: 1.00, fwhm: 90 },  // broad amorphous Si-O-Si
                { pos: 800,  height: 0.45, fwhm: 130 },
                { pos: 1050, height: 0.28, fwhm: 160 },
            ],
        },
        jade: {
            get name() { return T('Raman.material.jade.name'); },
            get subname() { return T('Raman.material.jade.subname'); },
            color: 0x33AA77,
            confidence: 94.1,
            peaks: [
                { pos: 228,  height: 0.35, fwhm: 22 },
                { pos: 374,  height: 1.00, fwhm: 16 },
                { pos: 521,  height: 0.55, fwhm: 20 },
                { pos: 700,  height: 0.22, fwhm: 30 },
                { pos: 1004, height: 0.75, fwhm: 18 },
            ],
        },
        quartz: {
            get name() { return T('Raman.material.quartz.name'); },
            get subname() { return T('Raman.material.quartz.subname'); },
            color: 0xCCEEFF,
            confidence: 99.8,
            peaks: [
                { pos: 128,  height: 0.32, fwhm: 10 },
                { pos: 206,  height: 0.58, fwhm: 8 },
                { pos: 265,  height: 0.42, fwhm: 8 },
                { pos: 356,  height: 0.28, fwhm: 10 },
                { pos: 464,  height: 1.00, fwhm: 6 },  // very sharp main peak
                { pos: 808,  height: 0.38, fwhm: 10 },
            ],
        },
        sandstone: {
            get name() { return T('Raman.material.sandstone.name'); },
            get subname() { return T('Raman.material.sandstone.subname'); },
            color: 0xDDAA66,
            confidence: 91.2,
            peaks: [
                { pos: 265,  height: 0.25, fwhm: 22 },
                { pos: 356,  height: 0.30, fwhm: 24 },
                { pos: 464,  height: 1.00, fwhm: 18 },
                { pos: 808,  height: 0.28, fwhm: 22 },
                { pos: 1082, height: 0.35, fwhm: 30 },
            ],
        },
        basalt: {
            get name() { return T('Raman.material.basalt.name'); },
            get subname() { return T('Raman.material.basalt.subname'); },
            color: 0x446677,
            confidence: 87.5,
            peaks: [
                { pos: 325,  height: 0.45, fwhm: 35 },
                { pos: 392,  height: 0.60, fwhm: 30 },
                { pos: 668,  height: 1.00, fwhm: 40 },
                { pos: 824,  height: 0.38, fwhm: 35 },
                { pos: 1012, height: 0.55, fwhm: 40 },
            ],
        },
        alabaster: {
            get name() { return T('Raman.material.alabaster.name'); },
            get subname() { return T('Raman.material.alabaster.subname'); },
            color: 0xFFEEDD,
            confidence: 98.6,
            peaks: [
                { pos: 184,  height: 0.38, fwhm: 16 },
                { pos: 415,  height: 0.42, fwhm: 18 },
                { pos: 619,  height: 0.35, fwhm: 18 },
                { pos: 1008, height: 1.00, fwhm: 12 },  // SO4 symmetric stretch
                { pos: 1137, height: 0.28, fwhm: 20 },
            ],
        },
        clay: {
            get name() { return T('Raman.material.clay.name'); },
            get subname() { return T('Raman.material.clay.subname'); },
            color: 0xCC6633,
            confidence: 93.4,
            peaks: [
                { pos: 132,  height: 0.30, fwhm: 20 },
                { pos: 270,  height: 0.50, fwhm: 18 },
                { pos: 338,  height: 0.45, fwhm: 16 },
                { pos: 432,  height: 0.65, fwhm: 16 },
                { pos: 753,  height: 0.50, fwhm: 22 },
                { pos: 1107, height: 1.00, fwhm: 20 },
            ],
        },
        // ---- Metals ----
        gold: {
            get name() { return T('Raman.material.gold.name'); },
            get subname() { return T('Raman.material.gold.subname'); },
            color: 0xFFCC00,
            confidence: 82.3,
            peaks: [
                { pos: 294,  height: 0.30, fwhm: 65 },
                { pos: 640,  height: 0.20, fwhm: 90 },  // near-featureless ,  noble metal
            ],
        },
        silver: {
            get name() { return T('Raman.material.silver.name'); },
            get subname() { return T('Raman.material.silver.subname'); },
            color: 0xCCCCCC,
            confidence: 85.1,
            peaks: [
                { pos: 203,  height: 0.80, fwhm: 30 },  // Ag2S
                { pos: 238,  height: 1.00, fwhm: 24 },  // AgCl
                { pos: 344,  height: 0.45, fwhm: 28 },
            ],
        },
        copper: {
            get name() { return T('Raman.material.copper.name'); },
            get subname() { return T('Raman.material.copper.subname'); },
            color: 0xCC7733,
            confidence: 90.5,
            peaks: [
                { pos: 218,  height: 0.65, fwhm: 40 },  // Cu2O
                { pos: 298,  height: 1.00, fwhm: 35 },
                { pos: 345,  height: 0.55, fwhm: 40 },  // CuO
                { pos: 528,  height: 0.40, fwhm: 50 },
                { pos: 632,  height: 0.48, fwhm: 50 },
            ],
        },
        iron: {
            get name() { return T('Raman.material.iron.name'); },
            get subname() { return T('Raman.material.iron.subname'); },
            color: 0x884422,
            confidence: 90.2,
            peaks: [
                { pos: 225,  height: 0.60, fwhm: 25 },
                { pos: 247,  height: 0.45, fwhm: 22 },
                { pos: 293,  height: 1.00, fwhm: 20 },  // main hematite peak
                { pos: 412,  height: 0.70, fwhm: 22 },
                { pos: 498,  height: 0.35, fwhm: 28 },
                { pos: 613,  height: 0.45, fwhm: 28 },
            ],
        },
        steel: {
            get name() { return T('Raman.material.steel.name'); },
            get subname() { return T('Raman.material.steel.subname'); },
            color: 0x778899,
            confidence: 88.7,
            peaks: [
                { pos: 225,  height: 0.40, fwhm: 30 },
                { pos: 293,  height: 0.75, fwhm: 26 },  // hematite layer
                { pos: 412,  height: 1.00, fwhm: 28 },
                { pos: 668,  height: 0.35, fwhm: 35 },  // magnetite Fe3O4
                { pos: 1350, height: 0.30, fwhm: 80 },  // carbon D band
            ],
        },
        // ---- Organic / Other ----
        ivory: {
            get name() { return T('Raman.material.ivory.name'); },
            get subname() { return T('Raman.material.ivory.subname'); },
            color: 0xFFFAE8,
            confidence: 96.8,
            peaks: [
                { pos: 430,  height: 0.35, fwhm: 24 },
                { pos: 590,  height: 0.30, fwhm: 28 },
                { pos: 960,  height: 1.00, fwhm: 18 },  // PO4 v1 symmetric stretch
                { pos: 1045, height: 0.45, fwhm: 22 },
                { pos: 1070, height: 0.38, fwhm: 22 },
                { pos: 1640, height: 0.22, fwhm: 50 },  // amide I
                { pos: 2940, height: 0.40, fwhm: 60 },  // C-H stretch
            ],
        },
        ebony: {
            get name() { return T('Raman.material.ebony.name'); },
            get subname() { return T('Raman.material.ebony.subname'); },
            color: 0x221100,
            confidence: 88.2,
            peaks: [
                { pos: 380,  height: 0.22, fwhm: 50 },
                { pos: 900,  height: 0.40, fwhm: 40 },
                { pos: 1095, height: 0.85, fwhm: 30 },
                { pos: 1268, height: 0.55, fwhm: 36 },
                { pos: 1378, height: 0.48, fwhm: 30 },
                { pos: 1598, height: 1.00, fwhm: 22 },  // lignin aromatic ,  dominant in ebony
                { pos: 2900, height: 0.60, fwhm: 60 },
            ],
        },
        bamboo: {
            get name() { return T('Raman.material.bamboo.name'); },
            get subname() { return T('Raman.material.bamboo.subname'); },
            color: 0xAABB55,
            confidence: 91.5,
            peaks: [
                { pos: 380,  height: 0.20, fwhm: 40 },
                { pos: 464,  height: 0.30, fwhm: 30 },  // SiO2 phytoliths
                { pos: 900,  height: 0.45, fwhm: 36 },
                { pos: 1095, height: 1.00, fwhm: 24 },
                { pos: 1378, height: 0.38, fwhm: 28 },
                { pos: 1598, height: 0.50, fwhm: 22 },
                { pos: 2900, height: 0.65, fwhm: 55 },
            ],
        },
        // ---- Painting pigments ----
        ultramarine: {
            get name() { return T('Raman.material.ultramarine.name'); },
            get subname() { return T('Raman.material.ultramarine.subname'); },
            color: 0x2244DD,
            confidence: 94.8,
            peaks: [
                { pos: 258,  height: 0.22, fwhm: 28 },
                { pos: 548,  height: 0.65, fwhm: 22 },
                { pos: 820,  height: 1.00, fwhm: 18 },
                { pos: 975,  height: 0.30, fwhm: 26 },
                { pos: 1096, height: 0.38, fwhm: 22 },
            ],
        },
        prussian_blue: {
            get name() { return T('Raman.material.prussian_blue.name'); },
            get subname() { return T('Raman.material.prussian_blue.subname'); },
            color: 0x003366,
            confidence: 99.4,
            peaks: [
                { pos: 284,  height: 0.50, fwhm: 20 },
                { pos: 537,  height: 0.35, fwhm: 25 },
                { pos: 2094, height: 1.00, fwhm: 10 },  // CN stretch ,  highly diagnostic
            ],
        },
        cobalt_blue: {
            get name() { return T('Raman.material.cobalt_blue.name'); },
            get subname() { return T('Raman.material.cobalt_blue.subname'); },
            color: 0x0055AA,
            confidence: 97.2,
            peaks: [
                { pos: 197,  height: 0.35, fwhm: 20 },
                { pos: 503,  height: 0.85, fwhm: 16 },
                { pos: 522,  height: 1.00, fwhm: 14 },
                { pos: 618,  height: 0.45, fwhm: 22 },
            ],
        },
        burnt_sienna: {
            get name() { return T('Raman.material.burnt_sienna.name'); },
            get subname() { return T('Raman.material.burnt_sienna.subname'); },
            color: 0xBB5522,
            confidence: 88.4,
            peaks: [
                { pos: 225,  height: 0.55, fwhm: 30 },
                { pos: 292,  height: 1.00, fwhm: 25 },
                { pos: 412,  height: 0.65, fwhm: 28 },
                { pos: 497,  height: 0.30, fwhm: 32 },
                { pos: 613,  height: 0.40, fwhm: 32 },
            ],
        },
        azurite: {
            get name() { return T('Raman.material.azurite.name'); },
            get subname() { return T('Raman.material.azurite.subname'); },
            color: 0x3366CC,
            confidence: 97.6,
            peaks: [
                { pos: 250,  height: 0.45, fwhm: 24 },
                { pos: 282,  height: 0.60, fwhm: 20 },
                { pos: 397,  height: 0.55, fwhm: 22 },
                { pos: 435,  height: 0.75, fwhm: 20 },
                { pos: 756,  height: 1.00, fwhm: 16 },
                { pos: 1096, height: 0.50, fwhm: 24 },
                { pos: 1456, height: 0.32, fwhm: 30 },
            ],
        },
        viridian: {
            get name() { return T('Raman.material.viridian.name'); },
            get subname() { return T('Raman.material.viridian.subname'); },
            color: 0x228855,
            confidence: 96.1,
            peaks: [
                { pos: 351,  height: 0.55, fwhm: 20 },
                { pos: 549,  height: 1.00, fwhm: 18 },  // Cr-O main band
                { pos: 610,  height: 0.45, fwhm: 22 },
                { pos: 1442, height: 0.30, fwhm: 40 },  // oil binder C-H
            ],
        },
        charcoal: {
            get name() { return T('Raman.material.charcoal.name'); },
            get subname() { return T('Raman.material.charcoal.subname'); },
            color: 0x444444,
            confidence: 95.0,
            peaks: [
                { pos: 1350, height: 1.00, fwhm: 60 },  // D band (disorder)
                { pos: 1590, height: 0.90, fwhm: 50 },  // G band (graphite)
                { pos: 2700, height: 0.45, fwhm: 120 }, // 2D band
            ],
        },
        // ---- Fossil specimens ----
        amber: {
            get name() { return T('Raman.material.amber.name'); },
            get subname() { return T('Raman.material.amber.subname'); },
            color: 0xFFAA22,
            confidence: 97.8,
            peaks: [
                { pos: 1168, height: 0.40, fwhm: 30 },  // C-O-C stretch
                { pos: 1380, height: 0.45, fwhm: 28 },  // C-H deformation
                { pos: 1453, height: 0.55, fwhm: 26 },  // CH2 scissor
                { pos: 1639, height: 0.70, fwhm: 22 },  // C=C exocyclic stretch
                { pos: 1726, height: 0.55, fwhm: 20 },  // C=O ester carbonyl ,  succinite marker
                { pos: 2868, height: 0.65, fwhm: 35 },  // C-H sym stretch
                { pos: 2930, height: 1.00, fwhm: 30 },  // C-H asym stretch (main band)
            ],
        },
        fossil_bone: {
            get name() { return T('Raman.material.fossil_bone.name'); },
            get subname() { return T('Raman.material.fossil_bone.subname'); },
            color: 0xBBAA88,
            confidence: 93.1,
            peaks: [
                { pos: 430,  height: 0.30, fwhm: 28 },  // PO4 v2
                { pos: 590,  height: 0.25, fwhm: 32 },  // PO4 v4
                { pos: 960,  height: 1.00, fwhm: 22 },  // PO4 v1 (broader than fresh bone)
                { pos: 1040, height: 0.40, fwhm: 28 },  // PO4 v3
                { pos: 1085, height: 0.35, fwhm: 26 },  // calcite infiltration
                { pos: 1640, height: 0.08, fwhm: 60 },  // amide I ,  heavily reduced in fossil
            ],
        },
        fossil_silicified: {
            get name() { return T('Raman.material.fossil_silicified.name'); },
            get subname() { return T('Raman.material.fossil_silicified.subname'); },
            color: 0xAABBCC,
            confidence: 91.4,
            peaks: [
                { pos: 207,  height: 0.32, fwhm: 20 },
                { pos: 464,  height: 1.00, fwhm: 14 },  // quartz main band
                { pos: 697,  height: 0.18, fwhm: 32 },
                { pos: 808,  height: 0.30, fwhm: 20 },
                { pos: 1085, height: 0.12, fwhm: 40 },  // trace carbonate
            ],
        },
        fossil_pyrite: {
            get name() { return T('Raman.material.fossil_pyrite.name'); },
            get subname() { return T('Raman.material.fossil_pyrite.subname'); },
            color: 0xCCBB44,
            confidence: 98.5,
            peaks: [
                { pos: 343,  height: 1.00, fwhm: 12 },  // S-S stretch (Ag mode)
                { pos: 379,  height: 0.65, fwhm: 10 },  // Eg libration mode
                { pos: 430,  height: 0.45, fwhm: 14 },  // Tg mode
            ],
        },
        fossil_calcite: {
            get name() { return T('Raman.material.fossil_calcite.name'); },
            get subname() { return T('Raman.material.fossil_calcite.subname'); },
            color: 0xDDCCBB,
            confidence: 96.0,
            peaks: [
                { pos: 156,  height: 0.22, fwhm: 18 },
                { pos: 282,  height: 0.38, fwhm: 20 },
                { pos: 713,  height: 0.48, fwhm: 24 },
                { pos: 1085, height: 1.00, fwhm: 14 },  // CO3 v1
                { pos: 1435, height: 0.10, fwhm: 30 },
            ],
        },
    };

    const STATUE_MATERIALS   = ['marble', 'granite', 'bronze', 'limestone', 'onyx',
                                 'obsidian', 'jade', 'quartz', 'sandstone', 'basalt',
                                 'alabaster', 'clay', 'gold', 'silver', 'copper', 'iron',
                                 'steel', 'ivory', 'ebony', 'bamboo'];
    const PAINTING_MATERIALS = ['lapis', 'vermillion', 'malachite', 'lead_white',
                                 'ultramarine', 'prussian_blue', 'cobalt_blue',
                                 'burnt_sienna', 'azurite', 'viridian', 'charcoal'];
    const LIBRARY_MATERIALS  = ['wood', 'paper', 'ebony', 'bamboo'];
    const MASK_MATERIALS     = ['wood', 'ivory', 'clay', 'bronze', 'gold', 'jade', 'obsidian', 'limestone'];
    const FOSSIL_MATERIALS   = ['amber', 'fossil_bone', 'fossil_silicified', 'fossil_pyrite', 'fossil_calcite'];
    // Fallback pool for any unrecognised event (surface/environmental scan)
    const SURFACE_MATERIALS  = ['marble', 'granite', 'limestone', 'onyx', 'sandstone', 'clay', 'wood'];

    // One pool per object type, so anything that knows what it is looking at -
    // an event, a procedural terrain feature - can ask for a material without
    // going through the event sniffing below.
    const TYPE_MATERIALS = {
        statue:   STATUE_MATERIALS,
        painting: PAINTING_MATERIALS,
        library:  LIBRARY_MATERIALS,
        mask:     MASK_MATERIALS,
        fossil:   FOSSIL_MATERIALS,
        surface:  SURFACE_MATERIALS,
    };

    // =========================================================
    // UTILITIES
    // =========================================================

    function getEventInFront() {
        const player = $gamePlayer;
        const dir = player.direction();
        const dx = dir === 6 ? 1 : dir === 4 ? -1 : 0;
        const dy = dir === 2 ? 1 : dir === 8 ? -1 : 0;
        const events = $gameMap.eventsXy(player.x + dx, player.y + dy);
        return events[0] || null;
    }

    // A scan is a one-time discovery per savegame. Regular maps are addressed
    // by mapId + local tile; the shared procedural map (636) reuses the same
    // mapId and local layout everywhere, so its objects are addressed by the
    // world square they were generated on instead.
    function scanKeyForTile(x, y) {
        const mapId = $gameMap.mapId();
        const wmt = window.WorldMapTransfer;
        if (wmt && mapId === wmt.procMapId) {
            const wc = wmt.currentWorldCoords();
            return `${mapId}:${wc.x},${wc.y}:${x},${y}`;
        }
        return `${mapId}:${x},${y}`;
    }

    function grantScanKnowledgeAt(x, y) {
        if (!$gameSystem || !$gameSystem.addKnowledge) return;
        const key = scanKeyForTile(x, y);
        if (!$gameSystem._ramanScanLog) $gameSystem._ramanScanLog = {};
        if ($gameSystem._ramanScanLog[key]) return;
        $gameSystem._ramanScanLog[key] = true;
        $gameSystem.addKnowledge(1);
        if (window.ParchmentToast) window.ParchmentToast.reward({ knowledge: 1 });
    }

    function seededRNG(seed) {
        let s = (seed >>> 0) || 1;
        return () => {
            s ^= s << 13; s >>>= 0;
            s ^= s >> 17;
            s ^= s << 5;  s >>>= 0;
            return s / 4294967296;
        };
    }

    // Check if any page of an event calls a given plugin command (MZ code 357)
    function eventCallsCommand(evData, commandName) {
        for (const page of (evData.pages || [])) {
            for (const cmd of (page.list || [])) {
                if (cmd.code === 357 && cmd.parameters[1] === commandName) return true;
            }
        }
        return false;
    }

    // What an event reads as, without picking a material yet. `offersItself`
    // marks the events that run their own Look / Analyze prompt, so the generic
    // one below does not ask a second time over the top of it.
    function objectTypeForEvent(ev) {
        if (!ev) return null;
        const data = ev.event();
        if (!data) return null;
        const name = (data.name || '').toLowerCase();
        const note = (data.note || '');

        // Explicit tag takes priority
        const tagged = note.match(/<RamanMaterial:([^>]+)>/i);
        if (tagged && MATERIAL_DB[tagged[1].toLowerCase()]) {
            return { objectType: 'tagged', materialKey: tagged[1].toLowerCase(), offersItself: false };
        }

        // Command-based detection: check what plugin commands the event calls.
        // These events run the choice themselves (RandomBookGenerator), so they
        // are flagged as such and the generic offer below leaves them alone.
        const byCommand = [
            ['ShowFossilDescription',   'fossil'],
            ['ShowStatueDescription',   'statue'],
            ['ShowPaintingDescription', 'painting'],
            ['ShowRandomBook',          'library'],
            ['ShowMaskDescription',     'mask'],
        ];
        for (const [command, objectType] of byCommand) {
            if (eventCallsCommand(data, command)) {
                return { objectType, offersItself: true };
            }
        }

        // Name/note keyword fallback
        const isFossil   = /fossil|amber|dinosaur|dino|bone|trilobit|ammonit|mammoth|specimen|paleo|cretaceous|jurassic|prehistoric/i.test(name) ||
                           /fossil|amber|dinosaur|bone/i.test(note);
        const isStatue   = /statue|sculpt|figure|bust|idol|carv/i.test(name)   || /statue|sculpt/i.test(note);
        const isPainting = /paint|picture|portrait|canvas|artwork|fresco/i.test(name) || /paint/i.test(note);
        const isLibrary  = /book|shelf|librar|tome|scroll/i.test(name)          || /book|librar/i.test(note);
        const isMask     = /mask/i.test(name) || /mask/i.test(note);

        if (isFossil)   return { objectType: 'fossil', offersItself: false };
        if (isStatue)   return { objectType: 'statue', offersItself: false };
        if (isPainting) return { objectType: 'painting', offersItself: false };
        if (isLibrary)  return { objectType: 'library', offersItself: false };
        if (isMask)     return { objectType: 'mask', offersItself: false };

        return null;
    }

    function materialForType(objectType, x, y) {
        const pool = TYPE_MATERIALS[objectType] || SURFACE_MATERIALS;
        const rng = seededRNG(($gameMap.mapId() * 73856093) ^ (x * 19349663) ^ (y * 83492791));
        return pool[Math.floor(rng() * pool.length)];
    }

    function getMaterialForEvent(ev) {
        if (!ev) return null;
        const read = objectTypeForEvent(ev);
        if (read && read.materialKey) {
            return { materialKey: read.materialKey, objectType: read.objectType };
        }
        const objectType = read ? read.objectType : 'surface';
        return { materialKey: materialForType(objectType, ev.x, ev.y), objectType };
    }

    function gaussian(x, center, height, fwhm) {
        const sigma = fwhm / (2 * Math.sqrt(2 * Math.LN2));
        return height * Math.exp(-0.5 * ((x - center) / sigma) ** 2);
    }

    function generateSpectrum(material, nPts, rng) {
        const MIN = 100, MAX = 3500;
        return Array.from({ length: nPts }, (_, i) => {
            const shift = MIN + (MAX - MIN) * (i / (nPts - 1));
            let y = material.peaks.reduce((acc, p) => acc + gaussian(shift, p.pos, p.height, p.fwhm), 0);
            y += (rng() - 0.5) * 0.035;                            // shot noise
            y += 0.018 * Math.exp(-(((shift - 1800) / 1300) ** 2)); // fluorescence baseline
            return { shift, y: Math.max(0, Math.min(1.15, y)) };
        });
    }

    // =========================================================
    // RAMAN DISPLAY (DOM overlay)
    // States: 'scan' -> 'reveal' -> 'done'
    // The spectrum is painted on a canvas the way the trading terminal paints
    // its price chart, in the gold on black the rest of the game wears. The
    // view can be zoomed (wheel, L2/R2, left/right or A/D) and any point read
    // off by hovering it.
    // =========================================================

    const RAMAN_MIN_SHIFT = 100;
    const RAMAN_MAX_SHIFT = 3500;
    const RAMAN_MIN_SPAN  = 120;

    class RamanDisplay {
        constructor(materialKey, objectType, evName) {
            this.mat        = MATERIAL_DB[materialKey];
            this.objectType = objectType;
            this.evName     = (evName || T('Raman.unknownObject')).toUpperCase();
            this.closed     = false;
            this.state      = 'scan';
            this.frame      = 0;
            this.scanPos    = 0;  // 0..1
            this.revealPos  = 0;  // 0..1

            // Visible window of the x axis, in cm-1
            this.viewMin = RAMAN_MIN_SHIFT;
            this.viewMax = RAMAN_MAX_SHIFT;
            this.hover   = null;  // the sampled point under the pointer

            const rng = seededRNG(materialKey.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
            this.spectrum = generateSpectrum(this.mat, 900, rng);

            // Kept so the scene still has something to add to the stage; the
            // display itself lives in the DOM above the game canvas.
            this.container = new PIXI.Container();
            this._buildDom();
        }

        // ---- Colours ----

        _matColor() {
            return '#' + this.mat.color.toString(16).padStart(6, '0');
        }

        // ---- DOM construction ----

        _buildDom() {
            const root = document.createElement('div');
            root.id = 'raman-overlay';
            root.innerHTML = `
                <style>
                #raman-overlay {
                    position: fixed; left: 0; top: 0; width: 100%; height: 100%;
                    display: flex; align-items: center; justify-content: center;
                    background: rgba(0, 0, 0, 0.88);
                    z-index: 100000;
                    font-family: 'Courier New', Courier, monospace;
                    color: var(--text-text-alt-9, #c8a064);
                    user-select: none;
                }
                #raman-overlay * { box-sizing: border-box; }
                .raman-panel {
                    width: 100%; height: 100%;
                    display: flex; flex-direction: column;
                    background: var(--bg-panel, #0a0a0a);
                    border: 2px solid var(--border-gold-amber, #d4a050);
                    border-radius: 0;
                    box-shadow: inset 0 0 60px rgba(212, 160, 80, 0.12);
                }
                .raman-title {
                    padding: 10px 16px; text-align: center;
                    letter-spacing: 4px; font-size: 18px; font-weight: bold;
                    color: var(--text-primary-hover, #ffcc66);
                    border-bottom: 1px solid var(--border-gold-amber, #d4a050);
                    background: rgba(212, 160, 80, 0.08);
                }
                .raman-target {
                    padding: 8px 16px; font-size: 14px;
                    color: var(--text-text-alt-9, #c8a064);
                    display: flex; justify-content: space-between; gap: 12px;
                }
                .raman-ident { color: var(--text-primary-hover, #ffcc66); font-weight: bold; }
                .raman-plot {
                    position: relative; flex: 1; margin: 0 16px;
                    border: 1px solid var(--border-border-alt-1, #5a4a2a);
                    background: #000000;
                }
                .raman-plot canvas { display: block; width: 100%; height: 100%; }
                .raman-tip {
                    position: absolute; pointer-events: none;
                    padding: 3px 7px; font-size: 11px; line-height: 1.4;
                    background: rgba(0, 0, 0, 0.92);
                    border: 1px solid var(--border-gold-amber, #d4a050);
                    color: var(--text-primary-hover, #ffcc66);
                    white-space: pre; display: none;
                }
                .raman-status {
                    padding: 8px 16px; font-size: 13px;
                    color: var(--text-text-alt-9, #c8a064);
                }
                .raman-hint {
                    padding: 0 16px 10px; font-size: 13px;
                    color: var(--text-disabled, #777777);
                    display: flex; justify-content: space-between; gap: 12px;
                }
                </style>
                <div class="raman-panel">
                    <div class="raman-title">${T('Raman.title')}</div>
                    <div class="raman-target">
                        <span class="raman-target-line"></span>
                        <span class="raman-ident"></span>
                    </div>
                    <div class="raman-plot">
                        <canvas></canvas>
                        <div class="raman-tip"></div>
                    </div>
                    <div class="raman-status"></div>
                    <div class="raman-hint">
                        <span>${T('Raman.hintZoom')}</span>
                        <span class="raman-range"></span>
                    </div>
                </div>
            `;
            document.body.appendChild(root);
            this.root      = root;
            this.canvas    = root.querySelector('canvas');
            this.tip       = root.querySelector('.raman-tip');
            this.statusEl  = root.querySelector('.raman-status');
            this.identEl   = root.querySelector('.raman-ident');
            this.rangeEl   = root.querySelector('.raman-range');
            root.querySelector('.raman-target-line').textContent = T('Raman.targetLine', {
                target: this.evName,
                type: T('Raman.objectType.' + this.objectType).toUpperCase(),
            });

            this._onWheel = (e) => {
                e.preventDefault();
                this.zoomAt(e.deltaY < 0 ? 0.85 : 1 / 0.85, this._pointerShift(e));
            };
            this._onMove = (e) => {
                this._pointer = { x: e.clientX, y: e.clientY };
                this._updateHover();
            };
            this._onLeave = () => { this._pointer = null; this.hover = null; this._paintTip(); };
            this.canvas.addEventListener('wheel', this._onWheel, { passive: false });
            this.canvas.addEventListener('mousemove', this._onMove);
            this.canvas.addEventListener('mouseleave', this._onLeave);
        }

        // ---- View maths ----

        _plotBox() {
            const c = this.canvas;
            return { L: 62, T: 14, R: c.width - 16, B: c.height - 34 };
        }

        _shiftToX(shift) {
            const b = this._plotBox();
            return b.L + (shift - this.viewMin) / (this.viewMax - this.viewMin) * (b.R - b.L);
        }

        _xToShift(px) {
            const b = this._plotBox();
            return this.viewMin + (px - b.L) / (b.R - b.L) * (this.viewMax - this.viewMin);
        }

        _intensityToY(v) {
            const b = this._plotBox();
            return b.B - v * (b.B - b.T);
        }

        _pointerShift(e) {
            const r = this.canvas.getBoundingClientRect();
            const px = (e.clientX - r.left) * (this.canvas.width / r.width);
            return this._xToShift(px);
        }

        // Zoom keeping `anchor` (a Raman shift) under the same screen position.
        zoomAt(factor, anchor) {
            const span = this.viewMax - this.viewMin;
            const full = RAMAN_MAX_SHIFT - RAMAN_MIN_SHIFT;
            const newSpan = Math.max(RAMAN_MIN_SPAN, Math.min(full, span * factor));
            if (!isFinite(anchor)) anchor = (this.viewMin + this.viewMax) / 2;
            anchor = Math.max(this.viewMin, Math.min(this.viewMax, anchor));
            const t = (anchor - this.viewMin) / span;
            let min = anchor - t * newSpan;
            let max = min + newSpan;
            if (min < RAMAN_MIN_SHIFT) { min = RAMAN_MIN_SHIFT; max = min + newSpan; }
            if (max > RAMAN_MAX_SHIFT) { max = RAMAN_MAX_SHIFT; min = max - newSpan; }
            this.viewMin = min;
            this.viewMax = max;
            this._updateHover();
        }

        _updateHover() {
            if (!this._pointer || this.state !== 'done' || !this.canvas) {
                this.hover = null; this._paintTip(); return;
            }
            const r = this.canvas.getBoundingClientRect();
            const px = (this._pointer.x - r.left) * (this.canvas.width / r.width);
            const b = this._plotBox();
            if (px < b.L || px > b.R) { this.hover = null; this._paintTip(); return; }
            const shift = this._xToShift(px);
            let best = null;
            for (const pt of this.spectrum) {
                if (!best || Math.abs(pt.shift - shift) < Math.abs(best.shift - shift)) best = pt;
            }
            this.hover = best;
            this._paintTip();
        }

        _paintTip() {
            if (!this.tip) return;
            if (!this.hover) { this.tip.style.display = 'none'; return; }
            const r = this.canvas.getBoundingClientRect();
            const px = this._shiftToX(this.hover.shift) * (r.width / this.canvas.width);
            const py = this._intensityToY(this.hover.y) * (r.height / this.canvas.height);
            this.tip.textContent = T('Raman.readout', {
                shift: Math.round(this.hover.shift),
                intensity: (this.hover.y * 100).toFixed(1),
            });
            this.tip.style.display = 'block';
            const w = this.tip.offsetWidth;
            this.tip.style.left = Math.max(2, Math.min(r.width - w - 2, px + 10)) + 'px';
            this.tip.style.top  = Math.max(2, py - 30) + 'px';
        }

        // ---- Input from the scene (keyboard / gamepad) ----

        handleInput() {
            let factor = 1;
            if (Input.isPressed('pageup')   || Input.isPressed('right')) factor = 0.94;     // R2 / D
            if (Input.isPressed('pagedown') || Input.isPressed('left'))  factor = 1 / 0.94; // L2 / A
            if (factor !== 1) this.zoomAt(factor, (this.viewMin + this.viewMax) / 2);
        }

        // ---- Painting ----

        _resize() {
            const box = this.canvas.parentElement;
            const w = Math.max(320, box.clientWidth);
            const h = Math.max(200, box.clientHeight);
            if (this.canvas.width !== w || this.canvas.height !== h) {
                this.canvas.width = w;
                this.canvas.height = h;
            }
        }

        _paintFrame(ctx) {
            const b = this._plotBox();
            const grid  = 'rgba(212, 160, 80, 0.16)';
            const label = '#c8a064';

            ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            // Grid and x ticks, on a step that suits the current zoom
            const span = this.viewMax - this.viewMin;
            const step = span > 2000 ? 500 : span > 900 ? 250 : span > 400 ? 100 : span > 200 ? 50 : 20;
            ctx.font = '10px "Courier New", monospace';
            ctx.textAlign = 'center';
            for (let v = Math.ceil(this.viewMin / step) * step; v <= this.viewMax; v += step) {
                const x = this._shiftToX(v);
                ctx.strokeStyle = grid;
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(x, b.T); ctx.lineTo(x, b.B); ctx.stroke();
                ctx.fillStyle = label;
                ctx.fillText(String(v), x, b.B + 14);
            }
            ctx.textAlign = 'right';
            for (let i = 0; i <= 4; i++) {
                const y = b.T + (1 - i / 4) * (b.B - b.T);
                ctx.strokeStyle = grid;
                ctx.beginPath(); ctx.moveTo(b.L, y); ctx.lineTo(b.R, y); ctx.stroke();
                ctx.fillStyle = label;
                ctx.fillText(i * 25 + '%', b.L - 6, y + 3);
            }

            // Axes
            ctx.strokeStyle = '#d4a050';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(b.L, b.T); ctx.lineTo(b.L, b.B); ctx.lineTo(b.R, b.B);
            ctx.stroke();

            // Axis titles
            ctx.fillStyle = label;
            ctx.textAlign = 'center';
            ctx.fillText(T('Raman.axisX'), (b.L + b.R) / 2, b.B + 28);
            ctx.save();
            ctx.translate(14, (b.T + b.B) / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.fillText(T('Raman.axisY'), 0, 0);
            ctx.restore();
        }

        _paintTrace(ctx, upTo, color, width, alpha) {
            const b = this._plotBox();
            ctx.save();
            ctx.beginPath();
            ctx.rect(b.L, b.T, b.R - b.L, b.B - b.T);
            ctx.clip();
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = color;
            ctx.lineWidth = width;
            ctx.lineJoin = 'round';
            ctx.beginPath();
            let started = false;
            for (const pt of this.spectrum) {
                if (pt.shift > upTo) break;
                if (pt.shift < this.viewMin - 20 || pt.shift > this.viewMax + 20) { started = false; continue; }
                const x = this._shiftToX(pt.shift);
                const y = this._intensityToY(pt.y);
                if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
            }
            ctx.stroke();
            ctx.restore();
        }

        _paintPeaks(ctx, upTo) {
            const b = this._plotBox();
            ctx.save();
            ctx.beginPath();
            ctx.rect(b.L, b.T - 14, b.R - b.L, b.B - b.T + 14);
            ctx.clip();
            ctx.font = 'bold 10px "Courier New", monospace';
            ctx.textAlign = 'center';
            for (const pk of this.mat.peaks) {
                if (pk.height < 0.22 || pk.pos > upTo) continue;
                if (pk.pos < this.viewMin || pk.pos > this.viewMax) continue;
                const x = this._shiftToX(pk.pos);
                const y = this._intensityToY(pk.height);
                ctx.strokeStyle = 'rgba(255, 204, 102, 0.75)';
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(x, y - 2); ctx.lineTo(x, y - 16); ctx.stroke();
                ctx.fillStyle = '#ffcc66';
                ctx.fillText(String(pk.pos), x, y - 20);
            }
            ctx.restore();
        }

        _paintHover(ctx) {
            if (!this.hover) return;
            const b = this._plotBox();
            const x = this._shiftToX(this.hover.shift);
            const y = this._intensityToY(this.hover.y);
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 215, 0, 0.45)';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.beginPath(); ctx.moveTo(x, b.T); ctx.lineTo(x, b.B); ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = '#ffd700';
            ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }

        _paint() {
            if (!this.canvas || !this.canvas.parentElement) return;
            this._resize();
            const ctx = this.canvas.getContext('2d');
            const b = this._plotBox();
            this._paintFrame(ctx);

            if (this.state === 'scan') {
                const upTo = RAMAN_MIN_SHIFT + this.scanPos * (RAMAN_MAX_SHIFT - RAMAN_MIN_SHIFT);
                this._paintTrace(ctx, upTo, 'rgba(200, 160, 100, 0.45)', 1, 1);
                const x = this._shiftToX(upTo);
                ctx.save();
                ctx.strokeStyle = '#ffd700';
                ctx.globalAlpha = 0.18; ctx.lineWidth = 14;
                ctx.beginPath(); ctx.moveTo(x, b.T); ctx.lineTo(x, b.B); ctx.stroke();
                ctx.globalAlpha = 1; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(x, b.T); ctx.lineTo(x, b.B); ctx.stroke();
                ctx.restore();
            } else {
                const upTo = this.state === 'done'
                    ? RAMAN_MAX_SHIFT
                    : RAMAN_MIN_SHIFT + this.revealPos * (RAMAN_MAX_SHIFT - RAMAN_MIN_SHIFT);
                this._paintTrace(ctx, upTo, this._matColor(), 4, 0.18);
                this._paintTrace(ctx, upTo, this._matColor(), 1.6, 0.95);
                this._paintPeaks(ctx, upTo);
                if (this.state === 'done') this._paintHover(ctx);
            }

            this.rangeEl.textContent = T('Raman.rangeLine', {
                min: Math.round(this.viewMin), max: Math.round(this.viewMax),
            });
        }

        // ---- Per-frame update ----

        update(delta) {
            if (this.closed || !this.root) return;
            this.frame += delta;

            if (this.state === 'scan') {
                this.scanPos = Math.min(1, this.frame / 90);
                const shift = Math.round(RAMAN_MIN_SHIFT + this.scanPos * (RAMAN_MAX_SHIFT - RAMAN_MIN_SHIFT));
                const dots = '.'.repeat(Math.floor(this.frame / 8) % 4);
                this.statusEl.textContent = T('Raman.statusScanning', { dots: dots, shift: shift });
                if (this.scanPos >= 1) {
                    this.state = 'reveal';
                    this.frame = 0;
                    this.statusEl.textContent = T('Raman.statusAnalyzing');
                }
            } else if (this.state === 'reveal') {
                this.revealPos = Math.min(1, this.frame / 110);
                const dots = '.'.repeat(Math.floor(this.frame / 10) % 4);
                this.statusEl.textContent = T('Raman.statusRendering', { dots: dots });
                if (this.revealPos >= 1) {
                    this.state = 'done';
                    this.statusEl.textContent = T('Raman.statusComplete');
                    this.identEl.style.color = this._matColor();
                    this.identEl.textContent = T('Raman.identLine', {
                        name: this.mat.subname.toUpperCase(),
                        formula: this.mat.name,
                        confidence: this.mat.confidence,
                    });
                }
            } else {
                this.handleInput();
            }

            this._paint();
        }

        // ---- Lifecycle ----

        close() {
            if (this.closed) return;
            this.closed = true;
            if (this.canvas) {
                this.canvas.removeEventListener('wheel', this._onWheel);
                this.canvas.removeEventListener('mousemove', this._onMove);
                this.canvas.removeEventListener('mouseleave', this._onLeave);
            }
            if (this.root && this.root.parentElement) this.root.parentElement.removeChild(this.root);
            this.root = null;
            this.canvas = null;
        }
    }

    // =========================================================
    // SCENE
    // Proper MZ scene so Esc works and the map is paused cleanly
    // =========================================================

    class Scene_RamanScan extends Scene_Base {
        create() {
            super.create();
            // console.log('[Raman] Scene_RamanScan.create()');
            this._display = window._ramanDisplay;

            // Solid background so the frozen map doesn't show through
            const bg = new PIXI.Graphics();
            bg.beginFill(0x000000, 1).drawRect(0, 0, Graphics.width, Graphics.height).endFill();
            this.addChild(bg);

            this.addChild(this._display.container);
            // console.log('[Raman] Scene children after setup:', this.children.length);

            if (window.MinigameFun) window.MinigameFun.played('Raman Spectroscopy');
        }

        update() {
            super.update();
            if (!this._display) return;
            this._display.update(1);

            // A click is a reading gesture now (hover, wheel zoom), so only
            // the explicit close inputs leave the analyzer.
            if (Input.isTriggered('cancel') || Input.isTriggered('ok') ||
                TouchInput.isCancelled()) {
                this._display.close();
                this.popScene();
            }
        }

        terminate() {
            super.terminate();
            if (this._display) this._display.close();
        }
    }

    // =========================================================
    // INTERPRETER WAIT HOOK
    // Blocks the event until the display is closed
    // =========================================================

    const _origUpdateWaitMode = Game_Interpreter.prototype.updateWaitMode;
    Game_Interpreter.prototype.updateWaitMode = function () {
        if (this._waitMode === 'ramanScan') {
            const d = window._ramanDisplay;
            if (d && !d.closed) return true;
            window._ramanDisplay = null;
            return false;
        }
        return _origUpdateWaitMode.call(this);
    };

    // =========================================================
    // PLUGIN COMMAND
    // =========================================================

    // A Hyperdeck with a probe head fitted is a scanner the player carries, so
    // the analysis stops being something an event has to offer and becomes
    // something you can just do to whatever you are standing in front of.
    function hasProbeFitted() {
        return !!(window.HyperDeck && window.HyperDeck.hasFittedTag
            && window.HyperDeck.hasFittedTag('RamanProbe'));
    }

    function openScan(ev, result) {
        if (ev) grantScanKnowledgeAt(ev.x, ev.y);
        window._ramanDisplay = new RamanDisplay(
            result.materialKey, result.objectType,
            ev ? ev.event().name : T('Raman.unknown'));
        SceneManager.push(Scene_RamanScan);
    }

    // Runs after the normal action button has had its go: if nothing on the map
    // wanted the press and the thing in front can be read, the probe reads it.
    const _Game_Player_triggerButtonAction = Game_Player.prototype.triggerButtonAction;
    Game_Player.prototype.triggerButtonAction = function () {
        if (_Game_Player_triggerButtonAction.call(this)) return true;
        // An object may have answered the press with its own Look / Analyze
        // prompt: that choice is the scan, do not open a second one over it.
        if ($gameMessage.isBusy()) return false;
        if (!Input.isTriggered('ok') || !hasProbeFitted()) return false;
        const ev = getEventInFront();
        const result = getMaterialForEvent(ev);
        if (!result) return false;
        SoundManager.playOk();
        openScan(ev, result);
        return true;
    };

    // The carried probe. Either the item in the backpack or a probe head fitted
    // to the hyperdeck lets the party analyse what it is looking at, so both
    // count as owning a scanner.
    const RAMAN_PROBE_ITEM_ID = 141;

    function hasProbeItem() {
        return !!($gameParty && typeof $dataItems !== 'undefined'
            && $dataItems[RAMAN_PROBE_ITEM_ID]
            && $gameParty.hasItem($dataItems[RAMAN_PROBE_ITEM_ID]));
    }

    function hasScanner() {
        return hasProbeItem() || hasProbeFitted();
    }

    // Look / Analyze / Cancel. The one prompt every readable object goes
    // through: a statue, a fossil, a painting, a bookcase, whether it is an
    // event or a procedural terrain feature. Without a probe there is nothing
    // to choose, so the object is simply looked at.
    function offerScan(onLook, onAnalyze) {
        if (!hasScanner() || typeof onAnalyze !== 'function') {
            if (typeof onLook === 'function') onLook();
            return false;
        }
        const choices = T.list('Raman.choices');
        const cancelIndex = choices.length - 1;
        window.skipLocalization = true;
        $gameMessage.setChoices(choices, 0, cancelIndex);
        window.skipLocalization = false;
        $gameMessage.setChoiceBackground(0);
        $gameMessage.setChoicePositionType(2);
        $gameMessage.setChoiceCallback(n => {
            if (n === 0 && typeof onLook === 'function') onLook();
            else if (n === 1) onAnalyze();
            // cancelIndex, or -1 on a cancel input: nothing happens.
        });
        return true;
    }

    window.RamanScanner = {
        hasProbe: hasProbeFitted,
        available: hasScanner,
        offer: offerScan,
        // For menus that already have their own verbs and only want the extra
        // Analyze entry alongside them.
        analyzeLabel() { return T.list('Raman.choices')[1]; },
        scanFront() {
            const ev = getEventInFront();
            const result = getMaterialForEvent(ev);
            if (!result) return false;
            openScan(ev, result);
            return true;
        },
        // For things that are not events: the procedural map's terrain features
        // are tiles, and they know what they are without being sniffed for it.
        scanTile(x, y, objectType, label) {
            const type = TYPE_MATERIALS[objectType] ? objectType : 'surface';
            grantScanKnowledgeAt(x, y);
            window._ramanDisplay = new RamanDisplay(
                materialForType(type, x, y), type, label || T('Raman.unknown'));
            SceneManager.push(Scene_RamanScan);
            return true;
        },
        scanEvent(ev) {
            const result = getMaterialForEvent(ev);
            if (!result) return false;
            openScan(ev, result);
            return true;
        },
    };

    // =========================================================
    // GENERIC OBJECT OFFER
    // Any event that reads as a scannable object gets the Look / Analyze /
    // Cancel prompt in front of whatever it was going to do. Events that call
    // the description plugin commands ask for themselves (RandomBookGenerator),
    // and everything the player is not deliberately talking to is left alone.
    // =========================================================

    // Chests, doors and the people standing behind a counter pick up "figure",
    // "paint" and "book" by accident. A bookseller is not a bookcase.
    const NOT_AN_OBJECT = /treasure|door|chest|shop|stall|counter|vendor|merchant|seller|trader|keeper|clerk|guard|npc/i;

    function eventOffersScan(ev) {
        if (!ev || !hasScanner() || ev._ramanLooking) return false;
        if ($gameMap.isEventRunning() || $gameMessage.isBusy()) return false;
        const page = ev.page && ev.page();
        // Only something the player walked up to and pressed on.
        if (!page || ev._trigger !== 0) return false;
        const data = ev.event();
        if (!data || NOT_AN_OBJECT.test(data.name || '')) return false;
        const read = objectTypeForEvent(ev);
        return !!read && !read.offersItself;
    }

    const _Game_Event_start = Game_Event.prototype.start;
    Game_Event.prototype.start = function () {
        if (eventOffersScan(this)) {
            const ev = this;
            offerScan(
                () => {
                    // Looking is the event as it was written: run it, but do
                    // not ask again on the way through.
                    ev._ramanLooking = true;
                    _Game_Event_start.call(ev);
                    ev._ramanLooking = false;
                },
                () => { window.RamanScanner.scanEvent(ev); }
            );
            return;
        }
        _Game_Event_start.call(this);
    };

    PluginManager.registerCommand(pluginName, 'ScanFront', function () {
        // console.log('[Raman] ScanFront command triggered');
        // console.log('[Raman] Player dir:', $gamePlayer.direction(), '| x:', $gamePlayer.x, 'y:', $gamePlayer.y);

        const ev = getEventInFront();
        // console.log('[Raman] Event in front:', ev ? `id=${ev.eventId()} name="${ev.event().name}" x=${ev.x} y=${ev.y}` : 'NONE');

        const result = getMaterialForEvent(ev);
        // console.log('[Raman] getMaterialForEvent result:', result);

        if (!result) {
            // console.log('[Raman] No scannable material found ,  showing message');
            window.skipLocalization = true;
            $gameMessage.add(T('Raman.msgHeader'));
            $gameMessage.add(T('Raman.msgNoMaterial'));
            $gameMessage.add(T('Raman.msgHint'));
            window.skipLocalization = false;
            return;
        }

        // console.log('[Raman] Creating display for material:', result.materialKey, '| type:', result.objectType);
        // console.log('[Raman] SceneManager._scene:', SceneManager._scene);
        // console.log('[Raman] Graphics.width/height:', Graphics.width, Graphics.height);

        if (ev) grantScanKnowledgeAt(ev.x, ev.y);

        const display = new RamanDisplay(
            result.materialKey,
            result.objectType,
            ev ? ev.event().name : T('Raman.unknown')
        );
        // console.log('[Raman] RamanDisplay constructed OK');
        window._ramanDisplay = display;
        // console.log('[Raman] Pushing Scene_RamanScan...');
        SceneManager.push(Scene_RamanScan);
        this.setWaitMode('ramanScan');
        // console.log('[Raman] waitMode set to ramanScan');
    });

})();
