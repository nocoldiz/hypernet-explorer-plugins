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
        FUEL_PER_KM, VoxelWorldScene, roadDataReady
    } = VW;

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
            this._scene = new VoxelWorldScene(
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
            this._scene = new VoxelWorldScene(999999,
                o.label || T('CamperDrive.freeDrive'), 100, 0, {
                    standalone: true,
                    footOnly: !!o.footOnly,
                    vehicle: o.footOnly ? undefined : (o.vehicle || 'camper'),
                    startFlying: !!o.startFlying,
                    atHelm: !!o.atHelm,
                    startTile: o.startTile || null
                });
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
            this._scene = new VoxelWorldScene(999999, name, 0, 0,
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
            this._scene = new VoxelWorldScene(999999, name, 0, 0, {
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
        // True while that world is being flown over rather than walked.
        isAlienFlyby() {
            const s = this._scene;
            return !!(s && s._alien && s._vehicleId === 'starship');
        },

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
            this._scene = new VoxelWorldScene(999999, T('CamperDrive.freeWalk'), 0, 0,
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
            this._scene = new VoxelWorldScene(999999, T('CamperDrive.autopilot'), 100, 0, { titleMode: true });
            return this._scene;
        },
        // True once the world's road tags are available to plan a route from.
        isWorldRoadDataReady() { return roadDataReady(); },
        stop() {
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
        },
        isActive() { return !!this._scene; },
        isTitleDrive() { return !!(this._scene && this._scene._titleMode); },

        // --- the fight, fought out here ----------------------------------
        // True while a battle is being played out over the running world. The
        // scene keeps drawing behind it and Spriteset_Battle lays the troop and
        // the whole battle HUD on that frame (see the hooks at the foot of this
        // file), so a fight met on a road is fought on that road.
        isBattleView() { return !!(this._scene && this._scene._battleWatch); },
        // True while one of the ENGINE's own windows is up over the world: a
        // line of dialogue, a choice list, a shop counter. Those are drawn into
        // the game's canvas, which the world's DOM layer covers completely, so
        // for as long as one is showing the world is drawn into that canvas
        // instead and the window lands on top of it (see the Spriteset_Map
        // hooks at the foot of this file).
        isMirrorView() { return !!(this._scene && this._scene._mirrorWatch); },
        // Either of the two: the world is on the game's canvas rather than over it.
        isOnGameCanvas() {
            return !!(this._scene && (this._scene._battleWatch || this._scene._mirrorWatch));
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
        // How many cubes this world has had changed, running scene or not.
        digCount() {
            const f = this.field;
            if (f) return f.edits.count;
            const saved = VW.VoxelWorldState ? VW.VoxelWorldState.dug() : null;
            if (!saved) return 0;
            let n = 0;
            for (const k of Object.keys(saved)) n += (saved[k].length / 2) | 0;
            return n;
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

    // The travel timer belongs to FastTravelSystem, which loads well after this
    // file: wrapping it here at load time captured `undefined` and was then
    // overwritten outright by FastTravelSystem's own plain assignment, so the
    // camper never entered the 3D world on a fast travel and never left it on
    // arrival. The wrappers are installed at boot instead, once every plugin has
    // had its say, and each one carries the implementation that is actually there.
    function wrapTravelTimer(name, after) {
        const base = Game_System.prototype[name];
        if (typeof base !== 'function') return;
        if (base._voxelWrapped) return;
        const wrapped = function(...args) {
            const result = base.apply(this, args);
            try { after.apply(this, args); } catch (e) { console.error('[VoxelWorld] ' + name, e); }
            return result;
        };
        wrapped._voxelWrapped = true;
        Game_System.prototype[name] = wrapped;
    }

    const _Scene_Boot_start_VoxelTravel = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = function() {
        _Scene_Boot_start_VoxelTravel.call(this);
        wrapTravelTimer('startTravelTimer', function(duration, transport, destination, totalKm) {
            if (transport === 'camper') VoxelWorldSystem.start(duration, destination, totalKm);
        });
        wrapTravelTimer('completeTravelTimer', function() { VoxelWorldSystem.stop(); });
        wrapTravelTimer('stopTravelTimer', function() { VoxelWorldSystem.stop(); });
    };

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

    Spriteset_Battle.prototype.createVoxelWorldGround = function() {
        const canvas = VoxelWorldSystem.battleCanvas();
        if (!canvas || !window.PIXI || !this._baseSprite) return;
        hideBattleGround(this);

        // The canvas is drawn at the game's own resolution while a fight is on
        // (see beginBattleView), so the sprite is a straight 1:1 blit; the
        // declared size is restated anyway, since the world may have been drawn
        // at window size the last time this texture was looked at.
        const texture = PIXI.Texture.from(canvas);
        const base = texture.baseTexture;
        if (base.realWidth !== canvas.width || base.realHeight !== canvas.height) {
            base.setRealSize(canvas.width, canvas.height);
        }
        canvas._vwBattleTexture = texture;
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
        const texture = PIXI.Texture.from(canvas);
        const base = texture.baseTexture;
        if (base.realWidth !== canvas.width || base.realHeight !== canvas.height) {
            base.setRealSize(canvas.width, canvas.height);
        }
        canvas._vwBattleTexture = texture;
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
