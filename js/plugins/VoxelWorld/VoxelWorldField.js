//=============================================================================
// VoxelWorldField.js
// VoxelWorld: the voxel field itself - generation, edits, raycasting, meshing
//
// The ground of VoxelWorld is not a height mesh any more. It is a field of
// small cubes, and this module is the whole of it: where a cube is, what it is
// made of, how a pick or a bumper takes one out, and how a patch of them is
// turned into triangles.
//
// The field is procedural and therefore free: no cube is stored anywhere until
// somebody changes it. VoxelField answers "is there a cube here" from the world
// map's biomes and the same Perlin heights the flat terrain used, and VoxelEdits
// keeps only the differences - the blocks dug out and the blocks put back. That
// is what makes a 256x256 tile world of one-and-a-quarter metre cubes affordable
// and what makes a tunnel through a mountain survive a save.
//=============================================================================

/*:
 * @target MZ
 * @plugindesc VoxelWorld - the voxel field: generation, edits, raycasting, meshing
 * @author Omni-Lex
 *
 * @help
 * The destructible voxel field under the VoxelWorld scene.
 *
 * One module of the VoxelWorld suite (VoxelWorldCore.js loads first). It
 * declares no plugin commands of its own; those live in VoxelWorldSystem.js.
 *
 * Shape of the world:
 * - a voxel is VOX.SIZE world units on a side (1.25 m at 4 units per metre)
 * - a world map tile is VOX.PER_TILE voxels across, and is the streaming chunk
 * - a chunk is meshed as VOX.SUB x VOX.SUB sub-chunks at full detail, so a dig
 *   rebuilds a twenty-five column patch and not the whole tile
 * - distant chunks are meshed with bigger blocks (the LOD table), which keeps
 *   the world blocky all the way to the horizon instead of swapping in a
 *   different kind of terrain
 */

(() => {
    'use strict';

    const VW = window.VoxelWorld;
    if (!VW) { console.error('[VoxelWorld] core not loaded before VoxelWorldField.js'); return; }

    const {
        MOUNTAIN_MAX_H, ROAD_BED_DROP, ROAD_GAP, ROAD_LANE_OFF, ROAD_TOTAL_W, SNOW_LINE, WATER_LEVEL_Y,
        OMEGA_SPAN, OMEGA_TILE, getAlienTerrain,
        WORLD_SCALE, WORLD_TILE_SIZE, _fbm, _perlin, getRenderType, loadTex, loadVoxelTex,
        getRoadDirectionAt, isRiverTile, noiseHeight, riverLinksAt, sampleBiomeAt
    } = VW;

    // =========================================================================
    // Shape of the grid
    // =========================================================================
    const VOX = {
        // World units per voxel edge. UNITS_PER_M is 4, so a voxel is 1.25 m:
        // small enough that a person (1.75 m) is taller than one and a doorway
        // is two wide, large enough that a 500-unit world tile is only a
        // hundred columns across.
        SIZE: 5,
        PER_TILE: Math.max(4, Math.round(WORLD_TILE_SIZE / 5)),
        // Full-detail meshing granularity: a tile is cut into SUB x SUB patches
        // so breaking one block re-meshes SUB_N x SUB_N columns, not the tile.
        SUB: 4,
        // Bedrock. Nothing below this level can be dug out, so no one can fall
        // out of the world through their own tunnel.
        MIN_Y: -44,
        // Ceiling for placed blocks (mountains top out well under this).
        MAX_Y: 400,
        // How far a dig reaches from the eye, in world units (about 11 m).
        REACH: 46,
    };
    VOX.SUB_N   = Math.max(1, Math.round(VOX.PER_TILE / VOX.SUB));
    VOX.TILE_Y  = VOX.MAX_Y - VOX.MIN_Y;

    // Block size by chebyshev tile distance from the camera. Index past the end
    // clamps to the last entry, so the far field is drawn in 25 m blocks.
    VOX.LOD = [1, 1, 2, 2, 4, 4, 4, 10, 10, 10, 10, 10, 20];
    VOX.lodStep = d => VOX.LOD[Math.min(Math.max(0, d | 0), VOX.LOD.length - 1)];

    function isFarlands(x, z) {
        const span = 256 * WORLD_TILE_SIZE;
        return x < 0 || x >= span || z < 0 || z >= span;
    }

    // =========================================================================
    // Materials
    //
    // `biome: true` means the cube takes its colour from the world map's own
    // biome colour at that column, which is what keeps a voxel world looking
    // like the map it was generated from instead of a uniform block palette.
    // =========================================================================
    // Ids 0-15 are the ground the world was first made of and may never move:
    // a dig log saved before the block table grew stores them by number.
    // Everything from 16 up is a BLOCK - a surface with a picture of its own
    // (one PNG per block under img/textures/voxels, built by
    // tools/build_voxel_blocks.js) rather than a tinted cube of the world's
    // one grain.
    const MAT = {
        AIR: 0, GRASS: 1, DIRT: 2, ROCK: 3, SAND: 4, SNOW: 5, ASPHALT: 6,
        MARK: 7, GRAVEL: 8, ORE: 9, CLAY: 10, ICE: 11, ASH: 12, BEDROCK: 13,
        MUD: 14, SALT: 15,
        // --- the deep rock ---------------------------------------------------
        GRANITE: 16, BASALT: 17, MARBLE: 18, SANDSTONE: 19, LIMESTONE: 20,
        OBSIDIAN: 21, LAVA: 22, MAGMA: 23, CRYSTAL: 24, GLOWSTONE: 25,
        // --- what people build with -------------------------------------------
        BRICK: 26, COBBLE: 27, CONCRETE: 28, PLASTER: 29, PLANK: 30,
        TIMBER: 31, THATCH: 32, GLASS: 33, IRON: 34, COPPER: 35,
        // --- the seams ---------------------------------------------------------
        ORE_IRON: 36, ORE_COAL: 37, ORE_SILICA: 38, ORE_BONE: 39,
        ORE_TITANIUM: 40, ORE_SULPHUR: 41, ORE_CRYSTAL: 42, ORE_VARLENIA: 43,
        ORE_ARCANE: 44, ORE_ETHEREAL: 45, ORE_QUANTUM: 46, ORE_METEOR: 47
    };



    // Hex to the RGB the renderer wants. three.js converts an sRGB hex to
    // linear when colour management is on, and a value fed straight in without
    // that conversion washes the whole world out; THREE.Color is the authority
    // on it, so ask it whenever it is there.
    function srgbRGB(hex) {
        if (typeof THREE !== 'undefined' && THREE.Color) {
            const c = new THREE.Color(hex);
            return { r: c.r, g: c.g, b: c.b };
        }
        const n = typeof hex === 'number' ? hex : (parseInt(String(hex).replace('#', ''), 16) || 0);
        return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
    }

    const MATERIALS = [];
    function defMat(id, key, color, opts) {
        const m = Object.assign({
            id, key, color, biome: false, hard: 1, diggable: true, drop: null,
            // A block with a picture of its own: `tex` names its 48x48 tile
            // under img/textures/voxels. One repeat per cube, which is what the
            // mesher's UVs already are, so it needs no atlas and no cell
            // arithmetic - just its own surface.
            tex: null, glow: false,
            // A seam pays out: breaking one cube of it puts `drop` (an item id
            // in data/Items.json) in the bags instead of a cube on the build
            // bar. Anything that is not a seam is a block you keep and build
            // with, which is what a block is for.
            seam: false,
            // Unpacked once here: the mesher wants this per wall run and per
            // cube, and it must not be parsing a hex string to get it.
            rgb: srgbRGB(color)
        }, opts || {});
        MATERIALS[id] = m;
    }
    defMat(MAT.AIR,     'air',     0x000000, { diggable: false });
    defMat(MAT.GRASS,   'grass',   0x74a352, { biome: true, hard: 1 });
    defMat(MAT.DIRT,    'dirt',    0x6b4f34, { hard: 1 });
    defMat(MAT.ROCK,    'rock',    0x6b6b73, { hard: 3 });
    defMat(MAT.SAND,    'sand',    0xdccfa0, { hard: 1 });
    defMat(MAT.SNOW,    'snow',    0xf4f6fb, { hard: 1 });
    defMat(MAT.ASPHALT, 'asphalt', 0x4c4c51, { hard: 4 });
    defMat(MAT.MARK,    'mark',    0xd8d6c6, { hard: 4 });
    defMat(MAT.GRAVEL,  'gravel',  0x7a756c, { hard: 2 });
    // The seam the world had before it had twelve of them. Nothing generates it
    // any more (see ORES), but a dig log saved back then still stores it.
    defMat(MAT.ORE,     'ore',     0x8fc7dd, { hard: 5, tex: 'ore', seam: true, drop: 864 });
    defMat(MAT.CLAY,    'clay',    0x8d6b52, { hard: 2 });
    defMat(MAT.ICE,     'ice',     0xbfe4f2, { hard: 2 });
    defMat(MAT.ASH,     'ash',     0x4a4650, { hard: 1 });
    defMat(MAT.BEDROCK, 'bedrock', 0x2b2b30, { hard: 99, diggable: false });
    defMat(MAT.MUD,     'mud',     0x4f4330, { hard: 1 });
    defMat(MAT.SALT,    'salt',    0xeceae0, { hard: 1 });

    // --- the deep rock -------------------------------------------------------
    // Everything below wears its own tile out of the block atlas, so a cliff of
    // granite is granite and a wall of brick is brick rather than a cube of the
    // world's one grain multiplied by a colour.
    defMat(MAT.GRANITE,  'granite',  0x8b8078, { hard: 4, tex: 'granite' });
    defMat(MAT.BASALT,   'basalt',   0x3f4046, { hard: 5, tex: 'basalt' });
    defMat(MAT.MARBLE,   'marble',   0xe0ddd4, { hard: 4, tex: 'marble' });
    defMat(MAT.SANDSTONE,'sandstone',0xc9b183, { hard: 3, tex: 'sandstone' });
    defMat(MAT.LIMESTONE,'limestone',0xd0cbb8, { hard: 3, tex: 'limestone' });
    defMat(MAT.OBSIDIAN, 'obsidian', 0x241f2e, { hard: 8, tex: 'obsidian' });
    // The melt. It glows, it is drawn with the world's one emissive block
    // surface, and it is far too hot to take a pick to.
    defMat(MAT.LAVA,     'lava',     0xff8a2a, { hard: 99, diggable: false,
                                                 tex: 'lava', glow: true });
    defMat(MAT.MAGMA,    'magma',    0xd44a18, { hard: 7, tex: 'magma', glow: true });
    defMat(MAT.CRYSTAL,  'crystal',  0x8fc7dd, { hard: 5, tex: 'crystal' });
    defMat(MAT.GLOWSTONE,'glowstone',0xffd98a, { hard: 3, tex: 'glowstone', glow: true });

    // --- what people build with ----------------------------------------------
    defMat(MAT.BRICK,    'brick',    0x9c6a56, { hard: 3, tex: 'brick' });
    defMat(MAT.COBBLE,   'cobble',   0x7d7a72, { hard: 3, tex: 'cobble' });
    defMat(MAT.CONCRETE, 'concrete', 0x8f9298, { hard: 4, tex: 'concrete' });
    defMat(MAT.PLASTER,  'plaster',  0xd8cfbb, { hard: 2, tex: 'plaster' });
    defMat(MAT.PLANK,    'plank',    0x8a6a48, { hard: 2, tex: 'plank' });
    defMat(MAT.TIMBER,   'timber',   0x5e4126, { hard: 2, tex: 'timber' });
    defMat(MAT.THATCH,   'thatch',   0xc9a94f, { hard: 1, tex: 'thatch' });
    defMat(MAT.GLASS,    'glass',    0x9fc6db, { hard: 1, tex: 'glass' });
    defMat(MAT.IRON,     'iron',     0x585d66, { hard: 6, tex: 'iron' });
    defMat(MAT.COPPER,   'copper',   0x9c6b3f, { hard: 5, tex: 'copper' });

    // --- the seams ------------------------------------------------------------
    // `drop` is the id of the item in data/Items.json a broken cube is worth.
    defMat(MAT.ORE_IRON,     'ore_iron',     0xb08258, { hard: 5, seam: true, tex: 'ore_iron',     drop: 863 });
    defMat(MAT.ORE_COAL,     'ore_coal',     0x24242a, { hard: 4, seam: true, tex: 'ore_coal',     drop: 870 });
    defMat(MAT.ORE_SILICA,   'ore_silica',   0xdfe8ee, { hard: 4, seam: true, tex: 'ore_silica',   drop: 867 });
    defMat(MAT.ORE_BONE,     'ore_bone',     0xe0d8bd, { hard: 3, seam: true, tex: 'ore_bone',     drop: 860 });
    defMat(MAT.ORE_TITANIUM, 'ore_titanium', 0x9fb0bd, { hard: 6, seam: true, tex: 'ore_titanium', drop: 864 });
    defMat(MAT.ORE_SULPHUR,  'ore_sulphur',  0xe3d24a, { hard: 4, seam: true, tex: 'ore_sulphur',  drop: 871 });
    defMat(MAT.ORE_CRYSTAL,  'ore_crystal',  0x8fe3dd, { hard: 6, seam: true, tex: 'ore_crystal',  drop: 866 });
    defMat(MAT.ORE_VARLENIA, 'ore_varlenia', 0xb46fe0, { hard: 6, seam: true, tex: 'ore_varlenia', drop: 865 });
    defMat(MAT.ORE_ARCANE,   'ore_arcane',   0x6f8cff, { hard: 7, seam: true, tex: 'ore_arcane',   drop: 849, glow: true });
    defMat(MAT.ORE_ETHEREAL, 'ore_ethereal', 0xd8f0ff, { hard: 7, seam: true, tex: 'ore_ethereal', drop: 850, glow: true });
    defMat(MAT.ORE_QUANTUM,  'ore_quantum',  0x4affc9, { hard: 8, seam: true, tex: 'ore_quantum',  drop: 851, glow: true });
    defMat(MAT.ORE_METEOR,   'ore_meteor',   0x7a6f66, { hard: 8, seam: true, tex: 'ore_meteor',   drop: 775 });

    // The blocks the pick offers to put back, in the order the tool cycles them:
    // the ground first, then everything a wall is made of.
    const PLACEABLE = [
        MAT.DIRT, MAT.ROCK, MAT.SAND, MAT.SNOW, MAT.GRAVEL, MAT.CLAY, MAT.MUD,
        MAT.BRICK, MAT.COBBLE, MAT.CONCRETE, MAT.PLASTER, MAT.PLANK, MAT.TIMBER,
        MAT.THATCH, MAT.GLASS, MAT.IRON, MAT.COPPER, MAT.MARBLE, MAT.SANDSTONE,
        MAT.LIMESTONE, MAT.GRANITE, MAT.BASALT, MAT.OBSIDIAN, MAT.GLOWSTONE
    ];

    // The old generic seam's payout, kept because a dig log saved before the
    // seams were split still stores MAT.ORE cubes and they have to be worth
    // something when somebody finally breaks one.
    const ORE_ITEMS = [864, 865, 866];

    // =========================================================================
    // Seams
    //
    // What is worth digging for, how deep it lies and what one cube of it is
    // worth. `min`/`max` are voxels below the surface of the column, `w` is how
    // much of the seam budget at that depth this mineral takes. The item ids are
    // data/Items.json's own crafting block, so a seam pays in the same materials
    // the forge and the alchemy bench ask for.
    // =========================================================================
    const ORES = [
        { mat: MAT.ORE_SILICA,   min: 3,  max: 18, w: 1.4 },   // Glass
        { mat: MAT.ORE_BONE,     min: 4,  max: 20, w: 1.1 },   // Bone
        { mat: MAT.ORE_COAL,     min: 5,  max: 26, w: 1.6 },   // Oil Flask
        { mat: MAT.ORE_IRON,     min: 6,  max: 46, w: 2.2 },   // Salvaged steel
        { mat: MAT.ORE_TITANIUM, min: 16, max: 60, w: 1.4 },   // Titanium ore
        { mat: MAT.ORE_SULPHUR,  min: 14, max: 60, w: 0.9 },   // Acidic Solution
        { mat: MAT.ORE_CRYSTAL,  min: 22, max: 99, w: 1.0 },   // Crystal
        { mat: MAT.ORE_VARLENIA, min: 30, max: 99, w: 0.8 },   // Varlenia ore
        { mat: MAT.ORE_ARCANE,   min: 36, max: 99, w: 0.55 },  // Arcane Essence
        { mat: MAT.ORE_ETHEREAL, min: 44, max: 99, w: 0.35 },  // Ethereal Shard
        { mat: MAT.ORE_QUANTUM,  min: 52, max: 99, w: 0.18 },  // Quantum Core
        { mat: MAT.ORE_METEOR,   min: 2,  max: 99, w: 0.12 }   // Meteorite Core Fragment
    ];

    // =========================================================================
    // Small helpers
    // =========================================================================
    // Stable 3D hash in 0..1. Used for ore veins and per-cube colour jitter, so
    // the same cube always looks and pays the same without storing anything.
    function hash3(a, b, c) {
        let h = (a | 0) * 374761393 + (b | 0) * 668265263 + (c | 0) * 1442695041;
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    }

    const _clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;

    // =========================================================================
    // What is in the rock
    // =========================================================================
    // These three answer, for one cube of ground that is deep enough to be out
    // of the subsoil, what it is actually made of. They are hot: genMaterial
    // calls them for every cube of every cave passage and every dug shaft, so
    // each of them is gated on ONE cheap hash and does no work at all in the
    // ninety-odd per cent of the world that is plain rock.

    // Melt. It pools on the floor of the world, in lakes rather than in an
    // unbroken sheet, and it stands much higher than that inside a volcano.
    const LAVA_FLOOR = 3;    // voxels of lake above the bedrock
    function hotAt(vx, vy, vz, p) {
        const floor = VOX.MIN_Y + LAVA_FLOOR;
        if (vy <= floor) {
            // The lakes: a coarse cell decides which stretches of the floor
            // hold melt, so a shaft sunk to the bottom finds a lake or does not
            // rather than finding one cube of lava in ten.
            if (hash3(vx >> 4, 0, vz >> 4) < 0.38) return MAT.LAVA;
            return MAT.BASALT;
        }
        const hot = p.hot || 0;
        if (!hot) return 0;
        // A volcano's own throat: magma the deeper you go under it, crusting
        // over into basalt at the edges.
        const above = vy - floor;
        const q = hot * Math.max(0, 0.55 - above * 0.02);
        if (q <= 0) return 0;
        const h = hash3(vx >> 2, vy >> 1, vz >> 2);
        if (h < q * 0.35) return MAT.LAVA;
        if (h < q) return MAT.MAGMA;
        return 0;
    }

    // A seam. In mountains and highlands, ore veins are rich and run close to or
    // directly on the rock surface, so prospectors find abundant ores in mountains.
    function oreAt(vx, vy, vz, depth, p) {
        const isMountain = p && (p.massif || p.bed === MAT.GRANITE || (p.ridge && p.ridge >= 30) || p.cliffAt <= 1.1);
        const cell = hash3(vx >> 2, vy >> 1, vz >> 2);
        let q = Math.min(0.10, 0.012 + depth * 0.0016);
        if (isMountain) {
            q = Math.max(q, 0.14);
        }
        if (cell >= q) return 0;
        if (hash3(vx, vy, vz) > 0.62) return 0;
        // Which mineral: the ones this depth can carry, weighted.
        let total = 0;
        for (let i = 0; i < ORES.length; i++) {
            const o = ORES[i];
            const minD = isMountain ? Math.min(o.min, 1) : o.min;
            if (depth >= minD && depth <= o.max) total += o.w;
        }
        if (total <= 0) return 0;
        let r = hash3(vx >> 2, (vy >> 1) + 977, vz >> 2) * total;
        for (let i = 0; i < ORES.length; i++) {
            const o = ORES[i];
            const minD = isMountain ? Math.min(o.min, 1) : o.min;
            if (depth < minD || depth > o.max) continue;
            r -= o.w;
            if (r <= 0) return o.mat;
        }
        return ORES[0].mat;
    }

    // The rock everything else is set in. A cave wall is limestone under a
    // meadow, granite under a mountain and sandstone under a canyon, with the
    // odd pocket of marble or a crystal geode in it: a shaft driven down
    // through the world should read as going somewhere.
    function bedMat(vx, vy, vz, p, depth) {
        const bed = p.bed || MAT.ROCK;
        if (depth < 8) return MAT.ROCK;
        const h = hash3(vx >> 3, vy >> 2, vz >> 3);
        if (h < 0.014 && depth > 24) return MAT.CRYSTAL;      // a geode
        if (h < 0.05) return MAT.MARBLE;                      // a lens of marble
        if (h < 0.10) return MAT.ROCK;                        // plain country rock
        return bed;
    }

    // =========================================================================
    // Terrain profiles
    //
    // What a biome's ground is actually shaped like. The world map hands over a
    // 256x256 grid of biome names and nothing else, so this table is where a
    // name becomes land: how much relief it carries, whether that relief rolls
    // or stands in ridges or is cut into strata, what the top cube is made of,
    // and what shows through where the ground is too steep to hold soil.
    //
    // Heights are world units, four to the metre. Three noise fields are
    // sampled once per column and every profile in a four-corner biome blend
    // weighs the same three, which is what keeps blending affordable.
    // =========================================================================
    const N_LAND_F = 0.00055;   // ~1800 units: which side of the valley you are on
    const N_HILL_F = 0.0032;    // ~310 units: hills, ridges and dune crests
    const N_FINE_F = 0.021;     // ~48 units: the roughness you feel underfoot

    // Sea level is where WaterPlane sits; anything lower is under the sea.
    const SEA_LEVEL = -2.5;
    // The Omega Tower's plinth: how high it stands and how far its ramp reaches.
    // Its footprint is OMEGA_SPAN world squares square, centred on OMEGA_TILE.
    const OMEGA_PAD_Y = 58;
    const OMEGA_RAMP  = 1.0;    // world squares of slope round the edge of it

    // =========================================================================
    // Another world's ground
    // =========================================================================
    // Off Earth there is no world map, no rivers and no roads: there is the
    // elevation field the landing picture was painted from, and the ground is
    // raised straight out of it (see the core's setAlienTerrain). The field
    // answers a number between 0 and 1 with a sea level somewhere in the middle
    // of it, so the whole job here is choosing what those numbers are worth in
    // metres.
    //
    // Sea level is pinned to the world's own SEA_LEVEL, which is where the water
    // plane sits, so an ocean the picture painted is an ocean you can swim in.
    // Above it the relief is stretched far harder than below it: the deeps only
    // have to look deep from a boat, while the mountains have to be worth
    // climbing, and a linear map of the same field would give a world of
    // ankle-high hills over a bottomless sea.
    const ALIEN_LAND_RELIEF = 2400;   // world units from the tide line to the peaks
    const ALIEN_SEA_RELIEF  = 520;    // ...and from the tide line to the abyss
    // A crater on a cratered world: how deep the floor sits under the plain it
    // punched into, and how high the rim it threw up stands over it.
    const ALIEN_CRATER_D    = 210;
    const ALIEN_CRATER_RIM  = 90;

    // -------------------------------------------------------------------------
    // What KIND of world this is
    // -------------------------------------------------------------------------
    // The elevation field says where the high ground is. It does not say what
    // high ground MEANS on this world, and every world used to be given the
    // same answer: one relief, one roughness, grass, sand, rock and snow, so a
    // rainforest, a salt flat, an ice moon and a lava world came out as the
    // same continent painted four colours.
    //
    // A style is that answer. It says how far the field is stretched, what
    // shapes are cut out of it (ridges, dunes, terraces, chasms, craters), what
    // the ground is made of band by band and what the sea, if there is one, is.
    // Styles are looked up by the planet's own type first and by its painter
    // family behind that, then jittered by the world's seed, which is what
    // makes two ice moons two different ice moons.
    const ALIEN_STYLES = {};
    function defAlienStyle(key, o) {
        ALIEN_STYLES[key] = Object.assign({
            key,
            land: ALIEN_LAND_RELIEF,  // tide line to the peaks, world units
            sea: ALIEN_SEA_RELIEF,    // tide line to the abyss
            detail: 90,               // the planet's OWN fine octave
            rough: 26,                // generic hill-scale roughness
            fine: 7,                  // metre-scale roughness underfoot
            ridge: 0,                 // ridged crests on the high ground
            ridgePow: 2,
            dune: 0,                  // parallel crests, deserts and ash fields
            duneF: 0.0042,
            terrace: 0,               // quantise the relief to this step
            terraceMix: 0.7,
            crater: 1,                // multiplies the impact depth and rim
            crevasse: 0,              // chasms cut along the fracture lines
            lava: false,              // fissures run molten
            mats: null,               // band -> material
            deep: MAT.CLAY,           // what the bed of the sea is
            shore: MAT.SAND,          // ...and the strand around it
            tint: 0.45                // how far the ground takes its block's colour
        }, o || {});
    }

    // Bands come from Renderer3D.planetElevation: water/beach/grass/forest/rock/
    // snow on a terrestrial world, dust/rock/ridge/snow on a rocky one,
    // ice/snow on an icy one, lava/ash/basalt on a volcanic one.
    const M_EARTH = { grass: MAT.GRASS, forest: MAT.GRASS, beach: MAT.SAND,
                      rock: MAT.ROCK, snow: MAT.SNOW, water: MAT.SAND };
    const M_ROCK  = { dust: MAT.GRAVEL, rock: MAT.ROCK, ridge: MAT.ROCK,
                      snow: MAT.SNOW, grass: MAT.GRAVEL, beach: MAT.SAND,
                      forest: MAT.GRAVEL, water: MAT.GRAVEL };
    const M_ICE   = { ice: MAT.ICE, snow: MAT.SNOW, rock: MAT.ROCK,
                      dust: MAT.ICE, ridge: MAT.ICE, grass: MAT.SNOW,
                      beach: MAT.SNOW, forest: MAT.SNOW, water: MAT.ICE };
    const M_FIRE  = { lava: MAT.LAVA, ash: MAT.ASH, basalt: MAT.BASALT,
                      rock: MAT.BASALT, dust: MAT.ASH, ridge: MAT.OBSIDIAN,
                      snow: MAT.ASH, grass: MAT.ASH, beach: MAT.ASH,
                      forest: MAT.ASH, water: MAT.OBSIDIAN };

    // The five families, which anything unlisted falls back to.
    defAlienStyle('terrestrial', {
        ridge: 190, mats: M_EARTH, deep: MAT.CLAY, shore: MAT.SAND });
    defAlienStyle('rocky', {
        land: 1500, sea: 260, detail: 130, ridge: 240,
        mats: M_ROCK, deep: MAT.GRAVEL, shore: MAT.GRAVEL, tint: 0.55 });
    defAlienStyle('icy', {
        land: 900, sea: 300, detail: 60, rough: 14, fine: 4, ridge: 120,
        crevasse: 260, mats: M_ICE, deep: MAT.ICE, shore: MAT.SNOW, tint: 0.7 });
    defAlienStyle('volcanic', {
        land: 1900, sea: 340, detail: 150, ridge: 320, ridgePow: 3, lava: true,
        mats: M_FIRE, deep: MAT.OBSIDIAN, shore: MAT.BASALT, tint: 0.6 });
    defAlienStyle('gas', {
        // Nothing to stand on but the cloud deck itself: endless soft swells
        // and no relief that could ever be climbed.
        land: 260, sea: 120, detail: 40, rough: 40, fine: 3, crater: 0,
        mats: { cloud: MAT.SNOW, rock: MAT.SNOW, dust: MAT.SNOW,
                snow: MAT.SNOW, ice: MAT.ICE, water: MAT.ICE },
        deep: MAT.ICE, shore: MAT.SNOW, tint: 0.35 });

    // ...and the worlds that are their own thing, keyed by planet type
    // (js/db/GalaxySim/PlanetTypes.json). i18n-ignore: planet type ids
    defAlienStyle('desert', {
        land: 1100, sea: 200, detail: 70, ridge: 120, dune: 34, terrace: 130,
        mats: { grass: MAT.SAND, forest: MAT.SAND, beach: MAT.SAND,
                rock: MAT.SANDSTONE, snow: MAT.SALT, dust: MAT.SAND,
                ridge: MAT.SANDSTONE, water: MAT.SALT },
        deep: MAT.SALT, shore: MAT.SALT, tint: 0.5 });
    defAlienStyle('rainforest', {
        land: 2000, detail: 120, rough: 40, ridge: 260, ridgePow: 3,
        mats: M_EARTH, tint: 0.3 });
    defAlienStyle('ocean', {
        // Almost all of it is sea, and what stands out of it is worn flat.
        land: 700, sea: 900, detail: 50, ridge: 60, mats: M_EARTH,
        deep: MAT.CLAY, shore: MAT.SAND });
    defAlienStyle('acid_ocean', {
        land: 800, sea: 800, detail: 60, ridge: 80,
        mats: { grass: MAT.CLAY, forest: MAT.CLAY, beach: MAT.SALT,
                rock: MAT.LIMESTONE, snow: MAT.SALT, water: MAT.CLAY },
        deep: MAT.LIMESTONE, shore: MAT.SALT, tint: 0.55 });
    defAlienStyle('tundra', {
        land: 1000, sea: 260, detail: 70, ridge: 140, crevasse: 90,
        mats: { grass: MAT.SNOW, forest: MAT.SNOW, beach: MAT.GRAVEL,
                rock: MAT.ROCK, snow: MAT.SNOW, ice: MAT.ICE, dust: MAT.GRAVEL,
                ridge: MAT.ROCK, water: MAT.ICE },
        deep: MAT.ICE, shore: MAT.SNOW, tint: 0.6 });
    defAlienStyle('mercurian', {
        // Airless, scoured, and stepped where the crust cooled and shrank.
        land: 1700, detail: 150, ridge: 300, terrace: 210, crater: 1.35,
        mats: M_ROCK, deep: MAT.GRAVEL, shore: MAT.GRAVEL, tint: 0.6 });
    defAlienStyle('mega_iron', {
        land: 800, detail: 60, ridge: 90, terrace: 260, crater: 1.2,
        mats: { dust: MAT.GRAVEL, rock: MAT.IRON, ridge: MAT.IRON,
                snow: MAT.IRON, grass: MAT.GRAVEL, water: MAT.IRON },
        deep: MAT.IRON, shore: MAT.GRAVEL, tint: 0.65 });
    defAlienStyle('carbon', {
        land: 1600, detail: 110, ridge: 280, terrace: 150,
        mats: { dust: MAT.ASH, rock: MAT.OBSIDIAN, ridge: MAT.OBSIDIAN,
                snow: MAT.ASH, grass: MAT.ASH, water: MAT.OBSIDIAN },
        deep: MAT.OBSIDIAN, shore: MAT.ASH, tint: 0.7 });
    defAlienStyle('diamond', {
        // Crystal country: sharp, faceted and stepped, and it catches the light.
        land: 2100, detail: 120, ridge: 460, ridgePow: 4, terrace: 90,
        terraceMix: 0.9,
        mats: { dust: MAT.CRYSTAL, rock: MAT.CRYSTAL, ridge: MAT.CRYSTAL,
                snow: MAT.MARBLE, grass: MAT.MARBLE, water: MAT.CRYSTAL },
        deep: MAT.CRYSTAL, shore: MAT.MARBLE, tint: 0.75 });
    defAlienStyle('plasma', {
        land: 700, detail: 200, rough: 60, ridge: 120, lava: true,
        mats: M_FIRE, deep: MAT.MAGMA, shore: MAT.BASALT, tint: 0.75 });
    defAlienStyle('quark_planet', {
        // Gravity that steep leaves nothing standing: a mirror of a world.
        land: 120, sea: 60, detail: 14, rough: 4, fine: 2, crater: 0,
        mats: { dust: MAT.OBSIDIAN, rock: MAT.OBSIDIAN, ridge: MAT.OBSIDIAN,
                snow: MAT.OBSIDIAN, grass: MAT.OBSIDIAN, water: MAT.OBSIDIAN },
        deep: MAT.OBSIDIAN, shore: MAT.OBSIDIAN, tint: 0.85 });
    defAlienStyle('magnetar', {
        land: 300, sea: 90, detail: 30, rough: 8, fine: 2, ridge: 40,
        mats: { dust: MAT.IRON, rock: MAT.IRON, ridge: MAT.IRON,
                snow: MAT.GLOWSTONE, grass: MAT.IRON, water: MAT.IRON },
        deep: MAT.IRON, shore: MAT.IRON, tint: 0.8 });
    defAlienStyle('rogue', {
        // No star, no weather: whatever the last impact left, kept for ever.
        land: 1300, detail: 90, rough: 18, fine: 4, ridge: 200, crater: 1.3,
        crevasse: 140,
        mats: { ice: MAT.ICE, snow: MAT.ICE, dust: MAT.ROCK, rock: MAT.ROCK,
                ridge: MAT.ROCK, grass: MAT.ICE, water: MAT.ICE },
        deep: MAT.ICE, shore: MAT.ICE, tint: 0.65 });
    defAlienStyle('chthonian', {
        // A gas giant's stripped core: bare metal ridges and open melt.
        land: 2200, detail: 170, ridge: 380, ridgePow: 3, lava: true,
        mats: { lava: MAT.LAVA, ash: MAT.ASH, basalt: MAT.BASALT,
                rock: MAT.IRON, ridge: MAT.IRON, dust: MAT.ASH,
                snow: MAT.ASH, water: MAT.MAGMA },
        deep: MAT.MAGMA, shore: MAT.BASALT, tint: 0.7 });
    // The bodies too small to have pulled themselves round: no weather, no
    // erosion, and relief that is simply what they broke as.
    defAlienStyle('irregular', {
        land: 2000, sea: 200, detail: 210, rough: 60, fine: 10, ridge: 420,
        ridgePow: 4, crater: 1.5,
        mats: { dust: MAT.GRAVEL, rock: MAT.ROCK, ridge: MAT.ROCK,
                snow: MAT.ICE, ice: MAT.ICE, grass: MAT.GRAVEL, water: MAT.ICE },
        deep: MAT.ICE, shore: MAT.GRAVEL, tint: 0.6 });
    defAlienStyle('comet', {
        land: 1600, sea: 200, detail: 180, rough: 50, fine: 9, ridge: 300,
        ridgePow: 3, crater: 1.2, crevasse: 200,
        mats: { ice: MAT.ICE, snow: MAT.SNOW, dust: MAT.ASH, rock: MAT.ICE,
                ridge: MAT.ICE, grass: MAT.SNOW, water: MAT.ICE },
        deep: MAT.ICE, shore: MAT.SNOW, tint: 0.7 });

    // Planet type to style. Anything not named here falls back to the painter
    // family the descriptor carries (terrestrial / rocky / icy / volcanic / gas).
    // i18n-ignore: planet type ids
    const ALIEN_TYPE_STYLE = {
        desert: 'desert', rainforest: 'rainforest', ocean: 'ocean',
        acid_ocean: 'acid_ocean', tundra: 'tundra', ice: 'icy',
        mercurian: 'mercurian', sub_mercurian: 'mercurian', dwarf: 'icy',
        mega_iron: 'mega_iron', carbon: 'carbon', diamond: 'diamond',
        plasma: 'plasma', magnetar: 'magnetar', quark_planet: 'quark_planet',
        rogue: 'rogue', chthonian: 'chthonian',
        lava_ocean: 'volcanic', magma_planet: 'volcanic',
        earth_like: 'terrestrial', habitable: 'terrestrial',
        sub_earth: 'terrestrial', super_earth: 'terrestrial',
        centaur: 'irregular', planetesimal: 'irregular',
        c_type_asteroid: 'irregular', s_type_asteroid: 'irregular',
        m_type_asteroid: 'irregular', trojan_asteroid: 'irregular',
        asteroid: 'irregular', rocky: 'rocky', carbonaceous: 'irregular',
        irregular: 'irregular',
        comet: 'comet', short_period_comet: 'comet', long_period_comet: 'comet'
    };

    // A number in 0..1 out of a seed and a channel, for the per-world jitter.
    function alienHash(seed, k) {
        const n = Math.sin((seed + 1) * 12.9898 + k * 78.233) * 43758.5453;
        return n - Math.floor(n);
    }

    // The style this world is walked in, worked out once per landing and hung
    // on the field function itself (the field is rebuilt on every landing, so
    // nothing has to invalidate this).
    function alienStyle(field) {
        if (field._style) return field._style;
        const meta = field.meta || {};
        const base = ALIEN_STYLES[ALIEN_TYPE_STYLE[meta.type]] ||
                     ALIEN_STYLES[meta.surface] || ALIEN_STYLES.rocky;
        const st = Object.assign({}, base);
        const seed = meta.seed || 0;
        // The same style is never the same world twice: one planet's ranges are
        // half again as high as another's, one is stepped where another is
        // smooth, one is combed into dunes and another is not.
        const h = (k) => alienHash(seed, k);
        st.land   = st.land * (0.65 + h(1) * 0.85);
        st.sea    = st.sea * (0.7 + h(2) * 0.7);
        st.ridge  = st.ridge * (0.4 + h(3) * 1.4);
        st.detail = st.detail * (0.7 + h(4) * 0.8);
        st.rough  = st.rough * (0.6 + h(5) * 1.0);
        // Terracing and dunes are things a world either has or has not, so they
        // are rolled for rather than scaled: about half the worlds that could be
        // stepped are stepped, and the step is its own height.
        st.terrace = (st.terrace && h(6) < 0.55) ? st.terrace * (0.6 + h(7)) : 0;
        st.dune    = st.dune ? st.dune * (0.5 + h(8) * 1.2) : (h(9) < 0.12 ? 22 : 0);
        st.duneF   = st.duneF * (0.6 + h(10) * 1.1);
        st.crevasse = st.crevasse * (0.5 + h(11) * 1.2);
        st.crater  = st.crater * (0.6 + h(12) * 0.9);
        // Which way the dunes and the strata run on this world.
        st.grain   = h(13) * Math.PI;
        field._style = st;
        return st;
    }

    // The whole column, off one sample of the planet's own field. Returns the
    // same shape sampleColumn does, so the two are interchangeable.
    function alienColumn(o, x, z, field) {
        const ts = WORLD_TILE_SIZE;
        const info = field(x / ts, z / ts);
        if (!info) return null;
        const st = alienStyle(field);

        const sea = (typeof info.seaLevel === 'number') ? info.seaLevel : 0.5;
        const d = info.e - sea;
        let h = SEA_LEVEL + d * (d >= 0 ? st.land : st.sea);
        // The metre-scale roughness underfoot. Most of it is the planet's OWN
        // field carried on past the five octaves the picture stops at, so the
        // ground is rough the way this world is rough; the perlin under it only
        // fills in below the resolution even that reaches.
        const n = shapeAt(x, z);
        const det = (typeof info.detail === 'number') ? info.detail - 0.5 : 0;
        h += det * st.detail;
        h += n.c * st.fine + n.b * st.rough;

        // Ridges: the fold where the hill field crosses zero becomes a crest,
        // and it only bites on ground the heightmap already raised, so a range
        // stands where the picture drew high country and the plains stay plains.
        if (st.ridge && d > 0) {
            h += st.ridge * Math.pow(n.ridge, st.ridgePow) * Math.min(1, d * 4);
        }
        // Dunes and wind streaks: parallel crests combed across the world one
        // way, which is what a desert or an ash plain reads as from the ground.
        if (st.dune) {
            const u = x * Math.cos(st.grain) + z * Math.sin(st.grain);
            h += st.dune * Math.sin(u * st.duneF + n.a * 3.1);
        }
        // Terraces: strata, mesas and the steps a cooling crust shrank into.
        if (st.terrace) {
            const q = Math.round(h / st.terrace) * st.terrace;
            h += (q - h) * st.terraceMix;
        }
        // Chasms, cut along the fracture lines the picture cracked the ice with.
        if (st.crevasse && info.fracture) {
            h -= st.crevasse * info.fracture * info.fracture;
        }

        // A crater field, where the picture shows one: the floor dropped, the
        // rim thrown up around it, and the plain outside untouched.
        if (info.crater && st.crater) {
            const t = info.crater;                      // 0 at the rim, 1 dead centre
            if (t > 0) {
                const rim = Math.exp(-Math.pow((t - 0.12) / 0.1, 2));
                h += (ALIEN_CRATER_RIM * rim - ALIEN_CRATER_D * t * t) * st.crater;
            }
        }

        // What is on top. The band is the picture's own reading of the place, so
        // a beach is where it painted sand and the snow line is where it painted
        // white, and none of it has to be guessed at twice. What that band is
        // MADE of is the style's business: white on an ice moon is ice, white on
        // a salt desert is salt.
        const band = info.band || 'rock';
        const mats = st.mats || M_EARTH;
        let mat;
        if (h < SEA_LEVEL - 40)      mat = st.deep;
        else if (h < SEA_LEVEL)      mat = st.shore;
        else                         mat = mats[band] || mats.rock || MAT.ROCK;
        // Open melt: on a world whose crust is cracked the fissures run molten
        // rather than merely dark, and they run where the picture glows.
        if (st.lava && info.crack > 0.78 && h >= SEA_LEVEL) mat = MAT.LAVA;

        // ...and its colour, which is the world's own. A biome that is the same
        // from pole to pole would be one flat sheet of paint, so the ground is
        // shaded off the block it is made of: ice whitens, basalt darkens, iron
        // greys, and nothing has to name a colour twice.
        const wx = Math.floor(x / ts), wy = Math.floor(z / ts);
        const own = sampleBiomeAt(wx, wy);
        const c = VoxelField.hexRGB(own.color || '#90ee90');
        let r = c.r, g = c.g, b = c.b;
        const blk = MATERIALS[mat];
        if (blk && blk.rgb) {
            const k = st.tint;
            r += (blk.rgb.r - r) * k; g += (blk.rgb.g - g) * k; b += (blk.rgb.b - b) * k;
        }
        // A little of the height back into the paint, so a slope reads as one.
        const shade = 1 + det * 0.16;
        r *= shade; g *= shade; b *= shade;
        if (band === 'forest') { r *= 0.78; g *= 0.82; b *= 0.78; }

        o.h = h; o.mat = mat; o.road = false; o.prof = profileFor(own.name);
        o.water = -Infinity;
        o.r = _clamp(r, 0, 1); o.g = _clamp(g, 0, 1); o.b = _clamp(b, 0, 1);
        return o;
    }

    // How much of a column belongs to the tower's plinth: 1 inside it, falling
    // to 0 across the ramp, 0 out in the country. Cheap: a box test in world
    // squares, and nearly every column in the world leaves on the first line.
    function omegaPadAt(gx, gz) {
        const half = OMEGA_SPAN / 2;
        const cx = OMEGA_TILE.x - (half - 1) + half;
        const cz = OMEGA_TILE.y - (half - 1) + half;
        const dx = Math.abs(gx - cx) - half;
        const dz = Math.abs(gz - cz) - half;
        const d = Math.max(dx, dz);
        if (d >= OMEGA_RAMP) return 0;
        if (d <= 0) return 1;
        const t = 1 - d / OMEGA_RAMP;
        return t * t * (3 - 2 * t);          // eased, so the ramp has no crease
    }
    // How far ordinary dry ground stands above that. The sea is one endless
    // sheet at sea level, so a hole dug deeper than this would show water at
    // the bottom of it; eleven metres of freeboard is enough for any cellar
    // anyone digs by hand, and VoxelTerrain hides the sheet outright whenever
    // there is no sea within sight of the camera.
    const GROUND_BASE = 44;
    // How the sea floor falls away from a shore. Above 1 the drop is slow at
    // first and steep further out, which is what makes a beach a beach instead
    // of a ramp: a shallow shelf you can wade, and then the edge of the shelf.
    const SHORE_POW  = 2.6;
    const BERM_H     = 9;       // the dry sand ridge the tide throws up
    const BEACH_TOP  = 30;      // sand carries this far above the water line

    // The two tints altitude lays over a biome's own colour, in the same space
    // the vertex colours are in.
    const ROCK_RGB = srgbRGB(0x6b6b73);
    const SNOW_RGB = srgbRGB(0xfdfdff);

    const _shape = { a: 0, b: 0, c: 0, ridge: 0 };
    function shapeAt(x, z) {
        const a = _fbm(x * N_LAND_F + 11.3, z * N_LAND_F -  7.1, 3, 2.0, 0.5);
        const b = _fbm(x * N_HILL_F -  3.7, z * N_HILL_F +  5.9, 3, 2.0, 0.5);
        const c = _fbm(x * N_FINE_F + 21.4, z * N_FINE_F +  2.2, 2, 2.0, 0.5);
        _shape.a = a; _shape.b = b; _shape.c = c;
        // Ridged noise: the fold where the hill field crosses zero becomes a
        // crest instead of a flat, which is what turns blobs into a range.
        _shape.ridge = 1 - Math.abs(b);
        return _shape;
    }

    const TERRAIN = {};
    function defTerrain(key, o) {
        TERRAIN[key] = Object.assign({
            key,
            base: 0,          // flat offset, world units
            land: 0,          // amplitude on the kilometre-scale field
            hill: 0,          // amplitude on the hill field
            ridge: 0,         // amplitude on the ridged fold of the hill field
            ridgePow: 2,
            fine: 0,          // metre-scale roughness
            massif: 0,        // multiplies the world map's own mountain envelope
            dune: 0,          // parallel dune crests (deserts, back beaches)
            terrace: 0,       // quantise the relief to this step (mesas, strata)
            terraceMix: 0,
            cone: 0, crater: 0,          // a volcano's own shape
            island: 1,        // how much of an island rise this biome takes
            water: false,     // is the square itself water
            abs: null,        // absolute bed height (the open sea)
            depth: 0,         // bed depth under the surrounding land (lakes, rivers)
            poolTop: null,    // standing water this far under the land around it
            surface: MAT.GRASS,
            sub: MAT.DIRT,
            cliff: MAT.ROCK,
            cliffAt: 1.25,    // grade, as a multiple of this profile's own
                              // typical grade, above which bare rock shows
            strata: false,    // banded rock under the surface
            flat: false,      // never given relief of its own (towns, roads)
            // What the rock UNDER the soil actually is, once you are deep
            // enough to be out of the subsoil: granite under a mountain,
            // basalt under a volcano, limestone under a green field. It is
            // what a cave wall and the side of a dug shaft are made of.
            bed: MAT.ROCK,
            hot: 0,           // how readily melt shows: 0 nowhere, 1 a volcano
        }, o || {});
        return TERRAIN[key];
    }

    defTerrain('plain',    { land: 8,  hill: 16, fine: 4, bed: MAT.LIMESTONE });
    defTerrain('meadow',   { land: 6,  hill: 11, fine: 3, bed: MAT.LIMESTONE });
    defTerrain('field',    { land: 4,  hill: 7,  fine: 2, bed: MAT.LIMESTONE });
    defTerrain('forest',   { land: 12, hill: 24, fine: 6, bed: MAT.LIMESTONE });
    defTerrain('jungle',   { land: 16, hill: 34, fine: 9 });
    defTerrain('taiga',    { land: 14, hill: 30, fine: 7 });
    defTerrain('steppe',   { land: 10, hill: 18, fine: 4 });
    defTerrain('savannah', { land: 10, hill: 20, fine: 5 });
    defTerrain('hills',    { land: 34, hill: 64, ridge: 34, fine: 8, cliffAt: 1.3,
                             bed: MAT.GRANITE });
    defTerrain('mountain', { massif: 1, hill: 46, ridge: 120, ridgePow: 2.2, fine: 15,
                             cliffAt: 1.05, surface: null, sub: MAT.ROCK, bed: MAT.GRANITE });
    defTerrain('volcano',  { cone: 300, crater: 70, hill: 30, ridge: 40, fine: 12,
                             surface: MAT.ASH, sub: MAT.ASH, cliffAt: 1.1,
                             bed: MAT.BASALT, hot: 1 });
    defTerrain('canyon',   { land: 26, hill: 58, terrace: 15, terraceMix: 0.9, fine: 5,
                             strata: true, surface: MAT.SAND, sub: MAT.CLAY,
                             cliff: MAT.CLAY, cliffAt: 0.95, bed: MAT.SANDSTONE });
    defTerrain('badlands', { land: 20, hill: 44, terrace: 11, terraceMix: 0.92, fine: 4,
                             strata: true, surface: MAT.CLAY, sub: MAT.CLAY, cliffAt: 0.95,
                             bed: MAT.SANDSTONE });
    defTerrain('desert',   { land: 14, hill: 16, dune: 30, fine: 3,
                             surface: MAT.SAND, sub: MAT.SAND, cliff: MAT.SAND, cliffAt: 99,
                             bed: MAT.SANDSTONE });
    defTerrain('saltflat', { land: 2,  hill: 2,  fine: 1, surface: MAT.SALT, sub: MAT.CLAY });
    defTerrain('beach',    { base: 6, land: 3, hill: 5, dune: 9, fine: 2,
                             surface: MAT.SAND, sub: MAT.SAND, cliff: MAT.SAND, cliffAt: 99 });
    defTerrain('swamp',    { base: -9,  land: 5, hill: 9, fine: 4, poolTop: -3,
                             surface: MAT.MUD, sub: MAT.CLAY, cliff: MAT.CLAY });
    defTerrain('mangrove', { base: -12, land: 4, hill: 8, fine: 4, poolTop: -4,
                             surface: MAT.MUD, sub: MAT.CLAY, cliff: MAT.CLAY });
    defTerrain('tundra',   { land: 10, hill: 20, fine: 5, surface: MAT.SNOW, sub: MAT.DIRT });
    defTerrain('ice',      { land: 12, hill: 26, fine: 6, surface: MAT.SNOW, sub: MAT.ICE,
                             cliff: MAT.ICE });
    defTerrain('ash',      { land: 12, hill: 26, ridge: 20, fine: 7,
                             surface: MAT.ASH, sub: MAT.ASH, bed: MAT.BASALT, hot: 0.5 });
    defTerrain('rocky',    { land: 18, hill: 40, ridge: 26, fine: 9,
                             surface: MAT.ROCK, sub: MAT.ROCK, cliffAt: 1.1 });
    defTerrain('weird',    { land: 16, hill: 34, ridge: 26, fine: 8 });
    defTerrain('farlands', {
        land: 45, hill: 85, ridge: 130, ridgePow: 1.8, terrace: 25, terraceMix: 0.85,
        fine: 16, surface: null, sub: MAT.OBSIDIAN, bed: MAT.BASALT, hot: 0.7,
        cliff: MAT.GLOWSTONE, cliffAt: 0.95
    });
    // Anywhere people have built or paved: dead level, so a house sits on the
    // ground and a carriageway does not ripple.
    defTerrain('settled',  { flat: true, island: 0.35 });
    defTerrain('road',     { flat: true, island: 0.35 });
    // Water. The open sea has an absolute floor; a lake or a river is cut into
    // whatever land it crosses, so their beds are depths and not heights.
    defTerrain('sea',      { water: true, abs: WATER_LEVEL_Y, hill: 26, fine: 8,
                             surface: MAT.SAND, sub: MAT.CLAY, island: 0 });
    defTerrain('lake',     { water: true, depth: 46, hill: 9, fine: 3, poolTop: -4,
                             surface: MAT.SAND, sub: MAT.CLAY, island: 0 });

    // Name to profile. First pattern to match wins, so the specific names come
    // before the families they belong to.
    const TERRAIN_RULES = [
        [/^farland|^glitch|^singularity|^quantum|^null matrix|^eldritch fault|^infinite cascade/, 'farlands'],
        [/^(road|highway|bridge)/, 'road'],
        [/^(city|burg|village|villa|houses|docks|farm|park|town|castle|temple|church|office|factory|laboratory|arena|metro|train|spacecenter|graveyard|abandoned|ruins)/, 'settled'],
        [/^seabed|^ocean/,                              'sea'],
        [/^lake|^caveflooded|^cistern/,                 'lake'],
        [/^beach/,                                      'beach'],
        [/^saltflats|^saltworks/,                       'saltflat'],
        [/^volcano|^lavatube/,                          'volcano'],
        [/^canyon/,                                     'canyon'],
        [/^badlands/,                                   'badlands'],
        [/^mountain|^highlands/,                        'mountain'],
        [/^desert|^dune/,                               'desert'],
        [/^swamp/,                                      'swamp'],
        [/^mangrove|^riverbank/,                        'mangrove'],
        [/^tundra|^permafrost/,                         'tundra'],
        [/^ice$|^snow|^caveice|^cavefrozen/,            'ice'],
        [/^jungle|^foresttropical|^bamboo/,             'jungle'],
        [/^taiga|^forestice/,                           'taiga'],
        [/^forest|^spiritwoods|^mushroom|^fungal/,      'forest'],
        [/^steppe/,                                     'steppe'],
        [/^savannah/,                                   'savannah'],
        [/^fields|^meadows/,                            'field'],
        [/^mines|^mineshaft|^crystals|^crystalcavern|^cave|^crypt|^catacombs|^barrow|^sewer|^dungeon|^underdark|^underforge|^lair|^oubliette|^seagrotto|^smugglertunnel/, 'rocky'],
        [/^hell|^scorch|^landfill/,                     'ash'],
        [/^eldritch|^fairy|^abstract|^digital|^dreamscape|^limbo|^heaven|^space|^alienplanet/, 'weird'],
    ];

    const _profileCache = new Map();
    function profileFor(biomeName) {
        const key = biomeName || '';
        let p = _profileCache.get(key);
        if (p) return p;
        const n = key.toLowerCase();
        p = TERRAIN.plain;
        for (let i = 0; i < TERRAIN_RULES.length; i++) {
            if (TERRAIN_RULES[i][0].test(n)) { p = TERRAIN[TERRAIN_RULES[i][1]]; break; }
        }
        _profileCache.set(key, p);
        return p;
    }

    // -------------------------------------------------------------------------
    // Islands
    //
    // A square with the sea on most sides is an island, and an island is not a
    // flat raft: it rises toward its middle and meets the water in a beach the
    // whole way round. The rise is one number per square, so the ordinary
    // four-corner blend turns it into a dome without a seam anywhere.
    // -------------------------------------------------------------------------
    const _islandCache = new Map();
    // Numeric key: this is read four times per column and a string built per
    // read costs more than everything else the lookup does.
    const tileKey = (wx, wy) => (wx + 1024) * 65536 + (wy + 1024);
    function islandRiseAt(wx, wy) {
        const key = tileKey(wx, wy);
        const hit = _islandCache.get(key);
        if (hit !== undefined) return hit;
        let rise = 0;
        const own = profileFor(sampleBiomeAt(wx, wy).name);
        if (!own.water && own.island > 0) {
            let sea = 0;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (!dx && !dy) continue;
                    if (profileFor(sampleBiomeAt(wx + dx, wy + dy).name).water) sea++;
                }
            }
            // An ordinary coastline has three wet sides and must stay where it
            // is, or every shore in the world would be a bluff and there would
            // be nowhere for the sand to lie. Only a square the sea has nearly
            // surrounded is an island, and that is what rises.
            const f = Math.max(0, (sea / 8 - 0.4) / 0.6);
            rise = Math.pow(f, 1.4) * 110 * own.island;
        }
        if (_islandCache.size > 20000) _islandCache.clear();
        _islandCache.set(key, rise);
        return rise;
    }

    // -------------------------------------------------------------------------
    // The islands nobody drew
    //
    // The world map's own islands are the squares the sea has nearly surrounded
    // (islandRiseAt above). Out in the open ocean there is nothing at all for
    // hundreds of squares together, and that is not what an ocean looks like
    // from a boat: it looks like mostly nothing with the occasional rock,
    // sandbar or wooded islet in it.
    //
    // So a rare open-sea square carries an island of its own. Everything about
    // one - whether it is there at all, where in the square it stands, how far
    // it reaches and how high it rises - is a hash of that square, so nothing
    // is stored and it is in the same place every time. The rise is radial in
    // WORLD units rather than per-square, which is what lets an islet be far
    // smaller than the square it sits in while a big one still reads as a
    // landmass with a shoreline of its own.
    // -------------------------------------------------------------------------
    const OCEAN_ISLE_ONE_IN = 30;      // open-sea squares that carry one
    // r: how far the land reaches from its middle, in world units.
    // rise: how high that middle stands OVER SEA LEVEL.
    // w: this size's share of the roll.
    const OCEAN_ISLE_SIZES = [
        { r: 58,  rise: 14, w: 0.32 },   // a rock with a bird on it
        { r: 116, rise: 26, w: 0.29 },   // a sandbar
        { r: 198, rise: 48, w: 0.22 },   // an islet with trees on it
        { r: 312, rise: 84, w: 0.12 },   // an island worth landing on
        { r: 448, rise: 140, w: 0.05 },  // a proper one, with a hill in the middle
    ];
    // The biggest r above must stay under a world square, or a point could be
    // reached by an island two squares away and the 3x3 scan below would miss
    // its edge. Nothing enforces it but this line and the sizes over it.
    const OCEAN_ISLE_MAX_R = 448;

    const _oceanIsleCache = new Map();
    // The island a sea square carries, or null. { cx, cz, r, rise, size } in
    // world units, `size` being the index into the table above (which is what
    // decides whether anything is built or grown on it).
    function oceanIslandOf(wx, wy) {
        const key = tileKey(wx, wy);
        const hit = _oceanIsleCache.get(key);
        if (hit !== undefined) return hit;
        let out = null;
        // Only the open sea. A coastal square is already shaped by the shore
        // blend and an island dropped into it would be a lump on a beach.
        if (profileFor(sampleBiomeAt(wx, wy).name).water &&
            sqHash(wx, wy, 8101) < 1 / OCEAN_ISLE_ONE_IN) {
            let open = true;
            for (let dy = -1; dy <= 1 && open; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (!dx && !dy) continue;
                    if (!profileFor(sampleBiomeAt(wx + dx, wy + dy).name).water) { open = false; break; }
                }
            }
            if (open) {
                let r = sqHash(wx, wy, 8102), pick = 0;
                for (let i = 0; i < OCEAN_ISLE_SIZES.length; i++) {
                    r -= OCEAN_ISLE_SIZES[i].w;
                    if (r <= 0) { pick = i; break; }
                    pick = i;
                }
                const S = OCEAN_ISLE_SIZES[pick];
                const ts = WORLD_TILE_SIZE;
                // Kept clear of the square's edges by its own reach, so it never
                // straddles a square whose neighbour is not open water.
                const room = Math.max(0, ts * 0.5 - S.r) * 0.9;
                out = {
                    cx: (wx + 0.5) * ts + (sqHash(wx, wy, 8103) - 0.5) * 2 * room,
                    cz: (wy + 0.5) * ts + (sqHash(wx, wy, 8104) - 0.5) * 2 * room,
                    r: S.r, rise: S.rise, size: pick
                };
            }
        }
        if (_oceanIsleCache.size > 20000) _oceanIsleCache.clear();
        _oceanIsleCache.set(key, out);
        return out;
    }

    // Every island that can reach into a square, its own and its neighbours'.
    // Squares with no island anywhere near remember that too, which is what
    // keeps the check off the hot path for the rest of the world - and the rest
    // of the world is nearly all of it.
    //
    // This is riverNearAt's trick, and it is here for the same reason: every
    // column in the world asks this question, and asking it as nine lookups
    // into the per-square memo cost thirteen per cent of a column ANYWHERE,
    // including in the middle of a continent a thousand squares from the sea.
    // One lookup that answers "nothing here" costs nothing.
    const _isleNearCache = new Map();
    function oceanIslandsNear(wx, wy) {
        const key = tileKey(wx, wy);
        let near = _isleNearCache.get(key);
        if (near !== undefined) return near;
        near = null;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const isl = oceanIslandOf(wx + dx, wy + dy);
                if (isl) (near || (near = [])).push(isl);
            }
        }
        if (_isleNearCache.size > 20000) _isleNearCache.clear();
        _isleNearCache.set(key, near);
        return near;
    }

    // How high the ground stands at a point because of an open-ocean island, as
    // a fraction (0 at the edge of the island, 1 at its middle) and the island
    // it belongs to. Null out at sea, which is nearly everywhere.
    const _isleHit = { isl: null, k: 0 };
    function oceanIslandAt(x, z) {
        const ts = WORLD_TILE_SIZE;
        const near = oceanIslandsNear(Math.floor(x / ts), Math.floor(z / ts));
        if (!near) return null;
        let best = null, bestK = 0;
        for (let i = 0; i < near.length; i++) {
            const isl = near[i];
            const ddx = x - isl.cx, ddz = z - isl.cz;
            const d2 = ddx * ddx + ddz * ddz;
            if (d2 >= isl.r * isl.r) continue;
            const t = 1 - Math.sqrt(d2) / isl.r;
            // Eased, so the middle is a rounded top and the edge meets the
            // sea floor without a crease anywhere.
            const k = t * t * (3 - 2 * t);
            if (k > bestK) { bestK = k; best = isl; }
        }
        if (!best) return null;
        _isleHit.isl = best; _isleHit.k = bestK;
        return _isleHit;
    }

    // -------------------------------------------------------------------------
    // The height one biome would give a point, on its own
    //
    // Every corner of the blend is asked this at the SAME world position, with
    // the SAME three noise samples, so two neighbouring biomes agree everywhere
    // along their border and the blend between them is seamless.
    // -------------------------------------------------------------------------
    function profileHeight(p, x, z, wx, wy, n, gx, gz) {
        if (p.flat) return GROUND_BASE + islandRiseAt(wx, wy) * 0.5;
        let h = GROUND_BASE + p.base;
        if (p.massif) {
            // The world map's own mountain envelope decides where a range is;
            // the ridged fold decides what it looks like once you are in it.
            const env = noiseHeight(gx, gz, wx, wy) * p.massif;
            h += env * (0.42 + 0.58 * Math.pow(n.ridge, 1.5));
        }
        h += p.land * n.a + p.hill * n.b;
        if (p.ridge) h += p.ridge * Math.pow(n.ridge, p.ridgePow);
        if (p.dune) {
            // Long parallel crests running north-east, wandering with the
            // kilometre-scale field so a desert is not corduroy.
            const phase = n.a * 7 + (x + z) * 0.0042;
            h += p.dune * (0.5 + 0.5 * Math.sin(phase)) * (0.65 + 0.35 * n.b);
        }
        if (p.terrace > 0) {
            const q = Math.round(h / p.terrace) * p.terrace;
            h += (q - h) * p.terraceMix;
        }
        if (p.cone > 0) {
            const cx = (wx + 0.5) * WORLD_TILE_SIZE, cz = (wy + 0.5) * WORLD_TILE_SIZE;
            const r = Math.min(1, Math.hypot(x - cx, z - cz) / (WORLD_TILE_SIZE * 0.5));
            const k = 1 - r;
            h += p.cone * k * k;
            if (r < 0.16) h -= p.crater * (1 - r / 0.16);
        }
        h += p.fine * n.c;
        h += islandRiseAt(wx, wy);
        return h;
    }

    // -------------------------------------------------------------------------
    // Rivers
    //
    // The world map marks which squares a river runs through but not which way
    // it goes, so a square's channel is worked out from the squares around it:
    // the water leaves by every edge that carries on into another river square
    // or into the open sea. Each leg is a curve from the middle of that edge to
    // the middle of the square, bowed to one side by a number derived from the
    // square's own coordinates - which means the meander is stable, and two
    // neighbouring squares always meet at the same point on their shared edge.
    // -------------------------------------------------------------------------
    const RIVER_SEG      = 9;     // samples per leg of the channel
    const RIVER_BANK     = 46;    // how far the muddy bank reaches past the water
    // How wide a channel actually runs, in world units from its centre line.
    // A world square is WORLD_TILE_SIZE (500) across, so a river of 70-130
    // either side is a real river - a quarter to a half of the square, wide
    // enough that the far bank is somewhere to swim to and a bridge is a
    // bridge. The old 20-36 was a stream you could step over, which is not
    // what the world map's blue lines are meant to be.
    const RIVER_HALF_MIN = 70;
    const RIVER_HALF_VAR = 60;
    const RIVER_DEEP_MIN = 26;
    const RIVER_DEEP_VAR = 16;
    const _riverPathCache = new Map();
    const _riverNearCache = new Map();
    const _EDGE = { n: [0, -0.5], s: [0, 0.5], w: [-0.5, 0], e: [0.5, 0] };

    function riverPathAt(wx, wy) {
        const key = tileKey(wx, wy);
        let path = _riverPathCache.get(key);
        if (path !== undefined) return path;
        path = null;
        if (isRiverTile(wx, wy)) {
            const ts   = WORLD_TILE_SIZE;
            const cx   = (wx + 0.5) * ts, cz = (wy + 0.5) * ts;
            const seed = hash3(wx, wy, 7);
            let half   = RIVER_HALF_MIN + seed * RIVER_HALF_VAR;
            let depth  = RIVER_DEEP_MIN + seed * RIVER_DEEP_VAR;
            // Where the river reaches open water it spreads into an estuary.
            let mouth = false;
            for (const d of ['n', 's', 'e', 'w']) {
                const e = _EDGE[d];
                const nb = sampleBiomeAt(wx + e[0] * 2, wy + e[1] * 2);
                if (profileFor(nb.name).water && !isRiverTile(wx + e[0] * 2, wy + e[1] * 2)) mouth = true;
            }
            if (mouth) { half *= 1.55; depth *= 1.3; }

            const links = riverLinksAt(wx, wy);
            const pts = [];
            const bez = (ax, az, bx, bz, ccx, ccz) => {
                for (let i = 0; i <= RIVER_SEG; i++) {
                    const t = i / RIVER_SEG, u = 1 - t;
                    pts.push(u * u * ax + 2 * u * t * ccx + t * t * bx,
                             u * u * az + 2 * u * t * ccz + t * t * bz);
                }
            };
            if (!links.length) {
                // A spring or a pond: no channel, just the pool in the middle.
                pts.push(cx, cz);
                half *= 1.6;
            } else {
                links.forEach((d, i) => {
                    const e  = _EDGE[d];
                    const ex = (wx + 0.5 + e[0]) * ts, ez = (wy + 0.5 + e[1]) * ts;
                    // Bow the leg to one side. Perpendicular to the leg, by an
                    // amount fixed by this square, so the wander is repeatable.
                    const dx = cx - ex, dz = cz - ez;
                    const bow = (hash3(wx, wy, 31 + i) - 0.5) * ts * 0.34;
                    const mx  = (ex + cx) * 0.5 - dz / ts * bow;
                    const mz  = (ez + cz) * 0.5 + dx / ts * bow;
                    bez(ex, ez, cx, cz, mx, mz);
                });
            }
            path = { pts, half, depth };
        }
        if (_riverPathCache.size > 8000) _riverPathCache.clear();
        _riverPathCache.set(key, path);
        return path;
    }

    // Every channel that can reach into a square, its own and its neighbours'.
    // Squares with no river anywhere near remember that too, which is what keeps
    // the check off the hot path for the rest of the world.
    function riverNearAt(wx, wy) {
        const key = tileKey(wx, wy);
        let near = _riverNearCache.get(key);
        if (near !== undefined) return near;
        near = null;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const path = riverPathAt(wx + dx, wy + dy);
                if (!path) continue;
                (near || (near = [])).push(path);
            }
        }
        if (_riverNearCache.size > 20000) _riverNearCache.clear();
        _riverNearCache.set(key, near);
        return near;
    }

    // Distance from a point to the nearest channel, with that channel's size.
    function riverAt(x, z, wx, wy) {
        const near = riverNearAt(wx, wy);
        if (!near) return null;
        let best = null, bestD = Infinity;
        for (let k = 0; k < near.length; k++) {
            const path = near[k], pts = path.pts;
            if (pts.length === 2) {
                const d = Math.hypot(x - pts[0], z - pts[1]);
                if (d < bestD) { bestD = d; best = path; }
                continue;
            }
            for (let i = 0; i + 3 < pts.length; i += 2) {
                const ax = pts[i], az = pts[i + 1], bx = pts[i + 2], bz = pts[i + 3];
                const vx = bx - ax, vz = bz - az;
                const len2 = vx * vx + vz * vz;
                let t = len2 > 0 ? ((x - ax) * vx + (z - az) * vz) / len2 : 0;
                t = t < 0 ? 0 : t > 1 ? 1 : t;
                const px = ax + vx * t - x, pz = az + vz * t - z;
                const d = Math.sqrt(px * px + pz * pz);
                if (d < bestD) { bestD = d; best = path; }
            }
        }
        if (!best || bestD > best.half + RIVER_BANK) return null;
        return { d: bestD, half: best.half, depth: best.depth };
    }

    function clearTerrainCaches() {
        _profileCache.clear();
        _islandCache.clear();
        _oceanIsleCache.clear();
        _isleNearCache.clear();
        _sewerCache.clear();
        _riverPathCache.clear();
        _riverNearCache.clear();
    }


    // =========================================================================
    // VoxelEdits
    //
    // Every difference between the world as generated and the world as it now
    // stands, kept per world map tile as a flat integer keyed map. Air counts
    // as an edit (that is the whole point of a hole), so the value stored is a
    // material id and MAT.AIR is a legitimate one.
    // =========================================================================
    class VoxelEdits {
        constructor() {
            this._tiles = new Map();   // "wx,wy" -> { cells: Map, cols: Map }
            this.count  = 0;
            // A dug world is cheap but not free: past this many cubes the oldest
            // tile of edits is dropped rather than letting a save grow forever.
            this.limit  = 120000;
            this._order = [];
        }

        static key(lx, lz, vy) {
            return (lx * VOX.PER_TILE + lz) * 4096 + (vy - VOX.MIN_Y);
        }
        static col(lx, lz) { return lx * VOX.PER_TILE + lz; }

        _tile(wx, wy, make) {
            const k = wx + ',' + wy;
            let t = this._tiles.get(k);
            if (!t && make) {
                t = { cells: new Map(), cols: new Map() };
                this._tiles.set(k, t);
                this._order.push(k);
                this._prune();
            }
            return t;
        }

        _prune() {
            while (this.count > this.limit && this._order.length > 1) {
                const k = this._order.shift();
                const t = this._tiles.get(k);
                if (!t) continue;
                this.count -= t.cells.size;
                this._tiles.delete(k);
            }
        }

        // Every read starts with the size test: a world nobody has dug in is
        // the common case, and it must not pay for a string key per column.
        has(wx, wy) { return this._tiles.size > 0 && this._tiles.has(wx + ',' + wy); }

        get(wx, wy, lx, lz, vy) {
            if (!this._tiles.size) return undefined;
            const t = this._tiles.get(wx + ',' + wy);
            if (!t) return undefined;
            return t.cells.get(VoxelEdits.key(lx, lz, vy));
        }

        set(wx, wy, lx, lz, vy, mat) {
            const t = this._tile(wx, wy, true);
            const k = VoxelEdits.key(lx, lz, vy);
            if (!t.cells.has(k)) this.count++;
            t.cells.set(k, mat);
            const c = VoxelEdits.col(lx, lz);
            const r = t.cols.get(c);
            if (!r) t.cols.set(c, { min: vy, max: vy });
            else { if (vy < r.min) r.min = vy; if (vy > r.max) r.max = vy; }
        }

        // The vertical span of edits in one column, or null when untouched.
        range(wx, wy, lx, lz) {
            if (!this._tiles.size) return null;
            const t = this._tiles.get(wx + ',' + wy);
            if (!t) return null;
            return t.cols.get(VoxelEdits.col(lx, lz)) || null;
        }

        // Local column indices touched in a tile, for the mesher's detail pass.
        columns(wx, wy) {
            if (!this._tiles.size) return null;
            const t = this._tiles.get(wx + ',' + wy);
            return t ? t.cols : null;
        }

        clear() { this._tiles.clear(); this._order.length = 0; this.count = 0; }

        // --- persistence ----------------------------------------------------
        // Flat number arrays: cheap to write, cheap to read back, and small
        // enough in a save that a few thousand dug cubes cost a few kilobytes.
        save() {
            const out = {};
            for (const [k, t] of this._tiles) {
                if (!t.cells.size) continue;
                const arr = new Array(t.cells.size * 2);
                let i = 0;
                for (const [cell, mat] of t.cells) { arr[i++] = cell; arr[i++] = mat; }
                out[k] = arr;
            }
            return out;
        }

        load(data) {
            this.clear();
            if (!data || typeof data !== 'object') return;
            for (const k of Object.keys(data)) {
                const arr = data[k];
                if (!Array.isArray(arr) || !arr.length) continue;
                const parts = k.split(',');
                const wx = Number(parts[0]), wy = Number(parts[1]);
                if (!isFinite(wx) || !isFinite(wy)) continue;
                for (let i = 0; i + 1 < arr.length; i += 2) {
                    const cell = arr[i] | 0;
                    const vy   = (cell % 4096) + VOX.MIN_Y;
                    const col  = Math.floor(cell / 4096);
                    this.set(wx, wy, Math.floor(col / VOX.PER_TILE), col % VOX.PER_TILE, vy, arr[i + 1] | 0);
                }
            }
        }
    }

    // =========================================================================
    // VoxelField
    //
    // The world as a function. Nothing here is stored except the edits: ask it
    // whether a cube exists and it works the answer out from the world map's
    // biome grid, the mountain noise and the road tags, exactly the way the old
    // height mesh was built, and then lets the edit map have the last word.
    // =========================================================================    // =========================================================================
    // Caves
    //
    // Under every square of the world there is a system of passages, and inside
    // the mountains there is another one wound through the rock itself. It is
    // one continuous network rather than a scatter of pockets: the same field
    // answers everywhere, so a tunnel walked east under a field carries on
    // under the wood next door.
    //
    // HOW IT IS BUILT. A passage is a line on the plan with a height. Each
    // layer takes a smooth 2D noise and keeps the thin band where that noise is
    // near zero: the zero set of a smooth field is a set of winding, branching,
    // endlessly connected curves, which is exactly a tunnel map seen from
    // above. How far inside the band a column is gives the passage its width
    // and its height, so a tunnel is widest along its own centre line and
    // tapers to nothing at its edges. A second noise gives the floor it winds
    // up and down over. Several layers at different depths and different scales
    // cross one another, and the shafts below join them to each other and to
    // the daylight.
    //
    // WHY IT IS BUILT THAT WAY. Everything a column's caves are is decided by a
    // handful of 2D noise reads, taken ONCE per column and remembered
    // (columnCaves). Asking whether a particular cube is air is then a few
    // comparisons, and asking what a whole column contains - which is what the
    // mesher needs, for every column of every chunk - is answered without
    // looking at a single cube. A 3D noise field would have to be sampled per
    // cube, tens of times per column, and could not answer either question
    // without doing so.
    // =========================================================================

    // How much rock is always left between a cave and the open air. Caves are
    // reached through their own shafts, not by falling through the floor of a
    // field, so nothing is ever carved this close to the surface.
    const CAVE_ROOF = 5;
    // ...and this much is always left over bedrock, so no passage bottoms out
    // on the floor of the world.
    const CAVE_FLOOR_CLEAR = 2;

    // The layers. `f` and `yf` are per VOXEL, so a frequency of 0.012 turns the
    // tunnel about every eighty voxels - four hundred units, most of a world
    // square. `depth` is how far under the surface the layer runs when it
    // follows the ground (the mountain layer), `y` where it runs when it does
    // not (the deep ones, which keep their own level whatever is overhead).
    const CAVE_LAYERS = [
        // The shallow gallery: wide, close under the fields, the one most
        // shafts come down into.
        { f: 0.0115, yf: 0.0085, th: 0.062, rad: 3.4, y: -4,  amp: 7,  sx: 0,    sz: 0 },
        // The middle run, tighter and busier, crossing the gallery above it.
        { f: 0.0175, yf: 0.0130, th: 0.052, rad: 2.8, y: -20, amp: 6,  sx: 61.7, sz: -23.4 },
        // The deep road: long, straight-ish, the last thing above the bedrock.
        { f: 0.0080, yf: 0.0060, th: 0.048, rad: 3.9, y: -33, amp: 5,  sx: -37.2, sz: 88.1 },
        // Inside the mountains. This one follows the GROUND rather than a
        // level of its own (`depth`), so it winds through the mass of a
        // mountain at a constant depth under its slopes - and simply is not
        // there where the ground is too low to hold it.
        { f: 0.0140, yf: 0.0100, th: 0.058, rad: 3.1, depth: 16, amp: 9, sx: 140.5, sz: -71.9,
          minTop: 26 }
    ];

    // The rooms: a separate, much broader field. Where it rises past its
    // threshold the passages open out into a chamber, deepest at the middle.
    const CAVERN_F     = 0.0042;
    const CAVERN_TH    = 0.30;
    const CAVERN_RAD   = 13;     // half-height at the very middle of the biggest
    const CAVERN_Y     = -18;

    // The way in. One world square in this many carries a shaft down into the
    // system; where the ground is high enough to be a mountain they are far
    // commoner, which is what makes a mountainside the place you find caves.
    const SHAFT_ONE_IN     = 6;
    const SHAFT_ONE_IN_MTN = 2;
    const SHAFT_RADIUS     = 2.2;   // voxels
    const SHAFT_FLARE      = 3.6;   // how much wider its mouth is than its throat

    // A stable hash of a world square, for the shafts. Nothing about a shaft is
    // stored: the square it belongs to decides where it is and whether it is
    // there at all, so it is in the same place every time this world is walked.
    function sqHash(wx, wy, salt) {
        let h = (wx * 374761393 + wy * 668265263 + (salt || 0) * 2246822519) | 0;
        h = (h ^ (h >>> 13)) * 1274126177;
        return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    }

    // =========================================================================
    // The sewers
    // =========================================================================
    // Under a town there is no cave: there is a sewer, and it is a built thing.
    // A rectilinear grid of brick galleries on ONE level, running unbroken from
    // one side of a city to the other and on into the next city square, at a
    // depth a pick can reach: break the asphalt of a street and keep going and
    // you drop into it, and a tunnel driven sideways out of any hole in town
    // runs into it too.
    //
    // The grid is laid out in ABSOLUTE voxel coordinates rather than per
    // square, so two neighbouring city squares share their galleries instead of
    // meeting at a wall.
    const SEWER_PITCH    = 24;    // voxels between parallel galleries (30 m)
    const SEWER_HALF     = 2;     // half-width of one, in voxels (~6 m across)
    const SEWER_H        = 4;     // headroom, in voxels (5 m)
    // The level the galleries run at, in voxels. GROUND_BASE is what a paved
    // square is levelled to, so this is a fixed depth under every street in the
    // world and a sewer never staircases with the ground over it.
    const SEWER_TOP_Y    = Math.round(GROUND_BASE / VOX.SIZE) - 6;
    // ...but never closer than this to daylight, wherever the ground over a
    // town square happens to sit lower than the paving level.
    const SEWER_MIN_ROOF = 4;

    // Which squares are sewered. A town's own square, and the ring of squares
    // around it: a gallery that stopped dead at the edge of the built-up area
    // could not be reached by digging in from the field next door, and the
    // outfall of a real sewer is outside the town anyway.
    const SEWER_NAMES = /^(city|metro|burg|village|villa|houses|town|docks|office|factory|spacecenter|omegatower)/;
    const _sewerCache = new Map();
    function sewerTileAt(wx, wy) {
        const key = tileKey(wx, wy);
        const hit = _sewerCache.get(key);
        if (hit !== undefined) return hit;
        let on = false;
        for (let dy = -1; dy <= 1 && !on; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (SEWER_NAMES.test((sampleBiomeAt(wx + dx, wy + dy).name || '').toLowerCase())) {
                    on = true; break;
                }
            }
        }
        if (_sewerCache.size > 20000) _sewerCache.clear();
        _sewerCache.set(key, on);
        return on;
    }

    // Is this column inside one of the galleries? Two modulos: the grid is the
    // set of columns near a line of the lattice in either axis, so a crossing
    // is a junction without anything having to say so.
    function sewerGalleryAt(vx, vz) {
        const ox = ((vx % SEWER_PITCH) + SEWER_PITCH) % SEWER_PITCH;
        const oz = ((vz % SEWER_PITCH) + SEWER_PITCH) % SEWER_PITCH;
        const dx = Math.min(ox, SEWER_PITCH - ox);
        const dz = Math.min(oz, SEWER_PITCH - oz);
        return Math.min(dx, dz);
    }

    // -------------------------------------------------------------------------
    // Manholes
    // -------------------------------------------------------------------------
    // A sewer nobody can find is a sewer nobody uses. Digging a street at random
    // until you drop into one is not discovery, it is a lottery, so some of the
    // gallery crossings carry a shaft up to the pavement with an iron cover over
    // it: a cube of plate, plainly not asphalt, sitting in the road.
    //
    // The cover is a BLOCK, not an interaction. Break it - one swing, iron is
    // hard 6 - and the shaft under it is already open all the way down to the
    // gallery. That is the whole mechanism: nothing to press, nothing to learn,
    // and it works the same for a pick, a bumper and a stick of anything else
    // that takes cubes out of the world.
    const MANHOLE_R      = 1;    // voxels either side of the crossing centre
    const MANHOLE_ONE_IN = 5;    // crossings that carry one

    // Is this column inside a manhole shaft? Only at a gallery crossing, which
    // is where both lattice lines meet, and only at some of those.
    function manholeAt(vx, vz) {
        const ox = ((vx % SEWER_PITCH) + SEWER_PITCH) % SEWER_PITCH;
        const oz = ((vz % SEWER_PITCH) + SEWER_PITCH) % SEWER_PITCH;
        const dx = Math.min(ox, SEWER_PITCH - ox);
        const dz = Math.min(oz, SEWER_PITCH - oz);
        if (dx > MANHOLE_R || dz > MANHOLE_R) return false;
        // Which crossing this is, in lattice steps, so every column of the same
        // shaft asks the same question and gets the same answer.
        const cx = Math.round(vx / SEWER_PITCH), cz = Math.round(vz / SEWER_PITCH);
        return sqHash(cx, cz, 8301) < 1 / MANHOLE_ONE_IN;
    }

    // The band a gallery occupies at this column, or null. `ownTop` is the
    // generated surface of the column, which caps how close to daylight the
    // roof may come. `pad` widens the test past the void itself, which is how
    // the brick shell around a gallery is found.
    function sewerBandAt(vx, vz, ownTop, pad) {
        // The square first: it is false for all but a few hundred squares in
        // the world and answers out of a memo, so nothing else here is paid for
        // by the countryside.
        const wx = Math.floor(vx / VOX.PER_TILE), wy = Math.floor(vz / VOX.PER_TILE);
        if (!sewerTileAt(wx, wy)) return null;
        if (sewerGalleryAt(vx, vz) > SEWER_HALF + (pad || 0)) return null;
        const hi = Math.min(SEWER_TOP_Y, ownTop - SEWER_MIN_ROOF);
        const lo = hi - SEWER_H;
        if (lo <= VOX.MIN_Y + CAVE_FLOOR_CLEAR) return null;
        return { lo, hi };
    }


    class VoxelField {
        constructor() {
            this.edits = new VoxelEdits();
            // Bumped on every change; chunk meshes carry the version they were
            // built at so nothing has to be told twice about the same dig.
            this.version = 0;
            // Set by VoxelTerrain so a dig can re-mesh just the patch it hit.
            this.onEdit = null;
            this._col = { h: 0, mat: MAT.GRASS, r: 0.5, g: 0.6, b: 0.4, road: false,
                          prof: null, water: -Infinity };
            this._sand = srgbRGB('#e0d6a8');
            // Generated columns, memoised WHOLE. Meshing, walking, driving and
            // every ray into the ground ask for the same columns over and over,
            // and working one out is the most expensive thing this file does: a
            // four-corner biome blend, a height profile per corner and half a
            // dozen octaves of noise, four microseconds a column.
            //
            // Only the finished HEIGHT used to be kept, so anything that wanted
            // the column itself - which the mesher does, for every column of
            // every patch - paid the whole blend again, and paid it again on
            // every re-mesh: a dig, a change of detail, or simply walking back
            // over ground already crossed. Keeping the column costs a few dozen
            // bytes and saves all of it.
            // Everything a column's caves are, worked out once and kept: the
            // passages through it, the room it may open into and the shaft that
            // may drop through it (see columnCaves). Cleared with the tops.
            this._colCache = new Map();
            this._caveCache = new Map();
        }

        // ---------------------------------------------------------------------
        // Column generation
        // ---------------------------------------------------------------------
        // Blended ground surface at a world-unit position, with the surface
        // material and the colour that goes with it. This is the same corner
        // blend the flat terrain used - four world map tiles weighted bilinearly
        // - so coastlines, mountains and roads land exactly where the 2D map
        // says they do. `out` is reused; copy anything you need to keep.
        sampleColumn(x, z, out) {
            const o  = out || this._col;
            const ts = WORLD_TILE_SIZE;
            // On another world the whole of what follows - biomes, rivers,
            // roads, shorelines, the Omega Tower - belongs to Earth and none of
            // it applies. The ground comes off the planet's own field instead.
            const alien = getAlienTerrain();
            if (alien) {
                const got = alienColumn(o, x, z, alien);
                if (got) return got;
            }
            const gx = x / ts, gz = z / ts;

            const x0 = Math.floor(gx - 0.5), x1 = x0 + 1;
            const z0 = Math.floor(gz - 0.5), z1 = z0 + 1;
            const tx = gx - 0.5 - x0, tz = gz - 0.5 - z0;
            const w00 = (1 - tx) * (1 - tz), w10 = tx * (1 - tz);
            const w01 = (1 - tx) * tz,       w11 = tx * tz;

            // The three noise fields, once. Every profile in the blend below
            // reads these same numbers, so the whole four-corner blend costs
            // one set of samples rather than four.
            const n = shapeAt(x, z);

            const b00 = sampleBiomeAt(x0, z0), b10 = sampleBiomeAt(x1, z0);
            const b01 = sampleBiomeAt(x0, z1), b11 = sampleBiomeAt(x1, z1);
            const p00 = profileFor(b00.name), p10 = profileFor(b10.name);
            const p01 = profileFor(b01.name), p11 = profileFor(b11.name);

            // dryH  is what the ground would be here if there were no water at
            //       all, which is what a lake bed or a river surface is measured
            //       down from.
            // landH / wetH are the two sides of the shoreline blend.
            const S = this._sand;
            let dryH = 0, landH = 0, landW = 0, wetH = 0, seaW = 0;
            let poolTop = 0, poolW = 0, fineAmp = 0, gradeAmp = 0;
            let r = 0, g = 0, b = 0;

            const acc = (bi, p, ww, xx, zz) => {
                if (!ww) return;
                const dry = profileHeight(p, x, z, xx, zz, n, gx, gz);
                dryH     += dry * ww;
                fineAmp  += p.fine * ww;
                gradeAmp += (p.hill + p.ridge * 0.8 + p.massif * 140) * ww;
                if (p.water) {
                    seaW += ww;
                    wetH += (p.abs !== null ? p.abs : dry - p.depth) * ww;
                    r += S.r * ww; g += S.g * ww; b += S.b * ww;
                } else {
                    landW += ww; landH += dry * ww;
                    const c = VoxelField.hexRGB(bi.color || '#90ee90');
                    r += c.r * ww; g += c.g * ww; b += c.b * ww;
                }
                if (p.poolTop !== null) { poolTop += p.poolTop * ww; poolW += ww; }
            };
            acc(b00, p00, w00, x0, z0); acc(b10, p10, w10, x1, z0);
            acc(b01, p01, w01, x0, z1); acc(b11, p11, w11, x1, z1);

            // --- height, with a shoreline instead of a ramp -------------------
            let h;
            if (seaW <= 1e-4)       h = landH;
            else if (landW <= 1e-4) h = wetH;
            else {
                const land = landH / landW, wet = wetH / seaW;
                // Slow at first, steep further out: a shelf you can wade, and
                // then the edge of the shelf.
                h = land + (wet - land) * Math.pow(seaW, SHORE_POW);
                const above = h - SEA_LEVEL;
                // The dry sand ridge the tide throws up, a little way inland.
                if (above > 0 && above < 34) {
                    h += BERM_H * Math.exp(-Math.pow((above - 12) / 10, 2));
                }
                // And the ripples in the wet sand either side of the water line.
                if (above > -30 && above < 8) h += n.c * 3.2;
                // A beach is flat, and a shore that only ever ramped would have
                // nowhere to lie on. The strip either side of the water line is
                // graded back toward the tide mark, which widens the surf zone
                // and the dry sand above it without moving either end.
                // Wider under the water than over it: the surf zone and the
                // shallows a swimmer can stand up in reach a long way out, while
                // the dry sand gives way to the land behind it quite quickly.
                const d = h - SEA_LEVEL;
                const flatK = Math.exp(-Math.pow(d / (d >= 0 ? 34 : 70), 2));
                h += (SEA_LEVEL + 12 - h) * 0.55 * flatK *
                     Math.min(1, landW * 3) * Math.min(1, seaW * 4);
            }

            // --- the rare island out in the open sea --------------------------
            // Added AFTER the shoreline blend, because it is a radial dome in
            // world units rather than a per-square rise the four-corner blend
            // could carry. It is raised from wherever the sea floor happens to
            // be to its own top, so the shelf around it slopes out of the
            // seabed and there is somewhere to wade ashore.
            const isle = oceanIslandAt(x, z);
            if (isle) {
                const top = SEA_LEVEL + isle.isl.rise;
                if (top > h) h += (top - h) * isle.k;
            }

            // --- the coastline's sand, in the colour blend --------------------
            if (seaW > 0 && seaW < 1) {
                const spread = Math.pow(seaW, 0.6);
                r += (S.r - r) * spread * 0.7;
                g += (S.g - g) * spread * 0.7;
                b += (S.b - b) * spread * 0.7;
            }

            // --- whose square is this, and what is on top of it ---------------
            const wx = Math.floor(gx), wy = Math.floor(gz);
            const own  = sampleBiomeAt(wx, wy);
            const pOwn = profileFor(own.name);
            let mat = MAT.GRASS, road = false, bed = 0;

            // --- the river, cut into whatever it crosses ----------------------
            // Road squares are left alone: a road over a river is a bridge, and
            // cutting the channel through it would drop the carriageway in.
            let riv = null;
            if (pOwn.key !== 'road') {
                riv = riverAt(x, z, wx, wy);
                if (riv) {
                    const t = riv.d / riv.half;
                    if (t < 1) {
                        h -= riv.depth * (1 - t * t);      // a rounded bed
                        bed = 1;
                    } else {
                        const bt = (riv.d - riv.half) / RIVER_BANK;
                        if (bt < 1) {
                            h -= riv.depth * 0.14 * (1 - bt) * (1 - bt);
                            if (bt < 0.55) bed = 2;        // the muddy bank
                        }
                    }
                }
            }

            // --- how steep the ground is here ---------------------------------
            // Measured off the hill field alone, which carries nearly all of the
            // grade, and expressed as a multiple of this profile's own typical
            // grade so one threshold means the same thing on a dune and on an alp.
            let slope = 0;
            if (gradeAmp > 40) {
                const d = 14;
                const bx = _fbm((x + d) * N_HILL_F - 3.7, z * N_HILL_F + 5.9, 3, 2.0, 0.5);
                const bz = _fbm(x * N_HILL_F - 3.7, (z + d) * N_HILL_F + 5.9, 3, 2.0, 0.5);
                const k  = gradeAmp / d;
                slope = Math.hypot((bx - n.b) * k, (bz - n.b) * k) / (gradeAmp * 0.006);
            }

            // --- the top cube --------------------------------------------------
            if (pOwn.key === 'road') {
                const rd = VoxelField.roadAt(x, z, wx, wy);
                if (rd) {
                    // The median (3) is levelled with the carriageways either
                    // side of it but is not paved: it is left to the surface
                    // rules below, so a median through a desert is sand and one
                    // through a meadow is grass.
                    if (rd !== 3) {
                        road = true;
                        // No lane paint is cut into the cubes any more. What is
                        // here is the ROADBED - graded hardcore, sunk out of
                        // sight under the paving - and the carriageway the eye
                        // sees is the ribbon VoxelWorldTerrain extrudes over it.
                        mat  = MAT.ASPHALT;
                    }
                    // A carriageway climbs a hill but never ripples: the
                    // metre-scale roughness comes back out from under it.
                    h -= n.c * fineAmp;
                    // The bed is dropped clear of the paving. A column top is
                    // ROUNDED to the voxel grid, so a bed left level with the
                    // surface would poke a cube corner through the ribbon on
                    // half the squares in the world.
                    if (rd !== 3) h -= ROAD_BED_DROP;
                }
            }
            if (!road) {
                const above = h - SEA_LEVEL;
                if (bed === 1)                          mat = MAT.SAND;
                else if (bed === 2)                     mat = MAT.MUD;
                else if (above < -46)                   mat = MAT.CLAY;
                else if (above < 0)                     mat = MAT.SAND;
                else if (seaW > 0.02 && above < BEACH_TOP) mat = MAT.SAND;
                else if (h > SNOW_LINE)                 mat = MAT.SNOW;
                else if (slope > pOwn.cliffAt)          mat = pOwn.cliff;
                else if (pOwn.surface !== null)         mat = pOwn.surface;
                else mat = h > 120 * WORLD_SCALE ? MAT.ROCK : MAT.GRASS;
            }

            // --- standing water that the sea plane cannot reach ----------------
            // A river at altitude, a mountain lake, the pools in a swamp. The
            // open sea keeps its own plane, so anything near sea level is left
            // to that rather than drawn twice.
            let waterY = -Infinity;
            if (riv && riv.d < riv.half + RIVER_BANK * 0.35) waterY = dryH - 6;
            if (poolW > 0.5) waterY = Math.max(waterY, dryH + poolTop / poolW);
            if (waterY <= SEA_LEVEL + 8 || waterY <= h) waterY = -Infinity;

            // Rock and snow tint with altitude, the way the blended mesh did.
            if (h > 120 * WORLD_SCALE) {
                const k = Math.min(1, (h - 120 * WORLD_SCALE) / (170 * WORLD_SCALE)) * 0.7;
                r += (ROCK_RGB.r - r) * k; g += (ROCK_RGB.g - g) * k; b += (ROCK_RGB.b - b) * k;
            }
            if (h > SNOW_LINE) {
                const k = Math.min(1, (h - SNOW_LINE) / (150 * WORLD_SCALE));
                r += (SNOW_RGB.r - r) * k; g += (SNOW_RGB.g - g) * k; b += (SNOW_RGB.b - b) * k;
            }

            // The Omega Tower's own ground. Six world squares by six of it are
            // levelled into a plinth: the thing is seven hundred and fifty
            // metres across, and a megastructure does not follow the contours of
            // a hillside. The edge is ramped over one square so the pad meets
            // the country around it instead of ending in a cliff.
            const omega = omegaPadAt(gx, gz);
            if (omega > 0) {
                h = h + (OMEGA_PAD_Y - h) * omega;
                if (omega > 0.5) { mat = MAT.ROCK; road = false; }
            }

            // --- Far Lands: infinite haywire procedural generation beyond borders ---
            if (isFarlands(x, z)) {
                const fx = x * 0.008, fz = z * 0.008;
                const sinLattice = Math.sin(fx * 3.7) * Math.cos(fz * 3.7) * 75;
                const highWave = Math.sin(fx * 11.3 + fz * 7.1) * 35;
                const bitwiseCut = (((Math.floor(x / 20) ^ Math.floor(z / 20)) & 7) - 3.5) * 14;
                const terraceMonolith = Math.round(h / 30) * 30;
                h = terraceMonolith * 0.6 + (h + sinLattice + highWave + bitwiseCut) * 0.4;

                const bSeed = Math.abs((Math.floor(x / 10) ^ Math.floor(z / 10))) % 14;
                if (bSeed === 0) mat = MAT.GLOWSTONE;
                else if (bSeed === 1) mat = MAT.OBSIDIAN;
                else if (bSeed === 2) mat = MAT.CRYSTAL;
                else if (bSeed === 3) mat = MAT.LAVA;
                else if (bSeed === 4) mat = MAT.ORE_QUANTUM;
                else if (bSeed === 5) mat = MAT.ORE_ARCANE;
                else if (bSeed === 6) mat = MAT.ORE_ETHEREAL;
                else if (bSeed === 7) mat = MAT.BASALT;
                else if (bSeed === 8) mat = MAT.MARBLE;
                else if (bSeed === 9) mat = MAT.CONCRETE;
                else if (bSeed === 10) mat = MAT.GLASS;
                else if (bSeed === 11) mat = MAT.MAGMA;
                else if (bSeed === 12) mat = MAT.ORE_METEOR;
                else mat = MAT.BEDROCK;
            }

            o.h = h; o.mat = mat; o.road = road; o.prof = pOwn; o.water = waterY;
            o.r = _clamp(r, 0, 1); o.g = _clamp(g, 0, 1); o.b = _clamp(b, 0, 1);
            return o;
        }

        // Hex colour to 0..1 RGB, memoised: the blend below calls this four
        // times per column and a chunk has ten thousand columns.
        static hexRGB(hex) {
            let c = VoxelField._hexCache.get(hex);
            if (c) return c;
            c = srgbRGB(hex);
            VoxelField._hexCache.set(hex, c);
            return c;
        }

        // ---------------------------------------------------------------------
        // Roads, solved rather than built
        //
        // The flat world laid asphalt slabs and dashed lane meshes over the
        // ground. A voxel world does not need any of that: the ribbon is a
        // predicate. 0 = off the road, 1 = asphalt, 2 = lane marking,
        // 3 = the median between the two carriageways.
        //
        // The shape it answers with is the one ProceduralMapRoadGenerator lays
        // down on the flat map: TWO roads with a gap between them, each of them
        // two lanes wide with a broken line down its own middle, joined at
        // crossings, tees and bends by a solid box of tarmac.
        // ---------------------------------------------------------------------
        static roadAt(x, z, wx, wy) {
            const ts   = WORLD_TILE_SIZE;
            const lx   = x - (wx + 0.5) * ts;
            const lz   = z - (wy + 0.5) * ts;
            const half = ROAD_TOTAL_W / 2;
            const dir  = getRoadDirectionAt(wx, wy) || 'horizontal';

            const dash = (along, lateral) => {
                const off = Math.abs(lateral);
                // The median: the gap between the two carriageways is not road
                // at all, and keeps whatever the country there is made of.
                if (off < ROAD_GAP * 0.5) return 3;
                // ...and each carriageway carries a broken line down its own
                // middle, with one lane either side of it.
                const d = Math.abs(off - ROAD_LANE_OFF);
                if (d > VOX.SIZE * 0.6) return 1;
                const cyc = ((along % 35) + 35) % 35;
                return cyc < 20 ? 2 : 1;
            };

            const ns = () => Math.abs(lx) <= half ? dash(lz, lx) : 0;
            const ew = () => Math.abs(lz) <= half ? dash(lx, lz) : 0;
            const leg = (n, s, e, w) => {
                if (Math.abs(lx) <= half && Math.abs(lz) <= half) return 1;   // the junction box
                if (n && Math.abs(lx) <= half && lz < -half) return dash(lz, lx);
                if (s && Math.abs(lx) <= half && lz >  half) return dash(lz, lx);
                if (w && Math.abs(lz) <= half && lx < -half) return dash(lx, lz);
                if (e && Math.abs(lz) <= half && lx >  half) return dash(lx, lz);
                return 0;
            };
            // A bend is a quarter ring whose centre is the tile corner between
            // the two open edges, so it leaves each edge tangent to the straight
            // road next door instead of turning a hard right angle.
            const arc = (ccx, ccz) => {
                const R  = ts * 0.5;
                const dx = lx - ccx, dz = lz - ccz;
                const d  = Math.sqrt(dx * dx + dz * dz);
                if (Math.abs(d - R) > half) return 0;
                if (dx * (ccx > 0 ? -1 : 1) < -1e-3 || dz * (ccz > 0 ? -1 : 1) < -1e-3) return 0;
                const ang = Math.atan2(dz, dx);
                return dash(ang * R, d - R);
            };

            switch (dir) {
                case 'vertical':   return ns();
                case 'horizontal': return ew();
                case 'cross':      return leg(1, 1, 1, 1);
                case 't-up': case 't-north':    return leg(1, 0, 1, 1);
                case 't-down': case 't-south':  return leg(0, 1, 1, 1);
                case 't-left': case 't-west':   return leg(1, 1, 0, 1);
                case 't-right': case 't-east':  return leg(1, 1, 1, 0);
                case 'corner-up-left':   case 'corner-north-west': return arc(-ts / 2, -ts / 2);
                case 'corner-up-right':  case 'corner-north-east': return arc( ts / 2, -ts / 2);
                case 'corner-down-left': case 'corner-south-west': return arc(-ts / 2,  ts / 2);
                case 'corner-down-right':case 'corner-south-east': return arc( ts / 2,  ts / 2);
                default:
                    if (dir.indexOf('cross') >= 0 || dir.indexOf('t-') === 0) return leg(1, 1, 1, 1);
                    return ew();
            }
        }

        // ---------------------------------------------------------------------
        // Voxel queries
        // ---------------------------------------------------------------------
        // Level of the first air voxel above the generated ground in a column.
        // Everything below it is solid unless an edit says otherwise.
        // The generated column at a voxel coordinate, worked out once and kept.
        // Everything else in this file - the top, the material, the colour, the
        // water - is read off what this returns.
        column(vx, vz) {
            const key = (vx + 65536) * 131072 + (vz + 65536);
            const hit = this._colCache.get(key);
            if (hit !== undefined) return hit;
            const c = this.sampleColumn((vx + 0.5) * VOX.SIZE, (vz + 0.5) * VOX.SIZE);
            // A copy: sampleColumn hands back the same scratch object every time
            // it is called without one of its own.
            const rec = {
                h: c.h, mat: c.mat, road: c.road, prof: c.prof, water: c.water,
                r: c.r, g: c.g, b: c.b,
                top: _clamp(Math.round(c.h / VOX.SIZE), VOX.MIN_Y + 1, VOX.MAX_Y),
                // The roof of the sewer gallery under this column, or 0 where
                // no town stands over it. Kept on the column so genMaterial -
                // which runs for every cube of every wall in the world - can
                // rule the sewers out with one comparison.
                sewerHi: 0
            };
            const band = sewerBandAt(vx, vz, rec.top, 1);
            if (band) rec.sewerHi = band.hi;
            if (this._colCache.size > 80000) {
                let count = 0;
                for (const k of this._colCache.keys()) {
                    this._colCache.delete(k);
                    if (++count >= 10000) break;
                }
            }
            this._colCache.set(key, rec);
            return rec;
        }

        genTopY(vx, vz) {
            return this.column(vx, vz).top;
        }

        // Drop the memo. The world seed and the biome tables are re-read when a
        // scene starts, and a stale column top would show up as a step in the
        // ground where two generations meet.
        clearCache() {
            this._colCache.clear();
            this._caveCache.clear();
            clearTerrainCaches();
        }

        // Surface colour and material of a column, in one call, for the mesher.
        // The `out` scratch object callers used to pass is no longer needed or
        // written to: the answer is the cached column itself, which must not be
        // mutated by whoever reads it.
        genColumn(vx, vz) {
            return this.column(vx, vz);
        }

        // The ground, once the caves have had their way with it. Everywhere but
        // a shaft this is the generated surface; where a shaft comes up it is
        // the lip of the hole, so the mouth of a cave reads as a pit somebody
        // could fall into rather than as a lid drawn over one.
        caveTopY(vx, vz) {
            const gen = this.genTopY(vx, vz);
            // This is the hottest question in the whole field - the mesher asks
            // it for every column of every chunk, and so does every ray and
            // every footfall - so it must not pay for the caves. Only a SHAFT
            // ever breaks the surface, and a shaft is one spot in a world square
            // that most often has none: the square is asked first, and all but a
            // handful of columns in the world stop here for the cost of a hash.
            const wx = Math.floor(vx / VOX.PER_TILE), wy = Math.floor(vz / VOX.PER_TILE);
            const oneIn = gen >= 26 ? SHAFT_ONE_IN_MTN : SHAFT_ONE_IN;
            if (sqHash(wx, wy, 1) >= 1 / oneIn) return gen;
            const sx = wx * VOX.PER_TILE + Math.floor(sqHash(wx, wy, 2) * VOX.PER_TILE);
            const sz = wy * VOX.PER_TILE + Math.floor(sqHash(wx, wy, 3) * VOX.PER_TILE);
            const reach = SHAFT_RADIUS + SHAFT_FLARE;
            if (Math.abs(vx - sx) > reach || Math.abs(vz - sz) > reach) return gen;

            const c = this.columnCaves(vx, vz);
            if (!c || !c.shaftR || c.shaftTop < gen - 1) return gen;
            let y = gen;
            while (y > VOX.MIN_Y + 1 && this.caveAt(vx, y - 1, vz)) y--;
            return y;
        }

        // ---------------------------------------------------------------------
        // Caves
        // ---------------------------------------------------------------------
        // What this column has under it, worked out once and remembered:
        //
        //   runs    [{ lo, hi }]  every passage through it, in voxels
        //   lo/hi                 the whole carved extent, passages and room
        //   shaft   0 | radius    the shaft down through it, if there is one
        //   sewer   null | {lo,hi} the brick gallery, where a town stands over it
        //
        // Null where nothing is carved at all, which is most of the world.
        // Everything else about the caves - whether a cube is air, what a
        // chunk has to draw, where a walker's feet land - is answered off this.
        columnCaves(vx, vz) {
            const key = (vx + 65536) * 131072 + (vz + 65536);
            const hit = this._caveCache.get(key);
            if (hit !== undefined) return hit;
            const out = this._genColumnCaves(vx, vz);
            if (this._caveCache.size > 200000) this._caveCache.clear();
            this._caveCache.set(key, out);
            return out;
        }

        _genColumnCaves(vx, vz) {
            // Rock is only ever taken from between the roof and the floor. The
            // roof is measured against this column AND its four neighbours, so
            // a passage can never break out through the side of a cliff: the
            // ground there is drawn as one solid face, and a hole behind it
            // would be a hole in the world.
            const own  = this.genTopY(vx, vz);
            const ceil = Math.min(own,
                this.genTopY(vx - 1, vz), this.genTopY(vx + 1, vz),
                this.genTopY(vx, vz - 1), this.genTopY(vx, vz + 1)) - CAVE_ROOF;
            const floor = VOX.MIN_Y + CAVE_FLOOR_CLEAR;

            const runs = [];
            const push = (a, b, hardCeil) => {
                const lo = Math.max(floor, Math.ceil(a));
                const hi = Math.min(hardCeil === undefined ? ceil : hardCeil, Math.floor(b));
                if (hi >= lo) runs.push({ lo, hi });
            };

            // The sewer first: it is a built gallery at its own fixed level and
            // it does not answer to the natural roof clearance the way a cave
            // passage does - it is meant to be a pick's depth under a street.
            const sewer = sewerBandAt(vx, vz, own);
            if (sewer) {
                push(sewer.lo, sewer.hi, sewer.hi);
                // ...and the manhole up to the road, where there is one. It
                // stops one cube short of the surface: that last cube is the
                // iron cover (see genMaterial), and breaking it is the way in.
                if (manholeAt(vx, vz) && own - 2 > sewer.hi) {
                    push(sewer.hi + 1, own - 2, own - 2);
                }
            }

            if (ceil > floor) {
                for (const L of CAVE_LAYERS) {
                    // A layer that follows the ground is only there where there IS
                    // ground to wind through: that is what keeps the mountain
                    // passages inside the mountains.
                    if (L.minTop !== undefined && own < L.minTop) continue;
                    const m = _perlin(vx * L.f + L.sx, vz * L.f + L.sz);
                    const a = Math.abs(m);
                    if (a >= L.th) continue;
                    // How far inside the band this column is: 1 along the middle of
                    // the passage, 0 at its edge. The square root spreads the wide
                    // part out, so a tunnel reads as a tunnel and not as a wedge.
                    const t = Math.sqrt(1 - a / L.th);
                    const r = L.rad * t;
                    if (r < 0.6) continue;
                    const wind = _perlin(vx * L.yf + L.sx + 17.3, vz * L.yf + L.sz - 5.1) * 2;
                    const cy = (L.depth !== undefined ? own - L.depth : L.y) + L.amp * wind;
                    push(cy - r, cy + r);
                }

                // The rooms. Broad and slow, so one covers a good many columns and
                // the passages that cross it simply open out into it.
                const c = _perlin(vx * CAVERN_F + 313.7, vz * CAVERN_F - 77.3);
                if (c > CAVERN_TH) {
                    const t = Math.min(1, (c - CAVERN_TH) / (0.62 - CAVERN_TH));
                    const r = 2 + (CAVERN_RAD - 2) * t;
                    const wind = _perlin(vx * CAVERN_F * 1.7 - 41.1, vz * CAVERN_F * 1.7 + 9.4);
                    push(CAVERN_Y + wind * 6 - r, CAVERN_Y + wind * 6 + r);
                }
            }

            // The way down. Its square decides whether there is one and where
            // it stands; a mountain square carries one far more often, which is
            // why a mountainside is where caves are found.
            let shaft = 0;
            const wx = Math.floor(vx / VOX.PER_TILE), wy = Math.floor(vz / VOX.PER_TILE);
            const oneIn = own >= 26 ? SHAFT_ONE_IN_MTN : SHAFT_ONE_IN;
            if (sqHash(wx, wy, 1) < 1 / oneIn) {
                const sx = wx * VOX.PER_TILE + Math.floor(sqHash(wx, wy, 2) * VOX.PER_TILE);
                const sz = wy * VOX.PER_TILE + Math.floor(sqHash(wx, wy, 3) * VOX.PER_TILE);
                const d = Math.hypot(vx - sx, vz - sz);
                if (d < SHAFT_RADIUS + SHAFT_FLARE) shaft = d;
            }

            if (!runs.length) return null;

            let lo = Infinity, hi = -Infinity;
            for (const r of runs) { if (r.lo < lo) lo = r.lo; if (r.hi > hi) hi = r.hi; }

            // A shaft is only worth sinking where it reaches something. It is
            // taken from the surface down to the top of whatever this column
            // already has under it, so it always comes out somewhere.
            let shaftTop = 0, shaftBot = 0, shaftR = 0;
            if (shaft) {
                shaftR = SHAFT_RADIUS;
                shaftTop = own - 1;
                shaftBot = hi;
                if (shaftBot < shaftTop) {
                    lo = Math.min(lo, shaftBot);
                    hi = Math.max(hi, shaftTop);
                } else {
                    shaftR = 0;
                }
            }

            return { runs, lo, hi, shaftR, shaftD: shaft, shaftTop, shaftBot, ceil, sewer };
        }

        // Is a WORLD-unit point inside a sewer gallery rather than a natural
        // passage? What lives down there answers to this (VoxelWorldEntities):
        // a brick tunnel under a town holds different things from a limestone
        // one under a wood.
        sewerAt(x, z, y) {
            const S = VOX.SIZE;
            const c = this.columnCaves(Math.floor(x / S), Math.floor(z / S));
            if (!c || !c.sewer) return false;
            const vy = Math.floor(y / S);
            return vy >= c.sewer.lo - 1 && vy <= c.sewer.hi + 1;
        }

        // Is this cube carved out by the caves? A handful of comparisons
        // against the column's own remembered answer.
        caveAt(vx, vy, vz) {
            if (vy <= VOX.MIN_Y || vy > VOX.MAX_Y) return false;
            const c = this.columnCaves(vx, vz);
            if (!c || vy < c.lo || vy > c.hi) return false;
            for (const r of c.runs) if (vy >= r.lo && vy <= r.hi) return true;
            // Inside the shaft's throat. It flares open at the top, so its
            // mouth reads as a sinkhole rather than as a drilled hole.
            if (c.shaftR && vy >= c.shaftBot && vy <= c.shaftTop) {
                const up = (vy - c.shaftBot) / Math.max(1, c.shaftTop - c.shaftBot);
                const rad = c.shaftR + SHAFT_FLARE * up * up;
                if (c.shaftD < rad) return true;
            }
            return false;
        }

        // The whole carved extent of a column, for the mesher: it draws the
        // cave faces over exactly this span and nothing else. Null where there
        // is nothing to draw.
        caveSpan(vx, vz) {
            const c = this.columnCaves(vx, vz);
            return c ? { lo: c.lo, hi: c.hi } : null;
        }

        // The bands of a column a mesher actually has to walk: each passage
        // with a cube of margin round it, and the shaft if there is one. Walking
        // these rather than the whole carved extent is most of what makes the
        // caves cheap enough to draw - a column that carries two passages forty
        // voxels apart costs the two passages, not the forty voxels.
        caveBands(vx, vz, out) {
            const c = this.columnCaves(vx, vz);
            const bands = out || [];
            bands.length = 0;
            if (!c) return bands;
            for (const r of c.runs) bands.push(r.lo - 1, r.hi + 1);
            if (c.shaftR) bands.push(c.shaftBot - 1, c.shaftTop + 1);
            return bands;
        }

        editAt(vx, vy, vz) {
            if (!this.edits.count) return undefined;
            const wx = Math.floor(vx / VOX.PER_TILE), wy = Math.floor(vz / VOX.PER_TILE);
            if (!this.edits.has(wx, wy)) return undefined;
            const lx = vx - wx * VOX.PER_TILE, lz = vz - wy * VOX.PER_TILE;
            return this.edits.get(wx, wy, lx, lz, vy);
        }

        isSolid(vx, vy, vz) {
            if (vy <= VOX.MIN_Y) return true;
            if (vy > VOX.MAX_Y)  return false;
            // What anybody has done to this cube outranks what was generated
            // there, caves included: a passage can be filled back in, and rock
            // put back into one stays put.
            const e = this.editAt(vx, vy, vz);
            if (e !== undefined) return e !== MAT.AIR;
            if (vy >= this.genTopY(vx, vz)) return false;
            return !this.caveAt(vx, vy, vz);
        }

        // What a cube is made of. AIR when there is nothing there.
        materialAt(vx, vy, vz, colOut) {
            if (vy <= VOX.MIN_Y) return MAT.BEDROCK;
            const e = this.editAt(vx, vy, vz);
            if (e !== undefined) return e;
            const c = this.genColumn(vx, vz, colOut);
            if (vy >= c.top) return MAT.AIR;
            if (this.caveAt(vx, vy, vz)) return MAT.AIR;
            return this.genMaterial(c, vx, vy, vz);
        }

        // The generated stack of a column: skin, a few cubes of subsoil, then
        // rock all the way down, salted with ore the deeper it goes.
        genMaterial(col, vx, vy, vz) {
            if (isFarlands(vx * VOX.SIZE, vz * VOX.SIZE)) {
                const cell = Math.abs((vx ^ vy ^ vz) + Math.floor(Math.sin(vy * 0.4) * 8)) % 16;
                if (cell === 0) return MAT.GLOWSTONE;
                if (cell === 1) return MAT.LAVA;
                if (cell === 2) return MAT.MAGMA;
                if (cell === 3) return MAT.OBSIDIAN;
                if (cell === 4) return MAT.CRYSTAL;
                if (cell === 5) return MAT.ORE_QUANTUM;
                if (cell === 6) return MAT.ORE_ARCANE;
                if (cell === 7) return MAT.ORE_ETHEREAL;
                if (cell === 8) return MAT.ORE_METEOR;
                if (cell === 9) return MAT.BASALT;
                if (cell === 10) return MAT.MARBLE;
                if (cell === 11) return MAT.CONCRETE;
                if (cell === 12) return MAT.GLASS;
                if (cell === 13) return MAT.BRICK;
                if (cell === 14) return MAT.ASH;
                return MAT.BEDROCK;
            }
            const depth = col.top - 1 - vy;
            const p = col.prof || TERRAIN.plain;
            // The lining of a sewer gallery. Only the shell of one is brick -
            // the cube either side of the void and the cube over and under it -
            // so what a pick breaks into from the street is a built tunnel and
            // not a hole in the clay. Gated on the column's own flag, which is
            // false everywhere but a town, so the rest of the world pays one
            // comparison for it.
            if (col.sewerHi !== 0) {
                // The cover in the road: the last cube of a manhole shaft,
                // which is what is left standing between the street and the
                // drop. Iron, so it reads as a lid rather than as a patch of
                // road, and one swing to take out.
                if (vy === col.top - 1 && manholeAt(vx, vz)) return MAT.IRON;
                if (vy >= col.sewerHi - SEWER_H - 1 && vy <= col.sewerHi + 1 &&
                    sewerGalleryAt(vx, vz) <= SEWER_HALF + 1) {
                    return MAT.BRICK;
                }
            }
            const isMountain = p && (p.massif || p.bed === MAT.GRANITE || (p.ridge && p.ridge >= 30));
            if (depth <= 0) {
                if (isMountain && col.mat === MAT.ROCK) {
                    const surfOre = oreAt(vx, vy, vz, 1, p);
                    if (surfOre) return surfOre;
                }
                return col.mat;
            }
            if (col.mat === MAT.ASPHALT || col.mat === MAT.MARK) {
                return depth <= 2 ? MAT.GRAVEL : MAT.ROCK;
            }
            // Badlands and canyon walls are banded, and the bands are level
            // with the world rather than with the surface, so a whole cliff
            // face reads as one set of strata.
            if (p.strata && depth <= 26) {
                const band = Math.floor((vy + 8192) / 3) % 4;
                return [MAT.CLAY, MAT.SAND, MAT.ROCK, MAT.CLAY][band];
            }
            if (depth <= 3) {
                if (isMountain && (col.mat === MAT.ROCK || col.mat === MAT.SNOW)) {
                    const mtnOre = oreAt(vx, vy, vz, depth, p);
                    if (mtnOre) return mtnOre;
                }
                if (col.mat === MAT.SAND)  return MAT.SAND;
                if (col.mat === MAT.MUD)   return depth <= 1 ? MAT.MUD : MAT.CLAY;
                if (col.mat === MAT.SNOW)  return depth <= 1 ? MAT.SNOW : (p.sub || MAT.ROCK);
                if (col.mat === MAT.ROCK)  return MAT.ROCK;
                if (col.mat === MAT.ASH)   return MAT.ASH;
                if (col.mat === MAT.SALT)  return depth <= 1 ? MAT.SALT : MAT.CLAY;
                return p.sub || MAT.DIRT;
            }
            if (depth <= 6 && (col.mat === MAT.SAND || col.mat === MAT.MUD)) return MAT.CLAY;
            // The melt at the bottom of the world, and the magma that stands in
            // the throat of a volcano. Checked before the seams: nothing is
            // mined out of a lava lake.
            const hot = hotAt(vx, vy, vz, p);
            if (hot) return hot;
            // A seam.
            const ore = oreAt(vx, vy, vz, depth, p);
            if (ore) return ore;
            return bedMat(vx, vy, vz, p, depth);
        }

        // Level of the first air voxel above the highest solid cube, edits and
        // all. This is what a walker stands on and what the camper drives over.
        topSolidY(vx, vz) {
            const gen = this.caveTopY(vx, vz);
            if (!this.edits.count) return gen;
            const wx = Math.floor(vx / VOX.PER_TILE), wy = Math.floor(vz / VOX.PER_TILE);
            if (!this.edits.has(wx, wy)) return gen;
            const lx = vx - wx * VOX.PER_TILE, lz = vz - wy * VOX.PER_TILE;
            const r  = this.edits.range(wx, wy, lx, lz);
            if (!r) return gen;
            let y = Math.max(gen, r.max + 1);
            while (y > VOX.MIN_Y + 1 && !this.isSolid(vx, y - 1, vz)) y--;
            return y;
        }

        // ---------------------------------------------------------------------
        // World-unit surface height
        //
        // The cubes step in 1.25 m; a camper riding raw steps would shake itself
        // apart. Bilinear over the four surrounding column tops gives a surface
        // that hugs the blocks without the chatter, and it still drops into a
        // trench the moment one is dug.
        // ---------------------------------------------------------------------
        heightAt(x, z) {
            const S = VOX.SIZE;
            const fx = x / S - 0.5, fz = z / S - 0.5;
            const x0 = Math.floor(fx), z0 = Math.floor(fz);
            const tx = fx - x0, tz = fz - z0;
            const h00 = this.surfaceTopY(x0,     z0);
            const h10 = this.surfaceTopY(x0 + 1, z0);
            const h01 = this.surfaceTopY(x0,     z0 + 1);
            const h11 = this.surfaceTopY(x0 + 1, z0 + 1);
            return h00 * (1 - tx) * (1 - tz) + h10 * tx * (1 - tz) +
                   h01 * (1 - tx) * tz       + h11 * tx * tz;
        }

        // What is on top of a column, in world units, PAVING INCLUDED.
        //
        // Off a road this is the top of the cube, as it always was. On one it is
        // the smooth paved surface of the ribbon that is drawn over the roadbed:
        // the carriageway is a mesh rather than a run of cubes now, and the
        // camper has to drive on the thing it can see rather than on the graded
        // hardcore eight units below it. The moment somebody digs the bed out
        // from under the paving the answer goes back to the cubes, so a hole
        // knocked in a motorway is a hole and not a sheet of tarmac in the air.
        surfaceTopY(vx, vz) {
            const top = this.topSolidY(vx, vz) * VOX.SIZE;
            const c = this.column(vx, vz);
            if (!c.road) return top;
            const paved = c.h + ROAD_BED_DROP;
            return top >= c.h - VOX.SIZE ? paved : top;
        }

        // The paved height of a road, sampled smoothly the way heightAt samples
        // the ground. What lays the ribbon, and what a lamp post on the verge is
        // measured against.
        roadSurfaceAt(x, z) { return this.heightAt(x, z); }

        // The exact top of the cube under a point, with no smoothing: what a
        // walker's feet and the dig cursor need.
        blockTopAt(x, z) {
            return this.topSolidY(Math.floor(x / VOX.SIZE), Math.floor(z / VOX.SIZE)) * VOX.SIZE;
        }

        // ---------------------------------------------------------------------
        // Standing up inside the world
        // ---------------------------------------------------------------------
        // The floor UNDER a point at a given height: the top of the first solid
        // cube at or below it. On the surface this is blockTopAt again; inside a
        // cave it is the floor of the passage, which is the whole difference
        // between being able to walk down there and standing on the roof of it.
        supportY(x, z, y) {
            const S = VOX.SIZE;
            const vx = Math.floor(x / S), vz = Math.floor(z / S);
            let vy = Math.floor(y / S);
            const top = this.topSolidY(vx, vz);
            // Above the world: the surface is the floor, as it always was - and
            // on a road that surface is the paving, not the bed under it.
            if (vy >= top) return this.surfaceTopY(vx, vz);
            for (; vy > VOX.MIN_Y; vy--) {
                if (this.isSolid(vx, vy, vz)) return (vy + 1) * S;
            }
            return (VOX.MIN_Y + 1) * S;
        }

        // The underside of the rock over a point, or null where the sky is. What
        // stops a jump in a passage from putting somebody inside the ceiling.
        roofY(x, z, y) {
            const S = VOX.SIZE;
            const vx = Math.floor(x / S), vz = Math.floor(z / S);
            const top = this.topSolidY(vx, vz);
            let vy = Math.max(VOX.MIN_Y + 1, Math.floor(y / S) + 1);
            if (vy >= top) return null;
            for (; vy < top; vy++) {
                if (this.isSolid(vx, vy, vz)) return vy * S;
            }
            return null;
        }

        // ---------------------------------------------------------------------
        // Raycast (Amanatides & Woo voxel traversal)
        // ---------------------------------------------------------------------
        // Returns the first solid cube along the ray with the face it was hit
        // on, or null. `hit` is the cube; `place` is the empty cube in front of
        // that face, which is where a placed block goes.
        raycast(ox, oy, oz, dx, dy, dz, maxDist) {
            const S = VOX.SIZE;
            const len = Math.hypot(dx, dy, dz) || 1;
            dx /= len; dy /= len; dz /= len;

            let vx = Math.floor(ox / S), vy = Math.floor(oy / S), vz = Math.floor(oz / S);
            const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
            const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
            const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;

            const inf = Infinity;
            const tdx = stepX ? Math.abs(S / dx) : inf;
            const tdy = stepY ? Math.abs(S / dy) : inf;
            const tdz = stepZ ? Math.abs(S / dz) : inf;

            let tmx = stepX ? ((stepX > 0 ? (vx + 1) * S - ox : ox - vx * S) / Math.abs(dx)) : inf;
            let tmy = stepY ? ((stepY > 0 ? (vy + 1) * S - oy : oy - vy * S) / Math.abs(dy)) : inf;
            let tmz = stepZ ? ((stepZ > 0 ? (vz + 1) * S - oz : oz - vz * S) / Math.abs(dz)) : inf;

            let px = vx, py = vy, pz = vz, t = 0;
            const max = maxDist || VOX.REACH;
            let guard = Math.ceil(max / S) * 3 + 8;
            while (guard-- > 0) {
                if (this.isSolid(vx, vy, vz)) {
                    return {
                        vx, vy, vz, dist: t,
                        mat: this.materialAt(vx, vy, vz),
                        place: { vx: px, vy: py, vz: pz },
                        nx: px - vx, ny: py - vy, nz: pz - vz
                    };
                }
                px = vx; py = vy; pz = vz;
                if (tmx < tmy && tmx < tmz)      { vx += stepX; t = tmx; tmx += tdx; }
                else if (tmy < tmz)              { vy += stepY; t = tmy; tmy += tdy; }
                else                             { vz += stepZ; t = tmz; tmz += tdz; }
                if (t > max) return null;
            }
            return null;
        }

        // ---------------------------------------------------------------------
        // Editing
        // ---------------------------------------------------------------------
        _write(vx, vy, vz, mat) {
            if (vy <= VOX.MIN_Y || vy > VOX.MAX_Y) return false;
            const wx = Math.floor(vx / VOX.PER_TILE), wy = Math.floor(vz / VOX.PER_TILE);
            const lx = vx - wx * VOX.PER_TILE, lz = vz - wy * VOX.PER_TILE;
            this.edits.set(wx, wy, lx, lz, vy, mat);
            this.version++;
            if (this.onEdit) this.onEdit(wx, wy, lx, lz, vy);
            return true;
        }

        // Take a cube out. Returns the material removed, or 0 when there was
        // nothing there or it was not diggable.
        breakAt(vx, vy, vz) {
            if (!this.isSolid(vx, vy, vz)) return MAT.AIR;
            const mat = this.materialAt(vx, vy, vz);
            const def = MATERIALS[mat];
            if (!def || !def.diggable) return MAT.AIR;
            this._write(vx, vy, vz, MAT.AIR);
            return mat;
        }

        // Put a cube back. Refuses to fill an occupied cell.
        placeAt(vx, vy, vz, mat) {
            if (this.isSolid(vx, vy, vz)) return false;
            return this._write(vx, vy, vz, mat || MAT.DIRT);
        }

        // Blow a ball of cubes away (a bumper at speed, a shell, a landing).
        // Returns how many went, and what the last one was made of.
        carveSphere(x, y, z, radius, fill) {
            const S = VOX.SIZE;
            const r = Math.max(1, Math.round(radius / S));
            const cx = Math.floor(x / S), cy = Math.floor(y / S), cz = Math.floor(z / S);
            let n = 0, last = MAT.AIR;
            for (let ix = -r; ix <= r; ix++) {
                for (let iy = -r; iy <= r; iy++) {
                    for (let iz = -r; iz <= r; iz++) {
                        if (ix * ix + iy * iy + iz * iz > r * r) continue;
                        const vx = cx + ix, vy = cy + iy, vz = cz + iz;
                        if (fill === undefined || fill === null) {
                            const m = this.breakAt(vx, vy, vz);
                            if (m) { n++; last = m; }
                        } else if (this.placeAt(vx, vy, vz, fill)) n++;
                    }
                }
            }
            return { count: n, mat: last };
        }

        reset() { this.edits.clear(); this._colCache.clear(); this._caveCache.clear(); this.version++; }
    }
    VoxelField._hexCache = new Map();

    // =========================================================================
    // VoxelMesher
    //
    // Turns a patch of the field into one geometry. Two passes:
    //
    //  - the bulk pass treats the patch as a height field and greedily merges
    //    runs of equal-topped columns into single quads, which is what makes a
    //    hundred by hundred column tile cost a few hundred triangles instead of
    //    forty thousand;
    //  - the detail pass walks cube by cube through the columns that carry edits
    //    (and the ring around them), because those are the only places where the
    //    world has overhangs, tunnels and ceilings.
    //
    // Everything is one geometry with baked vertex colours: face brightness,
    // biome tint and per-cube jitter all live in the colour attribute, so the
    // whole terrain draws with a single unlit-ish Lambert material.
    // =========================================================================
    const FACE_SHADE = { top: 1.0, side: 0.82, end: 0.68, bottom: 0.5 };
    // What a grass top face is tinted with. The grass picture already IS the
    // colour of grass, and multiplying it by a biome colour as dark as a forest
    // canopy (#228b22) is what turned every field in the world into a black
    // stain. So the biome only leans on it: mostly the picture, a little of the
    // place, which is the difference between a meadow and a forest floor.
    const GRASS_TINT = 0.76;
    const _grassRGB = { r: 1, g: 1, b: 1 };
    function grassTint(r, g, b) {
        _grassRGB.r = r + (1 - r) * GRASS_TINT;
        _grassRGB.g = g + (1 - g) * GRASS_TINT;
        _grassRGB.b = b + (1 - b) * GRASS_TINT;
        return _grassRGB;
    }
    // Far below bedrock, so it can never collide with a real water level.
    const NO_WATER = -2000000;

    class VoxelMesher {
        // wx,wy   world map tile
        // cx0,cz0 first column of the patch, local to the tile, in voxels
        // n       columns across the patch, in blocks
        // step    voxels per block (LOD)
        // bx,bz   world-unit origin the vertices are written relative to. The
        //         world is 128000 units across and float32 vertices lose their
        //         last useful digit out there, so every chunk is authored around
        //         its own centre and placed by its group transform.
        static build(field, wx, wy, cx0, cz0, n, step, bx, bz, caves) {
            const S    = VOX.SIZE;
            const bs   = S * step;                       // block edge, world units
            const ox   = wx * VOX.PER_TILE + cx0;        // global voxel origin
            const oz   = wy * VOX.PER_TILE + cz0;

            // One block of apron on every side so edge columns know their
            // neighbours' heights and no seam opens between patches.
            const w    = n + 2;
            const top  = new Int32Array(w * w);
            const mat  = new Uint8Array(w * w);
            const col  = new Float32Array(w * w * 3);
            // Standing water that the sea plane cannot cover: a river at
            // altitude, a mountain lake, the pools in a swamp. NO_WATER marks a
            // dry column, which is nearly all of them.
            const wat  = new Int32Array(w * w).fill(NO_WATER);
            const scratch = {};

            for (let j = 0; j < w; j++) {
                for (let i = 0; i < w; i++) {
                    const vx = ox + (i - 1) * step + (step >> 1);
                    const vz = oz + (j - 1) * step + (step >> 1);
                    const c  = field.genColumn(vx, vz, scratch);
                    // topSolidY, not c.top: an apron column can belong to the
                    // tile next door, and that tile may be the dug one.
                    const t  = field.topSolidY(vx, vz);
                    const k = j * w + i;
                    top[k] = step === 1 ? t : Math.round(t / step) * step;
                    mat[k] = c.mat;
                    col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
                    if (c.water > -Infinity && isFinite(c.water)) {
                        const wl = Math.round(c.water / VOX.SIZE);
                        if (wl > top[k]) wat[k] = wl;
                    }
                }
            }

            const B = new MeshBuffer();
            // Grass tops are drawn with their own surface (see voxelGrassMaterial)
            // rather than the ground's, so a field is grass and not a green stain
            // over cracked mud. Everything else stays in B - the sides of that
            // same column included, since those are the soil under the turf.
            const G = new MeshBuffer();
            // The blocks: every cube that has a picture of its own - brick,
            // glass, marble, a seam of ore, the melt at the bottom of the
            // world. One buffer per KIND of block, made the first time a face
            // of it is written, so a patch of ordinary ground carries none at
            // all and a cave wall carries exactly as many as it really shows
            // (the country rock, whatever lens is in it, and the seams).
            //
            // No atlas. One block, one PNG, one surface: there is nothing to
            // keep a cell layout in step with, nothing to bleed across a cell
            // edge, and a tile dropped into img/textures/voxels IS that block
            // from then on.
            const blocks = new Map();

            // --- which columns need the cube-by-cube treatment ----------------
            // Only at full detail, and only where somebody has actually dug.
            // A patch on the edge of a tile can see cubes dug in the tile next
            // door, so the search covers the nine tiles the apron can reach.
            // Tiles nobody has touched cost a map lookup and nothing else.
            let detail = null;
            if (step === 1 && field.edits.count) {
                for (let ty = wy - 1; ty <= wy + 1; ty++) {
                    for (let tx = wx - 1; tx <= wx + 1; tx++) {
                        const cols = field.edits.columns(tx, ty);
                        if (!cols || !cols.size) continue;
                        for (const c of cols.keys()) {
                            const gx = tx * VOX.PER_TILE + Math.floor(c / VOX.PER_TILE);
                            const gz = ty * VOX.PER_TILE + (c % VOX.PER_TILE);
                            const i = gx - ox + 1, j = gz - oz + 1;
                            if (i < 0 || i >= w || j < 0 || j >= w) continue;
                            if (!detail) detail = new Uint8Array(w * w);
                            for (let dj = -1; dj <= 1; dj++) {
                                for (let di = -1; di <= 1; di++) {
                                    const ii = i + di, jj = j + dj;
                                    if (ii >= 0 && ii < w && jj >= 0 && jj < w) detail[jj * w + ii] = 1;
                                }
                            }
                        }
                    }
                }
            }

            const bias = { x: bx || 0, z: bz || 0 };
            VoxelMesher._bulk(B, G, field, top, mat, col, detail, w, n, ox, oz, step, bs, bias);
            if (detail) VoxelMesher._detail(B, G, blocks, field, top, mat, col, detail, w, n, ox, oz, bs, bias);
            // The caves. Only at full detail, and only for somebody who is
            // actually down there to see them: a passage keeps five voxels of
            // rock over its head, so from up in the daylight there is nothing of
            // it to look at and nothing worth drawing.
            if (step === 1 && caves) {
                VoxelMesher._caves(B, blocks, field, top, col, w, n, ox, oz, bs, bias);
            }

            let water = null;
            for (let k = 0; k < wat.length; k++) {
                if (wat[k] !== NO_WATER) { water = VoxelMesher._water(field, top, wat, w, n, ox, oz, step, bs, bias); break; }
            }
            // Each block buffer that got anything written into it becomes one
            // mesh, drawn with that block's own surface.
            let blockGeo = null;
            for (const [m, buf] of blocks) {
                if (buf.empty) continue;
                (blockGeo || (blockGeo = [])).push({ mat: m, geo: buf.finish() });
            }
            return {
                solid: B.finish(),
                grass: G.empty ? null : G.finish(),
                blocks: blockGeo,
                water
            };
        }

        // --- greedy height field pass -------------------------------------
        static _bulk(B, G, field, top, mat, col, detail, w, n, ox, oz, step, bs, bias) {
            const at = (i, j) => (j + 1) * w + (i + 1);
            const skip = (i, j) => detail && detail[at(i, j)];

            // Precompute corner heights and slope state for natural terrain (1-block height gaps)
            const yNW = new Int32Array(w * w);
            const yNE = new Int32Array(w * w);
            const ySE = new Int32Array(w * w);
            const ySW = new Int32Array(w * w);
            const sloped = new Uint8Array(w * w);

            for (let j = 0; j < w; j++) {
                for (let i = 0; i < w; i++) {
                    const k = j * w + i;
                    const h = top[k];
                    if (detail && detail[k]) {
                        yNW[k] = yNE[k] = ySE[k] = ySW[k] = h;
                        continue;
                    }
                    const nbW = (i > 0) ? top[k - 1] : h;
                    const nbE = (i < w - 1) ? top[k + 1] : h;
                    const nbN = (j > 0) ? top[k - w] : h;
                    const nbS = (j < w - 1) ? top[k + w] : h;

                    const dropW = (h - nbW === step) ? step : 0;
                    const dropE = (h - nbE === step) ? step : 0;
                    const dropN = (h - nbN === step) ? step : 0;
                    const dropS = (h - nbS === step) ? step : 0;

                    if (dropW || dropE || dropN || dropS) {
                        sloped[k] = 1;
                        yNW[k] = h - Math.max(dropW, dropN);
                        yNE[k] = h - Math.max(dropE, dropN);
                        ySE[k] = h - Math.max(dropE, dropS);
                        ySW[k] = h - Math.max(dropW, dropS);
                    } else {
                        yNW[k] = yNE[k] = ySE[k] = ySW[k] = h;
                    }
                }
            }

            // Tops: sloped columns get sloped quads; flat columns greedily merge.
            const done = new Uint8Array(n * n);
            for (let j = 0; j < n; j++) {
                for (let i = 0; i < n; i++) {
                    if (done[j * n + i] || skip(i, j)) continue;
                    const k = at(i, j);
                    const h = top[k], m = mat[k];
                    const r = col[k * 3], g = col[k * 3 + 1], b = col[k * 3 + 2];

                    if (sloped[k]) {
                        done[j * n + i] = 1;
                        const x0 = (ox + i * step) * VOX.SIZE - bias.x;
                        const z0 = (oz + j * step) * VOX.SIZE - bias.z;
                        const x1 = x0 + bs;
                        const z1 = z0 + bs;
                        const y00 = yNW[k] * VOX.SIZE;
                        const y10 = yNE[k] * VOX.SIZE;
                        const y11 = ySE[k] * VOX.SIZE;
                        const y01 = ySW[k] * VOX.SIZE;

                        let cr = r * FACE_SHADE.top, cg = g * FACE_SHADE.top, cb = b * FACE_SHADE.top;
                        const target = (m === MAT.GRASS) ? G : B;
                        if (m === MAT.GRASS) {
                            const t = grassTint(r, g, b);
                            cr = t.r; cg = t.g; cb = t.b;
                        }
                        target.quadSlope(x0, y00, z0, x0, y01, z1, x1, y11, z1, x1, y10, z0,
                                         cr, cg, cb, step, step);
                        continue;
                    }

                    const same = (ii, jj) => {
                        if (done[jj * n + ii] || skip(ii, jj)) return false;
                        const kk = at(ii, jj);
                        if (sloped[kk]) return false;
                        return top[kk] === h && mat[kk] === m &&
                               Math.abs(col[kk * 3] - r) < 0.02 &&
                               Math.abs(col[kk * 3 + 1] - g) < 0.02 &&
                               Math.abs(col[kk * 3 + 2] - b) < 0.02;
                    };
                    let ww = 1;
                    while (i + ww < n && same(i + ww, j)) ww++;
                    let hh = 1;
                    outer: while (j + hh < n) {
                        for (let ii = i; ii < i + ww; ii++) if (!same(ii, j + hh)) break outer;
                        hh++;
                    }
                    for (let jj = j; jj < j + hh; jj++)
                        for (let ii = i; ii < i + ww; ii++) done[jj * n + ii] = 1;

                    const x0 = (ox + i * step) * VOX.SIZE - bias.x;
                    const z0 = (oz + j * step) * VOX.SIZE - bias.z;
                    const y  = h * VOX.SIZE;
                    if (m === MAT.GRASS) {
                        const t = grassTint(r, g, b);
                        G.quadY(x0, y, z0, ww * bs, hh * bs, t.r, t.g, t.b,
                                ww * step, hh * step, 1);
                    } else {
                        B.quadY(x0, y, z0, ww * bs, hh * bs,
                                r * FACE_SHADE.top, g * FACE_SHADE.top, b * FACE_SHADE.top,
                                ww * step, hh * step, 1);
                    }
                }
            }

            // Sides: one run per exposed step, merged along the run axis.
            // dir 0 = -x, 1 = +x, 2 = -z, 3 = +z
            for (let dir = 0; dir < 4; dir++) {
                const dx = dir === 0 ? -1 : dir === 1 ? 1 : 0;
                const dz = dir === 2 ? -1 : dir === 3 ? 1 : 0;
                const shade = dx ? FACE_SHADE.side : FACE_SHADE.end;
                const runI  = dx ? 1 : 0;
                const seen  = new Uint8Array(n * n);
                for (let j = 0; j < n; j++) {
                    for (let i = 0; i < n; i++) {
                        if (seen[j * n + i] || skip(i, j)) continue;
                        const k = at(i, j);
                        const knb = at(i + dx, j + dz);

                        let yTopA, yTopB, yBotA, yBotB;
                        if (dir === 0) {
                            yTopA = yNW[k]; yTopB = ySW[k];
                            yBotA = yNE[knb]; yBotB = ySE[knb];
                        } else if (dir === 1) {
                            yTopA = yNE[k]; yTopB = ySE[k];
                            yBotA = yNW[knb]; yBotB = ySW[knb];
                        } else if (dir === 2) {
                            yTopA = yNW[k]; yTopB = yNE[k];
                            yBotA = ySW[knb]; yBotB = ySE[knb];
                        } else {
                            yTopA = ySW[k]; yTopB = ySE[k];
                            yBotA = yNW[knb]; yBotB = yNE[knb];
                        }

                        if (yTopA <= yBotA && yTopB <= yBotB) continue;

                        const m = mat[k];
                        const r = col[k * 3], g = col[k * 3 + 1], b = col[k * 3 + 2];

                        if (yTopA === yTopB && yBotA === yBotB) {
                            const h = yTopA, nb = yBotA;
                            let run = 1;
                            for (;;) {
                                const ii = i + (runI ? 0 : run), jj = j + (runI ? run : 0);
                                if (ii >= n || jj >= n || seen[jj * n + ii] || skip(ii, jj)) break;
                                const kk = at(ii, jj);
                                const kknb = at(ii + dx, jj + dz);
                                let kkTopA, kkTopB, kkBotA, kkBotB;
                                if (dir === 0) {
                                    kkTopA = yNW[kk]; kkTopB = ySW[kk];
                                    kkBotA = yNE[kknb]; kkBotB = ySE[kknb];
                                } else if (dir === 1) {
                                    kkTopA = yNE[kk]; kkTopB = ySE[kk];
                                    kkBotA = yNW[kknb]; kkBotB = ySW[kknb];
                                } else if (dir === 2) {
                                    kkTopA = yNW[kk]; kkTopB = yNE[kk];
                                    kkBotA = ySW[kknb]; kkBotB = ySE[kknb];
                                } else {
                                    kkTopA = ySW[kk]; kkTopB = ySE[kk];
                                    kkBotA = yNW[kknb]; kkBotB = yNE[kknb];
                                }
                                if (kkTopA !== h || kkTopB !== h || kkBotA !== nb || kkBotB !== nb || mat[kk] !== m) break;
                                run++;
                            }
                            for (let s = 0; s < run; s++) {
                                const ii = i + (runI ? 0 : s), jj = j + (runI ? s : 0);
                                seen[jj * n + ii] = 1;
                            }

                            const yTop = h * VOX.SIZE;
                            const yLip = Math.max(nb, h - step) * VOX.SIZE;
                            const yBot = nb * VOX.SIZE;
                            const runLen = run * bs;
                            const x0 = (ox + i * step) * VOX.SIZE - bias.x;
                            const z0 = (oz + j * step) * VOX.SIZE - bias.z;
                            const wall = (yA, yB, cr, cg, cb) => {
                                if (yB <= yA) return;
                                B.quadSide(dir, x0, z0, yA, yB - yA, runLen, bs,
                                           cr * shade, cg * shade, cb * shade,
                                           run * step, (yB - yA) / VOX.SIZE);
                            };
                            wall(yLip, yTop, r, g, b);
                            if (yLip > yBot) {
                                const c = MATERIALS[VoxelMesher.subMat(m)].rgb;
                                wall(yBot, yLip, c.r, c.g, c.b);
                            }
                        } else {
                            seen[j * n + i] = 1;
                            const x0 = (ox + i * step) * VOX.SIZE - bias.x;
                            const z0 = (oz + j * step) * VOX.SIZE - bias.z;
                            const x1 = x0 + bs;
                            const z1 = z0 + bs;

                            const yTA = yTopA * VOX.SIZE, yTB = yTopB * VOX.SIZE;
                            const yBA = Math.min(yTopA, yBotA) * VOX.SIZE;
                            const yBB = Math.min(yTopB, yBotB) * VOX.SIZE;

                            let p1, p2, p3, p4, nx, ny, nz;
                            if (dir === 0) {
                                nx = -1; ny = 0; nz = 0;
                                p1 = [x0, yTA, z0];
                                p2 = [x0, yBA, z0];
                                p3 = [x0, yBB, z1];
                                p4 = [x0, yTB, z1];
                            } else if (dir === 1) {
                                nx = 1; ny = 0; nz = 0;
                                p1 = [x1, yTB, z1];
                                p2 = [x1, yBB, z1];
                                p3 = [x1, yBA, z0];
                                p4 = [x1, yTA, z0];
                            } else if (dir === 2) {
                                nx = 0; ny = 0; nz = -1;
                                p1 = [x1, yTB, z0];
                                p2 = [x1, yBB, z0];
                                p3 = [x0, yBA, z0];
                                p4 = [x0, yTA, z0];
                            } else {
                                nx = 0; ny = 0; nz = 1;
                                p1 = [x0, yTA, z1];
                                p2 = [x0, yBA, z1];
                                p3 = [x1, yBB, z1];
                                p4 = [x1, yTB, z1];
                            }

                            const cr = r * shade, cg = g * shade, cb = b * shade;
                            const uh = Math.max(0.1, (Math.max(yTA, yTB) - Math.min(yBA, yBB)) / VOX.SIZE);
                            B.quadWall(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2],
                                       p3[0], p3[1], p3[2], p4[0], p4[1], p4[2],
                                       nx, ny, nz, cr, cg, cb, step, uh);
                        }
                    }
                }
            }
        }

        // --- the caves ------------------------------------------------------
        // Cube by cube, but only over the bands a column's passages actually
        // occupy (caveBands), and only where they are not already drawn by the
        // greedy pass. That pass skins the side of a hill from the neighbouring
        // column's ground up to this one's: anything at or above a neighbour's
        // ground is therefore already a face, and drawing it again would put two
        // surfaces in the same place. Below it, the rock was solid and unseen
        // until the caves opened it up, and this is the only pass that draws it.
        static _caves(B, blocks, field, top, col, w, n, ox, oz, bs, bias) {
            const S = VOX.SIZE;
            const at = (i, j) => (j + 1) * w + (i + 1);
            const bands = [];
            const scratch = {};

            for (let j = 0; j < n; j++) {
                for (let i = 0; i < n; i++) {
                    const vx = ox + i, vz = oz + j;
                    field.caveBands(vx, vz, bands);
                    if (!bands.length) continue;
                    const k = at(i, j);
                    // One column read for the whole stack rather than one per
                    // cube: what a column is made of does not change with depth.
                    const c = field.genColumn(vx, vz, scratch);
                    const cr = col[k * 3], cg = col[k * 3 + 1], cb = col[k * 3 + 2];
                    // Where the greedy pass has already skinned each side.
                    const nb = [top[at(i - 1, j)], top[at(i + 1, j)],
                                top[at(i, j - 1)], top[at(i, j + 1)]];

                    for (let bi = 0; bi < bands.length; bi += 2) {
                        const y0 = Math.max(VOX.MIN_Y + 1, bands[bi]);
                        const y1 = Math.min(top[k], bands[bi + 1]);
                        for (let vy = y0; vy <= y1; vy++) {
                            // What this cube is, without asking the column again:
                            // materialAt would re-run the whole biome blend for
                            // every cube of every passage, and a column is made
                            // of the same thing all the way down.
                            const e = field.editAt(vx, vy, vz);
                            let m;
                            if (e !== undefined) m = e;
                            else if (vy >= c.top || field.caveAt(vx, vy, vz)) m = MAT.AIR;
                            else m = field.genMaterial(c, vx, vy, vz);
                            if (m === MAT.AIR) continue;
                            const def = MATERIALS[m] || MATERIALS[MAT.ROCK];
                            // A block with a tile of its own goes to the atlas
                            // buffer and carries no colour but its own shading;
                            // everything else is still a tinted cube of ground.
                            const Q = VoxelMesher.bufFor(B, blocks, def);
                            let r, g, b;
                            if (def.tex) { r = g = b = 1; }
                            else if (def.biome) { r = cr; g = cg; b = cb; }
                            else { r = def.rgb.r; g = def.rgb.g; b = def.rgb.b; }
                            const jit = 0.92 + hash3(vx, vy, vz) * 0.16;
                            r *= jit; g *= jit; b *= jit;

                            const x = vx * S - bias.x, y = vy * S, z = vz * S - bias.z;
                            if (!field.isSolid(vx, vy + 1, vz))
                                Q.quadY(x, y + S, z, S, S, r * FACE_SHADE.top, g * FACE_SHADE.top, b * FACE_SHADE.top, 1, 1, 1);
                            if (!field.isSolid(vx, vy - 1, vz))
                                Q.quadY(x, y, z, S, S, r * FACE_SHADE.bottom, g * FACE_SHADE.bottom, b * FACE_SHADE.bottom, 1, 1, -1);
                            if (vy < nb[0] && !field.isSolid(vx - 1, vy, vz))
                                Q.quadSide(0, x, z, y, S, S, S, r * FACE_SHADE.side, g * FACE_SHADE.side, b * FACE_SHADE.side, 1, 1);
                            if (vy < nb[1] && !field.isSolid(vx + 1, vy, vz))
                                Q.quadSide(1, x, z, y, S, S, S, r * FACE_SHADE.side, g * FACE_SHADE.side, b * FACE_SHADE.side, 1, 1);
                            if (vy < nb[2] && !field.isSolid(vx, vy, vz - 1))
                                Q.quadSide(2, x, z, y, S, S, S, r * FACE_SHADE.end, g * FACE_SHADE.end, b * FACE_SHADE.end, 1, 1);
                            if (vy < nb[3] && !field.isSolid(vx, vy, vz + 1))
                                Q.quadSide(3, x, z, y, S, S, S, r * FACE_SHADE.end, g * FACE_SHADE.end, b * FACE_SHADE.end, 1, 1);
                        }
                    }
                }
            }
        }

        // --- inland water ---------------------------------------------------
        // A surface, not a volume: one greedily merged sheet at the water line
        // with a skirt down its exposed edges. It is drawn with a translucent
        // material of its own, so the bed shows through it.
        static _water(field, top, wat, w, n, ox, oz, step, bs, bias) {
            const S = VOX.SIZE;
            const at = (i, j) => (j + 1) * w + (i + 1);
            const B = new MeshBuffer();
            const done = new Uint8Array(n * n);
            // Deeper water reads darker; the shallows keep the bed's colour.
            const shade = d => {
                const k = Math.max(0.45, 1 - d * 0.045);
                return [0.16 * k + 0.04, 0.40 * k + 0.06, 0.55 * k + 0.10];
            };

            for (let j = 0; j < n; j++) {
                for (let i = 0; i < n; i++) {
                    if (done[j * n + i]) continue;
                    const k = at(i, j);
                    const wl = wat[k];
                    if (wl === NO_WATER) { done[j * n + i] = 1; continue; }
                    const same = (ii, jj) => !done[jj * n + ii] && wat[at(ii, jj)] === wl;
                    let ww = 1;
                    while (i + ww < n && same(i + ww, j)) ww++;
                    let hh = 1;
                    outer: while (j + hh < n) {
                        for (let ii = i; ii < i + ww; ii++) if (!same(ii, j + hh)) break outer;
                        hh++;
                    }
                    for (let jj = j; jj < j + hh; jj++)
                        for (let ii = i; ii < i + ww; ii++) done[jj * n + ii] = 1;

                    const c  = shade(wl - top[k]);
                    const x0 = (ox + i * step) * S - bias.x;
                    const z0 = (oz + j * step) * S - bias.z;
                    B.quadY(x0, wl * S, z0, ww * bs, hh * bs, c[0], c[1], c[2],
                            ww * step, hh * step, 1);
                }
            }

            // The skirt: wherever the sheet ends over ground lower than itself.
            for (let dir = 0; dir < 4; dir++) {
                const dx = dir === 0 ? -1 : dir === 1 ? 1 : 0;
                const dz = dir === 2 ? -1 : dir === 3 ? 1 : 0;
                for (let j = 0; j < n; j++) {
                    for (let i = 0; i < n; i++) {
                        const k = at(i, j), wl = wat[k];
                        if (wl === NO_WATER) continue;
                        const nk = at(i + dx, j + dz);
                        const nwl = wat[nk];
                        const floor = nwl === NO_WATER ? top[nk] : nwl;
                        if (floor >= wl) continue;
                        const c = shade(wl - top[k]);
                        const x0 = (ox + i * step) * S - bias.x;
                        const z0 = (oz + j * step) * S - bias.z;
                        B.quadSide(dir, x0, z0, floor * S, (wl - floor) * S, bs, bs,
                                   c[0] * 0.8, c[1] * 0.8, c[2] * 0.8, step, wl - floor);
                    }
                }
            }
            return B.finish();
        }

        // Which buffer one cube's faces belong in. A block with a picture of
        // its own gets a buffer of its own - and therefore a mesh of its own,
        // drawn with its own texture - and everything else stays on the ground
        // surface it always was. The buffer is made the first time that block
        // is actually seen, so a patch pays for the kinds of block it shows and
        // for no others.
        static bufFor(B, blocks, def) {
            if (!blocks || !def.tex) return B;
            let Q = blocks.get(def.id);
            if (!Q) { Q = new MeshBuffer(); blocks.set(def.id, Q); }
            return Q;
        }

        static subMat(m) {
            if (m === MAT.SAND) return MAT.SAND;
            if (m === MAT.ASPHALT || m === MAT.MARK) return MAT.GRAVEL;
            if (m === MAT.SNOW || m === MAT.ROCK) return MAT.ROCK;
            if (m === MAT.ASH) return MAT.ASH;
            return MAT.DIRT;
        }

        // --- cube by cube pass, only where the world has been changed -------
        static _detail(B, G, blocks, field, top, mat, col, detail, w, n, ox, oz, bs, bias) {
            const S = VOX.SIZE;
            const at = (i, j) => (j + 1) * w + (i + 1);

            // Vertical span to walk per column, widened to its neighbours' so a
            // tunnel that runs under an untouched column is still closed off.
            const lo = new Int32Array(w * w), hi = new Int32Array(w * w);
            for (let j = -1; j <= n; j++) {
                for (let i = -1; i <= n; i++) {
                    const k = at(i, j);
                    const vx = ox + i, vz = oz + j;
                    const wx = Math.floor(vx / VOX.PER_TILE), wy = Math.floor(vz / VOX.PER_TILE);
                    const r  = field.edits.range(wx, wy, vx - wx * VOX.PER_TILE, vz - wy * VOX.PER_TILE);
                    lo[k] = Math.max(VOX.MIN_Y + 1, Math.min(top[k] - 2, r ? r.min - 1 : top[k] - 2));
                    hi[k] = Math.max(top[k], r ? r.max + 1 : top[k]);
                }
            }
            const spanLo = (i, j) => Math.min(lo[at(i, j)], lo[at(i - 1, j)], lo[at(i + 1, j)],
                                              lo[at(i, j - 1)], lo[at(i, j + 1)]);
            const spanHi = (i, j) => Math.max(hi[at(i, j)], hi[at(i - 1, j)], hi[at(i + 1, j)],
                                              hi[at(i, j - 1)], hi[at(i, j + 1)]);

            const scratch = {};
            for (let j = 0; j < n; j++) {
                for (let i = 0; i < n; i++) {
                    if (!detail[at(i, j)]) continue;
                    const vx = ox + i, vz = oz + j;
                    const y0 = spanLo(i, j), y1 = spanHi(i, j);
                    for (let vy = y0; vy <= y1; vy++) {
                        const m = field.materialAt(vx, vy, vz, scratch);
                        if (m === MAT.AIR) continue;
                        const def = MATERIALS[m] || MATERIALS[MAT.ROCK];
                        const Q = VoxelMesher.bufFor(B, blocks, def);
                        let r, g, b;
                        if (def.tex) {
                            // The block's own picture carries its colour.
                            r = g = b = 1;
                        } else if (def.biome) {
                            const k = at(i, j);
                            r = col[k * 3]; g = col[k * 3 + 1]; b = col[k * 3 + 2];
                        } else {
                            r = def.rgb.r; g = def.rgb.g; b = def.rgb.b;
                        }
                        // A touch of per-cube jitter: a dug wall of identical
                        // rock reads as one flat surface without it.
                        const jit = 0.92 + hash3(vx, vy, vz) * 0.16;
                        r *= jit; g *= jit; b *= jit;

                        const x = vx * S - bias.x, y = vy * S, z = vz * S - bias.z;
                        if (!field.isSolid(vx, vy + 1, vz)) {
                            if (m === MAT.GRASS) {
                                const t = grassTint(r, g, b);
                                G.quadY(x, y + S, z, S, S, t.r, t.g, t.b, 1, 1, 1);
                            } else {
                                Q.quadY(x, y + S, z, S, S, r * FACE_SHADE.top, g * FACE_SHADE.top, b * FACE_SHADE.top, 1, 1, 1);
                            }
                        }
                        if (!field.isSolid(vx, vy - 1, vz))
                            Q.quadY(x, y, z, S, S, r * FACE_SHADE.bottom, g * FACE_SHADE.bottom, b * FACE_SHADE.bottom, 1, 1, -1);
                        if (!field.isSolid(vx - 1, vy, vz))
                            Q.quadSide(0, x, z, y, S, S, S, r * FACE_SHADE.side, g * FACE_SHADE.side, b * FACE_SHADE.side, 1, 1);
                        if (!field.isSolid(vx + 1, vy, vz))
                            Q.quadSide(1, x, z, y, S, S, S, r * FACE_SHADE.side, g * FACE_SHADE.side, b * FACE_SHADE.side, 1, 1);
                        if (!field.isSolid(vx, vy, vz - 1))
                            Q.quadSide(2, x, z, y, S, S, S, r * FACE_SHADE.end, g * FACE_SHADE.end, b * FACE_SHADE.end, 1, 1);
                        if (!field.isSolid(vx, vy, vz + 1))
                            Q.quadSide(3, x, z, y, S, S, S, r * FACE_SHADE.end, g * FACE_SHADE.end, b * FACE_SHADE.end, 1, 1);
                    }
                }
            }
        }
    }

    // =========================================================================
    // MeshBuffer, the growable vertex sink the mesher writes into.
    // =========================================================================
    class MeshBuffer {
        constructor() {
            this.pos = []; this.nor = []; this.col = []; this.uv = []; this.idx = [];
        }
        // Nothing was written into it, so there is no mesh to make of it.
        get empty() { return this.pos.length === 0; }
        _quad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, nx, ny, nz, r, g, b, uw, uh) {
            const i = this.pos.length / 3;
            this.pos.push(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz);
            this.nor.push(nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz);
            this.col.push(r, g, b, r, g, b, r, g, b, r, g, b);
            this.uv.push(0, 0, uw, 0, uw, uh, 0, uh);
            this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
        }
        tri(ax, ay, az, bx, by, bz, cx, cy, cz, nx, ny, nz, r, g, b, uA, vA, uB, vB, uC, vC) {
            const i = this.pos.length / 3;
            this.pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
            this.nor.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
            this.col.push(r, g, b, r, g, b, r, g, b);
            this.uv.push(uA, vA, uB, vB, uC, vC);
            this.idx.push(i, i + 1, i + 2);
        }
        quadSlope(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, r, g, b, uw, uh) {
            const ux = bx - ax, uy = by - ay, uz = bz - az;
            const vx = cx - ax, vy = cy - ay, vz = cz - az;
            let nx = uy * vz - uz * vy;
            let ny = uz * vx - ux * vz;
            let nz = ux * vy - uy * vx;
            const len = Math.hypot(nx, ny, nz) || 1;
            nx /= len; ny /= len; nz /= len;
            const i = this.pos.length / 3;
            this.pos.push(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz);
            this.nor.push(nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz);
            this.col.push(r, g, b, r, g, b, r, g, b, r, g, b);
            this.uv.push(0, 0, 0, uh, uw, uh, uw, 0);
            this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
        }
        quadWall(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, nx, ny, nz, r, g, b, uw, uh) {
            const i = this.pos.length / 3;
            this.pos.push(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz);
            this.nor.push(nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz);
            this.col.push(r, g, b, r, g, b, r, g, b, r, g, b);
            this.uv.push(0, 0, 0, uh, uw, uh, uw, 0);
            this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
        }
        // Horizontal face at height y over a w by d footprint. `up` is +1 for a
        // top face, -1 for the underside of an overhang. `uw` is how many
        // repeats belong along w and `uh` how many along d.
        //
        // A top face winds the other way round from the underside - its first
        // edge runs along d, not along w - so its two repeat counts have to be
        // handed over swapped. Without that swap every merged rectangle of
        // ground got one repeat where it wanted eight and eight where it wanted
        // one, which is what smeared the whole world's turf into long streaks.
        quadY(x, y, z, w, d, r, g, b, uw, uh, up) {
            if (up > 0) {
                this._quad(x, y, z, x, y, z + d, x + w, y, z + d, x + w, y, z,
                           0, 1, 0, r, g, b, uh, uw);
            } else {
                this._quad(x, y, z, x + w, y, z, x + w, y, z + d, x, y, z + d,
                           0, -1, 0, r, g, b, uw, uh);
            }
        }
        // Vertical face. dir 0=-x 1=+x 2=-z 3=+z. `run` is the length along the
        // wall, `thick` the block size on the other horizontal axis.
        quadSide(dir, x, z, y, h, run, thick, r, g, b, uw, uh) {
            if (dir === 0) {
                this._quad(x, y, z, x, y, z + run, x, y + h, z + run, x, y + h, z,
                           -1, 0, 0, r, g, b, uw, uh);
            } else if (dir === 1) {
                const X = x + thick;
                this._quad(X, y, z + run, X, y, z, X, y + h, z, X, y + h, z + run,
                           1, 0, 0, r, g, b, uw, uh);
            } else if (dir === 2) {
                this._quad(x + run, y, z, x, y, z, x, y + h, z, x + run, y + h, z,
                           0, 0, -1, r, g, b, uw, uh);
            } else {
                const Z = z + thick;
                this._quad(x, y, Z, x + run, y, Z, x + run, y + h, Z, x, y + h, Z,
                           0, 0, 1, r, g, b, uw, uh);
            }
        }
        finish() {
            if (!this.idx.length) return null;
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
            geo.setAttribute('normal',   new THREE.Float32BufferAttribute(this.nor, 3));
            geo.setAttribute('color',    new THREE.Float32BufferAttribute(this.col, 3));
            geo.setAttribute('uv',       new THREE.Float32BufferAttribute(this.uv, 2));
            geo.setIndex(this.idx.length > 65000
                ? new THREE.Uint32BufferAttribute(this.idx, 1)
                : new THREE.Uint16BufferAttribute(this.idx, 1));
            geo.computeBoundingSphere();
            return geo;
        }
    }

    // =========================================================================
    // The one material every voxel in the world is drawn with. Colour lives in
    // the vertex attribute; the texture is only surface grain, tiled one repeat
    // per cube by the UVs the mesher writes.
    // =========================================================================
    // The grain is dropped in when it lands rather than handed to the material
    // at birth: a surface built around a texture whose image has not arrived
    // yet samples an empty one, uploads as a black pixel, and multiplies the
    // whole world to black. loadTex holds the wait, and keeps the texture on
    // the shared cache so it is filtered at the anisotropy the card can do -
    // without which the ground smears into long streaks at grazing angles,
    // which is every angle you ever look at the ground from.
    function _grain(mat, name) {
        if (typeof loadVoxelTex !== 'function') return;
        loadVoxelTex(name, 1, (tex) => {
            if (!mat) return;
            mat.map = tex;
            mat.needsUpdate = true;
        });
    }
    let _voxMat = null;
    function voxelMaterial() {
        if (_voxMat) return _voxMat;
        // Vertex colours first, grain second - and the grain is a flat grey
        // sheet (earth_grain.jpg, cracked_earth with the contrast and the brown
        // taken out of it) rather than a picture of mud, because whatever it is
        // multiplies every colour in the world and a dark brown one halved the
        // lot and tinted the rest.
        _voxMat = new THREE.MeshLambertMaterial({ vertexColors: true });
        _grain(_voxMat, 'ground.png');
        return _voxMat;
    }

    // The turf. Its own surface, so grass is grass: the picture carries the
    // colour and the vertex tint only leans it toward the biome (grassTint).
    let _grassMat = null;
    function voxelGrassMaterial() {
        if (_grassMat) return _grassMat;
        _grassMat = new THREE.MeshLambertMaterial({ vertexColors: true });
        _grain(_grassMat, 'grass.png');
        return _grassMat;
    }
    // The blocks. Every cube in the world that has a picture of its own -
    // brick, glass, marble, a seam of titanium, the melt at the bottom of the
    // world - is drawn with its own surface, off its own 48x48 tile under
    // img/textures/voxels. One block, one PNG: there is no atlas to keep a cell
    // layout in step with, nothing that can bleed across a cell edge, and a
    // tile dropped into that folder IS that block from then on.
    //
    // One material per block, made the first time the world actually shows one
    // and shared by every chunk after that, so the cost of the whole palette is
    // the handful of kinds a patch really exposes. A block that gives off light
    // wears its own picture as its emissive map as well, which is what makes a
    // cube of lava light its own face and leave the rock beside it dark.
    const _blockMats = new Map();
    function voxelBlockMaterial(mat) {
        const def = MATERIALS[mat];
        if (!def || !def.tex) return voxelMaterial();
        let m = _blockMats.get(mat);
        if (m) return m;
        const o = { vertexColors: true };
        if (def.glow) { o.emissive = 0xffffff; o.emissiveIntensity = 0.85; }
        m = new THREE.MeshLambertMaterial(o);
        // The picture lands when it lands (see loadTex): a surface built around
        // a texture whose image has not arrived samples an empty one and draws
        // black, and a texture that is not there at all stands the turf in for
        // itself rather than taking the world down.
        if (typeof loadVoxelTex === 'function') {
            loadVoxelTex(def.tex + '.png', 1, (tex) => {
                m.map = tex;
                if (def.glow) m.emissiveMap = tex;
                m.needsUpdate = true;
            });
        }
        _blockMats.set(mat, m);
        return m;
    }
    function disposeVoxelMaterial() {
        // The textures themselves belong to the shared cache and are left in
        // it; only the surfaces built on them go.
        if (_voxMat) { _voxMat.dispose(); _voxMat = null; }
        if (_grassMat) { _grassMat.dispose(); _grassMat = null; }
        if (_waterMat) { _waterMat.dispose(); _waterMat = null; }
        for (const m of _blockMats.values()) m.dispose();
        _blockMats.clear();
    }

    // Inland water: rivers, lakes and swamp pools. The sea keeps its own plane.
    let _waterMat = null;
    function voxelWaterMaterial() {
        if (_waterMat) return _waterMat;
        _waterMat = new THREE.MeshLambertMaterial({
            vertexColors: true, transparent: true, opacity: 0.78
        });
        return _waterMat;
    }

    // Handed to the rest of the suite.
    Object.assign(VW, {
        VOX, MAT, MATERIALS, PLACEABLE, ORE_ITEMS, ORES,
        VoxelEdits, VoxelField, VoxelMesher, MeshBuffer,
        TERRAIN, profileFor, islandRiseAt, riverPathAt, riverAt, shapeAt,
        oceanIslandOf, oceanIslandAt, OCEAN_ISLE_MAX_R,
        clearTerrainCaches, SEA_LEVEL, GROUND_BASE,
        voxelMaterial, voxelGrassMaterial, voxelWaterMaterial, disposeVoxelMaterial,
        voxelBlockMaterial, hotAt, oreAt, bedMat,
        isFarlands,
        voxelHash3: hash3
    });
})();
