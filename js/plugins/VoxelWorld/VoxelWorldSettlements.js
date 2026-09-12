//=============================================================================
// VoxelWorldSettlements.js
// VoxelWorld: town / village planning, building interiors, abandoned structures
//
// Part of the VoxelWorld suite. The ground of that world is a field of small
// destructible voxels; this module is one slice of the machinery laid over it.
// Load order is fixed in plugins.js and every module reads the shared state it
// needs off window.VoxelWorld.
//=============================================================================

/*:
 * @target MZ
 * @plugindesc VoxelWorld - town / village planning, building interiors, abandoned structures
 * @author Omni-Lex
 *
 * @help
 * town / village planning, building interiors, abandoned structures.
 *
 * One module of the VoxelWorld suite (VoxelWorldCore.js loads first). It
 * declares no plugin commands of its own; those live in VoxelWorldSystem.js.
 */

(() => {
    'use strict';

    const VW = window.VoxelWorld;
    if (!VW) { console.error('[VoxelWorld] core not loaded before VoxelWorldSettlements.js'); return; }

    const {
        WORLD_TILE_SIZE, getAlienTerrain, getRoadDirectionAt, profileFor, sampleBiomeAt
    } = VW;

    // =========================================================================
    // Settlement planning
    // =========================================================================
    // A town is planned as plain data before a single triangle is built: street
    // lines, the blocks between them, the lots around each block's edge and the
    // furniture along its pavements. Everything is derived from the world square
    // alone, so the same town is laid out the same way every time it is entered,
    // and the plan can be read (and tested) without a renderer.

    // Four world units to the metre, so read these as quarters of a metre.
    //
    // A NOTE ON THE SIZES. They used to be a third of this: a frontage of six
    // and a half metres and a depth of six, which is a garden shed, and a
    // skyscraper was a tower of sheds stacked twelve high. Worse, the room
    // splitter needs ROOM_MIN * 2 + a wall - sixty-two units - before it can cut
    // a floor in two, and no lot in the game was ever that wide, so EVERY
    // building anybody had ever walked into had exactly one room on every floor
    // and no staircase (which wants twenty-six units clear as well).
    //
    // So they are what a building really is: a town house eleven metres across
    // and fifteen deep, an office block up to thirty by twenty-six. There are
    // far fewer of them on a square as a result - a run of street fits three
    // where it used to fit twelve - which is the point. A city of twenty real
    // buildings reads as a city; a city of a hundred and twenty huts does not.
    const SETTLE = {
        streetW: 30,     // carriageway, kerb to kerb (7.5 m)
        walkW: 10,       // pavement each side (2.5 m)
        kerbH: 1.2,      // pavement lip above the road
        storeyH: 11,     // one floor (2.75 m)
        lotMin: 108,     // narrowest street frontage (27 m) - two rooms wide
        lotMax: 196,     // widest (49 m)
        depthMin: 92,    // how far a building reaches back off the street (23 m)
        depthMax: 138,   // (34 m), clamped so a block's two rows cannot meet
        paveH: 0.75,     // pavement top above the square's own ground
        roadH: 0.15,     // carriageway top above it
    };

    // Deterministic per-square noise, the same hash the decorator scatters with.
    function settleRnd(wx, wy, i) {
        const h = Math.sin(wx * 12.9898 + wy * 78.233 + i * 13.54) * 43758.5453;
        return h - Math.floor(h);
    }

    // =========================================================================
    // What a building is made of
    // =========================================================================
    // A scheme is the set of BLOCKS one building is put up out of: the skin of
    // its walls, the trim round its openings, the tiles on its roof, the course
    // it stands on and what it is glazed with. Every name is a key in the
    // world's own block palette (VoxelWorld.Blocks, see VoxelWorldCore), and
    // every one of them is a real picture rather than a colour.
    //
    // It is decided HERE, in the plan, rather than in the builder, because it
    // is a fact about the place: a village in the hills is timber and thatch,
    // the middle of a city is concrete and glass, a church is ashlar with
    // stained windows, and a ruin is whatever is left of somebody's brickwork.
    // The builder then only has to put up what the plan says.
    //
    //   facade   the wall skin, measured in window bays (see HOUSE.bayW)
    //   wall     the same wall with no windows in it: a barn, a ruin, a gable
    //   trim     quoins, lintels, the ridge
    //   roof     a pitched roof's covering
    //   flat     a flat roof's deck and parapet
    //   plinth   the course the whole thing stands on
    //   glass    a shopfront, a church window
    const BUILD_SCHEMES = {
        brick:     { facade: 'facade_brick',     wall: 'brick',     trim: 'stone',
                     roof: 'roof_tile',  flat: 'roof_slate', plinth: 'stone',    glass: 'glass' },
        render:    { facade: 'facade_plaster',   wall: 'plaster',   trim: 'stone',
                     roof: 'roof_tile',  flat: 'roof_slate', plinth: 'cobble',   glass: 'glass' },
        concrete:  { facade: 'facade_concrete',  wall: 'concrete',  trim: 'concrete',
                     roof: 'roof_slate', flat: 'roof_slate', plinth: 'concrete', glass: 'glass_dark' },
        sandstone: { facade: 'facade_sandstone', wall: 'sandstone', trim: 'sandstone',
                     roof: 'roof_tile',  flat: 'roof_slate', plinth: 'sandstone', glass: 'glass' },
        ashlar:    { facade: 'facade_stone',     wall: 'stone',     trim: 'marble',
                     roof: 'roof_slate', flat: 'roof_slate', plinth: 'granite',  glass: 'glass' },
        timber:    { facade: 'facade_timber',    wall: 'stucco',    trim: 'timber',
                     roof: 'thatch',     flat: 'roof_tile',  plinth: 'cobble',   glass: 'glass' },
        // The ones nobody puts a window in.
        barn:      { facade: null, wall: 'plank',     trim: 'timber',
                     roof: 'roof_metal', flat: 'roof_metal', plinth: 'cobble',   glass: 'glass' },
        shed:      { facade: null, wall: 'plank',     trim: 'timber',
                     roof: 'roof_tile',  flat: 'roof_tile',  plinth: 'cobble',   glass: 'glass' },
        church:    { facade: null, wall: 'stone',     trim: 'marble',
                     roof: 'roof_slate', flat: 'roof_slate', plinth: 'granite',  glass: 'glass_stain' },
        granary:   { facade: null, wall: 'cobble',    trim: 'stone',
                     roof: 'roof_metal', flat: 'roof_metal', plinth: 'granite',  glass: 'glass' },
        works:     { facade: 'facade_concrete',  wall: 'brick_dark', trim: 'iron',
                     roof: 'roof_metal', flat: 'roof_metal', plinth: 'concrete', glass: 'glass_dark' },
        ruin:      { facade: null, wall: 'brick_dark', trim: 'cobble',
                     roof: 'roof_slate', flat: 'roof_slate', plinth: 'cobble',   glass: 'glass' }
    };

    // Which of them a town of this size, at this height, builds in. The heart
    // of a city goes up in concrete and glass; its edges and every village are
    // brick, render and timber, which is what makes a skyline read as a
    // skyline rather than as one material stacked to different heights.
    const CITY_SCHEMES    = ['concrete', 'concrete', 'ashlar', 'brick', 'sandstone'];
    const OUTSKIRT_SCHEMES = ['brick', 'render', 'sandstone', 'timber'];
    const VILLAGE_SCHEMES = ['timber', 'timber', 'render', 'brick'];

    // The scheme one lot is built to. Deterministic on the square and the lot,
    // so a house is the same house made of the same blocks every time anybody
    // comes back to it.
    function schemeFor(wx, wy, idx, kind, core, storeys) {
        if (kind && BUILD_SCHEMES[kind]) return BUILD_SCHEMES[kind];
        const r = settleRnd(wx, wy, 8600 + idx * 13);
        let pool;
        if (kind === 'city') pool = (core > 0.5 || (storeys || 1) >= 8) ? CITY_SCHEMES : OUTSKIRT_SCHEMES;
        else pool = VILLAGE_SCHEMES;
        return BUILD_SCHEMES[pool[Math.floor(r * pool.length) % pool.length]];
    }

    // The whole plan of one settlement square, in tile-local coordinates
    // (-ts/2 .. ts/2 on both axes).
    //
    //   lines     street centrelines on each axis (the tile edges are streets
    //             too, so neighbouring town squares join up)
    //   blocks    what stands between them: built, a park, or a car park
    //   lots      one building each, sitting on a block edge and facing its street
    //   props     lamps, trees, benches, bins, parked cars, crossings
    //   lanes     the pavements, which is where people walk
    // A city is a street grid; a village is a road with houses along it. They
    // are laid out by two different planners and only share the shape of what
    // they hand back, so the builder can put either one up.
    function planSettlement(wx, wy, big, ts) {
        return buildSolids(big ? planTown(wx, wy, ts) : planVillage(wx, wy, ts));
    }

    function planTown(wx, wy, ts) {
        const S = SETTLE;
        const big = true;
        // Two blocks a side, not three: a block has to be deep enough to take a
        // building off each of its four streets and still have a courtyard in
        // the middle of it, and a building is now sixteen to twenty-six metres
        // deep.
        const nb = 2;                              // blocks per axis
        const pitch = ts / nb;
        const lines = [];
        for (let k = 0; k <= nb; k++) lines.push(-ts / 2 + k * pitch);
        const half = S.streetW / 2 + S.walkW;      // road + pavement, from the centreline

        const plan = { nb, pitch, lines, half, blocks: [], lots: [], props: [], lanes: [],
                       roads: [], station: null, big: true, village: false,
                       paveH: S.paveH, roadMat: 'asphalt', markings: true };
        for (const c of lines) {
            plan.roads.push({ axis: 'h', c, w: S.streetW });
            plan.roads.push({ axis: 'v', c, w: S.streetW });
        }

        // Pavement lanes: one on each side of every street line, running the
        // whole tile. People walk these and nothing is ever built on them.
        const laneOff = S.streetW / 2 + S.walkW / 2;
        for (const c of lines) {
            for (const off of [-laneOff, laneOff]) {
                // The far pavement of a border street belongs to the square next
                // door: walking it would put a citizen on somebody else's ground.
                if (Math.abs(c + off) > ts / 2 - 2) continue;
                plan.lanes.push({ axis: 'h', c: c + off });
                plan.lanes.push({ axis: 'v', c: c + off });
            }
        }

        let seed = 0;
        for (let bi = 0; bi < nb; bi++) {
            for (let bj = 0; bj < nb; bj++) {
                const x0 = lines[bi] + half, x1 = lines[bi + 1] - half;
                const z0 = lines[bj] + half, z1 = lines[bj + 1] - half;
                if (x1 - x0 < 20 || z1 - z0 < 20) continue;
                // How far this block sits from the middle of the town, 0 at the
                // centre and 1 at the edge: the heart is built tallest.
                const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
                const core = 1 - Math.min(1, Math.hypot(cx, cz) / (ts * 0.5));

                const roll = settleRnd(wx, wy, 900 + bi * 7 + bj * 31);
                let kind = 'built';
                if (roll < (big ? 0.14 : 0.22)) kind = 'park';
                else if (big && roll < 0.24) kind = 'parking';
                // The first open block is the filling station's forecourt: every
                // town has one (that is what refuelling in a town means), and it
                // belongs on a plot of its own rather than dropped through
                // whatever happened to be built there.
                if (kind !== 'built' && !plan.station) {
                    kind = 'station';
                    plan.station = { x: (x0 + x1) / 2, z: (z0 + z1) / 2,
                                     rot: settleRnd(wx, wy, 940 + bi + bj) * Math.PI * 2 };
                }
                const block = { x0, x1, z0, z1, kind, core, bi, bj };
                plan.blocks.push(block);

                if (kind === 'built') {
                    seed = _planBlockLots(plan, block, wx, wy, big, core, seed);
                }
            }
        }

        if (!plan.station) {
            const b = plan.blocks[plan.blocks.length - 1];
            plan.station = b
                ? { x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2, rot: 0 }
                : { x: 0, z: 0, rot: 0 };
        }

        _planProps(plan, wx, wy, big, ts);
        return plan;
    }


    // A village is not a small city. There is no grid and there are no
    // pavements: one road runs through the place, a lane or two comes off it,
    // and the houses stand back from the verge on their own plots with a garden
    // and a fence around each. The green in the middle has the church and the
    // well on it, and the corners of the square are somebody's fields.
    function planVillage(wx, wy, ts) {
        const S = SETTLE;
        const plan = {
            nb: 0, pitch: 0, lines: [], half: 0, blocks: [], lots: [], props: [],
            lanes: [], roads: [], station: null, big: false, village: true,
            paveH: 0, roadMat: 'dirt', markings: false
        };
        let seed = 100;
        const rnd = () => settleRnd(wx, wy, ++seed);

        // The through road follows whatever the world map itself says runs
        // across this square, so a village on a road is ON that road.
        const dir = String(getRoadDirectionAt(wx, wy) || '').indexOf('vert') === 0 ? 'v' : 'h';
        const side = dir === 'h' ? 'v' : 'h';
        plan.roads.push({ axis: dir, c: 0, w: 22, main: true });
        const lanes = 1 + (rnd() < 0.55 ? 1 : 0);
        for (let i = 0; i < lanes; i++) {
            plan.roads.push({ axis: side, c: Math.round((rnd() - 0.5) * ts * 0.44), w: 15 });
        }
        for (const r of plan.roads) {
            const off = r.w / 2 + 5;
            if (Math.abs(r.c - off) < ts / 2 - 2) plan.lanes.push({ axis: r.axis, c: r.c - off });
            if (Math.abs(r.c + off) < ts / 2 - 2) plan.lanes.push({ axis: r.axis, c: r.c + off });
        }

        // Nothing may be dropped on a road or on top of anything already put
        // down: a village is loose enough that its plots have to be checked.
        const taken = [];
        const clearOfRoads = (x, z, w, d) => plan.roads.every(r => {
            const c = r.axis === 'h' ? z : x;
            const s = r.axis === 'h' ? d : w;
            return Math.abs(c - r.c) > r.w / 2 + s / 2 + 3;
        });
        const fits = (x, z, w, d) => {
            if (Math.abs(x) + w / 2 > ts / 2 - 6 || Math.abs(z) + d / 2 > ts / 2 - 6) return false;
            if (!clearOfRoads(x, z, w, d)) return false;
            return taken.every(t =>
                Math.abs(t.x - x) > (t.w + w) / 2 + 4 || Math.abs(t.z - z) > (t.d + d) / 2 + 4);
        };
        const claim = (x, z, w, d) => { taken.push({ x, z, w, d }); };

        // The green: a patch of grass at the first crossing, with the church
        // and the well on it. Claimed before anything else, so the village
        // grows around it rather than over it.
        const lane = plan.roads[1];
        const cross = lane ? lane.c : 0;
        const GW = 86;
        // In one of the four quadrants of the crossing, clear of both roads.
        const offA = plan.roads[0].w / 2 + GW / 2 + 8 + rnd() * 18;
        const offB = (lane ? lane.w / 2 : 0) + GW / 2 + 8;
        let green = null;
        for (const sa of [1, -1]) {
            for (const sb of [1, -1]) {
                const along = cross + (lane ? sb * offB : (rnd() - 0.5) * ts * 0.3);
                const cand = dir === 'h'
                    ? { x: along, z: sa * offA }
                    : { x: sa * offA, z: along };
                if (fits(cand.x, cand.z, GW, GW)) { green = cand; break; }
            }
            if (green) break;
        }
        if (green) {
            claim(green.x, green.z, GW, GW);
            plan.props.push({ kind: 'green', x: green.x, z: green.z, w: GW, d: GW, rot: 0 });
            plan.props.push({ kind: 'well', x: green.x + 22, z: green.z + 18, rot: 0 });
            for (let i = 0; i < 5; i++) {
                plan.props.push({
                    kind: 'tree',
                    x: green.x - GW / 2 + 8 + rnd() * (GW - 16),
                    z: green.z - GW / 2 + 8 + rnd() * (GW - 16), rot: 0
                });
            }
            plan.props.push({ kind: 'bench', x: green.x - 20, z: green.z + 22, rot: rnd() * Math.PI });
            // The church stands on the green itself.
            plan.lots.push({
                x: green.x - 12, z: green.z - 14, w: 34, d: 26, rot: 0,
                storeys: 2, h: 2 * S.storeyH, side: dir === 'h' ? 0 : 2,
                gable: false, shop: false, kind: 'church',
                blocks: BUILD_SCHEMES.church
            });
        }

        // The houses, strung along the verges of every road at irregular gaps.
        for (const r of plan.roads) {
            let t = -ts / 2 + 60;
            let guard = 0;
            // Set well apart, because each of them is now a house with rooms in
            // it and a garden round it rather than a hut on a verge.
            while (t < ts / 2 - 60 && guard++ < 30) {
                t += 52 + rnd() * 46;
                for (const sgn of [-1, 1]) {
                    if (rnd() < 0.2) continue;
                    // Fifteen to twenty-five metres across, ten to seventeen deep:
                    // wide enough for the floor to be cut into rooms and for a
                    // stair to fit up the corner of it.
                    const w = 78 + rnd() * 48;
                    const d = 62 + rnd() * 36;
                    const lw = r.axis === 'h' ? w : d;
                    const ld = r.axis === 'h' ? d : w;
                    const plot = Math.max(lw, ld) + 18;
                    // The plot is set back far enough that its garden starts at
                    // the verge rather than in the middle of the road.
                    const back = r.w / 2 + plot / 2 + 5 + rnd() * 16;
                    const x = r.axis === 'h' ? t : r.c + sgn * back;
                    const z = r.axis === 'h' ? r.c + sgn * back : t;
                    if (!fits(x, z, plot, plot)) continue;
                    claim(x, z, plot, plot);
                    plan.props.push({ kind: 'garden', x, z, w: plot, d: plot, rot: 0 });
                    for (const f of _fenceRing(x, z, plot, plot)) plan.props.push(f);
                    // Most of a village is two storeys, some of it is one, and
                    // the odd house has a third under the gable. (The old roll
                    // was taken TWICE, so the height and the number of floors
                    // disagreed about a third of the time: a two-storey house
                    // one storey tall, with its upper floor inside the roof.)
                    const rs = rnd();
                    const st = rs < 0.18 ? 3 : rs < 0.72 ? 2 : 1;
                    // Every village has its shops: the baker, the smith, the
                    // one that sells everything. About one house in four is one,
                    // and it wears the blue roof that says so.
                    const isShop = rnd() < 0.26;
                    plan.lots.push({
                        x, z, w: lw, d: ld, rot: 0,
                        storeys: st,
                        h: st * S.storeyH,
                        side: r.axis === 'h' ? (sgn < 0 ? 1 : 0) : (sgn < 0 ? 3 : 2),
                        gable: true, shop: isShop, kind: 'house',
                        blocks: schemeFor(wx, wy, plan.lots.length, 'village', 0, st),
                        shopType: isShop ? _shopTypeFor(wx, wy, plan.lots.length, false) : null,
                        shopFloors: isShop ? [0] : null
                    });
                    if (rnd() < 0.45) {
                        plan.props.push({
                            kind: 'shed',
                            x: x + (rnd() - 0.5) * plot * 0.6,
                            z: z + (rnd() - 0.5) * plot * 0.6, rot: rnd() * Math.PI
                        });
                    }
                    if (rnd() < 0.5) {
                        plan.props.push({
                            kind: 'tree',
                            x: x + (rnd() - 0.5) * plot * 0.7,
                            z: z + (rnd() - 0.5) * plot * 0.7, rot: 0
                        });
                    }
                }
            }
        }

        // Whatever ground is left over at the corners is farmed. A field takes
        // whatever room the houses have left it rather than one fixed size: the
        // houses are big enough now that a full plot rarely fits into a corner,
        // and a corner with nothing in it reads as a village that stops dead at
        // its own gardens.
        const FIELD_SIZES = [120, 96, 74, 56];
        for (const cx of [-1, 1]) {
            for (const cz of [-1, 1]) {
                let FW = 0, x = 0, z = 0;
                for (const w of FIELD_SIZES) {
                    const px = cx * (ts / 2 - w / 2 - 10);
                    const pz = cz * (ts / 2 - w / 2 - 10);
                    if (!fits(px, pz, w, w)) continue;
                    FW = w; x = px; z = pz;
                    break;
                }
                if (!FW) continue;
                claim(x, z, FW, FW);
                if (rnd() < 0.22) {
                    plan.props.push({ kind: 'pond', x, z, w: FW * 0.5, d: FW * 0.42, rot: 0 });
                    continue;
                }
                plan.props.push({ kind: 'field', x, z, w: FW, d: FW,
                                  rot: rnd() < 0.5 ? 0 : Math.PI / 2, crop: Math.floor(rnd() * 3) });
                if (rnd() < 0.5) {
                    plan.props.push({ kind: 'haystack', x: x + FW * 0.3, z: z + FW * 0.3, rot: 0 });
                }
            }
        }

        // A single lamp at each crossing and one outside the church: a village
        // is not lit like a city.
        for (const r of plan.roads) {
            if (r.main) continue;
            plan.props.push({ kind: 'lamp', x: dir === 'h' ? r.c + 14 : 14,
                              z: dir === 'h' ? 14 : r.c + 14, rot: 0 });
        }

        // The pump the camper fills up at: on the verge of the through road,
        // out at the edge of the village where a real one would be.
        const stEdge = (rnd() < 0.5 ? -1 : 1) * (ts / 2 - 60);
        plan.station = dir === 'h'
            ? { x: stEdge, z: 40, rot: 0 }
            : { x: 40, z: stEdge, rot: Math.PI / 2 };
        claim(plan.station.x, plan.station.z, 70, 60);

        return plan;
    }

    // The solid masses of a town: every run of buildings merged into the one
    // rectangle it really is. Walking into a terrace should put you back on the
    // street, not wedge you in the two-unit joint between two houses.
    function buildSolids(plan) {
        const byGroup = new Map();
        plan.lots.forEach((lot, i) => {
            const key = lot.group || ('h' + i);
            let g = byGroup.get(key);
            if (!g) {
                g = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
                byGroup.set(key, g);
            }
            g.x0 = Math.min(g.x0, lot.x - lot.w / 2);
            g.x1 = Math.max(g.x1, lot.x + lot.w / 2);
            g.z0 = Math.min(g.z0, lot.z - lot.d / 2);
            g.z1 = Math.max(g.z1, lot.z + lot.d / 2);
        });
        plan.solids = [];
        for (const g of byGroup.values()) {
            plan.solids.push({
                x: (g.x0 + g.x1) / 2, z: (g.z0 + g.z1) / 2,
                w: g.x1 - g.x0, d: g.z1 - g.z0
            });
        }
        return plan;
    }

    // A fence around a plot, as four runs of railing.
    function _fenceRing(x, z, w, d) {
        return [
            { kind: 'fence', x, z: z - d / 2, len: w, rot: 0 },
            { kind: 'fence', x, z: z + d / 2, len: w, rot: 0 },
            { kind: 'fence', x: x - w / 2, z, len: d, rot: Math.PI / 2 },
            { kind: 'fence', x: x + w / 2, z, len: d, rot: Math.PI / 2 }
        ];
    }

    // Lots around the edge of one block: buildings face out onto the street and
    // back onto a shared courtyard. The two axes are inset by the building depth
    // so the corners never grow into one another.
    function _planBlockLots(plan, b, wx, wy, big, core, seed) {
        const S = SETTLE;
        // How far back a building reaches. Two rows are built into every block,
        // one off each opposing street, so neither may be deeper than half of
        // what the block has to give - less a courtyard down the middle. Without
        // this the deepest pair on a block grew INTO one another and their walls
        // stood in the same place, which is what set them shimmering.
        const YARD = 16;
        const roomX = Math.max(S.depthMin, (b.x1 - b.x0 - YARD) / 2);
        const roomZ = Math.max(S.depthMin, (b.z1 - b.z0 - YARD) / 2);
        const depth = (horizontal) => {
            const room = Math.max(24, Math.min(S.depthMax, horizontal ? roomZ : roomX));
            const want = S.depthMin + settleRnd(wx, wy, ++seed) * (S.depthMax - S.depthMin);
            return Math.min(want, room);
        };
        // How tall. A city block is a city block: five storeys out at the edge
        // of town, eighteen in the middle of it, and every so often one that
        // goes half as high again as its neighbours - which is what makes a
        // skyline a skyline rather than a wall of equal boxes.
        const storeys = (d) => {
            const base = big ? 5 + Math.round(core * 10) : 1;
            const jit  = Math.round(settleRnd(wx, wy, ++seed) * (big ? 5 : 1));
            let st = Math.max(1, base + jit - (d ? 1 : 0));
            if (big && settleRnd(wx, wy, ++seed) < 0.12) st = Math.round(st * 1.7);
            return st;
        };

        // side: 0 north (-z), 1 south (+z), 2 west (-x), 3 east (+x)
        const runSide = (side) => {
            const horizontal = side < 2;
            const d = depth(horizontal);
            const from = horizontal ? b.x0 : b.z0 + d;
            const to   = horizontal ? b.x1 : b.z1 - d;
            let t = from;
            let guard = 0;
            while (to - t > S.lotMin * 0.8 && guard++ < 24) {
                const w = Math.min(to - t, S.lotMin + settleRnd(wx, wy, ++seed) * (S.lotMax - S.lotMin));
                const c = t + w / 2;
                const st = storeys(false);
                const lot = horizontal
                    ? { x: c, z: side === 0 ? b.z0 + d / 2 : b.z1 - d / 2, w: w - 2, d, rot: 0 }
                    : { x: side === 2 ? b.x0 + d / 2 : b.x1 - d / 2, z: c, w: d, d: w - 2, rot: 0 };
                lot.storeys = st;
                lot.h = st * S.storeyH;
                lot.side = side;
                // Which run of buildings this one is part of. A terrace has no
                // gaps a person could fit through, so for walking into it counts
                // as one solid wall (see buildSolids).
                lot.group = 'b' + b.bi + '_' + b.bj + '_' + side;
                // A ground-floor shop wherever the street is a main one (the
                // middle cross of the town) and often enough elsewhere.
                lot.shop = big && settleRnd(wx, wy, ++seed) < (core > 0.55 ? 0.55 : 0.22);
                if (lot.shop) {
                    lot.shopType = _shopTypeFor(wx, wy, plan.lots.length, big);
                    // A block of any height has more than a ground floor to
                    // let: the first few storeys of a tower are shops and
                    // offices, and the rest of it is lived in. Floor 0 is the
                    // street door, so it is always one of them.
                    lot.shopFloors = [0];
                    const lettable = Math.min(st, 4);
                    for (let f = 1; f < lettable; f++) {
                        if (settleRnd(wx, wy, 7400 + plan.lots.length * 11 + f) < 0.45) {
                            lot.shopFloors.push(f);
                        }
                    }
                }
                lot.gable = !big || st <= 2;
                lot.facade = Math.floor(settleRnd(wx, wy, ++seed) * 3);
                // What it is built out of. A works or a warehouse where the
                // block is a car park's neighbour, ordinary brick and concrete
                // everywhere else (see BUILD_SCHEMES).
                lot.blocks = schemeFor(wx, wy, plan.lots.length,
                    big ? 'city' : 'village', core, st);
                plan.lots.push(lot);
                t += w;
            }
        };
        for (let side = 0; side < 4; side++) runSide(side);

        // The courtyard inside: a garden in a village, bins and a tree in a city.
        plan.props.push({ kind: 'yard', x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2,
                          w: Math.max(4, b.x1 - b.x0 - S.depthMax * 2),
                          d: Math.max(4, b.z1 - b.z0 - S.depthMax * 2), rot: 0 });
        return seed;
    }

    // Street furniture, laid along the pavements and at the junctions.
    function _planProps(plan, wx, wy, big, ts) {
        const S = SETTLE;
        const kerb = S.streetW / 2 + 3;          // just inside the pavement edge
        const lampEvery = big ? 54 : 78;
        let seed = 5000;

        for (let li = 0; li < plan.lines.length; li++) {
            const c = plan.lines[li];
            for (const axis of ['h', 'v']) {
                for (const sgn of [-1, 1]) {
                    for (let t = -ts / 2 + 30; t < ts / 2 - 20; t += lampEvery) {
                        const jit = (settleRnd(wx, wy, ++seed) - 0.5) * 12;
                        const along = t + jit;
                        const off = c + sgn * kerb;
                        const p = axis === 'h' ? { x: along, z: off } : { x: off, z: along };
                        const r = settleRnd(wx, wy, ++seed);
                        // Lamps alternate with a tree, a bench or a bin, so a
                        // pavement is never a line of identical posts.
                        p.kind = r < 0.45 ? 'lamp' : r < 0.72 ? 'tree' : r < 0.86 ? 'bench' : 'bin';
                        p.rot = axis === 'h' ? 0 : Math.PI / 2;
                        plan.props.push(p);
                    }
                }
            }
        }

        // Parked cars along the kerb, and a zebra crossing on every approach to
        // every junction.
        for (let i = 0; i < plan.lines.length; i++) {
            for (let j = 0; j < plan.lines.length; j++) {
                const x = plan.lines[i], z = plan.lines[j];
                if (Math.abs(x) > ts / 2 || Math.abs(z) > ts / 2) continue;
                const d = S.streetW / 2 + 5;
                plan.props.push({ kind: 'zebra', x: x, z: z - d, rot: 0 });
                plan.props.push({ kind: 'zebra', x: x, z: z + d, rot: 0 });
                plan.props.push({ kind: 'zebra', x: x - d, z: z, rot: Math.PI / 2 });
                plan.props.push({ kind: 'zebra', x: x + d, z: z, rot: Math.PI / 2 });
                if (big && i > 0 && j > 0 && i < plan.lines.length - 1 && j < plan.lines.length - 1) {
                    plan.props.push({ kind: 'signal', x: x - d, z: z - d, rot: 0 });
                    plan.props.push({ kind: 'signal', x: x + d, z: z + d, rot: Math.PI });
                }
            }
        }

        for (const b of plan.blocks) {
            if (b.kind === 'station') {
                plan.props.push({ kind: 'tarmac', x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2,
                                  w: b.x1 - b.x0, d: b.z1 - b.z0, rot: 0 });
            } else if (b.kind === 'park') {
                plan.props.push({ kind: 'lawn', x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2,
                                  w: b.x1 - b.x0, d: b.z1 - b.z0, rot: 0 });
                plan.props.push({ kind: 'fountain', x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2, rot: 0 });
                const n = 4 + Math.floor(settleRnd(wx, wy, ++seed) * 6);
                for (let k = 0; k < n; k++) {
                    plan.props.push({
                        kind: 'tree',
                        x: b.x0 + 10 + settleRnd(wx, wy, ++seed) * (b.x1 - b.x0 - 20),
                        z: b.z0 + 10 + settleRnd(wx, wy, ++seed) * (b.z1 - b.z0 - 20),
                        rot: 0
                    });
                }
                for (let k = 0; k < 3; k++) {
                    plan.props.push({
                        kind: 'bench',
                        x: b.x0 + 14 + settleRnd(wx, wy, ++seed) * (b.x1 - b.x0 - 28),
                        z: b.z0 + 14 + settleRnd(wx, wy, ++seed) * (b.z1 - b.z0 - 28),
                        rot: settleRnd(wx, wy, ++seed) * Math.PI
                    });
                }
            } else if (b.kind === 'parking') {
                plan.props.push({ kind: 'tarmac', x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2,
                                  w: b.x1 - b.x0, d: b.z1 - b.z0, rot: 0 });
                for (let zz = b.z0 + 12; zz < b.z1 - 8; zz += 20) {
                    for (let xx = b.x0 + 8; xx < b.x1 - 8; xx += 26) {
                        if (settleRnd(wx, wy, ++seed) < 0.35) continue;
                        plan.props.push({ kind: 'car', x: xx, z: zz, rot: Math.PI / 2,
                                          tint: Math.floor(settleRnd(wx, wy, ++seed) * 6) });
                    }
                }
            }
        }

        // Kerbside parking on the main cross only, so the middle of town reads
        // as the busy street it is. Nothing is left standing in a JUNCTION: the
        // run used to be laid down the whole length of the tile regardless, so
        // wherever it crossed another street there was a car parked in the
        // middle of the crossroads, blocking it to anybody on foot.
        const mid = plan.lines[Math.floor(plan.lines.length / 2)];
        const CAR_HALF = 9;
        const inJunction = (along) => plan.lines.some(
            c => Math.abs(along - c) < plan.half + CAR_HALF);
        for (let t = -ts / 2 + 40; t < ts / 2 - 40; t += 24) {
            if (inJunction(t)) continue;
            if (settleRnd(wx, wy, ++seed) < 0.45) continue;
            const tint = Math.floor(settleRnd(wx, wy, ++seed) * 6);
            plan.props.push({ kind: 'car', x: t, z: mid - S.streetW / 2 + 6, rot: Math.PI / 2, tint });
            if (settleRnd(wx, wy, ++seed) < 0.5) {
                plan.props.push({ kind: 'car', x: mid + S.streetW / 2 - 6, z: t, rot: 0,
                                  tint: (tint + 3) % 6 });
            }
        }
    }

    // A town's geometry, gathered by shape and material and handed over as one
    // InstancedMesh each. Everything a settlement is made of is a scaled unit
    // box, pyramid, cylinder or sphere, so a whole town lands in a dozen draw
    // calls instead of a thousand.
    class SettlementBatch {
        constructor(decorator) {
            this._d = decorator;
            this._buckets = new Map();
        }

        add(geoKey, mat, x, y, z, sx, sy, sz, rotY) {
            if (!mat) return;
            // Keyed on a short integer per material rather than on its UUID: a
            // town puts several thousand pieces through here and every one of
            // them was building a forty-character string to look its bucket up
            // with. Blocks carry that number already (VoxelWorld.Blocks);
            // anything else is given one the first time it is seen.
            if (mat.__vwId === undefined) mat.__vwId = ++SettlementBatch._matId;
            const key = geoKey + '#' + mat.__vwId;
            let b = this._buckets.get(key);
            if (!b) { b = { geo: this._d.geos[geoKey], mat, items: [] }; this._buckets.set(key, b); }
            b.items.push({ x, y, z, sx, sy, sz, r: rotY || 0 });
        }

        flush(grp) {
            const m = new THREE.Matrix4();
            const q = new THREE.Quaternion();
            const up = new THREE.Vector3(0, 1, 0);
            const p = new THREE.Vector3();
            const s = new THREE.Vector3();
            for (const b of this._buckets.values()) {
                if (!b.items.length || !b.geo) continue;
                const im = new THREE.InstancedMesh(b.geo, b.mat, b.items.length);
                im.castShadow = false;
                im.receiveShadow = true;
                // Nothing in a town ever moves: telling the driver so lets it
                // upload the matrices once and leave them on the card.
                if (im.instanceMatrix && im.instanceMatrix.setUsage &&
                    THREE.StaticDrawUsage !== undefined) {
                    im.instanceMatrix.setUsage(THREE.StaticDrawUsage);
                }
                for (let i = 0; i < b.items.length; i++) {
                    const it = b.items[i];
                    q.setFromAxisAngle(up, it.r);
                    p.set(it.x, it.y, it.z);
                    s.set(it.sx, it.sy, it.sz);
                    m.compose(p, q, s);
                    im.setMatrixAt(i, m);
                }
                // Culled as a whole or not at all. An InstancedMesh has no
                // bound of its own in this build of three, so it is tested
                // against the UNIT CUBE its geometry is, sitting at the middle
                // of the square: a town winks out of existence the moment the
                // camera looks away from that one point, however much of it is
                // still in front of you. The square itself is only streamed in
                // when it is near, so there is nothing to save by culling the
                // handful of meshes inside it.
                im.frustumCulled = false;
                grp.add(im);
            }
            this._buckets.clear();
        }
    }
    // The counter behind the bucket keys above.
    SettlementBatch._matId = 0;


    // Is this world square a town, and which sort of one? The one answer every
    // part of the 3D world asks: the builder, the crowd, the interiors and the
    // ruins that are only ever put on squares nobody lives on.
    // Memoised, the way getRenderType and profileFor next door are. This is
    // asked from _groundUnderfoot - every frame, for the walker and again for
    // every follower behind them - and nine times a frame by the town crowd,
    // and each ask lowercased a fresh string and ran eight substring scans over
    // it for an answer that belongs to the world square and never changes.
    const _kindCache = new Map();
    const KIND_CACHE_MAX = 2048;
    function settlementKindAt(wx, wy) {
        const key = wx * 65536 + wy;
        const hit = _kindCache.get(key);
        if (hit !== undefined) return hit;
        const kind = _settlementKindOf(wx, wy);
        // Plain eviction rather than a flush: the working set is the ring the
        // party is standing in, so the oldest key is the one furthest behind
        // them.
        if (_kindCache.size >= KIND_CACHE_MAX) {
            _kindCache.delete(_kindCache.keys().next().value);
        }
        _kindCache.set(key, kind);
        return kind;
    }
    function _settlementKindOf(wx, wy) {
        const n = sampleBiomeAt(wx, wy).name.toLowerCase();
        if (n.includes('city') || n.includes('metro') || n.includes('omegatower') ||
            n.includes('spacecenter')) return 'city';
        if (n.includes('village') || n.includes('villa') || n.includes('burg') ||
            n.includes('town') || n.includes('houses')) return 'town';
        return null;
    }

    // =========================================================================
    // Steadings
    //
    // Open country is not empty country. A world where every building stands in
    // a town reads as a board game, so squares of ordinary farmland, meadow and
    // wood carry a farm or a lone house of their own: a real one, lived in,
    // with the same walls, the same doors and the same furnished rooms inside
    // it that a house on a town street gets.
    //
    // How likely one is depends on what the country is good for. Farmland is
    // full of farms; a forest has the odd cabin in it; nothing at all stands on
    // a glacier, a salt flat or the side of a mountain.
    // =========================================================================
    const STEADING_ODDS = {
        field:    { farm: 0.13, cottage: 0.07 },
        meadow:   { farm: 0.11, cottage: 0.07 },
        plain:    { farm: 0.09, cottage: 0.06 },
        steppe:   { farm: 0.06, cottage: 0.04 },
        savannah: { farm: 0.05, cottage: 0.04 },
        forest:   { farm: 0.02, cottage: 0.06 },
        taiga:    { farm: 0.01, cottage: 0.05 },
        jungle:   { farm: 0.01, cottage: 0.03 },
        hills:    { farm: 0.04, cottage: 0.04 },
        desert:   { farm: 0.00, cottage: 0.02 },
        tundra:   { farm: 0.00, cottage: 0.02 },
    };

    // How big an open-ocean island has to be before anybody would live on one,
    // and how many of those actually have somebody on them. A sandbar gets
    // nothing; the two largest sizes are worth a cottage.
    const ISLE_HOUSE_MIN_SIZE = 3;
    const ISLE_HOUSE_CHANCE   = 0.45;

    // The island a square carries, if it is one of the rare open-ocean ones and
    // it is big enough to build on. Null everywhere else, which is all the land
    // in the world and nearly all of the sea.
    function islandHouseAt(wx, wy) {
        const isl = VW.oceanIslandOf ? VW.oceanIslandOf(wx, wy) : null;
        if (!isl || isl.size < ISLE_HOUSE_MIN_SIZE) return null;
        if (settleRnd(wx, wy, 9411) >= ISLE_HOUSE_CHANCE) return null;
        return isl;
    }

    function steadingKindAt(wx, wy) {
        // Somebody's house out on a rock in the ocean. It is a cottage like any
        // other, so everything downstream - the walls, the door, the furnished
        // rooms - works on it without knowing where it stands.
        if (islandHouseAt(wx, wy)) return 'cottage';
        const odds = STEADING_ODDS[profileFor(sampleBiomeAt(wx, wy).name).key];
        if (!odds) return null;
        const r = settleRnd(wx, wy, 9101);
        if (r < odds.farm) return 'farm';
        if (r < odds.farm + odds.cottage) return 'cottage';
        return null;
    }

    // A farm or a lone house, planned in the same shape a town is so that
    // everything downstream - the builder, the walls you walk into, the
    // interior that loads as you come near - works on it unchanged.
    function planSteading(wx, wy, ts) {
        const kind = steadingKindAt(wx, wy);
        if (!kind) return null;
        const S = SETTLE;
        let seed = 9200;
        const rnd = () => settleRnd(wx, wy, ++seed);
        const plan = {
            nb: 0, pitch: 0, lines: [], half: 0, blocks: [], lots: [], props: [],
            lanes: [], roads: [], station: null, big: false, village: false,
            abandoned: false, steading: true, kind, paveH: 0, roadMat: 'dirt',
            markings: false
        };

        // The yard, set down clear of the square's edges so it never straddles
        // two, and turned a quarter round half the time. On an island it stands
        // in the MIDDLE of the island instead, which is the only dry ground
        // there is: the square is open sea everywhere else.
        const isle = islandHouseAt(wx, wy);
        const cx = isle ? isle.cx - (wx + 0.5) * ts : (rnd() - 0.5) * ts * 0.40;
        const cz = isle ? isle.cz - (wy + 0.5) * ts : (rnd() - 0.5) * ts * 0.40;
        const turn = rnd() < 0.5 ? 0 : 1;    // 0: the yard runs east-west
        const put = (ox, oz, w, d, o) => {
            const lot = Object.assign({
                x: cx + (turn ? oz : ox), z: cz + (turn ? ox : oz),
                w: turn ? d : w, d: turn ? w : d, rot: 0,
                storeys: 1, h: S.storeyH, side: Math.floor(rnd() * 4),
                gable: true, shop: false, kind: 'house', ruined: false
            }, o || {});
            lot.h = lot.storeys * S.storeyH;
            // A farmyard is boards and cobble; the house on it is rendered.
            if (!lot.blocks) {
                lot.blocks = BUILD_SCHEMES[lot.subkind] ||
                    schemeFor(wx, wy, plan.lots.length, 'village', 0, lot.storeys);
            }
            plan.lots.push(lot);
            return lot;
        };

        let yardW, yardD;
        if (kind === 'farm') {
            // The house faces the yard; the barn stands across it.
            put(-46, 0, 46, 34, { storeys: 2, subkind: 'farmhouse', side: turn ? 0 : 3 });
            put(48, 6, 62, 40, { storeys: 2, gable: true, subkind: 'barn', side: turn ? 1 : 2 });
            if (rnd() < 0.45) put(18, -46, 24, 24, { storeys: 3, gable: false, subkind: 'granary', side: 0 });
            yardW = 210; yardD = 150;

            for (let i = 0; i < 2; i++) {
                plan.props.push({ kind: 'haystack', x: cx + (rnd() - 0.5) * 80,
                                  z: cz + (turn ? -1 : 1) * (46 + rnd() * 22), rot: 0 });
            }
            plan.props.push({ kind: 'well', x: cx + (rnd() - 0.5) * 40, z: cz + (rnd() - 0.5) * 40, rot: 0 });
            // The fields it works, laid out beyond the yard.
            const FW = 120;
            for (let i = 0; i < 2; i++) {
                const fx = cx + (i === 0 ? -1 : 1) * (yardW / 2 + FW * 0.62);
                const fz = cz + (rnd() - 0.5) * 60;
                if (Math.abs(fx) + FW / 2 > ts / 2 - 8) continue;
                plan.props.push({ kind: 'field', x: turn ? fz : fx, z: turn ? fx : fz,
                                  w: FW, d: FW * 0.8, rot: 0, crop: Math.floor(rnd() * 3) });
            }
        } else {
            // A cottage: the house, a shed, a garden and a few trees.
            put(0, 0, 34, 28, { storeys: rnd() < 0.35 ? 2 : 1, subkind: 'house' });
            plan.props.push({ kind: 'shed', x: cx + (turn ? 0 : 30), z: cz + (turn ? 30 : 0),
                              rot: turn ? Math.PI / 2 : 0 });
            plan.props.push({ kind: 'garden', x: cx - (turn ? 0 : 34), z: cz - (turn ? 34 : 0),
                              w: 40, d: 34, rot: 0 });
            if (rnd() < 0.5) plan.props.push({ kind: 'well', x: cx + 22, z: cz + 20, rot: 0 });
            yardW = 118; yardD = 104;
        }

        const trees = 2 + Math.floor(rnd() * 4);
        for (let i = 0; i < trees; i++) {
            const a = rnd() * Math.PI * 2;
            const r = Math.max(yardW, yardD) * (0.55 + rnd() * 0.35);
            plan.props.push({ kind: 'tree', x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, rot: 0 });
        }

        // The yard fence, whole: somebody lives here.
        for (const f of _fenceRing(cx, cz, turn ? yardD : yardW, turn ? yardW : yardD)) {
            plan.props.push(f);
        }
        plan.props.push({ kind: 'lamp', x: cx, z: cz + (turn ? yardW : yardD) / 2 - 8, rot: 0 });

        return buildSolids(plan);
    }

    // How often open country holds an abandoned structure.
    const ABANDONED_CHANCE = 0.05;

    // Whatever is built on a world square - a town, a ruin, or nothing - planned
    // once and kept, since everything about it is derived from the square alone.
    const _tilePlanCache = new Map();
    // Comfortably more than the ring the decorator dresses, so a square is
    // still there when the party walks back onto it.
    const TILE_PLAN_CACHE_MAX = 256;
    function planForTile(tx, tz) {
        // Nothing anybody built stands on another world. Towns and steadings
        // would not get planned there anyway (no alien biome reads as a city or
        // a meadow), but a RUIN is rolled on any square at all - so without this
        // a comet would be scattered with abandoned Earth barns.
        if (getAlienTerrain && getAlienTerrain()) return null;
        const key = tx * 65536 + tz;
        let plan = _tilePlanCache.get(key);
        if (plan !== undefined) {
            // Touched: a Map keeps insertion order, so re-inserting a hit is
            // what makes the eviction below pick the least recently WANTED
            // square rather than the least recently planned one.
            _tilePlanCache.delete(key);
            _tilePlanCache.set(key, plan);
            return plan;
        }
        const kind = settlementKindAt(tx, tz);
        plan = kind ? planSettlement(tx, tz, kind === 'city', WORLD_TILE_SIZE)
                    : (planSteading(tx, tz, WORLD_TILE_SIZE) ||
                       planAbandoned(tx, tz, WORLD_TILE_SIZE));
        // One square at a time, not the whole cache at once. The decorator
        // dresses a radius-5 ring - a hundred and twenty one squares - and the
        // interiors walk nine more every frame, so a working set of 32 was
        // overrun constantly and the flush threw away squares still in use,
        // sending planTown and planVillage (nearly two hundred lines apiece)
        // round again from scratch.
        if (_tilePlanCache.size >= TILE_PLAN_CACHE_MAX) {
            _tilePlanCache.delete(_tilePlanCache.keys().next().value);
        }
        _tilePlanCache.set(key, plan);
        return plan;
    }

    const HOUSE_BASE_LIFT = 1.0;

    // The height whatever is built on a square stands at: a town is a level pad
    // with its pavement on top, a lone structure sits on its own patch of ground.
    function planBaseY(plan, tx, tz, heightAt) {
        if (!plan) return heightAt(tx + 0.5, tz + 0.5) + HOUSE_BASE_LIFT;
        if ((plan.abandoned || plan.steading) && plan.lots.length) {
            const lot = plan.lots[0];
            return heightAt(tx + 0.5 + lot.x / WORLD_TILE_SIZE, tz + 0.5 + lot.z / WORLD_TILE_SIZE) + HOUSE_BASE_LIFT;
        }
        return heightAt(tx + 0.5, tz + 0.5) + (plan.paveH || 0) + HOUSE_BASE_LIFT;
    }

    // =========================================================================
    // Interiors
    // =========================================================================
    // Every building in the 3D world is a shell, not a block: four walls, a
    // doorway on the street side and a roof. What is inside it is built only
    // when somebody is close enough to walk in - floors, the walls between the
    // rooms, the stairs up and whatever furniture was left in it - and taken
    // down again when they walk away.
    //
    // The plan below is pure data: where the slabs are, where the walls are,
    // where the stairs run. The renderer builds it and the walker reads it, so
    // the floor you are standing on and the floor you can see are the same one.

    const WALL_T          = 2.2;   // wall thickness (55 cm)
    const DOOR_W          = 10;    // doorway (2.5 m)
    const DOOR_H          = 12;    // and its height (3 m)
    const STEP_UP         = 6;     // how high a walker can step (1.5 m: stairs, kerbs)
    const STAIR_REACH     = 3.6;   // how far from a flight your feet may be to be on it
    const INTERIOR_MAX_FLOORS = 6; // a tower is walkable for six storeys, not sixty
    const INTERIOR_NEAR   = 240;   // build an interior once the party is this close
    const INTERIOR_FAR    = 340;   // and take it down again out here

    // Which way a lot's door faces: north, south, west, east.
    const SIDE_NORMALS = [[0, -1], [0, 1], [-1, 0], [1, 0]];

    // -------------------------------------------------------------------------
    // Rooms
    //
    // A floor is not one hall with a partition across it. It is cut up the way
    // a floor really is: split down the long way, then each half split again,
    // until the pieces are the size of rooms, with a doorway through every wall
    // the splitting put in. Because the cuts form a tree and every cut carries
    // one door, every room on the floor can be walked to from the landing.
    // -------------------------------------------------------------------------
    const ROOM_MIN   = 30;   // a room narrower than this is a cupboard
    const ROOM_DEPTH = 3;    // up to eight rooms on a floor

    // What each kind of building has in it, ground floor first. The first entry
    // of the ground list is what the front door opens into.
    const ROOM_PLANS = {
        house:      { ground: ['hall', 'kitchen', 'parlour', 'store'],
                      upper:  ['bedroom', 'bedroom', 'study', 'bath'] },
        shop:       { ground: ['shopfloor', 'shopfloor', 'store'],
                      upper:  ['bedroom', 'parlour', 'store'] },
        tower:      { ground: ['lobby', 'office'],
                      upper:  ['office', 'office', 'store'] },
        church:     { ground: ['chapel'], upper: ['chapel'] },
        chapel:     { ground: ['chapel'], upper: ['chapel'] },
        farmhouse:  { ground: ['kitchen', 'parlour', 'store'],
                      upper:  ['bedroom', 'bedroom', 'store'] },
        barn:       { ground: ['barn', 'barn', 'store'], upper: ['loft'] },
        granary:    { ground: ['store'], upper: ['store'] },
        factory:    { ground: ['workshop', 'workshop', 'store'],
                      upper:  ['office', 'store'] },
        motel:      { ground: ['lobby', 'bedroom', 'bedroom'],
                      upper:  ['bedroom', 'bedroom', 'bedroom'] },
        watchtower: { ground: ['store'], upper: ['store', 'office'] },
        bunker:     { ground: ['store', 'office'], upper: ['store'] },
        shed:       { ground: ['store'], upper: ['store'] },
    };

    // And what stands in each kind of room. `wall` pieces go against a wall
    // facing in, `middle` pieces stand in the floor, `round` pieces are set out
    // around whatever middle piece the room already has.
    const ROOM_KIT = {
        hall:      { wall: [['shelf', 1], ['bench', 1]], middle: [['rug', 1]] },
        parlour:   { wall: [['shelf', 1], ['bench', 1]], middle: [['table', 1], ['rug', 1]],
                     round: [['chair', 2]] },
        kitchen:   { wall: [['stove', 1], ['counter', 1], ['shelf', 1], ['barrel', 1]],
                     middle: [['table', 1]], round: [['chair', 2]] },
        bedroom:   { wall: [['bed', 1], ['wardrobe', 1], ['chair', 1]], middle: [['rug', 1]] },
        study:     { wall: [['desk', 1], ['shelf', 2]], round: [['chair', 1]] },
        bath:      { wall: [['sink', 1], ['barrel', 1]] },
        store:     { wall: [['crate', 3], ['barrel', 2], ['shelf', 1]] },
        shopfloor: { wall: [['counter', 1], ['shelf', 3]], middle: [['crate', 1]] },
        lobby:     { wall: [['counter', 1], ['bench', 2], ['shelf', 1]] },
        office:    { wall: [['desk', 2], ['shelf', 2]], round: [['chair', 2]] },
        workshop:  { wall: [['machine', 2], ['bench', 1], ['crate', 2]], middle: [['barrel', 1]] },
        barn:      { wall: [['hay', 3], ['crate', 2]], middle: [['barrel', 1]] },
        loft:      { wall: [['hay', 2], ['crate', 1]] },
        chapel:    { wall: [['altar', 1]], middle: [['pew', 4]] },
        landing:   { },
    };

    // Roughly how wide and deep a piece is, so it can be stood clear of a wall
    // and clear of the next piece along.
    const FURN_SIZE = {
        table: 15, bed: 20, shelf: 12, crate: 8, chair: 6, counter: 17,
        stove: 12, desk: 16, wardrobe: 13, barrel: 8, bench: 16, sink: 11,
        hay: 14, machine: 18, rug: 22, pew: 26, altar: 18,
    };

    function _roomPlanFor(lot) {
        if (lot.shop) return ROOM_PLANS.shop;
        return ROOM_PLANS[lot.subkind] || ROOM_PLANS[lot.kind] || ROOM_PLANS.house;
    }

    // Cut a rectangle into rooms. Returns the leaves; the walls that made them
    // are pushed onto `walls`, each already carrying its doorway.
    function _splitRooms(rect, rnd, depth, rooms, walls) {
        const canX = rect.w >= ROOM_MIN * 2 + WALL_T;
        const canZ = rect.d >= ROOM_MIN * 2 + WALL_T;
        if (depth <= 0 || (!canX && !canZ)) { rooms.push(rect); return; }
        const alongX = canX && (!canZ || rect.w >= rect.d);
        const size   = alongX ? rect.w : rect.d;
        const span   = alongX ? rect.d : rect.w;
        const centre = alongX ? rect.x : rect.z;
        const cut    = centre - size / 2 + size * (0.38 + rnd() * 0.24);
        const aSize  = cut - WALL_T / 2 - (centre - size / 2);
        const bSize  = (centre + size / 2) - (cut + WALL_T / 2);

        // The doorway through the new wall, kept away from both ends.
        const gap   = Math.min(DOOR_W, span * 0.4);
        const gapAt = (alongX ? rect.z : rect.x) + (rnd() - 0.5) * (span - gap - 6);
        walls.push({ alongX, at: cut, span, spanAt: alongX ? rect.z : rect.x, gap, gapAt });

        const a = alongX
            ? { x: centre - size / 2 + aSize / 2, z: rect.z, w: aSize, d: rect.d }
            : { x: rect.x, z: centre - size / 2 + aSize / 2, w: rect.w, d: aSize };
        const b = alongX
            ? { x: centre + size / 2 - bSize / 2, z: rect.z, w: bSize, d: rect.d }
            : { x: rect.x, z: centre + size / 2 - bSize / 2, w: rect.w, d: bSize };
        _splitRooms(a, rnd, depth - 1, rooms, walls);
        _splitRooms(b, rnd, depth - 1, rooms, walls);
    }

    // Stand one piece against a wall of the room, facing in. Returns null when
    // there is nowhere left that is not the stairwell or another piece.
    function _againstWall(room, size, rnd, taken, shaft) {
        for (let attempt = 0; attempt < 8; attempt++) {
            const side = Math.floor(rnd() * 4);
            const m = size / 2 + 3;
            let x, z, rot;
            if (side === 0)      { z = room.z - room.d / 2 + m; x = room.x + (rnd() - 0.5) * Math.max(0, room.w - size - 6); rot = 0; }
            else if (side === 1) { z = room.z + room.d / 2 - m; x = room.x + (rnd() - 0.5) * Math.max(0, room.w - size - 6); rot = Math.PI; }
            else if (side === 2) { x = room.x - room.w / 2 + m; z = room.z + (rnd() - 0.5) * Math.max(0, room.d - size - 6); rot = Math.PI / 2; }
            else                 { x = room.x + room.w / 2 - m; z = room.z + (rnd() - 0.5) * Math.max(0, room.d - size - 6); rot = -Math.PI / 2; }
            if (shaft && Math.abs(x - shaft.x) < shaft.w / 2 + size / 2 &&
                         Math.abs(z - shaft.z) < shaft.d / 2 + size / 2) continue;
            let clear = true;
            for (const t of taken) {
                if (Math.abs(t.x - x) < (t.s + size) / 2 && Math.abs(t.z - z) < (t.s + size) / 2) { clear = false; break; }
            }
            if (!clear) continue;
            taken.push({ x, z, s: size });
            return { x, z, rot };
        }
        return null;
    }

    // Which kind of shop stands on a lot. The list is RandomDailyShop's own,
    // narrowed to the ones found in a settlement of this size
    // (js/db/WorldGen/shopFurniture.json), and the square picks from it, so the
    // baker on the corner is the baker on that corner every time anybody comes
    // back to the place.
    //
    // Null where the map is not loaded, and a shop is then just a shop with an
    // awning: the room still furnishes, from the biome's own list.
    function _shopTypeFor(wx, wy, idx, big) {
        const SF = (typeof window !== 'undefined') &&
            window.VoxelWorld && window.VoxelWorld.ShopFurniture;
        if (!SF) return null;
        const types = SF.typesFor(big ? 'city' : 'village');
        if (!types.length) return null;
        return types[Math.floor(settleRnd(wx, wy, 7300 + idx * 17) * types.length) % types.length];
    }

    // Which furniture sprite a room of this kind would have in this part of the
    // world. The answer is the biome's own interior list
    // (js/db/WorldGen/biomeFurniture.json, built from the folders under
    // img/furniture), narrowed to the folders that suit the room: a kitchen
    // draws from Kitchen, Food, Baskets and Barrels, a bedroom from Beds,
    // Sheets, Peluches and Paintings.
    //
    // BiomeFurniture lives in VoxelWorldDecor, which loads after this file, so
    // it is reached through the namespace at call time rather than destructured
    // at load. Null where the map is not there, and the old built-from-boxes
    // furniture stands in for it.
    function _spritePickerFor(wx, wy, rnd, shopType) {
        // Read off the namespace itself rather than the destructured local: this
        // file loads before VoxelWorldDecor, which is what puts BiomeFurniture
        // there, so there is nothing to destructure at load time.
        const BF = (typeof window !== 'undefined') &&
            window.VoxelWorld && window.VoxelWorld.BiomeFurniture;
        if (!BF) return null;
        const list = BF.interior(sampleBiomeAt(wx, wy).name);
        if (!list.length) return null;
        const byRole = new Map();
        for (const e of list) {
            for (const r of (e.rooms || ['*'])) {
                let arr = byRole.get(r);
                if (!arr) { arr = []; byRole.set(r, arr); }
                arr.push(e);
            }
        }
        // A shop floor is dressed by the SHOP, not by the countryside around it:
        // a bakery is loaves and ovens whether it stands in a village or on a
        // city street.
        const SF = (typeof window !== 'undefined') &&
            window.VoxelWorld && window.VoxelWorld.ShopFurniture;
        const shopPool = (shopType && SF) ? SF.furniture(shopType) : null;

        return (role) => {
            const pool = (role === 'shopfloor' && shopPool && shopPool.length)
                ? shopPool
                : (byRole.get(role) || []).concat(byRole.get('*') || []);
            if (!pool.length) return null;
            let total = 0;
            for (const e of pool) total += e.density;
            if (total <= 0) return null;
            let r = rnd() * total;
            for (const e of pool) {
                r -= e.density;
                if (r > 0) continue;
                const nm = e.sprites[Math.floor(rnd() * e.sprites.length) % e.sprites.length];
                return { folder: e.folder, name: nm, size: e.size };
            }
            return null;
        };
    }

    // Everything that stands in one room.
    function _furnishRoom(out, room, role, y, rnd, shaft, ruined, pickSprite) {
        const kit = ROOM_KIT[role];
        if (!kit) return;
        const area = room.w * room.d;
        if (area < 500) return;                       // a cupboard holds nothing
        const budget = Math.max(2, Math.min(9, Math.round(area / 380)));
        const taken = [];
        let placed = 0;
        const put = (kind, x, z, rot) => {
            out.push({
                kind, x, z, y, rot, room: role,
                // What is left in a ruin has been over on its side for years.
                fallen: !!ruined && rnd() < 0.45,
                // The picture of the thing, where this part of the world has one
                // for a room of this kind. Without it the piece is still built
                // out of boxes, as it always was.
                sprite: pickSprite ? pickSprite(role) : null
            });
            placed++;
        };

        let middleAt = null;
        for (const [kind, n] of (kit.middle || [])) {
            for (let i = 0; i < n && placed < budget; i++) {
                const size = FURN_SIZE[kind] || 10;
                if (room.w < size + 10 || room.d < size + 10) continue;
                const x = room.x + (rnd() - 0.5) * (room.w - size - 8) * 0.5;
                const z = room.z + (rnd() - 0.5) * (room.d - size - 8) * 0.5 +
                          (kind === 'pew' ? (i - (n - 1) / 2) * 14 : 0);
                if (shaft && Math.abs(x - shaft.x) < shaft.w / 2 + size / 2 &&
                             Math.abs(z - shaft.z) < shaft.d / 2 + size / 2) continue;
                taken.push({ x, z, s: size });
                if (!middleAt && kind !== 'rug') middleAt = { x, z };
                put(kind, x, z, kind === 'pew' ? 0 : Math.floor(rnd() * 4) * (Math.PI / 2));
            }
        }
        for (const [kind, n] of (kit.wall || [])) {
            for (let i = 0; i < n && placed < budget; i++) {
                const spot = _againstWall(room, FURN_SIZE[kind] || 10, rnd, taken, shaft);
                if (spot) put(kind, spot.x, spot.z, spot.rot);
            }
        }
        // Chairs and the like, set out around whatever is in the middle.
        for (const [kind, n] of (kit.round || [])) {
            const c = middleAt || { x: room.x, z: room.z };
            for (let i = 0; i < n && placed < budget; i++) {
                const a = (i / n) * Math.PI * 2 + rnd();
                const x = c.x + Math.cos(a) * 12, z = c.z + Math.sin(a) * 12;
                if (Math.abs(x - room.x) > room.w / 2 - 6 || Math.abs(z - room.z) > room.d / 2 - 6) continue;
                put(kind, x, z, a + Math.PI);
            }
        }
    }

    // The inside of one building, in coordinates local to the lot's centre.
    function planInterior(lot, wx, wy, idx) {
        const S = SETTLE;
        const floors = Math.max(1, Math.min(INTERIOR_MAX_FLOORS, lot.storeys || 1));
        const H = S.storeyH;
        const iw = Math.max(10, lot.w - WALL_T * 2);      // inner footprint
        const id = Math.max(10, lot.d - WALL_T * 2);
        let seed = 4000 + idx * 97;
        const rnd = () => settleRnd(wx, wy, ++seed);
        // One picker for the whole building: which biome it stands in does not
        // change from room to room.
        const pickSprite = _spritePickerFor(wx, wy, rnd, lot.shopType);

        // The stairwell: a shaft in the corner furthest from the door, with the
        // flight switching back on itself at every floor so it stays in the shaft.
        const face = SIDE_NORMALS[lot.side || 0];
        const shaftW = Math.min(15, iw * 0.42);
        const shaftD = Math.min(22, id * 0.52);
        const shaft = {
            w: shaftW, d: shaftD,
            x: (face[0] !== 0 ? -face[0] : (rnd() < 0.5 ? -1 : 1)) * (iw / 2 - shaftW / 2 - 0.5),
            z: (face[1] !== 0 ? -face[1] : (rnd() < 0.5 ? -1 : 1)) * (id / 2 - shaftD / 2 - 0.5)
        };
        const hasStairs = floors > 1 && iw > 26 && id > 26;

        const plan = {
            floors, H, iw, id, shaft: hasStairs ? shaft : null,
            roofY: floors * H,          // the underside of the roof, for headroom
            slabs: [], walls: [], stairs: [], furniture: [], rooms: [],
            // Whoever is minding the shop, one per shop floor (see below).
            keepers: []
        };

        // The lining: the rooms are plastered inside, so a wall never shows the
        // street's own brickwork from the parlour.
        //
        // Where the lining GOES is the house builder's answer, not this one's
        // (VoxelWorldHouse.linerRuns). It used to be worked out here, flat
        // against the inside face of the shell - and a face of plaster sitting
        // exactly on a face of brick is two surfaces at one depth, which is why
        // the walls of every room in the world flickered. The builder straddles
        // it into the shell instead, and it is the builder's business because it
        // is the builder that knows where the shell is.
        const lineH = floors * H;
        for (const w of VW.House.linerRuns(lot, iw, id, lineH)) plan.walls.push(w);

        // Where the front door is, so the room it opens into can be the hall.
        const entry = {
            x: (lot.side < 2) ? 0 : (lot.side === 2 ? -iw / 2 : iw / 2),
            z: (lot.side < 2) ? (lot.side === 0 ? -id / 2 : id / 2) : 0
        };
        const rooms = _roomPlanFor(lot);

        for (let f = 0; f < floors; f++) {
            const y = f * H;
            // A shop floor gets one keeper, not one per room of it.
            let floorHasKeeper = !(lot.shopFloors ? lot.shopFloors.includes(f) : f === 0);

            // The floor itself, cut around the stairwell so the flight has
            // somewhere to come up through. The ground floor is never cut.
            if (f === 0) {
                plan.slabs.push({ x: 0, z: 0, w: iw, d: id, y, hole: false });
            } else if (plan.shaft) {
                for (const piece of _slabAround(iw, id, plan.shaft)) {
                    piece.y = y;
                    plan.slabs.push(piece);
                }
            } else {
                plan.slabs.push({ x: 0, z: 0, w: iw, d: id, y, hole: false });
            }

            // Cut the floor into rooms and put the walls between them up, each
            // with its doorway left open.
            const leaves = [], cuts = [];
            _splitRooms({ x: 0, z: 0, w: iw, d: id }, rnd, ROOM_DEPTH, leaves, cuts);
            for (const c of cuts) {
                const a0 = c.spanAt - c.span / 2, a1 = c.spanAt + c.span / 2;
                const g0 = c.gapAt - c.gap / 2, g1 = c.gapAt + c.gap / 2;
                for (const [a, b] of [[a0, g0], [g1, a1]]) {
                    if (b - a < 1) continue;
                    const mid = (a + b) / 2, len = b - a;
                    const wall = c.alongX
                        ? { x: c.at, z: mid, w: WALL_T, d: len, y, h: H - 0.8 }
                        : { x: mid, z: c.at, w: len, d: WALL_T, y, h: H - 0.8 };
                    if (!plan.shaft || !_overlapsShaft(wall, plan.shaft)) plan.walls.push(wall);
                }
            }

            // A CEILING over the top floor. Without it the roof outside is a
            // shell of outward-facing triangles and a walker on the top floor
            // looks straight up through it at the sky, which is why every house
            // in the world read as roofless from the inside. The attic above it
            // is nobody's business: the roof is on the outside of it.
            if (f === floors - 1) {
                plan.slabs.push({ x: 0, z: 0, w: iw, d: id, y: y + H, hole: false, ceiling: true });
            }

            // Give every room a job. The one the front door opens into gets the
            // first job on the list; the rest are dealt out in order and the
            // list is run round again if the floor has more rooms than jobs.
            const jobs = (f === 0 ? rooms.ground : rooms.upper) || ['store'];
            let entryRoom = 0;
            if (f === 0) {
                let bestD = Infinity;
                leaves.forEach((r, i) => {
                    const d = Math.hypot(r.x - entry.x, r.z - entry.z);
                    if (d < bestD) { bestD = d; entryRoom = i; }
                });
            }
            // The room behind the front door takes the first job; the others
            // are dealt the rest in turn, so a house does not end up with two
            // halls and no kitchen.
            let dealt = 0;
            leaves.forEach((r, i) => {
                const landing = plan.shaft &&
                    Math.abs(r.x - plan.shaft.x) < plan.shaft.w / 2 &&
                    Math.abs(r.z - plan.shaft.z) < plan.shaft.d / 2;
                const rest = Math.max(1, jobs.length - 1);
                const role = landing ? 'landing'
                    : (f === 0 && i === entryRoom) ? jobs[0]
                    : f === 0 ? jobs[jobs.length > 1 ? 1 + (dealt++ % rest) : 0]
                    : jobs[i % jobs.length];
                plan.rooms.push({ x: r.x, z: r.z, w: r.w, d: r.d, y, role });
                _furnishRoom(plan.furniture, r, role, y, rnd, plan.shaft, !!lot.ruined, pickSprite);
                // Somebody has to be minding it. One to a shop floor, standing
                // a little back from the middle of the room, which is where a
                // counter would be.
                if (role === 'shopfloor' && lot.shopType && !floorHasKeeper) {
                    floorHasKeeper = true;
                    plan.keepers.push({
                        x: r.x + (rnd() - 0.5) * Math.max(0, r.w - 18) * 0.4,
                        z: r.z + (rnd() - 0.5) * Math.max(0, r.d - 18) * 0.4,
                        y, floor: f, shopType: lot.shopType,
                        seed: 7700 + idx * 31 + f
                    });
                }
            });

            // The flight up to the next floor.
            if (plan.shaft && f < floors - 1) {
                const up = (f % 2 === 0) ? 1 : -1;
                plan.stairs.push({
                    x: plan.shaft.x, z: plan.shaft.z,
                    w: plan.shaft.w * 0.8, d: plan.shaft.d * 0.9,
                    y0: y, y1: y + H, dir: up
                });
            }
        }

        return plan;
    }

    // Where the doorway sits along the door-side wall, as [from, to].
    function _doorSpan(lot) {
        const along = (lot.side < 2) ? lot.w : lot.d;
        const w = Math.min(DOOR_W, along * 0.45);
        const c = 0;
        return [c - w / 2, c + w / 2];
    }

    // A floor slab with a rectangular hole in it, as up to four pieces.
    function _slabAround(iw, id, hole) {
        const x0 = hole.x - hole.w / 2, x1 = hole.x + hole.w / 2;
        const z0 = hole.z - hole.d / 2, z1 = hole.z + hole.d / 2;
        const out = [];
        const push = (ax0, ax1, az0, az1) => {
            if (ax1 - ax0 < 0.5 || az1 - az0 < 0.5) return;
            out.push({ x: (ax0 + ax1) / 2, z: (az0 + az1) / 2, w: ax1 - ax0, d: az1 - az0, hole: false });
        };
        push(-iw / 2, x0, -id / 2, id / 2);      // west of the hole
        push(x1, iw / 2, -id / 2, id / 2);       // east of it
        push(x0, x1, -id / 2, z0);               // north of it
        push(x0, x1, z1, id / 2);                // south of it
        return out;
    }

    function _overlapsShaft(w, shaft) {
        return Math.abs(w.x - shaft.x) < (w.w + shaft.w) / 2 &&
               Math.abs(w.z - shaft.z) < (w.d + shaft.d) / 2;
    }

    // =========================================================================
    // Abandoned structures
    // =========================================================================
    // Out in the country, on squares nobody lives on: a farmhouse with its roof
    // in, a barn, a chapel, a watchtower, a factory with its chimney still up.
    // They are planned exactly like a town is - one lot, its own props, its own
    // solids - so the same builder puts them up and the same machinery lets you
    // walk inside them.

    // What each of them was built out of before it was left. A ruin is not one
    // material: a barn was boards, a factory was dark brick and iron, a chapel
    // was ashlar, and a bunker was poured concrete.
    const RUIN_SCHEMES = {
        farmhouse: 'ruin', barn: 'barn', chapel: 'church', watchtower: 'granary',
        factory: 'works', motel: 'ruin', granary: 'granary', bunker: 'concrete'
    };

    const ABANDONED_KINDS = [
        { key: 'farmhouse',  w: 54, d: 42, floors: 2, roof: 'gable', ruin: 0.30 },
        { key: 'barn',       w: 66, d: 46, floors: 1, roof: 'gable', ruin: 0.45 },
        { key: 'chapel',     w: 38, d: 60, floors: 1, roof: 'gable', ruin: 0.28, spire: true },
        { key: 'watchtower', w: 28, d: 28, floors: 4, roof: 'flat',  ruin: 0.34 },
        { key: 'factory',    w: 88, d: 62, floors: 2, roof: 'flat',  ruin: 0.5, chimney: true },
        { key: 'motel',      w: 98, d: 34, floors: 2, roof: 'flat',  ruin: 0.4 },
        { key: 'granary',    w: 30, d: 30, floors: 3, roof: 'flat',  ruin: 0.22 },
        { key: 'bunker',     w: 46, d: 36, floors: 1, roof: 'flat',  ruin: 0.16 }
    ];

    // Does this world square hold one, and which? Deterministic, so the ruin on
    // the hill is on that hill for good.
    function abandonedKindAt(wx, wy) {
        if (settleRnd(wx, wy, 7777) > ABANDONED_CHANCE) return null;
        return ABANDONED_KINDS[Math.floor(settleRnd(wx, wy, 7778) * ABANDONED_KINDS.length) %
            ABANDONED_KINDS.length];
    }

    // The plan of one: the same shape a settlement plan has, so everything that
    // reads a plan (the builder, the walls you bump into, the interior that
    // loads as you approach) works on it unchanged.
    function planAbandoned(wx, wy, ts) {
        const kind = abandonedKindAt(wx, wy);
        if (!kind) return null;
        let seed = 8000;
        const rnd = () => settleRnd(wx, wy, ++seed);
        const S = SETTLE;
        const plan = {
            nb: 0, pitch: 0, lines: [], half: 0, blocks: [], lots: [], props: [], lanes: [],
            roads: [], station: null, big: false, village: false, abandoned: true,
            kind: kind.key, paveH: 0, roadMat: 'dirt', markings: false
        };

        // Set down off-centre, turned any which way, but always clear of the
        // square's edges so it never straddles two.
        const x = (rnd() - 0.5) * (ts * 0.5);
        const z = (rnd() - 0.5) * (ts * 0.5);
        const swap = rnd() < 0.5;
        const w = swap ? kind.d : kind.w;
        const d = swap ? kind.w : kind.d;
        plan.lots.push({
            x, z, w, d, rot: 0,
            storeys: kind.floors, h: kind.floors * S.storeyH,
            side: Math.floor(rnd() * 4),
            gable: kind.roof === 'gable', shop: false,
            blocks: BUILD_SCHEMES[RUIN_SCHEMES[kind.key]] || BUILD_SCHEMES.ruin,
            kind: 'abandoned', subkind: kind.key,
            ruined: true, ruin: kind.ruin, spire: !!kind.spire, chimney: !!kind.chimney
        });

        // What is left lying around it.
        const rubble = 5 + Math.floor(rnd() * 7);
        for (let i = 0; i < rubble; i++) {
            const a = rnd() * Math.PI * 2;
            const r = Math.max(w, d) * (0.55 + rnd() * 0.5);
            plan.props.push({ kind: 'rubble', x: x + Math.cos(a) * r, z: z + Math.sin(a) * r,
                              rot: rnd() * Math.PI, size: 3 + rnd() * 6 });
        }
        const trees = 2 + Math.floor(rnd() * 4);
        for (let i = 0; i < trees; i++) {
            const a = rnd() * Math.PI * 2;
            const r = Math.max(w, d) * (0.8 + rnd() * 0.9);
            plan.props.push({ kind: 'deadtree', x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, rot: 0 });
        }
        // A fence with most of it missing.
        const fw = w + 46, fd = d + 46;
        for (const f of _fenceRing(x, z, fw, fd)) {
            if (rnd() < 0.45) continue;
            f.broken = true;
            plan.props.push(f);
        }
        if (kind.chimney) {
            plan.props.push({ kind: 'chimney', x: x + w * 0.36, z: z - d * 0.3, rot: 0,
                              h: S.storeyH * (4 + rnd() * 3) });
        }
        return buildSolids(plan);
    }

    // Handed to the rest of the suite.
    Object.assign(VW, {
        ABANDONED_CHANCE, ABANDONED_KINDS, BUILD_SCHEMES, RUIN_SCHEMES, schemeFor,
        DOOR_H, DOOR_W, FURN_SIZE,
        ROOM_KIT, ROOM_PLANS, STEADING_ODDS, planSteading, steadingKindAt,
        INTERIOR_FAR,
        INTERIOR_MAX_FLOORS, INTERIOR_NEAR, SETTLE, SIDE_NORMALS, STAIR_REACH,
        STEP_UP, SettlementBatch, WALL_T, _doorSpan, _fenceRing, _overlapsShaft,
        _planBlockLots, _planProps, _slabAround, _tilePlanCache, abandonedKindAt,
        buildSolids, planAbandoned, planBaseY, planForTile, planInterior,
        planSettlement, planTown, planVillage, settleRnd, settlementKindAt
    });
})();
