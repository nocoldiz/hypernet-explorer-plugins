//=============================================================================
// VoxelWorldSystem.js
// VoxelWorld: public entry points, plugin commands and engine hooks
//
// The last module of the suite and the only one anything outside it talks to.
// It owns the running scene, the plugin commands, and the handful of engine
// hooks the 3D world needs while it is up.
//
// window.CamperDrivingSystem is kept as an alias: the title screen, the world
// map return and the vehicle system all reach for that name, and a rename is
// not a reason to break them.
//=============================================================================

/*:
 * @target MZ
 * @plugindesc VoxelWorld - entry points, plugin commands and engine hooks
 * @author Omni-Lex
 *
 * @help
 * The way into VoxelWorld: a 3D world of destructible voxels laid over the
 * game's own 256x256 world map, driven through in the camper or walked on
 * foot.
 *
 * The ground is cubes. It can be dug into, tunnelled through and built back
 * up, and what a world has had done to it is kept with that world: a trench
 * cut on the way east is still there on the way back. Water is still water and
 * the vegetation is still 2D billboards, exactly as they were.
 *
 * Activates automatically when camper fast travel starts.
 *
 * Load order (fixed in plugins.js):
 *   Core, Field, Settlements, Decor, Terrain, Actors, HUD, Fx, Traffic,
 *   Entities, Warp, Autopilot, Digging, Scene, System
 *
 * @command StartDriving
 * @text Start Voxel World
 * @desc Manually launch the 3D voxel driving scene.
 *
 * @arg duration
 * @type number
 * @min 1
 * @default 60
 * @text Duration (seconds)
 * @desc How long the driving scene lasts.
 *
 * @arg destinationName
 * @type string
 * @default Destination
 * @text Destination Name
 * @desc Name shown on the HUD.
 *
 * @arg totalKm
 * @type number
 * @min 1
 * @default 100
 * @text Total Distance (km)
 * @desc Total trip distance displayed on the HUD.
 *
 * @command StartFreeWalk
 * @text Start Free Walk
 * @desc Walk the voxel world on foot from the party's world square, with no camper in the scene.
 *
 * @command ResetDigging
 * @text Reset Digging
 * @desc Put every cube this world has had dug out of it back, everywhere.
 *
 * @command OpenShipBridge
 * @text Open the Ship's Bridge
 * @desc Step onto the starship's bridge and fly it by hand, from wherever it is.
 */

(() => {
    'use strict';

    const VW = window.VoxelWorld;
    if (!VW) { console.error('[VoxelWorld] core not loaded before VoxelWorldSystem.js'); return; }

    const {
        FUEL_PER_KM, VoxelWorldScene, roadDataReady, buildingScene
    } = VW;

    // =========================================================================
    // Building one, when building one can fail
    // =========================================================================
    // Every way into this world goes through here. Raising it is a long job
    // that reaches into half the game - the field, the settlements, the decor,
    // the 3D battler families, the weapon overlay, the quick bar, the HUD - and
    // any one of those throwing takes the whole `new` expression with it.
    //
    // What that used to leave behind is worse than the exception: the scene had
    // already put its overlay on the page (a full-screen, opaque layer at the
    // top of the stack), `this._scene` was never assigned, and isActive() then
    // answered "no" for the rest of the session - so nothing, not stop(), not
    // the title screen's sweep, not the world map's return, would ever take
    // that rectangle down again. The game went on running underneath it, out of
    // sight and out of reach.
    //
    // The half-built scene is disposed instead (it publishes itself while its
    // constructor runs, see VoxelWorldScene's BUILDING), the page is swept of
    // anything it left, and the caller is handed null - which every caller
    // already has to handle, since startTitleDrive has always been able to
    // return it.
    function build(...args) {
        try {
            return new VoxelWorldScene(...args);
        } catch (e) {
            console.error('[VoxelWorld] could not raise the world', e);
            const half = buildingScene ? buildingScene() : null;
            if (half) { try { half.dispose(); } catch (e2) { console.error('[VoxelWorld] build cleanup', e2); } }
            detachGroundSprite();
            sweepOverlays();
            return null;
        }
    }

    // =========================================================================
    // VoxelWorldSystem, static entry point
    // =========================================================================
    const VoxelWorldSystem = {
        _scene: null,
        // `vehicle` is the key of whatever the party is driving out there
        // ('camper' | 'car' | 'bike' | 'boat' | 'broom' | 'starship'). It decides
        // how the thing drives and what is drawn under the party; left out, it is
        // the camper, which is what every existing caller means.
        start(duration, destinationName, totalKm, vehicle) {
            if (this._scene) this.stop();
            const data     = (typeof $gameSystem !== 'undefined') ? $gameSystem.getFastTravelData() : null;
            const fuelCost = data ? (data.totalDistanceKm * FUEL_PER_KM) : 0;
            this._scene = build(
                duration,
                typeof destinationName === 'string' ? destinationName
                    : (destinationName?.name || T('CamperDrive.destination')),
                totalKm || (data ? data.totalDistanceKm : 100),
                fuelCost,
                vehicle ? { vehicle } : undefined
            );
        },
        // Launch a free-play session that is NOT tied to fast travel or the
        // world map: the Liminal World of the Minigames menu. onExit() runs when
        // the player quits with Esc / Cancel, so the caller can return to its own
        // scene.
        //
        // opts says how the party arrives:
        //   vehicle    what they are riding, or nothing at all for a walk
        //   footOnly   true to walk it, with no vehicle in the scene
        //   startTile  the world square to be put down beside ({ x, y })
        //   label      what the readout calls the place
        //
        // Nothing is remembered about the party out here (no world position, no
        // fast travel, no parked vehicles), but the GROUND is: what is dug out of
        // this world is this world's, minigame or not (VoxelWorldState).
        startStandalone(onExit, opts) {
            if (this._scene) this.stop();
            const o = opts || {};
            // Long "duration" so the auto-travel timer never ends the session; the
            // destination equals the start tile, so nothing is ever driven
            // anywhere the player did not drive it.
            this._scene = build(999999,
                o.label || T('CamperDrive.freeDrive'), 100, 0, {
                    standalone: true,
                    footOnly: !!o.footOnly,
                    vehicle: o.footOnly ? undefined : (o.vehicle || 'camper'),
                    startFlying: !!o.startFlying,
                    atHelm: !!o.atHelm,
                    startTile: o.startTile || null
                });
            // build() hands back null when the world could not be raised; the
            // caller is told so rather than crashing on the way in.
            if (!this._scene) return null;
            this._scene._onStandaloneExit = (typeof onExit === 'function') ? onExit : null;
            return this._scene;
        },
        // ---------------------------------------------------------------------
        // A walk on another world
        // ---------------------------------------------------------------------
        // The "liminal walk" offered beside "land" on the landing-site picker.
        // Instead of generating a 2D surface map, the whole 3D world is opened
        // on that planet: one biome from pole to pole, in the colours the biome
        // itself carries, furnished from the same association map Earth's biomes
        // are (js/db/WorldGen/biomeFurniture.json - rock and dust on a barren
        // world, trees and flowers on one with a biosphere), with the planet's
        // own generated species roaming it where there is life.
        //
        //   biome    the Alien<Type> biome record (window.WorldGen.Biomes)
        //   planet   the landed descriptor, for the name on the readout
        //   species  enemy ids the planet's roster resolved to, or nothing
        startAlienWalk(biome, planet, species) {
            if (!biome) return null;
            if (this._scene) this.stop();
            const name = (planet && planet.name) || biome.name || '';
            this._scene = build(999999, name, 0, 0,
                { footOnly: true, alien: { biome, planet: planet || null, species: species || null } });
            return this._scene;
        },
        // ---------------------------------------------------------------------
        // A flyby of another world
        // ---------------------------------------------------------------------
        // The third way down from the landing grid, and the only one that never
        // touches the ground: the same world the liminal walk opens, with the
        // party still aboard the ship and flying it. The ship is a vehicle out
        // here like any other (VEHICLE_DRIVE.starship), so it steers, boosts and
        // climbs the way it does over Earth - and flown into the side of a
        // mountain it takes the damage on its own hull, the mountain left
        // standing (see VoxelWorldScene._checkTerrainRam).
        startAlienFlyby(biome, planet, species, opts) {
            if (!biome) return null;
            if (this._scene) this.stop();
            const name = (planet && planet.name) || biome.name || '';
            this._scene = build(999999, name, 0, 0, {
                vehicle: 'starship',
                startFlying: true,
                atHelm: !!(opts && opts.atHelm),
                alien: { biome, planet: planet || null, species: species || null },
            });
            return this._scene;
        },
        // ---------------------------------------------------------------------
        // The bridge
        // ---------------------------------------------------------------------
        // The ship's own room, and the way into flying it by hand. Unlike the
        // flyby it is not reached from the star map at all: it is opened from
        // inside the ship (map 721's own bridge door, the OpenShipBridge
        // command), which is why it has to work out for itself what the ship is
        // currently over.
        //
        //   in orbit of a world  -> that world's sky, the way a flyby opens it
        //   anywhere else        -> the world the party is standing on
        //
        // Either way the party arrives at the helm, in first person, flying,
        // and can get up and walk the bridge (V) or set the ship down.
        startShipBridge(onExit) {
            const GS = window.GalaxySim;
            if (GS && GS.startShipBridgeFlight && GS.startShipBridgeFlight()) {
                if (this._scene) this._scene._onStandaloneExit = onExit || null;
                return this._scene;
            }
            return this.startStandalone(onExit, {
                vehicle: 'starship', atHelm: true, startFlying: true,
            });
        },
        // True while the walk is on another world rather than on Earth.
        isAlienWalk() { return !!(this._scene && this._scene._alien); },

        // Which vehicle the party is actually aboard out here ('camper', 'car',
        // ...), or null on foot. The party HUD asks this so the vehicle row over
        // the cards is the thing being driven in the 3D world rather than
        // whatever the 2D map still has the player sitting in
        // (Vehicle/VehicleSystem's getHudVehicleStatus).
        ridingKey() {
            const s = this._scene;
            if (!s || s._titleMode || s._footOnly) return null;
            if (s._viewMode === 'foot') return null;
            return s._vehicleId || 'camper';
        },

        // Walk the world on foot from wherever the party stands on the world map
        // (the travel menu's "Free walk"). Same world, same weather and wildlife,
        // no camper anywhere in it. Leaving puts the party back on map 315 on the
        // square they walked to.
        startFreeWalk() {
            if (this._scene) this.stop();
            this._scene = build(999999, T('CamperDrive.freeWalk'), 0, 0,
                { footOnly: true });
            return this._scene;
        },
        // True while the running scene is a free walk (no camper in it).
        isFreeWalk() { return !!(this._scene && this._scene._footOnly); },
        // Silent background drive for the title screen: the real world map, with
        // an autopilot following the tagged roads and turning at random wherever
        // a junction offers a choice. No HUD, no controls, no save writes. Returns
        // the scene (so the caller can read its readout) or null when the world's
        // road data has not been loaded yet.
        startTitleDrive() {
            if (!roadDataReady()) return null;
            if (this._scene) this.stop();
            this._scene = build(999999, T('CamperDrive.autopilot'), 100, 0, { titleMode: true });
            return this._scene;
        },
        // True once the world's road tags are available to plan a route from.
        isWorldRoadDataReady() { return roadDataReady(); },
        // `opts.noCatchUp`: the session itself is being thrown away (a new
        // game, a load), so the time that passed is nobody's to pay.
        stop(opts) {
            if (!this._scene) return;
            // The live spriteset may still be holding the sprite keyed to the
            // world's canvas texture, which dispose() is about to destroy.
            // Left in place, PIXI reads the freed uvs on the very next frame
            // ("cannot read property 'uvsFloat32' of null") and the game dies
            // on a black screen. Take it down first.
            detachGroundSprite();
            const sc = this._scene;
            // The reference goes FIRST: everything else in the game reads
            // isActive() to decide whether the world has the controls, and a
            // teardown that died halfway used to leave that answer as "yes"
            // for the rest of the session.
            this._scene = null;
            try { sc.dispose(); } catch (e) { console.error('[VoxelWorld] stop', e); }
            sweepOverlays();
            // The time that went by out there is paid to the simulation now.
            if (!sc._titleMode && this.WorldClock && !(opts && opts.noCatchUp)) {
                this._catchingUp = true;
                try { this.WorldClock.catchUp(); } finally { this._catchingUp = false; }
            } else if (this.WorldClock) {
                // Thrown away, not owed: the next world must not inherit it.
                this.WorldClock._from = null;
                this.WorldClock._frames = 0;
            }
        },
        isActive() { return !!this._scene; },
        isTitleDrive() { return !!(this._scene && this._scene._titleMode); },

        // --- the fight, fought out here ----------------------------------
        // True while a battle is being played out over the running world. The
        // scene keeps drawing behind it and Spriteset_Battle lays the troop and
        // the whole battle HUD on that frame (see the hooks at the foot of this
        // file), so a fight met on a road is fought on that road.
        isBattleView() { return !!(this._scene && this._scene._battleWatch); },
        // True while a real-time fight is on out here (VoxelWorldEntities'
        // CombatSession), including the moment it is being wound up. There is
        // no battle scene behind one, so the battle hooks below ask this.
        inCombat() {
            const c = this._scene && this._scene._combat;
            return !!(c && c.inCombat && c.inCombat());
        },
        // True while one of the ENGINE's own windows is up over the world: a
        // line of dialogue, a choice list, a shop counter. Those are drawn into
        // the game's canvas, which the world's DOM layer covers completely, so
        // for as long as one is showing the world is drawn into that canvas
        // instead and the window lands on top of it (see the Spriteset_Map
        // hooks at the foot of this file).
        isMirrorView() { return !!(this._scene && this._scene._mirrorWatch); },
        // True while the world's opaque DOM layer is the whole picture: the
        // map scene is up, the layer is showing, and nothing (a window, a
        // fight, the title) needs the game's own canvas. Whatever PIXI would
        // draw into that canvas then is drawn under a black div nobody can
        // see through, so the engine's render is skipped (Graphics._canRender
        // below) for as long as this holds.
        coversScreen() {
            const sc = this._scene;
            if (!sc || sc._titleMode || sc._mirrorWatch || sc._battleWatch || sc._disposed) return false;
            const ov = sc._overlay;
            if (!ov || !ov.isConnected || ov.style.display === 'none') return false;
            const cur = (typeof SceneManager !== 'undefined') ? SceneManager._scene : null;
            return !!cur && typeof Scene_Map !== 'undefined' && cur instanceof Scene_Map &&
                !(typeof SceneManager.isSceneChanging === 'function' && SceneManager.isSceneChanging());
        },
        // True while ANYTHING is up over the world: a choice list, a line of
        // dialogue, a fight, a pushed scene, or one of the game's own DOM menus
        // (the augments register, the prosthetics fitter, a growth ledger...).
        // Everything that listens on the document for a key or a click asks
        // this before acting on one, so a keystroke aimed at a menu is the
        // menu's and nobody walks off during it.
        isPaused() {
            return !!(this._scene && this._scene.isPaused && this._scene.isPaused());
        },

        // --- leaving --------------------------------------------------------
        // End the 3D world and hand the party back to the world map, the same
        // way the scene's own exits do: a walk puts them down on the square they
        // walked to, a drive on the square the camper reached (parking it there,
        // splashing it ashore if it ended over water). This is what the party
        // menu's "return to the world map" reaches for while the world is up
        // (Map/WorldMapReturn.js), so that one entry ends both ways of being out
        // here. False when there is nothing to leave, or nowhere to leave to.
        exitToWorldMap() {
            const sc = this._scene;
            if (!sc || sc._titleMode || sc._standalone) return false;
            sc._endDriveToWorldMap();   // answers for the walk as well as the drive
            return true;
        },
        // Write where the party stands into the 2D map's records without
        // ending the drive: what a save, or a teleport out of the menu, reads.
        syncWorldTile() {
            const sc = this._scene;
            if (!sc || sc._titleMode || sc._standalone || sc._alien) return false;
            if (typeof $gameVariables === 'undefined' || !$gameVariables) return false;
            // The drive keeps the camper's square written as it goes
            // (_syncWorldTile); asked for outright it writes whatever the
            // square is now. On foot the party is the WALKER, not the parked
            // camper, so their own square is what a save has to put them on.
            const ts = window.VoxelWorld.WORLD_TILE_SIZE;
            const WORLD = window.VoxelWorld.WORLD_MAP_ID;
            const clamp = (v) => Math.max(0, Math.min(255, Math.floor(v / ts)));
            if (sc._viewMode === 'foot' && sc._contactPoint) {
                const at = sc._contactPoint();
                var tx = clamp(at.x), ty = clamp(at.z);
                $gameVariables.setValue(43, tx);
                $gameVariables.setValue(44, ty);
            } else {
                if (!sc._syncWorldTile) return false;
                sc._lastSyncTileX = null;
                sc._lastSyncTileY = null;
                sc._syncWorldTile();
                tx = clamp(sc._vanX); ty = clamp(sc._vanZ);
                if (typeof $gameMap !== 'undefined' && $gameMap && $gameMap.vehicle) {
                    const ship = $gameMap.vehicle('ship');
                    if (ship && ship.setLocation) ship.setLocation(WORLD, tx, ty);
                }
            }
            // On the world map the save keeps the 2D player's own square, and
            // the drive reopens from it: the player is stood on it as well.
            if (typeof $gameMap !== 'undefined' && $gameMap && $gameMap.mapId() === WORLD &&
                typeof $gamePlayer !== 'undefined' && $gamePlayer && $gamePlayer.locate) {
                $gamePlayer.locate(tx, ty);
            }
            return true;
        },
        // The canvas the world is being drawn into, for the battle layer - or
        // the map's own window layer - to draw itself over. Null when nothing
        // is running.
        battleCanvas() {
            return (this._scene && this._scene._renderer)
                ? this._scene._renderer.domElement : null;
        },
        // Gate the modular upgrades from game logic, e.g.
        //   VoxelWorldSystem.setUpgrades({ fly:true, float:true, dive:false })
        // Absent any call, every upgrade is available.
        setUpgrades(up) {
            if (typeof $gameSystem === 'undefined' || !up) return;
            $gameSystem._camperUpgrades = Object.assign($gameSystem._camperUpgrades || {}, up);
        },

        // --- the voxel field --------------------------------------------
        // The live field while a scene is up, so game logic can reach into
        // the ground: blow a hole in it, put a block back, ask how deep the
        // rock goes. Null when nothing is running.
        get field() {
            return (this._scene && this._scene._terrain) ? this._scene._terrain.field : null;
        },
        get terrain() {
            return this._scene ? this._scene._terrain : null;
        },
        // Take a ball of cubes out at a world position. Returns how many went.
        carve(x, y, z, radius) {
            const t = this.terrain;
            return t ? t.carve(x, y, z, radius).count : 0;
        },
        // Put the ground back the way it was generated, everywhere.
        resetDigging() {
            if (typeof $gameSystem !== 'undefined' && $gameSystem) {
                delete $gameSystem._voxelWorldEdits;
            }
            if (VW.VoxelWorldState) VW.VoxelWorldState.setDug(null);
            const t = this.terrain;
            if (!t) return;
            t.field.reset();
            t.rebuildAll();
        }
    };

    window.VoxelWorldSystem = VoxelWorldSystem;
    VW.System = VoxelWorldSystem;
    // The name the rest of the game already knows this scene by. Titlescreen.js,
    // WorldMapReturn.js and VehicleSystem.js all call through it.
    window.CamperDrivingSystem = VoxelWorldSystem;

    // Commands are keyed by plugin file name, and events out in the world were
    // authored against the old one. Both names answer to the same handlers.
    const COMMAND_HOSTS = ['VoxelWorldSystem', 'CamperDrivingSystem'];
    for (const host of COMMAND_HOSTS) {
        PluginManager.registerCommand(host, 'StartFreeWalk', () => {
            VoxelWorldSystem.startFreeWalk();
        });

        PluginManager.registerCommand(host, 'StartDriving', args => {
            VoxelWorldSystem.start(
                Number(args.duration) || 60,
                T.param(args.destinationName, 'CamperDrive.destination'),
                Number(args.totalKm) || 100
            );
        });

        PluginManager.registerCommand(host, 'ResetDigging', () => {
            VoxelWorldSystem.resetDigging();
        });

        PluginManager.registerCommand(host, 'OpenShipBridge', () => {
            VoxelWorldSystem.startShipBridge();
        });
    }

    // A camper fast travel used to drop the party into the 3D world for the
    // length of the journey: the travel timer was wrapped here and the drive
    // started on the 'camper' transport. It does not any more. A booked
    // journey is time passing inside the vehicle, not a road to be driven, so
    // the party stays in the camper interior for the whole trip and watches it
    // cross the chart on the wall. The 3D world is still entered deliberately,
    // from the vehicle's own "Engage liminal drive" (Vehicle/VehicleSystem.js)
    // and from the plugin commands above, but never by booking a seat.

    // The 3D scene owns the keyboard while it is up, and the map scene keeps
    // running underneath it. Nothing may walk the 2D player around down there:
    // on a free walk in particular the map is live and otherwise unlocked, so
    // WASD would drag the party across the world map behind the overlay.
    const _Game_Player_canMove_CDS = Game_Player.prototype.canMove;
    Game_Player.prototype.canMove = function() {
        if (VoxelWorldSystem.isActive()) return false;
        return _Game_Player_canMove_CDS.call(this);
    };

    const _Scene_Map_isMenuEnabled_CDS = Scene_Map.prototype.isMenuEnabled;
    Scene_Map.prototype.isMenuEnabled = function() {
        if (VoxelWorldSystem.isActive()) return false;
        return _Scene_Map_isMenuEnabled_CDS.call(this);
    };

    // =========================================================================
    // Time out here, and the world that waits for it
    //
    // The clock is moved by steps (Core/TimeDateSystem.js), and nobody steps
    // while this world is up: the day used to stand still for as long as the
    // party was out driving. It runs in REAL TIME now, a game minute a second,
    // the rate the PC and the trading terminal already run it at.
    //
    // What does NOT run is the simulation under it. Every event on the 2D
    // map, the NPC society's hourly tick, the parallel processes: none of it
    // is seen from out here and all of it was being paid for every frame. The
    // map is held still (only a running interpreter still gets its frames, so
    // a conversation held over the world finishes), and when the party comes
    // back the simulation is caught up in one pass over the time that passed,
    // exactly as it is after a night's sleep.
    // =========================================================================
    const WORLD_FRAMES_PER_MINUTE = 60;
    const WorldClock = {
        _frames: 0,
        _from: null,      // the minute the world opened on, for the catch-up

        _live() {
            return VoxelWorldSystem.isActive() && !VoxelWorldSystem.isTitleDrive() &&
                !!window.TimeDateSystem && !!window.$gameVariables;
        },

        // One frame of the day. Called from the map scene, which keeps
        // running under the overlay.
        tick() {
            if (!this._live()) return;
            const TD = window.TimeDateSystem;
            if (this._from == null) this._from = TD.getGameTimeMinutes();
            this._watchSkips(TD);
            if (++this._frames < WORLD_FRAMES_PER_MINUTE) return;
            this._frames = 0;
            TD.setGameTimeMinutes(TD.getGameTimeMinutes() + 1);
            if (TD.updateGameDateVariable) TD.updateGameDateVariable();
        },

        // A rest taken out here (the wait menu, a night's sleep) moves the
        // clock and pays for the time itself, through this very door. That
        // time is then not owed again at the exit: the start of the stretch
        // the catch-up will pay for moves along with it.
        _watchSkips(TD) {
            if (TD._vwSkipWatched || typeof TD.onTimeSkipped !== 'function') return;
            TD._vwSkipWatched = true;
            // A listener, not a wrapper: the rests call the clock's own local
            // notifier, which never passes through the exported one.
            TD.onTimeSkipped((minutes) => {
                if (this._from != null && this._live() && !VoxelWorldSystem._catchingUp) {
                    this._from += Math.max(0, Number(minutes) || 0);
                }
            });
        },

        // The world has closed: everything that lives by the clock is told
        // how much of it went by. The delta engines no-op on a short drive
        // and take a long one in a handful of chunks.
        catchUp() {
            const from = this._from;
            this._from = null;
            this._frames = 0;
            const TD = window.TimeDateSystem;
            if (from == null || !TD) return 0;
            const now = TD.getGameTimeMinutes();
            const gone = now - from;
            if (gone <= 0) return 0;
            const run = (obj, fn, arg) => {
                if (obj && typeof obj[fn] === 'function') {
                    try { obj[fn](arg); } catch (e) { console.error('[VoxelWorld] catch-up ' + fn, e); }
                }
            };
            // The society reads the hour off variable 23, not off the minute
            // it is handed, so the hour is set before every pass.
            const setHour = (minute) => {
                if (!$gameVariables) return;
                const hour = parseInt(TD.getDateTimeFromMinutes(minute).hours, 10);
                if ($gameVariables.value(23) !== hour) $gameVariables.setValue(23, hour);
            };
            // The society lives an hour at a time (its tick clamps to one), so
            // the hours are walked in order rather than handed over as one
            // lump; a very long stretch is taken in bigger steps, as a sleep
            // takes it, so no exit ever runs more than a few dozen passes.
            const NS = window.NPCSim;
            if (NS && typeof NS.tick === 'function') {
                const STEP = Math.max(60, Math.ceil(gone / 48));
                for (let t = from + STEP; t < now; t += STEP) { setHour(t); run(NS, 'tick', t); }
                setHour(now);
                run(NS, 'tick', now);
            } else {
                setHour(now);
            }
            run(window.NPCLifeSim, 'catchUp', now);
            run(window.NPCPolitics, 'catchUp', now);
            run(window.NPCWorldWeb, 'catchUp', now);
            run(window.EpidemicSystem, 'catchUp', now);
            run(window.HistoryManager, 'catchUpLiveHistory', now);
            run(window.ONUAssembly, 'catchUpSessions', now);
            run(TD, 'notifyTimeSkipped', gone);
            return gone;
        }
    };
    VoxelWorldSystem.WorldClock = WorldClock;

    // The game's canvas under the world. The 2D map kept being drawn into it
    // every frame - tilemap, every character sprite, every plugin's layer - a
    // whole second WebGL frame behind a layer that hides it completely. The
    // scene itself still updates (the interpreter, the clock, the hooks); only
    // the drawing is left out, and it comes back the frame a window, a fight
    // or the end of the drive needs that canvas again.
    if (typeof Graphics !== 'undefined' && typeof Graphics._canRender === 'function') {
        const _Graphics_canRender_VW = Graphics._canRender;
        Graphics._canRender = function() {
            if (VoxelWorldSystem.coversScreen()) return false;
            return _Graphics_canRender_VW.call(this);
        };
    }

    const _Scene_Map_update_WC = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        _Scene_Map_update_WC.call(this);
        WorldClock.tick();
    };

    // The map, held still: a running interpreter is the one thing on it that
    // still has to finish. Everything else waits for the party to come back.
    function holdMap(map, sceneActive) {
        holdNpcSim();
        holdMapOuter();
        map.refreshIfNeeded();
        if (sceneActive) map.updateInterpreter();
        // An interpreter waiting on an event (a move route it was told to
        // wait for) needs that event to move, or it waits for ever.
        if (map.isEventRunning() || (typeof $gameMessage !== 'undefined' && $gameMessage.isBusy())) {
            map.updateEvents();
        }
    }
    const _Game_Map_update_WC = Game_Map.prototype.update;
    Game_Map.prototype.update = function(sceneActive) {
        if (VoxelWorldSystem.isActive() && !VoxelWorldSystem.isTitleDrive()) {
            holdMap(this, sceneActive);
            return;
        }
        _Game_Map_update_WC.call(this, sceneActive);
    };

    // This plugin loads early, so the NPC plugins that hang their own work off
    // the map's update (controllers, commutes, street crime) wrap the hold
    // above rather than being held by it, and went on stepping every frame.
    // Once everything is loaded the hold is put on again at the OUTSIDE, the
    // first time the world is up, so the whole chain under it stands still.
    let _mapOuterHeld = false;
    function holdMapOuter() {
        if (_mapOuterHeld) return;
        _mapOuterHeld = true;
        const outer = Game_Map.prototype.update;
        Game_Map.prototype.update = function(sceneActive) {
            if (VoxelWorldSystem.isActive() && !VoxelWorldSystem.isTitleDrive()) {
                holdMap(this, sceneActive);
                return;
            }
            outer.call(this, sceneActive);
        };
    }

    // The society's hourly tick is hung off the map's update by a plugin that
    // loads after this one, so it wraps the hold above rather than being held
    // by it. It is held at its own door instead, the first time the world is
    // up with it loaded: NPCSim.tick does nothing while the party is out
    // here, and the catch-up pays for the hours when they are back.
    function holdNpcSim() {
        const NS = window.NPCSim;
        if (!NS || NS._vwHeld || typeof NS.tick !== 'function') return;
        NS._vwHeld = true;
        const tick = NS.tick;
        NS.tick = function() {
            // ...except through a rest taken out here (the wait menu, a night's
            // sleep), which simulates the hours it passes as it passes them.
            const resting = typeof $gameTemp !== 'undefined' && $gameTemp && $gameTemp._sleepMenuOpen;
            if (VoxelWorldSystem.isActive() && !VoxelWorldSystem.isTitleDrive() &&
                !VoxelWorldSystem._catchingUp && !resting) return;
            return tick.apply(this, arguments);
        };
    }

    // Resigning to the title (or dying) while the world is up leaves the scene
    // running: its overlay sits over the title menu with the walk still under
    // the player's hands. Anything that is not the title's own background drive
    // is torn down before those scenes are built.
    // Drop the sprite that blits the world's canvas into whatever spriteset is
    // currently up (map or battle). Safe to call at any time.
    function detachGroundSprite() {
        const sc = (typeof SceneManager !== 'undefined') ? SceneManager._scene : null;
        const ss = sc && sc._spriteset;
        if (!ss || !ss._vwGroundSprite) return;
        if (ss.removeVoxelWorldGround) { ss.removeVoxelWorldGround(); return; }
        if (ss._vwGroundSprite.parent) {
            ss._vwGroundSprite.parent.removeChild(ss._vwGroundSprite);
        }
        ss._vwGroundSprite.destroy({ texture: false, baseTexture: false });
        ss._vwGroundSprite = null;
    }

    // Nothing of the world may outlive it on the page. dispose() takes its own
    // overlay down; this catches any left by an earlier world whose teardown
    // failed, so a fresh scene (or the title screen) never comes up under one.
    function sweepOverlays() {
        const list = document.querySelectorAll('#camper-drive-overlay');
        for (const el of list) { if (el.parentNode) el.parentNode.removeChild(el); }
    }

    function stopPlayableWorld() {
        const sc = VoxelWorldSystem._scene;
        if (sc && !sc._titleMode) VoxelWorldSystem.stop();
    }
    const _Scene_Title_create_VW = Scene_Title.prototype.create;
    Scene_Title.prototype.create = function() {
        stopPlayableWorld();
        _Scene_Title_create_VW.call(this);
    };
    const _Scene_Gameover_create_VW = Scene_Gameover.prototype.create;
    Scene_Gameover.prototype.create = function() {
        stopPlayableWorld();
        _Scene_Gameover_create_VW.call(this);
    };

    // Any map transfer (teleport item, return to ship, door, event transfer) ends
    // voxel mode so the 3D scene never lingers over normal gameplay.
    const _Game_Player_performTransfer_VW = Game_Player.prototype.performTransfer;
    Game_Player.prototype.performTransfer = function() {
        if (VoxelWorldSystem.isActive() && !VoxelWorldSystem.isTitleDrive()) {
            VoxelWorldSystem.stop();
        }
        _Game_Player_performTransfer_VW.call(this);
    };

    const _Game_Player_reserveTransfer_VW = Game_Player.prototype.reserveTransfer;
    Game_Player.prototype.reserveTransfer = function(mapId, x, y, d, fadeType) {
        _Game_Player_reserveTransfer_VW.call(this, mapId, x, y, d, fadeType);
        if (VoxelWorldSystem.isActive() && !VoxelWorldSystem.isTitleDrive()) {
            VoxelWorldSystem.stop();
        }
    };

    // Character death ends voxel mode so the 3D scene never outlives the party or actor.
    if (typeof Game_BattlerBase !== 'undefined') {
        const _Game_BattlerBase_die_VW = Game_BattlerBase.prototype.die;
        Game_BattlerBase.prototype.die = function() {
            _Game_BattlerBase_die_VW.call(this);
            // ...except in a fight out here, where one of the party going down
            // is part of the fight (the lead passes on, see CombatSession) and
            // only the whole party going down ends it.
            if (this.isActor && this.isActor() && VoxelWorldSystem.isActive() &&
                !VoxelWorldSystem.isTitleDrive() && !VoxelWorldSystem.inCombat() &&
                // Nor in a battle scene drawn over the world: a lost fight is
                // the defeat hook's to handle, and stopping here blacks it out.
                !VoxelWorldSystem.isBattleView()) {
                VoxelWorldSystem.stop();
            }
        };
    }

    if (typeof Game_Actor !== 'undefined') {
        const _Game_Actor_processMapDeath_VW = Game_Actor.prototype.processMapDeath;
        Game_Actor.prototype.processMapDeath = function() {
            if (VoxelWorldSystem.isActive() && !VoxelWorldSystem.isTitleDrive()) {
                VoxelWorldSystem.stop();
            }
            if (_Game_Actor_processMapDeath_VW) _Game_Actor_processMapDeath_VW.call(this);
        };
    }

    // A fight lost out here runs the battle system's own defeat (permadeath,
    // the wipe, who comes round where), and that defeat ends by leaving the
    // battle scene. There is none to leave: the engine's pop would take the
    // MAP off the stack instead. The scene change is the world's own business
    // (CombatSession.finish hands it back to the map).
    if (typeof BattleManager !== 'undefined') {
        const _BattleManager_updateBattleEnd_VW = BattleManager.updateBattleEnd;
        BattleManager.updateBattleEnd = function() {
            if (VoxelWorldSystem.inCombat()) { this._phase = ''; return; }
            _BattleManager_updateBattleEnd_VW.call(this);
        };
    }

    if (typeof BattleManager !== 'undefined') {
        const _BattleManager_processDefeat_VW = BattleManager.processDefeat;
        BattleManager.processDefeat = function() {
            // A fight lost out here is the world's own to close (CombatSession
            // finish -> _onCombatEnd): stopping it from under the defeat would
            // drop the guard above, pop the map off an empty stack and close
            // the game.
            if (VoxelWorldSystem.isActive() && !VoxelWorldSystem.isTitleDrive() &&
                !VoxelWorldSystem.inCombat()) {
                VoxelWorldSystem.stop();
            }
            if (_BattleManager_processDefeat_VW) _BattleManager_processDefeat_VW.call(this);
        };
    }

    if (typeof DataManager !== 'undefined') {
        const _DataManager_setupNewGame_VW = DataManager.setupNewGame;
        DataManager.setupNewGame = function() {
            if (VoxelWorldSystem.isActive()) VoxelWorldSystem.stop({ noCatchUp: true });
            _DataManager_setupNewGame_VW.call(this);
        };

        const _DataManager_loadGame_VW = DataManager.loadGame;
        DataManager.loadGame = function(savefileId) {
            if (VoxelWorldSystem.isActive()) VoxelWorldSystem.stop({ noCatchUp: true });
            return _DataManager_loadGame_VW.call(this, savefileId);
        };
    }

    // =========================================================================
    // The battle, fought over this world
    //
    // A fight opened while the 3D world is up is not held on a painted
    // backdrop somewhere else: the world goes on drawing behind it, and that
    // frame becomes the battle's ground. Everything the fight itself is made
    // of - the 3D troop, the enemy bars, the command menu, the animations - is
    // laid straight over it, untouched.
    //
    // The swap is done on the spriteset's first update rather than as it is
    // built: this module loads early in the list, so the layers other plugins
    // add to the battleback (AnimatedBattleBackgrounds) do not exist yet at
    // build time and would come back up over the world.
    // =========================================================================
    // -------------------------------------------------------------------------
    // Opening a fight out here costs nothing
    //
    // The engine stages a whole ceremony between walking into something and
    // fighting it: sixty frames of zoom on the map, two white flashes, a
    // full-screen snapshot taken for the battle's background, a fade to black
    // at the halfway mark, and then a fade back in on the other side. About a
    // second and a half.
    //
    // Every frame of it is drawn on the game's own canvas, and out here the
    // world's overlay is sitting on top of that canvas, so NONE of it is ever
    // seen. What the player actually gets is the world carrying on with the
    // controls dead, and then a fight. The ceremony is skipped in this world
    // and the fight opens on the next frame, in the place the party is
    // standing, with the turn onto the creature (VoxelWorldScene's
    // _holdBattleAim) as the only thing that moves.
    //
    // The 2D game keeps every bit of it: both hooks stand down unless the
    // world is up.
    // -------------------------------------------------------------------------
    const _Scene_Map_launchBattle_VW = Scene_Map.prototype.launchBattle;
    Scene_Map.prototype.launchBattle = function() {
        if (!VoxelWorldSystem.isActive()) {
            _Scene_Map_launchBattle_VW.call(this);
            return;
        }
        // Everything the ceremony did that is NOT the ceremony: the music is
        // put away for the fight, the fight's own music starts (the encounter
        // effect used to do this at its halfway point), and the map's name
        // plate goes. What is dropped is startEncounterEffect, so
        // _encounterEffectDuration stays at 0, Scene_Map.isBusy() is false and
        // the scene changes on the very next frame.
        BattleManager.saveBgmAndBgs();
        this.stopAudioOnBattleStart();
        SoundManager.playBattleStart();
        BattleManager.playBattleBgm();
        if (this._mapNameWindow && this._mapNameWindow.hide) this._mapNameWindow.hide();
    };

    // The fade IN has to go with it. startFadeIn opens from a full black
    // screen whether or not anything ever faded out, so skipping only the
    // fade-out would leave the fight opening out of black anyway.
    const _Scene_Battle_start_VW = Scene_Battle.prototype.start;
    Scene_Battle.prototype.start = function() {
        _Scene_Battle_start_VW.call(this);
        if (VoxelWorldSystem.isActive()) this.startFadeIn(1, false);
    };

    const _Scene_Battle_create_VW = Scene_Battle.prototype.create;
    Scene_Battle.prototype.create = function() {
        if (VoxelWorldSystem.isActive() && VoxelWorldSystem._scene.beginBattleView) {
            VoxelWorldSystem._scene.beginBattleView();
        }
        _Scene_Battle_create_VW.call(this);
    };

    const _Scene_Battle_terminate_VW = Scene_Battle.prototype.terminate;
    Scene_Battle.prototype.terminate = function() {
        if (this._spriteset && this._spriteset._vwGroundSprite) {
            if (this._spriteset._vwGroundSprite.parent) {
                this._spriteset._vwGroundSprite.parent.removeChild(this._spriteset._vwGroundSprite);
            }
            this._spriteset._vwGroundSprite.destroy({ texture: false, baseTexture: false });
            this._spriteset._vwGroundSprite = null;
        }
        _Scene_Battle_terminate_VW.call(this);
        if (VoxelWorldSystem.isActive() && VoxelWorldSystem._scene && VoxelWorldSystem._scene.endBattleView) {
            VoxelWorldSystem._scene.endBattleView();
        }
    };

    // Every layer the battle would otherwise lay its ground down with, so the
    // world underneath is never painted over.
    function hideBattleGround(spriteset) {
        const layers = [
            spriteset._blackScreen, spriteset._backgroundSprite,
            spriteset._back1Sprite, spriteset._back2Sprite,
            spriteset._animatedContainer, spriteset._animatedGradientContainer
        ];
        for (const s of layers) { if (s && s.visible) s.visible = false; }
    }

    // The one texture both grounds are drawn from, keyed to the world's own
    // canvas. PIXI hands the SAME texture back for the same canvas, and a
    // destroyed one is still handed back by a cache entry that outlived it:
    // its baseTexture, frame and orig are all null by then, so the very next
    // read of them (sprite.width sizing the blit) dies with "cannot read
    // property 'width' of null" and takes the game to a black screen. A
    // texture that is no longer whole is dropped and built again.
    function groundTexture(canvas) {
        let texture = canvas._vwBattleTexture;
        if (texture && (texture.destroyed || !texture.baseTexture ||
                        !texture.orig || !texture._uvs)) {
            try { PIXI.Texture.removeFromCache(texture); } catch (e) { /* not cached */ }
            canvas._vwBattleTexture = null;
            texture = null;
        }
        if (!texture) {
            texture = PIXI.Texture.from(canvas);
            if (!texture || !texture.baseTexture || !texture.orig) return null;
            canvas._vwBattleTexture = texture;
        }
        const base = texture.baseTexture;
        if (base.realWidth !== canvas.width || base.realHeight !== canvas.height) {
            base.setRealSize(canvas.width, canvas.height);
        }
        return texture;
    }

    Spriteset_Battle.prototype.createVoxelWorldGround = function() {
        const canvas = VoxelWorldSystem.battleCanvas();
        if (!canvas || !window.PIXI || !this._baseSprite) return;
        hideBattleGround(this);

        // The canvas is drawn at the game's own resolution while a fight is on
        // (see beginBattleView), so the sprite is a straight 1:1 blit; the
        // declared size is restated anyway, since the world may have been drawn
        // at window size the last time this texture was looked at.
        const texture = groundTexture(canvas);
        if (!texture) return;
        const sprite = new PIXI.Sprite(texture);
        sprite.width  = Graphics.width;
        sprite.height = Graphics.height;
        this._vwGroundSprite = sprite;
        this._baseSprite.addChildAt(sprite, 0);
    };

    const _Spriteset_Battle_update_VW = Spriteset_Battle.prototype.update;
    Spriteset_Battle.prototype.update = function() {
        _Spriteset_Battle_update_VW.call(this);
        if (!VoxelWorldSystem.isBattleView()) {
            if (this._vwGroundSprite) {
                if (this._vwGroundSprite.parent) {
                    this._vwGroundSprite.parent.removeChild(this._vwGroundSprite);
                }
                this._vwGroundSprite.destroy({ texture: false, baseTexture: false });
                this._vwGroundSprite = null;
            }
            return;
        }
        if (!this._vwGroundSprite) this.createVoxelWorldGround();
        if (!this._vwGroundSprite) return;
        // The world drew a new frame into that canvas since the last tick;
        // this is what carries it up into the battle layer.
        hideBattleGround(this);
        // A texture whose canvas has gone (the world was stopped under us)
        // must never be drawn from again.
        const tex = this._vwGroundSprite.texture;
        if (!tex || !tex.baseTexture || !tex._uvs) { if (this._vwGroundSprite.parent) {
                this._vwGroundSprite.parent.removeChild(this._vwGroundSprite);
            }
            this._vwGroundSprite.destroy({ texture: false, baseTexture: false });
            this._vwGroundSprite = null; return; }
        tex.update();
    };

    const _Spriteset_Battle_destroy_VW = Spriteset_Battle.prototype.destroy;
    Spriteset_Battle.prototype.destroy = function(options) {
        if (this._vwGroundSprite) {
            if (this._vwGroundSprite.parent) {
                this._vwGroundSprite.parent.removeChild(this._vwGroundSprite);
            }
            // The sprite only: the texture belongs to the world's own canvas and
            // the next fight over that world picks it straight back up.
            this._vwGroundSprite.destroy({ texture: false, baseTexture: false });
            this._vwGroundSprite = null;
        }
        _Spriteset_Battle_destroy_VW.call(this, options);
    };

    // =========================================================================
    // The engine's own windows, over this world
    //
    // A line of dialogue, a choice list, a shop counter: all of them are drawn
    // into the game's PIXI canvas, which the world's DOM layer sits on top of
    // and which cannot be made see-through. The world used to simply go away
    // for the length of the conversation, which put the party back on a 2D map
    // they were not standing on.
    //
    // Instead the world changes sides for as long as the window is up: the
    // scene draws itself at the game's own resolution (see _drawForGameCanvas)
    // and that frame is laid into the map's spriteset underneath everything the
    // engine draws. The tilemap and its own layers go under it, so what is
    // behind the dialogue is the world the party is actually standing in.
    // =========================================================================
    // The 2D map the party is nominally standing on is covered rather than
    // switched off: the sprite goes in LAST, over the tilemap and everybody on
    // it, and fills the screen. Nothing else in the spriteset is touched - the
    // pictures, the timer and the weather are the engine's upper layer and are
    // added to the spriteset itself, so they stay where they belong, over the
    // top. Switching layers off by hand would mean putting back exactly what
    // was showing before, and other plugins have their own opinions about that.
    Spriteset_Map.prototype.createVoxelWorldGround = function() {
        const canvas = VoxelWorldSystem.battleCanvas();
        if (!canvas || !window.PIXI || !this._baseSprite) return;
        const texture = groundTexture(canvas);
        if (!texture) return;
        const sprite = new PIXI.Sprite(texture);
        sprite.width  = Graphics.width;
        sprite.height = Graphics.height;
        this._vwGroundSprite = sprite;
        this._baseSprite.addChild(sprite);
        // The one layer the sprite cannot cover, because the engine hangs it
        // off the spriteset rather than off the base: the 2D weather. It is
        // never seen while the world is up (the DOM layer is over all of it),
        // and it must not appear for the length of a conversation either - the
        // world out there has weather of its own falling on it already.
        if (this._weather) {
            this._vwWeatherWas = this._weather.visible;
            this._weather.visible = false;
        }
    };

    Spriteset_Map.prototype.removeVoxelWorldGround = function() {
        if (!this._vwGroundSprite) return;
        if (this._weather && this._vwWeatherWas !== undefined) {
            this._weather.visible = this._vwWeatherWas;
            this._vwWeatherWas = undefined;
        }
        if (this._vwGroundSprite.parent) {
            this._vwGroundSprite.parent.removeChild(this._vwGroundSprite);
        }
        // The sprite only: the texture belongs to the world's own canvas.
        this._vwGroundSprite.destroy({ texture: false, baseTexture: false });
        this._vwGroundSprite = null;
    };

    const _Spriteset_Map_update_VW = Spriteset_Map.prototype.update;
    Spriteset_Map.prototype.update = function() {
        _Spriteset_Map_update_VW.call(this);
        if (!VoxelWorldSystem.isMirrorView()) {
            if (this._vwGroundSprite) this.removeVoxelWorldGround();
            return;
        }
        if (!this._vwGroundSprite) this.createVoxelWorldGround();
        if (!this._vwGroundSprite) return;
        // A texture whose canvas has gone (the world was stopped under us)
        // must never be drawn from again.
        const tex = this._vwGroundSprite.texture;
        if (!tex || !tex.baseTexture || !tex._uvs) { this.removeVoxelWorldGround(); return; }
        // The world drew a new frame into that canvas since the last tick;
        // this is what carries it up into the map layer.
        tex.update();
    };

    const _Spriteset_Map_destroy_VW = Spriteset_Map.prototype.destroy;
    Spriteset_Map.prototype.destroy = function(options) {
        if (this._vwGroundSprite) this.removeVoxelWorldGround();
        _Spriteset_Map_destroy_VW.call(this, options);
    };

    // Handed to the rest of the suite.
    Object.assign(VW, {
        VoxelWorldSystem
    });
})();
