//=============================================================================
// VoxelWorldCore.js
// VoxelWorld: shared namespace, constants, biome + road lookups, sprite billboards
//
// Part of the VoxelWorld suite. The ground of that world is a field of small
// destructible voxels; this module is one slice of the machinery laid over it.
// Load order is fixed in plugins.js and every module reads the shared state it
// needs off window.VoxelWorld.
//=============================================================================

/*:
 * @target MZ
 * @plugindesc VoxelWorld - shared namespace, constants, biome + road lookups, sprite billboards
 * @author Omni-Lex
 *
 * @help
 * shared namespace, constants, biome + road lookups, sprite billboards.
 *
 * One module of the VoxelWorld suite (VoxelWorldCore.js loads first). It
 * declares no plugin commands of its own; those live in VoxelWorldSystem.js.
 */

(() => {
    'use strict';

    // The suite's shared namespace. Every other module reads what it needs off
    // this object; nothing else is global.
    const VW = (window.VoxelWorld = window.VoxelWorld || {});

    'use strict';

    if (typeof THREE === 'undefined') {
        console.error('[VoxelWorld] THREE.js not loaded.');
        return;
    }
    if (typeof THREE.GLTFLoader === 'undefined') {
        console.warn('[VoxelWorld] THREE.GLTFLoader not found. Model loading will fail unless loaded globally.');
    }

    // =========================================================================
    // Texture loader (cached, tiled, sRGB-correct under ACES tone mapping).
    // Mirrors WeaponSystemProcedural.getTexture but uses smooth filtering +
    // mipmaps. A failed/absent load just leaves the material's base colour.
    // =========================================================================
    const _texCache = new Map();
    // Anisotropy the GPU actually supports, learned once the renderer exists.
    // Without it the asphalt and ground detail alias hard at grazing angles,
    // which reads as a shimmering, flickering road ahead of the camper.
    let _maxAniso = 1;
    function setTextureAnisotropy(n) {
        _maxAniso = Math.max(1, n | 0);
        for (const t of _texCache.values()) {
            if (!t) continue;
            t.anisotropy = _maxAniso;
            // Only re-upload textures that already have an image; pending loads
            // get needsUpdate from TextureLoader itself and warn otherwise.
            if (t.image) t.needsUpdate = true;
        }
    }
    // `onReady` is handed the texture once its image has actually landed. A
    // material that is built around a texture whose image has not arrived yet
    // samples an empty one and draws black, so anything that cannot survive
    // that - the ground of the whole world, for one - waits for this instead of
    // taking the texture straight off the return value.
    // =========================================================================
    // The world's own surfaces
    // =========================================================================
    // Everything the 3D world is drawn with lives in img/textures/voxels, one
    // file per surface, named after WHAT IT IS - ground.png, grass.png,
    // asphalt.png, roof_tile.png - at exactly one RPG Maker tile square
    // (VOXEL_TEX_SIZE). They used to be photographs of marble and slate
    // borrowed out of img/textures under names like "brown_grey_slate.jpg",
    // which is a different game from the one the 2D maps are; now a tileset
    // tile can be dropped straight in over any of them without a line of code
    // changing (tools/build_voxel_textures.py rebuilds the folder).
    //
    // AND THEY ARE DRAWN AS TILES. Magnified with NEAREST, so a 48 pixel tile
    // stays 48 crisp pixels on the face of a cube instead of being smeared into
    // a blur, and with no mipmap chain, because 48 is not a power of two and a
    // repeating non-power-of-two texture with mipmaps is illegal on a WebGL1
    // context (it draws black). One repeat per cube, set by the mesher's UVs.
    const VOXEL_TEX_SIZE = 48;
    const VOXEL_TEX_DIR  = 'voxels/';

    function loadVoxelTex(name, repeat, onReady) {
        const t = loadTex(VOXEL_TEX_DIR + name, repeat, onReady);
        if (!t) return t;
        t.magFilter = THREE.NearestFilter;
        t.minFilter = THREE.LinearFilter;
        t.generateMipmaps = false;
        t.anisotropy = 1;
        return t;
    }

    // What stands in for a texture that is not there. The turf: it is the one
    // surface the world can be certain of, it is the right sort of thing (a
    // ground tile rather than a sign or a face), and a block wearing grass
    // reads as an unfinished block rather than as a hole in the world.
    //
    // A MISSING FILE MUST NEVER TAKE THE WORLD DOWN. There are getting on for a
    // hundred block tiles now and they are built by a tool, so one of them
    // being absent - a half-run build, a mod that ships its own palette, a
    // deploy that dropped a file - has to be survivable. It is: the loader
    // notices, says so once, and hands the waiters the turf instead.
    const TEX_FALLBACK = VOXEL_TEX_DIR + 'grass.png';
    const _texMissing = new Set();

    function _flushWaiters(t) {
        const q = t && t._vwWaiting;
        if (!q) return;
        t._vwWaiting = null;
        for (const fn of q) { try { fn(t); } catch (e) { /* one waiter's problem */ } }
    }

    function loadTex(name, repeat, onReady) {
        if (typeof THREE.TextureLoader === 'undefined') return null;
        // The waiting list hangs off the texture itself: this build of three has
        // no userData on a Texture, so there is nowhere else to put it.
        const waitFor = (t) => {
            if (!onReady) return;
            if (t.image && t.image.width) { onReady(t); return; }
            (t._vwWaiting || (t._vwWaiting = [])).push(onReady);
        };
        let t = _texCache.get(name);
        if (t) { waitFor(t); return t; }
        const stand_in = () => {
            if (!_texMissing.has(name)) {
                _texMissing.add(name);
                console.warn('[VoxelWorld] no texture at img/textures/' + name +
                             ' - standing the turf in for it');
            }
            // The fallback itself missing is the end of the line: leave the
            // material on its own base colour rather than looping.
            if (name === TEX_FALLBACK) { if (t) t._vwWaiting = null; return; }
            loadTex(TEX_FALLBACK, null, (ftex) => {
                if (!t || !ftex || !ftex.image) return;
                t.image = ftex.image;
                t.needsUpdate = true;
                _flushWaiters(t);
            });
        };
        t = new THREE.TextureLoader().load('img/textures/' + name,
            (tex) => _flushWaiters(tex), undefined, stand_in);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = _maxAniso;
        if (repeat) t.repeat.set(repeat, repeat);
        if (THREE.SRGBColorSpace !== undefined) t.colorSpace = THREE.SRGBColorSpace;
        else if (THREE.sRGBEncoding !== undefined) t.encoding = THREE.sRGBEncoding;
        _texCache.set(name, t);
        waitFor(t);
        return t;
    }

    // =========================================================================
    // Blocks
    // =========================================================================
    // The one palette everything built in this world is made of. A block is a
    // name, a picture and a SPAN - how many world units one repeat of that
    // picture covers - and nothing else: no geometry, no rules, no behaviour.
    // Four world units are a metre, so a span of 48 is a twelve metre repeat.
    //
    // It exists because a settlement used to be built out of flat colours and
    // canvases painted at runtime. Every facade in the world was a 2D context
    // filled pixel by pixel the first time anybody drove into a town - six
    // tones, two canvases each, twelve texture uploads in the frame the town
    // streamed in - and a bench, a fence, a haystack and a parked car were four
    // untextured boxes in four different shades. Now they are blocks: the
    // pictures are built once by tools/build_voxel_blocks.js and shipped, the
    // materials are made once per session and shared by every square in the
    // world, and a town costs the loader a handful of PNGs it probably already
    // has.
    //
    // SHARED, and deliberately so. The material for `brick` is the same object
    // for every building on every square, which is what lets the house mesher
    // weld a whole town into one mesh per block instead of one per building.
    // They outlive a scene and are only let go when the world itself comes
    // down (disposeBlockMaterials).
    const BLOCKS = {};
    function defBlock(key, span, opts) {
        BLOCKS[key] = Object.assign({
            key, span,
            tex: key + '.png',
            color: 0xffffff,
            // A facade wears its lit windows as an emissive sheet of the same
            // name with _lit on the end.
            lit: false,
            transparent: false,
            opacity: 1
        }, opts || {});
        return BLOCKS[key];
    }

    // --- what a wall is made of ---------------------------------------------
    // A facade is measured in BAYS rather than in metres: one window bay across
    // and one storey up, four of each to a sheet. 24 units to a bay and 11 to a
    // storey (see SETTLE.storeyH), so the sheet spans 96 by 44.
    const FACADE_SPAN_U = 96;
    const FACADE_SPAN_V = 44;
    for (const k of ['brick', 'plaster', 'concrete', 'sandstone', 'stone', 'timber']) {
        defBlock('facade_' + k, FACADE_SPAN_U, { spanV: FACADE_SPAN_V, lit: true });
    }
    // --- masonry -------------------------------------------------------------
    defBlock('brick', 48);
    defBlock('brick_dark', 48);
    defBlock('brick_pale', 48);
    defBlock('cobble', 40);
    defBlock('stone', 64);
    defBlock('granite', 56);
    defBlock('basalt', 56);
    defBlock('marble', 72);
    defBlock('sandstone', 64);
    defBlock('limestone', 56);
    defBlock('concrete', 64);
    defBlock('plaster', 56);
    defBlock('stucco', 56);
    defBlock('adobe', 48);
    defBlock('obsidian', 40);
    // --- timber --------------------------------------------------------------
    defBlock('plank', 40);
    defBlock('timber', 40);
    defBlock('log', 32);
    defBlock('deadwood', 40);
    defBlock('floor', 44);
    // --- roofing -------------------------------------------------------------
    defBlock('roof_tile', 26);
    defBlock('roof_slate', 26);
    defBlock('roof_shop', 26);
    defBlock('roof_metal', 34);
    defBlock('thatch', 30);
    // --- glazing and metal ---------------------------------------------------
    defBlock('glass', 22, { transparent: true, opacity: 0.62 });
    defBlock('glass_dark', 22, { transparent: true, opacity: 0.72 });
    defBlock('glass_stain', 22, { transparent: true, opacity: 0.78 });
    defBlock('metal', 36);
    defBlock('iron', 36);
    defBlock('copper', 36);
    defBlock('rust', 40);
    // --- ground and cover -----------------------------------------------------
    defBlock('asphalt', 96);
    defBlock('pavement', 40);
    defBlock('dirt', 72);
    defBlock('soil', 64);
    defBlock('gravel', 44);
    defBlock('sand', 64);
    defBlock('snow', 64);
    defBlock('clay', 56);
    defBlock('mud', 56);
    defBlock('salt', 48);
    defBlock('ash', 48);
    defBlock('rock', 56);
    defBlock('grass', 56);
    defBlock('leaf', 26);
    defBlock('crop', 20);
    defBlock('hay', 24);
    defBlock('carpet', 24);
    defBlock('water', 64, { transparent: true, opacity: 0.85 });
    defBlock('ice', 48, { transparent: true, opacity: 0.9 });
    defBlock('mark', 24);
    defBlock('pole', 12);
    defBlock('awning', 20);
    defBlock('paint', 24);
    // --- hot ------------------------------------------------------------------
    defBlock('lava', 40, { lit: false, glow: 0.9 });
    defBlock('magma', 40, { glow: 0.6 });
    defBlock('glowstone', 40, { glow: 1 });
    defBlock('crystal', 36, { glow: 0.35 });

    // One material per block, made on first use and then shared by the whole
    // world. `tint` leans a block toward a colour without needing a texture of
    // its own - a red awning and a blue one are the same picture.
    const _blockMats = new Map();
    // `tint` leans a block toward a colour without needing a picture of its own
    // (a red awning and a blue one are one tile). `rep` is how many times that
    // picture repeats across the SHAPE it is drawn on, for the things that are
    // scaled unit boxes with no UVs worth the name - a road five hundred units
    // long, a pavement, a field. Anything welded with real UVs (a wall, a roof:
    // see House.Mesher) leaves it alone and measures the repeat itself.
    function blockMaterial(key, tint, rep) {
        const def = BLOCKS[key];
        // A block nobody declared is the turf, the same as a block whose
        // picture is missing (see TEX_FALLBACK). Never a second lookup that
        // could miss as well.
        if (!def) return BLOCKS.grass ? blockMaterial('grass', tint, rep) : null;
        const ck = key + (tint ? '|' + tint : '') + (rep && rep !== 1 ? '#' + rep : '');
        let m = _blockMats.get(ck);
        if (m) return m;
        if (typeof THREE === 'undefined' || !THREE.MeshLambertMaterial) return null;
        const o = { color: tint || def.color };
        if (def.transparent) { o.transparent = true; o.opacity = def.opacity; }
        if (def.glow) { o.emissive = new THREE.Color(0xffffff); o.emissiveIntensity = def.glow; }
        m = new THREE.MeshLambertMaterial(o);
        // A repeat of its own means a texture of its own: the loader's are
        // SHARED, and winding one of them up to eight would tile the ground of
        // the whole world eight times over as well. A clone shares the image
        // and nothing else, so it costs no memory worth the name.
        const skin = (tex) => {
            if (!rep || rep === 1 || !tex.clone) return tex;
            const t = tex.clone();
            t.repeat.set(rep, rep);
            t.needsUpdate = true;
            t.__vwClone = true;
            return t;
        };
        // The picture lands when it lands: a material built around a texture
        // whose image has not arrived samples an empty one and draws black.
        loadVoxelTex(def.tex, 1, (tex) => {
            m.map = skin(tex);
            if (def.glow) m.emissiveMap = m.map;
            m.needsUpdate = true;
        });
        if (def.lit) {
            loadVoxelTex(def.key + '_lit.png', 1, (tex) => {
                m.emissiveMap = skin(tex);
                m.emissive = new THREE.Color(0xffffff);
                m.emissiveIntensity = 0.8;
                m.needsUpdate = true;
            });
        }
        // A short integer of its own, so a batch can key its buckets on a
        // number rather than concatenating a UUID per instance.
        m.__vwBlock = key;      // which block it is, tint and all set aside
        m.__vwId = _blockMats.size + 1;
        _blockMats.set(ck, m);
        return m;
    }

    // How far one repeat of a block's picture reaches, across and up. Handed to
    // the house mesher, which writes real UVs and therefore has to be told.
    function blockSpan(key) {
        const def = BLOCKS[key] || BLOCKS.concrete;
        return { su: def.span, sv: def.spanV || def.span };
    }

    function disposeBlockMaterials() {
        for (const m of _blockMats.values()) {
            if (!m) continue;
            // A cloned texture belongs to this material alone; the shared ones
            // stay on the loader's cache for the next world.
            for (const slot of ['map', 'emissiveMap']) {
                const t = m[slot];
                if (t && t.__vwClone && t.dispose) t.dispose();
            }
            if (m.dispose) m.dispose();
        }
        _blockMats.clear();
    }

    const Blocks = {
        table: BLOCKS, def: defBlock, material: blockMaterial, span: blockSpan,
        dispose: disposeBlockMaterials,
        has: (k) => !!BLOCKS[k],
        keys: () => Object.keys(BLOCKS)
    };

    // =========================================================================
    // Perlin Noise (self-contained, seeded)
    // =========================================================================
    const _perm = new Uint8Array(512);

    // The one seed the 3D world is shaped by, and it never changes. Every
    // height, every river, every cave and every island in VoxelWorld comes off
    // this number, so a world square is the same piece of ground in every
    // savegame and in every world folder: what a world's own seed decides is
    // the BIOME MAP laid over that ground, not the ground itself. It also
    // means a dig log (save/worlds/<name>/voxelworld.json) still describes the
    // rock it was cut out of however it is loaded.
    const VOXEL_WORLD_SEED = 19002001;

    function initPerlinWithSeed(seed) {
        const p = new Uint8Array(256);
        for (let i = 0; i < 256; i++) p[i] = i;
        let s = ((seed || 19002001) >>> 0);
        for (let i = 255; i > 0; i--) {
            s = (s * 1664525 + 1013904223) >>> 0;
            const j = s % (i + 1);
            const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
        }
        for (let i = 0; i < 512; i++) _perm[i] = p[i & 255];
    }
    initPerlinWithSeed(VOXEL_WORLD_SEED);

    function _pFade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    function _pLerp(t, a, b) { return a + t * (b - a); }
    function _pGrad(h, x, y, z) {
        h &= 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
        return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
    }
    function _perlin(x, y, z) {
        z = z || 0;
        const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
        x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
        const u = _pFade(x), v = _pFade(y), w = _pFade(z);
        const A  = _perm[X] + Y,   AA = _perm[A] + Z,   AB = _perm[A + 1] + Z;
        const B  = _perm[X + 1] + Y, BA = _perm[B] + Z, BB = _perm[B + 1] + Z;
        return _pLerp(w,
            _pLerp(v,
                _pLerp(u, _pGrad(_perm[AA],   x,     y,     z),   _pGrad(_perm[BA],   x - 1, y,     z)),
                _pLerp(u, _pGrad(_perm[AB],   x,     y - 1, z),   _pGrad(_perm[BB],   x - 1, y - 1, z))),
            _pLerp(v,
                _pLerp(u, _pGrad(_perm[AA+1], x,     y,     z-1), _pGrad(_perm[BA+1], x - 1, y,     z-1)),
                _pLerp(u, _pGrad(_perm[AB+1], x,     y - 1, z-1), _pGrad(_perm[BB+1], x - 1, y - 1, z-1))));
    }
    function _fbm(x, y, octaves, lacunarity, gain) {
        octaves   = octaves   || 5;
        lacunarity = lacunarity || 2.0;
        gain      = gain      || 0.5;
        let val = 0, amp = 0.5, freq = 1, max = 0;
        for (let i = 0; i < octaves; i++) {
            val += _perlin(x * freq, y * freq) * amp;
            max += amp;
            freq *= lacunarity;
            amp  *= gain;
        }
        return val / max;
    }

    // =========================================================================
    // Constants
    // =========================================================================
    // World render scale. The 2D world map is still a 256x256 grid, but each tile
    // is drawn WORLD_SCALE times larger than the old 250-unit tile so the driving
    // world feels vast. Vehicles (the camper and traffic) stay at their real size
    // - they are the 1x reference - while the scenery (terrain, cities, biome
    // decorations, enemies) is drawn up to this scale. Driving speed, fuel burn,
    // fog and the sky dome all scale off WORLD_SCALE so the drive still feels the
    // same behind the wheel; only the sense of scale changes.
    const WORLD_SCALE      = 2;
    const WORLD_TILE_SIZE  = 250 * WORLD_SCALE;
    const WORLD_MAP_ID     = 315;   // the 2D world map; player tile = Vars 43/44
    const CAMPER_MAX_FUEL  = 100;
    // Legacy RPG Maker variable id for camper fuel, kept ONLY as a fallback for
    // the rare case where the core VehicleSystem (which owns window.VehicleFuel)
    // is not loaded. Fuel is otherwise managed in the per-vehicle window.VehicleFuel
    // store keyed 'camper' - never in a shared RPG Maker variable. Sharing var 65
    // is what let other events drain the tank in a couple of metres.
    const FUEL_VAR         = 65;
    // Fuel burn in the drive scene is purely distance-based (litres per world unit
    // actually travelled), never time-based. The world is huge (a tile is
    // WORLD_TILE_SIZE = 250 units), so the rate is still small - but now that fuel
    // lives in its own per-vehicle store (no more shared-variable draining), it is
    // set high enough that driving actually consumes the tank: at 0.0006 L/unit a
    // full 100 L tank covers ~167k units (~670 tiles) of driving. Standing still
    // costs nothing.
    // Burn is per world unit travelled; since the world (and the units the camper
    // covers per second) are now WORLD_SCALE times bigger, the per-unit rate is
    // divided by WORLD_SCALE so a tank still covers the same NUMBER OF TILES as
    // before (~670 tiles on a full 100 L tank). Standing still costs nothing.
    const FUEL_PER_UNIT    = 0.0006 / WORLD_SCALE;
    // Same burn rate expressed per km (50 world units = 1 km), kept for any callers
    // that reason about fuel per km; the drive scene itself burns per world unit.
    // WORLD_TILE_SIZE scales up while FUEL_PER_UNIT scales down, so this is unchanged.
    const FUEL_PER_KM      = FUEL_PER_UNIT * (WORLD_TILE_SIZE / 5);
    // Liminal (fast-travel) drive covers its apparent map distance in a
    // handful of real seconds, so burning fuel by distance moved (the rule
    // for ordinary driving, above) would drain the tank for a trip that isn't
    // really being driven. It burns instead at a flat rate per REAL second,
    // independent of the warp speed, and deliberately tiny - orders of
    // magnitude below what covering the same apparent distance would cost at
    // the wheel, so a long warp trip still only sips the tank.
    const LIMINAL_FUEL_PER_SEC    = 0.00003;
    const LIMINAL_BOOST_FUEL_MULT = 6;   // still costs more to boost through it, just not steeply
    const ZOOM_MAX         = 32000 * WORLD_SCALE;

    // -------------------------------------------------------------------------
    // Raw gamepad access for the shoulder triggers and Y button. RPG Maker's
    // gamepadMapper only exposes the analog sticks/face buttons through Input
    // and ignores the triggers, so these are polled directly: L2/R2 zoom the
    // chase/free camera, Y toggles first/third person (mirrors TAB).
    // -------------------------------------------------------------------------
    const GamepadRaw = {
        L2: 6, R2: 7, Y: 3,
        _heldY: false,
        pads() { return navigator.getGamepads ? (navigator.getGamepads() || []) : []; },
        connected() {
            for (const p of this.pads()) if (p && p.connected) return true;
            return false;
        },
        // Analog value 0..1 (digital buttons report 0 or 1).
        value(index) {
            let v = 0;
            for (const p of this.pads()) {
                if (!p || !p.connected || !p.buttons) continue;
                const b = p.buttons[index];
                if (!b) continue;
                const bv = typeof b.value === 'number' ? b.value : (b.pressed ? 1 : 0);
                if (bv > v) v = bv;
            }
            return v;
        },
        pressed(index) { return this.value(index) > 0.25; },
        // Edge-triggered: true only on the frame Y goes down.
        triggeredY() {
            const now = this.pressed(this.Y);
            const was = this._heldY;
            this._heldY = now;
            return now && !was;
        }
    };
    const WATER_LEVEL_Y    = -70 * WORLD_SCALE;   // seabed depth dug for water tiles (room to dive)
    // Road dimensions (world units, FIXED - not tile-scaled). Sized to the 1x
    // vehicles (the camper is ~42 wide), so the road stays a believable ribbon
    // across the vast tiles instead of a runway as wide as a city block.
    // A road out here is the DUAL CARRIAGEWAY the 2D generator lays down
    // (ProceduralMapRoadGenerator: two 7-tile roads with a 3-tile median, each
    // with a broken line down its own middle). So: two carriageways, a median
    // between them, and each carriageway is TWO LANES with the paint down the
    // middle of it. Traffic keeps to one of those lanes rather than straddling
    // the line, and the carriageway a car takes is decided by which way it is
    // going.
    const ROAD_LANE_W      = 60;                        // one carriageway (both its lanes)
    const ROAD_GAP         = 30;                        // median between the two carriageways
    const ROAD_TOTAL_W     = ROAD_LANE_W * 2 + ROAD_GAP; // full road width (~150)
    const ROAD_LANE_OFF    = ROAD_GAP * 0.5 + ROAD_LANE_W * 0.5; // centre of a carriageway: its own broken line
    const ROAD_HALF_LANE   = ROAD_LANE_W * 0.25;        // from that line to the middle of either lane
    // The asphalt is laid on the same blended height the camper drives at, so a
    // road tile's own ground is dropped by this much: a flat slab used to be cut
    // through by its terrain wherever the tile blended toward a mountain or a
    // shore, and the two surfaces flickered against each other. The drop reads
    // as an ordinary shoulder (~40 cm at this scale) on the verge.
    const ROAD_SINK        = 2;
    // Lane paint sits proud of the asphalt: each dash is a flat quad, so on a
    // sloped tile its far end has to clear the surface it is painted on.
    const ROAD_MARK_LIFT   = 1;

    // ---- The carriageway is a real road, not a run of cubes -----------------
    // A motorway drawn out of voxels reads as a staircase: the cubes step in
    // 1.25 m, the paint is a row of grey blocks, and the whole thing looks like
    // a quarry track. So the ground under a road square is a ROADBED - graded,
    // dropped by ROAD_BED_DROP, and never seen - and the surface the eye and the
    // wheels get is a smooth extruded ribbon laid over it: asphalt, hard
    // shoulder, edge lines, dashed lane lines, a kerbed median with a steel
    // barrier down it and armco on the verges. VoxelWorldTerrain lays it, the
    // field answers for its height (VoxelField.heightAt), so the camper drives
    // on exactly what is drawn.
    const ROAD_BED_DROP    = 8;    // roadbed cubes sit this far under the paving
    const ROAD_PAVE_T      = 3;    // thickness of the slab itself, at its edge
    const ROAD_SKIRT       = 26;   // the embankment dropped from the paved edge
    const ROAD_SHOULDER_W  = 11;   // hard shoulder, inside the paved width
    const ROAD_LINE_W      = 2.6;  // painted line
    const ROAD_DASH_ON     = 20;   // dashed lane line, on/off along the road
    const ROAD_DASH_OFF    = 15;
    const ROAD_BARRIER_H   = 13;   // steel barrier and armco height
    const ROAD_KERB_H      = 3;    // the median kerb the grass sits behind
    // Colours the ribbon is painted with.
    const ROAD_COL = {
        asphalt:  0x38383d,
        shoulder: 0x33333a,
        paint:    0xe6e4d8,
        median:   0x4a5a35,
        kerb:     0x8f8c84,
        skirt:    0x5b5340,
        steel:    0x9aa0a6
    };

    // Fog densities (1/units). Divided by WORLD_SCALE so the haze reaches the same
    // number of tiles as before on the enlarged world.
    const FOG_DAY          = 0.0005   / WORLD_SCALE;   // normal driving haze
    const FOG_FREE         = 0.000005 / WORLD_SCALE;   // free-cam wide survey view
    const FOG_UNDERWATER   = 0.011    / WORLD_SCALE;   // murky underwater
    // Underground. A cave is dark and close: the light the party carries is the
    // only light in it, the fog shuts down to a few metres, and the sky is rock.
    // The caves themselves are the cave field in VoxelWorldField.js.
    const FOG_CAVE         = 0.020    / WORLD_SCALE;
    const CAVE_SKY         = 0x0b0908;                // what is overhead down there
    const CRITICAL_PARTS   = ['Engine', 'Transmission', 'Brakes', 'Steering'];
    const SECONDARY_PARTS  = ['Battery', 'Tires', 'Suspension'];  // i18n-ignore  VehicleSystemRepair record keys

    // Effective camper tank size, honoring the Expanded Tank upgrade (VehicleUpgrades).
    // Falls back to the base CAMPER_MAX_FUEL when the upgrade plugin is unavailable.
    function camperMaxFuel() {
        if (window.VehicleFuel) return window.VehicleFuel.max('camper');
        return (window.VehicleUpgrades && window.VehicleUpgrades.effectiveMaxFuel)
            ? window.VehicleUpgrades.effectiveMaxFuel('camper', CAMPER_MAX_FUEL)
            : CAMPER_MAX_FUEL;
    }

    // Camper fuel accessors. Primary storage is the per-vehicle window.VehicleFuel
    // store (key 'camper'); the RPG Maker variable is only a legacy fallback.
    function camperFuelGet() {
        if (window.VehicleFuel) return window.VehicleFuel.get('camper');
        return (typeof $gameVariables !== 'undefined')
            ? $gameVariables.value(FUEL_VAR) : camperMaxFuel();
    }
    function camperFuelSet(litres) {
        if (window.VehicleFuel) { window.VehicleFuel.set('camper', litres); return; }
        if (typeof $gameVariables !== 'undefined') {
            $gameVariables.setValue(FUEL_VAR, Math.max(0, Math.min(camperMaxFuel(), litres)));
        }
    }
    function camperFuelConsume(litres) {
        if (window.VehicleFuel) { window.VehicleFuel.consume('camper', litres); return; }
        camperFuelSet(camperFuelGet() - litres);
    }

    // First-person walk box, sized to the compact camper interior
    // (about 8 wide x 22 long inside the walls). Lets you roam the cabin / seats.
    const CAMPER_BOUNDS = {
        minX: -3.5, maxX: 3.5,
        minZ: -11, maxZ: 11
    };

    // Driver's seat (camper-local space, forward = +Z). The first-person driving
    // view pins the eye here, looking out through the windshield while the WASD
    // keys steer the camper instead of walking the cabin. The driver faces +Z,
    // so +X is to the driver's LEFT: a left-hand-drive seat sits at +X. The
    // cockpit hardware in CamperModel (_buildCockpit) is mirrored to line up with
    // this eye. Eye kept low, just above the wheel/gauge cluster (dash top ~5.75,
    // wheel rim top ~6.1), so the cockpit reads in view instead of the camera
    // floating above the dashboard.
    const DRIVER_SEAT = { x: 1.2, y: 6.4, z: 8.0 };

    // =========================================================================
    // The ship's bridge
    // =========================================================================
    // The camper has a cabin you can get up and walk about in; the ship had a
    // hull and nowhere to stand in it. The bridge is its counterpart, and it is
    // built to the same conventions: the vehicle's own frame, forward is +Z,
    // +X is the pilot's LEFT, four units to the metre.
    //
    // A room about five metres across and seven deep: the helm on the centre
    // line under the forward viewport, four stations round it for the party,
    // and the walls close enough that walking it feels like a room rather than
    // a hangar. CAMPER_BOUNDS is the camper's; this is the ship's, and
    // _walkBounds() picks whichever the party is actually inside.
    const SHIP_BRIDGE_BOUNDS = {
        minX: -9.0, maxX: 9.0,
        minZ: -13.0, maxZ: 13.0
    };
    // The helm: where the eye sits when the ship is being flown in first person,
    // and where the pilot stands up from when they leave it. Level with the
    // console, looking out of the viewport.
    const SHIP_HELM_SEAT = { x: 0, y: 6.6, z: 8.0 };
    // The stations the rest of the party take, in the same frame. Nobody sits
    // in the pilot's chair but the pilot.
    const SHIP_BRIDGE_SEATS = [
        { x:  5.4, y: 6.3, z:  2.6 },   // to the pilot's left, forward
        { x: -5.4, y: 6.3, z:  2.6 },   // and right
        { x:  5.4, y: 6.3, z: -4.2 },   // the two aft stations
        { x: -5.4, y: 6.3, z: -4.2 }
    ];

    // Setting a ship down. Flying is a cruise at a held clearance; to land, the
    // pilot brings it low and slow, and at that point the ground takes it.
    const SHIP_LAND_KMH   = 55;    // no faster than this, or it is a crash landing
    const SHIP_LAND_CLEAR = 26;    // and no higher than this above the ground
    const SHIP_FLY_MIN    = 12;    // the lowest a pilot may hold it without landing
    const SHIP_FLY_MAX    = 900;   // and the highest the cruise will climb to
    const SHIP_CLIMB_RATE = 260;   // world units per second on the climb/descend keys

    // Where everybody else rides, per vehicle, in the vehicle's OWN frame:
    // +z is the way it is pointing, +y is up. The party used to vanish the
    // moment the camper moved off - the followers were simply hidden while
    // driving - so nobody was ever aboard anything.
    //
    // A camper, a car and a boat have seats in them. A bike and a broom have
    // one saddle and no room for a passenger, so the party rides ALONGSIDE on
    // machines of their own (see RIDE_ALONGSIDE), which is the only honest way
    // to put four people on a bicycle.
    const RIDER_SEATS = {
        camper:   [{ x: -1.4, y: 6.4, z: 8.0 },     // beside the driver
                   { x:  1.4, y: 6.2, z: -1.0 },    // the bench behind the cab
                   { x: -1.4, y: 6.2, z: -1.0 },
                   { x:  0.0, y: 6.2, z: -8.0 }],   // and the pet in the back
        car:      [{ x: -1.3, y: 2.6, z: 1.4 },
                   { x:  1.3, y: 2.5, z: -1.6 },
                   { x: -1.3, y: 2.5, z: -1.6 },
                   { x:  0.0, y: 2.4, z: -3.0 }],
        boat:     [{ x: 0, y: 1.4, z: 1.2 },
                   { x: 0, y: 1.4, z: -0.4 },
                   { x: 0, y: 1.4, z: -1.9 },
                   { x: 0, y: 1.4, z: -3.2 }],
        // The ship's are the bridge's own stations: the party is sitting at
        // the consoles of the room they can get up and walk about in, rather
        // than at four points in the middle of the hull.
        starship: SHIP_BRIDGE_SEATS
    };

    // Vehicles nobody can ride pillion on: the party keeps up on two more of
    // the same thing, drawn beside the leader's. Offsets are in world units,
    // across the direction of travel and a little behind.
    const RIDE_ALONGSIDE = {
        bike:  { spread: 16, back: 9, seat: { x: 0, y: 5.0, z: -0.4 } },
        broom: { spread: 18, back: 11, seat: { x: 0, y: 5.6, z: -0.6 } }
    };
    // At most this many machines ride beside the leader's.
    const ALONGSIDE_MAX = 2;


    // On-foot exploration (player detached from the parked camper). Speeds are in
    // world units/sec. There is no tether: the player can walk as far from the
    // parked camper as they like and simply walks back to climb in again.
    const FOOT_WALK         = 46;     // brisk walk speed
    const FOOT_SPRINT_MULT  = 1.85;   // hold sprint to move this much faster
    const FOOT_CROUCH_MULT  = 0.45;   // and crouch to move this much slower
    const FOOT_EYE_CROUCH   = 4;      // eye height crouched (1 m)
    const FOOT_BODY_R       = 4;      // how wide the walker is, for walls (1 m)
    // Walls, on foot. There is no cap on the kicks: as long as a wall is
    // there to push off, another press pushes off it, so a tall face can be
    // climbed a kick at a time. Sprint held on a wall runs it instead.
    const WALL_STICK_R      = 3;      // reach past the body that still counts as on a wall
    const WALL_RUN_CLIMB    = 30;     // how fast a wall run carries you up the face
    const WALL_RUN_TIME     = 2.2;    // seconds of run in a wall, given back by a kick or the ground
    const RECOIL_KICK       = 78;     // shove a <RecoilJump> weapon gives its firer
    const FOOT_GRAVITY      = 230;    // downward accel (snappier arc than the old floaty jump)
    const FOOT_JUMP_VEL     = 62;     // initial jump velocity
    // Local co-op: how fast a stick turns a walker, in radians a second at full
    // deflection. There is one mouse in the room and Player 1 has it, so the
    // second player looks about with a stick and this is the whole of how fast
    // that is. Slower up and down than side to side, the way every pad-driven
    // first-person game is, because a stick has no wrist.
    const PAD_LOOK_X        = 2.6;
    const PAD_LOOK_Y        = 1.7;
    const TALK_RANGE        = 12;     // how close to a townsperson counts as up to them (3 m)
    const LOOT_RANGE        = 22;     // how close to a body counts as standing over it
    // Town furniture you cannot walk through, and how wide it is.
    const SOLID_PROPS = { fountain: 17, well: 9, tree: 3, lamp: 2, signal: 2, car: 8, shed: 8, haystack: 7 };
    // =========================================================================
    // The scattered sprites, as things in the way
    // =========================================================================
    // Every flat sprite standing out in the country - the trees, the rocks, the
    // barrels and gravestones and crates a biome is furnished with - is a thing
    // you walk into rather than through. What follows is how wide each kind is,
    // as a fraction of the sprite's own drawn size.
    //
    // A tree's number is small on purpose: what stops you is the TRUNK, and a
    // canopy thirty units across has a trunk you could put your arms round. A
    // rock is nearly all of its sprite. Ground cover stops nothing, because
    // walking through long grass is walking through long grass.
    // A chest is solid, and a small one: it is a thing you stand at rather than
    // walk over, and it is what tells the action prompt there is one there.
    const PROP_RADIUS = { tree: 0.10, rock: 0.34, plant: 0, prop: 0.28, chest: 0.35 };
    // Under a metre and a half of it there is nothing to bump into either: a
    // pebble is scenery.
    const PROP_MIN_R  = 6;
    // What it takes to put a tree through a windscreen. Below this the vehicle
    // is stopped by it like anything else; above it the tree comes down.
    const PROP_SMASH_KMH = 26;
    // What separates a crash from a knock. Only a vehicle driven INTO another
    // vehicle at more than this counts as a crash: it is what the driver's
    // reflex save is rolled against and the only thing that costs the camper
    // any real condition. Everything else the bumper meets out here - a wall,
    // a bank of voxels, a fence, a crate, a car that came into the camper
    // rather than the other way round - is felt through the camera and paid
    // for in speed, never in parts.
    const TRAFFIC_CRASH_KMH = 20;
    // Footsteps, by what is underfoot. All of them live in audio/se/StepSound.
    // Which of the game's own footstep materials each voxel is made of. The 3D
    // world has no tiles, no region ids and no terrain tags, so it cannot ask
    // ToshA_Footsteps the way a 2D map does - but it knows exactly what cube is
    // under the foot, and every cube is one of these. The names are the keys of
    // js/db/WorldGen/FootstepMaterials.json, so a walk out here sounds like a
    // walk anywhere else in the game and gains whatever is added to that table.
    // (window.Footsteps.play is the door; see ToshA_Footsteps.js.)
    const VOXEL_STEP_MATERIAL = {
        grass: 'grass', dirt: 'dirt', rock: 'stone', sand: 'sand', snow: 'snow',
        asphalt: 'concrete', mark: 'concrete', gravel: 'gravel', ore: 'stone',
        clay: 'dirt', ice: 'ice', ash: 'gravel', bedrock: 'stone', mud: 'mud',
        salt: 'gravel',
        // The blocks. Everything that is worked stone sounds like stone,
        // everything sawn sounds like wood, and a seam sounds like the rock it
        // is set in.
        granite: 'stone', basalt: 'stone', marble: 'stone', sandstone: 'stone',
        limestone: 'stone', obsidian: 'stone', lava: 'stone', magma: 'stone',
        crystal: 'stone', glowstone: 'stone', brick: 'concrete', cobble: 'stone',
        concrete: 'concrete', plaster: 'concrete', plank: 'wood', timber: 'wood',
        thatch: 'grass', glass: 'concrete', iron: 'metal', copper: 'metal',
        ore_iron: 'stone', ore_coal: 'stone', ore_silica: 'stone',
        ore_bone: 'stone', ore_titanium: 'stone', ore_sulphur: 'stone',
        ore_crystal: 'stone', ore_varlenia: 'stone', ore_arcane: 'stone',
        ore_ethereal: 'stone', ore_quantum: 'stone', ore_meteor: 'stone'
    };

    // The fallback banks, for a world where the material table never loaded.
    const STEP_SOUNDS = {
        stone: ['StepSound/concrete01', 'StepSound/concrete03', 'StepSound/concrete05'],
        dirt:  ['StepSound/stepGraund', 'StepSound/stepGraund2', 'StepSound/stepGraund3'],
        grass: ['StepSound/stepFoliage', 'StepSound/stepFoliage2', 'StepSound/stepFoliage3'],
        sand:  ['StepSound/sand01', 'StepSound/sand03', 'StepSound/sand05'],
        snow:  ['StepSound/stepSnow', 'StepSound/stepSnow2', 'StepSound/stepSnow3'],
        rock:  ['StepSound/stepStone', 'StepSound/stepStone2', 'StepSound/stepStone3']
    };
    const FOOT_EYE          = 7;      // eye height above the ground while standing
    // Stacking. The 3D world is a DOM overlay laid over the game canvas, and
    // the game's own widgets are DOM too: a toast, the quick bar, the item
    // picker card. Left alone they are drawn UNDER the world and never seen, so
    // the world lifts them back over itself (see the scene's own surfaceDom).
    // The weapon in the party's hands sits just over the world and just under
    // all of them: it is part of the view, not part of the readout.
    const OVERLAY_Z         = 9999;
    const WEAPON_Z          = 10000;
    const WORLD_UI_Z        = 10050;
    // The game's own DOM widgets that belong over the 3D world, in the order
    // they are lifted. Each is raised only while the world is up and put back
    // exactly as it was when it comes down.
    // ...and a menu, which is anything else the game puts on the page while this
    // world is up. Above the world and the weapon, below the toasts: a
    // notification about what just happened has to be readable over the menu it
    // happened in.
    const MENU_Z            = 10020;
    // (The item favourites bar and the "use it on whom?" card it opens are NOT
    // on this list: they stand down entirely while this world is up, because
    // the world has a quick bar of its own in the same place along the bottom
    // of the screen. That bar is built at WORLD_UI_Z to begin with and needs no
    // lifting - see VoxelWorldHUD and ItemSystemHotbar's mapBarAllowed.)
    const WORLD_UI_IDS = [
        'html-toast-stack',            // Core/ParchmentToast.js
        'party-hud',                   // UI/PartyHud.js
        'map-legend'                   // Map/MapLegend.js
    ];
    // Water. A walker wades until the bottom drops away from under them, and
    // swims from there: on the surface with their head out, or under it, where
    // they go wherever they are looking. Speeds are world units/sec.
    const SWIM_DEPTH        = 7;      // water deeper than this cannot be stood up in (1.75 m)
    const SWIM_SPEED        = 30;     // a stroke is slower than a walk
    const SWIM_SPRINT_MULT  = 1.6;    // and a hard stroke is faster than a stroke
    const SWIM_RISE         = 34;     // kicking up for the surface
    const SWIM_SINK         = 30;     // duck-diving straight down
    const SWIM_FLOAT        = 2.4;    // how far the eye rides above the surface, afloat
    const SWIM_BUOYANCY     = 5.5;    // how hard the water pushes an idle swimmer up
    const SWIM_DRAG         = 3.2;    // how fast a swimmer loses way (eased velocity k)
    const SWIM_ENTRY_SPLASH = 16;     // a fall this fast into water is a splash
    // Flight. Whoever leads the party either knows the Fly skill or does not;
    // two taps on jump takes them off the ground and two more puts them back.
    const FLY_SKILL_ID      = 9;      // Skills.json 9, "Fly"
    const FLY_SPEED         = 88;     // level flight, world units/sec
    const FLY_SPRINT_MULT   = 2.1;    // hold sprint to really move
    const FLY_CLIMB         = 62;     // jump climbs, crouch descends
    const FLY_DRAG          = 2.6;    // how fast a flier loses way (eased velocity k)
    const JUMP_DOUBLE_MS    = 320;    // two taps inside this is the ask to fly
    const JUMP_DEBOUNCE_MS  = 70;     // the key and the pad both report one press
    const FOOT_CABIN_WALK   = 14;     // walk speed inside the cabin (world units/sec, applied directly)
    // Solid parked camper for the on-foot walker: a capsule around the chassis
    // (half-length along its heading + body radius) that the player cannot
    // walk through. Sized to the ~9 x 24 CamperModel footprint.
    const FOOT_VAN_HALF_LEN = 10;
    const FOOT_VAN_RADIUS   = 8;
    // How close (world units) the player has to stand to the rear door's hinge,
    // inside or outside, before it swings open on its own.
    const DOOR_AUTO_OPEN_RANGE = 70;

    // Speed bookkeeping. The physics runs in km/h space (fwd speed, GEARS,
    // engine/brake accels are all km/h), and KMH_TO_UNITS converts that to world
    // units/sec at the position-integration step. It is kept at the BASE value of 1
    // (unscaled): the camper drives at its real speed relative to the 1x scenery
    // (vehicles, trees, buildings), and the vast 25x tiles simply take longer to
    // cross. (Auto fast-travel still flies across the world within its duration -
    // see the auto block, which reports a sane km/h so it never trips the liminal
    // overdrive.)
    const CRUISE_KMH        = 80;     // efficiency sweet spot for the fuel model
    const MAX_KMH           = 1666;   // absolute cap (turbo overdrive)
    const KMH_TO_UNITS      = 1;      // world units/sec per km/h (base, unscaled)
    // Liminal drive (auto fast-travel): cruise speed and the ramp-up time to
    // reach it, so the camper eases into warp speed instead of snapping to it.
    // Ease-out ramp (see the rampT*(2-rampT) curve below) reaches full cruise
    // exactly at LIMINAL_ACCEL_SEC, so this clears 10,000 km/h at 20s.
    const LIMINAL_TOP_KMH   = 12000;
    const LIMINAL_ACCEL_SEC = 20;
    // Terrain streaming normally keeps up with driving (radius 5, 6 chunk
    // builds/frame - see VoxelTerrain), but liminal drive crosses
    // roughly 45+ tiles/sec at LIMINAL_TOP_KMH, far outrunning that budget and
    // leaving gaps where the always-present WaterPlane shows through and new
    // chunks never finish building. Both are widened only while the autopilot
    // is actually driving (see _isFastTravelActive() gating below).
    const LIMINAL_TERRAIN_RADIUS = 22;
    const LIMINAL_BUILD_BUDGET   = 110;

    // Driving physics: forward force through a 5-speed automatic gearbox,
    // quadratic air drag, surface-dependent rolling resistance and lateral
    // grip, gravity along the terrain grade, and a speed-sensitive steering
    // lock feeding a bicycle model. Velocity persists in world space, so the
    // camper can slide (lateral slip) instead of moving on rails.
    const WHEELBASE         = 18;     // world units between axles
    const MAX_STEER_LOCK    = 0.52;   // rad of steering lock at standstill
    const STEER_FALLOFF     = 0.011;  // lock shrinks with speed: lock/(1+v*k)
    // The camper pulls far harder than a real van and keeps pulling: the engine
    // force is high, the gearbox is spaced wide and air drag is light, so it
    // reaches its natural top (see NATURAL_TOP) in a handful of seconds rather
    // than a slow minute-long climb.
    const ENGINE_ACCEL      = 89.6;   // peak engine force (units/s^2) in top gear
    const GEARS             = [40, 82, 138, 208, 292];      // shift-up speeds (km/h)
    const GEAR_FORCE        = [1.9, 1.5, 1.25, 1.0, 0.85];  // per-gear torque mult
    const SHIFT_TIME        = 0.16;   // torque-cut pause on a gear change
    const BRAKE_DECEL       = 240;    // units/s^2 on the brakes
    const HANDBRAKE_DECEL   = 130;    // units/s^2 handbrake drag (rear lock)
    const HANDBRAKE_GRIP    = 0.25;   // lateral grip multiplier w/ handbrake on
    const REVERSE_MAX_KMH   = 28;
    const REVERSE_ACCEL     = 14;
    const DRAG_K            = 0.00056;// air drag: decel = k * v^2
    const SLOPE_ACCEL       = 30;     // gravity component along the grade
    const OVERDRIVE_KMHPS   = 180;    // turbo: km/h gained per second held (Shift)
    const OVERDRIVE_DECAY   = 90;     // decel above the natural top w/o turbo
    // Holding Shift (turbo) also multiplies the in-gear engine force, so the
    // camper launches / accelerates far harder while boosting, not just past the
    // natural top speed.
    const BOOST_ACCEL_MULT  = 5.0;
    // Liminal boost (holding Shift): the moment it is released, any speed carried
    // above the natural top collapses very fast, so the boost feels like a burst
    // rather than a coast. It also drinks fuel and bends the light around the
    // camper (below).
    const BOOST_RELEASE_DECAY = 900;  // km/h per second bled off when Shift released
    const BOOST_FUEL_MULT     = 16;   // fuel burn multiplier while boosting
    // Ramp physics: at speed, a steep uphill crest launches the camper off the
    // ground into a ballistic arc (it is NOT glued to the terrain anymore).
    // How much of a step a vehicle drives UP rather than ploughs through, in
    // voxels. Two blocks - two and a half metres - because two blocks is what a
    // player builds out of what they dug: a kerb, a step, a ramp onto a wall, a
    // staircase laid a block at a time. The ride height is a spring on the
    // ground under the wheels, so climbing one needs nothing more than not
    // knocking it down first (see the scene's _ploughAhead).
    const VEHICLE_STEP_UP   = 2;
    const LAUNCH_KMH        = 150;    // min speed to ramp off an incline
    const LAUNCH_GRADE      = 0.24;   // min uphill grade (nose-up) to launch
    const AIR_GRAVITY       = 130;    // downward accel (world units/s^2) while airborne
    // Speed distortion: above this speed light starts to bend AROUND the camper.
    // It is a screen-space lens (see SpeedWarpFx), a bubble the size of the
    // vehicle rather than the whole world folding over; the scenery itself is
    // never moved.
    const WARP_START_KMH    = 180;

    // =========================================================================
    // What each vehicle is like out here
    // =========================================================================
    // The 3D world was written for the camper and drove like the camper whatever
    // was on the road. Every vehicle the party owns can be taken into it now, and
    // they are not the same thing to drive.
    //
    //   top      the speed it will hold under its own power, km/h
    //   boost    it has something to hold down for more than that
    //   ceiling  what the boost will take it to
    //   warp     the boost bends space around it (SpeedWarpFx). A camper, a car
    //            and a starship do; a BICYCLE and a BROOM do not - pedalling
    //            harder and flying faster are not the same thing as tearing a
    //            hole in the world, and a broom at nine hundred is still just a
    //            broom going quickly.
    //   fly      it belongs in the air rather than on the ground
    const VEHICLE_DRIVE = {
        camper:   { top: 400,  boost: true,  ceiling: 1666, warp: true,  fly: false },
        car:      { top: 320,  boost: true,  ceiling: 1100, warp: true,  fly: false },
        starship: { top: 900,  boost: true,  ceiling: 4200, warp: true,  fly: true  },
        bike:     { top: 42,   boost: true,  ceiling: 120,  warp: false, fly: false },
        broom:    { top: 180,  boost: true,  ceiling: 900,  warp: false, fly: true  },
        boat:     { top: 90,   boost: false, ceiling: 90,   warp: false, fly: false }
    };
    // =========================================================================
    // What a vehicle is allowed to do to the world
    // =========================================================================
    // The ground under this world is destructible, and for a long time anything
    // with a bumper could take it apart just by being driven at it. It cannot:
    //
    //   NOTHING a ground vehicle drives into is destroyed while it is driving
    //   normally. A tree stops a bike the way it stops a walker.
    //
    //   TURBO is the exception, and the only one. Holding the accelerator past
    //   the vehicle's natural top is the game saying "through it, then": trees
    //   come down.
    //
    //   THE GROUND IS NEVER DESTROYED. No vehicle punches a hole in the terrain
    //   at any speed, boosting or not. Rock in the way stops it, and the digging
    //   tools are the only thing out here that takes the world apart.
    //
    //   NOT IN A TOWN. A town is somebody's, and a car at nine hundred is not an
    //   argument about planning permission. Inside a settlement a boosting
    //   vehicle destroys nothing at all and is stopped by nothing either: it
    //   goes straight through, and the town is still standing behind it.
    //
    //   A SHIP IS NOT A CAR. Flown into a mountainside it loses real condition
    //   (VehicleSystemRepair's 'airship') at any speed worth the name, boosting
    //   or not. The mountain is left standing.
    const SHIP_RAM_KMH      = 60;    // below this it is a scrape, not a ram
    const SHIP_RAM_DAMAGE   = 14;    // percent knocked off the parts it lands on
    const SHIP_RAM_EVERY    = 0.6;   // seconds between two rams

    // How high the starship has to climb before it is not in the world any more.
    // Mountains top out around 880 units, so this is well clear of the highest
    // ground anybody could fly off.
    const SHIP_ATMOSPHERE_Y = 2400;

    // =========================================================================
    // The Omega Tower
    // =========================================================================
    // The one thing on this world that is not terrain and not a town: a black
    // tower with gold on it, standing on six world squares by six and going up
    // until it is out of sight.
    //
    // WHERE. Destinations.json gives the place a `reservedTiles` of ["79,124"] -
    // the square the tower itself is on - and a `base` of 79,125, which is the
    // square south of it where a traveller is parked. The tower is the reserved
    // one, and the footprint is laid out around it.
    //
    // HOW BIG. Six squares is three thousand units across - seven hundred and
    // fifty metres - so the thing is a district, not a building. And it goes up
    // until the map runs out: nearly five kilometres, which is the ceiling of
    // this world rather than a number picked to be impressive. The world is
    // drawn to VIEW_FAR and nothing can be taller than the distance it is drawn
    // to, so the tower is that tall and the view distance is opened up to hold
    // it - stand at its foot, look up, and the spire is still there rather than
    // cut off against the sky. It is twenty times the highest mountain the world
    // can generate (MOUNTAIN_MAX_H).
    //
    // WHAT IT LOOKS LIKE. Not one shaft: a HEAP. Every deck of it carries a
    // whole cluster of art deco skyscrapers, and the next deck is laid over
    // them, smaller and turned, with the tallest of the towers underneath
    // pushing up past its edge. See VoxelWorldDecor's omegaTowerPlan.
    // =========================================================================
    // Gravity
    // =========================================================================
    // One number, in Earth gravities, that everything which falls in this world
    // is multiplied by. Earth is 1 and always will be; a walk on another world
    // sets it from that world's mass and radius (GalaxySim.surfaceGravity) and
    // it is put back the moment the walk ends.
    //
    // Only the DOWNWARD pull is scaled, never the push of a jump, which is what
    // makes low gravity read as low gravity: the same leg does the same work and
    // sends you six times as high off a moon, exactly as the footage of it does.
    // The bounds are what stays playable rather than what stays physical - the
    // real range runs from a comet you could jump off to a gas giant that would
    // flatten you, and neither is a place to walk about.
    const GRAVITY_MIN = 0.16;   // about our own moon
    const GRAVITY_MAX = 2.6;    // heavy enough to feel, light enough to move in
    let _gravityScale = 1;
    function setGravityScale(g) {
        _gravityScale = (typeof g === 'number' && isFinite(g) && g > 0)
            ? Math.max(GRAVITY_MIN, Math.min(GRAVITY_MAX, g))
            : 1;
        return _gravityScale;
    }
    function gravityScale() { return _gravityScale; }

    // =========================================================================
    // What this world remembers
    // =========================================================================
    // Everything anybody has done to the ground out here: every cube dug out or
    // put back, and every tree felled off a hillside.
    //
    // IT BELONGS TO THE WORLD, NOT TO THE SAVEGAME. Digging used to be kept on
    // $gameSystem, which meant a trench belonged to whichever slot happened to
    // be saved after it was dug: load an older save of the same world and the
    // hillside was whole again, while a second party exploring the same world
    // never saw any of it. It lives in save/worlds/<name>/voxelworld.json now,
    // beside the chests and the history, so the world is the world for every
    // party in it - the same rule ChestWorldState follows and for the same
    // reason.
    //
    //   { dug:    { "wx,wy": [cell, mat, cell, mat, ...] },
    //     felled: ["wx,wy:seed:i", ...] }
    //
    // Plain objects and arrays, so JsonEx writes them without help.
    const VOXEL_WORLD_FILE = 'voxelworld';   // i18n-ignore: world data file key

    const VoxelWorldState = {
        // Whether any of this is Earth's to remember. A walk on another planet
        // and the title screen's own drive both run the same code over the same
        // square numbers, and neither of them is this world: without the switch,
        // a tree felled on some comet would leave a gap in a wood at home.
        _on: true,
        setEnabled(on) { this._on = !!on; this._felled = null; },

        // The store, or null when there is no world to write to (the title
        // screen, a test harness, a world nobody has created yet). Never held on
        // to: setActiveWorld drops the whole file cache, and a kept reference
        // would go on writing into a world nobody is playing.
        _store() {
            if (!this._on) return null;
            const W = window.WorldManager;
            if (!W || typeof W.getFile !== 'function' ||
                !W.hasActiveWorld || !W.hasActiveWorld()) return null;
            const store = W.getFile(VOXEL_WORLD_FILE);
            if (!store.dug) store.dug = {};
            if (!Array.isArray(store.felled)) store.felled = [];
            return store;
        },

        // Writing the world folder costs far more than one cube is worth, so the
        // flush is coalesced. A savegame write flushes on its own, so nothing is
        // ever left only in memory.
        _flushTimer: null,
        _requestFlush() {
            const W = window.WorldManager;
            if (!W || typeof W.flush !== 'function' || this._flushTimer) return;
            this._flushTimer = setTimeout(() => {
                this._flushTimer = null;
                try { W.flush(); } catch (e) { /* non-fatal */ }
            }, 1000);
        },

        // --- the dig log ------------------------------------------------------
        dug() {
            if (!this._on) return null;
            const store = this._store();
            if (store && store.dug && Object.keys(store.dug).length) return store.dug;
            // A world dug in before any of this was written down keeps its
            // trench: the savegame's own copy is read once and then moved.
            const legacy = (typeof $gameSystem !== 'undefined' && $gameSystem)
                ? $gameSystem._voxelWorldEdits : null;
            if (legacy && Object.keys(legacy).length) {
                if (store) { store.dug = legacy; this._requestFlush(); }
                return legacy;
            }
            return null;
        },
        setDug(data) {
            const store = this._store();
            if (!store) return;
            store.dug = data || {};
            this._requestFlush();
        },

        // --- what has been cut down -------------------------------------------
        // Kept as a Set in memory (this is asked once per sprite per chunk
        // build) and written out as a plain array.
        _felled: null,
        _felledSet() {
            if (this._felled) return this._felled;
            const store = this._store();
            this._felled = new Set(store ? store.felled : []);
            return this._felled;
        },
        isFelled(key) {
            if (!this._on) return false;
            const set = this._felledSet();
            return set.size > 0 && set.has(key);
        },
        fell(key) {
            if (!this._on) return;
            const set = this._felledSet();
            if (set.has(key)) return;
            set.add(key);
            const store = this._store();
            if (store) { store.felled = Array.from(set); this._requestFlush(); }
        },
        // --- the blocks on the quick bar --------------------------------------
        // What has been dug up and not yet built with. It belongs to the WORLD,
        // not to the savegame: leave the 3D world, come back, load another save
        // of the same world, and the stack of dirt is still on the bar. Stored
        // as a plain array of BAR_SLOTS entries, null where a slot is empty
        // (see VoxelWorldDigging's BlockBar, which owns the shape of it).
        blocks() {
            if (!this._on) return null;
            const store = this._store();
            return (store && Array.isArray(store.blocks)) ? store.blocks : null;
        },
        setBlocks(slots) {
            const store = this._store();
            if (!store) return;
            store.blocks = (slots || []).map(s =>
                (s && s.mat && s.count > 0) ? { mat: s.mat | 0, count: s.count | 0 } : null);
            this._requestFlush();
        },

        // Dropped whenever the world underfoot changes, so one world's felled
        // trees are never counted against another's.
        forget() { this._felled = null; },
    };

    const OMEGA_TILE   = { x: 79, y: 124 };   // the square it stands on
    const OMEGA_SPAN   = 6;                    // world squares on a side
    const OMEGA_HEIGHT = 19200;                // world units to the tip (4800 m)
    // How far the world is drawn, in every mode that is not the free camera.
    // It has to be at least far enough to hold the tower stood at its own foot
    // and looked up at; a far plane costs almost nothing in depth precision
    // (the near plane is what that turns on) and the fog has eaten everything
    // long before it, so opening it up buys the spire and pays nothing.
    const VIEW_FAR     = Math.max(3000 * WORLD_SCALE, OMEGA_HEIGHT * 1.25);
    // Past this the tower is drawn as an angular projection of itself rather
    // than at its true distance: the camera clips at 8000 units and the haze has
    // eaten everything by 4000, so a landmark meant to be seen from the far side
    // of the map cannot simply be left where it is. See the scene's own
    // _updateOmegaTower.
    const OMEGA_PROXY_D = 4200;
    // ...and it stops being drawn at all past here, which is most of the map
    // away and well past anything anybody could make out.
    const OMEGA_SIGHT   = 60000;
    const LAT_SCRUB         = 0.35;   // forward speed lost to lateral tyre scrub
    const NATURAL_TOP       = Math.sqrt(ENGINE_ACCEL / DRAG_K); // ~400 km/h on asphalt

    // Per-surface handling. grip = lateral slip decay per second; roll =
    // rolling resistance (units/s^2); dragMul scales drag off the asphalt;
    // bump feeds the suspension shake; dust spawns wheel dust particles.
    const SURFACES = {
        asphalt: { grip: 6.5, roll: 0.9, dragMul: 1.0,  bump: 0.0, dust: 0 },
        dirt:    { grip: 3.4, roll: 2.6, dragMul: 1.35, bump: 0.9, dust: 1 },
        grass:   { grip: 3.0, roll: 3.0, dragMul: 1.6,  bump: 0.7, dust: 1 },
        sand:    { grip: 2.4, roll: 4.2, dragMul: 2.0,  bump: 0.6, dust: 1 },
        snow:    { grip: 1.6, roll: 2.2, dragMul: 1.3,  bump: 0.4, dust: 0 },
        rock:    { grip: 3.6, roll: 2.2, dragMul: 1.5,  bump: 1.3, dust: 1 }
    };

    // Arcade body dynamics (purely cosmetic, driven by accel/steer/speed).
    const BODY_ROLL_MAX     = 0.10;   // radians of lean in a hard turn
    const BODY_PITCH_MAX    = 0.06;   // radians of nose dive / squat
    const BODY_BOUNCE_MAX   = 0.6;    // world units of suspension travel (gentle)
    const HEADLIGHT_NIGHT   = 0.45;   // dayFactor below which headlights switch on
    const WALK_LANTERN_INTENSITY = 1.7;  // hand light carried on a free walk (no camper, no headlights)
    const HEADLIGHT_INTENSITY = 1.1;  // spotlight intensity when fully on (was 2.2, blew out the fp view)
    const HEADLIGHT_BEAM_OPACITY = 0.3; // glow-sprite opacity when fully on (was 0.5)

    // Procedural traffic: pooled low-poly cars driving the road grid.
    const TRAFFIC_MAX       = 12;
    const TRAFFIC_RING_MIN  = 3;      // tiles: nearest spawn ring around the camper
    const TRAFFIC_RING_MAX  = 9;      // tiles: farthest spawn / recycle ring
    // The vehicles that drive it, one walk sheet each - the same art the 2D map
    // drives (RoadCarAI.js), so a car met on a country road out here and a car
    // met on the 2D map are the same car. Lengths and widths are the real ones,
    // in metres: the card is scaled until the drawn art measures the length, and
    // the width is what the camper's bumper is answered by.
    const TRAFFIC_VEHICLES  = [
        { key: 'car1',    sheet: 'Vehicles/!$Car_large',  lengthM: 4.4, widthM: 1.8 },   // i18n-ignore  sprite asset path
        { key: 'car2',    sheet: 'Vehicles/!$Car2_large', lengthM: 4.5, widthM: 1.8 },   // i18n-ignore  sprite asset path
        { key: 'car3',    sheet: 'Vehicles/!$Car3_large', lengthM: 4.2, widthM: 1.8 },   // i18n-ignore  sprite asset path
        { key: 'car4',    sheet: 'Vehicles/!$Car4_large', lengthM: 4.7, widthM: 1.9 },   // i18n-ignore  sprite asset path
        { key: 'car5',    sheet: 'Vehicles/!$Car5_large', lengthM: 4.3, widthM: 1.8 },   // i18n-ignore  sprite asset path
        { key: 'car6',    sheet: 'Vehicles/!$Car6_large', lengthM: 4.6, widthM: 1.9 },   // i18n-ignore  sprite asset path
        { key: 'car7',    sheet: 'Vehicles/!$Car7_large', lengthM: 4.4, widthM: 1.8 },   // i18n-ignore  sprite asset path
        { key: 'camper',  sheet: 'Vehicles/!$RV_large',   lengthM: 6.4, widthM: 2.2, heavy: true },  // i18n-ignore  sprite asset path
        { key: 'tractor', sheet: 'Vehicles/!$Tractor',    lengthM: 4.6, widthM: 2.1, heavy: true }   // i18n-ignore  sprite asset path
    ];
    // World units per metre, derived from the camper - the scene's 1x reference
    // vehicle. CamperModel scales Camper.glb to 26 units long over a 9-unit wheel
    // track, i.e. a 6.4 m x 2.2 m van, which puts one metre at ~4 world units.
    // Every traffic silhouette below is authored in METRES and multiplied by this,
    // so a hatchback really is smaller than the camper and a bus really is bigger.
    const UNITS_PER_M       = 4;

    // =========================================================================
    // Smooth time-of-day sky (keyframe interpolation, mirrors WeatherSystem.js).
    // Continuous across the whole 24h cycle (incl. the midnight wrap) so the 3D
    // sky never jumps the way the old piecewise dawn/day/dusk/night branches did.
    // =========================================================================
    // The sky, on the palette this world is drawn in: the flat, saturated,
    // high-contrast one a blocky world in 2009 had. #78A7FF overhead at noon,
    // a hard orange at either end of the day and near-black at the bottom of
    // the night - no washed grey-blue haze anywhere in it, because the haze is
    // the fog's job and the fog is a separate, paler colour (see skyFogColor).
    const SKY_KEYFRAMES = [
        { h: 0.0,   c: [0.02, 0.03, 0.09] }, // deep night
        { h: 5.0,   c: [0.02, 0.03, 0.09] },
        { h: 6.0,   c: [0.13, 0.15, 0.32] }, // pre-dawn blue
        { h: 6.75,  c: [0.96, 0.49, 0.24] }, // dawn, hard orange
        { h: 7.75,  c: [0.42, 0.61, 0.99] }, // early morning
        { h: 12.0,  c: [0.47, 0.65, 1.00] }, // midday: #78A7FF
        { h: 17.0,  c: [0.46, 0.64, 1.00] },
        { h: 18.5,  c: [0.72, 0.62, 0.72] }, // the blue going out of it
        { h: 19.25, c: [0.98, 0.46, 0.22] }, // sunset, hard orange
        { h: 20.0,  c: [0.42, 0.26, 0.42] }, // dusk purple
        { h: 21.0,  c: [0.10, 0.11, 0.26] }, // blue hour
        { h: 22.0,  c: [0.02, 0.03, 0.09] }, // night
        { h: 24.0,  c: [0.02, 0.03, 0.09] }
    ];

    // What the haze at the horizon is, given the sky over it. In a world like
    // this the two are NOT the same colour: the sky is deep and the distance
    // pales toward white, which is what makes a horizon a horizon rather than a
    // line where the ground stops. Handed the sky, answers the fog.
    function skyFogColor(sky, out) {
        const k = 0.42 + 0.18 * Math.max(0, Math.min(1, sky.b));   // paler under a blue sky
        out.setRGB(sky.r + (1 - sky.r) * k,
                   sky.g + (1 - sky.g) * k,
                   sky.b + (1 - sky.b) * k * 0.7);
        return out;
    }

    function sampleSkyColor(hour, out) {
        const kf = SKY_KEYFRAMES;
        let a = kf[0], b = kf[kf.length - 1];
        for (let i = 0; i < kf.length - 1; i++) {
            if (hour >= kf[i].h && hour <= kf[i + 1].h) { a = kf[i]; b = kf[i + 1]; break; }
        }
        const span = (b.h - a.h) || 1;
        const t = Math.max(0, Math.min(1, (hour - a.h) / span));
        // The keyframes above are written the way anybody reads a colour: as
        // sRGB, the numbers a picker gives you. three.js works in linear, and
        // feeding it these straight washes a #87ceeb midday sky out into a pale
        // grey-white, which is exactly what the sky used to be. Say which space
        // they are in and the sky comes out the blue it was written as.
        const r = a.c[0] + (b.c[0] - a.c[0]) * t;
        const g = a.c[1] + (b.c[1] - a.c[1]) * t;
        const bl = a.c[2] + (b.c[2] - a.c[2]) * t;
        if (THREE.SRGBColorSpace !== undefined) out.setRGB(r, g, bl, THREE.SRGBColorSpace);
        else out.setRGB(r, g, bl);
        return out;
    }

    // Smooth 0 (night) .. 1 (midday) factor for sun/ambient intensities.
    function dayFactorForHour(hour) {
        if (hour <= 5 || hour >= 21) return 0;
        if (hour < 7.75) return (hour - 5) / 2.75;   // dawn ramp up
        if (hour <= 17) return 1;                     // full day
        return Math.max(0, 1 - (hour - 17) / 4);      // dusk ramp down to 0 by 21
    }

    // =========================================================================
    // Biome / Terrain Helpers (module-level)
    // =========================================================================
    let _Biomes = (window.WorldGen && window.WorldGen.Biomes) ? window.WorldGen.Biomes : [];
    let _BiomesMap = null;
    let _BiomesMapIndex = null;

    // Biome lookups are by far the hottest thing during chunk building (called
    // ~4x per vertex). Memoize per tile + per name, and index biomes by name so
    // we never linear-scan or rescan map tiles. Caches are cleared at scene start
    // and whenever the async biome data finishes loading.
    const _biomeTileCache  = new Map();   // "wx,wy" -> biome object
    const _renderTypeCache = new Map();   // biome name -> 'mountain'|'water'|'road'|'flat'
    const _roadDirCache    = new Map();   // "wx,wy" -> road direction string
    const _riverTileCache  = new Map();   // "wx,wy" -> is this square a river
    let   _biomeByName = null, _biomeByNameLen = -1;
    function _clearBiomeCaches() {
        if (VW._tilePlanCache) VW._tilePlanCache.clear();
        _riverTileCache.clear();
        if (VW.clearTerrainCaches) VW.clearTerrainCaches();
        _biomeTileCache.clear();
        _renderTypeCache.clear();
        _roadDirCache.clear();
        _biomeByName = null; _biomeByNameLen = -1;
    }
    function _findBiome(name) {
        if (_biomeByName === null || _biomeByNameLen !== _Biomes.length) {
            _biomeByName = new Map();
            for (const b of _Biomes) _biomeByName.set(b.name, b);
            _biomeByNameLen = _Biomes.length;
        }
        return _biomeByName.get(name) || null;
    }

    if (_Biomes.length === 0) {
        fetch('js/db/WorldGen/Biomes.json')
            .then(r => r.json())
            .then(data => { _Biomes = data; _clearBiomeCaches(); })
            .catch(e => console.warn('[VoxelWorld] Could not load Biomes.json:', e));
    }

    fetch('js/db/WorldGen/BiomesMap.json')
        .then(r => r.json())
        .then(data => {
            _BiomesMap = data;
            if (data.biomeCoordinateCache) {
                _BiomesMapIndex = {};
                for (const [name, coords] of Object.entries(data.biomeCoordinateCache)) {
                    for (const c of coords) {
                        _BiomesMapIndex[`${c.x},${c.y}`] = name;
                    }
                }
            }
            _clearBiomeCaches();
        })
        .catch(e => console.warn('[VoxelWorld] Could not load BiomesMap.json (tile scan will be used):', e));

    // ONE BIOME, EVERYWHERE.
    //
    // The 3D world normally reads its biomes off the Earth world map, square by
    // square. A planet has no such map: it is one kind of place from pole to
    // pole as far as this world is concerned, and its name is what everything
    // else - the ground colour, the vegetation, the music - is looked up by.
    //
    // Setting an override makes every square answer with it. Clearing it puts
    // Earth back. Both drop the memo, since every cached answer is now wrong.
    let _biomeOverride = null;
    function setBiomeOverride(biome) {
        _biomeOverride = biome || null;
        _clearBiomeCaches();
    }
    function getBiomeOverride() { return _biomeOverride; }

    // =========================================================================
    // The shape of another world
    // =========================================================================
    // Earth's ground is worked out from the world map: which biome a square is,
    // what the noise does over it, where the rivers and the roads run. Another
    // world has none of that. What it has instead is the elevation field the
    // landing picture was painted from - the very picture the party looked at
    // and picked a square off - and the only honest thing to do is raise the
    // ground out of THAT, so the coastline they saw from orbit is the coastline
    // they walk down to and the mountains stand where the picture put them.
    //
    // The field is asked in world squares, one square to a cell of the landing
    // grid, and answers { e, seaLevel, band, crater } or null when there is no
    // world. VoxelWorldField's sampleColumn hands the whole column over to it
    // whenever one is installed.
    let _alienTerrain = null;
    function setAlienTerrain(fn) {
        _alienTerrain = (typeof fn === 'function') ? fn : null;
        _clearBiomeCaches();
    }
    function getAlienTerrain() { return _alienTerrain; }

    // =========================================================================
    // The Far Lands: infinite strange expanse beyond the world map borders
    // =========================================================================
    const FARLAND_BIOMES = [
        'Farlands Monoliths',
        'Glitch Void Fracture',
        'Singularity Fault',
        'Quantum Strata',
        'Null Matrix Haywire',
        'Eldritch Faultline',
        'Infinite Cascade'
    ];

    function isFarlandsTile(wx, wy) {
        return wx < 0 || wx >= WORLD_TILES || wy < 0 || wy >= WORLD_TILES;
    }

    function farlandsBiomeAt(wx, wy) {
        const hash = Math.abs(Math.sin(wx * 12.9898 + wy * 78.233) * 43758.5453 + ((wx ^ wy) & 255));
        const name = FARLAND_BIOMES[Math.floor(hash) % FARLAND_BIOMES.length];
        const r = ((Math.abs((wx * 37) ^ (wy * 17)) + 128) & 255);
        const g = ((Math.abs(wx * 19 + wy * 41) + 64) & 255);
        const b = ((Math.abs((wx * 29) ^ (wy * 53)) + 190) & 255);
        const color = '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
        return { name, color, farlands: true };
    }

    function _sampleBiomeUncached(wx, wy) {
        if (_biomeOverride) return _biomeOverride;
        if (isFarlandsTile(wx, wy) && !_alienTerrain) {
            return farlandsBiomeAt(wx, wy);
        }
        if (typeof $gameMap !== 'undefined' && $gameMap.mapId() === 315) {
            let tileId = 0;
            for (let z = 3; z >= 0; z--) {
                const t = $gameMap.tileId(wx, wy, z);
                if (t) { tileId = t; break; }
            }
            if (tileId && window.ProcGenUtils) {
                const name = window.ProcGenUtils.getBiomeForWorldTile(tileId);
                return _findBiome(name) || { name, color: '#90ee90' };
            }
        }
        const cache = (typeof $gameSystem !== 'undefined' && $gameSystem._procGenData)
            ? $gameSystem._procGenData.biomeCoordinateCache : null;
        if (cache) {
            for (const [name, coords] of Object.entries(cache)) {
                if (coords.some(c => c.x === wx && c.y === wy)) {
                    return _findBiome(name) || { name, color: '#90ee90' };
                }
            }
        }
        if (_BiomesMapIndex) {
            const name = _BiomesMapIndex[`${wx},${wy}`];
            if (name) return _findBiome(name) || { name, color: '#90ee90' };
        }
        return { name: 'Fields', color: '#90ee90' };
    }

    function sampleBiomeAt(wx, wy) {
        const key = wx + ',' + wy;
        let b = _biomeTileCache.get(key);
        if (b === undefined) {
            b = _sampleBiomeUncached(wx, wy);
            _biomeTileCache.set(key, b);
        }
        return b;
    }

    // Somewhere a settlement stands is dry land, whatever the rest of its name
    // says: VillageSea and Docks are places on a coast, not the coast itself.
    const _SETTLED_RE = /^(city|burg|village|villa|houses|docks|farm|park|town|castle|temple|church|office|factory|laboratory|arena|metro|train|spacecenter)/;

    function getRenderType(biomeName) {
        let t = _renderTypeCache.get(biomeName);
        if (t !== undefined) return t;
        const n = String(biomeName || '').toLowerCase();
        t = _SETTLED_RE.test(n) ? (n.includes('mountain') ? 'mountain' : 'flat')
          : (n.includes('mountain') || n.includes('monolith') || n.includes('fault') || n.includes('cascade')) ? 'mountain'
          : (n.includes('ocean') || n.includes('sea') || n === 'caveflooded' || n.includes('lake') || n.includes('river')) ? 'water'
          : (n.startsWith('road') || n === 'highway') ? 'road'
          : 'flat';
        _renderTypeCache.set(biomeName, t);
        return t;
    }

    function parseRoadDirection(biomeName) {
        const simple = biomeName.match(/^Road\s+(.+)/i);
        if (simple) return simple[1].toLowerCase().trim();
        const tagged = biomeName.match(/<Road:\s*\d+\s+([\w-]+)>/i);
        if (tagged) return tagged[1].toLowerCase();
        return 'horizontal';
    }

    function getRoadDirectionAt(wx, wy) {
        const key = wx + ',' + wy;
        let cached = _roadDirCache.get(key);
        if (cached !== undefined) return cached;

        let dir = null;
        const procGenData = (typeof $gameSystem !== 'undefined' && $gameSystem._procGenData)
            ? $gameSystem._procGenData : null;
        if (procGenData && procGenData.precomputedRoadDirections) {
            dir = procGenData.precomputedRoadDirections[key] || null;
        }
        if (!dir && _BiomesMap && _BiomesMap.roadDirections) {
            dir = _BiomesMap.roadDirections[key] || null;
        }
        if (!dir) dir = parseRoadDirection(sampleBiomeAt(wx, wy).name);

        _roadDirCache.set(key, dir);
        return dir;
    }

    // =========================================================================
    // Road graph. The world map's road tiles are tagged with the direction names
    // written by ProceduralMapRoadGenerator, which state exactly which tile edges
    // a piece of asphalt joins. That turns the tagged tiles into a navigable
    // graph: which way a road leaves a tile, and therefore where a driver may
    // turn at a crossing.
    // =========================================================================
    const ROAD_LINKS = {
        horizontal:           ['e', 'w'],
        vertical:             ['n', 's'],
        cross:                ['n', 's', 'e', 'w'],
        // T-junctions: the stem points the named way, the opposite leg is missing.
        't-up':               ['n', 'e', 'w'],
        't-north':            ['n', 'e', 'w'],
        't-down':             ['s', 'e', 'w'],
        't-south':            ['s', 'e', 'w'],
        't-left':             ['w', 'n', 's'],
        't-west':             ['w', 'n', 's'],
        't-right':            ['e', 'n', 's'],
        't-east':             ['e', 'n', 's'],
        // Corners join the two named perpendicular edges.
        'corner-up-left':     ['n', 'w'],
        'corner-left-up':     ['n', 'w'],
        'corner-north-west':  ['n', 'w'],
        'corner-up-right':    ['n', 'e'],
        'corner-right-up':    ['n', 'e'],
        'corner-north-east':  ['n', 'e'],
        'corner-down-left':   ['s', 'w'],
        'corner-left-down':   ['s', 'w'],
        'corner-south-west':  ['s', 'w'],
        'corner-down-right':  ['s', 'e'],
        'corner-right-down':  ['s', 'e'],
        'corner-south-east':  ['s', 'e']
    };
    // North is -y on the world map, which is -z in the 3D scene.
    const ROAD_STEP     = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
    const ROAD_OPPOSITE = { n: 's', s: 'n', e: 'w', w: 'e' };
    const WORLD_TILES   = 256;   // world map (315) is 256x256 tiles

    // The tagged road tiles of the whole world, as a "x,y" -> direction map.
    // Prefers the live procedural data, falling back to the shipped BiomesMap.
    function roadTileTable() {
        const procGenData = (typeof $gameSystem !== 'undefined' && $gameSystem && $gameSystem._procGenData)
            ? $gameSystem._procGenData : null;
        if (procGenData && procGenData.precomputedRoadDirections) return procGenData.precomputedRoadDirections;
        if (_BiomesMap && _BiomesMap.roadDirections) return _BiomesMap.roadDirections;
        return null;
    }

    // True once the world's road tags are loaded, i.e. once a route can be planned.
    function roadDataReady() {
        const t = roadTileTable();
        return !!(t && Object.keys(t).length);
    }

    // A tile is drivable road when it carries a road tag (this also covers the
    // bridge tiles, which are roads laid over water) or renders as asphalt.
    function isRoadTile(wx, wy) {
        if (wx < 0 || wy < 0 || wx >= WORLD_TILES || wy >= WORLD_TILES) return false;
        const table = roadTileTable();
        if (table && table[wx + ',' + wy]) return true;
        return getRenderType(sampleBiomeAt(wx, wy).name) === 'road';
    }

    // Which edges ('n','s','e','w') the road on this tile connects to.
    function roadLinksAt(wx, wy) {
        if (!isRoadTile(wx, wy)) return [];
        const dir = String(getRoadDirectionAt(wx, wy) || '').toLowerCase();
        return ROAD_LINKS[dir] || ['n', 's', 'e', 'w'];
    }

    // The ways out of a tile that actually continue onto another road tile.
    // `from` is the edge the driver came in by and is excluded unless it is the
    // only way left (a dead end, where turning around is the only option).
    function roadExitsFrom(wx, wy, from) {
        const links = roadLinksAt(wx, wy);
        const out = [];
        for (const side of links) {
            if (side === from) continue;
            const step = ROAD_STEP[side];
            const nx = wx + step[0], ny = wy + step[1];
            if (!isRoadTile(nx, ny)) continue;
            // The neighbour must join this tile back, or the two roads only touch.
            if (roadLinksAt(nx, ny).indexOf(ROAD_OPPOSITE[side]) < 0) continue;
            out.push(side);
        }
        return out;
    }

    // =========================================================================
    // River tiles
    //
    // The world map's rivers are drawn as an overlay on top of whatever biome
    // the square really is, so a river square is not a biome name: it is a
    // coordinate in the generator's river map. The 3D world reads that map to
    // know where to cut a channel, and falls back to the biome name for the
    // squares that are nothing but water.
    // =========================================================================
    function riverCoordTable() {
        const procGenData = (typeof $gameSystem !== 'undefined' && $gameSystem && $gameSystem._procGenData)
            ? $gameSystem._procGenData : null;
        if (procGenData && procGenData.riverCoordMap) return procGenData.riverCoordMap;
        if (_BiomesMap && _BiomesMap.riverCoords) return _BiomesMap.riverCoords;
        return null;
    }

    function isRiverTile(wx, wy) {
        if (wx < 0 || wy < 0 || wx >= WORLD_TILES || wy >= WORLD_TILES) return false;
        const key = wx + ',' + wy;
        const hit = _riverTileCache.get(key);
        if (hit !== undefined) return hit;
        const table = riverCoordTable();
        let is = !!(table && table[key]);
        if (!is) is = /river/i.test(sampleBiomeAt(wx, wy).name || '');
        if (_riverTileCache.size > 40000) _riverTileCache.clear();
        _riverTileCache.set(key, is);
        return is;
    }

    // Whether water carries on out of this square in a given direction: another
    // river square, or the open sea a river empties into.
    function riverFlowsTo(wx, wy) {
        if (wx < 0 || wy < 0 || wx >= WORLD_TILES || wy >= WORLD_TILES) return false;
        if (isRiverTile(wx, wy)) return true;
        return getRenderType(sampleBiomeAt(wx, wy).name) === 'water';
    }

    // Which edges a river square's channel leaves by, worked out from what is
    // next to it rather than from a tag: the generator writes no directions.
    function riverLinksAt(wx, wy) {
        if (!isRiverTile(wx, wy)) return [];
        const out = [];
        if (riverFlowsTo(wx, wy - 1)) out.push('n');
        if (riverFlowsTo(wx, wy + 1)) out.push('s');
        if (riverFlowsTo(wx - 1, wy)) out.push('w');
        if (riverFlowsTo(wx + 1, wy)) out.push('e');
        return out;
    }

    // A random tagged road tile with somewhere to drive to, used to drop the
    // camper onto the world's road network (title-screen autopilot / recovery).
    function pickRandomRoadTile() {
        const table = roadTileTable();
        if (!table) return null;
        const keys = Object.keys(table);
        if (!keys.length) return null;
        for (let i = 0; i < 200; i++) {
            const parts = keys[Math.floor(Math.random() * keys.length)].split(',');
            const x = Number(parts[0]), y = Number(parts[1]);
            if (!isFinite(x) || !isFinite(y)) continue;
            if (roadExitsFrom(x, y, null).length >= 2) return { x, y };
        }
        const parts = keys[Math.floor(Math.random() * keys.length)].split(',');
        return { x: Number(parts[0]), y: Number(parts[1]) };
    }

    // Closest named place on the world map (WorldGen.HardcodedBiomeNames), or the
    // tile's biome, spaced out for reading ("SpiritWoods" -> "Spirit Woods").
    function placeNameAt(wx, wy, radius) {
        const names = (window.WorldGen && window.WorldGen.HardcodedBiomeNames) || null;
        const r = radius == null ? 5 : radius;
        if (names) {
            for (let ring = 0; ring <= r; ring++) {
                for (let dx = -ring; dx <= ring; dx++) {
                    for (let dy = -ring; dy <= ring; dy++) {
                        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
                        const n = names[(wx + dx) + ',' + (wy + dy)];
                        if (n) return n;
                    }
                }
            }
        }
        // No named landmark nearby: name the countryside the road runs through,
        // i.e. the most common biome around the tile (the road itself excluded,
        // or every stretch would just read "road").
        const tally = new Map();
        for (let dx = -2; dx <= 2; dx++) {
            for (let dy = -2; dy <= 2; dy++) {
                const n = sampleBiomeAt(wx + dx, wy + dy).name;
                if (/^road/i.test(n) || /^bridge/i.test(n)) continue;
                tally.set(n, (tally.get(n) || 0) + 1);
            }
        }
        let best = null, bestN = 0;
        for (const [n, c] of tally) { if (c > bestN) { best = n; bestN = c; } }
        const biome = (best || sampleBiomeAt(wx, wy).name);
        if (/^Road\s+/i.test(biome)) return T('CamperDrive.openRoad');
        return window.BiomeNames.display(biome);
    }

    // A road number for the stretch of asphalt under the camper. Roads carry no
    // names in the world data, so one is derived from the tile block, which keeps
    // it stable for a good stretch of driving and changes as the region does.
    function roadLabelAt(wx, wy) {
        const dir    = String(getRoadDirectionAt(wx, wy) || '').toLowerCase();
        const prefix = dir === 'vertical' ? 'N' : dir === 'horizontal' ? 'E' : 'A';
        const block  = Math.floor(wx / 8) * 31 + Math.floor(wy / 8) * 17;
        return prefix + (1 + (Math.abs(block) % 399));
    }

    // Tall, peaky mountains. The power curve flattens the foothills and sharpens
    // the summits; amplitude ~440 units towers far above the camper and houses.
    const MOUNTAIN_MAX_H = 440 * WORLD_SCALE;
    const SNOW_LINE      = 250 * WORLD_SCALE;
    const _SNOW_COLOR    = (typeof THREE !== 'undefined') ? new THREE.Color(0xfdfdff) : null;
    const _ROCK_COLOR    = (typeof THREE !== 'undefined') ? new THREE.Color(0x6b6b73) : null;

    function noiseHeight(globalX, globalZ, tileWX, tileWY) {
        const seedOff = ((tileWX * 127 + tileWY * 311) & 0x7fff) * 0.001;
        const scale   = 0.016;
        const raw     = _fbm(globalX * scale + seedOff, globalZ * scale + seedOff, 5, 2.0, 0.5);
        const n       = raw * 0.5 + 0.5;                 // 0..1
        return Math.pow(n, 1.5) * MOUNTAIN_MAX_H + 18 * WORLD_SCALE;
    }

    // =========================================================================
    // 2D sprite pools for billboarded vegetation / rocks. These are RPG Maker
    // furniture tiles under img/furniture/{Trees,Plants,Rocks}; the decorator
    // scatters them as camera-facing billboards instead of low-poly 3D props.
    // =========================================================================
    const TREE_POOLS = {
        broadleaf: ['dark_canopy_tree.png', 'bushy_dark_tree.png', 'bright_green_pine.png',
                    'tall_pine_tree.png', 'golden_autumn_tree.png', 'dark_green_round_tree.png',
                    'bright_green_leafy_tree.png', 'red_rooted_tall_tree.png', 'forest_canopy_tree.png'],
        conifer:   ['orange_autumn_tree.png', 'towering_pine_tree.png', 'big_fir_tree.png',
                    'dark_bushy_tree.png', 'small_round_tree.png'],
        snow:      ['small_round_tree.png', 'broad_leafy_tree.png', 'tall_autumn_tree.png'],
        jungle:    ['large_jungle_tree.png', 'slim_jungle_trunk.png', 'tall_jungle_trunk.png'],
        sakura:    ['bare_snowy_cherry_tree.png', 'snowy_cherry_trunk_tree.png', 'bare_winter_tree.png', 'slim_winter_tree.png'],
        fruit:     ['green_fruit_tree.png', 'orange_trunk_fruit_tree.png',
                    'tall_leafy_tree.png', 'small_fruit_tree_with_crate.png'],
        dead:      ['gnarled_dead_tree.png', 'haunted_tree_with_pumpkins.png', 'dead_red_tree.png'],
        generic:   ['dark_canopy_tree.png', 'tall_pine_tree.png', 'yellow_autumn_tree.png']
    };
    const ROCK_POOL = ['speckled_stone_arch.png', 'stone_stalagmite.png', 'pink_rock_shards.png',
                       'curved_rock_spire.png', 'rocky_water_mound.png', 'grassy_flat_rock.png',
                       'moss_ringed_pink_rock.png', 'gray_rubble_pair.png'];
    const ROCK_ASH  = ['ash_gray_rock.png', 'single_ash_boulder.png', 'angular_ash_rock.png'];
    const PLANT_POOL = ['compact_green_shrub.png', 'bushy_green_shrub.png', 'curling_green_fern.png',
                        'dark_leafy_bush.png', 'flower_grass_mound.png', 'dead_desert_shrub.png'];
    const PLANT_CROPS = ['yellow_corn_stalk.png', 'leafy_green_cabbage.png', 'pumpkin_vine_plant.png',
                         'ripe_red_tomato.png'];

    // =========================================================================
    // Character sprite billboards
    // =========================================================================
    // Everybody who walks about in the 3D world - a citizen in a town, the party
    // trailing the leader, the pet at their heel - is the game's own walk sheet
    // stood up as a card that turns to face the lens. It is the same art the 2D
    // map draws, so the person met on the road and the person met in town are
    // visibly one person.
    //
    // Which of the sheet's four rows shows is read from where the CAMERA stands
    // relative to the way the figure is FACING: the card always faces the lens,
    // so turning the row is the only thing that makes walking around somebody
    // actually walk around them.

    const _charSheetTex = new Map();

    // One character sheet, loaded once and shared. Every figure drawn off it
    // clones the texture (a clone owns its own offset, which is what lets two
    // people off one sheet face different ways) and adopts the image later:
    // three r128 has no shared source behind a texture, so a clone taken before
    // the file lands would stay blank for ever.
    function characterSheetTexture(sheet) {
        let t = _charSheetTex.get(sheet);
        if (t !== undefined) return t;
        t = null;
        if (THREE.TextureLoader) {
            t = new THREE.TextureLoader().load(encodeURI('img/characters/' + sheet + '.png'));
            if (THREE.SRGBColorSpace !== undefined) t.colorSpace = THREE.SRGBColorSpace;
            else if (THREE.sRGBEncoding !== undefined) t.encoding = THREE.sRGBEncoding;
            t.magFilter = THREE.NearestFilter;
            t.minFilter = THREE.NearestFilter;
            t.generateMipmaps = false;
        }
        _charSheetTex.set(sheet, t);
        return t;
    }

    // Where one character's block of frames sits on its sheet. A `$` sheet holds
    // ONE character in 3 columns by 4 rows; any other holds eight, four across
    // and two down, each in its own 3x4 block.
    function characterSheetLayout(sheet, index) {
        const single = (sheet || '').indexOf('$') >= 0;
        const cols = single ? 3 : 12;
        const rows = single ? 4 : 8;
        const i    = single ? 0 : ((index || 0) % 8 + 8) % 8;
        return { cols, rows, colBase: (i % 4) * 3, rowBase: Math.floor(i / 4) * 4 };
    }

    // Sheet row order is the engine's own: down, left, right, up. `yaw` is the
    // way the figure faces (0 = +Z, growing toward +X); dx/dz point from the
    // figure to the camera.
    function characterFacingRow(yaw, dx, dz) {
        let a = Math.atan2(dx, dz) - yaw;
        const TAU = Math.PI * 2;
        a = ((a % TAU) + TAU) % TAU;
        if (a < Math.PI * 0.25 || a > Math.PI * 1.75) return 0;   // looked in the face
        if (a < Math.PI * 0.75) return 2;                          // their right flank
        if (a < Math.PI * 1.25) return 3;                          // their back
        return 1;                                                  // their left flank
    }

    // A person - and the SAME person the party is. FOOT_EYE is where the
    // player's eye sits, and an eye is about 93% of the way up a head, so this
    // is that: everybody in this world stands eye to eye with whoever is
    // looking at them, instead of being a head shorter than the party for no
    // reason. 1.87 m (UNITS_PER_M is 4).
    const PERSON_H = Math.round(FOOT_EYE / 0.93 * 10) / 10;

    // Where the figure actually is inside its frame.
    //
    // A character sheet cell is mostly empty air: the art sits in the lower
    // part of it with headroom above and a little under the feet. Cutting the
    // card to the CELL and calling that a person makes everybody in the world
    // two thirds the height they were meant to be and floats them off the
    // ground besides. So the drawn pixels are measured once per sheet - the
    // union of the whole character's block, so the walk cycle cannot make
    // anybody bob - and the card is cut to those instead.
    //
    // Answers { fill, foot }: how much of the cell's height the figure fills,
    // and how far down the cell its feet are, both 0..1. A sheet that cannot be
    // measured (a canvas the browser will not let us read back) answers null
    // and the whole thing falls back to the cell.
    const _figureBox = new Map();
    function characterFigureBox(sheet, index) {
        const key = (sheet || '') + '|' + (index || 0);
        if (_figureBox.has(key)) return _figureBox.get(key);
        let out = null;
        try {
            const tex = characterSheetTexture(sheet);
            const img = tex && tex.image;
            if (img && img.width && img.height) {
                const lay = characterSheetLayout(sheet, index);
                const fw = Math.floor(img.width / lay.cols);
                const fh = Math.floor(img.height / lay.rows);
                const cv = document.createElement('canvas');
                cv.width = fw * 3; cv.height = fh * 4;
                const ctx = cv.getContext('2d', { willReadFrequently: true });
                ctx.drawImage(img, lay.colBase * fw, lay.rowBase * fh, fw * 3, fh * 4,
                              0, 0, fw * 3, fh * 4);
                const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
                let top = -1, bot = -1, lft = -1, rgt = -1;
                for (let y = 0; y < cv.height; y++) {
                    const row = y % fh;                    // the cell's own row
                    for (let x = 0; x < cv.width; x += 1) {
                        if (d[(y * cv.width + x) * 4 + 3] <= 8) continue;
                        if (top < 0 || row < top) top = row;
                        if (row > bot) bot = row;
                        // ...and the same across, per cell: a vehicle is cut to
                        // its LENGTH rather than its height (see
                        // VehicleBillboard), so the width of the drawn art
                        // inside its cell has to be measured as well.
                        const col = x % fw;
                        if (lft < 0 || col < lft) lft = col;
                        if (col > rgt) rgt = col;
                    }
                }
                if (top >= 0 && bot > top) {
                    const fill = (bot - top + 1) / fh;
                    // Half a pixel past the last opaque row: the foot is the
                    // bottom of that pixel, not the middle of it.
                    const foot = (bot + 1) / fh;
                    const wide = rgt > lft ? (rgt - lft + 1) / fw : 1;
                    if (fill > 0.15) out = { fill, foot, wide };
                }
            }
        } catch (e) { out = null; }   // a sheet we are not allowed to read back
        _figureBox.set(key, out);
        return out;
    }

    // Every figure standing in the world, so a second camera can be told about
    // them all at once. A billboard is a flat card that turns to face the eye,
    // which works perfectly until there are two eyes: the card can only be
    // turned one way, so in split-screen the second player would see everybody
    // edge-on. The answer is to turn them ALL to whichever camera is about to
    // draw, once per view, which needs a list of them - and the only honest
    // place for that list is the class itself.
    const _billboards = new Set();

    // Turn every card in the world to a camera, and pick the right walking
    // frame for it. Called once before each viewport is drawn.
    function faceBillboards(camX, camZ, camYaw) {
        for (const b of _billboards) {
            if (!b.mesh || (!b.mesh.visible && !b._wantVisible)) continue;
            b.faceCamera(camX, camZ, camYaw);
        }
    }

    class CharacterBillboard {
        constructor(sheet, index, height) {
            this.sheet  = sheet;
            this.index  = index || 0;
            this.h      = height || PERSON_H;
            this.yaw    = 0;         // the way this figure faces
            this.step   = 0;         // distance walked, drives the walk cycle
            this.moving = false;
            this._sized = false;

            const lay = characterSheetLayout(sheet, this.index);
            this.cols = lay.cols; this.rows = lay.rows;
            this.colBase = lay.colBase; this.rowBase = lay.rowBase;

            this.base = characterSheetTexture(sheet);
            this.tex  = this.base ? this.base.clone() : null;
            if (this.tex) {
                this.tex.repeat.set(1 / this.cols, 1 / this.rows);
                this.tex.offset.set(this.colBase / this.cols, 1 - (this.rowBase + 1) / this.rows);
                if (this.base.image && this.base.image.width) this.tex.needsUpdate = true;
            }
            _billboards.add(this);
            // Unlit, and dimmed by hand with the hour (see setDaylight): a card
            // that always turns to the camera has no honest normal to light.
            this.mat = new THREE.MeshBasicMaterial({
                map: this.tex, transparent: true, alphaTest: 0.4,
                side: THREE.DoubleSide, depthWrite: true, fog: true
            });
            this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(this.h * 0.66, this.h), this.mat);
            this.mesh.frustumCulled = false;
            this.mesh.visible = false;      // nothing shows a blank card
            this._wantVisible = true;       // ...and nothing shows one put away
            // The card, and where the feet are on it. Both are re-worked from
            // the art itself the moment it lands (see update); until then the
            // card IS the figure, which is what it always used to be.
            this.cardH = this.h;
            this.foot  = 1;
        }

        // `y` is the GROUND under the figure, not the middle of the card. It is
        // kept, because the card is re-cut the moment the art lands and the
        // same ground then has to answer for a card of a different height.
        setPosition(x, y, z) {
            this._gx = x; this._gy = y; this._gz = z;
            this.mesh.position.set(x, y + this.cardH * (this.foot - 0.5), z);
        }

        // Put the card away, or bring it back. A card is never shown before its
        // art has landed, so this is remembered rather than obeyed on the spot:
        // a pooled figure taken out of frame and dealt out again (the traffic
        // does exactly that) would otherwise stay invisible for ever, its one
        // sizing pass long since spent.
        setVisible(v) {
            this._wantVisible = !!v;
            this.mesh.visible = !!v && this._sized;
        }

        setDaylight(df) {
            const v = 0.42 + 0.58 * Math.max(0, Math.min(1, df));
            this.mat.color.setRGB(v, v, v);
        }

        // Re-cut the card to the real shape of the art the moment it lands, turn
        // the figure to the camera, and step the walk cycle.
        update(camX, camZ, camYaw) {
            if (!this.tex) return;
            if (!this._sized && this.base.image && this.base.image.width) {
                this._sized = true;
                this.tex.image = this.base.image;
                this.tex.needsUpdate = true;
                const fw = this.base.image.width / this.cols;
                const fh = this.base.image.height / this.rows;
                if (fh > 0) {
                    const fig = characterFigureBox(this.sheet, this.index);
                    this.foot = fig ? fig.foot : 1;
                    const cut = this._cut(fw, fh, fig);
                    this.cardH = cut.h;
                    this.mesh.geometry.dispose();
                    this.mesh.geometry = new THREE.PlaneGeometry(cut.w, cut.h);
                    // Whoever placed it did so against the old card, so it is
                    // put back on the same ground rather than nudged from where
                    // the old one happened to sit.
                    if (this._gy !== undefined) this.setPosition(this._gx, this._gy, this._gz);
                }
                this.mesh.visible = this._wantVisible;
            }
            this.faceCamera(camX, camZ, camYaw);
        }

        // How big the card is, given the frame it is cut from and the measured
        // art inside it. A FIGURE is cut by height: the art fills about two
        // thirds of its cell, and cutting to the cell is what left everybody in
        // this world knee-high to the party and hovering off the ground.
        _cut(fw, fh, fig) {
            const h = fig ? this.h / fig.fill : this.h;
            return { w: h * (fw / fh), h };
        }

        // Turn to an eye, and show the side of the figure that eye can see.
        // Kept apart from update() above because in split-screen it has to run
        // again for the second camera, just before that half of the screen is
        // drawn, while the sizing and the walk cycle must not.
        faceCamera(camX, camZ, camYaw) {
            if (!this.tex) return;
            this.mesh.rotation.set(0, camYaw, 0);
            const row = characterFacingRow(this.yaw,
                camX - this.mesh.position.x, camZ - this.mesh.position.z);
            // Left foot, stand, right foot, stand.
            const cycle = [1, 0, 1, 2];
            const col = this.moving ? cycle[Math.floor(this.step / 7) % 4] : 1;
            this.tex.offset.set((this.colBase + col) / this.cols,
                1 - (this.rowBase + row + 1) / this.rows);
        }

        dispose() {
            _billboards.delete(this);
            if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mat.dispose();
            if (this.tex) this.tex.dispose();
        }
    }

    // =========================================================================
    // Vehicle sprite billboards
    // =========================================================================
    // A vehicle on the road out here is the SAME art the 2D map drives: one of
    // the walk sheets under img/characters/Vehicles, stood up as a card that
    // turns to the lens, with the row picked from where the eye stands relative
    // to the way the vehicle is POINTING - exactly as a person is drawn. So the
    // car met on a country road and the car met on the 2D map are one car.
    //
    // Cut by LENGTH, not by height. A vehicle sheet's cell is as wide as the
    // vehicle is long, so scaling the cell until the drawn art measures the
    // vehicle's real length puts every frame at its right size at once: the
    // head-on frame reads narrow because it is DRAWN narrow inside that same
    // cell, not because the card was cut differently for it.
    class VehicleBillboard extends CharacterBillboard {
        // `length` is the vehicle's real length in world units.
        constructor(sheet, length) {
            super(sheet, 0, length);
            this.moving = false;   // nothing in a vehicle sheet is a walk cycle
        }

        _cut(fw, fh, fig) {
            const w = fig && fig.wide ? this.h / fig.wide : this.h;
            return { w, h: w * (fh / fw) };
        }
    }
    // Handed to the rest of the suite.
    Object.assign(VW, {
        AIR_GRAVITY, BODY_BOUNCE_MAX, BODY_PITCH_MAX, BODY_ROLL_MAX,
        BOOST_ACCEL_MULT, BOOST_FUEL_MULT, BOOST_RELEASE_DECAY, BRAKE_DECEL,
        CAMPER_BOUNDS, CAMPER_MAX_FUEL, CRITICAL_PARTS, CRUISE_KMH,
        SHIP_BRIDGE_BOUNDS, SHIP_HELM_SEAT, SHIP_BRIDGE_SEATS,
        SHIP_LAND_KMH, SHIP_LAND_CLEAR, SHIP_FLY_MIN, SHIP_FLY_MAX, SHIP_CLIMB_RATE,
        ALONGSIDE_MAX, CharacterBillboard, VehicleBillboard, DOOR_AUTO_OPEN_RANGE, DRAG_K, DRIVER_SEAT,
        RIDER_SEATS, RIDE_ALONGSIDE,
        CAVE_SKY, ENGINE_ACCEL, FOG_CAVE, FOG_DAY, FOG_FREE, FOG_UNDERWATER, FOOT_BODY_R,
        loadVoxelTex, VOXEL_TEX_SIZE,
        Blocks, blockMaterial, blockSpan, disposeBlockMaterials,
        VEHICLE_STEP_UP,
        FOOT_CABIN_WALK, FOOT_CROUCH_MULT, FOOT_EYE, FOOT_EYE_CROUCH, FOOT_GRAVITY,
        FOOT_JUMP_VEL, FOOT_SPRINT_MULT, FOOT_VAN_HALF_LEN, FOOT_VAN_RADIUS,
        PAD_LOOK_X, PAD_LOOK_Y,
        OVERLAY_Z, WEAPON_Z, WORLD_UI_Z, WORLD_UI_IDS, MENU_Z,
        FOOT_WALK, FLY_CLIMB, FLY_DRAG, FLY_SKILL_ID, FLY_SPEED, FLY_SPRINT_MULT,
        JUMP_DEBOUNCE_MS, JUMP_DOUBLE_MS,
        SWIM_BUOYANCY, SWIM_DEPTH, SWIM_DRAG, SWIM_ENTRY_SPLASH, SWIM_FLOAT,
        SWIM_RISE, SWIM_SINK, SWIM_SPEED, SWIM_SPRINT_MULT,
        FUEL_PER_KM, FUEL_PER_UNIT, FUEL_VAR, GEARS, GEAR_FORCE,
        GamepadRaw, HANDBRAKE_DECEL, HANDBRAKE_GRIP, HEADLIGHT_BEAM_OPACITY,
        HEADLIGHT_INTENSITY, HEADLIGHT_NIGHT, KMH_TO_UNITS, LAT_SCRUB,
        LAUNCH_GRADE, LAUNCH_KMH, LIMINAL_ACCEL_SEC, LIMINAL_BOOST_FUEL_MULT,
        LIMINAL_BUILD_BUDGET, LIMINAL_FUEL_PER_SEC, LIMINAL_TERRAIN_RADIUS,
        LIMINAL_TOP_KMH, LOOT_RANGE, MAX_KMH, MAX_STEER_LOCK, MOUNTAIN_MAX_H,
        NATURAL_TOP, OVERDRIVE_DECAY, OVERDRIVE_KMHPS, PERSON_H, PLANT_CROPS, TRAFFIC_VEHICLES,
        PLANT_POOL, RECOIL_KICK, REVERSE_ACCEL, REVERSE_MAX_KMH, ROAD_GAP,
        ROAD_BARRIER_H, ROAD_BED_DROP, ROAD_COL, ROAD_DASH_OFF, ROAD_DASH_ON,
        ROAD_HALF_LANE, ROAD_KERB_H, ROAD_LANE_OFF, ROAD_LANE_W, ROAD_LINE_W, ROAD_LINKS,
        ROAD_MARK_LIFT, ROAD_OPPOSITE, ROAD_PAVE_T, ROAD_SHOULDER_W, ROAD_SKIRT,
        ROAD_SINK, ROAD_STEP, ROAD_TOTAL_W, ROCK_ASH, ROCK_POOL, SECONDARY_PARTS,
        SHIFT_TIME, SKY_KEYFRAMES, SLOPE_ACCEL, SNOW_LINE, SOLID_PROPS,
        PROP_RADIUS, PROP_MIN_R, PROP_SMASH_KMH,
        SHIP_RAM_KMH, SHIP_RAM_DAMAGE, SHIP_RAM_EVERY,
        STEER_FALLOFF, STEP_SOUNDS, SURFACES, TALK_RANGE,
        TRAFFIC_CRASH_KMH,
        VOXEL_STEP_MATERIAL,
        TRAFFIC_MAX, TRAFFIC_RING_MAX, TRAFFIC_RING_MIN, TREE_POOLS, UNITS_PER_M,
        GRAVITY_MAX, GRAVITY_MIN, gravityScale, setGravityScale, VoxelWorldState,
        OMEGA_HEIGHT, OMEGA_PROXY_D, OMEGA_SIGHT, OMEGA_SPAN, OMEGA_TILE,
        SHIP_ATMOSPHERE_Y, VEHICLE_DRIVE, VIEW_FAR,
        WALK_LANTERN_INTENSITY, WALL_RUN_CLIMB, WALL_RUN_TIME, WALL_STICK_R,
        WARP_START_KMH, WATER_LEVEL_Y,
        isRiverTile, riverCoordTable, riverFlowsTo, riverLinksAt,
        WHEELBASE, WORLD_MAP_ID, WORLD_SCALE, WORLD_TILES, WORLD_TILE_SIZE, skyFogColor,
        ZOOM_MAX, _Biomes, _BiomesMap, _BiomesMapIndex, _ROCK_COLOR, _SNOW_COLOR,
        _biomeByName, _biomeTileCache, _charSheetTex, _clearBiomeCaches, _fbm,
        _findBiome, _maxAniso, _pFade, _pGrad, _pLerp, _perlin, _perm,
        _renderTypeCache, _roadDirCache, _sampleBiomeUncached, _texCache,
        camperFuelConsume, camperFuelGet, camperFuelSet, camperMaxFuel,
        characterFacingRow, characterSheetLayout, characterSheetTexture, faceBillboards,
        dayFactorForHour, getBiomeOverride, getRenderType, getRoadDirectionAt,
        initPerlinWithSeed, VOXEL_WORLD_SEED, setBiomeOverride, setAlienTerrain, getAlienTerrain,
        isFarlandsTile, farlandsBiomeAt,
        isRoadTile, loadTex, noiseHeight, parseRoadDirection, pickRandomRoadTile,
        placeNameAt, roadDataReady, roadExitsFrom, roadLabelAt, roadLinksAt,
        roadTileTable, sampleBiomeAt, sampleSkyColor, setTextureAnisotropy
    });
})();
