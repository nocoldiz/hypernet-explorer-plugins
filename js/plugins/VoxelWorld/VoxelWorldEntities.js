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
        INTERIOR_ALL_FLOORS, INTERIOR_BAND,
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
    // How far off a creature's rig is posed every frame, and past which only
    // every fourth (between the two: every other), in world units.
    const ANIM_NEAR = 320;
    const ANIM_FAR  = 760;

    // How tall a creature stands out here, in world units.
    //
    // Off the creature's OWN size, which the game already knows: every
    // archetype is registered with a scale (3DBattlerSystem's registry - a
    // goblin is 2.5, an orc 3.1, an ogre 4.2) and that is the size the battle
    // view builds it at. A plain human is 2.6 and a plain human out here
    // stands PERSON_H, which pins the whole of that table to this world - so a
    // creature is the same size beside the party as it is across the battle
    // view, and neither has to be bent to suit the other.
    //
    // It used to be a hash of the enemy's id spread over 1.8 to 5.8 times a
    // person. Nothing in that knew what the creature WAS: it made everything
    // in the world at least twice human height, and a goblin whose id rolled
    // high stood eleven metres over the camper while an ogre beside it came
    // out waist high.
    const HUMANOID_SCALE = 2.6;        // the plain human of the registry
    const CREATURE_MIN_H = PERSON_H * 0.40;
    const CREATURE_MAX_H = PERSON_H * 2.6;
    // How much of its height a creature owes to its level: a veteran of a
    // species is a bigger specimen of it, not a different animal.
    const CREATURE_LVL_GAIN = 0.25;
    function creatureHeight(data, level, archKey) {
        let arch = 0;
        if (window.Battler3D && typeof window.Battler3D.archetypeScale === 'function') {
            arch = window.Battler3D.archetypeScale(archKey);
        }
        // Nothing registered under that key: stand it at a person's height
        // rather than at a guess, which is the least wrong thing to be.
        let h = PERSON_H * ((arch || HUMANOID_SCALE) / HUMANOID_SCALE);
        // A stable hash of the species, not a die roll: come back tomorrow and
        // the same animal is the same size. Only a few per cent of it, so that
        // a line of one species is not a row of clones - the battle view keeps
        // the same hint of the roll for the same reason.
        let n = ((data && data.id) | 0) * 2654435761;
        n = Math.imul(n ^ (n >>> 15), 2246822519);
        const own = ((n ^ (n >>> 13)) >>> 0) / 4294967296;
        h *= 0.95 + own * 0.10;
        const lvl = Math.max(0, Math.min(1, ((level | 0) - 1) / 70));
        h *= 1 + CREATURE_LVL_GAIN * lvl;
        return Math.max(CREATURE_MIN_H, Math.min(CREATURE_MAX_H, h));
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
    // different things in it. A sewer is one of the generated structures, and
    // those no longer carry creatures of their own (tools/enemies/
    // gen_enemy_biomes.js never writes a structure tag): they BORROW the rosters
    // their structure catalogue entry names. The tags are still tried first,
    // for a database that carries them.
    const SEWER_BIOME_TAGS = ['Sewer', 'Sewers', 'Cistern'];                    // i18n-ignore  <Biome:> tag names
    const SEWER_STRUCTURE  = 'Sewer';                                           // i18n-ignore  structure catalogue key
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
    // How a personality closes in (BiomeEnemyManager._steer): a dive or a
    // charge runs at this many times the creature's own speed, a charger
    // paws the ground this long first, and both take this long to come round
    // again afterwards.
    const STEER_DASH     = 2.6;
    const STEER_WINDUP   = 0.6;    // seconds
    const STEER_RECOVER  = 0.9;    // seconds
    // A pack counts its own within this, and calls them in from this far.
    const PACK_RANGE      = 5 * TILE_UNITS;
    const PACK_CALL_RANGE = 14 * TILE_UNITS;
    // The food web: how far a creature notices what it hunts or what hunts it
    // (the battle system's ECOLOGY_AWARENESS, six steps), how often it looks,
    // and how often two creatures locked in a fight trade a blow.
    const ECO_AWARE_UNITS = 6 * TILE_UNITS;
    const ECO_SCAN_SECS   = 0.5;
    const ECO_ROUND_SECS  = 1.0;

    // Real-time combat (CombatSession, at the end of this file). Every number
    // the fight is tuned by, in one place. Distances are world units, times
    // are seconds.
    const COMBAT = {
        ENGAGE_R:        48,    // a creature this close to the leader is in the fight (~4 steps)
        JOIN_R:          160,   // ...and one already hunting the party this close joins it
        DISENGAGE_R:     420,   // the leader this far from every foe...
        ESCAPE_SECS:     3,     // ...for this long, and the party got away
        BASE_INTERVAL:   2.2,   // between two actions of a battler of the fight's middling speed
        INTERVAL_MIN:    0.9,
        INTERVAL_MAX:    4.5,
        RECOVERY_BASE:   0.35,  // what any action costs on top of the interval
        RECOVERY_MP:     0.02,  // ...per point of MP it spent
        RECOVERY_TP:     0.015, // ...per point of TP
        RECOVERY_REPEAT: 0.3,   // ...per extra hit it makes
        PLAN_GIVEUP:     6,     // an action that cannot reach its target for this long is rethought
        REACH_MIN:       34,    // an arm's length, whatever a tag says (the swing's own reach)
        REACH_STEP:      26,    // world units per step of <Range:>
        REACH_MAX:       600,   // an "unlimited" range, out here
        SKILL_STEPS:     4,     // a skill that says nothing about its range (MapBattleMode's default)
        BLAST_R:         30,    // an area skill catches everybody this close to its target
        ALLY_LEASH:      150,   // allies never chase further than this from the leader
        LOW_HP:          0.4,   // an ally under this share of HP is worth a heal
        FLY_STRIKE_H:    22,    // a flyer higher than this over its quarry is not yet in reach
        BOLT_SPEED:      300,   // a shot or a spell from one of the party or a creature
        LEADER_FX_D:     14,    // the leader's own hits are shown this far in front of the eye
        DEFEND_SECS:     1,     // R with nothing to reload: the guard is held this long
        SWITCH_COOLDOWN: 2.5,   // and the Vector gun folds at most this often
        POPUP_LIFE:      1.1,
        POPUP_RISE:      14
    };
    // The party's own line, broken up for a fight.
    const FIGHT_SPREAD  = 16;   // how far from the leader an idle ally stands
    const FIGHT_SPEED   = 52;   // how fast an ally crosses the ground
    const FIGHT_SPACING = 7;    // nobody stands closer than this to anybody else

    // Is a party looking along `yaw` turned away from something standing at
    // (relX, relZ) from them? The eye looks down -z at yaw 0.
    function facesAway(yaw, relX, relZ) {
        return (-Math.sin(yaw)) * relX + (-Math.cos(yaw)) * relZ < 0;
    }

    // A roaming creature's wounds are filed with the battle system under its
    // pid, exactly where a fight with the party files them, so a creature
    // mauled by a wolf is the same wounded creature when the party meets it.
    function bioPersistentStore() {
        const BSE = window.BattleSystemEnhanced;
        return (BSE && BSE.State && BSE.State.persistentEnemyData) || null;
    }
    function bioPersistentRecord(ent) {
        const p = bioPersistentStore();
        return p ? (p[ent.pid] || null) : null;
    }
    function bioWriteHp(ent, hp) {
        const p = bioPersistentStore();
        if (!p) return;
        const rec = p[ent.pid] || { troopId: troopForBioEnemy(ent.enemyId), enemyHp: {} };
        if (!rec.enemyHp) rec.enemyHp = {};
        rec.enemyHp[0] = hp;
        p[ent.pid] = rec;
    }
    function bioForget(ent) {
        const p = bioPersistentStore();
        if (p) delete p[ent.pid];
    }

    // A creature lunges, flinches or casts with its own model's clip, and
    // goes back to walking (or standing) when the clip is done.
    function restoreGait(ent) {
        const m = ent && ent.model;
        if (!m || ent.dead) return;
        try {
            if (ent.gait === 'idle' || !(ent.moveSpeed > 0)) m.playIdleAnimation();
            else m.playGait(ent.gait);
        } catch (e) { /* some families auto-idle */ }
    }
    function playCreatureClip(ent, name) {
        const m = ent && ent.model;
        if (!m || ent.dead || typeof m.playAnimation !== 'function') return;
        try { m.playAnimation(name, false, () => restoreGait(ent)); } catch (e) { /* no such clip */ }
    }

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

    // The plate's lettering, and in a fight the health bar under it. Drawn
    // into the plate's own canvas, so a creature being fought reads its
    // wounds off the same card that names it rather than off a second one.
    const PLATE_HP_COLORS = ['#3ec46d', '#e8c53a', '#e04a3a'];
    function paintPlate(cv, name, level, hpRate) {
        const ctx = cv.getContext('2d');
        ctx.clearRect(0, 0, cv.width, cv.height);
        const lvText = level > 0 ? T('CamperDrive.enemy.level', { n: level }) : '';
        const fighting = hpRate != null;
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
        // In a fight the two lines close up to make room for the bar.
        draw(String(name || ''), fighting ? 22 : 30, fighting ? 34 : 40, '#f4ead6');
        if (lvText) {
            draw(lvText, fighting ? 56 : 74, fighting ? 28 : 34,
                ENEMY_PLATE_COLORS[enemyLevelBand(level)] || '#FFFFFF');
        }
        if (!fighting) return;
        const rate = Math.max(0, Math.min(1, hpRate));
        const w = 300, h = 14, x = (cv.width - w) / 2, y = 76;
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
        ctx.fillStyle = PLATE_HP_COLORS[rate > 0.5 ? 0 : rate > 0.25 ? 1 : 2];
        ctx.fillRect(x, y, Math.round(w * rate), h);
    }

    // Redraw a plate with the health it should be showing (null takes the bar
    // off again). Only when the number it shows has actually moved: a canvas
    // upload a frame per creature is not free.
    function setPlateHp(sp, hpRate) {
        const d = sp && sp.userData;
        if (!d || !d._cv) return;
        const key = hpRate == null ? -1 : Math.round(Math.max(0, Math.min(1, hpRate)) * 100);
        if (d._hpKey === key) return;
        d._hpKey = key;
        paintPlate(d._cv, d._name, d._level, hpRate);
        if (sp.material && sp.material.map) sp.material.map.needsUpdate = true;
    }

    function makeEnemyPlate(name, level) {
        const cv = document.createElement('canvas');
        cv.width = 512; cv.height = 96;
        paintPlate(cv, name, level, null);

        const tex = new THREE.CanvasTexture(cv);
        if (THREE.SRGBColorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({
            map: tex, transparent: true, depthWrite: false, depthTest: true
        }));
        // Anchored by its foot, so growing with distance lifts it away from the
        // head instead of sinking it into the model.
        if (sp.center && sp.center.set) sp.center.set(0.5, 0);
        sp.userData._plate = true;
        sp.userData._cv = cv;
        sp.userData._name = name;
        sp.userData._level = level;
        sp.userData._hpKey = -1;
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
                // Under a nation bracket the country is the whole rule and the
                // party has no say in it, so the tethered half does not exist
                // here any more than it does in the 2D world.
                if (band && !band.nation && mode === 'biome' &&
                    H.rollBiomeTether && H.rollBiomeTether() && H.getBiomeTetherBand) {
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
            this._animFrame = (this._animFrame + 1) | 0;
            for (let i = this._ents.length - 1; i >= 0; i--) {
                const ent = this._ents[i];
                if (ent.model && typeof ent.model.update === 'function') {
                    // Every limb of a rig is posed in JS, and a creature half
                    // a kilometre off is a few pixels tall: past ANIM_NEAR it is
                    // posed every other frame, past ANIM_FAR every fourth, with
                    // the time it skipped handed over in one step so its gait
                    // keeps the same pace. One in a fight is always posed.
                    const ax = ent.x - vanX, az = ent.z - vanZ;
                    const ad = ax * ax + az * az;
                    const every = ent.battler || ad < ANIM_NEAR * ANIM_NEAR ? 1
                        : ad < ANIM_FAR * ANIM_FAR ? 2 : 4;
                    ent._animAcc = (ent._animAcc || 0) + delta;
                    if (every === 1 || ((this._animFrame + i) % every) === 0) {
                        const step = Math.min(ent._animAcc, 0.25);
                        ent._animAcc = 0;
                        try { ent.model.update(step); } catch (e) { /* ignore */ }
                    }
                }
                // Anything that can move, and anything that can react to being
                // walked up to even if it cannot: a mimic never takes a step and
                // still has to be able to spring.
                if (ent.root && !ent.dead && (ent.moveSpeed > 0 || (ent.beh && ent.beh.react) || ent.flies || ent.swims)) {
                    this._roam(ent, delta, vanX, vanZ);
                }
                if (ent.plate) this._sizePlate(ent, vanX, vanZ);
                const dx = ent.x - vanX, dz = ent.z - vanZ;
                // A creature the party is fighting is never recycled from under
                // the fight, however far the chase has carried it.
                if (!ent.battler && dx * dx + dz * dz > ENEMY_3D_DESPAWN * ENEMY_3D_DESPAWN) this._remove(i);
            }
            this._ecoTick(delta, vanX, vanZ);
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
            // In a fight with the party: the fight says who it is after and
            // when it wants to strike (CombatSession), its nature says how it
            // goes about getting there.
            if (ent.fight) { this._fightStep(ent, beh, delta); return; }
            // Something it eats, or something that eats it, is in sight: the
            // food web out here runs the way it does on the 2D map.
            if (ent.ecoFight) { this._advance(ent, delta, 0, px, pz); return; }
            if (ent.threat && ent.threat.alive && !ent.threat.dead && ent.spooked <= 0 && ent.state === 'idle') {
                ent.heading = Math.atan2(ent.z - ent.threat.z, ent.x - ent.threat.x);
                this._advance(ent, delta, ent.moveSpeed * (1.4 + (beh.chaseSpeed || 0) * 0.5), px, pz);
                return;
            }
            if (ent.prey && ent.prey.alive && !ent.prey.dead && ent.spooked <= 0 && ent.state === 'idle') {
                const pd = Math.hypot(ent.prey.x - ent.x, ent.prey.z - ent.z);
                const k = this._steer(ent, beh, ent.prey.x, ent.prey.z, pd,
                    { range: ENEMY_3D_CONTACT_R, strike: true, faceAway: true }, delta);
                this._advance(ent, delta, ent.moveSpeed * k * (1 + (beh.chaseSpeed || 0) * 0.5),
                    ent.prey.x, ent.prey.z);
                return;
            }
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
                    speed *= this._react(ent, beh, px, pz, toParty, seen, delta);
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

        // What it does once it HAS noticed the party, before any fight is on.
        // Sets the heading and hands back how hard it is moving (a share of
        // the speed the caller has already worked out).
        _react(ent, beh, px, pz, toParty, seen, delta) {
            if (px == null) return 1;
            // Out of a fight nothing is ready to strike yet: a swooper dives,
            // a charger charges, and the fight opens when they arrive.
            return this._steer(ent, beh, px, pz, toParty, {
                range: ENEMY_3D_CONTACT_R, strike: true,
                faceAway: this._partyFacesAway(ent, px, pz)
            }, delta);
        }

        // Is the party's back turned to this creature? The eye's own yaw,
        // handed over by the scene every frame (setPartyYaw); a stalker only
        // closes on a back, exactly as it does on the 2D map.
        setPartyYaw(yaw) { this._partyYaw = yaw; }
        _partyFacesAway(ent, px, pz) {
            if (this._partyYaw == null) return true;
            return facesAway(this._partyYaw, ent.x - px, ent.z - pz);
        }

        // ---------------------------------------------------------------------
        // How a personality closes on its quarry
        // ---------------------------------------------------------------------
        // One answer for all three hunts: the party before a fight, the party
        // during one, and a creature's prey. The same tags drive it as drive
        // the 2D map's aiActCommit (BattleSystemEnhancedEncounters): a swooper
        // drops in a straight line and climbs back out, a charger paws the
        // ground and runs straight through, a stalker only closes on a turned
        // back, a circler orbits and darts in, an ambusher waits for you to
        // walk into it, a pack holds off and calls until the pack is with it.
        //
        //   tx, tz, dist   where the quarry is, and how far
        //   o.range        how close it has to be to land what it means to land
        //   o.strike       it is ready to strike: what it is waiting for
        //   o.faceAway     the quarry's back is turned to it
        //
        // Sets ent.heading and returns how hard it is moving, as a share of its
        // own speed: 0 stands still, 1 is its gait, above 1 is a sprint.
        _steer(ent, beh, tx, tz, dist, o, delta) {
            const face = Math.atan2(tz - ent.z, tx - ent.x);
            const reach = Math.max(4, o.range || ENEMY_3D_CONTACT_R);
            const near = dist <= reach * 0.85;
            const band = beh.band
                ? [beh.band[0] * TILE_UNITS, beh.band[1] * TILE_UNITS] : null;
            if (ent.orbitDir == null) ent.orbitDir = Math.random() < 0.5 ? 1 : -1;

            // A dash under way runs its line out whatever the quarry does: a
            // dive or a charge is something to be sidestepped.
            if (ent.dashT > 0) {
                ent.dashT -= delta;
                ent.heading = ent.dashYaw;
                if (ent.dashT <= 0) {
                    ent.dashT = 0;
                    ent.recoverT = STEER_RECOVER;
                    ent.diving = false;
                }
                return STEER_DASH;
            }
            // ...and after it, a moment of climbing back out or catching breath.
            if (ent.recoverT > 0) {
                ent.recoverT -= delta;
                ent.heading = face + Math.PI * 0.6 * ent.orbitDir;
                if (ent.flies) ent.diving = false;
                return 0.7;
            }

            // A flyer of any temper comes down out of the sky the one way it
            // can; a swimmer simply swims at you.
            let react = beh.react;
            if (ent.flies && react !== 'flee' && react !== 'coward') react = 'swoop';
            else if (ent.swims && react !== 'flee' && react !== 'coward') react = 'chase';

            switch (react) {
                case 'flee':
                    ent.heading = face + Math.PI;
                    return 1.4;

                case 'coward': {
                    // Wants you gone, wants to know where you went.
                    const b = band || [5 * TILE_UNITS, 9 * TILE_UNITS];
                    if (dist < b[0]) { ent.heading = face + Math.PI; return 1.2; }
                    ent.heading = face;
                    return dist > b[1] ? 0.8 : 0;
                }

                case 'stalk': {
                    // Holds the gap. Closes only on a back, freezes on a face.
                    const b = band || [4 * TILE_UNITS, 7 * TILE_UNITS];
                    ent.heading = face;
                    if (near) return 0;
                    if (o.faceAway) return 1.15;
                    if (dist > b[1]) return 0.9;
                    if (dist < b[0]) { ent.heading = face + Math.PI; return 0.9; }
                    return 0;
                }

                case 'circle': {
                    // Round and round, in on the beat.
                    if (o.strike) { ent.heading = face; return near ? 0 : 1.5; }
                    const b = band || [4 * TILE_UNITS, 5 * TILE_UNITS];
                    const lo = Math.max(b[0], reach * 1.2), hi = Math.max(b[1], lo + TILE_UNITS);
                    ent.heading = face + Math.PI / 2 * ent.orbitDir +
                        (dist > hi ? -0.7 * ent.orbitDir : dist < lo ? 0.7 * ent.orbitDir : 0);
                    return 1;
                }

                case 'pack': {
                    // Alone it holds off and calls; with the pack it comes in.
                    ent.heading = face + (ent.packOff || 0) * (near ? 0 : 1);
                    if (this._packMates(ent) > 0 || dist <= reach * 1.5) return near ? 0 : 1;
                    this._callPack(ent, tx, tz);
                    const b = band || [3 * TILE_UNITS, 6 * TILE_UNITS];
                    if (dist > b[1]) return 1;
                    if (dist < b[0]) { ent.heading = face + Math.PI; return 0.8; }
                    return 0;
                }

                case 'swoop':
                    // Up high and turning until it is ready, then one straight
                    // dive through the quarry and a climb back out.
                    if (!o.strike) {
                        ent.diving = false;
                        ent.heading = face + Math.PI / 2 * ent.orbitDir;
                        return 0.8;
                    }
                    ent.dashYaw = face;
                    ent.dashT = Math.max(0.35, (dist + reach) / Math.max(1, ent.moveSpeed * STEER_DASH));
                    ent.diving = true;
                    ent.heading = face;
                    return STEER_DASH;

                case 'charge':
                    // Paws the ground, then runs the whole line at you and
                    // well past, which is what makes a charge dodgeable.
                    ent.heading = face;
                    if (!o.strike) return near ? 0 : 0.6;
                    if (!(ent.windT > 0)) ent.windT = STEER_WINDUP;
                    ent.windT -= delta;
                    if (ent.windT > 0) return 0;
                    ent.windT = 0;
                    ent.dashYaw = face;
                    ent.dashT = (dist + 3 * TILE_UNITS) / Math.max(1, ent.moveSpeed * STEER_DASH);
                    return STEER_DASH;

                case 'ambush':
                    // Part of the scenery until the quarry walks into it.
                    if (!ent.sprung) {
                        if (dist > Math.max(reach, (beh.sight || 3) * TILE_UNITS)) return 0;
                        ent.sprung = true;
                    }
                    ent.heading = face;
                    return near ? 0 : 1.8;

                default:
                    // chase, track and anything without a word for it.
                    ent.heading = face;
                    return near ? 0 : 1;
            }
        }

        // Same-species company within earshot, and a call that brings them
        // to where the caller is looking.
        _packMates(ent) {
            let n = 0;
            for (const o of this._ents) {
                if (o === ent || !o.alive || o.dead || o.enemyId !== ent.enemyId) continue;
                if (Math.hypot(o.x - ent.x, o.z - ent.z) <= PACK_RANGE) n++;
            }
            return n;
        }
        _callPack(ent, tx, tz) {
            if ((ent.calledT || 0) > 0) return;
            ent.calledT = 1.5;
            for (const o of this._ents) {
                if (o === ent || !o.alive || o.dead || o.enemyId !== ent.enemyId) continue;
                if (o.fight || o.state === 'commit') continue;
                if (Math.hypot(o.x - ent.x, o.z - ent.z) > PACK_CALL_RANGE) continue;
                o.state = 'commit';
                o.memT = ((o.beh && o.beh.memory) || 120) * FRAME;
                o.lastX = tx; o.lastZ = tz;
            }
        }

        // One tick of a creature in the party's fight. CombatSession fills in
        // ent.fight every frame; this only moves it.
        _fightStep(ent, beh, delta) {
            const f = ent.fight;
            if (ent.calledT > 0) ent.calledT -= delta;
            const dist = Math.hypot(f.x - ent.x, f.z - ent.z);
            const k = (ent.moveSpeed > 0)
                ? this._steer(ent, beh, f.x, f.z, dist, f, delta) : 0;
            if (!(ent.moveSpeed > 0)) ent.heading = Math.atan2(f.z - ent.z, f.x - ent.x);
            const pace = ent.moveSpeed * (ent.flies ? 2.2 : 1) * (1 + (beh.chaseSpeed || 0) * 0.5);
            this._advance(ent, delta, pace * k, f.x, f.z);
        }

        // ---------------------------------------------------------------------
        // The food web
        // ---------------------------------------------------------------------
        // Every creature carries its role (<Hunter>, <Predator>, <Prey>,
        // <Neutral>) and the battle system's own table says who hunts whom
        // and who wins (BattleSystemEnhancedEncounters, BSE.Helpers.ecology*).
        // A hunter that catches what it hunts fights it, one exchange a
        // second, on the very rules the 2D map's monster fights use
        // (BSE.Skirmish.round), and what loses is left lying as a body.
        _ecoTick(delta, px, pz) {
            const H = window.BattleSystemEnhanced && window.BattleSystemEnhanced.Helpers;
            if (!H || !H.getEnemyEcology || !H.ecologyChases) return;
            for (const ent of this._ents) if (ent.calledT > 0 && !ent.fight) ent.calledT -= delta;
            this._ecoScanT = (this._ecoScanT || 0) - delta;
            if (this._ecoScanT <= 0) {
                this._ecoScanT = ECO_SCAN_SECS;
                this._ecoScan(H);
            }
            this._ecoFights(delta, H);
        }

        _ecoScan(H) {
            const R = ECO_AWARE_UNITS;
            const live = this._ents.filter(e => e.alive && e.root && !e.dead);
            for (const ent of live) {
                ent.prey = null; ent.threat = null;
                if (ent.battler || ent.ecoFight) continue;
                const mine = H.getEnemyEcology($dataEnemies[ent.enemyId]);
                let bestPrey = null, bestThreat = null, dp = R, dt = R;
                for (const other of live) {
                    if (other === ent || other.battler) continue;
                    const d = Math.hypot(other.x - ent.x, other.z - ent.z);
                    if (d > R) continue;
                    const theirs = H.getEnemyEcology($dataEnemies[other.enemyId]);
                    if (H.ecologyChases(mine, theirs) && d < dp) { bestPrey = other; dp = d; }
                    else if (H.ecologyChases(theirs, mine) && d < dt) { bestThreat = other; dt = d; }
                }
                ent.prey = bestPrey;
                ent.threat = bestThreat;
                // Caught up with it: the fight is on.
                if (bestPrey && dp <= ENEMY_3D_CONTACT_R && !bestPrey.ecoFight) {
                    this._startEcoFight(ent, bestPrey, H);
                }
            }
        }

        _startEcoFight(a, b, H) {
            if (!this._eco) this._eco = [];
            const side = (ent) => {
                const data = $dataEnemies[ent.enemyId];
                if (ent.ecoHp == null) {
                    const rec = bioPersistentRecord(ent);
                    const stored = rec && rec.enemyHp ? rec.enemyHp[0] : undefined;
                    ent.ecoMhp = (data && data.params && data.params[0]) || 1;
                    ent.ecoHp = stored !== undefined ? stored : ent.ecoMhp;
                }
                return {
                    kind: 'monster', ent, level: ent.level || 1,
                    eco: H.getEnemyEcology(data),
                    hp: ent.ecoHp, mhp: ent.ecoMhp,
                    morale: null,
                    blow: 'Blunt'
                };
            };
            const fight = { a: side(a), b: side(b), t: ECO_ROUND_SECS * 0.5 };
            const BSE = window.BattleSystemEnhanced;
            const S = BSE && BSE.Skirmish;
            if (S && S.MORALE) {
                fight.a.morale = S.MORALE[fight.a.eco];
                fight.b.morale = S.MORALE[fight.b.eco];
            }
            a.ecoFight = fight; b.ecoFight = fight;
            a.heading = Math.atan2(b.z - a.z, b.x - a.x);
            b.heading = a.heading + Math.PI;
            this._eco.push(fight);
        }

        _ecoFights(delta, H) {
            if (!this._eco || !this._eco.length) return;
            const S = window.BattleSystemEnhanced && window.BattleSystemEnhanced.Skirmish;
            for (let i = this._eco.length - 1; i >= 0; i--) {
                const f = this._eco[i];
                const A = f.a.ent, B = f.b.ent;
                const over = !A.alive || !B.alive || A.dead || B.dead || A.battler || B.battler ||
                    Math.hypot(A.x - B.x, A.z - B.z) > ENEMY_3D_CONTACT_R * 2.5 || !S || !S.round;
                if (over) { this._endEcoFight(i); continue; }
                f.t -= delta;
                if (f.t > 0) continue;
                f.t = ECO_ROUND_SECS;
                const r = S.round(f.a, f.b, Math.random);
                const atk = r.attacker, def = r.defender;
                def.hp = Math.max(0, def.hp - r.damage);
                def.ent.ecoHp = def.hp;
                bioWriteHp(def.ent, def.hp);
                playCreatureClip(atk.ent, 'attack');
                playCreatureClip(def.ent, 'hit');
                if (this.onEcoHit) this.onEcoHit(def.ent, r.damage);
                if (def.hp <= 0) {
                    this._endEcoFight(i);
                    bioForget(def.ent);
                    if (this.onEcoKill) this.onEcoKill(def.ent, atk.ent);
                    continue;
                }
                if (S.breaksOff && S.breaksOff(def, atk, Math.random)) {
                    this._endEcoFight(i);
                    def.ent.spooked = 8;
                }
            }
        }

        _endEcoFight(i) {
            const f = this._eco[i];
            this._eco.splice(i, 1);
            if (f.a.ent.ecoFight === f) f.a.ent.ecoFight = null;
            if (f.b.ent.ecoFight === f) f.b.ent.ecoFight = null;
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
            // The ground just read IS the ground under the new spot: handed on
            // rather than asked for twice (four column lookups apiece).
            this._placeY(ent, delta, px, pz, gy);
            ent.root.rotation.y = Math.atan2(Math.cos(ent.heading), Math.sin(ent.heading));
        }

        // The height a creature holds: the ground under it, the depth it swims
        // at, or the air it flies in. Eased rather than snapped, so a rising
        // bed lifts a fish and a bird banks down into a dive instead of
        // teleporting onto the party's head.
        _placeY(ent, delta, px, pz, groundY) {
            const ts = WORLD_TILE_SIZE;
            const gy = groundY != null ? groundY : this._terrain.getTerrainHeight(ent.x / ts, ent.z / ts);
            let want = gy;
            if (ent.swims) {
                // Surface and bed read once and shared with _swimY: each is a
                // column sample, and a swimmer used to take both of them twice.
                const top = this._terrain.waterSurfaceAt(ent.x, ent.z);
                const bed = top != null ? this._terrain.getBlockTop(ent.x, ent.z) : null;
                if (top != null) {
                    if (ent.state === 'commit' || ent.state === 'alert') {
                        const targetD = Math.max(ENEMY_WATER_MARGIN, Math.min(Math.max(ENEMY_WATER_MARGIN, top - bed - ENEMY_WATER_MARGIN), ENEMY_WATER_MARGIN * 1.5));
                        ent.swimD = ent.swimD == null ? targetD : ent.swimD + (targetD - ent.swimD) * Math.min(1, delta * 3.0);
                    }
                }
                const w = this._swimY(ent.x, ent.z, ent.swimD, top, bed);
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
        _swimY(x, z, depth, knownTop, knownBed) {
            const top = knownTop !== undefined ? knownTop : this._terrain.waterSurfaceAt(x, z);
            if (top == null) return null;
            const bed = knownBed != null ? knownBed : this._terrain.getBlockTop(x, z);
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
            if (!pool) pool = this._borrowedSewerRoster();
            this._sewerPool = pool;
            return pool;
        }

        // The rosters the sewer structure borrows, read off the same catalogue
        // the 2D sewers are populated from (ProcGenDungeon.structure), so the
        // galleries under a town field what a sewer map would. Null when the
        // catalogue is not loaded or borrows nothing the database names.
        _borrowedSewerRoster() {
            const D = window.ProcGenDungeon;
            const st = (D && typeof D.structure === 'function') ? D.structure(SEWER_STRUCTURE) : null;
            const biomes = (st && st.enemy && st.enemy.biomes) || [];
            const out = [];
            const seen = new Set();
            for (const name of biomes) {
                if (SEWER_BIOME_TAGS.indexOf(name) >= 0) continue;
                const ids = this._candidatesFor(name) || [];
                for (const id of ids) {
                    if (!seen.has(id)) { seen.add(id); out.push(id); }
                }
            }
            return out.length ? out : null;
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
            const wantH = creatureHeight(data, ent.level, key);
            // How tall this one stands, kept on the record: the camera reads it
            // to frame a fight on the creature's body rather than on the ground
            // at its feet (VoxelWorldScene's _holdBattleAim).
            ent.hgt = wantH;
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
                        for (const m of mats) {
                            // The name plate is the one texture here that is
                            // NOT shared: makeEnemyPlate letters a canvas of its
                            // own per creature, so the block textures' rule
                            // below does not apply to it and it has to go with
                            // the material that carries it. Creatures spawn and
                            // despawn for as long as a drive lasts, and every
                            // one of those plates used to be left on the card.
                            if (o.userData && o.userData._plate && m.map) m.map.dispose();
                            m.dispose();   // textures otherwise stay cached
                        }
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
            // The plan the decorator, the interiors and the walker already
            // share (see Decor's _decorateSettlement), not a second one built from scratch
            // in the frame the crowd turns up.
            const plan = planForTile(wx, wy) || planSettlement(wx, wy, big, ts);
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

        update(px, pz, feetY) {
            const ts = WORLD_TILE_SIZE;
            // A tall building only has the floors round the walker's own put
            // up, so climbing a flight (or riding the lift) moves that band.
            if (feetY != null) {
                for (const rec of this._live.values()) {
                    if (!rec.banded) continue;
                    const f = this._floorOf(rec, px, pz, feetY);
                    if (f !== rec.focus) this._dress(rec, f);
                }
            }
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
                                const rec = this._build(tx, tz, plan, i, ox, oz);
                                rec.key = key;
                                if (rec.banded && feetY != null) {
                                    const f = this._floorOf(rec, px, pz, feetY);
                                    if (f !== rec.focus) this._dress(rec, f);
                                }
                                this._live.set(key, rec);
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
                    // setDaylight, not setDayFactor: the latter has never
                    // existed, and the guard in front of it swallowed the call
                    // silently, so shop keepers stood at full brightness at
                    // midnight while everybody else around them dimmed.
                    k.bb.setDaylight(dayFactor);
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
            this._dropKeepers(rec);
            this._live.delete(key);
        }

        // The shopkeepers are the one thing in an interior that is NOT shared:
        // each card owns its material, its cloned texture and its plane, and
        // sits in the billboard registry that is turned to the camera every
        // render. Taking the group out of the scene left all of that behind.
        _dropKeepers(rec) {
            if (!rec.keepers) return;
            for (const k of rec.keepers) if (k.bb) k.bb.dispose();
            rec.keepers = [];
        }

        // Put up one building's inside: the floors, the walls between the rooms,
        // the flights of stairs and whatever furniture is still in it.
        _build(tx, tz, plan, index, ox, oz) {
            const lot  = plan.lots[index];
            const base = planBaseY(plan, tx, tz, (gx, gz) => this._terrain.getTerrainHeight(gx, gz));
            const inner = planInterior(lot, tx, tz, index);
            const rec = {
                group: null, inner, lot, base, index, keepers: [],
                wx: ox + lot.x, wz: oz + lot.z,
                tile: tx + ',' + tz,
                // A building taller than a house is put up a few floors at a
                // time, round whichever floor the walker is on.
                banded: inner.floors > INTERIOR_ALL_FLOORS,
                focus: 0
            };
            this._dress(rec, 0);
            return rec;
        }

        // Which floor of a building a walker is on: the one under their feet
        // when they are inside it, and the ground floor from the street.
        _floorOf(rec, x, z, feetY) {
            const inner = rec.inner;
            const lx = x - rec.wx, lz = z - rec.wz;
            if (Math.abs(lx) > inner.iw / 2 + 2 || Math.abs(lz) > inner.id / 2 + 2) return 0;
            const f = Math.floor((feetY - rec.base + 2) / inner.H);
            return Math.max(0, Math.min(inner.floors - 1, f));
        }

        // Put up the geometry of an interior round one floor (the whole of it
        // for a building short enough to be drawn whole), replacing whatever
        // of it was standing before.
        _dress(rec, focus) {
            if (rec.group) {
                this._scene.remove(rec.group);
                rec.group.traverse(o => { if (o.isInstancedMesh && o.dispose) o.dispose(); });
            }
            this._dropKeepers(rec);
            rec.focus = focus;
            const { lot, inner, base } = rec;
            const dec  = this.decorator;
            const H = inner.H;
            const lo = rec.banded ? focus - INTERIOR_BAND : 0;
            const hi = rec.banded ? focus + INTERIOR_BAND : inner.floors;
            const floorOf = (y) => Math.floor(y / H + 0.001);
            const shown = (y) => { const f = floorOf(y); return f >= lo && f <= hi; };
            // Furniture that is drawn as a picture rather than built out of
            // boxes, gathered for the whole building (see the loop below).
            const sprites = [];
            const group = new THREE.Group();
            group.position.set(rec.wx, base, rec.wz);
            const ruined = !!lot.ruined;

            if (dec) {
                const B = new SettlementBatch(dec);
                const floorMat = ruined ? dec._matSoil() : dec._matFloor();
                const wallMat  = ruined ? dec._matRuinPlaster() : dec._matPlaster();
                const steel    = dec._matMetal();
                for (const s of inner.slabs) {
                    // The slab over the top floor shown is its ceiling, so it
                    // stands one floor past the band.
                    const f = floorOf(s.y);
                    if (f < lo || f > hi + 1) continue;
                    B.add('uBox', floorMat, s.x, s.y - 0.6, s.z, s.w, 0.6, s.d, 0);
                }
                for (const w of inner.walls) {
                    // The lining runs the full height of the building in one
                    // piece, so it is never left out.
                    if (w.h <= H && !shown(w.y)) continue;
                    B.add('uBox', w.lift ? steel : wallMat, w.x, w.y, w.z, w.w, w.h, w.d, 0);
                }
                if (inner.lift) this._addLiftCab(B, dec, inner.lift, lo, Math.min(hi, inner.floors - 1), H);
                for (const st of inner.stairs) {
                    if (!shown(st.y0)) continue;
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
                    if (!shown(f.y)) continue;
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
            const keepers = (inner.keepers || []).filter(k => k.floor >= lo && k.floor <= hi);
            rec.keepers = this._emitKeepers(group, { keepers }, base, rec.wx, rec.wz);

            this._scene.add(group);
            rec.group = group;
            return rec;
        }

        // The lift cab on each floor that is standing: a steel floor plate and
        // the call panel beside the opening, lit, so it reads as a lift from
        // across the room. The walls are the plan's own (marked `lift`).
        _addLiftCab(B, dec, lift, lo, hi, H) {
            const steel = dec._matMetal();
            const lamp  = dec._mat('#ffd36a');
            const [ox, oz] = lift.open;
            const hw = lift.w / 2, hd = lift.d / 2;
            for (let f = Math.max(0, lo); f <= hi; f++) {
                const y = f * H;
                B.add('uBox', steel, lift.x, y, lift.z, lift.w - 0.4, 0.3, lift.d - 0.4, 0);
                // The panel, on the back wall of the cab facing out of it.
                if (ox === 0) {
                    B.add('uBox', lamp, lift.x + hw * 0.45, y + 5, lift.z - oz * (hd - 1.6),
                          2.2, 3, 0.4, 0);
                } else {
                    B.add('uBox', lamp, lift.x - ox * (hw - 1.6), y + 5, lift.z + hd * 0.45,
                          0.4, 3, 2.2, 0);
                }
                // The lintel over the opening.
                if (ox === 0) {
                    B.add('uBox', steel, lift.x, y + H - 3.2, lift.z + oz * (hd - 0.6),
                          lift.w, 2.4, 1.2, 0);
                } else {
                    B.add('uBox', steel, lift.x + ox * (hw - 0.6), y + H - 3.2, lift.z,
                          1.2, 2.4, lift.d, 0);
                }
            }
        }

        // The lift a walker is standing in or at, on a floor it serves, or
        // null. `reach` is how far outside the cab still counts as at it.
        liftAt(x, feetY, z, reach) {
            for (const rec of this._live.values()) {
                const L = rec.inner.lift;
                if (!L) continue;
                const lx = x - rec.wx - L.x, lz = z - rec.wz - L.z;
                if (Math.abs(lx) > L.w / 2 + reach || Math.abs(lz) > L.d / 2 + reach) continue;
                const H = rec.inner.H;
                const f = Math.round((feetY - rec.base) / H);
                if (f < 0 || f >= rec.inner.floors) continue;
                if (Math.abs(feetY - (rec.base + f * H)) > 4) continue;
                return { key: rec.key, floor: f, floors: rec.inner.floors };
            }
            return null;
        }

        // Where the doors of a lift open on a floor: the middle of the cab,
        // standing on its floor plate. Null if that building is not standing.
        liftStop(key, floor) {
            const rec = this._live.get(key);
            if (!rec || !rec.inner.lift) return null;
            const L = rec.inner.lift;
            const f = Math.max(0, Math.min(rec.inner.floors - 1, floor));
            return { x: rec.wx + L.x, y: rec.base + f * rec.inner.H, z: rec.wz + L.z };
        }

        // Put a building's floors up round one floor right now, so a ride's
        // doors open on a floor that is already there.
        focusFloor(key, floor) {
            const rec = this._live.get(key);
            if (rec && rec.banded && rec.focus !== floor) this._dress(rec, floor);
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
                        wanted.push({ sheet: 'Vehicles/!$BikeRiding', index: 0, actor: a });
                    } else if (isBroom) {
                        wanted.push({ sheet: broomSheet, index: 0, actor: a });
                    } else {
                        wanted.push({ sheet: a.characterName(), index: a.characterIndex(), actor: a });
                    }
                }
            }
            const pet = window.PetSystem && window.PetSystem.getActivePet
                ? window.PetSystem.getActivePet() : null;
            if (pet && pet.characterName) {
                wanted.push({ sheet: pet.characterName, index: pet.characterIndex || 0, actor: null });
            }
            // Who each card IS goes into the signature as well as what it looks
            // like: a fight hands the lead to another member (CombatSession),
            // and two members drawn off the same sheet must not keep each
            // other's places.
            const sig = wanted.map(w => w.sheet + '#' + w.index + '@' +
                (w.actor && w.actor.actorId ? w.actor.actorId() : 0)).join('|');
            if (sig === this._sig) return;
            // Where everybody was standing goes with them into the new line,
            // so a reshuffle in the middle of a fight does not teleport anyone.
            const was = new Map();
            for (const m of this._members) if (m.actor) was.set(m.actor, m);
            this._sig = sig;
            for (const m of this._members) m.bb.dispose();
            this._members = wanted.map((w) => {
                const prev = w.actor ? was.get(w.actor) : null;
                return {
                    bb: new CharacterBillboard(w.sheet, w.index, PERSON_H),
                    actor: w.actor,
                    x: prev ? prev.x : 0, y: prev ? prev.y : 0, z: prev ? prev.z : 0,
                    placed: !!prev && !!prev.placed
                };
            });
            for (const m of this._members) this._scene.add(m.bb.mesh);
        }

        // The card standing for one of the party, or null (the leader has
        // none: the leader is the eye).
        memberFor(actor) {
            if (!actor) return null;
            for (const m of this._members) if (m.actor === actor) return m;
            return null;
        }
        members() { return this._members; }

        // ---------------------------------------------------------------------
        // Fighting
        // ---------------------------------------------------------------------
        // In a fight the line breaks: every member goes where the fight wants
        // them (CombatSession.allyGoal), and the trail is dropped so the line
        // re-forms from where they actually are once it is over. `goalFn(m)`
        // hands back the point a member is heading for, or null to stay by
        // the leader. A member who is down lies where they fell, dimmed.
        fight(delta, lx, ly, lz, camYaw, df, groundFn, goalFn) {
            this._trail.length = 0;
            const light = df == null ? 1 : df;
            for (let i = 0; i < this._members.length; i++) {
                const m = this._members[i];
                // By the leader, each on a side of their own: behind and
                // fanned out, the eye looking down -z at yaw 0.
                const side = camYaw + (i - 1) * 0.9;
                const byX = lx + Math.sin(side) * FIGHT_SPREAD;
                const byZ = lz + Math.cos(side) * FIGHT_SPREAD;
                if (!m.placed) {
                    // Nobody has stood anywhere yet (a fight opened before the
                    // line ever walked): start them where they would stand.
                    m.x = byX; m.z = byZ;
                    m.placed = true;
                }
                const down = !!(m.actor && m.actor.isDead && m.actor.isDead());
                let gx = m.x, gz = m.z;
                if (!down) {
                    const goal = goalFn ? goalFn(m) : null;
                    if (goal) { gx = goal.x; gz = goal.z; }
                    else { gx = byX; gz = byZ; }
                }
                const dx = gx - m.x, dz = gz - m.z;
                const d = Math.hypot(dx, dz);
                const moving = !down && d > 1.5;
                if (moving) {
                    const step = Math.min(d, FIGHT_SPEED * delta);
                    m.x += dx / d * step;
                    m.z += dz / d * step;
                    m.bb.yaw = Math.atan2(dx, dz);
                }
                // Nobody stands inside anybody else.
                for (let j = 0; j < this._members.length; j++) {
                    if (j === i) continue;
                    const o = this._members[j];
                    const ox = m.x - o.x, oz = m.z - o.z;
                    const od = Math.hypot(ox, oz);
                    if (od > 0.001 && od < FIGHT_SPACING) {
                        m.x += ox / od * (FIGHT_SPACING - od) * 0.5;
                        m.z += oz / od * (FIGHT_SPACING - od) * 0.5;
                    }
                }
                const gy = groundFn ? groundFn(m.x, m.z) : ly;
                m.y = gy;
                m.bb.moving = moving;
                m.bb.setPosition(m.x, gy + (m.lungeT > 0 ? Math.sin(m.lungeT * 12) * 1.5 : 0), m.z);
                if (m.lungeT > 0) m.lungeT -= delta;
                m.bb.setDaylight(down ? light * 0.3 : light);
                m.bb.update(lx, lz, camYaw);
            }
        }

        // The line takes up again from where everybody is standing.
        endFight() {
            this._trail.length = 0;
            for (const m of this._members) m.placed = false;
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
                    m.placed = true;
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

        // Call a vehicle over: it is parked on the square the party stands on
        // (the one record both maps read, window.VehiclePosition) and drawn at
        // exactly this point in the world rather than at the square's middle.
        // The point is kept for as long as the record still names that square,
        // so it is the 2D map's answer the moment the party leaves the world.
        placeAt(key, x, z, yaw) {
            const VP = window.VehiclePosition;
            if (!key || !VP || !VP.set) return false;
            const wx = Math.floor(x / WORLD_TILE_SIZE), wy = Math.floor(z / WORLD_TILE_SIZE);
            VP.set(key, WORLD_MAP_ID, wx, wy, wx, wy);
            if (!this._spots) this._spots = {};
            this._spots[key] = { x, z, yaw: yaw || 0, wx, wy };
            this._timer = PARKED_INT;   // stood up on the very next frame
            return true;
        }

        // Where a vehicle parked on a square is drawn: the spot it was called
        // to, while the record still names that square, else the middle.
        _spotFor(key, wx, wy) {
            const s = this._spots && this._spots[key];
            if (s && s.wx === wx && s.wy === wy) return s;
            return null;
        }

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
                const owns = (window.VehiclePosition && typeof window.VehiclePosition.owns === 'function')
                    ? window.VehiclePosition.owns(key)
                    : (window.VehicleSystem && typeof window.VehicleSystem.ownsVehicleKey === 'function'
                        ? window.VehicleSystem.ownsVehicleKey(key) : true);
                if (!owns) continue;
                if (VP.mapId(key) !== WORLD_MAP_ID) continue;
                const wx = VP.worldX(key), wy = VP.worldY(key);
                if (!(wx > 0) && !(wy > 0)) continue;
                const spot = this._spotFor(key, wx, wy);
                const x = spot ? spot.x : wx * WORLD_TILE_SIZE + WORLD_TILE_SIZE * 0.5;
                const z = spot ? spot.z : wy * WORLD_TILE_SIZE + WORLD_TILE_SIZE * 0.5;
                if (Math.hypot(x - atX, z - atZ) > PARKED_RANGE) continue;
                want.set(key, { x, z, yaw: spot ? spot.yaw : null });
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
                const yaw = w.yaw != null ? w.yaw : ((w.x * 7 + w.z * 13) % 360) * Math.PI / 180;

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

    // =========================================================================
    // Real-time combat
    //
    // A fight out here is not a battle scene. Nothing is pushed, nothing fades,
    // the world never stops: the party meets a creature on the ground they are
    // standing on and fights it there, in real time.
    //
    // The player is the leader and only the leader. Everybody else - the rest
    // of the party and every creature - acts by themselves, each on a clock of
    // its own set by its speed. And every action anybody takes goes through the
    // one door the battle itself uses: a Game_Action, applied to a target. The
    // party's skills are their carried loadout (window.BattleLoadout), the
    // same nine the battle's own bar is built from; a creature's are its
    // database action patterns (Game_Enemy.makeActions). So every rule the
    // battle system has - the damage formulas, Health_Core's limbs, the body
    // parts a creature loses, ammunition, the fumble on a skill reached for too
    // early - is in force out here without being written a second time.
    //
    // $gameTroop is a real troop for as long as the fight lasts and
    // $gameParty.inBattle() is true, exactly as MapBattleMode leaves them on
    // the 2D map, so every hook that asks "is this a fight?" gets the right
    // answer. Creatures that join a fight already under way are appended to
    // the troop.
    //
    // The scene is the host: it owns where everybody stands, the bodies, the
    // eye and the quick bar, and is told when a fight starts and ends
    // (_onCombatBegin / _onCombatEnd) and when the leader must be handed on
    // (_handOffLeader).
    // =========================================================================

    // Which side of the fight an item is aimed at, off its scope alone.
    function isForFriendScope(item) {
        const s = item ? item.scope : 0;
        return s >= 7 && s <= 14;
    }
    function isForAllScope(item) {
        const s = item ? item.scope : 0;
        return s === 2 || s === 8 || s === 10 || s === 13 || s === 14;
    }
    function isForDeadScope(item) {
        const s = item ? item.scope : 0;
        return s === 9 || s === 10;
    }

    // A number off a note tag, read the way MapBattleMode reads <Range:> so
    // the two never disagree about how far anything reaches.
    function metaSteps(obj, key) {
        const n = Number(obj && obj.meta && obj.meta[key]);
        return Number.isFinite(n) && n > 0 ? n : 0;
    }
    function reachOfSteps(steps) {
        if (steps >= 99) return COMBAT.REACH_MAX;
        return Math.min(COMBAT.REACH_MAX, Math.max(COMBAT.REACH_MIN, steps * COMBAT.REACH_STEP));
    }

    // Numbers rising off whoever was hit: damage, healing, a miss. One small
    // canvas per number, thrown away when it has faded.
    class CombatPopups {
        constructor(scene) {
            this._scene = scene;
            this._live = [];
        }

        add(x, y, z, text, colour) {
            if (typeof document === 'undefined' || typeof THREE === 'undefined') return;
            const cv = document.createElement('canvas');
            cv.width = 256; cv.height = 96;
            const ctx = cv.getContext('2d');
            ctx.font = "bold 64px GameFont, 'Bitter', serif";  // i18n-ignore  CSS font stack
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineJoin = 'round';
            ctx.lineWidth = 10;
            ctx.strokeStyle = 'rgba(0,0,0,0.9)';
            ctx.strokeText(String(text), 128, 48);
            ctx.fillStyle = colour || '#ffffff';
            ctx.fillText(String(text), 128, 48);
            const tex = new THREE.CanvasTexture(cv);
            if (THREE.SRGBColorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;
            const sp = new THREE.Sprite(new THREE.SpriteMaterial({
                map: tex, transparent: true, depthWrite: false, depthTest: false
            }));
            sp.renderOrder = 950;
            sp.position.set(x + (Math.random() - 0.5) * 3, y, z + (Math.random() - 0.5) * 3);
            this._scene.add(sp);
            this._live.push({ sp, t: 0 });
        }

        // Kept the same size on screen at any distance, like the name plates.
        update(delta, camX, camZ) {
            for (let i = this._live.length - 1; i >= 0; i--) {
                const p = this._live[i];
                p.t += delta;
                p.sp.position.y += COMBAT.POPUP_RISE * delta;
                const k = p.t / COMBAT.POPUP_LIFE;
                p.sp.material.opacity = k < 0.6 ? 1 : Math.max(0, 1 - (k - 0.6) / 0.4);
                const d = Math.hypot(p.sp.position.x - camX, p.sp.position.z - camZ);
                const w = Math.max(5, Math.min(40, d * 0.07));
                p.sp.scale.set(w, w * 0.375, 1);
                if (p.t >= COMBAT.POPUP_LIFE) this._drop(i);
            }
        }

        _drop(i) {
            const p = this._live[i];
            this._live.splice(i, 1);
            this._scene.remove(p.sp);
            if (p.sp.material.map) p.sp.material.map.dispose();
            p.sp.material.dispose();
        }

        clear() { for (let i = this._live.length - 1; i >= 0; i--) this._drop(i); }
    }

    // A shot or a spell in flight between two of the fighters. It flies at
    // where its target IS, not where it was, so a running target is still
    // hit; what it does is applied the moment it arrives.
    class CombatBolts {
        constructor(scene) {
            this._scene = scene;
            this._live = [];
            this._geo = null;
        }

        launch(from, target, colour, onHit) {
            if (typeof THREE === 'undefined') { onHit(); return; }
            if (!this._geo) this._geo = new THREE.SphereGeometry(1.6, 8, 6);
            const mesh = new THREE.Mesh(this._geo, new THREE.MeshBasicMaterial({
                color: colour, transparent: true, opacity: 0.9, depthWrite: false
            }));
            mesh.position.set(from.x, from.y, from.z);
            mesh.frustumCulled = false;
            this._scene.add(mesh);
            this._live.push({ mesh, target, onHit, t: 0 });
        }

        update(delta) {
            for (let i = this._live.length - 1; i >= 0; i--) {
                const b = this._live[i];
                b.t += delta;
                const to = b.target();
                const p = b.mesh.position;
                const dx = to.x - p.x, dy = to.y - p.y, dz = to.z - p.z;
                const d = Math.hypot(dx, dy, dz);
                const step = COMBAT.BOLT_SPEED * delta;
                // Arrived, or flying so long something has gone wrong with it.
                if (d <= step || b.t > 4) {
                    this._drop(i);
                    b.onHit();
                    continue;
                }
                p.x += dx / d * step; p.y += dy / d * step; p.z += dz / d * step;
            }
        }

        _drop(i) {
            const b = this._live[i];
            this._live.splice(i, 1);
            this._scene.remove(b.mesh);
            b.mesh.material.dispose();
        }

        clear() {
            for (let i = this._live.length - 1; i >= 0; i--) this._drop(i);
            if (this._geo) { this._geo.dispose(); this._geo = null; }
        }
    }

    // The colour a bolt burns, by the element of what it carries.
    const BOLT_COLOURS = [0xfff0c0, 0xff6a3a, 0x8fd8ff, 0xffe45a, 0x5ab4ff, 0x9ae07a, 0xe0c890, 0xffffff, 0x9a6aff];
    function boltColour(item) {
        const id = (item && item.damage && item.damage.elementId) || 0;
        return id > 0 ? BOLT_COLOURS[id % BOLT_COLOURS.length] : BOLT_COLOURS[0];
    }

    class CombatSession {
        constructor(host) {
            this._host = host;
            this.active = false;
            this._ending = false;
            this._foes = [];
            this._clock = new Map();     // battler -> fight time it may act again at
            this._plans = new Map();     // battler -> { item, target, since }
            this._downed = new Set();    // party members already counted as down
            this._t = 0;
            this._awayT = 0;
            this._popups = host && host._scene ? new CombatPopups(host._scene) : null;
            this._bolts  = host && host._scene ? new CombatBolts(host._scene) : null;
        }

        // Is a fight on, or being wound up? The battle hooks ask the second
        // half too: the fight's own ending runs engine code that must not be
        // read as a fight in a battle scene.
        inCombat() { return this.active || this._ending; }
        get foes() { return this._foes; }
        isFoe(ent) { return this._foes.indexOf(ent) >= 0; }

        // ---------------------------------------------------------------------
        // Opening and joining
        // ---------------------------------------------------------------------
        // The fight opens on `ent` and on nothing else: anything else that
        // wants in comes in through join(), on its own feet.
        begin(ent) {
            if (this.active) return this.join(ent);
            if (!ent || !ent.alive || ent.dead) return false;
            if (typeof BattleManager === 'undefined' || typeof $gameTroop === 'undefined') return false;
            const troopId = troopForBioEnemy(ent.enemyId);
            if (!troopId) return false;
            const BSE = window.BattleSystemEnhanced;
            // No map event stands behind a creature out here, and its wounds
            // are its own record (bioPersistentRecord), so the battle system's
            // per-event bookkeeping is told there is none.
            if (BSE && BSE.State) {
                BSE.State.currentBattleEventId = null;
                BSE.State.currentEventId = 0;
                BSE.State.reinforcement = null;
            }
            // The 2D screen's weather and pictures survive the setup: the
            // engine clears them for a battle, and a creature walked into out
            // here is not a reason for the map to come back without its rain.
            const screen = (typeof $gameScreen !== 'undefined' && $gameScreen) ? {
                type: $gameScreen._weatherType, power: $gameScreen._weatherPower,
                duration: $gameScreen._weatherDuration, pictures: $gameScreen._pictures
            } : null;
            try {
                BattleManager.setup(troopId, true, false);
            } catch (e) {
                console.error('[VoxelWorld] combat setup', e);
                return false;
            } finally {
                if (screen) {
                    $gameScreen._weatherType = screen.type;
                    $gameScreen._weatherPower = screen.power;
                    $gameScreen._weatherDuration = screen.duration;
                    if (screen.pictures) $gameScreen._pictures = screen.pictures;
                }
            }
            // The battle system refuses a setup now and then (a window up, a
            // journey running): the troop is then still the LAST fight's, and
            // fighting that would pay its spoils twice.
            const first = $gameTroop.members()[0];
            if (!first || $gameTroop._troopId !== troopId || !first.isAlive() ||
                first.enemyId() !== ent.enemyId) return false;
            // One creature, one battler: the troop is the fight, not the table.
            $gameTroop._enemies.length = 1;

            this.active = true;
            this._ending = false;
            this._t = 0;
            this._awayT = 0;
            this._foes = [];
            this._clock.clear();
            this._plans.clear();
            this._downed.clear();
            try {
                $gameSystem.onBattleStart();
                $gameParty.onBattleStart(false);
                $gameTroop.onBattleStart(false);
            } catch (e) { console.error('[VoxelWorld] combat start', e); }
            try {
                BattleManager.saveBgmAndBgs();
                BattleManager.playBattleBgm();
            } catch (e) { /* no music is not a reason to stop */ }
            for (const a of this._party()) {
                this._clock.set(a, this._interval(a) * (0.2 + Math.random() * 0.5));
            }
            this._bind(ent, first);
            if (this._host && this._host._onCombatBegin) this._host._onCombatBegin(ent);
            return true;
        }

        // A creature walks into a fight already under way.
        join(ent) {
            if (!this.active) return this.begin(ent);
            if (!ent || !ent.alive || ent.dead || this.isFoe(ent)) return false;
            if (typeof Game_Enemy === 'undefined') return false;
            let battler;
            try { battler = new Game_Enemy(ent.enemyId, 0, 0); } catch (e) { return false; }
            $gameTroop._enemies.push(battler);
            try { battler.onBattleStart(false); } catch (e) { /* it fights all the same */ }
            this._bind(ent, battler);
            return true;
        }

        _bind(ent, battler) {
            const rec = bioPersistentRecord(ent);
            const hp = rec && rec.enemyHp ? rec.enemyHp[0] : undefined;
            if (hp !== undefined && hp !== null) {
                battler.setHp(Math.max(1, Math.min(battler.mhp, Number(hp) || 1)));
            }
            ent.battler = battler;
            battler._vwEnt = ent;
            ent.fight = { x: ent.x, z: ent.z, range: COMBAT.REACH_MIN, strike: false, faceAway: false };
            ent.fightActor = null;
            ent.state = 'commit';
            ent.sprung = false;
            ent.prey = null;
            ent.threat = null;
            ent.spooked = 0;
            this._foes.push(ent);
            this._clock.set(battler, this._t + this._interval(battler) * (0.4 + Math.random() * 0.6));
            setPlateHp(ent.plate, battler.hpRate());
        }

        // ---------------------------------------------------------------------
        // Who is in it
        // ---------------------------------------------------------------------
        _party() {
            return (typeof $gameParty !== 'undefined' && $gameParty) ? $gameParty.battleMembers() : [];
        }
        _leader() {
            return (typeof $gameParty !== 'undefined' && $gameParty) ? $gameParty.leader() : null;
        }
        _foeBattlers() {
            return this._foes.map(e => e.battler).filter(b => b && b.isAlive() && !b._vwGone);
        }

        // Where a fighter stands. The leader is the eye; an ally is their card
        // in the line; a creature is its model. y is the middle of the body.
        _posOf(b) {
            const H = this._host;
            if (b && b.isEnemy && b.isEnemy()) {
                const ent = b._vwEnt;
                if (ent) {
                    const y = (ent.y != null ? ent.y : 0) + (ent.hgt || 8) * 0.5;
                    return { x: ent.x, y, z: ent.z };
                }
            }
            const here = H && H._contactPoint ? H._contactPoint() : { x: 0, y: 0, z: 0 };
            if (b && b !== this._leader() && H && H._followers && H._followers.memberFor) {
                const m = H._followers.memberFor(b);
                if (m && m.placed) return { x: m.x, y: (m.y || 0) + PERSON_H * 0.5, z: m.z };
            }
            return { x: here.x, y: here.y != null ? here.y : 0, z: here.z };
        }

        // Where a hit on somebody is SHOWN: the leader's own wounds come up in
        // front of the eye rather than inside it.
        _fxPos(b) {
            const H = this._host;
            if (b && b === this._leader() && H && H._cameraYaw) {
                const p = this._posOf(b);
                const yaw = H._cameraYaw();
                return {
                    x: p.x - Math.sin(yaw) * COMBAT.LEADER_FX_D,
                    y: p.y - 3,
                    z: p.z - Math.cos(yaw) * COMBAT.LEADER_FX_D
                };
            }
            return this._posOf(b);
        }

        _dist(a, b) {
            const p = this._posOf(a), q = this._posOf(b);
            return Math.hypot(p.x - q.x, p.z - q.z);
        }

        // ---------------------------------------------------------------------
        // Clocks
        // ---------------------------------------------------------------------
        // A battler acts once an interval, the interval set by its AGI against
        // everybody else's in the fight: twice as quick as the middle of the
        // field acts about half again as often.
        _interval(b) {
            const all = this._party().concat(this._foeBattlers());
            let sum = 0, n = 0;
            for (const x of all) { if (x && x.agi > 0) { sum += x.agi; n++; } }
            const ref = n ? sum / n : 1;
            const agi = Math.max(1, (b && b.agi) || 1);
            const k = Math.sqrt(ref / agi);
            return Math.max(COMBAT.INTERVAL_MIN, Math.min(COMBAT.INTERVAL_MAX, COMBAT.BASE_INTERVAL * k));
        }

        // What an action costs on top of the wait. There is no cooldown tag on
        // any skill; the price of one is what it spends.
        recoveryFor(b, item) {
            if (!item) return COMBAT.RECOVERY_BASE;
            let mp = 0, tp = 0;
            try {
                if (b && b.skillMpCost && DataManager.isSkill(item)) mp = b.skillMpCost(item);
                if (b && b.skillTpCost && DataManager.isSkill(item)) tp = b.skillTpCost(item);
            } catch (e) { /* costs unreadable: the base it is */ }
            const reps = Math.max(1, (item.repeats || 1)) - 1;
            return COMBAT.RECOVERY_BASE + mp * COMBAT.RECOVERY_MP +
                tp * COMBAT.RECOVERY_TP + reps * COMBAT.RECOVERY_REPEAT;
        }

        _ready(b) { return this._t >= (this._clock.get(b) || 0); }
        _rest(b, item) {
            this._clock.set(b, this._t + this._interval(b) + this.recoveryFor(b, item));
        }

        // How far an action reaches, in world units. The plain attack reaches
        // as far as the weapon (or the creature's own <Range:>), a skill as far
        // as its tag, and a skill on oneself does not reach anywhere at all.
        rangeOf(b, item) {
            if (item && item.scope === 11) return Infinity;
            const attack = !item || (b && b.attackSkillId && item.id === b.attackSkillId() &&
                DataManager.isSkill(item));
            if (attack) {
                if (b && b.isActor && b.isActor()) {
                    if (b.isOutOfBullets && b.isOutOfBullets()) return reachOfSteps(1);
                    let best = 0;
                    for (const w of (b.weapons ? b.weapons() : [])) best = Math.max(best, metaSteps(w, 'Range'));
                    return reachOfSteps(best || 1);
                }
                const data = b && b.enemy ? b.enemy() : null;
                return reachOfSteps(metaSteps(data, 'Range') || 1);
            }
            return reachOfSteps(metaSteps(item, 'Range') || COMBAT.SKILL_STEPS);
        }

        // Is it a shot or a spell that has to cross the gap, or a blow?
        _isRanged(b, item) {
            const steps = (!item || (b.attackSkillId && item.id === b.attackSkillId()))
                ? this.rangeOf(b, item) / COMBAT.REACH_STEP
                : (metaSteps(item, 'Range') || COMBAT.SKILL_STEPS);
            return steps > 2;
        }

        // ---------------------------------------------------------------------
        // One frame of the fight
        // ---------------------------------------------------------------------
        update(delta) {
            const H = this._host;
            const cam = H && H._camera ? H._camera.position : { x: 0, z: 0 };
            if (this._bolts) this._bolts.update(delta);
            if (this._popups) this._popups.update(delta, cam.x, cam.z);
            if (!this.active) return;
            this._t += delta;

            // A creature the world took away (recycled, dug out from under)
            // leaves the fight as if it had run.
            for (let i = this._foes.length - 1; i >= 0; i--) {
                const ent = this._foes[i];
                if (!ent.alive) this._release(ent, i);
            }

            const leader = this._leader();
            const lp = leader ? this._posOf(leader) : { x: 0, z: 0 };
            const yaw = H && H._cameraYaw ? H._cameraYaw() : 0;

            // Where every creature is going, and whether it is ready to strike.
            for (let i = this._foes.length - 1; i >= 0; i--) {
                const ent = this._foes[i];
                const b = ent.battler;
                if (!b || ent.dead) continue;
                if (b.isDead()) { this._fell(b); continue; }
                const tgt = this._foeTarget(ent);
                ent.fightActor = tgt;
                const p = tgt ? this._posOf(tgt) : lp;
                const plan = this._plans.get(b);
                const f = ent.fight || (ent.fight = {});
                f.x = p.x; f.z = p.z;
                f.range = this.rangeOf(b, plan ? plan.item : null);
                f.strike = this._ready(b);
                f.faceAway = tgt === leader ? facesAway(yaw, ent.x - lp.x, ent.z - lp.z) : true;
                setPlateHp(ent.plate, b.hpRate());
                // A creature whose nature is to run leaves the fight once it is
                // past its leash; it lives to be met again.
                const beh = ent.beh || {};
                if ((beh.react === 'flee' || beh.react === 'coward') &&
                    Math.hypot(ent.x - lp.x, ent.z - lp.z) > (beh.leash || 10) * TILE_UNITS) {
                    this._release(ent, i);
                }
            }

            for (const ent of this._foes.slice()) this._foeAct(ent);
            for (const a of this._party()) if (a !== leader) this._allyAct(a);
            for (const a of this._party()) {
                if (a.isDead() && !this._downed.has(a)) this._fell(a);
                else if (a.isAlive()) this._downed.delete(a);
            }

            // The leader went down and somebody is still standing: they lead.
            if (leader && leader.isDead() && !$gameParty.isAllDead() &&
                H && H._handOffLeader) {
                H._handOffLeader();
            }

            if ($gameParty.isAllDead()) { this.finish('lose'); return; }
            if (!this._foes.some(e => e.battler && e.battler.isAlive())) {
                const anyDead = $gameTroop.members().some(e => e.isDead());
                this.finish(anyDead ? 'win' : 'escape');
                return;
            }
            // Out of reach of every one of them for long enough: got away.
            let nearest = Infinity;
            for (const ent of this._foes) {
                if (!ent.battler || !ent.battler.isAlive()) continue;
                nearest = Math.min(nearest, Math.hypot(ent.x - lp.x, ent.z - lp.z));
            }
            this._awayT = nearest > COMBAT.DISENGAGE_R ? this._awayT + delta : 0;
            if (this._awayT >= COMBAT.ESCAPE_SECS) this.finish('escape');
        }

        // Who a creature is after: the one it was already after, unless
        // somebody else has come a good deal closer.
        _foeTarget(ent) {
            let best = null, bestD = Infinity;
            for (const a of this._party()) {
                if (!a.isAlive()) continue;
                const p = this._posOf(a);
                const d = Math.hypot(p.x - ent.x, p.z - ent.z);
                if (d < bestD) { best = a; bestD = d; }
            }
            const cur = ent.fightActor;
            if (cur && cur.isAlive() && this._party().indexOf(cur) >= 0) {
                const p = this._posOf(cur);
                const d = Math.hypot(p.x - ent.x, p.z - ent.z);
                if (d <= bestD * 2) return cur;
            }
            return best;
        }

        // ---------------------------------------------------------------------
        // A creature's turn
        // ---------------------------------------------------------------------
        _foeAct(ent) {
            const b = ent.battler;
            if (!b || !b.isAlive() || ent.dead || !this._ready(b)) return;
            if (!b.canMove()) { this._rest(b, null); return; }
            let plan = this._plans.get(b);
            if (!plan) {
                let item = null;
                try {
                    b.makeActions();
                    const act = b.currentAction();
                    item = act ? act.item() : null;
                } catch (e) { item = null; }
                try { b.clearActions(); } catch (e) { /* nothing queued */ }
                if (!item) { this._rest(b, null); return; }
                plan = { item, since: this._t };
                this._plans.set(b, plan);
            }
            const item = plan.item;
            let targets;
            if (isForFriendScope(item)) {
                targets = this._friendTargets(b, item, this._foeBattlers(), []);
            } else {
                const tgt = ent.fightActor;
                if (!tgt || !tgt.isAlive()) return;
                const p = this._posOf(tgt);
                const d = Math.hypot(p.x - ent.x, p.z - ent.z);
                const gy = this._host && this._host._terrain
                    ? this._host._terrain.getTerrainHeight(p.x / WORLD_TILE_SIZE, p.z / WORLD_TILE_SIZE) : 0;
                const high = ent.flies && ent.y != null && (ent.y - gy) > COMBAT.FLY_STRIKE_H;
                if (d > this.rangeOf(b, item) || high) {
                    if (this._t - plan.since > COMBAT.PLAN_GIVEUP) this._plans.delete(b);
                    return;
                }
                targets = this._opponentTargets(item, tgt, this._party().filter(a => a.isAlive()));
            }
            this._plans.delete(b);
            if (!targets.length) { this._rest(b, null); return; }
            this._perform(b, item, targets);
            this._rest(b, item);
        }

        // ---------------------------------------------------------------------
        // An ally's turn
        // ---------------------------------------------------------------------
        // What a member of the party does with their turn is what the player
        // would have them do with the same nine skills: the most damage for
        // what it costs, a heal when somebody is hurt, somebody fetched back
        // when they are down.
        _allyAct(actor) {
            if (!actor || !actor.isAlive() || !this._ready(actor)) return;
            if (!actor.canMove()) { this._rest(actor, null); return; }
            let plan = this._plans.get(actor);
            if (plan && !this._planStands(plan)) { this._plans.delete(actor); plan = null; }
            if (!plan) {
                plan = this._allyChoose(actor);
                if (!plan) { this._rest(actor, null); return; }
                plan.since = this._t;
                this._plans.set(actor, plan);
            }
            const item = plan.item;
            const range = this.rangeOf(actor, item);
            if (range !== Infinity && this._dist(actor, plan.target) > range) {
                if (this._t - plan.since > COMBAT.PLAN_GIVEUP) this._plans.delete(actor);
                return;
            }
            const targets = isForFriendScope(item)
                ? this._friendTargets(actor, item, this._party().filter(a => a.isAlive()),
                    this._party().filter(a => a.isDead()), plan.target)
                : this._opponentTargets(item, plan.target, this._foeBattlers());
            this._plans.delete(actor);
            if (!targets.length) { this._rest(actor, null); return; }
            try { if (!actor.canUse(item)) { this._rest(actor, null); return; } } catch (e) { return; }
            actor.useItem(item);
            this._perform(actor, item, targets);
            this._rest(actor, item);
        }

        _planStands(plan) {
            const t = plan.target;
            if (!t) return false;
            if (isForDeadScope(plan.item)) return t.isDead();
            if (!t.isAlive()) return false;
            if (t.isEnemy && t.isEnemy() && (!t._vwEnt || !this.isFoe(t._vwEnt))) return false;
            return true;
        }

        _allyChoose(actor) {
            const foes = this._foeBattlers();
            const party = this._party();
            const hurt = party.filter(a => a.isAlive() && a.hpRate() < COMBAT.LOW_HP);
            const dead = party.filter(a => a.isDead());
            let nearFoe = null, nd = Infinity;
            for (const f of foes) {
                const d = this._dist(actor, f);
                if (d < nd) { nd = d; nearFoe = f; }
            }
            const skills = [];
            if (actor.attackSkillId && $dataSkills[actor.attackSkillId()]) skills.push($dataSkills[actor.attackSkillId()]);
            const ids = window.BattleLoadout && window.BattleLoadout.ids
                ? window.BattleLoadout.ids(actor) : [];
            for (const id of ids) if ($dataSkills[id]) skills.push($dataSkills[id]);

            let best = null, bestScore = -1;
            for (const skill of skills) {
                let usable = false;
                try { usable = actor.canUse(skill); } catch (e) { usable = false; }
                if (!usable) continue;
                const action = new Game_Action(actor);
                action.setSkill(skill.id);
                let target = null, score = 0;
                if (isForFriendScope(skill)) {
                    if (isForDeadScope(skill)) {
                        target = dead[0] || null;
                        score = target ? 2 : 0;
                    } else if (hurt.length && (action.isHpRecover() ||
                               (skill.effects || []).some(e => e.code === 11))) {
                        target = hurt.slice().sort((a, b) => a.hpRate() - b.hpRate())[0];
                        try { score = (action.evaluateWithTarget(target) || 0) + 0.5; }
                        catch (e) { score = 0.5; }
                    }
                } else if (nearFoe) {
                    target = nearFoe;
                    try { score = action.evaluateWithTarget(target) || 0; } catch (e) { score = 0; }
                    if (isForAllScope(skill)) score *= Math.max(1, this._near(foes, target).length);
                    if (skill.id === actor.attackSkillId()) score = Math.max(score, 0.05);
                    else if (score <= 0) score = 0.03 * Math.random();
                }
                if (!target) continue;
                score *= 0.85 + Math.random() * 0.3;
                if (score > bestScore) { bestScore = score; best = { item: skill, target }; }
            }
            return best;
        }

        // Where an ally is heading: into reach of what they mean to do next,
        // and never further from the leader than the leash. Null leaves them
        // at the leader's side.
        allyGoal(m) {
            if (!this.active || !m || !m.actor) return null;
            const actor = m.actor;
            let plan = this._plans.get(actor);
            let target = plan ? plan.target : null;
            let item = plan ? plan.item : null;
            if (!target) {
                let nd = Infinity;
                for (const f of this._foeBattlers()) {
                    const d = this._dist(actor, f);
                    if (d < nd) { nd = d; target = f; }
                }
            }
            if (!target) return null;
            const range = this.rangeOf(actor, item);
            if (range === Infinity) return null;
            const tp = this._posOf(target);
            const dx = m.x - tp.x, dz = m.z - tp.z;
            const d = Math.hypot(dx, dz) || 1;
            const want = Math.min(d, range * 0.8);
            let gx = tp.x + dx / d * want, gz = tp.z + dz / d * want;
            const lp = this._posOf(this._leader());
            const ld = Math.hypot(gx - lp.x, gz - lp.z);
            if (ld > COMBAT.ALLY_LEASH) {
                gx = lp.x + (gx - lp.x) / ld * COMBAT.ALLY_LEASH;
                gz = lp.z + (gz - lp.z) / ld * COMBAT.ALLY_LEASH;
            }
            return { x: gx, z: gz };
        }

        // ---------------------------------------------------------------------
        // Targets
        // ---------------------------------------------------------------------
        _near(pool, centre) {
            const c = this._posOf(centre);
            return pool.filter(b => {
                const p = this._posOf(b);
                return Math.hypot(p.x - c.x, p.z - c.z) <= COMBAT.BLAST_R;
            });
        }

        _opponentTargets(item, primary, pool) {
            if (!primary) return [];
            if (isForAllScope(item)) {
                const hit = this._near(pool, primary);
                if (hit.indexOf(primary) < 0) hit.unshift(primary);
                return hit;
            }
            return [primary];
        }

        _friendTargets(subject, item, alive, dead, prefer) {
            const s = item ? item.scope : 0;
            if (s === 11) return [subject];
            if (isForDeadScope(item)) {
                const pool = dead || [];
                if (s === 10) return pool.slice();
                return prefer && pool.indexOf(prefer) >= 0 ? [prefer] : pool.slice(0, 1);
            }
            if (isForAllScope(item)) return alive.slice();
            if (prefer && alive.indexOf(prefer) >= 0) return [prefer];
            const sorted = alive.slice().sort((a, b) => a.hpRate() - b.hpRate());
            return sorted.slice(0, 1);
        }

        // ---------------------------------------------------------------------
        // Doing it
        // ---------------------------------------------------------------------
        // The one way anybody does anything out here. `paid` when the cost has
        // already been taken (the spell bar pays as it casts).
        cast(subject, item, targets, paid) {
            if (!subject || !item || !targets || !targets.length) return false;
            if (!subject.isAlive || !subject.isAlive()) return false;
            if (!paid) {
                let ok = false;
                try { ok = subject.canUse(item); } catch (e) { ok = false; }
                if (!ok) return false;
                subject.useItem(item);
            }
            this._land(subject, item, targets);
            return true;
        }

        // A creature's or an ally's action: a blow lands at once, a shot or a
        // spell flies first. An ally has paid for it already (_allyAct); a
        // creature pays here.
        _perform(subject, item, targets) {
            const ent = subject.isEnemy && subject.isEnemy() ? subject._vwEnt : null;
            const magical = !!(item && item.hitType === 2);
            if (ent) {
                try { if (!subject.canUse(item)) return; subject.useItem(item); } catch (e) { return; }
                playCreatureClip(ent, magical ? 'cast' : 'attack');
            } else if (this._host && this._host._followers && this._host._followers.memberFor) {
                const m = this._host._followers.memberFor(subject);
                if (m) m.lungeT = 0.3;
            }
            if (!this._isRanged(subject, item) || !this._bolts) {
                this._land(subject, item, targets);
                return;
            }
            const from = this._posOf(subject);
            const first = targets[0];
            this._bolts.launch(from, () => this._fxPos(first), boltColour(item),
                () => { if (this.active) this._land(subject, item, targets); });
        }

        // What it does, to each of them, through the battle's own Game_Action.
        _land(subject, item, targets) {
            if (typeof Game_Action === 'undefined') return;
            const action = new Game_Action(subject, false);
            if (DataManager.isSkill(item)) action.setSkill(item.id);
            else action.setItem(item.id);
            // A creature fighting on its own is in no troop; the action is told
            // straight who is doing it rather than looking it up by index.
            action.subject = function () { return subject; };
            const BSE = window.BattleSystemEnhanced;
            try {
                if (BSE && BSE.Helpers && BSE.Helpers.rollStatReqFumble) BSE.Helpers.rollStatReqFumble(action);
            } catch (e) { /* no fumble rule loaded */ }
            const H = this._host;
            let anim = item.animationId;
            if (anim < 0) anim = subject.isActor && subject.isActor() && subject.attackAnimationId1
                ? subject.attackAnimationId1() : 0;
            // No friendly fire out here: whatever is aimed at the other side
            // only ever lands on the other side, whatever picked the targets
            // (a confused battler, an area that swept up somebody of its own).
            const sideOf = (b) => !!(b && b.isActor && b.isActor());
            const hostile = !isForFriendScope(item);
            const mine = sideOf(subject);
            for (const t of targets) {
                if (hostile && t && sideOf(t) === mine) continue;
                if (!t) continue;
                const fx = this._fxPos(t);
                if (anim > 0 && H && H._spellFx) {
                    try { H._spellFx.play(anim, fx.x, fx.y, fx.z); } catch (e) { /* no FX context */ }
                }
                let reps = 1;
                try { reps = Math.max(1, action.numRepeats()); } catch (e) { reps = 1; }
                for (let r = 0; r < reps; r++) {
                    if (!isForDeadScope(item) && t.isDead()) break;
                    try { action.apply(t); } catch (e) { console.error('[VoxelWorld] combat action', e); break; }
                    this._report(t, t.result());
                }
                if (t.isDead()) this._fell(t);
            }
            try { action.applyGlobal(); } catch (e) { /* a common event that cannot run out here */ }
        }

        // The number over whoever was hit, and the sound of it.
        _report(target, result) {
            if (!result) return;
            const p = this._fxPos(target);
            const say = (text, colour) => { if (this._popups) this._popups.add(p.x, p.y + 2, p.z, text, colour); };
            const SM = typeof SoundManager !== 'undefined' ? SoundManager : null;
            if (result.missed || result.evaded) {
                say(T('VoxelWorld.combat.miss'), '#d8d8d8');
                if (SM) { if (result.evaded) SM.playEvasion(); else SM.playMiss(); }
                return;
            }
            if (result.hpAffected) {
                const v = result.hpDamage;
                if (v > 0) {
                    say(String(v), result.critical ? '#ffd54a' : (target.isActor() ? '#ff6a5a' : '#ffffff'));
                    if (SM) { if (target.isActor()) SM.playActorDamage(); else SM.playEnemyDamage(); }
                } else if (v < 0) {
                    say('+' + (-v), '#7dff8a');
                    if (SM) SM.playRecovery();
                }
            }
            if (target.isEnemy && target.isEnemy() && target._vwEnt) {
                playCreatureClip(target._vwEnt, 'hit');
                setPlateHp(target._vwEnt.plate, target.hpRate());
            }
        }

        // Somebody went down.
        _fell(b) {
            const H = this._host;
            if (b.isEnemy && b.isEnemy()) {
                const ent = b._vwEnt;
                if (!ent || ent.dead) return;
                ent.fight = null;
                ent.fightActor = null;
                bioForget(ent);
                // The collapse is already heard: Game_Enemy.die performs it
                // while the party is in a fight.
                if (H && H._layOutBody) H._layOutBody(ent);
                return;
            }
            if (this._downed.has(b)) return;
            this._downed.add(b);
            if (typeof SoundManager !== 'undefined') SoundManager.playActorCollapse();
            if (window.ParchmentToast) {
                window.ParchmentToast.show(T('VoxelWorld.combat.down', { name: b.name() }),
                    { key: 'vwcombat', severity: 'danger' });
            }
        }

        // A creature leaves the fight alive (ran, or the world took it): its
        // wounds go with it into its own record.
        _release(ent, index) {
            const b = ent.battler;
            if (b) {
                b._vwGone = true;
                if (b.isAlive()) bioWriteHp(ent, b.hp);
                // Out of the troop as well: a creature that ran is not paid
                // for in knowledge or spoils at the end.
                const k = $gameTroop._enemies.indexOf(b);
                if (k >= 0) $gameTroop._enemies.splice(k, 1);
            }
            ent.fight = null;
            ent.fightActor = null;
            ent.battler = null;
            ent.state = 'idle';
            if (ent.alive && !ent.dead) ent.spooked = Math.max(ent.spooked || 0, 10);
            setPlateHp(ent.plate, null);
            if (index != null && index >= 0) this._foes.splice(index, 1);
        }

        // ---------------------------------------------------------------------
        // What the leader does (the scene calls these)
        // ---------------------------------------------------------------------
        // A blow struck or a shot fired at a creature under the crosshair.
        strike(ent) {
            const a = this._leader();
            if (!a || !a.isAlive() || !ent || ent.dead) return false;
            if (!this.isFoe(ent) && !this.join(ent)) return false;
            if (a.isOutOfBullets && a.isOutOfBullets() && window.ParchmentToast) {
                window.ParchmentToast.show(T('VoxelWorld.combat.empty'), { key: 'vwammo' });
            }
            const skill = $dataSkills[a.attackSkillId()];
            return this.cast(a, skill, [ent.battler]);
        }

        // Where one of the leader's spells burst, and who it caught. The spell
        // bar has already paid for it.
        burst(skill, ents) {
            const a = this._leader();
            if (!a || !skill) return false;
            const targets = [];
            for (const ent of ents) {
                if (!ent || ent.dead || !ent.alive) continue;
                if (!this.isFoe(ent) && !(this.active ? this.join(ent) : this.begin(ent))) continue;
                if (ent.battler) targets.push(ent.battler);
            }
            if (!targets.length) return false;
            return this.cast(a, skill, isForAllScope(skill) ? targets : targets.slice(0, 1), true);
        }

        // A spell or a skill the leader turns on the party: no bolt, it lands
        // on whoever it is for, chosen the way an ally would choose.
        friendlyCast(skill) {
            const a = this._leader();
            if (!a || !skill) return false;
            const party = this._party();
            const targets = this._friendTargets(a, skill, party.filter(x => x.isAlive()),
                party.filter(x => x.isDead()));
            return this.cast(a, skill, targets);
        }

        // ---------------------------------------------------------------------
        // The end of it
        // ---------------------------------------------------------------------
        //   'win'     every creature in it is down (rewards for the ones that are)
        //   'escape'  the party got clear, or everything in it ran
        //   'lose'    nobody in the party is standing
        finish(result) {
            if (!this.active) return;
            this.active = false;
            this._ending = true;
            const won = result === 'win';
            for (const ent of this._foes) {
                const b = ent.battler;
                ent.fight = null;
                ent.fightActor = null;
                if (b && b.isAlive() && !ent.dead) {
                    bioWriteHp(ent, b.hp);
                    ent.state = 'idle';
                    if (!won) ent.spooked = Math.max(ent.spooked || 0, 12);
                }
                setPlateHp(ent.plate, null);
                ent.battler = null;
            }
            const BSE = window.BattleSystemEnhanced;
            try {
                if (won) {
                    // The spoils, the way the battle pays them: knowledge first,
                    // then the engine's own exp, gold and drops. The levels they
                    // buy are held for the popup while the fight still reads as
                    // a fight (BattleSystemEnhancedState's displayLevelUp).
                    if (BSE && BSE.Functions && BSE.Functions.payVictoryKnowledge) BSE.Functions.payVictoryKnowledge();
                    BattleManager.makeRewards();
                    BattleManager.gainRewards();
                    BattleManager.playVictoryMe();
                    if (window.BattleMood && window.BattleMood.onVictory) window.BattleMood.onVictory();
                    $gameSystem.onBattleWin();
                } else if (result === 'escape') {
                    $gameSystem.onBattleEscape();
                    const r = BSE && BSE.State && BSE.State.battleRewards;
                    if (r) { r.exp = 0; r.gold = 0; r.items = []; r.knowledge = 0; }
                } else if (result === 'lose' && this._host && this._host._standalone) {
                    // Free play (the title screen's Liminal World) runs on a
                    // throwaway party with no map to wake up on: no wipe, no
                    // permadeath, no respawn. The party is stood back up and
                    // the scene takes them back to the list they came from.
                    for (const a of this._party()) { if (a && a.recoverAll) a.recoverAll(); }
                } else if (result === 'lose') {
                    // The battle system's own defeat: permadeath, the wipe, who
                    // comes round where. Its scene change is held off
                    // (VoxelWorldSystem's updateBattleEnd) - there is no battle
                    // scene to leave - and the map takes it from there.
                    BattleManager.processDefeat();
                    $gameSystem.setBattleEnded(true);
                }
            } catch (e) { console.error('[VoxelWorld] combat end', e); }
            try {
                $gameParty.onBattleEnd();
                $gameTroop.onBattleEnd();
            } catch (e) { console.error('[VoxelWorld] combat teardown', e); }
            if (result !== 'lose') {
                try { BattleManager.replayBgmAndBgs(); } catch (e) { /* no music to put back */ }
            }
            if (won) {
                const sc = typeof SceneManager !== 'undefined' ? SceneManager._scene : null;
                if (sc && sc.createRewardsPopup) {
                    try { sc.createRewardsPopup(); } catch (e) { /* nothing to show */ }
                }
            } else if (result === 'escape' && window.ParchmentToast) {
                window.ParchmentToast.show(T('VoxelWorld.combat.escaped'), { key: 'vwcombat' });
            }
            this._plans.clear();
            this._clock.clear();
            this._downed.clear();
            this._foes = [];
            this._ending = false;
            if (this._host && this._host._onCombatEnd) this._host._onCombatEnd(result);
        }

        // The world is going away in the middle of a fight (a teleport, the
        // party leaving it): the creatures keep their wounds, the party keeps
        // what it has, and nothing is paid or lost.
        abort() {
            if (this.active) {
                this.active = false;
                this._ending = true;
                for (const ent of this._foes) {
                    const b = ent.battler;
                    if (b && b.isAlive() && !ent.dead) bioWriteHp(ent, b.hp);
                    ent.fight = null;
                    ent.fightActor = null;
                    ent.battler = null;
                }
                try { $gameParty.onBattleEnd(); $gameTroop.onBattleEnd(); } catch (e) { /* already gone */ }
                try { BattleManager.replayBgmAndBgs(); } catch (e) { /* no music */ }
                this._foes = [];
                this._plans.clear();
                this._clock.clear();
                this._ending = false;
            }
            if (this._bolts) this._bolts.clear();
            if (this._popups) this._popups.clear();
        }
    }

    // Handed to the rest of the suite.
    Object.assign(VW, {
        CombatSession, CombatPopups, CombatBolts, COMBAT, setPlateHp, facesAway,
        isForFriendScope, reachOfSteps,
        BiomeEnemyManager, ParkedVehicles, BuildingInteriors, CityCrowd, ENEMY_3D_CONTACT_R,
        ENEMY_3D_DESPAWN, ENEMY_3D_MAX, ENEMY_3D_SPAWN_INT, ENEMY_PLATE_COLORS,
        ENEMY_PLATE_K, ENEMY_PLATE_MAX, ENEMY_PLATE_MIN, ENEMY_PLATE_RANGE,
        FollowerCrowd, _bioTroopByEnemy, bioBuildTroopIndex, bioTroopHoldsEnemy,
        enemyLevelBand, enemyLevelOf, makeEnemyPlate, troopForBioEnemy
    });
})();
