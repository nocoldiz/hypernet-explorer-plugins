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
        ROAD_BED_DROP, ROAD_COL, ROAD_DASH_OFF, ROAD_DASH_ON, ROAD_GAP, ROAD_KERB_H,
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

    // How far past a LOD boundary a tile has to be before it takes the change,
    // in tiles. Without a dead band the bands are decided by a rounded distance
    // and a camera loitering on a boundary flips a whole ring of tiles back and
    // forth several times a second - which, before a change of detail became
    // seamless, was the thing that made parts of a mountain wink in and out.
    const LOD_HYST = 0.35;

    // Give back everything a subtree holds. An InstancedMesh keeps a buffer of
    // its own on top of its geometry, and a streaming world builds and drops
    // thousands of them.
    function disposeTree(root) {
        root.traverse(o => {
            if (o.geometry) o.geometry.dispose();
            if (o.isInstancedMesh && o.dispose) o.dispose();
        });
    }

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
            // Where the ring was last read from, and how fast and which way the
            // camera was going: what the build order and the look-ahead are
            // worked out from (see _lookAhead, _orderDirty).
            this._camX = this._camZ = 0;
            this._ndx = this._ndy = 0;
            this._speed = 0;
            this._lastEvalSpeed = 0;
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
                for (let sj = 0; sj < ch.sub; sj++) {
                    for (let si = 0; si < ch.sub; si++) {
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
            this._lastEvalX = this._lastEvalZ = undefined;
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

        // Roughly what a chunk costs to bring in, in credits. Its GEOMETRY is
        // not paid for here any more - that goes on the patch queue and is
        // rationed by the clock (see _drainDirty) - so what this rations is the
        // one thing a chunk still builds on the spot: its dressing. A settled
        // square plans a town and instances every sprite standing on it.
        _chunkCost(step) {
            return step === 1 ? 1 : 0.45;
        }

        // ---------------------------------------------------------------------
        // The patch grid
        // ---------------------------------------------------------------------
        // Every chunk in the world, near or far, is cut into patches of at most
        // SUB_N blocks a side, and nothing is ever meshed in a bigger job than
        // one of those.
        //
        // This used to be true only of the full-detail ring. A coarse tile was
        // meshed as one indivisible geometry, and a step-2 tile measures 28 ms
        // against the real field: the streaming loop's millisecond budget could
        // not touch it, because the clock is only read BETWEEN jobs and the
        // first job of a frame runs unconditionally. So every coarse tile that
        // came into the ring cost a two-frame stall, and crossing one tile line
        // at speed brings in a whole row of them - which is what made fast
        // driving stutter tile line by tile line.
        //
        // A hundred columns divide into four patches of twenty-five blocks at
        // step 1, two of twenty-five at step 2, and one at step 4 and coarser.
        // Every patch in the world is twenty-five blocks square or less, and
        // none of them is more than about two milliseconds of work.
        _patchGrid(step) {
            const blocks = Math.max(1, Math.round(VOX.PER_TILE / step));
            const sub = Math.max(1, Math.min(VOX.SUB, Math.round(blocks / VOX.SUB_N)));
            return {
                sub,
                n:    Math.max(1, Math.round(blocks / sub)),
                span: Math.max(1, Math.round(VOX.PER_TILE / sub))
            };
        }

        _setGrid(ch, step) {
            const g = this._patchGrid(step);
            ch.step = step; ch.sub = g.sub; ch.n = g.n; ch.span = g.span;
        }

        // The voxel square a patch of a chunk's CURRENT grid covers, local to
        // the tile. What the covering test below is written in terms of.
        _patchBox(ch, si, sj) {
            const s = ch.span;
            return { x0: si * s, x1: (si + 1) * s, z0: sj * s, z1: (sj + 1) * s };
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

        // How much coarser than its distance a tile is drawn, in bands, because
        // of how fast the camera is travelling.
        //
        // A tile two squares ahead at two hundred kilometres an hour is under
        // the wheels in a second and gone again in the next: nothing on it can
        // be looked at and nothing in it can be dug, and meshing it at full
        // detail is four times the columns of meshing it a band out. The tile
        // the camera is IN and the ring immediately round it are never pushed -
        // that is the ground the wheels are actually on - so what this thins is
        // the middle distance, which at speed is scenery going past.
        //
        // It moves with the smoothed speed rather than the instantaneous one:
        // a change of band is cheap now but it is not free, and a throttle
        // being feathered should not keep re-deciding the horizon.
        _lodPush(fd) {
            if (this._lodMode || fd <= 1.5) return 0;
            return Math.min(1.5, this._speed / 140);
        }

        // Block size by distance - measured in tiles, BUT NOT IN WHOLE ONES. A
        // tile whose centre is a tile and a half off is at 1.5, not at 1.
        _bandStep(fd) {
            const step = VOX.lodStep(Math.round(fd + this._lodPush(fd)));
            return this._lodMode ? Math.max(10, step) : step;
        }

        // ...and the step a tile should actually be at, given the one it is at
        // now: a change is only taken once the tile is LOD_HYST clear of the
        // boundary that would send it straight back.
        //
        // Rounded to whole tiles and with no dead band, the answer flipped the
        // moment the camera stepped over a tile line. A player walking up and
        // down a boundary - or a camper wandering across one - had a whole ring
        // of tiles changing detail several times a second, and each change threw
        // that tile's geometry away and built it again.
        _stepFor(fd, cur) {
            const want = this._bandStep(fd);
            if (!cur || want === cur) return want;
            const stable = this._bandStep(want < cur ? fd + LOD_HYST : fd - LOD_HYST);
            return (want < cur ? stable < cur : stable > cur) ? want : cur;
        }

        // How far ahead of the camper the ring is filled before what is behind
        // it. At a walk this is barely a bias; at two hundred it is most of the
        // ring, because at two hundred everything behind the windscreen has
        // already been driven past.
        _lookAhead() {
            return 1.6 + Math.min(2.6, (this._speed || 0) / 85);
        }

        // ---------------------------------------------------------------------
        // Streaming
        // ---------------------------------------------------------------------
        update(camperX, camperZ, buildAll = false, dirX = 0, dirZ = 0) {
            const ts  = this._ts;
            const cwx = Math.floor(camperX / ts);
            const cwy = Math.floor(camperZ / ts);
            this._camX = camperX;
            this._camZ = camperZ;

            const hasDir = dirX !== 0 || dirZ !== 0;
            // dirX/dirZ carry the heading AT ITS SPEED, so this length is km/h.
            const dirLen = hasDir ? Math.hypot(dirX, dirZ) : 0;
            // Followed rather than taken: what the look-ahead and the detail
            // bands are decided by should not jump about with the throttle.
            this._speed += (dirLen - this._speed) * 0.08;
            if (Math.abs(dirLen - this._speed) < 0.5) this._speed = dirLen;
            this._ndx = dirLen > 0.001 ? dirX / dirLen : 0;
            this._ndy = dirLen > 0.001 ? dirZ / dirLen : 0;

            // One budget for the whole of the frame's world building, split
            // between meshing and dressing rather than handed to each in turn:
            // two separate five-millisecond budgets is a ten-millisecond frame,
            // which at sixty is most of it.
            const clock = () => ((typeof performance !== 'undefined') ? performance.now() : Date.now());
            const tStart = clock();
            const frameMs = this._lodMode ? 8.0 : (this._speed > 40 ? 7.0 : 5.0);

            // Re-mesh anything waiting first: a hole the player is still looking
            // at matters more than a tile on the horizon, and the patches of a
            // tile just streamed in are what the ground round it is made of.
            this._drainDirty(buildAll ? 4096 : 12,
                             buildAll ? Infinity : frameMs * 0.7);

            // The ring is re-read on movement rather than on tile crossings.
            // The LOD bands are fractional now, so a tile can be due a change
            // without the camera having changed square - and at a tile a second
            // the crossing itself is far too coarse a heartbeat to fill a ring
            // on.
            const moved = this._lastEvalX === undefined ||
                Math.abs(camperX - this._lastEvalX) > ts * 0.1 ||
                Math.abs(camperZ - this._lastEvalZ) > ts * 0.1 ||
                // ...or slowed down enough to be owed the detail speed took
                // away, which a party set down by a fast travel has without
                // having moved an inch since.
                Math.abs(this._speed - this._lastEvalSpeed) > 25;
            if (!buildAll && !moved && this._radius === this._lastRadius &&
                !this._pendingBuilds) {
                return;
            }
            this._lastEvalX = camperX;
            this._lastEvalZ = camperZ;
            this._lastEvalSpeed = this._speed;
            this._lastRadius = this._radius;
            if (cwx !== this._lastCwx || cwy !== this._lastCwy) {
                this._lastCwx = cwx;
                this._lastCwy = cwy;
                this.seaNear = this._seaWithin(cwx, cwy, 3);
            }

            const lead = this._lookAhead();
            const needed = [];
            for (let dy = -this._radius; dy <= this._radius; dy++) {
                for (let dx = -this._radius; dx <= this._radius; dx++) {
                    const wx = cwx + dx, wy = cwy + dy;
                    const key  = wx + ',' + wy;
                    const have = this._chunks.get(key);
                    const fd = Math.max(
                        Math.abs((wx + 0.5) * ts - camperX),
                        Math.abs((wy + 0.5) * ts - camperZ)) / ts;
                    const step = this._stepFor(fd, have ? have.step : 0);
                    if (have && have.step === step) continue;
                    let prio = fd;
                    if (hasDir) prio -= (dx * this._ndx + dy * this._ndy) * lead;
                    needed.push({ wx, wy, key, step, prio, have });
                }
            }
            needed.sort((a, b) => a.prio - b.prio);

            const credits = buildAll ? Infinity
                : Math.max(1, (this._lodMode ? 12 : this._buildBudget)) *
                  (this._speed > 40 ? 6 : 4);
            // Whatever the drain left of the frame, and never nothing: a tile
            // that is never dressed is a tile with no trees on it.
            const maxMs = buildAll ? Infinity
                : Math.max(1.5, frameMs - (clock() - tStart));
            const tDress = clock();
            let spent = 0, built = 0;
            for (const job of needed) {
                if (built > 0 && (clock() - tDress >= maxMs || spent >= credits)) break;
                spent += this._chunkCost(job.step);
                built++;
                // Behind a transition the whole neighbourhood is meshed on the
                // spot: the fade must not lift on a world with no ground in it.
                if (job.have) this._relod(job.have, job.step, buildAll);
                else this._chunks.set(job.key,
                    this._buildChunk(job.wx, job.wy, job.step, buildAll));
            }

            for (const [key, ch] of this._chunks) {
                if (Math.abs(ch.wx - cwx) > this._radius + 2 ||
                    Math.abs(ch.wy - cwy) > this._radius + 2) {
                    this._disposeChunk(key);
                }
            }
            // Behind a transition nothing may be left on the queue.
            if (buildAll) this._drainDirty(4096, Infinity);
            this._pendingBuilds = needed.length > built || this._dirty.size > 0;
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
        // A tile is NOT meshed here, and that is the whole point.
        //
        // A full-detail tile measures a hundred and thirty milliseconds against
        // the real field on a mountain square. The streaming loop's time budget
        // could not touch any of it while a tile was one indivisible job: it
        // reads the clock BETWEEN jobs, and the first job of a frame runs
        // unconditionally. So every time the camera crossed into a new square
        // the frame that noticed paid for whole tiles.
        //
        // What is built here is the shell - the group, the scenery, the road and
        // its lamps - and every patch of the tile goes on the same queue a dig
        // uses, to be drained a couple of milliseconds at a time (_drainDirty).
        // Nothing about the world's SHAPE waits on that: heights, collision and
        // raycasts all come from the field, not from the mesh, so a patch that
        // has not been drawn yet is still a patch you can stand on.
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
            // A chunk never moves once it is placed. Composing its matrix here
            // and standing three.js down from doing it again takes a few hundred
            // static meshes out of the per-frame scene walk, which had nothing
            // to say about any of them.
            grp.updateMatrix();
            grp.matrixAutoUpdate = false;

            const ch = {
                grp, wx, wy, step, px, pz, biome, type,
                subs: new Map(),   // the live patches, "si:sj" -> record
                old:  null,        // the step being left, until it is covered
                done: null,        // which patches of the new step have landed
                stamp: 0,
                sub: 0, n: 0, span: 0,
                decorated: false, dressed: false, road: null, roadFine: null
            };
            this._setGrid(ch, step);
            this._queuePatches(ch, now);
            this._dressChunk(ch);

            this._scene.add(grp);
            return ch;
        }

        _queuePatches(ch, now) {
            ch.done = new Set();
            for (let sj = 0; sj < ch.sub; sj++) {
                for (let si = 0; si < ch.sub; si++) {
                    if (now) this._buildSub(ch, si, sj);
                    else this._dirty.add(ch.wx + ',' + ch.wy + ',' + si + ',' + sj);
                }
            }
            if (!now) this._pendingBuilds = true;
        }

        // ---------------------------------------------------------------------
        // Changing detail without ever showing a hole
        // ---------------------------------------------------------------------
        // The old geometry is NOT thrown away first. It is stood aside, and each
        // patch of it is dropped only once every patch of the new step that
        // covers it has actually been meshed - which is also the moment those
        // new patches are shown, so the two are never both on screen either. A
        // tile driven toward refines a quarter at a time, a tile driven away
        // from coarsens the same way, and at no point is there nothing there.
        //
        // Throwing it away first is what made parts of a mountain wink out and
        // come back. A full-detail tile is sixteen patches drained a couple of
        // milliseconds a frame, so the hole stood open for the best part of a
        // second - and a camera wandering over a LOD boundary tore it open again
        // every single time it crossed.
        _relod(ch, step, now) {
            if (ch.step === step) return;
            // Whatever is still queued for the step it is leaving means nothing.
            this._dropDirty(ch.wx + ',' + ch.wy);
            const stash = ch.old || (ch.old = new Map());
            for (const [k, rec] of ch.subs) {
                // A patch that was never shown - it was still waiting on the
                // one under it - can go: dropping it changes nothing on screen,
                // and keeping it would leave two surfaces drawn through each
                // other for as long as the next change took.
                if (!rec.shown) { this._dropRec(ch, rec); continue; }
                stash.set(ch.stamp + '#' + k, rec);
            }
            ch.subs.clear();
            ch.stamp++;
            this._setGrid(ch, step);
            this._queuePatches(ch, now);
            this._dressChunk(ch);
        }

        // What stands in the passages of a tile. Underground the SURFACE is not
        // decorated at all - there is nothing of it to see through the rock, and
        // decorating the ring down there was most of what a cave cost and none
        // of what it showed - so this is the whole of what a cave is furnished
        // with, and it goes down once per tile.
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

        // Everything on a tile that is not the ground itself. Safe to call
        // again when a tile changes detail: each piece knows whether it has
        // already been put down, and only the road cares about the step.
        _dressChunk(ch) {
            // The carriageway is a real road: a ribbon extruded over the graded
            // roadbed, with its paint and its median, rather than
            // a run of grey cubes with grey cubes painted on it.
            if (ch.type === 'road') this._buildRoad(ch);

            // 2D billboard vegetation, rocks, props and settlements: they stand
            // on the voxel surface the same way they stood on the height mesh.
            // ...and none of it underground: every tree, rock and building of a
            // tile is scattered on its SURFACE, which is the one part of the
            // world nobody in a cave can see.
            // Water is not skipped: the bed of the sea is furnished like
            // anywhere else, and the rare island standing out of it is dressed
            // and lived on. Only the near, full-detail ring pays for it - a weed
            // on the sea floor cannot be seen from the surface, let alone from
            // three tiles off - so it is gated on the LOD step as well.
            const wet = (ch.type === 'water');
            if (ch.type !== 'road' && !ch.decorated && !this._lodMode && !this._caves &&
                (!wet || ch.step === 1)) {
                ch.decorated = true;
                this._decorator.decorate(ch.grp, ch.wx, ch.wy, ch.biome, this._ts,
                    (gx, gz) => this.getTerrainHeight(gx, gz),
                    (x, z) => this.waterSurfaceAt(x, z));
            }

            this._dressCave(ch);
        }

        // The road surface and its lamps, in a group of their own so a change
        // of detail can lift the lot in one move. Rebuilt only when the tile
        // crosses between full detail and coarse, which is the only thing about
        // a road that its LOD step decides.
        _buildRoad(ch) {
            const fine = ch.step === 1;
            if (ch.roadFine === fine) return;
            ch.roadFine = fine;
            if (ch.road) {
                ch.grp.remove(ch.road);
                disposeTree(ch.road);
                ch.road = null;
            }
            const g = new THREE.Group();
            this._buildRoadRibbon(g, ch.wx, ch.wy, ch.step);
            if (fine) this._buildStreetlights(g, ch.wx, ch.wy);
            if (!g.children.length) return;
            ch.grp.add(g);
            g.matrixAutoUpdate = false;
            g.matrixWorldNeedsUpdate = true;
            ch.road = g;
        }

        _buildSub(ch, si, sj) {
            if (si >= ch.sub || sj >= ch.sub) return;
            const geo = VoxelMesher.build(this.field, ch.wx, ch.wy,
                si * ch.span, sj * ch.span, ch.n, ch.step, ch.px, ch.pz,
                this._caves && ch.step === 1);
            const box = this._patchBox(ch, si, sj);
            // Held back while the step it is replacing still stands under it, so
            // no two surfaces are ever drawn through each other. _settle shows
            // it the moment the patch it covers is dropped.
            const shown = !(ch.old && ch.old.size && this._overlapsOld(ch, box));
            this._addMesh(ch, si + ':' + sj, geo, box, shown);
            ch.done.add(si + ':' + sj);
            this._settle(ch);
        }

        // Drop every stood-aside patch the new step has now covered, and show
        // whatever was waiting on it.
        _settle(ch) {
            const old = ch.old;
            if (!old || !old.size) return;
            for (const [k, rec] of old) {
                if (!this._covered(ch, rec)) continue;
                this._dropRec(ch, rec);
                old.delete(k);
            }
            if (!old.size) {
                ch.old = null;
                for (const rec of ch.subs.values()) this._showRec(rec);
                return;
            }
            for (const rec of ch.subs.values()) {
                if (!rec.shown && !this._overlapsOld(ch, rec)) this._showRec(rec);
            }
        }

        // Is every patch of the current grid that touches this square meshed?
        _covered(ch, box) {
            const s = ch.span;
            const i1 = Math.ceil(box.x1 / s), j1 = Math.ceil(box.z1 / s);
            for (let j = Math.floor(box.z0 / s); j < j1; j++) {
                for (let i = Math.floor(box.x0 / s); i < i1; i++) {
                    if (!ch.done.has(i + ':' + j)) return false;
                }
            }
            return true;
        }

        _overlapsOld(ch, box) {
            for (const rec of ch.old.values()) {
                if (box.x0 < rec.x1 && box.x1 > rec.x0 &&
                    box.z0 < rec.z1 && box.z1 > rec.z0) return true;
            }
            return false;
        }

        _showRec(rec) {
            rec.shown = true;
            for (const m of rec.meshes) m.visible = true;
        }

        _dropRec(ch, rec) {
            for (const m of rec.meshes) {
                ch.grp.remove(m);
                if (m.geometry) m.geometry.dispose();
            }
            rec.meshes.length = 0;
        }

        // A patch is the ground, the turf on top of it, one mesh for each kind
        // of block it shows (brick, marble, a seam of ore - each with its own
        // picture), and the sheet of standing water where a river or a lake
        // runs above sea level.
        _addMesh(ch, key, res, box, shown) {
            const old = ch.subs.get(key);
            if (old) {
                this._dropRec(ch, old);
                ch.subs.delete(key);
            }
            const meshes = [];
            const put = (geo, mat, order) => {
                const mesh = new THREE.Mesh(geo, mat);
                mesh.receiveShadow = true;
                if (order !== undefined) mesh.renderOrder = order;
                mesh.visible = shown;
                ch.grp.add(mesh);
                // The patch sits at its chunk's own origin and never moves, so
                // its world matrix is worked out once here rather than composed
                // again on every frame of the drive.
                mesh.matrixAutoUpdate = false;
                mesh.matrixWorldNeedsUpdate = true;
                meshes.push(mesh);
            };
            if (res) {
                if (res.solid) put(res.solid, voxelMaterial());
                if (res.grass) put(res.grass, voxelGrassMaterial());
                // One mesh per KIND of block the patch actually shows, each drawn
                // with that block's own picture. Ordinary ground carries none at
                // all; a cave wall carries the country rock, whatever lens is in
                // it and the seams, and nothing else.
                if (res.blocks) for (const b of res.blocks) put(b.geo, voxelBlockMaterial(b.mat));
                if (res.water) put(res.water, voxelWaterMaterial(), 2);
            }
            ch.subs.set(key, {
                meshes, shown: !!shown,
                x0: box.x0, x1: box.x1, z0: box.z0, z1: box.z1
            });
        }

        _disposeChunk(key) {
            const ch = this._chunks.get(key);
            if (!ch) return;
            this._scene.remove(ch.grp);
            disposeTree(ch.grp);
            ch.subs.clear();
            if (ch.old) ch.old.clear();
            ch.old = null;
            this._chunks.delete(key);
            // Anything still queued for it is queued for a tile that no longer
            // exists. _drainDirty would skip those entries anyway, but a tile
            // streamed out and back in at a different detail level would leave
            // its patches behind every time, and the queue is walked in order:
            // the dead entries would sit in front of the live ones.
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
            this._lastEvalX = this._lastEvalZ = undefined;
        }

        // ---------------------------------------------------------------------
        // Digging: which patch a change landed in
        // ---------------------------------------------------------------------
        // Resolved against the chunk's OWN grid rather than against a fixed one:
        // a coarse tile is cut into fewer, wider patches than a near one, and
        // marking a near tile's patch number on a far tile would re-mesh the
        // wrong quarter of it - or a quarter it does not have.
        _markDirty(wx, wy, lx, lz) {
            // A cube on a patch border shows a face into the patch next door,
            // and a cube on the edge of a tile shows one into the tile next
            // door, so the ring around the column is marked with it.
            for (let dj = -1; dj <= 1; dj++) {
                for (let di = -1; di <= 1; di++) {
                    const gx = wx * VOX.PER_TILE + lx + di;
                    const gz = wy * VOX.PER_TILE + lz + dj;
                    const twx = Math.floor(gx / VOX.PER_TILE);
                    const twy = Math.floor(gz / VOX.PER_TILE);
                    const ch = this._chunks.get(twx + ',' + twy);
                    if (!ch || !ch.span) continue;
                    const si = Math.min(ch.sub - 1,
                        Math.floor((gx - twx * VOX.PER_TILE) / ch.span));
                    const sj = Math.min(ch.sub - 1,
                        Math.floor((gz - twy * VOX.PER_TILE) / ch.span));
                    this._dirty.add(twx + ',' + twy + ',' + si + ',' + sj);
                }
            }
            this._pendingBuilds = true;
        }

        // Nearest first, and what is ahead of the camper before what is behind
        // it. The queue is a set, so it drains in the order things were added to
        // it - which while driving is the order the RING was walked, not the
        // order the eye needs them in. Without this the frame's build time went
        // on tiles in the mirror while the ground ahead was still missing.
        _orderDirty() {
            const ts = this._ts;
            const cx = (this._camX || 0) / ts, cz = (this._camZ || 0) / ts;
            const lead = this._lookAhead();
            const out = [];
            for (const key of this._dirty) {
                const a = key.indexOf(',');
                const b = key.indexOf(',', a + 1);
                const dx = Number(key.slice(0, a)) + 0.5 - cx;
                const dy = Number(key.slice(a + 1, b)) + 0.5 - cz;
                out.push({
                    key,
                    p: Math.max(Math.abs(dx), Math.abs(dy)) -
                       (dx * this._ndx + dy * this._ndy) * lead
                });
            }
            out.sort((a, b) => a.p - b.p);
            return out;
        }

        // Work the queue of patches waiting to be meshed: the ones a dig
        // touched, and every patch of every tile that has just been streamed in
        // or has just changed detail.
        //
        // Bounded by TIME as well as by count, because a patch is not a fixed
        // price: half a millisecond of flat grass, a couple of milliseconds of
        // mountain, more with the caves on. The clock is read between patches,
        // so the worst a frame can overrun by is one patch.
        _drainDirty(budget, maxMs) {
            const dirty = this._dirty;
            if (!dirty.size) return;
            const clock = () => ((typeof performance !== 'undefined') ? performance.now() : Date.now());
            const tStart = clock();
            const cap = maxMs === undefined ? Infinity : maxMs;
            const order = (dirty.size > 1 && budget < 4096) ? this._orderDirty() : null;
            let n = budget, done = 0;
            const take = (key) => {
                if (!dirty.delete(key)) return true;
                done++;
                const a = key.indexOf(',');
                const b = key.indexOf(',', a + 1);
                const c = key.indexOf(',', b + 1);
                const ch = this._chunks.get(key.slice(0, b));
                if (!ch) return true;
                this._buildSub(ch, Number(key.slice(b + 1, c)), Number(key.slice(c + 1)));
                return true;
            };
            if (order) {
                for (const e of order) {
                    if (n-- <= 0) break;
                    if (done > 0 && clock() - tStart >= cap) break;
                    take(e.key);
                }
            } else {
                for (const key of [...dirty]) {
                    if (n-- <= 0) break;
                    if (done > 0 && clock() - tStart >= cap) break;
                    take(key);
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
        // each carriageway and a kerbed green median, with the verges and the
        // median left open. The paving follows the same smooth height
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
