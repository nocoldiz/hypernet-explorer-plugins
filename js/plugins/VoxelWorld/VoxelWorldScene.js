//=============================================================================
// VoxelWorldScene.js
// VoxelWorld: the scene itself: camera rigs, driving, walking, views
//
// Part of the VoxelWorld suite. The ground of that world is a field of small
// destructible voxels; this module is one slice of the machinery laid over it.
// Load order is fixed in plugins.js and every module reads the shared state it
// needs off window.VoxelWorld.
//=============================================================================

/*:
 * @target MZ
 * @plugindesc VoxelWorld - the scene itself: camera rigs, driving, walking, views
 * @author Omni-Lex
 *
 * @help
 * the scene itself: camera rigs, driving, walking, views.
 *
 * One module of the VoxelWorld suite (VoxelWorldCore.js loads first). It
 * declares no plugin commands of its own; those live in VoxelWorldSystem.js.
 */

(() => {
    'use strict';

    const VW = window.VoxelWorld;
    if (!VW) { console.error('[VoxelWorld] core not loaded before VoxelWorldScene.js'); return; }

    const {
        AIR_GRAVITY, BODY_BOUNCE_MAX, BODY_PITCH_MAX, BODY_ROLL_MAX, gravityScale, setGravityScale,
        BOOST_ACCEL_MULT, BOOST_FUEL_MULT, BOOST_RELEASE_DECAY, BRAKE_DECEL,
        BiomeEnemyManager, BuildingInteriors, CAMPER_BOUNDS, CAVE_SKY, CRITICAL_PARTS,
        VOXEL_STEP_MATERIAL, MATERIALS,
        CRUISE_KMH, CamperHUD, CamperWeapon, CharacterBillboard, VehicleBillboard, CityCrowd,
        DOOR_AUTO_OPEN_RANGE, DRAG_K, DRIVER_SEAT, ENEMY_3D_CONTACT_R,
        ENGINE_ACCEL, EngineAudio, FOG_CAVE, FOG_DAY, FOG_FREE, FOG_UNDERWATER, FOOT_EYE,
        VEHICLE_STEP_UP,
        FOOT_VAN_HALF_LEN, FOOT_WALK, FUEL_PER_UNIT, FirstPersonController,
        FollowerCrowd, GEARS, GEAR_FORCE, GamepadRaw, HANDBRAKE_DECEL,
        HANDBRAKE_GRIP, HEADLIGHT_BEAM_OPACITY, HEADLIGHT_INTENSITY,
        HEADLIGHT_NIGHT, KMH_TO_UNITS, LAT_ACCEL_MAX, LAT_SCRUB, LAUNCH_GRADE, LAUNCH_KMH,
        LIMINAL_ACCEL_SEC, LIMINAL_BOOST_FUEL_MULT, LIMINAL_BUILD_BUDGET,
        LIMINAL_FUEL_PER_SEC, LIMINAL_TERRAIN_RADIUS, LIMINAL_TOP_KMH, LOOT_RANGE,
        LiminalFx, MAX_KMH, MAX_STEER_LOCK, NATURAL_TOP, OVERDRIVE_DECAY,
        OVERDRIVE_KMHPS, ProceduralDecorator, REVERSE_ACCEL, REVERSE_MAX_KMH,
        ROAD_GAP, ROAD_TOTAL_W, RoadAutopilot, SETTLE, SHIFT_TIME, SLOPE_ACCEL,
        SOLID_PROPS, FLY_SKILL_ID, OVERLAY_Z, WORLD_UI_Z, WORLD_UI_IDS, MENU_Z,
        faceBillboards, PERSON_H,
        setBiomeOverride, getBiomeOverride, setAlienTerrain, buildOmegaTower,
        OMEGA_HEIGHT, OMEGA_PROXY_D, OMEGA_SIGHT, OMEGA_SPAN, OMEGA_TILE, VIEW_FAR,
        ALONGSIDE_MAX, RIDER_SEATS, RIDE_ALONGSIDE, VEHICLE_DRIVE, SHIP_ATMOSPHERE_Y,
        SHIP_BRIDGE_BOUNDS, SHIP_HELM_SEAT, SHIP_LAND_KMH, SHIP_LAND_CLEAR,
        SHIP_FLY_MIN, SHIP_FLY_MAX, SHIP_CLIMB_RATE,
        STEER_EASE, STEER_FALLOFF, STEP_SOUNDS, SURFACES, SkyFx, SolomonRitualFx, SpeedWarpFx, TALK_RANGE,
        SpellCaster, SpellFx, SPELL_SLOTS, BAR_MODES, isHealingSkill,
        ParkedVehicles, TrafficManager, UnderwaterFx, VanModel, VoxelTerrain,
        WALK_LANTERN_INTENSITY, WARP_START_KMH, WHEELBASE, WORLD_MAP_ID,
        WORLD_SCALE, WORLD_TILES, WORLD_TILE_SIZE, WaterPlane, WeatherParticles, skyFogColor,
        VOX, VoxelTool, VoxelWorldState, WheelFx, ZOOM_MAX, _clearBiomeCaches, _perlin, camperCan,
        PROP_RADIUS, PROP_MIN_R, PROP_SMASH_KMH, TRAFFIC_CRASH_KMH,
        SHIP_RAM_KMH, SHIP_RAM_DAMAGE, SHIP_RAM_EVERY,
        camperFuelConsume, camperFuelGet, camperFuelSet, camperMaxFuel,
        dayFactorForHour, getRenderType, getRoadDirectionAt, initPerlinWithSeed, VOXEL_WORLD_SEED,
        isSandboxOrTest, pickRandomRoadTile, placeNameAt, planForTile, roadLabelAt,
        sampleBiomeAt, sampleSkyColor, setTextureAnisotropy, settlementKindAt,
        isAirlessWorld, sampleAlienSkyColor,
        troopForBioEnemy
    } = VW;

    // How pocked a world is. A body with no air to burn an impactor up and no
    // weather to wear the scar down keeps every one it ever took; anything with
    // a crust still turning over keeps only the recent few. Unlisted worlds of
    // the rocky family get the fourteen the picture pocks them with.
    const CRATERED_TYPES = {
        // i18n-ignore: planet type ids
        sub_mercurian: 46, mercurian: 40, dwarf: 34, planetesimal: 30,
        centaur: 26, rogue: 22, mega_iron: 18, carbon: 12, diamond: 10,
        c_type_asteroid: 30, s_type_asteroid: 30, m_type_asteroid: 30,
        trojan_asteroid: 30, comet: 16, short_period_comet: 16,
        long_period_comet: 16, ice: 12, tundra: 6, desert: 8
    };

    // How long the world is held still after a message window closes, for the
    // answers that are deferred a frame or two past it.
    const MSG_GRACE_FRAMES = 20;
    // How often the sun's shadow map is redrawn, in frames. Every frame is
    // what three does by itself and it costs a walk of the whole scene graph
    // each time; a shadow two frames behind a sun that only moves with the
    // hour is a shadow nobody can tell from a live one.
    const SHADOW_EVERY = 3;

    // How close to a tree or a boulder counts as being at it (about two metres).
    const SCENERY_REACH = 9;

    // The height at which the voxel world hands over to the 2D procedural
    // underground. It is a few cubes off the bedrock floor of the field
    // (VOX.MIN_Y), so the whole cave system - the galleries, the chambers, the
    // sewers and the deep road - is walked in 3D, and the 2D map is reached
    // only by digging a shaft the rest of the way down to the bottom of the
    // world. Kept in world units because that is what the camera reports.
    const UNDERGROUND_2D_Y = (VOX.MIN_Y + 4) * VOX.SIZE;

    // How often the action prompt under the crosshair is worked out, in frames.
    const PROMPT_EVERY = 6;
    // How many frames the world waits on a window that says it is open but
    // is nowhere on screen before it takes itself back (about a second).
    const MENU_WATCHDOG = 60;

    // How close to a chest counts as standing at it (about four metres): a
    // little more generous than the scenery, because a chest is small and its
    // billboard is the only thing telling you where it is.
    const CHEST_REACH = 16;
    // How close a walker has to stand to a parked vehicle before E gets them
    // into it. A car is 18 units long, so this is arm's reach around it.
    const BOARD_REACH = 34;

    // Fishing. How far in front of a walker the water is looked for, how far in
    // is too close to count as a bank, and how deep that water has to be before
    // there is anything in it worth casting at.
    const FISH_REACH     = 34;
    const FISH_REACH_MIN = 6;
    const FISH_MIN_DEPTH = 10;

    // How many tiles are streamed while the party is inside the rock. It has to
    // agree with VoxelWorldTerrain's own CAVE_RADIUS, which is what the terrain
    // sets when the caves are switched on; the scene rewrites the radius every
    // frame, so if the two disagree the drive one wins and the caves are paid
    // for out to five tiles.
    const CAVE_STREAM_RADIUS = 3;

    // How deep an OPEN hole has to be before it reads as underground, and how
    // far back up before it stops. Anything with rock over its head counts
    // whatever its depth (see _updateUnderground); this is only for the shaft
    // somebody has sunk themselves and not yet roofed. Two thresholds, not one:
    // flipping the world rebuilds every tile around the camera, and a single
    // line would rebuild it twice a second for anybody standing on the lip.
    const CAVE_ENTER_DEPTH = VOX.SIZE * 8;
    const CAVE_LEAVE_DEPTH = VOX.SIZE * 5;

    // Which of VehicleSystemRepair's maintenance sheets belongs to the thing
    // being driven. Keyed by the same vehicle id VehiclePosition uses.
    const VEHICLE_MAINTENANCE_CMD = {
        camper: 'camperMaintenance', car: 'carMaintenance',
        bike: 'bikeMaintenance', airship: 'airshipMaintenance'
    };

    // What the salvage table should call one of the world's scattered sprites.
    // The table is keyed by the procedural map's own feature names, and every
    // sprite out here already knows the folder it came out of and the file it
    // is: between the two there is nearly always a real name to be had, and
    // where there is not, the folder's own name in the singular is a better
    // answer than nothing (a folder called Barrels holds barrels).
    const SCENERY_NAMES = [
        [/palm/i, 'Palm'], [/bamboo/i, 'Bamboo'], [/mangrove/i, 'Mangrove'],
        [/dead|bare|stump|snag/i, 'TreeDead'], [/log|trunk/i, 'Log'],
        [/mushroom|fungus|toadstool/i, 'Mushroom'], [/herb/i, 'Herb'],
        [/crystal|gem|geode/i, 'Crystal'], [/coral/i, 'Coral'],
        [/flower|rose|tulip|daisy|blossom/i, 'Flower'],
        [/bush|shrub|hedge/i, 'Bush'], [/fern/i, 'Fern'], [/reed|cattail/i, 'Reed'],
        [/cactus|cacti/i, 'Cactus'], [/vine|ivy/i, 'Vine'],
        [/grave|tomb|headstone/i, 'Gravestone'], [/barrel|keg/i, 'Barrel'],
        [/crate|box/i, 'Crate'], [/bone|skull/i, 'Bones'],
    ];
    function featureNameFor(rec) {
        const text = (rec.name || '') + ' ' + (rec.folder || '');
        for (const [re, name] of SCENERY_NAMES) if (re.test(text)) return name;
        if (rec.kind === 'tree') return 'Tree';    // i18n-ignore: feature id
        if (rec.kind === 'rock') return 'Rock';    // i18n-ignore: feature id
        if (rec.kind === 'plant') return 'Plant';  // i18n-ignore: feature id
        // A folder of things, named for one of them: Barrels -> Barrel.
        const folder = String(rec.folder || '');
        return folder.replace(/ies$/, 'y').replace(/s$/, '') || 'Rock';   // i18n-ignore: feature id
    }

    // =========================================================================
    // The game's own menus, over the world
    // =========================================================================
    // Half the game's menus are not RPG Maker scenes at all: the augments
    // register, the prosthetics fitter, the growth ledgers, the alchemy bench,
    // the containers, the shops - all of them are DOM built straight over
    // Scene_Map and left there. This world is a DOM overlay too, at a z-index
    // above the lot, so every one of them used to open UNDERNEATH it: the menu
    // was there, it was taking clicks, and nobody could see a pixel of it.
    //
    // Lifting them one id at a time (the way the toasts and the quick bar are
    // lifted, see WORLD_UI_IDS) does not scale: there are dozens of them, more
    // are written all the time, and a list is a thing to forget to add to. So
    // nothing is listed. While this world is up, ANYTHING the game puts on the
    // page is a menu by definition - the world was already there - and is put
    // above the world, with the world held still behind it and the mouse handed
    // back for as long as it is showing.
    //
    // The two exceptions are the widgets that are meant to sit over the world
    // and be looked THROUGH: a toast and the quick bar are lifted by
    // _surfaceDom, higher still, and never pause anything.
    class DomMenuGuard {
        constructor(own) {
            this._own = own;
            this._held = new Map();   // element -> { z: the z-index it had before, seq }
            this._obs  = null;
            this._seq  = 0;
            this.open  = false;
        }

        start() {
            if (typeof MutationObserver === 'undefined' || !document.body) return;
            // Only what turns up AFTER the world does. Whatever was already on
            // the page belongs to the page, and the world was put over it on
            // purpose.
            this._obs = new MutationObserver((recs) => {
                for (const r of recs) {
                    for (const n of r.addedNodes) this._hold(n);
                    for (const n of r.removedNodes) this._release(n);
                }
            });
            this._obs.observe(document.body, { childList: true });
        }

        // A thing you cannot click is not a menu. That one test is what tells a
        // menu from the world's own furniture without a list of names to keep:
        // the held weapon's canvas, a toast and the quick bar are all drawn
        // THROUGH - they set pointer-events to none, because a click on them is
        // meant for whatever is behind them - and each is placed at a height of
        // its own already. Everything else on this page is something the player
        // is expected to reach.
        static _isMenu(node) {
            if (!node || node.nodeType !== 1) return false;
            if (node.style && node.style.pointerEvents === 'none') return false;
            if (node.id && WORLD_UI_IDS.indexOf(node.id) >= 0) return false;
            // ...and neither is anything that already asked to be over the
            // world. It was put there on purpose and knows its own height.
            const z = parseInt(node.style && node.style.zIndex, 10);
            if (isFinite(z) && z >= OVERLAY_Z) return false;
            return true;
        }

        _hold(node) {
            if (node === this._own || this._held.has(node)) return;
            if (!DomMenuGuard._isMenu(node)) return;
            this._held.set(node, { z: node.style.zIndex, seq: ++this._seq });
            node.style.zIndex = String(MENU_Z);
        }

        _release(node) {
            const rec = this._held.get(node);
            if (!rec) return;
            node.style.zIndex = rec.z || '';
            this._held.delete(node);
        }

        // A bookmark in the order things arrived on the page. Taken when a fight
        // opens, spent when it ends (releaseSince): anything the fight put on the
        // page belongs to the fight, and the fight is over.
        mark() { return this._seq; }

        // Let go of everything held since `mark`. A scene that has terminated can
        // leave its own DOM standing - built once, hidden and shown rather than
        // removed, so the observer never sees it go - and a leftover like that
        // would otherwise read as a menu open over the world for ever, which
        // freezes the walk and the mouse with nothing on screen to explain it.
        releaseSince(mark) {
            for (const [el, rec] of [...this._held]) {
                if (rec.seq > mark) this._release(el);
            }
            return this.update();
        }

        // Is one actually being SHOWN? Menus are routinely built hidden and
        // shown later, and half of them are never taken off the page at all -
        // they are just hidden again - so the question has to be asked every
        // frame rather than answered when the element appeared.
        update() {
            let open = false;
            for (const el of this._held.keys()) {
                if (!el.isConnected) {
                    this._held.delete(el);
                    continue;
                }
                const st = el.style;
                if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') continue;
                if (st.pointerEvents === 'none') continue;
                if (el.offsetWidth > 0 || el.offsetHeight > 0) { open = true; break; }
            }
            this.open = open;
            return open;
        }

        stop() {
            if (this._obs) { this._obs.disconnect(); this._obs = null; }
            for (const el of [...this._held.keys()]) this._release(el);
            this.open = false;
        }
    }

    // =========================================================================
    // Two players, one world
    // =========================================================================
    // The 2D game already splits the screen for a second player at the same
    // keyboard or on a second pad (Multiplayer/SplitScreenMultiplayer.js): it
    // masks the map sprites into two viewports and hands Player 2 one of the
    // party to walk. This is the same session, out here.
    //
    // WHAT IS DIFFERENT IN 3D. The 2D split is two windows onto one camera's
    // world; here each player needs a camera of their own, because each is
    // looking somewhere else. So the scene is drawn TWICE a frame, into two
    // scissored halves of the one canvas, and everything that turns to face the
    // eye is turned again between the two passes (see faceBillboards) or the
    // second player would see the whole world edge-on.
    //
    // WHEN THE SCREEN IS ONE AGAIN. Two, in the same places the 2D session
    // merges: when the players are close enough to see the same thing anyway,
    // and whenever they are both aboard a vehicle - a camper has one windscreen,
    // and splitting the view of a drive both of them are on would be splitting
    // it for nothing.
    const SPLIT_MERGE_D  = 150;   // world units: closer than this and one view serves both
    const SPLIT_UNMERGE_D = 210;  // ...and this much further apart before it splits again
    const SPLIT_GAP      = 2;     // pixels of black between the halves

    class CoopPlayer {
        constructor(scene, camera) {
            this.camera = camera;
            this.fpc = new FirstPersonController(camera, CAMPER_BOUNDS);
            this.fpc.allowPointerLock = false;   // there is one mouse, and it is Player 1's
            this.body = null;                    // how the other player sees them
            this._yawE = new THREE.Euler();
            this._yawQ = new THREE.Quaternion();
        }

        // The second player's own controls: the pad the split-screen session
        // gave them, or their half of a shared keyboard. Direction is read off
        // the manager (which already merges both), and the look comes off the
        // pad's right stick, which the manager has no use for in 2D and so
        // never reads.
        static readInput() {
            const SS = window.$gameSplitScreen;
            if (!SS || !SS.active) return null;
            const p = SS.p2Input || {};
            const out = {
                forward: !!p.up, backward: !!p.down, left: !!p.left, right: !!p.right,
                sprint: !!p.dash, crouch: false, jump: !!p.action,
                turnX: 0, turnY: 0,
            };
            // The right stick, which the 2D session has no use for and so
            // never reads: an overhead map needs no separate look.
            if (SS.p2Look) {
                const look = SS.p2Look();
                out.turnX = look.x || 0;
                out.turnY = look.y || 0;
            }
            return out;
        }

        yaw() {
            return this._yawE.setFromQuaternion(
                this.camera.getWorldQuaternion(this._yawQ), 'YXZ').y;
        }

        dispose() {
            if (this.fpc.dispose) this.fpc.dispose();
            if (this.body) this.body.dispose();
        }
    }

    // A blow struck out here reaches as far as the weapon's own <Range:> tag
    // says, measured in the same steps the tactical battle layer measures it
    // in. A fist is one step; nothing reaches less far than an arm.
    const STRIKE_STEP       = 26;   // world units per step of a weapon's range
    const STRIKE_MIN_REACH  = 34;   // an arm's length, whatever the tag says

    // =========================================================================
    // Reserved squares: the world map's hand-made towns
    //
    // A place with `procedural: false` in Destinations.json has a map somebody
    // drew, reached through its own door. This world cannot build that town, so
    // its world squares are not open country to drive across: the party is
    // stopped at the edge of the footprint and asked whether they are going in.
    // Procedural places are untouched - this world builds those itself, street
    // by street, and they are meant to be walked through.
    //
    // WorldMapReturn owns the footprints and the doors; this only asks.
    // =========================================================================
    function isOmegaTowerTile(wx, wy) {
        const half = OMEGA_SPAN / 2;
        const cx = OMEGA_TILE.x - (half - 1) + half;
        const cz = OMEGA_TILE.y - (half - 1) + half;
        return Math.abs(wx - cx) <= half && Math.abs(wy - cz) <= half;
    }

    function reservedPlaceAt(wx, wy) {
        if (isOmegaTowerTile(wx, wy)) {
            return { name: 'Omega Tower', hand: true };
        }
        const WMR = window.WorldMapReturn;
        if (!WMR || !WMR.placeAtWorldSquare) return null;
        if (wx < 0 || wy < 0 || wx >= WORLD_TILES || wy >= WORLD_TILES) return null;
        const at = WMR.placeAtWorldSquare(wx, wy);
        if (!at || !at.hand) return null;
        // A place nobody drew a way into is not a wall: there is nothing behind
        // it to walk into, so the square stays open country.
        return WMR.placeEntranceFor(at.entry, null) ? at : null;
    }

    // The nearest world square that is not somebody's front room, searched
    // outward in rings. Returns the square it was given when that one is
    // already free, which is nearly always.
    function nearestFreeSquare(wx, wy) {
        if (!reservedPlaceAt(wx, wy)) return { x: wx, y: wy };
        for (let r = 1; r <= 6; r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
                    const nx = wx + dx, ny = wy + dy;
                    if (nx < 0 || ny < 0 || nx >= WORLD_TILES || ny >= WORLD_TILES) continue;
                    if (!reservedPlaceAt(nx, ny)) return { x: nx, y: ny };
                }
            }
        }
        return { x: wx, y: wy };
    }

    // A square NEXT TO the given one that nobody has already built on: the eight
    // neighbours are tried in turn, and only if every one of them is spoken for
    // does the search widen (nearestFreeSquare). Arriving at a place means
    // arriving at its edge, so the square itself is never the answer.
    function squareBeside(wx, wy) {
        const ring = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
        for (const [dx, dy] of ring) {
            const nx = wx + dx, ny = wy + dy;
            if (nx < 0 || ny < 0 || nx >= WORLD_TILES || ny >= WORLD_TILES) continue;
            if (!reservedPlaceAt(nx, ny)) return { x: nx, y: ny };
        }
        return nearestFreeSquare(wx, wy);
    }

    // How big the sun disc is drawn, in world units before the world scale. This
    // is Earth's own sun; _applyStarLight scales it by the apparent size of
    // whatever star a walk on another world is under.
    const SUN_DISC = 1600;

    // Which way somebody crossing from (x0,z0) to (x1,z1) was heading, as the
    // door list names it. The bigger of the two steps decides: a town is
    // entered through the side you came at it from.
    function travelDirName(x0, z0, x1, z1) {
        const dx = x1 - x0, dz = z1 - z0;
        if (Math.abs(dx) >= Math.abs(dz)) return dx >= 0 ? 'east' : 'west';
        return dz >= 0 ? 'south' : 'north';
    }

    // Put the ship in orbit and the party inside it. The galaxy simulation keeps
    // the ship's whereabouts as the system and the body it is circling, so
    // "orbiting Earth" is those two written down; the interior is the map the
    // vehicle system already declares for it.
    // Put the party aboard the ship, with the ship left in orbit of whatever they
    // just came up off. Earth when nobody says otherwise, which is the case the
    // atmosphere ceiling reaches; a walk on another world names that world.
    function enterOrbitFromSurface(planetName) {
        const GS = window.GalaxySim;
        const dm = GS && (GS.dataManager || GS.DataManager);
        const ship = dm && dm.playerShip;
        if (ship) {
            ship.currentSystem = dm.currentSystem || ship.currentSystem || 'Sol';  // i18n-ignore  system id
            ship.currentPlanet = planetName || 'Earth';  // i18n-ignore  planet id
            ship.targetSystem = null;
            ship.targetPlanet = null;
        }
        // Aboard: the ship's own interior, at the spot its config names.
        const cfg = window.MergedVehicleSystem && window.MergedVehicleSystem.interiorFor
            ? window.MergedVehicleSystem.interiorFor('airship') : null;
        const to = cfg || { mapId: 721, x: 28, y: 10, direction: 8 };
        if (typeof $gamePlayer !== 'undefined' && to.mapId) {
            if ($gamePlayer.isInVehicle && $gamePlayer.isInVehicle()) {
                $gamePlayer._vehicleType = '';
                $gamePlayer._vehicleGettingOn = false;
                $gamePlayer._vehicleGettingOff = false;
            }
            $gamePlayer.setTransparent(false);
            $gamePlayer.reserveTransfer(to.mapId, to.x, to.y, to.direction || 0, 0);
        }
    }

    // What a shop of this kind is called. RandomDailyShop keeps the labels (its
    // own i18n bank), so they are read off it rather than written down twice.
    function shopTypeLabel(shopType) {
        const shops = window.RandomDailyThemedShops;
        const def = shops && shops[shopType];
        if (def && def.label) return def.label;
        return T('CamperDrive.shop.generic');
    }

    // -------------------------------------------------------------------------
    // Letting the mouse go
    // -------------------------------------------------------------------------
    // The world grabs the pointer, and the browser reserves the FIRST Escape
    // press for handing it back: that keydown never reaches the page at all.
    // So the menu key looked like it needed pressing twice - once to free the
    // mouse, once to be heard. The scene listens for the lock being dropped
    // instead and treats an unasked-for drop as the Escape it never got (see
    // _onPointerUnlock), which means every release we ask for ourselves has to
    // be marked as ours. Everything in this file that lets the mouse go goes
    // through here.
    let _plockReleasedAt = -1e9;
    function releasePointerLock() {
        if (document.pointerLockElement !== document.body) return;
        _plockReleasedAt = (typeof performance !== 'undefined') ? performance.now() : Date.now();
        document.exitPointerLock();
    }
    // True when the lock has just been dropped by our own request rather than
    // by the player hitting Escape. A quarter of a second covers the round trip
    // through the browser's own event queue.
    function pointerLockReleaseWasOurs() {
        const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
        return (now - _plockReleasedAt) < 250;
    }

    // Whoever is at the head of the party either knows how to fly or does not,
    // and out here that is the same skill it is on the world map: Skills.json 9,
    // "Fly". Read off the leader every time it is asked, so swapping who walks
    // in front swaps whether the party can leave the ground.
    function leaderCanFly() {
        if (typeof $gameParty === 'undefined' || !$gameParty) return false;
        const leader = $gameParty.leader();
        if (!leader || typeof leader.hasSkill !== 'function') return false;
        return leader.hasSkill(FLY_SKILL_ID);
    }

    class VoxelWorldScene {
        constructor(duration, destinationName, totalKm, fuelCost, opts) {
            const options = opts || {};
            // Title mode: the drive runs as a silent background behind the title
            // screen. No HUD, no keyboard / mouse control, no engine audio and no
            // writes back to the save; an autopilot follows the roads instead.
            this._titleMode  = !!options.titleMode;
            // Free-play drive opened from the Minigames menu: no fast travel, no
            // party position to resume from, so it starts out on the open road.
            this._standalone = !!options.standalone;
            // Free walk (the world map's travel menu): the same world, walked
            // through on foot with no camper in it at all. The vehicle is still
            // built (the whole scene is wired to it) but it is invisible, never
            // driven, never solid and never written back to the save.
            this._footOnly   = !!options.footOnly;
            // Which vehicle the party took out here, and what it is like to
            // drive. Everything else in the file was written for the camper and
            // still means the camper when nothing else is asked for.
            this._vehicleId  = options.vehicle || 'camper';
            // A walk on another world: one biome from pole to pole, the planet's
            // own creatures in it, and no Earth underneath. `alien` is
            // { biome, planet } - see VoxelWorldSystem.startAlienWalk.
            this._alien      = options.alien || null;
            // Arrive already flying (the star map's flyby, and the bridge).
            this._startFlying = !!options.startFlying;
            // Arrive AT THE HELM rather than in the chase camera: the party
            // walked onto the bridge to fly the ship themselves, so that is
            // where the view starts (see the view-mode block below).
            this._startAtHelm = !!options.atHelm;
            if (this._alien && this._alien.biome) setBiomeOverride(this._alien.biome);
            // What the sky over this world does: how long its day is, whether
            // it turns at all, and what colour its star's light is. Null on
            // Earth, which is the whole of the old behaviour.
            this._sky        = (this._alien && this._alien.planet && this._alien.planet.day)
                ? this._alien.planet : null;
            // What everything here weighs. Earth unless this is somewhere else,
            // and put back to Earth's by stop() below.
            setGravityScale(this._sky ? this._sky.gravity : 1);
            setAlienTerrain(this._alien ? this._buildAlienTerrain() : null);
            this._drive      = VEHICLE_DRIVE[this._vehicleId] || VEHICLE_DRIVE.camper;
            this._duration   = duration;
            // Fuel is burned per distance travelled in _updateFuel (not from a
            // pre-planned per-trip cost), so fuelCost is kept only for reference.
            this._fuelCost   = fuelCost || 0;
            this._totalKm    = totalKm;
            // Kept so the readout can be built a second time when a walk turns
            // into a drive (see _mountVehicle).
            this._destination = destinationName;
            this._steerAngle = 0;
            this._animId     = null;
            this._lastTime   = null;
            this._menuOpen   = false;
            this._suspended  = false;      // true while the main menu is open over the scene
            // A fight is running over this world (see the battle view section
            // below): the scene keeps drawing, nobody walks, and the frame it
            // draws is what the battle is fought against.
            this._battleWatch = false;
            this._battleSeen  = false;
            this._pendingFought = null;
            // Nothing out here picks a fight. The Liminal World is walked and
            // driven for its own sake: the wildlife is still generated, still
            // roams and still gets shouldered out of the road, but walking into
            // one (or swinging at one) opens nothing. There is no party behind
            // the free-play context worth losing.
            this._noEncounters = this._standalone;
            this._pendingShop = null;      // a shopkeeper waiting to open their stock
            this._speedKmh   = 0;          // parked on entry; throttle or auto-travel moves it
            this._steerSmooth = 0;         // eased steering input for smoother turning
            this._tmpSky     = new THREE.Color();

            this._speed = Math.max(8, (totalKm * WORLD_TILE_SIZE / 5) / Math.max(1, duration));

            // Seed the 3D start from the camper's true world position so the 3D and
            // 2D (map 315) coordinates always agree. Priority: live player tile when
            // already on map 315, else the stored camper world tile (vars 63/64),
            // else the player-world vars (43/44). Avoids starting at a stale (0,0).
            let startWX, startWY;
            if (this._alien) {
                // Another world's own grid: one world square to a cell of the
                // landing picture, so the party is standing on the exact square
                // they picked off it and walking east takes them round the
                // planet rather than off the edge of Earth.
                const cell = (this._alien.planet && this._alien.planet.terrain &&
                              this._alien.planet.terrain.cell) || null;
                startWX = cell ? cell.gx : 0;
                startWY = cell ? cell.gy : 0;
            } else if (this._standalone && options.startTile) {
                // The Liminal World was opened on a place off the travel map, so
                // the party is put down BESIDE it rather than on it: a hand-made
                // town's own squares are not this world's to stand on, and the
                // point of picking a destination is to arrive at its edge.
                const beside = squareBeside(options.startTile.x, options.startTile.y);
                startWX = beside.x;
                startWY = beside.y;
            } else if (this._titleMode || this._standalone) {
                // Start somewhere on the world's road network, not at the party's
                // (nonexistent) position: neither the title drive nor the free-play
                // drive has a game to resume, so drop the camper on a random road
                // tile with somewhere to drive to.
                const seed = pickRandomRoadTile();
                startWX = seed ? seed.x : Math.floor(WORLD_TILES / 2);
                startWY = seed ? seed.y : Math.floor(WORLD_TILES / 2);
            } else if (typeof $gameMap !== 'undefined' && $gameMap.mapId() === WORLD_MAP_ID &&
                typeof $gamePlayer !== 'undefined') {
                startWX = $gamePlayer.x;
                startWY = $gamePlayer.y;
            } else if (window.VehiclePosition &&
                       window.VehiclePosition.mapId('camper') === WORLD_MAP_ID) {
                startWX = window.VehiclePosition.x('camper');
                startWY = window.VehiclePosition.y('camper');
            } else {
                startWX = (typeof $gameVariables !== 'undefined') ? $gameVariables.value(43) : 0;
                startWY = (typeof $gameVariables !== 'undefined') ? $gameVariables.value(44) : 0;
            }
            // A hand-made town's own squares are not this world's to stand on
            // (see the reserved-square section below). Anything that starts on
            // one - a save made inside the footprint, a fast travel that ended
            // on it - is stepped off onto the nearest square that is, and the
            // party's world coordinates go with it.
            if (!this._titleMode && !this._standalone && !this._alien) {
                const free = nearestFreeSquare(startWX, startWY);
                if (free.x !== startWX || free.y !== startWY) {
                    startWX = free.x; startWY = free.y;
                    if (typeof $gameVariables !== 'undefined') {
                        $gameVariables.setValue(43, startWX);
                        $gameVariables.setValue(44, startWY);
                    }
                    if (window.VehiclePosition && !this._footOnly) {
                        window.VehiclePosition.set('camper', WORLD_MAP_ID, startWX, startWY);
                    }
                }
            }
            this._vanX      = startWX * WORLD_TILE_SIZE + WORLD_TILE_SIZE * 0.5;
            this._vanZ      = startWY * WORLD_TILE_SIZE + WORLD_TILE_SIZE * 0.5;
            // The last square the party stood on that was theirs to stand on,
            // and what they are put back to when they walk at a town.
            this._lastFreeX = this._vanX;
            this._lastFreeZ = this._vanZ;
            this._placeAskT = 0;

            this._driveAngle = this._computeDriveAngle(startWX, startWY);

            // The shape of the 3D world is FIXED. It used to be seeded from the
            // world's own history seed, which meant the same world square was a
            // different hill in every world - and, worse, that a dig log saved
            // against one seed described holes in ground that no longer existed
            // when the same square was walked in another. The relief, the
            // rivers, the caves and the islands are all one constant now: what
            // changes between worlds is the biome MAP laid over them, which is
            // where a world's character actually lives.
            initPerlinWithSeed(VOXEL_WORLD_SEED);
            _clearBiomeCaches();   // fresh biome memo for this world / scene

            // Auto-travel destination tile (camper fast travel). The drive flies
            // straight to it; no road pathfinding is needed.
            // A free-play drive is never a journey: it stays parked where it was
            // dropped until the player drives it.
            const _ftDest = (!this._standalone && !this._footOnly &&
                typeof $gameSystem !== 'undefined' && $gameSystem._fastTravelData)
                ? $gameSystem._fastTravelData.finalDestination : null;
            this._destWX = _ftDest ? _ftDest.x : startWX;
            this._destWY = _ftDest ? _ftDest.y : startWY;

            this._createOverlay();
            this._initThree();

            this._terrain = new VoxelTerrain(this._scene);
            // A drive entered from the game builds its whole neighbourhood up
            // front (it is behind a transition anyway); the title background
            // spreads that build over the first frames instead, so opening the
            // title screen never stutters. Either way the camper's own chunk is
            // ready first, and the rest fills in behind the fade.
            this._terrain.update(this._vanX, this._vanZ, !this._titleMode);

            // Every cube this world has had taken out of it or put back, from
            // whenever anybody last dug here. The title background never reads
            // or writes it: its drive is not part of anybody's save.
            // Whose ground this is. The title screen's drive and a walk on
            // another planet both run over the same square numbers as Earth,
            // and neither of them is Earth: nothing they do is written down.
            VoxelWorldState.setEnabled(!this._titleMode && !this._alien);
            if (!this._titleMode && !this._alien) {
                const dug = VoxelWorldState.dug();
                if (dug) {
                    this._terrain.field.edits.load(dug);
                    this._terrain.rebuildAll();
                    this._terrain.update(this._vanX, this._vanZ, true);
                }
            }

            // The pick. Only ever live on foot, and never on the title screen.
            this._tool     = this._titleMode ? null : new VoxelTool(this._scene, this._terrain);
            this._digHeld  = false;
            this._placeReq = false;
            this._cycleReq = 0;
            // The spell bar, and the door onto the game's own battle animations
            // out here (see VoxelWorldFx's SpellFx: Effekseer on this world's
            // own GL context, because the game's own draws under the overlay).
            this._spellFx = this._titleMode ? null : new SpellFx(this._renderer);
            this._caster  = this._titleMode ? null : new SpellCaster(this._scene, this._terrain, {
                onAnimation: (id, x, y, z) => {
                    if (this._spellFx) this._spellFx.play(id, x, y, z);
                },
                onBurst: (x, y, z, radius, force, skill) => this._spellBurst(x, y, z, radius, force, skill)
            });
            this._castReq = false;

            this._van = new VanModel(this._scene);
            this._van.group.position.set(this._vanX, 0, this._vanZ);
            // Yaw first, then terrain pitch/roll: keeps the slope alignment sane
            // at any heading (default XYZ order would twist the chassis).
            this._van.group.rotation.order = 'YXZ';
            this._van.group.rotation.y = this._driveAngle;
            // A free walk has no camper: it is kept in the scene graph (lights,
            // dash and motion calls all hang off it) but never drawn.
            if (this._footOnly) this._van.group.visible = false;
            // Nor has any other vehicle. The camper stays in the graph either
            // way - the wheels, the dash and the door all hang off it - and what
            // is actually SEEN is the garage's model of whatever was driven out
            // here, parented to it so it goes where the camper goes.
            this._buildDrivenModel();

            // --- Vehicle physics state (bicycle model with lateral slip) ---
            this._velX = 0; this._velZ = 0;          // persistent world velocity
            this._fwdSpeed = 0; this._latSpeed = 0;  // heading-frame decomposition
            this._throttle01 = 0;                    // eased throttle input
            this._gear = 1; this._rpm = 0.12; this._shiftTimer = 0;
            this._gearLabel = 'N';
            this._slip01 = 0; this._grade = 0;
            this._surface = SURFACES.asphalt;
            this._handbrake = false; this._brakeOn = false;
            this._reverseDelay = 0;
            this._crashTimer = 0; this._crashCooldown = 0;
            // One ram per mountainside: without this the ship takes the same
            // impact every frame the rock in front of it is touched.
            this._ramCooldown = 0;
            this._msgWatch = false; this._msgGrace = 0;
            this._domMenus = null; this._domMenuOpen = false;
            this._ftRampT = 0;   // liminal-drive ramp-up elapsed (seconds, resets whenever fast travel isn't active)
            this._groundPitch = 0; this._groundRoll = 0;

            this._hud = new CamperHUD(this._overlay, destinationName, totalKm,
                this._titleMode, this._footOnly);
            // Which world the map is a map of, before it is ever drawn: Earth's
            // continents are no use to somebody standing on another planet.
            if (this._hud.setPlanet) this._hud.setPlanet(this._sky);
            // A cell of the quick bar clicked is the same as its number key.
            // (It only ever reaches the bar when the mouse is not grabbed - a
            // pointer-locked click is a swing at what the crosshair is on.)
            if (this._hud.onBlockPick && this._tool) {
                this._hud.onBlockPick((i) => this._selectBarSlot(i));
            }
            this._fpc = new FirstPersonController(this._camera, CAMPER_BOUNDS);
            // The title background never grabs the mouse: the player is clicking
            // the title menu, not driving.
            if (this._titleMode) this._fpc.allowPointerLock = false;
            this._van.group.add(this._fpc.getRig());
            this._setupVehicleLights();
            // A free walk carries its own light: with no camper there are no
            // headlights, and everything after dusk would be a black screen.
            if (this._footOnly) this._setupWalkLantern();

            // Environment + physics state.
            this._env            = 'road';     // road | air | water | underwater | cave
            // True while the party has rock over their head. Everything a cave
            // is - the dark, the close fog, the lantern, the sea taken away,
            // and the passages being meshed at all - hangs off this one flag.
            this._underground    = false;
            this._flying         = false;      // player-toggled flight (needs 'fly' upgrade)
            this._dived          = false;      // player-toggled dive  (needs 'dive' upgrade)
            this._vanY           = 0;          // smoothed vertical position of the rig
            this._prevSpeedKmh   = 0;          // for accel-driven nose dive / squat
            this._odo            = 0;          // distance integrator for road rumble
            this._bodyRoll = 0; this._bodyPitch = 0; this._bodyBounce = 0;
            this._speedUnitsSigned = 0;

            // Ramp / airborne state: when the camper launches off a crest at speed
            // it flies a ballistic arc (vy = vertical velocity) until it lands.
            this._airborne  = false;
            this._vy        = 0;
            this._landJolt  = 0;       // suspension compression on touchdown, decays
            // Liminal boost (Shift) + speed-driven space warp.
            this._boostActive = false;
            this._warpAmount  = 0;     // smoothed space-distortion strength 0..1

            // Last solid-ground position, used to bounce the camper back onto land
            // if it drives into water without the Amphibious (float) upgrade.
            this._lastLandX = this._vanX;
            this._lastLandZ = this._vanZ;
            this._lastLandAngle = this._driveAngle;
            this._waterRescue = false;     // true while the fade-out rescue runs
            this._stuck = false;           // in water w/o traversal, flipped, or wedged
            this._stuckReason = '';        // label shown in the respawn prompt
            this._wedgeTimer = 0;          // accumulates while throttling but not moving

            // Sandbox / "Test" save starts with every modular upgrade unlocked,
            // so testing the drive scene is never blocked by locked features.
            if (!this._titleMode && isSandboxOrTest() && typeof $gameSystem !== 'undefined') {
                $gameSystem._camperUpgrades = Object.assign(
                    $gameSystem._camperUpgrades || {}, { fly: true, float: true, dive: true }
                );
            }

            // Always begin a drive with a full tank. The camper's fuel level could
            // be 0 (fresh save), a stale low value left by an up-front fast-travel
            // deduction, or a non-finite value from an earlier glitch - any of
            // which stranded the camper "out of fuel" within a few metres. Burn is
            // distance-based and minuscule, so a full tank on entry means driving is
            // never gated by fuel; refuel mechanics still apply to fast-travel cost.
            // (Skipped in title mode: the background drive never touches the save.)
            if (!this._titleMode && !this._footOnly) {
                const tank = camperFuelGet();
                const max  = camperMaxFuel();
                if (!(tank > 0) || tank < max) {
                    camperFuelSet(max);
                }
            }

            this._zoomDist       = 0;
            this._freeCamActive  = false;
            this._freePivot      = new THREE.Vector3(this._vanX, 0, this._vanZ);
            this._freeMoveKeys   = new Set();

            // --- New Orbit Camera State ---
            this._freeCamDrag    = false;
            this._freeCamYaw     = 0;
            this._freeCamPitch   = 0.8; // Approx 45 degrees looking down

            this._onWheel            = this._onWheel.bind(this);
            this._onFreeCamKeyDown   = (e) => {
                if (!VoxelWorldSystem.isActive()) return;
                this._freeMoveKeys.add(e.code);
                if (this._viewMode !== 'foot') return;
                if (/^Key[WASD]$/.test(e.code)) this._teachControl('voxWalk');
                else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this._teachControl('voxRun');
                else if (e.code === 'Space') this._teachControl('voxJump');
                else if (e.code === 'KeyG') this._teachControl('voxPlace');
            };
            this._onFreeCamKeyUp     = (e) => { this._freeMoveKeys.delete(e.code); };
            
            // --- New Mouse Handlers ---
            this._onFreeCamMouseDown = this._onFreeCamMouseDown.bind(this);
            this._onFreeCamMouseUp   = this._onFreeCamMouseUp.bind(this);
            this._onFreeCamMouseMove = this._onFreeCamMouseMove.bind(this);

            // Every control listener below is skipped in title mode: the title
            // screen owns the keyboard and the mouse there.
            if (!this._titleMode) {
                document.addEventListener('wheel',     this._onWheel, { passive: true });
                document.addEventListener('keydown',   this._onFreeCamKeyDown);
                document.addEventListener('keyup',     this._onFreeCamKeyUp);
                document.addEventListener('mousedown', this._onFreeCamMouseDown);
                document.addEventListener('mouseup',   this._onFreeCamMouseUp);
                document.addEventListener('mousemove', this._onFreeCamMouseMove);
            }

            // Atmospherics + living world. The title background skips the engine
            // audio (the title theme is playing) and the roaming battlers (they
            // load 3D models the title has no use for).
            this._weatherFx    = new WeatherParticles(this._scene);
            // Everything the party owns and is not driving, standing on the
            // square they left it on. One record answers for the world map and
            // for this world alike (window.VehiclePosition).
            // ...and neither the camper nor anything else the party left standing
            // on a square of Earth is standing on another planet.
            this._parked       = (this._titleMode || this._standalone || this._alien)
                ? null : new ParkedVehicles(this._scene, this._terrain);
            // On a planet, what roams is what lives there: the roster the
            // galaxy simulation generated for this world, not Earth's fauna.
            // A dead world has none, and nothing roams it.
            if (this._alien && this._bioEnemies) {
                this._bioEnemies.setRoster(this._alien.species || null);
            }
            // A second player, where there is a split-screen session running.
            // Built before the landmarks so the first frame already has both.
            this._coop = null;
            this._splitNow = false;
            if (!this._titleMode && !this._standalone) this._startCoop();
            // The one landmark on this world. Built once and stood in it: it is
            // neither terrain nor a town, so nothing streams it in and out.
            this._omega = null;
            if (!this._alien) this._buildOmegaTower();
            this._applyStarLight();
            this._water        = new WaterPlane(this._scene);
            this._traffic      = new TrafficManager(this._scene, this._titleMode);
            this._underwaterFx = new UnderwaterFx(this._scene);
            this._skyFx        = new SkyFx(this._scene);
            // Whose sky this is. Earth's, unless the walk is somewhere else, in
            // which case that world's own moons go up instead of ours.
            this._skyFx.setWorld(this._sky);
            if (isAirlessWorld && isAirlessWorld(this._alien)) this._skyFx.setAirless(true);
            this._wheelFx      = new WheelFx(this._scene);
            this._bioEnemies   = this._titleMode ? null : new BiomeEnemyManager(this._scene, this._terrain);
            // The people: a town's own citizens on its pavements, and the party
            // (and the pet) walking behind the leader whenever they are on foot.
            this._crowd        = this._titleMode ? null : new CityCrowd(this._scene, this._terrain);
            this._interiors    = this._titleMode ? null : new BuildingInteriors(this._scene, this._terrain);
            this._followers    = this._titleMode ? null : new FollowerCrowd(this._scene);
            this._engine       = (this._titleMode || this._footOnly) ? null : new EngineAudio();
            this._liminal      = new LiminalFx(this._scene, this._overlay);
            this._liminalI     = 0;   // smoothed cosmic-horror intensity 0..1
            this._speedFx      = new SpeedWarpFx();
            this._solomon      = new SolomonRitualFx(this._scene, this._terrain, this._overlay);
            this._solomonShake = 0;
            this._warpCentre   = new THREE.Vector3();

            this._viewMode = 'fp'; // 'fpdrive' | 'fp' | 'car' | 'free' | 'foot'

            // A flyby arrives in the air with the ship already under way: the
            // party never lands, so there is nothing to take off from. The
            // chase camera goes with it, because the whole point of a flyby is
            // seeing the ship over the world.
            if (this._startFlying && !this._footOnly) {
                this._flying = true;
                this._dived = false;
                // Which view it opens in is settled where the opening mode is
                // actually set up, at the end of the constructor.
            }

            if (!this._titleMode) {
                // ESC / back opens a menu; it never quits the world on its own.
                // On your own two feet it is the party's own menu, the same one
                // the map opens, and its "return to the world map" entry is what
                // ends the world (both ways of being out here, see
                // VoxelWorldSystem.exitToWorldMap). At the wheel it is the
                // vehicle's own options instead: stop, step outside, refuel.
                this._onEscKey = (e) => {
                    if (e.code !== 'Escape' || !VoxelWorldSystem.isActive()) return;
                    // The big map is up: Escape puts it away, the way it closes
                    // anything else laid over the world.
                    if (this._closeFullMap()) return;
                    // A menu is up over the world: that Escape closes the menu.
                    if (this.isPaused()) return;
                    this._openEscMenu();
                };
                document.addEventListener('keydown', this._onEscKey);

                // ...and the Escape the browser ate. While the pointer is
                // locked, Chromium spends the first Escape press releasing it
                // and never delivers the keydown, so the menu appeared to want
                // two presses. A drop of the lock that we did not ask for IS
                // that press, and opens the same menu the key would have.
                this._onPointerUnlock = () => {
                    if (document.pointerLockElement === document.body) return;   // grabbed, not dropped
                    if (!VoxelWorldSystem.isActive() || VoxelWorldSystem._scene !== this) return;
                    if (pointerLockReleaseWasOurs()) return;                     // we let it go on purpose
                    // Alt-tabbing away drops the lock too, and that is not a
                    // request for the party menu.
                    if (typeof document.hasFocus === 'function' && !document.hasFocus()) return;
                    if (this._closeFullMap()) return;
                    if (this.isPaused()) return;
                    this._openEscMenu();
                };
                document.addEventListener('pointerlockchange', this._onPointerUnlock);

                // The control legend is out of the way until it is asked for:
                // H puts it up, H takes it down again. Nobody wants a wall of
                // key names over the first drive, and everybody wants it once.
                this._onHelpKey = (e) => {
                    if (e.code !== 'KeyH' || !VoxelWorldSystem.isActive()) return;
                    // Shifted it is the codex, the same way shifted R is the
                    // wait menu: two tables, one letter each way (_runMenuHotkey).
                    if (e.shiftKey) return;
                    if (this.isPaused()) return;
                    if (this._hud && this._hud.toggleCommands) this._hud.toggleCommands();
                };
                document.addEventListener('keydown', this._onHelpKey);

                // Tab means the quick bar on foot and the camera at the wheel.
                // There is no bar to walk through while driving, and no camera
                // to cycle while standing in a field, so the one key answers
                // whichever question the party is actually in a position to ask
                // (L2 on a pad does the same, see _updateBarInput).
                this._onTabKey = (e) => {
                    if (e.code === 'Tab' && VoxelWorldSystem.isActive()) {
                        if (this.isPaused()) return;   // that Tab is the menu's
                        e.preventDefault();
                        if (this._viewMode === 'foot') this._cycleBarMode(1);
                        else this._cycleViewMode();
                    }
                };
                document.addEventListener('keydown', this._onTabKey);

                // M cycles the map views - the close grid window, the whole
                // world in the corner, the whole world across the screen, off -
                // mirroring WorldMap.js's M-key cycle on the world map (315).
                // The big one is the exception to the pause rule below: while it
                // is up nothing else is, so M is the key that puts it away.
                this._onMapKey = (e) => {
                    if (e.code !== 'KeyM' || !VoxelWorldSystem.isActive() || !this._hud) return;
                    if (this.isPaused() && !this._isFullMapOpen()) return;
                    this._teachControl('voxMap');
                    this._hud.cycleMapMode();
                    this._hud._drawMiniMap(this._vanX, this._vanZ);
                    // The map is dragged with the mouse, so the mouse has to be
                    // the player's again while it is open; walking back out of
                    // it takes the world's grab back on the next click.
                    if (this._isFullMapOpen()) releasePointerLock();
                    if (typeof SoundManager !== 'undefined') SoundManager.playCursor();
                };
                document.addEventListener('keydown', this._onMapKey);

                // F = toggle flight, C = toggle dive, E = interact (sit / doors /
                // grab the wheel) when on foot in first person.
                this._onActionKey = (e) => {
                    if (!VoxelWorldSystem.isActive()) return;
                    if (this.isPaused()) return;
                    if (e.code === 'KeyF')      this._toggleFlight();
                    else if (e.code === 'KeyC') this._toggleDive();
                    else if (e.code === 'KeyE') this._interact();
                    // Shifted, R is the wait menu instead (see _runMenuHotkey):
                    // the world and the party menu both want this letter, and
                    // only one of them can have the plain press.
                    else if (e.code === 'KeyR' && !e.shiftKey) this._respawnCamper();
                    else if (e.code === 'KeyG') this._placeReq = true;
                    else if (e.code === 'KeyQ') this._cycleReq = e.shiftKey ? -1 : 1;
                    else if (e.code === 'F7' || e.keyCode === 118) {
                        if (this._isDeveloperMode()) {
                            e.preventDefault();
                            this.toggleSolomonRitual();
                        }
                    }
                    // 1..9 go straight to a slot of the quick bar: 1 is the
                    // weapon, the rest are the blocks in the order they were dug.
                    else if (/^Digit[1-9]$/.test(e.code) && this._tool) {
                        this._selectBarSlot(Number(e.code.slice(5)) - 1);
                    }
                };
                document.addEventListener('keydown', this._onActionKey);

                // The party's own menus, from out here. I, J, U, C, O, R, B, F,
                // K, H, N, Y - every key the map answers to answers here too,
                // out of the ONE table that owns them (UI/CustomMainMenuLayout's
                // HOTKEYS, handed over as window.MenuHotkeys). This world is a
                // DOM overlay and Scene_Map.updateMenuHotkeys never sees a key
                // while it is up, which is why the journal and the equipment
                // screen were unreachable on a walk.
                this._onMenuHotkey = (e) => {
                    if (!VoxelWorldSystem.isActive() || this._standalone) return;
                    if (this.isPaused()) return;
                    if (e.ctrlKey || e.altKey || e.metaKey) return;
                    this._runMenuHotkey(e);
                };
                document.addEventListener('keydown', this._onMenuHotkey);

                // Digging is the swing itself: hold the attack button and the
                // cube under the crosshair comes apart. Nothing new to learn,
                // and it is why a pick through rock is slower than through turf.
                this._onDigDown = (e) => {
                    if (e.button !== 0 || !VoxelWorldSystem.isActive()) return;
                    if (document.pointerLockElement !== document.body) return;
                    this._digHeld = true;
                    // The mouse is grabbed, so they are looking around with it
                    // as well as swinging with it.
                    this._teachControl('voxLook');
                    this._teachControl('voxDig');
                };
                this._onDigUp = (e) => { if (e.button === 0) this._digHeld = false; };
                document.addEventListener('mousedown', this._onDigDown);
                document.addEventListener('mouseup',   this._onDigUp);
            }

            // What the leader has in their hands, drawn over the drive.
            if (!this._titleMode) CamperWeapon.begin();

            if (this._titleMode) {
                // A different hour every time the title is opened: mostly
                // daylight, sometimes dawn / dusk / a night drive.
                const hour = Math.random() < 0.75 ? 7 + Math.random() * 13 : Math.random() * 24;
                this._titleMinuteOffset = Math.round(hour * 60 - 600 + 24 * 60);
                // Title background: the eye sits at the wheel and an autopilot
                // takes the camper down the world's roads on its own.
                this._setMode('fpdrive');
                this._autopilot = new RoadAutopilot(this, startWX, startWY);
                this._van.group.rotation.y = this._driveAngle;
                this._bindTitleLook();
            } else if (this._footOnly) {
                // Free walk: straight out onto the ground where the party stands,
                // first person, with nothing to climb into.
                this._setMode('foot');
            } else if (this._startAtHelm) {
                // Onto the bridge: the party walked up to the helm to fly the
                // ship themselves, so the view opens there, in first person,
                // and E gets them up out of the chair to walk the room.
                this._setMode('fpdrive');
            } else {
                // Always open in the third-person chase camera ('car'): it sits behind
                // and slightly above the camper, looking forward along the direction of
                // travel (up = +Y, never inverted). First-person driving (eye at the
                // wheel) is reachable from there via TAB (or gamepad Y), which toggles
                // car <-> fpdrive only.
                this._setMode('car');
            }

            this._loop = this._loop.bind(this);
            this._animId = requestAnimationFrame(this._loop);
        }

        _onWheel(e) {
            if (!VoxelWorldSystem.isActive()) return;
            const dir = e.deltaY > 0 ? 1 : -1;
            // On foot the wheel is the quick bar, not the camera: it steps
            // between the weapon in the leader's hands and every kind of block
            // they have dug up. There is no third-person distance to change out
            // there anyway - the walk is first person.
            if (this._viewMode === 'foot' && this._tool) { this._cycleReq = dir; return; }
            const step = Math.max(150, this._zoomDist * 0.15 + 150);
            this._zoomDist = Math.max(0, Math.min(ZOOM_MAX, this._zoomDist + dir * step));
        }
        
        _onFreeCamMouseDown(e) {
            if ((this._freeCamActive || this._viewMode === 'car') && e.button === 1) {
                this._freeCamDrag = true;
            }
        }

        _onFreeCamMouseUp(e) {
            if (e.button === 1) {
                this._freeCamDrag = false;
            }
        }

        _onFreeCamMouseMove(e) {
            if (this._freeCamDrag && (this._freeCamActive || this._viewMode === 'car')) {
                const mx = e.movementX || e.mozMovementX || e.webkitMovementX || 0;
                const my = e.movementY || e.mozMovementY || e.webkitMovementY || 0;
                this._freeCamYaw -= mx * 0.005;
                this._freeCamPitch += my * 0.005;
                this._freeCamPitch = Math.max(0.1, Math.min(Math.PI / 2 - 0.1, this._freeCamPitch));
            }
        }
        
        _isFastTravelActive() {
            if (this._titleMode) return false;   // the title drive is never a journey
            if (this._footOnly)  return false;   // nor is a walk
            if (typeof $gameSystem === 'undefined' || !$gameSystem.getFastTravelData) return false;
            const d = $gameSystem.getFastTravelData();
            return !!(d && d.timerActive && d.timerTransport === 'camper' && d.timerRemainingTime > 0);
        }

        // Accelerate ("turbo") button. The 'shift' symbol maps to keyboard Shift
        // and gamepad X by default, so this works on controller too.
        _isAcceleratePressed() {
            return typeof Input !== 'undefined' && Input.isPressed('shift');
        }

        // How far the wheel is turned, -1 (left) to 1 (right).
        //
        // A pad's LEFT STICK is read as the analog thing it is and comes first:
        // core folds it into the 'left' / 'right' actions, which is why the
        // stick used to arrive here as a full lock the moment it left the
        // deadzone and a gentle lean through a bend was not something the wheel
        // could be asked for. Its own reading is proportional, and squared so
        // that the middle of its travel is where the small corrections live.
        //
        // A key, an arrow or the d-pad is all or nothing, as it has to be, and
        // is eased by the caller instead. Left and right pressed together
        // cancel rather than one of them silently winning.
        _steerInput() {
            const ASI = window.AnalogStickInput;
            if (ASI && ASI.hasPad && ASI.hasPad() && ASI.leftX) {
                const x = ASI.leftX();
                if (Math.abs(x) > 0.001) {
                    this._steerAnalog = true;
                    const v = Math.max(-1, Math.min(1, x));
                    return v * Math.abs(v);
                }
            }
            this._steerAnalog = false;
            const left  = this._freeMoveKeys.has('KeyA') ||
                (typeof Input !== 'undefined' && Input.isPressed('left'));
            const right = this._freeMoveKeys.has('KeyD') ||
                (typeof Input !== 'undefined' && Input.isPressed('right'));
            return (right ? 1 : 0) - (left ? 1 : 0);
        }

        _setMode(mode) {
            const prev = this._viewMode;
            if (prev === mode) return;
            this._viewMode = mode;
            this._freeCamActive = (mode === 'free');

            // Teardown previous mode. 'fp' (cabin), 'fpdrive' (driver seat) and
            // 'foot' (outside) share the first-person rig, so all three detach the
            // camera the same way.
            if (prev === 'fp' || prev === 'fpdrive' || prev === 'foot') {
                this._fpc.pitch.remove(this._camera);
                this._scene.add(this._camera);
                this._fpc.deactivated = true;
                releasePointerLock();
            }
            // Leaving the driver seat: re-enable cabin walking.
            if (prev === 'fpdrive') this._fpc.setDriving(false);
            // Leaving on-foot: re-stow the rig back inside the camper (every mode
            // change away from 'foot' puts the player back in the cabin) and shut
            // the door; proximity (see _updateDoorAutoOpen) keeps it that way once
            // the player has stepped back from it.
            if (prev === 'foot') {
                this._fpc.setWorldMode(false);
                this._attachRigToVan();
                if (this._van.setDoorOpen) this._van.setDoorOpen(false);
            }

            // Setup new mode. The single camper (this._van) is always visible;
            // in first person the camera simply sits inside it.
            if (mode === 'fp') {
                // Walking the room: the ship's bridge if that is what is being
                // flown, the camper's cabin otherwise. Same rig, same walk,
                // different four walls.
                this._fpc.bounds = this._walkBounds();
                this._setBridgeVisible(this._hasBridge());
                this._attachRigToVan();
                this._scene.remove(this._camera);
                this._camera.position.set(0, 0, 0);
                this._camera.rotation.set(0, 0, 0);
                this._fpc.pitch.add(this._camera);
                this._fpc.deactivated = false;
                this._camera.far = VIEW_FAR;
                this._camera.fov = this._baseFov;
                this._camera.updateProjectionMatrix();
                this._scene.fog.density = FOG_DAY;
                this._terrain._radius = 5;
                this._terrain.setLodMode(false);
            } else if (mode === 'fpdrive') {
                // First-person driving: eye pinned at the driver's seat, looking
                // forward through the windshield. The rig rides inside the van
                // (local space) and the WASD keys drive instead of walking.
                this._attachRigToVan();
                this._fpc.bounds = this._walkBounds();
                this._setBridgeVisible(this._hasBridge());
                const rig = this._fpc.getRig();
                const seat = this._pilotSeat();
                rig.position.set(seat.x, seat.y, seat.z);
                this._fpc.yaw.rotation.y   = Math.PI; // face the vehicle's forward (+Z)
                this._fpc.pitch.rotation.x = 0;
                this._fpc.setDriving(true);
                this._scene.remove(this._camera);
                this._camera.position.set(0, 0, 0);
                this._camera.rotation.set(0, 0, 0);
                this._fpc.pitch.add(this._camera);
                this._fpc.deactivated = false;
                this._camera.far = VIEW_FAR;
                this._camera.fov = this._baseFov;
                this._camera.updateProjectionMatrix();
                this._scene.fog.density = FOG_DAY;
                this._terrain._radius = 5;
                this._terrain.setLodMode(false);
            } else if (mode === 'foot') {
                this._setBridgeVisible(false);
                this._enterOnFoot();
                this._scene.remove(this._camera);
                this._camera.position.set(0, 0, 0);
                this._camera.rotation.set(0, 0, 0);
                this._fpc.pitch.add(this._camera);
                this._fpc.deactivated = false;
                this._camera.far = VIEW_FAR;
                this._camera.fov = this._baseFov;
                this._camera.updateProjectionMatrix();
                this._scene.fog.density = FOG_DAY;
                this._terrain._radius = 5;
                this._terrain.setLodMode(false);
            } else if (mode === 'car') {
                // Seen from outside now: the room would read as a box hanging
                // through the hull.
                this._setBridgeVisible(false);
                this._freeCamYaw   = 0;
                this._freeCamPitch = 0.34;
                // Keep the camera world-up so lookAt never rolls the view (the
                // chase cam could otherwise spawn upside down).
                this._camera.up.set(0, 1, 0);
                const _yaw  = this._van.group.rotation.y + Math.PI;
                const _dist = 42;
                this._camera.position.set(
                    this._vanX + _dist * Math.cos(0.34) * Math.sin(_yaw),
                    this._vanY + _dist * Math.sin(0.34),
                    this._vanZ + _dist * Math.cos(0.34) * Math.cos(_yaw)
                );
                this._camera.lookAt(this._vanX, this._vanY + 4, this._vanZ);
                this._camera.far = VIEW_FAR;
                this._camera.updateProjectionMatrix();
                this._scene.fog.density = FOG_DAY;
                this._terrain._radius = 5;
                this._terrain.setLodMode(false);
            } else if (mode === 'free') {
                this._freePivot.set(this._vanX, 0, this._vanZ);
                this._freeCamYaw   = 0;
                this._freeCamPitch = 0.8;
                this._camera.fov = this._baseFov;
                this._camera.position.set(this._vanX, 400, this._vanZ + 400);
                this._camera.lookAt(this._vanX, 0, this._vanZ);
                this._scene.fog.density = FOG_FREE;
            }

            this._hud.updateModeLabel(mode);
        }

        // Which way the camera is looking, in world space: every sprite card in
        // the scene turns to match it.
        _cameraYaw() {
            if (!this._tmpQ) { this._tmpQ = new THREE.Quaternion(); this._tmpE = new THREE.Euler(); }
            return this._tmpE.setFromQuaternion(
                this._camera.getWorldQuaternion(this._tmpQ), 'YXZ').y;
        }

        // The surface of whatever water stands over a point, or null where the
        // ground there is dry. The terrain owns that answer (VoxelTerrain's
        // waterSurfaceAt), so the party and the creatures that live in the water
        // are never swimming in two different seas.
        _waterSurfaceAt(x, z, y) {
            if (!this._terrain) return null;
            // Nothing underground is flooded. The sea is one sheet laid over the
            // world at its own level, and a passage cut forty voxels under a
            // field passes below that level everywhere: read the sheet down
            // there and every cave in the world would be full of water. Rock
            // over your head means no sky, and no sky means no sea.
            if (y != null && this._terrain.isUnderground(x, z, y)) return null;
            return this._terrain.waterSurfaceAt(x, z);
        }

        // Which element the party is actually in, on foot. This is what the sky,
        // the fog, the lantern, the bubbles and the HUD's element chip all read,
        // so a dive really does go dark and green and a flight really does read
        // as one.
        _footEnv() {
            const f = this._fpc;
            if (!f) return 'road';
            if (f.submerged) return 'underwater';
            if (f.swimming)  return 'water';
            // Underground beats flying: a bat is still in a cave.
            if (this._underground) return 'cave';
            if (f.flying)    return 'air';
            return 'road';
        }

        // In or out of the water. A fall straight into it is a splash; wading in
        // off a beach is not.
        _onSwimChange(inWater, splash) {
            if (typeof AudioManager === 'undefined') return;
            AudioManager.playSe({
                name: STEP_SOUNDS.dirt[inWater ? 0 : 2], pan: 0,
                pitch: inWater ? (splash ? 70 : 90) : 120,
                volume: splash ? 45 : 22
            });
        }

        // The height a person stands at: the ground, plus the pavement wherever
        // that ground is a town square (a town is built on a level pad of its
        // own, see _decorateSettlement).
        _groundUnderfoot(x, z, feetY) {
            // Indoors, the ground is whichever floor you are standing on - the
            // slab, or the flight of stairs between two of them.
            if (this._interiors && feetY != null) {
                const floor = this._interiors.floorAt(x, z, feetY);
                if (floor != null) return floor;
            }
            // Underground the surface is the ROOF, not the floor: what holds a
            // walker up down there is the top of the first solid cube under
            // them, which is the floor of whichever passage they are in.
            //
            // Asked BEFORE the town pad below, because a town has a sewer under
            // it now: asking the pad first would hold a walker in the galleries
            // at street level and there would be no standing in one.
            if (feetY != null && this._terrain.isUnderground(x, z, feetY)) {
                return this._terrain.supportY(x, z, feetY);
            }
            const ts = WORLD_TILE_SIZE;
            const tx = Math.floor(x / ts), tz = Math.floor(z / ts);
            const kind = settlementKindAt(tx, tz);
            // A town is built on a level pad of its own (see _decorateSettlement),
            // and a city's pad wears a pavement on top of it.
            if (kind) {
                return this._terrain.getTerrainHeight(tx + 0.5, tz + 0.5) +
                    (kind === 'city' ? SETTLE.paveH : 0);
            }
            return this._terrain.getTerrainHeight(x / ts, z / ts);
        }

        // The floor above, so a jump indoors stops at the ceiling - and so a
        // jump in a passage stops at the rock instead of going through it.
        _ceilingOverhead(x, z, feetY) {
            const inside = this._interiors ? this._interiors.ceilAt(x, z, feetY) : null;
            if (inside != null) return inside;
            if (feetY == null || !this._terrain.isUnderground(x, z, feetY)) return null;
            return this._terrain.roofY(x, z, feetY);
        }

        // Re-parent the first-person rig back inside the camper (local space).
        _attachRigToVan() {
            const rig = this._fpc.getRig();
            if (rig.parent !== this._van.group) {
                if (rig.parent) rig.parent.remove(rig);
                this._van.group.add(rig);
            }
            rig.position.set(0, 6, 0);
        }

        // Step out of the camper onto the world: park the rig, detach it into world
        // space beside the door, tether it to the parked camper, and open the door.
        _enterOnFoot() {
            // Park: kill all camper motion and any pending fast travel.
            this._speedKmh = 0;
            this._speedUnitsSigned = 0;
            this._steerSmooth = 0;
            this._velX = 0; this._velZ = 0;
            this._fwdSpeed = 0; this._latSpeed = 0;
            const d = (typeof $gameSystem !== 'undefined' && $gameSystem.getFastTravelData)
                ? $gameSystem.getFastTravelData() : null;
            if (d) d.timerActive = false;

            // Spawn just off the camper's side, on the ground. On a free walk
            // there is no camper to step out of, so the walker simply starts on
            // the square the party is standing on.
            const ry  = this._van.group.rotation.y;
            const off = this._footOnly ? 0 : 30;
            const sx  = this._vanX + Math.cos(ry) * off;
            const sz  = this._vanZ - Math.sin(ry) * off;
            const groundFn = (x, z, feetY) => this._groundUnderfoot(x, z, feetY);
            const sy = groundFn(sx, sz) + FOOT_EYE;

            const rig = this._fpc.getRig();
            if (rig.parent !== this._scene) {
                if (rig.parent) rig.parent.remove(rig);
                this._scene.add(rig);
            }
            rig.position.set(sx, sy, sz);
            // A free walk passes no anchor: with no camper in the world there is
            // no solid chassis to be pushed out of.
            this._fpc.setWorldMode(true, this._footOnly ? null
                : { x: this._vanX, z: this._vanZ, angle: this._van.group.rotation.y }, groundFn);
            // Walls to bump into, and the sound of your own feet.
            this._fpc.solidAt = (x, z, r) => this._resolveSolids(x, z, r);
            // The cubes are walls in their own right, not just a floor.
            this._fpc.voxelSolid = (vx, vy, vz) => this._terrain.field.isSolid(vx, vy, vz);
            this._fpc.voxelSize  = VOX.SIZE;
            this._fpc.getCeilY = (x, z, feetY) => this._ceilingOverhead(x, z, feetY);
            // Water to swim in, and wings for whoever leads a party that has
            // them: both are the world's answer, asked for once a frame.
            this._fpc.getWaterY = (x, z, y) => this._waterSurfaceAt(x, z, y);
            this._fpc.canFly = () => leaderCanFly();
            this._fpc.onSwim = (inWater, splash) => this._onSwimChange(inWater, splash);
            this._fpc.onStep  = (sprint) => this._footstep(sprint);
            // A jump and a landing are footsteps too, and they are in the
            // voice of whatever is under the foot: a landing on gravel rattles,
            // a landing in the mud does not.
            this._fpc.onJump  = (wall) => {
                if (typeof AudioManager === 'undefined') return;
                const p = this._fpc.getRig().position;
                const mat = this._stepMaterialAt(p.x, p.z, p.y);
                const F = window.Footsteps;
                if (F && F.play && F.play(mat, { volume: wall ? 90 : 70 })) return;
                AudioManager.playSe({
                    name: STEP_SOUNDS.dirt[1], pan: 0,
                    pitch: wall ? 128 : 112, volume: 20
                });
            };
            this._fpc.onLand  = (hard) => {
                this._fpc.landDip = hard * 0.9;
                if (hard <= 0.35 || typeof AudioManager === 'undefined') return;
                const p = this._fpc.getRig().position;
                const mat = this._stepMaterialAt(p.x, p.z, p.y);
                const F = window.Footsteps;
                if (F && F.play && F.play(mat, { volume: 80 + hard * 60 })) return;
                AudioManager.playSe({ name: STEP_SOUNDS.dirt[0], pan: 0, pitch: 70, volume: 22 + hard * 22 });
            };
            if (this._footOnly) {
                // Start the walk looking the way the square itself runs (the road,
                // or the heading the drive would have taken), not due south. The
                // camera looks down its own -Z, hence the half turn.
                this._fpc.yaw.rotation.y   = this._driveAngle + Math.PI;
                this._fpc.pitch.rotation.x = 0;
                return;
            }

            // Open the door for the dismount; proximity (_updateDoorAutoOpen) takes
            // over on the very next frame and keeps it open while standing near it.
            if (this._van.setDoorOpen) this._van.setDoorOpen(true);
        }

        // Swing the rear door open whenever the player (on foot outside, or
        // walking the cabin toward it) is close enough, and shut otherwise. Runs
        // every frame in first-person cabin/foot modes, so there is no explicit
        // "open" or "close" command left for the player to press.
        _updateDoorAutoOpen() {
            if (this._footOnly) return;   // no camper, no door
            if (this._viewMode !== 'fp' && this._viewMode !== 'foot') return;
            if (!this._van.getDoorWorldPosition) return;
            const doorPos = this._van.getDoorWorldPosition(this._tmpDoorPos || (this._tmpDoorPos = new THREE.Vector3()));
            if (!doorPos) return;
            const rig = this._fpc.getRig();
            const p = this._tmpRigPos || (this._tmpRigPos = new THREE.Vector3());
            rig.getWorldPosition(p);
            const dx = p.x - doorPos.x, dy = p.y - doorPos.y, dz = p.z - doorPos.z;
            const near = (dx * dx + dy * dy + dz * dz) <= DOOR_AUTO_OPEN_RANGE * DOOR_AUTO_OPEN_RANGE;
            this._van.setDoorOpen(near);
        }

        _cycleViewMode() {
            // Tab toggles between first-person driving (eye at the wheel) and the
            // third-person chase camera only. The free-roam cabin walk and the
            // detached free camera are reached other ways (E / interact, door),
            // not by cycling. Changing mode while on foot always climbs back
            // into the cabin. A free walk has nowhere else to be: the walk IS
            // the mode, so TAB / Y do nothing there.
            if (this._footOnly) return;
            if (this._viewMode === 'foot') { this._setMode('fp'); return; }
            const order = ['fpdrive', 'car'];
            const cur = order.indexOf(this._viewMode);
            const idx = cur < 0 ? 0 : (cur + 1) % order.length;
            this._setMode(order[idx]);
        }

        // Toggle player-controlled flight. Needs the 'fly' upgrade; switches
        // straight to the chase camera so you can see the lift rotors deploy.
        _toggleFlight() {
            if (this._viewMode === 'foot') { if (typeof SoundManager !== 'undefined') SoundManager.playBuzzer(); return; }
            if (!this._canFly()) { if (typeof SoundManager !== 'undefined') SoundManager.playBuzzer(); return; }
            this._flying = !this._flying;
            if (this._flying) { this._dived = false; if (this._viewMode === 'fp') this._setMode('car'); }
            if (typeof SoundManager !== 'undefined') SoundManager.playOk();
        }

        // Toggle diving. Only meaningful while over a water basin; needs 'dive'.
        _toggleDive() {
            if (this._viewMode === 'foot') return;   // on foot C crouches instead
            if (!camperCan('dive')) { if (typeof SoundManager !== 'undefined') SoundManager.playBuzzer(); return; }
            if (!this._overWater()) { if (typeof SoundManager !== 'undefined') SoundManager.playBuzzer(); return; }
            this._dived = !this._dived;
            if (this._dived) { this._flying = false; if (this._viewMode === 'fp') this._setMode('car'); }
            if (typeof SoundManager !== 'undefined') SoundManager.playOk();
        }

        // First-person interaction (E / gamepad). On foot, walk up to the camper
        // and interact to climb back in. In the cabin, interacting with a door
        // steps you outside; the wheel/driver seat grabs the wheel; other seats sit.
        // At the wheel (third-person 'car' or seated 'fpdrive'), E gets you away
        // from driving without going through the options menu: third-person
        // steps straight out onto the ground, first-person just lets go of the
        // wheel and leaves you standing in the cabin so you can walk to the door.
        _interact() {
            this._teachControl('voxInteract');
            // At the wheel, E means one thing and one thing only: get out. The
            // scenery, the chests and the people in front of the bonnet are all
            // things to walk up to, and none of them may swallow the key that
            // ends a drive.
            if (this._viewMode === 'car' || this._viewMode === 'fpdrive') {
                if (typeof SoundManager !== 'undefined') SoundManager.playOk();
                this._setMode(this._viewMode === 'car' ? 'foot' : 'fp');
                return;
            }
            // A body at your feet, then somebody standing right there, then the
            // camper: whichever is actually in front of the party.
            if (this._lootBody()) return;
            if (this._talkToShopkeeper()) return;
            if (this._talkToCitizen()) return;
            // A chest beats the scenery: it is a chest, not a crate to break up.
            if (this._openChest()) return;
            // The water in front of them, with a rod in the pack.
            if (this._startFishing()) return;
            // ...and then whatever is growing or lying in front of them: a tree
            // to fell, a boulder to break, a bush to pick over.
            if (this._workScenery()) return;
            // Anything the party owns and left standing here is boardable: walk
            // up to the car and press E to drive it away, exactly as with the
            // vehicle they arrived in. This is the only route in for a walk that
            // started with no vehicle at all.
            if (this._boardParked()) return;
            if (this._footOnly) return;   // nothing else out here to interact with
            // On foot: climb back into the camper when close enough.
            if (this._viewMode === 'foot') {
                const rig = this._fpc.getRig();
                const dx = rig.position.x - this._vanX;
                const dz = rig.position.z - this._vanZ;
                if ((dx * dx + dz * dz) <= 60 * 60) {
                    if (typeof SoundManager !== 'undefined') SoundManager.playOk();
                    this._setMode('fp');
                } else if (typeof SoundManager !== 'undefined') {
                    SoundManager.playBuzzer();
                }
                return;
            }

            // Third-person chase camera: step straight out of the camper.
            if (this._viewMode === 'car') {
                if (typeof SoundManager !== 'undefined') SoundManager.playOk();
                this._setMode('foot');
                return;
            }

            // Seated first-person driving: let go of the wheel and stand up in
            // the cabin (still parked at the driver's seat), rather than
            // stepping outside directly.
            if (this._viewMode === 'fpdrive') {
                if (typeof SoundManager !== 'undefined') SoundManager.playOk();
                this._setMode('fp');
                return;
            }

            if (this._viewMode !== 'fp' || !this._van.getInteractables) return;
            const rig = this._fpc.getRig();
            const here = rig.position;
            let best = null, bestD = 30 * 30; // within ~30 units
            for (const it of this._van.getInteractables()) {
                const dx = it.pos.x - here.x, dz = it.pos.z - here.z;
                const d = dx * dx + dz * dz;
                if (d < bestD) { best = it; bestD = d; }
            }
            if (!best) return;
            if (typeof SoundManager !== 'undefined') SoundManager.playOk();
            if (best.kind === 'door') {
                this._setMode('foot');        // step out through the door
            } else if (best.kind === 'wheel' || (best.kind === 'seat' && best.name === 'Driver')) {  // i18n-ignore  seat id
                this._setMode('car');         // take the wheel
            } else if (best.kind === 'seat') {
                rig.position.set(best.pos.x, best.pos.y, best.pos.z); // sit
            }
        }

        // Is a vehicle of the party's own standing within reach, and is it one
        // they are not already driving? Returns true once it has put them in it.
        _boardParked() {
            if (this._titleMode || this._standalone) return false;
            if (this._viewMode !== 'foot') return false;
            if (!this._parked || !this._parked.nearest) return false;
            const here = this._fpc.getRig().position;
            const hit = this._parked.nearest(here.x, here.z, BOARD_REACH);
            if (!hit || hit.key === this._vehicleId) return false;
            this._mountVehicle(hit.key, hit.x, hit.z);
            return true;
        }

        // Change what the party is driving without leaving the world. The one
        // they step out of stays on the square they left it on (the park record
        // is written from _vanX/_vanZ every frame), the new one is picked up
        // where it stood, and the readout is rebuilt because a walk's HUD and a
        // drive's are not the same panels.
        _mountVehicle(key, x, z) {
            if (typeof SoundManager !== 'undefined') SoundManager.playOk();
            const wasWalk = this._footOnly;
            this._footOnly = false;
            this._vehicleId = key;
            this._drive = VEHICLE_DRIVE[key] || VEHICLE_DRIVE.camper;

            // The old body goes; _buildDrivenModel puts the new one up.
            if (this._drivenModel) { this._drivenModel.dispose(); this._drivenModel = null; }
            if (this._bridge) { this._bridge.dispose(); this._bridge = null; }
            if (this._driven2d) {
                this._scene.remove(this._driven2d.mesh);
                this._driven2d.dispose();
                this._driven2d = null;
            }
            if (this._van && this._van.setVisible) this._van.setVisible(true);
            this._buildDrivenModel();

            // Stand it where it was parked, motionless.
            this._vanX = x; this._vanZ = z;
            this._velX = 0; this._velZ = 0;
            this._fwdSpeed = 0; this._latSpeed = 0;
            this._speedKmh = 0; this._speedUnitsSigned = 0; this._steerSmooth = 0;
            this._flying = false; this._dived = false;
            this._terrain.update(this._vanX, this._vanZ, true);
            this._vanY = this._resolveEnv();
            this._van.group.position.set(this._vanX, this._vanY, this._vanZ);
            if (this._parked) this._parked.setDriving(key);

            // A walk has no fuel gauge, no speedo and no trip meter in it, so
            // the whole readout is built again in the register of a drive.
            if (wasWalk && this._hud) {
                this._hud.dispose();
                this._hud = new CamperHUD(this._overlay, this._destination,
                    this._totalKm, false, false);
                if (this._hud.setPlanet) this._hud.setPlanet(this._sky);
                if (this._hud.onBlockPick && this._tool) {
                    this._hud.onBlockPick((i) => this._selectBarSlot(i));
                }
            }
            this._setMode('car');
        }

        // ---------------------------------------------------------------------
        // The chests
        // ---------------------------------------------------------------------
        // The same three the 2D procedural maps carry, standing out here as
        // billboards (VoxelWorldDecor's _scatterChests) and paying out of the
        // same RandomLootSystem: one item, one piece of armour or one weapon,
        // rolled at the party's own level with the map's rarity bonus applied.
        //
        // An emptied chest is remembered by the WORLD rather than by the save,
        // the same way a felled tree is: come back in another savegame of the
        // same world and it is still open.
        _chestUnderfoot() {
            if (this._viewMode !== 'foot' && this._viewMode !== 'fp') return null;
            if (!this._terrain || !this._terrain.nearestProp) return null;
            const p = this._contactPoint();
            return this._terrain.nearestProp(p.x, p.z, CHEST_REACH,
                rec => rec.kind === 'chest');
        }

        _openChest() {
            const hit = this._chestUnderfoot();
            if (!hit) return false;
            if (this.isPaused()) return false;
            const Decor = window.VoxelWorld || {};
            const chest = Decor.chestKindOf ? Decor.chestKindOf(hit.rec) : null;
            if (!chest) return false;
            // Taken off the world first, so a second press cannot open the same
            // chest twice while the loot toast is still going up.
            this._terrain.fellProp(hit);
            if (typeof SoundManager !== 'undefined') SoundManager.playOk();
            // Cave and ruin loot is worth the walk, exactly as it is on the 2D
            // map: RandomLootSystem reads this off $gameSystem when it rolls.
            if (typeof $gameSystem !== 'undefined') {
                $gameSystem._lootRarityBonus = this._underground ? 55 : 25;
            }
            try {
                if (typeof PluginManager !== 'undefined' && PluginManager.callCommand) {
                    PluginManager.callCommand(null, 'RandomLootSystem', chest.cmd, {});
                }
            } catch (e) { /* a chest that cannot pay out is still an open chest */ }
            return true;
        }

        // ---------------------------------------------------------------------
        // Fishing
        // ---------------------------------------------------------------------
        // Standing at the water's edge with a rod in the pack, the action key
        // casts. The gear that counts and the minigame that follows are both
        // MovementInteractionSystem's - the same rod, the same 3D minigame and
        // the same catch table the 2D map uses - so nothing about fishing is
        // written down twice.
        _hasFishingRod() {
            const M = window.MovementSystem;
            return !!(M && M.hasFishingRod && M.hasFishingRod());
        }

        // The water a walker is facing, within reach, or null. Sampled a little
        // way along their own heading rather than under their feet: fishing is
        // something you do at the edge of the water, not in it.
        _waterInFront() {
            if (this._viewMode !== 'foot' || !this._fpc || !this._terrain) return null;
            const rig = this._fpc.getRig();
            const yaw = this._fpc.yaw ? this._fpc.yaw.rotation.y : 0;
            const dx = -Math.sin(yaw), dz = -Math.cos(yaw);
            for (let d = FISH_REACH_MIN; d <= FISH_REACH; d += 6) {
                const x = rig.position.x + dx * d, z = rig.position.z + dz * d;
                if (this._terrain.waterDepthAt(x, z) >= FISH_MIN_DEPTH) {
                    return { x, z, kind: this._terrain.waterKindAt(x, z) };
                }
            }
            return null;
        }

        // True when the action key should be offered as "cast": on foot, facing
        // open water, carrying the gear, and not already under it.
        _canFishHere() {
            if (this._env === 'underwater' || this._underground) return false;
            if (!this._hasFishingRod()) return false;
            return !!this._waterInFront();
        }

        _startFishing() {
            if (!this._canFishHere()) return false;
            if (this.isPaused()) return false;
            if (typeof window.Scene_FishingMinigame === 'undefined' || !window.Scene_FishingMinigame) return false;
            if (!(SceneManager._scene instanceof Scene_Map)) return false;
            if (typeof SoundManager !== 'undefined') SoundManager.playOk();
            // The minigame is a scene of its own, so the world is suspended
            // exactly the way it is for the party menu and comes back when the
            // scene pops.
            this._suspended = true;
            if (this._overlay) this._overlay.style.display = 'none';
            releasePointerLock();
            window._fishingMinigameResult = null;
            SceneManager.push(window.Scene_FishingMinigame);
            return true;
        }

        // ---------------------------------------------------------------------
        // Taking the scenery apart
        // ---------------------------------------------------------------------
        // A tree out here is the same tree the 2D world has, and it comes down
        // the same way: the axe, the skill check, the wood and the plant matter,
        // the lesson in Lumberjacking, all of it out of the ONE table
        // (ProceduralTerrainInteractions). Nothing about what a tree is worth is
        // written down twice, so a boulder pays the same ore in the 3D world as
        // it does on the map, and a folder of art added tomorrow is salvageable
        // the day it arrives.
        //
        // What has to be worked out here is only the NAME: the billboard knows
        // which folder and which sprite it came from, and the table is keyed by
        // the map's own feature names.
        _workScenery() {
            if (this._viewMode !== 'foot' && this._viewMode !== 'fp') return false;
            const TI = window.TerrainInteractions;
            if (!TI || !TI.interactWithFeature || !this._terrain || !this._terrain.nearestProp) return false;
            if (this.isPaused()) return false;
            const rig = this._fpc.getRig();
            // A chest is opened, not taken apart: it is _openChest's, and it
            // must not fall through to the salvage table when that one has
            // declined it (a window already up, say).
            const hit = this._terrain.nearestProp(rig.position.x, rig.position.z, SCENERY_REACH,
                rec => rec.kind !== 'chest');
            if (!hit) return false;
            if (typeof $gameMessage === 'undefined' || $gameMessage.isBusy()) return false;
            const name = featureNameFor(hit.rec);
            // The game's own windows draw on the map canvas, so the world is
            // hidden behind them and the walk stands still, exactly as it does
            // for a shopkeeper.
            this._menuOpen = true;
            if (this._overlay) this._overlay.style.display = 'none';
            releasePointerLock();
            const opened = TI.interactWithFeature(name, () => {
                this._terrain.fellProp(hit);
            });
            if (!opened) {
                this._menuOpen = false;
                if (this._overlay) this._overlay.style.display = '';
                return false;
            }
            if (typeof SoundManager !== 'undefined') SoundManager.playOk();
            // The work is done a beat AFTER the choice window closes (the table
            // defers it, so a follow-up line is not lost under a closing
            // window), so the world is not brought back the instant the choice
            // is answered: it waits out the gap as well.
            this._msgWatch = true;
            this._msgGrace = MSG_GRACE_FRAMES;
            return true;
        }

        // The nearest townsperson within arm's reach, if the party is on foot
        // and there is one. Returns true when the conversation has been opened.
        // ---------------------------------------------------------------------
        // The shops
        // ---------------------------------------------------------------------
        // A shop is a room with a blue roof over it and somebody standing in it.
        // Walking up to them and pressing the action key asks what you want:
        // their stock, which is one of RandomDailyShop's sixty-one themed shops
        // and always the SAME one for that shopkeeper, or a word with them.
        _talkToShopkeeper() {
            if (!this._interiors || this._viewMode !== 'foot') return false;
            if (this.isPaused()) return false;
            const rig = this._fpc.getRig().position;
            const keeper = this._interiors.nearestKeeper(
                rig.x, rig.y - (this._fpc.eyeH || FOOT_EYE), rig.z, TALK_RANGE);
            if (!keeper) return false;
            this._openShopMenu(keeper);
            return true;
        }

        _openShopMenu(keeper) {
            if (typeof $gameMessage === 'undefined' || $gameMessage.isBusy()) return;
            this._menuOpen = true;
            if (this._overlay) this._overlay.style.display = 'none';
            releasePointerLock();
            if (typeof SoundManager !== 'undefined') SoundManager.playOk();

            const label = shopTypeLabel(keeper.shopType);
            const choices = [
                T('CamperDrive.shop.browse'),
                T('CamperDrive.npc.talk'),
                T('CamperDrive.npc.leave')
            ];
            if ($gameMessage.setSpeakerName) $gameMessage.setSpeakerName(keeper.name);
            $gameMessage.add(T('CamperDrive.shop.greeting', { name: keeper.name, shop: label }));
            $gameMessage.setChoices(choices, 0, 2);
            $gameMessage.setChoiceCallback((idx) => {
                if (idx === 0)      this._pendingShop = keeper;
                else if (idx === 1) this._pendingSay = keeper;
                else {
                    this._menuOpen = false;
                    if (this._overlay) this._overlay.style.display = '';
                }
            });
        }

        // Opening the stock pushes a scene of its own, so the world waits it out
        // exactly as it waits out the party menu: _loop puts everything back the
        // moment the map returns.
        _openShopStock(keeper) {
            this._menuOpen = false;
            const open = window.openRandomThemedShop;
            if (!open || !keeper.shopType) {
                if (this._overlay) this._overlay.style.display = '';
                return;
            }
            this._suspended = true;
            open(keeper.shopType);
            // A shop that refused to open (no stock, no scene) must not leave
            // the world frozen behind nothing.
            if (!(SceneManager.isSceneChanging() || !(SceneManager._scene instanceof Scene_Map))) {
                this._suspended = false;
                if (this._overlay) this._overlay.style.display = '';
            }
        }

        _talkToCitizen() {
            if (!this._crowd || this._viewMode !== 'foot') return false;
            if (this.isPaused()) return false;
            // The conversation is the game's own message box, so there has to be
            // one: asked for on a frame where the map scene is being rebuilt, the
            // question would go up with nothing able to answer or close it.
            if (!(SceneManager._scene instanceof Scene_Map)) return false;
            if (!SceneManager._scene._messageWindow) return false;
            const rig = this._fpc.getRig().position;
            const ped = this._crowd.nearest(rig.x, rig.z, TALK_RANGE);
            if (!ped) return false;
            this._openCitizenMenu(ped);
            return true;
        }

        // Talk / Empathize / leave them be. The 3D overlay sits above the game
        // canvas, so it is hidden for as long as the game's own windows are up
        // (the same dance _openDriveMenu does), and the scene is frozen behind
        // them. Both answers are deferred to _loop rather than fired from inside
        // the choice callback: the choice window is still closing at that point,
        // and a message (or a scene push) started under it is lost.
        _openCitizenMenu(ped) {
            if (typeof $gameMessage === 'undefined' || $gameMessage.isBusy()) return;
            this._menuOpen = true;
            if (this._overlay) this._overlay.style.display = 'none';
            releasePointerLock();
            if (typeof SoundManager !== 'undefined') SoundManager.playOk();

            const choices = [
                T('CamperDrive.npc.talk'),
                T('CamperDrive.npc.empathize'),
                T('CamperDrive.npc.leave')
            ];
            if ($gameMessage.setSpeakerName) $gameMessage.setSpeakerName(ped.name);
            $gameMessage.add(T('CamperDrive.npc.approach', { name: ped.name }));
            $gameMessage.setChoices(choices, 0, 2);
            $gameMessage.setChoiceCallback((idx) => {
                try {
                    if (idx === 0)      this._pendingSay = ped;
                    else if (idx === 1) this._pendingEmpathize = ped;
                    else {
                        this._menuOpen = false;
                        if (this._overlay) this._overlay.style.display = '';
                    }
                } catch (e) {
                    // Whatever went wrong with the answer, the world is handed
                    // back rather than left frozen behind a closed box.
                    console.error('[VoxelWorld] citizen menu', e);
                    this._pendingSay = null;
                    this._pendingEmpathize = null;
                    this._menuOpen = false;
                    if (this._overlay) this._overlay.style.display = '';
                }
            });
        }

        // What this person has to say: their own thought, in their own voice,
        // out of the same conversation bank the 2D world speaks from.
        _citizenLine(ped) {
            const profile = CityCrowd.ensureProfile(ped);
            const conv = window.NPCConversation;
            let line = null;
            if (profile && conv && conv.ThoughtProvider) {
                try { line = conv.ThoughtProvider.pickThought(profile); } catch (e) { line = null; }
            }
            return line || T('CamperDrive.npc.nothingToSay');
        }

        _updateCarCamera(delta) {
            // Orbit around van using same spherical state as free cam (mid-click drag to rotate)
            // Scroll wheel / right stick adjust _zoomDist for a wide zoom range while driving.
            const dist = Math.max(22, 42 + this._zoomDist * 0.05);
            const cy   = this._vanY + Math.max(5, dist * Math.sin(this._freeCamPitch));
            const gr   = dist * Math.cos(this._freeCamPitch);
            const yaw  = this._van.group.rotation.y + Math.PI + this._freeCamYaw;
            const tx   = this._vanX + gr * Math.sin(yaw);
            const tz   = this._vanZ + gr * Math.cos(yaw);

            this._camera.position.x += (tx - this._camera.position.x) * 6 * delta;
            this._camera.position.y += (cy - this._camera.position.y) * 6 * delta;
            this._camera.position.z += (tz - this._camera.position.z) * 6 * delta;

            // Sense of speed: widen FOV and shake the camera as you go faster.
            const targetFov = this._baseFov + Math.min(28, this._speedKmh * 0.012);
            this._camera.fov += (targetFov - this._camera.fov) * Math.min(1, delta * 4);
            let shake = Math.max(0, this._speedKmh - 480) * 0.0007;
            if (this._crashTimer > 0) shake += this._crashTimer * 0.5;   // collision rattle
            if (this._solomonShake > 0) shake += this._solomonShake * 0.8;
            if (shake > 0) {
                this._camera.position.x += (Math.random() - 0.5) * shake * 10;
                this._camera.position.y += (Math.random() - 0.5) * shake * 10;
            }
            this._camera.updateProjectionMatrix();
            this._camera.up.set(0, 1, 0);
            this._camera.lookAt(this._vanX, this._vanY + 4, this._vanZ);

            this._terrain.update(this._vanX, this._vanZ);
        }

        // Legacy thin wrappers kept for any external callers
        _enterFreeCam() { this._setMode('free'); }
        _exitFreeCam()  { this._setMode('fp');   }

        _updateFreeCam(delta) {
            const fast      = this._freeMoveKeys.has('ShiftLeft') || this._freeMoveKeys.has('ShiftRight');
            const baseSpeed = 300 + this._zoomDist * 0.35;
            const speed     = fast ? baseSpeed * 5 : baseSpeed;

            // 1. Calculate raw input direction (WASD, arrows, or controller)
            let moveX = 0;
            let moveZ = 0;
            if (this._freeMoveKeys.has('KeyW') || Input.isPressed('up'))    moveZ -= 1;
            if (this._freeMoveKeys.has('KeyS') || Input.isPressed('down'))  moveZ += 1;
            if (this._freeMoveKeys.has('KeyA') || Input.isPressed('left'))  moveX -= 1;
            if (this._freeMoveKeys.has('KeyD') || Input.isPressed('right')) moveX += 1;

            // 2. Rotate movement vector by current camera yaw
            if (moveX !== 0 || moveZ !== 0) {
                const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
                moveX /= len;
                moveZ /= len;

                const cos = Math.cos(this._freeCamYaw);
                const sin = Math.sin(this._freeCamYaw);

                const worldX = moveX * cos + moveZ * sin;
                const worldZ = -moveX * sin + moveZ * cos;

                this._freePivot.x += worldX * speed * delta;
                this._freePivot.z += worldZ * speed * delta;
            }

            // 3. Position camera using spherical coordinates around the pivot
            const radius = Math.max(100, this._zoomDist);
            const cy = radius * Math.sin(this._freeCamPitch);
            const groundDist = radius * Math.cos(this._freeCamPitch);
            const cx = groundDist * Math.sin(this._freeCamYaw);
            const cz = groundDist * Math.cos(this._freeCamYaw);

            this._camera.position.set(
                this._freePivot.x + cx,
                cy,
                this._freePivot.z + cz
            );
            this._camera.lookAt(this._freePivot.x, 0, this._freePivot.z);

            const newFar = Math.max(VIEW_FAR, this._zoomDist * 3);
            if (Math.abs(this._camera.far - newFar) > 100) {
                this._camera.far = newFar;
                this._camera.updateProjectionMatrix();
            }
            this._scene.fog.density = FOG_FREE;

            const visRadius = Math.ceil(this._zoomDist * 0.82 * 0.637 / WORLD_TILE_SIZE) + 3;
            this._terrain._radius = Math.min(60, visRadius);
            this._terrain.setLodMode(this._terrain._radius > 10);
            // Fill the overview over several frames (budgeted) instead of building
            // the whole visible radius every frame, which froze the free cam.
            this._terrain.update(this._freePivot.x, this._freePivot.z, false);
        }

        // True when the camper's current tile is a water basin.
        _overWater() {
            const tx = Math.floor(this._vanX / WORLD_TILE_SIZE);
            const ty = Math.floor(this._vanZ / WORLD_TILE_SIZE);
            return getRenderType(sampleBiomeAt(tx, ty).name) === 'water';
        }

        // True when the camper is (near-)stopped on a city / village tile, which
        // carry a fuel station (see ProceduralDecorator._decorateGasStation). The
        // drive options menu offers a refuel here.
        _atGasStation() {
            if (this._speedKmh > 6 || this._env !== 'road') return false;
            const tx = Math.floor(this._vanX / WORLD_TILE_SIZE);
            const ty = Math.floor(this._vanZ / WORLD_TILE_SIZE);
            const n  = sampleBiomeAt(tx, ty).name.toLowerCase();
            return /city|metro|village|villa|burg|town|houses/.test(n);
        }

        // Average condition (0-100) of the camper's parts from the repair plugin's
        // per-part health store, or null when that plugin is absent (HUD hides the
        // readout). Critical parts weigh double so engine/brake damage reads worse.
        _camperCondition() {
            const store = (typeof $gameSystem !== 'undefined') ? $gameSystem._vehicleHealth : null;
            const parts = store && store.camper;
            if (!parts) return null;
            let sum = 0, n = 0;
            for (const k in parts) {
                const w = CRITICAL_PARTS.indexOf(k) >= 0 ? 2 : 1;
                sum += parts[k] * w; n += w;
            }
            return n ? sum / n : null;
        }

        // ---- Title-screen free look ----------------------------------------
        // Dragging (or the right stick) looks around the cab while the autopilot
        // drives. The view eases back to the road once the player lets go. The
        // seated first-person rig is otherwise untouched, so writing its yaw /
        // pitch here is safe.
        _bindTitleLook() {
            const L = this._titleLook = { yaw: 0, pitch: 0, dragging: false, lastX: 0, lastY: 0, lastInput: 0 };
            // The title menu and its buttons must not count as the road view, or
            // every click on a command would swing the camera.
            const onUI = (t) => !!(t && t.closest &&
                t.closest('.ts-menu-overlay, #title-bg-switch, #title-autodrive-info'));
            this._onTitleLookDown = (e) => {
                if (e.button !== undefined && e.button !== 0 && e.button !== 2) return;
                if (onUI(e.target)) return;
                L.dragging = true; L.lastX = e.clientX; L.lastY = e.clientY;
            };
            this._onTitleLookMove = (e) => {
                if (!L.dragging) return;
                const dx = e.clientX - L.lastX, dy = e.clientY - L.lastY;
                L.lastX = e.clientX; L.lastY = e.clientY;
                this._panTitleLook(-dx * 0.004, dy * 0.003);
            };
            this._onTitleLookUp = () => { L.dragging = false; };
            document.addEventListener('pointerdown',   this._onTitleLookDown);
            document.addEventListener('pointermove',   this._onTitleLookMove);
            document.addEventListener('pointerup',     this._onTitleLookUp);
            document.addEventListener('pointercancel', this._onTitleLookUp);
        }

        _panTitleLook(dyaw, dpitch) {
            const L = this._titleLook;
            if (!L || (!dyaw && !dpitch)) return;
            L.yaw   = Math.max(-1.6, Math.min(1.6, L.yaw + dyaw));
            L.pitch = Math.max(-0.6, Math.min(0.8, L.pitch + dpitch));
            L.lastInput = performance.now();
        }

        _updateTitleLook(delta) {
            const L = this._titleLook;
            if (!L) return;
            const A = window.AnalogStickInput;
            if (A && A.rightX && A.rightY) {
                const rx = A.rightX(), ry = A.rightY();
                if (rx || ry) this._panTitleLook(-rx * 0.045, ry * 0.03);
            }
            if (!L.dragging && performance.now() - L.lastInput > 4000) {
                const k = Math.min(1, delta * 1.2);
                L.yaw -= L.yaw * k;
                L.pitch -= L.pitch * k;
            }
            this._fpc.yaw.rotation.y   = Math.PI + L.yaw;
            this._fpc.pitch.rotation.x = L.pitch;
        }

        // Where the camper is and how fast it is going, for the title screen's
        // little autopilot readout. The place / road lookup is cached per tile.
        getTitleInfo() {
            const tx = Math.floor(this._vanX / WORLD_TILE_SIZE);
            const ty = Math.floor(this._vanZ / WORLD_TILE_SIZE);
            const key = tx + ',' + ty;
            let cache = this._titleInfoCache;
            if (!cache || cache.key !== key) {
                cache = this._titleInfoCache = {
                    key,
                    place: placeNameAt(tx, ty),
                    road:  roadLabelAt(tx, ty)
                };
            }
            // _driveAngle is atan2(dx, dz) and +z runs south on the world map,
            // so angle 0 points south and grows toward the east.
            const COMPASS = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'];
            const idx = ((Math.round(this._driveAngle / (Math.PI / 4)) % 8) + 8) % 8;
            return {
                place:   cache.place,
                road:    cache.road,
                heading: COMPASS[idx],
                kmh:     Math.round(this._speedKmh || 0),
                tileX:   tx,
                tileY:   ty
            };
        }

        // Decide the active environment from auto-travel / upgrades / terrain /
        // player toggles, and return the target ride height (world Y). The camper
        // follows the terrain on the ground (so it climbs the tall mountains) and
        // clears them when flying.
        _resolveEnv() {
            const terrainH = this._terrain.getTerrainHeight(this._vanX / WORLD_TILE_SIZE, this._vanZ / WORLD_TILE_SIZE);
            // The clearance the pilot is holding. A ship is flown down to the
            // ground and landed on it; everything else keeps the old cruise,
            // which is the height this starts at.
            if (this._flyAlt == null) this._flyAlt = 120 * WORLD_SCALE;
            const flyY = this._vehicleId === 'starship'
                ? terrainH + this._flyAlt
                : Math.max(170 * WORLD_SCALE, terrainH + 120 * WORLD_SCALE);

            // Auto travel (fast travel from the map window) always flies.
            if (this._isFastTravelActive()) {
                this._env = 'air';
                this._van.setEnv('air');
                return flyY;
            }

            const overWater = this._overWater();
            let env, targetY;
            if (this._flying && this._canFly()) {
                env = 'air';        targetY = flyY;
            } else if (overWater) {
                // Water crossing is always allowed WHILE in the drive mode, even
                // without the Amphibious upgrade - the penalty comes when the mode
                // ends over water (see _endDriveToWorldMap: the camper splashes down
                // if the player lacks the float upgrade). Diving still needs 'dive'.
                // The camper is 1x and floats on the 1x sea surface (the water plane
                // sits at y≈-0.6), so these ride heights stay at their real scale
                // even though the seabed basin is dug WORLD_SCALE times deeper.
                if (this._dived && camperCan('dive')) { env = 'underwater'; targetY = -50; }
                else                                  { env = 'water';      targetY = -4; }
            } else {
                env = 'road';       targetY = terrainH;   // ride the ground / climb hills
                this._dived = false;
            }
            this._env = env;
            this._van.setEnv(env);
            return targetY;
        }

        // Black fade overlay used by the no-float water rescue.
        _ensureFadeEl() {
            if (this._fadeEl) return this._fadeEl;
            const el = document.createElement('div');
            el.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;' +
                'background:#000;opacity:0;pointer-events:none;z-index:10002;' +
                'transition:opacity 0.4s ease;';
            this._overlay.appendChild(el);
            this._fadeEl = el;
            return el;
        }

        _fade(to, cb) {
            const el = this._ensureFadeEl();
            // Force a reflow so the transition runs even on the first call.
            void el.offsetWidth;
            el.style.opacity = String(to);
            if (this._fadeTimer) clearTimeout(this._fadeTimer);
            this._fadeTimer = setTimeout(() => { this._fadeTimer = null; if (cb) cb(); }, 430);
        }

        // Spiral-search outward from (tx,ty) for the closest in-bounds tile that
        // is NOT a water biome (ocean / sea / lake / river / flooded). Returns
        // {x,y} or null if none within range.
        _nearestLandTile(tx, ty) {
            const inBounds = (x, y) => x >= 0 && y >= 0 && x < 256 && y < 256;
            const isLand   = (x, y) => inBounds(x, y) &&
                getRenderType(sampleBiomeAt(x, y).name) !== 'water';
            if (isLand(tx, ty)) return { x: tx, y: ty };
            for (let r = 1; r <= 40; r++) {
                for (let dx = -r; dx <= r; dx++) {
                    for (let dy = -r; dy <= r; dy++) {
                        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;  // ring only
                        const x = tx + dx, y = ty + dy;
                        if (isLand(x, y)) return { x, y };
                    }
                }
            }
            return null;
        }

        // R key: recover a stuck camper. Fades out, drops it upright (level chassis)
        // on the nearest non-ocean biome tile, zeroes its motion, and fades back in.
        _respawnCamper() {
            if (!VoxelWorldSystem.isActive() || this._waterRescue) return;
            if (this._footOnly) return;   // no camper to put back on the road
            const curTX = Math.floor(this._vanX / WORLD_TILE_SIZE);
            const curTY = Math.floor(this._vanZ / WORLD_TILE_SIZE);
            const land  = this._nearestLandTile(curTX, curTY);
            if (!land) { if (typeof SoundManager !== 'undefined') SoundManager.playBuzzer(); return; }
            if (typeof SoundManager !== 'undefined') SoundManager.playOk();

            this._waterRescue = true;   // reuse the freeze-during-fade guard
            this._fade(1, () => {
                this._vanX = land.x * WORLD_TILE_SIZE + WORLD_TILE_SIZE * 0.5;
                this._vanZ = land.y * WORLD_TILE_SIZE + WORLD_TILE_SIZE * 0.5;
                this._velX = 0; this._velZ = 0;
                this._fwdSpeed = 0; this._latSpeed = 0;
                this._speedKmh = 0; this._speedUnitsSigned = 0; this._steerSmooth = 0;
                this._flying = false; this._dived = false;
                this._suspVel = 0;
                // Upright: clear the terrain tilt so the chassis sits level.
                this._groundPitch = 0; this._groundRoll = 0;
                this._van.group.rotation.x = 0; this._van.group.rotation.z = 0;
                this._van.group.rotation.y = this._driveAngle;
                this._terrain.update(this._vanX, this._vanZ, true);
                this._vanY = this._resolveEnv();
                this._van.group.position.set(this._vanX, this._vanY, this._vanZ);
                this._lastLandX = this._vanX;
                this._lastLandZ = this._vanZ;
                this._lastLandAngle = this._driveAngle;
                this._stuck = false; this._stuckReason = ''; this._wedgeTimer = 0;
                if (this._hud) this._hud.setRespawnHint(false);
                this._fade(0, () => { this._waterRescue = false; });
            });
        }

        _computeDriveAngle(wx, wy) {
            const biome = sampleBiomeAt(wx, wy);
            const type  = getRenderType(biome.name);
            if (type !== 'road') return 0;

            const dir = getRoadDirectionAt(wx, wy);
            if (dir === 'horizontal' || dir.includes('east') || dir.includes('west')) return Math.PI / 2;
            return 0;
        }

        _createOverlay() {
            const el = document.createElement('div');
            el.id = 'camper-drive-overlay';
            // Title mode sits low in the stack (under the title logo at z 45 and
            // the menu at z 100), ignores the mouse and fades itself in.
            el.style.cssText = this._titleMode ? `
                position:fixed; top:0; left:0; width:100%; height:100%;
                z-index:40; overflow:hidden; background:#000; pointer-events:none;
                opacity:0; transition:opacity 0.8s ease-out;
            ` : `
                position:fixed; top:0; left:0; width:100%; height:100%;
                z-index:${OVERLAY_Z}; overflow:hidden; background:#000;
            `;
            document.body.appendChild(el);
            this._overlay = el;
            // From here on, anything else the game puts on the page is a menu
            // opened over this world, and goes over it rather than under it.
            this._domMenus = new DomMenuGuard(el);
            if (!this._titleMode) this._domMenus.start();
        }

        _initThree() {
            const w = window.innerWidth;
            const h = window.innerHeight;

            this._scene = new THREE.Scene();
            // The world is streamed in chunk by chunk for as long as the scene
            // runs, by a dozen modules that build their own materials, so the
            // retro look is hung on the scene root: anything added to it is
            // patched on the way in. Without this only the few models that ask
            // the shader themselves (the wildlife, the parked vehicles) wear it
            // and the terrain under them does not.
            if (window.RetroShader && window.RetroShader.patchSceneAdds) {
                window.RetroShader.patchSceneAdds(this._scene);
            }
            const initAirless = isAirlessWorld && isAirlessWorld(this._alien);
            const initSkyCol = initAirless ? 0x000000 : 0x4387e0;
            this._scene.background = new THREE.Color(initSkyCol);
            // Much lighter haze so the world reads clearly into the distance. Fog
            // density is in 1/units, so it is divided by WORLD_SCALE to keep the
            // same view distance (in tiles) on the enlarged world.
            this._scene.fog = new THREE.FogExp2(initSkyCol, initAirless ? 0.0001 : FOG_DAY);

            // Near/far scale with the world so the (25x larger) terrain isn't
            // clipped; near stays small enough for the cabin interior.
            // The near plane is what decides depth precision - the far plane costs
            // almost nothing next to it - and at a tenth of a unit (2.5 cm) the
            // buffer had nothing left for anything further off than the bumper,
            // which is what set the walls of every building shimmering against
            // one another. Half a unit is 12.5 cm: closer to the eye than a
            // dashboard ever gets, and five times the resolution everywhere else.
            this._camera = new THREE.PerspectiveCamera(65, w / h, 0.5, VIEW_FAR);
            this._baseFov = 65;

            this._renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
            this._renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
            this._renderer.setSize(w, h);
            const caps = this._renderer.capabilities;
            if (caps && caps.getMaxAnisotropy) setTextureAnisotropy(Math.min(8, caps.getMaxAnisotropy()));

            // NO tone mapping. This world is drawn in the palette a blocky
            // world was drawn in in 2009: flat, saturated, high-contrast, the
            // colour of a face being the colour it was painted. A filmic curve
            // does the opposite of every part of that - it rolls the highlights
            // off, pulls the midtones down and takes the colour out of anything
            // bright - and the light below is balanced to land a lit top face
            // at about 1.0 instead, so there is nothing left to roll off.
            this._renderer.shadowMap.enabled = true;
            this._renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            // Off three's automatic path. Left to itself it re-renders the
            // shadow map every single frame, which walks the whole scene graph
            // - every chunk of ground, every batch of scenery, every building
            // in the town - looking for the handful of things that actually
            // cast. Redrawn on our own clock instead: the sun moves with the
            // party, so the map is a frame or two behind and nobody can see it.
            this._renderer.shadowMap.autoUpdate = false;
            this._renderer.shadowMap.needsUpdate = true;
            this._shadowTick = 0;
            this._baseExposure = 1.0;
            if (THREE.NoToneMapping !== undefined) {
                this._renderer.toneMapping = THREE.NoToneMapping;
                this._renderer.toneMappingExposure = this._baseExposure;
            }
            if ('outputColorSpace' in this._renderer && THREE.SRGBColorSpace !== undefined) {
                this._renderer.outputColorSpace = THREE.SRGBColorSpace;
            } else if ('outputEncoding' in this._renderer && THREE.sRGBEncoding !== undefined) {
                this._renderer.outputEncoding = THREE.sRGBEncoding;
            }
            this._renderer.domElement.style.cssText = 'position:absolute;top:0;left:0;display:block;';
            this._overlay.appendChild(this._renderer.domElement);

            // Sky / ground hemisphere fill + a small flat ambient floor, both
            // dialled by time of day in _updateLightingAndSky.
            this._hemiLight = new THREE.HemisphereLight(0x9ec8ff, 0x6b5a42, 0.7);
            this._scene.add(this._hemiLight);
            this._ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
            this._scene.add(this._ambientLight);

            this._sun = new THREE.DirectionalLight(0xfff4e0, 1.2);
            this._sun.castShadow = true;
            this._sun.shadow.camera.left = -400;
            this._sun.shadow.camera.right = 400;
            this._sun.shadow.camera.top = 400;
            this._sun.shadow.camera.bottom = -400;
            this._sun.shadow.camera.near = 1;
            this._sun.shadow.camera.far = 1400;
            this._sun.shadow.mapSize.width = 1024;
            this._sun.shadow.mapSize.height = 1024;
            this._sun.shadow.bias = -0.0004;
            if ('normalBias' in this._sun.shadow) this._sun.shadow.normalBias = 0.6;
            this._scene.add(this._sun);
            this._scene.add(this._sun.target);

            // Soft additive sun disc that arcs with the time of day.
            const sunMat = new THREE.SpriteMaterial({
                map: this._makeGlowTexture('#fff3c0'),
                transparent: true, depthWrite: false, depthTest: true,
                blending: THREE.AdditiveBlending
            });
            sunMat.fog = false;
            this._sunSprite = new THREE.Sprite(sunMat);
            this._sunSprite.scale.set(SUN_DISC * WORLD_SCALE, SUN_DISC * WORLD_SCALE, 1);
            this._scene.add(this._sunSprite);
        }

        // Radial-gradient glow texture for additive sprites (sun, beams).
        _makeGlowTexture(hex) {
            const s = 128;
            const cv = document.createElement('canvas');
            cv.width = cv.height = s;
            const ctx = cv.getContext('2d');
            const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
            g.addColorStop(0.0, hex);
            g.addColorStop(0.25, hex);
            g.addColorStop(1.0, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, s, s);
            const tex = new THREE.CanvasTexture(cv);
            return tex;
        }

        // Two forward spotlights + soft beam cones, parented to the camper and
        // switched on at dusk. Called once the van exists.
        _setupVehicleLights() {
            this._headlights = [];
            this._beams = [];
            // Kept for disposal: this texture and the beam SpriteMaterials are
            // created here and parented to _van.group, so CamperModel.dispose()
            // (which only frees its own tracked mats/geos) won't release them.
            const beamTex = this._makeGlowTexture('#fff6d8');
            this._beamTex = beamTex;
            for (const sx of [-14, 14]) {
                const sp = new THREE.SpotLight(0xfff2d0, 0.0, 360, 0.55, 0.45, 1.2);
                sp.position.set(sx, 14, 50);
                sp.castShadow = false;
                sp.target.position.set(sx, 4, 260);
                this._van.group.add(sp);
                this._van.group.add(sp.target);
                this._headlights.push(sp);

                const beamMat = new THREE.SpriteMaterial({
                    map: beamTex, transparent: true, depthWrite: false,
                    blending: THREE.AdditiveBlending, opacity: 0
                });
                const beam = new THREE.Sprite(beamMat);
                beam.scale.set(60, 60, 1);
                beam.position.set(sx, 12, 90);
                this._van.group.add(beam);
                this._beams.push(beam);
            }
        }

        // The light a walker carries: a warm pool around them, parented to the
        // first-person rig so it goes wherever they do.
        _setupWalkLantern() {
            this._lantern = new THREE.PointLight(0xffe0a8, 0, 260, 1.4);
            this._lantern.position.set(0, 2, 0);
            this._fpc.getRig().add(this._lantern);
        }

        _loop(now) {
            this._animId = requestAnimationFrame(this._loop);
            if (this._lastTime === null) { this._lastTime = now; return; }
            const delta = Math.min((now - this._lastTime) / 1000, 0.1);
            this._lastTime = now;
            // Kept for the draw pass: the burst effects are stepped where they
            // are drawn, which is past every path that gets there.
            this._frameDelta = delta;

            // The weapon in the driver's hands: in frame while they are walking,
            // put away at the wheel and whenever the drive itself is out of
            // frame. Ticked before every early return below, since its canvas is
            // a sibling of the drive overlay and would otherwise stay painted
            // over a menu. R1 or a click swings or fires it; OK is spoken for out
            // here (it jumps, handbrakes and opens the vehicle menu).
            CamperWeapon.update(this._viewMode, this.isPaused() || this._splitNow);

            // A fight is on over this world. The scene keeps drawing (that frame
            // IS the battle's ground, see beginBattleView) but nothing walks and
            // nothing else is allowed to start. It ends when the battle scene
            // does; VoxelWorldSystem's Scene_Battle hooks own both edges, and
            // this only catches a battle that went away without terminating.
            if (this._battleWatch) {
                if (SceneManager._scene instanceof Scene_Battle) this._battleSeen = true;
                if (this._battleSeen && !SceneManager.isSceneChanging() &&
                    !(SceneManager._scene instanceof Scene_Battle)) {
                    this.endBattleView();
                } else {
                    this._updateBattleFrame(delta, now * 0.001);
                    return;
                }
            }

            // A townsperson's answer, given once the choice window has closed:
            // their line goes in the message window, and Empathize opens their
            // panel as a scene of its own (which _suspended then waits out).
            if (this._pendingShop) {
                if (typeof $gameMessage !== 'undefined' && $gameMessage.isBusy()) {
                    return this._holdForWindow(delta, now);
                }
                const keeper = this._pendingShop;
                this._pendingShop = null;
                this._openShopStock(keeper);
                return;
            }
            if (this._pendingSay || this._pendingEmpathize) {
                if (typeof $gameMessage !== 'undefined' && $gameMessage.isBusy()) {
                    return this._holdForWindow(delta, now);
                }
                const say = this._pendingSay, emp = this._pendingEmpathize;
                this._pendingSay = null;
                this._pendingEmpathize = null;
                if (say) {
                    if (typeof $gameMessage !== 'undefined') {
                        if ($gameMessage.setSpeakerName) $gameMessage.setSpeakerName(say.name);
                        $gameMessage.add(this._citizenLine(say));
                    }
                    this._msgWatch = true;
                } else {
                    CityCrowd.ensureProfile(emp);
                    this._menuOpen = false;
                    if (window.NPCEmpathize && window.NPCEmpathize.openByName) {
                        this._suspended = true;
                        try {
                            window.NPCEmpathize.openByName(emp.name);
                        } catch (e) {
                            // A panel that refused to open must not leave the
                            // world suspended behind a scene that never came.
                            console.error('[VoxelWorld] empathize', e);
                            this._suspended = false;
                            if (this._overlay) this._overlay.style.display = '';
                        }
                    } else if (this._overlay) {
                        this._overlay.style.display = '';
                    }
                }
                return;
            }
            // Waiting out a line of dialogue over the frozen scene.
            if (this._msgWatch) {
                if (typeof $gameMessage !== 'undefined' && $gameMessage.isBusy()) {
                    return this._holdForWindow(delta, now);
                }
                // Some answers arrive a beat after the window that asked for
                // them has closed; whoever set the watch says how long to hold
                // the world still for before deciding nothing more is coming.
                if (this._msgGrace > 0) {
                    this._msgGrace--;
                    return this._holdForWindow(delta, now);
                }
                this._msgWatch = false;
                this._menuOpen = false;
                if (this._overlay) this._overlay.style.display = '';
            }

            // A station refuel window (VehicleSystemRefuel) is up over the frozen
            // scene: keep it hidden until the window closes, then restore the drive.
            if (this._stationRefuelWatch) {
                const sc = SceneManager._scene;
                if (!(sc instanceof Scene_Map) || !sc._refuelEl) {
                    this._stationRefuelWatch = false;
                    this._menuOpen = false;
                    if (this._overlay) this._overlay.style.display = '';
                } else {
                    return this._holdForWindow(delta, now);
                }
            }

            // One of the game's own DOM menus is open over the world. Unlike a
            // pushed scene, the world is NOT hidden behind it: the menu is over
            // the world and the world goes on being drawn behind it, which is
            // the point of it being over the world at all. Nothing walks and
            // nothing takes a keystroke, and the mouse goes back to the player.
            const domMenu = this._domMenus ? this._domMenus.update() : false;
            if (domMenu !== this._domMenuOpen) {
                this._domMenuOpen = domMenu;
                if (domMenu) releasePointerLock();
            }

            // One of the engine's own windows is up: a line of dialogue, a
            // choice list, a shopkeeper's counter. The world does NOT go away
            // for it - it is drawn into the game's own canvas instead, under
            // the window, so the party is still standing where they were
            // standing and the sky is still turning behind the conversation.
            // Nothing is walked and no keystroke is taken: the window owns them.
            if (this._menuOpen) {
                if (this._windowStillUp()) {
                    this._menuIdle = 0;
                    return this._holdForWindow(delta, now);
                }
                // Nothing is actually up. The window that raised this flag went
                // away without its answer ever reaching us: a fight opened over
                // it, a scene took the page, something else cleared the message.
                // Every key out here is refused while this flag stands, so left
                // alone it is a walk that cannot move, cannot open the map and
                // cannot be left. It is given a moment in case the answer is
                // still on its way, and then the world is handed back.
                this._menuIdle = (this._menuIdle || 0) + 1;
                if (this._menuIdle < MENU_WATCHDOG) return this._holdForWindow(delta, now);
                this._menuIdle = 0;
                this._menuOpen = false;
                this._pendingShop = null;
                this._pendingSay = null;
                this._pendingEmpathize = null;
                if (this._overlay) this._overlay.style.display = '';
            } else {
                this._menuIdle = 0;
            }
            this._leaveMirrorView();

            // Suspended while the main menu is open. Restore the overlay once the
            // player returns to the map scene; otherwise keep the scene frozen.
            if (this._suspended) {
                // The wait / sleep popup is not a scene: it opens ON the map,
                // so being back on Scene_Map is not the same as being done with
                // it. The world stays down until it is dismissed, or bringing
                // the overlay back would drop it straight over the clock.
                const waiting = (typeof $gameTemp !== 'undefined') && $gameTemp._sleepMenuOpen;
                if (!waiting && SceneManager._scene instanceof Scene_Map) {
                    this._suspended = false;
                    if (this._overlay) this._overlay.style.display = '';
                    // Anything done in the menu - a weapon swapped, the party
                    // reordered, somebody sent away - is in their hands and at
                    // their heels the moment they are back out here.
                    CamperWeapon.refresh();
                    if (this._followers) this._followers.refresh();
                    // Something in that menu took the party off the world map (a
                    // journey, a return, a teleport): the walk is over, and where
                    // they went is not this scene's business.
                    if (this._footOnly && typeof $gameMap !== 'undefined' &&
                        $gameMap.mapId() !== WORLD_MAP_ID) {
                        VoxelWorldSystem.stop();
                        return;
                    }
                    if (this._pendingFought) this._settleFoughtEnemy();
                } else {
                    return;
                }
            }

            // A menu over the world takes the controls; the world itself goes
            // on turning behind it - the sky, the water, the wildlife - so
            // coming back out of a menu is not coming back to a frozen picture.
            if (!this._domMenuOpen) {
                this._handleInput();
                this._updateMovement(delta);
                // ...and the second player, who has their own hands.
                this._updateCoop(delta);
            }
            this._updateLightingAndSky(delta);

            // Widen terrain streaming while liminal drive is actually crossing
            // the world at warp speed, so chunk building (and the city grid it
            // carries) stays ahead of the camper instead of leaving gaps behind
            // it. Free cam manages _terrain._radius itself (see _updateFreeCam),
            // so leave it alone there.
            // Driving under power now crosses ground several times faster than it
            // used to, so the same widening is applied (in a smaller dose) once the
            // camper is past its natural top and the ordinary radius 5 / 6 builds
            // stop keeping up.
            if (this._viewMode !== 'free') {
                const ftBoost   = this._isFastTravelActive();
                const fastDrive = !ftBoost && this._speedKmh > (this._drive.top || NATURAL_TOP);
                // Underground the ring is drawn in hard (VoxelWorldTerrain's
                // CAVE_RADIUS): a passage is meshed cube by cube, none of it can
                // be seen through five voxels of rock, and streaming it out to
                // five tiles is what a cave used to cost. Nothing is fast-
                // travelling down there, so this simply wins.
                const wantRadius = this._underground ? CAVE_STREAM_RADIUS
                    : ftBoost ? LIMINAL_TERRAIN_RADIUS : (fastDrive ? 8 : 5);
                if (this._terrain._radius !== wantRadius) this._terrain._radius = wantRadius;
                this._terrain._buildBudget = this._underground ? 4
                    : ftBoost ? LIMINAL_BUILD_BUDGET : (fastDrive ? 18 : 6);
            }

            if (this._viewMode === 'free') {
                this._updateFreeCam(delta);
            } else if (this._viewMode === 'car') {
                this._updateCarCamera(delta);
            } else {
                this._fpc.update(delta);
                if (this._solomonShake > 0) {
                    this._camera.position.x += (Math.random() - 0.5) * this._solomonShake * 4;
                    this._camera.position.y += (Math.random() - 0.5) * this._solomonShake * 4;
                }
                if (this._titleMode) this._updateTitleLook(delta);
                // On foot the player is free to walk any distance from the parked
                // camper (no tether), so terrain streaming has to follow the
                // player rather than staying centred on the stationary van, or
                // a long walk would run off the edge of the built ground.
                if (this._viewMode === 'foot') {
                    // A touch of extra field of view while running, eased in and
                    // out, so a sprint reads as speed rather than as the same
                    // view moving faster.
                    const running = this._fpc.onGround &&
                        Math.hypot(this._fpc.velocity.x, this._fpc.velocity.z) > FOOT_WALK * 1.2;
                    const wantFov = this._baseFov + (running ? 7 : 0);
                    if (Math.abs(this._camera.fov - wantFov) > 0.05) {
                        this._camera.fov += (wantFov - this._camera.fov) * Math.min(1, delta * 5);
                        this._camera.updateProjectionMatrix();
                    }
                    const p = this._fpc.getRig().position;
                    this._terrain.update(p.x, p.z);
                    this._updateDigging(delta);
                    // Underwater and in the air the world is lit and fogged by
                    // where the WALKER is, not by where the camper is parked.
                    if (!this._footOnly) this._env = this._footEnv();
                } else {
                    const fwdX = Math.sin(this._driveAngle) * Math.max(1, this._speedKmh || 0);
                    const fwdZ = Math.cos(this._driveAngle) * Math.max(1, this._speedKmh || 0);
                    this._terrain.update(this._vanX, this._vanZ, false, fwdX, fwdZ);
                    if (this._tool) {
                        this._tool.setActive(false);
                        if (this._hud && this._hud.setDigReadout) this._hud.setDigReadout('', '', 0);
                    }
                }
            }

            // Drive the procedural camper: wheels spin/steer, body roll/pitch/
            // bounce, plus door / rotor / propeller animation. The cosmetic body
            // dynamics are suppressed while the camera rides inside (fp / fpdrive):
            // the rig is parented to the outer group, so a bouncing body would
            // read as the whole view bobbing against the cockpit.
            // A free walk keeps the camper out of the scene entirely, so none of
            // its animation runs.
            if (!this._footOnly) {
                const fpInside = this._viewMode === 'fp' || this._viewMode === 'fpdrive';
                this._van.applyMotion(this._speedUnitsSigned, this._steerSmooth, delta,
                    fpInside ? 0 : this._bodyRoll,
                    fpInside ? 0 : this._bodyPitch,
                    fpInside ? 0 : this._bodyBounce);
                this._updateDoorAutoOpen();
                this._van.update(delta);
            }
            if (this._drivenModel && this._drivenModel.update) {
                this._drivenModel.update(this._fxTime || 0);
            }
            if (this._driven2d) {
                const fpdrive = this._viewMode === 'fpdrive';
                this._driven2d.setVisible(!fpdrive);
                if (!fpdrive) {
                    this._driven2d.yaw = this._driveAngle;
                    this._driven2d.setPosition(this._vanX, this._vanY, this._vanZ);
                    const camYaw = this._cameraYaw();
                    const camPos = this._camera.position;
                    this._driven2d.setDaylight(this._dayFactor == null ? 1 : this._dayFactor);
                    this._driven2d.update(camPos.x, camPos.z, camYaw);
                    this._driven2d.faceCamera(camPos.x, camPos.z, camYaw);
                }
            }

            // Whatever just moved the party - the walk, the swim, the flight or
            // the camper - a hand-made town's squares are not theirs to cross.
            this._guardReservedSquares();
            this._updateUnderground();
            this._updateOmegaTower();
            this._checkLeavingAtmosphere();

            this._updateFuel(delta);
            // Real time behind the wheel, not map steps: the driving scene
            // trains the same specializations the overworld does.
            if (!this._titleMode && window.SpecializationXP && Math.abs(this._speedKmh) > 5) {
                window.SpecializationXP.tick('RV Driving', 1, 40, { key: 'camperdrive' });
                window.SpecializationXP.tick('Car Driving', 1, 40, { key: 'camperdrive' });
            }
            // The dial's scale is the vehicle's own natural top, not the ceiling
            // it can be boosted to: a camper reads to 400 and pegs while the
            // liminal boost is carrying it past that, which is the whole point
            // of reading it there.
            this._hud.update(this._vanX, this._vanZ, this._speedKmh, this._gearLabel,
                this._rpm, this._driveAngle, (this._drive && this._drive.top) || NATURAL_TOP);
            this._hud.updateEnvLabel(this._env);
            this._updateActionPrompt();
            this._hud.updateControllerHint(!this._titleMode && GamepadRaw.connected());
            // A toast, the quick bar and its target card belong over the world,
            // not under it.
            this._surfaceDom();
            this._hud.setRespawnHint(this._stuck && !this._waterRescue, this._stuckReason);

            // Ability chips and condition + trip odometer. A free walk shows the
            // walker's own three (anybody can swim and dive; the air belongs to
            // whoever leads a party that knows the Fly skill), a drive shows the
            // camper's modular upgrades.
            const afloat = this._env === 'water' || this._env === 'underwater';
            if (this._footOnly) {
                const f = this._fpc;
                this._hud.updateAbilities({
                    swim: { unlocked: true, active: !!(f && f.swimming) },
                    dive: { unlocked: true, active: !!(f && f.submerged) },
                    fly:  { unlocked: leaderCanFly(), active: !!(f && f.flying) }
                });
            } else {
                this._hud.updateAbilities({
                    fly:   { unlocked: camperCan('fly'),   active: this._flying },
                    float: { unlocked: camperCan('float'), active: afloat },
                    dive:  { unlocked: camperCan('dive'),  active: this._env === 'underwater' }
                });
            }
            // Trip odometer: _odo integrates |km/h| * seconds, so /3600 gives km.
            this._hud.updateStatus(this._camperCondition(), (this._odo || 0) / 3600);

            // In-cabin dash: speedo / tacho / fuel needles + brake lights.
            if (!this._footOnly && this._van.updateDash) {
                const maxFuel = camperMaxFuel();
                const fuelV = camperFuelGet();
                this._van.updateDash(this._speedKmh, this._rpm || 0,
                    Math.max(0, Math.min(1, fuelV / maxFuel)), !!this._brakeOn);
            }
            if (this._crashTimer > 0) this._crashTimer -= delta;
            this._wheelFx.update(delta);

            // Living world: weather, sea, traffic, bubbles, engine note.
            const _wt = (window.$gameWeather) ? window.$gameWeather.currentWeatherType : null;
            const _fx = (_wt === 'rain' || _wt === 'storm') ? 'rain' : _wt === 'snow' ? 'snow' : null;
            this._weatherFx.setWeather(_fx);
            this._weatherFx.update(this._vanX, this._vanZ, delta);

            const tsec = now * 0.001;
            this._water.update(this._vanX, this._vanZ, tsec);
            // Inland there is no sea to draw, and drawing it anyway would fill
            // every hole the party digs. Rivers and lakes carry their own water.
            // Underground it is taken down outright: the sheet runs at one level
            // across the whole world, and every passage down there is below it.
            this._water.setVisible(this._terrain.seaNear && !this._underground);
            this._traffic.update(this._vanX, this._vanZ, delta,
                this._dayFactor == null ? 1 : this._dayFactor, this._cameraYaw());
            if (this._parked) {
                // The vehicle being driven is under the party, and
                // parked wherever they left it the moment they are not.
                this._parked.setDriving(this._footOnly ? null : (this._vehicleId || 'camper'));
                const p = this._contactPoint();
                this._parked.update(delta, p.x, p.z, this._cameraYaw());
            }
            // On foot the wildlife lives around the WALKER, not around the
            // parked camper: what spawns, what despawns and how big a name plate
            // reads are all measured from where the party actually stands.
            if (this._bioEnemies) {
                const at = this._contactPoint();
                // Underground the roster changes and so does the floor: what
                // lives down there is what the Cave biome lists, and it has to
                // be put on the floor of the passage the party is standing in
                // rather than on the hillside overhead, so the manager is told
                // how deep they are as well as where.
                this._bioEnemies.setUnderground(this._underground, at.y);
                this._bioEnemies.update(delta, at.x, at.z);
            }
            // Townspeople and the party's own line, both drawn as walk-sheet
            // cards that turn to the camera (see CharacterBillboard). The crowd
            // only lives in towns; the followers only show on foot.
            if (this._crowd || this._followers) {
                const camYaw = this._cameraYaw();
                const df = this._dayFactor == null ? 1 : this._dayFactor;
                if (this._crowd) this._crowd.update(delta, this._vanX, this._vanZ, camYaw, df);
                // Insides are only worth building for somebody who could walk
                // into one, so they follow the walker rather than the camper.
                if (this._interiors && this._viewMode === 'foot') {
                    const rp = this._fpc.getRig().position;
                    this._interiors.update(rp.x, rp.z);
                    // Whoever is minding the shops turns to face you.
                    this._interiors.tickKeepers(rp.x, rp.z, camYaw, df);
                }
                if (this._followers) {
                    // The line behind the leader walks the ground. Once the
                    // leader is swimming or in the air there is no ground under
                    // them to walk on, and the party goes where the leader goes:
                    // the cards come down rather than trailing along the seabed.
                    const f = this._fpc;
                    const onFoot = this._viewMode === 'foot' &&
                        !(f && (f.swimming || f.flying));
                    this._followers.refresh(this._footOnly ? null : this._vehicleId);
                    // Aboard: they are IN the thing rather than behind it. The
                    // party used to vanish the moment the camper moved off.
                    const riding = !onFoot && !this._footOnly &&
                        this._rideParty(camYaw, df);
                    this._followers.setVisible(onFoot || riding);
                    if (onFoot) {
                        const rig = this._fpc.getRig().position;
                        this._followers.update(delta, rig.x, rig.y - FOOT_EYE, rig.z, camYaw, df,
                            (x, z) => this._groundUnderfoot(x, z));
                    }
                }
            }
            const at = this._contactPoint();
            this._underwaterFx.setActive(this._env === 'underwater');
            this._underwaterFx.update(at.x, at.y != null ? at.y : this._vanY, at.z, delta);
            if (this._engine) {
                const engineOn = this._isFastTravelActive() || this._viewMode === 'car' ||
                    this._viewMode === 'fpdrive' || this._env !== 'road';
                this._engine.setState(this._rpm || 0.12, this._throttle01 || 0,
                    this._speedKmh, this._slip01 || 0, engineOn);
                this._engine.setBoost(!!this._boostActive && engineOn);
            }

            // Liminal / cosmic-horror overdrive DISABLED: the glitch effects (space
            // warp, FOV/roll/shake, palette bleed, eldritch entities, engine-note
            // drift) are all turned off, so the liminal drive now looks and sounds
            // like a normal drive. Intensity is pinned at 0; update() is still called
            // with 0 so any lingering warp / fog / overlay is cleanly reset.
            this._liminalI = 0;
            if (this._engine) this._engine.setLiminal(0);
            this._liminal.update({
                camera: this._camera, van: this._van, terrain: this._terrain,
                renderer: this._renderer, scene: this._scene, viewMode: this._viewMode,
                intensity: 0, time: tsec, delta, baseExposure: this._baseExposure
            });

            // Solomon Ritual FX
            if (this._solomon) {
                this._solomon.update(at.x, at.y != null ? at.y : this._vanY, at.z, delta, tsec, this);
            }
            if (this._solomonShake > 0) {
                this._solomonShake = Math.max(0, this._solomonShake - delta * 1.5);
            }

            // Speed lens: while the turbo is HELD DOWN, and only then, light
            // starts to bend in a bubble around the camper above WARP_START_KMH,
            // harder the faster it goes. Nothing in the scene is displaced - it
            // is a screen-space pass over the finished frame (SpeedWarpFx), so
            // the scenery, the chunk seams and the physics are all untouched.
            //
            // Two things have to be true of it at once. Only the machines that
            // bend space bend it: a bicycle at its ceiling and a broom at nine
            // hundred are going quickly, they are not tearing a hole in the
            // world, and drawing the lens over them made them look like they
            // were. And it is the OVERDRIVE that tears it, not the speed - a
            // camper simply travelling fast leaves the world alone, so the field
            // comes up under the finger on Shift and goes again when it lifts.
            const warping = this._boostActive && this._drive.warp;
            let warpTarget = warping
                ? Math.max(0, this._speedKmh - WARP_START_KMH) /
                  Math.max(1, (this._drive.ceiling || MAX_KMH) - WARP_START_KMH)
                : 0;
            // Eased rather than linear: the turbo's ceiling is several times the
            // natural top, so a straight ramp would leave ordinary fast driving
            // showing nothing at all.
            warpTarget = Math.pow(Math.min(1, warpTarget), 0.6) * 0.75;
            if (warpTarget > 0) warpTarget = Math.min(1, warpTarget + 0.25);
            // Never bend during the liminal (auto fast-travel) drive: its cruise
            // speed sits far above WARP_START_KMH, which would leave the lens on
            // for the whole trip.
            if (this._isFastTravelActive()) warpTarget = 0;
            this._warpAmount += (warpTarget - this._warpAmount) * Math.min(1, delta * 3);
            if (this._warpAmount < 0.002) this._warpAmount = 0;

            this._renderFrame(tsec);

            // Title background: reveal the drive once the first frame is on
            // screen, so the title never flashes a half-built world.
            if (this._titleMode && this._overlay && this._overlay.style.opacity !== '1') {
                this._overlay.style.opacity = '1';
            }
        }

        // Draw the scene, through the speed lens when one is running. The PSX
        // downscale pass, where it is enabled, is chained INSIDE the lens: it
        // renders into whatever target it is handed, so the retro blit lands in
        // the lens's offscreen frame and the lens then bends that onto the canvas.
        _renderFrame(tsec) {
            // The shadow map, on its own clock (see the renderer above).
            if (this._renderer.shadowMap &&
                (++this._shadowTick % SHADOW_EVERY) === 0) {
                this._renderer.shadowMap.needsUpdate = true;
            }
            // Two players, looking two ways: the canvas is cut in half and the
            // whole scene is drawn twice, once through each camera. Everything
            // that turns to face the eye is turned again between the passes,
            // or the second player would see every figure in the world edge-on.
            //
            // The speed lens and the retro downscale are both skipped while the
            // screen is cut. Each is one full-screen pass through a render
            // target of its own, and neither half of a split IS the screen: run
            // over a viewport they would blow the scissor away and paint one
            // player's view over both. A drive fast enough to bend space is a
            // drive, and a drive merges the screen anyway.
            if (this._splitNow && this._coop) { this._renderSplit(); return; }
            // Effekseer draws straight onto the canvas, over whatever three.js
            // has just put there, so every path out of this method goes through
            // one line: the world, then the spells going off in it.
            const bursts = () => {
                if (this._spellFx) {
                    this._spellFx.draw(this._renderer, this._camera, this._frameDelta || 1 / 60);
                }
            };
            if (this._coop) this._showBodies(false, true);
            const drawInto = (target) => {
                this._renderer.setRenderTarget(target || null);
                if (window.PSXShader) {
                    window.PSXShader.render(this._renderer, this._scene, this._camera);
                } else {
                    this._renderer.render(this._scene, this._camera);
                }
                this._renderer.setRenderTarget(null);
            };

            if (this._speedFx && this._warpAmount > 0) {
                // In the first-person views the camper IS the camera, so the lens
                // sits at the centre of the screen; otherwise it is bent around
                // wherever the vehicle happens to be drawn.
                const fp = this._viewMode === 'fp' || this._viewMode === 'fpdrive' ||
                    this._viewMode === 'foot';
                this._warpCentre.set(this._vanX, this._vanY + 6, this._vanZ);
                const done = this._speedFx.render(this._renderer, drawInto, {
                    amount: this._warpAmount, time: tsec, center: this._warpCentre,
                    camera: this._camera, centered: fp
                });
                if (done) { bursts(); return; }
            }
            drawInto(null);
            bursts();
        }

        // Draw the world twice, into the two halves of the canvas. The split is
        // laid out the way the 2D session lays its own out, so a pair who set
        // the game to a left/right split on the map do not get a top/bottom one
        // the moment they walk into this world.
        _renderSplit() {
            const r = this._renderer;
            const el = r.domElement;
            const W = el.width, H = el.height;
            const SS = window.$gameSplitScreen;
            const horizontal = !!(SS && SS.splitOrientation && SS.splitOrientation() === 'horizontal');
            const g = SPLIT_GAP;

            const views = horizontal
                ? [{ x: 0, y: Math.floor(H / 2) + g, w: W, h: Math.floor(H / 2) - g, cam: this._camera },
                   { x: 0, y: 0,                     w: W, h: Math.floor(H / 2) - g, cam: this._coop.camera }]
                : [{ x: 0, y: 0, w: Math.floor(W / 2) - g, h: H, cam: this._camera },
                   { x: Math.floor(W / 2) + g, y: 0, w: Math.floor(W / 2) - g, h: H, cam: this._coop.camera }];

            // The whole canvas cleared once, so the gap between the halves is
            // black rather than last frame's world.
            r.setScissorTest(false);
            r.setViewport(0, 0, W, H);
            r.clear();
            r.setScissorTest(true);

            const yaws = [this._cameraYaw(), this._coop.yaw()];
            const eyes = [this._camera, this._coop.camera];
            for (let i = 0; i < views.length; i++) {
                const v = views[i];
                if (v.w <= 0 || v.h <= 0) continue;
                const aspect = v.w / v.h;
                if (v.cam.aspect !== aspect) { v.cam.aspect = aspect; v.cam.updateProjectionMatrix(); }
                r.setViewport(v.x, v.y, v.w, v.h);
                r.setScissor(v.x, v.y, v.w, v.h);
                const eye = eyes[i].getWorldPosition(
                    this._splitEye || (this._splitEye = new THREE.Vector3()));
                // A first-person walker does not see their own body, and their
                // own body is standing exactly where their eye is: left drawn,
                // it would fill their half of the screen. So each is shown only
                // in the OTHER player's pass.
                this._showBodies(i === 1, i === 0);
                faceBillboards(eye.x, eye.z, yaws[i]);
                r.render(this._scene, v.cam);
            }
            r.setScissorTest(false);
            r.setViewport(0, 0, W, H);
        }

        // Which of the two bodies is drawn. One view shows the other player
        // only; a merged screen is the first player's eye, so theirs stays off.
        _showBodies(lead, coop) {
            const onFoot = this._viewMode === 'foot';
            if (this._leadBody) {
                this._leadBody.mesh.visible = !!lead && onFoot && this._leadBody._sized;
            }
            if (this._coop && this._coop.body) {
                this._coop.body.mesh.visible = !!coop && this._coop.body._sized;
            }
        }

        // ---------------------------------------------------------------------
        // The planet's own ground
        // ---------------------------------------------------------------------
        // The landing picture the party picked their square off is painted from
        // a real elevation field (Renderer3D.terrestrialElevation, the same one
        // the 2D surface maps already sample). This hands that field to the
        // voxel ground, so the sea they saw from orbit is the sea they wade
        // into and the mountain range is where the picture drew it.
        //
        // One world square to one cell of the landing grid. Longitude wraps -
        // walk far enough east and you come back round - and latitude folds at
        // the poles, so walking north over the top puts you on the other side of
        // the world coming south, which is what a sphere does.
        _buildAlienTerrain() {
            const planet = (this._alien && this._alien.planet) || null;
            const t = (planet && planet.terrain) || null;
            const R3D = window.GalaxySim && window.GalaxySim.Renderer3D;
            if (!t || !R3D || !R3D.planetElevation) return null;
            const w = Math.max(1, (t.grid && t.grid.w) || 12);
            const h = Math.max(1, (t.grid && t.grid.h) || 6);
            const seed = t.seed || 0;
            // Which painter's relief this world is cut out of. Older saves
            // carry only the two-value `family`, so it still answers for them.
            const fam = t.surface ||
                (t.family === 'terrestrial' ? 'terrestrial' : 'rocky');
            // A world with no sea has none: only the terrestrial family gets an
            // ocean, and a comet with a coastline would be a lie. The one sheet
            // of water the world draws is water, so a world whose low ground is
            // molten keeps its relief dry and puts the melt in the ground
            // itself instead (see the field's ALIEN_STYLES).
            const wet = fam === 'terrestrial';
            // Impacts, and how many: a world with no air to burn them up and no
            // weather to wear them down is pocked from pole to pole, while one
            // that still has a crust turning over keeps only the recent few.
            const craters = (CRATERED_TYPES[planet && planet.type] !== undefined && R3D.rockyCraterList)
                ? R3D.rockyCraterList(seed, CRATERED_TYPES[planet.type])
                : ((fam === 'rocky' && R3D.rockyCraterList) ? R3D.rockyCraterList(seed, 14) : null);
            const opts = { family: fam, isOcean: !!t.isOcean };
            const out = { e: 0, seaLevel: 0.5, band: 'rock', crater: 0,
                          detail: 0.5, crack: 0, fracture: 0 };

            const field = (gx, gz) => {
                const u = ((gx / w) % 1 + 1) % 1;
                // Fold: two grid-heights make a round trip over both poles.
                let f = ((gz / h) % 2 + 2) % 2;
                if (f > 1) f = 2 - f;

                const info = R3D.planetElevation(seed, u, f, opts);
                out.e = info.elevation;
                // A dry world keeps the same relief with the water taken out of
                // it: the sea level is put below the lowest ground there is.
                out.seaLevel = wet ? info.seaLevel : -0.35;
                out.band = info.band;
                out.detail = (typeof info.detail === 'number') ? info.detail : 0.5;
                out.crack = info.crack || 0;
                out.fracture = info.fracture || 0;
                out.crater = 0;
                if (craters) {
                    // How deep into a crater this square is: 0 outside, 1 dead
                    // centre. Longitude is measured the short way round so a
                    // basin on the meridian is not cut in half.
                    for (let i = 0; i < craters.length; i++) {
                        const c = craters[i];
                        let du = (u - c.u) * w;
                        if (du > w / 2) du -= w; else if (du < -w / 2) du += w;
                        const dv = (f - c.v) * h;
                        const d = Math.hypot(du, dv) / c.r;
                        if (d < 1) out.crater = Math.max(out.crater, 1 - d);
                    }
                }
                return out;
            };
            // What KIND of world this is, for the field to shape it by: the
            // planet's own type first (a desert is not a rainforest even though
            // both are terrestrial), its painter family behind that, and the
            // seed, which is what makes two ice moons two different ice moons.
            field.meta = {
                type: (planet && planet.type) || '',
                surface: fam,
                seed,
                isOcean: !!t.isOcean,
                gravity: (planet && planet.gravity) || 1,
            };
            return field;
        }

        // What o'clock it is in the sky over this world, or null to use Earth's
        // own hour unchanged. Reads the Earth clock; never writes it.
        _skyHour(earthMinutes) {
            if (!this._sky) return null;
            const GS = window.GalaxySim;
            if (!GS || !GS.localHourFor) return null;
            return GS.localHourFor(this._sky, earthMinutes);
        }

        // Push a sky colour toward what this world's star actually makes of it.
        // The multipliers are relative to a sun-like star, so Earth and anything
        // orbiting a G star come out exactly as they always did.
        _starTintSky(col) {
            const rel = this._sky && this._sky.star && this._sky.star.skyRel;
            if (!rel) return col;
            col.setRGB(
                Math.min(1, col.r * rel[0]),
                Math.min(1, col.g * rel[1]),
                Math.min(1, col.b * rel[2])
            );
            return col;
        }

        // ...and the same for the light falling on the ground, done once when
        // the world opens: the star does not change colour during a walk.
        _applyStarLight() {
            const rel = this._sky && this._sky.star && this._sky.star.lightRel;
            if (!rel) return;
            const paint = (light) => {
                if (!light || !light.color) return;
                light.color.setRGB(
                    Math.min(1, rel[0]), Math.min(1, rel[1]), Math.min(1, rel[2]));
            };
            paint(this._sun);
            paint(this._hemiLight);
            if (this._sunSprite && this._sunSprite.material && this._sunSprite.material.color) {
                this._sunSprite.material.color.setRGB(
                    Math.min(1, rel[0]), Math.min(1, rel[1]), Math.min(1, rel[2]));
            }
            // ...and how big it looks from here. A world of a red dwarf has to
            // huddle in close to stay warm and gets a star three times the size
            // of ours; a world of a red giant gets one that fills the sky.
            const app = (this._sky.star && this._sky.star.apparent) || 1;
            if (app !== 1 && this._sunSprite) {
                const sz = SUN_DISC * WORLD_SCALE * Math.sqrt(app);
                this._sunSprite.scale.set(sz, sz, 1);
            }
        }

        _updateLightingAndSky(delta) {
            // Time-of-day from TimeDateSystem Variable 114 (total game minutes).
            // Base epoch is 10:00 AM (600 min offset), see TimeDateSystem.
            const totalMins    = (typeof $gameVariables !== 'undefined') ? $gameVariables.value(114) : 0;
            // The title drive rolls its own hour (never writing the clock back)
            // so each visit to the title screen catches a different light.
            const minuteOfDay  = (totalMins + 600 + (this._titleMinuteOffset || 0)) % (24 * 60);
            // On another world the sky runs on that world's rotation instead:
            // a six hour day gets four dawns while an Earth day passes, a nine
            // hundred hour day sits in the same afternoon for a month, and a
            // tidally locked one never moves off its one hour at all. The CLOCK
            // is untouched - TimeDateSystem is still keeping Earth time for
            // hunger, sleep and the calendar; this only reads it.
            const alienHour    = this._skyHour(totalMins + 600 + (this._titleMinuteOffset || 0));
            const hour         = (alienHour == null) ? minuteOfDay / 60 : alienHour; // 0..24 float
            const df           = dayFactorForHour(hour);
            this._dayFactor    = df;
            const underwater   = this._env === 'underwater';
            // Rock overhead: no sun, no sky, no stars, and the only light down
            // there is the one the party is carrying.
            const cave         = !!this._underground;

            // Sun arcs across the sky (rises ~6h east, sets ~18h west). The sprite
            // and the shadow-casting light share the same direction.
            const dayT = Math.max(0, Math.min(1, (hour - 6) / 12));
            const az   = Math.PI * (1 - dayT);
            const sx   = this._vanX + Math.cos(az) * 520;
            const sz   = this._vanZ + Math.sin(az) * 260;
            const sy   = 120 + Math.sin(dayT * Math.PI) * 520;
            // The shadow-casting directional light stays camper-local so its (fixed)
            // shadow frustum still covers the vehicle and nearby scenery; only its
            // direction matters for lighting.
            this._sun.position.set(sx, sy, sz);
            this._sun.target.position.set(this._vanX, this._vanY, this._vanZ);
            this._sun.target.updateMatrixWorld();
            if (this._sunSprite) {
                // The sun disc is pushed out to celestial distance so it sits
                // behind mountains, trees, structures and terrain. With depthTest: true,
                // mountain geometry cleanly occludes the sun.
                const sunDist = 2000 * WORLD_SCALE;
                const sunElevation = (120 + Math.sin(dayT * Math.PI) * 520) * (sunDist / 520);
                this._sunSprite.position.set(
                    this._vanX + Math.cos(az) * sunDist,
                    sunElevation,
                    this._vanZ + Math.sin(az) * (sunDist * 0.5)
                );
                this._sunSprite.material.opacity = (0.2 + df * 0.8) * (underwater || cave ? 0 : 1);
            }

            // Light intensities, and they add up to ONE. Nothing is tone
            // mapped any more, so anything over 1 is not a brighter surface, it
            // is a white one: a lit top face has to land at about the colour it
            // was painted and no higher. Most of it is flat fill rather than
            // sun, which is where this world's look comes from - a face is the
            // colour it is because of WHICH WAY IT FACES (FACE_SHADE in the
            // mesher: top 1, side 0.82, end 0.68), not because of where the sun
            // happens to be standing. Dimmed and bluer underwater, all but out
            // in a cave.
            this._sun.intensity          = cave ? 0.02 : underwater ? 0.16 : 0.06 + df * 0.42;
            this._ambientLight.intensity = cave ? 0.05 : underwater ? 0.16 : 0.05 + df * 0.18;
            if (this._hemiLight) {
                this._hemiLight.intensity = cave ? 0.06 : underwater ? 0.18 : 0.08 + df * 0.26;
            }
            if (this._solomon && this._solomon.isActive()) {
                this._ambientLight.color.lerp(new THREE.Color(0xff2233), Math.min(1, delta * 2));
            } else {
                this._ambientLight.color.lerp(new THREE.Color(0xffffff), Math.min(1, delta * 2));
            }

            // The free walk's hand light, on the same dusk-to-dawn schedule as
            // the headlights below.
            if (this._lantern) {
                // The lantern is what a cave is lit by, at any hour.
                const li = (df < HEADLIGHT_NIGHT || underwater || cave) ? WALK_LANTERN_INTENSITY : 0;
                this._lantern.intensity += (li - this._lantern.intensity) * Math.min(1, delta * 3);
            }

            // Headlights / beams ramp on at dusk, at night, and underwater.
            const wantHead = (df < HEADLIGHT_NIGHT) || underwater || cave;
            const hi = wantHead ? HEADLIGHT_INTENSITY : 0.0;
            const bo = wantHead ? HEADLIGHT_BEAM_OPACITY : 0.0;
            const ek = Math.min(1, delta * 3);
            if (this._headlights) for (const sp of this._headlights) sp.intensity += (hi - sp.intensity) * ek;
            if (this._beams) for (const b of this._beams) b.material.opacity += (bo - b.material.opacity) * ek;

            const airless = isAirlessWorld && isAirlessWorld(this._alien);
            // Sky / fog colour. Underwater forces a deep teal regardless of camera.
            // On an airless alien world the sky is a black starry sky at all hours;
            // on an alien world with atmosphere the sky colour depends on its biome.
            const targetSky = cave ? this._tmpSky.setHex(CAVE_SKY)
                : underwater ? this._tmpSky.setHex(0x0d4a5c)
                : airless ? this._tmpSky.setHex(0x000000)
                : (this._alien && sampleAlienSkyColor) ? this._starTintSky(sampleAlienSkyColor(this._alien, hour, this._tmpSky))
                : this._starTintSky(sampleSkyColor(hour, this._tmpSky));
            // The haze at the horizon is NOT the sky over it: the sky is deep
            // and the distance pales toward white, which is what makes a
            // horizon read as a horizon rather than as the line where the
            // ground stops. Underground and underwater there is no horizon and
            // the two are the same thing. On an airless world there is no horizon
            // haze and the black sky meets the ground cleanly.
            if (!this._tmpFog) this._tmpFog = new THREE.Color();
            const targetFog = (cave || underwater || airless)
                ? this._tmpFog.copy(targetSky)
                : skyFogColor(targetSky, this._tmpFog);
            if (this._solomon) {
                this._solomon.overrideSky(targetSky, targetFog, delta);
            }
            const k = Math.min(1, delta * 1.5);
            if (!this._freeCamActive || underwater) {
                this._scene.background.lerp(targetSky, k);
                this._scene.fog.color.lerp(targetFog, k);
            }
            if (cave) this._scene.fog.density = FOG_CAVE;
            else if (underwater) this._scene.fog.density = FOG_UNDERWATER;
            else if (airless) this._scene.fog.density = 0.0001;
            else if (this._viewMode !== 'free') this._scene.fog.density = (this._solomon && this._solomon.isActive()) ? 0.0022 : FOG_DAY;

            // Stars / moon / drifting clouds follow the camper.
            // No sky to draw stars, a moon or clouds on when the sky is rock.
            // Elapsed hours, not the hour of the day: another world's moons run
            // their own months and have to be counted from the start of time.
            if (this._skyFx) {
                if (this._skyFx.setAirless) this._skyFx.setAirless(airless);
                this._skyFx.update(this._vanX, this._vanZ, hour, df, delta,
                    underwater || cave, (totalMins + 600) / 60);
            }
        }

        _handleInput() {
            // What the pad is doing right now: on foot the buttons are a walk,
            // behind the wheel they are a drive. The controller layer keeps the
            // table, so the tip strip and every reader agree (window.Controller).
            if (window.Controller) {
                window.Controller.setMode(this._viewMode === 'foot' ? 'walk' : 'drive');
            }
            if (this._titleMode) return;   // the title screen owns the controls
            if (this._locked) return;      // a fight has the party
            if (typeof Input === 'undefined') return;

            if (Input.isTriggered('debug_f7') && this._isDeveloperMode()) {
                this.toggleSolomonRitual();
            }


            // OK / Space is context-sensitive: on foot it jumps; while rolling in
            // a driving view it is the HANDBRAKE (hold to lock the rears and
            // drift); once nearly stopped it opens the vehicle options menu.
            // In the air the same key is the descend control (_updateFlyAlt),
            // and a handbrake on a flying ship is nothing at all.
            const drivingMode = (this._viewMode === 'car' || this._viewMode === 'fpdrive') &&
                !this._flying && this._env !== 'air';
            const rolling = this._speedKmh > 6;
            this._handbrake = drivingMode && rolling &&
                (this._freeMoveKeys.has('Space') || Input.isPressed('ok'));

            // The legend's rows have two faces, and a pad reaches most of them
            // through Input rather than through the page's own key events, so
            // the pad half of the block is read here.
            if (this._viewMode === 'foot') {
                const ASI = window.AnalogStickInput;
                if (ASI && ASI.hasPad && ASI.hasPad()) {
                    if (Math.abs(ASI.leftX ? ASI.leftX() : 0) > 0.4 ||
                        Math.abs(ASI.leftY ? ASI.leftY() : 0) > 0.4) this._teachControl('voxWalk');
                    if (Math.abs(ASI.rightX ? ASI.rightX() : 0) > 0.4 ||
                        Math.abs(ASI.rightY ? ASI.rightY() : 0) > 0.4) this._teachControl('voxLook');
                }
                if (Input.isPressed('shift')) this._teachControl('voxRun');
                if (Input.isTriggered('ok')) this._teachControl('voxJump');
                if (Input.isPressed('pagedown')) this._teachControl('voxDig');
                if (Input.isTriggered('pageup')) this._teachControl('voxSlot');
            }

            if (Input.isTriggered('ok')) {
                if (this._viewMode === 'foot') {
                    this._fpc.requestJump();
                } else if (!(drivingMode && rolling)) {
                    this._openDriveMenu();
                }
            }

            // Cancel / controller back opens the same menu ESC does: the
            // party's on foot, the vehicle's at the wheel. A walk can still be
            // ended outright with T / Select, the key that puts the world map
            // away everywhere else in the game.
            if (Input.isTriggered('cancel') && VoxelWorldSystem.isActive()) {
                this._openEscMenu();
            }
            // T / Select is the way out of this world, walking or driving. It
            // is the same key that puts the world map away everywhere else in
            // the game, so it means one thing throughout: put me back on 315.
            // Where exactly that is - the square walked to, the square driven
            // to, the ship in orbit of an alien world, the menu a free-play
            // session came from - is _endDriveToWorldMap's own answer.
            if (!this._titleMode && Input.isTriggered('wmrToggle')) this._requestExit();

            // Controller right stick zooms the camera while driving / in free cam.
            if (window.AnalogStickInput && (this._viewMode === 'car' || this._viewMode === 'free')) {
                const ry = AnalogStickInput.rightY ? AnalogStickInput.rightY() : 0;
                if (ry) {
                    const step = Math.max(150, this._zoomDist * 0.15 + 150);
                    this._zoomDist = Math.max(0, Math.min(ZOOM_MAX, this._zoomDist + ry * step * 0.5));
                }
            }

            // L2/R2 mirror the scroll wheel: R2 zooms in, L2 zooms out.
            if (this._viewMode === 'car' || this._viewMode === 'free') {
                const zoomIn  = GamepadRaw.value(GamepadRaw.R2);
                const zoomOut = GamepadRaw.value(GamepadRaw.L2);
                if (zoomIn > 0.08 || zoomOut > 0.08) {
                    const step = Math.max(150, this._zoomDist * 0.15 + 150);
                    this._zoomDist = Math.max(0, Math.min(ZOOM_MAX,
                        this._zoomDist + (zoomOut - zoomIn) * step * 0.5));
                }
            }

            // Y toggles first/third person, mirroring TAB.
            if (GamepadRaw.triggeredY() && !this.isPaused()) {
                this._cycleViewMode();
            }

            // In first person / on foot, the right stick looks around (mouse parity).
            if (window.AnalogStickInput &&
                (this._viewMode === 'fp' || this._viewMode === 'foot' || this._viewMode === 'fpdrive')) {
                const rx = AnalogStickInput.rightX ? AnalogStickInput.rightX() : 0;
                const ry = AnalogStickInput.rightY ? AnalogStickInput.rightY() : 0;
                if (rx) this._fpc.yaw.rotation.y   -= rx * 0.05;
                if (ry) {
                    this._fpc.pitch.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2,
                        this._fpc.pitch.rotation.x - ry * 0.05));
                }
            }
        }

        // ---------------------------------------------------------------------
        // The game's own widgets, over the world
        //
        // A toast, the item quick bar and the card that asks who an item is
        // used on are all DOM, and all of them sit at a z-index that puts them
        // UNDER this world's overlay: left alone they fire, and nobody ever
        // sees them. Each is lifted over the world for as long as it is up and
        // put back exactly as it was when it comes down.
        //
        // Cheap: a handful of getElementById a frame, and a write only the
        // first time each widget appears.
        // ---------------------------------------------------------------------
        _surfaceDom() {
            if (this._titleMode) return;
            if (!this._lifted) this._lifted = new Map();
            for (const id of WORLD_UI_IDS) {
                const el = document.getElementById(id);
                if (!el) continue;
                // Not "have we lifted this id", but "is THIS the element we
                // lifted": the party HUD is thrown away and built again with
                // every map scene (a menu, a fight, a transfer), and the id
                // alone would have said yes to a node that was never raised,
                // which is why the cards came and went.
                const prev = this._lifted.get(id);
                if (prev && prev.el === el) continue;
                this._lifted.set(id, { el, z: el.style.zIndex });
                el.style.zIndex = String(WORLD_UI_Z);
            }
        }

        // Put every widget back at the height the rest of the game expects it.
        _unsurfaceDomMenus() {
            if (this._domMenus) { this._domMenus.stop(); this._domMenus = null; }
            this._domMenuOpen = false;
        }

        _unsurfaceDom() {
            if (!this._lifted) return;
            for (const rec of this._lifted.values()) {
                if (rec.el && rec.el.isConnected) rec.el.style.zIndex = rec.z || '';
            }
            this._lifted = null;
        }

        // Is anything up over this world? A choice list, a line of dialogue, a
        // fight, a pushed scene, a station window - or any of the game's own DOM
        // menus. Everything that must not act on a keystroke aimed at one of
        // them asks this, rather than each keeping its own half of the list.
        // Is one of the engine's own windows genuinely on screen? The message
        // window and its choice list are busy while they are up, and a pushed
        // scene (a shop counter, a harvest panel) is not Scene_Map. Anything
        // else means the flag outlived the window that set it.
        _windowStillUp() {
            if (typeof SceneManager !== 'undefined') {
                if (SceneManager.isSceneChanging && SceneManager.isSceneChanging()) return true;
                if (!(SceneManager._scene instanceof Scene_Map)) return true;
            }
            return !!(typeof $gameMessage !== 'undefined' && $gameMessage.isBusy());
        }

        isPaused() {
            return !!(this._menuOpen || this._suspended || this._msgWatch ||
                      this._battleWatch || this._stationRefuelWatch || this._domMenuOpen ||
                      this._isFullMapOpen());
        }

        // The dragged, zoomed world map covers the screen and owns the mouse, so
        // for as long as it is up nobody walks and no keystroke is anybody
        // else's. It redraws itself on a drag rather than waiting for the loop.
        _isFullMapOpen() {
            return !!(this._hud && this._hud.isFullMapOpen && this._hud.isFullMapOpen());
        }
        // Put it away. True when there was one to put away.
        _closeFullMap() {
            if (!this._isFullMapOpen()) return false;
            this._hud.closeFullMap();
            this._hud._drawMiniMap(this._vanX, this._vanZ);
            return true;
        }

        // ---------------------------------------------------------------------
        // The party's menus, from inside the world
        // ---------------------------------------------------------------------
        // Which keys are ours and which are the menu's. The world's own keys
        // (WASD, F, C, E, R, G, Q, H, M, Tab, the digits) win wherever the two
        // tables collide, because they are what the hands are on: R respawns
        // the camper out here rather than opening the wait menu, H is the
        // control legend rather than the codex, and M is the map.
        //
        // R and H therefore need somewhere else to go, and they get it: the
        // wait menu opens on SHIFT+R and the codex on SHIFT+H, which is the
        // only place in the game a menu key is doubled up and the only way to
        // reach either from a drive.
        _runMenuHotkey(e) {
            const MH = window.MenuHotkeys;
            if (!MH || !MH.list) return;
            if (!(SceneManager._scene instanceof Scene_Map)) return;
            // Typing into something the world put on the page is not a hotkey.
            const el = document.activeElement;
            if (el && /^(input|textarea|select)$/i.test(el.tagName)) return;
            if (el && el.isContentEditable) return;

            const code = e.code;
            if (!/^Key[A-Z]$/.test(code)) return;
            const letter = code.slice(3);
            const shift = !!e.shiftKey;

            // V is the vehicle, and out here the vehicle is the one under the
            // party rather than a page of a menu: it opens the drive options -
            // stop, step outside, maintenance, refuel - which is what the key
            // means from inside a drive. On a free walk there is no vehicle and
            // the key does nothing.
            if (letter === 'V' && !shift) {
                if (this._footOnly) return;
                e.preventDefault();
                this._openDriveMenu();
                return;
            }
            // The world's own letters, and what a shifted press of them means.
            const OURS = { F: null, C: null, E: null, G: null, Q: null, M: null,
                           W: null, A: null, S: null, D: null,
                           R: 'sleep_menu', H: 'help' };
            let symbol = null;
            if (Object.prototype.hasOwnProperty.call(OURS, letter)) {
                // Only a shifted press, and only where there is somewhere for
                // it to go. An unshifted one belongs to the world.
                if (!shift || !OURS[letter]) return;
                symbol = OURS[letter];
            } else {
                if (shift) return;
                const hit = MH.list().find(h => h.key === letter);
                if (!hit) return;
                symbol = hit.symbol;
            }
            if (!MH.has(symbol)) return;
            e.preventDefault();
            this._suspended = true;
            if (this._overlay) this._overlay.style.display = 'none';
            releasePointerLock();
            if (!MH.run(symbol, SceneManager._scene)) {
                // Nothing opened after all: put the world straight back rather
                // than leaving it hidden behind a menu that never came up.
                this._suspended = false;
                if (this._overlay) this._overlay.style.display = '';
            }
        }

        // The menu button, out here. It opens the party's own menu - the whole
        // game menu, laid out as it always is (UI/CustomMainMenuLayout.js) -
        // whether the party is walking or at the wheel, and the world stops
        // dead behind it (see _openMainMenu, and _suspended in the loop).
        //
        // It used to answer two different things: on foot the party menu, and
        // aboard the camper the VEHICLE's options instead. One button, two
        // menus, and which one you got depended on where you happened to be
        // sitting. The vehicle options are on OK now and only there, the same
        // button that opens them everywhere else in this world.
        _openEscMenu() {
            // Free play (the Minigames menu) has no party menu to open and no
            // world map to go back to: back quits straight to the list it was
            // started from.
            if (this._standalone) { this._requestExit(); return; }
            this._openMainMenu();
        }

        // Opens the normal game main menu (CustomMainMenuLayout) over the scene.
        // The 3D overlay is hidden so the menu DOM/canvas is visible, and restored
        // by _loop when the player returns to the map scene.
        _openMainMenu() {
            if (this.isPaused()) return;
            if (typeof Scene_Menu === 'undefined') return;
            if (!(SceneManager._scene instanceof Scene_Map)) return;
            this._suspended = true;
            if (this._overlay) this._overlay.style.display = 'none';
            releasePointerLock();
            SceneManager.push(Scene_Menu);
        }

        // ESC / back: leave the drive scene right away (back onto map 315). Guarded
        // so it never fires while the choice menu or main menu is already up.
        _requestExit() {
            if (this.isPaused()) return;
            this._teachControl('voxReturn');
            if (typeof $gameMessage !== 'undefined' && $gameMessage.isBusy()) return;
            this._endDriveToWorldMap();
        }

        // Free-play teardown (Minigames menu): stop the overlay / rAF loop and
        // notify the opener so it can pop back to its own scene. No world-map
        // transfer, no fast-travel bookkeeping.
        _exitStandalone() {
            const cb = this._onStandaloneExit;
            this._onStandaloneExit = null;
            VoxelWorldSystem.stop();
            if (cb) cb();
        }

        // RPG Maker choice menu shown over the (temporarily hidden) 3D overlay,
        // offering the liminal-drive stop options. Opened with OK / confirm.
        _openDriveMenu() {
            // Free-play launch (Minigames menu) runs over a menu scene with no
            // message window to host the choice list, so OK is inert there and
            // Esc / Cancel quits straight back to the Minigames list.
            if (this._standalone) return;
            // A free walk owns none of these options: there is no camper to stop,
            // to step out of or to refuel. Out there OK jumps and Esc / cancel
            // ends the walk, so this menu is never opened.
            if (this._footOnly) return;
            if (this._menuOpen) return;
            if (typeof $gameMessage === 'undefined' || $gameMessage.isBusy()) return;
            this._menuOpen = true;

            // The 3D overlay sits above the game canvas, so the RPG Maker choice
            // window would be hidden behind it. Hide the overlay while choosing.
            if (this._overlay) this._overlay.style.display = 'none';
            releasePointerLock();

            const restore = () => { if (this._overlay) this._overlay.style.display = ''; };
            const choices  = [];
            const handlers = [];

            // Stop liminal drive: cancel any fast travel and drop the player onto
            // the world map (315) at the tile the camper actually reached.
            choices.push(T('CamperDrive.stopLiminal'));
            handlers.push(() => this._endDriveToWorldMap());

            // Stop driving: halt motion without closing the scene, drop to the cabin.
            choices.push(T('CamperDrive.stopDriving'));
            handlers.push(() => {
                const d = (typeof $gameSystem !== 'undefined' && $gameSystem.getFastTravelData)
                    ? $gameSystem.getFastTravelData() : null;
                if (d) d.timerActive = false;
                restore();
                this._setMode('fp');
            });

            // Step outside / climb back in (on-foot exploration).
            if (this._viewMode === 'foot') {
                choices.push(T('CamperDrive.climbBackIn'));
                handlers.push(() => { restore(); this._setMode('fp'); });
            } else {
                choices.push(T('CamperDrive.stepOutside'));
                handlers.push(() => { restore(); this._setMode('foot'); });
            }

            // The vehicle's own business, out here rather than back on the map:
            // what is broken on it and what it can be given. Both are pushed
            // scenes, so the world suspends behind them and comes back when
            // they pop, exactly as it does for the party menu.
            //
            // The maintenance sheet is the one place a critical part can be put
            // right, and being stranded in the middle of a drive is precisely
            // when somebody needs it: before this, the only way to it was to end
            // the drive, cross the world map and find a garage.
            if (window.VehicleSystemRepair) {
                choices.push(T('CamperDrive.maintenance'));
                handlers.push(() => {
                    restore();
                    this._suspended = true;
                    if (this._overlay) this._overlay.style.display = 'none';
                    releasePointerLock();
                    this._callPluginCommand('VehicleSystemRepair',
                        VEHICLE_MAINTENANCE_CMD[this._vehicleId || 'camper'] || 'camperMaintenance');
                });
            }

            // Fuel out of the party's own cans, wherever they are standing. The
            // station option below is the other half of this and only shows at
            // a forecourt.
            const sc = SceneManager._scene;
            if (sc instanceof Scene_Map && typeof sc.showRefuelWindow === 'function') {
                choices.push(T('CamperDrive.refuel'));
                handlers.push(() => this._openStationRefuel());
            }

            // At a city / village fuel station, "Continue" opens the refuel UI
            // (VehicleSystemRefuel) instead of just resuming; Esc out of it drops
            // straight back into the drive.
            const atStation = this._atGasStation();
            choices.push(atStation ? T('CamperDrive.refuelAtStation') : T('CamperDrive.continue'));
            handlers.push(() => {
                if (atStation) this._openStationRefuel();
                else restore();
            });

            const cancelIdx = choices.length - 1;
            $gameMessage.setChoices(choices, cancelIdx, cancelIdx);
            $gameMessage.setChoiceCallback((idx) => {
                this._menuOpen = false;
                const h = handlers[idx];
                if (h) h(); else restore();
            });
        }

        // One plugin command, guarded: a stripped build without the plugin that
        // owns it must not take the drive down with it.
        _callPluginCommand(plugin, command, args) {
            try {
                if (typeof PluginManager !== 'undefined' && PluginManager.callCommand) {
                    PluginManager.callCommand(null, plugin, command, args || {});
                    return true;
                }
            } catch (e) { /* the option simply does nothing */ }
            return false;
        }

        // Opens the standard refuel UI (VehicleSystemRefuel) over the paused drive
        // scene. Kept "menu open" so the 3D loop stays frozen and the overlay
        // hidden; _loop restores the overlay once the refuel window is dismissed.
        _openStationRefuel() {
            const sc = SceneManager._scene;
            if (!(sc instanceof Scene_Map) || typeof sc.showRefuelWindow !== 'function') {
                // Refuel plugin unavailable: just resume driving.
                this._menuOpen = false;
                if (this._overlay) this._overlay.style.display = '';
                return;
            }
            this._menuOpen = true;             // freeze the drive loop, keep overlay hidden
            this._stationRefuelWatch = true;   // _loop restores once the window closes
            sc.showRefuelWindow();
        }

        // Handles ending the drive while over water. The camper can float over
        // water WHILE driving, but that ability ends with the mode; if the player
        // never earned the Amphibious (float) upgrade, ending over water "splashes
        // the camper down": it takes crash damage, a splash plays, and it washes
        // ashore on the nearest land tile (so the player is never dumped mid-ocean).
        // Returns the final landing tile {x, y} (unchanged when not splashing down).
        _splashDownIfWater(tileX, tileY) {
            const overWater = getRenderType(sampleBiomeAt(tileX, tileY).name) === 'water';
            if (!overWater || camperCan('float')) return { x: tileX, y: tileY };

            if (typeof AudioManager !== 'undefined') {
                AudioManager.playSe({ name: 'Water2', pan: 0, pitch: 90, volume: 90 });
            }
            // Crash damage from the emergency water landing, which is also the
            // end of anybody's nap in the back (VehicleCrew.js).
            if (window.VehicleUpgrades && typeof window.VehicleUpgrades.applyDamage === 'function') {
                window.VehicleUpgrades.applyDamage('camper', 30);
            }
            if (window.VehicleCrew && window.VehicleCrew.wake) window.VehicleCrew.wake('crash');
            if (window.ParchmentToast) {
                window.ParchmentToast.show(T('CamperDrive.splashdown'),
                    { severity: 'warning', duration: 180 });
            }

            // Wash ashore on the nearest land tile so nothing is stranded on water.
            const land = this._nearestLandTile(tileX, tileY);
            return land ? { x: land.x, y: land.y } : { x: tileX, y: tileY };
        }

        // End the drive and place the player on the world map (315) at the world
        // tile the camper actually reached. Variables 43/44 mirror the player's
        // world position on map 315, so we write the live tile and transfer there.
        _endDriveToWorldMap() {
            // Free-play launch (Minigames menu): there is no world map to hand
            // control back to, so just dispose the drive and run the exit callback.
            if (this._standalone) { this._exitStandalone(); return; }
            // A walk on another world has no world map to walk back onto: Earth
            // is a very long way from here, and squares 43/44 are that planet's
            // landing grid rather than anything on map 315. The way off a world
            // is the way they came down, so the party goes back aboard and the
            // ship is left in orbit of the world they were standing on.
            if (this._alien) { this._endAlienWalk(); return; }
            // A free walk: the party walks back onto the world map on the square
            // they walked to, on foot. No camper was ever in the scene, so nothing
            // is parked, nothing splashes down and the vehicle's own stored
            // position is left exactly as it was.
            if (this._footOnly) { this._endWalkToWorldMap(); return; }
            // The reached world tile, clamped to the 256x256 world grid so a stray
            // position can never resolve to an off-map (or negative) coordinate.
            let tileX = Math.max(0, Math.min(255, Math.floor(this._vanX / WORLD_TILE_SIZE)));
            let tileY = Math.max(0, Math.min(255, Math.floor(this._vanZ / WORLD_TILE_SIZE)));

            // The drive mode lets the camper cross water freely; that ability ends
            // with the mode. If it ends over water without the Amphibious (float)
            // upgrade, the camper splashes down and washes ashore (see helper).
            const landing = this._splashDownIfWater(tileX, tileY);
            tileX = landing.x;
            tileY = landing.y;

            if (typeof $gameVariables !== 'undefined') {
                // Player world tile (vars 43/44) AND the camper's own world tile
                // (position store) both point at the reached tile, so the 2D map
                // and the 3D drive always agree and nothing snaps it back to 0,0.
                $gameVariables.setValue(43, tileX);
                $gameVariables.setValue(44, tileY);
                if (window.VehiclePosition) {
                    window.VehiclePosition.set('camper', WORLD_MAP_ID, tileX, tileY);
                }
            }

            // Cancel the fast-travel timer / movement lock before leaving.
            if (typeof $gameSystem !== 'undefined') {
                if ($gameSystem.clearFastTravelData) $gameSystem.clearFastTravelData();
                else if ($gameSystem.stopTravelTimer) $gameSystem.stopTravelTimer();
            }

            // Park the world-map camper (the "ship" vehicle) on the reached tile.
            let camper = null;
            if (typeof $gameMap !== 'undefined' && $gameMap.vehicle) {
                camper = $gameMap.vehicle('ship');
                if (camper && camper.setLocation) camper.setLocation(WORLD_MAP_ID, tileX, tileY);
            }

            const onFoot = this._viewMode === 'foot';
            if (typeof $gamePlayer !== 'undefined') {
                if (onFoot) {
                    // Ended outside: dismount and stand one tile south of the parked
                    // camper, facing it, rather than spawning aboard the vehicle.
                    if ($gamePlayer.isInVehicle && $gamePlayer.isInVehicle()) {
                        $gamePlayer._vehicleType = '';
                        $gamePlayer._vehicleGettingOn = false;
                        $gamePlayer._vehicleGettingOff = false;
                    }
                    if (camper) camper._driving = false;
                    const py = Math.min(255, tileY + 1);
                    if (typeof $gameVariables !== 'undefined') $gameVariables.setValue(44, py);
                    $gamePlayer.reserveTransfer(WORLD_MAP_ID, tileX, py, 8, 0);
                } else {
                    // Ended while driving: return to map 315 still aboard the camper
                    // at the exact tile reached, so the player resumes driving it on
                    // the world map instead of being dropped at (0,0).
                    $gamePlayer._vehicleType = 'ship';
                    $gamePlayer._vehicleGettingOn = false;
                    $gamePlayer._vehicleGettingOff = false;
                    if (camper) camper._driving = true;
                    // We short-circuit the engine's boarding flow (updateVehicleGetOn),
                    // which is what normally hides the on-foot sprite once aboard. Do it
                    // here so only the camper graphic shows and the hidden player sprite
                    // rides along with the vehicle instead of standing beside it.
                    $gamePlayer.setTransparent(true);
                    $gamePlayer.reserveTransfer(WORLD_MAP_ID, tileX, tileY, 2, 0);
                }
            }

            VoxelWorldSystem.stop();
        }

        // End a walk on another world: back aboard the ship, in orbit of it.
        _endAlienWalk() {
            const planet = (this._alien && this._alien.planet) || null;
            enterOrbitFromSurface(planet && planet.name);
            // Nothing about that world is true any more: no landing, no grid, no
            // suit. The ship's own interior clears the rest of it on arrival.
            if (typeof $gameSystem !== 'undefined' && $gameSystem) {
                $gameSystem._landedPlanet = null;
                $gameSystem._awayFromShip = false;
            }
            VoxelWorldSystem.stop();
        }

        // End a free walk: put the party down on map 315 on the square the walker
        // reached, facing south, on their own two feet.
        _endWalkToWorldMap() {
            let tileX = Math.max(0, Math.min(255, Math.floor(this._vanX / WORLD_TILE_SIZE)));
            let tileY = Math.max(0, Math.min(255, Math.floor(this._vanZ / WORLD_TILE_SIZE)));
            // A walk can be swum out to sea, and the 2D world map has no
            // swimming in it: whoever ends one out there washes ashore on the
            // nearest land square.
            if (getRenderType(sampleBiomeAt(tileX, tileY).name) === 'water') {
                const land = this._nearestLandTile(tileX, tileY);
                if (land) { tileX = land.x; tileY = land.y; }
            }
            if (typeof $gameVariables !== 'undefined') {
                $gameVariables.setValue(43, tileX);
                $gameVariables.setValue(44, tileY);
            }
            // Only actually transfer when the walk covered ground: a transfer
            // rebuilds the map scene, which is a lot of work to end up on the very
            // square the party never left.
            if (typeof $gamePlayer !== 'undefined' &&
                !($gameMap.mapId() === WORLD_MAP_ID &&
                  $gamePlayer.x === tileX && $gamePlayer.y === tileY)) {
                $gamePlayer.reserveTransfer(WORLD_MAP_ID, tileX, tileY, 2, 0);
            }
            VoxelWorldSystem.stop();
        }

        // Surface under a world position: asphalt only on the actual road slab
        // (the shoulders of a road tile are dirt), otherwise picked per biome.
        _surfaceAt(x, z) {
            const ts = WORLD_TILE_SIZE;
            const tx = Math.floor(x / ts);
            const tz = Math.floor(z / ts);
            const biome = sampleBiomeAt(tx, tz);
            const type  = getRenderType(biome.name);
            if (type === 'road') {
                const lx = x - (tx * ts + ts * 0.5);
                const lz = z - (tz * ts + ts * 0.5);
                const half = ROAD_TOTAL_W / 2;   // matches the built road slab width
                const gap  = ROAD_GAP / 2;       // ...minus the unpaved median down the middle
                const dir  = getRoadDirectionAt(tx, tz);
                // A carriageway, not the strip of country between the two of
                // them: the median is grass to look at (VoxelField.roadAt) and
                // has to be grass to drive on as well.
                const paved = across => Math.abs(across) <= half && Math.abs(across) > gap;
                let on;
                if (dir === 'vertical')        on = paved(lx);
                else if (dir === 'horizontal') on = paved(lz);
                else on = (Math.abs(lx) <= half && Math.abs(lz) <= half) || paved(lx) || paved(lz);
                return on ? SURFACES.asphalt : SURFACES.dirt;
            }
            if (type === 'mountain') return SURFACES.rock;
            const n = biome.name.toLowerCase();
            if (n.includes('desert') || n.includes('beach') || n.includes('dune') || n.includes('salt'))
                return SURFACES.sand;
            if (n.includes('snow') || n.includes('ice') || n.includes('glacier') ||
                n.includes('frost') || n.includes('tundra') || n.includes('arctic'))
                return SURFACES.snow;
            return SURFACES.grass;
        }

        // Automatic 5-speed box: gear follows road speed with hysteresis, the
        // RPM needle saws up through each gear and dips during the shift's
        // torque cut. Past the top gear (turbo overdrive) it pins near redline.
        _updateGearbox(delta, fwd, throttleOn) {
            if (this._shiftTimer > 0) this._shiftTimer -= delta;
            const v = Math.abs(fwd);
            if (fwd < -0.5) {
                this._gear = 1;
                this._gearLabel = 'R';
                const t = 0.15 + 0.8 * Math.min(1, v / REVERSE_MAX_KMH);
                this._rpm += (t - this._rpm) * Math.min(1, delta * 7);
                return;
            }
            let g = this._gear || 1;
            if (g < GEARS.length && v > GEARS[g - 1])      { g++; this._shiftTimer = SHIFT_TIME; if (this._engine) this._engine.playShift(); }
            else if (g > 1 && v < GEARS[g - 2] * 0.8)      { g--; this._shiftTimer = SHIFT_TIME * 0.5; if (this._engine) this._engine.playShift(); }
            this._gear = g;
            const lo = g > 1 ? GEARS[g - 2] * 0.8 : 0;
            const hi = GEARS[g - 1];
            let target = 0.14 + 0.82 * Math.max(0, Math.min(1, (v - lo) / Math.max(1, hi - lo)));
            if (v >= GEARS[GEARS.length - 1]) {
                target = 0.9 + Math.sin((this._fxTime || 0) * 11) * 0.05;   // overdrive scream
            }
            if (this._shiftTimer > 0) target *= 0.55;
            if (!throttleOn && v < 2) target = 0.12 + this._throttle01 * 0.1;   // idle
            this._rpm += (target - this._rpm) * Math.min(1, delta * 7);
            this._gearLabel = (v < 1 && !throttleOn) ? 'N' : String(g);
        }

        // Core driving physics. Velocity persists in world space; each frame it
        // is decomposed into the heading frame, forces act on the forward part,
        // grip bleeds the lateral part (slip = drift), and steering yaws the
        // heading through a speed-sensitive bicycle model.
        _stepVehiclePhysics(delta, canDrive, readInput) {
            let sin = Math.sin(this._driveAngle);
            let cos = Math.cos(this._driveAngle);
            let fwd = this._velX * sin + this._velZ * cos;
            let lat = this._velX * cos - this._velZ * sin;

            // An autopilot, when one is driving, stands in for the pedals and the
            // wheel; its throttle is continuous rather than a key press.
            const auto = this._autopilot ? this._autopilot.controls : null;
            const throttleTarget = auto ? auto.throttle
                : ((readInput && canDrive &&
                    (this._freeMoveKeys.has('KeyW') || Input.isPressed('up'))) ? 1 : 0);
            const throttleKey = canDrive && throttleTarget > 0.02;
            const brakeKey = auto ? !!auto.brake
                : (readInput && (this._freeMoveKeys.has('KeyS') || Input.isPressed('down')));
            // Turbo. Beyond the speed it buys, this is the ONE thing that lets
            // a vehicle destroy the scenery out here (see _checkPropCollision):
            // held, trees and rocks give way; released, they do not, however
            // fast the vehicle happens to be going. The ground itself is never
            // destroyed by a vehicle, boosting or not.
            const boost = !auto && readInput && canDrive && this._isAcceleratePressed();
            this._boostActive = boost;
            const airborne = this._airborne;   // set by _updateRideHeight last frame
            const turnInput = auto ? auto.steer
                : !readInput ? 0 : this._steerInput();
            const handbrake = !auto && readInput && this._handbrake;

            this._throttle01 += (throttleTarget - this._throttle01) * Math.min(1, delta * 5);
            // An analog stick is already the wrist: easing it a second time is
            // what made a pad feel like it was steering through treacle, so the
            // ease is only laid over a key, which arrives as a full lock.
            this._steerSmooth = this._steerAnalog
                ? turnInput
                : this._steerSmooth + (turnInput - this._steerSmooth) *
                    Math.min(1, delta * STEER_EASE);

            // Handling parameters for the surface / environment underfoot.
            const surf = this._env === 'road' ? this._surfaceAt(this._vanX, this._vanZ)
                : this._env === 'water'       ? { grip: 1.6, roll: 2.0, dragMul: 2.2, bump: 0, dust: 0 }
                : this._env === 'underwater'  ? { grip: 2.5, roll: 3.0, dragMul: 4.0, bump: 0, dust: 0 }
                :                               { grip: 0.9, roll: 0.0, dragMul: 0.7, bump: 0, dust: 0 };
            this._surface = surf;

            // Gravity along the grade (uphill drains speed, downhill feeds it,
            // and a parked camper will roll away on a steep enough slope).
            let grade = 0;
            if (this._env === 'road') {
                const ts = WORLD_TILE_SIZE, d = 9;
                const hF = this._terrain.getTerrainHeight((this._vanX + sin * d) / ts, (this._vanZ + cos * d) / ts);
                const hB = this._terrain.getTerrainHeight((this._vanX - sin * d) / ts, (this._vanZ - cos * d) / ts);
                grade = Math.max(-0.6, Math.min(0.6, (hF - hB) / (d * 2)));
            }
            this._grade = grade;

            this._updateGearbox(delta, fwd, throttleKey);
            const accelMult = (window.VehicleUpgrades ? window.VehicleUpgrades.getAccelMult('camper') : 1);
            const speedMult = (window.VehicleUpgrades ? window.VehicleUpgrades.getSpeedMult('camper') : 1);
            // The ceiling is the vehicle's own, not the camper's: a bicycle
            // flat out is a hundred and twenty and a starship is four thousand.
            const maxKmh = (this._drive.ceiling || MAX_KMH) * speedMult;
            const naturalTop = this._drive.top || NATURAL_TOP;

            // Integrate the dynamics in fixed substeps (each <= 1/60 s) so drag,
            // slip decay and the steering yaw stay stable and frame-rate
            // independent even across a long frame. Inputs, the surface, the
            // grade and the gearbox are all sampled once per frame above.
            const nSteps = Math.max(1, Math.min(6, Math.ceil(delta / (1 / 60))));
            const dt = delta / nSteps;
            // Loose surfaces cannot put the whole engine force down (wheelspin):
            // usable traction scales with the surface's lateral grip, so dirt /
            // sand / snow launch noticeably softer than asphalt.
            const traction = 0.55 + 0.45 * Math.min(1, surf.grip / SURFACES.asphalt.grip);

            for (let step = 0; step < nSteps; step++) {
                // Brakes, and reverse when held past the stop.
                if (brakeKey) {
                    if (fwd > 0.5) {
                        fwd = Math.max(0, fwd - BRAKE_DECEL * dt);
                        this._reverseDelay = 0;
                    } else {
                        this._reverseDelay += dt;
                        if (this._reverseDelay > 0.25 && canDrive) {
                            fwd = Math.max(-REVERSE_MAX_KMH, fwd - REVERSE_ACCEL * dt);
                        }
                    }
                } else {
                    this._reverseDelay = 0;
                }

                // Engine force through the box (torque tapers near redline and cuts
                // during a shift). Throttling out of reverse brakes first.
                if (throttleKey && fwd >= -0.5) {
                    const gearMul = GEAR_FORCE[this._gear - 1] || 1;
                    const torque  = this._shiftTimer > 0 ? 0.25
                        : Math.max(0.62, 1 - Math.max(0, this._rpm - 0.75));
                    // Shift/turbo greatly increases acceleration, not just top speed.
                    const boostMul = boost ? BOOST_ACCEL_MULT : 1;
                    fwd += ENGINE_ACCEL * gearMul * accelMult * boostMul * torque *
                        traction * this._throttle01 * dt;
                } else if (throttleKey && fwd < -0.5) {
                    fwd = Math.min(0, fwd + BRAKE_DECEL * dt);
                }

                // Turbo overdrive: shove past the natural top toward the
                // vehicle's own ceiling. A bike and a broom have one too - they
                // simply go faster; what they do NOT get is the space-bending
                // that comes with it on a camper, a car or a ship (see the warp
                // below, which asks the profile).
                if (boost && this._drive.boost !== false && throttleKey && fwd > 1) {
                    fwd = Math.min(maxKmh, fwd + OVERDRIVE_KMHPS * accelMult * dt);
                }

                // Air drag + rolling resistance (no rolling resistance in mid-air).
                // Above the natural top the speed is only held under boost: while Shift
                // is down the overdrive bleeds off gently; the instant it is released
                // the excess collapses very fast, so the liminal boost reads as a burst.
                let decel = DRAG_K * surf.dragMul * fwd * fwd + (airborne ? 0 : surf.roll);
                if (Math.abs(fwd) > naturalTop) {
                    decel = boost ? Math.min(decel, OVERDRIVE_DECAY)
                                  : Math.max(decel, BOOST_RELEASE_DECAY);
                }
                fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), decel * dt);

                // Handbrake: rear lock drags the nose down and slashes lateral grip.
                let grip = surf.grip;
                if (handbrake) {
                    fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), HANDBRAKE_DECEL * dt);
                    grip *= HANDBRAKE_GRIP;
                }

                // Slope, then static friction so gentle grades hold a parked camper.
                // In mid-air there is no ground contact, so the grade does not act.
                if (!airborne) fwd -= SLOPE_ACCEL * grade * dt;
                if (!airborne && !throttleKey && !brakeKey && Math.abs(fwd) < 2.5 && Math.abs(grade) < 0.22) fwd = 0;
                // Parking brake while away from the wheel (cabin / free cam / on foot).
                if (!readInput && Math.abs(fwd) < 4) fwd = 0;

                // Steering: lock shrinks with speed; yaw follows the wheelbase.
                // Negative fwd flips the yaw, so reversing steers realistically.
                //
                // The bicycle model alone is not enough at these speeds. Its
                // yaw rate is proportional to v while the lock only falls off
                // by a tenth of that, so the faster the camper went the harder
                // it turned: at liminal speed a touch of left or right threw it
                // round on the spot and the wheel was unusable. The turn is
                // held to what the surface can hold instead - a turn asks for
                // v * yawRate of lateral acceleration, and nothing under the
                // wheels will lend more than LAT_ACCEL_MAX of it - so steering
                // stays sharp where it is slow and opens into a long sweep
                // where it is fast, which is what a wheel does.
                if (Math.abs(fwd) > 0.4) {
                    const lock = MAX_STEER_LOCK / (1 + Math.abs(fwd) * STEER_FALLOFF);
                    let yawRate = (fwd / WHEELBASE) * Math.tan(this._steerSmooth * lock);
                    // The SURFACE's own grip, not the handbrake's: a rear axle
                    // locked on purpose is meant to bring the tail round, and
                    // capping the yaw with it would have taken the one turn a
                    // handbrake is pulled for.
                    const hold = LAT_ACCEL_MAX * Math.min(1, surf.grip / SURFACES.asphalt.grip);
                    const cap  = Math.min(2.2, hold / Math.max(1, Math.abs(fwd)));
                    yawRate = Math.max(-cap, Math.min(cap, yawRate));
                    this._driveAngle += yawRate * dt;
                }

                // Lateral slip decays with grip; the scrub also bleeds forward speed.
                const slip = Math.abs(lat);
                lat -= lat * Math.min(1, grip * dt);
                fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), slip * LAT_SCRUB * dt);
                this._slip01 = Math.min(1, slip / 26);

                // Recompose in the rotated heading frame and integrate the position.
                sin = Math.sin(this._driveAngle);
                cos = Math.cos(this._driveAngle);
                this._velX = fwd * sin + lat * cos;
                this._velZ = fwd * cos - lat * sin;
                // Velocity is in km/h; KMH_TO_UNITS scales it to world units/sec.
                this._vanX += this._velX * KMH_TO_UNITS * dt;
                this._vanZ += this._velZ * KMH_TO_UNITS * dt;
            }

            this._fwdSpeed = fwd;
            this._latSpeed = lat;
            this._speedKmh = Math.abs(fwd);
            this._brakeOn  = (brakeKey && fwd > -0.5) || handbrake;
        }

        // Tilt the chassis to the terrain underneath (nose up a climb, lean on
        // a camber). Applied to the group in YXZ order under the heading yaw.
        _alignToTerrain(delta, grounded) {
            let tp = 0, tr = 0;
            if (grounded) {
                const ts = WORLD_TILE_SIZE;
                const sin = Math.sin(this._driveAngle), cos = Math.cos(this._driveAngle);
                const H = (x, z) => this._terrain.getTerrainHeight(x / ts, z / ts);
                const dF = 9, dR = 5;
                const hF = H(this._vanX + sin * dF, this._vanZ + cos * dF);
                const hB = H(this._vanX - sin * dF, this._vanZ - cos * dF);
                const hR = H(this._vanX + cos * dR, this._vanZ - sin * dR);
                const hL = H(this._vanX - cos * dR, this._vanZ + sin * dR);
                tp = Math.max(-0.5, Math.min(0.5, -Math.atan2(hF - hB, dF * 2)));
                tr = Math.max(-0.5, Math.min(0.5,  Math.atan2(hR - hL, dR * 2)));
            }
            const k = Math.min(1, delta * 5);
            this._groundPitch += (tp - this._groundPitch) * k;
            this._groundRoll  += (tr - this._groundRoll)  * k;
            this._van.group.rotation.x = this._groundPitch;
            this._van.group.rotation.z = this._groundRoll;
        }

        // ---------------------------------------------------------------------
        // Driving into the scenery
        // ---------------------------------------------------------------------
        // A vehicle meets what is scattered on the ground differently from a
        // walker.
        //
        //   ROCKS are driven straight over. A boulder that stopped a camper dead
        //   in open country would make half the map undrivable, and a wheel is
        //   meant to ride things a boot cannot.
        //
        //   TREES come down. Above PROP_SMASH_KMH the trunk breaks: the tree is
        //   taken out of the world for good, the impact is felt through the
        //   camera and the vehicle, and splinters are thrown up. Below that
        //   speed the trunk holds and the vehicle is stopped by it, which is
        //   what nudging a tree at walking pace really does.
        //
        //   EVERYTHING ELSE - the barrels, the crates, the gravestones - is
        //   solid at any speed, the way it is on foot.
        _checkPropCollision(delta) {
            if (!this._terrain || !this._terrain.propsAt) return;
            if (this._flying || this._env === 'air' || this._isFastTravelActive()) return;
            // In a town a boosting vehicle is not there at all: nothing of the
            // place is destroyed and nothing of it stands in the way. It goes
            // straight through and the street is intact behind it.
            if (this._boostActive && this._inSettlement()) return;
            const ts = WORLD_TILE_SIZE;
            const tx = Math.floor(this._vanX / ts), tz = Math.floor(this._vanZ / ts);
            const kmh = Math.abs(this._speedKmh || 0);
            for (let j = -1; j <= 1; j++) {
                for (let i = -1; i <= 1; i++) {
                    const ch = this._terrain.propsAt(tx + i, tz + j);
                    if (!ch) continue;
                    const list = ch.grp.userData.props;
                    for (let k = list.length - 1; k >= 0; k--) {
                        const p = list[k];
                        if (p.kind === 'rock') continue;      // ridden over
                        if (this._flying || this._env === 'air' || this._airborne || (p.y != null && this._vanY > p.y + 22)) continue;
                        const R  = p.r + FOOT_VAN_HALF_LEN * 0.7;
                        const dx = this._vanX - (ch.px + p.x);
                        const dz = this._vanZ - (ch.pz + p.z);
                        const d2 = dx * dx + dz * dz;
                        if (d2 >= R * R) continue;
                        // A tree only comes down under turbo. Driven at
                        // normally it holds, however fast the approach was:
                        // scenery is not the vehicle's to flatten.
                        if (p.kind === 'tree' && this._boostActive && kmh >= PROP_SMASH_KMH) {
                            this._smashProp({ rec: p, chunk: ch, x: ch.px + p.x, y: p.y, z: ch.pz + p.z }, kmh);
                            continue;
                        }
                        // Held: pushed back out of it, and the speed taken out
                        // of whatever was carrying into it.
                        const d = Math.sqrt(d2) || 0.001;
                        const nx = dx / d, nz = dz / d;
                        this._vanX = ch.px + p.x + nx * R;
                        this._vanZ = ch.pz + p.z + nz * R;
                        const vn = this._velX * nx + this._velZ * nz;
                        if (vn < 0) {
                            this._velX -= vn * 1.2 * nx;
                            this._velZ -= vn * 1.2 * nz;
                            const sin = Math.sin(this._driveAngle), cos = Math.cos(this._driveAngle);
                            this._fwdSpeed = this._velX * sin + this._velZ * cos;
                            this._latSpeed = this._velX * cos - this._velZ * sin;
                            this._speedKmh = Math.abs(this._fwdSpeed);
                            if (this._crashTimer <= 0) this._crashTimer = 0.25;
                        }
                    }
                }
            }
        }

        // ---------------------------------------------------------------------
        // The bridge
        // ---------------------------------------------------------------------
        // The room inside the ship, and the counterpart of the camper's cabin.
        // It is only ever seen from inside: drawn in the chase camera it would
        // read as a box hanging through the hull, so the first-person views
        // switch it on and everything else switches it off.
        _setBridgeVisible(on) {
            if (this._bridge && this._bridge.group) this._bridge.group.visible = !!on;
        }

        /** True while what is being flown has a bridge to stand on. */
        _hasBridge() { return !!this._bridge; }

        /** The room the party is walking about in: the ship's bridge when they
         *  are aboard the ship, the camper's cabin otherwise. One answer, asked
         *  wherever the walk is bounded or the pilot's eye is placed. */
        _walkBounds() {
            return this._hasBridge() ? SHIP_BRIDGE_BOUNDS : CAMPER_BOUNDS;
        }

        /** Where the pilot's eye goes: the helm on a bridge, the driver's seat
         *  in anything with a windscreen. */
        _pilotSeat() {
            return this._hasBridge() ? SHIP_HELM_SEAT : DRIVER_SEAT;
        }

        // ---------------------------------------------------------------------
        // Setting a ship down
        // ---------------------------------------------------------------------
        // Flying used to be a cruise at a fixed clearance with no way down: the
        // only way out of the air was to switch flight off and drop. A pilot
        // brings a ship down instead - holds it lower and lower, slows, and at
        // walking pace a few metres up the ground simply takes it.
        //
        //   the climb/descend keys move the held clearance (see _updateFlyAlt)
        //   slow and low, and it lands (_checkShipTouchdown)
        //   flying again is the flight key, the way it always was
        _updateFlyAlt(delta) {
            if (this._flyAlt == null) this._flyAlt = 120 * WORLD_SCALE;
            if (!this._flying) return;
            let dir = 0;
            if (typeof Input !== 'undefined') {
                if (this._freeMoveKeys.has('Space') || Input.isPressed('ok')) dir -= 1;
                if (this._freeMoveKeys.has('KeyC') || Input.isPressed('pageup')) dir += 1;
            }
            if (dir) {
                this._flyAlt = Math.max(SHIP_FLY_MIN, Math.min(SHIP_FLY_MAX,
                    this._flyAlt + dir * SHIP_CLIMB_RATE * delta));
            }
        }

        // Low enough and slow enough: the ship is down. Only the ship lands this
        // way - a camper with the Flight module is a van that hovers, and
        // dropping it out of the air is what its own flight key is for.
        _checkShipTouchdown() {
            if (!this._flying || this._vehicleId !== 'starship') return false;
            if (Math.abs(this._speedKmh || 0) > SHIP_LAND_KMH) return false;
            if ((this._flyAlt || 0) > SHIP_LAND_CLEAR) return false;
            this._flying = false;
            this._dived = false;
            this._flyAlt = SHIP_FLY_MIN;
            this._landJolt = 0.5;
            if (typeof SoundManager !== 'undefined') SoundManager.playOk();
            if (window.ParchmentToast && window.ParchmentToast.show) {
                window.ParchmentToast.show(T('CamperDrive.shipTouchedDown'),
                    { severity: 'good', duration: 160 });
            }
            return true;
        }

        // Is this square somebody's? A settlement plan means laid-out lots,
        // streets and houses, which is the one place nothing may be broken.
        _inSettlement() {
            if (!this._planAt) return false;
            const ts = WORLD_TILE_SIZE;
            return !!this._planAt(Math.floor(this._vanX / ts), Math.floor(this._vanZ / ts));
        }

        /** Whether what is being driven can leave the ground at all: the ship
         *  and the broom fly because of what they are, the camper because of
         *  the Flight module bolted to it. */
        _canFly() {
            return !!(this._drive && this._drive.fly) || camperCan('fly');
        }

        // ---------------------------------------------------------------------
        // Driving into the ground itself
        // ---------------------------------------------------------------------
        // No vehicle rearranges the ground. Driven or flown into a wall of
        // rock, nothing is punched out of it: a GROUND VEHICLE simply grinds to
        // a halt against it like any other obstacle, and THE SHIP takes the
        // impact on its own hull - speed gone, the cabin thrown about, real
        // condition off its parts - while the mountain is left standing.
        _checkTerrainRam(delta) {
            if (this._ramCooldown > 0) this._ramCooldown -= delta;
            if (this._titleMode || this._footOnly || this._isFastTravelActive()) return;
            if (this._vehicleId !== 'starship') return;
            if (!this._terrain || !this._terrain.field) return;
            const kmh = Math.abs(this._speedKmh || 0);
            if (kmh < SHIP_RAM_KMH) return;
            if (this._ramCooldown > 0) return;

            // What is directly in front of the nose, a body length ahead.
            const reach = FOOT_VAN_HALF_LEN * 2.2;
            const ax = this._vanX + Math.sin(this._driveAngle) * reach;
            const az = this._vanZ + Math.cos(this._driveAngle) * reach;
            const ay = this._vanY;
            const S = VOX.SIZE;
            if (!this._terrain.field.isSolid(
                    Math.floor(ax / S), Math.floor(ay / S), Math.floor(az / S))) return;

            this._ramCooldown = SHIP_RAM_EVERY;
            this._onRammedTerrain(ax, ay, az, kmh);
        }

        // The hull's side of a ram: speed gone, the cabin thrown about, real
        // condition off the ship's parts, and the party told what it cost. The
        // mountain itself is untouched.
        _onRammedTerrain(x, y, z, kmh) {
            this._speedKmh = Math.max(0, kmh * 0.25);
            this._fwdSpeed *= 0.25; this._velX *= 0.25; this._velZ *= 0.25;
            this._crashTimer = Math.max(this._crashTimer, 0.8);
            this._terrainSmashFx(x, y, z, kmh, 1.0, 0.72, 0.3);
            if (typeof AudioManager !== 'undefined') {
                try { AudioManager.playSe({ name: 'Crash', volume: 92, pitch: 62, pan: 0 }); }
                catch (e) { /* the sound is not worth a crash of its own */ }
            }
            // The party's starship is the 'airship' of the repair system, which
            // is where its parts and their condition already live.
            const R = window.VehicleSystemRepair;
            if (R && typeof R.applyDamage === 'function') {
                const pct = Math.min(40, SHIP_RAM_DAMAGE * (0.5 + kmh / 600));
                R.applyDamage('airship', pct);
            }
            if (window.ParchmentToast && window.ParchmentToast.show) {
                window.ParchmentToast.show(T('CamperDrive.shipRammedTerrain'),
                    { severity: 'danger', duration: 180 });
            }
        }

        // Rock and dust thrown out of a hole punched in the ground.
        _terrainSmashFx(x, y, z, kmh, r, g, b) {
            if (!this._wheelFx) return;
            const n = Math.min(30, 10 + Math.floor(kmh * 0.06));
            for (let i = 0; i < n; i++) {
                const a = Math.random() * Math.PI * 2;
                const sp = 24 + Math.random() * 70;
                this._wheelFx.spawn(
                    x + (Math.random() - 0.5) * 14, y + 6 + Math.random() * 26,
                    z + (Math.random() - 0.5) * 14,
                    Math.cos(a) * sp, 30 + Math.random() * 60, Math.sin(a) * sp,
                    r, g, b, 0.3 + Math.random() * 0.4
                );
            }
        }

        // A tree taken down by a bumper: gone from the world, felt through the
        // wheel, and a shower of splinters where it stood.
        _smashProp(hit, kmh) {
            if (this._flying || this._env === 'air' || this._isFastTravelActive() || this._airborne || (hit && hit.y != null && this._vanY > hit.y + 22)) return;
            if (!this._terrain.fellProp(hit)) return;
            this._speedKmh = Math.max(0, this._speedKmh - kmh * 0.16);
            this._fwdSpeed *= 0.84; this._velX *= 0.84; this._velZ *= 0.84;
            this._crashTimer = Math.max(this._crashTimer, 0.35);
            if (this._wheelFx) {
                const n = Math.min(22, 8 + Math.floor(kmh * 0.12));
                for (let s = 0; s < n; s++) {
                    const a = Math.random() * Math.PI * 2;
                    const sp = 18 + Math.random() * 46;
                    this._wheelFx.spawn(
                        hit.x + (Math.random() - 0.5) * 8, hit.y + 8 + Math.random() * 22,
                        hit.z + (Math.random() - 0.5) * 8,
                        Math.cos(a) * sp, 28 + Math.random() * 50, Math.sin(a) * sp,
                        0.62, 0.44, 0.24, 0.3 + Math.random() * 0.4
                    );
                }
            }
            if (!this._titleMode) {
                try { AudioManager.playSe({ name: 'Crash', volume: 78, pitch: 80, pan: 0 }); }
                catch (e) { /* the sound is not worth a crash of its own */ }
            }
        }

        // Bump into pooled traffic: push the camper out of the overlap, reflect
        // its velocity off the car with some restitution, and rattle the camera.
        //
        // Only one thing out here costs the camper any condition: being DRIVEN
        // INTO another vehicle above TRAFFIC_CRASH_KMH. That is what the closing
        // speed along the contact normal measures, and nothing else is allowed
        // to stand in for it. A car that came into a stopped or passing camper,
        // a scrape along a queue, and every wall, bank, fence and crate the
        // bumper meets elsewhere in the scene are knocks: they are felt through
        // the camera, they cost speed, and they leave the parts alone.
        _checkTrafficCollision(delta) {
            if (this._crashCooldown > 0) { this._crashCooldown -= delta; return; }
            if (!this._traffic) return;
            for (const car of this._traffic._cars) {
                if (!car.active) continue;
                // Contact radius = the camper's own half-length plus the car's
                // mean half-extent, so a hatchback and a bus push back differently
                // instead of every vehicle sharing one oversized bubble.
                const R  = FOOT_VAN_HALF_LEN + (car.radius || 8);
                const dx = car.x - this._vanX;
                const dz = car.z - this._vanZ;
                const d2 = dx * dx + dz * dz;
                if (d2 > R * R) continue;
                const d  = Math.sqrt(d2) || 1;
                const nx = dx / d, nz = dz / d;
                this._vanX = car.x - nx * R;
                this._vanZ = car.z - nz * R;
                const vn = this._velX * nx + this._velZ * nz;
                if (vn > 0) {
                    this._velX -= vn * 1.55 * nx;
                    this._velZ -= vn * 1.55 * nz;
                }
                car.speed = Math.max(12, car.speed * 0.4);
                const sin = Math.sin(this._driveAngle), cos = Math.cos(this._driveAngle);
                this._fwdSpeed = this._velX * sin + this._velZ * cos;
                this._latSpeed = this._velX * cos - this._velZ * sin;
                this._speedKmh = Math.abs(this._fwdSpeed);
                this._crashTimer = 0.6;
                this._crashCooldown = 0.5;
                // The title background bumps silently: the title theme is playing.
                if (!this._titleMode) {
                    try {
                        AudioManager.playSe({ name: 'Blow1', volume: 90, pitch: 70, pan: 0 });
                    } catch (e) {
                        if (typeof SoundManager !== 'undefined') SoundManager.playBuzzer();
                    }
                }

                // Impact severity is the camper's OWN closing speed along the
                // contact normal (vn was the pre-bounce approach, and it points
                // from the camper at the car). A camper that was not going into
                // the car has no impact of its own, however fast it happened to
                // be travelling past it.
                let impact = vn > 0 ? vn : 0;
                const crash = impact > TRAFFIC_CRASH_KMH;

                // Silent DEX reflex save by vehicle driver, rolled only for a
                // real crash: there is nothing to save a nudge from.
                const driver = (typeof $gameParty !== 'undefined' && $gameParty.leader) ? $gameParty.leader() : null;
                const dexMod = driver ? Math.floor(((driver.agi || 10) - 10) / 2) : 0;
                const d20 = Math.floor(Math.random() * 20) + 1;
                const reflexSave = crash && ((d20 === 20) || (d20 !== 1 && (d20 + dexMod >= 13)));
                if (crash) {
                    if (reflexSave) impact = Math.max(4, impact * 0.25);
                    if (window.ParchmentToast && typeof window.ParchmentToast.show === 'function') {
                        const modStr = dexMod >= 0 ? `+${dexMod}` : `${dexMod}`;
                        window.ParchmentToast.show(
                            reflexSave
                                ? T('CamperDrive.driverSave.avoided', {
                                    roll: d20, mod: modStr, total: d20 + dexMod,
                                })
                                : T('CamperDrive.driverSave.failed', {
                                    roll: d20, mod: modStr, total: d20 + dexMod, dc: 13,
                                }),
                            { severity: reflexSave ? 'good' : 'danger', duration: 200 }
                        );
                    }
                }

                // Spark burst at the contact point, thrown up and outward.
                if (this._wheelFx) {
                    const cxp = this._vanX + nx * R * 0.5;
                    const czp = this._vanZ + nz * R * 0.5;
                    const bursts = Math.min(18, 6 + Math.floor(impact * 0.2));
                    for (let s = 0; s < bursts; s++) {
                        const a  = Math.random() * Math.PI * 2;
                        const sp = 20 + Math.random() * impact * 0.6;
                        this._wheelFx.spawn(
                            cxp + (Math.random() - 0.5) * 4, this._vanY + 6 + Math.random() * 4, czp + (Math.random() - 0.5) * 4,
                            Math.cos(a) * sp, 20 + Math.random() * 40, Math.sin(a) * sp,
                            1.0, 0.6 + Math.random() * 0.3, 0.15, 0.25 + Math.random() * 0.3
                        );
                    }
                }
                // Real mechanical damage on a solid hit (feature-detected, and
                // rate-limited by _crashCooldown so one bump = one damage roll).
                if (crash && !reflexSave && !this._titleMode && window.VehicleUpgrades &&
                    typeof window.VehicleUpgrades.applyDamage === 'function') {
                    window.VehicleUpgrades.applyDamage('camper', Math.min(16, impact * 0.22));
                    // ...and a hit that hard throws anybody sleeping in the back
                    // awake (VehicleCrew.js holds the nap).
                    if (window.VehicleCrew && window.VehicleCrew.wake) window.VehicleCrew.wake('crash');
                }
                break;
            }
        }

        // Touch a roaming BiomeEnemyManager animal: pull it out of the wildlife
        // pool and drop straight into a fight. The tactical map-battle layer is
        // never used out here (MapBattleMode.js turns itself off for as long as
        // this world is up): the fight is fought over the world itself, on the
        // frame the scene goes on drawing behind it. Never checked in title mode
        // or mid auto-travel (see the ftActive gate at the call site), and never
        // a fight at all where nothing fights (_noEncounters).
        _checkBioEnemyCollision() {
            if (!this._bioEnemies || this.isPaused()) return;
            if (this._pendingFought) return;
            if (this._msgWatch || this._pendingSay || this._pendingEmpathize) return;
            const ents = this._bioEnemies._ents;
            // On foot the party IS the walker, not the parked camper: what they
            // walk into is what they meet.
            const here = this._contactPoint();
            const R = (this._viewMode === 'foot' ? 6 : FOOT_VAN_HALF_LEN) + ENEMY_3D_CONTACT_R;

            // Determine player forward facing direction
            let fwdX = 0, fwdZ = -1;
            if (this._viewMode === 'foot' && this._fpc && this._fpc.yaw) {
                const yaw = this._fpc.yaw.rotation.y;
                fwdX = -Math.sin(yaw);
                fwdZ = -Math.cos(yaw);
            } else if (this._camera) {
                const dir = new THREE.Vector3();
                this._camera.getWorldDirection(dir);
                fwdX = dir.x;
                fwdZ = dir.z;
            }
            const fwdLen = Math.hypot(fwdX, fwdZ) || 1;
            fwdX /= fwdLen;
            fwdZ /= fwdLen;

            for (let i = ents.length - 1; i >= 0; i--) {
                const ent = ents[i];
                if (!ent.alive || !ent.root) continue;
                if (ent.dead) continue;              // a body is looted, not fought
                if (ent.spooked > 0) continue;       // it is running from the last fight
                const dx = ent.x - here.x, dz = ent.z - here.z;
                const distSq = dx * dx + dz * dz;
                if (distSq > R * R) continue;

                // Height check: if a flying enemy is still high in the sky, let it swoop down first
                const hereY = here.y != null ? here.y : (this._terrain ? this._terrain.getTerrainHeight(here.x / WORLD_TILE_SIZE, here.z / WORLD_TILE_SIZE) : 0);
                const entY = ent.y != null ? ent.y : hereY;
                if (ent.flies && Math.abs(entY - hereY) > 28) continue;

                // Trigger encounter only if enemy is in front of the player (forward vision cone)
                const dist = Math.sqrt(distSq);
                if (dist > 0.001) {
                    const dot = (dx * fwdX + dz * fwdZ) / dist;
                    if (dot < 0.2) continue; // Behind or to the side of the player
                }

                // Hit while driving: the party is behind a windscreen doing
                // eighty, not squaring up to anything. Whatever it was gets
                // shouldered out of the way and bolts, and no fight opens - a
                // battle you cannot see coming and did not choose is not a
                // battle, it is the road stopping for no reason.
                //
                // In a world where nothing fights (the Liminal World), that is
                // what a bump on foot comes to as well: the animal is knocked
                // clear and runs, so the creatures still react to being walked
                // into without a battle ever opening.
                if (this._noEncounters ||
                    (this._viewMode !== 'foot' && this._viewMode !== 'fp')) {
                    this._shoveBioEnemy(ent, here, R);
                    continue;
                }
                this._startBioEnemyBattle(ent);
                return;
            }
        }

        // Push a creature clear of whatever just drove into it and send it
        // running. Out to the far side of the contact circle, so the next frame
        // is not another collision with the same animal.
        _shoveBioEnemy(ent, here, R) {
            let dx = ent.x - here.x, dz = ent.z - here.z;
            let d = Math.hypot(dx, dz);
            if (d < 0.001) {
                // Dead centre under the bumper: shove it out sideways rather
                // than leaving a divide by zero to pick a direction.
                const yaw = this._driveAngle || 0;
                dx = Math.cos(yaw); dz = -Math.sin(yaw); d = 1;
            }
            const k = (R + 6) / d;
            ent.x = here.x + dx * k;
            ent.z = here.z + dz * k;
            ent.heading = Math.atan2(dz, dx);
            ent.spooked = Math.max(ent.spooked || 0, 6);
            if (ent.root) ent.root.position.x = ent.x, ent.root.position.z = ent.z;
        }

        // Where a town's own plan says its buildings stand. Cached per square:
        // the plan is deterministic, so it is worth keeping the one the party is
        // walking around rather than re-planning it every frame.
        _planAt(tx, tz) { return planForTile(tx, tz); }

        // Push a walker out of anything solid they have walked into: every
        // building of the town they are in, and the heavier bits of its
        // furniture. Returns the corrected position, or null where there is
        // nothing to walk into.
        _resolveSolids(x, z, r) {
            const ts = WORLD_TILE_SIZE;
            const tx = Math.floor(x / ts), tz = Math.floor(z / ts);
            const plan = this._planAt(tx, tz);
            // Omega Tower: solid base collision across its entire footprint
            if (this._omegaAt) {
                const half = (OMEGA_SPAN * ts) * 0.5;
                const ox = this._omegaAt.x, oz = this._omegaAt.z;
                const dx = x - ox, dz = z - oz;
                const hw = half + r, hd = half + r;
                if (Math.abs(dx) < hw && Math.abs(dz) < hd) {
                    if (hw - Math.abs(dx) < hd - Math.abs(dz)) {
                        x = ox + (dx < 0 ? -hw : hw);
                    } else {
                        z = oz + (dz < 0 ? -hd : hd);
                    }
                    return { x, z };
                }
            }
            // Out in open country there is no town to be pushed out of, but
            // there are still trees and boulders, and a walker goes round those
            // rather than through them.
            if (!plan) return this._resolveScatter(x, z, r);
            const ox = tx * ts + ts * 0.5, oz = tz * ts + ts * 0.5;
            let lx = x - ox, lz = z - oz;

            // A building whose inside is standing is not a block any more: it is
            // its own walls, with a doorway through them.
            const live = this._interiors ? this._interiors.liveLots(tx + ',' + tz) : null;
            let blocks = plan.solids;
            if (live && live.size) {
                blocks = [];
                for (let i = 0; i < plan.lots.length; i++) {
                    if (live.has(i)) continue;
                    const l = plan.lots[i];
                    blocks.push({ x: l.x, z: l.z, w: l.w, d: l.d });
                }
                const walls = this._interiors.wallRects(tx + ',' + tz, []);
                for (const w of walls) {
                    if (w.over) continue;                 // that one is the lintel
                    blocks.push({ x: w.x - ox, z: w.z - oz, w: w.w, d: w.d });
                }
            }

            // Buildings: rectangles, pushed out of along whichever side is
            // nearest. Several passes, always resolving the deepest one first:
            // a terrace has no gaps a person fits through, so being pushed out
            // of one house often lands you in its neighbour, and the pass has to
            // keep going until it reaches the street or the courtyard.
            for (let pass = 0; pass < 4; pass++) {
                let worst = null, worstPen = 0;
                for (const lot of blocks) {
                    const hw = lot.w * 0.5 + r, hd = lot.d * 0.5 + r;
                    const dx = lx - lot.x, dz = lz - lot.z;
                    if (Math.abs(dx) >= hw || Math.abs(dz) >= hd) continue;
                    const pen = Math.min(hw - Math.abs(dx), hd - Math.abs(dz));
                    if (pen > worstPen) { worstPen = pen; worst = lot; }
                }
                if (!worst) break;
                const hw = worst.w * 0.5 + r, hd = worst.d * 0.5 + r;
                const dx = lx - worst.x, dz = lz - worst.z;
                if (hw - Math.abs(dx) < hd - Math.abs(dz)) lx = worst.x + (dx < 0 ? -hw : hw);
                else                                        lz = worst.z + (dz < 0 ? -hd : hd);
            }
            // Round furniture worth bumping into.
            for (const p of plan.props) {
                const rad = SOLID_PROPS[p.kind];
                if (!rad) continue;
                const dx = lx - p.x, dz = lz - p.z;
                const d2 = dx * dx + dz * dz;
                const R = rad + r;
                if (d2 >= R * R) continue;
                const d = Math.sqrt(d2) || 0.001;
                lx = p.x + (dx / d) * R;
                lz = p.z + (dz / d) * R;
            }
            // ...and the trees and rocks standing between the houses.
            const out = this._resolveScatter(ox + lx, oz + lz, r);
            return out || { x: ox + lx, z: oz + lz };
        }

        // Pushed out of whatever is scattered on the ground here: the trees, the
        // boulders, the barrels of a biome's own furniture. Ground cover has no
        // radius at all and stops nobody. Returns null when nothing is in the
        // way, which is nearly every step anybody takes.
        _resolveScatter(x, z, r) {
            if (!this._terrain || !this._terrain.propsAt) return null;
            const ts = WORLD_TILE_SIZE;
            const tx = Math.floor(x / ts), tz = Math.floor(z / ts);
            let px = x, pz = z, moved = false;
            for (let j = -1; j <= 1; j++) {
                for (let i = -1; i <= 1; i++) {
                    const ch = this._terrain.propsAt(tx + i, tz + j);
                    if (!ch) continue;
                    for (const p of ch.grp.userData.props) {
                        const R = p.r + r;
                        const dx = px - (ch.px + p.x), dz = pz - (ch.pz + p.z);
                        const d2 = dx * dx + dz * dz;
                        if (d2 >= R * R) continue;
                        const d = Math.sqrt(d2) || 0.001;
                        px = ch.px + p.x + (dx / d) * R;
                        pz = ch.pz + p.z + (dz / d) * R;
                        moved = true;
                    }
                }
            }
            return moved ? { x: px, z: pz } : null;
        }

        // Which of the game's footstep materials is under the walker's foot.
        // The cube itself answers it - grass is grass, the road is concrete, the
        // cave floor is stone - so there is nothing to guess and no separate
        // table of "what a biome probably sounds like". Falls back to whatever
        // the surface guesser says only where the field has no answer (over the
        // sea, or before the ground under the party has been built).
        _stepMaterialAt(x, z, y) {
            const f = this._terrain && this._terrain.field;
            if (f && f.materialAt) {
                // The cube the foot is standing ON, which is the one under it.
                const S = (VOX && VOX.SIZE) || 5;
                const vx = Math.floor(x / S), vz = Math.floor(z / S);
                const vy = Math.floor((y - S * 0.5) / S);
                const m = f.materialAt(vx, vy, vz);
                const def = m ? MATERIALS[m] : null;
                const name = def && VOXEL_STEP_MATERIAL[def.key];
                if (name) return name;
            }
            const surf = this._surfaceAt(x, z);
            return surf === SURFACES.asphalt ? 'concrete'
                 : surf === SURFACES.sand   ? 'sand'
                 : surf === SURFACES.snow   ? 'snow'
                 : surf === SURFACES.rock   ? 'stone'
                 : surf === SURFACES.dirt   ? 'dirt' : 'grass';
        }

        // A footstep, in the voice of whatever is underfoot. Played through the
        // game's own step-sound table (window.Footsteps), so it is the same
        // library, the same variety and the same volume slider the 2D maps use;
        // the little three-sound banks in the core are only there for a build
        // where that table is missing.
        _footstep(sprint) {
            if (typeof AudioManager === 'undefined') return;
            const pos = this._fpc.getRig().position;
            const mat = this._stepMaterialAt(pos.x, pos.z, pos.y);
            const F = window.Footsteps;
            if (F && F.play && F.play(mat, { volume: sprint ? 100 : 78 })) return;
            const bank = STEP_SOUNDS[mat === 'concrete' ? 'stone'
                : mat === 'stone' ? 'rock'
                : STEP_SOUNDS[mat] ? mat : 'grass'] || STEP_SOUNDS.grass;
            AudioManager.playSe({
                name: bank[(Math.random() * bank.length) | 0], pan: 0,
                pitch: 92 + Math.random() * 16, volume: sprint ? 26 : 18
            });
        }

        // What the action key would do from where the party is standing: the
        // body at their feet, the person in front of them, or the camper they
        // stepped out of. Drawn under the crosshair, and it is the same order
        // _interact acts in.
        _updateActionPrompt() {
            if (!this._hud || !this._hud.setPrompt) return;
            const onFoot = this._viewMode === 'foot';
            if (!onFoot) { this._hud.setPrompt('', false); return; }
            // Ten times a second rather than sixty. Working out what the action
            // key would do walks the wildlife, the crowd, every prop on the nine
            // tiles round the party and the water in front of them, and a
            // prompt that appears a sixtieth of a second later than it could is
            // a prompt nobody can tell from an instant one.
            this._promptTick = (this._promptTick || 0) + 1;
            if (this._promptTick % PROMPT_EVERY !== 0) return;
            const here = this._contactPoint();
            const key = T('CamperDrive.prompt.key');
            let text = '';
            if (this._bioEnemies) {
                for (const ent of this._bioEnemies._ents) {
                    if (!ent.dead || !ent.corpse) continue;
                    const dx = ent.x - here.x, dz = ent.z - here.z;
                    if (dx * dx + dz * dz <= LOOT_RANGE * LOOT_RANGE) {
                        text = T('CamperDrive.prompt.loot', { key, name: ent.name });
                        break;
                    }
                }
            }
            if (!text && this._crowd) {
                const ped = this._crowd.nearest(here.x, here.z, TALK_RANGE);
                if (ped) text = T('CamperDrive.prompt.talk', { key, name: ped.name });
            }
            // A chest is what the key would open before it is anything else,
            // and it is the only prompt out here that says what is in it.
            if (!text) {
                const hit = this._chestUnderfoot();
                const Decor = window.VoxelWorld || {};
                const chest = hit && Decor.chestKindOf ? Decor.chestKindOf(hit.rec) : null;
                if (chest) text = T('CamperDrive.prompt.chest.' + chest.kind, { key });
            }
            // ...and the water in front of them, with a rod in the pack. The
            // ONE prompt fishing gets: no legend, no second line, nothing about
            // the water anywhere else.
            if (!text && this._canFishHere()) text = T('CamperDrive.prompt.fish', { key });
            if (!text && !this._footOnly) {
                const dx = here.x - this._vanX, dz = here.z - this._vanZ;
                if (dx * dx + dz * dz <= 60 * 60) text = T('CamperDrive.prompt.board', { key });
            }
            this._hud.setPrompt(text, true);
        }

        // A blow struck, or a shot fired, out in the world. Whatever is under
        // the crosshair when the weapon goes off is what the party has picked a
        // fight with, and the fight opens on the spot rather than waiting for
        // them to walk into it. How far that reaches is the weapon's own
        // <Range:> tag, the same number the tactical battle layer measures it
        // by: one step for a fist or a knife, a good deal more for a bow or a
        // gun.
        _weaponStrike(weapon) {
            if (this._viewMode !== 'foot' || !this._bioEnemies) return;
            if (this.isPaused()) return;
            if (this._pendingFought) return;
            const m = weapon && weapon.note && weapon.note.match(/<Range:\s*(\d+)\s*>/i);
            const steps = m ? Math.max(1, parseInt(m[1], 10)) : 1;
            // A swing reaches about as far as an arm; anything with reach on it
            // carries that reach in steps of the world's own grid.
            const range = Math.max(STRIKE_MIN_REACH, steps * STRIKE_STEP);
            // A thrown blow is aimed by the whole body; a shot is aimed down the
            // barrel, so the further a weapon reaches the tighter its arc.
            const halfAngle = steps > 2 ? 0.12 : 0.42;
            const here = this._contactPoint();
            const yaw = this._cameraYaw();
            const ent = this._bioEnemies.aimedAt(
                here.x, here.z, -Math.sin(yaw), -Math.cos(yaw), range, halfAngle);
            if (!ent) return;
            this._startBioEnemyBattle(ent);
        }

        // ---------------------------------------------------------------------
        // Riding along
        // ---------------------------------------------------------------------
        // Everybody who is not driving, drawn aboard the thing that is being
        // driven: in the seats of a camper, a car, a boat or a ship, and on
        // machines of their own beside a bike or a broom, which have one saddle
        // each and no room for a passenger.
        //
        // Returns true when it has placed them, so the caller knows the cards
        // are wanted on screen.
        _rideParty(camYaw, df) {
            if (!this._followers || !this._followers.count()) return false;
            const key = this._vehicleKey();
            const yaw = this._van.group.rotation.y;
            const seats = RIDE_ALONGSIDE[key]
                ? this._alongsideSeats(key, yaw)
                : this._seatsIn(key, yaw);
            if (!seats) return false;
            this._followers.ride(seats, yaw, camYaw, this._vanX, this._vanZ, df);
            return true;
        }

        // Which vehicle the party is aboard out here. Only the camper today;
        // the key is what everything about riding is keyed on, so the rest fall
        // into place as they become drivable.
        _vehicleKey() { return this._vehicleId || 'camper'; }

        // The seats of a vehicle, turned from its own frame into the world.
        _seatsIn(key, yaw) {
            const list = RIDER_SEATS[key];
            if (!list) return null;
            const sin = Math.sin(yaw), cos = Math.cos(yaw);
            return list.map(p => ({
                x: this._vanX + p.x * cos + p.z * sin,
                y: this._vanY + p.y,
                z: this._vanZ - p.x * sin + p.z * cos
            }));
        }

        // Two more bikes (or brooms) riding beside the leader's, one out to each
        // side and a little behind, with somebody on each. Anybody past the
        // second machine is not drawn: a party of four on four bicycles down a
        // lane reads as a peloton, and two is a pair of friends.
        _alongsideSeats(key, yaw) {
            const cfg = RIDE_ALONGSIDE[key];
            if (!cfg) return null;
            const sin = Math.sin(yaw), cos = Math.cos(yaw);
            const out = [];
            for (let i = 0; i < ALONGSIDE_MAX; i++) {
                const side = i % 2 === 0 ? -1 : 1;
                const rank = Math.floor(i / 2) + 1;
                const lx = side * cfg.spread * rank + cfg.seat.x;
                const lz = -cfg.back * rank + cfg.seat.z;
                out.push({
                    x: this._vanX + lx * cos + lz * sin,
                    y: this._vanY + cfg.seat.y,
                    z: this._vanZ - lx * sin + lz * cos
                });
            }
            this._syncAlongside(key, yaw, out);
            return out;
        }

        // The machines themselves, built as 2D billboard sprites for bike/broom
        // or out of the garage for others, and moved with the leader after that.
        _syncAlongside(key, yaw, seats) {
            const VM = window.VehicleModels;
            if (key !== 'bike' && key !== 'broom') {
                if (!VM) return;
                if (this._alongsideKey !== key) {
                    this._clearAlongside();
                    this._alongsideKey = key;
                    this._alongside = [];
                    for (let i = 0; i < ALONGSIDE_MAX; i++) {
                        const m = VM.build(key);
                        if (!m) break;
                        m.group.scale.multiplyScalar(VM.worldScale(key, m));
                        this._scene.add(m.group);
                        this._alongside.push(m);
                    }
                }
                const cfg = RIDE_ALONGSIDE[key];
                for (let i = 0; i < (this._alongside || []).length; i++) {
                    const m = this._alongside[i];
                    const seat = seats[i];
                    const show = i < (this._followers ? this._followers.count() : 0);
                    m.group.visible = show;
                    if (!show || !seat) continue;
                    m.group.position.set(seat.x, seat.y - (cfg ? cfg.seat.y : 0), seat.z);
                    m.group.rotation.y = yaw;
                    if (m.update) m.update((this._fxTime || 0));
                }
                return;
            }

            const isMagical = (window.VehicleSystem && window.VehicleSystem.isMagicalLeader)
                ? window.VehicleSystem.isMagicalLeader() : false;
            const sheet = (key === 'bike') ? 'Vehicles/!$BikeRiding'
                : (isMagical ? 'Vehicles/!$BroomStickRidingArcane' : 'Vehicles/!$BroomStickRiding');
            const len = (key === 'bike') ? 7 : 6;
            if (this._alongsideKey !== key) {
                this._clearAlongside();
                this._alongsideKey = key;
                this._alongside = [];
                for (let i = 0; i < ALONGSIDE_MAX; i++) {
                    const bb = new VehicleBillboard(sheet, len);
                    this._scene.add(bb.mesh);
                    this._alongside.push(bb);
                }
            }
            const camPos = this._camera.position;
            const camYaw = this._cameraYaw();
            for (let i = 0; i < (this._alongside || []).length; i++) {
                const bb = this._alongside[i];
                const seat = seats[i];
                const show = i < (this._followers ? this._followers.count() : 0);
                bb.setVisible(show);
                if (!show || !seat) continue;
                bb.yaw = yaw;
                bb.setPosition(seat.x, seat.y, seat.z);
                bb.setDaylight(this._dayFactor == null ? 1 : this._dayFactor);
                bb.update(camPos.x, camPos.z, camYaw);
                bb.faceCamera(camPos.x, camPos.z, camYaw);
            }
        }

        _clearAlongside() {
            if (!this._alongside) return;
            for (const m of this._alongside) {
                if (m.mesh) this._scene.remove(m.mesh);
                if (m.dispose) m.dispose();
            }
            this._alongside = null;
            this._alongsideKey = null;
        }

        // The body of whatever is being driven. The camper and the starship have
        // 3D models; all other vehicles (car, bike, boat, broom) are represented
        // with 2D counterpart billboards so the camper model is never drawn.
        _buildDrivenModel() {
            if (this._footOnly) {
                if (this._van && this._van.setVisible) this._van.setVisible(false);
                return;
            }
            if (this._vehicleId === 'camper') {
                if (this._van && this._van.setVisible) this._van.setVisible(true);
                return;
            }

            // The camper's own body must never be drawn when driving another vehicle.
            if (this._van && this._van.hideBody) this._van.hideBody();
            if (this._van && this._van.setVisible) this._van.setVisible(false);
            else if (this._van && this._van.group) this._van.group.visible = false;

            const VM = window.VehicleModels;
            if (this._vehicleId === 'starship') {
                if (!VM || !VM.has(this._vehicleId)) return;
                const m = VM.build(this._vehicleId);
                if (!m) return;
                m.group.scale.multiplyScalar(VM.worldScale(this._vehicleId, m));
                this._van.group.add(m.group);
                this._van.group.visible = true;
                this._drivenModel = m;
                // ...and the room inside it. Built at true size in the ship's
                // own frame (it is not scaled with the hull: the hull's own
                // model is drawn at whatever size read best, the bridge is a
                // room a person stands up in), and shown only from inside.
                if (VM.buildBridge) {
                    const br = VM.buildBridge();
                    if (br) {
                        this._van.group.add(br.group);
                        this._bridge = br;
                        this._setBridgeVisible(false);
                    }
                }
                return;
            }

            // For all other player vehicles (car, bike, boat, broom), render 2D counterpart:
            const isMagical = (window.VehicleSystem && window.VehicleSystem.isMagicalLeader)
                ? window.VehicleSystem.isMagicalLeader() : false;
            const VEHICLE_2D_DRIVEN = {
                car:   { sheet: 'Vehicles/!$Car_large', length: 18 },
                bike:  { sheet: 'Vehicles/!$BikeRiding', length: 7 },
                boat:  { sheet: 'Vehicles/!$Boat_large', length: 14 },
                broom: { sheet: isMagical ? 'Vehicles/!$BroomStickRidingArcane' : 'Vehicles/!$BroomStickRiding', length: 6 }
            };
            const cfg = VEHICLE_2D_DRIVEN[this._vehicleId];
            if (cfg) {
                const bb = new VehicleBillboard(cfg.sheet, cfg.length);
                this._scene.add(bb.mesh);
                this._driven2d = bb;
            }
        }

        // ---------------------------------------------------------------------
        // Out of the world altogether
        // ---------------------------------------------------------------------
        // A starship flown straight up does not stop at the top of the sky. Past
        // the atmosphere this world has nothing left to show, so it is closed:
        // the party is put aboard the ship where they would actually be - its
        // own interior - and the ship is left in orbit around whatever it took
        // off from, which is where the galaxy simulation picks it up.
        _checkLeavingAtmosphere() {
            if (this._vehicleId !== 'starship' || this._titleMode || this._standalone) return;
            if (this._leavingAtmosphere) return;
            if (this._vanY < SHIP_ATMOSPHERE_Y) return;
            this._leavingAtmosphere = true;

            // Climbing out of ANOTHER world's sky (a flyby) leaves the ship in
            // that world's orbit and touches nothing of Earth: the world map's
            // squares are not this planet's, and the party never landed here in
            // the first place.
            if (this._alien) {
                const planet = this._alien.planet;
                enterOrbitFromSurface(planet && (planet.label || planet.name));
                VoxelWorldSystem.stop();
                return;
            }

            // Where it lifted off from, so the world map knows where it went.
            const tileX = Math.max(0, Math.min(255, Math.floor(this._vanX / WORLD_TILE_SIZE)));
            const tileY = Math.max(0, Math.min(255, Math.floor(this._vanZ / WORLD_TILE_SIZE)));
            if (typeof $gameVariables !== 'undefined') {
                $gameVariables.setValue(43, tileX);
                $gameVariables.setValue(44, tileY);
            }
            if (window.VehiclePosition) {
                window.VehiclePosition.set('airship', WORLD_MAP_ID, tileX, tileY);
            }
            enterOrbitFromSurface();
            VoxelWorldSystem.stop();
        }

        // ---------------------------------------------------------------------
        // The Omega Tower
        // ---------------------------------------------------------------------
        // Six world squares of black stone and gold, a heap of art deco
        // skyscrapers piled deck on deck nearly five kilometres up, and the
        // whole point of it is that it can be seen coming.
        //
        // WHICH IS THE HARD PART. The camera clips at eight thousand units -
        // sixteen world squares - and the haze has eaten everything well before
        // that, so a landmark simply left where it stands is invisible from any
        // distance worth calling far. Past OMEGA_PROXY_D it is therefore drawn as
        // an ANGULAR PROJECTION of itself: the vector from the eye to the tower
        // is scaled down to that distance and the tower is scaled by the same
        // factor, so it covers exactly the same part of the sky as the real
        // thing would while sitting comfortably inside the view. Its materials
        // ignore the fog for the same reason. The result is a tower that reads
        // correctly from the next square and from the far side of the map.
        _buildOmegaTower() {
            if (typeof buildOmegaTower !== 'function') return;
            this._omega = buildOmegaTower(OMEGA_SPAN, OMEGA_HEIGHT);
            if (!this._omega) return;
            // Where it really is: the middle of its six-by-six footprint, laid
            // out around the square Destinations.json reserves for it.
            const ts = WORLD_TILE_SIZE;
            this._omegaAt = {
                x: (OMEGA_TILE.x - (OMEGA_SPAN / 2 - 1) + OMEGA_SPAN / 2) * ts,
                z: (OMEGA_TILE.y - (OMEGA_SPAN / 2 - 1) + OMEGA_SPAN / 2) * ts
            };
            this._omegaGroundY = null;
            this._scene.add(this._omega.group);
        }

        _updateOmegaTower() {
            if (!this._omega || !this._omegaAt) return;
            const g = this._omega.group;
            const at = this._contactPoint();
            // The gold comes up as the light goes: at noon it is a metal the sun
            // is on, at midnight it is the only thing burning on the horizon.
            if (this._omega.setNightGlow) {
                this._omega.setNightGlow(1 - (this._dayFactor == null ? 1 : this._dayFactor));
            }
            // The ground it stands on, once the terrain under it has been built
            // at least once. Until then it is put on the sea's own level, which
            // is close enough to see from far off and corrected the moment the
            // party gets near enough for it to matter.
            if (this._omegaGroundY === null || Math.hypot(at.x - this._omegaAt.x, at.z - this._omegaAt.z) < OMEGA_PROXY_D) {
                this._omegaGroundY = this._terrain.getTerrainHeight(
                    this._omegaAt.x / WORLD_TILE_SIZE, this._omegaAt.z / WORLD_TILE_SIZE);
            }
            const baseY = (this._omegaGroundY != null ? this._omegaGroundY : 0) + 35;
            const eye = this._camera.getWorldPosition(this._omegaEye || (this._omegaEye = new THREE.Vector3()));
            const dx = this._omegaAt.x - eye.x;
            const dz = this._omegaAt.z - eye.z;
            const dy = baseY - eye.y;
            const dist = Math.hypot(dx, dz);
            if (dist > OMEGA_SIGHT) { g.visible = false; return; }
            g.visible = true;
            // Near enough to walk up to: where it actually is, at its real size.
            if (dist <= OMEGA_PROXY_D) {
                g.position.set(this._omegaAt.x, baseY, this._omegaAt.z);
                g.scale.setScalar(1);
                return;
            }
            // Otherwise the same angle, brought inside the view.
            const k = OMEGA_PROXY_D / dist;
            g.position.set(eye.x + dx * k, eye.y + dy * k, eye.z + dz * k);
            g.scale.setScalar(k);
        }

        // ---------------------------------------------------------------------
        // The second player
        // ---------------------------------------------------------------------
        // Everything a walker needs is already built to be handed round: the
        // controller takes its input from wherever it is told (inputSource), and
        // the ground, the walls, the water and the wings are all questions the
        // scene answers rather than things the controller owns. So a second one
        // is the same wiring, twice.
        _startCoop() {
            const SS = window.$gameSplitScreen;
            if (!SS || !SS.active || typeof FirstPersonController !== 'function') return;
            const cam = new THREE.PerspectiveCamera(
                this._baseFov, window.innerWidth / window.innerHeight, 0.5, VIEW_FAR);
            const co = new CoopPlayer(this._scene, cam);
            co.fpc.inputSource = () => CoopPlayer.readInput();
            this._scene.add(co.fpc.getRig());
            // The same world the first player is walking: one set of answers,
            // so neither of them is standing on ground the other cannot see.
            co.fpc.setWorldMode(true, null, (gx, gz) => this._terrain.getTerrainHeight(gx, gz));
            co.fpc.solidAt   = (x, z, r) => this._resolveSolids(x, z, r);
            co.fpc.voxelSolid = (vx, vy, vz) => this._terrain.field.isSolid(vx, vy, vz);
            co.fpc.voxelSize  = VOX.SIZE;
            co.fpc.getCeilY  = (x, z, feetY) => this._ceilingOverhead(x, z, feetY);
            co.fpc.getWaterY = (x, z, y) => this._waterSurfaceAt(x, z, y);
            co.fpc.canFly    = () => false;   // the fly skill belongs to whoever leads
            co.fpc.eyeH      = FOOT_EYE;
            // Set down beside the first player, on the ground.
            const at = this._contactPoint();
            const rig = co.fpc.getRig();
            rig.position.set(at.x + 22, this._terrain.getTerrainHeight(
                (at.x + 22) / WORLD_TILE_SIZE, at.z / WORLD_TILE_SIZE) + FOOT_EYE, at.z);
            this._coop = co;
            this._refreshCoopBodies();
        }

        // What each player looks like to the other: the party member the
        // session handed Player 2, and whoever is leading for Player 1. Neither
        // is drawn in their own view - a first-person walker never sees their
        // own body - but the scene is drawn twice, so the two cards have to be
        // hidden and shown between the passes rather than simply left out.
        _refreshCoopBodies() {
            const co = this._coop;
            if (!co) return;
            const SS = window.$gameSplitScreen;
            const p2 = (SS && SS.p2Actor) ? SS.p2Actor() : null;
            const p1 = (typeof $gameParty !== 'undefined' && $gameParty.leader)
                ? $gameParty.leader() : null;
            const make = (actor, held) => {
                const sheet = actor && actor.characterName && actor.characterName();
                if (!sheet) return held;
                const idx = actor.characterIndex ? actor.characterIndex() : 0;
                if (held && held.sheet === sheet && held.index === idx) return held;
                if (held) held.dispose();
                const bb = new CharacterBillboard(sheet, idx, PERSON_H);
                this._scene.add(bb.mesh);
                return bb;
            };
            co.body = make(p2, co.body);
            this._leadBody = make(p1, this._leadBody);
        }

        // Walk the second player, and carry their body along with them.
        _updateCoop(delta) {
            const co = this._coop;
            if (!co) return;
            const SS = window.$gameSplitScreen;
            // The session ended under us (the menu closed it, a member was
            // handed back): the world goes back to one player and one view.
            if (!SS || !SS.active) { this._stopCoop(); return; }
            // Whoever the session handed Player 2 is not trailing the leader any
            // more: they are being walked. Asked here rather than when the world
            // opened, because the line of followers is built after this is, and
            // because the session can hand a different member over at any time.
            if (this._followers && this._followers.setSkipActor) {
                this._followers.setSkipActor(SS.p2ActorId ? SS.p2ActorId() : 0);
            }
            co.fpc.update(delta);
            const p = co.fpc.getRig().position;
            if (co.body) {
                co.body.mesh.position.set(p.x, p.y - FOOT_EYE + PERSON_H * 0.5, p.z);
                co.body.yaw = co.yaw() + Math.PI;
                const moved = Math.hypot(p.x - (co._lastX || p.x), p.z - (co._lastZ || p.z));
                co.body.moving = moved > 0.05;
                co.body.step += moved;
                co._lastX = p.x; co._lastZ = p.z;
            }
            // The first player's own body, for the second player to see. Only
            // while they are on their feet: aboard a vehicle they are in a seat,
            // and the riders are already drawn there.
            const onFoot = this._viewMode === 'foot';
            if (this._leadBody) {
                const a = this._fpc.getRig().position;
                this._leadBody.mesh.visible = onFoot && this._leadBody._sized;
                this._leadBody.mesh.position.set(a.x, a.y - FOOT_EYE + PERSON_H * 0.5, a.z);
                this._leadBody.yaw = this._cameraYaw() + Math.PI;
                const m = Math.hypot(a.x - (this._leadX || a.x), a.z - (this._leadZ || a.z));
                this._leadBody.moving = m > 0.05;
                this._leadBody.step += m;
                this._leadX = a.x; this._leadZ = a.z;
            }
            // One view or two. Hysteresis on the distance, or a pair standing
            // right on the line would flicker between the two every frame.
            const at = this._contactPoint();
            const d = Math.hypot(p.x - at.x, p.z - at.z);
            const driving = this._viewMode !== 'foot' && this._viewMode !== 'fp';
            const want = !driving && (this._splitNow ? d > SPLIT_MERGE_D : d > SPLIT_UNMERGE_D);
            if (want !== this._splitNow) {
                this._splitNow = want;
                if (this._hud && this._hud.setSplit) this._hud.setSplit(want);
            }
        }

        _stopCoop() {
            if (!this._coop) return;
            this._coop.dispose();
            this._coop = null;
            if (this._followers && this._followers.setSkipActor) this._followers.setSkipActor(0);
            if (this._leadBody) { this._leadBody.dispose(); this._leadBody = null; }
            this._splitNow = false;
            if (this._renderer) {
                this._renderer.setScissorTest(false);
                const w = this._renderer.domElement.width, h = this._renderer.domElement.height;
                this._renderer.setViewport(0, 0, w, h);
            }
            if (this._hud && this._hud.setSplit) this._hud.setSplit(false);
        }

        // Everything the party could do out here, stopped. Set the moment a
        // fight is committed to and lifted when the world is theirs again, so
        // there is no window where the world is still taking input for a party
        // that is already in a battle.
        _lockControls() {
            if (this._locked) return;
            this._locked = true;
            if (this._fpc) {
                if (this._fpc.clearMove) this._fpc.clearMove();
                this._fpc.deactivated = true;
            }
            if (this._tool && this._tool.setActive) this._tool.setActive(false);
            releasePointerLock();
        }

        // `force` hands the keys back even where they were never taken here: a
        // fight can be opened from a conversation, from a CYOA card or straight
        // off the 2D map underneath, and the walker has to be given its legs
        // back at the end of every one of those, not only the ones this scene
        // locked itself.
        _unlockControls(force) {
            if (!this._locked && !force) return;
            this._locked = false;
            if (this._fpc) {
                if (this._fpc.clearMove) this._fpc.clearMove();
                // Only the walking modes hand the walker back its legs; seated
                // at a wheel the controller is deactivated for its own reasons.
                if (this._viewMode === 'foot' || this._viewMode === 'fp' ||
                    this._viewMode === 'fpdrive' || this._footOnly) {
                    this._fpc.deactivated = false;
                }
            }
        }

        // Where the party actually stands in the 3D world.
        _contactPoint() {
            if (this._viewMode === 'foot') {
                const p = this._fpc.getRig().position;
                return { x: p.x, y: p.y, z: p.z };
            }
            return { x: this._vanX, y: this._vanY, z: this._vanZ };
        }

        // Open a fight against the touched creature's own troop. The world is
        // NOT put away for it: the scene keeps drawing and the frame it draws
        // is what the fight is fought over (see the battle view section below).
        _startBioEnemyBattle(ent) {
            if (this._noEncounters) return;
            const troopId = troopForBioEnemy(ent.enemyId);
            // Nothing to fight it with. Push it clear and let it bolt rather
            // than leaving it standing in the party's chest, asking for a fight
            // that can never open, once every frame.
            if (!troopId) { this._shoveBioEnemy(ent, this._contactPoint(), ENEMY_3D_CONTACT_R + 6); return; }
            this._pendingFought = ent;
            // Hands off the controls from this instant. The battle scene is a
            // frame or two away yet, and without this the party keeps walking
            // and keeps looking around through the handover, which reads as the
            // fight starting late and somewhere else.
            this._lockControls();
            // Turn to the thing that just walked into you before the first round
            // opens, so the fight is framed on it rather than on whatever the
            // party happened to be looking at.
            this._faceEntity(ent);
            releasePointerLock();

            // Fought as a persistent creature, exactly like a monster standing on
            // a map: it keeps the HP it was left with, it keeps the limbs that
            // were taken off it, and running away leaves it wounded rather than
            // whole (BattleSystemEnhanced.startPersistentBattle). The event id is
            // 0 because there is no map event behind this one; every path that
            // touches an event guards on it.
            const BSE = window.BattleSystemEnhanced;
            if (BSE && BSE.Functions && BSE.Functions.startPersistentBattle) {
                BSE.Functions.startPersistentBattle(troopId, ent.pid, 0, $gameMap.mapId());
                // A blocked or cooled-down battle never pushes the scene: come
                // straight back to the drive rather than waiting on a fight that
                // was never opened.
                if (!(SceneManager.isSceneChanging() || SceneManager._scene instanceof Scene_Battle)) {
                    this._pendingFought = null;
                    this._unlockControls();
                    // The fight was refused (blocked, on cooldown, nothing left
                    // of the troop). Without this the creature is still standing
                    // where it was, still touching the party, and the next frame
                    // asks for the same refused fight again: the view snaps onto
                    // it, the keys are taken and handed back, and the walk reads
                    // as a spin the party cannot get out of. It is shoved clear
                    // and spooked exactly as a creature that was walked into
                    // where nothing fights.
                    this._shoveBioEnemy(ent, this._contactPoint(),
                        (this._viewMode === 'foot' ? 6 : FOOT_VAN_HALF_LEN) + ENEMY_3D_CONTACT_R);
                }
                return;
            }
            BattleManager.setup(troopId, true, false);
            SceneManager.push(Scene_Battle);
        }

        // ---------------------------------------------------------------------
        // The fight, fought out here
        //
        // A battle opened in this world is not held somewhere else while the
        // world waits: the scene keeps drawing, and the frame it draws is what
        // the fight is fought over. VoxelWorldSystem hands this canvas to
        // Spriteset_Battle, which lays the troop, the HUD and every battle menu
        // straight on top of it, so the party fights the 3D creature on the
        // ground they met it on.
        //
        // While it runs: nobody walks, the pick and the held weapon are put
        // away (the fight draws its own), and the creature being fought steps
        // out of the scenery so it is not standing next to its own battler.
        // ---------------------------------------------------------------------
        beginBattleView() {
            if (this._battleWatch) return;
            this._battleWatch = true;
            this._battleSeen  = false;
            this._warpAmount  = 0;
            // A fight opened out of a conversation inherits the swap rather
            // than doing it twice; the flag goes, the canvas stays.
            this._mirrorWatch = false;
            // Where the page stood when the fight opened. Everything the fight
            // then puts on it - its command list, its skill panels, its target
            // rows - is the fight's, and is let go of again when it ends.
            this._battleDomMark = this._domMenus ? this._domMenus.mark() : 0;
            if (this._hud && this._hud.setHidden) this._hud.setHidden(true);
            if (this._overlay) this._overlay.style.display = 'none';
            if (this._fpc && this._fpc.clearMove) this._fpc.clearMove();
            if (this._tool) this._tool.setActive(false);
            // The weapon overlay is one layer, shared with the fight: the drive
            // lets go of it so the battle can put the party's own weapon in
            // frame there instead (CamperWeapon.suspendForBattle).
            CamperWeapon.suspendForBattle();
            releasePointerLock();

            this._drawForGameCanvas();

            const ent = this._pendingFought;
            if (ent && ent.root) ent.root.visible = false;
            if (ent && ent.plate) ent.plate.visible = false;
        }

        // ---------------------------------------------------------------------
        // Drawn INTO the game's own canvas
        //
        // The world is a DOM layer over the game's canvas, which is the right
        // way round for almost everything: menus, HUDs and toasts are DOM and
        // sit over it. The engine's OWN windows are not - a line of dialogue,
        // a choice list, a shop counter are drawn into the PIXI canvas
        // underneath, where the world hides them completely, and that canvas
        // cannot be made see-through (PIXI has it on alpha:false).
        //
        // So for as long as the engine has one of its windows to show, the
        // world swaps sides: it is drawn at the game's resolution, handed to
        // the spriteset as a sprite under everything else, and the DOM layer is
        // taken down. The window then draws over the world instead of instead
        // of it. The fight uses the very same swap.
        // ---------------------------------------------------------------------
        _drawForGameCanvas() {
            if (this._preGameCanvas) return;
            // The game's own resolution is a fraction of a full-screen window's,
            // and this frame is uploaded into a texture every tick, so drawing
            // it at window size would be paid for twice over.
            const el = this._renderer.domElement;
            this._preGameCanvas = {
                w: el.width, h: el.height,
                ratio: this._renderer.getPixelRatio(),
                aspect: this._camera.aspect
            };
            const bw = Math.max(1, Graphics.width), bh = Math.max(1, Graphics.height);
            this._renderer.setPixelRatio(1);
            this._renderer.setSize(bw, bh, false);
            this._camera.aspect = bw / bh;
            this._camera.updateProjectionMatrix();
        }

        _drawForWindow() {
            const pre = this._preGameCanvas;
            this._preGameCanvas = null;
            const ratio = pre ? pre.ratio : Math.min(window.devicePixelRatio || 1, 1.25);
            const w = (pre && pre.w) ? (pre.w / ratio) : window.innerWidth;
            const h = (pre && pre.h) ? (pre.h / ratio) : window.innerHeight;
            const aspect = (pre && pre.aspect) ? pre.aspect : (w / Math.max(1, h));
            this._renderer.setPixelRatio(ratio);
            this._renderer.setSize(w, h, false);
            this._camera.aspect = aspect;
            this._camera.updateProjectionMatrix();
        }

        // The fight is over: the world comes back to the window it was drawn in,
        // and whatever is left of the creature is settled (dead on the ground,
        // or alive and giving the party a wide berth).
        endBattleView() {
            // A fight that never swapped the canvas (it was opened and settled
            // before the battle scene was ever built) still took the controls on
            // its way in, so they are handed back here too.
            if (!this._battleWatch) {
                this._unlockControls(true);
                if (this._pendingFought) this._settleFoughtEnemy();
                return;
            }
            this._battleWatch = false;
            this._battleSeen  = false;
            this._drawForWindow();
            const ent = this._pendingFought;
            if (ent && ent.root) ent.root.visible = true;
            if (ent && ent.plate) ent.plate.visible = true;
            // The keys come back whatever the fight ended as. A win pops the
            // scene, a flee pops it just the same, and a run that was taken on
            // the very first round pops it before the party ever acted: the walk
            // has to be handed back on every one of those, so this is not asked
            // to remember whether it was the fight that took it away.
            this._unlockControls(true);
            // ...and nothing the fight left standing may go on reading as
            // something up over the world, or the walk is frozen and the mouse
            // stays out of reach with an empty screen to explain it. Every latch
            // a fight can be opened through is dropped, and the fight's own DOM
            // is let go of (see DomMenuGuard.releaseSince).
            this._menuOpen  = false;
            this._msgWatch  = false;
            this._msgGrace  = 0;
            this._stationRefuelWatch = false;
            if (this._domMenus) {
                this._domMenuOpen = this._domMenus.releaseSince(this._battleDomMark || 0);
            } else {
                this._domMenuOpen = false;
            }
            this._battleDomMark = 0;
            if (this._hud && this._hud.setHidden) this._hud.setHidden(false);
            if (this._overlay) this._overlay.style.display = '';
            if (this._fpc) {
                if (this._fpc.clearMove) this._fpc.clearMove();
                this._fpc.deactivated = false;
            }
            CamperWeapon.resumeFromBattle();
            CamperWeapon.refresh();
            if (this._followers) this._followers.refresh();
            if (this._pendingFought) this._settleFoughtEnemy();

            // Clear any engine input/player locks left over by the battle scene
            if (typeof $gamePlayer !== 'undefined' && $gamePlayer.unlock) $gamePlayer.unlock();
            if (typeof Input !== 'undefined' && Input.clear) Input.clear();
            if (typeof TouchInput !== 'undefined' && TouchInput.clear) TouchInput.clear();

            // The fight did not hand the party back to the map it was fought
            // on: a death, a game over, a teleport out of the world. Fall back
            // on the same wait the main menu uses - the world stays frozen and
            // out of frame until the map comes back, and gives up on it
            // altogether if the party has been taken off the world map.
            if (!(SceneManager._nextScene instanceof Scene_Map) &&
                !(SceneManager._scene instanceof Scene_Map) &&
                !(SceneManager._scene instanceof Scene_Battle)) {
                this._suspended = true;
                if (this._overlay) this._overlay.style.display = 'none';
            } else {
                this._suspended = false;
            }
        }

        // One frame of the world with the fight on top of it. Everything that
        // makes the place alive still runs - the light, the sea, the weather,
        // the traffic and the crowd - and everything that would move the party
        // or start a second fight does not.
        _updateBattleFrame(delta, tsec) {
            // Held on the creature that started it: a fight reads as a fight
            // when the camera is pointed at the thing you are fighting. The
            // rest of the frame is the same world-without-a-player a
            // conversation is held over.
            this._holdBattleAim(delta);
            this._updateQuietFrame(delta, tsec);
            this._drawBattleFrame();
        }

        // The fight's frame, drawn to the main renderer so the canvas texture
        // Spriteset_Battle samples is alive.
        _drawBattleFrame() {
            this._scene.overrideMaterial = null;
            this._renderer.render(this._scene, this._camera);
        }

        // The world, alive but taking nothing: everything that turns of its own
        // accord goes on turning, and nothing that answers to the player moves.
        // What a fight is drawn over, and what a conversation is held over.
        _updateQuietFrame(delta, tsec) {
            this._updateLightingAndSky(delta);
            const at = this._contactPoint();
            this._terrain.update(at.x, at.z);
            const _wt = (window.$gameWeather) ? window.$gameWeather.currentWeatherType : null;
            const _fx = (_wt === 'rain' || _wt === 'storm') ? 'rain' : _wt === 'snow' ? 'snow' : null;
            this._weatherFx.setWeather(_fx);
            this._weatherFx.update(at.x, at.z, delta);
            this._water.update(at.x, at.z, tsec);
            this._water.setVisible(this._terrain.seaNear && !this._underground);
            this._traffic.update(at.x, at.z, delta,
                this._dayFactor == null ? 1 : this._dayFactor, this._cameraYaw());
            if (this._parked) this._parked.update(delta, at.x, at.z);
            this._updateOmegaTower();
            if (this._crowd || this._followers) {
                const camYaw = this._cameraYaw();
                const df = this._dayFactor == null ? 1 : this._dayFactor;
                if (this._crowd) this._crowd.update(delta, at.x, at.z, camYaw, df);
                if (this._followers && this._viewMode === 'foot') {
                    const rig = this._fpc.getRig().position;
                    this._followers.update(delta, rig.x, rig.y - FOOT_EYE, rig.z, camYaw, df,
                        (x, z) => this._groundUnderfoot(x, z));
                }
            }
            this._underwaterFx.setActive(this._env === 'underwater');
            this._underwaterFx.update(at.x, at.y != null ? at.y : this._vanY, at.z, delta);
            this._renderFrame(tsec);
        }

        // An engine window has the party. The world changes sides and goes on
        // being drawn - under the window instead of over it - so a conversation
        // is held where it is happening rather than on a 2D map nobody is
        // standing on. Every path that waits on a window comes through here.
        _holdForWindow(delta, now) {
            this._enterMirrorView();
            this._updateQuietFrame(delta, now * 0.001);
        }

        // Swap the world onto the game's canvas for as long as an engine window
        // is over it, and back off it afterwards.
        _enterMirrorView() {
            if (this._mirrorWatch || this._battleWatch) return;
            this._mirrorWatch = true;
            this._drawForGameCanvas();
        }

        _leaveMirrorView() {
            if (!this._mirrorWatch) return;
            this._mirrorWatch = false;
            this._drawForWindow();
        }

        // Turn the eye onto a creature. Only meaningful on foot, where the rig
        // sits in the world and its yaw IS the direction the party is looking;
        // in the cabin and at the wheel the camera belongs to the camper.
        _faceEntity(ent) {
            if (!ent || this._viewMode !== 'foot' || !this._fpc) return;
            const p = this._fpc.getRig().position;
            const dx = ent.x - p.x, dz = ent.z - p.z;
            if (dx * dx + dz * dz < 1e-4) return;
            this._fpc.yaw.rotation.y = Math.atan2(-dx, -dz);
            this._fpc.pitch.rotation.x = 0;
        }

        // Keep it there while the fight runs, easing rather than snapping so a
        // creature that was knocked sideways does not jerk the view after it.
        _holdBattleAim(delta) {
            const ent = this._pendingFought;
            if (!ent || ent.dead || this._viewMode !== 'foot' || !this._fpc) return;
            const p = this._fpc.getRig().position;
            const want = Math.atan2(-(ent.x - p.x), -(ent.z - p.z));
            let d = want - this._fpc.yaw.rotation.y;
            while (d > Math.PI)  d -= Math.PI * 2;
            while (d < -Math.PI) d += Math.PI * 2;
            this._fpc.yaw.rotation.y += d * Math.min(1, delta * 3);
        }

        // Back from a fight with a roaming creature: the battle system deletes
        // its persistent record when nothing of it is left standing, so a record
        // that has gone means the thing is dead. Its model stays where it fell as
        // a body to be looted; anything that survived is still out there, wounded,
        // and gives the party a wide berth for a while.
        _settleFoughtEnemy() {
            const ent = this._pendingFought;
            this._pendingFought = null;
            if (!ent || !ent.alive) return;
            const here = this._contactPoint();
            const R = (this._viewMode === 'foot' ? 6 : FOOT_VAN_HALF_LEN) + ENEMY_3D_CONTACT_R;
            const BSE = window.BattleSystemEnhanced;
            const rec = BSE && BSE.State && BSE.State.persistentEnemyData
                ? BSE.State.persistentEnemyData[ent.pid] : null;
            if (rec) {
                ent.spooked = 12;
                this._shoveBioEnemy(ent, here, R + 35);
                return;
            }
            this._layOutBody(ent);
            const dx = ent.x - here.x, dz = ent.z - here.z;
            if (dx * dx + dz * dz < 100) {
                this._shoveBioEnemy(ent, here, 16);
            }
        }

        // Turn a defeated creature into a body on the ground: it stops moving,
        // rolls onto its side, loses its name plate and becomes something the
        // party can harvest (the same panel a 2D corpse opens).
        _layOutBody(ent) {
            ent.dead = true;
            ent.moveSpeed = 0;
            if (ent.plate && ent.plate.parent) ent.plate.parent.remove(ent.plate);
            ent.plate = null;
            if (ent.root) {
                ent.root.rotation.z = Math.PI * 0.42;
                const gy = this._terrain.getTerrainHeight(ent.x / WORLD_TILE_SIZE, ent.z / WORLD_TILE_SIZE);
                ent.root.position.set(ent.x, gy, ent.z);
            }
            // What the harvest panel reads: the species, and what the party has
            // already taken off this particular body.
            ent.corpse = { mapId: $gameMap.mapId(), x: 0, y: 0, enemyId: ent.enemyId, _harvestedParts: {} };
        }

        // A body within reach, if there is one: E opens the harvest panel over
        // the frozen scene.
        _lootBody() {
            if (!this._bioEnemies || this._viewMode !== 'foot') return false;
            if (typeof Scene_BodyPartHarvest === 'undefined') return false;
            const here = this._contactPoint();
            const R = LOOT_RANGE;
            for (const ent of this._bioEnemies._ents) {
                if (!ent.dead || !ent.corpse) continue;
                const dx = ent.x - here.x, dz = ent.z - here.z;
                if (dx * dx + dz * dz > R * R) continue;
                this._suspended = true;
                if (this._overlay) this._overlay.style.display = 'none';
                releasePointerLock();
                SceneManager.push(Scene_BodyPartHarvest);
                SceneManager.prepareNextScene(ent.corpse);
                return true;
            }
            return false;
        }

        // Wheel dust offroad, tyre smoke while drifting, exhaust chuffs under
        // hard throttle. Rate-limited to ~11 spawns per second (lighter than
        // before so the camper leaves a thin trail instead of a smoke screen).
        _emitWheelFx(delta) {
            if (!this._wheelFx) return;
            this._fxEmitAcc = (this._fxEmitAcc || 0) + delta;
            if (this._fxEmitAcc < 0.09) return;
            this._fxEmitAcc = 0;
            const sin = Math.sin(this._driveAngle), cos = Math.cos(this._driveAngle);
            const rearX = this._vanX - sin * 10;
            const rearZ = this._vanZ - cos * 10;
            const spd  = this._speedKmh;
            const surf = this._surface;
            const drifting = this._slip01 > 0.3;
            // Wheel dust only on loose surfaces above a decent clip, or when drifting.
            if (this._env === 'road' && spd > 25 && surf && (surf.dust || drifting)) {
                const c = surf.dust ? [0.62, 0.54, 0.4] : [0.75, 0.75, 0.78];
                for (const s of [-1, 1]) {
                    this._wheelFx.spawn(
                        rearX + cos * 5 * s, this._vanY + 1.2, rearZ - sin * 5 * s,
                        -sin * spd * 0.10 + (Math.random() - 0.5) * 5,
                        3 + Math.random() * 4,
                        -cos * spd * 0.10 + (Math.random() - 0.5) * 5,
                        c[0], c[1], c[2], 0.5 + Math.random() * 0.4
                    );
                }
            }
            // Exhaust chuffs only on hard acceleration, and only every other tick.
            this._exhaustTick = ((this._exhaustTick || 0) + 1) % 2;
            if (this._exhaustTick === 0 &&
                this._env === 'road' && this._throttle01 > 0.7 && this._rpm > 0.7) {
                this._wheelFx.spawn(
                    rearX - cos * 4, this._vanY + 2.5, rearZ + sin * 4,
                    (Math.random() - 0.5) * 2.5, 4 + Math.random() * 3, (Math.random() - 0.5) * 2.5,
                    0.35, 0.35, 0.37, 0.6
                );
            }
        }

        // A free walk has no vehicle dynamics at all. The walker is the centre of
        // the scene instead, so the camper's world position is simply kept on top
        // of the rig: terrain streaming, the weather, the sea, the traffic, the sun
        // and the minimap all read it and therefore all follow the walker.
        _updateFreeWalk() {
            this._env = this._footEnv();
            this._speedKmh = 0;
            this._speedUnitsSigned = 0;
            this._rpm = 0;
            this._gearLabel = 'N';
            this._stuck = false;
            this._stuckReason = '';

            const p = this._fpc.getRig().position;
            // Open water is swum, not refused (see FirstPersonController's
            // swimming). The last dry ground is still tracked: a walk that ends
            // out at sea washes the party ashore on the nearest land square
            // (_endWalkToWorldMap), since the 2D world map has no swimming in it.
            const ts = WORLD_TILE_SIZE;
            const tx = Math.floor(p.x / ts), tz = Math.floor(p.z / ts);
            if (getRenderType(sampleBiomeAt(tx, tz).name) !== 'water') {
                this._lastLandX = p.x;
                this._lastLandZ = p.z;
            }

            this._vanX = p.x;
            this._vanZ = p.z;
            this._vanY = p.y - (this._fpc.eyeH || FOOT_EYE);
            this._van.group.position.set(this._vanX, this._vanY, this._vanZ);
            this._syncWorldTile();
            this._checkBioEnemyCollision();
        }

        // Stop the party at the edge of a hand-made town, whichever way they
        // were getting about: walking, swimming, flying or driving all move a
        // position, and this puts that position back the moment it lands on a
        // square that town owns. Being stopped by it IS approaching it, so the
        // same press that walked them into it asks whether they are going in.
        _guardReservedSquares() {
            // Earth's hand-made towns are Earth's. Nothing on another world is
            // spoken for.
            if (this._titleMode || this._standalone || this._alien) return;
            const ts = WORLD_TILE_SIZE;
            const at = this._contactPoint();
            const wx = Math.floor(at.x / ts), wy = Math.floor(at.z / ts);
            this._placeAskT = Math.max(0, (this._placeAskT || 0) - 0.016);
            const place = reservedPlaceAt(wx, wy);
            if (!place) { this._lastFreeX = at.x; this._lastFreeZ = at.z; return; }

            const dir = travelDirName(this._lastFreeX, this._lastFreeZ, at.x, at.z);
            this._putBackOutside();
            if (this._placeAskT > 0) return;
            this._placeAskT = 2.5;
            this._offerPlaceVisit(place, dir);
        }

        // Back onto the last square that was theirs to stand on, with whatever
        // carried them there stopped dead so they are not ground against the
        // edge of the town for as long as the key is held.
        _putBackOutside() {
            if (this._viewMode === 'foot') {
                const p = this._fpc.getRig().position;
                p.x = this._lastFreeX;
                p.z = this._lastFreeZ;
                if (this._fpc.velocity) this._fpc.velocity.set(0, 0, 0);
            }
            this._vanX = this._lastFreeX;
            this._vanZ = this._lastFreeZ;
            this._velX = 0; this._velZ = 0;
            this._fwdSpeed = 0; this._latSpeed = 0;
            this._speedKmh = 0; this._speedUnitsSigned = 0;
            if (this._van && this._van.group) {
                this._van.group.position.set(this._vanX, this._vanY, this._vanZ);
            }
        }

        // "You are at the gate of X. Going in?" Yes ends this world and walks
        // the party through the town's own door, picked by the side they came
        // at it from; no leaves them standing outside it.
        _offerPlaceVisit(place, dir) {
            if (this.isPaused()) return;
            if (typeof $gameMessage === 'undefined' || $gameMessage.isBusy()) return;
            const door = window.WorldMapReturn.placeEntranceFor(place.entry, dir);
            if (!door) return;
            this._menuOpen = true;
            if (this._overlay) this._overlay.style.display = 'none';
            releasePointerLock();

            const name = place.name;
            $gameMessage.setChoices(
                [T('CamperDrive.place.visit', { place: name }), T('CamperDrive.place.keepGoing')], 1, 1);
            $gameMessage.setChoiceCallback((idx) => {
                this._menuOpen = false;
                if (idx !== 0) {
                    if (this._overlay) this._overlay.style.display = '';
                    return;
                }
                // The party's world coordinates are the town's own square: they
                // came off the world map there and that is where they come back
                // out (WorldMapReturn reads vars 43/44 for the way home).
                const sq = (place.entry.reservedTiles && place.entry.reservedTiles[0]) ||
                    (place.entry.base ? place.entry.base.x + ',' + place.entry.base.y : null);
                if (sq && typeof $gameVariables !== 'undefined') {
                    const parts = String(sq).split(',');
                    $gameVariables.setValue(43, parseInt(parts[0], 10));
                    $gameVariables.setValue(44, parseInt(parts[1], 10));
                }
                VoxelWorldSystem.stop();
                if (typeof $gamePlayer !== 'undefined') {
                    $gamePlayer.reserveTransfer(door.id, door.x, door.y, 0, 0);
                }
            });
        }

        // ---------------------------------------------------------------------
        // Under the ground
        // ---------------------------------------------------------------------
        // There are now three places to be, not two. On the surface; inside the
        // rock, which is a real 3D world of passages, chambers, shafts and (in
        // town) brick sewer galleries; and the 2D procedural underground, which
        // is where the world hands over once somebody has dug all the way to
        // the bedrock at the bottom of the voxel field.
        //
        // Dropping into a cave used to teleport the party out of the 3D world
        // after three cubes of digging, which meant the caves might as well not
        // have existed. Now the whole depth of the field is walkable and the 2D
        // map is only reached at the very bottom of it - and never from inside a
        // natural passage, however deep that passage runs, because walking the
        // deep road is not the same act as sinking a shaft through its floor.
        _updateUnderground() {
            if (this._standalone || this._titleMode || this._transitioningUnderground) return;
            const eye = (this._viewMode === 'foot' && this._fpc)
                ? this._fpc.getRig().position
                : { x: this._vanX, y: this._vanY + 6, z: this._vanZ };
            if (!this._terrain) return;

            // Ocean / sea water diving: keep diving in 3D without teleporting.
            const waterKind = this._terrain.waterKindAt(eye.x, eye.z);
            const waterTop = this._terrain.waterSurfaceAt(eye.x, eye.z);
            const isOceanOrSeaWater = (waterKind === 'sea' ||
                (waterTop !== null && eye.y <= waterTop && waterKind !== 'inland'));
            if (isOceanOrSeaWater) {
                this._setUnderground(false);
                return;
            }

            // Rock over their head is what makes a cave a cave: it is what the
            // light, the fog, the sky, the sea sheet and the roster all answer
            // to. Asked as "is there anything solid above me", not as "how far
            // down am I", so a trench somebody dug in a field is still a field
            // and a passage is a passage the moment its roof closes over.
            //
            // A deep open shaft counts too, and THAT is the one measured by
            // depth - with two thresholds rather than one, because each flip
            // rebuilds every tile round the camera and somebody standing in the
            // mouth of a sinkhole must not make it do that twice a second.
            const field = this._terrain.field;
            const roofed = field.roofY(eye.x, eye.z, eye.y) != null;
            const depth = field.blockTopAt(eye.x, eye.z) - eye.y;
            this._setUnderground(roofed || depth >
                (this._underground ? CAVE_LEAVE_DEPTH : CAVE_ENTER_DEPTH));

            // ...and the floor of the world is where it stops being a cave and
            // starts being the 2D map. A natural passage never counts, however
            // low it runs: only a hole somebody dug themselves gets that far.
            if (eye.y > UNDERGROUND_2D_Y) return;
            const S = VOX.SIZE;
            const inNatural = this._terrain.field.caveAt(
                Math.floor(eye.x / S), Math.floor(eye.y / S), Math.floor(eye.z / S));
            if (inNatural) return;
            this._enterUnderground2D();
        }

        // Flip the whole world between daylight and rock. The caves are only
        // meshed while somebody is inside them, so this is what builds them and
        // what takes them away again; it is deliberately edge-triggered because
        // each flip rebuilds the tiles around the camera.
        _setUnderground(on) {
            const want = !!on;
            if (this._underground === want) return;
            this._underground = want;
            if (this._terrain && this._terrain.setCavesVisible) {
                this._terrain.setCavesVisible(want);
            }
        }

        // Descending underground transfers to the 2D procedural map at the underground cave layer
        _enterUnderground2D() {
            if (this._transitioningUnderground) return;
            this._transitioningUnderground = true;

            let tileX = Math.max(0, Math.min(255, Math.floor(this._vanX / WORLD_TILE_SIZE)));
            let tileY = Math.max(0, Math.min(255, Math.floor(this._vanZ / WORLD_TILE_SIZE)));

            if (typeof $gameVariables !== 'undefined') {
                $gameVariables.setValue(43, tileX);
                $gameVariables.setValue(44, tileY);
                if (!this._footOnly && window.VehiclePosition) {
                    window.VehiclePosition.set('camper', WORLD_MAP_ID, tileX, tileY);
                }
            }

            // Stop the 3D scene cleanly
            VoxelWorldSystem.stop();

            // Prepare and initiate procedural underground descent
            if (typeof $gameSystem !== 'undefined' && $gameSystem) {
                if ($gameSystem.generateProceduralMap) {
                    $gameSystem.generateProceduralMap();
                }
                if (typeof PluginManager !== 'undefined' && PluginManager.callCommand) {
                    PluginManager.callCommand(null, 'WorldMapReturn', 'goDown', {});
                }
            }
        }

        // Keep the 2D world coordinates (vars 43/44) on the tile the 3D scene has
        // actually reached, writing only when the tile changes.
        _syncWorldTile() {
            if (this._titleMode || this._standalone) return;
            if (typeof $gameVariables === 'undefined') return;
            const tileX = Math.floor(this._vanX / WORLD_TILE_SIZE);
            const tileY = Math.floor(this._vanZ / WORLD_TILE_SIZE);
            if (tileX === this._lastSyncTileX && tileY === this._lastSyncTileY) return;
            this._lastSyncTileX = tileX;
            this._lastSyncTileY = tileY;
            $gameVariables.setValue(43, tileX);
            $gameVariables.setValue(44, tileY);
            // The camper's own record moves with it, square by square, rather
            // than only when the drive ends: a save taken mid-journey has to put
            // it back where it actually is. A free walk parks nothing - the
            // camper is wherever it was left.
            if (!this._footOnly && window.VehiclePosition) {
                window.VehiclePosition.set('camper', WORLD_MAP_ID, tileX, tileY);
            }
        }

        _updateMovement(delta) {
            if (this._footOnly) { this._updateFreeWalk(); return; }
            // Frozen while a water-rescue fade is in progress: hold the camper in
            // place until it has been teleported back onto land.
            if (this._waterRescue) {
                this._van.group.position.set(this._vanX, this._vanY, this._vanZ);
                return;
            }

            // Water crossing is always allowed while driving (the camper floats over
            // water even without the Amphibious upgrade); the consequence for having
            // no float upgrade is deferred to when the drive mode ends over water
            // (_endDriveToWorldMap splashes the camper down). So there is no longer a
            // "stranded in water" freeze here.

            // Clear the stuck flag (wedge / flip checks
            // below may re-raise it after the physics step).
            this._stuck = false;
            this._stuckReason = '';

            // Out of fuel (shared per-vehicle store with VehicleSystem, key
            // 'camper'): the camper can no longer move under power. Cancel any auto
            // travel and let it coast to a halt; throttle / boost are blocked until
            // refuelled.
            // The title background runs on its own tank: it neither reads nor
            // burns the save's fuel, so it can never strand itself.
            const fuelEmpty = !this._titleMode && camperFuelGet() <= 0;
            if (fuelEmpty) {
                const d = (typeof $gameSystem !== 'undefined' && $gameSystem.getFastTravelData)
                    ? $gameSystem.getFastTravelData() : null;
                if (d) d.timerActive = false;
            }

            const ftActive = !fuelEmpty && this._isFastTravelActive();
            const grounded = this._env === 'road';

            // Autopilot (title background): plans the route and works the wheel /
            // pedals, which _stepVehiclePhysics then reads instead of the keys.
            if (this._autopilot) this._autopilot.update(delta);

            // Resolve environment (road / air / water / underwater) and ease the
            // rig toward the matching ride height (snappier while grounded so the
            // camper hugs crests and dips instead of floating over them).
            const targetY = this._resolveEnv();
            this._fxTime = (this._fxTime || 0) + delta;

            if (ftActive) {
                // Auto travel hugs the ground (no ramp launches / no boost).
                this._airborne = false; this._vy = 0; this._boostActive = false;
                this._vanY += (targetY - this._vanY) * Math.min(1, delta * 4);
                // Liminal cruise: whichever is faster of the duration-guaranteed speed
                // (so a very long trip still arrives in time) and the flat warp-speed
                // cap, eased in over LIMINAL_ACCEL_SEC instead of snapping to it.
                // _speed / autoSpeed are in world units/sec, WORLD_SCALE times larger so
                // the fly-across-the-world fast travel still finishes within its
                // duration; the HUD / liminal / hand-back velocity are expressed in the
                // ORIGINAL km/h range (÷ WORLD_SCALE) so fast travel neither shows an
                // absurd speed nor trips the >130 km/h liminal overdrive, and manual
                // driving resumes at a normal speed.
                const cruiseKmh = Math.max(LIMINAL_TOP_KMH, this._speed / WORLD_SCALE);
                this._ftRampT = Math.min(LIMINAL_ACCEL_SEC, (this._ftRampT || 0) + delta);
                const rampT     = this._ftRampT / LIMINAL_ACCEL_SEC;
                const autoKmh   = cruiseKmh * (rampT * (2 - rampT));   // ease-out
                const autoSpeed = autoKmh * WORLD_SCALE;
                // Auto travel: fly in a straight line to the destination tile.
                const targetX = this._destWX * WORLD_TILE_SIZE + WORLD_TILE_SIZE * 0.5;
                const targetZ = this._destWY * WORLD_TILE_SIZE + WORLD_TILE_SIZE * 0.5;
                const dx = targetX - this._vanX;
                const dz = targetZ - this._vanZ;
                if ((dx * dx + dz * dz) > 16) {
                    this._driveAngle = Math.atan2(dx, dz);
                    this._vanX += Math.sin(this._driveAngle) * autoSpeed * delta;
                    this._vanZ += Math.cos(this._driveAngle) * autoSpeed * delta;
                }
                this._steerSmooth *= 0.9;
                this._speedKmh = autoKmh;   // HUD readout
                this._velX = Math.sin(this._driveAngle) * autoKmh;
                this._velZ = Math.cos(this._driveAngle) * autoKmh;
                this._fwdSpeed = autoKmh;
                this._latSpeed = 0;
                this._throttle01 = 0;
                this._gearLabel = 'D';
                this._rpm += (0.55 - this._rpm) * Math.min(1, delta * 3);
            } else {
                // Full physics everywhere else; input only in the driving views,
                // so a parked camper still rolls, slides and settles naturally.
                const driving = (this._viewMode === 'car' || this._viewMode === 'fpdrive');
                this._stepVehiclePhysics(delta, driving && !fuelEmpty, driving);
                this._updateRideHeight(delta, targetY, grounded);
            }

            this._van.group.position.set(this._vanX, this._vanY, this._vanZ);

            // The body tracks the physics heading directly; with slip, the
            // velocity vector is allowed to point somewhere else (drift).
            let hd = this._driveAngle - this._van.group.rotation.y;
            while (hd < -Math.PI) hd += Math.PI * 2;
            while (hd >  Math.PI) hd -= Math.PI * 2;
            this._van.group.rotation.y += hd * Math.min(1, delta * 14);

            // Chassis follows the terrain slope (nose up the climb, camber lean),
            // but levels out to flat flight while airborne off a ramp.
            this._alignToTerrain(delta, grounded && !ftActive && !this._airborne);

            // Settle the steering lean back to centre when not actively driving.
            if ((this._viewMode !== 'car' && this._viewMode !== 'fpdrive') || ftActive) {
                this._steerSmooth *= Math.max(0, 1 - delta * 6);
            }

            // The bumper as a plough, and ONLY under the liminal boost.
            //
            // Any camper with its foot down used to take a voxel bank apart just
            // by meeting it, so an ordinary drive across country left a trench
            // behind it: ground that came out in cubes and stayed out, nowhere
            // near anything the driver meant to dig. Holding Shift is the game
            // being asked - it is what already brings a tree down at speed, and
            // it is what turns the bumper back into a plough. Off the boost a
            // bank is a wall: the camper is stopped by it and backs out or goes
            // round, and the world is still standing behind it.
            const drivingNow = (this._viewMode === 'car' || this._viewMode === 'fpdrive');
            if (drivingNow && this._boostActive && !ftActive && !fuelEmpty &&
                this._throttle01 > 0.3) {
                this._ploughAhead(delta);
            }

            // Wedged: throttling hard but not moving (jammed against terrain).
            if (drivingNow && !ftActive && !fuelEmpty && this._throttle01 > 0.6 && this._speedKmh < 2) {
                this._wedgeTimer += delta;
            } else {
                this._wedgeTimer = 0;
            }
            if (!this._stuck && this._wedgeTimer > 1.6) {
                this._stuck = true;
                this._stuckReason = T('CamperDrive.wedged');
            }
            // Flipped onto its roof (rare in the arcade model, but a safety net).
            if (!this._stuck) {
                const up = this._vanUp || (this._vanUp = new THREE.Vector3());
                up.set(0, 1, 0).applyEuler(this._van.group.rotation);
                if (up.y < 0.25) { this._stuck = true; this._stuckReason = T('CamperDrive.flipped'); }
            }

            // ---- cosmetic body dynamics fed to the camper rig ----
            const ups   = this._fwdSpeed;
            const accel = (this._speedKmh - this._prevSpeedKmh) / Math.max(delta, 0.001);
            this._prevSpeedKmh = this._speedKmh;
            const speedFactor = Math.min(1, this._speedKmh / 160);
            this._odo += Math.abs(ups) * delta;
            this._speedUnitsSigned = ups;

            // Nose dives under braking, squats under acceleration.
            this._bodyPitch = Math.max(-BODY_PITCH_MAX, Math.min(BODY_PITCH_MAX, -accel * 0.0009));
            // Leans into the turn plus with any lateral slide.
            this._bodyRoll  = -this._steerSmooth * speedFactor * BODY_ROLL_MAX
                - Math.max(-1, Math.min(1, this._latSpeed / 30)) * 0.05;
            // Suspension rumble on the ground (rougher offroad via the surface's
            // bump factor and the seeded Perlin field); gentle swell afloat. The
            // rumble is muted while airborne (no wheels on the road).
            if (this._env === 'road' && !this._airborne) {
                const bump = this._surface ? this._surface.bump : 0;
                this._bodyBounce = Math.sin(this._odo * 0.05) * BODY_BOUNCE_MAX * speedFactor
                    + _perlin(this._odo * 0.09, 3.7) * bump * 1.1 * Math.min(1, this._speedKmh / 50);
            } else if (this._env === 'water') {
                this._bodyBounce = Math.sin(this._fxTime * 1.6) * 1.2;
            } else {
                this._bodyBounce = 0;
            }
            // Landing thud: a decaying suspension compression added on touchdown.
            if (this._landJolt > 0.001) {
                this._bodyBounce -= this._landJolt * 3.0;
                this._landJolt *= Math.max(0, 1 - delta * 5);
            }

            // Fender benders with the pooled traffic (never during auto travel).
            if (!ftActive && (this._env === 'road' || this._env === 'water')) {
                this._checkTrafficCollision(delta);
            }

            // ...and with the scenery: rocks ridden over, trees taken down, and
            // everything else stood off. Not while flying over it all, and not
            // on the autopilot, which is not steering round anything.
            // The pilot's hand on the altitude, and the ground taking the ship
            // once it is low enough and slow enough to be landing rather than
            // flying (see _updateFlyAlt / _checkShipTouchdown).
            this._updateFlyAlt(delta);
            this._checkShipTouchdown();

            if (!ftActive && this._env !== 'air') this._checkPropCollision(delta);

            // ...and with the ground itself: a boosting vehicle punches through
            // a wall of rock out in the country, and a ship flown into a
            // mountain takes the mountain down and its own hull with it.
            if (!ftActive) this._checkTerrainRam(delta);

            // Roaming wildlife: touching one drops straight into a battle (never
            // during the title's silent autopilot or auto-travel, and never in
            // the Liminal World, where _startBioEnemyBattle answers with nothing).
            if (!ftActive && !this._titleMode) {
                this._checkBioEnemyCollision();
            }

            // Wheel dust / tyre smoke / exhaust.
            this._emitWheelFx(delta);

            // Keep the 2D world coordinates (vars 43/44) in sync with the 3D
            // camper so the minimap and the world map agree. The title and
            // free-play drives roam a world nobody is playing, so they never move
            // the party's world position (see _syncWorldTile).
            this._syncWorldTile();

            // Remember the latest solid-ground spot so a no-float water entry can
            // bounce the camper back here. 'road' env only ever means dry land
            // (over-water-without-float returns early above; floating sets 'water').
            if (this._env === 'road') {
                this._lastLandX = this._vanX;
                this._lastLandZ = this._vanZ;
                this._lastLandAngle = this._driveAngle;
            }
        }

        // Ride height with ramp physics. Normally the rig eases onto the terrain,
        // but at speed a steep uphill crest launches it off the ground into a
        // ballistic arc: vertical velocity is thrown from the ramp angle & speed,
        // gravity pulls it back, and it lands (with a thud) when it meets the
        // ground again. The liminal boost throws it dramatically farther / higher.
        _updateRideHeight(delta, targetY, grounded) {
            if (grounded && !this._airborne &&
                this._speedKmh > LAUNCH_KMH && this._grade > LAUNCH_GRADE) {
                this._airborne = true;
                const over   = (this._speedKmh - LAUNCH_KMH) / 160;     // 0..~10
                const boostK = this._boostActive ? 2.4 : 1;            // boost = big air
                this._vy = Math.min(220, (34 + over * 80) * this._grade * 2.2 * boostK);
            }

            if (this._airborne) {
                // Lighter gravity under boost so a boosted launch sails for
                // kilometres before it comes back down.
                const g = (this._boostActive ? AIR_GRAVITY * 0.6 : AIR_GRAVITY) * gravityScale();
                this._vy -= g * delta;
                this._vanY += this._vy * delta;
                if (this._vanY <= targetY && this._vy <= 0) {
                    this._vanY = targetY;
                    this._airborne = false;
                    // Carry part of the impact into the suspension spring below,
                    // so a hard landing visibly compresses and rebounds.
                    this._suspVel = this._vy * 0.35;
                    this._vy = 0;
                    this._landJolt = Math.min(1, this._speedKmh / 130);
                }
            } else {
                // Damped suspension spring toward the ride height: the body loads
                // into dips and rebounds off crests with a little overshoot,
                // instead of gliding on an exponential ease. Substepped so the
                // explicit integration stays stable on long frames.
                const K = grounded ? 55 : 20;   // spring stiffness
                const D = grounded ? 11 : 9;    // damping
                const n = Math.max(1, Math.min(4, Math.ceil(delta / 0.033)));
                const dt = delta / n;
                let v = this._suspVel || 0;
                for (let i = 0; i < n; i++) {
                    v += ((targetY - this._vanY) * K - v * D) * dt;
                    this._vanY += v * dt;
                }
                this._suspVel = v;
            }
        }

        _updateFuel(delta) {
            if (this._titleMode) return;   // background drive: never burns the save's fuel
            if (this._footOnly) return;    // a walk burns nothing

            // Track position regardless of branch below, so a mode switch never
            // reads a stale last-position as a huge one-frame "moved" distance.
            const hadLast = this._fuelLastX !== undefined;
            const lastX = this._fuelLastX, lastZ = this._fuelLastZ;
            this._fuelLastX = this._vanX;
            this._fuelLastZ = this._vanZ;

            const ftActive = this._isFastTravelActive();
            if (ftActive) {
                // Liminal (fast-travel) drive: burn a flat, tiny rate per REAL
                // second, never by the (fictional) warp distance covered - see
                // the constants' own comment for why.
                const boostMul = this._boostActive ? LIMINAL_BOOST_FUEL_MULT : 1;
                camperFuelConsume(LIMINAL_FUEL_PER_SEC * boostMul * delta);
                return;
            }

            if (!hadLast) return;
            // Fuel burn is ALWAYS proportional to the ACTUAL distance the camper
            // moved this frame, measured from its real world position (not from a
            // speed value, which a physics glitch or NaN could inflate) and never
            // from elapsed time. This is inherently frame-rate independent: standing
            // still costs nothing, a metre always costs the same, and a teleport /
            // bad frame cannot spike the burn (see the per-frame cap below).
            const dxp = this._vanX - lastX;
            const dzp = this._vanZ - lastZ;
            const moved = Math.sqrt(dxp * dxp + dzp * dzp);
            if (!isFinite(moved) || moved <= 0) return;

            // Gentle efficiency penalty when pushing well past cruise (up to ~1.8x
            // at 999 km/h). The per-unit rate is minuscule to suit the large world
            // scale, so a full tank comfortably covers very long journeys.
            const spd       = isFinite(this._speedKmh) ? this._speedKmh : 0;
            const surcharge = 1 + Math.max(0, spd - CRUISE_KMH) * 0.0009;
            // Boosting (turbo) drinks fuel far faster: propelling the camper for
            // kilometres in a burst has a steep cost at the pump.
            const boostMul  = this._boostActive ? BOOST_FUEL_MULT : 1;
            // Hard ceiling per frame: a legitimate cruise burn is ~0.01 L. Boosting
            // burns far more, so the cap is lifted while boosting yet still guards
            // against a single teleport / bad frame draining the whole tank.
            const cap  = this._boostActive ? 0.6 : 0.05;
            const burn = Math.min(moved * FUEL_PER_UNIT * surcharge * boostMul, cap);

            if (!(burn > 0)) return;
            // Burn from the camper's own tank in the per-vehicle store (never a
            // shared RPG Maker variable), clamped to empty by VehicleFuel.
            camperFuelConsume(burn);
        }

        // How much of a step a vehicle drives UP rather than through. Two voxels
        // - ten world units, two and a half metres - because two blocks is what
        // a player builds: a step, a kerb, a ramp up onto a wall, a staircase
        // laid a block at a time. Anything up to that the suspension rides and
        // the body tilts onto, exactly as it rides a bank of earth; only a wall
        // that is genuinely taller than the vehicle's own nose is ploughed.
        // (The ride height itself is a spring on the terrain under the wheels,
        // so nothing extra is needed to climb it - it only has to not be
        // destroyed first, which is what this number decides.)
        // Cubes taken out by the front of the camper when it is driven into a
        // bank. Only ever what is directly ahead and only when the ground there
        // actually stands proud of the ground under the wheels, so a hill climb
        // is still a hill climb and not a tunnel.
        _ploughAhead(delta) {
            if (!this._tool || this._footOnly) return;
            this._ploughCd = (this._ploughCd || 0) - delta;
            if (this._ploughCd > 0) return;
            const ts    = WORLD_TILE_SIZE;
            const sin   = Math.sin(this._driveAngle), cos = Math.cos(this._driveAngle);
            const reach = FOOT_VAN_HALF_LEN * 2.4;
            const nx    = this._vanX + sin * reach;
            const nz    = this._vanZ + cos * reach;
            const here  = this._terrain.getTerrainHeight(this._vanX / ts, this._vanZ / ts);
            const there = this._terrain.getTerrainHeight(nx / ts, nz / ts);
            // A step the suspension could ride is not a bank. Two blocks of it
            // is a ramp somebody built to be driven up, and it is left standing.
            if (there - here < VOX.SIZE * (VEHICLE_STEP_UP + 0.4)) return;
            const n = this._tool.plough(nx, here + VOX.SIZE * 1.3, nz, VOX.SIZE * 2.4);
            if (!n) return;
            this._ploughCd = 0.11;
            const bleed = Math.max(0.55, 1 - n * 0.018);
            this._velX *= bleed;
            this._velZ *= bleed;
        }

        // ---------------------------------------------------------------------
        // Digging
        //
        // The crosshair is the camera's own axis, so what the tool works on is
        // simply the first cube down the middle of the view. Nothing else in
        // the scene has to know about it.
        // ---------------------------------------------------------------------
        _updateDigging(delta) {
            if (!this._tool) return;
            const live = this._viewMode === 'foot' && !this._menuOpen &&
                         !this._suspended && !this._stationRefuelWatch;
            // The pick only works the world while the block bar is the one up:
            // with items or spells in hand the swing is a use or a cast, not a
            // blow against the rock.
            const onBlocks = this._tool.onBlocks;
            this._tool.setActive(live && onBlocks);
            if (!live) {
                this._placeReq = false;
                this._cycleReq = 0;
                this._castReq = false;
                if (this._caster) this._caster.aim(null, null, false);
                if (this._hud && this._hud.setDigReadout) this._hud.setDigReadout('', '', 0);
                if (this._hud && this._hud.setBlockBar) this._hud.setBlockBar(null);
                return;
            }

            this._digOrigin = this._digOrigin || new THREE.Vector3();
            this._digDir    = this._digDir    || new THREE.Vector3();
            this._camera.getWorldPosition(this._digOrigin);
            this._camera.getWorldDirection(this._digDir);

            // R1 on a pad swings the same way the mouse button does, so it digs
            // the same way too.
            const padDig = (typeof Input !== 'undefined' && Input.isPressed &&
                            Input.isPressed('pagedown'));
            // L1 is the bar itself: one press walks blocks -> spells -> items,
            // the pad's Tab. It used to step along the cells of whichever bar
            // was up and the bars themselves were on L2, which left the two
            // shoulder buttons doing halves of the same job and the triggers,
            // which are the camera's, doing a third. The cells are stepped with
            // the d-pad now (below), so one button answers each question.
            if (typeof Input !== 'undefined' && Input.isTriggered &&
                Input.isTriggered('pageup')) {
                this._cycleBarMode(1);
            }

            // UP and DOWN on the d-pad run along the cells of the bar in hand,
            // the pad's answer to the wheel and to the number keys. Read raw:
            // core folds the left stick into those same directions, and a walk
            // must not step the bar.
            const ASI = window.AnalogStickInput;
            if (ASI && ASI.hasPad && ASI.hasPad() && ASI.isButtonPressed && ASI.BUTTON) {
                const was  = this._padBarWas || {};
                const up   = ASI.isButtonPressed(ASI.BUTTON.DPAD_UP);
                const down = ASI.isButtonPressed(ASI.BUTTON.DPAD_DOWN);
                if (up && !was.up)     this._cycleReq = -1;
                if (down && !was.down) this._cycleReq =  1;
                this._padBarWas = { up: up, down: down };
            } else {
                this._padBarWas = null;
            }

            this._tool.update(delta, onBlocks ? {
                origin: this._digOrigin,
                dir:    this._digDir,
                dig:    this._digHeld || padDig,
                place:  this._placeReq,
                cycle:  this._cycleReq
            } : null);

            // Items and spells: the same swing, doing what is in hand instead.
            if (!onBlocks) this._useHeldBar(this._digHeld || padDig, this._cycleReq);
            if (this._caster) {
                this._caster.aim(this._digOrigin, this._digDir,
                    this._tool.barMode === 'spells');
                this._caster.update(delta);
            }

            this._placeReq = false;
            this._cycleReq = 0;
            this._castReq = false;

            if (this._hud && this._hud.setDigReadout) {
                this._hud.setDigReadout(onBlocks ? this._tool.targetName : '',
                    onBlocks ? this._tool.selectedName : '', this._tool.progress);
            }
            // The quick bar along the bottom: whichever of the three is up.
            if (this._hud && this._hud.setBlockBar) {
                this._hud.setBlockBar(this._barRows());
            }
        }

        // ---------------------------------------------------------------------
        // The three quick bars
        // ---------------------------------------------------------------------
        // What the strip along the bottom is showing right now. Blocks is the
        // tool's own readout; the other two are views onto what the game already
        // keeps (the map's item favourites, the leader's battle loadout), so
        // nothing out here holds an inventory of its own.
        _barRows() {
            if (!this._tool) return null;
            const mode = this._tool.barMode;
            if (mode === 'blocks') return this._tool.bar.readout(this._tool.weaponName);
            if (mode === 'spells') return this._caster ? this._caster.readout() : null;
            const IH = window.ItemHotbar;
            if (!IH || !IH.itemAt) return null;
            const sel = this._itemSlot || 0;
            const rows = [];
            for (let i = 0; i < SPELL_SLOTS; i++) {
                const item = IH.itemAt(i);
                if (!item) { rows.push(null); continue; }
                const count = $gameParty.numItems(item);
                rows.push({
                    item: true, on: i === sel, iconIndex: item.iconIndex,
                    count, enabled: count > 0, name: item.name
                });
            }
            return rows;
        }

        // The legend sheet (Map/MapLegend.js) used to teach this world a block
        // of control rows, lit as each control was first used; it carries its
        // notices alone now, so there is nothing to tell. The calls are left
        // standing rather than picked out of every control in the world.
        _teachControl(id) {
        }

        // Tab / L2. The bar the party is holding changes, and the world is told
        // which one in a line of its own rather than by the strip quietly
        // becoming something else.
        _cycleBarMode(dir) {
            if (!this._tool) return;
            this._teachControl('voxBar');
            const mode = this._tool.cycleBarMode(dir);
            if (typeof SoundManager !== 'undefined') SoundManager.playCursor();
            if (window.ParchmentToast && window.ParchmentToast.show) {
                window.ParchmentToast.show(T('VoxelWorld.bar.' + mode));
            }
        }

        // A number key, whichever bar is up.
        _selectBarSlot(index) {
            if (!this._tool) return;
            this._teachControl('voxSlot');
            const mode = this._tool.barMode;
            if (mode === 'blocks') { this._tool.bar.select(index); return; }
            if (mode === 'spells') { if (this._caster) this._caster.select(index); return; }
            this._itemSlot = Math.max(0, Math.min(SPELL_SLOTS - 1, index));
        }

        // The swing, with something other than a block in hand: an item is used
        // on the spot, a spell is thrown down the crosshair.
        _useHeldBar(pressed, cycle) {
            const mode = this._tool.barMode;
            if (cycle) {
                if (mode === 'spells' && this._caster) this._caster.cycle(cycle);
                else if (mode === 'items') {
                    const IH = window.ItemHotbar;
                    const next = IH && IH.stepSlot ? IH.stepSlot(this._itemSlot || 0, cycle) : -1;
                    if (next >= 0) this._itemSlot = next;
                }
            }
            if (!pressed || this._barHeld) { this._barHeld = pressed; return; }
            this._barHeld = true;
            if (mode === 'spells') {
                if (this._caster) this._caster.cast(this._digOrigin, this._digDir);
                return;
            }
            const IH = window.ItemHotbar;
            if (IH && IH.use) IH.use(this._itemSlot || 0);
        }

        // Where a spell landed. The crater is the caster's own business (it
        // knows the formula); this is the half only the scene can answer: who
        // was standing in it. A creature caught in the blast is not damaged - no
        // turn has been taken and nothing out here has hit points - it turns
        // round and the fight opens, which is what casting across a valley is
        // FOR: picking a fight before the thing has seen you.
        _spellBurst(x, y, z, radius, force, skill) {
            if (!this._bioEnemies || this._pendingFought) return;
            if (this._noEncounters || isHealingSkill(skill)) return;
            const ents = this._bioEnemies._ents || [];
            for (const ent of ents) {
                if (!ent.alive || !ent.root || ent.dead) continue;
                const dx = ent.x - x, dz = ent.z - z;
                if (dx * dx + dz * dz > radius * radius) continue;
                this._startBioEnemyBattle(ent);
                return;
            }
        }

        // Persist the world's dug cubes. Called when the scene closes, so a
        // tunnel is still there the next time anybody walks this square.
        _saveVoxelEdits() {
            // A planet's ground is not Earth's: a trench dug on one must not turn
            // up in a field at home.
            if (this._alien) return;
            if (this._titleMode || typeof $gameSystem === 'undefined' || !$gameSystem) return;
            if (!this._terrain || !this._terrain.field) return;
            const edits = this._terrain.field.edits;
            VoxelWorldState.setDug(edits.count ? edits.save() : null);
            // The savegame's own copy was where this used to live; a world that
            // has been written to its own folder does not need it any more.
            if ($gameSystem._voxelWorldEdits) delete $gameSystem._voxelWorldEdits;
        }

        _isDeveloperMode() {
            return (typeof Utils !== 'undefined' && Utils.isOptionValid && Utils.isOptionValid('test')) ||
                   (typeof $gameTemp !== 'undefined' && $gameTemp && $gameTemp.isPlaytest && $gameTemp.isPlaytest()) ||
                   (typeof $gameSystem !== 'undefined' && $gameSystem && $gameSystem._isSandboxMode) ||
                   isSandboxOrTest();
        }

        toggleSolomonRitual() {
            if (!this._solomon) return;
            const on = this._solomon.toggle();
            if (on) {
                if (typeof AudioManager !== 'undefined' && AudioManager.playSe) {
                    AudioManager.playSe({ name: 'Thunder1', volume: 100, pitch: 70, pan: 0 });
                }
                if (this._hud && this._hud.showToast) {
                    this._hud.showToast('THE SOLOMON RITUAL HAS BEGUN');
                }
            } else {
                if (typeof AudioManager !== 'undefined' && AudioManager.playSe) {
                    AudioManager.playSe({ name: 'Collapse1', volume: 75, pitch: 120, pan: 0 });
                }
                if (this._hud && this._hud.showToast) {
                    this._hud.showToast('Solomon Ritual Dismissed');
                }
            }
        }

        // Taking the world down must never be able to half-finish. Every step
        // below is somebody else's teardown, and one of them throwing used to
        // leave the LAST step - the overlay, and the hands still on it - up on
        // the page, over whatever scene came next: the title screen with the
        // walk still under the player's control. The page is cleared in the
        // finally, so a failed step costs that step and nothing else.
        dispose() {
            try {
                this._disposeInner();
            } catch (e) {
                console.error('[VoxelWorld] dispose', e);
            } finally {
                if (this._animId) { cancelAnimationFrame(this._animId); this._animId = null; }
                try { releasePointerLock(); } catch (e) { /* nothing held it */ }
                if (this._overlay && this._overlay.parentNode) {
                    this._overlay.parentNode.removeChild(this._overlay);
                }
                this._overlay = null;
            }
        }

        _disposeInner() {
            // The world is going: nothing is on the game's canvas any more, so
            // the map's spriteset takes its mirror down on its next tick.
            this._mirrorWatch = false;
            this._battleWatch = false;
            // Whatever world this was, the next one is Earth again until it says
            // otherwise.
            if (this._alien) setBiomeOverride(null);
            setAlienTerrain(null);
            setGravityScale(1);
            VoxelWorldState.setEnabled(true);
            this._saveVoxelEdits();
            if (this._tool) { this._tool.dispose(); this._tool = null; }
            if (this._caster) { this._caster.dispose(); this._caster = null; }
            if (this._spellFx) { this._spellFx.dispose(); this._spellFx = null; }
            if (this._onDigDown) {
                document.removeEventListener('mousedown', this._onDigDown);
                document.removeEventListener('mouseup',   this._onDigUp);
                this._onDigDown = this._onDigUp = null;
            }
            if (this._animId) cancelAnimationFrame(this._animId);
            if (this._fadeTimer) { clearTimeout(this._fadeTimer); this._fadeTimer = null; }
            CamperWeapon.end();
            document.removeEventListener('wheel',     this._onWheel);
            document.removeEventListener('keydown',   this._onFreeCamKeyDown);
            document.removeEventListener('keyup',     this._onFreeCamKeyUp);
            document.removeEventListener('mousedown', this._onFreeCamMouseDown);
            document.removeEventListener('mouseup',   this._onFreeCamMouseUp);
            document.removeEventListener('mousemove', this._onFreeCamMouseMove);
            if (this._onTitleLookDown) {
                document.removeEventListener('pointerdown',   this._onTitleLookDown);
                document.removeEventListener('pointermove',   this._onTitleLookMove);
                document.removeEventListener('pointerup',     this._onTitleLookUp);
                document.removeEventListener('pointercancel', this._onTitleLookUp);
                this._onTitleLookDown = this._onTitleLookMove = this._onTitleLookUp = null;
            }
            if (this._onEscKey) document.removeEventListener('keydown', this._onEscKey);
            if (this._onPointerUnlock) {
                document.removeEventListener('pointerlockchange', this._onPointerUnlock);
                this._onPointerUnlock = null;
            }
            if (this._onHelpKey) document.removeEventListener('keydown', this._onHelpKey);
            this._unsurfaceDom();
            this._unsurfaceDomMenus();
            if (this._onTabKey) document.removeEventListener('keydown', this._onTabKey);
            if (this._onMapKey) document.removeEventListener('keydown', this._onMapKey);
            if (this._onActionKey) document.removeEventListener('keydown', this._onActionKey);
            if (this._onMenuHotkey) document.removeEventListener('keydown', this._onMenuHotkey);
            if (this._freeCamActive) this._scene.remove(this._camera);
            if (this._weatherFx)    this._weatherFx.dispose();
            if (this._water)        this._water.dispose();
            if (this._traffic)      this._traffic.dispose();
            if (this._parked)       this._parked.dispose();
            if (this._omega)        this._omega.dispose();
            this._stopCoop();
            if (this._underwaterFx) this._underwaterFx.dispose();
            if (this._skyFx)        this._skyFx.dispose();
            if (this._solomon)      this._solomon.dispose();
            if (this._wheelFx)      this._wheelFx.dispose();
            if (this._bioEnemies)   this._bioEnemies.dispose();
            if (this._crowd)        this._crowd.dispose();
            if (this._interiors)    this._interiors.dispose();
            if (this._followers)    this._followers.dispose();
            this._clearAlongside();
            if (this._drivenModel)  { this._drivenModel.dispose(); this._drivenModel = null; }
            if (this._bridge)       { this._bridge.dispose(); this._bridge = null; }
            if (this._driven2d)     { this._scene.remove(this._driven2d.mesh); this._driven2d.dispose(); this._driven2d = null; }
            if (this._engine)       this._engine.dispose();
            if (this._liminal)      this._liminal.dispose();
            if (this._speedFx)      this._speedFx.dispose();

            // Free the externally-created headlight beam materials + shared
            // texture (parented to _van.group, not tracked by CamperModel).
            if (this._beams) {
                for (const b of this._beams) { if (b.material) b.material.dispose(); }
                this._beams = null;
            }
            if (this._beamTex) { this._beamTex.dispose(); this._beamTex = null; }

            this._fpc.dispose();
            this._terrain.dispose();
            this._van.dispose();
            this._hud.dispose();
            if (this._renderer) {
                // The PIXI texture a fight over this world was drawn on goes
                // with the canvas it was keyed to; leaving it in PIXI's cache
                // would hand the next world a picture of the last one.
                const el = this._renderer.domElement;
                if (el && el._vwBattleTexture) {
                    try { el._vwBattleTexture.destroy(true); } catch (e) { /* already gone */ }
                    el._vwBattleTexture = null;
                }
                // dispose() leaves the WebGL context itself alive. The browser
                // caps live contexts and force-loses the OLDEST past the cap,
                // which is the game's own canvas: PIXI then silently stops
                // rendering and the picture freezes until the game is restarted.
                this._renderer.dispose();
                try {
                    if (this._renderer.forceContextLoss) this._renderer.forceContextLoss();
                } catch (e) { /* context already gone */ }
            }
        }
    }

    // Handed to the rest of the suite.
    Object.assign(VW, {
        VoxelWorldScene
    });
})();
