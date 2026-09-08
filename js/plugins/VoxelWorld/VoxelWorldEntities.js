//=============================================================================
// VoxelWorldEntities.js
// VoxelWorld: roadside wildlife, town crowds, walkable interiors, the party trail
//
// Part of the VoxelWorld suite. The ground of that world is a field of small
// destructible voxels; this module is one slice of the machinery laid over it.
// Load order is fixed in plugins.js and every module reads the shared state it
// needs off window.VoxelWorld.
//=============================================================================

/*:
 * @target MZ
 * @plugindesc VoxelWorld - roadside wildlife, town crowds, walkable interiors, the party trail
 * @author Omni-Lex
 *
 * @help
 * roadside wildlife, town crowds, walkable interiors, the party trail.
 *
 * One module of the VoxelWorld suite (VoxelWorldCore.js loads first). It
 * declares no plugin commands of its own; those live in VoxelWorldSystem.js.
 */

(() => {
    'use strict';

    const VW = window.VoxelWorld;
    if (!VW) { console.error('[VoxelWorld] core not loaded before VoxelWorldEntities.js'); return; }

    const {
        CharacterBillboard, VehicleBillboard, INTERIOR_FAR, INTERIOR_NEAR, PERSON_H, STAIR_REACH,
        STEP_UP, SettlementBatch, WORLD_MAP_ID, WORLD_TILE_SIZE, getRenderType,
        planBaseY, planForTile, planInterior, planSettlement, sampleBiomeAt,
        settleRnd, settlementKindAt
    } = VW;

    // =========================================================================
    // BiomeEnemyManager, decorative wildlife: the actual bespoke 3D battler
    // models (Battler3D families) spawned on the terrain around the camper,
    // picked from each enemy's <Biome:> note tag to match the tile they stand
    // on. They stand still and play their idle animation; pooled and recycled
    // by distance like the traffic.
    // =========================================================================
    const ENEMY_3D_MAX       = 24;     // concurrently loaded battler models

    // How tall a creature stands out here, in world units.
    //
    // The battle models carry no real size at all - every one of them is
    // normalised to fit the battle view - so the world has to decide for
    // itself. Small creatures stand noticeably larger than the player and
    // apex beasts stand giant and towering.
    const CREATURE_MIN_H = PERSON_H * 1.8;
    const CREATURE_MAX_H = PERSON_H * 5.8;
    function creatureHeight(data, level) {
        // A stable hash of the species, not a die roll: come back tomorrow and
        // the same animal is the same size.
        let h = ((data && data.id) | 0) * 2654435761;
        h = Math.imul(h ^ (h >>> 15), 2246822519);
        const own = ((h ^ (h >>> 13)) >>> 0) / 4294967296;
        const lvl = Math.max(0, Math.min(1, ((level | 0) - 1) / 70));
        const mix = Math.max(0, Math.min(1, own * 0.6 + lvl * 0.4));
        return CREATURE_MIN_H + (CREATURE_MAX_H - CREATURE_MIN_H) * (mix * 0.65 + Math.sqrt(mix) * 0.35);
    }
    const ENEMY_3D_DESPAWN   = 1250;   // world units before an enemy recycles
    const ENEMY_3D_SPAWN_INT = 0.5;    // seconds between spawn attempts
    const ENEMY_3D_CONTACT_R = 16;     // world units: how close counts as "touching"
    // The water. Anything shallower than this is a puddle nothing lives in;
    // a swimmer keeps this far off the surface and off the bottom, so it is
    // seen swimming through the water rather than skating on top of it or
    // dragging along the mud.
    const ENEMY_WATER_MIN_D  = 14;     // world units of water before it is a habitat

    // ---------------------------------------------------------------------
    // What lives in the caves
    // ---------------------------------------------------------------------
    // The passages under the world are not a world-map biome: no square is
    // tagged "Cave", they run under every square there is. So the roster is
    // asked for by name off the same <Biome:> index the surface uses, trying
    // the underground tags in order until one of them has anything in it.
    const CAVE_BIOME_TAGS = ['Cave', 'Cavern', 'Caves', 'Underdark', 'Mines',   // i18n-ignore  <Biome:> tag names
                             'Mineshaft', 'Catacombs', 'Crypt', 'Dungeon'];     // i18n-ignore  <Biome:> tag names
    // ...and the roster of the SEWERS, which is a different place with
    // different things in it. Enemies.json tags 173 creatures Sewer and they
    // never had anywhere to be until the galleries under the towns existed.
    const SEWER_BIOME_TAGS = ['Sewer', 'Sewers', 'Cistern'];                    // i18n-ignore  <Biome:> tag names
    // A passage is not a prairie: things are met round the next corner, not
    // half a kilometre off across open country.
    const CAVE_SPAWN_MIN  = 90;    // world units from the party
    const CAVE_SPAWN_MAX  = 330;
    // How long the current spawn mode's level band is held before it is asked
    // for again. The band moves with the party (Party Level) or with the ground
    // under them (Realistic), neither of which changes in a second, and working
    // it out walks the world map.
    const SPAWN_BAND_TTL = 4000;

    // How far above the party's own level to start looking for a floor, and how
    // far from their level that floor may be before it is a different passage
    // on a different level and not worth spawning into.
    const CAVE_SPAWN_RISE = 12;
    const CAVE_SPAWN_DROP = 44;
    // ...and how much headroom a passage needs before anything is put in it.
    const CAVE_SPAWN_HEAD = 10;
    const ENEMY_WATER_MARGIN = 4;      // clearance kept off the surface and the bed
    // A movement personality's ranges (sight, leash, the band a stalker holds)
    // are written in map STEPS, because that is what they mean on the 2D map.
    // Out here a step is about a metre and a half of ground, which puts a
    // swooping bird's ten-step sight at a hundred and twenty units - far enough
    // to be spotted from, close enough to be walked out of.
    const TILE_UNITS = 12;
    // Flight. A creature that flies cruises up here, perches on the ground when
    // it has nothing to do, and comes down onto whatever it has decided to
    // swoop at.
    const FLY_CRUISE_MIN = 45;
    const FLY_CRUISE_MAX = 100;
    const FLY_SWOOP_H    = 4;         // how far over the party feet a diving flyer levels out
    // Frames, as the personality table counts them, into seconds.
    const FRAME = 1 / 60;

    // Which creatures live in the water, which can go either way, and which
    // drown in it. The battle system owns those lists (its archetype tables in
    // BattleSystemEnhancedEncounters), so the sea holds the same fauna here as
    // it does on the 2D map; without that plugin nothing swims.
    // The movement personality of a creature, straight off its <Movement:>
    // tag and the battle system's own table, so a bird swoops out here exactly
    // as it swoops on the map. Without that plugin everything simply wanders.
    function enemyBehavior(data) {
        const BSE = window.BattleSystemEnhanced;
        if (!BSE || !BSE.Helpers || !BSE.Helpers.getEnemyMovementKey) {
            return { idle: 'wander', react: null, sight: 0 };
        }
        return BSE.Helpers.getMovementBehavior(BSE.Helpers.getEnemyMovementKey(data));
    }

    function enemyWaterClass(data) {
        const BSE = window.BattleSystemEnhanced;
        if (!BSE || !BSE.Helpers || !BSE.Helpers.getEnemyArchetype) return 'land';
        const arch = BSE.Helpers.getEnemyArchetype(data);
        if (!arch) return 'land';
        if (BSE.Helpers.getAquaticArchetype(arch)) return 'aquatic';
        if (BSE.Helpers.getAmphibiousArchetype(arch)) return 'amphibious';
        return 'land';
    }

    // The name and level plate a roaming creature wears in the 3D world, drawn
    // exactly like the one its map sprite wears in 2D: its name, and its level
    // in the colour of the gap between it and the party (white while the fight
    // is even, amber once it is hard, red once it is out of reach).
    const ENEMY_PLATE_COLORS = ['#FFFFFF', '#FFD11A', '#FF3B30'];
    // A plate is read, not measured: it keeps the same size on screen whatever
    // distance it is at (world size proportional to that distance), sits just
    // over the creature's head, and is not drawn at all for something too far
    // off to walk up to.
    const ENEMY_PLATE_K     = 0.11;   // world width per unit of distance
    const ENEMY_PLATE_MIN   = 2;
    const ENEMY_PLATE_MAX   = 52;
    const ENEMY_PLATE_RANGE = 560;

    function enemyLevelOf(enemyData) {
        if (!enemyData) return 0;
        if (enemyData._bseLevel != null) return enemyData._bseLevel;
        const BSE = window.BattleSystemEnhanced;
        if (BSE && BSE.Helpers && BSE.Helpers.getEnemyLevel) {
            return BSE.Helpers.getEnemyLevel(enemyData.note) || 0;
        }
        const m = enemyData.note && enemyData.note.match(/<Level:\s*(\d+)>/i);
        return m ? parseInt(m[1], 10) : 0;
    }

    // Which of the three bands this level falls in against the party, read from
    // the battle system's own gap table so the 3D plate and the 2D one can never
    // disagree. Everything is "even" when that system is not loaded.
    function enemyLevelBand(level) {
        const BSE = window.BattleSystemEnhanced;
        try {
            if (BSE && BSE.Helpers && BSE.Helpers.levelGapTier && BSE.Helpers.ihComputeEffectivePartyLevel) {
                const party = BSE.Helpers.ihComputeEffectivePartyLevel();
                return BSE.Helpers.levelGapTier(level, party).tier | 0;
            }
        } catch (e) { /* fall through */ }
        return 0;
    }

    function makeEnemyPlate(name, level) {
        const cv = document.createElement('canvas');
        cv.width = 512; cv.height = 96;
        const ctx = cv.getContext('2d');
        const lvText = level > 0 ? T('CamperDrive.enemy.level', { n: level }) : '';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        const draw = (text, y, size, color) => {
            ctx.font = 'bold ' + size + "px GameFont, 'Bitter', serif";  // i18n-ignore  CSS font stack
            ctx.lineWidth = 8;
            ctx.strokeStyle = 'rgba(0,0,0,0.85)';
            ctx.strokeText(text, cv.width / 2, y);
            ctx.fillStyle = color;
            ctx.fillText(text, cv.width / 2, y);
        };
        draw(String(name || ''), 30, 40, '#f4ead6');
        if (lvText) draw(lvText, 74, 34, ENEMY_PLATE_COLORS[enemyLevelBand(level)] || '#FFFFFF');

        const tex = new THREE.CanvasTexture(cv);
        if (THREE.SRGBColorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({
            map: tex, transparent: true, depthWrite: false, depthTest: true
        }));
        // Anchored by its foot, so growing with distance lifts it away from the
        // head instead of sinking it into the model.
        if (sp.center && sp.center.set) sp.center.set(0.5, 0);
        sp.userData._plate = true;
        return sp;
    }

    class BiomeEnemyManager {
        constructor(scene, terrain) {
            this._scene   = scene;
            this._terrain = terrain;
            this._ents    = [];
            this._timer   = 0;
            this._byBiome = null;   // lazy index: biome tag (lowercase) -> enemy ids
            this._ok = !!(window.Battler3D && typeof window.Battler3D.create === 'function' &&
                typeof $dataEnemies !== 'undefined' && $dataEnemies);
        }

        // A roster set from outside: the species a PLANET has, rather than the
        // creatures Earth's biomes list. Every square of an alien world draws
        // from the same handful of things that live there (GalaxySim's
        // alienSpeciesRoster), which is what a planet with life actually looks
        // like. Null puts Earth's own <Biome:> tags back.
        setRoster(enemyIds) {
            this._roster = (enemyIds && enemyIds.length) ? enemyIds.slice() : null;
        }

        // Where the party is standing, in the one respect that changes what
        // meets them: rock over their head. Told every frame by the scene.
        setUnderground(on, eyeY) {
            this._under = !!on;
            this._underY = (eyeY == null) ? this._underY : eyeY;
        }

        // Index every enemy's <Biome: a, b, c> tags once per scene.
        _index() {
            if (this._byBiome) return this._byBiome;
            const map = new Map();
            for (const e of $dataEnemies) {
                if (!e || !e.note) continue;
                const m = e.note.match(/<Biome:\s*(.+?)>/i);
                if (!m) continue;
                for (const raw of m[1].split(',')) {
                    const b = raw.trim().toLowerCase();
                    if (!b) continue;
                    if (!map.has(b)) map.set(b, []);
                    map.get(b).push(e.id);
                }
            }
            this._byBiome = map;
            return map;
        }

        // ---------------------------------------------------------------------
        // The spawn band
        // ---------------------------------------------------------------------
        // What meets the party out here is decided by the SAME rule that decides
        // it on the 2D map: the biome's own band
        // (BattleSystemEnhancedEncounters, section 4b). The 3D world used to
        // reimplement it and hand out the biome's whole roster flat, which drifted
        // from what the 2D map actually spawned.
        //
        // The band and its level weighting are asked for rather than
        // reimplemented, so the two worlds cannot drift apart. Re-read on a timer
        // rather than per spawn: the answer only moves as the party does.
        _spawnBand() {
            const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
            if (this._bandAt && now - this._bandAt < SPAWN_BAND_TTL) return this._band;
            this._bandAt = now;
            this._band = null;
            const BSE = window.BattleSystemEnhanced;
            const H = BSE && BSE.Helpers;
            if (!H || !H.getSpawnMode || !H.getSpawnBand || !H.getModeRefLevel) return null;
            try {
                const mode = H.getSpawnMode();
                const party = H.getPartyReferenceLevel ? H.getPartyReferenceLevel() : 1;
                const ref = H.getModeRefLevel(mode, party);
                // The biome pitches a share of its spawns at the party and the
                // rest at whatever the place holds; the roll is the battle
                // system's own, so the share is the same in both worlds.
                let band = H.getSpawnBand(mode, ref);
                if (mode === 'biome' && H.rollBiomeTether && H.rollBiomeTether() &&
                    H.getBiomeTetherBand) {
                    band = H.getBiomeTetherBand();
                }
                if (!band) return null;
                this._band = { mode, ref, band };
            } catch (e) { this._band = null; }
            return this._band;
        }

        // One species out of a roster, chosen the way the current spawn mode
        // would choose it: inside the mode's level band, weighted toward the
        // level that band is aimed at. Falls back to the nearest levels when the
        // biome has nobody in the band at all, exactly as the 2D filters do -
        // a roster is never emptied, it is only re-aimed.
        _pickByMode(ids) {
            if (!ids || !ids.length) return null;
            const sel = this._spawnBand();
            if (!sel) return ids[(Math.random() * ids.length) | 0];
            const band = sel.band;
            const lo = Math.max(1, band.min || 1);
            const hi = Math.max(lo, band.max || 100);
            const centre = band.center || sel.ref || lo;

            const levels = ids.map(id => enemyLevelOf($dataEnemies[id]) || 1);
            let pool = ids.filter((id, i) => levels[i] >= lo && levels[i] <= hi);
            if (!pool.length) {
                // Nothing in the band. The nearest level to it wins, and
                // everything sharing that level with it comes too.
                let best = Infinity;
                for (const l of levels) {
                    const d = l < lo ? lo - l : l - hi;
                    if (d < best) best = d;
                }
                pool = ids.filter((id, i) => {
                    const l = levels[i];
                    return (l < lo ? lo - l : l - hi) === best;
                });
            }
            if (pool.length === 1) return pool[0];

            const H = window.BattleSystemEnhanced && window.BattleSystemEnhanced.Helpers;
            if (!H || !H.levelAffinityWeight) return pool[(Math.random() * pool.length) | 0];
            let total = 0;
            const w = pool.map(id => {
                const k = Math.max(0.0001, H.levelAffinityWeight(enemyLevelOf($dataEnemies[id]) || 1, centre));
                total += k;
                return k;
            });
            let r = Math.random() * total;
            for (let i = 0; i < pool.length; i++) {
                r -= w[i];
                if (r <= 0) return pool[i];
            }
            return pool[pool.length - 1];
        }

        // Enemy ids for a tile biome: exact tag match first, then the longest
        // partial match (so "MountainIce" still finds "Mountain" dwellers).
        _candidatesFor(biomeName) {
            if (this._roster) return this._roster;
            const idx = this._index();
            const n = biomeName.toLowerCase();
            const exact = idx.get(n);
            if (exact && exact.length) return exact;
            let best = null, bestLen = 0;
            for (const [tag, ids] of idx) {
                if (tag.length >= 4 && tag.length > bestLen &&
                    (n.includes(tag) || tag.includes(n))) {
                    best = ids; bestLen = tag.length;
                }
            }
            return best;
        }

        update(delta, vanX, vanZ) {
            if (!this._ok) return;
            // Gait animations tick, roaming updates, distance recycling.
            for (let i = this._ents.length - 1; i >= 0; i--) {
                const ent = this._ents[i];
                if (ent.model && typeof ent.model.update === 'function') {
                    try { ent.model.update(delta); } catch (e) { /* ignore */ }
                }
                // Anything that can move, and anything that can react to being
                // walked up to even if it cannot: a mimic never takes a step and
                // still has to be able to spring.
                if (ent.root && !ent.dead && (ent.moveSpeed > 0 || (ent.beh && ent.beh.react) || ent.flies || ent.swims)) {
                    this._roam(ent, delta, vanX, vanZ);
                }
                if (ent.plate) this._sizePlate(ent, vanX, vanZ);
                const dx = ent.x - vanX, dz = ent.z - vanZ;
                if (dx * dx + dz * dz > ENEMY_3D_DESPAWN * ENEMY_3D_DESPAWN) this._remove(i);
            }
            this._timer += delta;
            if (this._timer < ENEMY_3D_SPAWN_INT) return;
            this._timer = 0;
            if (this._ents.length < ENEMY_3D_MAX) this._trySpawn(vanX, vanZ);
        }

        // ---------------------------------------------------------------------
        // How a creature behaves
        //
        // Not a drift any more: every creature out here runs the same movement
        // personality its map sprite runs in 2D, read straight off its
        // <Movement:> tag (BattleSystemEnhancedEncounters' own table). A
        // personality answers three separate questions - what it does when
        // nothing is happening, how it notices the party, and what it does once
        // it has - and drives one small state machine:
        //
        //   idle -> alert -> commit -> search -> return -> idle
        //
        // `alert` is the telegraph: the creature stops, turns to face the party
        // and holds still for a moment before it commits, which is what makes
        // being hunted readable. Break its line of sight, walk out of its leash,
        // or put a hill between you, and it gives up and goes home.
        // ---------------------------------------------------------------------

        // Can this creature see the party from where it stands, facing the way
        // it does? Range, then the facing arc, then whether the ground between
        // them is in the way.
        _sees(ent, px, pz, beh) {
            if (px == null) return false;
            let sightSteps = (beh && beh.sight > 0) ? beh.sight : 0;
            if (ent.flies && sightSteps < 14) sightSteps = 14;
            if (ent.swims && sightSteps < 12) sightSteps = 12;
            if (sightSteps <= 0) return false;
            const dx = px - ent.x, dz = pz - ent.z;
            const d2 = dx * dx + dz * dz;
            const range = sightSteps * TILE_UNITS;
            if (d2 > range * range) return false;
            const cone = beh && beh.cone != null ? beh.cone : 360;
            if (cone < 359 && !ent.flies && !ent.swims) {
                let a = Math.atan2(dz, dx) - ent.heading;
                while (a > Math.PI)  a -= Math.PI * 2;
                while (a < -Math.PI) a += Math.PI * 2;
                if (Math.abs(a) > (cone * Math.PI / 180) / 2) return false;
            }
            if (beh && beh.los && !ent.flies && !this._clearLine(ent, px, pz)) return false;
            return true;
        }

        // Is there ground in the way? Sampled at a handful of points along the
        // line rather than raycast through the voxels: a hill or a cliff between
        // the two hides the party, and that is all this has to answer.
        _clearLine(ent, px, pz) {
            const ts = WORLD_TILE_SIZE;
            const eyeY = (ent.y != null ? ent.y : this._terrain.getTerrainHeight(ent.x / ts, ent.z / ts)) + 6;
            const tgtY = this._terrain.getTerrainHeight(px / ts, pz / ts) + 6;
            for (let i = 1; i <= 4; i++) {
                const t = i / 5;
                const gx = ent.x + (px - ent.x) * t;
                const gz = ent.z + (pz - ent.z) * t;
                const line = eyeY + (tgtY - eyeY) * t;
                if (this._terrain.getTerrainHeight(gx / ts, gz / ts) > line + 2) return false;
            }
            return true;
        }

        // One tick of the state machine. Sets a heading and a speed, and hands
        // the actual step to _advance, which owns where a creature may go.
        _roam(ent, delta, px, pz) {
            const beh = ent.beh || {};
            const toParty = px == null ? 0 : Math.hypot(px - ent.x, pz - ent.z);
            const faceParty = px == null ? ent.heading : Math.atan2(pz - ent.z, px - ent.x);
            // A creature that has just been in a fight and lived wants nothing
            // more to do with the party for a while: it turns tail and runs,
            // whatever its nature says.
            if (ent.spooked > 0) {
                ent.spooked -= delta;
                ent.heading = faceParty + Math.PI;
                ent.state = 'idle'; ent.stT = 0;
                if (ent.flies) ent.diving = false;
                this._advance(ent, delta, ent.moveSpeed * 2.2, px, pz);
                return;
            }

            const seen = this._sees(ent, px, pz, beh);
            if (seen) { ent.lastX = px; ent.lastZ = pz; }
            let speed = ent.moveSpeed;

            switch (ent.state) {
                case 'alert':
                    // The telegraph: stopped, turned to face whatever it noticed.
                    ent.heading = faceParty;
                    speed = ent.flies ? ent.moveSpeed * 1.0 : (ent.swims ? ent.moveSpeed * 0.6 : 0);
                    if (ent.flies) ent.diving = true;
                    ent.stT -= delta;
                    if (ent.stT <= 0) { ent.state = 'commit'; ent.memT = (beh.memory || 120) * FRAME; }
                    break;

                case 'commit':
                    if (ent.flies) {
                        speed = ent.moveSpeed * (2.2 + (beh.chaseSpeed || 0.6));
                        ent.diving = true;
                    } else if (ent.swims) {
                        speed = ent.moveSpeed * (1.6 + (beh.chaseSpeed || 0.5));
                    } else {
                        speed = ent.moveSpeed * (1 + (beh.chaseSpeed || 0));
                    }
                    this._react(ent, beh, faceParty, toParty, seen, delta);
                    if (seen) ent.memT = (beh.memory || 120) * FRAME;
                    else ent.memT -= delta;
                    if (!beh.relentless) {
                        const leash = (beh.leash || 12) * TILE_UNITS;
                        if (ent.memT <= 0 || toParty > leash) {
                            ent.state = 'search';
                            ent.stT = Math.min(4, (beh.memory || 120) * FRAME * 0.5);
                        }
                    }
                    break;

                case 'search':
                    // Where it last saw them, for as long as it remembers.
                    if (ent.lastX != null) {
                        ent.heading = Math.atan2(ent.lastZ - ent.z, ent.lastX - ent.x);
                    }
                    if (ent.flies) ent.diving = false;
                    ent.stT -= delta;
                    if (seen) { ent.state = 'commit'; ent.memT = (beh.memory || 120) * FRAME; }
                    else if (ent.stT <= 0) { ent.state = beh.home ? 'return' : 'idle'; ent.stT = 0; }
                    break;

                case 'return':
                    ent.heading = Math.atan2(ent.homeZ - ent.z, ent.homeX - ent.x);
                    if (ent.flies) ent.diving = false;
                    if (Math.hypot(ent.homeX - ent.x, ent.homeZ - ent.z) < TILE_UNITS) {
                        ent.state = 'idle'; ent.stT = 0;
                    }
                    if (seen && (beh.react || ent.flies || ent.swims)) { ent.state = 'alert'; ent.stT = (beh.alert || 15) * FRAME; }
                    break;

                default:
                    speed = this._idle(ent, beh, delta);
                    if (ent.flies) ent.diving = false;
                    if (seen && (beh.react || ent.flies || ent.swims)) {
                        ent.state = 'alert';
                        ent.stT = (beh.alert || 20) * FRAME;
                    }
                    break;
            }

            this._advance(ent, delta, speed, px, pz);
        }

        // What it does when nothing is happening. Returns the speed it does it
        // at: most of these stand still, and the ones that move do it slowly.
        _idle(ent, beh, delta) {
            const idle = beh.idle || 'wander';
            const freq = beh.freq || 3;
            ent.turnT -= delta;
            switch (idle) {
                case 'still':
                case 'perch':
                    return 0;
                case 'scan':
                    // A sentry sweeps its arc rather than walking its post.
                    ent.heading += delta * 0.7;
                    return 0;
                case 'dart':
                    // Short, sharp, and often: an insect's flight.
                    if (ent.turnT <= 0) {
                        ent.turnT = 0.25 + Math.random() * 0.5;
                        ent.heading += (Math.random() - 0.5) * 3;
                    }
                    return ent.moveSpeed * 1.3;
                case 'graze':
                case 'scavenge':
                    // Head down, a step at a time, mostly stopped.
                    if (ent.turnT <= 0) {
                        ent.turnT = 2 + Math.random() * 4;
                        ent.heading += (Math.random() - 0.5) * 2.2;
                        ent.grazing = Math.random() < 0.5;
                    }
                    return ent.grazing ? 0 : ent.moveSpeed * 0.4;
                case 'drift':
                    // Carried by whatever carries it; you are not part of its world.
                    if (ent.turnT <= 0) { ent.turnT = 4 + Math.random() * 6; ent.heading += (Math.random() - 0.5) * 0.9; }
                    return ent.moveSpeed * 0.35;
                case 'patrol':
                case 'territory':
                    // Round its own ground, turning back at the edge of it.
                    if (Math.hypot(ent.x - ent.homeX, ent.z - ent.homeZ) >
                        (beh.homeRadius || 10) * TILE_UNITS) {
                        ent.heading = Math.atan2(ent.homeZ - ent.z, ent.homeX - ent.x);
                        ent.turnT = 1.5;
                    } else if (ent.turnT <= 0) {
                        ent.turnT = 2 + Math.random() * 3;
                        ent.heading += (Math.random() - 0.5) * 1.4;
                    }
                    return ent.moveSpeed * 0.7;
                default:
                    if (ent.turnT <= 0) {
                        ent.turnT = 6 / freq + Math.random() * 2.5;
                        ent.heading += (Math.random() - 0.5) * 1.2;
                    }
                    return ent.moveSpeed * 0.8;
            }
        }

        // What it does once it HAS noticed. Sets the heading; the caller has
        // already worked out the speed.
        _react(ent, beh, faceParty, toParty, seen, delta) {
            const band = beh.band;
            if (ent.flies) {
                // Flying enemies swoop down directly at the player
                ent.heading = faceParty;
                ent.diving = true;
                return;
            }
            if (ent.swims) {
                // Swimming enemies swim directly towards the player
                ent.heading = faceParty;
                return;
            }
            switch (beh.react) {
                case 'flee':
                case 'coward':
                    ent.heading = faceParty + Math.PI;
                    break;
                case 'stalk':
                    // Keeps its distance and its eyes on you: closes to the near
                    // edge of its band, backs off past the far one.
                    if (band && toParty < band[0] * TILE_UNITS) ent.heading = faceParty + Math.PI;
                    else if (band && toParty > band[1] * TILE_UNITS) ent.heading = faceParty;
                    else ent.heading = faceParty + Math.PI / 2;
                    break;
                case 'circle':
                    // Orbits, holding its band, always turned inward.
                    ent.heading = faceParty + Math.PI / 2 +
                        (band && toParty > band[1] * TILE_UNITS ? -0.7 : band && toParty < band[0] * TILE_UNITS ? 0.7 : 0);
                    break;
                case 'swoop':
                    ent.heading = faceParty;
                    ent.diving = toParty > TILE_UNITS * 2;
                    break;
                default:
                    // chase, track, ambush, charge, pack: all of them come at you.
                    ent.heading = faceParty;
                    break;
            }
            // A pack hunter fans out a little rather than queueing up behind
            // whoever got there first.
            if (beh.react === 'pack') ent.heading += (ent.packOff || 0);
        }

        // Move a creature along its heading, and put it at the height its
        // element says it belongs at. Everything that decides where a creature
        // may BE lives here: the world edge, the water, and the air.
        _advance(ent, delta, speed, px, pz) {
            const ts = WORLD_TILE_SIZE;
            if (!(speed > 0)) {
                // Standing still still means being at the right height.
                this._placeY(ent, delta, px, pz);
                ent.root.rotation.y = Math.atan2(Math.cos(ent.heading), Math.sin(ent.heading));
                return;
            }
            const nx = ent.x + Math.cos(ent.heading) * speed * delta;
            const nz = ent.z + Math.sin(ent.heading) * speed * delta;
            const wx = Math.floor(nx / ts), wy = Math.floor(nz / ts);
            let blocked = wx < 0 || wy < 0 || wx >= 256 || wy >= 256;

            // A creature that lives in the water may not leave it, and one that
            // does not may not enter it. The water itself answers both ways:
            // the sea, a lake and a river all read the same off the terrain, so
            // a fish is as at home in a river channel as it is out at sea.
            if (!blocked && ent.swims) {
                if (this._terrain.waterDepthAt(nx, nz) < ENEMY_WATER_MIN_D) blocked = true;
            } else if (!blocked && ent.gait !== 'swim') {
                if (getRenderType(sampleBiomeAt(wx, wy).name) === 'water') blocked = true;
            }
            if (blocked) { ent.heading += Math.PI * (0.5 + Math.random() * 0.5); ent.turnT = 1.0; return; }
            const gy = this._terrain.getTerrainHeight(nx / ts, nz / ts);
            // Only what walks is stopped by the submerged shelf: a fish belongs
            // under it and a bird passes over it.
            if (gy < -0.5 && !ent.swims && !ent.flies) { ent.heading += Math.PI; ent.turnT = 1.0; return; }
            ent.x = nx; ent.z = nz;
            this._placeY(ent, delta, px, pz);
            ent.root.rotation.y = Math.atan2(Math.cos(ent.heading), Math.sin(ent.heading));
        }

        // The height a creature holds: the ground under it, the depth it swims
        // at, or the air it flies in. Eased rather than snapped, so a rising
        // bed lifts a fish and a bird banks down into a dive instead of
        // teleporting onto the party's head.
        _placeY(ent, delta, px, pz) {
            const ts = WORLD_TILE_SIZE;
            const gy = this._terrain.getTerrainHeight(ent.x / ts, ent.z / ts);
            let want = gy;
            if (ent.swims) {
                const top = this._terrain.waterSurfaceAt(ent.x, ent.z);
                if (top != null) {
                    const bed = this._terrain.getBlockTop(ent.x, ent.z);
                    if (ent.state === 'commit' || ent.state === 'alert') {
                        const targetD = Math.max(ENEMY_WATER_MARGIN, Math.min(Math.max(ENEMY_WATER_MARGIN, top - bed - ENEMY_WATER_MARGIN), ENEMY_WATER_MARGIN * 1.5));
                        ent.swimD = ent.swimD == null ? targetD : ent.swimD + (targetD - ent.swimD) * Math.min(1, delta * 3.0);
                    }
                }
                const w = this._swimY(ent.x, ent.z, ent.swimD);
                want = w == null ? gy + ENEMY_WATER_MARGIN : w;
            } else if (ent.flies) {
                // Perched while it has nothing to do, cruising while it is
                // getting somewhere, and down on the deck while it is diving.
                const perched = ent.state === 'idle' && (ent.beh.idle === 'perch' || ent.beh.idle === 'still');
                if (perched) {
                    want = gy;
                } else if (ent.diving && px != null) {
                    want = this._terrain.getTerrainHeight(px / ts, pz / ts) + FLY_SWOOP_H;
                } else {
                    want = gy + ent.flyH;
                }
            }
            const rate = ent.flies && (ent.diving || ent.state === 'commit') ? 4.2 : 3.0;
            ent.y = ent.y == null ? want : ent.y + (want - ent.y) * Math.min(1, delta * rate);
            ent.root.position.set(ent.x, ent.y, ent.z);
        }

        // Where a creature swimming at `depth` below the surface actually sits
        // at a point, clamped so it never breaks the surface and never sinks
        // into the bed. Null where there is no water worth swimming in.
        _swimY(x, z, depth) {
            const top = this._terrain.waterSurfaceAt(x, z);
            if (top == null) return null;
            const bed = this._terrain.getBlockTop(x, z);
            if (top - bed < ENEMY_WATER_MIN_D) return null;
            return Math.max(bed + ENEMY_WATER_MARGIN,
                Math.min(top - ENEMY_WATER_MARGIN, top - (depth || 0)));
        }

        // What a blow or a shot aimed from `ox,oz` along `dx,dz` would land on:
        // the nearest living creature inside `range` whose bearing falls inside
        // the swing's own arc. Generous on purpose - this is a first-person
        // swing at a creature the size of a bear, not a rifle sight.
        aimedAt(ox, oz, dx, dz, range, halfAngle) {
            let best = null, bestD = Infinity;
            const aim = Math.atan2(dz, dx);
            for (const ent of this._ents) {
                if (!ent.alive || ent.dead || !ent.root) continue;
                const ex = ent.x - ox, ez = ent.z - oz;
                const d = Math.hypot(ex, ez);
                if (d > range || d >= bestD) continue;
                let a = Math.atan2(ez, ex) - aim;
                while (a > Math.PI)  a -= Math.PI * 2;
                while (a < -Math.PI) a += Math.PI * 2;
                if (Math.abs(a) > halfAngle) continue;
                best = ent; bestD = d;
            }
            return best;
        }

        // Keep a name plate the same size on screen however far off its owner
        // is, and take it off the screen entirely past the range at which it
        // could be read.
        _sizePlate(ent, px, pz) {
            const d = Math.hypot(ent.x - px, ent.z - pz);
            const show = d < ENEMY_PLATE_RANGE;
            if (ent.plate.visible !== show) ent.plate.visible = show;
            if (!show) return;
            const w = Math.max(ENEMY_PLATE_MIN, Math.min(ENEMY_PLATE_MAX, d * ENEMY_PLATE_K));
            const inv = ent.plateInv || 1;
            ent.plate.scale.set(w * inv, w * 0.1875 * inv, 1);
        }

        // What lives in the dark. The caves are not a world-map biome - no
        // square of the map is tagged "Cave", they run under every square there
        // is - so the roster is asked for by name off the same <Biome:> index
        // everything else uses, falling through the underground tags in order
        // of how specific they are. An alien planet's own roster still wins:
        // its caves have its animals in them.
        _caveCandidates() {
            if (this._roster) return this._roster;
            if (this._cavePool !== undefined) return this._cavePool;
            let pool = null;
            for (const name of CAVE_BIOME_TAGS) {
                const ids = this._candidatesFor(name);
                if (ids && ids.length) { pool = ids; break; }
            }
            this._cavePool = pool;
            return pool;
        }

        // ...and the roster of the brick galleries under a town, which is not
        // the roster of a limestone passage under a wood. Falls back to the
        // caves where the database names nothing.
        _sewerCandidates() {
            if (this._roster) return this._roster;
            if (this._sewerPool !== undefined) return this._sewerPool;
            let pool = null;
            for (const name of SEWER_BIOME_TAGS) {
                const ids = this._candidatesFor(name);
                if (ids && ids.length) { pool = ids; break; }
            }
            this._sewerPool = pool;
            return pool;
        }

        // Which of the two the party is actually in. A sewer is a built gallery
        // at a fixed shallow level under a town square; anything deeper, or
        // anywhere else, is a cave.
        _undergroundPool(x, z, y) {
            const field = this._terrain && this._terrain.field;
            if (field && field.sewerAt && field.sewerAt(x, z, y)) {
                const s = this._sewerCandidates();
                if (s && s.length) return s;
            }
            return this._caveCandidates();
        }

        // A creature put down in the caves: close by (a passage is not a
        // prairie), on the floor of whatever passage is at that spot, and only
        // where there IS a passage - most of the rock down there is rock.
        _trySpawnCave(vanX, vanZ) {
            const eyeY = this._underY || 0;
            const pool = this._undergroundPool(vanX, vanZ, eyeY);
            if (!pool || !pool.length) return;
            for (let attempt = 0; attempt < 8; attempt++) {
                const ang  = Math.random() * Math.PI * 2;
                const dist = CAVE_SPAWN_MIN + Math.random() * (CAVE_SPAWN_MAX - CAVE_SPAWN_MIN);
                const x = vanX + Math.cos(ang) * dist;
                const z = vanZ + Math.sin(ang) * dist;
                // The floor under the party's own level at that spot. Off the
                // bottom of the passage - or in solid rock - there is nothing
                // to stand on and nothing spawns.
                const gy = this._terrain.supportY(x, z, eyeY + CAVE_SPAWN_RISE);
                if (gy == null || !isFinite(gy)) continue;
                if (Math.abs(gy - eyeY) > CAVE_SPAWN_DROP) continue;
                // Headroom: something has to fit in the passage it is put in.
                const roof = this._terrain.roofY(x, z, gy + 1);
                if (roof != null && roof - gy < CAVE_SPAWN_HEAD) continue;
                const pick = this._pickByMode(pool);
                const data = pick != null ? $dataEnemies[pick] : null;
                if (!data) continue;
                if (enemyWaterClass(data) === 'aquatic') continue;
                const ts = WORLD_TILE_SIZE;
                if (!this._spawnAt(data, x, z, gy,
                                   Math.floor(x / ts), Math.floor(z / ts), false)) continue;
                return;
            }
        }

        _trySpawn(vanX, vanZ) {
            // Underground is a different world with a different roster: what
            // the world map says grows on the surface a hundred metres up has
            // nothing to do with what is down here in the dark.
            if (this._under) { this._trySpawnCave(vanX, vanZ); return; }
            const ts = WORLD_TILE_SIZE;
            for (let attempt = 0; attempt < 6; attempt++) {
                const ang  = Math.random() * Math.PI * 2;
                const dist = 260 + Math.random() * 700;
                const x = vanX + Math.cos(ang) * dist;
                const z = vanZ + Math.sin(ang) * dist;
                const wx = Math.floor(x / ts), wy = Math.floor(z / ts);
                if (wx < 0 || wy < 0 || wx >= 256 || wy >= 256) continue;
                const biome = sampleBiomeAt(wx, wy);
                const type  = getRenderType(biome.name);
                if (type === 'road') continue;
                // Is this spot water deep enough to live in? The open sea says
                // so, and so does a river channel or a lake cut through dry
                // land, which is what puts fish in the rivers as well as in the
                // ocean. Everything that walks is barred from it, and
                // everything that swims is barred from everywhere else.
                const wet = this._terrain.waterDepthAt(x, z) >= ENEMY_WATER_MIN_D;
                if (type === 'water' && !wet) continue;
                const ids = this._candidatesFor(biome.name);
                const wetOnly = list => (list || []).filter(id => enemyWaterClass($dataEnemies[id]) !== 'land');
                let pool;
                if (wet) {
                    // The square's own roster first. A river or a lake cut
                    // through a field has none - grassland lists no fish - so it
                    // falls back on the roster of the water itself, which is what
                    // actually puts fish in the rivers rather than only at sea.
                    pool = wetOnly(ids);
                    if (!pool.length) {
                        const kind = this._terrain.waterKindAt(x, z);
                        for (const name of (kind === 'sea' ? ['Ocean'] : ['River', 'Lake', 'Ocean'])) {
                            pool = wetOnly(this._candidatesFor(name));
                            if (pool.length) break;
                        }
                    }
                } else {
                    pool = (ids || []).filter(id => enemyWaterClass($dataEnemies[id]) !== 'aquatic');
                }
                if (!pool || !pool.length) continue;
                const pick = this._pickByMode(pool);
                const data = pick != null ? $dataEnemies[pick] : null;
                if (!data) continue;
                const gy = this._terrain.getTerrainHeight(x / ts, z / ts);
                // Dry land: never the submerged coastal shelf. In the water the
                // bed is meant to be down there, so the shelf is exactly where
                // it belongs.
                if (!wet && gy < -0.5) continue;
                if (!this._spawnAt(data, x, z, gy, wx, wy, wet)) continue;
                return;
            }
        }

        // ---------------------------------------------------------------------
        // Putting one down
        // ---------------------------------------------------------------------
        // Everything from "this species, here" to a loaded, scaled, named model
        // roaming the world. Split out of _trySpawn because there are two ways
        // in now: the surface, where the world map's own biome says what lives
        // there and how deep the water is, and the caves, where the roster and
        // the floor are both somebody else's answer (_trySpawnCave).
        //
        //   data   the enemy record
        //   x, z   where
        //   gy     the ground it stands on (the cave floor, or the terrain)
        //   wx,wy  the world square, for its persistent battle id
        //   wet    true when this is water it is to swim in
        // Returns false when nothing could be made of it.
        _spawnAt(data, x, z, gy, wx, wy, wet) {
            const key = window.Battler3D.resolveKey(data);
            if (!key) return false;
            let model = null;
            try { model = window.Battler3D.create(key, 0, 0, null); } catch (e) { model = null; }
            if (!model) return false;

            // Movement / gait from the enemy's Enemies.json metadata.
            const loco = window.Battler3D.resolveLocomotion(data);
            const moving = loco.gait !== 'idle' && loco.movement !== 'fixed';
            const moveSpeed = moving ? window.Battler3D.gaitMoveSpeed(loco.speed, loco.gait) : 0;
            const flies = loco.gait === 'fly';
            const flyH = flies
                ? FLY_CRUISE_MIN + Math.random() * (FLY_CRUISE_MAX - FLY_CRUISE_MIN) : 0;
            // In the water it swims, at its own depth: some just under the
            // surface, some well down. The party meets them by diving.
            const swims = wet;
            const swimD = swims
                ? ENEMY_WATER_MARGIN + Math.random() *
                    Math.max(1, this._terrain.waterDepthAt(x, z) - ENEMY_WATER_MARGIN * 2)
                : 0;
            const spawnY = swims ? this._swimY(x, z, swimD) : null;
            if (swims && spawnY == null) return false;
            const yaw = Math.random() * Math.PI * 2;
            const ent = {
                model, x, z, alive: true, root: null, enemyId: data.id,
                gait: loco.gait, moveSpeed, flyH, flies,
                swims, swimD, y: spawnY,
                // Its nature, and the state machine that runs it (_roam).
                beh: enemyBehavior(data),
                state: 'idle', stT: 0, memT: 0, diving: false,
                homeX: x, homeZ: z, lastX: null, lastZ: null,
                packOff: (Math.random() - 0.5) * 1.1,
                // Who this creature IS, as far as the battle system is
                // concerned: the wounds it takes, the limbs that come off it
                // and the HP it keeps when the party runs are all filed under
                // this key, the way a map enemy's are filed under its event
                // (see BattleSystemEnhanced.startPersistentBattle). It is the
                // square and the species, so the thing you wounded and ran
                // from is the thing you meet again when you come back.
                pid: 'w3d_' + wx + '_' + wy + '_' + data.id,
                name: data.name,
                level: enemyLevelOf(data),
                dead: false, corpse: null, spooked: 0,
                heading: yaw, turnT: 1 + Math.random() * 2
            };
            this._ents.push(ent);
            const baseY = swims ? spawnY : gy;
            const wantH = creatureHeight(data, ent.level);
            Promise.resolve(model.load(null, x, baseY, z)).then(() => {
                if (!ent.alive || !model.model) return;
                const root = model.model;
                // Mirror the battle scene's facing wrapper for non-bipeds.
                if (model.facingYaw && !model._facingApplied) {
                    model._facingApplied = true;
                    const inner = new THREE.Group();
                    inner.rotation.y = model.facingYaw;
                    for (const k of root.children.slice()) inner.add(k);
                    root.add(inner);
                }
                // How big it actually is. A battle model is normalised to
                // fit the battle view - about five units on its LONGEST
                // axis - so a long low animal comes out of that ankle-high
                // and a tall thin one comes out right, which is why the
                // world was full of knee-high monsters. Measure what was
                // loaded and scale it to the height this creature is meant
                // to stand, rather than multiplying by a number and hoping.
                //
                // Measured as loaded, and only ever MULTIPLIED: the scale
                // the model came with is not uniform - it carries the whole
                // species' proportions (shapeXYZ) - so writing over it would
                // make every creature in the world the same shape.
                let scale = 3.6;
                let footOff = 0;
                try {
                    root.updateMatrixWorld(true);
                    const box = new THREE.Box3().setFromObject(root);
                    const hy = box.max.y - box.min.y;
                    if (hy > 0.01) scale = wantH / hy;
                    footOff = (box.min.y - root.position.y) * scale;
                } catch (e) { /* nothing measurable: the old fixed guess */ }
                root.scale.multiplyScalar(scale);
                root.position.set(x, baseY + flyH, z);
                root.rotation.y = yaw;
                // ...and stood ON the ground rather than through it: a model
                // whose origin is not at its feet sinks by however far the
                // difference is, and that difference just got scaled up too.
                if (!swims && !flies && isFinite(footOff)) root.position.y -= footOff;
                if (window.PSXShader && window.PSXShader.applyToObject) {
                    window.PSXShader.applyToObject(root);
                }
                root.traverse(o => { if (o.isMesh) o.castShadow = true; });
                // Its name and level, floating just over its head. The plate
                // hangs off the model, which is scaled, so everything about it
                // is divided back out of that scale to keep it in world units.
                try {
                    const box = new THREE.Box3().setFromObject(root);
                    const top = Math.max(8, Math.min(100, box.max.y - root.position.y));
                    const plate = makeEnemyPlate(ent.name, ent.level);
                    const inv = 1 / (scale || 1);
                    plate.position.set(0, (top + 2) * inv, 0);
                    plate.scale.set(24 * inv, 24 * 0.1875 * inv, 1);
                    root.add(plate);
                    ent.plate = plate;
                    ent.plateInv = inv;
                } catch (e) { /* a model with no measurable box wears no plate */ }
                this._scene.add(root);
                try {
                    if (loco.gait === 'idle') { model.playIdleAnimation(); }
                    else { model.setGaitSpeed(loco.speed); model.playGait(loco.gait); }
                } catch (e) { /* some families auto-idle */ }
                ent.root = root;
            }).catch(() => { ent.alive = false; });
            return true;
        }


        _remove(i) {
            const ent = this._ents[i];
            ent.alive = false;
            if (ent.root) {
                this._scene.remove(ent.root);
                ent.root.traverse(o => {
                    if (o.geometry) o.geometry.dispose();
                    if (o.material) {
                        const mats = Array.isArray(o.material) ? o.material : [o.material];
                        for (const m of mats) m.dispose();   // textures stay cached
                    }
                });
            } else if (ent.model && typeof ent.model.dispose === 'function') {
                try { ent.model.dispose(); } catch (e) { /* ignore */ }
            }
            this._ents.splice(i, 1);
        }

        dispose() {
            for (let i = this._ents.length - 1; i >= 0; i--) this._remove(i);
        }
    }

    // enemy id -> a troop holding that one creature, same reading BolognaMapSystem
    // uses for its own walked-into street/canal fauna ("troop N holds enemy N"
    // for most of the table but not all of it, so it is read rather than assumed).
    let _bioTroopByEnemy = null;

    function bioBuildTroopIndex() {
        const index = {};
        for (let i = 1; i < $dataTroops.length; i++) {
            const troop = $dataTroops[i];
            if (!troop || !troop.members || troop.members.length !== 1) continue;
            if (troop._bseReinforced || troop._bsePetrodemon) continue;
            const id = troop.members[0].enemyId;
            if (index[id] === undefined || i === id) index[id] = i;
        }
        _bioTroopByEnemy = index;
    }

    function bioTroopHoldsEnemy(troopId, enemyId) {
        const troop = troopId ? $dataTroops[troopId] : null;
        return !!(troop && troop.members && troop.members[0] &&
            troop.members[0].enemyId === enemyId);
    }

    function troopForBioEnemy(enemyId) {
        if (!_bioTroopByEnemy) bioBuildTroopIndex();
        let troopId = _bioTroopByEnemy[enemyId] || 0;
        // A scratch slot (a reinforced troop, a petrodemon) is written over an
        // existing one at runtime, so a cached answer is checked against the
        // live table and the index rebuilt rather than trusted for the session.
        if (!bioTroopHoldsEnemy(troopId, enemyId)) {
            bioBuildTroopIndex();
            troopId = _bioTroopByEnemy[enemyId] || 0;
            if (!bioTroopHoldsEnemy(troopId, enemyId)) return 0;
        }
        return troopId;
    }

    // =========================================================================
    // CityCrowd
    // =========================================================================
    // The people of a town, walking its pavements. Every citizen is drawn off
    // the game's own NPC sheets and is a real person while they are on screen:
    // their name and face come from NPCSystem's seeded persona generator, so the
    // same square always holds the same people, and stepping up to one opens the
    // same conversation and the same Empathize panel the 2D world gives.
    class CityCrowd {
        constructor(scene, terrain) {
            this._scene   = scene;
            this._terrain = terrain;
            this._tiles   = new Map();     // 'wx,wy' -> { peds: [] }
            this._df      = 1;
        }

        // Is this square a town at all, and is it a city or a village?
        static settlementKind(wx, wy) { return settlementKindAt(wx, wy); }

        update(delta, px, pz, camYaw, df) {
            this._df = df == null ? 1 : df;
            const ts = WORLD_TILE_SIZE;
            const ptx = Math.floor(px / ts), pty = Math.floor(pz / ts);

            // Only the square underfoot and the ring around it are populated:
            // people further off than that are never seen and never simulated.
            const want = new Set();
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const wx = ptx + dx, wy = pty + dy;
                    if (wx < 0 || wy < 0 || wx > 255 || wy > 255) continue;
                    const kind = CityCrowd.settlementKind(wx, wy);
                    if (!kind) continue;
                    const key = wx + ',' + wy;
                    want.add(key);
                    if (!this._tiles.has(key)) this._tiles.set(key, this._populate(wx, wy, kind === 'city'));
                }
            }
            for (const [key, tile] of this._tiles) {
                if (want.has(key)) continue;
                for (const ped of tile.peds) ped.bb.dispose();
                this._tiles.delete(key);
            }

            for (const tile of this._tiles.values()) {
                for (const ped of tile.peds) this._walk(ped, tile, delta, px, pz, camYaw);
            }
        }

        _populate(wx, wy, big) {
            const ts   = WORLD_TILE_SIZE;
            const plan = planSettlement(wx, wy, big, ts);
            const originX = wx * ts + ts * 0.5;
            const originZ = wy * ts + ts * 0.5;
            const baseY   = this._terrain.getTerrainHeight(wx + 0.5, wy + 0.5) + plan.paveH;
            const tile    = { wx, wy, big, plan, originX, originZ, baseY, ts, peds: [] };

            const count = big ? 14 : 6;
            for (let i = 0; i < count; i++) {
                const ped = this._makePed(tile, i);
                if (ped) { tile.peds.push(ped); this._scene.add(ped.bb.mesh); }
            }
            return tile;
        }

        // One citizen: a seeded persona (the same person every time this square
        // is walked into) put down on one of the town's pavements.
        _makePed(tile, i) {
            const seed = (((tile.wx * 73856093) ^ (tile.wy * 19349663) ^ ((i + 1) * 83492791)) >>> 0) || 1;
            const persona = (window.NPCSystem && window.NPCSystem.generateSeededPersona)
                ? window.NPCSystem.generateSeededPersona(seed) : null;
            if (!persona || !persona.spriteName) return null;

            const lanes = tile.plan.lanes;
            const lane  = lanes[Math.floor(settleRnd(tile.wx, tile.wy, 3100 + i) * lanes.length) % lanes.length];
            const along = (settleRnd(tile.wx, tile.wy, 3200 + i) - 0.5) * tile.ts * 0.9;
            const bb = new CharacterBillboard(persona.spriteName, persona.charIdx, PERSON_H);
            return {
                bb,
                name: persona.name,
                sheet: persona.spriteName,
                charIdx: persona.charIdx,
                wx: tile.wx, wy: tile.wy,
                lane, along,
                dir: settleRnd(tile.wx, tile.wy, 3300 + i) < 0.5 ? -1 : 1,
                speed: 11 + settleRnd(tile.wx, tile.wy, 3400 + i) * 7,
                pause: settleRnd(tile.wx, tile.wy, 3500 + i) * 6,
                x: 0, z: 0
            };
        }

        _walk(ped, tile, delta, px, pz, camYaw) {
            const ts = tile.ts, half = ts * 0.5;
            let moving = true;
            if (ped.pause > 0) {
                ped.pause -= delta;
                moving = false;
            } else {
                ped.along += ped.dir * ped.speed * delta;
                // The pavement runs the width of the square; at the far end they
                // turn round rather than walking off into the fields.
                if (ped.along > half - 12) { ped.along = half - 12; ped.dir = -1; }
                if (ped.along < -half + 12) { ped.along = -half + 12; ped.dir = 1; }
                // At a corner they sometimes turn down the crossing street.
                const cross = tile.plan.lanes;
                for (const l of cross) {
                    if (l.axis === ped.lane.axis) continue;
                    if (Math.abs(ped.along - l.c) > 2.5) continue;
                    if (Math.random() < 0.02) {
                        const keep = ped.lane.c;
                        ped.lane = l;
                        ped.along = keep;
                        ped.dir = Math.random() < 0.5 ? -1 : 1;
                    }
                    break;
                }
                if (Math.random() < 0.0025) ped.pause = 1.5 + Math.random() * 4;
                ped.bb.step += ped.speed * delta;
            }

            const lx = ped.lane.axis === 'h' ? ped.along : ped.lane.c;
            const lz = ped.lane.axis === 'h' ? ped.lane.c : ped.along;
            ped.x = tile.originX + lx;
            ped.z = tile.originZ + lz;
            ped.bb.yaw = ped.lane.axis === 'h'
                ? (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2)
                : (ped.dir > 0 ? 0 : Math.PI);
            ped.bb.moving = moving;
            ped.bb.setPosition(ped.x, tile.baseY, ped.z);
            ped.bb.setDaylight(this._df);
            ped.bb.update(px, pz, camYaw);
        }

        // The citizen closest to a point, within `maxD` world units.
        nearest(x, z, maxD) {
            let best = null, bestD = maxD * maxD;
            for (const tile of this._tiles.values()) {
                for (const ped of tile.peds) {
                    const dx = ped.x - x, dz = ped.z - z;
                    const d = dx * dx + dz * dz;
                    if (d < bestD) { bestD = d; best = ped; }
                }
            }
            return best;
        }

        // The person behind the sprite: minted on demand (nobody is written into
        // the save just for walking past) and anchored to this square's own
        // settlement, the same "Proc:x,y" the procedural map uses, so the whole
        // simulation treats them as a resident of the place they live in.
        static ensureProfile(ped) {
            const reg = window.NPCSocietyRegistry;
            if (!reg || !ped) return null;
            const group = 'Proc:' + ped.wx + ',' + ped.wy;   // i18n-ignore  settlement key
            try {
                return reg.ensureProfile(ped.name, null, group, WORLD_MAP_ID) || reg.getProfile(ped.name);
            } catch (e) {
                return reg.getProfile ? reg.getProfile(ped.name) : null;
            }
        }

        dispose() {
            for (const tile of this._tiles.values()) {
                for (const ped of tile.peds) ped.bb.dispose();
            }
            this._tiles.clear();
        }
    }


    // The interiors that are standing right now. One building's inside is built
    // when the party comes within reach of its door and taken down again when
    // they leave, so a city street costs nothing until somebody walks into one
    // of its houses.
    class BuildingInteriors {
        constructor(scene, terrain) {
            this._scene   = terrain && terrain._scene ? terrain._scene : scene;
            this._terrain = terrain;
            this._live    = new Map();     // 'tx,tz#lot' -> record
            this._budget  = 2;             // interiors built per frame
        }

        get decorator() { return this._terrain ? this._terrain._decorator : null; }

        update(px, pz) {
            const ts = WORLD_TILE_SIZE;
            const ptx = Math.floor(px / ts), ptz = Math.floor(pz / ts);
            const want = new Set();
            let built = 0;

            for (let dx = -1; dx <= 1; dx++) {
                for (let dz = -1; dz <= 1; dz++) {
                    const tx = ptx + dx, tz = ptz + dz;
                    if (tx < 0 || tz < 0 || tx > 255 || tz > 255) continue;
                    const plan = planForTile(tx, tz);
                    if (!plan || !plan.lots.length) continue;
                    const ox = tx * ts + ts * 0.5, oz = tz * ts + ts * 0.5;
                    for (let i = 0; i < plan.lots.length; i++) {
                        const lot = plan.lots[i];
                        const wx = ox + lot.x, wz = oz + lot.z;
                        const d = Math.hypot(wx - px, wz - pz);
                        const key = tx + ',' + tz + '#' + i;
                        const live = this._live.get(key);
                        if (d <= INTERIOR_NEAR) {
                            want.add(key);
                            if (!live && built < this._budget) {
                                this._live.set(key, this._build(tx, tz, plan, i, ox, oz));
                                built++;
                            }
                        } else if (live && d > INTERIOR_FAR) {
                            this._free(key);
                        }
                    }
                }
            }
            // Anything left standing on a square nobody is near any more.
            for (const key of [...this._live.keys()]) {
                if (!want.has(key) && !this._nearEnough(key, px, pz)) this._free(key);
            }
        }

        _nearEnough(key, px, pz) {
            const rec = this._live.get(key);
            if (!rec) return false;
            return Math.hypot(rec.wx - px, rec.wz - pz) <= INTERIOR_FAR;
        }

        // Turn every shopkeeper to face whoever is looking at them, and light
        // them by the hour. Cheap: there are only ever a handful standing in the
        // buildings near enough to have been built at all.
        tickKeepers(camX, camZ, camYaw, dayFactor) {
            for (const rec of this._live.values()) {
                if (!rec.keepers) continue;
                for (const k of rec.keepers) {
                    k.bb.update(camX, camZ, camYaw);
                    if (k.bb.setDayFactor) k.bb.setDayFactor(dayFactor);
                }
            }
        }

        // The shopkeeper nearest a point, within `maxD` world units and on
        // roughly the same floor: a counter on the third storey is not something
        // you can talk to from the street.
        nearestKeeper(x, y, z, maxD) {
            let best = null, bestD = maxD * maxD;
            for (const rec of this._live.values()) {
                if (!rec.keepers) continue;
                for (const k of rec.keepers) {
                    if (Math.abs(k.y - y) > 14) continue;
                    const dx = k.x - x, dz = k.z - z;
                    const d = dx * dx + dz * dz;
                    if (d < bestD) { bestD = d; best = k; }
                }
            }
            return best;
        }

        _free(key) {
            const rec = this._live.get(key);
            if (!rec) return;
            this._scene.remove(rec.group);
            // The shapes and the materials belong to the decorator and are
            // shared with every other building in the world; only this
            // interior's own instance buffers are freed with it.
            rec.group.traverse(o => { if (o.isInstancedMesh && o.dispose) o.dispose(); });
            this._live.delete(key);
        }

        // Put up one building's inside: the floors, the walls between the rooms,
        // the flights of stairs and whatever furniture is still in it.
        _build(tx, tz, plan, index, ox, oz) {
            const lot  = plan.lots[index];
            const dec  = this.decorator;
            // Furniture that is drawn as a picture rather than built out of
            // boxes, gathered for the whole building (see the loop below).
            const sprites = [];
            const base = planBaseY(plan, tx, tz, (gx, gz) => this._terrain.getTerrainHeight(gx, gz));
            const inner = planInterior(lot, tx, tz, index);
            const group = new THREE.Group();
            group.position.set(ox + lot.x, base, oz + lot.z);
            const ruined = !!lot.ruined;

            if (dec) {
                const B = new SettlementBatch(dec);
                const floorMat = ruined ? dec._matSoil() : dec._matFloor();
                const wallMat  = ruined ? dec._matRuinPlaster() : dec._matPlaster();
                for (const s of inner.slabs) {
                    B.add('uBox', floorMat, s.x, s.y - 0.6, s.z, s.w, 0.6, s.d, 0);
                }
                for (const w of inner.walls) {
                    B.add('uBox', wallMat, w.x, w.y, w.z, w.w, w.h, w.d, 0);
                }
                for (const st of inner.stairs) {
                    // Drawn as a flight of steps; walked as the ramp underneath
                    // it (see floorAt), which is what keeps the climb smooth.
                    const steps = 9;
                    const rise = (st.y1 - st.y0) / steps;
                    const run  = st.d / steps;
                    for (let i = 0; i < steps; i++) {
                        B.add('uBox', wallMat,
                            st.x, st.y0 + rise * i,
                            st.z + st.dir * (-st.d / 2 + run * (i + 0.5)),
                            st.w, rise + 0.4, run, 0);
                    }
                }
                for (const f of inner.furniture) {
                    // A piece with a picture is drawn as that picture, standing
                    // on the floor; one without is built out of boxes the way it
                    // always was. Collected here and emitted a folder at a time
                    // below, so a furnished house is a handful of draws.
                    if (f.sprite) sprites.push(f);
                    else this._addFurniture(B, dec, f, ruined);
                }
                B.flush(group);
            }

            this._emitFurnitureSprites(group, dec, sprites);
            const keepers = this._emitKeepers(group, inner, base, ox + lot.x, oz + lot.z);

            this._scene.add(group);
            return {
                group, inner, lot, base, index, keepers,
                wx: ox + lot.x, wz: oz + lot.z,
                tile: tx + ',' + tz
            };
        }

        // One instanced mesh per folder for the whole building: a house with a
        // kitchen, two bedrooms and a parlour is four or five draws, not thirty.
        // The pieces are billboards, exactly as the trees and the signs outside
        // are, so they turn to face whoever walks in.
        _emitFurnitureSprites(group, dec, list) {
            if (!list.length) return;
            const buckets = new Map();
            for (const f of list) {
                const k = f.sprite.folder + '/' + f.sprite.name;
                let arr = buckets.get(k);
                if (!arr) { arr = []; buckets.set(k, arr); }
                arr.push(f);
            }
            const dummy = new THREE.Object3D();
            for (const [key, items] of buckets) {
                const slash = key.indexOf('/');
                const folder = key.slice(0, slash), name = key.slice(slash + 1);
                const mat = dec._billboardMat(folder, name);
                const im = new THREE.InstancedMesh(dec.spriteQuads.plant, mat, items.length);
                im.castShadow = false;
                im.receiveShadow = false;
                im.frustumCulled = false;
                for (let i = 0; i < items.length; i++) {
                    const f = items[i];
                    // Anchored on the floor: the quad's own origin is its middle,
                    // so it is lifted half its height to stand rather than sink.
                    const size = f.sprite.size || 11;
                    dummy.position.set(f.x, f.y + size * 0.5, f.z);
                    dummy.quaternion.set(0, 0, 0, 1);
                    dummy.scale.setScalar(size);
                    dummy.updateMatrix();
                    im.setMatrixAt(i, dummy.matrix);
                }
                group.add(im);
            }
        }

        // The people minding the shops: one walk-sheet card each, standing where
        // the plan put them, facing into the room. They never move - a shopkeeper
        // is behind their counter - so they are put up once with the building and
        // taken down with it.
        _emitKeepers(group, inner, base, worldX, worldZ) {
            const out = [];
            if (!inner.keepers || !inner.keepers.length) return out;
            for (const k of inner.keepers) {
                const persona = (window.NPCSystem && window.NPCSystem.generateSeededPersona)
                    ? window.NPCSystem.generateSeededPersona(k.seed) : null;
                if (!persona || !persona.spriteName) continue;
                const bb = new CharacterBillboard(persona.spriteName, persona.charIdx, PERSON_H);
                const y = base + k.y;
                bb.setPosition(worldX + k.x, y, worldZ + k.z);
                bb.moving = false;              // a shopkeeper is behind their counter
                group.add(bb.mesh);
                out.push({
                    bb, name: persona.name, shopType: k.shopType,
                    x: worldX + k.x, y, z: worldZ + k.z, floor: k.floor
                });
            }
            return out;
        }

        _addFurniture(B, dec, f, ruined) {
            const wood  = ruined ? dec._matSoil() : dec._matWood();
            const cloth = dec._mat(ruined ? '#6a6255' : '#9c7f5f');
            const metal = dec._matMetal();
            const stone = dec._matStone();
            const y = f.y;
            const rot = f.rot + (f.fallen ? 0.3 : 0);
            switch (f.kind) {
                case 'table':
                    B.add('uBox', wood, f.x, y + (f.fallen ? 0 : 5), f.z, 14, 1.2, 9, rot);
                    if (!f.fallen) for (const [sx, sz] of [[-6, -3.5], [6, -3.5], [-6, 3.5], [6, 3.5]]) {
                        B.add('uBox', wood, f.x + sx, y, f.z + sz, 1, 5, 1, rot);
                    }
                    break;
                case 'desk':
                    B.add('uBox', wood, f.x, y + (f.fallen ? 0 : 6), f.z, 16, 1.3, 8, rot);
                    if (!f.fallen) {
                        B.add('uBox', wood, f.x - 5.5, y, f.z, 4, 6, 7, rot);   // the drawers
                        B.add('uBox', wood, f.x + 7, y, f.z, 1, 6, 7, rot);
                    }
                    break;
                case 'bed':
                    B.add('uBox', wood, f.x, y, f.z, 11, 2.6, 20, rot);
                    B.add('uBox', cloth, f.x, y + 2.6, f.z, 10.4, 1.6, 19, rot);
                    if (!f.fallen) B.add('uBox', dec._matPaint(), f.x, y + 4.2, f.z - 7.5, 9, 1.2, 4, rot);
                    break;
                case 'wardrobe':
                    B.add('uBox', wood, f.x, y, f.z, 13, f.fallen ? 6 : 19, 7, rot);
                    if (!f.fallen) B.add('uBox', metal, f.x, y + 10, f.z + 3.6, 1, 1, 0.6, rot);
                    break;
                case 'shelf':
                    B.add('uBox', wood, f.x, y, f.z, 12, f.fallen ? 3 : 15, 4, rot);
                    if (!f.fallen) for (const sy of [5, 10]) {
                        B.add('uBox', wood, f.x, y + sy, f.z, 11.4, 0.6, 4.4, rot);
                    }
                    break;
                case 'crate':
                    B.add('uBox', wood, f.x, y, f.z, 7, 7, 7, rot);
                    break;
                case 'barrel':
                    B.add('uCyl', wood, f.x, y, f.z, 4, f.fallen ? 4 : 9, 4, rot);
                    if (!f.fallen) B.add('uCyl', metal, f.x, y + 4, f.z, 4.2, 0.7, 4.2, rot);
                    break;
                case 'chair':
                    B.add('uBox', wood, f.x, y, f.z, 5, f.fallen ? 2 : 4, 5, rot);
                    if (!f.fallen) B.add('uBox', wood, f.x, y + 4, f.z - 2, 5, 6, 1, rot);
                    break;
                case 'bench':
                    B.add('uBox', wood, f.x, y + (f.fallen ? 0 : 3), f.z, 16, 1.4, 5, rot);
                    if (!f.fallen) for (const sx of [-6.5, 6.5]) {
                        B.add('uBox', wood, f.x + sx, y, f.z, 1.2, 3, 4.4, rot);
                    }
                    break;
                case 'pew':
                    B.add('uBox', wood, f.x, y + (f.fallen ? 0 : 3.4), f.z, 26, 1.4, 5, rot);
                    if (!f.fallen) {
                        B.add('uBox', wood, f.x, y + 4.8, f.z - 2.2, 26, 6, 1, rot);
                        for (const sx of [-11, 11]) B.add('uBox', wood, f.x + sx, y, f.z, 1.4, 3.4, 4.6, rot);
                    }
                    break;
                case 'altar':
                    B.add('uBox', stone, f.x, y, f.z, 18, 8, 9, rot);
                    B.add('uBox', cloth, f.x, y + 8, f.z, 19, 0.5, 10, rot);
                    break;
                case 'stove':
                    B.add('uBox', metal, f.x, y, f.z, 12, 9, 9, rot);
                    B.add('uBox', dec._mat('#3a3a40'), f.x, y + 9, f.z, 12.4, 0.8, 9.4, rot);
                    if (!f.fallen) B.add('uCyl', metal, f.x, y + 9.8, f.z - 3, 1.6, 12, 1.6, 0);
                    break;
                case 'sink':
                    B.add('uBox', stone, f.x, y, f.z, 11, 7, 8, rot);
                    B.add('uBox', dec._matPaint(), f.x, y + 7, f.z, 11.4, 1.2, 8.4, rot);
                    break;
                case 'counter':
                    B.add('uBox', wood, f.x, y, f.z, 17, 7.5, 8, rot);
                    B.add('uBox', stone, f.x, y + 7.5, f.z, 18, 1, 9, rot);
                    break;
                case 'machine':
                    B.add('uBox', metal, f.x, y, f.z, 18, 13, 9, rot);
                    B.add('uCyl', dec._mat('#5a5f68'), f.x + 5, y + 13, f.z, 3, 7, 3, 0);
                    if (!f.fallen) B.add('uBox', dec._matGlass(), f.x - 4, y + 8, f.z + 4.6, 6, 4, 0.5, rot);
                    break;
                case 'hay':
                    B.add('uBox', dec._matHay(), f.x, y, f.z, 14, 8, 10, rot);
                    if (!f.fallen) B.add('uBox', dec._matHay(), f.x, y + 8, f.z, 11, 7, 8, rot + 0.4);
                    break;
                case 'rug':
                    B.add('uBox', cloth, f.x, y + 0.05, f.z, 22, 0.25, 16, rot);
                    break;
                default:
                    B.add('uBox', metal, f.x, y, f.z, 16, 8, 6, rot);
                    break;
            }
        }

        // The floor under a pair of feet: the highest slab (or step of a flight)
        // at or just below them, inside a building whose inside is standing.
        // Null anywhere else, which is the world's own ground.
        floorAt(x, z, feetY) {
            let best = null;
            for (const rec of this._live.values()) {
                const lx = x - rec.wx, lz = z - rec.wz;
                const inner = rec.inner;
                if (Math.abs(lx) > inner.iw / 2 || Math.abs(lz) > inner.id / 2) continue;
                // The flight first: standing on the stairs beats the floor the
                // shaft is cut out of. A flight only counts when it is under
                // your feet rather than over your head: the flights of a
                // switchback share one shaft, so the one above is always within
                // a stride of the one you are climbing, and taking it would
                // teleport you up through its underside.
                for (const st of inner.stairs) {
                    if (Math.abs(lx - st.x) > st.w / 2 || Math.abs(lz - st.z) > st.d / 2) continue;
                    const t = Math.max(0, Math.min(1,
                        (st.dir > 0 ? (lz - (st.z - st.d / 2)) : ((st.z + st.d / 2) - lz)) / st.d));
                    const h = rec.base + st.y0 + (st.y1 - st.y0) * t;
                    if (Math.abs(h - feetY) <= STAIR_REACH && (best === null || h > best)) best = h;
                }
                for (const s of inner.slabs) {
                    if (Math.abs(lx - s.x) > s.w / 2 || Math.abs(lz - s.z) > s.d / 2) continue;
                    const h = rec.base + s.y;
                    if (h <= feetY + STEP_UP && (best === null || h > best)) best = h;
                }
            }
            return best;
        }

        // The underside of the floor above, so a jump indoors meets the ceiling
        // instead of going through it.
        ceilAt(x, z, feetY) {
            let best = null;
            for (const rec of this._live.values()) {
                const lx = x - rec.wx, lz = z - rec.wz;
                const inner = rec.inner;
                if (Math.abs(lx) > inner.iw / 2 || Math.abs(lz) > inner.id / 2) continue;
                for (const s of inner.slabs) {
                    if (Math.abs(lx - s.x) > s.w / 2 || Math.abs(lz - s.z) > s.d / 2) continue;
                    const h = rec.base + s.y - 0.6;
                    if (h > feetY + 1 && (best === null || h < best)) best = h;
                }
                // The roof over the top floor counts as a ceiling as well.
                const roof = rec.base + inner.roofY;
                if (roof > feetY + 1 && (best === null || roof < best)) best = roof;
            }
            return best;
        }

        // Which lots on a square have their inside standing: those are walked
        // into through their door rather than bumped into as a block.
        liveLots(tileKey) {
            let set = null;
            for (const rec of this._live.values()) {
                if (rec.tile !== tileKey) continue;
                if (!set) set = new Set();
                set.add(rec.index);
            }
            return set;
        }

        // The walls of every standing interior on a square, in world coordinates.
        wallRects(tileKey, out) {
            for (const rec of this._live.values()) {
                if (rec.tile !== tileKey) continue;
                for (const w of rec.inner.walls) {
                    out.push({ x: rec.wx + w.x, z: rec.wz + w.z, w: w.w, d: w.d, over: !!w.over });
                }
            }
            return out;
        }

        dispose() {
            for (const key of [...this._live.keys()]) this._free(key);
        }
    }

    // =========================================================================
    // FollowerCrowd
    // =========================================================================
    // The party (and the pet) walking behind the leader in the 3D world, drawn
    // with the same sprites they have on the map. They follow a breadcrumb trail
    // of where the leader has actually been, so they file along a pavement
    // instead of sliding through the buildings on either side.
    class FollowerCrowd {
        constructor(scene) {
            this._scene = scene;
            this._members = [];
            this._trail = [];      // [{x,y,z,d}] newest first, d = distance back
            this._sig = '';
            this._skipId = 0;      // the member a second player is walking, if any
        }

        // One of the party is not following anybody: a second player is walking
        // them. Pass their actor id to take them out of the line; 0 puts the
        // line back the way it was.
        setSkipActor(actorId) {
            const id = actorId || 0;
            if (id === this._skipId) return;
            this._skipId = id;
            this._sig = '';       // force the rebuild below
            this.refresh();
        }

        // Rebuild the line whenever the party or the pet changes.
        refresh(vehicleKey = null) {
            const wanted = [];
            const isBike = vehicleKey === 'bike';
            const isBroom = vehicleKey === 'broom';
            const isMagical = window.VehicleSystem && window.VehicleSystem.isMagicalLeader
                ? window.VehicleSystem.isMagicalLeader() : false;
            const broomSheet = isMagical ? 'Vehicles/!$BroomStickRidingArcane' : 'Vehicles/!$BroomStickRiding';

            if (typeof $gameParty !== 'undefined' && $gameParty.members) {
                const mem = $gameParty.members();
                for (let i = 1; i < mem.length && i < 4; i++) {
                    const a = mem[i];
                    if (!a || !a.characterName || !a.characterName()) continue;
                    if (this._skipId && a.actorId && a.actorId() === this._skipId) continue;
                    if (isBike) {
                        wanted.push({ sheet: 'Vehicles/!$BikeRiding', index: 0 });
                    } else if (isBroom) {
                        wanted.push({ sheet: broomSheet, index: 0 });
                    } else {
                        wanted.push({ sheet: a.characterName(), index: a.characterIndex() });
                    }
                }
            }
            const pet = window.PetSystem && window.PetSystem.getActivePet
                ? window.PetSystem.getActivePet() : null;
            if (pet && pet.characterName) {
                wanted.push({ sheet: pet.characterName, index: pet.characterIndex || 0 });
            }
            const sig = wanted.map(w => w.sheet + '#' + w.index).join('|');
            if (sig === this._sig) return;
            this._sig = sig;
            for (const m of this._members) m.bb.dispose();
            this._members = wanted.map((w) => ({
                bb: new CharacterBillboard(w.sheet, w.index, PERSON_H),
                x: 0, y: 0, z: 0
            }));
            for (const m of this._members) this._scene.add(m.bb.mesh);
        }

        setVisible(on) {
            for (const m of this._members) m.bb.mesh.visible = on && m.bb._sized;
            if (!on) this._trail.length = 0;
        }

        // How many of them there are, so the caller knows how many seats it has
        // to find (the pet is one of them).
        count() { return this._members.length; }

        // ---------------------------------------------------------------------
        // Riding
        // ---------------------------------------------------------------------
        // Sat in a vehicle rather than walking behind one. `seats` are places in
        // the world, already turned into the vehicle's own heading by whoever
        // worked them out; each member takes one and faces the way it is going.
        // Anybody with no seat is simply not drawn - a two-seat car with a party
        // of four leaves two of them out of sight rather than hanging off it.
        ride(seats, yaw, camYaw, camX, camZ, df) {
            this._trail.length = 0;
            for (let i = 0; i < this._members.length; i++) {
                const m = this._members[i];
                const seat = seats[i];
                if (!seat) { m.bb.mesh.visible = false; continue; }
                m.x = seat.x; m.z = seat.z;
                m.bb.yaw = yaw;
                m.bb.moving = false;        // sitting still, however fast it goes
                m.bb.setPosition(seat.x, seat.y, seat.z);
                m.bb.setDaylight(df == null ? 1 : df);
                m.bb.update(camX, camZ, camYaw);
            }
        }

        // `lead` is where the player is standing this frame.
        update(delta, lx, ly, lz, camYaw, df, groundFn) {
            if (!this._members.length) return;
            // Breadcrumbs: drop a marker whenever the leader has walked enough to
            // matter (0.6 units), and throw old ones away when they are too far
            // back for any member to reach.
            const FOLLOWER_GAP = 13;
            const head = this._trail[0];
            if (!head || Math.hypot(lx - head.x, lz - head.z) >= 0.6) {
                this._trail.unshift({ x: lx, y: ly, z: lz, d: 0 });
                let acc = 0;
                for (let i = 1; i < this._trail.length; i++) {
                    const prev = this._trail[i - 1];
                    const curr = this._trail[i];
                    acc += Math.hypot(curr.x - prev.x, curr.z - prev.z);
                    curr.d = acc;
                }
                const maxD = (this._members.length + 1) * FOLLOWER_GAP + 2;
                while (this._trail.length > 2 && this._trail[this._trail.length - 1].d > maxD) {
                    this._trail.pop();
                }
            }
            for (let i = 0; i < this._members.length; i++) {
                const m = this._members[i];
                const wantD = (i + 1) * FOLLOWER_GAP;
                const pos = this._sampleTrail(wantD);
                if (pos) {
                    const gy = groundFn ? groundFn(pos.x, pos.z) : ly;
                    m.x = pos.x; m.y = gy; m.z = pos.z;
                    m.bb.yaw = pos.yaw;
                    m.bb.moving = pos.moving;
                    m.bb.setPosition(pos.x, gy, pos.z);
                    m.bb.setDaylight(df == null ? 1 : df);
                    m.bb.update(lx, lz, camYaw);
                }
            }
        }

        _sampleTrail(targetD) {
            if (!this._trail.length) return null;
            if (this._trail.length === 1 || targetD <= 0) {
                return { x: this._trail[0].x, z: this._trail[0].z, yaw: 0, moving: false };
            }
            for (let i = 0; i < this._trail.length - 1; i++) {
                const a = this._trail[i];
                const b = this._trail[i + 1];
                if (a.d <= targetD && b.d >= targetD) {
                    const span = (b.d - a.d) || 0.001;
                    const t = (targetD - a.d) / span;
                    const x = a.x + (b.x - a.x) * t;
                    const z = a.z + (b.z - a.z) * t;
                    const yaw = Math.atan2(a.x - b.x, a.z - b.z);
                    return { x, z, yaw, moving: true };
                }
            }
            const last = this._trail[this._trail.length - 1];
            return { x: last.x, z: last.z, yaw: 0, moving: false };
        }

        dispose() {
            for (const m of this._members) {
                this._scene.remove(m.bb.mesh);
                m.bb.dispose();
            }
            this._members.length = 0;
            this._trail.length = 0;
        }
    }

    // =========================================================================
    // ParkedVehicles
    //
    // Everything the party owns and is not currently driving, standing on the
    // world square they left it on. One record answers for both maps
    // (window.VehiclePosition, which keeps world coordinates for every vehicle),
    // so a car left outside Ghent is outside Ghent whether the party comes back
    // to it on the 2D map or drives up to it out here.
    //
    // Models come out of the garage (window.VehicleModels), scaled to true size
    // against a person, and are built and thrown away by distance the way the
    // wildlife is: only what is near enough to see is ever in the scene.
    // =========================================================================
    const PARKED_RANGE   = 1400;   // world units: built inside this, dropped outside it
    const PARKED_INT     = 1.1;    // seconds between sweeps of the park records

    class ParkedVehicles {
        constructor(scene, terrain) {
            this._scene   = scene;
            this._terrain = terrain;
            this._live    = new Map();   // key -> { model, group }
            this._timer   = PARKED_INT;
            // The one being driven is not parked anywhere: it is under the party.
            this._driving = null;
        }

        // Which vehicle the party is aboard, so it is not drawn twice.
        setDriving(key) { this._driving = key || null; }

        // The nearest vehicle standing within reach of a point, or null. What
        // pressing E on foot asks before it decides there is nothing out here
        // to get into (see the scene's _boardParked).
        nearest(x, z, range) {
            let best = null, bestD = range * range;
            for (const [key, rec] of this._live) {
                const dx = rec.x - x, dz = rec.z - z;
                const d = dx * dx + dz * dz;
                if (d < bestD) { best = { key, x: rec.x, z: rec.z }; bestD = d; }
            }
            return best;
        }

        update(delta, atX, atZ, camYaw = 0) {
            for (const rec of this._live.values()) {
                if (rec.model && rec.model.update) rec.model.update((rec.t = (rec.t || 0) + delta));
                if (rec.bb) {
                    rec.bb.update(atX, atZ, camYaw);
                    rec.bb.faceCamera(atX, atZ, camYaw);
                }
            }
            this._timer += delta;
            if (this._timer < PARKED_INT) return;
            this._timer = 0;
            this._sweep(atX, atZ, camYaw);
        }

        // What should be standing here, and what should not be any more.
        _sweep(atX, atZ, camYaw = 0) {
            const VM = window.VehicleModels;
            const VP = window.VehiclePosition;
            if (!VM || !VP) return;
            const want = new Map();
            for (const key of VM.KEYS) {
                if (key === this._driving) continue;
                if (VP.mapId(key) !== WORLD_MAP_ID) continue;
                const wx = VP.worldX(key), wy = VP.worldY(key);
                if (!(wx > 0) && !(wy > 0)) continue;
                const x = wx * WORLD_TILE_SIZE + WORLD_TILE_SIZE * 0.5;
                const z = wy * WORLD_TILE_SIZE + WORLD_TILE_SIZE * 0.5;
                if (Math.hypot(x - atX, z - atZ) > PARKED_RANGE) continue;
                want.set(key, { x, z });
            }
            for (const [key, rec] of [...this._live]) {
                const w = want.get(key);
                // Gone out of range, driven away, or moved to another square.
                if (!w || Math.abs(w.x - rec.x) > 1 || Math.abs(w.z - rec.z) > 1) {
                    if (rec.model && rec.model.dispose) rec.model.dispose();
                    if (rec.bb) {
                        this._scene.remove(rec.bb.mesh);
                        rec.bb.dispose();
                    }
                    this._live.delete(key);
                }
            }
            const VEHICLE_2D_PARKED = {
                car:   { sheet: 'Vehicles/!$Car_large', length: 18 },
                bike:  { sheet: 'Vehicles/!$Bike', length: 7 },
                boat:  { sheet: 'Vehicles/!$Boat_large', length: 14 },
                broom: { sheet: 'Vehicles/!$BroomStick', length: 6 }
            };
            for (const [key, w] of want) {
                if (this._live.has(key)) continue;
                const gy = this._terrain.getTerrainHeight(w.x / WORLD_TILE_SIZE, w.z / WORLD_TILE_SIZE);
                const yaw = ((w.x * 7 + w.z * 13) % 360) * Math.PI / 180;

                if (key !== 'camper' && key !== 'starship' && VEHICLE_2D_PARKED[key]) {
                    const cfg = VEHICLE_2D_PARKED[key];
                    const bb = new VehicleBillboard(cfg.sheet, cfg.length);
                    bb.setPosition(w.x, gy, w.z);
                    bb.yaw = yaw;
                    this._scene.add(bb.mesh);
                    bb.update(atX, atZ, camYaw);
                    bb.faceCamera(atX, atZ, camYaw);
                    this._live.set(key, { bb, x: w.x, z: w.z, t: 0 });
                } else {
                    const model = VM.build(key);
                    if (!model) continue;
                    const s = VM.worldScale(key, model);
                    model.group.scale.multiplyScalar(s);
                    model.group.position.set(w.x, gy, w.z);
                    model.group.rotation.y = yaw;
                    if (window.PSXShader && window.PSXShader.applyToObject) {
                        window.PSXShader.applyToObject(model.group);
                    }
                    this._scene.add(model.group);
                    this._live.set(key, { model, x: w.x, z: w.z, t: 0 });
                }
            }
        }

        dispose() {
            for (const rec of this._live.values()) {
                if (rec.model && rec.model.dispose) rec.model.dispose();
                if (rec.bb) {
                    this._scene.remove(rec.bb.mesh);
                    rec.bb.dispose();
                }
            }
            this._live.clear();
        }
    }

    // Handed to the rest of the suite.
    Object.assign(VW, {
        BiomeEnemyManager, ParkedVehicles, BuildingInteriors, CityCrowd, ENEMY_3D_CONTACT_R,
        ENEMY_3D_DESPAWN, ENEMY_3D_MAX, ENEMY_3D_SPAWN_INT, ENEMY_PLATE_COLORS,
        ENEMY_PLATE_K, ENEMY_PLATE_MAX, ENEMY_PLATE_MIN, ENEMY_PLATE_RANGE,
        FollowerCrowd, _bioTroopByEnemy, bioBuildTroopIndex, bioTroopHoldsEnemy,
        enemyLevelBand, enemyLevelOf, makeEnemyPlate, troopForBioEnemy
    });
})();
