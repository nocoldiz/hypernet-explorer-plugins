//=============================================================================
// VoxelWorldTerrain.js
// VoxelWorld: streaming the voxel field into the scene
//
// This is what used to be a ring of height-mesh chunks and is now a ring of
// voxel chunks. One chunk is one world map tile, a hundred columns square. Near
// the camera a tile is meshed as sixteen full-detail patches, so breaking a
// block rebuilds a twenty-five column patch and nothing else; further out the
// same field is meshed with bigger blocks, which keeps the horizon blocky
// instead of swapping in a different kind of ground.
//
// Everything the old renderer offered its callers is still here and still means
// the same thing: getTerrainHeight in tile coordinates, a chunk radius, a build
// budget, a decorator for the 2D billboard vegetation and props, and the sea
// left to WaterPlane. What is new is that the ground can be taken apart.
//=============================================================================

/*:
 * @target MZ
 * @plugindesc VoxelWorld - streams the voxel field into the scene as chunks
 * @author Omni-Lex
 *
 * @help
 * Streams the voxel field into the 3D scene, meshes it, lays the roads and the
 * streetlights, and hands each tile to the billboard decorator.
 *
 * One module of the VoxelWorld suite (VoxelWorldCore.js loads first). It
 * declares no plugin commands of its own; those live in VoxelWorldSystem.js.
 */

(() => {
    'use strict';

    const VW = window.VoxelWorld;
    if (!VW) { console.error('[VoxelWorld] core not loaded before VoxelWorldTerrain.js'); return; }

    const {
        MAT, PLACEABLE, ProceduralDecorator, ROAD_SINK, ROAD_TOTAL_W, SEA_LEVEL,
        ROAD_BARRIER_H, ROAD_BED_DROP, ROAD_COL, ROAD_DASH_OFF, ROAD_DASH_ON, ROAD_GAP, ROAD_KERB_H,
        ROAD_LANE_OFF, ROAD_LINE_W, ROAD_MARK_LIFT, ROAD_SHOULDER_W, ROAD_SKIRT,
        VOX, VoxelField, VoxelMesher, WORLD_TILE_SIZE, getRenderType, profileFor,
        getRoadDirectionAt, loadTex, loadVoxelTex, sampleBiomeAt, voxelMaterial, VoxelWorldState,
        voxelGrassMaterial, voxelWaterMaterial, disposeVoxelMaterial,
        voxelBlockMaterial
    } = VW;

    const WORLD_TILES_ACROSS = 256;

    // =========================================================================
    // Underground
    // =========================================================================
    // A cave is the most expensive place in the world to stand. Above ground a
    // tile is a skin over a heightfield and the greedy mesher collapses a field
    // into a handful of triangles; underground every passage is drawn cube by
    // cube, and the whole ring of tiles is being paid for while none of it can
    // be seen through five voxels of rock.
    //
    // So the ring is drawn in. Down there the world is streamed at a much
    // smaller radius, and only the tiles close enough for their passages to
    // actually be meshed are drawn at all - anything further out is kept in
    // memory but switched off, which is both why the frame rate holds and why
    // clipping a camera into a wall no longer shows somebody else's cave
    // hanging in the dark on the far side of it.
    const CAVE_RADIUS   = 3;   // tiles streamed while underground (surface: 5)
    const CAVE_DRAW_R   = 1;   // ...and how many of them are actually drawn

    // How long a frame may spend meshing patches.
    //
    // A patch measures 2.5 ms of ordinary ground and 4 ms of cave against the
    // real mesher, and the clock is only checked BETWEEN patches - so the worst
    // a frame can cost is this plus one patch. Three milliseconds lands the
    // worst frame at nine on the surface and fourteen underground, against
    // seventy-five and a hundred and thirty when a tile was one indivisible
    // job. Raising it does not empty the queue any sooner (the queue is a
    // burst of forty-eight patches every twenty frames, and it drains inside
    // that either way); it only makes the worst frame worse.
    const DRAIN_MS = 3;

    // =========================================================================
    // VoxelTerrain
    // =========================================================================
    class VoxelTerrain {
        constructor(scene) {
            this._scene   = scene;
            this._chunks  = new Map();          // "wx,wy" -> chunk record
            this._radius  = 5;
            this._buildBudget = 6;
            this._ts      = WORLD_TILE_SIZE;
            this._matCache = new Map();
            this._poleMat = null;
            this._lampMat = null;
            this._lodMode = false;
            this._decorator = new ProceduralDecorator(this._matCache);

            // The world itself.
            this.field = new VoxelField();
            this.field.onEdit = (wx, wy, lx, lz) => this._markDirty(wx, wy, lx, lz);
            this._dirty = new Set();            // "wx,wy,si,sj" patches to re-mesh
            this._pendingBuilds = false;
            // The sea is one endless sheet, so it has to be taken away whenever
            // there is no sea about: otherwise it shows at the bottom of every
            // hole anybody digs in a field.
            this.seaNear = true;
            // Whether the caves are drawn at all. A passage keeps five voxels
            // of rock over its head (VoxelWorldField's cave field), so there is
            // nothing of one to see from up in the daylight and nothing worth
            // meshing: the whole system is built only once somebody is actually
            // down in it, and taken away again when they climb back out.
            this._caves = false;
        }

        // Underground, or back out in the open. Flipping it rebuilds the world
        // around the camera, which is the price of not carrying the caves about
        // above ground - and it is paid once, on the way in and on the way out.
        setCavesVisible(on) {
            const want = !!on;
            if (this._caves === want) return;
            this._caves = want;
            // The streaming radius shrinks the moment the party is inside the
            // rock and opens back out when they climb into the daylight (see
            // CAVE_RADIUS): meshing a passage cube by cube out to five tiles is
            // what a cave used to cost, and none of it could be seen.
            this._radius = want ? CAVE_RADIUS : 5;

            // Every full-detail tile is meshed again, because whether its
            // passages are drawn has just changed - but it is QUEUED, not
            // thrown away. Clearing the chunks outright left the party in an
            // empty world for the best part of three seconds every time they
            // walked into a cave or out of one: the nine-tile full-detail ring
            // is some 880 ms of meshing, and it was being rebuilt from nothing
            // at a few milliseconds a frame with nothing on screen meanwhile.
            // Re-meshing in place keeps the old geometry up until the new
            // geometry replaces it, patch by patch.
            for (const ch of this._chunks.values()) {
                if (ch.step !== 1) continue;
                for (let sj = 0; sj < VOX.SUB; sj++) {
                    for (let si = 0; si < VOX.SUB; si++) {
                        this._dirty.add(ch.wx + ',' + ch.wy + ',' + si + ',' + sj);
                    }
                }
                // ...and what is standing in its passages, which no tile built
                // in the daylight has.
                this._dressCave(ch);
            }
            this._pendingBuilds = true;
            // The ring the streaming loop keeps is a different size now, so the
            // "nothing has moved" early-out must not hold it at the old one.
            this._lastCwx = this._lastCwy = undefined;
        }
        cavesVisible() { return this._caves; }

        // ---------------------------------------------------------------------
        // The height every other system asks for, in tile coordinates, exactly
        // as the flat renderer answered it. It is the voxel surface, smoothed
        // over the four columns around the point so a camper does not chatter
        // down a metre-and-a-quarter staircase, and it drops the instant a
        // trench is dug under it.
        // ---------------------------------------------------------------------
        getTerrainHeight(gx, gz) {
            return this.field.heightAt(gx * this._ts, gz * this._ts);
        }

        // The unsmoothed top of the cube under a world-unit point: what feet
        // stand on and what the dig cursor snaps to.
        getBlockTop(x, z) { return this.field.blockTopAt(x, z); }

        // ---------------------------------------------------------------------
        // Underground
        // ---------------------------------------------------------------------
        // What is under a person's feet AT A GIVEN HEIGHT, rather than the top of
        // the world above them. On the surface the two are the same answer; in a
        // cave they are not, and asking the surface where the floor is would
        // stand a walker on the roof of the passage they are inside.
        supportY(x, z, y) { return this.field.supportY(x, z, y); }

        // ---------------------------------------------------------------------
        // The things standing on the ground
        // ---------------------------------------------------------------------
        // Every scattered sprite of a built tile, in WORLD coordinates: what a
        // walker is stopped by, what a vehicle knocks down, and what the party
        // can take apart. The decorator writes them onto the tile's own group,
        // so they are thrown away with the chunk and never outlive it.
        propsAt(wx, wy) {
            const ch = this._chunks.get(wx + ',' + wy);
            if (!ch || !ch.grp.userData.props) return null;
            return ch;
        }

        // Whatever is standing nearest to a point, within `maxD`, that `want`
        // says yes to. Only the nine tiles round it are looked at: nothing
        // further away could be within reach of anybody.
        nearestProp(x, z, maxD, want) {
            const ts = this._ts;
            const tx = Math.floor(x / ts), tz = Math.floor(z / ts);
            let best = null, bestD = maxD * maxD;
            for (let j = -1; j <= 1; j++) {
                for (let i = -1; i <= 1; i++) {
                    const ch = this.propsAt(tx + i, tz + j);
                    if (!ch) continue;
                    for (const p of ch.grp.userData.props) {
                        if (want && !want(p)) continue;
                        const dx = ch.px + p.x - x, dz = ch.pz + p.z - z;
                        const d2 = dx * dx + dz * dz;
                        if (d2 >= bestD) continue;
                        bestD = d2;
                        best = { rec: p, chunk: ch, x: ch.px + p.x, y: p.y, z: ch.pz + p.z };
                    }
                }
            }
            return best;
        }

        // Take one down. The instance is scaled to nothing rather than removed,
        // so every other instance of that mesh keeps its index, and the world
        // is told so it stays down: a wood driven through does not grow back
        // the moment the chunk is streamed out and in again.
        fellProp(hit) {
            if (!hit || !hit.rec || !hit.chunk) return false;
            const rec = hit.rec;
            if (rec.mesh && rec.mesh.setMatrixAt) {
                const m = this._fellM || (this._fellM = new THREE.Matrix4());
                m.makeScale(0, 0, 0);
                m.setPosition(rec.x, rec.y, rec.z);
                rec.mesh.setMatrixAt(rec.index, m);
                rec.mesh.instanceMatrix.needsUpdate = true;
            }
            const list = hit.chunk.grp.userData.props;
            const at = list.indexOf(rec);
            if (at >= 0) list.splice(at, 1);
            if (rec.key && VoxelWorldState) VoxelWorldState.fell(rec.key);
            return true;
        }

        // The underside of the rock over their head, or null under open sky.
        roofY(x, z, y) { return this.field.roofY(x, z, y); }

        // Is a point inside the rock rather than out in the open? What makes a
        // cave a cave: the light, the fog, the sky and the sea all answer to it.
        isUnderground(x, z, y) {
            return y < this.field.blockTopAt(x, z) - VOX.SIZE * 0.5;
        }

        // ---------------------------------------------------------------------
        // Water
        // ---------------------------------------------------------------------
        // The surface of whatever water stands over a world-unit point, or null
        // where the ground there is dry. The one answer everything that swims
        // reads: the party (VoxelWorldActors), and the creatures that live in it
        // (VoxelWorldEntities).
        //
        // Two kinds of water, kept apart exactly as they are drawn. Standing
        // water - a river at altitude, a mountain lake, the pools in a swamp -
        // is carried by the column itself. The open sea is one endless sheet at
        // SEA_LEVEL, and only where there is sea about: inland the sheet is
        // taken down (WaterPlane.setVisible), so a shaft dug in a field stays
        // dry to the bottom and nothing swims in it.
        waterSurfaceAt(x, z) {
            const field = this.field;
            if (!field) return null;
            let y = null;
            const col = field.sampleColumn(x, z);
            if (col && isFinite(col.water)) y = col.water;
            if (this.seaNear && field.blockTopAt(x, z) < SEA_LEVEL) {
                y = (y == null) ? SEA_LEVEL : Math.max(y, SEA_LEVEL);
            }
            return y;
        }

        // Which water this is: 'inland' for the standing water a column carries
        // (a river channel, a mountain lake, a swamp pool), 'sea' for the open
        // sheet, null where the ground is dry. What lives in it is drawn from
        // one roster or the other (VoxelWorldEntities).
        waterKindAt(x, z) {
            const field = this.field;
            if (!field) return null;
            const col = field.sampleColumn(x, z);
            if (col && isFinite(col.water)) return 'inland';
            if (this.seaNear && field.blockTopAt(x, z) < SEA_LEVEL) return 'sea';
            return null;
        }

        // How deep that water stands over the ground, in world units. 0 where
        // there is none.
        waterDepthAt(x, z) {
            const top = this.waterSurfaceAt(x, z);
            if (top == null) return 0;
            return Math.max(0, top - this.field.blockTopAt(x, z));
        }

        // ---------------------------------------------------------------------
        // Level of detail
        // ---------------------------------------------------------------------
        // Free cam surveys the world from a long way up with a huge radius; the
        // near LOD table would try to mesh six hundred tiles at full detail.
        setLodMode(lod) {
            if (this._lodMode === lod) return;
            this._lodMode = lod;
            this._clearChunks();
        }

        // Any water square in the block around the camera. Cheap: the biome
        // lookups it makes are memoised, and it only runs when the camera
        // crosses into a new square.
        _seaWithin(cwx, cwy, r) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    const biome = sampleBiomeAt(cwx + dx, cwy + dy);
                    if (biome && profileFor(biome.name).water) return true;
                }
            }
            return false;
        }

        // Roughly what a chunk costs to mesh, in patches: the column count scales
        // with the square of the block size.
        _chunkCost(step) {
            const n = VOX.PER_TILE / step;
            return Math.max(0.15, (n * n) / (VOX.SUB_N * VOX.SUB_N));
        }

        _stepFor(dist) {
            if (this._lodMode) return Math.max(10, VOX.lodStep(dist));
            return VOX.lodStep(dist);
        }

        // ---------------------------------------------------------------------
        // Streaming
        // ---------------------------------------------------------------------
        update(camperX, camperZ, buildAll = false, dirX = 0, dirZ = 0) {
            const cwx = Math.floor(camperX / this._ts);
            const cwy = Math.floor(camperZ / this._ts);

            // Re-mesh anything waiting first: a hole the player is still looking
            // at matters more than a tile on the horizon, and the patches of a
            // tile just streamed in are what the ground round them is made of.
            //
            // This is where nearly all the meshing in the world now happens, so
            // it gets nearly all of the frame's build time: several patches a
            // frame while there is room for them, and never more than one patch
            // past the budget.
            this._drainDirty(buildAll ? 4096 : 8, buildAll ? Infinity : DRAIN_MS);

            if (!buildAll && cwx === this._lastCwx && cwy === this._lastCwy &&
                this._radius === this._lastRadius && !this._pendingBuilds) {
                return;
            }
            this._lastCwx = cwx;
            this._lastCwy = cwy;
            this._lastRadius = this._radius;
            this.seaNear = this._seaWithin(cwx, cwy, 3);

            const hasDir = dirX !== 0 || dirZ !== 0;
            const dirLen = hasDir ? Math.hypot(dirX, dirZ) : 0;
            const ndx = dirLen > 0.001 ? dirX / dirLen : 0;
            const ndy = dirLen > 0.001 ? dirZ / dirLen : 0;

            const needed = [];
            for (let dx = -this._radius; dx <= this._radius; dx++) {
                for (let dy = -this._radius; dy <= this._radius; dy++) {
                    const wx = cwx + dx, wy = cwy + dy;
                    const key  = wx + ',' + wy;
                    const step = this._stepFor(Math.max(Math.abs(dx), Math.abs(dy)));
                    const have = this._chunks.get(key);
                    if (have && have.step === step) continue;
                    const distSq = dx * dx + dy * dy;
                    let prio = Math.sqrt(distSq);
                    if (hasDir) {
                        const forwardDot = dx * ndx + dy * ndy;
                        prio -= forwardDot * 1.6;
                    }
                    needed.push({ wx, wy, key, step, dist: distSq, prio, rebuild: !!have });
                }
            }
            needed.sort((a, b) => (hasDir ? (a.prio - b.prio) : (a.dist - b.dist)));

            // The budget is in patches and execution time: a full-detail tile is sixteen
            // twenty-five column patches and a far one is a fraction of one.
            // Using a strict millisecond budget alongside patch credits guarantees smooth 60 FPS.
            //
            // A full-detail tile's SHELL is cheap now - its scenery and its
            // streetlights, no meshing at all - because its sixteen patches go
            // on the dirty queue instead (see _buildChunk). What is still worth
            // rationing here is that scenery: a settled square plans a town and
            // instances every sprite on it.
            const isDriving = hasDir && dirLen > 0.5;
            const credits = buildAll ? Infinity
                : Math.max(1, (this._lodMode ? 12 : this._buildBudget)) * (isDriving ? 6 : 4);
            const maxMs = buildAll ? Infinity : (this._lodMode ? 7.0 : (isDriving ? 6.5 : 5.0));
            const clock = () => ((typeof performance !== 'undefined') ? performance.now() : Date.now());
            const tStart = clock();
            let spent = 0, built = 0;
            for (const job of needed) {
                if (built > 0 && (clock() - tStart >= maxMs || spent >= credits)) break;
                spent += this._chunkCost(job.step);
                built++;
                if (job.rebuild) this._disposeChunk(job.key);
                // Behind a transition the whole neighbourhood is meshed on the
                // spot: the fade must not lift on a world with no ground in it.
                this._chunks.set(job.key, this._buildChunk(job.wx, job.wy, job.step, buildAll));
            }
            this._pendingBuilds = needed.length > built || this._dirty.size > 0;

            for (const [key, ch] of this._chunks) {
                if (Math.abs(ch.wx - cwx) > this._radius + 2 ||
                    Math.abs(ch.wy - cwy) > this._radius + 2) {
                    this._disposeChunk(key);
                }
            }
            this._applyCaveDrawRing(cwx, cwy);
        }

        // Underground, only the tiles whose passages are actually meshed are
        // drawn. The rest are kept (they are what the party climbs back out
        // onto) but switched off: there is nothing of them to see through the
        // rock, and drawing them is what put another cave in the dark behind a
        // wall the camera had clipped into. Above ground everything is drawn.
        _applyCaveDrawRing(cwx, cwy) {
            const caves = this._caves;
            if (!caves && !this._ringApplied) return;
            this._ringApplied = caves;
            for (const ch of this._chunks.values()) {
                const on = !caves ||
                    (Math.abs(ch.wx - cwx) <= CAVE_DRAW_R && Math.abs(ch.wy - cwy) <= CAVE_DRAW_R);
                if (ch.grp.visible !== on) ch.grp.visible = on;
            }
        }

        // ---------------------------------------------------------------------
        // Chunk building
        // ---------------------------------------------------------------------
        // A tile is NOT meshed here any more, and that is the whole point.
        //
        // A full-detail tile is sixteen patches and costs 41 ms to mesh on the
        // surface and 98 ms with the caves on. The streaming loop's time budget
        // could not touch any of it, because a tile was one indivisible job: it
        // checked the clock BETWEEN jobs, and the first job of a frame runs
        // unconditionally. So every time the camera crossed into a new square
        // the frame that noticed paid the whole tile - a four to eight frame
        // freeze, once per square, for as long as anybody kept driving.
        //
        // One patch is 2.5 ms (4 ms with caves), which fits inside the budget
        // several times over. So the shell of the tile is built here - its
        // group, its scenery, its streetlights - and the sixteen patches go on
        // the same dirty queue a dig uses, to be drained a few milliseconds at
        // a time (see _drainDirty). Nothing about the world's SHAPE waits on
        // that: heights, collision and raycasts all come from the field, not
        // from the mesh, so a patch that has not been drawn yet is a patch you
        // can still stand on.
        //
        // `now` forces the old behaviour, for the one case that needs it: the
        // scene builds its whole neighbourhood up front behind a transition,
        // and that must be finished before the fade lifts.
        _buildChunk(wx, wy, step, now) {
            const ts    = this._ts;
            const biome = sampleBiomeAt(wx, wy);
            const type  = getRenderType(biome.name);
            const grp   = new THREE.Group();
            const px = wx * ts + ts * 0.5, pz = wy * ts + ts * 0.5;
            grp.position.set(px, 0, pz);

            const ch = { grp, wx, wy, step, px, pz, subs: new Map() };

            if (step === 1) {
                // Sixteen patches, so a dig re-meshes one of them.
                for (let sj = 0; sj < VOX.SUB; sj++) {
                    for (let si = 0; si < VOX.SUB; si++) {
                        if (now) this._buildSub(ch, si, sj);
                        else this._dirty.add(wx + ',' + wy + ',' + si + ',' + sj);
                    }
                }
                if (!now) this._pendingBuilds = true;
            } else {
                const n = Math.max(1, Math.round(VOX.PER_TILE / step));
                // Far chunks are drawn in blocks several voxels across; a
                // passage is finer than that, so the caves are never in them.
                this._addMesh(ch, 'all', VoxelMesher.build(this.field, wx, wy, 0, 0, n, step, px, pz, false));
            }

            // The carriageway is a real road: a ribbon extruded over the graded
            // roadbed, with its paint, its median and its barriers, rather than
            // a run of grey cubes with grey cubes painted on it.
            if (type === 'road') {
                this._buildRoadRibbon(grp, wx, wy, step);
                if (step === 1) this._buildStreetlights(grp, wx, wy);
            }

            // 2D billboard vegetation, rocks, props and settlements, unchanged:
            // they stand on the voxel surface the same way they stood on the
            // height mesh.
            // ...and none of it underground: every tree, rock and building of a
            // tile is scattered on its SURFACE, which is the one part of the
            // world nobody in a cave can see. Decorating the ring down there was
            // most of what a cave cost and none of what it showed.
            // Water is no longer skipped: the bed of the sea is furnished like
            // anywhere else, and the rare island standing out of it is dressed
            // and lived on. Only the near, full-detail ring pays for it - a weed
            // on the sea floor cannot be seen from the surface, let alone from
            // three tiles off - so it is gated on the LOD step as well.
            const wet = (type === 'water');
            if (type !== 'road' && !this._lodMode && !this._caves &&
                (!wet || step === 1)) {
                this._decorator.decorate(grp, wx, wy, biome, ts,
                    (gx, gz) => this.getTerrainHeight(gx, gz),
                    (x, z) => this.waterSurfaceAt(x, z));
            }

            this._dressCave(ch);

            this._scene.add(grp);
            return ch;
        }

        // What stands in the passages of a tile. Underground the SURFACE is not
        // decorated at all - there is nothing of it to see through the rock, and
        // decorating the ring down there was most of what a cave cost and none
        // of what it showed - so this is the whole of what a cave is furnished
        // with, and it goes down once per tile.
        //
        // Split out of _buildChunk because the caves are switched on and off
        // under tiles that are already built (see setCavesVisible): those tiles
        // are re-meshed in place rather than thrown away now, so something has
        // to dress them that is not the constructor.
        _dressCave(ch) {
            if (!this._caves || ch.step !== 1 || ch.dressed) return;
            const D = this._decorator;
            if (!D || !D._scatterCaveChests) return;
            ch.dressed = true;
            const floorAt = (x, z) => {
                const span = this.field.caveSpan(
                    Math.floor(x / VOX.SIZE), Math.floor(z / VOX.SIZE));
                if (!span) return null;
                // The floor of the LOWEST passage in the column, which is where
                // a chest would have been put down and left. Absolute, like
                // every other scattered thing: a chunk group sits at y = 0 and
                // only its x/z are the tile's.
                const y = this.field.supportY(x, z, (span.lo + 1) * VOX.SIZE);
                return (y == null || !isFinite(y)) ? null : y;
            };
            D._scatterCaveChests(ch.grp, ch.wx, ch.wy, this._ts, floorAt);
            if (D._scatterCaveScenery) {
                D._scatterCaveScenery(ch.grp, ch.wx, ch.wy, this._ts, floorAt,
                    sampleBiomeAt(ch.wx, ch.wy));
            }
        }

        _buildSub(ch, si, sj) {
            const n = VOX.SUB_N;
            const geo = VoxelMesher.build(this.field, ch.wx, ch.wy,
                si * n, sj * n, n, 1, ch.px, ch.pz, this._caves);
            this._addMesh(ch, si + ':' + sj, geo);
        }

        // A patch is the ground, the turf on top of it, one mesh for each kind
        // of block it shows (brick, marble, a seam of ore - each with its own
        // picture), and the sheet of standing water where a river or a lake
        // runs above sea level.
        _addMesh(ch, key, res) {
            const old = ch.subs.get(key);
            if (old) {
                for (const m of old) {
                    ch.grp.remove(m);
                    if (m.geometry) m.geometry.dispose();
                }
                ch.subs.delete(key);
            }
            if (!res) return;
            const made = [];
            if (res.solid) {
                const mesh = new THREE.Mesh(res.solid, voxelMaterial());
                mesh.receiveShadow = true;
                ch.grp.add(mesh);
                made.push(mesh);
            }
            if (res.grass) {
                const mesh = new THREE.Mesh(res.grass, voxelGrassMaterial());
                mesh.receiveShadow = true;
                ch.grp.add(mesh);
                made.push(mesh);
            }
            // One mesh per KIND of block the patch actually shows, each drawn
            // with that block's own picture. Ordinary ground carries none at
            // all; a cave wall carries the country rock, whatever lens is in it
            // and the seams, and nothing else.
            if (res.blocks) {
                for (const b of res.blocks) {
                    const mesh = new THREE.Mesh(b.geo, voxelBlockMaterial(b.mat));
                    mesh.receiveShadow = true;
                    ch.grp.add(mesh);
                    made.push(mesh);
                }
            }
            if (res.water) {
                const mesh = new THREE.Mesh(res.water, voxelWaterMaterial());
                mesh.renderOrder = 2;
                ch.grp.add(mesh);
                made.push(mesh);
            }
            if (made.length) ch.subs.set(key, made);
        }

        _disposeChunk(key) {
            const ch = this._chunks.get(key);
            if (!ch) return;
            this._scene.remove(ch.grp);
            ch.grp.traverse(o => { if (o.geometry) o.geometry.dispose(); });
            ch.subs.clear();
            this._chunks.delete(key);
            // Anything still queued for it is queued for a tile that no longer
            // exists. _drainDirty would skip those entries anyway, but a tile
            // streamed out and back in at a different detail level would leave
            // sixteen of them behind every time, and the queue is walked in
            // order: the dead entries would sit in front of the live ones.
            this._dropDirty(key);
        }

        // Forget every patch queued for one tile.
        _dropDirty(key) {
            if (!this._dirty.size) return;
            const prefix = key + ',';
            for (const k of this._dirty) {
                if (k.startsWith(prefix)) this._dirty.delete(k);
            }
        }

        _clearChunks() {
            for (const key of [...this._chunks.keys()]) this._disposeChunk(key);
            this._pendingBuilds = true;
            this._lastCwx = this._lastCwy = undefined;
        }

        // ---------------------------------------------------------------------
        // Digging: which patch a change landed in
        // ---------------------------------------------------------------------
        _markDirty(wx, wy, lx, lz) {
            const n  = VOX.SUB_N;
            const si = Math.floor(lx / n), sj = Math.floor(lz / n);
            // A cube on a patch border shows a face into the patch next door.
            const di = (lx % n === 0) ? -1 : (lx % n === n - 1) ? 1 : 0;
            const dj = (lz % n === 0) ? -1 : (lz % n === n - 1) ? 1 : 0;
            for (const ii of di ? [si, si + di] : [si]) {
                for (const jj of dj ? [sj, sj + dj] : [sj]) {
                    if (ii < 0 || ii >= VOX.SUB || jj < 0 || jj >= VOX.SUB) {
                        // Spilled into the neighbouring tile: rebuild it whole,
                        // it is rare enough not to be worth a finer path.
                        const nwx = wx + (ii < 0 ? -1 : ii >= VOX.SUB ? 1 : 0);
                        const nwy = wy + (jj < 0 ? -1 : jj >= VOX.SUB ? 1 : 0);
                        this._dirty.add(nwx + ',' + nwy + ',*,*');
                        continue;
                    }
                    this._dirty.add(wx + ',' + wy + ',' + ii + ',' + jj);
                }
            }
        }

        // Work the queue of patches waiting to be meshed: the ones a dig
        // touched, and every patch of every tile that has just been streamed in
        // (see _buildChunk).
        //
        // Bounded by TIME as well as by count. The count alone could not bound
        // it: a patch is 2.5 ms of ordinary ground and 4 ms of cave, but a
        // wholesale '*' entry is a whole tile, and two of those in a frame is
        // eighty milliseconds. The clock is checked between patches, so the
        // worst a frame can overrun by is one patch.
        _drainDirty(budget, maxMs) {
            if (!this._dirty.size) return;
            const clock = () => ((typeof performance !== 'undefined') ? performance.now() : Date.now());
            const tStart = clock();
            const cap = maxMs === undefined ? Infinity : maxMs;
            let n = budget, done = 0;
            for (const key of this._dirty) {
                if (n-- <= 0) break;
                if (done > 0 && clock() - tStart >= cap) break;
                done++;
                this._dirty.delete(key);
                const [sx, sy, si, sj] = key.split(',');
                const ch = this._chunks.get(sx + ',' + sy);
                if (!ch) continue;
                if (ch.step !== 1 || si === '*') {
                    // Coarse or wholesale: rebuild the tile at its current step.
                    // Meshed on the spot rather than re-queued - this is the one
                    // path that means "this whole tile is wrong now".
                    const step = ch.step;
                    this._disposeChunk(sx + ',' + sy);
                    this._chunks.set(sx + ',' + sy, this._buildChunk(Number(sx), Number(sy), step, true));
                } else {
                    this._buildSub(ch, Number(si), Number(sj));
                }
            }
        }

        // Force everything already built to be meshed again: used when the world
        // seed changes under the scene, or when a saved dig log is loaded.
        rebuildAll() {
            this.field.clearCache();
            this._clearChunks();
        }

        // ---------------------------------------------------------------------
        // Editing, wrapped so callers do not have to know the grid
        // ---------------------------------------------------------------------
        // Break the first cube along a ray. Returns the raycast hit, with the
        // material that came out on `broke`, or null.
        digRay(ox, oy, oz, dx, dy, dz, reach) {
            const hit = this.field.raycast(ox, oy, oz, dx, dy, dz, reach || VOX.REACH);
            if (!hit) return null;
            hit.broke = this.field.breakAt(hit.vx, hit.vy, hit.vz);
            return hit.broke ? hit : null;
        }

        // Put a cube against the face a ray lands on.
        placeRay(ox, oy, oz, dx, dy, dz, mat, reach) {
            const hit = this.field.raycast(ox, oy, oz, dx, dy, dz, reach || VOX.REACH);
            if (!hit) return null;
            const p = hit.place;
            return this.field.placeAt(p.vx, p.vy, p.vz, mat || MAT.DIRT) ? hit : null;
        }

        // A ball of ground taken out at once: a bumper at speed, a blast, a
        // heavy landing.
        carve(x, y, z, radius) { return this.field.carveSphere(x, y, z, radius, null); }

        // ---------------------------------------------------------------------
        // Real roads
        // ---------------------------------------------------------------------
        // A motorway is not a run of cubes. The ground under a road square is a
        // graded ROADBED, dropped out of sight by ROAD_BED_DROP and never looked
        // at; what is drawn over it is this: a ribbon extruded along the
        // centreline of the square, cross-section by cross-section, carrying
        // asphalt, a hard shoulder, solid edge lines, a dashed lane line down
        // each carriageway, a kerbed green median with a steel barrier along it
        // and armco on both verges. The paving follows the same smooth height
        // the camper drives at (VoxelField.heightAt answers with the paving on a
        // road column), so what is under the wheels is exactly what is drawn.
        //
        // The centreline is the one ProceduralMapRoadGenerator laid down and
        // VoxelField.roadAt solves against: straight through, a quarter-circle
        // bend tangent to both edges, or legs out of a junction box.
        // ---------------------------------------------------------------------

        // The paths of a road square, in tile-local units. Each is a list of
        // points the ribbon is swept along; `junction` asks for the box of plain
        // tarmac that the legs of a crossing meet in.
        _roadPaths(dir, ts) {
            const H = ts / 2;
            const box = ROAD_TOTAL_W / 2;
            const line = (x0, z0, x1, z1) => {
                const pts = [];
                const n = 24;
                for (let i = 0; i <= n; i++) {
                    const t = i / n;
                    pts.push({ x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t });
                }
                return { pts };
            };
            // A bend is the quarter ring roadAt solves: centred on the corner
            // between the two open edges, radius half a tile, so it leaves each
            // edge tangent to the straight road next door.
            const arc = (ccx, ccz) => {
                const R = ts * 0.5;
                // The quarter runs from where the ring crosses one edge of the
                // tile to where it crosses the other: due east or west of the
                // corner, round to due north or south of it.
                const s0 = ccx > 0 ? Math.PI : 0;
                let s1 = ccz > 0 ? -Math.PI / 2 : Math.PI / 2;
                // ...the short way round, which is the only way that stays
                // inside the square.
                while (s1 - s0 >  Math.PI) s1 -= Math.PI * 2;
                while (s1 - s0 < -Math.PI) s1 += Math.PI * 2;
                const pts = [];
                const n = 20;
                for (let i = 0; i <= n; i++) {
                    const a = s0 + (s1 - s0) * (i / n);
                    pts.push({ x: ccx + Math.cos(a) * R, z: ccz + Math.sin(a) * R });
                }
                return { pts };
            };
            const legs = (n, s, e, w) => {
                const out = [];
                if (n) out.push(line(0, -box, 0, -H));
                if (s) out.push(line(0,  box, 0,  H));
                if (w) out.push(line(-box, 0, -H, 0));
                if (e) out.push(line( box, 0,  H, 0));
                out.junction = true;
                return out;
            };

            let paths;
            switch (dir) {
                case 'vertical':   paths = [line(0, -H, 0, H)]; break;
                case 'horizontal': paths = [line(-H, 0, H, 0)]; break;
                case 'cross':      paths = legs(1, 1, 1, 1); break;
                case 't-up': case 't-north':   paths = legs(1, 0, 1, 1); break;
                case 't-down': case 't-south': paths = legs(0, 1, 1, 1); break;
                case 't-left': case 't-west':  paths = legs(1, 1, 0, 1); break;
                case 't-right': case 't-east': paths = legs(1, 1, 1, 0); break;
                case 'corner-up-left':    case 'corner-north-west': paths = [arc(-ts / 2, -ts / 2)]; break;
                case 'corner-up-right':   case 'corner-north-east': paths = [arc( ts / 2, -ts / 2)]; break;
                case 'corner-down-left':  case 'corner-south-west': paths = [arc(-ts / 2,  ts / 2)]; break;
                case 'corner-down-right': case 'corner-south-east': paths = [arc( ts / 2,  ts / 2)]; break;
                default:
                    if (String(dir).indexOf('cross') >= 0 || String(dir).indexOf('t-') === 0) {
                        paths = legs(1, 1, 1, 1);
                    } else {
                        paths = [line(-H, 0, H, 0)];
                    }
            }
            return paths;
        }

        // The cross-section, from the middle of the road outwards. Every band is
        // mirrored onto both carriageways, so this is written once and laid
        // twice. `lift` is above the paving, `drop` below it at the far edge.
        _roadBands() {
            if (this._roadBandCache) return this._roadBandCache;
            const half     = ROAD_TOTAL_W / 2;
            const med      = ROAD_GAP / 2;
            const shoulder = half - ROAD_SHOULDER_W;
            const L        = ROAD_LINE_W;
            const C        = ROAD_COL;
            this._roadBandCache = [
                // The median: grass behind a kerb, level with the paving.
                { from: -med + 1.6, to: med - 1.6, lift: ROAD_KERB_H, col: C.median, both: false },
                // The kerb, dropped far enough to close the flank of the median:
                // the ground between the carriageways was never lowered for a
                // roadbed, so it stands a bed's depth below the paving.
                { from: med - 1.6, to: med + 0.4, lift: ROAD_KERB_H,
                  drop: ROAD_KERB_H + ROAD_BED_DROP, col: C.kerb },
                // The carriageway, and its hard shoulder outside the edge line.
                { from: med + 0.4, to: shoulder, col: C.asphalt },
                { from: shoulder, to: half, col: C.shoulder },
                // The embankment: the paved edge falls away to the country, and
                // covers the lip of the roadbed cubes while it is about it.
                { from: half, to: half + 18, drop: ROAD_SKIRT, col: C.skirt },
                // Paint. Solid either side of each carriageway, broken down the
                // middle of it.
                { from: med + 2.4, to: med + 2.4 + L, lift: ROAD_MARK_LIFT, col: C.paint, paint: true },
                { from: shoulder - L - 1, to: shoulder - 1, lift: ROAD_MARK_LIFT, col: C.paint, paint: true },
                { from: ROAD_LANE_OFF - L / 2, to: ROAD_LANE_OFF + L / 2, lift: ROAD_MARK_LIFT,
                  col: C.paint, paint: true, dash: true }
            ];
            return this._roadBandCache;
        }

        // The ironmongery: a steel barrier down the median and armco on both
        // verges. Written as walls rather than bands, one quad tall.
        _roadWalls() {
            const half = ROAD_TOTAL_W / 2;
            return [
                { at: 0,         y0: ROAD_KERB_H, y1: ROAD_KERB_H + ROAD_BARRIER_H, col: ROAD_COL.steel },
                { at: half + 5,  y0: 4, y1: 4 + ROAD_BARRIER_H, col: ROAD_COL.steel },
                { at: -half - 5, y0: 4, y1: 4 + ROAD_BARRIER_H, col: ROAD_COL.steel }
            ];
        }

        _getRoadMat() {
            if (!this._roadMat) {
                this._roadMat = new THREE.MeshLambertMaterial({
                    vertexColors: true, side: THREE.DoubleSide
                });
            }
            return this._roadMat;
        }

        // Lay the carriageway of one square.
        _buildRoadRibbon(grp, wx, wy, step) {
            const ts  = this._ts;
            const dir = String(getRoadDirectionAt(wx, wy) || 'horizontal').toLowerCase();
            const paths = this._roadPaths(dir, ts);
            if (!paths.length) return;

            const px = wx * ts + ts * 0.5, pz = wy * ts + ts * 0.5;
            const pos = [], col = [], idx = [];
            const at = (x, z) => this.field.heightAt(px + x, pz + z);
            const push = (x, y, z, c) => {
                pos.push(x, y, z);
                col.push(((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255);
                return pos.length / 3 - 1;
            };
            const quad = (a, b, c, d) => { idx.push(a, b, c, a, c, d); };

            const fine  = step === 1;
            const bands = this._roadBands();
            const cycle = ROAD_DASH_ON + ROAD_DASH_OFF;

            for (const path of paths) {
                const pts = path.pts;
                // Each point of the path, with the road's own normal at it and
                // the distance along it, which is what the dashes are cut
                // against, and the paved height it is laid at.
                const S = [];
                let along = 0;
                for (let i = 0; i < pts.length; i++) {
                    const p = pts[i];
                    if (i > 0) along += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
                    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
                    let tx = b.x - a.x, tz = b.z - a.z;
                    const len = Math.hypot(tx, tz) || 1;
                    tx /= len; tz /= len;
                    const nx = -tz, nz = tx;
                    // The height of the CENTRELINE is not the height of the
                    // road: the centreline runs down the median, whose ground
                    // was never dropped to make room for a roadbed. So the
                    // section is hung off the two carriageways either side of
                    // it, which is where the paving actually is.
                    const y = (at(p.x + nx * ROAD_LANE_OFF, p.z + nz * ROAD_LANE_OFF) +
                               at(p.x - nx * ROAD_LANE_OFF, p.z - nz * ROAD_LANE_OFF)) * 0.5;
                    S.push({ x: p.x, z: p.z, nx, nz, s: along, y });
                }

                const strip = (band) => {
                    for (let i = 0; i + 1 < S.length; i++) {
                        const a = S[i], b = S[i + 1];
                        if (band.dash) {
                            const m = ((a.s % cycle) + cycle) % cycle;
                            if (m > ROAD_DASH_ON) continue;
                        }
                        const sides = band.both === false ? [1] : [1, -1];
                        for (const side of sides) {
                            const f = band.both === false ? band.from : band.from * side;
                            const t = band.both === false ? band.to   : band.to   * side;
                            const yF = (band.lift || 0), yT = (band.lift || 0) - (band.drop || 0);
                            const v0 = push(a.x + a.nx * f, a.y + yF, a.z + a.nz * f, band.col);
                            const v1 = push(b.x + b.nx * f, b.y + yF, b.z + b.nz * f, band.col);
                            const v2 = push(b.x + b.nx * t, b.y + yT, b.z + b.nz * t, band.col);
                            const v3 = push(a.x + a.nx * t, a.y + yT, a.z + a.nz * t, band.col);
                            if (side > 0) quad(v0, v1, v2, v3); else quad(v3, v2, v1, v0);
                        }
                    }
                };
                for (const band of bands) {
                    // Far off, the broken line is a shimmer and nothing else:
                    // the dashes are dropped and the solid lines kept.
                    if (band.dash && !fine) continue;
                    strip(band);
                }

                if (fine) {
                    for (const wall of this._roadWalls()) {
                        for (let i = 0; i + 1 < S.length; i++) {
                            const a = S[i], b = S[i + 1];
                            const ax = a.x + a.nx * wall.at, az = a.z + a.nz * wall.at;
                            const bx = b.x + b.nx * wall.at, bz = b.z + b.nz * wall.at;
                            const v0 = push(ax, a.y + wall.y0, az, wall.col);
                            const v1 = push(bx, b.y + wall.y0, bz, wall.col);
                            const v2 = push(bx, b.y + wall.y1, bz, wall.col);
                            const v3 = push(ax, a.y + wall.y1, az, wall.col);
                            quad(v0, v1, v2, v3);
                        }
                    }
                }
            }

            // The junction box: the legs of a crossing meet in a plain square of
            // tarmac, laid as a grid so it follows the ground under it.
            if (paths.junction) {
                const b = ROAD_TOTAL_W / 2, n = 5;
                for (let j = 0; j < n; j++) {
                    for (let i = 0; i < n; i++) {
                        const x0 = -b + (2 * b * i) / n, x1 = -b + (2 * b * (i + 1)) / n;
                        const z0 = -b + (2 * b * j) / n, z1 = -b + (2 * b * (j + 1)) / n;
                        const v0 = push(x0, at(x0, z0), z0, ROAD_COL.asphalt);
                        const v1 = push(x1, at(x1, z0), z0, ROAD_COL.asphalt);
                        const v2 = push(x1, at(x1, z1), z1, ROAD_COL.asphalt);
                        const v3 = push(x0, at(x0, z1), z1, ROAD_COL.asphalt);
                        quad(v0, v1, v2, v3);
                    }
                }
            }

            if (!idx.length) return;
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
            geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
            geo.setIndex(idx);
            geo.computeVertexNormals();
            const mesh = new THREE.Mesh(geo, this._getRoadMat());
            mesh.renderOrder = 1;
            grp.add(mesh);
        }

        // ---------------------------------------------------------------------
        // Streetlights (the last thing on a road tile that is still a prop)
        // ---------------------------------------------------------------------
        _getPoleMat() {
            if (!this._poleMat) {
                this._poleMat = new THREE.MeshLambertMaterial({
                    color: 0x6a6a70, map: loadVoxelTex('pole.png', 1)
                });
            }
            return this._poleMat;
        }

        _getLampMat() {
            if (!this._lampMat) {
                this._lampMat = new THREE.MeshLambertMaterial({
                    color: 0xfff2c0, emissive: 0xffd27a, emissiveIntensity: 1.0
                });
            }
            return this._lampMat;
        }

        _buildStreetlights(grp, wx, wy) {
            const ts    = this._ts;
            const dir   = getRoadDirectionAt(wx, wy);
            const sh    = ROAD_TOTAL_W / 2 + 12;
            const along = [-ts * 0.26, ts * 0.26];
            const HALF  = Math.PI / 2;

            const places = [];
            if (dir === 'horizontal') {
                for (const a of along) {
                    places.push({ x: a, z: -sh, rot: -HALF });
                    places.push({ x: a, z:  sh, rot:  HALF });
                }
            } else if (dir === 'vertical') {
                for (const a of along) {
                    places.push({ x: -sh, z: a, rot: 0 });
                    places.push({ x:  sh, z: a, rot: Math.PI });
                }
            } else {
                places.push({ x: -sh, z: 0,   rot: 0 });
                places.push({ x:  sh, z: 0,   rot: Math.PI });
                places.push({ x: 0,   z: -sh, rot: -HALF });
                places.push({ x: 0,   z:  sh, rot: HALF });
            }
            if (!places.length) return;

            const poleMat = this._getPoleMat();
            const lampMat = this._getLampMat();
            const poleGeo = new THREE.CylinderGeometry(0.7, 1.0, 30, 6).translate(0, 15, 0);
            const armGeo  = new THREE.BoxGeometry(12, 0.8, 0.8).translate(6, 29.6, 0);
            const lampGeo = new THREE.BoxGeometry(4, 1.6, 2.4).translate(12, 28.8, 0);

            const poles = new THREE.InstancedMesh(poleGeo, poleMat, places.length);
            const arms  = new THREE.InstancedMesh(armGeo,  poleMat, places.length);
            const lamps = new THREE.InstancedMesh(lampGeo, lampMat, places.length);

            const m = new THREE.Matrix4();
            const q = new THREE.Quaternion();
            const up = new THREE.Vector3(0, 1, 0);
            const pos = new THREE.Vector3();
            const one = new THREE.Vector3(1, 1, 1);
            places.forEach((p, i) => {
                q.setFromAxisAngle(up, p.rot);
                // Planted on the verge, sunk a touch so no pole ever hovers over
                // the lip of a cube.
                const py = this.getTerrainHeight(wx + 0.5 + p.x / ts, wy + 0.5 + p.z / ts) - ROAD_SINK - 1;
                pos.set(p.x, py, p.z);
                m.compose(pos, q, one);
                poles.setMatrixAt(i, m);
                arms.setMatrixAt(i, m);
                lamps.setMatrixAt(i, m);
            });
            grp.add(poles);
            grp.add(arms);
            grp.add(lamps);
        }

        dispose() {
            this._clearChunks();
            for (const mat of this._matCache.values()) mat.dispose();
            this._matCache.clear();
            if (this._poleMat) this._poleMat.dispose();
            if (this._lampMat) this._lampMat.dispose();
            if (this._roadMat) this._roadMat.dispose();
            this._poleMat = this._lampMat = this._roadMat = null;
            disposeVoxelMaterial();
            // The block palette goes with the world, not with a scene: one
            // material per block is shared by every square in it, and rebuilding
            // them for the next drive would throw away the whole point of them.
            if (VW.Blocks) VW.Blocks.dispose();
            this._decorator.dispose();
            this.field.onEdit = null;
            this._dirty.clear();
        }
    }

    // The blocks a player may put back, exported so the tool and the HUD agree.
    VoxelTerrain.PLACEABLE = PLACEABLE;

    // Handed to the rest of the suite.
    Object.assign(VW, { VoxelTerrain });
})();
